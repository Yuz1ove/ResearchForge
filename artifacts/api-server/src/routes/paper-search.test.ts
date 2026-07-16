import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { SourceRecord } from "@workspace/api-zod";
import type { KeywordExpansionResult } from "../services/keyword-expansion";
import type {
  SourceProviderSearchResult,
  SourceSearchOptions,
} from "../services/source-retrieval";
import {
  createPaperSearchRouter,
  normalizePaperSearchRequest,
  normalizePaperSummariesRequest,
  type PaperSearchResponse,
  type PaperSummariesResponse,
} from "./paper-search";

function expansion(englishQuery = "generative AI learning outcomes"): KeywordExpansionResult {
  return {
    normalized_topic: "生成式 AI 與學習成效",
    domains: ["artificial_intelligence", "education"],
    search_queries: [englishQuery],
    english_queries: [englishQuery],
    chinese_queries: ["生成式 AI 與學習成效"],
    preferred_source_types: ["peer_reviewed_journal"],
    avoid_source_types: ["content_farm"],
    reasoning_notes: [],
    fallback_used: false,
    llm_status: "success",
  };
}

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "paper-a",
    title: "Generative AI and student learning outcomes",
    authors: ["Ada Author"],
    year: 2024,
    abstract: "This study evaluates how generative AI affects student learning outcomes.",
    doi: "10.1000/generative-ai",
    url: "https://doi.org/10.1000/generative-ai",
    sourceType: "OpenAlex",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Journal of Learning Research",
    accessedAt: null,
    ...overrides,
  };
}

function providerResult(
  provider: SourceProviderSearchResult["provider"],
  results: SourceRecord[],
  ok = true,
): SourceProviderSearchResult {
  return {
    ok,
    provider,
    query: "query",
    results,
    error_type: ok ? null : "api-failure",
    error_message: ok ? null : `${provider} unavailable`,
  };
}

async function invoke(
  router: ReturnType<typeof createPaperSearchRouter>,
  body: unknown,
  path = "/paper-search",
): Promise<{ statusCode: number; payload: unknown }> {
  const route = router.stack.find((layer) => layer.route?.path === path);
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = { body };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  };

  await route.route.stack[0].handle(
    req as Request,
    res as unknown as Response,
    () => undefined,
  );
  return { statusCode, payload };
}

test("paper search rejects blank or invalid requests with 400", async () => {
  assert.equal(normalizePaperSearchRequest({ query: "   " }), null);
  assert.equal(normalizePaperSearchRequest({ query: "a" }), null);
  assert.equal(normalizePaperSearchRequest({ query: "valid", limit: 2 }), null);
  assert.equal(normalizePaperSearchRequest({ query: "valid", limit: 21 }), null);
  assert.equal(normalizePaperSearchRequest({ query: "valid", searchMode: "turbo" }), null);
  assert.equal(normalizePaperSearchRequest({ query: "valid", includeSummaries: "no" }), null);
  assert.deepEqual(normalizePaperSearchRequest({ query: "  valid topic  " }), {
    query: "valid topic",
    limit: 10,
    searchMode: "expanded",
    includeSummaries: true,
  });
  assert.deepEqual(
    normalizePaperSearchRequest({
      query: "valid topic",
      limit: 20,
      searchMode: "fast",
      includeSummaries: false,
    }),
    {
      query: "valid topic",
      limit: 20,
      searchMode: "fast",
      includeSummaries: false,
    },
  );

  const { statusCode, payload } = await invoke(createPaperSearchRouter(), {
    query: "   ",
  });
  assert.equal(statusCode, 400);
  assert.deepEqual(Object.keys(payload as object).sort(), ["message", "ok"]);
});

