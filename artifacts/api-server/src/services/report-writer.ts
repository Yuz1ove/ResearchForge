/**
 * AI assistance disclosure: Portions of this evidence-bound report writer were
 * drafted or refactored with Replit Agent and OpenAI Codex. See
 * /AI_ASSISTANCE.md for scope and verification details.
 */
import type { ReportMode } from "@workspace/api-zod";
import { sourceRecordKey, type SourceRecord } from "@workspace/api-zod/source-record";
import type {
  AcademicSafetyReview,
  EvidenceCardSafety,
  ReportParagraphPlan,
  ReportPlan,
  ReportPlannedClaim,
  ReportReadinessStatus,
  WriterEvidenceSet,
} from "@workspace/api-zod";
import {
  canUseEvidenceCardForSection,
  evidenceSectionSupportsScholarlyClaim,
  type EvidenceRecommendationBucket,
  type EvidenceSectionType,
  type EvidenceUserDecision,
} from "@workspace/api-zod/evidence-governance";
import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
import { logger } from "../lib/logger";
import { resolvePrivateLlmProviderConfig } from "../config/llm-provider-config";
import {
  LlmAdapterError,
  DEFAULT_OPENAI_MODEL,
  resolveOpenAiModelAlias,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";
import {
  logLlmFallback,
  messageFromStatus,
  providerLabel,
  requestLlmText,
  statusFromLlmError,
} from "./llm-service";
import { understandTopicHeuristically } from "./topic-understanding";
import { normalizeEvidenceSectionFits } from "./report-section-fit";
import {
  canonicalCitationMarker as canonicalInlineCitationMarker,
  canonicalizeCitationMarkersInText,
  extractCanonicalCitationMarkers,
} from "./citation-markers";
import {
  firstReportFragment,
  normalizeReportSectionProse,
  reportSectionParagraphs,
  uniqueReportFragments,
} from "./report-prose-structure";

export interface ReportWriterInput {
  workflowId?: string;
  jobId?: string;
  topicHash?: string;
  topic: string;
  originalTopic?: string;
  displayTitle?: string;
  reportMode?: ReportMode;
  reportType?: string;
  audience?: string;
  language?: string;
  locale?: string;
  writingStyle?: string;
  requestedLength?: string;
  targetWordCount?: string;
  specifiedStructure?: string;
  rubric?: string;
  generationMode?: "preliminary" | "formal" | string;
  sourceMixProfile?: string;
  acceptedSources: SourceRecord[];
  acceptedSourceIds?: string[];
  evidenceCards?: ReportWriterEvidenceCard[];
  evidenceCardIds?: string[];
  academicSafetyReview?: AcademicSafetyReview | null;
  requestedSectionIds?: string[];
  reportPlan?: ReportPlan;
  reportPlanStatus?: ReportWriterPlanStatus;
  reportPlanDiagnostics?: string[];
  writerEvidenceSet?: WriterEvidenceSet;
  evidenceSetHash?: string;
  readinessStatus?: ReportReadinessStatus;
}

export type ReportWriterPlanStatus =
  | "plan_built"
  | "complete"
  | "filtered"
  | "degraded_legacy";

export interface ReportWriterSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
  coverageStatus?: "sufficient" | "weak" | "insufficient";
  groundingStatus?: "grounded" | "partially_grounded" | "unsupported";
  unsupportedSentences?: string[];
  generationMethod?: string;
  paragraphClaims?: ReportWriterParagraphClaim[];
  warnings?: string[];
}

export interface ReportWriterParagraphClaim {
  paragraphId: string;
  sectionId: string;
  claimIds: string[];
  evidenceCardIds: string[];
  citationMarkers: string[];
  generatedTextZhTw: string;
  unsupportedSentences: string[];
}

export interface ReportWriterSectionPlan {
  sectionId: string;
  title: string;
  paragraphPurpose: string;
  plannedClaims: string[];
  plannedClaimIds: string[];
  allowedCitationKeys: string[];
  evidenceCardIds: string[];
  conflictingEvidenceCardIds: string[];
  evidenceLevel: "full_text" | "abstract" | "mixed" | "metadata_limited";
  targetWordCount: number;
  supportLevel: "strong" | "partial" | "limited";
  hasSufficientEvidence: boolean;
  needsMoreEvidence: boolean;
  evidenceGaps: string[];
  uncertaintyOrLimitations: string[];
}

export interface ReportWriterEvidenceCard {
  id: string;
  sourceId: string;
  canonicalSourceKey?: string;
  dedupeKey?: string;
  citationKey?: string;
  evidenceId?: string;
  evidenceCardId?: string;
  claimIds?: string[];
  workflowId?: string | null;
  topicHash?: string | null;
  claimTextOriginal?: string;
  claimText?: string;
  claimTextZh?: string;
  supportedByText?: string;
  supportSpan?: string;
  supportStart?: number;
  supportEnd?: number;
  title?: string;
  claim: string;
  claimTextZhTw?: string;
  evidence: string;
  mainClaimZhTw?: string;
  evidencePointZhTw?: string;
  summary: string;
  supportingClaims?: unknown[];
  supportSpans?: Array<{
    claimId?: string;
    text?: string;
    startOffset?: number;
    endOffset?: number;
    pageStart?: number;
    pageEnd?: number;
    sectionHeading?: string;
  }>;
  citationMarker?: string | null;
  sourceSummaryZhTw?: string;
  relevance: string;
  sourceType?: string;
  reliability?: string;
  mainClaim?: string;
  usableEvidence?: string;
  limitations?: string[];
  limitationsZhTw?: string[];
  sectionTargets?: string[];
  sectionFit?: string[];
  sourceTitle: string;
  sourceProvider: string;
  sourceAccessLevel?: string | null;
  source_access_level?: string | null;
  extractionStatus?: string | null;
  evidenceType?: string | null;
  evidence_type?: string | null;
  quotedText?: string | null;
  quoted_text?: string | null;
  sourceLocation?: string | null;
  source_location?: string | null;
  sectionHeading?: string | null;
  section_heading?: string | null;
  page?: number | null;
  trace?: {
    provider?: string;
    query_used?: string;
    url?: string;
    doi?: string;
    extraction_method?: string;
    content_hash?: string;
  } | null;
  recommendationBucket?: EvidenceRecommendationBucket | null;
  sourceRole?: string | null;
  retrievalMode?: string | null;
  isPeerReviewed?: boolean | null;
  venue?: string | null;
  providerHealthSnapshot?: unknown | null;
  acceptedByUser?: boolean | null;
  userDecision?: EvidenceUserDecision | string | null;
  acceptedAs?: string | null;
  doi?: string | null;
  abstract?: string | null;
  provider?: string | null;
  relevanceScore?: number | null;
  topicRelevance?: number | null;
  sourceQualityScore?: number | null;
  sourceQuality?: number | null;
  groundingConfidence?: number | null;
  finalScore?: number | null;
  year: number | null;
  usableSections: string[];
  citationText: string;
  limitation: string | null;
  derivation?: string | null;
  evidenceGrounding?: string | null;
  summaryStructuredStatus?: string | null;
  llmSummaryStatus?: string | null;
  safety?: EvidenceCardSafety;
  needsManualReview?: boolean | null;
  needsReview?: boolean | null;
  extractionMethod?: "llm_structured_extract" | "rule_fallback_claim_extraction" | "manual_review" | string | null;
  rejectionReason?: string | null;
  extractedAt?: string | null;
  governanceFlags?: string[];
  sourceMetadata?: Record<string, unknown> | null;
  location?: string | null;
  researchSetting?: string | null;
  studyDesign?: string | null;
  dataScope?: string | null;
  exposure?: string | null;
  outcome?: string | null;
  exactResult?: string | null;
  numericResult?: string | null;
  applicability?: string | null;
  locator?: string | null;
  directness?: "A" | "B" | "C" | "D" | null;
  evidenceDirectnessTier?: "A" | "B" | "C" | "D" | null;
}

export interface ReportWriterResult {
  ok: boolean;
  status: LlmStructuredStatus;
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  model?: string;
  message: string | null;
  warning: string | null;
  sectionPlan?: ReportWriterSectionPlan[];
  sections: ReportWriterSection[];
  reportGenerationProvider: string;
  reportGenerationModel: string | null;
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  fallbackReason: string | null;
  adapter?: string;
  requestedModel?: string;
  actualModel?: string | null;
  generationTraceId?: string;
  reportMode?: ReportMode;
  evidenceSetHash?: string;
  readinessStatus?: ReportReadinessStatus;
  reportPlan?: ReportPlan;
  reportPlanStatus?: ReportWriterPlanStatus;
  reportPlanDiagnostics?: string[];
  writerDiagnostics?: ReportWriterDiagnostics;
}

export interface ReportWriterDiagnostics {
  requestedSections: number;
  completedSections: number;
  modelCompletedSections: number;
  repairedSections: number;
  fallbackSections: number;
  completedSectionIds: string[];
  repairedSectionIds: string[];
  fallbackSectionIds: string[];
  failureReasons: Record<string, string>;
  editorialPass?: {
    status: "applied" | "rejected" | "failed" | "skipped";
    provider: string | null;
    model: string | null;
    issues: string[];
  };
  postEditValidation?: {
    status: "pass" | "blocked";
    issues: string[];
  };
}

export interface ReportWriterOptions {
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

const SECTION_PLAN = [
  {
    sectionId: "abstract",
    title: "摘要",
    instruction: "用 2 個簡短自然段落分別說明研究主題與來源基礎，以及主要方向與證據邊界。",
  },
  {
    sectionId: "introduction",
    title: "一、研究背景與動機",
    instruction: "說明為什麼此主題值得研究，並界定討論範圍。",
  },
  {
    sectionId: "research_question",
    title: "二、研究問題",
    instruction: "提出可由已接受來源支撐的研究問題，不可超出資料基礎。",
  },
  {
    sectionId: "literature_review",
    title: "三、文獻探討",
    instruction: "整合已接受來源的共同觀點，避免逐張來源卡貼上。",
  },
  {
    sectionId: "methodology",
    title: "四、研究方法",
    instruction: "說明資料來源、篩選方式、證據使用原則與方法限制。",
  },
  {
    sectionId: "findings",
    title: "五、主要發現",
    instruction: "用正式報告口吻整理可由來源支撐的資料與證據。",
  },
  {
    sectionId: "discussion",
    title: "六、討論",
    instruction: "說明發現的意義、可能解釋與資料限制。",
  },
  {
    sectionId: "limitations",
    title: "七、限制",
    instruction: "明確標示缺少哪些證據、哪些來源只有摘要、哪些結論仍不能成立。",
  },
  {
    sectionId: "conclusion",
    title: "八、結論與建議",
    instruction: "提出保守結論與後續可補資料。",
  },
] as const;

function sectionPlanForInput(input: ReportWriterInput): Array<(typeof SECTION_PLAN)[number]> {
  if (!input.requestedSectionIds) return [...SECTION_PLAN];
  const requestedIds = new Set(input.requestedSectionIds);
  const requestedPlan = SECTION_PLAN.filter((section) => requestedIds.has(section.sectionId));
  return requestedPlan.length > 0
    ? requestedPlan
    : SECTION_PLAN.filter((section) => section.sectionId !== "abstract");
}

const DEFAULT_REPORT_WRITER_MODEL = "gemma4:e2b";
// Keep the complete primary + retry budget below the 60-second Vercel
// function limit so the evidence-backed fallback can still be returned.
const DEFAULT_REPORT_WRITER_TIMEOUT_MS = 55_000;
const DEFAULT_REPORT_WRITER_RETRY_MODEL = "qwen3:4b";
const DEFAULT_REPORT_WRITER_RETRY_TIMEOUT_MS = 30_000;
// A formal group performs two model calls (teach-back, then reconstruction).
// Keep groups serial so a provider never receives several large academic
// reconstruction packets at once; parallel groups previously exhausted the
// school provider's token window even though each individual call was valid.
const REPORT_WRITER_GROUP_CONCURRENCY = 1;
const REPORT_WRITER_REPAIR_CONCURRENCY = 1;
const PRIMARY_PROMPT_SOURCE_LIMIT = 8;
const PRIMARY_PROMPT_EVIDENCE_LIMIT = 8;
const RETRY_PROMPT_SOURCE_LIMIT = 3;
const RETRY_PROMPT_EVIDENCE_LIMIT = 3;
const PRIMARY_SOURCE_TEXT_LIMIT = 480;
const PRIMARY_EVIDENCE_TEXT_LIMIT = 420;
const RETRY_SOURCE_TEXT_LIMIT = 180;
const RETRY_EVIDENCE_TEXT_LIMIT = 280;
const GENERIC_SECTION_PATTERNS = [
  /目前可先從/u,
  /目前資料收集集中在/u,
  /若要寫成更完整/u,
  /仍建議再補充/u,
  /可再補充/u,
  /建議寫/u,
  /本段應/u,
  /請撰寫/u,
  /應討論/u,
  /應比較/u,
  /應整理/u,
  /目前來源集中於/u,
  /目前可先追問/u,
  /目前資料能支持初步整理/u,
];
const READER_PLACEHOLDER_PATTERNS = [
  /綜合以上摘錄.*共同部分可組成本節主軸.*(?:差異|未覆蓋處).*後續檢驗/u,
  /目前來源尚不足以支持此結論/u,
  /目前缺少足以支撐進一步實質判斷/u,
  /目前來源不足以支撐完整的/u,
  /此來源已保留可追溯的摘要片段，但尚未完成可驗證的繁中重點整理/u,
];
const FORBIDDEN_INSTRUCTION_PATTERNS = [
  /本段應/u,
  /應該探討/u,
  /可再補充/u,
  /建議加入/u,
  /此章節需要/u,
  /研究者可以/u,
  /待補/u,
  /依據資料撰寫/u,
  /以下可作為/u,
  /模板/iu,
  /placeholder/iu,
  /TODO/u,
];
const RAW_UNTRANSLATED_EVIDENCE_PATTERNS = [
  /\babstract\b\s*(?:[:\uff1a.\-\u2013\u2014])?/iu,
  /`+\s*[A-Za-z][^`\u3002\uff01\uff1f]{18,}`*/u,
];
const RAW_REPORT_LEAK_PATTERNS = [
  /此來源為低信心待人工審查/u,
  /若確認與主題相關，可以手動接受/u,
  /available evidence/iu,
  /candidate/iu,
  /grounding[_\s-]*verifier/iu,
  /\bprovider(?:[_\s-]*status)?\b/iu,
  /\bprompt(?:[_\s-]*payload)?\b/iu,
  /debug/iu,
  /0\s*個\s*citation/iu,
  /\d+\s*張證據/u,
  /\bevidence[_\s-]*cards?\b/iu,
  /\bmetadata(?:[_\s-]*only)?\b/iu,
  /\bpeer[_\s-]*reviewed[_\s-]*evidence\b/iu,
  /\baccepted[_\s-]*sources?[_\s-]*count\b/iu,
  /\baccepted[_\s-]*sources?\b/iu,
  /\bacceptedSourceCount\b/iu,
  /\b(?:evidenceIds?|evidenceCardIds?|citationIds?|supportSpans?|workflowId|jobId|topicHash)\b/iu,
  /\bturn\d+(?:search|fetch|view)\d+\b/iu,
  /【\d+\u2020L\d+(?:-L\d+)?】/u,
  /\b(?:sourceId|evidenceSetHash|reasonCode)\b/iu,
  /已接受來源/u,
  /證據卡/u,
  /同儕審查證據/u,
  /來源供應商|提示詞|提示內容/u,
  ...RAW_UNTRANSLATED_EVIDENCE_PATTERNS,
];
const UNTRANSLATED_EVIDENCE_NOTICE =
  "此來源已保留可追溯的摘要片段，但尚未完成可驗證的繁中重點整理";
const ASSERTIVE_SENTENCE_PATTERN =
  /顯示|指出|說明|造成|導致|影響|提升|降低|相關|證實|發現|根據|由於|因此|支持|支撐|可見|證明/u;
const EXPLICIT_EVIDENCE_BOUNDARY_PATTERN =
  /未直接涵蓋台灣校園.*不能把其他地區.*外推到台灣校園|未被直接資料涵蓋.*不納入結論/u;

type ReportSectionPlanId =
  | "abstract"
  | "introduction"
  | "research_question"
  | "literature_review"
  | "methodology"
  | "findings"
  | "discussion"
  | "limitations"
  | "conclusion";

interface PipelineEvidenceCard extends ReportWriterEvidenceCard {
  title: string;
  sourceType: string;
  reliability: string;
  mainClaim: string;
  usableEvidence: string;
  limitations: string[];
  sectionTargets: ReportSectionPlanId[];
  derivation: string | null;
  evidenceGrounding: string | null;
  summaryStructuredStatus: string | null;
  llmSummaryStatus: string | null;
  abstractOnly: boolean;
  sourceAccessLevel: string | null;
  evidenceType: string | null;
  sourceLocation: string | null;
}

interface SectionEvidenceMapEntry {
  sectionId: ReportSectionPlanId;
  title: string;
  paragraphPurpose: string;
  plannedClaims: ReportPlannedClaim[];
  paragraphPlans: ReportParagraphPlan[];
  allowedCitationKeys: string[];
  evidenceCards: PipelineEvidenceCard[];
  evidenceGaps: string[];
  supportLevel: "strong" | "partial" | "limited";
}

interface ParagraphPlan {
  id: string;
  section: ReportSectionPlanId;
  paragraphPurpose: string;
  topicSentence: string;
  claimIds: string[];
  evidenceIds: string[];
  citationPlan: string[];
  allowedCitationKeys: string[];
  synthesisGoal: string;
  limitationOrTransition: string;
}

interface DraftParagraph {
  sectionId: ReportSectionPlanId;
  text: string;
  claimIds: string[];
  evidenceIds: string[];
  citationIds: string[];
  warnings: string[];
}

interface CitationValidationResult {
  warnings: string[];
  sectionWarnings: Map<ReportSectionPlanId, string[]>;
}

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sanitizeReaderFacingInternalVocabulary(value: string): string {
  return value
    .replace(/此來源為低信心待人工審查/gu, "此資料的可信程度仍需進一步確認")
    .replace(/若確認與主題相關，可以手動接受/gu, "若後續取得更完整內容，可再評估其適用範圍")
    .replace(/available evidence/giu, "現有資料")
    .replace(/\bcandidate\b/giu, "待評估資料")
    .replace(/grounding[_\s-]*verifier/giu, "引用支撐檢查")
    .replace(/\bpeer[_\s-]*reviewed[_\s-]*evidence\b/giu, "同儕審查研究")
    .replace(/\bevidence[_\s-]*cards?\b/giu, "可核對的來源摘錄")
    .replace(/\bmetadata(?:[_\s-]*only)?\b/giu, "書目資訊")
    .replace(/\baccepted[_\s-]*sources?[_\s-]*count\b/giu, "資料涵蓋範圍")
    .replace(/\baccepted[_\s-]*sources?\b/giu, "已納入的資料")
    .replace(/\bacceptedSourceCount\b/giu, "已納入的資料")
    .replace(/\bprovider(?:[_\s-]*status)?\b/giu, "資料來源")
    .replace(/\bprompt(?:[_\s-]*payload)?\b/giu, "撰寫指引")
    .replace(
      /\b(?:evidenceIds?|evidenceCardIds?|citationIds?|supportSpans?|workflowId|jobId|topicHash)\b/giu,
      "可追溯資訊",
    )
    .replace(/已接受來源/gu, "已納入的資料")
    .replace(/證據卡(?:片)?/gu, "可核對的來源摘錄")
    .replace(/同儕審查證據/gu, "同儕審查研究")
    .replace(/來源供應商/gu, "資料來源")
    .replace(/提示詞|提示內容/gu, "撰寫指引")
    .replace(/\bdebug\b/giu, "內部檢查")
    .replace(/0\s*個?\s*citation/giu, "目前沒有可解析引用")
    .replace(/\d+\s*張證據/gu, "現有可核對資料")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function normalizeReaderFacingProse(
  primary: string,
  supplements: string[] = [],
): string {
  const normalized = normalizeReportSectionProse(primary, supplements);
  return normalizeReportSectionProse(
    sanitizeReaderFacingInternalVocabulary(normalized)
      .replace(/[；;]\s*[。.!]/gu, "。")
      .replace(/[。.!]\s*[；;]/gu, "。"),
  );
}

function containsRawReportLeak(value: string): boolean {
  return RAW_REPORT_LEAK_PATTERNS.some((pattern) => pattern.test(value));
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => cleanText(value)).filter(Boolean)),
  );
}

function truncateText(value: string, limit = 180): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function cleanFragment(value: string | null | undefined): string {
  return cleanText(value).replace(/[。！？.!?；，、\s]+$/u, "");
}

function firstPresentText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function containsRawEnglishEvidenceText(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (/[\u3040-\u30ff]{2,}/u.test(text)) return true;
  if (RAW_UNTRANSLATED_EVIDENCE_PATTERNS.some((pattern) => pattern.test(text))) return true;
  const withoutMarkers = text.replace(/[\[\uff3b]\s*[S\uff33]\d+\s*[\]\uff3d]/giu, "");
  const latinWords = withoutMarkers.match(/[A-Za-z][A-Za-z'\u2019-]*/gu)?.length ?? 0;
  const hanCharacters = withoutMarkers.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  if (latinWords >= 12 && hanCharacters === 0) return true;
  return latinWords >= 18 && latinWords > hanCharacters * 1.5;
}

function verifiedZhTwText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const cleaned = cleanText(value)
      .replace(/`+/gu, "")
      .replace(/^\s*(?:摘要|中文摘要)\s*[:\uff1a]\s*/u, "")
      .trim();
    if (!cleaned || !/[\u3400-\u9fff]/u.test(cleaned)) continue;
    if (containsRawEnglishEvidenceText(cleaned)) continue;
    return cleaned;
  }
  return "";
}

function metadataText(source: SourceRecord, key: string): string {
  const value = (source as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? cleanText(value) : "";
}

function metadataStringList(source: SourceRecord, key: string): string[] {
  const value = (source as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? cleanText(item) : ""))
    .filter(Boolean);
}

function reliabilityScore(card: ReportWriterEvidenceCard): number {
  const scored = [
    card.finalScore,
    card.sourceQualityScore,
    card.relevanceScore,
  ].find((value) => typeof value === "number" && Number.isFinite(value));
  if (typeof scored === "number") return scored;
  if (card.reliability === "高" || card.reliability === "high") return 85;
  if (card.reliability === "中" || card.reliability === "medium") return 68;
  if (card.reliability === "低" || card.reliability === "low") return 45;
  return 55;
}

function reliabilityLabel(card: ReportWriterEvidenceCard): string {
  const score = reliabilityScore(card);
  if (score >= 80) return "高";
  if (score >= 60) return "中";
  return "有限";
}

function sourceTypeLabel(source: SourceRecord): string {
  if (source.sourceKind === "journal" || source.sourceKind === "conference" || source.doi) {
    return "academic";
  }
  if (source.sourceType) return source.sourceType;
  return source.provider || "unknown";
}

function inferredRecommendationBucketForSource(
  source: SourceRecord | undefined,
): EvidenceRecommendationBucket | null {
  if (!source) return null;
  if (source.recommendationBucket) return source.recommendationBucket;
  if (source.reviewState === "rejected" || source.relevanceLevel === "off_topic") return "rejected";
  if (
    source.doi ||
    source.isPeerReviewed ||
    source.sourceKind === "journal" ||
    source.sourceKind === "conference" ||
    /crossref|openalex|semantic scholar/i.test(`${source.provider ?? ""} ${source.sourceType}`)
  ) {
    return "scholarly_recommended";
  }
  if (
    source.sourceType === "Official Source" ||
    source.sourceType === "Institutional Source" ||
    source.sourceCategory === "government_or_institution"
  ) {
    return "official_background";
  }
  return "manual_review";
}

function mapWorkflowSectionsToReportSections(
  usableSections: string[],
): ReportSectionPlanId[] {
  return normalizeEvidenceSectionFits(usableSections);
}

function evidenceSectionTypeForReportSection(
  sectionId: ReportSectionPlanId,
): EvidenceSectionType {
  switch (sectionId) {
    case "abstract":
      return "background";
    case "introduction":
      return "introduction";
    case "research_question":
      return "background";
    case "literature_review":
      return "literature_review";
    case "methodology":
      return "methods_context";
    case "findings":
      return "evidence_synthesis";
    case "discussion":
      return "discussion_claim";
    case "conclusion":
      return "conclusion_claim";
    case "limitations":
    default:
      return "basic_context";
  }
}

function cardAllowedForReportSection(
  card: ReportWriterEvidenceCard,
  sectionId: ReportSectionPlanId,
): boolean {
  const accessLevel =
    cleanText(card.sourceAccessLevel) ||
    cleanText(card.source_access_level) ||
    cleanText(card.evidenceGrounding) ||
    cleanText(card.derivation);
  if (
    (accessLevel === "metadata_only" ||
      accessLevel === "metadata-derived" ||
      accessLevel === "blocked_or_paywalled" ||
      accessLevel === "failed_extraction") &&
    evidenceSectionSupportsScholarlyClaim(evidenceSectionTypeForReportSection(sectionId))
  ) {
    return false;
  }
  return canUseEvidenceCardForSection(
    card,
    evidenceSectionTypeForReportSection(sectionId),
  );
}

function normalizePipelineEvidenceCard(
  card: ReportWriterEvidenceCard,
  source: SourceRecord | undefined,
): PipelineEvidenceCard {
  const title = cleanText(card.title || card.sourceTitle || source?.title) || "標題待確認";
  const canonicalSourceKey = card.canonicalSourceKey?.trim() ||
    card.dedupeKey?.trim() ||
    source?.canonicalSourceIdentity?.trim() ||
    source?.dedupeKey?.trim() ||
    (source ? sourceRecordKey(source) : card.sourceId);
  const sourceReadableSummary = verifiedZhTwText(
    metadataText(source ?? ({} as SourceRecord), "readableSummaryZhTw"),
    metadataText(source ?? ({} as SourceRecord), "readableSummaryZhTW"),
    metadataText(source ?? ({} as SourceRecord), "mainEvidencePointZhTw"),
    metadataText(source ?? ({} as SourceRecord), "evidenceSummaryZhTw"),
    metadataText(source ?? ({} as SourceRecord), "llmSummaryZhTw"),
    metadataText(source ?? ({} as SourceRecord), "abstractZhTw"),
  );
  const sourceRelevanceReason = verifiedZhTwText(
    metadataText(source ?? ({} as SourceRecord), "relevanceReasonZhTw"),
    metadataText(source ?? ({} as SourceRecord), "relevanceReasonZhTW"),
    metadataText(source ?? ({} as SourceRecord), "sourceRelevanceReasonZhTw"),
    metadataText(source ?? ({} as SourceRecord), "mainEvidenceFacet"),
  );
  const mainClaim =
    verifiedZhTwText(
      card.mainClaimZhTw,
      card.claimTextZhTw,
      card.evidencePointZhTw,
      card.sourceSummaryZhTw,
      source?.mainEvidencePointZhTw,
      metadataText(source ?? ({} as SourceRecord), "evidenceSummaryZhTw"),
      sourceReadableSummary,
      card.mainClaim,
      card.claim,
      card.summary,
    ) ||
    UNTRANSLATED_EVIDENCE_NOTICE;
  const usableEvidence =
    verifiedZhTwText(
      card.evidencePointZhTw,
      card.sourceSummaryZhTw,
      card.usableEvidence,
      card.evidence,
      card.summary,
      source?.mainEvidencePointZhTw,
      metadataText(source ?? ({} as SourceRecord), "evidenceSummaryZhTw"),
      sourceReadableSummary,
      source?.abstractZhTw,
    ) ||
    UNTRANSLATED_EVIDENCE_NOTICE;
  const limitations = dedupeStrings([
    ...(card.limitationsZhTw ?? []).map((item) => verifiedZhTwText(item)),
    ...(card.limitations ?? []).map((item) => verifiedZhTwText(item)),
    verifiedZhTwText(card.limitation),
    card.needsManualReview ? "此證據卡需要人工複核。" : null,
    card.summaryStructuredStatus && card.summaryStructuredStatus !== "success"
      ? "此來源的摘要整理尚未完成，不可視為完整全文證據。"
      : null,
    card.derivation === "metadata-derived"
      ? "此來源目前只有書目或 metadata 線索，不能支撐細部論證。"
      : null,
    card.derivation === "abstract-derived"
      ? "此來源目前主要依摘要整理，不能誇大成全文或實驗細節。"
      : null,
  ]);
  const sectionTargets = dedupeStrings([
    ...(card.sectionTargets ?? []),
    ...mapWorkflowSectionsToReportSections(card.usableSections ?? []),
  ]).filter((section): section is ReportSectionPlanId =>
    SECTION_PLAN.some((item) => item.sectionId === section),
  );
  const recommendationBucket =
    card.recommendationBucket ?? inferredRecommendationBucketForSource(source);
  const sourceRole = card.sourceRole ?? source?.sourceRole ?? null;
  const retrievalMode = card.retrievalMode ?? source?.retrievalMode ?? null;
  const governanceCard: ReportWriterEvidenceCard = {
    ...card,
    recommendationBucket,
    sourceRole,
    retrievalMode,
    isPeerReviewed: card.isPeerReviewed ?? source?.isPeerReviewed ?? null,
    venue: card.venue ?? source?.containerTitle ?? null,
    providerHealthSnapshot: card.providerHealthSnapshot ?? source?.providerHealthSnapshot ?? null,
    acceptedByUser: card.acceptedByUser ?? source?.acceptedByUser ?? null,
    userDecision: card.userDecision ?? source?.userDecision ?? null,
    acceptedAs: card.acceptedAs ?? source?.acceptedAs ?? null,
  };
  const allowedSectionTargets = sectionTargets.filter((section) =>
    cardAllowedForReportSection(governanceCard, section),
  );
  const derivation = cleanText(card.derivation) || null;
  const evidenceGrounding = cleanText(card.evidenceGrounding) || null;
  const extractionStatus = cleanText(card.extractionStatus) || metadataText(source ?? ({} as SourceRecord), "extractionStatus") || null;
  const sourceAccessLevel =
    cleanText(card.sourceAccessLevel) ||
    cleanText(card.source_access_level) ||
    metadataText(source ?? ({} as SourceRecord), "accessLevel") ||
    (derivation === "fulltext-derived"
      ? "full_text"
      : derivation === "metadata-derived"
        ? "metadata_only"
        : derivation === "abstract-derived"
          ? "abstract_only"
          : null);
  const evidenceType =
    cleanText(card.evidenceType) ||
    cleanText(card.evidence_type) ||
    null;
  const sourceLocation =
    cleanText(card.sourceLocation) ||
    cleanText(card.source_location) ||
    cleanText(card.sectionHeading) ||
    cleanText(card.section_heading) ||
    null;
  const summaryStructuredStatus = cleanText(card.summaryStructuredStatus) || null;
  const llmSummaryStatus = cleanText(card.llmSummaryStatus) || null;
  const abstractOnly =
    sourceAccessLevel === "abstract_only" ||
    derivation === "abstract-derived" ||
    derivation === "metadata-derived" ||
    evidenceGrounding === "abstract_only" ||
    evidenceGrounding === "metadata_only" ||
    summaryStructuredStatus === "insufficient_sources";

  return {
    ...card,
    canonicalSourceKey,
    dedupeKey: canonicalSourceKey,
    citationKey: card.citationKey?.trim() || canonicalSourceKey,
    title,
    sourceType: cleanText(card.sourceType) || sourceTypeLabel(source ?? ({} as SourceRecord)),
    reliability: cleanText(card.reliability) || reliabilityLabel(card),
    mainClaim,
    claim: mainClaim,
    evidence: usableEvidence,
    summary: verifiedZhTwText(
      card.sourceSummaryZhTw,
      card.summary,
      sourceReadableSummary,
      usableEvidence,
    ) || usableEvidence,
    relevance: verifiedZhTwText(card.relevance, sourceRelevanceReason) || "研究背景",
    usableEvidence,
    limitations,
    recommendationBucket,
    sourceRole,
    retrievalMode,
    isPeerReviewed: card.isPeerReviewed ?? source?.isPeerReviewed ?? null,
    venue: card.venue ?? source?.containerTitle ?? null,
    providerHealthSnapshot: card.providerHealthSnapshot ?? source?.providerHealthSnapshot ?? null,
    acceptedByUser: card.acceptedByUser ?? source?.acceptedByUser ?? null,
    userDecision: card.userDecision ?? source?.userDecision ?? null,
    acceptedAs: card.acceptedAs ?? source?.acceptedAs ?? null,
    sectionTargets:
      allowedSectionTargets.length > 0
        ? allowedSectionTargets
        : SECTION_PLAN.map((section) => section.sectionId).filter((section) =>
            cardAllowedForReportSection(governanceCard, section),
          ),
    derivation,
    evidenceGrounding,
    summaryStructuredStatus,
    llmSummaryStatus,
    abstractOnly,
    sourceAccessLevel,
    extractionStatus,
    evidenceType,
    sourceLocation,
  };
}

const HONEY_CRYSTALLIZATION_TOPIC_PATTERN =
  /蜂蜜|honey|結晶|crystalli[sz]ation|葡萄糖|果糖|glucose|fructose|含水|moisture|糖類/u;
const ANIMAL_ENTITY_GAP_PATTERN =
  /生態與生物特徵|飼養|健康照護|人類互動|毛纖維|行為特徵|經濟價值|疾病|animal|husbandry|veterinary/i;

function filterTopicConceptGaps(topic: string, gaps: string[]): string[] {
  if (!HONEY_CRYSTALLIZATION_TOPIC_PATTERN.test(topic)) return gaps;
  return gaps.filter((gap) => !ANIMAL_ENTITY_GAP_PATTERN.test(gap));
}

