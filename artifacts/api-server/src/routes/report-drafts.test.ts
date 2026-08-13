import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { ReportPlan, SourceRecord, WriterEvidenceSet } from "@workspace/api-zod";
import {
  createReportDraftsRouter,
  verifyGroundedSection,
  type ReportDraftHandler,
} from "./report-drafts";
import type {
  ReportWriterInput,
  ReportWriterResult,
} from "../services/report-writer";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "狗的護食行為專業指引",
    authors: ["Example Association"],
    year: 2024,
    abstract: "此來源說明狗的護食行為、獸醫行為學與人道訓練原則。",
    doi: null,
    url: "https://example.org/dog-resource-guarding",
    sourceType: "Institutional Source",
    reviewState: "accepted",
    publisher: "Example Association",
    containerTitle: "Guidance",
    accessedAt: null,
    sourceRole: "professional_guidance",
    recommendationBucket: "official_background",
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: "evidence:source-1:0",
    sourceId: "source-1",
    claim: "專業指引建議以人道訓練處理護食行為。",
    claimTextZhTw: "專業指引建議以人道訓練處理護食行為。",
    claimText: "專業指引建議以人道訓練處理護食行為。",
    supportSpan: "此來源說明狗的護食行為、獸醫行為學與人道訓練原則。",
    supportedByText: "此來源說明狗的護食行為、獸醫行為學與人道訓練原則。",
    evidence: "來源整理了護食行為與訓練原則。",
    summary: "可支撐教育方式段落。",
    relevance: "專業指引",
    sourceTitle: "狗的護食行為專業指引",
    sourceProvider: "Institutional Source",
    year: 2024,
    usableSections: ["研究背景", "文獻探討"],
    citationText: "Example Association（2024）",
    sourceRole: "professional_guidance",
    recommendationBucket: "official_background",
    sectionFit: ["findings", "literature_review", "background"],
    extractionMethod: "llm_structured_extract",
    groundingConfidence: 0.78,
    topicRelevance: 0.82,
    sourceQuality: 0.76,
    ...overrides,
  };
}

function structuredPlan(input: {
  workflowId: string;
  topicHash: string;
  evidenceIds?: string[];
  sourceKeys?: string[];
  citationKeys?: string[];
}): ReportPlan {
  const claimId = "planned-claim-dog-training";
  const evidenceIds = input.evidenceIds ?? ["evidence:source-1:0"];
  const sourceKeys = input.sourceKeys ?? ["doi:10.1000/allowed"];
  const citationKeys = input.citationKeys ?? sourceKeys;
  return {
    workflowId: input.workflowId,
    topicHash: input.topicHash,
    title: "狗的護食行為與教育方式",
    researchQuestion: "哪些教育方式有可核對來源支持？",
    sections: [
      {
        sectionId: "findings",
        title: "主要發現",
        goal: "整理可核對發現",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "discussion",
        title: "討論",
        goal: "只解讀既有主張",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "conclusion",
        title: "結論",
        goal: "只回收既有主張",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: [claimId],
      },
    ],
    plannedClaims: [
      {
        claimId,
        claimText: "專業指引建議以人道訓練處理護食行為。",
        sectionId: "evidence",
        supportingEvidenceIds: evidenceIds,
        supportingSourceKeys: sourceKeys,
        evidenceStrength: "moderate",
        scope: "abstract_only_supported",
        limitations: ["僅依摘要整理。"],
        agreementStatus: "single_source",
        allowedCitationKeys: citationKeys,
        wordingStrength: "qualified",
      },
    ],
    evidenceGaps: [],
  };
}

function failedWriterResult(): ReportWriterResult {
  return {
    ok: false,
    status: "unavailable",
    llm_status: "skipped",
    fallback_used: true,
    model: "test-model",
    message: "LLM unavailable",
    warning: "test fallback",
    sectionPlan: [],
    sections: [],
    reportGenerationProvider: "test",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "skipped",
    fallbackUsed: true,
    fallbackReason: "test fallback",
    adapter: "test",
    requestedModel: "test-model",
    actualModel: null,
    reportMode: "short",
  };
}

function successfulWriterResult(
  sections: ReportWriterResult["sections"],
): ReportWriterResult {
  return {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    model: "test-model",
    message: null,
    warning: null,
    sectionPlan: [],
    sections,
    reportGenerationProvider: "test",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    adapter: "test",
    requestedModel: "test-model",
    actualModel: "test-model",
    reportMode: "short",
  };
}

async function invoke(router: ReturnType<typeof createReportDraftsRouter>, body: unknown) {
  return invokePath(router, "/report-drafts", body);
}

async function invokePath(
  router: ReturnType<typeof createReportDraftsRouter>,
  path: "/report-drafts" | "/report-evidence-sets",
  body: unknown,
) {
  const route = router.stack.find((layer) => layer.route?.path === path);
  assert.ok(route?.route);
  let statusCode = 200;
  let payload: unknown;
  const req = { body };
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      payload = value;
      return this;
    },
  };
  await route.route.stack[0].handle(req as Request, res as unknown as Response, () => undefined);
  return { statusCode, payload };
}

function canonicalPlanFor(
  writerEvidenceSet: WriterEvidenceSet,
  cards: Array<Record<string, unknown>>,
  workflowId: string,
  topicHash: string,
): ReportPlan {
  const evidenceIds = writerEvidenceSet.eligibleEvidenceCardIds;
  const sourceKeys = Array.from(new Set(cards.map((card) =>
    String(card.canonicalSourceKey ?? card.dedupeKey ?? card.sourceId)
  ))).sort();
  const citationKeys = Array.from(new Set(cards.map((card) =>
    String(card.citationKey ?? card.canonicalSourceKey ?? card.dedupeKey ?? card.sourceId)
  ))).sort();
  const claimId = "canonical-claim-1";
  const facts = evidenceIds.map((evidenceId, index) => {
    const card = cards.find((item) => String(item.id) === evidenceId) ?? cards[index] ?? {};
    const sourceId = String(card.sourceId ?? `source-${index + 1}`);
    return {
      factId: `canonical-fact-${index + 1}`,
      parentFactId: `canonical-parent-fact-${index + 1}`,
      resultIndex: null,
      evidenceId,
      sourceId,
      canonicalSourceId: sourceId,
      sourceType: "official_guideline" as const,
      evidenceLevel: "near_direct" as const,
      sourceAccessLevel: "complete_abstract" as const,
      sectionType: "abstract" as const,
      claimTextZhTw: String(card.claimTextZhTw ?? card.claim ?? "專業指引建議採取可核對且人道的教育方式。"),
      population: null,
      ageGroup: null,
      sampleSize: null,
      geography: null,
      studySetting: null,
      studyDesign: null,
      exposureConcept: "人道教育方式",
      exposureMeasure: null,
      outcomeConcept: "護食行為",
      outcomeMeasure: null,
      statisticType: null,
      value: null,
      lowerCI: null,
      upperCI: null,
      pValue: null,
      unit: null,
      direction: "not_applicable" as const,
      mediator: null,
      moderator: null,
      confounders: null,
      adjustmentStatus: null,
      evidenceDirectness: "B" as const,
      sourceSpan: null,
      certainty: null,
      confidence: 0.7,
      authorInterpretation: null,
      authorLimitations: null,
      extractionConfidence: 0.7,
      verificationStatus: "verified" as const,
      evidenceFunction: "support" as const,
      location: null,
      setting: null,
      exposure: "人道教育方式",
      outcome: "護食行為",
      method: null,
      numericalResults: [],
      associationDirection: "not_applicable" as const,
      uncertainty: "僅依摘要整理。",
      directness: "B" as const,
      applicability: "目前可核對來源涵蓋的犬隻行為教育情境。",
      locator: "abstract",
      themeKey: "relationship:humane_training:resource_guarding",
      conceptAxes: ["exposure:humane_training", "outcome:resource_guarding"],
      comparabilityKey: "population=dogs|exposure=humane_training|outcome=resource_guarding",
      limitations: ["僅依摘要整理。"],
      supportingEvidenceIds: [evidenceId],
      supportingSourceIds: [sourceId],
      writerEligible: true,
    };
  });
  const factIds = facts.map((fact) => fact.factId);
  const sourceIds = facts.map((fact) => fact.sourceId);
  return {
    workflowId,
    topicHash,
    title: "狗的護食行為與教育方式",
    researchQuestion: "哪些教育方式有可核對來源支持？",
    evidenceSetHash: writerEvidenceSet.evidenceSetHash,
    evidenceSetVersion: writerEvidenceSet.evidenceSetVersion,
    citationRegistryVersion: writerEvidenceSet.citationRegistryVersion,
    planBuildStatus: "plan_built",
    readinessStatus: "ready_limited_report",
    readinessReasons: ["abstract_only_evidence"],
    targetedRetrievalAttempted: true,
    compositionKind: "limited_evidence_brief",
    sections: [
      {
        sectionId: "findings",
        title: "主要發現",
        goal: "整理可核對發現",
        canonicalSectionRole: "core_evidence",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "discussion",
        title: "跨來源綜合",
        goal: "只解讀既有主張",
        canonicalSectionRole: "cross_source_synthesis",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "conclusion",
        title: "結論",
        goal: "只回收既有主張",
        canonicalSectionRole: "conclusion",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: [claimId],
      },
    ],
    plannedClaims: [
      {
        claimId,
        claimText: "專業指引建議以人道訓練處理護食行為。",
        sectionId: "findings",
        supportingEvidenceIds: evidenceIds,
        supportingSourceKeys: sourceKeys,
        evidenceStrength: "moderate",
        scope: "abstract_only_supported",
        limitations: ["僅依摘要整理。"],
        agreementStatus: "single_source",
        allowedCitationKeys: citationKeys,
        wordingStrength: "qualified",
        normalizedFactIds: factIds,
        claimGraphId: "canonical-graph-claim-1",
      },
    ],
    normalizedFacts: facts,
    claimGraph: {
      researchQuestion: "哪些教育方式有可核對來源支持？",
      claims: [{
        claimId: "canonical-graph-claim-1",
        claimType: "cross_source_shared_direction",
        readerFacingStatement: "專業指引建議以人道訓練處理護食行為。",
        supportingFacts: factIds,
        contradictingFacts: [],
        backgroundFacts: [],
        applicability: ["目前可核對來源涵蓋的犬隻行為教育情境。"],
        confidence: 0.7,
        citationIds: sourceIds,
        statisticalInterpretationIds: [],
        visualizable: false,
        visualId: null,
        evidenceDirectness: "B",
        limitations: ["僅依摘要整理。"],
      }],
      edges: [],
    },
    narrativePasses: [
      {
        pass: "teach_back",
        objective: "先以去識別化事實理解跨來源關係。",
        inputClaimIds: ["canonical-graph-claim-1"],
        inputFactIds: factIds,
        outputConstraints: ["不得逐來源拼接"],
        citationMode: "deferred",
      },
      {
        pass: "academic_reconstruction",
        objective: "依主張蘊含關係重建正式論證。",
        inputClaimIds: ["canonical-graph-claim-1"],
        inputFactIds: factIds,
        outputConstraints: ["引用必須符合主張蘊含"],
        citationMode: "claim_entailment",
      },
    ],
    evidenceGaps: [],
  };
}

