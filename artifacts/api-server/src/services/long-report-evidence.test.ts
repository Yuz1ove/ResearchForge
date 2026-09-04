import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildLongReportFeasibilitySectionPlans,
  attributeCanonicalStageLoss,
  auditBodyRealization,
  auditConclusionClosure,
  auditConflictPolicy,
  auditEvidenceDensity,
  auditSemanticEntailment,
  buildCentralAnswerContract,
  buildConclusionEligibilityGate,
  classifyContentTaxonomy,
  deriveLongReportThresholds,
  estimateLongReportEvidenceFeasibility,
  evaluateLongReportQuality,
  measureEvidenceBearingContent,
  type AuditSentence,
  type CentralAnswerSynthesisClaim,
  type EvidenceAuditClaim,
} from "./long-report-evidence";
import {
  writeReportWithLlm,
  type ReportWriterInput,
} from "./report-writer";

const trace = (
  sentenceId: string,
  text: string,
  claimId = "atomic-e1",
  overrides: Partial<AuditSentence> = {},
): AuditSentence => ({
  sentenceId,
  text,
  finalClaimIds: claimId ? [claimId] : [],
  evidenceIds: claimId ? ["e1"] : [],
  sourceIds: claimId ? ["s1"] : [],
  validation: "pass",
  factual: Boolean(claimId),
  ...overrides,
});

const atomicClaim = (
  index: number,
  sourceId = `s${(index % 10) + 1}`,
  claimType = "finding",
): EvidenceAuditClaim => ({
  claimId: `atomic-e${index}`,
  proposition: `第${index}項研究結果顯示此族群的暴露與主要結果存在可核對但受限制的關聯。`,
  supportEvidenceIds: [`e${index}`],
  supportSourceIds: [sourceId],
  claimType,
  scope: { population: "青少年", exposure: "短影音使用", outcome: "睡眠品質" },
  supportSpans: [{ exactSupportSpan: `來源逐字支持片段${index}，描述樣本、研究方法、暴露定義、比較條件、主要結果、次要結果與不確定性邊界；作者的原始解釋僅限原研究族群、量測方式及情境，不可改寫為跨族群因果結論。` }],
});

test("stage loss attribution reconciles losses, repairs, and canonical attrition", () => {
  const raw = [
    trace("a", "研究顯示睡眠品質下降。"),
    trace("b", "然而，這段沒有來源。", "", { factual: false }),
  ];
  const repairedA = trace("a", "研究顯示睡眠品質可能下降。", "atomic-e1");
  const stages = [
    { stage: "raw" as const, sentences: raw },
    { stage: "validation" as const, sentences: raw },
    { stage: "repair" as const, sentences: [repairedA, raw[1]!] },
    { stage: "post-deletion" as const, sentences: [repairedA] },
    { stage: "paragraph-render" as const, sentences: [repairedA] },
    { stage: "trace-reconstruction" as const, sentences: [repairedA] },
    { stage: "canonical" as const, sentences: [trace("a", "研究顯示睡眠品質可能下降。", "atomic-e1")] },
  ];
  const audit = attributeCanonicalStageLoss(stages);
  assert.equal(audit.reconciled, true);
  assert.equal(audit.net_lost_cjk, audit.raw_cjk - audit.canonical_cjk);
  assert.ok((audit.lost_cjk_by_reason.transition_removed ?? 0) > 0);
  assert.ok(audit.records.every((record) => record.deterministic));
});

test("evidence yield audit distinguishes partial extraction from source-limited content", () => {
  const audit = auditEvidenceDensity({
    sources: [
      {
        sourceId: "s1",
        content: "研究目的為比較介入與對照組。樣本共 420 名青少年，採縱貫方法，主要結果含比例與限制，作者指出不可外推。研究另說明暴露定義、追蹤期間、次要結果、可能中介機制與分層交互作用，並討論測量不確定性、與其他研究的不一致，以及研究結果只能適用於原本招募族群的推廣邊界。附錄交代資料遺漏處理、敏感度分析、效果估計的信賴區間，以及作者如何解釋不同測量工具造成的差異；這些內容都可直接核對原始研究文字。",
      },
      { sourceId: "s2", content: "短摘要只指出可能相關。" },
    ],
    evidenceCards: [
      { evidenceId: "e1", sourceId: "s1", text: "主要結果顯示兩者相關。" },
      { evidenceId: "e2", sourceId: "s2", text: "可能相關。" },
    ],
    atomicClaims: [atomicClaim(1, "s1")],
  });
  assert.deepEqual(audit.under_extracted_sources, ["s1"]);
  assert.deepEqual(audit.source_limited_sources, ["s2"]);
  assert.ok(audit.sources[0]!.missedExtractableCategories.includes("moderator"));
});

