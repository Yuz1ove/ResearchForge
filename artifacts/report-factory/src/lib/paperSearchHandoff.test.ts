import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaperSearchHandoff,
  mergePaperSearchPapers,
  paperSearchHandoffToSources,
  parsePaperSearchHandoff,
  restorePaperSearchSourceReviews,
  savePaperSearchSourceReviews,
} from "./paperSearchHandoff.ts";
import { sourceReviewState, updateSourceReviewState } from "./sourceRecords.ts";

const PAPER = {
  id: "openalex-W123",
  title: "Rain Drop Terminal Velocity",
  authors: ["A. Researcher"],
  year: 2024,
  venue: "Journal of Atmospheric Science",
  doi: "10.1000/rain",
  url: "https://doi.org/10.1000/rain",
  provider: "OpenAlex",
  citationCount: 12,
  isOpenAccess: true,
  abstract: "This study measures the terminal velocity of falling rain drops.",
  summary: "研究量測雨滴下降時的終端速度。",
  summaryStatus: "success",
  summarySourceType: "abstract",
  summaryConfidence: "high",
};

test("paper search handoff preserves the successful query and papers", () => {
  const handoff = createPaperSearchHandoff({
    query: "雨滴終端速度",
    queries: ["raindrop terminal velocity"],
    papers: [PAPER],
    workflowId: "paper-search-test",
    runId: "paper-run-test",
    createdAt: "2026-07-18T00:00:00.000Z",
  });
  const parsed = parsePaperSearchHandoff(JSON.stringify(handoff));

  assert.equal(parsed?.query, "雨滴終端速度");
  assert.deepEqual(parsed?.queries, [
    "雨滴終端速度",
    "raindrop terminal velocity",
  ]);
  assert.equal(parsed?.papers[0]?.doi, "10.1000/rain");
});

test("paper search handoff becomes accepted report sources without another search", () => {
  const handoff = createPaperSearchHandoff({
    query: "雨滴終端速度",
    papers: [PAPER],
    workflowId: "paper-search-test",
    runId: "paper-run-test",
    createdAt: "2026-07-18T00:00:00.000Z",
  });
  const sources = paperSearchHandoffToSources(handoff, {
    topicHash: "topic-rain",
    queryPlanHash: "query-rain",
  });

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.reviewState, "accepted");
  assert.equal(sources[0]?.workflowId, "paper-search-test");
  assert.equal(sources[0]?.topic, "雨滴終端速度");
  assert.equal(sources[0]?.abstract, PAPER.abstract);
  assert.equal(sources[0]?.evidenceGrounding, "abstract_grounded");
  assert.equal(sources[0]?.llmSummaryZhTw, PAPER.summary);
  assert.equal(sources[0]?.readableSummaryZhTW, PAPER.summary);
  assert.equal(sources[0]?.llmSummaryStatus, "success");
  assert.equal(sources[0]?.summarySourceType, "abstract");
  assert.equal(sources[0]?.originalSnippet, PAPER.abstract);
});

test("paper search handoff preserves the matching English query as a per-source cross-language bridge", () => {
  const gutPaper = {
    ...PAPER,
    id: "openalex-gut-axis",
    title: "The Microbiota-Gut-Brain Axis",
    doi: "10.1152/physrev.00018.2018",
    abstract:
      "The gut microbiota communicates bidirectionally with the brain through neural, endocrine, immune, and metabolic pathways.",
  };
  const handoff = createPaperSearchHandoff({
    query: "腸道菌相與青少年睡眠品質的關聯",
    queries: ["gut microbiota adolescent sleep quality association"],
    papers: [gutPaper],
    workflowId: "paper-search-gut",
    runId: "paper-run-gut",
    createdAt: "2026-08-09T00:00:00.000Z",
  });
  const [source] = paperSearchHandoffToSources(handoff, {
    topicHash: "topic-gut",
    queryPlanHash: "query-gut",
  });

  assert.equal(
    source?.queryUsed,
    "gut microbiota adolescent sleep quality association",
  );
});

test("paper search handoff does not attach an unmatched English query to an off-topic source", () => {
  const handoff = createPaperSearchHandoff({
    query: "腸道菌相與青少年睡眠品質的關聯",
    queries: ["gut microbiota adolescent sleep quality association"],
    papers: [
      {
        ...PAPER,
        id: "openalex-hospital-logistics",
        title: "Hospital logistics dashboards and inventory management",
        doi: "10.1000/hospital-logistics",
        abstract:
          "This paper evaluates warehouse routing, staffing schedules, and procurement dashboards for hospital administrators.",
      },
    ],
    workflowId: "paper-search-off-topic",
    runId: "paper-run-off-topic",
    createdAt: "2026-08-09T00:00:00.000Z",
  });
  const [source] = paperSearchHandoffToSources(handoff, {
    topicHash: "topic-gut",
    queryPlanHash: "query-gut",
  });

  assert.equal(source?.queryUsed, handoff.query);
});

test("metadata-only paper summaries remain readable context instead of evidence snippets", () => {
  const handoff = createPaperSearchHandoff({
    query: "雨滴終端速度",
    papers: [
      { ...PAPER, abstract: null, summarySourceType: "metadataFallback" },
    ],
    workflowId: "paper-search-test",
    runId: "paper-run-test",
    createdAt: "2026-07-18T00:00:00.000Z",
  });
  const [source] = paperSearchHandoffToSources(handoff, {
    topicHash: "topic-rain",
    queryPlanHash: "query-rain",
  });

  assert.equal(source?.snippet, null);
  assert.equal(source?.llmSummaryZhTw, PAPER.summary);
  assert.equal(source?.summarySourceType, "metadataFallback");
  assert.equal(source?.canUseForClaims, false);
});

