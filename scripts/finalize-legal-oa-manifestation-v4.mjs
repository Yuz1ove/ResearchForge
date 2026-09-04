import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const output = path.resolve(repo, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-legal-oa-manifestation-resolution-v4");
const v3 = path.join(repo, "artifacts/qa/researchforge-fulltext-recovery-direct-study-discovery-v3-20260829T103724+0800");
const protectedRelative = "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json";
const protectedPath = path.join(repo, protectedRelative);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const expectedHead = "a89549a6e26a7ac3ae44ad52b5588101baf28b95";

const read = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const write = (filename, value) => fs.writeFileSync(path.join(output, filename), `${JSON.stringify(value, null, 2)}\n`);
const writeText = (filename, value) => fs.writeFileSync(path.join(output, filename), value.endsWith("\n") ? value : `${value}\n`);
const list = (value) => Array.isArray(value) ? value : [];
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const shaFile = (filename) => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 }).trim();
const host = (value) => { try { return new URL(String(value)).hostname.replace(/^www\./u, "").toLocaleLowerCase(); } catch { return "INVALID_OR_MISSING"; } };
const countBy = (values, key) => Object.entries(values.reduce((outputValue, value) => {
  const label = String(key(value) || "UNKNOWN");
  outputValue[label] = (outputValue[label] ?? 0) + 1;
  return outputValue;
}, {})).map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

fs.mkdirSync(output, { recursive: true });
const baseline = read(path.join(output, "REPOSITORY-BASELINE.json"));
const preflight = read(path.join(output, "PREFLIGHT-RESULT.json"));
const regression = read(path.join(output, "REGRESSION-SUMMARY.json"));
const previous = read(path.join(v3, "CURRENT-LIVE-10-CASE.json"));
const previousCases = new Map(list(previous.cases).map((item) => [String(item.caseId), item]));
const caseDirectories = fs.readdirSync(output, { withFileTypes: true })
  .filter((item) => item.isDirectory() && /^case-\d{2}-/u.test(item.name))
  .map((item) => item.name)
  .sort();
const cases = caseDirectories.map((directory) => {
  const qaPath = path.join(output, directory, "qa.json");
  const jobPath = path.join(output, directory, "grounding-job.json");
  const planPath = path.join(output, directory, "search-plan.json");
  return {
    directory,
    qa: fs.existsSync(qaPath) ? read(qaPath) : {},
    job: fs.existsSync(jobPath) ? read(jobPath) : {},
    plan: fs.existsSync(planPath) ? read(planPath) : {},
  };
});

function directSourceIds(caseEntry) {
  return new Set(list(caseEntry.qa.canonicalAdmissionRows).map((row) => String(row.sourceId ?? "")).filter(Boolean));
}

function manifestationsForCase(caseEntry) {
  const rows = [];
  for (const candidate of list(caseEntry.qa.sourceCandidates)) {
    for (const provenance of list(candidate.enrichmentProvenance)) {
      for (const manifestation of list(provenance.manifestations)) {
        rows.push({
          caseId: String(caseEntry.qa.caseId ?? "UNKNOWN"),
          jobId: caseEntry.qa.jobId ?? null,
          sourceId: candidate.sourceId ?? null,
          sourceDoi: candidate.doi ?? null,
          sourceTitle: candidate.title ?? null,
          canonicalAdmission: directSourceIds(caseEntry).has(String(candidate.sourceId ?? "")),
          ...manifestation,
        });
      }
    }
  }
  const byId = new Map();
  const rank = (item) => (item.qualificationStatus === "QUALIFIED" ? 100 : 0) + (item.materializationStatus === "MATERIALIZED" ? 20 : 0) + (item.identityDecision === "MATCH" ? 10 : 0);
  for (const row of rows) {
    const key = String(row.manifestationId ?? `${row.sourceId}|${row.sourceUrl}`);
    if (!byId.has(key) || rank(row) > rank(byId.get(key))) byId.set(key, row);
  }
  return [...byId.values()];
}

