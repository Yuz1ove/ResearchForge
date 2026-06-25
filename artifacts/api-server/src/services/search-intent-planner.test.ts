import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import {
  buildRuleBasedSearchIntent,
  buildSearchIntentQueries,
  hasLegacyGenericTemplate,
  inferSearchIntentTopicProfile,
  planSearchIntent,
  removeLegacyGenericAngles,
  rerankSourcesBySearchIntent,
  sanitizeSearchIntentPlan,
  searchIntentSources,
} from "./search-intent-planner";

const shortVideoTopic = "短影音使用對高中生注意力與睡眠品質之影響";
const urbanHeatTopic = "都市熱島效應對校園環境與學生學習舒適度之影響";
const colaHealthTopic = "可樂中的成分與攝取習慣對健康的影響";
const climateCausesTopic = "氣候變遷成因";

function sourceRecord(patch: Partial<SourceRecord> & { title: string }): SourceRecord {
  return {
    id: patch.id ?? `title:Crossref:${patch.title.toLowerCase()}`,
    title: patch.title,
    authors: patch.authors ?? [],
    year: patch.year ?? 2023,
    abstract: patch.abstract ?? null,
    doi: patch.doi ?? null,
    url: patch.url ?? null,
    sourceType: patch.sourceType ?? "Crossref",
    reviewState: patch.reviewState ?? "pending",
    publisher: patch.publisher ?? null,
    containerTitle: patch.containerTitle ?? null,
    accessedAt: patch.accessedAt ?? null,
  };
}

test("rule fallback returns digital media, sleep, and attention concepts for short video topics", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: shortVideoTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });

  for (const concept of ["short-form video", "social media", "digital media use", "sleep quality", "attention"]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  assert.ok(plan.englishQueries.some((query) => query.includes("short-form video")));
  assert.ok(plan.chineseQueries.some((query) => query.includes("短影音")));
  assert.equal(plan.plannerStatus, "rule_fallback");
  assert.equal(plan.fallbackUsed, true);
});

test("rule fallback keeps cola health core concepts ahead of generic education terms", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: colaHealthTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const allQueries = [...queries.highPrecision, ...queries.english, ...queries.chinese, ...queries.broad];

  for (const concept of ["cola", "soft drink", "sugar-sweetened beverage", "含糖飲料"]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["sugar", "caffeine", "health"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.outcomeConcepts.includes("咖啡因"));
  assert.ok(plan.penaltyTerms.includes("成人高考"));
  assert.ok(allQueries.some((query) => /cola|soft drink|sugar-sweetened/i.test(query)));
  assert.ok(
    !allQueries.some((query) => /education students peer reviewed research/i.test(query)),
    "generic education query should not be generated",
  );
});

test("rule fallback keeps climate change cause concepts in every main query family", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: climateCausesTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [...queries.highPrecision, ...queries.english, ...queries.chinese].join(" ");

  for (const concept of ["climate change", "global warming", "greenhouse gas", "溫室氣體"]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["fossil fuel", "化石燃料", "emissions", "排放"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.contextConcepts.includes("land use"));
  assert.ok(plan.penaltyTerms.includes("北京話"));
  assert.match(queryText, /climate change|氣候變遷/);
  assert.match(queryText, /greenhouse gas|溫室氣體/);
  assert.match(queryText, /fossil fuel|化石燃料/);
  assert.ok(!/education students peer reviewed research/i.test(queryText));
});

test("rule fallback weights urban heat island, thermal comfort, and microclimate over generic learning terms", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });

  for (const concept of ["urban heat island", "thermal comfort", "microclimate", "heat stress"]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const context of ["campus", "school environment", "educational buildings", "schoolyard"]) {
    assert.ok(plan.contextConcepts.includes(context), `expected ${context}`);
  }
  for (const term of ["students", "learning", "education"]) {
    assert.ok(plan.lowWeightTerms.includes(term), `expected low-weight ${term}`);
  }
  for (const term of ["heat", "thermal", "temperature", "microclimate", "urban heat island", "UHI"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
});

