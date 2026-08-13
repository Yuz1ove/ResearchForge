import type { SourceRecord } from "./sourceRecords.ts";

export interface ReaderReferenceLike {
  citationId: string;
  sourceId: string;
  text: string;
  doi?: string | null;
  url?: string | null;
}

export interface ReaderCitationEntry {
  citationId: string;
  sourceId: string;
  source: SourceRecord | null;
  label: string;
  referenceText: string;
  anchorId: string;
  externalHref: string | null;
  printHref: string;
}

const NUMERIC_OR_INTERNAL_CITATION_PATTERN =
  /(?:\{\{?\s*[sS\uff33\uff53]\s*[0-9\uff10-\uff19]+\s*\}?\}|[\[\uff3b]\s*(?:(?:[sS\uff33\uff53]\s*)|(?:source\s*:\s*))?[0-9\uff10-\uff19]+\s*[\]\uff3d]|\b(?:source|citation)[_-][0-9]+\b)/giu;

function compact(value: string | null | undefined): string {
  // NFC preserves reader-facing full-width Chinese punctuation. NFKC would
  // silently turn ，；（） into ASCII punctuation during citation cleanup.
  return value?.normalize("NFC").replace(/\s+/gu, " ").trim() ?? "";
}

function asciiDigits(value: string): string {
  return value.replace(/[\uff10-\uff19]/gu, (digit) =>
    String(digit.charCodeAt(0) - 0xff10),
  );
}

/** Removes legacy reader-visible citation tokens while preserving punctuation. */
export function stripReaderCitationTokens(value: string | null | undefined): string {
  return compact(value)
    .replace(NUMERIC_OR_INTERNAL_CITATION_PATTERN, "")
    .replace(/[ \t]+([\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001\uff1a:])/gu, "$1")
    .replace(/([\u3001\uff0c,\uff1b;\uff1a:])(?:\s*[\u3001\uff0c,\uff1b;\uff1a:])+/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function authorFamilyName(author: string): string {
  const normalized = compact(author);
  if (!normalized) return "作者未提供";
  const beforeComma = normalized.split(",")[0]?.trim();
  if (beforeComma && beforeComma !== normalized) return beforeComma;
  if (/^[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af·・]+$/u.test(normalized)) {
    return normalized;
  }
  const words = normalized.split(/\s+/u).filter(Boolean);
  // Provider records commonly use the compact bibliographic form
  // "Family Initials" (for example, "Zhang J" or "Roba ZR"). Treating the
  // final initials as a family name produces labels such as "J et al." and
  // breaks APA alphabetization. Preserve ordinary "Given Family" names by
  // applying this branch only when the final token is clearly initials.
  const trailingInitials = words.at(-1)?.replace(/[.\-]/gu, "") ?? "";
  if (words.length >= 2 && /^[A-Z]{1,4}$/u.test(trailingInitials)) {
    return words.slice(0, -1).join(" ");
  }
  return words.at(-1)?.replace(/[.,]+$/gu, "") || normalized;
}

export function baseAuthorYearCitationLabel(source: SourceRecord | null): string {
  if (!source) return "來源待確認，n.d.";
  const authors = source.authors.map(authorFamilyName).filter(Boolean);
  const authorLabel = authors.length === 0
    ? authorFamilyName(source.publisher || "作者未提供")
    : authors.length === 1
      ? authors[0]!
      : authors.length === 2
        ? `${authors[0]} & ${authors[1]}`
        : `${authors[0]} et al.`;
  return `${authorLabel}, ${source.year ?? "n.d."}`;
}

export function citationAnchorId(citationId: string): string {
  const safe = asciiDigits(citationId)
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return `rf-reference-${safe || "source"}`;
}

function doiHref(doi: string | null | undefined): string | null {
  const normalized = compact(doi)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .toLocaleLowerCase();
  return normalized ? `https://doi.org/${normalized}` : null;
}

function safeWebHref(value: string | null | undefined): string | null {
  const normalized = compact(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function sourceSortKey(source: SourceRecord | null, reference: ReaderReferenceLike): string {
  const firstAuthor = source?.authors[0]
    ? authorFamilyName(source.authors[0])
    : authorFamilyName(source?.publisher || source?.title || reference.text);
  const year = source?.year == null ? "9999" : String(source.year).padStart(4, "0");
  const title = compact(source?.title || reference.text);
  return `${firstAuthor}\u0000${year}\u0000${title}`.toLocaleLowerCase();
}

/**
 * Creates the single reader-facing citation/reference registry used by Preview,
 * Markdown, DOCX, and PDF. Duplicate author-year labels receive APA-style a/b
 * suffixes in title order, while internal citation ids remain unchanged.
 */
export function buildReaderCitationEntries(
  references: readonly ReaderReferenceLike[],
  sources: readonly SourceRecord[],
): ReaderCitationEntry[] {
  const sourceById = new Map(sources.map((source) => [source.id, source] as const));
  const ordered = references
    .map((reference) => ({ reference, source: sourceById.get(reference.sourceId) ?? null }))
    .sort((left, right) =>
      sourceSortKey(left.source, left.reference).localeCompare(
        sourceSortKey(right.source, right.reference),
        "en",
      ),
    );
  const duplicateCounts = new Map<string, number>();
  for (const item of ordered) {
    const base = baseAuthorYearCitationLabel(item.source);
    duplicateCounts.set(base, (duplicateCounts.get(base) ?? 0) + 1);
  }
  const duplicateIndexes = new Map<string, number>();

  return ordered.map(({ reference, source }) => {
    const base = baseAuthorYearCitationLabel(source);
    const duplicateIndex = duplicateIndexes.get(base) ?? 0;
    duplicateIndexes.set(base, duplicateIndex + 1);
    const duplicateSuffix = (duplicateCounts.get(base) ?? 0) > 1
      ? String.fromCharCode(97 + duplicateIndex)
      : "";
    const label = duplicateSuffix
      ? base.replace(/(\d{4}|n\.d\.)$/u, `$1${duplicateSuffix}`)
      : base;
    const anchorId = citationAnchorId(reference.citationId);
    const externalHref = doiHref(reference.doi ?? source?.doi) ||
      safeWebHref(source?.url || reference.url) ||
      null;
    const printExternalHref = doiHref(reference.doi ?? source?.doi);
    return {
      citationId: reference.citationId,
      sourceId: reference.sourceId,
      source,
      label,
      referenceText: reference.text.replace(/^\s*\[\d+\]\s*/u, "").trim(),
      anchorId,
      externalHref,
      // Static PDF HTML only permits DOI links or same-document anchors.
      printHref: printExternalHref || `#${anchorId}`,
    };
  });
}

export function readerCitationClusterLabel(
  entries: readonly Pick<ReaderCitationEntry, "label">[],
): string {
  return entries.length > 0
    ? `（${entries.map((entry) => entry.label).join("；")}）`
    : "";
}
