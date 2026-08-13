import { createHash } from "node:crypto";
import type {
  WriterEvidenceRejection,
  WriterEvidenceSet,
} from "@workspace/api-zod";

export const WRITER_EVIDENCE_SET_VERSION = "writer-evidence-set/v1";
export const CITATION_REGISTRY_VERSION = "canonical-citation-registry/v1";

export interface CanonicalEvidenceCardLike {
  id: string;
  evidenceId?: string;
  sourceId: string;
  canonicalSourceKey?: string;
  dedupeKey?: string;
  citationKey?: string;
  citationMarker?: string | null;
  claimTextOriginal?: string;
  claimText?: string;
  claimTextZh?: string;
  mainClaimZhTw?: string;
  claim?: string;
  evidence?: string;
  summary?: string;
  supportedByText?: string;
  supportSpan?: string;
  sourceUri?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceDoi?: string;
  sourceAccessLevel?: string | null;
  source_access_level?: string | null;
  contentHash?: string;
  trace?: unknown | null;
  supportSpans?: unknown;
  derivation?: string | null;
  location?: string | null;
  researchSetting?: string | null;
  studyDesign?: string | null;
  dataScope?: string | null;
  exposure?: string | null;
  outcome?: string | null;
  exactResult?: string | null;
  numericResult?: string | null;
  applicability?: string | null;
  locator?: string | null;
  directness?: string | null;
  evidenceDirectnessTier?: string | null;
}

export interface EvidenceRejectionLike {
  id: string;
  sourceId: string | null;
  reason: string;
  diagnostics: string[];
}

function clean(value: string | null | undefined): string {
  return value?.normalize("NFKC").trim() ?? "";
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJsonValue(item)]),
    );
  }
  return typeof value === "string" ? clean(value) : value;
}

export function evidenceIdentity(card: CanonicalEvidenceCardLike): string {
  return clean(card.evidenceId) || clean(card.id);
}

export function canonicalSourceIdentity(card: CanonicalEvidenceCardLike): string {
  return clean(card.canonicalSourceKey) || clean(card.dedupeKey) || clean(card.sourceId);
}

/**
 * Bind the canonical set to the evidence content, not only to its identifier.
 * This makes a same-ID claim/support/provenance mutation invalidate the plan.
 */
