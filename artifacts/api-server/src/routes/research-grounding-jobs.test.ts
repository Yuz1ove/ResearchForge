import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  GroundingJobErrorResponseSchema,
  GroundingJobSchema,
  ResearchGroundingJobCreateResponseSchema,
} from "@workspace/api-zod/research-grounding";
import { topicHashForWorkflow } from "../services/research/workflow/workflowIds";
import { InMemoryGroundingJobRepository } from "../services/research/grounding/groundingJobRepository";
import { createResearchGroundingJobsRouter } from "./research-grounding-jobs";
import { reviewAcademicSafety } from "../services/research/grounding/researchGroundingPipeline";

function appFor(repository: InMemoryGroundingJobRepository, shouldFail = false) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createResearchGroundingJobsRouter({
      repository,
      runDependencies: {
        runPipeline: async (input) => {
          if (shouldFail) throw new Error("pipeline fixture failure");
          const now = new Date().toISOString();
          const normalizedTopic = input.normalizedTopic ?? input.topic;
          return {
            jobId: "pipeline-job-id",
            workflowId: input.workflowId,
            topicHash: topicHashForWorkflow(normalizedTopic),
            originalTopic: input.originalTopic ?? input.topic,
            normalizedTopic,
            status: "completed",
            progress: 100,
            warnings: [],
            createdAt: now,
            updatedAt: now,
          };
        },
      },
    }),
  );
  return app;
}

async function listen(app: express.Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.close();
      server.closeAllConnections?.();
      server.unref();
    },
  };
}

test("POST persists a schema-valid job that a second app instance can poll", async (t) => {
  const repository = new InMemoryGroundingJobRepository();
  const first = await listen(appFor(repository));
  const second = await listen(appFor(repository));
  t.after(async () => {
    await first.close();
    await second.close();
  });

  const response = await fetch(`${first.baseUrl}/api/research-grounding-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workflowId: "wf-cross-instance",
      requestId: "request-cross-instance",
      attemptId: "attempt-cross-instance",
      topic: "魚油的製作及其營養成分",
      normalizedTopic: "魚油的製作及其營養成分",
      searchProfile: "standard",
    }),
  });
  assert.equal(response.status, 200);
  const created = ResearchGroundingJobCreateResponseSchema.parse(await response.json());
  assert.equal(created.status, "completed");
  assert.equal(created.requestId, "request-cross-instance");

  const pollingResponse = await fetch(
    `${second.baseUrl}/api/research-grounding-jobs/${created.jobId}`,
  );
  assert.equal(pollingResponse.status, 200);
  const job = GroundingJobSchema.parse(await pollingResponse.json());
  assert.equal(job.status, "completed");
  assert.equal(job.workflowId, "wf-cross-instance");
  assert.ok(job.revision >= 2);
});

test("route classifies invalid input and a terminal pipeline failure", async (t) => {
  const repository = new InMemoryGroundingJobRepository();
  const app = await listen(appFor(repository, true));
  t.after(() => app.close());

  const invalid = await fetch(`${app.baseUrl}/api/research-grounding-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "魚油" }),
  });
  assert.equal(invalid.status, 400);
  assert.equal(
    GroundingJobErrorResponseSchema.parse(await invalid.json()).code,
    "INVALID_GROUNDING_REQUEST",
  );

  const failed = await fetch(`${app.baseUrl}/api/research-grounding-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workflowId: "wf-pipeline-failed",
      topic: "魚油的製作及其營養成分",
    }),
  });
  assert.equal(failed.status, 200);
  const created = ResearchGroundingJobCreateResponseSchema.parse(await failed.json());
  assert.equal(created.status, "failed");

  const stored = await fetch(`${app.baseUrl}/api/research-grounding-jobs/${created.jobId}`);
  assert.equal(stored.status, 200);
  const job = GroundingJobSchema.parse(await stored.json());
  assert.equal(job.status, "failed");
  assert.match(job.warnings[0] ?? "", /GROUNDING_PIPELINE_FAILED/);
});

test("source decisions persist in the job and are visible from a second app instance", async (t) => {
  const repository = new InMemoryGroundingJobRepository();
  const first = await listen(appFor(repository));
  const second = await listen(appFor(repository));
  t.after(async () => {
    await first.close();
    await second.close();
  });

  const now = "2026-08-03T00:00:00.000Z";
  const workflowId = "wf-source-decisions";
  const topicHash = "topic-source-decisions";
  const candidate = (sourceId: string) => ({
    sourceId,
    workflowId,
    topicHash,
    queryUsed: "繁體中文研究主題",
    queryIntent: "exact",
    provider: "openalex" as const,
    title: `來源 ${sourceId}`,
    authors: ["ResearchForge Fixture"],
    year: 2026,
    doi: `10.1000/${sourceId}`,
    url: `https://doi.org/10.1000/${sourceId}`,
    abstractOriginal: `來源 ${sourceId} 的可引用摘要內容。`,
    sourceType: "paper" as const,
    relevanceScore: 0.9,
    sourceQualityScore: 0.9,
    retrievalMode: "live_provider" as const,
    recommendationBucket: "manual_review" as const,
    sourceRole: "core_scholarly_evidence" as const,
    reviewStatus: "review" as const,
    evidencePoints: ["可引用重點"],
    limitations: [],
    usableSections: ["literature_review"],
    citationMarker: `[${sourceId}]`,
    dedupeKey: sourceId,
    createdAt: now,
    retrievedAt: now,
  });
  await repository.create(GroundingJobSchema.parse({
    jobId: "job-source-decisions",
    workflowId,
    topicHash,
    requestId: "request-source-decisions",
    attemptId: "attempt-source-decisions",
    revision: 1,
    originalTopic: "繁體中文研究主題",
    normalizedTopic: "繁體中文研究主題",
    status: "source_review_ready",
    progress: 100,
    candidateSources: [candidate("source-a"), candidate("source-b")],
    warnings: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: "2026-08-10T00:00:00.000Z",
  }));

  const persisted = await fetch(
    `${first.baseUrl}/api/research-grounding-jobs/job-source-decisions/source-decisions`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId,
        topicHash,
        expectedRevision: 1,
        decisions: [
          { sourceId: "source-a", decision: "accepted" },
          { sourceId: "source-b", decision: "rejected" },
        ],
      }),
    },
  );
  assert.equal(persisted.status, 200);

  const reloaded = await fetch(
    `${second.baseUrl}/api/research-grounding-jobs/job-source-decisions`,
  );
  assert.equal(reloaded.status, 200);
  const job = GroundingJobSchema.parse(await reloaded.json());
  assert.deepEqual(
    job.sourceDecisions?.map((decision) => [decision.sourceId, decision.decision]),
    [
      ["source-a", "accepted"],
      ["source-b", "rejected"],
    ],
  );
  assert.deepEqual(
    job.candidateSources?.map((item) => [item.sourceId, item.reviewStatus]),
    [
      ["source-a", "accepted"],
      ["source-b", "rejected"],
    ],
  );
});

