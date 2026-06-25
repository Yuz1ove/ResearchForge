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
        assert.match(userMessage.content, /Accepted sources/);
        assert.match(userMessage.content, /authors: Ada Lovelace/);
        assert.match(userMessage.content, /year: 2024/);
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
  assert.equal(result.status, "success");
  assert.equal(result.llm_status, "success");
  assert.equal(result.fallback_used, false);
  assert.equal(result.reportGenerationProvider, "openai-compatible");
  assert.equal(result.reportGenerationModel, "test-model");
  assert.equal(result.reportGenerationStatus, "success");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.sections.length, 9);
  assert.match(result.sections[0]?.prose ?? "", /初步報告/);
  assert.deepEqual(
    result.sections.map((section) => section.sectionId),
    [
      "abstract",
      "introduction",
      "research_question",
      "literature_review",
      "methodology",
      "findings",
      "discussion",
      "limitations",
      "conclusion",
    ],
  );
  assert.match(
    result.sections.find((section) => section.sectionId === "methodology")?.prose ?? "",
    /evidence cards|已接受來源/u,
  );
});

test("report writer skips LLM generation below the accepted-source minimum", async () => {
  const result = await writeReportWithLlm({
    topic: "可樂",
    acceptedSources: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "insufficient_sources");
  assert.equal(result.llm_status, "skipped");
  assert.match(result.warning ?? "", /accepted_evidence_cards_missing/);
  assert.equal(result.sections.length, 9);
  assert.match(
    result.sections.find((section) => section.sectionId === "limitations")?.warnings?.join(" ") ?? "",
    /受限草稿|evidenceIds/u,
  );
  assert.equal(result.reportGenerationProvider, "ollama");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, "accepted_evidence_cards_missing");
});

test("report writer falls back on empty model output with evidence-backed constrained sections", async () => {
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
  assert.equal(result.status, "error");
  assert.equal(result.fallback_used, true);
  assert.equal(result.llm_status, "failed");
  assert.equal(result.reportGenerationStatus, "failed");
  assert.equal(result.fallbackUsed, true);
  assert.match(result.fallbackReason ?? "", /LLM report writer fallback/);
  assert.equal(result.sections.length, 9);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /目前可先從|目前資料收集集中在/u);
  assert.match(result.sections[0]?.prose ?? "", /薯條/u);
  assert.match(
    result.sections.find((section) => section.sectionId === "limitations")?.prose ?? "",
    /尚未讀取全文|摘要/u,
  );
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
  assert.equal(result.status, "success");
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

test("report writer accepts partial usable sections and citation-only references", async () => {
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
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本段先整理薯條議題的營養與食品安全脈絡，內容仍以已接受來源可支持的範圍為限。（來源 1）",
                        evidenceCardIds: [],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "discussion",
                        title: "討論",
                        prose:
                          "現有來源可支撐初步比較，但仍不足以推出全文沒有提供的精確攝取量或因果結論。（來源 2）",
                        evidenceCardIds: ["evidence:source-2:0"],
                        citationIds: ["source-2"],
                      },
                    ],
                  }),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections[0]?.citationIds[0], "source-1");
  assert.equal(result.sections[0]?.evidenceCardIds.length > 0, true);
  assert.match(result.warning ?? "", /2\/9 usable sections/);
});

test("report writer recovers sectioned freeform prose when the local LLM skips JSON", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "飛機",
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
                    "摘要",
                    "本報告先整理飛機相關材料、結構與風險面向，內容僅限於已接受來源可支持的資訊。",
                    "",
                    "一、研究動機",
                    "飛機議題可從材料、結構與安全監測切入，適合做為高中研究報告的初步主題。",
                    "",
                    "二、研究問題",
                    "目前可先追問飛機材料演進如何影響結構安全，以及監測技術如何支撐維護判斷。",
                    "",
                    "三、文獻探討",
                    "現有來源集中在結構壽命預測、複合材料與結構健康監測，已形成可整理的共同主軸。",
                    "",
                    "五、討論",
                    "目前資料能支持初步整理，但仍需要更多全文或官方資料補足在地案例與量化證據。",
                    "",
                    "六、結論與建議",
                    "整體而言，飛機研究可沿著結構材料與安全監測兩條主線繼續深化。",
                  ].join("\n"),
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections[0]?.sectionId, "abstract");
  assert.match(result.sections[0]?.prose ?? "", /飛機相關材料/);
  assert.match(result.warning ?? "", /freeform fallback parsing/);
  assert.doesNotMatch(
    result.sections.find((section) => section.sectionId === "research_question")?.prose ?? "",
    /目前可先追問/u,
  );
});

