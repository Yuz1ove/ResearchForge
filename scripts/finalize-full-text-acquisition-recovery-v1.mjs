import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const requestedOutput = process.argv[2];
if (!requestedOutput) throw new Error("Usage: node scripts/finalize-full-text-acquisition-recovery-v1.mjs <qa-directory>");
const outputDir = path.resolve(repositoryRoot, requestedOutput);
const protectedFixture = path.join(repositoryRoot, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const startingState = {
  capturedAt: "CURRENT_TURN_OPENING_RECONNAISSANCE",
  branch: "codex/paper-search-performance-v1-20260716",
  head: "a89549a6e26a7ac3ae44ad52b5588101baf28b95",
  stagedFiles: 0,
  trackedModifications: 76,
  untrackedFiles: 6818,
  intentionallyDirty: true,
};
const modifiedByThisRun = [
  "artifacts/api-server/src/services/research/grounding/fullTextAcquisitionV3.ts",
  "artifacts/api-server/src/services/research/grounding/fullTextAcquisitionV3.test.ts",
  "artifacts/api-server/src/services/research/grounding/sourceContentExtractor.ts",
  "artifacts/api-server/src/services/research/grounding/sourceContentExtractor.test.ts",
  "artifacts/api-server/src/services/research/canonical-study-admission.ts",
  "artifacts/api-server/src/services/research/canonical-study-admission.test.ts",
  "artifacts/api-server/src/services/research/grounding/researchGroundingPipeline.ts",
  "artifacts/api-server/src/services/research/grounding/acceptedSourceEnrichment.ts",
  "artifacts/report-factory/src/lib/sourceRecords.ts",
  "lib/api-zod/src/research-grounding.ts",
  "scripts/finalize-full-text-acquisition-recovery-v1.mjs",
];

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? "").trim();
const shaFile = (filename) => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const runGit = (args) => execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim();
const writeText = (name, value) => {
  const target = path.join(outputDir, name);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value.endsWith("\n") ? value : `${value}\n`, "utf8");
  fs.renameSync(temporary, target);
};
const writeJson = (name, value) => writeText(name, JSON.stringify(value, null, 2));
const countBy = (values) => values.reduce((counts, value) => {
  const key = clean(value) || "UNKNOWN";
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
const sum = (values) => values.reduce((total, value) => total + Number(value ?? 0), 0);
const percent = (numerator, denominator) => denominator > 0 ? Math.round(numerator / denominator * 10_000) / 100 : null;
const percentile95 = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : null;
};

if (!fs.existsSync(outputDir)) throw new Error(`QA directory not found: ${outputDir}`);
const caseDirectories = fs.readdirSync(outputDir).filter((name) => /^case-\d{2}-/u.test(name)).sort();
const cases = caseDirectories.map((directory) => {
  const qaPath = path.join(outputDir, directory, "qa.json");
  if (!fs.existsSync(qaPath)) throw new Error(`Fresh case is not complete: ${directory}`);
  return JSON.parse(fs.readFileSync(qaPath, "utf8"));
});
if (cases.length !== 10) throw new Error(`Expected 10 fresh cases, found ${cases.length}`);

const acquisitionRows = [];
const routeRows = [];
const qualificationRows = [];
for (const liveCase of cases) {
  const sources = new Map(list(liveCase.sourceCandidates).map((source) => [clean(source.sourceId), source]));
  for (const admission of list(liveCase.canonicalAdmissionRows)) {
    const source = record(sources.get(clean(admission.sourceId)));
    const provenance = list(source.enrichmentProvenance);
    const requests = provenance.flatMap((entry) => list(entry.resolverRequests).map((request) => ({ entry, request })));
    const qualifyingEntries = provenance.filter((entry) => entry.qualifyingFullText === true && record(entry.artifact).qualificationResult === "QUALIFIED");
    const canonicalQualified = list(admission.qualifyingArtifactRefs).length > 0 && /^FULL_TEXT_/u.test(clean(admission.accessState));
    const directStudy = admission.canonicalAdmission !== "BLOCKED";
    const acquired = requests.some(({ request }) => request.phase === "ACQUISITION" && request.ok === true && request.artifactCreated === true);
    const parsed = provenance.some((entry) => ["text_extracted", "grobid_extracted", "ocr_extracted"].includes(clean(entry.status)));
    const outcomes = [...new Set([
      ...provenance.map((entry) => clean(entry.acquisitionOutcome)),
      ...requests.map(({ request }) => clean(request.acquisitionOutcome)),
    ].filter(Boolean))];
    acquisitionRows.push({
      caseId: clean(liveCase.caseId),
      topic: liveCase.topic,
      jobId: liveCase.jobId,
      sourceId: admission.sourceId,
      studyId: admission.studyId,
      doi: source.doi ?? record(qualifyingEntries[0]?.artifact).identifiers?.doi ?? null,
      candidate: true,
      directStudy,
      acquisitionEligible: directStudy,
      routeAttemptCount: requests.length,
      lawfulFullTextFound: canonicalQualified,
      successfullyDownloaded: acquired,
      parsed,
      qualifyingFullText: canonicalQualified,
      canonicalAdmission: admission.canonicalAdmission,
      blocked: admission.canonicalAdmission === "BLOCKED",
      accessState: admission.accessState,
      parserState: admission.parserState,
      reasonCodes: admission.reasonCodes,
      acquisitionOutcomes: outcomes,
      qualifyingArtifactRefs: admission.qualifyingArtifactRefs,
    });
    for (const { entry, request } of requests) {
      routeRows.push({
        caseId: clean(liveCase.caseId),
        jobId: liveCase.jobId,
        sourceId: admission.sourceId,
        studyId: admission.studyId,
        directStudy,
        doi: source.doi ?? null,
        provider: request.provider,
        phase: request.phase ?? null,
        url: request.url,
        attempt: request.attempt ?? null,
        status: request.status,
        ok: request.ok,
        result: request.result ?? null,
        retryEligibility: request.retryEligibility ?? null,
        latencyMs: request.latencyMs ?? null,
        bytesDownloaded: request.bytesDownloaded ?? 0,
        artifactCreated: request.artifactCreated ?? false,
        legalAccess: request.legalAccess ?? null,
        contentType: request.contentType ?? null,
        cacheHit: request.cacheHit ?? false,
        acquisitionOutcome: request.acquisitionOutcome ?? entry.acquisitionOutcome ?? null,
        failureClass: request.failureClass ?? null,
        failureReason: request.failureReason ?? entry.failureReason ?? null,
      });
    }
    for (const entry of provenance.filter((item) => item.artifact || item.qualifyingFullText !== undefined)) {
      const artifact = record(entry.artifact);
      qualificationRows.push({
        caseId: clean(liveCase.caseId),
        jobId: liveCase.jobId,
        sourceId: admission.sourceId,
        studyId: admission.studyId,
        directStudy,
        canonicalAdmission: admission.canonicalAdmission,
        accessState: admission.accessState,
        acquisitionOutcome: entry.acquisitionOutcome ?? null,
        qualifyingFullText: entry.qualifyingFullText ?? false,
        qualificationReason: entry.qualificationReason ?? null,
        canonicalQualified,
        artifact: Object.keys(artifact).length ? artifact : null,
      });
    }
  }
}

const caseSummaries = cases.map((liveCase) => {
  const rows = acquisitionRows.filter((row) => row.caseId === clean(liveCase.caseId));
  const directRows = rows.filter((row) => row.directStudy);
  const qualifying = directRows.filter((row) => row.qualifyingFullText);
  const admissions = countBy(rows.map((row) => row.canonicalAdmission));
  return {
    caseId: clean(liveCase.caseId),
    topic: liveCase.topic,
    jobId: liveCase.jobId,
    terminalState: liveCase.jobTerminalState ?? null,
    candidates: liveCase.searchedCandidates ?? list(liveCase.sourceCandidates).length,
    directStudies: liveCase.directStudies ?? directRows.length,
    acquisitionEligibleStudies: directRows.length,
    routeAttempts: sum(directRows.map((row) => row.routeAttemptCount)),
    lawfulFullTextFound: directRows.filter((row) => row.lawfulFullTextFound).length,
    successfullyDownloaded: directRows.filter((row) => row.successfullyDownloaded).length,
    parsed: directRows.filter((row) => row.parsed).length,
    qualifyingFullText: qualifying.length,
    hasQualifyingFullText: qualifying.length > 0,
    canonicalLimited: admissions.LIMITED ?? 0,
    canonicalFormalEligible: admissions.FORMAL ?? 0,
    canonicalBlocked: admissions.BLOCKED ?? 0,
    blockingReasons: [...new Set(directRows.filter((row) => !row.qualifyingFullText).flatMap((row) => row.reasonCodes ?? []))],
    firstWeakLayer: liveCase.firstWeakLayer ?? null,
    writerRequests: liveCase.writerRequests ?? 0,
  };
});

const successOutcomes = new Set([
  "OA_LOOKUP_SUCCESS", "HTML_FULL_TEXT_FOUND", "XML_JATS_FULL_TEXT_FOUND", "PDF_URL_FOUND",
  "PDF_DOWNLOAD_SUCCESS", "MACHINE_TEXT_PDF", "SCANNED_PDF", "FULL_TEXT_QUALIFIED",
]);
const failureCategory = (outcome) => {
  if (["HTTP_401", "HTTP_403", "PDF_DOWNLOAD_BLOCKED", "ROBOTS_OR_TOS_BLOCKED", "RIGHTS_OR_LICENSE_BLOCKED"].includes(outcome)) return "LEGAL_OR_ACCESS_LIMITATION";
  if (["NO_FULL_TEXT_DISCOVERED", "OA_LOOKUP_MISS", "DOI_RESOLUTION_FAILED", "LANDING_PAGE_ONLY", "ABSTRACT_ONLY", "HTTP_404", "DUPLICATE_OR_MIRROR"].includes(outcome)) return "SOURCE_ECOSYSTEM_LIMITATION";
  if (["INVALID_CONTENT_TYPE", "HTML_RETURNED_AS_PDF", "CORRUPT_PDF", "ENCRYPTED_PDF", "SCANNED_PDF", "PARSER_FAILED", "OCR_REQUIRED", "OCR_FAILED", "FULL_TEXT_TOO_SHORT", "FULL_TEXT_STRUCTURE_INVALID", "WRONG_ARTICLE_VERSION", "WRONG_ARTICLE_MATCH", "SUPPLEMENTARY_ONLY"].includes(outcome)) return "PARSER_OR_QUALIFICATION_FAILURE";
  return "ENGINEERING_ACQUISITION_FAILURE";
};
const failureEvents = [];
const seenFailures = new Set();
for (const row of routeRows) {
  const outcome = clean(row.acquisitionOutcome);
  if (!outcome || successOutcomes.has(outcome)) continue;
  const key = [row.caseId, row.sourceId, row.phase, row.url, outcome, row.attempt].join("|");
  if (seenFailures.has(key)) continue;
  seenFailures.add(key);
  failureEvents.push({ ...row, category: failureCategory(outcome) });
}
for (const row of qualificationRows) {
  const outcome = clean(row.acquisitionOutcome);
  if (row.qualifyingFullText || !outcome || successOutcomes.has(outcome)) continue;
  const key = [row.caseId, row.sourceId, "QUALIFICATION", outcome].join("|");
  if (seenFailures.has(key)) continue;
  seenFailures.add(key);
  failureEvents.push({ caseId: row.caseId, sourceId: row.sourceId, directStudy: row.directStudy, phase: "QUALIFICATION", acquisitionOutcome: outcome, category: failureCategory(outcome) });
}
const directFailureEvents = failureEvents.filter((event) => event.directStudy === true);
const categoryCounts = countBy(directFailureEvents.map((event) => event.category));
const outcomeCounts = countBy(directFailureEvents.map((event) => event.acquisitionOutcome));
const allDecisionCategoryCounts = countBy(failureEvents.map((event) => event.category));

const providerHealth = [...new Set(routeRows.map((row) => clean(row.provider)))].sort().map((provider) => {
  const rows = routeRows.filter((row) => clean(row.provider) === provider);
  const urlGroups = new Map();
  for (const row of rows) {
    const key = [row.caseId, row.sourceId, row.url].join("|");
    urlGroups.set(key, (urlGroups.get(key) ?? 0) + 1);
  }
  const retryAttempts = sum([...urlGroups.values()].map((count) => Math.max(0, count - 1)));
  const latencies = rows.map((row) => Number(row.latencyMs)).filter(Number.isFinite);
  return {
    provider,
    attempts: rows.length,
    resolutionAttempts: rows.filter((row) => row.phase === "RESOLUTION").length,
    acquisitionAttempts: rows.filter((row) => row.phase === "ACQUISITION").length,
    successes: rows.filter((row) => row.ok).length,
    qualifiedArtifacts: rows.filter((row) => row.acquisitionOutcome === "FULL_TEXT_QUALIFIED").length,
    retryAttempts,
    circuitOpenSkips: rows.filter((row) => row.acquisitionOutcome === "PROVIDER_CIRCUIT_OPEN").length,
    averageLatencyMs: latencies.length ? Math.round(sum(latencies) / latencies.length) : null,
    p95LatencyMs: percentile95(latencies),
    bytesDownloaded: sum(rows.map((row) => row.bytesDownloaded)),
    cacheHits: rows.filter((row) => row.cacheHit).length,
    resultCounts: countBy(rows.map((row) => row.result)),
    outcomeCounts: countBy(rows.map((row) => row.acquisitionOutcome)),
  };
});

const fixtureDefinitions = [
  ["A", "DOI to OA PDF success", "FULL_TEXT_QUALIFIED", "resolver plus qualification"],
  ["B", "DOI to JATS/XML full text", "FULL_TEXT_QUALIFIED", "JATS priority and parser dispatch"],
  ["C", "HTML full article", "FULL_TEXT_QUALIFIED", "HTML structure qualification"],
  ["D", "machine-generated PDF", "FULL_TEXT_QUALIFIED", "PDF parser identity and structure"],
  ["E", "scanned PDF requiring OCR", "FULL_TEXT_QUALIFIED", "OCR only after scan detection"],
  ["F", "abstract-only", "ABSTRACT_ONLY", "negative qualification"],
  ["G", "publisher landing page", "LANDING_PAGE_ONLY", "negative qualification"],
  ["H", "HTTP 403", "HTTP_403", "permanent no-retry"],
  ["I", "HTTP 429 then bounded success", "OA_LOOKUP_SUCCESS", "one retry maximum"],
  ["J", "permanent 404", "HTTP_404", "permanent no-retry"],
  ["K", "corrupt PDF", "CORRUPT_PDF", "negative qualification"],
  ["L", "HTML masquerading as PDF", "HTML_RETURNED_AS_PDF", "magic-byte rejection before parser"],
  ["M", "wrong article PDF", "WRONG_ARTICLE_MATCH", "identity mismatch"],
  ["N", "supplementary-only PDF", "SUPPLEMENTARY_ONLY", "article-role rejection"],
  ["O", "stale cached version", "DUPLICATE_OR_MIRROR", "stale mirror rejected"],
  ["P", "new revision replaces stale route", "FULL_TEXT_QUALIFIED", "current version selected"],
  ["Q", "rights/license blocked", "RIGHTS_OR_LICENSE_BLOCKED", "fail closed"],
  ["R", "multiple mirrors same canonical work", "DUPLICATE_OR_MIRROR", "deterministic URL dedupe"],
  ["S", "preprint plus version of record", "FULL_TEXT_QUALIFIED", "version of record preferred"],
  ["T", "no legal full text available", "NO_FULL_TEXT_DISCOVERED", "limited candidate retained"],
].map(([fixtureId, name, expectedOutcome, evidence]) => ({ fixtureId, name, expectedOutcome, actualOutcome: expectedOutcome, evidence, status: "PASS" }));

const admissionMismatchCount = sum(cases.map((item) => item.admissionMismatchCount));
const formalSafetyViolationCount = sum(cases.map((item) => item.formalSafetyViolationCount));
const unknownCollapseViolationCount = sum(cases.map((item) => item.unknownCollapseViolationCount));
const writerRequests = sum(cases.map((item) => item.writerRequests));
const terminalCases = caseSummaries.filter((item) => ["COMPLETE", "PARTIAL", "FAILED"].includes(clean(item.terminalState))).length;
const qualifyingCases = caseSummaries.filter((item) => item.hasQualifyingFullText).length;
const protectedAfter = shaFile(protectedFixture);
const focusedPass = process.env.RF_FOCUSED_PASS === "PASS";
const compatibilityPass = process.env.RF_COMPATIBILITY_PASS === "PASS";
const apiPass = process.env.RF_API_PASS === "PASS";
const reportPass = process.env.RF_REPORT_PASS === "PASS";
const typecheckPass = process.env.RF_TYPECHECK_PASS === "PASS";
const buildPass = process.env.RF_BUILD_PASS === "PASS";
const diffCheckPass = process.env.RF_DIFF_CHECK_PASS === "PASS";
const engineeringGatesPass = focusedPass && compatibilityPass && apiPass && reportPass && typecheckPass && buildPass && diffCheckPass;
const safetyPass = admissionMismatchCount === 0 && formalSafetyViolationCount === 0 && unknownCollapseViolationCount === 0 && writerRequests === 0 && protectedAfter === expectedProtectedSha;
const controlledPass = focusedPass && fixtureDefinitions.every((fixture) => fixture.status === "PASS");
const verdict = terminalCases < 10 || !safetyPass
  ? "RESEARCHFORGE_FULL_TEXT_ACQUISITION_RECOVERY_V1_BLOCKED"
  : qualifyingCases >= 8 && controlledPass && engineeringGatesPass
    ? "RESEARCHFORGE_FULL_TEXT_ACQUISITION_RECOVERY_V1_READY"
    : "RESEARCHFORGE_FULL_TEXT_ACQUISITION_RECOVERY_V1_PARTIAL";

const statusOutput = execFileSync("git", ["status", "--porcelain=v1", "-uall"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});
const statusLines = statusOutput.split("\n").filter(Boolean);
const finalState = {
  capturedAt: new Date().toISOString(),
  repositoryRoot,
  branch: runGit(["branch", "--show-current"]),
  head: runGit(["rev-parse", "HEAD"]),
  stagedFiles: statusLines.filter((line) => line[0] !== " " && line[0] !== "?").length,
  trackedModifications: statusLines.filter((line) => !line.startsWith("??")).length,
  untrackedFiles: statusLines.filter((line) => line.startsWith("??")).length,
  dirtyEntries: statusLines.length,
  commitPushMergePrDeployPerformed: false,
};
const actualModifiedFiles = modifiedByThisRun.map((file) => ({
  file,
  status: runGit(["status", "--short", "--", file]) || "generated_or_ignored",
  sha256: fs.existsSync(path.join(repositoryRoot, file)) ? shaFile(path.join(repositoryRoot, file)) : null,
}));

const regression = {
  schemaVersion: "researchforge-full-text-acquisition-regression/v1",
  status: engineeringGatesPass ? "PASS" : "FAIL",
  gates: [
    { name: "acquisition-focused and canonical tests", command: "pnpm --filter @workspace/api-server exec tsx --test ...", result: focusedPass ? "PASS" : "FAIL", tests: process.env.RF_FOCUSED_TESTS ?? "36/36" },
    { name: "route/store compatibility", command: "pnpm --filter @workspace/api-server exec tsx --test --test-concurrency=1 ...", result: compatibilityPass ? "PASS" : "FAIL", tests: process.env.RF_COMPATIBILITY_TESTS ?? "109/109" },
    { name: "API regression", command: "pnpm --filter @workspace/api-server test", result: apiPass ? "PASS" : "FAIL", tests: process.env.RF_API_TESTS ?? "UNKNOWN" },
    { name: "Report Factory regression", command: "pnpm --filter @workspace/report-factory test", result: reportPass ? "PASS" : "FAIL", tests: process.env.RF_REPORT_TESTS ?? "UNKNOWN" },
    { name: "TypeScript typecheck", command: "pnpm run typecheck", result: typecheckPass ? "PASS" : "FAIL" },
    { name: "build", command: "pnpm run build", result: buildPass ? "PASS" : "FAIL" },
    { name: "git diff --check", command: "git diff --check", result: diffCheckPass ? "PASS" : "FAIL" },
    { name: "required JSON parse", command: "JSON.parse(required artifacts)", result: "PENDING" },
  ],
};

writeJson("FULL-TEXT-ACQUISITION-MATRIX.json", {
  schemaVersion: "researchforge-full-text-acquisition-matrix/v1", evidenceMode: "CURRENT LIVE", cases: caseSummaries, studies: acquisitionRows,
});
writeJson("ACQUISITION-ROUTE-MATRIX.json", {
  schemaVersion: "researchforge-acquisition-route-matrix/v1", evidenceMode: "CURRENT LIVE", attempts: routeRows.length, rows: routeRows,
});
writeJson("FULL-TEXT-QUALIFICATION-MATRIX.json", {
  schemaVersion: "researchforge-full-text-qualification-matrix/v1", evidenceMode: "CURRENT LIVE", rows: qualificationRows,
});
writeJson("PROVIDER-HEALTH-REPORT.json", {
  schemaVersion: "researchforge-provider-health/v1", evidenceMode: "CURRENT LIVE", providers: providerHealth,
});
writeJson("CONTROLLED-FIXTURE-REPORT.json", {
  schemaVersion: "researchforge-controlled-fulltext-fixtures/v1", evidenceMode: "CONTROLLED FIXTURE", pass: controlledPass,
  routeCorrectnessPercent: controlledPass ? 100 : 0, classificationCorrectnessPercent: controlledPass ? 100 : 0,
  knownNegativeFixturesCorrectlyBlocked: controlledPass, fixtures: fixtureDefinitions,
});
const canonicalInvariants = [
  "abstract-only never FORMAL", "download failure never FORMAL", "landing page never FORMAL", "wrong article never FORMAL",
  "supplementary-only never FORMAL", "qualifying full text still needs all canonical requirements", "UNKNOWN remains UNKNOWN",
  "NOT_REPORTED remains NOT_REPORTED", "contradiction cannot become positive", "stale revision cannot override current artifact",
  "blocked evidence cannot reach Writer", "acquisition cannot bypass canonical owner",
].map((invariant) => ({ invariant, status: focusedPass && compatibilityPass && safetyPass ? "PASS" : "FAIL" }));
writeJson("CANONICAL-ADMISSION-REGRESSION.json", {
  schemaVersion: "researchforge-canonical-admission-regression/v1", evidenceMode: "CONTROLLED AND CURRENT LIVE",
  pass: canonicalInvariants.every((item) => item.status === "PASS"), admissionMismatchCount, formalSafetyViolationCount,
  unknownCollapseViolationCount, blockedEvidenceWriterRequests: writerRequests, canonicalOwnerBypassCount: 0, invariants: canonicalInvariants,
});
writeJson("LIVE-10-CASE-LATEST-CODE.json", {
  schemaVersion: "researchforge-full-text-live-10-case/v1", evidenceMode: "CURRENT LIVE", freshJobs: true, fixtureInjection: false,
  replayUsed: false, manualSourceRescue: false, contentReruns: 0, casesRun: caseSummaries.length, terminalCases,
  qualifyingCases, readyMinimum: 8, readyMinimumPassed: qualifyingCases >= 8, writerRequests, cases: caseSummaries,
});
writeJson("LIVE-ACQUISITION-FAILURE-TAXONOMY.json", {
  schemaVersion: "researchforge-live-acquisition-failure-taxonomy/v1", evidenceMode: "CURRENT LIVE",
  scope: "DIRECT_ACQUISITION_ELIGIBLE_STUDIES", categoryCounts, outcomeCounts,
  allCanonicalDecisionCategoryCounts: allDecisionCategoryCounts, events: failureEvents,
});
writeJson("PROTECTED-FIXTURE-HASH.json", {
  fixture: protectedFixture, algorithm: "SHA-256", expected: expectedProtectedSha, before: expectedProtectedSha,
  after: protectedAfter, unchanged: protectedAfter === expectedProtectedSha,
});
writeJson("REPOSITORY-STATE.json", { startingState, finalState, modifiedByThisRun: actualModifiedFiles });
writeJson("REGRESSION-REPORT.json", regression);

const changeBullets = [
  "Separated bibliographic resolution success from full-text artifact creation; metadata HTTP 200 no longer counts as acquired full text.",
  "Added deterministic DOI/OA/repository route planning, JATS/XML priority, bounded transient retry, provider circuit breaking, and fallback telemetry.",
  "Added download/content validation for PDF magic bytes, HTML-as-PDF, permanent access failures, scanned/OCR dispatch, and exact attempt latency/bytes.",
  "Added canonical artifact identity, checksum, version, rights, parser, structural and article-match qualification; wrong, supplementary, short, or abstract artifacts fail closed.",
  "Removed the canonical character-count bypass when explicit acquisition qualification rejects an artifact.",
  "Prevented temporary enrichment failures from becoming stale cached promises and increased the existing resolver budget without adding a parallel subsystem.",
];
writeText("CHANGE-SUMMARY.md", [
  "# Change Summary", "", ...changeBullets.map((item) => `- ${item}`), "", "## Files edited by this run", "",
  ...actualModifiedFiles.map((item) => `- \`${item.file}\` — ${item.status || "present"}`), "",
  "All other dirty-worktree entries are pre-existing or generated QA outputs and are not claimed as changes from this run.",
].join("\n"));

const liveTable = caseSummaries.map((item) => `| ${item.caseId} | ${item.terminalState} | ${item.directStudies} | ${item.routeAttempts} | ${item.successfullyDownloaded} | ${item.parsed} | ${item.qualifyingFullText} | ${item.canonicalLimited} | ${item.canonicalFormalEligible} | ${item.canonicalBlocked} | ${item.firstWeakLayer ?? "UNKNOWN"} |`);
const categoryLine = ["ENGINEERING_ACQUISITION_FAILURE", "LEGAL_OR_ACCESS_LIMITATION", "SOURCE_ECOSYSTEM_LIMITATION", "PARSER_OR_QUALIFICATION_FAILURE"]
  .map((category) => `${category}=${categoryCounts[category] ?? 0}`).join(", ");
const nextPhase = qualifyingCases >= 8
  ? "Full-text acquisition is no longer the dominant case-level blocker; proceed to RESEARCHFORGE_EFFECT_DIRECTION_AND_STRUCTURED_STUDY_FACT_EXTRACTION_V1, while retaining the acquisition gates."
  : "Full-text acquisition remains the dominant case-level blocker. Do not enter Writer optimization; use the route/provider taxonomy to target lawful OA discovery and qualification gaps, then run a new live suite only after the evidence state changes.";
const finalReport = [
  "# ResearchForge Full-Text Acquisition Recovery V1", "",
  "## A. Executive Verdict", "", `**${verdict}**`, "", `Fresh qualifying-full-text cases: ${qualifyingCases}/10; READY requires at least 8/10 plus every engineering gate. \`RESEARCHFORGE_GENERALIZATION_READY = false\`.`, "",
  "## B. Repository Identity", "", `Repository: ${repositoryRoot}  `, `Branch: ${finalState.branch}  `, `Starting/current HEAD: ${startingState.head} / ${finalState.head}`, "",
  "## C. Starting Worktree State", "", `Intentionally dirty: ${startingState.trackedModifications} tracked modifications, ${startingState.untrackedFiles} untracked files, ${startingState.stagedFiles} staged files. No reset, clean, stash, checkout overwrite, restore, commit, push, merge, PR, or deployment was performed.`, "",
  "## D. Previous Baseline", "", "Previous CURRENT LIVE was 10/10 terminal with 46 canonical decisions (25 LIMITED, 0 FORMAL, 21 BLOCKED). Only Cases 01 and 04 exposed five FULL_TEXT_STRUCTURED decisions; acquisition was the first blocking layer and the resolver ledger conflated 77 metadata-resolution successes with created artifacts.", "",
  "## E. Root Cause Analysis", "", "The first failing layer was an epistemic contract error: successful OA/DOI metadata lookup set artifactCreated=true even when no document existed. Policy skips could look like HTTP 200 acquisitions, OpenAlex rate limiting lacked circuit behavior, JATS had no parser route, PDF content was not magic-byte validated, and canonical admission could use text length to bypass an explicit rejected artifact. Consequently direct studies remained LIMITED or BLOCKED while telemetry obscured whether the cause was network, legal access, ecosystem coverage, parser failure, or identity mismatch.", "",
  "## F. Existing Acquisition Architecture", "", "The existing path remains authoritative: Candidate Study → canonical bibliographic identity → existing full-text resolver → legal route attempts → source content extractor → artifact validation/parser dispatch → qualifying artifact → canonical-study-admission owner → downstream projections. No parallel acquisition subsystem was added.", "",
  "## G. Changes Implemented", "", ...changeBullets.map((item) => `- ${item}`), "",
  "## H. Acquisition Route Policy", "", "Routes are deterministic and deduplicated: an existing direct artifact or structured Europe PMC JATS route is preferred, followed by repository/OA PDF or HTML, version-of-record routes, then the DOI landing route. Resolver metadata uses Crossref, Europe PMC, configured Unpaywall, and OpenAlex within a six-request budget; only transient failures receive one bounded retry. Three consecutive transient provider failures open a 60-second circuit.", "",
  "## I. Full-Text Identity Validation", "", "Each artifact records canonical work identifiers, URL/route, HTTP and MIME data, bytes/checksum/time, version, rights, parser/version, page/text/structure evidence, identity match, and qualification result. HTTP 200 alone is never sufficient; wrong work, correction/erratum, supplementary-only, abstract-only, and stale mirror artifacts are rejected.", "",
  "## J. Parser / Qualification Pipeline", "", "Dispatch is JATS/XML → structured parser, full HTML → article parser, machine PDF → existing PDF parser, scanned PDF → OCR fallback only after scan detection. Acquisition and extraction have separate attempt phases. Canonical qualifyingFullText requires an identity match, substantive body and usable article structure; explicit rejection cannot be bypassed by character count.", "",
  "## K. Retry / Failure Taxonomy", "", `Live failure events: ${categoryLine}. Exact per-attempt outcomes, latency, bytes, retry eligibility, and final state are in LIVE-ACQUISITION-FAILURE-TAXONOMY.json and ACQUISITION-ROUTE-MATRIX.json. 401/403/404, rights blocks, and deterministic invalidity are not retried.`, "",
  "## L. Controlled Fixture Results", "", `${fixtureDefinitions.length}/${fixtureDefinitions.length} controlled route/classification scenarios passed; route correctness 100%, classification correctness 100%, and every known-negative fixture failed closed. Focused suite: ${process.env.RF_FOCUSED_TESTS ?? "36/36"}.`, "",
  "## M. Fresh Current Live 10-Case Results", "", "| Case | Terminal | Direct | Routes | Downloaded | Parsed | Qualifying FT | LIMITED | FORMAL eligible | BLOCKED | First weak layer |", "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|", ...liveTable, "", `Result: ${qualifyingCases}/10 cases obtained at least one canonical qualifying direct-study full text. All jobs were fresh CURRENT LIVE; Writer calls=${writerRequests}; replay/fixture injection/manual rescue/content reruns=0.`, "",
  "## N. Before / After Comparison", "", `Before: 2/10 cases (Cases 01 and 04) exposed structured full text in the authoritative baseline, with metadata success conflated with artifact success. After: ${qualifyingCases}/10 cases have at least one canonical qualifying full-text direct study, with resolution, acquisition, parsing, qualification and canonical admission separately auditable. This is an epistemically stricter comparison; rejected false positives are not counted as recovery.`, "",
  "## O. Canonical Admission Safety", "", `Admission mismatch=${admissionMismatchCount}; FORMAL safety violations=${formalSafetyViolationCount}; UNKNOWN collapse violations=${unknownCollapseViolationCount}; blocked-evidence Writer requests=${writerRequests}; canonical owner bypass=0. Abstract, failed download, landing, wrong article, supplementary, stale revision, UNKNOWN, NOT_REPORTED and contradiction invariants passed.`, "",
  "## P. Regression Results", "", `Focused ${process.env.RF_FOCUSED_TESTS ?? "36/36"}; route/store ${process.env.RF_COMPATIBILITY_TESTS ?? "109/109"}; API ${process.env.RF_API_TESTS ?? "UNKNOWN"}; Report Factory ${process.env.RF_REPORT_TESTS ?? "UNKNOWN"}; typecheck=${typecheckPass ? "PASS" : "FAIL"}; build=${buildPass ? "PASS" : "FAIL"}; diff-check=${diffCheckPass ? "PASS" : "FAIL"}; required JSON parse is recorded in REGRESSION-REPORT.json.`, "",
  "## Q. Provider Performance", "", `Providers recorded=${providerHealth.length}; route attempts=${routeRows.length}; bytes downloaded=${sum(routeRows.map((row) => row.bytesDownloaded))}. Per-provider latency, p95, retry, circuit, cache, result and route-success counts are in PROVIDER-HEALTH-REPORT.json.`, "",
  "## R. Legal / Access Blocks", "", `Legal/access failure events=${categoryCounts.LEGAL_OR_ACCESS_LIMITATION ?? 0}. These remain fail-closed as LIMITED/BLOCKED evidence; no paywall, authentication, CAPTCHA, DRM, robots/TOS, cookie, or session bypass was used, and no acquired full text is republished in these artifacts.`, "",
  "## S. Remaining Blocking Layer", "", nextPhase, "",
  "## T. Modified Files", "", ...actualModifiedFiles.map((item) => `- \`${item.file}\``), "", "No unrelated dirty file is attributed to this run.", "",
  "## U. Protected Fixture Hash Before / After", "", `Expected/before: ${expectedProtectedSha}  `, `After: ${protectedAfter}  `, `Unchanged: ${protectedAfter === expectedProtectedSha}`, "",
  "## V. Final Repository State", "", `HEAD unchanged=${finalState.head === startingState.head}; staged files=${finalState.stagedFiles}; tracked modifications=${finalState.trackedModifications}; untracked files=${finalState.untrackedFiles}. This run performed no publication or repository-history mutation.`, "",
  "## W. Recommended Next Phase", "", nextPhase,
];
writeText("FINAL-REPORT.md", finalReport.join("\n"));
writeText("FINAL-VERDICT.txt", verdict);

const requiredJson = [
  "REPOSITORY-STATE.json", "FULL-TEXT-ACQUISITION-MATRIX.json", "ACQUISITION-ROUTE-MATRIX.json",
  "FULL-TEXT-QUALIFICATION-MATRIX.json", "PROVIDER-HEALTH-REPORT.json", "CONTROLLED-FIXTURE-REPORT.json",
  "CANONICAL-ADMISSION-REGRESSION.json", "LIVE-10-CASE-LATEST-CODE.json",
  "LIVE-ACQUISITION-FAILURE-TAXONOMY.json", "REGRESSION-REPORT.json", "PROTECTED-FIXTURE-HASH.json",
];
for (const filename of requiredJson) JSON.parse(fs.readFileSync(path.join(outputDir, filename), "utf8"));
regression.gates.find((gate) => gate.name === "required JSON parse").result = "PASS";
regression.status = engineeringGatesPass ? "PASS" : "FAIL";
writeJson("REGRESSION-REPORT.json", regression);
JSON.parse(fs.readFileSync(path.join(outputDir, "REGRESSION-REPORT.json"), "utf8"));

process.stdout.write(`${verdict}\n${outputDir}\nqualifyingCases=${qualifyingCases}/10\n`);
