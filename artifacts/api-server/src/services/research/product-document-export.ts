import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import type { ResearchProductWorkflowSnapshotV1 } from "@workspace/api-zod/research-product-workflow";
import { renderPdfWithPlaywright } from "../../routes/report-exports";

const CJK_FONT = "Noto Sans TC";
const INK = "203746";
const TEAL = "2F6F73";
const GOLD = "9B7A2F";
const MUTED = "66777A";

function references(snapshot: ResearchProductWorkflowSnapshotV1): string[] {
  const citedSourceIds = new Set(snapshot.citationBindings.map((binding) => binding.sourceId));
  return snapshot.sources
    .filter((source) => citedSourceIds.has(source.id))
    .map((source, index) => {
      const author = source.authors.join(", ") || "Unknown author";
      const location = source.doi
        ? `https://doi.org/${source.doi}`
        : source.url ?? "URL unavailable";
      return `${index + 1}. ${author} (${source.year ?? "n.d."}). ${source.title}. ${location}`;
    });
}

function bodyParagraphs(value: string): Paragraph[] {
  return value
    .split(/\n{2,}/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .map(
      (text) =>
        new Paragraph({
          children: [new TextRun({ text, font: CJK_FONT, size: 22, color: INK })],
          spacing: { before: 0, after: 160, line: 320, lineRule: "auto" },
          alignment: AlignmentType.JUSTIFIED,
        }),
    );
}

export async function buildResearchProductDocx(
  snapshot: ResearchProductWorkflowSnapshotV1,
): Promise<Uint8Array> {
  const sectionParagraphs = (snapshot.reportPlan?.sections ?? []).flatMap((section) => [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: section.title, font: CJK_FONT, size: 32, bold: true, color: TEAL })],
      spacing: { before: 360, after: 200 },
      keepNext: true,
    }),
    ...bodyParagraphs(snapshot.sectionContent[section.id] ?? ""),
  ]);
  const referenceParagraphs = references(snapshot).map(
    (reference) =>
      new Paragraph({
        children: [new TextRun({ text: reference, font: CJK_FONT, size: 19, color: INK })],
        spacing: { after: 120, line: 290, lineRule: "auto" },
        indent: { left: 360, hanging: 360 },
      }),
  );
  const document = new Document({
    creator: "ResearchForge",
    title: snapshot.intent.topic,
    subject: "Evidence-bound research report",
    description: "Verified ResearchForge product-workflow export",
    styles: {
      default: {
        document: {
          run: { font: CJK_FONT, size: 22, color: INK },
          paragraph: { spacing: { after: 160, line: 320, lineRule: "auto" } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12_240, height: 15_840 },
            margin: { top: 1_440, right: 1_440, bottom: 1_440, left: 1_440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [new TextRun({ text: "ResearchForge - verified evidence synthesis", font: CJK_FONT, size: 16, color: MUTED })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", font: CJK_FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], font: CJK_FONT, size: 16, color: MUTED }),
                  new TextRun({ text: " of ", font: CJK_FONT, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: CJK_FONT, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ spacing: { before: 2_200, after: 280 } }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: snapshot.intent.reportType, font: CJK_FONT, size: 20, bold: true, color: GOLD })],
            spacing: { after: 320 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: snapshot.intent.topic, font: CJK_FONT, size: 56, bold: true, color: INK })],
            spacing: { after: 260 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "可追溯的 LIVE evidence-bound research report", font: CJK_FONT, size: 26, color: TEAL })],
            spacing: { after: 1_200 },
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Project ${snapshot.project.id} - version ${snapshot.project.version}`, font: CJK_FONT, size: 18, color: MUTED })],
          }),
          new Paragraph({ children: [new PageBreak()] }),
          ...sectionParagraphs,
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: "References", font: CJK_FONT, size: 32, bold: true, color: TEAL })],
            spacing: { before: 360, after: 200 },
          }),
          ...referenceParagraphs,
        ],
      },
    ],
  });
  return Uint8Array.from(await Packer.toBuffer(document));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function paragraphsHtml(value: string): string {
  return value
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

export function buildResearchProductPrintHtml(
  snapshot: ResearchProductWorkflowSnapshotV1,
): string {
  const sections = (snapshot.reportPlan?.sections ?? [])
    .map(
      (section) =>
        `<section><h1>${escapeHtml(section.title)}</h1>${paragraphsHtml(snapshot.sectionContent[section.id] ?? "")}</section>`,
    )
    .join("");
  const referenceItems = references(snapshot)
    .map((reference) => `<li>${escapeHtml(reference)}</li>`)
    .join("");
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(snapshot.intent.topic)}</title><style>
    @page{size:Letter;margin:1in}*{box-sizing:border-box}body{margin:0;color:#203746;font-family:'ResearchForge Noto Sans TC','Noto Sans TC',sans-serif;font-size:11pt;line-height:1.5}.cover{break-after:page;min-height:8.6in;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.kicker{color:#9b7a2f;font-size:10pt;font-weight:700;letter-spacing:.12em}.cover h1{font-size:30pt;line-height:1.2;margin:18pt 0 10pt;color:#203746}.subtitle{font-size:14pt;color:#2f6f73}.meta{margin-top:48pt;color:#66777a;font-size:9pt}section{break-inside:auto}section h1,.references h1{font-size:16pt;color:#2f6f73;margin:18pt 0 10pt;break-after:avoid}p{margin:0 0 8pt;text-align:justify;orphans:3;widows:3}.references{break-before:auto}.references ol{padding-left:24pt}.references li{margin:0 0 7pt;font-size:9.5pt;overflow-wrap:anywhere}
  </style></head><body><div class="cover"><div class="kicker">${escapeHtml(snapshot.intent.reportType)}</div><h1>${escapeHtml(snapshot.intent.topic)}</h1><div class="subtitle">可追溯的 LIVE evidence-bound research report</div><div class="meta">Project ${escapeHtml(snapshot.project.id)} - version ${snapshot.project.version}</div></div>${sections}<section class="references"><h1>References</h1><ol>${referenceItems}</ol></section></body></html>`;
}

export async function buildResearchProductPdf(
  snapshot: ResearchProductWorkflowSnapshotV1,
): Promise<Uint8Array> {
  const controller = new AbortController();
  return renderPdfWithPlaywright(buildResearchProductPrintHtml(snapshot), {
    signal: controller.signal,
    timeoutMs: 30_000,
  });
}
