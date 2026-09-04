/**
 * AI assistance disclosure: Portions of this source-extraction module were
 * drafted or refactored with Replit Agent and OpenAI Codex. See
 * /AI_ASSISTANCE.md.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, link, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { posix as pathPosix } from "node:path";
import type { Readable } from "node:stream";
import JSZip from "jszip";
import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import { parseWithPaddleOcr } from "../parsers/paddleOcrWorker";
import { parseWithPdfminer } from "../parsers/pdfminerWorker";
import { parseWithTesseractOcr } from "../parsers/tesseractWorker";
import { nowIso } from "../workflow/workflowIds";
import {
  FULL_TEXT_PROVIDER_PROFILES,
  buildFullTextAccessAudit,
  classifyFullTextRetry,
  planLegalFullTextRoutes,
  qualifyFullTextArtifact,
  resolveLegalFullTextLocations,
  type FullTextAcquisitionOutcome,
  type FullTextAccessAuditV3,
  type FullTextLocationCandidate,
  type FullTextProvider,
  type FullTextResolverRequestAudit,
  type FullTextResolutionResult,
} from "./fullTextAcquisitionV3";
import {
  inspectScholarlyHtml,
  materializeStructuredXml,
  sniffScholarlyPayload,
  readPayloadArticleIdentity,
  type ScholarlyPayloadDetection,
} from "./scholarlyPayloadMaterializer";
import {
  artifactFormatFromHint,
  decideManifestationAccessPolicy,
  materializeStudyManifestation,
  normalizedDocumentFromSections,
  type ManifestationIdentityInput,
  type StudyManifestation,
} from "./studyManifestation";

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
  | "docx_native"
  | "epub_native"
  | "jats_xml"
  | "tei_xml"
  | "xml"
  | "abstract"
  | "failed";

export type ContentExtractionMode =
  | "pdf_text"
  | "grobid"
  | "ocr"
  | "html"
  | "docx"
  | "epub"
  | "xml"
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
  access_audit_v3?: FullTextAccessAuditV3;
  artifact_doi?: string;
  artifact_identity?: ManifestationIdentityInput;
  format_detection?: ScholarlyPayloadDetection;
  landing_resolution_trace?: NonNullable<FullTextAccessAuditV3["landingResolutionTrace"]>;
  download_audit?: {
    status: number;
    contentType: string;
    declaredContentType?: string;
    detectedContentType?: string;
    detectionMethod?: string[];
    contentTypeMismatch?: boolean;
    magicBytes?: string;
    redirectChain?: string[];
    byteLength: number;
    checksum?: string;
    artifactSnapshotPath?: string;
    attempts: Array<{
      status: number;
      attemptedAt: string;
      latencyMs: number;
      result: FullTextResolverRequestAudit["result"];
      retryEligibility: FullTextResolverRequestAudit["retryEligibility"];
      outcome: FullTextAcquisitionOutcome;
      resolvedUrl: string;
      contentType: string;
      declaredContentType?: string;
      detectedContentType?: string;
      detectionMethod?: string[];
      contentTypeMismatch?: boolean;
      magicBytes?: string;
      redirectChain?: string[];
      resolutionDepth?: number;
      resolutionSignal?: string;
      byteLength: number;
      retryAfterMs?: number;
      circuitState?: "CLOSED" | "OPEN" | "HALF_OPEN";
      failureClass?: string;
      failureReason?: string;
    }>;
  };
}

export interface ExtractableSource {
  sourceId?: string;
  id?: string;
  workflowId?: string;
  title: string;
  url?: string | null;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  arxivId?: string | null;
  abstract?: string | null;
  abstractOriginal?: string | null;
  provider?: string | null;
  fullTextUrl?: string | null;
  readableUrl?: string | null;
  canonicalSourceIdentity?: string | null;
  isOpenAccess?: boolean | null;
  sourceType?: string | null;
  language?: string | null;
  authors?: string[] | null;
  year?: number | null;
  venue?: string | null;
  providerIds?: Record<string, string> | null;
  studyPopulation?: string | null;
  studyDesign?: string | null;
}

export interface SourceContentExtractorOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxPdfBytes?: number;
  maxDocumentBytes?: number;
  maxDocumentUncompressedBytes?: number;
  maxChunks?: number;
  concurrency?: number;
  resolveFullTextLocations?: boolean;
  maxResolverRequests?: number;
  maxResolvedLocations?: number;
  retryCount?: number;
  backoffMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  landingResolverDepth?: number;
  landingResolverMaxDepth?: number;
  landingResolverVisitedUrls?: string[];
  landingResolutionTrace?: NonNullable<FullTextAccessAuditV3["landingResolutionTrace"]>;
  landingResolutionSignal?: string;
  artifactSnapshotDirectory?: string;
  manifestationIdentityDecision?: StudyManifestation["identityDecision"];
  manifestationIdentityConfidence?: number;
  manifestationIdentityEvidence?: StudyManifestation["identityEvidence"];
  pdfParser?: (
    sourceId: string,
    workflowId: string,
    pdfUrl: string,
    pdfBytes?: Uint8Array,
  ) => Promise<ParsedDocument | null>;
  secondaryPdfParser?: (
    sourceId: string,
    workflowId: string,
    pdfUrl: string,
    pdfBytes?: Uint8Array,
  ) => Promise<ParsedDocument | null>;
  ocrParser?: (
    sourceId: string,
    workflowId: string,
    pdfUrl: string,
    pdfBytes?: Uint8Array,
  ) => Promise<ParsedDocument | null>;
}

interface FetchBytesResult {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  declaredContentType?: string;
  detectedContentType?: string;
  detection?: ScholarlyPayloadDetection;
  redirectChain?: string[];
  text?: string;
  bytes?: Uint8Array;
  warnings: string[];
  artifactSnapshotPath?: string;
  attempts: NonNullable<ContentExtractionResult["download_audit"]>["attempts"];
}

const TOOL_VERSION = "source-content-extractor-v1";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 1_500_000;
const DEFAULT_MAX_PDF_BYTES = 8_000_000;
const DEFAULT_MAX_DOCUMENT_BYTES = 12_000_000;
const DEFAULT_MAX_DOCUMENT_UNCOMPRESSED_BYTES = 48_000_000;
const MAX_ARCHIVE_ENTRIES = 5_000;
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
const acquisitionNextRequestAt = new Map<FullTextProvider, number>();
const acquisitionCircuitState = new Map<FullTextProvider, { failures: number; openUntil: number }>();

async function waitForAcquisitionRateSlot(
  provider: FullTextProvider,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<void> {
  const interval = FULL_TEXT_PROVIDER_PROFILES[provider].minIntervalMs;
  if (interval <= 0) return;
  const now = Date.now();
  const reservedAt = Math.max(now, acquisitionNextRequestAt.get(provider) ?? now);
  acquisitionNextRequestAt.set(provider, reservedAt + interval);
  if (reservedAt > now) await sleepImpl(reservedAt - now);
}

function acquisitionCircuitOpen(provider: FullTextProvider, now: number): boolean {
  const state = acquisitionCircuitState.get(provider);
  if (!state) return false;
  if (state.openUntil > now) return true;
  if (state.openUntil > 0) acquisitionCircuitState.delete(provider);
  return false;
}

function recordAcquisitionProviderResult(provider: FullTextProvider, transientFailure: boolean, now: number): void {
  if (!transientFailure) {
    acquisitionCircuitState.delete(provider);
    return;
  }
  const profile = FULL_TEXT_PROVIDER_PROFILES[provider];
  const failures = (acquisitionCircuitState.get(provider)?.failures ?? 0) + 1;
  acquisitionCircuitState.set(provider, {
    failures,
    openUntil: failures >= profile.circuitThreshold ? now + profile.cooldownMs : 0,
  });
}

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function doiFromExtractedText(value: string | null | undefined): string | undefined {
  const match = cleanText(value).match(/\b10\.\d{4,9}\/[a-z0-9][a-z0-9.()/:;_-]*[a-z0-9]\b/iu);
  return match?.[0]?.replace(/[.,;:)]+$/gu, "");
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
  if (method === "docx_native") return "docx";
  if (method === "epub_native") return "epub";
  if (method === "jats_xml" || method === "tei_xml" || method === "xml") return "xml";
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

function fullTextProvider(value: string | null | undefined): FullTextProvider {
  const normalized = cleanText(value).toLocaleLowerCase().replace(/[\s-]+/gu, "_");
  if (normalized === "openalex") return "openalex";
  if (normalized === "crossref") return "crossref";
  if (normalized === "datacite") return "datacite";
  if (normalized === "europe_pmc" || normalized === "europepmc") return "europe_pmc";
  if (normalized === "unpaywall") return "unpaywall";
  if (normalized === "doaj") return "doaj";
  if (normalized === "semantic_scholar" || normalized === "semanticscholar") return "semantic_scholar";
  if (normalized === "arxiv") return "arxiv";
  if (normalized === "core") return "core";
  if (normalized === "doi_resolver") return "doi_resolver";
  return "existing_payload";
}

function urlLooksLikeLoginOrPaywall(url: string): boolean {
  return /\/(login|signin|sign-in|subscribe|subscription|purchase|checkout|cart|paywall|shibboleth|saml)\b/i.test(
    url,
  );
}

function urlLooksLikePdf(url: string): boolean {
  return /\.pdf(?:[?#].*)?$/i.test(url) || /\/pdf(?:[/?#]|$)/i.test(url);
}

function urlLooksLikeDocx(url: string): boolean {
  return /\.docx(?:[?#].*)?$/i.test(url);
}

function urlLooksLikeEpub(url: string): boolean {
  return /\.epub(?:[?#].*)?$/i.test(url);
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

function looksLikePublisherShell(text: string, sections: ExtractedSection[]): boolean {
  if (text.length >= 1_200 || sections.length > 2) return false;
  const shellSignals = [
    /\b(?:online|print) ISSN\b/iu,
    /\bISSN[- ]?L\b/iu,
    /EndNote|Reference Manager|RefWorks|ProCite/iu,
    /資料トップ|発行日|公開日|受付日/u,
    /sign in|subscriber|subscription|購読者|download citation/iu,
  ].filter((pattern) => pattern.test(text)).length;
  const researchBodySignals = [
    /\bmethods?\b|方法/u,
    /\bresults?\b|結果/u,
    /\bparticipants?\b|研究對象|受試/u,
  ].filter((pattern) => pattern.test(text)).length;
  return shellSignals >= 2 && researchBodySignals === 0;
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
  const challengeSignals = [
    /captcha/iu,
    /cloudflare/iu,
    /verify you are human/iu,
    /attention required/iu,
    /enable javascript and cookies/iu,
    /cf-chl-/iu,
  ].filter((pattern) => pattern.test(html)).length;
  const loginSignals = [
    /<form[^>]+(?:login|signin|sign-in)/iu,
    /sign in to (?:continue|access)/iu,
    /login required/iu,
    /institutional access/iu,
  ].filter((pattern) => pattern.test(html)).length;
  if (challengeSignals >= 1 || loginSignals >= 2) {
    return emptyResult(source, {
      accessLevel: "blocked_or_paywalled",
      status: "extraction_skipped_license",
      method: "html_readability",
      warnings: [challengeSignals >= 1 ? "CAPTCHA_OR_CHALLENGE_BLOCKED" : "LOGIN_REQUIRED"],
      urlUsed,
      failureReason: challengeSignals >= 1 ? "CAPTCHA_OR_CHALLENGE_BLOCKED" : "LOGIN_REQUIRED",
    });
  }
  const cleaned = cleanHtml(html);
  const title =
    stripTags(cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "") ||
    extractMetaContent(cleaned, ["citation_title", "dc.title", "og:title"]) ||
    cleanText(source.title);
  const metaAbstract =
    extractMetaContent(cleaned, [
      "citation_abstract",
      "dc.description",
      "description",
      "og:description",
    ]) || sourceAbstract(source);
  const artifactDoi = cleanText(
    extractMetaContent(cleaned, ["citation_doi", "dc.identifier"])
      .replace(/^doi:\s*/iu, "")
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, ""),
  );
  const scholarlyScopes = [
    ...(cleaned.match(/<article\b[^>]*>[\s\S]*?<\/article>/giu) ?? []),
    ...(cleaned.match(/<main\b[^>]*>[\s\S]*?<\/main>/giu) ?? []),
    ...(cleaned.match(/<div\b[^>]*(?:class|id)=["'][^"']*(?:article[-_ ]?body|full[-_ ]?text|body[-_ ]?content|article[-_ ]?content|main[-_ ]?content)[^"']*["'][^>]*>[\s\S]*?<\/div>/giu) ?? []),
  ];
  const scopeScore = (markup: string) => {
    const paragraphText = [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
      .map((match) => stripTags(match[1] ?? ""))
      .filter((text) => text.length >= 40);
    const headings = (markup.match(/<h[1-6]\b/giu) ?? []).length;
    const references = /references?|bibliography|參考文獻/iu.test(stripTags(markup)) ? 1 : 0;
    return paragraphText.reduce((sum, text) => sum + text.length, 0) + headings * 180 + references * 500;
  };
  const bestScope = scholarlyScopes
    .map((markup) => ({ markup, score: scopeScore(markup) }))
    .sort((left, right) => right.score - left.score)[0];
  const contentMarkup = bestScope && bestScope.score >= 1_000 ? bestScope.markup : cleaned;
  const bodySections: ExtractedSection[] = [];
  const tableSections: ExtractedSection[] = [];
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/giu;
  let tableMatch: RegExpExecArray | null;
  let tableIndex = 1;
  while ((tableMatch = tablePattern.exec(contentMarkup))) {
    const tableMarkup = tableMatch[1] ?? "";
    const caption = stripTags(tableMarkup.match(/<caption[^>]*>([\s\S]*?)<\/caption>/iu)?.[1] ?? "");
    const rowTexts = [...tableMarkup.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu)].map((row) =>
      [...(row[1] ?? "").matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/giu)]
        .map((cell) => stripTags(cell[1] ?? ""))
        .filter(Boolean)
        .join(" | "),
    ).filter(Boolean);
    const tableText = cleanText(rowTexts.join("\n"));
    if (tableText.length >= 20) {
      const heading = caption || `Table ${tableIndex}`;
      tableSections.push({ heading, text: tableText, confidence: 0.86 });
      tableIndex += 1;
    }
  }
  let currentHeading = "Readable body";
  const currentParagraphs: string[] = [];
  const flush = () => {
    const text = cleanText(currentParagraphs.join(" "));
    currentParagraphs.length = 0;
    if (!text || text.length < 120) return;
    bodySections.push({
      heading: currentHeading,
      text,
      confidence: currentHeading === "Readable body" ? 0.55 : 0.7,
    });
  };

  const tokenPattern = /<(h[1-6]|p|figcaption|caption|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(contentMarkup))) {
    const tag = match[1]?.toLowerCase();
    const text = stripTags(match[2] ?? "");
    if (!text || /cookie|privacy|subscribe|newsletter|sign in|login/i.test(text)) continue;
    if (tag?.startsWith("h")) {
      flush();
      currentHeading = text.slice(0, 120);
      continue;
    }
    if (tag === "figcaption" || tag === "caption") {
      flush();
      if (text.length >= 20) {
        const heading = tag === "figcaption" ? "Figure Caption" : "Table Caption";
        bodySections.push({ heading, text, confidence: 0.9 });
      }
      continue;
    }
    if (text.length >= 40) currentParagraphs.push(text);
  }
  flush();

  const sections = [...bodySections, ...tableSections];
  const chunks: ExtractedChunk[] = [];
  for (const section of sections) {
    if (chunks.length >= maxChunks) break;
    chunks.push(...chunkText({
      sourceId: id,
      text: section.text,
      heading: section.heading,
      location: tableSections.includes(section) ? "table" : section.heading,
      maxChunks: maxChunks - chunks.length,
    }));
  }
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
  if (looksLikePublisherShell(fullText, sections)) {
    const abstract = metaAbstract || sourceAbstract(source);
    return emptyResult({ ...source, abstract }, {
      accessLevel: abstract ? "abstract_only" : "metadata_only",
      status: abstract ? "extraction_skipped_no_full_text" : "metadata_only",
      method: abstract ? "abstract_only" : "metadata_only",
      warnings: ["HTML_PUBLISHER_SHELL_NOT_FULL_TEXT"],
      urlUsed,
      failureReason: "HTML_PUBLISHER_SHELL_NOT_FULL_TEXT",
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
    ...(artifactDoi ? { artifact_doi: artifactDoi } : {}),
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

function extractionFromStructuredXml(
  source: ExtractableSource,
  xml: string,
  urlUsed: string,
  maxChunks: number,
): ContentExtractionResult {
  const materialized = materializeStructuredXml(xml);
  const method: ContentExtractionMethod = materialized.format === "TEI_XML"
    ? "tei_xml"
    : materialized.format === "JATS_XML"
      ? "jats_xml"
      : "xml";
  const id = sourceId(source);
  const sections: ExtractedSection[] = [
    ...materialized.sections.map((section) => ({ ...section, confidence: 0.95 })),
    ...(materialized.captions.length
      ? [{ heading: "Figure and table captions", text: cleanText(materialized.captions.join(" ")), confidence: 0.92 }]
      : []),
    ...(materialized.references.length
      ? [{ heading: "References", text: cleanText(materialized.references.join(" ")), confidence: 0.94 }]
      : []),
  ].filter((section) => section.text.length >= 20);
  const fullText = cleanText(materialized.text);
  if (!fullText || materialized.sections.length === 0) {
    const abstract = materialized.abstract || sourceAbstract(source);
    return emptyResult({ ...source, abstract }, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: abstract ? "abstract_only" : method,
      warnings: [materialized.format === "TEI_XML" ? "TEI_BODY_MISSING" : materialized.format === "JATS_XML" ? "JATS_BODY_MISSING" : "SCHOLARLY_XML_BODY_MISSING"],
      urlUsed,
      failureReason: materialized.format === "TEI_XML" ? "TEI_BODY_MISSING" : materialized.format === "JATS_XML" ? "JATS_BODY_MISSING" : "SCHOLARLY_XML_BODY_MISSING",
    });
  }
  const chunks = sections.flatMap((section) => chunkText({
    sourceId: id,
    text: section.text,
    heading: section.heading,
    location: section.heading,
    maxChunks,
  })).slice(0, maxChunks);
  const startedAt = nowIso();
  return {
    source_id: id,
    access_level: "full_text",
    extraction_status: "text_extracted",
    extraction_method: method,
    extraction_mode: "xml",
    text: fullText,
    extracted_title: materialized.title || cleanText(source.title) || undefined,
    extracted_abstract: materialized.abstract || sourceAbstract(source) || undefined,
    ...(materialized.doi ? { artifact_doi: materialized.doi } : {}),
    extracted_sections: sections,
    extracted_chunks: chunks,
    chunks,
    ...(cleanText(source.language) ? { language: cleanText(source.language) } : {}),
    can_use_for_claims: chunks.length > 0,
    can_use_for_report: chunks.length > 0,
    tool_versions: {
      source_content_extractor: TOOL_VERSION,
      [materialized.format === "TEI_XML" ? "tei_parser" : materialized.format === "JATS_XML" ? "jats_parser" : "scholarly_xml_parser"]:
        materialized.format === "TEI_XML" ? "deterministic-tei-v1" : materialized.format === "JATS_XML" ? "deterministic-jats-v2" : "deterministic-scholarly-xml-v1",
    },
    processing_started_at: startedAt,
    processing_ended_at: nowIso(),
    quality_flags: [],
    full_text_char_count: fullText.length,
    extraction_warnings: [],
    fetched_at: nowIso(),
    content_hash: resultHash({ sourceId: id, method, text: fullText, warnings: [] }),
    provenance: {
      url_used: urlUsed,
      ...(cleanText(source.doi) ? { doi_used: cleanText(source.doi) } : {}),
      ...(cleanText(source.provider) ? { provider: cleanText(source.provider) } : {}),
      tool_version: TOOL_VERSION,
    },
  };
}

function nativeSectionsResult(input: {
  source: ExtractableSource;
  urlUsed: string;
  method: "docx_native" | "epub_native";
  title?: string;
  identity?: ManifestationIdentityInput;
  sections: ExtractedSection[];
  maxChunks: number;
  warnings?: string[];
}): ContentExtractionResult {
  const id = sourceId(input.source);
  const sections = input.sections
    .map((section) => ({ ...section, heading: cleanText(section.heading), text: cleanText(section.text) }))
    .filter((section) => section.heading && section.text);
  const chunks: ExtractedChunk[] = [];
  for (const section of sections) {
    if (chunks.length >= input.maxChunks) break;
    chunks.push(...chunkText({
      sourceId: id,
      text: section.text,
      heading: section.heading,
      location: section.heading,
      maxChunks: Math.max(1, input.maxChunks - chunks.length),
    }));
  }
  const fullText = cleanText(sections.map((section) => section.text).join("\n\n"));
  const warnings = dedupeStrings(input.warnings ?? []);
  if (!fullText || chunks.length === 0) {
    const abstract = sourceAbstract(input.source);
    return emptyResult(input.source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: abstract ? "abstract_only" : input.method,
      warnings: dedupeStrings([...warnings, "NO_READABLE_BODY"]),
      urlUsed: input.urlUsed,
      failureReason: "NO_READABLE_BODY",
    });
  }
  const startedAt = nowIso();
  return {
    source_id: id,
    access_level: "full_text",
    extraction_status: "text_extracted",
    extraction_method: input.method,
    extraction_mode: extractionModeForMethod(input.method),
    text: fullText,
    artifact_identity: input.identity,
    extracted_title: cleanText(input.title) || cleanText(input.source.title) || undefined,
    extracted_abstract: sourceAbstract(input.source) || undefined,
    extracted_sections: sections,
    extracted_chunks: chunks.slice(0, input.maxChunks),
    chunks: chunks.slice(0, input.maxChunks),
    ...(cleanText(input.source.language) ? { language: cleanText(input.source.language) } : {}),
    can_use_for_claims: true,
    can_use_for_report: true,
    tool_versions: {
      source_content_extractor: TOOL_VERSION,
      archive_parser: `jszip-${JSZip.version}`,
    },
    processing_started_at: startedAt,
    processing_ended_at: nowIso(),
    quality_flags: warnings,
    full_text_char_count: fullText.length,
    extraction_warnings: warnings,
    fetched_at: nowIso(),
    content_hash: resultHash({ sourceId: id, method: input.method, text: fullText, warnings }),
    provenance: {
      url_used: input.urlUsed,
      ...(cleanText(input.source.doi) ? { doi_used: cleanText(input.source.doi) } : {}),
      ...(cleanText(input.source.provider) ? { provider: cleanText(input.source.provider) } : {}),
      tool_version: TOOL_VERSION,
    },
  };
}

function wordParagraphText(xml: string): string {
  return decodeHtmlEntities(
    [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/giu)]
      .map((match) => match[1] ?? "")
      .join(" "),
  ).replace(/\s+/g, " ").trim();
}

interface ArchiveReadBudget {
  remainingBytes: number;
}

async function loadBoundedArchive(bytes: Uint8Array): Promise<JSZip> {
  const archive = await JSZip.loadAsync(bytes);
  if (Object.keys(archive.files).length > MAX_ARCHIVE_ENTRIES) {
    throw new Error("ARCHIVE_ENTRY_LIMIT_EXCEEDED");
  }
  return archive;
}

async function readArchiveText(
  archive: JSZip,
  entryPath: string,
  budget: ArchiveReadBudget,
): Promise<string | undefined> {
  const normalizedPath = pathPosix.normalize(entryPath).replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath === ".." || normalizedPath.startsWith("../")) {
    throw new Error("ARCHIVE_ENTRY_PATH_INVALID");
  }
  const entry = archive.file(normalizedPath);
  if (!entry) return undefined;
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = entry.nodeStream("nodebuffer") as Readable;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    stream.on("data", (chunk: Buffer | Uint8Array) => {
      const buffer = Buffer.from(chunk);
      budget.remainingBytes -= buffer.length;
      if (budget.remainingBytes < 0) {
        fail(new Error("ARCHIVE_UNCOMPRESSED_LIMIT_EXCEEDED"));
        stream.destroy();
        return;
      }
      chunks.push(buffer);
    });
    stream.once("error", fail);
    stream.once("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
  });
}