test("paper search fast mode skips expansion and uses bounded single-page providers", async () => {
  const originalQuery = "adolescent sleep";
  let expansionCallCount = 0;
  const searchCalls: Array<{ query: string; options: SourceSearchOptions | undefined }> = [];
  const papersFor = (provider: "openalex" | "crossref") =>
    Array.from({ length: 2 }, (_, index) =>
      source({
        id: `${provider}-${index + 1}`,
        title: `Adolescent sleep ${provider} paper ${index + 1}`,
        doi: `10.1000/${provider}-${index + 1}`,
        sourceType: provider === "openalex" ? "OpenAlex" : "Crossref",
        provider: provider === "openalex" ? "OpenAlex" : "Crossref",
      }),
    );

  const router = createPaperSearchRouter({
    expandKeywords: async () => {
      expansionCallCount += 1;
      return expansion();
    },
    searchProviders: async (query, options) => {
      searchCalls.push({ query, options });
      return [
        providerResult("OpenAlex", papersFor("openalex")),
        providerResult("Crossref", papersFor("crossref")),
      ];
    },
    summarizeSources: async (_topic, sources) => sources,
  });

  const { statusCode, payload } = await invoke(router, {
    query: originalQuery,
    searchMode: "fast",
    limit: 20,
  });
  const response = payload as PaperSearchResponse;

  assert.equal(statusCode, 200);
  assert.equal(expansionCallCount, 0);
  assert.equal(searchCalls.length, 1);
  assert.equal(searchCalls[0]?.query, originalQuery);
  assert.deepEqual(searchCalls[0]?.options?.providers, ["OpenAlex", "Crossref"]);
  assert.equal(searchCalls[0]?.options?.allowShortQueryRetry, false);
  assert.equal(searchCalls[0]?.options?.providerConfigs?.OpenAlex?.pageLimit, 1);
  assert.equal(searchCalls[0]?.options?.providerConfigs?.Crossref?.pageLimit, 1);
  assert.ok((searchCalls[0]?.options?.providerConfigs?.OpenAlex?.queryLimit ?? 26) <= 25);
  assert.ok((searchCalls[0]?.options?.providerConfigs?.Crossref?.queryLimit ?? 26) <= 25);
  assert.equal(searchCalls[0]?.options?.providerConfigs?.["Semantic Scholar"], undefined);
  assert.deepEqual(response.queries, [originalQuery]);
  assert.deepEqual(
    response.papers.map((paper) => paper.id),
    ["openalex-1", "crossref-1", "openalex-2", "crossref-2"],
  );
});

test("paper search can defer summaries and return evidence excerpts immediately", async () => {
  let summarizeCallCount = 0;
  const router = createPaperSearchRouter({
    searchProviders: async () => [
      providerResult("OpenAlex", [
        source({
          title: "Adolescent sleep evidence",
          abstract: "<p>Evidence   from the original abstract.</p>",
        }),
        source({
          id: "metadata-only",
          title: "Adolescent sleep metadata-only paper",
          doi: "10.1000/metadata-only",
          abstract: null,
          snippet: null,
        }),
      ]),
    ],
    summarizeSources: async (_topic, sources) => {
      summarizeCallCount += 1;
      return sources;
    },
  });

  const { statusCode, payload } = await invoke(router, {
    query: "adolescent sleep",
    searchMode: "fast",
    includeSummaries: false,
  });
  const response = payload as PaperSearchResponse;

  assert.equal(statusCode, 200);
  assert.equal(summarizeCallCount, 0);
  assert.equal(response.summaryMode, "deferred");
  assert.equal(response.papers[0]?.summary, "Evidence from the original abstract.");
  assert.equal(response.papers[0]?.summaryStatus, "pending");
  assert.equal(response.papers[0]?.summarySourceType, "abstract");
  const metadataOnly = response.papers.find((paper) => paper.id === "metadata-only");
  assert.match(metadataOnly?.summary ?? "", /書目資訊.*尚無原文摘要/);
  assert.equal(metadataOnly?.summaryStatus, "pending");
  assert.equal(metadataOnly?.summarySourceType, "metadataFallback");
  assert.ok(response.warnings.every((warning) => !warning.includes("最多 4 篇")));
});

