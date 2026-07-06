import { randomUUID } from "node:crypto";
import type {
  GroundingJob,
  ResearchGroundingJobCreateRequest,
} from "@workspace/api-zod/research-grounding";
import {
  resolveSourceSearchProfile,
  searchIntentSources,
} from "../../search-intent-planner";
import {
  runResearchGroundingPipeline,
  type GroundingPipelineDependencies,
} from "./researchGroundingPipeline";
import { topicHashForWorkflow } from "../workflow/workflowIds";

const groundingJobStore = new Map<string, GroundingJob>();

function replaceJob(jobId: string, patch: Partial<GroundingJob>): GroundingJob {
  const existing = groundingJobStore.get(jobId);
  if (!existing) {
    throw new Error(`grounding job ${jobId} is missing`);
  }
  const next: GroundingJob = {
    ...existing,
    ...patch,
    jobId,
    updatedAt: new Date().toISOString(),
  };
  groundingJobStore.set(jobId, next);
  return next;
}

export function readGroundingJob(jobId: string): GroundingJob | null {
  return groundingJobStore.get(jobId) ?? null;
}

export function createGroundingJob(
  input: ResearchGroundingJobCreateRequest,
): GroundingJob {
  const createdAt = new Date().toISOString();
  const jobId = randomUUID();
  const effectiveTopic = (input.normalizedTopic ?? input.topic).trim();
  const job: GroundingJob = {
    jobId,
    workflowId: input.workflowId,
    topicHash: topicHashForWorkflow(effectiveTopic),
    originalTopic: (input.originalTopic ?? input.topic).trim(),
    normalizedTopic: effectiveTopic,
    status: "queued",
    progress: 0,
    warnings: [],
    createdAt,
    updatedAt: createdAt,
  };
  groundingJobStore.set(jobId, job);
  return job;
}

export function scheduleGroundingJob(
  input: ResearchGroundingJobCreateRequest,
  overrides: Partial<GroundingPipelineDependencies> = {},
): GroundingJob {
  const job = createGroundingJob(input);
  const dependencies: GroundingPipelineDependencies = {
    searchHandler:
      overrides.searchHandler ??
      ((searchInput) => {
        const activeProfile = resolveSourceSearchProfile(searchInput.searchProfile ?? input.searchProfile);
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
            providerConfigs: {
              OpenAlex: {
                provider: "OpenAlex",
                endpoint: process.env.OPENALEX_WORKS_URL?.trim() || "https://api.openalex.org/works",
                timeoutMs: Number(process.env.OPENALEX_TIMEOUT_MS) || 4000,
                queryLimit: Math.min(Number(process.env.OPENALEX_QUERY_LIMIT) || activeProfile.maxCandidates, activeProfile.maxCandidates),
                pageLimit: 1,
                headers: {
                  Accept: "application/json",
                  "User-Agent":
                    process.env.SOURCE_SEARCH_USER_AGENT?.trim() || "ReportFactoryAI/1.0",
                },
                mailto:
                  process.env.OPENALEX_MAILTO?.trim() ||
                  process.env.CROSSREF_MAILTO?.trim() ||
                  undefined,
              },
              Crossref: {
                provider: "Crossref",
                endpoint: process.env.CROSSREF_WORKS_URL?.trim() || "https://api.crossref.org/works",
                timeoutMs: Number(process.env.CROSSREF_TIMEOUT_MS) || 4000,
                queryLimit: Math.min(Number(process.env.CROSSREF_QUERY_LIMIT) || activeProfile.maxCandidates, activeProfile.maxCandidates),
                pageLimit: 1,
                headers: {
                  Accept: "application/json",
                  "User-Agent":
                    process.env.SOURCE_SEARCH_USER_AGENT?.trim() || "ReportFactoryAI/1.0",
                },
                mailto: process.env.CROSSREF_MAILTO?.trim() || undefined,
              },
              "Semantic Scholar": {
                provider: "Semantic Scholar",
                endpoint:
                  process.env.SEMANTIC_SCHOLAR_SEARCH_URL?.trim() ||
                  "https://api.semanticscholar.org/graph/v1/paper/search",
                timeoutMs: Number(process.env.SEMANTIC_SCHOLAR_TIMEOUT_MS) || 6000,
                queryLimit: Math.min(Number(process.env.SEMANTIC_SCHOLAR_QUERY_LIMIT) || activeProfile.maxCandidates, activeProfile.maxCandidates),
                pageLimit: 1,
                headers: {
                  Accept: "application/json",
                  "User-Agent":
                    process.env.SOURCE_SEARCH_USER_AGENT?.trim() || "ReportFactoryAI/1.0",
                  ...(process.env.SEMANTIC_SCHOLAR_API_KEY?.trim()
                    ? { "x-api-key": process.env.SEMANTIC_SCHOLAR_API_KEY.trim() }
                    : {}),
                },
              },
            },
          },
        });
      }),
    lexiconAdapters: overrides.lexiconAdapters,
    onProgress: async (update) => {
      replaceJob(job.jobId, {
        ...(update.patch ?? {}),
        status: update.status,
        progress: update.progress,
      });
    },
  };

  queueMicrotask(async () => {
    try {
      const result = await runResearchGroundingPipeline(input, dependencies);
      replaceJob(job.jobId, {
        ...result,
        topicHash: result.topicHash,
        normalizedTopic: result.normalizedTopic,
        status: result.status,
        progress: result.progress,
      });
    } catch (error) {
      replaceJob(job.jobId, {
        status: "failed",
        progress: 100,
        warnings: [
          error instanceof Error
            ? error.message
            : "research grounding pipeline failed unexpectedly",
        ],
      });
    }
  });

  return job;
}
