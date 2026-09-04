import { z } from "zod";
import { ParsedResearchInputSchema } from "./research-intent";
import { FormalEvidenceRoleSchema, TopicIntegrityAssessmentSchema } from "./topic-integrity";

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
  "docx_native",
  "epub_native",
  "jats_xml",
  "tei_xml",
  "xml",
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

export const StudyDesignSchema = z.enum([
  "randomized_controlled_trial", "quasi_experimental", "prospective_cohort",
  "retrospective_cohort", "cross_sectional", "case_control",
  "longitudinal_observational", "systematic_review", "meta_analysis",
  "scoping_review", "qualitative", "mixed_methods", "simulation",
  "benchmark", "technical_evaluation", "experimental_lab", "other", "unknown",
]);
export type StudyDesign = z.infer<typeof StudyDesignSchema>;

export const StudyEffectDirectionSchema = z.enum([
  "positive", "negative", "null", "mixed", "nonlinear", "not_applicable", "unclear",
]);
export type StudyEffectDirection = z.infer<typeof StudyEffectDirectionSchema>;

export const StudyFactProvenanceSchema = z.object({
  sourceId: z.string().trim().min(1),
  sourceSpanText: z.string().trim().min(1),
  sectionOrLocation: z.string().trim().min(1).nullable().default(null),
  page: z.number().int().nullable().default(null),
  confidence: z.number().min(0).max(1),
  extractionMethod: z.enum(["llm_structured_fact", "deterministic_exact_span", "manual_review"]),
});
export type StudyFactProvenance = z.infer<typeof StudyFactProvenanceSchema>;

export const StudyModeratorFactSchema = z.object({
  factor: z.string().trim().min(1),
  role: z.enum(["moderator", "mediator", "covariate", "confounder", "subgroup"]),
  effect: z.string().trim().min(1).nullable().default(null),
  provenance: StudyFactProvenanceSchema,
});
export type StudyModeratorFact = z.infer<typeof StudyModeratorFactSchema>;

export const StudyQuantitativeFactSchema = z.object({
  metric: z.enum([
    "mean", "median", "percentage", "risk_ratio", "odds_ratio", "hazard_ratio",
    "correlation", "beta", "standardized_beta", "effect_size", "accuracy", "F1",
    "AUC", "latency", "energy", "sample_size", "other",
  ]),
  value: z.number().finite().nullable().default(null),
  rawValue: z.string().trim().min(1),
  unit: z.string().trim().min(1).nullable().default(null),
  population: z.string().trim().min(1).nullable().default(null),
  denominator: z.number().int().positive().nullable().default(null),
  comparison: z.string().trim().min(1).nullable().default(null),
  timepoint: z.string().trim().min(1).nullable().default(null),
  ciLower: z.number().finite().nullable().default(null),
  ciUpper: z.number().finite().nullable().default(null),
  standardError: z.number().finite().nullable().default(null),
  standardDeviation: z.number().finite().nullable().default(null),
  pValue: z.string().trim().min(1).nullable().default(null),
  effectDirection: StudyEffectDirectionSchema,
  provenance: StudyFactProvenanceSchema,
});
export type StudyQuantitativeFact = z.infer<typeof StudyQuantitativeFactSchema>;

/** Stage-1 study facts. Missing source information stays null/unknown. */
export const StructuredStudyFactSchema = z.object({
  studyId: z.string().trim().min(1).nullable().default(null),
  sourceId: z.string().trim().min(1),
  title: z.string().trim().min(1).nullable().default(null),
  authors: z.array(z.string().trim().min(1)).nullable().default(null),
  year: z.number().int().nullable().default(null),
  venue: z.string().trim().min(1).nullable().default(null),
  doi: z.string().trim().min(1).nullable().default(null),
  url: z.string().trim().min(1).nullable().default(null),
  evidenceLevel: z.string().trim().min(1).nullable().default(null),
  contentAccessLevel: z.enum(["metadata_only", "abstract_only", "partial_full_text", "full_text"]),
  metadataOnly: z.boolean(),
  abstractAvailable: z.boolean(),
  fullTextAvailable: z.boolean(),
  studyDesign: StudyDesignSchema,
  studyDesignExplicit: z.boolean(),
  population: z.string().trim().min(1).nullable().default(null),
  populationDescription: z.string().trim().min(1).nullable().default(null),
  populationAgeMin: z.number().finite().nullable().default(null),
  populationAgeMax: z.number().finite().nullable().default(null),
  populationAgeMean: z.number().finite().nullable().default(null),
  populationSampleSize: z.number().int().positive().nullable().default(null),
  populationLocation: z.string().trim().min(1).nullable().default(null),
  populationSetting: z.string().trim().min(1).nullable().default(null),
  exposure: z.string().trim().min(1).nullable().default(null),
  exposureDefinition: z.string().trim().min(1).nullable().default(null),
  exposureMeasurement: z.string().trim().min(1).nullable().default(null),
  exposureTiming: z.string().trim().min(1).nullable().default(null),
  exposureDuration: z.string().trim().min(1).nullable().default(null),
  comparator: z.string().trim().min(1).nullable().default(null),
  comparatorDefinition: z.string().trim().min(1).nullable().default(null),
  outcome: z.string().trim().min(1).nullable().default(null),
  outcomeDefinition: z.string().trim().min(1).nullable().default(null),
  outcomeMeasurement: z.string().trim().min(1).nullable().default(null),
  outcomeTimepoint: z.string().trim().min(1).nullable().default(null),
  effectDirection: StudyEffectDirectionSchema,
  effectDirectionConfidence: z.number().min(0).max(1).nullable().default(null),
  adjustedOrUnadjusted: z.enum(["adjusted", "unadjusted", "mixed", "unknown"]),
  covariates: z.array(z.string().trim().min(1)),
  confounders: z.array(z.string().trim().min(1)),
  moderators: z.array(StudyModeratorFactSchema),
  mediators: z.array(StudyModeratorFactSchema),
  subgroups: z.array(StudyModeratorFactSchema),
  primaryResult: z.string().trim().min(1).nullable().default(null),
  secondaryResults: z.array(z.string().trim().min(1)),
  limitations: z.array(z.string().trim().min(1)),
  authorCautions: z.array(z.string().trim().min(1)),
  quantitativeFacts: z.array(StudyQuantitativeFactSchema),
  fieldProvenance: z.record(z.string(), StudyFactProvenanceSchema),
  evidenceConfidence: z.number().min(0).max(1),
  extractionMethod: z.enum(["llm_structured_fact", "deterministic_exact_span", "manual_review"]),
  /** Typed and produced by the API study-fact V2 layer; retained here as a
   * forward-compatible transport envelope so downstream gates do not reparse
   * raw snippets. The API module performs the structural/runtime validation. */
  studyFactV2: z.record(z.string(), z.unknown()).optional(),
});
export type StructuredStudyFact = z.infer<typeof StructuredStudyFactSchema>;

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
  structuredStudyFact: StructuredStudyFactSchema.optional(),
  extractionMode: ClaimExtractionModeSchema,
  status: ClaimCandidateStatusSchema,
  rejectionReason: z.string().trim().min(1).optional(),
  modelProvider: z.string().trim().min(1).optional(),
  modelName: z.string().trim().min(1).optional(),
  modelVersion: z.string().trim().min(1).optional(),
  createdAt: z.string().trim().min(1),
});
export type ClaimCandidate = z.infer<typeof ClaimCandidateSchema>;

export const CanonicalStudyAccessStateSchema = z.enum([
  "FULL_TEXT_STRUCTURED",
  "FULL_TEXT_HTML",
  "FULL_TEXT_PDF",
  "FULL_TEXT_OCR",
  "FULL_TEXT_REPOSITORY_COPY",
  "ABSTRACT_ONLY",
  "ACCESS_DENIED",
  "PAYWALLED",
  "NO_USABLE_ARTIFACT",
  "RATE_LIMITED",
  "SERVER_ERROR",
  "RESOLVER_ERROR",
  "UNKNOWN",
]);
export type CanonicalStudyAccessState = z.infer<typeof CanonicalStudyAccessStateSchema>;

export const FullTextAcquisitionOutcomeSchema = z.enum([
  "NO_FULL_TEXT_DISCOVERED",
  "OA_LOOKUP_SUCCESS",
  "OA_LOOKUP_MISS",
  "DOI_RESOLUTION_FAILED",
  "LANDING_PAGE_ONLY",
  "ABSTRACT_ONLY",
  "HTML_FULL_TEXT_FOUND",
  "XML_JATS_FULL_TEXT_FOUND",
  "XML_TEI_FULL_TEXT_FOUND",
  "PDF_URL_FOUND",
  "PDF_DOWNLOAD_SUCCESS",
  "PDF_DOWNLOAD_BLOCKED",
  "HTTP_401",
  "HTTP_403",
  "HTTP_404",
  "HTTP_429",
  "PROVIDER_TIMEOUT",
  "PROVIDER_NETWORK_ERROR",
  "PROVIDER_SERVER_ERROR",
  "PROVIDER_CIRCUIT_OPEN",
  "ROBOTS_OR_TOS_BLOCKED",
  "ACCESS_BLOCKED",
  "RIGHTS_OR_LICENSE_BLOCKED",
  "INVALID_CONTENT_TYPE",
  "HTML_RETURNED_AS_PDF",
  "CORRUPT_PDF",
  "ENCRYPTED_PDF",
  "SCANNED_PDF",
  "MACHINE_TEXT_PDF",
  "PARSER_FAILED",
  "OCR_REQUIRED",
  "OCR_FAILED",
  "FULL_TEXT_TOO_SHORT",
  "FULL_TEXT_STRUCTURE_INVALID",
  "WRONG_ARTICLE_VERSION",
  "WRONG_ARTICLE_MATCH",
  "CANONICAL_IDENTITY_INSUFFICIENT",
  "DUPLICATE_OR_MIRROR",
  "SUPPLEMENTARY_ONLY",
  "FULL_TEXT_QUALIFIED",
]);
export type FullTextAcquisitionOutcome = z.infer<
  typeof FullTextAcquisitionOutcomeSchema
