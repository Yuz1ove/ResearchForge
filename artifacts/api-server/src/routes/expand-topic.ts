import { TopicExpansionRequestSchema } from "@workspace/api-zod/topic-expansion";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { expandTopicWithOllama } from "../services/topic-expansion";

export function createExpandTopicRouter(): IRouter {
  const router: IRouter = Router();

  router.post("/expand-topic", async (req, res) => {
    const parsed = TopicExpansionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "請輸入有效的研究主題。" });
      return;
    }

    try {
      res.json(await expandTopicWithOllama(parsed.data));
    } catch (error) {
      const understood = understandTopic(parsed.data.topic);
      const generatedAt = new Date().toISOString();
      logger.warn({ err: error }, "Topic expansion failed unexpectedly");
      res.status(200).json({
        status: "error",
        message: "Topic expansion service failed unexpectedly.",
        expandedTopic: "",
        researchQuestions: [],
        searchKeywords: {
          zh: [],
          en: [],
          synonyms: [],
          academic: [],
        },
        sourceStrategy: [],
        exclusions: [],
        diagnostics: {
          llm_status: "error",
          provider: process.env.LLM_PROVIDER?.trim() || "ollama",
          model: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
          temperature: 0,
          cacheHit: false,
          requestId: randomUUID(),
          generatedAt,
          originalTopic: understood.originalTopic,
          normalizedTopic: understood.normalizedTopic,
          canonicalEnglishTopic: understood.canonicalEnglishTopic,
          domain: understood.domain,
          coreConcepts: understood.coreConcepts,
          searchQueries: understood.searchQueries,
          provider_status: "provider_error",
          fallbackUsed: true,
          fallback_used: true,
          fallbackReason: "unexpected_topic_expansion_error",
          validationErrors: [error instanceof Error ? error.message : "Unknown error."],
        },
      });
    }
  });

  return router;
}

export default createExpandTopicRouter();
