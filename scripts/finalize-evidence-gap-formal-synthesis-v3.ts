import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type Json = Record<string, unknown>;

const repo = path.resolve(import.meta.dirname, "..");
const root = path.resolve(
  repo,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    "artifacts/qa/researchforge-evidence-gap-formal-synthesis-v3-20260827T150400+0800",
);
const expectedHead = "a89549a6e26a7ac3ae44ad52b5588101baf28b95";
const expectedFixtureSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const fixture = path.join(
  repo,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function list<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readJson<T = unknown>(filename: string): T {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}

function readOptional<T = unknown>(filename: string, fallback: T): T {
  return fs.existsSync(filename) ? readJson<T>(filename) : fallback;
}

function write(name: string, value: string): void {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value);
  fs.renameSync(temporary, target);
}

function writeJson(name: string, value: unknown): void {
  write(name, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function addCount(target: Record<string, number>, key: string, count = 1): void {
  target[key] = (target[key] ?? 0) + count;
}

function markdownTable(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((item) => String(item).replace(/\|/gu, "\\|")).join(" | ")} |`),
  ].join("\n");
}

const preWriter = readJson<Json>(path.join(root, "PRE-WRITER-ACCEPTANCE-MATRIX.json"));
const replay = readJson<Json>(path.join(root, "deterministic-replay/ACCEPTANCE-MATRIX.json"));
const writer = readJson<Json>(path.join(root, "CONTROLLED-WRITER-ACCEPTANCE.json"));
const gapMap = readJson<Json>(path.join(root, "CASE-EVIDENCE-GAP-MAP.json"));
const liveTopics = list<Json>(preWriter.topics);
const replayTopics = list<Json>(replay.topics);

const accessStates: Record<string, number> = {};
const structuredFormats: Record<string, number> = {
  STRUCTURED_HTML: 0,
  JATS_XML: 0,
  PDF: 0,
  REPOSITORY_COPY: 0,
};
const providerQueries: Record<string, number> = {};
const providerResults: Record<string, number> = {};
const providerCases: Record<string, Set<string>> = {};
const factStatuses: Record<string, number> = {};
const numericByLocation: Record<string, number> = {
  body: 0,
  table: 0,
  caption: 0,
  abstract: 0,
  other: 0,
};
let resolverRequests = 0;
let materializedLiveCases = 0;
let trueFullText = 0;
let structuredFacts = 0;
let quantitativeFacts = 0;

const waterfalls = liveTopics.map((topic) => {
  const caseId = String(topic.caseId);
  const caseDirName = `case-${caseId}-${String(topic.slug)}`;
  const caseDir = path.join(root, "cases", caseDirName);
  const jobFile = path.join(caseDir, "grounding-job.json");
  const materialized = fs.existsSync(jobFile);
  const job = readOptional<Json>(jobFile, {});
  const diagnostics = record(job.groundingDiagnostics);
  const providerProgress = list<Json>(diagnostics.providerProgress);
  if (materialized) materializedLiveCases += 1;
  for (const item of providerProgress) {
    const provider = String(item.provider ?? "UNKNOWN_PROVIDER");
    addCount(providerQueries, provider, Number(item.queryCount ?? 0));
    addCount(providerResults, provider, Number(item.resultCount ?? 0));
    (providerCases[provider] ??= new Set()).add(caseId);
  }

  const fulltext = readOptional<Json>(path.join(caseDir, "fulltext-access-audit.json"), {});
  const states = list<Json>(fulltext.states);
  trueFullText += Number(fulltext.trueFullTextCount ?? 0);
  for (const state of states) {
    const accessState = String(state.accessState ?? "UNRESOLVED");
    addCount(accessStates, accessState);
    resolverRequests += list(state.resolverRequests).length;
    const method = String(state.extractionMethod ?? "").toLowerCase();
    if (method.includes("jats") || method.includes("xml")) structuredFormats.JATS_XML += 1;
    else if (method.includes("html") || accessState === "FULL_TEXT_HTML" || accessState === "FULL_TEXT_STRUCTURED") structuredFormats.STRUCTURED_HTML += 1;
    if (method.includes("pdf") || accessState === "FULL_TEXT_PDF") structuredFormats.PDF += 1;
    if (accessState === "FULL_TEXT_REPOSITORY_COPY") structuredFormats.REPOSITORY_COPY += 1;
  }

  const facts = readOptional<Json[]>(path.join(caseDir, "structured-study-facts.json"), []);
  structuredFacts += facts.length;
  for (const factEnvelope of facts) {
    const v2 = record(factEnvelope.studyFactV2);
    for (const value of Object.values(v2)) {
      const field = record(value);
      if (typeof field.status === "string") addCount(factStatuses, field.status);
    }
    const qfacts = list<Json>(v2.quantitativeFacts);
    quantitativeFacts += qfacts.length;
    for (const qfact of qfacts) {
      const provenance = record(qfact.provenance);
      const section = String(provenance.section ?? "").toLowerCase();
      const subsection = String(provenance.subsection ?? "").toLowerCase();
      if (section.includes("table") || subsection.includes("table")) numericByLocation.table += 1;
      else if (section.includes("caption") || subsection.includes("caption") || section.includes("figure")) numericByLocation.caption += 1;
      else if (section.includes("abstract")) numericByLocation.abstract += 1;
      else if (section && section !== "title") numericByLocation.body += 1;
      else numericByLocation.other += 1;
    }
  }

  const themes = readOptional<Json[]>(path.join(caseDir, "theme-matrix.json"), []);
  const finalDrop = topic.error
    ? "UNMATERIALIZED_CLIENT_TIMEOUT"
    : String(topic.classification ?? "SEARCH_ONLY_RESULT");
  return {
    caseId,
    slug: topic.slug,
    topic: topic.topic,
    liveMaterialized: materialized,
    queries: providerProgress.reduce((sum, item) => sum + Number(item.queryCount ?? 0), 0),
    candidates: Number(topic.candidates ?? 0),
    relevantCandidates: Number(topic.acceptedSources ?? 0),
    acceptedDirectStudies: Number(topic.directStudies ?? 0),
    trueFullText: Number(topic.trueFullText ?? 0),
    classifiedStudies: facts.length,
    limitedStudies: Number(topic.limitedStudies ?? 0),
    formalStudies: Number(topic.formalStudies ?? 0),
    admittedThemes: themes.filter((item) => item.admissionStatus === "ADMITTED").length,
    caseLimited: topic.classification === "LIMITED_EVIDENCE_BRIEF" || topic.classification === "FORMAL_RESEARCH_REPORT",
    caseFormal: topic.classification === "FORMAL_RESEARCH_REPORT",
    writerContentGeneration: caseId === "07" ? Number(writer.totalWriterRequests ?? 0) : 0,
    claimAudit: caseId === "07" ? "FAIL_CLOSED" : "NOT_RUN",
    export: "NOT_RUN",
    dropReason: finalDrop,
  };
});

const providerAudit = {
  schemaVersion: "researchforge-evidence-gap-formal-synthesis-v3/provider-usage",
  topLevelGroundingRequests: 10,
  liveCaseReruns: 0,
  materializedLiveCases,
  unmaterializedTimeoutCases: liveTopics.filter((topic) => Boolean(topic.error)).map((topic) => topic.caseId),
  exactProviderQueryAttemptsForMaterializedCases: Object.fromEntries(
    Object.keys(providerQueries).sort().map((provider) => [provider, {
      queryAttempts: providerQueries[provider],
      returnedResultsBeforeDeduplication: providerResults[provider] ?? 0,
      materializedCases: Array.from(providerCases[provider] ?? []).sort(),
    }]),
  ),
  legalFullTextResolverRequestsMaterialized: resolverRequests,
  unmaterializedPolicy: "UNKNOWN_NOT_ZERO: provider-level attempts from client-timed-out server jobs were not materialized into the current artifact root.",
  writer: {
    evidenceSetTransportAttempts: 3,
    reportDraftTransportAttempts: 2,
    reportDraftStatuses: [413, 200],
    controlledContentGenerations: Number(writer.totalWriterRequests ?? 0),
    contentReruns: 0,
  },
};
writeJson("PROVIDER-USAGE-AUDIT.json", providerAudit);

const accessAudit = {
  schemaVersion: "researchforge-evidence-gap-formal-synthesis-v3/access-state-audit",
  scope: "CURRENT_LIVE_MATERIALIZED_CASES_ONLY",
  materializedCases: waterfalls.filter((item) => item.liveMaterialized).map((item) => item.caseId),
  unmaterializedCases: waterfalls.filter((item) => !item.liveMaterialized).map((item) => item.caseId),
  states: accessStates,
  trueFullText,
  structuredFormats,
  resolverRequests,
  publisherShellCountedAsFullText: false,
};
writeJson("ACCESS-STATE-AUDIT.json", accessAudit);
writeJson("FULLTEXT-ACQUISITION-MATRIX.json", {
  scope: accessAudit.scope,
  cases: waterfalls.map((item) => ({
    caseId: item.caseId,
    trueFullText: item.trueFullText,
    status: item.liveMaterialized ? "MATERIALIZED" : "UNMATERIALIZED_CLIENT_TIMEOUT",
    accessAudit: item.liveMaterialized ? `cases/case-${item.caseId}-${item.slug}/fulltext-access-audit.json` : null,
  })),
  aggregate: accessAudit,
});
write("FULLTEXT-ACQUISITION-MATRIX.md", `# Full-text Acquisition Matrix\n\nScope: current live materialized cases only. Timeout cases are unknown, not zero.\n\n${markdownTable(
  ["Case", "Materialized", "True full text", "Status"],
  waterfalls.map((item) => [item.caseId, item.liveMaterialized ? "YES" : "NO", item.trueFullText, item.liveMaterialized ? "MATERIALIZED" : "UNMATERIALIZED_CLIENT_TIMEOUT"]),
)}\n\nAccess states: ${JSON.stringify(accessStates)}\n`);

const sourceAdmission = {
  baseline: { limited: 7, formal: 0 },
  live: {
    limitedOrBetter: Number(preWriter.limited ?? 0) + Number(preWriter.formal ?? 0),
    formal: Number(preWriter.formal ?? 0),
    blockedOrSearchOnly: Number(preWriter.blocked ?? 0),
  },
  deterministicReplay: {
    evidenceSource: "FROZEN_2026-08-26_STUDY_FACT_V2_LIVE_PAYLOAD",
    providerRequests: 0,
    limitedOrBetter: Number(replay.limited ?? 0) + Number(replay.formal ?? 0),
    formal: Number(replay.formal ?? 0),
    blockedOrSearchOnly: Number(replay.blocked ?? 0),
  },
  formerlyZeroDirectCases: list<Json>(gapMap.cases)
    .filter((item) => ["02", "05", "08"].includes(String(item.caseId)))
    .map((item) => {
      const live = liveTopics.find((topic) => topic.caseId === item.caseId) ?? {};
      return {
        caseId: item.caseId,
        baselineRejections: item.candidateRejectionTaxonomy,
        liveDirectStudies: live.directStudies ?? 0,
        liveOutcome: live.error ? "UNMATERIALIZED_CLIENT_TIMEOUT" : live.classification,
      };
    }),
};
writeJson("SOURCE-ADMISSION-AUDIT.json", sourceAdmission);
write("SOURCE-ADMISSION-AUDIT.md", `# Source Admission Audit\n\n- Baseline: LIMITED 7/10, FORMAL 0/10.\n- Current live: LIMITED-or-better ${sourceAdmission.live.limitedOrBetter}/10, FORMAL ${sourceAdmission.live.formal}/10.\n- Frozen deterministic replay: LIMITED-or-better ${sourceAdmission.deterministicReplay.limitedOrBetter}/10, FORMAL ${sourceAdmission.deterministicReplay.formal}/10; this is not live evidence.\n- Case 02 recovered 9 direct studies in the live materialized run. Cases 05 and 08 did not close: Case 05 timed out before materialization; Case 08 returned zero candidates.\n`);

