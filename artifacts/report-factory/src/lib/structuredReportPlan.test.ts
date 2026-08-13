import assert from "node:assert/strict";
import test from "node:test";

import { ReportPlanSchema, type WriterEvidenceSet } from "@workspace/api-zod";

import type { EvidenceCard } from "./evidenceCards.ts";
import { buildStructuredReportPlan } from "./structuredReportPlan.ts";
import { UNTRANSLATED_EVIDENCE_NOTICE } from "./zhTwReportText.ts";

function evidenceCard(
  index: number,
  overrides: Partial<EvidenceCard> = {},
): EvidenceCard {
  return {
    id: `card-${index}`,
    evidenceId: `evidence-${index}`,
    sourceId: `source-${index}`,
    canonicalSourceKey: `doi:10.1000/plan-${index}`,
    citationKey: `doi:10.1000/plan-${index}`,
    claimTextOriginal: `Source ${index} reports a directly traceable association.`,
    supportSpan: `Source ${index} reports a directly traceable association in the abstract.`,
    sourceExcerptOriginal: `Source ${index} reports a directly traceable association in the abstract.`,
    derivation: "abstract-derived",
    abstractOnly: true,
    confidenceScore: 0.8,
    limitations: [],
    limitationsZhTw: [],
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    citationMarker: `[S${index}]`,
    title: `來源 ${index}`,
    sourceType: "OpenAlex",
    reliability: "高",
    claim: `來源 ${index} 顯示一項可追溯的關聯。`,
    claimTextZhTw: `來源 ${index} 顯示一項可追溯的關聯。`,
    mainClaim: `來源 ${index} 顯示一項可追溯的關聯。`,
    evidence: `來源 ${index} 的摘要提供可核對的關聯證據。`,
    evidencePointZhTw: `來源 ${index} 的摘要提供可核對的關聯證據。`,
    usableEvidence: `來源 ${index} 的摘要提供可核對的關聯證據。`,
    quoteOrParaphrase: `來源 ${index} 的摘要提供可核對的關聯證據。`,
    summary: `來源 ${index} 的摘要提供可核對的關聯證據。`,
    sourceSummaryZhTw: `來源 ${index} 的摘要提供可核對的關聯證據。`,
    relevance: "研究主題相關",
    sectionTargets: ["literature_review", "findings"],
    sourceTitle: `來源 ${index}`,
    sourceUrl: `https://doi.org/10.1000/plan-${index}`,
    sourceDomain: "doi.org",
    sourceProvider: "OpenAlex",
    sourceCategory: "journal",
    doi: `10.1000/plan-${index}`,
    abstract: `Source ${index} reports a directly traceable association in the abstract.`,
    provider: "OpenAlex",
    relevanceScore: 0.8,
    sourceQualityScore: 0.8,
    finalScore: 0.8,
    year: 2025,
    usableSections: ["研究背景", "文獻探討"],
    confidence: "高",
    limitation: null,
    citationText: `[S${index}]`,
    createdAt: "2026-08-11T00:00:00.000Z",
    notes: "",
    ...overrides,
  };
}

function canonicalSet(
  cards: EvidenceCard[],
  rejectedEvidenceCards: WriterEvidenceSet["rejectedEvidenceCards"] = [],
): WriterEvidenceSet {
  return {
    runId: "wf-plan",
    canonicalSourceIds: cards
      .map((card) => card.canonicalSourceKey ?? card.sourceId)
      .sort(),
    eligibleEvidenceCardIds: cards
      .map((card) => card.evidenceId ?? card.id)
      .sort(),
    eligibleEvidenceFingerprints: Object.fromEntries(
      cards.map((card) => [card.evidenceId ?? card.id, "d".repeat(64)]),
    ),
    rejectedEvidenceCards,
    evidenceSetVersion: "writer-evidence-set/v1",
    evidenceSetHash: "c".repeat(64),
    citationRegistryVersion: "canonical-citation-registry/v1",
  };
}

