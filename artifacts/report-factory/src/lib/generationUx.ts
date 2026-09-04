import type { ReportPlan, ReportSectionPlan } from "@workspace/api-zod";

export type GenerationRunState =
  | "idle"
  | "validating_evidence"
  | "planning"
  | "drafting"
  | "validating_output"
  | "saving"
  | "completed"
  | "failed";

export type GenerationStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "warning"
  | "failed"
  | "blocked";

export type GenerationStageId =
  | "evidence_gate"
  | "report_plan"
  | "writer_request"
  | "output_validation"
  | "workspace_save";

export interface GenerationStageView {
  id: GenerationStageId;
  name: string;
  explanation: string;
  status: GenerationStageStatus;
}

export interface GenerationFailure {
  code:
    | "NO_ACCEPTED_SOURCES"
    | "INSUFFICIENT_EVIDENCE"
    | "VALIDATION_FAILED"
    | "NETWORK_ERROR"
    | "GENERATION_FAILED"
    | "UNKNOWN_ERROR";
  stage: GenerationStageId;
  title: string;
  message: string;
  retainedState: string;
  action: string;
}

const STAGE_ORDER: GenerationStageId[] = [
  "evidence_gate",
  "report_plan",
  "writer_request",
  "output_validation",
  "workspace_save",
];

const STAGE_COPY: Record<GenerationStageId, Omit<GenerationStageView, "id" | "status">> = {
  evidence_gate: {
    name: "確認已接受證據",
    explanation: "檢查來源、Evidence Card 與工作流程身分是否可進入生成。",
  },
  report_plan: {
    name: "建立報告計畫",
    explanation: "使用 canonical Evidence Card 建立章節與 claim 綁定。",
  },
  writer_request: {
    name: "生成證據約束草稿",
    explanation: "把已接受證據與計畫送入現有 Report Writer。",
  },
  output_validation: {
    name: "對齊引用與驗證",
    explanation: "讀取 writer 回傳的 grounding、citation 與 formal validation 結果。",
  },
  workspace_save: {
    name: "保存報告工作區",
    explanation: "保存 reportId、workflowId、topicHash 與可恢復的報告快照。",
  },
};

function activeStageForState(state: GenerationRunState): GenerationStageId | null {
  switch (state) {
    case "validating_evidence":
      return "evidence_gate";
    case "planning":
      return "report_plan";
    case "drafting":
      return "writer_request";
    case "validating_output":
      return "output_validation";
    case "saving":
      return "workspace_save";
    default:
      return null;
  }
}

export function generationStages(input: {
  state: GenerationRunState;
  evidenceReady: boolean;
  failedStage?: GenerationStageId | null;
  validationWarning?: boolean;
}): GenerationStageView[] {
  const activeStage = activeStageForState(input.state);
  const activeIndex = activeStage ? STAGE_ORDER.indexOf(activeStage) : -1;
  const failedIndex = input.failedStage ? STAGE_ORDER.indexOf(input.failedStage) : -1;

  return STAGE_ORDER.map((id, index) => {
    let status: GenerationStageStatus = "pending";
    if (input.state === "idle") {
      status = id === "evidence_gate" && !input.evidenceReady ? "blocked" : "pending";
    } else if (input.state === "completed") {
      status = id === "output_validation" && input.validationWarning
        ? "warning"
        : "completed";
    } else if (input.state === "failed") {
      status = index < failedIndex
        ? "completed"
        : index === failedIndex
          ? "failed"
          : "pending";
    } else if (index < activeIndex) {
      status = "completed";
    } else if (index === activeIndex) {
      status = "running";
    }

    return { id, ...STAGE_COPY[id], status };
  });
}

