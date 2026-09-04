import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReportMethodologyRubric } from "./reportMethodologyRubric.ts";

test("methodology rubric passes applicable criteria and preserves not-applicable criteria", () => {
  const result = evaluateReportMethodologyRubric({
    researchQuestionDefined: true,
    audienceAndPurposeDefined: true,
    designOrSynthesisMethodDefined: true,
    constructsOperationalized: null,
    samplingOrSourceSelectionExplained: true,
    evidenceTraceabilityComplete: true,
    synthesisLedByResearchQuestion: true,
    statisticalUncertaintyHandled: null,
    ethicsAndGovernanceReviewed: undefined,
    reproducibilityMetadataPresent: true,
  });

  assert.equal(result.passed, true);
  assert.equal(result.blockExport, false);
  assert.equal(result.criteria.construct_operationalization.status, "not_applicable");
  assert.equal(result.criteria.ethics_and_governance.status, "not_assessed");
  assert.equal(result.structuralIssues.length, 0);
});

test("blocking methodology failures route into the deterministic quality gate", () => {
  const result = evaluateReportMethodologyRubric({
    researchQuestionDefined: true,
    audienceAndPurposeDefined: false,
    designOrSynthesisMethodDefined: true,
    constructsOperationalized: false,
    samplingOrSourceSelectionExplained: false,
    evidenceTraceabilityComplete: false,
    synthesisLedByResearchQuestion: false,
    statisticalUncertaintyHandled: false,
    ethicsAndGovernanceReviewed: false,
    reproducibilityMetadataPresent: false,
  });

  assert.equal(result.passed, false);
  assert.equal(result.blockExport, true);
  assert.equal(result.criteria.audience_and_purpose.status, "warning");
  assert.equal(result.criteria.evidence_traceability.status, "fail");
  assert.ok(result.structuralIssues.some((issue) =>
    issue.location === "methodology:evidence_traceability" &&
    issue.kind === "evidence"
  ));
});
