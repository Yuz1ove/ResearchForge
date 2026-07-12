import { z } from "zod";

export const ResearchLanguageSchema = z.enum(["zh", "en", "mixed", "unknown"]);
export type ResearchLanguage = z.infer<typeof ResearchLanguageSchema>;

export const ResearchEvidenceTypeSchema = z.enum([
  "background",
  "mechanism",
  "data",
  "experiment",
  "review",
  "case",
  "policy",
  "unknown",
]);
export type ResearchEvidenceType = z.infer<typeof ResearchEvidenceTypeSchema>;

export const ResearchRequiredSourceTypeSchema = z.enum([
  "journal",
  "conference",
  "preprint",
  "book",
  "dataset",
  "government",
  "web",
]);
export type ResearchRequiredSourceType = z.infer<
  typeof ResearchRequiredSourceTypeSchema
>;

export const ResearchSearchIntentSchema = z.enum([
  "academic_report",
  "science_report",
  "social_report",
  "business_report",
  "general_report",
]);
export type ResearchSearchIntent = z.infer<typeof ResearchSearchIntentSchema>;

export const ResearchSubtopicSchema = z.object({
  id: z.string().trim().min(1),
  labelZh: z.string().trim().min(1),
  labelEn: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1),
  requiredEvidenceType: ResearchEvidenceTypeSchema,
});
export type ResearchSubtopic = z.infer<typeof ResearchSubtopicSchema>;

export const ResearchQueryPlanSchema = z.object({
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  queryHash: z.string().trim().min(1),
  queryPlanHash: z.string().trim().min(1).optional(),
  originalTopic: z.string().trim().min(1),
  normalizedTopic: z.string().trim().min(1),
  language: ResearchLanguageSchema,
  zhQueries: z.array(z.string().trim().min(1)),
  enQueries: z.array(z.string().trim().min(1)),
  researchSubtopics: z.array(ResearchSubtopicSchema),
  requiredSourceTypes: z.array(ResearchRequiredSourceTypeSchema),
  excludedDriftTerms: z.array(z.string().trim().min(1)),
  searchIntent: ResearchSearchIntentSchema,
  qualityWarnings: z.array(z.string().trim().min(1)).optional(),
  diagnostics: z
    .object({
      plannerStatus: z.string().trim().min(1).optional(),
      fallbackUsed: z.boolean().optional(),
      originalTopic: z.string().trim().min(1).optional(),
      activeResearchTopic: z.string().trim().min(1).optional(),
      canonicalEnglishTopic: z.string().trim().min(1).optional(),
      primaryConcepts: z.array(z.string().trim().min(1)).optional(),
      contextConcepts: z.array(z.string().trim().min(1)).optional(),
      reasoningNotes: z.array(z.string().trim().min(1)).optional(),
    })
    .optional(),
});
export type ResearchQueryPlan = z.infer<typeof ResearchQueryPlanSchema>;

export const NormalizedSourceTypeSchema = z.enum([
  "journal",
  "conference",
  "preprint",
  "book",
  "dataset",
  "government",
  "web",
  "unknown",
]);
export type NormalizedSourceType = z.infer<typeof NormalizedSourceTypeSchema>;

export const NormalizedSourceSchema = z.object({
  id: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  topicHash: z.string().trim().min(1),
  queryHash: z.string().trim().min(1).optional(),
  queryPlanHash: z.string().trim().min(1).optional(),
  provider: z.string().trim().min(1),
  queryUsed: z.string().trim().min(1),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)),
  year: z.number().int().optional(),
  venue: z.string().trim().min(1).optional(),
  publisher: z.string().trim().min(1).optional(),
  doi: z.string().trim().min(1).optional(),
  url: z.string().trim().min(1).optional(),
  abstract: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  languageConfidence: z.number().min(0).max(1).optional(),
  keywords: z.array(z.string().trim().min(1)).optional(),
  sourceType: NormalizedSourceTypeSchema,
  isPeerReviewed: z.boolean().optional(),
  isOpenAccess: z.boolean().optional(),
  fullTextUrl: z.string().trim().min(1).optional(),
  citationCount: z.number().int().min(0).optional(),
  relevanceScore: z.number().min(0).max(100).optional(),
  sourceQualityScore: z.number().min(0).max(100).optional(),
  finalScore: z.number().min(0).max(100).optional(),
  dedupeKey: z.string().trim().min(1),
  mergedFrom: z
    .array(
      z.object({
        provider: z.string().trim().min(1),
        id: z.string().trim().min(1).optional(),
        doi: z.string().trim().min(1).optional(),
        url: z.string().trim().min(1).optional(),
      }),
    )
    .optional(),
  retrievedAt: z.string().trim().min(1),
  rightsNote: z.string().trim().min(1).optional(),
  license: z.string().trim().min(1).optional(),
  rawProviderPayload: z.unknown().optional(),
});
export type NormalizedSource = z.infer<typeof NormalizedSourceSchema>;

