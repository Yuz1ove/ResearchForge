import {
  ClaimCandidateSchema,
  type ClaimCandidate,
  type ClaimType,
  type ClaimUsableSection,
  type SourceCandidate,
} from "@workspace/api-zod/research-grounding";
import { requestLlmText, type LlmServiceSuccess } from "../../llm-service";
import { stableQueryHash, nowIso } from "../workflow/workflowIds";
import type { ExtractedChunk } from "./sourceContentExtractor";

export const CLAIM_EXTRACTION_SYSTEM_PROMPT = [
  "You extract evidence-grounded research claims from a single source chunk.",
  "Return strict JSON only. No markdown. No prose outside JSON.",
  "Each claim must be a single supported claim, not a summary of the whole source.",
  "Never infer beyond the support span. If no supported claim exists, return {\"claims\":[]}.",
  "Reject title restatements, generic topic sentences, and unsupported implications.",
].join(" ");

const CLAIM_TYPES: ClaimType[] = [
  "definition",
  "mechanism",
  "finding",
  "statistic",
  "comparison",
  "limitation",
  "method",
  "background",
];

const CLAIM_SECTIONS: ClaimUsableSection[] = [
  "background",
  "literature_review",
  "method",
  "analysis",
  "discussion",
  "limitation",
];

const DEFAULT_MAX_CHUNKS_PER_SOURCE = 6;
const DEFAULT_MAX_CLAIMS_PER_CHUNK = 3;
const DEFAULT_MAX_TOTAL_CLAIMS = 80;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_LLM_TIMEOUT_MS = 8_000;

export interface ClaimExtractionOptions {
  enableLlm?: boolean;
  maxChunksPerSource?: number;
  maxClaimsPerChunk?: number;
  maxTotalClaims?: number;
  concurrency?: number;
  llmTimeoutMs?: number;
  fetchImpl?: Parameters<typeof requestLlmText>[0]["fetchImpl"];
  requestLlm?: typeof requestLlmText;
  now?: () => string;
}

export interface ExtractClaimsFromChunkInput {
  topic: string;
  source: SourceCandidate;
  chunk: ExtractedChunk;
  sourceIndex: number;
  workflowId: string;
  topicHash?: string;
  jobId?: string;
}

export interface ExtractClaimsForSourcesInput {
  topic: string;
  workflowId: string;
  topicHash?: string;
  jobId?: string;
  sources: SourceCandidate[];
}

interface RawClaim {
  claimTextOriginal?: unknown;
  claimTextZhTw?: unknown;
  claimType?: unknown;
  supportSpanText?: unknown;
  supportSpanStartOffset?: unknown;
  supportSpanEndOffset?: unknown;
  pageStart?: unknown;
  pageEnd?: unknown;
  sectionHeading?: unknown;
  confidence?: unknown;
  relevanceToTopic?: unknown;
  usableSections?: unknown;
  limitations?: unknown;
}

