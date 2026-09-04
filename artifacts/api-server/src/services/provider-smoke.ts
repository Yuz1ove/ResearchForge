import {
  type LlmProviderName,
  redactSecret,
  resolvePrivateLlmProviderConfig,
  toSafeLlmProviderConfig,
} from "../config/llm-provider-config";
import { extractModelText, safeJsonParse } from "./llm-adapter";
import { redactKnownSecrets } from "./llm/schoolProvider";

export type ProviderSmokeEndpoint = "auto" | "models" | "chat" | "responses";

export type ProviderSmokeFailureCode =
  | "missing_key"
  | "base_url_missing"
  | "invalid_key"
  | "unauthorized"
  | "forbidden"
  | "quota_exceeded"
  | "rate_limited"
  | "model_not_found"
  | "endpoint_not_supported"
  | "wrong_base_url"
  | "timeout"
  | "network_error"
  | "non_json_response"
  | "provider_server_error"
  | "unknown_error";

export interface ProviderSmokeOptions {
  provider?: LlmProviderName | "auto";
  json?: boolean;
  skipGeneration?: boolean;
  model?: string | null;
  endpoint?: ProviderSmokeEndpoint;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export interface ProviderSmokeCheck {
  ok: boolean;
  endpoint: string;
  httpStatus: number | null;
  latencyMs: number;
  errorCode?: ProviderSmokeFailureCode;
  errorMessage?: string;
}

export interface ProviderSmokeAuthResult extends ProviderSmokeCheck {
  modelCount: number;
  firstModels: string[];
}

export interface ProviderSmokeGenerationResult extends ProviderSmokeCheck {
  skipped: boolean;
  outputPreview: string | null;
}

export interface ProviderSmokeResult {
  ok: boolean;
  checkedAt: string;
  provider: LlmProviderName;
  baseURL: string | null;
  configured: boolean;
  credentialPresent: boolean;
  credentialPreview: string;
  model: string | null;
  auth: ProviderSmokeAuthResult;
  generation: ProviderSmokeGenerationResult;
  warnings: string[];
  failures: Array<{
    code: ProviderSmokeFailureCode;
    endpoint: string;
    httpStatus: number | null;
    message: string;
  }>;
}

function endpointUrl(baseURL: string, endpoint: string): string {
  const normalizedBase = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  return new URL(endpoint.replace(/^\/+/, ""), normalizedBase).toString();
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function previewBody(body: string, env: NodeJS.ProcessEnv): string {
  return redactKnownSecrets(body.replace(/\s+/g, " ").trim().slice(0, 240), env);
}

export function classifyProviderSmokeHttpError(
  status: number,
  body = "",
  endpoint: string,
): ProviderSmokeFailureCode {
  const text = body.toLowerCase();
  const quotaSignal = /quota|billing|insufficient|monthly[_ -]?limit|daily[_ -]?limit|usage[_ -]?limit/.test(text);
  if (status === 401) {
    return /invalid|key|token|credential/.test(text) ? "invalid_key" : "unauthorized";
  }
  // Some OpenAI-compatible gateways report an exhausted allocation as 403
  // rather than 429. Preserve the provider's explicit classification instead
  // of collapsing every 403 into a generic authorization failure.
  if (status === 403) return quotaSignal ? "quota_exceeded" : "forbidden";
  if (status === 404) {
    return endpoint === "/models" ? "wrong_base_url" : "endpoint_not_supported";
  }
  if (status === 429) {
    return quotaSignal ? "quota_exceeded" : "rate_limited";
  }
  if (status >= 500) return "provider_server_error";
  if (/model.*not.*found|unknown model|does not exist/.test(text)) return "model_not_found";
  return "unknown_error";
}

function modelIdsFromPayload(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.map((item) => modelId(item)).filter((id): id is string => Boolean(id));
  }
  if (!payload || typeof payload !== "object") return [];
  const data = payload as Record<string, unknown>;
  const candidates = Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.models)
      ? data.models
      : [];
  return candidates.map((item) => modelId(item)).filter((id): id is string => Boolean(id));
}

