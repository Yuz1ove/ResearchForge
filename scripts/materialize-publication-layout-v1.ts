import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { renderPdfWithPlaywright } from "../artifacts/api-server/src/routes/report-exports.ts";
import {
  buildDocxBlob,
  buildMarkdown,
  buildPrintHtml,
} from "../artifacts/report-factory/src/lib/exportReport.ts";
import type { GeneratedReport } from "../artifacts/report-factory/src/lib/generateReport.ts";
import type { ReportWorkspace } from "../artifacts/report-factory/src/lib/reportWorkspace.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const rootArgument = process.argv.find((argument) => argument.startsWith("--root="));
if (!rootArgument) throw new Error("Expected --root=<artifact directory>.");
const outputRoot = path.resolve(repositoryRoot, rootArgument.slice("--root=".length));

function pageHints(name: string): number[] {
  const argument = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (!argument) return [];
  return argument.slice(name.length + 3).split(",").map((value) => Number(value)).filter(Number.isFinite);
}

function readJson<T>(target: string): T {
  return JSON.parse(fs.readFileSync(target, "utf8")) as T;
}

function write(relative: string, value: string | Uint8Array): void {
  const target = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const caseRoot = path.join(outputRoot, "case-a");
const report = readJson<GeneratedReport>(path.join(caseRoot, "generated-report.json"));
const workspace = readJson<ReportWorkspace>(path.join(caseRoot, "report-workspace.json"));
const pdfPages = pageHints("pdf-toc-pages");
const docxPages = pageHints("docx-toc-pages");
const html = buildPrintHtml(report, workspace.input, workspace.presentation, {
  tocPageNumbers: pdfPages,
});
const markdown = buildMarkdown(report, workspace.input);
const docx = await buildDocxBlob(report, workspace.input, workspace.presentation, {
  tocPageNumbers: docxPages,
});
const docxBytes = new Uint8Array(await docx.arrayBuffer());
const pdfBytes = await renderPdfWithPlaywright(html, {
  signal: new AbortController().signal,
  timeoutMs: 45_000,
});

for (const relative of ["case-a/report.html", "case-a/preview.html", "preview.html"]) write(relative, html);
write("case-a/report.md", markdown);
for (const relative of ["case-a/report.docx", "report.docx"]) write(relative, docxBytes);
for (const relative of ["case-a/report.pdf", "report.pdf"]) write(relative, pdfBytes);

write("case-a/PUBLICATION-EXPORT-AUDIT.json", `${JSON.stringify({
  schemaVersion: "researchforge-publication-export/v1",
  writerCalls: 0,
  searchCalls: 0,
  pdfTocPages: pdfPages,
  docxTocPages: docxPages,
  outputs: {
    html: { bytes: Buffer.byteLength(html), sha256: sha256(html) },
    markdown: { bytes: Buffer.byteLength(markdown), sha256: sha256(markdown) },
    docx: { bytes: docxBytes.length, sha256: sha256(docxBytes) },
    pdf: { bytes: pdfBytes.length, sha256: sha256(pdfBytes) },
  },
}, null, 2)}\n`);

console.log(JSON.stringify({
  outputRoot,
  writerCalls: 0,
  searchCalls: 0,
  pdfTocPages: pdfPages,
  docxTocPages: docxPages,
}, null, 2));