test("one semantic theme creates one multi-source claim without an ID-split chapter", () => {
  const cards = [evidenceCard(1), evidenceCard(2), evidenceCard(3)];
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "測試題目",
    researchQuestion: "測試題目有哪些可核對發現？",
    reportType: "專業文獻綜述",
    audience: "專業證據綜合",
    evidenceCards: cards,
  });

  assert.ok(plan);
  assert.equal(ReportPlanSchema.safeParse(plan).success, true);
  assert.deepEqual(plan.sections.map((section) => section.sectionId), [
    "introduction",
    "literature_review",
    "methodology",
    "discussion",
    "limitations",
    "conclusion",
    "references",
  ]);
  assert.equal(plan.plannedClaims.length, 1);
  assert.ok(plan.argumentMap?.centralAnswer.includes("受限回答"));
  assert.ok((plan.discoursePlan?.length ?? 0) >= 4);
  assert.equal(plan.normalizedEvidence?.length, 3);
  assert.equal(plan.normalizedFacts?.length, 3);
  assert.equal(plan.synthesisClusters?.length, 1);
  assert.equal(plan.synthesisClusters?.[0]?.sourceIds.length, 3);
  assert.equal(plan.audienceProfile?.profileId, "professional_evidence_synthesis");
  assert.equal(plan.reportArchetype?.archetypeId, "limited_evidence_report");
  assert.equal(plan.reportArchetype?.downgradedFrom, "literature_review");
  assert.ok(plan.knowledgeModel);
  assert.ok(plan.heterogeneityAnalysis);
  assert.ok(plan.contradictionAnalysis?.length);
  assert.ok(plan.claimGraph?.claims.every((claim) =>
    Array.isArray(claim.statisticalInterpretationIds)
  ));
  assert.deepEqual(
    new Set(plan.plannedClaims.flatMap((claim) => claim.supportingEvidenceIds)),
    new Set(cards.map((card) => card.evidenceId)),
  );
  assert.ok(
    plan.plannedClaims.every(
      (claim) =>
        claim.supportingSourceKeys.length === 3 &&
        claim.allowedCitationKeys.length === 3 &&
        claim.allowedCitationKeys.every((key) => key.startsWith("doi:")),
    ),
  );
  assert.equal(
    plan.sections.filter((section) => section.canonicalSectionRole === "core_evidence").length,
    1,
  );
  assert.ok(
    plan.plannedClaims.every(
      (claim) => !claim.claimText.includes(UNTRANSLATED_EVIDENCE_NOTICE),
    ),
  );
  assert.ok(plan.sections.every((section) => Boolean(section.sectionPurpose)));
  assert.ok(plan.sections.every((section) => Boolean(section.sectionThesis)));
  assert.ok(plan.sections.every((section) => (section.paragraphPlan?.length ?? 0) >= 1));
  assert.ok(plan.sections.every((section) => (section.evidenceGroups?.length ?? 0) >= 1));
  assert.ok(plan.sections.every((section) => (section.supportedClaims?.length ?? 0) >= 1));
  assert.ok(plan.sections.every((section) => (section.contrastPoints?.length ?? 0) >= 1));
  assert.ok(plan.sections.every((section) => Boolean(section.transitionGoal)));
  assert.ok(plan.sections.every((section) => Boolean(section.limitationBoundary)));
});

test("structured ReportPlan is deterministic and excludes rejected evidence", () => {
  const accepted = evidenceCard(1);
  const rejected = evidenceCard(2, {
    userDecision: "rejected",
    rejectionReason: "使用者拒絕",
  });
  const input = {
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "測試題目",
    evidenceCards: [rejected, accepted],
  };
  const first = buildStructuredReportPlan(input);
  const second = buildStructuredReportPlan({ ...input, evidenceCards: [accepted, rejected] });

  assert.deepEqual(first, second);
  assert.equal(first?.plannedClaims.length, 1);
  assert.deepEqual(first?.plannedClaims[0]?.supportingEvidenceIds, [accepted.evidenceId]);
  assert.doesNotMatch(JSON.stringify(first), /evidence-2|10\.1000\/plan-2/u);
});

test("semantic clustering is permutation-stable and never halves IDs to create themes", () => {
  const cards = [9, 1, 5].map((index) => evidenceCard(index, {
    exposure: "綠視率",
    outcome: "地表溫度",
    researchSetting: "校園",
    claimTextZhTw: "較高綠視率與較低地表溫度呈反向關聯。",
    mainClaim: "較高綠視率與較低地表溫度呈反向關聯。",
    evidencePointZhTw: "較高綠視率與較低地表溫度呈反向關聯。",
  }));
  const input = {
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "校園綠視率與地表溫度",
    evidenceCards: cards,
  };

  const first = buildStructuredReportPlan(input);
  const reordered = buildStructuredReportPlan({ ...input, evidenceCards: [...cards].reverse() });

  assert.deepEqual(reordered, first);
  assert.equal(first?.synthesisClusters?.length, 1);
  assert.equal(first?.plannedClaims.length, 1);
  assert.equal(first?.plannedClaims[0]?.supportingSourceKeys.length, 3);
  assert.equal(
    first?.sections.filter((section) => section.canonicalSectionRole === "core_evidence").length,
    1,
  );
});