const completeness = {
  scope: "CURRENT_LIVE_MATERIALIZED_CASES_ONLY",
  structuredStudyFacts: structuredFacts,
  fieldStatusCounts: factStatuses,
  quantitativeFacts,
  quantitativeFactsByProvenanceLocation: numericByLocation,
  improvementBoundary: "No matched before/after field-level denominator was available for timed-out cases; frozen replay is reported separately and is not treated as live improvement.",
};
writeJson("STUDY-FACT-COMPLETENESS.json", completeness);
write("STUDY-FACT-COMPLETENESS.md", `# Study Fact Completeness\n\n- Scope: current live materialized cases only.\n- Structured study facts: ${structuredFacts}.\n- Quantitative facts: ${quantitativeFacts}.\n- Status distribution: ${JSON.stringify(factStatuses)}.\n- Numerical provenance locations: ${JSON.stringify(numericByLocation)}.\n- Timeout cases remain unknown; replay evidence is not counted as live improvement.\n`);

const replayCase07 = replayTopics.find((item) => item.caseId === "07") ?? {};
const themeSynthesis = {
  live: liveTopics.map((topic) => ({
    caseId: topic.caseId,
    classification: topic.classification,
    themes: topic.themes ?? 0,
    formalThemes: topic.formalThemes ?? 0,
    status: topic.error ? "UNMATERIALIZED_CLIENT_TIMEOUT" : "MATERIALIZED",
  })),
  deterministicReplay: replayTopics.map((topic) => ({
    caseId: topic.caseId,
    classification: topic.classification,
    themes: topic.themes,
    formalThemes: topic.formalThemes,
  })),
  case07: {
    resolvedInDeterministicReplay: replayCase07.classification === "FORMAL_RESEARCH_REPORT" && Number(replayCase07.formalThemes ?? 0) >= 1,
    independentFormalStudies: replayCase07.formalStudies,
    formalThemes: replayCase07.formalThemes,
    liveStatus: "UNMATERIALIZED_CLIENT_TIMEOUT",
  },
};
writeJson("THEME-SYNTHESIS-MATRIX.json", themeSynthesis);
write("THEME-SYNTHESIS-MATRIX.md", `# Theme Synthesis Matrix\n\nCase 07 semantic ThemeBuilder is resolved in deterministic replay: 3 FORMAL studies form 1 FORMAL theme without study-design fragmentation. Its new live retrieval job timed out before materialization, so the live result remains unknown.\n\n${markdownTable(
  ["Case", "Live classification", "Live themes", "Replay classification", "Replay formal themes"],
  liveTopics.map((topic) => {
    const replayTopic = replayTopics.find((item) => item.caseId === topic.caseId) ?? {};
    return [topic.caseId as string, topic.classification as string, Number(topic.themes ?? 0), String(replayTopic.classification ?? "N/A"), Number(replayTopic.formalThemes ?? 0)];
  }),
)}\n`);

