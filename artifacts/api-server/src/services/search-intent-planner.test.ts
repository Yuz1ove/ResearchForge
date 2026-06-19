import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import {
  buildRuleBasedSearchIntent,
  buildSearchIntentQueries,
  planSearchIntent,
  rerankSourcesBySearchIntent,
  searchIntentSources,
} from "./search-intent-planner";

const shortVideoTopic = "短影音使用對高中生注意力與睡眠品質之影響";
const urbanHeatTopic = "都市熱島效應對校園環境與學生學習舒適度之影響";
const dumplingTopic = "水餃";
const friesTopic = "薯條";
const colaPlainTopic = "可樂";
const colaHealthTopic = "可樂中的成分與攝取習慣對健康的影響";
const llmWritingTopic = "大型語言模型對英文寫作學習的影響";
const climateCausesTopic = "「氣候變遷」的成因與現況分析";
const spiderEcologyTopic = "蜘蛛的棲地需求與生存策略";
const spiderHabitatTopic = "蜘蛛與其棲地相關研究";

function sourceRecord(
  patch: Partial<SourceRecord> & { title: string },
): SourceRecord {
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

  for (const concept of [
    "short-form video",
    "social media",
    "digital media use",
    "sleep quality",
    "attention",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  assert.ok(
    plan.englishQueries.some((query) => query.includes("short-form video")),
  );
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
  const allQueries = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ];

  for (const concept of [
    "cola",
    "soft drink",
    "sugar-sweetened beverage",
    "含糖飲料",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["sugar", "caffeine", "health"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.outcomeConcepts.includes("咖啡因"));
  assert.ok(plan.penaltyTerms.includes("成人高考"));
  assert.ok(
    allQueries.some((query) => /cola|soft drink|sugar-sweetened/i.test(query)),
  );
  assert.ok(
    !allQueries.some((query) =>
      /education students peer reviewed research/i.test(query),
    ),
    "generic education query should not be generated",
  );
});

test("rule fallback turns LLM English writing learning into education and writing queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: llmWritingTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");

  assert.equal(plan.topicType, "ai_language_learning");
  assert.match(queryText, /large language models English writing learning/i);
  assert.match(queryText, /LLM education English writing feedback/i);
  assert.match(queryText, /generative AI second language writing/i);
  assert.match(queryText, /大型語言模型 英文寫作學習/);
  assert.ok(plan.penaltyTerms.includes("software engineering"));
  assert.ok(!/大型語言模型對英文寫作學習的影響 peer reviewed research/i.test(queryText));
});

test("rule fallback turns dumpling into a research-ready query planner without climate drift", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: dumplingTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");
  const questionText = (plan.narrowedResearchQuestions ?? [])
    .map((question) =>
      [
        question.title,
        question.researchAngle,
        question.zhKeywords.join(" "),
        question.enKeywords.join(" "),
        question.primaryQueries.join(" "),
      ].join(" "),
    )
    .join("\n");

  assert.equal(plan.topicType, "food_nutrition_and_culture");
  for (const term of ["水餃", "餃子", "冷凍水餃"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected ${term}`);
  }
  assert.ok(plan.mustHaveTerms.includes("sodium"));
  assert.ok(plan.mustHaveTerms.includes("食品標示"));
  assert.match(questionText, /鈉含量|營養標示|食品標示/);
  assert.match(questionText, /dumpling|frozen dumpling/i);
  assert.ok(!/生活連結|資料策略/.test(questionText));
  assert.ok(!/climate change|carbon dioxide|greenhouse gas/i.test(queryText));
});

test("rule fallback turns french fries into nutrition and food-safety search plans", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: friesTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");
  const questionText = (plan.narrowedResearchQuestions ?? [])
    .map((question) =>
      [
        question.title,
        question.researchAngle,
        question.zhKeywords.join(" "),
        question.enKeywords.join(" "),
        question.primaryQueries.join(" "),
      ].join(" "),
    )
    .join("\n");

  assert.equal(plan.topicType, "food_nutrition_and_safety");
  for (const term of ["薯條", "炸薯條", "french fries"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected ${term}`);
  }
  assert.ok(plan.mustHaveTerms.includes("acrylamide"));
  assert.ok(plan.mustHaveTerms.includes("丙烯醯胺"));
  assert.match(questionText, /營養成分|鈉含量|食品安全|飲食習慣/);
  assert.match(questionText, /french fries|fast food|acrylamide/i);
  assert.ok(!/academic research evidence|computer chip|semiconductor/i.test(queryText));
});