test("content taxonomy does not treat structural transitions as unsupported facts", () => {
  assert.equal(classifyContentTaxonomy(trace("a", "然而，以下分兩部分說明。", "", { factual: false })), "transition");
  assert.equal(classifyContentTaxonomy(trace("b", "本次搜尋納入三個資料來源。", "", { factual: false })), "methodological");
  assert.equal(classifyContentTaxonomy(trace("c", "兩項研究方向一致。", "synthesis-1")), "synthesis");
});

test("evidence-bearing metrics count factual and synthesis prose while detecting padding", () => {
  const sentence = trace("a", "研究顯示短影音使用與睡眠品質存在受限關聯。", "atomic-e1");
  const metrics = measureEvidenceBearingContent([
    sentence,
    { ...sentence, sentenceId: "b" },
    trace("c", "跨來源結果方向一致但對象不同。", "synthesis-1"),
    trace("d", "此外，以下討論限制。", "", { factual: false }),
  ]);
  assert.ok(metrics.supported_factual_cjk > 0);
  assert.ok(metrics.supported_synthesis_cjk > 0);
  assert.ok(metrics.duplicate_ratio > 0);
  assert.equal(metrics.unsupported_factual_claim_count, 0);
});

test("long-report thresholds are derived from accepted fixture distribution", () => {
  const base = {
    unsupported_factual_claim_count: 0,
    semantic_duplicate_cjk: 0,
    unique_evidence_bearing_ratio: 0.7,
  };
  const thresholds = deriveLongReportThresholds([
    { fixtureId: "accepted-a", accepted: true, canonical_body_cjk: 7200, supported_factual_cjk: 4300, supported_synthesis_cjk: 900, supported_evidence_bearing_cjk: 5200, evidence_bearing_ratio: 0.72, duplicate_ratio: 0.04, ...base },
    { fixtureId: "accepted-b", accepted: true, canonical_body_cjk: 7600, supported_factual_cjk: 4400, supported_synthesis_cjk: 1000, supported_evidence_bearing_cjk: 5400, evidence_bearing_ratio: 0.71, duplicate_ratio: 0.06, ...base },
    { fixtureId: "verbosity-rejected", accepted: false, canonical_body_cjk: 7100, supported_factual_cjk: 1800, supported_synthesis_cjk: 200, supported_evidence_bearing_cjk: 2000, evidence_bearing_ratio: 0.28, duplicate_ratio: 0.43, ...base },
  ]);
  assert.deepEqual(thresholds.derivation.acceptedFixtureIds, ["accepted-a", "accepted-b"]);
  assert.ok(thresholds.minimumSupportedEvidenceBearingCjk > 2_000);
  assert.ok(thresholds.minimumEvidenceBearingRatio > 0.7);
});

test("redesigned long-report gate keeps every citation and provenance safety invariant", () => {
  const content = measureEvidenceBearingContent([
    trace("factual", "研究結果提供可核對的主要發現與適用邊界。", "atomic-e1"),
    trace("synthesis", "兩個來源方向一致但研究族群不同。", "synthesis-1"),
  ]);
  const thresholds = deriveLongReportThresholds([
    { fixtureId: "accepted-a", accepted: true, ...content },
    { fixtureId: "accepted-b", accepted: true, ...content },
  ]);
  const result = evaluateLongReportQuality({
    content,
    thresholds,
    safety: {
      citationCoverage: 1,
      claimReferenceMismatch: 0,
      unknownSourceLeakage: 0,
      rejectedSourceLeakage: 0,
      ghostReferences: 0,
      orphanCitations: 0,
      lineageIssues: 1,
      primaryFindingPreservation: 1,
      centralAnswerAlignment: true,
      conclusionAlignment: true,
      sectionCompleteness: 1,
      formalQuality: true,
    },
  });
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ["lineage_issues"]);
});

