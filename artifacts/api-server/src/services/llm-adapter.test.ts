import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  LlmAdapterError,
  extractFirstJsonObject,
  extractModelText,
  requestOpenAICompatibleChatCompletion,
  resolveOpenAiModelAlias,
  resolveLlmConfig,
  safeJsonParse,
} from "./llm-adapter";
import { readSchoolUsageLog } from "./llm/schoolProvider";

async function listenTestServer(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function closeTestServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

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

test("resolveOpenAiModelAlias normalizes GPT-5.4 aliases", () => {
  assert.equal(resolveOpenAiModelAlias("chatgpt5.4"), "gpt-5.4");
  assert.equal(resolveOpenAiModelAlias("chatgpt-5.4"), "gpt-5.4");
  assert.equal(resolveOpenAiModelAlias("GPT-5.4"), "gpt-5.4");
  assert.equal(resolveOpenAiModelAlias("gpt5.4"), "gpt-5.4");
  assert.equal(resolveOpenAiModelAlias(""), "gpt-5.4");
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

test("resolveLlmConfig selects native Ollama when explicitly requested despite empty remote provider vars", () => {
  const config = resolveLlmConfig(
    "section_writer",
    {},
    {
      LLM_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1/",
      OLLAMA_MODEL: "cached-qwen-model",
      SCHOOL_LLM_API_KEY: "",
      SCHOOL_LLM_BASE_URL: "",
      SCHOOL_LLM_MODEL: "",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
      OPENAI_MODEL: "",
    },
  );

  assert.equal(config.baseUrl, "http://127.0.0.1:11434");
  assert.equal(config.model, "cached-qwen-model");
  assert.equal(config.apiKey, undefined);
  assert.equal(config.providerKind, "ollama");
  assert.equal(config.providerName, "ollama");
  assert.equal(config.disabled, false);
});

test("resolveLlmConfig prefers complete school LLM env on the backend", () => {
  const config = resolveLlmConfig(
    "planner",
    {},
    {
      SCHOOL_LLM_PROVIDER: "campus",
      SCHOOL_LLM_BASE_URL: "https://school.example/v1",
      SCHOOL_LLM_API_KEY: "school-test-token",
      SCHOOL_LLM_MODEL: "school-model",
      LLM_BASE_URL: "http://127.0.0.1:11434",
      LLM_MODEL: "qwen3:4b",
    },
  );

  assert.equal(config.baseUrl, "https://school.example/v1");
  assert.equal(config.apiKey, "school-test-token");
  assert.equal(config.model, "school-model");
  assert.equal(config.providerKind, "school");
  assert.equal(config.disabled, false);
});

test("school LLM config without API key is disabled without exposing a secret", async () => {
  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "planner",
      messages: [{ role: "user", content: '{"topic":"AI"}' }],
      env: {
        SCHOOL_LLM_PROVIDER: "campus",
        SCHOOL_LLM_BASE_URL: "https://school.example/v1",
        SCHOOL_LLM_MODEL: "school-model",
      },
      fetchImpl: async () => {
        throw new Error("fetch should not be called");
      },
    }),
    (error) =>
      error instanceof LlmAdapterError &&
      error.code === "provider-unconfigured" &&
      /SCHOOL_LLM_API_KEY/.test(error.message) &&
      !/school-test-token/.test(error.message),
  );
});

test("safeJsonParse accepts fenced JSON and extracts JSON objects from model chatter", () => {
  assert.deepEqual(safeJsonParse('```json\n{"ok":true}\n```'), { ok: true });
  assert.deepEqual(safeJsonParse('thinking...\n{"ok":true}\nthanks'), {
    ok: true,
  });
});

test("extractFirstJsonObject returns the first balanced object and ignores trailing chatter", () => {
  assert.equal(
    extractFirstJsonObject(
      'intro {"ok":true,"nested":{"text":"brace } in string"}} outro {"later":true}',
    ),
    '{"ok":true,"nested":{"text":"brace } in string"}}',
  );
});

