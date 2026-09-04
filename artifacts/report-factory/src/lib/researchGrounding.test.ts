import assert from "node:assert/strict";
import test from "node:test";
import type {
  GroundingEvidenceCard,
  SourceCandidate,
} from "@workspace/api-zod/research-grounding";
import { SourceCandidateSchema } from "@workspace/api-zod/research-grounding";
import {
  createResearchGroundingJob,
  fetchResearchGroundingJob,
  groundedEvidenceCardsForAcceptedSources,
  reportEvidenceCardsForAcceptedSources,
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
  assert.equal(source.canonicalSourceIdentity, "doi:10.1000/example");
});

test("candidate schema preserves originalAbstract and frontend mapping chooses the longest alias", () => {
  const longest =
    "This is the complete provider abstract with methods, results, and limitations retained across reload.";
  const parsed = SourceCandidateSchema.parse(candidate({
    abstract: "Short abstract.",
    abstractOriginal: "A medium abstract with one result.",
    originalAbstract: longest,
    extractedAbstract: "Extracted abstract.",
  }));
  const source = sourceCandidateToSourceRecord({
    candidate: parsed,
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "化石與藻類的關係",
  });

  assert.equal(parsed.originalAbstract, longest);
  assert.equal(source.abstract, longest);
  assert.equal(
    sourceCandidateToSourceRecord({
      candidate: JSON.parse(JSON.stringify(parsed)) as SourceCandidate,
      workflowId: "wf-1",
      topicHash: "topic-1",
      queryPlanHash: "plan-1",
      originalTopic: "化石與藻類的關係",
    }).abstract,
    longest,
  );
});