test("central answer contract reuses validated claim, evidence, and source IDs", () => {
  const claims = [atomicClaim(1, "s1"), atomicClaim(2, "s2"), atomicClaim(3, "s3", "limitation")];
  const synthesis: CentralAnswerSynthesisClaim = {
    claimId: "synthesis-1",
    proposition: "兩個獨立來源的結果方向一致，但研究對象不同。",
    derivedFromAtomicClaimIds: ["atomic-e1", "atomic-e2"],
    supportSourceIds: ["s1", "s2"],
    validationStatus: "validated",
    synthesisType: "agreement",
  };
  const contract = buildCentralAnswerContract({
    researchQuestion: "短影音與睡眠是否相關？",
    atomicClaims: claims,
    synthesisClaims: [synthesis],
    supportingFindingIds: ["finding-1"],
  });
  assert.equal(contract.supportedAnswer, synthesis.proposition);
  assert.deepEqual(contract.synthesisClaimIds, ["synthesis-1"]);
  assert.deepEqual(contract.evidenceIds.sort(), ["e1", "e2"]);
  assert.deepEqual(contract.sourceIds.sort(), ["s1", "s2"]);
});

test("body realization reports canonical removal and wrong-section partial realization", () => {
  const records = auditBodyRealization({
    plannedClaims: [
      { claimId: "atomic-e1", sectionId: "findings" },
      { claimId: "atomic-e2", sectionId: "discussion" },
    ],
    bodySentences: [
      trace("a", "結果一。", "atomic-e1", { sectionId: "findings" }),
      trace("b", "結果二。", "atomic-e2", { sectionId: "findings" }),
    ],
    canonicalSentences: [trace("b", "結果二。", "atomic-e2", { sectionId: "findings" })],
    centralRequirements: [{
      centralClaimId: "atomic-e2",
      required: true,
      allowedSections: ["discussion"],
      targetSection: "discussion",
      requiredEvidenceIds: [],
      requiredSourceIds: [],
      requiredSemanticRole: "direct_finding",
      realizationRequirement: "fully_realized",
    }],
  });
  assert.equal(records[0]!.realizationStatus, "removed_during_canonicalization");
  assert.equal(records[1]!.realizationStatus, "partially_realized");
});

test("novel conclusion claim is rejected by deterministic closure", () => {
  const claims = [atomicClaim(1, "s1"), atomicClaim(2, "s2")];
  const contract = buildCentralAnswerContract({
    researchQuestion: "問題",
    atomicClaims: claims,
    synthesisClaims: [],
    preferredClaimIds: ["atomic-e1"],
  });
  const bodyRealization = auditBodyRealization({
    plannedClaims: [{ claimId: "atomic-e1", sectionId: "findings" }],
    bodySentences: [trace("body", "正文。", "atomic-e1", { sectionId: "findings" })],
    canonicalSentences: [trace("body", "正文。", "atomic-e1", { sectionId: "findings" })],
  });
  const closure = auditConclusionClosure({
    contract,
    bodyRealization,
    conclusionSentences: [
      trace("conclusion-1", "正文重述。", "atomic-e1"),
      trace("conclusion-2", "新機制。", "atomic-new"),
    ],
  });
  assert.equal(closure.passed, false);
  assert.equal(closure.conclusion_claim_novelty, 1);
  assert.deepEqual(closure.novelClaimIds, ["atomic-new"]);
});