test("paper search removes provider records without a query or translated academic anchor", async () => {
  const router = createPaperSearchRouter({
    expandKeywords: async () => expansion("lutein clinical trial eye health"),
    searchProviders: async () => [
      providerResult("OpenAlex", [
        source({
          id: "lutein-paper",
          title: "The effect of lutein supplementation on eye health",
          abstract: "Lutein is a dietary carotenoid studied for eye health.",
          doi: "10.1000/lutein-paper",
        }),
        source({
          id: "unrelated-nudge",
          title: "精準輕推：以客戶為導向的商業應用",
          abstract: "This paper discusses business applications of nudge theory.",
          doi: "10.1000/unrelated-nudge",
        }),
      ]),
    ],
    summarizeSources: async (_topic, sources) => sources,
  });

  const { statusCode, payload } = await invoke(router, {
    query: "葉黃素",
    includeSummaries: false,
  });
  const response = payload as PaperSearchResponse;

  assert.equal(statusCode, 200);
  assert.deepEqual(response.papers.map((paper) => paper.id), ["lutein-paper"]);
  assert.ok(response.warnings.some((warning) => warning.includes("已略過 1 筆")));
});

test("paper search dedupes results, marks primary sources, and maps summaries by id", async () => {
  const originalQuery = "生成式 AI 與學習成效";
  const englishQuery = "generative AI learning outcomes";
  const duplicateWithAbstract = source({
    id: "paper-a-crossref",
    sourceType: "Crossref",
    provider: "Crossref",
    abstract: "A richer abstract supplied by Crossref.",
  });
  const secondPaper = source({
    id: "paper-b",
    title: "AI tutoring in higher education",
    doi: "10.1000/ai-tutoring",
    url: "https://doi.org/10.1000/ai-tutoring",
    sourceType: "Crossref",
    provider: "Crossref",
    abstract: "Evidence about AI tutoring and higher education.",
  });
  const calls: Array<{ query: string; options: SourceSearchOptions | undefined }> = [];
  let summarizedInput: SourceRecord[] = [];

  const router = createPaperSearchRouter({
    expandKeywords: async () => expansion(englishQuery),
    searchProviders: async (query, options) => {
      calls.push({ query, options });
      if (query === originalQuery) {
        return [
          providerResult("OpenAlex", [source({ abstract: null })]),
          providerResult("Crossref", []),
        ];
      }
      return [
        providerResult("OpenAlex", [secondPaper]),
        providerResult("Crossref", [duplicateWithAbstract]),
      ];
    },
    summarizeSources: async (_topic, sources) => {
      summarizedInput = sources;
      return [...sources]
        .reverse()
        .map((paper) =>
          paper.id === "paper-a"
            ? {
                ...paper,
                readableSummaryZhTW: "第一篇的繁中重點。",
                llmSummaryZhTw: "不應優先選到這段。",
                summaryStatus: "success" as const,
                summarySourceType: "abstract" as const,
                summaryConfidence: "high" as const,
              }
            : {
                ...paper,
                llmSummaryZhTw: "第二篇的繁中重點。",
                summaryStatus: "success" as const,
                summarySourceType: "abstract" as const,
                summaryConfidence: "medium" as const,
              },
        );
    },
  });

  const { statusCode, payload } = await invoke(router, {
    query: `  ${originalQuery}  `,
    limit: 3,
  });
  const response = payload as PaperSearchResponse;

  assert.equal(statusCode, 200);
  assert.equal(response.ok, true);
  assert.equal(response.query, originalQuery);
  assert.deepEqual(response.queries, [originalQuery, englishQuery]);
  assert.equal(response.count, 2);
  assert.equal(response.papers.length, 2);
  assert.equal(new Set(response.papers.map((paper) => paper.doi)).size, 2);
  assert.equal(
    response.papers.find((paper) => paper.id === "paper-a")?.summary,
    "第一篇的繁中重點。",
  );
  assert.equal(
    response.papers.find((paper) => paper.id === "paper-b")?.summary,
    "第二篇的繁中重點。",
  );
  assert.equal(response.summaryMode, "llm");
  assert.ok(summarizedInput.every((paper) => paper.relevanceLevel === "primary"));
  assert.deepEqual(calls.map((call) => call.query), [originalQuery, englishQuery]);
  assert.ok(
    calls.every(
      (call) =>
        JSON.stringify(call.options?.providers) ===
        JSON.stringify(["OpenAlex", "Crossref", "Semantic Scholar"]),
    ),
  );
  assert.ok(
    calls.every((call) =>
      Object.values(call.options?.providerConfigs ?? {}).every(
        (config) => config.pageLimit === 1 && config.queryLimit <= 25,
      ),
    ),
  );
});

