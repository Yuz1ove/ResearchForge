import type { GeneratedReport, ReportInput, ContentBlock } from "./generateReport";
import {
  DEFAULT_REPORT_PRESENTATION,
  primaryFontName,
  type ReportPresentationSettings,
} from "./reportPresentation.ts";

// docx is heavy; it is lazy-loaded inside downloadDocx so it never enters the
// initial bundle. `D` is the dynamically imported module namespace.
type DocxModule = typeof import("docx");

// ─── Shared text builders (plain text / markdown) ─────────────────────────────

function blockToLines(b: ContentBlock, md: boolean): string[] {
  switch (b.type) {
    case "paragraph":
      return b.text ? [b.text] : [];
    case "list":
      return (b.items ?? []).map((i) => (md ? `- ${i}` : `• ${i}`));
    case "note":
      return b.text ? [md ? `> ${b.text}` : `※ ${b.text}`] : [];
    case "suggestions":
      return (b.suggestions ?? []).flatMap((s, i) => [
        `【建議${b.suggestionKind} ${i + 1}：${s.title}】`,
        `位置：${s.position}`,
        `用途：${s.purpose}`,
        `${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${s.content}`,
        "",
      ]);
    case "dataTable":
      if (md) {
        return [
          "| 資料類型 | 需要內容 | 用途 | 優先程度 |",
          "| --- | --- | --- | --- |",
          ...(b.rows ?? []).map((r) => `| ${r.type} | ${r.need} | ${r.use} | ${r.priority} |`),
        ];
      }
      return (b.rows ?? []).map((r) => `${r.type}｜${r.need}｜${r.use}｜優先：${r.priority}`);
    case "quality":
      return (b.checks ?? []).map((c) => (md ? `- [${c.passed ? "x" : " "}] ${c.label}` : `${c.passed ? "✓" : "✗"} ${c.label}`));
    case "slides":
      return (b.slides ?? []).flatMap((s) => [
        `第 ${s.page} 頁：${s.title}`,
        ...s.points.map((p) => (md ? `- ${p}` : `• ${p}`)),
        `視覺建議：${s.visual}`,
        "",
      ]);
    default:
      return [];
  }
}

function metaLine(input: ReportInput, today: string): string {
  return `類型：${input.reportType}｜模式：${input.mode}｜風格：${input.style}｜對象：${input.targetAudience}｜${today}`;
}

export function buildPlainText(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    report.meta.title,
    metaLine(input, today),
    `分類：${report.meta.category}｜目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`,
    "",
  ];
  if (report.shortTopic) {
    lines.push(`【提醒】${report.shortTopic.message}`, "建議延伸主題：", ...report.shortTopic.expansions.map((e, i) => `${i + 1}. ${e}`), "");
  }
  for (const section of report.sections) {
    lines.push(`【${section.heading}】`);
    for (const b of section.blocks) lines.push(...blockToLines(b, false));
    lines.push("");
  }
  return lines.join("\n");
}

export function buildMarkdown(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    `# ${report.meta.title}`,
    `> ${metaLine(input, today)}`,
    `>`,
    `> 分類：${report.meta.category} ｜ 目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`,
    "",
  ];
  if (report.shortTopic) {
    lines.push(`> ⚠️ ${report.shortTopic.message}`, "", "**建議延伸主題：**", ...report.shortTopic.expansions.map((e, i) => `${i + 1}. ${e}`), "");
  }
  for (const section of report.sections) {
    lines.push(`## ${section.heading}`);
    for (const b of section.blocks) lines.push(...blockToLines(b, true));
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Download helpers ─────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke so the browser has time to start the download (avoids edge-case timing issues).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(topic: string): string {
  const base = topic
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\n\r\u0000-\u001f]+/g, "")
    .replace(/[. ]+$/, "")
    .slice(0, 40)
    .replace(/[. ]+$/, "");
  return base || "report-draft";
}

export function downloadTxt(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildPlainText(report, input)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}.txt`);
}

export function downloadMarkdown(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildMarkdown(report, input)], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}.md`);
}

// ─── JSON export (machine-readable handoff of the full draft) ──────────────────

export function buildJson(report: GeneratedReport, input: ReportInput): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      input,
      meta: report.meta,
      shortTopic: report.shortTopic ?? null,
      sections: report.sections,
    },
    null,
    2,
  );
}

export function downloadJson(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildJson(report, input)], { type: "application/json;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}.json`);
}

// ─── Research blueprint (Markdown plan, no fabricated content) ─────────────────

