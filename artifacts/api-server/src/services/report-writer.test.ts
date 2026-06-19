import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import { writeReportWithLlm } from "./report-writer";

function source(index: number, overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: `source-${index}`,
    title: `薯條營養研究 ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "此來源討論薯條的營養成分、鈉含量、油炸條件與食品安全風險，摘要足以支撐報告段落。",
    doi: `10.1000/fries-${index}`,
    url: `https://doi.org/10.1000/fries-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    relevanceLevel: index === 1 ? "primary" : "secondary",
    evidenceGrounding: "abstract_grounded",
    ...overrides,
  };
}

test("report writer sends accepted sources to the LLM and returns formal Chinese sections", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      reportType: "研究報告",
      audience: "高中",
      language: "繁體中文",
      generationMode: "preliminary",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        assert.equal(request.model, "test-model");
        const userMessage = request.messages.find(
          (message: { role: string }) => message.role === "user",
        );
        assert.match(userMessage.content, /薯條/);
        assert.match(userMessage.content, /Evidence cards/);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本初步報告根據已接受來源整理薯條的營養、鈉含量與食品安全議題，並明確標示主要來源仍需補強。（來源 1）",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "introduction",
                        title: "一、研究背景與問題意識",
                        prose:
                          "薯條作為常見速食配餐，可從熱量、脂肪、鈉含量與油炸加工條件切入，適合以食品標示與公共衛生資料進行保守分析。（來源 1）（來源 2）",
                        evidenceCardIds: ["evidence:source-1:0", "evidence:source-2:0"],
                        citationIds: ["source-1", "source-2"],
                      },
                      {
                        sectionId: "findings",
                        title: "三、主要發現",
                        prose:
                          "目前來源可支持薯條營養成分與油炸風險的初步討論，但仍不足以推出精確攝取量或因果結論。（來源 2）（來源 3）",
                        evidenceCardIds: ["evidence:source-2:0", "evidence:source-3:0"],
                        citationIds: ["source-2", "source-3"],
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

  assert.equal(result.ok, true);
  assert.equal(result.llm_status, "success");
  assert.equal(result.fallback_used, false);
  assert.equal(result.sections.length, 3);
  assert.match(result.sections[0]?.prose ?? "", /初步報告/);
});

test("report writer skips LLM generation below the accepted-source minimum", async () => {
  const result = await writeReportWithLlm({
    topic: "可樂",
    acceptedSources: [source(1), source(2)],
  });

  assert.equal(result.ok, false);
  assert.equal(result.llm_status, "skipped");
  assert.equal(result.warning, "accepted_evidence_cards_below_minimum");
});

test("report writer falls back on empty model output without inventing sections", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
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

  assert.equal(result.ok, false);
  assert.equal(result.fallback_used, true);
  assert.equal(result.llm_status, "failed");
  assert.deepEqual(result.sections, []);
});

test("report writer extracts JSON from markdown fences and filters unaccepted citations", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "薯條",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    "```json",
                    JSON.stringify({
                      sections: [
                        {
                          sectionId: "abstract",
                          title: "摘要",
                          prose:
                            "本段只根據已接受薯條來源整理營養與食品安全限制，不加入未提供來源。（來源 1）",
                          evidenceCardIds: ["evidence:source-1:0"],
                          citationIds: ["source-1", "unaccepted-source"],
                        },
                        {
                          sectionId: "introduction",
                          title: "一、研究背景",
                          prose:
                            "薯條可由營養標示、油炸條件與飲食情境切入，正文需要保留可追溯引用。（來源 2）",
                          evidenceCardIds: ["evidence:source-2:0", "unknown-evidence"],
                          citationIds: ["source-2", "source-99"],
                        },
                        {
                          sectionId: "findings",
                          title: "三、主要發現",
                          prose:
                            "已接受來源足以支持初步整理，但不能捏造 DOI、作者或全文沒有提供的數據。（來源 3）",
                          evidenceCardIds: ["evidence:source-3:0"],
                          citationIds: ["source-3"],
                        },
                      ],
                    }),
                    "```",
                  ].join("\n"),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.sections[0]?.citationIds, ["source-1"]);
  assert.deepEqual(result.sections[1]?.evidenceCardIds, ["evidence:source-2:0"]);
  assert.equal(
    result.sections.some((section) => section.citationIds.includes("unaccepted-source")),
    false,
  );
  assert.equal(
    result.sections.some((section) => section.citationIds.includes("source-99")),
    false,
  );
});
