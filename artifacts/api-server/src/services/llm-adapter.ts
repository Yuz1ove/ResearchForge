import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { logger } from "../lib/logger";
import { resolvePrivateLlmProviderConfig } from "../config/llm-provider-config";
import {
  checkSchoolRateLimit,
  estimateMessageTokens,
  estimateTokens,
  missingSchoolConfigReason,
  recordSchoolUsage,
  redactKnownSecrets,
  resolveSchoolLlmConfig,
  schoolTimeoutMs,
} from "./llm/schoolProvider";

export type LlmRequestPurpose =
  | "planner"
  | "summarizer"
  | "report_writer"
  | "section_writer";

export type LlmAdapterErrorCode =
  | "provider-unconfigured"
  | "model-missing"
  | "provider-quota"
  | "provider-timeout"
  | "provider-failure"
  | "invalid-json";

export interface OpenAICompatibleMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAICompatibleLlmConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export interface ResolvedLlmConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs: number;
  disabled: boolean;
  providerKind?: "school" | "openai" | "ollama" | "generic";
  providerName?: string;
  configError?: string;
}

export interface ChatCompletionRequest {
  purpose: LlmRequestPurpose;
  featureName?: string;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object";
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  env?: NodeJS.ProcessEnv;
}

export class LlmAdapterError extends Error {
  constructor(
    readonly code: LlmAdapterErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmAdapterError";
  }
}

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_BASE_URL = `${DEFAULT_OLLAMA_BASE_URL}/v1`;
const DEFAULT_MODEL = "qwen3:4b";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-5.4";
const OPENAI_MODEL_ALIASES = new Map<string, string>([
  ["chatgpt5.4", DEFAULT_OPENAI_MODEL],
  ["chatgpt-5.4", DEFAULT_OPENAI_MODEL],
  ["chatgpt 5.4", DEFAULT_OPENAI_MODEL],
  ["gpt5.4", DEFAULT_OPENAI_MODEL],
  ["gpt-5.4", DEFAULT_OPENAI_MODEL],
]);
const PURPOSE_TIMEOUT_MS = {
  planner: 60_000,
  summarizer: 60_000,
  report_writer: 120_000,
  section_writer: 90_000,
} satisfies Record<LlmRequestPurpose, number>;
const PURPOSE_TIMEOUT_ENV_KEYS = {
  planner: ["PLANNER_LLM_TIMEOUT_MS", "SEARCH_INTENT_LLM_TIMEOUT_MS", "KEYWORD_LLM_TIMEOUT_MS"],
  summarizer: ["SUMMARIZER_LLM_TIMEOUT_MS", "SOURCE_SUMMARY_LLM_TIMEOUT_MS"],
  report_writer: ["REPORT_WRITER_LLM_TIMEOUT_MS", "REPORT_LLM_TIMEOUT_MS"],
  section_writer: ["SECTION_WRITER_LLM_TIMEOUT_MS", "SECTION_LLM_TIMEOUT_MS"],
} satisfies Record<LlmRequestPurpose, string[]>;

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

export function resolveOpenAiModelAlias(model: string | undefined | null): string {
  const value = model?.trim();
  if (!value) return DEFAULT_OPENAI_MODEL;
  const key = value.toLowerCase();
  return OPENAI_MODEL_ALIASES.get(key) ?? value;
}

function providerRequested(env: NodeJS.ProcessEnv, provider: string): boolean {
  const requested = envValue(env, "LLM_PROVIDER")?.toLowerCase();
  if (provider === "school_llm") {
    return requested === "school_llm" || requested === "school";
  }
  return requested === provider;
}

function openAiEnvPresent(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    providerRequested(env, "openai") ||
      envValue(env, "OPENAI_API_KEY") ||
      envValue(env, "OPENAI_MODEL") ||
      envValue(env, "OPENAI_BASE_URL"),
  );
}

function isOfficialOpenAiBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return /(^|\.)openai\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function resolveOpenAiConfig(
  purpose: LlmRequestPurpose,
  overrides: Partial<OpenAICompatibleLlmConfig>,
  env: NodeJS.ProcessEnv,
): ResolvedLlmConfig | null {
  if (overrides.baseUrl && !isOfficialOpenAiBaseUrl(overrides.baseUrl) && !providerRequested(env, "openai")) {
    return null;
  }
  if (!openAiEnvPresent(env) && !isOfficialOpenAiBaseUrl(overrides.baseUrl ?? "")) {
    return null;
  }

  const apiKey = overrides.apiKey ?? envValue(env, "OPENAI_API_KEY");
  const model = resolveOpenAiModelAlias(
    overrides.model ??
      envValue(env, "OPENAI_MODEL") ??
      envValue(env, "LLM_MODEL") ??
      DEFAULT_OPENAI_MODEL,
  );
  const baseUrl =
    overrides.baseUrl ??
    envValue(env, "OPENAI_BASE_URL") ??
    DEFAULT_OPENAI_BASE_URL;
  const timeoutMs =
    overrides.timeoutMs ??
    envNumber(env, [...PURPOSE_TIMEOUT_ENV_KEYS[purpose], "OPENAI_TIMEOUT_MS", "LLM_TIMEOUT_MS"]) ??
    PURPOSE_TIMEOUT_MS[purpose];

  return {
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    apiKey,
    model,
    timeoutMs,
    disabled: !apiKey?.trim(),
    providerKind: "openai",
    providerName: "openai",
    configError: apiKey?.trim() ? undefined : "OPENAI_API_KEY 未設定",
  };
}