>;

export const FullTextArtifactIdentitySchema = z.object({
  schemaVersion: z.literal("researchforge-fulltext-artifact/v1"),
  studyId: z.string().trim().min(1),
  canonicalWorkId: z.string().trim().min(1),
  identifiers: z.object({
    doi: z.string().trim().min(1).optional(),
    pmid: z.string().trim().min(1).optional(),
    pmcid: z.string().trim().min(1).optional(),
    arxivId: z.string().trim().min(1).optional(),
  }),
  sourceProvider: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1),
  resolvedUrl: z.string().trim().min(1),
  acquisitionRoute: z.array(z.string().trim().min(1)),
  httpStatus: z.number().int().min(0),
  mimeType: z.string().trim().min(1),
  declaredMime: z.string().trim().min(1).optional(),
  detectedMime: z.string().trim().min(1).optional(),
  formatDetector: z.array(z.string().trim().min(1)).optional(),
  contentTypeMismatch: z.boolean().optional(),
  magicBytes: z.string().trim().min(1).optional(),
  redirectChain: z.array(z.string().trim().min(1)).optional(),
  byteLength: z.number().int().min(0),
  checksum: z.string().trim().min(1),
  retrievedAt: z.string().trim().min(1),
  publicationVersion: z.string().trim().min(1).optional(),
  artifactVersionType: z.enum([
    "VERSION_OF_RECORD",
    "ACCEPTED_MANUSCRIPT",
    "PREPRINT",
    "REPOSITORY_COPY",
    "UNKNOWN_VERSION",
  ]).optional(),
  license: z.string().trim().min(1).optional(),
  rightsStatus: z.enum(["OPEN", "RESTRICTED", "UNKNOWN"]),
  oaStatus: z.enum(["OPEN", "CLOSED", "UNKNOWN"]).optional(),
  accessMethod: z.enum([
    "OFFICIAL_OA_REPOSITORY",
    "PROVIDER_DISCOVERED_OA",
    "PUBLISHER_DECLARED_OA",
    "PUBLIC_URL_VALIDATED",
    "UNKNOWN",
  ]).optional(),
  landingUrl: z.string().trim().min(1).optional(),
  parserUsed: z.string().trim().min(1),
  parserVersion: z.string().trim().min(1),
  pageCount: z.number().int().min(0).optional(),
  textLength: z.number().int().min(0),
  structureMarkers: z.array(z.string().trim().min(1)),
  identityMatch: z.enum(["MATCH", "MISMATCH", "UNKNOWN"]),
  identityStrength: z.enum(["STRONG", "MEDIUM", "WEAK", "NONE"]).optional(),
  identityEvidence: z.array(z.string().trim().min(1)).optional(),
  payloadIdentity: z.object({
    decision: z.enum(["MATCH", "MISMATCH", "UNKNOWN", "POSSIBLE_MATCH"]),
    confidence: z.number().min(0).max(1),
    level: z.enum(["PERSISTENT_IDENTIFIER", "BIBLIOGRAPHIC", "INSUFFICIENT"]),
    reason: z.enum(["CANONICAL_ARTICLE_IDENTITY_VERIFIED", "WRONG_ARTICLE_MATCH", "CANONICAL_IDENTITY_INSUFFICIENT"]),
    evidence: z.array(z.object({ type: z.string(), canonicalValue: z.string().optional(), manifestationValue: z.string().optional(), matched: z.boolean(), detail: z.string() })),
    comparisons: z.record(z.string(), z.enum(["MATCH", "MISMATCH", "NOT_COMPARABLE"])),
  }).optional(),
  qualificationResult: z.enum(["QUALIFIED", "REJECTED"]),
  qualificationReason: FullTextAcquisitionOutcomeSchema,
  routeFingerprint: z.string().trim().min(1).optional(),
  artifactFingerprint: z.string().trim().min(1).optional(),
});
export type FullTextArtifactIdentity = z.infer<
  typeof FullTextArtifactIdentitySchema
>;

export const CanonicalStudyAdmissionClassSchema = z.enum([
  "FORMAL",
  "LIMITED",
  "BLOCKED",
]);
export type CanonicalStudyAdmissionClass = z.infer<typeof CanonicalStudyAdmissionClassSchema>;

export const CanonicalStudyAdmissionReasonCodeSchema = z.enum([
  "QUALIFYING_FULL_TEXT_PRESENT",
  "ABSTRACT_ONLY",
  "ACCESS_UNKNOWN",
  "ACQUISITION_INCOMPLETE",
  "FULL_TEXT_UNRESOLVED",
  "FULL_TEXT_ACCESS_DENIED",
  "FULL_TEXT_PAYWALLED",
  "NO_USABLE_ARTIFACT",
  "RATE_LIMITED",
  "SERVER_ERROR",
  "RESOLVER_ERROR",
  "PARSER_INCOMPLETE",
  "PARSER_FAILED",
  "STUDY_FACTS_READY",
  "INSUFFICIENT_STUDY_FACTS",
  "MISSING_PROVENANCE",
  "MISSING_NUMERICAL_PROVENANCE",
  "CRITICAL_CONTRADICTION",
  "FORMAL_REQUIREMENT_MISSING",
  "STUDY_TYPE_UNCLASSIFIABLE",
  "FORMAL_ADMITTED",
  "LIMITED_ADMITTED",
  "STALE_REVISION",
  "MISSING_CANONICAL_ADMISSION",
  "CONFLICTING_ADMISSION_VERSION",
]);
export type CanonicalStudyAdmissionReasonCode = z.infer<
  typeof CanonicalStudyAdmissionReasonCodeSchema
>;

export const CanonicalStudyAdmissionResultSchema = z.object({
  schemaVersion: z.literal("researchforge-canonical-study-admission/v1"),
  admissionVersion: z.literal("canonical-evidence-admission.v1"),
  decisionId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  studyId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  jobRevision: z.number().int().min(0),
  checkpointRevision: z.number().int().min(0),
  evidenceRevision: z.string().trim().min(1),
  accessState: CanonicalStudyAccessStateSchema,
  acquisitionTerminal: z.boolean(),
  qualifyingArtifactRefs: z.array(z.string().trim().min(1)),
  parserState: z.enum(["COMPLETE", "PARTIAL", "INCOMPLETE", "FAILED"]),
  studyFactState: z.enum(["READY", "PARTIAL", "MISSING", "FAILED"]),
  provenanceState: z.enum(["READY", "INCOMPLETE", "MISSING"]),
  admissionClass: CanonicalStudyAdmissionClassSchema,
  reasonCodes: z.array(CanonicalStudyAdmissionReasonCodeSchema),
  missingRequirements: z.array(z.string().trim().min(1)),
  upstreamReferences: z.object({
    sourceId: z.string().trim().min(1),
    canonicalSourceIdentity: z.string().trim().min(1).nullable(),
    studyFactExtractionVersion: z.string().trim().min(1).nullable(),
    resolverStates: z.array(z.string().trim().min(1)),
    parserVersion: z.string().trim().min(1).nullable(),
  }),
  decidedAt: z.string().trim().min(1),
});
export type CanonicalStudyAdmissionResult = z.infer<
  typeof CanonicalStudyAdmissionResultSchema
>;

export const FullTextResolverRequestAuditSchema = z.object({
  provider: z.string().trim().min(1),
  url: z.string().trim().min(1),
  status: z.number().int(),
  ok: z.boolean(),
  attemptedAt: z.string().trim().min(1).optional(),
  attempt: z.number().int().min(1).optional(),
  result: z.enum([
    "SUCCESS",
    "NOT_FOUND",
    "ACCESS_DENIED",
    "RATE_LIMITED",
    "SERVER_ERROR",
    "TIMEOUT",
    "NETWORK_ERROR",
    "INVALID_RESPONSE",
    "CIRCUIT_OPEN",
    "NO_USABLE_ARTIFACT",
  ]).optional(),
  latencyMs: z.number().int().min(0).optional(),
  retryEligibility: z.enum(["RETRYABLE", "NOT_RETRYABLE", "UNKNOWN"]).optional(),
  artifactCreated: z.boolean().optional(),
  legalAccess: z.boolean().nullable().optional(),
  contentType: z.string().trim().min(1).optional(),
  declaredContentType: z.string().trim().min(1).optional(),
  detectedContentType: z.string().trim().min(1).optional(),
  detectionMethod: z.array(z.string().trim().min(1)).optional(),
  contentTypeMismatch: z.boolean().optional(),
  magicBytes: z.string().trim().min(1).optional(),
  redirectChain: z.array(z.string().trim().min(1)).optional(),
  resolutionDepth: z.number().int().min(0).optional(),
  resolutionSignal: z.string().trim().min(1).optional(),
  resolvedUrl: z.string().trim().min(1).optional(),
  failureClass: z.string().trim().min(1).optional(),
  failureReason: z.string().trim().min(1).optional(),
  phase: z.enum(["RESOLUTION", "ACQUISITION"]).optional(),
  acquisitionOutcome: FullTextAcquisitionOutcomeSchema.optional(),
  bytesDownloaded: z.number().int().min(0).optional(),
  cacheHit: z.boolean().optional(),
  retryAfterMs: z.number().int().min(0).optional(),
  circuitState: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]).optional(),
});

