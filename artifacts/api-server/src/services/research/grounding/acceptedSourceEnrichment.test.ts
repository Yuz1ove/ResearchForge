import assert from "node:assert/strict";
import test from "node:test";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  abstractFromAcceptedSourceAliases,
  canonicalAcceptedSourceIdentity,
  clearAcceptedSourceEnrichmentCache,
  enrichAcceptedSources,
} from "./acceptedSourceEnrichment";
import { mergeSourceCandidateRecords } from "./researchGroundingPipeline";

function candidate(overrides: Partial<SourceCandidate> = {}): SourceCandidate {
  return {
    sourceId: overrides.sourceId ?? "source-1",
    workflowId: "wf-enrichment",
    topicHash: "topic-hash",
    queryUsed: "resource guarding positive reinforcement",
    queryIntent: "academic",
    provider: "crossref",
    title: "Resource guarding intervention study",
    authors: ["A. Researcher"],
    year: 2024,
    doi: "10.1000/guarding",
    sourceType: "paper",
    isPeerReviewed: true,
    relevanceScore: 0.9,
    sourceQualityScore: 0.85,
    retrievalMode: "live_provider",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    reviewStatus: "accepted",
    evidencePoints: [],
    limitations: [],
    usableSections: ["literature_review", "findings", "discussion"],
    citationMarker: "[S1]",
    dedupeKey: "doi:10.1000/guarding",
    createdAt: "2026-08-09T00:00:00.000Z",
    retrievedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  };
}

test("accepted source alias enrichment reads provider-specific aliases", () => {
  const source = candidate({
    abstract: undefined,
    abstractOriginal: undefined,
    rawProviderPayload: {
      providerPayload: {
        originalAbstract: "A real abstract preserved inside a provider payload.",
      },
    },
  });
  assert.equal(
    abstractFromAcceptedSourceAliases(source),
    "A real abstract preserved inside a provider payload.",
  );
});

test("accepted source enrichment restores OpenAlex abstract and OA URL with DOI request cache", async () => {
  clearAcceptedSourceEnrichmentCache();
  let calls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    calls += 1;
    assert.match(String(input), /api\.openalex\.org\/works\/doi%3A10\.1000%2Fguarding/u);
    return new Response(JSON.stringify({
      id: "https://openalex.org/W123",
      doi: "https://doi.org/10.1000/guarding",
      title: "Resource guarding intervention study",
      publication_year: 2024,
      abstract_inverted_index: {
        Positive: [0],
        reinforcement: [1],
        reduced: [2],
        guarding: [3],
        responses: [4],
      },
      best_oa_location: {
        pdf_url: "https://example.org/open/guarding.pdf",
        landing_page_url: "https://example.org/open/guarding",
      },
      open_access: { is_oa: true },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const [first, second] = await enrichAcceptedSources(
    [candidate(), candidate({ sourceId: "source-duplicate" })],
    {
      fetchImpl,
      concurrency: 2,
      retryCount: 0,
      backoffMs: 0,
      now: () => new Date("2026-08-09T01:00:00.000Z"),
    },
  );

  assert.equal(calls, 1, "same DOI must share one provider detail request");
  assert.match(first?.abstract ?? "", /Positive reinforcement reduced guarding responses/u);
  assert.equal(first?.fullTextUrl, "https://example.org/open/guarding.pdf");
  assert.equal(first?.contentLevel, "abstract");
  assert.equal(first?.enrichmentStatus, "success");
  assert.equal(first?.canonicalSourceIdentity, "doi:10.1000/guarding");
  assert.equal(first?.providerIds?.openalex, "https://openalex.org/W123");
  assert.equal(second?.abstract, first?.abstract);
});

test("accepted source enrichment separates permanent no-content from temporary provider failures", async () => {
  clearAcceptedSourceEnrichmentCache();
  const permanent = await enrichAcceptedSources([candidate()], {
    fetchImpl: async () => new Response("not found", { status: 404 }),
    retryCount: 0,
    backoffMs: 0,
  });
  assert.equal(permanent[0]?.contentLevel, "metadata");
  assert.equal(permanent[0]?.enrichmentStatus, "permanent_no_content");
  assert.match(permanent[0]?.enrichmentFailureReason ?? "", /http_404/u);

  clearAcceptedSourceEnrichmentCache();
  const temporary = await enrichAcceptedSources([candidate()], {
    fetchImpl: async () => new Response("temporarily unavailable", { status: 503 }),
    retryCount: 0,
    backoffMs: 0,
  });
  assert.equal(temporary[0]?.contentLevel, "metadata");
  assert.equal(temporary[0]?.enrichmentStatus, "temporary_failure");
  assert.match(temporary[0]?.enrichmentFailureReason ?? "", /http_503/u);
});

test("candidate merge keeps richer abstract, metadata, and provider identities", () => {
  const merged = mergeSourceCandidateRecords([
    candidate({
      sourceId: "metadata-first",
      abstract: undefined,
      abstractOriginal: undefined,
      authors: [],
      venue: undefined,
      providerIds: { crossref: "10.1000/guarding" },
      relevanceScore: 0.95,
      contentLevel: "metadata",
    }),
    candidate({
      sourceId: "abstract-second",
      provider: "openalex",
      abstractOriginal:
        "The richer abstract includes study methods, observed outcomes, and limitations.",
      authors: ["A. Researcher", "B. Trainer"],
      venue: "Applied Animal Behaviour Science",
      providerIds: { openalex: "https://openalex.org/W123" },
      relevanceScore: 0.8,
      contentLevel: "abstract",
    }),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.sourceId, "metadata-first");
  assert.match(merged[0]?.abstract ?? "", /observed outcomes/u);
  assert.deepEqual(merged[0]?.authors, ["A. Researcher", "B. Trainer"]);
  assert.equal(merged[0]?.venue, "Applied Animal Behaviour Science");
  assert.equal(merged[0]?.providerIds?.openalex, "https://openalex.org/W123");
  assert.equal(merged[0]?.contentLevel, "abstract");
});

test("candidate identity never merges same-title records with different DOI", () => {
  const left = candidate({ sourceId: "study-a", doi: "10.1000/study-a" });
  const right = candidate({
    sourceId: "study-b",
    doi: "10.1000/study-b",
    dedupeKey: "doi:10.1000/study-b",
  });
  assert.notEqual(canonicalAcceptedSourceIdentity(left), canonicalAcceptedSourceIdentity(right));
  assert.equal(mergeSourceCandidateRecords([left, right]).length, 2);
});
