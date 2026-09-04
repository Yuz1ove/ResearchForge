import { z } from "zod";

export const RESEARCH_PRODUCT_WORKFLOW_SCHEMA_VERSION =
  "researchforge.product-workflow.v1" as const;

export const ProductWorkflowModeSchema = z.enum([
  "LIVE",
  "REPLAY",
  "FIXTURE",
  "SYNTHETIC",
  "USER_UPLOADED",
  "LOCAL_PARSE",
  "MODEL_INFERENCE",
  "LIVE_EXTERNAL_LOOKUP",
]);
export type ProductWorkflowMode = z.infer<typeof ProductWorkflowModeSchema>;

export const ProductWorkflowStateSchema = z.enum([
  "DRAFT",
  "RESEARCHING",
  "SOURCES_FOUND",
  "EVIDENCE_PROCESSING",
  "EVIDENCE_REVIEW_REQUIRED",
  "PLAN_READY",
  "GENERATING",
  "VERIFYING",
  "REVISION_REQUIRED",
  "READY",
  "EXPORTING",
  "COMPLETE",
  "FAILED_RECOVERABLE",
  "BLOCKED",
]);
export type ProductWorkflowState = z.infer<typeof ProductWorkflowStateSchema>;

export const ProductWorkflowFailureCodeSchema = z.enum([
  "SOURCE_PROVIDER_TIMEOUT",
  "SOURCE_PROVIDER_RATE_LIMIT",
  "SOURCE_PROVIDER_AUTH_ERROR",
  "FULLTEXT_UNAVAILABLE",
  "DOCUMENT_PARSE_FAILED",
  "OCR_FAILED",
  "EVIDENCE_EXTRACTION_FAILED",
  "MODEL_TIMEOUT",
  "MODEL_SCHEMA_INVALID",
  "GENERATION_FAILED",
  "CITATION_BINDING_FAILED",
  "CLAIM_UNSUPPORTED",
  "EXPORT_FAILED",
  "DATABASE_ERROR",
  "NETWORK_BLOCKED",
  "INVALID_TRANSITION",
  "EVIDENCE_REVIEW_REQUIRED",
]);
export type ProductWorkflowFailureCode = z.infer<
  typeof ProductWorkflowFailureCodeSchema
>;

export const EntityProvenanceSchema = z.object({
  mode: ProductWorkflowModeSchema,
  producer: z.string().trim().min(1),
  producerVersion: z.string().trim().min(1),
  parentRefs: z.array(z.string().trim().min(1)),
  generatedAt: z.string().datetime(),
});
export type EntityProvenance = z.infer<typeof EntityProvenanceSchema>;

