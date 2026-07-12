import type { SourceRecord as ApiSourceRecord, SourceReviewState } from "@workspace/api-client-react";

export type { SourceReviewState };

export const WORKFLOW_REPORT_SECTIONS = ["研究背景", "文獻探討", "研究方法", "數據分析", "結論"] as const;
export type WorkflowReportSection = (typeof WORKFLOW_REPORT_SECTIONS)[number];
export type SourceRelevanceLevel = "primary" | "secondary" | "clue" | "low" | "off_topic";
export type EvidenceGroundingStatus =
  | "abstract_grounded"
  | "snippet_grounded"
  | "metadata_only"
  | "insufficient";
export type SourceSummarySourceType =
  | "abstract"
  | "snippet"
  | "fulltext"
  | "metadataFallback";
export type SourceSummaryConfidence = "high" | "medium" | "low";
export type TopicalRelevanceLabel = "high" | "medium" | "low" | "irrelevant";
export type EvidenceSufficiency = "strong" | "moderate" | "weak" | "insufficient";
export type SourceUsageRecommendation = "primary" | "secondary" | "reference" | "exclude";
export type SourceRecommendationBucket =
  | "scholarly_recommended"
  | "official_background"
  | "manual_review"
  | "rejected";
export type SourceRole =
  | "background_definition"
  | "academic_evidence"
  | "official_statistics"
  | "professional_guidance"
  | "case_or_news"
  | "data_or_dataset"
  | "core_scholarly_evidence"
  | "official_background_explanation"
  | "definition_or_concept"
  | "statistics_or_dataset"
  | "teaching_or_public_explainer"
  | "weak_or_uncertain"
  | "rejected";
export type SourceRetrievalMode =
  | "live_provider"
  | "stale_cache"
  | "trusted_seed"
  | "user_import"
  | "manual_url"
  | "supplemental_fulltext_or_repository";

export type SourceContentAccessLevel =
  | "full_text"
  | "abstract_only"
  | "metadata_only"
  | "blocked_or_paywalled"
  | "failed_extraction";
export type SourceContentExtractionStatus =
  | "success"
  | "partial"
  | "failed"
  | "skipped"
  | "text_extracted"
  | "grobid_extracted"
  | "ocr_extracted"
  | "metadata_only"
  | "extraction_failed"
  | "extraction_skipped_license"
  | "extraction_skipped_no_full_text"
  | "extraction_unavailable_no_parser";
export type SourceContentExtractionMethod =
  | "html_readability"
  | "pdf_parser"
  | "grobid"
  | "abstract_only"
  | "metadata_only"
  | "pdf_text"
  | "ocr"
  | "html"
  | "abstract"
  | "failed";
export type SourceExtractionMode =
  | "pdf_text"
  | "grobid"
  | "ocr"
  | "html"
  | "abstract"
  | "metadata_only"
  | "failed";
export type SourceClaimExtractionStatus =
  | "enabled"
  | "fallback"
  | "unavailable"
  | "failed"
  | "skipped";
export type SourceClaimExtractionMode = "llm" | "rule_fallback" | "metadata_only";
export type SourceUseLevel =
  | "citable_full_text"
  | "citable_abstract"
  | "metadata_context_only"
  | "manual_review_required"
  | "rejected";

export interface ExtractedSourceSection {
  heading: string;
  text: string;
  page?: number;
  confidence: number;
}

export interface ExtractedSourceChunk {
  chunk_id: string;
  text: string;
  source_location: string;
  section_heading?: string;
  page?: number;
  char_start?: number;
  char_end?: number;
}

export type SourceKind = "journal" | "conference" | "book" | "dataset" | "web" | "unknown";
export type SourceAccessStatus =
  | "ok"
  | "redirected"
  | "metadata_only"
  | "blocked"
  | "not_found"
  | "unknown";

export interface SourceLinkInfo {
  originalUrl?: string | null;
  canonicalUrl?: string | null;
  resolvedUrl?: string | null;
  doi?: string | null;
  doiUrl?: string | null;
  metadataUrl?: string | null;
  apiSourceUrl?: string | null;
  accessStatus: SourceAccessStatus;
  linkWarnings: string[];
}

export interface SourceValidationMetadata {
  sourceId: string;
  urlReachable: boolean;
  canonicalUrl?: string;
  doi?: string;
  publisher?: string;
  year?: number;
  sourceType: string;
  reliabilityScore: number;
  warnings: string[];
}

export interface ReadableExtractionMetadata {
  sourceId: string;
  title: string;
  abstract?: string;
  extractedText?: string;
  extractionStatus: "success" | "partial" | "failed" | string;
  language: "zh-TW" | "en" | "unknown" | string;
  extractionWarnings: string[];
}

export interface SourceFactMetadata {
  sourceId: string;
  fact: string;
  category: string;
  relevanceToTopic: number;
  supportedByText: string;
}

export interface ResearchRelevanceScoreMetadata {
  sourceId: string;
  topicMatch: number;
  semanticMatch: number;
  queryMatch: number;
  evidenceUsefulness: number;
  reliabilityScore: number;
  finalScore: number;
  label: "high" | "medium" | "low" | string;
  reason: string;
}

export interface PipelineSourceSummaryMetadata {
  sourceId: string;
  summary: string;
  basedOn: string;
  language: "zh-TW" | string;
  confidence: number;
  warnings: string[];
}

export type SourceRelevanceClassification =
  | "primary"
  | "review"
  | "low_quality"
  | "off_topic"
  | "trusted_but_off_topic"
  | "stale_topic"
  | "stale_workflow";

export const SOURCE_CONFIDENCE_OPTIONS = ["高", "中", "低"] as const;
export type SourceConfidence = (typeof SOURCE_CONFIDENCE_OPTIONS)[number];

export const EVIDENCE_SUPPORT_LEVELS = ["direct", "indirect", "weak"] as const;
export type EvidenceSupportLevel = (typeof EVIDENCE_SUPPORT_LEVELS)[number];

export interface SourceEvidenceSnippet {
  originalSnippet: string;
  snippetZhTw: string;
  matchedFacet: string;
  matchedTerms: string[];
  supportLevel: EvidenceSupportLevel;
  reasoningZhTw: string;
  score: number;
}

export interface SourceEvidenceChainEntry {
  facetLabelZhTw: string;
  matchedTerms: string[];
  supportLevel: EvidenceSupportLevel;
  reasoningZhTw: string;
}

export const SOURCE_CATEGORY_OPTIONS = [
  "academic_paper",
  "journal_article",
  "government_or_institution",
  "news_or_web",
  "book",
  "unknown",
] as const;
export type SourceCategory = (typeof SOURCE_CATEGORY_OPTIONS)[number];

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  academic_paper: "學術論文",
  journal_article: "期刊文章",
  government_or_institution: "政府／機構",
  news_or_web: "新聞／網頁",
  book: "書籍",
  unknown: "未分類",
};