export const OaRouteCandidateSchema = z.object({
  studyIdentity: z.object({
    canonicalWorkId: z.string().trim().min(1),
    doi: z.string().trim().min(1).optional(),
    pmcid: z.string().trim().min(1).optional(),
    arxivId: z.string().trim().min(1).optional(),
  }),
  provider: z.string().trim().min(1),
  routeType: z.enum([
    "STRUCTURED_FULL_TEXT",
    "DIRECT_PDF",
    "FULL_TEXT_HTML",
    "LANDING_PAGE",
    "DOI_RESOLVER",
  ]),
  url: z.string().trim().min(1),
  landingUrl: z.string().trim().min(1).optional(),
  declaredOaStatus: z.enum(["OPEN", "CLOSED", "UNKNOWN"]),
  declaredLicense: z.string().trim().min(1).optional(),
  formatHint: z.string().trim().min(1).optional(),
  artifactVersionType: z.enum([
    "VERSION_OF_RECORD",
    "ACCEPTED_MANUSCRIPT",
    "PREPRINT",
    "REPOSITORY_COPY",
    "UNKNOWN_VERSION",
  ]),
  repositoryIdentifier: z.string().trim().min(1).optional(),
  hostType: z.enum(["repository", "publisher", "unknown"]).optional(),
  sourceMetadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  discoveredAt: z.string().trim().min(1),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  routeFingerprint: z.string().trim().min(1),
});

export const OaProviderAvailabilitySchema = z.object({
  provider: z.string().trim().min(1),
  status: z.enum(["AVAILABLE", "PROVIDER_NOT_CONFIGURED", "DISABLED_BY_BUDGET"]),
  reasonCode: z.string().trim().min(1),
});

export const OaTelemetryEventSchema = z.object({
  event: z.enum([
    "OA_DISCOVERY_STARTED",
    "OA_PROVIDER_QUERY_STARTED",
    "OA_PROVIDER_QUERY_SUCCEEDED",
    "OA_PROVIDER_QUERY_FAILED",
    "OA_ROUTE_DISCOVERED",
    "OA_ROUTE_DEDUPED",
    "OA_ROUTE_RANKED",
    "OA_ROUTE_VALIDATION_STARTED",
    "OA_ROUTE_VALIDATION_FAILED",
    "OA_ARTIFACT_ACQUIRED",
    "OA_ARTIFACT_INVALID",
    "OA_IDENTITY_MATCHED",
    "OA_IDENTITY_MISMATCH",
    "OA_ARTIFACT_QUALIFIED",
    "OA_ARTIFACT_REJECTED",
    "OA_ALL_ROUTES_EXHAUSTED",
  ]),
  runId: z.string().trim().min(1),
  caseId: z.string().trim().min(1),
  studyId: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  routeType: z.string().trim().min(1),
  reasonCode: z.string().trim().min(1),
  elapsedMs: z.number().int().min(0),
  retryCount: z.number().int().min(0),
  at: z.string().trim().min(1),
});

export const FullTextEnrichmentProvenanceSchema = z.object({
  provider: z.string().trim().min(1),
  method: z.string().trim().min(1),
  status: z.string().trim().min(1),
  contentLevel: z.enum(["fulltext", "abstract", "metadata"]),
  retrievedAt: z.string().trim().min(1),
  url: z.string().trim().min(1).optional(),
  failureReason: z.string().trim().min(1).optional(),
  accessState: z.enum([
    "FULL_TEXT_STRUCTURED",
    "FULL_TEXT_HTML",
    "FULL_TEXT_PDF",
    "FULL_TEXT_OCR",
    "FULL_TEXT_REPOSITORY_COPY",
    "ABSTRACT_ONLY",
    "METADATA_ONLY",
    "PUBLISHER_SHELL",
    "ACCESS_DENIED",
    "PAYWALLED",
    "LICENSE_RESTRICTED",
    "NOT_FOUND",
    "BROKEN_DOCUMENT",
    "UNSUPPORTED_FORMAT",
    "RESOLVER_ERROR",
    "UNKNOWN_JOB_INCOMPLETE",
    "BROKEN_LINK",
    "UNRESOLVED",
  ]).optional(),
  contentType: z.string().trim().min(1).optional(),
  declaredMime: z.string().trim().min(1).optional(),
  detectedMime: z.string().trim().min(1).optional(),
  detectionMethod: z.array(z.string().trim().min(1)).optional(),
  contentTypeMismatch: z.boolean().optional(),
  magicBytes: z.string().trim().min(1).optional(),
  redirectChain: z.array(z.string().trim().min(1)).optional(),
  landingResolutionTrace: z.array(z.object({
    depth: z.number().int().min(0),
    fromUrl: z.string().trim().min(1),
    toUrl: z.string().trim().min(1).optional(),
    signal: z.string().trim().min(1),
    outcome: z.string().trim().min(1),
  })).optional(),
  contentLength: z.number().int().min(0).optional(),
  textDensity: z.number().min(0).optional(),
  sectionEvidence: z.array(z.string().trim().min(1)).optional(),
  accessPath: z.array(z.string().trim().min(1)).optional(),
  checksum: z.string().trim().min(1).optional(),
  acquisitionOutcome: FullTextAcquisitionOutcomeSchema.optional(),
  qualifyingFullText: z.boolean().optional(),
  qualificationReason: z.string().trim().min(1).optional(),
  artifactCreated: z.boolean().optional(),
  legalAccess: z.boolean().nullable().optional(),
  resolvedUrl: z.string().trim().min(1).optional(),
  artifact: FullTextArtifactIdentitySchema.optional(),
  resolverRequests: z.array(FullTextResolverRequestAuditSchema).optional(),
  oaRouteCandidates: z.array(OaRouteCandidateSchema).optional(),
  manifestations: z.array(z.unknown()).optional(),
  providerAvailability: z.array(OaProviderAvailabilitySchema).optional(),
  telemetryEvents: z.array(OaTelemetryEventSchema).optional(),
});

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
  originalAbstract: z.string().trim().min(1).optional(),
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
    .enum([
      "pdf_text",
      "grobid",
      "ocr",
      "html",
      "docx",
      "epub",
      "xml",
      "abstract",
      "metadata_only",
      "failed",
    ])
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
  formalEvidenceRole: FormalEvidenceRoleSchema.optional(),
  topicIntegrityAssessment: TopicIntegrityAssessmentSchema.optional(),
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
  canonicalSourceIdentity: z.string().trim().min(1).optional(),
  providerIds: z.record(z.string(), z.string().trim().min(1)).optional(),
  contentLevel: z.enum(["fulltext", "abstract", "metadata"]).optional(),
  enrichmentAttempted: z.boolean().optional(),
  enrichmentProviders: z.array(z.string().trim().min(1)).optional(),
  enrichmentStatus: z
    .enum([
      "not_attempted",
      "success",
      "partial",
      "permanent_no_content",
      "temporary_failure",
      "skipped",
    ])
    .optional(),
  enrichmentFailureReason: z.string().trim().min(1).optional(),
  enrichmentProvenance: z.array(FullTextEnrichmentProvenanceSchema).optional(),
  enrichedAt: z.string().trim().min(1).optional(),
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

const ExecutionBudgetDimensionsSchema = z.object({
  query: z.number().int().min(0),
  expandedQuery: z.number().int().min(0),
  provider: z.number().int().min(0),
  providerQueryPair: z.number().int().min(0),
  requestAttempt: z.number().int().min(0),
  retry: z.number().int().min(0),
  redirect: z.number().int().min(0),
  resolver: z.number().int().min(0),
  materialization: z.number().int().min(0),
  fallbackLayer: z.number().int().min(0),
  elapsedTime: z.number().int().min(0),
});