function wordSections(xml: string, defaultHeading: string): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  let heading = defaultHeading;
  let paragraphs: string[] = [];
  const flush = () => {
    const text = cleanText(paragraphs.join(" "));
    paragraphs = [];
    if (text) sections.push({ heading, text, confidence: 0.82 });
  };
  for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/giu)) {
    const block = match[0];
    const text = wordParagraphText(block);
    if (!text) continue;
    const style = block.match(/<w:pStyle[^>]*w:val=["']([^"']+)["'][^>]*\/?\s*>/iu)?.[1] ?? "";
    const isHeading = /^(?:heading|title|subtitle|標題|标题)/iu.test(style);
    if (isHeading) {
      flush();
      heading = text.slice(0, 160);
    } else {
      paragraphs.push(text);
    }
  }
  flush();
  return sections;
}

async function extractionFromDocx(input: {
  source: ExtractableSource;
  bytes: Uint8Array;
  urlUsed: string;
  maxChunks: number;
  maxUncompressedBytes: number;
}): Promise<ContentExtractionResult> {
  try {
    const archive = await loadBoundedArchive(input.bytes);
    const budget = { remainingBytes: input.maxUncompressedBytes };
    const documentXml = await readArchiveText(archive, "word/document.xml", budget);
    if (!documentXml) throw new Error("DOCX_DOCUMENT_XML_MISSING");
    const coreXml = await readArchiveText(archive, "docProps/core.xml", budget);
    const title = decodeHtmlEntities(
      coreXml?.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/iu)?.[1] ?? "",
    );
    const sections = wordSections(documentXml, "Document body");
    const footnotesXml = await readArchiveText(archive, "word/footnotes.xml", budget);
    if (footnotesXml) sections.push(...wordSections(footnotesXml, "Footnotes"));
    return nativeSectionsResult({
      source: input.source,
      urlUsed: input.urlUsed,
      method: "docx_native",
      title,
      identity: readPayloadArticleIdentity(coreXml ?? "", "XML"),
      sections,
      maxChunks: input.maxChunks,
    });
  } catch (error) {
    return emptyResult(input.source, {
      accessLevel: sourceAbstract(input.source) ? "abstract_only" : "failed_extraction",
      status: sourceAbstract(input.source) ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: sourceAbstract(input.source) ? "abstract_only" : "docx_native",
      warnings: [error instanceof Error ? error.message : "DOCX_PARSE_FAILED"],
      urlUsed: input.urlUsed,
      failureReason: "DOCX_PARSE_FAILED",
    });
  }
}

