/**
 * AI assistance disclosure: Portions of this source-extraction module were
 * drafted or refactored with Replit Agent and OpenAI Codex. See
 * /AI_ASSISTANCE.md.
 */
import { createHash } from "node:crypto";
import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import { parseWithPaddleOcr } from "../parsers/paddleOcrWorker";
import { parseWithPdfminer } from "../parsers/pdfminerWorker";
import { parseWithTesseractOcr } from "../parsers/tesseractWorker";
import { nowIso } from "../workflow/workflowIds";

export type ContentAccessLevel =
  | "full_text"
  | "abstract_only"
  | "metadata_only"
  | "blocked_or_paywalled"
  | "failed_extraction";

export type ContentExtractionStatus =
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

export type ContentExtractionMethod =
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

export type ContentExtractionMode =
  | "pdf_text"
  | "grobid"
  | "ocr"
  | "html"
  | "abstract"
  | "metadata_only"
  | "failed";

export interface ExtractedSection {
  heading: string;
  text: string;
  page?: number;
  confidence: number;
}

export interface ExtractedChunk {
  chunk_id: string;
  text: string;
  source_location: string;
  section_heading?: string;
  page?: number;
  char_start?: number;
  char_end?: number;
}

export interface ContentExtractionResult {
  source_id: string;
  access_level: ContentAccessLevel;
  extraction_status: ContentExtractionStatus;
  extraction_method: ContentExtractionMethod;
  extraction_mode: ContentExtractionMode;
  text: string;
  extracted_title?: string;
  extracted_abstract?: string;
  extracted_sections: ExtractedSection[];
  extracted_chunks: ExtractedChunk[];
  chunks: ExtractedChunk[];
  page_count?: number;
  extracted_page_count?: number;
  is_scanned?: boolean;
  language?: string;
  failure_reason?: string;
  user_facing_message?: string;
  can_use_for_claims: boolean;
  can_use_for_report: boolean;
  tool_versions: Record<string, string>;
  processing_started_at: string;
  processing_ended_at: string;
  quality_flags: string[];
  full_text_char_count: number;
  extraction_warnings: string[];
  fetched_at: string;
  content_hash: string;
  provenance: {
    url_used?: string;
    doi_used?: string;
    provider?: string;
    tool_version: string;
  };
}

export interface ExtractableSource {
  sourceId?: string;
  id?: string;
  workflowId?: string;
  title: string;
  url?: string | null;
  doi?: string | null;
  abstract?: string | null;
  abstractOriginal?: string | null;
  provider?: string | null;
  fullTextUrl?: string | null;
  isOpenAccess?: boolean | null;
  sourceType?: string | null;
  language?: string | null;
}

export interface SourceContentExtractorOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxPdfBytes?: number;
  maxChunks?: number;
  pdfParser?: (
    sourceId: string,
    workflowId: string,
    pdfUrl: string,
  ) => Promise<ParsedDocument | null>;
  ocrParser?: (
    sourceId: string,
    workflowId: string,
    pdfUrl: string,
  ) => Promise<ParsedDocument | null>;
}

interface FetchBytesResult {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  text?: string;
  bytes?: Uint8Array;
  warnings: string[];
}

const TOOL_VERSION = "source-content-extractor-v1";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_MAX_PDF_BYTES = 8_000_000;
const DEFAULT_MAX_CHUNKS = 24;
const USER_AGENT = "ReportFactoryAI/1.0 ResearchForgeContentExtractor";

const OA_HOST_PATTERNS = [
  /(^|\.)arxiv\.org$/i,
  /(^|\.)biorxiv\.org$/i,
  /(^|\.)medrxiv\.org$/i,
  /(^|\.)ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)pmc\.ncbi\.nlm\.nih\.gov$/i,
  /(^|\.)europepmc\.org$/i,
  /(^|\.)core\.ac\.uk$/i,
  /(^|\.)doaj\.org$/i,
  /(^|\.)plos\.org$/i,
  /(^|\.)frontiersin\.org$/i,
  /(^|\.)mdpi\.com$/i,
  /(^|\.)scielo\./i,
  /(^|\.)springeropen\.com$/i,
  /(^|\.)hindawi\.com$/i,
  /(^|\.)figshare\.com$/i,
  /(^|\.)zenodo\.org$/i,
  /(^|\.)osf\.io$/i,
  /(^|\.)jstage\.jst\.go\.jp$/i,
  /(^|\.)edu$/i,
  /(^|\.)gov$/i,
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sourceId(source: ExtractableSource): string {
  return cleanText(source.sourceId) || cleanText(source.id) || hashText(source.title).slice(0, 16);
}

