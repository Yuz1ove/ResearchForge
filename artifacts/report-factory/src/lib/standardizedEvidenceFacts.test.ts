import assert from "node:assert/strict";
import test from "node:test";

import type { EvidenceCard } from "./evidenceCards.ts";
import {
  auditStandardizedEvidenceFacts,
  buildStandardizedEvidenceFacts,
  buildStandardizedEvidenceFactsFromNormalizedPlan,
  prioritizeStandardizedEvidenceFacts,
} from "./standardizedEvidenceFacts.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-heat",
    title: "Cooling strategies for urban heat",
    authors: ["Huang, J.-M.", "Chen, L.-C."],
    year: 2020,
    abstract: null,
    doi: "10.1000/heat",
    url: "https://doi.org/10.1000/heat",
    sourceType: "Semantic Scholar",
    provider: "Semantic Scholar",
    reviewState: "accepted",
    publisher: null,
    containerTitle: "Sustainable Cities",
    accessedAt: null,
    sourceCategory: "journal_article",
    confidence: "高",
    usableSections: ["數據分析"],
    ...overrides,
  } as SourceRecord;
}

function card(exactResult: string, overrides: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    id: "evidence:source-heat:1",
    evidenceId: "evidence:source-heat:1",
    workflowId: "workflow-facts",
    topicHash: "topic-facts",
    sourceId: "source-heat",
    citationMarker: "Huang & Chen（2020）",
    title: "Cooling strategies for urban heat",
    sourceType: "Semantic Scholar",
    reliability: "高",
    claim: exactResult,
    claimTextZhTw: exactResult,
    mainClaim: exactResult,
    evidence: exactResult,
    evidencePointZhTw: exactResult,
    usableEvidence: exactResult,
    quoteOrParaphrase: exactResult,
    summary: exactResult,
    sourceExcerptOriginal: exactResult,
    sourceSummaryZhTw: exactResult,
    relevance: "finding",
    limitations: [],
    limitationsZhTw: [],
    sectionTargets: ["findings"],
    sourceTitle: "Cooling strategies for urban heat",
    sourceUrl: "https://doi.org/10.1000/heat",
    sourceDomain: "doi.org",
    sourceProvider: "Semantic Scholar",
    sourceCategory: "journal_article",
    doi: "10.1000/heat",
    abstract: exactResult,
    provider: "Semantic Scholar",
    relevanceScore: 0.9,
    sourceQualityScore: 0.9,
    finalScore: 0.9,
    year: 2020,
    usableSections: ["數據分析"],
    confidence: "高",
    confidenceScore: 0.9,
    derivation: "abstract-derived",
    limitation: null,
    citationText: "Huang & Chen（2020）",
    createdAt: "2026-08-13T00:00:00.000Z",
    notes: "",
    exactResult,
    locator: "abstract",
    evidenceDirectnessTier: "B",
    ...overrides,
  } as EvidenceCard;
}

test("standardized facts exclude years and scenario ordinals from numerical outcomes", () => {
  const exactResult = [
    "Five improvement strategies were tested in 2018.",
    "The current thermal environment was 36.0 °C.",
    "The combined strategy cooled the area by an average of 2.00 °C.",
    "For every 10% increase in street green coverage, pedestrian temperature was reduced by 0.15 °C.",
  ].join(" ");
  const facts = buildStandardizedEvidenceFacts([card(exactResult)], [source({ abstract: exactResult })]);
  const results = facts[0]?.numericalResults ?? [];

  assert.deepEqual(results.map((result) => result.displayValue), [
    "36.0 °C",
    "2.00 °C",
    "10%",
    "0.15 °C",
  ]);
  assert.equal(results.some((result) => result.displayValue.includes("2018")), false);
  assert.equal(results.find((result) => result.displayValue === "36.0 °C")?.resultRole, "baseline");
  assert.equal(results.find((result) => result.displayValue === "10%")?.resultRole, "exposure");
  assert.equal(results.find((result) => result.displayValue === "0.15 °C")?.resultRole, "outcome");
  assert.deepEqual(auditStandardizedEvidenceFacts(facts), []);
});

test("a reported 7–9 degree range remains one range instead of two ranked values", () => {
  const exactResult = "We found a consistent variation of between 7 and 9 degrees Celsius for land surface temperature across campus.";
  const rangeSource = source({
    id: "source-range",
    authors: ["Addas, A."],
    title: "Campus land surface temperature",
    abstract: exactResult,
  });
  const facts = buildStandardizedEvidenceFacts([
    card(exactResult, {
      id: "evidence:source-range:1",
      evidenceId: "evidence:source-range:1",
      sourceId: "source-range",
      sourceTitle: rangeSource.title,
    }),
  ], [rangeSource]);
  const results = facts[0]?.numericalResults ?? [];

  assert.equal(results.length, 1);
  assert.equal(results[0]?.value, null);
  assert.equal(results[0]?.lowerBound, 7);
  assert.equal(results[0]?.upperBound, 9);
  assert.equal(results[0]?.displayValue, "7–9 °C");
  assert.equal(results[0]?.statisticType, "group_difference");
});

