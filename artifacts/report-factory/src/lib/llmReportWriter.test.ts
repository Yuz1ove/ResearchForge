import assert from "node:assert/strict";
import test from "node:test";
import type { ReportInput } from "./generateReport.ts";
import {
  createReportWorkspace,
  serializeReportWorkspaceForStorageForTests,
  workspaceToGeneratedReport,
  type ReportWorkspace,
} from "./reportWorkspace.ts";
import {
  applyDetailedReportSummary,
  buildDetailedReportParagraphs,
} from "./detailedReport.ts";
import {
  formalReportSectionContent,
  formalReportSectionSequence,
} from "./formalReportDocument.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import type { EvidenceCard } from "./evidenceCards.ts";
import {
  compactEvidenceCardsForWriterTransport,
  mergeLlmReportDraft,
  requestLlmReportDraft,
} from "./llmReportWriter.ts";
import { reportEvidenceCardsForAcceptedSources } from "./researchGrounding.ts";
import type { ReportPlan } from "@workspace/api-zod";

const TEST_TOPIC = "水餃";
const TEST_WORKFLOW_ID = "wf-llm-report-test";
const TEST_TOPIC_HASH = "topic-dumpling-test";
const TEST_QUERY_PLAN_HASH = "qp-llm-report-test";

test("writer transport keeps one Study Fact V2 envelope per study", () => {
  const envelope = { extractionVersion: "v2", provenance: [{ exactEvidence: "exact span" }] };
  const cards = [1, 2, 3].map((index) => evidenceCard(index, {
    sourceId: "source-shared",
    supportingClaims: [{ id: `pipeline-claim-${index}`, repeatedEnvelope: "x".repeat(2048) }],
    structuredStudyFact: {
      ...(evidenceCard(index).structuredStudyFact ?? {}),
      studyId: "10.1000/shared-study",
      sourceId: "source-shared",
      studyFactV2: envelope,
    } as EvidenceCard["structuredStudyFact"],
  }));
  const compact = compactEvidenceCardsForWriterTransport(cards);
  assert.equal(compact.filter((card) => card.structuredStudyFact?.studyFactV2).length, 1);
  assert.equal(compact.length, cards.length);
  assert.ok(compact.every((card) => !("supportingClaims" in card)));
  assert.ok(compact.every((card) => card.supportSpan === cards.find((item) => item.id === card.id)?.supportSpan));
});

function reportInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    topic: TEST_TOPIC,
    reportType: "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
    researchDepth: "standard",
    purpose: "學校作業",
    domainOverride: "",
    mode: "先建立報告架構",
    sourceRequirement: "需要，並生成參考文獻格式",
    citationFormat: "APA",
    chartRequirement: "不需要",
    style: "正式報告",
    length: "一般報告",
    wordCount: "",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "",
    rubric: "",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "",
    acceptedSources: [],
    ...overrides,
  };
}

function source(index: number, overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: `source-${index}`,
    title: `水餃營養與飲食文化研究 ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "此來源討論水餃的營養標示、鈉含量與家庭飲食文化，摘要足以支撐正式中文報告。",
    doi: `10.1000/dumpling-${index}`,
    url: `https://doi.org/10.1000/dumpling-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    relevanceLevel: index === 1 ? "primary" : "secondary",
    evidenceGrounding: "abstract_grounded",
    usableSections: ["研究背景", "文獻探討"],
    workflowId: TEST_WORKFLOW_ID,
    topic: TEST_TOPIC,
    normalizedTopic: TEST_TOPIC,
    topicHash: TEST_TOPIC_HASH,
    queryPlanHash: TEST_QUERY_PLAN_HASH,
    ...overrides,
  };
}

function evidenceCard(index: number, overrides: Partial<EvidenceCard> = {}): EvidenceCard {
  const sourceId = `source-${index}`;
  return {
    id: `evidence:${sourceId}:1`,
    evidenceId: `evidence:${sourceId}:1`,
    workflowId: TEST_WORKFLOW_ID,
    topicHash: TEST_TOPIC_HASH,
    sourceId,
    claimText: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    supportSpan: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    supportedByText: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    claim: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    claimTextZhTw: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    mainClaim: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    evidence: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    summary: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    sourceTitle: `水餃營養與飲食文化研究 ${index}`,
    sourceProvider: "Crossref",
    relevance: "finding",
    citationMarker: `[S${index}]`,
    citationText: `Ada Lovelace（2024）`,
    limitations: [],
    limitationsZhTw: [],
    sectionTargets: ["abstract", "introduction", "literature_review"],
    sectionFit: ["abstract", "introduction", "literature_review"],
    usableSections: ["研究背景", "文獻探討"],
    sourceType: "Crossref",
    reliability: "高",
    sourceUrl: `https://doi.org/10.1000/dumpling-${index}`,
    sourceDomain: "doi.org",
    provider: "Crossref",
    doi: `10.1000/dumpling-${index}`,
    abstract: "此來源討論水餃的營養標示、鈉含量與家庭飲食文化。",
    relevanceScore: 0.8,
    sourceQualityScore: 0.8,
    finalScore: 0.8,
    year: 2024,
    confidence: "高",
    confidenceScore: 0.8,
    groundingConfidence: 0.8,
    derivation: "abstract-derived",
    abstractOnly: true,
    limitation: null,
    createdAt: "2026-07-06T00:00:00.000Z",
    notes: "",
    usableEvidence: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    quoteOrParaphrase: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    evidencePointZhTw: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    sourceExcerptOriginal: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    sourceSummaryZhTw: `水餃來源 ${index} 提供可直接支撐的營養與飲食文化資訊。`,
    extractionMethod: "llm_structured_extract",
    needsManualReview: false,
    needsReview: false,
    governanceFlags: ["exact_support_span_verified"],
    ...overrides,
  };
}

