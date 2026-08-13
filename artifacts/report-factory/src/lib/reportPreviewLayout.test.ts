import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { resizeTextareaToContent } from "../components/ui/auto-resize-textarea.tsx";
import {
  degradedLlmReason,
  formalExportBlockReasons,
  previewLlmStatus,
} from "./reportPreviewStatus.ts";

const previewSource = readFileSync(new URL("../pages/report-preview.tsx", import.meta.url), "utf8");

test("report preview uses the canonical formal document for rendering and export readiness", () => {
  assert.match(previewSource, /buildDetailedReportParagraphs\(workspace\)/u);
  assert.match(previewSource, /formalReportDocument\.integrity\.status !== "pass"/u);
  assert.match(previewSource, /data-testid="preview-detailed-report"/u);
});

test("formal preview preserves ordered evidence content and uses reader-facing citation typography", () => {
  assert.match(previewSource, /paragraph\.orderedContent\.map/u);
  assert.match(previewSource, /node\.nodeType === "table"/u);
  assert.match(previewSource, /node\.nodeType === "figure"/u);
  assert.match(previewSource, /textIndent: "2em"/u);
  assert.match(previewSource, /citationReaderLabel\(citation\)/u);
  assert.doesNotMatch(previewSource, />本節使用來源</u);
});

test("preview renders all semanticData families and canonical bilingual metadata", () => {
  for (const kind of [
    "proportion_facets",
    "forest_plot",
    "correlation_structure",
    "mediation_path",
    "evidence_coverage",
    "applicability_boundary",
  ]) {
    assert.match(previewSource, new RegExp(`semantic\\?\\.kind === "${kind}"`, "u"));
  }
  assert.match(previewSource, /preview-report-subtitle/u);
  assert.match(previewSource, /preview-report-keywords/u);
  assert.match(previewSource, /REPORT_CJK_FONT_STACK/u);
  assert.match(previewSource, /node\.citationSegments\?\.length/u);
});

function textareaMetrics(scrollHeight: number) {
  return {
    clientHeight: 58,
    offsetHeight: 60,
    scrollHeight,
    style: {
      height: "",
      overflowY: "",
    },
  };
}

test("report preview textarea follows measured content height instead of estimated character rows", () => {
  const textarea = textareaMetrics(184);

  resizeTextareaToContent(textarea, 360);

  assert.equal(textarea.style.height, "186px");
  assert.equal(textarea.style.overflowY, "hidden");
});

test("report preview textarea caps very long content and remains scrollable", () => {
  const textarea = textareaMetrics(680);

  resizeTextareaToContent(textarea, 360);

  assert.equal(textarea.style.height, "360px");
  assert.equal(textarea.style.overflowY, "auto");
});

test("degraded preview banner prefers failure context and suppresses a completed status message", () => {
  assert.equal(
    degradedLlmReason({
      fallbackReason: "模型回應逾時，已改用本地草稿。",
      warning: "已保留可編輯內容。",
      message: "LLM report generation completed.",
    }),
    "模型回應逾時，已改用本地草稿。",
  );
  assert.equal(
    degradedLlmReason({ message: "LLM report generation completed." }),
    "",
  );
});

test("preview LLM status treats completed model sections with scoped repair as partial strengthening", () => {
  const status = previewLlmStatus({
    reportGenerationStatus: "success",
    fallbackUsed: false,
    degradedMode: true,
    warning: "very long internal diagnostics that should not be rendered in the banner",
    writerDiagnostics: {
      requestedSections: 8,
      completedSections: 8,
      modelCompletedSections: 8,
      repairedSections: 1,
      fallbackSections: 0,
    },
  });

  assert.equal(status.kind, "partial");
  assert.equal(status.label, "部分章節已保守補強");
  assert.match(status.message, /8\/8 個模型章節/);
  assert.match(status.message, /1 節經受控 repair/);
  assert.doesNotMatch(status.message, /very long internal diagnostics/);
});

test("preview LLM status keeps failure reasons concise", () => {
  const status = previewLlmStatus({
    reportGenerationStatus: "timeout",
    fallbackUsed: true,
    warning: `${"逾時診斷".repeat(40)} | additional internal detail`,
  });

  assert.equal(status.kind, "preserved");
  assert.ok(status.message.length < 180);
  assert.doesNotMatch(status.message, /additional internal detail/);
});

