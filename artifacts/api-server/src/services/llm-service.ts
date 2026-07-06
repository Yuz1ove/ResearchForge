import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
import { logger } from "../lib/logger";
import {
  type LlmCompatibleMode,
  type LlmConfigStatus,
  type LlmProviderName,
  redactSecret,
  resolvePrivateLlmProviderConfig,
  resolveSafeLlmProviderConfig,
} from "../config/llm-provider-config";
import {
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  LlmAdapterError,
  extractModelText,
  resolveOpenAiModelAlias,
  requestOpenAICompatibleChatCompletion,
  resolveLlmConfig,
  safeJsonParse,
  type ChatCompletionRequest,
  type LlmRequestPurpose,
  type OpenAICompatibleLlmConfig,
  type OpenAICompatibleMessage,
} from "./llm-adapter";
import { runProviderSmokeTest } from "./provider-smoke";
import {
  redactKnownSecrets,
  schoolProviderEnvPresent,
  schoolProviderLabel,
} from "./llm/schoolProvider";

export type LlmServiceOperation =
  | "topic_expansion"
  | "source_summary"
  | "claim_extraction"
  | "report_generation";

export interface RequestLlmTextOptions {
  operation: LlmServiceOperation;
  featureName?: string;
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

export interface LlmHealthResult {
  ok: boolean;
  provider: LlmProviderName | string;
  configuredModel: string | null;
  resolvedModel: string | null;
  apiKeyPresent: boolean;
  apiKeyPrefix: string | null;
  apiKeyConfigured: boolean;
  baseURL: string | null;
  baseURLConfigured: boolean;
  credentialPreview: string;
  modelsEndpointReachable: boolean;
  modelAvailable: boolean;
  modelConfigured: boolean;
  compatibleMode: LlmCompatibleMode;
  missing: string[];
  source: string;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
  available: boolean;
  status: LlmConfigStatus | "unavailable" | "error";
  model: string | null;
  latencyMs: number;
}

export interface LlmSmokeResult {
  ok: boolean;
  provider: string;
  requestedModel: string;
  actualModel: string | null;
  text: string | null;
  usage?: unknown;
  checkedAt: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  available: boolean;
  status:
    | "ok"
    | "unconfigured"
    | "fallback_used"
    | "wrong_adapter"
    | "wrong_model"
    | "unavailable"
    | "error";
  model: string;
  adapter: string;
  fallbackUsed: boolean;
  latencyMs: number;
  normalizedText?: string;
}

export function expectedOpenAiModel(env: NodeJS.ProcessEnv = process.env): string {
  return resolveOpenAiModelAlias(
    env.OPENAI_MODEL?.trim() ||
      env.LLM_MODEL?.trim() ||
      env.SCHOOL_LLM_MODEL?.trim() ||
      DEFAULT_OPENAI_MODEL,
  );
}

export function providerLabel(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const configuredProvider = env.LLM_PROVIDER?.trim();
  if (configuredProvider) return configuredProvider.toLowerCase();
  if (schoolProviderEnvPresent(env)) return schoolProviderLabel(env);
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

function safeApiKeyPrefix(apiKey: string | undefined): string | null {
  const key = apiKey?.trim();
  if (!key) return null;
  return redactSecret(key);
}

export function classifyLlmHttpError(status: number, message = ""): string {
  if (status === 401 || /invalid.*api.*key/i.test(message)) return "invalid_api_key";
  if (status === 404) return "model_not_found";
  if (status === 429) {
    return /quota|billing|insufficient/i.test(message)
      ? "quota_exceeded"
      : "rate_limited";
  }
  if (status >= 500) return "network_error";
  if (status === 400 && /base.?url|endpoint/i.test(message)) return "base_url_error";
  return "unknown_error";
}

function redactOpenAiErrorMessage(message: string, env: NodeJS.ProcessEnv): string {
  return redactKnownSecrets(message, env).replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

function openAiJsonHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function modelEndpoint(baseUrl: string, model: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`models/${encodeURIComponent(model)}`, normalizedBase).toString();
}

function responsesEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("responses", normalizedBase).toString();
}

export function llmEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBase).toString();
}