function structuredReportPlan(): ReportPlan {
  const claimId = "planned-claim-dumpling-1";
  const evidenceId = "evidence:source-1:1";
  const citationKey = "doi:10.1000/dumpling-1";
  return {
    workflowId: TEST_WORKFLOW_ID,
    topicHash: TEST_TOPIC_HASH,
    title: TEST_TOPIC,
    researchQuestion: "水餃的營養與飲食文化有哪些可核對發現？",
    sections: [
      {
        sectionId: "background",
        title: "研究背景",
        goal: "界定研究背景",
        requiredEvidenceTypes: ["background"],
        evidenceCardIds: [evidenceId],
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "evidence",
        title: "文獻證據",
        goal: "整理可核對發現",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: [evidenceId],
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "discussion",
        title: "討論",
        goal: "只討論既有主張",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: [evidenceId],
        plannedClaimIds: [claimId],
      },
      {
        sectionId: "conclusion",
        title: "結論",
        goal: "只回收既有主張",
        requiredEvidenceTypes: ["finding"],
        evidenceCardIds: [evidenceId],
        plannedClaimIds: [claimId],
      },
    ],
    plannedClaims: [
      {
        claimId,
        claimText: "水餃來源提供可核對的營養與飲食文化資訊。",
        sectionId: "evidence",
        supportingEvidenceIds: [evidenceId],
        supportingSourceKeys: [citationKey],
        evidenceStrength: "moderate",
        scope: "abstract_only_supported",
        limitations: ["僅依摘要整理。"],
        agreementStatus: "single_source",
        allowedCitationKeys: [citationKey],
        wordingStrength: "qualified",
      },
    ],
    evidenceGaps: [],
  };
}

function workspaceWithEvidence(id: string, mode: Parameters<typeof createReportWorkspace>[2] = "complete_research_report"): ReportWorkspace {
  const acceptedSources = [source(1), source(2), source(3)];
  return createReportWorkspace(
    reportInput(),
    acceptedSources,
    mode,
    id,
    { evidenceCards: acceptedSources.map((_, index) => evidenceCard(index + 1)) },
  );
}

