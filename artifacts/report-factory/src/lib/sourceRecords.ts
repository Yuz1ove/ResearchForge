import type { SourceRecord, SourceReviewState } from "@workspace/api-client-react";

export type { SourceRecord, SourceReviewState };

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

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

export function normalizeSourceForReview(source: SourceRecord): SourceRecord {
  const normalized: SourceRecord = {
    id: cleanText(source.id) ?? "",
    title: cleanText(source.title) ?? "",
    authors: source.authors.map((author) => cleanText(author)).filter((author): author is string => Boolean(author)),
    year: typeof source.year === "number" && Number.isFinite(source.year) ? Math.trunc(source.year) : null,
    abstract: cleanText(source.abstract),
    doi: normalizeDoi(source.doi),
    url: cleanText(source.url),
    sourceType: source.sourceType,
    reviewState: source.reviewState ?? "pending",
    publisher: cleanText(source.publisher),
    containerTitle: cleanText(source.containerTitle),
    accessedAt: cleanText(source.accessedAt),
  };
  return {
    ...normalized,
    id: normalized.id || sourceRecordKey(normalized),
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
  return sources.filter((source) => source.reviewState === "accepted");
}

export function rejectedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "rejected");
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
