import {
  ClaimCandidateSchema,
  StructuredStudyFactSchema,
  type ClaimCandidate,
  type ClaimType,
  type ClaimUsableSection,
  type SourceCandidate,
  type StructuredStudyFact,
} from "@workspace/api-zod/research-grounding";
import { requestLlmText, type LlmServiceSuccess } from "../../llm-service";
import { stableQueryHash, nowIso } from "../workflow/workflowIds";
import type { ExtractedChunk } from "./sourceContentExtractor";
import {
  cleanExtractedTextChunk,
  topicOverlapTerms,
} from "./evidencePipelineGuards";
import {
  extractStudyFactEnvelopeV2,
  type StudyDocumentInputV2,
} from "../study-fact-extraction-v2";

export const CLAIM_EXTRACTION_SYSTEM_PROMPT = [
  "You perform two-stage evidence extraction from a single source chunk.",
  "Stage 1 extracts structured study facts with exact per-field provenance. Stage 2 constructs claims only from admitted Stage 1 facts.",
  "Return strict JSON only. No markdown. No prose outside JSON.",
  "Each claim must be a single supported claim, not a summary of the whole source.",
  'Never infer beyond the support span. If no supported claim exists, return {"claims":[]}.',
  "Reject title restatements, generic topic sentences, and unsupported implications.",
  "Reject navigation, cookie, menu, moved-notice, publisher-shell, and unrelated-domain text.",
  "The supportSpanText must be copied exactly from chunkText and must directly support claimTextOriginal.",
  "Do not use outside knowledge or complete missing facts.",
  "Before selecting claims, inspect which source-supported facets are present: objective, population, sample size, method, exposure or intervention, comparator, primary and secondary outcomes, quantitative results, mechanism, moderator, limitation, uncertainty, author interpretation, generalizability boundary, and conflicts.",
  "When several distinct supported facets are present, prefer facet diversity over repeated headline findings or synonymous conclusion restatements.",
  "A facet absent from the source must not be generated; omission is safer than inference.",
  "Never infer design from title, method from conclusion, population from topic, effect direction from p-value alone, or moderator status from a measured characteristic.",
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
const DEFAULT_LLM_TIMEOUT_MS = 20_000;

export interface ClaimExtractionOptions {
  enableLlm?: boolean;
  maxChunksPerSource?: number;
  maxClaimsPerChunk?: number;
  maxTotalClaims?: number;
  concurrency?: number;
  llmTimeoutMs?: number;
  llmMaxTokens?: number;
  llmFeatureName?: string;
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
  structuredStudyFact?: unknown;
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
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : undefined;
}

const PROVENANCE_REQUIRED_STUDY_FIELDS = [
  "studyDesign", "population", "populationDescription", "populationAgeMin",
  "populationAgeMax", "populationAgeMean", "populationSampleSize",
  "populationLocation", "populationSetting", "exposure", "exposureDefinition",
  "exposureMeasurement", "exposureTiming", "exposureDuration", "comparator",
  "comparatorDefinition", "outcome", "outcomeDefinition", "outcomeMeasurement",
  "outcomeTimepoint", "effectDirection", "effectDirectionConfidence",
  "adjustedOrUnadjusted", "primaryResult",
  "covariates", "confounders", "secondaryResults", "limitations", "authorCautions",
] as const;

function contentAccessForStudyFact(source: SourceCandidate): StructuredStudyFact["contentAccessLevel"] {
  if (source.accessLevel === "full_text") {
    return source.extractionStatus === "partial" ? "partial_full_text" : "full_text";
  }
  if (source.accessLevel === "abstract_only") return "abstract_only";
  return "metadata_only";
}

function exactFactProvenance(
  value: unknown,
  chunkText: string,
  sourceId: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const span = cleanText(record.sourceSpanText);
  if (!span || !chunkText.toLocaleLowerCase().includes(span.toLocaleLowerCase())) return null;
  return {
    sourceId,
    sourceSpanText: span,
    sectionOrLocation: cleanText(record.sectionOrLocation) || null,
    page: normalizeInteger(record.page) ?? null,
    confidence: clampScore(record.confidence, 0.55),
    extractionMethod: record.extractionMethod === "manual_review"
      ? "manual_review"
      : record.extractionMethod === "deterministic_exact_span"
        ? "deterministic_exact_span"
        : "llm_structured_fact",
  };
}

function normalizeStructuredStudyFact(input: {
  raw: unknown;
  source: SourceCandidate;
  chunk: ExtractedChunk;
}): StructuredStudyFact | undefined {
  if (!input.raw || typeof input.raw !== "object" || Array.isArray(input.raw)) return undefined;
  const raw = input.raw as Record<string, unknown>;
  const rawProvenance = raw.fieldProvenance && typeof raw.fieldProvenance === "object" && !Array.isArray(raw.fieldProvenance)
    ? raw.fieldProvenance as Record<string, unknown>
    : {};
  const fieldProvenance: Record<string, Record<string, unknown>> = {};
  for (const field of PROVENANCE_REQUIRED_STUDY_FIELDS) {
    const provenance = exactFactProvenance(rawProvenance[field], input.chunk.text, input.source.sourceId);
    const hasValue = raw[field] !== null && raw[field] !== undefined && raw[field] !== "" && raw[field] !== "unknown" && raw[field] !== "unclear";
    if (hasValue && !provenance) raw[field] = field === "studyDesign" ? "unknown" : field === "effectDirection" ? "unclear" : null;
    if (provenance) fieldProvenance[field] = provenance;
  }
  const normalizeRoleFacts = (value: unknown, allowedRole: string) =>
    (Array.isArray(value) ? value : []).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (record.role !== allowedRole && !(allowedRole === "moderator" && record.role === "subgroup")) return [];
      const provenance = exactFactProvenance(record.provenance, input.chunk.text, input.source.sourceId);
      const factor = cleanText(record.factor);
      return provenance && factor ? [{ factor, role: record.role, effect: cleanText(record.effect) || null, provenance }] : [];
    });
  const quantitativeFacts = (Array.isArray(raw.quantitativeFacts) ? raw.quantitativeFacts : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const provenance = exactFactProvenance(record.provenance, input.chunk.text, input.source.sourceId);
    return provenance ? [{ ...record, provenance }] : [];
  });
  const access = contentAccessForStudyFact(input.source);
  const parsed = StructuredStudyFactSchema.safeParse({
    ...raw,
    studyId: input.source.doi ?? input.source.sourceId,
    sourceId: input.source.sourceId,
    title: input.source.title,
    authors: input.source.authors ?? null,
    year: input.source.year ?? null,
    venue: input.source.venue ?? null,
    doi: input.source.doi ?? null,
    url: input.source.url ?? null,
    evidenceLevel: input.source.formalEvidenceRole ?? input.source.sourceRole ?? null,
    contentAccessLevel: access,
    metadataOnly: access === "metadata_only",
    abstractAvailable: Boolean(input.source.abstract || input.source.abstractOriginal || input.source.extractedAbstract),
    fullTextAvailable: access === "partial_full_text" || access === "full_text",
    studyDesign: raw.studyDesign ?? "unknown",
    studyDesignExplicit: Boolean(raw.studyDesignExplicit && raw.studyDesign !== "unknown" && fieldProvenance.studyDesign),
    effectDirection: raw.effectDirection ?? "unclear",
    adjustedOrUnadjusted: raw.adjustedOrUnadjusted ?? "unknown",
    covariates: Array.isArray(raw.covariates) && fieldProvenance.covariates ? raw.covariates : [],
    confounders: Array.isArray(raw.confounders) && fieldProvenance.confounders ? raw.confounders : [],
    moderators: normalizeRoleFacts(raw.moderators, "moderator"),
    mediators: normalizeRoleFacts(raw.mediators, "mediator"),
    subgroups: normalizeRoleFacts(raw.subgroups, "subgroup"),
    secondaryResults: Array.isArray(raw.secondaryResults) && fieldProvenance.secondaryResults ? raw.secondaryResults : [],
    limitations: Array.isArray(raw.limitations) && fieldProvenance.limitations ? raw.limitations : [],
    authorCautions: Array.isArray(raw.authorCautions) && fieldProvenance.authorCautions ? raw.authorCautions : [],
    quantitativeFacts,
    fieldProvenance,
    evidenceConfidence: clampScore(raw.evidenceConfidence, 0.55),
    extractionMethod: raw.extractionMethod === "manual_review"
      ? "manual_review"
      : raw.extractionMethod === "deterministic_exact_span"
        ? "deterministic_exact_span"
        : "llm_structured_fact",
  });
  return parsed.success ? parsed.data : undefined;
}

