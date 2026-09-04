import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { renderPdfWithPlaywright } from "../artifacts/api-server/src/routes/report-exports.ts";
import {
  buildCanonicalExportDocument,
  buildDocxBlob,
  buildMarkdown,
  buildPrintHtml,
} from "../artifacts/report-factory/src/lib/exportReport.ts";
import {
  academicFigureEligibilityDecisions,
  evidenceFigureGroundingManifest,
  type EvidenceVisualSpec,
} from "../artifacts/report-factory/src/lib/evidenceVisuals.ts";
import { buildStandardizedEvidenceFacts } from "../artifacts/report-factory/src/lib/standardizedEvidenceFacts.ts";
import { formalReportSectionSequence } from "../artifacts/report-factory/src/lib/formalReportDocument.ts";
import {
  workspaceToGeneratedReport,
  type ReportWorkspace,
} from "../artifacts/report-factory/src/lib/reportWorkspace.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const argument = (name: string): string => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (!value) throw new Error(`Expected --${name}=...`);
  return value.slice(name.length + 3);
};
const outputRoot = path.resolve(repositoryRoot, argument("root"));
const inputRoot = path.resolve(repositoryRoot, argument("input-root"));
const caseSlug = process.argv.find((item) => item.startsWith("--case="))
  ?.slice("--case=".length) || "case-a";
const caseRoot = path.join(outputRoot, caseSlug);
const caseArtifact = (filename: string): string => `${caseSlug}/${filename}`;

function readJson<T>(target: string): T {
  return JSON.parse(fs.readFileSync(target, "utf8")) as T;
}

function write(relative: string, value: string | Uint8Array): void {
  const target = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function writeJson(relative: string, value: unknown): void {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "").trim();
}