test("conclusion closed world allows mixed Central Answer and non-Central realized body claims", () => {
  const claims = [
    atomicClaim(1, "s1"),
    atomicClaim(2, "s2"),
    atomicClaim(3, "s3"),
    atomicClaim(4, "s4"),
  ];
  const contract = buildCentralAnswerContract({
    researchQuestion: "問題",
    atomicClaims: claims,
    synthesisClaims: [],
    preferredClaimIds: ["atomic-e1"],
  });
  const bodyRealization = auditBodyRealization({
    plannedClaims: [
      { claimId: "atomic-e1", sectionId: "findings" },
      { claimId: "atomic-e2", sectionId: "findings" },
      { claimId: "atomic-e3", sectionId: "discussion" },
      { claimId: "atomic-e4", sectionId: "findings" },
    ],
    bodySentences: [
      trace("central-body", claims[0]!.proposition, "atomic-e1", {
        sectionId: "findings",
        paragraphId: "findings-p1",
        evidenceIds: ["e1"],
        sourceIds: ["s1"],
      }),
      trace("finding-body", claims[1]!.proposition, "atomic-e2", {
        sectionId: "findings",
        paragraphId: "findings-p2",
        evidenceIds: ["e2"],
        sourceIds: ["s2"],
      }),
      trace("discussion-body", claims[2]!.proposition, "atomic-e3", {
        sectionId: "discussion",
        paragraphId: "discussion-p1",
        evidenceIds: ["e3"],
        sourceIds: ["s3"],
      }),
    ],
    canonicalSentences: [
      trace("central-body", claims[0]!.proposition, "atomic-e1", {
        sectionId: "findings",
        paragraphId: "findings-p1",
        evidenceIds: ["e1"],
        sourceIds: ["s1"],
      }),
      trace("finding-body", claims[1]!.proposition, "atomic-e2", {
        sectionId: "findings",
        paragraphId: "findings-p2",
        evidenceIds: ["e2"],
        sourceIds: ["s2"],
      }),
      trace("discussion-body", claims[2]!.proposition, "atomic-e3", {
        sectionId: "discussion",
        paragraphId: "discussion-p1",
        evidenceIds: ["e3"],
        sourceIds: ["s3"],
      }),
    ],
    claimDefinitions: claims,
    centralRequirements: contract.requiredClaims,
  });
  const positive = auditConclusionClosure({
    contract,
    bodyRealization,
    conclusionSentences: [
      trace("conclusion-central", claims[0]!.proposition, "atomic-e1", {
        evidenceIds: ["e1"],
        sourceIds: ["s1"],
      }),
      trace("conclusion-finding", claims[1]!.proposition, "atomic-e2", {
        evidenceIds: ["e2"],
        sourceIds: ["s2"],
      }),
    ],
    claimDefinitions: claims,
  });
  assert.equal(positive.conclusion_claim_novelty, 0);
  assert.equal(positive.all_conclusion_claims_realized_in_body, true);
  assert.equal(positive.passed, true);

  const negative = auditConclusionClosure({
    contract,
    bodyRealization,
    conclusionSentences: [
      trace("conclusion-central", claims[0]!.proposition, "atomic-e1", {
        evidenceIds: ["e1"],
        sourceIds: ["s1"],
      }),
      trace("conclusion-never-realized", claims[3]!.proposition, "atomic-e4", {
        evidenceIds: ["e4"],
        sourceIds: ["s4"],
      }),
    ],
    claimDefinitions: claims,
  });
  assert.equal(negative.conclusion_claim_novelty, 1);
  assert.deepEqual(negative.novelClaimIds, ["atomic-e4"]);
  assert.equal(negative.passed, false);
});

test("body registry excludes realized claims whose citation lineage was not validated", () => {
  const registry = auditBodyRealization({
    plannedClaims: [{ claimId: "atomic-e1", sectionId: "findings" }],
    bodySentences: [
      trace("body", "正文主張。", "atomic-e1", {
        sectionId: "findings",
        evidenceIds: [],
        sourceIds: [],
      }),
    ],
    canonicalSentences: [
      trace("body", "正文主張。", "atomic-e1", {
        sectionId: "findings",
        evidenceIds: [],
        sourceIds: [],
      }),
    ],
  });
  assert.equal(registry[0]?.citationValidated, false);
  assert.equal(registry[0]?.realizationStatus, "partially_realized");
  assert.equal(registry[0]?.allowedConclusionUse, false);
  assert.equal(buildConclusionEligibilityGate({ bodyRealization: registry }).candidates.length, 0);
});

function richFeasibilityFixture() {
  const claims = Array.from({ length: 56 }, (_, index) =>
    atomicClaim(
      index + 1,
      `s${(index % 10) + 1}`,
      index % 10 === 0 ? "method" : index % 10 === 1 ? "limitation" : "finding",
    ),
  );
  const synthesisClaims: CentralAnswerSynthesisClaim[] = Array.from({ length: 6 }, (_, index) => ({
    claimId: `synthesis-${index + 1}`,
    proposition: `跨來源綜合${index + 1}顯示結果方向可比較，但研究對象與方法邊界仍須保留。`,
    derivedFromAtomicClaimIds: [`atomic-e${index * 2 + 1}`, `atomic-e${index * 2 + 2}`],
    supportSourceIds: [`s${(index * 2) % 10 + 1}`, `s${(index * 2 + 1) % 10 + 1}`],
    validationStatus: "validated",
    synthesisType: "agreement",
  }));
  const contract = buildCentralAnswerContract({ researchQuestion: "問題", atomicClaims: claims, synthesisClaims });
  const sectionIds = ["introduction", "literature_review", "methodology", "findings", "discussion", "limitations", "conclusion"];
  return {
    requestedCanonicalCjk: 7_000,
    atomicClaims: claims,
    synthesisClaims,
    sectionPlans: sectionIds.map((sectionId, index) => ({
      sectionId,
      claimIds: claims.slice(index * 8, index * 8 + 8).map((claim) => claim.claimId),
      allocatedBudget: 1_000,
    })),
    centralAnswer: contract,
  };
}