test("paper search interleaves original and translated query results", async () => {
  const originalQuery = "生成式 AI 與學習成效";
  const englishQuery = "generative AI learning outcomes";
  const papersFor = (prefix: string) =>
    Array.from({ length: 5 }, (_, index) =>
      source({
        id: `${prefix}-${index + 1}`,
        title: `Generative AI ${prefix} paper ${index + 1}`,
        doi: `10.1000/${prefix}-${index + 1}`,
        abstract: `${prefix} abstract ${index + 1} with enough source content.`,
      }),
    );

  const router = createPaperSearchRouter({
    expandKeywords: async () => expansion(englishQuery),
    searchProviders: async (query) => [
      providerResult(
        "OpenAlex",
        papersFor(query === originalQuery ? "original" : "translated"),
      ),
    ],
    summarizeSources: async (_topic, sources) => sources,
  });

  const { payload } = await invoke(router, { query: originalQuery, limit: 3 });
  const response = payload as PaperSearchResponse;

  assert.deepEqual(
    response.papers.map((paper) => paper.id),
    ["original-1", "translated-1", "original-2"],
  );
});

test("paper search keeps partial provider results and falls back safely when summaries fail", async () => {
  const originalQuery = "青少年睡眠";
  const partialPaper = source({
    id: "paper-partial",
    title: "Adolescent sleep duration",
    doi: "10.1000/adolescent-sleep",
    abstract: null,
    snippet: "A provider-supplied snippet about adolescent sleep duration.",
    sourceType: "Crossref",
    provider: "Crossref",
  });

  const router = createPaperSearchRouter({
    expandKeywords: async () => expansion("adolescent sleep duration"),
    searchProviders: async (query) => {
      if (query !== originalQuery) throw new Error("one query failed");
      return [
        providerResult("OpenAlex", [source({
          title: "Adolescent sleep evidence",
          abstract: "Evidence about adolescent sleep duration.",
        })]),
        providerResult("Crossref", [partialPaper], false),
      ];
    },
    summarizeSources: async () => {
      throw new Error("summary provider failed");
    },
  });

  const { statusCode, payload } = await invoke(router, { query: originalQuery });
  const response = payload as PaperSearchResponse;

  assert.equal(statusCode, 200);
  assert.equal(response.ok, true);
  assert.equal(response.count, 2);
  assert.equal(response.summaryMode, "fallback");
  assert.equal(
    response.papers.find((paper) => paper.id === "paper-partial")?.summary,
    partialPaper.snippet,
  );
  assert.ok(response.papers.every((paper) => paper.summaryStatus === "fallback"));
  assert.ok(response.warnings.some((warning) => warning.includes("其餘可用結果")));
  assert.ok(response.warnings.some((warning) => warning.includes("原文摘要或片段節錄")));
});

test("paper search returns a stable 200 response when no titled papers are found", async () => {
  let summarizeCallCount = 0;
  const router = createPaperSearchRouter({
    expandKeywords: async () => expansion("marine microplastics"),
    searchProviders: async () => [providerResult("OpenAlex", [])],
    summarizeSources: async (_topic, sources) => {
      summarizeCallCount += 1;
      return sources;
    },
  });

  const { statusCode, payload } = await invoke(router, { query: "海洋微塑膠" });
  const response = payload as PaperSearchResponse;

  assert.equal(statusCode, 200);
  assert.deepEqual(Object.keys(response), [
    "ok",
    "query",
    "count",
    "queries",
    "papers",
    "warnings",
    "summaryMode",
  ]);
  assert.equal(response.count, 0);
  assert.deepEqual(response.papers, []);
  assert.equal(response.summaryMode, "none");
  assert.ok(response.warnings.some((warning) => warning.includes("找不到")));
  assert.equal(summarizeCallCount, 0);
});

