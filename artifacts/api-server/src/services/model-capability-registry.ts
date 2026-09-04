export type ModelProviderKind = "openai" | "school" | "ollama" | "generic";
export type ModelCostTier = "low" | "medium" | "high" | "unknown";
export type ModelLatencyTier = "fast" | "balanced" | "reasoning" | "unknown";
export type ModelWorkload =
  | "planning"
  | "summarization"
  | "claim_extraction"
  | "report_writing"
  | "verification"
  | "embedding";

export interface ModelCapabilityProfile {
  model: string;
  provider: ModelProviderKind;
  contextWindowTokens: number;
  maxOutputTokens: number;
  supportsJsonObject: boolean;
  supportsJsonSchema: boolean;
  supportsToolCalling: boolean;
  supportsEmbeddings: boolean;
  costTier: ModelCostTier;
  latencyTier: ModelLatencyTier;
  recommendedWorkloads: ModelWorkload[];
  source: "builtin" | "environment" | "conservative_default";
}

export interface ModelRequestBudget {
  capability: ModelCapabilityProfile;
  requestedOutputTokens: number;
  allowedOutputTokens: number;
  estimatedInputTokens: number;
  reservedTokens: number;
  contextFits: boolean;
  diagnostics: string[];
}

type CapabilityOverride = Partial<Omit<ModelCapabilityProfile, "model" | "source">>;

const MIN_OUTPUT_TOKENS = 128;
const DEFAULT_RESERVED_TOKENS = 512;

function compact(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function boundedInteger(value: unknown, fallback: number, minimum = 1): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.floor(numeric)) : fallback;
}

function providerKind(value: string | undefined): ModelProviderKind {
  if (value === "openai" || value === "school" || value === "ollama") return value;
  return "generic";
}

function baseProfile(model: string, provider: ModelProviderKind): ModelCapabilityProfile {
  const normalized = model.toLocaleLowerCase();
  if (/gpt-4\.1-nano/u.test(normalized)) {
    return {
      model,
      provider,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_768,
      supportsJsonObject: true,
      supportsJsonSchema: true,
      supportsToolCalling: true,
      supportsEmbeddings: false,
      costTier: "low",
      latencyTier: "fast",
      recommendedWorkloads: ["planning", "claim_extraction", "verification"],
      source: "builtin",
    };
  }
  if (/gpt-4\.1-mini/u.test(normalized)) {
    return {
      model,
      provider,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_768,
      supportsJsonObject: true,
      supportsJsonSchema: true,
      supportsToolCalling: true,
      supportsEmbeddings: false,
      costTier: "medium",
      latencyTier: "balanced",
      recommendedWorkloads: ["planning", "summarization", "claim_extraction", "verification"],
      source: "builtin",
    };
  }
  if (/gpt-4\.1/u.test(normalized)) {
    return {
      model,
      provider,
      contextWindowTokens: 1_000_000,
      maxOutputTokens: 32_768,
      supportsJsonObject: true,
      supportsJsonSchema: true,
      supportsToolCalling: true,
      supportsEmbeddings: false,
      costTier: "high",
      latencyTier: "reasoning",
      recommendedWorkloads: ["report_writing", "verification"],
      source: "builtin",
    };
  }
  if (/^(?:text-embedding|multilingual-e5|bge-|nomic-embed|mxbai-embed)/u.test(normalized)) {
    return {
      model,
      provider,
      contextWindowTokens: 8_192,
      maxOutputTokens: 1,
      supportsJsonObject: false,
      supportsJsonSchema: false,
      supportsToolCalling: false,
      supportsEmbeddings: true,
      costTier: "low",
      latencyTier: "fast",
      recommendedWorkloads: ["embedding"],
      source: "builtin",
    };
  }
  if (/qwen|llama|mistral|gemma|phi/u.test(normalized)) {
    return {
      model,
      provider,
      contextWindowTokens: 32_768,
      maxOutputTokens: 8_192,
      supportsJsonObject: true,
      supportsJsonSchema: false,
      supportsToolCalling: false,
      supportsEmbeddings: false,
      costTier: "low",
      latencyTier: "balanced",
      recommendedWorkloads: ["planning", "summarization", "claim_extraction"],
      source: "builtin",
    };
  }
  return {
    model,
    provider,
    contextWindowTokens: 32_768,
    maxOutputTokens: 4_096,
    supportsJsonObject: false,
    supportsJsonSchema: false,
    supportsToolCalling: false,
    supportsEmbeddings: false,
    costTier: "unknown",
    latencyTier: "unknown",
    recommendedWorkloads: [],
    source: "conservative_default",
  };
}