function topicConceptGaps(topic: string, cards: PipelineEvidenceCard[]): string[] {
  const understanding = understandTopicHeuristically({ topic });
  const evidenceText = cards
    .map((card) =>
      cleanText(
        [
          card.title,
          card.mainClaim,
          card.usableEvidence,
          card.relevance,
          card.summary,
        ].join(" "),
      ).toLowerCase(),
    )
    .join(" ");
  // Research angles are query-planning suggestions, not mandatory concepts.
  // Treating every unrepresented angle as a report evidence gap produced
  // reader-facing boilerplate such as "背景脈絡、案例、應用與風險皆缺少"
  // even when the accepted papers directly answered the research question.
  const conceptTerms = understanding.coreConcepts
    .map((concept) => cleanText(concept).toLowerCase())
    .filter((concept) => concept.length >= 2)
    .filter(
      (concept) =>
        !/(?:背景脈絡|觀察面向|使用情境|比較方向|後續研究|主要類型|核心特徵|形成過程|發展趨勢|應用|風險|案例)$/u.test(concept),
    );
  const missingConcepts = conceptTerms.filter((concept) => !evidenceText.includes(concept));
  return filterTopicConceptGaps(topic, missingConcepts).slice(0, 4);
}

function sectionCardsFromTargets(
  sectionId: ReportSectionPlanId,
  cards: PipelineEvidenceCard[],
): PipelineEvidenceCard[] {
  const allowedCards = cards.filter((card) => cardAllowedForReportSection(card, sectionId));
  const direct = allowedCards.filter((card) => card.sectionTargets.includes(sectionId));
  if (direct.length > 0) return direct;

  switch (sectionId) {
    case "methodology":
      return allowedCards.slice(0, 3);
    case "limitations":
      return allowedCards
        .filter((card) => card.limitations.length > 0 || card.abstractOnly)
        .slice(0, 4);
    case "conclusion":
      return allowedCards.filter((card) => card.sectionTargets.includes("findings")).slice(0, 4);
    case "discussion":
      return allowedCards
        .filter(
          (card) =>
            card.sectionTargets.includes("findings") ||
            card.sectionTargets.includes("literature_review"),
        )
        .slice(0, 4);
    default:
      return allowedCards.slice(0, 3);
  }
}

function evidenceIdentity(card: ReportWriterEvidenceCard): string {
  return cleanText(card.evidenceId) || card.id;
}

function canonicalKeyForEvidenceCard(card: ReportWriterEvidenceCard): string {
  return cleanText(card.canonicalSourceKey) ||
    cleanText(card.dedupeKey) ||
    card.sourceId;
}

function citationKeyForEvidenceCard(card: ReportWriterEvidenceCard): string {
  return cleanText(card.citationKey) || canonicalKeyForEvidenceCard(card);
}

function reportPlanSectionIdsForWriterSection(
  reportPlan: ReportPlan,
  sectionId: ReportSectionPlanId,
): string[] {
  if (reportPlan.sections.some((section) => section.sectionId === sectionId)) {
    return [sectionId];
  }
  switch (sectionId) {
    case "abstract":
      return ["background", "evidence"];
    case "introduction":
    case "research_question":
      return ["background"];
    case "literature_review":
    case "methodology":
    case "findings":
    case "limitations":
      return ["evidence"];
    case "discussion":
      return ["discussion"];
    case "conclusion":
      return ["conclusion"];
  }
}

function scopedClaimForCards(
  claim: ReportPlannedClaim,
  cards: PipelineEvidenceCard[],
): ReportPlannedClaim | null {
  const matchedCards = cards.filter((card) =>
    claim.supportingEvidenceIds.includes(evidenceIdentity(card)) &&
    claim.supportingSourceKeys.includes(canonicalKeyForEvidenceCard(card)) &&
    claim.allowedCitationKeys.includes(citationKeyForEvidenceCard(card))
  );
  if (matchedCards.length === 0) return null;
  return {
    ...claim,
    supportingEvidenceIds: dedupeStrings(matchedCards.map(evidenceIdentity)),
    supportingSourceKeys: dedupeStrings(matchedCards.map(canonicalKeyForEvidenceCard)),
    allowedCitationKeys: dedupeStrings(matchedCards.map(citationKeyForEvidenceCard)),
  };
}

function reportPlanBindingForSection(input: {
  reportPlan: ReportPlan;
  sectionId: ReportSectionPlanId;
  cards: PipelineEvidenceCard[];
}): {
  cards: PipelineEvidenceCard[];
  plannedClaims: ReportPlannedClaim[];
  paragraphPlans: ReportParagraphPlan[];
  allowedCitationKeys: string[];
} {
  const mappedSectionIds = new Set(
    reportPlanSectionIdsForWriterSection(input.reportPlan, input.sectionId),
  );
  const mappedSections = input.reportPlan.sections.filter((section) =>
    mappedSectionIds.has(section.sectionId),
  );
  const explicitEvidenceIds = new Set(
    mappedSections.flatMap((section) => section.evidenceCardIds),
  );
  const declaredClaimIds = new Set(
    mappedSections.flatMap((section) => section.plannedClaimIds),
  );
  const inferredClaimIds = new Set(
    input.reportPlan.plannedClaims
      .filter((claim) =>
        claim.supportingEvidenceIds.some((evidenceId) => explicitEvidenceIds.has(evidenceId)),
      )
      .map((claim) => claim.claimId),
  );
  const effectiveClaimIds = declaredClaimIds.size > 0
    ? declaredClaimIds
    : inferredClaimIds;
  const selectedClaims = input.reportPlan.plannedClaims.filter((claim) =>
    effectiveClaimIds.has(claim.claimId),
  );
  const claimEvidenceIds = new Set(
    selectedClaims.flatMap((claim) => claim.supportingEvidenceIds),
  );
  const allowedEvidenceIds = explicitEvidenceIds.size > 0
    ? explicitEvidenceIds
    : claimEvidenceIds;
  const planCards = input.cards.filter((card) => {
    const evidenceId = evidenceIdentity(card);
    if (!allowedEvidenceIds.has(evidenceId)) return false;
    return selectedClaims.some((claim) =>
      claim.supportingEvidenceIds.includes(evidenceId) &&
      claim.supportingSourceKeys.includes(canonicalKeyForEvidenceCard(card)) &&
      claim.allowedCitationKeys.includes(citationKeyForEvidenceCard(card)),
    );
  });
  const isScopeMethod = mappedSections.some(
    (section) => section.canonicalSectionRole === "scope_method",
  );
  const scopedCards = isScopeMethod
    ? planCards
    : sectionCardsFromTargets(input.sectionId, planCards);
  const plannedClaims = selectedClaims
    .map((claim) => scopedClaimForCards(claim, scopedCards))
    .filter((claim): claim is ReportPlannedClaim => Boolean(claim));
  const allowedClaimEvidenceIds = new Set(
    plannedClaims.flatMap((claim) => claim.supportingEvidenceIds),
  );
  const cards = scopedCards.filter((card) =>
    allowedClaimEvidenceIds.has(evidenceIdentity(card)),
  );
  return {
    cards,
    plannedClaims,
    paragraphPlans: mappedSections.flatMap((section) => section.paragraphPlan ?? []),
    allowedCitationKeys: dedupeStrings(
      plannedClaims.flatMap((claim) => claim.allowedCitationKeys),
    ),
  };
}

function supportLevelForSection(
  sectionId: ReportSectionPlanId,
  cards: PipelineEvidenceCard[],
): "strong" | "partial" | "limited" {
  const sourceCount = new Set(cards.map((card) => card.sourceId)).size;
  if (sectionId === "literature_review") {
    if (cards.length >= 4 && sourceCount >= 2) return "strong";
    if (cards.length >= 2) return "partial";
    return "limited";
  }
  if (sectionId === "discussion") {
    if (cards.length >= 3) return "strong";
    if (cards.length >= 1) return "partial";
    return "limited";
  }
  if (sectionId === "introduction" || sectionId === "abstract") {
    if (cards.length >= 2) return "strong";
    if (cards.length >= 1) return "partial";
    return "limited";
  }
  if (sectionId === "methodology") {
    return cards.length >= 1 ? "partial" : "limited";
  }
  if (cards.length >= 3 && cards.some((card) => reliabilityScore(card) >= 80)) return "strong";
  if (cards.length >= 1) return "partial";
  return "limited";
}

function buildSectionEvidenceMap(
  topic: string,
  cards: PipelineEvidenceCard[],
  sectionPlan: ReadonlyArray<(typeof SECTION_PLAN)[number]> = SECTION_PLAN,
  reportPlan?: ReportPlan,
): SectionEvidenceMapEntry[] {
  const conceptGaps = topicConceptGaps(topic, cards);
  return sectionPlan.map((section) => {
    const evidenceLimit =
      section.sectionId === "literature_review"
        ? 8
        : section.sectionId === "findings"
          ? 6
          : 4;
    const reportPlanBinding = reportPlan
      ? reportPlanBindingForSection({
          reportPlan,
          sectionId: section.sectionId,
          cards,
        })
      : null;
    const evidenceCards = (
      reportPlanBinding?.cards ?? sectionCardsFromTargets(section.sectionId, cards)
    ).slice(0, evidenceLimit);
    const plannedClaims = reportPlanBinding
      ? reportPlanBinding.plannedClaims
          .map((claim) => scopedClaimForCards(claim, evidenceCards))
          .filter((claim): claim is ReportPlannedClaim => Boolean(claim))
      : [];
    const supportLevel = supportLevelForSection(section.sectionId, evidenceCards);
    const evidenceGaps: string[] = [];
    if (supportLevel === "limited") {
      evidenceGaps.push(`此章目前缺少可直接支撐「${section.title}」的高相關證據。`);
    }
    if (reportPlan && plannedClaims.length === 0) {
      evidenceGaps.push("結構化撰寫計畫未為本章指定可核對的主張與來源連結。");
    }
    if (section.sectionId === "literature_review" && evidenceCards.length < 4) {
      evidenceGaps.push("現有文獻的多樣性不足，需降級為初步文獻整理。");
    }
    if (
      section.sectionId === "literature_review" &&
      new Set(evidenceCards.map((card) => card.sourceId)).size < 2
    ) {
      evidenceGaps.push("目前缺乏可相互比較的獨立來源，尚無法形成穩健的差異分析。");
    }
    if (
      ["literature_review", "findings", "discussion", "limitations", "conclusion"].includes(
        section.sectionId,
      ) &&
      conceptGaps.length > 0
    ) {
      evidenceGaps.push(`尚缺 ${conceptGaps.slice(0, 3).join("、")} 的直接來源。`);
    }
    if (evidenceCards.some((card) => card.abstractOnly)) {
      evidenceGaps.push("部分來源僅依摘要整理，不能誇大成全文論證。");
    }
    return {
      sectionId: section.sectionId,
      title: section.title,
      paragraphPurpose: section.instruction,
      plannedClaims,
      paragraphPlans: reportPlanBinding?.paragraphPlans ?? [],
      allowedCitationKeys: reportPlan
        ? dedupeStrings(plannedClaims.flatMap((claim) => claim.allowedCitationKeys))
        : dedupeStrings(evidenceCards.map(citationKeyForEvidenceCard)),
      evidenceCards,
      evidenceGaps: dedupeStrings(evidenceGaps),
      supportLevel,
    };
  });
}

function themesFromCards(cards: PipelineEvidenceCard[], limit = 3): string[] {
  return dedupeStrings(
    cards.flatMap((card) => [
      /^(研究背景|文獻探討|研究方法|數據分析|結論|資料背景)$/u.test(cleanText(card.relevance))
        ? null
        : cleanFragment(card.relevance),
      cleanFragment(card.usableEvidence),
      cleanFragment(card.mainClaim),
    ]),
  ).map((value) => truncateText(value, 60)).slice(0, limit);
}

function buildParagraphPlans(
  topic: string,
  sectionEvidenceMap: SectionEvidenceMapEntry[],
): ParagraphPlan[] {
  return sectionEvidenceMap.map((entry) => {
    const themes = dedupeStrings(
      entry.plannedClaims.length > 0
        ? entry.plannedClaims.map((claim) => claim.claimText)
        : themesFromCards(entry.evidenceCards),
    ).slice(0, 3);
    const evidenceIds = entry.evidenceCards.map((card) => card.id);
    const citationPlan = dedupeStrings(entry.evidenceCards.map((card) => card.sourceId));
    const themeText = themes.length > 0 ? themes.join("、") : "現有可驗證資料";
    const supportText =
      entry.supportLevel === "strong"
        ? "可形成較完整的證據整合"
        : entry.supportLevel === "partial"
          ? "可形成受限但可追溯的初步整合"
          : "只能形成受限草稿並強調資料缺口";
    const topicSentenceBySection: Record<ReportSectionPlanId, string> = {
      abstract: `本稿以「${topic}」為核心，整理目前已納入資料能直接支持的論點、限制與後續補證方向。`,
      introduction: `研究「${topic}」的前提，是先界定現有證據真正覆蓋的背景與討論邊界。`,
      research_question: `依現有證據分布，本報告將「${topic}」整理為可蒐證的核心研究問題。`,
      literature_review: `現有文獻較能支撐「${topic}」在 ${themeText} 等面向的既有觀點與應用脈絡。`,
      methodology: `本報告先篩選與主題直接相關的資料，再比對可核對摘錄與來源限制，以建立「${topic}」的可追溯基礎。`,
      findings: `綜合可核對資料，「${topic}」目前較有支撐的重點集中在 ${themeText}。`,
      discussion: `把目前證據放在一起判讀後，可區分「${topic}」已有支撐的面向與仍缺少證據的部分。`,
      limitations: `現階段「${topic}」的限制不在於能否提出問題，而在於哪些核心概念仍缺乏直接來源。`,
      conclusion: `依現有證據，「${topic}」只能形成保守結論，並需把未被證據覆蓋的部分明確保留下來。`,
    };

    return {
      id: `${entry.sectionId}:plan:1`,
      section: entry.sectionId,
      paragraphPurpose: entry.paragraphPurpose,
      topicSentence: topicSentenceBySection[entry.sectionId],
      claimIds: entry.plannedClaims.map((claim) => claim.claimId),
      evidenceIds,
      citationPlan,
      allowedCitationKeys: entry.allowedCitationKeys,
      synthesisGoal: `${supportText}；本段優先整合 ${themeText}，而不是逐篇摘要來源標題。`,
      limitationOrTransition:
        entry.evidenceGaps[0] ??
        (entry.supportLevel === "limited"
          ? "本段只能維持受限草稿。"
          : "段末需說明哪些結論仍缺少來源支持。"),
    };
  });
}

function sourceOrdinalMap(sources: SourceRecord[]): Map<string, number> {
  return new Map(
    sources
      .map((source, index) => [source.id, index + 1] as const)
      .filter(([id]) => Boolean(id)),
  );
}

/** Internal-only marker used by the deterministic grounding verifier. */
function citationMarker(
  citationIds: string[],
  sourceOrdinals: Map<string, number>,
): string {
  const labels = citationIds
    .map((id) => sourceOrdinals.get(id))
    .filter((value): value is number => typeof value === "number")
    .map((value) => `S${value}`);
  return labels.length > 0 ? `[${labels.join("][")}]` : "";
}

function conciseCardPoint(card: PipelineEvidenceCard): string {
  return truncateText(
    cleanFragment(
      firstReportFragment(
        firstPresentText(
        card.evidencePointZhTw,
        card.claimTextZhTw,
        card.sourceSummaryZhTw,
        card.usableEvidence,
        card.summary,
        card.mainClaim,
        card.title,
        ),
      ),
    ),
    72,
  );
}

function proseJoin(items: string[]): string {
  const fragments = items.map((item) => cleanFragment(item)).filter(Boolean);
  if (fragments.length === 0) return "";
  if (fragments.length === 1) return fragments[0]!;
  if (fragments.length === 2) return `${fragments[0]}與${fragments[1]}`;
  return `${fragments.slice(0, -1).join("、")}，以及${fragments[fragments.length - 1]}`;
}

function evidenceAgreementSummary(cards: PipelineEvidenceCard[]): string {
  const comparisonText = cards
    .flatMap((card) => [card.mainClaim, card.usableEvidence, ...card.limitations])
    .join(" ");
  if (/矛盾|不一致|相反|差異|conflict|contradict|inconsistent/iu.test(comparisonText)) {
    return "現有資料對核心方向的描述並非完全一致，差異可能來自研究對象、情境或測量方式";
  }
  if (new Set(cards.map((card) => card.sourceId)).size >= 2) {
    return "不同資料對核心方向大致一致，但研究對象、情境與方法不一定可直接互換";
  }
  return "現有資料只能呈現單一研究脈絡，尚不足以判斷不同研究之間是否一致";
}

function taiwanCampusExtrapolationBoundary(
  topic: string,
  cards: PipelineEvidenceCard[],
): string | null {
  const asksTaiwanCampus =
    /(?:台灣|臺灣)/u.test(topic) &&
    /(?:校園|學校|學生|高中|國中|大學)/u.test(topic);
  if (!asksTaiwanCampus) return null;
  const directlyCoveredText = cards
    .flatMap((card) => [
      card.title,
      card.mainClaim,
      card.usableEvidence,
      card.summary,
      card.claimTextZhTw,
      card.evidencePointZhTw,
      ...(card.supportSpans ?? []).map((span) => span.text),
    ])
    .filter(Boolean)
    .join(" ");
  const coversTaiwan = /(?:台灣|臺灣)/u.test(directlyCoveredText);
  const coversCampus = /(?:校園|學校|學生|高中|國中|大學)/u.test(directlyCoveredText);
  if (coversTaiwan && coversCampus) return null;
  return "目前資料未直接涵蓋台灣校園樣本或本地制度情境，因此不能把其他地區或一般族群的結果直接外推到台灣校園";
}

function renderDraftParagraphs(
  topic: string,
  plans: ParagraphPlan[],
  cards: PipelineEvidenceCard[],
  sources: SourceRecord[],
  plannedClaims: ReportPlannedClaim[] = [],
): DraftParagraph[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const claimById = new Map(plannedClaims.map((claim) => [claim.claimId, claim] as const));
  const sourceOrdinals = sourceOrdinalMap(sources);

  return plans.map((plan) => {
    const planCards = plan.evidenceIds
      .map((id) => cardById.get(id))
      .filter((card): card is PipelineEvidenceCard => Boolean(card));
    const citationIds = dedupeStrings(plan.citationPlan);
    const marker = citationMarker(citationIds, sourceOrdinals);
    const groundedTopicSentence = marker
      ? `${cleanFragment(plan.topicSentence)}${marker}。`
      : plan.topicSentence;
    const warnings: string[] = [];
    const plannedClaimPoints = plan.claimIds
      .map((claimId) => claimById.get(claimId)?.claimText)
      .filter((value): value is string => Boolean(cleanText(value)));
    const evidencePoints = uniqueReportFragments(
      plannedClaimPoints.length > 0 ? plannedClaimPoints : planCards.map(conciseCardPoint),
    )
      .map(cleanFragment)
      .slice(0, 3);
    const limitationNotes = uniqueReportFragments(planCards.flatMap((card) => card.limitations))
      .map(cleanFragment)
      .slice(0, 2);
    let text = groundedTopicSentence;
    switch (plan.section) {
      case "abstract":
        text = [
          groundedTopicSentence,
          evidencePoints.length > 0
            ? `目前較能直接支撐的內容集中在${proseJoin(evidencePoints)}${marker}。`
            : "目前尚無足夠證據形成正式摘要，只能標示研究範圍與資料缺口。",
          plan.limitationOrTransition,
        ].join("\n\n");
        break;
      case "introduction":
        text = [
          groundedTopicSentence,
          evidencePoints.length > 0
            ? `現有來源把討論重點帶向${proseJoin(evidencePoints)}${marker}，因此本報告會以這些已被資料觸及的面向作為背景起點。`
            : "目前背景來源不足，因此本段只界定研究範圍，不把未補證的直覺判斷寫成正式背景論點。",
          plan.limitationOrTransition,
        ].join("\n\n");
        break;
      case "research_question":
        text = [
          groundedTopicSentence,
          evidencePoints.length > 0
            ? `依證據分布，可優先追問三個方向：${evidencePoints
                .slice(0, 3)
                .map((point, index) => `${index + 1}. ${point}`)
                .join("；")}${marker}。`
            : "由於現有證據不足，本節暫不把未被來源覆蓋的疑問寫成可回答的正式研究問題。",
          plan.limitationOrTransition,
        ].join("\n\n");
        break;
      case "literature_review":
        if (evidencePoints.length > 0) {
          text = [
            groundedTopicSentence,
            `跨來源共同支持的主張可整理為${proseJoin(evidencePoints)}${marker}。`,
            `${evidenceAgreementSummary(planCards)}${marker}；這些差異應依研究場域、量測指標與方法分開解讀。`,
            marker ? `${cleanFragment(plan.limitationOrTransition)}${marker}。` : plan.limitationOrTransition,
          ].join("\n\n");
        } else {
          text = "目前資料不足以支撐完整的文獻探討。已納入的資料尚未提供足夠的可比較學術研究，因此本節僅能說明資料缺口，不能形成完整文獻綜述。";
        }
        break;
      case "methodology":
        text = [
          groundedTopicSentence,
          `本輪正文只使用已納入且可追溯的資料，不把無法回溯至來源的想法寫成正式段落${marker}。`,
          limitationNotes.length > 0
            ? `方法限制包括${proseJoin(limitationNotes)}。`
            : plan.limitationOrTransition,
        ].join("\n\n");
        break;
      case "findings":
        text = [
          groundedTopicSentence,
          evidencePoints.length > 0
            ? `跨來源整合後，較可成立的發現是${proseJoin(evidencePoints)}${marker}；這些內容可以作為正文主軸，但不代表所有理論面都已被完整覆蓋。`
            : "目前尚無足夠直接證據可形成主要發現，本節僅能列出資料缺口。",
          plan.limitationOrTransition,
        ].join("\n\n");
        break;
      case "discussion":
        {
          const localBoundary = taiwanCampusExtrapolationBoundary(topic, planCards);
        text = [
          groundedTopicSentence,
          planCards.length > 0
            ? `從相互比較來看，${evidenceAgreementSummary(planCards)}${marker}；因此討論重點在一致性、差異來源與適用邊界，不再重述研究發現。`
            : "由於缺少足夠證據，本節不把可能的解釋寫成定論，而是保留為待驗證假設。",
          localBoundary ??
            (limitationNotes.length > 0
              ? `適用時仍需注意${proseJoin(limitationNotes)}，並將結論限定在原始研究的對象與情境。`
              : "目前結果只適用於原始資料直接涵蓋的對象與情境，不宜外推為普遍結論。"),
        ].join("\n\n");
        }
        break;
      case "limitations":
        text = [
          groundedTopicSentence,
          limitationNotes.length > 0
            ? `目前最明顯的限制包括${proseJoin(limitationNotes)}${marker}。`
            : "目前限制主要來自來源數量與可驗證摘要不足。",
          plan.limitationOrTransition,
        ].join("\n\n");
        break;
      case "conclusion":
        {
        text = [
          `綜合現有可追溯研究，「${topic}」已能形成方向明確但需保留適用邊界的回答。`,
          planCards.length > 0
            ? `現階段可回答的是：${evidenceAgreementSummary(planCards)}${marker}，因此「${topic}」已有跨來源可比較的方向性證據。`
            : "由於核心證據不足，現階段不形成完整結論，只保留後續補證方向。",
          `這個結論不等於普遍因果律；精確門檻、跨情境外推與因果解釋仍須由具有一致指標與方法的後續研究驗證。`,
        ].join("\n\n");
        break;
        }
    }

    text = normalizeReaderFacingProse(text);

    if (plan.evidenceIds.length === 0) {
      warnings.push("本段沒有 evidenceIds，只能視為受限草稿。");
    }

    return {
      sectionId: plan.section,
      text,
      claimIds: plan.claimIds,
      evidenceIds: plan.evidenceIds,
      citationIds,
      warnings: dedupeStrings(warnings),
    };
  });
}

function validateDraftParagraphs(
  paragraphs: DraftParagraph[],
  cards: PipelineEvidenceCard[],
  sources: SourceRecord[],
): CitationValidationResult {
  const warnings: string[] = [];
  const sectionWarnings = new Map<ReportSectionPlanId, string[]>();
  const allowedSourceIds = new Set(sources.map((source) => source.id).filter(Boolean));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const usedEvidenceIds = new Set<string>();

  const pushSectionWarning = (sectionId: ReportSectionPlanId, message: string) => {
    const existing = sectionWarnings.get(sectionId) ?? [];
    existing.push(message);
    sectionWarnings.set(sectionId, dedupeStrings(existing));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.evidenceIds.length === 0) {
      pushSectionWarning(paragraph.sectionId, "段落沒有 evidenceIds 支撐，只能視為受限草稿。");
    }
    const invalidEvidenceIds = paragraph.evidenceIds.filter((id) => !cardById.has(id));
    if (invalidEvidenceIds.length > 0) {
      pushSectionWarning(
        paragraph.sectionId,
        `包含不存在的 evidenceIds：${invalidEvidenceIds.join("、")}`,
      );
    }
    const invalidCitationIds = paragraph.citationIds.filter((id) => !allowedSourceIds.has(id));
    if (invalidCitationIds.length > 0) {
      pushSectionWarning(
        paragraph.sectionId,
        `包含不存在於 acceptedSources 的 citationIds：${invalidCitationIds.join("、")}`,
      );
    }
    const referencedCards = paragraph.evidenceIds
      .map((id) => cardById.get(id))
      .filter((card): card is PipelineEvidenceCard => Boolean(card));
    referencedCards.forEach((card) => usedEvidenceIds.add(card.id));
    if (
      referencedCards.length > 0 &&
      referencedCards.every((card) => card.abstractOnly) &&
      /證明|證實|必然|完全|已經確定/u.test(paragraph.text)
    ) {
      pushSectionWarning(
        paragraph.sectionId,
        "本段使用了偏強的結論語氣，但引用來源主要只有摘要或 metadata。",
      );
    }
  }

  const unusedCards = cards.filter((card) => !usedEvidenceIds.has(card.id));
  if (unusedCards.length > 0) {
    warnings.push(
      `尚有 ${unusedCards.length} 張 evidenceCard 未被正文合理使用：${unusedCards
        .slice(0, 4)
        .map((card) => card.id)
        .join("、")}`,
    );
  }

  for (const [sectionId, sectionMessages] of sectionWarnings) {
    warnings.push(`${sectionId}：${sectionMessages.join("；")}`);
  }

  return {
    warnings: dedupeStrings(warnings),
    sectionWarnings,
  };
}

