import assert from "node:assert/strict";
import test from "node:test";
import {
  redactSecret,
  resolvePrivateLlmProviderConfig,
  resolveSafeLlmProviderConfig,
  toSafeLlmProviderConfig,
} from "./llm-provider-config";

const SECRET = "aiapi_2_secret_value_rRtM";

test("SCHOOL_LLM credentials configure the school provider without requiring a model", () => {
  const config = resolvePrivateLlmProviderConfig({
    env: {
      SCHOOL_LLM_API_KEY: SECRET,
      SCHOOL_LLM_BASE_URL: "https://ai.ccsh.tn.edu.tw/v1",
    },
  });

  assert.equal(config.provider, "school_llm");
  assert.equal(config.available, true);
  assert.equal(config.status, "configured");
  assert.equal(config.compatibleMode, "openai_chat_completions");
  assert.equal(config.model, null);
  assert.equal(config.modelConfigured, false);
});

test("SCHOOL_LLM_API_KEY without base URL is partially configured", () => {
  const config = resolvePrivateLlmProviderConfig({
    env: {
      SCHOOL_LLM_API_KEY: SECRET,
    },
  });

  assert.equal(config.provider, "school_llm");
  assert.equal(config.available, false);
  assert.equal(config.status, "partially_configured");
  assert.ok(config.missing.includes("SCHOOL_LLM_BASE_URL"));
});

test("SCHOOL_LLM_BASE_URL without key is partially configured", () => {
  const config = resolvePrivateLlmProviderConfig({
    env: {
      SCHOOL_LLM_BASE_URL: "https://ai.ccsh.tn.edu.tw/v1",
    },
  });

  assert.equal(config.provider, "school_llm");
  assert.equal(config.available, false);
  assert.equal(config.status, "partially_configured");
  assert.ok(config.missing.includes("SCHOOL_LLM_API_KEY"));
});

test("SCHOOL_LLM wins over OPENAI by default, explicit openai override wins when requested", () => {
  const env = {
    SCHOOL_LLM_API_KEY: SECRET,
    SCHOOL_LLM_BASE_URL: "https://school.example/v1",
    SCHOOL_LLM_MODEL: "school-model",
    OPENAI_API_KEY: "sk-openai-secret-value",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: "gpt-5.4",
  };

  const auto = resolvePrivateLlmProviderConfig({ env });
  assert.equal(auto.provider, "school_llm");
  assert.equal(auto.model, "school-model");

  const openai = resolvePrivateLlmProviderConfig({ env, provider: "openai" });
  assert.equal(openai.provider, "openai");
  assert.equal(openai.baseURL, "https://api.openai.com/v1");
});

test("safe provider config never exposes the full credential", () => {
  const safe = resolveSafeLlmProviderConfig({
    env: {
      SCHOOL_LLM_API_KEY: SECRET,
      SCHOOL_LLM_BASE_URL: "https://school.example/v1",
      SCHOOL_LLM_MODEL: "school-model",
    },
  });
  const serialized = JSON.stringify(safe);

  assert.equal(safe.credentialPreview, "aiapi_2...rRtM");
  assert.equal(serialized.includes(SECRET), false);
  assert.equal("apiKey" in safe, false);
});

test("redactSecret handles missing, short, and normal values", () => {
  assert.equal(redactSecret(null), "(missing)");
  assert.equal(redactSecret("short"), "***");
  assert.equal(redactSecret(SECRET), "aiapi_2...rRtM");
  assert.equal(redactSecret(`\u001b[D${SECRET}`), "aiapi_2...rRtM");
  assert.equal(redactSecret(`[D[B[D${SECRET}`), "aiapi_2...rRtM");
});

test("toSafeLlmProviderConfig strips apiKey from private config", () => {
  const privateConfig = resolvePrivateLlmProviderConfig({
    env: {
      OPENAI_API_KEY: "sk-openai-secret-value",
      OPENAI_MODEL: "gpt-5.4",
    },
  });
  const safe = toSafeLlmProviderConfig(privateConfig);
  assert.equal(JSON.stringify(safe).includes("sk-openai-secret-value"), false);
});
