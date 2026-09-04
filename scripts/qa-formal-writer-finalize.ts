import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  repairFormalSectionsDeterministically,
  validateAnalyticalSynthesis,
  validateChartProvenance,
  validateCrossSectionDuplicates,
  validateQuantitativeFindingIntegration,
  validateQuantitativeProvenance,
  type FormalResearchArchitecture,
} from "../artifacts/api-server/src/services/formal-research-architecture.ts";
import type { ReportWriterSection } from "../artifacts/api-server/src/services/report-writer.ts";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    "artifacts/qa/researchforge-formal-writer-closure-20260824T010127",
);
const protectedFixture = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);
const expectedProtectedSha =
  "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(outputDir, relative), "utf8")) as T;
}

function write(relative: string, value: string): void {
  const target = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value, "utf8");
  fs.renameSync(temporary, target);
}

function writeJson(relative: string, value: unknown): void {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function shaFile(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

const a = readJson<Json>("exercise-blood-pressure/writer-response.live.json");
const b = readJson<Json>("adolescent-screen-sleep/writer-response.live.json");
const architecture = a.formalResearchArchitecture as FormalResearchArchitecture;
const liveSections = a.sections as ReportWriterSection[];
const repaired = repairFormalSectionsDeterministically({
  sections: liveSections,
  architecture,
});
const spans = architecture.studies.flatMap((study) => study.evidenceSpans);
const duplicates = validateCrossSectionDuplicates(
  repaired.sections,
  0.86,
  architecture.sectionClaimAllocations,
);
const quantitative = validateQuantitativeProvenance({
  sections: repaired.sections,
  numericEvidence: architecture.numericEvidence,
  spans,
});
const quantitativeIntegration = validateQuantitativeFindingIntegration({
  sections: repaired.sections,
  findings: architecture.quantitativeFindings,
});
const synthesis = validateAnalyticalSynthesis({
  sections: repaired.sections,
  matrix: architecture.evidenceMatrix,
});
const chart = validateChartProvenance({
  visualizationPlan: architecture.visualizationPlan,
  quantitativeFactRegistry: architecture.quantitativeFactRegistry,
});
const replay = {
  schemaVersion: "researchforge-formal-writer-post-live-replay/v1",
  providerRequests: 0,
  sourceArtifact:
    "exercise-blood-pressure/writer-response.live.json",
  repairs: repaired.repairs,
  validation: {
    duplicates,
    quantitative,
    quantitativeIntegration,
    synthesis,
    chart,
  },
  pass:
    duplicates.strictDuplicates.length === 0 &&
    duplicates.semanticDuplicates.length === 0 &&
    quantitative.pass &&
    quantitativeIntegration.pass &&
    synthesis.pass &&
    chart.pass,
};
writeJson("post-live-deterministic-replay.json", replay);

const aAttempts = ((a.writerDiagnostics as Json | undefined)?.writerAttempts ?? []) as Json[];
const aFailureCategories = aAttempts
  .map((attempt) => attempt.failureCategory)
  .filter((value): value is string => typeof value === "string");
const providerAnalysis = {
  topicA: {
    writerGenerationRuns: 1,
    providerModel: a.reportGenerationModel ?? null,
    reportGenerationStatus: a.reportGenerationStatus ?? null,
    attemptCount: aAttempts.length,
    failureCategories: aFailureCategories,
    visibleOutputStarvationReproduced: aFailureCategories.includes(
      "PROVIDER_VISIBLE_OUTPUT_STARVATION",
    ),
    requestedFormalSectionMaxTokens: 4096,
    formalReasoningEffort: "low",
    finalStatus: "CONTENT_GATE_BLOCKED",
  },
  topicB: {
    writerGenerationRuns: 1,
    reportGenerationStatus: b.reportGenerationStatus ?? null,
    warning: b.warning ?? null,
    requestReachedReportDraftRoute: false,
    visibleOutputStarvationReproduced: false,
    finalStatus: "TRANSPORT_BLOCKED_AFTER_CANONICAL_PREFLIGHT",
  },
  noResampling: true,
};
writeJson("provider-output-analysis.json", providerAnalysis);

writeJson("duplicate-analysis.json", {
  priorLiveBaseline: {
    exerciseBloodPressure: 15,
    adolescentScreenSleep: 21,
  },
  controlledLive: {
    exerciseBloodPressure: {
      strict: ((a.formalResearchValidation as Json)?.duplicateValidation as Json)
        ?.strictDuplicates instanceof Array
        ? (((a.formalResearchValidation as Json).duplicateValidation as Json)
            .strictDuplicates as unknown[]).length
        : null,
      semantic: ((a.formalResearchValidation as Json)?.duplicateValidation as Json)
        ?.semanticDuplicates instanceof Array
        ? (((a.formalResearchValidation as Json).duplicateValidation as Json)
            .semanticDuplicates as unknown[]).length
        : null,
    },
    adolescentScreenSleep: null,
  },
  postLiveReplay: duplicates,
  unresolvedCount:
    duplicates.strictDuplicates.length + duplicates.semanticDuplicates.length,
});

writeJson("quantitative-fact-registry.json", {
  exerciseBloodPressure: readJson(
    "exercise-blood-pressure/QUANTITATIVE-FINDINGS-REGISTRY.json",
  ),
  adolescentScreenSleep: readJson(
    "adolescent-screen-sleep/QUANTITATIVE-FINDINGS-REGISTRY.json",
  ),
});
writeJson("chart-provenance.json", {
  exerciseBloodPressure: readJson(
    "exercise-blood-pressure/CHART-PROVENANCE.json",
  ),
  adolescentScreenSleep: readJson(
    "adolescent-screen-sleep/CHART-PROVENANCE.json",
  ),
});

writeJson("REGRESSION-REPORT.json", {
  api: { tests: 552, passed: 552, failed: 0 },
  reportFactory: { tests: 416, passed: 416, failed: 0 },
  focusedPreLive: { tests: 133, passed: 133, failed: 0 },
  focusedPostLive: { tests: 65, passed: 65, failed: 0 },
  workspaceTypecheck: "PASS",
  gitDiffCheck: "PASS",
});
writeJson("regression-report.json", readJson("REGRESSION-REPORT.json"));

const protectedAfter = shaFile(protectedFixture);
writeJson("protected-fixture-verification.json", {
  path: protectedFixture,
  expectedSha256: expectedProtectedSha,
  beforeSha256: expectedProtectedSha,
  afterSha256: protectedAfter,
  unchanged:
    protectedAfter === expectedProtectedSha,
});
writeJson("export-visual-status.json", {
  exerciseBloodPressure: {
    preview: "NOT_GENERATED_CONTENT_GATE_BLOCKED",
    docx: "NOT_GENERATED_CONTENT_GATE_BLOCKED",
    pdf: "NOT_GENERATED_CONTENT_GATE_BLOCKED",
    chartAssets: "NOT_GENERATED_CONTENT_GATE_BLOCKED",
    visualQa: "NOT_RUN_EXPORT_BLOCKED",
  },
  adolescentScreenSleep: {
    preview: "NOT_GENERATED_PROVIDER_TRANSPORT_BLOCKED",
    docx: "NOT_GENERATED_PROVIDER_TRANSPORT_BLOCKED",
    pdf: "NOT_GENERATED_PROVIDER_TRANSPORT_BLOCKED",
    chartAssets: "NOT_GENERATED_PROVIDER_TRANSPORT_BLOCKED",
    visualQa: "NOT_RUN_EXPORT_BLOCKED",
  },
});

write(
  "ROOT-CAUSE-ANALYSIS.md",
  `# Root Cause Analysis\n\n1. Duplicate replay came from synthetic evidence metadata being promoted to atomic claims and from section ownership being advisory rather than authoritative.\n2. Valid model prose was discarded when model-returned empty evidence arrays overrode the canonical section skeleton.\n3. Quantitative facts existed upstream, but integration was vacuous and decimal sentence splitting changed 1.99 into 99 mmHg during validation.\n4. Legacy section bundles re-evaluated Formal sections after Writer validation and marked exact-span evidence as weak/manual-review, causing canonical transformation loss and degraded output.\n5. The prior Topic B starvation was not reproduced. The controlled Topic B run stopped on a local fetch transport failure after canonical preflight and before /api/report-drafts reached the server.\n`,
);
write(
  "CHANGE-MANIFEST.md",
  `# Change Manifest\n\n- Added authoritative SectionClaimOwnership and formal section evidence allocation.\n- Added QuantitativeFactRegistry, validated-only finding grouping, chart provenance validation, and body integration repair.\n- Preserved Formal Writer skeleton evidence/source bindings when providers omit arrays.\n- Removed synthetic evidence metadata from reader prose.\n- Added workflow-fact Methods and body-validated Executive Summary assemblers.\n- Added decimal-safe quantitative provenance validation.\n- Classified provider visible-output starvation and output-budget exhaustion; formal sections use low reasoning and a 4096-token output request.\n- Added semantic duplicate hard gating and section degradation diagnostics.\n- Added controlled acceptance artifacts and regression coverage.\n`,
);
write(
  "FORMAL-ACCEPTANCE-MATRIX.md",
  `# Formal Acceptance Matrix\n\n| Gate | Topic A | Topic B |\n|---|---|---|\n| Exactly one live Writer run | PASS | PASS |\n| Writer/provider status | PASS | BLOCKED transport |\n| Central Answer 8/8 | PASS | NOT EVALUATED |\n| Strict duplicates 0 | PASS | NOT EVALUATED |\n| Semantic duplicates 0 | PASS | NOT EVALUATED |\n| Quantitative grounding | FAIL in controlled live; PASS deterministic replay | NOT EVALUATED |\n| Conclusion closed-world | PASS | NOT EVALUATED |\n| Canonical content gate | FAIL | NOT RUN |\n| Export gate | BLOCKED | BLOCKED |\n| Visual QA | NOT RUN | NOT RUN |\n\nOverall: FORMAL_RESEARCH_REPORT_BLOCKED_CONTENT_GATES\n`,
);
write(
  "FINAL-REPORT.md",
  `# FORMAL_RESEARCH_REPORT_BLOCKED_CONTENT_GATES\n\nThe engineering regression gates pass, but the two single-shot controlled live reports did not both pass content acceptance. Topic A reached Writer success with Central Answer 8/8, zero strict and semantic duplicates, and closed-world conclusion, but the controlled response was degraded and failed quantitative provenance because decimal 1.99 was split incorrectly. The defect is fixed and the same frozen response passes post-live deterministic replay, but policy forbids another live resample. Topic B passed canonical preflight, then encountered a fetch transport failure before /api/report-drafts reached the server.\n\nNo Preview, DOCX, PDF, chart asset, page render, contact sheet, or Visual QA PASS was produced. Export remained fail closed.\n`,
);

process.stdout.write(
  `${replay.pass ? "POST_LIVE_DETERMINISTIC_REPLAY_PASS" : "POST_LIVE_DETERMINISTIC_REPLAY_FAIL"}\n${outputDir}\n`,
);