test("canonical evidence endpoint filters server-ineligible cards before planning and records a reason code", async () => {
  const router = createReportDraftsRouter({ reportWriter: async () => failedWriterResult() });
  const unrelatedSource = source({
    id: "source-quantum",
    title: "量子錯誤更正綜述",
    abstract: "量子錯誤更正使用穩定子編碼，以保護量子位元免於退相干。",
    url: "https://example.org/quantum",
    doi: "10.1000/quantum",
  });
  const { statusCode, payload } = await invokePath(router, "/report-evidence-sets", {
    workflowId: "wf-canonical-filter",
    topicHash: "topic-canonical-filter",
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source(), unrelatedSource],
    evidenceCards: [
      evidence(),
      evidence({
        id: "evidence:source-quantum:0",
        sourceId: "source-quantum",
        claim: "量子編碼可保護量子位元。",
        claimText: "量子編碼可保護量子位元。",
        claimTextZhTw: "量子編碼可保護量子位元。",
        supportSpan: "量子錯誤更正使用穩定子編碼，以保護量子位元免於退相干。",
        supportedByText: "量子錯誤更正使用穩定子編碼，以保護量子位元免於退相干。",
        sourceTitle: "量子錯誤更正綜述",
      }),
    ],
  });
  const result = payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<{ id: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards.some((card) => card.id === "evidence:source-quantum:0"), false);
  assert.equal(
    result.writerEvidenceSet.rejectedEvidenceCards.some(
      (item) => item.evidenceCardId === "evidence:source-quantum:0" && item.reasonCode === "low_topic_relevance",
    ),
    true,
  );
});

test("canonical evidence preserves standardized fact dimensions and hashes every dimension", async () => {
  const router = createReportDraftsRouter({ reportWriter: async () => failedWriterResult() });
  const workflowId = "wf-standardized-fact-hash";
  const topicHash = "topic-standardized-fact-hash";
  const fields = {
    location: "Taipei, Taiwan",
    researchSetting: "urban secondary-school campus",
    studyDesign: "paired field measurement",
    dataScope: "12 campus courtyards measured during summer afternoons",
    exposure: "tree-canopy cover",
    outcome: "near-surface air temperature",
    exactResult: "Higher tree-canopy cover corresponded to 1.8 °C lower afternoon air temperature.",
    numericResult: "-1.8 °C",
    applicability: "Applies to comparable humid subtropical school campuses.",
    locator: "Results, Table 2",
    directness: "B",
  } as const;
  const request = (overrides: Record<string, unknown> = {}) => invokePath(
    router,
    "/report-evidence-sets",
    {
      workflowId,
      topicHash,
      topic: "狗的護食行為與教育方式",
      acceptedSources: [source()],
      evidenceCards: [evidence({ ...fields, ...overrides })],
    },
  );

  const baselineResponse = await request();
  assert.equal(baselineResponse.statusCode, 200);
  const baseline = baselineResponse.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  const canonicalCard = baseline.evidenceCards.find(
    (card) => card.id === "evidence:source-1:0",
  );
  assert.ok(canonicalCard);
  for (const [field, value] of Object.entries(fields)) {
    assert.equal(canonicalCard[field], value, `${field} must survive canonicalization`);
  }
  assert.equal(canonicalCard.evidenceDirectnessTier, fields.directness);

  const evidenceId = "evidence:source-1:0";
  const baselineFingerprint = baseline.writerEvidenceSet.eligibleEvidenceFingerprints[evidenceId];
  assert.match(baselineFingerprint ?? "", /^[a-f0-9]{64}$/u);

  const alternateValues: Record<keyof typeof fields, string> = {
    location: "Kaohsiung, Taiwan",
    researchSetting: "dense urban street canyon",
    studyDesign: "remote-sensing cross-sectional analysis",
    dataScope: "24 urban blocks measured across two seasons",
    exposure: "normalized difference vegetation index",
    outcome: "land-surface temperature",
    exactResult: "Vegetated blocks had a 2.1 °C lower median land-surface temperature.",
    numericResult: "-2.1 °C",
    applicability: "Applies only to remotely sensed daytime surface temperature.",
    locator: "Supplement, Figure S3",
    directness: "C",
  };
  for (const field of Object.keys(fields) as Array<keyof typeof fields>) {
    const changedResponse = await request({ [field]: alternateValues[field] });
    assert.equal(changedResponse.statusCode, 200, field);
    const changed = changedResponse.payload as { writerEvidenceSet: WriterEvidenceSet };
    assert.notEqual(
      changed.writerEvidenceSet.eligibleEvidenceFingerprints[evidenceId],
      baselineFingerprint,
      `${field} must change the evidence fingerprint`,
    );
    assert.notEqual(
      changed.writerEvidenceSet.evidenceSetHash,
      baseline.writerEvidenceSet.evidenceSetHash,
      `${field} must change the canonical evidence-set hash`,
    );
  }
});

test("canonical planner and writer share the same evidence hash and writer receives every eligible card", async () => {
  let received: ReportWriterInput | undefined;
  const router = createReportDraftsRouter({
    reportWriter: async (input) => {
      received = input;
      return failedWriterResult();
    },
  });
  const workflowId = "wf-canonical-handoff";
  const topicHash = "topic-canonical-handoff";
  const prepared = await invokePath(router, "/report-evidence-sets", {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
  });
  const canonical = prepared.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  const reportPlan = canonicalPlanFor(
    canonical.writerEvidenceSet,
    canonical.evidenceCards,
    workflowId,
    topicHash,
  );

  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    writerEvidenceSet: canonical.writerEvidenceSet,
    reportPlan,
  });
  const result = payload as {
    evidenceSetHash: string;
    writerEvidenceSetHash: string;
    reportPlanStatus: string;
    filteredAfterPlanCount: number;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.reportPlanStatus, "plan_built");
  assert.equal(result.evidenceSetHash, canonical.writerEvidenceSet.evidenceSetHash);
  assert.equal(result.writerEvidenceSetHash, canonical.writerEvidenceSet.evidenceSetHash);
  assert.equal(received?.evidenceSetHash, canonical.writerEvidenceSet.evidenceSetHash);
  assert.deepEqual(
    received?.evidenceCards?.map((card) => card.id).sort(),
    canonical.evidenceCards.map((card) => String(card.id)).sort(),
  );
  assert.equal(result.filteredAfterPlanCount, 0);
});

test("structured conclusion closes one multi-source claim instead of emitting one sentence per source", async () => {
  const workflowId = "wf-thematic-conclusion";
  const topicHash = "topic-thematic-conclusion";
  const acceptedSources = [1, 2, 3].map((index) => source({
    id: `source-${index}`,
    title: `人道訓練研究 ${index}`,
    abstract: "專業指引建議以人道訓練處理護食行為。",
    doi: `10.1000/humane-${index}`,
    url: `https://doi.org/10.1000/humane-${index}`,
  }));
  const inputEvidence = acceptedSources.map((item, index) => evidence({
    id: `evidence:${item.id}:0`,
    evidenceId: `evidence:${item.id}:0`,
    sourceId: item.id,
    sourceTitle: item.title,
    claim: "專業指引建議以人道訓練處理護食行為。",
    claimText: "專業指引建議以人道訓練處理護食行為。",
    claimTextZhTw: "專業指引建議以人道訓練處理護食行為。",
    supportSpan: "專業指引建議以人道訓練處理護食行為。",
    supportedByText: "專業指引建議以人道訓練處理護食行為。",
    citationMarker: `[S${index + 1}]`,
    sectionFit: ["findings", "discussion", "conclusion"],
    usableSections: ["findings", "discussion", "conclusion"],
  }));
  const router = createReportDraftsRouter({
    reportWriter: async () => successfulWriterResult([{
      sectionId: "conclusion",
      title: "結論",
      prose: "專業指引建議以人道訓練處理護食行為[S1]。",
      evidenceCardIds: ["evidence:source-1:0"],
      citationIds: ["source-1"],
    }]),
  });
  const prepared = await invokePath(router, "/report-evidence-sets", {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources,
    evidenceCards: inputEvidence,
  });
  const canonical = prepared.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  assert.equal(canonical.evidenceCards.length, 3);
  const reportPlan = canonicalPlanFor(
    canonical.writerEvidenceSet,
    canonical.evidenceCards,
    workflowId,
    topicHash,
  );
  reportPlan.conclusionBoundary = "結論不得超出已規劃的主張與適用範圍。";

  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources,
    evidenceCards: inputEvidence,
    writerEvidenceSet: canonical.writerEvidenceSet,
    reportPlan,
    outline: [{ sectionId: "conclusion", title: "結論" }],
  });
  const result = payload as {
    degradedMode: boolean;
    generationMode: string;
    reportPlanStatus: string;
    reportPlan: ReportPlan;
    groundingDiagnostics: unknown;
    reportSections: Array<{
      sectionId: string;
      body: string;
      groundingStatus: string;
      generationMethod: string;
      evidenceCardIds: string[];
    }>;
  };
  const conclusion = result.reportSections.find((section) => section.sectionId === "conclusion");

  assert.equal(statusCode, 200);
  assert.equal(result.reportPlanStatus, "plan_built");
  assert.equal(result.generationMode, "llm_evidence_grounded");
  assert.equal(conclusion?.generationMethod, "planned_claim_synthesis_closure");
  assert.equal(conclusion?.groundingStatus, "grounded");
  assert.equal(conclusion?.evidenceCardIds.length, 3);
  assert.equal((conclusion?.body.match(/專業指引建議以人道訓練處理護食行為/gu) ?? []).length, 1);
  assert.match(conclusion?.body ?? "", /\[S1\]\[S2\]\[S3\]/u);
  assert.equal(result.degradedMode, false);
});