test("rule fallback turns plain cola into concrete research queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: colaPlainTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const text = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...(plan.narrowedResearchQuestions ?? []).flatMap((question) => [
      question.title,
      question.zhKeywords.join(" "),
      question.enKeywords.join(" "),
      question.primaryQueries.join(" "),
    ]),
  ].join(" ");

  assert.equal(plan.topicType, "beverage_health_and_consumption");
  for (const term of ["可樂", "含糖飲料", "糖分", "咖啡因"]) {
    assert.ok(text.includes(term), `expected ${term}`);
  }
  assert.match(text, /cola|soft drink|sugar intake|diet cola/i);
  assert.match(text, /青少年健康|成分比較|包裝|廣告/);
  assert.ok(!/\bcoal\b|coke fuel/i.test(queries.english.join(" ")));
});

test("rule fallback keeps climate change cause concepts in every main query family", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: climateCausesTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
  ].join(" ");

  for (const concept of [
    "climate change",
    "global warming",
    "greenhouse gas",
    "溫室氣體",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["fossil fuel", "化石燃料", "emissions", "排放"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.contextConcepts.includes("land use"));
  assert.ok(plan.outcomeConcepts.includes("observed warming"));
  assert.ok(plan.mustHaveTerms.includes("CO2 concentration"));
  assert.ok(plan.penaltyTerms.includes("北京話"));
  assert.match(queryText, /climate change|氣候變遷/);
  assert.match(queryText, /greenhouse gas|溫室氣體/);
  assert.match(queryText, /fossil fuel|化石燃料/);
  assert.match(queryText, /observed warming|CO2 concentration|IPCC/);
  assert.ok(!/education students peer reviewed research/i.test(queryText));
});

test("rule fallback keeps spider ecology queries anchored to spider, habitat, and survival", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spiderEcologyTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
  ].join(" ");

  for (const concept of ["spider", "arachnid", "蜘蛛", "habitat", "ecology"]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["spider", "habitat", "棲地", "生態"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.outcomeConcepts.includes("survival strategies"));
  assert.ok(plan.contextConcepts.includes("habitat selection"));
  assert.ok(plan.penaltyTerms.includes("國家安全教育"));
  assert.match(queryText, /spider|蜘蛛/);
  assert.match(queryText, /habitat|棲地/);
  assert.match(queryText, /survival|生存|ecology|生態/);
  assert.ok(
    !/高中教育|education students peer reviewed research/i.test(queryText),
  );
});

test("rule fallback expands broad spider habitat topics into multiple English academic queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spiderHabitatTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const allQueries = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ];

  for (const query of [
    "spider habitat",
    "spider ecology",
    "spider habitat selection",
  ]) {
    assert.ok(allQueries.some((item) => item.includes(query)), `expected ${query}`);
  }
  for (const term of ["spider", "arachnid", "蜘蛛"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected subject ${term}`);
  }
  for (const term of ["habitat", "ecology", "棲地"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected concept ${term}`);
  }
  for (const drift of ["圖書館推廣", "招生策略", "教育策略"]) {
    assert.ok(plan.penaltyTerms.includes(drift), `expected drift term ${drift}`);
  }
});

test("rule fallback weights urban heat island, thermal comfort, and microclimate over generic learning terms", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });

  for (const concept of [
    "urban heat island",
    "thermal comfort",
    "microclimate",
    "heat stress",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const context of [
    "campus",
    "school environment",
    "educational buildings",
    "schoolyard",
  ]) {
    assert.ok(plan.contextConcepts.includes(context), `expected ${context}`);
  }
  for (const term of ["students", "learning", "education"]) {
    assert.ok(
      plan.lowWeightTerms.includes(term),
      `expected low-weight ${term}`,
    );
  }
  for (const term of [
    "heat",
    "thermal",
    "temperature",
    "microclimate",
    "urban heat island",
    "UHI",
  ]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
});

