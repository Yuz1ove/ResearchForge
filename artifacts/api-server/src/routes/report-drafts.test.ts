import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { SourceRecord } from "@workspace/api-zod";
import {
  createReportDraftsRouter,
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
