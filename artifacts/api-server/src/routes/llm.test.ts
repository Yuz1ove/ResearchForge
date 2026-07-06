import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import { createLlmRouter } from "./llm";

test("llm health route returns provider status without exposing the API key", async () => {
  const secret = "sk-test-secret-token";
  const router = createLlmRouter({
    healthChecker: async () => ({
      ok: true,
      provider: "openai",
      configuredModel: "GPT-5.4",
      resolvedModel: "gpt-5.4",
      apiKeyPresent: true,
      apiKeyPrefix: "sk-test...oken",
      apiKeyConfigured: true,
      baseURL: "https://api.openai.com/v1",
      baseURLConfigured: true,
      credentialPreview: "sk-test...oken",
      modelsEndpointReachable: true,
      modelAvailable: true,
      modelConfigured: true,
      compatibleMode: "openai_responses_or_chat",
      missing: [],
      source: "openai_env",
      errorCode: null,
      errorMessage: null,
      checkedAt: "2026-07-01T00:00:00.000Z",
      available: true,
      status: "configured",
      model: "gpt-5.4",
      latencyMs: 12,
    }),
  });
  const route = router.stack.find((layer) => layer.route?.path === "/llm/health");
  assert.ok(route?.route);

  let statusCode = 0;
  let payload: unknown;
  const req = {} as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return this;
    },
  } as unknown as Response;

  await route.route.stack[0].handle(req, res, () => undefined);

  assert.equal(statusCode, 200);
  assert.deepEqual(payload, {
    ok: true,
    provider: "openai",
    configuredModel: "GPT-5.4",
    resolvedModel: "gpt-5.4",
    apiKeyPresent: true,
    apiKeyPrefix: "sk-test...oken",
    apiKeyConfigured: true,
    baseURL: "https://api.openai.com/v1",
    baseURLConfigured: true,
    credentialPreview: "sk-test...oken",
    modelsEndpointReachable: true,
    modelAvailable: true,
    modelConfigured: true,
    compatibleMode: "openai_responses_or_chat",
    missing: [],
    source: "openai_env",
    errorCode: null,
    errorMessage: null,
    checkedAt: "2026-07-01T00:00:00.000Z",
    available: true,
    status: "configured",
    model: "gpt-5.4",
    latencyMs: 12,
  });
  assert.equal(JSON.stringify(payload).includes(secret), false);
  assert.equal(JSON.stringify(payload).includes("API_KEY"), false);
});

test("llm smoke route calls tester and returns adapter proof without exposing secrets", async () => {
  const secret = "sk-test-secret-token";
  const router = createLlmRouter({
    smokeTester: async () => ({
      ok: true,
      provider: "openai",
      requestedModel: "gpt-5.4",
      actualModel: "gpt-5.4",
      text: "RF_LLM_SMOKE_OK",
      usage: { output_tokens: 5 },
      checkedAt: "2026-07-01T00:00:00.000Z",
      errorCode: null,
      errorMessage: null,
      available: true,
      status: "ok",
      model: "gpt-5.4",
      adapter: "openai",
      fallbackUsed: false,
      latencyMs: 18,
      normalizedText: "RF_LLM_SMOKE_OK",
    }),
  });
  const route = router.stack.find((layer) => layer.route?.path === "/llm/smoke");
  assert.ok(route?.route);

  let statusCode = 0;
  let payload: unknown;
  const req = {} as Request;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return this;
    },
  } as unknown as Response;

  await route.route.stack[0].handle(req, res, () => undefined);

  assert.equal(statusCode, 200);
  assert.deepEqual(payload, {
    ok: true,
    provider: "openai",
    requestedModel: "gpt-5.4",
    actualModel: "gpt-5.4",
    text: "RF_LLM_SMOKE_OK",
    usage: { output_tokens: 5 },
    checkedAt: "2026-07-01T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    available: true,
    status: "ok",
    model: "gpt-5.4",
    adapter: "openai",
    fallbackUsed: false,
    latencyMs: 18,
    normalizedText: "RF_LLM_SMOKE_OK",
  });
  assert.equal(JSON.stringify(payload).includes(secret), false);
  assert.equal(JSON.stringify(payload).includes("Authorization"), false);
});
