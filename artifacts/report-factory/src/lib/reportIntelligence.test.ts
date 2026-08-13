import assert from "node:assert/strict";
import test from "node:test";

import {
  CrossSourceClaimGraphSchema,
  NormalizedFactSchema,
  type NormalizedFact,
} from "@workspace/api-zod";

import {
  buildContradictionAnalysis,
  buildHeterogeneityAnalysis,
  buildResearchKnowledgeModel,
  buildStatisticalInterpretations,
  classifyFactComparability,
  evidenceAccessTierForFact,
  routeAudienceProfile,
  routeReportArchetype,
} from "./reportIntelligence.ts";

function fact(
  id: string,
  overrides: Partial<NormalizedFact> = {},
): NormalizedFact {
  const sourceId = overrides.sourceId ?? `source-${id}`;
  return NormalizedFactSchema.parse({
    factId: id,
    evidenceId: `evidence-${id}`,
    sourceId,
    canonicalSourceId: sourceId,
    sourceType: "journal_article",
    evidenceLevel: "direct",
    sourceAccessLevel: "structured_full_text",
    sectionType: "primary_results",
    claimTextZhTw: "高中生的短影音使用與較差睡眠品質呈正向關聯。",
    population: "高中生",
    ageGroup: "15–18 歲",
    sampleSize: 400,
    geography: "臺灣",
    studySetting: "高中校園",
    studyDesign: "橫斷觀察研究",
    exposureConcept: "短影音使用",
    exposureMeasure: "每日使用時數",
    outcomeConcept: "睡眠品質",
    outcomeMeasure: "PSQI 分數",
    statisticType: "correlation",
    value: 0.31,
    lowerCI: 0.12,
    upperCI: 0.47,
    pValue: 0.01,
    unit: "coefficient",
    direction: "positive",
    mediator: null,
    moderator: null,
    confounders: null,
    adjustmentStatus: "已調整年齡與性別",
    evidenceDirectness: "A",
    sourceSpan: "Results, paragraph 3",
    certainty: "moderate",
    confidence: 0.9,
    authorInterpretation: null,
    authorLimitations: null,
    extractionConfidence: 0.94,
    verificationStatus: "verified",
    evidenceFunction: "support",
    location: "臺灣",
    setting: "高中校園",
    exposure: "短影音使用",
    outcome: "睡眠品質",
    method: "橫斷觀察研究",
    numericalResults: [{
      rawText: "r = 0.31, 95% CI 0.12–0.47, p = 0.01",
      measure: "PSQI 分數",
      resultRole: "outcome",
      value: 0.31,
      unit: "coefficient",
      statisticType: "correlation",
      comparisonBasis: "短影音使用—PSQI",
      lowerCI: 0.12,
      upperCI: 0.47,
      pValue: 0.01,
      uncertainty: "95% CI",
    }],
    associationDirection: "positive",
    uncertainty: "95% CI",
    directness: "A",
    applicability: "臺灣高中校園樣本",
    locator: "Results, paragraph 3",
    themeKey: "短影音與睡眠品質",
    conceptAxes: ["exposure:短影音使用", "outcome:睡眠品質"],
    comparabilityKey: "population=高中生|exposure=短影音使用|outcome=睡眠品質|statistic=correlation",
    limitations: ["橫斷研究無法確認時間先後。"],
    supportingEvidenceIds: [`evidence-${id}`],
    supportingSourceIds: [sourceId],
    writerEligible: true,
    ...overrides,
  });
}

test("atomic_facts_are_source_traceable", () => {
  const parsed = fact("traceable");
  assert.equal(parsed.verificationStatus, "verified");
  assert.ok(parsed.sourceId);
  assert.ok(parsed.evidenceId);
  assert.ok(parsed.sourceSpan);
  assert.ok(parsed.locator);
  assert.deepEqual(parsed.supportingSourceIds, [parsed.sourceId]);
  assert.deepEqual(parsed.supportingEvidenceIds, [parsed.evidenceId]);
});

