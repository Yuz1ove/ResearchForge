import { z } from "zod";

export const TopicSemanticPrimaryTypeSchema = z.enum([
  "chemistry_reaction",
  "biology_mechanism",
  "environmental_issue",
  "physics_phenomenon",
  "social_issue",
  "engineering_system",
  "education_topic",
  "data_analysis_topic",
  "general_research_topic",
]);
export type TopicSemanticPrimaryType = z.infer<typeof TopicSemanticPrimaryTypeSchema>;

export const TopicSemanticClassificationSchema = z.object({
  originalTopic: z.string(),
  normalizedTopic: z.string(),
  primaryType: TopicSemanticPrimaryTypeSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  keyConcepts: z.array(z.string()),
  observableLevel: z
    .object({
      microscopic: z.string().optional(),
      macroscopic: z.string().optional(),
    })
    .optional(),
});
export type TopicSemanticClassification = z.infer<typeof TopicSemanticClassificationSchema>;

export const ExpandedQuerySchema = z.object({
  query: z.string(),
  language: z.enum(["zh-TW", "en"]),
  purpose: z.enum([
    "definition",
    "mechanism",
    "observable_phenomenon",
    "application",
    "academic_source",
    "background",
    "research_angle",
  ]),
  source: z.enum(["semantic_classification", "translation", "llm_expansion", "fallback"]),
  confidence: z.number().min(0).max(1),
});
export type ExpandedQuery = z.infer<typeof ExpandedQuerySchema>;

export const SourceSearchConfigSchema = z.object({
  candidateTarget: z.number().int().positive(),
  acceptedTarget: z.number().int().positive(),
  minAccepted: z.number().int().positive(),
});
export type SourceSearchConfig = z.infer<typeof SourceSearchConfigSchema>;

export const SourceValidationSchema = z.object({
  sourceId: z.string(),
  urlReachable: z.boolean(),
  canonicalUrl: z.string().optional(),
  doi: z.string().optional(),
  publisher: z.string().optional(),
  year: z.number().int().optional(),
  sourceType: z.enum([
    "journal",
    "academic_database",
    "government",
    "education",
    "news",
    "encyclopedia",
    "blog",
    "unknown",
  ]),
  reliabilityScore: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});
export type SourceValidation = z.infer<typeof SourceValidationSchema>;

export const ReadableExtractionSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  abstract: z.string().optional(),
  extractedText: z.string().optional(),
  extractionStatus: z.enum(["success", "partial", "failed"]),
  language: z.enum(["zh-TW", "en", "unknown"]),
  extractionWarnings: z.array(z.string()),
});
export type ReadableExtraction = z.infer<typeof ReadableExtractionSchema>;

export const SourceFactCategorySchema = z.enum([
  "definition",
  "mechanism",
  "observable_phenomenon",
  "application",
  "method",
  "limitation",
  "background",
]);
export type SourceFactCategory = z.infer<typeof SourceFactCategorySchema>;

export const SourceFactSchema = z.object({
  sourceId: z.string(),
  fact: z.string(),
  category: SourceFactCategorySchema,
  relevanceToTopic: z.number().min(0).max(1),
  supportedByText: z.string(),
});
export type SourceFact = z.infer<typeof SourceFactSchema>;

export const RelevanceScoreSchema = z.object({
  sourceId: z.string(),
  topicMatch: z.number().min(0).max(1),
  semanticMatch: z.number().min(0).max(1),
  queryMatch: z.number().min(0).max(1),
  evidenceUsefulness: z.number().min(0).max(1),
  reliabilityScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
  label: z.enum(["high", "medium", "low"]),
  reason: z.string(),
});
export type RelevanceScore = z.infer<typeof RelevanceScoreSchema>;

export const PipelineEvidenceCardSchema = z.object({
  id: z.string(),
  sourceIds: z.array(z.string()),
  claim: z.string(),
  evidenceType: z.enum([
    "definition",
    "mechanism",
    "observable_phenomenon",
    "application",
    "comparison",
    "limitation",
    "research_angle",
  ]),
  explanation: z.string(),
  confidence: z.number().min(0).max(1),
  citationText: z.string(),
});
export type PipelineEvidenceCard = z.infer<typeof PipelineEvidenceCardSchema>;

export const IntroClaimSchema = z.object({
  claim: z.string(),
  sourceIds: z.array(z.string()),
  evidenceType: z.enum([
    "definition",
    "mechanism",
    "observable_phenomenon",
    "application",
    "research_angle",
    "limitation",
  ]),
  confidence: z.number().min(0).max(1),
});
export type IntroClaim = z.infer<typeof IntroClaimSchema>;

export const IntroValidationSchema = z.object({
  unsupportedClaims: z.array(z.string()),
  overgeneralizedClaims: z.array(z.string()),
  templateDetected: z.boolean(),
  sourceCoverage: z.number().min(0).max(1),
  passed: z.boolean(),
  fallbackReason: z.string().optional(),
});
export type IntroValidation = z.infer<typeof IntroValidationSchema>;

export const ReportParagraphSchema = z.object({
  sectionTitle: z.string(),
  paragraph: z.string(),
  usedEvidenceCardIds: z.array(z.string()),
  usedSourceIds: z.array(z.string()),
  citationMarkers: z.array(z.string()),
});
export type ReportParagraph = z.infer<typeof ReportParagraphSchema>;

export const SourceSummarySchema = z.object({
  sourceId: z.string(),
  summary: z.string(),
  basedOn: z.enum([
    "title",
    "abstract",
    "extractedText",
    "title_and_abstract",
    "partial_content",
  ]),
  language: z.literal("zh-TW"),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});
export type SourceSummary = z.infer<typeof SourceSummarySchema>;

export const ResearchDebugTraceSchema = z.object({
  originalTopic: z.string(),
  normalizedTopic: z.string(),
  semanticClassification: TopicSemanticClassificationSchema,
  expandedQueries: z.array(ExpandedQuerySchema),
  candidateSourceCount: z.number().int().min(0),
  acceptedSourceCount: z.number().int().min(0),
  sourceValidations: z.array(SourceValidationSchema),
  readableExtractions: z.array(ReadableExtractionSchema),
  sourceFacts: z.array(SourceFactSchema),
  relevanceScores: z.array(RelevanceScoreSchema),
  evidenceCards: z.array(PipelineEvidenceCardSchema),
  introClaims: z.array(IntroClaimSchema),
  introValidation: IntroValidationSchema,
  generatedTitle: z.string(),
  generatedSubtitle: z.string(),
  generatedIntro: z.string(),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional(),
  hardCodedTemplateDetected: z.boolean(),
});
export type ResearchDebugTrace = z.infer<typeof ResearchDebugTraceSchema>;
