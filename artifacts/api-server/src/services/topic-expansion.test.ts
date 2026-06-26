import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import type { TopicExpansionDomain } from "@workspace/api-zod/topic-expansion";
import {
  buildKeywordExpansion,
  candidateMergeAndRerank,
  candidateTopicGeneration,
  classifyEntityType,
  classifyInputKind,
  classifySecondaryDomains,
  classifyTopicDomain,
  expandTopicWithOllama,
  normalizeTopicExpansion,
} from "./topic-expansion";

function domains(...values: TopicExpansionDomain[]): TopicExpansionDomain[] {
  return values;
}

const validEggExpansion = {
  expandedTopic: "雞蛋的營養成分、蛋白質品質與必需胺基酸價值",
  researchQuestions: [
    "雞蛋的蛋白與蛋黃分別提供哪些主要營養成分？",
    "雞蛋蛋白質的必需胺基酸組成與生物價值為何？",
  ],
  searchKeywords: {
    zh: ["雞蛋", "營養成分", "蛋白質", "必需胺基酸", "蛋白", "蛋黃"],
    en: ["egg nutrition", "egg protein", "amino acid profile"],
    synonyms: ["全蛋", "蛋白", "蛋黃"],
    academic: ["protein digestibility", "biological value", "essential amino acids"],
  },
  sourceStrategy: ["營養資料庫", "食品科學論文", "公共衛生或飲食指南"],
  exclusions: ["籃球", "棒球", "排球", "氣候"],
};

const pollutedDonQuixoteExpansion = {
  expandedTopic: "唐吉柯德的營養成分與 omega-3 價值",
  researchQuestions: [
    "鱈魚的 DHA 與 EPA 含量為何？",
    "cod fish 的 seafood safety 風險有哪些？",
  ],
  searchKeywords: {
    zh: ["鱈魚", "營養", "魚油", "DHA", "EPA"],
    en: ["cod fish", "omega-3", "seafood safety"],
    synonyms: ["cod"],
    academic: ["fish protein", "fatty acid"],
  },
  sourceStrategy: ["食品科學論文", "海鮮安全資料"],
  exclusions: [],
};

const validAirplaneExpansion = {
  expandedTopic: "飛機的機械結構、航空運作與建造製造流程",
  researchQuestions: [
    "飛機的機翼、機身結構與升力控制原理",
    "飛機在民航、貨運與飛航安全中的運作機制",
    "飛機的設計、材料選擇與製造組裝流程",
  ],
  searchKeywords: {
    zh: ["飛機", "機翼", "機身", "民航", "製造", "組裝"],
    en: ["aircraft structure", "civil aviation operations", "airplane manufacturing"],
    synonyms: ["飛航器", "固定翼飛機"],
    academic: ["flight mechanics", "fleet operations", "composite materials"],
  },
  sourceStrategy: ["航太工程研究", "民航資料", "航太製造資料"],
  exclusions: ["玩具模型", "手機設定"],
};

function withEnv<T>(env: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  return run().finally(() => {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  });
}

function createOllamaFetchSequence(
  rawContents: string[],
): {
  fetchImpl: (input: string | URL, init?: RequestInit) => Promise<Response>;
  getChatCompletionCalls: () => number;
} {
  let chatCompletionCalls = 0;
  return {
    getChatCompletionCalls: () => chatCompletionCalls,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/tags")) {
        return new Response(JSON.stringify({ models: [{ name: "gemma4:e2b" }] }));
      }
      if (url.endsWith("/v1/chat/completions")) {
        const rawContent =
          rawContents[Math.min(chatCompletionCalls, rawContents.length - 1)] ?? rawContents[0] ?? "{}";
        chatCompletionCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: rawContent } }],
          }),
        );
      }
      return new Response("not found", { status: 404 });
    },
  };
}

function createOllamaFetch(rawContent: string): (input: string | URL, init?: RequestInit) => Promise<Response> {
  return createOllamaFetchSequence([rawContent]).fetchImpl;
}

function createUnavailableOllamaFetch(
  status = 500,
): (input: string | URL, init?: RequestInit) => Promise<Response> {
  return async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return new Response(JSON.stringify({ models: [{ name: "gemma4:e2b" }, { name: "qwen3:4b" }] }));
    }
    if (url.endsWith("/v1/chat/completions")) {
      return new Response("provider failed", { status });
    }
    return new Response("not found", { status: 404 });
  };
}

