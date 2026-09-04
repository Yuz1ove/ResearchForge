import assert from "node:assert/strict";
import test from "node:test";

import {
  recoverSupportedContentDeterministically,
} from "./deterministic-supported-content-recovery";
import type { FormalResearchArchitecture } from "./formal-research-architecture";
import type { ReportWriterEvidenceCard, ReportWriterSection } from "./report-writer";

const architecture = {
  workflow: {
    researchQuestion: "測試研究問題",
    namedProviders: ["saved"],
    reproducibleSearchStrategy: true,
    explicitInclusionCriteria: true,
    explicitExclusionCriteria: true,
    screeningProcedure: true,
    duplicateRemoval: true,
    documentedStudySelection: true,
    qualityAssessment: false,
    queryExpansion: false,
    themeSynthesis: true,
    searchQueries: ["saved query"],
    searchLanguages: ["繁體中文"],
    fullTextRetrievalMethods: ["使用已保存摘要"],
    evidenceExtractionMethods: ["exact support span"],
    relevanceQualityAssessmentMethods: ["離線驗證"],
    inclusionCriteria: ["可追溯"],
    exclusionCriteria: ["離題"],
  },
  studies: [],
  evidenceMatrix: [],
  sectionClaimAllocations: [],
  sectionClaimOwnership: [],
  numericEvidence: [],
  quantitativeFindings: [],
  quantitativeFindingsRegistry: [],
  quantitativeFactRegistry: [],
  method: { selectedMethod: "THEMATIC_SYNTHESIS", rationale: "test", prohibitedClaims: [] },
  visualizationPlan: [],
  sectionEvidencePackets: [],
  diagnostics: [],
  reportMode: "formal_research_report",
} as unknown as FormalResearchArchitecture;

const sections: ReportWriterSection[] = [
  { sectionId: "executive_summary", title: "摘要", prose: "摘要內容。", evidenceCardIds: [], citationIds: [] },
  { sectionId: "methods", title: "方法", prose: "方法。", evidenceCardIds: [], citationIds: [] },
  { sectionId: "findings", title: "發現", prose: "已實現的發現。", evidenceCardIds: [], citationIds: [] },
  { sectionId: "limitations_gaps", title: "限制", prose: "限制。", evidenceCardIds: [], citationIds: [] },
];

function card(overrides: Partial<ReportWriterEvidenceCard>): ReportWriterEvidenceCard {
  return {
    id: "evidence-1",
    evidenceId: "evidence-1",
    sourceId: "source-1",
    sourceTitle: "Source",
    sourceProvider: "saved",
    claim: "Supported claim",
    claimTextZhTw: "保存證據直接支持這項寫作學習發現。",
    evidence: "Exact support span",
    summary: "",
    relevance: "direct",
    year: null,
    usableSections: ["findings"],
    citationText: "Source",
    limitation: null,
    ...overrides,
  };
}

test("offline recovery adds only traceable fixed evidence realizations", () => {
  const result = recoverSupportedContentDeterministically({
    sections,
    architecture,
    evidenceCards: [card({})],
    minimumCjk: 1,
  });
  assert.equal(result.writerCalls, 0);
  assert.equal(result.searchCalls, 0);
  assert.equal(result.realizations.length, 1);
  assert.equal(result.realizations[0]?.supportSpan, "Exact support span");
  assert.equal(result.realizations[0]?.sectionOwner, "findings");
  assert.equal(result.unsupportedSentenceCount, 0);
  assert.equal(result.provenanceCoverage, 100);
});

test("offline recovery fails closed when no verified zh-TW proposition exists", () => {
  const result = recoverSupportedContentDeterministically({
    sections,
    architecture,
    evidenceCards: [
      card({
        claimTextZhTw: "中文摘要：此來源可用於檢視本題。",
        mainClaimZhTw: undefined,
        evidencePointZhTw: undefined,
        sourceSummaryZhTw: undefined,
      }),
    ],
    minimumCjk: 1_800,
  });
  assert.equal(result.realizations.length, 0);
  assert.equal(result.unavailable[0]?.reason, "NO_VERIFIED_ZHTW_SUPPORTED_PROPOSITION");
  assert.equal(result.verdict, "CASE_B_INSUFFICIENT_SUPPORTED_CONTENT");
});
