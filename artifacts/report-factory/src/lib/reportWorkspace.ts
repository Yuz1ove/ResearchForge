import {
  buildBibliography,
  type SourceFactMetadata,
  type SourceRecord,
} from "./sourceRecords.ts";
import { buildEvidenceCards, type EvidenceCard } from "./evidenceCards.ts";
import { buildReportDraft, type ReportDraft } from "./reportDraft.ts";
import { buildReportOutline, type ReportOutline } from "./reportOutline.ts";
import type { QualityReport, ResearchProject } from "./qualityJudge.ts";
import type { AcademicSafetyReview } from "@workspace/api-zod";
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
import {
  getReportReadiness,
  type ReportClaimMode,
  type ReportMode,
} from "@workspace/api-zod/report-readiness";
import {
  DEFAULT_REPORT_PRESENTATION,
  normalizeReportPresentation,
  type ReportPresentationSettings,
} from "./reportPresentation.ts";

export type ReportGenerationMode =
  | "blocked"
  | "single_source_review"
  | "initial_brief"
  | "background_report_mode"
  | "short_research_report"
  | "standard_research_report"
  | "complete_research_report";

export interface GenerationReadiness {
  acceptedSourceCount: number;
  acceptedUsableSourcesCount: number;
  scholarlySourcesCount: number;
  officialBackgroundSourcesCount: number;
  reliableBackgroundSourcesCount: number;
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
  message: string | null;
  diagnostics: string[];
  buttonLabel: string;
  progressLabel: string;
  reportMode: ReportMode | "blocked";
  claimMode: ReportClaimMode | "blocked";
  minRequiredSources: number;
  badge: string;
}

export interface GeneratorWorkflowVisibility {
  showEvidenceCards: boolean;
  showTechnicalLogs: boolean;
}

export interface ReportWorkspaceLlmDiagnostics {
  reportGenerationProvider: string;
  reportGenerationModel: string | null;
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  fallbackReason: string | null;
  message?: string | null;
  warning: string | null;
  sectionPlan?: Array<{
    sectionId: string;
    title: string;
    evidenceCardIds: string[];
    supportLevel?: "strong" | "partial" | "limited";
    needsMoreEvidence?: boolean;
    evidenceGaps?: string[];
  }>;
}

export interface ReportWorkspaceSupplementalSearchDiagnostics {
  attempted: boolean;
  gaps: string[];
  queries: string[];
  rawResultCount: number;
  filteredResultCount: number;
  status: "skipped" | "attempted" | "insufficient";
}

export type ReportWorkspaceOutline = ReportOutline;

export type ReportWorkspaceDraft = ReportDraft;

export interface ReportWorkspace {
  id: string;
  workflowId: string;
  reportId: string;
  payloadVersion: 3;
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
  generationPayload: ReportWorkspaceGenerationPayload;
  llmDiagnostics?: ReportWorkspaceLlmDiagnostics;
  supplementalSearchDiagnostics?: ReportWorkspaceSupplementalSearchDiagnostics;
  presentation: ReportPresentationSettings;
}

export interface ReportWorkspaceGenerationPayload {
  workflowId: string;
  topicHash: string;
  originalTopic: string;
  researchTopic: string;
  displayTitle: string;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  academicSafetyReview?: AcademicSafetyReview | null;
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

export interface CreateReportWorkspaceOptions {
  workflowId?: string | null;
  topicHash?: string | null;
  originalTopic?: string | null;
  researchTopic?: string | null;
  displayTitle?: string | null;
  evidenceCards?: EvidenceCard[] | null;
  academicSafetyReview?: AcademicSafetyReview | null;
}

const STORAGE_KEY = "researchforge:report-workspaces:v1";

export const MISSING_TOPIC_HASH_MESSAGE =
  "主題識別碼遺失，請返回主題階段重新建立研究流程。";

const MISSING_WORKFLOW_ID_MESSAGE =
  "研究流程識別碼遺失，請返回主題階段重新建立研究流程。";

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
    minimumAcceptedSources: 5,
    fullReportSources: 10,
  },
  deep: {
    label: "deep",
    recommendedSources: 12,
    minimumAcceptedSources: 5,
    fullReportSources: 10,
  },
} as const;

