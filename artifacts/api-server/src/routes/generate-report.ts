import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import {
  buildGenerateReportErrorResponse,
  DOCX_MIME_TYPE,
  GenerateReportGenerationError,
  GenerateReportRequestError,
  type GeneratedReportDocx,
  generateReportDocx,
} from "../services/report-generation";

export type GenerateReportDocxHandler = (body: unknown) => Promise<GeneratedReportDocx>;

export function createGenerateReportRouter(
  generateDocx: GenerateReportDocxHandler = generateReportDocx,
): IRouter {
  const router: IRouter = Router();

  router.post("/generate-report", async (req, res) => {
    try {
      const result = await generateDocx(req.body);

      // Success intentionally returns DOCX bytes instead of a JSON envelope.
      // Download metadata is exposed through headers and covered by route tests.
      res.status(200);
      res.setHeader("Content-Type", result.mimeType || DOCX_MIME_TYPE);
      res.setHeader("Content-Length", result.buffer.byteLength);
      res.setHeader("Content-Disposition", buildContentDisposition(result.filename));
      res.setHeader(
        "Access-Control-Expose-Headers",
        [
          "Content-Disposition",
          "Content-Length",
          "X-Report-Factory-Format",
          "X-Report-Factory-Report-Type",
          "X-Report-Factory-Warnings",
        ].join(", "),
      );
      res.setHeader("X-Report-Factory-Format", result.request.format);
      res.setHeader("X-Report-Factory-Report-Type", encodeURIComponent(result.request.reportType));
      res.setHeader("X-Report-Factory-Warnings", String(result.warnings.length));
      res.send(result.buffer);
    } catch (error) {
      if (error instanceof GenerateReportRequestError) {
        res.status(400).json(buildGenerateReportErrorResponse(error.code, error.message));
        return;
      }

      if (error instanceof GenerateReportGenerationError) {
        logger.warn({ err: error }, "Report generation failed");
        res.status(500).json(buildGenerateReportErrorResponse(error.code, "Report generation failed."));
        return;
      }

      logger.error({ err: error }, "Unexpected report generation server error");
      res.status(500).json(
        buildGenerateReportErrorResponse("UNEXPECTED_SERVER_ERROR", "Unexpected server error."),
      );
    }
  });

  return router;
}

function buildContentDisposition(filename: string): string {
  const asciiFallback = filename
    .replace(/[^\x20-\x7e]+/g, "_")
    .replace(/["\\;/]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/_+/g, "_")
    .slice(0, 120);
  const encodedFilename = encodeURIComponent(filename)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

const router = createGenerateReportRouter();

export default router;