interface ParseClaimsResult {
  claims: RawClaim[];
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function clampScore(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function normalizeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function citationMarkerForSource(source: SourceCandidate, sourceIndex: number): string {
  return cleanText(source.citationMarker) || `[S${sourceIndex + 1}]`;
}

function normalizeClaimType(value: unknown, fallbackText: string): ClaimType {
  if (typeof value === "string" && CLAIM_TYPES.includes(value as ClaimType)) {
    return value as ClaimType;
  }
  const text = fallbackText.toLowerCase();
  if (/limit|limitation|uncertain|bias|不足|限制|侷限|爭議/i.test(text)) return "limitation";
  if (/method|survey|experiment|sample|analysis|方法|問卷|實驗|樣本/i.test(text)) return "method";
  if (/define|definition|means|concept|定義|概念|意指/i.test(text)) return "definition";
  if (/%|\b\d+(?:\.\d+)?\b|statistic|rate|ratio|統計|比例|數據/i.test(text)) return "statistic";
  if (/compare|higher|lower|than|versus|比較|高於|低於|差異/i.test(text)) return "comparison";
  if (/mechanism|pathway|because|mediated|機制|路徑|導致|因為/i.test(text)) return "mechanism";
  if (/result|finding|show|found|indicat|發現|顯示|指出|結果/i.test(text)) return "finding";
  return "background";
}

function defaultSectionsForType(type: ClaimType): ClaimUsableSection[] {
  switch (type) {
    case "definition":
    case "background":
      return ["background", "literature_review", "discussion"];
    case "method":
      return ["method", "literature_review"];
    case "limitation":
      return ["limitation", "discussion", "literature_review"];
    case "statistic":
      return ["analysis", "literature_review", "discussion"];
    default:
      return ["literature_review", "analysis", "discussion"];
  }
}

function normalizeSections(value: unknown, type: ClaimType): ClaimUsableSection[] {
  if (!Array.isArray(value)) return defaultSectionsForType(type);
  const sections = uniqueStrings(value.map((item) => cleanText(item))).filter((item) =>
    CLAIM_SECTIONS.includes(item as ClaimUsableSection),
  ) as ClaimUsableSection[];
  return sections.length ? sections : defaultSectionsForType(type);
}

function titleSimilarity(a: string, b: string): number {
  const tokenize = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3),
    );
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function sourceCannotSupportClaims(source: SourceCandidate): string | null {
  if (source.accessLevel === "metadata_only") return "metadata_only";
  if (source.accessLevel === "failed_extraction") return "extraction_failed";
  if (source.extractionStatus === "extraction_failed") return "extraction_failed";
  if (source.extractionStatus === "extraction_unavailable_no_parser") {
    return "extraction_unavailable_no_parser";
  }
  if (source.canUseForClaims === false) return "can_use_for_claims_false";
  return null;
}

function supportSpanOffset(chunkText: string, supportSpan: string): {
  start?: number;
  end?: number;
  contained: boolean;
} {
  const index = chunkText.toLowerCase().indexOf(supportSpan.toLowerCase());
  if (index < 0) return { contained: false };
  return { start: index, end: index + supportSpan.length, contained: true };
}

function extractionModeForFallback(source: SourceCandidate): ClaimCandidate["extractionMode"] {
  if (source.accessLevel === "metadata_only" || source.extractionMode === "metadata_only") {
    return "metadata_only";
  }
  return "rule_fallback";
}

function validateRawClaim(input: {
  raw: RawClaim;
  claimIndex: number;
  mode: ClaimCandidate["extractionMode"];
  llm?: LlmServiceSuccess;
  now: string;
} & ExtractClaimsFromChunkInput): ClaimCandidate {
  const claimTextOriginal =
    cleanText(input.raw.claimTextOriginal) || cleanText(input.raw.claimTextZhTw);
  const claimTextZhTw =
    cleanText(input.raw.claimTextZhTw) || claimTextOriginal;
  const supportSpanText = cleanText(input.raw.supportSpanText);
  const claimType = normalizeClaimType(input.raw.claimType, `${claimTextOriginal} ${supportSpanText}`);
  const usableSections =
    input.source.recommendationBucket === "official_background"
      ? (["background", "discussion"] as ClaimUsableSection[])
      : normalizeSections(input.raw.usableSections, claimType);
  const confidence = clampScore(
    input.raw.confidence,
    input.mode === "llm" ? 0.62 : input.source.accessLevel === "full_text" ? 0.58 : 0.55,
  );
  const relevanceToTopic = clampScore(input.raw.relevanceToTopic, 0.6);
  const supportOffset = supportSpanText
    ? supportSpanOffset(input.chunk.text, supportSpanText)
    : { contained: false };
  const hardFailure = sourceCannotSupportClaims(input.source);
  const titleRestatement =
    titleSimilarity(claimTextOriginal, input.source.title) >= 0.75 ||
    titleSimilarity(supportSpanText, input.source.title) >= 0.75;
  let status: ClaimCandidate["status"] = "accepted";
  let rejectionReason = "";

  if (!claimTextOriginal) {
    status = "rejected";
    rejectionReason = "missing_claim_text";
  } else if (!supportSpanText) {
    status = "rejected";
    rejectionReason = "missing_support_span";
  } else if (!supportOffset.contained) {
    status = "rejected";
    rejectionReason = "support_span_not_in_chunk";
  } else if (titleRestatement) {
    status = "rejected";
    rejectionReason = "title_restatement";
  } else if (hardFailure) {
    status = "rejected";
    rejectionReason = hardFailure;
  } else if (input.mode === "metadata_only") {
    status = "rejected";
    rejectionReason = "metadata_only_not_core_evidence";
  } else if (confidence < 0.55) {
    status = "needs_review";
    rejectionReason = "low_confidence";
  }

  const claimId = `claim-${stableQueryHash([
    input.workflowId,
    input.source.sourceId,
    input.chunk.chunk_id,
    claimTextOriginal,
    supportSpanText,
    String(input.claimIndex),
  ].join("|")).slice(0, 24)}`;

  const parsed = ClaimCandidateSchema.safeParse({
    claimId,
    sourceId: input.source.sourceId,
    chunkId: input.chunk.chunk_id,
    workflowId: input.workflowId,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    claimTextOriginal,
    claimTextZhTw,
    claimType,
    ...(supportSpanText ? { supportSpanText } : {}),
    ...(typeof supportOffset.start === "number" ? { supportSpanStartOffset: supportOffset.start } : {}),
    ...(typeof supportOffset.end === "number" ? { supportSpanEndOffset: supportOffset.end } : {}),
    ...(typeof normalizeInteger(input.raw.pageStart) === "number"
      ? { pageStart: normalizeInteger(input.raw.pageStart) }
      : typeof input.chunk.page === "number"
        ? { pageStart: input.chunk.page }
        : {}),
    ...(typeof normalizeInteger(input.raw.pageEnd) === "number"
      ? { pageEnd: normalizeInteger(input.raw.pageEnd) }
      : typeof input.chunk.page === "number"
        ? { pageEnd: input.chunk.page }
        : {}),
    sectionHeading:
      cleanText(input.raw.sectionHeading) || cleanText(input.chunk.section_heading) || undefined,
    citationMarker: citationMarkerForSource(input.source, input.sourceIndex),
    confidence,
    relevanceToTopic,
    sourceQualityScore: input.source.sourceQualityScore,
    usableSections,
    limitations: uniqueStrings([
      ...(Array.isArray(input.raw.limitations)
        ? input.raw.limitations.map((item) => cleanText(item))
        : []),
      input.source.accessLevel === "abstract_only" ? "僅取得摘要，不能宣稱已讀全文。" : "",
      input.mode === "rule_fallback" ? "LLM claim extraction unavailable; rule fallback used." : "",
    ]),
    extractionMode: input.mode,
    status,
    ...(rejectionReason ? { rejectionReason } : {}),
    ...(input.llm?.provider ? { modelProvider: input.llm.provider } : {}),
    ...(input.llm?.model ? { modelName: input.llm.model } : {}),
    ...(input.llm?.model ? { modelVersion: input.llm.model } : {}),
    createdAt: input.now,
  });

  if (parsed.success) return parsed.data;
  return {
    claimId,
    sourceId: input.source.sourceId,
    chunkId: input.chunk.chunk_id,
    workflowId: input.workflowId,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    claimTextOriginal: claimTextOriginal || firstSentence(input.chunk.text),
    claimTextZhTw: claimTextZhTw || firstSentence(input.chunk.text),
    claimType,
    supportSpanText: supportSpanText || firstSentence(input.chunk.text),
    citationMarker: citationMarkerForSource(input.source, input.sourceIndex),
    confidence: 0,
    relevanceToTopic: 0,
    sourceQualityScore: input.source.sourceQualityScore,
    usableSections,
    limitations: ["claim_candidate_schema_validation_failed"],
    extractionMode: input.mode,
    status: "rejected",
    rejectionReason: "schema_validation_failed",
    createdAt: input.now,
  };
}

function firstSentence(value: string, limit = 260): string {
  const text = cleanText(value);
  const sentence = text.split(/(?<=[。！？.!?])\s+/u)[0]?.trim() ?? text;
  return sentence.length > limit ? `${sentence.slice(0, limit - 1)}...` : sentence;
}

function parseClaimsJson(content: string): ParseClaimsResult | null {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) return { claims: parsed as RawClaim[] };
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as { claims?: unknown }).claims)) {
      return { claims: (parsed as { claims: RawClaim[] }).claims };
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as { claims?: unknown };
      if (Array.isArray(parsed.claims)) return { claims: parsed.claims as RawClaim[] };
    } catch {
      return null;
    }
  }
  return null;
}