function sectionMapToText(
  sectionEvidenceMap: SectionEvidenceMapEntry[],
): string {
  return sectionEvidenceMap
    .map((entry) =>
      [
        `${entry.sectionId}: ${entry.title}`,
        `supportLevel: ${entry.supportLevel}`,
        `plannedClaimIds: ${entry.plannedClaims.map((claim) => claim.claimId).join(", ") || "none"}`,
        `evidenceIds: ${entry.evidenceCards.map((card) => card.id).join(", ") || "none"}`,
        `allowedCitationKeys: ${entry.allowedCitationKeys.join(", ") || "none"}`,
        `evidenceGaps: ${entry.evidenceGaps.join("；") || "none"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function paragraphPlansToText(plans: ParagraphPlan[]): string {
  return plans
    .map((plan) =>
      JSON.stringify(
        {
          section: plan.section,
          paragraphPurpose: plan.paragraphPurpose,
          topicSentence: plan.topicSentence,
          claimIds: plan.claimIds,
          evidenceIds: plan.evidenceIds,
          citationPlan: plan.citationPlan,
          allowedCitationKeys: plan.allowedCitationKeys,
          synthesisGoal: plan.synthesisGoal,
          limitationOrTransition: plan.limitationOrTransition,
        },
        null,
        2,
      ),
    )
    .join("\n\n");
}

function compactParagraphPlansToText(plans: ParagraphPlan[]): string {
  return plans
    .map((plan) => JSON.stringify({
      section: plan.section,
      purpose: plan.paragraphPurpose,
      claimIds: plan.claimIds,
      evidenceIds: plan.evidenceIds,
      citationIds: plan.citationPlan,
      allowedCitationKeys: plan.allowedCitationKeys,
      limitation: plan.limitationOrTransition,
    }))
    .join("\n");
}

function normalizedReportInputForPrompt(input: ReportWriterInput, sources: SourceRecord[], cards: PipelineEvidenceCard[]) {
  const requestedSectionPlan = sectionPlanForInput(input);
  const normalizedEvidenceBySource = new Map<string, string[]>();
  for (const item of input.reportPlan?.normalizedEvidence ?? []) {
    if (!item.writerEligible) continue;
    const values = normalizedEvidenceBySource.get(item.canonicalSourceId) ?? [];
    values.push(item.normalizedClaimZhTw);
    normalizedEvidenceBySource.set(item.canonicalSourceId, values);
  }
  const cardBySource = new Map<string, PipelineEvidenceCard[]>();
  for (const card of cards) {
    const existing = cardBySource.get(card.sourceId) ?? [];
    existing.push(card);
    cardBySource.set(card.sourceId, existing);
  }

  return {
    workflowId: input.workflowId ?? null,
    jobId: input.jobId ?? null,
    topic: input.topic,
    field: input.reportType ?? input.audience ?? "research",
    outputLanguage: "zh-TW",
    reportPreferences: {
      writingStyle: input.writingStyle ?? null,
      requestedLength: input.requestedLength ?? null,
      targetWordCount: input.targetWordCount ?? null,
      specifiedStructure: input.specifiedStructure ?? null,
      rubric: input.rubric ?? null,
    },
    acceptedSources: sources.map((source, index) => {
      const sourceCards = cardBySource.get(source.id) ?? [];
      return {
        source_id: source.id,
        title: source.title,
        authors: source.authors,
        year: source.year,
        provider: source.provider ?? source.sourceType,
        url: source.url,
        doi: source.doi,
        normalized_summary_zh_tw:
          verifiedZhTwText(
            source.llmSummaryZhTw,
            source.readableSummaryZhTW,
            source.readableSummaryZhTw,
          ) || null,
        summary_source_type: source.summarySourceType ?? null,
        summary_confidence: source.summaryConfidence ?? null,
        access_level: metadataText(source, "accessLevel") || null,
        extraction_status: metadataText(source, "extractionStatus") || null,
        extraction_mode: metadataText(source, "extractionMode") || null,
        extraction_method: metadataText(source, "extractionMethod") || null,
        claim_extraction_status: metadataText(source, "claimExtractionStatus") || null,
        claim_count:
          typeof (source as unknown as Record<string, unknown>).claimCount === "number"
            ? (source as unknown as Record<string, number>).claimCount
            : null,
        accepted_claim_count:
          typeof (source as unknown as Record<string, unknown>).acceptedClaimCount === "number"
            ? (source as unknown as Record<string, number>).acceptedClaimCount
            : null,
        full_text_char_count:
          typeof (source as unknown as Record<string, unknown>).fullTextCharCount === "number"
            ? (source as unknown as Record<string, number>).fullTextCharCount
            : null,
        source_use_level: metadataText(source, "sourceUseLevel") || null,
        normalized_claims_zh_tw: dedupeStrings([
          ...(normalizedEvidenceBySource.get(
            source.canonicalSourceIdentity?.trim() || source.dedupeKey?.trim() || sourceRecordKey(source),
          ) ?? []),
          ...sourceCards.map((card) =>
            verifiedZhTwText(
              card.evidencePointZhTw,
              card.claimTextZhTw,
              card.usableEvidence,
              card.summary,
              card.mainClaim,
            ),
          ),
        ]).slice(0, 4),
        claim_ids: dedupeStrings(sourceCards.flatMap((card) => card.claimIds ?? [])),
        limitations: dedupeStrings(sourceCards.flatMap((card) => card.limitations)).slice(0, 3),
        usable_sections: dedupeStrings(sourceCards.flatMap((card) => card.usableSections ?? [])),
        evidence_access_levels: dedupeStrings(
          sourceCards.map((card) => card.sourceAccessLevel ?? card.source_access_level ?? null),
        ),
        extraction_methods: dedupeStrings(
          sourceCards.map((card) => card.trace?.extraction_method ?? null),
        ),
        evidence_buckets: dedupeStrings(sourceCards.map((card) => card.recommendationBucket ?? null)),
        retrieval_modes: dedupeStrings(sourceCards.map((card) => card.retrievalMode ?? null)),
        user_decisions: dedupeStrings(sourceCards.map((card) => card.userDecision ?? null)),
        citation_marker: `[S${index + 1}]`,
        relevance_score: source.relevanceScore ?? null,
        source_quality_score: source.sourceQualityScore ?? null,
      };
    }),
    sectionPlan: requestedSectionPlan.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
    })),
    compositionContract: input.reportPlan?.argumentMap
      ? {
          researchQuestion: input.reportPlan.argumentMap.researchQuestion,
          scope: input.reportPlan.argumentMap.scope,
          centralAnswer: input.reportPlan.argumentMap.centralAnswer,
          subQuestions: input.reportPlan.argumentMap.subQuestions,
          claims: input.reportPlan.argumentMap.claims,
          evidenceGaps: input.reportPlan.argumentMap.evidenceGaps,
          conclusionBoundary: input.reportPlan.argumentMap.conclusionBoundary,
          discoursePlan: input.reportPlan.discoursePlan ?? [],
          terminology: input.reportPlan.terminology ?? {},
          compositionKind: input.reportPlan.compositionKind ?? "limited_evidence_brief",
          audienceProfile: input.reportPlan.audienceProfile ?? null,
          reportArchetype: input.reportPlan.reportArchetype ?? null,
          heterogeneityBoundary: input.reportPlan.heterogeneityAnalysis?.synthesisBoundary ?? null,
        }
      : null,
  };
}

function unsupportedSentencesForParagraph(text: string, citationMarkers: string[]): string[] {
  const transitionPattern =
    /本段|以下|首先|其次|最後|因此本報告|現階段|後續|仍需|建議|可以作為|不形成完整結論|目前(?:來源|資料)不足|已納入的資料尚未提供|資料缺口|不能形成完整/u;
  return text
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) => ASSERTIVE_SENTENCE_PATTERN.test(sentence))
    .filter((sentence) => !transitionPattern.test(sentence))
    .filter((sentence) => !citationMarkers.some((marker) => marker && sentence.includes(marker)));
}

function citationMarkerVariants(marker: string | null | undefined): string[] {
  const cleaned = cleanText(marker);
  if (!cleaned) return [];
  const canonical = canonicalInlineCitationMarker(cleaned);
  const numeric = canonical?.match(/\d+/u)?.[0];
  return dedupeStrings([
    canonical,
    numeric ? `[S${numeric}]` : null,
  ]);
}

export function paragraphClaimsForSection(input: {
  sectionId: string;
  prose: string;
  evidenceCardIds: string[];
  evidenceById: Map<string, PipelineEvidenceCard>;
  plannedClaimIds?: string[];
  plannedClaims?: ReportPlannedClaim[];
  paragraphPlans?: ReportParagraphPlan[];
}): ReportWriterParagraphClaim[] {
  const cards = input.evidenceCardIds
    .map((id) => input.evidenceById.get(id))
    .filter((card): card is PipelineEvidenceCard => Boolean(card));
  const allCardMarkers = new Map(
    cards.map((card) => [
      card.id,
      dedupeStrings([
        ...citationMarkerVariants(card.citationMarker),
        ...citationMarkerVariants(card.citationText),
      ]),
    ] as const),
  );
  const assignedLegacyClaimIds = new Set<string>();
  const sectionClaimIds = input.plannedClaimIds?.length
    ? dedupeStrings(input.plannedClaimIds)
    : dedupeStrings(cards.flatMap((card) => card.claimIds ?? []));
  const plannedClaimById = new Map(
    (input.plannedClaims ?? []).map((claim) => [claim.claimId, claim] as const),
  );
  const paragraphs = reportSectionParagraphs(input.prose);
  return paragraphs.map((paragraph, index) => {
    const inlineMarkers = extractCanonicalCitationMarkers(paragraph);
    const inlineCards = inlineMarkers.length > 0
      ? cards.filter((card) =>
          (allCardMarkers.get(card.id) ?? []).some((marker) => inlineMarkers.includes(marker)),
        )
      : [];
    const semanticScores = cards.map((card) => ({
      card,
      score: sentenceEvidenceAlignmentScore(paragraph, card),
    }));
    const bestSemanticScore = Math.max(-1, ...semanticScores.map((item) => item.score));
    const semanticCards = bestSemanticScore >= 0
      ? semanticScores
          .filter((item) => item.score >= Math.max(2, Math.floor(bestSemanticScore * 0.55)))
          .map((item) => item.card)
      : [];
    // A paragraph plan is positional and single-use. Extra model paragraphs
    // must earn their bindings semantically instead of inheriting the final
    // plan (which would recreate a blanket citation cluster).
    const paragraphPlan = input.paragraphPlans?.[index];
    const structuralClaimIds = dedupeStrings(
      paragraphPlan?.supportedClaimIds ?? [],
    ).filter((claimId) => sectionClaimIds.includes(claimId));
    const structuralEvidenceIds = new Set(
      structuralClaimIds.flatMap((claimId) =>
        plannedClaimById.get(claimId)?.supportingEvidenceIds ?? []
      ),
    );
    const structuralCards = cards.filter((card) => structuralEvidenceIds.has(card.id));
    const effectiveCards = inlineCards.length > 0
      ? inlineCards
      : semanticCards.length > 0
        ? semanticCards
        : structuralCards.length > 0
          ? structuralCards
          : cards.length === 1 && ASSERTIVE_SENTENCE_PATTERN.test(paragraph)
            ? cards
            : [];
    const citationMarkers = inlineMarkers.length > 0
      ? inlineMarkers
      : dedupeStrings(effectiveCards.flatMap((card) => allCardMarkers.get(card.id) ?? []));
    const evidenceBoundClaimIds = dedupeStrings([
      ...effectiveCards.flatMap((card) => card.claimIds ?? []),
      ...(input.plannedClaims ?? [])
        .filter((claim) =>
          claim.supportingEvidenceIds.some((evidenceId) =>
            effectiveCards.some((card) => card.id === evidenceId),
          ),
        )
        .map((claim) => claim.claimId),
    ]).filter((claimId) => sectionClaimIds.includes(claimId));
    const claimScores = (input.plannedClaims ?? [])
      .filter((claim) => sectionClaimIds.includes(claim.claimId))
      .map((claim) => {
        const paragraphTokens = evidenceAlignmentTokens(paragraph);
        const claimTokens = evidenceAlignmentTokens(claim.claimText);
        let score = 0;
        for (const token of paragraphTokens) {
          if (claimTokens.has(token)) score += 1;
        }
        return { claimId: claim.claimId, score };
      });
    const bestClaimScore = Math.max(0, ...claimScores.map((item) => item.score));
    const semanticallyBoundClaimIds = bestClaimScore > 0
      ? claimScores
          .filter((item) => item.score >= Math.max(2, Math.floor(bestClaimScore * 0.6)))
          .map((item) => item.claimId)
      : [];
    const candidateClaimIds = dedupeStrings([
      ...structuralClaimIds,
      ...evidenceBoundClaimIds,
      ...semanticallyBoundClaimIds,
      ...(structuralClaimIds.length === 0 && evidenceBoundClaimIds.length === 0 &&
          semanticallyBoundClaimIds.length === 0 && effectiveCards.length > 0 &&
          sectionClaimIds.length === 1
        ? sectionClaimIds
        : []),
    ]);
    const paragraphClaimIds = input.plannedClaims?.length || input.paragraphPlans?.length
      ? candidateClaimIds
      : candidateClaimIds.filter((claimId) => !assignedLegacyClaimIds.has(claimId));
    paragraphClaimIds.forEach((claimId) => assignedLegacyClaimIds.add(claimId));
    return {
      paragraphId: `${input.sectionId}-p${index + 1}`,
      sectionId: input.sectionId,
      claimIds: paragraphClaimIds,
      evidenceCardIds: effectiveCards.map((card) => card.id),
      citationMarkers,
      generatedTextZhTw: paragraph,
      unsupportedSentences: effectiveCards.length > 0 && paragraphClaimIds.length > 0
        ? []
        : unsupportedSentencesForParagraph(paragraph, inlineMarkers),
    };
  });
}

function boundClaimIdsForSection(
  section: Pick<ReportWriterSection, "paragraphClaims">,
): string[] {
  return dedupeStrings(
    (section.paragraphClaims ?? []).flatMap((paragraph) => paragraph.claimIds),
  );
}

function buildDeterministicSections(
  paragraphs: DraftParagraph[],
  evidenceCards: PipelineEvidenceCard[] = [],
): ReportWriterSection[] {
  const planById = new Map(SECTION_PLAN.map((section) => [section.sectionId, section]));
  const evidenceById = new Map(evidenceCards.map((card) => [card.id, card]));
  return paragraphs.map((paragraph) => ({
    sectionId: paragraph.sectionId,
    title: planById.get(paragraph.sectionId)?.title ?? paragraph.sectionId,
    prose: paragraph.text,
    evidenceCardIds: paragraph.evidenceIds,
    citationIds: paragraph.citationIds,
    generationMethod: "deterministic_evidence_fallback",
    paragraphClaims: paragraphClaimsForSection({
      sectionId: paragraph.sectionId,
      prose: paragraph.text,
      evidenceCardIds: paragraph.evidenceIds,
      evidenceById,
      plannedClaimIds: paragraph.claimIds,
    }),
    warnings: paragraph.warnings,
  }));
}

function reportWriterSectionPlan(
  sectionEvidenceMap: SectionEvidenceMapEntry[],
): ReportWriterSectionPlan[] {
  const conflictPattern = /conflict|contradict|inconsistent|差異|不一致|相反|爭議/iu;
  const targetWordCounts: Record<ReportSectionPlanId, number> = {
    abstract: 220,
    introduction: 320,
    research_question: 220,
    literature_review: 480,
    methodology: 320,
    findings: 480,
    discussion: 480,
    limitations: 240,
    conclusion: 280,
  };
  return sectionEvidenceMap.map((entry) => {
    const accessLevels = new Set(
      entry.evidenceCards
        .map((card) => cleanText(card.sourceAccessLevel).toLowerCase())
        .filter(Boolean),
    );
    const hasFullText = [...accessLevels].some((level) => level.includes("full"));
    const hasAbstract = entry.evidenceCards.some((card) =>
      card.abstractOnly || [...accessLevels].some((level) => level.includes("abstract")),
    );
    const evidenceLevel: ReportWriterSectionPlan["evidenceLevel"] =
      entry.evidenceCards.length === 0
        ? "metadata_limited"
        : hasFullText && hasAbstract
          ? "mixed"
          : hasFullText
            ? "full_text"
            : hasAbstract
              ? "abstract"
              : "metadata_limited";
    const conflictingEvidenceCardIds = entry.evidenceCards
      .filter((card) =>
        conflictPattern.test(
          [card.mainClaim, card.usableEvidence, ...card.limitations].filter(Boolean).join(" "),
        ),
      )
      .map((card) => card.id);
    const uncertaintyOrLimitations = dedupeStrings([
      ...entry.evidenceGaps,
      ...entry.evidenceCards.flatMap((card) => card.limitations),
    ]).slice(0, 6);
    return {
      sectionId: entry.sectionId,
      title: entry.title,
      paragraphPurpose: entry.paragraphPurpose,
      plannedClaims: (
        entry.plannedClaims.length > 0
          ? entry.plannedClaims.map((claim) => claim.claimText)
          : entry.evidenceCards.map((card) => card.mainClaim)
      ).slice(0, 5),
      plannedClaimIds: entry.plannedClaims.map((claim) => claim.claimId),
      allowedCitationKeys: entry.allowedCitationKeys,
      evidenceCardIds: entry.evidenceCards.map((card) => card.id),
      conflictingEvidenceCardIds,
      evidenceLevel,
      targetWordCount: targetWordCounts[entry.sectionId],
      supportLevel: entry.supportLevel,
      hasSufficientEvidence:
        entry.supportLevel !== "limited" && entry.evidenceCards.length > 0,
      needsMoreEvidence: entry.supportLevel === "limited" || entry.evidenceGaps.length > 0,
      evidenceGaps: entry.evidenceGaps,
      uncertaintyOrLimitations,
    };
  });
}

function shouldKeepLlmSection(section: ReportWriterSection): boolean {
  if (section.evidenceCardIds.length === 0 && section.citationIds.length === 0) return false;
  if (containsRawReportLeak(section.prose)) return false;
  if (containsRawEnglishEvidenceText(section.prose)) return false;
  if (forbiddenInstructionTextMatches(section.prose).length > 0) return false;
  if (section.sectionId === "findings" && !/(?:\[S\d+\]|［S\d+］)/u.test(section.prose)) {
    return false;
  }
  if (
    section.sectionId === "discussion" &&
    !/一致|差異|比較|對照|適用|外推|邊界|限制|情境/u.test(section.prose)
  ) {
    return false;
  }
  if (
    section.sectionId === "discussion" &&
    /主要發現是|研究發現為|結果顯示/u.test(section.prose)
  ) {
    return false;
  }
  if (
    section.sectionId === "conclusion" &&
    (!/綜合|結論|現階段|可回答|回答|證據|支持|關聯|一致|因此|整體而言/u.test(section.prose) ||
      /主要發現是|研究發現為|結果顯示/u.test(section.prose))
  ) {
    return false;
  }
  return !GENERIC_SECTION_PATTERNS.some((pattern) => pattern.test(section.prose));
}

function pruneUncitedAssertiveSentences(
  section: ReportWriterSection,
): ReportWriterSection | null {
  if (["research_question", "methodology", "limitations"].includes(section.sectionId)) {
    return section;
  }
  const sentences = section.prose
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const kept = sentences.filter(
    (sentence) =>
      (!ASSERTIVE_SENTENCE_PATTERN.test(sentence) &&
        !/(?:這些|前述|上述|各項|不同)?來源(?:之間|中|顯示|指出|支持|提供|共同)/u.test(sentence)) ||
      EXPLICIT_EVIDENCE_BOUNDARY_PATTERN.test(sentence) ||
      /(\[S\d+\]|［S\d+］)/u.test(sentence),
  );
  if (kept.length === 0) return null;
  if (kept.length === sentences.length) return section;
  const prose = normalizeReaderFacingProse(kept.join("\n\n"));
  return {
    ...section,
    prose,
    unsupportedSentences: [],
    paragraphClaims: section.paragraphClaims?.map((paragraph) => ({
      ...paragraph,
      generatedTextZhTw: prose,
      unsupportedSentences: [],
    })),
    warnings: dedupeStrings([
      ...(section.warnings ?? []),
      "uncited_assertive_sentences_removed",
    ]),
  };
}

function mergeReadyLlmSection(
  section: ReportWriterSection,
): ReportWriterSection | null {
  const pruned = pruneUncitedAssertiveSentences(section);
  if (!pruned) return null;
  // Instruction leaks and raw-language violations continue through the
  // established fail-closed merge path, which replaces them with the audited
  // baseline. Only content that would otherwise disappear because it is
  // generic or entirely unsupported should consume a scoped model repair.
  if (
    forbiddenInstructionTextMatches(pruned.prose).length > 0 ||
    containsRawReportLeak(pruned.prose) ||
    containsRawEnglishEvidenceText(pruned.prose)
  ) {
    return pruned;
  }
  return shouldKeepLlmSection(pruned) ? pruned : null;
}

export function forbiddenInstructionTextMatches(text: string): string[] {
  return FORBIDDEN_INSTRUCTION_PATTERNS
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

function insufficientSectionReplacement(
  section: ReportWriterSection,
  entry: SectionEvidenceMapEntry | undefined,
): ReportWriterSection {
  const evidencePoints = dedupeStrings(
    (entry?.evidenceCards ?? []).map((card) =>
      firstPresentText(card.mainClaim, card.usableEvidence, card.summary),
    ),
  ).slice(0, 2);
  const missing = dedupeStrings(entry?.evidenceGaps ?? []).slice(0, 2);
  const availableText =
    evidencePoints.length > 0
      ? `已納入的資料主要提供${proseJoin(evidencePoints)}。`
      : "已納入的資料尚未提供足夠的可核對摘錄。";
  const missingText =
    missing.length > 0
      ? `但仍缺少${proseJoin(missing)}。`
      : "但仍缺少可比較的全文片段、方法細節或同儕審查研究。";
  const prose = normalizeReaderFacingProse(
    `目前來源不足以支撐完整的「${section.title}」。${availableText}\n\n${missingText}因此本節僅能提出初步整理，不能形成強結論。`,
  );
  return {
    ...section,
    prose,
    paragraphClaims: section.paragraphClaims?.map((paragraph) => ({
      ...paragraph,
      generatedTextZhTw: prose,
      unsupportedSentences: [],
    })),
    warnings: dedupeStrings([
      ...(section.warnings ?? []),
      "forbidden_instruction_text_replaced_with_evidence_gap",
    ]),
  };
}

function sanitizeForbiddenInstructionSections(
  sections: ReportWriterSection[],
  sectionEvidenceMap: SectionEvidenceMapEntry[],
): ReportWriterSection[] {
  const mapById = new Map(sectionEvidenceMap.map((entry) => [entry.sectionId, entry]));
  return sections.map((section) => {
    const normalizedProse = normalizeReaderFacingProse(section.prose);
    if (
      forbiddenInstructionTextMatches(normalizedProse).length > 0 ||
      containsRawReportLeak(normalizedProse)
    ) {
      return insufficientSectionReplacement(
        section,
        mapById.get(section.sectionId as ReportSectionPlanId),
      );
    }
    return {
      ...section,
      prose: normalizedProse,
    };
  });
}

function canonicalSentenceFingerprint(value: string): string | null {
  const fingerprint = value
    .replace(/[［\[]\s*S\d+\s*[］\]]/giu, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
  return fingerprint.length >= 14 ? fingerprint : null;
}

function splitReaderSentences(value: string): string[] {
  const prepared = value
    .replace(
      /(部分來源僅依摘要整理[^。！？!?；;]*不能誇大成全文論證)[；;]/gu,
      "$1。\n",
    )
    .replace(
      /(綜合以上摘錄[^。！？!?；;]*本節主軸)[；;](?=差異或未覆蓋處)/gu,
      "$1，",
    );
  return prepared
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

interface EvidenceAlignedModelSentence {
  sentence: string;
  evidenceCards: PipelineEvidenceCard[];
}

function splitEvidenceAlignmentSentences(value: string): string[] {
  return canonicalizeCitationMarkersInText(value)
    .replace(/\r\n?/gu, "\n")
    .split(/(?<=[。！？!?；;])|(?<=\.)(?!\d)|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
}

function evidenceAlignmentTokens(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length >= 2);
  for (const match of value.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const cjk = match[0];
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= cjk.length - size; index += 1) {
        tokens.push(cjk.slice(index, index + size));
      }
    }
  }
  return new Set(tokens);
}

function evidenceAlignmentNumbers(value: string): string[] {
  const withoutMarkers = canonicalizeCitationMarkersInText(value)
    .replace(/\[S\d+\]/gu, "");
  return Array.from(withoutMarkers.matchAll(/\d+(?:\.\d+)?\s*%?/gu)).map((match) =>
    match[0].replace(/\s+/gu, "")
  );
}

function evidenceSupportText(card: PipelineEvidenceCard): string {
  return dedupeStrings([
    card.supportSpan,
    card.supportedByText,
    ...(card.supportSpans ?? []).map((span) => span.text),
    card.quotedText,
    card.quoted_text,
    card.claimTextOriginal,
    card.abstract,
  ]).join(" ");
}

function crossLanguagePair(left: string, right: string): boolean {
  const leftHasCjk = /[\u3400-\u9fff]/u.test(left);
  const rightHasCjk = /[\u3400-\u9fff]/u.test(right);
  const leftHasLatin = /[A-Za-z]{3,}/u.test(left);
  const rightHasLatin = /[A-Za-z]{3,}/u.test(right);
  return (leftHasCjk && !rightHasCjk && rightHasLatin) ||
    (leftHasLatin && !leftHasCjk && rightHasCjk && !rightHasLatin);
}

function sentenceNeedsStrictEvidenceAlignment(sentence: string): boolean {
  return /(?:\d|%|因為|因此|導致|造成|影響|降低|提高|增加|減少|高於|低於|比較|優於|劣於|政策|建議|should|because|cause|causal|effect|increase|decrease|higher|lower|compare|policy)/iu.test(sentence);
}

function supportContainsSentenceNumbers(sentence: string, support: string): boolean {
  const numbers = evidenceAlignmentNumbers(sentence);
  if (numbers.length === 0) return true;
  const supportNumbers = new Set(evidenceAlignmentNumbers(support));
  return numbers.every((number) => supportNumbers.has(number));
}

function hasEvidenceAlignmentOverlap(sentence: string, support: string): boolean {
  if (!support || !supportContainsSentenceNumbers(sentence, support)) return false;
  const cleanSentence = canonicalizeCitationMarkersInText(sentence)
    .replace(/\[S\d+\]/gu, "")
    .trim();
  const sentenceTokens = evidenceAlignmentTokens(cleanSentence);
  const supportTokens = evidenceAlignmentTokens(support);
  let overlap = 0;
  for (const token of sentenceTokens) {
    if (supportTokens.has(token)) overlap += 1;
  }
  const requiredOverlap = sentenceNeedsStrictEvidenceAlignment(cleanSentence) ? 3 : 2;
  return overlap >= requiredOverlap || support.includes(cleanSentence);
}

function evidencePreservesClaimStrength(sentence: string, support: string): boolean {
  const strengthChecks: Array<readonly [RegExp, RegExp]> = [
    [/(?:必然|一定|所有|全部|完全|always|all\b)/iu, /(?:必然|一定|所有|全部|完全|always|all\b)/iu],
    [/(?:證實|證明|確定|prove[ds]?|confirm(?:ed|s)?)/iu, /(?:證實|證明|確定|prove[ds]?|confirm(?:ed|s)?)/iu],
    [/(?:導致|造成|因果|cause[ds]?|causal)/iu, /(?:導致|造成|因果|cause[ds]?|causal)/iu],
    [/(?:提升|增加|改善|increase[ds]?|improve[ds]?)/iu, /(?:提升|增加|改善|increase[ds]?|improve[ds]?)/iu],
    [/(?:降低|減少|惡化|decrease[ds]?|reduce[ds]?|worsen(?:ed|s)?)/iu, /(?:降低|減少|惡化|decrease[ds]?|reduce[ds]?|worsen(?:ed|s)?)/iu],
  ];
  return strengthChecks.every(([claimPattern, supportPattern]) =>
    !claimPattern.test(sentence) || supportPattern.test(support)
  );
}

function verifiedBilingualEvidenceClaim(card: PipelineEvidenceCard): string | null {
  const support = evidenceSupportText(card);
  const claimZhTw = cleanText(card.claimTextZhTw);
  const reviewed =
    !card.needsReview &&
    !card.needsManualReview &&
    card.extractionMethod !== "rule_fallback_claim_extraction";
  const exactSupport = card.governanceFlags?.includes("exact_support_span_verified") ?? false;
  if (!reviewed || !exactSupport || !claimZhTw || !support) return null;
  if (!/[\u3400-\u9fff]/u.test(claimZhTw) || !crossLanguagePair(claimZhTw, support)) {
    return null;
  }
  if (!supportContainsSentenceNumbers(claimZhTw, support)) return null;
  return claimZhTw;
}

function sentenceAlignedWithEvidence(
  sentence: string,
  cards: PipelineEvidenceCard[],
): boolean {
  const semanticSupport: string[] = [];
  for (const card of cards) {
    const support = evidenceSupportText(card);
    if (!supportContainsSentenceNumbers(sentence, support)) continue;
    if (!evidencePreservesClaimStrength(sentence, support)) continue;
    if (hasEvidenceAlignmentOverlap(sentence, support)) return true;
    if (crossLanguagePair(sentence, support)) {
      const bilingualClaim = verifiedBilingualEvidenceClaim(card);
      if (!bilingualClaim) continue;
      semanticSupport.push(bilingualClaim);
      if (hasEvidenceAlignmentOverlap(sentence, bilingualClaim)) return true;
      continue;
    }
    const reviewedClaim = verifiedZhTwText(
      card.claimTextZhTw,
      card.mainClaimZhTw,
      card.evidencePointZhTw,
    );
    if (reviewedClaim) {
      semanticSupport.push(reviewedClaim);
      if (hasEvidenceAlignmentOverlap(sentence, reviewedClaim)) return true;
    }
  }
  return semanticSupport.length > 0 &&
    hasEvidenceAlignmentOverlap(sentence, semanticSupport.join(" "));
}

function sentenceEvidenceAlignmentScore(
  sentence: string,
  card: PipelineEvidenceCard,
): number {
  const cleanSentence = canonicalizeCitationMarkersInText(sentence)
    .replace(/\[S\d+\]/gu, "")
    .trim();
  const supports = dedupeStrings([
    evidenceSupportText(card),
    cleanText(card.claimTextZhTw),
    cleanText(card.mainClaimZhTw),
    cleanText(card.evidencePointZhTw),
    cleanText(card.claim),
    cleanText(card.mainClaim),
    cleanText(card.usableEvidence),
    cleanText(card.summary),
  ]).map((support) =>
    support
      .replace(/(?:證據)?限制(?:在於|是)?[：:]?[\s\S]*$/u, "")
      .trim()
  ).filter(Boolean);
  const sentenceHasLandSurfaceTemperature = /(?:地表溫度|\bLST\b|land surface temperature)/iu.test(cleanSentence);
  const sentenceHasCoolingOutcome = /(?:冷卻效果|降溫效果|冷島效應|cooling effect)/iu.test(cleanSentence);
  let best = -1;
  for (const support of supports) {
    const supportHasLandSurfaceTemperature = /(?:地表溫度|\bLST\b|land surface temperature)/iu.test(support);
    const supportHasCoolingOutcome = /(?:冷卻效果|降溫效果|冷島效應|cooling effect)/iu.test(support);
    if (
      sentenceHasLandSurfaceTemperature &&
      !sentenceHasCoolingOutcome &&
      !supportHasLandSurfaceTemperature
    ) continue;
    if (
      sentenceHasCoolingOutcome &&
      !sentenceHasLandSurfaceTemperature &&
      !supportHasCoolingOutcome
    ) continue;
    if (!supportContainsSentenceNumbers(cleanSentence, support)) continue;
    if (!evidencePreservesClaimStrength(cleanSentence, support)) continue;
    const sentenceTokens = evidenceAlignmentTokens(cleanSentence);
    const supportTokens = evidenceAlignmentTokens(support);
    let overlap = 0;
    for (const token of sentenceTokens) {
      if (supportTokens.has(token)) overlap += 1;
    }
    const required = sentenceNeedsStrictEvidenceAlignment(cleanSentence) ? 3 : 2;
    if (overlap < required && !support.includes(cleanSentence)) continue;
    best = Math.max(best, overlap + (support.includes(cleanSentence) ? 10_000 : 0));
  }
  return best;
}

function explicitCaseStudyAnchors(value: string): string[] {
  return dedupeStrings(
    Array.from(
      canonicalizeCitationMarkersInText(value).matchAll(
        /([\u3400-\u9fffA-Za-z][\u3400-\u9fffA-Za-z·'’.-]{1,23})(?:案例|建成區研究|研究則|研究所|研究顯示|研究指出)/gu,
      ),
    ).map((match) => match[1]),
  ).filter((anchor) =>
    !/^(?:本|該|此|現有|前述|都市|城市|綠地|文獻|相關|納入|整體|跨來源)$/u.test(anchor)
  );
}

function explicitLatinTechnicalAnchors(value: string): string[] {
  return dedupeStrings(
    Array.from(
      canonicalizeCitationMarkersInText(value).matchAll(/\b[A-Za-z][A-Za-z0-9+.-]{2,}\b/gu),
    ).map((match) => match[0].toLowerCase()),
  ).filter((anchor) =>
    !/^(?:and|the|for|with|from|case|study|urban|green|space|city|land|surface|temperature|effect|effects)$/u.test(anchor)
  );
}

function evidencePreservesIdentityAnchors(
  sentence: string,
  card: PipelineEvidenceCard,
): boolean {
  const cardText = dedupeStrings([
    evidenceSupportText(card),
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.claim,
    card.mainClaim,
    card.usableEvidence,
    card.summary,
  ]).join(" ");
  const caseAnchors = explicitCaseStudyAnchors(sentence);
  if (caseAnchors.length > 0 && !caseAnchors.some((anchor) => cardText.includes(anchor))) {
    return false;
  }
  const latinAnchors = explicitLatinTechnicalAnchors(sentence);
  if (latinAnchors.length >= 2) {
    const normalizedCardText = cardText.toLowerCase();
    const matched = latinAnchors.filter((anchor) => normalizedCardText.includes(anchor)).length;
    if (matched === 0) return false;
  }
  return true;
}

function alignedModelSentencesForSection(
  section: ReportWriterSection,
  evidenceById: Map<string, PipelineEvidenceCard>,
): EvidenceAlignedModelSentence[] {
  const sectionCards = section.evidenceCardIds
    .map((id) => evidenceById.get(id))
    .filter((card): card is PipelineEvidenceCard => Boolean(card));
  const cardsByMarker = new Map<string, PipelineEvidenceCard[]>();
  for (const card of sectionCards) {
    const markers = dedupeStrings([
      ...citationMarkerVariants(card.citationMarker),
      ...citationMarkerVariants(card.citationText),
    ]);
    for (const marker of markers) {
      cardsByMarker.set(marker, [...(cardsByMarker.get(marker) ?? []), card]);
    }
  }
  return splitEvidenceAlignmentSentences(section.prose).flatMap((sentence) => {
    if (READER_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(sentence))) return [];
    const markers = extractCanonicalCitationMarkers(sentence);
    if (markers.length === 0) return [];
    const referencedCards = Array.from(new Map(
      markers
        .flatMap((marker) => cardsByMarker.get(marker) ?? [])
        .map((card) => [card.id, card] as const),
    ).values());
    if (referencedCards.length === 0) return [];
    const exactlyAlignedCards = referencedCards.filter((card) =>
      evidencePreservesIdentityAnchors(sentence, card) &&
      sentenceAlignedWithEvidence(sentence, [card])
    );
    if (exactlyAlignedCards.length === 0) return [];
    return [{ sentence, evidenceCards: exactlyAlignedCards }];
  });
}

const CROSS_LANGUAGE_COMPLETENESS_SECTIONS = new Set([
  "introduction",
  "literature_review",
  "discussion",
]);

function sectionNeedsEvidenceBoundRepair(
  section: ReportWriterSection,
  evidenceById: Map<string, PipelineEvidenceCard>,
  topic: string,
  requiredEvidenceIds: string[] = [],
  enforceSourceEcho = false,
): boolean {
  if (enforceSourceEcho && detectSourceEchoIssues([section], evidenceById).length > 0) return true;
  if (section.sectionId === "conclusion") {
    const usedEvidenceIds = new Set(section.evidenceCardIds);
    if (requiredEvidenceIds.some((id) => !usedEvidenceIds.has(id))) return true;
    const requiredCards = requiredEvidenceIds
      .map((id) => evidenceById.get(id))
      .filter((card): card is PipelineEvidenceCard => Boolean(card));
    const globalSourceIds = dedupeStrings(
      Array.from(evidenceById.values()).map((card) => card.sourceId),
    );
    const citedMarkers = new Set(extractCanonicalCitationMarkers(section.prose));
    const citedSourceIds = new Set(requiredCards
      .filter((card) => {
        const ordinal = globalSourceIds.indexOf(card.sourceId);
        const markers = dedupeStrings([
          ...citationMarkerVariants(card.citationMarker),
          ...citationMarkerVariants(card.citationText),
          ...(ordinal >= 0 ? [`[S${ordinal + 1}]`] : []),
        ]);
        return markers.some((marker) => citedMarkers.has(marker));
      })
      .map((card) => card.sourceId));
    if (requiredCards.some((card) => !citedSourceIds.has(card.sourceId))) return true;
    const alignedSourceIds = new Set(
      alignedModelSentencesForSection(section, evidenceById)
        .flatMap((item) => item.evidenceCards.map((card) => card.sourceId)),
    );
    if (requiredCards.some((card) => !alignedSourceIds.has(card.sourceId))) return true;
    if (/(?:^|[。！？!?]\s*)(?:但)?這些(?:結果|發現|證據)/u.test(section.prose)) return true;
    const sourceCount = new Set(
      section.evidenceCardIds
        .map((id) => evidenceById.get(id)?.sourceId)
        .filter((id): id is string => Boolean(id)),
    ).size;
    const numeralValues: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    };
    const statedGroups = [...section.prose.matchAll(/([一二三四五六七八九十])者(?:合併|共同|整體|綜合)/gu)];
    if (statedGroups.some((match) => numeralValues[match[1] ?? ""] !== sourceCount)) return true;
  }
  if (!CROSS_LANGUAGE_COMPLETENESS_SECTIONS.has(section.sectionId)) return false;
  const cards = section.evidenceCardIds
    .map((id) => evidenceById.get(id))
    .filter((card): card is PipelineEvidenceCard => Boolean(card));
  const usesCrossLanguageEvidence = cards.some((card) => {
    const support = evidenceSupportText(card);
    return support && crossLanguagePair(section.prose, support);
  });
  if (!usesCrossLanguageEvidence) return false;
  if (READER_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(section.prose))) return true;
  const aligned = alignedModelSentencesForSection(section, evidenceById);
  const sourceCount = new Set(
    aligned.flatMap((item) => item.evidenceCards.map((card) => card.sourceId)),
  ).size;
  if (aligned.length < 2 || sourceCount < 2) return true;
  const localBoundary = taiwanCampusExtrapolationBoundary(topic, cards);
  return Boolean(
    section.sectionId === "discussion" &&
      localBoundary &&
      !/未直接涵蓋台灣校園|不能把其他地區.*外推到台灣校園/u.test(section.prose),
  );
}

function reconstructEvidenceBoundModelSection(input: {
  candidates: Array<ReportWriterSection | undefined>;
  evidenceById: Map<string, PipelineEvidenceCard>;
  topic: string;
  requiredEvidenceIds?: string[];
}): ReportWriterSection | null {
  const candidates = input.candidates.filter(
    (section): section is ReportWriterSection => Boolean(section),
  );
  const base = candidates.at(-1);
  if (!base) return null;
  const aligned = candidates.flatMap((section) =>
    alignedModelSentencesForSection(section, input.evidenceById)
  );
  let uniqueSentences = uniqueReportFragments(aligned.map((item) => item.sentence));
  let referencedCards = Array.from(new Map(
    aligned
      .flatMap((item) => item.evidenceCards)
      .map((card) => [card.id, card] as const),
  ).values());
  if (base.sectionId === "conclusion" && input.requiredEvidenceIds?.length) {
    const requiredCards = input.requiredEvidenceIds
      .map((id) => input.evidenceById.get(id))
      .filter((card): card is PipelineEvidenceCard => Boolean(card));
    const conclusionLead = candidates
      .filter((section) => section.sectionId === "conclusion")
      .flatMap((section) => splitReaderSentences(section.prose))
      .find((sentence) => /(?:回答|證據|關聯|支持|一致|綜合|結論)/u.test(sentence));
    const sourceSentences = requiredCards.flatMap((card) => {
      const matches = aligned
        .filter((item) => item.evidenceCards.some((itemCard) => itemCard.id === card.id))
        .sort((left, right) =>
          left.evidenceCards.length - right.evidenceCards.length ||
          left.sentence.length - right.sentence.length
        );
      return matches[0] ? [matches[0].sentence] : [];
    });
    uniqueSentences = uniqueReportFragments([
      ...(conclusionLead && sourceSentences.length < 6 ? [conclusionLead] : []),
      ...sourceSentences,
    ]);
    referencedCards = requiredCards;
  }
  if (uniqueSentences.length < 2 || new Set(referencedCards.map((card) => card.sourceId)).size < 2) {
    return null;
  }
  const localBoundary = base.sectionId === "discussion"
    ? taiwanCampusExtrapolationBoundary(input.topic, referencedCards)
    : null;
  const prose = normalizeReaderFacingProse([
    ...uniqueSentences.slice(
      0,
      base.sectionId === "conclusion"
        ? Math.max(6, input.requiredEvidenceIds?.length ?? 0)
        : 4,
    ),
    ...(localBoundary && !uniqueSentences.some((sentence) => sentence.includes(localBoundary))
      ? [`${localBoundary}。`]
      : []),
  ].join("\n\n"));
  const evidenceCardIds = referencedCards.map((card) => card.id);
  const reconstructed: ReportWriterSection = {
    ...base,
    prose,
    evidenceCardIds,
    citationIds: dedupeStrings(referencedCards.map((card) => card.sourceId)),
    generationMethod: "llm_verified_sentence_reconstruction",
    paragraphClaims: paragraphClaimsForSection({
      sectionId: base.sectionId,
      prose,
      evidenceCardIds,
      evidenceById: input.evidenceById,
      plannedClaimIds: boundClaimIdsForSection(base),
    }),
    warnings: dedupeStrings([
      ...(base.warnings ?? []),
      "section_reconstructed_from_evidence_aligned_model_sentences",
    ]),
  };
  return sectionNeedsEvidenceBoundRepair(
    reconstructed,
    input.evidenceById,
    input.topic,
    input.requiredEvidenceIds,
  )
    ? null
    : reconstructed;
}

function sectionRoleBoundary(sectionId: string): string {
  const boundaries: Record<string, string> = {
    abstract: "摘要只概括現有資料可支持的研究範圍、主要方向與限制。",
    introduction: "本節界定研究背景與問題意識，後續判斷仍須回到可追溯資料。",
    research_question: "研究問題以現有資料可觀察或比較的範圍為界，不預設尚未驗證的答案。",
    literature_review: "本節整合來源之間可核對的共同點與差異，不以單一資料代替整體文獻。",
    methodology: "本節交代資料選取與判讀方式，所有正文主張仍須保留可追溯關係。",
    findings: "本節只列出可由引用資料直接支持的結果，不把證據缺口改寫成研究發現。",
    discussion: "本節只比較現有資料的一致性、差異、適用邊界與限制，不重複前節已列出的實質內容。",
    limitations: "本節集中說明資料涵蓋、方法與外推邊界，避免把限制誤寫成實證結果。",
    conclusion: "綜合前述結果與限制，現階段只能形成範圍受限的答案；未被直接資料涵蓋的部分不納入結論。",
  };
  return boundaries[sectionId] ?? "本節內容以現有可追溯資料的支持範圍為界。";
}

const REPEATED_READER_BOILERPLATE_PATTERNS = [
  /共同部分可組成本節主軸.*(?:差異|未覆蓋處).*後續檢驗/u,
  /部分來源僅依摘要整理.*不能誇大成全文論證/u,
];

function isNonEssentialRepeatedBoilerplate(value: string): boolean {
  const readerText = canonicalizeCitationMarkersInText(value)
    .replace(/[［\[]\s*S\d+\s*[］\]]/giu, "")
    .trim();
  return REPEATED_READER_BOILERPLATE_PATTERNS.some((pattern) => pattern.test(readerText));
}

function mergeSentenceCitationMarkers(sentence: string, values: string[]): string {
  const markers = dedupeStrings(values.flatMap((value) =>
    extractCanonicalCitationMarkers(value)
  ));
  if (markers.length === 0) return sentence;
  const canonical = canonicalizeCitationMarkersInText(sentence)
    .replace(/[［\[]\s*S\d+\s*[］\]]/giu, "")
    .trim();
  const punctuation = canonical.match(/[。！？!?；;]$/u)?.[0] ?? "。";
  const body = canonical.replace(/[。！？!?；;]+$/u, "").trim();
  return `${body}${markers.join("")}${punctuation}`;
}

interface ReaderBoilerplateOccurrence {
  key: string;
  sectionId: string;
  sentence: string;
  fingerprint: string;
  citationCount: number;
}

function dedupeRepeatedReaderBoilerplate(
  sections: ReportWriterSection[],
  evidenceById: Map<string, PipelineEvidenceCard>,
): ReportWriterSection[] {
  const occurrences = new Map<string, ReaderBoilerplateOccurrence[]>();
  const sentenceKeysBySection = new Map<string, Map<string, string>>();

  sections.forEach((section, sectionIndex) => {
    const sentenceKeys = new Map<string, string>();
    reportSectionParagraphs(section.prose).forEach((paragraph, paragraphIndex) => {
      splitReaderSentences(paragraph).forEach((sentence, sentenceIndex) => {
        const fingerprint = canonicalSentenceFingerprint(sentence);
        if (!fingerprint || !isNonEssentialRepeatedBoilerplate(sentence)) return;
        const key = `${sectionIndex}:${paragraphIndex}:${sentenceIndex}`;
        sentenceKeys.set(`${paragraphIndex}:${sentenceIndex}`, key);
        const occurrence: ReaderBoilerplateOccurrence = {
          key,
          sectionId: section.sectionId,
          sentence,
          fingerprint,
          citationCount: extractCanonicalCitationMarkers(sentence).length,
        };
        occurrences.set(fingerprint, [...(occurrences.get(fingerprint) ?? []), occurrence]);
      });
    });
    sentenceKeysBySection.set(section.sectionId, sentenceKeys);
  });

  const preferredByFingerprint = new Map<string, ReaderBoilerplateOccurrence>();
  for (const [fingerprint, repeated] of occurrences) {
    if (repeated.length < 2) continue;
    const preferred = repeated.reduce((best, candidate) => {
      if (candidate.citationCount !== best.citationCount) {
        return candidate.citationCount > best.citationCount ? candidate : best;
      }
      if (candidate.sectionId === "limitations" && best.sectionId !== "limitations") {
        return candidate;
      }
      return best;
    });
    preferredByFingerprint.set(fingerprint, preferred);
  }

  return sections.map((section) => {
    let duplicateRemoved = false;
    const sentenceKeys = sentenceKeysBySection.get(section.sectionId) ?? new Map();
    const paragraphs = reportSectionParagraphs(section.prose)
      .map((paragraph, paragraphIndex) => {
        const kept = splitReaderSentences(paragraph).flatMap((sentence, sentenceIndex) => {
          const fingerprint = canonicalSentenceFingerprint(sentence);
          if (!fingerprint) return [sentence];
          const preferred = preferredByFingerprint.get(fingerprint);
          if (!preferred) return [sentence];
          const key = sentenceKeys.get(`${paragraphIndex}:${sentenceIndex}`);
          if (key !== preferred.key) {
            duplicateRemoved = true;
            return [];
          }
          const repeated = occurrences.get(fingerprint) ?? [];
          return [mergeSentenceCitationMarkers(
            sentence,
            repeated.map((occurrence) => occurrence.sentence),
          )];
        });
        return kept.join("");
      })
      .filter(Boolean);
    if (paragraphs.length < 2) {
      paragraphs.push(sectionRoleBoundary(section.sectionId));
    }
    const prose = normalizeReaderFacingProse(paragraphs.join("\n\n"));
    return {
      ...section,
      prose,
      paragraphClaims: paragraphClaimsForSection({
        sectionId: section.sectionId,
        prose,
        evidenceCardIds: section.evidenceCardIds,
        evidenceById,
        plannedClaimIds: boundClaimIdsForSection(section),
      }),
      warnings: duplicateRemoved
        ? dedupeStrings([...(section.warnings ?? []), "cross_section_duplicate_boilerplate_removed"])
        : section.warnings,
    };
  });
}

function enforceReaderFacingSectionContract(
  sections: ReportWriterSection[],
  evidenceById: Map<string, PipelineEvidenceCard>,
): ReportWriterSection[] {
  const normalized = sections.map((section) => ({
    ...section,
    prose: normalizeReaderFacingProse(section.prose),
  }));
  const byId = new Map(normalized.map((section) => [section.sectionId, section]));
  const seenSubstantiveSentences = new Set<string>();
  const dedupedById = new Map<string, ReportWriterSection>();

  for (const sectionId of ["findings", "discussion", "conclusion"] as const) {
    const section = byId.get(sectionId);
    if (!section) continue;
    let duplicateRemoved = false;
    const paragraphs = reportSectionParagraphs(section.prose)
      .map((paragraph) => {
        const kept = splitReaderSentences(paragraph).filter((sentence) => {
          const fingerprint = canonicalSentenceFingerprint(sentence);
          if (!fingerprint) return true;
          if (seenSubstantiveSentences.has(fingerprint)) {
            duplicateRemoved = true;
            return false;
          }
          seenSubstantiveSentences.add(fingerprint);
          return true;
        });
        return kept.join("");
      })
      .filter(Boolean);
    if (sectionId !== "findings" && paragraphs.length < 2) {
      paragraphs.push(sectionRoleBoundary(sectionId));
    }
    const prose = normalizeReaderFacingProse(paragraphs.join("\n\n"));
    const evidenceCardIds = section.evidenceCardIds;
    dedupedById.set(sectionId, {
      ...section,
      prose,
      paragraphClaims: paragraphClaimsForSection({
        sectionId,
        prose,
        evidenceCardIds,
        evidenceById,
        plannedClaimIds: boundClaimIdsForSection(section),
      }),
      warnings: duplicateRemoved
        ? dedupeStrings([...(section.warnings ?? []), "cross_section_duplicate_sentence_removed"])
        : section.warnings,
    });
  }

  const roleContracted = normalized.map((section) => {
    const contracted = dedupedById.get(section.sectionId) ?? section;
    if (containsRawReportLeak(contracted.prose)) {
      throw new Error(`reader-facing report leak remained in section ${section.sectionId}`);
    }
    if (dedupedById.has(section.sectionId)) return contracted;
    return {
      ...contracted,
      paragraphClaims: paragraphClaimsForSection({
        sectionId: contracted.sectionId,
        prose: contracted.prose,
        evidenceCardIds: contracted.evidenceCardIds,
        evidenceById,
        plannedClaimIds: boundClaimIdsForSection(contracted),
      }),
    };
  });
  return dedupeRepeatedReaderBoilerplate(roleContracted, evidenceById);
}

function mergeSectionsWithDeterministicBaseline(
  llmSections: ReportWriterSection[],
  baselineSections: ReportWriterSection[],
  validation: CitationValidationResult,
  evidenceById: Map<string, PipelineEvidenceCard>,
): ReportWriterSection[] {
  const llmById = new Map(llmSections.map((section) => [section.sectionId, section]));
  return baselineSections.map((baseline) => {
    const rawCandidate = llmById.get(baseline.sectionId);
    const candidate = rawCandidate ? pruneUncitedAssertiveSentences(rawCandidate) : null;
    const sectionWarnings = validation.sectionWarnings.get(
      baseline.sectionId as ReportSectionPlanId,
    ) ?? [];
    if (!candidate || !shouldKeepLlmSection(candidate)) {
      return {
        ...baseline,
        warnings: dedupeStrings([...(baseline.warnings ?? []), ...sectionWarnings]),
      };
    }
    const uncitedBaselineParagraphs = reportSectionParagraphs(baseline.prose)
      .filter((paragraph) => extractCanonicalCitationMarkers(paragraph).length === 0);
    const prose = normalizeReaderFacingProse(
      candidate.prose,
      uncitedBaselineParagraphs.length > 0 ? uncitedBaselineParagraphs : [baseline.prose],
    );
    const evidenceCardIds = candidate.evidenceCardIds.length > 0
      ? candidate.evidenceCardIds
      : baseline.evidenceCardIds;
    const citationIds = candidate.citationIds.length > 0
      ? candidate.citationIds
      : baseline.citationIds;
    return {
      ...baseline,
      ...candidate,
      prose,
      evidenceCardIds,
      citationIds,
      paragraphClaims: paragraphClaimsForSection({
        sectionId: candidate.sectionId,
        prose,
        evidenceCardIds,
        evidenceById,
        plannedClaimIds: dedupeStrings([
          ...boundClaimIdsForSection(candidate),
          ...boundClaimIdsForSection(baseline),
        ]),
      }),
      warnings: dedupeStrings([...(candidate.warnings ?? []), ...sectionWarnings]),
    };
  });
}

function positiveEnvNumber(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function compactEvidenceText(source: SourceRecord): string {
  const readerFacingText = verifiedZhTwText(
    source.mainEvidencePointZhTw,
    metadataText(source, "evidenceSummaryZhTw"),
    source.readableSummaryZhTw,
    source.readableSummaryZhTW,
    source.abstractZhTw,
  );
  if (readerFacingText) {
    const firstSentence = readerFacingText.split(/(?<=[.!?。！？])\s+/u)[0]?.trim();
    if (firstSentence) return truncateText(firstSentence, 220);
    return truncateText(readerFacingText, 220);
  }
  const abstract = cleanText(source.abstract) || cleanText(source.snippet);
  if (abstract) return UNTRANSLATED_EVIDENCE_NOTICE;
  const locator = source.doi ? `DOI：${source.doi}` : source.url;
  return locator ? `來源位置：${locator}` : "此來源已接受，但仍缺少可驗證的重點摘錄。";
}

function sourceText(source: SourceRecord, index: number): string {
  const id = source.id || `source-${index + 1}`;
  const title = source.title || "標題待確認";
  const abstract = source.abstract?.trim() || "摘要不足";
  const citation = source.authors?.[0]?.trim() || source.publisher?.trim() || "作者待確認";
  return [
    `evidenceCardId: evidence:${id}:0`,
    `sourceId: ${id}`,
    `claim: 此來源可作為「${title}」的摘要型佐證。`,
    `evidence: ${abstract.slice(0, 700)}`,
    `source: ${title}`,
    `provider: ${source.sourceType}`,
    `citationText: ${citation}（${source.year ?? "年份待確認"}）`,
    `limitation: ${source.abstract?.trim() ? "目前依摘要整理，尚未讀取全文。" : "此來源尚無摘要，僅可建立書目線索。"}`,
  ].join("\n");
}

function compactEvidenceCard(
  card: ReportWriterEvidenceCard,
  index: number,
  evidenceLimit = PRIMARY_EVIDENCE_TEXT_LIMIT,
  normalizedClaimOverride?: string,
): string {
  const mainClaim = verifiedZhTwText(
    normalizedClaimOverride,
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
    card.mainClaim,
    card.claim,
    card.summary,
  );
  const usableEvidence = verifiedZhTwText(
    normalizedClaimOverride,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
    card.usableEvidence,
    card.evidence,
    card.summary,
  );
  return [
    `evidenceCardId: ${card.id || `evidence-${index + 1}`}`,
    `evidenceId: ${evidenceIdentity(card)}`,
    `sourceId: ${card.sourceId}`,
    `canonicalSourceKey: ${canonicalKeyForEvidenceCard(card)}`,
    `citationKey: ${citationKeyForEvidenceCard(card)}`,
    `claimIds: ${(card.claimIds ?? []).join(", ") || "none"}`,
    `citationMarker: ${card.citationMarker ?? card.citationText?.match(/\[S\d+\]/u)?.[0] ?? "unknown"}`,
    `title: ${card.title || card.sourceTitle || "標題待確認"}`,
    `sourceType: ${card.sourceType || card.sourceProvider || "unknown"}`,
    `sourceAccessLevel: ${card.sourceAccessLevel ?? card.source_access_level ?? "unknown"}`,
    `extractionStatus: ${card.extractionStatus ?? "unknown"}`,
    `evidenceType: ${card.evidenceType ?? card.evidence_type ?? "unknown"}`,
    `sourceLocation: ${card.sourceLocation ?? card.source_location ?? card.sectionHeading ?? card.section_heading ?? "unknown"}`,
    `extractionMethod: ${card.trace?.extraction_method ?? "unknown"}`,
    `reliability: ${card.reliability || reliabilityLabel(card)}`,
    `mainClaim: ${mainClaim}`,
    `normalizedClaimZhTw: ${(mainClaim || "UNRESOLVED_NORMALIZATION").slice(0, evidenceLimit)}`,
    `normalizedEvidenceZhTw: ${(usableEvidence || "UNRESOLVED_NORMALIZATION").slice(0, evidenceLimit)}`,
    `fact.location: ${card.location ?? "not_reported"}`,
    `fact.setting: ${card.researchSetting ?? "not_reported"}`,
    `fact.design: ${card.studyDesign ?? "not_reported"}`,
    `fact.dataScope: ${card.dataScope ?? "not_reported"}`,
    `fact.exposure: ${card.exposure ?? "not_reported"}`,
    `fact.outcome: ${card.outcome ?? "not_reported"}`,
    `fact.exactResult: ${(card.exactResult ?? usableEvidence ?? "not_reported").slice(0, evidenceLimit)}`,
    `fact.numericResult: ${card.numericResult ?? "not_reported"}`,
    `fact.applicability: ${card.applicability ?? "source_context_only"}`,
    `fact.locator: ${card.locator ?? card.sourceLocation ?? "not_reported"}`,
    `fact.directness: ${card.directness ?? card.evidenceDirectnessTier ?? "C"}`,
    `relevance: ${card.relevance || "研究背景"}`,
    `source: ${card.sourceTitle || "標題待確認"}`,
    `provider: ${card.provider || card.sourceProvider || "unknown"}`,
    `recommendationBucket: ${card.recommendationBucket ?? "manual_review"}`,
    `retrievalMode: ${card.retrievalMode ?? "unknown"}`,
    `userDecision: ${card.userDecision ?? "pending"}`,
    `needsManualReview: ${card.needsManualReview ? "yes" : "no"}`,
    `governanceFlags: ${(card.governanceFlags ?? []).join(", ") || "none"}`,
    `sectionTargets: ${(card.sectionTargets ?? []).join(", ") || (card.usableSections ?? []).join(", ") || "none"}`,
    `citationText: ${card.citationText || "引用資訊待確認"}`,
    `limitation: ${[...(card.limitationsZhTw ?? []), ...(card.limitations ?? [])].join("；") || card.limitation || "目前依已接受來源與證據卡整理，不可超出證據內容。"}`,
  ].join("\n");
}

function compactAcceptedSource(
  source: SourceRecord,
  index: number,
  abstractLimit = PRIMARY_SOURCE_TEXT_LIMIT,
): string {
  const id = source.id || `source-${index + 1}`;
  const normalizedSummary = verifiedZhTwText(
    source.readableSummaryZhTw,
    source.readableSummaryZhTW,
    source.mainEvidencePointZhTw,
    metadataText(source, "evidenceSummaryZhTw"),
    source.abstractZhTw,
  );
  return [
    `sourceId: ${id}`,
    `title: ${source.title || "標題待確認"}`,
    `authors: ${source.authors.length ? source.authors.join(", ") : "作者待確認"}`,
    `year: ${source.year ?? "年份待確認"}`,
    `provider: ${source.provider || source.sourceType}`,
    `sourceType: ${source.sourceType}`,
    `doi: ${source.doi ?? "n/a"}`,
    `url: ${source.url ?? "n/a"}`,
    `normalizedSummaryZhTw: ${(normalizedSummary || "UNRESOLVED_NORMALIZATION").slice(0, abstractLimit)}`,
    `relevanceReasonZhTw: ${firstPresentText(source.relevanceReasonZhTw, source.relevanceReasonZhTW, source.sourceRelevanceReasonZhTw, metadataText(source, "mainEvidenceFacet"), "尚未整理")}`,
    `metadata: relevance=${source.relevanceScore ?? source.topicRelevance ?? "n/a"}, quality=${source.sourceQualityScore ?? source.evidenceQuality ?? "n/a"}, grounding=${source.evidenceGrounding ?? "n/a"}`,
    `sourceGovernance: bucket=${source.recommendationBucket ?? "manual_review"}, role=${source.sourceRole ?? "unknown"}, retrievalMode=${source.retrievalMode ?? "unknown"}, userDecision=${source.userDecision ?? "pending"}`,
    `recommendation: ${source.recommendation ?? (source.shouldRecommendAccept ? "candidate" : "review")}`,
  ].join("\n");
}

function writerSafeFactProjection(fact: unknown): Record<string, unknown> {
  const record = fact && typeof fact === "object" ? fact as Record<string, unknown> : {};
  const allowedKeys = [
    "factId", "evidenceId", "sourceId", "canonicalSourceId",
    "sourceType", "evidenceLevel", "sourceAccessLevel", "sectionType",
    "population", "ageGroup", "sampleSize", "geography", "studySetting", "studyDesign",
    "exposureConcept", "exposureMeasure", "outcomeConcept", "outcomeMeasure",
    "statisticType", "value", "lowerCI", "upperCI", "pValue", "unit", "direction",
    "mediator", "moderator", "confounders", "adjustmentStatus", "evidenceDirectness",
    "certainty", "confidence", "authorInterpretation", "authorLimitations",
    "extractionConfidence", "verificationStatus",
    "evidenceFunction", "location", "setting", "exposure", "outcome", "method",
    "associationDirection", "applicability", "themeKey", "conceptAxes",
    "comparabilityKey", "limitations", "supportingEvidenceIds", "supportingSourceIds",
    "writerEligible",
  ] as const;
  const projected: Record<string, unknown> = Object.fromEntries(
    allowedKeys.filter((key) => key in record).map((key) => [key, record[key]]),
  );
  if (Array.isArray(record.numericalResults)) {
    projected.numericalResults = record.numericalResults.map((result) => {
      const numerical = result && typeof result === "object"
        ? result as Record<string, unknown>
        : {};
      return Object.fromEntries(
        ["measure", "value", "unit", "statisticType", "comparisonBasis", "lowerCI", "upperCI", "pValue"]
          .filter((key) => key in numerical)
          .map((key) => [key, numerical[key]]),
      );
    });
  }
  return projected;
}

function compactPromptValue(value: unknown): unknown {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") return cleanText(value).slice(0, 240) || undefined;
  if (Array.isArray(value)) {
    // Arrays in the canonical prompt schemas carry semantic identity or
    // evidence bindings. Truncating them here makes the model see a different
    // graph from the validator (for example, seven fact bindings become six).
    // Keep every item; any future display-only list limit must be applied by a
    // schema-specific projector before it reaches this function.
    const items = value
      .map((item) => compactPromptValue(item))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  return value;
}

function compactPromptCell(value: unknown): unknown {
  return compactPromptValue(value) ?? null;
}

const DEIDENTIFIED_FACT_COLUMNS = [
  "factRef", "sourceType", "evidenceLevel", "sourceAccessLevel", "sectionType",
  "population", "ageGroup", "sampleSize", "geography", "studySetting", "studyDesign",
  "exposureConcept", "exposureMeasure", "outcomeConcept", "outcomeMeasure",
  "statisticType", "value", "lowerCI", "upperCI", "pValue", "unit", "direction",
  "mediator", "moderator", "confounders", "adjustmentStatus", "evidenceDirectness",
  "certainty", "authorInterpretation", "authorLimitations", "verificationStatus",
  "evidenceFunction", "applicability", "limitations",
] as const;
const IDENTIFIED_FACT_COLUMNS = [
  "factId", "evidenceId", "sourceId", "supportingEvidenceIds",
  "supportingSourceIds", ...DEIDENTIFIED_FACT_COLUMNS.slice(1),
] as const;
const DEIDENTIFIED_CLAIM_COLUMNS = [
  "claimRef", "claimType", "statement", "supportingFactRefs",
  "contradictingFactRefs", "backgroundFactRefs", "applicability", "confidence",
  "evidenceDirectness", "limitations",
] as const;
const IDENTIFIED_CLAIM_COLUMNS = [
  ...DEIDENTIFIED_CLAIM_COLUMNS, "citationIds", "visualId",
] as const;
const CLUSTER_COLUMNS = [
  "clusterId", "purpose", "label", "factIds", "evidenceIds", "sourceIds",
  "sharedFinding", "agreement", "directions", "comparability",
  "conflictPoints", "limitations",
] as const;
const PLANNED_CLAIM_COLUMNS = [
  "claimId", "claimGraphId", "sectionId", "statement", "factIds", "clusterIds",
  "evidenceIds", "sourceKeys", "citationKeys", "strength", "wording", "limitations",
] as const;

/**
 * LLM packets are a projection of the canonical fact model, not a second fact
 * model. Omitted properties are canonically null/empty and must not be
 * inferred. This keeps one atomic result readable without copying card-level
 * aliases, trace arrays, or repeated null fields into every prompt.
 */
function compactPromptFact(
  fact: unknown,
  options: { deidentified: boolean; factRef?: string },
): unknown[] {
  const record = writerSafeFactProjection(fact);
  const semanticValues = [
    record.sourceType, record.evidenceLevel, record.sourceAccessLevel, record.sectionType,
    record.population, record.ageGroup, record.sampleSize, record.geography,
    record.studySetting, record.studyDesign,
    record.exposureConcept, record.exposureMeasure, record.outcomeConcept,
    record.outcomeMeasure, record.statisticType, record.value, record.lowerCI,
    record.upperCI, record.pValue, record.unit, record.direction, record.mediator,
    record.moderator, record.confounders, record.adjustmentStatus,
    record.evidenceDirectness, record.certainty, record.authorInterpretation,
    record.authorLimitations, record.verificationStatus, record.evidenceFunction,
    record.applicability, record.limitations,
  ].map(compactPromptCell);
  return options.deidentified
    ? [options.factRef ?? compactPromptCell(record.factId), ...semanticValues]
    : [compactPromptCell(record.factId), compactPromptCell(record.evidenceId),
        compactPromptCell(record.sourceId), compactPromptCell(record.supportingEvidenceIds),
        compactPromptCell(record.supportingSourceIds), ...semanticValues];
}

function compactPromptClaim(
  claim: NonNullable<ReportPlan["claimGraph"]>["claims"][number],
  options: {
    deidentified: boolean;
    claimRef?: string;
    factRef?: (factId: string) => string;
  },
): unknown[] {
  const factRefs = (ids: string[]) => ids.map((id) => options.factRef?.(id) ?? id);
  const semantic = [
    options.claimRef ?? claim.claimId, claim.claimType,
    compactPromptCell(claim.readerFacingStatement),
    compactPromptCell(factRefs(claim.supportingFacts)),
    compactPromptCell(factRefs(claim.contradictingFacts)),
    compactPromptCell(factRefs(claim.backgroundFacts)),
    compactPromptCell(claim.applicability), compactPromptCell(claim.confidence),
    compactPromptCell(claim.evidenceDirectness), compactPromptCell(claim.limitations),
  ];
  return options.deidentified
    ? semantic
    : [...semantic, compactPromptCell(claim.citationIds), compactPromptCell(claim.visualId)];
}

function compactPromptCluster(
  cluster: NonNullable<ReportPlan["synthesisClusters"]>[number],
): unknown[] {
  return [cluster.clusterId, cluster.clusterPurpose, compactPromptCell(cluster.label),
    compactPromptCell(cluster.factIds), compactPromptCell(cluster.evidenceIds),
    compactPromptCell(cluster.sourceIds), compactPromptCell(cluster.sharedFindingZhTw),
    compactPromptCell(cluster.agreementStatus), compactPromptCell(cluster.associationDirections),
    compactPromptCell(cluster.comparabilityStatus), compactPromptCell(cluster.conflictPoints),
    compactPromptCell(cluster.limitations)];
}

function compactPromptPlannedClaim(
  claim: ReportPlannedClaim,
): unknown[] {
  return [claim.claimId, compactPromptCell(claim.claimGraphId), claim.sectionId,
    compactPromptCell(claim.claimText), compactPromptCell(claim.normalizedFactIds),
    compactPromptCell(claim.synthesisClusterIds), compactPromptCell(claim.supportingEvidenceIds),
    compactPromptCell(claim.supportingSourceKeys), compactPromptCell(claim.allowedCitationKeys),
    compactPromptCell(claim.evidenceStrength), compactPromptCell(claim.wordingStrength),
    compactPromptCell(claim.limitations)];
}

function canonicalNarrativeContractDiagnostics(plan: ReportPlan | undefined): string[] {
  const diagnostics: string[] = [];
  const facts = plan?.normalizedFacts ?? [];
  const claims = plan?.claimGraph?.claims ?? [];
  const passes = plan?.narrativePasses ?? [];
  if (facts.length === 0) diagnostics.push("canonical_atomic_facts_missing");
  if (claims.length === 0) diagnostics.push("canonical_claim_graph_missing");
  if (
    passes.length !== 2 ||
    passes[0]?.pass !== "teach_back" ||
    passes[1]?.pass !== "academic_reconstruction"
  ) {
    diagnostics.push("canonical_two_stage_narrative_contract_missing");
  }
  return diagnostics;
}

function canonicalPromptScope(
  plan: ReportPlan | undefined,
  prompt: ReportWriterAttemptPrompt,
) {
  const requestedSectionIds = new Set(
    prompt.sectionEvidenceMap.map((section) => section.sectionId),
  );
  const requestedSections = (plan?.sections ?? []).filter((section) =>
    requestedSectionIds.has(section.sectionId as ReportSectionPlanId)
  );
  const requestedPlannedClaimIds = new Set(
    prompt.sectionEvidenceMap.flatMap((section) =>
      section.plannedClaims.map((claim) => claim.claimId)
    ),
  );
  const plannedClaims = (plan?.plannedClaims ?? []).filter((claim) =>
    requestedPlannedClaimIds.has(claim.claimId)
  );
  const graphClaimIds = new Set(
    plannedClaims.flatMap((claim) => claim.claimGraphId ? [claim.claimGraphId] : []),
  );
  const graphClaims = (plan?.claimGraph?.claims ?? []).filter((claim) =>
    graphClaimIds.has(claim.claimId)
  );
  const factIds = new Set([
    ...plannedClaims.flatMap((claim) => claim.normalizedFactIds ?? []),
    ...graphClaims.flatMap((claim) => [
      ...claim.supportingFacts,
      ...claim.contradictingFacts,
      ...claim.backgroundFacts,
    ]),
  ]);
  const facts = (plan?.normalizedFacts ?? []).filter((fact) => factIds.has(fact.factId));
  const clusterIds = new Set([
    ...plannedClaims.flatMap((claim) => claim.synthesisClusterIds ?? []),
  ]);
  const clusters = (plan?.synthesisClusters ?? []).filter((cluster) =>
    clusterIds.has(cluster.clusterId)
  );
  const sourceIds = new Set([
    ...facts.flatMap((fact) => [fact.sourceId, ...(fact.supportingSourceIds ?? [])]),
    ...graphClaims.flatMap((claim) => claim.citationIds),
  ]);
  return {
    requestedSections,
    plannedClaims,
    graphClaims,
    graphClaimIds,
    facts,
    factIds,
    clusters,
    sourceIds,
  };
}

function scopedReportIntelligence(
  plan: ReportPlan | undefined,
  scope: ReturnType<typeof canonicalPromptScope>,
): Record<string, unknown> | null {
  if (!plan) return null;
  const conceptNodes = (plan.knowledgeModel?.nodes ?? []).filter((node) =>
    node.supportingFactIds.some((factId) => scope.factIds.has(factId))
  );
  const conceptNodeIds = new Set(conceptNodes.map((node) => node.nodeId));
  return {
    audienceProfile: plan.audienceProfile ?? null,
    reportArchetype: plan.reportArchetype ?? null,
    statisticalInterpretations: (plan.statisticalInterpretations ?? []).filter((item) =>
      scope.factIds.has(item.factId)
    ),
    heterogeneity: plan.heterogeneityAnalysis
      ? {
          comparisons: plan.heterogeneityAnalysis.comparisons.filter((comparison) =>
            scope.factIds.has(comparison.leftFactId) && scope.factIds.has(comparison.rightFactId)
          ),
          dominantDifferenceSources: plan.heterogeneityAnalysis.dominantDifferenceSources,
          synthesisBoundary: plan.heterogeneityAnalysis.synthesisBoundary,
        }
      : null,
    contradictions: (plan.contradictionAnalysis ?? []).filter((item) =>
      scope.graphClaimIds.has(item.claimId)
    ),
    knowledgeModel: plan.knowledgeModel
      ? {
          researchQuestion: plan.knowledgeModel.researchQuestion,
          nodes: conceptNodes,
          edges: plan.knowledgeModel.edges.filter((edge) =>
            conceptNodeIds.has(edge.fromNodeId) && conceptNodeIds.has(edge.toNodeId)
          ),
          evidenceGaps: plan.knowledgeModel.evidenceGaps,
        }
      : null,
  };
}

function teachBackEvidencePacket(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): string {
  const plan = input.reportPlan;
  const teachBackPass = plan?.narrativePasses?.find((pass) => pass.pass === "teach_back");
  const scope = canonicalPromptScope(plan, prompt);
  const factRefs = new Map(
    scope.facts.map((fact, index) => [fact.factId, `F${index + 1}`] as const),
  );
  const claimRefs = new Map(
    scope.graphClaims.map((claim, index) => [claim.claimId, `C${index + 1}`] as const),
  );
  const factRef = (factId: string) => factRefs.get(factId) ?? "UNRESOLVED_FACT";
  const facts = scope.facts.map((fact) =>
    compactPromptFact(fact, { deidentified: true, factRef: factRef(fact.factId) })
  );
  const claims = scope.graphClaims.map((claim) =>
    compactPromptClaim(claim, {
      deidentified: true,
      claimRef: claimRefs.get(claim.claimId) ?? "UNRESOLVED_CLAIM",
      factRef,
    })
  );
  return JSON.stringify({
    schemaVersion: "teach-back-packet/v1",
    researchQuestion: plan?.researchQuestion ?? input.topic,
    centralAnswer: plan?.centralAnswer ?? null,
    nullPolicy: "Omitted atomic fields are canonically null and must not be inferred.",
    factColumns: DEIDENTIFIED_FACT_COLUMNS,
    normalizedFacts: facts,
    claimGraph: {
      claimColumns: DEIDENTIFIED_CLAIM_COLUMNS,
      claims,
      edgeColumns: ["fromClaimRef", "toClaimRef", "relation"],
      edges: (plan?.claimGraph?.edges ?? [])
        .filter((edge) =>
          scope.graphClaimIds.has(edge.fromClaimId) && scope.graphClaimIds.has(edge.toClaimId)
        )
        .map((edge) => [
          claimRefs.get(edge.fromClaimId) ?? "UNRESOLVED_CLAIM",
          claimRefs.get(edge.toClaimId) ?? "UNRESOLVED_CLAIM",
          edge.relationship,
        ]),
    },
    narrativePass: teachBackPass
      ? {
          pass: teachBackPass.pass,
          inputClaimRefs: teachBackPass.inputClaimIds.map((claimId) =>
            claimRefs.get(claimId) ?? "UNRESOLVED_CLAIM"
          ),
          inputFactRefs: teachBackPass.inputFactIds.map(factRef),
          outputConstraints: teachBackPass.outputConstraints,
          citationMode: teachBackPass.citationMode,
        }
      : null,
  });
}

function synthesisEvidencePacket(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
  _evidenceLimit: number,
): string {
  const plan = input.reportPlan;
  const scope = canonicalPromptScope(plan, prompt);
  const fallbackFacts = [...prompt.evidenceCards]
    .map((card) => ({
      factId: `legacy-fact:${evidenceIdentity(card)}`,
      evidenceId: evidenceIdentity(card),
      sourceId: card.sourceId,
      citationKey: citationKeyForEvidenceCard(card),
      claimTextZhTw: verifiedZhTwText(
        card.claimTextZhTw,
        card.mainClaimZhTw,
        card.evidencePointZhTw,
        card.sourceSummaryZhTw,
        card.mainClaim,
      ),
      population: null,
      ageGroup: null,
      sampleSize: Number((card.dataScope ?? "").match(/\bn\s*[=:]\s*([\d,]+)/iu)?.[1]?.replace(/,/gu, "")) || null,
      geography: card.location ?? null,
      setting: card.researchSetting ?? null,
      studyDesign: card.studyDesign ?? null,
      exposureConcept: card.exposure ?? null,
      exposureMeasure: null,
      outcomeConcept: card.outcome ?? null,
      outcomeMeasure: null,
      statisticType: null,
      value: null,
      lowerCI: null,
      upperCI: null,
      unit: null,
      direction: null,
      mediator: null,
      adjustmentStatus: null,
      applicability: card.applicability ?? null,
      evidenceDirectness: card.directness ?? card.evidenceDirectnessTier ?? null,
      limitations: dedupeStrings([
        ...(card.limitationsZhTw ?? []),
        ...(card.limitations ?? []),
        card.limitation,
      ]),
    }))
    .sort((left, right) =>
      [left.outcomeConcept, left.exposureConcept, left.population, left.evidenceId]
        .map((value) => cleanText(value))
        .join("|")
        .localeCompare(
          [right.outcomeConcept, right.exposureConcept, right.population, right.evidenceId]
            .map((value) => cleanText(value))
            .join("|"),
        ),
    );
  const sourceRegistry = [...prompt.sources]
    .filter((source) => !plan?.normalizedFacts?.length || scope.sourceIds.has(source.id))
    .map((source) => ({
      sourceId: source.id,
      canonicalSourceIdentity:
        source.canonicalSourceIdentity ?? source.dedupeKey ?? sourceRecordKey(source),
      authors: source.authors,
      year: source.year,
    }))
    .sort((left, right) =>
      left.canonicalSourceIdentity.localeCompare(right.canonicalSourceIdentity) ||
      left.sourceId.localeCompare(right.sourceId),
    );
  return JSON.stringify({
    schemaVersion: "synthesis-evidence-packet/v2",
    researchQuestion: input.reportPlan?.researchQuestion ?? input.topic,
    centralAnswer: input.reportPlan?.centralAnswer ?? null,
    nullPolicy: "Omitted atomic fields are canonically null and must not be inferred.",
    clusterColumns: CLUSTER_COLUMNS,
    synthesisClusters: plan?.normalizedFacts?.length
      ? scope.clusters.map(compactPromptCluster)
      : [],
    factColumns: plan?.normalizedFacts?.length ? IDENTIFIED_FACT_COLUMNS : null,
    normalizedFacts: plan?.normalizedFacts?.length
      ? scope.facts.map((fact) => compactPromptFact(fact, { deidentified: false }))
      : fallbackFacts,
    claimGraph: plan?.normalizedFacts?.length
      ? {
          researchQuestion: plan.claimGraph?.researchQuestion ?? plan.researchQuestion,
          claimColumns: IDENTIFIED_CLAIM_COLUMNS,
          claims: scope.graphClaims.map((claim) =>
            compactPromptClaim(claim, { deidentified: false })
          ),
          edgeColumns: ["fromClaimId", "toClaimId", "relation"],
          edges: (plan.claimGraph?.edges ?? [])
            .filter((edge) =>
              scope.graphClaimIds.has(edge.fromClaimId) && scope.graphClaimIds.has(edge.toClaimId)
            )
            .map((edge) => [edge.fromClaimId, edge.toClaimId, edge.relationship]),
        }
      : null,
    reportIntelligence: scopedReportIntelligence(plan, scope),
    narrativePasses: (plan?.narrativePasses ?? []).map((pass) => ({
      pass: pass.pass,
      inputClaimIds: pass.inputClaimIds,
      inputFactIds: pass.inputFactIds,
      outputConstraints: pass.outputConstraints,
      citationMode: pass.citationMode,
    })),
    plannedClaimColumns: PLANNED_CLAIM_COLUMNS,
    plannedClaims: plan?.normalizedFacts?.length
      ? scope.plannedClaims.map(compactPromptPlannedClaim)
      : [],
    sourceIdentityColumns: ["sourceId", "canonicalSourceIdentity", "authors", "year"],
    sourceIdentityRegistry: sourceRegistry.map((source) => [
      source.sourceId,
      source.canonicalSourceIdentity,
      source.authors,
      source.year,
    ]),
    instruction:
      "Organize by thematic cluster and paragraph function. Source order is not a valid organizing principle.",
  });
}

function localAcademicEvidencePacket(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): string {
  const plan = input.reportPlan;
  const scope = canonicalPromptScope(plan, prompt);
  const factRefs = new Map(
    scope.facts.map((fact, index) => [fact.factId, `F${index + 1}`] as const),
  );
  const claimRefs = new Map(
    scope.graphClaims.map((claim, index) => [claim.claimId, `C${index + 1}`] as const),
  );
  const factRef = (factId: string) => factRefs.get(factId) ?? "UNRESOLVED_FACT";
  return JSON.stringify({
    schemaVersion: "local-academic-packet/v1",
    researchQuestion: plan?.researchQuestion ?? input.topic,
    centralAnswer: plan?.centralAnswer ?? null,
    nullPolicy: "Omitted atomic fields are canonically null and must not be inferred.",
    factColumns: DEIDENTIFIED_FACT_COLUMNS,
    facts: scope.facts.map((fact) =>
      compactPromptFact(fact, { deidentified: true, factRef: factRef(fact.factId) })
    ),
    claimColumns: IDENTIFIED_CLAIM_COLUMNS,
    claims: scope.graphClaims.map((claim) =>
      compactPromptClaim(claim, {
        deidentified: false,
        claimRef: claimRefs.get(claim.claimId) ?? "UNRESOLVED_CLAIM",
        factRef,
      })
    ),
    edgeColumns: ["fromClaimRef", "toClaimRef", "relationship"],
    edges: (plan?.claimGraph?.edges ?? [])
      .filter((edge) =>
        scope.graphClaimIds.has(edge.fromClaimId) && scope.graphClaimIds.has(edge.toClaimId)
      )
      .map((edge) => [
        claimRefs.get(edge.fromClaimId) ?? "UNRESOLVED_CLAIM",
        claimRefs.get(edge.toClaimId) ?? "UNRESOLVED_CLAIM",
        edge.relationship,
      ]),
    reportIntelligence: scopedReportIntelligence(plan, scope),
    narrativePasses: (plan?.narrativePasses ?? []).map((pass) => ({
      pass: pass.pass,
      inputClaimRefs: pass.inputClaimIds.map((claimId) =>
        claimRefs.get(claimId) ?? "UNRESOLVED_CLAIM"
      ),
      inputFactRefs: pass.inputFactIds.map(factRef),
      outputConstraints: pass.outputConstraints,
      citationMode: pass.citationMode,
    })),
    sectionBindings: prompt.sectionEvidenceMap.map((section) => ({
      sectionId: section.sectionId,
      claimRefs: dedupeStrings(section.plannedClaims.flatMap((claim) =>
        claim.claimGraphId ? [claimRefs.get(claim.claimGraphId)] : []
      )),
      evidenceCardIds: section.evidenceCards.map((card) => card.id),
      citationIds: dedupeStrings(section.evidenceCards.map((card) => card.sourceId)),
      limitation: section.evidenceGaps[0] ?? null,
    })),
    instruction:
      "Write by claim relationship and section function; source order is never an organizing principle.",
  });
}

function fallbackClaimFromSource(source: SourceRecord, _title: string): string {
  return (
    cleanFragment(verifiedZhTwText(
      metadataText(source, "mainEvidencePointZhTw"),
      metadataText(source, "readableSummaryZhTw"),
      metadataText(source, "readableSummaryZhTW"),
      metadataText(source, "abstractZhTw"),
      metadataText(source, "evidenceSummaryZhTw"),
      metadataText(source, "relevanceReasonZhTw"),
      metadataText(source, "sourceRelevanceReasonZhTw"),
    )) ||
    UNTRANSLATED_EVIDENCE_NOTICE
  );
}

function fallbackEvidenceCards(sources: SourceRecord[]): ReportWriterEvidenceCard[] {
  return sources.map((source, index) => {
    const id = source.id || `source-${index + 1}`;
    const canonicalSourceKey = source.canonicalSourceIdentity?.trim() ||
      source.dedupeKey?.trim() ||
      sourceRecordKey(source);
    const title = source.title || "標題待確認";
    const abstract = verifiedZhTwText(
      source.readableSummaryZhTw,
      source.readableSummaryZhTW,
      source.mainEvidencePointZhTw,
      metadataText(source, "evidenceSummaryZhTw"),
      source.abstractZhTw,
    ) || (source.abstract?.trim()
      ? UNTRANSLATED_EVIDENCE_NOTICE
      : "此來源尚無摘要，僅可作為書目線索。");
    const citation = source.authors?.[0]?.trim() || source.publisher?.trim() || "作者待確認";
    const mainClaim = fallbackClaimFromSource(source, title);
    const usableEvidence = compactEvidenceText(source);
    const derivation = source.abstract?.trim() ? "abstract-derived" : "metadata-derived";
    const sourceRelevance =
      firstPresentText(
        metadataText(source, "relevanceReasonZhTw"),
        metadataText(source, "sourceRelevanceReasonZhTw"),
        metadataText(source, "mainEvidenceFacet"),
      ) || "研究背景";
    const usableSections = metadataStringList(source, "usableSections");
    return {
      id: `evidence:${id}:0`,
      sourceId: id,
      canonicalSourceKey,
      dedupeKey: canonicalSourceKey,
      citationKey: canonicalSourceKey,
      claimIds: [],
      title,
      sourceType: source.sourceType,
      reliability: metadataText(source, "confidence") || reliabilityLabel({
        id: `evidence:${id}:0`,
        sourceId: id,
        claim: mainClaim,
        evidence: usableEvidence,
        summary: abstract,
        relevance: sourceRelevance || "研究背景",
        sourceTitle: title,
        sourceProvider: source.sourceType,
        recommendationBucket: inferredRecommendationBucketForSource(source),
        sourceRole: source.sourceRole ?? null,
        retrievalMode: source.retrievalMode ?? null,
        isPeerReviewed: source.isPeerReviewed ?? null,
        venue: source.containerTitle ?? null,
        providerHealthSnapshot: source.providerHealthSnapshot ?? null,
        acceptedByUser: source.acceptedByUser ?? null,
        userDecision: source.userDecision ?? null,
        acceptedAs: source.acceptedAs ?? null,
        doi: source.doi,
        abstract: source.abstract,
        provider: source.provider || source.sourceType,
        relevanceScore: source.relevanceScore ?? null,
        sourceQualityScore: source.sourceQualityScore ?? null,
        finalScore: source.finalScore ?? null,
        year: source.year,
        usableSections,
        citationText: `${citation}（${source.year ?? "年份待確認"}）`,
        limitation: source.abstract?.trim()
          ? "目前依摘要整理，尚未讀取全文。"
          : "此來源尚無摘要，僅可建立書目線索。",
      }),
      claim: mainClaim,
      mainClaim,
      mainClaimZhTw: mainClaim,
      evidence: usableEvidence,
      usableEvidence,
      claimTextZhTw: mainClaim,
      evidencePointZhTw: usableEvidence,
      sourceSummaryZhTw: abstract,
      summary: firstPresentText(
        metadataText(source, "evidenceSummaryZhTw"),
        source.readableSummaryZhTw,
        source.abstractZhTw,
        abstract,
      ),
      relevance: sourceRelevance,
      limitations: [
        source.abstract?.trim()
          ? "目前依摘要整理，尚未讀取全文。"
          : "此來源尚無摘要，僅可建立書目線索。",
      ],
      sectionTargets: mapWorkflowSectionsToReportSections(usableSections),
      sourceTitle: title,
      sourceProvider: source.sourceType,
      recommendationBucket: inferredRecommendationBucketForSource(source),
      sourceAccessLevel: derivation === "abstract-derived" ? "abstract_only" : "metadata_only",
      extractionStatus:
        derivation === "abstract-derived" ? "extraction_skipped_no_full_text" : "metadata_only",
      needsManualReview: true,
      governanceFlags: ["legacy_raw_source_fallback"],
      sourceRole: source.sourceRole ?? null,
      retrievalMode: source.retrievalMode ?? null,
      isPeerReviewed: source.isPeerReviewed ?? null,
      venue: source.containerTitle ?? null,
      providerHealthSnapshot: source.providerHealthSnapshot ?? null,
      acceptedByUser: source.acceptedByUser ?? null,
      userDecision: source.userDecision ?? null,
      acceptedAs: source.acceptedAs ?? null,
      doi: source.doi,
      abstract: source.abstract,
      provider: source.provider || source.sourceType,
      relevanceScore: source.relevanceScore ?? null,
      sourceQualityScore: source.sourceQualityScore ?? null,
      finalScore: source.finalScore ?? null,
      year: source.year,
      usableSections,
      citationText: `${citation}（${source.year ?? "年份待確認"}）`,
      limitation: source.abstract?.trim()
        ? "目前依摘要整理，尚未讀取全文。"
        : "此來源尚無摘要，僅可建立書目線索。",
      derivation,
      evidenceGrounding: source.abstract?.trim() ? "abstract_only" : "metadata_only",
    };
  });
}

function validEvidenceCards(
  inputCards: ReportWriterEvidenceCard[] | undefined,
  sources: SourceRecord[],
  context: Pick<ReportWriterInput, "workflowId" | "topicHash"> = {},
): ReportWriterEvidenceCard[] {
  const acceptedSourceIds = new Set(
    sources.map((source, index) => source.id || `source-${index + 1}`),
  );
  const workflowId = context.workflowId?.trim();
  const topicHash = context.topicHash?.trim();
  const cards = (inputCards ?? []).filter(
    (card) => {
      if (!card?.id?.trim() || !card?.sourceId?.trim()) return false;
      if (!acceptedSourceIds.has(card.sourceId)) return false;
      if (workflowId && card.workflowId !== workflowId) return false;
      if (topicHash && card.topicHash !== topicHash) return false;
      return Boolean(card.evidence?.trim() || card.summary?.trim() || card.claim?.trim());
    },
  );
  if (cards.length > 0) return cards;
  return !workflowId && !topicHash ? fallbackEvidenceCards(sources) : [];
}

function pipelineEvidenceCards(
  inputCards: ReportWriterEvidenceCard[] | undefined,
  sources: SourceRecord[],
  context: Pick<ReportWriterInput, "workflowId" | "topicHash"> = {},
): PipelineEvidenceCard[] {
  const validCards = validEvidenceCards(inputCards, sources, context);
  const sourceById = new Map(
    sources
      .map((source, index) => [source.id || `source-${index + 1}`, source] as const)
      .filter(([id]) => Boolean(id)),
  );
  return validCards.map((card) =>
    normalizePipelineEvidenceCard(card, sourceById.get(card.sourceId)),
  );
}

function sourceEligibleForReportWriter(
  source: SourceRecord,
  context: Pick<ReportWriterInput, "workflowId" | "topicHash">,
): boolean {
  if (source.reviewState !== "accepted") return false;
  if (context.workflowId?.trim() && source.workflowId !== context.workflowId) return false;
  if (context.topicHash?.trim() && source.topicHash !== context.topicHash) return false;
  if (
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow"
  ) {
    return false;
  }
  const usageRecommendation = (source as { usageRecommendation?: string | null }).usageRecommendation;
  if (usageRecommendation === "exclude") return false;
  if (source.relevanceLevel === "off_topic" || source.relevanceLevel === "low") {
    return false;
  }
  if (
    source.recommendationBucket === "manual_review" &&
    !(source.acceptedByUser || source.userDecision === "accepted_as_manual_review")
  ) {
    return false;
  }
  return true;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function neutralizeModelSourceCountShorthand(value: string): string {
  return value.replace(
    /(現有)?(?:\d+|[一二三四五六七八九十]+)(?:個|項|筆|份)(?:獨立)?(?:學術)?(?:來源|研究|文獻)/gu,
    (_match, existingPrefix: string | undefined) => existingPrefix ? "現有來源" : "納入來源",
  );
}

function sanitizeSection(
  value: unknown,
  evidenceToSource: Map<string, string>,
  evidenceById: Map<string, PipelineEvidenceCard>,
  allowedSourceIds: Set<string>,
  sectionBindings?: Map<string, SectionEvidenceMapEntry>,
): ReportWriterSection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const rawProse = typeof data.prose === "string"
    ? neutralizeModelSourceCountShorthand(
        normalizeReaderFacingProse(canonicalizeCitationMarkersInText(data.prose.trim())),
      )
    : "";
  const sectionBinding = sectionBindings?.get(sectionId);
  if (sectionBindings && !sectionBinding) return null;
  const sectionEvidenceIds = sectionBinding
    ? new Set(sectionBinding.evidenceCards.map((card) => card.id))
    : null;
  const sectionSourceIds = sectionBinding
    ? new Set(sectionBinding.evidenceCards.map((card) => card.sourceId))
    : allowedSourceIds;
  const sourceIdByMarkerNumber = dedupeStrings(
    Array.from(evidenceById.values()).map((card) => card.sourceId),
  );
  const rawMarkerSourceIds = new Set(
    extractCanonicalCitationMarkers(rawProse)
      .map((marker) => Number(marker.match(/\d+/u)?.[0] ?? 0))
      .filter((markerNumber) => markerNumber > 0)
      .map((markerNumber) => sourceIdByMarkerNumber[markerNumber - 1])
      .filter((sourceId): sourceId is string => Boolean(sourceId)),
  );
  const rawConclusionCoversCanonicalSources =
    sectionId === "conclusion" &&
    sectionBinding != null &&
    sectionBinding.evidenceCards.every((card) => rawMarkerSourceIds.has(card.sourceId));
  const rawConclusionHasDirectAnswer =
    sectionId === "conclusion" &&
    (
      /(?:現階段可回答|可回答的是|結論.*(?:支持|顯示|證據)|方向(?:大致)?一致|方向明確.*回答|綜合.*可追溯研究)/u.test(rawProse) ||
      rawProse.length >= 40
    );
  const modelEvidenceCardIds = stringList(
    data.evidenceCardIds ?? data.evidence_card_ids ?? data.evidenceIds,
  ).filter((id) => {
    const card = evidenceById.get(id);
    return Boolean(
      card &&
        evidenceToSource.has(id) &&
        (!sectionEvidenceIds || sectionEvidenceIds.has(id)) &&
      cardAllowedForReportSection(card, sectionId as ReportSectionPlanId),
    );
  });
  const useCanonicalBindingForMarkerFreeProse = Boolean(
    sectionBinding &&
      (extractCanonicalCitationMarkers(rawProse).length === 0 ||
        rawConclusionCoversCanonicalSources ||
        rawConclusionHasDirectAnswer),
  );
  const evidenceCardIds = useCanonicalBindingForMarkerFreeProse
    ? (sectionBinding?.evidenceCards.map((card) => card.id) ?? modelEvidenceCardIds)
    : modelEvidenceCardIds;
  const citationIds = stringList(data.citationIds)
    .map((id) => evidenceToSource.get(id) ?? id)
    .filter((id) => allowedSourceIds.has(id) && sectionSourceIds.has(id));
  const mappedCitationIds =
    citationIds.length > 0 && !useCanonicalBindingForMarkerFreeProse
      ? citationIds
      : evidenceCardIds
          .map((id) => evidenceToSource.get(id))
          .filter((id): id is string => Boolean(id));
  const structuredCards = evidenceCardIds
    .map((id) => evidenceById.get(id))
    .filter((card): card is PipelineEvidenceCard => Boolean(card))
    .filter((card) => mappedCitationIds.includes(card.sourceId));
  // Model-provided marker placement is not authoritative: a model can append
  // every allowed marker to a source-specific sentence. Remove those tokens
  // and rebuild sentence-level citations only from the structured evidence
  // identities returned for this section.
  const canonicalRawProse = canonicalizeCitationMarkersInText(rawProse)
    .replace(/(^|[。！？!?]\s*)(?:但)?這些(?:結果|發現|證據)/gu, "$1現有證據");
  let prose = structuredCards.length === 0
    ? rawProse
    : reportSectionParagraphs(canonicalRawProse)
        .map((paragraph) => splitReaderSentences(paragraph)
          .map((sentence) => {
            const sentenceMarkers = extractCanonicalCitationMarkers(sentence);
            const markerMatchedCards = structuredCards.filter((card) => {
              const variants = dedupeStrings([
                ...citationMarkerVariants(card.citationMarker),
                ...citationMarkerVariants(card.citationText),
              ]);
              return sentenceMarkers.some((marker) => {
                if (variants.includes(marker)) return true;
                const markerNumber = Number(marker.match(/\d+/u)?.[0] ?? 0);
                return markerNumber > 0 && sourceIdByMarkerNumber[markerNumber - 1] === card.sourceId;
              });
            });
            const markerFreeSentence = sentence
              .replace(/\[\s*S\d+\s*\]/giu, "")
              .replace(/[ \t]{2,}/gu, " ")
              .trim();
            // The model returns identities, not prose tokens. Reattach an
            // internal marker only where the sentence is semantically aligned
            // with that exact evidence card. An unsupported assertion remains
            // uncited and is removed by the existing fail-closed pruning step.
            const conclusionDirectAnswer = sectionId === "conclusion" &&
              /(?:依現有來源|依現有\s*\d+\s*個(?:獨立)?來源|綜合(?:現有|納入|前述).*來源|現階段可回答|可回答的是|方向(?:大致)?一致|方向明確.*回答)/u.test(markerFreeSentence);
            const semanticScores = structuredCards.map((card) => ({
              card,
              score: sentenceEvidenceAlignmentScore(markerFreeSentence, card),
            }));
            const bestSemanticScore = Math.max(-1, ...semanticScores.map((item) => item.score));
            const relativeSemanticCards = bestSemanticScore >= 0
              ? semanticScores
                  .filter((item) =>
                    item.score >= Math.max(3, Math.floor(bestSemanticScore * 0.55))
                  )
                  .map((item) => item.card)
              : [];
            const alignedCards = conclusionDirectAnswer
              ? structuredCards
              : sentenceMarkers.length === 1 && markerMatchedCards.length === 1
                ? Array.from(new Map(
                    [...markerMatchedCards, ...relativeSemanticCards]
                      .map((card) => [card.id, card] as const),
                  ).values())
                : bestSemanticScore >= 0
                  ? relativeSemanticCards
                  : structuredCards.filter((card) =>
                      sentenceAlignedWithEvidence(markerFreeSentence, [card])
                    );
            const markers = dedupeStrings(alignedCards.flatMap((card) => [
              ...citationMarkerVariants(card.citationMarker),
              ...citationMarkerVariants(card.citationText),
              ...(sourceIdByMarkerNumber.indexOf(card.sourceId) >= 0
                ? [`[S${sourceIdByMarkerNumber.indexOf(card.sourceId) + 1}]`]
                : []),
            ]));
            if (markers.length === 0) return markerFreeSentence;
            const punctuation = markerFreeSentence.match(/([\u3002\uff01\uff1f!?])$/u)?.[1] ?? "";
            const base = punctuation ? markerFreeSentence.slice(0, -1) : markerFreeSentence;
            return `${base}${markers.join("")}${punctuation || "\u3002"}`;
          })
          .join(""))
        .join("\n\n");
  if (
    sectionId === "conclusion" &&
    sectionBinding &&
    rawConclusionHasDirectAnswer &&
    structuredCards.length > 0
  ) {
    const requiredMarkers = dedupeStrings(structuredCards.flatMap((card) => {
      const ordinal = sourceIdByMarkerNumber.indexOf(card.sourceId);
      return ordinal >= 0 ? [`[S${ordinal + 1}]`] : [];
    }));
    const presentMarkers = new Set(extractCanonicalCitationMarkers(prose));
    const missingMarkers = requiredMarkers.filter((marker) => !presentMarkers.has(marker));
    if (missingMarkers.length > 0) {
      let coverageAdded = false;
      prose = splitReaderSentences(prose).map((sentence) => {
        if (
          coverageAdded ||
          !/(?:回答|證據|研究|關聯|支持|一致|綜合|結論)/u.test(sentence)
        ) return sentence;
        coverageAdded = true;
        const punctuation = sentence.match(/([。！？!?])$/u)?.[1] ?? "。";
        const body = sentence.replace(/[。！？!?]+$/u, "").trim();
        return `${body}${missingMarkers.join("")}${punctuation}`;
      }).join("");
    }
  }
  const warnings = stringList(data.warnings);
  if (
    !sectionId ||
    !title ||
    prose.length < 20 ||
    (evidenceCardIds.length === 0 && mappedCitationIds.length === 0)
  ) {
    return null;
  }
  return {
    sectionId,
    title,
    prose,
    evidenceCardIds,
    citationIds: Array.from(new Set(mappedCitationIds)),
    paragraphClaims: paragraphClaimsForSection({
      sectionId,
      prose,
      evidenceCardIds,
      evidenceById,
      plannedClaimIds: sectionBinding?.plannedClaims.map((claim) => claim.claimId),
      plannedClaims: sectionBinding?.plannedClaims,
      paragraphPlans: sectionBinding?.paragraphPlans,
    }),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function sectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.sections)) return data.sections;
  }
  return [];
}

function cleanHeadingText(value: string): string {
  return value
    .replace(/^[#*\-\s]+/u, "")
    .replace(/[：:]\s*$/u, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleAliasesForSection(sectionId: string): string[] {
  switch (sectionId) {
    case "abstract":
      return ["摘要", "abstract", "研究摘要"];
    case "introduction":
      return ["一、研究背景與動機", "一、研究動機", "研究動機", "研究背景", "研究背景與動機", "前言", "導論"];
    case "research_question":
      return ["二、研究問題", "研究問題", "問題意識", "研究提問"];
    case "literature_review":
      return ["三、文獻探討", "文獻探討", "文獻回顧", "相關研究"];
    case "methodology":
      return ["四、研究方法", "研究方法", "方法", "資料來源與方法"];
    case "findings":
      return ["五、主要發現", "四、資料與證據整理", "資料與證據整理", "主要發現", "研究發現", "結果"];
    case "discussion":
      return ["六、討論", "五、討論", "討論", "分析與討論"];
    case "limitations":
      return ["七、限制", "限制", "研究限制", "方法限制"];
    case "conclusion":
      return ["八、結論與建議", "六、結論與建議", "結論與建議", "結論", "建議"];
    default:
      return [];
  }
}

function matchSectionIdFromHeading(
  heading: string,
): { sectionId: string; matchedAlias: string } | null {
  const normalizedHeading = cleanHeadingText(heading);
  for (const section of SECTION_PLAN) {
    const aliases = [section.title, ...titleAliasesForSection(section.sectionId)];
    for (const alias of aliases) {
      const normalizedAlias = cleanHeadingText(alias);
      if (
        normalizedHeading === normalizedAlias ||
        normalizedHeading.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedHeading)
      ) {
        return { sectionId: section.sectionId, matchedAlias: alias };
      }
    }
  }
  return null;
}

function fallbackSectionsFromFreeformText(
  text: string,
  evidenceCards: PipelineEvidenceCard[],
  allowedSourceIds: Set<string>,
): ReportWriterSection[] {
  const trimmed = canonicalizeCitationMarkersInText(text.trim());
  if (!trimmed) return [];

  const sections: ReportWriterSection[] = [];
  let activeSectionId: string | null = null;
  let activeTitle = "";
  let buffer: string[] = [];

  const flush = () => {
    if (!activeSectionId) return;
    const prose = normalizeReaderFacingProse(buffer.join("\n\n").trim());
    if (prose.length < 20) {
      activeSectionId = null;
      activeTitle = "";
      buffer = [];
      return;
    }
    const sectionCards = evidenceCards
      .filter((card) => cardAllowedForReportSection(card, activeSectionId as ReportSectionPlanId))
      .slice(0, 4);
    const defaultEvidenceCardIds = sectionCards.map((card) => card.id);
    const defaultCitationIds = Array.from(
      new Set(
        sectionCards
          .map((card) => card.sourceId)
          .filter((id) => allowedSourceIds.has(id)),
      ),
    );
    if (defaultEvidenceCardIds.length === 0 && defaultCitationIds.length === 0) {
      activeSectionId = null;
      activeTitle = "";
      buffer = [];
      return;
    }
    sections.push({
      sectionId: activeSectionId,
      title: activeTitle,
      prose,
      evidenceCardIds: defaultEvidenceCardIds,
      citationIds: defaultCitationIds,
      paragraphClaims: paragraphClaimsForSection({
        sectionId: activeSectionId,
        prose,
        evidenceCardIds: defaultEvidenceCardIds,
        evidenceById: new Map(evidenceCards.map((card) => [card.id, card])),
      }),
    });
    activeSectionId = null;
    activeTitle = "";
    buffer = [];
  };

  const lines = trimmed
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  for (const line of lines) {
    if (!line) {
      if (activeSectionId && buffer.at(-1) !== "") buffer.push("");
      continue;
    }

    const headingMatch = matchSectionIdFromHeading(line);
    if (headingMatch) {
      flush();
      activeSectionId = headingMatch.sectionId;
      activeTitle =
        SECTION_PLAN.find((section) => section.sectionId === headingMatch.sectionId)?.title ??
        line;
      const remainder = line
        .replace(new RegExp(`^${escapeRegExp(headingMatch.matchedAlias)}[：:]?`, "iu"), "")
        .trim();
      if (remainder) buffer.push(remainder);
      continue;
    }

    const inlineHeading = SECTION_PLAN
      .flatMap((section) =>
        [section.title, ...titleAliasesForSection(section.sectionId)].map((alias) => ({
          alias,
          sectionId: section.sectionId,
        })),
      )
      .find(({ alias }) => new RegExp(`^${alias}[：:]`, "iu").test(line));

    if (inlineHeading) {
      flush();
      activeSectionId = inlineHeading.sectionId;
      activeTitle =
        SECTION_PLAN.find((section) => section.sectionId === inlineHeading.sectionId)?.title ??
        inlineHeading.alias;
      buffer.push(
        line.replace(new RegExp(`^${escapeRegExp(inlineHeading.alias)}[：:]`, "iu"), "").trim(),
      );
      continue;
    }

    if (activeSectionId) {
      buffer.push(line);
    }
  }
  flush();

  if (sections.length > 0) return sections;

  const paragraphs = trimmed
    .split(/\n{2,}/u)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 20);
  if (paragraphs.length < 1) return [];

  return SECTION_PLAN.slice(0, paragraphs.length)
    .map((section, index) => {
      const sectionCards = evidenceCards
        .filter((card) => cardAllowedForReportSection(card, section.sectionId))
        .slice(0, 4);
      const evidenceCardIds = sectionCards.map((card) => card.id);
      return {
        sectionId: section.sectionId,
        title: section.title,
        prose: normalizeReaderFacingProse(paragraphs[index] ?? ""),
        evidenceCardIds,
        citationIds: Array.from(
          new Set(
            sectionCards
              .map((card) => card.sourceId)
              .filter((id) => allowedSourceIds.has(id)),
          ),
        ),
        paragraphClaims: paragraphClaimsForSection({
          sectionId: section.sectionId,
          prose: normalizeReaderFacingProse(paragraphs[index] ?? ""),
          evidenceCardIds,
          evidenceById: new Map(evidenceCards.map((card) => [card.id, card])),
        }),
      };
    })
    .filter(
      (section) =>
        section.prose.length >= 20 &&
        (section.evidenceCardIds.length > 0 || section.citationIds.length > 0),
    );
}

function fallbackStatus(error: unknown): ReportWriterResult["llm_status"] {
  if (!(error instanceof LlmAdapterError)) return "failed";
  if (error.code === "provider-unconfigured") return "skipped";
  if (error.code === "model-missing") return "skipped";
  if (error.code === "provider-timeout") return "timeout";
  if (error.code === "provider-quota") return "quota_exceeded";
  return "failed";
}

function fallbackWarning(error: unknown): string {
  if (error instanceof LlmAdapterError) {
    return `LLM report writer fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) return `LLM report writer fallback: ${error.message}`;
  return "LLM report writer fallback: unknown provider failure";
}

type ReportWriterAttemptMode = "primary" | "retry";

interface ReportWriterAttemptPrompt {
  mode: ReportWriterAttemptMode;
  sources: SourceRecord[];
  evidenceCards: PipelineEvidenceCard[];
  sectionEvidenceMap: SectionEvidenceMapEntry[];
  paragraphPlans: ParagraphPlan[];
  baselineSections: ReportWriterSection[];
  previousSectionSummaries: Array<{
    sectionId: string;
    title: string;
    summary: string;
  }>;
}

interface ReportWriterAttemptResult {
  llmResult: Awaited<ReturnType<typeof requestLlmText>>;
  sections: ReportWriterSection[];
  recoveryMode: "none" | "partial_json" | "freeform";
  mode: ReportWriterAttemptMode;
}

function scopeSectionEvidenceMapToCards(
  sectionEvidenceMap: SectionEvidenceMapEntry[],
  evidenceCards: PipelineEvidenceCard[],
): SectionEvidenceMapEntry[] {
  const selectedIds = new Set(evidenceCards.map((card) => card.id));
  return sectionEvidenceMap.map((entry) => {
    const scopedCards = entry.evidenceCards.filter((card) => selectedIds.has(card.id));
    const plannedClaims = entry.plannedClaims
      .map((claim) => scopedClaimForCards(claim, scopedCards))
      .filter((claim): claim is ReportPlannedClaim => Boolean(claim));
    return {
      ...entry,
      evidenceCards: scopedCards,
      plannedClaims,
      allowedCitationKeys: dedupeStrings(
        plannedClaims.length > 0
          ? plannedClaims.flatMap((claim) => claim.allowedCitationKeys)
          : scopedCards.map(citationKeyForEvidenceCard),
      ),
    };
  });
}

function promptSourcesForEvidence(
  sources: SourceRecord[],
  evidenceCards: PipelineEvidenceCard[],
  limit: number,
): SourceRecord[] {
  const sourceById = new Map(
    sources
      .map((source) => [source.id, source] as const)
      .filter(([id]) => Boolean(id)),
  );
  const selected: SourceRecord[] = [];
  const seen = new Set<string>();

  for (const card of evidenceCards) {
    const source = sourceById.get(card.sourceId);
    const sourceId = source?.id;
    if (!source || !sourceId || seen.has(sourceId)) continue;
    selected.push(source);
    seen.add(sourceId);
    if (selected.length >= limit) return selected;
  }

  for (const source of sources) {
    const sourceId = source.id;
    if (!sourceId || seen.has(sourceId)) continue;
    selected.push(source);
    seen.add(sourceId);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildAttemptPrompt(
  input: ReportWriterInput,
  sources: SourceRecord[],
  evidenceCards: PipelineEvidenceCard[],
  sectionEvidenceMap: SectionEvidenceMapEntry[],
  paragraphPlans: ParagraphPlan[],
  baselineSections: ReportWriterSection[],
  previousSectionSummaries: ReportWriterAttemptPrompt["previousSectionSummaries"],
  mode: ReportWriterAttemptMode,
): ReportWriterAttemptPrompt {
  if (mode === "retry") {
    const retryEvidenceCards = evidenceCards.slice(0, RETRY_PROMPT_EVIDENCE_LIMIT);
    const retryPlanIds = new Set(retryEvidenceCards.map((card) => card.id));
    return {
      mode,
      evidenceCards: retryEvidenceCards,
      sources: promptSourcesForEvidence(
        sources,
        retryEvidenceCards,
        RETRY_PROMPT_SOURCE_LIMIT,
      ),
      sectionEvidenceMap: scopeSectionEvidenceMapToCards(
        sectionEvidenceMap,
        retryEvidenceCards,
      ),
      paragraphPlans: paragraphPlans.map((plan) => ({
        ...plan,
        evidenceIds: plan.evidenceIds.filter((id) => retryPlanIds.has(id)),
        citationPlan: plan.citationPlan.filter((citationId) =>
          retryEvidenceCards.some((card) => card.sourceId === citationId),
        ),
      })),
      baselineSections,
      previousSectionSummaries,
    };
  }

  const primaryEvidenceCards = evidenceCards.slice(0, PRIMARY_PROMPT_EVIDENCE_LIMIT);
  return {
    mode,
    evidenceCards: primaryEvidenceCards,
    sources: promptSourcesForEvidence(
      sources,
      primaryEvidenceCards,
      PRIMARY_PROMPT_SOURCE_LIMIT,
    ),
    sectionEvidenceMap: scopeSectionEvidenceMapToCards(
      sectionEvidenceMap,
      primaryEvidenceCards,
    ),
    paragraphPlans,
    baselineSections,
    previousSectionSummaries,
  };
}

function recoverSectionObjectsFromPartialJson(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sectionsMatch = trimmed.match(/"sections"\s*:\s*\[/u);
  if (!sectionsMatch?.index) {
    if (sectionsMatch?.index !== 0 && sectionsMatch?.index !== undefined) {
      // continue below
    } else if (sectionsMatch?.index === undefined) {
      return [];
    }
  }

  const matchIndex = sectionsMatch?.index;
  if (matchIndex === undefined) return [];
  const listStart = trimmed.indexOf("[", matchIndex);
  if (listStart < 0) return [];

  const objects: unknown[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = listStart + 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const candidate = trimmed.slice(objectStart, index + 1);
        try {
          objects.push(JSON.parse(candidate));
        } catch {
          // Ignore incomplete trailing objects and keep already recovered sections.
        }
        objectStart = -1;
      }
      continue;
    }
    if (char === "]" && depth === 0) break;
  }

  return objects;
}

function cardIsScholarlyEvidence(card: PipelineEvidenceCard): boolean {
  if (card.recommendationBucket === "scholarly_recommended") return true;
  if (card.isPeerReviewed === true) return true;
  if (card.doi?.trim()) return true;
  return /\b(crossref|openalex|semantic scholar|journal|conference|paper|review|academic)\b/i.test(
    [
      card.sourceType,
      card.sourceProvider,
      card.provider,
      card.venue,
      card.retrievalMode,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function cardIsOfficialBackground(card: PipelineEvidenceCard): boolean {
  if (card.recommendationBucket === "official_background") return true;
  return /\b(official_background|official|institutional|government|education|educational|university|extension|encyclopedia|nasa|ucar|noaa)\b/i.test(
    [
      card.sourceType,
      card.sourceProvider,
      card.provider,
      card.sourceRole,
      card.retrievalMode,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function reportWriterClaimMode(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): "academic_claim_mode" | "background_report_mode" {
  if (input.generationMode === "background_report_mode") return "background_report_mode";
  const scholarlyCount = prompt.evidenceCards.filter(cardIsScholarlyEvidence).length;
  const officialBackgroundCount = prompt.evidenceCards.filter(cardIsOfficialBackground).length;
  if (scholarlyCount < 3 && officialBackgroundCount > 0) return "background_report_mode";
  return "academic_claim_mode";
}

function reportWriterGovernanceNote(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): string {
  const claimMode = reportWriterClaimMode(input, prompt);
  if (claimMode === "background_report_mode") {
    return [
      "Governance mode: background_report_mode.",
      "The accepted evidence is mainly official, educational, institutional, or encyclopedia-like background material.",
      "Write this as a 基礎研究報告／背景型研究報告.",
      "Clearly state in the report that it is based on official education and institutional background sources and has not included enough peer-reviewed papers for a systematic literature review.",
      "Use wording such as 根據官方教育資料, 作為背景說明, and 此處不作為同儕審查實證研究結論.",
      "Allowed uses: background, concept explanation, research motivation, basic mechanism, further questions, and limitations.",
      "Forbidden unless scholarly evidence cards support it: 研究一致證實, 多篇論文顯示, 統計上顯著, 學界共識, systematic review claims, causal claims, and empirical/statistical conclusions.",
    ].join(" ");
  }
  return [
    "Governance mode: academic_claim_mode.",
    "Academic claims must be tied to scholarly or peer-reviewed evidence cards.",
    "Official background cards may still be used for definitions, motivation, and limitations, but not as peer-reviewed empirical evidence.",
  ].join(" ");
}

interface ValidatedTeachBackSection {
  sectionId: string;
  teachBack: string;
}

const TEACH_BACK_SIMPLIFIED_ONLY_PATTERN =
  /[这为与关现发质数据学术体证较应从过将显结论联络网线图级]/u;
const TAIWAN_TRADITIONAL_CHARACTER_RULE =
  "Use Taiwan Traditional Chinese characters and terminology only. Forbidden Simplified/Mainland forms include 这、为、与、关、现、发、质、数据、学术、体、证、较、应、从、过、将、显、结论、联络、网络、质量；use 這、為、與、關、現、發、質、資料、學術、體、證、較、應、從、過、將、顯、結論、聯絡、網路、品質.";
const TEACH_BACK_IDENTITY_LEAK_PATTERN =
  /(?:\[\s*S\d+\s*\]|\{\s*s\d+\s*\}|https?:\/\/|www\.|\bdoi\b|\b10\.\d{4,9}\/\S+|\b(?:source|evidence|citation)(?:[_-]?(?:id|key|marker))?\b|(?:support|source|original|raw)[_-]?span|\b(?:abstract|snippet)\b|作者|來源|引用|文獻編號|證據編號)/iu;

function exactObjectKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(record).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length &&
    actual.every((key, index) => key === canonical[index]);
}

function identityLeakFragments(value: string): string[] {
  const normalized = cleanText(value).normalize("NFKC").toLocaleLowerCase();
  if (!normalized) return [];
  const fragments = normalized.length >= 4 ? [normalized] : [];
  for (const cjkRun of normalized.match(/[\u3400-\u9fff]{12,}/gu) ?? []) {
    for (let index = 0; index <= cjkRun.length - 12; index += 6) {
      fragments.push(cjkRun.slice(index, index + 12));
    }
  }
  const latinWords = normalized.match(/[a-z][a-z0-9'-]{2,}/gu) ?? [];
  for (let index = 0; index <= latinWords.length - 4; index += 1) {
    const fragment = latinWords.slice(index, index + 4).join(" ");
    if (fragment.length >= 18) fragments.push(fragment);
  }
  return dedupeStrings(fragments);
}

/**
 * Validates the isolation boundary between the de-identified teach-back pass
 * and academic reconstruction. Nothing is labelled "validated" until this
 * exact schema, locale, section identity, and non-leakage check has passed.
 */
export function validateTeachBackOutput(
  content: string,
  expectedSectionIds: string[],
  forbiddenIdentityValues: string[] = [],
): string {
  const strippedContent = content
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "")
    .trim();
  const parsed = safeJsonParse(strippedContent) ?? (() => {
    const start = strippedContent.indexOf("{");
    const end = strippedContent.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return safeJsonParse(strippedContent.slice(start, end + 1));
  })();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LlmAdapterError("invalid-json", "teach_back_invalid_schema:root_object_required");
  }
  const root = parsed as Record<string, unknown>;
  if (!exactObjectKeys(root, ["sectionUnderstandings"]) ||
      !Array.isArray(root.sectionUnderstandings)) {
    throw new LlmAdapterError("invalid-json", "teach_back_invalid_schema:sectionUnderstandings");
  }
  const sections: ValidatedTeachBackSection[] = root.sectionUnderstandings.map(
    (item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new LlmAdapterError("invalid-json", `teach_back_invalid_schema:item_${index}`);
      }
      const record = item as Record<string, unknown>;
      if (!exactObjectKeys(record, ["sectionId", "teachBack"]) ||
          typeof record.sectionId !== "string" ||
          typeof record.teachBack !== "string") {
        throw new LlmAdapterError("invalid-json", `teach_back_invalid_schema:item_${index}`);
      }
      const sectionId = cleanText(record.sectionId);
      const teachBack = cleanText(record.teachBack);
      const cjkLength = Array.from(teachBack.matchAll(/[\u3400-\u9fff]/gu)).length;
      if (
        !teachBack || teachBack.length > 4_000 || cjkLength < 8 ||
        TEACH_BACK_SIMPLIFIED_ONLY_PATTERN.test(teachBack)
      ) {
        throw new LlmAdapterError(
          "invalid-json",
          `teach_back_not_traditional_chinese:${sectionId || index}`,
        );
      }
      if (TEACH_BACK_IDENTITY_LEAK_PATTERN.test(teachBack)) {
        throw new LlmAdapterError(
          "invalid-json",
          `teach_back_identity_leak:${sectionId || index}`,
        );
      }
      return { sectionId, teachBack };
    },
  );
  const actualSectionIds = sections.map((section) => section.sectionId);
  if (
    actualSectionIds.length !== expectedSectionIds.length ||
    actualSectionIds.some((sectionId, index) => sectionId !== expectedSectionIds[index]) ||
    new Set(actualSectionIds).size !== actualSectionIds.length
  ) {
    throw new LlmAdapterError(
      "invalid-json",
      `teach_back_section_ids_mismatch:${actualSectionIds.join(",")}`,
    );
  }
  const normalizedTeachBack = sections
    .map((section) => section.teachBack.normalize("NFKC").toLocaleLowerCase())
    .join("\n");
  const leakedLiteral = dedupeStrings(forbiddenIdentityValues)
    .flatMap(identityLeakFragments)
    .find((value) => normalizedTeachBack.includes(value));
  if (leakedLiteral) {
    throw new LlmAdapterError("invalid-json", "teach_back_identity_leak:known_identity");
  }
  return JSON.stringify({ sectionUnderstandings: sections });
}

function teachBackForbiddenIdentityValues(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): string[] {
  return dedupeStrings([
    ...prompt.sources.flatMap((source) => [
      source.id,
      source.title,
      ...source.authors,
      source.doi,
      source.url,
    ]),
    ...prompt.evidenceCards.flatMap((card) => [
      card.id,
      card.evidenceId,
      card.sourceId,
      card.canonicalSourceKey,
      card.citationKey,
      card.sourceTitle,
      card.doi,
      card.trace?.doi,
      card.trace?.url,
      card.supportSpan,
      card.supportedByText,
      ...(card.supportSpans ?? []).map((span) => span.text),
      card.abstract,
      card.exactResult,
    ]),
    ...(input.acceptedSourceIds ?? []),
    ...(input.evidenceCardIds ?? []),
  ]);
}

function teachBackWriterMessages(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): Parameters<typeof requestLlmText>[0]["messages"] {
  const sectionIds = prompt.sectionEvidenceMap.map((section) => section.sectionId);
  const outputSkeleton = JSON.stringify({
    sectionUnderstandings: [{
      sectionId: "global_synthesis",
      teachBack: "REPLACE_WITH_ONE_TRADITIONAL_CHINESE_SENTENCE",
    }],
  });
  return [
    {
      role: "system",
      content: [
        "You are ResearchForge's teach-back reasoner.",
        "Use only the de-identified normalized facts and claim graph supplied below.",
        "Explain the concepts, shared direction, differences, possible mechanisms, confidence, and applicability boundaries in your own words.",
        "Do not use author names, study labels, source titles, source identifiers, citation identities, citation markers, URLs, DOIs, abstracts, snippets, or quoted source language.",
        "Do not write paper-by-paper summaries. Organize every section around the research question and cross-fact relationships.",
        "Write one global teach-back sentence of 50 to 120 Traditional-Chinese characters that integrates the central direction, differences, possible mechanism, confidence, and applicability boundary.",
        TAIWAN_TRADITIONAL_CHARACTER_RULE,
        "Return JSON only. Copy the exact user-provided JSON skeleton, preserve sectionId global_synthesis, and replace the teachBack placeholder with one non-empty sentence.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `topic: ${input.topic}`,
        `coveredSectionIds: ${sectionIds.join(", ")}`,
        `Exact output skeleton (replace every placeholder, omit nothing): ${outputSkeleton}`,
        "De-identified knowledge packet:",
        teachBackEvidencePacket(input, prompt),
      ].join("\n\n"),
    },
  ];
}

function reportWriterMessages(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
  teachBack: string | null = null,
  compactLocalMode = false,
): Parameters<typeof requestLlmText>[0]["messages"] {
  const evidenceTextLimit =
    prompt.mode === "retry" ? RETRY_EVIDENCE_TEXT_LIMIT : PRIMARY_EVIDENCE_TEXT_LIMIT;
  const governanceNote = reportWriterGovernanceNote(input, prompt);
  const requestedSectionPlan = prompt.sectionEvidenceMap.map((section) => ({
    sectionId: section.sectionId,
    title: section.title,
    instruction: section.paragraphPurpose,
    ...(input.reportPlan?.sections.find((item) => item.sectionId === section.sectionId)
      ? (() => {
          const plan = input.reportPlan!.sections.find((item) => item.sectionId === section.sectionId)!;
          return {
            sectionPurpose: plan.sectionPurpose ?? plan.goal,
            sectionThesis: plan.sectionThesis ?? plan.sectionClaim ?? null,
            transitionGoal: plan.transitionGoal ?? plan.transitionToNext ?? null,
            limitationBoundary: plan.limitationBoundary ?? plan.limitations?.join("；") ?? null,
          };
        })()
      : {}),
  }));
  const requestedSectionIds = requestedSectionPlan.map((section) => section.sectionId);
  const requestedSectionIdList = requestedSectionIds.join(", ");
  const requestedSectionIdSet = new Set(requestedSectionIds);
  const outputSkeleton = JSON.stringify({
    sections: prompt.sectionEvidenceMap.map((section) => ({
      sectionId: section.sectionId,
      title: section.title,
      prose: "REPLACE_WITH_FORMAL_TRADITIONAL_CHINESE_PROSE",
      evidenceCardIds: section.evidenceCards.map((card) => card.id),
      citationIds: dedupeStrings(section.evidenceCards.map((card) => card.sourceId)),
    })),
  });
  if (compactLocalMode) {
    return [
      {
        role: "system",
        content: [
          "You are ResearchForge's academic reconstruction writer.",
          "Return exactly one valid JSON object by copying the user's output skeleton and replacing only prose placeholders.",
          "Write formal Taiwan Traditional Chinese. Each section has 1-2 concise paragraphs and 2-4 complete sentences total.",
          "Use only the validated global teach-back and canonical fact/claim packet. Every factual sentence must be entailed by one listed claim and its facts.",
          "Preserve every sectionId, title, evidenceCardIds, and citationIds exactly. Never put citation tokens, source ids, author names, URLs, DOI, or source-led study summaries in prose.",
          "Do not infer omitted values, causal effects, source counts, or stronger directness. State applicability limits and uncertainty where the packet does.",
          TAIWAN_TRADITIONAL_CHARACTER_RULE,
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `topic: ${input.topic}`,
          `Exact output skeleton: ${outputSkeleton}`,
          `Validated global teach-back: ${teachBack ?? "not_available"}`,
          `Canonical reconstruction packet: ${localAcademicEvidencePacket(input, prompt)}`,
        ].join("\n\n"),
      },
    ];
  }
  const compositionContract = {
    compositionKind: input.reportPlan?.compositionKind ?? null,
    researchQuestion: input.reportPlan?.researchQuestion ?? input.topic,
    centralAnswer: input.reportPlan?.centralAnswer ?? null,
    conclusionBoundary: input.reportPlan?.conclusionBoundary ?? null,
    terminology: input.reportPlan?.terminology ?? {},
    audienceProfile: input.reportPlan?.audienceProfile ?? null,
    reportArchetype: input.reportPlan?.reportArchetype ?? null,
    heterogeneityBoundary: input.reportPlan?.heterogeneityAnalysis?.synthesisBoundary ?? null,
    discourseSections: (input.reportPlan?.sections ?? [])
      .filter((section) => requestedSectionIdSet.has(section.sectionId as ReportSectionPlanId))
      .map((section) => ({
        sectionId: section.sectionId,
        sectionRole: section.sectionRole ?? section.canonicalSectionRole ?? null,
        questionAnswered: section.questionAnswered ?? null,
        sectionClaim: section.sectionClaim ?? section.sectionThesis ?? null,
        connectionFromPrevious: section.connectionFromPrevious ?? null,
        expectedTakeaway: section.expectedTakeaway ?? null,
        transitionToNext: section.transitionToNext ?? section.transitionGoal ?? null,
        limitationBoundary: section.limitationBoundary ?? section.limitations?.join("；") ?? null,
      })),
  };
  const postReportSummaryInstruction = requestedSectionIds.includes("abstract")
    ? ""
    : " Do not write an abstract; it will be derived from the completed report afterward.";
  const systemRules =
    prompt.mode === "retry"
      ? [
          "You are ResearchForge's report writer. You can only write a formal Traditional Chinese research report draft from the canonical normalized-fact and synthesis-cluster packet plus the user topic.",
          "Return exactly one JSON object and nothing else.",
          "The first character must be { and the last character must be }.",
          "No markdown, no code fence, no English preface, no explanation.",
          "Your output is formal report content, not writing advice, not template explanation, not outline teaching.",
          "Never output instruction text such as 本段應該, 可以討論, 建議補充, 應討論, 請撰寫, or 可再補充.",
          "Write concise formal Traditional Chinese prose using only normalizedClaimZhTw, the ArgumentMap, DiscoursePlan, synthesis clusters, and paragraphPlans.",
          "Execute narrativePasses in order: first teach_back the claim graph without authors, source labels, or citation tokens; then perform academic_reconstruction by restoring only fact-bound values, applicability limits, and entailed citation identities. Return only the reconstructed prose.",
          "Every research-bearing sentence must be entailed by one claimGraph node. Its citationIds must be a subset of that node's citationIds; backgroundFacts cannot support a direct-result sentence.",
          "Reject source-led prose: never organize paragraphs as one study, another study, or a sequence of author-by-author summaries, and never attach the same blanket citation cluster to multiple paragraphs.",
          "Never quote or paraphrase raw abstracts, supportSpan, originalSpan, source JSON, or diagnostic fields. If normalizedClaimZhTw is unresolved, omit that evidence from prose.",
          "Keep the whole report aligned to one researchQuestion and centralAnswer. Each section must answer its questionAnswered, inherit connectionFromPrevious, and prepare transitionToNext without adding facts.",
          "For each section, use only that section's plannedClaimIds, evidenceIds, citationPlan, and allowedCitationKeys. Never move a claim or source binding from another section.",
          "discussion and conclusion may interpret or summarize listed plannedClaimIds, but must not add a new claim, evidence id, source, or citation key.",
          "For the conclusion, close the thematic claims and applicability boundary already established earlier. Do not write one sentence per source and do not repeat every source-specific result. Return citationIds structurally; never place [S#] or numeric brackets in reader prose.",
          "Do not merely list sources; synthesize evidence_points into analytical paragraphs.",
          "Do not state a numeric or Chinese-word count of sources/studies in prose; source counts belong to the deterministic method section and tables.",
          "Write each section as 1 to 2 short natural paragraphs and 2 to 4 complete sentences total, covering its planned function without repetition.",
          "Do not emit repeated field labels such as 主旨：, 摘要重點：, or 限制：; integrate that information into continuous prose.",
          "Do not write citation markers inside prose in any section. Return source identities in citationIds; ResearchForge renders clickable author-year citations after identity resolution.",
          "Use Traditional Chinese throughout the body. English may appear only for a necessary acronym or the first parenthetical definition of a technical term.",
          TAIWAN_TRADITIONAL_CHARACTER_RULE,
          "For introduction, literature_review, and discussion with multiple sources, write at least two distinct evidence-bound substantive sentences spanning at least two sources. Do not use generic filler such as 「綜合以上摘錄」 or 「目前缺少足以支撐進一步實質判斷」.",
          "If you are unsure, keep the section short and preserve limitations instead of inventing details.",
          governanceNote,
          "Copy the exact JSON output skeleton from the user message. Preserve every sectionId, title, evidenceCardIds, and citationIds exactly; replace only each prose placeholder.",
        ].join(" ")
      : [
          "You are ResearchForge 的研究報告撰寫器。你只能根據 canonical normalized facts、synthesis clusters 與使用者主題撰寫正式研究報告草稿。",
          "Output valid JSON only. No markdown. No explanation.",
          "你的輸出是正式報告正文，不是寫作建議、不是模板說明、不是大綱教學。",
          "禁止輸出「本段應該」、「可以討論」、「建議補充」、「應討論」、「請撰寫」、「可再補充」這類 instruction text。",
          "Write the report from paragraphPlans using only normalizedClaimZhTw, the ArgumentMap, DiscoursePlan, and synthesis clusters.",
          "依 narrativePasses 順序工作：先 teach_back，不提作者、來源標籤或引用；再 academic_reconstruction，只放回 atomic facts、適用邊界與 claimGraph 允許的 citationIds，最後僅輸出重建後正文。",
          "每個研究句必須由單一 claimGraph node 蘊含，citationIds 只能取自該 node；backgroundFacts 不得冒充直接結果證據。",
          "禁止 source-led paragraph、逐篇論文拼接與跨段重複的 blanket citation cluster。段落必須以核心問題與綜合判斷組織。",
          "Never consume or reproduce a raw abstract, supportSpan, originalSpan, source JSON, or diagnostic field. Omit unresolved normalized evidence.",
          "The abstract, body, and conclusion must use the same researchQuestion and centralAnswer. Every section must perform its DiscoursePlan role rather than summarize one source at a time.",
          "Do not invent statistics, authors, URLs, DOI, or citations.",
          "Every section must stay tied to the paragraphPlan evidenceIds and citationPlan.",
          "Each section may use only its listed structured plannedClaims, plannedClaimIds, evidenceIds, citationPlan, and allowedCitationKeys. Do not create, replace, or move bindings.",
          "discussion and conclusion may only reference listed prior plannedClaimIds; they must not introduce new evidence, sources, or citation keys.",
          "Do not output template status prose such as '目前資料收集集中在' or '若要寫成更完整'.",
          "When evidence is insufficient, explicitly state the missing concepts or source types instead of pretending the conclusion is complete.",
          "Every evidence-bearing section needs at least one provided evidenceCardId and its matching source identities in citationIds.",
          "In every section, including the conclusion, do not emit {s2}, [S2], [source:2], [1], source_2, citation_2, tool citations, or any other citation token in prose. Return source identities in citationIds so the renderer can create clickable author-year citations.",
          "正文使用臺灣繁體中文；英文只可用於必要縮寫或專有名詞第一次出現時的括號定義，不得插入整段英文摘要。",
          TAIWAN_TRADITIONAL_CHARACTER_RULE,
          "introduction、literature_review 與 discussion 若有多個可用來源，至少要有兩個實質且可核對的句子，並涵蓋至少兩個來源。文獻探討要整合共同點與差異；討論只分析一致性、差異來源、適用邊界與限制，不重複 findings。",
          "禁止用「綜合以上摘錄，共同部分可組成本節主軸」、「目前來源尚不足以支持此結論」或「目前缺少足以支撐進一步實質判斷」當作章節內容。",
          "Do not cite ids outside provided evidenceCards or accepted sources.",
          "If evidence is insufficient, write 「目前來源不足以支持更強結論」 with the reason in the section prose and set the section warnings.",
          "Conclusion must only summarize evidenceCardIds already used in earlier sections.",
          "Conclusion must answer the central research question from the already synthesized thematic claims, then state one concise applicability boundary. Do not enumerate sources, repeat every case, or introduce new evidence. Keep citations structural in citationIds and keep all citation tokens out of prose.",
          "The reference/source content must be integrated into the body as evidence, not only listed.",
          "Do not state a numeric or Chinese-word count of sources/studies in prose; source counts belong to the deterministic method section and tables.",
          "Each section must contain 1 to 2 short natural paragraphs and 2 to 4 complete sentences total; separate two paragraphs with two newline characters inside the JSON prose string.",
          "Never repeat source-card field labels such as 主旨：, 摘要重點：, or 限制：. Synthesize their content once in reader-facing prose.",
          governanceNote,
          "Copy the exact JSON output skeleton from the user message. Preserve every sectionId, title, evidenceCardIds, and citationIds exactly; replace only each prose placeholder.",
        ].join(" ");

  const userRules =
    prompt.mode === "retry"
      ? [
          `topic: ${input.topic}`,
          `reportType: ${input.reportType ?? "研究報告"}`,
          `reportMode: ${input.reportMode ?? "standard"}`,
          `audience: ${input.audience ?? "高中"}`,
          `language: ${input.language ?? "繁體中文"}`,
          `locale: ${input.locale ?? "zh-TW"}`,
          `generationMode: ${input.generationMode ?? "formal"}`,
          `sourceMixProfile: ${input.sourceMixProfile ?? "unspecified"}`,
          `writingStyle: ${input.writingStyle ?? "formal"}`,
          `requestedLength: ${input.requestedLength ?? "standard"}`,
          `targetWordCount: ${input.targetWordCount ?? "unspecified"}`,
          governanceNote,
          `Composition contract: ${JSON.stringify(compositionContract)}`,
          `Return exactly ${requestedSectionIds.length} report sections with these ids: ${requestedSectionIdList}.${postReportSummaryInstruction}`,
          `Exact output skeleton (replace every prose placeholder, omit nothing): ${outputSkeleton}`,
          `Validated teach-back to reconstruct academically: ${teachBack ?? "not_available"}`,
          "Keep each section to 1-2 concise paragraphs and 2-4 complete, non-redundant sentences total; return valid JSON even if evidence is limited.",
          "Only normalized Traditional-Chinese evidence claims are usable. Omit unresolved evidence rather than filling a section with status prose.",
          `Section plan: ${JSON.stringify(requestedSectionPlan)}`,
          `Previous-section summaries: ${JSON.stringify(prompt.previousSectionSummaries)}`,
          "Section evidence map:",
          sectionMapToText(prompt.sectionEvidenceMap),
          "Paragraph plans:",
          compactParagraphPlansToText(prompt.paragraphPlans),
          "Canonical thematic synthesis packet (facts, clusters, claim bindings, and source identity registry):",
          synthesisEvidencePacket(input, prompt, evidenceTextLimit),
        ].join("\n\n")
      : [
          `topic: ${input.topic}`,
          `reportType: ${input.reportType ?? "研究報告"}`,
          `reportMode: ${input.reportMode ?? "standard"}`,
          `audience: ${input.audience ?? "高中"}`,
          `language: ${input.language ?? "繁體中文"}`,
          `locale: ${input.locale ?? "zh-TW"}`,
          `generationMode: ${input.generationMode ?? "formal"}`,
          `sourceMixProfile: ${input.sourceMixProfile ?? "unspecified"}`,
          `writingStyle: ${input.writingStyle ?? "formal"}`,
          `requestedLength: ${input.requestedLength ?? "standard"}`,
          `targetWordCount: ${input.targetWordCount ?? "unspecified"}`,
          governanceNote,
          `Composition contract: ${JSON.stringify(compositionContract)}`,
          input.generationMode === "preliminary"
            ? "State clearly that this is a constrained draft where evidence is still incomplete."
            : "Write a formal report with clear source limits.",
          `Required sectionIds: ${requestedSectionIdList}.${postReportSummaryInstruction}`,
          `Exact output skeleton (replace every prose placeholder, omit nothing): ${outputSkeleton}`,
          `Validated teach-back to reconstruct academically: ${teachBack ?? "not_available"}`,
          "Language rule: body prose is Traditional Chinese; English is limited to necessary acronyms and the first parenthetical definition of a technical term. Raw English abstracts are forbidden.",
          `Section plan: ${JSON.stringify(requestedSectionPlan)}`,
          `Previous-section summaries: ${JSON.stringify(prompt.previousSectionSummaries)}`,
          "Section evidence map:",
          sectionMapToText(prompt.sectionEvidenceMap),
          "Paragraph plans:",
          compactParagraphPlansToText(prompt.paragraphPlans),
          "Canonical thematic synthesis packet (facts, clusters, claim bindings, and source identity registry):",
          synthesisEvidencePacket(input, prompt, evidenceTextLimit),
        ].join("\n\n");

  return [
    {
      role: "system",
      content: systemRules,
    },
    {
      role: "user",
      content: userRules,
    },
  ];
}

async function runReportWriterAttempt(
  input: ReportWriterInput,
  options: ReportWriterOptions,
  prompt: ReportWriterAttemptPrompt,
  evidenceToSource: Map<string, string>,
  evidenceById: Map<string, PipelineEvidenceCard>,
  allowedSourceIds: Set<string>,
  model: string,
  timeoutMs: number,
): Promise<ReportWriterAttemptResult> {
  const sectionBindings = new Map(
    prompt.sectionEvidenceMap.map((section) => [section.sectionId, section] as const),
  );
  let teachBack: string | null = null;
  const narrativePasses = input.reportPlan?.narrativePasses ?? [];
  const hasExactNarrativePasses =
    narrativePasses.length === 2 &&
    narrativePasses[0]?.pass === "teach_back" &&
    narrativePasses[1]?.pass === "academic_reconstruction";
  if (input.writerEvidenceSet && !hasExactNarrativePasses) {
    throw new Error("canonical_writer_requires_exact_two_stage_narrative_contract");
  }
  if (hasExactNarrativePasses) {
    const teachBackResult = await requestLlmText({
      operation: "report_generation",
      featureName: prompt.mode === "retry"
        ? "report_teach_back_retry"
        : "report_teach_back",
      purpose: "report_writer",
      temperature: 0.1,
      maxTokens: prompt.mode === "retry" ? 400 : 700,
      responseFormat: "json_object",
      llm: {
        ...options.llm,
        model,
        timeoutMs,
      },
      fetchImpl: options.fetchImpl,
      messages: teachBackWriterMessages(input, prompt),
    });
    teachBack = validateTeachBackOutput(
      teachBackResult.content,
      ["global_synthesis"],
      teachBackForbiddenIdentityValues(input, prompt),
    );
  }
  const llmResult = await requestLlmText({
    operation: "report_generation",
    featureName: prompt.mode === "retry" ? "report_draft_synthesis_retry" : "report_draft_synthesis",
    purpose: "report_writer",
    temperature: prompt.mode === "retry" ? 0.1 : 0.2,
    maxTokens: prompt.mode === "retry" ? 1_800 : 2_600,
    responseFormat: "json_object",
    llm: {
      ...options.llm,
      model,
      timeoutMs,
    },
    fetchImpl: options.fetchImpl,
    messages: reportWriterMessages(
      input,
      prompt,
      teachBack,
      providerLabel(options.llm?.baseUrl ?? "", process.env) === "ollama",
    ),
  });

  let sections: ReportWriterSection[] = [];
  let recoveryMode: ReportWriterAttemptResult["recoveryMode"] = "none";
  try {
    const parsed = safeJsonParse(llmResult.content);
    sections = sectionItems(parsed)
      .map((section) =>
        sanitizeSection(
          section,
          evidenceToSource,
          evidenceById,
          allowedSourceIds,
          sectionBindings,
        ),
      )
      .filter((section): section is ReportWriterSection => Boolean(section));
  } catch (error) {
    if (!(error instanceof LlmAdapterError) || error.code !== "invalid-json") {
      throw error;
    }
    logger.warn(
      {
        route: "/api/generate-report",
        model: llmResult.model,
        mode: prompt.mode,
        rawSnippet: llmResult.content.slice(0, 1200),
      },
      "Report writer received non-JSON model output",
    );
    sections = recoverSectionObjectsFromPartialJson(llmResult.content)
      .map((section) =>
        sanitizeSection(
          section,
          evidenceToSource,
          evidenceById,
          allowedSourceIds,
          sectionBindings,
        ),
      )
      .filter((section): section is ReportWriterSection => Boolean(section));
    if (sections.length > 0) {
      recoveryMode = "partial_json";
    } else {
    sections = input.reportPlan
      ? []
      : fallbackSectionsFromFreeformText(
          llmResult.content,
          prompt.evidenceCards,
          allowedSourceIds,
        );
      if (sections.length > 0) {
        recoveryMode = "freeform";
      } else {
        throw error;
      }
    }
  }

  if (sections.length === 0) {
    throw new LlmAdapterError(
      "invalid-json",
      "LLM report writer did not return any usable sections.",
    );
  }

  return {
    llmResult,
    sections,
    recoveryMode,
    mode: prompt.mode,
  };
}

const EDITORIAL_FORBIDDEN_TEMPLATE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["ordinal_finding_template", /第[一二三四五六七八九十]+項發現是[：:]/u],
  ["brief_conclusion_template", /簡短結論[：:]/u],
  ["cannot_answer_template", /目前無法回答的部分[：:]/u],
  ["internal_evidence_set", /\bEvidenceSet\b/iu],
  ["internal_report_plan", /\bReportPlan\b/iu],
  ["internal_evidence_card", /\bevidence\s*cards?\b/iu],
  ["internal_provider_coverage", /\bprovider\s+coverage\b/iu],
];

function protectedEditorialFacts(value: string): string[] {
  const normalized = canonicalizeCitationMarkersInText(value)
    .replace(/\[S\d+\]/gu, "")
    .replace(/台灣/gu, "臺灣");
  return dedupeStrings([
    ...(normalized.match(/\b(?:18|19|20)\d{2}\b/gu) ?? []),
    ...(normalized.match(/\d+(?:\.\d+)?\s*(?:%|°C|℃|m\/s|km|m|cm|mm|R²|r\b|篇|筆|人|年|月|日|處|類|組|個)/giu) ?? [])
      .map((token) => token.replace(/\s+/gu, "")),
    ...(normalized.match(/\b(?:ENVI-?met|Landsat-?\d*|Google Street View|GVI|NDVI|R²)\b/giu) ?? [])
      .map((token) => token.toUpperCase()),
    ...(normalized.match(/(?:橫斷式研究|縱貫式研究|世代研究|病例對照研究|隨機對照試驗|系統性回顧|統合分析)/gu) ?? []),
  ]);
}

function editorialCitationFingerprint(value: string): string[] {
  return extractCanonicalCitationMarkers(canonicalizeCitationMarkersInText(value));
}

interface EditorialRepetitionSentence {
  fingerprint: string;
  grams: Set<string>;
  protectedFacts: string[];
}

function editorialRepetitionFingerprint(value: string): string | null {
  const fingerprint = canonicalizeCitationMarkersInText(value)
    .replace(/\[S\d+\]/giu, "")
    .replace(/台灣/gu, "臺灣")
    .replace(/換言之|亦即|也就是說|值得注意的是|研究(?:結果)?(?:亦|也|同樣)?(?:顯示|指出|說明|發現|表明)/gu, "")
    .replace(/(?:呈現?|具有?|存在|形成)(?=(?:具條件性|條件性|受限)?(?:的)?(?:關聯|相關))/gu, "")
    .replace(/具條件性(?:的)?|條件性(?:的)?|受限的?/gu, "受限")
    .replace(/[和及與]/gu, "與")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLowerCase();
  return fingerprint.length >= 14 ? fingerprint : null;
}

function editorialCharacterGrams(value: string): Set<string> {
  const grams = new Set<string>();
  for (const size of [2, 3]) {
    for (let index = 0; index <= value.length - size; index += 1) {
      grams.add(value.slice(index, index + size));
    }
  }
  return grams;
}

function editorialOverlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const value of left) {
    if (right.has(value)) overlap += 1;
  }
  return overlap / Math.min(left.size, right.size);
}

function editorialSentencesAreRepetitive(
  left: EditorialRepetitionSentence,
  right: EditorialRepetitionSentence,
): boolean {
  if (left.fingerprint === right.fingerprint) return true;
  if (
    left.protectedFacts.length > 0 &&
    right.protectedFacts.length > 0 &&
    JSON.stringify(left.protectedFacts) !== JSON.stringify(right.protectedFacts)
  ) return false;
  const shorter = left.fingerprint.length <= right.fingerprint.length ? left : right;
  const longer = shorter === left ? right : left;
  if (
    longer.fingerprint.includes(shorter.fingerprint) &&
    shorter.fingerprint.length / longer.fingerprint.length >= 0.7
  ) return true;
  return editorialOverlapCoefficient(left.grams, right.grams) >= 0.72;
}

function documentEditorialRepetitionBurden(sections: ReportWriterSection[]): number {
  const sentences = sections
    .filter((section) => section.sectionId !== "references")
    .flatMap((section) => splitReaderSentences(section.prose))
    .map((sentence): EditorialRepetitionSentence | null => {
      const fingerprint = editorialRepetitionFingerprint(sentence);
      return fingerprint
        ? {
            fingerprint,
            grams: editorialCharacterGrams(fingerprint),
            protectedFacts: [...protectedEditorialFacts(sentence)].sort(),
          }
        : null;
    })
    .filter((sentence): sentence is EditorialRepetitionSentence => Boolean(sentence));
  let burden = 0;
  for (let leftIndex = 0; leftIndex < sentences.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sentences.length; rightIndex += 1) {
      if (editorialSentencesAreRepetitive(sentences[leftIndex]!, sentences[rightIndex]!)) {
        burden += 1;
      }
    }
  }
  return burden;
}

export interface DocumentEditorialAudit {
  passed: boolean;
  issues: string[];
}

export type SourceEchoIssueCode =
  | "SOURCE_LED_PARAGRAPH"
  | "PAPER_BY_PAPER_STITCHING"
  | "BLANKET_CITATION_CLUSTER";

export interface SourceEchoIssue {
  code: SourceEchoIssueCode;
  sectionId: string;
  paragraphIndex: number;
  detail: string;
}

function graphClaimSentenceAlignmentScore(
  sentence: string,
  claim: NonNullable<ReportPlan["claimGraph"]>["claims"][number],
  factById: ReadonlyMap<string, NonNullable<ReportPlan["normalizedFacts"]>[number]>,
): { score: number; sourceIds: string[] } {
  const facts = [...claim.supportingFacts, ...claim.contradictingFacts, ...claim.backgroundFacts]
    .map((factId) => factById.get(factId))
    .filter((fact): fact is NonNullable<ReportPlan["normalizedFacts"]>[number] => Boolean(fact));
  const claimCard = {
    id: `claim:${claim.claimId}`,
    sourceId: "",
    claim: claim.readerFacingStatement,
    claimTextZhTw: claim.readerFacingStatement,
    mainClaimZhTw: claim.readerFacingStatement,
    evidencePointZhTw: claim.readerFacingStatement,
    evidence: "",
    summary: claim.readerFacingStatement,
    relevance: "claim_graph_entailment",
    sourceTitle: "",
    sourceProvider: "",
    year: null,
    usableSections: [],
    citationText: "",
    limitation: null,
  } as unknown as PipelineEvidenceCard;
  const exposureConcepts = dedupeStrings(facts.flatMap((fact) => [
    fact.exposureConcept,
    fact.exposure,
  ]));
  const outcomeConcepts = dedupeStrings(facts.flatMap((fact) => [
    fact.outcomeConcept,
    fact.outcome,
  ]));
  const requiresRelationshipAxes = [
    "direct_result",
    "cross_source_shared_direction",
    "research_difference",
    "possible_mechanism",
  ].includes(claim.claimType);
  const markerFreeSentenceLength = canonicalizeCitationMarkersInText(sentence)
    .replace(/\[S\d+\]/gu, "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .length;
  const conceptCompatible = !requiresRelationshipAxes || markerFreeSentenceLength < 8 || (
    (exposureConcepts.length === 0 || exposureConcepts.some((concept) =>
      hasEvidenceAlignmentOverlap(sentence, concept)
    )) &&
    (outcomeConcepts.length === 0 || outcomeConcepts.some((concept) =>
      hasEvidenceAlignmentOverlap(sentence, concept)
    ))
  );
  let score = conceptCompatible
    ? sentenceEvidenceAlignmentScore(sentence, claimCard)
    : -1;
  const sourceIds: string[] = [];
  for (const fact of facts) {
    const factText = dedupeStrings([
      fact.claimTextZhTw,
      fact.population,
      fact.exposureConcept,
      fact.exposureMeasure,
      fact.outcomeConcept,
      fact.outcomeMeasure,
      fact.mediator,
      fact.associationDirection,
      ...(fact.numericalResults ?? []).flatMap((result) => [
        result.rawText,
        result.measure,
        result.value == null ? null : String(result.value),
      ]),
    ]).join("。");
    const factScore = sentenceEvidenceAlignmentScore(sentence, {
      ...claimCard,
      id: fact.factId,
      sourceId: fact.sourceId,
      claim: factText,
      claimTextZhTw: factText,
      mainClaimZhTw: factText,
      evidencePointZhTw: factText,
      summary: factText,
    });
    if (conceptCompatible && factScore >= 0) sourceIds.push(fact.sourceId);
    if (conceptCompatible) score = Math.max(score, factScore);
  }
  return { score, sourceIds: dedupeStrings(sourceIds) };
}

function markerSourceIdsForSentence(
  sentence: string,
  sectionCitationIds: string[],
  allSourceIds: string[],
): string[] {
  return dedupeStrings(extractCanonicalCitationMarkers(sentence).map((marker) => {
    const ordinal = Number(marker.match(/\d+/u)?.[0] ?? 0);
    if (ordinal <= 0) return null;
    return allSourceIds[ordinal - 1] ??
      sectionCitationIds.find((sourceId) => new RegExp(`(?:^|[-_:])${ordinal}$`, "u").test(sourceId)) ??
      sectionCitationIds[ordinal - 1] ??
      null;
  }));
}

/** Checks graph directness and sentence-level claim-to-citation entailment. */
export function auditClaimCitationEntailment(
  plan: ReportPlan,
  sections: Pick<ReportWriterSection, "sectionId" | "citationIds" | "paragraphClaims">[],
): string[] {
  if (!plan.claimGraph) return [];
  const issues: string[] = [];
  const factById = new Map((plan.normalizedFacts ?? []).map((fact) => [fact.factId, fact] as const));
  const graphClaimById = new Map(plan.claimGraph.claims.map((claim) => [claim.claimId, claim] as const));
  const plannedToGraph = new Map(
    plan.plannedClaims
      .filter((claim) => claim.claimGraphId)
      .map((claim) => [claim.claimId, claim.claimGraphId!] as const),
  );
  const allSourceIds = dedupeStrings((plan.normalizedFacts ?? []).map((fact) => fact.sourceId));
  const directnessRank = { A: 0, B: 1, C: 2, D: 3 } as const;
  for (const claim of plan.claimGraph.claims) {
    const claimFacts = [...claim.supportingFacts, ...claim.contradictingFacts, ...claim.backgroundFacts]
      .map((factId) => factById.get(factId))
      .filter((fact): fact is NonNullable<ReportPlan["normalizedFacts"]>[number] => Boolean(fact));
    const weakest = claimFacts
      .map((fact) => fact.evidenceDirectness)
      .filter((tier): tier is "A" | "B" | "C" | "D" => Boolean(tier))
      .sort((left, right) => directnessRank[right] - directnessRank[left])[0] ?? null;
    if (claim.evidenceDirectness !== weakest) {
      issues.push(`DIRECTNESS_INCONSISTENT:${claim.claimId}:${claim.evidenceDirectness ?? "null"}:${weakest ?? "null"}`);
    }
    if (
      ["direct_result", "cross_source_shared_direction"].includes(claim.claimType) &&
      claim.supportingFacts.length === 0 && claim.backgroundFacts.length > 0
    ) {
      issues.push(`BACKGROUND_ONLY_SUPPORT:${claim.claimId}`);
    }
  }
  for (const section of sections) {
    for (const paragraph of section.paragraphClaims ?? []) {
      const graphClaims = paragraph.claimIds
        .map((claimId) => graphClaimById.get(plannedToGraph.get(claimId) ?? claimId))
        .filter((claim): claim is NonNullable<ReportPlan["claimGraph"]>["claims"][number] => Boolean(claim));
      const paragraphAllowed = new Set(graphClaims.flatMap((claim) => claim.citationIds));
      const paragraphSources = dedupeStrings([
        ...paragraph.evidenceCardIds.flatMap((evidenceId) =>
          (plan.normalizedFacts ?? [])
            .filter((fact) => fact.evidenceId === evidenceId)
            .map((fact) => fact.sourceId),
        ),
        ...(paragraph.evidenceCardIds.length === 0 ? section.citationIds : []),
      ]);
      for (const citationId of paragraphSources) {
        if (graphClaims.length > 0 && !paragraphAllowed.has(citationId)) {
          issues.push(
            `CLAIM_CITATION_NOT_ENTAILED:${section.sectionId}:${paragraph.paragraphId}:${citationId}`,
          );
        }
      }
      for (const sentence of splitEvidenceAlignmentSentences(paragraph.generatedTextZhTw)) {
        if (!ASSERTIVE_SENTENCE_PATTERN.test(sentence) && evidenceAlignmentNumbers(sentence).length === 0) {
          continue;
        }
        const alignments = graphClaims
          .map((claim) => ({
            claim,
            ...graphClaimSentenceAlignmentScore(sentence, claim, factById),
          }))
          .filter((alignment) => alignment.score >= 0)
          .sort((left, right) => right.score - left.score);
        if (alignments.length === 0) {
          issues.push(
            `SENTENCE_CLAIM_NOT_ENTAILED:${section.sectionId}:${paragraph.paragraphId}:${sentence.slice(0, 120)}`,
          );
          continue;
        }
        const evidenceSourceIds = dedupeStrings(paragraph.evidenceCardIds.flatMap((evidenceId) =>
          (plan.normalizedFacts ?? [])
            .filter((fact) => fact.evidenceId === evidenceId)
            .map((fact) => fact.sourceId)
        ));
        const markerSourceIds = markerSourceIdsForSentence(
          sentence,
          section.citationIds,
          allSourceIds,
        );
        const bound = alignments.find((alignment) => {
          const allowed = new Set(alignment.claim.citationIds);
          const sentenceSources = markerSourceIds.length > 0
            ? markerSourceIds
            : alignment.sourceIds.length > 0
              ? alignment.sourceIds
              : evidenceSourceIds;
          return sentenceSources.every((citationId) => allowed.has(citationId));
        });
        if (!bound) {
          const bestAllowed = new Set(alignments[0]!.claim.citationIds);
          const bestSentenceSources = markerSourceIds.length > 0
            ? markerSourceIds
            : alignments[0]!.sourceIds.length > 0
              ? alignments[0]!.sourceIds
              : evidenceSourceIds;
          const offending = bestSentenceSources.find((citationId) => !bestAllowed.has(citationId)) ?? "unknown";
          issues.push(
            `CLAIM_CITATION_NOT_ENTAILED:${section.sectionId}:${paragraph.paragraphId}:${offending}`,
          );
        }
      }
    }
  }
  return dedupeStrings(issues);
}

const SOURCE_LED_SENTENCE_START = /^(?:(?:第一|第二|第三|另一|一)項研究(?:則|也)?(?:指出|發現|顯示|認為)?|研究\s*[A-ZＡ-Ｚ一二三四五六七八九十\d]+|[^，。；]{1,30}(?:等人)?[（(](?:19|20)\d{2}[）)](?:指出|發現|顯示)?)/iu;

type SourceEchoEvidenceLookup = ReadonlyMap<string, ReportWriterEvidenceCard>;

interface SourceEchoSentenceBinding {
  evidenceIds: string[];
  sourceIds: string[];
}

const SOURCE_ECHO_BOILERPLATE =
  /(?:本|該|此|前述|現有)?(?:項)?研究(?:結果)?|分析(?:結果)?|結果(?:顯示)?|數據(?:顯示)?|指出|發現|顯示|說明|表明|報告|study|result|finding|analysis|show(?:ed|s)?|report(?:ed|s)?/giu;

const SOURCE_ECHO_STOP_TOKENS = new Set([
  "且", "並且", "以及", "之間", "中", "為", "主要", "可能", "呈現", "存在",
  "the", "and", "for", "from", "that", "this", "with", "were", "was", "are", "among",
]);

/**
 * Produces an author/title/scale/statistic-neutral lexical fingerprint. The raw
 * evidence text is consumed only by this local, post-generation audit and is
 * never included in either writer prompt.
 */
function sourceEchoTokens(value: string, ignoredTokens: ReadonlySet<string>): Set<string> {
  const normalized = canonicalizeCitationMarkersInText(value)
    .replace(/\[S\d+\]/giu, " ")
    .replace(/\b(?:OR|RR|HR|CI|SD|SE|PSQI|DASS(?:-?21)?|GAD-?7|PHQ-?9|[A-Z][A-Z0-9-]{2,})\b/gu, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:%|percent|CI|OR|RR|HR|r\b)?/giu, " ")
    .replace(SOURCE_ECHO_BOILERPLATE, " ")
    .toLowerCase();
  const tokens = normalized
    .replace(/[^\p{L}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter((token) => token.length >= 2 && !SOURCE_ECHO_STOP_TOKENS.has(token));
  for (const match of normalized.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const cjk = match[0];
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= cjk.length - size; index += 1) {
        const token = cjk.slice(index, index + size);
        if (!SOURCE_ECHO_STOP_TOKENS.has(token)) tokens.push(token);
      }
    }
  }
  return new Set(tokens.filter((token) => !ignoredTokens.has(token)));
}

function sourceEchoIgnoredTokens(cards: ReportWriterEvidenceCard[]): Set<string> {
  const titles = cards.map((card) => card.sourceTitle).filter(Boolean).join(" ");
  return sourceEchoTokens(titles, new Set());
}

function sourceEchoEvidenceSequences(card: ReportWriterEvidenceCard): string[][] {
  return dedupeStrings([
    card.supportSpan,
    card.supportedByText,
    ...(card.supportSpans ?? []).map((span) => span.text),
    card.quotedText,
    card.quoted_text,
    card.claimTextOriginal,
    card.abstract,
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
    card.summary,
    card.usableEvidence,
  ]).map((text) => splitEvidenceAlignmentSentences(text)).filter((units) => units.length > 0);
}

function sourceEchoTokenScore(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return -1;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  if (overlap < 2) return -1;
  return overlap / Math.min(left.size, right.size);
}

function sourceEchoBestUnit(
  sentence: string,
  sequences: string[][],
  ignoredTokens: ReadonlySet<string>,
): { sequenceIndex: number; unitIndex: number; score: number } | null {
  const sentenceTokens = sourceEchoTokens(sentence, ignoredTokens);
  let best: { sequenceIndex: number; unitIndex: number; score: number } | null = null;
  sequences.forEach((sequence, sequenceIndex) => {
    sequence.forEach((unit, unitIndex) => {
      const score = sourceEchoTokenScore(sentenceTokens, sourceEchoTokens(unit, ignoredTokens));
      if (score >= 0.24 && (!best || score > best.score)) {
        best = { sequenceIndex, unitIndex, score };
      }
    });
  });
  return best;
}

function sourceEchoSemanticBindings(
  sentences: string[],
  cards: ReportWriterEvidenceCard[],
  ignoredTokens: ReadonlySet<string>,
): SourceEchoSentenceBinding[] {
  const sequencesById = new Map(cards.map((card) => [card.id, sourceEchoEvidenceSequences(card)] as const));
  return sentences.map((sentence) => {
    const ranked = cards.map((card) => ({
      card,
      match: sourceEchoBestUnit(sentence, sequencesById.get(card.id) ?? [], ignoredTokens),
    })).filter((item): item is typeof item & { match: NonNullable<typeof item.match> } => Boolean(item.match))
      .sort((left, right) => right.match.score - left.match.score);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (!best || (runnerUp && best.match.score - runnerUp.match.score < 0.08)) {
      return { evidenceIds: [], sourceIds: [] };
    }
    return { evidenceIds: [best.card.id], sourceIds: [best.card.sourceId] };
  });
}

function hasThreeDistinctSingleSourceBindings(bindings: SourceEchoSentenceBinding[]): boolean {
  for (let index = 0; index <= bindings.length - 3; index += 1) {
    const window = bindings.slice(index, index + 3);
    if (window.some((binding) => binding.evidenceIds.length !== 1 || binding.sourceIds.length !== 1)) {
      continue;
    }
    if (
      new Set(window.flatMap((binding) => binding.evidenceIds)).size === 3 &&
      new Set(window.flatMap((binding) => binding.sourceIds)).size === 3
    ) return true;
  }
  return false;
}

function paragraphMirrorsSingleSourceOrder(
  sentences: string[],
  cards: ReportWriterEvidenceCard[],
  ignoredTokens: ReadonlySet<string>,
): boolean {
  if (sentences.length < 3) return false;
  for (const card of cards) {
    for (const sequence of sourceEchoEvidenceSequences(card)) {
      if (sequence.length < 3) continue;
      const indexes = sentences.map((sentence) =>
        sourceEchoBestUnit(sentence, [sequence], ignoredTokens),
      );
      for (let start = 0; start <= indexes.length - 3; start += 1) {
        const window = indexes.slice(start, start + 3);
        if (window.some((match) => !match)) continue;
        const unitIndexes = window.map((match) => match!.unitIndex);
        if (
          new Set(unitIndexes).size === 3 &&
          unitIndexes.every((unitIndex, index) => index === 0 || unitIndex > unitIndexes[index - 1]!)
        ) return true;
      }
    }
  }
  return false;
}

/** Detects prose whose organizing logic still mirrors source order. */
export function detectSourceEchoIssues(
  sections: Array<
    Pick<ReportWriterSection, "sectionId" | "prose"> &
    Partial<Pick<ReportWriterSection, "paragraphClaims" | "evidenceCardIds" | "citationIds">>
  >,
  evidenceById?: SourceEchoEvidenceLookup,
): SourceEchoIssue[] {
  const issues: SourceEchoIssue[] = [];
  const evidenceCards = evidenceById ? Array.from(evidenceById.values()) : [];
  const ignoredTokens = sourceEchoIgnoredTokens(evidenceCards);
  for (const section of sections) {
    if (section.sectionId === "references") continue;
    const paragraphs = reportSectionParagraphs(section.prose);
    const sectionCards = dedupeStrings([
      ...(section.evidenceCardIds ?? []),
      ...(section.paragraphClaims ?? []).flatMap((claim) => claim.evidenceCardIds),
    ]).map((id) => evidenceById?.get(id)).filter((card): card is ReportWriterEvidenceCard => Boolean(card));
    const signatures = new Map<string, number[]>();
    const sourceLedParagraphIndexes: number[] = [];
    const sectionSentenceBindings: Array<{
      binding: SourceEchoSentenceBinding;
      paragraphIndex: number;
    }> = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const structuralClaim = section.paragraphClaims?.[paragraphIndex];
      const structuralEvidenceIds = dedupeStrings(
        structuralClaim?.evidenceCardIds ?? [],
      ).sort();
      const sentences = splitEvidenceAlignmentSentences(paragraph);
      const semanticBindings = sourceEchoSemanticBindings(sentences, sectionCards, ignoredTokens);
      sentences.forEach((sentence, sentenceIndex) => {
        const semanticBinding = semanticBindings[sentenceIndex];
        const markers = extractCanonicalCitationMarkers(canonicalizeCitationMarkersInText(sentence));
        const structuralBinding = structuralEvidenceIds.length === 1
          ? {
              evidenceIds: structuralEvidenceIds,
              sourceIds: structuralEvidenceIds.map((id) => evidenceById?.get(id)?.sourceId ?? id),
            }
          : markers.length === 1
            ? { evidenceIds: [`citation:${markers[0]}`], sourceIds: [`citation:${markers[0]}`] }
            : { evidenceIds: [], sourceIds: [] };
        sectionSentenceBindings.push({
          binding: semanticBinding?.evidenceIds.length === 1 ? semanticBinding : structuralBinding,
          paragraphIndex,
        });
      });
      const sourceLedCount = sentences.filter((sentence) =>
        SOURCE_LED_SENTENCE_START.test(sentence.trim()),
      ).length;
      const mirrorsSourceOrder = paragraphMirrorsSingleSourceOrder(
        sentences,
        sectionCards,
        ignoredTokens,
      );
      if (sourceLedCount >= 1 || mirrorsSourceOrder) {
        sourceLedParagraphIndexes.push(paragraphIndex);
        issues.push({
          code: "SOURCE_LED_PARAGRAPH",
          sectionId: section.sectionId,
          paragraphIndex,
          detail: mirrorsSourceOrder
            ? "successive anonymous sentences mirror one source's evidence-unit order"
            : `${sourceLedCount} sentences begin from a study or author identity`,
        });
      }
      const singleCitationSentences = sentences
        .map((sentence) => extractCanonicalCitationMarkers(
          canonicalizeCitationMarkersInText(sentence),
        ))
        .filter((markers) => markers.length === 1);
      if (
        (singleCitationSentences.length >= 2 &&
          new Set(singleCitationSentences.flat()).size >= 2) ||
        (sourceLedCount >= 2 && structuralEvidenceIds.length >= 2) ||
        hasThreeDistinctSingleSourceBindings(semanticBindings)
      ) {
        issues.push({
          code: "PAPER_BY_PAPER_STITCHING",
          sectionId: section.sectionId,
          paragraphIndex,
          detail: "successive sentences are bound one-to-one to different sources",
        });
      }
      const markers = dedupeStrings(extractCanonicalCitationMarkers(
        canonicalizeCitationMarkersInText(paragraph),
      )).sort();
      const signatureIds = structuralEvidenceIds.length >= 2
        ? structuralEvidenceIds.map((id) => `evidence:${id}`)
        : markers;
      if (signatureIds.length >= 2) {
        const signature = signatureIds.join("|");
        signatures.set(signature, [...(signatures.get(signature) ?? []), paragraphIndex]);
      }
    });
    const structuralSectionEvidenceIds = dedupeStrings([
      ...(section.evidenceCardIds ?? []),
      ...(section.paragraphClaims ?? []).flatMap((claim) => claim.evidenceCardIds),
    ]);
    if (
      sourceLedParagraphIndexes.length === 0 &&
      paragraphMirrorsSingleSourceOrder(
        splitEvidenceAlignmentSentences(section.prose),
        sectionCards,
        ignoredTokens,
      )
    ) {
      sourceLedParagraphIndexes.push(0);
      issues.push({
        code: "SOURCE_LED_PARAGRAPH",
        sectionId: section.sectionId,
        paragraphIndex: 0,
        detail: "successive anonymous sentences mirror one source's evidence-unit order",
      });
    }
    for (let index = 0; index <= sectionSentenceBindings.length - 3; index += 1) {
      const window = sectionSentenceBindings.slice(index, index + 3);
      if (!hasThreeDistinctSingleSourceBindings(window.map((item) => item.binding))) continue;
      const paragraphIndex = window[0]!.paragraphIndex;
      issues.push({
        code: "PAPER_BY_PAPER_STITCHING",
        sectionId: section.sectionId,
        paragraphIndex,
        detail: "three successive sentences are each bound to a distinct single source",
      });
    }
    if (sourceLedParagraphIndexes.length >= 2 && structuralSectionEvidenceIds.length >= 2) {
      for (const paragraphIndex of sourceLedParagraphIndexes) {
        issues.push({
          code: "PAPER_BY_PAPER_STITCHING",
          sectionId: section.sectionId,
          paragraphIndex,
          detail: "successive source-led paragraphs are structurally bound to multiple evidence cards",
        });
      }
    }
    for (const [signature, paragraphIndexes] of signatures) {
      if (paragraphIndexes.length < 3) continue;
      for (const paragraphIndex of paragraphIndexes) {
        issues.push({
          code: "BLANKET_CITATION_CLUSTER",
          sectionId: section.sectionId,
          paragraphIndex,
          detail: `citation set ${signature} is repeated across ${paragraphIndexes.length} paragraphs`,
        });
      }
    }
  }
  return issues.filter((issue, index, values) =>
    values.findIndex((candidate) =>
      candidate.code === issue.code &&
      candidate.sectionId === issue.sectionId &&
      candidate.paragraphIndex === issue.paragraphIndex
    ) === index,
  );
}

