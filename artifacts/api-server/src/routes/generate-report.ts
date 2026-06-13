import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import {
  GenerateReportRequestError,
  generateReportDocx,
} from "../services/report-generation";

const router: IRouter = Router();

router.post("/generate-report", async (req, res) => {
  try {
    const result = await generateReportDocx(req.body);

    res.status(200);
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", result.buffer.byteLength);
    res.setHeader("Content-Disposition", buildContentDisposition(result.filename));
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    res.setHeader("X-Report-Factory-Format", result.request.format);
    res.setHeader("X-Report-Factory-Report-Type", encodeURIComponent(result.request.reportType));
    res.send(result.buffer);
  } catch (error) {
    if (error instanceof GenerateReportRequestError) {
      res.status(400).json({ message: error.message, code: error.code });
      return;
    }

    logger.warn({ err: error }, "Report generation failed");
    res.status(500).json({ message: "報告生成暫時無法使用，請稍後再試。" });
  }
});

function buildContentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\;]/g, "_");
  const encodedFilename = encodeURIComponent(filename)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename}`;
}

export default router;