test("grounding topic-integrity lineage survives the SourceCandidate to SourceRecord adapter", () => {
  const topicIntegrityAssessment = {
    topicIntegrityVersion: "topic-integrity-contract.v2" as const,
    relevancePolicyVersion: "peco-directness-reconciliation.v2" as const,
    sourceId: "doi:10.1000/example",
    metadataRelevance: {
      passed: true,
      matchedFields: ["title", "abstract"],
      populationMatches: [],
      interventionExposureMatches: ["fossil algae"],
      primaryOutcomeMatches: ["paleoenvironment"],
      primaryOutcomeProminent: true,
    },
    semanticRelevance: { score: 0.91, policy: "CANDIDATE_SIGNAL_ONLY" as const },
    evidenceEntailment: {
      supportedTopicFacet: ["intervention_or_exposure", "primary_outcome"],
      populationMatch: "unspecified" as const,
      interventionExposureMatch: true,
      outcomeMatch: true,
      relationship: "direct" as const,
      acceptanceReason: "directly reports the requested relationship",
      rejectionReason: null,
    },
    hardExclusion: { excluded: false, reasons: [] },
    sourceRole: "DIRECT_FINDING" as const,
    acceptedForCanonicalEvidence: true,
    allowedSections: ["findings", "discussion"],
    topicIntegrityReason: "directly reports the requested relationship",
  };
  const source = sourceCandidateToSourceRecord({
    candidate: candidate({ topicIntegrityAssessment }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "化石與藻類的關係",
  });

  assert.deepEqual(source.topicIntegrityAssessment, topicIntegrityAssessment);
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

test("report evidence falls back to exact accepted-source spans when canonical cards are absent", () => {
  const abstract =
    "Caffeine intake can improve vigilance and sustained attention in some experimental tasks.";
  const acceptedSource = sourceCandidateToSourceRecord({
    candidate: candidate({
      sourceId: "web:caffeine-local-fallback",
      title: "Caffeine and attention performance",
      abstractOriginal: abstract,
      reviewStatus: "accepted",
      acceptedByUser: true,
      userDecision: "accepted",
      recommendationBucket: "scholarly_recommended",
      sourceRole: "core_scholarly_evidence",
      usableSections: ["literature_review", "analysis"],
    }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "咖啡因攝取與注意力表現的關係",
  });

  const cards = reportEvidenceCardsForAcceptedSources({
    acceptedSources: [acceptedSource],
    groundingEvidenceCards: [],
    topic: "咖啡因攝取與注意力表現的關係",
  });

  assert.equal(cards.length > 0, true);
  assert.equal(cards.every((card) => Boolean(card.supportSpan?.trim())), true);
  assert.equal(cards.every((card) => abstract.includes(card.supportSpan ?? "")), true);
  assert.equal(cards.every((card) => card.workflowId === "wf-1"), true);
});

test("report evidence merges canonical cards with exact-span fallback for uncovered sources", () => {
  const acceptedSources = [1, 2].map((index) =>
    sourceCandidateToSourceRecord({
      candidate: candidate({
        sourceId: `source-mixed-${index}`,
        title: `Caffeine attention source ${index}`,
        doi: `10.1000/mixed-${index}`,
        dedupeKey: `doi:10.1000/mixed-${index}`,
        abstractOriginal: `Source ${index} reports traceable evidence about caffeine and sustained attention.`,
        reviewStatus: "accepted",
        acceptedByUser: true,
        userDecision: "accepted",
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        usableSections: ["literature_review", "analysis"],
      }),
      workflowId: "wf-1",
      topicHash: "topic-1",
      queryPlanHash: "plan-1",
      originalTopic: "咖啡因攝取與注意力表現的關係",
    }),
  );
  const canonicalCard: GroundingEvidenceCard = {
    evidenceId: "canonical-source-1",
    workflowId: "wf-1",
    topicHash: "topic-1",
    sourceId: "source-mixed-1",
    claimTextOriginal: "Source 1 reports traceable evidence about caffeine and sustained attention.",
    claimTextZh: "來源一提供咖啡因與持續注意力的可追溯證據。",
    supportedByText: "Source 1 reports traceable evidence about caffeine and sustained attention.",
    supportSpan: "Source 1 reports traceable evidence about caffeine and sustained attention.",
    sourceUri: "https://doi.org/10.1000/mixed-1",
    sourceDoi: "10.1000/mixed-1",
    sourceTitle: "Caffeine attention source 1",
    citationMarker: "[S1]",
    usableFor: ["literature_review", "analysis"],
    confidence: 0.85,
    limitations: ["abstract only"],
    extractedBy: "llm",
    createdAt: "2026-07-16T00:00:00.000Z",
  };

  const cards = reportEvidenceCardsForAcceptedSources({
    acceptedSources,
    groundingEvidenceCards: [canonicalCard],
    topic: "咖啡因攝取與注意力表現的關係",
  });

  assert.equal(cards.some((card) => card.id === "canonical-source-1"), true);
  assert.equal(cards.some((card) => card.sourceId === "source-mixed-2"), true);
  assert.deepEqual(
    cards.filter((card) => card.sourceId === "source-mixed-1").map((card) => card.id),
    ["canonical-source-1"],
  );
  assert.equal(cards.find((card) => card.id === "canonical-source-1")?.canonicalSourceKey, "doi:10.1000/mixed-1");
  assert.equal(cards.find((card) => card.id === "canonical-source-1")?.citationKey, "doi:10.1000/mixed-1");
});

test("canonical evidence key resolves an accepted source when provider sourceId changes", () => {
  const acceptedSource = sourceCandidateToSourceRecord({
    candidate: candidate({
      sourceId: "openalex:old-provider-id",
      reviewStatus: "accepted",
      recommendationBucket: "scholarly_recommended",
      sourceRole: "core_scholarly_evidence",
      acceptedByUser: true,
      userDecision: "accepted",
    }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "化石與藻類的關係",
  });
  const card: GroundingEvidenceCard = {
    evidenceId: "canonical-provider-remap",
    workflowId: "wf-1",
    topicHash: "topic-1",
    sourceId: "semantic-scholar:new-provider-id",
    canonicalSourceKey: "doi:10.1000/example",
    dedupeKey: "doi:10.1000/example",
    citationKey: "doi:10.1000/example",
    claimTextOriginal: "This paper examines algal structures and fossil algae.",
    claimTextZh: "此研究檢視藻類構造與藻類化石。",
    supportedByText: "This paper examines algal structures and fossil algae.",
    supportSpan: "This paper examines algal structures and fossil algae.",
    sourceUri: "https://doi.org/10.1000/example",
    sourceTitle: "Paleoenvironment, algal structures, and fossil algae",
    citationMarker: "[S1]",
    usableFor: ["literature_review"],
    confidence: 0.8,
    limitations: ["abstract only"],
    extractedBy: "llm",
    createdAt: "2026-07-16T00:00:00.000Z",
  };

  const cards = groundedEvidenceCardsForAcceptedSources({
    acceptedSources: [acceptedSource],
    groundingEvidenceCards: [card],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.sourceId, "semantic-scholar:new-provider-id");
  assert.equal(cards[0]?.canonicalSourceKey, "doi:10.1000/example");
  assert.equal(cards[0]?.doi, "10.1000/example");
});

test("report evidence preserves metadata-only accepted papers as non-claim bibliographic cards", () => {
  const acceptedSource = sourceCandidateToSourceRecord({
    candidate: candidate({
      sourceId: "metadata-background",
      title: "Bibliographic background for canine behavior",
      abstractOriginal: undefined,
      abstract: undefined,
      doi: "10.1000/canine-background",
      reviewStatus: "accepted",
      acceptedByUser: true,
      userDecision: "accepted",
      recommendationBucket: "scholarly_recommended",
    }),
    workflowId: "wf-1",
    topicHash: "topic-1",
    queryPlanHash: "plan-1",
    originalTopic: "犬隻資源防衛行為",
  });

  const cards = reportEvidenceCardsForAcceptedSources({
    acceptedSources: [acceptedSource],
    groundingEvidenceCards: [],
    topic: "犬隻資源防衛行為",
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.derivation, "metadata-derived");
  assert.equal(cards[0]?.doi, "10.1000/canine-background");
  assert.deepEqual(cards[0]?.authors, acceptedSource.authors);
  assert.match(cards[0]?.limitation ?? "", /書目|不可產生具體研究結論/u);
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
