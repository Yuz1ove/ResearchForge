import type {
  AtomicEvidenceSectionType,
  EvidenceAccessTier,
} from "@workspace/api-zod/research-grounding";

/**
 * A deliberately small boundary object between content extraction and atomic
 * fact construction.  It keeps section semantics, provenance, and competing
 * versions of a result intact before the report planner sees the evidence.
 */
export interface EvidenceResolutionCandidate {
  evidenceId: string;
  sourceId: string;
  canonicalSourceId: string;
  text: string;
  /** Stable semantic identity supplied by claim extraction when available. */
  claimKey?: string | null;
  /** A coarser fallback identity, for example `sleep_duration:mortality`. */
  conceptKey?: string | null;
  material: "full_text" | "abstract" | "metadata";
  accessTier?: EvidenceAccessTier | null;
  extractionStatus?: string | null;
  sectionHeading?: string | null;
  sourceLocation?: string | null;
  locator?: EvidenceLocator | string | null;
  confidence: number;
  numericalResult?: EvidenceNumericalResult | null;
  fullTextComplete?: boolean;
  structuredFullText?: boolean;
  abstractComplete?: boolean;
}

export interface EvidenceLocator {
  page?: number | null;
  sectionHeading?: string | null;
  chunkId?: string | null;
  sourceLocation?: string | null;
  charStart?: number | null;
  charEnd?: number | null;
}

export interface EvidenceNumericalResult {
  measure?: string | null;
  statisticType?: string | null;
  value: number;
  unit?: string | null;
  lowerCI?: number | null;
  upperCI?: number | null;
  pValue?: number | null;
}

export type EvidenceVerificationStatus =
  | "verified"
  | "unverified"
  | "conflicted";

export interface ResolvedEvidence extends EvidenceResolutionCandidate {
  accessTier: EvidenceAccessTier;
  sectionType: AtomicEvidenceSectionType;
  verificationStatus: EvidenceVerificationStatus;
  confidence: number;
  duplicateEvidenceIds: string[];
}

export interface EvidenceConflictRecord {
  conflictId: string;
  canonicalSourceId: string;
  claimKey: string;
  kind: "abstract_full_text_numeric_mismatch" | "within_source_numeric_mismatch";
  selectedEvidenceId: string;
  conflictingEvidenceIds: string[];
  selectedResult: EvidenceNumericalResult;
  conflictingResults: Array<{
    evidenceId: string;
    material: EvidenceResolutionCandidate["material"];
    result: EvidenceNumericalResult;
  }>;
  confidencePenalty: number;
  resolution: "prefer_verifiable_full_text" | "prefer_more_verifiable_evidence";
}

export interface RejectedEvidenceCandidate {
  evidenceId: string;
  sourceId: string;
  canonicalSourceId: string;
  reason:
    | "failed_extraction"
    | "empty_evidence_text"
    | "bibliographic_only"
    | "invalid_confidence"
    | "invalid_numerical_result";
}

export interface EvidenceResolutionResult {
  evidence: ResolvedEvidence[];
  conflicts: EvidenceConflictRecord[];
  rejected: RejectedEvidenceCandidate[];
}

const ACCESS_TIERS = new Set<EvidenceAccessTier>([
  "complete_full_text",
  "structured_full_text",
  "verifiable_full_text_excerpt",
  "complete_abstract",
  "partial_abstract",
  "bibliographic_only",
]);

const EXTRACTION_FAILURES = new Set([
  "failed",
  "failed_extraction",
  "extraction_failed",
  "extraction_unavailable_no_parser",
]);

const RESULTS_SECTIONS = new Set<AtomicEvidenceSectionType>([
  "primary_results",
  "secondary_results",
  "sensitivity_analysis",
]);

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function normalizedHeading(value: string | null | undefined): string {
  return compact(value)
    .replace(/^\s*(?:section\s+)?\d+(?:\.\d+)*[.):\-\s]*/iu, "")
    .replace(/[\s_:;,.\-\u2013\u2014]+/gu, " ")
    .toLowerCase();
}

/**
 * Classifies the declared source section, never the rhetorical wording of the
 * evidence sentence.  This is conservative by design: a Discussion paragraph
 * that says "we found" remains Discussion rather than becoming a result.
 */
