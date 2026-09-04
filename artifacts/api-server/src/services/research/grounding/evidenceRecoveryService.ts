import { createHash } from "node:crypto";

export const EVIDENCE_RECOVERY_FACETS = [
  "objective",
  "research_question",
  "population",
  "sample",
  "sample_size",
  "study_design",
  "method",
  "exposure",
  "intervention",
  "comparator",
  "measurement",
  "outcome",
  "qualitative_finding",
  "quantitative_finding",
  "effect_size",
  "absolute_value",
  "relative_value",
  "confidence_interval",
  "variance",
  "statistical_significance",
  "uncertainty",
  "subgroup_result",
  "temporal_relationship",
  "mechanism",
  "contextual_interpretation",
  "contradiction",
  "limitation",
  "bias_confounder",
  "generalizability_boundary",
  "author_implication",
] as const;

export type EvidenceRecoveryFacet = (typeof EVIDENCE_RECOVERY_FACETS)[number];

export type EvidenceMaterialType =
  | "metadata"
  | "abstract"
  | "structured_abstract"
  | "full_text"
  | "pdf"
  | "html"
  | "xml"
  | "other";

export interface EvidenceRecoveryMaterial {
  type: EvidenceMaterialType;
  locator: string;
  text: string;
}

export interface EvidenceRecoverySource {
  sourceId: string;
  title: string;
  accepted: boolean;
  doi?: string | null;
  canonicalUrl?: string | null;
  materials: EvidenceRecoveryMaterial[];
}

export interface ExistingRecoveryEvidence {
  evidenceId: string;
  sourceId: string;
  normalizedClaimText: string;
  supportSpans: string[];
  facet?: EvidenceRecoveryFacet;
}

export interface EvidenceRecoveryCandidate {
  sourceId: string;
  normalizedClaimText: string;
  facet: EvidenceRecoveryFacet;
  supports: Array<{
    locator: string;
    exactText: string;
  }>;
  entailmentReviewed: boolean;
  claimType:
    | "finding"
    | "method"
    | "limitation"
    | "definition"
    | "association"
    | "causal"
    | "recommendation"
    | "background";
  usableSections: string[];
  limitations?: string[];
  population?: string;
  setting?: string;
  exposure?: string;
  outcome?: string;
}

export type EvidenceRecoveryRejectionReason =
  | "unknown_source"
  | "source_not_accepted"
  | "missing_claim_text"
  | "missing_support_span"
  | "support_locator_missing"
  | "support_span_not_found"
  | "entailment_not_reviewed"
  | "number_mutation"
  | "semantic_duplicate_existing"
  | "semantic_duplicate_candidate"
  | "source_budget_exceeded";

export interface RecoveredEvidenceCard {
  evidenceId: string;
  claimId: string;
  sourceId: string;
  normalizedClaimText: string;
  originalSourceText: string;
  supportSpans: Array<{
    locator: string;
    exactText: string;
    startOffset: number;
    endOffset: number;
  }>;
  facet: EvidenceRecoveryFacet;
  claimType: EvidenceRecoveryCandidate["claimType"];
  usableSections: string[];
  limitations: string[];
  population?: string;
  setting?: string;
  exposure?: string;
  outcome?: string;
  lineage: {
    sourceId: string;
    evidenceId: string;
    claimId: string;
    stable: true;
    exactSupportVerified: true;
    entailmentReviewed: true;
  };
}

export interface RejectedRecoveryCandidate {
  sourceId: string;
  normalizedClaimText: string;
  facet: EvidenceRecoveryFacet;
  reason: EvidenceRecoveryRejectionReason;
  duplicateOf?: string;
}

export interface EvidenceRecoveryResult {
  accepted: RecoveredEvidenceCard[];
  rejected: RejectedRecoveryCandidate[];
  counts: {
    candidates: number;
    accepted: number;
    rejected: number;
    duplicateCandidates: number;
    unsupportedCandidates: number;
    cappedCandidates: number;
  };
  cardsPerSource: Record<string, number>;
  facetsPerSource: Record<string, EvidenceRecoveryFacet[]>;
}

export interface EvidenceRecoveryOptions {
  maxAddedCardsPerSource?: number;
  semanticDuplicateThreshold?: number;
}

