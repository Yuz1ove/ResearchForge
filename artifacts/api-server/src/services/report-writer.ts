import type { SourceRecord } from "@workspace/api-zod";
import {
  LlmAdapterError,
  requestOpenAICompatibleChatCompletion,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";

export interface ReportWriterInput {
  topic: string;
  reportType?: string;
  audience?: string;
  language?: string;
  generationMode?: "preliminary" | "formal" | string;
  acceptedSources: SourceRecord[];
  evidenceCards?: ReportWriterEvidenceCard[];
}

export interface ReportWriterSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
}

export interface ReportWriterEvidenceCard {
  id: string;
  sourceId: string;
  claim: string;
  evidence: string;
  summary: string;
  relevance: string;
  sourceTitle: string;
  sourceProvider: string;
  doi?: string | null;
  abstract?: string | null;
  provider?: string | null;
  relevanceScore?: number | null;
  sourceQualityScore?: number | null;
  finalScore?: number | null;
  year: number | null;
  usableSections: string[];
  citationText: string;
  limitation: string | null;
}

export interface ReportWriterResult {
  ok: boolean;
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  model?: string;
  warning: string | null;
  sections: ReportWriterSection[];
}

export interface ReportWriterOptions {
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

const SECTION_PLAN = [
  {
    sectionId: "abstract",
    title: "摘要",
    instruction: "用 1 段說明研究主題、來源基礎、主要方向與限制。",
  },
  {
    sectionId: "introduction",
    title: "一、研究背景與問題意識",
    instruction: "說明為什麼此主題值得研究，並界定討論範圍。",
  },
  {
    sectionId: "literature_review",
    title: "二、來源整理與文獻觀點",
    instruction: "整合已接受來源的共同觀點，避免逐張來源卡貼上。",
  },
  {
    sectionId: "findings",
    title: "三、主要發現",
    instruction: "用正式報告口吻整理可由來源支撐的發現。",
  },
  {
    sectionId: "discussion",
    title: "四、討論",
    instruction: "說明發現的意義、可能解釋與資料限制。",
  },
  {
    sectionId: "conclusion",
    title: "五、結論",
    instruction: "提出保守結論與後續可補資料。",
  },
] as const;

function sourceText(source: SourceRecord, index: number): string {
  const id = source.id || `source-${index + 1}`;
  const title = source.title || "標題待確認";
  const abstract = source.abstract?.trim() || "摘要不足";
  const citation = source.authors?.[0]?.trim() || source.publisher?.trim() || "作者待確認";
  return [
    `evidenceCardId: evidence:${id}:0`,
    `sourceId: ${id}`,
    `claim: 此來源可作為「${title}」的摘要型佐證。`,
    `evidence: ${abstract.slice(0, 700)}`,
    `source: ${title}`,
    `provider: ${source.sourceType}`,
    `citationText: ${citation}（${source.year ?? "年份待確認"}）`,
    `limitation: ${source.abstract?.trim() ? "目前依摘要整理，尚未讀取全文。" : "此來源尚無摘要，僅可建立書目線索。"}`,
  ].join("\n");
}

function compactEvidenceCard(card: ReportWriterEvidenceCard, index: number): string {
  return [
    `evidenceCardId: ${card.id || `evidence-${index + 1}`}`,
    `sourceId: ${card.sourceId}`,
    `claim: ${card.claim || "證據重點待補"}`,
    `evidence: ${(card.evidence || card.summary || "證據摘要不足").slice(0, 700)}`,
    `relevance: ${card.relevance || "研究背景"}`,
    `source: ${card.sourceTitle || "標題待確認"}`,
    `provider: ${card.provider || card.sourceProvider || "unknown"}`,
    `scores: relevance=${card.relevanceScore ?? "n/a"}, sourceQuality=${card.sourceQualityScore ?? "n/a"}, final=${card.finalScore ?? "n/a"}`,
    `citationText: ${card.citationText || "引用資訊待確認"}`,
    `limitation: ${card.limitation || "目前依已接受來源與證據卡整理，不可超出證據內容。"}`,
  ].join("\n");
}

function fallbackEvidenceCards(sources: SourceRecord[]): ReportWriterEvidenceCard[] {
  return sources.map((source, index) => {
    const id = source.id || `source-${index + 1}`;
    const title = source.title || "標題待確認";
    const abstract = source.abstract?.trim() || "此來源尚無摘要，僅可作為書目線索。";
    const citation = source.authors?.[0]?.trim() || source.publisher?.trim() || "作者待確認";
    return {
      id: `evidence:${id}:0`,
      sourceId: id,
      claim: source.abstract?.trim()
        ? `來源 ${index + 1} 可作為「${title}」的摘要型佐證。`
        : `來源 ${index + 1} 僅提供「${title}」的書目線索。`,
      evidence: abstract,
      summary: abstract,
      relevance: "研究背景",
      sourceTitle: title,
      sourceProvider: source.sourceType,
      doi: source.doi,
      abstract: source.abstract,
      provider: source.provider || source.sourceType,
      relevanceScore: source.relevanceScore ?? null,
      sourceQualityScore: source.sourceQualityScore ?? null,
      finalScore: source.finalScore ?? null,
      year: source.year,
      usableSections: [],
      citationText: `${citation}（${source.year ?? "年份待確認"}）`,
      limitation: source.abstract?.trim()
        ? "目前依摘要整理，尚未讀取全文。"
        : "此來源尚無摘要，僅可建立書目線索。",
    };
  });
}

function validEvidenceCards(
  inputCards: ReportWriterEvidenceCard[] | undefined,
  sources: SourceRecord[],
): ReportWriterEvidenceCard[] {
  const acceptedSourceIds = new Set(
    sources.map((source, index) => source.id || `source-${index + 1}`),
  );
  const cards = (inputCards ?? []).filter(
    (card) =>
      card?.id?.trim() &&
      card?.sourceId?.trim() &&
      acceptedSourceIds.has(card.sourceId) &&
      (card.evidence?.trim() || card.summary?.trim() || card.claim?.trim()),
  );
  return cards.length ? cards : fallbackEvidenceCards(sources);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function sanitizeSection(
  value: unknown,
  evidenceToSource: Map<string, string>,
  allowedSourceIds: Set<string>,
): ReportWriterSection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const prose = typeof data.prose === "string" ? data.prose.trim() : "";
  const evidenceCardIds = stringList(
    data.evidenceCardIds ?? data.evidence_card_ids ?? data.evidenceIds,
  ).filter((id) => evidenceToSource.has(id));
  const citationIds = stringList(data.citationIds)
    .map((id) => evidenceToSource.get(id) ?? id)
    .filter((id) => allowedSourceIds.has(id));
  const mappedCitationIds =
    citationIds.length > 0
      ? citationIds
      : evidenceCardIds
          .map((id) => evidenceToSource.get(id))
          .filter((id): id is string => Boolean(id));
  if (!sectionId || !title || prose.length < 20 || evidenceCardIds.length === 0) return null;
  return {
    sectionId,
    title,
    prose,
    evidenceCardIds,
    citationIds: Array.from(new Set(mappedCitationIds)),
  };
}

function sectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.sections)) return data.sections;
  }
  return [];
}

