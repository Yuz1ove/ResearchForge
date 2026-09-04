import type { ReportPlan, ReportReadinessStatus } from "@workspace/api-zod";

import {
  auditReportCoherence,
  auditReportLanguageAndArtifacts,
} from "./reportComposer.ts";

export interface PreviewLlmReasonDiagnostics {
  fallbackReason?: string | null;
  warning?: string | null;
  message?: string | null;
}

export interface PreviewLlmStatusDiagnostics extends PreviewLlmReasonDiagnostics {
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  degradedMode?: boolean;
  writerDiagnostics?: {
    requestedSections: number;
    completedSections: number;
    modelCompletedSections: number;
    repairedSections: number;
    fallbackSections: number;
    fallbackSectionIds?: string[];
    postEditValidation?: {
      status: "pass" | "blocked";
      issues: string[];
    };
  };
  reportPlanStatus?: "plan_built" | "complete" | "filtered" | "degraded_legacy";
  readinessStatus?: ReportReadinessStatus;
  evidenceSetHash?: string;
  writerEvidenceSetHash?: string;
  filteredAfterPlanCount?: number;
  formalResearchValidation?: unknown;
  formalResearchCheckpoint?: {
    contentIntegrityValidated?: boolean;
    resumeFrom?: "source_relevance_review" | "writer_generation" | "validation" | "export";
    safeToResume?: boolean;
  };
}

export interface PreviewLlmStatus {
  label: string;
  message: string;
  kind: "complete" | "partial" | "preserved" | "retry" | "skipped";
}

export interface FormalExportIntegrityInput {
  citationExportBlocked: boolean;
  sectionRequiresReview: boolean;
  diagnostics?: PreviewLlmStatusDiagnostics | null;
  sections?: Array<{
    sectionId?: string | null;
    title?: string | null;
    body?: string | null;
    prose?: string | null;
  }>;
  reportPlan?: ReportPlan | null;
}

/**
 * Formal formats fail closed on plan/evidence drift. Full reports also require
 * every writer section to be model-backed; a Limited Brief is composed from
 * the canonical evidence set and therefore does not depend on unused full-
 * report fallback sections.
 */
export function formalExportBlockReasons(
  input: FormalExportIntegrityInput,
): string[] {
  const reasons: string[] = [];
  const diagnostics = input.diagnostics;
  if (input.citationExportBlocked) {
    reasons.push("引用對應尚未通過完整性檢查。");
  }
  if (input.sectionRequiresReview) {
    reasons.push("至少一個核心章節仍缺少可正式提交的證據支撐。");
  }
  if (input.sections) {
    const audit = auditReportLanguageAndArtifacts(
      input.sections
        .map((section) => `## ${section.title ?? ""}\n${section.body ?? section.prose ?? ""}`)
        .join("\n\n"),
    );
    if (audit.internalArtifacts.length > 0) {
      reasons.push(`正文含內部雜訊：${audit.internalArtifacts.join("、")}。`);
    }
    if (audit.longEnglishSegments.length > 0) {
      reasons.push("正文含未正規化的長英文句段。");
    }
    if (audit.terminologyInconsistencies.length > 0) {
      reasons.push(`臺灣繁體中文術語不一致：${audit.terminologyInconsistencies.join("、")}。`);
    }
  }
  if (input.reportPlan) {
    const roles = new Set(input.reportPlan.discoursePlan?.map((section) => section.sectionRole));
    if (!input.reportPlan.argumentMap?.centralAnswer) {
      reasons.push("ArgumentMap 尚未建立 evidence-supported centralAnswer。");
    }
    const coreSections = input.reportPlan.sections.filter(
      (section) => section.canonicalSectionRole === "core_evidence",
    );
    if (
      coreSections.length === 0 ||
      coreSections.some((section) => section.evidenceCardIds.length === 0)
    ) {
      reasons.push("至少一個核心證據章沒有 canonical Evidence Card。" );
    }
    if (
      !roles.has("research_question_and_scope") ||
      !roles.has("cross_source_synthesis") ||
      !roles.has("limitations_and_gaps") ||
      !roles.has("direct_answer")
    ) {
      reasons.push("DiscoursePlan 尚未形成問題、分析、限制與結論的閉合結構。");
    }
    if (input.sections) {
      const coherence = auditReportCoherence({
        reportPlan: input.reportPlan,
        sections: input.sections,
      });
      if (!coherence.passed) {
        reasons.push(`全文連貫性檢查未通過：${coherence.issues.join("、")}。`);
      }
    }
  }
  if (!diagnostics) {
    reasons.push("缺少正式研究生成與驗證診斷。");
    return [...new Set(reasons)];
  }
  const formalValidation = diagnostics.formalResearchValidation;
  const formalValidationPassed =
    formalValidation !== null &&
    typeof formalValidation === "object" &&
    (formalValidation as { pass?: unknown }).pass === true;
  if (!formalValidationPassed) {
    reasons.push("正式研究 formal validation 尚未通過。");
  }
  if (diagnostics.formalResearchCheckpoint?.contentIntegrityValidated !== true) {
    reasons.push("正式研究 content-integrity checkpoint 尚未驗證。");
  }
  if (
    diagnostics.formalResearchCheckpoint?.resumeFrom !== "export" ||
    diagnostics.formalResearchCheckpoint?.safeToResume !== true
  ) {
    reasons.push("正式研究 checkpoint 尚未到達可安全匯出狀態。");
  }
  if (diagnostics.writerDiagnostics?.postEditValidation?.status === "blocked") {
    reasons.push("正文 post-edit 驗證未通過，正式輸出已阻擋。");
  }
  if (diagnostics.reportGenerationStatus !== "success") {
    reasons.push("模型報告生成尚未完整成功。");
  }
  if (diagnostics.reportPlanStatus !== "plan_built") {
    reasons.push("ReportPlan 尚未由 canonical WriterEvidenceSet 建立。" );
  }
  if (
    diagnostics.readinessStatus !== "ready_complete_report" &&
    diagnostics.readinessStatus !== "ready_limited_report"
  ) {
    reasons.push("報告 readiness 尚未允許正式匯出。" );
  }
  if (
    !diagnostics.evidenceSetHash ||
    !diagnostics.writerEvidenceSetHash ||
    diagnostics.evidenceSetHash !== diagnostics.writerEvidenceSetHash
  ) {
    reasons.push("Plan、Writer 與 export gate 的 evidenceSetHash 不一致。" );
  }
  if ((diagnostics.filteredAfterPlanCount ?? 0) !== 0) {
    reasons.push("ReportPlan 建立後仍有 Evidence Card 被過濾。" );
  }
  if (
    diagnostics.readinessStatus === "ready_complete_report" &&
    diagnostics.degradedMode
  ) {
    reasons.push("ready_complete_report 不得同時標示 degraded evidence。" );
  }
  const requiresCompleteWriterSections =
    diagnostics.readinessStatus === "ready_complete_report";
  if (
    requiresCompleteWriterSections &&
    (diagnostics.fallbackUsed ||
      (diagnostics.writerDiagnostics?.fallbackSections ?? 0) > 0)
  ) {
    const ids = diagnostics.writerDiagnostics?.fallbackSectionIds ?? [];
    reasons.push(
      ids.length > 0
        ? `核心章節 fallback：${ids.join("、")}。`
        : "至少一個核心章節使用 fallback。",
    );
  }
  if (
    requiresCompleteWriterSections &&
    diagnostics.degradedMode &&
    reasons.length === 0
  ) {
    reasons.push("目前報告仍處於降級生成狀態。");
  }
  return [...new Set(reasons)];
}

