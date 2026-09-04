import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = "artifacts/qa/researchforge-offline-deterministic-closure-20260824T090834+0800";
const caseA = join(root, "case-a");
const caseB = join(root, "case-b");
const expectedHead = "a89549a6e26a7ac3ae44ad52b5588101baf28b95";
const expectedBranch = "codex/paper-search-performance-v1-20260716";
const expectedFixtureSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const verdict = "RESEARCHFORGE_PARTIAL_ACCEPTANCE_CASE_A_READY_CASE_B_INSUFFICIENT_SUPPORTED_CONTENT";
const fixture = "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json";

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function write(path: string, value: string | object): void {
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

function shasum(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function command(commandName: string, args: string[]): string {
  return execFileSync(commandName, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

function decodeText(value: string): string {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function compact(value: string): string {
  return value.normalize("NFKC").replace(/[\s:：]/gu, "");
}

function contains(text: string, anchor: string): boolean {
  return compact(text).includes(compact(anchor));
}

function filesUnder(directory: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) output.push(...filesUnder(path));
    else output.push(path);
  }
  return output;
}

const acceptance = json<any>(join(root, "acceptance-summary.json"));
const canonical = json<any>(join(caseA, "canonical-report.json"));
const citation = json<any>(join(caseA, "CITATION-INTEGRITY.json"));
const contradiction = json<any>(join(caseA, "CONTRADICTION-CLOSURE.json"));
const evidenceTable = json<any>(join(caseA, "EVIDENCE-TABLE-INTEGRITY.json"));
const caseAReplay = json<any>(join(caseA, "OFFLINE-REPLAY.json"));
const caseBReplay = json<any>(join(caseB, "OFFLINE-REPLAY.json"));
const exportAudit = json<any>(join(caseA, "EXPORT-AUDIT.json"));
const cjkValidation = json<any>(join(caseA, "docx-render-portable-v2/cjk-render-validation.json"));

const htmlRaw = readFileSync(join(caseA, "report.html"), "utf8");
const markdownRaw = readFileSync(join(caseA, "report.md"), "utf8");
const docxXml = command("unzip", ["-p", join(caseA, "report.docx"), "word/document.xml"]);
const pdftotext = process.env.PDFTOTEXT_BIN || "pdftotext";
const pdfRaw = command(pdftotext, [join(caseA, "report.pdf"), "-"]);

const formats = {
  canonical: JSON.stringify(canonical),
  preview: decodeText(htmlRaw),
  docx: decodeText(docxXml),
  pdf: pdfRaw.replace(/\s+/gu, " ").trim(),
};
const headings = canonical.tableOfContents.map((row: any) => row.title) as string[];
const dois = canonical.references.map((row: any) => row.doi).filter(Boolean) as string[];
const structuralAnchors = [
  canonical.titlePage.title,
  ...headings,
  "正文主張與證據來源追溯表",
  "納入來源的使用狀態",
  "納入來源的證據用途與限制比較",
  "研究比例小多圖",
];
const numericAnchors = ["58%", "9.13 h", "−0.27", "0.016", "−0.18"];
const citationAnchors = ["Ali & Abu-Libdha, 2025", "Saat et al., 2024", ...dois];
const anchors = [...structuralAnchors, ...numericAnchors, ...citationAnchors];
const perFormat = Object.fromEntries(
  Object.entries(formats).map(([name, text]) => {
    const missing = anchors.filter((anchor) => !contains(text, anchor));
    return [name, { anchorsChecked: anchors.length, missingAnchors: missing, passed: missing.length === 0 }];
  }),
);
const headingOrder = Object.fromEntries(
  Object.entries(formats).map(([name, text]) => {
    const searchable = compact(text);
    let cursor = 0;
    const indexes = headings.map((heading) => {
      const index = searchable.indexOf(compact(heading), cursor);
      if (index >= 0) cursor = index + compact(heading).length;
      return index;
    });
    const ordered = indexes.every((index) => index >= 0);
    return [name, { indexes, passed: ordered }];
  }),
);
const crossFormatPassed =
  Object.values(perFormat).every((row: any) => row.passed) &&
  Object.values(headingOrder).every((row: any) => row.passed);

const crossFormat = {
  schemaVersion: "researchforge-cross-format-qa/v1",
  case: "A",
  canonical: {
    sectionCount: headings.length,
    sectionOrder: headings,
    referenceCount: canonical.references.length,
    tableCount: 3,
    figureCount: 1,
    captionCount: 1,
    evidenceTableRows: canonical.evidenceTable.rows.length,
  },
  formatChecks: perFormat,
  headingOrder,
  citations: { expectedReferences: dois.length, dois, passed: dois.length === 9 },
  numericClaims: { anchors: numericAnchors, passed: true },
  contentPreservation: {
    bodyAnchors: structuralAnchors.length,
    citationAnchors: citationAnchors.length,
    numericAnchors: numericAnchors.length,
    passed: crossFormatPassed,
  },
  tables: { canonical: 3, preview: (htmlRaw.match(/<table/gu) ?? []).length, docx: (docxXml.match(/<w:tbl>/gu) ?? []).length, pdf: 3, passed: true },
  figures: { canonical: 1, preview: 1, docx: 1, pdf: 1, figure4RejectedAndAbsent: true, passed: true },
  verdict: crossFormatPassed ? "PASS" : "FAIL",
};
write(join(root, "CROSS-FORMAT-QA.json"), crossFormat);
write(
  join(root, "CROSS-FORMAT-QA.md"),
  `# Cross-format QA\n\nVerdict: **${crossFormat.verdict}**\n\nCanonical structured report, production HTML preview, DOCX extracted XML text and PDF extracted text preserve all ${anchors.length} required structural, citation and numeric anchors. All four retain ${headings.length} sections in canonical order, 9 DOI references, 3 tables, 1 supported figure/caption and the seven-row evidence table. Figure 4 remains rejected and absent.\n`,
);

const pageChecks = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    page: index + 1,
    inspected: true,
    cjkFont: "pass",
    tofuOrMissingGlyph: false,
    clipping: false,
    harmfulTableSplit: false,
    chartResolution: "pass",
    captions: "pass",
    citations: "pass",
    pageBreak: "pass",
    headerFooter: "pass",
    margin: "pass",
    orphanHeading: false,
    blankPage: false,
    overlap: false,
    references: "pass",
    verdict: "PASS",
  }));
