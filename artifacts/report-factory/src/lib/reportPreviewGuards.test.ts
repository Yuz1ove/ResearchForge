import assert from "node:assert/strict";
import test from "node:test";
import {
  exportSafeReportSectionText,
  previewWorkspaceMatchesContext,
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

test("export-safe section text replaces verifier-blocked prose with review prompt", () => {
  const text = exportSafeReportSectionText({
    sectionId: "findings",
    title: "主要發現",
    body: "未經支撐的正式段落不應被匯出。",
    groundingStatus: "unsupported",
    generationMethod: "grounding_verifier_blocked",
    evidenceCardIds: ["evidence-1"],
    unsupportedSentences: ["未經支撐的正式段落不應被匯出。"],
  });

  assert.match(text, /不輸出正式段落|重新生成或審查/);
  assert.doesNotMatch(text, /^未經支撐的正式段落不應被匯出。$/u);
});

test("export-safe section text blocks manual edits until reverified", () => {
  const text = exportSafeReportSectionText({
    sectionId: "discussion",
    title: "分析與討論",
    body: "使用者新增的外推句尚未通過 verifier。",
    groundingStatus: "unsupported",
    generationMethod: "needs_manual_review",
    evidenceCardIds: ["evidence-1"],
    warnings: ["needs_manual_review"],
  });

  assert.match(text, /手動編輯|尚未重新通過 verifier|不輸出正式段落/);
  assert.doesNotMatch(text, /^使用者新增的外推句/u);
});
