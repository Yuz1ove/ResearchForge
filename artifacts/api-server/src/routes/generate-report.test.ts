import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";
import type { SourceRecord } from "@workspace/api-zod";
import {
  createGenerateReportRouter,
  normalizeGenerateReportRequest,
} from "./generate-report";

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
    acceptedSources: [source(1)],
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
      },
    ],
  });

  assert.equal(normalized?.topic, "可樂");
  assert.equal(normalized?.generationMode, "preliminary");
  assert.equal(normalized?.acceptedSources.length, 1);
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
        reportGenerationProvider: "ollama",
        reportGenerationModel: "test-model",
        reportGenerationStatus: "success",
        fallbackUsed: false,
        fallbackReason: null,
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
      acceptedSources: [source(1)],
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
  assert.equal(writerSourceCount, 1);
  assert.equal(writerEvidenceCount, 1);
  assert.deepEqual((payload as { sections: unknown[] }).sections.length, 1);
});

test("generate-report route falls back instead of returning 500 when writer throws", async () => {
  const router = createGenerateReportRouter({
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
      acceptedSources: [source(1)],
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
  const result = payload as {
    ok: boolean;
    status: string;
    fallback_used: boolean;
    reportGenerationStatus: string;
    fallbackReason: string;
  };
  assert.equal(result.ok, false);
  assert.equal(result.status, "error");
  assert.equal(result.fallback_used, true);
  assert.equal(result.reportGenerationStatus, "failed");
  assert.match(result.fallbackReason, /ollama unavailable/);
});
