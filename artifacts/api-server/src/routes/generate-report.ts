import { Router, type IRouter } from "express";
import { normalizeSourceRecord, type SourceRecord } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  writeReportWithLlm,
  type ReportWriterInput,
  type ReportWriterResult,
  type ReportWriterEvidenceCard,
} from "../services/report-writer";

export type GenerateReportHandler = (
  input: ReportWriterInput,
) => Promise<ReportWriterResult>;

export interface GenerateReportRouterOptions {
  reportWriter?: GenerateReportHandler;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAcceptedSources(value: unknown): SourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((source) => {
      if (!source || typeof source !== "object") return null;
      try {
        return normalizeSourceRecord(source as SourceRecord);
      } catch {
        return null;
      }
    })
    .filter((source): source is SourceRecord => Boolean(source))
    .map((source) => ({ ...source, reviewState: "accepted" }));
}

function normalizeEvidenceCards(value: unknown): ReportWriterEvidenceCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((card): ReportWriterEvidenceCard | null => {
      if (!card || typeof card !== "object") return null;
      const data = card as Record<string, unknown>;
      const id = cleanString(data.id);
      const sourceId = cleanString(data.sourceId);
      if (!id || !sourceId) return null;
      return {
        id,
        sourceId,
        title: cleanString(data.title) ?? cleanString(data.sourceTitle) ?? "",
        claim: cleanString(data.claim) ?? "",
        evidence: cleanString(data.evidence) ?? "",
        summary: cleanString(data.summary) ?? "",
        relevance: cleanString(data.relevance) ?? "",
        sourceType: cleanString(data.sourceType) ?? "",
        reliability: cleanString(data.reliability) ?? "",
        mainClaim: cleanString(data.mainClaim) ?? "",
        usableEvidence: cleanString(data.usableEvidence) ?? "",
        limitations: Array.isArray(data.limitations)
          ? data.limitations
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        sectionTargets: Array.isArray(data.sectionTargets)
          ? data.sectionTargets
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        sourceTitle: cleanString(data.sourceTitle) ?? "",
        sourceProvider: cleanString(data.sourceProvider) ?? "",
        doi: cleanString(data.doi) ?? null,
        abstract: cleanString(data.abstract) ?? null,
        provider: cleanString(data.provider) ?? cleanString(data.sourceProvider) ?? null,
        relevanceScore: optionalScore(data.relevanceScore),
        sourceQualityScore: optionalScore(data.sourceQualityScore),
        finalScore: optionalScore(data.finalScore),
        year: typeof data.year === "number" ? data.year : null,
        usableSections: Array.isArray(data.usableSections)
          ? data.usableSections
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        citationText: cleanString(data.citationText) ?? "",
        limitation: cleanString(data.limitation) ?? null,
        derivation: cleanString(data.derivation) ?? null,
        evidenceGrounding: cleanString(data.evidenceGrounding) ?? null,
        summaryStructuredStatus: cleanString(data.summaryStructuredStatus) ?? null,
        llmSummaryStatus: cleanString(data.llmSummaryStatus) ?? null,
      };
    })
    .filter((card): card is ReportWriterEvidenceCard => Boolean(card));
}

export function normalizeGenerateReportRequest(body: unknown): ReportWriterInput | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const topic = cleanString(data.topic);
  const acceptedSources = normalizeAcceptedSources(data.acceptedSources);
  const evidenceCards = normalizeEvidenceCards(data.evidenceCards);
  if (!topic || acceptedSources.length < 1) return null;

  return {
    topic,
    reportType: cleanString(data.reportType),
    audience: cleanString(data.audience),
    language: cleanString(data.language),
    generationMode: cleanString(data.generationMode),
    acceptedSources,
    evidenceCards,
  };
}

export function createGenerateReportRouter({
  reportWriter = writeReportWithLlm,
}: GenerateReportRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/generate-report", async (req, res) => {
    const normalized = normalizeGenerateReportRequest(req.body);
    if (!normalized) {
      res.status(400).json({
        status: "invalid_input",
        message: "請提供主題與至少 1 筆已接受來源。",
      });
      return;
    }

    try {
      const result = await reportWriter(normalized);
      res.json(result);
    } catch (error) {
      const fallbackReason =
        error instanceof Error ? error.message : "unknown report generation failure";
      logger.warn({ err: error, route: "/api/generate-report" }, "Report generation failed");
      res.status(200).json({
        ok: false,
        status: "error",
        llm_status: "failed",
        fallback_used: true,
        model: process.env.OLLAMA_MODEL?.trim() || process.env.LLM_MODEL?.trim() || null,
        message: "Report generation failed unexpectedly.",
        warning: `LLM report writer fallback: ${fallbackReason}`,
        sections: [],
        reportGenerationProvider: process.env.LLM_PROVIDER?.trim() || "ollama",
        reportGenerationModel:
          process.env.OLLAMA_MODEL?.trim() || process.env.LLM_MODEL?.trim() || null,
        reportGenerationStatus: "failed",
        fallbackUsed: true,
        fallbackReason,
      });
    }
  });

  return router;
}

export default createGenerateReportRouter();