function modelId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return typeof data.id === "string" && data.id.trim()
    ? data.id.trim()
    : typeof data.name === "string" && data.name.trim()
      ? data.name.trim()
      : null;
}

async function fetchText(input: {
  url: string;
  init: RequestInit;
  fetchImpl: NonNullable<ProviderSmokeOptions["fetchImpl"]>;
  timeoutMs: number;
}): Promise<{ response: Response; body: string; latencyMs: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await input.fetchImpl(input.url, {
      ...input.init,
      signal: controller.signal,
    });
    return {
      response,
      body: await response.text(),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function failure(
  code: ProviderSmokeFailureCode,
  endpoint: string,
  httpStatus: number | null,
  message: string,
) {
  return { code, endpoint, httpStatus, message };
}

async function checkModels(input: {
  baseURL: string;
  apiKey: string;
  fetchImpl: NonNullable<ProviderSmokeOptions["fetchImpl"]>;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}): Promise<{ auth: ProviderSmokeAuthResult; models: string[]; failure?: ReturnType<typeof failure> }> {
  const endpoint = "/models";
  try {
    const { response, body, latencyMs } = await fetchText({
      url: endpointUrl(input.baseURL, endpoint),
      init: { method: "GET", headers: headers(input.apiKey) },
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
    });
    if (!response.ok) {
      const errorCode = classifyProviderSmokeHttpError(response.status, body, endpoint);
      const message = previewBody(body, input.env) || `HTTP ${response.status}`;
      return {
        auth: {
          ok: false,
          endpoint,
          httpStatus: response.status,
          latencyMs,
          modelCount: 0,
          firstModels: [],
          errorCode,
          errorMessage: message,
        },
        models: [],
        failure: failure(errorCode, endpoint, response.status, message),
      };
    }

    let models: string[];
    try {
      models = modelIdsFromPayload(safeJsonParse(body));
    } catch {
      const message = previewBody(body, input.env) || "Provider returned non-JSON /models response.";
      return {
        auth: {
          ok: false,
          endpoint,
          httpStatus: response.status,
          latencyMs,
          modelCount: 0,
          firstModels: [],
          errorCode: "non_json_response",
          errorMessage: message,
        },
        models: [],
        failure: failure("non_json_response", endpoint, response.status, message),
      };
    }

    return {
      auth: {
        ok: true,
        endpoint,
        httpStatus: response.status,
        latencyMs,
        modelCount: models.length,
        firstModels: models.slice(0, 5),
      },
      models,
    };
  } catch (error) {
    const errorCode: ProviderSmokeFailureCode =
      error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error";
    const message = error instanceof Error ? previewBody(error.message, input.env) : "Network error";
    return {
      auth: {
        ok: false,
        endpoint,
        httpStatus: null,
        latencyMs: 0,
        modelCount: 0,
        firstModels: [],
        errorCode,
        errorMessage: message,
      },
      models: [],
      failure: failure(errorCode, endpoint, null, message),
    };
  }
}

async function checkGeneration(input: {
  baseURL: string;
  apiKey: string;
  model: string;
  endpoint: "/chat/completions" | "/responses";
  fetchImpl: NonNullable<ProviderSmokeOptions["fetchImpl"]>;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}): Promise<{ generation: ProviderSmokeGenerationResult; failure?: ReturnType<typeof failure> }> {
  const expectedOutput = "PING_OK";
  const body =
    input.endpoint === "/chat/completions"
      ? {
          model: input.model,
          messages: [{ role: "user", content: `Reply with exactly: ${expectedOutput}` }],
          max_tokens: 8,
          temperature: 0,
        }
      : {
          model: input.model,
          input: `Reply with exactly: ${expectedOutput}`,
          max_output_tokens: 8,
          store: false,
        };

  try {
    const { response, body: responseBody, latencyMs } = await fetchText({
      url: endpointUrl(input.baseURL, input.endpoint),
      init: {
        method: "POST",
        headers: headers(input.apiKey),
        body: JSON.stringify(body),
      },
      fetchImpl: input.fetchImpl,
      timeoutMs: input.timeoutMs,
    });

    if (!response.ok) {
      const errorCode = classifyProviderSmokeHttpError(response.status, responseBody, input.endpoint);
      const message = previewBody(responseBody, input.env) || `HTTP ${response.status}`;
      return {
        generation: {
          skipped: false,
          ok: false,
          endpoint: input.endpoint,
          httpStatus: response.status,
          latencyMs,
          outputPreview: null,
          errorCode,
          errorMessage: message,
        },
        failure: failure(errorCode, input.endpoint, response.status, message),
      };
    }

    let output = "";
    try {
      output = extractModelText(safeJsonParse(responseBody)).replace(/\s+/g, " ").trim();
    } catch {
      const message = previewBody(responseBody, input.env) || "Provider returned non-JSON generation response.";
      return {
        generation: {
          skipped: false,
          ok: false,
          endpoint: input.endpoint,
          httpStatus: response.status,
          latencyMs,
          outputPreview: null,
          errorCode: "non_json_response",
          errorMessage: message,
        },
        failure: failure("non_json_response", input.endpoint, response.status, message),
      };
    }

    const outputMatches = output === expectedOutput;
    return {
      generation: {
        skipped: false,
        ok: outputMatches,
        endpoint: input.endpoint,
        httpStatus: response.status,
        latencyMs,
        outputPreview: output.slice(0, 80),
        ...(outputMatches
          ? {}
          : {
              errorCode: "unknown_error" as const,
              errorMessage: output
                ? `Provider output did not match ${expectedOutput}.`
                : "Empty generation output.",
            }),
      },
    };
  } catch (error) {
    const errorCode: ProviderSmokeFailureCode =
      error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error";
    const message = error instanceof Error ? previewBody(error.message, input.env) : "Network error";
    return {
      generation: {
        skipped: false,
        ok: false,
        endpoint: input.endpoint,
        httpStatus: null,
        latencyMs: 0,
        outputPreview: null,
        errorCode,
        errorMessage: message,
      },
      failure: failure(errorCode, input.endpoint, null, message),
    };
  }
}

export async function runProviderSmokeTest(
  options: ProviderSmokeOptions = {},
): Promise<ProviderSmokeResult> {
  const env = options.env ?? process.env;
  const privateConfig = resolvePrivateLlmProviderConfig({
    env,
    provider: options.provider ?? "auto",
    model: options.model,
  });
  const safeConfig = toSafeLlmProviderConfig(privateConfig);
  const failures: ProviderSmokeResult["failures"] = [];
  const warnings: string[] = [];
  const timeoutMs = options.timeoutMs ?? 20_000;
  const endpoint = options.endpoint ?? "auto";
  const fetchImpl = options.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();

  const missingFailure = !privateConfig.apiKeyConfigured
    ? failure("missing_key", "config", null, `${privateConfig.provider} API key is missing.`)
    : !privateConfig.baseURLConfigured
      ? failure("base_url_missing", "config", null, `${privateConfig.provider} base URL is missing.`)
      : null;

  if (missingFailure || !privateConfig.apiKey || !privateConfig.baseURL) {
    if (missingFailure) failures.push(missingFailure);
    return {
      ok: false,
      checkedAt,
      provider: safeConfig.provider,
      baseURL: safeConfig.baseURL,
      configured: safeConfig.available,
      credentialPresent: safeConfig.apiKeyConfigured,
      credentialPreview: safeConfig.credentialPreview,
      model: safeConfig.model,
      auth: {
        ok: false,
        endpoint: "/models",
        httpStatus: null,
        latencyMs: 0,
        modelCount: 0,
        firstModels: [],
        errorCode: missingFailure?.code ?? "missing_key",
        errorMessage: missingFailure?.message ?? "Provider is unconfigured.",
      },
      generation: {
        skipped: true,
        ok: false,
        endpoint: endpoint === "responses" ? "/responses" : "/chat/completions",
        httpStatus: null,
        latencyMs: 0,
        outputPreview: null,
      },
      warnings,
      failures,
    };
  }

  const authResult =
    endpoint === "chat" || endpoint === "responses"
      ? {
          auth: {
            ok: true,
            endpoint: "/models",
            httpStatus: null,
            latencyMs: 0,
            modelCount: 0,
            firstModels: [],
          },
          models: [],
        }
      : await checkModels({
          baseURL: privateConfig.baseURL,
          apiKey: privateConfig.apiKey,
          fetchImpl,
          timeoutMs,
          env,
        });
  if (authResult.failure) failures.push(authResult.failure);
  if (!authResult.auth.ok) {
    return {
      ok: false,
      checkedAt,
      provider: safeConfig.provider,
      baseURL: safeConfig.baseURL,
      configured: safeConfig.available,
      credentialPresent: safeConfig.apiKeyConfigured,
      credentialPreview: redactSecret(privateConfig.apiKey),
      model: privateConfig.model,
      auth: authResult.auth,
      generation: {
        skipped: true,
        ok: false,
        endpoint: endpoint === "responses" ? "/responses" : "/chat/completions",
        httpStatus: null,
        latencyMs: 0,
        outputPreview: null,
      },
      warnings,
      failures,
    };
  }

  const selectedModel = options.model?.trim() || privateConfig.model || authResult.models[0] || null;
  if (!privateConfig.model && selectedModel) {
    warnings.push("Model inferred from /models; set SCHOOL_LLM_MODEL or OPENAI_MODEL for generation.");
  }

  if (options.skipGeneration || endpoint === "models") {
    return {
      ok: authResult.auth.ok,
      checkedAt,
      provider: safeConfig.provider,
      baseURL: safeConfig.baseURL,
      configured: safeConfig.available,
      credentialPresent: safeConfig.apiKeyConfigured,
      credentialPreview: redactSecret(privateConfig.apiKey),
      model: selectedModel,
      auth: authResult.auth,
      generation: {
        skipped: true,
        ok: true,
        endpoint: "/chat/completions",
        httpStatus: null,
        latencyMs: 0,
        outputPreview: null,
      },
      warnings,
      failures,
    };
  }

  if (!selectedModel) {
    const item = failure("model_not_found", "config", null, "No model configured and /models returned no model ids.");
    failures.push(item);
    return {
      ok: false,
      checkedAt,
      provider: safeConfig.provider,
      baseURL: safeConfig.baseURL,
      configured: safeConfig.available,
      credentialPresent: safeConfig.apiKeyConfigured,
      credentialPreview: redactSecret(privateConfig.apiKey),
      model: null,
      auth: authResult.auth,
      generation: {
        skipped: false,
        ok: false,
        endpoint: "/chat/completions",
        httpStatus: null,
        latencyMs: 0,
        outputPreview: null,
        errorCode: "model_not_found",
        errorMessage: item.message,
      },
      warnings,
      failures,
    };
  }

  const firstEndpoint: "/chat/completions" | "/responses" =
    endpoint === "responses" ? "/responses" : "/chat/completions";
  let generationResult = await checkGeneration({
    baseURL: privateConfig.baseURL,
    apiKey: privateConfig.apiKey,
    model: selectedModel,
    endpoint: firstEndpoint,
    fetchImpl,
    timeoutMs,
    env,
  });

  if (
    endpoint === "auto" &&
    generationResult.generation.endpoint === "/chat/completions" &&
    generationResult.generation.errorCode === "endpoint_not_supported"
  ) {
    if (generationResult.failure) failures.push(generationResult.failure);
    generationResult = await checkGeneration({
      baseURL: privateConfig.baseURL,
      apiKey: privateConfig.apiKey,
      model: selectedModel,
      endpoint: "/responses",
      fetchImpl,
      timeoutMs,
      env,
    });
  }
  if (generationResult.failure) failures.push(generationResult.failure);

  return {
    ok: authResult.auth.ok && generationResult.generation.ok,
    checkedAt,
    provider: safeConfig.provider,
    baseURL: safeConfig.baseURL,
    configured: safeConfig.available,
    credentialPresent: safeConfig.apiKeyConfigured,
    credentialPreview: redactSecret(privateConfig.apiKey),
    model: selectedModel,
    auth: authResult.auth,
    generation: generationResult.generation,
    warnings,
    failures,
  };
}
