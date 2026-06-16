import {
  buildBibliography,
  normalizeUsableSections,
  type SourceRecord,
} from "./sourceRecords.ts";
import { buildEvidenceCards } from "./evidenceCards.ts";
import { buildReportDraft, type ReportDraft } from "./reportDraft.ts";
import { buildReportOutline, type ReportOutline } from "./reportOutline.ts";
import {
  buildAcceptedSourceDigest,
  type AcceptedSourceDigest,
} from "./sourceDigest.ts";
import { sourceHasUsableAbstract } from "./sourceSummaries.ts";
import {
  generateReport,
  type GeneratedReport,
  type ReportInput,
  type TopicCategory,
} from "./generateReport.ts";

export type ReportGenerationMode = "blocked" | "quick_draft" | "full_report";

export interface GenerationReadiness {
  acceptedSourceCount: number;
  relevantSourceCount: number;
  usableSummaryCount: number;
  coverageCount: number;
  lowQualityAcceptedCount: number;
  mode: ReportGenerationMode;
  canGenerate: boolean;
  canGenerateFull: boolean;
  warning: string | null;
  diagnostics: string[];
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

function readinessSources(input: number | SourceRecord[]): SourceRecord[] {
  if (typeof input === "number") {
    return Array.from({ length: input }, (_, index) => ({
      id: `synthetic-${index}`,
      title: `Synthetic source ${index}`,
      authors: ["Unknown"],
      year: new Date().getFullYear(),
      abstract: "Synthetic summary for legacy readiness count.",
      doi: `10.1000/synthetic-${index}`,
      url: `https://doi.org/10.1000/synthetic-${index}`,
      sourceType: "Crossref",
      reviewState: "accepted",
      publisher: "Synthetic",
      containerTitle: "Synthetic Journal",
      accessedAt: null,
      relevanceLevel: "high",
      usableSections: ["研究背景", "文獻探討", "數據分析"],
    }));
  }
  return input;
}

function readinessDiagnostics(sources: SourceRecord[]) {
  const acceptedSourceCount = sources.length;
  const relevantSourceCount = sources.filter((source) => source.relevanceLevel === "high" || source.relevanceLevel === "medium" || !source.relevanceLevel).length;
  const usableSummaryCount = sources.filter(sourceHasUsableAbstract).length;
  const coverage = new Set(sources.flatMap((source) => normalizeUsableSections(source.usableSections)));
  const lowQualityAcceptedCount = sources.filter((source) => source.relevanceLevel === "low" || source.relevanceLevel === "off_topic").length;

  return {
    acceptedSourceCount,
    relevantSourceCount,
    usableSummaryCount,
    coverageCount: coverage.size,
    lowQualityAcceptedCount,
  };
}

function diagnosticMessages(diagnostics: ReturnType<typeof readinessDiagnostics>, full = false): string[] {
  const messages: string[] = [];
  const requiredAccepted = full ? 8 : 3;
  const requiredRelevant = full ? 5 : 2;
  const requiredSummaries = full ? 4 : 1;
  const requiredCoverage = full ? 2 : 1;

  if (diagnostics.acceptedSourceCount < requiredAccepted) messages.push(`已接受來源需至少 ${requiredAccepted} 筆`);
  if (diagnostics.relevantSourceCount < requiredRelevant) messages.push(`medium/high 相關來源需至少 ${requiredRelevant} 筆`);
  if (diagnostics.usableSummaryCount < requiredSummaries) messages.push(`可用摘要來源需至少 ${requiredSummaries} 筆`);
  if (diagnostics.coverageCount < requiredCoverage) messages.push(`來源 coverage 需至少涵蓋 ${requiredCoverage} 個章節面向`);
  if (diagnostics.lowQualityAcceptedCount > 0) messages.push("已有低相關或離題來源被接受，建議先取消接受");
  return messages;
}

export function generationReadiness(input: number | SourceRecord[]): GenerationReadiness {
  const sources = readinessSources(input);
  const diagnostics = readinessDiagnostics(sources);
  const diagnosticList = diagnosticMessages(diagnostics, false);
  const fullDiagnosticList = diagnosticMessages(diagnostics, true);

  if (diagnosticList.length > 0) {
    return {
      ...diagnostics,
      mode: "blocked",
      canGenerate: false,
      canGenerateFull: false,
      warning: `來源品質不足：${diagnosticList.join("、")}。`,
      diagnostics: diagnosticList,
      buttonLabel: "來源品質不足",
      progressLabel: "等待來源審查",
    };
  }

  if (fullDiagnosticList.length > 0) {
    return {
      ...diagnostics,
      mode: "quick_draft",
      canGenerate: true,
      canGenerateFull: false,
      warning: `尚未達完整報告門檻：${fullDiagnosticList.join("、")}。`,
      diagnostics: fullDiagnosticList,
      buttonLabel: "生成簡版草稿",
      progressLabel: "正在建立簡版草稿工作區",
    };
  }

  return {
    ...diagnostics,
    mode: "full_report",
    canGenerate: true,
    canGenerateFull: true,
    warning: null,
    diagnostics: [],
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
    acceptedSourceDigest,
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
  const readiness = generationReadiness(acceptedSources);
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