test("requestLlmReportDraft freezes server-eligible evidence before building and submitting the canonical plan", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  let evidenceSetBody: Record<string, unknown> | null = null;
  let capturedUrl = "";
  let requestCount = 0;
  globalThis.fetch = (async (input, init) => {
    requestCount += 1;
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    if (url.endsWith("/api/report-evidence-sets")) {
      evidenceSetBody = body;
      const cards = body.evidenceCards as EvidenceCard[];
      const eligibleEvidenceCardIds = cards.map((card) => card.evidenceId ?? card.id).sort();
      return new Response(JSON.stringify({
        ok: true,
        evidenceCards: cards,
        writerEvidenceSet: {
          runId: TEST_WORKFLOW_ID,
          canonicalSourceIds: cards.map((card) => card.canonicalSourceKey ?? card.sourceId).sort(),
          eligibleEvidenceCardIds,
          eligibleEvidenceFingerprints: Object.fromEntries(
            eligibleEvidenceCardIds.map((id) => [id, "d".repeat(64)]),
          ),
          rejectedEvidenceCards: [],
          evidenceSetVersion: "writer-evidence-set/v1",
          evidenceSetHash: "a".repeat(64),
          citationRegistryVersion: "canonical-citation-registry/v1",
        },
      }));
    }
    capturedUrl = url;
    capturedBody = body;
    const canonicalPlan = body.reportPlan as ReportPlan;
    return new Response(
      JSON.stringify({
        ok: true,
        status: "success",
        llm_status: "success",
        fallback_used: false,
        message: null,
        warning: null,
        reportPlan: canonicalPlan,
        reportPlanStatus: "plan_built",
        planBuildStatus: "plan_built",
        readinessStatus: canonicalPlan.readinessStatus,
        evidenceSetHash: "a".repeat(64),
        writerEvidenceSetHash: "a".repeat(64),
        writerEvidenceSet: body.writerEvidenceSet,
        formalResearchValidation: { pass: true },
        formalResearchCheckpoint: {
          schemaVersion: "formal-research-checkpoint.v2",
          workflowId: TEST_WORKFLOW_ID,
          topicHash: TEST_TOPIC_HASH,
          topicIntegrityVersion: "topic-integrity.v1",
          topicIntegrityHash: "b".repeat(64),
          relevancePolicyVersion: "formal-relevance.v1",
          evidenceSetHash: "a".repeat(64),
          acceptedSourceIds: ["source-1", "source-2", "source-3"],
          acceptedSourceCount: 3,
          rejectedSourceCount: 2,
          directFindingSourceCount: 3,
          contentIntegrityValidated: true,
          topicIntegrityValidatedAt: "2026-08-23T00:00:00.000Z",
          evidenceIds: (body.evidenceCards as EvidenceCard[]).map((card) => card.evidenceId ?? card.id),
          completedStages: ["source_normalization", "section_claim_allocation"],
          resumeFrom: "export",
          safeToResume: true,
          providerFailureCategories: [],
          invalidatedBy: ["topic_hash_change"],
        },
        filteredAfterPlanCount: 0,
        evidenceCards: body.evidenceCards,
        writerDiagnostics: {
          requestedSections: 7,
          completedSections: 7,
          modelCompletedSections: 7,
          repairedSections: 3,
          fallbackSections: 0,
          completedSectionIds: ["introduction", "conclusion"],
          repairedSectionIds: ["introduction"],
          fallbackSectionIds: [],
          failureReasons: {},
          writerAttempts: [{
            attemptId: "attempt-primary-1",
            phase: "primary",
            sectionIds: ["abstract"],
            status: "repaired",
            originalRawOutput: "{\"sections\":[",
            repair: {
              method: "partial_json_object_recovery",
              repairedFields: ["sections"],
              confidence: "medium",
              validationResult: "pass",
            },
          }],
          writerVNext: {
            status: "active",
            atomicClaimCount: 42,
            validatedSynthesisClaimCount: 6,
            rejectedSynthesisClaimCount: 0,
            sectionClaimPlanCount: 7,
            paragraphContractCount: 7,
            sentenceTraceCount: 31,
            locallyRepairedSentenceCount: 3,
            deletedSentenceCount: 1,
            conclusionMode: "SAFE_CONCLUSION_FALLBACK",
            validationIssueCount: 0,
            centralAnswerContract: { requiredClaims: [{ centralClaimId: "central-claim-1" }] },
            bodyRealizationAudit: [{ claimId: "central-claim-1", realizationStatus: "fully_realized" }],
            conclusionEligibilityGate: { status: "pass", candidates: [] },
            conclusionClosureAudit: { passed: true, conclusion_claim_novelty: 0 },
          },
        },
        sections: [
          {
            sectionId: "abstract",
            title: "摘要",
            prose: "這是根據已接受來源生成的水餃初步報告摘要。",
            citationIds: ["source-1"],
            paragraphClaims: [{
              paragraphId: "abstract-p1",
              sectionId: "abstract",
              claimIds: [canonicalPlan.plannedClaims[0]?.claimId],
              evidenceCardIds: [canonicalPlan.plannedClaims[0]?.supportingEvidenceIds[0]],
              citationMarkers: ["[S1]"],
              generatedTextZhTw: "這是根據已接受來源生成的水餃初步報告摘要。",
              unsupportedSentences: [],
            }],
            sentenceClaimTraces: [{
              sentenceId: "abstract-s1",
              text: "這是根據已接受來源生成的水餃初步報告摘要。",
              realizedClaimIds: [canonicalPlan.plannedClaims[0]?.claimId],
              citationSourceIds: ["source-1"],
              factual: true,
              validation: "pass",
            }],
          },
        ],
      }),
    );
  }) as typeof fetch;

  try {
    const workspace = workspaceWithEvidence("rf-request-evidence", "initial_brief");
    const canonicalResearchTopic = "水餃的營養組成、鈉含量與家庭飲食文化";
    const bridgedSource = source(1, {
      queryUsed: "dumpling nutrition sodium food culture",
      matchedCoreConcepts: ["dumpling", "nutrition", "sodium"],
      matchedTerms: ["food culture"],
    });
    const result = await requestLlmReportDraft({
      reportInput: reportInput({ topic: canonicalResearchTopic }),
      workflowId: TEST_WORKFLOW_ID,
      jobId: "grounding-job-1",
      topicHash: TEST_TOPIC_HASH,
      originalTopic: TEST_TOPIC,
      displayTitle: TEST_TOPIC,
      acceptedSources: [bridgedSource, source(2), source(3)],
      evidenceCards: workspace.evidenceCards,
      centralAnswerClaimIds: ["central-claim-1", "central-claim-2"],
      reportPlan: structuredReportPlan(),
      generationMode: "initial_brief",
      timeoutMs: 5,
    });

    assert.equal(requestCount, 2);
    assert.equal(evidenceSetBody?.researchReportMode, "evidence_brief");
    assert.equal(evidenceSetBody?.citationDisplayMode, "compact");
    assert.match(capturedUrl, /\/api\/report-drafts$/);
    assert.equal(capturedBody?.workflowId, TEST_WORKFLOW_ID);
    assert.equal(capturedBody?.jobId, "grounding-job-1");
    assert.equal(capturedBody?.topic, canonicalResearchTopic);
    assert.equal(capturedBody?.originalTopic, TEST_TOPIC);
    assert.equal(capturedBody?.displayTitle, TEST_TOPIC);
    assert.equal(capturedBody?.generationMode, "academic_claim_mode");
    assert.equal((capturedBody?.acceptedSources as SourceRecord[]).length, 3);
    assert.equal(
      (capturedBody?.acceptedSources as SourceRecord[])[0]?.queryUsed,
      "dumpling nutrition sodium food culture",
    );
    assert.deepEqual(
      (capturedBody?.acceptedSources as SourceRecord[])[0]
        ?.matchedCoreConcepts,
      ["dumpling", "nutrition", "sodium"],
    );
    assert.equal((capturedBody?.evidenceCards as unknown[]).length > 0, true);
    assert.deepEqual(capturedBody?.centralAnswerClaimIds, [
      "central-claim-1",
      "central-claim-2",
    ]);
    const submittedPlan = capturedBody?.reportPlan as ReportPlan;
    assert.equal(submittedPlan.evidenceSetHash, "a".repeat(64));
    assert.equal(submittedPlan.planBuildStatus, "plan_built");
    assert.equal(submittedPlan.readinessStatus, "ready_limited_report");
    assert.equal((capturedBody?.outline as unknown[]).length, submittedPlan.sections.length - 1);
    assert.equal(
      (capturedBody?.outline as Array<{ sectionId: string }>).some(
        (section) => section.sectionId === "abstract",
      ),
      false,
    );
    assert.equal(capturedBody?.writingStyle, "正式報告");
    assert.equal(capturedBody?.requestedLength, "一般報告");
    assert.equal(result.ok, true);
    assert.equal(result.canonicalEvidenceReturned, true);
    assert.deepEqual(result.reportPlan, submittedPlan);
    assert.equal(result.reportPlanStatus, "plan_built");
    assert.equal(result.evidenceSetHash, "a".repeat(64));
    assert.equal(result.writerEvidenceSetHash, "a".repeat(64));
    assert.deepEqual(result.formalResearchValidation, { pass: true });
    assert.equal(result.formalResearchCheckpoint?.resumeFrom, "export");
    assert.equal(result.formalResearchCheckpoint?.safeToResume, true);
    assert.equal(result.formalResearchCheckpoint?.schemaVersion, "formal-research-checkpoint.v2");
    assert.equal(result.formalResearchCheckpoint?.topicIntegrityHash, "b".repeat(64));
    assert.equal(result.formalResearchCheckpoint?.acceptedSourceCount, 3);
    assert.equal(result.formalResearchCheckpoint?.contentIntegrityValidated, true);
    assert.equal(result.writerDiagnostics?.writerAttempts?.[0]?.originalRawOutput, "{\"sections\":[");
    assert.equal(result.writerDiagnostics?.writerAttempts?.[0]?.repair?.validationResult, "pass");
    assert.equal(result.sections[0]?.sectionId, "abstract");
    assert.equal(result.evidenceCards?.[0]?.needsManualReview, false);
    const writerVNext = result.writerDiagnostics?.writerVNext;
    assert.equal(writerVNext?.status, "active");
    assert.equal(writerVNext?.atomicClaimCount, 42);
    assert.deepEqual(writerVNext?.centralAnswerContract, {
      requiredClaims: [{ centralClaimId: "central-claim-1" }],
    });
    assert.deepEqual(writerVNext?.bodyRealizationAudit, [
      { claimId: "central-claim-1", realizationStatus: "fully_realized" },
    ]);
    assert.deepEqual(writerVNext?.conclusionEligibilityGate, {
      status: "pass",
      candidates: [],
    });
    assert.deepEqual(writerVNext?.conclusionClosureAudit, {
      passed: true,
      conclusion_claim_novelty: 0,
    });
    assert.deepEqual(result.sections[0]?.paragraphClaims?.[0]?.claimIds, [
      submittedPlan.plannedClaims[0]?.claimId,
    ]);
    assert.equal(result.sections[0]?.sentenceClaimTraces?.[0]?.validation, "pass");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("structured report plan survives report workspace JSON persistence", () => {
  const acceptedSources = [source(1), source(2), source(3)];
  const reportPlan = structuredReportPlan();
  const workspace = createReportWorkspace(
    reportInput(),
    acceptedSources,
    "complete_research_report",
    "rf-plan-persistence",
    {
      evidenceCards: acceptedSources.map((_, index) => evidenceCard(index + 1)),
      reportPlan,
    },
  );
  const reloaded = JSON.parse(
    serializeReportWorkspaceForStorageForTests(workspace),
  ) as ReportWorkspace;

  assert.deepEqual(reloaded.generationPayload.reportPlan, reportPlan);
  assert.equal(reloaded.generationPayload.reportPlan?.plannedClaims[0]?.claimId, "planned-claim-dumpling-1");
});

test("requestLlmReportDraft falls back when the LLM request times out", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const signal = init?.signal as AbortSignal | undefined;
    await new Promise((_, reject) => {
      signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      });
    });
    throw new Error("unreachable");
  }) as typeof fetch;

  try {
    const workspace = workspaceWithEvidence("rf-request-timeout", "initial_brief");
    const result = await requestLlmReportDraft({
      reportInput: reportInput(),
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      originalTopic: TEST_TOPIC,
      displayTitle: TEST_TOPIC,
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: workspace.evidenceCards,
      generationMode: "initial_brief",
      timeoutMs: 5,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "error");
    assert.equal(result.llm_status, "timeout");
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.degradedMode, true);
    assert.match(result.message ?? "", /逾時|保留/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("requestLlmReportDraft reports a transport failure as failed instead of success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    const workspace = workspaceWithEvidence("rf-request-transport-failure", "initial_brief");
    const result = await requestLlmReportDraft({
      reportInput: reportInput(),
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      originalTopic: TEST_TOPIC,
      displayTitle: TEST_TOPIC,
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: workspace.evidenceCards,
      generationMode: "initial_brief",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "error");
    assert.equal(result.llm_status, "failed");
    assert.equal(result.reportGenerationStatus, "failed");
    assert.equal(result.fallbackUsed, true);
    assert.match(result.warning ?? "", /fetch failed/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale report-drafts 404 still opens locally traceable complete paragraphs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ code: "NOT_FOUND", message: "API route not found." }),
      { status: 404, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const acceptedSources = [source(1), source(2), source(3)];
    const localEvidenceCards = reportEvidenceCardsForAcceptedSources({
      acceptedSources,
      groundingEvidenceCards: [],
      topic: TEST_TOPIC,
    });
    assert.equal(localEvidenceCards.length >= 3, true);
    let workspace = createReportWorkspace(
      reportInput(),
      acceptedSources,
      "complete_research_report",
      "rf-stale-route-local-fallback",
      { evidenceCards: localEvidenceCards },
    );
    const result = await requestLlmReportDraft({
      reportInput: reportInput(),
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      originalTopic: TEST_TOPIC,
      displayTitle: TEST_TOPIC,
      acceptedSources,
      evidenceCards: localEvidenceCards,
      generationMode: "complete_research_report",
    });
    workspace = mergeLlmReportDraft(workspace, result);

    const narrativeSections = workspace.draft.sections.filter(
      (section) => section.sectionId !== "title" && section.sectionId !== "references",
    );
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.canonicalEvidenceReturned, false);
    assert.equal(workspace.evidenceCards.length >= 3, true);
    assert.equal(narrativeSections.length, 9);
    const narrativeLengths = narrativeSections.map((section) => section.body.length);
    assert.equal(
      narrativeSections.every((section) => section.body.length >= 40),
      true,
      JSON.stringify(narrativeLengths),
    );
    assert.equal(narrativeLengths.reduce((sum, length) => sum + length, 0) >= 700, true);
    assert.equal(narrativeSections.every((section) => !section.body.includes("本節尚未完成")), true);
    assert.equal(narrativeSections.some((section) => section.citationMarkers.length > 0), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mergeLlmReportDraft replaces matching draft section prose for preview", () => {
  const workspace: ReportWorkspace = createReportWorkspace(
    reportInput(),
    [source(1), source(2), source(3), source(4), source(5)],
    "initial_brief",
    "rf-llm-merge",
    { evidenceCards: [1, 2, 3, 4, 5].map((index) => evidenceCard(index)) },
  );
  const targetSection = workspace.draft.sections.find((section) => section.sectionId === "abstract");
  assert.ok(targetSection);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: "摘要",
        prose:
          "這是一段由 LLM 根據已接受來源重新撰寫的正式中文報告段落，會顯示在 report preview[S1][S2]。",
        evidenceCardIds: workspace.evidenceCards.slice(0, 2).map((card) => card.id),
        citationIds: ["source-1", "source-2", "not-accepted"],
      },
    ],
  });

  const mergedSection = merged.draft.sections.find((section) => section.sectionId === targetSection.sectionId);
  assert.match(mergedSection?.body ?? "", /正式中文報告段落/);
  assert.match(
    mergedSection?.synthesizedProseZhTw ?? "",
    /正式中文報告段落/,
  );
  assert.deepEqual(
    mergedSection?.evidenceCardIds,
    workspace.evidenceCards.slice(0, 2).map((card) => card.id),
  );
  assert.equal(mergedSection?.citationIds.includes("not-accepted"), false);
  assert.match(merged.draft.text, /正式中文報告段落/);
  assert.equal(
    merged.report.meta.researchDraft.sections.find(
      (section: { sectionId: string }) => section.sectionId === targetSection.sectionId,
    )?.body,
    mergedSection?.body,
  );
});

