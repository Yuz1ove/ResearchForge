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
  body?: string | null;
  prose?: string | null;
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
