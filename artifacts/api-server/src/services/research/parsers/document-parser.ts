import { createHash } from "node:crypto";
import JSZip from "jszip";
import type {
  DocumentRecordV1,
  ParsedBlockV1,
  VerifyExistingReportRequest,
} from "@workspace/api-zod/research-product-workflow";
import { runPythonWorker } from "./pythonWorker";

export interface ParsedDocumentResult {
  document: DocumentRecordV1;
  text: string;
  mediaType: string;
  contentHash: string;
  blocks: ParsedBlockV1[];
  sections: Array<{ title: string; content: string }>;
  referencesText: string;
  parseStatus: "SUCCESS" | "OCR_REQUIRED" | "PARSE_DEGRADED";
  parseWarnings: string[];
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function parseDocument(
  input: VerifyExistingReportRequest,
  projectId = "default-project",
  now: string = new Date().toISOString(),
): Promise<ParsedDocumentResult> {
  const warnings: string[] = [];
  let parseStatus: "SUCCESS" | "OCR_REQUIRED" | "PARSE_DEGRADED" = "SUCCESS";
  let extractedText = "";
  let mediaType = input.mediaType || "text/markdown";
  let contentHash = "";
  const pageNumberMap = new Map<number, number>();

  // 1. DOCX Ingestion (OOXML via JSZip)
  if (
    mediaType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    input.fileBase64
  ) {
    try {
      const zip = await JSZip.loadAsync(Buffer.from(input.fileBase64, "base64"));
      const xml = await zip.file("word/document.xml")?.async("string");
      if (xml) {
        const paragraphMatches = [...xml.matchAll(/<w:p[\s>]([\s\S]*?)<\/w:p>/g)];
        const paragraphs: string[] = [];

        for (const pMatch of paragraphMatches) {
          const pXml = pMatch[1] || "";
          const textRuns = [...pXml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
            .map((m) => decodeXmlEntities(m[1] || ""))
            .join("");
          const trimmed = textRuns.trim();
          if (!trimmed) continue;

          const styleMatch = pXml.match(/<w:pStyle\s+w:val="([^"]+)"/);
          const style = styleMatch ? styleMatch[1] : "";
          if (/heading\s*1/i.test(style) && !trimmed.startsWith("#")) {
            paragraphs.push(`# ${trimmed}`);
          } else if (/heading\s*2/i.test(style) && !trimmed.startsWith("#")) {
            paragraphs.push(`## ${trimmed}`);
          } else if (/heading\s*3/i.test(style) && !trimmed.startsWith("#")) {
            paragraphs.push(`### ${trimmed}`);
          } else {
            paragraphs.push(trimmed);
          }
        }

        extractedText = paragraphs.join("\n\n");
        contentHash = sha256(input.fileBase64);
      } else {
        warnings.push("DOCX_MISSING_DOCUMENT_XML");
        parseStatus = "PARSE_DEGRADED";
      }
    } catch (err) {
      warnings.push(`DOCX_PARSING_FAILED: ${err instanceof Error ? err.message : String(err)}`);
      parseStatus = "PARSE_DEGRADED";
    }
  }

  // 2. PDF Ingestion (via Python pypdf worker)
  else if (mediaType === "application/pdf" && input.fileBase64) {
    contentHash = sha256(input.fileBase64);
    try {
      const workerResult = (await runPythonWorker("parse_pdf.py", {
        pdfBase64: input.fileBase64,
        preferred: "pypdf",
      })) as {
        fullText?: string | null;
        pages?: Array<{ page: number; text: string }>;
        requiresOcr?: boolean;
        status?: string;
        warnings?: string[];
      } | null;

      if (workerResult && workerResult.fullText && workerResult.fullText.trim().length > 0) {
        extractedText = workerResult.fullText.trim();
        if (workerResult.pages && Array.isArray(workerResult.pages)) {
          let pIdx = 0;
          for (const pageObj of workerResult.pages) {
            const pageParas = pageObj.text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
            for (let i = 0; i < pageParas.length; i++) {
              pageNumberMap.set(pIdx++, pageObj.page);
            }
          }
        }
      } else if (workerResult && workerResult.requiresOcr) {
        parseStatus = "OCR_REQUIRED";
        warnings.push("PDF_CONTAINS_NO_EXTRACTABLE_TEXT_OCR_REQUIRED");
      } else {
        parseStatus = "PARSE_DEGRADED";
        warnings.push("PDF_EXTRACTION_RETURNED_EMPTY");
      }
    } catch (err) {
      warnings.push(`PDF_WORKER_FAILED: ${err instanceof Error ? err.message : String(err)}`);
      parseStatus = "PARSE_DEGRADED";
    }
  }

  // 3. Markdown / Plain Text Ingestion
  if (!extractedText) {
    extractedText = (
      input.markdown ||
      input.rawText ||
      (input.fileBase64 ? Buffer.from(input.fileBase64, "base64").toString("utf8") : "")
    ).trim();
    contentHash = sha256(extractedText);
  }

  if (!extractedText.trim()) {
    throw new Error("Document is empty or unreadable (0 characters extracted).");
  }

  const documentId = stableId("doc", projectId, contentHash || "empty");
  const document: DocumentRecordV1 = {
    id: documentId,
    projectId,
    sourceId: stableId("src_user_report", projectId),
    version: 1,
    accessStatus: "USER_UPLOADED",
    mediaType,
    contentRef: input.fileName || "uploaded-report",
    contentHash,
    rights: "permitted",
    acquisitionStatus: parseStatus === "OCR_REQUIRED" ? "unavailable" : "available",
    acquiredAt: now,
    createdAt: now,
    updatedAt: now,
    provenance: {
      mode: "LOCAL_PARSE",
      producer: "user-document-ingest",
      producerVersion: "2.0",
      parentRefs: [],
      generatedAt: now,
    },
  };

  // 4. Structural Block & Section Parsing
  const rawParagraphs = extractedText.split(/\n{2,}/);
  const blocks: ParsedBlockV1[] = [];
  const sections: Array<{ title: string; content: string }> = [];
  let currentSectionTitle = "前言與背景";
  let currentSectionLines: string[] = [];
  let referencesText = "";
  let inReferences = false;
  let offset = 0;

  for (let i = 0; i < rawParagraphs.length; i++) {
    const rawP = rawParagraphs[i]!.trim();
    if (!rawP) continue;

    const isHeading = rawP.startsWith("#");
    const isReferenceSection = /^#{1,3}\s*(References|參考文獻|引用文獻|參考資料)/i.test(rawP);
    if (isReferenceSection) {
      inReferences = true;
    }

    if (inReferences) {
      referencesText += (referencesText ? "\n\n" : "") + rawP;
    }

    if (isHeading && !isReferenceSection) {
      if (currentSectionLines.length > 0) {
        sections.push({
          title: currentSectionTitle,
          content: currentSectionLines.join("\n\n"),
        });
        currentSectionLines = [];
      }
      currentSectionTitle = rawP.replace(/^#+\s*/, "").trim();
    } else if (!isReferenceSection) {
      currentSectionLines.push(rawP);
    }

    const blockType = inReferences
      ? "reference"
      : isHeading
        ? "heading"
        : "paragraph";
    const startOffset = offset;
    const endOffset = offset + rawP.length;
    offset = endOffset + 2;

    const page = pageNumberMap.get(i) || Math.floor(i / 6) + 1;

    blocks.push({
      id: stableId("block", documentId, String(i), rawP.slice(0, 32)),
      projectId,
      documentId,
      blockType,
      text: rawP,
      page,
      section: currentSectionTitle,
      startOffset,
      endOffset,
      extractor: "researchforge-mode-b-structural-parser",
      extractorVersion: "2026.09.04",
      createdAt: now,
      provenance: {
        mode: "LOCAL_PARSE",
        producer: "structural-parser",
        producerVersion: "2.0",
        parentRefs: [documentId],
        generatedAt: now,
      },
    });
  }

  if (currentSectionLines.length > 0) {
    sections.push({
      title: currentSectionTitle,
      content: currentSectionLines.join("\n\n"),
    });
  }

  return {
    document,
    text: extractedText,
    mediaType,
    contentHash,
    blocks,
    sections,
    referencesText,
    parseStatus,
    parseWarnings: warnings,
  };
}