export const ResearchIntentV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  version: z.number().int().positive(),
  topic: z.string().trim().min(1),
  reportType: z.string().trim().min(1),
  targetAudience: z.string().trim().min(1),
  targetLanguage: z.string().trim().min(1),
  depth: z.enum(["quick", "standard", "deep"]),
  timeframe: z.string().trim().min(1).nullable(),
  sourceConstraints: z.array(z.string().trim().min(1)),
  preferredDisciplines: z.array(z.string().trim().min(1)),
  excludedSourceCategories: z.array(z.string().trim().min(1)),
  expectedOutputFormats: z.array(
    z.enum(["pdf", "docx", "markdown", "json_bundle"]),
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ResearchIntentV1 = z.infer<typeof ResearchIntentV1Schema>;

export const ResearchQuestionV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  version: z.number().int().positive(),
  text: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  order: z.number().int().min(0),
  status: z.enum(["active", "excluded"]),
  origin: z.enum(["deterministic_decomposition", "llm", "user"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ResearchQuestionV1 = z.infer<typeof ResearchQuestionV1Schema>;

export const SearchQueryV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  researchQuestionId: z.string().trim().min(1),
  query: z.string().trim().min(1),
  origin: z.enum([
    "exact_keyword",
    "synonym",
    "translation",
    "technical_term",
    "narrower_subtopic",
    "exclusion",
    "citation_followup",
    "user",
  ]),
  language: z.string().trim().min(1),
  providerTarget: z.enum([
    "all",
    "openalex",
    "crossref",
    "semantic_scholar",
    "core",
  ]),
  priority: z.number().int().min(0).max(100),
  status: z.enum(["planned", "running", "completed", "failed", "cancelled"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type SearchQueryV1 = z.infer<typeof SearchQueryV1Schema>;

export const SourceCandidateV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  queryIds: z.array(z.string().trim().min(1)),
  provider: z.string().trim().min(1),
  providerId: z.string().trim().min(1).nullable(),
  providerRawRef: z.string().trim().min(1),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)),
  year: z.number().int().nullable(),
  venue: z.string().trim().min(1).nullable(),
  doi: z.string().trim().min(1).nullable(),
  url: z.string().trim().min(1).nullable(),
  abstract: z.string().trim().min(1).nullable(),
  language: z.string().trim().min(1).nullable(),
  keywords: z.array(z.string().trim().min(1)),
  sourceType: z.string().trim().min(1),
  publisher: z.string().trim().min(1).nullable(),
  citationCount: z.number().int().min(0).nullable(),
  openAccess: z.boolean().nullable(),
  license: z.string().trim().min(1).nullable(),
  relevance: z.number().min(0).max(1),
  authority: z.number().min(0).max(1),
  retrievedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type SourceCandidateV1 = z.infer<typeof SourceCandidateV1Schema>;

export const SourceCandidateInputSchema = SourceCandidateV1Schema.omit({
  projectId: true,
  retrievedAt: true,
  provenance: true,
});
export type SourceCandidateInput = z.infer<typeof SourceCandidateInputSchema>;

export const SourceAdmissionStatusSchema = z.enum([
  "ACCEPTED",
  "REJECTED_LOW_RELEVANCE",
  "REJECTED_DUPLICATE",
  "REJECTED_UNVERIFIABLE",
  "REVIEW_REQUIRED",
  "FULLTEXT_UNAVAILABLE",
  "METADATA_ONLY",
  "CONFLICTING",
]);
export type SourceAdmissionStatus = z.infer<
  typeof SourceAdmissionStatusSchema
>;

export const SourceQualityDimensionsSchema = z.object({
  authority: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
  recency: z.number().min(0).max(1).nullable(),
  metadataCompleteness: z.number().min(0).max(1),
  peerReviewStatus: z.enum(["confirmed", "not_peer_reviewed", "unknown"]),
  openAccessStatus: z.enum(["open", "restricted", "unknown"]),
  sourceIntegrity: z.enum(["traceable", "partial", "unverifiable"]),
  independence: z.enum(["independent", "related", "unknown"]),
  conflictStatus: z.enum(["none", "potential", "confirmed", "unknown"]),
});
export type SourceQualityDimensions = z.infer<
  typeof SourceQualityDimensionsSchema
>;

export const SourceRecordV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  version: z.number().int().positive(),
  canonicalKey: z.string().trim().min(1),
  mergedCandidateIds: z.array(z.string().trim().min(1)).min(1),
  duplicateGroupId: z.string().trim().min(1).nullable(),
  title: z.string().trim().min(1),
  authors: z.array(z.string().trim().min(1)),
  year: z.number().int().nullable(),
  venue: z.string().trim().min(1).nullable(),
  doi: z.string().trim().min(1).nullable(),
  url: z.string().trim().min(1).nullable(),
  abstract: z.string().trim().min(1).nullable(),
  language: z.string().trim().min(1).nullable(),
  sourceType: z.string().trim().min(1),
  publisher: z.string().trim().min(1).nullable(),
  license: z.string().trim().min(1).nullable(),
  admissionStatus: SourceAdmissionStatusSchema,
  admissionReasons: z.array(z.string().trim().min(1)),
  quality: SourceQualityDimensionsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type SourceRecordV1 = z.infer<typeof SourceRecordV1Schema>;

export const DocumentAccessStatusSchema = z.enum([
  "METADATA_ONLY",
  "ABSTRACT_ONLY",
  "FULLTEXT_HTML",
  "FULLTEXT_PDF",
  "FULLTEXT_XML",
  "USER_UPLOADED",
  "UNAVAILABLE",
  "ACCESS_RESTRICTED",
]);
export type DocumentAccessStatus = z.infer<typeof DocumentAccessStatusSchema>;

export const DocumentRecordV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  version: z.number().int().positive(),
  accessStatus: DocumentAccessStatusSchema,
  mediaType: z.string().trim().min(1).nullable(),
  contentRef: z.string().trim().min(1).nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u).nullable(),
  rights: z.enum(["permitted", "restricted", "unknown"]),
  acquisitionStatus: z.enum(["available", "unavailable", "failed", "not_requested"]),
  acquiredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type DocumentRecordV1 = z.infer<typeof DocumentRecordV1Schema>;

export const ParsedBlockV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  blockType: z.enum([
    "paragraph",
    "heading",
    "table",
    "figureCaption",
    "reference",
    "abstract",
    "metadata",
    "equation",
  ]),
  text: z.string().trim().min(1),
  page: z.number().int().nullable(),
  section: z.string().trim().min(1).nullable(),
  startOffset: z.number().int().min(0).nullable(),
  endOffset: z.number().int().min(0).nullable(),
  extractor: z.string().trim().min(1),
  extractorVersion: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ParsedBlockV1 = z.infer<typeof ParsedBlockV1Schema>;

export const WorkflowEvidenceCardV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1).nullable(),
  blockId: z.string().trim().min(1).nullable(),
  version: z.number().int().positive(),
  claimText: z.string().trim().min(1),
  evidenceText: z.string().trim().min(1),
  evidenceType: z.enum([
    "DEFINITION",
    "FINDING",
    "METHOD",
    "STATISTIC",
    "COMPARISON",
    "LIMITATION",
    "RECOMMENDATION",
    "BACKGROUND",
  ]),
  researchQuestionIds: z.array(z.string().trim().min(1)),
  sectionHints: z.array(z.string().trim().min(1)),
  page: z.number().int().nullable(),
  sourceStartOffset: z.number().int().min(0).nullable(),
  sourceEndOffset: z.number().int().min(0).nullable(),
  confidence: z.number().min(0).max(1),
  qualityNotes: z.array(z.string().trim().min(1)),
  limitations: z.array(z.string().trim().min(1)),
  status: z.enum(["pending", "accepted", "rejected", "needs_review"]),
  createdBy: z.enum(["rule", "llm", "human", "import"]),
  extractorVersion: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type WorkflowEvidenceCardV1 = z.infer<
  typeof WorkflowEvidenceCardV1Schema
>;

export const EvidenceDecisionV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  evidenceCardId: z.string().trim().min(1),
  decision: z.enum(["accepted", "rejected", "needs_review"]),
  reason: z.string().trim().min(1),
  note: z.string().trim().min(1).nullable(),
  tags: z.array(z.string().trim().min(1)),
  decidedBy: z.enum(["human", "policy"]),
  createdAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type EvidenceDecisionV1 = z.infer<typeof EvidenceDecisionV1Schema>;

export const AcceptedEvidenceSetV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  version: z.number().int().positive(),
  evidenceCardIds: z.array(z.string().trim().min(1)),
  evidenceSetHash: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type AcceptedEvidenceSetV1 = z.infer<
  typeof AcceptedEvidenceSetV1Schema
>;

export const ProductReportSectionPlanV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  order: z.number().int().min(0),
  researchQuestionIds: z.array(z.string().trim().min(1)),
  candidateEvidenceIds: z.array(z.string().trim().min(1)),
  requiredEvidenceIds: z.array(z.string().trim().min(1)),
  optionalEvidenceIds: z.array(z.string().trim().min(1)),
  status: z.enum(["evidence_gap", "ready", "generated", "needs_revision"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ProductReportSectionPlanV1 = z.infer<
  typeof ProductReportSectionPlanV1Schema
>;

export const ProductReportPlanV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  acceptedEvidenceSetId: z.string().trim().min(1),
  version: z.number().int().positive(),
  sections: z.array(ProductReportSectionPlanV1Schema),
  status: z.enum(["draft", "ready", "evidence_gaps", "generated"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ProductReportPlanV1 = z.infer<typeof ProductReportPlanV1Schema>;

export const GenerationRunV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  reportPlanId: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  modelVersion: z.string().trim().min(1),
  promptTemplateVersion: z.string().trim().min(1),
  status: z.enum(["pending", "running", "completed", "failed", "blocked"]),
  output: z.string(),
  error: ProductWorkflowFailureCodeSchema.nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  provenance: EntityProvenanceSchema,
});
export type GenerationRunV1 = z.infer<typeof GenerationRunV1Schema>;

export const GeneratedClaimV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  generationRunId: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  claimText: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
  citationBindingIds: z.array(z.string().trim().min(1)),
  status: z.enum(["generated", "verified", "needs_reverification", "unsupported"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type GeneratedClaimV1 = z.infer<typeof GeneratedClaimV1Schema>;

export const CitationBindingV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  evidenceCardId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  documentId: z.string().trim().min(1).nullable(),
  blockId: z.string().trim().min(1).nullable(),
  marker: z.string().trim().min(1),
  createdAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type CitationBindingV1 = z.infer<typeof CitationBindingV1Schema>;

export const ClaimVerificationStatusSchema = z.enum([
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "UNSUPPORTED",
  "CONFLICTING",
  "UNVERIFIABLE",
  "NEEDS_REVERIFICATION",
]);
export type ClaimVerificationStatus = z.infer<
  typeof ClaimVerificationStatusSchema
>;

export const VerificationResultV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  claimId: z.string().trim().min(1),
  status: ClaimVerificationStatusSchema,
  reasonCodes: z.array(z.string().trim().min(1)),
  verifier: z.string().trim().min(1),
  verifierVersion: z.string().trim().min(1),
  verifiedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type VerificationResultV1 = z.infer<
  typeof VerificationResultV1Schema
>;

export const ReportRevisionV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  sectionId: z.string().trim().min(1),
  previousContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  nextContentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  editedBy: z.enum(["human", "model_repair"]),
  invalidatedClaimIds: z.array(z.string().trim().min(1)),
  createdAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ReportRevisionV1 = z.infer<typeof ReportRevisionV1Schema>;

export const ExportArtifactV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  format: z.enum(["pdf", "docx", "markdown", "json_bundle"]),
  reportStatus: z.enum(["draft", "verified"]),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  createdAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ExportArtifactV1 = z.infer<typeof ExportArtifactV1Schema>;

export const ProductWorkflowFailureV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  code: ProductWorkflowFailureCodeSchema,
  message: z.string().trim().min(1),
  stage: ProductWorkflowStateSchema,
  retryable: z.boolean(),
  userVisible: z.boolean(),
  requiresIntervention: z.boolean(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
});
export type ProductWorkflowFailureV1 = z.infer<
  typeof ProductWorkflowFailureV1Schema
>;

export const ProductWorkflowEventV1Schema = z.object({
  id: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  from: ProductWorkflowStateSchema.nullable(),
  to: ProductWorkflowStateSchema,
  reason: z.string().trim().min(1),
  occurredAt: z.string().datetime(),
});
export type ProductWorkflowEventV1 = z.infer<typeof ProductWorkflowEventV1Schema>;

export const ResearchProductProjectV1Schema = z.object({
  id: z.string().trim().min(1),
  workflowId: z.string().trim().min(1),
  schemaVersion: z.literal(RESEARCH_PRODUCT_WORKFLOW_SCHEMA_VERSION),
  version: z.number().int().positive(),
  status: ProductWorkflowStateSchema,
  mode: ProductWorkflowModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  provenance: EntityProvenanceSchema,
});
export type ResearchProductProjectV1 = z.infer<
  typeof ResearchProductProjectV1Schema
>;

export const ResearchProductWorkflowSnapshotV1Schema = z.object({
  project: ResearchProductProjectV1Schema,
  intent: ResearchIntentV1Schema,
  questions: z.array(ResearchQuestionV1Schema),
  queries: z.array(SearchQueryV1Schema),
  sourceCandidates: z.array(SourceCandidateV1Schema),
  sources: z.array(SourceRecordV1Schema),
  documents: z.array(DocumentRecordV1Schema),
  parsedBlocks: z.array(ParsedBlockV1Schema),
  evidenceCards: z.array(WorkflowEvidenceCardV1Schema),
  evidenceDecisions: z.array(EvidenceDecisionV1Schema),
  acceptedEvidenceSet: AcceptedEvidenceSetV1Schema.nullable(),
  reportPlan: ProductReportPlanV1Schema.nullable(),
  generationRuns: z.array(GenerationRunV1Schema),
  generatedClaims: z.array(GeneratedClaimV1Schema),
  citationBindings: z.array(CitationBindingV1Schema),
  verificationResults: z.array(VerificationResultV1Schema),
  sectionContent: z.record(z.string(), z.string()),
  revisions: z.array(ReportRevisionV1Schema),
  exports: z.array(ExportArtifactV1Schema),
  failures: z.array(ProductWorkflowFailureV1Schema),
  events: z.array(ProductWorkflowEventV1Schema),
  diagnostics: z.object({
    queryBudget: z.number().int().positive(),
    stageTimingsMs: z.record(z.string(), z.number().int().min(0)),
    providerFailures: z.array(z.string().trim().min(1)),
    warnings: z.array(z.string().trim().min(1)),
  }),
});
export type ResearchProductWorkflowSnapshotV1 = z.infer<
  typeof ResearchProductWorkflowSnapshotV1Schema
>;

export const CreateResearchProductProjectRequestSchema = z.object({
  topic: z.string().trim().min(1),
  reportType: z.string().trim().min(1).default("研究報告"),
  targetAudience: z.string().trim().min(1).default("一般讀者"),
  targetLanguage: z.string().trim().min(1).default("zh-TW"),
  depth: z.enum(["quick", "standard", "deep"]).default("standard"),
  timeframe: z.string().trim().min(1).nullable().default(null),
  sourceConstraints: z.array(z.string().trim().min(1)).default([]),
  preferredDisciplines: z.array(z.string().trim().min(1)).default([]),
  excludedSourceCategories: z.array(z.string().trim().min(1)).default([]),
  expectedOutputFormats: z
    .array(z.enum(["pdf", "docx", "markdown", "json_bundle"]))
    .default(["pdf", "docx", "json_bundle"]),
  mode: ProductWorkflowModeSchema.default("LIVE"),
});
export type CreateResearchProductProjectRequest = z.infer<
  typeof CreateResearchProductProjectRequestSchema
>;

export const EvidenceDecisionInputSchema = z.object({
  evidenceCardId: z.string().trim().min(1),
  decision: z.enum(["accepted", "rejected", "needs_review"]),
  reason: z.string().trim().min(1),
  note: z.string().trim().min(1).nullable().default(null),
  tags: z.array(z.string().trim().min(1)).default([]),
  decidedBy: z.enum(["human", "policy"]).default("human"),
});
export type EvidenceDecisionInput = z.infer<typeof EvidenceDecisionInputSchema>;

export const ResearchQuestionInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  status: z.enum(["active", "excluded"]).default("active"),
});
export type ResearchQuestionInput = z.infer<typeof ResearchQuestionInputSchema>;

export const WorkflowSectionInputSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  researchQuestionIds: z.array(z.string().trim().min(1)).default([]),
  requiredEvidenceIds: z.array(z.string().trim().min(1)).default([]),
  optionalEvidenceIds: z.array(z.string().trim().min(1)).default([]),
});
export type WorkflowSectionInput = z.infer<typeof WorkflowSectionInputSchema>;

