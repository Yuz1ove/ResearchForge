import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryProviderHealthStore,
  resetProviderHealthStoreForTesting,
  setProviderHealthStoreForTesting,
} from "./source-retrieval";
import {
  classifyProviderSmokeHttpError,
  runProviderSmokeTest,
} from "./provider-smoke";

const SECRET = "aiapi_2_secret_value_rRtM";
const ENV = {
  SCHOOL_LLM_API_KEY: SECRET,
  SCHOOL_LLM_BASE_URL: "https://ai.ccsh.tn.edu.tw/v1",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("/models 200 marks auth ok and parses model count", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    skipGeneration: true,
    env: ENV,
    fetchImpl: async (input) => {
      assert.equal(String(input), "https://ai.ccsh.tn.edu.tw/v1/models");
      return jsonResponse({ data: [{ id: "school-model-a" }, { id: "school-model-b" }] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.auth.ok, true);
  assert.equal(result.auth.httpStatus, 200);
  assert.equal(result.auth.modelCount, 2);
  assert.equal(result.model, "school-model-a");
});

test("/chat/completions 200 marks generation ok and parses output", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    env: ENV,
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/models")) {
        return jsonResponse({ data: [{ id: "school-model-a" }] });
      }
      assert.equal(url, "https://ai.ccsh.tn.edu.tw/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "school-model-a");
      assert.equal(body.messages[0].content, "Reply with exactly: PING_OK");
      return jsonResponse({ choices: [{ message: { content: "PING_OK" } }] });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.generation.ok, true);
  assert.equal(result.generation.endpoint, "/chat/completions");
  assert.equal(result.generation.outputPreview, "PING_OK");
});

test("responses 404 is endpoint_not_supported, not invalid_key", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    endpoint: "responses",
    model: "school-model-a",
    env: ENV,
    fetchImpl: async () => jsonResponse({ error: "not found" }, 404),
  });

  assert.equal(result.ok, false);
  assert.equal(result.generation.errorCode, "endpoint_not_supported");
  assert.equal(JSON.stringify(result).includes("invalid_key"), false);
});

test("chat 404 falls back to responses when endpoint is auto", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    env: ENV,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/models")) return jsonResponse({ data: [{ id: "school-model-a" }] });
      if (url.endsWith("/chat/completions")) return jsonResponse({ error: "not found" }, 404);
      assert.equal(url, "https://ai.ccsh.tn.edu.tw/v1/responses");
      return jsonResponse({ output_text: "PING_OK" });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.generation.endpoint, "/responses");
  assert.equal(result.generation.outputPreview, "PING_OK");
});

test("401, provider-specific 403, and 429 failures are classified without leaking the full key", async () => {
  assert.equal(classifyProviderSmokeHttpError(401, "invalid api key", "/models"), "invalid_key");
  assert.equal(
    classifyProviderSmokeHttpError(
      403,
      JSON.stringify({ error: { code: "quota_exceeded", message: "monthly quota reached" } }),
      "/chat/completions",
    ),
    "quota_exceeded",
  );
  assert.equal(
    classifyProviderSmokeHttpError(
      403,
      JSON.stringify({ error: { code: "allocation_quarantined" } }),
      "/chat/completions",
    ),
    "forbidden",
  );
  assert.equal(classifyProviderSmokeHttpError(429, "rate limit", "/models"), "rate_limited");
  assert.equal(classifyProviderSmokeHttpError(429, "quota exceeded", "/models"), "quota_exceeded");

  const result = await runProviderSmokeTest({
    provider: "school_llm",
    skipGeneration: true,
    env: ENV,
    fetchImpl: async () => new Response(`invalid api key ${SECRET}`, { status: 401 }),
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.ok, false);
  assert.equal(result.auth.errorCode, "invalid_key");
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes("aiapi_2...rRtM"), true);
});

test("auth failure stops generation without adding model_not_found noise", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    env: ENV,
    fetchImpl: async () => new Response("invalid api key", { status: 401 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.generation.skipped, true);
  assert.equal(result.failures.map((item) => item.code).includes("invalid_key"), true);
  assert.equal(result.failures.map((item) => item.code).includes("model_not_found"), false);
});

test("non-JSON responses are classified and safely truncated", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    skipGeneration: true,
    env: ENV,
    fetchImpl: async () => new Response(`<html>${SECRET}</html>`, { status: 200 }),
  });

  const serialized = JSON.stringify(result);
  assert.equal(result.ok, false);
  assert.equal(result.auth.errorCode, "non_json_response");
  assert.equal(serialized.includes(SECRET), false);
});

test("JSON smoke output contains credentialPreview but never apiKey", async () => {
  const result = await runProviderSmokeTest({
    provider: "school_llm",
    skipGeneration: true,
    env: ENV,
    fetchImpl: async () => jsonResponse({ data: [{ id: "school-model-a" }] }),
  });
  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes("credentialPreview"), true);
  assert.equal(serialized.includes("apiKey"), false);
});

test("provider smoke test does not mutate source ProviderHealthStore", async () => {
  const store = new InMemoryProviderHealthStore();
  setProviderHealthStoreForTesting(store);
  try {
    await runProviderSmokeTest({
      provider: "school_llm",
      skipGeneration: true,
      env: ENV,
      fetchImpl: async () => jsonResponse({ data: [{ id: "school-model-a" }] }),
    });
    const health = await store.get("OpenAlex");
    assert.equal(health.status, "healthy");
    assert.equal(health.recentFailureCount, 0);
    assert.equal(health.recentTimeoutCount, 0);
  } finally {
    resetProviderHealthStoreForTesting();
  }
});
