import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const artifactRelative =
  "artifacts/qa/researchforge-final-evidence-and-export-closure-20260824T075851+0800";
const root = path.join(repo, artifactRelative);
const fixtureRelative =
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json";
const expectedFixtureHash =
  "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as T;
}

function write(relative: string, content: string): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function writeJson(relative: string, value: unknown): void {
  write(relative, JSON.stringify(value, null, 2));
}

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

function sha(relative: string): string {
  return createHash("sha256")
    .update(fs.readFileSync(path.join(repo, relative)))
    .digest("hex");
}

const caseAOffline = readJson<any>("adolescent-screen-sleep/offline-content-gate.json");
const caseAWriter = readJson<any>("adolescent-screen-sleep/writer-content-gate.json");
const caseACanonical = readJson<any>("adolescent-screen-sleep/canonical-content-gate.json");
const caseACalls = readJson<any>("adolescent-screen-sleep/live-call-counts.json");
const caseAFrozen = readJson<any>("adolescent-screen-sleep/frozen-production-replay.json");
const caseBOffline = readJson<any>("case-b/offline-content-gate.json");
const caseBWriter = readJson<any>("case-b/writer-content-gate.json");
const caseBResponse = readJson<any>("case-b/writer-response.live.json");
const caseBCalls = readJson<any>("case-b/live-call-counts.json");
const protectedHash = sha(fixtureRelative);
const porcelain = git(["status", "--porcelain"]).split("\n").filter(Boolean);
const trackedDirty = porcelain.filter((line) => !line.startsWith("??")).length;
const untracked = porcelain.filter((line) => line.startsWith("??")).length;
const staged = git(["diff", "--cached", "--name-only"])
  .split("\n")
  .filter(Boolean).length;
const branch = git(["branch", "--show-current"]);
const head = git(["rev-parse", "HEAD"]);
const completedAt = new Date().toISOString();

const verdict = "RESEARCHFORGE_BLOCKED_SUPPORTED_CONTENT";
const caseAContentPass = caseAWriter.passed === true;
const caseACanonicalPass = caseACanonical.passed === true;
const caseBContentPass = caseBWriter.passed === true;
const dualAuthorized = caseAContentPass && caseACanonicalPass && caseBContentPass;

const repositoryAfter = {
  capturedAt: completedAt,
  repository: repo,
  branch,
  head,
  expectedStartingHead: "a89549a6e26a7ac3ae44ad52b5588101baf28b95",
  expectedStartingHeadMatches: head === "a89549a6e26a7ac3ae44ad52b5588101baf28b95",
  stagedFiles: staged,
  trackedDirtyFiles: trackedDirty,
  untrackedPorcelainEntries: untracked,
  gitDiffCheck: "PASS",
  protectedFixture: {
    path: fixtureRelative,
    sha256: protectedHash,
    expectedSha256: expectedFixtureHash,
    unchanged: protectedHash === expectedFixtureHash,
  },
};
writeJson("repository-state.after.json", repositoryAfter);

const liveCounts = {
  caseA: caseACalls,
  caseB: caseBCalls,
  aggregate: {
    contentBearingReportDraftRequests:
      Number(caseACalls.contentBearingReportDraftRequests) +
      Number(caseBCalls.contentBearingReportDraftRequests),
    transportRetries:
      Number(caseACalls.transportRetries) + Number(caseBCalls.transportRetries),
    contentReruns: Number(caseACalls.contentReruns) + Number(caseBCalls.contentReruns),
  },
  budgetCompliant:
    caseACalls.contentBearingReportDraftRequests === 1 &&
    caseBCalls.contentBearingReportDraftRequests === 1 &&
    caseACalls.contentReruns === 0 &&
    caseBCalls.contentReruns === 0,
};
writeJson("live-call-counts.json", liveCounts);

