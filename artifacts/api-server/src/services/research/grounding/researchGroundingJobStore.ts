import { randomUUID } from "node:crypto";
import type {
  AcquisitionLifecycle,
  GroundingJob,
  ResearchGroundingJobCreateRequest,
} from "@workspace/api-zod/research-grounding";
import { ResearchGroundingJobCreateRequestSchema } from "@workspace/api-zod/research-grounding";
import type { SearchIntentSourceSearchResult } from "../../search-intent-planner";
import {
  resolveSourceSearchProfile,
  searchIntentSources,
} from "../../search-intent-planner";
import { getSourceProviderConfigs } from "../../source-provider-config";
import { expandSearchKeywords } from "../../keyword-expansion";
import { logger } from "../../../lib/logger";
import {
  runResearchGroundingPipeline,
  type GroundingPipelineDependencies,
  type GroundingPipelineResult,
} from "./researchGroundingPipeline";
import { topicHashForWorkflow } from "../workflow/workflowIds";
import { enrichAcceptedSources } from "./acceptedSourceEnrichment";
import { deriveCanonicalStudyAdmissionsForJob } from "../canonical-study-admission";
import {
  AuthoritativeExecutionBudgetLedger,
  deriveSearchBudgetLimits,
} from "../authoritative-execution-budget";
import {
  createGroundingJobTimestamps,
  claimGroundingJobExecution,
  defaultGroundingJobRepository,
  isGroundingJobTerminal,
  patchGroundingJobWithRetry,
  releaseGroundingJobExecution,
  type GroundingJobRepository,
} from "./groundingJobRepository";
import {
  acquisitionErrorClassification,
  acquisitionStageForGroundingStatus,
  acquisitionTerminalStatusForJob,
  advanceAcquisitionLifecycle,
  beginAcquisitionRun,
  initialAcquisitionLifecycle,
  terminalizeAcquisitionLifecycle,
} from "./researchAcquisitionLifecycle";

export type GroundingJobRunDependencies = Partial<GroundingPipelineDependencies> & {
  runPipeline?: typeof runResearchGroundingPipeline;
  totalJobBudgetMs?: number;
  maxRunAttempts?: number;
};

export class GroundingJobInterruptedError extends Error {
  constructor(message = "Research grounding process interruption") {
    super(message);
    this.name = "GroundingJobInterruptedError";
  }
}

