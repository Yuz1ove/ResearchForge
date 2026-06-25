import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { understandTopicWithFallback } from "../services/topic-understanding";

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function createTopicUnderstandingRouter(): IRouter {
  const router: IRouter = Router();

  router.post("/topic-understanding", async (req, res) => {
    const body = req.body as Record<string, unknown> | null;
    const topic = cleanString(body?.topic);
    if (!topic) {
      res.status(400).json({ message: "請輸入有效的研究主題。" });
      return;
    }

    try {
      const result = await understandTopicWithFallback({
        topic,
        reportType: cleanString(body?.reportType),
        audience: cleanString(body?.audience),
        sourceMode: cleanString(body?.sourceMode),
        language: cleanString(body?.language),
      });
      res.json(result);
    } catch (error) {
      logger.warn({ err: error }, "Topic understanding failed unexpectedly");
      res.status(502).json({ message: "主題理解服務暫時無法使用，請稍後再試。" });
    }
  });

  return router;
}

export default createTopicUnderstandingRouter();