test("source decisions work when canonical candidates are review-only fallbacks", async (t) => {
  const repository = new InMemoryGroundingJobRepository();
  const app = await listen(appFor(repository));
  t.after(() => app.close());

  const now = "2026-08-03T00:00:00.000Z";
  const workflowId = "wf-fallback-decisions";
  const topicHash = "topic-fallback-decisions";
  const fallbackCandidate = {
    sourceId: "fallback-source",
    workflowId,
    topicHash,
    queryUsed: "lutein macular pigment",
    queryIntent: "exact",
    provider: "web" as const,
    title: "The Macular Carotenoids: A Biochemical Overview",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7347445/",
    abstractOriginal:
      "本回顧整理葉黃素（lutein）、玉米黃素與黃斑色素的生化作用及視網膜相關機制。",
    sourceType: "official" as const,
    relevanceScore: 0.6,
    sourceQualityScore: 0.7,
    retrievalMode: "live_provider" as const,
    recommendationBucket: "official_background" as const,
    sourceRole: "official_background_explanation" as const,
    reviewStatus: "review" as const,
    evidencePoints: ["Lutein is discussed as a macular carotenoid."],
    limitations: ["background only"],
    usableSections: ["background"],
    citationMarker: "[fallback-source]",
    dedupeKey: "fallback-source",
    createdAt: now,
    retrievedAt: now,
  };
  await repository.create(GroundingJobSchema.parse({
    jobId: "job-fallback-decisions",
    workflowId,
    topicHash,
    requestId: "request-fallback-decisions",
    attemptId: "attempt-fallback-decisions",
    revision: 1,
    originalTopic: "葉黃素的作用機制與臨床應用",
    normalizedTopic: "葉黃素的作用機制與臨床應用",
    academicSafetyReview: reviewAcademicSafety({
      topic: "葉黃素的作用機制與臨床應用",
    }),
    status: "source_review_needs_manual",
    progress: 100,
    candidateSources: [],
    sourceCandidates: [fallbackCandidate],
    fallbackReviewSources: [fallbackCandidate],
    warnings: [],
    createdAt: now,
    updatedAt: now,
    expiresAt: "2026-08-10T00:00:00.000Z",
  }));

  const response = await fetch(
    `${app.baseUrl}/api/research-grounding-jobs/job-fallback-decisions/source-decisions`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId,
        topicHash,
        expectedRevision: 1,
        decisions: [{ sourceId: "fallback-source", decision: "accepted" }],
      }),
    },
  );
  assert.equal(response.status, 200);
  const job = GroundingJobSchema.parse(await response.json());
  assert.equal(job.sourceDecisions?.[0]?.decision, "accepted");
  assert.equal(job.sourceCandidates?.[0]?.reviewStatus, "accepted");
  assert.equal(job.fallbackReviewSources?.[0]?.reviewStatus, "accepted");
  assert.equal(job.evidenceCards?.length, 1);
  assert.equal(job.evidenceCards?.[0]?.source_access_level, "abstract_only");
  assert.equal(job.evidenceCards?.[0]?.sourceId, "fallback-source");
});