test("LLM planner falls back on provider failure, invalid JSON, and quota-style HTTP responses", async () => {
  const invalidJson = await planSearchIntent(
    { topic: urbanHeatTopic, language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test",
        timeoutMs: 50,
      },
      fetchImpl: async () => new Response("not json", { status: 200 }),
    },
  );
  assert.equal(invalidJson.fallbackUsed, true);
  assert.equal(invalidJson.plannerStatus, "rule_fallback");

  for (const status of [403, 429, 502]) {
    const plan = await planSearchIntent(
      { topic: urbanHeatTopic, language: "zh-TW" },
      {
        llm: {
          apiKey: "test-key",
          baseUrl: "https://llm.example/v1",
          model: "test",
          timeoutMs: 50,
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: status === 429 ? "DAILY_LIMIT_EXCEEDED" : "FAILED",
              },
            }),
            { status },
          ),
      },
    );

    assert.equal(plan.fallbackUsed, true, `expected fallback for ${status}`);
    assert.equal(plan.plannerStatus, "rule_fallback");
    assert.ok(
      plan.reasoningNotes.some((note) =>
        note.includes("Search intent planner fallback"),
      ),
    );
  }
});

test("LLM planner falls back on empty model message content", async () => {
  const plan = await planSearchIntent(
    { topic: friesTopic, language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test",
        timeoutMs: 50,
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(plan.fallbackUsed, true);
  assert.equal(plan.plannerStatus, "rule_fallback");
  assert.equal(plan.topicType, "food_nutrition_and_safety");
  assert.ok(
    plan.englishQueries.some((query) => /french fries/i.test(query)),
  );
});

test("urban heat query generation prioritizes thermal and campus concepts over generic learning performance", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const english = queries.english.join(" ");

  for (const term of [
    "urban heat island",
    "campus",
    "thermal comfort",
    "microclimate",
    "school environment",
  ]) {
    assert.match(english, new RegExp(term.replace(/\s+/g, "\\s+"), "i"));
  }

  assert.ok(!/students learning performance/i.test(english));
  assert.ok(!/education achievement/i.test(english));
  assert.ok(!/academic performance/i.test(english));
});

test("reranking promotes campus thermal comfort over generic student learning results", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    language: "zh-TW",
  });
  const sources = [
    sourceRecord({
      id: "generic-learning",
      title: "Student learning performance in secondary education",
      abstract:
        "This study examines academic performance and school satisfaction.",
    }),
    sourceRecord({
      id: "thermal-comfort",
      title:
        "Urban heat island effects on campus thermal comfort and microclimate",
      abstract:
        "Campus temperature, outdoor thermal comfort, and heat stress are measured in school environments.",
      doi: "10.1000/uhi-campus",
    }),
    sourceRecord({
      id: "school-satisfaction",
      title: "School satisfaction and student comfort",
      abstract:
        "A survey about students, learning, and school satisfaction without heat environment measurements.",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(
    sources,
    plan,
  );
  assert.equal(ranked[0]?.id, "thermal-comfort");
  const genericDebug = relevanceDebug.find(
    (item) => item.sourceId === "generic-learning",
  );
  const schoolDebug = relevanceDebug.find(
    (item) => item.sourceId === "school-satisfaction",
  );
  assert.ok(genericDebug?.penalties.includes("missing_must_have_terms"));
  assert.ok(
    genericDebug?.penalties.includes(
      "urban_heat_without_heat_or_thermal_terms",
    ),
  );
  assert.ok((schoolDebug?.score ?? 0) < (relevanceDebug[0]?.score ?? 0));
});

test("climate reranking promotes direct evidence snippets over metadata-only climate matches", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: climateCausesTopic,
    language: "zh-TW",
  });
  const sources = [
    sourceRecord({
      id: "metadata-title",
      title:
        "Climate change causes greenhouse gas emissions and observed warming",
      abstract: null,
      doi: "10.1000/metadata-title",
    }),
    sourceRecord({
      id: "policy-committee",
      title: "Climate change policy committee governance",
      abstract:
        "This article discusses climate change policy, committee governance, and institutional response functions without emissions or observed climate indicator evidence.",
    }),
    sourceRecord({
      id: "direct-evidence",
      title:
        "Observed climate change and anthropogenic greenhouse gas emissions",
      abstract:
        "Human activities, principally through greenhouse gas emissions from fossil fuel combustion, have caused global warming. Observed warming is reflected in global temperature trends and CO2 concentration.",
      doi: "10.1000/direct-climate",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(
    sources,
    plan,
  );
  const metadataDebug = relevanceDebug.find(
    (item) => item.sourceId === "metadata-title",
  );
  const directDebug = relevanceDebug.find(
    (item) => item.sourceId === "direct-evidence",
  );

  assert.equal(ranked[0]?.id, "direct-evidence");
  assert.ok(metadataDebug?.penalties.includes("metadata_only"));
  assert.ok(metadataDebug?.penalties.includes("no_direct_evidence_snippet"));
  assert.ok(!directDebug?.penalties.includes("no_direct_evidence_snippet"));
});

test("dumpling relevance gate rejects trusted climate sources as off topic", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: dumplingTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "ipcc-climate",
        title: "AR6 Synthesis Report: Climate Change 2023",
        abstract:
          "Greenhouse gas emissions, global warming, carbon dioxide concentrations, and global temperature changes are assessed by the IPCC.",
        doi: "10.1000/ipcc-climate",
        url: "https://www.ipcc.ch/report/ar6/syr/",
        publisher: "IPCC",
      }),
    ],
    plan,
  );
  const source = sources[0];

  assert.ok(source);
  assert.ok((source.relevanceScore ?? 100) < 30);
  assert.equal(source.classification, "trusted_but_off_topic");
  assert.equal(source.rejectReason, "trusted_source_but_topic_mismatch");
  assert.equal(source.shouldShowInMainList, false);
  assert.equal(source.shouldRecommendAccept, false);
  assert.equal(source.reviewState, "rejected");
});

