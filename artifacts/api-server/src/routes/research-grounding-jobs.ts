import { Router, type IRouter } from "express";
import {
  GroundingJobSchema,
  ResearchGroundingJobCreateRequestSchema,
  ResearchGroundingJobCreateResponseSchema,
} from "@workspace/api-zod/research-grounding";
import {
  readGroundingJob,
  scheduleGroundingJob,
} from "../services/research/grounding/researchGroundingJobStore";

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

export function createResearchGroundingJobsRouter(): IRouter {
  const router: IRouter = Router();

  router.post("/research-grounding-jobs", (req, res) => {
    const parsed = ResearchGroundingJobCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid research grounding job request." });
      return;
    }

    const job = scheduleGroundingJob(parsed.data);
    res.json(
      ResearchGroundingJobCreateResponseSchema.parse({
        jobId: job.jobId,
        workflowId: job.workflowId,
        topicHash: job.topicHash,
        status: "queued",
      }),
    );
  });

  router.get("/research-grounding-jobs/:jobId", (req, res) => {
    const job = readGroundingJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ message: "Research grounding job not found." });
      return;
    }

    res.json(GroundingJobSchema.parse(normalizeGroundingJobForResponse(job)));
  });

  return router;
}

export default createResearchGroundingJobsRouter();
