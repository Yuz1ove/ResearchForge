import {
  reportModeFromGenerationMode,
  type ReportGenerationMode,
  type ReportWorkspace,
} from "./reportWorkspace.ts";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import type { EvidenceCard } from "./evidenceCards.ts";
import { buildQualityReport, type ResearchSectionKey } from "./qualityJudge.ts";
import type { AcademicSafetyReview } from "@workspace/api-zod";
import {
  buildStableCitationMarkerMap,
  extractCitationMarkers,
  guardUnsupportedSectionClaims,
  selectSupportedClaimsForSection,
  sourceIdsFromCitationMarkers,
  validateSectionEvidenceCoverage,
} from "./sectionEvidencePolicy.ts";

export interface LlmReportSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
  warnings?: string[];
}

export interface LlmReportSectionPlan {
  sectionId: string;
  title: string;
  paragraphPurpose?: string;
  evidenceCardIds: string[];
  supportLevel?: "strong" | "partial" | "limited";
  needsMoreEvidence?: boolean;
  evidenceGaps?: string[];
}

export interface LlmReportWriterResult {
  ok: boolean;
  status: "success" | "unavailable" | "invalid_input" | "insufficient_sources" | "error";
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  message: string | null;
  warning: string | null;
  sectionPlan: LlmReportSectionPlan[];
  sections: LlmReportSection[];
  reportGenerationProvider: string;
  reportGenerationModel: string | null;
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  fallbackReason: string | null;
  code?: string;
  details?: {
    reportMode?: string | null;
    acceptedSourcesCount?: number;
    evidenceCardsCount?: number;
    minRequiredSources?: number;
    requestedModel?: string | null;
    actualModel?: string | null;
    fallbackUsed?: boolean;
  };
  generationTraceId?: string;
  reportMode?: "short" | "standard";
  requestedModel?: string | null;
  actualModel?: string | null;
}

const DEFAULT_REPORT_DRAFT_TIMEOUT_MS = 260_000;