test("no_source_order_narrative", () => {
  const cards = [3, 1, 2].map((index) => evidenceCard(index, {
    title: `${index === 1 ? "高中生" : "青少年"}短影音使用與睡眠品質`,
    claimTextZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯。",
    evidencePointZhTw: "短影音使用與較差睡眠品質呈具條件性的關聯。",
    exposure: "短影音使用",
    outcome: "睡眠品質分數",
  }));
  const input = {
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "高中生短影音使用與睡眠品質的關聯",
    evidenceCards: cards,
  };
  const first = buildStructuredReportPlan(input);
  const reordered = buildStructuredReportPlan({ ...input, evidenceCards: [...cards].reverse() });

  assert.ok(first);
  assert.deepEqual(reordered, first);
  assert.deepEqual(first.narrativePasses?.map((pass) => pass.pass), [
    "teach_back",
    "academic_reconstruction",
  ]);
  assert.ok(first.claimGraph?.claims.some((claim) => claim.supportingFacts.length >= 2));
  assert.ok(first.sections.every((section) => section.paragraphPlan?.every((paragraph) =>
    Boolean(paragraph.teachBackGoal) && Boolean(paragraph.academicReconstructionGoal)
  )));
  assert.ok(first.sections.flatMap((section) => section.paragraphPlan ?? []).some((paragraph) =>
    /不是依來源取得順序逐篇摘要/u.test(paragraph.synthesisGoal)
  ));
});

test("report plan derives a canonical Chinese title and keywords from normalized concepts", () => {
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "Short-form video use and sleep quality among high school students",
    evidenceCards: [evidenceCard(1, {
      title: "高中生短影音使用與睡眠品質",
      claimTextZhTw: "高中生短影音使用與較差睡眠品質呈具條件性的關聯，社群焦慮可能具有中介作用。",
      exposure: "短影音使用",
      outcome: "睡眠品質分數",
      studyDesign: "橫斷式研究",
      exactResult: "社群焦慮可能具有中介作用。",
    })],
  });

  assert.ok(plan);
  assert.equal(plan.title, "短影音使用與高中生睡眠品質的關聯");
  assert.equal(plan.originalTitle, "Short-form video use and sleep quality among high school students");
  assert.equal(plan.titleLanguage, "zh-TW");
  assert.deepEqual(plan.keywords, ["短影音", "高中生", "睡眠品質", "社交焦慮", "證據綜合"]);
});

test("bounded discourse plan contains the same thematic chapters as the structured section inventory", () => {
  const cards = [
    evidenceCard(1, {
      exposure: "綠視率",
      outcome: "地表溫度",
      claimTextZhTw: "綠視率與地表溫度呈反向關聯。",
      evidencePointZhTw: "綠視率與地表溫度呈反向關聯。",
    }),
    evidenceCard(2, {
      exposure: "植被覆蓋",
      outcome: "熱舒適",
      claimTextZhTw: "植被覆蓋與熱舒適呈具條件性的關聯。",
      evidencePointZhTw: "植被覆蓋與熱舒適呈具條件性的關聯。",
    }),
  ];
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "校園綠量與熱環境",
    evidenceCards: cards,
  });

  assert.ok(plan);
  const thematicDiscourse = plan.discoursePlan?.filter(
    (section) => section.sectionRole === "thematic_analysis",
  ) ?? [];
  const coreSections = plan.sections.filter(
    (section) => section.canonicalSectionRole === "core_evidence",
  );
  assert.equal(thematicDiscourse.length, coreSections.length);
  assert.ok(thematicDiscourse.length <= 2);
  const seenClusterIds = new Set<string>();
  for (const section of thematicDiscourse) {
    for (const clusterId of section.synthesisClusterIds ?? []) {
      assert.equal(seenClusterIds.has(clusterId), false);
      seenClusterIds.add(clusterId);
    }
  }
});

test("structured ReportPlan fails closed when no traceable supportSpan exists", () => {
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "測試題目",
    evidenceCards: [
      evidenceCard(1, {
        supportSpan: "",
        supportedByText: "",
        sourceExcerptOriginal: "",
      }),
    ],
  });

  assert.equal(plan, null);
});

