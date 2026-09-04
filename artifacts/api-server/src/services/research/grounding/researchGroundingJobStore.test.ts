import assert from "node:assert/strict";
import test from "node:test";
import {
  createGroundingJob,
  GroundingJobInterruptedError,
  groundingJobRunIsActive,
  groundingJobRunIsQueued,
  readGroundingJob,
  runGroundingJob,
  startGroundingJobInBackground,
} from "./researchGroundingJobStore";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
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

function sourceCandidate(sourceId: string, canonicalSourceIdentity: string): SourceCandidate {
  const timestamp = new Date().toISOString();
  return {
    sourceId,
    workflowId: "wf-idempotency",
    topicHash: "topic-idempotency",
    queryUsed: "sleep academic performance",
    queryIntent: "direct empirical study",
    provider: "openalex",
    title: `Study ${sourceId}`,
    relevanceScore: 0.9,
    sourceQualityScore: 0.9,
    retrievalMode: "live_provider",
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    formalEvidenceRole: "DIRECT_FINDING",
    reviewStatus: "accepted",
    evidencePoints: [],
    limitations: [],
    usableSections: ["findings"],
    citationMarker: "〔1〕",
    dedupeKey: canonicalSourceIdentity,
    canonicalSourceIdentity,
    createdAt: timestamp,
    retrievedAt: timestamp,
  };
}

test("process interruption resumes from the persisted search checkpoint without provider search", async () => {
  const repository = new InMemoryGroundingJobRepository();
  const input = {
    workflowId: "wf-resume-test",
    topic: "睡眠不足與青少年學業表現之間的關聯",
  };
  const created = await createGroundingJob(input, { repository });
  const interrupted = await runGroundingJob(input, created, {
    repository,
    dependencies: {
      runPipeline: async (_input, dependencies) => {
        await dependencies.onProgress?.({
          status: "resolving_full_text",
          progress: 90,
          patch: {
            searchCheckpoint: { checkpoint: "provider-search-complete" },
            sourceCandidates: [],
            acceptedSources: [],
          },
        });
        throw new GroundingJobInterruptedError("simulated process interruption");
      },
    },
  });
  assert.equal(interrupted.acquisition?.terminalStatus, null);
  assert.equal(interrupted.acquisition?.currentStage, "RESOLVING_FULL_TEXT");
  assert.equal(interrupted.acquisition?.searchCheckpointAvailable, true);
  assert.equal(interrupted.acquisition?.terminalManifest, null);

  let providerSearchCalls = 0;
  const resumed = await runGroundingJob(input, interrupted, {
    repository,
    dependencies: {
      searchHandler: async () => {
        providerSearchCalls += 1;
        throw new Error("provider search must not run during checkpoint resume");
      },
      runPipeline: async (_input, dependencies) => {
        const checkpoint = await dependencies.searchHandler({} as never) as unknown as {
          checkpoint: string;
        };
        assert.equal(checkpoint.checkpoint, "provider-search-complete");
        const now = new Date().toISOString();
        return {
          jobId: "ignored",
          workflowId: input.workflowId,
          topicHash: interrupted.topicHash,
          originalTopic: input.topic,
          normalizedTopic: input.topic,
          status: "completed",
          progress: 100,
          sourceCandidates: [],
          acceptedSources: [],
          warnings: [],
          createdAt: now,
          updatedAt: now,
        };
      },
    },
  });
  assert.equal(providerSearchCalls, 0);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.acquisition?.resumedFromCheckpoint, true);
  assert.equal(resumed.acquisition?.runAttemptCount, 2);
  assert.equal(resumed.acquisition?.terminalStatus, "COMPLETE");
  assert.equal(resumed.acquisition?.terminalManifest?.candidateCount, 0);
  assert.equal(resumed.acquisition?.terminalManifest?.unknownIncompleteCount, 0);
});

