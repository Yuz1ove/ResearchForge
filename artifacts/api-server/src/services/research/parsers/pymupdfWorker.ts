import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { runPythonWorker } from "./pythonWorker";

export async function parseWithPymupdf(
  sourceId: string,
  workflowId: string,
  pdfUrl: string,
): Promise<ParsedDocument | null> {
  return (await runPythonWorker("parse_pdf.py", {
    sourceId,
    workflowId,
    pdfUrl,
    preferred: "pymupdf",
  })) as ParsedDocument | null;
}
