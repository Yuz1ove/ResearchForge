import assert from "node:assert/strict";
import test from "node:test";

import {
  ArgumentMapSchema,
  NormalizedFactSchema,
  NormalizedWriterEvidenceSchema,
  SynthesisClusterSchema,
} from "@workspace/api-zod";

import type { EvidenceCard } from "./evidenceCards.ts";
import {
  auditBoundedEditorialPass,
  auditReportCoherence,
  auditReportLanguageAndArtifacts,
  auditTraditionalChineseTerminology,
  applyBoundedCoherencePass,
  buildSynthesisClusters,
  buildReportComposition,
  normalizeFactsForWriter,
  normalizeTraditionalChineseTerminology,
  normalizeEvidenceForWriter,
} from "./reportComposer.ts";

function card(index: number, overrides: Partial<EvidenceCard> = {}): EvidenceCard {
  return {
    id: `card-${index}`,
    evidenceId: `evidence-${index}`,
    sourceId: `source-${index}`,
    canonicalSourceKey: `doi:10.1000/composer-${index}`,
    citationKey: `doi:10.1000/composer-${index}`,
    citationMarker: `[S${index}]`,
    citationText: `[S${index}]`,
    claimTextZhTw: `研究 ${index} 顯示變項之間存在具條件性的關聯。`,
    mainClaimZhTw: `研究 ${index} 顯示變項之間存在具條件性的關聯。`,
    evidencePointZhTw: `研究 ${index} 在明確樣本範圍內觀察到具條件性的關聯。`,
    sourceSummaryZhTw: `研究 ${index} 提供可追溯的繁體中文證據摘要。`,
    sourceExcerptOriginal: `Study ${index} reports a conditional association in a defined sample.`,
    supportSpan: `Study ${index} reports a conditional association in a defined sample.`,
    supportedByText: `Study ${index} reports a conditional association in a defined sample.`,
    evidenceType: index % 2 === 0 ? "mechanism" : "outcome",
    sectionTargets: [index % 2 === 0 ? "findings" : "literature_review"],
    limitations: [],
    limitationsZhTw: [],
    confidenceScore: 0.8,
    derivation: "abstract-derived",
    abstractOnly: true,
    sourceRole: "academic_evidence",
    sourceTitle: `來源 ${index}`,
    sourceProvider: "OpenAlex",
    sourceType: "journal",
    title: `來源 ${index}`,
    reliability: "高",
    claim: `研究 ${index} 顯示變項之間存在具條件性的關聯。`,
    mainClaim: `研究 ${index} 顯示變項之間存在具條件性的關聯。`,
    evidence: `研究 ${index} 提供可追溯證據。`,
    usableEvidence: `研究 ${index} 提供可追溯證據。`,
    quoteOrParaphrase: `研究 ${index} 提供可追溯證據。`,
    summary: `研究 ${index} 提供可追溯證據。`,
    relevance: "研究主題相關",
    usableSections: ["文獻探討"],
    workflowId: "wf-composer",
    topicHash: "topic-composer",
    sourceUrl: null,
    sourceDomain: "example.org",
    sourceCategory: "journal",
    doi: `10.1000/composer-${index}`,
    abstract: `Study ${index} reports a conditional association in a defined sample.`,
    provider: "OpenAlex",
    relevanceScore: 0.8,
    sourceQualityScore: 0.8,
    finalScore: 0.8,
    year: 2025,
    confidence: "高",
    limitation: null,
    createdAt: "2026-08-12T00:00:00.000Z",
    notes: "",
    ...overrides,
  } as EvidenceCard;
}