test("publication venue and retrieval provider remain separate fact fields", () => {
  const exactResult = "Results showed that the maximum air temperature difference reached 8.9 ℃.";
  const facts = buildStandardizedEvidenceFacts([card(exactResult)], [source({
    abstract: exactResult,
    containerTitle: "Atmosphere",
    provider: "Semantic Scholar",
  })]);

  assert.equal(facts[0]?.publicationVenue, "Atmosphere");
  assert.equal(facts[0]?.retrievalProvider, "Semantic Scholar");
  assert.equal(facts[0]?.numericalResults[0]?.sourceId, "source-heat");
  assert.equal(facts[0]?.numericalResults[0]?.sourceField, "exactResult");
});

test("canonical planner facts are the primary renderer facts without re-inferring dimensions", () => {
  const canonicalFact = {
    factId: "fact-canonical-result-1",
    parentFactId: "fact-canonical",
    resultIndex: 0,
    evidenceId: "evidence:source-heat:1",
    sourceId: "source-heat",
    canonicalSourceId: "source-heat",
    claimTextZhTw: "規劃階段已確認短影音使用與睡眠品質的結果。",
    population: "高中生",
    ageGroup: "15–18 歲",
    sampleSize: 1629,
    geography: "中國",
    studyDesign: "橫斷面問卷",
    exposureConcept: "短影音成癮",
    exposureMeasure: "短影音成癮量表",
    outcomeConcept: "睡眠品質",
    outcomeMeasure: "PSQI",
    statisticType: "prevalence",
    value: 31.06,
    lowerCI: null,
    upperCI: null,
    unit: "%",
    direction: "positive",
    mediator: "社交焦慮",
    adjustmentStatus: "未報告",
    evidenceDirectness: "A",
    sourceSpan: "睡眠品質問題檢出率為 31.06%。",
    certainty: "中等",
    confidence: 0.9,
    evidenceFunction: "support",
    location: "中國",
    setting: "三所高中",
    exposure: "短影音成癮",
    outcome: "睡眠品質",
    method: "橫斷面問卷",
    numericalResults: [{
      rawText: "31.06%",
      measure: "睡眠品質問題檢出率",
      value: 31.06,
      unit: "%",
      statisticType: "prevalence",
      lowerCI: null,
      upperCI: null,
      uncertainty: null,
    }],
    associationDirection: "positive",
    uncertainty: null,
    directness: "A",
    applicability: "適用於納入的高中生樣本。",
    locator: "abstract:results",
    themeKey: "sleep_quality",
    conceptAxes: ["exposure:short_video", "outcome:sleep_quality"],
    comparabilityKey: "prevalence|sleep_quality|high_school",
    limitations: ["橫斷面設計不能推論因果。"],
    supportingEvidenceIds: ["evidence:source-heat:1"],
    supportingSourceIds: ["source-heat"],
    writerEligible: true,
  } as const;
  const facts = buildStandardizedEvidenceFactsFromNormalizedPlan(
    [canonicalFact],
    [source({ containerTitle: "Sleep Medicine", provider: "Semantic Scholar" })],
  );

  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.factId, canonicalFact.factId);
  assert.equal(facts[0]?.population, "高中生");
  assert.equal(facts[0]?.location, "中國");
  assert.equal(facts[0]?.setting, "三所高中");
  assert.equal(facts[0]?.exposure, "短影音成癮");
  assert.equal(facts[0]?.outcome, "睡眠品質");
  assert.equal(facts[0]?.method, "橫斷面問卷");
  assert.equal(facts[0]?.numericalResults[0]?.rawValue, "31.06%");
  assert.equal(facts[0]?.publicationVenue, "Sleep Medicine");
  assert.equal(facts[0]?.retrievalProvider, "Semantic Scholar");
  assert.deepEqual(auditStandardizedEvidenceFacts(facts), []);
});

