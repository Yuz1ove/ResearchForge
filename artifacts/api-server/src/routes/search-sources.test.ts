import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { SourceRecord } from "@workspace/api-zod";
import { createSearchSourcesRouter, normalizeSearchSourcesRequest } from "./search-sources";

test("search source request normalization rejects invalid input without opening a network listener", () => {
  assert.equal(normalizeSearchSourcesRequest({}), null);
  assert.equal(normalizeSearchSourcesRequest({ query: "   " }), null);
  assert.equal(normalizeSearchSourcesRequest({ topic: "   " }), null);
});

test("search source request normalization keeps existing query-style calls", () => {
  assert.deepEqual(normalizeSearchSourcesRequest({ query: "  student sleep quality  " }), {
    kind: "query",
    query: "student sleep quality",
  });
});

test("search source request normalization accepts generator topic-style calls", () => {
  assert.deepEqual(
    normalizeSearchSourcesRequest({
      topic: "  短影音使用對高中生注意力與睡眠品質之影響  ",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
      sourceMode: "academic",
    }),
    {
      kind: "topic",
      input: {
        topic: "短影音使用對高中生注意力與睡眠品質之影響",
        reportType: "研究報告",
        audience: "高中",
        language: "zh-TW",
        sourceMode: "academic",
      },
    },
  );
});

function sourceRecord(title: string): SourceRecord {
  return {
    id: `title:Crossref:${title.toLowerCase()}`,
    title,
    authors: [],
    year: 2024,
    abstract: "Urban heat island, thermal comfort, and campus microclimate.",
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: null,
    containerTitle: null,
    accessedAt: null,
  };
}

test("search source topic-style route response includes search intent fields", async () => {
  const router = createSearchSourcesRouter({
    topicSearchHandler: async (input) => {
      const source = sourceRecord("Urban heat island effects on campus thermal comfort");
      return {
        ok: true,
        topic: input.topic,
        searchIntent: {
          primaryConcepts: ["urban heat island", "thermal comfort"],
          contextConcepts: ["campus"],
          outcomeConcepts: ["student comfort"],
          populationConcepts: ["students"],
          lowWeightTerms: ["students", "learning"],
          mustHaveTerms: ["heat", "thermal", "microclimate"],
          plannerStatus: "rule_fallback",
          fallbackUsed: true,
        },
        queries: {
          chinese: ["都市熱島效應 校園 熱舒適度"],
          english: ["urban heat island campus thermal comfort students"],
          highPrecision: ["urban heat island campus thermal comfort students"],
          broad: ["urban heat island campus"],
        },
        results: [source],
        sources: [source],
        provider_status: [
          {
            ok: false,
            provider: "Semantic Scholar",
            query: "urban heat island campus thermal comfort students",
            results: [],
            error_type: "api-failure",
            error_message: "Semantic Scholar returned HTTP 503",
          },
        ],
        warnings: ["外部學術 API 暫時不可用。", "目前取得 1/20 筆來源。"],
        planner: {
          normalizedTopic: input.topic,
          primaryConcepts: ["urban heat island", "thermal comfort"],
          contextConcepts: ["campus"],
          outcomeConcepts: ["student comfort"],
          populationConcepts: ["students"],
          lowWeightTerms: ["students", "learning"],
          mustHaveTerms: ["heat", "thermal", "microclimate"],
          shouldHaveTerms: ["school environment"],
          penaltyTerms: ["academic performance"],
          negativeTerms: [],
          chineseQueries: ["都市熱島效應 校園 熱舒適度"],
          englishQueries: ["urban heat island campus thermal comfort students"],
          reasoningNotes: ["fallback used"],
          plannerStatus: "rule_fallback",
          fallbackUsed: true,
        },
        llm_status: "failed",
        keyword_expansion: {
          normalized_topic: input.topic,
          domains: ["environmental_science", "urban_studies"],
          search_queries: ["urban heat island campus thermal comfort students"],
          english_queries: ["urban heat island campus thermal comfort students"],
          chinese_queries: ["都市熱島效應 校園 熱舒適度"],
          preferred_source_types: ["peer_reviewed_journal"],
          avoid_source_types: ["content_farm"],
          reasoning_notes: ["fallback used"],
          fallback_used: true,
          llm_status: "failed",
        },
        groups: [],
      };
    },
  });

  const route = router.stack.find((layer) => layer.route?.path === "/search-sources");
  assert.ok(route);
  assert.ok(route.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "都市熱島效應對校園環境與學生學習舒適度之影響",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
      sourceMode: "academic",
    },
  };
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

  await route.route.stack[0].handle(req as Request, res as unknown as Response, () => undefined);

  assert.equal(statusCode, 200);
  assert.ok(payload && typeof payload === "object");
  const result = payload as {
    searchIntent?: { primaryConcepts: string[]; lowWeightTerms: string[]; plannerStatus: string };
    provider_status?: Array<{ ok: boolean }>;
    warnings?: string[];
    sources?: SourceRecord[];
  };
  assert.ok(result.searchIntent?.primaryConcepts.includes("urban heat island"));
  assert.ok(result.searchIntent?.lowWeightTerms.includes("learning"));
  assert.equal(result.searchIntent?.plannerStatus, "rule_fallback");
  assert.ok(result.provider_status?.some((group) => !group.ok));
  assert.ok(result.warnings?.some((warning) => warning.includes("學術 API") || warning.includes("可用結果")));
  assert.equal(result.sources?.length, 1);
});
