import assert from "node:assert/strict";
import test from "node:test";
import {
  citationMarkerSourceLabel,
  exportSafeReportSectionText,
  previewWorkspaceMatchesContext,
  readerFacingInternalTerms,
  readerFacingNaturalParagraphs,
  sanitizeReaderFacingInternalLanguage,
  stripReaderFacingCitationMarkers,
  visibleReportSectionText,
} from "./reportPreviewGuards.ts";

test("preview guard blocks stale workflow snapshots when current context is provided", () => {
  assert.equal(
    previewWorkspaceMatchesContext(
      { workflowId: "wf-a", topicHash: "topic-a", isConsistent: true },
      { workflowId: "wf-b", topicHash: "topic-a" },
    ),
    false,
  );
  assert.equal(
    previewWorkspaceMatchesContext(
      { workflowId: "wf-a", topicHash: "topic-a", isConsistent: true },
      { workflowId: "wf-a", topicHash: "topic-b" },
    ),
    false,
  );
  assert.equal(
    previewWorkspaceMatchesContext(
      { workflowId: "wf-a", topicHash: "topic-a", isConsistent: true },
      { workflowId: "wf-a", topicHash: "topic-a" },
    ),
    true,
  );
});

test("preview guard blocks inconsistent stored snapshots even without route params", () => {
  assert.equal(
    previewWorkspaceMatchesContext(
      { workflowId: "wf-a", topicHash: "topic-a", isConsistent: false },
      {},
    ),
    false,
  );
});

test("visible section text renders prose or body but not instruction fields", () => {
  const section = {
    goal: "文獻探討應比較既有資料並加入指令文字",
    guidance: "資料與證據整理應列出來源",
    instructions: "研究方法可再補充搜尋條件",
    prose: "正式段落：本段只呈現可見報告內容。",
  } as Parameters<typeof visibleReportSectionText>[0] & {
    goal: string;
    guidance: string;
    instructions: string;
  };

  const text = visibleReportSectionText(section);

  assert.match(text, /正式段落/);
  assert.doesNotMatch(text, /文獻探討應|資料與證據整理應|研究方法可/);
});

test("reader-facing cleanup replaces untranslated generation-state boilerplate with an evidence boundary", () => {
  const text = visibleReportSectionText({
    sectionId: "findings",
    body: "此來源已保留可追溯的摘要片段，但尚未完成可驗證的繁中重點整理[S1]。",
  });

  assert.doesNotMatch(text, /尚未完成可驗證的繁中重點整理/u);
  assert.doesNotMatch(text, /generation|fallback|writer|prompt/iu);
  assert.match(text, /原文摘要.*不單獨形成.*實質結論/u);
});

test("visible section text treats edited body as canonical over stale generated prose", () => {
  assert.equal(
    visibleReportSectionText({
      body: "使用者已編輯的新正文。",
      prose: "舊的模型段落。",
    }),
    "使用者已編輯的新正文。",
  );
});

test("export-safe section text replaces verifier-blocked prose with a reader-facing evidence boundary", () => {
  const text = exportSafeReportSectionText({
    sectionId: "findings",
    title: "主要發現",
    body: "未經支撐的正式段落不應被匯出。",
    groundingStatus: "unsupported",
    generationMethod: "grounding_verifier_blocked",
    evidenceCardIds: ["evidence-1"],
    unsupportedSentences: ["未經支撐的正式段落不應被匯出。"],
  });

  assert.match(text, /證據缺口|不提出未經支撐的結論/);
  assert.doesNotMatch(text, /supportSpan|grounding verifier|evidence card|metadata/iu);
  assert.doesNotMatch(text, /^未經支撐的正式段落不應被匯出。$/u);
});

test("export-safe section text blocks manual edits without leaking verifier terminology", () => {
  const text = exportSafeReportSectionText({
    sectionId: "discussion",
    title: "分析與討論",
    body: "使用者新增的外推句尚未通過 verifier。",
    groundingStatus: "unsupported",
    generationMethod: "needs_manual_review",
    evidenceCardIds: ["evidence-1"],
    warnings: ["needs_manual_review"],
  });

  assert.match(text, /證據缺口|不提出未經支撐的結論/);
  assert.doesNotMatch(text, /verifier|supportSpan|evidence card|metadata/iu);
  assert.doesNotMatch(text, /^使用者新增的外推句/u);
});