export interface SourceRecordMetadata {
  provider?: string | null;
  queryUsed?: string | null;
  retrievedAt?: string | null;
  snippet?: string | null;
  language?: string | null;
  abstractMissing?: boolean | null;
  dedupeKey?: string | null;
  sourceKind?: SourceKind | string | null;
  citationCount?: number | null;
  isOpenAccess?: boolean | null;
  accessLevel?: SourceContentAccessLevel | null;
  fullTextUrl?: string | null;
  readableUrl?: string | null;
  extractionStatus?: SourceContentExtractionStatus | null;
  extractionMethod?: SourceContentExtractionMethod | null;
  extractionMode?: SourceExtractionMode | null;
  pageCount?: number | null;
  extractedPageCount?: number | null;
  isScanned?: boolean | null;
  failureReason?: string | null;
  userFacingMessage?: string | null;
  canUseForClaims?: boolean | null;
  canUseForReport?: boolean | null;
  toolVersions?: Record<string, string> | null;
  processingStartedAt?: string | null;
  processingEndedAt?: string | null;
  qualityFlags?: string[] | null;
  fullTextCharCount?: number | null;
  extractedAbstract?: string | null;
  extractedSections?: ExtractedSourceSection[] | null;
  extractedChunks?: ExtractedSourceChunk[] | null;
  extractionWarnings?: string[] | null;
  claimExtractionStatus?: SourceClaimExtractionStatus | null;
  claimExtractionMode?: SourceClaimExtractionMode | null;
  claimCount?: number | null;
  acceptedClaimCount?: number | null;
  acceptedEvidenceCardCount?: number | null;
  claimExtractionWarnings?: string[] | null;
  contentHash?: string | null;
  sourceUseLevel?: SourceUseLevel | null;
  isPeerReviewed?: boolean | null;
  sourceQualityScore?: number | null;
  scoreReasons?: string[] | null;
  topicalRelevanceScore?: number | null;
  topicalRelevanceLabel?: TopicalRelevanceLabel | null;
  matchedAnchorConcepts?: string[] | null;
  matchedApplicationConcepts?: string[] | null;
  negativeSignals?: string[] | null;
  shouldRejectImmediately?: boolean | null;
  evidenceSufficiency?: EvidenceSufficiency | null;
  usableAsPrimaryEvidence?: boolean | null;
  usableAsSecondaryEvidence?: boolean | null;
  usageRecommendation?: SourceUsageRecommendation | null;
  qualityWarnings?: string[] | null;
  manuallyForced?: boolean | null;
  sourceCategory?: SourceCategory | string | null;
  usableSections?: WorkflowReportSection[] | string[] | null;
  confidence?: SourceConfidence | string | null;
  reviewNotes?: string | null;
  relevanceLevel?: SourceRelevanceLevel | null;
  relevanceScore?: number | null;
  relevanceReasons?: string[] | null;
  matchedCoreConcepts?: string[] | null;
  missingCoreConcepts?: string[] | null;
  matchedFacets?: string[] | null;
  missingRequiredFacets?: string[] | null;
  evidenceGrounding?: EvidenceGroundingStatus | null;
  sourceRelevanceReasonZhTw?: string | null;
  shouldShowInMainList?: boolean | null;
  shouldRecommendAccept?: boolean | null;
  readableSummaryZhTW?: string | null;
  readableSummaryZhTw?: string | null;
  summarySourceType?: SourceSummarySourceType | null;
  summaryConfidence?: SourceSummaryConfidence | null;
  relevanceReasonZhTW?: string | null;
  relevanceReasonZhTw?: string | null;
  summaryWarnings?: string[] | null;
  originalAbstract?: string | null;
  abstractOriginal?: string | null;
  abstractZhTw?: string | null;
  originalSnippet?: string | null;
  extractedText?: string | null;
  authorityLevel?: "high" | "medium" | "check" | "insufficient_summary" | "low_relevance" | null;
  authorityScore?: number | null;
  authorityLabel?: string | null;
  sourceLanguage?: "zh-TW" | "zh-CN" | "en" | "other" | "unknown" | null;
  sourceLanguageLabel?: string | null;
  mainEvidenceFacet?: string | null;
  evidenceSummaryZhTw?: string | null;
  mainEvidencePointZhTw?: string | null;
  llmSummaryZhTw?: string | null;
  llmSummaryStatus?: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped" | "metadata-only" | "fetch-failed" | "llm-failed" | "fallback" | null;
  summaryStructuredStatus?: "success" | "unavailable" | "invalid_input" | "insufficient_sources" | "error" | null;
  summaryProvider?: string | null;
  summaryModel?: string | null;
  summaryStatus?: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped" | "metadata-only" | "fetch-failed" | "llm-failed" | "fallback" | null;
  summaryFallbackUsed?: boolean | null;
  summaryReason?: string | null;
  summaryMessage?: string | null;
  evidenceSnippets?: SourceEvidenceSnippet[] | null;
  evidenceChain?: SourceEvidenceChainEntry[] | null;
  workflowId?: string | null;
  topic?: string | null;
  normalizedTopic?: string | null;
  topicHash?: string | null;
  queryPlanHash?: string | null;
  summaryUsabilityScore?: number | null;
  metadataCompletenessScore?: number | null;
  recencyScore?: number | null;
  languageFitScore?: number | null;
  finalScore?: number | null;
  classification?: SourceRelevanceClassification | null;
  rejectReason?: string | null;
  matchedTerms?: string[] | null;
  driftTerms?: string[] | null;
  topicRelevance?: number | null;
  evidenceQuality?: number | null;
  metadataCompleteness?: number | null;
  abstractQuality?: number | null;
  sourceTrust?: number | null;
  isMetadataOnly?: boolean | null;
  isPrimaryEvidence?: boolean | null;
  rejectionReason?: string | null;
  recommendation?: string | null;
  recommendationBucket?: SourceRecommendationBucket | null;
  sourceRole?: SourceRole | null;
  retrievalMode?: SourceRetrievalMode | null;
  institutionType?: string | null;
  evidencePoints?: string[] | null;
  providerHealthSnapshot?: unknown | null;
  acceptedByUser?: boolean | null;
  userDecision?:
    | "accepted"
    | "accepted_as_background"
    | "accepted_as_scholarly_evidence"
    | "accepted_as_manual_review"
    | "rejected"
    | "pending"
    | string
    | null;
  acceptedAs?: string | null;
  lowConfidence?: boolean | null;
  needsReview?: boolean | null;
  sourceLinkInfo?: SourceLinkInfo | null;
  sourceValidation?: SourceValidationMetadata | null;
  readableExtraction?: ReadableExtractionMetadata | null;
  sourceFacts?: SourceFactMetadata[] | null;
  researchRelevanceScore?: ResearchRelevanceScoreMetadata | null;
  sourceSummary?: PipelineSourceSummaryMetadata | null;
}

export type SourceRecord = ApiSourceRecord & SourceRecordMetadata;

export interface BibliographyEntry {
  sourceId: string;
  text: string;
  incomplete: boolean;
  missingFields: string[];
}

export interface ExportReadinessWarning {
  code: "no-accepted-sources" | "incomplete-source-metadata" | "citation-placeholders";
  message: string;
}

type ReportLike = {
  meta?: {
    acceptedSources?: SourceRecord[];
  };
  sections?: Array<{
    heading?: string;
    blocks?: unknown[];
  }>;
};

const CITATION_PLACEHOLDERS = [
  "資料來源待補",
  "來源待確認",
  "此處需要補充資料",
  "此處建議加入資料來源",
  "〔作者或機構〕",
  "〔年份〕",
  "〔標題〕",
  "〔出處〕",
  "〔網址〕",
];

type SourceReviewAlias = SourceReviewState | "dismissed";
type SourceRecordWithReviewAliases = SourceRecord & {
  status?: SourceReviewAlias | null;
  reviewStatus?: SourceReviewAlias | null;
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanUnknownText(value: unknown): string | null {
  return cleanText(typeof value === "string" ? value : null);
}

export function normalizeUsableSections(value: unknown): WorkflowReportSection[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(WORKFLOW_REPORT_SECTIONS);
  const seen = new Set<WorkflowReportSection>();

  for (const item of value) {
    if (typeof item !== "string" || !allowed.has(item)) continue;
    seen.add(item as WorkflowReportSection);
  }

  return Array.from(seen);
}

export function defaultUsableSections(): WorkflowReportSection[] {
  return ["研究背景", "文獻探討"];
}

function normalizeSourceConfidence(value: unknown): SourceConfidence | null {
  if (value === "高" || value === "中" || value === "低") return value;
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return null;
}

function normalizeStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((item) => cleanText(typeof item === "string" ? item : null))
    .filter((item): item is string => Boolean(item));
  return normalized.length ? Array.from(new Set(normalized)) : null;
}

