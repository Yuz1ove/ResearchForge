import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import type { Request, Response } from "express";
import type { SourceRecord } from "@workspace/api-zod";
import type { LlmHealthResult, LlmSmokeResult } from "../services/llm-service";
import {
  createGenerateReportRouter,
  normalizeGenerateReportRequest,
} from "./generate-report";

const originalLlmEnv = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
};

const TEST_WORKFLOW_ID = "wf-generate-report-test";
const TEST_TOPIC_HASH = "topic-cola-test";

before(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-5.4";
  process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
  process.env.LLM_PROVIDER = "openai";
});

after(() => {
  for (const [key, value] of Object.entries(originalLlmEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function source(index: number): SourceRecord {
  return {
    id: `source-${index}`,
    title: `可樂健康研究 ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "此來源討論可樂、含糖飲料、糖分、咖啡因與健康影響，摘要足以支撐初步報告。",
    doi: `10.1000/cola-${index}`,
    url: `https://doi.org/10.1000/cola-${index}`,
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    workflowId: TEST_WORKFLOW_ID,
    topic: "可樂",
    normalizedTopic: "可樂",
    topicHash: TEST_TOPIC_HASH,
    queryPlanHash: "qp-generate-report-test",
  };
}

function sources(count: number): SourceRecord[] {
  return Array.from({ length: count }, (_, index) => source(index + 1));
}

function officialSource(index: number): SourceRecord {
  return {
    ...source(index),
    title: `夕陽餘暉與光波長官方背景 ${index}`,
    authors: ["NASA Education"],
    abstract: null,
    doi: null,
    url: `https://example.gov/sunset-${index}`,
    sourceType: "Official Source",
    provider: "Official Source",
    sourceKind: "web",
    sourceCategory: "government_or_institution",
    publisher: index % 2 === 0 ? "UCAR Center for Science Education" : "NASA",
    containerTitle: "Education",
    recommendationBucket: "official_background",
    sourceRole: "official_background_explanation",
    isPeerReviewed: false,
    acceptedByUser: true,
    userDecision: "accepted_as_background",
    acceptedAs: "background",
    relevanceLevel: "secondary",
    evidenceGrounding: "metadata_only",
    usableSections: ["研究背景"],
  };
}

function officialSources(count: number): SourceRecord[] {
  return Array.from({ length: count }, (_, index) => officialSource(index + 1));
}

function evidenceCards(count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `evidence:source-${index + 1}:0`,
    sourceId: `source-${index + 1}`,
    claim: "可樂糖分證據",
    evidence: "摘要提到糖分與咖啡因。",
    summary: "可支撐健康影響段落。",
    relevance: "健康影響",
    sourceTitle: `可樂健康研究 ${index + 1}`,
    sourceProvider: "Crossref",
    year: 2024,
    usableSections: ["研究背景"],
    citationText: "Lovelace（2024）",
    limitation: null,
    workflowId: TEST_WORKFLOW_ID,
    topicHash: TEST_TOPIC_HASH,
  }));
}

function officialEvidenceCards(count = 3) {
  return Array.from({ length: count }, (_, index) => ({
    id: `evidence:source-${index + 1}:0`,
    sourceId: `source-${index + 1}`,
    claim: "夕陽顏色與光散射背景",
    evidence: "官方教育資料說明光在大氣中的散射與顏色。",
    summary: "作為背景說明，不作為同儕審查實證結論。",
    relevance: "研究背景",
    sourceTitle: `夕陽餘暉與光波長官方背景 ${index + 1}`,
    sourceProvider: index % 2 === 0 ? "UCAR" : "NASA",
    sourceType: "official_background",
    recommendationBucket: "official_background",
    isPeerReviewed: false,
    acceptedByUser: true,
    userDecision: "accepted_as_background",
    year: 2024,
    usableSections: ["研究背景"],
    citationText: "NASA Education（2024）",
    limitation: "非同行評審論文；只能作為官方教育或機構背景說明。",
    limitations: ["非同行評審論文；只能作為官方教育或機構背景說明。"],
    workflowId: TEST_WORKFLOW_ID,
    topicHash: TEST_TOPIC_HASH,
  }));
}

function healthyLlm(): LlmHealthResult {
  return {
    ok: true,
    available: true,
    status: "configured",
    provider: "openai",
    configuredModel: "gpt-5.4",
    resolvedModel: "gpt-5.4",
    model: "gpt-5.4",
    apiKeyPresent: true,
    apiKeyPrefix: "test-ke...-key",
    apiKeyConfigured: true,
    baseURL: "https://api.openai.com/v1",
    baseURLConfigured: true,
    credentialPreview: "test-ke...-key",
    modelsEndpointReachable: true,
    modelAvailable: true,
    modelConfigured: true,
    compatibleMode: "openai_responses_or_chat",
    missing: [],
    source: "openai_env",
    errorCode: null,
    errorMessage: null,
    checkedAt: "2026-07-01T00:00:00.000Z",
    latencyMs: 1,
  };
}

function smokyLlm(): LlmSmokeResult {
  return {
    ok: true,
    available: true,
    status: "ok",
    provider: "openai",
    adapter: "openai",
    requestedModel: "gpt-5.4",
    actualModel: "gpt-5.4",
    model: "gpt-5.4",
    text: "RF_LLM_SMOKE_OK",
    normalizedText: "RF_LLM_SMOKE_OK",
    usage: null,
    checkedAt: "2026-07-01T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    fallbackUsed: false,
    latencyMs: 1,
  };
}

test("generate-report request normalization requires topic and at least one accepted source", () => {
  assert.equal(normalizeGenerateReportRequest({ topic: "可樂", acceptedSources: [] }), null);

  const normalized = normalizeGenerateReportRequest({
    topic: "  可樂  ",
    reportType: "研究報告",
    audience: "高中",
    language: "繁體中文",
    generationMode: "preliminary",
    reportMode: "short",
    workflowId: TEST_WORKFLOW_ID,
    topicHash: TEST_TOPIC_HASH,
    acceptedSources: sources(5),
    acceptedSourceIds: sources(5).map((item) => item.id),
    evidenceCards: [
      {
        id: "evidence:source-1:0",
        sourceId: "source-1",
        claim: "可樂糖分證據",
        evidence: "摘要提到糖分與咖啡因。",
        summary: "可支撐健康影響段落。",
        relevance: "健康影響",
        sourceTitle: "可樂健康研究 1",
        sourceProvider: "Crossref",
        year: 2024,
        usableSections: ["研究背景"],
        citationText: "Lovelace（2024）",
        limitation: null,
        workflowId: TEST_WORKFLOW_ID,
        topicHash: TEST_TOPIC_HASH,
      },
    ],
  });

  assert.equal(normalized?.topic, "可樂");
  assert.equal(normalized?.generationMode, "preliminary");
  assert.equal(normalized?.acceptedSources.length, 5);
  assert.equal(
    normalized?.acceptedSources.every((item) => item.reviewState === "accepted"),
    true,
  );
  assert.equal(normalized?.evidenceCards?.length, 1);
});

test("generate-report route passes normalized accepted sources to report writer", async () => {
  let writerTopic = "";
  let writerSourceCount = 0;
  let writerEvidenceCount = 0;
  const router = createGenerateReportRouter({
    healthChecker: async () => healthyLlm(),
    smokeTester: async () => smokyLlm(),
    reportWriter: async (input) => {
      writerTopic = input.topic;
      writerSourceCount = input.acceptedSources.length;
      writerEvidenceCount = input.evidenceCards?.length ?? 0;
      assert.equal(
        input.acceptedSources.every((item) => item.reviewState === "accepted"),
        true,
      );
      return {
        ok: true,
        status: "success",
        llm_status: "success",
        fallback_used: false,
        message: null,
        warning: null,
        sections: [
          {
            sectionId: "abstract",
            title: "摘要",
            prose: "這是由 LLM 根據已接受來源生成的正式中文摘要段落。",
            evidenceCardIds: ["evidence:source-1:0"],
            citationIds: ["source-1"],
          },
        ],
        reportGenerationProvider: "openai",
        reportGenerationModel: "gpt-5.4",
        reportGenerationStatus: "success",
        fallbackUsed: false,
        fallbackReason: null,
        adapter: "openai",
        requestedModel: "gpt-5.4",
        actualModel: "gpt-5.4",
      };
    },
  });
  const route = router.stack.find((layer) => layer.route?.path === "/generate-report");
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "可樂",
      reportMode: "short",
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      acceptedSources: sources(5),
      acceptedSourceIds: sources(5).map((item) => item.id),
      evidenceCards: [
        {
          id: "evidence:source-1:0",
          sourceId: "source-1",
          claim: "可樂糖分證據",
          evidence: "摘要提到糖分與咖啡因。",
          summary: "可支撐健康影響段落。",
          relevance: "健康影響",
          sourceTitle: "可樂健康研究 1",
          sourceProvider: "Crossref",
          year: 2024,
          usableSections: ["研究背景"],
          citationText: "Lovelace（2024）",
          limitation: null,
          workflowId: TEST_WORKFLOW_ID,
          topicHash: TEST_TOPIC_HASH,
        },
      ],
    },
  };
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

  assert.equal(statusCode, 200);
  assert.equal(writerTopic, "可樂");
  assert.equal(writerSourceCount, 5);
  assert.equal(writerEvidenceCount, 1);
  assert.deepEqual((payload as { sections: unknown[] }).sections.length, 1);
});