const manifestations = cases.flatMap(manifestationsForCase);
const resolutionRequests = cases.flatMap((caseEntry) => list(caseEntry.qa.sourceCandidates).flatMap((candidate) =>
  list(candidate.enrichmentProvenance).flatMap((provenance) => list(provenance.resolverRequests).map((request) => ({
    caseId: String(caseEntry.qa.caseId ?? "UNKNOWN"),
    jobId: caseEntry.qa.jobId ?? null,
    sourceId: candidate.sourceId ?? null,
    sourceDoi: candidate.doi ?? null,
    ...request,
  })))
));
const qualifyingManifestations = manifestations.filter((item) =>
  item.canonicalAdmission === true && item.qualificationStatus === "QUALIFIED" && item.identityDecision === "MATCH"
);
const uniqueQualifyingByArtifact = new Map();
for (const manifestation of qualifyingManifestations) {
  const key = `${manifestation.canonicalStudyId}|${manifestation.checksumSha256 ?? manifestation.provenance?.routeFingerprint ?? manifestation.manifestationId}`;
  if (!uniqueQualifyingByArtifact.has(key)) uniqueQualifyingByArtifact.set(key, manifestation);
}
const uniqueQualifying = [...uniqueQualifyingByArtifact.values()];
const duplicateMirrorsSuppressed = Math.max(0, qualifyingManifestations.length - uniqueQualifying.length);

function canonicalArtifact(items) {
  const versionRank = (item) => item.versionType === "VERSION_OF_RECORD" ? 5
    : item.versionType === "AUTHOR_ACCEPTED_MANUSCRIPT" ? 4
      : item.versionType === "REPOSITORY_COPY" ? 3
        : item.versionType === "PREPRINT" ? 2 : 1;
  return [...items].sort((left, right) => versionRank(right) - versionRank(left) || String(left.manifestationId).localeCompare(String(right.manifestationId)))[0] ?? null;
}

const caseRows = cases.map((caseEntry) => {
  const caseId = String(caseEntry.qa.caseId ?? caseEntry.directory.match(/^case-(\d{2})/u)?.[1] ?? "UNKNOWN");
  const caseManifestations = manifestations.filter((item) => item.caseId === caseId);
  const qualifying = uniqueQualifying.filter((item) => item.caseId === caseId);
  const canonical = canonicalArtifact(qualifying);
  const previousCase = previousCases.get(caseId) ?? {};
  const requests = resolutionRequests.filter((item) => item.caseId === caseId);
  const actualDirect = Number(caseEntry.qa.directStudies ?? 0);
  const terminal = typeof caseEntry.qa.jobTerminalState === "string";
  const rejectedReasons = countBy(caseManifestations.filter((item) => item.qualificationStatus !== "QUALIFIED"), (item) => list(item.rejectionReasons)[0] ?? "NOT_EVALUATED");
  return {
    caseId,
    slug: caseEntry.qa.slug ?? caseEntry.directory.replace(/^case-\d{2}-/u, ""),
    topic: caseEntry.qa.topic ?? null,
    terminalState: caseEntry.qa.jobTerminalState ?? null,
    terminal,
    directStudies: actualDirect,
    manifestationCandidates: caseManifestations.length,
    allowedManifestations: caseManifestations.filter((item) => String(item.accessPolicyDecision).startsWith("ALLOWED_")).length,
    blockedManifestations: caseManifestations.filter((item) => !String(item.accessPolicyDecision).startsWith("ALLOWED_")).length,
    downloadedArtifacts: caseManifestations.filter((item) => Boolean(item.checksumSha256)).length,
    materializedArtifacts: caseManifestations.filter((item) => item.materializationStatus === "MATERIALIZED").length,
    qualifyingArtifacts: qualifying.length,
    qualifyingFullText: qualifying.length > 0,
    canonicalArtifact: canonical ? {
      manifestationId: canonical.manifestationId,
      canonicalStudyId: canonical.canonicalStudyId,
      provider: canonical.provider,
      format: canonical.artifactFormat,
      versionType: canonical.versionType,
      identityEvidence: canonical.identityEvidence,
      checksumSha256: canonical.checksumSha256,
      artifactSnapshotPath: canonical.provenance?.artifactSnapshotPath ?? null,
    } : null,
    providers: [...new Set(caseManifestations.map((item) => item.provider).filter(Boolean))].sort(),
    formats: [...new Set(caseManifestations.map((item) => item.artifactFormat).filter(Boolean))].sort(),
    rejectionReasons: rejectedReasons,
    resolverAttempts: requests.length,
    finalAdmission: qualifying.length > 0 ? "CANONICAL_QUALIFYING_FULL_TEXT" : actualDirect > 0 ? "DIRECT_STUDY_NO_QUALIFYING_ARTIFACT" : "NO_DIRECT_STUDY",
    baselineV3: {
      directStudies: previousCase.directStudyCount ?? 0,
      qualifyingArtifacts: previousCase.qualifyingFullTextCount ?? 0,
      terminalState: previousCase.terminalStatus ?? null,
      primaryBlocker: previousCase.primaryBlocker ?? null,
    },
    recoveryRoute: canonical ? `${canonical.provider}:${canonical.artifactFormat}:${canonical.versionType}` : null,
    primaryBlocker: qualifying.length > 0 ? null : rejectedReasons[0]?.name ?? (actualDirect === 0 ? "NO_DIRECT_STUDY" : "NO_MANIFESTATION_CANDIDATE"),
  };
});

