export const SOURCE_PROVIDERS = ["Crossref", "OpenAlex", "Semantic Scholar", "Web"] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export const SOURCE_REVIEW_STATES = ["pending", "accepted", "rejected"] as const;
export type SourceReviewState = (typeof SOURCE_REVIEW_STATES)[number];

export interface SourceRecord {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
  sourceType: SourceProvider;
  reviewState: SourceReviewState;
  publisher: string | null;
  containerTitle: string | null;
  accessedAt: string | null;
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
  return text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim() || null;
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

export function sourceRecordKey(source: Pick<SourceRecord, "title" | "doi" | "url" | "sourceType">): string {
  const doi = normalizeDoiValue(source.doi);
  if (doi) return `doi:${doi.toLowerCase()}`;

  const url = cleanText(source.url);
  if (url) return `url:${url.toLowerCase()}`;

  const title = normalizeWhitespace(source.title).toLowerCase();
  if (title) return `title:${source.sourceType}:${title}`;

  return `source:${source.sourceType}:${stableHash(JSON.stringify(source))}`;
}

export function normalizeSourceRecord(source: SourceRecordInput): SourceRecord {
  const title = cleanText(source.title) ?? "";
  const authors = (source.authors ?? [])
    .map((author) => cleanText(author))
    .filter((author): author is string => Boolean(author));
  const doi = normalizeDoiValue(source.doi);
  const url = cleanText(source.url);
  const record: SourceRecord = {
    id: cleanText(source.id) ?? "",
    title,
    authors,
    year: normalizeYearValue(source.year),
    abstract: cleanText(source.abstract),
    doi,
    url,
    sourceType: source.sourceType,
    reviewState: source.reviewState ?? "pending",
    publisher: cleanText(source.publisher),
    containerTitle: cleanText(source.containerTitle),
    accessedAt: cleanText(source.accessedAt),
  };

  return {
    ...record,
    id: record.id || sourceRecordKey(record),
  };
}

function preferLongerText(primary: string | null | undefined, secondary: string | null | undefined): string | null {
  const first = cleanText(primary);
  const second = cleanText(secondary);
  if (!first) return second;
  if (!second) return first;
  return second.length > first.length ? second : first;
}

function preferAuthors(primary: string[], secondary: string[]): string[] {
  if (primary.length === 0) return secondary;
  if (secondary.length > primary.length) return secondary;
  return primary;
}

function preferUrl(primary: string | null | undefined, secondary: string | null | undefined): string | null {
  const first = cleanText(primary);
  const second = cleanText(secondary);
  if (!first) return second;
  if (!second) return first;
  return first;
}

function mergeSourceRecords(existing: SourceRecord, incoming: SourceRecord): SourceRecord {
  return normalizeSourceRecord({
    ...existing,
    title: cleanText(existing.title) || cleanText(incoming.title) || "",
    authors: preferAuthors(existing.authors, incoming.authors),
    year: existing.year ?? incoming.year,
    abstract: preferLongerText(existing.abstract, incoming.abstract),
    doi: existing.doi ?? incoming.doi,
    url: preferUrl(existing.url, incoming.url),
    sourceType: existing.sourceType,
    reviewState: existing.reviewState,
    publisher: cleanText(existing.publisher) ?? cleanText(incoming.publisher),
    containerTitle: cleanText(existing.containerTitle) ?? cleanText(incoming.containerTitle),
    accessedAt: cleanText(existing.accessedAt) ?? cleanText(incoming.accessedAt),
    id: cleanText(existing.id) || cleanText(incoming.id) || "",
  });
}

export function dedupeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  const deduped: SourceRecord[] = [];
  const indexByKey = new Map<string, number>();

  for (const source of sources) {
    const normalized = normalizeSourceRecord(source);
    const key = sourceRecordKey(normalized);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, deduped.length);
      deduped.push({ ...normalized, id: normalized.id || key });
      continue;
    }

    deduped[existingIndex] = mergeSourceRecords(deduped[existingIndex], normalized);
  }

  return deduped;
}

export function acceptedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "accepted");
}

export function rejectedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "rejected");
}