export function classifyEvidenceSection(input: {
  sectionHeading?: string | null;
  sourceLocation?: string | null;
}): AtomicEvidenceSectionType {
  const heading = normalizedHeading(input.sectionHeading);
  const location = normalizedHeading(input.sourceLocation);
  const semanticLabel = heading || location;
  if (!semanticLabel) return "unknown";

  if (/\babstract\b|\bsummary\b|\u6458\u8981/iu.test(semanticLabel)) return "abstract";
  // Combined Results/Discussion sections are interpretation-bearing and must
  // not be promoted to primary results without a more precise locator.
  if (
    /\bdiscussion\b|\binterpretation\b|\u8a0e\u8ad6|\u89e3\u91cb/iu.test(semanticLabel)
  ) {
    if (/\bmechanis(?:m|tic)\b|\bpathway\b|\u6a5f\u5236|\u8def\u5f91/iu.test(semanticLabel)) {
      return "mechanism_interpretation";
    }
    return "discussion";
  }
  if (/\blimitation(?:s)?\b|\bstrengths? and limitations?\b|\u9650\u5236|\u5c40\u9650/iu.test(semanticLabel)) {
    return "limitations";
  }
  if (/\bconclusions?\b|\bconcluding remarks?\b|\u7d50\u8ad6/iu.test(semanticLabel)) {
    return "conclusion";
  }
  if (/\bsensitivity\b|\brobustness\b|\u654f\u611f\u5ea6|\u7a69\u5065\u6027/iu.test(semanticLabel)) {
    return "sensitivity_analysis";
  }
  if (/\bsecondary results?\b|\badditional results?\b|\u6b21\u8981\u7d50\u679c|\u9644\u52a0\u7d50\u679c/iu.test(semanticLabel)) {
    return "secondary_results";
  }
  if (/\bresults?\b|\bfindings?\b|\u7d50\u679c|\u7814\u7a76\u767c\u73fe/iu.test(semanticLabel)) {
    return "primary_results";
  }
  if (/\bstatistical (?:analysis|methods?)\b|\bdata analysis\b|\u7d71\u8a08\u5206\u6790|\u8cc7\u6599\u5206\u6790/iu.test(semanticLabel)) {
    return "statistical_methods";
  }
  if (/\beligibility\b|\binclusion criteria\b|\bexclusion criteria\b|\u7d0d\u5165\u6a19\u6e96|\u6392\u9664\u6a19\u6e96/iu.test(semanticLabel)) {
    return "eligibility";
  }
  if (/\bparticipants?\b|\bpopulation\b|\bsample\b|\bsetting\b|\u6a23\u672c|\u7814\u7a76\u5834\u57df|\u53c3\u8207\u8005/iu.test(semanticLabel)) {
    return "sample_and_setting";
  }
  if (/\bexposure\b|\bintervention\b|\btreatment\b|\u66b4\u9732|\u4ecb\u5165|\u8655\u7f6e/iu.test(semanticLabel)) {
    return "exposure";
  }
  if (/\boutcomes?\b|\bendpoints?\b|\u7d50\u5c40|\u7d42\u9ede/iu.test(semanticLabel)) {
    return "outcome";
  }
  if (/\bmeasurement\b|\bmeasures?\b|\binstruments?\b|\u6e2c\u91cf|\u5de5\u5177/iu.test(semanticLabel)) {
    return "measurement";
  }
  if (/\bmethods?\b|\bmethodology\b|\bstudy design\b|\u65b9\u6cd5|\u7814\u7a76\u8a2d\u8a08/iu.test(semanticLabel)) {
    return "study_design";
  }
  if (/\bresearch questions?\b|\bobjectives?\b|\baims?\b|\u7814\u7a76\u554f\u984c|\u7814\u7a76\u76ee\u7684/iu.test(semanticLabel)) {
    return "research_question";
  }
  if (/\bintroduction\b|\bbackground\b|\bliterature review\b|\u7dd2\u8ad6|\u80cc\u666f|\u6587\u737b\u56de\u9867/iu.test(semanticLabel)) {
    return "background";
  }
  return "unknown";
}

function hasStructuredLocator(candidate: EvidenceResolutionCandidate): boolean {
  if (typeof candidate.locator === "string") return compact(candidate.locator).length > 0;
  const locator = candidate.locator;
  if (locator) {
    if (typeof locator.page === "number" && Number.isInteger(locator.page) && locator.page > 0) {
      return true;
    }
    if (compact(locator.chunkId) || compact(locator.sourceLocation)) return true;
    if (
      typeof locator.charStart === "number" &&
      typeof locator.charEnd === "number" &&
      locator.charStart >= 0 &&
      locator.charEnd > locator.charStart
    ) {
      return true;
    }
    if (compact(locator.sectionHeading) && candidate.material === "abstract") return true;
  }
  return false;
}