test("extractModelText reads common OpenAI and Ollama-compatible response fields", () => {
  assert.equal(
    extractModelText({
      choices: [{ message: { content: "  from choices  " } }],
    }),
    "from choices",
  );
  assert.equal(
    extractModelText({ response: "  from response  " }),
    "from response",
  );
  assert.equal(
    extractModelText({ content: "  from content  " }),
    "from content",
  );
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
              'I should answer with JSON only. Final: {"isValidTopic":false,"reason":"nonsense"}',
          },
        },
      ],
    }),
    '{"isValidTopic":false,"reason":"nonsense"}',
  );
  for (const payload of [
    {
      choices: [
        {
          message: {
            content: "",
            reasoning_content: 'private analysis {"ok":"message"}',
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            content: "",
            reasoning_content: 'private analysis {"ok":"delta"}',
          },
        },
      ],
    },
    {
      choices: [
        {
          content: "",
          reasoning_content: 'private analysis {"ok":"choice"}',
        },
      ],
    },
  ]) {
    assert.match(
      extractModelText(payload),
      /^\{"ok":"(?:message|delta|choice)"\}$/u,
    );
  }
});

test("requestOpenAICompatibleChatCompletion can recover JSON from reasoning when content is empty", async () => {
  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "planner",
    messages: [{ role: "user", content: '{"topic":"薯條"}' }],
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
                  '分析後回覆如下：{"expandedTopic":"薯條","researchQuestions":["薯條的油炸方式如何影響口感？"],"searchKeywords":{"zh":["薯條"],"en":["french fries"],"synonyms":[],"academic":[]},"sourceStrategy":["食品研究"],"exclusions":[]}',
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
      messages: [{ role: "user", content: '{"topic":"薯條"}' }],
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
      error.code === "provider-empty-output" &&
      /message content/.test(error.message),
  );
});

test("provider HTTP failures distinguish auth, quota, and rate limiting", async () => {
  const expected = [
    { status: 401, body: { error: "invalid api key" }, code: "provider-auth" },
    { status: 403, body: { error: "insufficient_quota: billing limit reached" }, code: "provider-quota" },
    { status: 429, body: { error: "too many requests" }, code: "provider-rate-limit" },
  ] as const;
  for (const item of expected) {
    await assert.rejects(
      requestOpenAICompatibleChatCompletion({
        purpose: "report_writer",
        messages: [{ role: "user", content: "Return JSON." }],
        llm: { baseUrl: "https://llm.example/v1", model: "test-model", apiKey: "test-key" },
        fetchImpl: async () => new Response(JSON.stringify(item.body), { status: item.status }),
      }),
      (error) => error instanceof LlmAdapterError && error.code === item.code,
    );
  }
});

test("empty length-limited completion is classified without exposing response text", async () => {
  const privateReasoning = "PRIVATE_REASONING_MUST_NOT_LEAK";
  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "report_writer",
      featureName: "empty-length-limited-completion-test",
      messages: [{ role: "user", content: "Return JSON." }],
      maxTokens: 400,
      env: {
        SCHOOL_LLM_PROVIDER: "campus",
        SCHOOL_LLM_BASE_URL: "https://school.example/v1",
        SCHOOL_LLM_API_KEY: "school-secret-token",
        SCHOOL_LLM_MODEL: "school-model",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "length",
                message: {
                  content: null,
                  reasoning_content: privateReasoning,
                },
              },
            ],
            usage: {
              completion_tokens: 400,
              completion_tokens_details: { reasoning_tokens: 400 },
            },
          }),
        ),
    }),
    (error) =>
      error instanceof LlmAdapterError &&
      error.code === "output-budget-exhausted" &&
      /PROVIDER_VISIBLE_OUTPUT_STARVATION/.test(error.message) &&
      /finishReasons=length/.test(error.message) &&
      /completionTokens=400/.test(error.message) &&
      /reasoningTokens=400/.test(error.message) &&
      /visibleOutputTokens=0/.test(error.message) &&
      (error.cause as { providerVisibleOutputStarvation?: boolean })
        ?.providerVisibleOutputStarvation === true &&
      !error.message.includes(privateReasoning) &&
      !error.message.includes("school-secret-token"),
  );
});