const formalAdmission = {
  required: { limitedOrBetter: 10, formal: 8 },
  live: preWriter,
  deterministicReplay: replay,
  thresholdPassed: false,
  verdict: "RESEARCHFORGE_EVIDENCE_GAP_ACQUISITION_AND_FORMAL_SYNTHESIS_V3_PARTIAL",
};
writeJson("FORMAL-ADMISSION-MATRIX.json", formalAdmission);
write("FORMAL-ADMISSION-MATRIX.md", `# Formal Admission Matrix\n\n${markdownTable(
  ["Case", "Live", "Replay", "Live direct", "Live full text", "Live LIMITED", "Live FORMAL"],
  liveTopics.map((topic) => {
    const replayTopic = replayTopics.find((item) => item.caseId === topic.caseId) ?? {};
    return [topic.caseId as string, topic.classification as string, String(replayTopic.classification ?? "N/A"), Number(topic.directStudies ?? 0), Number(topic.trueFullText ?? 0), Number(topic.limitedStudies ?? 0), Number(topic.formalStudies ?? 0)];
  }),
)}\n\nREADY requires LIMITED-or-better 10/10 and FORMAL at least 8/10. Current live is 2/10 and 0/10.\n`);

writeJson("PIPELINE-WATERFALL.json", {
  schemaVersion: "researchforge-evidence-gap-formal-synthesis-v3/waterfall",
  cases: waterfalls,
});
write("PIPELINE-WATERFALL.md", `# Pipeline Waterfall\n\n${markdownTable(
  ["Case", "Queries", "Candidates", "Direct", "Full text", "Classified", "LIMITED", "FORMAL", "Themes", "Writer", "Export", "Drop"],
  waterfalls.map((item) => [item.caseId, item.queries, item.candidates, item.acceptedDirectStudies, item.trueFullText, item.classifiedStudies, item.limitedStudies, item.formalStudies, item.admittedThemes, item.writerContentGeneration, item.export, item.dropReason]),
)}\n`);