test("raw Evidence Card fields stay in audit trace and never become writer claims", () => {
  const rawAbstract = "This long English abstract contains raw material that must never be pasted into the formal report body because it has not been normalized.";
  const evidence = normalizeEvidenceForWriter([
    card(1, {
      claimTextZhTw: "",
      mainClaimZhTw: "",
      evidencePointZhTw: "",
      sourceSummaryZhTw: "",
      claim: rawAbstract,
      mainClaim: rawAbstract,
      evidence: rawAbstract,
      usableEvidence: rawAbstract,
      summary: rawAbstract,
      sourceExcerptOriginal: rawAbstract,
      supportSpan: rawAbstract,
    }),
  ]);

  assert.equal(evidence[0]?.originalSpan, rawAbstract);
  assert.equal(evidence[0]?.writerEligible, false);
  assert.doesNotMatch(evidence[0]?.normalizedClaimZhTw ?? "", /This long English abstract/u);
  assert.equal(NormalizedWriterEvidenceSchema.safeParse(evidence[0]).success, true);
});

test("evidence clustering and ArgumentMap serialization are stable across random card order", () => {
  const first = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [card(1), card(2), card(3)],
  });
  const second = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [card(3), card(1), card(2)],
  });

  assert.deepEqual(first, second);
  assert.equal(ArgumentMapSchema.safeParse(first.argumentMap).success, true);
  assert.equal(first.compositionKind, "complete_research_report");
  assert.ok(first.discoursePlan.some((section) => section.sectionRole === "cross_source_synthesis"));
  assert.equal(first.discoursePlan.at(-1)?.sectionClaim, first.argumentMap.centralAnswer);
});

test("normalized facts form one traceable multi-source thematic synthesis cluster", () => {
  const cards = [1, 2].map((index) => card(index, {
    evidenceType: "finding",
    exposure: index === 1 ? "綠視率" : "GVI",
    outcome: index === 1 ? "地表溫度" : "LST",
    researchSetting: "校園",
    studyDesign: "遙測或空間觀測",
    numericResult: index === 1 ? "-1.2°C" : "-0.8°C",
    evidenceDirectnessTier: "A",
    claimTextZhTw: "較高綠視率與較低地表溫度呈反向關聯。",
    mainClaimZhTw: "較高綠視率與較低地表溫度呈反向關聯。",
    evidencePointZhTw: "較高綠視率與較低地表溫度呈反向關聯。",
  }));

  const facts = normalizeFactsForWriter(cards);
  const clusters = buildSynthesisClusters(facts);
  const composition = buildReportComposition({
    topic: "校園綠視率與地表溫度",
    evidenceCards: [...cards].reverse(),
  });

  assert.ok(facts.every((fact) => NormalizedFactSchema.safeParse(fact).success));
  assert.ok(clusters.every((cluster) => SynthesisClusterSchema.safeParse(cluster).success));
  assert.equal(clusters.length, 1);
  assert.deepEqual(clusters[0]?.sourceIds, [
    "doi:10.1000/composer-1",
    "doi:10.1000/composer-2",
  ]);
  assert.equal(clusters[0]?.agreementStatus, "corroborated");
  assert.equal(composition.argumentMap.claims.length, 1);
  assert.equal(composition.argumentMap.claims[0]?.sourceCount, 2);
  assert.equal(composition.argumentMap.claims[0]?.supportingEvidenceIds.length, 2);
  assert.deepEqual(composition.synthesisClusters, clusters);
});

test("different metrics may share a thematic cluster but never become a pooled numeric result", () => {
  const facts = normalizeFactsForWriter([
    card(1, {
      evidenceType: "finding",
      exposure: "綠視率",
      outcome: "地表溫度",
      numericResult: "-1.2°C",
      claimTextZhTw: "綠視率與地表溫度呈反向關聯。",
    }),
    card(2, {
      evidenceType: "finding",
      exposure: "NDVI",
      outcome: "熱舒適",
      numericResult: "12%",
      claimTextZhTw: "NDVI 與熱舒適呈同向關聯。",
    }),
  ]);
  const clusters = buildSynthesisClusters(facts);

  assert.equal(clusters.length, 3);
  assert.equal(new Set(facts.map((fact) => fact.comparabilityKey)).size, 2);
  const thematic = clusters.find((cluster) => cluster.clusterPurpose === "relationship");
  assert.equal(thematic?.sourceIds.length, 2);
  assert.equal(thematic?.comparabilityKeys.length, 2);
  assert.equal(thematic?.numericAggregationAllowed, false);
  assert.ok(thematic?.conflictPoints.some((point) => /不得直接合併或排名/u.test(point)));
  assert.ok(clusters.some((cluster) => cluster.clusterPurpose === "exposure_translation"));
  assert.ok(clusters.some((cluster) => cluster.clusterPurpose === "outcome_hierarchy"));
});