test("dumpling relevance gate keeps relevant nutrition and labeling sources", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: dumplingTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "dumpling-sodium",
        title: "Sodium content and nutrition labeling of frozen dumplings",
        abstract:
          "This study compares frozen dumpling nutrition facts, sodium content, calories, protein, fat, and food labeling information for commercially available dumplings and jiaozi products.",
        doi: "10.1000/dumpling-sodium",
        url: "https://doi.org/10.1000/dumpling-sodium",
        publisher: "Journal of Food Nutrition",
      }),
    ],
    plan,
  );
  const source = sources[0];

  assert.ok(source);
  assert.ok((source.relevanceScore ?? 0) >= 30);
  assert.ok(source.classification === "primary" || source.classification === "review");
  assert.notEqual(source.reviewState, "rejected");
  assert.ok(source.matchedTerms?.some((term) => /dumpling|sodium|nutrition/i.test(term)));
});

test("secondary candidates stay reviewable instead of being rejected", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: friesTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "fries-secondary",
        title: "Fast food intake and adolescent dietary habits",
        abstract:
          "Fast food consumption among adolescents is associated with dietary habits, sodium intake, calories, fat, and restaurant meal patterns. French fries are discussed as a common side item in fast-food meals.",
        doi: "10.1000/fries-secondary",
        url: "https://doi.org/10.1000/fries-secondary",
        publisher: "Journal of Public Health Nutrition",
      }),
    ],
    plan,
  );
  const source = sources[0];

  assert.ok(source);
  assert.notEqual(source.relevanceLevel, "off_topic");
  assert.notEqual(source.classification, "off_topic");
  assert.notEqual(source.reviewState, "rejected");
  assert.equal(source.shouldShowInMainList, true);
  assert.equal(source.shouldRecommendAccept, true);
});

test("spider reranking rejects generic strategy papers that miss the spider subject", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spiderEcologyTopic,
    language: "zh-TW",
  });
  const sources = [
    sourceRecord({
      id: "national-security",
      title: "高中地理教學中國家安全教育存在問題及改進策略研究",
      abstract: "本文探討國家安全教育與教學策略。",
    }),
    sourceRecord({
      id: "library-video",
      title: "民辦本科院校圖書館圖書推介視頻的現狀與優化策略",
      abstract: "本文分析圖書館推介與閱讀推廣策略。",
    }),
    sourceRecord({
      id: "spider-habitat",
      title: "Spider habitat selection and microhabitat ecology",
      abstract:
        "This study examines spider habitat selection, microhabitat conditions, predation behavior, and survival adaptation in ecological communities.",
      doi: "10.1000/spider-habitat",
    }),
    sourceRecord({
      id: "spider-monkey",
      title: "Spider monkeys: behavior, ecology and evolution of the genus Ateles",
      abstract:
        "This book reviews spider monkey behavior, ecology, habitat use, and primate evolution in Ateles.",
      doi: "10.1000/spider-monkey",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(
    sources,
    plan,
  );
  assert.equal(ranked[0]?.id, "spider-habitat");
  assert.equal(ranked[0]?.relevanceLevel, "primary");
  assert.equal(ranked[0]?.shouldShowInMainList, true);
  assert.equal(
    ranked.find((source) => source.id === "spider-monkey")?.relevanceLevel,
    "off_topic",
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "national-security")
      ?.penalties.includes("missing_must_have_terms"),
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "spider-monkey")
      ?.penalties.some((penalty) => penalty.startsWith("non_spider_taxon")),
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "library-video")
      ?.penalties.some(
        (penalty) =>
          penalty.startsWith("penalty_terms") ||
          penalty.startsWith("spider_drift_terms"),
      ),
  );
});

