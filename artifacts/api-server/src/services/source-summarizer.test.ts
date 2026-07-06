import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import { summarizeSourcesWithLlm } from "./source-summarizer";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "French fries nutrition and sodium content",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "French fries are a common fast-food potato product. Nutrition studies discuss sodium, fat, calories, and frying-related food safety concerns.",
    doi: "10.1000/fries",
    url: "https://doi.org/10.1000/fries",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    relevanceLevel: "secondary",
    ...overrides,
  };
}

test("source summarizer attaches Traditional Chinese LLM summaries to relevant sources", async () => {
  const result = await summarizeSourcesWithLlm(
    "薯條",
    [source()],
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        assert.equal(request.model, "test-model");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summaries: [
                      {
                        id: "source-1",
                        summaryZhTw:
                          "此來源可用來說明薯條的營養成分、鈉含量與油炸食品安全風險，適合作為初步報告的延伸來源。",
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        );
      },
    },
  );

  assert.equal(result[0]?.llmSummaryStatus, "success");
  assert.equal(result[0]?.summaryStructuredStatus, "success");
  assert.match(result[0]?.llmSummaryZhTw ?? "", /薯條的營養成分/);
  assert.match(result[0]?.readableSummaryZhTW ?? "", /薯條的營養成分/);
  assert.equal(result[0]?.summarySourceType, "abstract");
  assert.equal(result[0]?.summaryConfidence, "high");
});

test("source summarizer preserves sources and marks timeout fallback", async () => {
  const result = await summarizeSourcesWithLlm(
    "薯條",
    [source()],
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
        timeoutMs: 5,
      },
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    },
  );

  assert.equal(result[0]?.title, "French fries nutrition and sodium content");
  assert.equal(result[0]?.llmSummaryStatus, "timeout");
  assert.equal(result[0]?.summaryStructuredStatus, "unavailable");
  assert.match(result[0]?.llmSummaryZhTw ?? "", /薯條|French fries/);
  assert.equal(result[0]?.summaryFallbackUsed, true);
  assert.match(result[0]?.readableSummaryZhTW ?? "", /目前研究主題|薯條/);
});

test("source summarizer timeout fallback rewrites aircraft summaries into natural Chinese", async () => {
  const result = await summarizeSourcesWithLlm(
    "飛機",
    [
      source({
        title:
          "A Runway Overrun Risk Assessment Model for Civil Aircraft Based on Quick Access Recorder Data",
        abstract:
          "In this paper, we propose a new dynamic runway overrun risk assessment model based on QAR data for civil aircraft safety.",
      }),
    ],
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
        timeoutMs: 5,
      },
      fetchImpl: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    },
  );

  assert.equal(result[0]?.llmSummaryStatus, "timeout");
  assert.equal(result[0]?.summaryFallbackUsed, true);
  assert.match(result[0]?.llmSummaryZhTw ?? "", /跑道衝出|風險評估|飛機|飛航安全/);
  assert.match(result[0]?.readableSummaryZhTW ?? "", /飛機|跑道衝出|風險評估/);
  assert.doesNotMatch(
    result[0]?.llmSummaryZhTw ?? "",
    /In this paper|civil aircraft|QAR data|aircraft/i,
  );
});

test("source summarizer preserves sources and marks failed fallback on empty model content", async () => {
  const result = await summarizeSourcesWithLlm(
    "薯條",
    [source()],
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
          }),
        ),
    },
  );

  assert.equal(result[0]?.title, "French fries nutrition and sodium content");
  assert.equal(result[0]?.llmSummaryStatus, "failed");
  assert.equal(result[0]?.summaryStructuredStatus, "error");
  assert.match(result[0]?.llmSummaryZhTw ?? "", /French fries|nutrition|薯條/);
  assert.equal(result[0]?.summaryFallbackUsed, true);
});

test("source summarizer keeps zh-TW fallback summaries visible instead of notice-only text", async () => {
  const result = await summarizeSourcesWithLlm(
    "皂化反應",
    [
      source({
        title:
          "Study in Kinetics of Saponification Reaction of Diethyl Adipate with Sodium Hydroxide Solution under Reactive Distillation",
        abstract:
          "This study investigates the kinetics of saponification reaction of diethyl adipate with sodium hydroxide solution under reactive distillation.",
      }),
    ],
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("network unavailable");
      },
    },
  );

  assert.equal(result[0]?.summaryFallbackUsed, true);
  assert.doesNotMatch(result[0]?.readableSummaryZhTW ?? "", /尚未完成繁中摘要/);
  assert.match(result[0]?.readableSummaryZhTW ?? "", /主旨：|摘要重點：|皂化反應/);
});

test("source summarizer processes sources in smaller LLM batches", async () => {
  let callCount = 0;
  const sources = Array.from({ length: 5 }, (_, index) =>
    source({
      id: `source-${index + 1}`,
      title: `Example source ${index + 1}`,
      abstract: `Example abstract ${index + 1} with enough detail for summarization and evidence extraction in batch mode.`,
      doi: `10.1000/batch-${index + 1}`,
      url: `https://doi.org/10.1000/batch-${index + 1}`,
    }),
  );

  const result = await summarizeSourcesWithLlm("批次測試", sources, {
    llm: {
      baseUrl: "https://llm.example/v1",
      model: "test-model",
      apiKey: "test-key",
    },
    fetchImpl: async (_input, init) => {
      callCount += 1;
      const request = JSON.parse(String(init?.body));
      const body = String(request.messages?.[1]?.content ?? "");
      const ids = Array.from(body.matchAll(/id:\s(source-\d+)/g), (match) => match[1]);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summaries: ids.map((id) => ({
                    id,
                    summaryZhTw: `這是 ${id} 的批次摘要，可用於驗證分批摘要流程。`,
                  })),
                }),
              },
            },
          ],
        }),
      );
    },
  });

  assert.equal(callCount, 2);
  assert.equal(result.filter((item) => item.llmSummaryStatus === "success").length, 5);
  assert.match(result[4]?.llmSummaryZhTw ?? "", /source-5/);
});

test("source summarizer writes deterministic fallback summaries for metadata-only sources", async () => {
  const result = await summarizeSourcesWithLlm(
    "飛機",
    [
      source({
        title: "Civil aircraft safety overview",
        abstract: "Short note.",
        snippet: null,
        doi: null,
        url: null,
      }),
    ],
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    },
  );

  assert.equal(result[0]?.llmSummaryStatus, "metadata-only");
  assert.equal(result[0]?.summaryStructuredStatus, "insufficient_sources");
  assert.match(result[0]?.llmSummaryZhTw ?? "", /飛機|aircraft/);
  assert.equal(result[0]?.summarySourceType, "metadataFallback");
  assert.equal(result[0]?.summaryConfidence, "low");
  assert.match(result[0]?.readableSummaryZhTW ?? "", /目前|標題|來源資訊|不足以支持深入引用/);
});