function htmlSections(markup: string, defaultHeading: string): ExtractedSection[] {
  const cleaned = cleanHtml(markup);
  const sections: ExtractedSection[] = [];
  let heading = defaultHeading;
  let paragraphs: string[] = [];
  const flush = () => {
    const text = cleanText(paragraphs.join(" "));
    paragraphs = [];
    if (text) sections.push({ heading, text, confidence: 0.8 });
  };
  const tokenPattern = /<(h[1-4]|p|li|blockquote|caption)[^>]*>([\s\S]*?)<\/\1>/giu;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(cleaned))) {
    const tag = match[1]?.toLocaleLowerCase() ?? "";
    const text = stripTags(match[2] ?? "");
    if (!text) continue;
    if (tag.startsWith("h")) {
      flush();
      heading = text.slice(0, 160);
    } else if (text.length >= 20) {
      paragraphs.push(text);
    }
  }
  flush();
  return sections;
}

function xmlAttribute(block: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeHtmlEntities(
    block.match(new RegExp(`${escaped}=["']([^"']+)["']`, "iu"))?.[1] ?? "",
  );
}

async function extractionFromEpub(input: {
  source: ExtractableSource;
  bytes: Uint8Array;
  urlUsed: string;
  maxChunks: number;
  maxUncompressedBytes: number;
}): Promise<ContentExtractionResult> {
  try {
    const archive = await loadBoundedArchive(input.bytes);
    const budget = { remainingBytes: input.maxUncompressedBytes };
    const container = await readArchiveText(archive, "META-INF/container.xml", budget);
    const packagePath = xmlAttribute(
      container?.match(/<rootfile\b[^>]*>/iu)?.[0] ?? "",
      "full-path",
    );
    if (!packagePath) throw new Error("EPUB_PACKAGE_PATH_MISSING");
    const packageXml = await readArchiveText(archive, packagePath, budget);
    if (!packageXml) throw new Error("EPUB_PACKAGE_XML_MISSING");
    const title = decodeHtmlEntities(
      packageXml.match(/<dc:title(?:\s[^>]*)?>([\s\S]*?)<\/dc:title>/iu)?.[1] ?? "",
    );
    const manifest = new Map<string, { href: string; mediaType: string }>();
    for (const item of packageXml.matchAll(/<item\b[^>]*\/?\s*>/giu)) {
      const id = xmlAttribute(item[0], "id");
      const href = xmlAttribute(item[0], "href");
      const mediaType = xmlAttribute(item[0], "media-type");
      if (id && href) manifest.set(id, { href, mediaType });
    }
    const spineIds = [...packageXml.matchAll(/<itemref\b[^>]*\/?\s*>/giu)]
      .map((item) => xmlAttribute(item[0], "idref"))
      .filter(Boolean);
    const packageDirectory = pathPosix.dirname(packagePath);
    const sections: ExtractedSection[] = [];
    for (const id of spineIds) {
      const item = manifest.get(id);
      if (!item || !/(?:xhtml|html)/iu.test(item.mediaType)) continue;
      const decodedHref = decodeURIComponent(item.href.split("#")[0] ?? item.href);
      const itemPath = pathPosix.normalize(pathPosix.join(packageDirectory, decodedHref));
      const markup = await readArchiveText(archive, itemPath, budget);
      if (!markup) continue;
      sections.push(...htmlSections(markup, pathPosix.basename(decodedHref)));
      if (sections.length >= input.maxChunks * 2) break;
    }
    return nativeSectionsResult({
      source: input.source,
      urlUsed: input.urlUsed,
      method: "epub_native",
      title,
      identity: readPayloadArticleIdentity(packageXml, "XML"),
      sections,
      maxChunks: input.maxChunks,
    });
  } catch (error) {
    return emptyResult(input.source, {
      accessLevel: sourceAbstract(input.source) ? "abstract_only" : "failed_extraction",
      status: sourceAbstract(input.source) ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: sourceAbstract(input.source) ? "abstract_only" : "epub_native",
      warnings: [error instanceof Error ? error.message : "EPUB_PARSE_FAILED"],
      urlUsed: input.urlUsed,
      failureReason: "EPUB_PARSE_FAILED",
    });
  }
}

function snapshotExtension(detection: ScholarlyPayloadDetection): string {
  if (detection.format === "PDF") return "pdf";
  if (detection.format === "JATS_XML") return "jats.xml";
  if (detection.format === "TEI_XML") return "tei.xml";
  if (detection.format === "XML") return "xml";
  if (detection.format === "HTML") return "html";
  return "bin";
}

/** Publish complete bytes atomically; existing content must be byte-identical. */
export async function persistImmutableArtifact(destination: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    try { await link(temporary, destination); }
    catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      if (!Buffer.from(await readFile(destination)).equals(Buffer.from(bytes))) throw new Error("IMMUTABLE_ARTIFACT_CONFLICT");
    }
  } finally { await unlink(temporary); }
}

async function persistArtifactSnapshot(input: {
  bytes: Uint8Array;
  detection: ScholarlyPayloadDetection;
  directory?: string;
}): Promise<string | undefined> {
  const configuredDirectory = cleanText(input.directory ?? process.env.RESEARCHFORGE_ARTIFACT_SNAPSHOT_DIR);
  if (!configuredDirectory || input.bytes.byteLength === 0) return undefined;
  const directory = isAbsolute(configuredDirectory) ? configuredDirectory : resolve(configuredDirectory);
  await mkdir(directory, { recursive: true });
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const snapshotPath = join(directory, `${checksum}.${snapshotExtension(input.detection)}`);
  await persistImmutableArtifact(snapshotPath, input.bytes);
  return snapshotPath;
}