function baseEnv(): Record<string, string> {
  return {
    OLLAMA_BASE_URL: "http://127.0.0.1:11434",
    OLLAMA_MODEL: "gemma4:e2b",
    OLLAMA_TIMEOUT_MS: "60000",
  };
}

test("Ollama raw JSON success returns ok without fallback", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createOllamaFetch(JSON.stringify(validEggExpansion)) },
    );

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.provider_status, "ok");
    assert.equal(result.diagnostics.fallbackUsed, false);
    assert.equal(result.diagnostics.fallback_used, false);
    assert.equal(result.diagnostics.model, "gemma4:e2b");
    assert.equal(result.diagnostics.llm_status, "success");
    assert.equal(result.diagnostics.temperature, 0.2);
    assert.equal(result.diagnostics.cacheHit, false);
    assert.equal(result.generationMode, "llm_polished");
    assert.equal(result.inputKind, "complete_research_topic");
    assert.equal(result.topicDomain, "health_medical");
    assert.match(result.diagnostics.requestId ?? "", /^[0-9a-f-]{36}$/i);
    assert.match(result.diagnostics.generatedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(
      result.diagnostics.rawResponseHash,
      createHash("sha256")
        .update(JSON.stringify(validEggExpansion))
        .digest("hex"),
    );
    assert.match(result.expandedTopic, /雞蛋|蛋白質|胺基酸/);
  });
});

test("same topic re-expansion does not reuse cache and gets a new requestId", async () => {
  await withEnv(baseEnv(), async () => {
    const fetchImpl = createOllamaFetch(JSON.stringify(validEggExpansion));
    const first = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值", reportType: "研究報告", audience: "高中" },
      { fetchImpl },
    );
    const second = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值", reportType: "研究報告", audience: "高中" },
      { fetchImpl },
    );

    assert.equal(first.diagnostics.cacheHit, false);
    assert.equal(second.diagnostics.cacheHit, false);
    assert.notEqual(first.diagnostics.requestId, second.diagnostics.requestId);
    assert.equal(first.diagnostics.rawResponseHash, second.diagnostics.rawResponseHash);
  });
});

test("Ollama markdown JSON success extracts fenced JSON", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值" },
      { fetchImpl: createOllamaFetch(`\`\`\`json\n${JSON.stringify(validEggExpansion)}\n\`\`\``) },
    );

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.provider_status, "ok");
    assert.equal(result.diagnostics.fallbackUsed, false);
  });
});

test("Ollama extra text success extracts the first JSON object", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值" },
      { fetchImpl: createOllamaFetch(`以下是 JSON：\n${JSON.stringify(validEggExpansion)}\n完成。`) },
    );

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.provider_status, "ok");
    assert.equal(result.diagnostics.fallbackUsed, false);
  });
});

test("field normalization maps common aliases and fills missing keyword buckets", () => {
  const normalized = normalizeTopicExpansion({
    expandedTopic: "雞蛋營養",
    questions: ["雞蛋蛋白質價值為何？"],
    keywords: {
      zh: ["雞蛋"],
      en: ["egg protein"],
    },
    sourceStrategy: "營養資料庫",
    exclusions: "籃球",
  }) as {
    researchQuestions: string[];
    searchKeywords: { academic: string[] };
    sourceStrategy: string[];
    exclusions: string[];
  };

  assert.deepEqual(normalized.researchQuestions, ["雞蛋蛋白質價值為何？"]);
  assert.deepEqual(normalized.searchKeywords.academic, []);
  assert.deepEqual(normalized.sourceStrategy, ["營養資料庫"]);
  assert.deepEqual(normalized.exclusions, ["籃球"]);
});

test("invalid schema falls back to domain-aware expansion instead of fake template output", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值" },
      { fetchImpl: createOllamaFetch(JSON.stringify({ expandedTopic: "雞蛋營養" })) },
    );

    assert.equal(result.status, "success");
    assert.equal(result.generationMode, "title_fallback");
    assert.equal(result.diagnostics.provider_status, "schema_validation_failed");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.equal(result.fallbackReason, "LOCAL_LLM_JSON_PARSE_FAILED");
    assert.ok(result.directions?.length);
    assert.match(JSON.stringify(result), /營養|蛋白質|健康影響/);
  });
});