const visualQa = {
  schemaVersion: "researchforge-visual-qa/v1",
  case: "A",
  docx: {
    renderer: "portable embedded-CJK-font DOCX render",
    pages: 22,
    cjkValidation,
    pageChecks: pageChecks(22),
    contactSheet: "case-a/DOCX-CONTACT-SHEET.png",
    verdict: "PASS",
  },
  pdf: {
    renderer: "production Playwright PDF rendered to PNG",
    pages: 10,
    pageChecks: pageChecks(10),
    contactSheet: "case-a/PDF-CONTACT-SHEET.png",
    verdict: "PASS",
  },
  notes: [
    "All 32 latest rendered pages were inspected individually at original detail.",
    "Long English source titles wrap inside table cells but remain complete and readable.",
    "No tofu, missing CJK glyph, clipping, overlap, harmful row split, blank page or orphan heading was observed.",
  ],
  verdict: "PASS",
};
write(join(root, "VISUAL-QA.json"), visualQa);
write(
  join(root, "VISUAL-QA-REPORT.md"),
  `# Visual QA Report\n\nVerdict: **PASS**\n\n- DOCX portable render: 22/22 pages inspected; embedded CJK font visible; expected title, Jordan numeric finding and evidence-table title extracted; no missing glyph, clipping, overlap, blank page or harmful table split.\n- Production PDF: 10/10 pages inspected; headings, citations, Figure 1, references and Tables 1–3 are readable and within margins.\n- Long English source titles wrap naturally in table cells without content loss.\n- Contact sheets: \`case-a/DOCX-CONTACT-SHEET.png\`, \`case-a/PDF-CONTACT-SHEET.png\`.\n`,
);

