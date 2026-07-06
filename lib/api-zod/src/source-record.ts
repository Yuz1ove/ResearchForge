import type {
  ReadableExtraction,
  RelevanceScore,
  SourceFact,
  SourceSummary,
  SourceValidation,
} from "./research-pipeline";
import type {
  EvidenceRecommendationBucket,
  EvidenceUserDecision,
} from "./evidence-governance";

export const SOURCE_PROVIDERS = [
  "OpenAlex",
  "Semantic Scholar",
  "Crossref",
  "Official Source",
  "Institutional Source",
  "Authoritative Media",
] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export const SOURCE_REVIEW_STATES = ["pending", "accepted", "rejected"] as const;
export type SourceReviewState = (typeof SOURCE_REVIEW_STATES)[number];

export const SOURCE_RELEVANCE_LEVELS = ["primary", "secondary", "clue", "low", "off_topic"] as const;
export type SourceRelevanceLevel = (typeof SOURCE_RELEVANCE_LEVELS)[number];

export const SOURCE_EVIDENCE_GROUNDING_STATUSES = [
  "abstract_grounded",
  "snippet_grounded",
  "metadata_only",
  "insufficient",
] as const;
export type SourceEvidenceGroundingStatus = (typeof SOURCE_EVIDENCE_GROUNDING_STATUSES)[number];

export const SOURCE_SUMMARY_SOURCE_TYPES = [
  "abstract",
  "snippet",
  "fulltext",
  "metadataFallback",
] as const;
export type SourceSummarySourceType = (typeof SOURCE_SUMMARY_SOURCE_TYPES)[number];

export const SOURCE_SUMMARY_CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type SourceSummaryConfidence = (typeof SOURCE_SUMMARY_CONFIDENCE_LEVELS)[number];

