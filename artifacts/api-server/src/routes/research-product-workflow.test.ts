import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  ResearchProductExportResponseSchema,
  ResearchProductWorkflowSnapshotV1Schema,
  type ResearchProductWorkflowSnapshotV1,
} from "@workspace/api-zod/research-product-workflow";
import { InMemoryResearchProductWorkflowRepository } from "../services/research/product-workflow";
import type { SearchIntentSourceSearchResult } from "../services/search-intent-planner";
import { createResearchProductWorkflowRouter } from "./research-product-workflow";

async function listen(options: {
  sourceSearch?: NonNullable<
    Parameters<typeof createResearchProductWorkflowRouter>[0]
  >["sourceSearch"];
} = {}) {
  const repository = new InMemoryResearchProductWorkflowRepository();
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api", createResearchProductWorkflowRouter({ repository, ...options }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api`,
    close: async () => {
      server.close();
      server.closeAllConnections?.();
      server.unref();
    },
  };
}

test("LIVE research run materializes two real-provider records with auditable abstract evidence", async (t) => {
  const retrievedAt = "2026-09-01T15:30:00.000Z";
  const sourceSearch = async () => ({
    ok: true,
    workflowId: "live-search-workflow",
    queryPlanHash: "live-query-plan-hash",
    warnings: [],
    sources: [
      {
        id: "https://openalex.org/W123",
        title: "Microplastics and growth in marine organisms",
        authors: ["Marine Researcher"],
        year: 2024,
        abstract: "Microplastic exposure reduced growth in the studied marine organisms. The experiment was limited to laboratory conditions.",
        doi: "10.1000/openalex-live",
        url: "https://doi.org/10.1000/openalex-live",
        sourceType: "OpenAlex",
        reviewState: "candidate",
        publisher: "Marine Journal",
        containerTitle: "Marine Journal",
        accessedAt: retrievedAt,
        provider: "OpenAlex",
        queryUsed: "microplastics marine organisms growth",
        retrievedAt,
        sourceKind: "journal_article",
        citationCount: 12,
        isOpenAccess: true,
        relevanceScore: 0.92,
        sourceQualityScore: 0.88,
        providerIds: { OpenAlex: "W123" },
      },
      {
        id: "doi:10.1000/crossref-live",
        title: "Microplastic trophic transfer in a marine food web",
        authors: ["Ocean Scientist"],
        year: 2023,
        abstract: "Microplastics transferred between trophic levels in the observed marine food web. Field coverage was geographically bounded.",
        doi: "10.1000/crossref-live",
        url: "https://doi.org/10.1000/crossref-live",
        sourceType: "Crossref",
        reviewState: "candidate",
        publisher: "Ocean Journal",
        containerTitle: "Ocean Journal",
        accessedAt: retrievedAt,
        provider: "Crossref",
        queryUsed: "microplastics marine food web trophic transfer",
        retrievedAt,
        sourceKind: "journal_article",
        citationCount: 8,
        isOpenAccess: false,
        relevanceScore: 0.9,
        sourceQualityScore: 0.84,
        providerIds: { Crossref: "10.1000/crossref-live" },
      },
    ],
    provider_status: [
      {
        ok: true,
        provider: "OpenAlex",
        query: "microplastics marine organisms growth",
        results: [],
        error_type: null,
        error_message: null,
      },
      {
        ok: true,
        provider: "Crossref",
        query: "microplastics marine food web trophic transfer",
        results: [],
        error_type: null,
        error_message: null,
      },
    ],
    diagnostics: {
      retrieved_count: 40,
      deduped_count: 36,
      displayed_count: 2,
    },
  } as unknown as SearchIntentSourceSearchResult);
  const server = await listen({ sourceSearch });
  t.after(() => server.close());

  const created = await jsonRequest(
    `${server.baseUrl}/research-product/projects`,
    "POST",
    {
      topic: "塑膠微粒對海洋生物的影響",
      targetAudience: "高中生",
      targetLanguage: "zh-TW",
      depth: "deep",
      mode: "LIVE",
    },
  );
  const initial = ResearchProductWorkflowSnapshotV1Schema.parse(created.body);
  const run = await jsonRequest(
    `${server.baseUrl}/research-product/projects/${initial.project.id}/research-runs`,
    "POST",
  );
  assert.equal(run.response.status, 200);
  const snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(run.body);
  assert.equal(snapshot.project.mode, "LIVE");
  assert.equal(snapshot.project.status, "EVIDENCE_REVIEW_REQUIRED");
  assert.equal(snapshot.sourceCandidates.length, 2);
  assert.equal(snapshot.sources.length, 2);
  assert.equal(snapshot.evidenceCards.length, 2);
  assert.deepEqual(
    [...new Set(snapshot.sourceCandidates.map((candidate) => candidate.provider))].sort(),
    ["Crossref", "OpenAlex"],
  );
  assert.ok(snapshot.sourceCandidates.every((candidate) => candidate.providerRawRef.startsWith("live-search-record:")));
  assert.ok(snapshot.queries.every((query) => query.status === "completed"));
  assert.ok(snapshot.evidenceCards.every((card) => card.createdBy === "rule"));
  assert.ok(snapshot.evidenceCards.every((card) => card.limitations.some((item) => item.includes("abstract"))));
});

