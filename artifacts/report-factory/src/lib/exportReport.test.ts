import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { GeneratedReport, ReportInput } from "./generateReport.ts";
import type { FormalReportDocument } from "./formalReportDocument.ts";
import {
  buildCanonicalExportDocument,
  buildDocxBlob,
  buildJson,
  buildMarkdown,
  buildPlainText,
  buildPrintHtml,
  downloadPdf,
  PdfExportError,
  ReportExportIntegrityError,
} from "./exportReport.ts";
import { DEFAULT_REPORT_PRESENTATION } from "./reportPresentation.ts";
import { buildReaderCitationEntries } from "./readerCitations.ts";

const nodeRequire = createRequire(import.meta.url);

async function readDocxXmlParts(blob: Blob, paths: readonly string[]): Promise<Record<string, string>> {
  const docxEntry = nodeRequire.resolve("docx");
  const jsZipEntry = nodeRequire.resolve("jszip", { paths: [dirname(docxEntry)] });
  const { default: JSZip } = await import(pathToFileURL(jsZipEntry).href);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const parts: Record<string, string> = {};

  for (const path of paths) {
    const file = zip.file(path);
    assert.ok(file, `DOCX part ${path} should exist`);
    parts[path] = await file.async("string");
  }

  return parts;
}

async function readDocxBytes(blob: Blob, path: string): Promise<Uint8Array> {
  const docxEntry = nodeRequire.resolve("docx");
  const jsZipEntry = nodeRequire.resolve("jszip", { paths: [dirname(docxEntry)] });
  const { default: JSZip } = await import(pathToFileURL(jsZipEntry).href);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file(path);
  assert.ok(file, `DOCX part ${path} should exist`);
  return file.async("uint8array");
}

const input = {
  topic: "都市熱島效應",
  reportType: "研究報告",
  academicLevel: "高中",
  targetAudience: "高中",
  researchDepth: "standard",
  purpose: "學校作業",
  domainOverride: "",
  mode: "直接生成完整報告",
  sourceRequirement: "需要，並生成參考文獻格式",
  citationFormat: "APA",
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
  outputLanguage: "繁體中文",
  rewriteSection: "",
  additionalInfo: "",
  acceptedSources: [],
} satisfies ReportInput;

const report = {
  meta: {
    title: "都市熱島效應研究報告",
    category: "社會議題",
    versionLabel: "正式草稿",
    completeness: 88,
    suggestedAdditions: [],
    acceptedSources: [],
    bibliography: [],
    formalExportProof: {
      planBuildStatus: "plan_built",
      readinessStatus: "ready_limited_report",
      evidenceSetHash: "a".repeat(64),
      writerEvidenceSetHash: "a".repeat(64),
      filteredAfterPlanCount: 0,
      formalResearchValidationPassed: true,
      contentIntegrityValidated: true,
      resumeFrom: "export",
      safeToResume: true,
    },
  },
  sections: [
    {
      heading: "摘要",
      blocks: [{ type: "paragraph", text: "都市植被與地表溫度具有可追溯關聯（Chen, 2024）。" }],
    },
    {
      heading: "參考文獻",
      blocks: [
        {
          type: "list",
          items: [
            "Chen（2024）。Urban heat evidence。https://example.org/research/urban-heat/island/evidence?source=long-identifier",
          ],
        },
      ],
    },
  ],
} satisfies GeneratedReport;

const structuredSources = [
  {
    id: "source-chen",
    title: "Urban heat evidence",
    authors: ["Chen, Wei"],
    year: 2024,
    publisher: "Climate Journal",
    doi: "10.1000/chen",
    url: "https://example.org/chen",
  },
  {
    id: "source-alvarez",
    title: "Cooling through urban canopy",
    authors: ["Alvarez, Maria"],
    year: 2023,
    publisher: "Urban Studies",
    doi: "10.1000/alvarez",
    url: "https://example.org/alvarez",
  },
] as GeneratedReport["meta"]["acceptedSources"];

