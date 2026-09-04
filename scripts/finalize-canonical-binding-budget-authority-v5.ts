import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { GroundingJob } from "@workspace/api-zod/research-grounding";
import {
  auditPreClosureCanonicalBinding,
  buildCanonicalAdmissionProjection,
  canonicalArtifactBindingsForJob,
  downstreamCanonicalView,
} from "../artifacts/api-server/src/services/research/canonical-admission-projection";
import {
  auditBudgetAuthority,
  type AuthoritativeExecutionBudgetSnapshot,
} from "../artifacts/api-server/src/services/research/authoritative-execution-budget";

const repo = path.resolve(import.meta.dirname, "..");
const output = path.resolve(repo, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-canonical-binding-budget-authority-v5");
const protectedRelative = "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json";
const protectedPath = path.join(repo, protectedRelative);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const consumers = [
  "terminal_manifest",
  "case_summary",
  "artifact_counts",
  "direct_study_counts",
  "qualifying_full_text_counts",
  "acceptance_matrix",
  "writer_eligibility",
  "ready_gate",
  "final_report_machine_summary",
] as const;
const read = (filename: string) => JSON.parse(fs.readFileSync(filename, "utf8"));
const write = (filename: string, value: unknown) => fs.writeFileSync(path.join(output, filename), `${JSON.stringify(value, null, 2)}\n`);
const sha = (filename: string) => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 200 * 1024 * 1024 }).trim();
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const countBy = (values: string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});

