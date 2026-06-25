import type { ReportGenerationMode, ReportWorkspace } from "./reportWorkspace.ts";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import type { EvidenceCard } from "./evidenceCards.ts";
import { buildQualityReport, type ResearchSectionKey } from "./qualityJudge.ts";

export interface LlmReportSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
  warnings?: string[];
}

export interface LlmReportWriterResult {
  ok: boolean;
  status: "success" | "unavailable" | "invalid_input" | "insufficient_sources" | "error";
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  message: string | null;
  warning: string | null;
  sections: LlmReportSection[];
  reportGenerationProvider: string;
  reportGenerationModel: string | null;
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  fallbackReason: string | null;
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

function normalizeResult(value: unknown): LlmReportWriterResult {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sections = Array.isArray(data.sections)
    ? data.sections
        .map(sanitizeSection)
        .filter((section): section is LlmReportSection => Boolean(section))
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
  };
}

export async function requestLlmReportDraft(input: {
  reportInput: ReportInput;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  generationMode: Exclude<ReportGenerationMode, "blocked">;
}): Promise<LlmReportWriterResult> {
  const response = await fetch("/api/generate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.reportInput.topic,
      reportType: input.reportInput.reportType,
      audience: input.reportInput.targetAudience || input.reportInput.academicLevel,
      language: input.reportInput.outputLanguage || "繁體中文",
      generationMode:
        input.generationMode === "quick_draft" ? "preliminary" : "formal",
      acceptedSources: input.acceptedSources,
      evidenceCards: input.evidenceCards,
    }),
  });
  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 400 ? "invalid_input" : "unavailable",
      llm_status: response.status === 504 ? "timeout" : "failed",
      fallback_used: true,
      message:
        response.status === 400
          ? "請提供有效主題與已接受來源後再生成報告。"
          : "LLM report service unavailable.",
      warning: `LLM report writer HTTP ${response.status}`,
      sections: [],
      reportGenerationProvider: "ollama",
      reportGenerationModel: null,
      reportGenerationStatus: response.status === 504 ? "timeout" : "failed",
      fallbackUsed: true,
      fallbackReason: `LLM report writer HTTP ${response.status}`,
    };
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
      return {
        ...section,
        title: llmSection.title || section.title,
        prose: llmSection.prose,
        body: llmSection.prose,
        evidenceCardIds: evidenceCardIds.length
          ? evidenceCardIds
          : section.evidenceCardIds,
        citationIds: effectiveCitationIds.length
          ? Array.from(new Set(effectiveCitationIds))
          : section.citationIds,
        citationMarkers: effectiveCitationIds.length
          ? effectiveCitationIds.map((_, index) => `（來源 ${index + 1}）`)
          : section.citationMarkers,
        writerNote: "LLM report writer generated this section from accepted evidence cards.",
        warnings:
          llmSection.warnings && llmSection.warnings.length > 0
            ? llmSection.warnings
            : section.warnings,
      };
    }),
    text: workspace.draft.sections
      .map((section) => {
        const llmSection = sectionsById.get(section.sectionId);
        return `${llmSection?.title ?? section.title}\n${llmSection?.prose ?? section.body}`;
      })
      .join("\n\n"),
  };
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
