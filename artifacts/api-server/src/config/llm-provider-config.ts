export type LlmProviderName = "school_llm" | "openai" | "unconfigured";

export type LlmCompatibleMode =
  | "openai_chat_completions"
  | "openai_responses"
  | "openai_responses_or_chat"
  | "unknown";

export type LlmConfigStatus =
  | "configured"
  | "unconfigured"
  | "partially_configured";

export type LlmConfigSource =
  | "school_llm_env"
  | "openai_env"
  | "explicit_options"
  | "unconfigured";

export interface PrivateLlmProviderConfig {
  available: boolean;
  provider: LlmProviderName;
  apiKey: string | null;
  apiKeyConfigured: boolean;
  baseURL: string | null;
  baseURLConfigured: boolean;
  credentialPreview: string;
  model: string | null;
  modelConfigured: boolean;
  compatibleMode: LlmCompatibleMode;
  status: LlmConfigStatus;
  missing: string[];
  source: LlmConfigSource;
}

export interface SafeLlmProviderConfig {
  available: boolean;
  provider: LlmProviderName;
  apiKeyConfigured: boolean;
  baseURLConfigured: boolean;
  credentialPreview: string;
  baseURL: string | null;
  model: string | null;
  modelConfigured: boolean;
  compatibleMode: LlmCompatibleMode;
  status: LlmConfigStatus;
  missing: string[];
  source: string;
}