function sourceAbstract(source: ExtractableSource): string {
  return cleanText(source.abstractOriginal) || cleanText(source.abstract);
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function resultHash(input: {
  sourceId: string;
  method: string;
  text: string;
  warnings: string[];
}): string {
  return hashText(
    [input.sourceId, input.method, input.text, ...input.warnings].join("\n---\n"),
  ).slice(0, 32);
}

function extractionModeForMethod(method: ContentExtractionMethod): ContentExtractionMode {
  if (method === "grobid") return "grobid";
  if (method === "ocr") return "ocr";
  if (method === "pdf_parser" || method === "pdf_text") return "pdf_text";
  if (method === "html_readability" || method === "html") return "html";
  if (method === "abstract_only" || method === "abstract") return "abstract";
  if (method === "metadata_only") return "metadata_only";
  return "failed";
}

function fullTextStatusForMethod(method: ContentExtractionMethod): ContentExtractionStatus {
  if (method === "grobid") return "grobid_extracted";
  if (method === "ocr") return "ocr_extracted";
  return "text_extracted";
}

function canUseForClaims(input: {
  accessLevel: ContentAccessLevel;
  chunks: ExtractedChunk[];
  status: ContentExtractionStatus;
}): boolean {
  if (input.status === "extraction_failed" || input.status === "extraction_unavailable_no_parser") {
    return false;
  }
  if (input.accessLevel === "full_text") return input.chunks.length > 0;
  if (input.accessLevel === "abstract_only") return input.chunks.length > 0;
  return false;
}

function userFacingMessage(input: {
  accessLevel: ContentAccessLevel;
  status: ContentExtractionStatus;
  warnings: string[];
  isPdf?: boolean;
}): string | undefined {
  if (input.status === "extraction_skipped_license") {
    return "此來源可能受登入、付費或抓取政策限制，系統已略過全文抽取。";
  }
  if (input.status === "extraction_skipped_no_full_text") {
    return "未取得可讀全文連結，系統只能使用摘要或 metadata。";
  }
  if (input.status === "metadata_only") {
    return "此來源目前只有 metadata，不能產生核心學術主張。";
  }
  if (input.status === "extraction_unavailable_no_parser") {
    return input.isPdf
      ? "此 PDF 無法抽出可用文字；GROBID/OCR 未啟用或不可用，因此只能使用摘要或 metadata。"
      : "目前沒有可用 parser 能抽出全文，因此只能使用摘要或 metadata。";
  }
  if (input.status === "extraction_failed") {
    return input.isPdf
      ? "此 PDF 全文抽取失敗；若未啟用 GROBID/OCR，系統只能使用摘要或 metadata。"
      : "全文抽取失敗，系統只能使用摘要或 metadata。";
  }
  if (input.accessLevel === "abstract_only") {
    return "僅取得摘要，報告不得宣稱已讀全文。";
  }
  return undefined;
}

function pageStats(parsed: ParsedDocument): {
  pageCount?: number;
  extractedPageCount?: number;
} {
  const pages = new Set<number>();
  for (const section of parsed.sections ?? []) {
    if (typeof section.pageStart === "number") pages.add(section.pageStart);
    if (typeof section.pageEnd === "number") pages.add(section.pageEnd);
  }
  for (const table of parsed.tables ?? []) {
    if (typeof table.page === "number") pages.add(table.page);
  }
  const numericPages = [...pages].filter((page) => Number.isFinite(page) && page > 0);
  if (numericPages.length === 0) return {};
  return {
    pageCount: Math.max(...numericPages),
    extractedPageCount: numericPages.length,
  };
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = cleanText(value);
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function hostForUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function urlLooksLikeLoginOrPaywall(url: string): boolean {
  return /\/(login|signin|sign-in|subscribe|subscription|purchase|checkout|cart|paywall|shibboleth|saml)\b/i.test(
    url,
  );
}

function urlLooksLikePdf(url: string): boolean {
  return /\.pdf(?:[?#].*)?$/i.test(url) || /\/pdf(?:[/?#]|$)/i.test(url);
}

function hostLooksOpenReadable(host: string): boolean {
  return OA_HOST_PATTERNS.some((pattern) => pattern.test(host));
}

function sourceLooksPublicBackground(source: ExtractableSource): boolean {
  return /official|education|web|government|institution|authoritative/i.test(
    `${source.sourceType ?? ""} ${source.provider ?? ""}`,
  );
}

function chooseReadableUrl(source: ExtractableSource): string | null {
  return normalizeUrl(source.fullTextUrl) ?? normalizeUrl(source.url);
}

function policySkipReason(source: ExtractableSource, url: string): string | null {
  if (urlLooksLikeLoginOrPaywall(url)) return "PAYWALL_OR_LOGIN_REQUIRED";
  const host = hostForUrl(url);
  if (!host) return "UNSUPPORTED_CONTENT_TYPE";
  if (/^doi\.org$/i.test(host) && !source.isOpenAccess) return "ROBOTS_OR_POLICY_SKIPPED";
  if (source.isOpenAccess || hostLooksOpenReadable(host) || sourceLooksPublicBackground(source)) {
    return null;
  }
  return "ROBOTS_OR_POLICY_SKIPPED";
}

function emptyResult(
  source: ExtractableSource,
  input: {
    accessLevel: ContentAccessLevel;
    status: ContentExtractionStatus;
    method: ContentExtractionMethod;
    warnings: string[];
    urlUsed?: string;
    isPdf?: boolean;
    failureReason?: string;
  },
): ContentExtractionResult {
  const id = sourceId(source);
  const abstract = sourceAbstract(source);
  const textForHash = [source.title, abstract, input.urlUsed ?? ""].join("\n");
  const startedAt = nowIso();
  const chunks = abstract
    ? [
        {
          chunk_id: `${id}:abstract:1`,
          text: abstract,
          source_location: "abstract",
          section_heading: "Abstract",
          char_start: 0,
          char_end: abstract.length,
        },
      ]
    : [];
  const status =
    input.status === "skipped" && input.accessLevel === "metadata_only"
      ? "metadata_only"
      : input.status;
  const canUseClaims = canUseForClaims({
    accessLevel: input.accessLevel,
    chunks,
    status,
  });
  const warnings = dedupeStrings(input.warnings);
  const message = userFacingMessage({
    accessLevel: input.accessLevel,
    status,
    warnings,
    isPdf: input.isPdf,
  });
  return {
    source_id: id,
    access_level: input.accessLevel,
    extraction_status: status,
    extraction_method: input.method,
    extraction_mode: extractionModeForMethod(input.method),
    text: abstract,
    extracted_title: cleanText(source.title) || undefined,
    extracted_abstract: abstract || undefined,
    extracted_sections: [],
    extracted_chunks: chunks,
    chunks,
    extracted_page_count: 0,
    ...(input.isPdf ? { is_scanned: false } : {}),
    ...(cleanText(source.language) ? { language: cleanText(source.language) } : {}),
    ...(input.failureReason ?? warnings[0]
      ? { failure_reason: input.failureReason ?? warnings[0] }
      : {}),
    ...(message ? { user_facing_message: message } : {}),
    can_use_for_claims: canUseClaims,
    can_use_for_report: canUseClaims,
    tool_versions: {
      source_content_extractor: TOOL_VERSION,
    },
    processing_started_at: startedAt,
    processing_ended_at: nowIso(),
    quality_flags: warnings,
    full_text_char_count: 0,
    extraction_warnings: warnings,
    fetched_at: nowIso(),
    content_hash: resultHash({
      sourceId: id,
      method: input.method,
      text: textForHash,
      warnings: input.warnings,
    }),
    provenance: {
      ...(input.urlUsed ? { url_used: input.urlUsed } : {}),
      ...(cleanText(source.doi) ? { doi_used: cleanText(source.doi) } : {}),
      ...(cleanText(source.provider) ? { provider: cleanText(source.provider) } : {}),
      tool_version: TOOL_VERSION,
    },
  };
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) {
      const code = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (lower.startsWith("#")) {
      const code = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return named[lower] ?? match;
  });
}

function stripTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function cleanHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas|iframe|form|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ")
    .replace(/\s+/g, " ");
}

function extractMetaContent(html: string, names: string[]): string {
  for (const name of names) {
    const pattern = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    );
    const match = html.match(pattern);
    if (match?.[1]) return stripTags(match[1]);
  }
  return "";
}

function chunkText(input: {
  sourceId: string;
  text: string;
  heading?: string;
  location: string;
  maxChunks: number;
}): ExtractedChunk[] {
  const text = cleanText(input.text);
  if (!text) return [];
  const chunks: ExtractedChunk[] = [];
  const maxLength = 900;
  const minLength = 240;
  let start = 0;
  let chunkIndex = 1;

  while (start < text.length && chunks.length < input.maxChunks) {
    let end = Math.min(text.length, start + maxLength);
    if (end < text.length) {
      const punctuation = text.slice(start, end).search(/[。！？.!?]\s+\S*$/u);
      if (punctuation > minLength) end = start + punctuation + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length >= 80 || text.length < 160) {
      chunks.push({
        chunk_id: `${input.sourceId}:chunk:${chunkIndex}`,
        text: chunk,
        source_location: input.location,
        ...(input.heading ? { section_heading: input.heading } : {}),
        char_start: start,
        char_end: end,
      });
      chunkIndex += 1;
    }
    start = end;
  }
  return chunks;
}

function extractionFromHtml(
  source: ExtractableSource,
  html: string,
  urlUsed: string,
  maxChunks: number,
): ContentExtractionResult {
  const id = sourceId(source);
  const cleaned = cleanHtml(html);
  const title =
    stripTags(cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    stripTags(cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
    cleanText(source.title);
  const metaAbstract =
    extractMetaContent(cleaned, [
      "citation_abstract",
      "dc.description",
      "description",
      "og:description",
    ]) || sourceAbstract(source);
  const sections: ExtractedSection[] = [];
  const chunks: ExtractedChunk[] = [];
  let currentHeading = "Readable body";
  const currentParagraphs: string[] = [];
  const flush = () => {
    const text = cleanText(currentParagraphs.join(" "));
    currentParagraphs.length = 0;
    if (!text || text.length < 120) return;
    sections.push({
      heading: currentHeading,
      text,
      confidence: currentHeading === "Readable body" ? 0.55 : 0.7,
    });
    chunks.push(
      ...chunkText({
        sourceId: id,
        text,
        heading: currentHeading,
        location: currentHeading,
        maxChunks: Math.max(1, maxChunks - chunks.length),
      }),
    );
  };

  const tokenPattern = /<(h[1-3]|p|caption|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(cleaned)) && chunks.length < maxChunks) {
    const tag = match[1]?.toLowerCase();
    const text = stripTags(match[2] ?? "");
    if (!text || /cookie|privacy|subscribe|newsletter|sign in|login/i.test(text)) continue;
    if (tag?.startsWith("h")) {
      flush();
      currentHeading = text.slice(0, 120);
      continue;
    }
    if (text.length >= 40) currentParagraphs.push(text);
  }
  flush();

  const fullText = cleanText(sections.map((section) => section.text).join("\n\n"));
  if (!fullText) {
    return emptyResult(source, {
      accessLevel: metaAbstract ? "abstract_only" : "failed_extraction",
      status: metaAbstract ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: metaAbstract ? "abstract_only" : "html_readability",
      warnings: ["NO_READABLE_BODY"],
      urlUsed,
      failureReason: "NO_READABLE_BODY",
    });
  }
  const chunksForResult = chunks.slice(0, maxChunks);
  const startedAt = nowIso();
  return {
    source_id: id,
    access_level: "full_text",
    extraction_status: "text_extracted",
    extraction_method: "html_readability",
    extraction_mode: "html",
    text: fullText,
    extracted_title: title || undefined,
    extracted_abstract: metaAbstract || undefined,
    extracted_sections: sections,
    extracted_chunks: chunksForResult,
    chunks: chunksForResult,
    ...(cleanText(source.language) ? { language: cleanText(source.language) } : {}),
    can_use_for_claims: chunksForResult.length > 0,
    can_use_for_report: chunksForResult.length > 0,
    tool_versions: {
      source_content_extractor: TOOL_VERSION,
    },
    processing_started_at: startedAt,
    processing_ended_at: nowIso(),
    quality_flags: [],
    full_text_char_count: fullText.length,
    extraction_warnings: [],
    fetched_at: nowIso(),
    content_hash: resultHash({
      sourceId: id,
      method: "html_readability",
      text: fullText,
      warnings: [],
    }),
    provenance: {
      url_used: urlUsed,
      ...(cleanText(source.doi) ? { doi_used: cleanText(source.doi) } : {}),
      ...(cleanText(source.provider) ? { provider: cleanText(source.provider) } : {}),
      tool_version: TOOL_VERSION,
    },
  };
}

async function fetchBytes(
  url: string,
  options: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    maxBytes: number;
  },
): Promise<FetchBytesResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await options.fetchImpl(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/pdf;q=0.9,*/*;q=0.5",
        "User-Agent": USER_AGENT,
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        url: response.url || url,
        contentType,
        warnings: ["PAYWALL_OR_LOGIN_REQUIRED"],
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        url: response.url || url,
        contentType,
        warnings: [`FETCH_HTTP_${response.status}`],
      };
    }
    if (contentLength > options.maxBytes) {
      return {
        ok: false,
        status: response.status,
        url: response.url || url,
        contentType,
        warnings: ["MAX_BYTES_EXCEEDED"],
      };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > options.maxBytes) {
        return {
          ok: false,
          status: response.status,
          url: response.url || url,
          contentType,
          warnings: ["MAX_BYTES_EXCEEDED"],
        };
      }
      const bytes = new Uint8Array(arrayBuffer);
      return {
        ok: true,
        status: response.status,
        url: response.url || url,
        contentType,
        bytes,
        text: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
        warnings: [],
      };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > options.maxBytes) {
        controller.abort();
        return {
          ok: false,
          status: response.status,
          url: response.url || url,
          contentType,
          warnings: ["MAX_BYTES_EXCEEDED"],
        };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true,
      status: response.status,
      url: response.url || url,
      contentType,
      bytes,
      text: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
      warnings: [],
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      contentType: "",
      warnings: [error instanceof Error && error.name === "AbortError" ? "FETCH_TIMEOUT" : "FETCH_FAILED"],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parsedDocumentSections(parsed: ParsedDocument, sourceIdValue: string): {
  sections: ExtractedSection[];
  chunks: ExtractedChunk[];
  fullText: string;
} {
  const parsedSections =
    parsed.sections?.map((section) => ({
      heading: cleanText(section.heading) || "Extracted text",
      text: cleanText(section.text),
      ...(typeof section.pageStart === "number" ? { page: section.pageStart } : {}),
      confidence: parsed.confidence === "high" ? 0.85 : parsed.confidence === "medium" ? 0.65 : 0.45,
    })).filter((section) => section.text.length > 0) ?? [];
  const fullText = cleanText(
    parsedSections.length > 0
      ? parsedSections.map((section) => section.text).join("\n\n")
      : parsed.fullText,
  );
  const sections = parsedSections.length > 0
    ? parsedSections
    : fullText
      ? [{ heading: "Extracted text", text: fullText, confidence: 0.55 }]
      : [];
  const chunks = sections.flatMap((section) =>
    chunkText({
      sourceId: sourceIdValue,
      text: section.text,
      heading: section.heading,
      location: section.page ? `p.${section.page}` : section.heading,
      maxChunks: DEFAULT_MAX_CHUNKS,
    }),
  );
  return { sections, chunks, fullText };
}

async function parseWithGrobidIfAvailable(input: {
  source: ExtractableSource;
  pdfUrl: string;
  pdfBytes: Uint8Array;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<ParsedDocument | null> {
  if (process.env.ENABLE_GROBID?.trim().toLowerCase() === "false") return null;
  const baseUrl = process.env.GROBID_URL?.trim();
  if (!baseUrl) return null;
  const id = sourceId(input.source);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const form = new FormData();
    const pdfBytes = new ArrayBuffer(input.pdfBytes.byteLength);
    new Uint8Array(pdfBytes).set(input.pdfBytes);
    form.set(
      "input",
      new Blob([pdfBytes], { type: "application/pdf" }),
      `${id}.pdf`,
    );
    form.set("consolidateHeader", "1");
    const response = await input.fetchImpl(
      new URL("/api/processFulltextDocument", baseUrl).toString(),
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    const tei = await response.text();
    const title = stripTags(tei.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const abstract = stripTags(tei.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i)?.[1] ?? "");
    const sections: ParsedDocument["sections"] = [];
    const divPattern = /<div[^>]*>([\s\S]*?)<\/div>/gi;
    let match: RegExpExecArray | null;
    while ((match = divPattern.exec(tei)) && sections.length < 20) {
      const block = match[1] ?? "";
      const heading = stripTags(block.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "");
      const text = stripTags(block.replace(/<head[^>]*>[\s\S]*?<\/head>/i, " "));
      if (heading && text.length > 120) sections.push({ heading, text });
    }
    const fullText = cleanText(sections.map((section) => section.text).join("\n\n"));
    if (!fullText && !abstract) return null;
    return {
      sourceId: id,
      workflowId: cleanText(input.source.workflowId) || "unknown-workflow",
      extractionMethod: "grobid",
      ...(title ? { title } : {}),
      ...(abstract ? { abstract } : {}),
      ...(sections.length ? { sections } : {}),
      ...(fullText ? { fullText } : {}),
      confidence: fullText ? "high" : "medium",
      warnings: [],
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseWithOcrIfAvailable(input: {
  source: ExtractableSource;
  pdfUrl: string;
  parser?: SourceContentExtractorOptions["ocrParser"];
}): Promise<{ parsed: ParsedDocument | null; warnings: string[] }> {
  if (process.env.ENABLE_OCR?.trim().toLowerCase() !== "true") {
    return { parsed: null, warnings: ["OCR_DISABLED"] };
  }
  const id = sourceId(input.source);
  const workflowId = cleanText(input.source.workflowId) || "unknown-workflow";
  const provider = process.env.OCR_PROVIDER?.trim().toLowerCase();
  const parser =
    input.parser ??
    (provider === "paddleocr" || provider === "paddle"
      ? parseWithPaddleOcr
      : parseWithTesseractOcr);
  try {
    const parsed = await parser(id, workflowId, input.pdfUrl);
    return {
      parsed,
      warnings: parsed ? [`OCR_PROVIDER_${provider || "tesseract"}`] : ["OCR_EMPTY_TEXT"],
    };
  } catch {
    return { parsed: null, warnings: ["OCR_FAILED"] };
  }
}

function resultFromParsedDocument(
  source: ExtractableSource,
  parsed: ParsedDocument,
  urlUsed: string,
  method: ContentExtractionMethod,
  warnings: string[] = [],
): ContentExtractionResult {
  const id = sourceId(source);
  const { sections, chunks, fullText } = parsedDocumentSections(parsed, id);
  if (!fullText.trim()) {
    const abstract = cleanText(parsed.abstract) || sourceAbstract(source);
    return emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract
        ? "extraction_skipped_no_full_text"
        : parsed.requiresOcr
          ? "extraction_unavailable_no_parser"
          : "extraction_failed",
      method: abstract ? "abstract_only" : method,
      warnings: dedupeStrings([
        ...warnings,
        parsed.requiresOcr ? "PDF_PARSE_EMPTY_TEXT" : "NO_READABLE_BODY",
      ]),
      urlUsed,
      isPdf: method === "pdf_parser" || method === "grobid" || method === "ocr",
      failureReason: parsed.requiresOcr ? "PDF_REQUIRES_OCR" : "NO_READABLE_BODY",
    });
  }
  const chunksForResult = chunks.slice(0, DEFAULT_MAX_CHUNKS);
  const pageInfo = pageStats(parsed);
  const status = fullTextStatusForMethod(method);
  const startedAt = nowIso();
  const extractionWarnings = dedupeStrings([...(parsed.warnings ?? []), ...warnings]);
  const isOcr = method === "ocr" || parsed.extractionMethod === "tesseract" || parsed.extractionMethod === "paddleocr";
  return {
    source_id: id,
    access_level: "full_text",
    extraction_status: status,
    extraction_method: method,
    extraction_mode: extractionModeForMethod(method),
    text: fullText,
    extracted_title: cleanText(parsed.title) || cleanText(source.title) || undefined,
    extracted_abstract: cleanText(parsed.abstract) || sourceAbstract(source) || undefined,
    extracted_sections: sections,
    extracted_chunks: chunksForResult,
    chunks: chunksForResult,
    ...(typeof pageInfo.pageCount === "number" ? { page_count: pageInfo.pageCount } : {}),
    ...(typeof pageInfo.extractedPageCount === "number"
      ? { extracted_page_count: pageInfo.extractedPageCount }
      : {}),
    is_scanned: Boolean(parsed.requiresOcr || isOcr),
    ...(cleanText(parsed.language) || cleanText(source.language)
      ? { language: cleanText(parsed.language) || cleanText(source.language) }
      : {}),
    can_use_for_claims: chunksForResult.length > 0,
    can_use_for_report: chunksForResult.length > 0,
    tool_versions: {
      source_content_extractor: TOOL_VERSION,
      parser: parsed.extractionMethod,
    },
    processing_started_at: startedAt,
    processing_ended_at: nowIso(),
    quality_flags: extractionWarnings,
    full_text_char_count: fullText.length,
    extraction_warnings: extractionWarnings,
    fetched_at: nowIso(),
    content_hash: resultHash({ sourceId: id, method, text: fullText, warnings }),
    provenance: {
      url_used: urlUsed,
      ...(cleanText(source.doi) ? { doi_used: cleanText(source.doi) } : {}),
      ...(cleanText(source.provider) ? { provider: cleanText(source.provider) } : {}),
      tool_version: TOOL_VERSION,
    },
  };
}

export async function extractSourceContent(
  source: ExtractableSource,
  options: SourceContentExtractorOptions = {},
): Promise<ContentExtractionResult> {
  const abstract = sourceAbstract(source);
  const url = chooseReadableUrl(source);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const id = sourceId(source);

  if (!url) {
    return emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "metadata_only",
      status: abstract ? "extraction_skipped_no_full_text" : "metadata_only",
      method: abstract ? "abstract_only" : "metadata_only",
      warnings: abstract ? ["NO_FULL_TEXT_URL"] : ["NO_READABLE_BODY"],
      failureReason: abstract ? "NO_FULL_TEXT_URL" : "METADATA_ONLY",
    });
  }

  const policyReason = policySkipReason(source, url);
  if (policyReason) {
    return emptyResult(source, {
      accessLevel:
        policyReason === "PAYWALL_OR_LOGIN_REQUIRED"
          ? "blocked_or_paywalled"
          : abstract
            ? "abstract_only"
            : "metadata_only",
      status:
        policyReason === "PAYWALL_OR_LOGIN_REQUIRED"
          ? "extraction_skipped_license"
          : abstract
            ? "extraction_skipped_no_full_text"
            : "metadata_only",
      method: abstract ? "abstract_only" : "metadata_only",
      warnings: [policyReason],
      urlUsed: url,
      failureReason: policyReason,
    });
  }

  const pdfLikely = urlLooksLikePdf(url);
  const maxBytes = pdfLikely
    ? options.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES
    : options.maxBytes ?? DEFAULT_MAX_BYTES;
  const fetched = await fetchBytes(url, { fetchImpl, timeoutMs, maxBytes });
  if (!fetched.ok) {
    return emptyResult(source, {
      accessLevel:
        fetched.warnings.includes("PAYWALL_OR_LOGIN_REQUIRED")
          ? "blocked_or_paywalled"
          : abstract
            ? "abstract_only"
            : "failed_extraction",
      status: fetched.warnings.includes("PAYWALL_OR_LOGIN_REQUIRED")
        ? "extraction_skipped_license"
        : abstract
          ? "extraction_skipped_no_full_text"
          : "extraction_failed",
      method: abstract ? "abstract_only" : pdfLikely ? "pdf_parser" : "html_readability",
      warnings: fetched.warnings,
      urlUsed: fetched.url,
      isPdf: pdfLikely,
      failureReason: fetched.warnings[0],
    });
  }

  const contentType = fetched.contentType.toLowerCase();
  const isPdf = pdfLikely || contentType.includes("application/pdf");
  if (isPdf) {
    const bytes = fetched.bytes ?? new Uint8Array();
    const grobidUnavailableWarnings = dedupeStrings([
      process.env.ENABLE_GROBID?.trim().toLowerCase() === "false" ? "GROBID_DISABLED" : "",
      !process.env.GROBID_URL?.trim() ? "GROBID_URL_MISSING" : "",
    ]);
    const grobid = bytes.length
      ? await parseWithGrobidIfAvailable({
          source,
          pdfUrl: fetched.url,
          pdfBytes: bytes,
          fetchImpl,
          timeoutMs,
        })
      : null;
    if (grobid) {
      return resultFromParsedDocument(source, grobid, fetched.url, "grobid");
    }
    const parserWarnings = [...grobidUnavailableWarnings];
    try {
      const parser = options.pdfParser ?? parseWithPdfminer;
      const parsed = await parser(
        id,
        cleanText(source.workflowId) || "unknown-workflow",
        fetched.url,
      );
      if (!parsed) {
        parserWarnings.push("PDF_PARSE_EMPTY_TEXT");
      } else {
        const parsedResult = resultFromParsedDocument(
          source,
          parsed,
          fetched.url,
          "pdf_parser",
          parserWarnings,
        );
        if (parsedResult.access_level === "full_text") return parsedResult;
        parserWarnings.push(...parsedResult.extraction_warnings);
      }
    } catch {
      parserWarnings.push("PDF_PARSE_FAILED");
    }
    const ocr = await parseWithOcrIfAvailable({
      source,
      pdfUrl: fetched.url,
      parser: options.ocrParser,
    });
    if (ocr.parsed) {
      const ocrResult = resultFromParsedDocument(
        source,
        ocr.parsed,
        fetched.url,
        "ocr",
        [...parserWarnings, ...ocr.warnings],
      );
      if (ocrResult.access_level === "full_text") return ocrResult;
      parserWarnings.push(...ocrResult.extraction_warnings);
    } else {
      parserWarnings.push(...ocr.warnings);
    }
    return emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_unavailable_no_parser",
      method: abstract ? "abstract_only" : "pdf_parser",
      warnings: dedupeStrings(parserWarnings),
      urlUsed: fetched.url,
      isPdf: true,
      failureReason: "PDF_TEXT_EXTRACTION_UNAVAILABLE",
    });
  }

  if (
    contentType &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml") &&
    !contentType.includes("text/plain")
  ) {
    return emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: abstract ? "abstract_only" : "html_readability",
      warnings: ["UNSUPPORTED_CONTENT_TYPE"],
      urlUsed: fetched.url,
      failureReason: "UNSUPPORTED_CONTENT_TYPE",
    });
  }

  return extractionFromHtml(source, fetched.text ?? "", fetched.url, maxChunks);
}

export async function extractContentForSources(
  sources: SourceCandidate[],
  options: SourceContentExtractorOptions = {},
): Promise<ContentExtractionResult[]> {
  const results: ContentExtractionResult[] = [];
  for (const source of sources) {
    results.push(await extractSourceContent(source, options));
  }
  return results;
}

export function sourceUseLevelForExtraction(
  result: ContentExtractionResult,
): SourceCandidate["sourceUseLevel"] {
  if (result.access_level === "full_text" && result.extracted_chunks.length > 0) {
    return "citable_full_text";
  }
  if (result.access_level === "abstract_only" && result.extracted_abstract) {
    return "citable_abstract";
  }
  if (result.access_level === "metadata_only") return "metadata_context_only";
  if (result.access_level === "blocked_or_paywalled") return "manual_review_required";
  return "manual_review_required";
}

export function enrichSourceCandidateWithExtraction(
  source: SourceCandidate,
  result: ContentExtractionResult,
): SourceCandidate {
  const sourceUseLevel = sourceUseLevelForExtraction(result);
  const contentLevel: NonNullable<SourceCandidate["contentLevel"]> =
    result.access_level === "full_text"
      ? "fulltext"
      : result.access_level === "abstract_only" && Boolean(result.extracted_abstract)
        ? "abstract"
        : "metadata";
  const temporaryFailure = result.extraction_warnings.some((warning) =>
    /TIMEOUT|FETCH_FAILED|HTTP_429|HTTP_5\d\d/i.test(warning),
  );
  const enrichmentStatus: NonNullable<SourceCandidate["enrichmentStatus"]> =
    contentLevel !== "metadata"
      ? "success"
      : temporaryFailure
        ? "temporary_failure"
        : "permanent_no_content";
  const sourceWithoutFailure = { ...source };
  delete sourceWithoutFailure.enrichmentFailureReason;
  return {
    ...sourceWithoutFailure,
    accessLevel: result.access_level,
    readableUrl: result.provenance.url_used,
    extractionStatus: result.extraction_status,
    extractionMethod: result.extraction_method,
    extractionMode: result.extraction_mode,
    ...(typeof result.page_count === "number" ? { pageCount: result.page_count } : {}),
    ...(typeof result.extracted_page_count === "number"
      ? { extractedPageCount: result.extracted_page_count }
      : {}),
    ...(typeof result.is_scanned === "boolean" ? { isScanned: result.is_scanned } : {}),
    ...(result.failure_reason ? { failureReason: result.failure_reason } : {}),
    ...(result.user_facing_message ? { userFacingMessage: result.user_facing_message } : {}),
    canUseForClaims: result.can_use_for_claims,
    canUseForReport: result.can_use_for_report,
    toolVersions: result.tool_versions,
    processingStartedAt: result.processing_started_at,
    processingEndedAt: result.processing_ended_at,
    qualityFlags: result.quality_flags,
    fullTextCharCount: result.full_text_char_count,
    ...(result.extracted_abstract ? { extractedAbstract: result.extracted_abstract } : {}),
    ...(result.extracted_sections.length
      ? { extractedSections: result.extracted_sections }
      : {}),
    ...(result.extracted_chunks.length ? { extractedChunks: result.extracted_chunks } : {}),
    extractionWarnings: result.extraction_warnings,
    contentHash: result.content_hash,
    contentLevel,
    enrichmentAttempted: true,
    enrichmentProviders: dedupeStrings([
      ...(source.enrichmentProviders ?? []),
      "content_extractor",
    ]),
    enrichmentStatus,
    ...(contentLevel === "metadata" && (result.failure_reason || result.extraction_warnings[0])
      ? {
          enrichmentFailureReason:
            result.failure_reason ?? result.extraction_warnings[0],
        }
      : {}),
    enrichmentProvenance: [
      ...(source.enrichmentProvenance ?? []),
      {
        provider: source.provider,
        method: result.extraction_method,
        status: result.extraction_status,
        contentLevel,
        retrievedAt: result.fetched_at,
        ...(result.provenance.url_used ? { url: result.provenance.url_used } : {}),
        ...(result.failure_reason ? { failureReason: result.failure_reason } : {}),
      },
    ],
    enrichedAt: result.fetched_at,
    sourceUseLevel,
    evidenceGrounding:
      result.access_level === "full_text"
        ? "snippet_grounded"
        : result.access_level === "abstract_only"
          ? "abstract_grounded"
          : "metadata_only",
    limitations: dedupeStrings([
      ...source.limitations,
      result.access_level === "abstract_only" ? "僅取得摘要，不能視為已讀全文。" : "",
      result.access_level === "metadata_only" ? "僅有 metadata，不能產生學術主張。" : "",
      result.access_level === "blocked_or_paywalled" ? "來源可能需要登入或付費，已略過全文抽取。" : "",
      result.access_level === "failed_extraction" ? "全文抽取失敗，需人工審查。" : "",
      result.user_facing_message ?? "",
      ...result.extraction_warnings,
    ]),
    evidencePoints:
      result.access_level === "metadata_only" || !result.can_use_for_claims
        ? []
        : result.extracted_chunks.slice(0, 3).map((chunk) => chunk.text),
    usableSections: dedupeStrings([
      ...source.usableSections,
      ...result.extracted_sections.map((section) => section.heading),
    ]).slice(0, 12),
  };
}
