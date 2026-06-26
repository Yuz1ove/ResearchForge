import type { ParsedDocument } from "@workspace/api-zod/research-tools";

export async function parseWithTika(
  sourceId: string,
  workflowId: string,
  pdfUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedDocument | null> {
  const baseUrl = process.env.TIKA_URL?.trim();
  if (!baseUrl || process.env.ENABLE_TIKA?.trim().toLowerCase() === "false") {
    return null;
  }

  const pdfResponse = await fetchImpl(pdfUrl);
  if (!pdfResponse.ok) return null;
  const pdfBuffer = await pdfResponse.arrayBuffer();
  const tikaResponse = await fetchImpl(baseUrl, {
    method: "PUT",
    headers: {
      Accept: "text/plain",
      "Content-Type": "application/pdf",
    },
    body: Buffer.from(pdfBuffer),
  });
  if (!tikaResponse.ok) return null;
  const fullText = (await tikaResponse.text()).trim();
  if (!fullText) return null;

  return {
    sourceId,
    workflowId,
    extractionMethod: "tika",
    fullText,
    confidence: "medium",
    warnings: ["Tika 解析為通用文字抽取，未保留學術段落結構。"],
  };
}

export async function tikaHealth(): Promise<boolean> {
  const baseUrl = process.env.TIKA_URL?.trim();
  if (!baseUrl || process.env.ENABLE_TIKA?.trim().toLowerCase() === "false") {
    return false;
  }

  try {
    const response = await fetch(baseUrl, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}