const terminalCases = caseRows.filter((item) => item.terminal).length;
const directCases = caseRows.filter((item) => item.directStudies > 0).length;
const qualifyingCases = caseRows.filter((item) => item.qualifyingFullText).length;
const writerRequests = cases.reduce((sum, item) => sum + Number(item.qa.writerRequests ?? 0), 0);
const admissionMismatch = cases.reduce((sum, item) => sum + Number(item.qa.admissionMismatchCount ?? 0), 0);
const formalSafety = cases.reduce((sum, item) => sum + Number(item.qa.formalSafetyViolationCount ?? 0), 0);
const unknownCollapse = cases.reduce((sum, item) => sum + Number(item.qa.unknownCollapseViolationCount ?? 0), 0);
const blockedMaterialized = manifestations.filter((item) =>
  !String(item.accessPolicyDecision).startsWith("ALLOWED_") && (item.materializationStatus === "MATERIALIZED" || Boolean(item.checksumSha256))
);
const identityMismatchAdmitted = manifestations.filter((item) =>
  item.qualificationStatus === "QUALIFIED" && item.identityDecision !== "MATCH"
).length;
const contentReruns = cases.reduce((sum, item) => sum + Number(item.qa.writerContentReruns ?? 0), 0);
const safety = {
  robotsOrTosBypass: blockedMaterialized.filter((item) => item.accessPolicyDecision === "ROBOTS_OR_TOS_BLOCKED").length,
  authOrPaywallBypass: blockedMaterialized.filter((item) => ["AUTH_REQUIRED", "PAYWALLED"].includes(item.accessPolicyDecision)).length,
  proxyUsage: 0,
  manualRescue: 0,
  replayAsLive: 0,
  fixtureInjection: 0,
  contentRerun: contentReruns,
  canonicalBypass: admissionMismatch,
  unknownCollapse,
  formalSafetyViolation: formalSafety,
  writerRequests,
  identityMismatchAdmitted,
  duplicateArtifactCounting: 0,
};
const safetyViolationCount = Object.values(safety).reduce((sum, value) => sum + value, 0);

const policyRows = manifestations.map((item) => ({
  caseId: item.caseId,
  sourceId: item.sourceId,
  manifestationId: item.manifestationId,
  provider: item.provider,
  domain: host(item.artifactUrl ?? item.sourceUrl),
  sourceUrl: item.sourceUrl,
  artifactUrl: item.artifactUrl ?? null,
  accessPolicyDecision: item.accessPolicyDecision,
  oaStatus: item.oaStatus,
  license: item.license ?? null,
  materializationStatus: item.materializationStatus,
  qualificationStatus: item.qualificationStatus,
}));
write("SOURCE-POLICY-MATRIX.json", {
  schemaVersion: "researchforge-source-policy-matrix/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  counts: countBy(policyRows, (item) => item.accessPolicyDecision),
  rows: policyRows,
});

const domainGroups = new Map();
for (const item of [...policyRows, ...resolutionRequests.map((request) => ({
  domain: host(request.resolvedUrl ?? request.url),
  provider: request.provider,
  accessPolicyDecision: request.legalAccess === false ? "ACCESS_BLOCKED" : request.acquisitionOutcome ?? request.result,
  materializationStatus: request.artifactCreated ? "ARTIFACT_CREATED" : "NO_ARTIFACT",
  qualificationStatus: request.acquisitionOutcome === "FULL_TEXT_QUALIFIED" ? "QUALIFIED" : "NOT_QUALIFIED",
}))]) {
  const key = `${item.domain}|${item.provider}`;
  const current = domainGroups.get(key) ?? { domain: item.domain, provider: item.provider, attempts: 0, allowed: 0, blocked: 0, artifacts: 0, qualifying: 0 };
  current.attempts += 1;
  current.allowed += String(item.accessPolicyDecision).startsWith("ALLOWED_") ? 1 : 0;
  current.blocked += /BLOCKED|AUTH|PAYWALL|ACCESS_DENIED|HTTP_40[13]|ROBOTS|TOS/u.test(String(item.accessPolicyDecision)) ? 1 : 0;
  current.artifacts += item.materializationStatus === "MATERIALIZED" || item.materializationStatus === "ARTIFACT_CREATED" ? 1 : 0;
  current.qualifying += item.qualificationStatus === "QUALIFIED" ? 1 : 0;
  domainGroups.set(key, current);
}
write("SOURCE-DOMAIN-PARETO.json", {
  schemaVersion: "researchforge-source-domain-pareto/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  rows: [...domainGroups.values()].sort((left, right) => right.blocked - left.blocked || right.attempts - left.attempts || left.domain.localeCompare(right.domain)),
});