export function statusFromLlmError(error: unknown): LlmStructuredStatus {
  if (!(error instanceof LlmAdapterError)) return "error";
  if (
    error.code === "provider-unconfigured" ||
    error.code === "model-missing" ||
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
  if (error instanceof Error && error.message.trim()) {
    return redactKnownSecrets(error.message.trim());
  }
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
      return "AI 服務暫時不可用，已使用本地規則 fallback。";
    case "error":
      return "AI 服務暫時不可用，已使用本地規則 fallback。";
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
      featureName: options.featureName ?? options.operation,
      purpose: options.purpose,
      provider,
      model: resolved.model,
      endpointConfigured: Boolean(endpoint),
      timeoutMs: resolved.timeoutMs,
    },
    "LLM request starting",
  );

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: options.purpose,
    featureName: options.featureName ?? options.operation,
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

export async function checkLlmHealth(options: {
  fetchImpl?: ChatCompletionRequest["fetchImpl"];
  env?: NodeJS.ProcessEnv;
} = {}): Promise<LlmHealthResult> {
  const startedAt = Date.now();
  const env = options.env ?? process.env;
  const checkedAt = new Date().toISOString();
  const privateConfig = resolvePrivateLlmProviderConfig({ env });
  const safeConfig = resolveSafeLlmProviderConfig({ env });
  const missingCredentials = privateConfig.missing.filter((item) => /API_KEY|BASE_URL/.test(item));
  const modelWarning =
    privateConfig.available && !privateConfig.modelConfigured
      ? "LLM credentials configured, but model is not explicitly configured. Smoke test can infer a model from /models, or set SCHOOL_LLM_MODEL."
      : null;
  const credentialError =
    privateConfig.status === "partially_configured"
      ? `Missing LLM environment variable(s): ${missingCredentials.join(", ")}.`
      : privateConfig.status === "unconfigured"
        ? "LLM provider credentials are not configured."
        : null;

  return {
    ok: privateConfig.available,
    provider: safeConfig.provider,
    configuredModel: safeConfig.model,
    resolvedModel: safeConfig.model,
    apiKeyPresent: safeConfig.apiKeyConfigured,
    apiKeyPrefix: privateConfig.apiKey ? safeApiKeyPrefix(privateConfig.apiKey) : null,
    apiKeyConfigured: safeConfig.apiKeyConfigured,
    baseURL: safeConfig.baseURL,
    baseURLConfigured: safeConfig.baseURLConfigured,
    credentialPreview: safeConfig.credentialPreview,
    modelsEndpointReachable: false,
    modelAvailable: safeConfig.modelConfigured,
    modelConfigured: safeConfig.modelConfigured,
    compatibleMode: safeConfig.compatibleMode,
    missing: safeConfig.missing,
    source: safeConfig.source,
    errorCode: credentialError
      ? privateConfig.status === "unconfigured"
        ? "provider_unconfigured"
        : missingCredentials.some((item) => /API_KEY/.test(item))
          ? "missing_key"
          : missingCredentials.some((item) => /BASE_URL/.test(item))
            ? "base_url_missing"
        : "provider_partially_configured"
      : modelWarning
        ? "MODEL_MISSING"
        : null,
    errorMessage: credentialError ?? modelWarning,
    checkedAt,
    available: privateConfig.available,
    status: safeConfig.status,
    model: safeConfig.model,
    latencyMs: Date.now() - startedAt,
  };
}

export async function runLlmSmokeTest(options: {
  fetchImpl?: ChatCompletionRequest["fetchImpl"];
  env?: NodeJS.ProcessEnv;
} = {}): Promise<LlmSmokeResult> {
  const startedAt = Date.now();
  const env = options.env ?? process.env;
  const checkedAt = new Date().toISOString();
  const result = await runProviderSmokeTest({
    provider: "auto",
    fetchImpl: options.fetchImpl,
    env,
  });
  const firstFailure = result.failures[0];
  const requestedModel = result.model ?? expectedOpenAiModel(env);
  return {
    ok: result.ok,
    provider: result.provider,
    requestedModel,
    actualModel: result.model,
    text: result.generation.outputPreview,
    checkedAt: result.checkedAt || checkedAt,
    errorCode: result.ok ? null : firstFailure?.code ?? null,
    errorMessage: result.ok ? null : firstFailure?.message ?? null,
    available: result.ok,
    status: result.ok
      ? "ok"
      : firstFailure?.code === "model_not_found"
        ? "wrong_model"
        : firstFailure?.code === "missing_key" || firstFailure?.code === "base_url_missing"
          ? "unconfigured"
          : "unavailable",
    model: requestedModel,
    adapter: result.provider,
    fallbackUsed: false,
    latencyMs: Date.now() - startedAt,
    normalizedText: result.generation.outputPreview ?? undefined,
  };
}
