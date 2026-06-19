import { buildBibliography, type SourceRecord } from "./sourceRecords.ts";
import { buildEvidenceCards, type EvidenceCard } from "./evidenceCards.ts";
import { buildReportDraft, type ReportDraft } from "./reportDraft.ts";
import { buildReportOutline, type ReportOutline } from "./reportOutline.ts";
import type { QualityReport, ResearchProject } from "./qualityJudge.ts";
import {
  buildAcceptedSourceDigest,
  type AcceptedSourceDigest,
} from "./sourceDigest.ts";
import {
  sourceHasUsableAbstract,
  sourceRecommendedSections,
} from "./sourceSummaries.ts";
import {
  generateReport,
  type GeneratedReport,
  type ReportInput,
  type TopicCategory,
} from "./generateReport.ts";

export type ReportGenerationMode = "blocked" | "quick_draft" | "full_report";

export interface GenerationReadiness {
  acceptedSourceCount: number;
  primarySourceCount: number;
  secondarySourceCount: number;
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
  workflowId: string;
  reportId: string;
  payloadVersion: 2;
  topicFingerprint: string;
  topicHash: string;
  sourceIds: string[];
  createdAt: string;
  updatedAt: string;
  generationMode: Exclude<ReportGenerationMode, "blocked">;
  input: ReportInput;
  acceptedSources: SourceRecord[];
  acceptedSourceDigest: AcceptedSourceDigest;
  report: GeneratedReport;
  outline: ReportWorkspaceOutline;
  draft: ReportWorkspaceDraft;
  project: ResearchProject;
  evidenceCards: EvidenceCard[];
  qualityReport: QualityReport;
}

export interface ReportWorkspaceNavigationResult {
  workspace: ReportWorkspace;
  path: string;
}

export interface StartReportWorkspaceNavigationOptions {
  input: ReportInput;
  acceptedSources: SourceRecord[];
  navigate: (path: string) => void;
  saveWorkspace?: (workspace: ReportWorkspace) => void;
}

const STORAGE_KEY = "researchforge:report-workspaces:v1";

export const RESEARCH_DEPTH_CONFIG = {
  quick: {
    label: "quick",
    recommendedSources: 5,
    minimumAcceptedSources: 3,
    fullReportSources: 5,
  },
  standard: {
    label: "standard",
    recommendedSources: 10,
    minimumAcceptedSources: 3,
    fullReportSources: 10,
  },
  deep: {
    label: "deep",
    recommendedSources: 12,
    minimumAcceptedSources: 5,
    fullReportSources: 10,
  },
} as const;

function nowIso(): string {
  return new Date().toISOString();
}

function researchDepth(
  input: Pick<ReportInput, "researchDepth" | "length">,
): ReportInput["researchDepth"] {
  if (
    input.researchDepth === "quick" ||
    input.researchDepth === "standard" ||
    input.researchDepth === "deep"
  ) {
    return input.researchDepth;
  }
  if (input.length === "深度研究") return "deep";
  if (input.length === "短版摘要") return "quick";
  return "standard";
}

function normalizeTopicFingerprintInput(topic: string): string {
  return topic
    .replace(/[「」"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stableHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function reportTopicFingerprint(topic: string): string {
  const normalized = normalizeTopicFingerprintInput(topic);
  return normalized ? stableHash(normalized) : "empty-topic";
}

export function workspaceMatchesTopic(
  workspace: ReportWorkspace,
  topic: string,
): boolean {
  const expected = reportTopicFingerprint(topic);
  const workspaceHash =
    workspace.topicHash ??
    workspace.topicFingerprint ??
    reportTopicFingerprint(workspace.input.topic);
  return workspaceHash === expected && workspace.input.topic.trim() === topic.trim();
}

function createReportId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `rf-${Date.now().toString(36)}-${randomPart}`;
}

function createWorkflowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `wf-${Date.now().toString(36)}-${randomPart}`;
}

function workflowIdForAcceptedSources(sources: SourceRecord[]): string {
  const workflowIds = Array.from(
    new Set(
      sources
        .map((source) => source.workflowId?.trim())
        .filter((workflowId): workflowId is string => Boolean(workflowId)),
    ),
  );
  return workflowIds.length === 1 ? workflowIds[0]! : createWorkflowId();
}

function queryPlanHashForAcceptedSources(
  sources: SourceRecord[],
  fallback: string,
): string {
  return (
    sources.find((source) => source.queryPlanHash?.trim())?.queryPlanHash ??
    fallback
  );
}