test("atomic_fact_schema_preserves_nulls", () => {
  const [fact] = normalizeFactsForWriter([card(1, {
    title: "高中生短影音使用與睡眠品質",
    claimTextZhTw: "高中生短影音使用與較差睡眠品質呈正向關聯。",
    exposure: "短影音使用",
    outcome: "睡眠品質分數",
    studyDesign: "橫斷式研究",
    dataScope: "n = 1,236 名高中生",
    exactResult: "結果顯示 OR=1.33，95% CI 1.01–1.77。",
    evidenceDirectnessTier: "A",
  })]);

  assert.ok(fact);
  assert.equal(fact.population, "高中生");
  assert.equal(fact.sampleSize, 1236);
  assert.equal(fact.exposureConcept, "短影音使用");
  assert.equal(fact.outcomeConcept, "睡眠品質分數");
  assert.equal(fact.statisticType, "odds_ratio");
  assert.equal(fact.value, 1.33);
  assert.equal(fact.lowerCI, 1.01);
  assert.equal(fact.upperCI, 1.77);
  assert.equal(fact.mediator, null);
  assert.equal(fact.adjustmentStatus, null);
  assert.equal(fact.evidenceDirectness, "A");
  assert.equal(fact.directness, fact.evidenceDirectness);
  assert.equal(NormalizedFactSchema.safeParse(fact).success, true);
});

test("atomic_numerical_results_are_distinct_facts", () => {
  const facts = normalizeFactsForWriter([card(1, {
    title: "高中生短影音使用、社交焦慮與睡眠品質",
    claimTextZhTw: "短影音使用與較差睡眠品質呈正向關聯，社交焦慮可能為中介變項。",
    exposure: "短影音使用",
    outcome: "睡眠品質分數",
    exactResult: "睡眠不佳 OR=1.33，95% CI 1.01–1.77；社交焦慮 r=0.42。",
    evidenceDirectnessTier: "A",
  })]);

  assert.equal(facts.length, 2);
  assert.equal(new Set(facts.map((fact) => fact.factId)).size, 2);
  assert.equal(new Set(facts.map((fact) => fact.parentFactId)).size, 1);
  assert.deepEqual(facts.map((fact) => fact.resultIndex).sort(), [0, 1]);
  assert.deepEqual(new Set(facts.map((fact) => fact.statisticType)), new Set([
    "odds_ratio",
    "correlation_coefficient",
  ]));
  assert.ok(facts.every((fact) => fact.numericalResults.length === 1));
  assert.ok(facts.every((fact) => NormalizedFactSchema.safeParse(fact).success));
});