const emptyFormalSection = (id: string, title: string) => ({
  id,
  title,
  role: "analysis" as const,
  blocks: [],
  tables: [],
  figures: [],
});

const structuredFormalDocument = {
  schemaVersion: "formal-report-document/v1",
  metadata: {
    title: "都市熱島效應研究報告",
    subtitle: "結構化引用測試",
    reportKind: "evidence_synthesis_report",
    reportTypeLabel: "證據綜整報告",
    generatedDate: "2026-08-13",
    documentVersion: "v1",
    researchQuestion: "都市植被如何影響地表溫度？",
    acceptedSourceCount: 2,
    evidenceSourceCount: 2,
    citedSourceCount: 2,
    referenceCount: 2,
    evidenceUnitCount: 0,
    sourceCount: 2,
    evidenceCount: 0,
    sourceYearRange: "2023–2024",
    retrievalDate: "2026-08-13",
  },
  titlePage: {
    title: "都市熱島效應研究報告",
    subtitle: "結構化引用測試",
    reportTypeLabel: "證據綜整報告",
    researchQuestion: "都市植被如何影響地表溫度？",
    evidenceScope: "2 筆可追溯來源",
    generatedDate: "2026-08-13",
    documentVersion: "v1",
  },
  abstract: { text: "本報告比較都市植被與地表溫度。", keywords: ["都市植被"], validation: { status: "pass", attempts: 1, issues: [] } },
  tableOfContents: [],
  researchQuestion: emptyFormalSection("research-question", "研究問題"),
  scopeAndMethod: emptyFormalSection("scope-method", "範圍與方法"),
  analysisSections: [{
    ...emptyFormalSection("findings", "主要發現"),
    blocks: [{
      text: "都市植被與地表溫度具有可追溯關聯。",
      citationIds: ["ref-chen", "ref-alvarez"],
    }],
  }],
  crossSourceSynthesis: emptyFormalSection("synthesis", "跨來源綜整"),
  limitations: emptyFormalSection("limitations", "研究限制"),
  conclusion: emptyFormalSection("conclusion", "結論"),
  references: [
    {
      citationId: "ref-chen",
      sourceIdentity: "doi:10.1000/chen",
      sourceId: "source-chen",
      referenceNumber: 1,
      marker: "Chen, 2024",
      authorYear: "Chen, 2024",
      text: "Chen, W. (2024). Urban heat evidence. https://doi.org/10.1000/chen",
      doi: "10.1000/chen",
      url: "https://example.org/chen",
    },
    {
      citationId: "ref-alvarez",
      sourceIdentity: "doi:10.1000/alvarez",
      sourceId: "source-alvarez",
      referenceNumber: 2,
      marker: "Alvarez, 2023",
      authorYear: "Alvarez, 2023",
      text: "Alvarez, M. (2023). Cooling through urban canopy. https://doi.org/10.1000/alvarez",
      doi: "10.1000/alvarez",
      url: "https://example.org/alvarez",
    },
  ],
  evidenceFacts: [],
  evidenceUnits: [],
  sourceUsage: [],
  appendix: [],
  integrity: {
    status: "pass",
    unknownCitationTokens: [],
    ambiguousCitationTokens: [],
    forbiddenReaderTokens: [],
    excludedParagraphs: 0,
    sourceCountIssues: [],
    citationMappingIssues: [],
    sourceMentionIssues: [],
    sectionCompletenessIssues: [],
    repetitionIssues: [],
    tableIssues: [],
    figureIssues: [],
    factIssues: [],
    sourceOverlapIssues: [],
    sourceCenteredParagraphIssues: [],
    venueIssues: [],
  },
} satisfies FormalReportDocument;