export const EditWorkflowSectionRequestSchema = z.object({
  content: z.string(),
  editedBy: z.enum(["human", "model_repair"]).default("human"),
});
export type EditWorkflowSectionRequest = z.infer<
  typeof EditWorkflowSectionRequestSchema
>;

export const WorkflowEvidenceCardInputSchema = WorkflowEvidenceCardV1Schema.omit({
  projectId: true,
  workflowId: true,
  version: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  provenance: true,
});
export type WorkflowEvidenceCardInput = z.infer<
  typeof WorkflowEvidenceCardInputSchema
>;

export const ResearchProductExportResponseSchema = z.object({
  artifact: ExportArtifactV1Schema,
  mediaType: z.string().trim().min(1),
  content: z.string(),
});
export type ResearchProductExportResponse = z.infer<
  typeof ResearchProductExportResponseSchema
>;

export const SourceRegistrationRequestSchema = z.object({
  candidates: z.array(SourceCandidateInputSchema),
  providerFailures: z.array(z.string().trim().min(1)).default([]),
});

export const EvidenceRegistrationRequestSchema = z.object({
  evidenceCards: z.array(WorkflowEvidenceCardInputSchema),
});

export const EvidenceReviewRequestSchema = z.object({
  decisions: z.array(EvidenceDecisionInputSchema),
});