test("reasoning token exhaustion is classified even without a length finish reason", async () => {
  const privateReasoning = "SECOND_PRIVATE_REASONING_MUST_NOT_LEAK";
  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "report_writer",
      featureName: "reasoning-token-exhaustion-test",
      messages: [{ role: "user", content: "Return JSON." }],
      maxTokens: 400,
      env: {
        SCHOOL_LLM_PROVIDER: "campus",
        SCHOOL_LLM_BASE_URL: "https://school.example/v1",
        SCHOOL_LLM_API_KEY: "school-secret-token",
        SCHOOL_LLM_MODEL: "school-model",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: "provider-private-finish-reason",
                message: {
                  content: "",
                  reasoning_content: privateReasoning,
                },
              },
            ],
            usage: {
              output_tokens: 400,
              output_tokens_details: { reasoning_tokens: 400 },
            },
          }),
        ),
    }),
    (error) =>
      error instanceof LlmAdapterError &&
      error.code === "output-budget-exhausted" &&
      /PROVIDER_VISIBLE_OUTPUT_STARVATION/.test(error.message) &&
      /finishReasons=other/.test(error.message) &&
      /completionTokens=400/.test(error.message) &&
      /reasoningTokens=400/.test(error.message) &&
      /visibleOutputTokens=0/.test(error.message) &&
      !error.message.includes(privateReasoning) &&
      !error.message.includes("provider-private-finish-reason"),
  );
});

test("requestOpenAICompatibleChatCompletion can read Ollama response field when present", async () => {
  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "summarizer",
    messages: [{ role: "user", content: '{"topic":"水餃"}' }],
    llm: {
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3:4b",
      timeoutMs: 1_000,
    },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          response: '```json\n{"ok":true}\n```',
        }),
      ),
  });

  assert.deepEqual(safeJsonParse(content), { ok: true });
});

test("requestOpenAICompatibleChatCompletion uses native Ollama chat schema and response", async () => {
  let capturedUrl = "";
  let capturedAuthorization: string | null = "unexpected";
  let capturedBody: Record<string, unknown> | null = null;

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "report_writer",
    messages: [
      { role: "system", content: "Return JSON." },
      { role: "user", content: '{"topic":"sleep"}' },
    ],
    temperature: 0.2,
    maxTokens: 2_400,
    responseFormat: "json_object",
    env: {
      LLM_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      OLLAMA_MODEL: "cached-qwen-model",
      OLLAMA_NUM_CTX: "8192",
      SCHOOL_LLM_API_KEY: "",
      SCHOOL_LLM_BASE_URL: "",
      OPENAI_API_KEY: "",
      OPENAI_BASE_URL: "",
    },
    fetchImpl: async (input, init) => {
      capturedUrl = input.toString();
      capturedAuthorization = new Headers(init?.headers).get("Authorization");
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          model: "cached-qwen-model",
          message: { role: "assistant", content: '{"ok":true}' },
          done: true,
        }),
      );
    },
  });

  assert.equal(content, '{"ok":true}');
  assert.equal(capturedUrl, "http://127.0.0.1:11434/api/chat");
  assert.equal(capturedAuthorization, null);
  const requestBody = capturedBody as Record<string, unknown> | null;
  assert.ok(requestBody);
  assert.equal(requestBody.model, "cached-qwen-model");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.think, false);
  assert.equal(requestBody.format, "json");
  assert.deepEqual(requestBody.options, {
    temperature: 0.2,
    num_predict: 2_400,
    num_ctx: 8_192,
  });
  assert.deepEqual(requestBody.messages, [
    { role: "system", content: "Return JSON." },
    { role: "user", content: '{"topic":"sleep"}' },
  ]);
  assert.equal("max_tokens" in requestBody, false);
  assert.equal("response_format" in requestBody, false);
});

test("default native Ollama transport uses Node HTTP and preserves delayed JSON response", async () => {
  let requestPath = "";
  let requestBody = "";
  const server = createServer((request, response) => {
    requestPath = request.url ?? "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      requestBody += chunk;
    });
    request.on("end", () => {
      setTimeout(() => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            message: { role: "assistant", content: "native transport" },
            done: true,
          }),
        );
      }, 20);
    });
  });
  const baseUrl = await listenTestServer(server);

  try {
    const content = await requestOpenAICompatibleChatCompletion({
      purpose: "report_writer",
      messages: [{ role: "user", content: "Write." }],
      maxTokens: 32,
      env: {
        LLM_PROVIDER: "ollama",
        OLLAMA_BASE_URL: baseUrl,
        OLLAMA_MODEL: "cached-qwen-model",
        REPORT_WRITER_LLM_TIMEOUT_MS: "1000",
      },
    });

    assert.equal(content, "native transport");
    assert.equal(requestPath, "/api/chat");
    const parsedBody = JSON.parse(requestBody) as Record<string, unknown>;
    assert.equal(parsedBody.stream, false);
    assert.equal(parsedBody.think, false);
  } finally {
    await closeTestServer(server);
  }
});