function recomposeSourceEchoSections(
  sections: ReportWriterSection[],
  deterministicSections: ReportWriterSection[],
  evidenceById?: ReadonlyMap<string, PipelineEvidenceCard>,
): ReportWriterSection[] {
  const issueBySection = new Map<string, SourceEchoIssue[]>();
  for (const issue of detectSourceEchoIssues(sections, evidenceById)) {
    issueBySection.set(issue.sectionId, [...(issueBySection.get(issue.sectionId) ?? []), issue]);
  }
  const fallbackById = new Map(
    deterministicSections.map((section) => [section.sectionId, section] as const),
  );
  return sections.map((section) => {
    const issues = issueBySection.get(section.sectionId) ?? [];
    if (issues.length === 0 || !section.generationMethod?.startsWith("llm_")) return section;
    const fallback = fallbackById.get(section.sectionId);
    if (!fallback || detectSourceEchoIssues([fallback], evidenceById).length > 0) {
      return {
        ...section,
        warnings: dedupeStrings([
          ...(section.warnings ?? []),
          ...issues.map((issue) => issue.code),
        ]),
      };
    }
    return {
      ...fallback,
      generationMethod: "deterministic_source_echo_recomposition",
      warnings: dedupeStrings([
        ...(fallback.warnings ?? []),
        ...issues.map((issue) => `${issue.code}:model_prose_recomposed`),
      ]),
    };
  });
}