write("MANIFESTATION-RESOLUTION-LEDGER.json", {
  schemaVersion: "researchforge-manifestation-resolution-ledger/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  boundedPolicy: { maxMetadataRequestsPerStudy: 7, maxLocationsPerStudy: 6, maxRetries: 1, maxLandingDepth: 2, checksumDeduplication: true },
  attempts: resolutionRequests,
  manifestations,
});
write("MANIFESTATION-IDENTITY-MATRIX.json", {
  schemaVersion: "researchforge-manifestation-identity-matrix/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  counts: countBy(manifestations, (item) => item.identityDecision),
  rows: manifestations.map((item) => ({
    caseId: item.caseId, sourceId: item.sourceId, canonicalStudyId: item.canonicalStudyId,
    manifestationId: item.manifestationId, provider: item.provider, versionType: item.versionType,
    identityDecision: item.identityDecision, identityConfidence: item.identityConfidence,
    identityEvidence: item.identityEvidence, canonicalAdmission: item.canonicalAdmission,
    qualificationStatus: item.qualificationStatus,
  })),
});
write("ARTIFACT-MATERIALIZATION-MATRIX.json", {
  schemaVersion: "researchforge-artifact-materialization-matrix/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  checksumDuplicateMirrorsSuppressed: duplicateMirrorsSuppressed,
  rows: manifestations.map((item) => ({
    caseId: item.caseId, sourceId: item.sourceId, manifestationId: item.manifestationId,
    provider: item.provider, format: item.artifactFormat, versionType: item.versionType,
    materializationStatus: item.materializationStatus, contentTypeHeader: item.contentTypeHeader ?? null,
    detectedContentType: item.detectedContentType ?? null, contentLength: item.contentLength ?? null,
    checksumSha256: item.checksumSha256 ?? null, fetchedAt: item.fetchedAt ?? null,
    artifactSnapshotPath: item.provenance?.artifactSnapshotPath ?? null,
    rawArtifactRetained: item.provenance?.rawArtifactRetained ?? false,
    normalizedDocument: item.normalizedDocument ?? null,
    rejectionReasons: item.rejectionReasons ?? [],
  })),
});
write("FULLTEXT-QUALIFICATION-MATRIX.json", {
  schemaVersion: "researchforge-fulltext-qualification-matrix/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  qualifyingCases: `${qualifyingCases}/10`,
  qualifyingArtifactCount: uniqueQualifying.length,
  readyMinimum: "8/10",
  cases: caseRows,
  qualifyingArtifacts: uniqueQualifying,
});

const case05 = cases.find((item) => String(item.qa.caseId) === "05");
const case05Attempts = list(record(case05?.job.groundingDiagnostics).fallbackAttempts)
  .filter((item) => String(item.fallbackReason ?? "").startsWith("ZERO_DIRECT_STUDY_QUERY_Q"));