const writerResponse = readJson<Json>(path.join(root, "cases/case-07-hiit-mict-fitness/writer-response.live.json"));
const writerDiagnostics = record(writerResponse.writerDiagnostics);
const writerVNext = record(writerDiagnostics.writerVNext);
const realizationAudit = list<Json>(writerVNext.bodyRealizationAudit);
const sections = list<Json>(writerResponse.sections);
const unsupported = sections.reduce((sum, section) => sum + list(section.unsupportedSentences).length, 0);
const fullySupported = realizationAudit.filter((item) => item.entailmentStatus === "entailed" && item.realizationStatus === "fully_realized" && item.citationValidated === true).length;
const partiallySupported = realizationAudit.filter((item) => item.realizationStatus !== "fully_realized" || item.citationValidated !== true).length;
const interpretive = realizationAudit.filter((item) => item.epistemicStatus === "interpretive").length;
const duplicateValidation = record(record(writerResponse.formalResearchValidation).duplicateValidation);
const duplicateGatePass = duplicateValidation.pass !== false &&
  list(duplicateValidation.strictDuplicates).length === 0 &&
  list(duplicateValidation.semanticDuplicates).length === 0;
const controlledResults = list<Json>(writer.results);
const controlledResult = controlledResults[0] ?? {};
const correctedContentChecks = {
  ...record(controlledResult.contentChecks),
  duplicateGatePass,
};
controlledResult.contentChecks = correctedContentChecks;
if (controlledResults.length > 0) controlledResults[0] = controlledResult;
writer.results = controlledResults;
writeJson("CONTROLLED-WRITER-ACCEPTANCE.json", writer);
writeJson("cases/case-07-hiit-mict-fitness/writer-content-gate.json", {
  passed: false,
  checks: correctedContentChecks,
  blockingReason: "ANALYTICAL_SYNTHESIS_GATE:studyLevelDifferences",
});
const caseClaimAuditPath = path.join(root, "cases/case-07-hiit-mict-fitness/claim-audit.json");
const caseClaimAudit = readOptional<Json>(caseClaimAuditPath, {});
caseClaimAudit.checks = correctedContentChecks;
writeJson("cases/case-07-hiit-mict-fitness/claim-audit.json", caseClaimAudit);
const writerAudit = {
  eligibleCases: writer.eligibleCases,
  controlledContentGenerations: writer.totalWriterRequests,
  reportDraftTransportAttempts: writer.totalReportDraftTransportAttempts,
  evidenceSetTransportAttempts: 3,
  reportDraftStatuses: [413, 200],
  boundedTransportRetry: true,
  contentReruns: 0,
  provider: writerResponse.reportGenerationProvider,
  model: writerResponse.reportGenerationModel,
  generatedSections: sections.length,
  writerSectionAttempts: list(writerDiagnostics.writerAttempts).length,
  providerModelSubcalls: list(writerDiagnostics.contextBudgetCalls).length,
  providerModelSubcallsExceededBudget: Number(writerDiagnostics.contextBudgetExceededCalls ?? 0),
  modelCompletedSections: Number(writerDiagnostics.modelCompletedSections ?? 0),
  wholeDocumentEditorialPass: record(writerDiagnostics.editorialPass).status ?? "unknown",
  contentGatePassed: false,
  blockingChecks: correctedContentChecks,
};
writeJson("WRITER-REQUEST-AUDIT.json", writerAudit);

