import { randomUUID } from "node:crypto";
import type {
  GroundingJob,
  ResearchGroundingJobCreateRequest,
} from "@workspace/api-zod/research-grounding";
import {
  resolveSourceSearchProfile,
  searchIntentSources,
} from "../../search-intent-planner";
import { getSourceProviderConfigs } from "../../source-provider-config";
import { logger } from "../../../lib/logger";
import {
  runResearchGroundingPipeline,
  type GroundingPipelineDependencies,
  type GroundingPipelineResult,
} from "./researchGroundingPipeline";
import { topicHashForWorkflow } from "../workflow/workflowIds";
import {
  createGroundingJobTimestamps,
  defaultGroundingJobRepository,
  patchGroundingJobWithRetry,
  type GroundingJobRepository,
} from "./groundingJobRepository";

export type GroundingJobRunDependencies = Partial<GroundingPipelineDependencies> & {
  runPipeline?: typeof runResearchGroundingPipeline;
};

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unexpected grounding pipeline failure";
  return message
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function providerErrorCode(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/timeout|timed out/i.test(message)) return "PROVIDER_TIMEOUT";
  if (/parse|json|schema/i.test(message)) return "PROVIDER_PARSE_ERROR";
  if (/http\s+\d{3}|rate.limit|server error/i.test(message)) {
    return "PROVIDER_HTTP_ERROR";
  }
  return "ALL_PROVIDERS_FAILED";
}

function logGroundingEvent(input: {
  requestId: string;
  workflowId: string;
  jobId: string;
  topicHash: string;
  stage: string;
  status: GroundingJob["status"];
  durationMs?: number;
  resultCount?: number;
  retryable?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}): void {
  logger.info(
    {
      event: "research_grounding.job",
      route: "/api/research-grounding-jobs",
      ...input,
      durationMs: input.durationMs ?? null,
      resultCount: input.resultCount ?? null,
      retryable: input.retryable ?? false,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ? safeErrorMessage(input.errorMessage) : null,
    },
    "Research grounding job state persisted",
  );
}

function defaultSearchHandler(
  input: ResearchGroundingJobCreateRequest,
  job: GroundingJob,
): GroundingPipelineDependencies["searchHandler"] {
  return (searchInput) => {
    const activeProfile = resolveSourceSearchProfile(
      searchInput.searchProfile ?? input.searchProfile,
    );
    return searchIntentSources(searchInput, {
      queryLimit: activeProfile.maxQueries,
      runtimeBudget: {
        overallSearchBudgetMs: activeProfile.overallTimeoutMs,
        perQueryTimeoutMs: activeProfile.providerTimeoutMs,
        maxConcurrentProviderRequests: 3,
      },
      sourceSummaries: {
        maxSources: activeProfile.name === "deep" ? activeProfile.maxCandidates : 0,
      },
      sourceSearch: {
        providers:
          activeProfile.name === "deep"
            ? ["OpenAlex", "Crossref", "Semantic Scholar"]
            : ["OpenAlex", "Crossref"],
        providerConfigs: getSourceProviderConfigs(),
        telemetry: {
          requestId: job.requestId,
          workflowId: job.workflowId,
          jobId: job.jobId,
          topicHash: job.topicHash,
        },
      },
    });
  };
}

export async function createGroundingJob(
  input: ResearchGroundingJobCreateRequest,
  options: {
    repository?: GroundingJobRepository;
    requestId?: string;
    attemptId?: string;
  } = {},
): Promise<GroundingJob> {
  const repository = options.repository ?? defaultGroundingJobRepository();
  const { createdAt, expiresAt } = createGroundingJobTimestamps();
  const effectiveTopic = (input.normalizedTopic ?? input.topic).trim();
  const requestId = options.requestId ?? input.requestId ?? randomUUID();
  const attemptId = options.attemptId ?? input.attemptId ?? randomUUID();
  const job: GroundingJob = {
    jobId: randomUUID(),
    workflowId: input.workflowId,
    topicHash: topicHashForWorkflow(effectiveTopic),
    requestId,
    attemptId,
    revision: 1,
    originalTopic: (input.originalTopic ?? input.rawUserTopic ?? input.topic).trim(),
    normalizedTopic: effectiveTopic,
    status: "queued",
    progress: 0,
    warnings: [],
    createdAt,
    updatedAt: createdAt,
    expiresAt,
  };
  const persisted = await repository.create(job);
  logGroundingEvent({
    requestId,
    workflowId: persisted.workflowId,
    jobId: persisted.jobId,
    topicHash: persisted.topicHash,
    stage: "creation",
    status: persisted.status,
  });
  return persisted;
}

export async function readGroundingJob(
  jobId: string,
  repository: GroundingJobRepository = defaultGroundingJobRepository(),
): Promise<GroundingJob | null> {
  return repository.get(jobId);
}

function resultPatch(result: GroundingPipelineResult): Partial<GroundingJob> {
  const {
    jobId: _jobId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...patch
  } = result;
  return patch;
}

export async function runGroundingJob(
  input: ResearchGroundingJobCreateRequest,
  job: GroundingJob,
  options: {
    repository?: GroundingJobRepository;
    dependencies?: GroundingJobRunDependencies;
  } = {},
): Promise<GroundingJob> {
  const repository = options.repository ?? defaultGroundingJobRepository();
  const startedAt = Date.now();
  let currentJob = job;
  const persist = async (patch: Partial<GroundingJob>, stage: string) => {
    currentJob = await patchGroundingJobWithRetry(repository, currentJob.jobId, patch);
    logGroundingEvent({
      requestId: currentJob.requestId,
      workflowId: currentJob.workflowId,
      jobId: currentJob.jobId,
      topicHash: currentJob.topicHash,
      stage,
      status: currentJob.status,
      durationMs: Date.now() - startedAt,
      resultCount: currentJob.sourceCandidates?.length ?? 0,
    });
    return currentJob;
  };

  const dependencies: GroundingPipelineDependencies = {
    searchHandler:
      options.dependencies?.searchHandler ?? defaultSearchHandler(input, currentJob),
    lexiconAdapters: options.dependencies?.lexiconAdapters,
    onProgress: async (update) => {
      await persist(
        {
          ...(update.patch ?? {}),
          status: update.status,
          progress: update.progress,
        },
        "pipeline_progress",
      );
    },
  };

  try {
    const runPipeline = options.dependencies?.runPipeline ?? runResearchGroundingPipeline;
    const result = await runPipeline(input, dependencies);
    return await persist(resultPatch(result), "pipeline_complete");
  } catch (error) {
    const message = safeErrorMessage(error);
    return persist(
      {
        status: "failed",
        progress: 100,
        warnings: [`GROUNDING_PIPELINE_FAILED: ${message}`],
      },
      "pipeline_failed",
    );
  }
}