test("real egg topic expansion stays on nutrition terms when LLM succeeds", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createOllamaFetch(JSON.stringify(validEggExpansion)) },
    );
    const combined = JSON.stringify(result);

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.provider_status, "ok");
    assert.equal(result.diagnostics.fallbackUsed, false);
    assert.match(combined, /雞蛋|蛋白質|胺基酸|蛋白|蛋黃/);
    assert.doesNotMatch(result.expandedTopic, /籃球|棒球|排球|氣候|basketball|baseball|volleyball|climate/i);
  });
});

test("airplane topic expansion stays grounded in mechanics, aviation, and construction", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "飛機", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createOllamaFetch(JSON.stringify(validAirplaneExpansion)) },
    );
    const combined = JSON.stringify(result);

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.provider_status, "ok");
    assert.equal(result.diagnostics.fallbackUsed, false);
    assert.equal(result.diagnostics.canonicalEnglishTopic, "airplane");
    assert.equal(result.diagnostics.domain, "technology");
    assert.match(combined, /機翼|機身|民航|飛航安全|製造|組裝/);
    assert.doesNotMatch(combined, /背景與重要性|現況分析|主要面向/i);
  });
});

test("Don Quixote topic expansion rejects cod-fish drift and falls back to humanities directions", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "唐吉柯德", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createOllamaFetch(JSON.stringify(pollutedDonQuixoteExpansion)) },
    );
    assert.equal(result.status, "success");
    assert.equal(result.generationMode, "title_fallback");
    assert.equal(result.diagnostics.provider_status, "schema_validation_failed");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.ok(
      result.diagnostics.validationIssues?.some((message) =>
        /drift_terms_detected|canonical_topic_terms_missing/i.test(message),
      ),
    );
    const visibleContent = JSON.stringify({
      expandedTopic: result.expandedTopic,
      researchQuestions: result.researchQuestions,
      directions: result.directions,
    });
    assert.match(visibleContent, /歷史|文本|文化|詮釋|傳播/);
    assert.doesNotMatch(visibleContent, /鱈魚|DHA|EPA|cod fish|seafood safety/i);
  });
});

test("noise input returns invalid_input without fake expansion", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "hoeo2f2", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createOllamaFetch(JSON.stringify({ expandedTopic: "hoeo2f2" })) },
    );

    assert.equal(result.status, "invalid_input");
    assert.equal(result.diagnostics.provider_status, "invalid_input");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.equal(result.diagnostics.canonicalEnglishTopic, "");
    assert.deepEqual(result.diagnostics.searchQueries?.en ?? [], []);
    assert.equal(result.expandedTopic, "");
    assert.deepEqual(result.researchQuestions, []);
  });
});

test("ascii gibberish topic is rejected by local LLM validity check before fake expansion", async () => {
  await withEnv(baseEnv(), async () => {
    const fetchStub = createOllamaFetchSequence([
      JSON.stringify({
        isValidTopic: false,
        reason: "輸入看起來像無意義字串，缺乏可研究的明確對象。",
      }),
      JSON.stringify(validEggExpansion),
    ]);
    const result = await expandTopicWithOllama(
      { topic: "cowcocb", reportType: "研究報告", audience: "高中" },
      { fetchImpl: fetchStub.fetchImpl },
    );

    assert.equal(result.status, "invalid_input");
    assert.equal(result.diagnostics.provider_status, "invalid_input");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.ok(result.message);
    assert.match(result.message, /無法辨識有效研究主題|無意義字串/);
    assert.deepEqual(result.researchQuestions, []);
    assert.equal(fetchStub.getChatCompletionCalls(), 0);
  });
});

test("known topics fall back to domain-aware expansion when LLM is unavailable", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "飛機", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    const combined = JSON.stringify(result);

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.equal(result.generationMode, "title_fallback");
    assert.match(result.message ?? "", /快速回傳標題候選|規則式標題候選/i);
    assert.match(combined, /機翼|機身|民航|飛航安全|材料|製造|組裝/);
  });
});

test("spinning top fallback stays domain-specific instead of returning generic template angles", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "陀螺", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    const combined = JSON.stringify(result);

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.equal(result.diagnostics.canonicalEnglishTopic, "spinning top");
    assert.equal(result.diagnostics.domain, "technology");
    assert.ok(result.diagnostics.searchQueries?.en.some((query) => /gyroscope|spinning top/i.test(query)));
    assert.equal(result.generationMode, "title_fallback");
    assert.match(result.message ?? "", /快速回傳標題候選|規則式標題候選/i);
    assert.match(combined, /角動量|進動|陀螺儀|MEMS|民俗遊戲|spinning top|gyroscope/i);
    assert.doesNotMatch(combined, /核心概念、範圍界線與可驗證資料|可用哪些指標、案例或資料集交叉驗證/);
  });
});