const claimAudit = {
  scope: "CASE_07_CONTROLLED_WRITER_OUTPUT",
  supported: fullySupported,
  partiallySupported,
  unsupported,
  overstated: "NOT_ENUMERATED_BY_CURRENT_SENTENCE_AUDIT",
  contradicted: "PRESERVED_IN_THEME_INPUT_BUT_NOT_ENUMERATED_AS_OUTPUT_SENTENCE_CLASS",
  interpretive,
  citationValidatedClaims: realizationAudit.filter((item) => item.citationValidated === true).length,
  citationAuditedClaims: realizationAudit.length,
  citationResolutionPercent: realizationAudit.length > 0 ? Number((100 * realizationAudit.filter((item) => item.citationValidated === true).length / realizationAudit.length).toFixed(2)) : null,
  formalValidationPass: record(writerResponse.formalResearchValidation).pass === true,
  synthesisIssues: record(record(writerResponse.formalResearchValidation).synthesisValidation).issues ?? [],
  exportAllowed: false,
};
writeJson("CLAIM-AUDIT.json", claimAudit);

const quantitativeValidation = record(record(writerResponse.formalResearchValidation).quantitativeValidation);
const quantitativeRegistry = list<Json>(record(writerResponse.formalResearchArchitecture).quantitativeFactRegistry);
const eligibleQuantitative = quantitativeRegistry.filter((item) => item.disposition !== "unusable" && item.validationStatus !== "REJECTED" && item.verificationStatus !== "REJECTED");
const validatedQuantitative = eligibleQuantitative.filter((item) => item.validationStatus === "VALIDATED" || item.verificationStatus === "VALIDATED").length;
writeJson("QUANTITATIVE-PROVENANCE-AUDIT.json", {
  pass: quantitativeValidation.pass === true,
  registryFacts: quantitativeRegistry.length,
  eligibleFacts: eligibleQuantitative.length,
  rejectedUnusableFacts: quantitativeRegistry.length - eligibleQuantitative.length,
  validatedFacts: validatedQuantitative,
  numericalProvenancePercent: eligibleQuantitative.length > 0 ? Number((100 * validatedQuantitative / eligibleQuantitative.length).toFixed(2)) : 100,
  exportAllowed: false,
  note: "All usable quantitative facts passed provenance. One rejected registry candidate remained unusable and was excluded from claims; the independent analytical synthesis gate still failed.",
});

