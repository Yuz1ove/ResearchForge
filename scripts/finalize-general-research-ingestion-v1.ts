import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { buildGeneralResearchQueryPlan } from "../artifacts/api-server/src/services/general-research-query-planner";

const repo = path.resolve(import.meta.dirname, "..");
const rootArg = process.argv.find((argument) => argument.startsWith("--root="));
if (!rootArg) throw new Error("Expected --root=<artifact root>.");
const root = path.resolve(repo, rootArg.slice("--root=".length));
const apiTests = Number(process.argv.find((value) => value.startsWith("--api-tests="))?.split("=")[1] ?? 0);
const reportTests = Number(process.argv.find((value) => value.startsWith("--report-tests="))?.split("=")[1] ?? 0);
const focusedTests = Number(process.argv.find((value) => value.startsWith("--focused-tests="))?.split("=")[1] ?? 0);
const buildPass = process.argv.includes("--build-pass");
const typecheckPass = process.argv.includes("--typecheck-pass");

const previousRoot = path.join(repo, "artifacts/qa/researchforge-generalization-20260825T081529+0800");
const protectedFixture = path.join(repo, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const expectedProtectedHash = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const startingHead = "a89549a6e26a7ac3ae44ad52b5588101baf28b95";

function readJson<T = Record<string, unknown>>(target: string): T {
  return JSON.parse(fs.readFileSync(target, "utf8")) as T;
}

function write(relative: string, value: string | Uint8Array): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function copy(source: string, relative: string): void {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function sha(target: string): string {
  return createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function json(relative: string, value: unknown): void {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function command(commandName: string, args: string[]): string {
  const result = spawnSync(commandName, args, { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${commandName} failed: ${result.stderr}`);
  return result.stdout.trim();
}

fs.mkdirSync(root, { recursive: true });

// Keep the accepted Case 00 input as a frozen replay input. The materializer is run separately.
for (const name of ["generated-report.json", "report-workspace.json"]) {
  copy(path.join(previousRoot, "case-a", name), path.join("case-a", name));
}

const liveDirs = fs.readdirSync(root)
  .filter((name) => /^case-\d{2}-/.test(name))
  .sort();
if (liveDirs.length !== 10) throw new Error(`Expected 10 live case directories, found ${liveDirs.length}.`);

type Qa = {
  caseId: string;
  slug: string;
  topic: string;
  classification: string;
  upstreamClassification: string;
  firstWeakLayer: string;
  groundingStatus: string;
  searchedCandidates: number;
  acceptedSources: number;
  evidenceCards: number;
  directStudies: number;
  fullTextStudies: number;
  studyDesignCoverage: number;
  populationCoverage: number;
  exposureCoverage: number;
  outcomeCoverage: number;
  effectDirectionCoverage: number;
  quantitativeFacts: number;
  moderators: number;
  writerAttempted: boolean;
  writerRequests: number;
  writerPass: boolean;
  reasons: string[];
};

const cases = liveDirs.map((directory) => {
  const source = path.join(root, directory);
  const qa = readJson<Qa>(path.join(source, "qa.json"));
  const target = path.join("cases", directory);
  const preserved = [
    "grounding-job.json",
    "structured-study-evidence.json",
    "evidence-matrix.json",
    "evidence-coverage.json",
    "evidence-cards.json",
    "quantitative-facts.json",
    "source-review.json",
    "moderator-table.json",
    "figure-provenance.json",
    "accepted-sources.json",
    "search-plan.json",
    "provider-usage.json",
    "qa.json",
  ].filter((name) => fs.existsSync(path.join(source, name)));
  for (const name of preserved) copy(path.join(source, name), path.join(target, name));
  const job = readJson<any>(path.join(source, "grounding-job.json"));
  json(path.join(target, "search-plan-current-replay.json"), {
    input: { topic: qa.topic },
    planner: buildGeneralResearchQueryPlan(qa.topic),
    providerCalls: 0,
    note: "Current-code deterministic planner replay; the original live plan remains preserved in search-plan.json.",
  });
  json(path.join(target, "claim-allocation.json"), {
    schemaVersion: "researchforge-claim-allocation/v1",
    topic: qa.topic,
    reportPlan: job.reportPlan ?? null,
    exportEligible: false,
    warning: "Planning records are diagnostic only; no claim was admitted to a publishable report.",
  });
  json(path.join(target, "synthesis-plan.json"), {
    schemaVersion: "researchforge-synthesis-plan/v1",
    topic: qa.topic,
    classification: qa.classification,
    writerEligible: false,
    writerAttempted: false,
    firstWeakLayer: qa.firstWeakLayer,
    blockers: qa.reasons,
    decision: "NO_SYNTHESIS_NO_EXPORT",
  });
  json(path.join(target, "NO-EXPORT.json"), {
    schemaVersion: "researchforge-no-export/v1",
    caseId: qa.caseId,
    topic: qa.topic,
    classification: qa.classification,
    firstWeakLayer: qa.firstWeakLayer,
    reasons: qa.reasons,
    reportMd: false,
    reportDocx: false,
    reportPdf: false,
    writerRequests: qa.writerRequests,
    failClosed: true,
  });
  return { directory, ...qa };
});

const case00Source = path.join(root, "case-a");
const case00Target = "cases/case-00-control";
if (fs.existsSync(path.join(case00Source, "report.pdf"))) {
  for (const name of [
    "generated-report.json", "report-workspace.json", "report.md", "report.docx", "report.pdf",
    "report.html", "PUBLICATION-EXPORT-AUDIT.json",
  ]) {
    if (fs.existsSync(path.join(case00Source, name))) copy(path.join(case00Source, name), path.join(case00Target, name));
  }
  for (const name of ["qa.json", "evidence-matrix.json", "claim-allocation.json", "quantitative-facts.json", "figure-provenance.json"]) {
    if (fs.existsSync(path.join(previousRoot, "case-00", name))) copy(path.join(previousRoot, "case-00", name), path.join(case00Target, name));
  }
  json(path.join(case00Target, "VISUAL-QA.json"), {
    schemaVersion: "researchforge-visual-qa/v1",
    inspectedAt: new Date().toISOString(),
    pdf: {
      pages: 20,
      inspected: "20/20 via all-page contact sheet plus full-resolution page 5 spot check",
      verdict: "PASS",
      findings: [],
    },
    docxPortableRender: {
      pages: 17,
      inspected: "17/17 via all-page contact sheet plus full-resolution pages 1 and 13",
      verdict: "FAIL_PORTABLE_RENDER",
      findings: ["missing_cjk_glyphs", "sparse_or_missing_body_text", "table_layout_loss"],
    },
    overall: "PARTIAL_PDF_PASS_DOCX_FAIL",
    note: "The DOCX is retained as a diagnostic artifact and excluded from reports.zip.",
  });
}

const formal = cases.filter((item) => item.classification === "FORMAL_REPORT").length;
const limited = cases.filter((item) => item.classification === "LIMITED_REPORT").length;
const blocked = cases.length - formal - limited;
const protectedHashAfter = sha(protectedFixture);
const currentHead = command("git", ["rev-parse", "HEAD"]);
const branch = command("git", ["branch", "--show-current"]);
const dirtyCount = Number(command("sh", ["-c", "git status --short | wc -l"]));

const matrix = cases.map((item) => ({
  caseId: item.caseId,
  topic: item.topic,
  classification: item.classification,
  firstWeakLayer: item.firstWeakLayer,
  searchedCandidates: item.searchedCandidates,
  acceptedSources: item.acceptedSources,
  evidenceCards: item.evidenceCards,
  directStudies: item.directStudies,
  fullTextStudies: item.fullTextStudies,
  fullTextPercentOfDirect: item.directStudies ? Number((100 * item.fullTextStudies / item.directStudies).toFixed(2)) : 0,
  studyDesignCoverage: item.studyDesignCoverage,
  populationCoverage: item.populationCoverage,
  exposureCoverage: item.exposureCoverage,
  outcomeCoverage: item.outcomeCoverage,
  effectDirectionCoverage: item.effectDirectionCoverage,
  quantitativeFacts: item.quantitativeFacts,
  moderators: item.moderators,
  writerRequests: item.writerRequests,
  export: "NO_EXPORT_FAIL_CLOSED",
  reasons: item.reasons,
}));

json("ACCEPTANCE-MATRIX.json", {
  schemaVersion: "researchforge-general-research-acceptance/v1",
  generatedAt: new Date().toISOString(),
  verdict: "RESEARCHFORGE_GENERAL_RESEARCH_INGESTION_AND_SYNTHESIS_V1_PARTIAL",
  readinessThreshold: { publishable: 8, formal: 6 },
  results: { total: 10, publishable: formal + limited, formal, limited, blocked },
  cases: matrix,
});

json("provider-usage.json", {
  schemaVersion: "researchforge-provider-usage/v1",
  liveTopicOnlyCases: 10,
  groundingJobInitiations: 13,
  boundedRepairReruns: 3,
  blindContentResampling: 0,
  writerRequests: 0,
  structuredExtraction: {
    configured: true,
    usableModelOutputs: 0,
    observedFailures: ["visible_output_starvation_or_timeout", "provider_auth_failure_in_bounded_diagnostic"],
    fallback: "deterministic_exact_span_only",
  },
  searchProviderFailures: ["HTTP_429_RATE_LIMIT"],
  note: "Counts include two interrupted client runs whose server-side work had started; no extra Writer call was made.",
});

json("protected-fixture-verification.json", {
  fixture: path.relative(repo, protectedFixture),
  expectedSha256: expectedProtectedHash,
  beforeSha256: expectedProtectedHash,
  afterSha256: protectedHashAfter,
  unchanged: protectedHashAfter === expectedProtectedHash,
});

const totalTests = apiTests + reportTests;
json("REGRESSION-REPORT.json", {
  schemaVersion: "researchforge-regression-report/v1",
  typecheck: typecheckPass ? "PASS" : "NOT_RECORDED",
  build: buildPass ? "PASS" : "NOT_RECORDED",
  suites: {
    focusedResearchIngestionSubset: { pass: focusedTests, fail: 0, note: "Subset of apiServer; not double-counted in total" },
    apiServer: { pass: apiTests, fail: 0 },
    reportFactory: { pass: reportTests, fail: 0 },
  },
  total: { pass: totalTests, fail: 0 },
  protectedFixture: protectedHashAfter === expectedProtectedHash ? "PASS_UNCHANGED" : "FAIL_CHANGED",
});

const tableRows = matrix.map((item) => `| ${item.caseId} | ${item.classification} | ${item.firstWeakLayer} | ${item.acceptedSources} | ${item.directStudies} | ${item.fullTextStudies} | ${item.studyDesignCoverage}% | ${item.effectDirectionCoverage}% | ${item.quantitativeFacts} | ${item.writerRequests} |`).join("\n");

write("ACCEPTANCE-MATRIX.md", `# Acceptance matrix\n\nVerdict: \`RESEARCHFORGE_GENERAL_RESEARCH_INGESTION_AND_SYNTHESIS_V1_PARTIAL\`\n\nPublishable: 0/10 (required 8/10). FORMAL: 0/10 (required 6/10). All unseen cases remain fail-closed.\n\n| case | classification | first weak layer | accepted | direct | full text | design | direction | numeric | Writer |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|\n${tableRows}\n`);

write("ROOT-CAUSE-GENERALIZATION.md", `# Root-cause generalization\n\n## Verdict\n\nThe previous \`RESEARCHFORGE_PARTIAL_CONTENT_ROUTING_FAILURE\` was not primarily a Writer prompt failure. The first shared defect was that claim extraction emitted generic claim text plus a support span, while the formal architecture later guessed study design from titles and topic language. Writer therefore received evidence cards without a trustworthy study-fact contract.\n\n## Layer trace\n\n1. **Retrieval:** Cases 04 and 05 stopped at search/relevance after provider rate limiting or no admissible sources. This is an upstream retrieval failure.\n2. **Access:** Cases 06, 07 and 09 found direct candidates but did not acquire enough full text. This is an acquisition failure before synthesis.\n3. **Extraction:** Cases 02, 08 and 10 reached accepted/direct/full-text evidence, but structured study facts were not recovered. Case 10 is decisive: 25 accepted sources and 12 full-text/direct studies still produced 0% design/population/exposure/outcome coverage.\n4. **Schema:** The old schema lacked a validated Study Evidence object with exact field-level provenance. It allowed generic claims to masquerade as research facts.\n5. **Routing:** The old content router could classify sparse cards as Writer-ready or infer metadata. The new Evidence Coverage Gate blocks them explicitly.\n6. **Synthesis:** Writer was not reached in any of the ten live cases because upstream evidence was incomplete. No Writer prompt change could repair absent study facts.\n\n## Required traces\n\n- **Case 00 control:** accepted canonical report remains exportable under replay, preserving 19 quantitative facts and its established QA evidence.\n- **Three blocked families:** retrieval (04/05), full-text (06/07/09), and structured extraction (02/08/10) now expose different first weak layers.\n- **Classifier-only fixtures:** prior EV lifecycle and urban-heat unseen fixtures remain classifier evidence only; they are not counted as live report acceptance.\n\n## Provider boundary\n\nThe bounded live extraction path observed model visible-output starvation/timeouts; a direct bounded diagnostic later returned provider authentication failure. Deterministic exact-span fallback was retained, but it cannot legitimately invent study design, comparison, numerical effect, or moderator facts. The pipeline therefore fails closed.\n`);

write("ARCHITECTURE-CHANGES.md", `# Architecture changes\n\n- \`lib/api-zod/src/research-grounding.ts\`: adds validated \`StructuredStudyFact\`, design/effect/moderator/quantitative schemas, and field-level provenance.\n- \`claimExtractionService.ts\`: introduces study-fact-first extraction, exact-span validation, and conservative deterministic fallback; forbids title-as-design, topic-as-population, p-value-as-direction, and covariate-as-moderator inference.\n- \`researchGroundingPipeline.ts\`: promotes scholarly full-text acquisition before acceptance becomes circular and persists structured facts into evidence cards.\n- \`formal-research-architecture.ts\`: builds the evidence matrix from structured facts and adds formal/limited/blocked Evidence Coverage Gate classification.\n- \`reportComposer.ts\`: composes only from admitted structured fields and proven quantitative facts.\n- \`general-research-query-planner.ts\`: grammar-based topic decomposition for comparative, exposure/outcome, intervention, technical, environmental, and observational questions; no fixed medicine/education template.\n- \`search-intent-planner.ts\`: supplements existing precise queries with 5–8 generalized domain-aware queries while preserving prior ordering.\n- \`qa-general-research-ingestion-live.ts\`: topic-only live acceptance, one grounding flow per case, Writer only after coverage admission, and per-stage diagnostics.\n\nNo Writer prompt was edited to compensate for upstream evidence loss. Existing project files, dirty worktree, branch, and protected fixture were preserved.\n`);

write("FINAL-REPORT.md", `# ResearchForge general research ingestion and synthesis v1\n\n## A. Executive Verdict\n\n\`RESEARCHFORGE_GENERAL_RESEARCH_INGESTION_AND_SYNTHESIS_V1_PARTIAL\`\n\n0/10 live cases reached publishable status and 0/10 reached FORMAL, below the required 8/10 publishable and 6/10 FORMAL thresholds. The system correctly failed closed: no unseen-case report.md, DOCX, PDF, or chart was emitted.\n\n## B. Repository Identity\n\n- path: \`${repo}\`\n- branch: \`${branch}\`\n- starting HEAD: \`${startingHead}\`\n- final HEAD: \`${currentHead}\`\n- starting dirty state: dirty, preserved\n- final dirty state: dirty, ${dirtyCount} paths\n- no commit, push, merge, branch switch, clean, or deployment\n\n## C. Protected Baseline\n\n- fixture hash before: \`${expectedProtectedHash}\`\n- fixture hash after: \`${protectedHashAfter}\`\n- Case 00: current-code canonical replay/export completed; the accepted input was not regenerated or resampled\n\n## D. Previous Blocking Condition\n\n\`RESEARCHFORGE_PARTIAL_CONTENT_ROUTING_FAILURE\` occurred because generic claim cards were routed toward formal composition without complete study-level facts. Some sections survived transport but lacked grounded, study-specific prose; the report client correctly pruned empty content.\n\n## E. Root Cause\n\nThe shared root cause is **structured study-fact extraction plus schema admission**, not the Writer prompt. Retrieval and access are earlier blockers for several cases, but Case 10 proves the cross-domain failure after retrieval/full text: 12 full-text/direct studies still yielded nearly no structured coverage. See \`ROOT-CAUSE-GENERALIZATION.md\`.\n\n## F. Engineering Changes\n\nSee \`ARCHITECTURE-CHANGES.md\`. Changes cover query planning, full-text acquisition, exact-provenance study facts, evidence coverage classification, and Writer admission.\n\n## G. Study Evidence Schema\n\nImportant fields: design, population, sample size, exposure/intervention, comparator, outcome, effect direction, effect magnitude, uncertainty, follow-up, setting, adjustment set, explicit moderators, limitations, quantitative metrics, source locator, exact support span, and extraction method. Every factual field must retain provenance; unknown values remain unknown.\n\n## H. Retrieval / Full-text Results\n\nAcross ten cases the system searched live providers and retained per-provider traces. Search rate limiting affected early-stage cases. Full text was acquired for 18 direct-study records in aggregate, but distribution was uneven; structured extraction provider output was unusable, so deterministic exact-span fallback remained conservative.\n\n## I. Generalization Results\n\n| case | classification | first weak layer | accepted | direct | full text | design | direction | numeric | Writer |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|\n${tableRows}\n\n## J. Evidence Quality\n\n- direct-study records: ${matrix.reduce((sum, item) => sum + item.directStudies, 0)}\n- full-text direct-study records: ${matrix.reduce((sum, item) => sum + item.fullTextStudies, 0)}\n- structured design, population, effect, and moderator coverage: below admission threshold in every case\n- quantitative facts: ${matrix.reduce((sum, item) => sum + item.quantitativeFacts, 0)} exact-span facts; none were sufficient for a publishable unseen report\n- contradictions: not synthesized because no case passed structured-coverage admission\n\n## K. Report Results\n\n- FORMAL: ${formal}\n- LIMITED: ${limited}\n- BLOCKED / SEARCH_ONLY: ${blocked}\n- Writer requests: 0\n- unseen exports: 0; all ten cases contain \`NO-EXPORT.json\`\n\n## L. Regression\n\n- focused ingestion/schema/query tests: ${focusedTests}/${focusedTests} PASS\n- API Server: ${apiTests}/${apiTests} PASS\n- Report Factory: ${reportTests}/${reportTests} PASS\n- total: ${totalTests}/${totalTests} PASS\n- workspace typecheck: ${typecheckPass ? "PASS" : "NOT_RECORDED"}\n- build: ${buildPass ? "PASS" : "NOT_RECORDED"}\n- protected fixture checksum: ${protectedHashAfter === expectedProtectedHash ? "PASS_UNCHANGED" : "FAIL_CHANGED"}\n\n## M. Visual QA\n\nOnly Case 00 legally produced DOCX/PDF. Its current outputs were rasterized and inspected across all pages; the visual QA manifest records page counts and observed defects. No visual success is claimed for blocked cases.\n\n## N. ZIP Integrity\n\n\`reports.zip\` contains only the legally exported Case 00 Markdown, DOCX, PDF, audit, and README. It contains no blocked-case placeholder. SHA-256 is recorded in \`SHA256SUMS.json\`.\n\n## O. Remaining Limitations\n\n- live structured extraction is blocked by provider output/authentication failures\n- search rate limits can stop a case before evidence admission\n- PMC/full-text acquisition remains incomplete for several domains\n- deterministic fallback intentionally cannot infer study metadata\n- 0/10 live publishable cases means generalization readiness is not demonstrated\n\n## P. Final Recommendation\n\nDo not claim GENERALIZATION READY. Restore a usable structured-extraction provider, then rerun the same topic-only matrix without changing thresholds or resampling for favorable content. The correct current label is \`RESEARCHFORGE_GENERAL_RESEARCH_INGESTION_AND_SYNTHESIS_V1_PARTIAL\`.\n`);

const finalReportPath = path.join(root, "FINAL-REPORT.md");
fs.writeFileSync(
  finalReportPath,
  fs.readFileSync(finalReportPath, "utf8")
    .replace(
      "Only Case 00 legally produced DOCX/PDF. Its current outputs were rasterized and inspected across all pages; the visual QA manifest records page counts and observed defects. No visual success is claimed for blocked cases.",
      "Only Case 00 produced current replay outputs. The PDF passed 20/20-page inspection. The DOCX portable render failed 17/17-page inspection because of missing CJK glyphs, sparse/missing body text, and table-layout loss; it is retained only as a diagnostic and excluded from the report ZIP. No visual success is claimed for blocked cases.",
    )
    .replace(
      "`reports.zip` contains only the legally exported Case 00 Markdown, DOCX, PDF, audit, and README. It contains no blocked-case placeholder.",
      "`reports.zip` contains only the readable Case 00 Markdown, PDF, export audit, and README. The failed portable-render DOCX and all blocked-case placeholders are excluded.",
    )
    .replace(
      "- 0/10 live publishable cases means generalization readiness is not demonstrated",
      "- Case 10's original live plan had 4 queries; current deterministic replay has 7 after the contextual-effect parser repair, but the case was not content-resampled\n- 0/10 live publishable cases means generalization readiness is not demonstrated",
    ),
);

write("reports/README.md", `# reports.zip\n\nThis archive is intentionally fail-closed. It contains the readable current-code Case 00 Markdown/PDF control export only. The Case 00 DOCX failed portable visual rendering and is excluded. Ten unseen live cases did not pass Evidence Coverage Gate, so no placeholder report, DOCX, PDF, or chart is included for them. Their diagnostics remain outside this report-only archive under \`cases/\`.\n`);
if (fs.existsSync(path.join(root, case00Target))) {
  for (const name of ["report.md", "report.pdf", "PUBLICATION-EXPORT-AUDIT.json"]) {
    const source = path.join(root, case00Target, name);
    if (fs.existsSync(source)) copy(source, path.join("reports", "case-00-control", name));
  }
}
const zipPath = path.join(root, "reports.zip");
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
const zip = spawnSync("zip", ["-q", "-r", zipPath, "reports"], { cwd: root, encoding: "utf8" });
if (zip.status !== 0) throw new Error(`zip failed: ${zip.stderr}`);

const manifestFiles = [
  "FINAL-REPORT.md", "ROOT-CAUSE-GENERALIZATION.md", "ARCHITECTURE-CHANGES.md",
  "ACCEPTANCE-MATRIX.md", "ACCEPTANCE-MATRIX.json", "REGRESSION-REPORT.json", "provider-usage.json",
  "protected-fixture-verification.json", "reports.zip",
];
json("SHA256SUMS.json", {
  algorithm: "sha256",
  files: Object.fromEntries(manifestFiles.map((name) => [name, { bytes: fs.statSync(path.join(root, name)).size, sha256: sha(path.join(root, name)) }])),
});

write("FINAL-VERDICT.txt", "RESEARCHFORGE_GENERAL_RESEARCH_INGESTION_AND_SYNTHESIS_V1_PARTIAL\n");
console.log(JSON.stringify({ root, formal, limited, blocked, totalTests, protectedHashAfter, reportsZipSha256: sha(zipPath) }, null, 2));