test("rare valid Chinese topics expose canonical English diagnostics and bilingual queries", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "觸變性", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    const combined = JSON.stringify(result);

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.canonicalEnglishTopic, "thixotropy");
    assert.equal(result.diagnostics.domain, "materials_design");
    assert.ok(result.diagnostics.coreConcepts?.some((concept) => /thixotropy/i.test(concept)));
    assert.ok(result.diagnostics.searchQueries?.en.some((query) => /thixotropy/i.test(query)));
    assert.match(combined, /流變|剪切|流變儀|塗料|膠體|3D列印漿料/i);
    assert.doesNotMatch(combined, /核心概念、範圍界線與可驗證資料|可用哪些指標、案例或資料集交叉驗證/);
  });
});

test("classifyInputKind detects keyword phrase research topic broad and gibberish", () => {
  assert.equal(classifyInputKind("水母", understandTopic("水母")), "single_keyword");
  assert.equal(classifyInputKind("手機成癮", understandTopic("手機成癮")), "short_phrase");
  assert.equal(
    classifyInputKind(
      "水母大量繁殖對海洋生態與漁業的影響",
      understandTopic("水母大量繁殖對海洋生態與漁業的影響"),
    ),
    "complete_research_topic",
  );
  assert.equal(classifyInputKind("AI", understandTopic("AI")), "too_broad");
  assert.equal(classifyInputKind("hoeo2f2", understandTopic("hoeo2f2")), "gibberish");
});

test("classifyTopicDomain and secondary domains map representative topics", () => {
  const ant = understandTopic("螞蟻");
  assert.equal(classifyEntityType("螞蟻", ant, "single_keyword"), "animal");
  assert.equal(classifyTopicDomain("螞蟻", ant, "single_keyword"), "biology_ecology");
  const jellyfish = understandTopic("水母");
  assert.equal(classifyTopicDomain("水母", jellyfish, "single_keyword"), "biology_ecology");
  const turtle = understandTopic("烏龜");
  assert.equal(classifyTopicDomain("烏龜", turtle, "single_keyword"), "biology_ecology");
  const cheetah = understandTopic("獵豹");
  assert.equal(classifyTopicDomain("獵豹", cheetah, "single_keyword"), "biology_ecology");
  const toast = understandTopic("吐司");
  assert.equal(classifyEntityType("吐司", toast, "single_keyword"), "food");
  assert.equal(classifyTopicDomain("吐司", toast, "single_keyword"), "health_medical");
  const ions = understandTopic("負離子");
  assert.equal(classifyEntityType("負離子", ions, "single_keyword"), "scientific_concept");
  assert.match(
    classifyTopicDomain("負離子", ions, "single_keyword"),
    /natural_science|concept_feature/,
  );
  const smartphone = understandTopic("手機成癮");
  assert.equal(classifyEntityType("手機成癮", smartphone, "short_phrase"), "social_issue");
  assert.equal(
    classifyTopicDomain("手機成癮", smartphone, "short_phrase"),
    "education_psychology",
  );
  assert.deepEqual(
    classifySecondaryDomains("手機成癮", smartphone, "education_psychology"),
    ["health_medical"],
  );
  const climate = understandTopic("氣候變遷");
  assert.equal(classifyEntityType("氣候變遷", climate, "short_phrase"), "social_issue");
  assert.equal(
    classifyTopicDomain("氣候變遷", climate, "short_phrase"),
    "social_policy",
  );
  assert.deepEqual(
    classifySecondaryDomains("氣候變遷", climate, "social_policy"),
    ["natural_science"],
  );
});