function normalizeEvidenceSupportLevel(value: unknown): EvidenceSupportLevel | null {
  if (value === "direct" || value === "indirect" || value === "weak") return value;
  return null;
}

function normalizeEvidenceSnippet(value: unknown): SourceEvidenceSnippet | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const originalSnippet = cleanUnknownText(data.originalSnippet ?? data.original_snippet);
  const snippetZhTw = cleanUnknownText(data.snippetZhTw ?? data.snippet_zh_tw ?? data.snippet);
  const matchedFacet = cleanUnknownText(data.matchedFacet ?? data.matched_facet);
  const matchedTerms = normalizeStringList(data.matchedTerms ?? data.matched_terms);
  const supportLevel = normalizeEvidenceSupportLevel(data.supportLevel ?? data.support_level);
  const reasoningZhTw = cleanUnknownText(data.reasoningZhTw ?? data.reasoning_zh_tw ?? data.reasoning);
  const score = typeof data.score === "number" && Number.isFinite(data.score)
    ? data.score
    : null;

  if (!originalSnippet || !snippetZhTw || !matchedFacet || !matchedTerms || !supportLevel || !reasoningZhTw || score === null) {
    return null;
  }

  return {
    originalSnippet,
    snippetZhTw,
    matchedFacet,
    matchedTerms,
    supportLevel,
    reasoningZhTw,
    score,
  };
}

function normalizeEvidenceChainEntry(value: unknown): SourceEvidenceChainEntry | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const facetLabelZhTw = cleanUnknownText(data.facetLabelZhTw ?? data.facetLabel ?? data.facet);
  const matchedTerms = normalizeStringList(data.matchedTerms ?? data.matched_terms);
  const supportLevel = normalizeEvidenceSupportLevel(data.supportLevel ?? data.support_level);
  const reasoningZhTw = cleanUnknownText(data.reasoningZhTw ?? data.reasoning_zh_tw ?? data.reasoning);

  if (!facetLabelZhTw || !matchedTerms || !supportLevel || !reasoningZhTw) {
    return null;
  }

  return {
    facetLabelZhTw,
    matchedTerms,
    supportLevel,
    reasoningZhTw,
  };
}

function normalizeEvidenceSnippetList(value: unknown): SourceEvidenceSnippet[] | null {
  if (!Array.isArray(value)) return null;
  const snippets = value
    .map((item) => normalizeEvidenceSnippet(item))
    .filter((item): item is SourceEvidenceSnippet => Boolean(item));
  return snippets.length ? snippets : null;
}

function normalizeEvidenceChainList(value: unknown): SourceEvidenceChainEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value
    .map((item) => normalizeEvidenceChainEntry(item))
    .filter((item): item is SourceEvidenceChainEntry => Boolean(item));
  return entries.length ? entries : null;
}

function normalizeRelevanceLevel(value: unknown): SourceRecordMetadata["relevanceLevel"] {
  if (value === "primary" || value === "secondary" || value === "clue" || value === "low" || value === "off_topic") return value;
  if (value === "high") return "primary";
  if (value === "medium") return "secondary";
  return null;
}

function normalizeEvidenceGrounding(value: unknown): SourceRecordMetadata["evidenceGrounding"] {
  if (
    value === "abstract_grounded"
    || value === "snippet_grounded"
    || value === "metadata_only"
    || value === "insufficient"
  ) return value;
  return null;
}

function normalizeAuthorityLevel(value: unknown): SourceRecordMetadata["authorityLevel"] {
  if (
    value === "high"
    || value === "medium"
    || value === "check"
    || value === "insufficient_summary"
    || value === "low_relevance"
  ) return value;
  return null;
}

function normalizeSourceClassification(value: unknown): SourceRecordMetadata["classification"] {
  if (
    value === "primary"
    || value === "review"
    || value === "low_quality"
    || value === "off_topic"
    || value === "trusted_but_off_topic"
    || value === "stale_topic"
    || value === "stale_workflow"
  ) return value;
  return null;
}

