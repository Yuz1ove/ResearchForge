import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { runPythonWorker } from "./pythonWorker";

export async function parseReadableHtml(
  sourceId: string,
  workflowId: string,
  url: string,
): Promise<ParsedDocument | null> {
  return (await runPythonWorker("web_extract.py", {
    sourceId,
    workflowId,
    url,
  })) as ParsedDocument | null;
}