test("same-ID evidence content mutation invalidates the canonical set and forces replanning", async () => {
  let writerCalls = 0;
  const router = createReportDraftsRouter({
    reportWriter: async () => {
      writerCalls += 1;
      return failedWriterResult();
    },
  });
  const workflowId = "wf-canonical-mutation";
  const topicHash = "topic-canonical-mutation";
  const prepared = await invokePath(router, "/report-evidence-sets", {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
  });
  const canonical = prepared.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  const reportPlan = canonicalPlanFor(
    canonical.writerEvidenceSet,
    canonical.evidenceCards,
    workflowId,
    topicHash,
  );
  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence({ claim: "修改後的主張。", claimText: "修改後的主張。" })],
    writerEvidenceSet: canonical.writerEvidenceSet,
    reportPlan,
  });
  const result = payload as { code: string; planBuildStatus: string; readinessStatus: string };

  assert.equal(statusCode, 409);
  assert.equal(result.code, "EVIDENCE_SET_REPLAN_REQUIRED");
  assert.equal(result.planBuildStatus, "plan_invalidated");
  assert.equal(result.readinessStatus, "invalid_evidence_set");
  assert.equal(writerCalls, 0);
});

test("needs-targeted-search is plan-built but blocks the writer until bounded retrieval runs", async () => {
  let writerCalls = 0;
  const router = createReportDraftsRouter({ reportWriter: async () => {
    writerCalls += 1;
    return failedWriterResult();
  } });
  const workflowId = "wf-targeted-search-gate";
  const topicHash = "topic-targeted-search-gate";
  const prepared = await invokePath(router, "/report-evidence-sets", {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
  });
  const canonical = prepared.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  const reportPlan = canonicalPlanFor(canonical.writerEvidenceSet, canonical.evidenceCards, workflowId, topicHash);
  reportPlan.readinessStatus = "needs_targeted_search";
  reportPlan.targetedRetrievalAttempted = false;

  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    writerEvidenceSet: canonical.writerEvidenceSet,
    reportPlan,
  });
  const result = payload as { code: string; planBuildStatus: string; readinessStatus: string };

  assert.equal(statusCode, 409);
  assert.equal(result.code, "TARGETED_RETRIEVAL_REQUIRED");
  assert.equal(result.planBuildStatus, "plan_built");
  assert.equal(result.readinessStatus, "needs_targeted_search");
  assert.equal(writerCalls, 0);
});

test("canonical writer rejects changed plan bindings instead of silently filtering after planning", async () => {
  let writerCalls = 0;
  const router = createReportDraftsRouter({ reportWriter: async () => {
    writerCalls += 1;
    return failedWriterResult();
  } });
  const workflowId = "wf-post-plan-filter-gate";
  const topicHash = "topic-post-plan-filter-gate";
  const prepared = await invokePath(router, "/report-evidence-sets", {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
  });
  const canonical = prepared.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  const reportPlan = canonicalPlanFor(canonical.writerEvidenceSet, canonical.evidenceCards, workflowId, topicHash);
  reportPlan.sections[0]?.evidenceCardIds.push("evidence:ghost:0");

  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    writerEvidenceSet: canonical.writerEvidenceSet,
    reportPlan,
  });
  const result = payload as { code: string; reportPlanDiagnostics: string[] };

  assert.equal(statusCode, 409);
  assert.equal(result.code, "REPORT_PLAN_REBUILD_REQUIRED");
  assert.equal(result.reportPlanDiagnostics.some((item) => item.includes("post_plan_mutation")), true);
  assert.equal(writerCalls, 0);
});

test("canonical writer rejects a plan that omits atomic facts, claim graph, or exact narrative passes", async () => {
  let writerCalls = 0;
  const router = createReportDraftsRouter({ reportWriter: async () => {
    writerCalls += 1;
    return failedWriterResult();
  } });
  const workflowId = "wf-canonical-narrative-contract";
  const topicHash = "topic-canonical-narrative-contract";
  const prepared = await invokePath(router, "/report-evidence-sets", {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
  });
  const canonical = prepared.payload as {
    writerEvidenceSet: WriterEvidenceSet;
    evidenceCards: Array<Record<string, unknown>>;
  };
  const reportPlan = canonicalPlanFor(
    canonical.writerEvidenceSet,
    canonical.evidenceCards,
    workflowId,
    topicHash,
  );
  delete reportPlan.normalizedFacts;
  delete reportPlan.claimGraph;
  delete reportPlan.narrativePasses;

  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    writerEvidenceSet: canonical.writerEvidenceSet,
    reportPlan,
  });
  const result = payload as { code: string; reportPlanDiagnostics: string[] };

  assert.equal(statusCode, 409);
  assert.equal(result.code, "REPORT_PLAN_REBUILD_REQUIRED");
  assert.deepEqual(
    result.reportPlanDiagnostics.filter((item) => item.startsWith("canonical_")),
    [
      "canonical_atomic_facts_missing",
      "canonical_claim_graph_missing",
      "canonical_two_stage_narrative_contract_missing",
    ],
  );
  assert.equal(writerCalls, 0);
});

test("report-drafts returns conservative fallback draft with evidence bindings when LLM is unavailable", async () => {
  let receivedSourceMixProfile: string | undefined;
  let receivedSectionIds: string[] | undefined;
  const reportWriter: ReportDraftHandler = async (input) => {
    receivedSourceMixProfile = input.sourceMixProfile;
    receivedSectionIds = input.requestedSectionIds;
    return failedWriterResult();
  };
  const router = createReportDraftsRouter({ reportWriter });

  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與教育方式",
    reportType: "研究報告",
    audience: "高中",
    sourceMixProfile: "school_report_balanced",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    generationMode: string;
    degradedMode: boolean;
    reportPlanStatus: string;
    fallbackReasons: string[];
    sections: Array<{
      prose: string;
      evidenceCardIds: string[];
      paragraphClaims?: Array<{ paragraphId: string }>;
    }>;
    missingEvidence: unknown[];
  };

  assert.equal(statusCode, 200);
  assert.equal(receivedSourceMixProfile, "school_report_balanced");
  assert.deepEqual(receivedSectionIds, ["findings"]);
  assert.equal(result.generationMode, "fallback_conservative_draft");
  assert.equal(result.degradedMode, true);
  assert.equal(result.reportPlanStatus, "degraded_legacy");
  assert.equal(result.fallbackReasons.includes("legacy_report_plan_missing"), true);
  assert.equal(result.sections[0]?.evidenceCardIds.includes("evidence:source-1:0"), true);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /目前可先|建議補充/);
  assert.match(result.sections[0]?.prose ?? "", /就目前摘錄而言/u);
  const paragraphs = (result.sections[0]?.prose ?? "").split(/\n{2,}/u).filter(Boolean);
  assert.equal(paragraphs.length >= 2 && paragraphs.length <= 4, true);
  assert.equal(result.sections[0]?.paragraphClaims?.length, paragraphs.length);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /(?:主旨|摘要重點|限制)\s*[：:]/u);
});