export const MIN_REPORT_ACCEPTED_SOURCES = 3;
export const MIN_SHORT_REPORT_ACCEPTED_SOURCES = 3;
export const MIN_STANDARD_REPORT_ACCEPTED_SOURCES = 10;

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
  return (
    (workspace.generationPayload?.originalTopic ?? workspace.input.topic).trim() ===
    topic.trim()
  );
}

function createReportId(): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `rf-${Date.now().toString(36)}-${randomPart}`;
}

function workflowIdForAcceptedSources(sources: SourceRecord[]): string | null {
  const workflowIds = Array.from(
    new Set(
      sources
        .map((source) => source.workflowId?.trim())
        .filter((workflowId): workflowId is string => Boolean(workflowId)),
    ),
  );
  return workflowIds.length === 1 ? workflowIds[0]! : null;
}

function topicHashForAcceptedSources(sources: SourceRecord[]): string | null {
  const topicHashes = Array.from(
    new Set(
      sources
        .map((source) => source.topicHash?.trim())
        .filter((topicHash): topicHash is string => Boolean(topicHash)),
    ),
  );
  return topicHashes.length === 1 ? topicHashes[0]! : null;
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
    topicHash: source.topicHash,
    queryPlanHash: source.queryPlanHash ?? queryPlanHash,
  }));
}