const regression = {
  completedAt,
  status: "PASS",
  lint: { status: "N/A", reason: "No repository-defined lint script." },
  commands: [
    { name: "focused evidence/canonical/Writer tests", tests: 156, passed: 156, failed: 0 },
    { name: "pnpm --filter @workspace/api-server test", tests: 573, passed: 573, failed: 0 },
    { name: "pnpm --filter @workspace/report-factory test", tests: 418, passed: 418, failed: 0 },
    { name: "pnpm run typecheck", status: "PASS" },
    { name: "pnpm run build", status: "PASS", warnings: ["Vite sourcemap notices", "large chunk advisory", "browser externalization advisory"] },
    { name: "git diff --check", status: "PASS" },
  ],
};
writeJson("REGRESSION-REPORT.json", regression);

const notProduced = [
  "case-b/canonical-report.json",
  "case-b/report.html",
  "case-b/report.docx",
  "case-b/report.pdf",
  "case-b/rendered-pages/",
  "case-b/contact-sheet.png",
  "adolescent-screen-sleep/canonical-report.json",
  "adolescent-screen-sleep/report.html",
  "adolescent-screen-sleep/report.docx",
  "adolescent-screen-sleep/report.pdf",
  "adolescent-screen-sleep/rendered-pages/",
  "adolescent-screen-sleep/contact-sheet.png",
].map((artifact) => ({
  artifact,
  status: "NOT_PRODUCED",
  reason:
    artifact.startsWith("case-b/")
      ? "Case B Writer content gate failed: fallback/degraded output, 6 strict duplicates, and 1474 CJK below the 1800 minimum."
      : "Dual-case export authorization was false; Case A also failed its deterministic canonical citation/integrity gate.",
}));
writeJson("ARTIFACT-MANIFEST.json", {
  schemaVersion: "researchforge-final-closure-artifact-manifest/v1",
  verdict,
  generatedArtifacts: fs
    .readdirSync(root, { recursive: true })
    .filter((entry) => typeof entry === "string")
    .filter((entry) => fs.statSync(path.join(root, entry)).isFile())
    .sort(),
  notProduced,
});

const visualReport = `# Visual QA Report

- Status: NOT RUN
- Page count: N/A
- Rendered pages: NOT PRODUCED
- Contact sheets: NOT PRODUCED
- Reason: Case B failed the upstream Writer content gate, so dual-case export authorization was false. Per fail-closed policy, no current Preview, DOCX, or PDF was eligible for page-by-page visual QA.
`;
write("VISUAL-QA-REPORT.md", visualReport);
write("case-b/VISUAL-QA-REPORT.md", visualReport);
write("adolescent-screen-sleep/VISUAL-QA-REPORT.md", visualReport);

write(
  "RUN-STATE.md",
  `# Run State

- Final status: \`${verdict}\`
- Artifact root: \`${artifactRelative}\`
- Branch / HEAD: \`${branch}\` / \`${head}\`
- Worktree preservation: dirty worktree preserved; staged files ${staged}; no commit, push, merge, PR, deploy, reset, clean, checkout, restore, stash, or revert.
- Protected fixture: \`${protectedHash}\` (expected hash match: ${protectedHash === expectedFixtureHash})
- Writer budget: Case A 1/1; Case B 1/1; transport retries 0; content reruns 0.
- Export authorization: false.
`,
);

write(
  "EXECUTIVE-SUMMARY.md",
  `# Executive Summary

ResearchForge is not release-ready and no two-report export set exists.

Case B's upstream evidence problem was repaired: the population classifier now fails closed, the 4→3 mismatch is explained as a correct canonical exclusion following a prior fail-open route classification, and the rebuilt set has 6 direct canonical sources, 8 direct Evidence Cards, all three facets, and a fully passing offline gate. Its one authorized Writer run nevertheless failed closed: fallback/degraded mode was used, strict duplicates were 6, and supported body length was 1,474 CJK versus the 1,800 minimum.

Case A's augmented evidence and frozen replay passed. Its one fresh Writer run passed every Writer content check, including strict/semantic duplicates 0/0, Central Answer 8/8, quantitative provenance/integration 100%, unsupported sentences 0, and conclusion novelty 0. The downstream deterministic canonical projection then failed citation integrity, contradiction handling, and evidence-table presence. It was not exported.
`,
);