test("short_video_atomic_results_keep_local_semantics_and_all_claim_graph_roles", () => {
  const cards = [
    card(1, {
      canonicalSourceKey: "doi:10.2147/ijgm.s464457",
      evidenceType: "finding",
      claimTextZhTw: "中學生的社群媒體使用與睡眠不佳有關，研究同時報告多種平台比例與校正後勝算比。",
      dataScope: "A cross-sectional study included 961 public secondary school students in Aseer Region, Saudi Arabia.",
      location: "Aseer Region, Saudi Arabia",
      studyDesign: "cross-sectional study",
      exposure: "TikTok 使用",
      outcome: "睡眠不佳比例",
      exactResult: "Tiktok (80%), Snapchat (77.9%), Instagram (63.8%) and YouTube (58.8%) were used. Regarding sleep quality, 34.7% were poor sleepers. TikTok use (OR 1.33, 95% CI 1.01-1.77), hours spent on social media (OR 1.26, 95% CI 1.16-1.37) and having moderate to severe depressive symptoms (OR 1.69, 95% CI 1.19-2.40) were independent predictors of poor sleep.",
      evidenceDirectnessTier: "B",
    }),
    card(2, {
      canonicalSourceKey: "doi:10.1186/s40359-024-02089-4",
      evidenceType: "finding",
      claimTextZhTw: "高中生短影音成癮、社交焦慮與睡眠品質彼此相關，社交焦慮呈部分中介。",
      dataScope: "A questionnaire survey recruited 1629 adolescents from three high schools in China.",
      location: "China",
      studyDesign: "cross-sectional study",
      exposure: "短影音成癮",
      outcome: "睡眠品質分數",
      exactResult: "The detection rate of sleep quality was 31.06%. Short-form video addiction, sleep quality, and social anxiety were correlated (r = 0.439, 0.404, 0.457, P < 0.001). The direct effect was 0.248, accounting for 62.4% of the total effect. The indirect effect through social anxiety was 0.149, accounting for 37.6%. Social anxiety partially mediated the relationship.",
      evidenceDirectnessTier: "A",
    }),
  ];
  const facts = normalizeFactsForWriter(cards);
  const byValue = new Map(facts.map((fact) => [fact.value, fact] as const));

  assert.equal(byValue.get(80)?.exposure, "TikTok 使用");
  assert.equal(byValue.get(77.9)?.exposure, "Snapchat 使用");
  assert.equal(byValue.get(63.8)?.exposure, "Instagram 使用");
  assert.equal(byValue.get(58.8)?.exposure, "YouTube 使用");
  assert.equal(byValue.get(1.26)?.exposure, "一般社群媒體使用時數");
  assert.equal(byValue.get(1.69)?.exposure, "中重度憂鬱症狀");
  assert.equal(byValue.get(1.69)?.outcome, "睡眠不佳");
  assert.deepEqual(
    facts.filter((fact) => fact.statisticType === "correlation_coefficient").map((fact) => fact.value).sort(),
    [0.404, 0.439, 0.457],
  );
  assert.equal(byValue.get(37.6)?.statisticType, "effect_share");
  assert.equal(byValue.get(37.6)?.mediator, "社交焦慮");
  assert.equal(byValue.get(62.4)?.mediator, null);
  assert.notEqual(byValue.get(1.33)?.comparabilityKey, byValue.get(1.26)?.comparabilityKey);

  const graph = buildReportComposition({
    topic: "高中生短影音使用與睡眠品質",
    evidenceCards: cards,
  }).claimGraph;
  assert.deepEqual(
    new Set(graph.claims.map((claim) => claim.claimType)),
    new Set([
      "direct_result",
      "cross_source_shared_direction",
      "research_difference",
      "possible_mechanism",
      "applicability_boundary",
      "evidence_gap",
      "author_synthesis",
    ]),
  );
  assert.ok(graph.claims.filter((claim) => claim.claimType === "direct_result").every(
    (claim) => claim.supportingFacts.length > 0,
  ));
});