test("canonical artifacts remain idempotent across duplicate pipeline output and repeated resume", async () => {
  const repository = new InMemoryGroundingJobRepository();
  const input = { workflowId: "wf-idempotency", topic: "睡眠與學業表現" };
  const created = await createGroundingJob(input, { repository });
  const canonical = sourceCandidate("source-a", "doi:10.1234/same-study");
  const duplicate = sourceCandidate("source-b", "doi:10.1234/same-study");
  const completed = await runGroundingJob(input, created, {
    repository,
    dependencies: {
      runPipeline: async () => {
        const now = new Date().toISOString();
        return {
          jobId: "ignored",
          workflowId: input.workflowId,
          topicHash: created.topicHash,
          originalTopic: input.topic,
          normalizedTopic: input.topic,
          status: "completed",
          progress: 100,
          sourceCandidates: [canonical, duplicate],
          acceptedSources: [canonical, duplicate],
          warnings: [],
          createdAt: now,
          updatedAt: now,
        };
      },
    },
  });
  assert.equal(completed.sourceCandidates?.length, 1);
  assert.equal(completed.acceptedSources?.length, 1);

  const repeated = await runGroundingJob(input, completed, { repository });
  assert.equal(repeated.revision, completed.revision);
  assert.equal(repeated.sourceCandidates?.length, 1);
  assert.equal(repeated.acceptedSources?.length, 1);
});

test("background queue enforces the configured global concurrency limit", async (t) => {
  const previousLimit = process.env.GROUNDING_JOB_MAX_CONCURRENCY;
  process.env.GROUNDING_JOB_MAX_CONCURRENCY = "1";
  const releases = new Map<string, () => void>();
  t.after(() => {
    if (previousLimit === undefined) delete process.env.GROUNDING_JOB_MAX_CONCURRENCY;
    else process.env.GROUNDING_JOB_MAX_CONCURRENCY = previousLimit;
    for (const release of releases.values()) release();
  });
  const repository = new InMemoryGroundingJobRepository();
  const inputs = ["one", "two", "three"].map((suffix) => ({
    workflowId: `wf-queue-${suffix}`,
    topic: `queue pressure study ${suffix}`,
  }));
  const jobs = await Promise.all(inputs.map((input) => createGroundingJob(input, { repository })));
  let active = 0;
  let maximumActive = 0;
  const started: string[] = [];
  const dependencies = {
    runPipeline: async (input: (typeof inputs)[number]) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      started.push(input.workflowId);
      await new Promise<void>((resolve) => { releases.set(input.workflowId, resolve); });
      active -= 1;
      const now = new Date().toISOString();
      const matchingJob = jobs.find((job) => job.workflowId === input.workflowId)!;
      return {
        jobId: "ignored",
        workflowId: input.workflowId,
        topicHash: matchingJob.topicHash,
        originalTopic: input.topic,
        normalizedTopic: input.topic,
        status: "completed" as const,
        progress: 100,
        warnings: [],
        createdAt: now,
        updatedAt: now,
      };
    },
  };
  for (let index = 0; index < jobs.length; index += 1) {
    assert.equal(startGroundingJobInBackground(inputs[index]!, jobs[index]!, {
      repository,
      dependencies,
    }), true);
  }
  while (started.length < 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(started.length, 1);
  assert.equal(groundingJobRunIsActive(jobs[0]!.jobId), true);
  assert.equal(groundingJobRunIsQueued(jobs[1]!.jobId), true);
  assert.equal(groundingJobRunIsQueued(jobs[2]!.jobId), true);

  for (let index = 0; index < jobs.length; index += 1) {
    const workflowId = inputs[index]!.workflowId;
    while (!releases.has(workflowId)) await new Promise((resolve) => setTimeout(resolve, 5));
    releases.get(workflowId)!();
    while ((await repository.get(jobs[index]!.jobId))?.acquisition?.terminalStatus !== "COMPLETE") {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  assert.deepEqual(started, inputs.map((input) => input.workflowId));
  assert.equal(maximumActive, 1);
});