export const AuthoritativeExecutionBudgetSnapshotSchema = z.object({
  schemaVersion: z.literal("researchforge-authoritative-execution-budget/v5"),
  ledgerId: z.string().trim().min(1),
  startedAt: z.string().trim().min(1),
  capturedAt: z.string().trim().min(1),
  configured: ExecutionBudgetDimensionsSchema,
  effective: ExecutionBudgetDimensionsSchema,
  reserved: ExecutionBudgetDimensionsSchema,
  executed: ExecutionBudgetDimensionsSchema,
  succeeded: z.number().int().min(0),
  failed: z.number().int().min(0),
  retried: z.number().int().min(0),
  deduplicated: z.number().int().min(0),
  blockedByBudget: z.number().int().min(0),
  blockedByDimension: z.record(z.string(), z.number().int().min(0)),
  blocks: z.array(z.unknown()),
  events: z.array(z.unknown()),
});
export type AuthoritativeExecutionBudgetSnapshot = z.infer<
  typeof AuthoritativeExecutionBudgetSnapshotSchema
>;

export const GroundingPipelineDiagnosticsSchema = z.object({
  budgetAuthority: AuthoritativeExecutionBudgetSnapshotSchema.optional(),
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
  chunkRetrieval: z
    .object({
      backend: z.enum(["memory", "postgres_pgvector"]),
      mode: z.enum(["lexical", "semantic", "hybrid"]),
      queryHash: z.string().trim().min(1),
      corpusChunkCount: z.number().int().min(0),
      indexedChunkCount: z.number().int().min(0),
      selectedChunkCount: z.number().int().min(0),
      selectedSourceCount: z.number().int().min(0),
      embeddingModel: z.string().trim().min(1).optional(),
      persistenceEnabled: z.boolean(),
      fallbackReason: z.string().trim().min(1).optional(),
      perSourceSelected: z.record(z.string(), z.number().int().min(0)),
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
        directStudyCandidateCount: z.number().int().min(0).optional(),
        admissionResult: z.enum(["FOUND_DIRECT_STUDY", "ZERO_DIRECT_STUDY"]).optional(),
        queryReason: z.enum(["STRICT_TOPIC", "REDUCED_CONJUNCTION", "CONCEPTUAL_EXPANSION"]).optional(),
        queryPurpose: z.string().trim().min(1).optional(),
        targetGap: z.string().trim().min(1).optional(),
        expectedEvidenceType: z.string().trim().min(1).optional(),
        queryLanguage: z.enum(["zh", "en", "identifier"]).optional(),
        plannedProvider: z.string().trim().min(1).optional(),
        queryBudget: z.number().int().min(1).optional(),
        providerBudget: z.number().int().min(1).optional(),
        citationHopBudget: z.number().int().min(0).optional(),
        budgetSemantics: z.string().trim().min(1).optional(),
        authoritativeLedgerId: z.string().trim().min(1).optional(),
        structuredDimensions: z.object({
          populationOrEntity: z.string().nullable(),
          exposureOrIntervention: z.string().nullable(),
          comparator: z.string().nullable(),
          outcome: z.string().nullable(),
          context: z.string().nullable(),
          time: z.string().nullable(),
          relationship: z.enum(["effect", "association", "comparison", "descriptive"]),
        }).optional(),
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
  canonicalSourceKey: z.string().trim().min(1).optional(),
  dedupeKey: z.string().trim().min(1).optional(),
  citationKey: z.string().trim().min(1).optional(),
  chunkId: z.string().trim().min(1).optional(),
  claimIds: z.array(z.string().trim().min(1)).optional(),
  claimTextOriginal: z.string().trim().min(1),
  claimText: z.string().trim().min(1).optional(),
  claim_text: z.string().trim().min(1).optional(),
  claimTextZh: z.string().trim().min(1),
  mainClaimZhTw: z.string().trim().min(1).optional(),
  paraphrase_zh: z.string().trim().min(1).optional(),
  supportingClaims: z.array(ClaimCandidateSchema).optional(),
  structuredStudyFact: StructuredStudyFactSchema.optional(),
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

export const ReportPlannedClaimSchema = z.object({
  claimId: z.string().trim().min(1),
  claimText: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  supportingEvidenceIds: z.array(z.string().trim().min(1)).min(1),
  supportingSourceKeys: z.array(z.string().trim().min(1)).min(1),
  evidenceStrength: z.enum(["strong", "moderate", "weak", "insufficient"]),
  scope: z.enum([
    "full_text_supported",
    "abstract_only_supported",
    "mixed_source_access",
    "background_context_only",
  ]),
  limitations: z.array(z.string().trim().min(1)),
  agreementStatus: z.enum([
    "single_source",
    "corroborated",
    "mixed",
    "conflicting",
    "uncertain",
  ]),
  allowedCitationKeys: z.array(z.string().trim().min(1)).min(1),
  wordingStrength: z.enum(["assertive", "qualified", "tentative", "gap_only"]),
  /** Stable normalized facts and thematic clusters that were synthesized into this claim. */
  normalizedFactIds: z.array(z.string().trim().min(1)).optional(),
  synthesisClusterIds: z.array(z.string().trim().min(1)).optional(),
  /** Cross-source claim node that governs citation entailment for this prose claim. */
  claimGraphId: z.string().trim().min(1).optional(),
});
export type ReportPlannedClaim = z.infer<typeof ReportPlannedClaimSchema>;

export const CanonicalReportSectionRoleSchema = z.enum([
  "core_evidence",
  "background",
  "scope_method",
  "cross_source_synthesis",
  "limitations",
  "conclusion",
  "references",
]);
export type CanonicalReportSectionRole = z.infer<
  typeof CanonicalReportSectionRoleSchema
>;

export const ReportPlanBuildStatusSchema = z.enum([
  "plan_built",
  "plan_invalidated",
]);
export type ReportPlanBuildStatus = z.infer<typeof ReportPlanBuildStatusSchema>;

export const ReportReadinessStatusSchema = z.enum([
  "ready_complete_report",
  "ready_limited_report",
  "needs_targeted_search",
  "blocked_insufficient_evidence",
  "invalid_evidence_set",
]);
export type ReportReadinessStatus = z.infer<typeof ReportReadinessStatusSchema>;

export const WriterEvidenceRejectionSchema = z.object({
  evidenceCardId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1).nullable(),
  reasonCode: z.string().trim().min(1),
  diagnostics: z.array(z.string().trim().min(1)),
});
export type WriterEvidenceRejection = z.infer<
  typeof WriterEvidenceRejectionSchema
>;

export const WriterEvidenceSetSchema = z.object({
  runId: z.string().trim().min(1),
  canonicalSourceIds: z.array(z.string().trim().min(1)),
  eligibleEvidenceCardIds: z.array(z.string().trim().min(1)),
  eligibleEvidenceFingerprints: z.record(
    z.string().trim().min(1),
    z.string().regex(/^[a-f0-9]{64}$/u),
  ),
  rejectedEvidenceCards: z.array(WriterEvidenceRejectionSchema),
  evidenceSetVersion: z.string().trim().min(1),
  evidenceSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
  citationRegistryVersion: z.string().trim().min(1),
});
export type WriterEvidenceSet = z.infer<typeof WriterEvidenceSetSchema>;

export const NormalizedEvidenceFunctionSchema = z.enum([
  "support",
  "contrast",
  "limitation",
  "background",
  "definition",
  "method",
  "unresolved",
]);
export type NormalizedEvidenceFunction = z.infer<
  typeof NormalizedEvidenceFunctionSchema
>;

/**
 * Reader-independent evidence access tier.  This is intentionally more
 * granular than the legacy retrieval status because claim strength must
 * distinguish a complete article from one citable excerpt, and a complete
 * abstract from a truncated provider record.
 */
export const EvidenceAccessTierSchema = z.enum([
  "complete_full_text",
  "structured_full_text",
  "verifiable_full_text_excerpt",
  "complete_abstract",
  "partial_abstract",
  "bibliographic_only",
]);
export type EvidenceAccessTier = z.infer<typeof EvidenceAccessTierSchema>;

export const AtomicEvidenceLevelSchema = z.enum([
  "direct",
  "near_direct",
  "background",
  "bibliographic",
]);
export type AtomicEvidenceLevel = z.infer<typeof AtomicEvidenceLevelSchema>;

export const AtomicEvidenceSectionTypeSchema = z.enum([
  "abstract",
  "background",
  "research_question",
  "sample_and_setting",
  "eligibility",
  "study_design",
  "exposure",
  "outcome",
  "measurement",
  "statistical_methods",
  "primary_results",
  "secondary_results",
  "sensitivity_analysis",
  "discussion",
  "mechanism_interpretation",
  "limitations",
  "conclusion",
  "unknown",
]);
export type AtomicEvidenceSectionType = z.infer<typeof AtomicEvidenceSectionTypeSchema>;

export const FactVerificationStatusSchema = z.enum([
  "verified",
  "needs_review",
  "conflicted",
  "rejected",
  "unverified",
]);
export type FactVerificationStatus = z.infer<typeof FactVerificationStatusSchema>;

export const NormalizedFactNumericalResultSchema = z.object({
  rawText: z.string().trim().min(1),
  measure: z.string().trim().min(1).nullable(),
  resultRole: z.enum(["outcome", "exposure", "baseline", "statistic"]).optional(),
  value: z.number().finite().nullable(),
  unit: z.string().trim().min(1).nullable(),
  statisticType: z.string().trim().min(1).nullable(),
  comparisonBasis: z.string().trim().min(1).nullable().optional(),
  lowerCI: z.number().finite().nullable().default(null),
  upperCI: z.number().finite().nullable().default(null),
  pValue: z.number().finite().min(0).max(1).nullable().default(null),
  uncertainty: z.string().trim().min(1).nullable(),
});
export type NormalizedFactNumericalResult = z.infer<
  typeof NormalizedFactNumericalResultSchema
>;

/**
 * Atomic, source-traceable fact used by planning and synthesis.  Nullable
 * dimensions are deliberate: an absent field remains unknown and must never be
 * inferred later by the prose writer.
 */
export const NormalizedFactSchema = z.object({
  factId: z.string().trim().min(1),
  /** Stable parent identity when a card yields multiple atomic result facts. */
  parentFactId: z.string().trim().min(1).optional(),
  resultIndex: z.number().int().min(0).nullable().default(null).optional(),
  evidenceId: z.string().trim().min(1),
  /** Canonical source identity. Kept beside canonicalSourceId for compatibility. */
  sourceId: z.string().trim().min(1),
  canonicalSourceId: z.string().trim().min(1),
  sourceType: z.string().trim().min(1).nullable().default(null),
  evidenceLevel: AtomicEvidenceLevelSchema.nullable().default(null),
  sourceAccessLevel: EvidenceAccessTierSchema.nullable().default(null),
  sectionType: AtomicEvidenceSectionTypeSchema.nullable().default(null),
  claimTextZhTw: z.string().trim().min(1),
  population: z.string().trim().min(1).nullable().default(null),
  ageGroup: z.string().trim().min(1).nullable().default(null),
  sampleSize: z.number().int().positive().nullable().default(null),
  geography: z.string().trim().min(1).nullable().default(null),
  studySetting: z.string().trim().min(1).nullable().default(null),
  studyDesign: z.string().trim().min(1).nullable().default(null),
  exposureConcept: z.string().trim().min(1).nullable().default(null),
  exposureMeasure: z.string().trim().min(1).nullable().default(null),
  outcomeConcept: z.string().trim().min(1).nullable().default(null),
  outcomeMeasure: z.string().trim().min(1).nullable().default(null),
  statisticType: z.string().trim().min(1).nullable().default(null),
  value: z.number().finite().nullable().default(null),
  lowerCI: z.number().finite().nullable().default(null),
  upperCI: z.number().finite().nullable().default(null),
  pValue: z.number().finite().min(0).max(1).nullable().default(null),
  unit: z.string().trim().min(1).nullable().default(null),
  direction: z.enum([
    "positive",
    "negative",
    "null",
    "mixed",
    "nonlinear",
    "not_applicable",
    "unclear",
  ]).nullable().default(null),
  mediator: z.string().trim().min(1).nullable().default(null),
  moderator: z.string().trim().min(1).nullable().default(null),
  confounders: z.array(z.string().trim().min(1)).nullable().default(null),
  adjustmentStatus: z.string().trim().min(1).nullable().default(null),
  evidenceDirectness: z.enum(["A", "B", "C", "D"]).nullable().default(null),
  sourceSpan: z.string().trim().min(1).nullable().default(null),
  certainty: z.string().trim().min(1).nullable().default(null),
  confidence: z.number().min(0).max(1).nullable().default(null),
  authorInterpretation: z.string().trim().min(1).nullable().default(null),
  authorLimitations: z.array(z.string().trim().min(1)).nullable().default(null),
  extractionConfidence: z.number().min(0).max(1).nullable().default(null),
  verificationStatus: FactVerificationStatusSchema.default("unverified"),
  evidenceFunction: NormalizedEvidenceFunctionSchema.default("support"),
  location: z.string().trim().min(1).nullable(),
  setting: z.string().trim().min(1).nullable(),
  exposure: z.string().trim().min(1).nullable(),
  outcome: z.string().trim().min(1).nullable(),
  method: z.string().trim().min(1).nullable(),
  numericalResults: z.array(NormalizedFactNumericalResultSchema),
  associationDirection: z.enum([
    "positive",
    "negative",
    "null",
    "mixed",
    "nonlinear",
    "not_applicable",
    "unclear",
  ]),
  uncertainty: z.string().trim().min(1).nullable(),
  directness: z.enum(["A", "B", "C", "D"]),
  applicability: z.string().trim().min(1),
  locator: z.string().trim().min(1),
  themeKey: z.string().trim().min(1),
  conceptAxes: z.array(z.string().trim().min(1)).min(1),
  comparabilityKey: z.string().trim().min(1),
  limitations: z.array(z.string().trim().min(1)),
  supportingEvidenceIds: z.array(z.string().trim().min(1)).min(1),
  supportingSourceIds: z.array(z.string().trim().min(1)).min(1),
  writerEligible: z.boolean(),
});
export type NormalizedFact = z.infer<typeof NormalizedFactSchema>;

/** A semantic, potentially multi-source grouping of normalized facts. */
export const SynthesisClusterSchema = z.object({
  clusterId: z.string().trim().min(1),
  clusterPurpose: z.enum([
    "relationship",
    "exposure_translation",
    "outcome_hierarchy",
    "applicability_boundary",
    "method_heterogeneity",
  ]).optional(),
  themeKey: z.string().trim().min(1),
  label: z.string().trim().min(1),
  conceptAxes: z.array(z.string().trim().min(1)).min(1),
  factIds: z.array(z.string().trim().min(1)).min(1),
  evidenceIds: z.array(z.string().trim().min(1)).min(1),
  sourceIds: z.array(z.string().trim().min(1)).min(1),
  sharedFindingZhTw: z.string().trim().min(1),
  agreementStatus: z.enum([
    "single_source",
    "corroborated",
    "mixed",
    "conflicting",
    "uncertain",
  ]),
  associationDirections: z.array(z.enum([
    "positive",
    "negative",
    "null",
    "mixed",
    "not_applicable",
    "unclear",
  ])),
  comparabilityKeys: z.array(z.string().trim().min(1)).min(1),
  numericAggregationAllowed: z.boolean().optional(),
  comparabilityStatus: z.enum([
    "comparable",
    "partially_comparable",
    "direction_only",
    "not_comparable",
  ]).default("not_comparable"),
  comparabilityReasons: z.array(z.string().trim().min(1)).default([]),
  conflictPoints: z.array(z.string().trim().min(1)),
  limitations: z.array(z.string().trim().min(1)),
});
export type SynthesisCluster = z.infer<typeof SynthesisClusterSchema>;

export const CrossSourceClaimTypeSchema = z.enum([
  "direct_result",
  "cross_source_shared_direction",
  "research_difference",
  "possible_mechanism",
  "alternative_explanation",
  "applicability_boundary",
  "evidence_limitation",
  "evidence_gap",
  "research_gap",
  "author_synthesis",
]);
export type CrossSourceClaimType = z.infer<typeof CrossSourceClaimTypeSchema>;

export const CrossSourceClaimNodeSchema = z.object({
  claimId: z.string().trim().min(1),
  claimType: CrossSourceClaimTypeSchema,
  readerFacingStatement: z.string().trim().min(1),
  supportingFacts: z.array(z.string().trim().min(1)),
  contradictingFacts: z.array(z.string().trim().min(1)),
  backgroundFacts: z.array(z.string().trim().min(1)),
  applicability: z.array(z.string().trim().min(1)),
  confidence: z.number().min(0).max(1),
  citationIds: z.array(z.string().trim().min(1)),
  statisticalInterpretationIds: z.array(z.string().trim().min(1)).default([]),
  visualizable: z.boolean(),
  visualId: z.string().trim().min(1).nullable(),
  evidenceDirectness: z.enum(["A", "B", "C", "D"]).nullable(),
  limitations: z.array(z.string().trim().min(1)),
});
export type CrossSourceClaimNode = z.infer<typeof CrossSourceClaimNodeSchema>;

export const CrossSourceClaimEdgeSchema = z.object({
  fromClaimId: z.string().trim().min(1),
  toClaimId: z.string().trim().min(1),
  relationship: z.enum(["supports", "contradicts", "qualifies", "explains", "bounds"]),
});
export type CrossSourceClaimEdge = z.infer<typeof CrossSourceClaimEdgeSchema>;

export const CrossSourceClaimGraphSchema = z.object({
  researchQuestion: z.string().trim().min(1),
  claims: z.array(CrossSourceClaimNodeSchema),
  edges: z.array(CrossSourceClaimEdgeSchema).default([]),
});
export type CrossSourceClaimGraph = z.infer<typeof CrossSourceClaimGraphSchema>;

export const StatisticalInterpretationSchema = z.object({
  interpretationId: z.string().trim().min(1),
  factId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  statisticType: z.string().trim().min(1),
  technicalExplanation: z.string().trim().min(1),
  readerExplanation: z.string().trim().min(1),
  supportedConclusion: z.string().trim().min(1),
  unsupportedConclusion: z.string().trim().min(1),
  causalInterpretationAllowed: z.boolean(),
  visualizable: z.boolean(),
  recommendedVisual: z.enum([
    "proportion_bar",
    "hundred_person",
    "forest_plot",
    "correlation_matrix",
    "path_diagram",
    "line_chart",
    "distribution_plot",
    "comparison_matrix",
    "key_finding_box",
    "none",
  ]),
  nullValue: z.number().finite().nullable(),
  precisionStatus: z.enum(["precise", "imprecise", "unknown", "crosses_null"]),
  crossStudyComparability: z.enum([
    "COMPARABLE",
    "PARTIALLY_COMPARABLE",
    "DIRECTION_ONLY",
    "NOT_COMPARABLE",
  ]),
  warnings: z.array(z.string().trim().min(1)),
});
export type StatisticalInterpretation = z.infer<typeof StatisticalInterpretationSchema>;

export const KnowledgeConceptNodeSchema = z.object({
  nodeId: z.string().trim().min(1),
  nodeType: z.enum([
    "population",
    "exposure",
    "outcome",
    "mediator",
    "moderator",
    "confounder",
    "setting",
    "method",
    "direction",
    "applicability",
    "gap",
  ]),
  normalizedLabel: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  supportingFactIds: z.array(z.string().trim().min(1)),
});
export type KnowledgeConceptNode = z.infer<typeof KnowledgeConceptNodeSchema>;

export const KnowledgeRelationEdgeSchema = z.object({
  edgeId: z.string().trim().min(1),
  fromNodeId: z.string().trim().min(1),
  toNodeId: z.string().trim().min(1),
  relationshipType: z.enum([
    "association",
    "prediction",
    "mediation",
    "moderation",
    "possible_mechanism",
    "causal",
    "reverse_relationship",
    "null_relationship",
    "insufficient_evidence",
  ]),
  supportingFactIds: z.array(z.string().trim().min(1)),
  contradictingFactIds: z.array(z.string().trim().min(1)),
  evidenceBasis: z.enum([
    "direct_measurement",
    "statistical_association",
    "source_author_interpretation",
    "researchforge_synthesis",
    "unverified_hypothesis",
  ]),
  evidenceStrength: z.enum(["strong", "moderate", "weak", "insufficient"]),
  applicablePopulations: z.array(z.string().trim().min(1)),
  applicableSettings: z.array(z.string().trim().min(1)),
  causalInterpretationAllowed: z.boolean(),
  uncertainty: z.array(z.string().trim().min(1)),
});
export type KnowledgeRelationEdge = z.infer<typeof KnowledgeRelationEdgeSchema>;

export const ResearchKnowledgeModelSchema = z.object({
  researchQuestion: z.string().trim().min(1),
  nodes: z.array(KnowledgeConceptNodeSchema),
  edges: z.array(KnowledgeRelationEdgeSchema),
  evidenceGaps: z.array(z.string().trim().min(1)),
});
export type ResearchKnowledgeModel = z.infer<typeof ResearchKnowledgeModelSchema>;

export const HeterogeneityComparisonSchema = z.object({
  comparisonId: z.string().trim().min(1),
  leftFactId: z.string().trim().min(1),
  rightFactId: z.string().trim().min(1),
  status: z.enum([
    "COMPARABLE",
    "PARTIALLY_COMPARABLE",
    "DIRECTION_ONLY",
    "NOT_COMPARABLE",
  ]),
  comparableDimensions: z.array(z.string().trim().min(1)),
  differingDimensions: z.array(z.string().trim().min(1)),
  reasons: z.array(z.string().trim().min(1)),
  numericPoolingAllowed: z.boolean(),
  directionComparisonAllowed: z.boolean(),
});
export type HeterogeneityComparison = z.infer<typeof HeterogeneityComparisonSchema>;

export const HeterogeneityAnalysisSchema = z.object({
  comparisons: z.array(HeterogeneityComparisonSchema),
  dominantDifferenceSources: z.array(z.string().trim().min(1)),
  synthesisBoundary: z.string().trim().min(1),
});
export type HeterogeneityAnalysis = z.infer<typeof HeterogeneityAnalysisSchema>;

export const ClaimContradictionAnalysisSchema = z.object({
  claimId: z.string().trim().min(1),
  status: z.enum([
    "consistent",
    "mixed",
    "contradictory",
    "single_source",
    "insufficient",
  ]),
  supportingFactIds: z.array(z.string().trim().min(1)),
  counterFactIds: z.array(z.string().trim().min(1)),
  nullFactIds: z.array(z.string().trim().min(1)),
  primaryExplanation: z.string().trim().min(1),
  alternativeExplanations: z.array(z.string().trim().min(1)),
  unresolvedPossibilities: z.array(z.string().trim().min(1)),
  discriminatingStudy: z.string().trim().min(1),
});
export type ClaimContradictionAnalysis = z.infer<typeof ClaimContradictionAnalysisSchema>;

export const AudienceProfileIdSchema = z.enum([
  "general_reader",
  "high_school_report",
  "university_project",
  "professional_evidence_synthesis",
  "decision_brief",
]);
export type AudienceProfileId = z.infer<typeof AudienceProfileIdSchema>;

export const AudienceProfileSchema = z.object({
  profileId: AudienceProfileIdSchema,
  terminologyExplanation: z.enum(["extensive", "guided", "selective", "minimal"]),
  sentenceLength: z.enum(["short", "medium", "technical"]),
  statisticalDetail: z.enum(["plain_language", "foundational", "operational", "complete"]),
  methodDepth: z.enum(["brief", "foundational", "operationalization", "full"]),
  visualComplexity: z.enum(["simple", "guided", "analytical", "expert"]),
  citationDensity: z.enum(["low", "moderate", "high", "complete"]),
  limitationDepth: z.enum(["key_only", "explained", "detailed", "full"]),
  includePracticalRecommendations: z.boolean(),
  showEvidenceGrades: z.boolean(),
  summaryTargetWords: z.number().int().positive(),
  bodyTargetWords: z.number().int().positive(),
});
export type AudienceProfile = z.infer<typeof AudienceProfileSchema>;

export const ReportArchetypeIdSchema = z.enum([
  "literature_review",
  "comparative_analysis",
  "mechanism_analysis",
  "experimental_design",
  "technical_assessment",
  "policy_analysis",
  "market_industry_research",
  "controversy_analysis",
  "limited_evidence_report",
  "systematic_evidence_map",
]);
export type ReportArchetypeId = z.infer<typeof ReportArchetypeIdSchema>;

export const ReportArchetypeDecisionSchema = z.object({
  archetypeId: ReportArchetypeIdSchema,
  questionType: z.enum([
    "research_inventory",
    "comparison",
    "mechanism",
    "effect_size",
    "design",
    "adoption",
    "controversy",
    "evidence_gap",
  ]),
  rationale: z.string().trim().min(1),
  sectionBlueprint: z.array(z.string().trim().min(1)).min(1),
  evidenceRequirements: z.array(z.string().trim().min(1)).min(1),
  visualRequirements: z.array(z.string().trim().min(1)),
  comparisonMethod: z.string().trim().min(1),
  conclusionForm: z.string().trim().min(1),
  minimumConditionsMet: z.boolean(),
  downgradedFrom: ReportArchetypeIdSchema.nullable(),
});
export type ReportArchetypeDecision = z.infer<typeof ReportArchetypeDecisionSchema>;

export const NarrativePassPlanSchema = z.object({
  pass: z.enum(["teach_back", "academic_reconstruction"]),
  objective: z.string().trim().min(1),
  inputClaimIds: z.array(z.string().trim().min(1)),
  inputFactIds: z.array(z.string().trim().min(1)),
  outputConstraints: z.array(z.string().trim().min(1)).min(1),
  citationMode: z.enum(["deferred", "claim_entailment"]),
});
export type NarrativePassPlan = z.infer<typeof NarrativePassPlanSchema>;

export const NormalizedWriterEvidenceSchema = z.object({
  evidenceId: z.string().trim().min(1),
  canonicalSourceId: z.string().trim().min(1),
  sourceLanguage: z.string().trim().min(1),
  originalSpan: z.string(),
  normalizedClaimZhTw: z.string().trim().min(1),
  evidenceType: z.string().trim().min(1),
  topicCluster: z.string().trim().min(1),
  stance: z.enum(["supports", "contrasts", "limits", "neutral", "unresolved"]),
  scope: z.string().trim().min(1),
  confidence: z.number().min(0).max(1),
  allowedUses: z.array(NormalizedEvidenceFunctionSchema),
  canonicalCitationMarker: z.string().trim().min(1),
  writerEligible: z.boolean(),
});
export type NormalizedWriterEvidence = z.infer<typeof NormalizedWriterEvidenceSchema>;

export const ArgumentMapClaimSchema = z.object({
  claimId: z.string().trim().min(1),
  claimText: z.string().trim().min(1),
  function: NormalizedEvidenceFunctionSchema,
  supportingEvidenceIds: z.array(z.string().trim().min(1)),
  contrastingEvidenceIds: z.array(z.string().trim().min(1)),
  limitingEvidenceIds: z.array(z.string().trim().min(1)),
  sourceCount: z.number().int().min(0),
  wordingStrength: z.enum(["assertive", "qualified", "tentative", "gap_only"]),
  normalizedFactIds: z.array(z.string().trim().min(1)).optional(),
  synthesisClusterIds: z.array(z.string().trim().min(1)).optional(),
});
export type ArgumentMapClaim = z.infer<typeof ArgumentMapClaimSchema>;

export const ArgumentMapSchema = z.object({
  researchQuestion: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  centralAnswer: z.string().trim().min(1),
  subQuestions: z.array(z.string().trim().min(1)).min(1).max(4),
  claims: z.array(ArgumentMapClaimSchema),
  evidenceGaps: z.array(z.string().trim().min(1)),
  conclusionBoundary: z.string().trim().min(1),
});
export type ArgumentMap = z.infer<typeof ArgumentMapSchema>;

export const DiscourseSectionSchema = z.object({
  sectionId: z.string().trim().min(1),
  sectionRole: z.string().trim().min(1),
  questionAnswered: z.string().trim().min(1),
  sectionClaim: z.string().trim().min(1),
  assignedEvidenceIds: z.array(z.string().trim().min(1)),
  evidenceRelationship: z.string().trim().min(1),
  connectionFromPrevious: z.string().trim().min(1),
  expectedTakeaway: z.string().trim().min(1),
  transitionToNext: z.string().trim().min(1),
  limitations: z.array(z.string().trim().min(1)),
  assignedFactIds: z.array(z.string().trim().min(1)).optional(),
  synthesisClusterIds: z.array(z.string().trim().min(1)).optional(),
});
export type DiscourseSection = z.infer<typeof DiscourseSectionSchema>;

export const ReportEvidenceGroupSchema = z.object({
  groupId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  groupingBasis: z.enum(["theme", "method", "setting", "geography", "finding", "limitation"]),
  evidenceIds: z.array(z.string().trim().min(1)).min(1),
  sourceKeys: z.array(z.string().trim().min(1)).min(1),
  sharedFinding: z.string().trim().min(1),
  contrastPoints: z.array(z.string().trim().min(1)).default([]),
  limitations: z.array(z.string().trim().min(1)).default([]),
  normalizedFactIds: z.array(z.string().trim().min(1)).optional(),
  synthesisClusterIds: z.array(z.string().trim().min(1)).optional(),
  conceptAxes: z.array(z.string().trim().min(1)).optional(),
  comparabilityKeys: z.array(z.string().trim().min(1)).optional(),
});
export type ReportEvidenceGroup = z.infer<typeof ReportEvidenceGroupSchema>;

export const ReportParagraphPlanSchema = z.object({
  paragraphId: z.string().trim().min(1),
  purpose: z.enum([
    "orient",
    "define_scope",
    "present_evidence",
    "compare_sources",
    "interpret",
    "state_boundary",
    "transition",
    "answer_question",
  ]),
  topicSentenceGoal: z.string().trim().min(1),
  evidenceGroupIds: z.array(z.string().trim().min(1)).default([]),
  supportedClaimIds: z.array(z.string().trim().min(1)).default([]),
  synthesisGoal: z.string().trim().min(1),
  transitionGoal: z.string().trim().min(1),
  limitationBoundary: z.string().trim().min(1),
  normalizedFactIds: z.array(z.string().trim().min(1)).optional(),
  synthesisClusterIds: z.array(z.string().trim().min(1)).optional(),
  teachBackGoal: z.string().trim().min(1).optional(),
  academicReconstructionGoal: z.string().trim().min(1).optional(),
  minimumIntegratedFactCount: z.number().int().min(0).optional(),
  primaryFunction: z.enum([
    "define_concept",
    "raise_question",
    "establish_claim",
    "provide_evidence",
    "explain_number",
    "compare_difference",
    "alternative_explanation",
    "state_limitation",
    "transition",
    "synthesize",
    "answer_question",
  ]).optional(),
});
export type ReportParagraphPlan = z.infer<typeof ReportParagraphPlanSchema>;

export const ReportSectionPlanSchema = z.object({
  sectionId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  requiredEvidenceTypes: z.array(z.string().trim().min(1)),
  evidenceCardIds: z.array(z.string().trim().min(1)),
  plannedClaimIds: z.array(z.string().trim().min(1)).default([]),
  canonicalSectionRole: CanonicalReportSectionRoleSchema.optional(),
  sectionRole: z.string().trim().min(1).optional(),
  questionAnswered: z.string().trim().min(1).optional(),
  sectionClaim: z.string().trim().min(1).optional(),
  evidenceRelationship: z.string().trim().min(1).optional(),
  connectionFromPrevious: z.string().trim().min(1).optional(),
  expectedTakeaway: z.string().trim().min(1).optional(),
  transitionToNext: z.string().trim().min(1).optional(),
  limitations: z.array(z.string().trim().min(1)).optional(),
  sectionPurpose: z.string().trim().min(1).optional(),
  sectionThesis: z.string().trim().min(1).optional(),
  paragraphPlan: z.array(ReportParagraphPlanSchema).optional(),
  evidenceGroups: z.array(ReportEvidenceGroupSchema).optional(),
  supportedClaims: z.array(ReportPlannedClaimSchema).optional(),
  contrastPoints: z.array(z.string().trim().min(1)).optional(),
  transitionGoal: z.string().trim().min(1).optional(),
  limitationBoundary: z.string().trim().min(1).optional(),
});
export type ReportSectionPlan = z.infer<typeof ReportSectionPlanSchema>;

export const ReportPlanSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  title: z.string().trim().min(1),
  originalTitle: z.string().trim().min(1).optional(),
  titleLanguage: z.enum(["zh-TW", "en", "mixed"]).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  researchQuestion: z.string().trim().min(1),
  evidenceSetHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  evidenceSetVersion: z.string().trim().min(1).optional(),
  citationRegistryVersion: z.string().trim().min(1).optional(),
  planBuildStatus: ReportPlanBuildStatusSchema.optional(),
  readinessStatus: ReportReadinessStatusSchema.optional(),
  readinessReasons: z.array(z.string().trim().min(1)).optional(),
  targetedRetrievalAttempted: z.boolean().optional(),
  centralAnswer: z.string().trim().min(1).optional(),
  scope: z.string().trim().min(1).optional(),
  subQuestions: z.array(z.string().trim().min(1)).max(4).optional(),
  sections: z.array(ReportSectionPlanSchema),
  plannedClaims: z.array(ReportPlannedClaimSchema).default([]),
  evidenceGaps: z.array(z.string().trim().min(1)),
  conclusionBoundary: z.string().trim().min(1).optional(),
  argumentMap: ArgumentMapSchema.optional(),
  discoursePlan: z.array(DiscourseSectionSchema).optional(),
  normalizedEvidence: z.array(NormalizedWriterEvidenceSchema).optional(),
  normalizedFacts: z.array(NormalizedFactSchema).optional(),
  synthesisClusters: z.array(SynthesisClusterSchema).optional(),
  claimGraph: CrossSourceClaimGraphSchema.optional(),
  knowledgeModel: ResearchKnowledgeModelSchema.optional(),
  heterogeneityAnalysis: HeterogeneityAnalysisSchema.optional(),
  statisticalInterpretations: z.array(StatisticalInterpretationSchema).optional(),
  contradictionAnalysis: z.array(ClaimContradictionAnalysisSchema).optional(),
  audienceProfile: AudienceProfileSchema.optional(),
  reportArchetype: ReportArchetypeDecisionSchema.optional(),
  narrativePasses: z.array(NarrativePassPlanSchema).length(2).optional(),
  compositionKind: z
    .enum(["complete_research_report", "limited_evidence_brief", "evidence_summary"])
    .optional(),
  terminology: z.record(z.string(), z.string()).optional(),
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
  "classifying_direct_studies",
  "llm_enhancing",
  "resolving_full_text",
  "parsing_full_text",
  "extracting_study_facts",
  "building_evidence",
  "generation_ready",
  "completed",
  "partial",
  "failed",
]);
export type GroundingJobStatus = z.infer<typeof GroundingJobStatusSchema>;

export const AcquisitionStageNameSchema = z.enum([
  "QUEUED",
  "SEARCHING",
  "NORMALIZING",
  "DEDUPLICATING",
  "CLASSIFYING_DIRECT_STUDIES",
  "RESOLVING_FULL_TEXT",
  "PARSING_FULL_TEXT",
  "EXTRACTING_STUDY_FACTS",
  "BUILDING_EVIDENCE",
  "BUILDING_THEMES",
  "BUILDING_SYNTHESIS_INPUTS",
]);
export type AcquisitionStageName = z.infer<typeof AcquisitionStageNameSchema>;

export const AcquisitionStageStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "PARTIAL",
  "BLOCKED",
  "FAILED",
]);
export type AcquisitionStageStatus = z.infer<typeof AcquisitionStageStatusSchema>;

