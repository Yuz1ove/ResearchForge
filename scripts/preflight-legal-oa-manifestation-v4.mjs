import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const output = path.resolve(repo, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-legal-oa-manifestation-resolution-v4");
const apiOrigin = (process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3100").replace(/\/+$/u, "");
const protectedRelative = "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json";
const protectedPath = path.join(repo, protectedRelative);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";

fs.mkdirSync(output, { recursive: true });

function sha256(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function command(name, executable, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd: repo,
    encoding: "utf8",
    timeout: options.timeout ?? 60_000,
    env: process.env,
  });
  return {
    name,
    command: [executable, ...args].join(" "),
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode: result.status,
    signal: result.signal,
    pass: result.status === 0,
    stdout: (result.stdout ?? "").trim().slice(0, 2_000),
    stderr: (result.stderr ?? "").trim().slice(0, 2_000),
  };
}

async function healthCheck() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const candidates = ["/api/healthz", "/api/health", "/health", "/api/research-grounding-jobs/health"];
    for (const endpoint of candidates) {
      try {
        const response = await fetch(`${apiOrigin}${endpoint}`, { signal: controller.signal });
        if (response.status > 0 && response.status < 500) {
          return { pass: true, endpoint, status: response.status, bodyPreview: (await response.text()).slice(0, 500) };
        }
      } catch {
        // Continue to the next read-only health endpoint.
      }
    }
    return { pass: false, endpoint: null, status: null, reason: "NO_READ_ONLY_HEALTH_ENDPOINT_RESPONDED" };
  } finally {
    clearTimeout(timeout);
  }
}

const writeProbe = path.join(output, `.preflight-write-probe-${process.pid}`);
let outputWritable = false;
try {
  fs.writeFileSync(writeProbe, "preflight\n", { flag: "wx" });
  outputWritable = fs.readFileSync(writeProbe, "utf8") === "preflight\n";
  fs.unlinkSync(writeProbe);
} catch {
  outputWritable = false;
}

const packageManager = command("package manager", "corepack", ["pnpm", "--version"]);
const runner = command("workspace tsx runner", "corepack", ["pnpm", "--filter", "@workspace/scripts", "exec", "tsx", "--version"]);
const providerInitialization = command(
  "provider and manifestation modules initialize",
  "corepack",
  [
    "pnpm", "--filter", "@workspace/api-server", "exec", "tsx", "-e",
    "Promise.all([import('./src/services/research/grounding/fullTextAcquisitionV3.ts'),import('./src/services/research/grounding/sourceContentExtractor.ts'),import('./src/services/research/grounding/studyManifestation.ts')]).then(()=>console.log('PROVIDER_CLIENTS_INITIALIZED'))",
  ],
);
const harnessLoad = command(
  "formal cohort harness TypeScript compilation",
  "corepack",
  [
    "pnpm", "--filter", "@workspace/api-server", "exec", "esbuild",
    "../../scripts/qa-general-research-ingestion-live.ts",
    "--format=esm", "--platform=node",
    `--outfile=/private/tmp/researchforge-v4-harness-preflight-${process.pid}.mjs`,
    "--log-level=error",
  ],
  { timeout: 20_000 },
);

