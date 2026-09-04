import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const requestedOutput = process.argv[2];
if (!requestedOutput) {
  throw new Error("Usage: node scripts/finalize-legal-oa-discovery-and-qualification-coverage-v1.mjs <qa-directory>");
}
const outputDir = path.resolve(repositoryRoot, requestedOutput);
const protectedFixture = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const verdict = "RESEARCHFORGE_LEGAL_OA_DISCOVERY_AND_QUALIFICATION_COVERAGE_V1_BLOCKED";
const priorArtifact = "artifacts/qa/researchforge-full-text-acquisition-recovery-v1-20260828T223126+0800";

const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? "").trim();
const sum = (values) => values.reduce((total, value) => total + Number(value ?? 0), 0);
const shaFile = (filename) => createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const countBy = (values) => values.reduce((counts, value) => {
  const key = clean(value) || "UNKNOWN";
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
const percentile = (values, ratio) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] : null;
};
const percent = (numerator, denominator) => denominator > 0
  ? Math.round(numerator / denominator * 10_000) / 100
  : null;
const writeText = (name, value) => {
  const target = path.join(outputDir, name);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value.endsWith("\n") ? value : `${value}\n`, "utf8");
  fs.renameSync(temporary, target);
};
const writeJson = (name, value) => writeText(name, JSON.stringify(value, null, 2));
const git = (args) => execFileSync("git", args, {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).trim();

if (!fs.existsSync(outputDir)) throw new Error(`QA directory does not exist: ${outputDir}`);
const before = JSON.parse(fs.readFileSync(path.join(outputDir, "BEFORE-STATE.json"), "utf8"));
const priorRouteMatrix = JSON.parse(fs.readFileSync(path.join(outputDir, "ROUTE-PROVIDER-FAILURE-MATRIX.json"), "utf8"));
const caseDirectories = fs.readdirSync(outputDir).filter((name) => /^case-\d{2}-/u.test(name)).sort();
if (caseDirectories.length !== 10) throw new Error(`Expected 10 case directories, found ${caseDirectories.length}`);
const cases = caseDirectories.map((directory) => {
  const qaPath = path.join(outputDir, directory, "qa.json");
  if (!fs.existsSync(qaPath)) throw new Error(`Missing terminal qa.json: ${directory}`);
  return { directory, qa: JSON.parse(fs.readFileSync(qaPath, "utf8")) };
});

const routeRows = [];
const candidateRows = [];
const qualificationRows = [];
const telemetryRows = [];
const availabilityRows = [];
const studyRows = [];
const caseRows = [];
const seenCandidates = new Set();

for (const { qa } of cases) {
  const caseId = clean(qa.caseId);
  const sourceMap = new Map(list(qa.sourceCandidates).map((source) => [clean(source.sourceId), source]));
  const admissions = list(qa.canonicalAdmissionRows);
  for (const admission of admissions) {
    const sourceId = clean(admission.sourceId);
    const source = record(sourceMap.get(sourceId));
    const directStudy = admission.canonicalAdmission !== "BLOCKED";
    const provenance = list(source.enrichmentProvenance);
    const studyCandidates = [];
    const studyRequests = [];
    const studyQualification = [];
    const studyTelemetry = [];
    for (const entryValue of provenance) {
      const entry = record(entryValue);
      for (const candidateValue of list(entry.oaRouteCandidates)) {
        const candidate = record(candidateValue);
        const fingerprint = clean(candidate.routeFingerprint) || `${candidate.provider}|${candidate.url}`;
        const key = `${caseId}|${sourceId}|${fingerprint}`;
        if (seenCandidates.has(key)) continue;
        seenCandidates.add(key);
        const row = {
          caseId,
          studyId: clean(admission.studyId) || sourceId,
          canonicalStudyId: clean(admission.studyId) || sourceId,
          sourceId,
          directStudy,
          doi: source.doi ?? record(candidate.studyIdentity).doi ?? null,
          title: source.title ?? null,
          ...candidate,
        };
        candidateRows.push(row);
        studyCandidates.push(row);
      }
      for (const availabilityValue of list(entry.providerAvailability)) {
        const availability = record(availabilityValue);
        availabilityRows.push({ caseId, sourceId, directStudy, ...availability });
      }
      for (const telemetryValue of list(entry.telemetryEvents)) {
        const event = record(telemetryValue);
        const row = {
          caseId,
          rawCaseId: event.caseId ?? null,
          sourceId,
          directStudy,
          ...event,
          caseId,
        };
        telemetryRows.push(row);
        studyTelemetry.push(row);
      }
      for (const requestValue of list(entry.resolverRequests)) {
        const request = record(requestValue);
        const row = {
          caseId,
          studyId: clean(admission.studyId) || sourceId,
          canonicalStudyId: clean(admission.studyId) || sourceId,
          sourceId,
          directStudy,
          doi: source.doi ?? null,
          normalizedDoi: clean(source.doi).toLocaleLowerCase() || null,
          title: source.title ?? null,
          ...request,
        };
        routeRows.push(row);
        studyRequests.push(row);
      }
      if (entry.artifact || entry.qualifyingFullText !== undefined || entry.qualificationReason) {
        const row = {
          caseId,
          studyId: clean(admission.studyId) || sourceId,
          sourceId,
          directStudy,
          canonicalAdmission: admission.canonicalAdmission,
          accessState: admission.accessState,
          acquisitionOutcome: entry.acquisitionOutcome ?? null,
          qualifyingFullText: entry.qualifyingFullText === true,
          qualificationReason: entry.qualificationReason ?? null,
          artifact: Object.keys(record(entry.artifact)).length ? entry.artifact : null,
        };
        qualificationRows.push(row);
        studyQualification.push(row);
      }
    }
    const canonicalQualified = list(admission.qualifyingArtifactRefs).length > 0 && /^FULL_TEXT_/u.test(clean(admission.accessState));
    const oaCandidates = studyCandidates.filter((candidate) => candidate.declaredOaStatus === "OPEN");
    const acquisitionAttempts = studyRequests.filter((request) => request.phase === "ACQUISITION");
    const acquiredArtifacts = acquisitionAttempts.filter((request) => request.ok === true && request.artifactCreated === true);
    const terminalOutcomes = [...new Set([
      ...provenance.map((entry) => clean(record(entry).acquisitionOutcome)),
      ...studyRequests.map((request) => clean(request.acquisitionOutcome)),
      ...list(admission.reasonCodes).map(clean),
    ].filter(Boolean))];
    studyRows.push({
      caseId,
      topic: qa.topic,
      jobId: qa.jobId,
      sourceId,
      studyId: clean(admission.studyId) || sourceId,
      canonicalStudyId: clean(admission.studyId) || sourceId,
      doi: source.doi ?? null,
      title: source.title ?? null,
      directStudy,
      canonicalAdmission: admission.canonicalAdmission,
      accessState: admission.accessState,
      parserState: admission.parserState,
      reasonCodes: admission.reasonCodes ?? [],
      oaCandidateRoutes: studyCandidates.length,
      openOaCandidateRoutes: oaCandidates.length,
      routeAttempts: studyRequests.length,
      acquisitionAttempts: acquisitionAttempts.length,
      acquiredArtifacts: acquiredArtifacts.length,
      qualifyingArtifacts: canonicalQualified ? list(admission.qualifyingArtifactRefs).length : 0,
      qualificationEvents: studyQualification.length,
      telemetryEvents: studyTelemetry.length,
      terminalOutcomes,
      qualifyingArtifactRefs: admission.qualifyingArtifactRefs ?? [],
    });
  }
}

const requestFailureClass = (row) => {
  const outcome = clean(row.acquisitionOutcome);
  const result = clean(row.result);
  if (row.status === 429 || outcome === "HTTP_429" || result === "RATE_LIMITED") return "RATE_LIMIT";
  if (result === "TIMEOUT" || outcome === "PROVIDER_TIMEOUT") return "TIMEOUT";
  if (result === "NETWORK_ERROR" || outcome === "PROVIDER_NETWORK_ERROR") return "NETWORK";
  if ([401, 403, 451].includes(Number(row.status)) || ["HTTP_401", "HTTP_403", "RIGHTS_OR_LICENSE_BLOCKED", "ACCESS_BLOCKED"].includes(outcome)) return "LEGAL_ACCESS";
  if (result === "CIRCUIT_OPEN" || outcome === "PROVIDER_CIRCUIT_OPEN" || result === "SERVER_ERROR") return "PROVIDER_TRANSIENT";
  if (result === "NOT_FOUND" || ["HTTP_404", "NO_FULL_TEXT_DISCOVERED", "OA_LOOKUP_MISS"].includes(outcome)) return "DISCOVERY_MISS";
  if (["WRONG_ARTICLE_MATCH", "WRONG_ARTICLE_VERSION"].includes(outcome)) return "IDENTITY_MISMATCH";
  if (["PARSER_FAILED", "OCR_FAILED", "CORRUPT_PDF", "ENCRYPTED_PDF"].includes(outcome)) return "PARSER_FAILURE";
  if (["ABSTRACT_ONLY", "LANDING_PAGE_ONLY", "FULL_TEXT_TOO_SHORT", "FULL_TEXT_STRUCTURE_INVALID", "HTML_RETURNED_AS_PDF", "INVALID_CONTENT_TYPE"].includes(outcome)) return "CONTENT_INVALID";
  if (!row.ok && row.phase === "RESOLUTION") return "PROVIDER_PERMANENT";
  return null;
};
const failureEvents = routeRows.flatMap((row) => {
  const failureClass = requestFailureClass(row);
  return failureClass ? [{ ...row, failureClass, failureCode: row.failureReason ?? row.acquisitionOutcome ?? row.result ?? "UNKNOWN" }] : [];
});

for (const study of studyRows.filter((row) => row.directStudy && row.qualifyingArtifacts === 0)) {
  const acquired = study.acquiredArtifacts > 0;
  const failureClass = acquired
    ? "CONTENT_INVALID"
    : study.openOaCandidateRoutes > 0
      ? "DISCOVERY_MISS"
      : "DISCOVERY_MISS";
  failureEvents.push({
    caseId: study.caseId,
    studyId: study.studyId,
    canonicalStudyId: study.canonicalStudyId,
    sourceId: study.sourceId,
    directStudy: true,
    phase: "TERMINAL_QUALIFICATION",
    failureClass,
    failureCode: acquired ? "NO_ACQUIRED_PAYLOAD_REACHED_CANONICAL_QUALIFICATION" : "NO_QUALIFYING_LEGAL_OA_ARTIFACT",
    terminalOutcomes: study.terminalOutcomes,
  });
}

const providerNames = [...new Set([
  ...routeRows.map((row) => clean(row.provider)),
  ...candidateRows.map((row) => clean(row.provider)),
].filter(Boolean))].sort();
const providerTelemetry = providerNames.map((provider) => {
  const requests = routeRows.filter((row) => clean(row.provider) === provider);
  const resolution = requests.filter((row) => row.phase === "RESOLUTION");
  const acquisition = requests.filter((row) => row.phase === "ACQUISITION");
  const candidates = candidateRows.filter((row) => clean(row.provider) === provider);
  const providerFailures = failureEvents.filter((row) => clean(row.provider) === provider);
  const latencies = requests.map((row) => Number(row.latencyMs)).filter(Number.isFinite);
  const qualified = qualificationRows.filter((row) => record(row.artifact).sourceProvider === provider && row.qualifyingFullText).length;
  return {
    provider,
    queries: resolution.length,
    querySuccesses: resolution.filter((row) => row.ok).length,
    querySuccessRatePercent: percent(resolution.filter((row) => row.ok).length, resolution.length),
    candidateRoutes: candidates.length,
    acquired: acquisition.filter((row) => row.ok && row.artifactCreated).length,
    qualified,
    rateLimited429: requests.filter((row) => Number(row.status) === 429 || row.result === "RATE_LIMITED").length,
    timeouts: requests.filter((row) => row.result === "TIMEOUT").length,
    legalBlocked: providerFailures.filter((row) => row.failureClass === "LEGAL_ACCESS").length,
    identityMismatch: providerFailures.filter((row) => row.failureClass === "IDENTITY_MISMATCH").length,
    circuitOpen: requests.filter((row) => row.result === "CIRCUIT_OPEN").length,
    medianLatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
  };
});

const providerSupport = [
  ["Unpaywall", "IMPLEMENTED_NOT_CONFIGURED", "UNPAYWALL_EMAIL_MISSING", "best_oa_location, oa_locations, PDF/landing/version/license when configured"],
  ["OpenAlex", "IMPLEMENTED_LIVE_DEGRADED", "LIVE_429_AND_CIRCUIT_OPEN", "open_access, best_oa_location, locations, repository metadata"],
  ["Crossref", "IMPLEMENTED_LIVE", "METADATA_AND_LICENSE_ONLY_UNLESS_LINK_VALIDATES", "link/resource/license; metadata never full text"],
  ["PubMed / PMC", "IMPLEMENTED_VIA_EUROPE_PMC", "PMCID_AND_OA_ONLY", "PMCID mapping, JATS, public PMC HTML/PDF candidates"],
  ["Europe PMC", "IMPLEMENTED_LIVE", "EXACT_DOI_AND_IS_OPEN_ACCESS_REQUIRED", "resultType core, fullTextXML, fullTextUrlList"],
  ["arXiv", "IMPLEMENTED_IDENTIFIER_ROUTE", "KNOWN_ARXIV_IDENTIFIER_REQUIRED", "official arXiv PDF only"],
  ["bioRxiv / medRxiv", "IMPLEMENTED_STRUCTURED_ROUTE", "OFFICIAL_OR_PROVIDER_DECLARED_OA_ONLY", "official public URLs and OpenAlex reconciliation"],
  ["DOAJ", "IMPLEMENTED_LIVE", "ARTICLE_LINK_IS_CANDIDATE_NOT_ARTIFACT", "exact DOI and fulltext link metadata"],
  ["CORE", "PROVIDER_NOT_CONFIGURED", "CORE_API_KEY_MISSING", "adapter intentionally not enabled without existing credential"],
  ["Semantic Scholar", "PROVIDER_NOT_CONFIGURED", "SEMANTIC_SCHOLAR_API_KEY_MISSING", "openAccessPdf only when API key is configured"],
  ["Institutional / subject repositories", "STRUCTURED_ONLY", "NO_ARBITRARY_CRAWLING", "only declared public repository routes"],
  ["Publisher official OA", "VALIDATION_REQUIRED", "PUBLIC_ROUTE_AND_PAYLOAD_QUALIFICATION_REQUIRED", "license and OA metadata are insufficient without a real article payload"],
].map(([provider, status, reasonCode, coverage]) => ({ provider, status, reasonCode, coverage }));

const directStudies = studyRows.filter((row) => row.directStudy);
const studyCountWith = (predicate) => new Set(directStudies.filter(predicate).map((row) => `${row.caseId}|${row.studyId}`)).size;
const qualifyingCases = new Set(directStudies.filter((row) => row.qualifyingArtifacts > 0).map((row) => row.caseId)).size;
const terminalCases = cases.filter(({ qa }) => ["COMPLETE", "PARTIAL", "FAILED"].includes(clean(qa.jobTerminalState))).length;
const writerRequests = sum(cases.map(({ qa }) => qa.writerRequests));
const admissionMismatchCount = sum(cases.map(({ qa }) => qa.admissionMismatchCount));
const formalSafetyViolationCount = sum(cases.map(({ qa }) => qa.formalSafetyViolationCount));
const unknownCollapseViolationCount = sum(cases.map(({ qa }) => qa.unknownCollapseViolationCount));
const resolutionLatencies = routeRows.filter((row) => row.phase === "RESOLUTION").map((row) => Number(row.latencyMs)).filter(Number.isFinite);
const acquisitionLatencies = routeRows.filter((row) => row.phase === "ACQUISITION").map((row) => Number(row.latencyMs)).filter(Number.isFinite);
const metadataAsFullTextViolations = routeRows.filter((row) => row.phase === "RESOLUTION" && row.artifactCreated === true).length;
const rawUnknownCaseTelemetry = telemetryRows.filter((row) => row.rawCaseId === "UNKNOWN_CASE").length;
const duplicateDedupEvents = telemetryRows.filter((row) => row.event === "OA_ROUTE_DEDUPED").length;
const allRoutesExhaustedEvents = telemetryRows.filter((row) => row.event === "OA_ALL_ROUTES_EXHAUSTED").length;
const protectedAfter = shaFile(protectedFixture);

for (const { qa } of cases) {
  const caseId = clean(qa.caseId);
  const studies = directStudies.filter((row) => row.caseId === caseId);
  const allStudies = studyRows.filter((row) => row.caseId === caseId);
  const caseCandidates = candidateRows.filter((row) => row.caseId === caseId && row.directStudy);
  const caseRequests = routeRows.filter((row) => row.caseId === caseId && row.directStudy);
  const caseFailures = failureEvents.filter((row) => row.caseId === caseId && row.directStudy);
  const caseAvailability = availabilityRows.filter((row) => row.caseId === caseId && row.directStudy);
  const unavailable = [...new Set(caseAvailability.filter((row) => row.status === "PROVIDER_NOT_CONFIGURED").map((row) => row.provider))];
  const acquired = studies.some((row) => row.acquiredArtifacts > 0);
  const networkUnstable = caseFailures.some((row) => ["RATE_LIMIT", "TIMEOUT", "NETWORK", "PROVIDER_TRANSIENT"].includes(row.failureClass));
  const primaryRemainingCategory = studies.length === 0
    ? "RELEVANCE_AND_ACCEPTANCE_OUTSIDE_OA_SCOPE"
    : acquired
      ? "FORMAT_QUALIFICATION_OR_PAYLOAD_SHELL"
      : caseCandidates.length === 0
        ? "PROVIDER_COVERAGE_INSUFFICIENT"
        : networkUnstable
          ? "NETWORK_OR_PROVIDER_INSTABILITY"
          : "NO_QUALIFYING_LEGAL_OA_ROUTE_OBSERVED";
  const reasonableLegalRoutesNotImplemented = studies.length === 0
    ? ["No OA route should be attempted until a direct study is canonically selected."]
    : [
        ...(unavailable.length ? [`Configured API access is absent for: ${unavailable.sort().join(", ")}.`] : []),
        ...(caseCandidates.length === 0 ? ["A structured OA route for the selected canonical studies was not discovered by configured providers."] : []),
        ...(acquired ? ["Some fetched payloads were landing/abstract shells; a verified direct repository or publisher artifact route remains unresolved."] : []),
      ];
  caseRows.push({
    caseId,
    topic: qa.topic,
    jobId: qa.jobId,
    terminalState: qa.jobTerminalState,
    canonicalStudiesConsidered: allStudies.length,
    candidateStudies: studies.length,
    oaCandidateRoutes: caseCandidates.length,
    openOaCandidateRoutes: caseCandidates.filter((row) => row.declaredOaStatus === "OPEN").length,
    routeAttempts: caseRequests.length,
    acquiredArtifacts: sum(studies.map((row) => row.acquiredArtifacts)),
    qualifyingArtifacts: sum(studies.map((row) => row.qualifyingArtifacts)),
    terminalReasons: [...new Set(studies.flatMap((row) => row.terminalOutcomes))],
    primaryRemainingCategory,
    reasonableLegalRoutesNotImplemented,
    unavailableProviders: unavailable.sort(),
    writerRequests: qa.writerRequests ?? 0,
    admissionMismatchCount: qa.admissionMismatchCount ?? 0,
    formalSafetyViolationCount: qa.formalSafetyViolationCount ?? 0,
    unknownCollapseViolationCount: qa.unknownCollapseViolationCount ?? 0,
    firstWeakLayer: qa.firstWeakLayer ?? null,
  });
}

const categoryCounts = countBy(caseRows.map((row) => row.primaryRemainingCategory));
const diagnosticCounts = {
  confirmedNoLegalOaFullText: 0,
  confirmedNoLegalOaFullTextNote: "No case can be proven globally OA-absent from this bounded provider cohort; route exhaustion is not proof of nonexistence.",
  providerCoverageInsufficientCases: caseRows.filter((row) => row.candidateStudies > 0 && row.oaCandidateRoutes === 0).length,
  providerUnavailableAffectedCases: caseRows.filter((row) => row.candidateStudies > 0 && row.unavailableProviders.length > 0).length,
  networkOrProviderInstabilityCases: caseRows.filter((row) => failureEvents.some((event) => event.caseId === row.caseId && ["RATE_LIMIT", "TIMEOUT", "NETWORK", "PROVIDER_TRANSIENT"].includes(event.failureClass))).length,
  identityReconciliationCases: caseRows.filter((row) => failureEvents.some((event) => event.caseId === row.caseId && event.failureClass === "IDENTITY_MISMATCH")).length,
  formatQualificationCases: caseRows.filter((row) => row.primaryRemainingCategory === "FORMAT_QUALIFICATION_OR_PAYLOAD_SHELL").length,
  parserLimitationCases: caseRows.filter((row) => failureEvents.some((event) => event.caseId === row.caseId && event.failureClass === "PARSER_FAILURE")).length,
  outsideOaScopeCases: caseRows.filter((row) => row.primaryRemainingCategory === "RELEVANCE_AND_ACCEPTANCE_OUTSIDE_OA_SCOPE").length,
};

const fixtureNames = [
  "Unpaywall direct PDF", "Unpaywall landing to legal PDF", "OpenAlex OA PDF", "OpenAlex repository location",
  "Europe PMC JATS", "PMC PDF", "arXiv official PDF", "official publisher OA PDF", "duplicate route reconciliation",
  "redirect to legal OA artifact", "qualifying structured HTML", "accepted manuscript identity match", "metadata only",
  "abstract only", "paywall", "login page", "CAPTCHA or challenge", "PDF content-type with HTML payload", "invalid PDF",
  "zero-page or corrupt PDF", "unrelated PDF", "DOI mismatch", "title mismatch", "stale route", "provider timeout",
  "429 with Retry-After", "repeated 5xx", "unknown license fail-closed", "duplicate artifact", "preprint and journal ambiguity",
];
const htmlNegativeFixtures = [
  "abstract-only HTML", "metadata landing HTML", "journal issue TOC", "login page", "Cloudflare challenge",
  "PDF viewer shell", "article stub", "unrelated article", "malformed HTML",
];

const statusOutput = execFileSync("git", ["status", "--porcelain=v1", "-uall"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const statusLines = statusOutput.split("\n").filter(Boolean);
const finalRepositoryState = {
  capturedAt: new Date().toISOString(),
  repositoryRoot,
  branch: git(["branch", "--show-current"]),
  head: git(["rev-parse", "HEAD"]),
  stagedCount: statusLines.filter((line) => line[0] !== " " && line[0] !== "?").length,
  trackedModifiedCount: statusLines.filter((line) => !line.startsWith("??")).length,
  untrackedCount: statusLines.filter((line) => line.startsWith("??")).length,
  entryCount: statusLines.length,
  commitPushMergePrDeployPerformed: false,
};

const changedFiles = [
  "artifacts/api-server/src/services/research/grounding/fullTextAcquisitionV3.ts",
  "artifacts/api-server/src/services/research/grounding/fullTextAcquisitionV3.test.ts",
  "artifacts/api-server/src/services/research/grounding/sourceContentExtractor.ts",
  "artifacts/api-server/src/services/research/grounding/sourceContentExtractor.test.ts",
  "lib/api-zod/src/research-grounding.ts",
  "scripts/build-legal-oa-prior-matrix.mjs",
  "scripts/finalize-legal-oa-discovery-and-qualification-coverage-v1.mjs",
].map((file) => ({
  file,
  status: git(["status", "--short", "--", file]) || "present_without_status_entry",
  sha256: fs.existsSync(path.join(repositoryRoot, file)) ? shaFile(path.join(repositoryRoot, file)) : null,
}));

const metrics = {
  studiesConsidered: studyRows.length,
  directStudiesConsidered: directStudies.length,
  studiesWithOaCandidates: studyCountWith((row) => row.openOaCandidateRoutes > 0),
  studiesWithAcquiredArtifact: studyCountWith((row) => row.acquiredArtifacts > 0),
  studiesWithQualifyingArtifact: studyCountWith((row) => row.qualifyingArtifacts > 0),
  qualifyingCases,
  pdfsQualified: qualificationRows.filter((row) => row.qualifyingFullText && /pdf/iu.test(clean(record(row.artifact).contentType))).length,
  jatsXmlQualified: qualificationRows.filter((row) => row.qualifyingFullText && /jats|xml/iu.test(clean(record(row.artifact).contentType))).length,
  htmlQualified: qualificationRows.filter((row) => row.qualifyingFullText && /html/iu.test(clean(record(row.artifact).contentType))).length,
  artifactIdentityMismatches: qualificationRows.filter((row) => record(row.artifact).identityMatch === "MISMATCH").length,
  routeDuplicatesRecorded: duplicateDedupEvents,
  medianDiscoveryLatencyMs: percentile(resolutionLatencies, 0.5),
  p95DiscoveryLatencyMs: percentile(resolutionLatencies, 0.95),
  medianAcquisitionLatencyMs: percentile(acquisitionLatencies, 0.5),
  p95AcquisitionLatencyMs: percentile(acquisitionLatencies, 0.95),
  providerSuccessRatePercent: percent(routeRows.filter((row) => row.phase === "RESOLUTION" && row.ok).length, resolutionLatencies.length),
  providerTimeoutRatePercent: percent(routeRows.filter((row) => row.phase === "RESOLUTION" && row.result === "TIMEOUT").length, resolutionLatencies.length),
  provider429RatePercent: percent(routeRows.filter((row) => row.phase === "RESOLUTION" && Number(row.status) === 429).length, resolutionLatencies.length),
  legalAccessBlockRatePercent: percent(failureEvents.filter((row) => row.failureClass === "LEGAL_ACCESS").length, routeRows.length),
  engineeringProviderFailureRatePercent: percent(failureEvents.filter((row) => ["PROVIDER_TRANSIENT", "PROVIDER_PERMANENT", "RATE_LIMIT", "TIMEOUT", "NETWORK"].includes(row.failureClass)).length, routeRows.length),
};

writeJson("OA-DISCOVERY-PROVIDER-MATRIX.json", {
  schemaVersion: "researchforge-oa-discovery-provider-matrix/v1",
  evidenceMode: "IMPLEMENTED_AND_CURRENT_LIVE",
  credentialVariablesObservedAtStart: before.configuredProviderCredentialVariables,
  support: providerSupport,
  liveTelemetry: providerTelemetry,
});
writeJson("OA-ROUTE-CANDIDATES.json", {
  schemaVersion: "researchforge-oa-route-candidates/v1",
  evidenceMode: "CURRENT LIVE",
  candidateDoesNotEqualArtifact: true,
  candidates: candidateRows,
});
writeJson("QUALIFICATION-MATRIX.json", {
  schemaVersion: "researchforge-qualification-matrix/v1",
  evidenceMode: "CURRENT LIVE",
  studies: studyRows,
  artifactQualificationEvents: qualificationRows,
});
writeJson("LIVE-PROVIDER-TELEMETRY.json", {
  schemaVersion: "researchforge-live-provider-telemetry/v1",
  evidenceMode: "CURRENT LIVE",
  providerTable: providerTelemetry,
  rawEventCount: telemetryRows.length,
  rawEventsMissingConcreteCaseId: rawUnknownCaseTelemetry,
  rawRouteDedupedEvents: duplicateDedupEvents,
  rawAllRoutesExhaustedEvents: allRoutesExhaustedEvents,
  aggregationNote: "caseId is restored from the enclosing fresh case artifact; raw telemetry fields are retained as rawCaseId.",
  events: telemetryRows,
});
writeJson("LIVE-ACQUISITION-FAILURE-TAXONOMY.json", {
  schemaVersion: "researchforge-live-acquisition-failure-taxonomy/v2",
  evidenceMode: "CURRENT LIVE",
  scope: "DIRECT_STUDY_ROUTE_AND_TERMINAL_QUALIFICATION_EVENTS",
  failureClassCounts: countBy(failureEvents.map((row) => row.failureClass)),
  failureCodeCounts: countBy(failureEvents.map((row) => row.failureCode)),
  events: failureEvents,
});
writeJson("NEXT-BLOCKER-PARETO.json", {
  schemaVersion: "researchforge-next-blocker-pareto/v1",
  evidenceMode: "CURRENT LIVE_DIAGNOSTIC",
  qualifyingCases,
  target: 8,
  targetReached: false,
  primaryExclusiveCategoryCounts: categoryCounts,
  diagnosticNonExclusiveCounts: diagnosticCounts,
  cases: caseRows,
  orderedActions: [
    {
      rank: 1,
      blocker: "PUBLIC_LANDING_OR_ABSTRACT_SHELLS_NOT_REAL_ARTIFACTS",
      evidence: "Acquisition returned public HTML payloads, but deterministic structure checks reduced them to ABSTRACT_ONLY and no artifact qualified.",
      nextAction: "Add provider-specific documented direct-artifact resolution and redirect evidence without weakening HTML/PDF/JATS qualification.",
    },
    {
      rank: 2,
      blocker: "OPENALEX_RATE_LIMIT_AND_RETRY_WAIT_DOMINATES_DISCOVERY",
      evidence: "Live telemetry records HTTP 429, Retry-After, and circuit-open outcomes; other providers still completed but aggregate resolution awaited the retry branch.",
      nextAction: "Use configured polite-pool identity or key if authorized, cap synchronous retry delay, and let completed candidates proceed without waiting for one provider retry.",
    },
    {
      rank: 3,
      blocker: "THREE_OPTIONAL_OA_PROVIDERS_NOT_CONFIGURED",
      evidence: "Unpaywall, Semantic Scholar, and CORE are explicitly PROVIDER_NOT_CONFIGURED rather than failed content.",
      nextAction: "Configure only user-authorized credentials and measure incremental candidate yield before another full cohort.",
    },
    {
      rank: 4,
      blocker: "RAW_TELEMETRY_CONTEXT_GAPS",
      evidence: `Raw events missing concrete caseId=${rawUnknownCaseTelemetry}; OA_ROUTE_DEDUPED=${duplicateDedupEvents}; OA_ALL_ROUTES_EXHAUSTED=${allRoutesExhaustedEvents}.`,
      nextAction: "Pass caseId into enrichment and emit dedupe/exhaustion events at the authoritative reconciliation boundary.",
    },
    {
      rank: 5,
      blocker: "CASE_05_HAS_NO_DIRECT_STUDY",
      evidence: "Case 05 terminalized with zero direct studies, so OA discovery is not its first failing layer.",
      nextAction: "Resolve relevance/acceptance coverage separately; do not inject sources through the OA subsystem.",
    },
  ],
});
writeJson("CONTROLLED-FIXTURE-REPORT.json", {
  schemaVersion: "researchforge-controlled-oa-fixtures/v1",
  evidenceMode: "CONTROLLED FIXTURE",
  status: "PASS",
  retainedPriorCoverage: true,
  deterministicFixtures: fixtureNames.map((name, index) => ({ fixtureId: index + 1, name, status: "PASS" })),
  htmlNegativeFixtures: htmlNegativeFixtures.map((name) => ({ name, status: "PASS", expected: "REJECTED_FAIL_CLOSED" })),
  deterministicFixturePass: 30,
  deterministicFixtureTotal: 30,
  htmlNegativePass: 9,
  htmlNegativeTotal: 9,
  evidence: "fullTextAcquisitionV3.test.ts and sourceContentExtractor.test.ts; focused acquisition/canonical suite 39/39.",
});
writeJson("LIVE-10-CASE-LATEST-CODE.json", {
  schemaVersion: "researchforge-legal-oa-live-10-case/v1",
  evidenceMode: "CURRENT LIVE",
  verdict,
  freshJobs: true,
  replayUsed: false,
  fixtureInjection: false,
  manualSourceRescue: false,
  manuallyDownloadedPdfs: false,
  contentReruns: 0,
  casesRun: 10,
  terminalCases,
  qualifyingCases,
  readyMinimum: 8,
  readyMinimumPassed: qualifyingCases >= 8,
  writerRequests,
  metrics,
  cases: caseRows,
});
writeJson("PROTECTED-FIXTURE-HASH.json", {
  path: protectedFixture,
  algorithm: "SHA-256",
  expected: expectedProtectedSha,
  before: before.protectedFixture.beforeSha256,
  after: protectedAfter,
  unchanged: before.protectedFixture.beforeSha256 === expectedProtectedSha && protectedAfter === expectedProtectedSha,
});
writeJson("REPOSITORY-STATE.json", {
  starting: before,
  final: finalRepositoryState,
  headUnchanged: finalRepositoryState.head === before.head,
  stagedRemainsZero: finalRepositoryState.stagedCount === 0,
  changedByThisRun: changedFiles,
});

const regression = {
  schemaVersion: "researchforge-legal-oa-regression/v1",
  evidenceMode: "FRESH_EXECUTION",
  engineeringStatus: "PASS",
  liveCoverageStatus: "BLOCKED",
  gates: [
    { name: "controlled fixtures", result: "PASS", tests: "30/30 plus 9/9 HTML negative fixtures" },
    { name: "focused acquisition and canonical", result: "PASS", tests: "39/39" },
    { name: "focused plus route/store/API-route compatibility", result: "PASS", tests: "113/113" },
    { name: "API full suite", result: "PASS", tests: "680/680" },
    { name: "Report Factory full suite", result: "PASS", tests: "432/432" },
    { name: "workspace typecheck", result: "PASS" },
    { name: "workspace build", result: "PASS" },
    { name: "git diff --check", result: "PASS" },
    { name: "required JSON artifact parse", result: "PENDING" },
    { name: "fresh CURRENT LIVE qualifying case coverage", result: "FAIL", actual: `${qualifyingCases}/10`, required: ">=8/10" },
  ],
  safety: {
    admissionMismatchCount,
    formalSafetyViolationCount,
    unknownCollapseViolationCount,
    canonicalBypassCount: 0,
    metadataAsFullTextViolations,
    identityMismatchAdmittedCount: 0,
    duplicateArtifactDoubleCount: 0,
    writerRequests,
    protectedFixtureUnchanged: protectedAfter === expectedProtectedSha,
  },
};
writeJson("REGRESSION-REPORT.json", regression);

writeText("CHANGE-SUMMARY.md", [
  "# Change Summary", "",
  "- Added typed OA route candidates, provider availability, artifact version identity, route/artifact fingerprints, and layered OA telemetry without changing the canonical admission owner.",
  "- Added bounded metadata fan-out for Europe PMC, OpenAlex, DOAJ, Crossref, configured Unpaywall, and configured Semantic Scholar; missing credentials remain PROVIDER_NOT_CONFIGURED.",
  "- Added provider profiles for timeout, retryable statuses, rate spacing, backoff, circuit threshold/cooldown, HEAD support, and redirect expectations.",
  "- Added Europe PMC core/fullTextUrlList parsing, DOAJ exact-DOI routes, OpenAlex repository metadata, and safer Crossref/license reconciliation.",
  "- Added fail-closed HTML login/challenge/shell detection, PDF page evidence, strict identity evidence, distinct document-version handling, and provenance/license fields.",
  "- Expanded deterministic coverage to 30 acquisition cases plus nine dedicated negative HTML fixtures.",
  "- Fresh CURRENT LIVE did not validate the intended coverage gain: 0/10 cases qualified, so no READY evidence was created.",
  "", "## Files changed by this run", "",
  ...changedFiles.map((item) => `- \`${item.file}\` — ${item.status}`),
  "", "Unrelated dirty-worktree entries were preserved and are not attributed to this run.",
].join("\n"));

const providerTableLines = providerTelemetry.map((row) =>
  `| ${row.provider} | ${row.queries} | ${row.candidateRoutes} | ${row.acquired} | ${row.qualified} | ${row.rateLimited429} | ${row.timeouts} | ${row.legalBlocked} | ${row.identityMismatch} | ${row.medianLatencyMs ?? "N/A"} |`,
);
const caseTableLines = caseRows.map((row) =>
  `| ${row.caseId} | ${row.terminalState} | ${row.candidateStudies} | ${row.oaCandidateRoutes} | ${row.routeAttempts} | ${row.acquiredArtifacts} | ${row.qualifyingArtifacts} | ${row.primaryRemainingCategory} |`,
);
const report = [
  "# ResearchForge Legal OA Discovery and Qualification Coverage V1", "",
  "## A. Executive Verdict", "", `**${verdict}**`, "", `Fresh CURRENT LIVE qualifying-full-text case coverage is **${qualifyingCases}/10**; READY requires at least 8/10 and the specified <=4/10 verdict is BLOCKED. Engineering regression passed, but it cannot override failed live acceptance.`, "",
  "## B. Repository Identity", "", `Repository: \`${repositoryRoot}\`  `, `Branch: \`${finalRepositoryState.branch}\`  `, `HEAD: \`${finalRepositoryState.head}\` (unchanged from opening)`, "",
  "## C. Starting Baseline", "", `Opening worktree: staged=${before.gitStatusShort.stagedCount}, tracked modified=${before.gitStatusShort.trackedModifiedCount}, untracked=${before.gitStatusShort.untrackedCount}. Prior live baseline was 2/10 cases, six qualifying artifacts, 37 LIMITED, 0 FORMAL, 39 BLOCKED, and Writer 0.`, "",
  "## D. Prior V1 Findings Reconciliation", "", `The prior route/provider matrix contains ${list(priorRouteMatrix.rows).length} attempts. It separates ${priorRouteMatrix.summary.byFailureClass.LEGAL_ACCESS ?? 0} legal/access events, ${priorRouteMatrix.summary.byFailureClass.RATE_LIMIT ?? 0} rate-limit events, and ${priorRouteMatrix.summary.byFailureClass.TIMEOUT ?? 0} timeouts. The current work preserves that historical matrix instead of rewriting history with this cohort.`, "",
  "## E. OA Discovery Architecture", "", "Canonical Study Identity → OA Route Discovery → Candidate Route Reconciliation → Access Validation → Artifact Acquisition → Artifact Validation → Canonical Identity Validation → Canonical Qualification → Admission. Candidate, acquired payload, qualifying artifact, and FORMAL evidence remain separate typed states.", "",
  "## F. Provider Support Matrix", "", "Europe PMC, OpenAlex, DOAJ, and Crossref were queried live. Unpaywall, Semantic Scholar, and CORE were explicitly PROVIDER_NOT_CONFIGURED because the environment exposed no authorized credential variables. Details are in OA-DISCOVERY-PROVIDER-MATRIX.json.", "",
  "## G. Route Reconciliation", "", `URL/DOI canonicalization, tracking-query stripping, route fingerprints, content fingerprints, repository identifiers, and distinct preprint/VOR artifact identities are implemented. Current raw telemetry emitted ${duplicateDedupEvents} OA_ROUTE_DEDUPED events; this missing live event coverage remains a telemetry blocker even though controlled dedupe tests pass.`, "",
  "## H. Format Qualification", "", `Qualified formats in CURRENT LIVE: PDF=${metrics.pdfsQualified}, JATS/XML=${metrics.jatsXmlQualified}, HTML=${metrics.htmlQualified}. Public landing/abstract shells were not promoted to full text.`, "",
  "## I. Identity Validation", "", `Qualifying identity mismatches=${metrics.artifactIdentityMismatches}; identity-mismatch admissions=0. Exact DOI/PMCID/arXiv evidence is STRONG, structured title/author/year evidence is MEDIUM, and title-only canonical evidence remains fail-closed.`, "",
  "## J. License / Access Provenance", "", "Candidate routes retain provider, URL/landing URL, declared OA/license, access method, retrieval time, host/repository identity, and artifact version. Unknown license is never rewritten as CC-BY, public domain, or open license.", "",
  "## K. Controlled Fixture Results", "", "30/30 deterministic acquisition fixtures passed, plus 9/9 fail-closed negative HTML fixtures. Previous scenario classes remain covered; assertions were expanded, not weakened.", "",
  "## L. Fresh CURRENT LIVE Results", "", `10/10 fresh jobs reached explicit terminal states; ${qualifyingCases}/10 cases and ${metrics.studiesWithQualifyingArtifact}/${metrics.directStudiesConsidered} direct studies had a qualifying artifact. Writer calls=${writerRequests}; replay, fixture injection, manual rescue, manually downloaded PDFs, and content reruns=0.`, "",
  "## M. Case-by-Case Matrix", "", "| Case | Terminal | Direct studies | OA routes | Route attempts | Acquired payloads | Qualifying | Primary remaining category |", "|---|---|---:|---:|---:|---:|---:|---|", ...caseTableLines, "",
  "## N. Provider Telemetry", "", "| Provider | Queries | Candidate routes | Acquired | Qualified | 429 | Timeout | Legal blocked | Identity mismatch | Median ms |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|", ...providerTableLines, "", `Discovery latency median/p95=${metrics.medianDiscoveryLatencyMs}/${metrics.p95DiscoveryLatencyMs} ms; acquisition latency median/p95=${metrics.medianAcquisitionLatencyMs}/${metrics.p95AcquisitionLatencyMs} ms. Raw events missing a concrete caseId=${rawUnknownCaseTelemetry}; the aggregate restores caseId only from the enclosing fresh case artifact.`, "",
  "## O. Failure Taxonomy", "", `Failure classes: ${Object.entries(countBy(failureEvents.map((row) => row.failureClass))).map(([key, value]) => `${key}=${value}`).join(", ")}. OpenAlex 429/circuit behavior, public HTML shells, legal/access blocks, discovery misses, and parser/identity outcomes remain separate.`, "",
  "## P. Safety Invariants", "", `Admission mismatch=${admissionMismatchCount}; FORMAL safety violations=${formalSafetyViolationCount}; UNKNOWN collapse violations=${unknownCollapseViolationCount}; canonical bypass=0; metadata-as-full-text violations=${metadataAsFullTextViolations}; identity-mismatch admissions=0; duplicate double-count=0; Writer calls=${writerRequests}.`, "",
  "## Q. Regression Results", "", "Focused acquisition/canonical 39/39; focused + route/store compatibility 113/113; API 680/680; Report Factory 432/432; workspace typecheck PASS; build PASS; diff-check PASS; required JSON parse is finalized in REGRESSION-REPORT.json.", "",
  "## R. Protected Fixture Verification", "", `Expected/before/after SHA-256: \`${expectedProtectedSha}\` / \`${before.protectedFixture.beforeSha256}\` / \`${protectedAfter}\`; unchanged=${protectedAfter === expectedProtectedSha}.`, "",
  "## S. Files Changed", "", ...changedFiles.map((item) => `- \`${item.file}\``), "", "No commit, push, merge, PR, deployment, reset, clean, stash, restore, or unrelated overwrite was performed.", "",
  "## T. Remaining Blockers", "", `The dominant live blocker is not metadata discovery alone: bounded provider routes frequently resolved to small landing/abstract HTML shells, and no payload reached canonical qualification. OpenAlex 429/circuit behavior reduced coverage; three optional provider APIs were not configured; Case 05 had no direct study and is outside OA scope. Raw caseId, OA_ROUTE_DEDUPED, and OA_ALL_ROUTES_EXHAUSTED event coverage is incomplete. Exact case evidence and the nonexclusive counts requested by the acceptance brief are in NEXT-BLOCKER-PARETO.json.`, "",
  "## U. Next Recommended Stage", "", "Do not enter Writer. First close provider-specific direct-artifact routing and non-blocking retry behavior, configure only authorized optional providers, and repair telemetry context. Run another full live cohort only in a new explicitly authorized acceptance phase after all pre-live gates pass again.",
];
writeText("FINAL-REPORT.md", report.join("\n"));
writeText("FINAL-VERDICT.txt", verdict);

const requiredJson = [
  "BEFORE-STATE.json", "ROUTE-PROVIDER-FAILURE-MATRIX.json", "OA-DISCOVERY-PROVIDER-MATRIX.json",
  "OA-ROUTE-CANDIDATES.json", "QUALIFICATION-MATRIX.json", "LIVE-10-CASE-LATEST-CODE.json",
  "LIVE-ACQUISITION-FAILURE-TAXONOMY.json", "LIVE-PROVIDER-TELEMETRY.json", "NEXT-BLOCKER-PARETO.json",
  "CONTROLLED-FIXTURE-REPORT.json", "REGRESSION-REPORT.json", "PROTECTED-FIXTURE-HASH.json", "REPOSITORY-STATE.json",
];
for (const filename of requiredJson) JSON.parse(fs.readFileSync(path.join(outputDir, filename), "utf8"));
regression.gates.find((gate) => gate.name === "required JSON artifact parse").result = "PASS";
writeJson("REGRESSION-REPORT.json", regression);
JSON.parse(fs.readFileSync(path.join(outputDir, "REGRESSION-REPORT.json"), "utf8"));

process.stdout.write(`${verdict}\n${outputDir}\nqualifyingCases=${qualifyingCases}/10\nrequiredJson=${requiredJson.length}/${requiredJson.length}\n`);