export function reportSourceGuardDiagnostics(
  input: Pick<ReportInput, "topic">,
  acceptedSources: SourceRecord[],
  context: { workflowId?: string | null; topicHash?: string | null } = {},
): string[] {
  const expectedTopicHash =
    context.topicHash?.trim() || reportTopicFingerprint(input.topic);
  const expectedWorkflowId = context.workflowId?.trim() || null;
  const workflowIds = new Set(
    acceptedSources
      .map((source) => source.workflowId?.trim())
      .filter((workflowId): workflowId is string => Boolean(workflowId)),
  );
  const messages: string[] = [];

  if (acceptedSources.length < 1) {
    messages.push("accepted_sources_below_minimum");
  }
  if (acceptedSources.some((source) => !source.workflowId?.trim())) {
    messages.push("missing_workflow_id");
  }
  if (
    expectedWorkflowId
      ? acceptedSources.some((source) => source.workflowId !== expectedWorkflowId)
      : workflowIds.size > 1
  ) {
    messages.push("workflow_mismatch");
  }
  if (acceptedSources.some((source) => !source.topicHash?.trim())) {
    messages.push("missing_topic_hash");
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

export function reportGenerationBlockingReason(input: {
  topic: string;
  acceptedSources: SourceRecord[];
  hasWorkspaceTopicMismatch?: boolean;
  evidenceCardCount?: number;
  workflowId?: string | null;
  topicHash?: string | null;
}): string | null {
  if (input.hasWorkspaceTopicMismatch) {
    return "目前來源屬於另一個主題，請重新搜尋後再生成。";
  }
  const topicHash = input.topicHash?.trim();
  if (!topicHash) return MISSING_TOPIC_HASH_MESSAGE;
  const workflowId = input.workflowId?.trim();
  if (!workflowId) return MISSING_WORKFLOW_ID_MESSAGE;

  const readiness = getReportReadiness({ acceptedSources: input.acceptedSources });
  if (!readiness.canGenerate) {
    return readiness.message;
  }
  const evidenceCardCount = input.evidenceCardCount ?? 0;
  if (evidenceCardCount < 1) {
    return "來源已接受，但尚未形成足夠證據卡，請先重新產生證據卡後再生成報告。";
  }

  const guardDiagnostics = reportSourceGuardDiagnostics(
    { topic: input.topic },
    input.acceptedSources,
    { workflowId, topicHash },
  );
  if (guardDiagnostics.includes("missing_topic_hash")) {
    return MISSING_TOPIC_HASH_MESSAGE;
  }
  if (guardDiagnostics.includes("missing_workflow_id")) {
    return MISSING_WORKFLOW_ID_MESSAGE;
  }
  if (guardDiagnostics.includes("workflow_mismatch")) {
    return "目前已採用來源來自不同工作流程，請重新搜尋並重新採用。";
  }
  if (guardDiagnostics.includes("topic_mismatch")) {
    return "目前已採用來源與現行主題不一致，請重新搜尋後再生成。";
  }
  return null;
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
  const generationPayload = workspace.generationPayload;
  const topicHash = workspace.topicHash?.trim();
  const payloadTopicHash = generationPayload?.topicHash?.trim();
  if (!topicHash || !payloadTopicHash || topicHash !== payloadTopicHash) return false;
  const sourceIds = sourceIdsForWorkspace(workspace.acceptedSources);
  const savedSourceIds = workspace.sourceIds ?? [];
  const sourceIdSet = new Set(sourceIds);
  const sourcesMatchWorkflow = (workspace.acceptedSources ?? []).every(
    (source) =>
      source.workflowId === workspace.workflowId &&
      source.topicHash === topicHash,
  );
  const evidenceCardsMatchWorkflow = (workspace.evidenceCards ?? []).every(
    (card) =>
      card.workflowId === workspace.workflowId &&
      card.topicHash === topicHash &&
      sourceIdSet.has(card.sourceId),
  );
  const draftCitationIds = (workspace.draft?.sections ?? []).flatMap(
    (section) => section.citationIds ?? [],
  );

  return (
    workspace.payloadVersion === 3 &&
    Boolean(workspace.workflowId) &&
    generationPayload.workflowId === workspace.workflowId &&
    Boolean(generationPayload?.displayTitle?.trim()) &&
    Boolean(generationPayload?.originalTopic?.trim()) &&
    Boolean(generationPayload?.researchTopic?.trim()) &&
    generationPayload.originalTopic.trim() === workspace.input.topic.trim() &&
    (workspace.reportId ?? workspace.id) === workspace.id &&
    sourcesMatchWorkflow &&
    evidenceCardsMatchWorkflow &&
    savedSourceIds.length === sourceIds.length &&
    savedSourceIds.every((sourceId) => sourceIdSet.has(sourceId)) &&
    draftCitationIds.every((citationId) => sourceIdSet.has(citationId))
  );
}

export function reportWorkspacePath(
  reportId: string,
  context?: { workflowId?: string | null; topicHash?: string | null },
): string {
  const params = new URLSearchParams();
  if (context?.workflowId) params.set("workflowId", context.workflowId);
  if (context?.topicHash) params.set("topicHash", context.topicHash);
  const query = params.toString();
  return `/reports/${encodeURIComponent(reportId)}${query ? `?${query}` : ""}`;
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

function sourceCountsAsScholarlyEvidence(source: SourceRecord): boolean {
  if (source.recommendationBucket === "scholarly_recommended") return true;
  if (source.recommendationBucket === "official_background") return false;
  if (source.recommendationBucket === "rejected") return false;
  if (
    source.recommendationBucket === "manual_review" &&
    !(source.acceptedByUser || source.userDecision === "accepted_as_manual_review")
  ) {
    return false;
  }
  return Boolean(
    source.doi ||
      source.isPeerReviewed ||
      source.sourceKind === "journal" ||
      source.sourceKind === "conference",
  );
}

function readinessDiagnostics(sources: SourceRecord[]) {
  const acceptedSourceCount = sources.length;
  const scholarlyEvidenceCount = sources.filter(sourceCountsAsScholarlyEvidence).length;
  const officialBackgroundCount = sources.filter(
    (source) => source.recommendationBucket === "official_background",
  ).length;
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
    scholarlyEvidenceCount,
    officialBackgroundCount,
    primarySourceCount,
    secondarySourceCount,
    relevantSourceCount,
    usableSummaryCount,
    coverageCount: coverage.size,
    lowQualityAcceptedCount,
  };
}

function reportGenerationModeFromSourceCount(
  usableSourceCount: number,
  claimMode: ReportClaimMode | "blocked" = "academic_claim_mode",
): Exclude<ReportGenerationMode, "blocked"> {
  if (claimMode === "background_report_mode") return "background_report_mode";
  if (usableSourceCount < MIN_STANDARD_REPORT_ACCEPTED_SOURCES) return "short_research_report";
  return "standard_research_report";
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

  if (diagnostics.acceptedSourceCount < requiredAccepted) {
    messages.push(
      full
        ? `若要生成完整報告，建議已接受來源至少 ${requiredAccepted} 筆。`
        : `已接受來源需至少 ${requiredAccepted} 筆`,
    );
  }
  if (diagnostics.primarySourceCount + diagnostics.secondarySourceCount < requiredRelevant) {
    messages.push(
      "目前主要／延伸來源不足。請重新搜尋或調整主題，至少需要 3 筆可驗證來源。",
    );
  }
  if (diagnostics.lowQualityAcceptedCount > 0) {
    messages.push("系統找到多筆延伸或低相關來源，但它們不足以支撐本研究主題。");
  }
  return messages;
}

export function generationReadiness(
  input: number | SourceRecord[],
  depth: ReportInput["researchDepth"] = "standard",
  evidenceCards?: EvidenceCard[] | null,
): GenerationReadiness {
  const sources = readinessSources(input);
  const diagnostics = readinessDiagnostics(sources);
  const canonicalReadiness = getReportReadiness({
    acceptedSources: sources,
    ...(evidenceCards ? { evidenceCards } : {}),
  });
  const preliminaryDiagnostics: string[] = [];
  if (!canonicalReadiness.canGenerate) {
    preliminaryDiagnostics.push(canonicalReadiness.message ?? "來源不足");
  }
  const fullDiagnosticList = diagnosticMessages(diagnostics, true, depth);

  if (preliminaryDiagnostics.length > 0) {
    return {
      ...diagnostics,
      acceptedUsableSourcesCount: canonicalReadiness.acceptedUsableSourcesCount,
      scholarlySourcesCount: canonicalReadiness.scholarlySourcesCount,
      officialBackgroundSourcesCount: canonicalReadiness.officialBackgroundSourcesCount,
      reliableBackgroundSourcesCount: canonicalReadiness.reliableBackgroundSourcesCount,
      mode: "blocked",
      canGenerate: false,
      canGenerateFull: false,
      warning: `來源品質不足：${preliminaryDiagnostics.join("、")}。`,
      message: canonicalReadiness.message,
      diagnostics: preliminaryDiagnostics,
      buttonLabel: canonicalReadiness.buttonLabel,
      progressLabel: "等待來源審查",
      reportMode: canonicalReadiness.reportMode,
      claimMode: canonicalReadiness.claimMode,
      minRequiredSources: canonicalReadiness.minRequiredSources,
      badge: canonicalReadiness.badge,
    };
  }

  const generationMode = reportGenerationModeFromSourceCount(
    canonicalReadiness.acceptedUsableSourcesCount,
    canonicalReadiness.claimMode,
  );
  if (canonicalReadiness.reportMode === "short") {
    return {
      ...diagnostics,
      acceptedUsableSourcesCount: canonicalReadiness.acceptedUsableSourcesCount,
      scholarlySourcesCount: canonicalReadiness.scholarlySourcesCount,
      officialBackgroundSourcesCount: canonicalReadiness.officialBackgroundSourcesCount,
      reliableBackgroundSourcesCount: canonicalReadiness.reliableBackgroundSourcesCount,
      mode: generationMode,
      canGenerate: true,
      canGenerateFull: false,
      warning: canonicalReadiness.message,
      message: canonicalReadiness.message,
      diagnostics: [canonicalReadiness.message, ...fullDiagnosticList].filter(
        (item): item is string => Boolean(item),
      ),
      buttonLabel: canonicalReadiness.buttonLabel,
      progressLabel: "正在建立報告工作區",
      reportMode: canonicalReadiness.reportMode,
      claimMode: canonicalReadiness.claimMode,
      minRequiredSources: canonicalReadiness.minRequiredSources,
      badge: canonicalReadiness.badge,
    };
  }

  return {
    ...diagnostics,
    acceptedUsableSourcesCount: canonicalReadiness.acceptedUsableSourcesCount,
    scholarlySourcesCount: canonicalReadiness.scholarlySourcesCount,
    officialBackgroundSourcesCount: canonicalReadiness.officialBackgroundSourcesCount,
    reliableBackgroundSourcesCount: canonicalReadiness.reliableBackgroundSourcesCount,
    mode: generationMode,
    canGenerate: true,
    canGenerateFull: true,
    warning: canonicalReadiness.message,
    message: canonicalReadiness.message,
    diagnostics: [canonicalReadiness.message, ...fullDiagnosticList].filter(
      (item): item is string => Boolean(item),
    ),
    buttonLabel: canonicalReadiness.buttonLabel,
    progressLabel:
      canonicalReadiness.claimMode === "background_report_mode"
        ? "正在建立背景型報告工作區"
        : "正在建立標準報告工作區",
    reportMode: canonicalReadiness.reportMode,
    claimMode: canonicalReadiness.claimMode,
    minRequiredSources: canonicalReadiness.minRequiredSources,
    badge: canonicalReadiness.badge,
  };
}

export function reportModeFromGenerationMode(
  generationMode: Exclude<ReportGenerationMode, "blocked">,
): ReportMode {
  return generationMode === "background_report_mode" ||
    generationMode === "short_research_report" ||
    generationMode === "single_source_review" ||
    generationMode === "initial_brief"
    ? "short"
    : "standard";
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
  options: {
    evidenceCards?: EvidenceCard[] | null;
    displayTitle?: string | null;
  } = {},
) {
  const evidenceCards =
    options.evidenceCards && options.evidenceCards.length > 0
      ? options.evidenceCards
      : buildEvidenceCards(acceptedSources, [], {
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
  const report = generateReport({
    ...input,
    acceptedSources,
  });
  const displayTitle = options.displayTitle?.trim() || input.topic;
  const draftWithDisplayTitle = {
    ...draft,
    title: displayTitle,
  };

  return {
    report: {
      ...report,
      meta: {
        ...report.meta,
        title: displayTitle,
        researchDraft: draftWithDisplayTitle,
        qualityReport: draftWithDisplayTitle.qualityReport,
        evidenceCards,
      },
    },
    outline,
    draft: draftWithDisplayTitle,
    acceptedSourceDigest,
    evidenceCards,
    qualityReport: draftWithDisplayTitle.qualityReport,
  };
}

export function createReportWorkspace(
  input: ReportInput,
  acceptedSources: SourceRecord[],
  mode: Exclude<ReportGenerationMode, "blocked">,
  id = createReportId(),
  options: CreateReportWorkspaceOptions = {},
): ReportWorkspace {
  const timestamp = nowIso();
  const originalTopic = options.originalTopic?.trim() || input.topic.trim();
  const researchTopic = options.researchTopic?.trim() || originalTopic;
  const displayTitle = options.displayTitle?.trim() || originalTopic;
  const topicHash =
    options.topicHash?.trim() || topicHashForAcceptedSources(acceptedSources);
  if (!topicHash) {
    throw new Error(MISSING_TOPIC_HASH_MESSAGE);
  }
  const workflowId =
    options.workflowId?.trim() || workflowIdForAcceptedSources(acceptedSources);
  if (!workflowId) {
    throw new Error(MISSING_WORKFLOW_ID_MESSAGE);
  }
  const contextDiagnostics = reportSourceGuardDiagnostics(input, acceptedSources, {
    workflowId,
    topicHash,
  });
  if (contextDiagnostics.includes("missing_topic_hash")) {
    throw new Error(MISSING_TOPIC_HASH_MESSAGE);
  }
  if (contextDiagnostics.includes("missing_workflow_id")) {
    throw new Error(MISSING_WORKFLOW_ID_MESSAGE);
  }
  if (contextDiagnostics.includes("workflow_mismatch")) {
    throw new Error("目前已採用來源來自不同工作流程，請重新搜尋並重新採用。");
  }
  if (contextDiagnostics.includes("topic_mismatch")) {
    throw new Error("目前已採用來源與現行主題不一致，請重新搜尋後再生成。");
  }
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
    mode:
      mode === "background_report_mode"
        ? "先建立背景型研究報告"
        : mode === "single_source_review" ||
            mode === "initial_brief" ||
            mode === "short_research_report"
          ? "先建立報告架構"
          : input.mode,
  };
  const project = createResearchProject(
    id,
    effectiveInput,
    timestamp,
    timestamp,
    "ready_to_export",
  );
  const workspaceParts = buildWorkspaceParts(
    effectiveInput,
    boundAcceptedSources,
    project,
    {
      evidenceCards: options.evidenceCards,
      displayTitle,
    },
  );
  return {
    id,
    workflowId,
    reportId: id,
    payloadVersion: 3,
    topicFingerprint: topicHash,
    topicHash,
    sourceIds: sourceIdsForWorkspace(boundAcceptedSources),
    createdAt: timestamp,
    updatedAt: timestamp,
    generationMode: mode,
    input: effectiveInput,
    acceptedSources: boundAcceptedSources,
    project,
    presentation: normalizeReportPresentation(DEFAULT_REPORT_PRESENTATION),
    generationPayload: {
      workflowId,
      topicHash,
      originalTopic,
      researchTopic,
      displayTitle,
      acceptedSources: boundAcceptedSources,
      evidenceCards: workspaceParts.evidenceCards,
      academicSafetyReview: options.academicSafetyReview ?? null,
    },
    ...workspaceParts,
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
  const workflowId = workflowIdForAcceptedSources(acceptedSources);
  const topicHash = topicHashForAcceptedSources(acceptedSources);
  if (!workflowId || !topicHash) return null;
  if (
    reportSourceGuardDiagnostics(input, acceptedSources, {
      workflowId,
      topicHash,
    }).length > 0
  ) {
    return null;
  }
  const generationMode = readiness.mode;
  if (generationMode === "blocked") return null;

  const workspace = createReportWorkspace(
    input,
    acceptedSources,
    generationMode,
    undefined,
    { workflowId, topicHash },
  );
  const path = reportWorkspacePath(workspace.id, {
    workflowId: workspace.workflowId,
    topicHash: workspace.topicHash,
  });

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
  const generationPayload = workspace.generationPayload;
  const researchTopic = generationPayload?.researchTopic?.trim() || input.topic;
  const topicHash =
    generationPayload?.topicHash?.trim() ||
    workspace.topicHash?.trim() ||
    topicHashForAcceptedSources(workspace.acceptedSources);
  if (!topicHash) {
    throw new Error(MISSING_TOPIC_HASH_MESSAGE);
  }
  const workflowId =
    generationPayload?.workflowId?.trim() ||
    workspace.workflowId?.trim() ||
    workflowIdForAcceptedSources(workspace.acceptedSources);
  if (!workflowId) {
    throw new Error(MISSING_WORKFLOW_ID_MESSAGE);
  }
  const acceptedSources = bindSourcesToWorkspace(
    input,
    workspace.acceptedSources,
    workflowId,
    topicHash,
  );
  const acceptedSourceIds = new Set(acceptedSources.map((source) => source.id));
  const evidenceCards = (workspace.evidenceCards ?? []).filter((card) =>
    acceptedSourceIds.has(card.sourceId),
  );
  const workspaceParts = buildWorkspaceParts(input, acceptedSources, project, {
    evidenceCards,
    displayTitle:
      generationPayload?.displayTitle?.trim() || workspace.draft?.title || input.topic,
  });
  return {
    ...workspace,
    input,
    project,
    workflowId,
    reportId: workspace.id,
    payloadVersion: 3,
    topicFingerprint: topicHash,
    topicHash,
    sourceIds: sourceIdsForWorkspace(acceptedSources),
    acceptedSources,
    updatedAt,
    generationPayload: {
      workflowId,
      topicHash,
      originalTopic:
        generationPayload?.originalTopic?.trim() || workspace.input.topic.trim(),
      researchTopic,
      displayTitle:
        generationPayload?.displayTitle?.trim() || workspace.draft?.title || input.topic,
      acceptedSources,
      evidenceCards: workspaceParts.evidenceCards,
      academicSafetyReview: generationPayload?.academicSafetyReview ?? null,
    },
    ...workspaceParts,
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
  const topicHash =
    workspace.generationPayload?.topicHash?.trim() ||
    workspace.topicHash?.trim() ||
    topicHashForAcceptedSources(workspace.acceptedSources ?? []);
  const workflowId =
    workspace.generationPayload?.workflowId?.trim() ||
    workspace.workflowId?.trim() ||
    workflowIdForAcceptedSources(workspace.acceptedSources ?? []);
  if (!topicHash || !workflowId) {
    return {
      ...workspace,
      workflowId: workflowId ?? "",
      reportId: workspace.reportId ?? reportId,
      payloadVersion: workspace.payloadVersion ?? 3,
      topicHash: topicHash ?? "",
      topicFingerprint: workspace.topicFingerprint ?? topicHash ?? "",
      sourceIds: workspace.sourceIds ?? [],
      input,
      acceptedSources: workspace.acceptedSources ?? [],
      presentation: normalizeReportPresentation(workspace.presentation),
      project,
    };
  }
  const acceptedSources = bindSourcesToWorkspace(
    input,
    workspace.acceptedSources ?? [],
    workflowId,
    topicHash,
  );
  const sourceIds = sourceIdsForWorkspace(acceptedSources);

  if (
    workspace.generationPayload &&
    workspace.project &&
    workspace.evidenceCards &&
    workspace.qualityReport &&
    workspace.draft &&
    workspace.outline &&
    workspace.draft.sectionEvidenceMap &&
    workspace.draft.paragraphPlans &&
    workspace.draft.debug
  ) {
    return {
      ...workspace,
      workflowId,
      reportId: workspace.reportId ?? reportId,
      payloadVersion: workspace.payloadVersion ?? 3,
      topicHash,
      topicFingerprint: topicHash,
      sourceIds: workspace.sourceIds ?? sourceIds,
      input,
      acceptedSources,
      presentation: normalizeReportPresentation(workspace.presentation),
      project,
    };
  }

  return {
    ...workspace,
    workflowId,
    reportId: workspace.reportId ?? reportId,
    payloadVersion: 3,
    topicHash,
    topicFingerprint: topicHash,
    sourceIds,
    input,
    acceptedSources,
    presentation: normalizeReportPresentation(workspace.presentation),
    project,
    generationPayload: {
      workflowId,
      topicHash,
      originalTopic: workspace.input.topic.trim(),
      researchTopic: workspace.input.topic.trim(),
      displayTitle: workspace.draft?.title?.trim() || workspace.input.topic.trim(),
      acceptedSources,
      evidenceCards: workspace.evidenceCards ?? [],
      academicSafetyReview: null,
    },
    ...buildWorkspaceParts(input, acceptedSources, project, {
      evidenceCards: workspace.evidenceCards ?? [],
      displayTitle: workspace.draft?.title ?? workspace.input.topic,
    }),
  };
}

const WORKSPACE_STORAGE_TEXT_LIMIT = 1_600;
const WORKSPACE_STORAGE_LONG_TEXT_LIMIT = 4_000;
const WORKSPACE_STORAGE_FACT_LIMIT = 3;
const WORKSPACE_STORAGE_SUPPORT_SPAN_LIMIT = 4;

function truncateForWorkspaceStorage(
  value: unknown,
  limit = WORKSPACE_STORAGE_TEXT_LIMIT,
): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit).trim()}...`;
}

function compactSourceFactsForStorage(
  value: SourceRecord["sourceFacts"],
): SourceRecord["sourceFacts"] {
  if (!Array.isArray(value)) return value;
  return value.slice(0, WORKSPACE_STORAGE_FACT_LIMIT).map((item) => {
    const fact = item as SourceFactMetadata;
    return {
      ...fact,
      fact: truncateForWorkspaceStorage(fact.fact) as string,
      supportedByText: truncateForWorkspaceStorage(fact.supportedByText) as string,
    };
  });
}

function compactSupportSpansForStorage(
  value: EvidenceCard["supportSpans"],
): EvidenceCard["supportSpans"] {
  if (!Array.isArray(value)) return value;
  return value.slice(0, WORKSPACE_STORAGE_SUPPORT_SPAN_LIMIT).map((item) => {
    const span = item;
    return {
      ...span,
      text: truncateForWorkspaceStorage(span.text) as string | undefined,
    };
  });
}

function compactSourceForWorkspaceStorage(source: SourceRecord): SourceRecord {
  const record = source as SourceRecord & Record<string, unknown>;
  const {
    extractedText: _extractedText,
    extractedChunks: _extractedChunks,
    rawProviderResult: _rawProviderResult,
    rawResponse: _rawResponse,
    html: _html,
    pdfText: _pdfText,
    sourceContent: _sourceContent,
    ...rest
  } = record;
  const compact = { ...rest } as SourceRecord & Record<string, unknown>;
  for (const key of [
    "abstract",
    "snippet",
    "readableSummaryZhTW",
    "readableSummaryZhTw",
    "evidenceSummaryZhTw",
    "mainEvidencePointZhTw",
    "sourceRelevanceReasonZhTw",
    "llmSummaryZhTw",
    "abstractZhTw",
    "originalAbstract",
  ]) {
    compact[key] = truncateForWorkspaceStorage(
      compact[key],
      key === "abstract" || key === "originalAbstract"
        ? WORKSPACE_STORAGE_LONG_TEXT_LIMIT
        : WORKSPACE_STORAGE_TEXT_LIMIT,
    );
  }
  compact.sourceFacts = compactSourceFactsForStorage(compact.sourceFacts);
  return compact as SourceRecord;
}

function compactEvidenceCardForWorkspaceStorage(card: EvidenceCard): EvidenceCard {
  const compact = { ...(card as EvidenceCard & Record<string, unknown>) } as EvidenceCard &
    Record<string, unknown>;
  for (const key of [
    "claim",
    "claimTextZhTw",
    "mainClaim",
    "mainClaimZhTw",
    "evidence",
    "evidencePointZhTw",
    "usableEvidence",
    "quoteOrParaphrase",
    "summary",
    "sourceExcerptOriginal",
    "sourceSummaryZhTw",
    "quotedText",
    "abstract",
  ]) {
    compact[key] = truncateForWorkspaceStorage(
      compact[key],
      key === "abstract" ? WORKSPACE_STORAGE_LONG_TEXT_LIMIT : WORKSPACE_STORAGE_TEXT_LIMIT,
    );
  }
  compact.supportSpans = compactSupportSpansForStorage(compact.supportSpans);
  return compact as EvidenceCard;
}

function compactReportWorkspaceForStorage(workspace: ReportWorkspace): ReportWorkspace {
  const acceptedSources = (workspace.acceptedSources ?? []).map(
    compactSourceForWorkspaceStorage,
  );
  const evidenceCards = (workspace.evidenceCards ?? []).map(
    compactEvidenceCardForWorkspaceStorage,
  );
  return {
    ...workspace,
    input: {
      ...workspace.input,
      acceptedSources,
    },
    acceptedSources,
    evidenceCards,
    generationPayload: {
      ...workspace.generationPayload,
      acceptedSources,
      evidenceCards,
    },
    report: {
      ...workspace.report,
      meta: {
        ...workspace.report.meta,
        acceptedSources,
        evidenceCards,
      },
    },
  };
}

function workspaceTimestamp(workspace: ReportWorkspace): number {
  const parsed = Date.parse(workspace.updatedAt || workspace.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function retainRecentStoredWorkspaces(
  workspaces: Record<string, ReportWorkspace>,
  current: ReportWorkspace,
): Record<string, ReportWorkspace> {
  const recent = Object.entries(workspaces)
    .filter(([id]) => id !== current.id)
    .sort(([, a], [, b]) => workspaceTimestamp(b) - workspaceTimestamp(a))
    .slice(0, 2);
  return Object.fromEntries([...recent, [current.id, current]]);
}

export function saveReportWorkspace(workspace: ReportWorkspace): void {
  if (typeof window === "undefined") return;
  const workspaces = parseStoredWorkspaces(
    window.localStorage.getItem(STORAGE_KEY),
  );
  const compactWorkspace = compactReportWorkspaceForStorage(workspace);
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...workspaces,
        [compactWorkspace.id]: compactWorkspace,
      }),
    );
  } catch (error) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(retainRecentStoredWorkspaces(workspaces, compactWorkspace)),
      );
    } catch {
      throw error;
    }
  }
}

export function serializeReportWorkspaceForStorageForTests(
  workspace: ReportWorkspace,
): string {
  return JSON.stringify(compactReportWorkspaceForStorage(workspace));
}

export function loadReportWorkspace(reportId: string): ReportWorkspace | null {
  if (typeof window === "undefined") return null;
  const workspace =
    parseStoredWorkspaces(window.localStorage.getItem(STORAGE_KEY))[reportId] ??
    null;
  if (!workspace) return null;
  if ((workspace as { payloadVersion?: number }).payloadVersion !== 3) {
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
    sections: workspace.draft.sections.map((section) => ({
      heading: section.title,
      blocks: [
        {
          type: "paragraph",
          text: section.synthesizedProseZhTw || section.body,
        },
      ],
    })),
    meta: {
      ...workspace.report.meta,
      title: workspace.generationPayload?.displayTitle ?? workspace.draft.title,
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
