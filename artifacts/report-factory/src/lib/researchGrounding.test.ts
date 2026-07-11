import assert from "node:assert/strict";
import test from "node:test";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  createResearchGroundingJob,
  fetchResearchGroundingJob,
  groundedEvidenceCardsForAcceptedSources,
  ResearchGroundingApiError,
  sourceCandidateToSourceRecord,
} from "./researchGrounding.ts";

function candidate(patch: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: "doi:10.1000/example",
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryUsed: "algal microfossils fossil record paleoenvironment",
    queryIntent: "exact",
    provider: "crossref",
    title: "Paleoenvironment, algal structures, and fossil algae",
    authors: ["Example Author"],
    year: 2021,
    venue: "Journal of Paleontology",
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    abstractOriginal:
      "This paper examines algal structures, fossil algae, microfossils, and paleoenvironmental reconstruction.",
    sourceType: "paper",
    isPeerReviewed: true,
    relevanceScore: 0.37,
    sourceQualityScore: 0.82,
    retrievalMode: "live_provider",
    recommendationBucket: "manual_review",
    sourceRole: "weak_or_uncertain",
    reviewStatus: "review",
    evidencePoints: ["algal structures and paleoenvironmental reconstruction"],
    limitations: ["需人工確認用途後才可進入正式段落"],
    usableSections: ["manual_review_only"],
    citationMarker: "［S1］",
    dedupeKey: "doi:10.1000/example",
    createdAt: "2026-06-28T00:00:00.000Z",
    retrievedAt: "2026-06-28T00:00:00.000Z",
    ...patch,
  };
}

test("grounding review papers with traceable abstracts remain primary candidates", () => {
  const source = sourceCandidateToSourceRecord({
    candidate: candidate(),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "化石與藻類的關係",
  });

  assert.equal(source.reviewState, "pending");
  assert.equal(source.relevanceLevel, "primary");
  assert.equal(source.usageRecommendation, "secondary");
});

test("metadata-only review papers are not promoted to primary candidates", () => {
  const source = sourceCandidateToSourceRecord({
    candidate: candidate({ abstractOriginal: undefined }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "化石與藻類的關係",
  });

  assert.equal(source.relevanceLevel, "secondary");
});

test("accepted official background sources without grounding cards do not become title-only evidence", () => {
  const acceptedSource = sourceCandidateToSourceRecord({
    candidate: candidate({
      sourceId: "official:nasa-sunset",
      provider: "web",
      title: "NASA Space Place: Why is the sky blue?",
      authors: ["NASA"],
      venue: undefined,
      doi: undefined,
      url: "https://spaceplace.nasa.gov/blue-sky/en/",
      abstractOriginal: undefined,
      sourceType: "official",
      sourceKind: "web",
      isPeerReviewed: false,
      relevanceScore: 0.7,
      sourceQualityScore: 0.78,
      recommendationBucket: "official_background",
      sourceRole: "official_background_explanation",
      reviewStatus: "accepted",
      acceptedByUser: true,
      userDecision: "accepted_as_background",
      acceptedAs: "background",
      evidencePoints: ["official education background on light scattering"],
      limitations: ["非同行評審論文；只能作為背景說明"],
      usableSections: ["background", "concept_explanation"],
      dedupeKey: "official:nasa-sunset",
    }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "夕陽餘暉與光波長的關係",
  });

  const cards = groundedEvidenceCardsForAcceptedSources({
    acceptedSources: [acceptedSource],
    groundingEvidenceCards: [],
    topic: "夕陽餘暉與光波長的關係",
  });

  assert.equal(cards.length, 0);
});

test("accepted sources with abstracts still require canonical grounding evidence cards", () => {
  const acceptedSource = sourceCandidateToSourceRecord({
    candidate: candidate({
      sourceId: "web:caffeine-attention",
      provider: "web",
      title: "Caffeine and attention performance",
      doi: undefined,
      url: "https://example.org/caffeine-attention",
      abstractOriginal:
        "Caffeine intake can improve vigilance and sustained attention in some experimental tasks.",
      sourceType: "paper",
      isPeerReviewed: true,
      relevanceScore: 0.72,
      sourceQualityScore: 0.8,
      recommendationBucket: "scholarly_recommended",
      sourceRole: "core_scholarly_evidence",
      reviewStatus: "accepted",
      acceptedByUser: true,
      userDecision: "accepted",
      usableSections: ["literature_review", "analysis"],
    }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "咖啡因攝取與注意力表現的關係",
  });

  const cards = groundedEvidenceCardsForAcceptedSources({
    acceptedSources: [acceptedSource],
    groundingEvidenceCards: [],
    topic: "咖啡因攝取與注意力表現的關係",
  });

  assert.equal(cards.length, 0);
});

test("grounding create response is schema-validated and distinguishes a non-JSON route failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("method not allowed", {
      status: 405,
      headers: { "content-type": "text/html" },
    })) as typeof fetch;
  try {
    await assert.rejects(
      createResearchGroundingJob({ workflowId: "wf-client", topic: "魚油的製作及其營養成分" }),
      (error: unknown) =>
        error instanceof ResearchGroundingApiError &&
        error.code === "GROUNDING_JOB_CREATE_FAILED" &&
        error.stage === "creation" &&
        error.status === 405,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("grounding polling response uses its own error classification", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        code: "GROUNDING_JOB_NOT_FOUND",
        message: "Research grounding job not found.",
        stage: "polling",
        retryable: false,
        requestId: "request-polling",
      }),
      { status: 404, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  try {
    await assert.rejects(
      fetchResearchGroundingJob("missing-job"),
      (error: unknown) =>
        error instanceof ResearchGroundingApiError &&
        error.code === "GROUNDING_JOB_NOT_FOUND" &&
        error.stage === "polling" &&
        error.status === 404,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("grounding client rejects malformed successful responses", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ jobId: "missing-required-fields" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    await assert.rejects(
      createResearchGroundingJob({ workflowId: "wf-client", topic: "魚油的製作及其營養成分" }),
      (error: unknown) =>
        error instanceof ResearchGroundingApiError &&
        error.code === "GROUNDING_RESPONSE_SCHEMA_INVALID",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
