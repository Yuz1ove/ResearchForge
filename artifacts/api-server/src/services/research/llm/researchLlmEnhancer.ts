import type {
  ResearchEvidenceCard,
  ResearchQueryPlan,
  ResearchReportParagraph,
} from "@workspace/api-zod/research-tools";
import { safeJsonParse } from "../../llm-adapter";
import {
  logLlmFallback,
  messageFromStatus,
  reasonFromError,
  requestLlmText,
  statusFromLlmError,
} from "../../llm-service";
import { schoolProviderEnvPresent } from "../../llm/schoolProvider";

const FALLBACK_NOTICE = "AI 服務暫時不可用，已使用本地規則 fallback";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 6);
}

function compactEvidenceCard(card: ResearchEvidenceCard): string {
  return [
    `id: ${card.id}`,
    `subtopic: ${card.researchSubtopic}`,
    `claimOrFinding: ${card.claimOrFinding}`,
    `keyEvidence: ${card.keyEvidence.slice(0, 900)}`,
    `translatedSummaryZh: ${card.translatedSummaryZh.slice(0, 700)}`,
    `limitations: ${card.limitations.join("；")}`,
    `basis: ${card.evidenceBasis}`,
    `citationMarker: ${card.citationMarker}`,
  ].join("\n");
}

function compactParagraph(paragraph: ResearchReportParagraph): string {
  return [
    `id: ${paragraph.id}`,
    `sectionTitle: ${paragraph.sectionTitle}`,
    `text: ${paragraph.text.slice(0, 1100)}`,
    `citationIds: ${paragraph.citationIds.join(", ")}`,
  ].join("\n");
}

function outputItems(value: unknown, key: string): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const data = value as Record<string, unknown>;
  return Array.isArray(data[key]) ? data[key] : [];
}

export async function enhanceEvidenceCardsWithSchoolLlm(input: {
  topic: string;
  queryPlan: ResearchQueryPlan;
  evidenceCards: ResearchEvidenceCard[];
}): Promise<{
  evidenceCards: ResearchEvidenceCard[];
  warnings: string[];
  llmStatus: "success" | "skipped" | "fallback";
}> {
  if (input.evidenceCards.length === 0 || !schoolProviderEnvPresent()) {
    return { evidenceCards: input.evidenceCards, warnings: [], llmStatus: "skipped" };
  }

  try {
    const llmResult = await requestLlmText({
      operation: "source_summary",
      featureName: "evidence_card_extraction",
      purpose: "summarizer",
      temperature: 0,
      maxTokens: 1_400,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: [
            "You improve ResearchForge evidence cards.",
            "Return valid JSON only. No markdown.",
            "Use only the supplied card text. Do not invent methods, statistics, authors, DOI, or full text.",
            "Keep citation markers and ids unchanged.",
            "Write Traditional Chinese.",
            "Schema: {\"cards\":[{\"id\":\"same id\",\"claimOrFinding\":\"supported claim\",\"keyEvidence\":\"supported evidence\",\"translatedSummaryZh\":\"reader summary\",\"relevanceReason\":\"why this supports the topic\",\"limitations\":[\"limitation\"]}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `normalizedTopic: ${input.queryPlan.normalizedTopic}`,
            ...input.evidenceCards.slice(0, 12).map(compactEvidenceCard),
          ].join("\n\n"),
        },
      ],
    });

    const parsed = safeJsonParse(llmResult.content);
    const byId = new Map(
      outputItems(parsed, "cards")
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const data = item as Record<string, unknown>;
          const id = cleanText(data.id);
          if (!id) return null;
          return [
            id,
            {
              claimOrFinding: cleanText(data.claimOrFinding),
              keyEvidence: cleanText(data.keyEvidence),
              translatedSummaryZh: cleanText(data.translatedSummaryZh),
              relevanceReason: cleanText(data.relevanceReason),
              limitations: stringList(data.limitations),
            },
          ] as const;
        })
        .filter((item): item is readonly [
          string,
          {
            claimOrFinding: string;
            keyEvidence: string;
            translatedSummaryZh: string;
            relevanceReason: string;
            limitations: string[];
          },
        ] => Boolean(item)),
    );

    if (byId.size === 0) {
      return {
        evidenceCards: input.evidenceCards,
        warnings: [FALLBACK_NOTICE],
        llmStatus: "fallback",
      };
    }

    return {
      evidenceCards: input.evidenceCards.map((card) => {
        const enhanced = byId.get(card.id);
        if (!enhanced) return card;
        return {
          ...card,
          claimOrFinding: enhanced.claimOrFinding || card.claimOrFinding,
          keyEvidence: enhanced.keyEvidence || card.keyEvidence,
          translatedSummaryZh: enhanced.translatedSummaryZh || card.translatedSummaryZh,
          relevanceReason: enhanced.relevanceReason || card.relevanceReason,
          limitations: enhanced.limitations.length ? enhanced.limitations : card.limitations,
        };
      }),
      warnings: [],
      llmStatus: "success",
    };
  } catch (error) {
    const status = statusFromLlmError(error);
    logLlmFallback({
      operation: "source_summary",
      status,
      provider: process.env.SCHOOL_LLM_PROVIDER?.trim() || "school",
      model: process.env.SCHOOL_LLM_MODEL?.trim() || null,
      endpoint: null,
      reason: reasonFromError(error),
      route: "/api/research/build-evidence-cards",
    });
    return {
      evidenceCards: input.evidenceCards,
      warnings: [messageFromStatus(status, "source_summary") || FALLBACK_NOTICE],
      llmStatus: "fallback",
    };
  }
}