test("evidence-rich fixture is feasible for a long report without padding", () => {
  const result = estimateLongReportEvidenceFeasibility(richFeasibilityFixture());
  assert.equal(result.status, "ready_long_report");
  assert.equal(result.recommendedTier, "long_research_report");
  assert.ok(result.sectionBudgets.every((section) => section.claimCountAvailable > 0));
});

test("long-report acceptance requires both the 5,200 CJK floor and 71.62% coverage", () => {
  const fixture = richFeasibilityFixture();
  const accepted = estimateLongReportEvidenceFeasibility({
    ...fixture,
    requestedCanonicalCjk: 7_000,
    sectionPlans: fixture.sectionPlans.map((section, index) => ({
      ...section,
      allocatedBudget: index < 5 ? 1_060 : 0,
    })),
  });
  assert.ok(accepted.estimatedSupportedCanonicalCjk >= 5_200);
  assert.ok(accepted.estimatedSupportedCanonicalCjk / 7_000 >= 0.7162);
  assert.equal(accepted.status, "ready_long_report");

  const belowCapacity = estimateLongReportEvidenceFeasibility({
    ...fixture,
    requestedCanonicalCjk: 7_000,
    sectionPlans: fixture.sectionPlans.map((section, index) => ({
      ...section,
      allocatedBudget: index < 5 ? 1_039 : 0,
    })),
  });
  assert.ok(belowCapacity.estimatedSupportedCanonicalCjk < 5_200);
  assert.notEqual(belowCapacity.status, "ready_long_report");
});

test("evidence-poor long request fails before expensive generation", () => {
  const claims = [atomicClaim(1, "s1"), atomicClaim(2, "s1")];
  const result = estimateLongReportEvidenceFeasibility({
    requestedCanonicalCjk: 7_000,
    atomicClaims: claims,
    synthesisClaims: [],
    sectionPlans: [{ sectionId: "findings", claimIds: claims.map((claim) => claim.claimId), allocatedBudget: 7_000 }],
    centralAnswer: null,
  });
  assert.equal(result.status, "insufficient_evidence");
  assert.equal(result.recommendedTier, "limited_evidence_brief");
  assert.ok(result.estimatedSupportedCanonicalCjk < 7_000);
});

test("frozen limited-feasibility long request sends zero provider requests", async () => {
  const workspacePath = path.resolve(
    process.cwd(),
    "../../artifacts/qa/researchforge-writer-vnext-live-canonical-acceptance-20260823/short_video_sleep/report-workspace.json",
  );
  const workspace = JSON.parse(fs.readFileSync(workspacePath, "utf8")) as {
    generationPayload: Record<string, unknown> & {
      researchTopic: string;
      writerEvidenceSet: { evidenceSetHash: string };
      reportPlan: unknown;
    };
  };
  const payload = workspace.generationPayload;
  let providerRequests = 0;
  const result = await writeReportWithLlm(
    {
      ...payload,
      topic: payload.researchTopic,
      requestedLength: "長篇研究報告 7,000 個中文字",
      targetWordCount: "7000",
      evidenceSetHash: payload.writerEvidenceSet.evidenceSetHash,
      requestedSectionIds: [
        "introduction",
        "literature_review",
        "methodology",
        "findings",
        "discussion",
        "limitations",
        "conclusion",
      ],
    } as unknown as ReportWriterInput,
    {
      llm: {
        baseUrl: "https://provider-must-not-be-called.example/v1",
        model: "test-model",
        apiKey: "test-key",
      },
      fetchImpl: async () => {
        providerRequests += 1;
        throw new Error("provider_called_after_feasibility_failure");
      },
    },
  );
  assert.equal(providerRequests, 0);
  assert.equal(result.llm_status, "skipped");
  assert.equal(result.reportGenerationStatus, "skipped");
  assert.equal(
    result.writerDiagnostics?.writerVNext?.longReportFeasibility?.status,
    "ready_limited_report",
  );
  assert.match(result.warning ?? "", /recommended_tier:limited_evidence_brief/u);
});

