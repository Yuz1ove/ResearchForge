import {
  TopicExpansionContentSchema,
  type TopicExpansionContent,
  type TopicExpansionDiagnostics,
  type TopicExpansionRequest,
  type TopicExpansionResponse,
} from "@workspace/api-zod/topic-expansion";
import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import { createHash, randomUUID } from "node:crypto";
import { safeJsonParse } from "./llm-adapter";
import {
  logLlmFallback,
  messageFromStatus,
  requestLlmText,
  statusFromLlmError,
  type LlmServiceOperation,
} from "./llm-service";

type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_TOPIC_EXPANSION_TIMEOUT_MS = 45_000;
const DEFAULT_TOPIC_VALIDITY_TIMEOUT_MS = 18_000;
const TOPIC_EXPANSION_TEMPERATURE = 0;

const JSON_SHAPE = `{
  "expandedTopic": "string",
  "researchQuestions": ["string"],
  "searchKeywords": {
    "zh": ["string"],
    "en": ["string"],
    "synonyms": ["string"],
    "academic": ["string"]
  },
  "sourceStrategy": ["string"],
  "exclusions": ["string"]
}`;

const TOPIC_VALIDITY_JSON_SHAPE = `{
  "isValidTopic": true,
  "reason": "string"
}`;

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item))
      .filter((item): item is string => Boolean(item));
  }
  const single = cleanString(value);
  return single ? [single] : [];
}

function emptyExpansionContent(): Omit<
  TopicExpansionResponse,
  "status" | "message" | "diagnostics"
> {
  return {
    expandedTopic: "",
    researchQuestions: [],
    searchKeywords: {
      zh: [],
      en: [],
      synonyms: [],
      academic: [],
    },
    sourceStrategy: [],
    exclusions: [],
  };
}