export function evidenceFingerprint(card: CanonicalEvidenceCardLike): string {
  const payload = canonicalJsonValue({
    evidenceId: evidenceIdentity(card),
    canonicalSourceId: canonicalSourceIdentity(card),
    citationKey: card.citationKey,
    citationMarker: card.citationMarker,
    claimTextOriginal: card.claimTextOriginal,
    claimText: card.claimText,
    claimTextZh: card.claimTextZh,
    mainClaimZhTw: card.mainClaimZhTw,
    claim: card.claim,
    evidence: card.evidence,
    summary: card.summary,
    supportedByText: card.supportedByText,
    supportSpan: card.supportSpan,
    supportSpans: card.supportSpans,
    sourceUri: card.sourceUri,
    sourceTitle: card.sourceTitle,
    sourceUrl: card.sourceUrl,
    sourceDoi: card.sourceDoi,
    sourceAccessLevel: card.source_access_level ?? card.sourceAccessLevel,
    contentHash: card.contentHash,
    trace: card.trace,
    derivation: card.derivation,
    standardizedFact: {
      location: card.location,
      setting: card.researchSetting,
      design: card.studyDesign,
      dataScope: card.dataScope,
      exposure: card.exposure,
      outcome: card.outcome,
      exactResult: card.exactResult,
      numericResult: card.numericResult,
      applicability: card.applicability,
      locator: card.locator,
      directness: card.directness ?? card.evidenceDirectnessTier,
    },
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function evidenceRejectionReasonCode(reason: string): string {
  const normalized = clean(reason).toLocaleLowerCase();
  if (/low topic relevance/u.test(normalized)) return "low_topic_relevance";
  if (/source_not_accepted/u.test(normalized)) return "source_not_accepted";
  if (/missing_claim_or_support_span/u.test(normalized)) {
    return "missing_claim_or_support_span";
  }
  if (/boilerplate_or_empty_after_cleaning/u.test(normalized)) {
    return "boilerplate_or_empty_after_cleaning";
  }
  if (/support_span_not_found_in_source/u.test(normalized)) {
    return "support_span_not_found_in_source";
  }
  if (/source_title_used_as_claim/u.test(normalized)) {
    return "source_title_used_as_claim";
  }
  return normalized
    .replace(/^rejected\s*:\s*/u, "")
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "") || "evidence_ineligible";
}

function canonicalRejections(
  rejections: EvidenceRejectionLike[],
): WriterEvidenceRejection[] {
  return rejections
    .map((item) => ({
      evidenceCardId: clean(item.id),
      sourceId: clean(item.sourceId) || null,
      reasonCode: evidenceRejectionReasonCode(item.reason),
      diagnostics: uniqueSorted([
        `reason:${clean(item.reason)}`,
        ...item.diagnostics,
      ]),
    }))
    .filter((item) => Boolean(item.evidenceCardId))
    .sort((left, right) =>
      left.evidenceCardId.localeCompare(right.evidenceCardId) ||
      left.reasonCode.localeCompare(right.reasonCode),
    );
}

function evidenceSetHashPayload(input: Omit<WriterEvidenceSet, "evidenceSetHash">) {
  return {
    runId: input.runId,
    canonicalSourceIds: input.canonicalSourceIds,
    eligibleEvidenceCardIds: input.eligibleEvidenceCardIds,
    eligibleEvidenceFingerprints: input.eligibleEvidenceFingerprints,
    rejectedEvidenceCards: input.rejectedEvidenceCards,
    evidenceSetVersion: input.evidenceSetVersion,
    citationRegistryVersion: input.citationRegistryVersion,
  };
}

export function hashWriterEvidenceSet(
  input: Omit<WriterEvidenceSet, "evidenceSetHash">,
): string {
  return createHash("sha256")
    .update(JSON.stringify(evidenceSetHashPayload(input)))
    .digest("hex");
}

export function buildWriterEvidenceSet(input: {
  runId: string;
  eligibleCards: CanonicalEvidenceCardLike[];
  rejectedEvidence: EvidenceRejectionLike[];
}): WriterEvidenceSet {
  const base: Omit<WriterEvidenceSet, "evidenceSetHash"> = {
    runId: clean(input.runId),
    canonicalSourceIds: uniqueSorted(
      input.eligibleCards.map(canonicalSourceIdentity),
    ),
    eligibleEvidenceCardIds: uniqueSorted(
      input.eligibleCards.map(evidenceIdentity),
    ),
    eligibleEvidenceFingerprints: Object.fromEntries(
      [...input.eligibleCards]
        .map((card) => [evidenceIdentity(card), evidenceFingerprint(card)] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    rejectedEvidenceCards: canonicalRejections(input.rejectedEvidence),
    evidenceSetVersion: WRITER_EVIDENCE_SET_VERSION,
    citationRegistryVersion: CITATION_REGISTRY_VERSION,
  };
  return {
    ...base,
    evidenceSetHash: hashWriterEvidenceSet(base),
  };
}

export function writerEvidenceSetsEqual(
  expected: WriterEvidenceSet,
  actual: WriterEvidenceSet,
): boolean {
  return expected.evidenceSetHash === actual.evidenceSetHash &&
    hashWriterEvidenceSet({
      runId: actual.runId,
      canonicalSourceIds: actual.canonicalSourceIds,
      eligibleEvidenceCardIds: actual.eligibleEvidenceCardIds,
      eligibleEvidenceFingerprints: actual.eligibleEvidenceFingerprints,
      rejectedEvidenceCards: actual.rejectedEvidenceCards,
      evidenceSetVersion: actual.evidenceSetVersion,
      citationRegistryVersion: actual.citationRegistryVersion,
    }) === actual.evidenceSetHash;
}