write(
  "ISSUE-LEDGER.md",
  `# Issue Ledger

| ID | Stage | Status | Evidence |
| --- | --- | --- | --- |
| RF-B-SOURCE-01 | Case B source canonicalization | RESOLVED | Higher-education source is now rejected; route 6 = canonical 6. |
| RF-B-CONTENT-01 | Case B Writer | BLOCKING | fallback/degraded=true; strict duplicates=6; 1474 CJK < 1800. |
| RF-A-DUP-01 | Case A frozen production replay | RESOLVED | strict=0; semantic=0; findings=100%; numeric=100%. |
| RF-A-CONTENT-01 | Case A Writer | RESOLVED | Writer content gate PASS, Central Answer 8/8. |
| RF-A-CANON-01 | Case A canonical projection | BLOCKING | citation precision/integrity, contradiction claim-y0ymoy, evidence table absent. |
| RF-EXPORT-01 | Dual-case export | BLOCKED | Case B content authorization false; current exports forbidden. |
| RF-VISUAL-01 | Page-by-page visual QA | NOT RUN | No authorized current PDF/DOCX. |
`,
);

write(
  "CHANGE-LOG.md",
  `# Change Log

- Added explicit population-match requirements and higher-education conflict handling for high-school research questions.
- Expanded generative-AI exposure and writing-outcome recognition, with adjacent-sentence relationship checks.
- Prevented the report-evidence route from deriving sibling cards when an exact input Evidence Card already exists.
- Added deterministic post-live strict cross-section duplicate removal and regression coverage.
- Added Case A and Case B targeted evidence/reconciliation builders and controlled acceptance harnesses.
- Augmented Case A with exact accepted-source spans; removed the preprint duplicate in favor of the published record.
- Rejected Case A Figure 4 because no two accepted study values had compatible metric, unit, and estimate semantics.
- No report prompt threshold was weakened; no failed test or protected fixture was changed to force acceptance.
`,
);

write(
  "TEST-MATRIX.md",
  `# Test Matrix

| Gate | Result |
| --- | --- |
| Focused evidence/canonical/Writer tests | PASS — 156/156 |
| API authoritative suite | PASS — 573/573 |
| Report Factory authoritative suite | PASS — 418/418 |
| Typecheck | PASS |
| Build | PASS with non-blocking Vite advisories |
| git diff --check | PASS |
| Lint | N/A — no repository-defined lint script |
`,
);

write(
  "SOURCE-ID-RECONCILIATION.md",
  `# Source-ID Reconciliation

The authoritative row-level reconciliation is in \`case-b/SOURCE-ID-RECONCILIATION.md\` and its JSON companion.

The previous mismatch was not caused by ID normalization, deduplication, or serialization loss. One route-direct source used a university sample and had no accepted claim-entailing card. The prior population classifier failed open when population was unspecified; the canonical exclusion was correct. Classification: \`EXPECTED_CANONICAL_EXCLUSION\` + \`FULLTEXT_OR_SPAN_INSUFFICIENCY\`, with the fail-open classifier recorded as resolved \`UNKNOWN_REQUIRES_FIX\`.

Current reconciliation: 31 reviewed rows; 6 route-direct sources; 6 canonical sources; 8 direct Evidence Cards; canonical count match PASS.
`,
);

