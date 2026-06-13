import { runDocxPlugin } from "../../../report-factory/src/plugins/docxPlugin.ts";
import { runResearchWritingFlowSync } from "../../../report-factory/src/reportFactory/runResearchWritingFlow.ts";
import type { ReportDocument } from "../../../report-factory/src/plugins/contract.ts";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
const defaultReportType = "研究報告";
const defaultFormat = "docx";

export type SupportedReportFormat = typeof defaultFormat;

export interface NormalizedGenerateReportRequest {
  topic: string;
  reportType: string;
  format: SupportedReportFormat;
}

export interface GeneratedReportDocx {
  request: NormalizedGenerateReportRequest;
  document: ReportDocument;
  buffer: Buffer;
  filename: string;
  mimeType: typeof docxMimeType;
  warnings: string[];
}

export class GenerateReportRequestError extends Error {
  constructor(
    message: string,
    readonly code: "missing_topic" | "unsupported_format",
  ) {
    super(message);
    this.name = "GenerateReportRequestError";
  }
}

export function normalizeGenerateReportRequest(body: unknown): NormalizedGenerateReportRequest {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const topic = typeof input["topic"] === "string" ? input["topic"].trim() : "";

  if (!topic) {
    throw new GenerateReportRequestError("請輸入報告主題。", "missing_topic");
  }

  const reportType = typeof input["reportType"] === "string" && input["reportType"].trim()
    ? input["reportType"].trim()
    : defaultReportType;
  const rawFormat = input["format"];
  const format = typeof rawFormat === "string" ? rawFormat.trim().toLowerCase() : "";

  if (format && format !== defaultFormat) {
    throw new GenerateReportRequestError("目前只支援 docx 格式。", "unsupported_format");
  }

  return {
    topic,
    reportType,
    format: defaultFormat,
  };
}

export async function generateReportDocx(body: unknown): Promise<GeneratedReportDocx> {
  const request = normalizeGenerateReportRequest(body);
  const flow = runResearchWritingFlowSync({
    topic: request.topic,
    reportType: request.reportType,
  });
  const docxResult = await runDocxPlugin({
    document: flow.document,
    mode: "blob",
  });

  if (!docxResult.blob) {
    throw new Error("DOCX plugin did not return a blob.");
  }

  return {
    request,
    document: flow.document,
    buffer: Buffer.from(await docxResult.blob.arrayBuffer()),
    filename: buildReportDocxFilename(request.topic),
    mimeType: docxResult.mimeType,
    warnings: Array.from(new Set([...flow.warnings, ...docxResult.warnings])),
  };
}

export function buildReportDocxFilename(topic: string, date = new Date()): string {
  const dateStamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const safeTopic = topic
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\n\r\u0000-\u001f]+/g, "")
    .replace(/[. ]+$/, "")
    .slice(0, 40)
    .replace(/[. ]+$/, "");

  return `ResearchForge-${safeTopic || "report-draft"}-${dateStamp}.docx`;
}
