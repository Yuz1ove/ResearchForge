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
  type PaperSearchResponse,
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
): Promise<{ statusCode: number; payload: unknown }> {
  const route = router.stack.find((layer) => layer.route?.path === "/paper-search");
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
  assert.deepEqual(normalizePaperSearchRequest({ query: "  valid topic  " }), {
    query: "valid topic",
    limit: 6,
  });

  const { statusCode, payload } = await invoke(createPaperSearchRouter(), {
    query: "   ",
  });
  assert.equal(statusCode, 400);
  assert.deepEqual(Object.keys(payload as object).sort(), ["message", "ok"]);
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
  const calls: Array<{ query: string; providers: SourceSearchOptions["providers"] }> = [];
  let summarizedInput: SourceRecord[] = [];

  const router = createPaperSearchRouter({
    expandKeywords: async () => expansion(englishQuery),
    searchProviders: async (query, options) => {
      calls.push({ query, providers: options?.providers });
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
        JSON.stringify(call.providers) ===
        JSON.stringify(["OpenAlex", "Crossref", "Semantic Scholar"]),
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
        title: `${prefix} paper ${index + 1}`,
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
        providerResult("OpenAlex", [source()]),
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
