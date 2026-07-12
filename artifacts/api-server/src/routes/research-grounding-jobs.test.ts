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
