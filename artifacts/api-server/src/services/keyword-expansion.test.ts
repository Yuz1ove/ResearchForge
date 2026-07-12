import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFallbackKeywordExpansion,
  expandSearchKeywords,
  searchKeywordSources,
} from "./keyword-expansion";

const shortVideoTopic = "短影音使用對高中生注意力與睡眠品質之影響";

test("deterministic fallback selects relevant domains for short-video student sleep topics", () => {
  const result = buildFallbackKeywordExpansion({
    topic: shortVideoTopic,
    reportType: "研究報告",
    audience: "高中",
    sourceMode: "自動搜尋",
    language: "zh-TW",
  });

  for (const domain of ["education", "psychology", "digital_media", "sleep_health", "student_wellbeing", "public_health"]) {
    assert.ok(result.domains.includes(domain), `expected ${domain}`);
  }
  assert.ok(!result.domains.includes("urban_studies"));
  assert.ok(!result.domains.includes("transportation"));
  assert.equal(result.fallback_used, true);
  assert.ok(["skipped", "failed"].includes(result.llm_status));
  assert.ok(result.english_queries.some((query) => query.includes("short-form video")));
  assert.ok(result.chinese_queries.some((query) => query.includes("短影音")));
});

test("falls back when LLM provider returns DAILY_LIMIT_EXCEEDED with 429", async () => {
  const result = await expandSearchKeywords(
    { topic: shortVideoTopic, reportType: "研究報告", audience: "高中", language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        timeoutMs: 50,
      },
      fetchImpl: async () => new Response(
        JSON.stringify({ error: { code: "DAILY_LIMIT_EXCEEDED", message: "Daily limit exceeded" } }),
        { status: 429 },
      ),
    },
  );

  assert.equal(result.fallback_used, true);
  assert.equal(result.llm_status, "quota_exceeded");
  assert.ok(result.reasoning_notes.some((note) => note.includes("provider-quota")));
  assert.ok(!result.domains.includes("transportation"));
});

test("falls back when LLM provider returns 403", async () => {
  const result = await expandSearchKeywords(
    { topic: shortVideoTopic, reportType: "研究報告", audience: "高中", language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        timeoutMs: 50,
      },
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
    },
  );

  assert.equal(result.fallback_used, true);
  assert.equal(result.llm_status, "quota_exceeded");
  assert.ok(result.reasoning_notes.some((note) => note.includes("provider-quota")));
  assert.ok(result.reasoning_notes.every((note) => !note.includes("sk-")));
});

test("falls back when LLM provider times out", async () => {
  const timeoutFetch = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  const result = await expandSearchKeywords(
    { topic: shortVideoTopic, reportType: "研究報告", audience: "高中", language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        timeoutMs: 5,
      },
      fetchImpl: timeoutFetch,
    },
  );

  assert.equal(result.fallback_used, true);
  assert.equal(result.llm_status, "timeout");
  assert.ok(result.reasoning_notes.some((note) => note.includes("provider-timeout")));
});

test("keyword source search returns grouped provider errors without crashing", async () => {
  const result = await searchKeywordSources(
    { topic: shortVideoTopic, reportType: "研究報告", audience: "高中", language: "zh-TW" },
    {
      llm: { apiKey: "" },
      queryLimit: 1,
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: { Accept: "application/json", "User-Agent": "ReportFactoryAI/Test" },
          },
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
        fetchImpl: async () => new Response(JSON.stringify({ message: "provider failed" }), { status: 503 }),
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.llm_status, "skipped");
  assert.equal(result.keyword_expansion.fallback_used, true);
  assert.equal(result.groups.length, 3);
  assert.ok(result.groups.every((group) => group.ok === false));
  assert.ok(result.groups.every((group) => group.error_type === "server_error"));
  assert.deepEqual(result.sources, []);
});