function environmentRegistry(env: NodeJS.ProcessEnv): Record<string, CapabilityOverride> {
  const raw = compact(env.MODEL_CAPABILITY_REGISTRY_JSON);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, CapabilityOverride>;
  } catch {
    return {};
  }
}

function validWorkloads(value: unknown): ModelWorkload[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed = new Set<ModelWorkload>([
    "planning",
    "summarization",
    "claim_extraction",
    "report_writing",
    "verification",
    "embedding",
  ]);
  return Array.from(new Set(value.filter((item): item is ModelWorkload => allowed.has(item as ModelWorkload))));
}

export function resolveModelCapability(
  modelValue: string,
  options: { provider?: string; env?: NodeJS.ProcessEnv } = {},
): ModelCapabilityProfile {
  const model = compact(modelValue) || "unknown-model";
  const env = options.env ?? process.env;
  const baseline = baseProfile(model, providerKind(options.provider));
  const registry = environmentRegistry(env);
  const override = registry[model] ?? registry[model.toLocaleLowerCase()];
  if (!override) return baseline;
  return {
    ...baseline,
    ...override,
    model,
    provider: providerKind(override.provider ?? options.provider),
    contextWindowTokens: boundedInteger(
      override.contextWindowTokens,
      baseline.contextWindowTokens,
      1_024,
    ),
    maxOutputTokens: boundedInteger(override.maxOutputTokens, baseline.maxOutputTokens),
    recommendedWorkloads: validWorkloads(override.recommendedWorkloads) ?? baseline.recommendedWorkloads,
    source: "environment",
  };
}

export function planModelRequest(input: {
  model: string;
  provider?: string;
  estimatedInputTokens: number;
  requestedOutputTokens: number;
  reservedTokens?: number;
  env?: NodeJS.ProcessEnv;
}): ModelRequestBudget {
  const capability = resolveModelCapability(input.model, {
    provider: input.provider,
    env: input.env,
  });
  const estimatedInputTokens = boundedInteger(input.estimatedInputTokens, 0, 0);
  const requestedOutputTokens = boundedInteger(input.requestedOutputTokens, MIN_OUTPUT_TOKENS);
  const reservedTokens = boundedInteger(input.reservedTokens, DEFAULT_RESERVED_TOKENS, 0);
  const contextRemaining = capability.contextWindowTokens - estimatedInputTokens - reservedTokens;
  const contextFits = contextRemaining >= MIN_OUTPUT_TOKENS;
  const allowedOutputTokens = contextFits
    ? Math.max(
        MIN_OUTPUT_TOKENS,
        Math.min(requestedOutputTokens, capability.maxOutputTokens, contextRemaining),
      )
    : 0;
  const diagnostics = [
    capability.source === "conservative_default" ? "model_capability_unknown_conservative_default" : "",
    requestedOutputTokens > capability.maxOutputTokens ? "output_capped_by_model_capability" : "",
    requestedOutputTokens > contextRemaining ? "output_capped_by_context_window" : "",
    contextFits ? "" : "input_exceeds_registered_context_window",
  ].filter(Boolean);
  return {
    capability,
    requestedOutputTokens,
    allowedOutputTokens,
    estimatedInputTokens,
    reservedTokens,
    contextFits,
    diagnostics,
  };
}
