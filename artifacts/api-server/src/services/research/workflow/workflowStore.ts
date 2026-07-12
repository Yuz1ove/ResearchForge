import type {
  ParsedDocument,
  ResearchEvidenceCard,
  ResearchQueryPlan,
  ResearchReportParagraph,
  NormalizedSource,
} from "@workspace/api-zod/research-tools";

type WorkflowSnapshot = {
  queryPlan?: ResearchQueryPlan;
  candidateSources?: NormalizedSource[];
  acceptedSources?: NormalizedSource[];
  parsedDocuments?: ParsedDocument[];
  evidenceCards?: ResearchEvidenceCard[];
  reportParagraphs?: ResearchReportParagraph[];
  updatedAt: string;
};

const workflowStore = new Map<string, WorkflowSnapshot>();

function ensureWorkflow(workflowId: string): WorkflowSnapshot {
  const existing = workflowStore.get(workflowId);
  if (existing) return existing;
  const created: WorkflowSnapshot = { updatedAt: new Date().toISOString() };
  workflowStore.set(workflowId, created);
  return created;
}

export function readWorkflowSnapshot(workflowId: string): WorkflowSnapshot | null {
  return workflowStore.get(workflowId) ?? null;
}

export function writeWorkflowSnapshot(
  workflowId: string,
  patch: Partial<WorkflowSnapshot>,
): WorkflowSnapshot {
  const next = {
    ...ensureWorkflow(workflowId),
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  workflowStore.set(workflowId, next);
  return next;
}

export function clearWorkflowSnapshot(workflowId: string): void {
  workflowStore.delete(workflowId);
}
