import { TopicExpansionRequestSchema } from "@workspace/api-zod/topic-expansion";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { expandTopicWithOllama } from "../services/topic-expansion";

const LEGACY_TEMPLATE_TERMS = [
  "definition scope evidence",
  "measurable indicators",
  "case study dataset",
  "evidence research",
] as const;

function legacyTemplateHits(text: string): string[] {
  const normalized = text.toLowerCase();
  return LEGACY_TEMPLATE_TERMS.filter((term) => normalized.includes(term));
}

export function createExpandTopicRouter(): IRouter {
  const router: IRouter = Router();

  router.post("/expand-topic", async (req, res) => {
    const parsed = TopicExpansionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "請輸入有效的研究主題。" });
      return;
    }

    try {
      const understood = understandTopic(parsed.data.topic);
      const result = await expandTopicWithOllama(parsed.data);
      const legacyHits = legacyTemplateHits(
        [
          result.expandedTopic,
          ...result.researchQuestions,
          ...(result.directions ?? []).flatMap((direction) => [
            direction.title,
            direction.researchQuestion,
            direction.scope,
            ...direction.queryZh,
            ...direction.queryEn,
          ]),
          ...result.searchKeywords.zh,
          ...result.searchKeywords.en,
          ...result.searchKeywords.synonyms,
          ...result.searchKeywords.academic,
          ...result.sourceStrategy,
        ]
          .filter(Boolean)
          .join(" "),
      );
      logger.info(
        {
          routeName: "/api/expand-topic",
          inputTopic: parsed.data.topic,
          plannerUsed: false,
          functionName: "expandTopicWithOllama",
          inputKind: result.inputKind,
          topicDomain: result.topicDomain,
          entityType: result.entityType ?? result.diagnostics?.entityType ?? null,
          generationMode: result.generationMode,
          secondaryDomains: result.secondaryDomains ?? [],
          candidateCount: result.candidateCount ?? 0,
          selectedLensIds: result.diagnostics?.selectedLensIds ?? [],
          rejectedLensIds: result.diagnostics?.rejectedLensIds ?? [],
          lensRejectReasons: result.diagnostics?.lensRejectReasons ?? {},
          topicKind: understood.topicKind,
          domain: understood.domain,
          chineseQueries: result.diagnostics?.searchQueries?.zh ?? understood.searchQueries.zh,
          englishQueries: result.diagnostics?.searchQueries?.en ?? understood.searchQueries.en,
          legacyTemplateHits: legacyHits,
          containsLegacyTemplate: legacyHits.length > 0,
          status: result.status,
          llm_status: result.diagnostics?.llm_status ?? null,
          fallback_used:
            result.diagnostics?.fallback_used ?? result.diagnostics?.fallbackUsed ?? null,
          requestId: result.diagnostics?.requestId ?? null,
        },
        "ResearchForge runtime trace",
      );
      res.json(result);
    } catch (error) {
      const understood = understandTopic(parsed.data.topic);
      const generatedAt = new Date().toISOString();
      logger.warn({ err: error }, "Topic expansion failed unexpectedly");
      res.status(200).json({
        status: "error",
        message: "Topic expansion service failed unexpectedly.",
        originalTopic: understood.originalTopic,
        inputKind: understood.topicKind === "unknown_or_noise" ? "gibberish" : "short_phrase",
        topicDomain: "unknown",
        secondaryDomains: [],
        generationMode: "error",
        fallbackReason: "unexpected_topic_expansion_error",
        modelUsed: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
        llmLatencyMs: 0,
        keywordExpansion: null,
        candidateCount: 0,
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
        directions: [],
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
          inputKind:
            understood.topicKind === "unknown_or_noise"
              ? "gibberish"
              : "short_phrase",
          topicDomain: "unknown",
          secondaryDomains: [],
          generationMode: "error",
          modelUsed: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
          llmLatencyMs: 0,
          keywordExpansion: null,
          candidateCount: 0,
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