test("mergeLlmReportDraft preserves writer-native paragraph and sentence lineage", () => {
  const reportPlan = structuredReportPlan();
  const acceptedSources = [source(1), source(2), source(3)];
  const cards = acceptedSources.map((_, index) => evidenceCard(index + 1));
  const workspace = createReportWorkspace(
    reportInput(),
    acceptedSources,
    "initial_brief",
    "rf-native-paragraph-claims",
    { evidenceCards: cards, reportPlan },
  );
  const prose = "水餃來源提供可核對的營養與飲食文化資訊[S1]。";
  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "school-openai-compatible",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    reportPlan,
    sections: [{
      sectionId: "discussion",
      title: "討論",
      prose,
      evidenceCardIds: [cards[0]!.id],
      citationIds: [acceptedSources[0]!.id],
      groundingStatus: "grounded",
      paragraphClaims: [{
        paragraphId: "discussion-p1",
        sectionId: "discussion",
        claimIds: ["atomic-evidence-card-1"],
        evidenceCardIds: [cards[0]!.id],
        citationMarkers: ["[S1]"],
        generatedTextZhTw: prose,
        unsupportedSentences: [],
      }],
      sentenceClaimTraces: [{
        sentenceId: "discussion-p1-s1",
        text: "水餃來源提供可核對的營養與飲食文化資訊。",
        realizedClaimIds: ["atomic-evidence-card-1"],
        citationSourceIds: [acceptedSources[0]!.id],
        evidenceIds: [cards[0]!.id],
        factual: true,
        validation: "pass",
        action: "CITATION_RESTORED",
        repairStage: "A_PRESERVE",
      }, {
        sentenceId: "discussion-p1-s2",
        text: "這項比較僅限於來源實際揭露的範圍。",
        realizedClaimIds: [],
        citationSourceIds: [],
        evidenceIds: [],
        factual: false,
        validation: "pass",
        action: "UNCHANGED",
        repairStage: "A_PRESERVE",
      }],
    }],
  });

  const discussion = merged.draft.sections.find((section) => section.sectionId === "discussion");
  assert.deepEqual(discussion?.paragraphClaims?.[0]?.claimIds, [
    "atomic-evidence-card-1",
  ]);
  assert.deepEqual(discussion?.paragraphClaims?.[0]?.evidenceCardIds, [cards[0]!.id]);
  assert.deepEqual(discussion?.sentenceClaimTraces?.[0]?.realizedClaimIds, [
    "atomic-evidence-card-1",
  ]);
  assert.deepEqual(discussion?.sentenceClaimTraces?.[0]?.originalClaimIds, [
    "atomic-evidence-card-1",
  ]);
  assert.deepEqual(discussion?.sentenceClaimTraces?.[0]?.finalClaimIds, [
    "atomic-evidence-card-1",
  ]);
  assert.deepEqual(discussion?.sentenceClaimTraces?.[0]?.citationSourceIds, [
    acceptedSources[0]!.id,
  ]);
  assert.deepEqual(discussion?.sentenceClaimTraces?.[0]?.evidenceIds, [cards[0]!.id]);
  assert.equal(discussion?.sentenceClaimTraces?.[0]?.action, "CITATION_RESTORED");
  assert.equal(discussion?.sentenceClaimTraces?.[0]?.deleted, false);
  assert.match(discussion?.body ?? "", /這項比較僅限於來源實際揭露的範圍/u);
});

