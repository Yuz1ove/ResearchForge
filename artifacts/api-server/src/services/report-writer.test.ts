import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod/source-record";
import { forbiddenInstructionTextMatches, writeReportWithLlm } from "./report-writer";

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
                          "本初步報告根據已接受來源整理薯條的營養、鈉含量與食品安全議題，並明確標示主要來源仍需補強[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "introduction",
                        title: "一、研究背景與問題意識",
                        prose:
                          "薯條作為常見速食配餐，可從熱量、脂肪、鈉含量與油炸加工條件切入，適合以食品標示與公共衛生資料進行保守分析[S1][S2]。",
                        evidenceCardIds: ["evidence:source-1:0", "evidence:source-2:0"],
                        citationIds: ["source-1", "source-2"],
                      },
                      {
                        sectionId: "findings",
                        title: "三、主要發現",
                        prose:
                          "目前來源可支持薯條營養成分與油炸風險的初步討論，但仍不足以推出精確攝取量或因果結論[S2][S3]。",
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
  assert.equal(result.sections.length, 0);
  assert.equal(result.sectionPlan?.length, 9);
  assert.equal(result.reportGenerationProvider, "ollama");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
});

test("report writer excludes unaccepted manual-review sources even when evidence cards exist", async () => {
  const workflowId = "wf-hiv-writer-test";
  const topicHash = "topic-hiv-writer-test";
  const acceptedSources = [1, 2, 3].map((index) =>
    source(index, {
      workflowId,
      topicHash,
      recommendationBucket: "manual_review",
      acceptedByUser: false,
      userDecision: "pending",
      relevanceLevel: "secondary",
    }),
  );
  const result = await writeReportWithLlm({
    workflowId,
    topicHash,
    topic: "愛滋病潛在風險與造成影響",
    acceptedSources,
    evidenceCards: acceptedSources.map((item, index) => ({
      id: `evidence:${item.id}:0`,
      sourceId: item.id ?? `source-${index + 1}`,
      workflowId,
      topicHash,
      claim: "HIV/AIDS 風險因素證據",
      evidence: "摘要提到傳染途徑與公共衛生影響。",
      summary: "可支撐風險與影響討論。",
      relevance: "HIV/AIDS",
      sourceTitle: item.title,
      sourceProvider: item.sourceType,
      year: item.year ?? null,
      usableSections: ["研究背景"],
      citationText: "Lovelace（2024）",
      limitation: null,
    })),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, "insufficient_sources");
  assert.equal(result.sections.length, 0);
});

test("report writer does not return synthetic sections on empty model output", async () => {
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
  assert.equal(result.sections.length, 0);
  assert.equal(result.sectionPlan?.length, 9);
});

test("report writer prompt path prefers zh-TW evidence summaries over raw English abstracts", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "過氯酸鈉的操作條件、儲存方式與實驗安全風險",
      acceptedSources: [
        source(1, {
          title: "Sodium perchlorate - PubChem Compound Summary",
          abstract:
            "PubChem records sodium perchlorate (NaClO4) as an oxidizing inorganic salt and provides identity, physical properties, safety information, and laboratory handling references for the compound.",
          abstractZhTw:
            "PubChem 將過氯酸鈉列為無機氧化鹽，並整理其身分資訊、物理性質與安全資料。",
          readableSummaryZhTw:
            "此來源可用來確認過氯酸鈉的化學身分、基本性質與安全資料，是實驗操作與危害辨識的官方基礎來源。",
          mainEvidencePointZhTw:
            "PubChem 提供過氯酸鈉的化學身分與安全資訊，可支撐操作條件與危害辨識分析。",
          sourceRelevanceReasonZhTw:
            "直接對應過氯酸鈉本體，且內容涵蓋安全資料，與主題高度相關。",
        }),
        source(2, {
          title: "SODIUM PERCHLORATE - NOAA CAMEO Chemicals",
          abstract:
            "CAMEO Chemicals describes sodium perchlorate as a white crystalline oxidizer that can accelerate burning of combustible materials and notes fire, heat, and reactivity hazards relevant to storage and emergency response.",
          abstractZhTw:
            "CAMEO 指出過氯酸鈉是白色結晶氧化劑，涉及火災、受熱與反應性危害。",
          readableSummaryZhTw:
            "此來源可直接支撐過氯酸鈉的儲存、相容性與緊急應變風險分析。",
          mainEvidencePointZhTw:
            "CAMEO 明確指出過氯酸鈉具有氧化性與受熱反應風險。",
          sourceRelevanceReasonZhTw:
            "直接命中過氯酸鈉的危害與儲存風險，是主題核心安全來源。",
        }),
        source(3, {
          title: "Sodium perchlorate - ECHA CHEM Dossier",
          abstract:
            "The ECHA chemicals dossier for sodium perchlorate provides identity data together with EU chemicals classification and labelling context that supports hazard review and handling-risk assessment.",
          abstractZhTw:
            "ECHA 提供過氯酸鈉的物質身分、分類與標示資訊，可補強危害審查。",
          readableSummaryZhTw:
            "此來源可補強過氯酸鈉在法規與危害分類上的判讀。",
          mainEvidencePointZhTw:
            "ECHA 提供過氯酸鈉的分類與標示資訊，可支撐風險評估。",
          sourceRelevanceReasonZhTw:
            "直接對應過氯酸鈉本體，並補充分類與標示資訊。",
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
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "abstract",
                        title: "摘要",
                        prose:
                          "本報告整理過氯酸鈉的化學身分、氧化性、分類與標示資訊，並只根據已接受來源保留安全限制[S1][S2][S3]。",
                        evidenceCardIds: ["evidence:source-1:0", "evidence:source-2:0", "evidence:source-3:0"],
                        citationIds: ["source-1", "source-2", "source-3"],
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

  const abstract = result.sections.find((section) => section.sectionId === "abstract")?.prose ?? "";
  assert.match(abstract, /過氯酸鈉/u);
  assert.doesNotMatch(abstract, /PubChem records sodium perchlorate|CAMEO Chemicals describes|The ECHA chemicals dossier/u);
  assert.match(abstract, /化學身分|氧化性|分類與標示/u);
});

test("report writer blocks official background evidence from scholarly synthesis sections", async () => {
  const officialSource = source(1, {
    id: "official-background",
    title: "Why Is the Sky Blue?",
    doi: null,
    url: "https://spaceplace.nasa.gov/blue-sky/",
    sourceType: "Official Source",
    provider: "NASA",
    sourceKind: "web",
    isPeerReviewed: false,
    recommendationBucket: "official_background",
    sourceRole: "official_background_explanation",
    retrievalMode: "trusted_seed",
    usableSections: ["研究背景"],
  });
  const scholarlySource = source(2, {
    id: "scholarly-rayleigh",
    title: "Rayleigh scattering and sunset color",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    retrievalMode: "live_provider",
  });

  const result = await writeReportWithLlm(
    {
      topic: "夕陽顏色與瑞利散射",
      acceptedSources: [officialSource, scholarlySource],
      evidenceCards: [
        {
          id: "evidence-official",
          sourceId: officialSource.id,
          claim: "NASA 說明天空顏色與光散射的基本概念。",
          evidence: "NASA explainer describes basic Rayleigh scattering.",
          summary: "官方背景說明。",
          relevance: "研究背景",
          sourceTitle: officialSource.title,
          sourceProvider: "NASA",
          doi: null,
          abstract: officialSource.abstract,
          provider: "NASA",
          relevanceScore: 80,
          sourceQualityScore: 70,
          finalScore: 75,
          year: officialSource.year,
          usableSections: ["研究背景"],
          citationText: "NASA（2024）",
          limitation: "非同行評審論文",
          limitations: ["非同行評審論文", "official explainer only"],
          sectionTargets: ["introduction", "literature_review", "discussion", "conclusion"],
          recommendationBucket: "official_background",
          sourceRole: "official_background_explanation",
          retrievalMode: "trusted_seed",
          isPeerReviewed: false,
        },
        {
          id: "evidence-scholarly",
          sourceId: scholarlySource.id,
          claim: "同行評審文獻討論瑞利散射對天空顏色的影響。",
          evidence: "Journal abstract discusses wavelength-dependent scattering.",
          summary: "學術摘要。",
          relevance: "文獻探討",
          sourceTitle: scholarlySource.title,
          sourceProvider: "Crossref",
          doi: scholarlySource.doi,
          abstract: scholarlySource.abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: scholarlySource.year,
          usableSections: ["文獻探討"],
          citationText: "Ada Lovelace（2024）",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "discussion"],
          recommendationBucket: "scholarly_recommended",
          sourceRole: "core_scholarly_evidence",
          retrievalMode: "live_provider",
          isPeerReviewed: true,
        },
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
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "introduction",
                        title: "一、研究背景與動機",
                        prose:
                          "NASA 官方說明可用來界定天空顏色與光散射的背景概念，但不作為學術因果結論[S1]。",
                        evidenceCardIds: ["evidence-official"],
                        citationIds: ["official-background"],
                      },
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose:
                          "同行評審文獻可支撐瑞利散射與波長相依散射的學術討論[S2]。",
                        evidenceCardIds: ["evidence-scholarly", "evidence-official"],
                        citationIds: ["scholarly-rayleigh", "official-background"],
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

  const introduction = result.sections.find((section) => section.sectionId === "introduction");
  const literatureReview = result.sections.find((section) => section.sectionId === "literature_review");
  const discussion = result.sections.find((section) => section.sectionId === "discussion");
  const conclusion = result.sections.find((section) => section.sectionId === "conclusion");

  assert.equal(introduction?.evidenceCardIds.includes("evidence-official"), true);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-official"), false);
  assert.equal(discussion?.evidenceCardIds.includes("evidence-official"), false);
  assert.equal(conclusion?.evidenceCardIds.includes("evidence-official"), false);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-scholarly"), true);
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
                            "本段只根據已接受薯條來源整理營養與食品安全限制，不加入未提供來源[S1]。",
                          evidenceCardIds: ["evidence:source-1:0"],
                          citationIds: ["source-1", "unaccepted-source"],
                        },
                        {
                          sectionId: "introduction",
                          title: "一、研究背景",
                          prose:
                            "薯條可由營養標示、油炸條件與飲食情境切入，正文需要保留可追溯引用[S2]。",
                          evidenceCardIds: ["evidence:source-2:0", "unknown-evidence"],
                          citationIds: ["source-2", "source-99"],
                        },
                        {
                          sectionId: "findings",
                          title: "三、主要發現",
                          prose:
                            "已接受來源足以支持初步整理，但不能捏造 DOI、作者或全文沒有提供的數據[S3]。",
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

test("report writer rejects instruction-like prose from model sections", async () => {
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
                          "本段應討論薯條的營養成分與食品安全議題，並建議寫出後續可補充的方向[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
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
  assert.equal(result.sections.length, 9);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /本段應|建議寫|可再補充/u);
  assert.match(result.sections[0]?.prose ?? "", /薯條/u);
});

test("forbiddenInstructionTextMatches detects report-writer placeholder language", () => {
  const matches = forbiddenInstructionTextMatches("本段應探討研究背景，TODO：建議加入更多資料。");

  assert.equal(matches.some((match) => /本段應/u.test(match)), true);
  assert.equal(matches.some((match) => /TODO/u.test(match)), true);
  assert.equal(forbiddenInstructionTextMatches("現有來源顯示主題可分為背景、方法與限制三個層面。").length, 0);
});

test("report writer excludes metadata-only evidence from literature review claims", async () => {
  const metadataSource = source(1, {
    id: "metadata-only-rayleigh",
    title: "Metadata-only Rayleigh scattering record",
    abstract: null,
    accessLevel: "metadata_only",
    extractionStatus: "skipped",
    extractionMethod: "metadata_only",
    sourceUseLevel: "metadata_context_only",
    evidenceGrounding: "metadata_only",
  });
  const scholarlySource = source(2, {
    id: "fulltext-rayleigh",
    title: "Full text Rayleigh scattering study",
    accessLevel: "full_text",
    extractionStatus: "success",
    extractionMethod: "html_readability",
    sourceUseLevel: "citable_full_text",
    evidenceGrounding: "snippet_grounded",
  });

  const result = await writeReportWithLlm(
    {
      topic: "夕陽顏色與瑞利散射",
      acceptedSources: [metadataSource, scholarlySource, source(3)],
      evidenceCards: [
        {
          id: "evidence-metadata",
          sourceId: metadataSource.id,
          claim: "metadata 標題可直接支持瑞利散射文獻探討。",
          evidence: "Metadata-only Rayleigh scattering record",
          summary: "metadata-only record",
          relevance: "文獻探討",
          sourceTitle: metadataSource.title,
          sourceProvider: "OpenAlex",
          doi: metadataSource.doi,
          abstract: null,
          provider: "OpenAlex",
          relevanceScore: 80,
          sourceQualityScore: 70,
          finalScore: 75,
          year: metadataSource.year,
          usableSections: ["文獻探討"],
          citationText: "Ada Lovelace（2024）",
          limitation: "metadata_only",
          limitations: ["metadata_only"],
          sectionTargets: ["literature_review", "discussion"],
          sourceAccessLevel: "metadata_only",
          source_access_level: "metadata_only",
          evidenceType: "background",
          evidence_type: "background",
          trace: { extraction_method: "metadata_only" },
          isPeerReviewed: true,
        },
        {
          id: "evidence-fulltext",
          sourceId: scholarlySource.id,
          claim: "全文片段說明瑞利散射會依波長改變觀測到的夕陽顏色。",
          evidence: "Rayleigh scattering is wavelength dependent and affects sunset color observations.",
          summary: "full-text evidence",
          relevance: "文獻探討",
          sourceTitle: scholarlySource.title,
          sourceProvider: "Crossref",
          doi: scholarlySource.doi,
          abstract: scholarlySource.abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: scholarlySource.year,
          usableSections: ["文獻探討"],
          citationText: "Ada Lovelace（2024）",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "discussion"],
          sourceAccessLevel: "full_text",
          source_access_level: "full_text",
          evidenceType: "finding",
          evidence_type: "finding",
          sourceLocation: "Findings",
          source_location: "Findings",
          trace: { extraction_method: "html_readability" },
          isPeerReviewed: true,
        },
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
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose:
                          "文獻探討僅能依可追溯全文片段說明瑞利散射與夕陽顏色的關係，不把 metadata 標題當成學術證據[S2]。",
                        evidenceCardIds: ["evidence-metadata", "evidence-fulltext"],
                        citationIds: ["metadata-only-rayleigh", "fulltext-rayleigh"],
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

  const literatureReview = result.sections.find((section) => section.sectionId === "literature_review");

  assert.equal(result.ok, true);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-metadata"), false);
  assert.equal(literatureReview?.evidenceCardIds.includes("evidence-fulltext"), true);
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
                          "本段先整理薯條議題的營養與食品安全脈絡，內容仍以已接受來源可支持的範圍為限[S1]。",
                        evidenceCardIds: [],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "discussion",
                        title: "討論",
                        prose:
                          "現有來源可支撐初步比較，但仍不足以推出全文沒有提供的精確攝取量或因果結論[S2]。",
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
                    "本報告先整理飛機相關材料、結構與風險面向，內容僅限於已接受來源可支持的資訊[S1]。",
                    "",
                    "一、研究動機",
                    "飛機議題可從材料、結構與安全監測切入，適合做為高中研究報告的初步主題[S1]。",
                    "",
                    "二、研究問題",
                    "目前可先追問飛機材料演進如何影響結構安全，以及監測技術如何支撐維護判斷[S1]。",
                    "",
                    "三、文獻探討",
                    "現有來源集中在結構壽命預測、複合材料與結構健康監測，已形成可整理的共同主軸[S2]。",
                    "",
                    "五、討論",
                    "目前資料能支持初步整理，但仍需要更多全文或官方資料補足在地案例與量化證據[S2]。",
                    "",
                    "六、結論與建議",
                    "整體而言，飛機研究可沿著結構材料與安全監測兩條主線繼續深化[S3]。",
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
                          "本摘要先依已接受來源整理飛機研究的材料、結構與監測面向，並保留來源限制說明[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "introduction",
                        title: "一、研究動機",
                        prose:
                          "飛機研究可從結構安全、複合材料與健康監測切入，適合作為後續延伸的研究主題[S1]。",
                        evidenceCardIds: ["evidence:source-1:0"],
                        citationIds: ["source-1"],
                      },
                      {
                        sectionId: "findings",
                        title: "四、資料與證據整理",
                        prose:
                          "現有來源集中說明複合材料、壽命預測與結構監測的角色，可支撐初步整理[S2]。",
                        evidenceCardIds: ["evidence:source-2:0"],
                        citationIds: ["source-2"],
                      },
                      {
                        sectionId: "conclusion",
                        title: "六、結論與建議",
                        prose:
                          "後續若要深化飛機主題，建議再補足近年案例與官方資料，以提升報告完整度[S3]。",
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
  assert.equal(result.sections.length, 0);
  assert.equal(result.sectionPlan?.length, 9);
  assert.equal(
    result.sectionPlan?.some((section) => section.needsMoreEvidence),
    true,
  );
});

test("report writer paragraphClaims reject unsupported assertive model prose", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "睡眠時間與青少年學習記憶表現",
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: [
        {
          id: "evidence-sleep-1",
          sourceId: "source-1",
          claimIds: ["claim-sleep-1"],
          claim: "較短睡眠時間與較差的青少年記憶表現相關。",
          claimTextZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
          mainClaimZhTw: "較短睡眠時間與較差的青少年記憶表現相關。",
          evidence:
            "shorter sleep duration was associated with poorer adolescent memory performance",
          supportSpans: [
            {
              claimId: "claim-sleep-1",
              text: "shorter sleep duration was associated with poorer adolescent memory performance",
            },
          ],
          summary: "睡眠時間與記憶表現的關聯。",
          relevance: "文獻探討",
          sourceTitle: "Sleep duration and adolescent memory performance",
          sourceProvider: "Crossref",
          sourceAccessLevel: "full_text",
          extractionStatus: "text_extracted",
          evidenceType: "finding",
          citationMarker: "[S1]",
          doi: "10.1000/fries-1",
          abstract: source(1).abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: 2024,
          usableSections: ["文獻探討", "數據分析"],
          citationText: "Ada Lovelace（2024）[S1]",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "findings", "discussion"],
          recommendationBucket: "scholarly_recommended",
        },
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
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose: "研究證實睡眠時間必然提升所有青少年的記憶表現。",
                        evidenceCardIds: ["evidence-sleep-1"],
                        citationIds: ["source-1"],
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

  const literatureReview = result.sections.find(
    (section) => section.sectionId === "literature_review",
  );
  assert.ok(literatureReview);
  assert.doesNotMatch(literatureReview.prose, /必然提升所有/u);
  assert.deepEqual(
    literatureReview.paragraphClaims?.flatMap((paragraph) => paragraph.unsupportedSentences),
    [],
  );
  assert.deepEqual(
    literatureReview.paragraphClaims?.flatMap((paragraph) => paragraph.claimIds),
    ["claim-sleep-1"],
  );
});

test("report writer accepts halfwidth citations for fullwidth evidence markers", async () => {
  const result = await writeReportWithLlm(
    {
      topic: "短影音使用時間與高中生睡眠品質",
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: [
        {
          id: "evidence-video-1",
          sourceId: "source-1",
          claimIds: ["claim-video-1"],
          claim: "螢幕媒體使用與學生睡眠結果有關。",
          claimTextZhTw: "螢幕媒體使用與學生睡眠結果有關。",
          mainClaimZhTw: "螢幕媒體使用與學生睡眠結果有關。",
          evidence:
            "screen-based media device access or use was associated with sleep outcomes",
          supportSpans: [
            {
              claimId: "claim-video-1",
              text: "screen-based media device access or use was associated with sleep outcomes",
            },
          ],
          summary: "螢幕媒體使用與睡眠結果的關聯。",
          relevance: "文獻探討",
          sourceTitle: "Screen-based media and sleep outcomes",
          sourceProvider: "Crossref",
          sourceAccessLevel: "full_text",
          extractionStatus: "text_extracted",
          evidenceType: "finding",
          citationMarker: "［S1］",
          abstract: source(1).abstract,
          provider: "Crossref",
          relevanceScore: 92,
          sourceQualityScore: 90,
          finalScore: 91,
          year: 2024,
          usableSections: ["文獻探討", "數據分析"],
          citationText: "Ada Lovelace（2024）[S1]",
          limitation: null,
          limitations: [],
          sectionTargets: ["literature_review", "findings", "discussion"],
          recommendationBucket: "scholarly_recommended",
        },
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
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    sections: [
                      {
                        sectionId: "literature_review",
                        title: "三、文獻探討",
                        prose: "研究指出螢幕媒體使用與學生睡眠結果有關[S1]。",
                        evidenceCardIds: ["evidence-video-1"],
                        citationIds: ["source-1"],
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

  const literatureReview = result.sections.find(
    (section) => section.sectionId === "literature_review",
  );
  assert.ok(literatureReview);
  assert.match(literatureReview.prose, /有關\[S1\]/u);
  assert.deepEqual(
    literatureReview.paragraphClaims?.flatMap((paragraph) => paragraph.unsupportedSentences),
    [],
  );
});