export const QuestionReplacementRequestSchema = z.object({
  questions: z.array(ResearchQuestionInputSchema).min(1),
});

export const ReportPlanRequestSchema = z.object({
  sections: z.array(WorkflowSectionInputSchema).min(1).optional(),
});

export const WorkflowExportRequestSchema = z.object({
  format: z.enum(["pdf", "docx", "markdown", "json_bundle"]),
  allowDraft: z.boolean().default(false),
});

export const ModeBClaimVerdictSchema = z.enum([
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "UNSUPPORTED",
  "MISATTRIBUTED",
  "EXAGGERATED",
  "DATA_MISMATCH",
  "UNVERIFIABLE",
  "INSUFFICIENT_EVIDENCE",
]);
export type ModeBClaimVerdict = z.infer<typeof ModeBClaimVerdictSchema>;

export const ModeBEvidenceSpanSchema = z.object({
  span: z.string().trim().min(1),
  sourceTitle: z.string().optional(),
  sourceDoi: z.string().optional(),
  sourceUrl: z.string().optional(),
  provenanceMode: z.string().optional(),
});
export type ModeBEvidenceSpan = z.infer<typeof ModeBEvidenceSpanSchema>;

export const ModeBCitationResolutionSchema = z.object({
  marker: z.string().trim().min(1),
  resolved: z.boolean(),
  title: z.string().optional(),
  doi: z.string().optional(),
  provider: z.string().optional(),
  method: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type ModeBCitationResolution = z.infer<typeof ModeBCitationResolutionSchema>;

export const ModeBClaimAssessmentSchema = z.object({
  id: z.string().trim().min(1),
  claimText: z.string().trim().min(1),
  sectionTitle: z.string().trim().min(1),
  citationMarkers: z.array(z.string().trim().min(1)),
  citedReferences: z.array(z.string().trim().min(1)),
  verdict: ModeBClaimVerdictSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1),
  evidenceFound: z.string().trim().min(1).nullable(),
  suggestedCorrection: z.string().trim().min(1).nullable(),
  blockId: z.string().trim().min(1),
  claimType: z.string().optional(),
  scope: z.string().optional(),
  entities: z.array(z.string()).optional(),
  numericAssertions: z.array(z.string()).optional(),
  supportingEvidence: z.array(ModeBEvidenceSpanSchema).optional(),
  contradictingEvidence: z.array(ModeBEvidenceSpanSchema).optional(),
  citationResolution: z.array(ModeBCitationResolutionSchema).optional(),
});
export type ModeBClaimAssessment = z.infer<typeof ModeBClaimAssessmentSchema>;

export const ModeBMetricsBreakdownSchema = z.object({
  citationCoverage: z.number().min(0).max(100),
  citationCorrectness: z.number().min(0).max(100),
  evidenceSufficiency: z.number().min(0).max(100),
  claimIntegrity: z.number().min(0).max(100),
});
export type ModeBMetricsBreakdown = z.infer<typeof ModeBMetricsBreakdownSchema>;

export const ModeBVerificationSummarySchema = z.object({
  totalClaims: z.number().int().min(0),
  supportedCount: z.number().int().min(0),
  partiallySupportedCount: z.number().int().min(0),
  unsupportedCount: z.number().int().min(0),
  misattributedCount: z.number().int().min(0),
  exaggeratedCount: z.number().int().min(0),
  dataMismatchCount: z.number().int().min(0),
  insufficientEvidenceCount: z.number().int().min(0).optional().default(0),
  citationHealthScore: z.number().min(0).max(100),
  summaryEvaluation: z.string().trim().min(1),
  metricsBreakdown: ModeBMetricsBreakdownSchema.optional(),
});
export type ModeBVerificationSummary = z.infer<typeof ModeBVerificationSummarySchema>;

export const VerifyExistingReportRequestSchema = z.object({
  topic: z.string().trim().min(1).default("既有報告驗證"),
  rawText: z.string().optional(),
  markdown: z.string().optional(),
  fileBase64: z.string().optional(),
  mediaType: z.enum([
    "text/plain",
    "text/markdown",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]).default("text/markdown"),
  fileName: z.string().optional(),
  sourceMode: z.enum(["LIVE", "REPLAY", "FIXTURE"]).default("LIVE"),
});
export type VerifyExistingReportRequest = z.infer<typeof VerifyExistingReportRequestSchema>;

export const VerifyExistingReportResponseSchema = z.object({
  document: DocumentRecordV1Schema,
  parsedBlocks: z.array(ParsedBlockV1Schema),
  claims: z.array(ModeBClaimAssessmentSchema),
  summary: ModeBVerificationSummarySchema,
  annotatedMarkdown: z.string(),
  annotatedPdfBase64: z.string().optional(),
  annotatedDocxBase64: z.string().optional(),
});
export type VerifyExistingReportResponse = z.infer<typeof VerifyExistingReportResponseSchema>;