test("LLM planner falls back on provider failure, invalid JSON, and quota-style HTTP responses", async () => {
  const invalidJson = await planSearchIntent(
    { topic: urbanHeatTopic, language: "zh-TW" },
    {
      llm: { apiKey: "test-key", baseUrl: "https://llm.example/v1", model: "test", timeoutMs: 50 },
      fetchImpl: async () => new Response("not json", { status: 200 }),
    },
  );
  assert.equal(invalidJson.fallbackUsed, true);
  assert.equal(invalidJson.plannerStatus, "rule_fallback");

  for (const status of [403, 429, 502]) {
    const plan = await planSearchIntent(
      { topic: urbanHeatTopic, language: "zh-TW" },
      {
        llm: { apiKey: "test-key", baseUrl: "https://llm.example/v1", model: "test", timeoutMs: 50 },
        fetchImpl: async () => new Response(
          JSON.stringify({ error: { code: status === 429 ? "DAILY_LIMIT_EXCEEDED" : "FAILED" } }),
          { status },
        ),
      },
    );

    assert.equal(plan.fallbackUsed, true, `expected fallback for ${status}`);
    assert.equal(plan.plannerStatus, "rule_fallback");
    assert.ok(plan.reasoningNotes.some((note) => note.includes("Search intent planner fallback")));
  }
});

test("urban heat query generation prioritizes thermal and campus concepts over generic learning performance", () => {
  const plan = buildRuleBasedSearchIntent({ topic: urbanHeatTopic, language: "zh-TW" });
  const queries = buildSearchIntentQueries(plan);
  const english = queries.english.join(" ");

  for (const term of ["urban heat island", "campus", "thermal comfort", "microclimate", "school environment"]) {
    assert.match(english, new RegExp(term.replace(/\s+/g, "\\s+"), "i"));
  }

  assert.ok(!/students learning performance/i.test(english));
  assert.ok(!/education achievement/i.test(english));
  assert.ok(!/academic performance/i.test(english));
});