function claimExtractionUserPrompt(input: ExtractClaimsFromChunkInput, maxClaims: number): string {
  return JSON.stringify({
    instruction:
      "Extract up to maxClaims evidence-grounded claims. The supportSpanText must be copied exactly from chunkText.",
    outputSchema: {
      claims: [
        {
          claimTextOriginal: "single supported claim in source language",
          claimTextZhTw: "Traditional Chinese rendering of the claim",
          claimType: CLAIM_TYPES,
          supportSpanText: "exact contiguous text copied from chunkText",
          confidence: "0..1",
          relevanceToTopic: "0..1",
          usableSections: CLAIM_SECTIONS,
          limitations: ["optional limitation strings"],
        },
      ],
    },
    hardRules: [
      "No supportSpanText means no accepted claim.",
      "Do not restate the source title as a claim.",
      "Do not summarize the whole chunk as one claim.",
      "Do not infer causality or mechanism unless the support span states it.",
      "If confidence would be below 0.55, still include the claim with confidence below 0.55.",
      "If no supported claim exists, return {\"claims\":[]}.",
    ],
    maxClaims,
    topic: input.topic,
    source: {
      sourceId: input.source.sourceId,
      title: input.source.title,
      year: input.source.year,
      venue: input.source.venue,
      provider: input.source.provider,
      accessLevel: input.source.accessLevel,
      extractionStatus: input.source.extractionStatus,
      extractionMode: input.source.extractionMode,
    },
    chunk: {
      chunkId: input.chunk.chunk_id,
      location: input.chunk.source_location,
      sectionHeading: input.chunk.section_heading,
      page: input.chunk.page,
      chunkText: input.chunk.text,
    },
  });
}