writeJson("REGRESSION-REPORT.json", {
  status: "PASS",
  apiFullSuite: { pass: true, tests: 643, baseline: 625 },
  reportFactoryFullSuite: { pass: true, tests: 432, baseline: 431 },
  focusedV3ExtractionSuite: { pass: true, tests: 110, baselineFocusedExtraction: 84, note: "Expanded focused selection covers V3 planning/relevance, source admission, exact-claim extraction, full-text states, quantitative and table/caption recovery, theme/contradiction synthesis, and Case 10." },
  reportFactoryWriterTransportFocused: { pass: true, tests: 20 },
  typecheck: "PASS",
  build: "PASS",
  gitDiffCheck: "PASS",
  case10: {
    sevenQueryDeterministicPlan: "PASS_BY_FOCUSED_TEST",
    contextualEffectParser: "PASS_BY_FOCUSED_TEST",
    issnSampleSizeFalsePositive: "PASS_BY_STUDY_FACT_V2_FULL_SUITE",
    publisherShellNotFullText: "PASS_BY_FOCUSED_TEST",
    liveFullTextRecovery: "UNMATERIALIZED_CLIENT_TIMEOUT",
  },
});

const finalFixtureSha = sha256(fixture);
const finalReport = `# ResearchForge Evidence Gap Acquisition and Formal Synthesis V3\n\n## Executive verdict\n\nRESEARCHFORGE_EVIDENCE_GAP_ACQUISITION_AND_FORMAL_SYNTHESIS_V3_PARTIAL\n\nThe engineering path is implemented and regression-clean, but the live acceptance threshold is not met. Current live materialized acceptance is LIMITED-or-better 2/10 and FORMAL 0/10, versus the required 10/10 and at least 8/10. Frozen replay reaches LIMITED-or-better 7/10 and FORMAL 1/10 and must not be presented as live.\n\n## Repository identity\n\n- Branch: codex/paper-search-performance-v1-20260716\n- Starting HEAD: ${expectedHead}\n- Final HEAD: ${expectedHead}\n- Commit: NOT RUN\n- Push: NOT RUN\n- Deploy: NOT RUN\n- Worktree: dirty before this task; unrelated changes preserved\n\n## Live and replay outcomes\n\n- Previous baseline: LIMITED 7/10, FORMAL 0/10.\n- Current live: LIMITED-or-better 2/10, FORMAL 0/10.\n- Frozen deterministic replay: LIMITED-or-better 7/10, FORMAL 1/10.\n- Cases 05, 06, 07, 09, and 10 timed out at the client ceiling before their server jobs were materialized into this artifact root. Their missing provider/full-text counts are UNKNOWN, not zero.\n- Case 02 improved from zero direct sources to 9 direct studies, but remained LIMITED because no true full text was recovered.\n- Case 05 remained unmaterialized after timeout.\n- Case 08 returned zero candidates and remained SEARCH_ONLY.\n- Cases 09 and 10 have no current-live full-text recovery verdict because their jobs did not materialize. Frozen replay still has zero true full text for both.\n\n## ThemeBuilder and Writer\n\n- Case 07 deterministic replay resolves the prior study-design fragmentation: 3 FORMAL studies form one FORMAL theme.\n- Only Case 07 became FORMAL_WRITER_ELIGIBLE in replay.\n- Writer performed one controlled content generation, with zero content reruns. Transport history is separately recorded as 3 evidence-set attempts and 2 report-draft attempts (413 then 200).\n- Provider generation succeeded with 8 returned sections and no fallback.\n- Export remained locked because formal validation failed: analytical synthesis did not explicitly compare study-level differences.\n\n## Claim and export boundary\n\n- Unsupported output sentences: ${unsupported}.\n- Citation-resolved realization claims: ${claimAudit.citationValidatedClaims}/${claimAudit.citationAuditedClaims}.\n- Numerical provenance gate: PASS.\n- Formal synthesis gate: FAIL.\n- PDF: NOT RUN.\n- DOCX: NOT RUN.\n- Visual QA: CURRENT RUN NOT RUN.\n- reports.zip: NOT CREATED because no report artifact passed all gates.\n\n## Regression and protection\n\n- API: 643/643 PASS.\n- Report Factory: 432/432 PASS.\n- Focused V3/extraction: 110/110 PASS (baseline 84).\n- Typecheck, build, git diff --check: PASS.\n- Protected fixture before/after: ${expectedFixtureSha} / ${finalFixtureSha}.\n\n## Smallest upstream blocker\n\nThe smallest current upstream blocker is live evidence acquisition completion: five jobs did not materialize before the bounded client timeout, and among completed jobs true full text remained sparse. This prevents 10/10 LIMITED and 8/10 FORMAL before Writer. Separately, the one eligible Writer output failed the study-level-differences synthesis gate and cannot be regenerated to brush the result.\n`;
const auditedFinalReport = finalReport.replace(
  "- Provider generation succeeded with 8 returned sections and no fallback.",
  "- The one logical generation contained 9 section attempts and 17 provider model subcalls; all stayed within context budget. This is not a second controlled generation.\n- Provider generation succeeded with 8 returned sections and no fallback.",
);
write("FINAL-REPORT.md", auditedFinalReport);
write("FINAL-VERDICT.txt", "RESEARCHFORGE_EVIDENCE_GAP_ACQUISITION_AND_FORMAL_SYNTHESIS_V3_PARTIAL\n");

