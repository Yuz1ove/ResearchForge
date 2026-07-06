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
        originalTopic: "短影音使用對高中生注意力與睡眠品質之影響",
        reportType: "研究報告",
        audience: "高中",
        language: "zh-TW",
        sourceMode: "academic",
      },
    },
  );
});

test("search source request normalization promotes refined topic to active search topic", () => {
  assert.deepEqual(
    normalizeSearchSourcesRequest({
      originalTopic: "陀螺",
      refinedTopic: "陀螺的角動量、扭矩與旋轉穩定性原理",
      reportType: "研究報告",
      audience: "高中",
    }),
    {
      kind: "topic",
      input: {
        topic: "陀螺的角動量、扭矩與旋轉穩定性原理",
        originalTopic: "陀螺",
        refinedTopic: "陀螺的角動量、扭矩與旋轉穩定性原理",
        reportType: "研究報告",
        audience: "高中",
        language: undefined,
        sourceMode: undefined,
      },
    },
  );
});

test("search source request normalization keeps research-plan payload fields", () => {
  assert.deepEqual(
    normalizeSearchSourcesRequest({
      originalTopic: "螞蟻",
      topic: "螞蟻群體行為與土壤環境",
      displayTitle: "微小社會的巨大秩序：螞蟻群體行為與土壤環境",
      canonicalTopicZh: "螞蟻群體行為與土壤環境",
      canonicalTopicEn: "ant colony behavior and soil environment",
      querySeedZh: ["螞蟻 群體行為", "螞蟻 土壤 生態"],
      querySeedEn: ["ant colony behavior", "ant soil ecology"],
      mustIncludeTerms: ["螞蟻", "ant"],
      excludeTerms: ["Ant-Man", "logo"],
      domainHints: ["biology_ecology"],
      subtopics: [
        {
          id: "ant-1",
          titleZh: "螞蟻的群體分工與合作",
          queryZh: ["螞蟻 群體分工 合作"],
          queryEn: ["ant colony division of labor"],
        },
      ],
      selectedResearchPlanId: "ant-plan",
      workflowId: "wf-ant-001",
    }),
    {
      kind: "topic",
      input: {
        topic: "螞蟻群體行為與土壤環境",
        originalTopic: "螞蟻",
        refinedTopic: "螞蟻群體行為與土壤環境",
        displayTitle: "微小社會的巨大秩序：螞蟻群體行為與土壤環境",
        canonicalTopicZh: "螞蟻群體行為與土壤環境",
        canonicalTopicEn: "ant colony behavior and soil environment",
        querySeedZh: ["螞蟻 群體行為", "螞蟻 土壤 生態"],
        querySeedEn: ["ant colony behavior", "ant soil ecology"],
        subtopics: [
          {
            id: "ant-1",
            titleZh: "螞蟻的群體分工與合作",
            queryZh: ["螞蟻 群體分工 合作"],
            queryEn: ["ant colony division of labor"],
          },
        ],
        mustIncludeTerms: ["螞蟻", "ant"],
        excludeTerms: ["Ant-Man", "logo"],
        domainHints: ["biology_ecology"],
        selectedResearchPlanId: "ant-plan",
        workflowId: "wf-ant-001",
        reportType: undefined,
        audience: undefined,
        language: undefined,
        sourceMode: undefined,
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
      const workflowId = "00000000-0000-4000-8000-000000000001";
      const topicHash = "topic-hash";
      const queryPlanHash = "query-plan-hash";
      return {
        ok: true,
        topic: input.topic,
        workflowId,
        topicHash,
        queryPlanHash,
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
          coreConcepts: ["urban heat island", "thermal comfort", "campus"],
          chinese: ["都市熱島效應 校園 熱舒適度"],
          english: ["urban heat island campus thermal comfort students"],
          highPrecision: ["urban heat island campus thermal comfort students"],
          broad: ["urban heat island campus"],
          coreEnglishAcademic: ["urban heat island campus thermal comfort students"],
          academicSynonyms: [],
          education: [],
          chineseSupplemental: ["都市熱島效應 校園 熱舒適度"],
          fallbackRelaxed: ["urban heat island"],
          phases: [
            {
              stage: "core_english_academic",
              queries: ["urban heat island campus thermal comfort students"],
            },
          ],
        },
        results: [source],
        sources: [source],
        scoredSources: [source],
        candidateSources: [source],
        rejectedSources: [],
        fallbackReviewSources: [],
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
        warnings: ["部分來源提供者暫時無法使用，已顯示可用結果。"],
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
        searchTrace: {
          workflowId,
          topic: input.topic,
          originalTopic: input.originalTopic ?? input.topic,
          activeResearchTopic: input.topic,
          canonicalEnglishTopic: "",
          normalizedTopic: input.topic,
          topicHash,
          queryPlanHash,
          providerQueries: ["urban heat island campus thermal comfort students"],
          candidateCount: 1,
          dedupedCount: 1,
          acceptedCount: 0,
          rejectedCount: 0,
          sourceDecisions: [
            {
              title: source.title,
              provider: source.sourceType,
              url: source.url,
              relevanceScore: 80,
              authorityScore: 80,
              summaryUsabilityScore: 80,
              finalScore: 80,
              classification: "primary",
              rejectReason: null,
              matchedTerms: ["urban heat island"],
              driftTerms: [],
            },
          ],
        },
        diagnostics: {
          original_topic: input.originalTopic ?? input.topic,
          active_research_topic: input.topic,
          canonical_english_topic: "",
          core_concepts: ["urban heat island", "thermal comfort", "campus"],
          english_queries: ["urban heat island campus thermal comfort students"],
          chinese_queries: ["都市熱島效應 校園 熱舒適度"],
          fallback_relaxed_queries: ["urban heat island"],
          provider_search_results_count: 1,
          filtered_results_count: 0,
          rejection_reasons: {},
          retrieved_count: 1,
          deduped_count: 1,
          rejected_count: 0,
          candidate_count: 1,
          displayed_count: 1,
          primary_candidate_count: 1,
          provider_status: [
            {
              ok: false,
              provider: "Semantic Scholar",
              query: "urban heat island campus thermal comfort students",
              result_count: 0,
              error_type: "api-failure",
              error_message: "Semantic Scholar returned HTTP 503",
            },
          ],
          warnings: ["部分來源提供者暫時無法使用，已顯示可用結果。"],
        },
        llm_status: "failed",
        keyword_expansion: {
          normalized_topic: input.topic,
          domains: ["environmental_science", "urban_studies"],
          search_queries: ["urban heat island campus thermal comfort students"],
          english_queries: ["urban heat island campus thermal comfort students"],
          chinese_queries: ["都市熱島效應 校園 熱舒適度"],
          core_concepts: ["urban heat island", "thermal comfort", "campus"],
          core_english_queries: ["urban heat island campus thermal comfort students"],
          academic_synonym_queries: [],
          education_queries: [],
          fallback_relaxed_queries: ["urban heat island"],
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
  assert.ok(result.warnings?.some((warning) => warning.includes("部分來源提供者")));
  assert.equal(result.sources?.length, 1);
});

test("search source topic-style route sends active research topic to planner when refined topic exists", async () => {
  let capturedTopicInput: { topic: string; originalTopic?: string; refinedTopic?: string } | null =
    null;
  const router = createSearchSourcesRouter({
    topicSearchHandler: async (input) => {
      capturedTopicInput = input;
      return {
        ok: true,
        topic: input.topic,
        workflowId: "wf-test",
        topicHash: "topic-hash",
        queryPlanHash: "query-plan-hash",
        searchIntent: {
          primaryConcepts: [],
          contextConcepts: [],
          outcomeConcepts: [],
          populationConcepts: [],
          lowWeightTerms: [],
          mustHaveTerms: [],
          plannerStatus: "rule_fallback",
          fallbackUsed: true,
        },
        queries: {
          coreConcepts: [],
          chinese: [],
          english: [],
          highPrecision: [],
          broad: [],
          coreEnglishAcademic: [],
          academicSynonyms: [],
          education: [],
          chineseSupplemental: [],
          fallbackRelaxed: [],
          phases: [],
        },
        results: [],
        sources: [],
        scoredSources: [],
        candidateSources: [],
        rejectedSources: [],
        fallbackReviewSources: [],
        provider_status: [],
        warnings: [],
        planner: {
          normalizedTopic: input.topic,
          primaryConcepts: [],
          contextConcepts: [],
          outcomeConcepts: [],
          populationConcepts: [],
          lowWeightTerms: [],
          mustHaveTerms: [],
          shouldHaveTerms: [],
          penaltyTerms: [],
          negativeTerms: [],
          chineseQueries: [],
          englishQueries: [],
          reasoningNotes: [],
          plannerStatus: "rule_fallback",
          fallbackUsed: true,
        },
        searchTrace: {
          workflowId: "wf-test",
          topic: input.topic,
          originalTopic: input.originalTopic ?? input.topic,
          activeResearchTopic: input.topic,
          canonicalEnglishTopic: "",
          normalizedTopic: input.topic,
          topicHash: "topic-hash",
          queryPlanHash: "query-plan-hash",
          providerQueries: [],
          candidateCount: 0,
          dedupedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          sourceDecisions: [],
        },
        diagnostics: {
          original_topic: input.originalTopic ?? input.topic,
          active_research_topic: input.topic,
          canonical_english_topic: "",
          core_concepts: [],
          english_queries: [],
          chinese_queries: [],
          fallback_relaxed_queries: [],
          provider_search_results_count: 0,
          filtered_results_count: 0,
          rejection_reasons: {},
          retrieved_count: 0,
          deduped_count: 0,
          rejected_count: 0,
          candidate_count: 0,
          displayed_count: 0,
          primary_candidate_count: 0,
          provider_status: [],
          warnings: [],
        },
        llm_status: "skipped",
        keyword_expansion: {
          normalized_topic: input.topic,
          domains: [],
          search_queries: [],
          english_queries: [],
          chinese_queries: [],
          core_concepts: [],
          core_english_queries: [],
          academic_synonym_queries: [],
          education_queries: [],
          fallback_relaxed_queries: [],
          preferred_source_types: [],
          avoid_source_types: [],
          reasoning_notes: [],
          fallback_used: true,
          llm_status: "skipped",
        },
        groups: [],
      };
    },
  });

  const route = router.stack.find((layer) => layer.route?.path === "/search-sources");
  assert.ok(route?.route);

  let statusCode = 200;
  const req = {
    body: {
      originalTopic: "陀螺",
      refinedTopic: "陀螺的角動量、扭矩與旋轉穩定性原理",
      reportType: "研究報告",
      audience: "高中",
    },
  };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      return value;
    },
  };

  await route.route.stack[0].handle(req as Request, res as unknown as Response, () => undefined);

  assert.equal(statusCode, 200);
  assert.deepEqual(capturedTopicInput, {
    topic: "陀螺的角動量、扭矩與旋轉穩定性原理",
    originalTopic: "陀螺",
    refinedTopic: "陀螺的角動量、扭矩與旋轉穩定性原理",
    reportType: "研究報告",
    audience: "高中",
    language: undefined,
    sourceMode: undefined,
  });
});