function fallbackStatus(error: unknown): ReportWriterResult["llm_status"] {
  if (!(error instanceof LlmAdapterError)) return "failed";
  if (error.code === "provider-unconfigured") return "skipped";
  if (error.code === "provider-timeout") return "timeout";
  if (error.code === "provider-quota") return "quota_exceeded";
  return "failed";
}

function fallbackWarning(error: unknown): string {
  if (error instanceof LlmAdapterError) {
    return `LLM report writer fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) return `LLM report writer fallback: ${error.message}`;
  return "LLM report writer fallback: unknown provider failure";
}

export async function writeReportWithLlm(
  input: ReportWriterInput,
  options: ReportWriterOptions = {},
): Promise<ReportWriterResult> {
  const sources = input.acceptedSources.filter(
    (source) => source.reviewState === "accepted",
  );
  const evidenceCards = validEvidenceCards(input.evidenceCards, sources);
  if (sources.length < 3 || evidenceCards.length < 3) {
    return {
      ok: false,
      llm_status: "skipped",
      fallback_used: true,
      warning: "accepted_evidence_cards_below_minimum",
      sections: [],
    };
  }
  const evidenceToSource = new Map(
    evidenceCards.map((card) => [card.id, card.sourceId]),
  );
  const allowedSourceIds = new Set(sources.map((source) => source.id).filter(Boolean));

  try {
    const content = await requestOpenAICompatibleChatCompletion({
      purpose: "report_writer",
      temperature: 0.2,
      maxTokens: 1_800,
      responseFormat: "json_object",
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      messages: [
        {
          role: "system",
          content: [
            "You are ResearchForge's report writer.",
            "Output valid JSON only. No markdown. No explanation.",
            "Write formal Traditional Chinese prose using only provided evidenceCards.",
            "Do not invent statistics, authors, URLs, DOI, or citations.",
            "Every section needs at least one provided evidenceCardId and inline marker like （來源 1）.",
            "Do not cite ids outside provided evidenceCards or accepted sources.",
            "Schema: {\"sections\":[{\"sectionId\":\"abstract\",\"title\":\"摘要\",\"prose\":\"paragraph\",\"evidenceCardIds\":[\"evidence id\"],\"citationIds\":[\"source id\"]}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `reportType: ${input.reportType ?? "研究報告"}`,
            `audience: ${input.audience ?? "高中"}`,
            `language: ${input.language ?? "繁體中文"}`,
            `generationMode: ${input.generationMode ?? "formal"}`,
            input.generationMode === "preliminary"
              ? "First paragraph must say this is a preliminary report because primary sources are insufficient."
              : "Write a formal report with clear source limits.",
            "Required sectionIds: abstract, introduction, literature_review, findings, discussion, conclusion.",
            `Section plan: ${JSON.stringify(SECTION_PLAN)}`,
            "Evidence cards:",
            evidenceCards.slice(0, 12).map(compactEvidenceCard).join("\n\n"),
          ].join("\n\n"),
        },
      ],
    });
    const parsed = safeJsonParse(content);
    const sections = sectionItems(parsed)
      .map((section) =>
        sanitizeSection(section, evidenceToSource, allowedSourceIds),
      )
      .filter((section): section is ReportWriterSection => Boolean(section));
    if (sections.length < 3) {
      throw new LlmAdapterError(
        "invalid-json",
        "LLM report writer returned too few valid sections.",
      );
    }
    return {
      ok: true,
      llm_status: "success",
      fallback_used: false,
      warning: null,
      sections,
    };
  } catch (error) {
    return {
      ok: false,
      llm_status: fallbackStatus(error),
      fallback_used: true,
      warning: fallbackWarning(error),
      sections: [],
    };
  }
}
