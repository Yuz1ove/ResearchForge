import { logger } from "../../lib/logger";
import { redactSecret } from "../../config/llm-provider-config";
import type {
  LlmRequestPurpose,
  OpenAICompatibleLlmConfig,
  OpenAICompatibleMessage,
} from "../llm-adapter";

export interface SchoolLlmProviderConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
}

export interface SchoolLlmUsageLogEntry {
  featureName: string;
  model: string;
  status: "success" | "failed" | "fallback" | "rate_limited" | "unconfigured";
  latencyMs: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  createdAt: string;
}

export interface SchoolRateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  remaining: number;
}

const DEFAULT_SCHOOL_PROVIDER = "school-openai-compatible";
const DEFAULT_SCHOOL_TIMEOUT_MS = 60_000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const SCHOOL_ENV_KEYS = [
  "SCHOOL_LLM_PROVIDER",
  "SCHOOL_LLM_API_KEY",
  "SCHOOL_LLM_BASE_URL",
  "SCHOOL_LLM_MODEL",
] as const;
const SECRET_ENV_KEYS = [
  "SCHOOL_LLM_API_KEY",
  "OPENAI_API_KEY",
] as const;

const requestBuckets = new Map<string, number[]>();
const usageLog: SchoolLlmUsageLogEntry[] = [];

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function envNumber(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = Number(envValue(env, key));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function schoolProviderEnvPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return SCHOOL_ENV_KEYS.some((key) => Boolean(envValue(env, key)));
}

export { redactSecret };

export function redactKnownSecrets(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  let sanitized = value;
  for (const key of SECRET_ENV_KEYS) {
    const secret = envValue(env, key);
    if (!secret) continue;
    sanitized = sanitized.split(secret).join(redactSecret(secret));
  }
  return sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [REDACTED]");
}

export function estimateTokens(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  const cjkCount = normalized.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  const latinWords = normalized.match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;
  const otherChars = Math.max(0, Array.from(normalized).length - cjkCount);
  return Math.max(1, Math.ceil(cjkCount * 0.9 + latinWords * 1.25 + otherChars / 4));
}

export function estimateMessageTokens(messages: OpenAICompatibleMessage[]): number {
  return messages.reduce((total, message) => {
    return total + estimateTokens(`${message.role}: ${message.content}`);
  }, 0);
}

export function resolveSchoolLlmConfig(
  overrides: Partial<OpenAICompatibleLlmConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
): SchoolLlmProviderConfig | null {
  if (!schoolProviderEnvPresent(env)) return null;

  const baseUrl = overrides.baseUrl ?? envValue(env, "SCHOOL_LLM_BASE_URL");
  const model = overrides.model ?? envValue(env, "SCHOOL_LLM_MODEL");
  const apiKey = overrides.apiKey ?? envValue(env, "SCHOOL_LLM_API_KEY");

  if (!baseUrl || !model || !apiKey) {
    return null;
  }

  return {
    provider: envValue(env, "SCHOOL_LLM_PROVIDER") ?? DEFAULT_SCHOOL_PROVIDER,
    baseUrl,
    apiKey,
    model,
    timeoutMs: overrides.timeoutMs ?? envNumber(env, "SCHOOL_LLM_TIMEOUT_MS"),
  };
}

export function missingSchoolConfigReason(
  overrides: Partial<OpenAICompatibleLlmConfig> = {},
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!schoolProviderEnvPresent(env)) return null;
  const missing: string[] = [];
  if (!(overrides.baseUrl ?? envValue(env, "SCHOOL_LLM_BASE_URL"))) {
    missing.push("SCHOOL_LLM_BASE_URL");
  }
  if (!(overrides.model ?? envValue(env, "SCHOOL_LLM_MODEL"))) {
    missing.push("SCHOOL_LLM_MODEL");
  }
  if (!(overrides.apiKey ?? envValue(env, "SCHOOL_LLM_API_KEY"))) {
    missing.push("SCHOOL_LLM_API_KEY");
  }
  return missing.length
    ? `Missing school LLM environment variable(s): ${missing.join(", ")}.`
    : null;
}

export function schoolTimeoutMs(
  purpose: LlmRequestPurpose,
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  const specific = envNumber(env, `SCHOOL_LLM_${purpose.toUpperCase()}_TIMEOUT_MS`);
  return specific ?? envNumber(env, "SCHOOL_LLM_TIMEOUT_MS") ?? DEFAULT_SCHOOL_TIMEOUT_MS;
}

export function checkSchoolRateLimit(
  featureName: string,
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
): SchoolRateLimitResult {
  const maxRequests = envNumber(env, "SCHOOL_LLM_RATE_LIMIT_MAX") ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
  const windowMs =
    envNumber(env, "SCHOOL_LLM_RATE_LIMIT_WINDOW_MS") ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const key = featureName.trim() || "unknown";
  const recent = (requestBuckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);

  if (recent.length >= maxRequests) {
    const oldest = recent[0] ?? now;
    requestBuckets.set(key, recent);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, windowMs - (now - oldest)),
      remaining: 0,
    };
  }

  recent.push(now);
  requestBuckets.set(key, recent);
  return {
    allowed: true,
    retryAfterMs: 0,
    remaining: Math.max(0, maxRequests - recent.length),
  };
}

export function recordSchoolUsage(entry: SchoolLlmUsageLogEntry): void {
  usageLog.push(entry);
  if (usageLog.length > 500) usageLog.splice(0, usageLog.length - 500);
  logger.info(
    {
      featureName: entry.featureName,
      model: entry.model,
      status: entry.status,
      latencyMs: entry.latencyMs,
      estimatedInputTokens: entry.estimatedInputTokens,
      estimatedOutputTokens: entry.estimatedOutputTokens,
      createdAt: entry.createdAt,
    },
    "School LLM usage",
  );
}

export function readSchoolUsageLog(): SchoolLlmUsageLogEntry[] {
  return [...usageLog];
}

export function schoolProviderLabel(env: NodeJS.ProcessEnv = process.env): string {
  return envValue(env, "SCHOOL_LLM_PROVIDER")?.toLowerCase() ?? DEFAULT_SCHOOL_PROVIDER;
}