test("default native Ollama transport is stopped by the configured AbortController deadline", async () => {
  const server = createServer(() => {
    // Intentionally withhold response headers until the adapter aborts.
  });
  const baseUrl = await listenTestServer(server);

  try {
    await assert.rejects(
      requestOpenAICompatibleChatCompletion({
        purpose: "planner",
        messages: [{ role: "user", content: "Wait." }],
        env: {
          LLM_PROVIDER: "ollama",
          OLLAMA_BASE_URL: baseUrl,
          OLLAMA_MODEL: "cached-qwen-model",
          PLANNER_LLM_TIMEOUT_MS: "50",
        },
      }),
      (error) =>
        error instanceof LlmAdapterError && error.code === "provider-timeout",
    );
  } finally {
    await closeTestServer(server);
  }
});

test("requestOpenAICompatibleChatCompletion disables qwen3 reasoning on local Ollama-compatible endpoint", async () => {
  let capturedBody: Record<string, unknown> | null = null;

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "planner",
    messages: [
      { role: "system", content: "Return JSON." },
      { role: "user", content: '{"topic":"薯條"}' },
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
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      );
    },
  });

  assert.equal(content, '{"ok":true}');
  const requestBody = capturedBody as Record<string, unknown> | null;
  assert.ok(requestBody);
  assert.equal(requestBody.think, false);
  assert.equal("response_format" in requestBody, false);
  const messages = requestBody.messages as Array<{
    role: string;
    content: string;
  }>;
  assert.match(
    messages.find((message) => message.role === "user")?.content ?? "",
    /^\/no_think\n/,
  );
});

test("requestOpenAICompatibleChatCompletion keeps JSON mode for non-local OpenAI-compatible providers", async () => {
  let capturedBody: Record<string, unknown> | null = null;

  await requestOpenAICompatibleChatCompletion({
    purpose: "summarizer",
    messages: [
      { role: "system", content: "Return JSON." },
      { role: "user", content: '{"topic":"可樂"}' },
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
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      );
    },
  });

  const requestBody = capturedBody as Record<string, unknown> | null;
  assert.ok(requestBody);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal("think" in requestBody, false);
});

test("requestOpenAICompatibleChatCompletion sends school key only in Authorization header", async () => {
  let capturedAuthorization: string | null = null;
  let capturedBody = "";

  await requestOpenAICompatibleChatCompletion({
    purpose: "summarizer",
    featureName: "source_readable_summary",
    messages: [{ role: "user", content: '{"topic":"水餃"}' }],
    responseFormat: "json_object",
    env: {
      SCHOOL_LLM_PROVIDER: "campus",
      SCHOOL_LLM_BASE_URL: "https://school.example/v1",
      SCHOOL_LLM_API_KEY: "school-secret-token",
      SCHOOL_LLM_MODEL: "school-model",
    },
    fetchImpl: async (_input, init) => {
      capturedAuthorization = new Headers(init?.headers).get("Authorization");
      capturedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      );
    },
  });

  assert.equal(capturedAuthorization, "Bearer school-secret-token");
  assert.equal(capturedBody.includes("school-secret-token"), false);
});

test("school LLM rate limit fails before provider fetch", async () => {
  let fetchCount = 0;
  const env = {
    SCHOOL_LLM_PROVIDER: "campus",
    SCHOOL_LLM_BASE_URL: "https://school.example/v1",
    SCHOOL_LLM_API_KEY: "school-secret-token",
    SCHOOL_LLM_MODEL: "school-model",
    SCHOOL_LLM_RATE_LIMIT_MAX: "1",
    SCHOOL_LLM_RATE_LIMIT_WINDOW_MS: "60000",
  };

  await requestOpenAICompatibleChatCompletion({
    purpose: "planner",
    featureName: "rate-limit-test",
    messages: [{ role: "user", content: '{"topic":"AI"}' }],
    env,
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      );
    },
  });

  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "planner",
      featureName: "rate-limit-test",
      messages: [{ role: "user", content: '{"topic":"AI"}' }],
      env,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response("{}");
      },
    }),
    (error) =>
      error instanceof LlmAdapterError && error.code === "provider-quota",
  );
  assert.equal(fetchCount, 1);
});

