import type { ParsedDocument } from "@workspace/api-zod/research-tools";

export async function parseWithGrobid(
  _sourceId: string,
  _workflowId: string,
  _pdfUrl: string,
): Promise<ParsedDocument | null> {
  return null;
}

export async function grobidHealth(): Promise<boolean> {
  const baseUrl = process.env.GROBID_URL?.trim();
  if (!baseUrl || process.env.ENABLE_GROBID?.trim().toLowerCase() === "false") {
    return false;
  }

  try {
    const response = await fetch(new URL("/api/isalive", baseUrl));
    return response.ok;
  } catch {
    return false;
  }
}