test("concepts_are_not_falsely_merged", () => {
  const base = fact("base");
  const cases: NormalizedFact[] = [
    fact("addiction", { exposureConcept: "短影音成癮", exposure: "短影音成癮" }),
    fact("social", { exposureConcept: "一般社群媒體使用", exposure: "一般社群媒體使用" }),
    fact("prevalence", { outcomeConcept: "睡眠不佳比例", outcomeMeasure: "PSQI 切點盛行率" }),
    fact("tiktok", { exposureConcept: "TikTok 使用", exposure: "TikTok 使用" }),
  ];
  for (const candidate of cases) {
    const result = classifyFactComparability(base, candidate);
    assert.equal(result.status, "NOT_COMPARABLE");
    assert.equal(result.numericPoolingAllowed, false);
  }

  const surfaceTemperature = fact("lst", {
    exposureConcept: "綠覆率",
    exposureMeasure: "樹冠覆蓋",
    outcomeConcept: "地表溫度",
    outcomeMeasure: "Landsat LST",
    statisticType: "mean_difference",
    unit: "°C",
  });
  const thermalComfort = fact("comfort", {
    exposureConcept: "綠覆率",
    exposureMeasure: "樹冠覆蓋",
    outcomeConcept: "熱舒適",
    outcomeMeasure: "PET",
    statisticType: "mean_difference",
    unit: "°C",
  });
  assert.equal(classifyFactComparability(surfaceTemperature, thermalComfort).status, "NOT_COMPARABLE");
});

test("heterogeneity_classification_is_consistent", () => {
  const base = fact("h1");
  assert.equal(classifyFactComparability(base, fact("h2", { sourceId: "source-h2", canonicalSourceId: "source-h2" })).status, "COMPARABLE");
  assert.equal(classifyFactComparability(base, fact("h3", { geography: "日本", location: "日本" })).status, "PARTIALLY_COMPARABLE");
  assert.equal(classifyFactComparability(base, fact("h4", {
    statisticType: "odds_ratio",
    value: 1.8,
    unit: "ratio",
    numericalResults: [{
      rawText: "OR = 1.8",
      measure: "睡眠不佳",
      value: 1.8,
      unit: "ratio",
      statisticType: "odds_ratio",
      lowerCI: 1.2,
      upperCI: 2.4,
      pValue: null,
      uncertainty: "95% CI",
    }],
  })).status, "DIRECTION_ONLY");
  assert.equal(classifyFactComparability(base, fact("h5", { outcomeConcept: "憂鬱症狀", outcome: "憂鬱症狀" })).status, "NOT_COMPARABLE");

  const first = buildHeterogeneityAnalysis([base, fact("h2")]);
  const reordered = buildHeterogeneityAnalysis([fact("h2"), base]);
  assert.deepEqual(
    first.comparisons.map((item) => item.status).sort(),
    reordered.comparisons.map((item) => item.status).sort(),
  );
});

test("no_cross_study_false_comparison", () => {
  const orFact = fact("or", {
    statisticType: "odds_ratio",
    unit: "ratio",
    value: 1.6,
    numericalResults: [{ rawText: "OR = 1.6", measure: "睡眠不佳", value: 1.6, unit: "ratio", statisticType: "odds_ratio", lowerCI: 1.1, upperCI: 2.2, pValue: null, uncertainty: "95% CI" }],
  });
  const rrFact = fact("rr", {
    statisticType: "risk_ratio",
    unit: "ratio",
    value: 1.6,
    numericalResults: [{ rawText: "RR = 1.6", measure: "睡眠不佳", value: 1.6, unit: "ratio", statisticType: "risk_ratio", lowerCI: 1.1, upperCI: 2.2, pValue: null, uncertainty: "95% CI" }],
  });
  const comparison = classifyFactComparability(orFact, rrFact);
  assert.equal(comparison.status, "DIRECTION_ONLY");
  assert.equal(comparison.numericPoolingAllowed, false);
});

