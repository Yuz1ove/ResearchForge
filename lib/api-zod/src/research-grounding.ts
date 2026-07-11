import { z } from "zod";
import { ParsedResearchInputSchema } from "./research-intent";

export const SourceSearchProfileSchema = z.enum(["quick", "standard", "deep"]);
export type SourceSearchProfile = z.infer<typeof SourceSearchProfileSchema>;

export const TopicCompletenessLevelSchema = z.enum([
  "complete_topic",
  "short_but_searchable",
  "broad_topic",
  "missing_subject_or_variable",
  "nonsense_input",
]);
export type TopicCompletenessLevel = z.infer<typeof TopicCompletenessLevelSchema>;

export const DomainHypothesisSchema = z.object({
  domain: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().trim().min(1)),
  source: z.enum(["rule", "lexicon", "llm", "search_signal"]),
});
export type DomainHypothesis = z.infer<typeof DomainHypothesisSchema>;

export const TopicCompletenessSchema = z.object({
  level: TopicCompletenessLevelSchema,
  score: z.number().min(0).max(1),
  reason: z.string().trim().min(1),
  missingFields: z.array(z.string().trim().min(1)),
  suggestedClarifyingQuestions: z.array(z.string().trim().min(1)),
});
export type TopicCompleteness = z.infer<typeof TopicCompletenessSchema>;

export const TopicAnalysisSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  originalInput: z.string().trim().min(1),
  normalizedTopic: z.string().trim().min(1),
  detectedLanguage: z.enum(["zh", "en", "mixed", "unknown"]),
  isNonsenseInput: z.boolean(),
  topicCompleteness: TopicCompletenessSchema.optional(),
  domainHypotheses: z.array(DomainHypothesisSchema),
  warnings: z.array(z.string().trim().min(1)),
});
export type TopicAnalysis = z.infer<typeof TopicAnalysisSchema>;

export const ResearchSentenceTypeSchema = z.enum([
  "effect_of_x_on_y",
  "comparison",
  "correlation",
  "mechanism",
  "descriptive",
  "broad_topic",
  "unknown",
]);
export type ResearchSentenceType = z.infer<typeof ResearchSentenceTypeSchema>;

export const ResearchTitleSentenceParseSchema = z.object({
  originalText: z.string().trim().min(1),
  normalizedText: z.string().trim().min(1),
  sentenceType: ResearchSentenceTypeSchema,
  subject: z.array(z.string().trim().min(1)),
  independentVariables: z.array(z.string().trim().min(1)),
  dependentVariables: z.array(z.string().trim().min(1)),
  relation: z.array(z.string().trim().min(1)),
  conditions: z.array(z.string().trim().min(1)),
  scope: z.array(z.string().trim().min(1)),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
});
export type ResearchTitleSentenceParse = z.infer<
  typeof ResearchTitleSentenceParseSchema
>;

export const TitleSemanticComparisonSchema = z.object({
  isSemanticallyEquivalent: z.boolean(),
  changedFields: z.array(
    z.enum([
      "subject",
      "independentVariables",
      "dependentVariables",
      "relation",
      "conditions",
      "scope",
    ]),
  ),
  reason: z.string().trim().min(1),
});
export type TitleSemanticComparison = z.infer<
  typeof TitleSemanticComparisonSchema
>;

export const TopicTitleSemanticLockSchema = z.object({
  subject: z.array(z.string().trim().min(1)),
  independentVariables: z.array(z.string().trim().min(1)),
  dependentVariables: z.array(z.string().trim().min(1)),
  relation: z.array(z.string().trim().min(1)),
  scope: z.array(z.string().trim().min(1)),
});
export type TopicTitleSemanticLock = z.infer<typeof TopicTitleSemanticLockSchema>;

export const TopicTitleStateSchema = z.object({
  originalTopic: z.string().trim().min(1),
  polishedTitle: z.string().trim().min(1).optional(),
  acceptedDisplayTitle: z.string().trim().min(1).optional(),
  titlePolishMode: z.enum(["none", "polish_only", "expand"]),
  semanticLock: TopicTitleSemanticLockSchema,
});
export type TopicTitleState = z.infer<typeof TopicTitleStateSchema>;

export const SeedQueryProviderQueriesSchema = z.object({
  openalex: z.array(z.string().trim().min(1)),
  crossref: z.array(z.string().trim().min(1)),
  core: z.array(z.string().trim().min(1)),
  semanticScholar: z.array(z.string().trim().min(1)).optional(),
  web: z.array(z.string().trim().min(1)).optional(),
});
export type SeedQueryProviderQueries = z.infer<
  typeof SeedQueryProviderQueriesSchema
>;

export const SeedQueryPlanSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  normalizedResearchTopic: z
    .object({
      originalQuery: z.string().trim().min(1),
      displayTitle: z.string().trim().min(1),
      zhAcademicQuery: z.array(z.string().trim().min(1)),
      enAcademicQuery: z.array(z.string().trim().min(1)),
      keywordSet: z.array(z.string().trim().min(1)),
      negativeKeywords: z.array(z.string().trim().min(1)),
      broaderAcademicQueries: z.array(z.string().trim().min(1)),
      locale: z.string().trim().min(1),
    })
    .optional(),
  exactQueries: z.array(z.string().trim().min(1)),
  broadQueries: z.array(z.string().trim().min(1)),
  zhQueries: z.array(z.string().trim().min(1)),
  enQueries: z.array(z.string().trim().min(1)),
  providerQueries: SeedQueryProviderQueriesSchema,
  excludedDriftTerms: z.array(z.string().trim().min(1)),
});
export type SeedQueryPlan = z.infer<typeof SeedQueryPlanSchema>;

export const LexicalSignalSchema = z.object({
  originalTerm: z.string().trim().min(1),
  matchedTerm: z.string().trim().min(1),
  language: z.string().trim().min(1),
  source: z.enum([
    "local",
    "wikidata",
    "openalex",
    "cc_cedict",
    "wordnet",
    "mesh",
    "chebi",
    "agrovoc",
  ]),
  aliases: z.array(z.string().trim().min(1)),
  translations: z.array(z.string().trim().min(1)),
  broaderTerms: z.array(z.string().trim().min(1)),
  narrowerTerms: z.array(z.string().trim().min(1)),
  relatedTerms: z.array(z.string().trim().min(1)),
  domainHints: z.array(z.string().trim().min(1)),
  excludedDriftTerms: z.array(z.string().trim().min(1)),
  confidence: z.number().min(0).max(1),
});
export type LexicalSignal = z.infer<typeof LexicalSignalSchema>;