export const AcquisitionRetryEligibilitySchema = z.enum([
  "RETRYABLE",
  "NON_RETRYABLE",
  "QUALITY_FALLBACK",
  "NOT_APPLICABLE",
]);
export type AcquisitionRetryEligibility = z.infer<typeof AcquisitionRetryEligibilitySchema>;

export const AcquisitionStageCheckpointSchema = z.object({
  stage: AcquisitionStageNameSchema,
  status: AcquisitionStageStatusSchema,
  startedAt: z.string().trim().min(1).nullable(),
  finishedAt: z.string().trim().min(1).nullable(),
  attemptCount: z.number().int().min(0),
  provider: z.string().trim().min(1).nullable(),
  inputCount: z.number().int().min(0).nullable(),
  outputCount: z.number().int().min(0).nullable(),
  errorClass: z.string().trim().min(1).nullable(),
  retryEligibility: AcquisitionRetryEligibilitySchema,
  artifactLocation: z.string().trim().min(1).nullable(),
});
export type AcquisitionStageCheckpoint = z.infer<typeof AcquisitionStageCheckpointSchema>;

export const AcquisitionTerminalStatusSchema = z.enum([
  "COMPLETE",
  "PARTIAL",
  "BLOCKED",
  "FAILED",
]);
export type AcquisitionTerminalStatus = z.infer<typeof AcquisitionTerminalStatusSchema>;

