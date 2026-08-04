import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GroundingJobErrorResponseSchema,
  GroundingJobSchema,
  ResearchGroundingJobCreateRequestSchema,
  ResearchGroundingJobCreateResponseSchema,
  SourceDecisionPatchRequestSchema,
  type GroundingJobErrorCode,
  type GroundingJob,
  type SourceCandidate,
  type SourceDecision,
} from "@workspace/api-zod/research-grounding";
import { logger } from "../lib/logger";
import {
  createGroundingJob,
  readGroundingJob,
  runGroundingJob,
  type GroundingJobRunDependencies,
} from "../services/research/grounding/researchGroundingJobStore";
import {
  defaultGroundingJobRepository,
  GroundingStoreNotConfiguredError,
  GroundingJobNotFoundError,
  GroundingJobRevisionConflictError,
  type GroundingJobRepository,
} from "../services/research/grounding/groundingJobRepository";
import { buildGroundingEvidenceCards } from "../services/research/grounding/researchGroundingPipeline";

export interface ResearchGroundingJobsRouterOptions {
  repository?: GroundingJobRepository;
  runDependencies?: GroundingJobRunDependencies;
}

function requestIdFor(req: Request): string {
  const pinoRequestId = (req as Request & { id?: unknown }).id;
  if (typeof pinoRequestId === "string" && pinoRequestId.trim()) {
    return pinoRequestId.trim();
  }
  if (typeof pinoRequestId === "number" && Number.isFinite(pinoRequestId)) {
    return String(pinoRequestId);
  }
  return randomUUID();
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Research grounding request failed.";
  return message
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function sendGroundingError(
  res: Response,
  input: {
    status: number;
    code: GroundingJobErrorCode;
    message: string;
    stage: "creation" | "polling" | "pipeline";
    retryable: boolean;
    requestId: string;
  },
): void {
  res.status(input.status).json(GroundingJobErrorResponseSchema.parse({
    code: input.code,
    message: input.message,
    stage: input.stage,
    retryable: input.retryable,
    requestId: input.requestId,
  }));
}

function normalizeGroundingJobForResponse<T extends Record<string, unknown>>(job: T): T {
  const diagnostics = job.groundingDiagnostics;
  if (!diagnostics || typeof diagnostics !== "object") return job;
  const firstCandidateLatencyMs = (diagnostics as { firstCandidateLatencyMs?: unknown })
    .firstCandidateLatencyMs;
  if (typeof firstCandidateLatencyMs !== "number" || firstCandidateLatencyMs >= 0) return job;
  return {
    ...job,
    groundingDiagnostics: {
      ...diagnostics,
      firstCandidateLatencyMs: 0,
    },
  };
}

function candidateDecision(
  candidate: SourceCandidate,
  decisions: ReadonlyMap<string, SourceDecision>,
): SourceCandidate {
  const decision = decisions.get(candidate.sourceId);
  if (!decision) return candidate;
  if (decision.decision === "accepted") {
    return {
      ...candidate,
      reviewStatus: "accepted",
      acceptedByUser: true,
      userDecision:
        candidate.recommendationBucket === "official_background"
          ? "accepted_as_background"
          : candidate.recommendationBucket === "manual_review"
            ? "accepted_as_manual_review"
            : "accepted",
      acceptedAs:
        candidate.recommendationBucket === "official_background"
          ? "background"
          : candidate.recommendationBucket === "manual_review"
            ? "manual_review"
            : "source",
      rejectionReason: undefined,
    };
  }
  if (decision.decision === "rejected") {
    return {
      ...candidate,
      reviewStatus: "rejected",
      acceptedByUser: false,
      userDecision: "rejected",
      acceptedAs: undefined,
    };
  }
  return {
    ...candidate,
    reviewStatus: "review",
    acceptedByUser: false,
    userDecision: "pending",
    acceptedAs: undefined,
    rejectionReason: undefined,
  };
}

function canonicalCandidates(job: GroundingJob): SourceCandidate[] {
  // A completed job may intentionally expose an empty high-confidence
  // candidateSources list while keeping reviewable results in
  // sourceCandidates/fallbackReviewSources. Nullish coalescing used to pick
  // that empty list and made every user decision look like an unknown source.
  const candidates = [
    ...(job.candidateSources ?? []),
    ...(job.sourceCandidates ?? []),
    ...(job.highConfidenceCandidateSources ?? []),
    ...(job.fallbackReviewSources ?? []),
    ...(job.acceptedSources ?? []),
    ...(job.rejectedSources ?? []),
  ];
  const unique = new Map<string, SourceCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.sourceId)) unique.set(candidate.sourceId, candidate);
  }
  return Array.from(unique.values());
}