export const QueryIntentSchema = z.object({
  query: z.string().trim().min(1),
  intent: z.enum([
    "exact",
    "broad",
    "translation",
    "domain",
    "education",
    "fallback",
  ]),
  expectedSourceTypes: z.array(z.string().trim().min(1)),
});
export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export const ConceptGroupSchema = z.object({
  name: z.string().trim().min(1),
  zhTerms: z.array(z.string().trim().min(1)),
  enTerms: z.array(z.string().trim().min(1)),
  weight: z.number().min(0),
});
export type ConceptGroup = z.infer<typeof ConceptGroupSchema>;

export const GroundingQueryPlanSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  originalQuery: z.string().trim().min(1).optional(),
  primaryQueries: z.array(z.string().trim().min(1)),
  secondaryQueries: z.array(z.string().trim().min(1)),
  zhCoreQueries: z.array(z.string().trim().min(1)).optional(),
  enCoreQueries: z.array(z.string().trim().min(1)).optional(),
  enAcademicQueries: z.array(z.string().trim().min(1)).optional(),
  broadFallbackQueries: z.array(z.string().trim().min(1)).optional(),
  bilingualQueries: z.object({
    zh: z.array(z.string().trim().min(1)),
    en: z.array(z.string().trim().min(1)),
  }),
  providerQueries: SeedQueryProviderQueriesSchema,
  excludedDriftTerms: z.array(z.string().trim().min(1)),
  excludedConcepts: z.array(z.string().trim().min(1)).optional(),
  conceptGroups: z.array(ConceptGroupSchema).optional(),
  domain: z.string().trim().min(1).nullable().optional(),
  intent: z.string().trim().min(1).nullable().optional(),
  queryIntents: z.array(QueryIntentSchema),
});
export type GroundingQueryPlan = z.infer<typeof GroundingQueryPlanSchema>;

export const AcademicSafetyReviewSchema = z.object({
  academicIntent: z.boolean(),
  topicRiskLevel: z.enum(["low", "medium", "high"]),
  allowedUse: z.enum([
    "normal_research",
    "restricted_academic_summary",
    "redirect_to_prevention_or_policy",
    "block_actionable_output",
  ]),
  riskCategories: z.array(
    z.enum([
      "crime",
      "drugs",
      "sexual_content",
      "violence",
      "self_harm",
      "medical",
      "weapons",
      "privacy",
    ]),
  ),
  prohibitedOutput: z.array(z.string().trim().min(1)),
  allowedOutput: z.array(z.string().trim().min(1)),
  userFacingNotice: z.string().trim().min(1).optional(),
});
export type AcademicSafetyReview = z.infer<typeof AcademicSafetyReviewSchema>;

export const SourceRecommendationBucketSchema = z.enum([
  "scholarly_recommended",
  "official_background",
  "manual_review",
  "rejected",
]);
export type SourceRecommendationBucket = z.infer<
  typeof SourceRecommendationBucketSchema
>;

export const SourceResearchBucketSchema = z.enum([
  "terminology_usage",
  "taxonomy_distinction",
  "naming_history",
  "general_background",
  "archaeology_history_culture",
  "biomedical",
  "oral_biofilm_formation",
  "plaque_control_treatment",
  "periodontal_context",
  "official_medical_background",
  "canine_resource_guarding_behavior",
  "behavior_modification_training",
  "veterinary_behavior_background",
  "physics_atmospheric_optics",
  "general_academic",
  "off_topic",
]);
export type SourceResearchBucket = z.infer<typeof SourceResearchBucketSchema>;

export const SourceUseCaseSchema = z.enum([
  "academic_claim",
  "background_context",
  "manual_review_only",
  "rejected",
]);
export type SourceUseCase = z.infer<typeof SourceUseCaseSchema>;

export const SourceRoleSchema = z.enum([
  "background_definition",
  "academic_evidence",
  "official_statistics",
  "professional_guidance",
  "case_or_news",
  "data_or_dataset",
  "core_scholarly_evidence",
  "official_background_explanation",
  "definition_or_concept",
  "statistics_or_dataset",
  "teaching_or_public_explainer",
  "weak_or_uncertain",
  "rejected",
]);
export type SourceRole = z.infer<typeof SourceRoleSchema>;

export const SourceRetrievalModeSchema = z.enum([
  "live_provider",
  "stale_cache",
  "trusted_seed",
  "user_import",
  "manual_url",
  "supplemental_fulltext_or_repository",
]);
export type SourceRetrievalMode = z.infer<typeof SourceRetrievalModeSchema>;

export const SourceInstitutionTypeSchema = z.enum([
  "government_agency",
  "space_agency",
  "university",
  "scientific_institution",
  "international_organization",
  "commercial",
  "media",
  "unknown",
]);
export type SourceInstitutionType = z.infer<
  typeof SourceInstitutionTypeSchema
>;

