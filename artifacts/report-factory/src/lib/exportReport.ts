import type { GeneratedReport, ReportInput, ContentBlock } from "./generateReport";

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

type ExportExtension = "txt" | "md" | "html" | "json" | "docx";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke so the browser has time to start the download (avoids edge-case timing issues).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportDateStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function exportFileName(input: ReportInput, ext: ExportExtension, suffix?: string): string {
  const parts = ["ResearchForge", safeFileName(input.topic), suffix, exportDateStamp()].filter(Boolean);
  return `${parts.join("-")}.${ext}`;
}

export function downloadTxt(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildPlainText(report, input)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, exportFileName(input, "txt"));
}

export function downloadMarkdown(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildMarkdown(report, input)], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, exportFileName(input, "md"));
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
  triggerDownload(blob, exportFileName(input, "json"));
}

// ─── Research blueprint (Markdown plan, no fabricated content) ─────────────────

/** buildBlueprint — a concise, copy-ready research plan derived from the draft.
 *  It lists the planning skeleton (headings) and the data still to be gathered,
 *  without inventing facts or sources. */
export function buildBlueprint(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const preflight = input.searchPreflight;
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

  if (preflight) {
    lines.push(
      "",
      "## 搜尋前初階濾網",
      `- 匹配案例：${preflight.guidance_cases.map((item) => item.matched_case_id).join("、")}`,
      `- 預期報告類型：${preflight.predicted_report_type}`,
      `- 搜尋／報告策略：${preflight.report_strategy}`,
      `- 主題 domains：${preflight.domains.join("、")}`,
      `- 建議搜尋關鍵詞：${preflight.recommended_keywords.join("、")}`,
      `- 優先來源類型：${preflight.preferred_source_types.join("、")}`,
      `- 應降權或避免來源：${preflight.avoid_source_types.join("、")}`,
      `- 常見錯誤模式：${preflight.common_failure_modes.join("；")}`,
      `- 證據要求：${preflight.evidence_requirements.join("；")}`,
    );
  }

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
    "## 注意事項",
    "- 本藍圖為規劃用途，內容中的事實、數據與引用需自行查證後補齊。",
    "- 標示〔…〕或「資料來源待補」處，請填入實際查證後的資料。",
  );
  return lines.join("\n");
}

export function downloadBlueprint(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildBlueprint(report, input)], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, exportFileName(input, "md", "藍圖"));
}

// ─── Prompt package (ready-to-paste prompt for an external AI) ─────────────────

/** buildPromptPackage — assembles a Traditional-Chinese prompt that a user can
 *  paste into another AI to flesh out the planned report. It embeds the planned
 *  structure and constraints, but asks the model to supply verified content. */
export function buildPromptPackage(report: GeneratedReport, input: ReportInput): string {
  const headings = report.sections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");
  const preflight = input.searchPreflight;
  const preflightLines = preflight
    ? [
        "## 搜尋前初階濾網",
        `- 匹配案例：${preflight.guidance_cases.map((item) => item.matched_case_id).join("、")}`,
        `- 預期報告類型：${preflight.predicted_report_type}`,
        `- 搜尋／報告策略：${preflight.report_strategy}`,
        `- 預期意圖：${preflight.intent}`,
        `- 是否為軟體專案：${preflight.isSoftwareProject ? "是" : "否"}`,
        `- 主題 domains：${preflight.domains.join("、")}`,
        `- 建議搜尋關鍵詞：${preflight.recommended_keywords.join("、")}`,
        `- 優先來源類型：${preflight.preferred_source_types.join("、")}`,
        `- 應降權或避免來源：${preflight.avoid_source_types.join("、")}`,
        `- 常見錯誤模式：${preflight.common_failure_modes.join("；")}`,
        `- 證據要求：${preflight.evidence_requirements.join("；")}`,
        preflight.safety_and_ethics_notes.length
          ? `- 倫理提醒：${preflight.safety_and_ethics_notes.join("；")}`
          : "",
        "",
      ]
    : [];
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
    ...preflightLines,
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
  triggerDownload(blob, exportFileName(input, "txt", "prompt"));
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

    case "dataTable":
      return blockToLines(b, false).map((line) => new Paragraph({ children: [new TextRun(line)], spacing: { after: 80, line: 300 } }));

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

export async function downloadDocx(report: GeneratedReport, input: ReportInput) {
  const D = await import("docx");
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = D;
  const today = new Date().toLocaleDateString("zh-TW");

  type P = InstanceType<DocxModule["Paragraph"]>;

  const body: P[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: report.meta.title, bold: true })],
      spacing: { after: 240 },
    }),
    new Paragraph({ children: [new TextRun(metaLine(input, today))], spacing: { after: 100 } }),
    new Paragraph({
      children: [new TextRun(`分類：${report.meta.category}｜目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`)],
      spacing: { after: 220 },
    }),
  ];
  if (report.shortTopic) {
    body.push(
      new Paragraph({ children: [new TextRun({ text: `提醒：${report.shortTopic.message}`, italics: true, color: "8a6d00" })], spacing: { after: 120 } }),
    );
  }
  for (const section of report.sections) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(section.heading)], spacing: { before: 240, after: 120 } }));
    for (const b of section.blocks) body.push(...docxBlock(D, b));
  }

  const hasReferenceSection = report.sections.some((section) => /參考|來源/.test(section.heading));
  if (!hasReferenceSection && report.meta.bibliography.length > 0) {
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("參考資料與來源")], spacing: { before: 240, after: 120 } }));
    body.push(...report.meta.bibliography.map((entry) => new Paragraph({ children: [new TextRun(entry.text)], bullet: { level: 0 }, spacing: { after: 80, line: 300 } })));
  }

  const doc = new Document({
    creator: "ResearchForge",
    title: report.meta.title,
    styles: { default: { document: { run: { size: 22 } } } },
    sections: [
      {
        children: body,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, exportFileName(input, "docx"));
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

function buildHtmlDocument(report: GeneratedReport, input: ReportInput, autoPrint: boolean): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const documentTitle = `ResearchForge-${safeFileName(input.topic)}-${exportDateStamp()}`;
  const sectionsHtml = report.sections
    .map((s) => `<section><h2>${escapeHtml(s.heading)}</h2>${s.blocks.map(blockToHtml).join("")}</section>`)
    .join("");
  const shortTopicHtml = report.shortTopic
    ? `<p class="note">提醒：${escapeHtml(report.shortTopic.message)}</p>`
    : "";

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />
<title>${escapeHtml(documentTitle)}</title>
<style>
  @page { margin: 22mm 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Microsoft JhengHei","PingFang TC","Noto Sans TC","Heiti TC",sans-serif; color:#1e293b; line-height:1.9; font-size:12pt; margin:0; }
  .cover { text-align:center; padding:38vh 0 0; page-break-after:always; }
  .cover h1 { font-size:26pt; margin:0 0 16px; }
  .cover .meta { color:#475569; font-size:11pt; margin:4px 0; }
  h2 { font-size:15pt; border-bottom:2px solid #0ea5e9; padding-bottom:4px; margin:22px 0 10px; page-break-after:avoid; }
  p { margin:0 0 10px; }
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
  ${autoPrint ? `<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 300); });</script>` : ""}
</body></html>`;
}

export function buildHtml(report: GeneratedReport, input: ReportInput): string {
  return buildHtmlDocument(report, input, false);
}

export function downloadHtml(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildHtml(report, input)], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, exportFileName(input, "html"));
}

export function printPdf(report: GeneratedReport, input: ReportInput): boolean {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildHtmlDocument(report, input, true));
  win.document.close();
  return true;
}