test("reader-facing report text removes inline citation markers in common variants", () => {
  const text = stripReaderFacingCitationMarkers(
    "第一句[S1]。第二句[Ｓ２]。第三句 (s1)。第四句 Ｓ２。第五句［ｓ2］。",
  );

  assert.equal(text, "第一句。第二句。第三句。第四句。第五句。");
  assert.doesNotMatch(text, /[sS\uff33\uff53]\s*[0-9\uff10-\uff19]+/u);
});

test("reader-facing cleanup preserves scientific S labels that are part of the prose", () => {
  const text = stripReaderFacingCitationMarkers(
    "補充資料見 Table S1。S1 protein 仍是研究對象。附圖 S2。這一句才是來源 s1。",
  );

  assert.equal(
    text,
    "補充資料見 Table S1。S1 protein 仍是研究對象。附圖 S2。這一句才是來源。",
  );
});

test("export preserves inline markers beside claims without mutating citation metadata", () => {
  const section = {
    sectionId: "findings",
    title: "主要發現",
    body: "主要發現由已接受來源支持[S1]。限制亦需持續複核(Ｓ２)。",
    groundingStatus: "grounded",
    generationMethod: "llm_report_writer",
    evidenceCardIds: ["evidence-1", "evidence-2"],
    citationMarkers: ["[S1]", "[Ｓ２]"],
  };

  const text = exportSafeReportSectionText(section);

  assert.equal(text, "主要發現由已接受來源支持[S1]。限制亦需持續複核(Ｓ２)。");
  assert.deepEqual(section.citationMarkers, ["[S1]", "[Ｓ２]"]);
});

test("citation badges use human-readable source labels", () => {
  assert.equal(citationMarkerSourceLabel("[S1]"), "來源 1");
  assert.equal(citationMarkerSourceLabel("[Ｓ２]"), "來源 2");
  assert.equal(citationMarkerSourceLabel("(s3)"), "來源 3");
  assert.equal(citationMarkerSourceLabel(null, 3), "來源 4");
});

test("reader-facing paragraphs remove template prefixes and repetitive sentences", () => {
  const paragraphs = readerFacingNaturalParagraphs(
    "主旨：睡眠不足會影響青少年注意力。摘要重點：睡眠不足會影響青少年注意力。睡眠不足會影響青少年注意力與課堂表現。此外，研究也指出作息規律性值得納入評估。然而，不同研究設計仍限制因果推論。因此，後續研究需要補充縱向資料。最後，報告應保留證據邊界。",
  );
  const text = paragraphs.join("");

  assert.ok(paragraphs.length >= 2 && paragraphs.length <= 4);
  assert.doesNotMatch(text, /主旨：|摘要重點：/u);
  assert.doesNotMatch(text, /睡眠不足會影響青少年注意力。/u);
  assert.match(text, /睡眠不足會影響青少年注意力與課堂表現。/u);
  for (const paragraph of paragraphs) {
    const sentenceCount = paragraph.match(/[。！？!?]/gu)?.length ?? 0;
    assert.ok(sentenceCount >= 2 && sentenceCount <= 4);
  }
});

test("reader-facing paragraphs remove embedded source-card labels", () => {
  const text = readerFacingNaturalParagraphs(
    "本節可支持的範圍應限於主旨：微塑膠會進入海洋食物網。資料限制：目前來源以摘要為主。",
  ).join("");

  assert.equal(
    text,
    "本節可支持的範圍應限於微塑膠會進入海洋食物網。目前來源以摘要為主。",
  );
  assert.doesNotMatch(text, /主旨\s*[：:]|資料限制\s*[：:]/u);
});