test("statistical_interpretation_matches_type", () => {
  const interpretations = buildStatisticalInterpretations({ facts: [fact("stat")] });
  assert.equal(interpretations[0]?.statisticType, "correlation");
  assert.equal(interpretations[0]?.recommendedVisual, "correlation_matrix");
  assert.equal(interpretations[0]?.causalInterpretationAllowed, false);
  assert.ok(interpretations[0]?.warnings.includes("相關不等於因果。"));
});

test("odds_ratio_not_rendered_as_percentage", () => {
  const input = fact("or-interpretation", {
    statisticType: "odds_ratio",
    value: 1.42,
    lowerCI: 0.91,
    upperCI: 2.2,
    pValue: 0.08,
    unit: "ratio",
    numericalResults: [{
      rawText: "OR = 1.42, 95% CI 0.91–2.20, p = 0.08",
      measure: "睡眠不佳勝算",
      value: 1.42,
      unit: "ratio",
      statisticType: "odds_ratio",
      lowerCI: 0.91,
      upperCI: 2.2,
      pValue: 0.08,
      uncertainty: "95% CI",
    }],
  });
  const [result] = buildStatisticalInterpretations({ facts: [input] });
  assert.equal(result?.recommendedVisual, "forest_plot");
  assert.ok(result?.technicalExplanation.includes("不等同風險差或風險增加百分比"));
  assert.ok(result?.warnings.includes("勝算比不得改寫為風險增加百分比。"));
  assert.equal(result?.precisionStatus, "crosses_null");
  assert.ok(!result?.readerExplanation.includes("42%"));
});

test("correlation_not_claimed_as_causation", () => {
  const [result] = buildStatisticalInterpretations({ facts: [fact("correlation")] });
  assert.equal(result?.causalInterpretationAllowed, false);
  assert.match(result?.unsupportedConclusion ?? "", /不能宣稱因果/);
  assert.match(result?.readerExplanation ?? "", /不能證明/);
});

test("audience_profiles_change_explanation_depth", () => {
  const general = routeAudienceProfile("一般大眾");
  const highSchool = routeAudienceProfile("高中生研究報告");
  const professional = routeAudienceProfile("專業證據綜合");
  assert.notEqual(general.statisticalDetail, highSchool.statisticalDetail);
  assert.notEqual(highSchool.statisticalDetail, professional.statisticalDetail);
  assert.notEqual(general.methodDepth, professional.methodDepth);
  assert.notEqual(general.showEvidenceGrades, professional.showEvidenceGrades);
  assert.ok(professional.bodyTargetWords > general.bodyTargetWords);
});

test("report_archetype_matches_question", () => {
  const facts = [fact("a1"), fact("a2")];
  assert.equal(routeReportArchetype({ question: "如何設計一個短影音與睡眠的實驗？", facts }).archetypeId, "experimental_design");
  assert.equal(routeReportArchetype({ question: "A 與 B 哪個方案比較好？", facts }).archetypeId, "comparative_analysis");
  assert.equal(routeReportArchetype({ question: "研究結果為何互相矛盾？", facts }).archetypeId, "controversy_analysis");
  const limited = routeReportArchetype({ question: "這個政策是否值得採用？", facts: [fact("only")] });
  assert.equal(limited.archetypeId, "limited_evidence_report");
  assert.equal(limited.downgradedFrom, "policy_analysis");
});