test("high raw verbosity with low evidence cannot pass evidence-bearing metrics", () => {
  const repeated = Array.from({ length: 20 }, (_, index) =>
    trace(`s${index}`, "同一研究結果顯示短影音使用與睡眠品質存在關聯。", "atomic-e1"),
  );
  const metrics = measureEvidenceBearingContent(repeated);
  assert.ok(metrics.duplicate_ratio > 0.8);
  assert.ok(metrics.unique_evidence_bearing_ratio < 0.2);
});

test("valid synthesis expansion preserves multi-source lineage", () => {
  const claims = [atomicClaim(1, "s1"), atomicClaim(2, "s2")];
  const contract = buildCentralAnswerContract({
    researchQuestion: "問題",
    atomicClaims: claims,
    synthesisClaims: [{
      claimId: "synthesis-1",
      proposition: "兩個來源方向一致但族群不同。",
      derivedFromAtomicClaimIds: claims.map((claim) => claim.claimId),
      supportSourceIds: ["s1", "s2"],
      validationStatus: "validated",
      synthesisType: "agreement",
    }],
  });
  assert.deepEqual(contract.supportingClaimIds.sort(), claims.map((claim) => claim.claimId).sort());
  assert.deepEqual(contract.sourceIds.sort(), ["s1", "s2"]);
});

test("central answer missing from body cannot be restored by conclusion", () => {
  const claims = [atomicClaim(1, "s1"), atomicClaim(2, "s2")];
  const contract = buildCentralAnswerContract({
    researchQuestion: "問題",
    atomicClaims: claims,
    synthesisClaims: [],
    preferredClaimIds: ["atomic-e1"],
  });
  const bodyRealization = auditBodyRealization({
    plannedClaims: [{ claimId: "atomic-e1", sectionId: "findings" }],
    bodySentences: [],
    canonicalSentences: [],
  });
  const closure = auditConclusionClosure({
    contract,
    bodyRealization,
    conclusionSentences: [trace("conclusion", "試圖補回答案。", "atomic-e1")],
  });
  assert.equal(closure.all_conclusion_claims_realized_in_body, false);
  assert.equal(closure.passed, false);
});

test("supported section budget is constrained by unique evidence units", () => {
  const claims = [atomicClaim(1, "s1"), atomicClaim(2, "s2")];
  const result = estimateLongReportEvidenceFeasibility({
    requestedCanonicalCjk: 7_000,
    atomicClaims: claims,
    synthesisClaims: [],
    sectionPlans: [{ sectionId: "findings", claimIds: claims.map((claim) => claim.claimId), allocatedBudget: 7_000 }],
    centralAnswer: buildCentralAnswerContract({ researchQuestion: "問題", atomicClaims: claims, synthesisClaims: [], preferredClaimIds: ["atomic-e1"] }),
  });
  assert.ok(result.sectionBudgets[0]!.supportedBudgetEstimate < result.sectionBudgets[0]!.allocatedBudget);
  assert.equal(result.sectionBudgets[0]!.evidenceUnitsAvailable, 2);
});

test("feasibility planning exhaustively accounts for recovered claims beyond Writer caps", () => {
  const claims = Array.from({ length: 24 }, (_, index) =>
    atomicClaim(
      index + 1,
      `s${(index % 6) + 1}`,
      index % 5 === 0 ? "method" : index % 7 === 0 ? "limitation" : "finding",
    ),
  );
  const allocatedBudgets = {
    introduction: 900,
    literature_review: 1_400,
    methodology: 900,
    findings: 1_500,
    discussion: 1_200,
    limitations: 700,
    conclusion: 400,
  };
  const plans = buildLongReportFeasibilitySectionPlans({
    atomicClaims: claims,
    allocatedBudgets,
  });
  const assigned = plans.flatMap((plan) => plan.claimIds);
  assert.equal(assigned.length, claims.length);
  assert.equal(new Set(assigned).size, claims.length);

  const full = estimateLongReportEvidenceFeasibility({
    requestedCanonicalCjk: 7_000,
    atomicClaims: claims,
    synthesisClaims: [],
    sectionPlans: plans,
    centralAnswer: buildCentralAnswerContract({
      researchQuestion: "問題",
      atomicClaims: claims,
      synthesisClaims: [],
      preferredClaimIds: [claims[0]!.claimId],
    }),
  });
  const capped = estimateLongReportEvidenceFeasibility({
    requestedCanonicalCjk: 7_000,
    atomicClaims: claims,
    synthesisClaims: [],
    sectionPlans: plans.map((plan) => ({ ...plan, claimIds: plan.claimIds.slice(0, 1) })),
    centralAnswer: buildCentralAnswerContract({
      researchQuestion: "問題",
      atomicClaims: claims,
      synthesisClaims: [],
      preferredClaimIds: [claims[0]!.claimId],
    }),
  });
  assert.ok(full.estimatedSupportedCanonicalCjk > capped.estimatedSupportedCanonicalCjk);
});