test("formal export blocks full-report section fallback even when the top-level writer status is success", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: true,
      degradedMode: true,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_complete_report",
      evidenceSetHash: "a".repeat(64),
      writerEvidenceSetHash: "a".repeat(64),
      filteredAfterPlanCount: 0,
      writerDiagnostics: {
        requestedSections: 8,
        completedSections: 8,
        modelCompletedSections: 7,
        repairedSections: 0,
        fallbackSections: 1,
        fallbackSectionIds: ["conclusion"],
      },
    },
  });

  assert.match(reasons.join(" "), /fallback.*conclusion/u);
});

test("post_edit_validation_blocks_formal_output", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: false,
      degradedMode: false,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_limited_report",
      evidenceSetHash: "p".repeat(64),
      writerEvidenceSetHash: "p".repeat(64),
      filteredAfterPlanCount: 0,
      writerDiagnostics: {
        requestedSections: 1,
        completedSections: 1,
        modelCompletedSections: 1,
        repairedSections: 0,
        fallbackSections: 0,
        postEditValidation: {
          status: "blocked",
          issues: ["CLAIM_CITATION_NOT_ENTAILED:findings:p-1:source-2"],
        },
      },
    },
  });

  assert.match(reasons.join(" "), /post-edit.*阻擋/u);
});

test("formal export ignores unused full-report fallback sections for a canonical Limited Brief", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: true,
      degradedMode: true,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_limited_report",
      evidenceSetHash: "l".repeat(64),
      writerEvidenceSetHash: "l".repeat(64),
      filteredAfterPlanCount: 0,
      writerDiagnostics: {
        requestedSections: 8,
        completedSections: 8,
        modelCompletedSections: 5,
        repairedSections: 0,
        fallbackSections: 3,
        fallbackSectionIds: ["introduction", "literature_review", "discussion"],
      },
    },
  });

  assert.deepEqual(reasons, []);
});

test("formal export remains available only for a complete plan with no section review", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: false,
      degradedMode: false,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_limited_report",
      evidenceSetHash: "b".repeat(64),
      writerEvidenceSetHash: "b".repeat(64),
      filteredAfterPlanCount: 0,
      writerDiagnostics: {
        requestedSections: 8,
        completedSections: 8,
        modelCompletedSections: 8,
        repairedSections: 0,
        fallbackSections: 0,
      },
    },
  });

  assert.deepEqual(reasons, []);
});

test("degraded complete-report evidence can never satisfy the formal export gate", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: false,
      degradedMode: true,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_complete_report",
      evidenceSetHash: "c".repeat(64),
      writerEvidenceSetHash: "c".repeat(64),
      filteredAfterPlanCount: 0,
      writerDiagnostics: {
        requestedSections: 8,
        completedSections: 8,
        modelCompletedSections: 8,
        repairedSections: 1,
        fallbackSections: 0,
      },
    },
  });

  assert.match(reasons.join(" "), /ready_complete_report.*degraded/u);
});

test("planner-writer evidence hash mismatch blocks formal export even when all sections completed", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: false,
      degradedMode: false,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_limited_report",
      evidenceSetHash: "d".repeat(64),
      writerEvidenceSetHash: "e".repeat(64),
      filteredAfterPlanCount: 0,
      writerDiagnostics: {
        requestedSections: 8,
        completedSections: 8,
        modelCompletedSections: 8,
        repairedSections: 0,
        fallbackSections: 0,
      },
    },
  });

  assert.match(reasons.join(" "), /hash/iu);
});

test("formal export audit ignores English bibliography under the product's 參考資料 heading", () => {
  const reasons = formalExportBlockReasons({
    citationExportBlocked: false,
    sectionRequiresReview: false,
    diagnostics: {
      reportGenerationStatus: "success",
      fallbackUsed: false,
      degradedMode: false,
      reportPlanStatus: "plan_built",
      readinessStatus: "ready_limited_report",
      evidenceSetHash: "f".repeat(64),
      writerEvidenceSetHash: "f".repeat(64),
      filteredAfterPlanCount: 0,
    },
    sections: [
      { sectionId: "findings", title: "主要發現", body: "模型研究可作為綜述研究的候選線索[S1]。" },
      { sectionId: "references", title: "參考資料", body: "[S1] Example Author. A very long English bibliography title about computational models and evidence synthesis." },
    ],
  });

  assert.deepEqual(reasons, []);
});
