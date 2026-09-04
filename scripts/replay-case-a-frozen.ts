import fs from "node:fs";
import path from "node:path";

import {
  repairFormalSectionsDeterministically,
  validateAnalyticalSynthesis,
  validateCrossSectionDuplicates,
  validateQuantitativeFindingIntegration,
  validateQuantitativeProvenance,
  type FormalResearchArchitecture,
  type ReportWriterSection,
} from "../artifacts/api-server/src/services/formal-research-architecture";

const root = path.resolve(import.meta.dirname, "..");
const inputPath = path.join(
  root,
  "artifacts/qa/researchforge-formal-human-acceptance-20260823T230500/adolescent-screen-sleep/writer-response.live.json",
);
const outputPath = path.join(
  root,
  "artifacts/qa/researchforge-final-evidence-and-export-closure-20260824T075851+0800/adolescent-screen-sleep/frozen-production-replay.json",
);

const frozen = JSON.parse(fs.readFileSync(inputPath, "utf8")) as {
  sections: ReportWriterSection[];
  formalResearchArchitecture: Omit<FormalResearchArchitecture, "workflow"> & {
    workflow?: FormalResearchArchitecture["workflow"];
  };
};

const architecture: FormalResearchArchitecture = {
  ...frozen.formalResearchArchitecture,
  workflow: frozen.formalResearchArchitecture.workflow ?? {
    researchQuestion: "青少年螢幕使用與睡眠結果之關聯為何？",
    namedProviders: ["frozen-accepted-sources"],
    reproducibleSearchStrategy: true,
    explicitInclusionCriteria: true,
    explicitExclusionCriteria: true,
    screeningProcedure: true,
    duplicateRemoval: true,
    documentedStudySelection: true,
    qualityAssessment: false,
    queryExpansion: true,
    themeSynthesis: true,
    searchQueries: ["adolescent screen use sleep outcomes"],
    searchLanguages: ["English"],
    fullTextRetrievalMethods: ["frozen accepted-source replay"],
    evidenceExtractionMethods: ["exact support span"],
    relevanceQualityAssessmentMethods: ["topic integrity and provenance checks"],
    inclusionCriteria: ["adolescent population", "screen exposure", "sleep outcome"],
    exclusionCriteria: ["population, exposure, or outcome mismatch"],
  },
};

const repaired = repairFormalSectionsDeterministically({
  sections: frozen.sections,
  architecture,
});
const duplicates = validateCrossSectionDuplicates(
  repaired.sections,
  0.86,
  architecture.sectionClaimAllocations,
);
const spans = architecture.studies.flatMap((study) => study.evidenceSpans);
const quantitative = validateQuantitativeProvenance({
  sections: repaired.sections,
  numericEvidence: architecture.numericEvidence,
  spans,
});
const findings = validateQuantitativeFindingIntegration({
  sections: repaired.sections,
  findings: architecture.quantitativeFindings,
});
const synthesis = validateAnalyticalSynthesis({
  sections: repaired.sections,
  matrix: architecture.evidenceMatrix,
});
const pass =
  duplicates.strictDuplicates.length === 0 &&
  duplicates.semanticDuplicates.length === 0 &&
  findings.coverage === 100 &&
  quantitative.bodyNumericClaimCoverage === 100;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      status: pass ? "PASS" : "BLOCKED",
      inputPath: path.relative(root, inputPath),
      providerRequests: 0,
      writerRequests: 0,
      strictDuplicateCount: duplicates.strictDuplicates.length,
      semanticDuplicateCount: duplicates.semanticDuplicates.length,
      findingsCoverage: findings.coverage,
      numericClaimCoverage: quantitative.bodyNumericClaimCoverage,
      quantitativePass: quantitative.pass,
      synthesisPass: synthesis.pass,
      repairs: repaired.repairs,
      remainingStrictDuplicates: duplicates.strictDuplicates,
      remainingSemanticDuplicates: duplicates.semanticDuplicates,
      quantitativeFailures: quantitative.failures,
      synthesisIssues: synthesis.issues,
      replayedSections: repaired.sections,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    status: pass ? "PASS" : "BLOCKED",
    strictDuplicates: duplicates.strictDuplicates.length,
    semanticDuplicates: duplicates.semanticDuplicates.length,
    findingsCoverage: findings.coverage,
    numericClaimCoverage: quantitative.bodyNumericClaimCoverage,
    synthesisPass: synthesis.pass,
    outputPath,
  }),
);
