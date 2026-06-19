import assert from "node:assert/strict";
import test from "node:test";
import {
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