function envNumber(env: NodeJS.ProcessEnv, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(envValue(env, key));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

function normalizeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_BASE_URL;

  try {
    const url = new URL(trimmed);
    const isOllamaLocal =
      /(^|\.)localhost$/i.test(url.hostname) ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1";
    if (isOllamaLocal && url.port === "11434" && !url.pathname.endsWith("/v1")) {
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/v1`;
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function normalizeNativeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_OLLAMA_BASE_URL;

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/v1$/i, "").replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/v1$/i, "");
  }
}

export function resolveLlmConfig(
  purpose: LlmRequestPurpose,
  overrides: Partial<OpenAICompatibleLlmConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedLlmConfig {
  const explicitlyDisabled =
    Object.prototype.hasOwnProperty.call(overrides, "apiKey") &&
    !overrides.apiKey?.trim();
  if (providerRequested(env, "ollama")) {
    const model =
      overrides.model ??
      envValue(env, "OLLAMA_MODEL") ??
      envValue(env, "LLM_MODEL") ??
      "";
    const baseUrl =
      overrides.baseUrl ??
      envValue(env, "OLLAMA_BASE_URL") ??
      envValue(env, "LLM_BASE_URL") ??
      DEFAULT_OLLAMA_BASE_URL;
    const timeoutMs =
      overrides.timeoutMs ??
      envNumber(env, [...PURPOSE_TIMEOUT_ENV_KEYS[purpose], "OLLAMA_TIMEOUT_MS", "LLM_TIMEOUT_MS"]) ??
      PURPOSE_TIMEOUT_MS[purpose];

    return {
      baseUrl: normalizeNativeOllamaBaseUrl(baseUrl),
      apiKey: overrides.apiKey?.trim() || envValue(env, "OLLAMA_API_KEY"),
      model,
      timeoutMs,
      disabled: !model,
      providerKind: "ollama",
      providerName: "ollama",
      configError: model
        ? undefined
        : "MODEL_MISSING: Ollama is configured, but no model is set. Set OLLAMA_MODEL.",
    };
  }
  const providerOverride = providerRequested(env, "openai")
    ? "openai"
    : providerRequested(env, "school_llm")
      ? "school_llm"
      : "auto";
  const hasProviderEnv =
    Boolean(envValue(env, "SCHOOL_LLM_API_KEY") || envValue(env, "SCHOOL_LLM_BASE_URL")) ||
    Boolean(envValue(env, "OPENAI_API_KEY") || envValue(env, "OPENAI_BASE_URL")) ||
    providerOverride !== "auto" ||
    Boolean(overrides.apiKey?.trim());

  if (!explicitlyDisabled && hasProviderEnv) {
    const providerConfig = resolvePrivateLlmProviderConfig({
      env,
      provider: providerOverride,
      apiKey: overrides.apiKey,
      baseURL: overrides.baseUrl,
      model: overrides.model,
    });
    if (providerConfig.provider !== "unconfigured") {
      const providerKind = providerConfig.provider === "school_llm" ? "school" : "openai";
      const timeoutMs =
        overrides.timeoutMs ??
        envNumber(env, [
          ...PURPOSE_TIMEOUT_ENV_KEYS[purpose],
          providerKind === "openai" ? "OPENAI_TIMEOUT_MS" : "SCHOOL_LLM_TIMEOUT_MS",
          "LLM_TIMEOUT_MS",
        ]) ??
        (providerKind === "school" ? schoolTimeoutMs(purpose, env) : undefined) ??
        PURPOSE_TIMEOUT_MS[purpose];
      const providerName =
        providerKind === "school"
          ? envValue(env, "SCHOOL_LLM_PROVIDER") ?? "school_llm"
          : "openai";
      const model = providerConfig.model ?? "";
      return {
        baseUrl: normalizeOllamaBaseUrl(providerConfig.baseURL ?? DEFAULT_BASE_URL),
        apiKey: providerConfig.apiKey ?? undefined,
        model,
        timeoutMs,
        disabled: !providerConfig.available || !providerConfig.modelConfigured,
        providerKind,
        providerName,
        configError: !providerConfig.available
          ? `Missing LLM environment variable(s): ${providerConfig.missing.join(", ")}.`
          : !providerConfig.modelConfigured
            ? "MODEL_MISSING: LLM provider is configured, but no model is set. Set SCHOOL_LLM_MODEL or OPENAI_MODEL."
            : undefined,
      };
    }
  }

  const baseUrl =
    overrides.baseUrl ??
    envValue(env, "LLM_BASE_URL") ??
    envValue(env, "OLLAMA_BASE_URL") ??
    envValue(env, "SEARCH_INTENT_LLM_BASE_URL") ??
    envValue(env, "KEYWORD_LLM_BASE_URL") ??
    envValue(env, "OPENAI_BASE_URL") ??
    DEFAULT_BASE_URL;
  const model =
    overrides.model ??
    envValue(env, "LLM_MODEL") ??
    envValue(env, "OLLAMA_MODEL") ??
    envValue(env, "SEARCH_INTENT_LLM_MODEL") ??
    envValue(env, "KEYWORD_LLM_MODEL") ??
    DEFAULT_MODEL;
  const timeoutMs =
    overrides.timeoutMs ??
    envNumber(env, [...PURPOSE_TIMEOUT_ENV_KEYS[purpose], "LLM_TIMEOUT_MS", "OLLAMA_TIMEOUT_MS"]) ??
    PURPOSE_TIMEOUT_MS[purpose];
  const apiKey =
    explicitlyDisabled
      ? undefined
      : overrides.apiKey ??
        envValue(env, "LLM_API_KEY") ??
        envValue(env, "OLLAMA_API_KEY") ??
        envValue(env, "SEARCH_INTENT_LLM_API_KEY") ??
        envValue(env, "KEYWORD_LLM_API_KEY") ??
        envValue(env, "OPENAI_API_KEY");

  return {
    baseUrl: normalizeOllamaBaseUrl(baseUrl),
    apiKey,
    model,
    timeoutMs,
    disabled: explicitlyDisabled,
    providerKind: "generic",
  };
}

function chatCompletionsUrl(baseUrl: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBase);
}

export function ollamaChatUrl(baseUrl: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("api/chat", normalizedBase);
}

function requestWithNodeHttp(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const url = input instanceof URL ? input : new URL(input);
  const request = url.protocol === "https:"
    ? requestHttps
    : url.protocol === "http:"
      ? requestHttp
      : null;
  if (!request) {
    return Promise.reject(new TypeError(`Unsupported native Ollama URL protocol: ${url.protocol}`));
  }

  const requestBody = init.body;
  if (
    requestBody != null &&
    typeof requestBody !== "string" &&
    !(requestBody instanceof Uint8Array)
  ) {
    return Promise.reject(new TypeError("Native Ollama transport requires a string or byte request body."));
  }

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const resolveOnce = (response: Response): void => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const nodeRequest = request(
      url,
      {
        method: init.method ?? "GET",
        headers: Object.fromEntries(new Headers(init.headers).entries()),
        signal: init.signal ?? undefined,
      },
      (nodeResponse) => {
        const chunks: Buffer[] = [];
        nodeResponse.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        nodeResponse.once("aborted", () => {
          rejectOnce(new Error("Native Ollama response was aborted."));
        });
        nodeResponse.once("error", rejectOnce);
        nodeResponse.once("end", () => {
          const responseHeaders = new Headers();
          for (let index = 0; index < nodeResponse.rawHeaders.length; index += 2) {
            const name = nodeResponse.rawHeaders[index];
            const value = nodeResponse.rawHeaders[index + 1];
            if (name && value != null) responseHeaders.append(name, value);
          }
          const status = nodeResponse.statusCode ?? 500;
          const body = status === 204 || status === 205 || status === 304
            ? null
            : Buffer.concat(chunks);
          resolveOnce(new Response(body, {
            status,
            statusText: nodeResponse.statusMessage,
            headers: responseHeaders,
          }));
        });
      },
    );
    nodeRequest.once("error", rejectOnce);
    nodeRequest.end(requestBody);
  });
}

function responsesUrl(baseUrl: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("responses", normalizedBase);
}

function shouldDisableReasoning(config: ResolvedLlmConfig): boolean {
  try {
    const url = new URL(config.baseUrl);
    if (
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost" ||
        url.hostname === "::1") &&
      url.port === "11434"
    ) {
      return true;
    }
  } catch {
    // Keep generic OpenAI-compatible providers on their standard request body.
  }
  return /^qwen3[:/-]/i.test(config.model);
}

function messagesForProvider(
  messages: OpenAICompatibleMessage[],
  config: ResolvedLlmConfig,
): OpenAICompatibleMessage[] {
  if (!shouldDisableReasoning(config)) return messages;
  let injected = false;
  return messages.map((message) => {
    if (injected || message.role !== "user") return message;
    injected = true;
    return {
      ...message,
      content: message.content.startsWith("/no_think")
        ? message.content
        : `/no_think\n${message.content}`,
    };
  });
}

function isQuotaOrAuthFailure(status: number): boolean {
  return status === 403 || status === 429;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function extractFirstJsonObject(text: string): string | null {
  const stripped = stripJsonFence(text);
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < stripped.length; index += 1) {
    const char = stripped[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return stripped.slice(start, index + 1);
    }
  }

  return null;
}

export function safeJsonParse(text: string): unknown {
  const stripped = stripJsonFence(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const jsonObject = extractFirstJsonObject(stripped);
    if (jsonObject) {
      return JSON.parse(jsonObject);
    }
    throw new LlmAdapterError(
      "invalid-json",
      "LLM response did not contain valid JSON.",
    );
  }
}

function textFromContentValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const data = item as Record<string, unknown>;
      if (typeof data.text === "string") return data.text;
      if (typeof data.content === "string") return data.content;
      return "";
    })
    .join("\n")
    .trim();
}

function firstNonEmptyText(...values: unknown[]): string {
  for (const value of values) {
    const text = textFromContentValue(value);
    if (text) return text;
  }
  return "";
}

function firstJsonObjectFromReasoning(...values: unknown[]): string {
  for (const value of values) {
    const text = textFromContentValue(value);
    if (!text) continue;
    const jsonObject = extractFirstJsonObject(text);
    if (jsonObject) return jsonObject;
  }
  return "";
}

function responsesInputFromMessages(messages: OpenAICompatibleMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : message.role,
    content: message.content,
  }));
}

async function requestOpenAiResponsesText(input: {
  config: ResolvedLlmConfig;
  messages: OpenAICompatibleMessage[];
  maxTokens: number;
  fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response>;
  signal: AbortSignal;
  responseFormat?: "json_object";
}): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.config.apiKey?.trim()) {
    headers.Authorization = `Bearer ${input.config.apiKey}`;
  }
  const response = await input.fetchImpl(responsesUrl(input.config.baseUrl).toString(), {
    method: "POST",
    signal: input.signal,
    headers,
    body: JSON.stringify({
      model: input.config.model,
      input: responsesInputFromMessages(input.messages),
      max_output_tokens: input.maxTokens,
      ...(input.responseFormat === "json_object"
        ? { text: { format: { type: "json_object" } } }
        : {}),
    }),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new LlmAdapterError(
      isQuotaOrAuthFailure(response.status)
        ? "provider-quota"
        : "provider-failure",
      `LLM provider returned HTTP ${response.status}.`,
    );
  }

  const payload = safeJsonParse(body);
  const content = extractModelText(payload);
  if (!content) {
    throw new LlmAdapterError(
      "invalid-json",
      "LLM response did not include message content.",
    );
  }
  return content;
}

export function extractModelText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";

  const data = raw as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const choiceData = choice as Record<string, unknown>;
    const message =
      choiceData.message && typeof choiceData.message === "object"
        ? (choiceData.message as Record<string, unknown>)
        : {};
    const delta =
      choiceData.delta && typeof choiceData.delta === "object"
        ? (choiceData.delta as Record<string, unknown>)
        : {};
    const text = firstNonEmptyText(
      message.content,
      delta.content,
      choiceData.text,
      choiceData.content,
    );
    if (text) return text;
    const jsonFromReasoning = firstJsonObjectFromReasoning(
      message.reasoning,
      delta.reasoning,
      choiceData.reasoning,
    );
    if (jsonFromReasoning) return jsonFromReasoning;
  }

  const message =
    data.message && typeof data.message === "object"
      ? (data.message as Record<string, unknown>)
      : {};
  const output = Array.isArray(data.output) ? data.output : [];
  const outputText = output
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const itemData = item as Record<string, unknown>;
      return firstNonEmptyText(itemData.content, itemData.text);
    })
    .filter(Boolean)
    .join("\n")
    .trim();

  return firstNonEmptyText(
    message.content,
    data.response,
    data.content,
    data.text,
    data.output_text,
    outputText,
  ) || firstJsonObjectFromReasoning(message.reasoning, data.reasoning);
}

function extractOllamaStreamText(body: string): string {
  const chunks = body
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => extractModelText(safeJsonParse(line)))
    .filter(Boolean);
  return chunks.join("").trim();
}

function errorCode(error: unknown): string {
  if (error instanceof LlmAdapterError) return error.code;
  if (error instanceof Error) return error.name || "Error";
  return "unknown";
}

function schoolUsageStatusFromError(error: unknown): "failed" | "fallback" | "rate_limited" | "unconfigured" {
  if (error instanceof LlmAdapterError) {
    if (error.code === "provider-unconfigured") return "unconfigured";
    if (error.code === "provider-quota") return "rate_limited";
  }
  return "fallback";
}

export async function requestOpenAICompatibleChatCompletion({
  purpose,
  featureName = purpose,
  messages,
  temperature = 0,
  maxTokens = 1_200,
  responseFormat,
  llm,
  fetchImpl,
  env = process.env,
}: ChatCompletionRequest): Promise<string> {
  const config = resolveLlmConfig(purpose, llm, env);
  if (config.disabled) {
    if (config.providerKind === "school") {
      recordSchoolUsage({
        featureName,
        model: config.model,
        status: "unconfigured",
        latencyMs: 0,
        estimatedInputTokens: estimateMessageTokens(messages),
        estimatedOutputTokens: 0,
        createdAt: new Date().toISOString(),
      });
    }
    const disabledCode: LlmAdapterErrorCode =
      config.configError?.startsWith("MODEL_MISSING")
        ? "model-missing"
        : "provider-unconfigured";
    throw new LlmAdapterError(
      disabledCode,
      redactKnownSecrets(
        config.configError ??
          "LLM request was explicitly disabled. AI 服務暫時不可用，已使用本地規則 fallback。",
        env,
      ),
    );
  }

  const startedAt = Date.now();
  const estimatedInputTokens = estimateMessageTokens(messages);
  if (config.providerKind === "school") {
    const rateLimit = checkSchoolRateLimit(featureName, env);
    if (!rateLimit.allowed) {
      recordSchoolUsage({
        featureName,
        model: config.model,
        status: "rate_limited",
        latencyMs: 0,
        estimatedInputTokens,
        estimatedOutputTokens: 0,
        createdAt: new Date().toISOString(),
      });
      throw new LlmAdapterError(
        "provider-quota",
        `School LLM rate limit exceeded. Retry after ${Math.ceil(rateLimit.retryAfterMs / 1000)} seconds.`,
      );
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const endpoint =
    config.providerKind === "ollama"
      ? ollamaChatUrl(config.baseUrl).toString()
      : chatCompletionsUrl(config.baseUrl).toString();
  const providerFetch = fetchImpl ?? (
    config.providerKind === "ollama"
      ? requestWithNodeHttp
      : fetch
  );

  try {
    if (config.providerKind === "openai") {
      const content = await requestOpenAiResponsesText({
        config,
        messages,
        maxTokens,
        fetchImpl: providerFetch,
        signal: controller.signal,
        responseFormat,
      });
      logger.info(
        {
          purpose,
          featureName,
          model: config.model,
          providerKind: config.providerKind,
          endpointConfigured: true,
          durationMs: Date.now() - startedAt,
          timeoutMs: config.timeoutMs,
        },
        "LLM request completed",
      );
      return content;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey?.trim()) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await providerFetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify(
        config.providerKind === "ollama"
          ? {
              model: config.model,
              messages,
              // The native Node transport has no hidden Undici headers
              // deadline, so a single response preserves JSON string
              // boundaries exactly. The explicit AbortController remains the
              // authoritative per-purpose deadline.
              stream: false,
              think: false,
              ...(responseFormat === "json_object" ? { format: "json" } : {}),
              options: {
                temperature,
                num_predict: maxTokens,
                ...(envNumber(env, ["OLLAMA_NUM_CTX"]) != null
                  ? { num_ctx: envNumber(env, ["OLLAMA_NUM_CTX"]) }
                  : {}),
              },
            }
          : {
              model: config.model,
              messages: messagesForProvider(messages, config),
              temperature,
              max_tokens: maxTokens,
              ...(shouldDisableReasoning(config) ? { think: false } : {}),
              ...(responseFormat && !shouldDisableReasoning(config)
                ? { response_format: { type: responseFormat } }
                : {}),
            },
      ),
    });
    const body = await response.text();

    if (!response.ok) {
      throw new LlmAdapterError(
        isQuotaOrAuthFailure(response.status)
          ? "provider-quota"
          : "provider-failure",
        `LLM provider returned HTTP ${response.status}.`,
      );
    }

    const content = config.providerKind === "ollama"
      ? extractModelText(safeJsonParse(body)) || extractOllamaStreamText(body)
      : extractModelText(safeJsonParse(body));
    if (!content) {
      throw new LlmAdapterError(
        "invalid-json",
        "LLM response did not include message content.",
      );
    }

    logger.info(
      {
        purpose,
        featureName,
        model: config.model,
        providerKind: config.providerKind,
        endpointConfigured: Boolean(endpoint),
        durationMs: Date.now() - startedAt,
        timeoutMs: config.timeoutMs,
      },
      "LLM request completed",
    );
    if (config.providerKind === "school") {
      recordSchoolUsage({
        featureName,
        model: config.model,
        status: "success",
        latencyMs: Date.now() - startedAt,
        estimatedInputTokens,
        estimatedOutputTokens: estimateTokens(content),
        createdAt: new Date().toISOString(),
      });
    }
    return content;
  } catch (error) {
    const adapterError =
      error instanceof LlmAdapterError
        ? error
        : error instanceof Error && error.name === "AbortError"
          ? new LlmAdapterError("provider-timeout", "LLM request timed out.", error)
          : new LlmAdapterError("provider-failure", "LLM request failed.", error);
    logger.warn(
      {
        purpose,
        featureName,
        model: config.model,
        providerKind: config.providerKind,
        endpointConfigured: Boolean(endpoint),
        durationMs: Date.now() - startedAt,
        timeoutMs: config.timeoutMs,
        fallbackReason: errorCode(adapterError),
      },
      "LLM request fell back",
    );
    if (config.providerKind === "school") {
      recordSchoolUsage({
        featureName,
        model: config.model,
        status: schoolUsageStatusFromError(adapterError),
        latencyMs: Date.now() - startedAt,
        estimatedInputTokens,
        estimatedOutputTokens: 0,
        createdAt: new Date().toISOString(),
      });
    }
    throw adapterError;
  } finally {
    clearTimeout(timeout);
  }
}
