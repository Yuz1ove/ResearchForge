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
  assert.equal(response.status, 202);
  const created = ResearchGroundingJobCreateResponseSchema.parse(await response.json());
  assert.equal(created.status, "queued");
  assert.equal(created.requestId, "request-cross-instance");

  const pollingResponse = await fetch(
    `${second.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=1000`,
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
  assert.equal(failed.status, 202);
  const created = ResearchGroundingJobCreateResponseSchema.parse(await failed.json());
  assert.equal(created.status, "queued");

  const stored = await fetch(`${app.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=1000`);
  assert.equal(stored.status, 200);
  const job = GroundingJobSchema.parse(await stored.json());
  assert.equal(job.status, "failed");
  assert.match(job.warnings[0] ?? "", /GROUNDING_PIPELINE_FAILED/);
});

test("client wait expiry is non-terminal and the server job continues", async (t) => {
  const repository = new InMemoryGroundingJobRepository();
  let releasePipeline: (() => void) | undefined;
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createResearchGroundingJobsRouter({
      repository,
      runDependencies: {
        runPipeline: async (input) => {
          await new Promise<void>((resolve) => {
            releasePipeline = resolve;
          });
          const now = new Date().toISOString();
          return {
            jobId: "ignored",
            workflowId: input.workflowId,
            topicHash: topicHashForWorkflow(input.topic),
            originalTopic: input.topic,
            normalizedTopic: input.topic,
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
  const server = await listen(app);
  t.after(() => server.close());

  const createdResponse = await fetch(`${server.baseUrl}/api/research-grounding-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: "wf-wait-expiry", topic: "睡眠與學業表現" }),
  });
  const created = ResearchGroundingJobCreateResponseSchema.parse(await createdResponse.json());
  const expiredResponse = await fetch(
    `${server.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=10`,
  );
  assert.equal(expiredResponse.status, 202);
  const expired = GroundingJobSchema.parse(await expiredResponse.json());
  assert.equal(expired.clientWait?.status, "CLIENT_WAIT_EXPIRED");
  assert.equal(expired.acquisition?.terminalStatus, null);
  assert.notEqual(expired.status, "failed");

  releasePipeline?.();
  const terminalResponse = await fetch(
    `${server.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=1000`,
  );
  assert.equal(terminalResponse.status, 200);
  const terminal = GroundingJobSchema.parse(await terminalResponse.json());
  assert.equal(terminal.status, "completed");
  assert.equal(terminal.clientWait?.status, "JOB_TERMINAL");
});

test("client disconnect while polling does not cancel the durable server job", async (t) => {
  const repository = new InMemoryGroundingJobRepository();
  let releasePipeline: (() => void) | undefined;
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    createResearchGroundingJobsRouter({
      repository,
      runDependencies: {
        runPipeline: async (input) => {
          await new Promise<void>((resolve) => { releasePipeline = resolve; });
          const now = new Date().toISOString();
          return {
            jobId: "ignored",
            workflowId: input.workflowId,
            topicHash: topicHashForWorkflow(input.topic),
            originalTopic: input.topic,
            normalizedTopic: input.topic,
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
  const server = await listen(app);
  t.after(() => server.close());

  const createdResponse = await fetch(`${server.baseUrl}/api/research-grounding-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: "wf-client-disconnect", topic: "睡眠與學業表現" }),
  });
  const created = ResearchGroundingJobCreateResponseSchema.parse(await createdResponse.json());
  const controller = new AbortController();
  const waiting = fetch(
    `${server.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=30000`,
    { signal: controller.signal },
  );
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await assert.rejects(waiting, /abort/iu);

  const stillRunning = await repository.get(created.jobId);
  assert.equal(stillRunning?.acquisition?.terminalStatus, null);
  assert.notEqual(stillRunning?.status, "failed");
  releasePipeline?.();

  const terminalResponse = await fetch(
    `${server.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=1000`,
  );
  const terminal = GroundingJobSchema.parse(await terminalResponse.json());
  assert.equal(terminal.acquisition?.terminalStatus, "COMPLETE");
  assert.equal(terminal.acquisition?.terminalManifest?.candidateCount, 0);
  assert.equal(terminal.acquisition?.terminalManifest?.unknownIncompleteCount, 0);
});

test("long polling reads a lightweight revision instead of cloning the full job in a tight loop", async (t) => {
  class CountingRepository extends InMemoryGroundingJobRepository {
    fullReads = 0;
    revisionReads = 0;

    override async get(jobId: string) {
      this.fullReads += 1;
      return super.get(jobId);
    }

    override async getRevision(jobId: string) {
      this.revisionReads += 1;
      return super.getRevision(jobId);
    }
  }
  const repository = new CountingRepository();
  let releasePipeline: (() => void) | undefined;
  const app = express();
  app.use(express.json());
  app.use("/api", createResearchGroundingJobsRouter({
    repository,
    runDependencies: {
      runPipeline: async (input) => {
        await new Promise<void>((resolve) => { releasePipeline = resolve; });
        const now = new Date().toISOString();
        return {
          jobId: "ignored",
          workflowId: input.workflowId,
          topicHash: topicHashForWorkflow(input.topic),
          originalTopic: input.topic,
          normalizedTopic: input.topic,
          status: "completed",
          progress: 100,
          warnings: [],
          createdAt: now,
          updatedAt: now,
        };
      },
    },
  }));
  const server = await listen(app);
  t.after(async () => {
    releasePipeline?.();
    await server.close();
  });
  const createdResponse = await fetch(`${server.baseUrl}/api/research-grounding-jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workflowId: "wf-revision-poll", topic: "large durable job payload" }),
  });
  const created = ResearchGroundingJobCreateResponseSchema.parse(await createdResponse.json());
  await new Promise((resolve) => setTimeout(resolve, 20));
  repository.fullReads = 0;
  repository.revisionReads = 0;

  const polled = await fetch(
    `${server.baseUrl}/api/research-grounding-jobs/${created.jobId}?waitMs=1000`,
  );
  assert.equal(polled.status, 202);
  assert.equal(GroundingJobSchema.parse(await polled.json()).clientWait?.status, "CLIENT_WAIT_EXPIRED");
  assert.ok(repository.revisionReads >= 3);
  assert.ok(repository.fullReads <= 3, `unexpected full payload reads: ${repository.fullReads}`);
  assert.ok(repository.revisionReads > repository.fullReads);
});