test("fast and expanded duplicate results keep the richest traceable fields", () => {
  const merged = mergePaperSearchPapers(
    [{ ...PAPER, provider: "Crossref", abstract: null, authors: [] }],
    [{ ...PAPER, provider: "OpenAlex", citationCount: 20 }],
    new Map(),
    1,
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.abstract, PAPER.abstract);
  assert.deepEqual(merged[0]?.authors, PAPER.authors);
  assert.equal(merged[0]?.citationCount, 20);
  assert.equal(merged[0]?.provider, "Crossref, OpenAlex");
});

test("paper search merges exact same-work preprint versions before workspace handoff", () => {
  const title =
    "GIS-Based Spatial Optimization of Potential Urban Green Spaces";
  const merged = mergePaperSearchPapers(
    [
      {
        ...PAPER,
        id: "ssrn",
        title,
        authors: ["Jeyasuriya Durai"],
        year: 2026,
        doi: "10.2139/ssrn.7219073",
        url: "https://doi.org/10.2139/ssrn.7219073",
        abstract: null,
      },
    ],
    [
      {
        ...PAPER,
        id: "research-square",
        title: `${title}:`,
        authors: ["Jeyasuriya Durai"],
        year: 2026,
        doi: "10.21203/rs.3.rs-10531025/v1",
        url: "https://doi.org/10.21203/rs.3.rs-10531025/v1",
        abstract: "Richer version abstract.",
      },
    ],
    new Map(),
    12,
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.doi, "10.21203/rs.3.rs-10531025/v1");
  assert.equal(merged[0]?.url, "https://doi.org/10.21203/rs.3.rs-10531025/v1");
  assert.equal(merged[0]?.abstract, "Richer version abstract.");
});

test("paper-search source decisions survive reconstruction for the same workflow topic and run", () => {
  const handoff = createPaperSearchHandoff({
    query: "雨滴終端速度",
    queries: ["raindrop terminal velocity"],
    papers: [
      PAPER,
      {
        ...PAPER,
        id: "openalex-W456",
        doi: "10.1000/rain-two",
        title: "Rain Two",
      },
      {
        ...PAPER,
        id: "openalex-W789",
        doi: "10.1000/rain-three",
        title: "Rain Three",
      },
    ],
    workflowId: "paper-search-review-test",
    runId: "paper-run-review-test",
    createdAt: "2026-08-09T00:00:00.000Z",
  });
  const context = {
    workflowId: handoff.workflowId,
    topicHash: "topic-rain-review",
    runId: handoff.runId,
  };
  const storageValues = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return storageValues.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storageValues.set(key, value);
    },
  };
  const freshSources = paperSearchHandoffToSources(handoff, {
    topicHash: context.topicHash,
    queryPlanHash: "query-rain-review",
  });
  const rejected = updateSourceReviewState(
    freshSources,
    "openalex-W123",
    "rejected",
  );
  const reviewed = updateSourceReviewState(
    rejected,
    "openalex-W789",
    "pending",
  );

  savePaperSearchSourceReviews(context, reviewed, storage);

  const reconstructed = paperSearchHandoffToSources(handoff, {
    topicHash: context.topicHash,
    queryPlanHash: "query-rain-review",
  });
  const restored = restorePaperSearchSourceReviews(
    context,
    reconstructed,
    storage,
  );

  assert.deepEqual(restored.map(sourceReviewState), [
    "rejected",
    "accepted",
    "pending",
  ]);
  assert.equal(restored[0]?.acceptedByUser, false);
  assert.equal(restored[0]?.userDecision, "rejected");
  assert.equal(restored[0]?.acceptedAs, null);
  assert.equal(restored[1]?.acceptedByUser, true);
  assert.equal(restored[1]?.userDecision, "accepted");
  assert.equal(restored[1]?.acceptedAs, "source");
  assert.equal(restored[2]?.acceptedByUser, false);
  assert.equal(restored[2]?.userDecision, "pending");
  assert.equal(restored[2]?.acceptedAs, null);
});

test("paper-search decisions are isolated by the complete workflow topic and run key", () => {
  const handoff = createPaperSearchHandoff({
    query: "雨滴終端速度",
    papers: [PAPER],
    workflowId: "paper-search-isolation-test",
    runId: "paper-run-a",
    createdAt: "2026-08-09T00:00:00.000Z",
  });
  const savedContext = {
    workflowId: handoff.workflowId,
    topicHash: "topic-rain-isolation",
    runId: handoff.runId,
  };
  const storageValues = new Map<string, string>();
  const storage = {
    getItem(key: string) {
      return storageValues.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      storageValues.set(key, value);
    },
  };
  const rejected = updateSourceReviewState(
    paperSearchHandoffToSources(handoff, {
      topicHash: savedContext.topicHash,
      queryPlanHash: "query-rain-isolation",
    }),
    PAPER.id,
    "rejected",
  );
  savePaperSearchSourceReviews(savedContext, rejected, storage);

  const nextRunSources = paperSearchHandoffToSources(handoff, {
    topicHash: savedContext.topicHash,
    queryPlanHash: "query-rain-isolation",
  });
  const restored = restorePaperSearchSourceReviews(
    { ...savedContext, runId: "paper-run-b" },
    nextRunSources,
    storage,
  );

  assert.equal(sourceReviewState(restored[0]!), "accepted");
  assert.equal(restored[0]?.acceptedByUser, true);
});
