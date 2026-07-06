import assert from "node:assert/strict";
import test from "node:test";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  groundedEvidenceCardsForAcceptedSources,
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

test("accepted official background sources without grounding cards still produce limited evidence cards", () => {
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

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.sourceId, acceptedSource.id);
  assert.equal(cards[0]?.sourceType, "official_background");
  assert.equal(cards[0]?.acceptedByUser, true);
  assert.match(cards[0]?.limitations.join("；") ?? "", /非同行評審論文/);
});
