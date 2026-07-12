import { Router, type IRouter } from "express";
import { createHash, randomUUID } from "node:crypto";
import {
  AcademicSafetyReviewSchema,
  getReportReadiness,
  type ReportMode,
} from "@workspace/api-zod";
import {
  normalizeSourceRecord,
  type SourceRecord,
} from "@workspace/api-zod/source-record";
import { logger } from "../lib/logger";
import { redactKnownSecrets } from "../services/llm/schoolProvider";
import {
  checkLlmHealth,
  expectedOpenAiModel,
  runLlmSmokeTest,
  type LlmHealthResult,
  type LlmSmokeResult,
} from "../services/llm-service";
import {
  writeReportWithLlm,
  type ReportWriterInput,
  type ReportWriterResult,
  type ReportWriterEvidenceCard,
} from "../services/report-writer";

export type GenerateReportHandler = (
  input: ReportWriterInput,
) => Promise<ReportWriterResult>;

export interface GenerateReportRouterOptions {
  reportWriter?: GenerateReportHandler;
  healthChecker?: () => Promise<LlmHealthResult>;
  smokeTester?: () => Promise<LlmSmokeResult>;
}

type GenerateReportErrorCode =
  | "INSUFFICIENT_ACCEPTED_SOURCES"
  | "EVIDENCE_CARDS_REQUIRED"
  | "TOPIC_HASH_REQUIRED"
  | "WORKFLOW_CONTEXT_REQUIRED"
  | "WORKFLOW_CONTEXT_MISMATCH"
  | "LLM_UNAVAILABLE"
  | "MODEL_MISSING"
  | "FALLBACK_USED"
  | "WRONG_MODEL"
  | "REPORT_WRITER_FAILED"
  | "VALIDATION_ERROR";

interface GenerateReportErrorDetails {
  reportMode: ReportMode | "blocked" | null;
  acceptedSourcesCount: number;
  evidenceCardsCount: number;
  minRequiredSources: number;
  requestedModel: string | null;
  actualModel: string | null;
  fallbackUsed: boolean;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function optionalScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAcceptedSources(value: unknown): SourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((source) => {
      if (!source || typeof source !== "object") return null;
      try {
        return normalizeSourceRecord(source as SourceRecord);
      } catch {
        return null;
      }
    })
    .filter((source): source is SourceRecord => Boolean(source))
    .map((source) => ({ ...source, reviewState: "accepted" }));
}