test("review_count_is_not_misreported_as_participant_sample_size", () => {
  const bozzolaExcerpt = "Aim of the review is to focus on risks correlated to social media use by children and adolescents. The scoping review was performed according to PRISMA guidelines. Excluding articles not pertinent, we found 68 reports. Other identified associated problems were sleep, addiction, and anxiety.";
  const bozzolaCard = card(1, {
    title: "The Use of Social Media in Children and Adolescents: Scoping Review on the Potential Risks",
    evidenceType: null,
    claimTextZhTw: "範疇性回顧納入 68 篇報告，但未專門聚焦高中生，也未提供高中生樣本或短影音與睡眠的直接效應估計。",
    dataScope: null,
    exactResult: bozzolaExcerpt,
    sourceExcerptOriginal: bozzolaExcerpt,
    supportSpan: bozzolaExcerpt,
    supportedByText: bozzolaExcerpt,
    exposure: "Use of Social Media",
    outcome: "憂鬱",
    evidenceDirectnessTier: "B",
  });
  const facts = normalizeFactsForWriter([bozzolaCard]);
  const graph = buildReportComposition({
    topic: "高中生短影音使用與睡眠品質",
    evidenceCards: [bozzolaCard],
  }).claimGraph;

  assert.ok(facts.length > 0);
  assert.ok(facts.every((fact) => fact.sampleSize === null));
  assert.ok(facts.every((fact) => fact.population === null));
  assert.ok(facts.every((fact) => fact.ageGroup === null));
  assert.ok(facts.every((fact) => fact.evidenceFunction === "background"));
  assert.ok(facts.every((fact) => !/在高中生樣本中/u.test(fact.claimTextZhTw)));
  assert.ok(graph.claims.every((claim) => claim.claimType !== "direct_result"));
});

test("negated_high_school_mentions_do_not_override_the_observed_population", () => {
  const [fact] = normalizeFactsForWriter([card(1, {
    claimTextZhTw: "研究調查 677 名大學生，未專門聚焦高中生，也未提供高中生樣本分析。",
    dataScope: "The sample included 677 Chinese college students.",
    exactResult: "The sample included 677 Chinese college students and did not specifically focus on high school students.",
  })]);

  assert.equal(fact?.population, "大學生");
  assert.equal(fact?.ageGroup, "大學生");
  assert.equal(fact?.sampleSize, 677);
});

test("mediator_extraction_is_syntax_anchored_for_live_shaped_mu_and_jiang_text", () => {
  const [muFact] = normalizeFactsForWriter([card(1, {
    title: "Drivers and Consequences of Short-Form Video Addiction amongst Adolescents in China",
    evidenceType: "finding",
    claimTextZhTw: "研究指出青少年的自我控制能力尚未成熟；短影音成癮在壓力前因與幸福感、親子關係及毅力等後果之間具有中介作用。",
    dataScope: "Data were collected from 242 adolescents from across China under the age of 18.",
    exactResult: "SFV addiction merits research among adolescents due to their immature self-control abilities. School burnout and social phobia significantly triggered SFV addiction, which negatively influenced happiness, parent-child relationship quality, and perseverance. The study also found that SFV addiction served as a mediator between the drivers and consequences of SFV addiction.",
    exposure: "短影音成癮",
    outcome: "幸福感",
  })]);
  const jiangFacts = normalizeFactsForWriter([card(2, {
    title: "Adolescents’ short-form video addiction and sleep quality: the mediating role of social anxiety",
    evidenceType: "finding",
    claimTextZhTw: "研究分析短影音成癮、睡眠品質與社交焦慮，並指出社交焦慮具有部分中介作用。",
    dataScope: "A questionnaire survey recruited 1629 adolescents from three high schools.",
    exactResult: "The indirect effect exerted through social anxiety was 0.149, accounting for 37.6%. Social anxiety partially mediated the relationship between short-form video addiction and sleep quality.",
    exposure: "短影音成癮",
    outcome: "睡眠品質",
  })]);

  assert.equal(muFact?.mediator, "短影音成癮");
  assert.notEqual(muFact?.mediator, "自我控制");
  assert.match(muFact?.claimTextZhTw ?? "", /短影音成癮被報告為研究所述前因與後果之間的中介變項/u);
  assert.doesNotMatch(muFact?.claimTextZhTw ?? "", /短影音成癮與自我控制之間/u);
  const jiangMediationFacts = jiangFacts.filter((fact) =>
    fact.statisticType === "indirect_effect" ||
    (fact.statisticType === "effect_share" && fact.value === 37.6)
  );
  assert.ok(jiangMediationFacts.length > 0);
  assert.ok(jiangMediationFacts.every((fact) => fact.mediator === "社交焦慮"));
  assert.ok(jiangFacts.every((fact) => fact.mediator !== "自我控制"));
});