test("mergeLlmReportDraft preserves the evidence-card citation registry when source sorting differs", () => {
  const sources = [
    source(1, { id: "source-z", doi: "10.1000/z-last" }),
    source(2, { id: "source-a", doi: "10.1000/a-first" }),
    source(3, { id: "source-m", doi: "10.1000/m-middle" }),
    source(4, { id: "source-b", doi: "10.1000/b-fourth" }),
  ];
  const cards = [
    evidenceCard(1, {
      id: "evidence:source-z:1",
      evidenceId: "evidence:source-z:1",
      sourceId: "source-z",
      citationMarker: "[S1]",
    }),
    evidenceCard(2, {
      id: "evidence:source-a:1",
      evidenceId: "evidence:source-a:1",
      sourceId: "source-a",
      citationMarker: "[S2]",
    }),
    evidenceCard(3, {
      id: "evidence:source-m:1",
      evidenceId: "evidence:source-m:1",
      sourceId: "source-m",
      citationMarker: "[S3]",
    }),
    evidenceCard(4, {
      id: "evidence:source-b:1",
      evidenceId: "evidence:source-b:1",
      sourceId: "source-b",
      citationMarker: "[S4]",
    }),
  ];
  const reportPlan = structuredReportPlan();
  reportPlan.sections = [{
    sectionId: "introduction",
    title: "研究背景",
    goal: "整合四個已規劃來源",
    requiredEvidenceTypes: ["finding"],
    evidenceCardIds: cards.map((card) => card.id),
    plannedClaimIds: [],
  }];
  const workspace = createReportWorkspace(
    reportInput(),
    sources,
    "initial_brief",
    "rf-evidence-marker-registry",
    { evidenceCards: cards, reportPlan },
  );

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [{
      sectionId: "introduction",
      title: "研究背景",
      prose: "第一份來源說明水餃營養標示的研究背景[S1]。第二份來源補充家庭飲食文化的可比較脈絡[S2]。第三份來源提供烹調方式的證據[S3]。第四份來源說明原料差異的證據[S4]。",
      evidenceCardIds: cards.map((card) => card.id),
      citationIds: ["source-z", "source-a", "source-m", "source-b"],
      groundingStatus: "grounded",
      generationMethod: "grounding_verifier_pruned",
    }],
    reportPlan,
  });

  const introduction = merged.draft.sections.find((section) => section.sectionId === "introduction");
  assert.match(introduction?.body ?? "", /第一份來源.*\[S1\]/u);
  assert.match(introduction?.body ?? "", /第二份來源.*\[S2\]/u);
  assert.match(introduction?.body ?? "", /第四份來源.*\[S4\]/u);
  assert.deepEqual(introduction?.citationMarkers, ["[S1]", "[S2]", "[S3]", "[S4]"]);
  assert.deepEqual(introduction?.citationIds, ["source-z", "source-a", "source-m", "source-b"]);
});

