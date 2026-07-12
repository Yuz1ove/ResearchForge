export type PreviewWorkflowContext = {
  workflowId?: string | null;
  topicHash?: string | null;
};

export type PreviewWorkspaceLike = {
  workflowId?: string | null;
  topicHash?: string | null;
  isConsistent?: boolean | null;
};

export type PreviewSectionLike = {
  sectionId?: string | null;
  title?: string | null;
  body?: string | null;
  prose?: string | null;
  groundingStatus?: "grounded" | "partially_grounded" | "unsupported" | string | null;
  generationMethod?: string | null;
  evidenceCardIds?: string[] | null;
  unsupportedSentences?: string[] | null;
  warnings?: string[] | null;
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function previewWorkspaceMatchesContext(
  workspace: PreviewWorkspaceLike,
  context: PreviewWorkflowContext,
): boolean {
  if (workspace.isConsistent === false) return false;
  if (context.workflowId && context.workflowId !== workspace.workflowId) return false;
  if (context.topicHash && context.topicHash !== workspace.topicHash) return false;
  return true;
}

export function visibleReportSectionText(section: PreviewSectionLike): string {
  return (
    cleanText(section.prose) ??
    cleanText(section.body) ??
    "目前已接受來源可支撐本段的背景與初步觀點，但對於在地案例、第一手統計或具體比較資料仍不足。因此，本報告暫以文獻整理與來源審查作為基礎，後續建議補充官方資料或實地調查資料。"
  );
}

export function sectionRequiresExportReview(section: PreviewSectionLike): boolean {
  if (section.sectionId === "title" || section.title === "標題") return false;
  if (section.generationMethod === "grounding_verifier_blocked") return true;
  if (section.generationMethod === "needs_manual_review") return true;
  if (section.generationMethod === "insufficient_evidence_notice") return true;
  if (section.groundingStatus === "unsupported") return true;
  if ((section.unsupportedSentences?.length ?? 0) > 0) return true;
  if (section.warnings?.includes("needs_manual_review")) return true;
  return (section.evidenceCardIds?.length ?? 0) === 0 &&
    section.generationMethod !== "title";
}

export function exportSafeReportSectionText(section: PreviewSectionLike): string {
  if (!sectionRequiresExportReview(section)) return visibleReportSectionText(section);
  const title = cleanText(section.title) ?? "本節";
  const unsupportedCount = section.unsupportedSentences?.filter(Boolean).length ?? 0;
  const reasons = [
    section.generationMethod === "grounding_verifier_blocked" ? "grounding verifier 已阻擋未支撐句子" : "",
    section.generationMethod === "insufficient_evidence_notice" ? "目前 evidence card 不足" : "",
    section.generationMethod === "needs_manual_review" ? "此段經手動編輯，尚未重新通過 verifier" : "",
    section.warnings?.includes("needs_manual_review") ? "引用仍需人工複核" : "",
    unsupportedCount > 0 ? `共有 ${unsupportedCount} 句未通過 supportSpan 對齊` : "",
  ].filter(Boolean);
  return `${title}目前不輸出正式段落。請補查可直接支撐正文句子的來源與 exact supportSpan，再重新生成或審查。${reasons.length ? `原因：${reasons.join("；")}。` : ""}`;
}