function normalizeEvidenceCards(value: unknown): ReportWriterEvidenceCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((card): ReportWriterEvidenceCard | null => {
      if (!card || typeof card !== "object") return null;
      const data = card as Record<string, unknown>;
      const id = cleanString(data.id);
      const sourceId = cleanString(data.sourceId);
      if (!id || !sourceId) return null;
      return {
        id,
        evidenceId: cleanString(data.evidenceId) ?? id,
        workflowId: cleanString(data.workflowId) ?? null,
        topicHash: cleanString(data.topicHash) ?? null,
        claimTextOriginal: cleanString(data.claimTextOriginal) ?? "",
        claimTextZh: cleanString(data.claimTextZh) ?? cleanString(data.claim) ?? "",
        supportedByText: cleanString(data.supportedByText) ?? cleanString(data.evidence) ?? "",
        sourceId,
        title: cleanString(data.title) ?? cleanString(data.sourceTitle) ?? "",
        claim: cleanString(data.claim) ?? "",
        claimTextZhTw: cleanString(data.claimTextZhTw) ?? "",
        evidence: cleanString(data.evidence) ?? "",
        evidencePointZhTw: cleanString(data.evidencePointZhTw) ?? "",
        summary: cleanString(data.summary) ?? "",
        sourceSummaryZhTw: cleanString(data.sourceSummaryZhTw) ?? "",
        relevance: cleanString(data.relevance) ?? "",
        sourceType: cleanString(data.sourceType) ?? "",
        reliability: cleanString(data.reliability) ?? "",
        mainClaim: cleanString(data.mainClaim) ?? "",
        usableEvidence: cleanString(data.usableEvidence) ?? "",
        limitations: Array.isArray(data.limitations)
          ? data.limitations
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        limitationsZhTw: Array.isArray(data.limitationsZhTw)
          ? data.limitationsZhTw
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        sectionTargets: Array.isArray(data.sectionTargets)
          ? data.sectionTargets
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        sourceTitle: cleanString(data.sourceTitle) ?? "",
        sourceProvider: cleanString(data.sourceProvider) ?? "",
        sourceAccessLevel:
          cleanString(data.sourceAccessLevel) ??
          cleanString(data.source_access_level) ??
          null,
        source_access_level:
          cleanString(data.source_access_level) ??
          cleanString(data.sourceAccessLevel) ??
          null,
        evidenceType:
          cleanString(data.evidenceType) ??
          cleanString(data.evidence_type) ??
          null,
        evidence_type:
          cleanString(data.evidence_type) ??
          cleanString(data.evidenceType) ??
          null,
        quotedText:
          cleanString(data.quotedText) ??
          cleanString(data.quoted_text) ??
          null,
        quoted_text:
          cleanString(data.quoted_text) ??
          cleanString(data.quotedText) ??
          null,
        sourceLocation:
          cleanString(data.sourceLocation) ??
          cleanString(data.source_location) ??
          null,
        source_location:
          cleanString(data.source_location) ??
          cleanString(data.sourceLocation) ??
          null,
        sectionHeading:
          cleanString(data.sectionHeading) ??
          cleanString(data.section_heading) ??
          null,
        section_heading:
          cleanString(data.section_heading) ??
          cleanString(data.sectionHeading) ??
          null,
        page: typeof data.page === "number" ? data.page : null,
        trace:
          data.trace && typeof data.trace === "object"
            ? (data.trace as ReportWriterEvidenceCard["trace"])
            : null,
        recommendationBucket:
          data.recommendationBucket === "scholarly_recommended" ||
          data.recommendationBucket === "official_background" ||
          data.recommendationBucket === "manual_review" ||
          data.recommendationBucket === "rejected"
            ? data.recommendationBucket
            : null,
        sourceRole: cleanString(data.sourceRole) ?? null,
        retrievalMode: cleanString(data.retrievalMode) ?? null,
        isPeerReviewed:
          typeof data.isPeerReviewed === "boolean" ? data.isPeerReviewed : null,
        venue: cleanString(data.venue) ?? null,
        providerHealthSnapshot: data.providerHealthSnapshot ?? null,
        acceptedByUser:
          typeof data.acceptedByUser === "boolean" ? data.acceptedByUser : null,
        userDecision: cleanString(data.userDecision) ?? null,
        acceptedAs: cleanString(data.acceptedAs) ?? null,
        doi: cleanString(data.doi) ?? null,
        abstract: cleanString(data.abstract) ?? null,
        provider: cleanString(data.provider) ?? cleanString(data.sourceProvider) ?? null,
        relevanceScore: optionalScore(data.relevanceScore),
        sourceQualityScore: optionalScore(data.sourceQualityScore),
        finalScore: optionalScore(data.finalScore),
        year: typeof data.year === "number" ? data.year : null,
        usableSections: Array.isArray(data.usableSections)
          ? data.usableSections
              .map((item) => cleanString(item))
              .filter((item): item is string => Boolean(item))
          : [],
        citationText: cleanString(data.citationText) ?? "",
        limitation: cleanString(data.limitation) ?? null,
        derivation: cleanString(data.derivation) ?? null,
        evidenceGrounding: cleanString(data.evidenceGrounding) ?? null,
        summaryStructuredStatus: cleanString(data.summaryStructuredStatus) ?? null,
        llmSummaryStatus: cleanString(data.llmSummaryStatus) ?? null,
        safety:
          data.safety && typeof data.safety === "object"
            ? (data.safety as ReportWriterEvidenceCard["safety"])
            : undefined,
      };
    })
    .filter((card): card is ReportWriterEvidenceCard => Boolean(card));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeReportMode(value: unknown): ReportMode | null {
  return value === "short" || value === "standard" ? value : null;
}