test("reranking promotes campus thermal comfort over generic student learning results", () => {
  const plan = buildRuleBasedSearchIntent({ topic: urbanHeatTopic, language: "zh-TW" });
  const sources = [
    sourceRecord({
      id: "generic-learning",
      title: "Student learning performance in secondary education",
      abstract: "This study examines academic performance and school satisfaction.",
    }),
    sourceRecord({
      id: "thermal-comfort",
      title: "Urban heat island effects on campus thermal comfort and microclimate",
      abstract: "Campus temperature, outdoor thermal comfort, and heat stress are measured in school environments.",
      doi: "10.1000/uhi-campus",
    }),
    sourceRecord({
      id: "school-satisfaction",
      title: "School satisfaction and student comfort",
      abstract: "A survey about students, learning, and school satisfaction without heat environment measurements.",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(sources, plan);
  assert.equal(ranked[0]?.id, "thermal-comfort");
  const genericDebug = relevanceDebug.find((item) => item.sourceId === "generic-learning");
  const schoolDebug = relevanceDebug.find((item) => item.sourceId === "school-satisfaction");
  assert.ok(genericDebug?.penalties.includes("missing_must_have_terms"));
  assert.ok(genericDebug?.penalties.includes("urban_heat_without_heat_or_thermal_terms"));
  assert.ok((schoolDebug?.score ?? 0) < (relevanceDebug[0]?.score ?? 0));
});

test("source intent search returns planner output and provider failures without crashing", async () => {
  const result = await searchIntentSources(
    { topic: urbanHeatTopic, reportType: "研究報告", audience: "高中", language: "zh-TW" },
    {
      llm: { apiKey: "" },
      queryLimit: 1,
      includeDebug: true,
      sourceSearch: {
        providerConfigs: {
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: { Accept: "application/json", "User-Agent": "ReportFactoryAI/Test" },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 1,
            headers: { Accept: "application/json", "User-Agent": "ReportFactoryAI/Test" },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("paper/search")) {
            return new Response(JSON.stringify({ message: "semantic failure" }), { status: 503 });
          }

          return new Response(JSON.stringify({
            message: {
              items: [
                {
                  title: ["Urban heat island effects on campus thermal comfort"],
                  abstract: "School campus microclimate, heat stress, and outdoor thermal comfort.",
                  issued: { "date-parts": [[2024]] },
                  DOI: "10.1000/uhi-campus",
                  URL: "https://doi.org/10.1000/uhi-campus",
                },
              ],
            },
          }));
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.searchIntent.fallbackUsed, true);
  assert.equal(result.searchIntent.plannerStatus, "skipped");
  assert.ok(result.searchIntent.primaryConcepts.includes("urban heat island"));
  assert.ok(result.queries.highPrecision.some((query) => query.includes("urban heat island")));
  assert.equal(result.provider_status.length, 2);
  assert.ok(result.provider_status.some((group) => group.ok === false));
  assert.equal(result.sources[0]?.doi, "10.1000/uhi-campus");
  assert.ok(result.warnings.some((warning) => warning.includes("部分來源提供者")));
});


test("legacy generic template detector removes old definition/scope style queries and backfills domain fallback", () => {
  const plan = sanitizeSearchIntentPlan(
    { topic: "吐司", language: "zh-TW" },
    {
      ...buildRuleBasedSearchIntent({ topic: "吐司", language: "zh-TW" }),
      chineseQueries: ["吐司 definition scope evidence", "吐司 measurable indicators"],
      englishQueries: ["toast case study dataset", "toast evidence research"],
    },
  );

  assert.equal(hasLegacyGenericTemplate("toast definition scope evidence", "吐司"), true);
  assert.deepEqual(removeLegacyGenericAngles(["toast definition scope evidence", "toast food composition"], "吐司"), {
    queries: ["toast food composition"],
    hits: ["toast definition scope evidence"],
  });
  assert.ok(plan.legacyTemplateHits?.length);
  assert.ok(plan.chineseQueries.every((query) => !/definition|scope|dataset|evidence/i.test(query)));
  assert.ok(plan.englishQueries.every((query) => !/definition|scope|dataset|evidence/i.test(query)));
  assert.ok(plan.chineseQueries.some((query) => /核心特性|結構與用途|材料與製程|使用情境/.test(query)));
});

test("unknown or noise topics skip provider queries entirely", async () => {
  let providerCalled = false;
  const result = await searchIntentSources(
    { topic: "xk29qzz", language: "zh-TW" },
    {
      fetchImpl: async () => {
        providerCalled = true;
        throw new Error("provider should not be called for noise topics");
      },
      sourceSearch: {
        fetchImpl: async () => {
          providerCalled = true;
          throw new Error("provider should not be called for noise topics");
        },
      },
    },
  );

  assert.equal(providerCalled, false);
  assert.equal(result.planner.topicKind, "unknown_or_noise");
  assert.equal(result.planner.domain, "unknown");
  assert.equal(result.planner.fallbackFamily, null);
  assert.deepEqual(result.queries.chinese, []);
  assert.deepEqual(result.queries.english, []);
  assert.deepEqual(result.keyword_expansion.search_queries, []);
  assert.deepEqual(result.provider_status, []);
});

test("topic profile inference classifies domain-level fallback families without topic-specific hardcode", () => {
  assert.deepEqual(inferSearchIntentTopicProfile("指南針的工作原理"), {
    topicKind: "descriptive_topic",
    domain: "mechanism",
    fallbackFamily: "mechanism",
    shouldSearchNow: true,
  });
  assert.deepEqual(inferSearchIntentTopicProfile("咖啡因對青少年睡眠的影響"), {
    topicKind: "descriptive_topic",
    domain: "health",
    fallbackFamily: "health",
    shouldSearchNow: true,
  });
  assert.deepEqual(inferSearchIntentTopicProfile("塑膠袋對海洋生態的影響"), {
    topicKind: "descriptive_topic",
    domain: "environment",
    fallbackFamily: "environment",
    shouldSearchNow: true,
  });
  assert.deepEqual(inferSearchIntentTopicProfile("AI輔助學習對高中生學習成效的影響"), {
    topicKind: "descriptive_topic",
    domain: "social",
    fallbackFamily: "social",
    shouldSearchNow: true,
  });
});