function normalizeSourceAccessStatus(value: unknown): SourceAccessStatus {
  if (
    value === "ok" ||
    value === "redirected" ||
    value === "metadata_only" ||
    value === "blocked" ||
    value === "not_found" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function normalizeSourceLinkInfoValue(
  value: unknown,
  source: Pick<SourceRecord, "doi" | "url" | "abstract" | "summarySourceType" | "isMetadataOnly">,
): SourceLinkInfo {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const doi = normalizeDoi(cleanUnknownText(data.doi) ?? source.doi);
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const canonicalUrl = cleanUnknownText(data.canonicalUrl) ?? doiUrl ?? cleanText(source.url);
  const metadataUrl = cleanUnknownText(data.metadataUrl) ?? cleanUnknownText(data.apiSourceUrl);
  const accessStatus = normalizeSourceAccessStatus(data.accessStatus);
  const inferredStatus =
    accessStatus !== "unknown"
      ? accessStatus
      : source.isMetadataOnly || source.summarySourceType === "metadataFallback"
        ? "metadata_only"
        : canonicalUrl
          ? "unknown"
          : "metadata_only";

  return {
    originalUrl: cleanUnknownText(data.originalUrl) ?? (source.url && source.url !== canonicalUrl ? source.url : null),
    canonicalUrl,
    resolvedUrl: cleanUnknownText(data.resolvedUrl) ?? canonicalUrl,
    doi,
    doiUrl,
    metadataUrl: metadataUrl ?? canonicalUrl,
    apiSourceUrl: cleanUnknownText(data.apiSourceUrl) ?? metadataUrl ?? canonicalUrl,
    accessStatus: inferredStatus,
    linkWarnings: normalizeStringList(data.linkWarnings) ?? (inferredStatus === "metadata_only" ? ["metadata_only_source"] : []),
  };
}

function normalizeOptionalScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSummarySourceType(value: unknown): SourceSummarySourceType | null {
  if (
    value === "abstract" ||
    value === "snippet" ||
    value === "fulltext" ||
    value === "metadataFallback"
  ) {
    return value;
  }
  return null;
}

function normalizeTopicalRelevanceLabel(
  value: unknown,
): TopicalRelevanceLabel | null {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "irrelevant"
  ) {
    return value;
  }
  return null;
}

function normalizeEvidenceSufficiency(
  value: unknown,
): EvidenceSufficiency | null {
  if (
    value === "strong" ||
    value === "moderate" ||
    value === "weak" ||
    value === "insufficient"
  ) {
    return value;
  }
  return null;
}

function normalizeUsageRecommendation(
  value: unknown,
): SourceUsageRecommendation | null {
  if (
    value === "primary" ||
    value === "secondary" ||
    value === "reference" ||
    value === "exclude"
  ) {
    return value;
  }
  return null;
}

function normalizeRecommendationBucket(
  value: unknown,
): SourceRecommendationBucket | null {
  if (
    value === "scholarly_recommended" ||
    value === "official_background" ||
    value === "manual_review" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
}

function normalizeSourceRole(value: unknown): SourceRole | null {
  if (
    value === "background_definition" ||
    value === "academic_evidence" ||
    value === "official_statistics" ||
    value === "professional_guidance" ||
    value === "case_or_news" ||
    value === "data_or_dataset" ||
    value === "core_scholarly_evidence" ||
    value === "official_background_explanation" ||
    value === "definition_or_concept" ||
    value === "statistics_or_dataset" ||
    value === "teaching_or_public_explainer" ||
    value === "weak_or_uncertain" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
}

function normalizeRetrievalMode(value: unknown): SourceRetrievalMode | null {
  if (
    value === "live_provider" ||
    value === "stale_cache" ||
    value === "trusted_seed" ||
    value === "user_import" ||
    value === "manual_url" ||
    value === "supplemental_fulltext_or_repository"
  ) {
    return value;
  }
  return null;
}

function normalizeContentAccessLevel(value: unknown): SourceContentAccessLevel | null {
  if (
    value === "full_text" ||
    value === "abstract_only" ||
    value === "metadata_only" ||
    value === "blocked_or_paywalled" ||
    value === "failed_extraction"
  ) {
    return value;
  }
  return null;
}

function normalizeExtractionStatus(value: unknown): SourceContentExtractionStatus | null {
  if (
    value === "success" ||
    value === "partial" ||
    value === "failed" ||
    value === "skipped" ||
    value === "text_extracted" ||
    value === "grobid_extracted" ||
    value === "ocr_extracted" ||
    value === "metadata_only" ||
    value === "extraction_failed" ||
    value === "extraction_skipped_license" ||
    value === "extraction_skipped_no_full_text" ||
    value === "extraction_unavailable_no_parser"
  ) {
    return value;
  }
  return null;
}

function normalizeExtractionMethod(value: unknown): SourceContentExtractionMethod | null {
  if (
    value === "html_readability" ||
    value === "pdf_parser" ||
    value === "grobid" ||
    value === "abstract_only" ||
    value === "metadata_only" ||
    value === "pdf_text" ||
    value === "ocr" ||
    value === "html" ||
    value === "abstract" ||
    value === "failed"
  ) {
    return value;
  }
  return null;
}

function normalizeExtractionMode(value: unknown): SourceExtractionMode | null {
  if (
    value === "pdf_text" ||
    value === "grobid" ||
    value === "ocr" ||
    value === "html" ||
    value === "abstract" ||
    value === "metadata_only" ||
    value === "failed"
  ) {
    return value;
  }
  return null;
}

function normalizeClaimExtractionStatus(value: unknown): SourceClaimExtractionStatus | null {
  if (
    value === "enabled" ||
    value === "fallback" ||
    value === "unavailable" ||
    value === "failed" ||
    value === "skipped"
  ) {
    return value;
  }
  return null;
}

function normalizeClaimExtractionMode(value: unknown): SourceClaimExtractionMode | null {
  if (value === "llm" || value === "rule_fallback" || value === "metadata_only") {
    return value;
  }
  return null;
}

function normalizeSourceUseLevel(value: unknown): SourceUseLevel | null {
  if (
    value === "citable_full_text" ||
    value === "citable_abstract" ||
    value === "metadata_context_only" ||
    value === "manual_review_required" ||
    value === "rejected"
  ) {
    return value;
  }
  return null;
}

function normalizeExtractedSections(value: unknown): ExtractedSourceSection[] | null {
  if (!Array.isArray(value)) return null;
  const sections = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const heading = cleanUnknownText(data.heading);
      const text = cleanUnknownText(data.text);
      if (!heading || !text) return null;
      const page = normalizeNonNegativeInteger(data.page);
      return {
        heading,
        text,
        ...(page !== null ? { page } : {}),
        confidence:
          typeof data.confidence === "number" && Number.isFinite(data.confidence)
            ? Math.max(0, Math.min(1, data.confidence))
            : 0.5,
      };
    })
    .filter((item): item is ExtractedSourceSection => Boolean(item));
  return sections.length ? sections : null;
}

function normalizeExtractedChunks(value: unknown): ExtractedSourceChunk[] | null {
  if (!Array.isArray(value)) return null;
  const chunks = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const chunkId = cleanUnknownText(data.chunk_id);
      const text = cleanUnknownText(data.text);
      const sourceLocation = cleanUnknownText(data.source_location);
      if (!chunkId || !text || !sourceLocation) return null;
      const sectionHeading = cleanUnknownText(data.section_heading);
      const page = normalizeNonNegativeInteger(data.page);
      const charStart = normalizeNonNegativeInteger(data.char_start);
      const charEnd = normalizeNonNegativeInteger(data.char_end);
      return {
        chunk_id: chunkId,
        text,
        source_location: sourceLocation,
        ...(sectionHeading ? { section_heading: sectionHeading } : {}),
        ...(page !== null ? { page } : {}),
        ...(charStart !== null ? { char_start: charStart } : {}),
        ...(charEnd !== null ? { char_end: charEnd } : {}),
      };
    })
    .filter((item): item is ExtractedSourceChunk => Boolean(item));
  return chunks.length ? chunks : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ");
}

function sanitizeReviewText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return decodeHtmlEntities(trimmed)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(undefined|null|NaN)\b/gi, " ")
    .replace(/https?:\/\/\S{30,}/gi, " ")
    .replace(/[。.!?]{3,}/g, "。")
    .replace(/[，,]{3,}/g, "，")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function normalizeSummaryConfidence(value: unknown): SourceSummaryConfidence | null {
  if (value === "high" || value === "medium" || value === "low") return value;
  return null;
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function normalizeSourceKind(value: unknown): SourceKind | null {
  if (
    value === "journal" ||
    value === "conference" ||
    value === "book" ||
    value === "dataset" ||
    value === "web" ||
    value === "unknown"
  ) {
    return value;
  }
  return null;
}

function mergeScore(existing: number | null | undefined, incoming: number | null | undefined): number | null {
  if (typeof existing === "number" && typeof incoming === "number") return Math.max(existing, incoming);
  return existing ?? incoming ?? null;
}

function mergeStringList(existing: string[] | null | undefined, incoming: string[] | null | undefined): string[] | null {
  const merged = Array.from(new Set([...(existing ?? []), ...(incoming ?? [])].map((item) => item.trim()).filter(Boolean)));
  return merged.length ? merged : null;
}

function normalizeSourceLanguage(value: unknown): SourceRecordMetadata["sourceLanguage"] {
  if (value === "zh-TW" || value === "zh-CN" || value === "en" || value === "other" || value === "unknown") return value;
  return null;
}

function normalizeLlmSummaryStatus(value: unknown): SourceRecordMetadata["llmSummaryStatus"] {
  if (
    value === "success" ||
    value === "timeout" ||
    value === "quota_exceeded" ||
    value === "failed" ||
    value === "skipped" ||
    value === "metadata-only" ||
    value === "fetch-failed" ||
    value === "llm-failed" ||
    value === "fallback"
  )
    return value;
  return null;
}

function normalizeStructuredSummaryStatus(
  value: unknown,
): SourceRecordMetadata["summaryStructuredStatus"] {
  if (
    value === "success" ||
    value === "unavailable" ||
    value === "invalid_input" ||
    value === "insufficient_sources" ||
    value === "error"
  )
    return value;
  return null;
}

function normalizeSourceCategory(value: unknown): SourceCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if ((SOURCE_CATEGORY_OPTIONS as readonly string[]).includes(normalized)) {
    return normalized as SourceCategory;
  }
  const aliasMap: Record<string, SourceCategory | null> = {
    學術論文: "academic_paper",
    academic: "academic_paper",
    "academic paper": "academic_paper",
    期刊: "journal_article",
    期刊文章: "journal_article",
    journal: "journal_article",
    "journal article": "journal_article",
    政府資料: "government_or_institution",
    政府: "government_or_institution",
    機構資料: "government_or_institution",
    institution: "government_or_institution",
    "government report": "government_or_institution",
    網頁: "news_or_web",
    網路文章: "news_or_web",
    新聞: "news_or_web",
    web: "news_or_web",
    "web page": "news_or_web",
    news: "news_or_web",
    書籍: "book",
    書: "book",
    book: "book",
    其他: null,
    other: null,
    unknown: "unknown",
    未分類: "unknown",
  };
  return aliasMap[normalized] ?? null;
}