test("plan-built is not ready-complete when all canonical evidence is abstract-only", () => {
  const cards = [evidenceCard(1), evidenceCard(2), evidenceCard(3)];
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "摘要層級測試",
    evidenceCards: cards,
    writerEvidenceSet: canonicalSet(cards),
    targetedRetrievalAttempted: true,
  });

  assert.ok(plan);
  assert.equal(plan.planBuildStatus, "plan_built");
  assert.equal(plan.readinessStatus, "ready_limited_report");
  assert.notEqual(plan.readinessStatus, "ready_complete_report");
  assert.equal(plan.evidenceSetHash, "c".repeat(64));
});

test("eight total sections may contain three evidence-derived core sections, not eight cores", () => {
  const cards = [
    evidenceCard(1, {
      evidenceType: "background",
      derivation: "fulltext-derived",
      abstractOnly: false,
      sourceAccessLevel: "full_text",
    }),
    evidenceCard(2, {
      evidenceType: "finding",
      derivation: "fulltext-derived",
      abstractOnly: false,
      sourceAccessLevel: "full_text",
    }),
    evidenceCard(3, {
      evidenceType: "method",
      derivation: "fulltext-derived",
      abstractOnly: false,
      sourceAccessLevel: "full_text",
      sectionTargets: ["methodology"],
    }),
  ];
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "動態章節測試",
    evidenceCards: cards,
    writerEvidenceSet: canonicalSet(cards),
  });

  assert.ok(plan);
  assert.equal(plan.sections.length, 8);
  const core = plan.sections.filter(
    (section) => section.canonicalSectionRole === "core_evidence",
  );
  assert.equal(core.length, 3);
  assert.ok(core.every((section) => section.evidenceCardIds.length > 0));
  assert.equal(new Set(core.map((section) => section.questionAnswered)).size, 3);
  assert.ok(core.length < 8, "a fixed eight-core template must be rejected");
});

test("abstract-only method evidence downgrades to scope_method after bounded retrieval", () => {
  const cards = [
    evidenceCard(1, { evidenceType: "background" }),
    evidenceCard(2, {
      evidenceType: "method",
      sectionTargets: ["methodology"],
    }),
  ];
  const plan = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "方法證據降級",
    evidenceCards: cards,
    writerEvidenceSet: canonicalSet(cards),
    targetedRetrievalAttempted: true,
  });

  assert.ok(plan);
  const method = plan.sections.find((section) => section.sectionId === "methodology");
  assert.equal(method?.canonicalSectionRole, "scope_method");
  assert.match(method?.title ?? "", /證據範圍與資料限制/u);
  assert.equal(plan.readinessStatus, "ready_limited_report");
  assert.match(plan.centralAnswer ?? "", /摘要或受限全文證據/u);
  assert.match(plan.conclusionBoundary ?? "", /不得外推/u);
});

test("targeted retrieval transition resolves to a limited report when still insufficient", () => {
  const cards = [
    evidenceCard(1, { evidenceType: "background" }),
    evidenceCard(2, { evidenceType: "method", sectionTargets: ["methodology"] }),
  ];
  const evidenceSet = canonicalSet(cards);
  const beforeRetrieval = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "定向補查狀態",
    evidenceCards: cards,
    writerEvidenceSet: evidenceSet,
    targetedRetrievalAttempted: false,
  });
  const afterRetrieval = buildStructuredReportPlan({
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "定向補查狀態",
    evidenceCards: cards,
    writerEvidenceSet: evidenceSet,
    targetedRetrievalAttempted: true,
  });

  assert.equal(beforeRetrieval?.readinessStatus, "needs_targeted_search");
  assert.equal(afterRetrieval?.readinessStatus, "ready_limited_report");
  assert.equal(beforeRetrieval?.evidenceSetHash, afterRetrieval?.evidenceSetHash);
});

test("retry and resume preserve the canonical evidenceSetHash deterministically", () => {
  const cards = [evidenceCard(1), evidenceCard(2)];
  const evidenceSet = canonicalSet(cards, [{
    evidenceCardId: "filtered-1",
    sourceId: "source-filtered",
    reasonCode: "low_topic_relevance",
    diagnostics: ["decision:rejected"],
  }]);
  const input = {
    workflowId: "wf-plan",
    topicHash: "topic-plan",
    title: "續跑 hash 測試",
    evidenceCards: cards,
    writerEvidenceSet: evidenceSet,
  };
  const first = buildStructuredReportPlan(input);
  const resumed = buildStructuredReportPlan({ ...input, evidenceCards: [...cards].reverse() });

  assert.equal(first?.evidenceSetHash, "c".repeat(64));
  assert.equal(resumed?.evidenceSetHash, first?.evidenceSetHash);
  assert.deepEqual(resumed, first);
});
