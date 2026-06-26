import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { runPythonWorker } from "./pythonWorker";

export async function parseWithTesseractOcr(
  sourceId: string,
  workflowId: string,
  pdfUrl: string,
): Promise<ParsedDocument | null> {
  return (await runPythonWorker("ocr_pdf.py", {
    sourceId,
    workflowId,
    pdfUrl,
    preferred: "tesseract",
  })) as ParsedDocument | null;
}