function sourceDecisionPatch(
  job: GroundingJob,
  updates: Array<{ sourceId: string; decision: SourceDecision["decision"] }>,
): Partial<GroundingJob> {
  const now = new Date().toISOString();
  const existing = new Map(
    (job.sourceDecisions ?? []).map((decision) => [decision.sourceId, decision]),
  );
  for (const update of updates) {
    const previous = existing.get(update.sourceId);
    existing.set(update.sourceId, {
      sourceId: update.sourceId,
      workflowId: job.workflowId,
      decision: update.decision,
      decidedBy: "user",
      decidedAt: now,
      decisionVersion: (previous?.decisionVersion ?? 0) + 1,
    });
  }
  const sourceDecisions = canonicalCandidates(job)
    .map((candidate) => existing.get(candidate.sourceId))
    .filter((decision): decision is SourceDecision => Boolean(decision));
  const decisionMap = new Map(
    sourceDecisions.map((decision) => [decision.sourceId, decision]),
  );
  const decidedCandidates = canonicalCandidates(job).map((candidate) =>
    candidateDecision(candidate, decisionMap),
  );
  const acceptedSources = decidedCandidates.filter(
    (candidate) => candidate.reviewStatus === "accepted",
  );
  const evidenceCards = job.academicSafetyReview
    ? buildGroundingEvidenceCards({
        workflowId: job.workflowId,
        topicHash: job.topicHash,
        topic: job.normalizedTopic || job.originalTopic,
        acceptedSources,
        claimCandidates: job.claimCandidates,
        safetyReview: job.academicSafetyReview,
      })
    : (job.evidenceCards ?? []);
  const evidenceCountBySourceId = new Map<string, number>();
  for (const card of evidenceCards) {
    evidenceCountBySourceId.set(
      card.sourceId,
      (evidenceCountBySourceId.get(card.sourceId) ?? 0) + 1,
    );
  }
  const mappedCandidates = decidedCandidates.map((candidate) => ({
    ...candidate,
    acceptedEvidenceCardCount: evidenceCountBySourceId.get(candidate.sourceId) ?? 0,
  }));
  const candidateById = new Map(
    mappedCandidates.map((candidate) => [candidate.sourceId, candidate]),
  );
  const mapExisting = (items: SourceCandidate[] | undefined) =>
    items?.map((candidate) => candidateById.get(candidate.sourceId) ?? candidate);

  return {
    sourceDecisions,
    ...(job.sourceCandidates ? { sourceCandidates: mapExisting(job.sourceCandidates) } : {}),
    ...(job.candidateSources ? { candidateSources: mapExisting(job.candidateSources) } : {}),
    ...(job.highConfidenceCandidateSources
      ? { highConfidenceCandidateSources: mapExisting(job.highConfidenceCandidateSources) }
      : {}),
    ...(job.fallbackReviewSources
      ? { fallbackReviewSources: mapExisting(job.fallbackReviewSources) }
      : {}),
    acceptedSources: mappedCandidates.filter((candidate) => candidate.reviewStatus === "accepted"),
    rejectedSources: mappedCandidates.filter((candidate) => candidate.reviewStatus === "rejected"),
    evidenceCards,
  };
}