/** buildBlueprint — a concise, copy-ready research plan derived from the draft.
 *  It lists the planning skeleton (headings) and the data still to be gathered,
 *  without inventing facts or sources. */
export function buildBlueprint(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    `# 研究規劃藍圖：${report.meta.title}`,
    "",
    `- 主題：${input.topic}`,
    `- 研究類型：${input.reportType}`,
    `- 學術程度：${input.academicLevel}`,
    `- 判定領域：${report.meta.category}`,
    `- 產生日期：${today}`,
    "",
    "## 規劃章節",
  ];
  report.sections.forEach((s, i) => lines.push(`${i + 1}. ${s.heading}`));

  // Surface every data-requirement row so the user knows what to collect.
  const dataRows = report.sections
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === "dataTable")
    .flatMap((b) => b.rows ?? []);
  if (dataRows.length > 0) {
    lines.push("", "## 待蒐集資料", "| 資料類型 | 需要內容 | 用途 | 優先程度 |", "| --- | --- | --- | --- |");
    dataRows.forEach((r) => lines.push(`| ${r.type} | ${r.need} | ${r.use} | ${r.priority} |`));
  }

  lines.push(
    "",
    "## 品質檢查",
    report.meta.qualityReport
      ? JSON.stringify(report.meta.qualityReport, null, 2)
      : "品質報告待補。",
    "",
    "## 注意事項",
    "- 本藍圖為規劃用途，內容中的事實、數據與引用需自行查證後補齊。",
    "- 標示〔…〕或「資料來源待補」處，請填入實際查證後的資料。",
  );
  return lines.join("\n");
}

export function downloadBlueprint(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildBlueprint(report, input)], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}-藍圖.md`);
}

// ─── Prompt package (ready-to-paste prompt for an external AI) ─────────────────

/** buildPromptPackage — assembles a Traditional-Chinese prompt that a user can
 *  paste into another AI to flesh out the planned report. It embeds the planned
 *  structure and constraints, but asks the model to supply verified content. */
export function buildPromptPackage(report: GeneratedReport, input: ReportInput): string {
  const headings = report.sections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");
  const lines: string[] = [
    "你是一位專業的研究報告協作者，請使用繁體中文協助我完成下列報告。",
    "",
    "## 報告基本資訊",
    `- 主題：${input.topic}`,
    `- 研究類型：${input.reportType}`,
    `- 學術程度：${input.academicLevel}`,
    `- 判定領域：${report.meta.category}`,
    `- 報告風格：${input.style}`,
    `- 報告長度：${input.length}`,
    input.additionalInfo.trim() ? `- 補充要求：${input.additionalInfo.trim()}` : "",
    "",
    "## 請依下列章節架構撰寫",
    headings,
    "",
    "## 撰寫要求",
    "1. 全程使用繁體中文。",
    "2. 內容須正確、具體，並符合該領域的學術慣例。",
    "3. 凡引用數據、研究或事實，請明確標註資料來源；若無法確定，請以「資料來源待補」標示，切勿杜撰。",
    "4. 保持各章節邏輯連貫，並適度加入圖表或表格建議。",
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function downloadPromptPackage(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildPromptPackage(report, input)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}-prompt.txt`);
}

// ─── DOCX export ──────────────────────────────────────────────────────────────

function docxBlock(D: DocxModule, b: ContentBlock): InstanceType<DocxModule["Paragraph"]>[] {
  const { Paragraph, TextRun } = D;
  switch (b.type) {
    case "paragraph":
      // A paragraph may carry style/length lead lines joined by \n.
      return (b.text ?? "")
        .split("\n")
        .filter((t) => t.length > 0)
        .map((t) => new Paragraph({ children: [new TextRun(t)], spacing: { after: 160, line: 320 } }));

    case "list":
      return (b.items ?? []).map(
        (i) => new Paragraph({ children: [new TextRun(i)], bullet: { level: 0 }, spacing: { after: 80, line: 300 } }),
      );

    case "note":
      return b.text
        ? [new Paragraph({ children: [new TextRun({ text: `※ ${b.text}`, italics: true, color: "8a6d00" })], spacing: { after: 140, line: 300 } })]
        : [];

    case "suggestions":
      return (b.suggestions ?? []).flatMap((s, i) => [
        new Paragraph({ children: [new TextRun({ text: `建議${b.suggestionKind} ${i + 1}：${s.title}`, bold: true })], spacing: { before: 120, after: 60 } }),
        new Paragraph({ children: [new TextRun(`位置：${s.position}`)], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun(`用途：${s.purpose}`)], spacing: { after: 40 } }),
        new Paragraph({ children: [new TextRun(`${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${s.content}`)], spacing: { after: 120 } }),
      ]);

    case "quality":
      return (b.checks ?? []).map(
        (c) => new Paragraph({ children: [new TextRun(`${c.passed ? "✓" : "✗"} ${c.label}`)], bullet: { level: 0 }, spacing: { after: 60 } }),
      );

    case "slides":
      return (b.slides ?? []).flatMap((s) => [
        new Paragraph({ children: [new TextRun({ text: `第 ${s.page} 頁：${s.title}`, bold: true })], spacing: { before: 120, after: 60 } }),
        ...s.points.map((p) => new Paragraph({ children: [new TextRun(p)], bullet: { level: 0 }, spacing: { after: 40 } })),
        new Paragraph({ children: [new TextRun({ text: `視覺建議：${s.visual}`, italics: true })], spacing: { after: 120 } }),
      ]);

    default:
      return [];
  }
}