/**
 * Locks report structure, citation identity/order, and every explicit numeric or
 * method token. Editorial prose may improve flow, but it cannot create facts.
 */
export function auditDocumentEditorialPass(
  before: ReportWriterSection[],
  after: ReportWriterSection[],
): DocumentEditorialAudit {
  const issues: string[] = [];
  if (before.length !== after.length) issues.push("section_count_changed");
  before.forEach((section, index) => {
    const edited = after[index];
    if (!edited || edited.sectionId !== section.sectionId) {
      issues.push(`section_order_or_identity_changed:${section.sectionId}`);
      return;
    }
    const beforeMarkers = editorialCitationFingerprint(section.prose);
    const afterMarkers = editorialCitationFingerprint(edited.prose);
    if (JSON.stringify(beforeMarkers) !== JSON.stringify(afterMarkers)) {
      issues.push(`citation_identity_or_order_changed:${section.sectionId}`);
    }
    const beforeFacts = new Set(protectedEditorialFacts(section.prose));
    const afterFacts = new Set(protectedEditorialFacts(edited.prose));
    const newFacts = [...afterFacts].filter((fact) => !beforeFacts.has(fact));
    if (newFacts.length > 0) {
      issues.push(`new_protected_fact:${section.sectionId}:${newFacts.join(",")}`);
    }
    const removedFacts = [...beforeFacts].filter((fact) => !afterFacts.has(fact));
    if (removedFacts.length > 0) {
      issues.push(`removed_protected_fact:${section.sectionId}:${removedFacts.join(",")}`);
    }
    if (containsRawReportLeak(edited.prose)) {
      issues.push(`reader_facing_internal_leak:${section.sectionId}`);
    }
    for (const [label, pattern] of EDITORIAL_FORBIDDEN_TEMPLATE_PATTERNS) {
      if (pattern.test(edited.prose)) issues.push(`${label}:${section.sectionId}`);
    }
  });
  const repetitionBefore = documentEditorialRepetitionBurden(before);
  const repetitionAfter = documentEditorialRepetitionBurden(after);
  if (repetitionAfter > repetitionBefore) {
    issues.push(`document_repetition_increased:${repetitionBefore}->${repetitionAfter}`);
  } else if (repetitionBefore > 0 && repetitionAfter >= repetitionBefore) {
    issues.push(`document_repetition_not_improved:${repetitionBefore}->${repetitionAfter}`);
  }
  return { passed: issues.length === 0, issues: dedupeStrings(issues) };
}