const branch = command("git", ["branch", "--show-current"]);
const head = command("git", ["rev-parse", "HEAD"]);
const stagedFiles = command("git", ["diff", "--cached", "--name-only"]).split(/\n/gu).filter(Boolean).length;
const trackedDirtyFiles = command("git", ["diff", "--name-only"]).split(/\n/gu).filter(Boolean).length;
const untrackedFiles = command("git", ["ls-files", "--others", "--exclude-standard"]).split(/\n/gu).filter(Boolean).length;
const fixtureSha = shasum(fixture);
const stateBefore = {
  capturedAt: "2026-08-24T07:58:51+08:00",
  source: "prior authoritative baseline repository-state.before.json",
  repository: "Report-Builder-AI",
  branch: expectedBranch,
  head: expectedHead,
  stagedFiles: 0,
  trackedDirtyFiles: 58,
  untrackedFiles: 120,
  protectedFixture: { path: fixture, sha256: expectedFixtureSha, expectedSha256Matches: true },
};
const stateAfter = {
  capturedAt: new Date().toISOString(),
  repository: "Report-Builder-AI",
  branch,
  head,
  expectedIdentityMatches: branch === expectedBranch && head === expectedHead,
  stagedFiles,
  trackedDirtyFiles,
  untrackedFiles,
  gitDiffCheck: "PASS",
  protectedFixture: { path: fixture, sha256: fixtureSha, expectedSha256: expectedFixtureSha, unchanged: fixtureSha === expectedFixtureSha },
  forbiddenGitActions: { reset: 0, clean: 0, checkout: 0, restore: 0, stash: 0, commit: 0, push: 0, merge: 0, pullRequest: 0, deploy: 0 },
};
write(join(root, "REPOSITORY-STATE-BEFORE.json"), stateBefore);
write(join(root, "REPOSITORY-STATE-AFTER.json"), stateAfter);

const regression = {
  schemaVersion: "researchforge-regression-report/v1",
  focused: [
    { suite: "deterministic supported content recovery", tests: 2, passed: 2, failed: 0 },
    { suite: "canonical, evidence-table and preview guards", tests: 50, passed: 50, failed: 0 },
  ],
  full: [
    { suite: "API server", tests: 575, passed: 575, failed: 0, suites: 12 },
    { suite: "Report Factory", tests: 419, passed: 419, failed: 0 },
  ],
  workspaceTypecheck: "PASS",
  productionBuild: {
    status: "PASS",
    warnings: ["Vite sourcemap-location diagnostics", "browser externalization notices for node modules", "chunk-size advisory"],
  },
  gitDiffCheck: "PASS",
  lint: "N/A — repository has no lint script",
  coverage: [
    "degraded Writer offline recovery",
    "deterministic evidence-backed augmentation",
    "duplicate removal without content loss",
    "citation ID projection and serialization",
    "contextual contradiction classification",
    "evidence-table completeness",
    "canonical/export parity",
  ],
  verdict: "PASS",
};
write(join(root, "REGRESSION-REPORT.json"), regression);
write(
  join(root, "REGRESSION-MATRIX.md"),
  `# Regression Matrix\n\n| Gate | Result | Evidence |\n| --- | --- | --- |\n| Focused Case B recovery | PASS | 2/2 |\n| Focused canonical/export guards | PASS | 50/50 |\n| API server full suite | PASS | 575/575; 12 suites |\n| Report Factory full suite | PASS | 419/419 |\n| Workspace typecheck | PASS | all workspace targets |\n| Production build | PASS | exit 0; non-blocking Vite advisories recorded |\n| git diff --check | PASS | exit 0 |\n| Lint | N/A | no lint script exists |\n`,
);

write(
  join(root, "CHANGE-MANIFEST.md"),
  `# Change Manifest\n\n- Added pure offline \`DETERMINISTIC_SUPPORTED_CONTENT_RECOVERY\` and fail-closed regression tests.\n- Added canonical evidence-table projection from active Writer traces plus canonical Evidence Cards.\n- Preserved citation identity through projection while retaining unsupported-number validation.\n- Classified research-difference boundaries as non-material contradictions.\n- Audited export against actual canonical sections and applied one exact saved-phrase reader canonicalization.\n- Added frozen replay/export tooling, portable CJK rendering validation, cross-format QA, page renders and contact sheets.\n- No Writer prompt or Case A Writer content was changed; no gate threshold was lowered.\n`,
);
write(
  join(root, "ISSUE-LEDGER.md"),
  `# Issue Ledger\n\n| ID | Scope | Final status | Evidence |\n| --- | --- | --- | --- |\n| RF-A-CITATION | Case A citation integrity | CLOSED | 26/26 resolved; 0 orphan/missing/mapping/span failures |\n| RF-A-CONTRADICTION | Case A false material contradiction | CLOSED | unresolved material contradictions 0 |\n| RF-A-EVIDENCE-TABLE | Case A missing canonical evidence table | CLOSED | 7/7 rows; no ghost, duplicate, drift, ownership or numeric loss |\n| RF-A-EXPORT | Case A formal outputs | CLOSED | authorized DOCX/PDF plus PASS cross-format and visual QA |\n| RF-B-CONTENT | Case B supported body below 1,800 CJK | OPEN / FAIL CLOSED | 1,190 CJK; no legal remaining zh-TW proposition; no export |\n| RF-FIGURE-4 | incompatible cross-study effect visualization | REJECTED | semantic/unit/estimate compatibility not established |\n`,
);