export const ProviderHealthSchema = z.object({
  provider: z.enum(["openalex", "crossref", "semantic_scholar", "core"]),
  status: z.enum(["healthy", "degraded", "down", "disabled"]),
  lastSuccessAt: z.string().trim().min(1).optional(),
  lastFailureAt: z.string().trim().min(1).optional(),
  recentFailureCount: z.number().int().min(0),
  recentTimeoutCount: z.number().int().min(0),
  rollingLatencyP50: z.number().min(0).optional(),
  rollingLatencyP95: z.number().min(0).optional(),
  cooldownUntil: z.string().trim().min(1).optional(),
  lastErrorCode: z.string().trim().min(1).optional(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const SourceContentAccessLevelSchema = z.enum([
  "full_text",
  "abstract_only",
  "metadata_only",
  "blocked_or_paywalled",
  "failed_extraction",
]);
export type SourceContentAccessLevel = z.infer<typeof SourceContentAccessLevelSchema>;

export const SourceContentExtractionStatusSchema = z.enum([
  "success",
  "partial",
  "failed",
  "skipped",
  "text_extracted",
  "grobid_extracted",
  "ocr_extracted",
  "metadata_only",
  "extraction_failed",
  "extraction_skipped_license",
  "extraction_skipped_no_full_text",
  "extraction_unavailable_no_parser",
]);
export type SourceContentExtractionStatus = z.infer<typeof SourceContentExtractionStatusSchema>;

export const SourceContentExtractionMethodSchema = z.enum([
  "html_readability",
  "pdf_parser",
  "grobid",
  "abstract_only",
  "metadata_only",
  "pdf_text",
  "ocr",
  "html",
  "abstract",
  "failed",
]);
export type SourceContentExtractionMethod = z.infer<typeof SourceContentExtractionMethodSchema>;

export const ClaimTypeSchema = z.enum([
  "definition",
  "mechanism",
  "finding",
  "statistic",
  "comparison",
  "limitation",
  "method",
  "background",
]);
export type ClaimType = z.infer<typeof ClaimTypeSchema>;

export const ClaimUsableSectionSchema = z.enum([
  "background",
  "literature_review",
  "method",
  "analysis",
  "discussion",
  "limitation",
]);
export type ClaimUsableSection = z.infer<typeof ClaimUsableSectionSchema>;

export const ClaimExtractionModeSchema = z.enum([
  "llm",
  "rule_fallback",
  "metadata_only",
]);
export type ClaimExtractionMode = z.infer<typeof ClaimExtractionModeSchema>;

export const ClaimCandidateStatusSchema = z.enum([
  "accepted",
  "needs_review",
  "rejected",
]);
export type ClaimCandidateStatus = z.infer<typeof ClaimCandidateStatusSchema>;

const ExtractedChunkSchema = z.object({
  chunk_id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  source_location: z.string().trim().min(1),
  section_heading: z.string().trim().min(1).optional(),
  page: z.number().int().optional(),
  char_start: z.number().int().min(0).optional(),
  char_end: z.number().int().min(0).optional(),
});

export const ClaimCandidateSchema = z.object({
  claimId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  chunkId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1).optional(),
  jobId: z.string().trim().min(1).optional(),
  claimTextOriginal: z.string().trim().min(1),
  claimTextZhTw: z.string().trim().min(1),
  claimType: ClaimTypeSchema,
  supportSpanText: z.string().trim().min(1).optional(),
  supportSpanStartOffset: z.number().int().min(0).optional(),
  supportSpanEndOffset: z.number().int().min(0).optional(),
  pageStart: z.number().int().optional(),
  pageEnd: z.number().int().optional(),
  sectionHeading: z.string().trim().min(1).optional(),
  citationMarker: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  relevanceToTopic: z.number().min(0).max(1),
  sourceQualityScore: z.number().min(0).max(1).optional(),
  usableSections: z.array(ClaimUsableSectionSchema),
  limitations: z.array(z.string().trim().min(1)),
  extractionMode: ClaimExtractionModeSchema,
  status: ClaimCandidateStatusSchema,
  rejectionReason: z.string().trim().min(1).optional(),
  modelProvider: z.string().trim().min(1).optional(),
  modelName: z.string().trim().min(1).optional(),
  modelVersion: z.string().trim().min(1).optional(),
  createdAt: z.string().trim().min(1),
});
export type ClaimCandidate = z.infer<typeof ClaimCandidateSchema>;

export const SourceCandidateSchema = z.object({
  sourceId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  queryUsed: z.string().trim().min(1),
  queryIntent: z.string().trim().min(1),
  provider: z.enum([
    "openalex",
    "crossref",
    "core",
    "semanticScholar",
    "web",
    "manual",
  ]),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)).optional(),
  year: z.number().int().optional(),
  venue: z.string().trim().min(1).optional(),
  doi: z.string().trim().min(1).optional(),
  url: z.string().trim().min(1).optional(),
  abstract: z.string().trim().min(1).optional(),
  abstractOriginal: z.string().trim().min(1).optional(),
  abstractZh: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  sourceType: z.enum(["paper", "review", "education", "official", "web", "unknown"]).optional(),
  sourceKind: z.string().trim().min(1).optional(),
  institutionType: SourceInstitutionTypeSchema.optional(),
  isPeerReviewed: z.boolean().optional(),
  hasDoi: z.boolean().optional(),
  isAcademic: z.boolean().optional(),
  isOfficialBackground: z.boolean().optional(),
  usableAsEvidence: z.boolean().optional(),
  usableAsBackground: z.boolean().optional(),
  governanceReason: z.string().trim().min(1).optional(),
  retryRound: z.number().int().min(0).optional(),
  isOpenAccess: z.boolean().optional(),
  fullTextUrl: z.string().trim().min(1).optional(),
  accessLevel: SourceContentAccessLevelSchema.optional(),
  readableUrl: z.string().trim().min(1).optional(),
  extractionStatus: SourceContentExtractionStatusSchema.optional(),
  extractionMethod: SourceContentExtractionMethodSchema.optional(),
  extractionMode: z
    .enum(["pdf_text", "grobid", "ocr", "html", "abstract", "metadata_only", "failed"])
    .optional(),
  pageCount: z.number().int().min(0).optional(),
  extractedPageCount: z.number().int().min(0).optional(),
  isScanned: z.boolean().optional(),
  failureReason: z.string().trim().min(1).optional(),
  userFacingMessage: z.string().trim().min(1).optional(),
  canUseForClaims: z.boolean().optional(),
  canUseForReport: z.boolean().optional(),
  toolVersions: z.record(z.string(), z.string()).optional(),
  processingStartedAt: z.string().trim().min(1).optional(),
  processingEndedAt: z.string().trim().min(1).optional(),
  qualityFlags: z.array(z.string().trim().min(1)).optional(),
  fullTextCharCount: z.number().int().min(0).optional(),
  extractedAbstract: z.string().trim().min(1).optional(),
  extractedSections: z
    .array(
      z.object({
        heading: z.string().trim().min(1),
        text: z.string().trim().min(1),
        page: z.number().int().optional(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .optional(),
  extractedChunks: z.array(ExtractedChunkSchema).optional(),
  extractionWarnings: z.array(z.string().trim().min(1)).optional(),
  contentHash: z.string().trim().min(1).optional(),
  sourceUseLevel: z
    .enum([
      "citable_full_text",
      "citable_abstract",
      "metadata_context_only",
      "manual_review_required",
      "rejected",
    ])
    .optional(),
  citationCount: z.number().int().min(0).optional(),
  relevanceScore: z.number().min(0).max(1),
  sourceQualityScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1).optional(),
  evidenceGrounding: z
    .enum(["abstract_grounded", "snippet_grounded", "metadata_only", "insufficient"])
    .optional(),
  claimExtractionStatus: z
    .enum(["enabled", "fallback", "unavailable", "failed", "skipped"])
    .optional(),
  claimExtractionMode: ClaimExtractionModeSchema.optional(),
  claimCount: z.number().int().min(0).optional(),
  acceptedClaimCount: z.number().int().min(0).optional(),
  acceptedEvidenceCardCount: z.number().int().min(0).optional(),
  claimExtractionWarnings: z.array(z.string().trim().min(1)).optional(),
  retrievalMode: SourceRetrievalModeSchema,
  recommendationBucket: SourceRecommendationBucketSchema,
  sourceRole: SourceRoleSchema,
  sourceBucket: SourceResearchBucketSchema.optional(),
  bucketScore: z.number().min(0).max(1).optional(),
  bucketScores: z.record(z.string(), z.number().min(0).max(1)).optional(),
  decisionReasons: z.array(z.string().trim().min(1)).optional(),
  matchedEntities: z.array(z.string().trim().min(1)).optional(),
  missingRequiredSignals: z.array(z.string().trim().min(1)).optional(),
  sourceUseCase: SourceUseCaseSchema.optional(),
  highConfidenceManual: z.boolean().optional(),
  confidenceTier: z.enum(["high", "fallback", "rejected"]).optional(),
  matchedConcepts: z.array(z.string().trim().min(1)).optional(),
  matchedFields: z
    .array(z.enum(["title", "abstract", "keywords", "venue", "authors", "publisher"]))
    .optional(),
  acceptReason: z.string().trim().min(1).optional(),
  reviewStatus: z.enum(["accepted", "review", "rejected"]),
  acceptedByUser: z.boolean().optional(),
  userDecision: z
    .enum([
      "accepted",
      "accepted_as_background",
      "accepted_as_scholarly_evidence",
      "accepted_as_manual_review",
      "rejected",
      "pending",
    ])
    .optional(),
  acceptedAs: z.string().trim().min(1).optional(),
  rejectionReason: z.string().trim().min(1).optional(),
  lowConfidence: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  evidencePoints: z.array(z.string().trim().min(1)),
  limitations: z.array(z.string().trim().min(1)),
  usableSections: z.array(z.string().trim().min(1)),
  citationMarker: z.string().trim().min(1),
  providerHealthSnapshot: ProviderHealthSchema.optional(),
  dedupeKey: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  retrievedAt: z.string().trim().min(1),
  rawProviderPayload: z.unknown().optional(),
});
export type SourceCandidate = z.infer<typeof SourceCandidateSchema>;

export const GroundingProviderErrorSchema = z.object({
  provider: z.string().trim().min(1),
  query: z.string().trim().min(1),
  errorType: z.string().trim().min(1).nullable().optional(),
  errorMessage: z.string().trim().min(1).nullable().optional(),
});
export type GroundingProviderError = z.infer<typeof GroundingProviderErrorSchema>;

export const AcademicRetrySchema = z.object({
  count: z.number().int().min(0),
  max: z.number().int().min(0),
  active: z.boolean(),
  exhausted: z.boolean(),
  reason: z.string().trim().min(1).optional(),
  retryQueries: z.array(z.string().trim().min(1)).optional(),
  lastStartedAt: z.string().trim().min(1).optional(),
  lastCompletedAt: z.string().trim().min(1).optional(),
});
export type AcademicRetry = z.infer<typeof AcademicRetrySchema>;

export const SourceQualitySummarySchema = z.object({
  totalSources: z.number().int().min(0),
  academicCandidateCount: z.number().int().min(0),
  peerReviewedOrDoiCount: z.number().int().min(0),
  officialBackgroundCount: z.number().int().min(0),
  fallbackReviewCount: z.number().int().min(0),
  rejectedCount: z.number().int().min(0),
  academicEnough: z.boolean(),
  evidenceUsableEnough: z.boolean(),
});
export type SourceQualitySummary = z.infer<typeof SourceQualitySummarySchema>;

export const ResearchGroundingDiagnosticTraceSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  originalTopic: z.string().trim().min(1),
  rawUserTopic: z.string().trim().min(1).optional(),
  createdAt: z.string().trim().min(1),
  step1_input: z.object({
    rawTopic: z.string().trim().min(1),
    rawUserTopic: z.string().trim().min(1).optional(),
    locale: z.string().trim().min(1),
    searchDepth: z.string().trim().min(1),
  }),
  step2_normalization: z.object({
    normalizedTopicZh: z.string().trim().min(1),
    normalizedTopicEn: z.string().trim().min(1),
    detectedDomain: z.string().trim().min(1),
    confidence: z.number().min(0).max(1),
    ambiguityFlags: z.array(z.string().trim().min(1)),
    positiveTermsZh: z.array(z.string().trim().min(1)),
    positiveTermsEn: z.array(z.string().trim().min(1)),
    negativeTerms: z.array(z.string().trim().min(1)),
  }),
  step3_queryPlan: z.object({
    bilingualQueries: z.array(
      z.object({
        query: z.string().trim().min(1),
        lang: z.enum(["zh", "en"]),
        purpose: z.enum([
          "broad",
          "specific",
          "review",
          "background",
          "definition",
          "taxonomy",
          "terminology",
        ]),
        providerHints: z.array(z.string().trim().min(1)),
      }),
    ),
    selectedQueriesByProvider: z.record(
      z.string(),
      z.array(z.string().trim().min(1)),
    ).optional(),
    classifiedQueries: z.array(
      z.object({
        query: z.string().trim().min(1),
        classification: z.enum([
          "providerQuery",
          "backgroundQuery",
          "outlineHint",
          "rejectedQuery",
        ]),
        reason: z.string().trim().min(1),
        providerHints: z.array(z.string().trim().min(1)),
      }),
    ).optional(),
  }),
  step4_providerExecution: z.array(
    z.object({
      provider: z.string().trim().min(1),
      status: z.enum(["success", "empty", "failed", "timeout", "skipped"]),
      queriesUsed: z.array(z.string().trim().min(1)),
      rawCount: z.number().int().min(0),
      latencyMs: z.number().int().min(0),
      errorType: z.string().trim().min(1).optional(),
      safeErrorMessage: z.string().trim().min(1).optional(),
    }),
  ),
  step5_normalizedSources: z.object({
    rawTotal: z.number().int().min(0),
    normalizedTotal: z.number().int().min(0),
    dedupedTotal: z.number().int().min(0),
    duplicateRemoved: z.number().int().min(0),
    missingTitleCount: z.number().int().min(0),
    missingAbstractCount: z.number().int().min(0),
  }),
  step6_scoring: z.array(
    z.object({
      sourceId: z.string().trim().min(1),
      title: z.string().trim().min(1),
      provider: z.string().trim().min(1),
      url: z.string().trim().min(1).optional(),
      doi: z.string().trim().min(1).optional(),
      year: z.number().int().optional(),
      sourceType: z.string().trim().min(1).optional(),
      relevanceScore: z.number().min(0).max(1),
      qualityScore: z.number().min(0).max(1),
      bucket: SourceResearchBucketSchema.optional(),
      bucketScore: z.number().min(0).max(1).optional(),
      decision: z.enum(["accepted", "fallback_review", "manual_review", "rejected"]).optional(),
      decisionReasons: z.array(z.string().trim().min(1)).optional(),
      matchedEntities: z.array(z.string().trim().min(1)).optional(),
      missingRequiredSignals: z.array(z.string().trim().min(1)).optional(),
      sourceUseCase: SourceUseCaseSchema.optional(),
      finalBucket: z.enum(["accepted", "fallback_review", "manual_review", "rejected"]),
      matchedTerms: z.array(z.string().trim().min(1)),
      rejectionReasons: z.array(z.string().trim().min(1)).optional(),
      scoringNotes: z.array(z.string().trim().min(1)),
    }),
  ),
  step7_bucketSummary: z.object({
    acceptedSources: z.number().int().min(0),
    fallbackReviewSources: z.number().int().min(0),
    manualReviewSources: z.number().int().min(0),
    rejectedSources: z.number().int().min(0),
    officialBackgroundSources: z.number().int().min(0),
    highConfidenceManualSources: z.number().int().min(0).optional(),
    bucketCounts: z.record(z.string(), z.number().int().min(0)).optional(),
    backgroundSourceNeeded: z.boolean().optional(),
    missingProviderReason: z.string().trim().min(1).optional(),
  }),
  step8_nextStepDecision: z.object({
    workflowStatus: z.enum([
      "ready_for_review",
      "completed",
      "partial",
      "needs_query_revision",
      "empty",
      "failed",
    ]),
    canProceedToSourceReview: z.boolean(),
    reason: z.string().trim().min(1),
    requiredUserAction: z.string().trim().min(1).optional(),
  }),
});
export type ResearchGroundingDiagnosticTrace = z.infer<
  typeof ResearchGroundingDiagnosticTraceSchema
>;

export const GroundingPipelineDiagnosticsSchema = z.object({
  rawTopic: z.string().trim().min(1),
  rawUserTopic: z.string().trim().min(1).optional(),
  normalizedTopic: z.string().trim().min(1).optional(),
  currentPhase: z.string().trim().min(1).optional(),
  normalizedQueries: z
    .object({
      originalQuery: z.string().trim().min(1),
      zhAcademicQuery: z.array(z.string().trim().min(1)),
      enAcademicQuery: z.array(z.string().trim().min(1)),
      keywordSet: z.array(z.string().trim().min(1)),
      negativeKeywords: z.array(z.string().trim().min(1)),
      broaderAcademicQueries: z.array(z.string().trim().min(1)),
    })
    .optional(),
  domain: z.string().trim().min(1).nullable().optional(),
  intent: z.string().trim().min(1).nullable().optional(),
  queryPlanSummary: z.array(z.string().trim().min(1)).optional(),
  conceptGroups: z.array(ConceptGroupSchema).optional(),
  queryPlanTopQueries: z.array(z.string().trim().min(1)).optional(),
  selectedTopic: z.string().trim().min(1).optional(),
  selectedDomain: z.string().trim().min(1).optional(),
  researchQuestion: z.string().trim().min(1).optional(),
  researchTitle: z.string().trim().min(1).optional(),
  queryPlan: z.unknown().optional(),
  zhQueries: z.array(z.string().trim().min(1)),
  enQueries: z.array(z.string().trim().min(1)),
  providersCalled: z.array(z.string().trim().min(1)),
  rawProviderCounts: z.record(z.string(), z.number().int().min(0)),
  rawProviderCount: z.number().int().min(0).optional(),
  normalizeAttemptCount: z.number().int().min(0).optional(),
  normalizedValidCount: z.number().int().min(0).optional(),
  normalizedInvalidCount: z.number().int().min(0).optional(),
  normalizedCount: z.number().int().min(0),
  dedupedCount: z.number().int().min(0),
  scoredCount: z.number().int().min(0),
  highConfidenceCandidateCount: z.number().int().min(0).optional(),
  scholarlyRecommendedCount: z.number().int().min(0).optional(),
  officialBackgroundCount: z.number().int().min(0).optional(),
  manualReviewCount: z.number().int().min(0).optional(),
  candidateCount: z.number().int().min(0),
  fallbackReviewCount: z.number().int().min(0).optional(),
  rejectedCount: z.number().int().min(0),
  acceptedCount: z.number().int().min(0).optional(),
  claimExtraction: z
    .object({
      totalClaims: z.number().int().min(0),
      acceptedClaims: z.number().int().min(0),
      needsReviewClaims: z.number().int().min(0),
      rejectedClaims: z.number().int().min(0),
      evidenceCardCount: z.number().int().min(0),
      evidenceCardsWithSupportSpan: z.number().int().min(0),
      llmEvidenceCardCount: z.number().int().min(0),
      ruleFallbackEvidenceCardCount: z.number().int().min(0),
      rejectedReasonCounts: z.record(z.string(), z.number().int().min(0)),
    })
    .optional(),
  canProceedToSourceReview: z.boolean().optional(),
  canProceedToAcademicDraft: z.boolean().optional(),
  canProceedToBackgroundDraft: z.boolean().optional(),
  readinessReason: z.string().trim().min(1).optional(),
  readinessWarnings: z.array(z.string().trim().min(1)).optional(),
  canProceedToNextStage: z.boolean().optional(),
  blockingReason: z.string().trim().min(1).nullable().optional(),
  userVisibleStatus: z.string().trim().min(1).optional(),
  academicRetry: AcademicRetrySchema.optional(),
  sourceQualitySummary: SourceQualitySummarySchema.optional(),
  topHighConfidenceSources: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        provider: z.string().trim().min(1).optional(),
        finalScore: z.number().optional(),
        matchedConcepts: z.array(z.string().trim().min(1)).optional(),
        matchedFields: z.array(z.string().trim().min(1)).optional(),
        acceptReason: z.string().trim().min(1).optional(),
        confidenceTier: z.string().trim().min(1).optional(),
        recommendationBucket: SourceRecommendationBucketSchema.optional(),
      }),
    )
    .optional(),
  topFallbackSources: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        provider: z.string().trim().min(1).optional(),
        finalScore: z.number().optional(),
        matchedConcepts: z.array(z.string().trim().min(1)).optional(),
        matchedFields: z.array(z.string().trim().min(1)).optional(),
        rejectionReason: z.string().trim().min(1).optional(),
        lowConfidence: z.boolean().optional(),
        needsReview: z.boolean().optional(),
        recommendationBucket: SourceRecommendationBucketSchema.optional(),
        sourceRole: SourceRoleSchema.optional(),
      }),
    )
    .optional(),
  rejectedReasonCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  rejectionReasons: z.record(z.string(), z.number().int().min(0)),
  providerErrors: z.array(GroundingProviderErrorSchema),
  providerHealth: z.array(ProviderHealthSchema).optional(),
  diagnosticTrace: ResearchGroundingDiagnosticTraceSchema.optional(),
  sourceRetrieval: z
    .object({
      attemptedProviders: z.array(z.string().trim().min(1)).optional(),
      skippedProviders: z.array(z.string().trim().min(1)).optional(),
      degradedProviders: z.array(z.string().trim().min(1)).optional(),
      downProviders: z.array(z.string().trim().min(1)).optional(),
      fallbackReason: z
        .enum([
          "scholarly_providers_unavailable",
          "scholarly_results_below_threshold",
          "provider_timeout",
          "provider_down",
          "trusted_seed_fallback",
          "manual_import_only",
          "none",
        ])
        .optional(),
      fallbackProvidersUsed: z.array(z.string().trim().min(1)).optional(),
      scholarlyMinimumMet: z.boolean().optional(),
      officialBackgroundMinimumMet: z.boolean().optional(),
      warnings: z.array(z.string().trim().min(1)).optional(),
    })
    .optional(),
  providerProgress: z
    .array(
      z.object({
        provider: z.string().trim().min(1),
        status: z.enum([
          "searching",
          "returned",
          "success",
          "empty",
          "timeout",
          "error",
          "background",
        ]),
        resultCount: z.number().int().min(0),
        queryCount: z.number().int().min(0).optional(),
        rawResultsCount: z.number().int().min(0).optional(),
        normalizedCount: z.number().int().min(0).optional(),
        acceptedCount: z.number().int().min(0).optional(),
        candidateCount: z.number().int().min(0).optional(),
        fallbackReviewCount: z.number().int().min(0).optional(),
        rejectedCount: z.number().int().min(0).optional(),
        durationMs: z.number().int().min(0).optional(),
        latencyMs: z.number().int().min(0).optional(),
        query: z.string().trim().min(1).optional(),
        errorMessage: z.string().trim().min(1).nullable().optional(),
      }),
    )
    .optional(),
  fallbackAttempts: z
    .array(
      z.object({
        round: z.number().int().min(0),
        fallbackReason: z.string().trim().min(1),
        queryUsed: z.string().trim().min(1),
        provider: z.string().trim().min(1),
        rawCount: z.number().int().min(0),
        candidateCount: z.number().int().min(0),
        rejectedCount: z.number().int().min(0),
        status: z.enum(["running", "completed", "failed"]).optional(),
      }),
    )
    .optional(),
  fallbackCompleted: z.boolean().optional(),
  maxFallbackRounds: z.number().int().min(0).optional(),
  finalUiState: z.string().trim().min(1),
  searchProfile: SourceSearchProfileSchema.optional(),
  estimatedTime: z.string().trim().min(1).optional(),
  cacheHit: z.boolean().optional(),
  cacheStatus: z
    .enum([
      "hit",
      "miss",
      "stale_hit_refreshing",
      "refresh_failed_using_stale",
      "write_failed",
    ])
    .optional(),
  earlyStopReason: z.string().trim().min(1).nullable().optional(),
  foregroundLatencyMs: z.number().int().min(0).optional(),
  firstCandidateLatencyMs: z.number().int().min(0).optional(),
  triedQueries: z.array(z.string().trim().min(1)).optional(),
});
export type GroundingPipelineDiagnostics = z.infer<
  typeof GroundingPipelineDiagnosticsSchema