function normalizeReviewState(value: unknown): SourceReviewAlias | null {
  if (value === "accepted" || value === "rejected" || value === "pending" || value === "dismissed") {
    return value;
  }
  return null;
}

export function sourceReviewState(source: SourceRecord): SourceReviewState {
  const sourceWithAliases = source as SourceRecordWithReviewAliases;
  const states = [
    normalizeReviewState(sourceWithAliases.reviewState),
    normalizeReviewState(sourceWithAliases.status),
    normalizeReviewState(sourceWithAliases.reviewStatus),
  ];

  if (states.includes("accepted")) return "accepted";
  if (states.includes("rejected") || states.includes("dismissed")) return "rejected";
  return "pending";
}

function normalizeDoi(value: string | null | undefined): string | null {
  const doi = cleanText(value);
  if (!doi) return null;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase() || null;
}

function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stableHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizedAuthorKey(author: string | null | undefined): string {
  return normalizeTitle(author ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function sourceRecordKey(
  source: Pick<SourceRecord, "title" | "doi" | "url" | "sourceType"> &
    Partial<Pick<SourceRecord, "authors" | "year">>,
): string {
  const doi = normalizeDoi(source.doi);
  if (doi) return `doi:${doi.toLowerCase()}`;

  const title = normalizeTitle(source.title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^[\s:.]+|[\s:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstAuthor = normalizedAuthorKey(source.authors?.[0]);
  const year = typeof source.year === "number" && Number.isFinite(source.year)
    ? Math.trunc(source.year)
    : null;
  if (title && firstAuthor && year) return `title:${title}|author:${firstAuthor}|year:${year}`;
  if (title) return `title:${title}`;

  return `source:${source.sourceType}:${stableHash(JSON.stringify(source))}`;
}

function textForClassification(source: SourceRecord): string {
  return [
    source.title,
    source.sourceType,
    source.publisher,
    source.containerTitle,
    source.url,
  ]
    .filter((item): item is string => Boolean(cleanText(item)))
    .join(" ")
    .toLowerCase();
}

function sourceHost(source: SourceRecord): string {
  if (!source.url) return "";
  try {
    return new URL(source.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hasCredibleProvider(source: SourceRecord): boolean {
  const text = textForClassification(source);
  const host = sourceHost(source);
  return source.sourceType === "Official Source"
    || source.sourceType === "Institutional Source"
    || /crossref|semantic scholar|openalex|pubmed|doi|scopus|web of science/.test(text)
    || /\.gov(\.|$)|\.edu(\.|$)|gov\.tw$|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$/.test(host);
}

export function classifySourceRecord(source: SourceRecord): SourceCategory {
  const explicitCategory = normalizeSourceCategory(source.sourceCategory);
  if (explicitCategory) return explicitCategory;

  const text = textForClassification(source);
  const host = sourceHost(source);

  if (
    source.sourceType === "Official Source"
    || source.sourceType === "Institutional Source"
    || /\.gov(\.|$)|gov\.tw$|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$|unesco\.org$/.test(host)
    || /government|ministry|department|agency|bureau|institute|institution|university|college|政府|部|署|局|院|研究院|大學|學院|官方|機構/.test(text)
  ) {
    return "government_or_institution";
  }

  if (/book|isbn|monograph|chapter|出版社|書籍|專書|book series|press/.test(text)) {
    return "book";
  }

  if (/journal|期刊|doi|crossref/.test(text) && (source.doi || source.containerTitle)) {
    return "journal_article";
  }

  if (source.doi || /semantic scholar|paper|conference|proceedings|research|study|review|論文|研究|會議/.test(text)) {
    return "academic_paper";
  }

  if (source.sourceType === "Authoritative Media" || source.url || /news|article|blog|web|新聞|報導|網頁|網站/.test(text)) {
    return "news_or_web";
  }

  return "unknown";
}

export function calculateSourceConfidence(source: SourceRecord): SourceConfidence {
  const hasTitle = Boolean(cleanText(source.title));
  const hasYear = typeof source.year === "number" && Number.isFinite(source.year);
  const hasDoi = Boolean(normalizeDoi(source.doi));
  const hasUrl = Boolean(cleanText(source.url));
  const hasAuthorOrPublisher = source.authors.length > 0 || Boolean(cleanText(source.publisher));

  if (hasDoi && hasYear && hasTitle && hasCredibleProvider(source)) return "高";
  if (!hasTitle || (!hasDoi && !hasUrl) || (!hasYear && !hasAuthorOrPublisher)) return "低";
  return "中";
}

export function normalizeSourceForReview(source: SourceRecord): SourceRecord {
  const normalized: SourceRecord = {
    ...source,
    id: cleanText(source.id) ?? "",
    title: sanitizeReviewText(source.title) ?? "",
    authors: source.authors.map((author) => sanitizeReviewText(author)).filter((author): author is string => Boolean(author)),
    year: typeof source.year === "number" && Number.isFinite(source.year) ? Math.trunc(source.year) : null,
    abstract: sanitizeReviewText(source.abstract),
    snippet: sanitizeReviewText(source.snippet),
    language: cleanText(source.language),
    abstractMissing:
      typeof source.abstractMissing === "boolean"
        ? source.abstractMissing
        : !cleanText(source.abstract),
    doi: normalizeDoi(source.doi),
    url: cleanText(source.url),
    sourceType: source.sourceType,
    reviewState: sourceReviewState(source),
    publisher: sanitizeReviewText(source.publisher),
    containerTitle: sanitizeReviewText(source.containerTitle),
    accessedAt: cleanText(source.accessedAt),
    provider: cleanText(source.provider),
    queryUsed: cleanText(source.queryUsed),
    retrievedAt: cleanText(source.retrievedAt),
    dedupeKey: cleanText(source.dedupeKey) ?? "",
    sourceKind: normalizeSourceKind(source.sourceKind),
    citationCount: normalizeNonNegativeInteger(source.citationCount),
    isOpenAccess: typeof source.isOpenAccess === "boolean" ? source.isOpenAccess : null,
    accessLevel: normalizeContentAccessLevel(source.accessLevel),
    fullTextUrl: cleanText(source.fullTextUrl),
    readableUrl: cleanText(source.readableUrl),
    extractionStatus: normalizeExtractionStatus(source.extractionStatus),
    extractionMethod: normalizeExtractionMethod(source.extractionMethod),
    extractionMode: normalizeExtractionMode(source.extractionMode),
    pageCount: normalizeNonNegativeInteger(source.pageCount),
    extractedPageCount: normalizeNonNegativeInteger(source.extractedPageCount),
    isScanned: typeof source.isScanned === "boolean" ? source.isScanned : null,
    failureReason: cleanText(source.failureReason),
    userFacingMessage: sanitizeReviewText(source.userFacingMessage),
    canUseForClaims:
      typeof source.canUseForClaims === "boolean" ? source.canUseForClaims : null,
    canUseForReport:
      typeof source.canUseForReport === "boolean" ? source.canUseForReport : null,
    toolVersions: source.toolVersions ?? null,
    processingStartedAt: cleanText(source.processingStartedAt),
    processingEndedAt: cleanText(source.processingEndedAt),
    qualityFlags: normalizeStringList(source.qualityFlags),
    fullTextCharCount: normalizeNonNegativeInteger(source.fullTextCharCount),
    extractedAbstract: sanitizeReviewText(source.extractedAbstract),
    extractedSections: normalizeExtractedSections(source.extractedSections),
    extractedChunks: normalizeExtractedChunks(source.extractedChunks),
    extractionWarnings: normalizeStringList(source.extractionWarnings),
    claimExtractionStatus: normalizeClaimExtractionStatus(source.claimExtractionStatus),
    claimExtractionMode: normalizeClaimExtractionMode(source.claimExtractionMode),
    claimCount: normalizeNonNegativeInteger(source.claimCount),
    acceptedClaimCount: normalizeNonNegativeInteger(source.acceptedClaimCount),
    acceptedEvidenceCardCount: normalizeNonNegativeInteger(source.acceptedEvidenceCardCount),
    claimExtractionWarnings: normalizeStringList(source.claimExtractionWarnings),
    contentHash: cleanText(source.contentHash),
    sourceUseLevel: normalizeSourceUseLevel(source.sourceUseLevel),
    isPeerReviewed: typeof source.isPeerReviewed === "boolean" ? source.isPeerReviewed : null,
    sourceQualityScore: normalizeOptionalScore(source.sourceQualityScore),
    scoreReasons: normalizeStringList(source.scoreReasons),
    topicalRelevanceScore: normalizeOptionalScore(source.topicalRelevanceScore),
    topicalRelevanceLabel: normalizeTopicalRelevanceLabel(source.topicalRelevanceLabel),
    matchedAnchorConcepts: normalizeStringList(source.matchedAnchorConcepts),
    matchedApplicationConcepts: normalizeStringList(source.matchedApplicationConcepts),
    negativeSignals: normalizeStringList(source.negativeSignals),
    shouldRejectImmediately:
      typeof source.shouldRejectImmediately === "boolean"
        ? source.shouldRejectImmediately
        : null,
    evidenceSufficiency: normalizeEvidenceSufficiency(source.evidenceSufficiency),
    usableAsPrimaryEvidence:
      typeof source.usableAsPrimaryEvidence === "boolean"
        ? source.usableAsPrimaryEvidence
        : null,
    usableAsSecondaryEvidence:
      typeof source.usableAsSecondaryEvidence === "boolean"
        ? source.usableAsSecondaryEvidence
        : null,
    usageRecommendation: normalizeUsageRecommendation(source.usageRecommendation),
    qualityWarnings: normalizeStringList(source.qualityWarnings),
    manuallyForced:
      typeof source.manuallyForced === "boolean" ? source.manuallyForced : null,
    sourceCategory: normalizeSourceCategory(source.sourceCategory),
    usableSections: normalizeUsableSections(source.usableSections),
    confidence: normalizeSourceConfidence(source.confidence),
    reviewNotes: cleanText(source.reviewNotes),
    relevanceLevel: normalizeRelevanceLevel(source.relevanceLevel),
    relevanceScore: typeof source.relevanceScore === "number" && Number.isFinite(source.relevanceScore)
      ? source.relevanceScore
      : null,
    relevanceReasons: normalizeStringList(source.relevanceReasons),
    matchedCoreConcepts: normalizeStringList(source.matchedCoreConcepts),
    missingCoreConcepts: normalizeStringList(source.missingCoreConcepts),
    matchedFacets: normalizeStringList(source.matchedFacets),
    missingRequiredFacets: normalizeStringList(source.missingRequiredFacets),
    evidenceGrounding: normalizeEvidenceGrounding(source.evidenceGrounding),
    sourceRelevanceReasonZhTw: cleanText(source.sourceRelevanceReasonZhTw),
    shouldShowInMainList: typeof source.shouldShowInMainList === "boolean" ? source.shouldShowInMainList : null,
    shouldRecommendAccept: typeof source.shouldRecommendAccept === "boolean" ? source.shouldRecommendAccept : null,
    readableSummaryZhTW: sanitizeReviewText(source.readableSummaryZhTW ?? source.readableSummaryZhTw),
    readableSummaryZhTw: sanitizeReviewText(source.readableSummaryZhTw ?? source.readableSummaryZhTW),
    summarySourceType: normalizeSummarySourceType(source.summarySourceType),
    summaryConfidence: normalizeSummaryConfidence(source.summaryConfidence),
    relevanceReasonZhTW: sanitizeReviewText(source.relevanceReasonZhTW ?? source.relevanceReasonZhTw),
    relevanceReasonZhTw: sanitizeReviewText(source.relevanceReasonZhTw ?? source.relevanceReasonZhTW),
    summaryWarnings: normalizeStringList(source.summaryWarnings),
    originalAbstract: sanitizeReviewText(source.originalAbstract ?? source.abstractOriginal),
    abstractOriginal: sanitizeReviewText(source.abstractOriginal ?? source.originalAbstract),
    abstractZhTw: sanitizeReviewText(source.abstractZhTw),
    originalSnippet: sanitizeReviewText(source.originalSnippet),
    extractedText: sanitizeReviewText(source.extractedText),
    authorityLevel: normalizeAuthorityLevel(source.authorityLevel),
    authorityScore: typeof source.authorityScore === "number" && Number.isFinite(source.authorityScore)
      ? source.authorityScore
      : null,
    authorityLabel: cleanText(source.authorityLabel),
    sourceLanguage: normalizeSourceLanguage(source.sourceLanguage),
    sourceLanguageLabel: cleanText(source.sourceLanguageLabel),
    mainEvidenceFacet: cleanText(source.mainEvidenceFacet),
    evidenceSummaryZhTw: cleanText(source.evidenceSummaryZhTw),
    mainEvidencePointZhTw: cleanText(source.mainEvidencePointZhTw ?? source.evidenceSummaryZhTw),
    llmSummaryZhTw: cleanText(source.llmSummaryZhTw),
    llmSummaryStatus: normalizeLlmSummaryStatus(source.llmSummaryStatus),
    summaryStructuredStatus: normalizeStructuredSummaryStatus(
      source.summaryStructuredStatus,
    ),
    summaryProvider: cleanText(source.summaryProvider),
    summaryModel: cleanText(source.summaryModel),
    summaryStatus: normalizeLlmSummaryStatus(source.summaryStatus),
    summaryFallbackUsed: typeof source.summaryFallbackUsed === "boolean" ? source.summaryFallbackUsed : null,
    summaryReason: cleanText(source.summaryReason),
    summaryMessage: cleanText(source.summaryMessage),
    evidenceSnippets: normalizeEvidenceSnippetList(source.evidenceSnippets),
    evidenceChain: normalizeEvidenceChainList(source.evidenceChain),
    workflowId: cleanText(source.workflowId),
    topic: cleanText(source.topic),
    normalizedTopic: cleanText(source.normalizedTopic),
    topicHash: cleanText(source.topicHash),
    queryPlanHash: cleanText(source.queryPlanHash),
    summaryUsabilityScore: normalizeOptionalScore(source.summaryUsabilityScore),
    metadataCompletenessScore: normalizeOptionalScore(source.metadataCompletenessScore),
    recencyScore: normalizeOptionalScore(source.recencyScore),
    languageFitScore: normalizeOptionalScore(source.languageFitScore),
    finalScore: normalizeOptionalScore(source.finalScore),
    classification: normalizeSourceClassification(source.classification),
    rejectReason: cleanText(source.rejectReason),
    matchedTerms: normalizeStringList(source.matchedTerms),
    driftTerms: normalizeStringList(source.driftTerms),
    topicRelevance: normalizeOptionalScore(source.topicRelevance),
    evidenceQuality: normalizeOptionalScore(source.evidenceQuality),
    metadataCompleteness: normalizeOptionalScore(source.metadataCompleteness),
    abstractQuality: normalizeOptionalScore(source.abstractQuality),
    sourceTrust: normalizeOptionalScore(source.sourceTrust),
    isMetadataOnly: typeof source.isMetadataOnly === "boolean" ? source.isMetadataOnly : null,
    isPrimaryEvidence: typeof source.isPrimaryEvidence === "boolean" ? source.isPrimaryEvidence : null,
    rejectionReason: cleanText(source.rejectionReason),
    recommendation: cleanText(source.recommendation),
    recommendationBucket: normalizeRecommendationBucket(source.recommendationBucket),
    sourceRole: normalizeSourceRole(source.sourceRole),
    retrievalMode: normalizeRetrievalMode(source.retrievalMode),
    institutionType: cleanText(source.institutionType),
    evidencePoints: normalizeStringList(source.evidencePoints),
    providerHealthSnapshot: source.providerHealthSnapshot ?? null,
    acceptedByUser: typeof source.acceptedByUser === "boolean" ? source.acceptedByUser : null,
    userDecision: cleanText(source.userDecision),
    acceptedAs: cleanText(source.acceptedAs),
    lowConfidence: typeof source.lowConfidence === "boolean" ? source.lowConfidence : null,
    needsReview: typeof source.needsReview === "boolean" ? source.needsReview : null,
    sourceLinkInfo: normalizeSourceLinkInfoValue(source.sourceLinkInfo, source),
    sourceValidation: source.sourceValidation ?? null,
    readableExtraction: source.readableExtraction ?? null,
    sourceFacts: Array.isArray(source.sourceFacts) ? source.sourceFacts : null,
    researchRelevanceScore: source.researchRelevanceScore ?? null,
    sourceSummary: source.sourceSummary ?? null,
  };
  return {
    ...normalized,
    id: normalized.id || sourceRecordKey(normalized),
    dedupeKey: normalized.dedupeKey || sourceRecordKey(normalized),
    sourceCategory: normalized.sourceCategory ?? classifySourceRecord(normalized),
    confidence: normalized.confidence ?? calculateSourceConfidence(normalized),
  };
}

export function dedupeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  const seen = new Map<string, SourceRecord>();
  const deduped: SourceRecord[] = [];

  for (const source of sources) {
    const normalized = normalizeSourceForReview(source);
    const key = sourceRecordKey(normalized);
    const existing = seen.get(key);
    if (existing) {
      const existingAbstractLength = existing.abstract?.length ?? 0;
      const incomingAbstractLength = normalized.abstract?.length ?? 0;
      const doi = existing.doi ?? normalized.doi;
      const doiUrl = doi ? `https://doi.org/${doi}` : null;
      const merged: SourceRecord = normalizeSourceForReview({
        ...existing,
        title: existing.title.length >= normalized.title.length ? existing.title : normalized.title,
        authors: Array.from(new Set([...existing.authors, ...normalized.authors])),
        year: existing.year ?? normalized.year,
        abstract: incomingAbstractLength > existingAbstractLength ? normalized.abstract : existing.abstract,
        doi,
        url: doiUrl ?? existing.url ?? normalized.url,
        sourceType: existing.sourceType,
        reviewState:
          sourceReviewState(existing) === "accepted" || sourceReviewState(normalized) === "accepted"
            ? "accepted"
            : sourceReviewState(existing) === "rejected" || sourceReviewState(normalized) === "rejected"
              ? "rejected"
              : "pending",
        publisher: existing.publisher ?? normalized.publisher,
        containerTitle: existing.containerTitle ?? normalized.containerTitle,
        accessedAt: existing.accessedAt ?? normalized.accessedAt,
        provider: existing.provider ?? normalized.provider ?? existing.sourceType,
        queryUsed: existing.queryUsed ?? normalized.queryUsed,
        retrievedAt: existing.retrievedAt ?? normalized.retrievedAt,
        dedupeKey: existing.dedupeKey ?? normalized.dedupeKey,
        sourceKind: existing.sourceKind ?? normalized.sourceKind,
        citationCount: mergeScore(existing.citationCount, normalized.citationCount),
        isOpenAccess:
          typeof existing.isOpenAccess === "boolean" || typeof normalized.isOpenAccess === "boolean"
            ? Boolean(existing.isOpenAccess || normalized.isOpenAccess)
            : null,
        accessLevel: existing.accessLevel ?? normalized.accessLevel,
        fullTextUrl: existing.fullTextUrl ?? normalized.fullTextUrl,
        readableUrl: existing.readableUrl ?? normalized.readableUrl,
        extractionStatus: existing.extractionStatus ?? normalized.extractionStatus,
        extractionMethod: existing.extractionMethod ?? normalized.extractionMethod,
        extractionMode: existing.extractionMode ?? normalized.extractionMode,
        pageCount: mergeScore(existing.pageCount, normalized.pageCount),
        extractedPageCount: mergeScore(existing.extractedPageCount, normalized.extractedPageCount),
        isScanned:
          typeof existing.isScanned === "boolean" || typeof normalized.isScanned === "boolean"
            ? Boolean(existing.isScanned || normalized.isScanned)
            : null,
        failureReason: existing.failureReason ?? normalized.failureReason,
        userFacingMessage: existing.userFacingMessage ?? normalized.userFacingMessage,
        canUseForClaims:
          typeof existing.canUseForClaims === "boolean" ||
          typeof normalized.canUseForClaims === "boolean"
            ? Boolean(existing.canUseForClaims || normalized.canUseForClaims)
            : null,
        canUseForReport:
          typeof existing.canUseForReport === "boolean" ||
          typeof normalized.canUseForReport === "boolean"
            ? Boolean(existing.canUseForReport || normalized.canUseForReport)
            : null,
        toolVersions: existing.toolVersions ?? normalized.toolVersions,
        processingStartedAt: existing.processingStartedAt ?? normalized.processingStartedAt,
        processingEndedAt: existing.processingEndedAt ?? normalized.processingEndedAt,
        qualityFlags: mergeStringList(existing.qualityFlags, normalized.qualityFlags),
        fullTextCharCount: mergeScore(existing.fullTextCharCount, normalized.fullTextCharCount),
        extractedAbstract: existing.extractedAbstract ?? normalized.extractedAbstract,
        extractedSections: existing.extractedSections ?? normalized.extractedSections,
        extractedChunks: existing.extractedChunks ?? normalized.extractedChunks,
        extractionWarnings: mergeStringList(existing.extractionWarnings, normalized.extractionWarnings),
        claimExtractionStatus:
          existing.claimExtractionStatus ?? normalized.claimExtractionStatus,
        claimExtractionMode: existing.claimExtractionMode ?? normalized.claimExtractionMode,
        claimCount: mergeScore(existing.claimCount, normalized.claimCount),
        acceptedClaimCount: mergeScore(existing.acceptedClaimCount, normalized.acceptedClaimCount),
        acceptedEvidenceCardCount: mergeScore(
          existing.acceptedEvidenceCardCount,
          normalized.acceptedEvidenceCardCount,
        ),
        claimExtractionWarnings: mergeStringList(
          existing.claimExtractionWarnings,
          normalized.claimExtractionWarnings,
        ),
        contentHash: existing.contentHash ?? normalized.contentHash,
        sourceUseLevel: existing.sourceUseLevel ?? normalized.sourceUseLevel,
        isPeerReviewed:
          typeof existing.isPeerReviewed === "boolean" || typeof normalized.isPeerReviewed === "boolean"
            ? Boolean(existing.isPeerReviewed || normalized.isPeerReviewed)
            : null,
        sourceQualityScore: mergeScore(existing.sourceQualityScore, normalized.sourceQualityScore),
        recommendationBucket: existing.recommendationBucket ?? normalized.recommendationBucket,
        sourceRole: existing.sourceRole ?? normalized.sourceRole,
        retrievalMode: existing.retrievalMode ?? normalized.retrievalMode,
        institutionType: existing.institutionType ?? normalized.institutionType,
        evidencePoints: mergeStringList(existing.evidencePoints, normalized.evidencePoints),
        providerHealthSnapshot: existing.providerHealthSnapshot ?? normalized.providerHealthSnapshot,
        acceptedByUser:
          typeof existing.acceptedByUser === "boolean" || typeof normalized.acceptedByUser === "boolean"
            ? Boolean(existing.acceptedByUser ?? normalized.acceptedByUser)
            : null,
        userDecision: existing.userDecision ?? normalized.userDecision,
        acceptedAs: existing.acceptedAs ?? normalized.acceptedAs,
        scoreReasons: mergeStringList(
          existing.scoreReasons,
          existing.sourceType === normalized.sourceType
            ? normalized.scoreReasons
            : [
                ...(normalized.scoreReasons ?? []),
                `merged providers: ${Array.from(new Set([existing.sourceType, normalized.sourceType])).join(", ")}`,
              ],
        ),
      });
      const withStableId = { ...merged, id: existing.id || key };
      seen.set(key, withStableId);
      const index = deduped.findIndex((item) => item.id === existing.id);
      if (index >= 0) deduped[index] = withStableId;
      continue;
    }
    const inserted = { ...normalized, id: normalized.id || key };
    seen.set(key, inserted);
    deduped.push(inserted);
  }

  return deduped;
}

export function acceptedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => sourceReviewState(source) === "accepted");
}

export function candidateSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => sourceReviewState(source) === "pending");
}

export function rejectedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => sourceReviewState(source) === "rejected");
}