export const SOURCE_KINDS = ["journal", "conference", "book", "dataset", "web", "unknown"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_RECOMMENDATION_BUCKETS = [
  "scholarly_recommended",
  "official_background",
  "manual_review",
  "rejected",
] as const;
export type SourceRecommendationBucket = EvidenceRecommendationBucket;

export const SOURCE_ROLES = [
  "core_scholarly_evidence",
  "official_background_explanation",
  "definition_or_concept",
  "statistics_or_dataset",
  "teaching_or_public_explainer",
  "weak_or_uncertain",
  "rejected",
] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const SOURCE_RETRIEVAL_MODES = [
  "live_provider",
  "stale_cache",
  "trusted_seed",
  "user_import",
  "manual_url",
  "supplemental_fulltext_or_repository",
] as const;
export type SourceRetrievalMode = (typeof SOURCE_RETRIEVAL_MODES)[number];

export const SOURCE_CONTENT_ACCESS_LEVELS = [
  "full_text",
  "abstract_only",
  "metadata_only",
  "blocked_or_paywalled",
  "failed_extraction",
] as const;
export type SourceContentAccessLevel = (typeof SOURCE_CONTENT_ACCESS_LEVELS)[number];

export const SOURCE_CONTENT_EXTRACTION_STATUSES = [
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
] as const;
export type SourceContentExtractionStatus = (typeof SOURCE_CONTENT_EXTRACTION_STATUSES)[number];

export const SOURCE_CONTENT_EXTRACTION_METHODS = [
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
] as const;
export type SourceContentExtractionMethod = (typeof SOURCE_CONTENT_EXTRACTION_METHODS)[number];

export const SOURCE_EXTRACTION_MODES = [
  "pdf_text",
  "grobid",
  "ocr",
  "html",
  "abstract",
  "metadata_only",
  "failed",
] as const;
export type SourceExtractionMode = (typeof SOURCE_EXTRACTION_MODES)[number];

export const SOURCE_CLAIM_EXTRACTION_STATUSES = [
  "enabled",
  "fallback",
  "unavailable",
  "failed",
  "skipped",
] as const;
export type SourceClaimExtractionStatus = (typeof SOURCE_CLAIM_EXTRACTION_STATUSES)[number];

export const SOURCE_CLAIM_EXTRACTION_MODES = [
  "llm",
  "rule_fallback",
  "metadata_only",
] as const;
export type SourceClaimExtractionMode = (typeof SOURCE_CLAIM_EXTRACTION_MODES)[number];

export const SOURCE_USE_LEVELS = [
  "citable_full_text",
  "citable_abstract",
  "metadata_context_only",
  "manual_review_required",
  "rejected",
] as const;
export type SourceUseLevel = (typeof SOURCE_USE_LEVELS)[number];

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

export const SOURCE_RELEVANCE_CLASSIFICATIONS = [
  "primary",
  "review",
  "low_quality",
  "off_topic",
  "trusted_but_off_topic",
  "stale_topic",
  "stale_workflow",
] as const;
export type SourceRelevanceClassification = (typeof SOURCE_RELEVANCE_CLASSIFICATIONS)[number];

export const SOURCE_ACCESS_STATUSES = [
  "ok",
  "redirected",
  "metadata_only",
  "blocked",
  "not_found",
  "unknown",
] as const;
export type SourceAccessStatus = (typeof SOURCE_ACCESS_STATUSES)[number];

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

export interface SourceRecord {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  snippet?: string | null;
  language?: string | null;
  abstractMissing?: boolean | null;
  doi: string | null;
  url: string | null;
  sourceLinkInfo?: SourceLinkInfo | null;
  sourceType: SourceProvider;
  reviewState: SourceReviewState;
  publisher: string | null;
  containerTitle: string | null;
  accessedAt: string | null;
  provider?: string | null;
  queryUsed?: string | null;
  retrievedAt?: string | null;
  dedupeKey?: string | null;
  sourceKind?: SourceKind | null;
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
  contentHash?: string | null;
  sourceUseLevel?: SourceUseLevel | null;
  isPeerReviewed?: boolean | null;
  sourceQualityScore?: number | null;
  scoreReasons?: string[] | null;
  relevanceLevel?: SourceRelevanceLevel | null;
  relevanceScore?: number | null;
  relevanceReasons?: string[] | null;
  matchedCoreConcepts?: string[] | null;
  missingCoreConcepts?: string[] | null;
  matchedFacets?: string[] | null;
  missingRequiredFacets?: string[] | null;
  evidenceGrounding?: SourceEvidenceGroundingStatus | null;
  claimExtractionStatus?: SourceClaimExtractionStatus | null;
  claimExtractionMode?: SourceClaimExtractionMode | null;
  claimCount?: number | null;
  acceptedClaimCount?: number | null;
  acceptedEvidenceCardCount?: number | null;
  claimExtractionWarnings?: string[] | null;
  sourceRelevanceReasonZhTw?: string | null;
  llmSummaryZhTw?: string | null;
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
  mainEvidencePointZhTw?: string | null;
  llmSummaryStatus?: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped" | "metadata-only" | "fetch-failed" | "llm-failed" | "fallback" | null;
  summaryStructuredStatus?: "success" | "unavailable" | "invalid_input" | "insufficient_sources" | "error" | null;
  summaryProvider?: string | null;
  summaryModel?: string | null;
  summaryStatus?: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped" | "metadata-only" | "fetch-failed" | "llm-failed" | "fallback" | null;
  summaryFallbackUsed?: boolean | null;
  summaryReason?: string | null;
  summaryMessage?: string | null;
  sourceCategory?: string | null;
  usableSections?: string[] | null;
  confidence?: string | null;
  reviewNotes?: string | null;
  shouldShowInMainList?: boolean | null;
  shouldRecommendAccept?: boolean | null;
  workflowId?: string | null;
  topic?: string | null;
  normalizedTopic?: string | null;
  topicHash?: string | null;
  queryPlanHash?: string | null;
  authorityScore?: number | null;
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
  userDecision?: EvidenceUserDecision | string | null;
  acceptedAs?: string | null;
  lowConfidence?: boolean | null;
  needsReview?: boolean | null;
  sourceValidation?: SourceValidation | null;
  readableExtraction?: ReadableExtraction | null;
  sourceFacts?: SourceFact[] | null;
  researchRelevanceScore?: RelevanceScore | null;
  sourceSummary?: SourceSummary | null;
}

export type SourceRecordInput = Partial<SourceRecord> & {
  title?: string | null;
  authors?: Array<string | null | undefined> | null;
  sourceType: SourceProvider;
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDoiValue(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase() || null;
}

function normalizeUrlValue(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return text.replace(/\s+/g, "");
}

function doiUrl(doi: string | null): string | null {
  return doi ? `https://doi.org/${doi}` : null;
}

function metadataUrlForSource(source: {
  sourceType: SourceProvider;
  doi: string | null;
  url: string | null;
}): string | null {
  if (source.doi) {
    if (source.sourceType === "Crossref") {
      return `https://api.crossref.org/works/${encodeURIComponent(source.doi)}`;
    }
    if (source.sourceType === "OpenAlex") {
      return `https://api.openalex.org/works/doi:${encodeURIComponent(source.doi)}`;
    }
    if (source.sourceType === "Semantic Scholar") {
      return `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(source.doi)}`;
    }
  }
  return source.url ?? null;
}

function sourceAccessStatus(source: {
  sourceType: SourceProvider;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  abstractMissing?: boolean | null;
}): SourceAccessStatus {
  if (source.doi) return source.url && source.url !== doiUrl(source.doi) ? "redirected" : "ok";
  if (!source.url) return "metadata_only";
  if (source.abstractMissing && !source.abstract?.trim()) return "metadata_only";
  return "unknown";
}

function normalizeSourceLinkInfo(
  source: {
    sourceLinkInfo?: SourceLinkInfo | null;
    sourceType: SourceProvider;
    doi: string | null;
    url: string | null;
    abstract: string | null;
    abstractMissing?: boolean | null;
  },
): SourceLinkInfo {
  const doi = normalizeDoiValue(source.sourceLinkInfo?.doi) ?? source.doi;
  const canonicalUrl =
    normalizeUrlValue(source.sourceLinkInfo?.canonicalUrl) ??
    (doi ? doiUrl(doi) : normalizeUrlValue(source.url));
  const originalUrl =
    normalizeUrlValue(source.sourceLinkInfo?.originalUrl) ??
    (source.url && source.url !== canonicalUrl ? normalizeUrlValue(source.url) : null);
  const metadataUrl =
    normalizeUrlValue(source.sourceLinkInfo?.metadataUrl) ??
    metadataUrlForSource({ sourceType: source.sourceType, doi, url: source.url });
  const accessStatus =
    SOURCE_ACCESS_STATUSES.includes(source.sourceLinkInfo?.accessStatus as SourceAccessStatus)
      ? source.sourceLinkInfo!.accessStatus
      : sourceAccessStatus({ ...source, doi });
  const warnings = uniqueStrings([
    ...(source.sourceLinkInfo?.linkWarnings ?? []),
    accessStatus === "metadata_only" ? "metadata_only_source" : "",
    !canonicalUrl && !metadataUrl ? "missing_resolvable_link" : "",
  ]);

  return {
    originalUrl,
    canonicalUrl,
    resolvedUrl: normalizeUrlValue(source.sourceLinkInfo?.resolvedUrl) ?? canonicalUrl,
    doi,
    doiUrl: doiUrl(doi),
    metadataUrl,
    apiSourceUrl: normalizeUrlValue(source.sourceLinkInfo?.apiSourceUrl) ?? metadataUrl,
    accessStatus,
    linkWarnings: warnings,
  };
}

function normalizeYearValue(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function stableHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizedTitleKey(title: string): string {
  return normalizeWhitespace(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/^[\s:.]+|[\s:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizedTitleKey(title)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 3),
  );
}

function titleSimilarity(a: string, b: string): number {
  const aTokens = titleTokens(a);
  const bTokens = titleTokens(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersection += 1;
  }

  const union = new Set([...aTokens, ...bTokens]).size;
  return union ? intersection / union : 0;
}

function normalizedAuthorKey(author: string | null | undefined): string {
  return normalizeWhitespace(author ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function sourceRecordKey(
  source: Pick<SourceRecord, "title" | "doi" | "url" | "sourceType"> &
    Partial<Pick<SourceRecord, "authors" | "year">>,
): string {
  const doi = normalizeDoiValue(source.doi);
  if (doi) return `doi:${doi.toLowerCase()}`;

  const title = normalizedTitleKey(source.title);
  const firstAuthor = normalizedAuthorKey(source.authors?.[0]);
  const year = normalizeYearValue(source.year);
  if (title && firstAuthor && year) return `title:${title}|author:${firstAuthor}|year:${year}`;
  if (title) return `title:${title}`;

  return `source:${source.sourceType}:${stableHash(JSON.stringify(source))}`;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => normalizeWhitespace(item)).filter(Boolean)));
}

function textLength(value: string | null): number {
  return value?.trim().length ?? 0;
}

function cleanStringList(value: string[] | null | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = uniqueStrings(value);
  return items.length ? items : null;
}

function normalizeSourceKind(value: SourceRecordInput["sourceKind"]): SourceKind | null {
  if ((SOURCE_KINDS as readonly unknown[]).includes(value)) {
    return value as SourceKind;
  }
  return null;
}

function normalizeRelevanceLevel(value: SourceRecordInput["relevanceLevel"]): SourceRecord["relevanceLevel"] {
  if ((SOURCE_RELEVANCE_LEVELS as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function normalizeEvidenceGrounding(
  value: SourceRecordInput["evidenceGrounding"],
): SourceRecord["evidenceGrounding"] {
  if ((SOURCE_EVIDENCE_GROUNDING_STATUSES as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function normalizeSummarySourceType(
  value: SourceRecordInput["summarySourceType"],
): SourceRecord["summarySourceType"] {
  if ((SOURCE_SUMMARY_SOURCE_TYPES as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function normalizeSummaryConfidence(
  value: SourceRecordInput["summaryConfidence"],
): SourceRecord["summaryConfidence"] {
  if ((SOURCE_SUMMARY_CONFIDENCE_LEVELS as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function normalizeSummaryStatus(
  value: SourceRecordInput["summaryStatus"] | SourceRecordInput["llmSummaryStatus"],
): SourceRecord["summaryStatus"] {
  return value === "success" ||
      value === "timeout" ||
      value === "quota_exceeded" ||
      value === "failed" ||
      value === "skipped" ||
      value === "metadata-only" ||
      value === "fetch-failed" ||
      value === "llm-failed" ||
      value === "fallback"
    ? value
    : null;
}

function normalizeStructuredStatus(
  value: SourceRecordInput["summaryStructuredStatus"],
): SourceRecord["summaryStructuredStatus"] {
  return value === "success" ||
      value === "unavailable" ||
      value === "invalid_input" ||
      value === "insufficient_sources" ||
      value === "error"
    ? value
    : null;
}

function normalizeRecommendationBucket(
  value: SourceRecordInput["recommendationBucket"],
): SourceRecord["recommendationBucket"] {
  if ((SOURCE_RECOMMENDATION_BUCKETS as readonly unknown[]).includes(value)) {
    return value as SourceRecommendationBucket;
  }
  return null;
}

function normalizeSourceRole(value: SourceRecordInput["sourceRole"]): SourceRecord["sourceRole"] {
  if ((SOURCE_ROLES as readonly unknown[]).includes(value)) {
    return value as SourceRole;
  }
  return null;
}

function normalizeRetrievalMode(
  value: SourceRecordInput["retrievalMode"],
): SourceRecord["retrievalMode"] {
  if ((SOURCE_RETRIEVAL_MODES as readonly unknown[]).includes(value)) {
    return value as SourceRetrievalMode;
  }
  return null;
}

function normalizeContentAccessLevel(
  value: SourceRecordInput["accessLevel"],
): SourceRecord["accessLevel"] {
  if ((SOURCE_CONTENT_ACCESS_LEVELS as readonly unknown[]).includes(value)) {
    return value as SourceContentAccessLevel;
  }
  return null;
}

function normalizeExtractionStatus(
  value: SourceRecordInput["extractionStatus"],
): SourceRecord["extractionStatus"] {
  if ((SOURCE_CONTENT_EXTRACTION_STATUSES as readonly unknown[]).includes(value)) {
    return value as SourceContentExtractionStatus;
  }
  return null;
}

function normalizeExtractionMethod(
  value: SourceRecordInput["extractionMethod"],
): SourceRecord["extractionMethod"] {
  if ((SOURCE_CONTENT_EXTRACTION_METHODS as readonly unknown[]).includes(value)) {
    return value as SourceContentExtractionMethod;
  }
  return null;
}

function normalizeExtractionMode(
  value: SourceRecordInput["extractionMode"],
): SourceRecord["extractionMode"] {
  if ((SOURCE_EXTRACTION_MODES as readonly unknown[]).includes(value)) {
    return value as SourceExtractionMode;
  }
  return null;
}

function normalizeClaimExtractionStatus(
  value: SourceRecordInput["claimExtractionStatus"],
): SourceRecord["claimExtractionStatus"] {
  if ((SOURCE_CLAIM_EXTRACTION_STATUSES as readonly unknown[]).includes(value)) {
    return value as SourceClaimExtractionStatus;
  }
  return null;
}

function normalizeClaimExtractionMode(
  value: SourceRecordInput["claimExtractionMode"],
): SourceRecord["claimExtractionMode"] {
  if ((SOURCE_CLAIM_EXTRACTION_MODES as readonly unknown[]).includes(value)) {
    return value as SourceClaimExtractionMode;
  }
  return null;
}

function normalizeSourceUseLevel(
  value: SourceRecordInput["sourceUseLevel"],
): SourceRecord["sourceUseLevel"] {
  if ((SOURCE_USE_LEVELS as readonly unknown[]).includes(value)) {
    return value as SourceUseLevel;
  }
  return null;
}

function normalizeExtractedSections(
  value: SourceRecordInput["extractedSections"],
): SourceRecord["extractedSections"] {
  if (!Array.isArray(value)) return null;
  const sections = value
    .map((section) => {
      if (!section || typeof section !== "object") return null;
      const heading = cleanText(section.heading);
      const text = cleanText(section.text);
      if (!heading || !text) return null;
      return {
        heading,
        text,
        ...(typeof section.page === "number" && Number.isFinite(section.page)
          ? { page: Math.trunc(section.page) }
          : {}),
        confidence:
          typeof section.confidence === "number" && Number.isFinite(section.confidence)
            ? Math.max(0, Math.min(1, section.confidence))
            : 0.5,
      };
    })
    .filter((section): section is ExtractedSourceSection => Boolean(section));
  return sections.length ? sections : null;
}

function normalizeExtractedChunks(
  value: SourceRecordInput["extractedChunks"],
): SourceRecord["extractedChunks"] {
  if (!Array.isArray(value)) return null;
  const chunks = value
    .map((chunk) => {
      if (!chunk || typeof chunk !== "object") return null;
      const chunkId = cleanText(chunk.chunk_id);
      const text = cleanText(chunk.text);
      const sourceLocation = cleanText(chunk.source_location);
      if (!chunkId || !text || !sourceLocation) return null;
      return {
        chunk_id: chunkId,
        text,
        source_location: sourceLocation,
        ...(cleanText(chunk.section_heading)
          ? { section_heading: cleanText(chunk.section_heading) }
          : {}),
        ...(typeof chunk.page === "number" && Number.isFinite(chunk.page)
          ? { page: Math.trunc(chunk.page) }
          : {}),
        ...(typeof chunk.char_start === "number" && Number.isFinite(chunk.char_start)
          ? { char_start: Math.max(0, Math.trunc(chunk.char_start)) }
          : {}),
        ...(typeof chunk.char_end === "number" && Number.isFinite(chunk.char_end)
          ? { char_end: Math.max(0, Math.trunc(chunk.char_end)) }
          : {}),
      };
    })
    .filter((chunk): chunk is ExtractedSourceChunk => Boolean(chunk));
  return chunks.length ? chunks : null;
}

function normalizeUserDecision(
  value: SourceRecordInput["userDecision"],
): SourceRecord["userDecision"] {
  if (typeof value !== "string") return null;
  const trimmed = cleanText(value);
  return trimmed ?? null;
}

function normalizeClassification(
  value: SourceRecordInput["classification"],
): SourceRecord["classification"] {
  if ((SOURCE_RELEVANCE_CLASSIFICATIONS as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function finiteScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

function sourceKindFromRecord(
  source: Pick<
    SourceRecord,
    "sourceKind" | "sourceType" | "containerTitle" | "publisher" | "doi" | "url"
  >,
): SourceKind {
  if (source.sourceKind && (SOURCE_KINDS as readonly string[]).includes(source.sourceKind)) {
    return source.sourceKind;
  }

  const text = `${source.containerTitle ?? ""} ${source.publisher ?? ""} ${source.url ?? ""}`.toLowerCase();
  if (/dataset|data set|資料集/.test(text)) return "dataset";
  if (/book|isbn|monograph|chapter|出版社|書籍|專書/.test(text)) return "book";
  if (/conference|proceedings|symposium|會議|研討會/.test(text)) return "conference";
  if (/journal|期刊|transactions|letters|review/.test(text)) return "journal";
  if (source.doi && source.sourceType !== "Semantic Scholar") return "journal";
  if (source.url && !source.doi) return "web";
  return "unknown";
}

export function sourceQualityAssessment(
  source: Pick<
    SourceRecord,
  | "title"
  | "authors"
  | "year"
  | "abstract"
  | "snippet"
  | "language"
  | "abstractMissing"
  | "doi"
    | "containerTitle"
    | "publisher"
    | "citationCount"
  | "isOpenAccess"
  | "sourceKind"
  | "sourceType"
    | "url"
  >,
): { sourceQualityScore: number; scoreReasons: string[]; sourceKind: SourceKind } {
  const reasons: string[] = [];
  let score = 0;
  const sourceKind = sourceKindFromRecord(source);

  if (source.doi) {
    score += 20;
    reasons.push("has DOI");
  }
  if (source.title?.trim()) {
    score += 10;
    reasons.push("has title");
  }
  if (source.authors.length > 0) {
    score += 10;
    reasons.push("has authors");
  }
  if (source.year) {
    score += 10;
    reasons.push("has year");
  }
  if (source.containerTitle?.trim() || source.publisher?.trim()) {
    score += 10;
    reasons.push("has venue");
  }
  if (source.abstract?.trim()) {
    score += 15;
    reasons.push("has abstract");
  }
  if (typeof source.citationCount === "number" && source.citationCount > 0) {
    score += Math.min(15, Math.log10(source.citationCount + 1) * 5);
    reasons.push("citation count available");
  }
  if (source.isOpenAccess) {
    score += 5;
    reasons.push("open access");
  }
  if (sourceKind === "journal" || sourceKind === "conference") {
    score += 5;
    reasons.push("journal/conference source");
  }
  if (
    source.sourceType === "Official Source" ||
    source.sourceType === "Institutional Source"
  ) {
    score = Math.max(score, 70);
    reasons.push("official/institutional source");
  }
  if (source.sourceType === "Authoritative Media") {
    score = Math.max(score, 55);
    reasons.push("authoritative media source");
  }

  return {
    sourceQualityScore: Math.min(100, Math.round(score)),
    scoreReasons: reasons,
    sourceKind,
  };
}

function mergeOptionalStringLists(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
): string[] | null {
  const merged = uniqueStrings([...(existing ?? []), ...(incoming ?? [])]);
  return merged.length ? merged : null;
}

function mergeOptionalScore(
  existing: number | null | undefined,
  incoming: number | null | undefined,
): number | null {
  if (typeof existing === "number" && typeof incoming === "number") {
    return Math.max(existing, incoming);
  }
  return existing ?? incoming ?? null;
}

function metadataFields(source: Pick<
  SourceRecord,
  | "provider"
  | "queryUsed"
  | "retrievedAt"
  | "dedupeKey"
  | "sourceKind"
  | "citationCount"
  | "isOpenAccess"
  | "accessLevel"
  | "fullTextUrl"
  | "readableUrl"
  | "extractionStatus"
  | "extractionMethod"
  | "extractionMode"
  | "pageCount"
  | "extractedPageCount"
  | "isScanned"
  | "failureReason"
  | "userFacingMessage"
  | "canUseForClaims"
  | "canUseForReport"
  | "toolVersions"
  | "processingStartedAt"
  | "processingEndedAt"
  | "qualityFlags"
  | "fullTextCharCount"
  | "extractedAbstract"
  | "extractedSections"
  | "extractedChunks"
  | "extractionWarnings"
  | "contentHash"
  | "sourceUseLevel"
  | "isPeerReviewed"
  | "sourceQualityScore"
  | "scoreReasons"
  | "relevanceLevel"
  | "relevanceScore"
  | "relevanceReasons"
  | "matchedCoreConcepts"
  | "missingCoreConcepts"
  | "matchedFacets"
  | "missingRequiredFacets"
  | "evidenceGrounding"
  | "claimExtractionStatus"
  | "claimExtractionMode"
  | "claimCount"
  | "acceptedClaimCount"
  | "acceptedEvidenceCardCount"
  | "claimExtractionWarnings"
  | "sourceRelevanceReasonZhTw"
  | "llmSummaryZhTw"
  | "readableSummaryZhTW"
  | "summarySourceType"
  | "summaryConfidence"
  | "relevanceReasonZhTW"
  | "summaryWarnings"
  | "originalAbstract"
  | "originalSnippet"
  | "extractedText"
  | "llmSummaryStatus"
  | "summaryStructuredStatus"
  | "summaryProvider"
  | "summaryModel"
  | "summaryStatus"
  | "summaryFallbackUsed"
  | "summaryReason"
  | "summaryMessage"
  | "sourceCategory"
  | "usableSections"
  | "confidence"
  | "reviewNotes"
  | "shouldShowInMainList"
  | "shouldRecommendAccept"
  | "workflowId"
  | "topic"
  | "normalizedTopic"
  | "topicHash"
  | "queryPlanHash"
  | "authorityScore"
  | "summaryUsabilityScore"
  | "metadataCompletenessScore"
  | "recencyScore"
  | "languageFitScore"
  | "finalScore"
  | "classification"
  | "rejectReason"
  | "matchedTerms"
  | "driftTerms"
  | "topicRelevance"
  | "evidenceQuality"
  | "metadataCompleteness"
  | "abstractQuality"
  | "sourceTrust"
  | "isMetadataOnly"
  | "isPrimaryEvidence"
  | "rejectionReason"
  | "recommendation"
  | "recommendationBucket"
  | "sourceRole"
  | "retrievalMode"
  | "institutionType"
  | "evidencePoints"
  | "providerHealthSnapshot"
  | "acceptedByUser"
  | "userDecision"
  | "acceptedAs"
  | "lowConfidence"
  | "needsReview"
  | "sourceLinkInfo"
  | "sourceValidation"
  | "readableExtraction"
  | "sourceFacts"
  | "researchRelevanceScore"
  | "sourceSummary"
>): Partial<SourceRecord> {
  return {
    ...(source.sourceLinkInfo != null ? { sourceLinkInfo: source.sourceLinkInfo } : {}),
    ...(source.sourceValidation != null ? { sourceValidation: source.sourceValidation } : {}),
    ...(source.readableExtraction != null ? { readableExtraction: source.readableExtraction } : {}),
    ...(source.sourceFacts != null ? { sourceFacts: source.sourceFacts } : {}),
    ...(source.researchRelevanceScore != null ? { researchRelevanceScore: source.researchRelevanceScore } : {}),
    ...(source.sourceSummary != null ? { sourceSummary: source.sourceSummary } : {}),
    ...(source.provider != null ? { provider: source.provider } : {}),
    ...(source.queryUsed != null ? { queryUsed: source.queryUsed } : {}),
    ...(source.retrievedAt != null ? { retrievedAt: source.retrievedAt } : {}),
    ...(source.dedupeKey != null ? { dedupeKey: source.dedupeKey } : {}),
    ...(source.sourceKind != null ? { sourceKind: source.sourceKind } : {}),
    ...(source.citationCount != null ? { citationCount: source.citationCount } : {}),
    ...(source.isOpenAccess != null ? { isOpenAccess: source.isOpenAccess } : {}),
    ...(source.accessLevel != null ? { accessLevel: source.accessLevel } : {}),
    ...(source.fullTextUrl != null ? { fullTextUrl: source.fullTextUrl } : {}),
    ...(source.readableUrl != null ? { readableUrl: source.readableUrl } : {}),
    ...(source.extractionStatus != null ? { extractionStatus: source.extractionStatus } : {}),
    ...(source.extractionMethod != null ? { extractionMethod: source.extractionMethod } : {}),
    ...(source.extractionMode != null ? { extractionMode: source.extractionMode } : {}),
    ...(source.pageCount != null ? { pageCount: source.pageCount } : {}),
    ...(source.extractedPageCount != null
      ? { extractedPageCount: source.extractedPageCount }
      : {}),
    ...(source.isScanned != null ? { isScanned: source.isScanned } : {}),
    ...(source.failureReason != null ? { failureReason: source.failureReason } : {}),
    ...(source.userFacingMessage != null
      ? { userFacingMessage: source.userFacingMessage }
      : {}),
    ...(source.canUseForClaims != null ? { canUseForClaims: source.canUseForClaims } : {}),
    ...(source.canUseForReport != null ? { canUseForReport: source.canUseForReport } : {}),
    ...(source.toolVersions != null ? { toolVersions: source.toolVersions } : {}),
    ...(source.processingStartedAt != null
      ? { processingStartedAt: source.processingStartedAt }
      : {}),
    ...(source.processingEndedAt != null
      ? { processingEndedAt: source.processingEndedAt }
      : {}),
    ...(source.qualityFlags != null ? { qualityFlags: source.qualityFlags } : {}),
    ...(source.fullTextCharCount != null
      ? { fullTextCharCount: source.fullTextCharCount }
      : {}),
    ...(source.extractedAbstract != null ? { extractedAbstract: source.extractedAbstract } : {}),
    ...(source.extractedSections != null ? { extractedSections: source.extractedSections } : {}),
    ...(source.extractedChunks != null ? { extractedChunks: source.extractedChunks } : {}),
    ...(source.extractionWarnings != null
      ? { extractionWarnings: source.extractionWarnings }
      : {}),
    ...(source.contentHash != null ? { contentHash: source.contentHash } : {}),
    ...(source.sourceUseLevel != null ? { sourceUseLevel: source.sourceUseLevel } : {}),
    ...(source.isPeerReviewed != null ? { isPeerReviewed: source.isPeerReviewed } : {}),
    ...(source.sourceQualityScore != null
      ? { sourceQualityScore: source.sourceQualityScore }
      : {}),
    ...(source.scoreReasons != null ? { scoreReasons: source.scoreReasons } : {}),
    ...(source.relevanceLevel != null ? { relevanceLevel: source.relevanceLevel } : {}),
    ...(source.relevanceScore != null ? { relevanceScore: source.relevanceScore } : {}),
    ...(source.relevanceReasons != null ? { relevanceReasons: source.relevanceReasons } : {}),
    ...(source.matchedCoreConcepts != null ? { matchedCoreConcepts: source.matchedCoreConcepts } : {}),
    ...(source.missingCoreConcepts != null ? { missingCoreConcepts: source.missingCoreConcepts } : {}),
    ...(source.matchedFacets != null ? { matchedFacets: source.matchedFacets } : {}),
    ...(source.missingRequiredFacets != null
      ? { missingRequiredFacets: source.missingRequiredFacets }
      : {}),
    ...(source.evidenceGrounding != null ? { evidenceGrounding: source.evidenceGrounding } : {}),
    ...(source.claimExtractionStatus != null
      ? { claimExtractionStatus: source.claimExtractionStatus }
      : {}),
    ...(source.claimExtractionMode != null
      ? { claimExtractionMode: source.claimExtractionMode }
      : {}),
    ...(source.claimCount != null ? { claimCount: source.claimCount } : {}),
    ...(source.acceptedClaimCount != null
      ? { acceptedClaimCount: source.acceptedClaimCount }
      : {}),
    ...(source.acceptedEvidenceCardCount != null
      ? { acceptedEvidenceCardCount: source.acceptedEvidenceCardCount }
      : {}),
    ...(source.claimExtractionWarnings != null
      ? { claimExtractionWarnings: source.claimExtractionWarnings }
      : {}),
    ...(source.sourceRelevanceReasonZhTw != null
      ? { sourceRelevanceReasonZhTw: source.sourceRelevanceReasonZhTw }
      : {}),
    ...(source.llmSummaryZhTw != null ? { llmSummaryZhTw: source.llmSummaryZhTw } : {}),
    ...(source.readableSummaryZhTW != null
      ? { readableSummaryZhTW: source.readableSummaryZhTW }
      : {}),
    ...(source.summarySourceType != null ? { summarySourceType: source.summarySourceType } : {}),
    ...(source.summaryConfidence != null ? { summaryConfidence: source.summaryConfidence } : {}),
    ...(source.relevanceReasonZhTW != null ? { relevanceReasonZhTW: source.relevanceReasonZhTW } : {}),
    ...(source.summaryWarnings != null ? { summaryWarnings: source.summaryWarnings } : {}),
    ...(source.originalAbstract != null ? { originalAbstract: source.originalAbstract } : {}),
    ...(source.originalSnippet != null ? { originalSnippet: source.originalSnippet } : {}),
    ...(source.extractedText != null ? { extractedText: source.extractedText } : {}),
    ...(source.llmSummaryStatus != null ? { llmSummaryStatus: source.llmSummaryStatus } : {}),
    ...(source.summaryStructuredStatus != null
      ? { summaryStructuredStatus: source.summaryStructuredStatus }
      : {}),
    ...(source.summaryProvider != null ? { summaryProvider: source.summaryProvider } : {}),
    ...(source.summaryModel != null ? { summaryModel: source.summaryModel } : {}),
    ...(source.summaryStatus != null ? { summaryStatus: source.summaryStatus } : {}),
    ...(source.summaryFallbackUsed != null
      ? { summaryFallbackUsed: source.summaryFallbackUsed }
      : {}),
    ...(source.summaryReason != null ? { summaryReason: source.summaryReason } : {}),
    ...(source.summaryMessage != null ? { summaryMessage: source.summaryMessage } : {}),
    ...(source.sourceCategory != null ? { sourceCategory: source.sourceCategory } : {}),
    ...(source.usableSections != null ? { usableSections: source.usableSections } : {}),
    ...(source.confidence != null ? { confidence: source.confidence } : {}),
    ...(source.reviewNotes != null ? { reviewNotes: source.reviewNotes } : {}),
    ...(source.shouldShowInMainList != null
      ? { shouldShowInMainList: source.shouldShowInMainList }
      : {}),
    ...(source.shouldRecommendAccept != null
      ? { shouldRecommendAccept: source.shouldRecommendAccept }
      : {}),
    ...(source.workflowId != null ? { workflowId: source.workflowId } : {}),
    ...(source.topic != null ? { topic: source.topic } : {}),
    ...(source.normalizedTopic != null ? { normalizedTopic: source.normalizedTopic } : {}),
    ...(source.topicHash != null ? { topicHash: source.topicHash } : {}),
    ...(source.queryPlanHash != null ? { queryPlanHash: source.queryPlanHash } : {}),
    ...(source.authorityScore != null ? { authorityScore: source.authorityScore } : {}),
    ...(source.summaryUsabilityScore != null
      ? { summaryUsabilityScore: source.summaryUsabilityScore }
      : {}),
    ...(source.metadataCompletenessScore != null
      ? { metadataCompletenessScore: source.metadataCompletenessScore }
      : {}),
    ...(source.recencyScore != null ? { recencyScore: source.recencyScore } : {}),
    ...(source.languageFitScore != null ? { languageFitScore: source.languageFitScore } : {}),
    ...(source.finalScore != null ? { finalScore: source.finalScore } : {}),
    ...(source.classification != null ? { classification: source.classification } : {}),
    ...(source.rejectReason != null ? { rejectReason: source.rejectReason } : {}),
    ...(source.matchedTerms != null ? { matchedTerms: source.matchedTerms } : {}),
    ...(source.driftTerms != null ? { driftTerms: source.driftTerms } : {}),
    ...(source.topicRelevance != null ? { topicRelevance: source.topicRelevance } : {}),
    ...(source.evidenceQuality != null ? { evidenceQuality: source.evidenceQuality } : {}),
    ...(source.metadataCompleteness != null
      ? { metadataCompleteness: source.metadataCompleteness }
      : {}),
    ...(source.abstractQuality != null ? { abstractQuality: source.abstractQuality } : {}),
    ...(source.sourceTrust != null ? { sourceTrust: source.sourceTrust } : {}),
    ...(source.isMetadataOnly != null ? { isMetadataOnly: source.isMetadataOnly } : {}),
    ...(source.isPrimaryEvidence != null
      ? { isPrimaryEvidence: source.isPrimaryEvidence }
      : {}),
    ...(source.rejectionReason != null ? { rejectionReason: source.rejectionReason } : {}),
    ...(source.recommendation != null ? { recommendation: source.recommendation } : {}),
    ...(source.recommendationBucket != null
      ? { recommendationBucket: source.recommendationBucket }
      : {}),
    ...(source.sourceRole != null ? { sourceRole: source.sourceRole } : {}),
    ...(source.retrievalMode != null ? { retrievalMode: source.retrievalMode } : {}),
    ...(source.institutionType != null ? { institutionType: source.institutionType } : {}),
    ...(source.evidencePoints != null ? { evidencePoints: source.evidencePoints } : {}),
    ...(source.providerHealthSnapshot != null
      ? { providerHealthSnapshot: source.providerHealthSnapshot }
      : {}),
    ...(source.acceptedByUser != null ? { acceptedByUser: source.acceptedByUser } : {}),
    ...(source.userDecision != null ? { userDecision: source.userDecision } : {}),
    ...(source.acceptedAs != null ? { acceptedAs: source.acceptedAs } : {}),
    ...(source.lowConfidence != null ? { lowConfidence: source.lowConfidence } : {}),
    ...(source.needsReview != null ? { needsReview: source.needsReview } : {}),
  };
}

function mergeSourceRecords(existing: SourceRecord, incoming: SourceRecord): SourceRecord {
  const existingAbstractLength = textLength(existing.abstract);
  const incomingAbstractLength = textLength(incoming.abstract);
  const abstract =
    incomingAbstractLength > existingAbstractLength
      ? incoming.abstract
      : existing.abstract;
  const sourceType = existing.sourceType;

  const metadata = metadataFields({
    relevanceLevel: existing.relevanceLevel ?? incoming.relevanceLevel ?? null,
    relevanceScore: mergeOptionalScore(existing.relevanceScore, incoming.relevanceScore),
    relevanceReasons: mergeOptionalStringLists(
      existing.relevanceReasons,
      incoming.relevanceReasons,
    ),
    matchedCoreConcepts: mergeOptionalStringLists(
      existing.matchedCoreConcepts,
      incoming.matchedCoreConcepts,
    ),
    missingCoreConcepts: mergeOptionalStringLists(
      existing.missingCoreConcepts,
      incoming.missingCoreConcepts,
    ),
    matchedFacets: mergeOptionalStringLists(existing.matchedFacets, incoming.matchedFacets),
    missingRequiredFacets: mergeOptionalStringLists(
      existing.missingRequiredFacets,
      incoming.missingRequiredFacets,
    ),
    evidenceGrounding: existing.evidenceGrounding ?? incoming.evidenceGrounding ?? null,
    claimExtractionStatus:
      existing.claimExtractionStatus ?? incoming.claimExtractionStatus ?? null,
    claimExtractionMode: existing.claimExtractionMode ?? incoming.claimExtractionMode ?? null,
    claimCount: mergeOptionalScore(existing.claimCount, incoming.claimCount),
    acceptedClaimCount: mergeOptionalScore(
      existing.acceptedClaimCount,
      incoming.acceptedClaimCount,
    ),
    acceptedEvidenceCardCount: mergeOptionalScore(
      existing.acceptedEvidenceCardCount,
      incoming.acceptedEvidenceCardCount,
    ),
    claimExtractionWarnings: mergeOptionalStringLists(
      existing.claimExtractionWarnings,
      incoming.claimExtractionWarnings,
    ),
    sourceRelevanceReasonZhTw:
      existing.sourceRelevanceReasonZhTw ?? incoming.sourceRelevanceReasonZhTw ?? null,
    llmSummaryZhTw: existing.llmSummaryZhTw ?? incoming.llmSummaryZhTw ?? null,
    readableSummaryZhTW:
      existing.readableSummaryZhTW ?? incoming.readableSummaryZhTW ?? null,
    summarySourceType: existing.summarySourceType ?? incoming.summarySourceType ?? null,
    summaryConfidence: existing.summaryConfidence ?? incoming.summaryConfidence ?? null,
    relevanceReasonZhTW:
      existing.relevanceReasonZhTW ?? incoming.relevanceReasonZhTW ?? null,
    summaryWarnings: mergeOptionalStringLists(
      existing.summaryWarnings,
      incoming.summaryWarnings,
    ),
    originalAbstract: existing.originalAbstract ?? incoming.originalAbstract ?? null,
    originalSnippet: existing.originalSnippet ?? incoming.originalSnippet ?? null,
    extractedText: existing.extractedText ?? incoming.extractedText ?? null,
    llmSummaryStatus: existing.llmSummaryStatus ?? incoming.llmSummaryStatus ?? null,
    summaryStructuredStatus:
      existing.summaryStructuredStatus ?? incoming.summaryStructuredStatus ?? null,
    summaryProvider: existing.summaryProvider ?? incoming.summaryProvider ?? null,
    summaryModel: existing.summaryModel ?? incoming.summaryModel ?? null,
    summaryStatus: existing.summaryStatus ?? incoming.summaryStatus ?? null,
    summaryFallbackUsed:
      typeof existing.summaryFallbackUsed === "boolean" || typeof incoming.summaryFallbackUsed === "boolean"
        ? Boolean(existing.summaryFallbackUsed ?? incoming.summaryFallbackUsed)
        : null,
    summaryReason: existing.summaryReason ?? incoming.summaryReason ?? null,
    summaryMessage: existing.summaryMessage ?? incoming.summaryMessage ?? null,
    sourceCategory: existing.sourceCategory ?? incoming.sourceCategory ?? null,
    usableSections: mergeOptionalStringLists(existing.usableSections, incoming.usableSections),
    confidence: existing.confidence ?? incoming.confidence ?? null,
    reviewNotes: existing.reviewNotes ?? incoming.reviewNotes ?? null,
    shouldShowInMainList:
      existing.shouldShowInMainList ?? incoming.shouldShowInMainList ?? null,
    shouldRecommendAccept:
      existing.shouldRecommendAccept ?? incoming.shouldRecommendAccept ?? null,
    workflowId: existing.workflowId ?? incoming.workflowId ?? null,
    topic: existing.topic ?? incoming.topic ?? null,
    normalizedTopic: existing.normalizedTopic ?? incoming.normalizedTopic ?? null,
    topicHash: existing.topicHash ?? incoming.topicHash ?? null,
    queryPlanHash: existing.queryPlanHash ?? incoming.queryPlanHash ?? null,
    authorityScore: mergeOptionalScore(existing.authorityScore, incoming.authorityScore),
    summaryUsabilityScore: mergeOptionalScore(
      existing.summaryUsabilityScore,
      incoming.summaryUsabilityScore,
    ),
    metadataCompletenessScore: mergeOptionalScore(
      existing.metadataCompletenessScore,
      incoming.metadataCompletenessScore,
    ),
    recencyScore: mergeOptionalScore(existing.recencyScore, incoming.recencyScore),
    languageFitScore: mergeOptionalScore(existing.languageFitScore, incoming.languageFitScore),
    finalScore: mergeOptionalScore(existing.finalScore, incoming.finalScore),
    classification: existing.classification ?? incoming.classification ?? null,
    rejectReason: existing.rejectReason ?? incoming.rejectReason ?? null,
    matchedTerms: mergeOptionalStringLists(existing.matchedTerms, incoming.matchedTerms),
    driftTerms: mergeOptionalStringLists(existing.driftTerms, incoming.driftTerms),
    topicRelevance: mergeOptionalScore(existing.topicRelevance, incoming.topicRelevance),
    evidenceQuality: mergeOptionalScore(existing.evidenceQuality, incoming.evidenceQuality),
    metadataCompleteness: mergeOptionalScore(
      existing.metadataCompleteness,
      incoming.metadataCompleteness,
    ),
    abstractQuality: mergeOptionalScore(existing.abstractQuality, incoming.abstractQuality),
    sourceTrust: mergeOptionalScore(existing.sourceTrust, incoming.sourceTrust),
    isMetadataOnly:
      typeof existing.isMetadataOnly === "boolean" || typeof incoming.isMetadataOnly === "boolean"
        ? Boolean(existing.isMetadataOnly || incoming.isMetadataOnly)
        : null,
    isPrimaryEvidence:
      typeof existing.isPrimaryEvidence === "boolean" || typeof incoming.isPrimaryEvidence === "boolean"
        ? Boolean(existing.isPrimaryEvidence || incoming.isPrimaryEvidence)
        : null,
    rejectionReason: existing.rejectionReason ?? incoming.rejectionReason ?? null,
    recommendation: existing.recommendation ?? incoming.recommendation ?? null,
    recommendationBucket:
      existing.recommendationBucket ?? incoming.recommendationBucket ?? null,
    sourceRole: existing.sourceRole ?? incoming.sourceRole ?? null,
    retrievalMode: existing.retrievalMode ?? incoming.retrievalMode ?? null,
    institutionType: existing.institutionType ?? incoming.institutionType ?? null,
    evidencePoints: mergeOptionalStringLists(existing.evidencePoints, incoming.evidencePoints),
    providerHealthSnapshot:
      existing.providerHealthSnapshot ?? incoming.providerHealthSnapshot ?? null,
    acceptedByUser:
      typeof existing.acceptedByUser === "boolean" || typeof incoming.acceptedByUser === "boolean"
        ? Boolean(existing.acceptedByUser ?? incoming.acceptedByUser)
        : null,
    userDecision: existing.userDecision ?? incoming.userDecision ?? null,
    acceptedAs: existing.acceptedAs ?? incoming.acceptedAs ?? null,
    sourceLinkInfo: normalizeSourceLinkInfo({
      ...existing,
      sourceLinkInfo: {
        ...normalizeSourceLinkInfo(existing),
        ...normalizeSourceLinkInfo(incoming),
        originalUrl:
          normalizeSourceLinkInfo(existing).originalUrl ??
          normalizeSourceLinkInfo(incoming).originalUrl,
        linkWarnings: uniqueStrings([
          ...normalizeSourceLinkInfo(existing).linkWarnings,
          ...normalizeSourceLinkInfo(incoming).linkWarnings,
        ]),
      },
    }),
    provider: uniqueStrings([
      existing.provider ?? existing.sourceType,
      incoming.provider ?? incoming.sourceType,
    ]).join(", "),
    queryUsed: existing.queryUsed ?? incoming.queryUsed ?? null,
    retrievedAt: existing.retrievedAt ?? incoming.retrievedAt ?? null,
    dedupeKey: existing.dedupeKey ?? incoming.dedupeKey ?? null,
    sourceKind: existing.sourceKind ?? incoming.sourceKind ?? null,
    citationCount: mergeOptionalScore(existing.citationCount, incoming.citationCount),
    isOpenAccess:
      typeof existing.isOpenAccess === "boolean" || typeof incoming.isOpenAccess === "boolean"
        ? Boolean(existing.isOpenAccess || incoming.isOpenAccess)
        : null,
    accessLevel: existing.accessLevel ?? incoming.accessLevel ?? null,
    fullTextUrl: existing.fullTextUrl ?? incoming.fullTextUrl ?? null,
    readableUrl: existing.readableUrl ?? incoming.readableUrl ?? null,
    extractionStatus: existing.extractionStatus ?? incoming.extractionStatus ?? null,
    extractionMethod: existing.extractionMethod ?? incoming.extractionMethod ?? null,
    extractionMode: existing.extractionMode ?? incoming.extractionMode ?? null,
    pageCount: mergeOptionalScore(existing.pageCount, incoming.pageCount),
    extractedPageCount: mergeOptionalScore(
      existing.extractedPageCount,
      incoming.extractedPageCount,
    ),
    isScanned:
      typeof existing.isScanned === "boolean" || typeof incoming.isScanned === "boolean"
        ? Boolean(existing.isScanned || incoming.isScanned)
        : null,
    failureReason: existing.failureReason ?? incoming.failureReason ?? null,
    userFacingMessage: existing.userFacingMessage ?? incoming.userFacingMessage ?? null,
    canUseForClaims:
      typeof existing.canUseForClaims === "boolean" ||
      typeof incoming.canUseForClaims === "boolean"
        ? Boolean(existing.canUseForClaims || incoming.canUseForClaims)
        : null,
    canUseForReport:
      typeof existing.canUseForReport === "boolean" ||
      typeof incoming.canUseForReport === "boolean"
        ? Boolean(existing.canUseForReport || incoming.canUseForReport)
        : null,
    toolVersions: existing.toolVersions ?? incoming.toolVersions ?? null,
    processingStartedAt:
      existing.processingStartedAt ?? incoming.processingStartedAt ?? null,
    processingEndedAt: existing.processingEndedAt ?? incoming.processingEndedAt ?? null,
    qualityFlags: mergeOptionalStringLists(existing.qualityFlags, incoming.qualityFlags),
    fullTextCharCount: mergeOptionalScore(
      existing.fullTextCharCount,
      incoming.fullTextCharCount,
    ),
    extractedAbstract: existing.extractedAbstract ?? incoming.extractedAbstract ?? null,
    extractedSections:
      existing.extractedSections ?? incoming.extractedSections ?? null,
    extractedChunks: existing.extractedChunks ?? incoming.extractedChunks ?? null,
    extractionWarnings: mergeOptionalStringLists(
      existing.extractionWarnings,
      incoming.extractionWarnings,
    ),
    contentHash: existing.contentHash ?? incoming.contentHash ?? null,
    sourceUseLevel: existing.sourceUseLevel ?? incoming.sourceUseLevel ?? null,
    isPeerReviewed:
      typeof existing.isPeerReviewed === "boolean" || typeof incoming.isPeerReviewed === "boolean"
        ? Boolean(existing.isPeerReviewed || incoming.isPeerReviewed)
        : null,
    sourceQualityScore: mergeOptionalScore(existing.sourceQualityScore, incoming.sourceQualityScore),
    scoreReasons: mergeOptionalStringLists(existing.scoreReasons, incoming.scoreReasons),
  });

  const doi = existing.doi ?? incoming.doi;
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const mergedBase: SourceRecord = {
    ...existing,
    title:
      existing.title.length >= incoming.title.length
        ? existing.title
        : incoming.title,
    authors: uniqueStrings([...existing.authors, ...incoming.authors]),
    year: existing.year ?? incoming.year,
    abstract,
    doi,
    url: doiUrl ?? existing.url ?? incoming.url,
    sourceLinkInfo: normalizeSourceLinkInfo({
      ...existing,
      doi,
      url: doiUrl ?? existing.url ?? incoming.url,
      sourceLinkInfo: metadata.sourceLinkInfo ?? null,
    }),
    sourceType,
    reviewState:
      existing.reviewState === "accepted" || incoming.reviewState === "accepted"
        ? "accepted"
        : existing.reviewState === "rejected" || incoming.reviewState === "rejected"
          ? "rejected"
          : "pending",
    publisher: existing.publisher ?? incoming.publisher,
    containerTitle: existing.containerTitle ?? incoming.containerTitle,
    accessedAt: existing.accessedAt ?? incoming.accessedAt,
    ...metadata,
  };
  const quality = sourceQualityAssessment(mergedBase);
  const mergedProviders =
    existing.sourceType === incoming.sourceType
      ? []
      : [`merged providers: ${uniqueStrings([existing.sourceType, incoming.sourceType]).join(", ")}`];

  return {
    ...mergedBase,
    dedupeKey: sourceRecordKey(mergedBase),
    sourceKind: quality.sourceKind,
    sourceQualityScore: quality.sourceQualityScore,
    scoreReasons: uniqueStrings([
      ...quality.scoreReasons,
      ...(metadata.scoreReasons ?? []),
      ...mergedProviders,
    ]),
  };
}

export function normalizeSourceRecord(source: SourceRecordInput): SourceRecord {
  const title = cleanText(source.title) ?? "";
  const authors = (source.authors ?? [])
    .map((author) => cleanText(author))
    .filter((author): author is string => Boolean(author));
  const doi = normalizeDoiValue(source.doi);
  const url = cleanText(source.url);
  const sourceLinkInfo = normalizeSourceLinkInfo({
    sourceLinkInfo: source.sourceLinkInfo ?? null,
    sourceType: source.sourceType,
    doi,
    url,
    abstract: cleanText(source.abstract),
    abstractMissing: source.abstractMissing,
  });
  const record: SourceRecord = {
    id: cleanText(source.id) ?? "",
    title,
    authors,
    year: normalizeYearValue(source.year),
    abstract: cleanText(source.abstract),
    snippet: cleanText(source.snippet),
    language: cleanText(source.language),
    abstractMissing:
      typeof source.abstractMissing === "boolean"
        ? source.abstractMissing
        : !cleanText(source.abstract),
    doi,
    url,
    sourceLinkInfo,
    sourceType: source.sourceType,
    reviewState: source.reviewState ?? "pending",
    publisher: cleanText(source.publisher),
    containerTitle: cleanText(source.containerTitle),
    accessedAt: cleanText(source.accessedAt),
  };
  const citationCount = nonNegativeInteger(source.citationCount);
  const isOpenAccess =
    typeof source.isOpenAccess === "boolean" ? source.isOpenAccess : null;
  const isPeerReviewed =
    typeof source.isPeerReviewed === "boolean" ? source.isPeerReviewed : null;
  const sourceKind = normalizeSourceKind(source.sourceKind);
  const dedupeKey = cleanText(source.dedupeKey) ?? sourceRecordKey(record);
  const quality = sourceQualityAssessment({
    ...record,
    citationCount,
    isOpenAccess,
    sourceKind,
  });
  const metadata = metadataFields({
    provider: cleanText(source.provider),
    queryUsed: cleanText(source.queryUsed),
    retrievedAt: cleanText(source.retrievedAt),
    dedupeKey,
    sourceKind: quality.sourceKind,
    citationCount,
    isOpenAccess,
    accessLevel: normalizeContentAccessLevel(source.accessLevel),
    fullTextUrl: cleanText(source.fullTextUrl),
    readableUrl: cleanText(source.readableUrl),
    extractionStatus: normalizeExtractionStatus(source.extractionStatus),
    extractionMethod: normalizeExtractionMethod(source.extractionMethod),
    extractionMode: normalizeExtractionMode(source.extractionMode),
    pageCount: nonNegativeInteger(source.pageCount),
    extractedPageCount: nonNegativeInteger(source.extractedPageCount),
    isScanned: typeof source.isScanned === "boolean" ? source.isScanned : null,
    failureReason: cleanText(source.failureReason),
    userFacingMessage: cleanText(source.userFacingMessage),
    canUseForClaims:
      typeof source.canUseForClaims === "boolean" ? source.canUseForClaims : null,
    canUseForReport:
      typeof source.canUseForReport === "boolean" ? source.canUseForReport : null,
    toolVersions: source.toolVersions ?? null,
    processingStartedAt: cleanText(source.processingStartedAt),
    processingEndedAt: cleanText(source.processingEndedAt),
    qualityFlags: cleanStringList(source.qualityFlags),
    fullTextCharCount: nonNegativeInteger(source.fullTextCharCount),
    extractedAbstract: cleanText(source.extractedAbstract),
    extractedSections: normalizeExtractedSections(source.extractedSections),
    extractedChunks: normalizeExtractedChunks(source.extractedChunks),
    extractionWarnings: cleanStringList(source.extractionWarnings),
    contentHash: cleanText(source.contentHash),
    sourceUseLevel: normalizeSourceUseLevel(source.sourceUseLevel),
    isPeerReviewed,
    sourceQualityScore: finiteScore(source.sourceQualityScore) ?? quality.sourceQualityScore,
    scoreReasons: uniqueStrings([
      ...quality.scoreReasons,
      ...(cleanStringList(source.scoreReasons) ?? []),
    ]),
    relevanceLevel: normalizeRelevanceLevel(source.relevanceLevel),
    relevanceScore:
      typeof source.relevanceScore === "number" && Number.isFinite(source.relevanceScore)
        ? source.relevanceScore
        : null,
    relevanceReasons: cleanStringList(source.relevanceReasons),
    matchedCoreConcepts: cleanStringList(source.matchedCoreConcepts),
    missingCoreConcepts: cleanStringList(source.missingCoreConcepts),
    matchedFacets: cleanStringList(source.matchedFacets),
    missingRequiredFacets: cleanStringList(source.missingRequiredFacets),
    evidenceGrounding: normalizeEvidenceGrounding(source.evidenceGrounding),
    claimExtractionStatus: normalizeClaimExtractionStatus(source.claimExtractionStatus),
    claimExtractionMode: normalizeClaimExtractionMode(source.claimExtractionMode),
    claimCount: nonNegativeInteger(source.claimCount),
    acceptedClaimCount: nonNegativeInteger(source.acceptedClaimCount),
    acceptedEvidenceCardCount: nonNegativeInteger(source.acceptedEvidenceCardCount),
    claimExtractionWarnings: cleanStringList(source.claimExtractionWarnings),
    sourceRelevanceReasonZhTw: cleanText(source.sourceRelevanceReasonZhTw),
    llmSummaryZhTw: cleanText(source.llmSummaryZhTw),
    readableSummaryZhTW: cleanText(source.readableSummaryZhTW),
    summarySourceType: normalizeSummarySourceType(source.summarySourceType),
    summaryConfidence: normalizeSummaryConfidence(source.summaryConfidence),
    relevanceReasonZhTW: cleanText(source.relevanceReasonZhTW),
    summaryWarnings: cleanStringList(source.summaryWarnings),
    originalAbstract: cleanText(source.originalAbstract),
    originalSnippet: cleanText(source.originalSnippet),
    extractedText: cleanText(source.extractedText),
    llmSummaryStatus: normalizeSummaryStatus(source.llmSummaryStatus),
    summaryStructuredStatus: normalizeStructuredStatus(source.summaryStructuredStatus),
    summaryProvider: cleanText(source.summaryProvider),
    summaryModel: cleanText(source.summaryModel),
    summaryStatus: normalizeSummaryStatus(source.summaryStatus),
    summaryFallbackUsed:
      typeof source.summaryFallbackUsed === "boolean" ? source.summaryFallbackUsed : null,
    summaryReason: cleanText(source.summaryReason),
    summaryMessage: cleanText(source.summaryMessage),
    sourceCategory: cleanText(source.sourceCategory),
    usableSections: cleanStringList(source.usableSections),
    confidence: cleanText(source.confidence),
    reviewNotes: cleanText(source.reviewNotes),
    shouldShowInMainList:
      typeof source.shouldShowInMainList === "boolean"
        ? source.shouldShowInMainList
        : null,
    shouldRecommendAccept:
      typeof source.shouldRecommendAccept === "boolean"
        ? source.shouldRecommendAccept
        : null,
    workflowId: cleanText(source.workflowId),
    topic: cleanText(source.topic),
    normalizedTopic: cleanText(source.normalizedTopic),
    topicHash: cleanText(source.topicHash),
    queryPlanHash: cleanText(source.queryPlanHash),
    authorityScore: finiteScore(source.authorityScore),
    summaryUsabilityScore: finiteScore(source.summaryUsabilityScore),
    metadataCompletenessScore: finiteScore(source.metadataCompletenessScore),
    recencyScore: finiteScore(source.recencyScore),
    languageFitScore: finiteScore(source.languageFitScore),
    finalScore: finiteScore(source.finalScore),
    classification: normalizeClassification(source.classification),
    rejectReason: cleanText(source.rejectReason),
    matchedTerms: cleanStringList(source.matchedTerms),
    driftTerms: cleanStringList(source.driftTerms),
    topicRelevance: finiteScore(source.topicRelevance),
    evidenceQuality: finiteScore(source.evidenceQuality),
    metadataCompleteness: finiteScore(source.metadataCompleteness),
    abstractQuality: finiteScore(source.abstractQuality),
    sourceTrust: finiteScore(source.sourceTrust),
    isMetadataOnly:
      typeof source.isMetadataOnly === "boolean" ? source.isMetadataOnly : null,
    isPrimaryEvidence:
      typeof source.isPrimaryEvidence === "boolean" ? source.isPrimaryEvidence : null,
    rejectionReason: cleanText(source.rejectionReason),
    recommendation: cleanText(source.recommendation),
    recommendationBucket: normalizeRecommendationBucket(source.recommendationBucket),
    sourceRole: normalizeSourceRole(source.sourceRole),
    retrievalMode: normalizeRetrievalMode(source.retrievalMode),
    institutionType: cleanText(source.institutionType),
    evidencePoints: cleanStringList(source.evidencePoints),
    providerHealthSnapshot: source.providerHealthSnapshot ?? null,
    acceptedByUser:
      typeof source.acceptedByUser === "boolean" ? source.acceptedByUser : null,
    userDecision: normalizeUserDecision(source.userDecision),
    acceptedAs: cleanText(source.acceptedAs),
    lowConfidence:
      typeof source.lowConfidence === "boolean" ? source.lowConfidence : null,
    needsReview:
      typeof source.needsReview === "boolean" ? source.needsReview : null,
    sourceValidation: source.sourceValidation ?? null,
    readableExtraction: source.readableExtraction ?? null,
    sourceFacts: Array.isArray(source.sourceFacts) ? source.sourceFacts : null,
    researchRelevanceScore: source.researchRelevanceScore ?? null,
    sourceSummary: source.sourceSummary ?? null,
  });

  return {
    ...record,
    ...metadata,
    id: record.id || dedupeKey,
  };
}

export function dedupeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  const seen = new Map<string, SourceRecord>();
  const deduped: SourceRecord[] = [];

  for (const source of sources) {
    const normalized = normalizeSourceRecord(source);
    const key = sourceRecordKey(normalized);
    const existing =
      seen.get(key) ??
      deduped.find((candidate) => {
        if (normalized.doi || candidate.doi) return false;
        if (!normalized.title || !candidate.title) return false;
        const sameYear =
          normalized.year != null &&
          candidate.year != null &&
          normalized.year === candidate.year;
        const sameFirstAuthor =
          normalizedAuthorKey(normalized.authors[0]) !== "" &&
          normalizedAuthorKey(normalized.authors[0]) ===
            normalizedAuthorKey(candidate.authors[0]);
        const similarity = titleSimilarity(normalized.title, candidate.title);
        return similarity >= 0.94 || (similarity >= 0.86 && (sameYear || sameFirstAuthor));
      });
    if (existing) {
      const merged = { ...mergeSourceRecords(existing, normalized), id: existing.id || key };
      seen.set(sourceRecordKey(merged), merged);
      seen.set(sourceRecordKey(existing), merged);
      seen.set(key, merged);
      const index = deduped.findIndex((item) => item.id === existing.id);
      if (index >= 0) deduped[index] = merged;
      continue;
    }
    const inserted = { ...normalized, id: normalized.id || key };
    seen.set(key, inserted);
    deduped.push(inserted);
  }

  return deduped;
}

export function acceptedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "accepted");
}

export function rejectedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "rejected");
}