const UnknownUntilCompleteCountSchema = z.number().int().min(0).nullable();

export const AcquisitionTerminalManifestSchema = z.object({
  jobId: z.string().trim().min(1),
  caseId: z.string().trim().min(1).nullable(),
  topic: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  completedAt: z.string().trim().min(1),
  terminalStatus: AcquisitionTerminalStatusSchema,
  currentStage: AcquisitionStageNameSchema,
  queryCount: UnknownUntilCompleteCountSchema,
  providerAttempts: UnknownUntilCompleteCountSchema,
  candidateCount: UnknownUntilCompleteCountSchema,
  dedupedCount: UnknownUntilCompleteCountSchema,
  directStudyCount: UnknownUntilCompleteCountSchema,
  fullTextResolverAttempts: UnknownUntilCompleteCountSchema,
  fullTextStructuredCount: UnknownUntilCompleteCountSchema,
  fullTextPdfCount: UnknownUntilCompleteCountSchema,
  fullTextOcrCount: UnknownUntilCompleteCountSchema,
  abstractOnlyCount: UnknownUntilCompleteCountSchema,
  accessDeniedCount: UnknownUntilCompleteCountSchema,
  notFoundCount: UnknownUntilCompleteCountSchema,
  resolverErrorCount: UnknownUntilCompleteCountSchema,
  unknownIncompleteCount: UnknownUntilCompleteCountSchema,
  structuredStudyFactCount: UnknownUntilCompleteCountSchema,
  quantitativeFactCount: UnknownUntilCompleteCountSchema,
  limitedStudyCount: UnknownUntilCompleteCountSchema,
  formalStudyCount: UnknownUntilCompleteCountSchema,
  blockedStudyCount: UnknownUntilCompleteCountSchema.optional(),
  limitedOrBetterStudyCount: UnknownUntilCompleteCountSchema.optional(),
  canonicalAdmissionVersion: z.string().trim().min(1).nullable().optional(),
  canonicalAdmissionJobRevision: z.number().int().min(0).nullable().optional(),
  canonicalProjectionId: z.string().trim().min(1).optional(),
  canonicalProjectionVersion: z.string().trim().min(1).optional(),
  canonicalBindingPass: z.boolean().optional(),
  canonicalBindingMismatchCount: z.number().int().min(0).optional(),
  canonicalBindingIssues: z.array(z.string().trim().min(1)).optional(),
  qualifyingArtifactCount: UnknownUntilCompleteCountSchema.optional(),
  budgetLedgerId: z.string().trim().min(1).optional(),
  budgetAuthorityPass: z.boolean().optional(),
  budgetOverrunCount: z.number().int().min(0).optional(),
  hiddenAttemptCount: z.number().int().min(0).optional(),
  budgetBlockedRequestCount: z.number().int().min(0).optional(),
  budgetConfigured: ExecutionBudgetDimensionsSchema.optional(),
  budgetEffective: ExecutionBudgetDimensionsSchema.optional(),
  budgetReserved: ExecutionBudgetDimensionsSchema.optional(),
  budgetExecuted: ExecutionBudgetDimensionsSchema.optional(),
  canonicalAccessStateCounts: z
    .record(z.string(), z.number().int().min(0))
    .optional(),
  errors: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
  artifactPaths: z.array(z.string().trim().min(1)),
});
export type AcquisitionTerminalManifest = z.infer<typeof AcquisitionTerminalManifestSchema>;

