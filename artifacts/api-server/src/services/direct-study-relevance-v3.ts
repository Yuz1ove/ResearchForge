export const DIRECT_STUDY_REJECTION_REASONS = [
  "TOPIC_MISMATCH",
  "POPULATION_MISMATCH",
  "EXPOSURE_MISMATCH",
  "OUTCOME_MISMATCH",
  "NOT_EMPIRICAL",
  "DUPLICATE_STUDY",
  "NO_CANDIDATES",
] as const;

export type DirectStudyRejectionReason = (typeof DIRECT_STUDY_REJECTION_REASONS)[number];
export type DirectStudyGapRootCause = "QUERY_PLAN_FAILURE" | "CLASSIFIER_FALSE_NEGATIVE" | "NO_DIRECT_EVIDENCE_IDENTIFIED";

export interface DirectStudyCandidateAuditInput {
  sourceId?: string;
  title?: string;
  doi?: string | null;
  sourceKind?: string | null;
  sourceType?: string | null;
  formalEvidenceRole?: string | null;
  topicIntegrityAssessment?: {
    acceptedForCanonicalEvidence?: boolean;
    sourceRole?: string | null;
    evidenceEntailment?: {
      populationMatch?: string | boolean | null;
      interventionExposureMatch?: boolean | null;
      outcomeMatch?: boolean | null;
      relationship?: string | null;
      rejectionReason?: string | null;
    } | null;
    hardExclusion?: { excluded?: boolean; reasons?: string[] } | null;
  } | null;
}

export interface DirectStudyCandidateAudit {
  sourceId: string;
  title: string;
  canonicalStudyId: string;
  decision: "DIRECT" | "REJECTED";
  reason: "DIRECT_EMPIRICAL_MATCH" | DirectStudyRejectionReason;
  classifierAccepted: boolean;
  evidenceRole: string;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() : "";
}

function canonicalIdentity(candidate: DirectStudyCandidateAuditInput): string {
  const doi = clean(candidate.doi).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").replace(/^doi:\s*/iu, "").toLocaleLowerCase();
  return doi || clean(candidate.title).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() || clean(candidate.sourceId);
}

function nonEmpirical(candidate: DirectStudyCandidateAuditInput): boolean {
  const kind = `${clean(candidate.sourceKind)} ${clean(candidate.sourceType)} ${clean(candidate.title)}`;
  return /editorial|commentary|opinion|news|book review|protocol|perspective|conceptual|framework|position paper|systematic review|scoping review|literature review|narrative review|meta-analysis|\bsurvey of\b|\breview of\b|社論|評論|觀點|文獻回顧|文獻綜述|系統性回顧|系統綜述|統合分析/iu.test(kind);
}

function mismatchReason(candidate: DirectStudyCandidateAuditInput): DirectStudyRejectionReason {
  const assessment = candidate.topicIntegrityAssessment;
  const entailment = assessment?.evidenceEntailment;
  const rejection = `${clean(entailment?.rejectionReason)} ${(assessment?.hardExclusion?.reasons ?? []).join(" ")}`;
  if (nonEmpirical(candidate) || assessment?.hardExclusion?.excluded && /non.?empirical|source type|not academic/iu.test(rejection)) return "NOT_EMPIRICAL";
  if (entailment?.populationMatch === false || /population|species|participant|sample|族群|物種|研究對象/iu.test(rejection)) return "POPULATION_MISMATCH";
  if (entailment?.interventionExposureMatch === false || /exposure|intervention|predictor|treatment|暴露|介入|自變項/iu.test(rejection)) return "EXPOSURE_MISMATCH";
  if (entailment?.outcomeMatch === false || /outcome|endpoint|dependent variable|結果|依變項/iu.test(rejection)) return "OUTCOME_MISMATCH";
  return "TOPIC_MISMATCH";
}

export function auditDirectStudyCandidatesV3(candidates: DirectStudyCandidateAuditInput[]): DirectStudyCandidateAudit[] {
  const seen = new Set<string>();
  return candidates.map((candidate) => {
    const canonicalStudyId = canonicalIdentity(candidate);
    const duplicate = Boolean(canonicalStudyId && seen.has(canonicalStudyId));
    if (canonicalStudyId) seen.add(canonicalStudyId);
    const assessment = candidate.topicIntegrityAssessment;
    const evidenceRole = clean(candidate.formalEvidenceRole) || clean(assessment?.sourceRole) || "UNCLASSIFIED";
    const accepted = assessment?.acceptedForCanonicalEvidence === true && /DIRECT_FINDING|direct/iu.test(evidenceRole);
    const reason: DirectStudyCandidateAudit["reason"] = duplicate
      ? "DUPLICATE_STUDY"
      : accepted && !nonEmpirical(candidate)
        ? "DIRECT_EMPIRICAL_MATCH"
        : mismatchReason(candidate);
    return {
      sourceId: clean(candidate.sourceId) || canonicalStudyId || "unknown-source",
      title: clean(candidate.title),
      canonicalStudyId,
      decision: reason === "DIRECT_EMPIRICAL_MATCH" ? "DIRECT" : "REJECTED",
      reason,
      classifierAccepted: accepted,
      evidenceRole,
    };
  });
}

export function diagnoseDirectEvidenceGapV3(input: {
  candidates: DirectStudyCandidateAudit[];
  admittedDirectSourceIds?: string[];
}): { rootCause: DirectStudyGapRootCause; reasonCounts: Record<string, number> } {
  const reasonCounts: Record<string, number> = {};
  if (input.candidates.length === 0) reasonCounts.NO_CANDIDATES = 1;
  for (const candidate of input.candidates) reasonCounts[candidate.reason] = (reasonCounts[candidate.reason] ?? 0) + 1;
  const admitted = new Set(input.admittedDirectSourceIds ?? []);
  const classifierDirect = input.candidates.filter((candidate) => candidate.decision === "DIRECT");
  if (classifierDirect.some((candidate) => admitted.has(candidate.sourceId))) {
    return { rootCause: "NO_DIRECT_EVIDENCE_IDENTIFIED", reasonCounts };
  }
  if (classifierDirect.length > 0) return { rootCause: "CLASSIFIER_FALSE_NEGATIVE", reasonCounts };
  return { rootCause: "QUERY_PLAN_FAILURE", reasonCounts };
}