test("paper summaries endpoint validates a batch of one to four paper-shaped objects", async () => {
  assert.equal(normalizePaperSummariesRequest({ query: "valid", papers: [] }), null);
  assert.equal(
    normalizePaperSummariesRequest({
      query: "valid",
      papers: [{ id: "missing-title" }],
    }),
    null,
  );
  assert.equal(
    normalizePaperSummariesRequest({
      query: "valid",
      papers: Array.from({ length: 5 }, (_, index) => ({
        id: `paper-${index}`,
        title: `Paper ${index}`,
      })),
    }),
    null,
  );
  const mergedProviders = normalizePaperSummariesRequest({
    query: "valid",
    papers: [
      { id: "merged", title: "Merged providers", provider: "Crossref, S2" },
      { id: "s2", title: "S2 provider", provider: "S2" },
    ],
  });
  assert.equal(mergedProviders?.sources[0]?.sourceType, "Crossref");
  assert.equal(mergedProviders?.sources[1]?.sourceType, "Semantic Scholar");

  const { statusCode } = await invoke(
    createPaperSearchRouter(),
    { query: "valid", papers: [] },
    "/paper-search/summaries",
  );
  assert.equal(statusCode, 400);
});

test("paper summaries endpoint safely maps papers and prefers a long cleaned raw LLM summary", async () => {
  const longRawSummary = "這是依據原文摘要產生的完整繁體中文重點。".repeat(16);
  const shortReadableSummary = "短".repeat(170);
  let capturedSources: SourceRecord[] = [];
  let capturedMaxSources = 0;
  let capturedDetailLevel: string | undefined;
  const router = createPaperSearchRouter({
    summarizeSources: async (_topic, sources, options) => {
      capturedSources = sources;
      capturedMaxSources = options?.maxSources ?? 0;
      capturedDetailLevel = options?.detailLevel;
      return sources.map((paper) => ({
        ...paper,
        llmSummaryZhTw: `  <p>${longRawSummary}</p>  `,
        readableSummaryZhTW: shortReadableSummary,
        summarySourceType: "abstract" as const,
        summaryConfidence: "high" as const,
      }));
    },
  });

  const { statusCode, payload } = await invoke(
    router,
    {
      query: "  青少年睡眠  ",
      papers: [
        {
          id: "paper-safe",
          title: "Adolescent sleep duration",
          authors: ["A. Author"],
          year: 2023,
          venue: "Sleep Journal",
          doi: "10.1000/sleep",
          url: "https://doi.org/10.1000/sleep",
          provider: "OpenAlex, Crossref",
          citationCount: 12,
          isOpenAccess: true,
          abstract: "Original evidence supplied by the paper provider.",
          summary: "untrusted client summary",
          readableSummaryZhTW: "must not be accepted from the client",
          relevanceLevel: "off_topic",
        },
      ],
    },
    "/paper-search/summaries",
  );
  const response = payload as PaperSummariesResponse;

  assert.equal(statusCode, 200);
  assert.equal(response.query, "青少年睡眠");
  assert.equal(response.count, 1);
  assert.equal(response.summaryMode, "llm");
  assert.equal(response.papers[0]?.summary, longRawSummary);
  assert.ok((response.papers[0]?.summary.length ?? 0) > 170);
  assert.equal(capturedMaxSources, 1);
  assert.equal(capturedDetailLevel, "detailed");
  assert.equal(capturedSources[0]?.sourceType, "OpenAlex");
  assert.equal(capturedSources[0]?.relevanceLevel, "primary");
  assert.equal(capturedSources[0]?.readableSummaryZhTW, undefined);
  assert.equal(capturedSources[0]?.containerTitle, "Sleep Journal");
});
