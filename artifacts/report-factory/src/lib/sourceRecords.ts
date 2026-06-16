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

export const SOURCE_CONFIDENCE_OPTIONS = ["高", "中", "低"] as const;
export type SourceConfidence = (typeof SOURCE_CONFIDENCE_OPTIONS)[number];

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
  authorityLevel?: "high" | "medium" | "check" | "insufficient_summary" | "low_relevance" | null;
  authorityScore?: number | null;
  authorityLabel?: string | null;
  sourceLanguage?: "zh-TW" | "zh-CN" | "en" | "other" | "unknown" | null;
  sourceLanguageLabel?: string | null;
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

function normalizeSourceLanguage(value: unknown): SourceRecordMetadata["sourceLanguage"] {
  if (value === "zh-TW" || value === "zh-CN" || value === "en" || value === "other" || value === "unknown") return value;
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
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim() || null;
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

export function sourceRecordKey(source: Pick<SourceRecord, "title" | "doi" | "url" | "sourceType">): string {
  const doi = normalizeDoi(source.doi);
  if (doi) return `doi:${doi.toLowerCase()}`;

  const url = cleanText(source.url);
  if (url) return `url:${url.toLowerCase()}`;

  const title = normalizeTitle(source.title).toLowerCase();
  if (title) return `title:${source.sourceType}:${title}`;

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
  return /crossref|semantic scholar|openalex|pubmed|doi|scopus|web of science/.test(text)
    || /\.gov(\.|$)|\.edu(\.|$)|gov\.tw$|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$/.test(host);
}

export function classifySourceRecord(source: SourceRecord): SourceCategory {
  const explicitCategory = normalizeSourceCategory(source.sourceCategory);
  if (explicitCategory) return explicitCategory;

  const text = textForClassification(source);
  const host = sourceHost(source);

  if (
    /\.gov(\.|$)|gov\.tw$|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$|unesco\.org$/.test(host)
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

  if (source.url || /news|article|blog|web|新聞|報導|網頁|網站/.test(text)) {
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
    title: cleanText(source.title) ?? "",
    authors: source.authors.map((author) => cleanText(author)).filter((author): author is string => Boolean(author)),
    year: typeof source.year === "number" && Number.isFinite(source.year) ? Math.trunc(source.year) : null,
    abstract: cleanText(source.abstract),
    doi: normalizeDoi(source.doi),
    url: cleanText(source.url),
    sourceType: source.sourceType,
    reviewState: sourceReviewState(source),
    publisher: cleanText(source.publisher),
    containerTitle: cleanText(source.containerTitle),
    accessedAt: cleanText(source.accessedAt),
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
    authorityLevel: normalizeAuthorityLevel(source.authorityLevel),
    authorityScore: typeof source.authorityScore === "number" && Number.isFinite(source.authorityScore)
      ? source.authorityScore
      : null,
    authorityLabel: cleanText(source.authorityLabel),
    sourceLanguage: normalizeSourceLanguage(source.sourceLanguage),
    sourceLanguageLabel: cleanText(source.sourceLanguageLabel),
  };
  return {
    ...normalized,
    id: normalized.id || sourceRecordKey(normalized),
    sourceCategory: normalized.sourceCategory ?? classifySourceRecord(normalized),
    confidence: normalized.confidence ?? calculateSourceConfidence(normalized),
  };
}

export function dedupeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  const seen = new Set<string>();
  const deduped: SourceRecord[] = [];

  for (const source of sources) {
    const normalized = normalizeSourceForReview(source);
    const key = sourceRecordKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...normalized, id: normalized.id || key });
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
    return normalizeSourceForReview({ ...source, id: key, reviewState });
  });
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
