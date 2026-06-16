export interface ReportModelConfig {
  reportModel: string;
  fastModel: string;
  cheapModel: string;
}

const DEFAULT_REPORT_MODEL = "gpt-4.1";
const DEFAULT_FAST_MODEL = "gpt-4.1-mini";
const DEFAULT_CHEAP_MODEL = "gpt-4.1-nano";

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value || undefined;
}

export function getReportModelConfig(env: NodeJS.ProcessEnv = process.env): ReportModelConfig {
  const cheapModel = envValue(env, "REPORT_CHEAP_MODEL")
    ?? envValue(env, "KEYWORD_LLM_MODEL")
    ?? envValue(env, "OPENAI_MODEL")
    ?? DEFAULT_CHEAP_MODEL;
  const fastModel = envValue(env, "REPORT_FAST_MODEL")
    ?? envValue(env, "SEARCH_INTENT_LLM_MODEL")
    ?? cheapModel
    ?? DEFAULT_FAST_MODEL;
  const reportModel = envValue(env, "REPORT_MODEL")
    ?? envValue(env, "LLM_MODEL")
    ?? fastModel
    ?? DEFAULT_REPORT_MODEL;

  return {
    reportModel,
    fastModel,
    cheapModel,
  };
}