const structuredReport = {
  ...report,
  meta: {
    ...report.meta,
    acceptedSources: structuredSources,
    formalReportDocument: structuredFormalDocument,
    citationIntegrity: {
      status: "pass",
      unknownMarkers: [],
      ambiguousMarkers: [],
      rewrites: [],
    },
  },
  sections: [
    {
      heading: "1. 主要發現",
      blocks: [{
        type: "paragraph",
        text: "都市植被與地表溫度具有可追溯關聯。",
        citationIds: ["ref-chen", "ref-alvarez"],
      }],
    },
    {
      heading: "參考文獻",
      blocks: structuredFormalDocument.references.map((reference) => ({
        type: "paragraph" as const,
        text: reference.text,
      })),
    },
  ],
} satisfies GeneratedReport;

test("print, Markdown, text, and JSON share one canonical export document", () => {
  const canonical = buildCanonicalExportDocument(report, input, "2026/8/9");
  assert.equal(canonical.sections, report.sections);

  const plain = buildPlainText(report, input);
  const markdown = buildMarkdown(report, input);
  const printHtml = buildPrintHtml(report, input, DEFAULT_REPORT_PRESENTATION);
  const json = JSON.parse(buildJson(report, input));

  for (const output of [plain, markdown, printHtml]) {
    assert.match(output, /都市熱島效應研究報告/u);
    assert.match(output, /都市植被與地表溫度具有可追溯關聯（Chen, 2024）/u);
    assert.match(output, /Chen（2024）。Urban heat evidence/u);
  }
  assert.deepEqual(json.canonicalDocument.sections, report.sections);
  assert.equal(json.canonicalDocument.title, report.meta.title);
});

