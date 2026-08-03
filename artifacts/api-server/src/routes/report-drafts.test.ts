import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { SourceRecord } from "@workspace/api-zod";
import {
  createReportDraftsRouter,
  verifyGroundedSection,
  type ReportDraftHandler,
} from "./report-drafts";
import type { ReportWriterResult } from "../services/report-writer";

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
  const route = router.stack.find((layer) => layer.route?.path === "/report-drafts");
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

test("report-drafts returns conservative fallback draft with evidence bindings when LLM is unavailable", async () => {
  let receivedSourceMixProfile: string | undefined;
  const reportWriter: ReportDraftHandler = async (input) => {
    receivedSourceMixProfile = input.sourceMixProfile;
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
    sections: Array<{ prose: string; evidenceCardIds: string[] }>;
    missingEvidence: unknown[];
  };

  assert.equal(statusCode, 200);
  assert.equal(receivedSourceMixProfile, "school_report_balanced");
  assert.equal(result.generationMode, "fallback_conservative_draft");
  assert.equal(result.sections[0]?.evidenceCardIds.includes("evidence:source-1:0"), true);
  assert.doesNotMatch(result.sections[0]?.prose ?? "", /目前可先|建議補充/);
});

test("report-drafts refuses a standard report when ten accepted sources yield one usable evidence source", async () => {
  let writerCalled = false;
  const router = createReportDraftsRouter({
    reportWriter: async () => {
      writerCalled = true;
      return failedWriterResult();
    },
  });
  const acceptedSources = Array.from({ length: 10 }, (_, index) =>
    source({
      id: `source-${index + 1}`,
      doi: `10.1000/source-${index + 1}`,
      url: `https://doi.org/10.1000/source-${index + 1}`,
      abstract: index === 0
        ? "唯一可形成引用證據卡的來源內容。"
        : null,
      recommendationBucket: "scholarly_recommended",
      sourceRole: "core_scholarly_evidence",
    }),
  );

  const { statusCode, payload } = await invoke(router, {
    topic: "多來源接受但證據抽取失敗的研究主題",
    reportMode: "standard",
    acceptedSources,
    evidenceCards: [
      evidence({
        id: "evidence:source-1:only",
        sourceId: "source-1",
        sourceTitle: "來源 1",
        supportSpan: "唯一可形成引用證據卡的來源內容。",
        supportedByText: "唯一可形成引用證據卡的來源內容。",
      }),
    ],
    outline: [{ sectionId: "literature_review", title: "文獻探討" }],
  });

  assert.equal(statusCode, 422);
  assert.equal(writerCalled, false);
  assert.equal((payload as { code?: string }).code, "EVIDENCE_INSUFFICIENT_FOR_STANDARD_REPORT");
});

test("report-drafts blocks when background encyclopedia evidence fails the usable-evidence gate", async () => {
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
  const result = payload as { code?: string; readiness?: { canGenerate?: boolean } };

  assert.equal(statusCode, 422);
  assert.equal(result.code, "EVIDENCE_REQUIRED");
  assert.equal(result.readiness?.canGenerate, false);
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
        abstract: "Lithium-ion batteries are used in phones and electric vehicles.",
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

test("report-drafts blocks legacy frontend evidence without explicit supportSpan", async () => {
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
  const result = payload as { code?: string; readiness?: { canGenerate?: boolean } };

  assert.equal(statusCode, 422);
  assert.equal(result.code, "EVIDENCE_REQUIRED");
  assert.equal(result.readiness?.canGenerate, false);
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
        abstract: "Lithium-ion batteries are used in phones and electric vehicles.",
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
