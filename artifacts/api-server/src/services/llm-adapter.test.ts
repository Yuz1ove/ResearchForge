import assert from "node:assert/strict";
import test from "node:test";
import {
  LlmAdapterError,
  extractFirstJsonObject,
  extractModelText,
  requestOpenAICompatibleChatCompletion,
  resolveLlmConfig,
  safeJsonParse,
} from "./llm-adapter";

test("resolveLlmConfig prefers LLM env over OLLAMA env and normalizes local Ollama /v1", () => {
  const config = resolveLlmConfig(
    "planner",
    {},
    {
      LLM_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_BASE_URL: "http://ollama.example:11434",
      LLM_MODEL: "qwen3:4b",
      OLLAMA_MODEL: "llama3",
    },
  );

  assert.equal(config.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.model, "qwen3:4b");
  assert.equal(config.timeoutMs, 60_000);
  assert.equal(config.disabled, false);
});

test("resolveLlmConfig falls back to OLLAMA env and supports explicit disable", () => {
  const config = resolveLlmConfig(
    "report_writer",
    { apiKey: "" },
    {
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "qwen3:4b",
      OLLAMA_TIMEOUT_MS: "60000",
    },
  );

  assert.equal(config.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.model, "qwen3:4b");
  assert.equal(config.timeoutMs, 60_000);
  assert.equal(config.disabled, true);
});

test("safeJsonParse accepts fenced JSON and extracts JSON objects from model chatter", () => {
  assert.deepEqual(safeJsonParse("```json\n{\"ok\":true}\n```"), { ok: true });
  assert.deepEqual(safeJsonParse("thinking...\n{\"ok\":true}\nthanks"), { ok: true });
});

test("extractFirstJsonObject returns the first balanced object and ignores trailing chatter", () => {
  assert.equal(
    extractFirstJsonObject("intro {\"ok\":true,\"nested\":{\"text\":\"brace } in string\"}} outro {\"later\":true}"),
    "{\"ok\":true,\"nested\":{\"text\":\"brace } in string\"}}",
  );
});

test("extractModelText reads common OpenAI and Ollama-compatible response fields", () => {
  assert.equal(
    extractModelText({ choices: [{ message: { content: "  from choices  " } }] }),
    "from choices",
  );
  assert.equal(extractModelText({ response: "  from response  " }), "from response");
  assert.equal(extractModelText({ content: "  from content  " }), "from content");
  assert.equal(extractModelText({ text: "  from text  " }), "from text");
  assert.equal(
    extractModelText({
      message: {
        content: [{ type: "text", text: "from content parts" }],
      },
    }),
    "from content parts",
  );
  assert.equal(
    extractModelText({
      choices: [
        {
          message: {
            content: "",
            reasoning:
              "I should answer with JSON only. Final: {\"isValidTopic\":false,\"reason\":\"nonsense\"}",
          },
        },
      ],
    }),
    "{\"isValidTopic\":false,\"reason\":\"nonsense\"}",
  );
});

test("requestOpenAICompatibleChatCompletion can recover JSON from reasoning when content is empty", async () => {
  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "planner",
    messages: [{ role: "user", content: "{\"topic\":\"薯條\"}" }],
    llm: {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3:4b",
      timeoutMs: 1_000,
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "",
                reasoning:
                  "分析後回覆如下：{\"expandedTopic\":\"薯條\",\"researchQuestions\":[\"薯條的油炸方式如何影響口感？\"],\"searchKeywords\":{\"zh\":[\"薯條\"],\"en\":[\"french fries\"],\"synonyms\":[],\"academic\":[]},\"sourceStrategy\":[\"食品研究\"],\"exclusions\":[]}",
              },
            },
          ],
        }),
      ),
  });

  assert.match(content, /"expandedTopic":"薯條"/);
});

test("requestOpenAICompatibleChatCompletion still fails when reasoning contains no JSON object", async () => {
  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "planner",
      messages: [{ role: "user", content: "{\"topic\":\"薯條\"}" }],
      llm: {
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen3:4b",
        timeoutMs: 1_000,
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  reasoning: "模型仍在思考，但沒有產生可用 JSON。",
                },
              },
            ],
          }),
        ),
    }),
    (error) =>
      error instanceof LlmAdapterError &&
      error.code === "invalid-json" &&
      /message content/.test(error.message),
  );
});

test("requestOpenAICompatibleChatCompletion can read Ollama response field when present", async () => {
  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "summarizer",
    messages: [{ role: "user", content: "{\"topic\":\"水餃\"}" }],
    llm: {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3:4b",
      timeoutMs: 1_000,
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: "```json\n{\"ok\":true}\n```",
        }),
      ),
  });

  assert.deepEqual(safeJsonParse(content), { ok: true });
});

test("requestOpenAICompatibleChatCompletion disables qwen3 reasoning on local Ollama-compatible endpoint", async () => {
  let capturedBody: Record<string, unknown> | null = null;

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "planner",
    messages: [
      { role: "system", content: "Return JSON." },
      { role: "user", content: "{\"topic\":\"薯條\"}" },
    ],
    responseFormat: "json_object",
    llm: {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3:4b",
      timeoutMs: 1_000,
    },
    fetchImpl: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }),
      );
    },
  });

  assert.equal(content, "{\"ok\":true}");
  const requestBody = capturedBody as Record<string, unknown> | null;
  assert.ok(requestBody);
  assert.equal(requestBody.think, false);
  assert.equal("response_format" in requestBody, false);
  const messages = requestBody.messages as Array<{ role: string; content: string }>;
  assert.match(messages.find((message) => message.role === "user")?.content ?? "", /^\/no_think\n/);
});

test("requestOpenAICompatibleChatCompletion keeps JSON mode for non-local OpenAI-compatible providers", async () => {
  let capturedBody: Record<string, unknown> | null = null;

  await requestOpenAICompatibleChatCompletion({
    purpose: "summarizer",
    messages: [
      { role: "system", content: "Return JSON." },
      { role: "user", content: "{\"topic\":\"可樂\"}" },
    ],
    responseFormat: "json_object",
    llm: {
      baseUrl: "https://llm.example/v1",
      model: "gpt-compatible",
      apiKey: "test-key",
      timeoutMs: 1_000,
    },
    fetchImpl: async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }),
      );
    },
  });

  const requestBody = capturedBody as Record<string, unknown> | null;
  assert.ok(requestBody);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal("think" in requestBody, false);
});