function bindSourcesToWorkspace(
  input: ReportInput,
  acceptedSources: SourceRecord[],
  workflowId: string,
  topicHash: string,
): SourceRecord[] {
  const queryPlanHash = queryPlanHashForAcceptedSources(acceptedSources, topicHash);
  return acceptedSources.map((source) => ({
    ...source,
    workflowId: source.workflowId ?? workflowId,
    topic: source.topic ?? input.topic,
    normalizedTopic: source.normalizedTopic ?? input.topic,
    topicHash: source.topicHash ?? topicHash,
    queryPlanHash: source.queryPlanHash ?? queryPlanHash,
  }));
}

export function reportSourceGuardDiagnostics(
  input: Pick<ReportInput, "topic">,
  acceptedSources: SourceRecord[],
): string[] {
  const expectedTopicHash = reportTopicFingerprint(input.topic);
  const workflowIds = new Set(
    acceptedSources
      .map((source) => source.workflowId?.trim())
      .filter((workflowId): workflowId is string => Boolean(workflowId)),
  );
  const messages: string[] = [];

  if (acceptedSources.length < 3) {
    messages.push("accepted_sources_below_minimum");
  }
  if (workflowIds.size > 1) {
    messages.push("workflow_mismatch");
  }
  if (
    acceptedSources.some(
      (source) => source.topicHash && source.topicHash !== expectedTopicHash,
    )
  ) {
    messages.push("topic_mismatch");
  }
  if (
    acceptedSources.some(
      (source) =>
        source.classification === "off_topic" ||
        source.classification === "trusted_but_off_topic" ||
        source.classification === "stale_topic" ||
        source.classification === "stale_workflow" ||
        source.relevanceLevel === "off_topic" ||
        (source.relevanceLevel !== "secondary" &&
          source.relevanceLevel !== "clue" &&
          typeof source.relevanceScore === "number" &&
          source.relevanceScore < 20),
    )
  ) {
    messages.push("low_topic_relevance");
  }

  return Array.from(new Set(messages));
}

function sourceIdsForWorkspace(sources: SourceRecord[]): string[] {
  return sources
    .map((source) =>
      source.id ||
      [source.sourceType, source.doi, source.url, source.title]
        .filter(Boolean)
        .join(":"),
    )
    .filter(Boolean);
}

export function workspaceSnapshotIsConsistent(workspace: ReportWorkspace): boolean {
  const topicHash = workspace.topicHash ?? workspace.topicFingerprint;
  const expectedTopicHash = reportTopicFingerprint(workspace.input.topic);
  const sourceIds = sourceIdsForWorkspace(workspace.acceptedSources);
  const savedSourceIds = workspace.sourceIds ?? [];
  const sourceIdSet = new Set(sourceIds);
  const sourcesMatchWorkflow = (workspace.acceptedSources ?? []).every(
    (source) =>
      source.workflowId === workspace.workflowId &&
      source.topicHash === topicHash,
  );
  const draftCitationIds = (workspace.draft?.sections ?? []).flatMap(
    (section) => section.citationIds ?? [],
  );

  return (
    workspace.payloadVersion === 2 &&
    Boolean(workspace.workflowId) &&
    (workspace.reportId ?? workspace.id) === workspace.id &&
    topicHash === expectedTopicHash &&
    sourcesMatchWorkflow &&
    savedSourceIds.length === sourceIds.length &&
    savedSourceIds.every((sourceId) => sourceIdSet.has(sourceId)) &&
    draftCitationIds.every((citationId) => sourceIdSet.has(citationId))
  );
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
      relevanceLevel: "primary",
      usableSections: ["研究背景", "文獻探討", "數據分析"],
    }));
  }
  return input;
}

function sourceHasUsableGrounding(source: SourceRecord): boolean {
  return (
    source.evidenceGrounding === "abstract_grounded" ||
    source.evidenceGrounding === "snippet_grounded" ||
    (!source.evidenceGrounding && sourceHasUsableAbstract(source))
  );
}