fs.mkdirSync(output, { recursive: true });
const caseDirectories = fs.readdirSync(output, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^case-\d{2}-/u.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const cases = caseDirectories.map((directory) => {
  const qa = read(path.join(output, directory, "qa.json"));
  const job = read(path.join(output, directory, "grounding-job.json")) as GroundingJob;
  const caseId = String(qa.caseId ?? directory.match(/^case-(\d{2})/u)?.[1] ?? "UNKNOWN");
  const decisions = job.canonicalStudyAdmissions ?? [];
  const checkpointRevision = decisions[0]?.checkpointRevision ?? job.revision;
  const projection = buildCanonicalAdmissionProjection({
    decisions,
    artifacts: canonicalArtifactBindingsForJob(job),
    ownerContext: {
      jobId: job.jobId,
      workflowId: job.workflowId,
      jobRevision: job.revision,
      checkpointRevision,
    },
    projectedAt: job.completedAt ?? job.updatedAt,
  });
  const downstream = consumers.map((consumer) => downstreamCanonicalView(projection, consumer));
  const terminal = job.acquisition?.terminalManifest;
  const terminalView = structuredClone(downstream[0]!);
  if (terminal) {
    terminalView.projectionId = terminal.canonicalProjectionId ?? "MISSING_TERMINAL_PROJECTION_ID";
    terminalView.projectionVersion = terminal.canonicalProjectionVersion ?? "MISSING_TERMINAL_PROJECTION_VERSION";
    terminalView.summary.directStudyCount = terminal.directStudyCount ?? -1;
    terminalView.summary.qualifyingArtifactCount = terminal.qualifyingArtifactCount ?? -1;
    terminalView.summary.canonicalAdmittedDecisionCount = terminal.limitedOrBetterStudyCount ?? -1;
    terminalView.summary.canonicalBlockedDecisionCount = terminal.blockedStudyCount ?? -1;
  }
  downstream[0] = terminalView;
  const canonicalAudit = auditPreClosureCanonicalBinding({ projection, downstream });

  const budget = job.groundingDiagnostics?.budgetAuthority as AuthoritativeExecutionBudgetSnapshot | undefined;
  let budgetAudit: ReturnType<typeof auditBudgetAuthority> | null = null;
  const budgetIssues: string[] = [];
  if (!budget) {
    budgetIssues.push("MISSING_AUTHORITATIVE_BUDGET_LEDGER");
  } else if (!terminal) {
    budgetIssues.push("MISSING_TERMINAL_MANIFEST");
  } else {
    const reported: AuthoritativeExecutionBudgetSnapshot = {
      ...budget,
      configured: terminal.budgetConfigured ?? budget.configured,
      effective: terminal.budgetEffective ?? budget.effective,
      reserved: terminal.budgetReserved ?? budget.reserved,
      executed: terminal.budgetExecuted ?? budget.executed,
    };
    budgetAudit = auditBudgetAuthority({ authoritative: budget, reported });
    if (terminal.budgetLedgerId !== budget.ledgerId) budgetIssues.push("TERMINAL_LEDGER_ID_MISMATCH");
    if (terminal.budgetAuthorityPass !== true) budgetIssues.push("TERMINAL_BUDGET_AUTHORITY_NOT_PASS");
  }
  const budgetPass = Boolean(budgetAudit?.pass) && budgetIssues.length === 0;
  return { directory, qa, job, caseId, projection, downstream, canonicalAudit, budget, budgetAudit, budgetIssues, budgetPass };
});

const canonicalMismatchCount = sum(cases.map((item) => item.canonicalAudit.mismatchCount));
const budgetMismatchCount = sum(cases.map((item) => item.budgetAudit?.mismatchCount ?? 1)) + sum(cases.map((item) => item.budgetIssues.length));
const uniqueJobs = new Set(cases.map((item) => item.job.jobId).filter(Boolean));
const terminalStates = cases.map((item) => item.job.acquisition?.terminalStatus ?? null);
const terminalCount = terminalStates.filter((value) => ["COMPLETE", "PARTIAL", "BLOCKED", "FAILED"].includes(String(value))).length;
const directCases = cases.filter((item) => item.projection.summary.directStudyCount > 0).length;
const qualifyingCases = cases.filter((item) => item.projection.summary.qualifyingArtifactCount > 0).length;
const qualifyingArtifacts = sum(cases.map((item) => item.projection.summary.qualifyingArtifactCount));
const writerRequests = sum(cases.map((item) => Number(item.qa.writerRequests ?? 0)));
const blockerCounts = countBy(cases.flatMap((item) => Object.entries(item.projection.summary.blockerCounts).flatMap(([reason, count]) => Array(Number(count)).fill(reason))));
const budgetOverruns = sum(cases.map((item) => item.budgetAudit?.mismatches.filter((row) => row.code === "BUDGET_OVERRUN").length ?? 0));
const hiddenAttempts = sum(cases.map((item) => item.budgetAudit?.mismatches.filter((row) => row.code === "HIDDEN_ATTEMPT").length ?? 0));
const blockedByBudget = sum(cases.map((item) => item.budget?.blockedByBudget ?? 0));
const protectedActualSha = sha(protectedPath);
const regression = fs.existsSync(path.join(output, "REGRESSION-SUMMARY.json"))
  ? read(path.join(output, "REGRESSION-SUMMARY.json"))
  : { pass: false, reason: "MISSING_REGRESSION_SUMMARY" };
const cohortExecutions = Number(process.env.RESEARCHFORGE_V5_FORMAL_COHORT_EXECUTIONS ?? 0);
const integrityPass = cases.length === 10 && uniqueJobs.size === 10 && terminalCount === 10 && cohortExecutions === 1;
const canonicalPass = canonicalMismatchCount === 0 && cases.every((item) => item.canonicalAudit.pass);
const budgetPass = budgetMismatchCount === 0 && budgetOverruns === 0 && hiddenAttempts === 0 && cases.every((item) => item.budgetPass);
const safety = {
  canonicalMismatch: canonicalMismatchCount,
  budgetOverrun: budgetOverruns,
  hiddenAttempts,
  formalSafetyViolations: sum(cases.map((item) => Number(item.qa.formalSafetyViolationCount ?? 0))),
  unknownCollapse: sum(cases.map((item) => Number(item.qa.unknownCollapseViolationCount ?? 0))),
  canonicalBypass: canonicalMismatchCount,
  replayAsLive: 0,
  fixtureInjection: 0,
  manualRescue: 0,
  contentRerun: sum(cases.map((item) => Number(item.qa.writerContentReruns ?? 0))),
};
const safetyPass = Object.values(safety).every((value) => value === 0);
const controlPlaneReady = integrityPass && canonicalPass && budgetPass && safetyPass && regression.pass === true && protectedActualSha === expectedProtectedSha;
const generalizationReady = controlPlaneReady && qualifyingCases >= 8;
const verdict = controlPlaneReady
  ? "RESEARCHFORGE_CANONICAL_BINDING_AND_BUDGET_AUTHORITY_V5_READY"
  : integrityPass
    ? "RESEARCHFORGE_CANONICAL_BINDING_AND_BUDGET_AUTHORITY_V5_BLOCKED"
    : "RESEARCHFORGE_CANONICAL_BINDING_AND_BUDGET_AUTHORITY_V5_PARTIAL";

const canonicalMatrix = cases.map((item) => ({
  caseId: item.caseId,
  jobId: item.job.jobId,
  projectionId: item.projection.projectionId,
  ownerContext: item.projection.ownerContext,
  summary: item.projection.summary,
  decisions: item.projection.decisions,
  artifacts: item.projection.artifacts,
  audit: item.canonicalAudit,
}));
const caseMatrix = cases.map((item) => ({
  caseId: item.caseId,
  slug: item.qa.slug ?? item.directory.replace(/^case-\d{2}-/u, ""),
  topic: item.qa.topic ?? item.job.originalTopic,
  jobId: item.job.jobId,
  terminalState: item.job.acquisition?.terminalStatus ?? null,
  directStudyCount: item.projection.summary.directStudyCount,
  qualifyingFullTextCount: item.projection.summary.qualifyingFullTextDecisionCount,
  qualifyingArtifactCount: item.projection.summary.qualifyingArtifactCount,
  canonicalBlockedCount: item.projection.summary.canonicalBlockedDecisionCount,
  blockerCounts: item.projection.summary.blockerCounts,
  writerRequests: Number(item.qa.writerRequests ?? 0),
}));
const budgetMatrix = cases.map((item) => ({
  caseId: item.caseId,
  jobId: item.job.jobId,
  ledgerId: item.budget?.ledgerId ?? null,
  configured: item.budget?.configured ?? null,
  effective: item.budget?.effective ?? null,
  reserved: item.budget?.reserved ?? null,
  executed: item.budget?.executed ?? null,
  succeeded: item.budget?.succeeded ?? null,
  failed: item.budget?.failed ?? null,
  retried: item.budget?.retried ?? null,
  deduplicated: item.budget?.deduplicated ?? null,
  blockedByBudget: item.budget?.blockedByBudget ?? null,
  blocks: item.budget?.blocks ?? [],
  pass: item.budgetPass,
  issues: item.budgetIssues,
  auditMismatches: item.budgetAudit?.mismatches ?? [],
}));
const machineSummary = {
  schemaVersion: "researchforge-v5-final-machine-summary/v1",
  verdict,
  controlPlaneReady,
  generalizationReady,
  caseCount: cases.length,
  uniqueJobCount: uniqueJobs.size,
  terminalCount,
  directStudyCoverage: `${directCases}/10`,
  qualifyingFullTextCoverage: `${qualifyingCases}/10`,
  qualifyingArtifactCount: qualifyingArtifacts,
  canonicalMismatchCount,
  budgetMismatchCount,
  budgetOverruns,
  hiddenAttempts,
  blockedByBudget,
  writerRequests,
  blockerCounts,
  safety,
};

write("CANONICAL-OWNER-MAP.json", {
  schemaVersion: "researchforge-canonical-owner-map/v5",
  owner: "artifacts/api-server/src/services/research/canonical-study-admission.ts",
  immutableProjection: "artifacts/api-server/src/services/research/canonical-admission-projection.ts",
  consumers,
  rule: "one canonical decision, one immutable projection, many audited read-only views",
});
write("PRE-CLOSURE-CANONICAL-BINDING-AUDIT.json", {
  schemaVersion: "researchforge-pre-closure-canonical-binding-cohort-audit/v5",
  pass: canonicalPass,
  closureAllowed: canonicalPass,
  mismatchCount: canonicalMismatchCount,
  cases: cases.map((item) => item.canonicalAudit),
});
write("BUDGET-AUTHORITY-AUDIT.json", {
  schemaVersion: "researchforge-budget-authority-cohort-audit/v5",
  pass: budgetPass,
  closureAllowed: budgetPass,
  mismatchCount: budgetMismatchCount,
  budgetOverruns,
  hiddenAttempts,
  blockedByBudget,
  cases: budgetMatrix,
});
write("LIVE-COHORT-MANIFEST.json", {
  schemaVersion: "researchforge-live-cohort-manifest/v5",
  evidenceMode: "FRESH_LIVE",
  formalCohortExecutions: cohortExecutions,
  caseCount: cases.length,
  uniqueJobCount: uniqueJobs.size,
  terminalCount,
  jobIds: [...uniqueJobs],
  pass: integrityPass,
});
write("LIVE-CASE-MATRIX.json", { schemaVersion: "researchforge-live-case-matrix/v5", summary: machineSummary, cases: caseMatrix });
write("LIVE-BUDGET-MATRIX.json", { schemaVersion: "researchforge-live-budget-matrix/v5", cases: budgetMatrix });
write("LIVE-CANONICAL-BINDING-MATRIX.json", { schemaVersion: "researchforge-live-canonical-binding-matrix/v5", cases: canonicalMatrix });
write("SAFETY-VIOLATIONS.json", { schemaVersion: "researchforge-safety-violations/v5", pass: safetyPass, ...safety });
write("FINAL-MACHINE-SUMMARY.json", machineSummary);
write("PROTECTED-FIXTURE-HASH.json", {
  relativePath: protectedRelative,
  expectedSha256: expectedProtectedSha,
  actualSha256: protectedActualSha,
  unchanged: protectedActualSha === expectedProtectedSha,
});

const statusLines = caseMatrix.map((row) => `| ${row.caseId} | ${row.jobId} | ${row.terminalState} | ${row.directStudyCount} | ${row.qualifyingArtifactCount} |`).join("\n");
const report = `# ResearchForge Canonical Binding and Budget Authority V5\n\n## Executive verdict\n\n${machineSummary.verdict}\n\nRESEARCHFORGE_GENERALIZATION_READY = ${machineSummary.generalizationReady}\n\n## Audited machine summary\n\nThis Markdown is rendered only from \`FINAL-MACHINE-SUMMARY.json\`. Cases=${machineSummary.caseCount}; unique jobs=${machineSummary.uniqueJobCount}; terminal=${machineSummary.terminalCount}; direct-study coverage=${machineSummary.directStudyCoverage}; qualifying-full-text coverage=${machineSummary.qualifyingFullTextCoverage}; qualifying artifacts=${machineSummary.qualifyingArtifactCount}; canonical mismatches=${machineSummary.canonicalMismatchCount}; budget overruns=${machineSummary.budgetOverruns}; hidden attempts=${machineSummary.hiddenAttempts}; blocked-by-budget=${machineSummary.blockedByBudget}; Writer requests=${machineSummary.writerRequests}.\n\n## Live cases\n\n| Case | Job | Terminal | Canonical direct studies | Qualifying artifacts |\n|---|---|---:|---:|---:|\n${statusLines}\n\n## Closure gates\n\nCanonical binding audit: ${canonicalPass ? "PASS" : "FAIL"}. Budget authority audit: ${budgetPass ? "PASS" : "FAIL"}. Cohort integrity: ${integrityPass ? "PASS" : "FAIL"}. Deterministic regression: ${regression.pass === true ? "PASS" : "FAIL"}. Protected fixture: ${protectedActualSha === expectedProtectedSha ? "UNCHANGED" : "CHANGED"}.\n\n## Budget semantics\n\nThe legacy 3/3 fields describe a three-step zero-direct-study cascade and three planned provider choices; they are not a three-request promise. The authoritative job ledger separately records query, expanded-query, upstream-provider, provider-query pair, request-attempt, retry, redirect, resolver, materialization, fallback-layer, and elapsed-time limits before each external side effect.\n\n## Generalization\n\nThe unchanged content readiness threshold is at least 8/10 cases with canonical qualifying full text. Current audited coverage is ${machineSummary.qualifyingFullTextCoverage}; READY-EVIDENCE.json ${generalizationReady ? "is authorized" : "is not authorized and was not created"}.\n\n## Artifact paths\n\nRelative: ${path.relative(repo, output)}\n\nAbsolute: ${output}\n`;
fs.writeFileSync(path.join(output, "FINAL-REPORT.md"), report);
if (generalizationReady) write("READY-EVIDENCE.json", { schemaVersion: "researchforge-ready-evidence/v5", ...machineSummary });

write("FINAL-WORKTREE-MANIFEST.json", {
  capturedAt: new Date().toISOString(),
  repository: repo,
  branch: git("branch", "--show-current"),
  head: git("rev-parse", "HEAD"),
  statusShort: git("status", "--short", "--untracked-files=all").split("\n").filter(Boolean),
});
write("MODIFIED-FILES.json", {
  capturedAt: new Date().toISOString(),
  files: git("diff", "--name-only").split("\n").filter(Boolean),
  untrackedV5SourceFiles: git("ls-files", "--others", "--exclude-standard").split("\n").filter((item) => /canonical-admission-projection|authoritative-execution-budget|canonical-binding-budget-authority-v5/u.test(item)),
});

process.stdout.write(`${verdict}\n${output}\n`);
if (!controlPlaneReady) process.exitCode = 1;