export function createResearchGroundingJobsRouter(
  options: ResearchGroundingJobsRouterOptions = {},
): IRouter {
  const router: IRouter = Router();

  router.post("/research-grounding-jobs", async (req, res) => {
    const routeRequestId = requestIdFor(req);
    const parsed = ResearchGroundingJobCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      logger.warn(
        {
          event: "research_grounding.request_rejected",
          requestId: routeRequestId,
          route: "/api/research-grounding-jobs",
          stage: "creation",
          errorCode: "INVALID_GROUNDING_REQUEST",
        },
        "Invalid research grounding job request",
      );
      sendGroundingError(res, {
        status: 400,
        code: "INVALID_GROUNDING_REQUEST",
        message: "Invalid research grounding job request.",
        stage: "creation",
        retryable: false,
        requestId: routeRequestId,
      });
      return;
    }

    const requestId = parsed.data.requestId ?? routeRequestId;
    const attemptId = parsed.data.attemptId ?? randomUUID();
    try {
      const job = await createGroundingJob(parsed.data, {
        repository: options.repository,
        requestId,
        attemptId,
      });
      const completedJob = await runGroundingJob(parsed.data, job, {
        repository: options.repository,
        dependencies: options.runDependencies,
      });
      res.status(200).json(
        ResearchGroundingJobCreateResponseSchema.parse({
          jobId: completedJob.jobId,
          workflowId: completedJob.workflowId,
          topicHash: completedJob.topicHash,
          requestId: completedJob.requestId,
          attemptId: completedJob.attemptId,
          status: completedJob.status,
        }),
      );
    } catch (error) {
      const code =
        error instanceof GroundingStoreNotConfiguredError
          ? "GROUNDING_STORE_NOT_CONFIGURED"
          : "GROUNDING_JOB_CREATE_FAILED";
      logger.error(
        {
          event: "research_grounding.request_failed",
          requestId,
          route: "/api/research-grounding-jobs",
          stage: "creation",
          errorCode: code,
          errorMessage: safeErrorMessage(error),
          retryable: code !== "GROUNDING_STORE_NOT_CONFIGURED",
        },
        "Research grounding job creation failed",
      );
      sendGroundingError(res, {
        status: code === "GROUNDING_STORE_NOT_CONFIGURED" ? 503 : 500,
        code,
        message:
          code === "GROUNDING_STORE_NOT_CONFIGURED"
            ? "Research grounding storage is not configured. Configure DATABASE_URL for this deployment."
            : "Research grounding job could not be created.",
        stage: "creation",
        retryable: code !== "GROUNDING_STORE_NOT_CONFIGURED",
        requestId,
      });
    }
  });

  router.get("/research-grounding-jobs/:jobId", async (req, res) => {
    const requestId = requestIdFor(req);
    try {
      const job = await readGroundingJob(req.params.jobId, options.repository);
      if (!job) {
        sendGroundingError(res, {
          status: 404,
          code: "GROUNDING_JOB_NOT_FOUND",
          message: "Research grounding job not found.",
          stage: "polling",
          retryable: false,
          requestId,
        });
        return;
      }
      res.json(GroundingJobSchema.parse(normalizeGroundingJobForResponse(job)));
    } catch (error) {
      const code =
        error instanceof GroundingStoreNotConfiguredError
          ? "GROUNDING_STORE_NOT_CONFIGURED"
          : "GROUNDING_JOB_POLL_FAILED";
      logger.error(
        {
          event: "research_grounding.poll_failed",
          requestId,
          jobId: req.params.jobId,
          route: "/api/research-grounding-jobs/:jobId",
          stage: "polling",
          errorCode: code,
          errorMessage: safeErrorMessage(error),
          retryable: code !== "GROUNDING_STORE_NOT_CONFIGURED",
        },
        "Research grounding job polling failed",
      );
      sendGroundingError(res, {
        status: code === "GROUNDING_STORE_NOT_CONFIGURED" ? 503 : 500,
        code,
        message:
          code === "GROUNDING_STORE_NOT_CONFIGURED"
            ? "Research grounding storage is not configured. Configure DATABASE_URL for this deployment."
            : "Research grounding job status could not be read.",
        stage: "polling",
        retryable: code !== "GROUNDING_STORE_NOT_CONFIGURED",
        requestId,
      });
    }
  });

  router.patch("/research-grounding-jobs/:jobId/source-decisions", async (req, res) => {
    const requestId = requestIdFor(req);
    const parsed = SourceDecisionPatchRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        code: "INVALID_SOURCE_DECISIONS",
        message: "Invalid source decision payload.",
        requestId,
      });
      return;
    }
    try {
      const repository = options.repository ?? defaultGroundingJobRepository();
      const job = await repository.get(req.params.jobId);
      if (!job) throw new GroundingJobNotFoundError(req.params.jobId);
      if (
        job.workflowId !== parsed.data.workflowId ||
        job.topicHash !== parsed.data.topicHash
      ) {
        res.status(409).json({
          code: "SOURCE_DECISION_CONTEXT_MISMATCH",
          message: "Source decisions do not match this workflow.",
          requestId,
        });
        return;
      }
      const knownSourceIds = new Set(canonicalCandidates(job).map((candidate) => candidate.sourceId));
      if (parsed.data.decisions.some((decision) => !knownSourceIds.has(decision.sourceId))) {
        res.status(400).json({
          code: "UNKNOWN_SOURCE_DECISION_TARGET",
          message: "A source decision targets an unknown source.",
          requestId,
        });
        return;
      }
      const updated = await repository.patch(
        job.jobId,
        sourceDecisionPatch(job, parsed.data.decisions),
        { expectedRevision: parsed.data.expectedRevision },
      );
      res.json(GroundingJobSchema.parse(normalizeGroundingJobForResponse(updated)));
    } catch (error) {
      if (error instanceof GroundingJobNotFoundError) {
        res.status(404).json({
          code: "GROUNDING_JOB_NOT_FOUND",
          message: "Research grounding job not found.",
          requestId,
        });
        return;
      }
      if (error instanceof GroundingJobRevisionConflictError) {
        res.status(409).json({
          code: "SOURCE_DECISION_REVISION_CONFLICT",
          message: "Source decisions changed in another browser context. Reload and try again.",
          requestId,
        });
        return;
      }
      const status = error instanceof GroundingStoreNotConfiguredError ? 503 : 500;
      res.status(status).json({
        code:
          error instanceof GroundingStoreNotConfiguredError
            ? "GROUNDING_STORE_NOT_CONFIGURED"
            : "SOURCE_DECISION_PERSIST_FAILED",
        message: "Source decisions could not be persisted.",
        requestId,
      });
    }
  });

  return router;
}

export default createResearchGroundingJobsRouter();