function buildTopicExpansionResponse(input: {
  status: LlmStructuredStatus;
  message: string;
  diagnostics: TopicExpansionDiagnostics;
  content?: TopicExpansionContent;
}): TopicExpansionResponse {
  return {
    status: input.status,
    message: input.message,
    ...(input.content ?? emptyExpansionContent()),
    diagnostics: {
      ...input.diagnostics,
      llm_status: input.diagnostics.llm_status ?? input.status,
      fallback_used:
        input.diagnostics.fallback_used ?? input.diagnostics.fallbackUsed,
    },
  };
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeKeywordObject(value: unknown): TopicExpansionContent["searchKeywords"] {
  if (Array.isArray(value)) {
    return {
      zh: stringArray(value).filter((item) => /[\u3400-\u9fff]/.test(item)),
      en: stringArray(value).filter((item) => /[A-Za-z]/.test(item)),
      synonyms: [],
      academic: [],
    };
  }

  if (!value || typeof value !== "object") {
    return { zh: [], en: [], synonyms: [], academic: [] };
  }

  const data = value as Record<string, unknown>;
  return {
    zh: stringArray(data.zh ?? data.chinese ?? data.zhTw),
    en: stringArray(data.en ?? data.english),
    synonyms: stringArray(data.synonyms ?? data.aliases),
    academic: stringArray(data.academic ?? data.academicTerms ?? data.sourceTypes),
  };
}

export function normalizeTopicExpansion(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const data = { ...(value as Record<string, unknown>) };

  data.expandedTopic = data.expandedTopic ?? data.normalizedTopic ?? data.topic;
  data.researchQuestions = data.researchQuestions ?? data.questions;
  data.searchKeywords = normalizeKeywordObject(data.searchKeywords ?? data.keywords);
  data.sourceStrategy = stringArray(data.sourceStrategy ?? data.sources ?? data.sourceTypes);
  data.exclusions = stringArray(data.exclusions ?? data.excludedMeanings ?? data.exclude);

  return data;
}

function zodErrorMessages(error: unknown): string[] {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return ["Unknown schema validation error."];
  }
  const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues ?? [];
  return issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

function normalizedFieldNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function containsAnyTerm(text: string, terms: string[]): string[] {
  const normalized = text.toLowerCase();
  return terms.filter((term) => normalized.includes(term.toLowerCase()));
}

function topicGroundingIssues(
  content: TopicExpansionContent,
  topic: string,
): string[] {
  const understood = understandTopic(topic);
  const combinedText = [
    content.expandedTopic,
    ...content.researchQuestions,
    ...content.searchKeywords.zh,
    ...content.searchKeywords.en,
    ...content.searchKeywords.synonyms,
    ...content.searchKeywords.academic,
    ...content.sourceStrategy,
    ...content.exclusions,
  ].join(" ");
  const issues: string[] = [];
  const driftHits = containsAnyTerm(
    combinedText,
    understood.excludedDriftTerms,
  );
  if (driftHits.length > 0) {
    issues.push(`drift_terms_detected: ${driftHits.join(", ")}`);
  }
  if (
    understood.canonicalTerms.length > 0 &&
    !containsAnyTerm(combinedText, [
      ...understood.canonicalTerms,
      ...understood.aliases,
      ...understood.englishTerms,
    ]).length
  ) {
    issues.push("canonical_topic_terms_missing");
  }
  if (
    understood.researchAngles.length > 0 &&
    understood.topicKind !== "unknown_or_noise"
  ) {
    const genericHits = containsAnyTerm(combinedText, [
      "現況與脈絡",
      "影響與風險",
      "改善與應用",
      "overview current status",
      "impact risk case study",
      "application strategy comparison",
    ]);
    if (
      genericHits.length > 0 &&
      containsAnyTerm(
        combinedText,
        understood.researchAngles.map((angle) => angle.researchQuestion),
      ).length === 0
    ) {
      issues.push("generic_template_detected_for_domain_topic");
    }
  }
  return issues;
}

function parseAndValidate(
  rawText: string,
  topic: string,
): {
  value: TopicExpansionContent | null;
  providerStatus: TopicExpansionDiagnostics["provider_status"];
  validationIssues?: string[];
  normalizedFields?: string[];
} {
  let parsed: unknown;
  try {
    parsed = safeJsonParse(rawText);
  } catch {
    return {
      value: null,
      providerStatus: "json_parse_failed",
      validationIssues: ["Raw LLM output did not contain a valid JSON object."],
    };
  }

  const normalized = normalizeTopicExpansion(parsed);
  const normalizedFields = normalizedFieldNames(normalized);
  const result = TopicExpansionContentSchema.safeParse(normalized);
  if (!result.success) {
    return {
      value: null,
      providerStatus: "schema_validation_failed",
      validationIssues: zodErrorMessages(result.error),
      normalizedFields,
    };
  }

  const groundingIssues = topicGroundingIssues(result.data, topic);
  if (groundingIssues.length > 0) {
    return {
      value: null,
      providerStatus: "schema_validation_failed",
      validationIssues: groundingIssues,
      normalizedFields,
    };
  }

  return { value: result.data, providerStatus: "ok", normalizedFields };
}

function fallbackModelFor(primaryModel: string): string | undefined {
  const configuredFallback = process.env.OLLAMA_FALLBACK_MODEL?.trim();
  if (configuredFallback) return configuredFallback;
  if (/gemma4:e4b/i.test(primaryModel)) return "gemma4:e2b";
  if (/gemma4:e2b/i.test(primaryModel)) return "qwen3:4b";
  if (/qwen3:8b/i.test(primaryModel)) return "qwen3:4b";
  return undefined;
}

function sample(text: string): string {
  return text.trim().slice(0, 800);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function defaultTopicModel(): string {
  return (
    process.env.LLM_MODEL?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    "qwen3:4b"
  );
}

function compactTopicHints(
  understood: ReturnType<typeof understandTopic>,
): string {
  const lines = [
    `normalizedTopic: ${understood.normalizedTopic}`,
    `canonicalEnglishTopic: ${understood.canonicalEnglishTopic || "(unresolved)"}`,
    `topicKind: ${understood.topicKind}`,
    `domain: ${understood.domain}`,
  ];

  if (understood.canonicalTerms.length > 0) {
    lines.push(`canonicalTerms: ${understood.canonicalTerms.slice(0, 4).join(", ")}`);
  }
  if (understood.aliases.length > 0) {
    lines.push(`aliases: ${understood.aliases.slice(0, 5).join(", ")}`);
  }
  if (understood.englishTerms.length > 0) {
    lines.push(`englishTerms: ${understood.englishTerms.slice(0, 5).join(", ")}`);
  }
  if (understood.coreConcepts.length > 0) {
    lines.push(`coreConcepts: ${understood.coreConcepts.slice(0, 6).join(", ")}`);
  }
  if (understood.researchAngles.length > 0) {
    lines.push(
      `researchAngles:\n${understood.researchAngles
        .slice(0, 3)
        .map((angle) => `- ${angle.label}: ${angle.researchQuestion}`)
        .join("\n")}`,
    );
  }
  if (understood.searchQueries.en.length > 0) {
    lines.push(`englishQueries: ${understood.searchQueries.en.slice(0, 4).join(" | ")}`);
  }
  if (understood.searchQueries.zh.length > 0) {
    lines.push(`chineseQueries: ${understood.searchQueries.zh.slice(0, 4).join(" | ")}`);
  }
  if (understood.excludedDriftTerms.length > 0) {
    lines.push(`avoidDrift: ${understood.excludedDriftTerms.slice(0, 8).join(", ")}`);
  }

  return lines.join("\n");
}

function understandingDiagnostics(
  understood: ReturnType<typeof understandTopic>,
): Pick<
  TopicExpansionDiagnostics,
  | "originalTopic"
  | "normalizedTopic"
  | "canonicalEnglishTopic"
  | "domain"
  | "coreConcepts"
  | "searchQueries"
> {
  return {
    originalTopic: understood.originalTopic,
    normalizedTopic: understood.normalizedTopic,
    canonicalEnglishTopic: understood.canonicalEnglishTopic,
    domain: understood.domain,
    coreConcepts: understood.coreConcepts.slice(0, 8),
    searchQueries: {
      zh: understood.searchQueries.zh.slice(0, 8),
      en: understood.searchQueries.en.slice(0, 8),
    },
  };
}

function taxonomyFallbackContent(
  understood: ReturnType<typeof understandTopic>,
): TopicExpansionContent | null {
  if (understood.topicKind === "unknown_or_noise" || understood.researchAngles.length === 0) {
    return null;
  }
  const angles = understood.researchAngles.slice(0, 4);
  return {
    expandedTopic: understood.normalizedTopic,
    researchQuestions: angles.map((angle) => angle.researchQuestion),
    searchKeywords: {
      zh: uniqueStrings([
        ...understood.canonicalTerms,
        ...understood.searchQueries.zh,
        ...angles.flatMap((angle) => angle.zhQueries.slice(0, 2)),
      ]).slice(0, 10),
      en: uniqueStrings([
        understood.canonicalEnglishTopic,
        ...understood.englishTerms,
        ...understood.searchQueries.en,
        ...angles.flatMap((angle) => angle.enQueries.slice(0, 2)),
      ]).slice(0, 10),
      synonyms: uniqueStrings(understood.aliases).slice(0, 8),
      academic: uniqueStrings(
        angles.flatMap((angle) => angle.suggestedSourceTypes.slice(0, 2)),
      ).slice(0, 8),
    },
    sourceStrategy: uniqueStrings(
      angles.flatMap((angle) => angle.suggestedSourceTypes.slice(0, 2)),
    ).slice(0, 6),
    exclusions: uniqueStrings(understood.excludedDriftTerms).slice(0, 6),
  };
}

function suspiciousAsciiTopic(topic: string): boolean {
  const normalized = topic.trim();
  if (!normalized) return false;
  if (/[\u3400-\u9fff]/.test(normalized)) return false;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)?$/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  return words.length <= 2 && words.every((word) => word.length >= 5);
}

function shouldRunTopicValidityCheck(
  input: TopicExpansionRequest,
  understood: ReturnType<typeof understandTopic>,
): boolean {
  return (
    suspiciousAsciiTopic(input.topic) &&
    understood.domain === "general_research" &&
    (understood.topicKind === "ambiguous" ||
      understood.topicKind === "broad_common_noun")
  );
}

function normalizeTopicValidityResult(
  value: unknown,
): { isValidTopic: boolean; reason: string } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.isValidTopic !== "boolean") return null;
  if (typeof data.reason !== "string" || !data.reason.trim()) return null;
  return {
    isValidTopic: data.isValidTopic,
    reason: data.reason.trim(),
  };
}

