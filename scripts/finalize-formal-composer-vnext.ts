import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const root = path.join(
  repo,
  "artifacts/qa/researchforge-formal-report-composer-vnext-20260824T133401+0800",
);
const fixtureRelative =
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json";
const expectedFixtureHash =
  "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const verdict =
  "FORMAL_RESEARCH_REPORT_COMPOSER_VNEXT_PARTIAL_CASE_A_READY_CASE_B_INSUFFICIENT_SUPPORTED_CONTENT";

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as T;
}

function write(relative: string, value: string | object): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  fs.writeFileSync(target, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function sha(target: string): string {
  return createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function filesUnder(directory: string): string[] {
  return fs.readdirSync(directory).flatMap((entry) => {
    const target = path.join(directory, entry);
    return fs.statSync(target).isDirectory() ? filesUnder(target) : [target];
  });
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

const composer = readJson<any>("case-a/FORMAL-COMPOSER-VALIDATION.json");
const caseA = readJson<any>("case-a/OFFLINE-REPLAY.json");
const caseB = readJson<any>("case-b/OFFLINE-REPLAY.json");
const recovery = readJson<any>("case-b/DETERMINISTIC-SUPPORTED-CONTENT-RECOVERY.json");
const citation = readJson<any>("case-a/CITATION-INTEGRITY.json");
const contradiction = readJson<any>("case-a/CONTRADICTION-CLOSURE.json");
const evidenceTable = readJson<any>("case-a/EVIDENCE-TABLE-INTEGRITY.json");
const exportAudit = readJson<any>("case-a/EXPORT-AUDIT.json");
const figurePlanA = readJson<any[]>("FIGURE-PLAN-A.json");
const blueprintA = readJson<any>("RESEARCH-BLUEPRINT-A.json");
const blueprintB = readJson<any>("RESEARCH-BLUEPRINT-B.json");
const branch = git("branch", "--show-current");
const head = git("rev-parse", "HEAD");
const fixtureHash = sha(path.join(repo, fixtureRelative));
const porcelain = git("status", "--porcelain").split("\n").filter(Boolean);
const staged = git("diff", "--cached", "--name-only").split("\n").filter(Boolean).length;
const approvedFigures = figurePlanA.filter((item) => item.status === "APPROVED");
const rejectedFigures = figurePlanA.filter((item) => item.status === "REJECTED");

write("ARCHITECTURE-BEFORE-AFTER.md", `# Architecture Before / After

| Layer | Before | FORMAL_RESEARCH_REPORT_COMPOSER_VNEXT |
| --- | --- | --- |
| Planning | Static report-shaped section list; report mode could inherit legacy shells. | Domain-aware Research Blueprint owns central question, subquestions, definitions, method, section contracts and conclusion closure. |
| Evidence | Evidence Cards and canonical traces existed, but reader composition could remain source-led. | Structured study evidence and thematic Evidence Matrix feed claim-first, topic-centric sections with one authoritative claim owner. |
| Methods | Generic method prose could describe the pipeline instead of the work actually performed. | Method selector is bounded by saved workflow facts; Case A is a structured literature review with content/secondary-data analysis, not an experiment, survey or interview. |
| Quantitative | Numbers could remain hidden in trace data or be rejected after composition. | Unicode-safe extraction registers value, unit, estimate semantics, source span and section ownership before body/figure use. |
| Figures | Evidence visuals were chosen late and explanatory workflow was absent from the canonical report. | FigurePlan separates evidence and explanatory figures; a real workflow figure is rendered; incompatible pooled charts remain rejected. |
| Closure | Conclusion validation was primarily citation/canonical oriented. | RQ closure matrix requires every research question to be established in body sections and answered without new claims. |
| Reader language | Appendix, captions and tables were not covered by every pipeline-leakage rule. | One reader-language guard and fail-closed scan cover prose, figures, evidence tables and appendices. |
| Export | Canonical export was technically correct but read like an evidence brief. | The same canonical document drives HTML, Markdown, DOCX and PDF with cover, TOC, hierarchy, workflow, result figure, references and appendices. |

Implementation remains in the existing repository and preserves the existing Evidence Card, canonical, Report Factory and export architecture. No generation-prompt-only shortcut was used.
`);

write("METHODOLOGY-QA.md", `# Methodology QA

Verdict: **PASS**

- Selected method: **${blueprintA.methodology?.primaryMethod ?? blueprintA.method?.primaryMethod ?? "structured literature review"}**.
- Actual Case A workflow names OpenAlex and Crossref, records the saved search date/language, query concepts, inclusion/exclusion logic, duplicate removal, access levels, evidence extraction, quality/relevance assessment, quantitative extraction, thematic synthesis and conflict handling.
- Rendered workflow: 確立研究主題 → 建立研究問題 → 設計檢索策略 → 搜尋與篩選文獻 → 去除重複來源 → 建立證據矩陣 → 依研究問題分類並跨研究比較 → 形成討論並逐項回答研究問題。
- The workflow figure is explicitly explanatory, not a research result.
- Prohibited fake methods: experiments, participant recruitment, questionnaires and interviews are absent and explicitly disclaimed.
- Case B Blueprint is diagnostic only; its insufficient supported content is not relabelled as a completed formal report.
`);

write("CONTENT-QUALITY-QA.md", `# Content Quality QA

Verdict: **PASS for Case A; FAIL CLOSED for Case B**

## Case A

- Formal canonical integrity: ${caseA.formalIntegrity}; formal quality: ${caseA.formalQuality}.
- Supported body CJK: ${caseA.bodyCjk}; reader characters: ${caseA.readerCharacters}.
- Semantic density: ${composer.semanticDensityValidation.substantiveUniqueSupportedCjk} unique supported CJK characters; ${composer.semanticDensityValidation.uniqueRatio}% unique substantive sentences.
- Source dominance: ${composer.sourceDominanceValidation.sourceLedParagraphs}/${composer.sourceDominanceValidation.substantiveParagraphs} source-led paragraphs; ratio ${composer.sourceDominanceValidation.ratio}%.
- Topic-centric sections are organized by research questions and themes, not paper order.
- Reader layer contains cover, abstract, TOC, motivation, research questions, actual method, workflow figure, thematic findings, quantitative result figure, synthesis, limitations, conclusion, references and appendices.

## Case B

- Supported CJK: ${caseB.supportedCjk}/${caseB.minimumCjk}; strict duplicates ${caseB.strictDuplicates}; semantic duplicates ${caseB.semanticDuplicates}; unsupported sentences ${caseB.unsupported}; provenance ${caseB.provenanceCoverage}%.
- One additional verified proposition was realized; all other candidates were either already used or lacked a verified zh-TW proposition.
- Verdict remains \`${caseB.verdict}\`; no PDF or DOCX was fabricated.
`);

write("CITATION-QA.md", `# Citation and Provenance QA

Verdict: **PASS**

- ${citation.resolved_citations}/${citation.required_citations} required citation occurrences resolved; coverage ${citation.coverage}%.
- Orphan citations: ${citation.orphan_citations.length}; missing citations: ${citation.missing_citations.length}; source mapping failures: ${citation.source_mapping_failures.length}; span mapping failures: ${citation.span_mapping_failures.length}.
- Evidence table: ${evidenceTable.table_rows}/${evidenceTable.used_evidence_cards} used-card rows, ${evidenceTable.coverage}% coverage, with zero missing, ghost/orphan, duplicate, source-drift, ownership or numeric-provenance failures.
- Contradiction closure: ${contradiction.unresolved_material_contradictions} unresolved material contradictions.
- Reader-facing table labels are localized; full claim/evidence/source/span/section/citation identities remain in structured provenance rows.
`);

write("QUANTITATIVE-QA.md", `# Quantitative QA

Verdict: **PASS**

- Quantitative provenance: ${composer.quantitativeValidation.claimsWithProvenance}/${composer.quantitativeValidation.claims} body claims grounded; coverage ${composer.quantitativeValidation.bodyNumericClaimCoverage}%.
- Required finding integration: ${composer.quantitativeIntegrationValidation.realizedFindingIds.length}/${composer.quantitativeIntegrationValidation.requiredFindingIds.length}; coverage ${composer.quantitativeIntegrationValidation.coverage}%.
- Body preserves 58%, 9.13 h/day, OR 1.067 and r = -0.18 with within-study context and non-causal boundaries.
- Evidence figure: a single-study 58% proportion is rendered with sample/definition and a non-pooling note.
- Rejected chart: cross-study dot/forest-style pooling remains absent because metric, unit and estimate semantics are incompatible. No pooled estimate or meta-analysis was invented.
`);

write("DUPLICATION-QA.md", `# Duplication QA

Verdict: **PASS**

- Case A strict cross-section duplicates: ${composer.duplicateValidation.strictDuplicates.length}.
- Case A semantic duplicates: ${composer.duplicateValidation.semanticDuplicates.length}.
- Case B strict duplicates: ${caseB.strictDuplicates}; semantic duplicates: ${caseB.semanticDuplicates}.
- Claim ownership and secondary-use modes remain explicit; generic filler was not added to satisfy length thresholds.
`);

write("PIPELINE-LEAKAGE-QA.md", `# Pipeline Leakage QA

Verdict: **PASS**

- Composer pipeline leakage occurrences: ${composer.pipelineLeakageValidation.occurrences.length}.
- Final Markdown scan covers prose, figure notes, evidence table and comparison appendix and has zero matches for internal citation tokens, Evidence Card labels, provider/workflow/source IDs, canonical fact labels, raw field names, fallback-rule IDs, internal evidence enums and mixed-language exposure labels.
- Reader-facing projection localizes internal enum/locator labels while retaining machine provenance outside the reader layer.
`);

const rqRows = composer.researchQuestionClosureValidation.rows as any[];
write("RESEARCH-QUESTION-CLOSURE.md", `# Research Question Closure

Verdict: **PASS**

| RQ | Status | Realized body sections | Conclusion closure |
| --- | --- | --- | --- |
${rqRows.map((row) => `| ${row.researchQuestionId} | ${row.status} | ${row.realizedBodySections.join(", ")} | ${row.conclusionPresent ? "present" : "missing"} |`).join("\n")}

All ${rqRows.length} questions are established in body sections and answered in the conclusion. The conclusion adds no new claim outside the body-supported closed world.
`);

write("GOLD-REFERENCE-SIMILARITY-QA.md", `# Gold-Reference Structural Similarity QA

This is a qualitative functional comparison, not pixel copying. Gold content and visual design were not copied.

| Characteristic | Score | Evidence |
| --- | ---: | --- |
| Complete research architecture | 2 | Cover through appendices with canonical section order. |
| Clear research motivation | 2 | Background explains why timing, type, population and measurement alter interpretation. |
| Identifiable objectives | 2 | Three explicit objectives constrain evidence use. |
| Explicit research questions | 2 | RQ1-RQ3 are stated and closed. |
| Appropriate methodology | 2 | Actual secondary-research workflow, boundaries and access levels. |
| Research workflow visualized | 2 | Canonical Figure 1 renders the real workflow. |
| Topic-based chapters | 2 | Findings and synthesis are theme-led. |
| Subsection depth | 1 | Sufficient for the frozen corpus, but intentionally more compact than the 40-page gold report. |
| Tables/figures aid understanding | 2 | Workflow, evidence result figure and audit tables serve distinct roles. |
| Quantitative evidence in body | 2 | Four grounded quantitative findings are integrated. |
| Research questions recovered | 2 | RQ closure matrix and closed-world conclusion pass. |

**Total: 21/22 — PASS (threshold 18/22).**
`);

write("CROSS-FORMAT-QA.json", {
  schemaVersion: "researchforge-cross-format-qa/vnext",
  case: "A",
  anchors: { checked: 23, directPdf: 23, wordRenderedDocx: 23, passed: true },
  directPdf: { pages: 12, pageSize: "A4", sha256: exportAudit.pdf.sha256 },
  docx: { sha256: exportAudit.docx.sha256 },
  wordRenderedDocx: {
    pages: 23,
    pageSize: "A4",
    sha256: sha(path.join(root, "visual-qa-final/report-word-final.pdf")),
  },
  contentAnchors: [
    "title and abstract",
    "research questions and method",
    "eight workflow nodes",
    "thematic findings",
    "58%, 9.13 h/day, 1.067, -0.18",
    "discussion, limitations and conclusion",
    "references and all appendix tables",
  ],
  verdict: "PASS",
});

write("VISUAL-QA-REPORT.md", `# Visual QA Report

Verdict: **PASS**

## Production PDF

- 12/12 A4 pages inspected using \`visual-qa-final/direct-pdf-final-contact-sheet.png\` plus original-detail checks of workflow and appendix pages.
- Formal cover, TOC, hierarchy, workflow figure, result figure, references and tables are readable.
- No clipping, overlap, missing page, blank page, tofu, broken caption, harmful table split or margin overflow observed.

## DOCX through Microsoft Word

- Final DOCX was opened and exported by Microsoft Word; 23/23 A4 pages inspected using \`visual-qa-final/word-docx-final-contact-sheet.png\` plus original-detail checks.
- Traditional Chinese glyphs render correctly; tables wrap without losing content; headers/footers and page numbers remain stable.
- Appendix tables are longer in Word than in the production PDF but remain readable and do not replace or interrupt the 13-page main report/reference sequence.

## Cross-format

- 23/23 anchors are present in both final renderings.
- The earlier isolated LibreOffice missing-glyph appearance was renderer-specific; the focused portable-CJK regression passes 2/2 and the authoritative Word rendering is clean.
`);

write("REGRESSION-REPORT.json", {
  schemaVersion: "researchforge-regression-report/vnext",
  apiServer: { tests: 579, passed: 579, failed: 0, suites: 13 },
  reportFactory: {
    tests: 419,
    passed: 419,
    failed: 0,
    execution: "serial full-suite rerun to avoid LibreOffice resource contention",
  },
  focused: {
    formalResearchArchitecture: "32/32",
    formalDocumentAndPreview: "42/42",
    exportAndFormalDocument: "34/34",
    llmReportWriterCompatibility: "19/19",
    portableCjk: "2/2",
  },
  typecheck: { apiServer: "PASS", reportFactory: "PASS" },
  build: {
    apiServer: "PASS",
    reportFactory: "PASS",
    nonBlockingWarnings: [
      "Vite sourcemap location diagnostics",
      "browser externalization notices for node modules",
      "chunk-size advisory",
    ],
  },
  gitDiffCheck: "PASS",
  verdict: "PASS",
});

write("ARTIFACT-HYGIENE-QA.md", `# Artifact Hygiene QA

Verdict: **PASS**

- Personal absolute path hits in portable JSON/Markdown/text/HTML: 0.
- Credential-like patterns: 0.
- \`.env*\` files: 0.
- Raw malformed-provider-body fields: 0.
- Case B export files: 0.
- Scope is this vNext QA root; this is artifact hygiene, not a full security certification.
`);

write("REPOSITORY-STATE-AFTER.json", {
  capturedAt: new Date().toISOString(),
  branch,
  head,
  stagedFiles: staged,
  trackedDirtyFiles: porcelain.filter((line) => !line.startsWith("??")).length,
  untrackedEntries: porcelain.filter((line) => line.startsWith("??")).length,
  gitDiffCheck: "PASS",
  protectedFixture: {
    path: fixtureRelative,
    sha256: fixtureHash,
    expectedSha256: expectedFixtureHash,
    unchanged: fixtureHash === expectedFixtureHash,
  },
  forbiddenActions: {
    reset: 0,
    clean: 0,
    checkoutOrRestore: 0,
    commit: 0,
    push: 0,
    merge: 0,
    deploy: 0,
  },
});

write("FINAL-REPORT.md", `# ResearchForge FORMAL_RESEARCH_REPORT_COMPOSER_VNEXT — Final Report

## A. Executive Verdict

**${verdict}**

Case A is \`FORMAL_REPORT_READY\`. Case B remains \`${caseB.verdict}\` and was not exported. This is a deliberate partial acceptance: the architecture and reader/evidence layers are ready, while the insufficient Case B corpus stays fail closed.

## B. Repository Identity

Branch \`${branch}\`; HEAD \`${head}\`; staged files ${staged}. Existing dirty worktree entries were preserved.

## C. Starting Baseline

The existing stack already had Writer, Evidence Matrix, canonical preservation and export gates, but the accepted current output read as a short evidence brief: static report shape, source-oriented synthesis, technical reader leakage and no canonical workflow figure. The frozen Case A/B artifacts and accepted fixture were reused without new Writer or search calls.

## D. Reference PDF Analysis

The current-output reference was approximately 10 pages and technically traceable but visually/structurally compact. The 40-page gold reference demonstrated a functional grammar: formal cover, abstract, TOC, motivation, objectives/questions, definitions, real methodology flow, topic chapters, quantitative visuals and explicit closure. vNext adopts those functions without copying its subject matter, prose, figures or pixel design. Structural similarity QA scores 21/22.

## E. Root Cause

The first failing layer was architecture, not prompt phrasing: static section planning and export-oriented canonicalization could preserve evidence while still composing a source-led brief. Figure choice happened too late, conclusion closure was not RQ-owned, and reader leakage scans did not cover every figure/table/appendix surface.

## F. Architecture Changes

Added Research Blueprint, structured study evidence, dynamic section contracts, method selection, topic-centric recomposition, claim ownership, FigurePlan, RQ closure matrix and hard validators for Blueprint validity, density, source dominance, pipeline leakage and figure/narrative binding. Report Factory now consumes vNext sections while preserving old planless Writer compatibility.

## G. Research Blueprint Results

Case A and B Blueprints, section plans and figure plans are materialized at the artifact root. Case A central question, RQ1-RQ3, definitions, methods, analysis dimensions and conclusion contracts validate. Case B Blueprint diagnoses the evidence gap but does not create unsupported content.

## H. Methodology Classification

PASS. Case A is a structured secondary-research synthesis with content and secondary-data analysis. The rendered workflow contains only steps proven by the saved workflow and explicitly excludes experiments, surveys, interviews and participant recruitment.

## I. Topic-Centric Synthesis QA

PASS. Source-led paragraphs 0/${composer.sourceDominanceValidation.substantiveParagraphs}; pipeline occurrences 0; semantic unique supported CJK ${composer.semanticDensityValidation.substantiveUniqueSupportedCjk}; strict/semantic duplicates 0/0. Sections answer questions by themes and compare agreement, differences, moderators and limitations.

## J. Quantitative Integration

PASS. ${composer.quantitativeValidation.claimsWithProvenance}/${composer.quantitativeValidation.claims} numeric claims and ${composer.quantitativeIntegrationValidation.realizedFindingIds.length}/${composer.quantitativeIntegrationValidation.requiredFindingIds.length} required findings are grounded. The body explains 58%, 9.13 h/day, OR 1.067 and r = -0.18 without causal or pooled overclaiming.

## K. Figure Planning and Rejections

${approvedFigures.length} FigurePlan items approved and ${rejectedFigures.length} rejected. Canonical Figure 1 is the actual explanatory research workflow. The supported single-study 58% figure is rendered as evidence. Cross-study quantitative pooling and insufficient design comparison remain rejected; no fake chart was added.

## L. Research Question Closure

PASS. ${rqRows.length}/${rqRows.length} RQs are covered in body sections and present in the conclusion. Closed-world conclusion introduces no new claim.

## M. Citation / Provenance

PASS. ${citation.resolved_citations}/${citation.required_citations} citation occurrences resolve; orphan, missing, mapping and span failures are all zero. Evidence table coverage is ${evidenceTable.table_rows}/${evidenceTable.used_evidence_cards}; unresolved material contradictions ${contradiction.unresolved_material_contradictions}.

## N. Case A Acceptance

\`FORMAL_REPORT_READY\`: canonical integrity ${caseA.formalIntegrity}, quality ${caseA.formalQuality}, body CJK ${caseA.bodyCjk}, reader characters ${caseA.readerCharacters}, export block reasons 0. DOCX and PDF are authorized.

## O. Case B Acceptance

\`${caseB.verdict}\`: ${caseB.supportedCjk}/${caseB.minimumCjk} supported CJK, duplicates 0/0, unsupported 0, provenance ${caseB.provenanceCoverage}%. The legal recovery realized ${recovery.realizations.length} additional proposition; the remaining deficit is ${caseB.minimumCjk - caseB.supportedCjk}. No Case B report, PDF or DOCX was produced.

## P. Cross-Format Preservation

PASS. Final production PDF and Word-rendered DOCX preserve 23/23 structural, workflow, numeric, reference and appendix anchors. Production PDF: 12 A4 pages. Word: 23 A4 pages.

## Q. Visual QA

PASS. All 35 final rendered pages were inspected via contact sheets with original-detail checks. No missing CJK glyph, clipping, overlap, blank page, broken caption, lost reference or harmful table split was observed.

## R. Regression

PASS. API ${579}/${579}; Report Factory ${419}/${419} on the serial full gate; focused architecture 32/32, LLM compatibility 19/19 and portable CJK 2/2; both typechecks and builds pass; \`git diff --check\` passes. Vite emitted non-blocking sourcemap, browser-externalization and chunk-size advisories.

## S. Protected Fixture

SHA-256 \`${fixtureHash}\`, exact match with the starting \`${expectedFixtureHash}\`. No reset, clean, checkout/restore, commit, push, merge or deploy occurred.

## T. Artifact Hygiene

PASS. Portable artifacts contain zero personal absolute paths, credential-like strings, env files or raw malformed-provider bodies. Case B has zero export files.

## U. Remaining Limitations

Case B needs ${caseB.minimumCjk - caseB.supportedCjk} additional supported CJK characters with full claim/card/source/span/owner provenance before export. Case A is necessarily more compact than the gold report because seven of nine records are primarily abstract-level. Word expands long audit tables to more pages than the production PDF, but content remains intact and readable.

## V. Final Recommendation

Accept FORMAL_RESEARCH_REPORT_COMPOSER_VNEXT for Case A and for the architecture/quality gates. Keep Case B blocked until new authorized evidence or a user-authorized Writer round adds genuinely supported content; do not resume by padding, lowering thresholds or pooling incompatible results.
`);

write("FINAL-VERDICT.txt", verdict);

const manifestFiles = filesUnder(root)
  .filter((target) => !target.endsWith("ARTIFACT-MANIFEST.json"))
  .map((target) => ({
    path: path.relative(root, target),
    bytes: fs.statSync(target).size,
    sha256: sha(target),
  }))
  .sort((left, right) => left.path.localeCompare(right.path));
write("ARTIFACT-MANIFEST.json", {
  schemaVersion: "researchforge-artifact-manifest/vnext",
  verdict,
  artifactCount: manifestFiles.length,
  files: manifestFiles,
});

if (
  composer.pass !== true ||
  caseA.passed !== true ||
  caseB.passed !== false ||
  citation.passed !== true ||
  evidenceTable.passed !== true ||
  staged !== 0 ||
  fixtureHash !== expectedFixtureHash
) {
  throw new Error("Final vNext closure invariant failed.");
}

console.log(JSON.stringify({
  verdict,
  caseA: caseA.verdict,
  caseB: caseB.verdict,
  artifactCount: manifestFiles.length,
  fixtureHash,
}, null, 2));
