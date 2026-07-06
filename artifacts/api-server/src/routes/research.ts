import { Router, type IRouter } from "express";
import {
  type NormalizedSource,
  ParsedDocumentSchema,
  ResearchBuildEvidenceCardsRequestSchema,
  ResearchBuildEvidenceCardsResponseSchema,
  ResearchParseSourceRequestSchema,
  ResearchQueryPlanRequestSchema,
  ResearchQueryPlanSchema,
  ResearchSearchRequestSchema,
  ResearchSearchResponseSchema,
  ResearchSynthesizeReportRequestSchema,
  ResearchSynthesizeReportResponseSchema,
} from "@workspace/api-zod/research-tools";
import { logger } from "../lib/logger";
import { buildResearchEvidenceCards } from "../services/research/evidence/evidenceCardBuilder";
import {
  enhanceEvidenceCardsWithSchoolLlm,
  polishResearchParagraphsWithSchoolLlm,
} from "../services/research/llm/researchLlmEnhancer";
import { sourceRecordToNormalizedSource } from "../services/research/normalizers/normalizeSource";
import { parseWithGrobid } from "../services/research/parsers/grobidClient";
import { parseWithMarker } from "../services/research/parsers/markerWorker";
import { parseWithMineru } from "../services/research/parsers/mineruWorker";
import { parseWithPaddleOcr } from "../services/research/parsers/paddleOcrWorker";
import { parseWithPdfminer } from "../services/research/parsers/pdfminerWorker";
import { parseWithPdfplumber } from "../services/research/parsers/pdfplumberWorker";
import { parseWithPymupdf } from "../services/research/parsers/pymupdfWorker";
import { parseReadableHtml } from "../services/research/parsers/readableHtmlWorker";
import { parseWithTesseractOcr } from "../services/research/parsers/tesseractWorker";
import { parseWithTika } from "../services/research/parsers/tikaClient";
import { parseWithDocling } from "../services/research/parsers/doclingWorker";
import { parseWithUnstructured } from "../services/research/parsers/unstructuredWorker";
import { buildResearchQueryPlan } from "../services/research/planner/researchPlanner";
import { runSupplementalProviderSearches } from "../services/research/providers/core";
import { dedupeNormalizedSources } from "../services/research/scoring/dedupe";
import { computeFinalScore } from "../services/research/scoring/finalScore";
import { computeRelevanceScore } from "../services/research/scoring/relevanceScore";
import { computeSourceQualityScore } from "../services/research/scoring/sourceQualityScore";
import { synthesizeResearchReport } from "../services/research/synthesis/reportSynthesizer";
import { writeWorkflowSnapshot } from "../services/research/workflow/workflowStore";
import {
  searchIntentSources,
  type SearchIntentSourceSearchResult,
} from "../services/search-intent-planner";

function sourceLooksUsable(source: NormalizedSource): boolean {
  return source.title.trim().length >= 8 && (source.relevanceScore ?? 0) >= 45;
}

function acceptedSourceLimit(value: number | undefined): number {
  if (!value) return 15;
  return Math.max(5, Math.min(25, Math.trunc(value)));
}

function baseWarnings(message: string): string[] {
  return [message];
}

