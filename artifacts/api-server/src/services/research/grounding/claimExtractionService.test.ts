import assert from "node:assert/strict";
import test from "node:test";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  acceptedClaimCandidates,
  extractClaimsFromChunk,
} from "./claimExtractionService";

function source(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: "source-1",
    workflowId: "wf-test",
    topicHash: "topic-hash",
    queryUsed: "sleep memory adolescents",
    queryIntent: "exact",
    provider: "openalex",
    title: "Sleep duration and adolescent memory performance",
    sourceType: "paper",
    isPeerReviewed: true,
    accessLevel: "full_text",
    extractionStatus: "text_extracted",
    extractionMethod: "html_readability",
    extractionMode: "html",
    canUseForClaims: true,
    canUseForReport: true,
    relevanceScore: 0.86,
    sourceQualityScore: 0.82,
    evidencePoints: [],
    limitations: [],
    usableSections: ["literature_review"],
    citationMarker: "[S1]",
    retrievalMode: "live_provider",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    reviewStatus: "accepted",
    dedupeKey: "source-1",
    createdAt: "2026-07-03T00:00:00.000Z",
    retrievedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

const chunk = {
  chunk_id: "source-1:chunk:1",
  text: "A longitudinal study found that shorter sleep duration was associated with poorer adolescent memory performance after adjustment for baseline learning measures.",
  source_location: "Results",
  section_heading: "Results",
  char_start: 0,
  char_end: 147,
};

test("extractClaimsFromChunk accepts strict JSON LLM claim candidates", async () => {
  const calls: string[] = [];
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      now: () => "2026-07-03T00:00:00.000Z",
      requestLlm: async (request) => {
        calls.push(request.featureName ?? "");
        return {
          content: JSON.stringify({
            claims: [
              {
                claimTextOriginal:
                  "Shorter sleep duration was associated with poorer adolescent memory performance.",
                claimTextZhTw:
                  "較短睡眠時間與較差的青少年記憶表現相關。",
                claimType: "finding",
                supportSpanText:
                  "shorter sleep duration was associated with poorer adolescent memory performance",
                confidence: 0.83,
                relevanceToTopic: 0.91,
                usableSections: ["literature_review", "analysis", "discussion"],
                limitations: ["observational association"],
              },
            ],
          }),
          provider: "mock",
          model: "mock-model",
          baseUrl: "https://mock.invalid/v1",
          endpoint: "https://mock.invalid/v1/chat/completions",
          timeoutMs: 1000,
        };
      },
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]?.status, "accepted");
  assert.equal(claims[0]?.extractionMode, "llm");
  assert.equal(claims[0]?.modelName, "mock-model");
  assert.equal(claims[0]?.claimType, "finding");
});

test("extractClaimsFromChunk returns an empty list when LLM finds no supported claims", async () => {
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      requestLlm: async () => ({
        content: "{\"claims\":[]}",
        provider: "mock",
        model: "mock-model",
        baseUrl: "https://mock.invalid/v1",
        endpoint: "https://mock.invalid/v1/chat/completions",
        timeoutMs: 1000,
      }),
    },
  );

  assert.deepEqual(claims, []);
});

test("extractClaimsFromChunk retries malformed JSON once and then uses rule fallback", async () => {
  let calls = 0;
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      requestLlm: async () => {
        calls += 1;
        return {
          content: "not-json",
          provider: "mock",
          model: "mock-model",
          baseUrl: "https://mock.invalid/v1",
          endpoint: "https://mock.invalid/v1/chat/completions",
          timeoutMs: 1000,
        };
      },
    },
  );

  assert.equal(calls, 2);
  assert.equal(claims.length, 1);
  assert.equal(claims[0]?.extractionMode, "rule_fallback");
});

test("extractClaimsFromChunk rejects claims without supportSpanText", async () => {
  const claims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source(),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    {
      enableLlm: true,
      requestLlm: async () => ({
        content: JSON.stringify({
          claims: [
            {
              claimTextOriginal: "Sleep affects memory.",
              claimTextZhTw: "睡眠會影響記憶。",
              claimType: "finding",
              confidence: 0.8,
              relevanceToTopic: 0.8,
            },
          ],
        }),
        provider: "mock",
        model: "mock-model",
        baseUrl: "https://mock.invalid/v1",
        endpoint: "https://mock.invalid/v1/chat/completions",
        timeoutMs: 1000,
      }),
    },
  );

  assert.equal(claims[0]?.status, "rejected");
  assert.equal(claims[0]?.rejectionReason, "missing_support_span");
});

test("metadata-only and failed extraction sources cannot produce accepted claims", async () => {
  const metadataClaims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source({
        accessLevel: "metadata_only",
        extractionStatus: "metadata_only",
        extractionMode: "metadata_only",
        canUseForClaims: false,
      }),
      chunk: { ...chunk, text: "Sleep duration and adolescent memory performance" },
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    { enableLlm: false },
  );
  const failedClaims = await extractClaimsFromChunk(
    {
      topic: "sleep duration and adolescent memory",
      source: source({
        accessLevel: "failed_extraction",
        extractionStatus: "extraction_failed",
        extractionMode: "failed",
        canUseForClaims: false,
      }),
      chunk,
      sourceIndex: 0,
      workflowId: "wf-test",
    },
    { enableLlm: false },
  );

  assert.notEqual(metadataClaims[0]?.status, "accepted");
  assert.notEqual(failedClaims[0]?.status, "accepted");
});

test("acceptedClaimCandidates dedupes duplicate supported claims", () => {
  const base = {
    claimId: "claim-1",
    sourceId: "source-1",
    chunkId: "chunk-1",
    claimTextOriginal: "Shorter sleep duration was associated with poorer adolescent memory performance.",
    claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
    claimType: "finding" as const,
    supportSpanText: "shorter sleep duration was associated with poorer adolescent memory performance",
    citationMarker: "[S1]",
    confidence: 0.8,
    relevanceToTopic: 0.8,
    sourceQualityScore: 0.8,
    usableSections: ["literature_review" as const],
    limitations: [],
    extractionMode: "llm" as const,
    status: "accepted" as const,
    createdAt: "2026-07-03T00:00:00.000Z",
  };

  const deduped = acceptedClaimCandidates([
    base,
    { ...base, claimId: "claim-2", confidence: 0.7 },
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.claimId, "claim-1");
});