export function classifyEvidenceAccess(
  candidate: EvidenceResolutionCandidate,
): EvidenceAccessTier {
  if (candidate.accessTier && ACCESS_TIERS.has(candidate.accessTier)) {
    return candidate.accessTier;
  }
  const status = compact(candidate.extractionStatus).toLowerCase();
  if (EXTRACTION_FAILURES.has(status) || candidate.material === "metadata") {
    return "bibliographic_only";
  }
  if (candidate.material === "full_text") {
    if (candidate.fullTextComplete) return "complete_full_text";
    if (candidate.structuredFullText || compact(candidate.sectionHeading)) {
      return "structured_full_text";
    }
    return hasStructuredLocator(candidate)
      ? "verifiable_full_text_excerpt"
      : "bibliographic_only";
  }
  // Completeness must be asserted by the provider/extractor; silence is not
  // enough to upgrade a possibly truncated abstract.
  return candidate.abstractComplete === true ? "complete_abstract" : "partial_abstract";
}

function isFiniteNumericalResult(
  result: EvidenceNumericalResult | null | undefined,
): boolean {
  if (!result) return true;
  if (!Number.isFinite(result.value)) return false;
  if (result.lowerCI != null && !Number.isFinite(result.lowerCI)) return false;
  if (result.upperCI != null && !Number.isFinite(result.upperCI)) return false;
  if (result.pValue != null && (!Number.isFinite(result.pValue) || result.pValue < 0 || result.pValue > 1)) {
    return false;
  }
  return true;
}

function rejectionReason(
  candidate: EvidenceResolutionCandidate,
): RejectedEvidenceCandidate["reason"] | null {
  const status = compact(candidate.extractionStatus).toLowerCase();
  if (EXTRACTION_FAILURES.has(status)) return "failed_extraction";
  if (!compact(candidate.text)) return "empty_evidence_text";
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) {
    return "invalid_confidence";
  }
  if (!isFiniteNumericalResult(candidate.numericalResult)) return "invalid_numerical_result";
  if (classifyEvidenceAccess(candidate) === "bibliographic_only") return "bibliographic_only";
  return null;
}

