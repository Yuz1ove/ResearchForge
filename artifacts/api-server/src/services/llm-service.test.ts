import assert from "node:assert/strict";
import test from "node:test";
import { checkLlmHealth, requestLlmText, runLlmSmokeTest } from "./llm-service";

test("OpenAI health and smoke fail fast without exposing or fetching when API key is missing", async () => {
  let fetchCalled = false;
  const fetchImpl = async () => {
    fetchCalled = true;
    return new Response("{}");
  };
  const env = {
    LLM_PROVIDER: "openai",
    OPENAI_MODEL: "chatgpt5.4",
  } as NodeJS.ProcessEnv;

  const health = await checkLlmHealth({ env, fetchImpl });
  const smoke = await runLlmSmokeTest({ env, fetchImpl });

  assert.equal(fetchCalled, false);
  assert.equal(health.ok, false);
  assert.equal(health.apiKeyPresent, false);
  assert.equal(health.apiKeyConfigured, false);
  assert.equal(health.baseURLConfigured, true);
  assert.equal(health.apiKeyPrefix, null);
  assert.equal(health.credentialPreview, "(missing)");
  assert.equal(health.resolvedModel, "gpt-5.4");
  assert.equal(health.errorCode, "missing_key");
  assert.equal(smoke.ok, false);
  assert.equal(smoke.requestedModel, "gpt-5.4");
  assert.equal(smoke.errorCode, "missing_key");
});

test("requestLlmText reports explicit native Ollama provider and endpoint", async () => {
  const env = {
    LLM_PROVIDER: "ollama",
    OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    OLLAMA_MODEL: "cached-qwen-model",
    SCHOOL_LLM_API_KEY: "",
    SCHOOL_LLM_BASE_URL: "",
    OPENAI_API_KEY: "",
    OPENAI_BASE_URL: "",
  } as NodeJS.ProcessEnv;
  const health = await checkLlmHealth({ env });
  const result = await requestLlmText({
    operation: "report_generation",
    purpose: "section_writer",
    messages: [{ role: "user", content: "Return one sentence." }],
    env,
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          message: { role: "assistant", content: "完成。" },
          done: true,
        }),
      ),
  });

  assert.equal(health.ok, true);
  assert.equal(health.provider, "ollama");
  assert.equal(health.status, "configured");
  assert.equal(health.apiKeyConfigured, false);
  assert.equal(health.baseURL, "http://127.0.0.1:11434");
  assert.equal(health.resolvedModel, "cached-qwen-model");
  assert.equal(health.compatibleMode, "ollama_chat");
  assert.equal(health.errorCode, null);
  assert.equal(result.content, "完成。");
  assert.equal(result.provider, "ollama");
  assert.equal(result.model, "cached-qwen-model");
  assert.equal(result.baseUrl, "http://127.0.0.1:11434");
  assert.equal(result.endpoint, "http://127.0.0.1:11434/api/chat");
});