function readinessDiagnostics(sources: SourceRecord[]) {
  const acceptedSourceCount = sources.length;
  const primarySourceCount = sources.filter(
    (source) => source.relevanceLevel === "primary",
  ).length;
  const secondarySourceCount = sources.filter(
    (source) =>
      source.relevanceLevel === "secondary" ||
      source.relevanceLevel === "clue" ||
      (!source.relevanceLevel && sourceHasUsableGrounding(source)),
  ).length;
  const relevantSourceCount = sources.filter(
    (source) =>
      source.relevanceLevel === "primary" ||
      (source.relevanceLevel === "secondary" &&
        sourceHasUsableGrounding(source)) ||
      (!source.relevanceLevel && sourceHasUsableGrounding(source)),
  ).length;
  const usableSummaryCount = sources.filter(sourceHasUsableGrounding).length;
  const coverage = new Set(sources.flatMap(sourceRecommendedSections));
  const lowQualityAcceptedCount = sources.filter(
    (source) =>
      source.relevanceLevel === "low" ||
      source.relevanceLevel === "off_topic" ||
      source.evidenceGrounding === "metadata_only" ||
      source.evidenceGrounding === "insufficient",
  ).length;

  return {
    acceptedSourceCount,
    primarySourceCount,
    secondarySourceCount,
    relevantSourceCount,
    usableSummaryCount,
    coverageCount: coverage.size,
    lowQualityAcceptedCount,
  };
}

function diagnosticMessages(
  diagnostics: ReturnType<typeof readinessDiagnostics>,
  full = false,
  depth: ReportInput["researchDepth"] = "standard",
): string[] {
  const messages: string[] = [];
  const config = RESEARCH_DEPTH_CONFIG[depth];
  const requiredAccepted = full
    ? config.fullReportSources
    : config.minimumAcceptedSources;
  const requiredRelevant = full
    ? Math.min(5, config.fullReportSources)
    : Math.min(3, config.minimumAcceptedSources);
  const requiredSummaries = full ? 4 : 1;
  const requiredCoverage = full ? 2 : 1;

  if (diagnostics.acceptedSourceCount < requiredAccepted)
    messages.push(`已接受來源需至少 ${requiredAccepted} 筆`);
  if (diagnostics.primarySourceCount + diagnostics.secondarySourceCount < requiredRelevant) {
    messages.push(
      "目前主要／延伸來源不足。請重新搜尋或調整主題，至少需要 3 筆可驗證來源。",
    );
  }
  if (diagnostics.usableSummaryCount < requiredSummaries)
    messages.push(`可用摘要來源需至少 ${requiredSummaries} 筆`);
  if (diagnostics.coverageCount < requiredCoverage)
    messages.push(`來源 coverage 需至少涵蓋 ${requiredCoverage} 個章節面向`);
  if (diagnostics.lowQualityAcceptedCount > 0) {
    messages.push("系統找到多筆延伸或低相關來源，但它們不足以支撐本研究主題。");
  }
  return messages;
}

export function generationReadiness(
  input: number | SourceRecord[],
  depth: ReportInput["researchDepth"] = "standard",
): GenerationReadiness {
  const sources = readinessSources(input);
  const diagnostics = readinessDiagnostics(sources);
  const minimumUsableSources =
    diagnostics.primarySourceCount + diagnostics.secondarySourceCount;
  const preliminaryDiagnostics: string[] = [];
  if (diagnostics.acceptedSourceCount < RESEARCH_DEPTH_CONFIG[depth].minimumAcceptedSources) {
    preliminaryDiagnostics.push(
      `已接受來源需至少 ${RESEARCH_DEPTH_CONFIG[depth].minimumAcceptedSources} 筆`,
    );
  }
  if (minimumUsableSources < 3) {
    preliminaryDiagnostics.push(
      "目前主要／延伸來源不足。請重新搜尋或調整主題，至少需要 3 筆可驗證來源。",
    );
  }
  if (diagnostics.usableSummaryCount < 1) {
    preliminaryDiagnostics.push("可用摘要來源需至少 1 筆");
  }
  if (diagnostics.coverageCount < 1) {
    preliminaryDiagnostics.push("來源 coverage 需至少涵蓋 1 個章節面向");
  }
  if (diagnostics.lowQualityAcceptedCount > 0) {
    preliminaryDiagnostics.push(
      "系統找到多筆延伸或低相關來源，但它們不足以支撐本研究主題。",
    );
  }
  const fullDiagnosticList = diagnosticMessages(diagnostics, true, depth);

  if (preliminaryDiagnostics.length > 0) {
    return {
      ...diagnostics,
      mode: "blocked",
      canGenerate: false,
      canGenerateFull: false,
      warning: `來源品質不足：${preliminaryDiagnostics.join("、")}。`,
      diagnostics: preliminaryDiagnostics,
      buttonLabel: "來源品質不足",
      progressLabel: "等待來源審查",
    };
  }

  if (diagnostics.primarySourceCount < 3 || fullDiagnosticList.length > 0) {
    const secondaryOnlyWarning =
      diagnostics.primarySourceCount < 3
        ? [
            `主要來源僅 ${diagnostics.primarySourceCount} 筆；將以 ${diagnostics.secondarySourceCount} 筆延伸來源輔助生成初步報告，並標示主要來源不足。`,
          ]
        : [];
    return {
      ...diagnostics,
      mode: "quick_draft",
      canGenerate: true,
      canGenerateFull: false,
      warning: `尚未達完整報告門檻：${[
        ...secondaryOnlyWarning,
        ...fullDiagnosticList,
      ].join("、")}。`,
      diagnostics: [...secondaryOnlyWarning, ...fullDiagnosticList],
      buttonLabel: "生成初步報告",
      progressLabel: "正在建立初步報告工作區",
    };
  }

  return {
    ...diagnostics,
    mode: "full_report",
    canGenerate: true,
    canGenerateFull: true,
    warning: null,
    diagnostics: [],
    buttonLabel: "生成正式報告",
    progressLabel: "正在建立完整報告工作區",
  };
}

