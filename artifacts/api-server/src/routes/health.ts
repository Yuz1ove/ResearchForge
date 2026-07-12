import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", (_req, res) => {
  res.json({
    name: "ResearchForge API",
    status: "ok",
    endpoints: {
      health: "/api/healthz",
      llmHealth: "/api/llm/health",
    },
  });
});

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