async function fetchBytes(
  url: string,
  options: {
    provider: FullTextProvider;
    fetchImpl: typeof fetch;
    timeoutMs: number;
    maxBytes: number;
    retryCount: number;
    backoffMs: number;
    sleepImpl: (ms: number) => Promise<void>;
    artifactSnapshotDirectory?: string;
  },
): Promise<FetchBytesResult> {
  const attempts: FetchBytesResult["attempts"] = [];
  const profile = FULL_TEXT_PROVIDER_PROFILES[options.provider];
  if (options.fetchImpl === fetch && acquisitionCircuitOpen(options.provider, Date.now())) {
    return {
      ok: false,
      status: 0,
      url,
      contentType: "",
      warnings: ["PROVIDER_CIRCUIT_OPEN"],
      attempts: [{
        status: 0,
        attemptedAt: nowIso(),
        latencyMs: 0,
        result: "CIRCUIT_OPEN",
        retryEligibility: "NOT_RETRYABLE",
        outcome: "PROVIDER_CIRCUIT_OPEN",
        resolvedUrl: url,
        contentType: "",
        byteLength: 0,
        circuitState: "OPEN",
      }],
    };
  }
  for (let attempt = 0; attempt <= options.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(options.timeoutMs, profile.timeoutMs));
    const attemptedAt = nowIso();
    const startedAt = Date.now();
    try {
      if (options.fetchImpl === fetch) {
        await waitForAcquisitionRateSlot(options.provider, options.sleepImpl);
      }
      let requestUrl = url;
      const redirectChain = [url];
      const mayFollow = (target: string) => {
        if (urlLooksLikeLoginOrPaywall(target)) return false;
        try {
          const next = new URL(target);
          if (!["http:", "https:"].includes(next.protocol) || next.username || next.password) return false;
          if (next.origin === new URL(url).origin) return true;
          return decideManifestationAccessPolicy({ provider: options.provider, sourceUrl: target }).startsWith("ALLOWED_");
        } catch { return false; }
      };
      const requestInit: RequestInit = {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/xml,text/xml,application/jats+xml,text/html,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document;q=0.9,*/*;q=0.5",
          "User-Agent": USER_AGENT,
        },
      };
      let response = await options.fetchImpl(requestUrl, requestInit);
      for (let hop = 0; [301, 302, 303, 307, 308].includes(response.status); hop += 1) {
        const location = response.headers.get("location");
        const next = location ? new URL(location, requestUrl).toString() : "";
        const failure = hop >= 3 || redirectChain.includes(next) || !next ? "REDIRECT_RESOLUTION_FAILURE" : !mayFollow(next) ? "UNKNOWN_POLICY" : null;
        await response.body?.cancel();
        if (failure) return { ok: false, status: response.status, url: requestUrl, redirectChain, contentType: "", warnings: [failure], attempts };
        requestUrl = next;
        redirectChain.push(next);
        response = await options.fetchImpl(requestUrl, requestInit);
      }
      const declaredContentType = response.headers.get("content-type") ?? "";
      const contentLength = Number(response.headers.get("content-length") ?? "0");
      const resolvedUrl = response.url || requestUrl;
      if (resolvedUrl !== requestUrl && !mayFollow(resolvedUrl)) {
        await response.body?.cancel();
        return { ok: false, status: response.status, url: resolvedUrl, redirectChain, contentType: "", warnings: ["UNKNOWN_POLICY"], attempts };
      }
      if (!redirectChain.includes(resolvedUrl)) redirectChain.push(resolvedUrl);
      const result: FullTextResolverRequestAudit["result"] = response.ok
        ? "SUCCESS"
        : [404, 410].includes(response.status)
          ? "NOT_FOUND"
          : [401, 403, 451].includes(response.status)
            ? "ACCESS_DENIED"
            : response.status === 429
              ? "RATE_LIMITED"
              : response.status >= 500
                ? "SERVER_ERROR"
                : "INVALID_RESPONSE";
      const retryable = profile.retryableStatuses.includes(response.status) &&
        classifyFullTextRetry({ status: response.status }) === "RETRYABLE";
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader && /^\d+(?:\.\d+)?$/u.test(retryAfterHeader.trim())
        ? Number(retryAfterHeader)
        : null;
      const retryAfterMs = retryAfterSeconds === null
        ? 0
        : Math.max(0, Math.min(60_000, Math.round(retryAfterSeconds * 1_000)));
      const outcome: FullTextAcquisitionOutcome = response.status === 401
        ? "HTTP_401"
        : response.status === 403 ? "HTTP_403"
          : response.status === 404 || response.status === 410 ? "HTTP_404"
            : response.status === 429 ? "HTTP_429"
              : response.status >= 500 ? "PROVIDER_SERVER_ERROR"
                : declaredContentType.toLocaleLowerCase().includes("pdf") || urlLooksLikePdf(resolvedUrl)
                  ? "PDF_DOWNLOAD_SUCCESS"
                  : declaredContentType.toLocaleLowerCase().includes("xml")
                    ? "XML_JATS_FULL_TEXT_FOUND"
                    : "HTML_FULL_TEXT_FOUND";
      attempts.push({
        status: response.status,
        attemptedAt,
        latencyMs: Math.max(0, Date.now() - startedAt),
        result,
        retryEligibility: retryable ? "RETRYABLE" : "NOT_RETRYABLE",
        outcome,
        resolvedUrl,
        contentType: declaredContentType,
        declaredContentType,
        redirectChain,
        byteLength: Math.max(0, contentLength),
        ...(retryAfterMs > 0 ? { retryAfterMs } : {}),
        circuitState: "CLOSED",
      });
      recordAcquisitionProviderResult(options.provider, !response.ok && retryable, Date.now());
      if (!response.ok) {
        if (retryable && attempt < options.retryCount) {
          await options.sleepImpl(Math.max(retryAfterMs, options.backoffMs * 2 ** attempt));
          continue;
        }
        return {
          ok: false,
          status: response.status,
          url: resolvedUrl,
          contentType: declaredContentType,
          declaredContentType,
          redirectChain,
          warnings: response.status === 401 || response.status === 403
            ? [`FETCH_HTTP_${response.status}`, "PAYWALL_OR_LOGIN_REQUIRED"]
            : [`FETCH_HTTP_${response.status}`],
          attempts,
        };
      }
      if (contentLength > options.maxBytes) {
        return {
          ok: false,
          status: response.status,
          url: resolvedUrl,
          contentType: declaredContentType,
          declaredContentType,
          redirectChain,
          warnings: ["MAX_BYTES_EXCEEDED"],
          attempts,
        };
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      if (!reader) {
        const arrayBuffer = await response.arrayBuffer();
        total = arrayBuffer.byteLength;
        if (total <= options.maxBytes) chunks.push(new Uint8Array(arrayBuffer));
      } else {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > options.maxBytes) {
            controller.abort();
            break;
          }
          chunks.push(value);
        }
      }
      if (total > options.maxBytes) {
        return {
          ok: false,
          status: response.status,
          url: resolvedUrl,
          contentType: declaredContentType,
          declaredContentType,
          redirectChain,
          warnings: ["MAX_BYTES_EXCEEDED"],
          attempts,
        };
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const detection = sniffScholarlyPayload({
        bytes,
        declaredContentType,
        url: resolvedUrl,
      });
      const finalAttempt = attempts[attempts.length - 1]!;
      finalAttempt.byteLength = bytes.byteLength;
      finalAttempt.contentType = detection.detectedMime;
      finalAttempt.declaredContentType = detection.declaredMime;
      finalAttempt.detectedContentType = detection.detectedMime;
      finalAttempt.detectionMethod = detection.detectionMethod;
      finalAttempt.contentTypeMismatch = detection.mismatch;
      finalAttempt.magicBytes = detection.magicBytes;
      finalAttempt.redirectChain = redirectChain;
      finalAttempt.outcome = detection.format === "PDF"
        ? "PDF_DOWNLOAD_SUCCESS"
        : detection.format === "JATS_XML"
          ? "XML_JATS_FULL_TEXT_FOUND"
          : detection.format === "TEI_XML"
            ? "XML_TEI_FULL_TEXT_FOUND"
            : detection.format === "HTML"
              ? "HTML_FULL_TEXT_FOUND"
              : "INVALID_CONTENT_TYPE";
      let artifactSnapshotPath: string | undefined;
      try {
        artifactSnapshotPath = await persistArtifactSnapshot({
          bytes,
          detection,
          directory: options.artifactSnapshotDirectory,
        });
      } catch {
        finalAttempt.failureClass = "ARTIFACT_SNAPSHOT_WRITE_FAILED";
        finalAttempt.failureReason = "ARTIFACT_SNAPSHOT_WRITE_FAILED";
      }
      return {
        ok: true,
        status: response.status,
        url: resolvedUrl,
        contentType: detection.detectedMime,
        declaredContentType: detection.declaredMime,
        detectedContentType: detection.detectedMime,
        detection,
        redirectChain,
        bytes,
        text: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
        warnings: [],
        ...(artifactSnapshotPath ? { artifactSnapshotPath } : {}),
        attempts,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      attempts.push({
        status: 0,
        attemptedAt,
        latencyMs: Math.max(0, Date.now() - startedAt),
        result: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        retryEligibility: "RETRYABLE",
        outcome: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
        resolvedUrl: url,
        contentType: "",
        byteLength: 0,
        circuitState: "CLOSED",
      });
      recordAcquisitionProviderResult(options.provider, true, Date.now());
      if (attempt < options.retryCount) {
        await options.sleepImpl(options.backoffMs * 2 ** attempt);
        continue;
      }
      return {
        ok: false,
        status: 0,
        url,
        contentType: "",
        warnings: [timedOut ? "FETCH_TIMEOUT" : "FETCH_FAILED"],
        attempts,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, status: 0, url, contentType: "", warnings: ["FETCH_FAILED"], attempts };
}

function withDownloadAudit(
  result: ContentExtractionResult,
  fetched: FetchBytesResult,
): ContentExtractionResult {
  const bytes = fetched.bytes ?? new Uint8Array();
  return {
    ...result,
    ...(["HTML", "XML", "JATS_XML", "TEI_XML"].includes(fetched.detection?.format ?? "") ? {
      artifact_identity: readPayloadArticleIdentity(fetched.text ?? "", fetched.detection?.format === "HTML" ? "HTML" : "XML"),
    } : {}),
    download_audit: {
      status: fetched.status,
      contentType: fetched.contentType,
      ...(fetched.declaredContentType ? { declaredContentType: fetched.declaredContentType } : {}),
      ...(fetched.detectedContentType ? { detectedContentType: fetched.detectedContentType } : {}),
      ...(fetched.detection?.detectionMethod.length ? { detectionMethod: fetched.detection.detectionMethod } : {}),
      ...(typeof fetched.detection?.mismatch === "boolean" ? { contentTypeMismatch: fetched.detection.mismatch } : {}),
      ...(fetched.detection?.magicBytes ? { magicBytes: fetched.detection.magicBytes } : {}),
      ...(fetched.redirectChain?.length ? { redirectChain: fetched.redirectChain } : {}),
      byteLength: bytes.byteLength,
      ...(bytes.byteLength > 0 ? { checksum: createHash("sha256").update(bytes).digest("hex") } : {}),
      ...(fetched.artifactSnapshotPath ? { artifactSnapshotPath: fetched.artifactSnapshotPath } : {}),
      attempts: fetched.attempts,
    },
    ...(fetched.detection ? { format_detection: fetched.detection } : {}),
  };
}

function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 5 && new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

function pdfLooksEncrypted(bytes: Uint8Array): boolean {
  return new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.byteLength, 256_000))).includes("/Encrypt");
}

function fetchedLooksHtml(fetched: FetchBytesResult): boolean {
  const prefix = cleanText((fetched.text ?? "").slice(0, 1_000)).toLocaleLowerCase();
  return fetched.contentType.toLocaleLowerCase().includes("html") || /<(?:!doctype\s+html|html|head|body)\b/iu.test(prefix);
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
  pdfBytes?: Uint8Array;
  parser?: SourceContentExtractorOptions["ocrParser"];
}): Promise<{ parsed: ParsedDocument | null; warnings: string[] }> {
  if (process.env.ENABLE_OCR?.trim().toLowerCase() !== "true") {
    return { parsed: null, warnings: ["OCR_DISABLED"] };
  }
  if (input.pdfBytes && !input.parser) return { parsed: null, warnings: ["OCR_PAYLOAD_BINDING_UNAVAILABLE"] };
  const id = sourceId(input.source);
  const workflowId = cleanText(input.source.workflowId) || "unknown-workflow";
  const provider = process.env.OCR_PROVIDER?.trim().toLowerCase();
  const parser =
    input.parser ??
    (provider === "paddleocr" || provider === "paddle"
      ? parseWithPaddleOcr
      : parseWithTesseractOcr);
  try {
    const parsed = await parser(id, workflowId, input.pdfUrl, input.pdfBytes);
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
  const payloadIdentity = readPayloadArticleIdentity(parsed.fullText ?? "", "PDF_TEXT", parsed.title);
  const parsedDoi = payloadIdentity.doi;
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
    ...(parsedDoi ? { artifact_doi: parsedDoi } : {}),
    artifact_identity: payloadIdentity,
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

async function extractSourceContentAtKnownLocation(
  source: ExtractableSource,
  options: SourceContentExtractorOptions = {},
): Promise<ContentExtractionResult> {
  const abstract = sourceAbstract(source);
  const url = chooseReadableUrl(source);
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = fullTextProvider(source.provider);
  const profile = FULL_TEXT_PROVIDER_PROFILES[provider];
  const timeoutMs = options.timeoutMs ?? profile.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const retryCount = Math.max(0, Math.min(profile.maxRetries, options.retryCount ?? profile.maxRetries));
  const backoffMs = Math.max(0, Math.min(3_000, options.backoffMs ?? profile.backoffMs));
  const sleepImpl = options.sleepImpl ?? (async (ms: number) => {
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
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
  const htmlMaxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const pdfMaxBytes = options.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
  const documentMaxBytes = options.maxDocumentBytes ?? DEFAULT_MAX_DOCUMENT_BYTES;
  // The actual format is unknown until bytes arrive. Use the largest bounded
  // format budget for transport, then enforce the detected-format budget below.
  const maxBytes = Math.max(htmlMaxBytes, pdfMaxBytes, documentMaxBytes);
  const fetched = await fetchBytes(url, {
    provider,
    fetchImpl,
    timeoutMs,
    maxBytes,
    retryCount,
    backoffMs,
    sleepImpl,
    artifactSnapshotDirectory: options.artifactSnapshotDirectory,
  });
  const resolverDepth = Math.max(0, Math.floor(options.landingResolverDepth ?? 0));
  for (const attempt of fetched.attempts) {
    attempt.resolutionDepth = resolverDepth;
    attempt.resolutionSignal = options.landingResolutionSignal ?? (resolverDepth === 0 ? "ROOT_ROUTE" : "LANDING_ARTIFACT_LINK");
  }
  if (!fetched.ok) {
    return withDownloadAudit(emptyResult(source, {
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
      method: abstract
        ? "abstract_only"
        : pdfLikely
          ? "pdf_parser"
          : urlLooksLikeDocx(url)
            ? "docx_native"
            : urlLooksLikeEpub(url)
              ? "epub_native"
              : "html_readability",
      warnings: fetched.warnings,
      urlUsed: fetched.url,
      isPdf: pdfLikely,
      failureReason: fetched.warnings[0],
    }), fetched);
  }

  const detectedBudget = fetched.detection?.format === "PDF"
    ? pdfMaxBytes
    : ["JATS_XML", "TEI_XML", "XML"].includes(fetched.detection?.format ?? "")
      ? documentMaxBytes
      : htmlMaxBytes;
  if ((fetched.bytes?.byteLength ?? 0) > detectedBudget) {
    return withDownloadAudit(emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: abstract ? "abstract_only" : "failed",
      warnings: ["DETECTED_FORMAT_MAX_BYTES_EXCEEDED"],
      urlUsed: fetched.url,
      failureReason: "MAX_BYTES_EXCEEDED",
    }), fetched);
  }

  const isDocx =
    urlLooksLikeDocx(fetched.url) ||
    cleanText(fetched.declaredContentType).toLocaleLowerCase().includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const isEpub =
    urlLooksLikeEpub(fetched.url) || cleanText(fetched.declaredContentType).toLocaleLowerCase().includes("application/epub+zip");
  if (isDocx) {
    return withDownloadAudit(await extractionFromDocx({
      source,
      bytes: fetched.bytes ?? new Uint8Array(),
      urlUsed: fetched.url,
      maxChunks,
      maxUncompressedBytes:
        options.maxDocumentUncompressedBytes ?? DEFAULT_MAX_DOCUMENT_UNCOMPRESSED_BYTES,
    }), fetched);
  }
  if (isEpub) {
    return withDownloadAudit(await extractionFromEpub({
      source,
      bytes: fetched.bytes ?? new Uint8Array(),
      urlUsed: fetched.url,
      maxChunks,
      maxUncompressedBytes:
        options.maxDocumentUncompressedBytes ?? DEFAULT_MAX_DOCUMENT_UNCOMPRESSED_BYTES,
    }), fetched);
  }
  const bytes = fetched.bytes ?? new Uint8Array();
  const pdfMagic = hasPdfMagic(bytes);
  const isPdf = fetched.detection?.format === "PDF";
  if (isPdf) {
    if (fetched.detection?.payloadClass === "PDF_INVALID" && fetched.detection.detectionMethod.includes("PDF_EOF_MISSING_TRUNCATED_PAYLOAD")) {
      return withDownloadAudit(emptyResult(source, {
        accessLevel: abstract ? "abstract_only" : "failed_extraction",
        status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
        method: abstract ? "abstract_only" : "pdf_parser",
        warnings: ["TRUNCATED_PDF_PAYLOAD"],
        urlUsed: fetched.url,
        isPdf: true,
        failureReason: "TRUNCATED_PAYLOAD",
      }), fetched);
    }
    if (!pdfMagic) {
      return withDownloadAudit(emptyResult(source, {
        accessLevel: abstract ? "abstract_only" : "failed_extraction",
        status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
        method: abstract ? "abstract_only" : "pdf_parser",
        warnings: [fetchedLooksHtml(fetched) ? "HTML_RETURNED_AS_PDF" : "INVALID_PDF_MAGIC"],
        urlUsed: fetched.url,
        isPdf: true,
        failureReason: fetchedLooksHtml(fetched) ? "HTML_RETURNED_AS_PDF" : "CORRUPT_PDF",
      }), fetched);
    }
    if (pdfLooksEncrypted(bytes)) {
      return withDownloadAudit(emptyResult(source, {
        accessLevel: abstract ? "abstract_only" : "failed_extraction",
        status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
        method: abstract ? "abstract_only" : "pdf_parser",
        warnings: ["ENCRYPTED_PDF"],
        urlUsed: fetched.url,
        isPdf: true,
        failureReason: "ENCRYPTED_PDF",
      }), fetched);
    }
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
      return withDownloadAudit(resultFromParsedDocument(source, grobid, fetched.url, "grobid"), fetched);
    }
    const parserWarnings = [...grobidUnavailableWarnings];
    try {
      const parser = options.pdfParser ?? parseWithPdfminer;
      const parsed = await parser(
        id,
        cleanText(source.workflowId) || "unknown-workflow",
        fetched.url,
        bytes,
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
        if (parsedResult.access_level === "full_text") return withDownloadAudit(parsedResult, fetched);
        parserWarnings.push(...parsedResult.extraction_warnings);
      }
    } catch {
      parserWarnings.push("PDF_PARSE_FAILED");
    }
    if (options.secondaryPdfParser) {
      try {
        const secondaryParsed = await options.secondaryPdfParser(
          id,
          cleanText(source.workflowId) || "unknown-workflow",
          fetched.url,
          bytes,
        );
        if (!secondaryParsed) {
          parserWarnings.push("PDF_SECONDARY_PARSE_EMPTY_TEXT");
        } else {
          const secondaryResult = resultFromParsedDocument(
            source,
            secondaryParsed,
            fetched.url,
            "pdf_parser",
            [...parserWarnings, "PDF_SECONDARY_PARSER_USED"],
          );
          if (secondaryResult.access_level === "full_text") return withDownloadAudit(secondaryResult, fetched);
          parserWarnings.push(...secondaryResult.extraction_warnings);
        }
      } catch {
        parserWarnings.push("PDF_SECONDARY_PARSE_FAILED");
      }
    }
    const ocr = await parseWithOcrIfAvailable({
      source,
      pdfUrl: fetched.url,
      pdfBytes: bytes,
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
      if (ocrResult.access_level === "full_text") return withDownloadAudit(ocrResult, fetched);
      parserWarnings.push(...ocrResult.extraction_warnings);
    } else {
      parserWarnings.push(...ocr.warnings);
    }
    return withDownloadAudit(emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_unavailable_no_parser",
      method: abstract ? "abstract_only" : "pdf_parser",
      warnings: dedupeStrings(parserWarnings),
      urlUsed: fetched.url,
      isPdf: true,
      failureReason: "PDF_TEXT_EXTRACTION_UNAVAILABLE",
    }), fetched);
  }

  const xmlLikely = ["JATS_XML", "TEI_XML", "XML"].includes(fetched.detection?.format ?? "");
  if (xmlLikely) {
    return withDownloadAudit(
      extractionFromStructuredXml(source, fetched.text ?? "", fetched.url, maxChunks),
      fetched,
    );
  }

  if (fetched.detection?.format !== "HTML") {
    return withDownloadAudit(emptyResult(source, {
      accessLevel: abstract ? "abstract_only" : "failed_extraction",
      status: abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
      method: abstract ? "abstract_only" : "html_readability",
      warnings: ["UNSUPPORTED_CONTENT_TYPE"],
      urlUsed: fetched.url,
      failureReason: "UNSUPPORTED_CONTENT_TYPE",
    }), fetched);
  }

  const html = fetched.text ?? "";
  const inspection = inspectScholarlyHtml(html, fetched.url);
  if (["HTML_FULLTEXT", "HTML_ARTICLE"].includes(inspection.payloadClass)) {
    return withDownloadAudit(extractionFromHtml(source, html, fetched.url, maxChunks), fetched);
  }

  const trace = [...(options.landingResolutionTrace ?? [])];
  const visited = new Set((options.landingResolverVisitedUrls ?? []).map((value) => normalizeUrl(value) ?? value));
  const currentUrlKey = normalizeUrl(fetched.url) ?? fetched.url;
  const currentWasVisited = visited.has(currentUrlKey);
  visited.add(currentUrlKey);
  const maxResolverDepth = Math.max(0, Math.min(2, Math.floor(options.landingResolverMaxDepth ?? 2)));
  const terminalShell = ["HTML_LOGIN", "HTML_PAYWALL", "HTML_ERROR"].includes(inspection.payloadClass);
  if (!terminalShell && !currentWasVisited && resolverDepth < maxResolverDepth) {
    let bestResolved: ContentExtractionResult | null = null;
    let bestResolvedRank = -1;
    for (const link of inspection.directArtifactLinks.slice(0, 3)) {
      const linkKey = normalizeUrl(link.url) ?? link.url;
      if (visited.has(linkKey)) {
        trace.push({
          depth: resolverDepth + 1,
          fromUrl: fetched.url,
          toUrl: link.url,
          signal: link.signal,
          outcome: "RESOLUTION_LOOP_DETECTED",
        });
        continue;
      }
      const hopTrace = [...trace, {
        depth: resolverDepth + 1,
        fromUrl: fetched.url,
        toUrl: link.url,
        signal: link.signal,
        outcome: "DIRECT_ARTIFACT_FOLLOWED",
      }];
      const resolved = await extractSourceContentAtKnownLocation({
        ...source,
        url: link.url,
        readableUrl: link.url,
        fullTextUrl: link.url,
      }, {
        ...options,
        resolveFullTextLocations: false,
        landingResolverDepth: resolverDepth + 1,
        landingResolverMaxDepth: maxResolverDepth,
        landingResolverVisitedUrls: [...visited],
        landingResolutionTrace: hopTrace,
        landingResolutionSignal: link.signal,
      });
      const merged: ContentExtractionResult = {
        ...resolved,
        landing_resolution_trace: resolved.landing_resolution_trace ?? hopTrace,
        ...(resolved.download_audit ? {
          download_audit: {
            ...resolved.download_audit,
            attempts: [...fetched.attempts, ...resolved.download_audit.attempts],
          },
        } : {}),
      };
      const rank = extractionRank(merged);
      if (!bestResolved || rank > bestResolvedRank) {
        bestResolved = merged;
        bestResolvedRank = rank;
      }
      if (merged.access_level === "full_text") return merged;
    }
    if (bestResolved) return bestResolved;
  }

  const pdfRouteReturnedHtml = pdfLikely || /pdf/iu.test(cleanText(fetched.declaredContentType));
  if (inspection.payloadClass === "HTML_ABSTRACT_ONLY") {
    return withDownloadAudit(extractionFromHtml(source, html, fetched.url, maxChunks), fetched);
  }
  const failureReason = currentWasVisited
    ? "RESOLUTION_LOOP_DETECTED"
    : resolverDepth >= maxResolverDepth && inspection.directArtifactLinks.length > 0
      ? "RESOLVER_DEPTH_EXCEEDED"
      : pdfRouteReturnedHtml
        ? "HTML_RETURNED_AS_PDF"
        : inspection.payloadClass === "HTML_LOGIN"
          ? "AUTH_REQUIRED"
          : inspection.payloadClass === "HTML_PAYWALL"
            ? "PAYWALL"
            : inspection.payloadClass === "HTML_ERROR"
              ? "HTML_ERROR_PAGE"
              : "LANDING_NO_FULLTEXT_LINK";
  const warnings = dedupeStrings([
    failureReason,
    ...inspection.shellSignals,
    inspection.shellSignals.includes("PUBLISHER_METADATA_SHELL") ? "HTML_PUBLISHER_SHELL_NOT_FULL_TEXT" : "",
    inspection.directArtifactLinks.length === 0 ? "NO_DIRECT_FULLTEXT_SIGNAL" : "",
  ]);
  const unresolved = withDownloadAudit(emptyResult(source, {
    accessLevel: ["AUTH_REQUIRED", "PAYWALL"].includes(failureReason)
      ? "blocked_or_paywalled"
      : abstract ? "abstract_only" : "failed_extraction",
    status: ["AUTH_REQUIRED", "PAYWALL"].includes(failureReason)
      ? "extraction_skipped_license"
      : abstract ? "extraction_skipped_no_full_text" : "extraction_failed",
    method: abstract ? "abstract_only" : "html_readability",
    warnings,
    urlUsed: fetched.url,
    failureReason,
  }), fetched);
  return {
    ...unresolved,
    landing_resolution_trace: trace.length ? trace : [{
      depth: resolverDepth,
      fromUrl: fetched.url,
      signal: options.landingResolutionSignal ?? "ROOT_ROUTE",
      outcome: failureReason,
    }],
  };

}

function contentTypeForResult(result: ContentExtractionResult): string | undefined {
  if (result.extraction_mode === "pdf_text" || result.extraction_mode === "grobid" || result.extraction_mode === "ocr") return "application/pdf";
  if (result.extraction_mode === "html") return "text/html";
  if (result.extraction_mode === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (result.extraction_mode === "epub") return "application/epub+zip";
  if (result.extraction_mode === "xml") return "application/xml+jats";
  if (result.extraction_mode === "abstract") return "text/abstract";
  return undefined;
}

function acquisitionAttemptAudit(
  location: FullTextLocationCandidate,
  result: ContentExtractionResult,
  attempt: number,
  candidateRank: number,
  attemptedAt: string,
  latencyMs: number,
): FullTextResolverRequestAudit[] {
  if (result.download_audit?.attempts.length) {
    return result.download_audit.attempts.map((transport, index) => ({
      candidateRank,
      provider: location.provider,
      url: transport.redirectChain?.[0] ?? location.url,
      status: transport.status,
      ok: transport.result === "SUCCESS",
      attemptedAt: transport.attemptedAt,
      attempt: attempt + index,
      result: transport.result,
      latencyMs: transport.latencyMs,
      retryEligibility: transport.retryEligibility,
      artifactCreated: transport.result === "SUCCESS" && transport.byteLength > 0,
      legalAccess: location.isOpenAccess,
      contentType: transport.contentType || undefined,
      declaredContentType: transport.declaredContentType,
      detectedContentType: transport.detectedContentType,
      detectionMethod: transport.detectionMethod,
      contentTypeMismatch: transport.contentTypeMismatch,
      magicBytes: transport.magicBytes,
      redirectChain: transport.redirectChain,
      resolutionDepth: transport.resolutionDepth,
      resolutionSignal: transport.resolutionSignal,
      resolvedUrl: transport.resolvedUrl,
      phase: "ACQUISITION",
      acquisitionOutcome: transport.outcome,
      bytesDownloaded: transport.byteLength,
      ...(transport.retryAfterMs !== undefined ? { retryAfterMs: transport.retryAfterMs } : {}),
      ...(transport.circuitState ? { circuitState: transport.circuitState } : {}),
      ...(transport.result !== "SUCCESS" ? {
        failureClass: transport.result,
        failureReason: transport.outcome,
      } : {}),
    }));
  }
  const warnings = result.extraction_warnings.join(" ");
  const httpStatus = Number(warnings.match(/HTTP_(\d{3})/u)?.[1] ?? 0);
  const classifiedResult: FullTextResolverRequestAudit["result"] = result.access_level === "full_text"
    ? "SUCCESS"
    : /PROVIDER_CIRCUIT_OPEN/u.test(warnings)
      ? "CIRCUIT_OPEN"
    : /HTTP_(?:404|410)/u.test(warnings)
      ? "NOT_FOUND"
      : /HTTP_(?:401|403|451)|ROBOTS|POLICY|CAPTCHA|CHALLENGE|LOGIN_REQUIRED/u.test(warnings)
        ? "ACCESS_DENIED"
        : /HTTP_429/u.test(warnings)
          ? "RATE_LIMITED"
          : /HTTP_5\d\d/u.test(warnings)
            ? "SERVER_ERROR"
            : /TIMEOUT/u.test(warnings)
              ? "TIMEOUT"
              : /NETWORK|FETCH_FAILED/u.test(warnings)
                ? "NETWORK_ERROR"
                : "NO_USABLE_ARTIFACT";
  const retryEligibility = ["RATE_LIMITED", "SERVER_ERROR", "TIMEOUT", "NETWORK_ERROR"].includes(classifiedResult)
    ? "RETRYABLE"
    : "NOT_RETRYABLE";
  const outcome: FullTextAcquisitionOutcome = /HTTP_401/u.test(warnings)
    ? "HTTP_401"
    : /PROVIDER_CIRCUIT_OPEN/u.test(warnings) ? "PROVIDER_CIRCUIT_OPEN"
    : /HTTP_403/u.test(warnings) ? "HTTP_403"
      : /HTTP_(?:404|410)/u.test(warnings) ? "HTTP_404"
        : /HTTP_429/u.test(warnings) ? "HTTP_429"
          : /CAPTCHA|CHALLENGE/u.test(warnings) ? "ACCESS_BLOCKED"
            : /ROBOTS|POLICY/u.test(warnings) ? "ROBOTS_OR_TOS_BLOCKED"
            : /PAYWALL|LICENSE/u.test(warnings) ? "RIGHTS_OR_LICENSE_BLOCKED"
              : /TIMEOUT/u.test(warnings) ? "PROVIDER_TIMEOUT"
                : /NETWORK|FETCH_FAILED/u.test(warnings) ? "PROVIDER_NETWORK_ERROR"
                  : /HTML_RETURNED_AS_PDF/u.test(warnings) ? "HTML_RETURNED_AS_PDF"
                    : /CORRUPT|INVALID_PDF_MAGIC/u.test(warnings) ? "CORRUPT_PDF"
                      : /ENCRYPTED/u.test(warnings) ? "ENCRYPTED_PDF"
                        : /OCR_FAILED/u.test(warnings) ? "OCR_FAILED"
                          : /OCR_DISABLED|REQUIRES_OCR|PARSE_EMPTY/u.test(warnings) ? "OCR_REQUIRED"
                            : /PUBLISHER_SHELL/u.test(warnings) ? "LANDING_PAGE_ONLY"
                              : result.access_level === "abstract_only" ? "ABSTRACT_ONLY"
                                : result.access_level === "full_text" ? "FULL_TEXT_QUALIFIED"
                                  : "NO_FULL_TEXT_DISCOVERED";
  return [{
    candidateRank,
    provider: location.provider,
    url: location.url,
    status: httpStatus,
    ok: classifiedResult === "SUCCESS",
    attemptedAt,
    attempt,
    result: classifiedResult,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    retryEligibility,
    artifactCreated: false,
    legalAccess: location.isOpenAccess,
    ...(contentTypeForResult(result) ? { contentType: contentTypeForResult(result) } : {}),
    ...(result.provenance.url_used ? { resolvedUrl: result.provenance.url_used } : {}),
    ...(classifiedResult !== "SUCCESS" ? {
      failureClass: classifiedResult,
      failureReason: result.failure_reason ?? (warnings || "NO_USABLE_ARTIFACT"),
    } : {}),
    phase: "ACQUISITION",
    acquisitionOutcome: outcome,
    bytesDownloaded: 0,
  }];
}

function attachAccessAudit(
  result: ContentExtractionResult,
  input: {
    source: ExtractableSource;
    location?: FullTextLocationCandidate;
    resolution?: FullTextResolutionResult;
    manifestationIdentityDecision?: StudyManifestation["identityDecision"];
    manifestationIdentityConfidence?: number;
    manifestationIdentityEvidence?: StudyManifestation["identityEvidence"];
  },
): ContentExtractionResult {
  const initialOutcome: FullTextAcquisitionOutcome = result.access_level === "full_text"
    ? result.extraction_mode === "xml"
      ? result.extraction_method === "tei_xml" ? "XML_TEI_FULL_TEXT_FOUND" : "XML_JATS_FULL_TEXT_FOUND"
      : ["pdf_text", "grobid"].includes(result.extraction_mode)
        ? "MACHINE_TEXT_PDF"
        : result.extraction_mode === "ocr"
          ? "SCANNED_PDF"
          : "HTML_FULL_TEXT_FOUND"
    : /PROVIDER_CIRCUIT_OPEN/u.test(result.extraction_warnings.join(" ")) ? "PROVIDER_CIRCUIT_OPEN"
      : /HTTP_401/u.test(result.extraction_warnings.join(" ")) ? "HTTP_401"
            : /HTTP_403/u.test(result.extraction_warnings.join(" ")) ? "HTTP_403"
              : /HTTP_(?:404|410)/u.test(result.extraction_warnings.join(" ")) ? "HTTP_404"
                : /HTTP_429/u.test(result.extraction_warnings.join(" ")) ? "HTTP_429"
                  : /PUBLISHER_SHELL/u.test(result.extraction_warnings.join(" ")) ? "LANDING_PAGE_ONLY"
                    : /HTML_RETURNED_AS_PDF/u.test(result.extraction_warnings.join(" ")) ? "HTML_RETURNED_AS_PDF"
                      : /CORRUPT|INVALID_PDF_MAGIC/u.test(result.extraction_warnings.join(" ")) ? "CORRUPT_PDF"
                        : /ENCRYPTED/u.test(result.extraction_warnings.join(" ")) ? "ENCRYPTED_PDF"
                          : /OCR_FAILED/u.test(result.extraction_warnings.join(" ")) ? "OCR_FAILED"
                            : /OCR_DISABLED|REQUIRES_OCR|PDF_PARSE_EMPTY_TEXT/u.test(result.extraction_warnings.join(" ")) ? "OCR_REQUIRED"
                              : /PDF_PARSE_FAILED/u.test(result.extraction_warnings.join(" ")) ? "PARSER_FAILED"
                                : /UNSUPPORTED_CONTENT_TYPE/u.test(result.extraction_warnings.join(" ")) ? "INVALID_CONTENT_TYPE"
                                  : /CAPTCHA|CHALLENGE/u.test(result.extraction_warnings.join(" ")) ? "ACCESS_BLOCKED"
                                    : /PAYWALL|LOGIN_REQUIRED|LICENSE/u.test(result.extraction_warnings.join(" ")) ? "RIGHTS_OR_LICENSE_BLOCKED"
                                      : /ROBOTS|POLICY/u.test(result.extraction_warnings.join(" ")) ? "ROBOTS_OR_TOS_BLOCKED"
                                      : result.access_level === "abstract_only" ? "ABSTRACT_ONLY"
                                        : "NO_FULL_TEXT_DISCOVERED";
  const selectedManifestation = input.location
    ? input.resolution?.manifestations.find((manifestation) =>
        manifestation.provenance.routeFingerprint === input.location?.routeFingerprint
      )
    : undefined;
  const qualification = result.access_level === "full_text" || Boolean(result.artifact_identity && result.download_audit?.status === 200)
    ? qualifyFullTextArtifact({
        canonicalIdentity: {
          canonicalStudyId: input.resolution?.canonicalIdentity ?? input.source.canonicalSourceIdentity ?? sourceId(input.source),
          title: input.source.title, doi: input.source.doi, authors: input.source.authors,
          year: input.source.year, venue: input.source.venue, pmid: input.source.pmid,
          pmcid: input.source.pmcid, arxivId: input.source.arxivId, providerIds: input.source.providerIds,
        },
        payloadIdentity: result.artifact_identity ?? {},
        sourceTitle: input.source.title,
        sourceDoi: input.source.doi,
        canonicalWorkId: input.resolution?.canonicalIdentity ?? input.source.canonicalSourceIdentity,
        artifactTitle: result.extracted_title,
        artifactAbstract: result.extracted_abstract,
        artifactDoi: result.artifact_doi,
        artifactText: result.text,
        sections: result.extracted_sections,
        url: result.provenance.url_used,
        contentType: result.download_audit?.contentType || contentTypeForResult(result),
        declaredMime: result.download_audit?.declaredContentType,
        detectedMime: result.download_audit?.detectedContentType,
        formatDetector: result.download_audit?.detectionMethod,
        contentTypeMismatch: result.download_audit?.contentTypeMismatch,
        magicBytes: result.download_audit?.magicBytes,
        redirectChain: result.download_audit?.redirectChain,
        parserUsed: result.extraction_method,
        parserVersion: result.tool_versions.parser ?? result.tool_versions.jats_parser ?? result.tool_versions.tei_parser ?? result.tool_versions.source_content_extractor,
        pageCount: result.page_count,
        publicationVersion: input.location?.version,
        license: input.location?.license,
        isOpenAccess: input.location?.isOpenAccess ?? input.source.isOpenAccess,
        sourceProvider: input.location?.provider ?? "existing_payload",
        accessPath: input.location?.accessPath,
        landingUrl: input.location?.landingUrl,
        repositoryCopy: input.location?.repositoryCopy,
        hostType: input.location?.hostType,
        httpStatus: result.download_audit?.status,
        byteLength: result.download_audit?.byteLength,
        checksum: result.download_audit?.checksum ?? result.content_hash,
        retrievedAt: result.fetched_at,
        initialOutcome,
        manifestationIdentityDecision: selectedManifestation?.identityDecision ?? input.manifestationIdentityDecision,
        manifestationIdentityConfidence: selectedManifestation?.identityConfidence ?? input.manifestationIdentityConfidence,
        manifestationIdentityEvidence: selectedManifestation?.identityEvidence ?? input.manifestationIdentityEvidence,
      })
    : undefined;
  const projected = qualification && !qualification.qualifyingFullText && (result.access_level === "full_text" || qualification.identityMatch === "MISMATCH")
    ? {
        ...emptyResult(input.source, {
          accessLevel: sourceAbstract(input.source) ? "abstract_only" : "failed_extraction",
          status: sourceAbstract(input.source) ? "extraction_skipped_no_full_text" : "extraction_failed",
          method: sourceAbstract(input.source) ? "abstract_only" : result.extraction_method,
          warnings: dedupeStrings([...result.extraction_warnings, qualification.outcome]),
          urlUsed: result.provenance.url_used,
          isPdf: ["pdf_text", "grobid", "ocr"].includes(result.extraction_mode),
          failureReason: qualification.outcome,
        }),
        download_audit: result.download_audit,
        format_detection: result.format_detection,
        landing_resolution_trace: result.landing_resolution_trace,
        artifact_identity: result.artifact_identity,
      }
    : result;
  const resolverRequests = (input.resolution?.requests ?? []).map((request) => ({ ...request }));
  if (input.location && result.download_audit?.attempts.length &&
    !resolverRequests.some((request) => request.phase === "ACQUISITION" && request.url === input.location?.url)) {
    resolverRequests.push(...acquisitionAttemptAudit(
      input.location,
      result,
      resolverRequests.length + 1,
      1,
      result.download_audit.attempts[0]?.attemptedAt ?? result.processing_started_at,
      result.download_audit.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0),
    ));
  }
  if (qualification && !qualification.qualifyingFullText) {
    const selectedAttempt = [...resolverRequests].reverse().find((request) =>
      request.phase === "ACQUISITION" && request.result === "SUCCESS"
    );
    if (selectedAttempt) {
      selectedAttempt.result = "NO_USABLE_ARTIFACT";
      selectedAttempt.failureClass = qualification.outcome;
      selectedAttempt.failureReason = qualification.reason;
      selectedAttempt.acquisitionOutcome = qualification.outcome;
    }
  } else if (qualification?.qualifyingFullText) {
    const selectedAttempt = [...resolverRequests].reverse().find((request) =>
      request.phase === "ACQUISITION" && request.result === "SUCCESS"
    );
    if (selectedAttempt) selectedAttempt.acquisitionOutcome = "FULL_TEXT_QUALIFIED";
  }
  const baseTelemetry = input.resolution?.telemetryEvents ?? [];
  const telemetrySeed = baseTelemetry[0];
  const telemetryEvents = [...baseTelemetry];
  if (input.location) {
    const runId = telemetrySeed?.runId ?? (cleanText(input.source.workflowId) || "UNKNOWN_RUN");
    const caseId = telemetrySeed?.caseId ?? "UNKNOWN_CASE";
    const studyId = telemetrySeed?.studyId ?? sourceId(input.source);
    const routeType = input.location.contentTypeHint ?? "ARTIFACT_OR_LANDING_ROUTE";
    const at = result.processing_started_at;
    telemetryEvents.push({
      event: "OA_ROUTE_VALIDATION_STARTED",
      runId,
      caseId,
      studyId,
      provider: input.location.provider,
      routeType,
      reasonCode: "VALIDATION_STARTED",
      elapsedMs: 0,
      retryCount: Math.max(0, result.download_audit?.attempts.length ?? 1) - 1,
      at,
    });
    if (result.download_audit?.status === 200 && (result.download_audit.byteLength ?? 0) > 0) {
      telemetryEvents.push({
        event: "OA_ARTIFACT_ACQUIRED",
        runId,
        caseId,
        studyId,
        provider: input.location.provider,
        routeType,
        reasonCode: "HTTP_200_PAYLOAD_ACQUIRED",
        elapsedMs: result.download_audit.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0),
        retryCount: Math.max(0, result.download_audit.attempts.length - 1),
        at: result.fetched_at,
      });
    } else if (result.access_level !== "full_text") {
      telemetryEvents.push({
        event: "OA_ROUTE_VALIDATION_FAILED",
        runId,
        caseId,
        studyId,
        provider: input.location.provider,
        routeType,
        reasonCode: result.failure_reason ?? result.extraction_warnings[0] ?? "NO_USABLE_ARTIFACT",
        elapsedMs: result.download_audit?.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0) ?? 0,
        retryCount: Math.max(0, result.download_audit?.attempts.length ?? 1) - 1,
        at: result.fetched_at,
      });
    }
    if (qualification) {
      telemetryEvents.push({
        event: qualification.identityMatch === "MATCH" ? "OA_IDENTITY_MATCHED" : "OA_IDENTITY_MISMATCH",
        runId,
        caseId,
        studyId,
        provider: input.location.provider,
        routeType,
        reasonCode: qualification.artifact.identityEvidence.join("|") || "NO_IDENTITY_EVIDENCE",
        elapsedMs: 0,
        retryCount: 0,
        at: result.fetched_at,
      });
      telemetryEvents.push({
        event: qualification.qualifyingFullText ? "OA_ARTIFACT_QUALIFIED" : "OA_ARTIFACT_REJECTED",
        runId,
        caseId,
        studyId,
        provider: input.location.provider,
        routeType,
        reasonCode: qualification.outcome,
        elapsedMs: 0,
        retryCount: 0,
        at: result.fetched_at,
      });
    }
  }
  let manifestations: StudyManifestation[] | undefined = input.resolution?.manifestations;
  if (selectedManifestation) {
    const detectionFormat = result.format_detection?.format;
    const format = detectionFormat === "HTML"
      ? "FULL_HTML"
      : artifactFormatFromHint(detectionFormat ?? result.download_audit?.detectedContentType ?? result.download_audit?.contentType);
    const normalizedDocument = qualification?.qualifyingFullText && result.extracted_sections.length
      ? normalizedDocumentFromSections({
          format,
          title: result.extracted_title,
          abstract: result.extracted_abstract,
          sections: result.extracted_sections.map((section) => ({
            heading: section.heading,
            text: section.text,
            page: section.page,
          })),
        })
      : undefined;
    const materialized = materializeStudyManifestation({
      manifestation: {
        ...selectedManifestation,
        artifactFormat: format,
      },
      identity: qualification?.artifact.payloadIdentity ?? {
        decision: selectedManifestation.identityDecision,
        confidence: selectedManifestation.identityConfidence,
        evidence: selectedManifestation.identityEvidence,
      },
      contentTypeHeader: result.download_audit?.declaredContentType,
      detectedContentType: result.download_audit?.detectedContentType ?? result.download_audit?.contentType,
      contentLength: result.download_audit?.byteLength,
      checksumSha256: result.download_audit?.checksum,
      fetchedAt: result.fetched_at,
      artifactUrl: result.provenance.url_used,
      artifactSnapshotPath: result.download_audit?.artifactSnapshotPath,
      normalizedDocument,
      qualificationStatus: qualification?.qualifyingFullText ? "QUALIFIED" : "REJECTED",
      qualificationReasons: qualification?.qualifyingFullText ? [qualification.outcome] : [],
      rejectionReasons: qualification?.qualifyingFullText
        ? []
        : [qualification?.outcome ?? initialOutcome, projected.failure_reason ?? "NO_QUALIFYING_ARTIFACT"],
    });
    manifestations = (input.resolution?.manifestations ?? []).map((manifestation) =>
      manifestation.manifestationId === selectedManifestation.manifestationId ? materialized : manifestation
    );
  }
  return {
    ...projected,
    access_audit_v3: buildFullTextAccessAudit({
      accessLevel: projected.access_level,
      extractionMethod: projected.extraction_method,
      extractionStatus: projected.extraction_status,
      warnings: projected.extraction_warnings,
      resolvedUrl: projected.provenance.url_used,
      contentType: result.download_audit?.contentType || contentTypeForResult(result),
      declaredMime: result.download_audit?.declaredContentType,
      detectedMime: result.download_audit?.detectedContentType,
      detectionMethod: result.download_audit?.detectionMethod,
      contentTypeMismatch: result.download_audit?.contentTypeMismatch,
      magicBytes: result.download_audit?.magicBytes,
      redirectChain: result.download_audit?.redirectChain,
      landingResolutionTrace: result.landing_resolution_trace,
      contentLength: result.download_audit?.byteLength ?? projected.text.length,
      text: projected.text,
      sections: projected.extracted_sections,
      contentHash: qualification?.artifact.checksum ?? projected.content_hash,
      accessPath: input.location?.accessPath ?? (projected.provenance.url_used ? ["existing_payload", projected.provenance.url_used] : []),
      resolverRequests,
      oaRouteCandidates: input.resolution?.candidates,
      manifestations,
      providerAvailability: input.resolution?.providerAvailability,
      telemetryEvents,
      retrievedAt: projected.fetched_at,
      failureReason: projected.failure_reason,
      acquisitionOutcome: qualification?.outcome ?? initialOutcome,
      qualification,
    }),
  };
}

function extractionRank(result: ContentExtractionResult): number {
  if (result.access_level === "full_text") return result.extracted_sections.length > 1 ? 6 : 5;
  if (result.access_level === "abstract_only") return 4;
  if (result.access_level === "metadata_only") return 3;
  if (result.access_level === "blocked_or_paywalled") return 2;
  return 1;
}

/**
 * Source-aware bounded acquisition. Resolver endpoints identify legal OA or
 * repository locations from the canonical work identity; the extractor then
 * tries only a small bounded set and preserves every resolver request in the
 * access audit. The legacy one-URL path remains available for deterministic
 * tests and callers that do not opt in.
 */
export async function extractSourceContent(
  source: ExtractableSource,
  options: SourceContentExtractorOptions = {},
): Promise<ContentExtractionResult> {
  if (!options.resolveFullTextLocations) {
    const result = await extractSourceContentAtKnownLocation(source, options);
    return attachAccessAudit(result, {
      source,
      ...(result.provenance.url_used ? {
        location: {
          url: result.provenance.url_used,
          provider: "existing_payload",
          accessPath: ["existing_payload", result.provenance.url_used],
          isOpenAccess: source.isOpenAccess ?? null,
          repositoryCopy: false,
        } satisfies FullTextLocationCandidate,
      } : {}),
      manifestationIdentityDecision: options.manifestationIdentityDecision,
      manifestationIdentityConfidence: options.manifestationIdentityConfidence,
      manifestationIdentityEvidence: options.manifestationIdentityEvidence,
    });
  }
  const resolution = await resolveLegalFullTextLocations({
    doi: source.doi,
    canonicalWorkId: source.canonicalSourceIdentity,
    title: source.title,
    authors: source.authors,
    year: source.year,
    venue: source.venue,
    providerIds: source.providerIds,
    studyPopulation: source.studyPopulation,
    studyDesign: source.studyDesign,
    runId: source.workflowId,
    studyId: source.sourceId ?? source.id,
    url: source.url,
    readableUrl: source.readableUrl,
    fullTextUrl: source.fullTextUrl,
    isOpenAccess: source.isOpenAccess,
  }, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxResolverRequests: options.maxResolverRequests,
    retryCount: options.retryCount,
    backoffMs: options.backoffMs,
    sleepImpl: options.sleepImpl,
  });
  const locations = planLegalFullTextRoutes(resolution.locations)
    .slice(0, Math.max(1, Math.min(6, options.maxResolvedLocations ?? 6)));
  if (locations.length === 0) {
    return attachAccessAudit(await extractSourceContentAtKnownLocation(source, options), {
      source,
      resolution,
      manifestationIdentityDecision: options.manifestationIdentityDecision,
      manifestationIdentityConfidence: options.manifestationIdentityConfidence,
      manifestationIdentityEvidence: options.manifestationIdentityEvidence,
    });
  }
  let best: ContentExtractionResult | null = null;
  let bestLocation: FullTextLocationCandidate | undefined;
  let bestRank = -1;
  const acquisitionRequests = [...resolution.requests];
  for (const [locationIndex, location] of locations.entries()) {
    const attemptedAt = new Date().toISOString();
    const startedAt = Date.now();
    const result = await extractSourceContentAtKnownLocation({
      ...source,
      url: location.url,
      readableUrl: location.url,
      fullTextUrl: location.url,
      isOpenAccess: location.isOpenAccess ?? source.isOpenAccess,
      provider: location.provider,
    }, options);
    acquisitionRequests.push(...acquisitionAttemptAudit(
      location,
      result,
      acquisitionRequests.length + 1,
      locationIndex + 1,
      attemptedAt,
      Date.now() - startedAt,
    ));
    const evaluated = attachAccessAudit(result, {
      source,
      location,
      resolution: { ...resolution, requests: acquisitionRequests },
      manifestationIdentityDecision: options.manifestationIdentityDecision,
      manifestationIdentityConfidence: options.manifestationIdentityConfidence,
      manifestationIdentityEvidence: options.manifestationIdentityEvidence,
    });
    if (evaluated.access_audit_v3?.resolverRequests) {
      acquisitionRequests.splice(
        0,
        acquisitionRequests.length,
        ...evaluated.access_audit_v3.resolverRequests.map((request) => ({ ...request })),
      );
    }
    const rank = extractionRank(evaluated);
    if (!best || rank > bestRank) {
      best = result;
      bestLocation = location;
      bestRank = rank;
    }
    if (evaluated.access_audit_v3?.qualifyingFullText === true) break;
  }
  const selected = best ?? await extractSourceContentAtKnownLocation(source, options);
  return attachAccessAudit(selected, {
    source,
    location: bestLocation,
    resolution: { ...resolution, requests: acquisitionRequests },
    manifestationIdentityDecision: options.manifestationIdentityDecision,
    manifestationIdentityConfidence: options.manifestationIdentityConfidence,
    manifestationIdentityEvidence: options.manifestationIdentityEvidence,
  });
}

export async function extractContentForSources(
  sources: SourceCandidate[],
  options: SourceContentExtractorOptions = {},
): Promise<ContentExtractionResult[]> {
  const results: ContentExtractionResult[] = new Array(sources.length);
  let nextIndex = 0;
  const concurrency = Math.max(1, Math.min(8, Math.floor(options.concurrency ?? 3)));
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
    while (nextIndex < sources.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await extractSourceContent(sources[index]!, options);
    }
  }));
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
        ...(result.access_audit_v3 ? {
          accessState: result.access_audit_v3.accessState,
          contentType: result.access_audit_v3.contentType,
          declaredMime: result.access_audit_v3.declaredMime,
          detectedMime: result.access_audit_v3.detectedMime,
          detectionMethod: result.access_audit_v3.detectionMethod,
          contentTypeMismatch: result.access_audit_v3.contentTypeMismatch,
          magicBytes: result.access_audit_v3.magicBytes,
          redirectChain: result.access_audit_v3.redirectChain,
          landingResolutionTrace: result.access_audit_v3.landingResolutionTrace,
          contentLength: result.access_audit_v3.contentLength,
          textDensity: result.access_audit_v3.textDensity,
          sectionEvidence: result.access_audit_v3.sectionEvidence,
          accessPath: result.access_audit_v3.accessPath,
          checksum: result.access_audit_v3.checksum,
          resolverRequests: result.access_audit_v3.resolverRequests,
          oaRouteCandidates: result.access_audit_v3.oaRouteCandidates,
          manifestations: result.access_audit_v3.manifestations,
          providerAvailability: result.access_audit_v3.providerAvailability,
          telemetryEvents: result.access_audit_v3.telemetryEvents,
          acquisitionOutcome: result.access_audit_v3.acquisitionOutcome,
          qualifyingFullText: result.access_audit_v3.qualifyingFullText,
          qualificationReason: result.access_audit_v3.qualificationReason,
          artifactCreated: Boolean(result.access_audit_v3.artifact),
          legalAccess: result.access_audit_v3.artifact?.rightsStatus === "OPEN"
            ? true
            : result.access_audit_v3.artifact?.rightsStatus === "RESTRICTED"
              ? false
              : null,
          resolvedUrl: result.access_audit_v3.resolvedUrl,
          artifact: result.access_audit_v3.artifact,
        } : {}),
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