export interface ResolveLlmProviderConfigOptions {
  env?: NodeJS.ProcessEnv;
  provider?: LlmProviderName | "auto";
  apiKey?: string | null;
  baseURL?: string | null;
  model?: string | null;
  compatibleMode?: LlmCompatibleMode;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const OPENAI_MODEL_ALIASES = new Map<string, string>([
  ["chatgpt5.4", "gpt-5.4"],
  ["chatgpt-5.4", "gpt-5.4"],
  ["chatgpt 5.4", "gpt-5.4"],
  ["gpt5.4", "gpt-5.4"],
  ["gpt-5.4", "gpt-5.4"],
]);

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

function cleanValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanCredential(value: string | null | undefined): string | null {
  const cleaned = value
    ?.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\[(?:A|B|C|D)/g, "")
    .trim();
  return cleaned ? cleaned : null;
}

function normalizeBaseURL(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

export function redactSecret(value: string | undefined | null): string {
  const trimmed = cleanCredential(value);
  if (!trimmed) return "(missing)";
  if (trimmed.length <= 8) return "***";
  return `${trimmed.slice(0, 7)}...${trimmed.slice(-4)}`;
}

function modelFromEnv(
  env: NodeJS.ProcessEnv,
  explicitModel?: string | null,
  provider: Exclude<LlmProviderName, "unconfigured"> | "auto" = "auto",
): string | null {
  const explicit = cleanValue(explicitModel);
  if (explicit) return explicit;
  if (provider === "openai") {
    return (
      envValue(env, "OPENAI_MODEL") ??
      envValue(env, "OPENAI_SMOKE_TEST_MODEL") ??
      envValue(env, "SCHOOL_LLM_MODEL") ??
      envValue(env, "SCHOOL_LLM_SMOKE_MODEL") ??
      envValue(env, "REPORT_MODEL") ??
      envValue(env, "LLM_MODEL") ??
      envValue(env, "REPORT_FAST_MODEL") ??
      null
    );
  }
  return (
    envValue(env, "SCHOOL_LLM_MODEL") ??
    envValue(env, "SCHOOL_LLM_SMOKE_MODEL") ??
    envValue(env, "OPENAI_MODEL") ??
    envValue(env, "OPENAI_SMOKE_TEST_MODEL") ??
    envValue(env, "REPORT_MODEL") ??
    envValue(env, "LLM_MODEL") ??
    envValue(env, "REPORT_FAST_MODEL") ??
    null
  );
}

function normalizeOpenAiModel(model: string | null): string | null {
  if (!model) return null;
  return OPENAI_MODEL_ALIASES.get(model.toLowerCase()) ?? model;
}

function buildProviderConfig(input: {
  provider: Exclude<LlmProviderName, "unconfigured">;
  apiKey: string | null;
  baseURL: string | null;
  model: string | null;
  missing: string[];
  source: LlmConfigSource;
  compatibleMode: LlmCompatibleMode;
}): PrivateLlmProviderConfig {
  const apiKeyConfigured = Boolean(input.apiKey);
  const baseURLConfigured = Boolean(input.baseURL);
  const missing = [...input.missing];
  const available = apiKeyConfigured && baseURLConfigured;
  return {
    available,
    provider: input.provider,
    apiKey: input.apiKey,
    apiKeyConfigured,
    baseURL: normalizeBaseURL(input.baseURL),
    baseURLConfigured,
    credentialPreview: redactSecret(input.apiKey),
    model: input.model,
    modelConfigured: Boolean(input.model),
    compatibleMode: input.compatibleMode,
    status: available ? "configured" : "partially_configured",
    missing,
    source: input.source,
  };
}

function schoolConfig(
  env: NodeJS.ProcessEnv,
  options: ResolveLlmProviderConfigOptions,
  source: LlmConfigSource,
): PrivateLlmProviderConfig {
  const apiKey = cleanCredential(options.apiKey ?? env.SCHOOL_LLM_API_KEY) ?? null;
  const baseURL = cleanValue(options.baseURL) ?? envValue(env, "SCHOOL_LLM_BASE_URL") ?? null;
  const missing: string[] = [];
  if (!apiKey) missing.push("SCHOOL_LLM_API_KEY");
  if (!baseURL) missing.push("SCHOOL_LLM_BASE_URL");
  return buildProviderConfig({
    provider: "school_llm",
    apiKey,
    baseURL,
    model: modelFromEnv(env, options.model, "school_llm"),
    missing,
    source,
    compatibleMode: options.compatibleMode ?? "openai_chat_completions",
  });
}

function openAiConfig(
  env: NodeJS.ProcessEnv,
  options: ResolveLlmProviderConfigOptions,
  source: LlmConfigSource,
): PrivateLlmProviderConfig {
  const apiKey = cleanCredential(options.apiKey ?? env.OPENAI_API_KEY) ?? null;
  const baseURL =
    cleanValue(options.baseURL) ?? envValue(env, "OPENAI_BASE_URL") ?? DEFAULT_OPENAI_BASE_URL;
  const missing: string[] = [];
  if (!apiKey) missing.push("OPENAI_API_KEY");
  return buildProviderConfig({
    provider: "openai",
    apiKey,
    baseURL,
    model: normalizeOpenAiModel(modelFromEnv(env, options.model, "openai")),
    missing,
    source,
    compatibleMode: options.compatibleMode ?? "openai_responses_or_chat",
  });
}

function unconfiguredConfig(env: NodeJS.ProcessEnv, options: ResolveLlmProviderConfigOptions): PrivateLlmProviderConfig {
  return {
    available: false,
    provider: "unconfigured",
    apiKey: null,
    apiKeyConfigured: false,
    baseURL: null,
    baseURLConfigured: false,
    credentialPreview: redactSecret(null),
    model: modelFromEnv(env, options.model),
    modelConfigured: Boolean(modelFromEnv(env, options.model)),
    compatibleMode: "unknown",
    status: "unconfigured",
    missing: ["SCHOOL_LLM_API_KEY", "SCHOOL_LLM_BASE_URL", "OPENAI_API_KEY"],
    source: "unconfigured",
  };
}

export function resolvePrivateLlmProviderConfig(
  options: ResolveLlmProviderConfigOptions = {},
): PrivateLlmProviderConfig {
  const env = options.env ?? process.env;
  const provider = options.provider ?? "auto";
  const hasExplicitCredential = Boolean(cleanValue(options.apiKey) || cleanValue(options.baseURL));
  const envProvider = envValue(env, "LLM_PROVIDER")?.toLowerCase();

  if (provider === "school_llm") {
    return schoolConfig(env, options, hasExplicitCredential ? "explicit_options" : "school_llm_env");
  }
  if (provider === "openai") {
    return openAiConfig(env, options, hasExplicitCredential ? "explicit_options" : "openai_env");
  }
  if (envProvider === "school_llm" || envProvider === "school") {
    return schoolConfig(env, options, hasExplicitCredential ? "explicit_options" : "school_llm_env");
  }
  if (envProvider === "openai") {
    return openAiConfig(env, options, hasExplicitCredential ? "explicit_options" : "openai_env");
  }

  const hasSchoolKey = Boolean(envValue(env, "SCHOOL_LLM_API_KEY"));
  const hasSchoolBaseURL = Boolean(envValue(env, "SCHOOL_LLM_BASE_URL"));
  if (hasSchoolKey || hasSchoolBaseURL) {
    return schoolConfig(env, options, "school_llm_env");
  }

  const hasOpenAiKey = Boolean(envValue(env, "OPENAI_API_KEY"));
  const hasOpenAiBaseURL = Boolean(envValue(env, "OPENAI_BASE_URL"));
  if (hasOpenAiKey || hasOpenAiBaseURL) {
    return openAiConfig(env, options, "openai_env");
  }

  if (hasExplicitCredential) {
    return schoolConfig(env, options, "explicit_options");
  }

  return unconfiguredConfig(env, options);
}

export function toSafeLlmProviderConfig(
  privateConfig: PrivateLlmProviderConfig,
): SafeLlmProviderConfig {
  return {
    available: privateConfig.available,
    provider: privateConfig.provider,
    apiKeyConfigured: privateConfig.apiKeyConfigured,
    baseURLConfigured: privateConfig.baseURLConfigured,
    credentialPreview: privateConfig.credentialPreview,
    baseURL: privateConfig.baseURL,
    model: privateConfig.model,
    modelConfigured: privateConfig.modelConfigured,
    compatibleMode: privateConfig.compatibleMode,
    status: privateConfig.status,
    missing: [...privateConfig.missing],
    source: privateConfig.source,
  };
}

export function resolveSafeLlmProviderConfig(
  options: ResolveLlmProviderConfigOptions = {},
): SafeLlmProviderConfig {
  return toSafeLlmProviderConfig(resolvePrivateLlmProviderConfig(options));
}