function ruleFallbackRawClaim(chunk: ExtractedChunk, source: SourceCandidate): RawClaim | null {
  const sentence = firstSentence(chunk.text);
  if (!sentence || sentence.length < 40) return null;
  const type = normalizeClaimType(undefined, `${chunk.section_heading ?? ""} ${sentence}`);
  return {
    claimTextOriginal: sentence,
    claimTextZhTw: sentence,
    claimType: type,
    supportSpanText: sentence,
    confidence: source.accessLevel === "full_text" ? 0.58 : 0.55,
    relevanceToTopic: Math.max(0.45, source.relevanceScore ?? 0.55),
    usableSections: defaultSectionsForType(type),
    limitations: ["rule_fallback_claim_extraction"],
  };
}

function chunksForSource(source: SourceCandidate, maxChunks: number): ExtractedChunk[] {
  const chunks = source.extractedChunks ?? [];
  if (chunks.length > 0) return chunks.slice(0, maxChunks);
  const abstract = cleanText(source.extractedAbstract) || cleanText(source.abstractOriginal) || cleanText(source.abstract);
  if (!abstract) return [];
  return [
    {
      chunk_id: `${source.sourceId}:abstract:1`,
      text: abstract,
      source_location: "abstract",
      section_heading: "Abstract",
      char_start: 0,
      char_end: abstract.length,
    },
  ];
}