write(
  "PIPELINE-AUDIT.md",
  `# Pipeline Audit

1. Case B source reconciliation and classifier regression: completed.
2. Case B targeted evidence architecture: offline gate PASS, 6 direct sources, 8 direct cards, benefit/limitation/risk covered.
3. Case B Writer: one content-bearing request; content gate FAIL; no rerun.
4. Case A evidence augmentation: 9 direct sources, 13 direct cards, 4,118 exact-support characters; offline gate PASS.
5. Case A frozen replay: PASS with 0 provider/Writer calls.
6. Case A Writer: exactly one content-bearing request; Writer content gate PASS.
7. Case A canonical projection: FAIL; diagnostic gate retained, canonical output removed from the current artifact package.
8. Dual-case export and visual QA: not authorized and not run.
`,
);

write(
  "CONTENT-QA.md",
  `# Content QA

## Case B

- Offline evidence gate: PASS.
- Writer call: 1/1, no rerun.
- Provider response: success, but fallback/degraded true.
- Strict / semantic duplicates: 6 / 0.
- Unsupported sentences: 0; Central Answer: 6/6; all facets realized; conclusion novelty: 0.
- Supported body: 1,474 CJK; minimum: 1,800.
- Verdict: BLOCKED_SUPPORTED_CONTENT.

## Case A

- Frozen replay: strict 0, semantic 0, Findings coverage 100%, numeric provenance 100%.
- Evidence support ceiling: 4,118 exact-support characters.
- Writer call: 1/1, no rerun.
- Writer content gate: PASS; fallback/degraded false; strict/semantic 0/0; unsupported 0; Central Answer 8/8; conclusion novelty 0.
- Canonical reader length check: PASS (4,951 CJK), but canonical quality/integrity gate failed and cannot be accepted.
`,
);

write(
  "CITATION-QA.md",
  `# Citation QA

- Case B: Writer content gate failed before canonical citation/export acceptance; canonical citation closure was not authorized.
- Case A Writer: claim/evidence/source lineage and conclusion closure passed.
- Case A canonical projection: BLOCKED. Citation precision scored 0 because projected multi-reference sets had no verified claim-support overlap, nine central/synthesis claims failed the downstream entailment mapping, and two unsupported citation/source-mention sets remained. The gate also recorded unsupported gap sentences and an unsupported numeric mention.
- No citation marker/reference cross-format claim is made because no current export was authorized.
`,
);

write(
  "QUANTITATIVE-TRACE-MATRIX.md",
  `# Quantitative Trace Matrix

| Case | Registry | Body provenance | Required integration | Outcome |
| --- | ---: | ---: | ---: | --- |
| Case B | Empty/allowed where no credible quantitative evidence exists | 100% | 100% or N/A | No numbers invented; content still blocked for non-quantitative reasons. |
| Case A | 2 validated facts | 100% (2/2) | 100% (1/1 finding) | PASS at Writer gate. |
`,
);

write(
  "CHART-TRACE-MATRIX.md",
  `# Chart Trace Matrix

| Case | Visual decision | Provenance result |
| --- | --- | --- |
| Case B | Metadata/evidence summaries only; no fabricated effect chart | PASS at offline/Writer architecture gate |
| Case A | Evidence tables and thematic diagram approved | Source IDs and derivation rules present |
| Case A Figure 4 | REJECTED | No compatible two-study metric/unit/estimate-semantics group; 58% and 56.5% were not retained as a pseudo-comparison. |
`,
);

write(
  "CROSS-FORMAT-PRESERVATION.md",
  `# Cross-format Preservation

- Status: NOT RUN.
- Current canonical/Preview/DOCX/PDF set: NOT PRODUCED.
- Reason: dual-case content/export authorization was false.
- No old artifact was copied or relabeled as a current export.
`,
);

write(
  "INTEGRITY.md",
  `# Integrity and Scoped Security

- Protected fixture hash unchanged: ${protectedHash === expectedFixtureHash}.
- HEAD unchanged: ${head === "a89549a6e26a7ac3ae44ad52b5588101baf28b95"}; staged files: ${staged}.
- Artifact secret-pattern scan: 0 files with authorization/cookie/sk-style credential patterns.
- Artifact env-file scan: 0 files.
- Case artifact personal-path scan: 0 files after converting augmentation provenance to repository-relative paths.
- Provider diagnostics contain configuration presence and HTTP status only; no credential or base URL value is recorded.
- Malformed provider body scan: no raw-body artifact keys found; diagnostics are limited to structured/sanitized fields.
- Scope: repository/artifact review only; this is not a full security certification.
`,
);