function clean(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function fingerprint(value: string): string {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/\[(?:s|ref)\d+\]/giu, "")
    .replace(/(?:本研究|研究|結果|顯示|指出|發現|報告|的|為|是)/gu, "")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function bigrams(value: string): Set<string> {
  const normalized = fingerprint(value);
  const result = new Set<string>();
  if (normalized.length < 2) {
    if (normalized) result.add(normalized);
    return result;
  }
  for (let index = 0; index < normalized.length - 1; index += 1) {
    result.add(normalized.slice(index, index + 2));
  }
  return result;
}

export function evidenceRecoverySemanticSimilarity(
  left: string,
  right: string,
): number {
  if (!fingerprint(left) || !fingerprint(right)) return 0;
  if (fingerprint(left) === fingerprint(right)) return 1;
  const a = bigrams(left);
  const b = bigrams(right);
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function numericTokens(value: string): string[] {
  return Array.from(
    new Set(
      clean(value)
        .replace(/(?<=\d),(?=\d)/gu, "")
        .replace(/(?<=\d)[–—-](?=\d)/gu, " ")
        .replace(/[−–—]/gu, "-")
        .match(/-?\d+(?:\.\d+)?/gu) ?? [],
    ),
  );
}

function numbersPreserved(
  normalizedClaimText: string,
  supportText: string,
): boolean {
  const claimNumbers = numericTokens(normalizedClaimText);
  if (claimNumbers.length === 0) return true;
  const supportNumbers = new Set(numericTokens(supportText));
  return claimNumbers.every((token) => supportNumbers.has(token));
}

function stableId(prefix: string, values: string[]): string {
  const digest = createHash("sha256")
    .update(values.map(clean).join("\u241f"))
    .digest("hex")
    .slice(0, 20);
  return `${prefix}-${digest}`;
}

function reject(
  candidate: EvidenceRecoveryCandidate,
  reason: EvidenceRecoveryRejectionReason,
  duplicateOf?: string,
): RejectedRecoveryCandidate {
  return {
    sourceId: candidate.sourceId,
    normalizedClaimText: clean(candidate.normalizedClaimText),
    facet: candidate.facet,
    reason,
    ...(duplicateOf ? { duplicateOf } : {}),
  };
}

function duplicateMatch(
  candidate: EvidenceRecoveryCandidate,
  items: Array<{
    id: string;
    claim: string;
    supportSpans: string[];
    facet?: EvidenceRecoveryFacet;
  }>,
  threshold: number,
): { id: string } | null {
  const candidateSupports = candidate.supports.map((support) => support.exactText);
  for (const item of items) {
    const claimSimilarity = evidenceRecoverySemanticSimilarity(
      candidate.normalizedClaimText,
      item.claim,
    );
    const supportSimilarity = Math.max(
      0,
      ...candidateSupports.flatMap((candidateSupport) =>
        item.supportSpans.map((existingSupport) =>
          evidenceRecoverySemanticSimilarity(candidateSupport, existingSupport),
        ),
      ),
    );
    if (
      claimSimilarity >= threshold ||
      (item.facet === candidate.facet &&
        supportSimilarity >= threshold &&
        claimSimilarity >= 0.45)
    ) {
      return { id: item.id };
    }
  }
  return null;
}

/**
 * Validates one curated, bounded recovery pass. Candidate generation is kept
 * separate: callers may use deterministic parsing or one provider call, but
 * no candidate becomes evidence without this exact-span, identity, numeric,
 * semantic-deduplication, lineage, and source-budget gate.
 */
export function validateEvidenceRecoveryCycle(input: {
  sources: EvidenceRecoverySource[];
  existingEvidence: ExistingRecoveryEvidence[];
  candidates: EvidenceRecoveryCandidate[];
  options?: EvidenceRecoveryOptions;
}): EvidenceRecoveryResult {
  const sourceById = new Map(
    input.sources.map((source) => [source.sourceId, source] as const),
  );
  const threshold = Math.max(
    0.5,
    Math.min(1, input.options?.semanticDuplicateThreshold ?? 0.84),
  );
  const perSourceLimit = Math.max(
    1,
    input.options?.maxAddedCardsPerSource ?? 8,
  );
  const accepted: RecoveredEvidenceCard[] = [];
  const rejected: RejectedRecoveryCandidate[] = [];
  const cardsPerSource: Record<string, number> = {};

  const existing = input.existingEvidence.map((item) => ({
    id: item.evidenceId,
    claim: item.normalizedClaimText,
    supportSpans: item.supportSpans,
    facet: item.facet,
  }));

  for (const candidate of input.candidates) {
    const source = sourceById.get(candidate.sourceId);
    if (!source) {
      rejected.push(reject(candidate, "unknown_source"));
      continue;
    }
    if (!source.accepted) {
      rejected.push(reject(candidate, "source_not_accepted"));
      continue;
    }
    if (!clean(candidate.normalizedClaimText)) {
      rejected.push(reject(candidate, "missing_claim_text"));
      continue;
    }
    if (candidate.supports.length === 0 || candidate.supports.some((support) => !clean(support.exactText))) {
      rejected.push(reject(candidate, "missing_support_span"));
      continue;
    }
    if (!candidate.entailmentReviewed) {
      rejected.push(reject(candidate, "entailment_not_reviewed"));
      continue;
    }

    const resolvedSupports: RecoveredEvidenceCard["supportSpans"] = [];
    let supportFailure: EvidenceRecoveryRejectionReason | null = null;
    for (const support of candidate.supports) {
      const material = source.materials.find(
        (item) => clean(item.locator) === clean(support.locator),
      );
      if (!material) {
        supportFailure = "support_locator_missing";
        break;
      }
      const startOffset = material.text.indexOf(support.exactText);
      if (startOffset < 0) {
        supportFailure = "support_span_not_found";
        break;
      }
      resolvedSupports.push({
        locator: support.locator,
        exactText: support.exactText,
        startOffset,
        endOffset: startOffset + support.exactText.length,
      });
    }
    if (supportFailure) {
      rejected.push(reject(candidate, supportFailure));
      continue;
    }
    const combinedSupport = resolvedSupports.map((support) => support.exactText).join(" ");
    if (!numbersPreserved(candidate.normalizedClaimText, combinedSupport)) {
      rejected.push(reject(candidate, "number_mutation"));
      continue;
    }

    const existingDuplicate = duplicateMatch(candidate, existing, threshold);
    if (existingDuplicate) {
      rejected.push(
        reject(candidate, "semantic_duplicate_existing", existingDuplicate.id),
      );
      continue;
    }
    const acceptedDuplicate = duplicateMatch(
      candidate,
      accepted.map((card) => ({
        id: card.evidenceId,
        claim: card.normalizedClaimText,
        supportSpans: card.supportSpans.map((support) => support.exactText),
        facet: card.facet,
      })),
      threshold,
    );
    if (acceptedDuplicate) {
      rejected.push(
        reject(candidate, "semantic_duplicate_candidate", acceptedDuplicate.id),
      );
      continue;
    }
    if ((cardsPerSource[candidate.sourceId] ?? 0) >= perSourceLimit) {
      rejected.push(reject(candidate, "source_budget_exceeded"));
      continue;
    }

    const evidenceId = stableId("evidence-recovery", [
      candidate.sourceId,
      candidate.normalizedClaimText,
      ...resolvedSupports.flatMap((support) => [support.locator, support.exactText]),
    ]);
    const claimId = stableId("claim-recovery", [candidate.sourceId, evidenceId]);
    accepted.push({
      evidenceId,
      claimId,
      sourceId: candidate.sourceId,
      normalizedClaimText: clean(candidate.normalizedClaimText),
      originalSourceText: resolvedSupports.map((support) => support.exactText).join("\n"),
      supportSpans: resolvedSupports,
      facet: candidate.facet,
      claimType: candidate.claimType,
      usableSections: Array.from(new Set(candidate.usableSections.map(clean).filter(Boolean))),
      limitations: Array.from(new Set((candidate.limitations ?? []).map(clean).filter(Boolean))),
      ...(candidate.population ? { population: clean(candidate.population) } : {}),
      ...(candidate.setting ? { setting: clean(candidate.setting) } : {}),
      ...(candidate.exposure ? { exposure: clean(candidate.exposure) } : {}),
      ...(candidate.outcome ? { outcome: clean(candidate.outcome) } : {}),
      lineage: {
        sourceId: candidate.sourceId,
        evidenceId,
        claimId,
        stable: true,
        exactSupportVerified: true,
        entailmentReviewed: true,
      },
    });
    cardsPerSource[candidate.sourceId] =
      (cardsPerSource[candidate.sourceId] ?? 0) + 1;
  }

  const facetsPerSource = Object.fromEntries(
    input.sources.map((source) => [
      source.sourceId,
      Array.from(
        new Set(
          accepted
            .filter((card) => card.sourceId === source.sourceId)
            .map((card) => card.facet),
        ),
      ),
    ]),
  );
  const duplicateCandidates = rejected.filter((item) =>
    item.reason.startsWith("semantic_duplicate_"),
  ).length;
  const cappedCandidates = rejected.filter(
    (item) => item.reason === "source_budget_exceeded",
  ).length;
  const unsupportedCandidates = rejected.length - duplicateCandidates - cappedCandidates;
  return {
    accepted,
    rejected,
    counts: {
      candidates: input.candidates.length,
      accepted: accepted.length,
      rejected: rejected.length,
      duplicateCandidates,
      unsupportedCandidates,
      cappedCandidates,
    },
    cardsPerSource,
    facetsPerSource,
  };
}