>;

export const EvidenceCardSafetySchema = z.object({
  containsActionableHarm: z.boolean(),
  redactionApplied: z.boolean(),
  safeSummaryMode: z.enum([
    "none",
    "high_level_summary",
    "prevention_focused",
    "policy_or_health_focused",
  ]),
  safetyNotes: z.array(z.string().trim().min(1)),
});
export type EvidenceCardSafety = z.infer<typeof EvidenceCardSafetySchema>;

export const EvidenceExtractionMethodSchema = z.enum([
  "llm_structured_extract",
  "rule_fallback_claim_extraction",
  "manual_review",
]);
export type EvidenceExtractionMethod = z.infer<typeof EvidenceExtractionMethodSchema>;

export const GroundingEvidenceCardSchema = z.object({
  evidenceId: z.string().trim().min(1),
  evidence_id: z.string().trim().min(1).optional(),
  evidenceCardId: z.string().trim().min(1).optional(),
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  source_id: z.string().trim().min(1).optional(),
  chunkId: z.string().trim().min(1).optional(),
  claimIds: z.array(z.string().trim().min(1)).optional(),
  claimTextOriginal: z.string().trim().min(1),
  claimText: z.string().trim().min(1).optional(),
  claim_text: z.string().trim().min(1).optional(),
  claimTextZh: z.string().trim().min(1),
  mainClaimZhTw: z.string().trim().min(1).optional(),
  paraphrase_zh: z.string().trim().min(1).optional(),
  supportingClaims: z.array(ClaimCandidateSchema).optional(),
  supportedByText: z.string().trim().min(1),
  supportSpan: z.string().trim().min(1).optional(),
  supportStart: z.number().int().min(0).optional(),
  supportEnd: z.number().int().min(0).optional(),
  quoted_text: z.string().trim().min(1).optional(),
  supportSpans: z
    .array(
      z.object({
        claimId: z.string().trim().min(1),
        text: z.string().trim().min(1),
        startOffset: z.number().int().min(0).optional(),
        endOffset: z.number().int().min(0).optional(),
        pageStart: z.number().int().optional(),
        pageEnd: z.number().int().optional(),
        sectionHeading: z.string().trim().min(1).optional(),
      }),
    )
    .optional(),
  original_language: z.string().trim().min(1).optional(),
  source_location: z.string().trim().min(1).optional(),
  section_heading: z.string().trim().min(1).optional(),
  page: z.number().int().optional(),
  sourceUri: z.string().trim().min(1),
  sourceTitle: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).optional(),
  sourceDoi: z.string().trim().min(1).optional(),
  sourceProvider: z.string().trim().min(1).optional(),
  sourceType: z.string().trim().min(1).optional(),
  sourceMetadata: z.record(z.string(), z.unknown()).optional(),
  recommendationBucket: SourceRecommendationBucketSchema.optional(),
  sourceRole: SourceRoleSchema.optional(),
  retrievalMode: SourceRetrievalModeSchema.optional(),
  providerHealthSnapshot: ProviderHealthSchema.optional(),
  isPeerReviewed: z.boolean().optional(),
  venue: z.string().trim().min(1).optional(),
  acceptedByUser: z.boolean().optional(),
  userDecision: z
    .enum([
      "accepted",
      "accepted_as_background",
      "accepted_as_scholarly_evidence",
      "accepted_as_manual_review",
      "rejected",
      "pending",
    ])
    .optional(),
  acceptedAs: z.string().trim().min(1).optional(),
  quoteOrSpan: z.string().trim().min(1).optional(),
  sourceQualityScore: z.number().min(0).max(1).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  topicRelevance: z.number().min(0).max(1).optional(),
  sourceQuality: z.number().min(0).max(1).optional(),
  groundingConfidence: z.number().min(0).max(1).optional(),
  citationMarker: z.string().trim().min(1),
  citation_marker: z.string().trim().min(1).optional(),
  span: z
    .object({
      page: z.number().int().optional(),
      start: z.number().int().optional(),
      end: z.number().int().optional(),
    })
    .optional(),
  usableFor: z.array(z.string().trim().min(1)),
  sectionFit: z.array(z.string().trim().min(1)).optional(),
  supports_sections: z.array(z.string().trim().min(1)).optional(),
  evidence_type: z
    .enum([
      "background",
      "definition",
      "theory",
      "finding",
      "method",
      "statistic",
      "limitation",
      "counterpoint",
    ])
    .optional(),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(1)),
  extractionStatus: SourceContentExtractionStatusSchema.optional(),
  source_access_level: z
    .enum([
      "full_text",
      "abstract_only",
      "metadata_only",
      "blocked_or_paywalled",
      "failed_extraction",
    ])
    .optional(),
  needsManualReview: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  rejectionReason: z.string().trim().min(1).optional(),
  governanceFlags: z.array(z.string().trim().min(1)).optional(),
  trace: z
    .object({
      provider: z.string().trim().min(1).optional(),
      query_used: z.string().trim().min(1).optional(),
      url: z.string().trim().min(1).optional(),
      doi: z.string().trim().min(1).optional(),
      extraction_method: z.string().trim().min(1).optional(),
      content_hash: z.string().trim().min(1).optional(),
    })
    .optional(),
  extractedBy: z.enum(["rule", "llm", "rule_fallback", "metadata_only"]),
  extractionMethod: EvidenceExtractionMethodSchema.optional(),
  safety: EvidenceCardSafetySchema.optional(),
  contentHash: z.string().trim().min(1).optional(),
  createdAt: z.string().trim().min(1),
  extractedAt: z.string().trim().min(1).optional(),
});
export type GroundingEvidenceCard = z.infer<typeof GroundingEvidenceCardSchema>;