export const AcquisitionLifecycleSchema = z.object({
  schemaVersion: z.literal("researchforge-acquisition-job/v4"),
  currentStage: AcquisitionStageNameSchema,
  terminalStatus: AcquisitionTerminalStatusSchema.nullable(),
  stages: z.array(AcquisitionStageCheckpointSchema),
  safeResumeStage: AcquisitionStageNameSchema,
  searchCheckpointAvailable: z.boolean(),
  resumedFromCheckpoint: z.boolean(),
  runAttemptCount: z.number().int().min(0),
  providerRequestCount: z.number().int().min(0),
  resolverRequestCount: z.number().int().min(0),
  writerCallCount: z.number().int().min(0),
  modelSubcallCount: z.number().int().min(0),
  totalJobBudgetMs: z.number().int().positive(),
  lastErrorClass: z.string().trim().min(1).nullable(),
  terminalManifest: AcquisitionTerminalManifestSchema.nullable(),
});
export type AcquisitionLifecycle = z.infer<typeof AcquisitionLifecycleSchema>;

export const GroundingExecutionLeaseSchema = z.object({
  ownerId: z.string().trim().min(1),
  claimedAt: z.string().trim().min(1),
  expiresAt: z.string().trim().min(1),
});

export const GroundingClientWaitSchema = z.object({
  status: z.enum(["WAITING", "CLIENT_WAIT_EXPIRED", "JOB_TERMINAL"]),
  waitCeilingMs: z.number().int().min(0),
  observedAt: z.string().trim().min(1),
});

