import { runDocxPlugin } from "../../../report-factory/src/plugins/docxPlugin.ts";
import { runResearchWritingFlowSync } from "../../../report-factory/src/reportFactory/runResearchWritingFlow.ts";
import type { ReportDocument } from "../../../report-factory/src/plugins/contract.ts";

export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
export const DEFAULT_REPORT_TYPE = "研究報告";
export const DEFAULT_REPORT_FORMAT = "docx";

export type SupportedReportFormat = typeof DEFAULT_REPORT_FORMAT;
export type GenerateReportErrorCode =
  | "MISSING_TOPIC"
  | "UNSUPPORTED_FORMAT"
  | "GENERATION_FAILURE"
  | "UNEXPECTED_SERVER_ERROR";

export interface GenerateReportRequestBody {
  topic?: string;
  reportType?: string;
  format?: SupportedReportFormat;
}

export interface GenerateReportErrorResponse {
  ok: false;
  error: {
    code: GenerateReportErrorCode;
    message: string;
  };
}

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
  mimeType: typeof DOCX_MIME_TYPE;
  warnings: string[];
}

export class GenerateReportRequestError extends Error {
  constructor(
    message: string,
    readonly code: "MISSING_TOPIC" | "UNSUPPORTED_FORMAT",
  ) {
    super(message);
    this.name = "GenerateReportRequestError";
  }
}

export class GenerateReportGenerationError extends Error {
  readonly code = "GENERATION_FAILURE" satisfies GenerateReportErrorCode;

  constructor(message = "Report generation failed.", options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "GenerateReportGenerationError";
  }
}

export function buildGenerateReportErrorResponse(
  code: GenerateReportErrorCode,
  message: string,
): GenerateReportErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
    },
  };
}

export function normalizeGenerateReportRequest(body: unknown): NormalizedGenerateReportRequest {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const topic = typeof input["topic"] === "string" ? input["topic"].trim() : "";

  if (!topic) {
    throw new GenerateReportRequestError("Topic is required.", "MISSING_TOPIC");
  }

  const reportType = typeof input["reportType"] === "string" && input["reportType"].trim()
    ? input["reportType"].trim()
    : DEFAULT_REPORT_TYPE;
  const rawFormat = input["format"];
  const format = normalizeReportFormat(rawFormat);

  if (format !== DEFAULT_REPORT_FORMAT) {
    throw new GenerateReportRequestError("Only docx format is supported.", "UNSUPPORTED_FORMAT");
  }

  return {
    topic,
    reportType,
    format: DEFAULT_REPORT_FORMAT,
  };
}

function normalizeReportFormat(format: unknown): string {
  if (format === undefined || format === null) return DEFAULT_REPORT_FORMAT;
  if (typeof format !== "string") return "";

  const trimmed = format.trim();
  return trimmed ? trimmed.toLowerCase() : DEFAULT_REPORT_FORMAT;
}

export async function generateReportDocx(body: unknown): Promise<GeneratedReportDocx> {
  const request = normalizeGenerateReportRequest(body);

  try {
    const flow = runResearchWritingFlowSync({
      topic: request.topic,
      reportType: request.reportType,
    });
    const docxResult = await runDocxPlugin({
      document: flow.document,
      mode: "blob",
    });

    if (!docxResult.blob) {
      throw new GenerateReportGenerationError("DOCX plugin did not return a blob.");
    }

    return {
      request,
      document: flow.document,
      buffer: Buffer.from(await docxResult.blob.arrayBuffer()),
      filename: buildReportDocxFilename(request.topic),
      mimeType: docxResult.mimeType,
      warnings: Array.from(new Set([...flow.warnings, ...docxResult.warnings])),
    };
  } catch (error) {
    if (error instanceof GenerateReportGenerationError) {
      throw error;
    }

    throw new GenerateReportGenerationError("Report generation failed.", { cause: error });
  }
}

export function buildReportDocxFilename(topic: string, date = new Date()): string {
  const dateStamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  const safeTopic = sanitizeReportTopicForFilename(topic);

  return `ResearchForge-${safeTopic}-${dateStamp}.docx`;
}

export function sanitizeReportTopicForFilename(topic: string): string {
  const safeTopic = Array.from(
    topic
      .normalize("NFKC")
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\n\r\u0000-\u001f\u007f]+/g, "-")
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gi, "")
      .replace(/\s+/g, "-")
      .replace(/\.\.+/g, ".")
      .replace(/-+/g, "-")
      .replace(/^[. -]+/, "")
      .replace(/[. -]+$/, ""),
  )
    .slice(0, 48)
    .join("")
    .trim()
    .replace(/[. -]+$/, "");

  return safeTopic || "report-draft";
}
