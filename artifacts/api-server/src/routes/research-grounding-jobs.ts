import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GroundingJobErrorResponseSchema,
  GroundingJobSchema,
  ResearchGroundingJobCreateRequestSchema,
  ResearchGroundingJobCreateResponseSchema,
  type GroundingJobErrorCode,
} from "@workspace/api-zod/research-grounding";
import { logger } from "../lib/logger";
import {
  createGroundingJob,
  readGroundingJob,
  readGroundingJobRevision,
  resumeGroundingJobInBackground,
  startGroundingJobInBackground,
  type GroundingJobRunDependencies,
} from "../services/research/grounding/researchGroundingJobStore";
import {
  GroundingStoreNotConfiguredError,
  isGroundingJobTerminal,
  type GroundingJobRepository,
} from "../services/research/grounding/groundingJobRepository";

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
      startGroundingJobInBackground(parsed.data, job, {
        repository: options.repository,
        dependencies: options.runDependencies,
      });
      res.status(202).json(
        ResearchGroundingJobCreateResponseSchema.parse({
          jobId: job.jobId,
          workflowId: job.workflowId,
          topicHash: job.topicHash,
          requestId: job.requestId,
          attemptId: job.attemptId,
          status: job.status,
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
      if (!isGroundingJobTerminal(job)) {
        await resumeGroundingJobInBackground(job.jobId, {
          repository: options.repository,
          dependencies: options.runDependencies,
        });
      }
      const requestedWaitMs = Number(req.query.waitMs ?? 0);
      const waitCeilingMs = Number.isFinite(requestedWaitMs)
        ? Math.max(0, Math.min(30_000, Math.floor(requestedWaitMs)))
        : 0;
      let current = job;
      if (waitCeilingMs > 0 && !isGroundingJobTerminal(current)) {
        const deadline = Date.now() + waitCeilingMs;
        while (Date.now() < deadline && !isGroundingJobTerminal(current)) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, Math.min(250, deadline - Date.now()));
            timer.unref?.();
          });
          const revision = await readGroundingJobRevision(
            job.jobId,
            options.repository,
          );
          if (revision === null) break;
          if (revision !== current.revision) {
            current =
              (await readGroundingJob(job.jobId, options.repository)) ?? current;
          }
        }
      }
      const terminal = isGroundingJobTerminal(current);
      const responseJob = {
        ...current,
        clientWait: {
          status: terminal
            ? "JOB_TERMINAL" as const
            : waitCeilingMs > 0
              ? "CLIENT_WAIT_EXPIRED" as const
              : "WAITING" as const,
          waitCeilingMs,
          observedAt: new Date().toISOString(),
        },
      };
      res.status(!terminal && waitCeilingMs > 0 ? 202 : 200).json(
        GroundingJobSchema.parse(normalizeGroundingJobForResponse(responseJob)),
      );
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

  return router;
}

export default createResearchGroundingJobsRouter();
