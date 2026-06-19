import { logger } from "../lib/logger";

export type LlmRequestPurpose =
  | "planner"
  | "summarizer"
  | "report_writer"
  | "section_writer";

export type LlmAdapterErrorCode =
  | "provider-unconfigured"
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
}

export interface ChatCompletionRequest {
  purpose: LlmRequestPurpose;
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

const DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
const DEFAULT_MODEL = "qwen3:4b";
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

export function resolveLlmConfig(
  purpose: LlmRequestPurpose,
  overrides: Partial<OpenAICompatibleLlmConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedLlmConfig {
  const explicitlyDisabled =
    Object.prototype.hasOwnProperty.call(overrides, "apiKey") &&
    !overrides.apiKey?.trim();
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
    envValue(env, "OPENAI_MODEL") ??
    DEFAULT_MODEL;
  const timeoutMs =
    overrides.timeoutMs ??
    envNumber(env, [...PURPOSE_TIMEOUT_ENV_KEYS[purpose], "LLM_TIMEOUT_MS"]) ??
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
  };
}

function chatCompletionsUrl(baseUrl: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBase);
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

export function safeJsonParse(text: string): unknown {
  const stripped = stripJsonFence(text);
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1));
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
  );
}

function errorCode(error: unknown): string {
  if (error instanceof LlmAdapterError) return error.code;
  if (error instanceof Error) return error.name || "Error";
  return "unknown";
}

export async function requestOpenAICompatibleChatCompletion({
  purpose,
  messages,
  temperature = 0,
  maxTokens = 1_200,
  responseFormat,
  llm,
  fetchImpl = fetch,
  env = process.env,
}: ChatCompletionRequest): Promise<string> {
  const config = resolveLlmConfig(purpose, llm, env);
  if (config.disabled) {
    throw new LlmAdapterError(
      "provider-unconfigured",
      "LLM request was explicitly disabled.",
    );
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey?.trim()) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    const response = await fetchImpl(chatCompletionsUrl(config.baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: messagesForProvider(messages, config),
        temperature,
        max_tokens: maxTokens,
        ...(shouldDisableReasoning(config) ? { think: false } : {}),
        ...(responseFormat && !shouldDisableReasoning(config)
          ? { response_format: { type: responseFormat } }
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

    logger.info(
      {
        purpose,
        model: config.model,
        baseUrl: config.baseUrl,
        durationMs: Date.now() - startedAt,
        timeoutMs: config.timeoutMs,
      },
      "LLM request completed",
    );
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
        model: config.model,
        baseUrl: config.baseUrl,
        durationMs: Date.now() - startedAt,
        timeoutMs: config.timeoutMs,
        fallbackReason: errorCode(adapterError),
      },
      "LLM request fell back",
    );
    throw adapterError;
  } finally {
    clearTimeout(timeout);
  }
}