test("untraceable conclusion sentence fails even when its claim ID is known", () => {
  const claims = [atomicClaim(1, "s1")];
  const contract = buildCentralAnswerContract({ researchQuestion: "問題", atomicClaims: claims, synthesisClaims: [], preferredClaimIds: ["atomic-e1"] });
  const realization = auditBodyRealization({
    plannedClaims: [{ claimId: "atomic-e1", sectionId: "findings" }],
    bodySentences: [trace("body", "正文。", "atomic-e1", { sectionId: "findings" })],
    canonicalSentences: [trace("body", "正文。", "atomic-e1", { sectionId: "findings" })],
  });
  const closure = auditConclusionClosure({
    contract,
    bodyRealization: realization,
    conclusionSentences: [trace("conclusion", "結論。", "atomic-e1", { evidenceIds: [], sourceIds: [] })],
  });
  assert.equal(closure.all_conclusion_claims_traceable, false);
  assert.equal(closure.passed, false);
});

test("conclusion preflight rejects an evidence claim not fully realized in body", () => {
  const registry = auditBodyRealization({
    plannedClaims: [
      { claimId: "body-claim", sectionId: "findings" },
      { claimId: "unused-evidence-claim", sectionId: "findings" },
    ],
    bodySentences: [trace("body", "正文已建立的關聯。", "body-claim", { sectionId: "findings", paragraphId: "findings-p1" })],
    canonicalSentences: [trace("body", "正文已建立的關聯。", "body-claim", { sectionId: "findings", paragraphId: "findings-p1" })],
  });
  const gate = buildConclusionEligibilityGate({
    bodyRealization: registry,
    requestedClaimIds: ["body-claim", "unused-evidence-claim"],
  });
  assert.equal(gate.status, "blocked");
  assert.deepEqual(gate.rejected, [{
    claimId: "unused-evidence-claim",
    reason: "body_claim_not_realized",
  }]);
});

test("conclusion preflight allows a fully realized body claim", () => {
  const registry = auditBodyRealization({
    plannedClaims: [{ claimId: "body-claim", sectionId: "findings" }],
    bodySentences: [trace("body", "正文已建立的關聯。", "body-claim", { sectionId: "findings", paragraphId: "findings-p1" })],
    canonicalSentences: [trace("body", "正文已建立的關聯。", "body-claim", { sectionId: "findings", paragraphId: "findings-p1" })],
  });
  const gate = buildConclusionEligibilityGate({ bodyRealization: registry, requestedClaimIds: ["body-claim"] });
  assert.equal(gate.status, "pass");
  assert.equal(gate.candidates[0]?.originatingSection, "findings");
  assert.deepEqual(gate.candidates[0]?.originatingParagraphIds, ["findings-p1"]);
});

test("conclusion paraphrase is allowed only when bilingual entailment is preserved", () => {
  const claim = {
    claimId: "central-en",
    proposition: "Among adolescents, short-form video use was associated with poorer sleep quality in an observational study.",
    supportEvidenceIds: ["e1"],
    supportSourceIds: ["s1"],
    claimType: "association",
  };
  const audit = auditSemanticEntailment({
    claim,
    realizedText: "一項觀察性研究顯示，青少年的短影音使用與較差睡眠品質存在關聯。",
  });
  assert.equal(audit.status, "entailed");
});