test("report writer retries with a compact prompt when the first local response is unusable", async () => {
  let requestCount = 0;

  const result = await writeReportWithLlm(
    {
      topic: "飛機",
      acceptedSources: [source(1), source(2), source(3)],
    },
    {
      llm: {
        baseUrl: "https://llm.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "The",
                  },
                },
              ],
            }),
          );
        }

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
                          "本摘要先依已接受來源整理飛機研究的材料、結構與監測面向，並保留來源限制說明。（來源 1）",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "introduction",
                        title: "一、研究動機",
                        prose:
                          "飛機研究可從結構安全、複合材料與健康監測切入，適合作為後續延伸的研究主題。（來源 1）",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "findings",
                        title: "四、資料與證據整理",
                        prose:
                          "現有來源集中說明複合材料、壽命預測與結構監測的角色，可支撐初步整理。（來源 2）",
                        evidenceCardIds: ["evidence:source-2:0"],
                        citationIds: ["source-2"],
                      },
                      {
                        sectionId: "conclusion",
                        title: "六、結論與建議",
                        prose:
                          "後續若要深化飛機主題，建議再補足近年案例與官方資料，以提升報告完整度。（來源 3）",
                        evidenceCardIds: ["evidence:source-3:0"],
                        citationIds: ["source-3"],
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

  assert.equal(requestCount, 2);
  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.match(result.warning ?? "", /精簡上下文重新生成/);
});

test("report writer recovers complete sections from truncated JSON output", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "飛機",
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
                  content: `{
"sections":[
{"sectionId":"abstract","title":"摘要","prose":"本摘要先整理飛機材料與安全監測的研究主線，並保留來源限制說明。","evidenceCardIds":["evidence:source-1:0"],"citationIds":["source-1"]},
{"sectionId":"introduction","title":"一、研究動機","prose":"飛機主題可從結構安全、材料演進與健康監測切入，作為後續研究起點。","evidenceCardIds":["evidence:source-2:0"],"citationIds":["source-2"]},
{"sectionId":"findings","title":"四、資料與證據整理","prose":"目前來源集中於複合材料、壽命預測與監測技術，可支撐初步整理。","evidenceCardIds":["evidence:source-3:0"],"citationIds":["source-3"]},
{"sectionId":"discussion","title":"五、討論","prose":"若要深化此主題，仍需補足近年案例與更完整的全文證據。","evidenceCardIds":["evidence:source-1:0"],"citationIds":["source-1"]}`,
                },
              },
            ],
          }),
        ),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "success");
  assert.equal(result.sections.length, 9);
  assert.equal(result.sections[0]?.sectionId, "abstract");
  assert.match(result.warning ?? "", /truncated JSON/);
});

test("report writer marks gyroscope theory gaps when accepted evidence is mostly engineering applications", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "陀螺的角動量、扭矩與旋轉穩定性原理",
      acceptedSources: [
        source(1, {
          id: "gyro-1",
          title: "Orientation Estimation with Gyroscope and Accelerometer Fusion",
          abstract:
            "This study focuses on orientation estimation, sensor fusion, and IMU drift correction for mobile devices. It explains how gyroscope measurements improve attitude tracking but does not derive classical spinning top torque equations.",
        }),
        source(2, {
          id: "gyro-2",
          title: "Micromachined Gyroscope Design for Navigation Sensors",
          abstract:
            "The paper reviews micromachined gyroscope structures, sensitivity, and navigation-oriented signal processing. It emphasizes sensing applications rather than rigid body dynamics or spinning top precession theory.",
        }),
        source(3, {
          id: "gyro-3",
          title: "Sensor Fusion Methods for Inertial Measurement Units",
          abstract:
            "This review summarizes sensor fusion approaches, attitude estimation, and inertial measurement applications across robotics and navigation systems.",
        }),
      ],
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
  assert.equal(result.sections.length, 9);
  assert.match(
    result.sections.find((section) => section.sectionId === "findings")?.prose ?? "",
    /姿態估計|感測|導航/u,
  );
  assert.match(
    result.sections.find((section) => section.sectionId === "limitations")?.prose ?? "",
    /角動量理論|扭矩機制|旋轉穩定性|進動與剛體模型/u,
  );
  assert.match(
    result.sections.find((section) => section.sectionId === "discussion")?.prose ?? "",
    /工程|應用|理論/u,
  );
});