export const SectionEvidenceBundleSchema = z.object({
  sectionId: z.string().trim().min(1),
  sectionTitle: z.string().trim().min(1),
  requiredAspects: z.array(z.string().trim().min(1)),
  evidenceCards: z.array(GroundingEvidenceCardSchema),
  coverageStatus: z.enum(["sufficient", "weak", "insufficient"]),
  missingAspects: z.array(z.string().trim().min(1)),
  canGenerate: z.boolean(),
  diagnostics: z.array(z.string().trim().min(1)),
});
export type SectionEvidenceBundle = z.infer<typeof SectionEvidenceBundleSchema>;

export const SectionSufficiencyGateSchema = z.object({
  sectionId: z.string().trim().min(1),
  status: z.enum(["sufficient", "weak", "insufficient"]),
  evidenceCount: z.number().int().min(0),
  fullTextEvidenceCount: z.number().int().min(0),
  abstractOnlyEvidenceCount: z.number().int().min(0),
  citationCount: z.number().int().min(0),
  missingEvidenceTypes: z.array(z.string().trim().min(1)),
  userVisibleMessage: z.string().trim().min(1),
});
export type SectionSufficiencyGate = z.infer<typeof SectionSufficiencyGateSchema>;

export const ReportSectionPlanSchema = z.object({
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  requiredEvidenceTypes: z.array(z.string().trim().min(1)),
  evidenceCardIds: z.array(z.string().trim().min(1)),
});
export type ReportSectionPlan = z.infer<typeof ReportSectionPlanSchema>;