test("source intent search labels primary candidates before building low-source warnings", async () => {
  const result = await searchIntentSources(
    {
      topic: spiderHabitatTopic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 1,
      includeDebug: true,
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(
              JSON.stringify({
                results: [
                  {
                    id: "https://openalex.org/W1",
                    display_name:
                      "Spider habitat selection and microhabitat ecology",
                    publication_year: 2024,
                    doi: "https://doi.org/10.1000/spider-habitat",
                    abstract_inverted_index: {
                      Spider: [0],
                      habitat: [1],
                      selection: [2],
                      and: [3],
                      microhabitat: [4],
                      ecology: [5],
                      explain: [6],
                      survival: [7],
                      adaptation: [8],
                      predation: [10],
                      behavior: [11],
                      in: [12],
                      ecological: [13],
                      communities: [14],
                    },
                    authorships: [{ author: { display_name: "A. Researcher" } }],
                    primary_location: {
                      source: { display_name: "Journal of Arachnology" },
                    },
                  },
                ],
              }),
            );
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({ message: "semantic quota" }),
              { status: 429 },
            );
          }

          return new Response(
            JSON.stringify({
              message: {
                items: [
                  {
                    title: [
                      "Spider monkeys: behavior, ecology and evolution of the genus Ateles",
                    ],
                    abstract:
                      "Spider monkey ecology and habitat behavior in primate populations.",
                    issued: { "date-parts": [[2020]] },
                    DOI: "10.1000/spider-monkey",
                    URL: "https://doi.org/10.1000/spider-monkey",
                  },
                ],
              },
            }),
          );
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.ok(result.sources.some((source) => source.relevanceLevel === "primary"));
  assert.ok(
    result.sources.some(
      (source) =>
        source.title.includes("Spider monkeys") &&
        source.relevanceLevel === "off_topic",
    ),
  );
  assert.ok(
    !result.warnings.some((warning) => warning.includes("已找到 0 筆主要來源")),
  );
});

test("source intent search returns planner output and provider failures without crashing", async () => {
  const result = await searchIntentSources(
    {
      topic: urbanHeatTopic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 1,
      includeDebug: true,
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(JSON.stringify({ results: [] }));
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({ message: "semantic failure" }),
              { status: 503 },
            );
          }

          return new Response(
            JSON.stringify({
              message: {
                items: [
                  {
                    title: [
                      "Urban heat island effects on campus thermal comfort",
                    ],
                    abstract:
                      "School campus microclimate, heat stress, and outdoor thermal comfort.",
                    issued: { "date-parts": [[2024]] },
                    DOI: "10.1000/uhi-campus",
                    URL: "https://doi.org/10.1000/uhi-campus",
                  },
                ],
              },
            }),
          );
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.searchIntent.fallbackUsed, true);
  assert.equal(result.searchIntent.plannerStatus, "skipped");
  assert.ok(result.searchIntent.primaryConcepts.includes("urban heat island"));
  assert.ok(
    result.queries.highPrecision.some((query) =>
      query.includes("urban heat island"),
    ),
  );
  assert.equal(result.provider_status.length, 3);
  assert.ok(result.provider_status.some((group) => group.ok === false));
  assert.equal(result.sources[0]?.doi, "10.1000/uhi-campus");
  assert.match(result.workflowId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.topicHash.length > 0, true);
  assert.equal(result.queryPlanHash.length > 0, true);
  assert.equal(result.searchTrace.workflowId, result.workflowId);
  assert.ok(result.searchTrace.providerQueries.every((query) => query.includes("urban heat") || query.includes("thermal") || query.includes("campus") || query.includes("熱")));
  assert.ok(result.sources.every((source) => source.workflowId === result.workflowId));
  assert.ok(
    result.warnings.some((warning) => warning.includes("部分來源提供者")),
  );
});