const protectedSha = fs.existsSync(protectedPath) ? sha256(protectedPath) : null;
const health = await healthCheck();
const optionalProviderEnvironment = [
  "OPENALEX_API_KEY",
  "UNPAYWALL_EMAIL",
  "SEMANTIC_SCHOLAR_API_KEY",
  "CORE_API_KEY",
].map((name) => ({ name, present: Boolean(process.env[name]?.trim()), required: false }));
const requiredPaths = [
  "package.json",
  "pnpm-lock.yaml",
  "node_modules",
  "artifacts/api-server/package.json",
  "artifacts/api-server/dist/index.mjs",
  "scripts/qa-general-research-ingestion-live.ts",
  "scripts/finalize-legal-oa-manifestation-v4.mjs",
].map((relative) => ({ relative, exists: fs.existsSync(path.join(repo, relative)) }));
const formalCommand = [
  "RESEARCHFORGE_QA_EXTRACTION_ONLY=true",
  `RESEARCHFORGE_QA_OUTPUT_DIR=${JSON.stringify(path.relative(repo, output))}`,
  `RESEARCHFORGE_QA_API_ORIGIN=${JSON.stringify(apiOrigin)}`,
  "corepack pnpm --filter @workspace/scripts exec tsx qa-general-research-ingestion-live.ts",
].join(" ");
const serverCommand = [
  `RESEARCHFORGE_ARTIFACT_SNAPSHOT_DIR=${JSON.stringify(path.join(output, "raw-artifacts"))}`,
  "PORT=3100 HOST=127.0.0.1 corepack pnpm --filter @workspace/api-server start",
].join(" ");
const gates = {
  packageManager: packageManager.pass,
  dependenciesPresent: requiredPaths.every((item) => item.exists),
  runner: runner.pass,
  providerClientsInitialize: providerInitialization.pass,
  harnessSyntax: harnessLoad.pass,
  outputWritable,
  protectedFixture: protectedSha === expectedProtectedSha,
  apiReadOnlyHealth: health.pass,
  formalCommandBoundedAndExtractionOnly: /EXTRACTION_ONLY=true/u.test(formalCommand) && !/RESUME|AGGREGATE|CASE_ID/u.test(formalCommand),
};
const result = {
  schemaVersion: "researchforge-legal-oa-manifestation-preflight/v4",
  evidenceMode: "FRESH_PREFLIGHT_NO_FORMAL_JOB",
  repository: repo,
  branch: execFileSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" }).trim(),
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  nodeVersion: process.version,
  packageManager,
  runner,
  providerInitialization,
  harnessLoad,
  optionalProviderEnvironment,
  requiredEnvironmentMissing: [],
  requiredPaths,
  outputDirectory: output,
  outputWritable,
  protectedFixture: { relative: protectedRelative, expectedSha256: expectedProtectedSha, actualSha256: protectedSha, unchanged: protectedSha === expectedProtectedSha },
  health,
  serverCommand,
  formalCohortCommand: formalCommand,
  formalJobsCreatedByPreflight: 0,
  gates,
  pass: Object.values(gates).every(Boolean),
  completedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(output, "PREFLIGHT-RESULT.json"), `${JSON.stringify(result, null, 2)}\n`);
const codeSealFiles = [
  "lib/api-zod/src/research-grounding.ts",
  "artifacts/api-server/src/services/research/grounding/studyManifestation.ts",
  "artifacts/api-server/src/services/research/grounding/studyManifestation.test.ts",
  "artifacts/api-server/src/services/research/grounding/fullTextAcquisitionV3.ts",
  "artifacts/api-server/src/services/research/grounding/sourceContentExtractor.ts",
  "artifacts/api-server/src/services/research/grounding/researchGroundingPipeline.ts",
  "artifacts/api-server/src/services/research/grounding/researchGroundingPipeline.test.ts",
  "scripts/preflight-legal-oa-manifestation-v4.mjs",
  "scripts/finalize-legal-oa-manifestation-v4.mjs",
  "scripts/qa-general-research-ingestion-live.ts",
].map((relative) => ({ relative, sha256: sha256(path.join(repo, relative)) }));
fs.writeFileSync(path.join(output, "CODE-SEAL-BEFORE-COHORT.json"), `${JSON.stringify({
  schemaVersion: "researchforge-code-seal-before-formal-cohort/v4",
  createdAt: new Date().toISOString(),
  branch: result.branch,
  head: result.head,
  files: codeSealFiles,
}, null, 2)}\n`);
process.stdout.write(`${result.pass ? "PREFLIGHT_PASS" : "PREFLIGHT_FAIL"}\n${path.join(output, "PREFLIGHT-RESULT.json")}\n`);
if (!result.pass) process.exitCode = 1;
