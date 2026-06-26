import { z } from "zod";
import { LlmStructuredStatusSchema } from "./llm-status";

export const TopicExpansionInputKindSchema = z.enum([
  "single_keyword",
  "short_phrase",
  "complete_research_topic",
  "too_broad",
  "gibberish",
]);

export const TopicExpansionDomainSchema = z.enum([
  "biology_ecology",
  "health_medical",
  "natural_science",
  "experiment_design",
  "social_policy",
  "education_psychology",
  "technology_engineering",
  "humanities_culture",
  "concept_feature",
  "unknown",
]);

export const TopicExpansionEntityTypeSchema = z.enum([
  "animal",
  "plant",
  "food",
  "health_topic",
  "social_issue",
  "scientific_concept",
  "technology",
  "place",
  "person_or_group",
  "unknown",
]);

export const TopicExpansionGenerationModeSchema = z.enum([
  "llm_polished",
  "hybrid_fallback",
  "domain_fallback",
  "title_fallback",
  "rule",
  "error",
]);

export const TitleCandidateStyleSchema = z.enum([
  "academic",
  "poetic_academic",
  "narrative",
  "question",
  "contrast",
  "practical",
]);

const TopicDomainSchema = z.enum([
  "animal_science",
  "food_nutrition",
  "beverage_health",
  "consumer_product",
  "automotive_business",
  "music_culture",
  "household_safety",
  "materials_design",
  "biology",
  "health",
  "technology",
  "environment",
  "social_science",
  "history_culture",
  "general_research",
]);

export const TopicExpansionKeywordExpansionSchema = z.object({
  coreTermsZh: z.array(z.string().trim().min(1)),
  coreTermsEn: z.array(z.string().trim().min(1)),
  relatedTermsZh: z.array(z.string().trim().min(1)),
  relatedTermsEn: z.array(z.string().trim().min(1)),
  dimensionTermsZh: z.array(z.string().trim().min(1)),
  dimensionTermsEn: z.array(z.string().trim().min(1)),
  excludeTerms: z.array(z.string().trim().min(1)),
});

export const TopicExpansionQueryPlanSchema = z.object({
  primaryQueriesZh: z.array(z.string().trim().min(1)).min(1),
  secondaryQueriesZh: z.array(z.string().trim().min(1)),
  primaryQueriesEn: z.array(z.string().trim().min(1)).min(1),
  secondaryQueriesEn: z.array(z.string().trim().min(1)),
  excludedDriftTerms: z.array(z.string().trim().min(1)),
});

export const CandidateTopicSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  domain: TopicExpansionDomainSchema,
  angle: z.string().trim().min(1),
  researchQuestion: z.string().trim().min(1),
  sourceTypes: z.array(z.string().trim().min(1)).min(1),
  expectedEvidence: z.array(z.string().trim().min(1)).min(1),
  seedKeywords: z.array(z.string().trim().min(1)).min(1),
  priority: z.number(),
});

export const TopicDirectionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  researchQuestion: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  sourceTypes: z.array(z.string().trim().min(1)).min(1),
  queryZh: z.array(z.string().trim().min(1)).min(1),
  queryEn: z.array(z.string().trim().min(1)).min(1),
  excludeTerms: z.array(z.string().trim().min(1)),
  expectedEvidence: z.array(z.string().trim().min(1)).min(1),
  evidenceNeed: z.array(z.string().trim().min(1)).min(1),
  searchPriority: z.number().int().positive(),
  broadSuggestion: z.boolean().optional(),
});

export const TitleCandidateSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  style: TitleCandidateStyleSchema,
  displayOnly: z.boolean(),
  source: z.enum(["llm", "rule", "hybrid"]).optional(),
});

const HiddenResearchPlanSubtopicSchema = z.object({
  id: z.string().trim().min(1),
  titleZh: z.string().trim().min(1),
  titleEn: z.string().trim().min(1).optional(),
  queryZh: z.array(z.string().trim().min(1)),
  queryEn: z.array(z.string().trim().min(1)),
  mustIncludeTerms: z.array(z.string().trim().min(1)).optional(),
  excludeTerms: z.array(z.string().trim().min(1)).optional(),
  expectedSourceTypes: z.array(z.string().trim().min(1)).optional(),
});

export const HiddenResearchPlanSchema = z.object({
  selectedTopicSeed: z.string().trim().min(1),
  possibleDomains: z.array(TopicExpansionDomainSchema),
  displayTitle: z.string().trim().min(1).optional(),
  canonicalTopicZh: z.string().trim().min(1).optional(),
  canonicalTopicEn: z.string().trim().min(1).optional(),
  querySeedZh: z.array(z.string().trim().min(1)),
  querySeedEn: z.array(z.string().trim().min(1)),
  mustIncludeTerms: z.array(z.string().trim().min(1)).optional(),
  excludeTerms: z.array(z.string().trim().min(1)).optional(),
  domainHints: z.array(z.string().trim().min(1)).optional(),
  subtopics: z.array(HiddenResearchPlanSubtopicSchema).optional(),
  selectedResearchPlanId: z.string().trim().min(1).optional(),
});

export const TopicExpansionRequestSchema = z.object({
  topic: z.string().trim().min(1),
  reportType: z.string().optional(),
  audience: z.string().optional(),
  sourceMode: z.string().optional(),
  language: z.string().optional(),
});