test("observational association cannot be strengthened into a causal conclusion", () => {
  const audit = auditSemanticEntailment({
    claim: {
      claimId: "observational",
      proposition: "An observational study found that short-form video use was associated with sleep quality among adolescents.",
      supportEvidenceIds: ["e1"],
      supportSourceIds: ["s1"],
      claimType: "association",
    },
    realizedText: "短影音會造成青少年的睡眠品質惡化。",
  });
  assert.equal(audit.status, "not_entailed");
  assert.ok(audit.issues.includes("causality_escalation"));
  assert.ok(audit.issues.includes("design_qualification_missing:observational"));
});

test("a conclusion cannot introduce a new number from an existing Evidence Card", () => {
  const audit = auditSemanticEntailment({
    claim: {
      claimId: "numberless-body",
      proposition: "青少年短影音使用與睡眠品質存在關聯。",
      supportEvidenceIds: ["e1"],
      supportSourceIds: ["s1"],
      claimType: "association",
    },
    realizedText: "青少年短影音使用與睡眠品質存在關聯，效果增加 18%。",
  });
  assert.equal(audit.status, "not_entailed");
  assert.ok(audit.issues.includes("novel_quantitative_detail:18"));
});

test("non-significant cannot be rewritten as no effect", () => {
  const audit = auditSemanticEntailment({
    claim: {
      claimId: "non-significant",
      proposition: "The adjusted association was non-significant.",
      supportEvidenceIds: ["e1"],
      supportSourceIds: ["s1"],
    },
    realizedText: "調整後顯示完全沒有影響。",
  });
  assert.equal(audit.status, "not_entailed");
  assert.ok(audit.issues.includes("null_or_non_significant_rewritten_as_proof_of_absence"));
});

test("attenuation after adjustment cannot be reversed or erased", () => {
  const reversed = auditSemanticEntailment({
    claim: {
      claimId: "attenuated",
      proposition: "The association attenuated after adjustment for confounders.",
      supportEvidenceIds: ["e1"],
      supportSourceIds: ["s1"],
    },
    realizedText: "控制混雜因子後，關聯仍然很強。",
  });
  assert.equal(reversed.status, "not_entailed");
  assert.ok(reversed.issues.includes("attenuation_reversed_after_adjustment"));
});

test("population, exposure, and measurement scopes cannot be substituted", () => {
  const population = auditSemanticEntailment({
    claim: {
      claimId: "university",
      proposition: "An experiment in university students measured generic screen time and sleep duration by self-report.",
      supportEvidenceIds: ["e1"],
      supportSourceIds: ["s1"],
    },
    realizedText: "實驗證明青少年的短影音使用會降低以腕動計測得的睡眠品質。",
  });
  assert.equal(population.status, "not_entailed");
  assert.ok(population.issues.includes("population_escalation:university_to_adolescent"));
  assert.ok(population.issues.includes("exposure_escalation:generic_to_short_video"));
  assert.ok(population.issues.includes("measurement_qualification_missing:self_report"));
});

test("resolved participant conflict uses authoritative Methods N while preserving conflict provenance", () => {
  const audit = auditConflictPolicy({
    realizedText: "正式分析樣本為 40 人。",
    policies: [{
      conflictId: "participant-n",
      status: "resolved",
      authoritativeValue: "30",
      conflictingValues: ["30", "40"],
    }],
  });
  assert.equal(audit.status, "blocked");
  assert.ok(audit.issues.includes("participant-n:non_authoritative_value:40"));
  const canonical = auditConflictPolicy({
    realizedText: "依 Methods 與 Procedure，正式分析樣本為 30 人；另一處曾記為 40 人，故保留來源內部衝突。",
    policies: [{
      conflictId: "participant-n",
      status: "resolved",
      authoritativeValue: "30",
      conflictingValues: ["30", "40"],
    }],
  });
  assert.equal(canonical.status, "pass");
});

test("unresolved 180 seconds versus 5 minutes cannot be asserted definitively", () => {
  const blocked = auditConflictPolicy({
    realizedText: "介入暴露時間為 5 minutes。",
    policies: [{
      conflictId: "exposure-duration",
      status: "unresolved",
      conflictingValues: ["180 seconds", "5 minutes"],
    }],
  });
  assert.equal(blocked.status, "blocked");
  const qualified = auditConflictPolicy({
    realizedText: "來源對暴露時間記為 180 seconds 與 5 minutes，衝突尚未解決，無法確定其一。",
    policies: [{
      conflictId: "exposure-duration",
      status: "unresolved",
      conflictingValues: ["180 seconds", "5 minutes"],
    }],
  });
  assert.equal(qualified.status, "pass");
});