export const ReportPlanSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  title: z.string().trim().min(1),
  researchQuestion: z.string().trim().min(1),
  sections: z.array(ReportSectionPlanSchema),
  evidenceGaps: z.array(z.string().trim().min(1)),
  academicSafetyReview: AcademicSafetyReviewSchema.optional(),
});
export type ReportPlan = z.infer<typeof ReportPlanSchema>;

export const GroundingReportSectionSchema = z.object({
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  synthesizedProse: z.string().trim().min(1),
  body: z.string().trim().min(1).optional(),
  citations: z.array(z.string().trim().min(1)).optional(),
  citationMarkers: z.array(z.string().trim().min(1)),
  evidenceCardIds: z.array(z.string().trim().min(1)),
  groundingStatus: z.enum(["grounded", "partially_grounded", "unsupported"]).optional(),
  unsupportedSentences: z.array(z.string().trim().min(1)).optional(),
  generationMethod: z.string().trim().min(1).optional(),
  evidenceGaps: z.array(z.string().trim().min(1)),
  sufficiency: SectionSufficiencyGateSchema.optional(),
});
export type GroundingReportSection = z.infer<typeof GroundingReportSectionSchema>;

export const GroundingJobStatusSchema = z.enum([
  "queued",
  "planning",
  "searching",
  "evaluating_sources",
  "searching_initial",
  "searching_fallback",
  "academic_retrying",
  "rewriting_query",
  "topic_filtering",
  "building_seed_queries",
  "expanding_queries",
  "safety_reviewing",
  "searching_metadata",
  "searching_sources",
  "showing_partial_candidates",
  "waiting_for_review",
  "source_review_ready",
  "source_review_needs_manual",
  "ready_for_next_step",
  "no_sources_after_fallback",
  "enriching_sources_background",
  "ready_for_review",
  "no_results_after_expansion",
  "scoring_sources",
  "llm_enhancing",
  "generation_ready",
  "completed",
  "partial",
  "failed",
]);
export type GroundingJobStatus = z.infer<typeof GroundingJobStatusSchema>;