function normalizeIdentity(value: string | null | undefined): string {
  return compact(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\b(?:p|n)\s*[<=>]\s*\d+(?:\.\d+)?\b/giu, " ")
    .replace(/[+\-]?\d+(?:\.\d+)?%?/gu, "#")
    .replace(/[^\p{L}\p{N}#]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function semanticClaimKey(candidate: EvidenceResolutionCandidate): string {
  return (
    normalizeIdentity(candidate.claimKey) ||
    normalizeIdentity(candidate.conceptKey) ||
    normalizeIdentity(candidate.text) ||
    candidate.evidenceId
  );
}

function numericValueKey(result: EvidenceNumericalResult): string {
  return [
    normalizeIdentity(result.measure),
    normalizeIdentity(result.statisticType),
    result.value.toPrecision(12),
    normalizeIdentity(result.unit),
    result.lowerCI == null ? "" : result.lowerCI.toPrecision(12),
    result.upperCI == null ? "" : result.upperCI.toPrecision(12),
    result.pValue == null ? "" : result.pValue.toPrecision(12),
  ].join("|");
}

function numericalResultsConflict(
  left: EvidenceNumericalResult,
  right: EvidenceNumericalResult,
): boolean {
  const leftMeasure = normalizeIdentity(left.measure);
  const rightMeasure = normalizeIdentity(right.measure);
  const leftStatistic = normalizeIdentity(left.statisticType);
  const rightStatistic = normalizeIdentity(right.statisticType);
  if (leftMeasure && rightMeasure && leftMeasure !== rightMeasure) return false;
  if (leftStatistic && rightStatistic && leftStatistic !== rightStatistic) return false;
  return numericValueKey(left) !== numericValueKey(right);
}

function initialVerificationStatus(
  candidate: EvidenceResolutionCandidate,
): EvidenceVerificationStatus {
  // Numerical claims always need an inspectable locator.  A source-level DOI
  // alone is provenance, not a locator for the reported number.
  if (candidate.numericalResult && !hasStructuredLocator(candidate)) return "unverified";
  return hasStructuredLocator(candidate) ? "verified" : "unverified";
}

function candidatePriority(candidate: ResolvedEvidence): number {
  const verified = candidate.verificationStatus === "verified" ? 1_000 : 0;
  const resultSection = RESULTS_SECTIONS.has(candidate.sectionType) ? 300 : 0;
  const fullText = candidate.material === "full_text" ? 200 : candidate.material === "abstract" ? 50 : 0;
  const accessRank: Record<EvidenceAccessTier, number> = {
    complete_full_text: 60,
    structured_full_text: 50,
    verifiable_full_text_excerpt: 40,
    complete_abstract: 30,
    partial_abstract: 20,
    bibliographic_only: 0,
  };
  return verified + resultSection + fullText + accessRank[candidate.accessTier] + candidate.confidence;
}

function conflictId(canonicalSourceId: string, claimKey: string, evidenceIds: string[]): string {
  const safeKey = normalizeIdentity(claimKey).replace(/\s+/gu, "-").slice(0, 48) || "claim";
  return `conflict:${normalizeIdentity(canonicalSourceId)}:${safeKey}:${evidenceIds.sort().join("+")}`;
}

function conflictKind(candidates: ResolvedEvidence[]): EvidenceConflictRecord["kind"] {
  const materials = new Set(candidates.map((candidate) => candidate.material));
  return materials.has("abstract") && materials.has("full_text")
    ? "abstract_full_text_numeric_mismatch"
    : "within_source_numeric_mismatch";
}

/**
 * Resolves abstract/full-text duplicates before fact construction.  The return
 * value intentionally contains both the selected evidence and any conflict
 * ledger entry, so a preferred full-text result never erases disagreement.
 */
export function resolveEvidenceCandidates(
  candidates: EvidenceResolutionCandidate[],
): EvidenceResolutionResult {
  const rejected: RejectedEvidenceCandidate[] = [];
  const eligible: ResolvedEvidence[] = [];

  for (const candidate of candidates) {
    const reason = rejectionReason(candidate);
    if (reason) {
      rejected.push({
        evidenceId: candidate.evidenceId,
        sourceId: candidate.sourceId,
        canonicalSourceId: candidate.canonicalSourceId,
        reason,
      });
      continue;
    }
    eligible.push({
      ...candidate,
      text: compact(candidate.text),
      accessTier: classifyEvidenceAccess(candidate),
      sectionType: classifyEvidenceSection(candidate),
      confidence: Math.max(0, Math.min(1, candidate.confidence)),
      verificationStatus: initialVerificationStatus(candidate),
      duplicateEvidenceIds: [],
    });
  }

  const groups = new Map<string, ResolvedEvidence[]>();
  for (const candidate of eligible) {
    const key = `${normalizeIdentity(candidate.canonicalSourceId)}::${semanticClaimKey(candidate)}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  const evidence: ResolvedEvidence[] = [];
  const conflicts: EvidenceConflictRecord[] = [];
  for (const group of groups.values()) {
    const ranked = [...group].sort((left, right) => {
      const delta = candidatePriority(right) - candidatePriority(left);
      return delta || left.evidenceId.localeCompare(right.evidenceId);
    });
    const selected = ranked[0]!;
    const selectedResult = selected.numericalResult;
    const conflicting = selectedResult
      ? ranked.slice(1).filter((candidate) =>
          candidate.numericalResult
            ? numericalResultsConflict(selectedResult, candidate.numericalResult)
            : false,
        )
      : [];

    if (selectedResult && conflicting.length > 0) {
      const penalty = 0.25;
      selected.confidence = Math.max(0.05, selected.confidence - penalty);
      selected.verificationStatus = "conflicted";
      conflicts.push({
        conflictId: conflictId(
          selected.canonicalSourceId,
          semanticClaimKey(selected),
          [selected.evidenceId, ...conflicting.map((candidate) => candidate.evidenceId)],
        ),
        canonicalSourceId: selected.canonicalSourceId,
        claimKey: semanticClaimKey(selected),
        kind: conflictKind([selected, ...conflicting]),
        selectedEvidenceId: selected.evidenceId,
        conflictingEvidenceIds: conflicting.map((candidate) => candidate.evidenceId),
        selectedResult,
        conflictingResults: conflicting.map((candidate) => ({
          evidenceId: candidate.evidenceId,
          material: candidate.material,
          result: candidate.numericalResult!,
        })),
        confidencePenalty: penalty,
        resolution:
          selected.material === "full_text" &&
          selected.verificationStatus === "conflicted" &&
          RESULTS_SECTIONS.has(selected.sectionType) &&
          hasStructuredLocator(selected)
            ? "prefer_verifiable_full_text"
            : "prefer_more_verifiable_evidence",
      });
    }

    selected.duplicateEvidenceIds = ranked
      .slice(1)
      .filter((candidate) => !conflicting.includes(candidate))
      .map((candidate) => candidate.evidenceId);
    evidence.push(selected);
  }

  return {
    evidence: evidence.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
    conflicts: conflicts.sort((left, right) => left.conflictId.localeCompare(right.conflictId)),
    rejected: rejected.sort((left, right) => left.evidenceId.localeCompare(right.evidenceId)),
  };
}