export const ParsedDocumentMethodSchema = z.enum([
  "api-abstract",
  "grobid",
  "tika",
  "pymupdf",
  "pdfminer",
  "pdfplumber",
  "unstructured",
  "docling",
  "marker",
  "mineru",
  "tesseract",
  "paddleocr",
  "readable-html",
]);
export type ParsedDocumentMethod = z.infer<typeof ParsedDocumentMethodSchema>;

export const ParsedDocumentSchema = z.object({
  sourceId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  extractionMethod: ParsedDocumentMethodSchema,
  title: z.string().trim().min(1).optional(),
  abstract: z.string().trim().min(1).optional(),
  sections: z
    .array(
      z.object({
        heading: z.string().trim().min(1),
        text: z.string().trim().min(1),
        pageStart: z.number().int().optional(),
        pageEnd: z.number().int().optional(),
      }),
    )
    .optional(),
  references: z
    .array(
      z.object({
        title: z.string().trim().min(1).optional(),
        authors: z.array(z.string().trim().min(1)).optional(),
        year: z.number().int().optional(),
        doi: z.string().trim().min(1).optional(),
        raw: z.string().trim().min(1).optional(),
      }),
    )
    .optional(),
  tables: z
    .array(
      z.object({
        caption: z.string().trim().min(1).optional(),
        markdown: z.string().trim().min(1).optional(),
        csv: z.string().trim().min(1).optional(),
        page: z.number().int().optional(),
      }),
    )
    .optional(),
  fullText: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  confidence: z.enum(["high", "medium", "low"]),
  requiresOcr: z.boolean().optional(),
  warnings: z.array(z.string().trim().min(1)).optional(),
});
export type ParsedDocument = z.infer<typeof ParsedDocumentSchema>;

export const ResearchEvidenceBasisSchema = z.enum([
  "metadata-only",
  "abstract-based",
  "full-text-based",
  "ocr-based",
]);
export type ResearchEvidenceBasis = z.infer<
  typeof ResearchEvidenceBasisSchema
>;

export const ResearchEvidenceCardSchema = z.object({
  id: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  citationMarker: z.string().trim().min(1),
  researchSubtopic: z.string().trim().min(1),
  claimOrFinding: z.string().trim().min(1),
  methodOrData: z.string().trim().min(1).optional(),
  keyEvidence: z.string().trim().min(1),
  usableSections: z.array(z.string().trim().min(1)),
  limitations: z.array(z.string().trim().min(1)),
  relevanceReason: z.string().trim().min(1),
  translatedSummaryZh: z.string().trim().min(1),
  originalAbstract: z.string().trim().min(1).optional(),
  sourceQualityScore: z.number().min(0).max(100),
  relevanceScore: z.number().min(0).max(100),
  evidenceBasis: ResearchEvidenceBasisSchema,
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().trim().min(1)).optional(),
});
export type ResearchEvidenceCard = z.infer<typeof ResearchEvidenceCardSchema>;

export const ResearchReportParagraphSchema = z.object({
  id: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  sectionTitle: z.string().trim().min(1),
  paragraphPurpose: z.string().trim().min(1),
  text: z.string().trim().min(1),
  evidenceCardIds: z.array(z.string().trim().min(1)),
  citationIds: z.array(z.string().trim().min(1)),
  warnings: z.array(z.string().trim().min(1)),
});
export type ResearchReportParagraph = z.infer<
  typeof ResearchReportParagraphSchema
>;

export const ResearchToolHealthStateSchema = z.enum([
  "OK",
  "Failed",
  "Missing",
  "Optional",
  "Not running",
  "Not configured",
  "Rate limited",
  "Future",
]);
export type ResearchToolHealthState = z.infer<
  typeof ResearchToolHealthStateSchema
