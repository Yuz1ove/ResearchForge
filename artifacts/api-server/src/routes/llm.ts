import { normalizeSourceRecord } from "@workspace/api-zod";
import { TopicExpansionRequestSchema } from "@workspace/api-zod/topic-expansion";
import {
  ResearchBuildEvidenceCardsRequestSchema,
  ResearchBuildEvidenceCardsResponseSchema,
  ResearchSynthesizeReportRequestSchema,
  ResearchSynthesizeReportResponseSchema,
} from "@workspace/api-zod/research-tools";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { resolveSafeLlmProviderConfig } from "../config/llm-provider-config";
import { expandTopicWithOllama } from "../services/topic-expansion";
import { summarizeSourcesWithLlm } from "../services/source-summarizer";
import { buildResearchEvidenceCards } from "../services/research/evidence/evidenceCardBuilder";
import {
  enhanceEvidenceCardsWithSchoolLlm,
  polishResearchParagraphsWithSchoolLlm,
} from "../services/research/llm/researchLlmEnhancer";
import { synthesizeResearchReport } from "../services/research/synthesis/reportSynthesizer";
import { normalizeGenerateReportRequest } from "./generate-report";
import { writeReportWithLlm } from "../services/report-writer";
import {
  checkLlmHealth,
  expectedOpenAiModel,
  runLlmSmokeTest,
  type LlmHealthResult,
  type LlmSmokeResult,
} from "../services/llm-service";
import { resolveOpenAiModelAlias } from "../services/llm-adapter";

const FALLBACK_MESSAGE = "AI 服務暫時不可用，已使用本地規則 fallback";

export interface LlmRouterOptions {
  healthChecker?: () => Promise<LlmHealthResult>;
  smokeTester?: () => Promise<LlmSmokeResult>;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createLlmRouter(options: LlmRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.get("/llm/health", async (_req, res) => {
    try {
      const result = await (options.healthChecker ?? checkLlmHealth)();
      res.status(200).json(result);
    } catch {
      const safeConfig = resolveSafeLlmProviderConfig();
      const model = safeConfig.model ?? resolveOpenAiModelAlias(process.env.OPENAI_MODEL ?? process.env.LLM_MODEL);
      res.status(200).json({
        ok: false,
        provider: safeConfig.provider,
        configuredModel: safeConfig.model,
        resolvedModel: safeConfig.model,
        apiKeyPresent: safeConfig.apiKeyConfigured,
        apiKeyPrefix: null,
        apiKeyConfigured: safeConfig.apiKeyConfigured,
        baseURL: safeConfig.baseURL,
        baseURLConfigured: safeConfig.baseURLConfigured,
        credentialPreview: safeConfig.credentialPreview,
        modelsEndpointReachable: false,
        modelAvailable: false,
        modelConfigured: safeConfig.modelConfigured,
        compatibleMode: safeConfig.compatibleMode,
        missing: safeConfig.missing,
        source: safeConfig.source,
        errorCode: "unknown_error",
        errorMessage: "LLM health route failed.",
        checkedAt: new Date().toISOString(),
        available: false,
        status: "error",
        model: safeConfig.model ?? model,
        latencyMs: 0,
      } satisfies LlmHealthResult);
    }
  });

  const smokeHandler = async (_req: Request, res: Response) => {
    try {
      const result = await (options.smokeTester ?? runLlmSmokeTest)();
      res.status(result.ok ? 200 : 503).json(result);
    } catch {
      const safeConfig = resolveSafeLlmProviderConfig();
      const model = safeConfig.model ?? expectedOpenAiModel();
      res.status(503).json({
        ok: false,
        provider: safeConfig.provider,
        requestedModel: model,
        actualModel: null,
        text: null,
        checkedAt: new Date().toISOString(),
        errorCode: "unknown_error",
        errorMessage: "LLM smoke route failed.",
        available: false,
        status: "error",
        model,
        adapter: "openai",
        fallbackUsed: true,
        latencyMs: 0,
      } satisfies LlmSmokeResult);
    }
  };

  router.get("/llm/smoke", smokeHandler);
  router.post("/llm/smoke", smokeHandler);

  router.post("/llm/topic-expand", async (req, res) => {
    const parsed = TopicExpansionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "請輸入有效的研究主題。" });
      return;
    }