test("keyword expansion includes domain-specific bilingual terms", () => {
  const jellyfishContext = {
    understood: understandTopic("水母"),
    inputKind: "single_keyword" as const,
    topicDomain: "biology_ecology" as const,
    entityType: "animal" as const,
    secondaryDomains: domains("health_medical"),
    englishTopic: "jellyfish",
  };
  const jellyfish = buildKeywordExpansion(jellyfishContext);
  assert.ok(jellyfish.coreTermsEn.includes("jellyfish"));
  assert.ok(jellyfish.relatedTermsEn.includes("jellyfish bloom"));
  assert.ok(jellyfish.relatedTermsZh.includes("海洋生態"));
  assert.ok(jellyfish.relatedTermsZh.includes("螫傷"));

  const ionsContext = {
    understood: understandTopic("負離子"),
    inputKind: "single_keyword" as const,
    topicDomain: "natural_science" as const,
    entityType: "scientific_concept" as const,
    secondaryDomains: domains("concept_feature"),
    englishTopic: "negative ions",
  };
  const ions = buildKeywordExpansion(ionsContext);
  assert.ok(ions.coreTermsEn.includes("negative ions"));
  assert.ok(ions.relatedTermsEn.includes("air quality"));
  assert.ok(ions.relatedTermsEn.includes("health claims"));

  const smartphoneContext = {
    understood: understandTopic("手機成癮"),
    inputKind: "short_phrase" as const,
    topicDomain: "education_psychology" as const,
    entityType: "social_issue" as const,
    secondaryDomains: domains("health_medical"),
    englishTopic: "smartphone addiction",
  };
  const smartphone = buildKeywordExpansion(smartphoneContext);
  assert.ok(smartphone.relatedTermsEn.includes("sleep quality"));
  assert.ok(smartphone.relatedTermsEn.includes("attention"));
  assert.ok(smartphone.relatedTermsEn.includes("social media"));
});

test("candidate rerank keeps diverse non-generic directions with full query plans", () => {
  const context = {
    understood: understandTopic("水母"),
    inputKind: "single_keyword" as const,
    topicDomain: "biology_ecology" as const,
    entityType: "animal" as const,
    secondaryDomains: domains("health_medical"),
    englishTopic: "jellyfish",
  };
  const keywordExpansion = buildKeywordExpansion(context);
  const candidates = candidateTopicGeneration(context, keywordExpansion);
  const ranked = candidateMergeAndRerank(candidates, context, keywordExpansion);

  assert.ok(candidates.length > ranked.length);
  assert.ok(ranked.length >= 3);
  assert.equal(new Set(ranked.map((item) => item.diversityKey)).size, ranked.length);
  const serialized = JSON.stringify(ranked);
  assert.doesNotMatch(serialized, /背景脈絡、主要類型與核心特徵|形成過程、使用方式與應用情境|爭議、限制與後續發展趨勢|核心概念、範圍界線與可驗證資料/);
  for (const item of ranked) {
    assert.ok(item.queryPlan.primaryQueriesZh.length >= 3);
    assert.ok(item.queryPlan.primaryQueriesEn.length >= 3);
    assert.ok(item.excludeTerms.length >= 3);
  }
});

