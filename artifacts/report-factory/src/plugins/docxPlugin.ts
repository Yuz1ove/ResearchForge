import { downloadDocx } from "../lib/exportReport.ts";
import type { ContentBlock, GeneratedReport, ReportInput, ReportSection, TopicCategory } from "../lib/generateReport.ts";
import { buildBibliography } from "../lib/sourceRecords.ts";
import type { DocxPluginInput, DocxPluginResult, ReportDocument, ReportDocumentBlock } from "./contract.ts";

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

export async function runDocxPlugin(input: unknown): Promise<DocxPluginResult> {
  const docxInput = assertDocxPluginInput(input);
  const safeDocument = ensureNonEmptyDocument(docxInput.document);
  const reportInput = reportDocumentToReportInput(safeDocument);
  const report = reportDocumentToGeneratedReport(safeDocument);

  if (docxInput.mode === "blob") {
    return {
      format: "docx",
      mimeType: docxMimeType,
      downloaded: false,
      blob: await buildDocxBlob(report, reportInput),
      warnings: safeDocument.warnings,
    };
  }

  await downloadDocx(report, reportInput);
  return {
    format: "docx",
    mimeType: docxMimeType,
    downloaded: true,
    warnings: safeDocument.warnings,
  };
}

export function reportDocumentToGeneratedReport(document: ReportDocument): GeneratedReport {
  const fallbackDocument = ensureNonEmptyDocument(document);

  return {
    meta: {
      title: fallbackDocument.title,
      category: (fallbackDocument.meta.category || "一般學校報告") as TopicCategory,
      versionLabel: "Plugin Contract V1",
      completeness: fallbackDocument.sections.length > 1 ? 45 : 10,
      suggestedAdditions: ["查證來源", "補充資料", "完成引用"],
      acceptedSources: [],
      bibliography: buildBibliography([], fallbackDocument.citationPolicy.style),
    },
    sections: fallbackDocument.sections.map(reportDocumentSectionToReportSection),
  };
}

function assertDocxPluginInput(input: unknown): DocxPluginInput {
  if (!input || typeof input !== "object" || !("document" in input)) {
    throw new Error("DOCX plugin input requires a report document.");
  }

  const document = (input as { document?: unknown }).document;
  if (!isReportDocument(document)) {
    throw new Error("DOCX plugin input document must use report-document-v1 schema.");
  }

  return input as DocxPluginInput;
}

function isReportDocument(value: unknown): value is ReportDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { schemaVersion?: unknown }).schemaVersion === "report-document-v1" &&
      typeof (value as { title?: unknown }).title === "string" &&
      typeof (value as { topic?: unknown }).topic === "string" &&
      Array.isArray((value as { sections?: unknown }).sections),
  );
}

function ensureNonEmptyDocument(document: ReportDocument): ReportDocument {
  if (document.sections.some((section) => section.blocks.length > 0)) {
    return document;
  }

  return {
    ...document,
    sections: [
      {
        id: "safe-fallback",
        title: "安全 fallback document",
        blocks: [
          {
            type: "note",
            text: "內容為空，已產生安全 fallback 文件。請回到報告生成流程補齊主題、章節與資料來源。",
          },
        ],
      },
    ],
    warnings: [...document.warnings, "empty_document_fallback: DOCX plugin received empty content."],
  };
}

function reportDocumentSectionToReportSection(section: ReportDocument["sections"][number]): ReportSection {
  return {
    heading: section.title,
    blocks: section.blocks.map(reportDocumentBlockToContentBlock),
  };
}

function reportDocumentBlockToContentBlock(block: ReportDocumentBlock): ContentBlock {
  switch (block.type) {
    case "list":
      return { type: "list", items: block.items ?? [] };
    case "note":
      return { type: "note", text: block.text ?? "" };
    case "quality":
      return { type: "quality", checks: block.checks ?? [] };
    case "paragraph":
    default:
      return { type: "paragraph", text: block.text ?? "" };
  }
}

function reportDocumentToReportInput(document: ReportDocument): ReportInput {
  return {
    topic: document.topic,
    reportType: document.reportType || "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
    purpose: "研究報告",
    domainOverride: "",
    mode: "先建立報告架構",
    sourceRequirement: document.citationPolicy.allowPlaceholders ? "需要，但先標示「資料來源待補」" : "不需要",
    citationFormat: document.citationPolicy.style || "APA",
    chartRequirement: "不需要",
    style: "學術研究風格",
    length: "一般報告",
    wordCount: "",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "",
    rubric: "",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: document.language,
    rewriteSection: "",
    additionalInfo: document.warnings.join("\n"),
    acceptedSources: [],
  };
}

async function buildDocxBlob(report: GeneratedReport, input: ReportInput): Promise<Blob> {
  const D = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = D;
  const body = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: report.meta.title, bold: true })],
      spacing: { after: 240 },
    }),
    new Paragraph({
      children: [new TextRun(`類型：${input.reportType}｜模式：${input.mode}｜風格：${input.style}｜對象：${input.targetAudience}`)],
      spacing: { after: 160 },
    }),
  ];

  for (const section of report.sections) {
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun(section.heading)],
        spacing: { before: 240, after: 120 },
      }),
    );

    for (const block of section.blocks) {
      if (block.type === "list") {
        body.push(...(block.items ?? []).map((item) => new Paragraph({ children: [new TextRun(item)], bullet: { level: 0 } })));
      } else if (block.type === "quality") {
        body.push(...(block.checks ?? []).map((check) => new Paragraph({ children: [new TextRun(`${check.passed ? "✓" : "✗"} ${check.label}`)] })));
      } else {
        body.push(new Paragraph({ children: [new TextRun(block.text ?? "")], spacing: { after: 120 } }));
      }
    }
  }

  const doc = new Document({
    creator: "ResearchForge",
    title: report.meta.title,
    sections: [{ children: body }],
  });

  return Packer.toBlob(doc);
}
