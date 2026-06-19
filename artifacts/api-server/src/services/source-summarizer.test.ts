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
  assert.match(result[0]?.llmSummaryZhTw ?? "", /薯條的營養成分/);
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
  assert.equal(result[0]?.llmSummaryZhTw, undefined);
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
  assert.equal(result[0]?.llmSummaryZhTw, undefined);
});