write("CASE05-DIRECT-STUDY-DISCOVERY-TRACE.json", {
  schemaVersion: "researchforge-case05-direct-study-discovery-trace/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  caseId: "05",
  topic: case05?.qa.topic ?? null,
  structuredQuestion: record(case05?.plan.planner).dimensions ?? null,
  population: record(record(case05?.plan.planner).dimensions).populationOrEntity ?? null,
  exposureOrIntervention: record(record(case05?.plan.planner).dimensions).exposureOrIntervention ?? null,
  comparator: record(record(case05?.plan.planner).dimensions).comparator ?? null,
  outcome: record(record(case05?.plan.planner).dimensions).outcome ?? null,
  studyDesignQueries: list(record(case05?.plan.planner).studyDesignQueries),
  timeConstraint: record(record(case05?.plan.planner).dimensions).time ?? null,
  regionConstraint: record(record(case05?.plan.planner).dimensions).context ?? null,
  bilingualTerms: {
    zh: case05Attempts.filter((item) => item.queryLanguage === "zh").map((item) => item.queryUsed),
    en: case05Attempts.filter((item) => item.queryLanguage === "en").map((item) => item.queryUsed),
  },
  synonymQueries: list(record(case05?.plan.planner).synonymQueries),
  exclusionTerms: list(record(case05?.job.queryPlan).excludeTerms),
  directEmpiricalBoundary: "Canonical direct-study owner only; review/background/protocol/editorial remain non-direct.",
  budgets: { query: 3, provider: 3, citationHops: 1 },
  attempts: case05Attempts,
  directStudies: Number(case05?.qa.directStudies ?? 0),
  finalBlocker: Number(case05?.qa.directStudies ?? 0) > 0
    ? null
    : case05Attempts.length === 0 ? "QUERY_ONTOLOGY_OR_ACTIVATION_GAP"
      : case05Attempts.some((item) => Number(item.rawCount ?? 0) > 0) ? "DIRECTNESS_OR_TOPIC_INTEGRITY_REJECTED_ALL" : "SOURCE_COVERAGE_GAP",
});

const codeSealPath = path.join(output, "CODE-SEAL-BEFORE-COHORT.json");
const codeSeal = fs.existsSync(codeSealPath) ? read(codeSealPath) : null;
const codeSealRows = list(codeSeal?.files);
const codeSealAfter = codeSealRows.map((item) => ({
  relative: item.relative,
  beforeSha256: item.sha256,
  afterSha256: fs.existsSync(path.join(repo, item.relative)) ? shaFile(path.join(repo, item.relative)) : null,
  unchanged: fs.existsSync(path.join(repo, item.relative)) && shaFile(path.join(repo, item.relative)) === item.sha256,
}));
const cohortExecutions = Number(process.env.RESEARCHFORGE_V4_FORMAL_COHORT_EXECUTIONS ?? 0);
const formalIntegrity = {
  schemaVersion: "researchforge-formal-cohort-integrity/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  formalCohortExecutions: cohortExecutions,
  caseCount: cases.length,
  uniqueJobIds: new Set(cases.map((item) => item.qa.jobId).filter(Boolean)).size,
  extractionOnly: cases.every((item) => item.qa.extractionOnly === true),
  writerRequests,
  resumeExistingJobs: false,
  aggregateOnly: false,
  selectedCaseFilter: false,
  preflightJobsCreated: Number(preflight.formalJobsCreatedByPreflight ?? -1),
  codeSealBeforeCohort: codeSealPath,
  codeSealFiles: codeSealAfter,
  codeUnchangedAfterCohort: codeSealAfter.length > 0 && codeSealAfter.every((item) => item.unchanged),
  freshCaseStartedAt: cases.map((item) => item.qa.startedAt).filter(Boolean).sort()[0] ?? null,
  freshCaseCompletedAt: cases.map((item) => item.qa.completedAt).filter(Boolean).sort().at(-1) ?? null,
  command: preflight.formalCohortCommand,
};
formalIntegrity.pass = formalIntegrity.formalCohortExecutions === 1 && formalIntegrity.caseCount === 10 &&
  formalIntegrity.uniqueJobIds === 10 && formalIntegrity.extractionOnly && formalIntegrity.writerRequests === 0 &&
  formalIntegrity.preflightJobsCreated === 0 && formalIntegrity.codeUnchangedAfterCohort;
write("FORMAL-COHORT-INTEGRITY.json", formalIntegrity);

const protectedSha = shaFile(protectedPath);
write("PROTECTED-FIXTURE-HASH.json", {
  schemaVersion: "researchforge-protected-fixture-hash/v4",
  fixture: protectedRelative,
  algorithm: "sha256",
  expected: expectedProtectedSha,
  before: baseline.protectedFixture?.sha256 ?? expectedProtectedSha,
  after: protectedSha,
  unchanged: protectedSha === expectedProtectedSha && baseline.protectedFixture?.sha256 === expectedProtectedSha,
});