export async function extractClaimsFromChunk(
  input: ExtractClaimsFromChunkInput,
  options: ClaimExtractionOptions = {},
): Promise<ClaimCandidate[]> {
  const now = options.now?.() ?? nowIso();
  const maxClaimsPerChunk = Math.max(1, options.maxClaimsPerChunk ?? DEFAULT_MAX_CLAIMS_PER_CHUNK);
  const hardFailure = sourceCannotSupportClaims(input.source);
  if (hardFailure) {
    const fallback = ruleFallbackRawClaim(input.chunk, input.source);
    return fallback
      ? [
          validateRawClaim({
            ...input,
            raw: fallback,
            claimIndex: 0,
            mode: extractionModeForFallback(input.source),
            now,
          }),
        ]
      : [];
  }

  const enableLlm = options.enableLlm ?? process.env.ENABLE_CLAIM_EXTRACTION_LLM !== "false";
  if (!enableLlm) {
    const fallback = ruleFallbackRawClaim(input.chunk, input.source);
    return fallback
      ? [
          validateRawClaim({
            ...input,
            raw: fallback,
            claimIndex: 0,
            mode: "rule_fallback",
            now,
          }),
        ]
      : [];
  }

  const request = options.requestLlm ?? requestLlmText;
  const llmTimeoutMs =
    options.llmTimeoutMs ??
    (Number.isFinite(Number(process.env.CLAIM_EXTRACTION_TIMEOUT_MS))
      ? Number(process.env.CLAIM_EXTRACTION_TIMEOUT_MS)
      : DEFAULT_LLM_TIMEOUT_MS);
  let lastLlm: LlmServiceSuccess | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await request({
        operation: "claim_extraction",
        featureName: "research_grounding_claim_extraction",
        purpose: "summarizer",
        messages: [
          { role: "system", content: CLAIM_EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              attempt === 0
                ? claimExtractionUserPrompt(input, maxClaimsPerChunk)
                : `${claimExtractionUserPrompt(input, maxClaimsPerChunk)}\nReturn valid JSON only.`,
          },
        ],
        temperature: 0,
        maxTokens: 900,
        responseFormat: "json_object",
        llm: { timeoutMs: llmTimeoutMs },
        fetchImpl: options.fetchImpl,
      });
      lastLlm = response;
      const parsed = parseClaimsJson(response.content);
      if (!parsed) continue;
      return parsed.claims.slice(0, maxClaimsPerChunk).map((raw, claimIndex) =>
        validateRawClaim({
          ...input,
          raw,
          claimIndex,
          mode: "llm",
          llm: lastLlm,
          now,
        }),
      );
    } catch {
      break;
    }
  }

  const fallback = ruleFallbackRawClaim(input.chunk, input.source);
  return fallback
    ? [
        validateRawClaim({
          ...input,
          raw: fallback,
          claimIndex: 0,
          mode: "rule_fallback",
          now,
        }),
      ]
    : [];
}

async function runLimited<T>(
  items: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await items[index]!();
    }
  });
  await Promise.all(workers);
  return results;
}

export async function extractClaimsForSources(
  input: ExtractClaimsForSourcesInput,
  options: ClaimExtractionOptions = {},
): Promise<ClaimCandidate[]> {
  const maxChunksPerSource = Math.max(1, options.maxChunksPerSource ?? DEFAULT_MAX_CHUNKS_PER_SOURCE);
  const maxTotalClaims = Math.max(1, options.maxTotalClaims ?? DEFAULT_MAX_TOTAL_CLAIMS);
  const tasks: Array<() => Promise<ClaimCandidate[]>> = [];

  input.sources.forEach((source, sourceIndex) => {
    chunksForSource(source, maxChunksPerSource).forEach((chunk) => {
      tasks.push(() =>
        extractClaimsFromChunk(
          {
            topic: input.topic,
            source,
            chunk,
            sourceIndex,
            workflowId: input.workflowId,
            topicHash: input.topicHash,
            jobId: input.jobId,
          },
          options,
        ),
      );
    });
  });

  const nested = await runLimited(tasks, options.concurrency ?? DEFAULT_CONCURRENCY);
  return nested.flat().slice(0, maxTotalClaims);
}

export function acceptedClaimCandidates(claims: ClaimCandidate[]): ClaimCandidate[] {
  const seen = new Set<string>();
  return claims
    .filter((claim) => claim.status === "accepted" && Boolean(cleanText(claim.supportSpanText)))
    .sort((a, b) =>
      (b.confidence * 0.55 + b.relevanceToTopic * 0.35 + (b.sourceQualityScore ?? 0.5) * 0.1) -
      (a.confidence * 0.55 + a.relevanceToTopic * 0.35 + (a.sourceQualityScore ?? 0.5) * 0.1),
    )
    .filter((claim) => {
      const key = `${claim.sourceId}:${cleanText(claim.claimTextOriginal).toLowerCase()}:${cleanText(
        claim.supportSpanText,
      ).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