test("concept_normalization_and_comparability", () => {
  const facts = normalizeFactsForWriter([
    card(1, {
      title: "高中生短影音使用時數與睡眠品質",
      claimTextZhTw: "高中生每日短影音使用時數與較差睡眠品質呈正向關聯。",
      exposure: "每日短影音使用時數",
      outcome: "睡眠品質分數",
      studyDesign: "橫斷式研究",
      evidenceDirectnessTier: "A",
    }),
    card(2, {
      title: "大學生 TikTok 成癮與睡眠不佳比例",
      claimTextZhTw: "大學生 TikTok 成癮與睡眠不佳比例呈正向關聯。",
      exposure: "TikTok 成癮量表",
      outcome: "睡眠不佳比例",
      studyDesign: "橫斷式研究",
      evidenceDirectnessTier: "B",
    }),
  ]);
  const relationship = buildSynthesisClusters(facts).find(
    (cluster) => cluster.clusterPurpose === "relationship",
  );

  assert.deepEqual(new Set(facts.map((fact) => fact.population)), new Set(["高中生", "大學生"]));
  assert.notEqual(facts[0]?.comparabilityKey, facts[1]?.comparabilityKey);
  assert.equal(relationship?.sourceIds.length, 2);
  assert.equal(relationship?.comparabilityStatus, "direction_only");
  assert.equal(relationship?.numericAggregationAllowed, false);
});

test("cross_source_claim_graph", () => {
  const composition = buildReportComposition({
    topic: "高中生短影音使用與睡眠品質",
    evidenceCards: [
      card(1, {
        title: "高中生短影音使用與睡眠品質",
        claimTextZhTw: "高中生短影音使用與較差睡眠品質呈正向關聯。",
        exposure: "短影音使用",
        outcome: "睡眠品質分數",
        evidenceDirectnessTier: "A",
      }),
      card(2, {
        title: "青少年短影音使用與睡眠品質",
        claimTextZhTw: "青少年短影音使用與較差睡眠品質呈正向關聯。",
        exposure: "短影音使用",
        outcome: "睡眠品質分數",
        evidenceDirectnessTier: "B",
      }),
    ],
  });
  const shared = composition.claimGraph.claims.find(
    (claim) => claim.claimType === "cross_source_shared_direction",
  );

  assert.ok(shared);
  assert.equal(shared.supportingFacts.length, 2);
  assert.deepEqual(shared.citationIds, [
    "doi:10.1000/composer-1",
    "doi:10.1000/composer-2",
  ]);
  assert.equal(shared.evidenceDirectness, "B");
  assert.equal(composition.narrativePasses[0]?.pass, "teach_back");
  assert.equal(composition.narrativePasses[1]?.pass, "academic_reconstruction");
});

test("conflicting evidence remains contrast instead of being merged into consensus", () => {
  const result = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [
      card(1),
      card(2, {
        evidenceType: "conflicting_result",
        relevance: "研究結果不一致，形成相反結果",
      }),
    ],
  });
  const conflicting = result.normalizedEvidence.find((item) => item.evidenceId === "evidence-2");

  assert.equal(conflicting?.stance, "contrasts");
  assert.ok(result.argumentMap.claims.some((claim) => claim.contrastingEvidenceIds.includes("evidence-2")));
});

test("a supported result remains support when the card also records limitations", () => {
  const result = buildReportComposition({
    topic: "都市綠地形態與地表溫度之關聯",
    evidenceCards: [
      card(1, {
        evidenceType: "finding",
        relevance: "直接回答研究問題",
        limitations: ["研究場域限於單一城市。"],
        limitationsZhTw: ["不能外推為普遍因果效果。"],
      }),
      card(2, { canonicalSourceKey: "doi:10.1000/second" }),
    ],
  });

  assert.equal(result.normalizedEvidence[0]?.stance, "supports");
  assert.equal(result.argumentMap.claims[0]?.function, "support");
  assert.doesNotMatch(result.argumentMap.centralAnswer, /不能形成研究結論/u);
});