export function normalizeGenerateReportRequest(body: unknown): ReportWriterInput | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const topic = cleanString(data.topic);
  const reportMode = normalizeReportMode(data.reportMode);
  const workflowId = cleanString(data.workflowId);
  const topicHash = cleanString(data.topicHash);
  const acceptedSources = normalizeAcceptedSources(data.acceptedSources);
  const acceptedSourceIds = normalizeStringList(data.acceptedSourceIds);
  const evidenceCards = normalizeEvidenceCards(data.evidenceCards);
  const evidenceCardIds = normalizeStringList(data.evidenceCardIds);
  const locale = cleanString(data.locale) ?? "zh-TW";
  if (
    !topic ||
    !reportMode ||
    !workflowId ||
    !topicHash ||
    acceptedSources.length < 1 ||
    acceptedSourceIds.length < 1
  ) {
    return null;
  }

  return {
    workflowId,
    jobId: cleanString(data.jobId),
    topicHash,
    topic,
    originalTopic: cleanString(data.originalTopic),
    displayTitle: cleanString(data.displayTitle),
    reportMode,
    reportType: cleanString(data.reportType),
    audience: cleanString(data.audience),
    language: cleanString(data.language),
    locale,
    generationMode: cleanString(data.generationMode),
    acceptedSources,
    acceptedSourceIds,
    evidenceCards,
    evidenceCardIds,
    academicSafetyReview: AcademicSafetyReviewSchema.safeParse(data.academicSafetyReview).success
      ? AcademicSafetyReviewSchema.parse(data.academicSafetyReview)
      : null,
  };
}

function sourceIdForGeneration(source: SourceRecord, index: number): string {
  return source.id || `source-${index + 1}`;
}

function workflowContextErrors(input: ReportWriterInput): string[] {
  const workflowId = input.workflowId?.trim();
  const topicHash = input.topicHash?.trim();
  const errors: string[] = [];
  if (!workflowId) errors.push("missing_workflow_id");
  if (!topicHash) errors.push("missing_topic_hash");
  if (!workflowId || !topicHash) return Array.from(new Set(errors));

  const acceptedSourceIds = new Set(
    input.acceptedSources.map((source, index) =>
      sourceIdForGeneration(source, index),
    ),
  );
  if (
    input.acceptedSources.some((source) => !source.workflowId?.trim())
  ) {
    errors.push("source_missing_workflow_id");
  }
  if (
    input.acceptedSources.some(
      (source) => source.workflowId?.trim() && source.workflowId !== workflowId,
    )
  ) {
    errors.push("source_workflow_mismatch");
  }
  if (input.acceptedSources.some((source) => !source.topicHash?.trim())) {
    errors.push("source_missing_topic_hash");
  }
  if (
    input.acceptedSources.some(
      (source) => source.topicHash?.trim() && source.topicHash !== topicHash,
    )
  ) {
    errors.push("source_topic_hash_mismatch");
  }
  if ((input.evidenceCards ?? []).some((card) => !acceptedSourceIds.has(card.sourceId))) {
    errors.push("evidence_card_unknown_source");
  }
  if ((input.evidenceCards ?? []).some((card) => card.workflowId !== workflowId)) {
    errors.push("evidence_card_workflow_mismatch");
  }
  if ((input.evidenceCards ?? []).some((card) => card.topicHash !== topicHash)) {
    errors.push("evidence_card_topic_hash_mismatch");
  }

  return Array.from(new Set(errors));
}

function expectedModel(): string {
  return expectedOpenAiModel();
}

function modelMatchesExpected(actualModel: string | null | undefined): boolean {
  if (!actualModel) return false;
  return actualModel.trim() === expectedModel();
}