test("generate-report route allows accepted official background sources in background report mode", async () => {
  let writerGenerationMode = "";
  let writerSourceCount = 0;
  let writerEvidenceCount = 0;
  let writerOfficialEvidenceCount = 0;
  const router = createGenerateReportRouter({
    healthChecker: async () => healthyLlm(),
    smokeTester: async () => smokyLlm(),
    reportWriter: async (input) => {
      writerGenerationMode = input.generationMode ?? "";
      writerSourceCount = input.acceptedSources.length;
      writerEvidenceCount = input.evidenceCards?.length ?? 0;
      writerOfficialEvidenceCount =
        input.evidenceCards?.filter(
          (card) => card.recommendationBucket === "official_background",
        ).length ?? 0;
      return {
        ok: true,
        status: "success",
        llm_status: "success",
        fallback_used: false,
        message: null,
        warning: null,
        sections: [
          {
            sectionId: "abstract",
            title: "摘要",
            prose: "本報告主要依官方教育與機構資料整理，作為背景說明。",
            evidenceCardIds: ["evidence:source-1:0"],
            citationIds: ["source-1"],
          },
        ],
        reportGenerationProvider: "openai",
        reportGenerationModel: "gpt-5.4",
        reportGenerationStatus: "success",
        fallbackUsed: false,
        fallbackReason: null,
        adapter: "openai",
        requestedModel: "gpt-5.4",
        actualModel: "gpt-5.4",
      };
    },
  });
  const route = router.stack.find((layer) => layer.route?.path === "/generate-report");
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "夕陽餘暉與光波長的關係",
      reportMode: "short",
      generationMode: "background_report_mode",
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      acceptedSources: officialSources(3),
      acceptedSourceIds: officialSources(3).map((item) => item.id),
      evidenceCards: officialEvidenceCards(3),
      evidenceCardIds: officialEvidenceCards(3).map((item) => item.id),
    },
  };
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

  assert.equal(statusCode, 200);
  assert.equal(writerGenerationMode, "background_report_mode");
  assert.equal(writerSourceCount, 3);
  assert.equal(writerEvidenceCount, 3);
  assert.equal(writerOfficialEvidenceCount, 3);
  assert.equal((payload as { ok: boolean }).ok, true);
});