export async function polishResearchParagraphsWithSchoolLlm(input: {
  topic: string;
  queryPlan: ResearchQueryPlan;
  paragraphs: ResearchReportParagraph[];
}): Promise<{
  paragraphs: ResearchReportParagraph[];
  warnings: string[];
  llmStatus: "success" | "skipped" | "fallback";
}> {
  if (input.paragraphs.length === 0 || !schoolProviderEnvPresent()) {
    return { paragraphs: input.paragraphs, warnings: [], llmStatus: "skipped" };
  }

  try {
    const llmResult = await requestLlmText({
      operation: "report_generation",
      featureName: "final_polishing",
      purpose: "section_writer",
      temperature: 0.1,
      maxTokens: 1_800,
      responseFormat: "json_object",
      messages: [
        {
          role: "system",
          content: [
            "You polish ResearchForge report paragraphs in Traditional Chinese.",
            "Return JSON only. No markdown.",
            "Do not add new claims, citations, statistics, authors, or sources.",
            "Preserve citation markers and paragraph ids exactly.",
            "Improve clarity and flow while keeping the same evidence boundaries.",
            "Schema: {\"paragraphs\":[{\"id\":\"same id\",\"text\":\"polished text\"}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `normalizedTopic: ${input.queryPlan.normalizedTopic}`,
            ...input.paragraphs.slice(0, 12).map(compactParagraph),
          ].join("\n\n"),
        },
      ],
    });

    const parsed = safeJsonParse(llmResult.content);
    const polishedById = new Map(
      outputItems(parsed, "paragraphs")
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const data = item as Record<string, unknown>;
          const id = cleanText(data.id);
          const text = cleanText(data.text);
          return id && text ? [id, text] as const : null;
        })
        .filter((item): item is readonly [string, string] => Boolean(item)),
    );

    if (polishedById.size === 0) {
      return { paragraphs: input.paragraphs, warnings: [FALLBACK_NOTICE], llmStatus: "fallback" };
    }

    return {
      paragraphs: input.paragraphs.map((paragraph) => ({
        ...paragraph,
        text: polishedById.get(paragraph.id) ?? paragraph.text,
      })),
      warnings: [],
      llmStatus: "success",
    };
  } catch (error) {
    const status = statusFromLlmError(error);
    logLlmFallback({
      operation: "report_generation",
      status,
      provider: process.env.SCHOOL_LLM_PROVIDER?.trim() || "school",
      model: process.env.SCHOOL_LLM_MODEL?.trim() || null,
      endpoint: null,
      reason: reasonFromError(error),
      route: "/api/research/synthesize-report",
    });
    return {
      paragraphs: input.paragraphs,
      warnings: [messageFromStatus(status, "report_generation") || FALLBACK_NOTICE],
      llmStatus: "fallback",
    };
  }
}