    try {
      res.json(await expandTopicWithOllama(parsed.data));
    } catch (error) {
      logger.warn({ route: "/api/llm/topic-expand" }, "LLM topic facade fell back");
      res.status(200).json({
        status: "unavailable",
        message: FALLBACK_MESSAGE,
        fallbackUsed: true,
        fallback_used: true,
        fallbackReason: error instanceof Error ? error.name : "topic_expand_failed",
      });
    }
  });

  router.post("/llm/summarize-source", async (req, res) => {
    const topic = cleanString(req.body?.topic);
    const rawSource = req.body?.source;
    if (!topic || !rawSource || typeof rawSource !== "object") {
      res.status(400).json({ message: "請提供 topic 與 source。" });
      return;
    }

    try {
      const source = {
        ...normalizeSourceRecord(rawSource),
        relevanceLevel: "primary" as const,
      };
      const [summarized] = await summarizeSourcesWithLlm(topic, [source], { maxSources: 1 });
      res.json({
        ok: true,
        source: summarized ?? source,
        fallbackUsed: Boolean(summarized?.summaryFallbackUsed),
        message: summarized?.summaryFallbackUsed ? FALLBACK_MESSAGE : "LLM 生成成功。",
      });
    } catch {
      logger.warn({ route: "/api/llm/summarize-source" }, "LLM summary facade fell back");
      res.status(200).json({
        ok: false,
        message: FALLBACK_MESSAGE,
        fallbackUsed: true,
      });
    }
  });

  router.post("/llm/evidence-cards", async (req, res) => {
    const parsed = ResearchBuildEvidenceCardsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid evidence-card request." });
      return;
    }

    const baseEvidenceCards = buildResearchEvidenceCards({
      queryPlan: parsed.data.queryPlan,
      acceptedSources: parsed.data.acceptedSources,
      parsedDocuments: parsed.data.parsedDocuments,
    });
    const enhanced = await enhanceEvidenceCardsWithSchoolLlm({
      topic: parsed.data.topic,
      queryPlan: parsed.data.queryPlan,
      evidenceCards: baseEvidenceCards,
    });

    res.json(
      ResearchBuildEvidenceCardsResponseSchema.parse({
        ok: true,
        workflowId: parsed.data.queryPlan.workflowId,
        evidenceCards: enhanced.evidenceCards,
        warnings: enhanced.warnings,
      }),
    );
  });

  router.post("/llm/synthesize-report", async (req, res) => {
    const researchParsed = ResearchSynthesizeReportRequestSchema.safeParse(req.body);
    if (researchParsed.success) {
      const result = await synthesizeResearchReport(researchParsed.data);
      const polished = await polishResearchParagraphsWithSchoolLlm({
        topic: researchParsed.data.topic,
        queryPlan: researchParsed.data.queryPlan,
        paragraphs: result.paragraphs,
      });
      res.json(
        ResearchSynthesizeReportResponseSchema.parse({
          ...result,
          paragraphs: polished.paragraphs,
          warnings: [...result.warnings, ...polished.warnings],
          llmStatus: polished.llmStatus === "success" ? "success" : result.llmStatus,
        }),
      );
      return;
    }

    const reportInput = normalizeGenerateReportRequest(req.body);
    if (!reportInput) {
      res.status(400).json({ message: "請提供主題與可用來源或 evidence cards。" });
      return;
    }

    res.json(await writeReportWithLlm(reportInput));
  });

  return router;
}

export default createLlmRouter();