test("mergeLlmReportDraft keeps hybrid sections visible while preserving fallback diagnostics", () => {
  const workspace = workspaceWithEvidence("rf-hybrid-section-fallback");
  const targetSection = workspace.draft.sections.find(
    (section) => section.sectionId === "abstract",
  );
  assert.ok(targetSection);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: true,
    message: "部分章節已改用可追溯的保守草稿。",
    warning: null,
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: true,
    fallbackReason: "writer_section_fallback:1",
    generationMode: "hybrid_evidence_grounded",
    degradedMode: true,
    writerDiagnostics: {
      requestedSections: 1,
      completedSections: 1,
      modelCompletedSections: 0,
      repairedSections: 0,
      fallbackSections: 1,
      completedSectionIds: ["abstract"],
      repairedSectionIds: [],
      fallbackSectionIds: ["abstract"],
      failureReasons: { abstract: "missing_or_invalid_section_output" },
    },
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: targetSection.title,
        prose:
          "此章節使用可追溯的保守草稿整理水餃營養與飲食文化，並保留資料邊界[S1]。",
        evidenceCardIds: [workspace.evidenceCards[0]!.id],
        citationIds: ["source-1"],
        groundingStatus: "grounded",
        generationMethod: "deterministic_evidence_fallback",
      },
    ],
  });

  assert.match(
    merged.draft.sections.find((section) => section.sectionId === "abstract")?.body ?? "",
    /保守草稿整理水餃營養/u,
  );
  assert.equal(merged.llmDiagnostics?.fallbackUsed, true);
  assert.equal(merged.llmDiagnostics?.degradedMode, true);
  assert.equal(merged.llmDiagnostics?.generationMode, "hybrid_evidence_grounded");
});

test("real-shaped API merge preserves formal chapter, ordered-content, and appendix boundaries", () => {
  const acceptedSources = Array.from({ length: 8 }, (_, index) => source(index + 1));
  const sectionIds = [
    "introduction",
    "research_question",
    "literature_review",
    "methodology",
    "findings",
    "discussion",
    "limitations",
    "conclusion",
  ] as const;
  const cards = acceptedSources.map((_, index) => evidenceCard(index + 1, {
    sectionTargets: [...sectionIds],
    sectionFit: [...sectionIds],
    usableSections: ["研究背景", "文獻探討", "研究方法", "數據分析", "結論"],
  }));
  let workspace = createReportWorkspace(
    reportInput({ mode: "直接生成完整報告" }),
    acceptedSources,
    "complete_research_report",
    "rf-real-shaped-eight-chapter",
    { evidenceCards: cards },
  );
  workspace = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "openai",
    reportGenerationModel: "qa-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    canonicalEvidenceReturned: true,
    canonicalEvidenceStatus: "complete",
    evidenceCards: cards,
    sections: sectionIds.map((sectionId, index) => ({
      sectionId,
      title: `第 ${index + 1} 章`,
      prose: `水餃研究的${sectionId}章節提供足以構成正式文獻型報告的獨立內容，並清楚保留本章的證據範圍與限制[S1][S2]。`,
      evidenceCardIds: cards.slice(0, 2).map((card) => card.id),
      citationIds: cards.slice(0, 2).map((card) => card.id),
      groundingStatus: "grounded" as const,
      generationMethod: "grounding_verifier_pruned",
      warnings: [],
    })),
  });
  workspace = applyDetailedReportSummary(workspace, { force: true });

  const previewChapters = buildDetailedReportParagraphs(workspace);
  const exported = workspaceToGeneratedReport(workspace, "一般學校報告");
  const formalDocument = exported.meta.formalReportDocument;
  assert.ok(formalDocument);
  const mainSections = formalReportSectionSequence(formalDocument);
  const previewableMainSections = mainSections.filter((section) => section.blocks.length > 0);
  const mainExport = exported.sections.filter(
    (section) => /^\d+\. /u.test(section.heading),
  );

  // A planless, unsupported legacy draft stays closed but does not manufacture
  // a second analysis theme from source order.
  assert.deepEqual(
    previewChapters.map((chapter) => ({ id: chapter.id, title: chapter.title })),
    previewableMainSections.map((section) => ({ id: section.id, title: section.title })),
  );
  assert.equal(
    mainSections.some((section) => /主要研究發現/u.test(section.title)),
    true,
    JSON.stringify(mainSections.map((section) => section.title)),
  );
  assert.deepEqual(
    exported.sections.map((section) => section.heading),
    [
      "摘要與關鍵詞",
      ...mainSections.map((section, index) => `${index + 1}. ${section.title}`),
      ...formalDocument.appendix.map((section) => section.title),
      "資料來源",
    ],
  );
  assert.doesNotMatch(
    exported.sections.map((section) => section.heading).join("\n"),
    /第一項發現是|第二項發現是|簡短結論|目前無法回答的部分/u,
  );
  assert.deepEqual(
    mainExport.map((section) => section.blocks.map((block) => block.type)),
    mainSections.map((section) => formalReportSectionContent(section).map((node) =>
      node.nodeType === "figure"
        ? "formalFigure"
        : node.nodeType === "table"
          ? "formalTable"
          : "paragraph"
    )),
  );

  for (const chapter of previewChapters) {
    const formalSection = mainSections.find((section) => section.id === chapter.id);
    assert.ok(formalSection, chapter.id);
    assert.deepEqual(
      chapter.orderedContent?.map((node) => node.nodeType),
      formalReportSectionContent(formalSection).map((node) => node.nodeType),
      chapter.title,
    );
  }

  // Every section uses one canonical order in preview/export. Evidence figures
  // are interleaved with prose so each visual sits beside the argument it serves;
  // governance tables retain guide -> tables -> explanation order.
  for (const section of [...mainSections, ...formalDocument.appendix]) {
    if (section.figures.length === 0 && section.tables.length === 0) continue;
    const nodes = formalReportSectionContent(section);
    const orderedKinds = nodes.map((node) =>
      node.nodeType === "paragraph"
        ? node.block.paragraphRole === "reading_guide" ? "reading_guide" : "narrative"
        : node.nodeType
    );
    const narrativeCount = section.blocks.filter(
      (block) => block.paragraphRole !== "reading_guide",
    ).length;
    assert.equal(orderedKinds[0], "reading_guide", section.title);
    assert.equal(orderedKinds.filter((kind) => kind === "figure").length, section.figures.length);
    assert.equal(orderedKinds.filter((kind) => kind === "table").length, section.tables.length);
    assert.equal(orderedKinds.filter((kind) => kind === "narrative").length, narrativeCount);
    nodes.forEach((node, index) => {
      if (node.nodeType !== "figure") return;
      const before = nodes[index - 1];
      const after = nodes[index + 1];
      assert.ok(
        (before?.nodeType === "paragraph" && before.block.paragraphRole !== "reading_guide") ||
        (after?.nodeType === "paragraph" && after.block.paragraphRole !== "reading_guide"),
        `${section.title}: figure must be adjacent to narrative`,
      );
    });
    if (section.role !== "appendix") assert.equal(narrativeCount > 0, true, section.title);
  }

  const sourceGovernanceTableTitles = [
    "來源角色與使用狀態",
    "納入來源的證據用途與限制比較",
  ];
  assert.deepEqual(
    mainSections.flatMap((section) => section.tables.map((table) => table.title))
      .filter((title) => sourceGovernanceTableTitles.includes(title)),
    [],
  );
  assert.equal(
    mainSections.flatMap((section) => section.figures)
      .some((figure) => figure.figureType === "directness_distribution"),
    false,
  );
  assert.equal(formalDocument.appendix.length, 1);
  assert.equal(formalDocument.appendix[0]?.role, "appendix");
  assert.deepEqual(
    formalDocument.appendix[0]?.tables.map((table) => table.title),
    sourceGovernanceTableTitles,
  );
  const sourceIndex = exported.sections.findIndex((section) => section.heading === "資料來源");
  assert.equal(sourceIndex >= 0, true);
  assert.equal(
    formalDocument.appendix.every((appendixSection) =>
      exported.sections.findIndex((section) => section.heading === appendixSection.title) < sourceIndex
    ),
    true,
  );
  assert.equal(exported.shortTopic, undefined);
  assert.match(exported.meta.versionLabel, /有限證據報告/u);
  assert.equal(formalDocument.integrity.status, "blocked");
});