function postEditEvidenceValidationIssues(
  sections: ReportWriterSection[],
  evidenceById: Map<string, PipelineEvidenceCard>,
): string[] {
  const issues: string[] = [];
  for (const section of sections) {
    const paragraphClaims = section.paragraphClaims?.length
      ? section.paragraphClaims
      : paragraphClaimsForSection({
          sectionId: section.sectionId,
          prose: section.prose,
          evidenceCardIds: section.evidenceCardIds,
          evidenceById,
          plannedClaimIds: boundClaimIdsForSection(section),
        });
    for (const unsupported of paragraphClaims.flatMap((claim) => claim.unsupportedSentences)) {
      issues.push(`unsupported_uncited_claim:${section.sectionId}:${unsupported.slice(0, 120)}`);
    }
    const aligned = new Set(
      alignedModelSentencesForSection({ ...section, paragraphClaims }, evidenceById)
        .map((item) => canonicalSentenceFingerprint(item.sentence))
        .filter((fingerprint): fingerprint is string => Boolean(fingerprint)),
    );
    const citedSentences = splitEvidenceAlignmentSentences(section.prose)
      .filter((sentence) => extractCanonicalCitationMarkers(sentence).length > 0);
    for (const sentence of citedSentences) {
      const fingerprint = canonicalSentenceFingerprint(sentence);
      if (fingerprint && !aligned.has(fingerprint)) {
        issues.push(`claim_evidence_alignment_failed:${section.sectionId}:${sentence.slice(0, 120)}`);
      }
    }
  }
  for (const issue of detectSourceEchoIssues(sections, evidenceById)) {
    issues.push(`${issue.code}:${issue.sectionId}:paragraph-${issue.paragraphIndex + 1}`);
  }
  return dedupeStrings(issues);
}

