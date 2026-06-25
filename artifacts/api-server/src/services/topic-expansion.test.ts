import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { expandTopicWithOllama, normalizeTopicExpansion } from "./topic-expansion";

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
    assert.equal(result.diagnostics.temperature, 0);
    assert.equal(result.diagnostics.cacheHit, false);
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

test("invalid schema returns explicit error instead of fake expansion", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "雞蛋的營養成分與蛋白質價值" },
      { fetchImpl: createOllamaFetch(JSON.stringify({ expandedTopic: "雞蛋營養" })) },
    );

    assert.equal(result.status, "error");
    assert.equal(result.diagnostics.provider_status, "schema_validation_failed");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.ok(result.diagnostics.validationErrors?.some((message) => message.includes("researchQuestions")));
    assert.equal(result.expandedTopic, "");
    assert.deepEqual(result.researchQuestions, []);
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

test("Don Quixote topic expansion rejects cod-fish drift without inventing fallback content", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "唐吉柯德", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createOllamaFetch(JSON.stringify(pollutedDonQuixoteExpansion)) },
    );
    assert.equal(result.status, "error");
    assert.equal(result.diagnostics.provider_status, "schema_validation_failed");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.ok(
      result.diagnostics.validationIssues?.some((message) =>
        /drift_terms_detected|canonical_topic_terms_missing/i.test(message),
      ),
    );
    assert.equal(result.expandedTopic, "");
    assert.deepEqual(result.searchKeywords.zh, []);
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
    assert.match(result.message, /查無足夠研究方向|無意義字串/);
    assert.deepEqual(result.researchQuestions, []);
    assert.equal(fetchStub.getChatCompletionCalls(), 0);
  });
});

test("known topics fall back to taxonomy-grounded expansion when LLM is unavailable", async () => {
  await withEnv(baseEnv(), async () => {
    const result = await expandTopicWithOllama(
      { topic: "飛機", reportType: "研究報告", audience: "高中" },
      { fetchImpl: createUnavailableOllamaFetch() },
    );
    const combined = JSON.stringify(result);

    assert.equal(result.status, "success");
    assert.equal(result.diagnostics.fallbackUsed, true);
    assert.match(result.message ?? "", /taxonomy fallback/i);
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
    assert.match(result.message ?? "", /taxonomy fallback/i);
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