export const GroundingJobSchema = z.object({
  jobId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  originalTopic: z.string().trim().min(1),
  normalizedTopic: z.string().trim().min(1),
  status: GroundingJobStatusSchema,
  progress: z.number().min(0).max(100),
  parsedInput: ParsedResearchInputSchema.optional(),
  topicAnalysis: TopicAnalysisSchema.optional(),
  titleParse: ResearchTitleSentenceParseSchema.optional(),
  topicTitleState: TopicTitleStateSchema.optional(),
  seedQueryPlan: SeedQueryPlanSchema.optional(),
  lexicalSignals: z.array(LexicalSignalSchema).optional(),
  queryPlan: GroundingQueryPlanSchema.optional(),
  academicSafetyReview: AcademicSafetyReviewSchema.optional(),
  sourceCandidates: z.array(SourceCandidateSchema).optional(),
  highConfidenceCandidateSources: z.array(SourceCandidateSchema).optional(),
  candidateSources: z.array(SourceCandidateSchema).optional(),
  fallbackReviewSources: z.array(SourceCandidateSchema).optional(),
  rejectedSources: z.array(SourceCandidateSchema).optional(),
  acceptedSources: z.array(SourceCandidateSchema).optional(),
  fallbackAttempts: GroundingPipelineDiagnosticsSchema.shape.fallbackAttempts,
  academicRetry: AcademicRetrySchema.optional(),
  sourceQualitySummary: SourceQualitySummarySchema.optional(),
  providerErrors: z.array(GroundingProviderErrorSchema).optional(),
  groundingDiagnostics: GroundingPipelineDiagnosticsSchema.optional(),
  diagnosticTrace: ResearchGroundingDiagnosticTraceSchema.optional(),
  claimCandidates: z.array(ClaimCandidateSchema).optional(),
  evidenceCards: z.array(GroundingEvidenceCardSchema).optional(),
  sectionEvidenceBundles: z.array(SectionEvidenceBundleSchema).optional(),
  reportPlan: ReportPlanSchema.optional(),
  reportSections: z.array(GroundingReportSectionSchema).optional(),
  reportSectionSufficiency: z.array(SectionSufficiencyGateSchema).optional(),
  reportDraft: z.string().trim().min(1).optional(),
  researchCandidates: z.array(z.string().trim().min(1)).optional(),
  warnings: z.array(z.string().trim().min(1)),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});