function citationMarkerForSource(
  source: SourceCandidate,
  sourceIndex: number,
): string {
  return cleanText(source.citationMarker) || `[S${sourceIndex + 1}]`;
}

function normalizeClaimType(value: unknown, fallbackText: string): ClaimType {
  if (typeof value === "string" && CLAIM_TYPES.includes(value as ClaimType)) {
    return value as ClaimType;
  }
  const text = fallbackText.toLowerCase();
  if (/limit|limitation|uncertain|bias|不足|限制|侷限|爭議/i.test(text))
    return "limitation";
  if (
    /method|survey|experiment|sample|analysis|方法|問卷|實驗|樣本/i.test(text)
  )
    return "method";
  if (/define|definition|means|concept|定義|概念|意指/i.test(text))
    return "definition";
  if (/%|\b\d+(?:\.\d+)?\b|statistic|rate|ratio|統計|比例|數據/i.test(text))
    return "statistic";
  if (/compare|higher|lower|than|versus|比較|高於|低於|差異/i.test(text))
    return "comparison";
  if (/mechanism|pathway|because|mediated|機制|路徑|導致|因為/i.test(text))
    return "mechanism";
  if (/result|finding|show|found|indicat|發現|顯示|指出|結果/i.test(text))
    return "finding";
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

function normalizeSections(
  value: unknown,
  type: ClaimType,
): ClaimUsableSection[] {
  if (!Array.isArray(value)) return defaultSectionsForType(type);
  const sections = uniqueStrings(value.map((item) => cleanText(item))).filter(
    (item) => CLAIM_SECTIONS.includes(item as ClaimUsableSection),
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
  if (source.extractionStatus === "extraction_failed")
    return "extraction_failed";
  if (source.extractionStatus === "extraction_unavailable_no_parser") {
    return "extraction_unavailable_no_parser";
  }
  if (source.canUseForClaims === false) return "can_use_for_claims_false";
  return null;
}

function supportSpanOffset(
  chunkText: string,
  supportSpan: string,
): {
  start?: number;
  end?: number;
  contained: boolean;
} {
  const index = chunkText.toLowerCase().indexOf(supportSpan.toLowerCase());
  if (index < 0) return { contained: false };
  return { start: index, end: index + supportSpan.length, contained: true };
}

function extractionModeForFallback(
  source: SourceCandidate,
): ClaimCandidate["extractionMode"] {
  if (
    source.accessLevel === "metadata_only" ||
    source.extractionMode === "metadata_only"
  ) {
    return "metadata_only";
  }
  return "rule_fallback";
}

function rejectedChunkClaim(input: {
  input: ExtractClaimsFromChunkInput;
  reason: string;
  diagnostics: string[];
  now: string;
}): ClaimCandidate {
  const fallbackText = firstSentence(input.input.chunk.text) || input.reason;
  const claimId = `claim-${stableQueryHash(
    [
      input.input.workflowId,
      input.input.source.sourceId,
      input.input.chunk.chunk_id,
      input.reason,
    ].join("|"),
  ).slice(0, 24)}`;
  return {
    claimId,
    sourceId: input.input.source.sourceId,
    chunkId: input.input.chunk.chunk_id,
    workflowId: input.input.workflowId,
    ...(input.input.jobId ? { jobId: input.input.jobId } : {}),
    claimTextOriginal: fallbackText,
    claimTextZhTw: fallbackText,
    claimType: "background",
    citationMarker: citationMarkerForSource(
      input.input.source,
      input.input.sourceIndex,
    ),
    confidence: 0,
    relevanceToTopic: 0,
    sourceQualityScore: input.input.source.sourceQualityScore,
    usableSections: ["background"],
    limitations: input.diagnostics,
    extractionMode: extractionModeForFallback(input.input.source),
    status: "rejected",
    rejectionReason: input.reason,
    createdAt: input.now,
  };
}

function validateRawClaim(
  input: {
    raw: RawClaim;
    claimIndex: number;
    mode: ClaimCandidate["extractionMode"];
    llm?: LlmServiceSuccess;
    now: string;
  } & ExtractClaimsFromChunkInput,
): ClaimCandidate {
  const claimTextOriginal =
    cleanText(input.raw.claimTextOriginal) ||
    cleanText(input.raw.claimTextZhTw);
  const claimTextZhTw = cleanText(input.raw.claimTextZhTw) || claimTextOriginal;
  const supportSpanText = cleanText(input.raw.supportSpanText);
  const claimType = normalizeClaimType(
    input.raw.claimType,
    `${claimTextOriginal} ${supportSpanText}`,
  );
  const usableSections =
    input.source.recommendationBucket === "official_background"
      ? (["background", "discussion"] as ClaimUsableSection[])
      : normalizeSections(input.raw.usableSections, claimType);
  const confidence = clampScore(
    input.raw.confidence,
    input.mode === "llm"
      ? 0.62
      : input.source.accessLevel === "full_text"
        ? 0.58
        : 0.55,
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

  const claimId = `claim-${stableQueryHash(
    [
      input.workflowId,
      input.source.sourceId,
      input.chunk.chunk_id,
      claimTextOriginal,
      supportSpanText,
      String(input.claimIndex),
    ].join("|"),
  ).slice(0, 24)}`;

  const structuredStudyFact = normalizeStructuredStudyFact({
    raw: input.raw.structuredStudyFact,
    source: input.source,
    chunk: input.chunk,
  });
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
    ...(typeof supportOffset.start === "number"
      ? { supportSpanStartOffset: supportOffset.start }
      : {}),
    ...(typeof supportOffset.end === "number"
      ? { supportSpanEndOffset: supportOffset.end }
      : {}),
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
      cleanText(input.raw.sectionHeading) ||
      cleanText(input.chunk.section_heading) ||
      undefined,
    citationMarker: citationMarkerForSource(input.source, input.sourceIndex),
    confidence,
    relevanceToTopic,
    sourceQualityScore: input.source.sourceQualityScore,
    usableSections,
    limitations: uniqueStrings([
      ...(Array.isArray(input.raw.limitations)
        ? input.raw.limitations.map((item) => cleanText(item))
        : []),
      input.source.accessLevel === "abstract_only"
        ? "僅取得摘要，不能宣稱已讀全文。"
        : "",
      input.mode === "rule_fallback"
        ? "LLM claim extraction unavailable; rule fallback used."
        : "",
    ]),
    ...(structuredStudyFact ? { structuredStudyFact } : {}),
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
  return sentence.length > limit
    ? `${sentence.slice(0, limit - 1)}...`
    : sentence;
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
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { claims?: unknown }).claims)
    ) {
      return { claims: (parsed as { claims: RawClaim[] }).claims };
    }
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]) as { claims?: unknown };
      if (Array.isArray(parsed.claims))
        return { claims: parsed.claims as RawClaim[] };
    } catch {
      return null;
    }
  }
  return null;
}