test("generate-report route returns structured error when writer throws", async () => {
  const router = createGenerateReportRouter({
    healthChecker: async () => healthyLlm(),
    smokeTester: async () => smokyLlm(),
    reportWriter: async () => {
      throw new Error("ollama unavailable");
    },
  });
  const route = router.stack.find((layer) => layer.route?.path === "/generate-report");
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "可樂",
      reportMode: "short",
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      acceptedSources: sources(5),
      acceptedSourceIds: sources(5).map((item) => item.id),
      evidenceCards: evidenceCards(1),
    },
  };
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

  assert.equal(statusCode, 500);
  const result = payload as {
    ok: boolean;
    code: string;
    message: string;
    details: { fallbackUsed: boolean; requestedModel: string | null };
    warning: string;
  };
  assert.equal(result.ok, false);
  assert.equal(result.code, "REPORT_WRITER_FAILED");
  assert.equal(result.details.fallbackUsed, false);
  assert.equal(result.details.requestedModel, "gpt-5.4");
  assert.match(result.warning, /ollama unavailable/);
});

test("generate-report route blocks when evidence cards are missing", async () => {
  const router = createGenerateReportRouter({
    healthChecker: async () => healthyLlm(),
    smokeTester: async () => smokyLlm(),
    reportWriter: async () => {
      throw new Error("writer should not be called without evidence cards");
    },
  });
  const route = router.stack.find((layer) => layer.route?.path === "/generate-report");
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "可樂",
      reportMode: "short",
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      acceptedSources: sources(5),
      acceptedSourceIds: sources(5).map((item) => item.id),
      evidenceCards: [],
    },
  };
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

  assert.equal(statusCode, 400);
  assert.equal((payload as { code: string }).code, "EVIDENCE_CARDS_REQUIRED");
});