async function parseSourceDocument(source: NormalizedSource) {
  const url = source.fullTextUrl ?? source.url;
  const pdfLike = Boolean(url && /\.pdf($|\?)/i.test(url));

  if (source.abstract?.trim()) {
    return ParsedDocumentSchema.parse({
      sourceId: source.id,
      workflowId: source.workflowId,
      extractionMethod: "api-abstract",
      title: source.title,
      abstract: source.abstract,
      confidence: "medium",
      warnings: ["目前僅使用 API 提供的摘要內容。"],
    });
  }

  if (url && pdfLike) {
    const attempts = [
      () => parseWithTika(source.id, source.workflowId, url),
      () => parseWithPymupdf(source.id, source.workflowId, url),
      () => parseWithPdfminer(source.id, source.workflowId, url),
      () => parseWithPdfplumber(source.id, source.workflowId, url),
      () => parseWithGrobid(source.id, source.workflowId, url),
      () => parseWithUnstructured(source.id, source.workflowId, url),
      () => parseWithDocling(source.id, source.workflowId, url),
      () => parseWithMarker(source.id, source.workflowId, url),
      () => parseWithMineru(source.id, source.workflowId, url),
      () => parseWithTesseractOcr(source.id, source.workflowId, url),
      () => parseWithPaddleOcr(source.id, source.workflowId, url),
    ];

    for (const attempt of attempts) {
      try {
        const parsed = await attempt();
        if (parsed) return ParsedDocumentSchema.parse(parsed);
      } catch (error) {
        logger.warn({ err: error, sourceId: source.id }, "Research parser attempt failed");
      }
    }
  }

  if (url && process.env.ENABLE_WEB_EXTRACTION?.trim().toLowerCase() === "true") {
    try {
      const parsed = await parseReadableHtml(source.id, source.workflowId, url);
      if (parsed) return ParsedDocumentSchema.parse(parsed);
    } catch (error) {
      logger.warn({ err: error, sourceId: source.id }, "Readable HTML extraction failed");
    }
  }

  return ParsedDocumentSchema.parse({
    sourceId: source.id,
    workflowId: source.workflowId,
    extractionMethod: "api-abstract",
    title: source.title,
    confidence: "low",
    warnings: ["此來源目前只有書目 metadata，尚無摘要或可解析全文。"],
  });
}

async function searchWithResearchPlan(input: {
  topic: string;
  queryPlan?: Awaited<ReturnType<typeof buildResearchQueryPlan>>;
  reportType?: string;
  audience?: string;
  language?: string;
  sourceMode?: string;
  targetAcceptedCount?: number;
}): Promise<{
  queryPlan: Awaited<ReturnType<typeof buildResearchQueryPlan>>;
  response: SearchIntentSourceSearchResult | null;
  acceptedSources: NormalizedSource[];
  dedupedSources: NormalizedSource[];
  candidateSources: NormalizedSource[];
  providerDiagnostics: Array<{
    provider: string;
    query: string;
    ok: boolean;
    resultCount: number;
    errorType: string | null;
    errorMessage: string | null;
  }>;
  warnings: string[];
}> {
  const queryPlan =
    input.queryPlan ??
    (await buildResearchQueryPlan({
      topic: input.topic,
      reportType: input.reportType,
      audience: input.audience,
      language: input.language,
      sourceMode: input.sourceMode,
    }));

  if (queryPlan.zhQueries.length === 0 && queryPlan.enQueries.length === 0) {
    return {
      queryPlan,
      response: null,
      acceptedSources: [],
      dedupedSources: [],
      candidateSources: [],
      providerDiagnostics: [],
      warnings: baseWarnings("查無可用研究主題，請輸入具體研究問題。"),
    };
  }

  const response = await searchIntentSources({
    topic: queryPlan.normalizedTopic,
    originalTopic: queryPlan.originalTopic,
    reportType: input.reportType,
    audience: input.audience,
    language: input.language,
    sourceMode: input.sourceMode,
  });

  const rawCandidates = response.provider_status.flatMap((group) => group.results);
  const candidateSources = rawCandidates.map((source) =>
    sourceRecordToNormalizedSource(source, {
      workflowId: queryPlan.workflowId,
      topicHash: queryPlan.topicHash,
      queryHash: queryPlan.queryHash,
      queryPlanHash: queryPlan.queryPlanHash,
    }),
  );
  const summarizedSources = response.sources.map((source) =>
    sourceRecordToNormalizedSource(source, {
      workflowId: queryPlan.workflowId,
      topicHash: queryPlan.topicHash,
      queryHash: queryPlan.queryHash,
      queryPlanHash: queryPlan.queryPlanHash,
    }),
  );

  const supplemental = await runSupplementalProviderSearches(queryPlan);
  const dedupedSources = dedupeNormalizedSources([
    ...candidateSources,
    ...summarizedSources,
    ...supplemental.sources,
  ]).map((source) => {
    const relevanceScore = computeRelevanceScore(source, queryPlan);
    const sourceQualityScore = computeSourceQualityScore(source);
    const finalScore = computeFinalScore(
      { ...source, relevanceScore, sourceQualityScore },
      queryPlan,
    );
    return {
      ...source,
      relevanceScore,
      sourceQualityScore,
      finalScore,
    };
  });

  const acceptedSources = dedupedSources
    .filter(sourceLooksUsable)
    .sort((left, right) => (right.finalScore ?? 0) - (left.finalScore ?? 0))
    .slice(0, acceptedSourceLimit(input.targetAcceptedCount));

  const providerDiagnostics = [
    ...response.provider_status.map((group) => ({
      provider: group.provider,
      query: group.query,
      ok: group.ok,
      resultCount: group.results.length,
      errorType: group.error_type,
      errorMessage: group.error_message,
    })),
    ...supplemental.diagnostics,
  ];

  const warnings = [
    ...response.warnings,
    ...(acceptedSources.length < 10
      ? ["已自動補查，但目前高相關 accepted sources 仍不足 10 筆。"]
      : []),
  ];

  writeWorkflowSnapshot(queryPlan.workflowId, {
    queryPlan,
    candidateSources,
    acceptedSources,
  });

  return {
    queryPlan,
    response,
    acceptedSources,
    dedupedSources,
    candidateSources,
    providerDiagnostics,
    warnings,
  };
}