export function sourceReviewCounts(sources: SourceRecord[]): {
  all: number;
  accepted: number;
  pending: number;
  rejected: number;
} {
  return {
    all: sources.length,
    accepted: acceptedSourceRecords(sources).length,
    pending: candidateSourceRecords(sources).length,
    rejected: rejectedSourceRecords(sources).length,
  };
}

export function updateSourceReviewState(
  sources: SourceRecord[],
  sourceId: string,
  reviewState: SourceReviewState,
): SourceRecord[] {
  return sources.map((source) => {
    const key = source.id || sourceRecordKey(source);
    if (key !== sourceId) return source;
    return normalizeSourceForReview({
      ...source,
      id: key,
      reviewState,
      acceptedByUser: reviewState === "accepted" ? true : false,
      userDecision:
        reviewState === "accepted"
          ? source.recommendationBucket === "official_background"
            ? "accepted_as_background"
            : source.recommendationBucket === "manual_review"
              ? "accepted_as_manual_review"
              : "accepted"
          : reviewState === "rejected"
            ? "rejected"
            : "pending",
      acceptedAs:
        reviewState === "accepted"
          ? source.recommendationBucket === "official_background"
            ? "background"
            : source.recommendationBucket === "manual_review"
              ? "manual_review"
              : "source"
          : null,
    });
  });
}