export function generatorWorkflowVisibility(
  developerDebugOpen: boolean,
): GeneratorWorkflowVisibility {
  return {
    showEvidenceCards: developerDebugOpen,
    showTechnicalLogs: developerDebugOpen,
  };
}

function createResearchProject(
  id: string,
  input: ReportInput,
  createdAt: string,
  updatedAt: string,
  status: ResearchProject["status"],
): ResearchProject {
  return {
    id,
    topic: input.topic.trim() || "未命名主題",
    reportType: input.reportType.trim() || "研究報告",
    depth: researchDepth(input),
    createdAt,
    updatedAt,
    status,
  };
}

function buildWorkspaceParts(
  input: ReportInput,
  acceptedSources: SourceRecord[],
  project: ResearchProject,
) {
  const report = generateReport({
    ...input,
    acceptedSources,
  });
  const evidenceCards = buildEvidenceCards(acceptedSources, [], {
    resetText: true,
    topic: input.topic,
    createdAt: project.updatedAt,
  });
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
    project,
    topic: input.topic,
    reportType: input.reportType,
    audience: input.targetAudience || input.academicLevel,
    evidenceCards,
    outline,
    acceptedSources,
    acceptedSourceDigest,
    citationFormat: input.citationFormat,
  });

  return {
    report,
    outline,
    draft,
    acceptedSourceDigest,
    evidenceCards,
    qualityReport: draft.qualityReport,
  };
}

export function createReportWorkspace(
  input: ReportInput,
  acceptedSources: SourceRecord[],
  mode: Exclude<ReportGenerationMode, "blocked">,
  id = createReportId(),
): ReportWorkspace {
  const timestamp = nowIso();
  const topicHash = reportTopicFingerprint(input.topic);
  const workflowId = workflowIdForAcceptedSources(acceptedSources);
  const boundAcceptedSources = bindSourcesToWorkspace(
    input,
    acceptedSources,
    workflowId,
    topicHash,
  );
  const effectiveInput: ReportInput = {
    ...input,
    researchDepth: researchDepth(input),
    acceptedSources: boundAcceptedSources,
    mode: mode === "quick_draft" ? "先建立報告架構" : input.mode,
  };
  const project = createResearchProject(
    id,
    effectiveInput,
    timestamp,
    timestamp,
    "ready_to_export",
  );
  return {
    id,
    workflowId,
    reportId: id,
    payloadVersion: 2,
    topicFingerprint: topicHash,
    topicHash,
    sourceIds: sourceIdsForWorkspace(boundAcceptedSources),
    createdAt: timestamp,
    updatedAt: timestamp,
    generationMode: mode,
    input: effectiveInput,
    acceptedSources: boundAcceptedSources,
    project,
    ...buildWorkspaceParts(effectiveInput, boundAcceptedSources, project),
  };
}

export function startReportWorkspaceNavigation({
  input,
  acceptedSources,
  navigate,
  saveWorkspace = saveReportWorkspace,
}: StartReportWorkspaceNavigationOptions): ReportWorkspaceNavigationResult | null {
  const readiness = generationReadiness(acceptedSources, researchDepth(input));
  if (!readiness.canGenerate) return null;
  if (reportSourceGuardDiagnostics(input, acceptedSources).length > 0) return null;

  const workspace = createReportWorkspace(
    input,
    acceptedSources,
    readiness.mode === "quick_draft" ? "quick_draft" : "full_report",
    undefined,
  );
  const path = reportWorkspacePath(workspace.id);

  saveWorkspace(workspace);
  navigate(path);

  return { workspace, path };
}