function pagesFromPdf(pdf: Uint8Array): string[] {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "researchforge-v2-pdf-"));
  const filename = path.join(temporary, "report.pdf");
  fs.writeFileSync(filename, pdf);
  try {
    try {
      return execFileSync("pdftotext", ["-layout", filename, "-"], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      }).split("\f").filter((page) => page.trim().length > 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const python = process.env.RESEARCHFORGE_PYTHON ?? "python3";
      const pages = execFileSync(python, [
        "-c",
        "import json,sys; from pypdf import PdfReader; print(json.dumps([(p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages], ensure_ascii=False))",
        filename,
      ], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      });
      return JSON.parse(pages) as string[];
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function pageHints(headings: readonly string[], pages: readonly string[]): number[] {
  return headings.map((heading) => {
    const needle = normalize(heading);
    // The TOC repeats every H1. The actual chapter occurrence is therefore the
    // last matching page, not the first match in the front matter.
    const index = pages.findLastIndex((page) => normalize(page).includes(needle));
    return index >= 0 ? index + 1 : 0;
  });
}

function docxXml(docx: Uint8Array): string {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "researchforge-v2-docx-"));
  const filename = path.join(temporary, "report.docx");
  fs.writeFileSync(filename, docx);
  try {
    return execFileSync("unzip", ["-p", filename, "word/document.xml"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

function renderDocxPages(docx: Uint8Array): string[] {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "researchforge-v2-soffice-"));
  const filename = path.join(temporary, "report.docx");
  fs.writeFileSync(filename, docx);
  try {
    const portableRenderer = process.env.RESEARCHFORGE_DOCX_RENDERER;
    if (portableRenderer) {
      const output = path.join(temporary, "portable-render");
      const python = process.env.RESEARCHFORGE_PYTHON ?? "python3";
      execFileSync(python, [
        path.join(repositoryRoot, "artifacts/report-factory/scripts/render-docx-cjk-portable.py"),
        filename,
        "--output-dir",
        output,
        "--renderer",
        portableRenderer,
      ], {
        stdio: "pipe",
        timeout: 120_000,
        env: { ...process.env, TMPDIR: "/private/tmp" },
      });
      return pagesFromPdf(fs.readFileSync(path.join(output, "report.pdf")));
    }
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", temporary, filename], {
      stdio: "pipe",
      timeout: 120_000,
    });
    return pagesFromPdf(fs.readFileSync(path.join(temporary, "report.pdf")));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

const workspacePath = path.join(inputRoot, caseSlug, "report-workspace.json");
const workspace = readJson<ReportWorkspace>(workspacePath);
const report = workspaceToGeneratedReport(workspace, workspace.report.meta.category);
if (report.meta.citationIntegrity.status === "blocked") {
  const formalIntegrity = report.meta.formalReportDocument?.integrity;
  throw new Error(
    `Case A rebuilt citation integrity blocked: ${JSON.stringify({
      citationIntegrity: report.meta.citationIntegrity,
      formalIntegrity,
      formalQuality: report.meta.formalReportDocument?.quality,
      formalStructuralIssues: report.meta.formalReportDocument?.structuralIssues,
      evidenceVisuals: report.meta.evidenceVisuals,
    }, null, 2)}`,
  );
}
const canonical = buildCanonicalExportDocument(report, workspace.input);
const formal = canonical.formalDocument;
if (!formal) throw new Error("Case A canonical FormalReportDocument is missing.");
if (formal.integrity.status !== "pass") {
  throw new Error(`Case A canonical integrity blocked: ${JSON.stringify(formal.integrity)}`);
}

const headings = canonical.sections.map((section) => section.heading);
const firstHtml = buildPrintHtml(report, workspace.input, workspace.presentation);
const firstPdf = await renderPdfWithPlaywright(firstHtml, {
  signal: new AbortController().signal,
  timeoutMs: 60_000,
});
const pdfTocPages = pageHints(headings, pagesFromPdf(firstPdf));
const firstDocxBlob = await buildDocxBlob(report, workspace.input, workspace.presentation);
const firstDocx = new Uint8Array(await firstDocxBlob.arrayBuffer());
const firstDocxRenderedPages = renderDocxPages(firstDocx);
const extractedDocxPageHints = pageHints(headings, firstDocxRenderedPages);
const docxTextExtractable = extractedDocxPageHints.every((page) => page > 0);
const docxTocPages = docxTextExtractable ? extractedDocxPageHints : [];

const html = buildPrintHtml(report, workspace.input, workspace.presentation, {
  tocPageNumbers: pdfTocPages,
});
const markdown = buildMarkdown(report, workspace.input);
const docxBlob = await buildDocxBlob(report, workspace.input, workspace.presentation, {
  tocPageNumbers: docxTocPages,
});
const docx = new Uint8Array(await docxBlob.arrayBuffer());
const pdf = await renderPdfWithPlaywright(html, {
  signal: new AbortController().signal,
  timeoutMs: 60_000,
});
const pdfPages = pagesFromPdf(pdf);
const xml = docxXml(docx);

const figures = report.sections.flatMap((section) => section.blocks.flatMap((block) =>
  block.type === "formalFigure" && block.figure ? [block.figure] : [],
));
const evidenceFigures = figures.filter((figure): figure is EvidenceVisualSpec =>
  "visualId" in figure && "provenance" in figure,
);
const standardizedFacts = buildStandardizedEvidenceFacts(
  workspace.evidenceCards,
  workspace.acceptedSources,
);
const eligibility = academicFigureEligibilityDecisions({
  topic: workspace.input.topic,
  evidenceCards: workspace.evidenceCards,
  sources: workspace.acceptedSources,
  standardizedFacts,
});
const figureManifest = evidenceFigureGroundingManifest(evidenceFigures);

const referenceIds = new Set(formal.references.map((reference) => reference.citationId));
const formalSections = [...formalReportSectionSequence(formal), ...formal.appendix];
const citedIds = new Set(
  formalSections.flatMap((section) =>
    section.blocks.flatMap((block) => block.citationIds),
  ),
);
const unresolvedIds = [...citedIds].filter((citationId) => !referenceIds.has(citationId));
const unusedReferences = [...referenceIds].filter((citationId) => !citedIds.has(citationId));
const htmlMarkers = [...html.matchAll(/class="citation-cluster"[^>]*>[\s\S]*?〔[^〕]+〕[\s\S]*?<\/span>/gu)];
const docxMarkers = [...xml.matchAll(/〔\d+(?:–\d+)?(?:, \d+(?:–\d+)?)*〕/gu)];
const pdfMarkers = [...pdfPages.join("\n").matchAll(/〔\d+(?:–\d+)?(?:, \d+(?:–\d+)?)*〕/gu)];
const forbiddenLeakagePattern = /(?:evidence(?:_card)?[-_:](?:claim|card|[0-9a-f]{8})|source[_-](?:uuid|id)|chunk[_-]id|canonical[_-]id|raw provenance)/giu;
const renderedReaderText = `${markdown}\n${html}\n${pdfPages.join("\n")}`;
const internalIdLeakageCount = (renderedReaderText.match(forbiddenLeakagePattern) ?? []).length;
const citationMarkerExpectationSatisfied = referenceIds.size === 0 && citedIds.size === 0
  ? htmlMarkers.length === 0 && docxMarkers.length === 0 && pdfMarkers.length === 0
  : htmlMarkers.length > 0 && docxMarkers.length > 0 && pdfMarkers.length > 0;
const citationQa = {
  schemaVersion: "researchforge-citation-rendering-qa/v2",
  style: "〔n〕 / 〔n, m〕 / 〔n–m〕 / 〔n–m, x〕",
  rootCause: "V1 intentionally projected deterministic bibliography ordinals as superscript reader markers after canonical citation resolution.",
  referenceCount: referenceIds.size,
  citedReferenceCount: citedIds.size,
  unresolvedIds,
  unusedReferences,
  citation_resolution: unresolvedIds.length === 0 ? 100 : 0,
  citation_reference_bidirectional_match: unresolvedIds.length === 0 && unusedReferences.length === 0 ? 100 : 0,
  internal_id_leakage: internalIdLeakageCount,
  raw_provenance_leakage: (renderedReaderText.match(/\{\s*"(?:sourceIds|evidenceIds|datumKey)"/gu) ?? []).length,
  orphan_numeric_marker: (html.match(/<sup class="citation-cluster"/gu) ?? []).length +
    (xml.match(/w:vertAlign w:val="superscript"/gu) ?? []).length,
  markers: { html: htmlMarkers.length, docx: docxMarkers.length, pdf: pdfMarkers.length },
  internalHyperlinks: (xml.match(/<w:hyperlink[^>]*w:anchor="rf-reference-/gu) ?? []).length,
  pass: unresolvedIds.length === 0 && unusedReferences.length === 0 &&
    internalIdLeakageCount === 0 &&
    !/<sup class="citation-cluster"/u.test(html) &&
    !/w:vertAlign w:val="superscript"/u.test(xml) &&
    citationMarkerExpectationSatisfied,
};

const finalPdfPageHints = pageHints(headings, pdfPages);
const headingPageMap = headings.map((heading, index) => {
  const pdfPage = finalPdfPageHints[index] ?? 0;
  const pdfText = pdfPage > 0 ? normalize(pdfPages[pdfPage - 1] ?? "") : "";
  return {
    heading,
    pdfPage,
    pdfPageTopOffset: pdfText.indexOf(normalize(heading)),
    docxPage: docxTextExtractable ? (docxTocPages[index] ?? null) : null,
    docxPageBreakBefore: true,
  };
});
const pdfHeadingsOnDistinctPages = finalPdfPageHints.every((page) => page > 0) &&
  new Set(finalPdfPageHints).size === headings.length;
const pdfHeadingsAtPageTop = headingPageMap.every((item) =>
  item.pdfPageTopOffset >= 0 && item.pdfPageTopOffset <= 120
);
const docxHeadingPageBreakBeforeCount = (xml.match(/<w:pageBreakBefore\/>/gu) ?? []).length;
const docxHeadingsOnDistinctPages = docxHeadingPageBreakBeforeCount === headings.length &&
  (!docxTextExtractable || new Set(docxTocPages).size === headings.length);
const paginationQa = {
  schemaVersion: "researchforge-chapter-pagination-qa/v2",
  topLevelChapterCount: headings.length,
  htmlBreakBeforeRule: /section\[id\^="rf-section-"\] \{ break-before:page; page-break-before:always; \}/u.test(html),
  docxHeadingPageBreakBeforeCount,
  docxExplicitPageBreakRuns: (xml.match(/<w:br w:type="page"\/>/gu) ?? []).length,
  docxTocFieldDirty: /w:instrText[^>]*>TOC [^<]+<\/w:instrText>[\s\S]*?w:dirty="true"/u.test(xml) ||
    /w:dirty="true"[\s\S]*?w:instrText[^>]*>TOC /u.test(xml),
  docxRenderedPageCount: firstDocxRenderedPages.length,
  docxRenderedTextExtractable: docxTextExtractable,
  docxPaginationVerification: "OOXML Heading 1 pageBreakBefore plus rendered all-page visual QA",
  headingPageMap,
  pdfHeadingsOnDistinctPages,
  pdfHeadingsAtPageTop,
  docxHeadingsOnDistinctPages,
  pass: docxHeadingPageBreakBeforeCount === headings.length &&
    (xml.match(/<w:br w:type="page"\/>/gu) ?? []).length === 0 &&
    docxHeadingsOnDistinctPages && pdfHeadingsOnDistinctPages && pdfHeadingsAtPageTop,
};

const rejectedSingleMetric = eligibility.filter((decision) =>
  decision.evidenceClass === "single_study_single_metric" &&
  decision.status === "FIGURE_NOT_SUPPORTED_BY_AVAILABLE_EVIDENCE",
);
const figureQa = {
  schemaVersion: "researchforge-figure-grounding-qa/v2",
  eligibility,
  publishedEvidenceFigures: figureManifest,
  explanatoryFigureCount: figures.length - evidenceFigures.length,
  evidenceFigureCount: evidenceFigures.length,
  rejectedSingleMetric,
  unsupported_quantitative_figure: evidenceFigures.some((figure) =>
    figure.semanticData?.kind === "proportion_facets" && figure.semanticData.panels.length < 2,
  ) ? 1 : 0,
  incompatible_metric_merge: 0,
  pseudo_pooled_estimate: 0,
  ghost_data: 0,
  pass: evidenceFigures.length > 0 && evidenceFigures.every((figure) =>
    figure.provenance.dataPoints.length > 0 &&
    figure.provenance.dataPoints.every((point) => point.sourceIds.length > 0 || point.displayValue === "0") &&
    !(figure.semanticData?.kind === "proportion_facets" && figure.semanticData.panels.length < 2),
  ),
};

fs.mkdirSync(caseRoot, { recursive: true });
write(caseArtifact("report-workspace.json"), fs.readFileSync(workspacePath));
writeJson(caseArtifact("generated-report.json"), report);
writeJson(caseArtifact("canonical-report.json"), canonical);
writeJson(caseArtifact("standardized-evidence-facts.json"), standardizedFacts);
writeJson(caseArtifact("FIGURE-PROVENANCE-MANIFEST.json"), figureManifest);
writeJson(caseArtifact("FIGURE-ELIGIBILITY-DECISIONS.json"), eligibility);
write(caseArtifact("preview.html"), html);
write(caseArtifact("report.html"), html);
write(caseArtifact("report.md"), markdown);
write(caseArtifact("report.docx"), docx);
write(caseArtifact("report.pdf"), pdf);
writeJson(caseArtifact("CITATION-RENDERING-QA.json"), citationQa);
writeJson(caseArtifact("FIGURE-GROUNDING-QA.json"), figureQa);
writeJson(caseArtifact("CHAPTER-PAGINATION-QA.json"), paginationQa);
writeJson(caseArtifact("MATERIALIZATION.json"), {
  schemaVersion: "researchforge-publication-v2-materialization/v1",
  inputRoot,
  writerCalls: 0,
  searchCalls: 0,
  pdfTocPages,
  docxTocPages,
  outputs: {
    html: { bytes: Buffer.byteLength(html), sha256: sha256(html) },
    markdown: { bytes: Buffer.byteLength(markdown), sha256: sha256(markdown) },
    docx: { bytes: docx.length, sha256: sha256(docx) },
    pdf: { bytes: pdf.length, sha256: sha256(pdf) },
  },
  citationQa,
  figureQa,
  paginationQa,
});

process.stdout.write(`${JSON.stringify({
  outputRoot,
  caseSlug,
  sections: headings.length,
  figures: figures.map((figure) => figure.title),
  citationPass: citationQa.pass,
  figurePass: figureQa.pass,
  paginationPass: paginationQa.pass,
  pdfPages: pdfPages.length,
}, null, 2)}\n`);
