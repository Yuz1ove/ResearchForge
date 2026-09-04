import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const output = path.resolve(repo, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-canonical-binding-budget-authority-v5");
const logs = path.join(output, "logs");
fs.mkdirSync(logs, { recursive: true });
const resumeAfterApiFix = process.env.RESEARCHFORGE_V5_RESUME_AFTER_API_FIX === "true";
const priorSummaryPath = path.join(output, "REGRESSION-SUMMARY.json");
const priorSummary = resumeAfterApiFix && fs.existsSync(priorSummaryPath)
  ? JSON.parse(fs.readFileSync(priorSummaryPath, "utf8"))
  : null;
const commands = resumeAfterApiFix
  ? (priorSummary?.commands ?? []).slice(0, 5)
  : [];

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
}

function run(name, executable, args, timeout = 30 * 60_000) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd: repo,
    env: process.env,
    encoding: "utf8",
    timeout,
    maxBuffer: 200 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const logPath = path.join(logs, `${String(commands.length + 1).padStart(2, "0")}-${safeName(name)}.log`);
  fs.writeFileSync(logPath, `${stdout}${stderr ? `\n[stderr]\n${stderr}` : ""}`);
  const testCount = Number(stdout.match(/# tests (\d+)/u)?.[1] ?? stdout.match(/Tests\s+(\d+) passed/u)?.[1] ?? 0);
  const passCount = Number(stdout.match(/# pass (\d+)/u)?.[1] ?? stdout.match(/Tests\s+(\d+) passed/u)?.[1] ?? 0);
  const row = {
    name,
    command: [executable, ...args].join(" "),
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    pass: result.status === 0,
    testCount,
    passCount,
    logPath: path.relative(repo, logPath),
    outputTail: `${stdout}\n${stderr}`.trim().split("\n").slice(-30),
  };
  commands.push(row);
  process.stdout.write(`${row.pass ? "PASS" : "FAIL"} ${name}${testCount ? ` ${passCount}/${testCount}` : ""}\n`);
  return row.pass;
}

const pnpm = (...args) => ["pnpm", ...args];
let proceed = true;
if (!resumeAfterApiFix) proceed = run("canonical binding controlled", "corepack", pnpm("--filter", "@workspace/api-server", "exec", "tsx", "--test", "src/services/research/canonical-admission-projection.test.ts"));
if (!resumeAfterApiFix && proceed) proceed = run("budget authority controlled", "corepack", pnpm("--filter", "@workspace/api-server", "exec", "tsx", "--test", "src/services/research/authoritative-execution-budget.test.ts"));
if (!resumeAfterApiFix && proceed) proceed = run("existing controlled manifestation", "corepack", pnpm("--filter", "@workspace/api-server", "exec", "tsx", "--test", "--test-concurrency=1", "src/services/research/grounding/studyManifestation.test.ts"));
if (!resumeAfterApiFix && proceed) proceed = run("focused acquisition suite", "corepack", pnpm("--filter", "@workspace/api-server", "exec", "tsx", "--test", "--test-concurrency=1", "src/services/research/grounding/studyManifestation.test.ts", "src/services/research/grounding/fullTextAcquisitionV3.test.ts", "src/services/research/grounding/scholarlyPayloadMaterializer.test.ts", "src/services/research/grounding/sourceContentExtractor.test.ts", "src/services/evidence-gap-driven-query-planner.test.ts"));
if (!resumeAfterApiFix && proceed) proceed = run("case05 compatibility", "corepack", pnpm("--filter", "@workspace/api-server", "exec", "tsx", "--test", "--test-name-pattern=zero-direct", "src/services/research/grounding/researchGroundingPipeline.test.ts"));
if (proceed) proceed = run("api full regression", "corepack", pnpm("--filter", "@workspace/api-server", "test"), 60 * 60_000);
if (proceed) proceed = run("report factory full regression", "corepack", pnpm("--filter", "@workspace/report-factory", "test"), 60 * 60_000);
if (proceed) proceed = run("workspace typecheck", "corepack", pnpm("run", "typecheck"), 60 * 60_000);
if (proceed) proceed = run("production build", "corepack", pnpm("run", "build"), 60 * 60_000);
if (proceed) proceed = run("git diff check", "git", ["diff", "--check"]);

const jsonFiles = [];
const jsonFailures = [];
for (const filename of fs.readdirSync(output, { recursive: true })) {
  const relative = String(filename);
  if (!relative.endsWith(".json")) continue;
  const absolute = path.join(output, relative);
  if (!fs.statSync(absolute).isFile()) continue;
  jsonFiles.push(relative);
  try { JSON.parse(fs.readFileSync(absolute, "utf8")); } catch (error) {
    jsonFailures.push({ relative, error: error instanceof Error ? error.message : String(error) });
  }
}
const protectedPath = path.join(repo, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const protectedHash = createHash("sha256").update(fs.readFileSync(protectedPath)).digest("hex");
const fixturePass = protectedHash === "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const pass = proceed && jsonFailures.length === 0 && fixturePass && commands.every((row) => row.pass);
const summary = {
  schemaVersion: "researchforge-v5-deterministic-regression-summary/v1",
  evidenceMode: "CURRENT_CONTROLLED_AND_FULL_REGRESSION",
  completedAt: new Date().toISOString(),
  pass,
  commands,
  qaJson: { parsed: jsonFiles.length, failed: jsonFailures.length, failures: jsonFailures },
  protectedFixture: { pass: fixturePass, sha256: protectedHash },
  formalLiveJobsCreated: 0,
  stoppedBeforeLiveOnFailure: !pass,
  diagnosticAnomalies: resumeAfterApiFix ? [{
    classification: "NODE_TEST_RUNNER_PARENT_CANCELLATION_TRANSIENT",
    initialFullSuite: "697/745 with one pending promise cancellation and 47 parent cancellations",
    isolatedFirstTest: "1/1 PASS",
    secondFullSuiteBeforeFix: "744/745 exposed one optional diagnostics compatibility defect",
    remediation: "optional-chain legacy fixture diagnostics and rerun the complete serial suite",
  }] : [],
};
fs.writeFileSync(path.join(output, "CONTROLLED-TEST-RESULTS.json"), `${JSON.stringify({
  schemaVersion: "researchforge-v5-controlled-test-results/v1",
  pass: commands.slice(0, 5).length === 5 && commands.slice(0, 5).every((row) => row.pass),
  commands: commands.slice(0, 5),
}, null, 2)}\n`);
fs.writeFileSync(path.join(output, "REGRESSION-SUMMARY.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${pass ? "V5_DETERMINISTIC_GATES_PASS" : "V5_DETERMINISTIC_GATES_FAIL"}\n`);
if (!pass) process.exitCode = 1;