async function validateTopicMeaningfulness(
  input: TopicExpansionRequest,
  understood: ReturnType<typeof understandTopic>,
  fetchImpl: FetchImpl,
): Promise<{
  isValidTopic: boolean;
  reason: string;
} | null> {
  if (!shouldRunTopicValidityCheck(input, understood)) return null;

  try {
    const configuredValidityTimeout = Number(
      process.env.TOPIC_VALIDITY_TIMEOUT_MS,
    );
    const llmResult = await requestLlmText({
      operation: "topic_expansion",
      purpose: "planner",
      messages: [
        {
          role: "system",
          content: [
            "You classify whether an input is a meaningful research topic.",
            "Return JSON only.",
            "Do not invent meanings for random strings.",
            "Treat keyboard mash, nonsense syllables, and opaque gibberish as invalid.",
            "Treat real objects, organisms, technologies, foods, places, and social issues as valid broad topics even if they still need expansion.",
            `Your JSON must exactly match this shape: ${TOPIC_VALIDITY_JSON_SHAPE}`,
          ].join(" "),
        },
        {
          role: "user",
          content: [`topic: ${input.topic}`, compactTopicHints(understood)]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      temperature: TOPIC_EXPANSION_TEMPERATURE,
      maxTokens: 90,
      responseFormat: "json_object",
      llm: {
        baseUrl:
          process.env.OLLAMA_BASE_URL?.trim()?.endsWith("/v1")
            ? process.env.OLLAMA_BASE_URL.trim()
            : `${(process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "")}/v1`,
        model: defaultTopicModel(),
        timeoutMs:
          Number.isFinite(configuredValidityTimeout) &&
          configuredValidityTimeout > 0
            ? configuredValidityTimeout
            : Math.min(
                Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000,
                DEFAULT_TOPIC_VALIDITY_TIMEOUT_MS,
              ),
      },
      fetchImpl,
    });
    return normalizeTopicValidityResult(safeJsonParse(llmResult.content));
  } catch {
    return null;
  }
}

type TopicExpansionAttempt = {
  content: TopicExpansionContent | null;
  diagnostics: TopicExpansionDiagnostics;
  status: LlmStructuredStatus;
  message: string;
  primaryFailure?: TopicExpansionDiagnostics["provider_status"];
};

function canUseTaxonomyFallback(
  attempt: Pick<TopicExpansionAttempt, "status" | "diagnostics">,
): boolean {
  return (
    attempt.status === "unavailable" ||
    attempt.diagnostics.provider_status === "timeout" ||
    attempt.diagnostics.provider_status === "provider_unavailable" ||
    attempt.diagnostics.provider_status === "provider_error"
  );
}

async function tryOllamaExpansion(
  input: TopicExpansionRequest,
  model: string,
  fetchImpl: FetchImpl,
  context: { requestId: string; generatedAt: string },
): Promise<TopicExpansionAttempt> {
  const startedAt = Date.now();
  const understood = understandTopic(input.topic);
  const diagnostics: TopicExpansionDiagnostics = {
    llm_status: "success",
    provider: "ollama",
    model,
    temperature: TOPIC_EXPANSION_TEMPERATURE,
    cacheHit: false,
    requestId: context.requestId,
    generatedAt: context.generatedAt,
    ...understandingDiagnostics(understood),
    provider_status: "ok",
    fallbackUsed: false,
    fallback_used: false,
  };

  let rawText = "";
  const configuredTimeout = Number(process.env.TOPIC_EXPANSION_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : Math.min(
          Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000,
          DEFAULT_TOPIC_EXPANSION_TIMEOUT_MS,
        );
  try {
    const llmResult = await requestLlmText({
      operation: "topic_expansion",
      purpose: "planner",
      messages: [
        {
          role: "system",
          content: [
            "You are a research topic expansion service.",
            "Output JSON only.",
            "Do not output markdown.",
            "Do not output explanations.",
            "Do not output code fences.",
            "Do not include diagnostics.",
            "The server will add provider, model, fallbackUsed, and fallbackReason.",
            "Respect the topic domain hints and excluded meanings.",
            `Your JSON must exactly match this shape: ${JSON_SHAPE}`,
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `reportType: ${input.reportType ?? "研究報告"}`,
            `audience: ${input.audience ?? "高中"}`,
            `sourceMode: ${input.sourceMode ?? "需要，並生成參考文獻格式"}`,
            `language: ${input.language ?? "zh-TW"}`,
            compactTopicHints(understood),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      temperature: TOPIC_EXPANSION_TEMPERATURE,
      maxTokens: 700,
      responseFormat: "json_object",
      llm: {
        baseUrl:
          process.env.OLLAMA_BASE_URL?.trim()?.endsWith("/v1")
            ? process.env.OLLAMA_BASE_URL.trim()
            : `${(process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "")}/v1`,
        model,
        timeoutMs,
      },
      fetchImpl,
    });
    rawText = llmResult.content;
    diagnostics.provider = llmResult.provider;
    diagnostics.model = llmResult.model;
  } catch (error) {
    const status = statusFromLlmError(error);
    diagnostics.provider_status =
      status === "unavailable"
        ? error instanceof Error && error.name === "LlmAdapterError" && "code" in error && error.code === "provider-timeout"
          ? "timeout"
          : "provider_unavailable"
        : "provider_error";
    diagnostics.llm_status = status;
    diagnostics.fallbackUsed = true;
    diagnostics.fallback_used = true;
    diagnostics.fallbackReason =
      error instanceof Error && error.name === "LlmAdapterError" && "code" in error
        ? String(error.code)
        : diagnostics.provider_status;
    diagnostics.latencyMs = Date.now() - startedAt;
    logLlmFallback({
      operation: "topic_expansion",
      status,
      provider: diagnostics.provider,
      model: diagnostics.model ?? model,
      endpoint: null,
      reason: diagnostics.fallbackReason,
      route: "/api/expand-topic",
    });
    return {
      content: null,
      diagnostics,
      status,
      message: messageFromStatus(status, "topic_expansion"),
      primaryFailure: diagnostics.provider_status,
    };
  }

  const parsed = parseAndValidate(rawText, input.topic);
  diagnostics.provider_status = parsed.providerStatus;
  diagnostics.latencyMs = Date.now() - startedAt;
  diagnostics.rawOutputSample = sample(rawText);
  diagnostics.rawResponseHash = hashText(rawText);
  diagnostics.validationIssues = parsed.validationIssues;
  diagnostics.validationErrors = parsed.validationIssues;
  diagnostics.normalizedFields = parsed.normalizedFields;

  if (!parsed.value) {
    diagnostics.llm_status = "error";
    diagnostics.fallbackUsed = true;
    diagnostics.fallback_used = true;
    diagnostics.fallbackReason = parsed.providerStatus;
    logLlmFallback({
      operation: "topic_expansion",
      status: "error",
      provider: diagnostics.provider,
      model: diagnostics.model ?? model,
      endpoint: null,
      reason: diagnostics.fallbackReason,
      route: "/api/expand-topic",
    });
    return {
      content: null,
      diagnostics,
      status: "error",
      message: "LLM 回傳格式異常或內容未通過主題 grounding 檢查。",
      primaryFailure: parsed.providerStatus,
    };
  }

  return {
    content: parsed.value,
    diagnostics,
    status: "success",
    message: "LLM topic expansion completed.",
  };
}

export async function expandTopicWithOllama(
  input: TopicExpansionRequest,
  options: { fetchImpl?: FetchImpl } = {},
): Promise<TopicExpansionResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestId = randomUUID();
  const generatedAt = new Date().toISOString();
  const understood = understandTopic(input.topic);
  const taxonomyFallback = taxonomyFallbackContent(understood);
  if (understood.topicKind === "unknown_or_noise") {
    logLlmFallback({
      operation: "topic_expansion",
      status: "invalid_input",
      provider: process.env.LLM_PROVIDER?.trim() || "ollama",
      model: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
      endpoint: null,
      reason: "invalid_input",
      route: "/api/expand-topic",
    });
    return buildTopicExpansionResponse({
      status: "invalid_input",
      message: "查無足夠研究方向：輸入內容不像有效研究主題，請改用具體概念、物種、食品、技術或議題。",
      diagnostics: {
        llm_status: "invalid_input",
        provider: "ollama",
        model: defaultTopicModel(),
        temperature: TOPIC_EXPANSION_TEMPERATURE,
        cacheHit: false,
        requestId,
        generatedAt,
        ...understandingDiagnostics(understood),
        provider_status: "invalid_input",
        fallbackUsed: true,
        fallback_used: true,
        fallbackReason: "invalid_input",
      },
    });
  }

  const topicValidity = await validateTopicMeaningfulness(
    input,
    understood,
    fetchImpl,
  );
  if (topicValidity && !topicValidity.isValidTopic) {
    logLlmFallback({
      operation: "topic_expansion",
      status: "invalid_input",
      provider: process.env.LLM_PROVIDER?.trim() || "ollama",
      model: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
      endpoint: null,
      reason: `invalid_topic_meaningfulness:${topicValidity.reason}`,
      route: "/api/expand-topic",
    });
    return buildTopicExpansionResponse({
      status: "invalid_input",
      message: `查無足夠研究方向：${topicValidity.reason}`,
      diagnostics: {
        llm_status: "invalid_input",
        provider: "ollama",
        model: defaultTopicModel(),
        temperature: TOPIC_EXPANSION_TEMPERATURE,
        cacheHit: false,
        requestId,
        generatedAt,
        ...understandingDiagnostics(understood),
        provider_status: "invalid_input",
        fallbackUsed: true,
        fallback_used: true,
        fallbackReason: "invalid_input",
        validationIssues: [topicValidity.reason],
      },
    });
  }

  const primaryModel = defaultTopicModel();
  const primary = await tryOllamaExpansion(input, primaryModel, fetchImpl, {
    requestId,
    generatedAt,
  });

  if (primary.content) {
    return buildTopicExpansionResponse({
      status: "success",
      message: "LLM topic expansion completed.",
      content: primary.content,
      diagnostics: {
        ...primary.diagnostics,
        provider_status: "ok",
        llm_status: "success",
        fallbackUsed: false,
        fallback_used: false,
        fallbackReason: undefined,
      },
    });
  }

  const fallbackModel = fallbackModelFor(primaryModel);
  if (fallbackModel && fallbackModel !== primaryModel && primary.primaryFailure) {
    const secondary = await tryOllamaExpansion(input, fallbackModel, fetchImpl, {
      requestId,
      generatedAt,
    });
    if (secondary.content) {
      return buildTopicExpansionResponse({
        status: "success",
        message: "LLM topic expansion completed with fallback model.",
        content: secondary.content,
        diagnostics: {
          ...secondary.diagnostics,
          provider_status: "ok",
          llm_status: "success",
          fallbackUsed: true,
          fallback_used: true,
          fallbackModel,
          fallbackReason:
            primary.primaryFailure === "timeout" ? "primary_model_timeout" : "primary_model_failed",
        },
      });
    }
    if (taxonomyFallback && canUseTaxonomyFallback(secondary)) {
      return buildTopicExpansionResponse({
        status: "success",
        message: "LLM unavailable，已改用主題 taxonomy fallback 產生研究方向。",
        content: taxonomyFallback,
        diagnostics: {
          ...secondary.diagnostics,
          llm_status: "unavailable",
          fallbackUsed: true,
          fallback_used: true,
          fallbackModel,
          fallbackReason:
            secondary.diagnostics.fallbackReason ??
            primary.diagnostics.fallbackReason ??
            "taxonomy_fallback_after_llm_failure",
        },
      });
    }
  }

  if (taxonomyFallback && canUseTaxonomyFallback(primary)) {
    return buildTopicExpansionResponse({
      status: "success",
      message: "LLM unavailable，已改用主題 taxonomy fallback 產生研究方向。",
      content: taxonomyFallback,
      diagnostics: {
        ...primary.diagnostics,
        llm_status: "unavailable",
        fallbackUsed: true,
        fallback_used: true,
        fallbackReason:
          primary.diagnostics.fallbackReason ?? "taxonomy_fallback_after_llm_failure",
        ...(fallbackModel && fallbackModel !== primaryModel
          ? { fallbackModel }
          : {}),
      },
    });
  }

  return buildTopicExpansionResponse({
    status: primary.status,
    message:
      primary.status === "unavailable"
        ? "LLM unavailable：主題擴寫未成功，請確認模型服務或 API 設定後再試。"
        : primary.message,
    diagnostics: {
      ...primary.diagnostics,
      llm_status: primary.status,
      ...(fallbackModel && fallbackModel !== primaryModel
        ? { fallbackModel }
        : {}),
    },
  });
}