function docxDataTable(D: DocxModule, b: ContentBlock): (InstanceType<DocxModule["Table"]> | InstanceType<DocxModule["Paragraph"]>)[] {
  if (b.type !== "dataTable" || !b.rows?.length) return [];
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } = D;
  const headerCells = ["資料類型", "需要內容", "用途", "優先程度"].map(
    (h) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        shading: { fill: "f1f5f9" },
      }),
  );
  const rows = [
    new TableRow({ children: headerCells, tableHeader: true }),
    ...b.rows.map(
      (r) =>
        new TableRow({
          children: [r.type, r.need, r.use, r.priority].map(
            (v) => new TableCell({ children: [new Paragraph({ children: [new TextRun(String(v))] })] }),
          ),
        }),
    ),
  ];
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
      },
    }),
    new Paragraph({ children: [], spacing: { after: 120 } }),
  ];
}

export async function downloadDocx(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings = DEFAULT_REPORT_PRESENTATION,
) {
  const D = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageNumber, Header, Footer, TableOfContents, PageBreak } = D;
  const today = new Date().toLocaleDateString("zh-TW");

  type P = InstanceType<DocxModule["Paragraph"]>;
  type T = InstanceType<DocxModule["Table"]>;

  const cover: P[] = [
    new Paragraph({ children: [], spacing: { before: 2400 } }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: report.meta.title, bold: true, size: 56 })],
      spacing: { after: 300 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: metaLine(input, today), size: 24, color: "475569" })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `分類：${report.meta.category}　｜　目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`,
          size: 24,
          color: "475569",
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const toc: P[] = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("目錄")] })];
  const tocField = new TableOfContents("目錄", { hyperlink: true, headingStyleRange: "1-2" });

  const body: (P | T)[] = [];
  if (report.shortTopic) {
    body.push(
      new Paragraph({ children: [new TextRun({ text: `提醒：${report.shortTopic.message}`, italics: true, color: "8a6d00" })], spacing: { after: 120 } }),
    );
  }
  for (const section of report.sections) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(section.heading)], spacing: { before: 240, after: 120 } }));
    for (const b of section.blocks) {
      if (b.type === "dataTable") body.push(...docxDataTable(D, b));
      else body.push(...docxBlock(D, b));
    }
  }

  const doc = new Document({
    creator: "Report Factory AI",
    title: report.meta.title,
    styles: {
      default: {
        document: {
          run: {
            size: Math.round(presentation.fontSizePx * 1.5),
            font: primaryFontName(presentation.fontFamily),
          },
        },
      },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: report.meta.title, size: 18, color: "94a3b8" })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ["第 ", PageNumber.CURRENT, " 頁／共 ", PageNumber.TOTAL_PAGES, " 頁"], size: 18, color: "94a3b8" })],
              }),
            ],
          }),
        },
        children: [...cover, ...toc, tocField, new Paragraph({ children: [new PageBreak()] }), ...body],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${safeFileName(input.topic)}.docx`);
}

// ─── Print-to-PDF (browser print engine, reliable for Traditional Chinese) ────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function blockToHtml(b: ContentBlock): string {
  switch (b.type) {
    case "paragraph":
      return (b.text ?? "")
        .split("\n")
        .filter((t) => t.length > 0)
        .map((t) => `<p>${escapeHtml(t)}</p>`)
        .join("");
    case "list":
      return `<ul>${(b.items ?? []).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
    case "note":
      return b.text ? `<p class="note">※ ${escapeHtml(b.text)}</p>` : "";
    case "suggestions":
      return (b.suggestions ?? [])
        .map(
          (s, i) =>
            `<div class="sugg"><strong>建議${b.suggestionKind} ${i + 1}：${escapeHtml(s.title)}</strong>` +
            `<div>位置：${escapeHtml(s.position)}</div><div>用途：${escapeHtml(s.purpose)}</div>` +
            `<div>${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${escapeHtml(s.content)}</div></div>`,
        )
        .join("");
    case "dataTable":
      return (
        `<table><thead><tr><th>資料類型</th><th>需要內容</th><th>用途</th><th>優先程度</th></tr></thead><tbody>` +
        (b.rows ?? [])
          .map((r) => `<tr><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.need)}</td><td>${escapeHtml(r.use)}</td><td>${escapeHtml(r.priority)}</td></tr>`)
          .join("") +
        `</tbody></table>`
      );
    case "quality":
      return `<ul class="checks">${(b.checks ?? []).map((c) => `<li>${c.passed ? "✓" : "✗"} ${escapeHtml(c.label)}</li>`).join("")}</ul>`;
    case "slides":
      return (b.slides ?? [])
        .map(
          (s) =>
            `<div class="slide"><strong>第 ${s.page} 頁：${escapeHtml(s.title)}</strong>` +
            `<ul>${s.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` +
            `<div class="visual">視覺建議：${escapeHtml(s.visual)}</div></div>`,
        )
        .join("");
    default:
      return "";
  }
}

