import assert from "node:assert/strict";
import test from "node:test";

import {
  QUALITY_RETRY_ROUTES,
  REPORT_QUALITY_DIMENSIONS,
  evaluateReportQuality,
  type ReportQualityGateInput,
} from "./reportQualityGate.ts";

function passingInput(): ReportQualityGateInput {
  return {
    facts: [{
      factId: "fact-1",
      sourceId: "source-1",
      evidenceId: "evidence-1",
      traceable: true,
      containsNumber: true,
      numericValue: 1.42,
      numberTraceable: true,
      statisticInterpretationValid: true,
      comparisonValid: true,
    }],
    claims: [{
      claimId: "claim-1",
      sectionId: "findings",
      supportingFactIds: ["fact-1"],
      citationIds: ["source-1"],
      citationEntailed: true,
      citationIdentityMatches: true,
      containsNumber: true,
      numberFactIds: ["fact-1"],
      directness: "direct",
      claimStrength: "associational",
      calibratedToEvidence: true,
    }],
    sections: [
      {
        sectionId: "findings",
        text: "多來源證據共同指出一項可追溯的關聯，但效果仍受研究設計限制。",
        substantive: true,
        paperByPaper: false,
        sourceOrderSimilarity: 0.2,
        coherent: true,
        transitionFromPrevious: true,
        repetitionRatio: 0.05,
      },
      {
        sectionId: "discussion",
        text: "綜合限制與適用範圍後，結果只能作為關聯性判斷，不能推論因果。",
        substantive: true,
        paperByPaper: false,
        sourceOrderSimilarity: 0.1,
        coherent: true,
        transitionFromPrevious: true,
        repetitionRatio: 0.04,
      },
    ],
    visualAudits: [{
      visualId: "visual-1",
      required: true,
      expectedVisualType: "forest_plot",
      selectedVisualType: "forest_plot",
      valuesTraceable: true,
      dataValid: true,
      renderOk: true,
      helpsInterpretation: true,
      sourceNotePresent: true,
    }],
    contradictions: [{
      contradictionId: "contradiction-1",
      material: true,
      addressed: true,
      alternativeExplanationIncluded: true,
    }],
    formatParity: {
      contentParity: true,
      previewDocxParity: true,
      previewPdfParity: true,
      docxPdfParity: true,
      previewReadable: true,
      docxReadable: true,
      pdfReadable: true,
      cjkGlyphsPreserved: true,
    },
    audienceArchetype: {
      audienceProfileDefined: true,
      audienceFit: true,
      explanationDepthMatchesAudience: true,
      archetypeFit: true,
      reportArchetypeMatchesQuestion: true,
      minimumEvidenceMet: true,
      evidenceSufficiency: "sufficient",
      reportArchetype: "evidence_synthesis_report",
      claimsCalibratedToEvidence: true,
      resultVisualsRequired: true,
    },
    retryCount: 0,
    maxRetries: 2,
  };
}

test("quality gate passes a fully closed structural audit", () => {
  const result = evaluateReportQuality(passingInput());

  assert.equal(result.passed, true);
  assert.equal(result.blockExport, false);
  assert.equal(result.exhausted, false);
  assert.equal(result.downgradeToLimitedBrief, false);
  assert.deepEqual(result.retryPlan, []);
  assert.deepEqual(Object.keys(result.dimensions), [...REPORT_QUALITY_DIMENSIONS]);
  for (const dimension of REPORT_QUALITY_DIMENSIONS) {
    assert.equal(result.dimensions[dimension].score, 100);
    assert.equal(result.dimensions[dimension].blocksExport, false);
    assert.equal(result.dimensions[dimension].retryStage, null);
  }
});