function traceId(): string {
  try {
    return randomUUID();
  } catch {
    return `trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function promptHash(input: ReportWriterInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        topic: input.topic,
        reportMode: input.reportMode,
        acceptedSourceIds: input.acceptedSourceIds,
        evidenceCardIds: input.evidenceCards?.map((card) => card.id),
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

function errorMessage(code: GenerateReportErrorCode, details: GenerateReportErrorDetails): string {
  switch (code) {
    case "LLM_UNAVAILABLE":
      return details.requestedModel
        ? `目前 LLM provider 不可用：${details.requestedModel}。請檢查 SCHOOL_LLM_API_KEY、SCHOOL_LLM_BASE_URL、OPENAI_API_KEY 與 /api/llm/health、/api/llm/smoke。`
        : "LLM provider credentials 未設定，請檢查 /api/llm/health 與 /api/llm/smoke。";
    case "MODEL_MISSING":
      return "LLM provider is configured, but no model is set. Set SCHOOL_LLM_MODEL or OPENAI_MODEL.";
    case "FALLBACK_USED":
      return "目前生成流程使用 fallback，尚未接到 LLM provider，請確認 provider credentials 與 model 設定。";
    case "WRONG_MODEL":
      return "目前模型與設定不一致，請檢查 SCHOOL_LLM_MODEL、OPENAI_MODEL 與 model alias 設定。";
    case "INSUFFICIENT_ACCEPTED_SOURCES":
      return `目前沒有足夠可直接支撐正文的來源，請先審查候選來源或重新補查。目前已接受 ${details.acceptedSourcesCount} 筆，至少需 ${details.minRequiredSources} 筆可用來源才能生成研究報告。`;
    case "EVIDENCE_CARDS_REQUIRED":
      return "來源已接受，但尚未形成足夠證據卡，請回到來源管理重新產生或確認證據卡後再生成報告。";
    case "TOPIC_HASH_REQUIRED":
      return "主題識別碼遺失，請返回主題階段重新建立研究流程。";
    case "WORKFLOW_CONTEXT_REQUIRED":
      return "研究流程識別碼遺失，請返回主題階段重新建立研究流程。";
    case "WORKFLOW_CONTEXT_MISMATCH":
      return "報告生成 payload 內的 workflowId、topicHash、acceptedSources 或 evidenceCards 不一致，請重新搜尋並重新採用來源。";
    case "VALIDATION_ERROR":
      return "報告生成 payload 不完整，請確認 reportMode、acceptedSourceIds、acceptedSources 與 locale。";
    case "REPORT_WRITER_FAILED":
    default:
      return "報告生成器執行失敗，請檢查 LLM trace 與來源證據卡狀態。";
  }
}

function errorPayload(
  code: GenerateReportErrorCode,
  details: GenerateReportErrorDetails,
  generationTraceId: string,
  warning?: string | null,
) {
  return {
    ok: false,
    code,
    message: errorMessage(code, details),
    details,
    generationTraceId,
    ...(warning ? { warning: redactKnownSecrets(warning) } : {}),
  };
}

function logReportGeneration(input: {
  generationTraceId: string;
  workflowId?: string | null;
  topicHash?: string | null;
  jobId?: string | null;
  reportMode?: ReportMode | "blocked" | null;
  acceptedSourcesCount: number;
  evidenceCardsCount: number;
  minRequiredSources: number;
  llmAdapter?: string | null;
  requestedModel?: string | null;
  actualModel?: string | null;
  fallbackUsed: boolean;
  responseStatus: "success" | "failed";
  errorCode?: GenerateReportErrorCode | null;
  promptHash?: string | null;
  latencyMs?: number | null;
}): void {
  logger.info(
    {
      ...input,
      promptHash: input.promptHash ?? null,
    },
    "[report-generation] generationTraceId=%s workflowId=%s topicHash=%s jobId=%s reportMode=%s acceptedSourcesCount=%d evidenceCardsCount=%d minRequiredSources=%d llmAdapter=%s requestedModel=%s actualModel=%s fallbackUsed=%s responseStatus=%s errorCode=%s",
    input.generationTraceId,
    input.workflowId ?? "none",
    input.topicHash ?? "none",
    input.jobId ?? "none",
    input.reportMode ?? "unknown",
    input.acceptedSourcesCount,
    input.evidenceCardsCount,
    input.minRequiredSources,
    input.llmAdapter ?? "unknown",
    input.requestedModel ?? expectedModel(),
    input.actualModel ?? "unknown",
    String(input.fallbackUsed),
    input.responseStatus,
    input.errorCode ?? "none",
  );
}

export function createGenerateReportRouter({
  reportWriter = writeReportWithLlm,
  healthChecker = checkLlmHealth,
  smokeTester = runLlmSmokeTest,
}: GenerateReportRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/generate-report", async (req, res) => {
    const generationTraceId = traceId();
    const startedAt = Date.now();
    const normalized = normalizeGenerateReportRequest(req.body);
    if (!normalized) {
      const raw = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
      const acceptedSources = normalizeAcceptedSources(raw.acceptedSources);
      const evidenceCards = normalizeEvidenceCards(raw.evidenceCards);
      const readiness = getReportReadiness({
        acceptedSources,
        evidenceCards,
        reportMode: normalizeReportMode(raw.reportMode),
      });
      const details: GenerateReportErrorDetails = {
        reportMode: readiness.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        requestedModel: expectedModel(),
        actualModel: null,
        fallbackUsed: false,
      };
      const topicHash = cleanString(raw.topicHash);
      const workflowId = cleanString(raw.workflowId);
      const errorCode: GenerateReportErrorCode = !topicHash
        ? "TOPIC_HASH_REQUIRED"
        : !workflowId
          ? "WORKFLOW_CONTEXT_REQUIRED"
          : "VALIDATION_ERROR";
      const status = !topicHash
        ? "missing_topic_hash"
        : !workflowId
          ? "missing_workflow_id"
          : "invalid_input";
      logReportGeneration({
        generationTraceId,
        workflowId,
        topicHash,
        jobId: cleanString(raw.jobId),
        reportMode: readiness.reportMode,
        acceptedSourcesCount: details.acceptedSourcesCount,
        evidenceCardsCount: details.evidenceCardsCount,
        minRequiredSources: details.minRequiredSources,
        requestedModel: details.requestedModel,
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode,
        latencyMs: Date.now() - startedAt,
      });
      res.status(400).json({
        ...errorPayload(errorCode, details, generationTraceId),
        status,
      });
      return;
    }

    const readiness = getReportReadiness({
      acceptedSources: normalized.acceptedSources,
      evidenceCards: normalized.evidenceCards,
      reportMode: normalized.reportMode,
    });
    const baseDetails: GenerateReportErrorDetails = {
      reportMode: readiness.reportMode,
      acceptedSourcesCount: readiness.acceptedSourcesCount,
      evidenceCardsCount: readiness.evidenceCardsCount,
      minRequiredSources: readiness.minRequiredSources,
      requestedModel: expectedModel(),
      actualModel: null,
      fallbackUsed: false,
    };
    const contextErrors = workflowContextErrors(normalized);
    if (contextErrors.length > 0) {
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: normalized.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        requestedModel: expectedModel(),
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "WORKFLOW_CONTEXT_MISMATCH",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(400).json({
        ...errorPayload(
          "WORKFLOW_CONTEXT_MISMATCH",
          baseDetails,
          generationTraceId,
        ),
        status: "workflow_context_mismatch",
        contextErrors,
      });
      return;
    }
    if (readiness.badge === "缺少證據卡") {
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: readiness.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        requestedModel: expectedModel(),
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "EVIDENCE_CARDS_REQUIRED",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(400).json(
        errorPayload(
          "EVIDENCE_CARDS_REQUIRED",
          baseDetails,
          generationTraceId,
        ),
      );
      return;
    }
    if (!readiness.canGenerate || normalized.reportMode !== readiness.reportMode) {
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: readiness.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        requestedModel: expectedModel(),
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "INSUFFICIENT_ACCEPTED_SOURCES",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(400).json(
        errorPayload(
          "INSUFFICIENT_ACCEPTED_SOURCES",
          baseDetails,
          generationTraceId,
        ),
      );
      return;
    }

    if (readiness.evidenceCardsCount < 1) {
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: readiness.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        requestedModel: expectedModel(),
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "EVIDENCE_CARDS_REQUIRED",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(400).json(
        errorPayload(
          "EVIDENCE_CARDS_REQUIRED",
          baseDetails,
          generationTraceId,
        ),
      );
      return;
    }
    const health = await healthChecker();
    if (!health.modelConfigured) {
      const details = {
        ...baseDetails,
        requestedModel: null,
        actualModel: null,
        fallbackUsed: false,
      };
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: normalized.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        llmAdapter: health.provider,
        requestedModel: null,
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "MODEL_MISSING",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(503).json(
        errorPayload(
          "MODEL_MISSING",
          details,
          generationTraceId,
          health.errorMessage ??
            "LLM provider is configured, but no model is set. Set SCHOOL_LLM_MODEL or OPENAI_MODEL.",
        ),
      );
      return;
    }

    if (!health.ok || !health.apiKeyPresent) {
      const details = {
        ...baseDetails,
        requestedModel: health.resolvedModel || expectedModel(),
        actualModel: null,
        fallbackUsed: false,
      };
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: normalized.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        llmAdapter: health.provider,
        requestedModel: details.requestedModel,
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "LLM_UNAVAILABLE",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(503).json(
        errorPayload(
          "LLM_UNAVAILABLE",
          details,
          generationTraceId,
            health.errorMessage ??
            (!health.apiKeyPresent
              ? "LLM provider API key 未設定"
              : `目前模型不可用：${health.resolvedModel}`),
        ),
      );
      return;
    }

    const smoke = await smokeTester();
    if (!smoke.ok) {
      const details = {
        ...baseDetails,
        requestedModel: smoke.requestedModel || expectedModel(),
        actualModel: smoke.actualModel,
        fallbackUsed: false,
      };
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: normalized.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        llmAdapter: smoke.provider,
        requestedModel: details.requestedModel,
        actualModel: details.actualModel,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: smoke.status === "wrong_model" ? "WRONG_MODEL" : "LLM_UNAVAILABLE",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(503).json(
        errorPayload(
          smoke.status === "wrong_model" ? "WRONG_MODEL" : "LLM_UNAVAILABLE",
          details,
          generationTraceId,
          smoke.errorMessage ??
            (smoke.status === "wrong_model"
              ? `目前模型不可用：${smoke.requestedModel}`
              : "OpenAI smoke test failed"),
        ),
      );
      return;
    }

    try {
      const result = await reportWriter(normalized);
      const details: GenerateReportErrorDetails = {
        ...baseDetails,
        requestedModel: result.requestedModel ?? expectedModel(),
        actualModel: result.actualModel ?? result.reportGenerationModel ?? null,
        fallbackUsed: result.fallbackUsed || result.fallback_used,
      };
      const errorCode: GenerateReportErrorCode | null =
        details.fallbackUsed
          ? "FALLBACK_USED"
          : !modelMatchesExpected(details.actualModel)
            ? "WRONG_MODEL"
            : !result.ok
              ? result.status === "insufficient_sources"
                ? "EVIDENCE_CARDS_REQUIRED"
                : result.status === "unavailable"
                  ? "LLM_UNAVAILABLE"
                  : "REPORT_WRITER_FAILED"
              : null;
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: normalized.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        llmAdapter: result.adapter ?? result.reportGenerationProvider,
        requestedModel: details.requestedModel,
        actualModel: details.actualModel,
        fallbackUsed: details.fallbackUsed,
        responseStatus: errorCode ? "failed" : "success",
        errorCode,
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      if (errorCode) {
        res.status(errorCode === "WRONG_MODEL" || errorCode === "FALLBACK_USED" ? 503 : 500).json(
          errorPayload(errorCode, details, generationTraceId, result.warning),
        );
        return;
      }
      res.json({
        ...result,
        generationTraceId,
        reportMode: normalized.reportMode,
        requestedModel: details.requestedModel,
        actualModel: details.actualModel,
        fallbackUsed: false,
        fallback_used: false,
      });
    } catch (error) {
      const fallbackReason =
        error instanceof Error
          ? redactKnownSecrets(error.message)
          : "unknown report generation failure";
      logger.warn(
        {
          errName: error instanceof Error ? error.name : "UnknownError",
          errMessage: fallbackReason,
          route: "/api/generate-report",
          generationTraceId,
        },
        "Report generation failed",
      );
      const details: GenerateReportErrorDetails = {
        ...baseDetails,
        fallbackUsed: false,
      };
      logReportGeneration({
        generationTraceId,
        workflowId: normalized.workflowId,
        topicHash: normalized.topicHash,
        jobId: normalized.jobId,
        reportMode: normalized.reportMode,
        acceptedSourcesCount: readiness.acceptedSourcesCount,
        evidenceCardsCount: readiness.evidenceCardsCount,
        minRequiredSources: readiness.minRequiredSources,
        requestedModel: expectedModel(),
        actualModel: null,
        fallbackUsed: false,
        responseStatus: "failed",
        errorCode: "REPORT_WRITER_FAILED",
        promptHash: promptHash(normalized),
        latencyMs: Date.now() - startedAt,
      });
      res.status(500).json(
        errorPayload(
          "REPORT_WRITER_FAILED",
          details,
          generationTraceId,
          fallbackReason,
        ),
      );
    }
  });

  return router;
}

export default createGenerateReportRouter();
