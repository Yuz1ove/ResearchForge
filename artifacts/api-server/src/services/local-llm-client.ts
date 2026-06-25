import { createHash } from "node:crypto";
import {
  LlmAdapterError,
  requestOpenAICompatibleChatCompletion,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";

export type LocalLlmStatus = "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";

export interface LocalLlmDiagnostics {
  usedLocalLlm: boolean;
  fallbackReason?: string;
  model?: string;
  latencyMs?: number;
  status: LocalLlmStatus;
}

export interface LocalLlmRequest<T> {
  purpose: "planner" | "summarizer";
  llm?: Partial<OpenAICompatibleLlmConfig>;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  validate: (value: unknown) => T | null;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export interface LocalLlmResult<T> {
  value: T | null;
  diagnostics: LocalLlmDiagnostics;
}

function enabledFromEnv(env = process.env): boolean {
  const value = env.LOCAL_LLM_ENABLED?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function modelHasTags(model: string, tagsText: string): boolean {
  return tagsText.toLowerCase().includes(model.toLowerCase());
}

export async function requestLocalLlmJson<T>(
  request: LocalLlmRequest<T>,
): Promise<LocalLlmResult<T>> {
  const diagnostics: LocalLlmDiagnostics = {
    usedLocalLlm: false,
    status: "skipped",
  };

  if (!enabledFromEnv()) {
    diagnostics.fallbackReason = "local-llm-disabled";
    return { value: null, diagnostics };
  }

  const baseUrl = request.llm?.baseUrl?.trim() || process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const model = request.llm?.model?.trim() || process.env.OLLAMA_MODEL?.trim() || "";
  if (!model) {
    diagnostics.fallbackReason = "missing-model";
    return { value: null, diagnostics };
  }

  const tagsUrl = new URL("/api/tags", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const startedAt = Date.now();
  diagnostics.model = model;

  try {
    const tagsResponse = await (request.fetchImpl ?? fetch)(tagsUrl);
    if (!tagsResponse.ok) {
      diagnostics.fallbackReason = `tags-http-${tagsResponse.status}`;
      return { value: null, diagnostics };
    }
    const tagsPayload = await tagsResponse.text();
    const hasModel = modelHasTags(model, tagsPayload);
    if (!hasModel) {
      diagnostics.fallbackReason = "model-not-found";
      return { value: null, diagnostics };
    }

    const content = await requestOpenAICompatibleChatCompletion({
      purpose: request.purpose,
      messages: request.messages,
      responseFormat: "json_object",
      llm: {
        baseUrl: baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl.replace(/\/+$/, "")}/v1`,
        model,
        timeoutMs: request.timeoutMs,
        ...request.llm,
      },
      fetchImpl: request.fetchImpl,
    });

    const parsed = safeJsonParse(content);
    const value = request.validate(parsed);
    if (!value) {
      diagnostics.fallbackReason = "validation-failed";
      diagnostics.status = "failed";
      diagnostics.latencyMs = Date.now() - startedAt;
      return { value: null, diagnostics };
    }

    diagnostics.usedLocalLlm = true;
    diagnostics.status = "success";
    diagnostics.latencyMs = Date.now() - startedAt;
    return { value, diagnostics };
  } catch (error) {
    diagnostics.latencyMs = Date.now() - startedAt;
    diagnostics.status =
      error instanceof LlmAdapterError && error.code === "provider-timeout"
        ? "timeout"
        : error instanceof LlmAdapterError && error.code === "provider-quota"
          ? "quota_exceeded"
          : "failed";
    diagnostics.fallbackReason =
      error instanceof LlmAdapterError ? error.code : "local-llm-failed";
    return { value: null, diagnostics };
  }
}
