import type {
  AcademicSafetyReview,
  GroundingEvidenceCard,
  GroundingJob,
  GroundingJobStatus,
  GroundingJobErrorCode,
  ResearchGroundingJobCreateRequest,
  ResearchGroundingJobCreateResponse,
  SourceCandidate,
} from "@workspace/api-zod/research-grounding";
import {
  GroundingJobErrorResponseSchema,
  GroundingJobSchema,
  ResearchGroundingJobCreateResponseSchema,
} from "@workspace/api-zod/research-grounding";
import type { EvidenceDerivation } from "@workspace/api-zod";
import { buildEvidenceCards, type EvidenceCard } from "./evidenceCards.ts";
import {
  canonicalSourceKeyForSource,
  defaultUsableSections,
  longestAbstractAlias,
  normalizeSourceForReview,
  sourceRecordKey,
  type SourceCategory,
  type SourceConfidence,
  type SourceRecord,
  type WorkflowReportSection,
} from "./sourceRecords.ts";

function apiUrl(path: string): string {
  const frontendEnv = import.meta.env ?? {};
  const base = frontendEnv.VITE_API_BASE_URL?.trim();
  if (!base && frontendEnv.PROD) {
    throw new ResearchGroundingApiError({
      code: "GROUNDING_JOB_CREATE_FAILED",
      message: "VITE_API_BASE_URL is not configured for this Preview deployment.",
      stage: "creation",
      retryable: false,
      status: 0,
    });
  }
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}${path}`;
}

export class ResearchGroundingApiError extends Error {
  readonly code: GroundingJobErrorCode | "GROUNDING_RESPONSE_SCHEMA_INVALID";
  readonly stage: "creation" | "polling";
  readonly retryable: boolean;
  readonly status: number;

  constructor(input: {
    code: GroundingJobErrorCode | "GROUNDING_RESPONSE_SCHEMA_INVALID";
    message: string;
    stage: "creation" | "polling";
    retryable: boolean;
    status: number;
  }) {
    super(input.message);
    this.name = "ResearchGroundingApiError";
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable;
    this.status = input.status;
  }
}

async function errorFromResponse(
  response: Response,
  stage: "creation" | "polling",
): Promise<ResearchGroundingApiError> {
  const body = await response.text();
  try {
    const parsed = GroundingJobErrorResponseSchema.safeParse(JSON.parse(body));
    if (parsed.success) {
      return new ResearchGroundingApiError({
        code: parsed.data.code,
        message: parsed.data.message,
        stage: parsed.data.stage === "pipeline" ? stage : parsed.data.stage,
        retryable: parsed.data.retryable,
        status: response.status,
      });
    }
  } catch {
    // A wrong Vercel rewrite can return HTML or an empty body. Keep the error
    // explicit instead of pretending that providers returned zero records.
  }
  return new ResearchGroundingApiError({
    code: stage === "creation" ? "GROUNDING_JOB_CREATE_FAILED" : "GROUNDING_JOB_POLL_FAILED",
    message: `Research grounding job ${stage === "creation" ? "creation" : "polling"} failed with HTTP ${response.status}.`,
    stage,
    retryable: response.status >= 500 || response.status === 429,
    status: response.status,
  });
}

async function parsedJsonResponse<T>(input: {
  response: Response;
  stage: "creation" | "polling";
  parse: (value: unknown) => { success: boolean; data?: T };
}): Promise<T> {
  let payload: unknown;
  try {
    payload = await input.response.json();
  } catch {
    throw new ResearchGroundingApiError({
      code: "GROUNDING_RESPONSE_SCHEMA_INVALID",
      message: "Research grounding API returned a non-JSON response.",
      stage: input.stage,
      retryable: false,
      status: input.response.status,
    });
  }
  const parsed = input.parse(payload);
  if (!parsed.success || parsed.data === undefined) {
    throw new ResearchGroundingApiError({
      code: "GROUNDING_RESPONSE_SCHEMA_INVALID",
      message: "Research grounding API returned an invalid response schema.",
      stage: input.stage,
      retryable: false,
      status: input.response.status,
    });
  }
  return parsed.data;
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sourceDomain(url: string | null | undefined): string {
  if (!url) return "來源待確認";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "來源待確認";
  }
}

function citationTextForSource(source: SourceRecord | null): string {
  if (!source) return "來源待確認";
  const author = source.authors[0]?.trim() || source.publisher?.trim() || "作者待確認";
  const year = source.year ?? "年份待確認";
  return `${author}（${year}）`;
}

function confidenceLabel(score: number): SourceConfidence {
  if (score >= 75) return "高";
  if (score >= 45) return "中";
  return "低";
}

function providerLabel(provider: SourceCandidate["provider"]): string {
  switch (provider) {
    case "openalex":
      return "OpenAlex";
    case "crossref":
      return "Crossref";
    case "core":
      return "CORE";
    case "semanticScholar":
      return "Semantic Scholar";
    case "manual":
      return "Manual";
    case "web":
    default:
      return "Web";
  }
}

function sourceTypeLabel(candidate: SourceCandidate): SourceRecord["sourceType"] {
  if (candidate.recommendationBucket === "official_background") return "Official Source";
  if (candidate.sourceType === "official") return "Official Source";
  if (candidate.sourceType === "web" || candidate.sourceType === "education") {
    return "Authoritative Media";
  }
  if (candidate.provider === "semanticScholar") return "Semantic Scholar";
  if (candidate.provider === "openalex") return "OpenAlex";
  return "Crossref";
}

function sourceCategory(
  sourceType: SourceCandidate["sourceType"],
): SourceCategory {
  switch (sourceType) {
    case "official":
      return "government_or_institution";
    case "web":
    case "education":
      return "news_or_web";
    case "review":
      return "journal_article";
    case "paper":
      return "academic_paper";
    case "unknown":
    default:
      return "unknown";
  }
}

function usableSectionsForCandidate(
  candidate: SourceCandidate,
): WorkflowReportSection[] {
  if (candidate.recommendationBucket === "official_background") {
    return ["研究背景"];
  }
  if (candidate.recommendationBucket === "scholarly_recommended") {
    return ["文獻探討", "結論"];
  }
  if (candidate.usableSections?.includes("analysis")) {
    return ["研究背景", "數據分析", "結論"];
  }
  if (candidate.reviewStatus === "accepted") {
    return ["研究背景", "文獻探討", "結論"];
  }
  return defaultUsableSections();
}

function evidenceGroundingForCandidate(
  candidate: SourceCandidate,
): SourceRecord["evidenceGrounding"] {
  return cleanText(candidate.abstractOriginal) ? "abstract_grounded" : "metadata_only";
}

function relevanceLevelForCandidate(
  candidate: SourceCandidate,
): SourceRecord["relevanceLevel"] {
  if (candidate.recommendationBucket === "rejected") return "off_topic";
  if (candidate.recommendationBucket === "official_background") return "secondary";
  if (candidate.confidenceTier === "fallback" || candidate.lowConfidence || candidate.needsReview) {
    return "clue";
  }
  if (candidate.reviewStatus === "accepted") return "primary";
  if (candidate.reviewStatus === "review") {
    const hasTraceableAcademicEvidence =
      (candidate.sourceType === "paper" || candidate.sourceType === "review") &&
      Boolean(cleanText(candidate.abstractOriginal)) &&
      (Boolean(cleanText(candidate.doi)) || Boolean(cleanText(candidate.url)));
    return candidate.relevanceScore >= 0.65 ||
      (hasTraceableAcademicEvidence && candidate.relevanceScore >= 0.35)
      ? "primary"
      : "secondary";
  }
  return "off_topic";
}

function topicalLabelForCandidate(
  candidate: SourceCandidate,
): SourceRecord["topicalRelevanceLabel"] {
  if (candidate.confidenceTier === "high") return "high";
  if (candidate.confidenceTier === "fallback") return "low";
  if (candidate.relevanceScore >= 0.75) return "high";
  if (candidate.relevanceScore >= 0.45) return "medium";
  if (candidate.relevanceScore >= 0.25) return "low";
  return "irrelevant";
}

function usageRecommendationForCandidate(
  candidate: SourceCandidate,
): SourceRecord["usageRecommendation"] {
  if (candidate.recommendationBucket === "official_background") return "secondary";
  if (candidate.recommendationBucket === "rejected") return "exclude";
  if (candidate.reviewStatus === "accepted") return "primary";
  if (candidate.confidenceTier === "fallback" || candidate.lowConfidence || candidate.needsReview)
    return "secondary";
  if (candidate.reviewStatus === "review") return "secondary";
  return "exclude";
}

function reviewStateForCandidate(
  candidate: SourceCandidate,
): SourceRecord["reviewState"] {
  switch (candidate.reviewStatus) {
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "review":
    default:
      return "pending";
  }
}

function toPercentage(score: number | undefined): number | null {
  return typeof score === "number" && Number.isFinite(score)
    ? Math.round(score * 1000) / 10
    : null;
}

function derivationFromGroundingCard(
  card: GroundingEvidenceCard,
  source: SourceRecord | null,
): EvidenceDerivation {
  if (card.source_access_level === "full_text") return "fulltext-derived";
  if (card.source_access_level === "abstract_only") return "abstract-derived";
  if (card.source_access_level === "metadata_only") return "metadata-derived";
  if (cleanText(card.supportedByText) && source?.abstract) return "abstract-derived";
  return "metadata-derived";
}

function workflowSectionsFromUsableFor(
  usableFor: string[],
): WorkflowReportSection[] {
  const sections = new Set<WorkflowReportSection>();
  for (const item of usableFor) {
    if (item === "introduction" || item === "background") sections.add("研究背景");
    if (item === "literature_review" || item === "review") sections.add("文獻探討");
    if (item === "discussion" || item === "policy") sections.add("結論");
  }
  return sections.size > 0 ? Array.from(sections) : defaultUsableSections();
}

export const GROUNDING_STATUS_LABELS: Record<GroundingJobStatus, string> = {
  queued: "正在建立研究任務",
  planning: "正在規劃研究任務",
  searching: "正在搜尋來源",
  evaluating_sources: "正在評估來源品質",
  searching_initial: "正在進行初始學術搜尋",
  searching_fallback: "系統正在改用更精確的學術查詢重新搜尋",
  academic_retrying: "正在延伸學術查詢並重新搜尋論文來源",
  rewriting_query: "正在改寫雙語查詢",
  topic_filtering: "正在分析主題",
  building_seed_queries: "正在建立基礎查詢",
  expanding_queries: "正在補強查詢詞",
  safety_reviewing: "正在檢查學術安全邊界",
  searching_metadata: "正在快速搜尋 metadata",
  searching_sources: "正在搜尋 OpenAlex / Crossref / CORE",
  showing_partial_candidates: "已找到候選來源，正在補齊 metadata",
  waiting_for_review: "來源較少，等待人工審查",
  source_review_ready: "來源已可審查",
  source_review_needs_manual: "學術來源不足，等待人工補充",
  ready_for_next_step: "來源已可進入下一階段",
  no_sources_after_fallback: "所有 fallback 後仍無來源",
  enriching_sources_background: "正在背景補強來源資訊",
  ready_for_review: "來源已可審查",
  no_results_after_expansion: "擴展查詢後仍未找到來源",
  scoring_sources: "正在評分來源",
  llm_enhancing: "正在使用模型整理",
  generation_ready: "已可生成報告",
  partial: "已取得部分結果",
  completed: "資料接地完成",
  failed: "資料接地失敗",
};

export async function createResearchGroundingJob(
  request: ResearchGroundingJobCreateRequest,
  signal?: AbortSignal,
): Promise<ResearchGroundingJobCreateResponse> {
  const response = await fetch(apiUrl("/api/research-grounding-jobs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    throw await errorFromResponse(response, "creation");
  }
  return parsedJsonResponse({
    response,
    stage: "creation",
    parse: ResearchGroundingJobCreateResponseSchema.safeParse,
  });
}

export async function fetchResearchGroundingJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<GroundingJob> {
  const response = await fetch(apiUrl(`/api/research-grounding-jobs/${encodeURIComponent(jobId)}`), {
    signal,
  });
  if (!response.ok) {
    throw await errorFromResponse(response, "polling");
  }
  return parsedJsonResponse({
    response,
    stage: "polling",
    parse: GroundingJobSchema.safeParse,
  });
}

export function sourceCandidateToSourceRecord(input: {
  candidate: SourceCandidate;
  workflowId: string;
  topicHash: string;
  queryPlanHash: string;
  originalTopic: string;
}): SourceRecord {
  const { candidate } = input;
  const finalScore = toPercentage(candidate.relevanceScore);
  const qualityScore = toPercentage(candidate.sourceQualityScore);
  const queryUsed = cleanText(candidate.queryUsed) ?? input.originalTopic;
  const abstractOriginal = longestAbstractAlias(candidate);
  const abstractZh = cleanText(candidate.abstractZh);
  const reviewState = reviewStateForCandidate(candidate);

  return normalizeSourceForReview({
    id: candidate.sourceId,
    title: candidate.title,
    authors: candidate.authors ?? [],
    year: candidate.year ?? null,
    abstract: abstractOriginal,
    doi: candidate.doi ?? null,
    url: candidate.url ?? candidate.fullTextUrl ?? null,
    sourceType: sourceTypeLabel(candidate),
    reviewState,
    publisher: providerLabel(candidate.provider),
    containerTitle: candidate.venue ?? null,
    accessedAt: candidate.retrievedAt,
    provider: providerLabel(candidate.provider),
    queryUsed,
    retrievedAt: candidate.retrievedAt,
    dedupeKey: candidate.canonicalSourceIdentity ?? candidate.dedupeKey,
    canonicalSourceIdentity: candidate.canonicalSourceIdentity ?? candidate.dedupeKey,
    providerIds: candidate.providerIds ?? null,
    contentLevel: candidate.contentLevel ?? null,
    enrichmentAttempted: candidate.enrichmentAttempted ?? null,
    enrichmentProviders: candidate.enrichmentProviders ?? null,
    enrichmentStatus: candidate.enrichmentStatus ?? null,
    enrichmentFailureReason: candidate.enrichmentFailureReason ?? null,
    enrichmentProvenance: candidate.enrichmentProvenance ?? null,
    enrichedAt: candidate.enrichedAt ?? null,
    language: candidate.language ?? null,
    sourceKind:
      candidate.sourceType === "official" || candidate.sourceType === "web"
        ? "web"
        : "journal",
    citationCount: candidate.citationCount ?? null,
    isOpenAccess: candidate.isOpenAccess ?? null,
    accessLevel: candidate.accessLevel ?? null,
    fullTextUrl: candidate.fullTextUrl ?? null,
    readableUrl: candidate.readableUrl ?? null,
    extractionStatus: candidate.extractionStatus ?? null,
    extractionMethod: candidate.extractionMethod ?? null,
    extractionMode: candidate.extractionMode ?? null,
    pageCount: candidate.pageCount ?? null,
    extractedPageCount: candidate.extractedPageCount ?? null,
    isScanned: candidate.isScanned ?? null,
    failureReason: candidate.failureReason ?? null,
    userFacingMessage: candidate.userFacingMessage ?? null,
    canUseForClaims: candidate.canUseForClaims ?? null,
    canUseForReport: candidate.canUseForReport ?? null,
    toolVersions: candidate.toolVersions ?? null,
    processingStartedAt: candidate.processingStartedAt ?? null,
    processingEndedAt: candidate.processingEndedAt ?? null,
    qualityFlags: candidate.qualityFlags ?? null,
    fullTextCharCount: candidate.fullTextCharCount ?? null,
    extractedAbstract: candidate.extractedAbstract ?? null,
    extractedSections: candidate.extractedSections ?? null,
    extractedChunks: candidate.extractedChunks ?? null,
    extractionWarnings: candidate.extractionWarnings ?? null,
    claimExtractionStatus: candidate.claimExtractionStatus ?? null,
    claimExtractionMode: candidate.claimExtractionMode ?? null,
    claimCount: candidate.claimCount ?? null,
    acceptedClaimCount: candidate.acceptedClaimCount ?? null,
    acceptedEvidenceCardCount: candidate.acceptedEvidenceCardCount ?? null,
    claimExtractionWarnings: candidate.claimExtractionWarnings ?? null,
    contentHash: candidate.contentHash ?? null,
    sourceUseLevel: candidate.sourceUseLevel ?? null,
    isPeerReviewed:
      candidate.isPeerReviewed ??
      (candidate.sourceType === "paper" || candidate.sourceType === "review"),
    sourceQualityScore: qualityScore,
    scoreReasons: [
      `provider=${candidate.provider}`,
      `retrievalMode=${candidate.retrievalMode}`,
      `recommendationBucket=${candidate.recommendationBucket}`,
      `sourceRole=${candidate.sourceRole}`,
      `queryIntent=${candidate.queryIntent}`,
      ...(candidate.confidenceTier ? [`confidenceTier=${candidate.confidenceTier}`] : []),
      ...(candidate.matchedConcepts?.length
        ? [`matchedConcepts=${candidate.matchedConcepts.join(",")}`]
        : []),
      ...(candidate.matchedFields?.length
        ? [`matchedFields=${candidate.matchedFields.join(",")}`]
        : []),
      ...(candidate.acceptReason ? [`acceptReason=${candidate.acceptReason}`] : []),
    ],
    topicalRelevanceScore: finalScore,
    topicalRelevanceLabel: topicalLabelForCandidate(candidate),
    evidenceSufficiency:
      candidate.accessLevel === "full_text"
        ? "strong"
        : abstractOriginal || candidate.accessLevel === "abstract_only"
          ? "moderate"
          : "insufficient",
    usableAsPrimaryEvidence: candidate.reviewStatus === "accepted" && Boolean(abstractOriginal),
    usableAsSecondaryEvidence: candidate.reviewStatus !== "rejected",
    usageRecommendation: usageRecommendationForCandidate(candidate),
    qualityWarnings: [
      ...candidate.limitations,
      ...(candidate.rejectionReason ? [candidate.rejectionReason] : []),
      ...(abstractOriginal ? [] : ["此來源目前只有書目層級資料，尚未取得摘要。"]),
    ],
    sourceCategory: sourceCategory(candidate.sourceType),
    usableSections: usableSectionsForCandidate(candidate),
    confidence: confidenceLabel(finalScore ?? 0),
    reviewNotes:
      candidate.reviewStatus === "rejected"
        ? "此來源在 grounding job 中被降為不建議採用。"
        : candidate.recommendationBucket === "official_background"
          ? "此來源是官方背景來源，可用於研究背景、概念說明或官方資料脈絡；不應視為 peer-reviewed scholarly article。"
        : candidate.recommendationBucket === "manual_review"
          ? "此來源需人工確認用途；預設不直接進入正式段落。"
        : candidate.confidenceTier === "fallback" || candidate.lowConfidence || candidate.needsReview
          ? "此來源屬於待人工審查來源，可手動接受，但正式引用前需確認主題關聯。"
        : "此來源由 research grounding job 產生，可在來源管理階段再調整。",
    relevanceLevel: relevanceLevelForCandidate(candidate),
    relevanceScore: finalScore,
    relevanceReasons: [
      `queryUsed=${queryUsed}`,
      `provider=${providerLabel(candidate.provider)}`,
      `reviewStatus=${candidate.reviewStatus}`,
    ],
    matchedCoreConcepts: candidate.matchedConcepts ?? [],
    matchedFacets: candidate.matchedFields ?? [],
    evidenceGrounding:
      candidate.evidenceGrounding ?? evidenceGroundingForCandidate(candidate),
    sourceRelevanceReasonZhTw:
      candidate.reviewStatus === "accepted"
        ? "此來源已通過 grounding job 初步評分，可直接進入證據整理。"
        : candidate.confidenceTier === "fallback" || candidate.lowConfidence || candidate.needsReview
          ? "此來源為低信心待人工審查候選；若確認與主題相關，可以手動接受。"
        : candidate.reviewStatus === "review"
          ? "此來源與主題相關，但仍建議人工確認是否納入正式報告。"
          : "此來源與主題關聯不足，預設不納入證據卡。",
    shouldShowInMainList:
      candidate.reviewStatus !== "rejected" &&
      !(candidate.confidenceTier === "fallback" || candidate.lowConfidence || candidate.needsReview),
    shouldRecommendAccept: candidate.reviewStatus === "accepted",
    readableSummaryZhTW: abstractZh ?? abstractOriginal,
    readableSummaryZhTw: abstractZh ?? abstractOriginal,
    summarySourceType:
      candidate.accessLevel === "full_text"
        ? "fulltext"
        : abstractOriginal || candidate.accessLevel === "abstract_only"
          ? "abstract"
          : "metadataFallback",
    summaryConfidence:
      candidate.accessLevel === "full_text"
        ? "high"
        : abstractOriginal || candidate.accessLevel === "abstract_only"
          ? "medium"
          : "low",
    originalAbstract: abstractOriginal,
    abstractOriginal,
    abstractZhTw: abstractZh,
    workflowId: input.workflowId,
    topic: input.originalTopic,
    normalizedTopic: input.originalTopic,
    topicHash: input.topicHash,
    queryPlanHash: input.queryPlanHash,
    finalScore,
    classification:
      reviewState === "accepted"
        ? "primary"
        : reviewState === "pending"
          ? "review"
          : "off_topic",
    rejectReason: candidate.rejectionReason ?? null,
    isMetadataOnly: !abstractOriginal,
    isPrimaryEvidence: candidate.reviewStatus === "accepted",
    rejectionReason: candidate.rejectionReason ?? null,
    recommendationBucket: candidate.recommendationBucket,
    sourceRole: candidate.sourceRole,
    retrievalMode: candidate.retrievalMode,
    institutionType: candidate.institutionType ?? null,
    evidencePoints: candidate.evidencePoints,
    providerHealthSnapshot: candidate.providerHealthSnapshot ?? null,
    acceptedByUser: candidate.acceptedByUser ?? null,
    userDecision: candidate.userDecision ?? null,
    acceptedAs: candidate.acceptedAs ?? null,
    lowConfidence: candidate.lowConfidence ?? null,
    needsReview: candidate.needsReview ?? null,
  } satisfies SourceRecord);
}

export function queryPlanHashFromJob(job: Pick<GroundingJob, "topicHash" | "queryPlan">): string {
  const queries = [
    ...(job.queryPlan?.primaryQueries ?? []),
    ...(job.queryPlan?.secondaryQueries ?? []),
  ]
    .map((query) => query.trim())
    .filter(Boolean)
    .join("|");
  return queries || job.topicHash;
}

export function groundingJobToSourceRecords(
  job: GroundingJob,
): SourceRecord[] {
  const queryPlanHash = queryPlanHashFromJob(job);
  const canonicalCandidates = [
    ...(job.candidateSources ?? job.highConfidenceCandidateSources ?? []),
    ...(job.fallbackReviewSources ?? []),
  ];
  const legacyCandidates =
    canonicalCandidates.length > 0 ? canonicalCandidates : job.sourceCandidates ?? [];
  if (legacyCandidates.length === 0) {
    const legacySources = (job as GroundingJob & { sources?: SourceRecord[] }).sources;
    if (Array.isArray(legacySources) && legacySources.length > 0) {
      return legacySources.map(normalizeSourceForReview);
    }
  }
  return legacyCandidates.map((candidate) =>
    sourceCandidateToSourceRecord({
      candidate,
      workflowId: job.workflowId,
      topicHash: job.topicHash,
      queryPlanHash,
      originalTopic: job.originalTopic,
    }),
  );
}

export function groundingJobSourceContractMismatch(job: GroundingJob): string | null {
  if (Array.isArray(job.candidateSources)) return null;
  if (Array.isArray(job.sourceCandidates)) return "legacy_sourceCandidates_alias";
  const legacySources = (job as GroundingJob & { sources?: SourceRecord[] }).sources;
  if (Array.isArray(legacySources)) return "legacy_sources_mapping";
  return "missing_canonical_candidateSources";
}

export function groundingEvidenceCardToEvidenceCard(input: {
  card: GroundingEvidenceCard;
  source: SourceRecord | null;
}): EvidenceCard {
  const { card, source } = input;
  const metadataAuthors = Array.isArray(card.sourceMetadata?.authors)
    ? card.sourceMetadata.authors.filter(
        (author): author is string => typeof author === "string" && Boolean(author.trim()),
      )
    : [];
  const safety = card.safety ?? {
    containsActionableHarm: false,
    redactionApplied: false,
    safeSummaryMode: "none" as const,
    safetyNotes: [],
  };
  const supportedByText = cleanText(card.supportedByText) ?? card.claimTextZh;
  const supportSpan = cleanText(card.supportSpan) ?? supportedByText;
  const safeEvidenceText = safety.redactionApplied ? card.claimTextZh : supportedByText;
  const derivation = derivationFromGroundingCard(card, source);
  const sourceQualityScore = source?.sourceQualityScore ?? null;
  const relevanceScore = source?.relevanceScore ?? null;
  const finalScore = source?.finalScore ?? relevanceScore;
  const confidenceScore = Math.max(0, Math.min(1, card.confidence));
  const canonicalSourceKey = card.canonicalSourceKey ??
    card.dedupeKey ??
    (source ? canonicalSourceKeyForSource(source) : card.sourceId);

  return {
    id: card.evidenceId,
    evidenceId: card.evidenceId,
    evidenceCardId: card.evidenceCardId ?? card.evidenceId,
    workflowId: card.workflowId,
    topicHash: card.topicHash,
    sourceId: card.sourceId,
    canonicalSourceKey,
    dedupeKey: canonicalSourceKey,
    citationKey: card.citationKey ?? canonicalSourceKey,
    claimIds: card.claimIds ?? [],
    claimTextOriginal: card.claimTextOriginal,
    claimText: card.claimText ?? card.claimTextZh,
    claimTextZh: card.claimTextZh,
    supportedByText,
    supportSpan,
    supportStart: card.supportStart,
    supportEnd: card.supportEnd,
    citationMarker: card.citationMarker,
    title: card.sourceTitle,
    sourceType: source?.sourceType ?? "grounded-source",
    reliability: confidenceLabel(Math.round(confidenceScore * 100)),
    claim: card.claimTextZh,
    claimTextZhTw: card.claimTextZh,
    mainClaimZhTw: card.mainClaimZhTw ?? card.claimTextZh,
    mainClaim: card.claimTextZh,
    evidence: safety.redactionApplied ? safeEvidenceText : supportSpan,
    evidencePointZhTw: safety.redactionApplied ? safeEvidenceText : supportSpan,
    usableEvidence: safety.redactionApplied ? safeEvidenceText : supportSpan,
    quoteOrParaphrase: safety.redactionApplied ? safeEvidenceText : supportSpan,
    summary: card.claimTextZh,
    sourceExcerptOriginal: safety.redactionApplied ? "" : supportedByText,
    sourceSummaryZhTw: card.claimTextZh,
    supportingClaims: card.supportingClaims ?? [],
    supportSpans: card.supportSpans ?? [
      {
        text: supportSpan,
        startOffset: card.supportStart,
        endOffset: card.supportEnd,
      },
    ],
    relevance: "source-grounded",
    limitations: card.limitations,
    limitationsZhTw: card.limitations,
    sectionTargets: card.usableFor,
    sectionFit: card.sectionFit ?? card.usableFor,
    sourceTitle: card.sourceTitle,
    authors: source?.authors ?? metadataAuthors,
    sourceUrl: source?.url ?? card.sourceUri,
    sourceDomain: sourceDomain(source?.url ?? card.sourceUri),
    sourceProvider: source?.provider ?? "Research Grounding",
    sourceMetadata: card.sourceMetadata ?? null,
    sourceAccessLevel: card.source_access_level ?? source?.accessLevel ?? null,
    extractionStatus: card.extractionStatus ?? source?.extractionStatus ?? null,
    evidenceType: card.evidence_type ?? null,
    sourceLocation: card.source_location ?? null,
    sectionHeading: card.section_heading ?? null,
    extractionMethod: card.extractionMethod ?? card.trace?.extraction_method ?? source?.extractionMethod ?? null,
    quotedText: card.quoted_text ?? supportedByText,
    trace: card.trace ?? null,
    sourceCategory: source?.sourceCategory ?? null,
    recommendationBucket: card.recommendationBucket ?? source?.recommendationBucket ?? null,
    sourceRole: card.sourceRole ?? source?.sourceRole ?? null,
    retrievalMode: card.retrievalMode ?? source?.retrievalMode ?? null,
    isPeerReviewed: card.isPeerReviewed ?? source?.isPeerReviewed ?? null,
    venue: card.venue ?? source?.containerTitle ?? null,
    providerHealthSnapshot: card.providerHealthSnapshot ?? source?.providerHealthSnapshot ?? null,
    acceptedByUser: card.acceptedByUser ?? source?.acceptedByUser ?? null,
    userDecision: card.userDecision ?? source?.userDecision ?? null,
    acceptedAs: card.acceptedAs ?? source?.acceptedAs ?? null,
    doi: source?.doi ?? null,
    abstract: source?.abstract ?? null,
    provider: source?.provider ?? "Research Grounding",
    relevanceScore: card.topicRelevance ?? relevanceScore,
    topicRelevance: card.topicRelevance ?? relevanceScore,
    sourceQualityScore: card.sourceQuality ?? sourceQualityScore,
    sourceQuality: card.sourceQuality ?? sourceQualityScore,
    finalScore,
    year: source?.year ?? null,
    usableSections: workflowSectionsFromUsableFor(card.usableFor),
    confidence: confidenceLabel(Math.round(confidenceScore * 100)),
    confidenceScore: card.groundingConfidence ?? confidenceScore,
    groundingConfidence: card.groundingConfidence ?? confidenceScore,
    derivation,
    abstractOnly: derivation !== "fulltext-derived",
    limitation: card.limitations[0] ?? null,
    citationText: citationTextForSource(source),
    pageOrLocation:
      typeof card.span?.page === "number"
        ? `p.${card.span.page}`
        : card.source_location
          ? card.source_location
        : card.span?.start != null || card.span?.end != null
          ? "span"
          : "grounding",
    createdAt: card.createdAt,
    extractedAt: card.extractedAt ?? card.createdAt,
    notes: safety.safetyNotes.join("；"),
    safety,
    needsManualReview: card.needsManualReview ?? null,
    needsReview: card.needsReview ?? card.needsManualReview ?? null,
    rejectionReason: card.rejectionReason ?? null,
    governanceFlags: card.governanceFlags ?? [],
  };
}

export function groundedEvidenceCardsForAcceptedSources(input: {
  acceptedSources: SourceRecord[];
  groundingEvidenceCards: GroundingEvidenceCard[];
  topic?: string;
}): EvidenceCard[] {
  const sourceById = new Map(
    input.acceptedSources.flatMap((source) =>
      [source.id, source.canonicalSourceIdentity, source.dedupeKey, sourceRecordKey(source)]
        .filter((value): value is string => Boolean(value))
        .map((value) => [value, source] as const),
    ),
  );
  const groundedCards = input.groundingEvidenceCards
    .filter((card) =>
      [card.sourceId, card.canonicalSourceKey, card.dedupeKey, card.citationKey]
        .filter((value): value is string => Boolean(value))
        .some((key) => sourceById.has(key)),
    )
    .map((card) =>
      groundingEvidenceCardToEvidenceCard({
        card,
        source:
          [card.sourceId, card.canonicalSourceKey, card.dedupeKey, card.citationKey]
            .filter((value): value is string => Boolean(value))
            .map((key) => sourceById.get(key))
            .find((source): source is SourceRecord => Boolean(source)) ?? null,
      }),
    );
  return groundedCards;
}

export function reportEvidenceCardsForAcceptedSources(input: {
  acceptedSources: SourceRecord[];
  groundingEvidenceCards: GroundingEvidenceCard[];
  topic?: string;
}): EvidenceCard[] {
  const canonicalCards = groundedEvidenceCardsForAcceptedSources(input);
  const canonicalSourceIds = new Set(
    canonicalCards.flatMap((card) =>
      [card.sourceId, card.canonicalSourceKey, card.dedupeKey, card.citationKey]
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const sourcesMissingCanonicalEvidence = input.acceptedSources.filter(
    (source) =>
      ![source.id, source.canonicalSourceIdentity, source.dedupeKey, sourceRecordKey(source)]
        .filter((value): value is string => Boolean(value))
        .some((key) => canonicalSourceIds.has(key)),
  );
  const sourceById = new Map(
    sourcesMissingCanonicalEvidence.flatMap((source) =>
      [source.id, source.canonicalSourceIdentity, source.dedupeKey, sourceRecordKey(source)]
        .filter((value): value is string => Boolean(value))
        .map((value) => [value, source] as const),
    ),
  );
  const fallbackCards = buildEvidenceCards(
    sourcesMissingCanonicalEvidence,
    [],
    { topic: input.topic },
  ).filter((card) => {
    if (card.derivation === "metadata-derived") {
      return Boolean(
        card.sourceTitle.trim() &&
          (card.doi?.trim() || card.sourceUrl?.trim()) &&
          card.provider.trim(),
      );
    }
    const supportSpan = card.supportSpan?.trim();
    const source = sourceById.get(card.sourceId);
    if (!supportSpan || !source) return false;
    const sourceSupportTexts = [
      source.originalAbstract,
      source.abstractOriginal,
      source.originalSnippet,
      source.snippet,
      source.abstract,
      ...(source.sourceFacts ?? []).map((fact) => fact.supportedByText),
    ]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean);
    return sourceSupportTexts.some((text) => text.includes(supportSpan));
  });
  return [...canonicalCards, ...fallbackCards];
}

export function academicSafetyBlocksReport(
  review: AcademicSafetyReview | null | undefined,
): boolean {
  return review?.allowedUse === "block_actionable_output";
}