test("a single-source result stays tentative without source-led prose", () => {
  const result = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [card(1)],
  });

  assert.equal(result.compositionKind, "evidence_summary");
  assert.match(result.argumentMap.centralAnswer, /目前可核對的方向/u);
  assert.doesNotMatch(result.argumentMap.centralAnswer, /一項研究|\d+ 個獨立來源/u);
  assert.match(result.argumentMap.centralAnswer, /不能概括為普遍結論/u);
});

test("limited reports keep a closed question-analysis-synthesis-limitations-conclusion discourse", () => {
  const result = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [card(1), card(2, { canonicalSourceKey: "doi:10.1000/second" })],
  });
  const roles = result.discoursePlan.map((section) => section.sectionRole);

  assert.equal(result.compositionKind, "limited_evidence_brief");
  assert.equal(roles[0], "research_question_and_scope");
  assert.ok(roles.includes("thematic_analysis"));
  assert.ok(roles.includes("cross_source_synthesis"));
  assert.ok(roles.includes("limitations_and_gaps"));
  assert.equal(roles.at(-1), "direct_answer");
});

test("language and diagnostic leakage audit rejects internal tokens and long English abstracts", () => {
  const result = auditReportLanguageAndArtifacts([
    "# 正文",
    "Evidence Card supportSpan writer diagnostics",
    "This is a long raw English abstract with many words that should be rejected before any formal export is made available to the reader.",
    "# 參考文獻",
    "An English Paper Title. https://example.org DOI: 10.1000/example",
  ].join("\n"));

  assert.equal(result.passed, false);
  assert.ok(result.internalArtifacts.includes("Evidence Card"));
  assert.equal(result.longEnglishSegments.length, 1);
});

test("non-substantive zh-TW summary placeholders never enter writer or central answer", () => {
  const placeholder = card(1, {
    claimTextZhTw: "此來源尚未完成繁中摘要，以下顯示原文摘要。 英文摘要請展開詳情查看。",
    mainClaimZhTw: "",
    evidencePointZhTw: "",
    sourceSummaryZhTw: "",
    usableEvidence: "",
    mainClaim: "",
    claim: "",
    summary: "",
  });
  const composition = buildReportComposition({
    topic: "檢索增強生成的引用忠實度評估",
    evidenceCards: [placeholder, card(2)],
  });

  assert.equal(composition.normalizedEvidence[0]?.writerEligible, false);
  assert.doesNotMatch(composition.argumentMap.centralAnswer, /英文摘要請展開/u);
  assert.equal(
    auditReportLanguageAndArtifacts(placeholder.claimTextZhTw ?? "").passed,
    false,
  );
});

test("Traditional Chinese terminology audit rejects mixed regional variants", () => {
  assert.deepEqual(
    auditTraditionalChineseTerminology("本報告使用資料分析，也保留原始數據欄位。軟體與軟件名稱混用。"),
    ["資料/數據", "軟體/軟件"],
  );
  assert.deepEqual(auditTraditionalChineseTerminology("本報告統一使用資料與軟體。"), []);
  assert.equal(
    normalizeTraditionalChineseTerminology("數據由軟件處理後轉成視頻信息。"),
    "資料由軟體處理後轉成影片資訊。",
  );
});

test("bounded editorial pass locks citation identity and limitations", () => {
  const before = "研究顯示兩者具有關聯[S1]。然而，樣本限制使結果不能外推[S2]。";
  const safeAfter = "現有資料顯示兩者具有關聯[S1]。然而，樣本限制使結果不能外推[S2]。";
  const changedCitation = "現有資料顯示兩者具有關聯[S2]。然而，樣本限制使結果不能外推[S1]。";

  assert.equal(auditBoundedEditorialPass(before, safeAfter).passed, true);
  assert.equal(auditBoundedEditorialPass(before, changedCitation).citationIdentityPreserved, false);
});