const COMPLETED_STATUS_MESSAGE = /^(?:llm\s+)?report generation completed[.!]?$/iu;

export function degradedLlmReason(
  diagnostics: PreviewLlmReasonDiagnostics,
): string {
  const candidates = [
    diagnostics.fallbackReason,
    diagnostics.warning,
    diagnostics.message,
  ];

  return (
    candidates
      .map((candidate) => candidate?.trim() ?? "")
      .find((candidate) => candidate && !COMPLETED_STATUS_MESSAGE.test(candidate)) ?? ""
  );
}

function conciseLlmReason(diagnostics: PreviewLlmReasonDiagnostics): string {
  const reason = degradedLlmReason(diagnostics).replace(/\s+/gu, " ").trim();
  if (!reason) return "";
  const firstDiagnostic = reason.split(/\s+\|\s+|\n/gu)[0]?.trim() ?? "";
  const concise = firstDiagnostic.length > 96
    ? `${firstDiagnostic.slice(0, 96).trimEnd()}…`
    : firstDiagnostic;
  return concise ? `原因：${concise}` : "";
}

export function previewLlmStatus(
  diagnostics: PreviewLlmStatusDiagnostics,
): PreviewLlmStatus {
  const writer = diagnostics.writerDiagnostics;
  const hasSectionRecovery =
    diagnostics.reportGenerationStatus === "success" &&
    (writer?.modelCompletedSections ?? 0) > 0 &&
    ((writer?.repairedSections ?? 0) > 0 ||
      (writer?.fallbackSections ?? 0) > 0 ||
      diagnostics.degradedMode === true);

  if (hasSectionRecovery && writer) {
    const details = [
      `已完成 ${writer.modelCompletedSections}/${writer.requestedSections} 個模型章節`,
      writer.repairedSections > 0
        ? `${writer.repairedSections} 節經受控 repair`
        : null,
      writer.fallbackSections > 0
        ? `${writer.fallbackSections} 節使用可追溯的保守草稿`
        : null,
    ].filter(Boolean);
    return {
      label: "部分章節已保守補強",
      message: `${details.join("；")}。證據限制與完整診斷已保留，輸出前請檢視章節標記。`,
      kind: "partial",
    };
  }

  const degraded =
    diagnostics.fallbackUsed ||
    diagnostics.degradedMode ||
    diagnostics.reportGenerationStatus !== "success";
  if (!degraded) {
    return {
      label: "AI 強化完成",
      message: "已使用伺服器端模型依已接受來源生成自然段落。",
      kind: "complete",
    };
  }

  const reason = conciseLlmReason(diagnostics);
  const reasonSuffix = reason ? ` ${reason}` : "";
  if (diagnostics.reportGenerationStatus === "timeout") {
    return {
      label: "已保留草稿",
      message: `本次 AI 強化逾時，但可編修草稿與來源依據都已保留。${reasonSuffix}`,
      kind: "preserved",
    };
  }
  if (diagnostics.reportGenerationStatus === "quota_exceeded") {
    return {
      label: "稍後再試",
      message: `本次 AI 強化暫時不可用，但草稿已保留，可先直接編修。${reasonSuffix}`,
      kind: "retry",
    };
  }
  if (diagnostics.reportGenerationStatus === "skipped") {
    return {
      label: "沿用現有草稿",
      message: `目前沿用可編修草稿，尚未額外套用 AI 強化。${reasonSuffix}`,
      kind: "skipped",
    };
  }
  return {
    label: "已保留草稿",
    message: `本次 AI 強化未完成，但草稿與來源依據已保留，可直接編修。${reasonSuffix}`,
    kind: "preserved",
  };
}