const router: IRouter = Router();

router.post("/research/query-plan", async (req, res) => {
  const parsed = ResearchQueryPlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid research query-plan request." });
    return;
  }

  const plan = await buildResearchQueryPlan(parsed.data);
  res.json(ResearchQueryPlanSchema.parse(plan));
});

router.post("/research/search", async (req, res) => {
  const parsed = ResearchSearchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid research search request." });
    return;
  }

  const fromPlan = parsed.data.queryPlan;
  const result = fromPlan
    ? await searchWithResearchPlan({
        topic: fromPlan.originalTopic,
        queryPlan: fromPlan,
        targetAcceptedCount: parsed.data.targetAcceptedCount,
      })
    : await searchWithResearchPlan({
        topic: parsed.data.topic ?? "",
        targetAcceptedCount: parsed.data.targetAcceptedCount,
      });

  res.json(
    ResearchSearchResponseSchema.parse({
      ok: true,
      queryPlan: result.queryPlan,
      candidateSources: result.candidateSources,
      dedupedSources: result.dedupedSources,
      acceptedSources: result.acceptedSources,
      providerDiagnostics: result.providerDiagnostics,
      warnings: result.warnings,
    }),
  );
});

router.post("/research/parse-source", async (req, res) => {
  const parsed = ResearchParseSourceRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid parse-source request." });
    return;
  }

  const document = await parseSourceDocument(parsed.data.source);
  writeWorkflowSnapshot(parsed.data.source.workflowId, {
    parsedDocuments: [document],
  });
  res.json(ParsedDocumentSchema.parse(document));
});

router.post("/research/build-evidence-cards", async (req, res) => {
  const parsed = ResearchBuildEvidenceCardsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid build-evidence-cards request." });
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
  const evidenceCards = enhanced.evidenceCards;
  writeWorkflowSnapshot(parsed.data.queryPlan.workflowId, { evidenceCards });
  res.json(
    ResearchBuildEvidenceCardsResponseSchema.parse({
      ok: true,
      workflowId: parsed.data.queryPlan.workflowId,
      evidenceCards,
      warnings: [
        ...(evidenceCards.some((card) => card.evidenceBasis === "metadata-only")
          ? ["部分 evidence cards 僅根據 metadata 建立，請補全文或摘要。"]
          : []),
        ...enhanced.warnings,
      ],
    }),
  );
});

router.post("/research/synthesize-report", async (req, res) => {
  const parsed = ResearchSynthesizeReportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid synthesize-report request." });
    return;
  }

  const result = await synthesizeResearchReport(parsed.data);
  const polished = await polishResearchParagraphsWithSchoolLlm({
    topic: parsed.data.topic,
    queryPlan: parsed.data.queryPlan,
    paragraphs: result.paragraphs,
  });
  const finalResult = {
    ...result,
    paragraphs: polished.paragraphs,
    warnings: [...result.warnings, ...polished.warnings],
    llmStatus:
      polished.llmStatus === "success"
        ? "success"
        : result.llmStatus,
  };
  writeWorkflowSnapshot(parsed.data.queryPlan.workflowId, {
    reportParagraphs: finalResult.paragraphs,
  });
  res.json(ResearchSynthesizeReportResponseSchema.parse(finalResult));
});

export default router;
