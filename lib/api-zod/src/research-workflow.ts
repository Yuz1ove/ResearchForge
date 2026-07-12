import { z } from "zod";

export const ResearchDepthSchema = z.enum(["quick", "standard", "deep"]);
export type ResearchDepth = z.infer<typeof ResearchDepthSchema>;

export const ResearchProjectStatusSchema = z.enum([
  "draft",
  "searching",
  "selecting_sources",
  "extracting_evidence",
  "drafting",
  "judging",
  "ready_to_export",
  "exported",
]);
export type ResearchProjectStatus = z.infer<typeof ResearchProjectStatusSchema>;

export const ResearchSectionKeySchema = z.enum([
  "title",
  "abstract",
  "introduction",
  "research_question",
  "literature_review",
  "methodology",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
  "references",
]);
export type ResearchSectionKey = z.infer<typeof ResearchSectionKeySchema>;

export const EvidenceDerivationSchema = z.enum([
  "abstract-derived",
  "metadata-derived",
  "fulltext-derived",
]);
export type EvidenceDerivation = z.infer<typeof EvidenceDerivationSchema>;

export const QualityReadinessSchema = z.enum([
  "insufficient",
  "preliminary",
  "usable",
  "strong",
]);
export type QualityReadiness = z.infer<typeof QualityReadinessSchema>;

const NullableStringSchema = z.string().nullable();

export const ResearchProjectSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  reportType: z.string().min(1),
  depth: ResearchDepthSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  status: ResearchProjectStatusSchema,
});
export type ResearchProject = z.infer<typeof ResearchProjectSchema>;

export const ResearchSourceSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  authors: z.array(z.string()),
  year: z.number().int().nullable(),
  url: NullableStringSchema,
  doi: NullableStringSchema,
  abstract: NullableStringSchema,
  provider: z.string(),
  sourceType: z.string(),
  relevanceScore: z.number().nullable(),
  credibilityScore: z.number().nullable(),
  accepted: z.boolean(),
  rejected: z.boolean(),
  collapsed: z.boolean(),
  tags: z.array(z.string()),
  raw: z.unknown().nullable(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const EvidenceCardSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  claim: z.string(),
  quoteOrParaphrase: z.string(),
  summary: z.string(),
  relevance: z.string(),
  confidence: z.number().min(0).max(1),
  sectionHints: z.array(ResearchSectionKeySchema),
  citationText: z.string(),
  pageOrLocation: z.string().optional(),
  derivation: EvidenceDerivationSchema,
  limitation: z.string().nullable(),
  createdAt: z.string().min(1),
});
export type EvidenceCard = z.infer<typeof EvidenceCardSchema>;

export const ReportSectionSchema = z.object({
  id: z.string().min(1),
  key: ResearchSectionKeySchema,
  title: z.string(),
  content: z.string(),
  evidenceCardIds: z.array(z.string()),
  citationIds: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

export const QualityReportSchema = z.object({
  sourceCount: z.number().int().min(0),
  acceptedSourceCount: z.number().int().min(0),
  evidenceCardCount: z.number().int().min(0),
  missingCitationWarnings: z.array(z.string()),
  unsupportedClaimWarnings: z.array(z.string()),
  overclaimWarnings: z.array(z.string()),
  topicDriftWarnings: z.array(z.string()),
  readiness: QualityReadinessSchema,
});
export type QualityReport = z.infer<typeof QualityReportSchema>;

export const ResearchDraftSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sections: z.array(ReportSectionSchema),
  references: z.array(z.string()),
  qualityReport: QualityReportSchema,
  createdAt: z.string().min(1),
  exportStatus: z.enum(["not_exported", "docx_ready", "markdown_ready", "pdf_available", "exported"]),
});
export type ResearchDraft = z.infer<typeof ResearchDraftSchema>;