test("structured citations render one compact numeric cluster and numbered alphabetized sources", () => {
  const plain = buildPlainText(structuredReport, input);
  const markdown = buildMarkdown(structuredReport, input);
  const html = buildPrintHtml(structuredReport, input, DEFAULT_REPORT_PRESENTATION);

  assert.match(plain, /關聯〔1–2〕。/u);
  assert.doesNotMatch(plain, /（Alvarez, 2023；Chen, 2024）/u);
  assert.ok(
    plain.indexOf("Alvarez, M. (2023)") < plain.indexOf("Chen, W. (2024)"),
    "APA references should be sorted by author instead of citation order",
  );

  assert.match(markdown, /\[〔1–2〕\]\(#rf-reference-ref-alvarez\)/u);
  assert.match(markdown, /<a id="rf-reference-ref-alvarez"><\/a>1\. Alvarez/u);

  assert.match(html, /<p class="narrative">都市植被/u);
  assert.match(html, /<span class="citation-cluster"><a href="#rf-reference-ref-alvarez">〔1–2〕<\/a><\/span>/u);
  assert.doesNotMatch(html, /class="citation-link"/u);
  assert.match(html, /<p id="rf-reference-ref-alvarez" class="reference-entry">/u);
  assert.match(html, /p\.narrative \{ text-indent:2em; \}/u);
  assert.match(html, /thead \{ display:table-header-group; \}/u);
});

test("compact Family Initials author records keep family names and APA order", () => {
  const sources = [
    { ...structuredSources[0], id: "zhang", authors: ["Zhang J", "Wang P"], year: 2025 },
    { ...structuredSources[0], id: "peng", authors: ["Peng J", "Zhang S"], year: 2026 },
    { ...structuredSources[0], id: "yang", authors: ["Yang Y", "Lv Y"], year: 2025 },
    { ...structuredSources[0], id: "roba", authors: ["Roba ZR", "Tabor KW"], year: 2025 },
  ];
  const references = sources.map((source, index) => ({
    citationId: `ref-${index + 1}`,
    sourceId: source.id,
    text: `${source.authors[0]} (${source.year}). ${source.title}.`,
  }));

  const entries = buildReaderCitationEntries(references, sources);
  assert.deepEqual(entries.map((entry) => entry.sourceId), ["peng", "roba", "yang", "zhang"]);
  assert.deepEqual(entries.map((entry) => entry.label), [
    "Peng & Zhang, 2026",
    "Roba & Tabor, 2025",
    "Yang & Lv, 2025",
    "Zhang & Wang, 2025",
  ]);
});

test("directed-graph print figures use only PDF-safe semantic tags", () => {
  const graphReport: GeneratedReport = {
    ...structuredReport,
    sections: [
      {
        heading: "1. 機制綜整",
        blocks: [{
          type: "formalFigure",
          figure: {
            specType: "figure",
            number: 1,
            figureType: "conceptual_mechanism",
            title: "綠覆率影響熱環境的機制鏈",
            units: null,
            legend: [],
            data: {
              kind: "directed_graph",
              nodes: [
                { id: "green", label: "綠覆率" },
                { id: "heat", label: "熱環境" },
              ],
              edges: [{ from: "green", to: "heat", label: "遮蔭與蒸散" }],
            },
            sourceNote: "綜合證據",
            note: "概念關係，不代表因果效應量。",
            altText: "綠覆率透過遮蔭與蒸散影響熱環境。",
          },
        }],
      },
      structuredReport.sections[1],
    ],
  };

  const html = buildPrintHtml(graphReport, input, DEFAULT_REPORT_PRESENTATION);
  assert.match(html, /<ol class="rf-workflow">/u);
  assert.match(html, /<span class="rf-workflow-index">01<\/span><strong>綠覆率<\/strong>/u);
  assert.equal((html.match(/<strong>綠覆率<\/strong>/gu) ?? []).length, 1);
  assert.doesNotMatch(html, /<\/?b>/u);
});

test("body_paragraph_first_line_indent", async () => {
  const blob = await buildDocxBlob(structuredReport, input, DEFAULT_REPORT_PRESENTATION);
  const parts = await readDocxXmlParts(blob, [
    "word/document.xml",
    "word/_rels/document.xml.rels",
  ]);
  const documentXml = parts["word/document.xml"];
  const relationships = parts["word/_rels/document.xml.rels"];

  assert.match(documentXml, /<w:ind w:firstLine="440"\/>/u);
  assert.doesNotMatch(documentXml, /w:vertAlign w:val="superscript"/u);
  assert.match(documentXml, />〔1–2〕<\/w:t>/u);
  assert.match(documentXml, /<w:hyperlink[^>]*w:anchor="rf-reference-ref-alvarez"/u);
  assert.match(documentXml, /<w:hyperlink[^>]*r:id=/u);
  assert.match(documentXml, /<w:bookmarkStart[^>]*w:name="rf-reference-ref-alvarez"/u);
  assert.match(relationships, /Target="https:\/\/doi\.org\/10\.1000\/chen"[^>]*TargetMode="External"/u);
  assert.ok(documentXml.indexOf("Alvarez, M. (2023)") < documentXml.indexOf("Chen, W. (2024)"));
  assert.doesNotMatch(documentXml, /Alvarez, 2023；Chen, 2024/u);
});

test("every formal export blocks unresolved canonical citation mappings", async () => {
  const blockedReport: GeneratedReport = {
    ...report,
    meta: {
      ...report.meta,
      citationIntegrity: {
        status: "blocked",
        unknownMarkers: ["[S99]"],
        ambiguousMarkers: [],
        rewrites: [],
      },
    },
  };

  for (const build of [
    () => buildCanonicalExportDocument(blockedReport, input),
    () => buildPlainText(blockedReport, input),
    () => buildMarkdown(blockedReport, input),
    () => buildJson(blockedReport, input),
    () => buildPrintHtml(blockedReport, input, DEFAULT_REPORT_PRESENTATION),
  ]) {
    assert.throws(build, ReportExportIntegrityError);
  }
  await assert.rejects(
    buildDocxBlob(blockedReport, input, DEFAULT_REPORT_PRESENTATION),
    ReportExportIntegrityError,
  );
  let fetchCalled = false;
  await assert.rejects(
    downloadPdf(blockedReport, input, DEFAULT_REPORT_PRESENTATION, {
      fetchImpl: (async () => {
        fetchCalled = true;
        throw new Error("must not reach PDF service");
      }) as typeof fetch,
    }),
    ReportExportIntegrityError,
  );
  assert.equal(fetchCalled, false);
});

test("Markdown and DOCX formal exports require canonical readiness and matching evidence hashes", async () => {
  const blockedReport: GeneratedReport = {
    ...report,
    meta: { ...report.meta, formalExportProof: undefined },
  };

  assert.throws(() => buildMarkdown(blockedReport, input), ReportExportIntegrityError);
  await assert.rejects(
    buildDocxBlob(blockedReport, input, DEFAULT_REPORT_PRESENTATION),
    ReportExportIntegrityError,
  );
});

test("canonical limited boundary projection may export without claiming completed Writer validation", () => {
  const limitedDocument = {
    ...structuredFormalDocument,
    metadata: {
      ...structuredFormalDocument.metadata,
      reportKind: "limited_evidence_brief" as const,
      eligibleSourceCount: 2,
      evidenceExcerptCount: 2,
    },
    quality: {
      passed: true,
      blockExport: false,
    },
  } as unknown as FormalReportDocument;
  const boundaryReport = {
    ...structuredReport,
    meta: {
      ...structuredReport.meta,
      formalReportDocument: limitedDocument,
      formalExportProof: {
        ...report.meta.formalExportProof!,
        formalResearchValidationPassed: false,
        resumeFrom: "validation" as const,
      },
    },
  } satisfies GeneratedReport;

  assert.doesNotThrow(() => buildCanonicalExportDocument(boundaryReport, input));
  const noLiveEvidence = {
    ...boundaryReport,
    meta: {
      ...boundaryReport.meta,
      formalReportDocument: {
        ...limitedDocument,
        metadata: { ...limitedDocument.metadata, evidenceExcerptCount: 0 },
      },
    },
  } satisfies GeneratedReport;
  assert.throws(
    () => buildCanonicalExportDocument(noLiveEvidence, input),
    ReportExportIntegrityError,
  );
});

test("print HTML is clean A4 output with wrapping bibliography styles", () => {
  const html = buildPrintHtml(report, input, DEFAULT_REPORT_PRESENTATION);

  assert.match(html, /@page \{ size: A4; margin: 23mm 23mm 24mm; \}/u);
  assert.match(html, /<section id="rf-section-2" class="references"><h1>參考文獻<\/h1>/u);
  assert.match(html, /\.references p, \.references li \{[^}]*text-indent:-2em;/u);
  assert.match(html, /overflow-wrap:anywhere;/u);
  assert.match(html, /word-break:break-word;/u);
  assert.match(html, /\.figure-alt \{ height:0; max-height:0; margin:0;/u);
  assert.doesNotMatch(html, /class="hint"|window\.print|about:blank|<script/iu);
});

test("every top-level chapter starts a new page in print HTML and DOCX", async () => {
  const html = buildPrintHtml(structuredReport, input, DEFAULT_REPORT_PRESENTATION);
  assert.match(html, /section\[id\^="rf-section-"\] \{ break-before:page; page-break-before:always; \}/u);
  assert.doesNotMatch(html, /\.toc \{ page-break-after:always;/u);

  const blob = await buildDocxBlob(structuredReport, input, DEFAULT_REPORT_PRESENTATION);
  const parts = await readDocxXmlParts(blob, ["word/document.xml"]);
  const documentXml = parts["word/document.xml"];
  const pageBreakBeforeCount = (documentXml.match(/<w:pageBreakBefore\/>/gu) ?? []).length;
  assert.equal(pageBreakBeforeCount, structuredReport.sections.length);
  assert.doesNotMatch(documentXml, /<w:br w:type="page"\/>/u);
});

test("DOCX OOXML separates cover and body and keeps formal print settings", async () => {
  const blob = await buildDocxBlob(report, input, DEFAULT_REPORT_PRESENTATION);
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  const parts = await readDocxXmlParts(blob, [
    "word/document.xml",
    "word/styles.xml",
    "word/header1.xml",
    "word/footer1.xml",
  ]);
  const documentXml = parts["word/document.xml"];
  const stylesXml = parts["word/styles.xml"];
  const headerXml = parts["word/header1.xml"];
  const footerXml = parts["word/footer1.xml"];
  const sectionProperties = Array.from(
    documentXml.matchAll(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/gu),
    (match) => match[0],
  );

  assert.equal(sectionProperties.length, 2, "cover and body must be separate DOCX sections");
  assert.doesNotMatch(sectionProperties[0], /w:(?:header|footer)Reference/u);
  assert.match(sectionProperties[1], /w:headerReference/u);
  assert.match(sectionProperties[1], /w:footerReference/u);

  for (const section of sectionProperties) {
    assert.match(section, /<w:pgSz(?=[^>]*w:w="11906")(?=[^>]*w:h="16838")[^>]*\/>/u);
    assert.match(
      section,
      /<w:pgMar(?=[^>]*w:top="1304")(?=[^>]*w:right="1304")(?=[^>]*w:bottom="1304")(?=[^>]*w:left="1304")[^>]*\/>/u,
    );
  }

  assert.doesNotMatch(documentXml, /目錄|TOC \\o/u);
  assert.doesNotMatch(documentXml, /TOC \\o/u);
  assert.match(documentXml, /都市植被與地表溫度具有可追溯關聯（Chen, 2024）/u);
  assert.match(documentXml, /Chen（2024）。Urban heat evidence/u);
  assert.ok(!documentXml.includes("\u200b"), "reference identifiers must remain copyable without invisible characters");
  assert.match(documentXml, /<w:ind(?=[^>]*w:left="720")(?=[^>]*w:hanging="720")[^>]*\/>/u);
  assert.match(documentXml, /<w:spacing(?=[^>]*w:line="330")(?=[^>]*w:lineRule="auto")[^>]*\/>/u);

  assert.match(stylesXml, /w:ascii="Noto Sans TC Thin"/u);
  assert.match(stylesXml, /w:eastAsia="Noto Sans TC Thin"/u);
  assert.match(stylesXml, /w:cs="Noto Sans TC Thin"/u);
  assert.match(stylesXml, /<w:sz w:val="22"\/>/u);
  assert.match(stylesXml, /<w:spacing(?=[^>]*w:line="330")(?=[^>]*w:lineRule="auto")[^>]*\/>/u);

  assert.match(headerXml, /都市熱島效應研究報告/u);
  assert.match(footerXml, /<w:instrText[^>]*>PAGE<\/w:instrText>/u);
  assert.match(footerXml, /<w:instrText[^>]*>NUMPAGES<\/w:instrText>/u);
});

test("cjk_render_preserved", async () => {
  const html = buildPrintHtml(structuredReport, input, DEFAULT_REPORT_PRESENTATION);
  for (const family of [
    "ResearchForge Noto Sans TC",
    "Noto Sans CJK TC",
    "Noto Serif CJK TC",
    "Source Han Sans TC",
    "Microsoft JhengHei",
    "PingFang TC",
    "Arial Unicode MS",
  ]) {
    assert.match(html, new RegExp(family, "u"));
  }
  assert.match(html, /都市植被與地表溫度具有可追溯關聯/u);

  const blob = await buildDocxBlob(structuredReport, input, DEFAULT_REPORT_PRESENTATION);
  const parts = await readDocxXmlParts(blob, [
    "word/document.xml",
    "word/styles.xml",
    "word/fontTable.xml",
    "word/_rels/fontTable.xml.rels",
    "docProps/custom.xml",
  ]);
  assert.match(parts["word/document.xml"], /都市植被與地表溫度具有可追溯關聯/u);
  assert.match(parts["word/styles.xml"], /w:eastAsia="Noto Sans TC Thin"/u);
  assert.match(parts["word/styles.xml"], /w:cs="Noto Sans TC Thin"/u);
  assert.match(parts["word/fontTable.xml"], /w:name="Noto Sans TC Thin"/u);
  assert.match(parts["word/fontTable.xml"], /w:embedRegular/u);
  assert.match(parts["word/_rels/fontTable.xml.rels"], /relationships\/font/u);
  assert.match(parts["word/_rels/fontTable.xml.rels"], /fonts\/font1\.odttf/u);
  const embeddedFont = await readDocxBytes(blob, "word/fonts/font1.odttf");
  assert.ok(embeddedFont.byteLength > 1_000_000);
  assert.match(parts["docProps/custom.xml"], /ResearchForgeCjkFallbacks/u);
  assert.match(parts["docProps/custom.xml"], /ResearchForgeEmbeddedCjkFont/u);
  assert.match(parts["docProps/custom.xml"], /Noto Sans TC Thin \(OFL\)/u);
  assert.match(parts["docProps/custom.xml"], /Noto Sans CJK TC/u);
  assert.match(parts["docProps/custom.xml"], /Microsoft JhengHei/u);
  assert.match(parts["docProps/custom.xml"], /PingFang TC/u);
});

test("downloadPdf requests a deterministic PDF and directly saves the returned file", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\ndeterministic-fixture");
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  let savedBlob: Blob | undefined;
  let savedFilename = "";

  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    requestedUrl = String(url);
    requestInit = init;
    return new Response(pdfBytes, {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  }) as typeof fetch;

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        open() {
          throw new Error("native print window must never open");
        },
        print() {
          throw new Error("native browser printing must never run");
        },
      },
    });

    await downloadPdf(report, input, DEFAULT_REPORT_PRESENTATION, {
      fetchImpl,
      saveBlob(blob, filename) {
        savedBlob = blob;
        savedFilename = filename;
      },
    });
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }

  assert.equal(requestedUrl, "/api/report-exports/pdf");
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(requestInit?.headers, { "Content-Type": "application/json" });
  const requestBody = JSON.parse(String(requestInit?.body));
  assert.equal(requestBody.filename, "都市熱島效應.pdf");
  assert.match(requestBody.html, /^<!doctype html>/u);
  assert.match(requestBody.html, /@page \{ size: A4; margin: 23mm 23mm 24mm; \}/u);
  assert.doesNotMatch(requestBody.html, /<script|window\.print|about:blank/iu);
  assert.equal(savedFilename, "都市熱島效應.pdf");
  assert.equal(savedBlob?.type, "application/pdf");
  assert.equal(await savedBlob?.text(), "%PDF-1.7\ndeterministic-fixture");
});

test("downloadPdf surfaces renderer errors and never saves a fallback", async () => {
  let saveCalls = 0;
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({ code: "PDF_RENDER_FAILED", message: "internal detail" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  await assert.rejects(
    downloadPdf(report, input, DEFAULT_REPORT_PRESENTATION, {
      fetchImpl,
      saveBlob() {
        saveCalls += 1;
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof PdfExportError);
      assert.equal(error.message, "伺服器無法產生 PDF，請稍後再試。");
      assert.doesNotMatch(error.message, /internal detail/u);
      return true;
    },
  );
  assert.equal(saveCalls, 0);
});

test("downloadPdf rejects non-PDF and truncated responses", async () => {
  const responses = [
    new Response("<html>proxy error</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }),
    new Response("not-a-pdf", {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    }),
  ];

  for (const response of responses) {
    await assert.rejects(
      downloadPdf(report, input, DEFAULT_REPORT_PRESENTATION, {
        fetchImpl: (async () => response) as typeof fetch,
        saveBlob() {
          assert.fail("invalid responses must not be downloaded");
        },
      }),
      PdfExportError,
    );
  }
});