test("mergeLlmReportDraft keeps references limited to accepted evidence cards", () => {
  const workspace: ReportWorkspace = workspaceWithEvidence("rf-accepted-only");
  const targetSection = workspace.draft.sections.find((section) => section.sectionId === "abstract");
  const acceptedEvidenceId = workspace.evidenceCards[0]?.id;
  assert.ok(targetSection);
  assert.ok(acceptedEvidenceId);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: "摘要",
        prose:
          "這段正式報告正文只使用已接受證據卡，並保留可追溯的 citation marker［Ｓ1］。",
        evidenceCardIds: [acceptedEvidenceId, "evidence:unaccepted-source:0"],
        citationIds: ["source-1", "unaccepted-source"],
      },
    ],
  });

  const mergedSection = merged.draft.sections.find(
    (section) => section.sectionId === targetSection.sectionId,
  );
  assert.deepEqual(mergedSection?.evidenceCardIds, [acceptedEvidenceId]);
  assert.deepEqual(mergedSection?.citationIds, ["source-1"]);
  assert.deepEqual(mergedSection?.citationMarkers, ["[S1]"]);
  assert.equal(
    merged.report.meta.researchDraft.sections.find(
      (section: { sectionId: string }) => section.sectionId === targetSection.sectionId,
    )?.citationIds.includes("unaccepted-source"),
    false,
  );
});

test("mergeLlmReportDraft does not backfill citation badges without actual markers", () => {
  const workspace: ReportWorkspace = workspaceWithEvidence("rf-no-marker-backfill");
  const targetSection = workspace.draft.sections.find((section) => section.citationCount > 0);
  assert.ok(targetSection);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: targetSection.title,
        prose: "本節暫不提出正式主張，只保留來源不足提醒。",
        evidenceCardIds: [],
        citationIds: [],
      },
    ],
  });

  const mergedSection = merged.draft.sections.find(
    (section) => section.sectionId === targetSection.sectionId,
  );
  assert.deepEqual(mergedSection?.citationMarkers, []);
  assert.deepEqual(mergedSection?.citationIds, []);
  assert.equal(mergedSection?.citationCount, 0);
});

test("mergeLlmReportDraft keeps the existing draft when the LLM call fails", () => {
  const workspace: ReportWorkspace = workspaceWithEvidence("rf-keep-draft");

  const merged = mergeLlmReportDraft(workspace, {
    ok: false,
    status: "unavailable",
    llm_status: "failed",
    fallback_used: true,
    message: "AI 服務暫時不可用，已使用本地規則 fallback。",
    warning: "provider timeout",
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "provider timeout",
    sections: [],
  });

  assert.equal(merged.draft.text, workspace.draft.text);
  assert.equal(merged.draft.sections[0]?.body, workspace.draft.sections[0]?.body);
  assert.equal(merged.llmDiagnostics?.reportGenerationStatus, "failed");
  assert.equal(
    merged.report.meta.researchDraft.sections[0]?.body,
    workspace.draft.sections[0]?.body,
  );
});