test("intro-body-conclusion alignment is checked against structured fields", () => {
  const composition = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [card(1), card(2), card(3)],
  });
  const aligned = auditReportCoherence({
    reportPlan: {
      ...composition.argumentMap,
      argumentMap: composition.argumentMap,
      discoursePlan: composition.discoursePlan,
      normalizedEvidence: composition.normalizedEvidence,
    },
    sections: [
      {
        sectionId: "research_question",
        body: composition.argumentMap.researchQuestion,
      },
      {
        sectionId: "conclusion",
        body: composition.argumentMap.centralAnswer,
      },
    ],
  });
  const misaligned = auditReportCoherence({
    reportPlan: {
      ...composition.argumentMap,
      argumentMap: composition.argumentMap,
      discoursePlan: composition.discoursePlan,
      normalizedEvidence: composition.normalizedEvidence,
    },
    sections: [{ sectionId: "conclusion", body: "這是一段完全無關的結語。" }],
  });

  assert.equal(aligned.passed, true);
  assert.ok(misaligned.issues.includes("conclusion_not_aligned_to_central_answer"));
});

test("coherence audit permits one source to support distinct synthesis clusters but rejects a duplicated cluster", () => {
  const composition = buildReportComposition({
    topic: "校園綠量與熱環境",
    evidenceCards: [
      card(1, {
        exposure: "綠視率",
        outcome: "地表溫度",
        claimTextZhTw: "綠視率與地表溫度呈反向關聯。",
      }),
      card(2, {
        exposure: "植被覆蓋",
        outcome: "熱舒適",
        claimTextZhTw: "植被覆蓋與熱舒適呈具條件性的關聯。",
      }),
    ],
  });
  const reportPlan = {
    ...composition.argumentMap,
    argumentMap: composition.argumentMap,
    discoursePlan: composition.discoursePlan,
    normalizedEvidence: composition.normalizedEvidence,
  };
  const distinctClusters = auditReportCoherence({
    reportPlan,
    sections: [{ sectionId: "conclusion", body: composition.argumentMap.centralAnswer }],
  });
  const firstThematic = composition.discoursePlan.find(
    (section) => section.sectionRole === "thematic_analysis",
  );
  assert.ok(firstThematic);
  const duplicatedCluster = auditReportCoherence({
    reportPlan: {
      ...reportPlan,
      discoursePlan: [
        ...composition.discoursePlan,
        { ...firstThematic, sectionId: `${firstThematic.sectionId}-duplicate` },
      ],
    },
    sections: [{ sectionId: "conclusion", body: composition.argumentMap.centralAnswer }],
  });

  assert.equal(distinctClusters.passed, true);
  assert.ok(duplicatedCluster.issues.includes("cross_analysis_evidence_repetition"));
});

test("bounded coherence pass adds fact-free links without changing citation identity", () => {
  const composition = buildReportComposition({
    topic: "通用研究題目",
    evidenceCards: [card(1), card(2), card(3)],
  });
  const before = "本節比較兩組可追溯結果[S1][S2]，並保留方法限制。";
  const result = applyBoundedCoherencePass({
    sections: [{ sectionId: "discussion", body: before, prose: before }],
    discoursePlan: composition.discoursePlan,
  });

  assert.equal(result.diffs.length, 1);
  assert.equal(result.diffs[0]?.audit.citationIdentityPreserved, true);
  assert.match(result.sections[0]?.body ?? "", /把各主題分析放回同一研究問題/u);
  assert.deepEqual(
    (result.sections[0]?.body.match(/\[S\d+\]/gu) ?? []),
    ["[S1]", "[S2]"],
  );
});
