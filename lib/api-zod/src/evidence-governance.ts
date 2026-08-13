export type EvidenceRecommendationBucket =
  | "scholarly_recommended"
  | "official_background"
  | "manual_review"
  | "rejected";

export type EvidenceSectionType =
  | "introduction"
  | "background"
  | "concept_explanation"
  | "research_motivation"
  | "basic_mechanism"
  | "further_questions"
  | "limitations"
  | "glossary"
  | "basic_context"
  | "literature_review"
  | "evidence_synthesis"
  | "methods_context"
  | "results_support"
  | "discussion_claim"
  | "discussion"
  | "conclusion_claim";

export type EvidenceUserDecision =
  | "accepted"
  | "accepted_as_background"
  | "accepted_as_scholarly_evidence"
  | "accepted_as_manual_review"
  | "rejected"
  | "pending";

export interface EvidenceGovernanceCard {
  recommendationBucket?: EvidenceRecommendationBucket | null;
  bucket?: EvidenceRecommendationBucket | null;
  sourceRole?: string | null;
  limitations?: readonly string[] | null;
  limitationsZhTw?: readonly string[] | null;
  acceptedByUser?: boolean | null;
  userDecision?: EvidenceUserDecision | string | null;
  acceptedAs?: string | null;
}

const OFFICIAL_BACKGROUND_SECTIONS = new Set<EvidenceSectionType>([
  "introduction",
  "background",
  "concept_explanation",
  "research_motivation",
  "basic_mechanism",
  "further_questions",
  "limitations",
  "glossary",
  "basic_context",
]);

const SCHOLARLY_RECOMMENDED_SECTIONS = new Set<EvidenceSectionType>([
  "literature_review",
  "methods_context",
  "evidence_synthesis",
  "discussion",
  "discussion_claim",
  "introduction",
  "background",
  "limitations",
  "basic_context",
]);

const SCHOLARLY_CLAIM_SECTIONS = new Set<EvidenceSectionType>([
  "literature_review",
  "evidence_synthesis",
  "methods_context",
  "results_support",
  "discussion_claim",
  "conclusion_claim",
]);

const NON_PEER_REVIEW_LIMITATION_PATTERNS = [
  /非同行評審論文/u,
  /\bno peer review\b/i,
  /\bnot peer[-\s]?reviewed\b/i,
  /\bofficial explainer only\b/i,
];

function bucketForCard(card: EvidenceGovernanceCard): EvidenceRecommendationBucket {
  return card.recommendationBucket ?? card.bucket ?? "manual_review";
}

function sourceRoleForCard(card: EvidenceGovernanceCard): string {
  return card.sourceRole?.trim() ?? "";
}

function sourceRoleSupportsScholarlyClaim(card: EvidenceGovernanceCard): boolean {
  return /^(academic_evidence|core_scholarly_evidence|official_statistics|professional_guidance|data_or_dataset|statistics_or_dataset)$/.test(
    sourceRoleForCard(card),
  );
}

function sourceRoleIsBackgroundOnly(card: EvidenceGovernanceCard): boolean {
  return /^(background_definition|definition_or_concept|official_background_explanation|teaching_or_public_explainer|case_or_news)$/.test(
    sourceRoleForCard(card),
  );
}

export function evidenceCardHasNonPeerReviewedLimitation(
  card: EvidenceGovernanceCard,
): boolean {
  const limitations = [...(card.limitations ?? []), ...(card.limitationsZhTw ?? [])];
  return limitations.some((limitation) =>
    NON_PEER_REVIEW_LIMITATION_PATTERNS.some((pattern) => pattern.test(limitation)),
  );
}

export function evidenceSectionSupportsScholarlyClaim(
  sectionType: EvidenceSectionType,
): boolean {
  return SCHOLARLY_CLAIM_SECTIONS.has(sectionType);
}

export function evidenceCardHasUserAcceptance(card: EvidenceGovernanceCard): boolean {
  if (card.acceptedByUser === true) return true;
  const decision = card.userDecision?.trim();
  if (
    decision === "accepted" ||
    decision === "accepted_as_background" ||
    decision === "accepted_as_scholarly_evidence" ||
    decision === "accepted_as_manual_review"
  ) {
    return true;
  }
  return Boolean(card.acceptedAs?.trim());
}

export function canUseEvidenceCardForSection(
  card: EvidenceGovernanceCard,
  sectionType: EvidenceSectionType,
): boolean {
  const bucket = bucketForCard(card);
  if (bucket === "rejected") return false;
  if (
    evidenceSectionSupportsScholarlyClaim(sectionType) &&
    sourceRoleSupportsScholarlyClaim(card)
  ) {
    return !evidenceCardHasNonPeerReviewedLimitation(card);
  }
  if (
    evidenceSectionSupportsScholarlyClaim(sectionType) &&
    sourceRoleIsBackgroundOnly(card)
  ) {
    return false;
  }
  if (
    evidenceSectionSupportsScholarlyClaim(sectionType) &&
    evidenceCardHasNonPeerReviewedLimitation(card)
  ) {
    return false;
  }
  if (bucket === "official_background") {
    return OFFICIAL_BACKGROUND_SECTIONS.has(sectionType);
  }
  if (bucket === "scholarly_recommended") {
    return SCHOLARLY_RECOMMENDED_SECTIONS.has(sectionType);
  }
  if (bucket === "manual_review") {
    return evidenceCardHasUserAcceptance(card);
  }
  return false;
}
