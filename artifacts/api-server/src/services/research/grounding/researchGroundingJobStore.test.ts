import assert from "node:assert/strict";
import test from "node:test";
import {
  createGroundingJob,
  readGroundingJob,
  runGroundingJob,
} from "./researchGroundingJobStore";
import {
  GroundingJobRevisionConflictError,
  GroundingStoreNotConfiguredError,
  InMemoryGroundingJobRepository,
  createGroundingJobRepository,
} from "./groundingJobRepository";

test("durable repository job reaches a terminal result without a detached microtask", async () => {
  const repository = new InMemoryGroundingJobRepository();
  const created = await createGroundingJob(
    {
      workflowId: "wf-store-test",
      topic: "咖啡因對心率變化的影響",
    },
    {
      repository,
      requestId: "request-store-test",
      attemptId: "attempt-store-test",
    },
  );

  const completed = await runGroundingJob(
    {
      workflowId: created.workflowId,
      topic: created.originalTopic,
    },
    created,
    {
      repository,
      dependencies: {
        runPipeline: async (_input, dependencies) => {
          await dependencies.onProgress?.({ status: "searching_sources", progress: 35 });
          return {
            ...created,
            jobId: "pipeline-owned-id-is-ignored",
            status: "completed",
            progress: 100,
            warnings: [],
          };
        },
      },
    },
  );

  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);
  assert.equal(completed.requestId, "request-store-test");
  assert.equal(completed.attemptId, "attempt-store-test");
  assert.ok(completed.revision > created.revision);
  assert.equal((await readGroundingJob(created.jobId, repository))?.status, "completed");
});

test("stale writes cannot replace a newer terminal job", async () => {
  const repository = new InMemoryGroundingJobRepository();
  const created = await createGroundingJob(
    { workflowId: "wf-revision-test", topic: "魚油的製作及其營養成分" },
    { repository, requestId: "request-revision", attemptId: "attempt-revision" },
  );
  const terminal = await repository.patch(
    created.jobId,
    { status: "completed", progress: 100 },
    { expectedRevision: created.revision },
  );

  await assert.rejects(
    repository.patch(
      created.jobId,
      { status: "searching", progress: 20 },
      { expectedRevision: created.revision },
    ),
    GroundingJobRevisionConflictError,
  );
  const noRegression = await repository.patch(
    created.jobId,
    { status: "searching", progress: 20 },
    { expectedRevision: terminal.revision },
  );
  assert.equal(noRegression.status, "completed");
  assert.equal(noRegression.progress, 100);
});

test("Vercel runtime rejects missing durable storage instead of falling back to memory", () => {
  assert.throws(
    () =>
      createGroundingJobRepository({
        env: { VERCEL: "1", NODE_ENV: "production" } as NodeJS.ProcessEnv,
      }),
    GroundingStoreNotConfiguredError,
  );
});