export type GroundingJob = z.infer<typeof GroundingJobSchema>;

export const ResearchGroundingJobCreateRequestSchema = z.object({
  workflowId: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  rawUserTopic: z.string().trim().min(1).optional(),
  originalTopic: z.string().trim().min(1).optional(),
  normalizedTopic: z.string().trim().min(1).optional(),
  selectedDomain: z.string().trim().min(1).optional(),
  researchQuestion: z.string().trim().min(1).optional(),
  bilingualQueries: z
    .object({
      zh: z.array(z.string().trim().min(1)),
      en: z.array(z.string().trim().min(1)),
    })
    .optional(),
  querySeedZh: z.array(z.string().trim().min(1)).optional(),
  querySeedEn: z.array(z.string().trim().min(1)).optional(),
  excludeTerms: z.array(z.string().trim().min(1)).optional(),
  reportType: z.string().trim().min(1).optional(),
  audience: z.string().trim().min(1).optional(),
  searchProfile: SourceSearchProfileSchema.optional(),
  debugTrace: z.boolean().optional(),
});
export type ResearchGroundingJobCreateRequest = z.infer<
  typeof ResearchGroundingJobCreateRequestSchema
>;

export const ResearchGroundingJobCreateResponseSchema = z.object({
  jobId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  status: z.literal("queued"),
});
export type ResearchGroundingJobCreateResponse = z.infer<
  typeof ResearchGroundingJobCreateResponseSchema
>;