class GroundingJobBudgetExceededError extends Error {
  constructor(budgetMs: number) {
    super(`Research grounding total job budget exceeded after ${budgetMs}ms`);
    this.name = "GroundingJobBudgetExceededError";
  }
}

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
  executionBudget: AuthoritativeExecutionBudgetLedger,
): GroundingPipelineDependencies["searchHandler"] {
  return (searchInput) => {
    const activeProfile = resolveSourceSearchProfile(
      searchInput.searchProfile ?? input.searchProfile,
    );
    return searchIntentSources(searchInput, {
      executionBudget,
      budgetContext: searchInput.executionBudgetContext,
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
        executionBudget,
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

function createJobExecutionBudget(
  input: ResearchGroundingJobCreateRequest,
  job: GroundingJob,
): AuthoritativeExecutionBudgetLedger {
  const profile = resolveSourceSearchProfile(input.searchProfile);
  const limits = deriveSearchBudgetLimits({
    queryBudget: profile.maxQueries,
    providerBudget: profile.name === "deep" ? 3 : 2,
    maxPagesPerProviderQuery: 2,
    maxRetriesPerRequest: 1,
    fallbackLayerBudget: 7,
    resolverBudget: profile.maxCandidates * 7,
    materializationBudget: profile.maxCandidates * 6,
    elapsedTimeBudgetMs: job.acquisition?.totalJobBudgetMs ?? 60_000,
  });
  return new AuthoritativeExecutionBudgetLedger({
    configured: limits,
    effective: limits,
    providerAliases: {
      "Institutional Source": "public_web_search",
      "Official Source": "public_web_search",
      "Authoritative Media": "public_web_search",
    },
  });
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
    requestPayload: { ...input },
    acquisition: initialAcquisitionLifecycle(),
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

export async function readGroundingJobRevision(
  jobId: string,
  repository: GroundingJobRepository = defaultGroundingJobRepository(),
): Promise<number | null> {
  if (repository.getRevision) return repository.getRevision(jobId);
  return (await repository.get(jobId))?.revision ?? null;
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
    leaseOwnerId?: string;
  } = {},
): Promise<GroundingJob> {
  const repository = options.repository ?? defaultGroundingJobRepository();
  const startedAt = Date.now();
  const leaseOwnerId = options.leaseOwnerId ?? `runner-${randomUUID()}`;
  const claimed = await claimGroundingJobExecution(repository, job.jobId, {
    ownerId: leaseOwnerId,
    leaseMs: Math.max(
      60_000,
      Math.min(
        10 * 60_000,
        job.acquisition?.totalJobBudgetMs ?? 60_000,
      ),
    ),
  });
  if (!claimed) return (await repository.get(job.jobId)) ?? job;
  let currentJob = claimed;
  const resumedFromCheckpoint = Boolean(
    currentJob.searchCheckpoint &&
    currentJob.acquisition?.searchCheckpointAvailable,
  );
  currentJob = await patchGroundingJobWithRetry(repository, currentJob.jobId, {
    acquisition: beginAcquisitionRun(
      currentJob.acquisition ?? initialAcquisitionLifecycle(),
      { resumedFromCheckpoint },
    ),
  });

  const uniqueBy = <T>(items: T[] | undefined, key: (item: T) => string): T[] | undefined => {
    if (!items) return undefined;
    const output = new Map<string, T>();
    for (const item of items) output.set(key(item), item);
    return [...output.values()];
  };
  const idempotentPatch = (patch: Partial<GroundingJob>): Partial<GroundingJob> => ({
    ...patch,
    ...(patch.sourceCandidates
      ? { sourceCandidates: uniqueBy(patch.sourceCandidates, (item) => item.canonicalSourceIdentity ?? item.dedupeKey ?? item.sourceId) }
      : {}),
    ...(patch.acceptedSources
      ? { acceptedSources: uniqueBy(patch.acceptedSources, (item) => item.canonicalSourceIdentity ?? item.dedupeKey ?? item.sourceId) }
      : {}),
    ...(patch.claimCandidates
      ? { claimCandidates: uniqueBy(patch.claimCandidates, (item) => item.claimId) }
      : {}),
    ...(patch.evidenceCards
      ? { evidenceCards: uniqueBy(patch.evidenceCards, (item) => item.evidenceId) }
      : {}),
  });
  const persist = async (patch: Partial<GroundingJob>, stage: string) => {
    const normalized = idempotentPatch(patch);
    const status = normalized.status ?? currentJob.status;
    const acquisitionStage = acquisitionStageForGroundingStatus(status);
    const state = { ...currentJob, ...normalized } as GroundingJob;
    const queryCount = state.queryPlan
      ? new Set([
          ...state.queryPlan.primaryQueries,
          ...state.queryPlan.secondaryQueries,
          ...state.queryPlan.bilingualQueries.zh,
          ...state.queryPlan.bilingualQueries.en,
        ]).size
      : 0;
    const providerProgress = state.groundingDiagnostics?.providerProgress ?? [];
    const providerRequestCount = providerProgress.reduce((sum, item) => sum + (item.queryCount ?? 1), 0);
    const resolverRequestCount = (state.sourceCandidates ?? []).reduce(
      (sum, source) => sum + (source.enrichmentProvenance ?? []).reduce(
        (inner, entry) => inner + (entry.resolverRequests?.length ?? 0),
        0,
      ),
      0,
    );
    const stageCounts = (() => {
      if (acquisitionStage === "NORMALIZING") return { inputCount: 1, outputCount: queryCount || null };
      if (acquisitionStage === "SEARCHING") return { inputCount: queryCount || null, outputCount: state.sourceCandidates?.length ?? null };
      if (acquisitionStage === "DEDUPLICATING") return { inputCount: state.sourceCandidates?.length ?? null, outputCount: state.sourceCandidates?.length ?? null };
      if (acquisitionStage === "CLASSIFYING_DIRECT_STUDIES") return { inputCount: state.sourceCandidates?.length ?? null, outputCount: state.acceptedSources?.length ?? null };
      if (["RESOLVING_FULL_TEXT", "PARSING_FULL_TEXT"].includes(acquisitionStage)) return { inputCount: state.acceptedSources?.length ?? null, outputCount: state.acceptedSources?.length ?? null };
      if (acquisitionStage === "EXTRACTING_STUDY_FACTS") return { inputCount: state.acceptedSources?.length ?? null, outputCount: state.claimCandidates?.length ?? null };
      if (acquisitionStage === "BUILDING_EVIDENCE") return { inputCount: state.claimCandidates?.length ?? null, outputCount: state.evidenceCards?.length ?? null };
      return { inputCount: state.evidenceCards?.length ?? null, outputCount: state.reportPlan ? 1 : null };
    })();
    const stageProvider = acquisitionStage === "SEARCHING"
      ? [...new Set(providerProgress.map((item) => item.provider).filter(Boolean))].join(",") || null
      : acquisitionStage === "RESOLVING_FULL_TEXT"
        ? "existing_payload,openalex,crossref,europe_pmc,unpaywall,doi_resolver"
        : acquisitionStage === "PARSING_FULL_TEXT"
          ? "structured_html,grobid,pdfminer,ocr"
          : null;
    const acquisition = normalized.acquisition ?? advanceAcquisitionLifecycle(
      currentJob.acquisition ?? initialAcquisitionLifecycle(),
      {
        stage: acquisitionStage,
        status: "RUNNING",
        provider: stageProvider,
        inputCount: stageCounts.inputCount,
        outputCount: stageCounts.outputCount,
        searchCheckpointAvailable: Boolean(
          normalized.searchCheckpoint ?? currentJob.searchCheckpoint,
        ),
        providerRequestCount,
        resolverRequestCount,
      },
    );
    currentJob = await patchGroundingJobWithRetry(repository, currentJob.jobId, {
      ...normalized,
      acquisition,
      executionLease: acquisition.terminalStatus
        ? undefined
        : {
            ownerId: leaseOwnerId,
            claimedAt:
              currentJob.executionLease?.claimedAt ?? new Date().toISOString(),
            expiresAt: new Date(
              Date.now() +
              Math.max(
                60_000,
                Math.min(10 * 60_000, acquisition.totalJobBudgetMs),
              ),
            ).toISOString(),
          },
    });
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

  const checkpointSearch = currentJob.searchCheckpoint as
    | SearchIntentSourceSearchResult
    | undefined;
  const executionBudget = createJobExecutionBudget(input, currentJob);
  const contentAttemptCounts = new Map<string, number>();
  const contentFetchImpl: typeof fetch = async (fetchInput, fetchInit) => {
    const url = typeof fetchInput === "string" || fetchInput instanceof URL
      ? String(fetchInput)
      : fetchInput.url;
    const priorAttempts = contentAttemptCounts.get(url) ?? 0;
    contentAttemptCounts.set(url, priorAttempts + 1);
    const accept = new Headers(fetchInit?.headers).get("accept") ?? "";
    const operation = /json/iu.test(accept) ? "resolver_request" : "materialization";
    const provider = (() => {
      try { return new URL(url).hostname; } catch { return "unknown_content_provider"; }
    })();
    const budgeted = await executionBudget.execute(
      {
        operation,
        provider,
        requestIdentity: `content:${operation}:${url}:attempt:${priorAttempts + 1}`,
        attemptType: priorAttempts === 0 ? "initial" : "retry",
      },
      () => fetch(fetchInput, fetchInit),
    );
    if (budgeted.status === "BLOCKED_BY_BUDGET") {
      throw new Error(`budget_exhausted:${budgeted.block.reasonCode}`);
    }
    if (budgeted.status === "DEDUPLICATED") {
      throw new Error("budget_deduplicated:REQUEST_DEDUPLICATED");
    }
    if (budgeted.status === "FAILED") throw budgeted.error;
    return budgeted.value;
  };
  const dependencies: GroundingPipelineDependencies = {
    searchHandler:
      checkpointSearch && resumedFromCheckpoint
        ? async () => structuredClone(checkpointSearch)
        : options.dependencies?.searchHandler ?? defaultSearchHandler(input, currentJob, executionBudget),
    keywordExpansionHandler:
      options.dependencies?.keywordExpansionHandler ??
      ((request) => expandSearchKeywords(request)),
    lexiconAdapters: options.dependencies?.lexiconAdapters,
    contentFetchImpl: options.dependencies?.contentFetchImpl ?? contentFetchImpl,
    acceptedSourceEnricher:
      options.dependencies?.acceptedSourceEnricher ??
      ((sources) => enrichAcceptedSources(sources, {
        concurrency: 3,
        timeoutMs: 5_000,
        retryCount: 1,
        executionBudget,
      })),
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
    const totalJobBudgetMs =
      options.dependencies?.totalJobBudgetMs ??
      currentJob.acquisition?.totalJobBudgetMs ??
      initialAcquisitionLifecycle().totalJobBudgetMs;
    let budgetTimer: NodeJS.Timeout | undefined;
    const budget = new Promise<never>((_resolve, reject) => {
      budgetTimer = setTimeout(
        () => reject(new GroundingJobBudgetExceededError(totalJobBudgetMs)),
        totalJobBudgetMs,
      );
      budgetTimer.unref?.();
    });
    let result: GroundingPipelineResult;
    try {
      result = await Promise.race([runPipeline(input, dependencies), budget]);
    } finally {
      if (budgetTimer) clearTimeout(budgetTimer);
    }
    if (
      !checkpointSearch &&
      !options.dependencies?.searchHandler &&
      result.groundingDiagnostics
    ) {
      result = {
        ...result,
        groundingDiagnostics: {
          ...result.groundingDiagnostics,
          budgetAuthority: executionBudget.snapshot(),
        },
      };
    }
    const patch = resultPatch(result);
    const terminalStatus = acquisitionTerminalStatusForJob(
      patch.status ?? currentJob.status,
    );
    const synthesisLifecycle = advanceAcquisitionLifecycle(
      currentJob.acquisition ?? initialAcquisitionLifecycle(),
      {
        stage: "BUILDING_SYNTHESIS_INPUTS",
        status: "RUNNING",
        inputCount: patch.evidenceCards?.length ?? currentJob.evidenceCards?.length ?? null,
        outputCount: patch.reportPlan ?? currentJob.reportPlan ? 1 : 0,
      },
    );
    const terminalJob = {
      ...currentJob,
      ...patch,
      acquisition: synthesisLifecycle,
    } as GroundingJob;
    const finalRevision = currentJob.revision + 1;
    const canonicalStudyAdmissions = deriveCanonicalStudyAdmissionsForJob({
      job: { ...terminalJob, revision: finalRevision },
      terminal: terminalStatus !== "FAILED",
      jobRevision: finalRevision,
      checkpointRevision: currentJob.revision,
      decidedAt: new Date().toISOString(),
    });
    const terminalProjectionJob = {
      ...terminalJob,
      revision: finalRevision,
      canonicalStudyAdmissions,
    } as GroundingJob;
    return await persist(
      {
        ...patch,
        progress: 100,
        executionLease: undefined,
        canonicalStudyAdmissions,
        acquisition: terminalizeAcquisitionLifecycle(
          terminalProjectionJob,
          terminalStatus,
        ),
      },
      "pipeline_complete",
    );
  } catch (error) {
    const message = safeErrorMessage(error);
    const classification = acquisitionErrorClassification(error);
    const maxRunAttempts = Math.max(
      1,
      Math.min(5, options.dependencies?.maxRunAttempts ?? 3),
    );
    const retryableInterruption =
      error instanceof GroundingJobInterruptedError ||
      (classification.retryEligibility === "RETRYABLE" &&
        (currentJob.acquisition?.runAttemptCount ?? 1) < maxRunAttempts);
    if (retryableInterruption) {
      const acquisition = advanceAcquisitionLifecycle(
        currentJob.acquisition ?? initialAcquisitionLifecycle(),
        {
          stage:
            currentJob.acquisition?.currentStage ??
            acquisitionStageForGroundingStatus(currentJob.status),
          status: "PARTIAL",
          errorClass: classification.errorClass,
          retryEligibility: "RETRYABLE",
        },
      );
      const interrupted = await persist(
        {
          acquisition,
          executionLease: undefined,
          warnings: [
            ...currentJob.warnings,
            `GROUNDING_PIPELINE_INTERRUPTED_RETRYABLE: ${message}`,
          ],
        },
        "pipeline_interrupted_retryable",
      );
      await releaseGroundingJobExecution(repository, currentJob.jobId, leaseOwnerId);
      return interrupted;
    }
    const failedJob = {
      ...currentJob,
      status: "failed" as const,
      progress: 100,
      warnings: [
        ...currentJob.warnings,
        `GROUNDING_PIPELINE_FAILED: ${message}`,
      ],
    };
    const failedRevision = currentJob.revision + 1;
    const canonicalStudyAdmissions = deriveCanonicalStudyAdmissionsForJob({
      job: { ...failedJob, revision: failedRevision },
      terminal: false,
      jobRevision: failedRevision,
      checkpointRevision: currentJob.revision,
      decidedAt: new Date().toISOString(),
    });
    const failedProjectionJob = {
      ...failedJob,
      revision: failedRevision,
      canonicalStudyAdmissions,
    } as GroundingJob;
    return persist(
      {
        status: "failed",
        progress: 100,
        executionLease: undefined,
        canonicalStudyAdmissions,
        warnings: failedJob.warnings,
        acquisition: terminalizeAcquisitionLifecycle(failedProjectionJob, "FAILED", {
          errorClass: classification.errorClass,
          retryEligibility: classification.retryEligibility,
        }),
      },
      "pipeline_failed",
    );
  }
}

const activeGroundingRuns = new Map<string, Promise<GroundingJob>>();
const queuedGroundingRuns = new Map<string, {
  input: ResearchGroundingJobCreateRequest;
  job: GroundingJob;
  options: {
    repository?: GroundingJobRepository;
    dependencies?: GroundingJobRunDependencies;
  };
}>();

function maxConcurrentGroundingRuns(): number {
  const configured = Number(process.env.GROUNDING_JOB_MAX_CONCURRENCY);
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(8, Math.floor(configured)));
}

function drainGroundingRunQueue(): void {
  while (
    activeGroundingRuns.size < maxConcurrentGroundingRuns() &&
    queuedGroundingRuns.size > 0
  ) {
    const next = queuedGroundingRuns.entries().next().value as
      | [string, NonNullable<ReturnType<typeof queuedGroundingRuns.get>>]
      | undefined;
    if (!next) return;
    const [jobId, queued] = next;
    queuedGroundingRuns.delete(jobId);
    const promise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => runGroundingJob(queued.input, queued.job, queued.options))
      .finally(() => {
        activeGroundingRuns.delete(jobId);
        drainGroundingRunQueue();
      });
    activeGroundingRuns.set(jobId, promise);
  }
}

export function startGroundingJobInBackground(
  input: ResearchGroundingJobCreateRequest,
  job: GroundingJob,
  options: {
    repository?: GroundingJobRepository;
    dependencies?: GroundingJobRunDependencies;
  } = {},
): boolean {
  if (
    activeGroundingRuns.has(job.jobId) ||
    queuedGroundingRuns.has(job.jobId) ||
    isGroundingJobTerminal(job)
  ) {
    return false;
  }
  queuedGroundingRuns.set(job.jobId, { input, job, options });
  drainGroundingRunQueue();
  return true;
}

export async function resumeGroundingJobInBackground(
  jobId: string,
  options: {
    repository?: GroundingJobRepository;
    dependencies?: GroundingJobRunDependencies;
  } = {},
): Promise<boolean> {
  const repository = options.repository ?? defaultGroundingJobRepository();
  const job = await repository.get(jobId);
  if (!job || isGroundingJobTerminal(job)) return false;
  const parsed = ResearchGroundingJobCreateRequestSchema.safeParse(
    job.requestPayload,
  );
  if (!parsed.success) return false;
  return startGroundingJobInBackground(parsed.data, job, {
    ...options,
    repository,
  });
}

export function groundingJobRunIsActive(jobId: string): boolean {
  return activeGroundingRuns.has(jobId);
}

export function groundingJobRunIsQueued(jobId: string): boolean {
  return queuedGroundingRuns.has(jobId);
}
