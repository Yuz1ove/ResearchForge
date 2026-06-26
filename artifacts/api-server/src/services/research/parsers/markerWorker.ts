import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { runPythonWorker } from "./pythonWorker";

export async function parseWithMarker(
  sourceId: string,
  workflowId: string,
  fileUrl: string,
): Promise<ParsedDocument | null> {
  return (await runPythonWorker("parse_pdf.py", {
    sourceId,
    workflowId,
    pdfUrl: fileUrl,
    preferred: "marker",
  })) as ParsedDocument | null;
}
