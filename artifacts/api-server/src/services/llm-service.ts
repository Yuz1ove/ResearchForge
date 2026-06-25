import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
import { logger } from "../lib/logger";
import {
  LlmAdapterError,
  requestOpenAICompatibleChatCompletion,
  resolveLlmConfig,
  type ChatCompletionRequest,
  type LlmRequestPurpose,
  type OpenAICompatibleLlmConfig,
  type OpenAICompatibleMessage,
} from "./llm-adapter";

export type LlmServiceOperation =
  | "topic_expansion"
  | "source_summary"
  | "report_generation";

export interface RequestLlmTextOptions {
  operation: LlmServiceOperation;
  purpose: LlmRequestPurpose;
  messages: OpenAICompatibleMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: ChatCompletionRequest["responseFormat"];
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: ChatCompletionRequest["fetchImpl"];
  env?: NodeJS.ProcessEnv;
}

export interface LlmServiceSuccess {
  content: string;
  provider: string;
  model: string;
  baseUrl: string;
  endpoint: string;
  timeoutMs: number;
}

export function providerLabel(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredProvider = env.LLM_PROVIDER?.trim();
  if (configuredProvider) return configuredProvider.toLowerCase();
  try {
    const url = new URL(baseUrl);
    if (
      url.port === "11434" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    ) {
      return "ollama";
    }
  } catch {
    // Keep opaque URLs as generic OpenAI-compatible providers.
  }
  return "openai-compatible";
}

export function llmEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBase).toString();
}

export function statusFromLlmError(error: unknown): LlmStructuredStatus {
  if (!(error instanceof LlmAdapterError)) return "error";
  if (
    error.code === "provider-unconfigured" ||
    error.code === "provider-timeout" ||
    error.code === "provider-quota" ||
    error.code === "provider-failure"
  ) {
    return "unavailable";
  }
  return "error";
}

export function reasonFromError(error: unknown): string {
  if (error instanceof LlmAdapterError) return error.code;
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return "unknown_error";
}

export function messageFromStatus(
  status: LlmStructuredStatus,
  operation: LlmServiceOperation,
): string {
  switch (status) {
    case "invalid_input":
      return operation === "topic_expansion"
        ? "輸入內容不像有效研究主題，暫時無法擴寫。"
        : "輸入內容無法交給 LLM 處理。";
    case "insufficient_sources":
      return "目前資料不足，尚無法生成可信內容。";
    case "unavailable":
      return "LLM 服務暫時不可用，未生成 AI 內容。";
    case "error":
      return "LLM 回應異常，未生成 AI 內容。";
    case "success":
    default:
      return "LLM 生成成功。";
  }
}

export function logLlmFallback(input: {
  operation: LlmServiceOperation;
  status: LlmStructuredStatus;
  provider: string;
  model: string | null;
  endpoint: string | null;
  reason: string;
  route?: string;
}): void {
  logger.warn(
    {
      operation: input.operation,
      structuredStatus: input.status,
      provider: input.provider,
      model: input.model,
      endpoint: input.endpoint,
      fallbackReason: input.reason,
      route: input.route,
    },
    "LLM fallback triggered",
  );
}

export async function requestLlmText(
  options: RequestLlmTextOptions,
): Promise<LlmServiceSuccess> {
  const resolved = resolveLlmConfig(options.purpose, options.llm, options.env);
  const provider = providerLabel(resolved.baseUrl, options.env);
  const endpoint = llmEndpoint(resolved.baseUrl);

  logger.info(
    {
      operation: options.operation,
      purpose: options.purpose,
      provider,
      model: resolved.model,
      endpoint,
      timeoutMs: resolved.timeoutMs,
    },
    "LLM request starting",
  );

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: options.purpose,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    responseFormat: options.responseFormat,
    llm: options.llm,
    fetchImpl: options.fetchImpl,
    env: options.env,
  });

  return {
    content,
    provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    endpoint,
    timeoutMs: resolved.timeoutMs,
  };
}