function claimExtractionUserPrompt(
  input: ExtractClaimsFromChunkInput,
  maxClaims: number,
): string {
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
          structuredStudyFact: {
            instruction: "Stage 1 facts only. Use null/unknown when absent. Every non-null field needs fieldProvenance with an exact sourceSpanText from chunkText.",
            studyDesign: "allowed enum or unknown",
            studyDesignExplicit: "boolean",
            population: "string or null",
            populationDescription: "string or null",
            populationAgeMin: "number or null",
            populationAgeMax: "number or null",
            populationAgeMean: "number or null",
            populationSampleSize: "integer or null",
            populationLocation: "string or null",
            populationSetting: "string or null",
            exposure: "string or null",
            exposureDefinition: "string or null",
            exposureMeasurement: "string or null",
            exposureTiming: "string or null",
            exposureDuration: "string or null",
            comparator: "string or null",
            comparatorDefinition: "string or null",
            outcome: "string or null",
            outcomeDefinition: "string or null",
            outcomeMeasurement: "string or null",
            outcomeTimepoint: "string or null",
            effectDirection: ["positive", "negative", "null", "mixed", "nonlinear", "not_applicable", "unclear"],
            effectDirectionConfidence: "0..1 or null",
            adjustedOrUnadjusted: ["adjusted", "unadjusted", "mixed", "unknown"],
            covariates: [], confounders: [], moderators: [], mediators: [], subgroups: [],
            primaryResult: "string or null", secondaryResults: [], limitations: [], authorCautions: [],
            quantitativeFacts: [],
            fieldProvenance: { fieldName: { sourceSpanText: "exact contiguous source text", sectionOrLocation: "string or null", page: "number or null", confidence: "0..1", extractionMethod: "llm_structured_fact" } },
            evidenceConfidence: "0..1", extractionMethod: "llm_structured_fact",
          },
        },
      ],
    },
    hardRules: [
      "No supportSpanText means no accepted claim.",
      "supportSpanText must be an exact contiguous substring of chunkText.",
      "Do not restate the source title as a claim.",
      "Do not summarize the whole chunk as one claim.",
      "Do not infer causality or mechanism unless the support span states it.",
      "Stage 2 claimText may use only facts admitted in structuredStudyFact and the same exact support span.",
      "A variable is a moderator only when moderation, interaction, stratified, or subgroup difference is explicit; do not relabel ordinary characteristics or covariates.",
      "Do not infer study design from the title or infer methods from a conclusion.",
      'Reject unrelated chunks; for unrelated chunks return {"claims":[]}.',
      'Reject navigation / moved notice / publisher shell chunks; return {"claims":[]}.',
      "If confidence would be below 0.55, still include the claim with confidence below 0.55.",
      'If no supported claim exists, return {"claims":[]}.',
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

const FALLBACK_CLAIM_SIGNAL =
  /顯示|指出|說明|依賴|應用|应用|廣泛|广泛|能量密度|安全性|回收|支持|支撐|影響|相關|發現|結果|方法|限制|because|depend|show|indicate|support|use|application|method|result|finding|limit/i;

function isSubstantiveFallbackSentence(sentence: string): boolean {
  const cjkChars = Array.from(sentence.matchAll(/[\u3400-\u9fff]/gu)).length;
  return sentence.length >= 40 || cjkChars >= 18;
}

function supportSentenceCandidates(text: string): string[] {
  const normalized = cleanText(text);
  if (!normalized) return [];
  const sentences = normalized
    .split(/(?<=[。！？.!?；;])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(isSubstantiveFallbackSentence)
    .map((sentence) =>
      sentence.length > 420 ? sentence.slice(0, 420).trim() : sentence,
    );
  if (sentences.length > 0) return uniqueStrings(sentences);
  const fallback = firstSentence(normalized, 420);
  return isSubstantiveFallbackSentence(fallback) ? [fallback] : [];
}

function fallbackSentenceScore(input: {
  sentence: string;
  topic: string;
  source: SourceCandidate;
  index: number;
}): number {
  const sentenceOverlap = topicOverlapTerms(input.topic, input.sentence).length;
  const titleOverlap = topicOverlapTerms(
    input.topic,
    input.source.title ?? "",
  ).length;
  const signalBonus = FALLBACK_CLAIM_SIGNAL.test(input.sentence) ? 1.5 : 0;
  const numberBonus = /\d|%/u.test(input.sentence) ? 0.5 : 0;
  return (
    sentenceOverlap * 2 +
    Math.min(titleOverlap, 3) * 0.25 +
    signalBonus +
    numberBonus -
    input.index * 0.05
  );
}

function deterministicStructuredStudyFact(
  sentence: string,
  chunk: ExtractedChunk,
  source: SourceCandidate,
): Record<string, unknown> {
  const provenance = (confidence = 0.72) => ({
    sourceId: source.sourceId,
    sourceSpanText: sentence,
    sectionOrLocation: chunk.section_heading ?? chunk.source_location,
    page: chunk.page ?? null,
    confidence,
    extractionMethod: "deterministic_exact_span",
  });
  const fieldProvenance: Record<string, unknown> = {};
  const explicitDesign: Array<[string, RegExp]> = [
    ["randomized_controlled_trial", /randomi[sz]ed controlled trial|\bRCT\b|隨機對照/iu],
    ["quasi_experimental", /quasi[- ]experimental|準實驗/iu],
    ["prospective_cohort", /prospective cohort|前瞻(?:性)?世代/iu],
    ["retrospective_cohort", /retrospective cohort|回溯(?:性)?世代/iu],
    ["cross_sectional", /cross[- ]sectional|橫斷/iu],
    ["case_control", /case[- ]control|病例對照/iu],
    ["longitudinal_observational", /longitudinal|縱貫|追蹤研究/iu],
    ["systematic_review", /systematic review|系統性回顧/iu],
    ["meta_analysis", /meta[- ]analysis|統合分析/iu],
    ["scoping_review", /scoping review|範疇性回顧/iu],
    ["qualitative", /qualitative study|質性研究/iu],
    ["mixed_methods", /mixed[- ]methods|混合方法/iu],
    ["simulation", /simulation study|數值模擬|模擬研究/iu],
    ["benchmark", /benchmark(?:ing)? study|基準測試/iu],
    ["technical_evaluation", /technical evaluation|技術評估/iu],
    ["experimental_lab", /laboratory experiment|lab experiment|實驗室實驗/iu],
  ];
  const studyDesign = explicitDesign.find(([, pattern]) => pattern.test(sentence))?.[0] ?? "unknown";
  if (studyDesign !== "unknown") fieldProvenance.studyDesign = provenance();
  const sampleMatch = sentence.match(/(?:\bn\s*[=:]\s*|sample of |included |enrolled |recruited |納入|招募|樣本(?:為|含)?\s*)([\d,]+)(?!\s*(?:studies|papers|articles|篇))/iu);
  const sampleSize = sampleMatch ? Number(sampleMatch[1]!.replace(/,/gu, "")) : null;
  if (sampleSize) fieldProvenance.populationSampleSize = provenance();
  const populationMatch = sentence.match(/(?:among|in a sample of|participants? (?:were|included)|patients? (?:were|included)|students? (?:were|included)|研究對象(?:為|包括)|樣本(?:為|包括)|納入)[^.;。；]{0,90}/iu);
  const population = populationMatch ? cleanText(populationMatch[0]) : null;
  if (population) fieldProvenance.population = provenance(0.65);
  const relationMatch = sentence.match(/^(.{2,120}?)\s+(?:was|were|is|are)?\s*(?:significantly\s+)?(?:associated|correlated|related)\s+with\s+(.{2,140}?)(?:[.;。；]|$)/iu);
  const zhRelationMatch = sentence.match(/^(.{2,100}?)(?:與|和)(.{2,100}?)(?:呈|存在|具有)?(?:顯著)?(?:正向|負向)?(?:關聯|相關)/u);
  const exposure = cleanText(relationMatch?.[1] ?? zhRelationMatch?.[1]) || null;
  const outcome = cleanText(relationMatch?.[2] ?? zhRelationMatch?.[2]) || null;
  const comparativeMatch = sentence.match(/^(?:in\s+[^,]{2,80},?\s*)?(.{2,120}?)\s+(?:was|were|is|are)\s+(?:significantly\s+)?(?:lower|higher|reduced|increased|decreased|improved)\s+in\s+(.{2,80}?)\s+compared (?:with|to)\s+(.{2,80}?)(?:,|[.;。；]|$)/iu);
  const resolvedExposure = exposure ?? (cleanText(comparativeMatch?.[2]) || null);
  const resolvedOutcome = outcome ?? (cleanText(comparativeMatch?.[1]) || null);
  const comparator = cleanText(comparativeMatch?.[3]) || null;
  if (resolvedExposure) fieldProvenance.exposure = provenance(0.62);
  if (resolvedOutcome) fieldProvenance.outcome = provenance(0.62);
  if (comparator) fieldProvenance.comparator = provenance(0.62);
  const nullDirection = /no significant|not significantly|no association|null result|無顯著|未見差異|未發現.*關聯/iu.test(sentence);
  const nonlinear = /non[- ]linear|U[- ]shaped|J[- ]shaped|threshold effect|非線性|U 型|J 型|閾值效應/iu.test(sentence);
  const mixed = /mixed results|heterogeneous direction|inconsistent direction|結果不一致|方向不一/iu.test(sentence);
  const negative = /negative association|inverse association|negatively associated|reduced|decreased|lower than|shorter|poorer|worse|負相關|負向關聯|降低|下降|減少/iu.test(sentence);
  const positive = /positive association|positively associated|increased|higher than|improved|正相關|正向關聯|增加|上升|提高|改善/iu.test(sentence);
  const direction = nonlinear ? "nonlinear" : mixed ? "mixed" : nullDirection ? "null" : positive && negative ? "mixed" : positive ? "positive" : negative ? "negative" : "unclear";
  if (direction !== "unclear") {
    fieldProvenance.effectDirection = provenance();
    fieldProvenance.effectDirectionConfidence = provenance();
  }
  const covariateMatch = sentence.match(/(?:adjusted|controlled|controlling|adjustment) for ([^.;]{2,160})|(?:調整|控制)([^。；]{2,120})/iu);
  const covariates = cleanText(covariateMatch?.[1] ?? covariateMatch?.[2]).split(/,|、| and |及|與/iu).map(cleanText).filter(Boolean);
  if (covariates.length) fieldProvenance.covariates = provenance(0.68);
  const moderatorSyntax = /moderated by|interaction (?:with|between)|effect was (?:stronger|weaker) (?:among|for)|subgroup difference|stratified results?|調節作用|交互作用|次群體差異|分層結果/iu;
  const moderatorFactorMatch = sentence.match(/(?:moderated by|interaction with|stronger among|weaker among|subgroup difference by|stratified by)\s+([^,.;]{2,60})|(?:由|按)([^，。；]{2,40})(?:調節|分層)/iu);
  const moderatorFactor = moderatorSyntax.test(sentence)
    ? cleanText(moderatorFactorMatch?.[1] ?? moderatorFactorMatch?.[2]) || "explicit subgroup or interaction"
    : null;
  const moderators = moderatorFactor ? [{ factor: moderatorFactor, role: "moderator", effect: sentence, provenance: provenance(0.66) }] : [];
  const quantitativeFacts: Array<Record<string, unknown>> = [];
  const effectPattern = /\b(OR|RR|HR|AUC|F1|r|β|beta)\s*[=:]\s*(-?\d+(?:\.\d+)?)/giu;
  for (const match of sentence.matchAll(effectPattern)) {
    const label = match[1]!.toLocaleUpperCase();
    const metric = label === "OR" ? "odds_ratio" : label === "RR" ? "risk_ratio" : label === "HR" ? "hazard_ratio" : label === "AUC" ? "AUC" : label === "F1" ? "F1" : label === "R" ? "correlation" : "beta";
    quantitativeFacts.push({
      metric, value: Number(match[2]), rawValue: match[0], unit: null,
      population, denominator: sampleSize, comparison: null, timepoint: null,
      ciLower: null, ciUpper: null, standardError: null, standardDeviation: null,
      pValue: null, effectDirection: direction, provenance: provenance(),
    });
  }
  const percentPattern = /(-?\d+(?:\.\d+)?)\s*[%％]/gu;
  for (const match of sentence.matchAll(percentPattern)) {
    quantitativeFacts.push({
      metric: "percentage", value: Number(match[1]), rawValue: match[0], unit: "%",
      population, denominator: sampleSize, comparison: null, timepoint: null,
      ciLower: null, ciUpper: null, standardError: null, standardDeviation: null,
      pValue: null, effectDirection: direction, provenance: provenance(),
    });
  }
  if (sampleSize && quantitativeFacts.every((fact) => fact.metric !== "sample_size")) {
    quantitativeFacts.push({
      metric: "sample_size", value: sampleSize, rawValue: sampleMatch?.[0] ?? String(sampleSize), unit: "participants_or_units",
      population, denominator: sampleSize, comparison: null, timepoint: null,
      ciLower: null, ciUpper: null, standardError: null, standardDeviation: null,
      pValue: null, effectDirection: "not_applicable", provenance: provenance(),
    });
  }
  fieldProvenance.primaryResult = provenance();
  return {
    studyDesign,
    studyDesignExplicit: studyDesign !== "unknown",
    population,
    populationDescription: population,
    populationSampleSize: sampleSize,
    exposure: resolvedExposure,
    comparator,
    outcome: resolvedOutcome,
    effectDirection: direction,
    effectDirectionConfidence: direction === "unclear" ? null : 0.72,
    adjustedOrUnadjusted: covariates.length ? "adjusted" : "unknown",
    covariates,
    confounders: [],
    moderators,
    mediators: [],
    subgroups: [],
    primaryResult: sentence,
    secondaryResults: [],
    limitations: [],
    authorCautions: [],
    quantitativeFacts,
    fieldProvenance,
    evidenceConfidence: 0.62,
    extractionMethod: "deterministic_exact_span",
  };
}

function ruleFallbackRawClaims(
  chunk: ExtractedChunk,
  source: SourceCandidate,
  topic: string,
  limit: number,
): RawClaim[] {
  const candidates = supportSentenceCandidates(chunk.text)
    .map((sentence, index) => ({
      sentence,
      score: fallbackSentenceScore({ sentence, topic, source, index }),
      overlapCount: topicOverlapTerms(topic, sentence).length,
      index,
    }))
    .filter(
      (candidate, _index, all) =>
        candidate.overlapCount > 0 ||
        FALLBACK_CLAIM_SIGNAL.test(candidate.sentence) ||
        all.every((item) => item.overlapCount === 0),
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, limit));

  return candidates.map(({ sentence, overlapCount }) => {
    const type = normalizeClaimType(
      undefined,
      `${chunk.section_heading ?? ""} ${sentence}`,
    );
    return {
      claimTextOriginal: sentence,
      claimTextZhTw: sentence,
      claimType: type,
      supportSpanText: sentence,
      confidence: 0.55,
      relevanceToTopic: Math.max(
        0.45,
        Math.min(0.82, (source.relevanceScore ?? 0.55) + overlapCount * 0.03),
      ),
      usableSections: defaultSectionsForType(type),
      limitations: ["rule_fallback_claim_extraction"],
      structuredStudyFact: deterministicStructuredStudyFact(sentence, chunk, source),
    };
  });
}

function validateFallbackRawClaims(input: {
  rawClaims: RawClaim[];
  mode: ClaimCandidate["extractionMode"];
  gatedInput: ExtractClaimsFromChunkInput;
  now: string;
}): ClaimCandidate[] {
  return input.rawClaims.map((raw, claimIndex) =>
    validateRawClaim({
      ...input.gatedInput,
      raw,
      claimIndex,
      mode: input.mode,
      now: input.now,
    }),
  );
}

function chunksForSource(
  source: SourceCandidate,
  maxChunks: number,
): ExtractedChunk[] {
  const chunks = source.extractedChunks ?? [];
  if (chunks.length > 0) return chunks.slice(0, maxChunks);
  const abstract =
    cleanText(source.extractedAbstract) ||
    cleanText(source.abstractOriginal) ||
    cleanText(source.abstract);
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
  const maxClaimsPerChunk = Math.max(
    1,
    options.maxClaimsPerChunk ?? DEFAULT_MAX_CLAIMS_PER_CHUNK,
  );
  const cleaned = cleanExtractedTextChunk({
    topic: input.topic,
    chunk: input.chunk,
    source: input.source,
    matchedConcepts: input.source.matchedConcepts,
    queryUsed: input.source.queryUsed,
  });
  if (!cleaned.accepted || !cleaned.chunk) {
    return [
      rejectedChunkClaim({
        input,
        reason:
          cleaned.diagnostics.find((item) => item.startsWith("rejected:")) ??
          "rejected:chunk_failed_evidence_gate",
        diagnostics: cleaned.diagnostics,
        now,
      }),
    ];
  }
  const gatedInput = { ...input, chunk: cleaned.chunk };
  const hardFailure = sourceCannotSupportClaims(input.source);
  if (hardFailure) {
    return validateFallbackRawClaims({
      rawClaims: ruleFallbackRawClaims(
        gatedInput.chunk,
        input.source,
        input.topic,
        maxClaimsPerChunk,
      ),
      mode: extractionModeForFallback(input.source),
      gatedInput,
      now,
    });
  }

  const enableLlm =
    options.enableLlm ?? process.env.ENABLE_CLAIM_EXTRACTION_LLM !== "false";
  if (!enableLlm) {
    return validateFallbackRawClaims({
      rawClaims: ruleFallbackRawClaims(
        gatedInput.chunk,
        input.source,
        input.topic,
        maxClaimsPerChunk,
      ),
      mode: "rule_fallback",
      gatedInput,
      now,
    });
  }

  const request = options.requestLlm ?? requestLlmText;
  const llmTimeoutMs =
    options.llmTimeoutMs ??
    (Number.isFinite(Number(process.env.CLAIM_EXTRACTION_TIMEOUT_MS))
      ? Number(process.env.CLAIM_EXTRACTION_TIMEOUT_MS)
      : DEFAULT_LLM_TIMEOUT_MS);
  const requestedMaxTokens = Number(options.llmMaxTokens);
  const llmMaxTokens = Number.isFinite(requestedMaxTokens)
    ? Math.max(256, Math.min(4_096, Math.floor(requestedMaxTokens)))
    : 1_800;
  const llmFeatureName =
    cleanText(options.llmFeatureName) || "research_grounding_claim_extraction";
  let lastLlm: LlmServiceSuccess | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await request({
        operation: "claim_extraction",
        featureName: llmFeatureName,
        purpose: "summarizer",
        messages: [
          { role: "system", content: CLAIM_EXTRACTION_SYSTEM_PROMPT },
          {
            role: "user",
            content:
              attempt === 0
                ? claimExtractionUserPrompt(gatedInput, maxClaimsPerChunk)
                : `${claimExtractionUserPrompt(gatedInput, maxClaimsPerChunk)}\nReturn valid JSON only.`,
          },
        ],
        temperature: 0,
        reasoningEffort: "low",
        maxTokens: llmMaxTokens,
        responseFormat: "json_object",
        llm: { timeoutMs: llmTimeoutMs },
        fetchImpl: options.fetchImpl,
      });
      lastLlm = response;
      const parsed = parseClaimsJson(response.content);
      if (!parsed) continue;
      return parsed.claims.slice(0, maxClaimsPerChunk).map((raw, claimIndex) =>
        validateRawClaim({
          ...gatedInput,
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

  return validateFallbackRawClaims({
    rawClaims: ruleFallbackRawClaims(
      gatedInput.chunk,
      input.source,
      input.topic,
      maxClaimsPerChunk,
    ),
    mode: "rule_fallback",
    gatedInput,
    now,
  });
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

/**
 * Apply the global safety/cost cap without allowing early source chunks to
 * consume the entire claim budget. Ordering within each source is preserved.
 */
export function capClaimCandidatesBySource(
  claims: ClaimCandidate[],
  sourceOrder: readonly string[],
  limit: number,
): ClaimCandidate[] {
  if (claims.length <= limit) return claims;
  const queues = new Map<string, ClaimCandidate[]>();
  for (const sourceId of sourceOrder) queues.set(sourceId, []);
  for (const claim of claims) {
    const queue = queues.get(claim.sourceId) ?? [];
    queue.push(claim);
    queues.set(claim.sourceId, queue);
  }
  const orderedIds = [
    ...sourceOrder,
    ...[...queues.keys()].filter((sourceId) => !sourceOrder.includes(sourceId)),
  ];
  const result: ClaimCandidate[] = [];
  let round = 0;
  while (result.length < limit) {
    let added = false;
    for (const sourceId of orderedIds) {
      const claim = queues.get(sourceId)?.[round];
      if (!claim) continue;
      result.push(claim);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return result;
}

export async function extractClaimsForSources(
  input: ExtractClaimsForSourcesInput,
  options: ClaimExtractionOptions = {},
): Promise<ClaimCandidate[]> {
  const maxChunksPerSource = Math.max(
    1,
    options.maxChunksPerSource ?? DEFAULT_MAX_CHUNKS_PER_SOURCE,
  );
  const maxTotalClaims = Math.max(
    1,
    options.maxTotalClaims ?? DEFAULT_MAX_TOTAL_CLAIMS,
  );
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

  const nested = await runLimited(
    tasks,
    options.concurrency ?? DEFAULT_CONCURRENCY,
  );
  const capped = capClaimCandidatesBySource(
    nested.flat(),
    input.sources.map((source) => source.sourceId),
    maxTotalClaims,
  );
  const envelopeBySourceId = new Map(
    input.sources.map((source) => {
      const transport = source as SourceCandidate & {
        contentHash?: string;
        fullTextCharCount?: number;
        extractedText?: string;
        extractedSections?: StudyDocumentInputV2["sections"];
        extractionMethod?: string;
        extractionStatus?: string;
        qualityFlags?: string[];
      };
      return [source.sourceId, extractStudyFactEnvelopeV2({
        sourceId: source.sourceId,
        documentId: transport.contentHash,
        title: source.title,
        year: source.year,
        canonicalId: source.doi ?? source.canonicalSourceIdentity ?? null,
        abstract: source.extractedAbstract ?? source.abstractOriginal ?? source.abstract,
        accessLevel: source.accessLevel,
        extractionMethod: transport.extractionMethod ?? source.extractionMode,
        extractionStatus: transport.extractionStatus ?? source.extractionStatus,
        fullTextCharCount: transport.fullTextCharCount,
        extractedText: transport.extractedText,
        sections: transport.extractedSections,
        chunks: source.extractedChunks,
        qualityFlags: transport.qualityFlags ?? source.extractionWarnings,
      })] as const;
    }),
  );
  return capped.map((claim) => {
    const envelope = envelopeBySourceId.get(claim.sourceId);
    if (!envelope || !claim.structuredStudyFact) return claim;
    return {
      ...claim,
      structuredStudyFact: {
        ...claim.structuredStudyFact,
        studyFactV2: envelope as unknown as Record<string, unknown>,
      },
    };
  });
}

export function acceptedClaimCandidates(
  claims: ClaimCandidate[],
): ClaimCandidate[] {
  const seen = new Set<string>();
  return claims
    .filter(
      (claim) =>
        claim.status === "accepted" &&
        Boolean(cleanText(claim.supportSpanText)),
    )
    .sort(
      (a, b) =>
        b.confidence * 0.55 +
        b.relevanceToTopic * 0.35 +
        (b.sourceQualityScore ?? 0.5) * 0.1 -
        (a.confidence * 0.55 +
          a.relevanceToTopic * 0.35 +
          (a.sourceQualityScore ?? 0.5) * 0.1),
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