export const TopicExpansionContentSchema = z.object({
  expandedTopic: z.string().trim().min(1),
  researchQuestions: z.array(z.string().trim().min(1)).min(1),
  searchKeywords: z.object({
    zh: z.array(z.string().trim().min(1)),
    en: z.array(z.string().trim().min(1)),
    synonyms: z.array(z.string().trim().min(1)),
    academic: z.array(z.string().trim().min(1)),
  }),
  sourceStrategy: z.array(z.string().trim().min(1)).min(1),
  exclusions: z.array(z.string().trim().min(1)),
});

export const TopicExpansionDiagnosticsSchema = z.object({
  developerOnly: z.boolean().optional(),
  llm_status: LlmStructuredStatusSchema.optional(),
  provider: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().optional(),
  cacheHit: z.boolean().optional(),
  requestId: z.string().min(1).optional(),
  rawResponseHash: z.string().min(1).optional(),
  generatedAt: z.string().min(1).optional(),
  originalTopic: z.string().optional(),
  normalizedTopic: z.string().optional(),
  canonicalEnglishTopic: z.string().optional(),
  domain: TopicDomainSchema.optional(),
  coreConcepts: z.array(z.string().trim().min(1)).optional(),
  searchQueries: z
    .object({
      zh: z.array(z.string().trim().min(1)),
      en: z.array(z.string().trim().min(1)),
    })
    .optional(),
  secondaryDomains: z.array(TopicExpansionDomainSchema).optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  keywordExpansion: TopicExpansionKeywordExpansionSchema.nullable().optional(),
  inputKind: TopicExpansionInputKindSchema.optional(),
  topicDomain: TopicExpansionDomainSchema.optional(),
  entityType: TopicExpansionEntityTypeSchema.optional(),
  selectedLensIds: z.array(z.string().trim().min(1)).optional(),
  rejectedLensIds: z.array(z.string().trim().min(1)).optional(),
  lensRejectReasons: z.record(z.string()).optional(),
  generationMode: TopicExpansionGenerationModeSchema.optional(),
  modelUsed: z.string().optional(),
  llmLatencyMs: z.number().optional(),
  provider_status: z.enum([
    "invalid_input",
    "ollama_unavailable",
    "provider_unavailable",
    "provider_error",
    "model_not_found",
    "timeout",
    "json_parse_failed",
    "schema_validation_failed",
    "ok",
  ]),
  fallbackUsed: z.boolean(),
  fallback_used: z.boolean().optional(),
  fallbackReason: z.string().optional(),
  fallbackModel: z.string().optional(),
  latencyMs: z.number().optional(),
  rawOutputSample: z.string().optional(),
  normalizedFields: z.array(z.string()).optional(),
  validationIssues: z.array(z.string()).optional(),
  validationErrors: z.array(z.string()).optional(),
});

export const TopicExpansionResponseSchema = z.object({
  status: LlmStructuredStatusSchema,
  message: z.string().optional(),
  originalTopic: z.string().optional(),
  inputKind: TopicExpansionInputKindSchema.optional(),
  topicDomain: TopicExpansionDomainSchema.optional(),
  entityType: TopicExpansionEntityTypeSchema.optional(),
  secondaryDomains: z.array(TopicExpansionDomainSchema).optional(),
  generationMode: TopicExpansionGenerationModeSchema.optional(),
  fallbackReason: z.string().optional(),
  modelUsed: z.string().optional(),
  llmLatencyMs: z.number().optional(),
  keywordExpansion: TopicExpansionKeywordExpansionSchema.nullable().optional(),
  candidateCount: z.number().int().nonnegative().optional(),
  expandedTopic: z.string(),
  researchQuestions: z.array(z.string().trim().min(1)),
  searchKeywords: z.object({
    zh: z.array(z.string().trim().min(1)),
    en: z.array(z.string().trim().min(1)),
    synonyms: z.array(z.string().trim().min(1)),
    academic: z.array(z.string().trim().min(1)),
  }),
  sourceStrategy: z.array(z.string().trim().min(1)),
  exclusions: z.array(z.string().trim().min(1)),
  titleCandidates: z.array(TitleCandidateSchema).optional(),
  hiddenResearchPlan: HiddenResearchPlanSchema.nullable().optional(),
  directions: z.array(TopicDirectionSchema).optional(),
  diagnostics: TopicExpansionDiagnosticsSchema,
});

export type TopicExpansionRequest = z.infer<typeof TopicExpansionRequestSchema>;
export type TopicExpansionContent = z.infer<typeof TopicExpansionContentSchema>;
export type TopicExpansionDiagnostics = z.infer<typeof TopicExpansionDiagnosticsSchema>;
export type TopicExpansionResponse = z.infer<typeof TopicExpansionResponseSchema>;
export type TopicExpansionInputKind = z.infer<typeof TopicExpansionInputKindSchema>;
export type TopicExpansionDomain = z.infer<typeof TopicExpansionDomainSchema>;
export type TopicExpansionEntityType = z.infer<typeof TopicExpansionEntityTypeSchema>;
export type TopicExpansionGenerationMode = z.infer<
  typeof TopicExpansionGenerationModeSchema
>;
export type TopicExpansionKeywordExpansion = z.infer<
  typeof TopicExpansionKeywordExpansionSchema
>;
export type TopicExpansionQueryPlan = z.infer<typeof TopicExpansionQueryPlanSchema>;
export type CandidateTopic = z.infer<typeof CandidateTopicSchema>;
export type TopicDirection = z.infer<typeof TopicDirectionSchema>;
export type TitleCandidate = z.infer<typeof TitleCandidateSchema>;
export type TitleCandidateStyle = z.infer<typeof TitleCandidateStyleSchema>;
export type HiddenResearchPlan = z.infer<typeof HiddenResearchPlanSchema>;
