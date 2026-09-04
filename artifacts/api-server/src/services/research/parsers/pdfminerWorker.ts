import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { runPythonWorker } from "./pythonWorker";
import { mkdtemp, writeFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function parseWithPdfminer(
  sourceId: string,
  workflowId: string,
  pdfUrl: string,
  pdfBytes?: Uint8Array,
): Promise<ParsedDocument | null> {
  // Parse exactly the bytes whose hash/access policy were audited, never a
  // second download that could redirect or change beneath the admission gate.
  const directory = pdfBytes ? await mkdtemp(join(tmpdir(), "researchforge-pdf-payload-")) : null;
  const pdfPath = directory ? join(directory, "payload.pdf") : undefined;
  try {
  if (pdfPath && pdfBytes) await writeFile(pdfPath, pdfBytes);
  return (await runPythonWorker("parse_pdf.py", {
    sourceId,
    workflowId,
    pdfUrl,
    pdfPath,
    preferred: "pdfminer",
  })) as ParsedDocument | null;
  } finally {
    if (pdfPath) await unlink(pdfPath).catch(() => undefined);
    if (directory) await rmdir(directory).catch(() => undefined);
  }
}