test("atomic sleep facts preserve explicit dimensions and leave unsupported fields null", () => {
  const exactResult = [
    "A questionnaire survey was conducted in this cross-sectional study on 1629 adolescents recruited from three high schools.",
    "Their short-form video addiction, social anxiety, and sleep quality were evaluated using corresponding scales.",
    "Participants’ sleep quality score is 6.12 ± 3.29 points.",
    "The detection rate of sleep quality among them is 31.06%.",
    "Short-form video addiction, sleep quality, and social anxiety are significantly correlated (r = 0.439, 0.404, 0.457, P < 0.001).",
    "The direct effect of short-form video addiction on sleep quality is 0.248, accounting for 62.4% of the total effect.",
    "The indirect effect exerted through social anxiety is 0.149, accounting for 37.6%.",
  ].join(" ");
  const sleepSource = source({
    id: "source-sleep",
    title: "Adolescents’ short-form video addiction and sleep quality: the mediating role of social anxiety",
    abstract: exactResult,
  });
  const fact = buildStandardizedEvidenceFacts([
    card(exactResult, {
      id: "evidence:source-sleep:1",
      evidenceId: "evidence:source-sleep:1",
      sourceId: sleepSource.id,
      sourceTitle: sleepSource.title,
      evidenceDirectnessTier: "A",
    }),
  ], [sleepSource])[0];

  assert.equal(fact?.population?.toLocaleLowerCase(), "adolescents");
  assert.equal(fact?.ageGroup, "高中生");
  assert.equal(fact?.sampleSize, 1629);
  assert.equal(fact?.geography, null);
  assert.equal(fact?.studyDesign?.toLocaleLowerCase(), "cross-sectional");
  assert.equal(fact?.exposureConcept, "短影音成癮");
  assert.equal(fact?.outcomeConcept, "睡眠不佳比例");
  assert.match(fact?.mediator ?? "", /社交焦慮/u);
  assert.equal(fact?.adjustmentStatus, null);
  assert.equal(fact?.evidenceDirectness, "A");
  assert.equal(fact?.sourceSpan, exactResult);

  const values = fact?.numericalResults ?? [];
  assert.ok(values.some((result) =>
    result.statisticType === "prevalence" &&
    result.metric === "sleep_quality_detection_rate" &&
    result.value === 31.06
  ));
  assert.deepEqual(
    values.filter((result) => result.statisticType === "correlation_coefficient")
      .map((result) => [result.value, result.comparisonBasis]),
    [
      [0.439, "短影音成癮—睡眠品質"],
      [0.404, "短影音成癮—社交焦慮"],
      [0.457, "睡眠品質—社交焦慮"],
    ],
  );
  assert.ok(values.some((result) =>
    result.statisticType === "direct_effect" && result.value === 0.248
  ));
  assert.ok(values.some((result) =>
    result.statisticType === "indirect_effect" && result.value === 0.149
  ));
  assert.deepEqual(auditStandardizedEvidenceFacts([fact!]), []);
});

test("OR estimates remain one effect datum with CI and never become percentages", () => {
  const exactResult = [
    "A cross-sectional study was conducted on 961 secondary school students in Aseer Region, Saudi Arabia.",
    "TikTok (80%) was the most reported platform used.",
    "Regarding sleep quality, 34.7% of students were poor sleepers.",
    "TikTok use (OR 1.33, 95% CI 1.01-1.77), hours spent on social media (OR 1.26, 95% CI 1.16-1.37) and having moderate to severe depressive symptoms (OR 1.69, 95% CI 1.19-2.40) were significant independent predictors of poor sleep.",
  ].join(" ");
  const oddsSource = source({
    id: "source-odds",
    title: "Social Media Use and Sleep Quality Among Secondary School Students",
    abstract: exactResult,
  });
  const fact = buildStandardizedEvidenceFacts([
    card(exactResult, {
      id: "evidence:source-odds:1",
      evidenceId: "evidence:source-odds:1",
      sourceId: oddsSource.id,
      sourceTitle: oddsSource.title,
      evidenceDirectnessTier: "B",
    }),
  ], [oddsSource])[0];
  const results = fact?.numericalResults ?? [];
  const odds = results.filter((result) => result.statisticType === "odds_ratio");

  assert.equal(fact?.sampleSize, 961);
  assert.equal(fact?.ageGroup, "中學生");
  assert.match(fact?.geography ?? "", /Aseer Region/u);
  assert.deepEqual(odds.map((result) => [result.value, result.lowerBound, result.upperBound]), [
    [1.33, 1.01, 1.77],
    [1.26, 1.16, 1.37],
    [1.69, 1.19, 2.4],
  ]);
  assert.equal(results.some((result) => result.rawValue === "95%"), false);
  assert.ok(results.some((result) =>
    result.statisticType === "prevalence" && result.value === 34.7
  ));
  assert.ok(results.some((result) =>
    result.metric === "media_use_prevalence" && result.value === 80
  ));
  assert.deepEqual(auditStandardizedEvidenceFacts([fact!]), []);
});