function buildPrintHtml(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings,
): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const sectionsHtml = report.sections
    .map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${s.blocks.map(blockToHtml).join("")}</section>`)
    .join("");
  const shortTopicHtml = report.shortTopic
    ? `<p class="note">提醒：${escapeHtml(report.shortTopic.message)}</p>`
    : "";

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />
<title>${escapeHtml(report.meta.title)}</title>
<style>
  @page { margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: ${JSON.stringify(presentation.fontFamily)}; color:#1e293b; line-height:${presentation.lineHeight}; font-size:${presentation.fontSizePx}px; margin:0; }
  .cover { text-align:center; padding:38vh 0 0; page-break-after:always; }
  .cover h1 { font-size:${presentation.headingStyle === "classic" ? "26pt" : "24pt"}; margin:0 0 16px; letter-spacing:${presentation.headingStyle === "modern" ? "0.02em" : "0"}; }
  .cover .meta { color:#475569; font-size:11pt; margin:4px 0; }
  h2 { font-size:${presentation.headingStyle === "classic" ? "15pt" : "14pt"}; border-bottom:2px solid #0ea5e9; padding-bottom:4px; margin:22px 0 10px; page-break-after:avoid; letter-spacing:${presentation.headingStyle === "modern" ? "0.015em" : "0"}; }
  p { margin:0 0 ${presentation.paragraphSpacingPx}px; }
  ul { margin:0 0 12px; padding-left:22px; }
  li { margin:0 0 5px; }
  .note { background:#fffbeb; border-left:3px solid #f59e0b; padding:6px 10px; color:#92400e; }
  .sugg, .slide { border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin:0 0 10px; }
  .visual { color:#64748b; font-size:10.5pt; }
  table { width:100%; border-collapse:collapse; margin:0 0 14px; font-size:11pt; }
  th, td { border:1px solid #cbd5e1; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f1f5f9; }
  section { page-break-inside:avoid; }
  @media print { .hint { display:none; } }
  .hint { position:fixed; top:0; left:0; right:0; background:#0ea5e9; color:#fff; text-align:center; padding:8px; font-size:11pt; }
</style></head>
<body>
  <div class="hint">列印對話框已開啟，請選擇「另存為 PDF」即可下載。如未自動開啟，請按 Ctrl/Cmd + P。</div>
  <div class="cover">
    <h1>${escapeHtml(report.meta.title)}</h1>
    <div class="meta">${escapeHtml(metaLine(input, today))}</div>
    <div class="meta">分類：${escapeHtml(report.meta.category)}　｜　目前版本：${escapeHtml(report.meta.versionLabel)}（完整度約 ${report.meta.completeness}%）</div>
  </div>
  ${shortTopicHtml}
  ${sectionsHtml}
  <script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 300); });</script>
</body></html>`;
}

export function printPdf(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings = DEFAULT_REPORT_PRESENTATION,
): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildPrintHtml(report, input, presentation));
  win.document.close();
  return true;
}
