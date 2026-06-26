import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { runPythonWorker } from "./pythonWorker";

export async function parseWithPdfplumber(
  sourceId: string,
  workflowId: string,
  pdfUrl: string,
): Promise<ParsedDocument | null> {
  return (await runPythonWorker("parse_pdf.py", {
    sourceId,
    workflowId,
    pdfUrl,
    preferred: "pdfplumber",
  })) as ParsedDocument | null;
}