test("entityType lens guard keeps animal and food topics away from scientific definition fallback", async () => {
  await withEnv(baseEnv(), async () => {
    const ant = await expandTopicWithOllama(
      { topic: "螞蟻", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.equal(ant.status, "success");
    assert.equal(ant.entityType, "animal");
    assert.equal(ant.topicDomain, "biology_ecology");
    assert.ok(
      ant.diagnostics.selectedLensIds?.some((lensId: string) =>
        ["behavior_adaptation", "ecology_role", "invasive_management", "mechanism_process"].includes(
          lensId,
        ),
      ),
    );
    assert.ok(ant.diagnostics.rejectedLensIds?.includes("definition_measurement"));
    assert.ok(ant.diagnostics.rejectedLensIds?.includes("health_claims"));
    assert.doesNotMatch(
      JSON.stringify(ant.directions ?? []),
      /科學定義與量測方法|健康宣稱或常見迷思|形成機制、應用場景與限制條件/,
    );

    const toast = await expandTopicWithOllama(
      { topic: "吐司", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.equal(toast.status, "success");
    assert.equal(toast.entityType, "food");
    assert.equal(toast.topicDomain, "health_medical");
    assert.ok(toast.diagnostics.rejectedLensIds?.includes("definition_measurement"));
    assert.doesNotMatch(
      JSON.stringify(toast.directions ?? []),
      /科學定義與量測方法|健康宣稱或常見迷思/,
    );

    const ions = await expandTopicWithOllama(
      { topic: "負離子", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.equal(ions.status, "success");
    assert.equal(ions.entityType, "scientific_concept");
    assert.equal(ions.topicDomain, "natural_science");
    assert.ok(
      ions.diagnostics.selectedLensIds?.includes("definition_measurement"),
    );
    assert.ok(
      ions.directions?.some((direction) => /如何定義與觀察|核心指標與量測設計/.test(direction.title)),
    );
  });
});

test("title enhancement fallback returns 3-5 visible title candidates without legacy template text", async () => {
  await withEnv(baseEnv(), async () => {
    const ant = await expandTopicWithOllama(
      { topic: "螞蟻", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.equal(ant.generationMode, "title_fallback");
    assert.ok((ant.titleCandidates?.length ?? 0) >= 3);
    assert.ok((ant.titleCandidates?.length ?? 0) <= 5);
    assert.match(ant.titleCandidates?.[0]?.title ?? "", /螞蟻|秩序|生態/);
    assert.ok(ant.hiddenResearchPlan);
    assert.ok((ant.hiddenResearchPlan?.querySeedZh.length ?? 0) >= 1);

    const bubble = await expandTopicWithOllama(
      { topic: "泡泡實驗", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.ok((bubble.titleCandidates?.length ?? 0) >= 3);
    assert.match(
      JSON.stringify(bubble.titleCandidates ?? []),
      /泡泡實驗|泡泡|原理|觀察|科學/,
    );

    const redox = await expandTopicWithOllama(
      { topic: "氧化還原反應", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.ok((redox.titleCandidates?.length ?? 0) >= 3);
    assert.match(
      JSON.stringify(redox.titleCandidates ?? []),
      /氧化還原反應|原理|應用|科學解釋/,
    );

    const visibleTitles = JSON.stringify([
      ...(ant.titleCandidates ?? []).map((candidate) => candidate.title),
      ...(bubble.titleCandidates ?? []).map((candidate) => candidate.title),
      ...(redox.titleCandidates ?? []).map((candidate) => candidate.title),
    ]);
    assert.doesNotMatch(
      visibleTitles,
      /科學定義與量測方法|形成機制、應用場景與限制條件|背景脈絡、主要類型與核心特徵|爭議、限制與後續發展趨勢/,
    );
  });
});

test("expandTopic integration smoke covers hybrid planner topics", async () => {
  await withEnv(baseEnv(), async () => {
    const topics = [
      {
        topic: "螞蟻",
        domain: "biology_ecology",
        inputKind: "single_keyword",
        entityType: "animal",
      },
      { topic: "水母", domain: "biology_ecology", inputKind: "single_keyword", entityType: "animal" },
      { topic: "烏龜", domain: "biology_ecology", inputKind: "single_keyword", entityType: "animal" },
      { topic: "獵豹", domain: "biology_ecology", inputKind: "single_keyword", entityType: "animal" },
      {
        topic: "吐司",
        domain: "health_medical",
        inputKind: "single_keyword",
        entityType: "food",
      },
      { topic: "負離子", domain: "natural_science", inputKind: "single_keyword", entityType: "scientific_concept" },
      {
        topic: "手機成癮",
        domain: "education_psychology",
        inputKind: "short_phrase",
        entityType: "social_issue",
      },
      {
        topic: "氣候變遷",
        domain: "social_policy",
        inputKind: "short_phrase",
        entityType: "social_issue",
      },
      { topic: "水餃", domain: "health_medical", inputKind: "single_keyword", entityType: "food" },
      { topic: "可樂", domain: "health_medical", inputKind: "single_keyword", entityType: "food" },
    ] as const;

    for (const sample of topics) {
      const result = await expandTopicWithOllama(
        { topic: sample.topic, reportType: "研究報告", audience: "高中" },
        { fetchImpl: createUnavailableOllamaFetch() },
      );

      assert.equal(result.status, "success");
      assert.equal(result.inputKind, sample.inputKind);
      assert.equal(result.topicDomain, sample.domain);
      assert.equal(result.entityType, sample.entityType);
      assert.equal(result.generationMode, "title_fallback");
      assert.ok((result.candidateCount ?? 0) > (result.directions?.length ?? 0));
      assert.ok(result.keywordExpansion);
      assert.ok((result.directions?.length ?? 0) >= 3);
      assert.ok((result.titleCandidates?.length ?? 0) >= 3);
      for (const direction of result.directions ?? []) {
        assert.ok(direction.researchQuestion);
        assert.ok(direction.queryZh.length >= 3);
        assert.ok(direction.queryEn.length >= 3);
        assert.ok(direction.expectedEvidence.length >= 1);
        assert.ok(direction.evidenceNeed.length >= 1);
      }
    }

    const gibberish = await expandTopicWithOllama(
      { topic: "hoeo2f2", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    assert.equal(gibberish.status, "invalid_input");
    assert.equal(gibberish.inputKind, "gibberish");
    assert.equal(gibberish.candidateCount, 0);
    assert.deepEqual(gibberish.directions, []);
  });
});