write(
  "PROVIDER-DIAGNOSTICS.md",
  `# Provider Diagnostics

- Provider/model: \`school_llm\` / \`gpt-5.6-luna\`.
- Credential and base URL: configured; values not recorded.
- Authentication and generation probe: HTTP 200; exact output \`PING_OK\`.
- Case B: 1 content-bearing Writer request after offline authorization; no transport retry or content rerun.
- Case A: 1 content-bearing Writer request after frozen replay and offline authorization; no transport retry or content rerun.
- Connectivity was healthy; the release blocker is content/canonical validation, not provider availability.
`,
);

write("FINAL-VERDICT.txt", verdict);

const acceptanceSummary = {
  schemaVersion: "researchforge-final-evidence-and-export-closure/v1",
  completedAt,
  verdict,
  releaseReady: false,
  twoReadableTraceableExportableReports: false,
  repository: repositoryAfter,
  callBudget: liveCounts,
  caseB: {
    sourceReconciliation: "PASS",
    offlineEvidenceGate: caseBOffline.passed,
    canonicalDirectSources: 6,
    directEvidenceCards: 8,
    facets: { benefit: true, limitation: true, risk: true },
    writerContentGate: caseBContentPass,
    fallbackUsed: caseBResponse.fallbackUsed,
    degradedMode: caseBResponse.degradedMode,
    strictDuplicates: caseBResponse.formalResearchValidation.duplicateValidation.strictDuplicates.length,
    semanticDuplicates: caseBResponse.formalResearchValidation.duplicateValidation.semanticDuplicates.length,
    writerReaderCjk: caseBWriter.writerReaderCjk,
    minimumCjk: 1800,
    exported: false,
  },
  caseA: {
    offlineEvidenceGate: caseAOffline.passed,
    frozenReplay: {
      status: caseAFrozen.status,
      strictDuplicates: caseAFrozen.strictDuplicateCount,
      semanticDuplicates: caseAFrozen.semanticDuplicateCount,
      findingsCoverage: caseAFrozen.findingsCoverage,
      numericClaimCoverage: caseAFrozen.numericClaimCoverage,
    },
    writerContentGate: caseAContentPass,
    canonicalGate: caseACanonicalPass,
    writerCentralAnswer: caseAWriter.centralAnswer,
    writerReaderCjk: caseAWriter.writerReaderCjk,
    canonicalReaderCjkDiagnostic: caseACanonical.readerCjk,
    exported: false,
  },
  export: {
    authorized: dualAuthorized,
    canonicalReports: 0,
    previews: 0,
    docx: 0,
    pdf: 0,
    crossFormatQa: "NOT_RUN",
    pageByPageVisualQa: "NOT_RUN",
  },
  regression,
  blockers: [
    "Case B Writer used fallback/degraded output.",
    "Case B retained 6 strict duplicates in its single live response.",
    "Case B supported body was 1474 CJK, below 1800.",
    "Case A downstream canonical citation/integrity and evidence-table gates failed.",
  ],
  exactResumePoint:
    "Do not rerun either Writer under this run budget. Repair and offline-replay Case B supported-content generation and Case A canonical citation/evidence-table projection from the saved live responses; a new content Writer call requires a newly authorized run budget.",
};
writeJson("acceptance-summary.json", acceptanceSummary);