function reportWriterApiUrl(path: string): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const base = env?.VITE_API_BASE_URL?.trim();
  if (!base) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/+$/, "")}${normalizedPath}`;
}

function timeoutFallbackResult(reason: string): LlmReportWriterResult {
  return {
    ok: false,
    status: "unavailable",
    llm_status: "timeout",
    fallback_used: false,
    message: "LLM 報告生成逾時，未產生替代報告。",
    warning: reason,
    sectionPlan: [],
    sections: [],
    reportGenerationProvider: "school-openai-compatible",
    reportGenerationModel: null,
    reportGenerationStatus: "timeout",
    fallbackUsed: false,
    fallbackReason: null,
  };
}

function sanitizeSection(value: unknown): LlmReportSection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const prose = typeof data.prose === "string" ? data.prose.trim() : "";
  const evidenceCardIds = Array.isArray(data.evidenceCardIds)
    ? data.evidenceCardIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const citationIds = Array.isArray(data.citationIds)
    ? data.citationIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const warnings = Array.isArray(data.warnings)
    ? data.warnings
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  if (!sectionId || !title || !prose) return null;
  return { sectionId, title, prose, evidenceCardIds, citationIds, ...(warnings.length ? { warnings } : {}) };
}

function sanitizeSectionPlan(value: unknown): LlmReportSectionPlan | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const evidenceCardIds = Array.isArray(data.evidenceCardIds)
    ? data.evidenceCardIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const evidenceGaps = Array.isArray(data.evidenceGaps)
    ? data.evidenceGaps
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  if (!sectionId || !title) return null;
  return {
    sectionId,
    title,
    paragraphPurpose:
      typeof data.paragraphPurpose === "string" ? data.paragraphPurpose : undefined,
    evidenceCardIds,
    supportLevel:
      data.supportLevel === "strong" ||
      data.supportLevel === "partial" ||
      data.supportLevel === "limited"
        ? data.supportLevel
        : undefined,
    needsMoreEvidence:
      typeof data.needsMoreEvidence === "boolean" ? data.needsMoreEvidence : undefined,
    evidenceGaps,
  };
}

function normalizeResult(value: unknown): LlmReportWriterResult {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sections = Array.isArray(data.sections)
    ? data.sections
        .map(sanitizeSection)
        .filter((section): section is LlmReportSection => Boolean(section))
    : [];
  const sectionPlan = Array.isArray(data.sectionPlan)
    ? data.sectionPlan
        .map(sanitizeSectionPlan)
        .filter((section): section is LlmReportSectionPlan => Boolean(section))
    : [];
  return {
    ok: data.ok === true,
    status:
      data.status === "success" ||
      data.status === "unavailable" ||
      data.status === "invalid_input" ||
      data.status === "insufficient_sources" ||
      data.status === "error"
        ? data.status
        : "error",
    llm_status:
      data.llm_status === "success" ||
      data.llm_status === "timeout" ||
      data.llm_status === "quota_exceeded" ||
      data.llm_status === "failed" ||
      data.llm_status === "skipped"
        ? data.llm_status
        : "failed",
    fallback_used: data.fallback_used === true,
    message: typeof data.message === "string" ? data.message : null,
    warning: typeof data.warning === "string" ? data.warning : null,
    sectionPlan,
    sections,
    reportGenerationProvider:
      typeof data.reportGenerationProvider === "string"
        ? data.reportGenerationProvider
        : "ollama",
    reportGenerationModel:
      typeof data.reportGenerationModel === "string"
        ? data.reportGenerationModel
        : typeof data.model === "string"
          ? data.model
          : null,
    reportGenerationStatus:
      data.reportGenerationStatus === "success" ||
      data.reportGenerationStatus === "timeout" ||
      data.reportGenerationStatus === "quota_exceeded" ||
      data.reportGenerationStatus === "failed" ||
      data.reportGenerationStatus === "skipped"
        ? data.reportGenerationStatus
        : data.llm_status === "success" ||
            data.llm_status === "timeout" ||
            data.llm_status === "quota_exceeded" ||
            data.llm_status === "failed" ||
            data.llm_status === "skipped"
          ? data.llm_status
          : "failed",
    fallbackUsed: data.fallbackUsed === true || data.fallback_used === true,
    fallbackReason:
      typeof data.fallbackReason === "string"
        ? data.fallbackReason
        : typeof data.warning === "string"
          ? data.warning
          : null,
    code: typeof data.code === "string" ? data.code : undefined,
    details:
      data.details && typeof data.details === "object"
        ? data.details as LlmReportWriterResult["details"]
        : undefined,
    generationTraceId:
      typeof data.generationTraceId === "string" ? data.generationTraceId : undefined,
    reportMode:
      data.reportMode === "short" || data.reportMode === "standard"
        ? data.reportMode
        : undefined,
    requestedModel:
      typeof data.requestedModel === "string" ? data.requestedModel : null,
    actualModel:
      typeof data.actualModel === "string" ? data.actualModel : null,
  };
}

async function resultFromErrorResponse(
  response: Response,
): Promise<LlmReportWriterResult> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const normalized = normalizeResult(payload);
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    ...normalized,
    ok: false,
    status: response.status === 400 ? "invalid_input" : "unavailable",
    llm_status: response.status === 504 ? "timeout" : "failed",
    fallback_used: Boolean(normalized.details?.fallbackUsed ?? normalized.fallback_used),
    message:
      typeof data.message === "string"
        ? data.message
        : response.status === 400
          ? "報告生成資料不足，請回到來源管理確認已接受來源。"
          : "目前 GPT 模型無法完成報告生成，請檢查 /api/llm/health 與 /api/llm/smoke。",
    warning:
      typeof data.warning === "string" ? data.warning : `LLM report writer HTTP ${response.status}`,
    sectionPlan: normalized.sectionPlan,
    sections: [],
    reportGenerationProvider:
      normalized.reportGenerationProvider === "ollama"
        ? "school-openai-compatible"
        : normalized.reportGenerationProvider,
    reportGenerationModel: normalized.actualModel ?? normalized.reportGenerationModel,
    reportGenerationStatus: response.status === 504 ? "timeout" : "failed",
    fallbackUsed: Boolean(normalized.details?.fallbackUsed ?? normalized.fallbackUsed),
    fallbackReason:
      typeof data.code === "string"
        ? data.code
        : normalized.fallbackReason ?? `LLM report writer HTTP ${response.status}`,
  };
}

export async function requestLlmReportDraft(input: {
  reportInput: ReportInput;
  workflowId: string | null;
  jobId?: string | null;
  topicHash: string | null;
  originalTopic: string;
  displayTitle: string;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  academicSafetyReview?: AcademicSafetyReview | null;
  generationMode: Exclude<ReportGenerationMode, "blocked">;
  timeoutMs?: number;
}): Promise<LlmReportWriterResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_REPORT_DRAFT_TIMEOUT_MS;
  const reportMode = reportModeFromGenerationMode(input.generationMode);
  const apiGenerationMode =
    input.generationMode === "background_report_mode"
      ? "background_report_mode"
      : "academic_claim_mode";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(reportWriterApiUrl("/api/generate-report"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId: input.workflowId,
        jobId: input.jobId ?? input.workflowId,
        topicHash: input.topicHash,
        topic: input.reportInput.topic,
        originalTopic: input.originalTopic,
        displayTitle: input.displayTitle,
        reportMode,
        reportType: input.reportInput.reportType,
        audience: input.reportInput.targetAudience || input.reportInput.academicLevel,
        language: input.reportInput.outputLanguage || "繁體中文",
        locale: "zh-TW",
        generationMode: apiGenerationMode,
        acceptedSources: input.acceptedSources,
        acceptedSourceIds: input.acceptedSources.map((source) => source.id).filter(Boolean),
        evidenceCards: input.evidenceCards,
        evidenceCardIds: input.evidenceCards.map((card) => card.id).filter(Boolean),
        academicSafetyReview: input.academicSafetyReview ?? null,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return timeoutFallbackResult(
        `LLM report writer timed out after ${timeoutMs}ms`,
      );
    }
    return {
      ok: false,
      status: "unavailable",
      llm_status: "failed",
      fallback_used: false,
      message: "目前 GPT 模型無法連線，請檢查 /api/llm/health 與 /api/llm/smoke。",
      warning:
        error instanceof Error ? error.message : "LLM report writer request failed",
      sectionPlan: [],
      sections: [],
      reportGenerationProvider: "school-openai-compatible",
      reportGenerationModel: null,
      reportGenerationStatus: "failed",
      fallbackUsed: false,
      fallbackReason: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    return resultFromErrorResponse(response);
  }
  return normalizeResult(await response.json());
}

export function mergeLlmReportDraft(
  workspace: ReportWorkspace,
  llmResult: LlmReportWriterResult,
): ReportWorkspace {
  const llmDiagnostics = {
    reportGenerationProvider: llmResult.reportGenerationProvider,
    reportGenerationModel: llmResult.reportGenerationModel,
    reportGenerationStatus: llmResult.reportGenerationStatus,
    fallbackUsed: llmResult.fallbackUsed,
    fallbackReason: llmResult.fallbackReason,
    message: llmResult.message,
    warning: llmResult.warning,
    sectionPlan: llmResult.sectionPlan,
  };
  if (llmResult.sections.length === 0) {
    return {
      ...workspace,
      llmDiagnostics,
      report: {
        ...workspace.report,
        meta: {
          ...workspace.report.meta,
          researchDraft: workspace.draft,
        },
      },
    };
  }
  const sectionsById = new Map(
    llmResult.sections.map((section) => [section.sectionId, section]),
  );
  const allowedEvidenceIds = new Set(workspace.evidenceCards.map((card) => card.id));
  const allowedSourceIds = new Set(workspace.sourceIds);
  const evidenceToSource = new Map(
    workspace.evidenceCards.map((card) => [card.id, card.sourceId]),
  );
  const sourceMarkerMap = buildStableCitationMarkerMap(workspace.acceptedSources);
  const acceptedMarkers = new Set(sourceMarkerMap.values());
  const nextDraft = {
    ...workspace.draft,
    sections: workspace.draft.sections.map((section) => {
      const llmSection = sectionsById.get(section.sectionId);
      if (!llmSection) return section;
      const evidenceCardIds = llmSection.evidenceCardIds.filter((id) =>
        allowedEvidenceIds.has(id),
      );
      const citationIds = llmSection.citationIds
        .map((id) => evidenceToSource.get(id) ?? id)
        .filter((id) => allowedSourceIds.has(id));
      const effectiveCitationIds =
        citationIds.length > 0
          ? citationIds
          : evidenceCardIds
              .map((id) => evidenceToSource.get(id))
              .filter((id): id is string => Boolean(id));
      const availableMarkers = effectiveCitationIds
        .map((id) => sourceMarkerMap.get(id))
        .filter((marker): marker is string => Boolean(marker));
      const fallbackSectionMarkers = section.citationMarkers.filter((marker) =>
        acceptedMarkers.has(marker),
      );
      const guardMarkers = availableMarkers.length > 0
        ? availableMarkers
        : fallbackSectionMarkers;
      const guarded = guardUnsupportedSectionClaims({
        sectionKey: section.sectionId as ResearchSectionKey,
        text: llmSection.prose,
        availableCitationMarkers: guardMarkers,
      });
      const actualMarkers = extractCitationMarkers(guarded.text)
        .filter((marker) => acceptedMarkers.has(marker));
      const actualCitationIds = sourceIdsFromCitationMarkers(actualMarkers, sourceMarkerMap);
      const effectiveEvidenceCardIds = evidenceCardIds.length
        ? evidenceCardIds
        : section.evidenceCardIds;
      const coverage = validateSectionEvidenceCoverage({
        sectionKey: section.sectionId as ResearchSectionKey,
        text: guarded.text,
        claims: selectSupportedClaimsForSection(
          workspace.draft.debug.supportedClaims ?? [],
          section.sectionId as ResearchSectionKey,
        ),
        evidenceCardIds: effectiveEvidenceCardIds,
        citationMarkers: actualMarkers,
      });
      return {
        ...section,
        title: llmSection.title || section.title,
        prose: guarded.text,
        body: guarded.text,
        synthesizedProseZhTw: guarded.text,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationIds: actualCitationIds,
        citationMarkers: actualMarkers,
        evidenceCoverageStatus: coverage.status,
        citationCount: coverage.citationCount,
        evidenceCardCount: coverage.evidenceCardCount,
        writerNote: "LLM report writer generated this section from accepted evidence cards.",
        warnings:
          llmSection.warnings && llmSection.warnings.length > 0
            ? Array.from(new Set([...llmSection.warnings, ...guarded.warnings]))
            : Array.from(new Set([...section.warnings, ...guarded.warnings])),
      };
    }),
  };
  nextDraft.text = nextDraft.sections
    .map((section) => `${section.title}\n${section.body}`)
    .join("\n\n");
  const nextQualityReport = buildQualityReport({
    topic: workspace.input.topic,
    depth: workspace.project.depth,
    acceptedSources: workspace.acceptedSources,
    evidenceCards: workspace.evidenceCards,
    sections: nextDraft.sections.map((section) => ({
      id: section.sectionId,
      key: section.sectionId as ResearchSectionKey,
      title: section.title,
      content: section.body,
      evidenceCardIds: section.evidenceCardIds,
      citationIds: section.citationIds,
      warnings: section.warnings,
    })),
  });
  nextDraft.qualityReport = nextQualityReport;
  return {
    ...workspace,
    llmDiagnostics,
    draft: nextDraft,
    report: {
      ...workspace.report,
      meta: {
        ...workspace.report.meta,
        researchDraft: nextDraft,
      },
    },
    qualityReport: nextQualityReport,
  };
}
