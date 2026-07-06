import { apiServerEnvLoadResult } from "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { resolveSafeLlmProviderConfig } from "./config/llm-provider-config";

const rawPort = process.env["PORT"];
const host = process.env["HOST"]?.trim();

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = host
  ? app.listen(port, host, onListen)
  : app.listen(port, onListen);

function onListen(err?: Error) {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  const llmConfig = resolveSafeLlmProviderConfig();
  const baseUrlInfo =
    apiServerEnvLoadResult.keys[
      llmConfig.provider === "school_llm" ? "SCHOOL_LLM_BASE_URL" : "OPENAI_BASE_URL"
    ];
  const modelInfo =
    apiServerEnvLoadResult.keys[
      llmConfig.provider === "school_llm" ? "SCHOOL_LLM_MODEL" : "OPENAI_MODEL"
    ];
  const apiKeyInfo =
    apiServerEnvLoadResult.keys[
      llmConfig.provider === "school_llm" ? "SCHOOL_LLM_API_KEY" : "OPENAI_API_KEY"
    ];
  const envSources = new Set<string>(
    [baseUrlInfo, modelInfo, apiKeyInfo]
      .map((info) => info?.source)
      .filter((source) => Boolean(source) && source !== "unset"),
  );
  const hasProcessOverride = [baseUrlInfo, modelInfo, apiKeyInfo].some(
    (info) => info?.overriddenByProcessEnv,
  );

  logger.info(
    {
      openAiBaseUrlConfigured: Boolean(process.env.OPENAI_BASE_URL?.trim()),
      schoolLlmBaseUrlConfigured: Boolean(process.env.SCHOOL_LLM_BASE_URL?.trim()),
      provider: llmConfig.provider,
      modelConfigured: llmConfig.modelConfigured,
      model: llmConfig.model || "unset",
      openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      schoolLlmApiKeyConfigured: Boolean(process.env.SCHOOL_LLM_API_KEY?.trim()),
      credentialPreview: llmConfig.credentialPreview,
      llmProvider: process.env.LLM_PROVIDER?.trim() || "unset",
      envSource:
        envSources.size > 0
          ? Array.from(envSources).join(" | ")
          : "unset",
      processEnvOverride: hasProcessOverride,
      fallbackEnabled: false,
    },
    "[env] LLM provider: %s [env] base URL configured: %s [env] model configured: %s [env] API key configured: %s [env] env source: %s [env] fallback enabled: false",
    llmConfig.provider,
    llmConfig.baseURLConfigured,
    llmConfig.modelConfigured,
    llmConfig.apiKeyConfigured,
    envSources.size > 0 ? Array.from(envSources).join(" | ") : "unset",
  );
  logger.info({ port, host: host || "default" }, "Server listening");
}

void server;