test("generate-report route blocks when topic hash is missing", async () => {
  const router = createGenerateReportRouter({
    healthChecker: async () => healthyLlm(),
    smokeTester: async () => smokyLlm(),
    reportWriter: async () => {
      throw new Error("writer should not be called without topic hash");
    },
  });
  const route = router.stack.find((layer) => layer.route?.path === "/generate-report");
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "可樂",
      reportMode: "short",
      workflowId: TEST_WORKFLOW_ID,
      acceptedSources: sources(5),
      acceptedSourceIds: sources(5).map((item) => item.id),
      evidenceCards: evidenceCards(1),
    },
  };
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

  assert.equal(statusCode, 400);
  assert.equal((payload as { code: string; status: string }).code, "TOPIC_HASH_REQUIRED");
  assert.equal((payload as { code: string; status: string }).status, "missing_topic_hash");
});

test("generate-report route blocks mismatched evidence card topic hash", async () => {
  const router = createGenerateReportRouter({
    healthChecker: async () => healthyLlm(),
    smokeTester: async () => smokyLlm(),
    reportWriter: async () => {
      throw new Error("writer should not be called with mismatched evidence cards");
    },
  });
  const route = router.stack.find((layer) => layer.route?.path === "/generate-report");
  assert.ok(route?.route);

  let statusCode = 200;
  let payload: unknown;
  const req = {
    body: {
      topic: "可樂",
      reportMode: "short",
      workflowId: TEST_WORKFLOW_ID,
      topicHash: TEST_TOPIC_HASH,
      acceptedSources: sources(5),
      acceptedSourceIds: sources(5).map((item) => item.id),
      evidenceCards: evidenceCards(1).map((card) => ({
        ...card,
        topicHash: "old-topic",
      })),
    },
  };
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

  assert.equal(statusCode, 400);
  assert.equal((payload as { code: string; status: string }).code, "WORKFLOW_CONTEXT_MISMATCH");
  assert.equal((payload as { code: string; status: string }).status, "workflow_context_mismatch");
  assert.deepEqual(
    (payload as { contextErrors: string[] }).contextErrors,
    ["evidence_card_topic_hash_mismatch"],
  );
});