function cleanMessage(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function mapGenerationFailure(error: unknown): GenerationFailure {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const message = cleanMessage(raw);
  if (/no accepted|accepted source|已接受來源|來源不足/iu.test(message)) {
    return {
      code: "NO_ACCEPTED_SOURCES",
      stage: "evidence_gate",
      title: "沒有可用的已接受來源",
      message: message || "至少需要一筆已接受且可核對的來源。",
      retainedState: "主題、搜尋結果與來源審查狀態均已保留。",
      action: "返回來源審查，接受可用來源後重試。",
    };
  }
  if (/evidence|證據|citation|引用/iu.test(message)) {
    return {
      code: "INSUFFICIENT_EVIDENCE",
      stage: "evidence_gate",
      title: "證據尚不足以生成",
      message: message || "Evidence Card 尚未通過生成門檻。",
      retainedState: "主題、來源與目前計畫均已保留。",
      action: "補充或重新審查證據，再從本階段重試。",
    };
  }
  if (/validation|integrity|checkpoint|驗證|完整性/iu.test(message)) {
    return {
      code: "VALIDATION_FAILED",
      stage: "output_validation",
      title: "輸出驗證未通過",
      message: message || "草稿已回傳，但引用或完整性驗證未通過。",
      retainedState: "已接受來源、Evidence Card 與草稿內容均已保留。",
      action: "檢視驗證原因並重新生成；正式匯出會維持阻擋。",
    };
  }
  if (/fetch|network|timeout|timed out|ECONN|網路|連線|逾時/iu.test(message)) {
    return {
      code: "NETWORK_ERROR",
      stage: "writer_request",
      title: "生成服務連線失敗",
      message: message || "Report Writer 暫時無法連線。",
      retainedState: "主題、來源、證據與報告計畫均已保留。",
      action: "服務恢復後可直接重試生成，不必重新搜尋。",
    };
  }
  if (message) {
    return {
      code: "GENERATION_FAILED",
      stage: "writer_request",
      title: "報告生成未完成",
      message,
      retainedState: "主題、來源、證據與報告計畫均已保留。",
      action: "確認模型服務狀態後，從生成階段重試。",
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    stage: "writer_request",
    title: "報告生成未完成",
    message: "發生未分類錯誤。",
    retainedState: "主題、來源、證據與報告計畫均已保留。",
    action: "請重試；若仍失敗，保留目前工作區並檢查服務紀錄。",
  };
}

function customSection(sectionId: string, title: string): ReportSectionPlan {
  return {
    sectionId,
    title,
    goal: "使用者新增章節；只有在 canonical Evidence Card 可支撐時才生成內容。",
    requiredEvidenceTypes: [],
    evidenceCardIds: [],
    plannedClaimIds: [],
    sectionRole: "custom_user_section",
    sectionPurpose: "使用者自訂研究段落。",
    limitations: ["此自訂章節目前沒有 canonical Evidence Card 綁定，可能被輸出驗證阻擋。"],
  };
}

export function applyUserOutlineToReportPlan(
  reportPlan: ReportPlan,
  outline: Array<{ sectionId: string; title: string }> | undefined,
): ReportPlan {
  const requested = (outline ?? [])
    .map((section) => ({
      sectionId: cleanMessage(section.sectionId),
      title: cleanMessage(section.title),
    }))
    .filter((section) => section.sectionId && section.title);
  if (requested.length === 0) return reportPlan;

  const existingById = new Map(
    reportPlan.sections.map((section) => [section.sectionId, section] as const),
  );
  const seen = new Set<string>();
  const editedSections = requested
    .filter((section) => {
      if (seen.has(section.sectionId)) return false;
      seen.add(section.sectionId);
      return true;
    })
    .map((section) => {
      const existing = existingById.get(section.sectionId);
      return existing
        ? { ...existing, title: section.title }
        : customSection(section.sectionId, section.title);
    });
  const references = reportPlan.sections.filter(
    (section) =>
      section.canonicalSectionRole === "references" &&
      !seen.has(section.sectionId),
  );
  const retainedSectionIds = new Set(
    [...editedSections, ...references].map((section) => section.sectionId),
  );
  const removedSectionIds = reportPlan.sections
    .map((section) => section.sectionId)
    .filter((sectionId) => !retainedSectionIds.has(sectionId));
  const customSectionTitles = editedSections
    .filter((section) => !existingById.has(section.sectionId))
    .map((section) => section.title);

  return {
    ...reportPlan,
    sections: [...editedSections, ...references],
    plannedClaims: reportPlan.plannedClaims.filter((claim) =>
      retainedSectionIds.has(claim.sectionId),
    ),
    evidenceGaps: Array.from(new Set([
      ...reportPlan.evidenceGaps,
      ...removedSectionIds.map((sectionId) => `使用者從生成計畫移除章節：${sectionId}`),
      ...customSectionTitles.map((title) => `自訂章節「${title}」尚無 canonical Evidence Card 綁定。`),
    ])),
  };
}