function postEditIssueKind(issue: string): string {
  return issue.split(":", 2).join(":");
}

function introducedPostEditIssues(
  before: ReportWriterSection[],
  after: ReportWriterSection[],
  evidenceById: Map<string, PipelineEvidenceCard>,
): string[] {
  const baselineCounts = new Map<string, number>();
  for (const issue of postEditEvidenceValidationIssues(before, evidenceById)) {
    const kind = postEditIssueKind(issue);
    baselineCounts.set(kind, (baselineCounts.get(kind) ?? 0) + 1);
  }
  const seenCounts = new Map<string, number>();
  return postEditEvidenceValidationIssues(after, evidenceById).filter((issue) => {
    const kind = postEditIssueKind(issue);
    const seen = (seenCounts.get(kind) ?? 0) + 1;
    seenCounts.set(kind, seen);
    return seen > (baselineCounts.get(kind) ?? 0);
  });
}

async function runDocumentEditorialPass(input: {
  reportInput: ReportWriterInput;
  sections: ReportWriterSection[];
  evidenceById: Map<string, PipelineEvidenceCard>;
  options: ReportWriterOptions;
  model: string;
  timeoutMs: number;
}): Promise<{
  sections: ReportWriterSection[];
  status: "applied" | "rejected" | "failed";
  provider: string | null;
  model: string | null;
  issues: string[];
}> {
  try {
    const llmResult = await requestLlmText({
      operation: "report_generation",
      featureName: "report_document_editorial_pass",
      purpose: "report_writer",
      temperature: 0.1,
      maxTokens: 3_400,
      responseFormat: "json_object",
      llm: {
        ...input.options.llm,
        model: input.model,
        timeoutMs: input.timeoutMs,
      },
      fetchImpl: input.options.fetchImpl,
      messages: [
        {
          role: "system",
          content: [
            "You are ResearchForge's document-level academic editor.",
            "Return exactly one JSON object with a sections array and no other text.",
            "Edit the complete Traditional-Chinese report for paragraph logic, transitions, cross-source synthesis, terminology consistency, repetition, and non-template academic tone.",
            TAIWAN_TRADITIONAL_CHARACTER_RULE,
            "Preserve every sectionId, section order, citation marker, citation order, number, year, location, method name, effect measure, and evidence boundary exactly.",
            "Do not add a source, fact, causal relation, statistic, interpretation, recommendation, or citation.",
            "Keep each substantive paragraph coherent: topic sentence, evidence, comparison or synthesis, and meaning for the research question.",
            "Keep the edited report at or below the current length; do not expand sections.",
            "Do not write internal system terms or the templates 第一項發現是, 第二項發現是, 簡短結論, or 目前無法回答的部分.",
            "Schema: {\"sections\":[{\"sectionId\":\"introduction\",\"title\":\"...\",\"prose\":\"...\"}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            researchQuestion: input.reportInput.reportPlan?.researchQuestion ?? input.reportInput.topic,
            centralAnswer: input.reportInput.reportPlan?.centralAnswer ?? null,
            terminology: input.reportInput.reportPlan?.terminology ?? {},
            conclusionBoundary: input.reportInput.reportPlan?.conclusionBoundary ?? null,
            sectionPlans: input.reportInput.reportPlan?.sections.map((section) => ({
              sectionId: section.sectionId,
              sectionPurpose: section.sectionPurpose ?? section.goal,
              sectionThesis: section.sectionThesis ?? section.sectionClaim ?? null,
              transitionGoal: section.transitionGoal ?? section.transitionToNext ?? null,
              limitationBoundary: section.limitationBoundary ?? section.limitations?.join("；") ?? null,
            })) ?? [],
            sections: input.sections.map((section) => ({
              sectionId: section.sectionId,
              title: section.title,
              prose: section.prose,
            })),
          }),
        },
      ],
    });
    let rawSections: unknown[];
    try {
      rawSections = sectionItems(safeJsonParse(llmResult.content));
    } catch (error) {
      if (!(error instanceof LlmAdapterError) || error.code !== "invalid-json") {
        throw error;
      }
      rawSections = recoverSectionObjectsFromPartialJson(llmResult.content);
      if (rawSections.length === 0) throw error;
    }
    const editedById = new Map<string, string>();
    for (const raw of rawSections) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const sectionId = cleanText(typeof record.sectionId === "string" ? record.sectionId : null);
      const prose = normalizeReaderFacingProse(cleanText(typeof record.prose === "string" ? record.prose : null));
      if (sectionId && prose) editedById.set(sectionId, prose);
    }
    const edited = input.sections.map((section) => ({
      ...section,
      prose: editedById.get(section.sectionId) ?? section.prose,
    }));
    const rejectedIssues: string[] = [];
    let appliedCount = 0;
    const safeSections = input.sections.map((section, index) => {
      const candidate = edited[index];
      const sectionAudit = auditDocumentEditorialPass([section], [candidate]);
      const introducedIssues = sectionAudit.passed
        ? introducedPostEditIssues([section], [candidate], input.evidenceById)
        : sectionAudit.issues;
      if (introducedIssues.length > 0) {
        rejectedIssues.push(...introducedIssues.map((issue) => `section_edit_rejected:${section.sectionId}:${issue}`));
        return section;
      }
      if (candidate.prose !== section.prose) appliedCount += 1;
      const planSection = input.reportInput.reportPlan?.sections.find(
        (item) => item.sectionId === candidate.sectionId,
      );
      const plannedClaimIds = dedupeStrings([
        ...boundClaimIdsForSection(candidate),
        ...(planSection?.plannedClaimIds ?? []),
      ]);
      return {
        ...candidate,
        generationMethod: `${candidate.generationMethod ?? "llm"}+document_editorial_pass`,
        paragraphClaims: paragraphClaimsForSection({
          sectionId: candidate.sectionId,
          prose: candidate.prose,
          evidenceCardIds: candidate.evidenceCardIds,
          evidenceById: input.evidenceById,
          plannedClaimIds,
          plannedClaims: input.reportInput.reportPlan?.plannedClaims.filter((claim) =>
            plannedClaimIds.includes(claim.claimId),
          ),
          paragraphPlans: planSection?.paragraphPlan,
        }),
      };
    });
    if (appliedCount === 0) {
      return {
        sections: input.sections,
        status: "rejected",
        provider: llmResult.provider,
        model: llmResult.model,
        issues: dedupeStrings(rejectedIssues.length > 0 ? rejectedIssues : ["editorial_pass_made_no_safe_changes"]),
      };
    }
    const finalAudit = auditDocumentEditorialPass(input.sections, safeSections);
    if (!finalAudit.passed) {
      return {
        sections: input.sections,
        status: "rejected",
        provider: llmResult.provider,
        model: llmResult.model,
        issues: finalAudit.issues,
      };
    }
    return {
      sections: safeSections,
      status: "applied",
      provider: llmResult.provider,
      model: llmResult.model,
      issues: dedupeStrings(rejectedIssues),
    };
  } catch (error) {
    return {
      sections: input.sections,
      status: "failed",
      provider: null,
      model: null,
      issues: [reportWriterErrorReason(error)],
    };
  }
}