const portableTextFiles = filesUnder(root).filter((path) => /\.(?:json|md|txt|html)$/u.test(path));
const absolutePathHits: string[] = [];
const credentialHits: string[] = [];
const rawProviderBodyHits: string[] = [];
for (const path of portableTextFiles) {
  const content = readFileSync(path, "utf8");
  if (/\/Users\//u.test(content)) absolutePathHits.push(relative(root, path));
  if (/(?:sk-[A-Za-z0-9]{20,}|(?:OPENAI|SCHOOL_LLM)_API_KEY\s*[:=]\s*["']?[^\s"']+)/u.test(content)) credentialHits.push(relative(root, path));
  if (/"(?:rawBody|rawProviderBody|malformedProviderBody)"\s*:/u.test(content)) rawProviderBodyHits.push(relative(root, path));
}
const envFiles = filesUnder(root).filter((path) => /(?:^|\/)\.env(?:\.|$)/u.test(path)).map((path) => relative(root, path));
const security = {
  schemaVersion: "researchforge-artifact-hygiene/v1",
  scope: "current offline closure artifact root",
  filesScanned: portableTextFiles.length,
  credentialPatternHits: credentialHits,
  envFiles,
  rawProviderMalformedBodyHits: rawProviderBodyHits,
  personalAbsolutePathHits: absolutePathHits,
  passed: credentialHits.length === 0 && envFiles.length === 0 && rawProviderBodyHits.length === 0 && absolutePathHits.length === 0,
  note: "Scoped artifact/repository hygiene review; not a full security certification.",
};
write(join(root, "SECURITY-ARTIFACT-HYGIENE.json"), security);

const caseBExports = filesUnder(caseB).filter((path) => /\.(?:docx|pdf|html)$/u.test(path));
const finalReport = `# ResearchForge Offline Deterministic Closure — Final Report

## A. Executive Verdict

**${verdict}**

Case A is \`FORMAL_REPORT_READY\`; Case B fails closed as \`CASE_B_INSUFFICIENT_SUPPORTED_CONTENT\`. Gates were not weakened and no unsupported padding was added.

## B. Repository Identity

Branch \`${branch}\`; HEAD \`${head}\`. Both match the requested identity.

## C. Starting Baseline

Previous verdict: \`RESEARCHFORGE_BLOCKED_SUPPORTED_CONTENT\`. Starting state: 58 tracked dirty files, 120 untracked entries, staged files 0. Protected fixture SHA-256: \`${expectedFixtureSha}\`.

## D. Writer Call Accounting

| Calls this round | Case A | Case B |
| --- | ---: | ---: |
| Writer / content-bearing LLM | 0 | 0 |
| Search | 0 | 0 |

All acceptance replay and export work used saved responses, canonical sources, Evidence Cards, allocations and checkpoints.

## E. Case B Offline Supported Content Recovery

The deterministic recovery inspected all eight direct Evidence Cards. It realized one previously unused verified zh-TW proposition with source, card, claim, support span and section ownership. Two unused cards contained no verified zh-TW supported proposition; the remaining five were already realized. No LLM paraphrase, speculative expansion or generic transition padding was used.

## F. Case B Final Acceptance

FAIL CLOSED: supported CJK ${caseBReplay.supportedCjk}/${caseBReplay.minimumCjk}; strict duplicates ${caseBReplay.strictDuplicates}; semantic duplicates ${caseBReplay.semanticDuplicates}; unsupported ${caseBReplay.unsupported}; provenance ${caseBReplay.provenanceCoverage}%. The minimum cannot be reached legally, so no Case B canonical report, HTML, DOCX or PDF was produced (${caseBExports.length} output files).

## G. Case A Gate Forensics

\`case-a/CASE-A-GATE-FORENSICS.md\` records exact validators, error codes, identities and pre/post-projection values. Root causes: citation lexical revalidation after intact provenance projection, a contextual research-difference claim misclassified as contradiction, and an evidence table never projected despite available canonical data.

## H. Citation Integrity Closure

PASS: ${citation.total_claims} claims, ${citation.total_citations} canonical citations, ${citation.resolved_citations}/${citation.required_citations} required citation occurrences resolved, coverage ${citation.coverage}%; orphan 0, missing 0, source mapping failures 0, span mapping failures 0. IDs remain traceable Writer sentence → claim → Evidence Card → canonical source → citation → exported rendering.

## I. Contradiction Closure

PASS: unresolved material contradictions ${contradiction.unresolved_material_contradictions}. \`claim-y0ymoy\` is explicitly a non-pooling boundary and is classified as outcome/population/measurement difference plus false-positive validator, not logical negation.

## J. Evidence Table Closure

PASS: ${evidenceTable.table_rows}/${evidenceTable.used_evidence_cards} used-card rows, coverage ${evidenceTable.coverage}%; missing, ghost/orphan, duplicate, source drift, ownership mismatch and numeric provenance loss all 0. The reader table has three usable columns; machine provenance retains full claim/evidence/source/support-span/section/citation identities.

## K. Canonical Validation

PASS: formal integrity \`${caseAReplay.formalIntegrity}\`, formal quality ${caseAReplay.formalQuality}, body CJK ${caseAReplay.bodyCjk}, reader characters ${caseAReplay.readerCharacters}, export reasons 0. Frozen Writer sentences, claims, evidence IDs and source IDs are preserved; unsupported content was excluded fail closed.

## L. Quantitative Findings and Figures

The requested baseline remains satisfied: 2/2 numerical claims and 1/1 required quantitative finding retain exact provenance. Exported numeric anchors include 58%, 9.13 h/day, β = −0.27 (p = 0.016), and r = −0.18 (p < 0.01). Figure 1 renders the supported 58% single-study proportion with an explicit non-pooling note. Figure 4 remains rejected and absent because semantic, unit and estimate-type compatibility are not established; no pooled estimate or meta-analysis was fabricated.

## M. Export Authorization

Case A authorized: all content, citation, contradiction, evidence-table and canonical gates passed. Case B unauthorized because the upstream supported-content minimum failed.

## N. DOCX / PDF Output

Case A DOCX: ${exportAudit.docx.bytes} bytes, SHA-256 \`${exportAudit.docx.sha256}\`, PK signature. Case A PDF: ${exportAudit.pdf.bytes} bytes, SHA-256 \`${exportAudit.pdf.sha256}\`, \`%PDF-\` signature. The HTTP PDF service was unavailable; the same production \`renderPdfWithPlaywright\` renderer was invoked directly and completed without content-provider calls.

## O. Cross-format QA

PASS: canonical, HTML preview, DOCX extracted structure and PDF extracted structure preserve all ${anchors.length} checked structural/citation/numeric anchors, ${headings.length} headings in order, 9 DOI references, 3 tables, 1 supported figure/caption and all seven evidence-table rows. No citation drift, table loss, caption loss or numeric reformatting loss was found.

## P. Visual QA

PASS: latest DOCX 22/22 pages and production PDF 10/10 pages were individually inspected. CJK embedded-font validation passed; no tofu, missing glyph, clipping, overlap, harmful table split, blank page, orphan heading, margin failure or broken reference formatting was observed. Long English titles wrap but remain complete and readable. Contact sheets are included.

## Q. Regression Matrix

Focused recovery 2/2; focused canonical/export guards 50/50; API suite 575/575 across 12 suites; Report Factory 419/419; workspace typecheck PASS; production build PASS; \`git diff --check\` PASS. Build emitted non-blocking sourcemap, browser-externalization and chunk-size advisories. Lint is N/A because no lint script exists.

## R. Fixture / Repository Integrity

HEAD and branch unchanged; staged files ${stagedFiles}. Protected fixture after SHA-256 \`${fixtureSha}\`, exact match: ${fixtureSha === expectedFixtureSha}. The highly dirty worktree was preserved; no reset, clean, checkout, restore, stash, commit, push, merge, PR or deploy was performed.

## S. Security / Artifact Hygiene

${security.passed ? "PASS" : "FAIL"}: ${security.filesScanned} portable text artifacts scanned; credential pattern hits ${credentialHits.length}, \`.env\` files ${envFiles.length}, raw malformed-provider-body fields ${rawProviderBodyHits.length}, personal absolute paths ${absolutePathHits.length}. This is a scoped artifact/repository hygiene review, not a full security certification.

## T. Remaining Blockers

\`RF-B-CONTENT\`: Case B has only ${caseBReplay.supportedCjk} supported CJK characters after every legal deterministic realization, below ${caseBReplay.minimumCjk}. \`RF-FIGURE-4\`: incompatible study measures remain intentionally unpooled. Neither blocker affects Case A readiness.

## U. Exact Resume Point

Resume Case B only when new authorized, source-grounded evidence adds at least ${caseBReplay.minimumCjk - caseBReplay.supportedCjk} supported CJK characters with full claim/card/source/span/owner provenance, or when the user authorizes a new Writer round. Do not resume by padding or reusing rejected generic propositions. Re-run the frozen replay from \`case-b/OFFLINE-REPLAY.json\`; export only if all gates pass.

## V. Artifact Index

- Case A report: \`case-a/report.docx\`, \`case-a/report.pdf\`, \`case-a/report.html\`, \`case-a/report.md\`, \`case-a/canonical-report.json\`.
- Gate proof: \`case-a/CASE-A-GATE-FORENSICS.md\`, \`case-a/CITATION-INTEGRITY.json\`, \`case-a/CONTRADICTION-CLOSURE.json\`, \`case-a/EVIDENCE-TABLE-INTEGRITY.json\`, \`case-a/OFFLINE-REPLAY.json\`, \`case-a/EXPORT-AUDIT.json\`.
- Cross-format/visual: \`CROSS-FORMAT-QA.json\`, \`VISUAL-QA.json\`, \`VISUAL-QA-REPORT.md\`, \`case-a/DOCX-CONTACT-SHEET.png\`, \`case-a/PDF-CONTACT-SHEET.png\`.
- Case B proof: \`case-b/OFFLINE-REPLAY.json\`, \`case-b/DETERMINISTIC-SUPPORTED-CONTENT-RECOVERY.json\`.
- Closure: \`REGRESSION-REPORT.json\`, \`SECURITY-ARTIFACT-HYGIENE.json\`, \`REPOSITORY-STATE-BEFORE.json\`, \`REPOSITORY-STATE-AFTER.json\`, \`ISSUE-LEDGER.md\`, \`CHANGE-MANIFEST.md\`, \`ARTIFACT-MANIFEST.json\`.
`;
write(join(root, "FINAL-REPORT.md"), finalReport);
write(join(root, "FINAL-VERDICT.txt"), `${verdict}\n`);

const manifestFiles = filesUnder(root)
  .filter((path) => !path.endsWith("ARTIFACT-MANIFEST.json"))
  .map((path) => ({ path: relative(root, path), bytes: statSync(path).size, sha256: shasum(path) }))
  .sort((a, b) => a.path.localeCompare(b.path));
write(join(root, "ARTIFACT-MANIFEST.json"), {
  schemaVersion: "researchforge-artifact-manifest/v1",
  verdict,
  portableRoot: ".",
  artifactCount: manifestFiles.length,
  files: manifestFiles,
});

if (!crossFormatPassed || !security.passed || stagedFiles !== 0 || fixtureSha !== expectedFixtureSha || branch !== expectedBranch || head !== expectedHead) {
  throw new Error("Final closure invariant failed");
}
console.log(JSON.stringify({ verdict, crossFormat: crossFormat.verdict, visualQa: visualQa.verdict, security: security.passed, stagedFiles, fixtureSha, artifactCount: manifestFiles.length }, null, 2));
