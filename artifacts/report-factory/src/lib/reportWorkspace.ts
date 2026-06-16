import {
  buildBibliography,
  type SourceRecord,
} from "./sourceRecords.ts";
import { buildEvidenceCards } from "./evidenceCards.ts";
import { buildReportDraft, type ReportDraft } from "./reportDraft.ts";
import { buildReportOutline, type ReportOutline } from "./reportOutline.ts";
import {
  buildAcceptedSourceDigest,
  type AcceptedSourceDigest,
} from "./sourceDigest.ts";
import {
  generateReport,
  type GeneratedReport,
  type ReportInput,
  type TopicCategory,
} from "./generateReport.ts";

export type ReportGenerationMode = "blocked" | "quick_draft" | "full_report";

export interface GenerationReadiness {
  acceptedSourceCount: number;
  mode: ReportGenerationMode;
  canGenerate: boolean;
  canGenerateFull: boolean;
  warning: string | null;
  buttonLabel: string;
  progressLabel: string;
}

export interface GeneratorWorkflowVisibility {
  showEvidenceCards: boolean;
  showTechnicalLogs: boolean;
}

export type ReportWorkspaceOutline = ReportOutline;

export type ReportWorkspaceDraft = ReportDraft;

export interface ReportWorkspace {
  id: string;
  createdAt: string;
  updatedAt: string;
  generationMode: Exclude<ReportGenerationMode, "blocked">;
  input: ReportInput;
  acceptedSources: SourceRecord[];
  acceptedSourceDigest: AcceptedSourceDigest;
  report: GeneratedReport;
  outline: ReportWorkspaceOutline;
  draft: ReportWorkspaceDraft;
}

export interface ReportWorkspaceNavigationResult {
  workspace: ReportWorkspace;
  path: string;
}

export interface StartReportWorkspaceNavigationOptions {
  input: ReportInput;
  acceptedSources: SourceRecord[];
  existingReportId?: string | null;
  navigate: (path: string) => void;
  saveWorkspace?: (workspace: ReportWorkspace) => void;
}

const STORAGE_KEY = "researchforge:report-workspaces:v1";

function nowIso(): string {
  return new Date().toISOString();
}

function createReportId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `rf-${Date.now().toString(36)}-${randomPart}`;
}

export function reportWorkspacePath(reportId: string): string {
  return `/reports/${encodeURIComponent(reportId)}`;
}

export function generationReadiness(acceptedSourceCount: number): GenerationReadiness {
  if (acceptedSourceCount < 5) {
    return {
      acceptedSourceCount,
      mode: "blocked",
      canGenerate: false,
      canGenerateFull: false,
      warning: "已接受來源少於 5 筆，請先補足可信來源後再生成報告。",
      buttonLabel: "來源不足，至少接受 5 筆",
      progressLabel: "等待來源審查",
    };
  }

  if (acceptedSourceCount < 10) {
    return {
      acceptedSourceCount,
      mode: "quick_draft",
      canGenerate: true,
      canGenerateFull: false,
      warning: "來源少於 10 筆，報告證據鏈可能不完整。",
      buttonLabel: "生成簡版草稿",
      progressLabel: "正在建立簡版草稿工作區",
    };
  }

  return {
    acceptedSourceCount,
    mode: "full_report",
    canGenerate: true,
    canGenerateFull: true,
    warning: null,
    buttonLabel: "生成完整報告",
    progressLabel: "正在建立完整報告工作區",
  };
}

export function generatorWorkflowVisibility(developerDebugOpen: boolean): GeneratorWorkflowVisibility {
  return {
    showEvidenceCards: developerDebugOpen,
    showTechnicalLogs: developerDebugOpen,
  };
}

function buildWorkspaceParts(input: ReportInput, acceptedSources: SourceRecord[]) {
  const report = generateReport({
    ...input,
    acceptedSources,
  });
  const evidenceCards = buildEvidenceCards(acceptedSources, [], { resetText: true });
  const acceptedSourceDigest = buildAcceptedSourceDigest(acceptedSources, {
    topic: input.topic,
  });
  const outline = buildReportOutline({
    topic: input.topic,
    reportType: input.reportType,
    audience: input.targetAudience || input.academicLevel,
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    topic: input.topic,
    reportType: input.reportType,
    audience: input.targetAudience || input.academicLevel,
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: input.citationFormat,
  });

  return { report, outline, draft, acceptedSourceDigest };
}

export function createReportWorkspace(
  input: ReportInput,
  acceptedSources: SourceRecord[],
  mode: Exclude<ReportGenerationMode, "blocked">,
  id = createReportId(),
): ReportWorkspace {
  const timestamp = nowIso();
  const effectiveInput: ReportInput = {
    ...input,
    acceptedSources,
    mode: mode === "quick_draft" ? "先建立報告架構" : input.mode,
  };
  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    generationMode: mode,
    input: effectiveInput,
    acceptedSources,
    ...buildWorkspaceParts(effectiveInput, acceptedSources),
  };
}

export function startReportWorkspaceNavigation({
  input,
  acceptedSources,
  existingReportId,
  navigate,
  saveWorkspace = saveReportWorkspace,
}: StartReportWorkspaceNavigationOptions): ReportWorkspaceNavigationResult | null {
  const readiness = generationReadiness(acceptedSources.length);
  if (!readiness.canGenerate) return null;

  const workspace = createReportWorkspace(
    input,
    acceptedSources,
    readiness.mode === "quick_draft" ? "quick_draft" : "full_report",
    existingReportId ?? undefined,
  );
  const path = reportWorkspacePath(workspace.id);

  saveWorkspace(workspace);
  navigate(path);

  return { workspace, path };
}

export function regenerateReportWorkspace(workspace: ReportWorkspace): ReportWorkspace {
  return {
    ...workspace,
    updatedAt: nowIso(),
    ...buildWorkspaceParts(workspace.input, workspace.acceptedSources),
  };
}

function parseStoredWorkspaces(raw: string | null): Record<string, ReportWorkspace> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, ReportWorkspace>;
    }
  } catch {
    return {};
  }
  return {};
}

export function saveReportWorkspace(workspace: ReportWorkspace): void {
  if (typeof window === "undefined") return;
  const workspaces = parseStoredWorkspaces(window.localStorage.getItem(STORAGE_KEY));
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...workspaces,
      [workspace.id]: workspace,
    }),
  );
}

export function loadReportWorkspace(reportId: string): ReportWorkspace | null {
  if (typeof window === "undefined") return null;
  return parseStoredWorkspaces(window.localStorage.getItem(STORAGE_KEY))[reportId] ?? null;
}

export function workspaceToGeneratedReport(workspace: ReportWorkspace, category: TopicCategory): GeneratedReport {
  return {
    ...workspace.report,
    meta: {
      ...workspace.report.meta,
      category,
      acceptedSources: workspace.acceptedSources,
      bibliography: buildBibliography(workspace.acceptedSources, workspace.input.citationFormat),
    },
  };
}