>;

export const ResearchToolHealthItemSchema = z.object({
  name: z.string().trim().min(1),
  state: ResearchToolHealthStateSchema,
  detail: z.string().trim().min(1).optional(),
  category: z.enum(["api", "parser", "ocr", "vector", "web", "database"]),
});
export type ResearchToolHealthItem = z.infer<
  typeof ResearchToolHealthItemSchema
>;

export const ResearchToolsHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checkedAt: z.string().trim().min(1),
  items: z.array(ResearchToolHealthItemSchema),
});
export type ResearchToolsHealthResponse = z.infer<
  typeof ResearchToolsHealthResponseSchema
>;

export const ResearchQueryPlanRequestSchema = z.object({
  topic: z.string().trim().min(1),
  reportType: z.string().trim().min(1).optional(),
  audience: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  sourceMode: z.string().trim().min(1).optional(),
});
export type ResearchQueryPlanRequest = z.infer<
  typeof ResearchQueryPlanRequestSchema
>;

export const ResearchSearchRequestSchema = z.object({
  topic: z.string().trim().min(1).optional(),
  queryPlan: ResearchQueryPlanSchema.optional(),
  targetAcceptedCount: z.number().int().min(1).max(50).optional(),
  includeRawPayload: z.boolean().optional(),
});
export type ResearchSearchRequest = z.infer<typeof ResearchSearchRequestSchema>;

export const ResearchSearchResponseSchema = z.object({
  ok: z.boolean(),
  queryPlan: ResearchQueryPlanSchema,
  candidateSources: z.array(NormalizedSourceSchema),
  dedupedSources: z.array(NormalizedSourceSchema),
  acceptedSources: z.array(NormalizedSourceSchema),
  providerDiagnostics: z.array(
    z.object({
      provider: z.string().trim().min(1),
      query: z.string().trim().min(1),
      ok: z.boolean(),
      resultCount: z.number().int().min(0),
      errorType: z.string().trim().min(1).nullable().optional(),
      errorMessage: z.string().trim().min(1).nullable().optional(),
    }),
  ),
  warnings: z.array(z.string().trim().min(1)),
});
export type ResearchSearchResponse = z.infer<
  typeof ResearchSearchResponseSchema
>;

export const ResearchParseSourceRequestSchema = z.object({
  source: NormalizedSourceSchema,
});
export type ResearchParseSourceRequest = z.infer<
  typeof ResearchParseSourceRequestSchema
>;

export const ResearchBuildEvidenceCardsRequestSchema = z.object({
  topic: z.string().trim().min(1),
  queryPlan: ResearchQueryPlanSchema,
  acceptedSources: z.array(NormalizedSourceSchema),
  parsedDocuments: z.array(ParsedDocumentSchema).optional(),
});
export type ResearchBuildEvidenceCardsRequest = z.infer<
  typeof ResearchBuildEvidenceCardsRequestSchema
>;

export const ResearchBuildEvidenceCardsResponseSchema = z.object({
  ok: z.boolean(),
  workflowId: z.string().trim().min(1),
  evidenceCards: z.array(ResearchEvidenceCardSchema),
  warnings: z.array(z.string().trim().min(1)),
});
export type ResearchBuildEvidenceCardsResponse = z.infer<
  typeof ResearchBuildEvidenceCardsResponseSchema
>;

export const ResearchSynthesizeReportRequestSchema = z.object({
  topic: z.string().trim().min(1),
  queryPlan: ResearchQueryPlanSchema,
  acceptedSources: z.array(NormalizedSourceSchema),
  evidenceCards: z.array(ResearchEvidenceCardSchema),
  reportStyle: z.string().trim().min(1).optional(),
});
export type ResearchSynthesizeReportRequest = z.infer<
  typeof ResearchSynthesizeReportRequestSchema
>;

export const ResearchSynthesizeReportResponseSchema = z.object({
  ok: z.boolean(),
  workflowId: z.string().trim().min(1),
  reportTitle: z.string().trim().min(1),
  paragraphs: z.array(ResearchReportParagraphSchema),
  warnings: z.array(z.string().trim().min(1)),
  llmStatus: z.string().trim().min(1),
});
export type ResearchSynthesizeReportResponse = z.infer<
  typeof ResearchSynthesizeReportResponseSchema
>;