test("mergeLlmReportDraft keeps stronger local prose when fallback sections are returned", () => {
  const workspace: ReportWorkspace = workspaceWithEvidence("rf-constrained-fallback");
  const targetSection = workspace.draft.sections[0];
  assert.ok(targetSection);

  const merged = mergeLlmReportDraft(workspace, {
    ok: false,
    status: "error",
    llm_status: "failed",
    fallback_used: true,
    message: "AI 服務暫時不可用，已使用本地規則 fallback。",
    warning: "provider timeout",
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "provider timeout",
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: "摘要",
        prose:
          "本稿僅依已接受來源形成受限草稿，正文集中整理水餃的營養與飲食文化證據，並保留未補證部分[S1][S2]。",
        evidenceCardIds: workspace.evidenceCards.slice(0, 2).map((card) => card.id),
        citationIds: ["source-1", "source-2"],
        warnings: ["段落受限於摘要證據，尚未讀取全文。"],
      },
    ],
  });

  assert.equal(merged.draft.sections[0]?.body, workspace.draft.sections[0]?.body);
  assert.doesNotMatch(merged.draft.sections[0]?.body ?? "", /受限草稿/);
  assert.equal(merged.llmDiagnostics?.reportGenerationStatus, "failed");
  assert.equal(merged.llmDiagnostics?.fallbackUsed, true);
});

test("mergeLlmReportDraft trusts an explicit canonical empty evidence list from the server", () => {
  const workspace = workspaceWithEvidence("rf-canonical-evidence-empty");
  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "unavailable",
    llm_status: "failed",
    fallback_used: true,
    message: "伺服器已拒絕無法對齊 supportSpan 的 evidence cards。",
    warning: "rejected_evidence_cards",
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "rejected_evidence_cards",
    sections: [],
    evidenceCards: [],
    canonicalEvidenceReturned: true,
  });

  assert.equal(merged.evidenceCards.length, 0);
  assert.equal(merged.generationPayload.evidenceCards.length, 0);
  assert.equal(merged.draft.debug.evidenceCardsCount, 0);
  assert.equal(merged.qualityReport.evidenceCardCount, 0);
});

test("mergeLlmReportDraft keeps traceable local evidence when canonical status is indeterminate", () => {
  const workspace = workspaceWithEvidence("rf-canonical-evidence-indeterminate");
  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "insufficient_sources",
    llm_status: "skipped",
    fallback_used: true,
    message: "跨語言證據仍可追溯，但無法直接判定為空。",
    warning: "canonical_evidence:indeterminate",
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "skipped",
    fallbackUsed: true,
    fallbackReason: "canonical_evidence:indeterminate",
    sectionPlan: [],
    sections: [],
    evidenceCards: [],
    canonicalEvidenceReturned: true,
    canonicalEvidenceStatus: "indeterminate",
  });

  assert.equal(merged.evidenceCards.length, workspace.evidenceCards.length);
  assert.equal(merged.draft.debug.evidenceCardsCount, workspace.evidenceCards.length);
});

test("mergeLlmReportDraft keeps traceable cards alongside a partial canonical response", () => {
  const workspace = workspaceWithEvidence("rf-canonical-evidence-partial");
  const returnedCard = workspace.evidenceCards[0];
  assert.ok(returnedCard);
  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: "canonical_evidence:partial",
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sectionPlan: [],
    sections: [],
    evidenceCards: [returnedCard],
    canonicalEvidenceReturned: true,
    canonicalEvidenceStatus: "partial",
    canonicalTraceableIndeterminateSourceIds: ["source-2"],
  });

  assert.deepEqual(
    Array.from(new Set(merged.evidenceCards.map((card) => card.sourceId))).sort(),
    ["source-1", "source-2"],
  );
});

test("mergeLlmReportDraft uses an evidence-bound fallback to replace an incomplete local section", () => {
  const original = workspaceWithEvidence("rf-safe-fallback-section");
  const target = original.draft.sections.find((section) => section.sectionId === "findings");
  assert.ok(target);
  const incompleteBody = "目前沒有可直接支撐本節的證據，因此只保留資料缺口。";
  const workspace: ReportWorkspace = {
    ...original,
    draft: {
      ...original.draft,
      sections: original.draft.sections.map((section) =>
        section.sectionId === target.sectionId
          ? { ...section, body: incompleteBody, prose: incompleteBody }
          : section,
      ),
    },
  };
  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "error",
    llm_status: "failed",
    fallback_used: true,
    message: "模型未完成，使用證據綁定保守段落。",
    warning: "fallback_conservative_draft",
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "fallback_conservative_draft",
    sectionPlan: [],
    sections: [
      {
        sectionId: target.sectionId,
        title: target.title,
        prose: "依已接受來源，水餃的營養標示與家庭飲食文化可作為本節主要整理面向[S1]。",
        evidenceCardIds: [workspace.evidenceCards[0]!.id],
        citationIds: ["source-1"],
        groundingStatus: "grounded",
        generationMethod: "fallback_bundle_synthesis",
      },
    ],
  });

  assert.match(
    merged.draft.sections.find((section) => section.sectionId === target.sectionId)?.body ?? "",
    /營養標示與家庭飲食文化/u,
  );
});

test("mergeLlmReportDraft applies grounded sections but keeps verifier-blocked sections local", () => {
  const workspace = workspaceWithEvidence("rf-mixed-grounding");
  const narrativeSections = workspace.draft.sections.filter(
    (section) => section.sectionId !== "title" && section.sectionId !== "references",
  );
  const groundedTarget = narrativeSections[0];
  const blockedTarget = narrativeSections[1];
  assert.ok(groundedTarget);
  assert.ok(blockedTarget);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "openai",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [
      {
        sectionId: groundedTarget.sectionId,
        title: groundedTarget.title,
        prose: "水餃研究顯示營養標示與飲食文化可由已接受來源共同說明[S1]。",
        evidenceCardIds: [workspace.evidenceCards[0]!.id],
        citationIds: ["source-1"],
        groundingStatus: "grounded",
        generationMethod: "llm_evidence_grounded",
      },
      {
        sectionId: blockedTarget.sectionId,
        title: blockedTarget.title,
        prose: "本節目前引用支撐不足，系統已暫停正式段落輸出。",
        evidenceCardIds: [],
        citationIds: [],
        groundingStatus: "unsupported",
        generationMethod: "grounding_verifier_blocked",
      },
    ],
  });

  assert.match(
    merged.draft.sections.find((section) => section.sectionId === groundedTarget.sectionId)?.body ?? "",
    /共同說明/,
  );
  assert.equal(
    merged.draft.sections.find((section) => section.sectionId === blockedTarget.sectionId)?.body,
    blockedTarget.body,
  );
});
