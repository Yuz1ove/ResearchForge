import { Router, type IRouter } from "express";
import { ResearchToolsHealthResponseSchema } from "@workspace/api-zod/research-tools";
import { getResearchToolsHealth } from "../services/research/health/researchToolsHealth";

const router: IRouter = Router();

router.get("/research-tools/health", async (_req, res) => {
  const data = await getResearchToolsHealth();
  res.json(ResearchToolsHealthResponseSchema.parse(data));
});

export default router;