test("numeric facts retain naked OR beta correlation predictor outcome and denominator semantics", () => {
  const exactResult = [
    "In Table 3, 58% (n = 205) of respondents reported poor sleep quality.",
    "Higher YIAT-SF scores (OR = 1.067, p = 0.010) and screen exposure in the last hour before sleep (OR = 5.487, p < 0.001) were associated with poor sleep quality.",
    "Weekend screen time negatively predicted sleep quality (beta = -0.27, p = 0.016), while total screen time correlated with sleep quality (r = -0.18, p < 0.01).",
  ].join(" ");
  const semanticSource = source({
    id: "source-semantic-numbers",
    title: "Screen exposure and poor sleep quality among high school students",
    abstract: exactResult,
  });
  const fact = buildStandardizedEvidenceFacts([
    card(exactResult, {
      id: "evidence:source-semantic-numbers:1",
      evidenceId: "evidence:source-semantic-numbers:1",
      sourceId: semanticSource.id,
      sourceTitle: semanticSource.title,
      population: "high school students",
      exposure: "pre-sleep screen exposure",
      outcome: "poor sleep quality",
    }),
  ], [semanticSource])[0];
  const results = fact?.numericalResults ?? [];

  assert.equal(fact?.sampleSize, 205);
  assert.deepEqual(
    results.filter((result) => result.statisticType === "odds_ratio")
      .map((result) => [result.value, result.comparisonBasis]),
    [
      [1.067, "YIAT-SF score"],
      [5.487, "screen exposure in the last hour before sleep"],
    ],
  );
  assert.ok(results.some((result) =>
    result.statisticType === "regression_coefficient" &&
    result.value === -0.27 &&
    /weekend screen time/iu.test(result.comparisonBasis ?? "")
  ));
  assert.ok(results.some((result) =>
    result.statisticType === "correlation_coefficient" &&
    result.value === -0.18 &&
    /total screen time/iu.test(result.comparisonBasis ?? "")
  ));
  assert.ok(results.some((result) =>
    result.statisticType === "prevalence" &&
    result.value === 58 &&
    result.comparisonBasis === "睡眠不佳比例"
  ));
});

test("reported study design follows methods abstract metadata title priority and keeps inference separate", () => {
  const designSource = source({
    id: "source-design-priority",
    title: "A cross-sectional study of learning outcomes",
    abstract: "This longitudinal study followed students across two years.",
    extractedSections: [{
      heading: "Methods",
      text: "We conducted a randomized controlled trial with concealed allocation.",
      page: 3,
      confidence: 0.99,
    }],
  });
  const fact = buildStandardizedEvidenceFacts([
    card("The study reports learning outcomes after the intervention.", {
      id: "evidence:source-design-priority:1",
      evidenceId: "evidence:source-design-priority:1",
      sourceId: designSource.id,
      sourceTitle: designSource.title,
      studyDesign: "cohort study",
    }),
  ], [designSource])[0];

  assert.equal(fact?.studyDesign, "randomized controlled trial");
  assert.equal(fact?.reportedDesign?.extractionLevel, "full_text_methods");
  assert.match(fact?.reportedDesign?.sourceSpan ?? "", /randomized controlled trial/iu);
  assert.equal(fact?.inferredDesign, null);

  const inferredSource = source({
    id: "source-design-inferred",
    title: "Student sleep and grades",
    abstract: "Students completed one questionnaire about sleep and grades.",
  });
  const inferred = buildStandardizedEvidenceFacts([
    card("Students completed one questionnaire about sleep and grades.", {
      id: "evidence:source-design-inferred:1",
      evidenceId: "evidence:source-design-inferred:1",
      sourceId: inferredSource.id,
      sourceTitle: inferredSource.title,
      studyDesign: null,
    }),
  ], [inferredSource])[0];
  assert.equal(inferred?.reportedDesign, null);
  assert.equal(inferred?.studyDesign, null);
  assert.equal(inferred?.inferredDesign?.value, "cross-sectional");
  assert.equal(inferred?.inferredDesign?.extractionLevel, "inference");
});

test("quantitative prioritization ranks the RQ-direct exposure outcome result ahead of secondary statistics", () => {
  const exactResult = "Higher YIAT-SF scores (OR = 1.067, p = 0.010) and screen exposure in the last hour before sleep (OR = 5.487, p < 0.001) were associated with poor sleep quality.";
  const rqSource = source({ id: "source-rq-priority", title: "Screen exposure and sleep quality", abstract: exactResult });
  const facts = buildStandardizedEvidenceFacts([
    card(exactResult, {
      id: "evidence:source-rq-priority:1",
      evidenceId: "evidence:source-rq-priority:1",
      sourceId: rqSource.id,
      sourceTitle: rqSource.title,
    }),
  ], [rqSource]);
  const prioritized = prioritizeStandardizedEvidenceFacts(
    facts,
    "睡前螢幕暴露與睡眠品質之間的關聯",
  );

  assert.equal(prioritized[0]?.numericalResults[0]?.value, 5.487);
  assert.match(prioritized[0]?.numericalResults[0]?.comparison ?? "", /screen exposure/iu);
  assert.notEqual(prioritized[0]?.numericalResults[0]?.metricType, "p_value");
});