async function jsonRequest(
  url: string,
  method: string,
  body?: unknown,
): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json", Connection: "close" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

test("HTTP vertical slice persists, reloads, verifies, and exports a FIXTURE project", async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const createdResult = await jsonRequest(
    `${server.baseUrl}/research-product/projects`,
    "POST",
    {
      topic: "多語言學術資料如何批量處理",
      targetAudience: "高中生",
      targetLanguage: "zh-TW",
      depth: "standard",
      mode: "FIXTURE",
    },
  );
  assert.equal(createdResult.response.status, 201);
  let snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(createdResult.body);
  const projectUrl = `${server.baseUrl}/research-product/projects/${snapshot.project.id}`;

  const reloaded = await jsonRequest(projectUrl, "GET");
  assert.equal(reloaded.response.status, 200);
  assert.equal(
    ResearchProductWorkflowSnapshotV1Schema.parse(reloaded.body).project.id,
    snapshot.project.id,
  );

  const sourcesResult = await jsonRequest(`${projectUrl}/sources`, "POST", {
    candidates: [
      {
        id: "route-source",
        queryIds: [snapshot.queries[0]!.id],
        provider: "openalex",
        providerId: "W-route-source",
        providerRawRef: "fixture:route-source",
        title: "Traceable multilingual research workflow",
        authors: ["Lin, Mei"],
        year: 2025,
        venue: "Fixture Journal",
        doi: "10.1000/route-source",
        url: "https://example.test/route-source",
        abstract: "A traceable fixture abstract supports a bounded workflow finding.",
        language: "en",
        keywords: ["workflow"],
        sourceType: "journal",
        publisher: "Fixture Publisher",
        citationCount: 1,
        openAccess: true,
        license: "CC-BY-4.0",
        relevance: 0.94,
        authority: 0.9,
      },
    ],
    providerFailures: ["semantic_scholar:fixture_timeout"],
  });
  assert.equal(sourcesResult.response.status, 200);
  snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(sourcesResult.body);
  assert.equal(snapshot.project.status, "SOURCES_FOUND");
  assert.deepEqual(snapshot.diagnostics.providerFailures, [
    "semantic_scholar:fixture_timeout",
  ]);

  const source = snapshot.sources[0]!;
  const document = snapshot.documents[0]!;
  const block = snapshot.parsedBlocks[0]!;
  const evidenceResult = await jsonRequest(`${projectUrl}/evidence`, "POST", {
    evidenceCards: [
      {
        id: "route-evidence",
        sourceId: source.id,
        documentId: document.id,
        blockId: block.id,
        claimText: "明確的工作流程邊界可維持來源追溯。",
        evidenceText: block.text,
        evidenceType: "FINDING",
        researchQuestionIds: [snapshot.questions[0]!.id],
        sectionHints: [],
        page: null,
        sourceStartOffset: block.startOffset,
        sourceEndOffset: block.endOffset,
        confidence: 0.91,
        qualityNotes: ["fixture_trace_verified"],
        limitations: ["FIXTURE evidence does not prove live provider behavior."],
        createdBy: "import",
        extractorVersion: "fixture.v1",
      },
    ],
  });
  assert.equal(evidenceResult.response.status, 200);
  snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(evidenceResult.body);
  assert.equal(snapshot.project.status, "EVIDENCE_REVIEW_REQUIRED");

  const reviewResult = await jsonRequest(
    `${projectUrl}/evidence-decisions`,
    "POST",
    {
      decisions: [
        {
          evidenceCardId: "route-evidence",
          decision: "accepted",
          reason: "human confirmed source context",
          tags: ["route-golden"],
        },
      ],
    },
  );
  assert.equal(reviewResult.response.status, 200);
  snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(reviewResult.body);
  assert.deepEqual(snapshot.acceptedEvidenceSet!.evidenceCardIds, ["route-evidence"]);

  const planResult = await jsonRequest(`${projectUrl}/report-plan`, "PUT", {});
  assert.equal(planResult.response.status, 200);
  snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(planResult.body);
  assert.equal(snapshot.project.status, "PLAN_READY");
  assert.ok(snapshot.reportPlan!.sections.some((section) => section.status === "ready"));

  const generateResult = await jsonRequest(
    `${projectUrl}/generation-runs`,
    "POST",
  );
  assert.equal(generateResult.response.status, 200);
  snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(generateResult.body);
  assert.equal(snapshot.project.status, "VERIFYING");
  assert.equal(snapshot.generatedClaims.length, 1);
  assert.equal(snapshot.citationBindings.length, 1);

  const verificationResult = await jsonRequest(
    `${projectUrl}/verifications`,
    "POST",
  );
  assert.equal(verificationResult.response.status, 200);
  snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(verificationResult.body);
  assert.equal(snapshot.project.status, "READY");
  assert.deepEqual(
    snapshot.verificationResults.map((result) => result.status),
    ["SUPPORTED"],
  );

  const exportResult = await jsonRequest(`${projectUrl}/exports`, "POST", {
    format: "json_bundle",
  });
  assert.equal(exportResult.response.status, 200);
  const exported = ResearchProductExportResponseSchema.parse(exportResult.body);
  assert.equal(exported.artifact.reportStatus, "verified");
  assert.equal(
    ResearchProductWorkflowSnapshotV1Schema.parse(JSON.parse(exported.content)).project.id,
    snapshot.project.id,
  );

  const finalReload = await jsonRequest(projectUrl, "GET");
  const persisted = ResearchProductWorkflowSnapshotV1Schema.parse(finalReload.body);
  assert.equal(persisted.project.status, "COMPLETE");
  assert.equal(persisted.exports.length, 1);
});

test("HTTP boundary rejects schema-invalid input and LIVE replay relabeling", async (t) => {
  const server = await listen();
  t.after(() => server.close());

  const invalid = await jsonRequest(
    `${server.baseUrl}/research-product/projects`,
    "POST",
    { topic: "" },
  );
  assert.equal(invalid.response.status, 400);
  assert.deepEqual(invalid.body, {
    code: "INVALID_RESEARCH_PRODUCT_REQUEST",
    message: "Research product workflow request failed schema validation.",
  });

  const created = await jsonRequest(
    `${server.baseUrl}/research-product/projects`,
    "POST",
    { topic: "Live label boundary", mode: "LIVE" },
  );
  const snapshot = ResearchProductWorkflowSnapshotV1Schema.parse(created.body);
  const replay = await jsonRequest(
    `${server.baseUrl}/research-product/projects/${snapshot.project.id}/replay-bundle`,
    "PUT",
    snapshot,
  );
  assert.equal(replay.response.status, 400);
  assert.deepEqual(replay.body, {
    code: "INVALID_TRANSITION",
    message: "A LIVE bundle cannot be silently imported as replay evidence.",
  });
});