function sourceShouldAutoAccept(source: SourceRecord): boolean {
  if (sourceReviewState(source) !== "pending") return false;
  if (
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow"
  ) {
    return false;
  }
  if (source.relevanceLevel !== "primary") return false;
  if (source.classification !== "primary") return false;
  if (source.shouldRecommendAccept === false) return false;
  if (source.shouldShowInMainList === false) return false;
  if (source.isMetadataOnly || source.evidenceGrounding === "metadata_only") return false;
  return true;
}

export function autoAcceptPrimarySources(sources: SourceRecord[]): SourceRecord[] {
  return sources.map((source) =>
    sourceShouldAutoAccept(source)
      ? normalizeSourceForReview({ ...source, reviewState: "accepted" })
      : normalizeSourceForReview(source),
  );
}

export function sourceMetadataIssues(source: SourceRecord): string[] {
  const missing: string[] = [];
  if (!cleanText(source.title)) missing.push("標題");
  if (source.authors.length === 0) missing.push("作者");
  if (!source.year) missing.push("年份");
  if (!source.doi && !source.url) missing.push("DOI 或網址");
  return missing;
}

export function sourceHasIncompleteMetadata(source: SourceRecord): boolean {
  return sourceMetadataIssues(source).length > 0;
}

export function formatSourceAuthors(authors: string[]): string {
  if (!authors.length) return "作者待確認";
  if (authors.length <= 3) return authors.join("、");
  return `${authors.slice(0, 3).join("、")} 等`;
}