export function regenerateReportWorkspace(
  workspace: ReportWorkspace,
): ReportWorkspace {
  const updatedAt = nowIso();
  const input = {
    ...workspace.input,
    researchDepth: researchDepth(workspace.input),
  };
  const project = createResearchProject(
    workspace.project?.id ?? workspace.id,
    input,
    workspace.project?.createdAt ?? workspace.createdAt,
    updatedAt,
    "ready_to_export",
  );
  const topicHash = reportTopicFingerprint(input.topic);
  const workflowId = workspace.workflowId ?? workflowIdForAcceptedSources(workspace.acceptedSources);
  const acceptedSources = bindSourcesToWorkspace(
    input,
    workspace.acceptedSources,
    workflowId,
    topicHash,
  );
  return {
    ...workspace,
    input,
    project,
    workflowId,
    reportId: workspace.id,
    payloadVersion: 2,
    topicFingerprint: topicHash,
    topicHash,
    sourceIds: sourceIdsForWorkspace(acceptedSources),
    acceptedSources,
    updatedAt,
    ...buildWorkspaceParts(input, acceptedSources, project),
  };
}

function parseStoredWorkspaces(
  raw: string | null,
): Record<string, ReportWorkspace> {
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

function hydrateStoredWorkspace(
  reportId: string,
  workspace: ReportWorkspace,
): ReportWorkspace {
  const input = {
    ...workspace.input,
    researchDepth: researchDepth(workspace.input),
  };
  const project =
    workspace.project ??
    createResearchProject(
      reportId,
      input,
      workspace.createdAt,
      workspace.updatedAt,
      "ready_to_export",
	    );
  const topicHash = reportTopicFingerprint(input.topic);
  const workflowId = workspace.workflowId ?? createWorkflowId();
  const acceptedSources = bindSourcesToWorkspace(
    input,
    workspace.acceptedSources ?? [],
    workflowId,
    topicHash,
  );
  const sourceIds = sourceIdsForWorkspace(acceptedSources);

  if (
    workspace.project &&
    workspace.evidenceCards &&
    workspace.qualityReport &&
    workspace.draft &&
    workspace.outline
  ) {
    return {
      ...workspace,
      workflowId,
      reportId: workspace.reportId ?? reportId,
      payloadVersion: workspace.payloadVersion ?? 2,
      topicHash: workspace.topicHash ?? topicHash,
      topicFingerprint: workspace.topicFingerprint ?? topicHash,
      sourceIds: workspace.sourceIds ?? sourceIds,
      input,
      acceptedSources,
      project,
    };
  }

  return {
    ...workspace,
    workflowId,
    reportId: workspace.reportId ?? reportId,
    payloadVersion: 2,
    topicHash,
    topicFingerprint: topicHash,
    sourceIds,
    input,
    acceptedSources,
    project,
    ...buildWorkspaceParts(input, acceptedSources, project),
  };
}

export function saveReportWorkspace(workspace: ReportWorkspace): void {
  if (typeof window === "undefined") return;
  const workspaces = parseStoredWorkspaces(
    window.localStorage.getItem(STORAGE_KEY),
  );
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
  const workspace =
    parseStoredWorkspaces(window.localStorage.getItem(STORAGE_KEY))[reportId] ??
    null;
  if (!workspace) return null;
  if ((workspace as { payloadVersion?: number }).payloadVersion !== 2) {
    return null;
  }
  const hydrated = hydrateStoredWorkspace(reportId, {
    ...workspace,
    topicFingerprint:
      workspace.topicFingerprint ??
      reportTopicFingerprint(workspace.input.topic),
  });
  return workspaceSnapshotIsConsistent(hydrated) ? hydrated : null;
}

export function workspaceToGeneratedReport(
  workspace: ReportWorkspace,
  category: TopicCategory,
): GeneratedReport {
  return {
    ...workspace.report,
    meta: {
      ...workspace.report.meta,
      category,
      acceptedSources: workspace.acceptedSources,
      bibliography: buildBibliography(
        workspace.acceptedSources,
        workspace.input.citationFormat,
      ),
      researchDraft: workspace.draft,
      qualityReport: workspace.qualityReport,
      evidenceCards: workspace.evidenceCards,
    },
  };
}