export const GroundingJobCoreSchema = z.object({
  jobId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  requestId: z.string().trim().min(1),
  attemptId: z.string().trim().min(1),
  revision: z.number().int().min(1),
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
});

export const GroundingJobSourcesSchema = z.object({
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
});

export const GroundingJobEvidenceSchema = z.object({
  claimCandidates: z.array(ClaimCandidateSchema).optional(),
  evidenceCards: z.array(GroundingEvidenceCardSchema).optional(),
  canonicalStudyAdmissions: z
    .array(CanonicalStudyAdmissionResultSchema)
    .optional(),
  sectionEvidenceBundles: z.array(SectionEvidenceBundleSchema).optional(),
  reportPlan: ReportPlanSchema.optional(),
  reportSections: z.array(GroundingReportSectionSchema).optional(),
  reportSectionSufficiency: z.array(SectionSufficiencyGateSchema).optional(),
  reportDraft: z.string().trim().min(1).optional(),
  researchCandidates: z.array(z.string().trim().min(1)).optional(),
  requestPayload: z.record(z.string(), z.unknown()).optional(),
  searchCheckpoint: z.unknown().optional(),
  acquisition: AcquisitionLifecycleSchema.optional(),
  executionLease: GroundingExecutionLeaseSchema.optional(),
  clientWait: GroundingClientWaitSchema.optional(),
  warnings: z.array(z.string().trim().min(1)),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  expiresAt: z.string().trim().min(1),
});
export type GroundingJob = z.infer<typeof GroundingJobCoreSchema> &
  z.infer<typeof GroundingJobSourcesSchema> &
  z.infer<typeof GroundingJobEvidenceSchema>;
export type GroundingJobInput = z.input<typeof GroundingJobCoreSchema> &
  z.input<typeof GroundingJobSourcesSchema> &
  z.input<typeof GroundingJobEvidenceSchema>;
export const GroundingJobSchema: z.ZodType<GroundingJob, z.ZodTypeDef, GroundingJobInput> =
  GroundingJobCoreSchema.merge(GroundingJobSourcesSchema).merge(GroundingJobEvidenceSchema);

export const ResearchGroundingJobCreateRequestSchema = z.object({
  workflowId: z.string().trim().min(1),
  requestId: z.string().trim().min(1).optional(),
  attemptId: z.string().trim().min(1).optional(),
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
  requestId: z.string().trim().min(1),
  attemptId: z.string().trim().min(1),
  status: GroundingJobStatusSchema,
});
export type ResearchGroundingJobCreateResponse = z.infer<
  typeof ResearchGroundingJobCreateResponseSchema
>;

export const GroundingJobErrorCodeSchema = z.enum([
  "INVALID_GROUNDING_REQUEST",
  "GROUNDING_STORE_NOT_CONFIGURED",
  "GROUNDING_JOB_CREATE_FAILED",
  "GROUNDING_JOB_NOT_FOUND",
  "GROUNDING_JOB_POLL_FAILED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_HTTP_ERROR",
  "PROVIDER_PARSE_ERROR",
  "ALL_PROVIDERS_FAILED",
  "NO_RESULTS_AFTER_EXPANSION",
  "GROUNDING_PIPELINE_FAILED",
  "GROUNDING_RESPONSE_SCHEMA_INVALID",
]);
export type GroundingJobErrorCode = z.infer<typeof GroundingJobErrorCodeSchema>;

export const GroundingJobErrorResponseSchema = z.object({
  code: GroundingJobErrorCodeSchema,
  message: z.string().trim().min(1),
  stage: z.enum(["creation", "polling", "pipeline"]),
  retryable: z.boolean(),
  requestId: z.string().trim().min(1),
});
export type GroundingJobErrorResponse = z.infer<
  typeof GroundingJobErrorResponseSchema
>;