test("claim_graph_contains_support_and_counterevidence", () => {
  const graph = CrossSourceClaimGraphSchema.parse({
    researchQuestion: "短影音使用與睡眠品質有何關係？",
    claims: [{
      claimId: "claim-1",
      claimType: "cross_source_shared_direction",
      readerFacingStatement: "較高短影音使用通常與較差睡眠品質同向變動。",
      supportingFacts: ["support"],
      contradictingFacts: ["counter"],
      backgroundFacts: [],
      applicability: ["高中生"],
      confidence: 0.65,
      citationIds: ["source-support", "source-counter"],
      visualizable: false,
      visualId: null,
      evidenceDirectness: "A",
      limitations: ["研究設計不一致。"],
    }],
    edges: [],
  });
  const analysis = buildContradictionAnalysis({
    claimGraph: graph,
    facts: [
      fact("support", { sourceId: "source-support", canonicalSourceId: "source-support", associationDirection: "positive" }),
      fact("counter", { sourceId: "source-counter", canonicalSourceId: "source-counter", associationDirection: "negative", direction: "negative" }),
    ],
  });
  assert.deepEqual(analysis[0]?.supportingFactIds, ["support"]);
  assert.deepEqual(analysis[0]?.counterFactIds, ["counter"]);
  assert.equal(analysis[0]?.status, "contradictory");
});

test("contradictory_evidence_is_not_hidden", () => {
  const graph = CrossSourceClaimGraphSchema.parse({
    researchQuestion: "研究方向是否一致？",
    claims: [{
      claimId: "claim-mixed",
      claimType: "research_difference",
      readerFacingStatement: "結果方向不一致。",
      supportingFacts: ["positive", "null"],
      contradictingFacts: ["negative"],
      backgroundFacts: [],
      applicability: ["青少年"],
      confidence: 0.5,
      citationIds: ["source-positive", "source-null", "source-negative"],
      visualizable: false,
      visualId: null,
      evidenceDirectness: "B",
      limitations: [],
    }],
    edges: [],
  });
  const [result] = buildContradictionAnalysis({
    claimGraph: graph,
    facts: [
      fact("positive", { sourceId: "source-positive", canonicalSourceId: "source-positive" }),
      fact("negative", { sourceId: "source-negative", canonicalSourceId: "source-negative", associationDirection: "negative", direction: "negative" }),
      fact("null", { sourceId: "source-null", canonicalSourceId: "source-null", associationDirection: "null", direction: "null" }),
    ],
  });
  assert.equal(result?.status, "contradictory");
  assert.deepEqual(result?.counterFactIds, ["negative"]);
  assert.deepEqual(result?.nullFactIds, ["null"]);
  assert.ok((result?.alternativeExplanations.length ?? 0) > 0);
  assert.ok(result?.discriminatingStudy);
});

test("knowledge model preserves association boundaries", () => {
  const model = buildResearchKnowledgeModel({
    researchQuestion: "短影音使用與睡眠品質有何關係？",
    facts: [fact("knowledge")],
  });
  assert.ok(model.nodes.some((node) => node.nodeType === "exposure"));
  assert.ok(model.nodes.some((node) => node.nodeType === "outcome"));
  assert.ok(model.nodes.some((node) => node.nodeType === "population"));
  assert.equal(model.edges[0]?.relationshipType, "association");
  assert.equal(model.edges[0]?.causalInterpretationAllowed, false);
  assert.ok(model.edges[0]?.uncertainty.some((item) => /不得畫成.*因果/u.test(item)));
});

test("evidence access tiers remain ordered and honest", () => {
  assert.equal(evidenceAccessTierForFact({ derivation: "fulltext-derived", sectionType: "results", sourceSpan: "paragraph" }), "structured_full_text");
  assert.equal(evidenceAccessTierForFact({ derivation: "fulltext-derived", sectionType: "unknown", sourceSpan: "paragraph" }), "verifiable_full_text_excerpt");
  assert.equal(evidenceAccessTierForFact({ derivation: "abstract-derived", abstractComplete: true }), "complete_abstract");
  assert.equal(evidenceAccessTierForFact({ derivation: "abstract-derived", abstractComplete: false }), "partial_abstract");
  assert.equal(evidenceAccessTierForFact({ derivation: "metadata-derived" }), "bibliographic_only");
});