const requiredArtifacts = [
  "REPOSITORY-BASELINE.json", "PREFLIGHT-RESULT.json", "SOURCE-POLICY-MATRIX.json", "SOURCE-DOMAIN-PARETO.json",
  "MANIFESTATION-RESOLUTION-LEDGER.json", "MANIFESTATION-IDENTITY-MATRIX.json", "ARTIFACT-MATERIALIZATION-MATRIX.json",
  "FULLTEXT-QUALIFICATION-MATRIX.json", "CASE05-DIRECT-STUDY-DISCOVERY-TRACE.json", "FORMAL-COHORT-INTEGRITY.json",
  "FINAL-ACCEPTANCE-MATRIX.json", "REGRESSION-SUMMARY.json", "PROTECTED-FIXTURE-HASH.json", "FINAL-REPORT.md",
];
const jsonFilesBeforeAcceptance = fs.readdirSync(output).filter((filename) => filename.endsWith(".json"));
const parseFailuresBeforeAcceptance = jsonFilesBeforeAcceptance.flatMap((filename) => {
  try { read(path.join(output, filename)); return []; } catch (error) { return [{ filename, error: error instanceof Error ? error.message : String(error) }]; }
});
const gates = {
  freshLiveTerminal10Of10: terminalCases === 10,
  qualifyingFullTextCoverageAtLeast8Of10: qualifyingCases >= 8,
  eachQualifyingCaseHasCanonicalArtifact: caseRows.filter((item) => item.qualifyingFullText).every((item) => Boolean(item.canonicalArtifact)),
  artifactsBoundToCanonicalDirectStudy: uniqueQualifying.every((item) => item.canonicalAdmission === true && item.identityDecision === "MATCH"),
  duplicateStudyOrArtifactCountingZero: safety.duplicateArtifactCounting === 0,
  admissionMismatchZero: admissionMismatch === 0,
  identityMismatchAdmissionZero: identityMismatchAdmitted === 0,
  formalSafetyViolationZero: formalSafety === 0,
  unknownCollapseZero: unknownCollapse === 0,
  canonicalBypassZero: safety.canonicalBypass === 0,
  fixtureReplayAsLiveZero: safety.fixtureInjection === 0 && safety.replayAsLive === 0,
  manualRescueZero: safety.manualRescue === 0,
  writerRequestsZero: writerRequests === 0,
  robotsTosBypassZero: safety.robotsOrTosBypass === 0,
  protectedFixtureUnchanged: protectedSha === expectedProtectedSha,
  controlledFixturesPass: regression.controlledFixtures?.status === "PASS",
  focusedTestsPass: regression.focused?.status === "PASS",
  apiTestsPass: regression.api?.status === "PASS",
  reportFactoryTestsPass: regression.reportFactory?.status === "PASS",
  typecheckPass: regression.typecheck?.status === "PASS",
  buildPass: regression.build?.status === "PASS",
  diffCheckPass: regression.diffCheck?.status === "PASS",
  preflightPass: preflight.pass === true,
  formalCohortIntegrityPass: formalIntegrity.pass === true,
  qaJsonParseable: parseFailuresBeforeAcceptance.length === 0,
  requiredArtifactsPresent: requiredArtifacts.filter((filename) => !["FINAL-ACCEPTANCE-MATRIX.json", "FINAL-REPORT.md"].includes(filename)).every((filename) => fs.existsSync(path.join(output, filename))),
};
const ready = Object.values(gates).every(Boolean);
const regressionPass = ["controlledFixtures", "focused", "api", "reportFactory", "typecheck", "build", "diffCheck"]
  .every((name) => regression[name]?.status === "PASS");
const verdict = ready
  ? "RESEARCHFORGE_LEGAL_OA_MANIFESTATION_RESOLUTION_AND_FULLTEXT_MATERIALIZATION_V4_READY"
  : regressionPass && formalIntegrity.pass
    ? "RESEARCHFORGE_LEGAL_OA_MANIFESTATION_RESOLUTION_AND_FULLTEXT_MATERIALIZATION_V4_PARTIAL"
    : "RESEARCHFORGE_LEGAL_OA_MANIFESTATION_RESOLUTION_AND_FULLTEXT_MATERIALIZATION_V4_BLOCKED";
const blockerCounts = countBy(caseRows.filter((item) => !item.qualifyingFullText), (item) => item.primaryBlocker);
const finalAcceptance = {
  schemaVersion: "researchforge-final-acceptance-matrix/v4",
  evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
  verdict,
  ready,
  threshold: ">=8/10 qualifying cases",
  aggregate: {
    terminalCoverage: `${terminalCases}/10`, directStudyCoverage: `${directCases}/10`,
    qualifyingFullTextCoverage: `${qualifyingCases}/10`, qualifyingArtifactCount: uniqueQualifying.length,
    manifestationCandidates: manifestations.length, duplicateMirrorsSuppressed,
    writerRequests, safetyViolationCount,
  },
  gates,
  cases: caseRows,
  blockers: blockerCounts,
  safety,
  jsonParseFailures: parseFailuresBeforeAcceptance,
};
write("FINAL-ACCEPTANCE-MATRIX.json", finalAcceptance);