test("oversized school request fails before fetch without consuming the rate-limit bucket", async () => {
  let fetchCount = 0;
  const featureName = "context-window-guard-rate-limit-test";
  const sensitivePrompt = `SENSITIVE_PROMPT_SENTINEL ${"word ".repeat(20_000)}`;
  const env = {
    SCHOOL_LLM_PROVIDER: "campus",
    SCHOOL_LLM_BASE_URL: "https://school.example/v1",
    SCHOOL_LLM_API_KEY: "school-secret-token",
    SCHOOL_LLM_MODEL: "private-research-model",
    SCHOOL_LLM_RATE_LIMIT_MAX: "1",
    SCHOOL_LLM_RATE_LIMIT_WINDOW_MS: "60000",
  };
  const fetchImpl = async () => {
    fetchCount += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    );
  };

  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "report_writer",
      featureName,
      messages: [{ role: "user", content: sensitivePrompt }],
      maxTokens: 4_096,
      env,
      fetchImpl,
    }),
    (error) =>
      error instanceof LlmAdapterError &&
      error.code === "context-window-exceeded" &&
      /estimatedInputTokens=\d+/.test(error.message) &&
      /contextWindowTokens=32768/.test(error.message) &&
      !error.message.includes("SENSITIVE_PROMPT_SENTINEL") &&
      !error.message.includes("school-secret-token"),
  );
  assert.equal(fetchCount, 0);
  const rejectedUsage = readSchoolUsageLog()
    .filter((entry) => entry.featureName === featureName)
    .at(-1);
  assert.equal(rejectedUsage?.status, "failed");
  assert.equal(rejectedUsage?.latencyMs, 0);
  assert.equal(rejectedUsage?.estimatedOutputTokens, 0);

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "report_writer",
    featureName,
    messages: [{ role: "user", content: "Return JSON." }],
    env,
    fetchImpl,
  });
  assert.equal(content, '{"ok":true}');
  assert.equal(fetchCount, 1);

  await assert.rejects(
    requestOpenAICompatibleChatCompletion({
      purpose: "report_writer",
      featureName,
      messages: [{ role: "user", content: "Return JSON again." }],
      env,
      fetchImpl,
    }),
    (error) =>
      error instanceof LlmAdapterError && error.code === "provider-quota",
  );
  assert.equal(fetchCount, 1);
});

test("explicit large model profile permits an otherwise oversized request", async () => {
  let fetchCount = 0;
  let capturedBody: Record<string, unknown> | null = null;
  const model = "private-research-model-large-context";
  const env = {
    SCHOOL_LLM_PROVIDER: "campus",
    SCHOOL_LLM_BASE_URL: "https://school.example/v1",
    SCHOOL_LLM_API_KEY: "school-secret-token",
    SCHOOL_LLM_MODEL: model,
    MODEL_CAPABILITY_REGISTRY_JSON: JSON.stringify({
      [model]: {
        provider: "school",
        contextWindowTokens: 131_072,
        maxOutputTokens: 8_192,
        supportsJsonObject: true,
        recommendedWorkloads: ["report_writing"],
      },
    }),
  };

  const content = await requestOpenAICompatibleChatCompletion({
    purpose: "report_writer",
    featureName: "large-context-profile-dispatch-test",
    messages: [{ role: "user", content: "word ".repeat(20_000) }],
    maxTokens: 8_192,
    reasoningEffort: "low",
    responseFormat: "json_object",
    env,
    fetchImpl: async (_input, init) => {
      fetchCount += 1;
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      );
    },
  });

  assert.equal(content, '{"ok":true}');
  assert.equal(fetchCount, 1);
  const requestBody = capturedBody as Record<string, unknown> | null;
  assert.ok(requestBody);
  assert.equal(requestBody.max_tokens, 8_192);
  assert.equal(requestBody.reasoning_effort, "low");
});