test("quality_gate_routes_failures_correctly", () => {
  const input = passingInput();
  input.facts = [{
    ...input.facts![0]!,
    numberTraceable: false,
    statisticInterpretationValid: false,
  }];
  input.claims = [{
    ...input.claims![0]!,
    citationEntailed: false,
    directness: "near_direct",
    claimStrength: "causal",
  }];
  input.sections = [
    {
      ...input.sections![0]!,
      paperByPaper: true,
      sourceOrderSimilarity: 0.94,
    },
    {
      ...input.sections![1]!,
      repeatedWithSectionIds: ["findings"],
      repetitionRatio: 0.61,
    },
  ];
  input.visualAudits = [{
    ...input.visualAudits![0]!,
    selectedVisualType: "generic_bar_chart",
  }];
  input.formatParity = { ...input.formatParity, cjkGlyphsPreserved: false };

  const result = evaluateReportQuality(input);
  const routes = result.retryPlan.map((item) => item.retryStage);

  assert.equal(result.passed, false);
  assert.equal(result.blockExport, true);
  assert.deepEqual(routes, [
    QUALITY_RETRY_ROUTES.citation,
    QUALITY_RETRY_ROUTES.number,
    QUALITY_RETRY_ROUTES.visual,
    QUALITY_RETRY_ROUTES.stitching,
    QUALITY_RETRY_ROUTES.repetition,
    QUALITY_RETRY_ROUTES.overclaim,
    QUALITY_RETRY_ROUTES.CJK,
  ]);
  assert.equal(
    result.dimensions.citation_precision.retryStage,
    "claim_citation_mapping",
  );
  assert.equal(
    result.dimensions.statistical_correctness.retryStage,
    "evidence_extraction",
  );
  assert.equal(
    result.dimensions.visual_effectiveness.retryStage,
    "visual_semantic_router",
  );
  assert.equal(result.dimensions.synthesis.retryStage, "narrative_planning");
  assert.equal(result.dimensions.coherence.retryStage, "whole_document_editor");
  assert.equal(
    result.dimensions.directness_honesty.retryStage,
    "readiness_claim_strength",
  );
  assert.equal(result.dimensions.document_quality.retryStage, "exporter_font_config");
  assert.ok(result.dimensions.citation_precision.failureLocations.includes("findings"));
  assert.ok(result.dimensions.document_quality.reason.includes("CJK"));
});

test("limited_evidence_downgrade_is_honest", () => {
  const input = passingInput();
  input.retryCount = 2;
  input.maxRetries = 2;
  input.audienceArchetype = {
    ...input.audienceArchetype,
    minimumEvidenceMet: false,
    evidenceSufficiency: "limited",
    reportArchetype: "systematic_evidence_report",
    claimsCalibratedToEvidence: false,
  };

  const result = evaluateReportQuality(input);

  assert.equal(result.passed, false);
  assert.equal(result.blockExport, true);
  assert.equal(result.exhausted, true);
  assert.equal(result.downgradeToLimitedBrief, true);
  assert.equal(
    result.dimensions.directness_honesty.retryStage,
    "readiness_claim_strength",
  );
  assert.ok(result.dimensions.directness_honesty.reason.includes("Limited Evidence Brief"));
  assert.ok(result.retryPlan.every((item) => item.canRetry === false));
  assert.ok(result.retryPlan.every((item) => item.nextRetryCount === null));

  const honestBrief = evaluateReportQuality({
    ...passingInput(),
    limitedEvidence: true,
    reportArchetype: "limited_evidence_brief",
    audienceArchetype: {
      ...passingInput().audienceArchetype,
      minimumEvidenceMet: false,
      evidenceSufficiency: "limited",
      reportArchetype: "limited_evidence_brief",
      claimsCalibratedToEvidence: true,
    },
  });
  assert.equal(honestBrief.passed, true);
  assert.equal(honestBrief.blockExport, false);
  assert.equal(honestBrief.downgradeToLimitedBrief, false);
});

test("quality gate enforces the retry cap without dropping the audit plan", () => {
  const retryable = passingInput();
  retryable.retryCount = 1;
  retryable.maxRetries = 2;
  retryable.citationIssues = [{
    kind: "identity_mismatch",
    location: "claim:claim-1",
  }];

  const beforeCap = evaluateReportQuality(retryable);
  assert.equal(beforeCap.exhausted, false);
  assert.equal(beforeCap.retryPlan[0]?.canRetry, true);
  assert.equal(beforeCap.retryPlan[0]?.nextRetryCount, 2);

  const atCap = evaluateReportQuality({ ...retryable, retryCount: 2 });
  assert.equal(atCap.exhausted, true);
  assert.equal(atCap.maxRetries, 2);
  assert.equal(atCap.retryPlan[0]?.retryStage, "claim_citation_mapping");
  assert.equal(atCap.retryPlan[0]?.canRetry, false);
  assert.equal(atCap.retryPlan[0]?.nextRetryCount, null);
});
