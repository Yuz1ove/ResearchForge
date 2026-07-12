import assert from "node:assert/strict";
import test from "node:test";
import { checkLlmHealth, runLlmSmokeTest } from "./llm-service";

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
