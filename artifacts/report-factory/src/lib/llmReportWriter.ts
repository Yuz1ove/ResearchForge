import type { ReportGenerationMode, ReportWorkspace } from "./reportWorkspace.ts";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import type { EvidenceCard } from "./evidenceCards.ts";

export interface LlmReportSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
}

export interface LlmReportWriterResult {
  ok: boolean;
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  warning: string | null;
  sections: LlmReportSection[];
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
  if (!sectionId || !title || !prose) return null;
  return { sectionId, title, prose, evidenceCardIds, citationIds };
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
    llm_status:
      data.llm_status === "success" ||
      data.llm_status === "timeout" ||
      data.llm_status === "quota_exceeded" ||
      data.llm_status === "failed" ||
      data.llm_status === "skipped"
        ? data.llm_status
        : "failed",
    fallback_used: data.fallback_used === true,
    warning: typeof data.warning === "string" ? data.warning : null,
    sections,
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
      llm_status: response.status === 504 ? "timeout" : "failed",
      fallback_used: true,
      warning: `LLM report writer HTTP ${response.status}`,
      sections: [],
    };
  }
  return normalizeResult(await response.json());
}

export function mergeLlmReportDraft(
  workspace: ReportWorkspace,
  llmResult: LlmReportWriterResult,
): ReportWorkspace {
  if (!llmResult.ok || llmResult.sections.length === 0) return workspace;
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
      };
    }),
    text: workspace.draft.sections
      .map((section) => {
        const llmSection = sectionsById.get(section.sectionId);
        return `${llmSection?.title ?? section.title}\n${llmSection?.prose ?? section.body}`;
      })
      .join("\n\n"),
  };
  return {
    ...workspace,
    draft: nextDraft,
    report: {
      ...workspace.report,
      meta: {
        ...workspace.report.meta,
        researchDraft: nextDraft,
      },
    },
    qualityReport: nextDraft.qualityReport,
  };
}