function sectionGroups<T>(items: T[], size = 3): T[][] {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

async function mapWithBoundedConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function attemptPromptForSectionIds(input: {
  reportInput: ReportWriterInput;
  sources: SourceRecord[];
  evidenceCards: PipelineEvidenceCard[];
  sectionEvidenceMap: SectionEvidenceMapEntry[];
  paragraphPlans: ParagraphPlan[];
  baselineSections: ReportWriterSection[];
  sectionIds: Set<string>;
  mode: ReportWriterAttemptMode;
}): ReportWriterAttemptPrompt {
  const sectionEvidenceMap = input.sectionEvidenceMap.filter((section) =>
    input.sectionIds.has(section.sectionId)
  );
  const allowedEvidenceIds = new Set(
    sectionEvidenceMap.flatMap((section) =>
      section.evidenceCards.map((card) => card.id)
    ),
  );
  const evidenceCards = input.evidenceCards.filter((card) =>
    allowedEvidenceIds.has(card.id)
  );
  // Canonical reconstruction gets continuity from the discourse contract. A
  // deterministic baseline may contain card-derived prose, so feeding its
  // previous-section summary back to the model would violate raw/card-to-
  // writer isolation. Legacy plans retain the compatibility handoff.
  const previousSectionSummaries = input.reportInput.reportPlan?.normalizedFacts?.length
    ? []
    : input.baselineSections.flatMap((section, index, all) => {
        if (!input.sectionIds.has(section.sectionId) || index === 0) return [];
        const previous = all[index - 1];
        if (!previous) return [];
        return [{
          sectionId: previous.sectionId,
          title: previous.title,
          summary: reportSectionParagraphs(previous.prose)
            .slice(-1)
            .join(" ")
            .slice(0, 600),
        }];
      });
  return buildAttemptPrompt(
    input.reportInput,
    input.sources,
    evidenceCards,
    sectionEvidenceMap,
    input.paragraphPlans.filter((paragraph) => input.sectionIds.has(paragraph.section)),
    input.baselineSections.filter((section) => input.sectionIds.has(section.sectionId)),
    previousSectionSummaries,
    input.mode,
  );
}

function reportWriterErrorReason(error: unknown): string {
  if (error instanceof LlmAdapterError) return `${error.code}:${error.message}`;
  if (error instanceof Error) return error.message;
  return "unknown_report_writer_failure";
}

function errorAllowsScopedRepair(error: unknown): boolean {
  return error instanceof LlmAdapterError &&
    (error.code === "invalid-json" || error.code === "provider-timeout");
}

export async function writeReportWithLlm(
  input: ReportWriterInput,
  options: ReportWriterOptions = {},
): Promise<ReportWriterResult> {
  const providerConfig = resolvePrivateLlmProviderConfig({
    apiKey: options.llm?.apiKey,
    baseURL: options.llm?.baseUrl,
    model: options.llm?.model,
  });
  const usingOpenAiProvider =
    providerConfig.provider === "openai" ||
    process.env.LLM_PROVIDER?.trim().toLowerCase() === "openai";
  const usingOllamaProvider =
    providerConfig.provider === "ollama" ||
    process.env.LLM_PROVIDER?.trim().toLowerCase() === "ollama";
  const preferredModel =
    options.llm?.model ??
    providerConfig.model ??
    (usingOpenAiProvider
      ? resolveOpenAiModelAlias(process.env.OPENAI_MODEL?.trim() ?? DEFAULT_OPENAI_MODEL)
      : undefined) ??
    process.env.SCHOOL_LLM_MODEL?.trim() ??
    (process.env.OPENAI_MODEL?.trim()
      ? resolveOpenAiModelAlias(process.env.OPENAI_MODEL)
      : undefined) ??
    process.env.REPORT_MODEL?.trim() ??
    process.env.REPORT_FAST_MODEL?.trim() ??
    process.env.LLM_MODEL?.trim() ??
    process.env.OLLAMA_MODEL?.trim() ??
    DEFAULT_REPORT_WRITER_MODEL;
  const requestedPreferredTimeoutMs =
    options.llm?.timeoutMs ??
    positiveEnvNumber(
      process.env.REPORT_WRITER_LLM_TIMEOUT_MS,
      process.env.REPORT_LLM_TIMEOUT_MS,
    ) ??
    DEFAULT_REPORT_WRITER_TIMEOUT_MS;
  // The cloud request budget must remain below the hosting limit. A local,
  // explicitly selected Ollama runtime has no such network-function deadline
  // and may need longer for CPU/GPU-bound academic reconstruction.
  const preferredTimeoutMs = usingOllamaProvider
    ? requestedPreferredTimeoutMs
    : Math.min(requestedPreferredTimeoutMs, DEFAULT_REPORT_WRITER_TIMEOUT_MS);
  const retryModel =
    options.llm?.model ??
    providerConfig.model ??
    (usingOpenAiProvider
      ? resolveOpenAiModelAlias(process.env.OPENAI_MODEL?.trim() ?? DEFAULT_OPENAI_MODEL)
      : undefined) ??
    process.env.SCHOOL_LLM_MODEL?.trim() ??
    (process.env.OPENAI_MODEL?.trim()
      ? resolveOpenAiModelAlias(process.env.OPENAI_MODEL)
      : undefined) ??
    process.env.SCHOOL_LLM_RETRY_MODEL?.trim() ??
    process.env.REPORT_RETRY_MODEL?.trim() ??
    process.env.REPORT_FAST_MODEL?.trim() ??
    process.env.LLM_FAST_MODEL?.trim() ??
    DEFAULT_REPORT_WRITER_RETRY_MODEL;
  const requestedRetryTimeoutMs =
    positiveEnvNumber(
      process.env.REPORT_WRITER_RETRY_TIMEOUT_MS,
      process.env.REPORT_RETRY_TIMEOUT_MS,
      process.env.REPORT_FAST_TIMEOUT_MS,
    ) ?? DEFAULT_REPORT_WRITER_RETRY_TIMEOUT_MS;
  const retryTimeoutMs = usingOllamaProvider
    ? requestedRetryTimeoutMs
    : Math.min(requestedRetryTimeoutMs, DEFAULT_REPORT_WRITER_RETRY_TIMEOUT_MS);
  const reportGenerationProvider = providerLabel(
    options.llm?.baseUrl ??
      providerConfig.baseURL ??
      process.env.SCHOOL_LLM_BASE_URL ??
      process.env.OPENAI_BASE_URL ??
      process.env.LLM_BASE_URL ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434/v1",
  );
  const reportGenerationModel = preferredModel;
  const writerContext = {
    workflowId: input.workflowId,
    topicHash: input.topicHash,
  };
  const sources = input.acceptedSources.filter((source) =>
    sourceEligibleForReportWriter(source, writerContext),
  );
  const evidenceCards = pipelineEvidenceCards(input.evidenceCards, sources, writerContext);
  if (input.writerEvidenceSet) {
    const expectedIds = [...input.writerEvidenceSet.eligibleEvidenceCardIds].sort();
    const submittedIds = dedupeStrings(
      (input.evidenceCards ?? []).map(evidenceIdentity),
    ).sort();
    const writerIds = dedupeStrings(evidenceCards.map(evidenceIdentity)).sort();
    const hashMatches =
      input.evidenceSetHash === input.writerEvidenceSet.evidenceSetHash &&
      input.reportPlan?.evidenceSetHash === input.writerEvidenceSet.evidenceSetHash;
    if (
      !hashMatches ||
      JSON.stringify(expectedIds) !== JSON.stringify(submittedIds) ||
      JSON.stringify(expectedIds) !== JSON.stringify(writerIds)
    ) {
      return {
        ok: false,
        status: "invalid_input",
        llm_status: "skipped",
        fallback_used: false,
        message: "WriterEvidenceSet changed after planning; rebuild the ReportPlan.",
        warning: "writer_evidence_set_identity_mismatch",
        sectionPlan: [],
        sections: [],
        reportGenerationProvider,
        reportGenerationModel,
        reportGenerationStatus: "skipped",
        fallbackUsed: false,
        fallbackReason: null,
        adapter: reportGenerationProvider,
        requestedModel: reportGenerationModel,
        actualModel: null,
        reportMode: input.reportMode,
        reportPlan: input.reportPlan,
        reportPlanStatus: "plan_built",
        reportPlanDiagnostics: ["writer_evidence_set_identity_mismatch"],
        evidenceSetHash: input.writerEvidenceSet.evidenceSetHash,
        readinessStatus: "invalid_evidence_set",
      };
    }
    const narrativeContractDiagnostics = canonicalNarrativeContractDiagnostics(input.reportPlan);
    if (narrativeContractDiagnostics.length > 0) {
      return {
        ok: false,
        status: "invalid_input",
        llm_status: "skipped",
        fallback_used: false,
        message: "Canonical report generation requires atomic facts, a claim graph, and the exact two-stage narrative contract.",
        warning: narrativeContractDiagnostics.join(" | "),
        sectionPlan: [],
        sections: [],
        reportGenerationProvider,
        reportGenerationModel,
        reportGenerationStatus: "skipped",
        fallbackUsed: false,
        fallbackReason: null,
        adapter: reportGenerationProvider,
        requestedModel: reportGenerationModel,
        actualModel: null,
        reportMode: input.reportMode,
        reportPlan: input.reportPlan,
        reportPlanStatus: "plan_built",
        reportPlanDiagnostics: narrativeContractDiagnostics,
        evidenceSetHash: input.writerEvidenceSet.evidenceSetHash,
        readinessStatus: "invalid_evidence_set",
      };
    }
  }
  const requestedSectionPlan = sectionPlanForInput(input);
  const reportPlanStatus: ReportWriterPlanStatus = input.reportPlan
    ? input.reportPlanStatus ?? "complete"
    : "degraded_legacy";
  const reportPlanDiagnostics = dedupeStrings([
    ...(input.reportPlanDiagnostics ?? []),
    ...(!input.reportPlan ? ["legacy_report_plan_missing"] : []),
  ]);
  const sectionEvidenceMap = buildSectionEvidenceMap(
    input.topic,
    evidenceCards,
    requestedSectionPlan,
    input.reportPlan,
  );
  const sectionPlan = reportWriterSectionPlan(sectionEvidenceMap);
  const paragraphPlans = buildParagraphPlans(input.topic, sectionEvidenceMap);
  const draftParagraphs = renderDraftParagraphs(
    input.topic,
    paragraphPlans,
    evidenceCards,
    sources,
    input.reportPlan?.plannedClaims ?? [],
  );
  const citationValidation = validateDraftParagraphs(
    draftParagraphs,
    evidenceCards,
    sources,
  );
  const evidenceById = new Map(evidenceCards.map((card) => [card.id, card]));
  const deterministicSections = enforceReaderFacingSectionContract(
    sanitizeForbiddenInstructionSections(
      mergeSectionsWithDeterministicBaseline(
        [],
        buildDeterministicSections(draftParagraphs, evidenceCards),
        citationValidation,
        evidenceById,
      ),
      sectionEvidenceMap,
    ),
    evidenceById,
  );

  const boundEvidenceCardCount = new Set(
    sectionEvidenceMap.flatMap((section) =>
      section.evidenceCards.map((card) => card.id)
    ),
  ).size;
  if (
    sources.length < 1 ||
    evidenceCards.length < 1 ||
    (input.reportPlan && boundEvidenceCardCount < 1)
  ) {
    return {
      ok: false,
      status: "insufficient_sources",
      llm_status: "skipped",
      fallback_used: false,
      model: reportGenerationModel ?? undefined,
      message: messageFromStatus("insufficient_sources", "report_generation"),
      warning: [
        input.reportPlan && boundEvidenceCardCount < 1
          ? "report_plan_has_no_accepted_evidence_bindings"
          : "accepted_evidence_cards_missing",
        ...reportPlanDiagnostics,
        ...citationValidation.warnings,
      ].join(" | "),
      sectionPlan,
      sections: [],
      reportGenerationProvider,
      reportGenerationModel,
      reportGenerationStatus: "skipped",
      fallbackUsed: false,
      fallbackReason: null,
      adapter: reportGenerationProvider,
      requestedModel: reportGenerationModel,
      actualModel: null,
      reportMode: input.reportMode,
      reportPlan: input.reportPlan,
      reportPlanStatus,
      reportPlanDiagnostics,
      evidenceSetHash: input.writerEvidenceSet?.evidenceSetHash,
      readinessStatus: input.readinessStatus,
      writerDiagnostics: {
        requestedSections: requestedSectionPlan.length,
        completedSections: 0,
        modelCompletedSections: 0,
        repairedSections: 0,
        fallbackSections: 0,
        completedSectionIds: [],
        repairedSectionIds: [],
        fallbackSectionIds: [],
        failureReasons: { report: "accepted_evidence_cards_missing" },
      },
    };
  }
  const evidenceToSource = new Map(
    evidenceCards.map((card) => [card.id, card.sourceId]),
  );
  const allowedSourceIds = new Set(sources.map((source) => source.id).filter(Boolean));

  try {
    if (providerConfig.available && !providerConfig.modelConfigured && !usingOpenAiProvider) {
      throw new LlmAdapterError(
        "model-missing",
        "MODEL_MISSING: LLM provider is configured, but no model is set. Set SCHOOL_LLM_MODEL or OPENAI_MODEL.",
      );
    }
    const collectedSections = new Map<string, ReportWriterSection>();
    const primaryCandidateSections = new Map<string, ReportWriterSection>();
    const failureReasons: Record<string, string> = {};
    const attemptWarnings: string[] = [];
    let lastLlmResult: ReportWriterAttemptResult["llmResult"] | null = null;
    let firstFatalError: unknown = null;

    // A local Ollama request is not constrained by a serverless response
    // window. Keep its canonical report in one global teach-back -> academic
    // reconstruction pair so the second pass sees the whole argument graph;
    // cloud providers retain bounded three-section groups.
    const groups = sectionGroups(
      requestedSectionPlan,
      usingOllamaProvider ? requestedSectionPlan.length : 3,
    );
    const primaryOutcomes = await mapWithBoundedConcurrency(
      groups,
      REPORT_WRITER_GROUP_CONCURRENCY,
      async (group) => {
        const groupIds = new Set<string>(group.map((section) => section.sectionId));
        const primaryPrompt = attemptPromptForSectionIds({
          reportInput: input,
          sources,
          evidenceCards,
          sectionEvidenceMap,
          paragraphPlans,
          baselineSections: deterministicSections,
          sectionIds: groupIds,
          mode: "primary",
        });
        try {
          const primary = await runReportWriterAttempt(
            input,
            options,
            primaryPrompt,
            evidenceToSource,
            evidenceById,
            allowedSourceIds,
            preferredModel,
            preferredTimeoutMs,
          );
          return { group, groupIds, primary, primaryError: null as unknown };
        } catch (error) {
          return { group, groupIds, primary: null, primaryError: error };
        }
      },
    );

    for (const outcome of primaryOutcomes) {
      if (outcome.primaryError) {
        logger.warn(
          {
            sectionIds: outcome.group.map((section) => section.sectionId),
            reason: reportWriterErrorReason(outcome.primaryError),
          },
          "Canonical report writer primary group rejected",
        );
        firstFatalError ??= outcome.primaryError;
        for (const section of outcome.group) {
          failureReasons[section.sectionId] = reportWriterErrorReason(outcome.primaryError);
        }
        continue;
      }
      const primary = outcome.primary!;
      lastLlmResult = primary.llmResult;
      for (const section of primary.sections) {
        if (!outcome.groupIds.has(section.sectionId)) continue;
        const primaryCandidate = {
          ...section,
          generationMethod: "llm_section_group",
        };
        primaryCandidateSections.set(section.sectionId, primaryCandidate);
        const requiredEvidenceIds = sectionEvidenceMap
          .find((binding) => binding.sectionId === section.sectionId)
          ?.evidenceCards.map((card) => card.id) ?? [];
        if (sectionNeedsEvidenceBoundRepair(
          primaryCandidate,
          evidenceById,
          input.topic,
          requiredEvidenceIds,
          Boolean(input.reportPlan?.claimGraph),
        )) {
          failureReasons[section.sectionId] =
            "cross_language_section_missing_evidence_aligned_substance";
          continue;
        }
        const mergeReadyPrimary = mergeReadyLlmSection(primaryCandidate);
        if (!mergeReadyPrimary) {
          failureReasons[section.sectionId] =
            "section_output_removed_by_reader_safety_contract";
          continue;
        }
        collectedSections.set(section.sectionId, mergeReadyPrimary);
      }
      if (primary.recoveryMode === "partial_json") {
        attemptWarnings.push(
          "LLM report writer returned truncated JSON; recovered complete sections from the partial response.",
        );
      }
      if (primary.recoveryMode === "freeform") {
        attemptWarnings.push(
          "LLM report writer returned non-JSON prose; recovered sections with freeform fallback parsing.",
        );
      }
    }

    const repairCandidates = primaryOutcomes.flatMap((outcome) =>
      outcome.group
        .filter((section) => !collectedSections.has(section.sectionId))
        .filter(
          () => !outcome.primaryError || errorAllowsScopedRepair(outcome.primaryError),
        ),
    );
    logger.info(
      {
        acceptedSectionIds: [...collectedSections.keys()],
        repairSectionIds: repairCandidates.map((section) => section.sectionId),
        failureReasons,
      },
      "Canonical report writer primary validation summary",
    );
    const repairOutcomes = await mapWithBoundedConcurrency(
      repairCandidates,
      REPORT_WRITER_REPAIR_CONCURRENCY,
      async (missing) => {
        const repairIds = new Set<string>([missing.sectionId]);
        const repairPrompt = attemptPromptForSectionIds({
          reportInput: input,
          sources,
          evidenceCards,
          sectionEvidenceMap,
          paragraphPlans,
          baselineSections: deterministicSections,
          sectionIds: repairIds,
          mode: "retry",
        });
        try {
          const repair = await runReportWriterAttempt(
            input,
            options,
            repairPrompt,
            evidenceToSource,
            evidenceById,
            allowedSourceIds,
            retryModel,
            retryTimeoutMs,
          );
          const repaired = repair.sections.find(
            (section) => section.sectionId === missing.sectionId,
          );
          return { missing, repair, repaired, repairError: null as unknown };
        } catch (error) {
          return { missing, repair: null, repaired: undefined, repairError: error };
        }
      },
    );

    for (const outcome of repairOutcomes) {
      if (outcome.repairError) {
        logger.warn(
          {
            sectionId: outcome.missing.sectionId,
            reason: reportWriterErrorReason(outcome.repairError),
          },
          "Canonical report writer scoped repair rejected",
        );
        firstFatalError ??= outcome.repairError;
        failureReasons[outcome.missing.sectionId] = reportWriterErrorReason(
          outcome.repairError,
        );
        continue;
      }
      lastLlmResult = outcome.repair!.llmResult;
      if (!outcome.repaired) {
        failureReasons[outcome.missing.sectionId] =
          "section_repair_returned_no_matching_section";
        continue;
      }
      const repairedCandidate: ReportWriterSection = {
        ...outcome.repaired,
        generationMethod: "llm_section_repair",
        warnings: dedupeStrings([
          ...(outcome.repaired.warnings ?? []),
          "section_repaired_after_invalid_or_missing_output",
        ]),
      };
      const requiredEvidenceIds = sectionEvidenceMap
        .find((binding) => binding.sectionId === outcome.missing.sectionId)
        ?.evidenceCards.map((card) => card.id) ?? [];
      const effectiveRepair = sectionNeedsEvidenceBoundRepair(
        repairedCandidate,
        evidenceById,
        input.topic,
        requiredEvidenceIds,
        Boolean(input.reportPlan?.claimGraph),
      )
        ? reconstructEvidenceBoundModelSection({
            candidates: [
              ...(outcome.missing.sectionId === "conclusion"
                ? Array.from(collectedSections.values())
                : []),
              primaryCandidateSections.get(outcome.missing.sectionId),
              repairedCandidate,
            ],
            evidenceById,
            topic: input.topic,
            requiredEvidenceIds,
          })
        : repairedCandidate;
      const mergeReadyRepair = effectiveRepair
        ? mergeReadyLlmSection(effectiveRepair)
        : null;
      if (!mergeReadyRepair) {
        failureReasons[outcome.missing.sectionId] =
          "section_repair_failed_evidence_bound_completeness";
        continue;
      }
      collectedSections.set(outcome.missing.sectionId, mergeReadyRepair);
      delete failureReasons[outcome.missing.sectionId];
      attemptWarnings.push(
        `章節「${outcome.missing.title}」初次輸出格式不完整，已只針對該章節完成受控 repair。`,
      );
    }

    if (collectedSections.size === 0) {
      throw firstFatalError ?? new LlmAdapterError(
        "invalid-json",
        "LLM report writer did not return any usable section after scoped repair.",
      );
    }

    const sections = requestedSectionPlan
      .map((section) => collectedSections.get(section.sectionId))
      .filter((section): section is ReportWriterSection => Boolean(section));
    const preEditorialSections = recomposeSourceEchoSections(enforceReaderFacingSectionContract(
      sanitizeForbiddenInstructionSections(
        mergeSectionsWithDeterministicBaseline(
          sections,
          deterministicSections,
          citationValidation,
          evidenceById,
        ),
        sectionEvidenceMap,
      ),
      evidenceById,
    ), deterministicSections, evidenceById);
    const editorialResult = input.reportPlan
      ? await runDocumentEditorialPass({
          reportInput: input,
          sections: preEditorialSections,
          evidenceById,
          options,
          model: preferredModel,
          timeoutMs: preferredTimeoutMs,
        })
      : {
          sections: preEditorialSections,
          status: "skipped" as const,
          provider: null,
          model: null,
          issues: ["structured_report_plan_missing"],
        };
    const mergedSections = editorialResult.sections;
    const postEditValidationIssues = dedupeStrings([
      ...introducedPostEditIssues(
      preEditorialSections,
      mergedSections,
      evidenceById,
      ),
      ...(input.reportPlan
        ? auditClaimCitationEntailment(input.reportPlan, mergedSections)
        : []),
    ]);
    const postEditBlocked = postEditValidationIssues.length > 0;
    const modelCompletedSectionIds = mergedSections
      .filter((section) =>
        section.generationMethod?.startsWith("llm_section_group") ||
        section.generationMethod?.startsWith("llm_section_repair") ||
        section.generationMethod?.startsWith("llm_verified_sentence_reconstruction")
      )
      .map((section) => section.sectionId);
    const fallbackSectionIds = mergedSections
      .filter((section) => section.generationMethod?.startsWith("deterministic_evidence_fallback"))
      .map((section) => section.sectionId);
    for (const sectionId of fallbackSectionIds) {
      failureReasons[sectionId] ??= "missing_or_invalid_section_output";
    }
    const effectiveRepairedSectionIds = mergedSections
      .filter((section) =>
        section.generationMethod === "llm_section_repair" ||
        section.generationMethod === "llm_verified_sentence_reconstruction"
      )
      .map((section) => section.sectionId);
    const writerDiagnostics: ReportWriterDiagnostics = {
      requestedSections: requestedSectionPlan.length,
      completedSections: mergedSections.length,
      modelCompletedSections: modelCompletedSectionIds.length,
      repairedSections: effectiveRepairedSectionIds.length,
      fallbackSections: fallbackSectionIds.length,
      completedSectionIds: mergedSections.map((section) => section.sectionId),
      repairedSectionIds: effectiveRepairedSectionIds,
      fallbackSectionIds,
      failureReasons,
      editorialPass: {
        status: editorialResult.status,
        provider: editorialResult.provider,
        model: editorialResult.model,
        issues: editorialResult.issues,
      },
      postEditValidation: {
        status: postEditValidationIssues.length === 0 ? "pass" : "blocked",
        issues: postEditValidationIssues,
      },
    };
    const warnings = [
      ...reportPlanDiagnostics,
      ...attemptWarnings,
      sections.length < requestedSectionPlan.length
        ? `LLM report writer completed ${sections.length}/${requestedSectionPlan.length} sections; ${fallbackSectionIds.length} sections used deterministic evidence-backed fallback.`
        : null,
      ...citationValidation.warnings,
      ...postEditValidationIssues.map((issue) => `post_edit_validation_blocked:${issue}`),
    ].filter(Boolean);
    const effectiveLlmResult = lastLlmResult;
    return {
      ok: !postEditBlocked,
      status: postEditBlocked ? "error" : "success",
      llm_status: postEditBlocked ? "failed" : "success",
      fallback_used: false,
      model: reportGenerationModel ?? undefined,
      message: postEditBlocked
        ? "LLM report generation completed, but post-edit validation blocked formal output."
        : "LLM report generation completed.",
      warning: warnings.length > 0 ? warnings.join(" ") : null,
      sectionPlan,
      sections: mergedSections,
      reportGenerationProvider: effectiveLlmResult?.provider ?? reportGenerationProvider,
      reportGenerationModel: effectiveLlmResult?.model ?? reportGenerationModel,
      reportGenerationStatus: postEditBlocked ? "failed" : "success",
      fallbackUsed: false,
      fallbackReason: postEditBlocked
        ? `post_edit_validation_blocked:${postEditValidationIssues.join("|")}`
        : null,
      adapter: effectiveLlmResult?.provider ?? reportGenerationProvider,
      requestedModel: preferredModel,
      actualModel: effectiveLlmResult?.model ?? reportGenerationModel,
      reportMode: input.reportMode,
      reportPlan: input.reportPlan,
      reportPlanStatus,
      reportPlanDiagnostics,
      evidenceSetHash: input.writerEvidenceSet?.evidenceSetHash,
      readinessStatus: input.readinessStatus,
      writerDiagnostics,
    };
  } catch (error) {
    const status = fallbackStatus(error);
    const warning = fallbackWarning(error);
    const structuredStatus = statusFromLlmError(error);
    logLlmFallback({
      operation: "report_generation",
      status: structuredStatus,
      provider: reportGenerationProvider,
      model: reportGenerationModel,
      endpoint: null,
      reason: warning,
      route: "/api/generate-report",
    });
    return {
      ok: false,
      status: structuredStatus,
      llm_status: status,
      fallback_used: true,
      model: reportGenerationModel ?? undefined,
      message: `${messageFromStatus(structuredStatus, "report_generation")} 已保留 evidence-grounded 完整草稿。`,
      warning: [warning, ...reportPlanDiagnostics, ...citationValidation.warnings]
        .filter(Boolean)
        .join(" | "),
      sectionPlan,
      sections: deterministicSections,
      reportGenerationProvider,
      reportGenerationModel,
      reportGenerationStatus: status,
      fallbackUsed: true,
      fallbackReason: [warning, ...reportPlanDiagnostics, ...citationValidation.warnings]
        .filter(Boolean)
        .join(" | "),
      adapter: reportGenerationProvider,
      requestedModel: preferredModel,
      actualModel: null,
      reportMode: input.reportMode,
      reportPlan: input.reportPlan,
      reportPlanStatus,
      reportPlanDiagnostics,
      evidenceSetHash: input.writerEvidenceSet?.evidenceSetHash,
      readinessStatus: input.readinessStatus,
      writerDiagnostics: {
        requestedSections: requestedSectionPlan.length,
        completedSections: deterministicSections.length,
        modelCompletedSections: 0,
        repairedSections: 0,
        fallbackSections: deterministicSections.length,
        completedSectionIds: deterministicSections.map((section) => section.sectionId),
        repairedSectionIds: [],
        fallbackSectionIds: deterministicSections.map((section) => section.sectionId),
        failureReasons: Object.fromEntries(
          deterministicSections.map((section) => [section.sectionId, warning]),
        ),
      },
    };
  }
}
