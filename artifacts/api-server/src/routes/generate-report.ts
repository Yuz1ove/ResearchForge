import { Router, type IRouter } from "express";
import { normalizeSourceRecord, type SourceRecord } from "@workspace/api-zod";
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
    .map((card) => {
      if (!card || typeof card !== "object") return null;
      const data = card as Record<string, unknown>;
      const id = cleanString(data.id);
      const sourceId = cleanString(data.sourceId);
      if (!id || !sourceId) return null;
      return {
        id,
        sourceId,
        claim: cleanString(data.claim) ?? "",
        evidence: cleanString(data.evidence) ?? "",
        summary: cleanString(data.summary) ?? "",
        relevance: cleanString(data.relevance) ?? "",
        sourceTitle: cleanString(data.sourceTitle) ?? "",
        sourceProvider: cleanString(data.sourceProvider) ?? "",
        year: typeof data.year === "number" ? data.year : null,
        usableSections: Array.isArray(data.usableSections)
          ? data.usableSections
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        citationText: cleanString(data.citationText) ?? "",
        limitation: cleanString(data.limitation) ?? null,
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
  if (!topic || acceptedSources.length < 3) return null;

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
        message: "請提供主題與至少 3 筆已接受來源。",
      });
      return;
    }

    const result = await reportWriter(normalized);
    res.json(result);
  });

  return router;
}

export default createGenerateReportRouter();