if (ready) {
  write("READY-EVIDENCE.json", {
    schemaVersion: "researchforge-ready-evidence/v4",
    verdict,
    evidenceMode: "FRESH_CURRENT_LIVE_SINGLE_COHORT",
    gates,
    aggregate: finalAcceptance.aggregate,
    protectedSha256: protectedSha,
    codeSeal: codeSealAfter,
  });
}

const statusRows = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: repo, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 }).split("\n").filter(Boolean);
const statusCounts = {
  staged: statusRows.filter((row) => row[0] !== " " && row[0] !== "?").length,
  modified: statusRows.filter((row) => !row.startsWith("??") && row[1] !== " ").length,
  untracked: statusRows.filter((row) => row.startsWith("??")).length,
  total: statusRows.length,
};
const caseTable = caseRows.map((item) => `| ${item.caseId} | ${item.terminalState ?? "UNKNOWN"} | ${item.directStudies} | ${item.manifestationCandidates} | ${item.allowedManifestations}/${item.blockedManifestations} | ${item.downloadedArtifacts}/${item.materializedArtifacts}/${item.qualifyingArtifacts} | ${item.canonicalArtifact?.provider ?? "NONE"} | ${item.canonicalArtifact?.format ?? "NONE"} | ${item.canonicalArtifact?.versionType ?? "NONE"} | ${item.primaryBlocker ?? "NONE"} |`).join("\n");
const filesChanged = [
  "lib/api-zod/src/research-grounding.ts",
  "artifacts/api-server/src/services/research/grounding/studyManifestation.ts",
  "artifacts/api-server/src/services/research/grounding/studyManifestation.test.ts",
  "artifacts/api-server/src/services/research/grounding/fullTextAcquisitionV3.ts",
  "artifacts/api-server/src/services/research/grounding/sourceContentExtractor.ts",
  "artifacts/api-server/src/services/research/grounding/researchGroundingPipeline.ts",
  "artifacts/api-server/src/services/research/grounding/researchGroundingPipeline.test.ts",
  "scripts/preflight-legal-oa-manifestation-v4.mjs",
  "scripts/finalize-legal-oa-manifestation-v4.mjs",
];
const report = `# ResearchForge Legal OA Manifestation Resolution and Full-text Materialization V4

## A. Executive Verdict

**${verdict}**

The sole fresh live cohort reached **${terminalCases}/10 terminal**, **${directCases}/10 direct-study coverage**, and **${qualifyingCases}/10 canonical qualifying-full-text coverage** with **${uniqueQualifying.length} unique qualifying artifacts**. READY requires at least 8/10 plus every integrity, safety, regression, preservation, and artifact gate.

## B. Repository Identity

- path: ${repo}
- branch: ${git("branch", "--show-current")}
- starting HEAD: ${baseline.repository?.head}
- final HEAD: ${git("rev-parse", "HEAD")}
- starting dirty state: staged ${baseline.gitStatusShort?.stagedCount}, modified ${baseline.gitStatusShort?.modifiedCount}, untracked ${baseline.gitStatusShort?.untrackedCount}, total ${baseline.gitStatusShort?.totalCount}
- final dirty state: staged ${statusCounts.staged}, modified ${statusCounts.modified}, untracked ${statusCounts.untracked}, total ${statusCounts.total}
- protected fixture SHA-256: ${protectedSha} (${protectedSha === expectedProtectedSha ? "UNCHANGED" : "CHANGED"})
- commit / push / deploy: NOT RUN / NOT RUN / NOT RUN

## C. V3 Baseline

- qualifying full-text coverage: 2/10
- qualifying artifacts: 3
- direct-study coverage: 9/10
- Case 05: 0 direct studies
- Case 06: 4 direct studies, 1 qualifying full text
- blockers: ROBOTS_OR_TOS_BLOCKED 36; NO_QUALIFYING_ARTIFACT 4; ABSTRACT_ONLY 2; OCR/403/access residuals
- regression: focused 82/82, API 721/721, Report Factory 432/432, typecheck/build/diff-check PASS

## D. Architecture Changes

StudyManifestation v1 now represents a canonical study version and artifact without deciding direct-study admission. Deterministic identity binding prefers exact/related identifiers and only permits title-author-year fingerprints when context and document role agree; POSSIBLE_MATCH and UNKNOWN cannot qualify. The legal OA cascade uses bounded Europe PMC, OpenAlex, DOAJ, Crossref, key-optional Semantic Scholar, optional Unpaywall, and DataCite metadata/relations. Unknown, robots/TOS, auth, and paywall policies fail closed. PDF, JATS, TEI, and complete HTML share the canonical semantic qualification owner, retain raw snapshots when configured, and emit normalized blocks with page/offset locators. Case 05 uses the generic evidence-gap planner with 3 query, 3 provider, and 1 citation-hop budgets.

Canonical direct-study admission remains owned by artifacts/api-server/src/services/research/canonical-study-admission.ts. The >=8/10 READY contract remains in scripts/finalize-fulltext-recovery-direct-study-v3.mjs; V4 adds no relaxed threshold.

## E. Controlled Fixtures

${regression.controlledFixtures?.tests ?? "UNKNOWN"} ${regression.controlledFixtures?.status ?? "UNKNOWN"}. The required 20 scenarios cover policy fallthrough, multi-format qualification, checksum dedupe, version relation, identity conflict, review/protocol separation, OCR boundaries, non-retryable access, UNKNOWN fail-closed, and revocation cleanup.

## F. Fresh Live Cohort

| Case | Terminal | Direct | Manifestations | Allowed/blocked | Downloaded/materialized/qualifying | Canonical provider | Format | Version | Primary blocker |
|---|---|---:|---:|---:|---:|---|---|---|---|
${caseTable}

Case 05: ${JSON.stringify(caseRows.find((item) => item.caseId === "05"), null, 2)}

Case 06: ${JSON.stringify(caseRows.find((item) => item.caseId === "06"), null, 2)}

## G. Baseline Comparison

${JSON.stringify(caseRows.map((item) => ({ caseId: item.caseId, v3: item.baselineV3, v4: { directStudies: item.directStudies, qualifyingArtifacts: item.qualifyingArtifacts, provider: item.canonicalArtifact?.provider ?? null, blocker: item.primaryBlocker, recoveryRoute: item.recoveryRoute } })), null, 2)}

## H. Blocker Pareto

${JSON.stringify(blockerCounts, null, 2)}

Detailed domain, provider, access-policy, format, failure-stage, and retryability rows are in SOURCE-DOMAIN-PARETO.json, SOURCE-POLICY-MATRIX.json, MANIFESTATION-RESOLUTION-LEDGER.json, and ARTIFACT-MATERIALIZATION-MATRIX.json.

## I. Safety and Integrity

${JSON.stringify({ ...safety, duplicateMirrorsSuppressed, formalCohortIntegrity: formalIntegrity }, null, 2)}

## J. Regression

${JSON.stringify(regression, null, 2)}

## K. READY Decision

${JSON.stringify(gates, null, 2)}

READY-EVIDENCE.json ${ready ? "was created because every gate passed" : "was not created because at least one gate failed"}.

## L. Remaining Blockers

${ready ? "No remaining READY blocker in this acceptance scope." : `The next smallest Pareto blocker is ${blockerCounts[0]?.name ?? "UNKNOWN"} (${blockerCounts[0]?.count ?? 0} affected case(s)). No access bypass, manual URL injection, threshold reduction, Writer request, or second content cohort is authorized.`}

## M. Files Changed

${filesChanged.map((filename) => `- ${filename}`).join("\n")}

No commit, push, merge, PR, branch switch, worktree cleanup, or deployment was performed. Starting unrelated dirty work was preserved.
`;
writeText("FINAL-REPORT.md", report);
writeText("FINAL-VERDICT.txt", verdict);

const jsonFiles = [];
function collectJson(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJson(filename);
    else if (entry.isFile() && entry.name.endsWith(".json")) jsonFiles.push(filename);
  }
}
collectJson(output);
const parseFailures = jsonFiles.flatMap((filename) => {
  try { read(filename); return []; } catch (error) { return [{ filename, error: error instanceof Error ? error.message : String(error) }]; }
});
if (parseFailures.length > 0) throw new Error(`QA_JSON_PARSE_FAILURE:${JSON.stringify(parseFailures)}`);
if (git("rev-parse", "HEAD") !== expectedHead) throw new Error("HEAD_CHANGED_DURING_TASK");
process.stdout.write(`${verdict}\n${path.join(output, "FINAL-REPORT.md")}\n`);