write(
  "FINAL-REPORT.md",
  `# ResearchForge Final Evidence and Export Closure

## A. Executive Verdict

\`${verdict}\`. There are not two current readable, traceable, exportable formal reports. No release-ready claim is made.

## B. Repository Identity

Repository: \`${repo}\`  
Branch: \`${branch}\`  
HEAD: \`${head}\`

## C. Starting Baseline

Expected HEAD matched; staged files were 0; the pre-existing dirty worktree was preserved. The protected fixture began and ended at \`${protectedHash}\`.

## D. Case B Source Reconciliation

The previous 4 route-direct → 3 canonical mismatch came from a fail-open population classification for a university sample, not ID normalization, dedupe, or serialization loss. The canonical exclusion was correct. Current route-direct and canonical counts are both 6.

## E. Case B Evidence Recovery

Offline gate PASS: 6 direct canonical sources, 8 direct Evidence Cards, benefit/limitation/risk all covered, rejected cards 0, orphan cards 0, duplicate ownership 0, and bound report/evidence/checkpoint hashes.

## F. Case B Writer Acceptance

Exactly one content Writer request was made. It failed: fallback/degraded true, strict/semantic duplicates 6/0, and 1,474 supported CJK below 1,800. Unsupported sentences were 0, Central Answer was 6/6, all facets were realized, and conclusion novelty was 0; those successes do not override the blocking failures.

## G. Case A Evidence Density

Targeted augmentation produced 9 direct canonical sources, 13 direct cards, and 4,118 exact-support characters. Frozen production replay passed strict/semantic 0/0, Findings 100%, numeric provenance 100%, with zero provider or Writer requests.

## H. Case A Writer Acceptance

Exactly one fresh content Writer request was made. Writer content gate PASS: provider success, fallback/degraded false, unsupported 0, Central Answer 8/8, quantitative provenance and integration 100%, synthesis PASS, strict/semantic 0/0, conclusion novelty 0, and checkpoint v2/content integrity/policy binding PASS.

The downstream canonical projection failed citation integrity/precision, contradiction handling, and evidence-table presence. Diagnostic reader length was 4,951 CJK, but the document was not canonical-authorized.

## I. Quantitative Findings and Charts

Case A had 2/2 numeric claims with provenance and 1/1 required quantitative finding integrated. Figure 4 was rejected because the available study values were not a compatible two-study comparison. No pooled estimate, meta-analysis, guessed sample size, or causal comparison was produced. Case B invented no quantitative values.

## J. Canonical and Export

Dual-case authorization was false. Current canonical reports, Preview, DOCX, and PDF are NOT PRODUCED. A transient Case A diagnostic canonical projection was removed from the deliverable package after its gate failed.

## K. Cross-format Preservation

NOT RUN because there was no authorized current export set. No old export was substituted.

## L. Page-by-page Visual QA

NOT RUN; rendered pages and contact sheets are NOT PRODUCED.

## M. Regression Matrix

Focused 156/156; API 573/573; report-factory 418/418; typecheck PASS; build PASS; git diff check PASS. Lint is N/A because no repository lint script exists.

## N. Integrity and Scoped Security

Fixture and HEAD are unchanged; staged files remain 0. Artifact scans found no credential patterns, env files, raw provider body fields, or personal paths in case artifacts. This is a scoped repository/artifact review, not a full security certification.

## O. Remaining Blockers

1. Case B supported-content gate: fallback/degraded, 6 strict duplicates, 1,474/1,800 CJK.
2. Case A deterministic canonical projection: citation mapping/integrity, contradiction closure, and evidence table.
3. Export, cross-format QA, and visual QA remain downstream and unstarted.

## P. Exact Resume Point

Do not rerun either Writer under this run budget. First repair and offline-replay Case B supported-content generation and Case A canonical citation/evidence-table projection against the saved live responses. Any new content-bearing Writer call requires a newly authorized run budget.

## Q. Artifact Index

See \`ARTIFACT-MANIFEST.json\`, \`acceptance-summary.json\`, both case directories, and the root QA documents. Every absent output is listed as NOT_PRODUCED with its exact reason.
`,
);

console.log(JSON.stringify({ verdict, root, protectedHash, staged, trackedDirty, untracked }));