test("report-drafts strips ghost plan bindings and prevents a writer from widening section evidence", async () => {
  const workflowId = "wf-plan-bound-route";
  const topicHash = "topic-plan-bound-route";
  let receivedInput: Parameters<ReportDraftHandler>[0] | null = null;
  const router = createReportDraftsRouter({
    reportWriter: async (input) => {
      receivedInput = input;
      return successfulWriterResult([
        {
          sectionId: "findings",
          title: "主要發現",
          prose: "第二筆來源聲稱可直接支持未規劃的結論[S2]。",
          evidenceCardIds: ["evidence:source-2:0"],
          citationIds: ["source-2"],
        },
      ]);
    },
  });
  const plan = structuredPlan({
    workflowId,
    topicHash,
    evidenceIds: ["evidence:source-1:0", "evidence:ghost:0"],
    sourceKeys: ["doi:10.1000/allowed", "doi:10.1000/ghost"],
    citationKeys: ["doi:10.1000/allowed", "doi:10.1000/ghost"],
  });
  const { statusCode, payload } = await invoke(router, {
    workflowId,
    topicHash,
    topic: "狗的護食行為與教育方式",
    acceptedSources: [
      source({
        id: "source-1",
        doi: "10.1000/allowed",
        url: "https://doi.org/10.1000/allowed",
      }),
      source({
        id: "source-2",
        title: "狗的護食行為第二筆資料",
        doi: "10.1000/not-planned",
        url: "https://doi.org/10.1000/not-planned",
      }),
    ],
    evidenceCards: [
      evidence({
        id: "evidence:source-1:0",
        evidenceId: "evidence:source-1:0",
        sourceId: "source-1",
      }),
      evidence({
        id: "evidence:source-2:0",
        evidenceId: "evidence:source-2:0",
        sourceId: "source-2",
        sourceTitle: "狗的護食行為第二筆資料",
      }),
    ],
    reportPlan: plan,
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    reportPlanStatus: string;
    reportPlan: ReportPlan;
    evidenceCards: Array<{ id: string; sourceId: string }>;
    citations: Array<{ sourceId: string }>;
    sections: Array<{ evidenceCardIds: string[]; citationIds: string[] }>;
  };
  const writerInput = receivedInput as ReportWriterInput | null;

  assert.equal(statusCode, 200);
  assert.ok(writerInput);
  assert.equal(writerInput.reportPlanStatus, "filtered");
  assert.deepEqual(writerInput.reportPlan?.plannedClaims[0]?.supportingEvidenceIds, [
    "evidence:source-1:0",
  ]);
  assert.equal(result.reportPlanStatus, "filtered");
  assert.deepEqual(result.reportPlan.plannedClaims[0]?.allowedCitationKeys, [
    "doi:10.1000/allowed",
  ]);
  assert.deepEqual(result.evidenceCards.map((card) => card.sourceId), ["source-1"]);
  assert.deepEqual(result.citations.map((citation) => citation.sourceId), ["source-1"]);
  assert.equal(result.sections[0]?.evidenceCardIds.includes("evidence:source-2:0"), false);
  assert.equal(result.sections[0]?.citationIds.includes("source-2"), false);
});

test("report-drafts hard-fails a report plan from another workflow before invoking the writer", async () => {
  let invoked = false;
  const router = createReportDraftsRouter({
    reportWriter: async () => {
      invoked = true;
      return failedWriterResult();
    },
  });
  const { statusCode, payload } = await invoke(router, {
    workflowId: "wf-current",
    topicHash: "topic-current",
    topic: "狗的護食行為與教育方式",
    acceptedSources: [source({ doi: "10.1000/allowed" })],
    evidenceCards: [evidence()],
    reportPlan: structuredPlan({
      workflowId: "wf-stale",
      topicHash: "topic-current",
    }),
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });

  assert.equal(statusCode, 400);
  assert.equal((payload as { code?: string }).code, "REPORT_PLAN_CONTEXT_MISMATCH");
  assert.equal(invoked, false);
});

test("report-drafts marks findings missingEvidence when only background encyclopedia evidence is provided", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "玉佩在華人文化中的象徵意義",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources: [
      source({
        id: "source-wiki",
        title: "玉 - 維基百科",
        url: "https://zh.wikipedia.org/wiki/%E7%8E%89",
        sourceRole: "background_definition",
      }),
    ],
    evidenceCards: [
      evidence({
        id: "evidence:source-wiki:0",
        sourceId: "source-wiki",
        sourceRole: "background_definition",
        claim: "百科來源提供玉的背景定義。",
        claimTextZhTw: "百科來源提供玉的背景定義。",
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    missingEvidence: Array<{ sectionId: string; reason: string }>;
    sections: Array<{ warnings?: string[] }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(
    result.missingEvidence.some((item) => item.sectionId === "findings" && /百科|主要發現|academic|professional|official/.test(item.reason)),
    true,
  );
  assert.equal(result.sections[0]?.warnings?.includes("missingEvidence"), true);
});

test("report-drafts returns canonical evidence cards, bundles, and insufficient sections", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "鋰電池在生活中的運用與原理",
    acceptedSources: [
      source({
        id: "lithium-app",
        title: "Lithium-ion battery applications and principle",
        abstract: [
          "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
          "其充放电过程依赖锂离子在正负极之间迁移。",
        ].join(" "),
        doi: "10.1000/lithium",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [
      evidence({
        id: "evidence:lithium-app:application",
        sourceId: "lithium-app",
        sourceTitle: "Lithium-ion battery applications and principle",
        claimText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        claimTextZhTw: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportSpan: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportedByText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        sectionFit: ["background", "findings", "literature_review"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.82,
      }),
      evidence({
        id: "evidence:lithium-app:principle",
        sourceId: "lithium-app",
        sourceTitle: "Lithium-ion battery applications and principle",
        claimText: "其充放电过程依赖锂离子在正负极之间迁移。",
        claimTextZhTw: "其充放电过程依赖锂离子在正负极之间迁移。",
        supportSpan: "其充放电过程依赖锂离子在正负极之间迁移。",
        supportedByText: "其充放电过程依赖锂离子在正负极之间迁移。",
        sectionFit: ["findings", "literature_review", "discussion"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.8,
      }),
    ],
    outline: [
      { sectionId: "findings", title: "主要發現" },
      { sectionId: "methodology", title: "研究方法" },
    ],
  });
  const result = payload as {
    evidenceCards: Array<{ supportSpan?: string; claimText?: string }>;
    sectionEvidenceBundles: Array<{ sectionId: string; coverageStatus: string; canGenerate: boolean }>;
    reportSections: Array<{ sectionId: string; body: string; coverageStatus: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards.length, 2);
  assert.equal(result.evidenceCards.every((card) => card.supportSpan && card.claimText), true);
  assert.equal(result.sectionEvidenceBundles.find((bundle) => bundle.sectionId === "findings")?.coverageStatus, "weak");
  assert.equal(result.sectionEvidenceBundles.find((bundle) => bundle.sectionId === "methodology")?.canGenerate, false);
  assert.match(result.reportSections.find((section) => section.sectionId === "methodology")?.body ?? "", /證據不足|建議補查/u);
});

test("verifyGroundedSection flags cited sentences unsupported by the cited card", () => {
  const diagnostics = verifyGroundedSection({
    body: "鋰電池可以治療疾病並改善醫療管理[S1]。",
    evidenceCards: [
      evidence({
        id: "evidence:lithium:1",
        citationMarker: "[S1]",
        claimText: "锂离子电池广泛应用于手机和电动车。",
        supportSpan: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
      }),
    ] as never,
  });

  assert.equal(diagnostics.groundingStatus !== "grounded", true);
  assert.equal(diagnostics.unsupportedSentences.some((sentence) => /治療疾病/u.test(sentence)), true);
});

test("verifyGroundedSection does not let an unreviewed fallback claim support itself", () => {
  const diagnostics = verifyGroundedSection({
    body: "鋰電池可以治療疾病並改善醫療管理[S1]。",
    evidenceCards: [
      evidence({
        claimText: "鋰電池可以治療疾病並改善醫療管理。",
        supportSpan: "鋰離子電池廣泛應用於手機、筆記型電腦與電動車。",
        supportedByText: "鋰離子電池廣泛應用於手機、筆記型電腦與電動車。",
        citationMarker: "[S1]",
        extractionMethod: "rule_fallback_claim_extraction",
        needsReview: true,
      }),
    ] as never,
  });

  assert.equal(diagnostics.groundingStatus, "unsupported");
  assert.equal(diagnostics.unsupportedSentences.length, 1);
});

test("report-drafts rejects legacy frontend evidence without explicit supportSpan", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "咖啡因攝取與注意力表現的關係",
    acceptedSources: [
      source({
        abstract: null,
      }),
    ],
    evidenceCards: [
      {
        ...evidence({
          claimText: "咖啡因攝取與注意力表現有關。",
          claimTextZhTw: "咖啡因攝取與注意力表現有關。",
        }),
        supportSpan: undefined,
        supportedByText: "此段是舊前端卡的 supportedByText，不得替代 exact supportSpan。",
        quotedText: "此段是舊前端卡的 quotedText，不得替代 exact supportSpan。",
      },
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: unknown[];
    rejectedChunks: Array<{ reason: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards.length, 0);
  assert.equal(result.rejectedChunks.some((item) => item.reason === "missing_claim_or_support_span"), true);
});

test("report-drafts never promotes an explicitly rejected source from acceptedSources input", async () => {
  let writerSourceIds: string[] = [];
  let writerEvidenceSourceIds: string[] = [];
  const router = createReportDraftsRouter({
    reportWriter: async (input) => {
      writerSourceIds = input.acceptedSources.map((item) => item.id);
      writerEvidenceSourceIds = (input.evidenceCards ?? []).map((item) => item.sourceId);
      return failedWriterResult();
    },
  });
  const rejectedId = "explicitly-rejected-source";
  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與人道教育方式",
    acceptedSources: [
      source(),
      source({
        id: rejectedId,
        doi: "10.1000/rejected-source",
        reviewState: "rejected",
        acceptedByUser: false,
        userDecision: "rejected",
      }),
    ],
    evidenceCards: [
      evidence({ id: `evidence:${rejectedId}:0`, sourceId: rejectedId }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    sourceCountSummary: { accepted: number };
    evidenceCards: Array<{ sourceId: string }>;
    citations: Array<{ sourceId: string }>;
    rejectedChunks: Array<{ reason: string; sourceId: string | null }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.sourceCountSummary.accepted, 1);
  assert.deepEqual(writerSourceIds, ["source-1"]);
  assert.equal(writerEvidenceSourceIds.includes(rejectedId), false);
  assert.equal(result.evidenceCards.some((card) => card.sourceId === rejectedId), false);
  assert.equal(result.citations.some((citation) => citation.sourceId === rejectedId), false);
  assert.equal(
    result.rejectedChunks.some(
      (item) => item.sourceId === rejectedId && item.reason === "source_not_accepted",
    ),
    true,
  );
});

test("report-drafts dedupes an exact preprint and published version before writing or citing", async () => {
  let writerSources: SourceRecord[] = [];
  const router = createReportDraftsRouter({
    reportWriter: async (input) => {
      writerSources = input.acceptedSources;
      return failedWriterResult();
    },
  });
  const sharedWork = {
    title: "檢索增強生成對引用準確性的影響",
    authors: ["Lin, A.", "Chen, B."],
    year: 2025,
    abstract: [
      "研究比較檢索增強生成與基準模型的引用準確性，結果顯示可核對的檢索證據有助於降低引用錯置。",
      "研究也指出評估僅涵蓋特定資料集，因此不應將結果外推至所有知識領域。",
    ].join(" "),
    sourceType: "OpenAlex" as const,
    recommendationBucket: "scholarly_recommended" as const,
    sourceRole: "core_scholarly_evidence" as const,
    sourceQualityScore: 0.9,
    relevanceScore: 0.92,
    accessLevel: "abstract_only" as const,
    contentLevel: "abstract" as const,
    usableSections: ["文獻探討", "數據分析", "結論"],
  };
  const { statusCode, payload } = await invoke(router, {
    topic: sharedWork.title,
    aliases: ["retrieval augmented generation", "citation accuracy", "RAG"],
    matchedConcepts: ["檢索增強生成", "引用準確性"],
    acceptedSources: [
      source({
        ...sharedWork,
        id: "rag-preprint",
        doi: "10.1101/2025.01.01.123456",
        url: "https://doi.org/10.1101/2025.01.01.123456",
        publisher: "bioRxiv",
        containerTitle: "bioRxiv",
        isPeerReviewed: false,
      }),
      source({
        ...sharedWork,
        id: "rag-published",
        doi: "10.5555/rag-published",
        url: "https://doi.org/10.5555/rag-published",
        publisher: "Example Academic Press",
        containerTitle: "Journal of Grounded Generation",
        isPeerReviewed: true,
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    sourceCountSummary: { accepted: number };
    details: { acceptedSourcesCount: number };
    citations: Array<{
      marker: string;
      sourceId: string;
      canonicalSourceKey: string;
      citationKey: string;
    }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(writerSources.length, 1);
  assert.equal(writerSources[0]?.id, "rag-preprint");
  assert.equal(writerSources[0]?.doi, "10.5555/rag-published");
  assert.equal(writerSources[0]?.canonicalSourceIdentity, "doi:10.5555/rag-published");
  assert.equal(result.sourceCountSummary.accepted, 1);
  assert.equal(result.details.acceptedSourcesCount, 1);
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0]?.marker, "[S1]");
  assert.equal(result.citations[0]?.canonicalSourceKey, "doi:10.5555/rag-published");
  assert.equal(result.citations[0]?.citationKey, "doi:10.5555/rag-published");
  assert.equal(
    new Set(result.citations.map((citation) => citation.canonicalSourceKey)).size,
    result.citations.length,
  );
});

test("report-drafts rejects a client supportSpan absent from accepted source text", async () => {
  const router = createReportDraftsRouter({ reportWriter: async () => failedWriterResult() });
  const maliciousCardId = "evidence:source-1:invented";
  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與人道教育方式",
    acceptedSources: [source()],
    evidenceCards: [
      evidence({
        id: maliciousCardId,
        claim: "這段主張並未出現在合法來源內容中。",
        claimText: "這段主張並未出現在合法來源內容中。",
        claimTextZhTw: "這段主張並未出現在合法來源內容中。",
        supportSpan: "這是一段完全由客戶端捏造、且不存在於來源摘要或全文的證據文字。",
        supportedByText: "這是一段完全由客戶端捏造、且不存在於來源摘要或全文的證據文字。",
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: Array<{ id: string }>;
    rejectedChunks: Array<{ id: string; reason: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards.some((card) => card.id === maliciousCardId), false);
  assert.equal(
    result.rejectedChunks.some(
      (item) => item.id === maliciousCardId && item.reason === "support_span_not_found_in_source",
    ),
    true,
  );
});

test("report-drafts derives reviewed supportSpan cards server-side from accepted source abstracts", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const abstract =
    "Caffeine intake can improve vigilance and sustained attention in some experimental tasks, although effects vary by dose and participant tolerance.";
  const { statusCode, payload } = await invoke(router, {
    topic: "咖啡因攝取與注意力表現的關係",
    acceptedSources: [
      source({
        id: "caffeine-attention",
        title: "Caffeine and attention performance",
        abstract,
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
        isPeerReviewed: true,
        doi: "10.1000/caffeine-attention",
        sourceQualityScore: 0.82,
        relevanceScore: 0.78,
      }),
    ],
    evidenceCards: [],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: Array<{ sourceId: string; supportSpan: string; claimText: string; needsReview?: boolean; extractionMethod?: string }>;
    serverDerivedEvidenceCardCount: number;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.serverDerivedEvidenceCardCount, 1);
  assert.equal(result.evidenceCards[0]?.sourceId, "caffeine-attention");
  assert.equal(result.evidenceCards[0]?.supportSpan, abstract);
  assert.equal(result.evidenceCards[0]?.claimText, abstract);
  assert.equal(result.evidenceCards[0]?.needsReview, true);
  assert.equal(result.evidenceCards[0]?.extractionMethod, "rule_fallback_claim_extraction");
});

test("report-drafts skips a standalone Abstract label and derives multiple substantive support spans", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const abstract = [
    "Abstract.",
    "Raindrop terminal velocity increases with drop diameter until deformation and breakup limit the largest stable drops.",
    "Measurements use optical disdrometers and high-speed imaging to compare fall speed with drop size.",
  ].join(" ");
  const { statusCode, payload } = await invoke(router, {
    topic: "雨水的終端速度",
    aliases: ["raindrop", "terminal velocity"],
    matchedConcepts: ["raindrop", "terminal velocity", "drop diameter", "fall speed"],
    acceptedSources: [
      source({
        id: "rain-abstract-label",
        title: "Raindrop terminal velocity and measurement",
        abstract,
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
        isPeerReviewed: true,
        doi: "10.1000/rain-abstract-label",
        sourceQualityScore: 0.82,
        relevanceScore: 0.86,
        usableSections: ["literature_review", "analysis", "discussion"],
      }),
    ],
    evidenceCards: [],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: Array<{ supportSpan: string; sectionFit: string[] }>;
    serverDerivedEvidenceCardCount: number;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.serverDerivedEvidenceCardCount, 2);
  assert.equal(result.evidenceCards.every((card) => !/^Abstract\.?$/i.test(card.supportSpan)), true);
  assert.equal(result.evidenceCards.every((card) => card.sectionFit.includes("findings")), true);
});

test("verifyGroundedSection allows multi-card paraphrase but keeps numeric claims strict", () => {
  const combined = verifyGroundedSection({
    body: "鋰電池常見於手機與電動車，也與鋰離子在正負極之間遷移的充放電機制有關[S1][S2]。",
    evidenceCards: [
      evidence({
        citationMarker: "[S1]",
        claimText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportSpan: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
      }),
      evidence({
        id: "evidence:lithium:2",
        citationMarker: "[S2]",
        claimText: "锂离子电池充放电依赖锂离子在正负极之间迁移。",
        supportSpan: "锂离子电池充放电依赖锂离子在正负极之间迁移。",
      }),
    ] as never,
  });
  const numericMismatch = verifyGroundedSection({
    body: "研究指出 80% 的高中生睡眠不足[S1]。",
    evidenceCards: [
      evidence({
        citationMarker: "[S1]",
        claimText: "The survey reported that 60% of high school students had insufficient sleep.",
        supportSpan: "The survey reported that 60% of high school students had insufficient sleep.",
      }),
    ] as never,
  });

  assert.equal(combined.groundingStatus, "grounded");
  assert.equal(numericMismatch.groundingStatus !== "grounded", true);
  assert.equal(numericMismatch.unsupportedSentences.length, 1);
});

test("report-drafts marks degraded mode when LLM sections are blocked by grounding verifier", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () =>
      successfulWriterResult([
        {
          sectionId: "findings",
          title: "主要發現",
          prose: "鋰電池可以治療疾病並改善醫療管理[S1]。",
          evidenceCardIds: ["evidence:lithium-app:application"],
          citationIds: ["lithium-app"],
        },
      ]),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "鋰電池在生活中的運用與原理",
    acceptedSources: [
      source({
        id: "lithium-app",
        title: "Lithium-ion battery applications and principle",
        abstract: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        doi: "10.1000/lithium",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [
      evidence({
        id: "evidence:lithium-app:application",
        sourceId: "lithium-app",
        sourceTitle: "Lithium-ion battery applications and principle",
        claimText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        claimTextZhTw: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportSpan: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportedByText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        sectionFit: ["findings"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.82,
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    generationMode: string;
    fallbackUsed: boolean;
    degradedMode: boolean;
    fallbackReasons: string[];
    reportSections: Array<{ sectionId: string; groundingStatus: string; generationMethod: string }>;
    groundingDiagnostics: Array<{
      sectionId: string;
      evidenceCardIds: string[];
      citationMarkers: string[];
      evidenceCount: number;
      needsReviewCount: number;
      diagnostics: string[];
    }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.generationMode, "llm_evidence_grounded");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.degradedMode, true);
  assert.equal(result.fallbackReasons.includes("findings:grounding_verifier_blocked"), true);
  assert.notEqual(result.reportSections[0]?.groundingStatus, "grounded");
  assert.equal(result.reportSections[0]?.generationMethod, "grounding_verifier_blocked");
  assert.deepEqual(result.groundingDiagnostics[0]?.evidenceCardIds, ["evidence:lithium-app:application"]);
  assert.deepEqual(result.groundingDiagnostics[0]?.citationMarkers, ["[S1]"]);
  assert.equal(result.groundingDiagnostics[0]?.evidenceCount, 1);
  assert.equal(result.groundingDiagnostics[0]?.needsReviewCount, 0);
  assert.equal(result.groundingDiagnostics[0]?.diagnostics.some((item) => /low_overlap/u.test(item)), true);
});

test("report-drafts exposes section fallback as a hybrid degraded result", async () => {
  const supportedText =
    "鋰離子電池因能量密度高，廣泛應用於手機、筆記型電腦和電動車。";
  const router = createReportDraftsRouter({
    reportWriter: async () => ({
      ...successfulWriterResult([
        {
          sectionId: "findings",
          title: "主要發現",
          prose: `${supportedText}[S1]`,
          evidenceCardIds: ["evidence:lithium-hybrid:application"],
          citationIds: ["lithium-hybrid"],
          generationMethod: "deterministic_evidence_fallback",
        },
      ]),
      writerDiagnostics: {
        requestedSections: 1,
        completedSections: 1,
        modelCompletedSections: 0,
        repairedSections: 0,
        fallbackSections: 1,
        completedSectionIds: ["findings"],
        repairedSectionIds: [],
        fallbackSectionIds: ["findings"],
        failureReasons: { findings: "missing_or_invalid_section_output" },
      },
    }),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "鋰離子電池應用",
    acceptedSources: [
      source({
        id: "lithium-hybrid",
        title: "Lithium-ion battery applications",
        abstract: supportedText,
        doi: "10.1000/lithium-hybrid",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [
      evidence({
        id: "evidence:lithium-hybrid:application",
        sourceId: "lithium-hybrid",
        sourceTitle: "Lithium-ion battery applications",
        claimText: supportedText,
        claimTextZhTw: supportedText,
        supportSpan: supportedText,
        supportedByText: supportedText,
        sectionFit: ["findings"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.82,
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    generationMode: string;
    fallback_used: boolean;
    fallbackUsed: boolean;
    degradedMode: boolean;
    fallbackReasons: string[];
  };

  assert.equal(statusCode, 200);
  assert.equal(result.generationMode, "hybrid_evidence_grounded");
  assert.equal(result.fallback_used, true);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.degradedMode, true);
  assert.equal(result.fallbackReasons.includes("writer_section_fallback:1"), true);
});

test("report-drafts mocked lithium pipeline rejects boilerplate and unrelated evidence", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "鋰電池在生活中的運用與原理",
    acceptedSources: [
      source({
        id: "lithium-1",
        title: "Lithium-ion battery applications, safety, and recycling",
        abstract: [
          "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
          "锂离子电池充放电依赖锂离子在正负极之间迁移。",
          "锂电池安全性与回收是生活应用中需要考虑的限制。",
        ].join(" "),
        doi: "10.1000/lithium-valid",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
      source({
        id: "healthcare-big-data",
        title: "Big data in healthcare: management, analysis and future prospects",
        abstract: "Healthcare analytics and management platforms.",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
      source({
        id: "deep-sea",
        title: "PLOS deep sea wilderness",
        abstract: "Deep sea wilderness conservation.",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [
      evidence({
        id: "evidence:lithium-1:applications",
        sourceId: "lithium-1",
        sourceTitle: "Lithium-ion battery applications, safety, and recycling",
        claimText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        claimTextZhTw: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportSpan: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        supportedByText: "锂离子电池因能量密度高，广泛应用于手机、笔记本电脑和电动车。",
        sectionFit: ["background", "findings", "literature_review"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.84,
      }),
      evidence({
        id: "evidence:lithium-1:principle",
        sourceId: "lithium-1",
        sourceTitle: "Lithium-ion battery applications, safety, and recycling",
        claimText: "锂离子电池充放电依赖锂离子在正负极之间迁移。",
        claimTextZhTw: "锂离子电池充放电依赖锂离子在正负极之间迁移。",
        supportSpan: "锂离子电池充放电依赖锂离子在正负极之间迁移。",
        supportedByText: "锂离子电池充放电依赖锂离子在正负极之间迁移。",
        sectionFit: ["findings", "literature_review", "discussion"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.82,
      }),
      evidence({
        id: "evidence:lithium-1:safety",
        sourceId: "lithium-1",
        sourceTitle: "Lithium-ion battery applications, safety, and recycling",
        claimText: "锂电池安全性与回收是生活应用中需要考虑的限制。",
        claimTextZhTw: "锂电池安全性与回收是生活应用中需要考虑的限制。",
        supportSpan: "锂电池安全性与回收是生活应用中需要考虑的限制。",
        supportedByText: "锂电池安全性与回收是生活应用中需要考虑的限制。",
        sectionFit: ["discussion", "limitations", "conclusion"],
        recommendationBucket: "scholarly_recommended",
        sourceRole: "core_scholarly_evidence",
        extractionMethod: "llm_structured_extract",
        groundingConfidence: 0.78,
      }),
      evidence({
        id: "evidence:healthcare-big-data:1",
        sourceId: "healthcare-big-data",
        sourceTitle: "Big data in healthcare: management, analysis and future prospects",
        claimText: "Big data in healthcare supports hospital management.",
        supportSpan: "Big data in healthcare supports hospital management.",
        sectionFit: ["findings"],
      }),
      evidence({
        id: "evidence:deep-sea:1",
        sourceId: "deep-sea",
        sourceTitle: "PLOS deep sea wilderness",
        claimText: "Deep sea wilderness is relevant to conservation.",
        supportSpan: "Deep sea wilderness is relevant to conservation.",
        sectionFit: ["findings"],
      }),
      evidence({
        id: "evidence:lithium-1:boilerplate",
        sourceId: "lithium-1",
        sourceTitle: "Lithium-ion battery applications, safety, and recycling",
        claimText: "Skip to main content",
        supportSpan: "SpringerOpen journals have moved to Springer Nature Link Browse Subject Areas",
        sectionFit: ["background"],
      }),
    ],
    outline: [
      { sectionId: "findings", title: "主要發現" },
      { sectionId: "discussion", title: "分析與討論" },
    ],
  });
  const result = payload as {
    evidenceCards: Array<{ id: string; citationMarker?: string }>;
    rejectedChunks: Array<{ id: string; reason: string }>;
    reportSections: Array<{ body: string; evidenceCardIds: string[] }>;
  };
  const draftText = result.reportSections.map((section) => section.body).join("\n");

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards.length, 3);
  assert.equal(result.rejectedChunks.some((item) => /healthcare|low topic|boilerplate|deep sea/i.test(item.reason)), true);
  assert.doesNotMatch(draftText, /Skip to main content|SpringerOpen journals have moved|healthcare big data|deep sea wilderness/i);
  assert.equal(result.reportSections.every((section) => section.evidenceCardIds.every((id) => result.evidenceCards.some((card) => card.id === id))), true);
  assert.match(draftText, /\[S\d+\]/u);
});

test("report-drafts returns a complete evidence-bound fallback when the writer throws", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => {
      throw new Error("provider configuration failed before a structured result");
    },
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與人道教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    ok: boolean;
    generationMode: string;
    fallbackUsed: boolean;
    reportSections: Array<{
      body: string;
      evidenceCardIds: string[];
      generationMethod: string;
    }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.ok, true);
  assert.equal(result.generationMode, "fallback_conservative_draft");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.reportSections[0]?.evidenceCardIds.includes("evidence:source-1:0"), true);
  assert.equal((result.reportSections[0]?.body.length ?? 0) >= 60, true);
  assert.match(result.reportSections[0]?.body ?? "", /護食行為/u);
  assert.match(result.reportSections[0]?.body ?? "", /本節整理/u);
  assert.match(result.reportSections[0]?.body ?? "", /未引用的資料不納入結論/u);
  assert.match(result.reportSections[0]?.body ?? "", /\[S1\]/u);
  assert.notEqual(result.reportSections[0]?.generationMethod, "grounding_verifier_blocked");
});

test("report-drafts ignores writer fallback sections after a provider timeout", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => ({
      ...failedWriterResult(),
      sections: [{
        sectionId: "findings",
        title: "主要發現",
        prose: "這是逾時後未通過證據檢查的服務層替代內容。",
        evidenceCardIds: ["evidence:source-1:0"],
        citationIds: ["source-1"],
      }],
    }),
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與人道教育方式",
    acceptedSources: [source()],
    evidenceCards: [evidence()],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    generationMode: string;
    reportSections: Array<{ body: string; generationMethod: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.generationMode, "fallback_conservative_draft");
  assert.doesNotMatch(result.reportSections[0]?.body ?? "", /服務層替代內容/u);
  assert.match(result.reportSections[0]?.body ?? "", /護食行為/u);
  assert.notEqual(result.reportSections[0]?.generationMethod, "grounding_verifier_blocked");
});

test("verifyGroundedSection canonicalizes bare and fullwidth citation markers", () => {
  const diagnostics = verifyGroundedSection({
    body: "研究指出螢幕媒體使用與學生睡眠品質存在關聯 s１。研究亦指出螢幕媒體使用與學生睡眠品質存在關聯［Ｓ1］。",
    evidenceCards: [
      evidence({
        citationMarker: "［S1］",
        claimText: "螢幕媒體使用與學生睡眠品質存在關聯。",
        supportSpan: "研究指出螢幕媒體使用與學生睡眠品質存在關聯。",
      }),
    ] as never,
  });

  assert.equal(diagnostics.groundingStatus, "grounded");
  assert.deepEqual(diagnostics.citationMarkers, ["[S1]"]);
  assert.deepEqual(diagnostics.unsupportedSentences, []);
});

test("verifyGroundedSection checks every card that shares a source marker", () => {
  const diagnostics = verifyGroundedSection({
    body: "研究指出螢幕媒體使用與學生睡眠品質存在關聯[S1]。",
    evidenceCards: [
      evidence({
        id: "evidence:source-1:sleep",
        citationMarker: "[S1]",
        claimText: "螢幕媒體使用與學生睡眠品質存在關聯。",
        supportSpan: "研究指出螢幕媒體使用與學生睡眠品質存在關聯。",
      }),
      evidence({
        id: "evidence:source-1:training",
        citationMarker: "[S1]",
        claimText: "另一張卡整理人道訓練原則。",
        supportSpan: "此來源另有一段說明人道訓練原則。",
      }),
    ] as never,
  });

  assert.equal(diagnostics.groundingStatus, "grounded");
  assert.deepEqual(diagnostics.unsupportedSentences, []);
});

test("report-drafts renumbers a retained fullwidth source marker after accepted-source gaps", async () => {
  const retainedSourceId = "source-original-2";
  const evidenceId = "evidence:source-original-2:0";
  const router = createReportDraftsRouter({
    reportWriter: async () =>
      successfulWriterResult([
        {
          sectionId: "findings",
          title: "主要發現",
          prose: "研究指出螢幕媒體使用與學生睡眠品質存在關聯 s１。",
          evidenceCardIds: [evidenceId],
          citationIds: [retainedSourceId],
        },
      ]),
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "螢幕媒體使用與睡眠品質",
    acceptedSources: [
      source({
        id: retainedSourceId,
        title: "螢幕媒體使用與睡眠品質研究",
        abstract: "研究指出螢幕媒體使用與學生睡眠品質存在關聯。",
        doi: "10.1000/sleep-media",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
        isPeerReviewed: true,
      }),
    ],
    evidenceCards: [
      evidence({
        id: evidenceId,
        sourceId: retainedSourceId,
        sourceTitle: "螢幕媒體使用與睡眠品質研究",
        claimText: "研究指出螢幕媒體使用與學生睡眠品質存在關聯。",
        supportSpan: "研究指出螢幕媒體使用與學生睡眠品質存在關聯。",
        citationMarker: "［S2］",
        sectionFit: ["findings"],
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: Array<{ citationMarker?: string }>;
    citations: Array<{ marker: string; sourceId: string }>;
    reportSections: Array<{ body: string; groundingStatus: string; generationMethod: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards[0]?.citationMarker, "[S1]");
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0]?.marker, "[S1]");
  assert.equal(result.citations[0]?.sourceId, retainedSourceId);
  assert.equal(result.reportSections[0]?.groundingStatus, "grounded");
  assert.notEqual(result.reportSections[0]?.generationMethod, "grounding_verifier_blocked");
  assert.match(result.reportSections[0]?.body ?? "", /\[S1\]/u);
  assert.doesNotMatch(result.reportSections[0]?.body ?? "", /(?:^|\s)s１|［Ｓ2］/iu);
});

test("report-drafts assigns one citation marker to multiple cards from the same source", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與人道訓練原則",
    acceptedSources: [source({
      abstract: [
        "此來源說明狗的護食行為、獸醫行為學與人道訓練原則。",
        "此來源說明護食行為應以人道原則處理，並應避免懲罰式訓練。",
      ].join(" "),
    })],
    evidenceCards: [
      evidence({ citationMarker: "［S4］" }),
      evidence({
        id: "evidence:source-1:1",
        claim: "獸醫行為學資料強調應避免懲罰式訓練。",
        claimText: "獸醫行為學資料強調應避免懲罰式訓練。",
        claimTextZhTw: "獸醫行為學資料強調應避免懲罰式訓練。",
        supportSpan: "此來源說明護食行為應以人道原則處理，並應避免懲罰式訓練。",
        supportedByText: "此來源說明護食行為應以人道原則處理，並應避免懲罰式訓練。",
        citationMarker: "[S9]",
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: Array<{ id: string; citationMarker?: string }>;
    citations: Array<{ marker: string; sourceId: string }>;
    reportSections: Array<{ body: string; generationMethod: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.evidenceCards.length, 2);
  assert.deepEqual(result.evidenceCards.map((card) => card.citationMarker), ["[S1]", "[S1]"]);
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0]?.marker, "[S1]");
  assert.equal(result.citations[0]?.sourceId, "source-1");
  assert.match(result.reportSections[0]?.body ?? "", /綜合以上摘錄/u);
  assert.notEqual(result.reportSections[0]?.generationMethod, "grounding_verifier_blocked");
});

test("report-drafts keeps writer citations through S8 inside route bundles", async () => {
  const acceptedSources = Array.from({ length: 8 }, (_, index) => {
    const number = index + 1;
    return source({
      id: `dog-study-${number}`,
      title: `狗的護食行為研究第 ${number} 項`,
      abstract: `狗的護食行為研究第 ${number} 項指出人道訓練可降低衝突。`,
      doi: `10.1000/dog-study-${number}`,
      url: `https://example.org/dog-study-${number}`,
      sourceRole: "core_scholarly_evidence",
      recommendationBucket: "scholarly_recommended",
    });
  });
  const evidenceCards = acceptedSources.map((item, index) => {
    const number = index + 1;
    const support = `狗的護食行為研究第 ${number} 項指出人道訓練可降低衝突。`;
    return evidence({
      id: `evidence:dog-study-${number}:0`,
      sourceId: item.id,
      sourceTitle: item.title,
      claim: support,
      claimText: support,
      claimTextZhTw: support,
      supportSpan: support,
      supportedByText: support,
      sectionFit: ["introduction", "literature_review"],
      usableSections: ["introduction", "literature_review"],
      sourceRole: "core_scholarly_evidence",
      recommendationBucket: "scholarly_recommended",
      extractionMethod: "llm_structured_extract",
      groundingConfidence: 0.82,
      needsReview: false,
    });
  });
  const allEvidenceIds = evidenceCards.map((card) => card.id as string);
  const router = createReportDraftsRouter({
    reportWriter: async () => successfulWriterResult([
      {
        sectionId: "introduction",
        title: "研究背景",
        prose: "狗的護食行為研究第 1 項指出人道訓練可降低衝突[S1]。",
        evidenceCardIds: allEvidenceIds,
        citationIds: acceptedSources.map((item) => item.id),
      },
      {
        sectionId: "literature_review",
        title: "文獻探討",
        prose: [
          "狗的護食行為研究第 5 項指出人道訓練可降低衝突[S5]。",
          "狗的護食行為研究第 8 項指出人道訓練可降低衝突[S8]。",
        ].join("\n\n"),
        evidenceCardIds: allEvidenceIds,
        citationIds: acceptedSources.map((item) => item.id),
      },
    ]),
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "狗的護食行為與人道訓練",
    acceptedSources,
    evidenceCards,
    outline: [
      { sectionId: "introduction", title: "研究背景" },
      { sectionId: "literature_review", title: "文獻探討" },
    ],
  });
  const result = payload as {
    sectionEvidenceBundles: Array<{
      sectionId: string;
      canGenerate: boolean;
      evidenceCards: Array<{ id: string }>;
    }>;
    reportSections: Array<{
      sectionId: string;
      body: string;
      citations: string[];
      evidenceCardIds: string[];
      generationMethod: string;
    }>;
    groundingDiagnostics: Array<{ sectionId: string; diagnostics: string[] }>;
  };

  assert.equal(statusCode, 200);
  const introBundle = result.sectionEvidenceBundles.find((bundle) => bundle.sectionId === "introduction");
  const literatureBundle = result.sectionEvidenceBundles.find((bundle) => bundle.sectionId === "literature_review");
  assert.equal(introBundle?.canGenerate, true);
  assert.equal(introBundle?.evidenceCards.length, 8);
  assert.equal(literatureBundle?.evidenceCards.length, 8);

  const literature = result.reportSections.find((section) => section.sectionId === "literature_review");
  assert.match(literature?.body ?? "", /\[S5\]/u);
  assert.match(literature?.body ?? "", /\[S8\]/u);
  assert.equal(literature?.evidenceCardIds.includes("evidence:dog-study-5:0"), true);
  assert.equal(literature?.evidenceCardIds.includes("evidence:dog-study-8:0"), true);
  assert.equal(literature?.citations.includes("dog-study-5"), true);
  assert.equal(literature?.citations.includes("dog-study-8"), true);
  assert.notEqual(literature?.generationMethod, "grounding_verifier_blocked");
  assert.equal(
    result.groundingDiagnostics
      .find((diagnostic) => diagnostic.sectionId === "literature_review")
      ?.diagnostics.some((diagnostic) => /unknown_citation:S5|unknown_citation:S8/u.test(diagnostic)),
    false,
  );
});

test("report-drafts prunes one unsupported sentence without erasing grounded prose", async () => {
  const evidenceId = "evidence:lithium-app:grounded";
  const groundedSentence =
    "研究指出鋰離子電池因能量密度高而廣泛應用於手機、筆記型電腦、電動車等日常交通與消費性電子設備[S1]。";
  const unsupportedSentence = "鋰電池可以治療疾病並顯著改善醫院管理[S1]。";
  const router = createReportDraftsRouter({
    reportWriter: async () =>
      successfulWriterResult([
        {
          sectionId: "findings",
          title: "主要發現",
          prose: `${groundedSentence}${unsupportedSentence}`,
          evidenceCardIds: [evidenceId],
          citationIds: ["lithium-app"],
        },
      ]),
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "鋰電池在生活中的應用",
    acceptedSources: [
      source({
        id: "lithium-app",
        title: "Lithium-ion battery applications",
        abstract: "研究指出鋰離子電池因能量密度高而廣泛應用於手機、筆記型電腦、電動車等日常交通與消費性電子設備。",
        doi: "10.1000/lithium-applications",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [
      evidence({
        id: evidenceId,
        sourceId: "lithium-app",
        sourceTitle: "Lithium-ion battery applications",
        claimText: "研究指出鋰離子電池因能量密度高而廣泛應用於手機、筆記型電腦、電動車等日常交通與消費性電子設備。",
        claimTextZhTw: "研究指出鋰離子電池因能量密度高而廣泛應用於手機、筆記型電腦、電動車等日常交通與消費性電子設備。",
        supportSpan: "研究指出鋰離子電池因能量密度高而廣泛應用於手機、筆記型電腦、電動車等日常交通與消費性電子設備。",
        supportedByText: "研究指出鋰離子電池因能量密度高而廣泛應用於手機、筆記型電腦、電動車等日常交通與消費性電子設備。",
        sectionFit: ["findings"],
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    reportSections: Array<{
      body: string;
      groundingStatus: string;
      unsupportedSentences: string[];
      generationMethod: string;
    }>;
    groundingDiagnostics: Array<{
      groundingStatus: string;
      unsupportedSentences: string[];
      diagnostics: string[];
    }>;
  };

  assert.equal(statusCode, 200);
  assert.match(result.reportSections[0]?.body ?? "", /能量密度高/u);
  assert.doesNotMatch(result.reportSections[0]?.body ?? "", /治療疾病|醫院管理/u);
  assert.equal(result.reportSections[0]?.groundingStatus, "grounded");
  assert.deepEqual(result.reportSections[0]?.unsupportedSentences, []);
  assert.equal(result.reportSections[0]?.generationMethod, "grounding_verifier_pruned");
  assert.equal(result.groundingDiagnostics[0]?.groundingStatus, "grounded");
  assert.deepEqual(result.groundingDiagnostics[0]?.unsupportedSentences, []);
  assert.equal(
    result.groundingDiagnostics[0]?.diagnostics.includes("unsupported_sentences_removed"),
    true,
  );
});

test("report-drafts accepts a traceable raindrop bridge and normalizes all nine report section fits", async () => {
  const evidenceId = "evidence:rain-terminal:0";
  const supportSpan =
    "The terminal velocity of raindrops depends on drop diameter, drag coefficient, air density, and shape deformation.";
  const claimTextZhTw = "雨滴的終端速度取決於液滴直徑、阻力係數、空氣密度與形狀變化";
  const router = createReportDraftsRouter({
    reportWriter: async () => successfulWriterResult([{
      sectionId: "findings",
      title: "主要發現",
      prose: `研究指出，${claimTextZhTw}[S1]。`,
      evidenceCardIds: [evidenceId],
      citationIds: ["rain-terminal"],
    }]),
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "雨水的終端速度",
    acceptedSources: [source({
      id: "rain-terminal",
      title: "Terminal velocity of raindrops",
      abstract: supportSpan,
      queryUsed: "raindrop terminal velocity",
      doi: "10.1000/rain-terminal",
      isPeerReviewed: true,
      sourceRole: "core_scholarly_evidence",
      recommendationBucket: "scholarly_recommended",
    })],
    evidenceCards: [evidence({
      id: evidenceId,
      sourceId: "rain-terminal",
      sourceTitle: "Terminal velocity of raindrops",
      claim: supportSpan,
      claimText: supportSpan,
      claimTextZhTw,
      supportSpan,
      supportedByText: supportSpan,
      sectionFit: ["研究背景", "文獻探討", "研究方法", "數據分析", "結論"],
      sourceRole: "core_scholarly_evidence",
      recommendationBucket: "scholarly_recommended",
      extractionMethod: "llm_structured_extract",
      needsReview: false,
    })],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    canonicalEvidenceStatus: string;
    evidenceCards: Array<{
      sectionFit: string[];
      governanceFlags?: string[];
      canonicalSourceKey?: string;
      dedupeKey?: string;
      citationKey?: string;
    }>;
    reportSections: Array<{ groundingStatus: string; generationMethod: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.canonicalEvidenceStatus, "complete");
  assert.deepEqual(result.evidenceCards[0]?.sectionFit, [
    "abstract",
    "introduction",
    "research_question",
    "literature_review",
    "methodology",
    "findings",
    "discussion",
    "limitations",
    "conclusion",
  ]);
  assert.equal(result.evidenceCards[0]?.governanceFlags?.includes("exact_support_span_verified"), true);
  assert.equal(result.evidenceCards[0]?.canonicalSourceKey, "doi:10.1000/rain-terminal");
  assert.equal(result.evidenceCards[0]?.dedupeKey, "doi:10.1000/rain-terminal");
  assert.equal(result.evidenceCards[0]?.citationKey, "doi:10.1000/rain-terminal");
  assert.equal(result.reportSections[0]?.groundingStatus, "grounded");
  assert.notEqual(result.reportSections[0]?.generationMethod, "grounding_verifier_blocked");
});

test("report-drafts keeps reviewed English gut evidence for a Chinese topic but rejects an unrelated accepted source", async () => {
  const gutSourceId = "gut-axis-review";
  const unrelatedSourceId = "hospital-logistics-review";
  const gutSupport =
    "The gut microbiota communicates bidirectionally with the brain through neural, endocrine, immune, and metabolic pathways.";
  const unrelatedSupport =
    "This paper evaluates warehouse routing, staffing schedules, and procurement dashboards for hospital administrators.";
  const queryUsed = "gut microbiota adolescent sleep quality association";
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });

  const { statusCode, payload } = await invoke(router, {
    topic: "腸道菌相與青少年睡眠品質的關聯",
    acceptedSources: [
      source({
        id: gutSourceId,
        title: "The Microbiota-Gut-Brain Axis",
        abstract: gutSupport,
        queryUsed,
        matchedCoreConcepts: ["gut microbiota", "gut-brain axis"],
        doi: "10.1152/physrev.00018.2018",
        isPeerReviewed: true,
        acceptedByUser: true,
        userDecision: "accepted_as_manual_review",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
      source({
        id: unrelatedSourceId,
        title: "Hospital logistics dashboards and inventory management",
        abstract: unrelatedSupport,
        queryUsed,
        doi: "10.1000/hospital-logistics",
        isPeerReviewed: true,
        acceptedByUser: true,
        userDecision: "accepted_as_manual_review",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [
      evidence({
        id: `evidence:${gutSourceId}:0`,
        sourceId: gutSourceId,
        sourceTitle: "The Microbiota-Gut-Brain Axis",
        claim: gutSupport,
        claimText: gutSupport,
        claimTextZhTw: "腸道菌相可透過神經、內分泌、免疫與代謝路徑與大腦雙向溝通。",
        supportSpan: gutSupport,
        supportedByText: gutSupport,
        extractionMethod: "manual_review",
        needsReview: false,
        acceptedByUser: true,
        userDecision: "accepted_as_manual_review",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
      evidence({
        id: `evidence:${unrelatedSourceId}:0`,
        sourceId: unrelatedSourceId,
        sourceTitle: "Hospital logistics dashboards and inventory management",
        claim: unrelatedSupport,
        claimText: unrelatedSupport,
        claimTextZhTw: "來源整理醫院物流儀表板與庫存管理。",
        supportSpan: unrelatedSupport,
        supportedByText: unrelatedSupport,
        extractionMethod: "manual_review",
        needsReview: false,
        acceptedByUser: true,
        userDecision: "accepted_as_manual_review",
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    evidenceCards: Array<{ sourceId: string; governanceFlags: string[] }>;
    rejectedChunks: Array<{ sourceId: string | null; reason: string }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(
    result.evidenceCards.some((card) => card.sourceId === gutSourceId),
    true,
  );
  assert.equal(
    result.evidenceCards.find((card) => card.sourceId === gutSourceId)
      ?.governanceFlags.includes("exact_support_span_verified"),
    true,
  );
  assert.equal(
    result.evidenceCards.some((card) => card.sourceId === unrelatedSourceId),
    false,
  );
  assert.equal(
    result.rejectedChunks.some(
      (chunk) =>
        chunk.sourceId === unrelatedSourceId &&
        /low topic relevance/u.test(chunk.reason),
    ),
    true,
  );
});

test("verifyGroundedSection keeps bilingual numeric claims exact", () => {
  const card = evidence({
    citationMarker: "[S1]",
    claimText: "The measured terminal velocity was 9.0 m/s.",
    claimTextZhTw: "測得雨滴終端速度為 9.0 m/s。",
    supportSpan: "The measured terminal velocity was 9.0 m/s.",
    supportedByText: "The measured terminal velocity was 9.0 m/s.",
    extractionMethod: "llm_structured_extract",
    needsReview: false,
    governanceFlags: ["exact_support_span_verified"],
  });

  const correct = verifyGroundedSection({
    body: "研究測得雨滴終端速度為 9.0 m/s[S1]。",
    evidenceCards: [card] as never,
  });
  const wrong = verifyGroundedSection({
    body: "研究測得雨滴終端速度為 8.8 m/s[S1]。",
    evidenceCards: [card] as never,
  });

  assert.equal(correct.groundingStatus, "grounded");
  assert.equal(wrong.groundingStatus, "unsupported");
});

test("report-drafts exposes traceable cross-language evidence as indeterminate instead of definitive empty", async () => {
  const router = createReportDraftsRouter({ reportWriter: async () => failedWriterResult() });
  const { statusCode, payload } = await invoke(router, {
    topic: "雨水的終端速度",
    acceptedSources: [source({
      id: "rain-without-bridge",
      title: "Terminal velocity of raindrops",
      abstract:
        "The terminal velocity of raindrops depends on drop diameter, drag coefficient, air density, and shape deformation.",
      queryUsed: null,
      doi: "10.1000/rain-without-bridge",
      isPeerReviewed: true,
      sourceRole: "core_scholarly_evidence",
      recommendationBucket: "scholarly_recommended",
    })],
    evidenceCards: [],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    canonicalEvidenceStatus: string;
    rejectedChunkCount: number;
    indeterminateEvidence: Array<{ sourceId: string; decision: string }>;
    canonicalEvidenceDiagnostics: { indeterminateCardCount: number; traceableIndeterminateSourceIds: string[] };
  };

  assert.equal(statusCode, 200);
  assert.equal(result.canonicalEvidenceStatus, "indeterminate");
  assert.equal(result.rejectedChunkCount, 0);
  assert.equal(result.indeterminateEvidence[0]?.decision, "indeterminate");
  assert.equal(result.canonicalEvidenceDiagnostics.indeterminateCardCount, 1);
  assert.deepEqual(result.canonicalEvidenceDiagnostics.traceableIndeterminateSourceIds, ["rain-without-bridge"]);
});

test("report-drafts uses source matchedCoreConcepts as a verified cross-language bridge", async () => {
  const router = createReportDraftsRouter({
    reportWriter: async () => failedWriterResult(),
  });
  const supportSpan =
    "The terminal velocity of raindrops depends on drop diameter, drag coefficient, air density, and shape deformation.";
  const { statusCode, payload } = await invoke(router, {
    topic: "雨水的終端速度",
    acceptedSources: [
      source({
        id: "rain-matched-concepts",
        title: "Terminal velocity of raindrops",
        abstract: supportSpan,
        queryUsed: null,
        matchedCoreConcepts: ["raindrop", "terminal velocity"],
        doi: "10.1000/rain-matched-concepts",
        isPeerReviewed: true,
        sourceRole: "core_scholarly_evidence",
        recommendationBucket: "scholarly_recommended",
      }),
    ],
    evidenceCards: [],
    outline: [{ sectionId: "findings", title: "主要發現" }],
  });
  const result = payload as {
    canonicalEvidenceStatus: string;
    evidenceCards: Array<{ sourceId: string }>;
    rejectedChunks: Array<{ sourceId: string | null }>;
  };

  assert.equal(statusCode, 200);
  assert.equal(result.canonicalEvidenceStatus, "partial");
  assert.equal(
    result.evidenceCards.some(
      (card) => card.sourceId === "rain-matched-concepts",
    ),
    true,
  );
  assert.equal(
    result.rejectedChunks.some(
      (chunk) => chunk.sourceId === "rain-matched-concepts",
    ),
    false,
  );
});