function formatApaAuthor(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return author.trim();

  const family = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((part) => `${part.charAt(0).toUpperCase()}.`)
    .join(" ");
  return `${family}, ${initials}`;
}

function formatApaAuthors(authors: string[]): string {
  if (authors.length === 0) return "作者未提供";
  const formatted = authors.map(formatApaAuthor);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
}

export function formatApaReference(source: SourceRecord): BibliographyEntry {
  const normalized = normalizeSourceForReview(source);
  const missingFields = sourceMetadataIssues(normalized);
  const year = normalized.year ? `(${normalized.year})` : "(年份未提供)";
  const title = normalized.title || "標題未提供";
  const container = normalized.containerTitle || normalized.publisher;
  const locator = normalized.doi ? `https://doi.org/${normalized.doi}` : normalized.url;
  const parts = [
    `${formatApaAuthors(normalized.authors)} ${year}.`,
    `${title}.`,
    container ? `${container}.` : null,
    locator,
  ].filter((part): part is string => Boolean(part));
  const incompleteLabel = missingFields.length ? `（metadata incomplete: ${missingFields.join("、")}）` : "";

  return {
    sourceId: normalized.id,
    text: `${parts.join(" ")}${incompleteLabel}`,
    incomplete: missingFields.length > 0,
    missingFields,
  };
}

export function buildBibliography(sources: SourceRecord[], format = "APA"): BibliographyEntry[] {
  const accepted = acceptedSourceRecords(dedupeSourceRecords(sources));
  if (format !== "APA" && format !== "不需要") {
    return accepted.map(formatApaReference);
  }
  return accepted.map(formatApaReference);
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

export function reportContainsCitationPlaceholders(report: ReportLike): boolean {
  const text = (report.sections ?? [])
    .filter((section) => section.heading !== "資料來源與引用安全規則" && section.heading !== "五步驟生成流程")
    .flatMap((section) => section.blocks ?? [])
    .flatMap(collectStrings)
    .join("\n");
  return CITATION_PLACEHOLDERS.some((placeholder) => text.includes(placeholder));
}

export function buildExportReadinessWarnings(report: ReportLike): ExportReadinessWarning[] {
  const acceptedSources = report.meta?.acceptedSources ?? [];
  const incompleteSources = acceptedSources.filter(sourceHasIncompleteMetadata);
  const warnings: ExportReadinessWarning[] = [];

  if (acceptedSources.length === 0) {
    warnings.push({
      code: "no-accepted-sources",
      message: "尚未接受任何來源，匯出內容不會包含可驗證引用。",
    });
  }

  if (incompleteSources.length > 0) {
    warnings.push({
      code: "incomplete-source-metadata",
      message: `有 ${incompleteSources.length} 筆已接受來源的 metadata 不完整，參考文獻會標示 incomplete。`,
    });
  }

  if (reportContainsCitationPlaceholders(report)) {
    warnings.push({
      code: "citation-placeholders",
      message: "報告中仍含引用佔位文字，正式提交前請補齊或移除。",
    });
  }

  return warnings;
}