test("reader-facing sanitizer removes internal report-pipeline vocabulary", () => {
  const text = sanitizeReaderFacingInternalLanguage(
    "請核對 exact supportSpan，evidence cards 仍是 metadata-only，並需 peer-reviewed evidence 支持。grounding verifier 尚未通過。",
  );

  assert.equal(
    text,
    "請核對可核對的來源支持片段，證據摘錄仍是書目資訊，並需同儕審查文獻支持。引用支撐檢查尚未通過。",
  );
  assert.doesNotMatch(text, /supportSpan|evidence card|metadata|peer-reviewed|verifier/iu);
});

test("centralized reader-language guard covers report, bibliography, and service diagnostics terms", () => {
  const internal = [
    "metadata incomplete",
    "evidence card builder",
    "evidence chunks",
    "Support span",
    "provider diagnostics",
    "accepted sources",
    "needs_manual_review",
  ].join("；");
  const sanitized = sanitizeReaderFacingInternalLanguage(internal);

  assert.deepEqual(readerFacingInternalTerms(sanitized), []);
  assert.match(sanitized, /書目資料待補/u);
  assert.match(sanitized, /證據摘錄整理流程/u);
  assert.match(sanitized, /來源支持片段/u);
  assert.match(sanitized, /來源服務狀態/u);
});

test("reader-language guard removes formal-planning implementation terms", () => {
  const sanitized = sanitizeReaderFacingInternalLanguage(
    "ArgumentMap、DiscoursePlan、ReportPlan 與 canonical citation registry 使用 normalizedClaimZhTw 和 paragraphPlans；findings 類證據已正規化且可追溯的主張。",
  );

  assert.deepEqual(readerFacingInternalTerms(sanitized), []);
  assert.doesNotMatch(sanitized, /ArgumentMap|DiscoursePlan|ReportPlan|canonical|normalizedClaim|paragraphPlans|findings\s*類/u);
  assert.match(sanitized, /整體論證|章節論證安排|報告架構|統一引用對照|已核對主張/u);
});

test("reader-language cleanup preserves legal academic titles", () => {
  const title = "Citation Enforced Prompting for Faithful Question Answering";

  assert.equal(sanitizeReaderFacingInternalLanguage(title), title);
  assert.deepEqual(readerFacingInternalTerms(title), []);
});

test("reader-facing dedupe preserves distinct sentences containing numeric evidence", () => {
  const text = readerFacingNaturalParagraphs(
    "樣本包含100人。樣本包含100人。樣本包含100人，其中60%為女性。平均年齡15.2歲。研究採用兩個時點的追蹤設計。",
  ).join("");

  assert.equal(text.match(/樣本包含100人。/gu)?.length, 1);
  assert.match(text, /樣本包含100人，其中60%為女性。/u);
  assert.match(text, /平均年齡15\.2歲。/u);
});

test("safe export uses natural paragraph breaks without changing citation metadata", () => {
  const section = {
    sectionId: "findings",
    title: "主要發現",
    body:
      "第一句說明研究範圍[S1]。第二句說明分析方式。第三句整理主要發現。第四句說明結果邊界[S2]。第五句提出後續方向。",
    groundingStatus: "grounded",
    generationMethod: "llm_report_writer",
    evidenceCardIds: ["evidence-1", "evidence-2"],
    citationMarkers: ["[S1]", "[S2]"],
  };

  const text = exportSafeReportSectionText(section);

  assert.match(text, /\n\n/u);
  assert.match(text, /\[S1\]/u);
  assert.match(text, /\[S2\]/u);
  assert.deepEqual(section.citationMarkers, ["[S1]", "[S2]"]);
});

test("safe export preserves bibliography text even without evidence cards", () => {
  const text = exportSafeReportSectionText({
    sectionId: "references",
    title: "參考資料",
    body: "1. Example Author (2024). Example study. https://doi.org/10.1000/example",
    groundingStatus: "unsupported",
    evidenceCardIds: [],
  });

  assert.match(text, /Example Author \(2024\)/u);
  assert.match(text, /10\.1000\/example/u);
  assert.doesNotMatch(text, /目前不輸出正式段落/u);
});