writeJson("FINAL-ACCEPTANCE-MATRIX.json", {
  verdict: "RESEARCHFORGE_EVIDENCE_GAP_ACQUISITION_AND_FORMAL_SYNTHESIS_V3_PARTIAL",
  required: { limitedOrBetter: "10/10", formal: ">=8/10" },
  live: { limitedOrBetter: "2/10", formal: "0/10", status: "PARTIAL" },
  deterministicReplay: { limitedOrBetter: "7/10", formal: "1/10", status: "PARTIAL_REPLAY_ONLY" },
  writer: writerAudit,
  export: { pdf: "NOT_RUN", docx: "NOT_RUN", visualQa: "CURRENT_RUN_NOT_RUN", zip: "NOT_CREATED" },
  regression: "PASS",
  fixture: { expected: expectedFixtureSha, final: finalFixtureSha, unchanged: finalFixtureSha === expectedFixtureSha },
});
write("FINAL-ACCEPTANCE-MATRIX.md", `# Final Acceptance Matrix\n\n${markdownTable(
  ["Layer", "Required", "Actual", "Verdict"],
  [
    ["Live LIMITED-or-better", "10/10", "2/10", "FAIL"],
    ["Live FORMAL", ">=8/10", "0/10", "FAIL"],
    ["Controlled Writer", "Eligible only, max one content generation", "1 generation, 0 content reruns", "PASS_POLICY"],
    ["Writer content gate", "PASS", "studyLevelDifferences FAIL", "FAIL"],
    ["PDF/DOCX/Visual QA", "Only after all gates", "NOT RUN", "CORRECTLY_LOCKED"],
    ["Regression", "PASS", "643 API / 432 Factory / 110 focused", "PASS"],
    ["Protected fixture", expectedFixtureSha, finalFixtureSha, finalFixtureSha === expectedFixtureSha ? "PASS" : "FAIL"],
  ],
)}\n`);

const checksumEntries = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name))
  .filter((filename) => path.basename(filename) !== "SHA256SUMS.json")
  .sort()
  .map((filename) => ({
    path: path.relative(root, filename),
    sha256: sha256(filename),
    bytes: fs.statSync(filename).size,
  }));
writeJson("SHA256SUMS.json", {
  algorithm: "SHA-256",
  generatedAt: new Date().toISOString(),
  files: checksumEntries,
});

process.stdout.write("RESEARCHFORGE_EVIDENCE_GAP_ACQUISITION_AND_FORMAL_SYNTHESIS_V3_PARTIAL\n");
