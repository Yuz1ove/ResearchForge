import assert from "node:assert/strict";
import test from "node:test";
import { planModelRequest, resolveModelCapability } from "./model-capability-registry";

test("unknown models use a conservative, explicit capability profile", () => {
  const profile = resolveModelCapability("private-research-model", { provider: "school", env: {} });
  assert.equal(profile.source, "conservative_default");
  assert.equal(profile.contextWindowTokens, 32_768);
  assert.equal(profile.costTier, "unknown");
});

test("environment registry overrides exact deployment capabilities", () => {
  const env = {
    MODEL_CAPABILITY_REGISTRY_JSON: JSON.stringify({
      "private-research-model": {
        provider: "school",
        contextWindowTokens: 131_072,
        maxOutputTokens: 12_000,
        supportsJsonObject: true,
        costTier: "medium",
        recommendedWorkloads: ["report_writing", "verification"],
      },
    }),
  } as NodeJS.ProcessEnv;
  const profile = resolveModelCapability("private-research-model", { env });
  assert.equal(profile.source, "environment");
  assert.equal(profile.contextWindowTokens, 131_072);
  assert.equal(profile.maxOutputTokens, 12_000);
  assert.deepEqual(profile.recommendedWorkloads, ["report_writing", "verification"]);
});

test("request budget caps output before the provider call", () => {
  const budget = planModelRequest({
    model: "qwen3:4b",
    provider: "ollama",
    estimatedInputTokens: 31_800,
    requestedOutputTokens: 4_000,
    reservedTokens: 512,
    env: {},
  });
  assert.equal(budget.contextFits, true);
  assert.equal(budget.allowedOutputTokens, 456);
  assert.ok(budget.diagnostics.includes("output_capped_by_context_window"));
});

test("request budget exposes no dispatchable output when input exceeds context", () => {
  const budget = planModelRequest({
    model: "private-research-model",
    provider: "school",
    estimatedInputTokens: 32_768,
    requestedOutputTokens: 1_200,
    reservedTokens: 512,
    env: {},
  });

  assert.equal(budget.contextFits, false);
  assert.equal(budget.allowedOutputTokens, 0);
  assert.ok(
    budget.diagnostics.includes("input_exceeds_registered_context_window"),
  );
});
