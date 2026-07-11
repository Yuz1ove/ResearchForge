import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Navbar } from "@/components/layout/navbar";
import { BrandWordmark } from "@/components/brand-wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  searchSources,
  type SourceSearchResult,
} from "@workspace/api-client-react";
import type {
  GroundingJob,
  ResearchGroundingDiagnosticTrace,
  TitleSemanticComparison,
} from "@workspace/api-zod/research-grounding";
import { parseResearchInput } from "@workspace/api-zod/research-intent";
import type { ParsedResearchInput } from "@workspace/api-zod/research-intent";
import type {
  TopicExpansionDiagnostics,
} from "@workspace/api-zod/topic-expansion";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import {
  isShortTopic,
  detectTopicCategory,
  academicToAudience,
  academicToPurpose,
  ReportInput,
  TopicCategory,
  TOPIC_CATEGORIES,
  type TopicExpansionCard,
} from "@/lib/generateReport";
import {
  buildSelectedTitleSearchPayload,
  type SelectedTitleSearchSeed,
} from "@/lib/topicTitleEnhancement";
import {
  directionHasSemanticContamination,
  generateResearchDirections,
  inferResearchDomain,
  RESEARCH_DOMAIN_OPTIONS,
  researchDomainLabel,
  topicTypeToResearchDomain,
  validateTopicForWorkflow,
  workflowStatusLabel,
  type ResearchDomain,
  type ResearchDirection,
  type TopicWorkflowState,
} from "@/lib/topicWorkflow";
import { cn } from "@/lib/utils";
import {
  buildPreflightSearchQuery,
  runSearchPreflight,
  type SearchPreflightResult,
} from "@/lib/searchPreflight";
import {
  preflightDebugLabel,
  searchIntentDebugLabel,
  type PreflightDebugLabelKey,
  type SearchIntentDebugLabelKey,
} from "@/lib/zhTwLabels";
import {
  acceptedSourceRecords,
  autoAcceptPrimarySources,
  candidateSourceRecords,
  defaultUsableSections,
  dedupeSourceRecords,
  formatSourceAuthors,
  normalizeSourceForReview,
  normalizeUsableSections,
  rejectedSourceRecords,
  SOURCE_CATEGORY_LABELS,
  SOURCE_CATEGORY_OPTIONS,
  SOURCE_CONFIDENCE_OPTIONS,
  sourceHasIncompleteMetadata,
  sourceRecordKey,
  sourceReviewCounts,
  sourceReviewState,
  type SourceRecord,
  type SourceCategory,
  updateSourceReviewState,
  WORKFLOW_REPORT_SECTIONS,
  type SourceReviewState,
} from "@/lib/sourceRecords";
import {
  buildEvidenceCards,
  type EvidenceCard,
} from "@/lib/evidenceCards";
import {
  sourceHasUsableAbstract,
  sourceSummaryForUser,
} from "@/lib/sourceSummaries";
import {
  deriveSourceSearchUiState,
  type SourceSearchUiState,
} from "@/lib/sourceSearchUiState";
import { applySourceRelevanceAssessments } from "@/lib/sourceRelevance";
import { applySourceAuthorityAndLanguage } from "@/lib/sourceAuthority";
import { supplementTrustedClimateSources } from "@/lib/trustedClimateSources";
import {
  createReportWorkspace,
  generationReadiness,
  generatorWorkflowVisibility,
  loadReportWorkspace,
  reportGenerationBlockingReason,
  reportTopicFingerprint,
  reportWorkspacePath,
  saveReportWorkspace,
  shouldRunSupplementalCoverageSearch,
  workspaceMatchesTopic,
} from "@/lib/reportWorkspace";
import {
  mergeLlmReportDraft,
  requestLlmReportDraft,
} from "@/lib/llmReportWriter";
import {
  academicSafetyBlocksReport,
  createResearchGroundingJob,
  fetchResearchGroundingJob,
  groundedEvidenceCardsForAcceptedSources,
  GROUNDING_STATUS_LABELS,
  ResearchGroundingApiError,
  groundingJobSourceContractMismatch,
  groundingJobToSourceRecords,
  queryPlanHashFromJob,
} from "@/lib/researchGrounding";
import {
  DEFAULT_REPORT_PRESENTATION,
  normalizeReportPresentation,
  type ReportPresentationSettings,
} from "@/lib/reportPresentation";
import {
  Wand2,
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
  BookOpen,
  ClipboardList,
  Sparkles,
  Lightbulb,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

// ─── Default form state ───────────────────────────────────────────────────────

type ReportInputStringKey = {
  [K in keyof ReportInput]: ReportInput[K] extends string ? K : never;
}[keyof ReportInput];

type KeywordSearchDebugState = {
  fallbackUsed: boolean;
  llmStatus: string;
  llmStatusLabel: string;
  status: SourceSearchDiagnosticStatus;
  queries: string[];
  providerErrors: string[];
  providerBreakdown: string[];
  searchIntent: SourceSearchResult["searchIntent"] | null;
  intentQueries: SourceSearchResult["queries"] | null;
  warnings: string[];
  queryLanguageCounts: {
    zh: number;
    en: number;
    mixed: number;
  };
  recovery: {
    attempted: boolean;
    addedQueryCount: number;
    rawAddedCount: number;
    dedupedAddedCount: number;
  } | null;
  retrievalStats: {
    rawResults: number;
    providerGroups: number;
    successfulProviderGroups: number;
    dedupedResults: number;
    rejectedResults: number;
    candidateResults: number;
    displayedResults: number;
    primaryCandidateResults: number;
  };
  expandedQueries: Array<{
    query: string;
    language: "zh-TW" | "en";
    purpose: string;
    source: string;
    confidence: number;
  }>;
  sourceSearchConfig: {
    candidateTarget: number;
    acceptedTarget: number;
    minAccepted: number;
    searchProfile?: ReportInput["researchDepth"];
    estimatedTime?: string;
    cacheHit?: boolean;
    cacheStatus?: string;
    earlyStopReason?: string | null;
  } | null;
  groundingDiagnostics?: GroundingPipelineDiagnosticsState | null;
  debugTrace: {
    originalTopic: string;
    normalizedTopic: string;
    semanticClassification: {
      primaryType: string;
      confidence: number;
      reason: string;
      keyConcepts: string[];
      observableLevel?: {
        microscopic?: string;
        macroscopic?: string;
      };
    };
    candidateSourceCount: number;
    acceptedSourceCount: number;
    sourceValidations: Array<{ sourceId: string; warnings: string[]; reliabilityScore: number }>;
    readableExtractions: Array<{ sourceId: string; extractionStatus: string; extractionWarnings: string[] }>;
    sourceFacts: Array<{ sourceId: string; fact: string; category: string }>;
    relevanceScores: Array<{ sourceId: string; label: string; finalScore: number; reason: string }>;
    evidenceCards: Array<{ id: string; claim: string; sourceIds: string[]; evidenceType: string }>;
    introClaims: Array<{ claim: string; sourceIds: string[]; evidenceType: string }>;
    introValidation: {
      templateDetected: boolean;
      sourceCoverage: number;
      passed: boolean;
      fallbackReason?: string;
    };
    generatedTitle: string;
    generatedSubtitle: string;
    generatedIntro: string;
    fallbackUsed: boolean;
    fallbackReason?: string;
    hardCodedTemplateDetected: boolean;
  } | null;
};

type SourcePipelineStats = KeywordSearchDebugState["retrievalStats"] & {
  primaryCandidates: number;
  secondaryCandidates: number;
  lowRelevance: number;
  rejected: number;
};

type SourceSearchPipelineDiagnostics = {
  provider_search_results_count?: number;
  retrieved_count?: number;
  deduped_count?: number;
  rejected_count?: number;
  candidate_count?: number;
  displayed_count?: number;
  primary_candidate_count?: number;
  recall_pool?: {
    rawCount: number;
    dedupedCount: number;
    byLanguage: {
      zh: number;
      en: number;
      mixed: number;
    };
    byIntent: Record<string, number>;
    bySourceApi: Record<string, number>;
  };
  recovery?: {
    attempted: boolean;
    addedQueryCount: number;
    rawAddedCount: number;
    dedupedAddedCount: number;
    queries: string[];
  };
  provider_status?: Array<{
    provider?: string;
    query?: string;
    ok?: boolean;
    result_count?: number;
    error_type?: string | null;
    error_message?: string | null;
  }>;
  warnings?: string[];
  search_profile?: ReportInput["researchDepth"];
  profile?: {
    estimatedTimeLabel?: string;
    maxCandidates?: number;
    targetAcceptedSources?: number;
  };
  cache_hit?: boolean;
  cache_status?: "hit" | "miss" | "stale_hit_refreshing" | "refresh_failed_using_stale" | "write_failed";
  early_stop_reason?: string | null;
  foreground_latency_ms?: number;
  first_candidate_latency_ms?: number;
  tried_queries?: string[];
};

type GroundingPipelineDiagnosticsState = {
  rawTopic?: string;
  rawUserTopic?: string;
  normalizedTopic?: string;
  domain?: string | null;
  intent?: string | null;
  queryPlanSummary?: string[];
  conceptGroups?: Array<{
    name: string;
    zhTerms: string[];
    enTerms: string[];
    weight: number;
  }>;
  queryPlanTopQueries?: string[];
  selectedTopic?: string;
  selectedDomain?: string;
  researchQuestion?: string;
  researchTitle?: string;
  queryPlan?: unknown;
  zhQueries?: string[];
  enQueries?: string[];
  providersCalled?: string[];
  rawProviderCounts?: Record<string, number>;
  rawProviderCount?: number;
  normalizeAttemptCount?: number;
  normalizedValidCount?: number;
  normalizedInvalidCount?: number;
  normalizedCount?: number;
  dedupedCount?: number;
  scoredCount?: number;
  highConfidenceCandidateCount?: number;
  scholarlyRecommendedCount?: number;
  officialBackgroundCount?: number;
  manualReviewCount?: number;
  candidateCount?: number;
  fallbackReviewCount?: number;
  rejectedCount?: number;
  acceptedCount?: number;
  canProceedToSourceReview?: boolean;
  canProceedToAcademicDraft?: boolean;
  canProceedToBackgroundDraft?: boolean;
  readinessReason?: string;
  readinessWarnings?: string[];
  canProceedToNextStage?: boolean;
  blockingReason?: string | null;
  userVisibleStatus?: string;
  academicRetry?: {
    count: number;
    max: number;
    active: boolean;
    exhausted: boolean;
    reason?: string;
    retryQueries?: string[];
    lastStartedAt?: string;
    lastCompletedAt?: string;
  };
  sourceQualitySummary?: {
    totalSources: number;
    academicCandidateCount: number;
    peerReviewedOrDoiCount: number;
    officialBackgroundCount: number;
    fallbackReviewCount: number;
    rejectedCount: number;
    academicEnough: boolean;
    evidenceUsableEnough: boolean;
  };
  topHighConfidenceSources?: Array<{
    title: string;
    provider?: string;
    finalScore?: number;
    matchedConcepts?: string[];
    matchedFields?: string[];
    acceptReason?: string;
    confidenceTier?: string;
  }>;
  topFallbackSources?: Array<{
    title: string;
    provider?: string;
    finalScore?: number;
    matchedConcepts?: string[];
    matchedFields?: string[];
    rejectionReason?: string;
    lowConfidence?: boolean;
    needsReview?: boolean;
  }>;
  rejectedReasonCounts?: Record<string, number>;
  rejectionReasons?: Record<string, number>;
  diagnosticTrace?: ResearchGroundingDiagnosticTrace;
  contractMismatch?: string | null;
  providerErrors?: Array<{
    provider: string;
    query: string;
    errorType?: string | null;
    errorMessage?: string | null;
  }>;
  providerHealth?: Array<{
    provider: "openalex" | "crossref" | "semantic_scholar" | "core";
    status: "healthy" | "degraded" | "down" | "disabled";
    lastSuccessAt?: string;
    lastFailureAt?: string;
    recentFailureCount: number;
    recentTimeoutCount: number;
    rollingLatencyP50?: number;
    rollingLatencyP95?: number;
    cooldownUntil?: string;
    lastErrorCode?: string;
  }>;
  sourceRetrieval?: {
    attemptedProviders?: string[];
    skippedProviders?: string[];
    degradedProviders?: string[];
    downProviders?: string[];
    fallbackReason?:
      | "scholarly_providers_unavailable"
      | "scholarly_results_below_threshold"
      | "provider_timeout"
      | "provider_down"
      | "trusted_seed_fallback"
      | "manual_import_only"
      | "none";
    fallbackProvidersUsed?: string[];
    scholarlyMinimumMet?: boolean;
    officialBackgroundMinimumMet?: boolean;
    warnings?: string[];
  };
  providerProgress?: Array<{
    provider: string;
    status:
      | "searching"
      | "returned"
      | "success"
      | "empty"
      | "timeout"
      | "error"
      | "background";
    resultCount: number;
    queryCount?: number;
    rawResultsCount?: number;
    normalizedCount?: number;
    acceptedCount?: number;
    candidateCount?: number;
    fallbackReviewCount?: number;
    rejectedCount?: number;
    durationMs?: number;
    latencyMs?: number;
    query?: string;
    errorMessage?: string | null;
  }>;
  fallbackAttempts?: Array<{
    round: number;
    fallbackReason: string;
    queryUsed: string;
    provider: string;
    rawCount: number;
    candidateCount: number;
    rejectedCount: number;
    status?: "running" | "completed" | "failed";
  }>;
  fallbackCompleted?: boolean;
  maxFallbackRounds?: number;
  finalUiState?: string;
  searchProfile?: ReportInput["researchDepth"];
  estimatedTime?: string;
  cacheHit?: boolean;
  cacheStatus?: "hit" | "miss" | "stale_hit_refreshing" | "refresh_failed_using_stale" | "write_failed";
  earlyStopReason?: string | null;
  foregroundLatencyMs?: number;
  firstCandidateLatencyMs?: number;
  triedQueries?: string[];
};

type LlmRuntimeStatus = {
  loading: boolean;
  healthOk: boolean;
  smokeOk: boolean;
  provider: string;
  model: string;
  checkedAt: string | null;
  latencyMs: number | null;
  apiKeyPresent: boolean | null;
  baseURLConfigured: boolean | null;
  credentialPreview: string | null;
  modelConfigured: boolean | null;
  errorMessage: string | null;
};

type SourceSearchResultWithDiagnostics = SourceSearchResult & {
  diagnostics?: SourceSearchPipelineDiagnostics;
  expandedQueries?: KeywordSearchDebugState["expandedQueries"];
  sourceSearchConfig?: KeywordSearchDebugState["sourceSearchConfig"];
  debugTrace?: KeywordSearchDebugState["debugTrace"];
  groundedTitle?: string;
  groundedSubtitle?: string;
  groundedIntro?: string;
};

type SourceDisplayGate = "primary" | "secondary" | "hidden";
type SourceSearchDiagnosticStatus =
  | "success"
  | "partial_success"
  | "failed"
  | "timeout"
  | "empty";

type WorkspaceResumeState = {
  reportId: string;
  loaded: boolean;
};

type SearchRequestDebugState = {
  statusCode: number | null;
  backendMessage: string;
  payloadOriginalTopic: string;
  payloadActiveResearchTopic: string;
  payloadDisplayTitle?: string;
  payloadCanonicalTopicZh?: string;
  payloadCanonicalTopicEn?: string;
  payloadQuerySeedZh?: string[];
  payloadQuerySeedEn?: string[];
};

type SourceWorkflowLock = {
  workflowId: string;
  topicHash: string;
  queryPlanHash: string;
};

type GroundingRequestState =
  | "idle"
  | "debouncing"
  | "creating_job"
  | "polling_job"
  | "searching_providers"
  | "showing_partial_candidates"
  | "ready_for_review"
  | "no_results_after_expansion"
  | "provider_partial_failure"
  | "all_providers_failed"
  | "pipeline_failed"
  | "job_create_failed"
  | "job_poll_failed"
  | "cancelled";

function groundingRequestIsLoading(state: GroundingRequestState): boolean {
  return (
    state === "creating_job" ||
    state === "polling_job" ||
    state === "searching_providers" ||
    state === "showing_partial_candidates"
  );
}

function groundingRequestStateForJob(job: GroundingJob): GroundingRequestState {
  const providerProgress = job.groundingDiagnostics?.providerProgress ?? [];
  const providerSucceeded = providerProgress.some((provider) =>
    ["success", "returned", "empty", "background"].includes(provider.status),
  );
  const providerFailed = providerProgress.some((provider) =>
    ["timeout", "error"].includes(provider.status),
  );
  const allProvidersFailed =
    providerProgress.length > 0 &&
    !providerSucceeded &&
    providerProgress.every((provider) => ["timeout", "error"].includes(provider.status));

  if (allProvidersFailed) return "all_providers_failed";
  if (job.status === "failed") return "pipeline_failed";
  if (
    job.status === "no_results_after_expansion" ||
    job.status === "no_sources_after_fallback"
  ) {
    return "no_results_after_expansion";
  }
  if (providerSucceeded && providerFailed) return "provider_partial_failure";
  if (job.status === "showing_partial_candidates") return "showing_partial_candidates";
  if (groundingJobIsTerminal(job)) return "ready_for_review";
  return "searching_providers";
}

type GroundingJobMeta = {
  jobId: string;
  workflowId: string;
  topicHash: string;
};

type GeneratorRouteStep =
  | "topic_input"
  | "grounding_progress"
  | "source_review"
  | "evidence_review"
  | "report_draft"
  | "preview"
  | "export";

type GeneratorSessionSnapshot = {
  payloadVersion: 3;
  runId: string;
  workflowId: string;
  topicHash: string;
  step: GeneratorRouteStep;
  stepHistory: GeneratorRouteStep[];
  submittedTopic: string;
  researchTopic: string;
  displayTitle: string;
  groundingJobId: string;
  groundingStatus: GroundingJob["status"] | null;
  groundingProgress: number | null;
  warnings: string[];
  queryPlan: GroundingJob["queryPlan"] | null;
  seedQueryPlan: GroundingJob["seedQueryPlan"] | null;
  groundingJob: GroundingJob | null;
  sourceCandidates: SourceRecord[];
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  academicSafetyReview: GroundingJob["academicSafetyReview"] | null;
  researchCandidates: string[];
  reportDraft: string | null;
  updatedAt: string;
};

type GeneratorRunContext = {
  runId: string | null;
  workflowId: string | null;
  topicHash: string | null;
};

type ReportGenerationDebugState = {
  workflowId: string | null;
  topicHash: string | null;
  searchedCount: number;
  reviewedCount: number;
  acceptedCount: number;
  evidenceCardCount: number;
  canGenerateReport: boolean;
  blockingReason: string | null;
};

type GeneratorWorkflowStep = "topic" | "search" | "manage" | "generate";

const INTERNAL_TO_ROUTE_STEP: Record<GeneratorWorkflowStep, GeneratorRouteStep> = {
  topic: "topic_input",
  search: "grounding_progress",
  manage: "source_review",
  generate: "report_draft",
};

const ROUTE_TO_INTERNAL_STEP: Record<GeneratorRouteStep, GeneratorWorkflowStep> = {
  topic_input: "topic",
  grounding_progress: "search",
  source_review: "manage",
  evidence_review: "manage",
  report_draft: "generate",
  preview: "generate",
  export: "generate",
};

const GENERATOR_SNAPSHOT_VERSION = 3;
const GENERATOR_URL_QUERY_KEYS = [
  "step",
  "jobId",
  "workflowId",
  "topicHash",
  "runId",
] as const;
const MIN_PRIMARY_SOURCE_COUNT = 3;
const MIN_REVIEWABLE_SOURCE_COUNT = 4;
const READY_REVIEWABLE_SOURCE_COUNT = 8;

const DEFAULT_INPUT: ReportInput = {
  topic: "",
  reportType: "研究報告",
  academicLevel: "高中",
  targetAudience: "高中",
  researchDepth: "standard",
  purpose: "研究報告",
  domainOverride: "",
  mode: "先建立報告架構",
  sourceRequirement: "需要，並生成參考文獻格式",
  citationFormat: "APA",
  chartRequirement: "需要",
  style: "高中生自然報告風格",
  length: "一般報告",
  wordCount: "",
  formalTone: "不需要",
  conversationalTone: "不需要",
  specifiedStructure: "",
  rubric: "",
  personalStyle: "",
  supplementalMaterials: "",
  outputLanguage: "繁體中文",
  rewriteSection: "",
  additionalInfo: "",
  acceptedSources: [],
};

const DEFAULT_LLM_STATUS: LlmRuntimeStatus = {
  loading: false,
  healthOk: false,
  smokeOk: false,
  provider: "openai",
  model: "gpt-5.4",
  checkedAt: null,
  latencyMs: null,
  apiKeyPresent: null,
  baseURLConfigured: null,
  credentialPreview: null,
  modelConfigured: null,
  errorMessage: null,
};

function generatorApiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL?.trim();
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}${path}`;
}

const RESEARCH_DEPTH_OPTIONS: {
  label: string;
  value: ReportInput["researchDepth"];
  recommendedSources: number;
  estimatedTime: string;
}[] = [
  { label: "quick：5 筆", value: "quick", recommendedSources: 5, estimatedTime: "約 6-8 秒" },
  { label: "standard：8 筆", value: "standard", recommendedSources: 8, estimatedTime: "約 8-12 秒" },
  { label: "deep：12 筆", value: "deep", recommendedSources: 12, estimatedTime: "約 20-30 秒，會先顯示候選來源，背景補強 metadata" },
];

// ─── Field config (visible labels map to stable internal generator values) ───

type SelectOption = { label: string; value: string };

const MAIN_SELECT_FIELDS: {
  key: ReportInputStringKey;
  label: string;
  options: SelectOption[];
}[] = [
  {
    key: "reportType",
    label: "報告類型",
    options: [
      { label: "研究報告", value: "研究報告" },
      { label: "摘要", value: "摘要" },
      { label: "總結", value: "總結" },
      { label: "知識庫整理", value: "知識庫整理" },
      { label: "專題報告", value: "專題報告" },
      { label: "實驗報告", value: "實驗報告" },
      { label: "科展報告", value: "科展報告" },
      { label: "簡報大綱", value: "簡報大綱" },
      { label: "讀書心得", value: "讀書心得" },
      { label: "自訂", value: "其他" },
    ],
  },
  {
    key: "targetAudience",
    label: "使用對象",
    options: [
      { label: "國中", value: "國中" },
      { label: "高中", value: "高中" },
      { label: "一般", value: "一般讀者" },
    ],
  },
  {
    key: "mode",
    label: "生成模式",
    options: [
      { label: "建立架構", value: "先建立報告架構" },
      { label: "完整報告", value: "直接生成完整報告" },
      { label: "資料需求表", value: "只生成資料需求表" },
    ],
  },
  {
    key: "sourceRequirement",
    label: "資料來源",
    options: [
      { label: "自動搜尋", value: "需要，並生成參考文獻格式" },
      { label: "自行提供", value: "需要，但先標示「資料來源待補」" },
    ],
  },
];

const ADVANCED_SELECT_FIELDS: {
  key: ReportInputStringKey;
  label: string;
  options: SelectOption[];
}[] = [
  {
    key: "style",
    label: "寫作風格",
    options: [
      { label: "自然學校報告", value: "高中生自然報告風格" },
      { label: "高分學校報告", value: "90 分以上學校報告風格" },
      { label: "學術研究", value: "學術研究風格" },
      { label: "口語簡報", value: "口語簡報風格" },
      { label: "深度研究", value: "深度研究報告風格" },
    ],
  },
  {
    key: "length",
    label: "報告長度",
    options: [
      { label: "短版摘要", value: "短版摘要" },
      { label: "一般報告", value: "一般報告" },
      { label: "完整報告", value: "完整報告" },
      { label: "深度研究", value: "深度研究" },
    ],
  },
  {
    key: "citationFormat",
    label: "引用格式",
    options: [
      { label: "APA", value: "APA" },
      { label: "MLA", value: "MLA" },
      { label: "芝加哥格式", value: "Chicago" },
      { label: "自訂", value: "其他" },
      { label: "不使用", value: "不需要" },
    ],
  },
  {
    key: "chartRequirement",
    label: "圖表建議",
    options: [
      { label: "加入", value: "需要" },
      { label: "不加入", value: "不需要" },
    ],
  },
  {
    key: "outputLanguage",
    label: "輸出語言",
    options: [
      { label: "繁體中文", value: "繁體中文" },
      { label: "英文", value: "英文" },
      { label: "日文", value: "日文" },
      { label: "其他", value: "其他" },
    ],
  },
];

const ADVANCED_TEXT_FIELDS: {
  key: ReportInputStringKey;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "wordCount",
    label: "字數需求",
    placeholder: "例如：1200 字、3000 字、8 頁",
  },
];

const ADVANCED_TEXTAREA_FIELDS: {
  key: ReportInputStringKey;
  label: string;
  placeholder: string;
  minHeight: string;
}[] = [
  {
    key: "specifiedStructure",
    label: "指定架構",
    placeholder: "例如：前言、研究方法、結果、討論、結論",
    minHeight: "min-h-[88px]",
  },
  {
    key: "rubric",
    label: "評分標準",
    placeholder: "貼上老師提供的評分標準或檢核項目。",
    minHeight: "min-h-[96px]",
  },
  {
    key: "personalStyle",
    label: "個人語氣",
    placeholder: "例如：自然高中生語氣、保留個人反思、避免太像論文。",
    minHeight: "min-h-[88px]",
  },
  {
    key: "supplementalMaterials",
    label: "自行提供資料",
    placeholder:
      "貼上課堂資料、書籍資訊、網址、作者、年份、引用來源或原始數據。",
    minHeight: "min-h-[120px]",
  },
  {
    key: "additionalInfo",
    label: "其他補充",
    placeholder: "可貼上老師要求、課堂資料、個人觀點或想加入的內容。",
    minHeight: "min-h-[96px]",
  },
];

type TopicRunExpansionCard = TopicExpansionCard & {
  topicRunId: string;
  rawTopic: string;
  researchDirection: ResearchDirection;
};

type GroundingTopicPlan = {
  researchTopic: string;
  displayTitle: string;
  normalizedTopic: string;
  researchQuestion: string;
  querySeedZh: string[];
  querySeedEn: string[];
  excludeTerms: string[];
};

function audienceToAcademicLevel(audience: string): string {
  switch (audience) {
    case "國中":
      return "國中";
    case "大學":
      return "大學";
    case "一般讀者":
      return "專業";
    case "高中":
    default:
      return "高中";
  }
}

function sourceMixProfileForGeneratorInput(input: ReportInput): string {
  const text = [
    input.reportType,
    input.targetAudience,
    input.academicLevel,
    input.topic,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/商業|企業|產業|產品|市場|business|industry|market|product/.test(text)) {
    return "business_industry";
  }
  if (/醫療|長照|社工|心理|健康|獸醫|medical|health|psycholog|veterinary/.test(text)) {
    return "professional_guidance";
  }
  if (/大學|研究所|碩士|博士|專業|學術|university|college|graduate|academic/.test(text)) {
    return "academic_strict";
  }
  return "school_report_balanced";
}

function buildResearchDirectionCards(
  topic: string,
  selectedDomain: ResearchDomain | null,
  detectedCategory: TopicCategory | null,
  topicRunId: string,
  previousTopic?: string | null,
): TopicRunExpansionCard[] {
  void detectedCategory;
  const validation = validateTopicForWorkflow(topic, { domainHint: selectedDomain });
  const directions = generateResearchDirections(validation, {
    topicRunId,
    previousTopic,
  });
  return directions.map((direction) => ({
    topicRunId,
    rawTopic: direction.rawTopic,
    title: direction.polishedTitleZh ?? direction.researchQuestionZh,
    angle: direction.displayTitleZh,
    reason: direction.expandedScopeZh ?? direction.descriptionZh,
    researchQuestion: direction.researchQuestionZh,
    suggestedQuery: direction.searchQueryZh,
    englishKeywords: direction.englishKeywords,
    querySeeds: {
      zh: [direction.searchQueryZh, direction.researchQuestionZh],
      en: direction.englishKeywords,
    },
    researchValue: direction.descriptionZh,
    searchBoundary:
      direction.safetyScope === "sensitive_research_only" ||
      direction.safetyScope === "blocked_operational"
        ? "只搜尋公共安全、政策、健康風險或學術分析資料，避開操作性內容。"
        : "沿著此研究方向搜尋學術、官方或機構資料。",
    broadSuggestion: validation.status !== "ready",
    researchDirection: direction,
  }));
}

function splitQueriesByLanguage(values: string[]): { zh: string[]; en: string[] } {
  const zh: string[] = [];
  const en: string[] = [];
  for (const value of values) {
    const query = value.trim();
    if (!query) continue;
    if (/[\u4e00-\u9fff]/u.test(query)) {
      zh.push(query);
    } else if (/[A-Za-z]/.test(query)) {
      en.push(query);
    }
  }
  return {
    zh: Array.from(new Set(zh)),
    en: Array.from(new Set(en)),
  };
}

function domainFocusedResearchPlan(topic: string, domain: ResearchDomain): GroundingTopicPlan {
  const normalizedTopic = topic.trim();
  const astronomyEducationTopic =
    /星星|恆星|星系|天文|宇宙|光年|視差|距離|astronomy|stellar|\bstars?\b|parallax|light[-\s]?year/i.test(
      normalizedTopic,
    ) && /科學教育|博物館|展示|大眾理解|教學|education|museum|public understanding/i.test(normalizedTopic);
  const paleontologyAlgaeTopic =
    /化石|古生物|古環境|fossil|paleontology|paleoenvironment/i.test(normalizedTopic) &&
    /藻類|藻|微化石|疊層石|algae|algal|microfossil|stromatolite|cyanobacteria/i.test(
      normalizedTopic,
    );
  const agriculturalWastePollutionTopic =
    /農業|農廢|農業廢料|畜牧廢棄物|agricultural waste|farm waste/i.test(normalizedTopic) &&
    /污染|廢棄物|水質|土壤|環境|pollution|waste|runoff/i.test(normalizedTopic);
  const aiWorkTopic =
    /AI|人工智慧|生成式|大型語言模型|artificial intelligence|generative ai|LLM/i.test(
      normalizedTopic,
    ) && /工作|勞動|職場|就業|work|labor|employment|job/i.test(normalizedTopic);
  const moonRabbitTopic = /月兔|moon rabbit/i.test(normalizedTopic);
  const jadePendantTopic = /玉佩|玉器|玉飾|jade pendant|jade ornament/i.test(normalizedTopic);
  const yellowstoneTopic = /黃石國家公園|yellowstone/i.test(normalizedTopic);
  const solarSailTopic = /太陽帆|solar sail|solar sailing/i.test(normalizedTopic);
  const searchEngineTopic = /搜尋引擎|search engine|information retrieval/i.test(normalizedTopic);
  const fallbackTopic = normalizedTopic;
  const fallbackPlan = (researchTopic: string): GroundingTopicPlan => ({
    researchTopic,
    displayTitle: normalizedTopic,
    normalizedTopic: researchTopic,
    researchQuestion: researchTopic,
    querySeedZh: /[\u4e00-\u9fff]/u.test(researchTopic) ? [researchTopic] : [],
    querySeedEn: /[A-Za-z]/.test(researchTopic) ? [researchTopic] : [],
    excludeTerms: [],
  });
  if (solarSailTopic && domain === "natural_science") {
    return {
      researchTopic: "太陽帆推進技術的物理原理、太空任務應用與限制",
      displayTitle: normalizedTopic,
      normalizedTopic: "太陽帆推進技術的物理原理、太空任務應用與限制",
      researchQuestion: "太陽帆如何利用太陽輻射壓進行航天推進，其在深空任務中的應用價值與限制為何？",
      querySeedZh: [
        "太陽帆 輻射壓 推進 原理",
        "太陽帆 航天任務 應用 價值",
        "太陽帆 深空探測 優勢 限制",
      ],
      querySeedEn: [
        "solar sail propulsion radiation pressure",
        "solar sail spacecraft mission applications",
        "solar sailing deep space exploration limitations",
        "IKAROS LightSail NEA Scout solar sail",
      ],
      excludeTerms: [
        "sailboat",
        "sailing sport",
        "solar panel only",
        "astrology",
        "science fiction only",
      ],
    };
  }
  if (jadePendantTopic && domain === "humanities_social_science") {
    return {
      researchTopic: "玉佩在歷史文化、象徵意義與考古物質文化中的角色",
      displayTitle: normalizedTopic,
      normalizedTopic: "玉佩在歷史文化、象徵意義與考古物質文化中的角色",
      researchQuestion: "玉佩如何在歷史脈絡、禮制象徵、工藝與考古資料中呈現文化意義？",
      querySeedZh: ["玉佩 文化 歷史 象徵", "玉佩 考古 物質文化", "中國玉佩 禮制 工藝"],
      querySeedEn: [
        "jade pendant archaeology material culture",
        "Chinese jade ornament cultural symbolism",
        "jade ritual object craftsmanship history",
      ],
      excludeTerms: ["jewelry shop", "shopping", "price", "auction listing"],
    };
  }
  if (moonRabbitTopic && domain === "humanities_social_science") {
    return {
      researchTopic: "月兔神話在東亞文學、民俗與文化意象中的形成與傳播",
      displayTitle: normalizedTopic,
      normalizedTopic: "月兔神話在東亞文學、民俗與文化意象中的形成與傳播",
      researchQuestion: "月兔如何在神話、文學、民俗與東亞文化意象中形成並被重新詮釋？",
      querySeedZh: ["月兔 神話 民俗 文化意象", "月兔 文學 東亞文化", "玉兔 中秋 傳說 象徵"],
      querySeedEn: [
        "Moon rabbit mythology East Asian culture",
        "jade rabbit folklore cultural symbolism",
        "Moon rabbit literary imagery Mid-Autumn Festival",
      ],
      excludeTerms: ["game character", "anime merchandise", "wallpaper", "astrology"],
    };
  }
  if (yellowstoneTopic && domain === "life_environment") {
    return {
      researchTopic: "黃石國家公園的地熱地質、生態系保育與環境管理",
      displayTitle: normalizedTopic,
      normalizedTopic: "黃石國家公園的地熱地質、生態系保育與環境管理",
      researchQuestion: "黃石國家公園的地熱與火山地質如何影響生態系保育、野生動物管理與環境治理？",
      querySeedZh: ["黃石國家公園 地熱 地質", "黃石國家公園 生態 保育", "黃石國家公園 野生動物 管理"],
      querySeedEn: [
        "Yellowstone National Park geothermal geology",
        "Yellowstone ecosystem conservation wildlife management",
        "Yellowstone volcanic system ecology conservation",
      ],
      excludeTerms: ["travel booking", "hotel", "itinerary", "wallpaper"],
    };
  }
  if (astronomyEducationTopic) {
    return fallbackPlan(`${normalizedTopic} 天文學 恆星距離 視差 光年 科學教育 博物館展示 大眾理解`);
  }
  if (paleontologyAlgaeTopic) {
    return fallbackPlan(`${normalizedTopic} 化石紀錄 藻類 微化石 古環境 沉積環境`);
  }
  if (agriculturalWastePollutionTopic) {
    return fallbackPlan(`${normalizedTopic} 農業廢棄物 污染 水質 土壤 富營養化 廢棄物管理 環境影響`);
  }
  if (aiWorkTopic) {
    return fallbackPlan(`${normalizedTopic} 人工智慧 工作本質 勞動市場 職務變遷 組織管理 社會影響`);
  }
  if (moonRabbitTopic) {
    return fallbackPlan(`${normalizedTopic} 月兔 神話 民俗 東亞文化 象徵 文學圖像`);
  }
  if (searchEngineTopic) {
    return fallbackPlan(`${normalizedTopic} 搜尋引擎 排序演算法 資訊檢索 搜尋品質 使用者行為`);
  }
  void domain;
  return fallbackPlan(fallbackTopic);
}

function domainFocusedResearchTopic(topic: string, domain: ResearchDomain): string {
  return domainFocusedResearchPlan(topic, domain).researchTopic;
}

type SeedAnchorProfile = {
  topicPattern: RegExp;
  queryAllowed: (query: string) => boolean;
};

const SEED_ANCHOR_PROFILES: SeedAnchorProfile[] = [
  {
    topicPattern: /太陽能板|光伏|發電效率|solar panel|photovoltaic|power conversion efficiency/i,
    queryAllowed: (query) =>
      !/formation|development/i.test(query) &&
      /solar panel|photovoltaic|solar cell/i.test(query) &&
      /surface roughness|surface texture|reflectance|reflection|anti-reflection|power conversion efficiency|solar cell efficiency|power output|photovoltaic performance/i.test(
        query,
      ),
  },
  {
    topicPattern: /睡眠不足|睡眠限制|工作記憶|注意力|sleep deprivation|sleep restriction|working memory|attention/i,
    queryAllowed: (query) =>
      (/sleep deprivation|sleep restriction/i.test(query) &&
        /adolescen|teenager|working memory|attention|cognitive performance|sustained attention/i.test(query)) ||
      (/adolescen|teenager/i.test(query) &&
        /working memory|attention|cognitive performance|sustained attention/i.test(query)),
  },
  {
    topicPattern: /海龜|海龜幼體|幼龜|夜間照明|光害|sea turtle|marine turtle|hatchling orientation|artificial light|light pollution/i,
    queryAllowed: (query) =>
      ((/sea turtle|marine turtle|loggerhead|green turtle/i.test(query) &&
        /hatchling|orientation|disorientation|artificial light|light pollution|coastal lighting|beach lighting|sea finding|seaward/i.test(
          query,
        )) ||
        /hatchling orientation|hatchling disorientation|marine turtle hatchling/i.test(query)) &&
      !/habitat fragmentation|population distribution|conservation corridor/i.test(query),
  },
  {
    topicPattern: /同儕回饋|第二語言|寫作修訂|peer feedback|second language writing|L2 writing|writing revision/i,
    queryAllowed: (query) =>
      /peer feedback|peer response|peer assessment|second language writing|L2 writing|EFL writing|ESL writing|writing revision|revision quality/i.test(
        query,
      ) &&
      !/^peer review$/i.test(query.trim()),
  },
  {
    topicPattern: /活性碳|活性炭|甲醛|activated carbon|formaldehyde|indoor air quality/i,
    queryAllowed: (query) =>
      /activated carbon|formaldehyde|adsorption|indoor air|removal efficiency|filter media|air filtration/i.test(query),
  },
];

function topicAnchoredEnglishSeeds(topic: string, seeds: string[]): string[] {
  const profile = SEED_ANCHOR_PROFILES.find((item) => item.topicPattern.test(topic));
  const uniqueSeeds = Array.from(new Set(seeds.map((seed) => seed.trim()).filter(Boolean)));
  if (!profile) return uniqueSeeds;
  return uniqueSeeds.filter((seed) => profile.queryAllowed(seed));
}

function groundingPlanFromDirection(
  direction: ResearchDirection,
  selectedDomain: ResearchDomain | null,
  rawTopic: string,
): GroundingTopicPlan {
  const solarDomainPlan = selectedDomain
    ? domainFocusedResearchPlan(rawTopic, selectedDomain)
    : null;
  if (
    solarDomainPlan &&
    /太陽帆|solar sail/i.test(rawTopic) &&
    solarDomainPlan.researchQuestion === direction.researchQuestionZh
  ) {
    return solarDomainPlan;
  }
  const split = splitQueriesByLanguage(direction.bilingualQueries);
  return {
    researchTopic: direction.researchQuestionZh,
    // A direction label (for example, "地理特徵") is a search aid, not the
    // report title. Preserve the user's topic in every downstream UI surface.
    displayTitle: rawTopic.trim(),
    normalizedTopic: direction.researchQuestionZh,
    researchQuestion: direction.researchQuestionZh,
    querySeedZh: Array.from(new Set([direction.searchQueryZh, ...split.zh])),
    querySeedEn: topicAnchoredEnglishSeeds(direction.researchQuestionZh, [
      ...split.en,
      ...direction.englishKeywords,
    ]),
    excludeTerms: [],
  };
}

function displayOptionLabel(key: ReportInputStringKey, value: string): string {
  const fields = [...MAIN_SELECT_FIELDS, ...ADVANCED_SELECT_FIELDS];
  const option = fields
    .find((field) => field.key === key)
    ?.options.find((item) => item.value === value);
  return option?.label ?? value;
}

function sourceErrorMessage(error: unknown): string {
  const technical = sourceTechnicalErrorMessage(error);
  if (/Failed to fetch|NetworkError|Load failed|CORS|ERR_FAILED/i.test(technical)) {
    return "無法連線到 API server，請確認 VITE_API_BASE_URL 已設定為後端服務網址，且後端允許此前端網域呼叫。";
  }
  if (/timeout|timed out|504/i.test(technical)) {
    return "搜尋逾時，請縮短題目、換成更具體的關鍵字，或稍後重試。";
  }
  if (/404|not found/i.test(technical)) {
    return "找不到搜尋 API 端點，請確認前端 VITE_API_BASE_URL 指向已部署的 api-server。";
  }
  if (/502|bad gateway|ECONNREFUSED|ENOTFOUND/i.test(technical)) {
    return "API server 暫時無法回應，請確認後端部署狀態後再試。";
  }
  if (
    /http\s*(403|429)|daily_limit_exceeded|quota|rate limit|too many requests/i.test(
      technical,
    )
  ) {
    return "部分外部來源服務暫停或達到查詢限制，建議稍後重試。";
  }

  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        if (
          /http\s*(403|429)|daily_limit_exceeded|quota|rate limit|too many requests/i.test(
            message,
          )
        ) {
          return "部分資料來源暫時無法使用或達到查詢限制，請稍後再試。";
        }
        return message;
      }
    }
  }

  return "來源搜尋暫時無法使用，請稍後再試。";
}

function sourceTechnicalErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown source search error";
  }
}

function sourceDomainLabel(url: string | null | undefined): string {
  if (!url) return "網域待確認";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "網域待確認";
  }
}

function sourceLocatorLabel(source: SourceRecord): string {
  if (source.sourceLinkInfo?.doiUrl) return `DOI ${source.sourceLinkInfo.doi}`;
  if (source.sourceLinkInfo?.canonicalUrl) return sourceDomainLabel(source.sourceLinkInfo.canonicalUrl);
  if (source.sourceLinkInfo?.metadataUrl) return "來源 metadata";
  if (source.url) return sourceDomainLabel(source.url);
  if (source.doi) return `DOI ${source.doi}`;
  return "來源位置待確認";
}

function primarySourceLink(source: SourceRecord): {
  href: string | null;
  label: string;
  warning?: string;
} {
  const linkInfo = source.sourceLinkInfo;
  const doiUrl = linkInfo?.doiUrl ?? (source.doi ? `https://doi.org/${source.doi}` : null);
  if (doiUrl) return { href: doiUrl, label: "查看 DOI" };
  const linkMayBeUnavailable =
    linkInfo?.accessStatus === "blocked" ||
    linkInfo?.accessStatus === "not_found" ||
    linkInfo?.linkWarnings?.some((warning) =>
      /source_link_may_be_unavailable|missing_canonical_url|url_not_verified/i.test(
        warning,
      ),
    );
  if (linkInfo?.accessStatus === "blocked" || linkInfo?.accessStatus === "not_found") {
    return {
      href: linkInfo.canonicalUrl ?? source.url ?? null,
      label: "來源頁可能失效",
      warning: "來源頁可能失效",
    };
  }
  if (linkInfo?.accessStatus === "metadata_only") {
    return {
      href: linkInfo.metadataUrl ?? source.url ?? null,
      label: "查看來源資料",
      warning: "來源連結可能失效；目前只能確認 metadata，未確認可開啟全文。",
    };
  }
  if (linkInfo?.canonicalUrl) {
    return {
      href: linkInfo.canonicalUrl,
      label: "查看來源頁",
      ...(linkMayBeUnavailable ? { warning: "來源連結可能失效，請開啟後再次確認。" } : {}),
    };
  }
  if (source.url) {
    return {
      href: source.url,
      label: "查看來源頁",
      ...(linkMayBeUnavailable ? { warning: "來源連結可能失效，請開啟後再次確認。" } : {}),
    };
  }
  if (linkInfo?.metadataUrl) {
    return {
      href: linkInfo.metadataUrl,
      label: "查看來源資料",
      warning: "來源連結可能失效；目前只有來源資料庫 metadata 可追溯。",
    };
  }
  return { href: null, label: "來源位置待確認" };
}

function sourceAccessLabel(source: SourceRecord): string {
  const status = source.sourceLinkInfo?.accessStatus ?? "unknown";
  switch (status) {
    case "ok":
      return "來源連結已提供";
    case "redirected":
      return "已改用較穩定的追溯連結";
    case "metadata_only":
      return "來源連結可能失效，目前只有 metadata 可追溯";
    case "blocked":
    case "not_found":
      return "來源連結可能失效";
    case "unknown":
    default:
      return source.sourceLinkInfo?.canonicalUrl || source.url
        ? "來源連結尚未完全驗證"
        : "來源位置待確認";
  }
}

function sourceCategoryLabel(value: string | null | undefined): string {
  if (!value) return SOURCE_CATEGORY_LABELS.unknown;
  return SOURCE_CATEGORY_LABELS[value as SourceCategory] ?? value;
}

function sourceTypeDisplayLabel(source: SourceRecord): string {
  if (source.sourceType === "Authoritative Media") return "authoritative media";
  if (source.sourceType === "Official Source") return "official source";
  if (source.sourceType === "Institutional Source") return "institutional source";
  if (source.sourceKind === "journal" || source.sourceKind === "conference" || source.doi) {
    return "academic";
  }
  return source.sourceType;
}

function toggleWorkflowSection(
  sections: string[] | null | undefined,
  section: (typeof WORKFLOW_REPORT_SECTIONS)[number],
  checked: boolean,
) {
  const current = normalizeUsableSections(sections);
  if (checked)
    return current.includes(section) ? current : [...current, section];
  return current.filter((item) => item !== section);
}

function evidenceCardLabel(card: EvidenceCard): string {
  return card.sourceTitle || card.sourceDomain || card.sourceId;
}

function keywordSearchDebugFromResult(
  result: SourceSearchResult,
): KeywordSearchDebugState | null {
  if (!result.keyword_expansion && !result.searchIntent && !result.queries)
    return null;

  const diagnostics = (result as SourceSearchResultWithDiagnostics).diagnostics;
  const pipelineDebug = result as SourceSearchResultWithDiagnostics;
  const llmStatusLabelMap: Record<string, string> = {
    success: "成功",
    timeout: "逾時",
    quota_exceeded: "額度已滿",
    failed: "失敗",
    skipped: "略過",
  };
  const plannerStatusLabelMap: Record<string, string> = {
    llm: "LLM 規劃",
    rule_fallback: "規則備援",
    skipped: "未設定 LLM",
    failed: "規劃失敗",
  };
  const llmStatus =
    result.llm_status ?? result.searchIntent?.plannerStatus ?? "skipped";
  const providerGroups = result.provider_status ?? result.groups ?? [];
  const status = sourceSearchDiagnosticStatus(result);
  const extendedQueries = result.queries as
    | (SourceSearchResult["queries"] & {
        chineseSupplemental?: string[];
        coreEnglishAcademic?: string[];
        academicSynonyms?: string[];
      })
    | null
    | undefined;
  const queryLanguageCounts = {
    zh:
      extendedQueries?.chinese?.length ??
      extendedQueries?.chineseSupplemental?.length ??
      0,
    en:
      (extendedQueries?.english?.length ?? 0) +
      (extendedQueries?.coreEnglishAcademic?.length ?? 0) +
      (extendedQueries?.academicSynonyms?.length ?? 0),
    mixed:
      result.keyword_expansion?.search_queries?.filter(
        (query) => /[\u4e00-\u9fff]/.test(query) && /[A-Za-z]/.test(query),
      ).length ?? 0,
  };

  return {
    fallbackUsed:
      result.searchIntent?.fallbackUsed ??
      result.keyword_expansion?.fallback_used ??
      false,
    llmStatus,
    llmStatusLabel: result.searchIntent?.plannerStatus
      ? (plannerStatusLabelMap[result.searchIntent.plannerStatus] ??
        result.searchIntent.plannerStatus)
      : (llmStatusLabelMap[llmStatus] ?? llmStatus),
    status,
    queries: result.keyword_expansion?.search_queries ?? [
      ...(result.queries?.highPrecision ?? []),
      ...(result.queries?.english ?? []),
      ...(result.queries?.chinese ?? []),
    ],
    providerErrors: providerGroups
      .filter((group) => !group.ok)
      .map((group) => {
        const detail = [group.error_type, group.error_message]
          .filter(Boolean)
          .join("：");
        return `${group.provider} / ${group.query}${detail ? ` - ${detail}` : ""}`;
      }),
    providerBreakdown: providerGroups.map((group) => {
      const rawCount =
        "result_count" in group && typeof group.result_count === "number"
          ? group.result_count
          : group.results?.length ?? 0;
      const statusText = group.ok ? "ok" : group.error_type ?? "failed";
      return `${group.provider} / ${group.query}: ${rawCount} (${statusText})`;
    }),
    searchIntent: result.searchIntent ?? null,
    intentQueries: result.queries ?? null,
    warnings: result.warnings ?? [],
    queryLanguageCounts,
    recovery: diagnostics?.recovery
      ? {
          attempted: diagnostics.recovery.attempted,
          addedQueryCount: diagnostics.recovery.addedQueryCount,
          rawAddedCount: diagnostics.recovery.rawAddedCount,
          dedupedAddedCount: diagnostics.recovery.dedupedAddedCount,
        }
      : null,
    retrievalStats: {
      rawResults:
        diagnostics?.recall_pool?.rawCount ??
        diagnostics?.retrieved_count ??
        result.searchTrace?.candidateCount ??
        providerGroups.reduce((sum, group) => sum + (group.results?.length ?? 0), 0),
      providerGroups: providerGroups.length,
      successfulProviderGroups: providerGroups.filter((group) => group.ok)
        .length,
      dedupedResults:
        diagnostics?.recall_pool?.dedupedCount ??
        diagnostics?.deduped_count ??
        result.searchTrace?.dedupedCount ??
        result.sources.length,
      rejectedResults:
        diagnostics?.rejected_count ??
        result.searchTrace?.rejectedCount ??
        rejectedSourceRecords(result.sources.map(normalizeSourceForReview)).length,
      candidateResults:
        diagnostics?.candidate_count ??
        result.sources.length,
      displayedResults:
        diagnostics?.displayed_count ??
        result.sources.length,
      primaryCandidateResults:
        diagnostics?.primary_candidate_count ??
        result.sources.filter((source) => source.relevanceLevel === "primary").length,
    },
    expandedQueries: pipelineDebug.expandedQueries ?? [],
    sourceSearchConfig: pipelineDebug.sourceSearchConfig
      ? {
          ...pipelineDebug.sourceSearchConfig,
          searchProfile: diagnostics?.search_profile,
          estimatedTime: diagnostics?.profile?.estimatedTimeLabel,
          cacheHit: diagnostics?.cache_hit,
          cacheStatus: diagnostics?.cache_status,
          earlyStopReason: diagnostics?.early_stop_reason ?? null,
        }
      : null,
    groundingDiagnostics: null,
    debugTrace: pipelineDebug.debugTrace ?? null,
  };
}

function keywordSearchDebugFromGroundingJob(
  job: GroundingJob,
): KeywordSearchDebugState | null {
  const diagnostics = job.groundingDiagnostics as
    | GroundingPipelineDiagnosticsState
    | undefined;
  if (!diagnostics) return null;
  const contractMismatch = groundingJobSourceContractMismatch(job);
  const providerErrors = diagnostics.providerErrors ?? [];
  const providerBreakdown = Object.entries(diagnostics.rawProviderCounts ?? {}).map(
    ([provider, count]) => `${provider}: ${count} raw results`,
  );
  const academicRetry = job.academicRetry ?? diagnostics.academicRetry;
  const sourceQualitySummary = job.sourceQualitySummary ?? diagnostics.sourceQualitySummary;
  const zhQueries = diagnostics.zhQueries ?? job.queryPlan?.bilingualQueries.zh ?? [];
  const enQueries = diagnostics.enQueries ?? job.queryPlan?.bilingualQueries.en ?? [];
  const rawResults =
    diagnostics.rawProviderCount ??
    (Object.values(diagnostics.rawProviderCounts ?? {}).reduce((sum, count) => sum + count, 0) ||
      diagnostics.normalizedCount ||
      0);

  return {
    fallbackUsed: job.parsedInput?.debug?.notes?.includes("topic-understanding-needs-clarification") ?? false,
    llmStatus: "skipped",
    llmStatusLabel: "Research Grounding",
    status:
      diagnostics.finalUiState === "provider_failed"
        ? "failed"
        : diagnostics.finalUiState === "invalid_input"
          ? "empty"
          : (diagnostics.candidateCount ?? 0) > 0
            ? providerErrors.length > 0
              ? "partial_success"
              : "success"
            : "empty",
    queries: [...zhQueries, ...enQueries],
    providerErrors: providerErrors.map((error) => {
      const detail = [error.errorType, error.errorMessage].filter(Boolean).join("：");
      return `${error.provider} / ${error.query}${detail ? ` - ${detail}` : ""}`;
    }),
    providerBreakdown: [
      ...providerBreakdown,
      ...(sourceQualitySummary
        ? [
            `academicCandidateCount: ${sourceQualitySummary.academicCandidateCount}`,
            `peerReviewedOrDoiCount: ${sourceQualitySummary.peerReviewedOrDoiCount}`,
            `officialBackgroundCount: ${sourceQualitySummary.officialBackgroundCount}`,
            `academicEnough: ${sourceQualitySummary.academicEnough ? "true" : "false"}`,
            `evidenceUsableEnough: ${sourceQualitySummary.evidenceUsableEnough ? "true" : "false"}`,
          ]
        : []),
      ...(academicRetry
        ? [
            `academicRetryCount: ${academicRetry.count}/${academicRetry.max}`,
            `academicRetryActive: ${academicRetry.active ? "true" : "false"}`,
            `academicRetryExhausted: ${academicRetry.exhausted ? "true" : "false"}`,
            ...(academicRetry.reason ? [`academicRetryReason: ${academicRetry.reason}`] : []),
          ]
        : []),
      ...providerErrors.map((error) => `${error.provider} / ${error.query}: 0 (${error.errorType ?? "failed"})`),
    ],
    searchIntent: null,
    intentQueries: null,
    warnings: [
      ...(job.warnings ?? []),
      ...(contractMismatch ? [`source contract mismatch: ${contractMismatch}`] : []),
    ],
    queryLanguageCounts: {
      zh: zhQueries.length,
      en: enQueries.length,
      mixed: [...zhQueries, ...enQueries].filter(
        (query) => /[\u4e00-\u9fff]/.test(query) && /[A-Za-z]/.test(query),
      ).length,
    },
    recovery: (diagnostics.fallbackAttempts?.length ?? 0) > 0
      ? {
          attempted: true,
          addedQueryCount: new Set(diagnostics.fallbackAttempts?.map((attempt) => attempt.queryUsed)).size,
          rawAddedCount:
            diagnostics.fallbackAttempts?.reduce((sum, attempt) => sum + attempt.rawCount, 0) ?? rawResults,
          dedupedAddedCount: diagnostics.candidateCount ?? 0,
        }
      : null,
    retrievalStats: {
      rawResults,
      providerGroups: diagnostics.providersCalled?.length ?? 0,
      successfulProviderGroups:
        (diagnostics.providersCalled?.length ?? 0) - providerErrors.length,
      dedupedResults: diagnostics.dedupedCount ?? rawResults,
      rejectedResults: diagnostics.rejectedCount ?? 0,
      candidateResults: diagnostics.candidateCount ?? 0,
      displayedResults: diagnostics.candidateCount ?? 0,
      primaryCandidateResults:
        (job.candidateSources ?? job.sourceCandidates)?.filter(
          (source) => source.reviewStatus === "accepted",
        ).length ?? 0,
    },
    expandedQueries: [
      ...zhQueries.map((query) => ({
        query,
        language: "zh-TW" as const,
        purpose: "grounding_query",
        source: "research_grounding_job",
        confidence: 1,
      })),
      ...enQueries.map((query) => ({
        query,
        language: "en" as const,
        purpose: "grounding_query",
        source: "research_grounding_job",
        confidence: 1,
      })),
      ...(academicRetry?.retryQueries ?? []).map((query) => ({
        query,
        language: /[\u4e00-\u9fff]/.test(query) ? "zh-TW" as const : "en" as const,
        purpose: "academic_retry_query",
        source: "research_grounding_job",
        confidence: 1,
      })),
    ],
    sourceSearchConfig: {
      candidateTarget:
        diagnostics.searchProfile === "deep"
          ? 30
          : diagnostics.searchProfile === "quick"
            ? 10
            : 16,
      acceptedTarget:
        diagnostics.searchProfile === "deep"
          ? 12
          : diagnostics.searchProfile === "quick"
            ? 5
            : 8,
      minAccepted: 3,
      searchProfile: diagnostics.searchProfile,
      estimatedTime: diagnostics.estimatedTime,
      cacheHit: diagnostics.cacheHit,
      cacheStatus: diagnostics.cacheStatus,
      earlyStopReason: diagnostics.earlyStopReason ?? null,
    },
    groundingDiagnostics: { ...diagnostics, contractMismatch },
    debugTrace: null,
  };
}

function sourceSearchDiagnosticStatus(
  result: SourceSearchResult,
): SourceSearchDiagnosticStatus {
  const providerGroups = result.provider_status ?? result.groups ?? [];
  const failedGroups = providerGroups.filter((group) => !group.ok);
  const warnings = result.warnings ?? [];
  const hasSources = result.sources.length > 0;
  const hasTimeout =
    failedGroups.some((group) =>
      /timeout|timed out|逾時/i.test(
        [group.error_type, group.error_message].filter(Boolean).join(" "),
      ),
    ) || warnings.some((warning) => /timeout|timed out|逾時/i.test(warning));
  const hasQuotaOrRateLimit =
    failedGroups.some((group) =>
      /403|429|quota|rate|limit|daily_limit_exceeded|too many/i.test(
        [group.error_type, group.error_message].filter(Boolean).join(" "),
      ),
    ) ||
    warnings.some((warning) =>
      /403|429|quota|rate|limit|daily_limit_exceeded|too many/i.test(warning),
    );

  if (!hasSources && hasTimeout) return "timeout";
  if (!hasSources && providerGroups.length > 0 && failedGroups.length === providerGroups.length)
    return "failed";
  if (!hasSources) return "empty";
  if (failedGroups.length > 0 || hasQuotaOrRateLimit) return "partial_success";
  return "success";
}

function sourceSearchUserMessage(input: {
  status: SourceSearchDiagnosticStatus;
  reviewableCount: number;
  primaryCount: number;
  secondaryCount: number;
  totalCount: number;
  warnings?: string[];
}): string {
  const summary = `已顯示 ${input.totalCount} 筆來源，其中可審查 ${input.reviewableCount} 筆（主要 ${input.primaryCount} 筆、延伸 ${input.secondaryCount} 筆）。`;
  if (input.status === "partial_success") {
    return `已顯示可用來源，部分資料來源暫時無法使用。${summary}`;
  }
  if (input.status === "timeout") {
    return `搜尋逾時，但已保留目前可用結果。${summary}建議縮短題目或換成更具體的關鍵字後重試。`;
  }
  if (input.reviewableCount === 0 && input.totalCount > 0) {
    return `已找到 ${input.totalCount} 筆來源，但目前都偏低相關；請在「全部」分頁檢查結果，或重新搜尋並調整關鍵詞。`;
  }
  if (input.status === "empty" || input.status === "failed") {
    return (
      input.warnings?.join("；") ||
      "目前沒有找到符合此主題的來源，請換更具體的關鍵詞再試一次。"
    );
  }
  return summary;
}

function hasProviderFailures(result: SourceSearchResult): boolean {
  return (
    (result.provider_status ?? result.groups)?.some((group) => !group.ok) ??
    false
  );
}

function SearchIntentFieldLabel({
  field,
}: {
  field: SearchIntentDebugLabelKey;
}) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{searchIntentDebugLabel(field)}</span>
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
        {field}
      </code>
    </p>
  );
}

function SearchIntentDebugPanel({ debug }: { debug: KeywordSearchDebugState }) {
  if (!debug.searchIntent) return null;

  return (
    <div
      className="mb-3 rounded-md border border-border bg-muted/20 p-3"
      data-testid="search-intent-debug"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          {searchIntentDebugLabel("searchIntent")}
        </span>
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
          searchIntent
        </code>
        <Badge variant="outline">
          {searchIntentDebugLabel("plannerStatus")}：{debug.llmStatusLabel}
        </Badge>
        <Badge
          variant={debug.searchIntent.fallbackUsed ? "secondary" : "outline"}
        >
          {searchIntentDebugLabel("fallbackUsed")}：
          {debug.searchIntent.fallbackUsed ? "是" : "否"}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <SearchIntentFieldLabel field="primaryConcepts" />
          <PreflightPills items={debug.searchIntent.primaryConcepts} />
        </div>
        <div className="space-y-1">
          <SearchIntentFieldLabel field="contextConcepts" />
          <PreflightPills items={debug.searchIntent.contextConcepts} />
        </div>
        <div className="space-y-1">
          <SearchIntentFieldLabel field="outcomeConcepts" />
          <PreflightPills items={debug.searchIntent.outcomeConcepts} />
        </div>
        <div className="space-y-1">
          <SearchIntentFieldLabel field="mustHaveTerms" />
          <PreflightPills items={debug.searchIntent.mustHaveTerms} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <SearchIntentFieldLabel field="lowWeightTerms" />
          <PreflightPills items={debug.searchIntent.lowWeightTerms} />
        </div>
      </div>
      {debug.intentQueries && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            高精度查詢{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              queries.highPrecision
            </code>
          </p>
          <PreflightPills
            items={debug.intentQueries.highPrecision.slice(0, 6)}
          />
        </div>
      )}
    </div>
  );
}

type SourceReviewTab = "all" | "accepted" | "pending";

const SOURCE_REVIEW_TABS: { value: SourceReviewTab; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "accepted", label: "已接受" },
  { value: "pending", label: "待審核" },
];

const WORKFLOW_STEPS: {
  value: GeneratorWorkflowStep;
  label: string;
  description: string;
  Icon: typeof CheckCircle2;
}[] = [
  {
    value: "topic",
    label: "設定主題",
    description: "輸入研究方向",
    Icon: ClipboardList,
  },
  {
    value: "search",
    label: "搜尋來源",
    description: "查找可信資料",
    Icon: Search,
  },
  {
    value: "manage",
    label: "管理來源",
    description: "審查與補 metadata",
    Icon: BookOpen,
  },
  {
    value: "generate",
    label: "生成報告",
    description: "建立結果頁",
    Icon: Wand2,
  },
];

function workflowStepIndex(step: GeneratorWorkflowStep): number {
  return WORKFLOW_STEPS.findIndex((item) => item.value === step);
}

function workflowStepLabel(step: GeneratorWorkflowStep | "report"): string {
  if (step === "report") return "報告工作區";
  return WORKFLOW_STEPS.find((item) => item.value === step)?.label ?? "下一步";
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeSourceReviewCounts(
  sources: SourceRecord[],
): ReturnType<typeof sourceReviewCounts> {
  const counts = sourceReviewCounts(sources);
  return {
    all: safeCount(counts.all),
    accepted: safeCount(counts.accepted),
    pending: safeCount(counts.pending),
    rejected: safeCount(counts.rejected),
  };
}

function createClientWorkflowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createClientRunId(): string {
  return `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function routeStepForInternal(step: GeneratorWorkflowStep): GeneratorRouteStep {
  return INTERNAL_TO_ROUTE_STEP[step];
}

function internalStepForRoute(step: GeneratorRouteStep | null | undefined): GeneratorWorkflowStep {
  if (!step) return "topic";
  return ROUTE_TO_INTERNAL_STEP[step] ?? "topic";
}

function normalizeRouteStep(value: string | null): GeneratorRouteStep | null {
  if (!value) return null;
  if (value in ROUTE_TO_INTERNAL_STEP) {
    return value as GeneratorRouteStep;
  }
  return null;
}

const GROUNDING_TERMINAL_STATUSES = new Set<GroundingJob["status"]>([
  "source_review_ready",
  "source_review_needs_manual",
  "ready_for_next_step",
  "waiting_for_review",
  "no_sources_after_fallback",
  "ready_for_review",
  "completed",
  "partial",
  "failed",
]);

function groundingJobIsTerminal(job: Pick<GroundingJob, "status"> | null | undefined): boolean {
  return Boolean(job?.status && GROUNDING_TERMINAL_STATUSES.has(job.status));
}

function groundingJobNeedsTopicRefinement(job: GroundingJob | null | undefined): boolean {
  if (!job) return false;
  if (!groundingJobIsTerminal(job)) return false;
  const reviewableSourceCount =
    job.sourceCandidates?.filter((source) => source.reviewStatus !== "rejected").length ?? 0;
  if (job.groundingDiagnostics?.canProceedToSourceReview || reviewableSourceCount > 0) {
    return false;
  }
  return job.parsedInput?.nextAction === "show_topic_options" ||
    job.parsedInput?.nextAction === "ask_clarification";
}

function generatorSessionStorageKey(workflowId: string, topicHash: string): string {
  return `researchforge:generator:${workflowId}:${topicHash}`;
}

function clearStaleGeneratorSessionStorage(nextWorkflowId: string): void {
  if (typeof window === "undefined") return;
  const prefix = "researchforge:generator:";
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    if (!key.startsWith(`${prefix}${nextWorkflowId}:`)) {
      window.sessionStorage.removeItem(key);
    }
  }
}

function sourceIdForSnapshot(source: SourceRecord): string {
  return source.id || sourceRecordKey(source);
}

function mergeLocalSourceReviewState(
  incomingSources: SourceRecord[],
  localSources: SourceRecord[],
): SourceRecord[] {
  if (localSources.length === 0) return incomingSources;

  const localByKey = new Map<string, SourceRecord>();
  for (const source of localSources) {
    const keys = [source.id, source.dedupeKey, sourceRecordKey(source)].filter(
      (key): key is string => Boolean(key),
    );
    for (const key of keys) localByKey.set(key, source);
  }

  return incomingSources.map((incoming) => {
    const local =
      localByKey.get(incoming.id) ??
      (incoming.dedupeKey ? localByKey.get(incoming.dedupeKey) : undefined) ??
      localByKey.get(sourceRecordKey(incoming));
    if (!local) return incoming;
    const localReviewState = sourceReviewState(local);
    if (localReviewState === "pending") return incoming;
    return normalizeSourceForReview({
      ...incoming,
      reviewState: localReviewState,
      manuallyForced:
        typeof local.manuallyForced === "boolean"
          ? local.manuallyForced
          : incoming.manuallyForced,
      reviewNotes: local.reviewNotes ?? incoming.reviewNotes,
    });
  });
}

function snapshotMatchesContext(
  snapshot: GeneratorSessionSnapshot,
  context: { workflowId: string; topicHash: string; runId: string },
): boolean {
  return (
    snapshot.payloadVersion === GENERATOR_SNAPSHOT_VERSION &&
    snapshot.workflowId === context.workflowId &&
    snapshot.topicHash === context.topicHash &&
    snapshot.runId === context.runId
  );
}

function snapshotSourcesAreConsistent(
  snapshot: GeneratorSessionSnapshot,
): boolean {
  const sourceIds = new Set(snapshot.sourceCandidates.map(sourceIdForSnapshot));
  const acceptedIds = new Set(snapshot.acceptedSources.map(sourceIdForSnapshot));
  return (
    snapshot.sourceCandidates.every(
      (source) =>
        source.workflowId === snapshot.workflowId &&
        source.topicHash === snapshot.topicHash,
    ) &&
    snapshot.acceptedSources.every(
      (source) =>
        source.workflowId === snapshot.workflowId &&
        source.topicHash === snapshot.topicHash &&
        sourceIds.has(sourceIdForSnapshot(source)),
    ) &&
    snapshot.evidenceCards.every(
      (card) =>
        card.workflowId === snapshot.workflowId &&
        card.topicHash === snapshot.topicHash &&
        acceptedIds.has(card.sourceId),
    )
  );
}

function parseGeneratorSessionSnapshot(
  raw: string | null,
  context: { workflowId: string; topicHash: string; runId: string },
): GeneratorSessionSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GeneratorSessionSnapshot;
    if (!snapshotMatchesContext(parsed, context)) return null;
    if (!snapshotSourcesAreConsistent(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildGroundingJobFromSnapshot(
  snapshot: GeneratorSessionSnapshot,
): GroundingJob {
  if (snapshot.groundingJob) {
    return snapshot.groundingJob;
  }
  return {
    jobId: snapshot.groundingJobId,
    workflowId: snapshot.workflowId,
    topicHash: snapshot.topicHash,
    requestId: `snapshot-${snapshot.workflowId}`,
    attemptId: `snapshot-${snapshot.runId}`,
    revision: 1,
    originalTopic: snapshot.researchTopic,
    normalizedTopic: snapshot.researchTopic,
    status:
      snapshot.groundingStatus ??
      (snapshot.sourceCandidates.length > 0 ? "completed" : "partial"),
    progress: snapshot.groundingProgress ?? 100,
    seedQueryPlan: snapshot.seedQueryPlan ?? undefined,
    queryPlan: snapshot.queryPlan ?? undefined,
    academicSafetyReview: snapshot.academicSafetyReview ?? undefined,
    sourceCandidates: [],
    evidenceCards: [],
    researchCandidates: snapshot.researchCandidates,
    reportDraft: snapshot.reportDraft ?? undefined,
    warnings: snapshot.warnings,
    createdAt: snapshot.updatedAt,
    updatedAt: snapshot.updatedAt,
    expiresAt: new Date(
      Date.parse(snapshot.updatedAt) + 24 * 60 * 60 * 1_000,
    ).toISOString(),
  };
}

function generatorRouteHistoryForStep(step: GeneratorRouteStep): GeneratorRouteStep[] {
  switch (step) {
    case "grounding_progress":
      return ["topic_input"];
    case "source_review":
    case "evidence_review":
      return ["topic_input", "grounding_progress"];
    case "report_draft":
    case "preview":
    case "export":
      return ["topic_input", "grounding_progress", "source_review"];
    case "topic_input":
    default:
      return [];
  }
}

function sourceMatchesWorkflow(
  source: SourceRecord,
  lock: SourceWorkflowLock | null,
): boolean {
  if (!lock) return true;
  return (
    source.workflowId === lock.workflowId &&
    source.topicHash === lock.topicHash &&
    (!source.queryPlanHash || source.queryPlanHash === lock.queryPlanHash)
  );
}

function sourceAcceptBlockReason(
  source: SourceRecord,
  lock: SourceWorkflowLock | null,
): string | null {
  if (lock && source.workflowId !== lock.workflowId) return "workflow_mismatch";
  if (lock && source.topicHash !== lock.topicHash) return "topic_mismatch";
  if (lock && source.queryPlanHash && source.queryPlanHash !== lock.queryPlanHash)
    return "query_plan_mismatch";
  if (
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow"
  )
    return source.classification;
  return null;
}

function applyWorkflowLockToSources(
  sources: SourceRecord[],
  lock: SourceWorkflowLock,
  topic: string,
): SourceRecord[] {
  return sources.map((source) =>
    normalizeSourceForReview({
      ...source,
      workflowId: lock.workflowId,
      topic,
      normalizedTopic: topic,
      topicHash: lock.topicHash,
      queryPlanHash: lock.queryPlanHash,
      classification:
        source.classification ??
        (source.relevanceLevel === "primary" ? "primary" : "review"),
    }),
  );
}

function workflowTransitionCopy(
  from: GeneratorWorkflowStep,
  to: GeneratorWorkflowStep,
): { title: string; description: string } {
  if (from === "topic" && to === "search") {
    return {
      title: "正在準備搜尋策略",
      description: "ResearchForge 正在整理主題、報告類型與搜尋方向。",
    };
  }
  if (from === "search" && to === "manage") {
    return {
      title: "正在整理候選來源",
      description: "正在把搜尋結果轉成可審查的來源卡片。",
    };
  }
  if (from === "manage" && to === "generate") {
    return {
      title: "正在整理已接受來源",
      description: "正在檢查來源數量與報告生成準備度。",
    };
  }
  if (to === "topic") {
    return {
      title: "正在回到主題設定",
      description: "正在載入研究設定與進階選項。",
    };
  }
  if (to === "search") {
    return {
      title: "正在回到來源搜尋",
      description: "正在載入主題摘要與搜尋控制。",
    };
  }
  if (to === "manage") {
    return {
      title: "正在回到來源管理",
      description: "正在整理來源審查狀態。",
    };
  }
  return {
    title: "正在前往生成報告",
    description: "正在載入報告生成工作區。",
  };
}

function StepTransitionScreen({
  title,
  description,
  targetStep,
}: {
  title: string;
  description: string;
  targetStep: GeneratorWorkflowStep | "report";
}) {
  return (
    <section
      className="flex min-h-[520px] items-center justify-center rounded-lg border border-primary/20 bg-card px-6 py-12 shadow-sm"
      data-testid="step-transition"
    >
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Loader2 className="h-9 w-9 animate-spin" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        <Badge variant="outline" className="mt-4">
          前往：{workflowStepLabel(targetStep)}
        </Badge>
        <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/70 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
        </div>
      </div>
    </section>
  );
}

function WorkflowStepper({
  currentStep,
  completedSteps,
  canEnterStep,
  onStepClick,
  disabled,
}: {
  currentStep: GeneratorWorkflowStep;
  completedSteps: Record<GeneratorWorkflowStep, boolean>;
  canEnterStep: (step: GeneratorWorkflowStep) => boolean;
  onStepClick: (step: GeneratorWorkflowStep) => void;
  disabled: boolean;
}) {
  const currentIndex = workflowStepIndex(currentStep);

  return (
    <div
      className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm"
      data-testid="generator-workflow-stepper"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {WORKFLOW_STEPS.map((step, index) => {
          const completed = completedSteps[step.value] || index < currentIndex;
          const active = index === currentIndex;
          const Icon = step.Icon;
          const enabled = canEnterStep(step.value) && !disabled;
          return (
            <button
              key={step.value}
              type="button"
              disabled={!enabled || active}
              onClick={() => onStepClick(step.value)}
              className={`relative flex min-h-[76px] items-center gap-3 rounded-md px-2 py-2 text-left transition-colors sm:flex-col sm:items-center sm:text-center ${
                enabled && !active ? "hover:bg-muted/60" : ""
              } ${!enabled && !active ? "cursor-not-allowed opacity-55" : ""}`}
              data-testid={`stepper-${step.value}`}
            >
              {index > 0 && (
                <div
                  className={`hidden sm:block absolute right-[calc(50%+1.75rem)] top-5 h-px w-[calc(100%-3.5rem)] ${
                    completed || active ? "bg-primary/60" : "bg-border"
                  }`}
                />
              )}
              <div
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                  completed
                    ? "border-primary bg-primary text-primary-foreground"
                    : active
                      ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/10"
                      : "border-border bg-muted text-muted-foreground"
                }`}
                aria-current={active ? "step" : undefined}
              >
                {completed ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <p
                  className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {WORKFLOW_STEPS.map((step, index) => {
          const completed = completedSteps[step.value] || index < currentIndex;
          const active = index === currentIndex;
          return (
            <Badge
              key={step.value}
              variant={active ? "default" : completed ? "secondary" : "outline"}
            >
              {active ? "目前" : completed ? "已完成" : "未開始"}：{step.label}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

function sourceReviewLabel(reviewState: SourceReviewState): string {
  switch (reviewState) {
    case "accepted":
      return "已接受";
    case "rejected":
      return "已拒絕";
    case "pending":
    default:
      return "待審核";
  }
}

function sourceReviewBadgeVariant(
  reviewState: SourceReviewState,
): "default" | "secondary" | "outline" | "destructive" {
  switch (reviewState) {
    case "accepted":
      return "default";
    case "rejected":
      return "destructive";
    case "pending":
    default:
      return "secondary";
  }
}

function sourceRelevanceBadgeVariant(
  level: SourceRecord["topicalRelevanceLabel"] | SourceRecord["relevanceLevel"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (level) {
    case "high":
    case "primary":
      return "default";
    case "medium":
    case "secondary":
      return "secondary";
    case "clue":
    case "low":
      return "outline";
    case "irrelevant":
    case "off_topic":
      return "destructive";
    default:
      return "outline";
  }
}

function sourceRelevanceTierLabel(
  level: SourceRecord["topicalRelevanceLabel"] | SourceRecord["relevanceLevel"],
): string {
  switch (level) {
    case "high":
      return "高相關";
    case "medium":
      return "中相關";
    case "low":
      return "低相關";
    case "irrelevant":
      return "不相關";
    case "primary":
      return "高相關";
    case "secondary":
    case "clue":
      return "中相關";
    case "off_topic":
      return "低相關";
    default:
      return "待確認";
  }
}

function evidenceGroundingLabel(
  status: SourceRecord["evidenceSufficiency"] | SourceRecord["evidenceGrounding"],
): string {
  switch (status) {
    case "strong":
      return "內容充足";
    case "moderate":
      return "有摘要可用";
    case "weak":
      return "僅片段可判斷";
    case "insufficient":
      return "證據不足";
    case "abstract_grounded":
    case "snippet_grounded":
      return "有摘要可用";
    case "metadata_only":
      return "僅標題資訊";
    default:
      return "片段待確認";
  }
}

function usageRecommendationLabel(
  recommendation: SourceRecord["usageRecommendation"],
): string {
  switch (recommendation) {
    case "primary":
      return "可作主要證據";
    case "secondary":
      return "可作補充來源";
    case "exclude":
      return "建議排除";
    case "reference":
    default:
      return "僅供參考";
  }
}

function usageRecommendationBadgeVariant(
  recommendation: SourceRecord["usageRecommendation"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (recommendation) {
    case "primary":
      return "default";
    case "secondary":
      return "secondary";
    case "exclude":
      return "destructive";
    case "reference":
    default:
      return "outline";
  }
}

function sourceRecommendationBucketLabel(
  bucket: SourceRecord["recommendationBucket"],
): string | null {
  switch (bucket) {
    case "scholarly_recommended":
      return "學術論文";
    case "official_background":
      return "官方背景";
    case "manual_review":
      return "待確認";
    case "rejected":
      return "已排除";
    default:
      return null;
  }
}

function sourceRecommendationBucketVariant(
  bucket: SourceRecord["recommendationBucket"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (bucket) {
    case "scholarly_recommended":
      return "default";
    case "official_background":
      return "secondary";
    case "manual_review":
      return "outline";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}

function sourceRoleBadgeLabel(role: SourceRecord["sourceRole"]): string | null {
  switch (role) {
    case "background_definition":
    case "definition_or_concept":
    case "official_background_explanation":
      return "背景來源";
    case "academic_evidence":
    case "core_scholarly_evidence":
      return "學術證據";
    case "official_statistics":
    case "statistics_or_dataset":
      return role === "statistics_or_dataset" ? "資料集" : "官方統計";
    case "professional_guidance":
    case "teaching_or_public_explainer":
      return "專業指南";
    case "case_or_news":
      return "案例／新聞";
    case "data_or_dataset":
      return "資料集";
    case "weak_or_uncertain":
      return "待確認";
    case "rejected":
      return "已排除";
    default:
      return null;
  }
}

function sourceRoleBadgeVariant(
  role: SourceRecord["sourceRole"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (role) {
    case "academic_evidence":
    case "core_scholarly_evidence":
      return "default";
    case "official_statistics":
    case "professional_guidance":
    case "data_or_dataset":
    case "statistics_or_dataset":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
}

function retrievalModeLabel(mode: SourceRecord["retrievalMode"]): string {
  switch (mode) {
    case "live_provider":
      return "live provider";
    case "trusted_seed":
      return "trusted seed";
    case "stale_cache":
      return "stale cache";
    case "user_import":
      return "user import";
    case "manual_url":
      return "manual URL";
    default:
      return "live provider";
  }
}

function summaryQualityLabel(
  quality: ReturnType<typeof sourceSummaryForUser>["summaryQuality"],
): string {
  switch (quality) {
    case "good":
      return "摘要品質 good";
    case "partial":
      return "摘要品質 partial";
    case "poor":
      return "摘要不足";
    case "irrelevant":
      return "低相關";
    default:
      return "摘要待確認";
  }
}

function summaryQualityBadgeVariant(
  quality: ReturnType<typeof sourceSummaryForUser>["summaryQuality"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (quality) {
    case "good":
      return "default";
    case "partial":
      return "secondary";
    case "irrelevant":
      return "destructive";
    case "poor":
    default:
      return "outline";
  }
}

function sourceSummaryStatusLabel(source: SourceRecord): string {
  if (source.summarySourceType === "metadataFallback") {
    return "書目資訊初步摘要";
  }
  if (source.summarySourceType === "fulltext") {
    return "全文摘要";
  }
  if (source.summarySourceType === "abstract") {
    return "摘要整理";
  }
  if (source.summarySourceType === "snippet") {
    return "片段整理";
  }
  switch (source.summaryStructuredStatus) {
    case "success":
      return "LLM 摘要";
    case "unavailable":
      return "LLM unavailable";
    case "invalid_input":
      return "主題無效";
    case "insufficient_sources":
      return "來源摘要不足";
    case "error":
      return "摘要處理失敗";
    default:
      break;
  }
  const status = source.summaryStatus ?? source.llmSummaryStatus;
  switch (status) {
    case "success":
      return "摘要 LLM 成功";
    case "metadata-only":
      return "metadata-only";
    case "fetch-failed":
      return "fetch failed";
    case "llm-failed":
      return "llm failed";
    case "fallback":
      return "fallback 摘要";
    case "timeout":
      return "摘要 LLM 逾時";
    case "quota_exceeded":
      return "摘要額度限制";
    case "failed":
      return "摘要 LLM 失敗";
    case "skipped":
      return "摘要略過";
    default:
      return "摘要規則整理";
  }
}

function sourceSummaryStatusVariant(
  source: SourceRecord,
): "default" | "secondary" | "outline" | "destructive" {
  if (source.summaryConfidence === "low") return "outline";
  if (source.summaryConfidence === "medium") return "secondary";
  if (source.summaryConfidence === "high") return "default";
  switch (source.summaryStructuredStatus) {
    case "success":
      return "default";
    case "insufficient_sources":
      return "outline";
    case "unavailable":
      return "secondary";
    case "invalid_input":
    case "error":
      return "destructive";
    default:
      break;
  }
  const status = source.summaryStatus ?? source.llmSummaryStatus;
  switch (status) {
    case "success":
      return "default";
    case "metadata-only":
      return "outline";
    case "fallback":
      return "secondary";
    case "timeout":
    case "skipped":
      return "secondary";
    case "quota_exceeded":
    case "failed":
    case "fetch-failed":
    case "llm-failed":
      return "destructive";
    default:
      return "outline";
  }
}

function emptyEvidenceSnippetMessage(
  level: SourceRecord["relevanceLevel"],
): string {
  if (level === "primary") {
    return "此來源目前沒有可單獨摘錄的驗證片段，系統仍保留為主要候選；接受前請以摘要與原始來源再確認。";
  }
  if (level === "secondary" || level === "clue") {
    return "此來源目前沒有可單獨摘錄的驗證片段，系統先列為延伸候選。";
  }
  return "此來源未提供足夠片段，系統已將它降為低相關候選。";
}

function sourceAuthorShortLabel(authors: string[]): string {
  if (authors.length === 0) return "作者待確認";
  if (authors.length === 1) return authors[0];
  return `${authors[0]} 等`;
}

function compactSourceLine(text: string, maxLength = 80): string {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  if (chars.length <= maxLength) return chars.join("");
  return `${chars
    .slice(0, maxLength - 1)
    .join("")
    .trim()}…`;
}

function scoreLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value))
    : "待評";
}

function abstractSnippet(source: SourceRecord): string | null {
  const text = source.abstract?.trim() || source.snippet?.trim();
  if (!text) return null;
  return compactSourceLine(text, 180);
}

function sourceHasServerDerivableSupport(source: SourceRecord): boolean {
  const record = source as SourceRecord & Record<string, unknown>;
  if (Array.isArray(record.extractedChunks) && record.extractedChunks.length > 0) {
    return true;
  }
  return Boolean(
    (typeof record.extractedAbstract === "string" && record.extractedAbstract.trim()) ||
      (typeof record.abstractOriginal === "string" && record.abstractOriginal.trim()) ||
      (typeof record.originalAbstract === "string" && record.originalAbstract.trim()) ||
      (typeof source.abstract === "string" && source.abstract.trim()),
  );
}

function parseAuthorsInput(value: string): string[] {
  return value
    .split(/[、,，;]/)
    .map((author) => author.trim())
    .filter(Boolean);
}

function sourcesForReviewTab(
  sources: SourceRecord[],
  tab: SourceReviewTab,
): SourceRecord[] {
  switch (tab) {
    case "accepted":
      return acceptedSourceRecords(sources);
    case "pending":
      return primaryCandidateSources(sources);
    case "all":
    default:
      return sources;
  }
}

function sourceDisplayGate(source: SourceRecord): SourceDisplayGate {
  const state = sourceReviewState(source);
  if (state === "accepted") return "primary";
  if (state === "rejected") return "hidden";
  if (
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow" ||
    source.relevanceLevel === "off_topic"
  ) {
    return "hidden";
  }
  if (source.isMetadataOnly || source.evidenceGrounding === "metadata_only") {
    return "secondary";
  }
  if (source.relevanceLevel === "low") return "secondary";
  if (source.relevanceLevel === "secondary" || source.relevanceLevel === "clue")
    return "secondary";
  if (source.shouldShowInMainList === false) return "secondary";
  return "primary";
}

function visiblePrimarySourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => sourceDisplayGate(source) === "primary");
}

function primaryCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      sourceDisplayGate(source) === "primary",
  );
}

function secondaryCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      sourceDisplayGate(source) === "secondary",
  );
}

function lowRelevanceCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      sourceDisplayGate(source) === "hidden",
  );
}

function reviewableCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      (sourceDisplayGate(source) === "primary" ||
        sourceDisplayGate(source) === "secondary" ||
        sourceDisplayGate(source) === "hidden"),
  );
}

function visibleReviewCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => {
    if (sourceReviewState(source) !== "pending") return false;
    const gate = sourceDisplayGate(source);
    return gate === "primary" || gate === "secondary" || gate === "hidden";
  });
}

function selectableCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => {
    if (sourceReviewState(source) !== "pending") return false;
    if (
      source.classification === "stale_topic" ||
      source.classification === "stale_workflow"
    ) {
      return false;
    }
    return sourceDisplayGate(source) === "primary" ||
      sourceDisplayGate(source) === "secondary" ||
      sourceDisplayGate(source) === "hidden";
  });
}

type SectionSufficiencyStatus = "sufficient" | "weak" | "insufficient";

interface UiSectionSufficiency {
  sectionId: string;
  title: string;
  status: SectionSufficiencyStatus;
  evidenceCount: number;
  fullTextEvidenceCount: number;
  abstractOnlyEvidenceCount: number;
  citationCount: number;
  missingEvidenceTypes: string[];
  userVisibleMessage: string;
}

function badgeVariantForSufficiency(
  status: SectionSufficiencyStatus,
): "default" | "secondary" | "outline" {
  if (status === "sufficient") return "default";
  if (status === "weak") return "secondary";
  return "outline";
}

function sourceReadableStatus(source: SourceRecord): {
  label: string;
  variant: "default" | "secondary" | "outline";
} {
  switch (source.accessLevel) {
    case "full_text":
      return { label: "full text", variant: "default" };
    case "abstract_only":
      return { label: "abstract only", variant: "secondary" };
    case "metadata_only":
      return { label: "metadata only", variant: "outline" };
    case "blocked_or_paywalled":
      return { label: "manual review required", variant: "outline" };
    case "failed_extraction":
      return { label: "extraction failed", variant: "outline" };
    default:
      if (source.extractionStatus === "text_extracted" || source.extractionStatus === "grobid_extracted" || source.extractionStatus === "ocr_extracted") {
        return { label: "full text", variant: "default" };
      }
      if (source.extractionStatus === "extraction_skipped_no_full_text") return { label: "abstract only", variant: "secondary" };
      if (source.extractionStatus === "metadata_only") return { label: "metadata only", variant: "outline" };
      if (source.extractionStatus === "failed" || source.extractionStatus === "extraction_failed" || source.extractionStatus === "extraction_unavailable_no_parser") return { label: "extraction failed", variant: "outline" };
      if (source.abstract) return { label: "abstract only", variant: "secondary" };
      return { label: "metadata only", variant: "outline" };
  }
}

function extractedEvidenceCount(source: SourceRecord): number {
  return Math.max(
    source.evidencePoints?.length ?? 0,
    source.extractedChunks?.length ?? 0,
    source.extractedSections?.length ?? 0,
  );
}

function sourceWarningsForDisplay(source: SourceRecord): string[] {
  return Array.from(
    new Set([
      ...(source.extractionWarnings ?? []),
      ...(source.claimExtractionWarnings ?? []),
      source.userFacingMessage ?? "",
      source.failureReason ?? "",
      ...(source.qualityWarnings ?? []),
      ...(source.summaryWarnings ?? []),
    ].filter(Boolean)),
  ).slice(0, 3);
}

function cardTargetsSection(card: EvidenceCard, sectionId: string): boolean {
  const targets = new Set([...(card.sectionTargets ?? []), ...(card.usableSections ?? [])]);
  if (sectionId === "background") {
    return targets.has("introduction") || targets.has("background") || targets.has("研究背景");
  }
  if (sectionId === "literature_review") {
    return targets.has("literature_review") || targets.has("文獻探討");
  }
  if (sectionId === "methodology") {
    return targets.has("methodology") || targets.has("methods_context") || card.evidenceType === "method";
  }
  if (sectionId === "discussion") {
    return targets.has("discussion") || targets.has("analysis") || targets.has("數據分析");
  }
  if (sectionId === "conclusion") {
    return targets.has("conclusion") || targets.has("結論") || targets.has("discussion");
  }
  return false;
}

function buildUiSectionSufficiency(cards: EvidenceCard[]): UiSectionSufficiency[] {
  const specs = [
    { sectionId: "background", title: "研究背景", threshold: 2, types: ["background", "definition", "theory", "statistic"] },
    { sectionId: "literature_review", title: "文獻探討", threshold: 4, types: ["finding", "theory", "method", "limitation"], minSources: 2 },
    { sectionId: "methodology", title: "研究方法", threshold: 1, types: ["method"] },
    { sectionId: "discussion", title: "結果與討論", threshold: 3, types: ["finding", "limitation", "counterpoint", "theory"] },
    { sectionId: "conclusion", title: "結論", threshold: 1, types: ["finding", "limitation"] },
  ] as const;
  return specs.map((spec) => {
    const sectionCards = spec.sectionId === "conclusion"
      ? cards.filter((card) => card.derivation !== "metadata-derived")
      : cards.filter((card) => cardTargetsSection(card, spec.sectionId));
    const sourceCount = new Set(sectionCards.map((card) => card.sourceId)).size;
    const presentTypes = new Set(sectionCards.map((card) => card.evidenceType).filter(Boolean));
    const missingEvidenceTypes = spec.types.filter((type) => !presentTypes.has(type));
    const minSources = "minSources" in spec ? spec.minSources : 1;
    const enoughSources = sourceCount >= minSources;
    const status: SectionSufficiencyStatus =
      sectionCards.length >= spec.threshold && enoughSources
        ? "sufficient"
        : sectionCards.length > 0
          ? "weak"
          : "insufficient";
    const userVisibleMessage =
      status === "sufficient"
        ? "本段已有可引用證據。"
        : status === "weak"
          ? "本段有部分證據，但仍需保守撰寫。"
          : "本段證據不足，報告會標示缺口。";
    return {
      sectionId: spec.sectionId,
      title: spec.title,
      status,
      evidenceCount: sectionCards.length,
      fullTextEvidenceCount: sectionCards.filter((card) => card.sourceAccessLevel === "full_text").length,
      abstractOnlyEvidenceCount: sectionCards.filter((card) => card.sourceAccessLevel === "abstract_only" || card.abstractOnly).length,
      citationCount: sourceCount,
      missingEvidenceTypes,
      userVisibleMessage,
    };
  });
}

function SourceReviewCard({
  source,
  isExpanded,
  onExpandedChange,
  onReview,
  onEdit,
  topic,
  showTechnicalDetails,
}: {
  source: SourceRecord;
  isExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
  topic: string;
  showTechnicalDetails: boolean;
}) {
  const sourceId = source.id || sourceRecordKey(source);
  const reviewState = sourceReviewState(source);
  const title = source.title || "標題待確認";
  const year = source.year ? String(source.year) : "年份待確認";
  const usableSections = normalizeUsableSections(source.usableSections);
  const incomplete = sourceHasIncompleteMetadata(source);
  const reviewLabel = sourceReviewLabel(reviewState);
  const confidence = source.confidence ?? "中";
  const category = sourceCategoryLabel(source.sourceCategory);
  const summary = sourceSummaryForUser(source, topic);
  const hasAbstract = sourceHasUsableAbstract(source);
  const sourceLink = primarySourceLink(source);
  const relevanceLevel = source.relevanceLevel ?? null;
  const topicalLabel = source.topicalRelevanceLabel ?? null;
  const evidenceSufficiency = source.evidenceSufficiency ?? null;
  const usageRecommendation = source.usageRecommendation ?? null;
  const bucketLabel = sourceRecommendationBucketLabel(source.recommendationBucket);
  const roleLabel = sourceRoleBadgeLabel(source.sourceRole);
  const retrievalLabel = retrievalModeLabel(source.retrievalMode);
  const relevanceReasons = source.relevanceReasons ?? [];
  const scoreReasons = source.scoreReasons ?? [];
  const sourceLimitations = source.qualityWarnings ?? [];
  const snippet = abstractSnippet(source);
  const providerLabel = source.provider || source.sourceType;
  const venueLabel = source.containerTitle || source.publisher || "出處待確認";
  const sourceTypeLabel = sourceTypeDisplayLabel(source);
  const readableStatus = sourceReadableStatus(source);
  const extractedCount = extractedEvidenceCount(source);
  const chunkCount = source.extractedChunks?.length ?? 0;
  const claimCount = source.claimCount ?? 0;
  const acceptedClaimCount = source.acceptedClaimCount ?? 0;
  const acceptedEvidenceCardCount = source.acceptedEvidenceCardCount ?? 0;
  const extractionModeLabel = source.extractionMode ?? source.extractionMethod ?? "未抽取";
  const claimExtractionLabel =
    source.claimExtractionStatus === "enabled"
      ? "LLM claim extraction enabled"
      : source.claimExtractionStatus === "fallback"
        ? "LLM claim extraction fallback"
        : source.claimExtractionStatus === "unavailable"
          ? "LLM claim extraction unavailable"
          : source.claimExtractionStatus === "failed"
            ? "LLM claim extraction failed"
            : "claim extraction skipped";
  const extractionFailureMessage =
    source.userFacingMessage ||
    (source.extractionStatus === "extraction_unavailable_no_parser"
      ? "此 PDF 無法抽出可用文字；GROBID/OCR 未啟用或不可用，因此只能使用摘要或 metadata。"
      : "");
  const extractionWarnings = sourceWarningsForDisplay(source);
  const authorityLabel = source.authorityLabel ?? "權威性待確認";
  const languageLabel = source.sourceLanguageLabel ?? "來源語言待確認";
  const compactMode = reviewState !== "pending";
  const shouldShowExpandedDetails = isExpanded;
  const StatusIcon =
    reviewState === "accepted"
      ? CheckCircle2
      : reviewState === "rejected"
        ? XCircle
        : AlertTriangle;
  const cardTone =
    reviewState === "accepted"
      ? "border-green-500/30 bg-green-50/80"
      : reviewState === "rejected"
        ? "border-destructive/25 bg-destructive/5"
        : "border-border bg-card";
  const statusTone =
    reviewState === "accepted"
      ? "bg-green-600 text-white"
      : reviewState === "rejected"
        ? "bg-destructive text-destructive-foreground"
        : "bg-amber-100 text-amber-700";
  const compactSummary =
    reviewState === "accepted"
      ? compactSourceLine(summary.contentSummary)
      : reviewState === "rejected"
        ? compactSourceLine(
            summary.recommendation === "not_recommended"
              ? summary.recommendationReason
              : summary.topicRelation,
          )
        : compactSourceLine(summary.contentSummary);
  const compactFacet =
    summary.mainEvidenceFacet ??
    summary.suitableSectionLabels[0] ??
    summary.usableSections[0] ??
    "支撐面向待確認";
  const summaryQuality = summary.summaryQuality;
  const acceptButtonLabel =
    source.recommendationBucket === "official_background"
      ? "接受為背景來源"
      : summary.recommendation === "not_recommended"
      ? "強制保留"
      : summary.recommendation === "supporting"
        ? "接受為補充來源"
        : summary.recommendation === "check_first"
          ? "確認後接受"
          : "接受來源";
  const acceptButtonVariant =
    summary.recommendation === "recommended" ? "default" : "outline";
  const isForceAccepted = Boolean(source.manuallyForced);

  return (
    <Collapsible
      open={shouldShowExpandedDetails}
      onOpenChange={onExpandedChange}
    >
      <article
        className={`rounded-lg border p-3 transition-colors sm:p-4 ${cardTone}`}
        data-testid={`source-card-${reviewState}`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex min-w-0 gap-3 overflow-hidden">
            {!compactMode && (
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${statusTone}`}
              >
                <StatusIcon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 lg:flex-[1_1_54%]">
                  <h3
                    className="line-clamp-2 break-words text-sm font-semibold leading-6 text-foreground"
                    title={title}
                  >
                    {title}
                  </h3>
                  {reviewState !== "rejected" && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="max-w-full truncate whitespace-nowrap">{sourceAuthorShortLabel(source.authors)}</span>
                      <span className="whitespace-nowrap">{year}</span>
                      <span className="whitespace-nowrap">{category}</span>
                      <span className="max-w-full truncate whitespace-nowrap">{venueLabel}</span>
                      {showTechnicalDetails && (
                        <>
                          <span className="whitespace-nowrap">{sourceTypeLabel}</span>
                          <span className="max-w-full truncate whitespace-nowrap">{providerLabel}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!compactMode && (
                  <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-[0_1_46%] lg:justify-end [&>*]:max-w-full [&>*]:whitespace-nowrap">
                    <Badge variant={sourceReviewBadgeVariant(reviewState)}>
                      {reviewLabel}
                    </Badge>
                    {bucketLabel ? (
                      <Badge variant={sourceRecommendationBucketVariant(source.recommendationBucket)}>
                        {bucketLabel}
                      </Badge>
                    ) : null}
                    {roleLabel ? (
                      <Badge variant={sourceRoleBadgeVariant(source.sourceRole)}>
                        {roleLabel}
                      </Badge>
                    ) : null}
                    {source.isOpenAccess && <Badge variant="outline">開放全文</Badge>}
                    <Badge variant={readableStatus.variant}>
                      {readableStatus.label}
                    </Badge>
                    <Badge variant="outline">evidence {extractedCount}</Badge>
                    <Badge variant="outline">chunks {chunkCount}</Badge>
                    <Badge variant="outline">claims {acceptedClaimCount}/{claimCount}</Badge>
                    <Badge variant="outline">cards {acceptedEvidenceCardCount}</Badge>
                    {(source.lowConfidence || source.needsReview) && (
                      <Badge variant="outline">待人工審查</Badge>
                    )}
                    {(source.retrievalMode === "trusted_seed" || source.retrievalMode === "stale_cache") && (
                      <Badge variant="outline">備援來源</Badge>
                    )}
                    <Badge
                      variant={sourceRelevanceBadgeVariant(topicalLabel ?? relevanceLevel)}
                    >
                      主題相關度：{sourceRelevanceTierLabel(topicalLabel ?? relevanceLevel)}
                    </Badge>
                    <Badge variant={summaryQualityBadgeVariant(summaryQuality)}>
                      證據充足度：{evidenceGroundingLabel(evidenceSufficiency ?? summary.groundingStatus)}
                    </Badge>
                    <Badge variant={usageRecommendationBadgeVariant(usageRecommendation)}>
                      用途建議：{usageRecommendationLabel(usageRecommendation)}
                    </Badge>
                    {!showTechnicalDetails ? (
                      languageLabel !== "來源語言待確認" ? (
                        <Badge variant="outline">語言：{languageLabel}</Badge>
                      ) : null
                    ) : (
                      <>
                        <Badge variant="secondary">可信度 {confidence}</Badge>
                        <Badge variant="outline">{authorityLabel}</Badge>
                        <Badge variant="outline">{languageLabel}</Badge>
                        <Badge variant={sourceSummaryStatusVariant(source)}>
                          {sourceSummaryStatusLabel(source)}
                        </Badge>
                        <Badge variant={readableStatus.variant}>
                          {readableStatus.label}
                        </Badge>
                        <Badge variant="outline">evidence {extractedCount}</Badge>
                        <Badge variant="outline">chunks {chunkCount}</Badge>
                        <Badge variant="outline">claims {acceptedClaimCount}/{claimCount}</Badge>
                        <Badge variant="outline">cards {acceptedEvidenceCardCount}</Badge>
                        <Badge variant={hasAbstract ? "outline" : "secondary"}>
                          {evidenceGroundingLabel(evidenceSufficiency ?? summary.groundingStatus)}
                        </Badge>
                        <Badge variant="outline">{sourceTypeLabel}</Badge>
                        <Badge variant="secondary">{providerLabel}</Badge>
                        {(source.isMetadataOnly || source.evidenceGrounding === "metadata_only") && (
                          <Badge variant="outline">metadata-only</Badge>
                        )}
                        {source.doi && <Badge variant="outline">DOI</Badge>}
                        {(source.sourceKind === "journal" || source.sourceKind === "conference") && (
                          <Badge variant="outline">{source.sourceKind === "journal" ? "venue" : "conference"}</Badge>
                        )}
                        {source.isOpenAccess && <Badge variant="outline">Open Access</Badge>}
                        {incomplete && (
                          <Badge variant="outline">引用資料不完整</Badge>
                        )}
                        {isForceAccepted && (
                          <Badge variant="outline">人工強制保留</Badge>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-border/70 bg-background/70 px-3 py-3">
            {compactMode ? (
              <div className="space-y-2">
                {reviewState === "accepted" && (
                  <p className="text-xs font-medium text-muted-foreground">
                    主要支撐面向：{compactFacet}
                  </p>
                )}
                <p className="line-clamp-1 text-sm leading-6 text-foreground/90">
                  {compactSummary}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground">
                    文章主旨
                  </p>
                  <p className="text-sm leading-6 text-foreground/90">
                    {summary.contentSummary}
                  </p>
                  {summary.summaryConfidence === "low" && (
                    <p className="text-xs leading-5 text-amber-700">
                      目前此摘要信心較低，主要依書目資訊或有限片段整理；若要正式引用，建議先再確認原始來源。
                    </p>
                  )}
                  {summary.summaryWarnings.length > 0 && (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {summary.summaryWarnings[0]}
                    </p>
                  )}
                  {isForceAccepted && (
                    <p className="text-xs leading-5 text-amber-700">
                      這筆來源是人工強制保留，不會自動視為主要證據，也不會直接進入正式 evidence cards。
                    </p>
                  )}
                </div>
                <div className="grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">相關判斷：</span>
                    {summary.topicRelation}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">使用建議：</span>
                    {summary.recommendationReason}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    可用於
                  </span>
                  {(summary.suitableSectionLabels.length
                    ? summary.suitableSectionLabels
                    : summary.usableSections
                  ).map((section) => (
                    <Badge key={section} variant="outline">
                      {section}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  retrieval：{retrievalLabel}
                </p>
                <div className="grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                  <p>
                    <span className="font-medium text-foreground">可讀狀態：</span>
                    {readableStatus.label}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">抽取方法：</span>
                    {extractionModeLabel}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">抽取狀態：</span>
                    {source.extractionStatus ?? "未抽取"}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">claim extraction：</span>
                    {claimExtractionLabel}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">全文字數：</span>
                    {source.fullTextCharCount ?? 0}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">chunks / claims / cards：</span>
                    {chunkCount} / {acceptedClaimCount}/{claimCount} / {acceptedEvidenceCardCount}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">可用章節：</span>
                    {(source.extractedSections?.map((section) => section.heading).slice(0, 3).join("、") ||
                      usableSections.join("、") ||
                      "尚未抽取")}
                  </p>
                </div>
                {extractionWarnings.length > 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    warnings：{extractionWarnings.join("；")}
                  </p>
                ) : null}
                {extractionFailureMessage ? (
                  <p className="text-xs leading-5 text-amber-700">
                    {extractionFailureMessage}
                  </p>
                ) : null}
                {sourceLimitations.length > 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    限制：{sourceLimitations.slice(0, 2).join("；")}
                  </p>
                ) : null}
                {showTechnicalDetails && (
                  <>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">
                        可驗證片段
                      </p>
                      {summary.evidenceSnippets.length > 0 ? (
                        <ul className="space-y-1.5">
                          {summary.evidenceSnippets.slice(0, 2).map((snippet) => (
                            <li
                              key={`${snippet.matchedFacet}-${snippet.originalSnippet}`}
                              className="rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-foreground/90"
                            >
                              <div className="font-medium text-foreground">
                                {snippet.matchedFacet} · {snippet.supportLevel}
                              </div>
                              <div className="mt-0.5">{snippet.snippetZhTw}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                原始片段：{snippet.originalSnippet}
                              </div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                命中詞：{snippet.matchedTerms.join("、")}
                              </div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {snippet.reasoningZhTw}
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs leading-5 text-muted-foreground">
                          {emptyEvidenceSnippetMessage(relevanceLevel)}
                        </p>
                      )}
                    </div>
                    {snippet && (
                      <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {source.abstract ? "Abstract：" : "Snippet："}
                        </span>
                        {snippet}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
                        <span className="block text-[11px] text-muted-foreground">相關性</span>
                        <span className="font-medium text-foreground">{scoreLabel(source.topicRelevance ?? source.relevanceScore)}</span>
                      </div>
                      <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
                        <span className="block text-[11px] text-muted-foreground">來源品質</span>
                        <span className="font-medium text-foreground">{scoreLabel(source.evidenceQuality ?? source.sourceQualityScore)}</span>
                      </div>
                      <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
                        <span className="block text-[11px] text-muted-foreground">來源信任</span>
                        <span className="font-medium text-foreground">{scoreLabel(source.sourceTrust ?? source.authorityScore ?? source.finalScore)}</span>
                      </div>
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {summary.summaryQualityReason}
                    </p>
                    {(source.summaryProvider || source.summaryModel || source.summaryReason) && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        摘要 diagnostics：
                        {[
                          source.summaryProvider,
                          source.summaryModel,
                          source.summaryStatus ?? source.llmSummaryStatus,
                          source.summaryFallbackUsed ? "fallback" : null,
                          source.summaryReason,
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    )}
                    <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                      <p>主證據面向：{summary.mainEvidenceFacet ?? "未列入主要證據"}</p>
                      <p>
                        證據鏈：
                        {summary.evidenceChain.length > 0
                          ? summary.evidenceChain
                              .map(
                                (entry) =>
                                  `${entry.facetLabelZhTw} → ${entry.matchedTerms.slice(0, 2).join("、")} → ${entry.supportLevel}`,
                              )
                              .join("；")
                          : "未形成可用證據鏈"}
                      </p>
                      {relevanceReasons.length > 0 && (
                        <p>主題相關性：{relevanceReasons.slice(0, 2).join("；")}</p>
                      )}
                      {scoreReasons.length > 0 && (
                        <p>評分原因：{scoreReasons.slice(0, 4).join("；")}</p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {reviewState === "accepted" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[36px]"
                onClick={() => onReview(sourceId, "pending")}
              >
                取消採用
              </Button>
            ) : reviewState === "pending" ? (
              <Button
                type="button"
                size="sm"
                variant={acceptButtonVariant}
                className="min-h-[36px]"
                onClick={() => onReview(sourceId, "accepted")}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {acceptButtonLabel}
              </Button>
            ) : null}
            {reviewState === "rejected" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[36px]"
                onClick={() => onReview(sourceId, "pending")}
              >
                還原為待審
              </Button>
            ) : reviewState === "pending" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[36px]"
                onClick={() => onReview(sourceId, "rejected")}
              >
                <XCircle className="mr-2 h-4 w-4" /> 拒絕
              </Button>
            ) : null}
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-[36px]"
                data-testid="button-source-expand"
                aria-label={
                  shouldShowExpandedDetails ? "收合來源細節" : "展開來源細節"
                }
                title={
                  shouldShowExpandedDetails ? "收合來源細節" : "展開來源細節"
                }
              >
                {shouldShowExpandedDetails ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                {shouldShowExpandedDetails ? "收合詳情" : "展開詳情"}
              </Button>
            </CollapsibleTrigger>
            {!compactMode && sourceLink.href ? (
              <Button
                asChild
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-[36px]"
                title={sourceLink.warning}
              >
                <a href={sourceLink.href} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> {sourceLink.label}
                </a>
              </Button>
            ) : !compactMode ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-[36px]"
                disabled
              >
                {sourceLink.label}
              </Button>
            ) : null}
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/70 pt-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <h4 className="text-sm font-semibold text-foreground">
                {showTechnicalDetails ? "進階資料與引用資訊" : "引用資料與審查筆記"}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                補齊引用資料與審查筆記；需要時再回頭調整摘要卡的接受狀態。
              </p>
            </div>
            <div className="space-y-1 md:col-span-2">
              {sourceLink.warning ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {sourceLink.warning}
                </p>
              ) : null}
              {source.sourceLinkInfo?.canonicalUrl ||
              source.sourceLinkInfo?.metadataUrl ||
              source.sourceLinkInfo?.originalUrl ? (
                <p className="text-xs text-muted-foreground">
                  {sourceAccessLabel(source)}
                  {source.sourceLinkInfo.doiUrl ? "；DOI 連結可用" : ""}
                </p>
              ) : null}
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-title`} className="text-xs">
                標題
              </Label>
              <Input
                id={`${sourceId}-title`}
                value={source.title}
                onChange={(event) =>
                  onEdit(sourceId, { title: event.target.value })
                }
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-authors`} className="text-xs">
                作者
              </Label>
              <Input
                id={`${sourceId}-authors`}
                value={source.authors.join("、")}
                placeholder="以頓號或逗號分隔多位作者"
                onChange={(event) =>
                  onEdit(sourceId, {
                    authors: parseAuthorsInput(event.target.value),
                  })
                }
                className="h-10 bg-background"
              />
              <p className="text-xs text-muted-foreground">
                顯示：{formatSourceAuthors(source.authors)}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-year`} className="text-xs">
                年份
              </Label>
              <Input
                id={`${sourceId}-year`}
                value={source.year ?? ""}
                inputMode="numeric"
                placeholder="年份待確認"
                onChange={(event) => {
                  const value = event.target.value.trim();
                  onEdit(sourceId, { year: value ? Number(value) : null });
                }}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-provider`} className="text-xs">
                來源平台
              </Label>
              <Input
                id={`${sourceId}-provider`}
                value={source.sourceType}
                disabled
                className="h-10 bg-muted/40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-container`} className="text-xs">
                期刊／會議／出處
              </Label>
              <Input
                id={`${sourceId}-container`}
                value={source.containerTitle ?? ""}
                onChange={(event) =>
                  onEdit(sourceId, { containerTitle: event.target.value })
                }
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-publisher`} className="text-xs">
                出版者
              </Label>
              <Input
                id={`${sourceId}-publisher`}
                value={source.publisher ?? ""}
                onChange={(event) =>
                  onEdit(sourceId, { publisher: event.target.value })
                }
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-doi`} className="text-xs">
                DOI
              </Label>
              <Input
                id={`${sourceId}-doi`}
                value={source.doi ?? ""}
                onChange={(event) =>
                  onEdit(sourceId, { doi: event.target.value })
                }
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-url`} className="text-xs">
                URL
              </Label>
              <Input
                id={`${sourceId}-url`}
                value={source.url ?? ""}
                onChange={(event) =>
                  onEdit(sourceId, { url: event.target.value })
                }
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-sourceCategory`} className="text-xs">
                來源類型
              </Label>
              <Select
                value={source.sourceCategory ?? "unknown"}
                onValueChange={(value) =>
                  onEdit(sourceId, { sourceCategory: value })
                }
              >
                <SelectTrigger
                  id={`${sourceId}-sourceCategory`}
                  className="h-10 bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {SOURCE_CATEGORY_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-confidence`} className="text-xs">
                可信度
              </Label>
              <Select
                value={source.confidence ?? "中"}
                onValueChange={(value) =>
                  onEdit(sourceId, { confidence: value })
                }
              >
                <SelectTrigger
                  id={`${sourceId}-confidence`}
                  className="h-10 bg-background"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_CONFIDENCE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <p className="text-xs font-medium text-foreground">可用章節</p>
              <div className="flex flex-wrap gap-3">
                {WORKFLOW_REPORT_SECTIONS.map((section) => (
                  <label
                    key={section}
                    className="flex min-h-[28px] items-center gap-2 text-xs text-muted-foreground"
                  >
                    <Checkbox
                      checked={usableSections.includes(section)}
                      onCheckedChange={(checked) =>
                        onEdit(sourceId, {
                          usableSections: toggleWorkflowSection(
                            usableSections.length
                              ? usableSections
                              : defaultUsableSections(),
                            section,
                            checked === true,
                          ),
                        })
                      }
                    />
                    <span>{section}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-reviewNotes`} className="text-xs">
                審查筆記
              </Label>
              <Textarea
                id={`${sourceId}-reviewNotes`}
                value={source.reviewNotes ?? ""}
                placeholder="例如：方法清楚，但樣本偏小"
                onChange={(event) =>
                  onEdit(sourceId, { reviewNotes: event.target.value })
                }
                className="min-h-[76px] resize-y bg-background"
              />
            </div>
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}

function rejectedReasonDistribution(
  trace: ResearchGroundingDiagnosticTrace,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const source of trace.step6_scoring) {
    if (source.finalBucket !== "rejected") continue;
    const reasons = source.rejectionReasons?.length
      ? source.rejectionReasons
      : ["rejected_without_reason"];
    for (const reason of reasons) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function TraceSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <div className="rounded-md border border-border bg-background">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-h-[38px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground"
          >
            <span>{title}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border px-3 py-3">
          {children}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function TraceJson({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/30 p-2 font-mono text-[11px] leading-5 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ResearchGroundingDiagnosticTracePanel({
  trace,
}: {
  trace: ResearchGroundingDiagnosticTrace;
}) {
  const rejectedReasons = rejectedReasonDistribution(trace);
  const rawUserTopic =
    trace.rawUserTopic ?? trace.step1_input.rawUserTopic ?? trace.originalTopic;
  const sourceCounts = {
    raw: trace.step5_normalizedSources.rawTotal,
    normalized: trace.step5_normalizedSources.normalizedTotal,
    deduped: trace.step5_normalizedSources.dedupedTotal,
    accepted: trace.step7_bucketSummary.acceptedSources,
    fallback: trace.step7_bucketSummary.fallbackReviewSources,
    manualReview: trace.step7_bucketSummary.manualReviewSources,
    rejected: trace.step7_bucketSummary.rejectedSources,
    officialBackground: trace.step7_bucketSummary.officialBackgroundSources,
    highConfidenceManual: trace.step7_bucketSummary.highConfidenceManualSources ?? 0,
  };
  const scoringPreview = trace.step6_scoring.slice(0, 10).map((source) => ({
    title: source.title,
    score: source.relevanceScore,
    bucket: source.bucket,
    bucketScore: source.bucketScore,
    quality: source.qualityScore,
    decision: source.decision ?? source.finalBucket,
    sourceUseCase: source.sourceUseCase,
    matchedEntities: source.matchedEntities,
    missingRequiredSignals: source.missingRequiredSignals,
    reason: source.rejectionReasons?.join(" / ") ?? source.scoringNotes.join(" / "),
  }));

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm"
      data-testid="grounding-diagnostic-trace"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-foreground">流程診斷</h3>
        <Badge variant="outline">{trace.step8_nextStepDecision.workflowStatus}</Badge>
        <Badge variant={trace.step8_nextStepDecision.canProceedToSourceReview ? "secondary" : "outline"}>
          {trace.step8_nextStepDecision.canProceedToSourceReview
            ? "可前往來源審查"
            : "不可前往來源審查"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">rawUserTopic</p>
          <p className="mt-1 text-foreground">{rawUserTopic}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">正規化題目</p>
          <p className="mt-1 text-foreground">{trace.step2_normalization.normalizedTopicZh}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">domain</p>
          <p className="mt-1 text-foreground">{trace.step2_normalization.detectedDomain}</p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <p className="text-muted-foreground">source funnel</p>
          <p className="mt-1 text-foreground">
            raw {sourceCounts.raw} / normalized {sourceCounts.normalized} / deduped {sourceCounts.deduped}
          </p>
        </div>
      </div>

      <TraceSection title="Developer audit trace" defaultOpen>
        <TraceJson
          value={{
            rawUserTopic,
            selectedDomain: trace.step2_normalization.detectedDomain,
            normalizedTopicZh: trace.step2_normalization.normalizedTopicZh,
            normalizedTopicEn: trace.step2_normalization.normalizedTopicEn,
            queryPlan: trace.step3_queryPlan,
            providerRuns: trace.step4_providerExecution,
            bucketSummary: trace.step7_bucketSummary,
            nextStepDecision: trace.step8_nextStepDecision,
          }}
        />
      </TraceSection>
      <TraceSection title="Topic normalization" defaultOpen>
        <TraceJson value={trace.step2_normalization} />
      </TraceSection>
      <TraceSection title="Query plan" defaultOpen>
        <TraceJson
          value={{
            selectedQueriesByProvider: trace.step3_queryPlan.selectedQueriesByProvider,
            classifiedQueries: trace.step3_queryPlan.classifiedQueries,
            bilingualQueries: trace.step3_queryPlan.bilingualQueries,
          }}
        />
      </TraceSection>
      <TraceSection title="Provider status" defaultOpen>
        <TraceJson value={trace.step4_providerExecution} />
      </TraceSection>
      <TraceSection title="Source scoring" defaultOpen>
        <TraceJson
          value={{
            counts: sourceCounts,
            bucketCounts: trace.step7_bucketSummary.bucketCounts,
            backgroundSourceNeeded: trace.step7_bucketSummary.backgroundSourceNeeded,
            missingProviderReason: trace.step7_bucketSummary.missingProviderReason,
            rejectedReasons,
            top10: scoringPreview,
          }}
        />
      </TraceSection>
      <TraceSection title="Next step decision" defaultOpen>
        <TraceJson value={trace.step8_nextStepDecision} />
      </TraceSection>
    </div>
  );
}

function SearchStepPanel({
  topic,
  originalTopic,
  displayTitle,
  reportType,
  audience,
  groundingJob,
  groundingRequestState,
  groundingError,
  message,
  sourceCount,
  searchProfile,
  onSearchProfileChange,
  hasTopic,
  onRetry,
  onNext,
  onBack,
}: {
  topic: string;
  originalTopic: string;
  displayTitle: string;
  reportType: string;
  audience: string;
  groundingJob: GroundingJob | null;
  groundingRequestState: GroundingRequestState;
  groundingError: string | null;
  message: string;
  sourceCount: number;
  searchProfile: ReportInput["researchDepth"];
  onSearchProfileChange: (value: ReportInput["researchDepth"]) => void;
  hasTopic: boolean;
  onRetry: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const status = groundingJob?.status ?? "queued";
  const isCreateFailure = groundingRequestState === "job_create_failed";
  const isPollFailure = groundingRequestState === "job_poll_failed";
  const isProviderFailure = groundingRequestState === "all_providers_failed";
  const isPipelineFailure = groundingRequestState === "pipeline_failed";
  const backendStatusLabel =
    groundingRequestState === "creating_job"
        ? GROUNDING_STATUS_LABELS.queued
        : isCreateFailure
          ? "無法建立搜尋任務"
          : isPollFailure
            ? "搜尋任務狀態讀取失敗"
            : isProviderFailure
              ? "所有已嘗試的來源服務均失敗"
              : isPipelineFailure
                ? "資料搜尋任務執行失敗"
          : GROUNDING_STATUS_LABELS[status];
  const isLoading = groundingRequestIsLoading(groundingRequestState);
  const groundingDiagnostics = groundingJob?.groundingDiagnostics as
    | GroundingPipelineDiagnosticsState
    | undefined;
  const diagnosticTrace =
    groundingJob?.diagnosticTrace ?? groundingDiagnostics?.diagnosticTrace;
  const academicRetry = groundingJob?.academicRetry ?? groundingDiagnostics?.academicRetry;
  const sourceQualitySummary =
    groundingJob?.sourceQualitySummary ?? groundingDiagnostics?.sourceQualitySummary;
  const highConfidenceCount =
    sourceQualitySummary?.academicCandidateCount ??
    groundingDiagnostics?.scholarlyRecommendedCount ??
    groundingDiagnostics?.highConfidenceCandidateCount ??
    (groundingJob?.highConfidenceCandidateSources ?? groundingJob?.candidateSources ?? []).length;
  const officialBackgroundCount =
    sourceQualitySummary?.officialBackgroundCount ??
    groundingDiagnostics?.officialBackgroundCount ??
    groundingJob?.sourceCandidates?.filter(
      (source) => source.recommendationBucket === "official_background",
    ).length ??
    0;
  const fallbackReviewCount =
    sourceQualitySummary?.fallbackReviewCount ??
    groundingDiagnostics?.fallbackReviewCount ??
    groundingJob?.fallbackReviewSources?.length ??
    0;
  const manualReviewBaseCount =
    groundingDiagnostics?.manualReviewCount ??
    groundingJob?.sourceCandidates?.filter(
      (source) => source.recommendationBucket === "manual_review",
    ).length ??
    0;
  const manualReviewCount = Math.max(manualReviewBaseCount, fallbackReviewCount);
  const rejectedCount =
    sourceQualitySummary?.rejectedCount ??
    groundingDiagnostics?.rejectedCount ??
    groundingJob?.rejectedSources?.length ??
    0;
  const autoAcceptedSourceCount =
    diagnosticTrace?.step7_bucketSummary.acceptedSources ??
    groundingJob?.acceptedSources?.length ??
    0;
  const isAcademicRetrying =
    groundingJob?.status === "academic_retrying" ||
    groundingDiagnostics?.finalUiState === "academic_retrying" ||
    academicRetry?.active === true;
  const isSourceReviewNeedsManual =
    groundingJob?.status === "source_review_needs_manual" ||
    groundingDiagnostics?.finalUiState === "source_review_needs_manual";
  const isSourceReviewReady =
    groundingJob?.status === "source_review_ready" ||
    groundingDiagnostics?.finalUiState === "source_review_ready";
  const jobReviewableSourceCount =
    groundingJob?.sourceCandidates?.filter(
      (source) => source.reviewStatus !== "rejected",
    ).length ?? 0;
  const reviewableSourceCount = Math.max(
    jobReviewableSourceCount,
    groundingDiagnostics?.candidateCount ?? 0,
    highConfidenceCount + officialBackgroundCount + manualReviewCount,
    groundingJob ? 0 : sourceCount,
  );
  const canReview =
    !isAcademicRetrying &&
    (groundingDiagnostics?.canProceedToSourceReview ??
      reviewableSourceCount >= MIN_REVIEWABLE_SOURCE_COUNT) &&
    groundingJob?.status !== "no_sources_after_fallback" &&
    groundingJob?.academicSafetyReview?.allowedUse !== "block_actionable_output";
  const rawTotal =
    diagnosticTrace?.step5_normalizedSources.rawTotal ??
    groundingDiagnostics?.rawProviderCount ??
    Object.values(groundingDiagnostics?.rawProviderCounts ?? {}).reduce(
      (sum, count) => sum + count,
      0,
    );
  const nextStepWorkflowStatus =
    diagnosticTrace?.step8_nextStepDecision.workflowStatus;
  const uiWorkflowStatus =
    isLoading
      ? "searching"
      : isCreateFailure || isPollFailure || isProviderFailure || isPipelineFailure
        ? "failed"
        : canReview
          ? reviewableSourceCount >= 8
            ? "ready_for_review"
            : "partial"
          : rawTotal > 0
            ? "needs_query_revision"
            : nextStepWorkflowStatus === "failed" || nextStepWorkflowStatus === "empty"
              ? "failed"
              : "needs_query_revision";
  const statusLabelMap: Record<string, string> = {
    searching: "搜尋中",
    ready_for_review: "已找到可審查來源",
    partial: "來源偏少但可審查",
    needs_query_revision: "有結果但不足",
    failed: "資料搜尋失敗",
  };
  const statusLabel =
    statusLabelMap[uiWorkflowStatus] ??
    (canReview ? "已找到可審查來源" : backendStatusLabel);
  const groundingWarnings = groundingJob?.warnings ?? [];
  const rateLimitWarning = groundingWarnings.some((warning) =>
    /429|rate limit|too many requests|限流|查詢限制/i.test(warning),
  );
  const isSearchingFallback =
    groundingJob?.status === "searching_fallback" ||
    groundingDiagnostics?.finalUiState === "searching_fallback";
  const isNoSourcesAfterFallback =
    groundingJob?.status === "no_sources_after_fallback" ||
    groundingDiagnostics?.finalUiState === "no_sources_after_fallback";
  const userFacingStatusMessage =
    isCreateFailure
      ? "無法建立搜尋任務；尚未開始呼叫 OpenAlex 或 Crossref。請確認 API 連線後重新搜尋。"
      : isPollFailure
        ? "搜尋任務狀態讀取失敗；任務可能仍在執行，請稍後重新讀取或重新搜尋。"
        : isProviderFailure
          ? "所有已嘗試的來源服務均失敗，請查看 provider diagnostics 後重試；逾時不會被視為 0 筆結果。"
          : isPipelineFailure
            ? groundingError ?? "搜尋任務執行失敗，請稍後重試。"
      : isAcademicRetrying
        ? "正在延伸學術查詢，重新搜尋期刊、論文與 DOI 來源..."
      : isSearchingFallback
        ? "系統正在改用更精確的學術查詢重新搜尋……"
      : isSourceReviewNeedsManual
        ? `已自動嘗試 ${academicRetry?.count ?? 0} 輪學術延伸查詢，但學術來源仍不足；請在來源審查中補充或手動調整查詢。`
      : isNoSourcesAfterFallback
        ? "所有自動 fallback 查詢完成後，仍未取得可審查來源。"
      : canReview && reviewableSourceCount >= READY_REVIEWABLE_SOURCE_COUNT
        ? `找到 ${reviewableSourceCount} 筆待審來源，可進入來源審查。`
      : canReview
        ? `已找到 ${reviewableSourceCount} 筆可審查來源；來源偏少，建議重新搜尋，但可先進入來源審查。`
      : isSourceReviewReady || highConfidenceCount >= 3
        ? `已找到 ${highConfidenceCount} 筆學術候選來源，可進入來源審查。`
      : sourceCount > 0 || manualReviewCount > 0
        ? `已找到 ${Math.max(sourceCount, manualReviewCount)} 筆可審查來源；來源較少，建議補充。`
      : message || "系統已完成本次資料搜尋整理。";
  const selectedProfile =
    RESEARCH_DEPTH_OPTIONS.find((option) => option.value === searchProfile) ??
    RESEARCH_DEPTH_OPTIONS[1]!;
  const providerProgress = groundingDiagnostics?.providerProgress ?? [];
  const providerStatusLabel = (status: NonNullable<GroundingPipelineDiagnosticsState["providerProgress"]>[number]["status"]) => {
    switch (status) {
      case "searching":
        return "搜尋中";
      case "success":
        return "success";
      case "empty":
        return "empty";
      case "returned":
        return "已回傳";
      case "timeout":
        return "timeout";
      case "background":
        return "背景補強中";
      case "error":
      default:
        return "error";
    }
  };
  const providerProgressLabel =
    providerProgress.length > 0
      ? providerProgress
          .slice(0, 3)
          .map((provider) => {
            const rawCount = provider.rawResultsCount ?? provider.resultCount;
            const queryCount = provider.queryCount ?? (provider.query ? 1 : 0);
            return `${provider.provider}：${providerStatusLabel(provider.status)}，${queryCount} queries，raw ${rawCount} / normalized ${provider.normalizedCount ?? provider.resultCount}`;
          })
          .join(" / ")
      : isCreateFailure
        ? "尚未開始 provider 搜尋（任務建立失敗）"
        : isPollFailure
          ? "尚未取得 provider 狀態（輪詢失敗）"
          : groundingRequestState === "creating_job"
            ? "正在建立搜尋任務，provider 尚未開始"
            : "尚未取得 provider 執行紀錄";
  const providerHealthLabel =
    groundingDiagnostics?.providerHealth
      ?.filter((health) => health.status !== "healthy")
      .map((health) => {
        if (health.provider === "openalex" && health.status === "degraded") {
          return "OpenAlex：暫時不穩，已改用備援來源";
        }
        if (health.provider === "crossref" && health.lastErrorCode === "timeout") {
          return "Crossref：逾時，稍後可重新補強";
        }
        const label =
          health.provider === "semantic_scholar"
            ? "Semantic Scholar"
            : health.provider === "openalex"
              ? "OpenAlex"
              : health.provider === "crossref"
                ? "Crossref"
                : "CORE";
        return `${label}：${health.status}`;
      })
      .join(" / ") ?? null;
  const cacheLabel =
    groundingDiagnostics?.cacheStatus === "stale_hit_refreshing"
      ? "stale hit / refreshing"
      : groundingDiagnostics?.cacheStatus === "refresh_failed_using_stale"
        ? "refresh failed / using stale"
        : groundingDiagnostics?.cacheStatus === "write_failed"
          ? "write failed"
          : groundingDiagnostics?.cacheStatus === "hit" || groundingDiagnostics?.cacheHit === true
            ? "hit"
            : groundingDiagnostics?.cacheStatus === "miss" || groundingDiagnostics?.cacheHit === false
              ? "miss"
              : "miss";

  return (
    <section
      className="mx-auto max-w-4xl space-y-4"
      data-testid="generator-search-step"
    >
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <Badge variant="secondary" className="w-fit">
            步驟 2
          </Badge>
          <Button
            type="button"
            variant="outline"
            className="min-h-[40px]"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> 上一步
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3 lg:col-span-2">
            <span className="block text-xs font-medium text-muted-foreground">
              搜尋主題
            </span>
            <p className="mt-1 font-medium text-foreground">{topic || "尚未設定主題"}</p>
            {originalTopic && originalTopic !== topic ? (
              <p className="mt-1 text-xs text-muted-foreground">
                原始輸入：{originalTopic}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                系統會依你選擇的研究領域搜尋可作為主要依據的來源。
              </p>
            )}
            {displayTitle ? (
              <p className="mt-2 text-xs text-muted-foreground">
                顯示主題：{displayTitle}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
            <span className="block text-xs font-medium text-muted-foreground">
              搜尋狀態
            </span>
            <p className="mt-1 text-foreground">{statusLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {reportType}・{audience}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 text-sm lg:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="search-profile">搜尋深度</Label>
            <Select
              value={searchProfile}
              onValueChange={(value) =>
                onSearchProfileChange(value as ReportInput["researchDepth"])
              }
            >
              <SelectTrigger id="search-profile" className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESEARCH_DEPTH_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">預估時間</p>
              <p className="mt-1 text-foreground">
                {groundingDiagnostics?.estimatedTime ?? selectedProfile.estimatedTime}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">provider progress</p>
              <p className="mt-1 line-clamp-2 text-foreground">
                {providerProgressLabel}
              </p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">cache</p>
              <p className="mt-1 text-foreground">{cacheLabel}</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-2">
              <p className="text-xs text-muted-foreground">early stop</p>
              <p className="mt-1 truncate text-foreground">
                {groundingDiagnostics?.earlyStopReason ?? "尚未觸發"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div
          className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-12 text-center shadow-sm"
          data-testid="sources-loading"
        >
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-9 w-9 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            {isAcademicRetrying
              ? "正在延伸學術查詢"
              : isSearchingFallback
                ? "正在改用更精確的學術查詢"
                : "正在搜尋來源"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {isAcademicRetrying
              ? "正在重新搜尋期刊、論文與 DOI 來源；系統會自動完成 retry，不需要手動點擊。"
              : isSearchingFallback
              ? "系統正在自動執行推薦查詢、英文學術查詢與放寬條件搜尋，不需要手動點擊。"
              : "ResearchForge 正在為你搜尋相關學術資料與文獻，並整理成可審查來源。"}
          </p>
          <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/70 [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={groundingJob?.status === "completed" ? "default" : "secondary"}>
                {statusLabel}
              </Badge>
              <Badge variant={rawTotal > 0 ? "secondary" : "outline"}>
                原始結果 {rawTotal} 筆
              </Badge>
              <Badge variant={highConfidenceCount > 0 ? "secondary" : "outline"}>
                候選來源 {highConfidenceCount} 筆
              </Badge>
              <Badge variant={officialBackgroundCount > 0 ? "secondary" : "outline"}>
                官方背景來源 {officialBackgroundCount} 筆
              </Badge>
              <Badge variant={manualReviewCount > 0 ? "secondary" : "outline"}>
                待人工審查 {manualReviewCount} 筆
              </Badge>
              <Badge variant="outline">
                已排除 {rejectedCount} 筆
              </Badge>
              <Badge variant={autoAcceptedSourceCount > 0 ? "secondary" : "outline"}>
                已接受 {autoAcceptedSourceCount} 筆
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {groundingError ||
                groundingDiagnostics?.userVisibleStatus ||
                userFacingStatusMessage}
            </p>
            {isSourceReviewNeedsManual ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
                已自動嘗試 {academicRetry?.count ?? 0} 輪學術延伸查詢，但學術來源仍不足。已找到的官方背景或待審來源會保留供你人工審查與補充。
              </div>
            ) : null}
            {canReview && autoAcceptedSourceCount === 0 ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
                目前沒有足夠可直接支撐正文的來源，請先審查候選來源或重新補查。
              </div>
            ) : null}
            {groundingDiagnostics?.readinessWarnings?.length ? (
              <ul className="mt-3 space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {groundingDiagnostics.readinessWarnings.slice(0, 3).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {providerProgress.length ? (
              <div className="mt-4 overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">provider</th>
                      <th className="px-3 py-2 font-medium">status</th>
                      <th className="px-3 py-2 font-medium">queries</th>
                      <th className="px-3 py-2 font-medium">raw / normalized</th>
                      <th className="px-3 py-2 font-medium">accepted / candidate / fallback / rejected</th>
                      <th className="px-3 py-2 font-medium">duration</th>
                      <th className="px-3 py-2 font-medium">error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerProgress.map((provider) => (
                      <tr key={`${provider.provider}-${provider.query ?? "all"}`} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">{provider.provider}</td>
                        <td className="px-3 py-2 text-foreground">{providerStatusLabel(provider.status)}</td>
                        <td className="px-3 py-2 text-foreground">{provider.queryCount ?? (provider.query ? 1 : 0)}</td>
                        <td className="px-3 py-2 text-foreground">
                          {provider.rawResultsCount ?? provider.resultCount} / {provider.normalizedCount ?? provider.resultCount}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {provider.acceptedCount ?? 0} / {provider.candidateCount ?? 0} / {provider.fallbackReviewCount ?? 0} / {provider.rejectedCount ?? 0}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {provider.durationMs ?? provider.latencyMs ?? 0} ms
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground">
                          {provider.errorMessage ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {providerHealthLabel ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {providerHealthLabel}
              </p>
            ) : null}
            {rateLimitWarning ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
                部分資料來源暫時限流，已改用其他查詢來源或保留部分結果。
              </div>
            ) : null}
            {groundingJob?.academicSafetyReview?.userFacingNotice ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-900">
                {groundingJob.academicSafetyReview.userFacingNotice}
              </div>
            ) : null}
            {groundingJob?.academicSafetyReview?.allowedUse === "block_actionable_output" ? (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm leading-6 text-destructive">
                此主題已轉為安全模式，不會進入一般報告生成；請改寫成風險、防治、政策或教育研究角度。
              </div>
            ) : null}
            {isAcademicRetrying || isSearchingFallback ? (
              <div className="mt-4 rounded-md border border-primary/20 bg-primary/5 px-3 py-3 text-sm leading-6 text-primary">
                {isAcademicRetrying
                  ? "正在延伸學術查詢，重新搜尋期刊、論文與 DOI 來源..."
                  : "系統正在改用更精確的學術查詢重新搜尋……"}
              </div>
            ) : null}
            {isNoSourcesAfterFallback ? (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm leading-6 text-amber-950">
                <p className="font-medium">人工救援選項</p>
                <p className="mt-1">
                  系統已完成所有自動 fallback rounds，仍未取得可審查來源。你可以改寫主題或手動選擇較寬鬆的搜尋方式。
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(groundingDiagnostics?.fallbackAttempts?.map((attempt) => attempt.queryUsed) ??
                    groundingDiagnostics?.triedQueries ??
                    groundingDiagnostics?.enQueries ??
                    [])
                    .slice(0, 6)
                    .map((query, index) => (
                      <Badge key={`${query}-${index}`} variant="outline" className="bg-background/80">
                        {query}
                      </Badge>
                    ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="min-h-[38px] border-amber-300 bg-background" onClick={onBack}>
                    修改搜尋主題
                  </Button>
                  <Button type="button" variant="outline" className="min-h-[38px] border-amber-300 bg-background" onClick={onRetry} disabled={!hasTopic}>
                    手動套用推薦查詢
                  </Button>
                  <Button type="button" variant="outline" className="min-h-[38px] border-amber-300 bg-background" onClick={onRetry} disabled={!hasTopic}>
                    降低搜尋深度
                  </Button>
                  <Button type="button" variant="outline" className="min-h-[38px] border-amber-300 bg-background" onClick={onRetry} disabled={!hasTopic}>
                    改用一般背景資料
                  </Button>
                  <Button type="button" variant="outline" className="min-h-[38px] border-amber-300 bg-background" onClick={onBack}>
                    返回上一步
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {diagnosticTrace ? (
            <ResearchGroundingDiagnosticTracePanel trace={diagnosticTrace} />
          ) : null}

          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-[42px]"
              onClick={onBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> 上一步
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[42px]"
              onClick={onRetry}
              disabled={!hasTopic}
              data-testid="button-search-sources"
            >
              <Search className="mr-2 h-4 w-4" />
              {isSourceReviewNeedsManual
                ? "手動重新搜尋學術來源"
                : "重新搜尋"}
            </Button>
            <Button
              type="button"
              className="min-h-[42px]"
              onClick={onNext}
              disabled={!canReview}
            >
              前往來源審查 <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function SourceManagePanel({
  sources,
  onReview,
  onEdit,
  topic,
  recommendedAcceptedSourceCount,
  pipelineStats,
  onAcceptAll,
  showTechnicalDetails,
}: {
  sources: SourceRecord[];
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
  topic: string;
  recommendedAcceptedSourceCount: number;
  pipelineStats: SourcePipelineStats | null;
  onAcceptAll: () => void;
  showTechnicalDetails: boolean;
}) {
  const [activeTab, setActiveTab] = useState<SourceReviewTab>("all");
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const previousReviewStates = useRef<Map<string, SourceReviewState>>(
    new Map(),
  );
  const counts = sourceReviewCounts(sources);
  const primarySources = primaryCandidateSources(sources);
  const secondarySources = secondaryCandidateSources(sources);
  const reviewableSources = visibleReviewCandidateSources(sources);
  const acceptedReadiness = generationReadiness(acceptedSourceRecords(sources));
  const visibleReviewCount = reviewableSources.length;
  const visibleSources =
    activeTab === "all"
      ? sources
      : sourcesForReviewTab(sources, activeTab);
  const activeTabLabel =
    SOURCE_REVIEW_TABS.find((tab) => tab.value === activeTab)?.label ?? "來源";
  const primaryPendingCount = primarySources.length;
  const secondaryPendingCount = secondarySources.length;
  const stats: SourcePipelineStats = pipelineStats ?? {
    rawResults: sources.length,
    providerGroups: 0,
    successfulProviderGroups: 0,
    dedupedResults: sources.length,
    rejectedResults: counts.rejected,
    candidateResults: visibleReviewCount,
    displayedResults: sources.length,
    primaryCandidateResults: primaryPendingCount,
    primaryCandidates: primaryPendingCount,
    secondaryCandidates: secondaryPendingCount,
    lowRelevance: lowRelevanceCandidateSources(sources).length,
    rejected: counts.rejected,
  };

  useEffect(() => {
    const nextReviewStates = new Map<string, SourceReviewState>();

    setExpandedSourceIds((current) => {
      const nextExpanded = new Set(current);
      const activeIds = new Set<string>();

      for (const source of sources) {
        const key = source.id || sourceRecordKey(source);
        const nextState = sourceReviewState(source);
        const previousState = previousReviewStates.current.get(key);
        activeIds.add(key);
        nextReviewStates.set(key, nextState);

        if (
          previousState === undefined &&
          nextState === "pending" &&
          source.relevanceLevel === "primary"
        ) {
          nextExpanded.add(key);
        }

        if (previousState !== undefined && previousState !== nextState) {
          if (nextState === "pending") {
            nextExpanded.add(key);
          } else {
            nextExpanded.delete(key);
          }
        }
      }

      for (const sourceId of Array.from(nextExpanded)) {
        if (!activeIds.has(sourceId)) nextExpanded.delete(sourceId);
      }

      return Array.from(nextExpanded);
    });

    previousReviewStates.current = nextReviewStates;
  }, [sources]);

  const setSourceExpanded = (sourceId: string, open: boolean) => {
    setExpandedSourceIds((current) => {
      if (open)
        return current.includes(sourceId) ? current : [...current, sourceId];
      return current.filter((item) => item !== sourceId);
    });
  };

  const handleReview = (sourceId: string, reviewState: SourceReviewState) => {
    setSourceExpanded(sourceId, reviewState === "pending");
    onReview(sourceId, reviewState);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">研究來源</h2>
          <p className="text-sm text-muted-foreground">
            先看每篇文章的主旨摘要與採用建議，再決定是否納入來源池；需要時可展開引用資料。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[34px]"
            onClick={onAcceptAll}
            disabled={selectableCandidateSources(sources).length === 0}
          >
            全選可用來源
          </Button>
          <Badge
            variant={
              counts.accepted >= recommendedAcceptedSourceCount
                ? "secondary"
              : "outline"
            }
          >
            最低 3 筆 / 建議 {recommendedAcceptedSourceCount} 筆
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-6">
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            已搜尋
          </p>
          <p className="mt-1 text-foreground">
            {stats.rawResults} 筆
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            篩選後候選
          </p>
          <p className="mt-1 text-foreground">
            {stats.candidateResults} 筆
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            顯示候選
          </p>
          <p className="mt-1 text-foreground">
            {stats.displayedResults} 筆
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            已接受
          </p>
          <p className="mt-1 text-foreground">
            {acceptedReadiness.acceptedUsableSourcesCount} 筆
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            學術主要來源
          </p>
          <p className="mt-1 text-foreground">
            {acceptedReadiness.scholarlySourcesCount} 筆
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            官方背景來源
          </p>
          <p className="mt-1 text-foreground">
            {acceptedReadiness.officialBackgroundSourcesCount ||
              acceptedReadiness.reliableBackgroundSourcesCount} 筆
          </p>
        </div>
      </div>

      {sources.length > 0 && (
        <div
          className="max-h-[620px] space-y-3 overflow-y-auto pr-1"
          data-testid="sources-list"
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as SourceReviewTab)}
          >
            <TabsList className="h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="all" data-testid="tab-sources-all">
                全部 ({counts.all})
              </TabsTrigger>
              <TabsTrigger value="accepted" data-testid="tab-sources-accepted">
                已接受 ({counts.accepted})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-sources-pending">
                推薦來源 ({primaryPendingCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {visibleSources.length > 0 ? (
            <div
              className="space-y-3"
              data-testid={`sources-list-${activeTab}`}
            >
              {visibleSources.map((source) => {
                const key = source.id || sourceRecordKey(source);
                return (
                  <SourceReviewCard
                    key={key}
                    source={source}
                    isExpanded={expandedSourceIds.includes(key)}
                    onExpandedChange={(open) => setSourceExpanded(key, open)}
                    onReview={handleReview}
                    onEdit={onEdit}
                    topic={topic}
                    showTechnicalDetails={showTechnicalDetails}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              {activeTab === "all" && sources.length > 0
                ? "目前沒有找到足夠相關來源，但已保留原始結果供檢查；請重新搜尋或調整關鍵詞。"
                : `${activeTabLabel}目前沒有來源。`}
            </div>
          )}
          {secondarySources.length > 0 && (
            <Collapsible>
              <div className="rounded-md border border-border bg-muted/10 px-3 py-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-[40px] w-full items-center justify-between gap-2 text-left"
                  >
                      <span>
                        <span className="block text-sm font-medium text-foreground">
                        待人工審查來源 ({secondarySources.length})
                        </span>
                        <span className="block text-xs text-muted-foreground">
                        這些來源信心較低或 metadata 較少；確認相關後可手動接受。
                        </span>
                      </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <ul
                    className="space-y-2 text-xs text-muted-foreground"
                    data-testid="sources-list-secondary-collapsed"
                  >
                    {secondarySources.slice(0, 5).map((source) => (
                      <li
                        key={source.id || sourceRecordKey(source)}
                        className="rounded-md border border-border bg-background px-3 py-2"
                      >
                        <span className="font-medium text-foreground">
                          {source.title || "標題待確認"}
                        </span>
                        <span className="ml-2">
                          {source.sourceRelevanceReasonZhTw ||
                            "與主題有延伸關聯，但不作為主要證據候選。"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}

function TopicStepPanel({
  input,
  topicValue,
  parsedInput,
  expansions,
  topicExpansionDiagnostics,
  topicExpansionMessage,
  topicExpansionStatus,
  topicWorkflowStatus,
  titleSemanticComparison,
  topicDiagnosticsOpen,
  detectedCategory,
  needsClarification,
  autoSearchEnabled,
  displayTitle,
  selectedDirection,
  selectedDomain,
  recommendedDomain,
  workspaceResume,
  researchDepthLabel,
  canContinueToSearch,
  onInputChange,
  onTopicChange,
  onTopicInputKeyDown,
  onTopicCompositionStart,
  onTopicCompositionEnd,
  onApplyExpansion,
  onRerunWithExpansion,
  onUseParsedTopicOption,
  onDomainChange,
  onTopicDiagnosticsOpenChange,
  onNext,
  onClearWorkspace,
}: {
  input: ReportInput;
  topicValue: string;
  parsedInput: ParsedResearchInput | null;
  expansions: TopicRunExpansionCard[];
  topicExpansionDiagnostics: TopicExpansionDiagnostics | null;
  topicExpansionMessage: string | null;
  topicExpansionStatus: "idle" | "loading" | "done" | "timeout-fallback" | "error";
  topicWorkflowStatus: TopicWorkflowState;
  titleSemanticComparison: TitleSemanticComparison | null;
  topicDiagnosticsOpen: boolean;
  detectedCategory: TopicCategory | null;
  needsClarification: boolean;
  autoSearchEnabled: boolean;
  displayTitle: string;
  selectedDirection: ResearchDirection | null;
  selectedDomain: ResearchDomain | null;
  recommendedDomain: ResearchDomain | null;
  workspaceResume: WorkspaceResumeState | null;
  researchDepthLabel: string;
  canContinueToSearch: boolean;
  onInputChange: (key: ReportInputStringKey, value: string) => void;
  onTopicChange: (value: string) => void;
  onTopicInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onTopicCompositionStart: () => void;
  onTopicCompositionEnd: () => void;
  onApplyExpansion: (card: TopicRunExpansionCard) => void;
  onRerunWithExpansion: (card: TopicRunExpansionCard) => void;
  onUseParsedTopicOption: (option: ParsedResearchInput["topicOptions"][number]) => void;
  onDomainChange: (domain: ResearchDomain) => void;
  onTopicDiagnosticsOpenChange: (open: boolean) => void;
  onNext: () => void;
  onClearWorkspace: () => void;
}) {
  const AUTO = "自動偵測";
  const visibleTopicValue = topicValue;
  const hasTopic = Boolean(visibleTopicValue.trim());
  const isExpandingTopic = topicExpansionStatus === "loading";
  const expansionTimedOut =
    expansions.length === 0 &&
    (topicExpansionStatus === "timeout-fallback" ||
      topicExpansionDiagnostics?.provider_status === "timeout");
  const candidateCount = expansions.length;
  const selectedDomainLabel = selectedDomain ? researchDomainLabel(selectedDomain) : null;
  const recommendedDomainLabel = recommendedDomain ? researchDomainLabel(recommendedDomain) : null;
  const domainMessage = selectedDomainLabel
    ? `目前研究領域：${selectedDomainLabel}`
    : recommendedDomainLabel
      ? `系統建議領域：${recommendedDomainLabel}，你也可以手動改選。`
      : hasTopic
        ? "可先選擇研究領域，讓查詢分流與資料搜尋更精準。"
        : "可先選擇研究領域，讓查詢分流與資料搜尋更精準。";
  const workflowBadgeVariant =
    topicWorkflowStatus === "invalid" || topicWorkflowStatus === "error"
      ? "destructive"
      : topicWorkflowStatus === "ready" || topicWorkflowStatus === "sensitive_research_only"
        ? "secondary"
        : "outline";
  const searchDisabledHint = !hasTopic
    ? "請先輸入研究主題。"
    : topicWorkflowStatus === "invalid"
      ? topicExpansionMessage ?? "請先改成可辨識的研究主題。"
    : !selectedDirection && !selectedDomain
      ? "請先選擇一個研究領域，系統才會開始搜尋資料。"
      : "請確認主題內容後再開始搜尋。";
  const [directionChooserOpen, setDirectionChooserOpen] = useState(true);

  useEffect(() => {
    setDirectionChooserOpen(!selectedDirection);
  }, [selectedDirection]);

  return (
    <section className="mx-auto max-w-3xl" data-testid="generator-topic-step">
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="secondary" className="mb-2">
              步驟 1
            </Badge>
            <h2 className="text-xl font-semibold tracking-normal text-foreground">
              設定主題
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant={workflowBadgeVariant}>
                {workflowStatusLabel(topicWorkflowStatus)}
              </Badge>
              <Badge variant="outline">
                {selectedDomain ? "領域已選擇" : "請選擇領域"}
              </Badge>
            </div>
          </div>
          {workspaceResume && <Badge variant="outline">工作區續編</Badge>}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic">
              報告主題 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="topic"
              placeholder="例如：豬在農業生產與生態系統中的角色與價值"
              value={visibleTopicValue}
              onChange={(e) => onTopicChange(e.target.value)}
              onKeyDown={onTopicInputKeyDown}
              onCompositionStart={onTopicCompositionStart}
              onCompositionEnd={onTopicCompositionEnd}
              data-testid="input-topic"
              className="h-11"
            />
            {selectedDirection ? (
              <div
                className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-5 text-primary"
                data-testid="selected-direction-message"
              >
                {selectedDomainLabel
                  ? `已根據${selectedDomainLabel}領域建立查詢輔助方向；原始題目會保持不變。`
                  : `已選擇查詢輔助方向：${selectedDirection.researchQuestionZh}`}
              </div>
            ) : null}
            {topicWorkflowStatus === "sensitive_research_only" && !selectedDirection ? (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                data-testid="topic-sensitive-message"
              >
                此主題將限制於公共安全、歷史、政策、健康風險或學術分析角度。
              </div>
            ) : null}
            {topicWorkflowStatus === "needs_disambiguation" && expansions.length > 0 ? (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
                data-testid="topic-clarification-message"
              >
                請先選擇研究領域，系統會依領域開始搜尋資料。
              </div>
            ) : null}
            {topicWorkflowStatus === "invalid" && topicExpansionMessage ? (
              <div
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"
                data-testid="topic-invalid-message"
              >
                {topicExpansionMessage}
              </div>
            ) : null}
            {expansionTimedOut && (
              <div
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
                data-testid="topic-expansion-timeout"
              >
                研究方向整理逾時，請稍後再試。
              </div>
            )}
            {!isExpandingTopic &&
              !selectedDirection &&
              expansions.length === 0 &&
              (topicExpansionDiagnostics || topicExpansionMessage) &&
              topicWorkflowStatus !== "invalid" &&
              topicExpansionStatus !== "idle" && (
                <div
                  className="rounded-md border border-dashed border-border bg-background/80 px-3 py-2 text-xs leading-5 text-muted-foreground"
                  data-testid="topic-expansion-empty"
                >
                  {topicExpansionMessage ??
                    (topicExpansionStatus === "error"
                      ? "研究方向整理失敗，請稍後再試。"
                      : "無法辨識有效題目，請改用具體且有語意的主題。")}
                  {import.meta.env.DEV && topicExpansionDiagnostics ? (
                    <span className="ml-2">
                      provider={topicExpansionDiagnostics.provider_status}
                      {topicExpansionDiagnostics.fallbackUsed ? " / fallback" : ""}
                    </span>
                  ) : null}
                </div>
              )}

            <Collapsible
              open={!selectedDirection || directionChooserOpen}
              onOpenChange={setDirectionChooserOpen}
            >
              {selectedDirection ? (
                <div className="rounded-md border border-border bg-muted/20">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left"
                      data-testid="button-direction-chooser-toggle"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-foreground">
                          研究方向選項已收合
                        </span>
                        <span className="block text-xs leading-5 text-muted-foreground">
                          目前使用此方向作為查詢輔助：{selectedDirection.researchQuestionZh}。需要更換時可展開。
                        </span>
                      </span>
                      {directionChooserOpen ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                </div>
              ) : null}
              <CollapsibleContent className="space-y-3 pt-0 data-[state=open]:pt-3">
                <div
                  className="space-y-3 rounded-md border border-border bg-muted/20 p-3"
                  data-testid="research-domain-section"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      選擇研究領域
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      這四個按鈕會指定資料查詢領域，系統會依選擇搜尋主要來源。
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {RESEARCH_DOMAIN_OPTIONS.map((domain) => {
                      const selected = selectedDomain === domain.id;
                      const recommended = !selectedDomain && recommendedDomain === domain.id;
                      return (
                        <button
                          key={domain.id}
                          type="button"
                          onClick={() => onDomainChange(domain.id)}
                          className={cn(
                            "min-h-[136px] rounded-md border bg-background p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                            selected
                              ? "border-orange-500 bg-orange-50 text-orange-950 shadow-sm"
                              : "border-border hover:border-orange-300 hover:bg-orange-50/40",
                          )}
                          aria-pressed={selected}
                          data-testid={`research-domain-${domain.id}`}
                        >
                          <div className="flex min-h-[24px] items-start justify-between gap-2">
                            <span className="text-sm font-semibold leading-5 text-foreground">
                              {domain.label}
                            </span>
                            {selected ? (
                              <Badge className="bg-orange-500 text-white hover:bg-orange-500">
                                已選擇
                              </Badge>
                            ) : recommended ? (
                              <Badge variant="outline" className="border-orange-300 text-orange-700">
                                建議
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-3 text-xs leading-5 text-muted-foreground">
                            {domain.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={cn(
                      "rounded-md border px-3 py-2 text-xs leading-5",
                      selectedDomain
                        ? "border-orange-200 bg-orange-50 text-orange-800"
                        : "border-dashed border-border bg-background text-muted-foreground",
                    )}
                    data-testid="research-domain-message"
                  >
                    {domainMessage}
                  </p>
                </div>

                {expansions.length > 0 ? (
                  <div
                    className="space-y-2 rounded-md border border-border bg-background p-3"
                    data-testid="research-direction-suggestions"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        研究方向
                      </h3>
                      <Badge variant="outline">
                        已預設第 1 個
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {expansions.slice(0, 3).map((card, index) => {
                        const selected = selectedDirection?.id === card.researchDirection.id;
                        return (
                          <button
                            key={card.researchDirection.id}
                            type="button"
                            onClick={() => onApplyExpansion(card)}
                            className={cn(
                              "w-full rounded-md border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                              selected
                                ? "border-primary bg-primary/5 text-primary"
                                : "border-border bg-card hover:border-primary/40",
                            )}
                            aria-pressed={selected}
                            data-testid={`research-direction-${index + 1}`}
                          >
                            <span className="block text-sm font-medium">
                              {card.researchDirection.displayTitleZh}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {card.researchDirection.researchQuestionZh}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {workspaceResume && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={onClearWorkspace}
                  data-testid="button-clear-form"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> 清除工作區來源
                </Button>
              )}
            </div>
            <Button
              type="button"
              size="lg"
              className="min-h-[46px]"
              disabled={!canContinueToSearch}
              onClick={onNext}
              aria-describedby={!canContinueToSearch ? "search-disabled-hint" : undefined}
            >
              {selectedDirection || selectedDomain ? "開始搜尋研究資料" : "請先選擇研究領域"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {!canContinueToSearch ? (
              <p
                id="search-disabled-hint"
                className="text-xs leading-5 text-muted-foreground sm:text-right"
                data-testid="search-disabled-hint"
              >
                {searchDisabledHint}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function ManageStepPanel({
  sources,
  hasWorkspaceTopicMismatch,
  researchDepth,
  recommendedAcceptedSourceCount,
  acceptedCount,
  canGenerateReport,
  blockingReason,
  pipelineStats,
  onBack,
  onNext,
  onReview,
  onEdit,
  topic,
  onAcceptAll,
  showTechnicalDetails,
}: {
  sources: SourceRecord[];
  hasWorkspaceTopicMismatch: boolean;
  researchDepth: ReportInput["researchDepth"];
  recommendedAcceptedSourceCount: number;
  acceptedCount: number;
  canGenerateReport: boolean;
  blockingReason: string | null;
  pipelineStats: SourcePipelineStats | null;
  onBack: () => void;
  onNext: () => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
  topic: string;
  onAcceptAll: () => void;
  showTechnicalDetails: boolean;
}) {
  const sourceQualityReadiness = generationReadiness(
    acceptedSourceRecords(sources),
    researchDepth,
  );
  const canProceedToGenerate = canGenerateReport && !hasWorkspaceTopicMismatch;
  const usableAcceptedSourceCount = sourceQualityReadiness.acceptedUsableSourcesCount;
  const sourceGateWarning = blockingReason
    ? blockingReason
    : usableAcceptedSourceCount < 3
      ? `目前已採用來源 ${acceptedCount} 筆，建議至少 3 筆後再生成，citation 與結論會更穩定。`
      : sourceQualityReadiness.lowQualityAcceptedCount > 0
        ? "目前接受的來源仍混有低相關資料，建議優先保留與主題直接相關的來源。"
        : sourceQualityReadiness.warning;

  return (
    <section
      className="mx-auto max-w-5xl space-y-4"
      data-testid="generator-manage-step"
    >
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {sources.length > 0 ? (
          <SourceManagePanel
            sources={sources}
            onReview={onReview}
            onEdit={onEdit}
            topic={topic}
            recommendedAcceptedSourceCount={recommendedAcceptedSourceCount}
            pipelineStats={pipelineStats}
            onAcceptAll={onAcceptAll}
            showTechnicalDetails={showTechnicalDetails}
          />
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <BookOpen className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              尚無候選來源
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              請先回到搜尋來源階段，找到來源後再進行管理。
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          className="min-h-[42px]"
          onClick={onBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 上一步：搜尋來源
        </Button>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          {sourceGateWarning && (
            <p className="max-w-md rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-800">
              {sourceGateWarning}
            </p>
          )}
          <Button
            type="button"
            className="min-h-[42px]"
            onClick={onNext}
            disabled={!canProceedToGenerate}
          >
            下一步：生成報告 <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}

function GenerateStepPanel({
  acceptedCount,
  acceptedSources,
  researchDepth,
  recommendedAcceptedSourceCount,
  readiness,
  sectionSufficiency,
  limitedReadableSourceWarning,
  canGenerateReport,
  blockingReason,
  isGenerating,
  generateButtonLabel,
  generateStatus,
  generateErrorMessage,
  llmStatus,
  presentation,
  onPresentationChange,
  onGenerate,
  onBack,
}: {
  acceptedCount: number;
  acceptedSources: SourceRecord[];
  researchDepth: ReportInput["researchDepth"];
  recommendedAcceptedSourceCount: number;
  readiness: ReturnType<typeof generationReadiness>;
  sectionSufficiency: UiSectionSufficiency[];
  limitedReadableSourceWarning: string | null;
  canGenerateReport: boolean;
  blockingReason: string | null;
  isGenerating: boolean;
  generateButtonLabel: string;
  generateStatus: "idle" | "loading" | "done" | "error";
  generateErrorMessage: string | null;
  llmStatus: LlmRuntimeStatus;
  presentation: ReportPresentationSettings;
  onPresentationChange: (patch: Partial<ReportPresentationSettings>) => void;
  onGenerate: () => void;
  onBack: () => void;
}) {
  const progressValue = isGenerating
    ? 72
    : canGenerateReport && readiness.canGenerateFull
      ? 100
      : canGenerateReport
        ? 60
        : Math.min(45, acceptedCount * 9);
  const llmUserStatus = llmStatus.loading
    ? "正在檢查模型"
    : llmStatus.healthOk && llmStatus.smokeOk && llmStatus.modelConfigured
      ? "已接上模型"
      : llmStatus.modelConfigured === false
        ? "模型名稱未設定"
        : llmStatus.apiKeyPresent === false || llmStatus.baseURLConfigured === false
          ? "provider 尚未設定"
          : /401|invalid|credential|key|金鑰/i.test(llmStatus.errorMessage ?? "")
            ? "金鑰驗證失敗"
            : "provider 尚未設定";
  const llmProviderLabel =
    llmStatus.provider === "school_llm"
      ? "SCHOOL_LLM"
      : llmStatus.provider || "LLM";
  const sourceRoleCounts = acceptedSources.reduce<Record<string, number>>((counts, source) => {
    const role = sourceRoleBadgeLabel(source.sourceRole) ?? "未分類";
    counts[role] = (counts[role] ?? 0) + 1;
    return counts;
  }, {});
  const sourceDiversityCount = Object.keys(sourceRoleCounts).filter((role) => role !== "未分類").length;
  const insufficientSections = sectionSufficiency.filter((section) => section.status !== "sufficient");
  const generationCapability =
    canGenerateReport && readiness.canGenerateFull && llmStatus.healthOk && llmStatus.smokeOk && llmStatus.modelConfigured
      ? "可生成完整報告"
      : canGenerateReport
        ? "只能生成草稿"
        : "尚不可生成";

  return (
    <section
      className="mx-auto max-w-4xl space-y-4"
      data-testid="generator-generate-step"
    >
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3">
              步驟 4
            </Badge>
            <h2 className="text-2xl font-semibold tracking-normal text-foreground">
              生成報告
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              這裡只確認來源數與生成準備度。建立成功後會前往獨立報告工作區。
            </p>
          </div>
          <Badge
            variant={
              readiness.canGenerateFull
                ? "default"
                : readiness.canGenerate
                  ? "secondary"
                  : "outline"
            }
            className="w-fit"
          >
            已接受 {acceptedCount} 筆來源
          </Badge>
          <Badge variant="outline" className="w-fit">
            {researchDepth} 建議 {recommendedAcceptedSourceCount} 筆
          </Badge>
        </div>
      </div>

      <div
        className="rounded-lg border border-primary/25 bg-card p-6 shadow-sm"
        data-testid="generation-readiness-panel"
      >
        <div className="mb-4 flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wand2 className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-foreground">
              生成準備度
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {canGenerateReport && readiness.canGenerateFull
                ? "來源數已達標準研究報告門檻，可以建立標準報告工作區。"
                : canGenerateReport
                  ? readiness.message ?? "來源數已達短版研究報告門檻，可以進入報告草稿流程。"
                : blockingReason ?? readiness.message ?? `來源不足，請先回到來源管理補足至少 ${readiness.minRequiredSources} 筆已接受可用來源。`}
            </p>
          </div>
        </div>

        <Progress value={progressValue} />
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Badge
            variant={
              canGenerateReport && readiness.canGenerateFull
                ? "default"
                : canGenerateReport
                  ? "secondary"
                  : "outline"
            }
          >
              {canGenerateReport && readiness.canGenerateFull
                ? readiness.badge
                : canGenerateReport
                  ? readiness.badge
                  : "來源不足"}
          </Badge>
          <Badge variant="outline">
            學術 {readiness.scholarlySourcesCount} 筆
          </Badge>
          <Badge variant="outline">
            官方背景 {readiness.officialBackgroundSourcesCount || readiness.reliableBackgroundSourcesCount} 筆
          </Badge>
          <Badge variant="outline">
            已接受可用 {readiness.acceptedUsableSourcesCount} 筆
          </Badge>
          <Badge variant="outline">
            可用摘要 {readiness.usableSummaryCount} 筆
          </Badge>
          <Badge variant="outline">涵蓋面 {readiness.coverageCount} 項</Badge>
          <Badge variant={sourceDiversityCount >= 3 ? "secondary" : "outline"}>
            來源多樣性 {sourceDiversityCount} 種
          </Badge>
          <Badge variant={generationCapability === "可生成完整報告" ? "default" : canGenerateReport ? "secondary" : "outline"}>
            {generationCapability}
          </Badge>
          {insufficientSections.length > 0 ? (
            <Badge variant="outline">
              證據不足章節 {insufficientSections.length}
            </Badge>
          ) : null}
          {isGenerating && (
            <Badge variant="outline">{readiness.progressLabel}</Badge>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {Object.entries(sourceRoleCounts).map(([role, count]) => (
            <span key={role} className="rounded-md border border-border px-2 py-1">
              {role} {count}
            </span>
          ))}
          {insufficientSections.slice(0, 4).map((section) => (
            <span key={section.sectionId} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              {section.title} 證據不足
            </span>
          ))}
        </div>

        {(blockingReason || readiness.warning) && (
          <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{blockingReason ?? readiness.warning}</span>
          </div>
        )}

        {limitedReadableSourceWarning ? (
          <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{limitedReadableSourceWarning}</span>
          </div>
        ) : null}

        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">段落證據充足度</span>
            <Badge variant="outline">
              {sectionSufficiency.filter((item) => item.status === "sufficient").length}/{sectionSufficiency.length} sufficient
            </Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {sectionSufficiency.map((section) => (
              <div key={section.sectionId} className="rounded-md border border-border bg-background px-2 py-2 text-xs leading-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{section.title}</span>
                  <Badge variant={badgeVariantForSufficiency(section.status)}>
                    {section.status}
                  </Badge>
                  <Badge variant="outline">{section.evidenceCount} 張</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  full text {section.fullTextEvidenceCount} / abstract {section.abstractOnlyEvidenceCount} / citation {section.citationCount}
                </p>
                {section.missingEvidenceTypes.length > 0 ? (
                  <p className="mt-1 text-muted-foreground">
                    缺：{section.missingEvidenceTypes.slice(0, 3).join("、")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {readiness.diagnostics.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {readiness.diagnostics.slice(0, 5).map((diagnostic) => (
              <li key={diagnostic}>{diagnostic}</li>
            ))}
          </ul>
        )}

        {generateStatus === "error" && canGenerateReport && (
          <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{generateErrorMessage ?? "報告生成失敗，請檢查 GPT 連線與來源證據卡狀態。"}</span>
          </div>
        )}

        <div className="mt-4 rounded-md border border-border bg-muted/20 px-3 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">LLM 狀態</span>
            <Badge variant={llmStatus.healthOk && llmStatus.smokeOk ? "secondary" : "outline"}>
              {llmProviderLabel} {llmUserStatus}
            </Badge>
            {llmStatus.loading ? (
              <Badge variant="outline">checking</Badge>
            ) : null}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <p>provider：{llmStatus.provider}</p>
            <p>model：{llmStatus.model}</p>
            <p>金鑰：{llmStatus.apiKeyPresent ? "已設定" : "尚未設定"}</p>
            <p>base URL：{llmStatus.baseURLConfigured ? "已設定" : "尚未設定"}</p>
            <p>latency：{llmStatus.latencyMs ?? "-"} ms</p>
            <p>
              checked：{llmStatus.checkedAt ? new Date(llmStatus.checkedAt).toLocaleString() : "-"}
            </p>
          </div>
          {(!llmStatus.healthOk || !llmStatus.smokeOk || !llmStatus.modelConfigured) && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {llmStatus.errorMessage ??
                "請確認 LLM provider credentials、SCHOOL_LLM_MODEL 或 OPENAI_MODEL，並檢查 /api/llm/health 與 /api/llm/smoke。"}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="min-h-[42px]"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> 上一步：管理來源
          </Button>
          {canGenerateReport ? (
            <Button
              type="button"
              size="lg"
              className="min-h-[46px]"
              onClick={onGenerate}
              disabled={
                isGenerating ||
                !llmStatus.healthOk ||
                !llmStatus.smokeOk ||
                !llmStatus.modelConfigured
              }
              data-testid="button-generate"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />{" "}
                  {generateButtonLabel}
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-5 w-5" /> {generateButtonLabel}
                </>
              )}
            </Button>
          ) : (
            <Button type="button" className="min-h-[46px]" onClick={onBack}>
              返回管理來源
            </Button>
          )}
        </div>
      </div>

    </section>
  );
}

function DeveloperDebugPanel({
  keywordDebug,
  preflight,
  acceptedSources,
  evidenceCards,
  reportGenerationDebug,
  visible,
}: {
  keywordDebug: KeywordSearchDebugState | null;
  preflight: SearchPreflightResult | null;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  reportGenerationDebug: ReportGenerationDebugState;
  visible: ReturnType<typeof generatorWorkflowVisibility>;
}) {
  if (!visible.showTechnicalLogs && !visible.showEvidenceCards) return null;

  const debugEvidenceCards = visible.showEvidenceCards ? evidenceCards : [];

  return (
    <section
      className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4"
      data-testid="developer-debug-panel"
    >
      <div>
        <h2 className="text-base font-semibold text-foreground">開發者除錯</h2>
        <p className="text-xs text-muted-foreground">
          技術查詢、provider 狀態與中間證據卡只在此處顯示。
        </p>
      </div>

      {keywordDebug && visible.showTechnicalLogs && (
        <div
          className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground"
          data-testid="keyword-search-debug"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">關鍵詞搜尋除錯</span>
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              /api/search-sources
            </code>
            <Badge variant="outline">LLM：{keywordDebug.llmStatusLabel}</Badge>
            <Badge
              variant={keywordDebug.fallbackUsed ? "secondary" : "outline"}
            >
              {keywordDebug.fallbackUsed
                ? "已使用備援關鍵詞"
                : "LLM 關鍵詞可用"}
            </Badge>
          </div>
          <SearchIntentDebugPanel debug={keywordDebug} />
          <div className="space-y-1">
            <p>查詢關鍵詞</p>
            <PreflightPills items={keywordDebug.queries.slice(0, 6)} />
          </div>
          {keywordDebug.expandedQueries.length > 0 && (
            <div className="mt-2 space-y-1">
              <p>expandedQueries</p>
              <PreflightPills
                items={keywordDebug.expandedQueries
                  .slice(0, 12)
                  .map(
                    (query) =>
                      `${query.language}/${query.purpose}: ${query.query}`,
                  )}
              />
            </div>
          )}
          <div className="mt-2 space-y-1">
            <p>來源漏斗</p>
            <p>
              中文查詢 {keywordDebug.queryLanguageCounts.zh} 組，英文查詢{" "}
              {keywordDebug.queryLanguageCounts.en} 組，混合查詢{" "}
              {keywordDebug.queryLanguageCounts.mixed} 組
            </p>
            <p>
              retrieved {keywordDebug.retrievalStats.rawResults}，deduped{" "}
              {keywordDebug.retrievalStats.dedupedResults}，rejected{" "}
              {keywordDebug.retrievalStats.rejectedResults}，candidates{" "}
              {keywordDebug.retrievalStats.candidateResults}，displayed{" "}
              {keywordDebug.retrievalStats.displayedResults}，primary{" "}
              {keywordDebug.retrievalStats.primaryCandidateResults}
            </p>
            <p>
              provider batches {keywordDebug.retrievalStats.successfulProviderGroups} /{" "}
              {keywordDebug.retrievalStats.providerGroups}
            </p>
            {keywordDebug.sourceSearchConfig && (
              <div className="space-y-1">
                <p>
                  profile {keywordDebug.sourceSearchConfig.searchProfile ?? "standard"}，
                  預估 {keywordDebug.sourceSearchConfig.estimatedTime ?? "未提供"}，
                  cache {keywordDebug.sourceSearchConfig.cacheStatus ?? (keywordDebug.sourceSearchConfig.cacheHit ? "hit" : "miss")}
                </p>
                <p>
                  config candidateTarget{" "}
                  {keywordDebug.sourceSearchConfig.candidateTarget}，acceptedTarget{" "}
                  {keywordDebug.sourceSearchConfig.acceptedTarget}，minAccepted{" "}
                  {keywordDebug.sourceSearchConfig.minAccepted}
                </p>
                {keywordDebug.sourceSearchConfig.earlyStopReason ? (
                  <p>early stop：{keywordDebug.sourceSearchConfig.earlyStopReason}</p>
                ) : null}
              </div>
            )}
            <p>
              補搜：{keywordDebug.recovery?.attempted ? "是" : "否"}
              {keywordDebug.recovery?.attempted
                ? `，新增查詢 ${keywordDebug.recovery.addedQueryCount} 組，raw ${keywordDebug.recovery.rawAddedCount}，deduped +${keywordDebug.recovery.dedupedAddedCount}`
                : ""}
            </p>
          </div>
          {keywordDebug.groundingDiagnostics && (
            <div className="mt-2 space-y-1">
              <p>grounding_progress diagnostics</p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 font-mono text-[11px]">
                {JSON.stringify(keywordDebug.groundingDiagnostics, null, 2)}
              </pre>
            </div>
          )}
          {keywordDebug.debugTrace && (
            <div className="mt-3 space-y-2 rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">research debug trace</p>
                <Badge variant="outline">
                  {keywordDebug.debugTrace.semanticClassification.primaryType}
                </Badge>
                <Badge variant="outline">
                  confidence{" "}
                  {Math.round(
                    keywordDebug.debugTrace.semanticClassification.confidence * 100,
                  )}
                  %
                </Badge>
                <Badge
                  variant={
                    keywordDebug.debugTrace.hardCodedTemplateDetected
                      ? "destructive"
                      : "outline"
                  }
                >
                  template{" "}
                  {keywordDebug.debugTrace.hardCodedTemplateDetected
                    ? "detected"
                    : "clean"}
                </Badge>
              </div>
              <p>
                normalizedTopic：{keywordDebug.debugTrace.normalizedTopic}
              </p>
              <p>
                candidate {keywordDebug.debugTrace.candidateSourceCount}，
                accepted {keywordDebug.debugTrace.acceptedSourceCount}，
                facts {keywordDebug.debugTrace.sourceFacts.length}，
                evidenceCards {keywordDebug.debugTrace.evidenceCards.length}
              </p>
              <p>
                groundedTitle：{keywordDebug.debugTrace.generatedTitle}
              </p>
              <p>
                groundedSubtitle：{keywordDebug.debugTrace.generatedSubtitle}
              </p>
              <p className="line-clamp-3">
                groundedIntro：{keywordDebug.debugTrace.generatedIntro}
              </p>
              <p>
                introValidation passed{" "}
                {keywordDebug.debugTrace.introValidation.passed ? "yes" : "no"}
                {keywordDebug.debugTrace.fallbackReason
                  ? `，fallback ${keywordDebug.debugTrace.fallbackReason}`
                  : ""}
              </p>
              <PreflightPills
                items={keywordDebug.debugTrace.sourceFacts
                  .slice(0, 8)
                  .map((fact) => `${fact.category}: ${fact.fact}`)}
              />
            </div>
          )}
          {keywordDebug.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              <p>搜尋提醒</p>
              <ul className="space-y-1">
                {keywordDebug.warnings.slice(0, 4).map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            </div>
          )}
          {keywordDebug.providerErrors.length > 0 && (
            <div className="mt-2 space-y-1">
              <p>Provider 回應狀態</p>
              <ul className="space-y-1">
                {keywordDebug.providerErrors.slice(0, 4).map((error) => (
                  <li key={error}>- {error}</li>
                ))}
              </ul>
            </div>
          )}
          {keywordDebug.providerBreakdown.length > 0 && (
            <div className="mt-2 space-y-1">
              <p>Provider raw results</p>
              <ul className="space-y-1">
                {keywordDebug.providerBreakdown.slice(0, 12).map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {visible.showTechnicalLogs && (
        <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">report generation debug</p>
          <pre className="whitespace-pre-wrap break-words">
            {JSON.stringify(reportGenerationDebug, null, 2)}
          </pre>
        </div>
      )}

      {preflight && visible.showTechnicalLogs && (
        <PreflightDebugPanel preflight={preflight} />
      )}

      {visible.showEvidenceCards && (
        <div
          className="rounded-md border border-border bg-muted/20 p-3"
          data-testid="debug-evidence-cards"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">中間證據卡</p>
            <Badge variant="outline">{debugEvidenceCards.length} 張</Badge>
          </div>
          {debugEvidenceCards.length ? (
            <div className="space-y-2">
              {debugEvidenceCards.slice(0, 6).map((card, index) => (
                <div
                  key={card.id}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs"
                >
                  <p
                    className="truncate font-medium text-foreground"
                    title={evidenceCardLabel(card)}
                  >
                    來源 {index + 1}：{evidenceCardLabel(card)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-foreground">
                    {card.mainClaimZhTw ?? card.claimTextZhTw ?? card.claim}
                  </p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">
                    {(card.supportSpans?.[0]?.text ?? card.supportedByText ?? card.evidence)}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    confidence {Math.round((card.confidenceScore ?? 0) * 100)}% · {card.sourceAccessLevel ?? "unknown"} · {card.extractionStatus ?? "unknown"} · {(card.usableSections ?? []).join("、") || "sections pending"}{card.needsManualReview ? " · needs review" : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              尚無已接受來源可建立證據卡。
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PreflightPills({ items }: { items: string[] }) {
  if (items.length === 0)
    return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge
          key={item}
          variant="outline"
          className="max-w-full whitespace-normal break-words text-left"
        >
          {item}
        </Badge>
      ))}
    </div>
  );
}

function PreflightFieldLabel({ field }: { field: PreflightDebugLabelKey }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{preflightDebugLabel(field)}</span>
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground">
        {field}
      </code>
    </p>
  );
}

function PreflightDebugPanel({
  preflight,
}: {
  preflight: SearchPreflightResult;
}) {
  return (
    <div
      className="report-card mb-4 rounded-lg border border-border bg-card p-4"
      data-testid="preflight-debug-panel"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            搜尋前檢查除錯面板
          </h2>
          <p className="text-xs text-muted-foreground">
            只傳入最相關的搜尋指引，不傳完整大型測試資料給生成流程。
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">{preflight.matched_case_id}</Badge>
          <Badge variant="outline">{preflight.predicted_report_type}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
        <div className="space-y-1">
          <PreflightFieldLabel field="domains" />
          <PreflightPills items={preflight.domains} />
        </div>
        <div className="space-y-1">
          <PreflightFieldLabel field="recommended_keywords" />
          <PreflightPills items={preflight.recommended_keywords} />
        </div>
        <div className="space-y-1">
          <PreflightFieldLabel field="preferred_source_types" />
          <PreflightPills items={preflight.preferred_source_types} />
        </div>
        <div className="space-y-1">
          <PreflightFieldLabel field="avoid_source_types" />
          <PreflightPills items={preflight.avoid_source_types} />
        </div>
        <div className="space-y-1">
          <PreflightFieldLabel field="common_failure_modes" />
          <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
            {preflight.common_failure_modes.map((mode) => (
              <li key={mode}>- {mode}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Generator() {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [input, setInput] = useState<ReportInput>(DEFAULT_INPUT);
  const [draftTopic, setDraftTopic] = useState("");
  const [debouncedDraftTopic, setDebouncedDraftTopic] = useState("");
  const [searchTopic, setSearchTopic] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [generateErrorMessage, setGenerateErrorMessage] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmRuntimeStatus>(DEFAULT_LLM_STATUS);
  const [expansions, setExpansions] = useState<TopicRunExpansionCard[]>([]);
  const [selectedDirection, setSelectedDirection] =
    useState<ResearchDirection | null>(null);
  const [selectedDomain, setSelectedDomain] =
    useState<ResearchDomain | null>(null);
  const [currentTopicRunId, setCurrentTopicRunId] = useState<string | null>(null);
  const [topicWorkflowStatus, setTopicWorkflowStatus] =
    useState<TopicWorkflowState>("idle");
  const [selectedTitleSearchSeed, setSelectedTitleSearchSeed] =
    useState<SelectedTitleSearchSeed | null>(null);
  const [topicExpansionDiagnostics, setTopicExpansionDiagnostics] =
    useState<TopicExpansionDiagnostics | null>(null);
  const [topicExpansionMessage, setTopicExpansionMessage] = useState<string | null>(null);
  const [titleSemanticComparison, setTitleSemanticComparison] =
    useState<TitleSemanticComparison | null>(null);
  const [topicExpansionStatus, setTopicExpansionStatus] = useState<
    "idle" | "loading" | "done" | "timeout-fallback" | "error"
  >("idle");
  const [groundingJobMeta, setGroundingJobMeta] =
    useState<GroundingJobMeta | null>(null);
  const [groundingJob, setGroundingJob] = useState<GroundingJob | null>(null);
  const [groundingRequestState, setGroundingRequestState] =
    useState<GroundingRequestState>("idle");
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [generatorRunId, setGeneratorRunId] = useState<string | null>(null);
  const [stepHistory, setStepHistory] = useState<GeneratorRouteStep[]>([]);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [isTopicComposing, setIsTopicComposing] = useState(false);
  const [locationRestoreNonce, setLocationRestoreNonce] = useState(0);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [sourceSearchStatus, setSourceSearchStatus] = useState<
    "idle" | "loading" | "done" | "empty" | "error"
  >("idle");
  const [sourceSearchMessage, setSourceSearchMessage] = useState("");
  const [supplementalCoverageAttemptKey, setSupplementalCoverageAttemptKey] =
    useState<string | null>(null);
  const [searchRequestDebug, setSearchRequestDebug] =
    useState<SearchRequestDebugState | null>(null);
  const [keywordSearchDebug, setKeywordSearchDebug] =
    useState<KeywordSearchDebugState | null>(null);
  const [developerDebugOpen, setDeveloperDebugOpen] = useState(false);
  const [topicDiagnosticsOpen, setTopicDiagnosticsOpen] = useState(false);
  const [workspaceResume, setWorkspaceResume] =
    useState<WorkspaceResumeState | null>(null);
  const [presentation, setPresentation] = useState<ReportPresentationSettings>(
    normalizeReportPresentation(DEFAULT_REPORT_PRESENTATION),
  );
  const [sourceWorkspaceFingerprint, setSourceWorkspaceFingerprint] = useState<
    string | null
  >(null);
  const [sourceWorkflowId, setSourceWorkflowId] = useState<string | null>(null);
  const [sourceQueryPlanHash, setSourceQueryPlanHash] = useState<string | null>(
    null,
  );
  const [activeStep, setActiveStep] = useState<GeneratorWorkflowStep>("topic");
  const [isStepTransitioning, setIsStepTransitioning] = useState(false);
  const [transitionTargetStep, setTransitionTargetStep] = useState<
    GeneratorWorkflowStep | "report"
  >("topic");
  const [transitionMessage, setTransitionMessage] = useState({
    title: "",
    description: "",
  });
  const transitionTimerRef = useRef<number | null>(null);
  const stepDelayTimerRef = useRef<number | null>(null);
  const topicRunCounterRef = useRef(0);
  const previousTopicRef = useRef<string | null>(null);
  const topicResetVersionRef = useRef(0);
  const currentTopicRunIdRef = useRef<string | null>(null);
  const activeRunContextRef = useRef<GeneratorRunContext>({
    runId: null,
    workflowId: null,
    topicHash: null,
  });
  const groundingCreateAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      groundingCreateAbortRef.current?.abort();
    },
    [],
  );

  const updateInput = (key: ReportInputStringKey, value: string) => {
    setInput((prev) => {
      const next = { ...prev, [key]: value };
      // Academic level is the single source of truth for reader + purpose.
      if (key === "academicLevel") {
        next.targetAudience = academicToAudience(value);
        next.purpose = academicToPurpose(value);
      }
      if (key === "targetAudience") {
        next.academicLevel = audienceToAcademicLevel(value);
        next.purpose = academicToPurpose(next.academicLevel);
      }
      return next;
    });
  };

  const clearStepTransition = () => {
    if (stepDelayTimerRef.current !== null) {
      window.clearTimeout(stepDelayTimerRef.current);
      stepDelayTimerRef.current = null;
    }
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  };

  const createTopicRunId = (topic: string, domain: ResearchDomain | null) => {
    topicRunCounterRef.current += 1;
    return `topic-${reportTopicFingerprint([
      topic.trim(),
      domain ?? "none",
      String(topicRunCounterRef.current),
      String(Date.now()),
    ].join("|"))}`;
  };

  const clearGeneratorUrlState = () => {
    syncGeneratorUrl({
      step: "topic_input",
      workflowId: null,
      topicHash: null,
      runId: null,
      jobId: null,
      mode: "replace",
    });
  };

  const beginStepTransition = (
    targetStep: GeneratorWorkflowStep | "report",
    message: { title: string; description: string },
    duration = 560,
    onComplete?: () => void,
  ) => {
    clearStepTransition();
    setTransitionTargetStep(targetStep);
    setTransitionMessage(message);
    setIsStepTransitioning(true);
    transitionTimerRef.current = window.setTimeout(() => {
      if (targetStep !== "report") {
        setActiveStep(targetStep);
      }
      setIsStepTransitioning(false);
      transitionTimerRef.current = null;
      onComplete?.();
    }, duration);
  };

  // Live AI domain detection (recomputed as topic / type / level change).
  const derivedPurpose = academicToPurpose(input.academicLevel);
  const originalTopicValue = input.topic.trim();
  const draftTopicValue = draftTopic.trim();
  const selectedExpansionTopic = searchTopic.trim();
  const activeResearchTopic = selectedExpansionTopic || originalTopicValue;
  const displayTitleValue =
    displayTitle.trim() || selectedExpansionTopic || originalTopicValue;
  const hasSelectedExpansion =
    Boolean(selectedExpansionTopic) && selectedExpansionTopic !== originalTopicValue;
  const hasTopic = Boolean(originalTopicValue);
  const hasDraftTopic = Boolean(draftTopicValue);
  const searchTopicValue = activeResearchTopic;
  const recommendedDomain = useMemo(
    () => (draftTopicValue ? inferResearchDomain(draftTopicValue) : null),
    [draftTopicValue],
  );
  const draftTopicValidation = useMemo(
    () =>
      draftTopicValue
        ? validateTopicForWorkflow(draftTopicValue, {
          domainHint: selectedDomain ?? recommendedDomain,
        })
        : null,
    [draftTopicValue, recommendedDomain, selectedDomain],
  );
  const preflight = useMemo(
    () =>
      hasTopic
        ? runSearchPreflight({
            topic: originalTopicValue,
            reportType: input.reportType,
          })
        : null,
    [hasTopic, input.reportType, originalTopicValue],
  );
  const topicUnderstanding = useMemo(
    () => (searchTopicValue ? understandTopic(searchTopicValue) : null),
    [searchTopicValue],
  );
  const parsedActiveResearchInput = useMemo<ParsedResearchInput | null>(
    () => (searchTopicValue ? parseResearchInput(searchTopicValue) : null),
    [searchTopicValue],
  );
  const parsedDraftResearchInput = useMemo<ParsedResearchInput | null>(
    () => (draftTopicValue ? parseResearchInput(draftTopicValue) : null),
    [draftTopicValue],
  );
  const hasInvalidTopic = Boolean(
    originalTopicValue &&
      (topicUnderstanding?.topicKind === "unknown_or_noise" ||
        parsedActiveResearchInput?.inputType === "invalid"),
  );
  const hasInvalidDraftTopic = Boolean(
    draftTopicValue && draftTopicValidation?.status === "invalid",
  );
  const detectedCategory: TopicCategory | null = draftTopicValue || originalTopicValue
    ? detectTopicCategory(draftTopicValue || originalTopicValue, input.reportType, derivedPurpose)
    : null;
  const sourceWorkflowLock = useMemo<SourceWorkflowLock | null>(() => {
    if (!sourceWorkflowId || !sourceWorkspaceFingerprint || !sourceQueryPlanHash)
      return null;
    return {
      workflowId: sourceWorkflowId,
      topicHash: sourceWorkspaceFingerprint,
      queryPlanHash: sourceQueryPlanHash,
    };
  }, [sourceQueryPlanHash, sourceWorkflowId, sourceWorkspaceFingerprint]);
  const currentWorkflowSources = useMemo(
    () => sources.filter((source) => sourceMatchesWorkflow(source, sourceWorkflowLock)),
    [sourceWorkflowLock, sources],
  );
  const acceptedSources = acceptedSourceRecords(currentWorkflowSources);
  const selectedDepthOption =
    RESEARCH_DEPTH_OPTIONS.find(
      (option) => option.value === input.researchDepth,
    ) ?? RESEARCH_DEPTH_OPTIONS[1]!;
  const recommendedAcceptedSourceCount =
    selectedDepthOption.recommendedSources;
  const activeReportTopic = activeResearchTopic;
  const currentTopicFingerprint = hasTopic
    ? reportTopicFingerprint(activeReportTopic)
    : null;
  const academicSafetyReview = groundingJob?.academicSafetyReview ?? null;
  const hasWorkspaceTopicMismatch =
    Boolean(sources.length) &&
    Boolean(sourceWorkspaceFingerprint) &&
    Boolean(currentTopicFingerprint) &&
    sourceWorkspaceFingerprint !== currentTopicFingerprint;
  const workflowVisibility = generatorWorkflowVisibility(
    import.meta.env.DEV && developerDebugOpen,
  );
  const reviewCounts = safeSourceReviewCounts(currentWorkflowSources);
  const reviewedSourceCount = reviewCounts.accepted + reviewCounts.rejected;
  const acceptedEvidenceCards = useMemo(
    () =>
      groundedEvidenceCardsForAcceptedSources({
        acceptedSources,
        groundingEvidenceCards: groundingJob?.evidenceCards ?? [],
        topic: activeReportTopic,
      }),
    [acceptedSources, activeReportTopic, groundingJob?.evidenceCards],
  );
  const serverDerivableEvidenceAvailable = useMemo(
    () => acceptedSources.some(sourceHasServerDerivableSupport),
    [acceptedSources],
  );
  const readinessEvidenceCards =
    acceptedEvidenceCards.length > 0 || !serverDerivableEvidenceAvailable
      ? acceptedEvidenceCards
      : null;
  const readiness = generationReadiness(
    acceptedSources,
    input.researchDepth,
    readinessEvidenceCards,
  );
  const literatureReviewEvidenceCount = useMemo(
    () =>
      acceptedEvidenceCards.filter(
        (card) =>
          card.usableSections.includes("文獻探討") ||
          card.sectionTargets.includes("literature_review"),
      ).length,
    [acceptedEvidenceCards],
  );
  const sectionSufficiency = useMemo(
    () => buildUiSectionSufficiency(acceptedEvidenceCards),
    [acceptedEvidenceCards],
  );
  const limitedReadableSourceWarning = useMemo(() => {
    if (acceptedSources.length === 0) return null;
    const fullTextCount = acceptedSources.filter((source) => source.accessLevel === "full_text").length;
    const abstractOrMetadataCount = acceptedSources.filter(
      (source) =>
        source.accessLevel === "abstract_only" ||
        source.accessLevel === "metadata_only" ||
        !source.accessLevel,
    ).length;
    if (fullTextCount === 0 && abstractOrMetadataCount > 0) {
      return "目前多數來源未取得全文，報告會以摘要與 metadata 為主，不能形成完整文獻探討。";
    }
    if (abstractOrMetadataCount > fullTextCount) {
      return "目前可用全文來源偏少，文獻探討與討論段會保留證據限制。";
    }
    return null;
  }, [acceptedSources]);
  const peerReviewedAcceptedSourceCount = useMemo(
    () =>
      acceptedSources.filter((source) =>
        Boolean(
          source.isPeerReviewed ||
            source.doi ||
            source.sourceKind === "journal" ||
            source.sourceKind === "conference" ||
            /crossref|openalex|semantic scholar|journal|conference|academic/i.test(
              `${source.provider ?? ""} ${source.sourceType ?? ""} ${source.containerTitle ?? ""}`,
            ),
        ),
      ).length,
    [acceptedSources],
  );
  const needsSupplementalCoverage = shouldRunSupplementalCoverageSearch({
    acceptedSourceCount: acceptedSources.length,
    literatureReviewEvidenceCount,
    peerReviewedAcceptedSourceCount,
    canonicalEvidenceCardCount: acceptedEvidenceCards.length,
    serverDerivableEvidenceAvailable,
  });
  const blockingReason = reportGenerationBlockingReason({
    topic: activeReportTopic,
    acceptedSources,
    hasWorkspaceTopicMismatch,
    evidenceCardCount:
      acceptedEvidenceCards.length > 0
        ? acceptedEvidenceCards.length
        : serverDerivableEvidenceAvailable
          ? 1
          : 0,
    workflowId: sourceWorkflowLock?.workflowId ?? null,
    topicHash: sourceWorkflowLock?.topicHash ?? null,
  });
  const effectiveBlockingReason = academicSafetyBlocksReport(academicSafetyReview)
    ? "此主題已被標記為不可輸出操作性內容，因此不會進入一般報告生成。"
    : blockingReason;
  const canGenerateReport = !effectiveBlockingReason;
  const reportGenerationDebug: ReportGenerationDebugState = {
    workflowId: sourceWorkflowLock?.workflowId ?? null,
    topicHash: sourceWorkflowLock?.topicHash ?? null,
    searchedCount:
      keywordSearchDebug?.retrievalStats.rawResults ?? currentWorkflowSources.length,
    reviewedCount: reviewedSourceCount,
    acceptedCount: acceptedSources.length,
    evidenceCardCount: acceptedEvidenceCards.length,
    canGenerateReport,
    blockingReason: effectiveBlockingReason,
  };
  const visiblePrimarySourceCount = visiblePrimarySourceRecords(
    currentWorkflowSources,
  ).length;
  const currentReviewableSourceCount =
    visibleReviewCandidateSources(currentWorkflowSources).length;
  const canProceedToSourceReview =
    (groundingJob?.groundingDiagnostics as GroundingPipelineDiagnosticsState | undefined)
      ?.canProceedToSourceReview ??
    currentReviewableSourceCount >= MIN_REVIEWABLE_SOURCE_COUNT;
  const sourcePipelineStats: SourcePipelineStats | null = currentWorkflowSources.length
    ? {
        rawResults:
          keywordSearchDebug?.retrievalStats.rawResults || currentWorkflowSources.length,
        providerGroups:
          keywordSearchDebug?.retrievalStats.providerGroups ?? 0,
        successfulProviderGroups:
          keywordSearchDebug?.retrievalStats.successfulProviderGroups ?? 0,
        dedupedResults:
          keywordSearchDebug?.retrievalStats.dedupedResults ??
          currentWorkflowSources.length,
        rejectedResults:
          keywordSearchDebug?.retrievalStats.rejectedResults ??
          rejectedSourceRecords(currentWorkflowSources).length,
        candidateResults:
          keywordSearchDebug?.retrievalStats.candidateResults ??
          currentReviewableSourceCount,
        displayedResults:
          keywordSearchDebug?.retrievalStats.displayedResults ??
          currentWorkflowSources.length,
        primaryCandidateResults:
          keywordSearchDebug?.retrievalStats.primaryCandidateResults ??
          primaryCandidateSources(currentWorkflowSources).length,
        primaryCandidates: primaryCandidateSources(currentWorkflowSources).length,
        secondaryCandidates: secondaryCandidateSources(currentWorkflowSources).length,
        lowRelevance: lowRelevanceCandidateSources(currentWorkflowSources).length,
        rejected: rejectedSourceRecords(currentWorkflowSources).length,
      }
    : null;
  const sourceReviewAvailable =
    sourceSearchStatus !== "idle" || currentWorkflowSources.length > 0;
  const visibleStep: GeneratorWorkflowStep = activeStep;
  useEffect(() => {
    if (visibleStep !== "generate") return;
    let cancelled = false;

    const readLlmStatus = async () => {
      setLlmStatus((current) => ({ ...current, loading: true }));
      try {
        const healthResponse = await fetch(generatorApiUrl("/api/llm/health"));
        const health = await healthResponse.json() as Record<string, unknown>;
        const smokeResponse = await fetch(generatorApiUrl("/api/llm/smoke"), {
          method: "POST",
        });
        const smoke = await smokeResponse.json() as Record<string, unknown>;
        if (cancelled) return;
        const healthOk = health.ok === true;
        const smokeOk = smoke.ok === true;
        const modelConfigured =
          typeof health.modelConfigured === "boolean"
            ? health.modelConfigured
            : typeof health.resolvedModel === "string" && health.resolvedModel.trim().length > 0;
        setLlmStatus({
          loading: false,
          healthOk,
          smokeOk,
          provider:
            typeof health.provider === "string"
              ? health.provider
              : typeof smoke.provider === "string"
                ? smoke.provider
                : "openai",
          model:
            typeof health.resolvedModel === "string"
              ? health.resolvedModel
              : typeof smoke.requestedModel === "string"
                ? smoke.requestedModel
                : "gpt-5.4",
          checkedAt:
            typeof smoke.checkedAt === "string"
              ? smoke.checkedAt
              : typeof health.checkedAt === "string"
                ? health.checkedAt
                : new Date().toISOString(),
          latencyMs:
            typeof smoke.latencyMs === "number"
              ? smoke.latencyMs
              : typeof health.latencyMs === "number"
                ? health.latencyMs
                : null,
          apiKeyPresent:
            typeof health.apiKeyPresent === "boolean"
              ? health.apiKeyPresent
              : null,
          baseURLConfigured:
            typeof health.baseURLConfigured === "boolean"
              ? health.baseURLConfigured
              : null,
          credentialPreview:
            typeof health.credentialPreview === "string"
              ? health.credentialPreview
              : null,
          modelConfigured,
          errorMessage:
            smokeOk && healthOk && modelConfigured
              ? null
              : !modelConfigured && healthOk
                ? "LLM credentials configured, but model is not explicitly configured. Smoke test can infer a model from /models, or set SCHOOL_LLM_MODEL."
                : [health.errorMessage, smoke.errorMessage]
                  .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                  .join("；") || "LLM health/smoke failed",
        });
      } catch (error) {
        if (cancelled) return;
        setLlmStatus({
          ...DEFAULT_LLM_STATUS,
          loading: false,
          errorMessage:
            error instanceof Error ? error.message : "LLM status request failed",
        });
      }
    };

    void readLlmStatus();

    return () => {
      cancelled = true;
    };
  }, [visibleStep]);
  const sourceSearchUiState = deriveSourceSearchUiState({
    isSearchingSources,
    sourceCount: currentWorkflowSources.length,
    sourceSearchStatus,
    groundingRequestState:
      groundingRequestState === "job_create_failed" ||
      groundingRequestState === "job_poll_failed" ||
      groundingRequestState === "all_providers_failed" ||
      groundingRequestState === "no_results_after_expansion"
        ? groundingRequestState
        : undefined,
    sourceSearchMessage,
    backendMessage: searchRequestDebug?.backendMessage ?? "",
  });
  const visibleExpansions = useMemo(
    () =>
      expansions.filter((card) => {
        if (!currentTopicRunId || card.topicRunId !== currentTopicRunId) return false;
        if (card.rawTopic !== draftTopicValue) return false;
        if (card.researchDirection.topicRunId !== currentTopicRunId) return false;
        return !directionHasSemanticContamination(
          card.researchDirection,
          draftTopicValue,
          previousTopicRef.current,
        );
      }),
    [currentTopicRunId, draftTopicValue, expansions],
  );
  const stepCompleted: Record<GeneratorWorkflowStep, boolean> = {
    topic: hasTopic && !hasInvalidTopic && visibleStep !== "topic",
    search: sourceReviewAvailable && visibleStep !== "search",
    manage: currentWorkflowSources.length > 0 && visibleStep !== "manage",
    generate: false,
  };
  const currentRouteStep = routeStepForInternal(visibleStep);
  const canEnterStep = (step: GeneratorWorkflowStep) => {
    if (step === "topic") return true;
    if (!hasTopic || hasInvalidTopic) return false;
    if (step === "search") return true;
    if (step === "manage")
      return (
        currentWorkflowSources.length > 0 &&
        canProceedToSourceReview &&
        !hasWorkspaceTopicMismatch
      );
    if (step === "generate")
      return canGenerateReport;
    return true;
  };
  const syncGeneratorUrl = (input: {
    step?: GeneratorRouteStep;
    jobId?: string | null;
    workflowId?: string | null;
    topicHash?: string | null;
    runId?: string | null;
    mode?: "push" | "replace";
  }) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    for (const key of GENERATOR_URL_QUERY_KEYS) {
      url.searchParams.delete(key);
    }
    const hasOwnInput = (key: keyof typeof input) =>
      Object.prototype.hasOwnProperty.call(input, key);
    const step = input.step ?? currentRouteStep;
    const jobId = hasOwnInput("jobId")
      ? input.jobId
      : groundingJobMeta?.jobId ?? null;
    const workflowId = hasOwnInput("workflowId")
      ? input.workflowId
      : sourceWorkflowId ?? groundingJobMeta?.workflowId ?? null;
    const topicHash =
      hasOwnInput("topicHash")
        ? input.topicHash
        : sourceWorkspaceFingerprint ?? groundingJobMeta?.topicHash ?? null;
    const runId = hasOwnInput("runId") ? input.runId : generatorRunId ?? null;

    if (step) url.searchParams.set("step", step);
    if (jobId) url.searchParams.set("jobId", jobId);
    if (workflowId) url.searchParams.set("workflowId", workflowId);
    if (topicHash) url.searchParams.set("topicHash", topicHash);
    if (runId) url.searchParams.set("runId", runId);

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (input.mode === "push") {
      window.history.pushState({}, "", nextUrl);
      return;
    }
    window.history.replaceState({}, "", nextUrl);
  };
  const returnToTopicRefinement = (result: GroundingJob, showToast = false) => {
    const nextAction = result.parsedInput?.nextAction;
    const message =
      nextAction === "ask_clarification"
        ? result.warnings[0] ?? "主題還需要補充研究對象、變項或範圍後再搜尋。"
        : result.warnings[0] ?? "主題仍偏短或多義，請先選一個更明確的研究方向。";

    setInput((current) => ({ ...current, topic: result.originalTopic }));
    setDraftTopic(result.originalTopic);
    setDebouncedDraftTopic(result.originalTopic);
    setSearchTopic("");
    setDisplayTitle(result.originalTopic);
    setTopicWorkflowStatus("ready");
    setTopicExpansionStatus(nextAction === "ask_clarification" ? "error" : "done");
    setTopicExpansionMessage(message);
    setGroundingJobMeta(null);
    setGroundingJob(result);
    setGroundingRequestState(groundingRequestStateForJob(result));
    setGroundingError(null);
    setSources([]);
    setSourceWorkflowId(null);
    setSourceWorkspaceFingerprint(null);
    setSourceQueryPlanHash(null);
    setSourceSearchStatus("idle");
    setSourceSearchMessage("");
    setIsSearchingSources(false);
    setGeneratorRunId(null);
    setStepHistory([]);
    activeRunContextRef.current = {
      runId: null,
      workflowId: null,
      topicHash: null,
    };
    clearStepTransition();
    setActiveStep("topic");
    syncGeneratorUrl({
      step: "topic_input",
      jobId: null,
      workflowId: null,
      topicHash: null,
      runId: null,
      mode: "replace",
    });
    if (showToast) {
      toast({
        title: nextAction === "ask_clarification" ? "主題還需要補充" : "請先縮小研究方向",
        description: message,
        variant: nextAction === "ask_clarification" ? "destructive" : "default",
      });
    }
  };
  const transitionToStep = (
    step: GeneratorWorkflowStep,
    options?: {
      historyMode?: "push" | "replace";
      pushCurrentStep?: boolean;
      routeStep?: GeneratorRouteStep;
      message?: { title: string; description: string };
    },
  ) => {
    if (
      isStepTransitioning ||
      isSearchingSources ||
      isGenerating ||
      step === activeStep ||
      !canEnterStep(step)
    ) {
      return;
    }
    if (options?.pushCurrentStep) {
      setStepHistory((history) => [...history, routeStepForInternal(activeStep)]);
    }
    const routeStep = options?.routeStep ?? routeStepForInternal(step);
    syncGeneratorUrl({ step: routeStep, mode: options?.historyMode ?? "push" });
    beginStepTransition(
      step,
      options?.message ?? workflowTransitionCopy(activeStep, step),
      step === "generate" ? 520 : 420,
    );
  };
  const handleStepSelect = (step: GeneratorWorkflowStep) => {
    transitionToStep(step, { pushCurrentStep: true, historyMode: "push" });
  };
	  const goBackStep = () => {
	    let previousStep: GeneratorRouteStep | null =
	      stepHistory[stepHistory.length - 1] ?? null;
	    setStepHistory((history) => {
	      const next = [...history];
      previousStep = next.pop() ?? null;
      return next;
    });
    const fallbackStep =
      activeStep === "generate"
        ? "source_review"
        : activeStep === "manage"
          ? "grounding_progress"
	          : "topic_input";
	    const targetRouteStep = previousStep ?? fallbackStep;
	    if (visibleStep === "search" && targetRouteStep === "topic_input") {
	      clearStepTransition();
	      setGroundingError(null);
	      setRestoreMessage(null);
	      setStepHistory([]);
	      setActiveStep("topic");
	      syncGeneratorUrl({ step: "topic_input", mode: "push" });
	      return;
	    }
	    transitionToStep(internalStepForRoute(targetRouteStep), {
	      historyMode: "push",
	      routeStep: targetRouteStep,
	      message: workflowTransitionCopy(activeStep, internalStepForRoute(targetRouteStep)),
	    });
  };
  const scheduleManageStepAfterSearch = (sourceCount: number) => {
    if (sourceCount <= 0) return;
    if (stepDelayTimerRef.current !== null) {
      window.clearTimeout(stepDelayTimerRef.current);
    }
    stepDelayTimerRef.current = window.setTimeout(() => {
      setStepHistory((history) => [...history, routeStepForInternal(activeStep)]);
      syncGeneratorUrl({ step: "source_review", mode: "push" });
      beginStepTransition(
        "manage",
        {
          title: "已整理來源",
          description: `已找到 ${sourceCount} 筆候選來源，正在進入來源管理。主要候選會預設展開，已接受來源會自動折疊。`,
        },
        620,
      );
      stepDelayTimerRef.current = null;
    }, 620);
  };

  const resetWorkflowState = () => {
    clearStepTransition();
    setGroundingJobMeta(null);
    setGroundingJob(null);
    setGroundingRequestState("idle");
    setGroundingError(null);
    setSources([]);
    setSourceWorkspaceFingerprint(null);
    setSourceWorkflowId(null);
    setSourceQueryPlanHash(null);
    setSearchRequestDebug(null);
    setKeywordSearchDebug(null);
    setSourceSearchStatus("idle");
    setSourceSearchMessage("");
    setGenerateStatus("idle");
    setGenerateErrorMessage(null);
    setIsGenerating(false);
    setIsSearchingSources(false);
    setWorkspaceResume(null);
    setPresentation(normalizeReportPresentation(DEFAULT_REPORT_PRESENTATION));
    setGeneratorRunId(null);
    setStepHistory([]);
    setRestoreMessage(null);
    activeRunContextRef.current = {
      runId: null,
      workflowId: null,
      topicHash: null,
    };
  };

  const handleTopicChange = (value: string) => {
    const previousTopic = draftTopicValue || originalTopicValue;
    const hadGeneratedTopicState = Boolean(
      expansions.length ||
        selectedDirection ||
        searchTopic ||
        groundingJobMeta ||
        sources.length ||
        topicWorkflowStatus !== "idle",
    );
    if (hadGeneratedTopicState && previousTopic && previousTopic !== value.trim()) {
      previousTopicRef.current = previousTopic;
    }
    topicResetVersionRef.current += 1;
    currentTopicRunIdRef.current = null;
    setDraftTopic(value);
    setInput((current) => ({ ...current, topic: "" }));
    setSearchTopic("");
    setDisplayTitle("");
    setSelectedDirection(null);
    setExpansions([]);
    setCurrentTopicRunId(null);
    setTopicExpansionDiagnostics(null);
    setTopicExpansionMessage(null);
    setTitleSemanticComparison(null);
    setSelectedTitleSearchSeed(null);
    setTopicExpansionStatus("idle");
    setTopicWorkflowStatus("idle");
    setTopicDiagnosticsOpen(false);
    resetWorkflowState();
    setActiveStep("topic");
    clearGeneratorUrlState();
  };

  const handleDomainChange = (domain: ResearchDomain) => {
    const topic = draftTopicValue;
    topicResetVersionRef.current += 1;
    setSelectedDomain(domain);
    setSelectedDirection(null);
    setSearchTopic("");
    setDisplayTitle("");
    setSelectedTitleSearchSeed(null);
    resetWorkflowState();
    setActiveStep("topic");
    clearGeneratorUrlState();

    if (!topic) {
      currentTopicRunIdRef.current = null;
      setExpansions([]);
      setCurrentTopicRunId(null);
      setTopicExpansionMessage("請先輸入主題，再選擇研究領域開始搜尋資料。");
      setTopicExpansionStatus("idle");
      setTopicWorkflowStatus("idle");
      return;
    }

    const validation = validateTopicForWorkflow(topic, { domainHint: domain });
    if (validation.status === "invalid") {
      currentTopicRunIdRef.current = null;
      setExpansions([]);
      setCurrentTopicRunId(null);
      setTopicExpansionMessage("請輸入具體主題，或改選更適合的研究領域。");
      setTopicExpansionStatus("error");
      setTopicWorkflowStatus("invalid");
      return;
    }

    const domainLabel = researchDomainLabel(domain);
    const topicRunId = createTopicRunId(topic, domain);
    currentTopicRunIdRef.current = topicRunId;
    setCurrentTopicRunId(topicRunId);
    const cards = buildResearchDirectionCards(
      topic,
      domain,
      detectedCategory,
      topicRunId,
      previousTopicRef.current,
    ).filter((card) => {
      if (card.rawTopic !== topic) return false;
      if (card.researchDirection.topicRunId !== topicRunId) return false;
      return !directionHasSemanticContamination(
        card.researchDirection,
        topic,
        previousTopicRef.current,
      );
    });
    const defaultDirection = cards[0]?.researchDirection;
    setExpansions(cards);
    if (defaultDirection) {
      setSelectedDirection(Object.freeze({ ...defaultDirection }));
      setDisplayTitle(defaultDirection.displayTitleZh);
    }
    setTopicWorkflowStatus(
      validation.status === "sensitive_research_only"
        ? "sensitive_research_only"
        : "ready",
    );
    setTopicExpansionStatus("done");
    setTopicExpansionMessage(`已根據${domainLabel}領域建立查詢輔助方向；原始題目會保持不變。`);
  };

  useEffect(() => {
    return () => clearStepTransition();
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setLocationRestoreNonce((current) => current + 1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedDraftTopic(draftTopicValue);
    }, 800);
    return () => window.clearTimeout(timerId);
  }, [draftTopicValue]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("reportId");
    if (!reportId || workspaceResume?.loaded) return;

    const workspace = loadReportWorkspace(reportId);
    if (!workspace) return;
    if (!workspaceMatchesTopic(workspace, workspace.input.topic)) return;

    const resumeLock = {
      workflowId: workspace.workflowId,
      topicHash: workspace.topicHash,
      queryPlanHash:
        workspace.acceptedSources.find((source) => source.queryPlanHash)
          ?.queryPlanHash ?? workspace.topicHash,
    };
    setWorkspaceResume({ reportId, loaded: true });
    setInput(workspace.input);
    setDraftTopic(workspace.input.topic);
    setDebouncedDraftTopic(workspace.input.topic.trim());
    setDisplayTitle(workspace.generationPayload?.displayTitle ?? workspace.draft.title);
    setTopicWorkflowStatus("ready");
    setSearchTopic(
      workspace.generationPayload?.researchTopic &&
      workspace.generationPayload.researchTopic !== workspace.generationPayload.originalTopic
        ? workspace.generationPayload.researchTopic
        : "",
    );
    setSources(
      applyWorkflowLockToSources(
        workspace.acceptedSources,
        resumeLock,
        workspace.input.topic,
      ),
    );
    setGroundingJobMeta({
      jobId: reportId,
      workflowId: workspace.workflowId,
      topicHash: workspace.topicHash,
    });
    setGeneratorRunId(null);
    setStepHistory(
      workspace.acceptedSources.length > 0
        ? ["topic_input", "grounding_progress"]
        : workspace.input.topic.trim()
          ? ["topic_input"]
          : [],
    );
    setGroundingRequestState("ready_for_review");
    setSourceWorkflowId(resumeLock.workflowId);
    setSourceWorkspaceFingerprint(resumeLock.topicHash);
    setSourceQueryPlanHash(resumeLock.queryPlanHash);
    setSourceSearchStatus("done");
    setSourceSearchMessage("已載入報告工作區來源，可調整後重新生成。");
    setPresentation(normalizeReportPresentation(workspace.presentation));
    setActiveStep(
      workspace.acceptedSources.length > 0
        ? "manage"
        : workspace.input.topic.trim()
          ? "search"
          : "topic",
    );
    activeRunContextRef.current = {
      runId: null,
      workflowId: workspace.workflowId,
      topicHash: workspace.topicHash,
    };
  }, [locationRestoreNonce, workspaceResume?.loaded]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const workflowId = params.get("workflowId");
    const topicHash = params.get("topicHash");
    const runId = params.get("runId");
    const jobId = params.get("jobId");
    const routeStep = normalizeRouteStep(params.get("step"));
    const restoreVersion = topicResetVersionRef.current;
    if (!workflowId || !topicHash || !runId) return;
    if (workspaceResume?.loaded) return;

    const restoreFromSnapshot = () => {
      if (restoreVersion !== topicResetVersionRef.current) return false;
      const raw = window.sessionStorage.getItem(
        generatorSessionStorageKey(workflowId, topicHash),
      );
	      const snapshot = parseGeneratorSessionSnapshot(raw, {
	        workflowId,
	        topicHash,
	        runId,
	      });
	      if (!snapshot) return false;
	      if (restoreVersion !== topicResetVersionRef.current) return false;

      const snapshotJob = buildGroundingJobFromSnapshot(snapshot);
      const snapshotTerminal = groundingJobIsTerminal(snapshotJob);

	      setInput((current) => ({ ...current, topic: snapshot.submittedTopic }));
      setDraftTopic(snapshot.submittedTopic);
      setDebouncedDraftTopic(snapshot.submittedTopic);
      setSearchTopic(
        snapshot.researchTopic !== snapshot.submittedTopic
          ? snapshot.researchTopic
          : "",
      );
      setDisplayTitle(snapshot.displayTitle);
      setTopicWorkflowStatus("ready");
      setGroundingJobMeta({
        jobId: snapshot.groundingJobId,
        workflowId: snapshot.workflowId,
        topicHash: snapshot.topicHash,
      });
      setGroundingJob(snapshotJob);
      setGroundingRequestState(
        snapshotTerminal ? groundingRequestStateForJob(snapshotJob) : "polling_job",
      );
      setGroundingError(null);
      setGeneratorRunId(snapshot.runId);
      setStepHistory(snapshot.stepHistory);
      setSources(snapshot.sourceCandidates);
      setSourceWorkflowId(snapshot.workflowId);
      setSourceWorkspaceFingerprint(snapshot.topicHash);
      setSourceQueryPlanHash(snapshot.queryPlan?.topicHash ?? snapshot.topicHash);
      setSourceSearchStatus(
        snapshot.sourceCandidates.length > 0
          ? "done"
          : snapshotTerminal
            ? "empty"
            : "loading",
      );
      setSourceSearchMessage(
        snapshotTerminal
          ? "已從本機工作階段還原查詢狀態。"
          : GROUNDING_STATUS_LABELS[snapshotJob.status],
      );
      setIsSearchingSources(!snapshotTerminal);
      setRestoreMessage(null);
        setActiveStep(
          snapshotTerminal ? internalStepForRoute(routeStep ?? snapshot.step) : "search",
        );
      activeRunContextRef.current = {
        runId: snapshot.runId,
        workflowId: snapshot.workflowId,
        topicHash: snapshot.topicHash,
      };
      return true;
    };

    if (restoreFromSnapshot()) return;
    if (!jobId) {
      setRestoreMessage("此查詢狀態已失效，請重新搜尋。");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchResearchGroundingJob(jobId);
        if (cancelled) return;
        if (restoreVersion !== topicResetVersionRef.current) return;
        if (result.workflowId !== workflowId) {
          setRestoreMessage("此查詢狀態已失效，請重新搜尋。");
          return;
        }
        if (result.topicHash !== topicHash) {
          syncGeneratorUrl({
            step: routeStep ?? "grounding_progress",
            workflowId: result.workflowId,
            topicHash: result.topicHash,
            runId,
            jobId,
            mode: "replace",
          });
        }
        const restoredSources = groundingJobToSourceRecords(result);
        setInput((current) => ({ ...current, topic: result.originalTopic }));
        setDraftTopic(result.originalTopic);
        setDebouncedDraftTopic(result.originalTopic);
        setSearchTopic("");
        setDisplayTitle(result.originalTopic);
        setTopicWorkflowStatus("ready");
        setGroundingJobMeta({
          jobId,
          workflowId: result.workflowId,
          topicHash: result.topicHash,
        });
        setGroundingJob(result);
        setKeywordSearchDebug(keywordSearchDebugFromGroundingJob(result));
        if (result.groundingDiagnostics) {
          console.info("[ResearchForge][grounding-diagnostics]", result.groundingDiagnostics);
        }
        if (groundingJobNeedsTopicRefinement(result)) {
          returnToTopicRefinement(result);
          return;
        }
        const resultTerminal = groundingJobIsTerminal(result);
        setGroundingRequestState(
          resultTerminal ? groundingRequestStateForJob(result) : "polling_job",
        );
        setGroundingError(
          result.status === "failed"
            ? result.warnings[0] ?? "Research grounding job 失敗。"
            : null,
        );
        setGeneratorRunId(runId);
        setStepHistory(generatorRouteHistoryForStep(routeStep ?? "grounding_progress"));
        setSources(restoredSources);
        setSourceWorkflowId(result.workflowId);
        setSourceWorkspaceFingerprint(result.topicHash);
        setSourceQueryPlanHash(queryPlanHashFromJob(result));
        const restoredReviewableCount = visibleReviewCandidateSources(restoredSources).length;
        const restoredCanProceedToSourceReview =
          result.groundingDiagnostics?.canProceedToSourceReview ??
          restoredReviewableCount >= MIN_REVIEWABLE_SOURCE_COUNT;
        setSourceSearchStatus(
          restoredSources.length > 0
            ? restoredCanProceedToSourceReview
              ? "done"
              : "empty"
            : resultTerminal
              ? "empty"
              : "loading",
        );
        setSourceSearchMessage(
          restoredSources.length > 0 && restoredCanProceedToSourceReview
            ? "已從 research grounding job 還原目前可用結果。"
            : restoredSources.length > 0
              ? result.groundingDiagnostics?.userVisibleStatus ??
                `只找到 ${restoredReviewableCount} 筆可審查來源，未達最低 ${MIN_REVIEWABLE_SOURCE_COUNT} 筆；請放寬搜尋或重新搜尋。`
            : resultTerminal
              ? "已還原 query plan，但來源審查狀態已失效，請重新搜尋。"
              : GROUNDING_STATUS_LABELS[result.status],
        );
        setIsSearchingSources(!resultTerminal);
        setRestoreMessage(
          routeStep && routeStep !== "grounding_progress"
            ? "此查詢狀態已失效，請重新生成。"
            : null,
        );
        setActiveStep(
          resultTerminal && restoredSources.length > 0 && restoredCanProceedToSourceReview && routeStep
            ? internalStepForRoute(routeStep)
            : "search",
        );
        activeRunContextRef.current = {
          runId,
          workflowId: result.workflowId,
          topicHash: result.topicHash,
        };
	      } catch {
	        if (!cancelled) {
	          try {
	            window.sessionStorage.removeItem(
	              generatorSessionStorageKey(workflowId, topicHash),
	            );
	          } catch {
	            // Ignore storage cleanup failures; the visible state is still reset.
	          }
	          setGroundingJobMeta(null);
	          setGroundingJob(null);
	          setGroundingRequestState("idle");
	          setGroundingError(null);
	          setSources([]);
	          setSourceWorkflowId(null);
	          setSourceWorkspaceFingerprint(null);
	          setSourceQueryPlanHash(null);
	          setSourceSearchStatus("idle");
	          setSourceSearchMessage("");
	          setIsSearchingSources(false);
	          setStepHistory([]);
	          setActiveStep("topic");
	          clearGeneratorUrlState();
	          setRestoreMessage("此查詢狀態已失效，請重新搜尋。");
	        }
	      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceResume?.loaded]);

  useEffect(() => {
    if (!groundingJobMeta?.jobId) return;
    if (workspaceResume?.loaded && sources.length > 0) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    const pollAbortController = new AbortController();

    const poll = async () => {
      try {
        const result = await fetchResearchGroundingJob(
          groundingJobMeta.jobId,
          pollAbortController.signal,
        );
        if (cancelled) return;
        const expectedWorkflowIds = new Set(
          [activeRunContextRef.current.workflowId, groundingJobMeta.workflowId].filter(
            (value): value is string => Boolean(value),
          ),
        );
        if (!expectedWorkflowIds.has(result.workflowId)) return;
        if (result.topicHash !== groundingJobMeta.topicHash) {
          setGroundingJobMeta((current) =>
            current?.jobId === groundingJobMeta.jobId &&
            current.workflowId === result.workflowId
              ? { ...current, topicHash: result.topicHash }
              : current,
          );
          if (generatorRunId) {
            syncGeneratorUrl({
              step: "grounding_progress",
              workflowId: result.workflowId,
              topicHash: result.topicHash,
              runId: generatorRunId,
              jobId: groundingJobMeta.jobId,
              mode: "replace",
            });
          }
        }
        activeRunContextRef.current = {
          runId: activeRunContextRef.current.runId ?? generatorRunId,
          workflowId: result.workflowId,
          topicHash: result.topicHash,
        };

        setGroundingJob(result);
        setKeywordSearchDebug(keywordSearchDebugFromGroundingJob(result));
        if (result.groundingDiagnostics) {
          console.info("[ResearchForge][grounding-diagnostics]", result.groundingDiagnostics);
        }
        setGroundingError(
          result.status === "failed" ? result.warnings[0] ?? "Research grounding job 失敗。" : null,
        );
        setSourceWorkflowId(result.workflowId);
        setSourceWorkspaceFingerprint(result.topicHash);
        setSourceQueryPlanHash(queryPlanHashFromJob(result));
        if (groundingJobNeedsTopicRefinement(result)) {
          returnToTopicRefinement(result, true);
          return;
        }

        const nextSources = groundingJobToSourceRecords(result);
        setSources((current) => mergeLocalSourceReviewState(nextSources, current));

        const terminal = groundingJobIsTerminal(result);
        if (terminal) {
          setGroundingRequestState(groundingRequestStateForJob(result));
          setIsSearchingSources(false);
          if (result.status === "failed") {
            setSourceSearchStatus("error");
            setSourceSearchMessage(result.warnings[0] ?? "資料接地失敗。");
          } else if (nextSources.length > 0) {
            const primaryCount = primaryCandidateSources(nextSources).length;
            const reviewableCount = visibleReviewCandidateSources(nextSources).length;
            const canProceedToSourceReview =
              result.groundingDiagnostics?.canProceedToSourceReview ??
              reviewableCount >= MIN_REVIEWABLE_SOURCE_COUNT;
            if (reviewableCount === 0) {
              setSourceSearchStatus("empty");
              setSourceSearchMessage(
                result.groundingDiagnostics?.finalUiState === "raw_results_filtered_relaxed_review_fallback"
                  ? "找到資料但被篩選器全部排除，已自動放寬條件並保留最高分來源供審查。"
                  : "已收到來源回應，但目前沒有可審查來源通過篩選；請查看 diagnostics 後放寬條件重試。",
              );
              return;
            }
            if (!canProceedToSourceReview) {
              setSourceSearchStatus("empty");
              setSourceSearchMessage(
                result.groundingDiagnostics?.userVisibleStatus ??
                  `只找到 ${reviewableCount} 筆可審查來源，未達最低 ${MIN_REVIEWABLE_SOURCE_COUNT} 筆；請放寬搜尋或重新搜尋。`,
              );
              return;
            }
            setSourceSearchStatus("done");
            setSourceSearchMessage(
              result.groundingDiagnostics?.userVisibleStatus ??
              (primaryCount < MIN_PRIMARY_SOURCE_COUNT
                ? `${GROUNDING_STATUS_LABELS[result.status]}，目前共有 ${reviewableCount} 筆可審查來源。主要來源不足，請在來源審查中人工確認。`
                : `${GROUNDING_STATUS_LABELS[result.status]}，目前共有 ${reviewableCount} 筆可審查來源。`),
            );
            scheduleManageStepAfterSearch(reviewableCount);
          } else {
            setSourceSearchStatus("empty");
            setSourceSearchMessage(
              result.groundingDiagnostics?.finalUiState === "provider_failed"
                ? "來源服務暫時無法取得資料，請稍後重試。已記錄 provider error。"
                : result.groundingDiagnostics?.finalUiState === "no_sources_after_fallback" ||
                    result.status === "no_sources_after_fallback"
                  ? "所有自動 fallback 查詢完成後，仍未取得可審查來源。"
                  : result.groundingDiagnostics?.finalUiState === "searching_fallback" ||
                      result.status === "searching_fallback"
                    ? "系統正在改用更精確的學術查詢重新搜尋……"
                    : result.warnings[0] ?? "已建立 query plan，但暫時還沒有可用來源。",
            );
          }
          return;
        }

        setGroundingRequestState(groundingRequestStateForJob(result));
        setSourceSearchStatus("loading");
        setSourceSearchMessage(GROUNDING_STATUS_LABELS[result.status]);
        timeoutId = window.setTimeout(() => {
          void poll();
        }, 1200);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setGroundingRequestState("job_poll_failed");
        setGroundingError("搜尋任務狀態讀取失敗，請稍後再試。");
        setIsSearchingSources(false);
        setSourceSearchStatus("error");
        setSourceSearchMessage("搜尋任務狀態讀取失敗，請稍後再試。");
      }
    };

    void poll();

    return () => {
      cancelled = true;
      pollAbortController.abort();
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [generatorRunId, groundingJobMeta, sources.length, workspaceResume?.loaded]);

  useEffect(() => {
    if (!groundingJobMeta?.jobId || !generatorRunId) return;
    if (!groundingRequestIsLoading(groundingRequestState)) return;
    if (activeStep === "topic") {
      setActiveStep("search");
    }
    syncGeneratorUrl({
      step: "grounding_progress",
      workflowId: groundingJobMeta.workflowId,
      topicHash: groundingJobMeta.topicHash,
      runId: generatorRunId,
      jobId: groundingJobMeta.jobId,
      mode: "replace",
    });
  }, [
    activeStep,
    generatorRunId,
    groundingJobMeta?.jobId,
    groundingJobMeta?.topicHash,
    groundingJobMeta?.workflowId,
    groundingRequestState,
  ]);

  useEffect(() => {
    if (
      !generatorRunId ||
      !sourceWorkflowId ||
      !sourceWorkspaceFingerprint ||
      !groundingJobMeta?.jobId
    ) {
      return;
    }
    const snapshot: GeneratorSessionSnapshot = {
      payloadVersion: 3,
      runId: generatorRunId,
      workflowId: sourceWorkflowId,
      topicHash: sourceWorkspaceFingerprint,
      step: currentRouteStep,
      stepHistory,
      submittedTopic: originalTopicValue,
      researchTopic: activeResearchTopic,
      displayTitle: displayTitleValue,
      groundingJobId: groundingJobMeta.jobId,
      groundingStatus: groundingJob?.status ?? null,
      groundingProgress:
        typeof groundingJob?.progress === "number" ? groundingJob.progress : null,
      warnings: groundingJob?.warnings ?? [],
      queryPlan: groundingJob?.queryPlan ?? null,
      seedQueryPlan: groundingJob?.seedQueryPlan ?? null,
      groundingJob,
      sourceCandidates: currentWorkflowSources,
      acceptedSources,
      evidenceCards: acceptedEvidenceCards,
      academicSafetyReview,
      researchCandidates: groundingJob?.researchCandidates ?? [],
      reportDraft: groundingJob?.reportDraft ?? null,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.sessionStorage.setItem(
        generatorSessionStorageKey(sourceWorkflowId, sourceWorkspaceFingerprint),
        JSON.stringify(snapshot),
      );
    } catch {
      // Ignore quota/storage issues; the live workflow remains usable.
    }
  }, [
    acceptedEvidenceCards,
    acceptedSources,
    academicSafetyReview,
    activeResearchTopic,
    currentRouteStep,
    currentWorkflowSources,
    displayTitleValue,
    generatorRunId,
    groundingJob,
    groundingJobMeta?.jobId,
    originalTopicValue,
    sourceWorkflowId,
    sourceWorkspaceFingerprint,
    stepHistory,
  ]);

  const submitGroundingTopic = async (options?: {
    researchTopicOverride?: string | null;
    displayTitleOverride?: string | null;
    normalizedTopicOverride?: string | null;
    researchQuestionOverride?: string | null;
    querySeedZhOverride?: string[];
    querySeedEnOverride?: string[];
    excludeTermsOverride?: string[];
    selectedDomainOverride?: ResearchDomain | null;
    forceRerun?: boolean;
  }) => {
    const nextSubmittedTopic = draftTopicValue;
    const nextNormalizedTopic = options?.normalizedTopicOverride?.trim() ?? "";
    const nextResearchTopicHint = options?.researchTopicOverride?.trim() ?? "";
    const hasResearchTopicOverride = Boolean(
      nextResearchTopicHint || nextNormalizedTopic,
    );
    const nextResearchTopic = nextSubmittedTopic;
    const requestNormalizedTopic =
      nextNormalizedTopic || nextResearchTopicHint || undefined;
    const requestResearchQuestion =
      options?.researchQuestionOverride?.trim() ||
      requestNormalizedTopic ||
      nextResearchTopic;
    const requestQuerySeedZh = Array.from(new Set(options?.querySeedZhOverride ?? []));
    const requestQuerySeedEn = Array.from(new Set(options?.querySeedEnOverride ?? []));
    const requestExcludeTerms = Array.from(new Set(options?.excludeTermsOverride ?? []));
    const requestSelectedDomain = options?.selectedDomainOverride ?? selectedDomain ?? undefined;

    if (nextSubmittedTopic.length < 2) {
      toast({
        title: "請先輸入主題",
        description: "主題至少需要 2 個字，才能建立 research grounding job。",
        variant: "destructive",
      });
      return;
    }

    if (hasInvalidDraftTopic) {
      toast({
        title: "主題無效",
        description: "請改用具體且有語意的主題後，再開始搜尋。",
        variant: "destructive",
      });
      return;
    }

    const parsedDraft = parseResearchInput(nextResearchTopic);
    if (parsedDraft.nextAction === "block") {
      setTopicExpansionMessage(parsedDraft.safetyReason);
      setTopicExpansionStatus("error");
      setExpansions([]);
      toast({
        title: "主題已被安全阻擋",
        description: parsedDraft.safetyReason,
        variant: "destructive",
      });
      return;
    }
    if (!hasResearchTopicOverride && parsedDraft.nextAction === "show_topic_options") {
      setTopicExpansionMessage("主題仍然偏短或多義，請先選一個更明確的研究方向。");
      setTopicExpansionStatus("done");
      setExpansions([]);
      toast({
        title: "請先縮小研究方向",
        description: "這個輸入仍然過短或多義，先從建議方向中選一個再搜尋。",
      });
      return;
    }
    if (!hasResearchTopicOverride && parsedDraft.nextAction === "ask_clarification") {
      setTopicExpansionMessage(
        parsedDraft.safetyStatus === "needs_reframe"
          ? parsedDraft.safetyReason
          : "請補充研究對象、變項、比較條件或研究範圍後再搜尋。",
      );
      setTopicExpansionStatus("error");
      setExpansions([]);
      toast({
        title: "主題還需要補充",
        description:
          parsedDraft.safetyStatus === "needs_reframe"
            ? parsedDraft.safetyReason
            : "請補充研究對象、變項、比較條件或研究範圍後再搜尋。",
        variant: "destructive",
      });
      return;
    }

    const unchangedTopic =
      !options?.forceRerun &&
      nextSubmittedTopic === originalTopicValue &&
      Boolean(groundingJobMeta?.jobId || currentWorkflowSources.length);
    if (unchangedTopic) {
      transitionToStep("search", {
        pushCurrentStep: true,
        historyMode: "push",
        routeStep: "grounding_progress",
      });
      return;
    }

    const workflowId = createClientWorkflowId();
    const runId = createClientRunId();
    const requestId = createClientWorkflowId();
    const attemptId = createClientRunId();
    const topicHash = reportTopicFingerprint(nextSubmittedTopic);
    groundingCreateAbortRef.current?.abort();
    const createAbortController = new AbortController();
    groundingCreateAbortRef.current = createAbortController;
    clearStaleGeneratorSessionStorage(workflowId);

    clearStepTransition();
    setInput((current) => ({
      ...current,
      topic: nextSubmittedTopic,
      targetAudience:
        current.targetAudience || academicToAudience(current.academicLevel),
      purpose: academicToPurpose(current.academicLevel),
    }));
    setDebouncedDraftTopic(nextSubmittedTopic);
    setExpansions([]);
    setTopicExpansionDiagnostics(null);
    setDisplayTitle(options?.displayTitleOverride?.trim() ?? "");
    setSearchTopic("");
    setSelectedTitleSearchSeed(null);
    setTopicExpansionMessage(null);
    setTitleSemanticComparison(null);
    setTopicExpansionStatus("idle");
    setTopicWorkflowStatus("ready");
    setTopicDiagnosticsOpen(false);
    setRestoreMessage(null);
    setStepHistory(["topic_input"]);
    setActiveStep("search");
    setGroundingJobMeta(null);
    setGroundingJob(null);
    setGroundingRequestState("creating_job");
    setGroundingError(null);
    setSources([]);
    setSourceWorkflowId(workflowId);
    setSourceWorkspaceFingerprint(topicHash);
    setSourceQueryPlanHash(topicHash);
    setSearchRequestDebug(null);
    setKeywordSearchDebug(null);
    setSourceSearchStatus("loading");
    setSourceSearchMessage("正在建立搜尋任務，provider 尚未開始。");
    setGenerateStatus("idle");
    setGenerateErrorMessage(null);
    setIsGenerating(false);
    setIsSearchingSources(true);
    setWorkspaceResume(null);
    setPresentation(normalizeReportPresentation(DEFAULT_REPORT_PRESENTATION));
    setGeneratorRunId(runId);
    activeRunContextRef.current = {
      runId,
      workflowId,
      topicHash,
    };
    syncGeneratorUrl({
      step: "grounding_progress",
      workflowId,
      topicHash,
      runId,
      jobId: null,
      mode: "push",
    });

    try {
      const response = await createResearchGroundingJob({
        workflowId,
        requestId,
        attemptId,
        rawUserTopic: nextSubmittedTopic,
        originalTopic: nextSubmittedTopic,
        topic: nextSubmittedTopic,
        normalizedTopic: requestNormalizedTopic,
        selectedDomain: requestSelectedDomain,
        researchQuestion: requestResearchQuestion,
        bilingualQueries:
          requestQuerySeedZh.length || requestQuerySeedEn.length
            ? { zh: requestQuerySeedZh, en: requestQuerySeedEn }
            : undefined,
        querySeedZh: requestQuerySeedZh.length ? requestQuerySeedZh : undefined,
        querySeedEn: requestQuerySeedEn.length ? requestQuerySeedEn : undefined,
        excludeTerms: requestExcludeTerms.length ? requestExcludeTerms : undefined,
        reportType: input.reportType,
        audience: input.targetAudience || input.academicLevel,
        searchProfile: input.researchDepth,
        debugTrace: true,
      }, createAbortController.signal);
      if (groundingCreateAbortRef.current === createAbortController) {
        groundingCreateAbortRef.current = null;
      }
      if (runId !== activeRunContextRef.current.runId) return;
      if (workflowId !== activeRunContextRef.current.workflowId) return;
      if (topicHash !== activeRunContextRef.current.topicHash) return;
      setGroundingJobMeta(response);
      setGroundingRequestState("polling_job");
      setSourceWorkflowId(response.workflowId);
      setSourceWorkspaceFingerprint(response.topicHash);
      setSourceQueryPlanHash(response.topicHash);
      activeRunContextRef.current = {
        runId,
        workflowId: response.workflowId,
        topicHash: response.topicHash,
      };
      syncGeneratorUrl({
        step: "grounding_progress",
        workflowId: response.workflowId,
        topicHash: response.topicHash,
        runId,
        jobId: response.jobId,
        mode: "replace",
      });
    } catch (error) {
      if (createAbortController.signal.aborted) return;
      if (runId !== activeRunContextRef.current.runId) return;
      const message = error instanceof Error ? error.message : "無法建立搜尋任務。";
      console.warn("[ResearchForge] research grounding job creation failed", message);
      setGroundingJobMeta(null);
      setGroundingJob(null);
      setGroundingRequestState("job_create_failed");
      setGroundingError(
        error instanceof ResearchGroundingApiError && error.code === "GROUNDING_STORE_NOT_CONFIGURED"
          ? "搜尋服務尚未完成儲存空間設定，請通知系統管理員設定後再試。"
          : "無法建立搜尋任務，請確認 API 連線後重新搜尋。",
      );
      setIsSearchingSources(false);
      setSourceSearchStatus("error");
      setSourceSearchMessage("無法建立搜尋任務；provider 尚未開始。");
    }
  };

  const handleUseParsedTopicOption = (option: ParsedResearchInput["topicOptions"][number]) => {
    setDraftTopic(option.canonicalTopic);
    setDisplayTitle(option.label);
    setTopicExpansionMessage(`已改用較明確的研究方向：${option.researchQuestion}`);
    setTopicExpansionStatus("done");
  };

  const handleTopicInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || isTopicComposing) return;
    event.preventDefault();
    if (!selectedDomain) {
      setTopicExpansionMessage("請先選擇一個研究領域。");
      return;
    }
    const plan = domainFocusedResearchPlan(draftTopicValue, selectedDomain);
    void submitGroundingTopic({
      researchTopicOverride: plan.researchTopic,
      displayTitleOverride: plan.displayTitle,
      normalizedTopicOverride: plan.normalizedTopic,
      researchQuestionOverride: plan.researchQuestion,
      querySeedZhOverride: plan.querySeedZh,
      querySeedEnOverride: plan.querySeedEn,
      excludeTermsOverride: plan.excludeTerms,
      selectedDomainOverride: selectedDomain,
      forceRerun: true,
    });
  };

  // ── Source search ──────────────────────────────────────────────────────────

  const handleSearchSources = async (refinedTopicOverride?: unknown) => {
    const originalTopic = originalTopicValue;
    const activeTopic =
      (typeof refinedTopicOverride === "string" ? refinedTopicOverride.trim() : "") ||
      activeResearchTopic;
    const selectedResearchPayload = selectedTitleSearchSeed
      ? buildSelectedTitleSearchPayload({
          seed: selectedTitleSearchSeed,
          diagnostics: topicExpansionDiagnostics,
        })
      : null;
    const payloadDisplayTitle = selectedResearchPayload?.displayTitle ?? activeTopic;
    const payloadCanonicalTopicZh =
      selectedResearchPayload?.canonicalTopicZh?.trim() || activeTopic;
    const payloadCanonicalTopicEn =
      selectedResearchPayload?.canonicalTopicEn?.trim() || "";
    const payloadQuerySeedZh = selectedResearchPayload?.querySeedZh ?? [];
    const payloadQuerySeedEn = selectedResearchPayload?.querySeedEn ?? [];
    const searchTopicUnderstanding = activeTopic
      ? understandTopic(activeTopic)
      : null;
    if (!originalTopic) {
      setSourceSearchStatus("error");
      setSourceSearchMessage("請先輸入研究主題。");
      setActiveStep("topic");
      toast({
        title: "請先輸入主題",
        description:
          "輸入研究主題後，才能搜尋 OpenAlex、Crossref 與 Semantic Scholar 來源。",
        variant: "destructive",
      });
      return;
    }
    if (searchTopicUnderstanding?.topicKind === "unknown_or_noise") {
      setSourceSearchStatus("error");
      setSourceSearchMessage("查無有效主題，請改用具體且有語意的研究主題後再搜尋來源。");
      setSearchRequestDebug({
        statusCode: null,
        backendMessage: "invalid topic blocked in generator",
        payloadOriginalTopic: originalTopic,
        payloadActiveResearchTopic: activeTopic,
        payloadDisplayTitle,
        payloadCanonicalTopicZh,
        payloadCanonicalTopicEn,
        payloadQuerySeedZh,
        payloadQuerySeedEn,
      });
      setKeywordSearchDebug(null);
      setSources([]);
      setSourceWorkspaceFingerprint(null);
      setSourceWorkflowId(null);
      setSourceQueryPlanHash(null);
      setActiveStep("topic");
      toast({
        title: "主題無效",
        description: "這個輸入不像有效研究主題，因此不會送出來源搜尋。",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingSources(true);
    setSourceSearchStatus("loading");
    setSourceSearchMessage("");
    setSearchRequestDebug({
      statusCode: null,
      backendMessage: "",
      payloadOriginalTopic: originalTopic,
      payloadActiveResearchTopic: activeTopic,
      payloadDisplayTitle,
      payloadCanonicalTopicZh,
      payloadCanonicalTopicEn,
      payloadQuerySeedZh,
      payloadQuerySeedEn,
    });
    setKeywordSearchDebug(null);
    setSources([]);
    setSourceWorkspaceFingerprint(null);
    setSourceWorkflowId(null);
    setSourceQueryPlanHash(null);
    if (stepDelayTimerRef.current !== null) {
      window.clearTimeout(stepDelayTimerRef.current);
      stepDelayTimerRef.current = null;
    }

    try {
      if (
        selectedTitleSearchSeed &&
        payloadQuerySeedZh.length === 0 &&
        payloadQuerySeedEn.length === 0
      ) {
        setSourceSearchStatus("error");
        setSourceSearchMessage("研究查詢種子尚未生成，請重新生成研究方向。");
        toast({
          title: "缺少研究查詢種子",
          description: "請重新生成研究方向後，再開始搜尋來源。",
          variant: "destructive",
        });
        return;
      }

      const payloadTopic = payloadCanonicalTopicZh || activeTopic;
      const reportTopicForWorkflow = activeTopic;
      const workflowIdForSearch = sourceWorkflowId ?? createClientWorkflowId();
      console.info("[ResearchForge][search-payload]", {
        displayTitle: payloadDisplayTitle,
        canonicalTopicZh: payloadCanonicalTopicZh,
        canonicalTopicEn: payloadCanonicalTopicEn,
        querySeedZhCount: payloadQuerySeedZh.length,
        querySeedEnCount: payloadQuerySeedEn.length,
        subtopicsCount: selectedResearchPayload?.subtopics.length ?? 0,
        workflowId: workflowIdForSearch,
      });
      const result = await searchSources({
        originalTopic,
        refinedTopic:
          activeTopic && activeTopic !== originalTopic ? activeTopic : undefined,
        topic: payloadTopic,
        displayTitle: payloadDisplayTitle,
        canonicalTopicZh: payloadCanonicalTopicZh,
        canonicalTopicEn: payloadCanonicalTopicEn || undefined,
        querySeedZh: payloadQuerySeedZh,
        querySeedEn: payloadQuerySeedEn,
        subtopics: selectedResearchPayload?.subtopics,
        mustIncludeTerms: selectedResearchPayload?.mustIncludeTerms,
        excludeTerms: selectedResearchPayload?.excludeTerms,
        domainHints: selectedResearchPayload?.domainHints,
        selectedResearchPlanId: selectedResearchPayload?.selectedResearchPlanId,
        workflowId: workflowIdForSearch,
        searchProfile: input.researchDepth,
        sourceMixProfile: sourceMixProfileForGeneratorInput(input),
        reportType: input.reportType,
        audience: input.targetAudience || input.academicLevel,
        sourceMode: input.sourceRequirement,
        language: input.outputLanguage,
      });
      const responseHasSources =
        Array.isArray(result.sources) && result.sources.length > 0;
      const workflowLock: SourceWorkflowLock = {
        workflowId:
          result.workflowId ??
          result.searchTrace?.workflowId ??
          createClientWorkflowId(),
        topicHash: reportTopicFingerprint(reportTopicForWorkflow),
        queryPlanHash:
          result.queryPlanHash ??
          result.searchTrace?.queryPlanHash ??
          reportTopicFingerprint(
            result.queries
              ? [
                  ...result.queries.highPrecision,
                  ...result.queries.english,
                  ...result.queries.chinese,
                  ...result.queries.broad,
                ].join(" ")
              : activeTopic,
          ),
      };
      const dedupedSources = dedupeSourceRecords(
        supplementTrustedClimateSources(
          result.sources.map(normalizeSourceForReview),
          reportTopicForWorkflow,
        ),
      );
      const relevanceAssessedSources = applySourceRelevanceAssessments(
        dedupedSources,
        reportTopicForWorkflow,
      );
      const normalizedSources = applySourceAuthorityAndLanguage(
        relevanceAssessedSources,
      );
      const workflowSources = autoAcceptPrimarySources(applyWorkflowLockToSources(
        normalizedSources,
        workflowLock,
        reportTopicForWorkflow,
      ));
      setSources(workflowSources);
      setSourceWorkflowId(workflowLock.workflowId);
      setSourceWorkspaceFingerprint(workflowLock.topicHash);
      setSourceQueryPlanHash(workflowLock.queryPlanHash);
      setKeywordSearchDebug(keywordSearchDebugFromResult(result));
      const partialProviderFailure = hasProviderFailures(result);
      const diagnosticStatus = sourceSearchDiagnosticStatus(result);
      if (workflowSources.length) {
        const primaryCount = workflowSources.filter(
          (source) =>
            sourceDisplayGate(source) === "primary" &&
            source.relevanceLevel === "primary" &&
            source.shouldShowInMainList !== false,
        ).length;
        const reviewableCount = visibleReviewCandidateSources(workflowSources).length;
        const secondaryCount = workflowSources.filter(
          (source) => sourceDisplayGate(source) === "secondary",
        ).length;
        const searchSummaryMessage = sourceSearchUserMessage({
          status: diagnosticStatus,
          reviewableCount,
          primaryCount,
          secondaryCount,
          totalCount: workflowSources.length,
          warnings: result.warnings,
        });
        if (primaryCount < MIN_PRIMARY_SOURCE_COUNT && reviewableCount === 0) {
          const searchDiagnostics = (result as SourceSearchResultWithDiagnostics).diagnostics;
          const insufficientPrimaryMessage =
            searchDiagnostics?.provider_search_results_count && searchDiagnostics.provider_search_results_count > 0
              ? "找到資料但被篩選器全部排除，已自動放寬條件並保留最高分來源供審查。"
              : `主要來源不足：目前 ${primaryCount} 筆，至少需要 ${MIN_PRIMARY_SOURCE_COUNT} 筆。請改選更合適的研究領域，或調整主題後重新搜尋。`;
          setSourceSearchStatus("empty");
          setSourceSearchMessage(insufficientPrimaryMessage);
          toast({
            title: "主要來源不足",
            description: insufficientPrimaryMessage,
          });
          return;
        }
        if (reviewableCount === 0) {
          setSourceSearchStatus("done");
          setSourceSearchMessage(searchSummaryMessage);
          toast({
            title: partialProviderFailure ? "部分來源搜尋失敗" : "已找到來源",
            description: searchSummaryMessage,
          });
          scheduleManageStepAfterSearch(workflowSources.length);
          return;
        }
        setSourceSearchStatus("done");
        setSourceSearchMessage(searchSummaryMessage);
        toast({
          title: partialProviderFailure ? "部分來源搜尋失敗" : "已找到來源",
          description: partialProviderFailure
            ? `已顯示可用來源，部分資料來源暫時無法使用。${searchSummaryMessage}`
            : searchSummaryMessage,
        });
        scheduleManageStepAfterSearch(workflowSources.length);
      } else {
        const noSourceMessage =
          diagnosticStatus === "timeout"
            ? "來源搜尋服務逾時，尚未取得有效來源。請稍後重試或更換更具體的主題。"
            : diagnosticStatus === "failed"
              ? "來源搜尋暫時失敗，尚未取得有效來源。請稍後重試或更換更具體的主題。"
              : partialProviderFailure && !responseHasSources
                ? "部分來源提供者暫時無法使用，且本次尚未取得有效來源。請稍後重試或更換更具體的主題。"
                : responseHasSources
                  ? "已收到來源回應，但目前沒有可用來源通過篩選；請調整主題或重新搜尋。"
                  : "目前沒有取得有效來源，請換更具體的關鍵詞再試一次。";
        setSourceSearchStatus(
          diagnosticStatus === "timeout" || diagnosticStatus === "failed"
            ? "error"
            : "empty",
        );
        setSourceSearchMessage(noSourceMessage);
        toast({
          title:
            diagnosticStatus === "timeout" || diagnosticStatus === "failed"
              ? "來源搜尋暫時失敗"
              : "尚未找到可用來源",
          description: noSourceMessage,
          variant:
            diagnosticStatus === "timeout" || diagnosticStatus === "failed"
              ? "destructive"
              : "default",
        });
      }
    } catch (error) {
      const apiError = error as { status?: number; data?: unknown };
      const backendMessage =
        (apiError?.data &&
        typeof apiError.data === "object" &&
        "message" in apiError.data &&
        typeof (apiError.data as { message?: unknown }).message === "string"
          ? (apiError.data as { message: string }).message
          : sourceTechnicalErrorMessage(error));
      setSearchRequestDebug({
        statusCode: typeof apiError?.status === "number" ? apiError.status : null,
        backendMessage,
        payloadOriginalTopic: originalTopic,
        payloadActiveResearchTopic: activeTopic,
        payloadDisplayTitle,
        payloadCanonicalTopicZh,
        payloadCanonicalTopicEn,
        payloadQuerySeedZh,
        payloadQuerySeedEn,
      });
      setSourceSearchStatus("error");
      setSourceSearchMessage(sourceErrorMessage(error));
      toast({
        title: "來源搜尋失敗",
        description: sourceErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSearchingSources(false);
    }
  };

  const updateSourceRecord = (
    sourceId: string,
    patch: Partial<SourceRecord>,
  ) => {
    setSources((current) =>
      current.map((source) => {
        const key = source.id || sourceRecordKey(source);
        if (key !== sourceId) return source;
        return normalizeSourceForReview({ ...source, ...patch, id: key });
      }),
    );
  };

  const updateSourceReview = (
    sourceId: string,
    reviewState: SourceReviewState,
  ) => {
    const source = sources.find(
      (item) => (item.id || sourceRecordKey(item)) === sourceId,
    );
    if (reviewState === "accepted") {
      const blockReason = source
        ? sourceAcceptBlockReason(source, sourceWorkflowLock)
        : "source_not_found";
      if (blockReason) {
        toast({
          title: "無法接受此來源",
          description:
            blockReason === "workflow_mismatch" ||
            blockReason === "topic_mismatch" ||
            blockReason === "query_plan_mismatch"
              ? "此來源不屬於目前工作流程，請重新搜尋目前主題後再接受。"
              : "此來源目前不屬於可用來源範圍。",
          variant: "destructive",
        });
        return;
      }
      if (
        source &&
        (source.usageRecommendation === "exclude" ||
          source.topicalRelevanceLabel === "irrelevant" ||
          source.classification === "off_topic" ||
          source.classification === "trusted_but_off_topic" ||
          source.relevanceLevel === "off_topic")
      ) {
        toast({
          title: "無法接受離題來源",
          description: "這筆來源已被判定為偏題或不建議採用，不能作為正式 accepted source。",
          variant: "destructive",
        });
        return;
      }
    }

    setSources((current) =>
      updateSourceReviewState(current, sourceId, reviewState).map((item) => {
        const key = item.id || sourceRecordKey(item);
        if (key !== sourceId) return item;
        return normalizeSourceForReview({
          ...item,
          manuallyForced: false,
        });
      }),
    );
  };

  const handleAcceptAllSources = () => {
    setSources((current) => {
      const selectableIds = new Set(
        selectableCandidateSources(current).map(
          (source) => source.id || sourceRecordKey(source),
        ),
      );
      return current.map((source) => {
        const key = source.id || sourceRecordKey(source);
        if (!selectableIds.has(key)) return source;
        if (sourceReviewState(source) !== "pending") return source;
        return updateSourceReviewState([source], key, "accepted")[0]!;
      });
    });
  };

  // ── Generate ────────────────────────────────────────────────────────────────

  const runSectionCoverageSupplementalSearch = async (): Promise<boolean> => {
    const topic = activeReportTopic.trim();
    if (!topic) return false;
    const attemptKey = topic;
    if (!needsSupplementalCoverage || supplementalCoverageAttemptKey === attemptKey) {
      return false;
    }

    setSupplementalCoverageAttemptKey(attemptKey);
    setSourceSearchStatus("loading");
    setSourceSearchMessage("文獻探討來源不足，正在補充查詢可審查來源。");

    const workflowIdForSearch = sourceWorkflowId ?? createClientWorkflowId();
    const supplementalZh = [
      topic,
      `${topic} 文獻探討`,
      `${topic} 機制`,
      `${topic} 實證研究`,
      `${topic} 期刊 論文 DOI`,
    ];
    const supplementalEn = [
      `${topic} literature review`,
      `${topic} mechanism`,
      `${topic} empirical study`,
      `${topic} review journal DOI`,
      `${topic} academic source`,
    ];

    try {
      const result = await searchSources({
        originalTopic: originalTopicValue || topic,
        refinedTopic: topic !== originalTopicValue ? topic : undefined,
        topic,
        displayTitle: displayTitleValue || topic,
        querySeedZh: supplementalZh,
        querySeedEn: supplementalEn,
        excludeTerms: ["攝影", "旅遊", "作文", "商業", "購物", "廣告", "SEO"],
        workflowId: workflowIdForSearch,
        searchProfile: input.researchDepth,
        sourceMixProfile: sourceMixProfileForGeneratorInput(input),
        reportType: input.reportType,
        audience: input.targetAudience || input.academicLevel,
        sourceMode: input.sourceRequirement,
        language: input.outputLanguage,
      });
      const workflowLock: SourceWorkflowLock = {
        workflowId:
          result.workflowId ??
          result.searchTrace?.workflowId ??
          workflowIdForSearch,
        topicHash:
          result.topicHash ??
          result.searchTrace?.topicHash ??
          reportTopicFingerprint(topic),
        queryPlanHash:
          result.queryPlanHash ??
          result.searchTrace?.queryPlanHash ??
          reportTopicFingerprint([...supplementalZh, ...supplementalEn].join(" ")),
      };
      const normalizedSources = applySourceAuthorityAndLanguage(
        applySourceRelevanceAssessments(
          dedupeSourceRecords(result.sources.map(normalizeSourceForReview)),
          topic,
        ),
      );
      const workflowSources = applyWorkflowLockToSources(
        normalizedSources,
        workflowLock,
        topic,
      );
      setSources((current) =>
        mergeLocalSourceReviewState(
          dedupeSourceRecords([...current, ...workflowSources]),
          current,
        ),
      );
      setSourceWorkflowId(workflowLock.workflowId);
      setSourceWorkspaceFingerprint(workflowLock.topicHash);
      setSourceQueryPlanHash(workflowLock.queryPlanHash);
      setKeywordSearchDebug(keywordSearchDebugFromResult(result));
      const reviewableCount = visibleReviewCandidateSources(workflowSources).length;
      const message =
        reviewableCount > 0
          ? `已補充 ${reviewableCount} 筆可審查來源。請先接受適合的學術來源，再生成報告。`
          : "已補查但仍缺少可審查來源；報告會維持保守語氣。";
      setSourceSearchStatus(reviewableCount > 0 ? "done" : "empty");
      setSourceSearchMessage(message);
      toast({
        title: "已完成補充來源檢查",
        description: message,
      });
      return reviewableCount > 0;
    } catch (error) {
      setSourceSearchStatus("error");
      setSourceSearchMessage(sourceErrorMessage(error));
      toast({
        title: "補充來源搜尋失敗",
        description: sourceErrorMessage(error),
        variant: "destructive",
      });
      return false;
    }
  };

  const handleGenerate = async () => {
    const isDevelopment =
      typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
    if (isDevelopment) {
      console.info("[ResearchForge][report-generation-gate]", reportGenerationDebug);
    }
    if (!input.topic.trim()) {
      setGenerateStatus("error");
      setActiveStep("topic");
      toast({
        title: "請填寫報告主題",
        description: "主題欄位不能為空，請輸入你的報告主題後再生成。",
        variant: "destructive",
      });
      return;
    }
    if (needsSupplementalCoverage) {
      const supplemented = await runSectionCoverageSupplementalSearch();
      if (supplemented) {
        setGenerateStatus("idle");
        setActiveStep("manage");
        return;
      }
    }
    const currentReadiness = generationReadiness(
      acceptedSources,
      input.researchDepth,
      readinessEvidenceCards,
    );
    const currentBlockingReason = academicSafetyBlocksReport(academicSafetyReview)
      ? "此主題已被標記為不可輸出操作性內容，因此不會進入一般報告生成。"
      : reportGenerationBlockingReason({
          topic: activeReportTopic,
          acceptedSources,
          hasWorkspaceTopicMismatch,
          evidenceCardCount:
            acceptedEvidenceCards.length > 0
              ? acceptedEvidenceCards.length
              : serverDerivableEvidenceAvailable
                ? 1
                : 0,
          workflowId: sourceWorkflowLock?.workflowId ?? null,
          topicHash: sourceWorkflowLock?.topicHash ?? null,
        });
    if (currentBlockingReason) {
      setGenerateStatus("error");
      toast({
        title: "目前無法生成報告",
        description: currentBlockingReason,
        variant: "destructive",
      });
      return;
    }
    if (!llmStatus.healthOk || !llmStatus.smokeOk || !llmStatus.modelConfigured) {
      const message =
        llmStatus.errorMessage ??
        (!llmStatus.apiKeyPresent
          ? "LLM provider API key 未設定"
          : !llmStatus.modelConfigured
            ? "LLM credentials configured, but model is not explicitly configured. Set SCHOOL_LLM_MODEL or OPENAI_MODEL."
            : `目前模型不可用：${llmStatus.model}`);
      toast({
        title: "將生成保守草稿",
        description: `${message}；系統會改用 evidence-grounded fallback 草稿並標示證據不足處。`,
      });
    }

    const effectiveInput: ReportInput = {
      ...input,
      topic: originalTopicValue,
      targetAudience:
        input.targetAudience || academicToAudience(input.academicLevel),
      purpose: academicToPurpose(input.academicLevel),
      acceptedSources,
    };

    setIsGenerating(true);
    setGenerateStatus("loading");
    setGenerateErrorMessage(null);

    beginStepTransition(
      "report",
      {
        title: "正在建立報告工作區",
        description:
          "正在整理已接受來源、呼叫 LLM 生成正式中文段落，完成後會自動前往報告頁。",
      },
      650,
      async () => {
        try {
          const readinessForWorkspace = generationReadiness(
            acceptedSources,
            effectiveInput.researchDepth,
            readinessEvidenceCards,
          );
          if (!readinessForWorkspace.canGenerate) {
            setGenerateStatus("error");
            setIsGenerating(false);
            return;
          }
          const generationMode = readinessForWorkspace.mode;
          if (generationMode === "blocked") {
            setGenerateStatus("error");
            setIsGenerating(false);
            return;
          }
          let workspace = createReportWorkspace(
            effectiveInput,
            acceptedSources,
            generationMode,
            undefined,
            {
              workflowId: sourceWorkflowLock?.workflowId ?? groundingJob?.workflowId ?? null,
              topicHash: sourceWorkflowLock?.topicHash ?? groundingJob?.topicHash ?? null,
              originalTopic: originalTopicValue,
              researchTopic: activeResearchTopic,
              displayTitle: displayTitleValue,
              evidenceCards: acceptedEvidenceCards,
              academicSafetyReview,
            },
          );
          workspace = {
            ...workspace,
            presentation: normalizeReportPresentation(presentation),
          };
          const llmDraft = await requestLlmReportDraft({
            reportInput: effectiveInput,
            workflowId: workspace.workflowId,
            jobId: groundingJobMeta?.jobId ?? null,
            topicHash: workspace.topicHash,
            originalTopic: originalTopicValue,
            displayTitle: displayTitleValue,
            acceptedSources,
            evidenceCards: workspace.evidenceCards,
            academicSafetyReview,
            generationMode: workspace.generationMode,
          });
          if (!llmDraft.ok) {
            const message =
              llmDraft.message ??
              llmDraft.warning ??
              llmDraft.code ??
              "目前 GPT 模型無法完成報告生成，請檢查 /api/llm/health 與 /api/llm/smoke。";
            setGenerateStatus("error");
            setGenerateErrorMessage(message);
            setIsGenerating(false);
            toast({
              title: "報告生成未完成",
              description: message,
              variant: "destructive",
            });
            return;
          }
          workspace = mergeLlmReportDraft(workspace, llmDraft);
          saveReportWorkspace(workspace);

          setGenerateStatus("done");
          navigate(
            reportWorkspacePath(workspace.id, {
              workflowId: workspace.workflowId,
              topicHash: workspace.topicHash,
            }),
          );
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim()
              ? error.message
              : "報告生成失敗，請檢查 GPT 連線與來源證據卡狀態。";
          setGenerateStatus("error");
          setGenerateErrorMessage(message);
          setIsGenerating(false);
          toast({
            title: "生成失敗",
            description: message,
            variant: "destructive",
          });
        }
      },
    );
  };

  // ── Expand topic ──────────────────────────────────────────────────────────────

  const handleExpand = () => {
    const topic = draftTopicValue;
    if (!topic) {
      setTopicWorkflowStatus("invalid");
      toast({
        title: "請先輸入主題",
        description: "請輸入具體主題，或先選擇研究領域後再產生研究方向。",
        variant: "destructive",
      });
      return;
    }
    const effectiveDomain = selectedDomain ?? recommendedDomain ?? inferResearchDomain(topic);
    const validation = validateTopicForWorkflow(topic, { domainHint: effectiveDomain });
    if (validation.status === "invalid") {
      setTopicWorkflowStatus("invalid");
      setTopicExpansionDiagnostics(null);
      setTopicExpansionMessage("請輸入具體主題，或先選擇研究領域後再產生研究方向。");
      setTopicExpansionStatus("error");
      setExpansions([]);
      setSelectedDirection(null);
      toast({
        title: "主題無效",
        description: "請輸入具體主題，或先選擇研究領域後再產生研究方向。",
        variant: "destructive",
      });
      return;
    }
    if (!effectiveDomain) {
      setTopicWorkflowStatus("idle");
      setTopicExpansionMessage("請輸入具體主題，或先選擇研究領域後再產生研究方向。");
      setTopicExpansionStatus("error");
      toast({
        title: "請先選擇研究領域",
        description: "可先選擇研究領域，讓查詢分流與資料搜尋更精準。",
        variant: "destructive",
      });
      return;
    }
    if (!selectedDomain) {
      setSelectedDomain(effectiveDomain);
    }
    const topicRunId = createTopicRunId(topic, effectiveDomain);
    const resetVersion = topicResetVersionRef.current;
    currentTopicRunIdRef.current = topicRunId;
    setCurrentTopicRunId(topicRunId);
    setTopicWorkflowStatus("validating");
    setTopicExpansionStatus("loading");
    setTopicDiagnosticsOpen(false);
    setTopicExpansionDiagnostics(null);
    setTopicExpansionMessage(null);
    setExpansions([]);
    setSelectedDirection(null);
    setSelectedTitleSearchSeed(null);
    void (async () => {
      const cards = buildResearchDirectionCards(
        topic,
        effectiveDomain,
        detectedCategory,
        topicRunId,
        previousTopicRef.current,
      ).filter((card) => {
        if (card.rawTopic !== topic) return false;
        if (card.researchDirection.topicRunId !== topicRunId) return false;
        return !directionHasSemanticContamination(
          card.researchDirection,
          topic,
          previousTopicRef.current,
        );
      });
      if (resetVersion !== topicResetVersionRef.current) return;
      if (currentTopicRunIdRef.current !== topicRunId) return;
      setExpansions(cards);
      setTopicWorkflowStatus(validation.status);
      const inferredDomain = topicTypeToResearchDomain(validation.topicType, topic);
      const domainConflict =
        Boolean(selectedDomain) &&
        Boolean(inferredDomain) &&
        selectedDomain !== inferredDomain;
      setTopicExpansionMessage(
        domainConflict
          ? "系統已依主題內容微調研究方向。"
          : validation.userMessageZh ||
          (cards.length ? "已產生研究方向候選。" : "無法產生研究方向候選。"),
      );
      setTopicExpansionStatus(cards.length ? "done" : "error");
    })();
  };

  const applyExpansion = (card: TopicRunExpansionCard) => {
    const direction = card.researchDirection;
    if (
      !currentTopicRunId ||
      card.topicRunId !== currentTopicRunId ||
      direction.topicRunId !== currentTopicRunId ||
      direction.rawTopic !== draftTopicValue ||
      directionHasSemanticContamination(direction, draftTopicValue, previousTopicRef.current)
    ) {
      setTopicExpansionMessage("研究方向已過期，請重新產生研究方向。");
      setTopicExpansionStatus("error");
      toast({
        title: "研究方向已過期",
        description: "請用目前輸入的主題重新產生研究方向。",
        variant: "destructive",
      });
      return;
    }
    const refinedTopic = direction?.researchQuestionZh.trim() || card.researchQuestion?.trim() || card.title.trim();
    if (!direction || !refinedTopic || understandTopic(refinedTopic).topicKind === "unknown_or_noise") {
      setTopicExpansionMessage("查無有效主題，請改用具體且可研究的題目。");
      setTopicExpansionStatus("error");
      toast({
        title: "無法使用此方向",
        description: "這個方向目前無法形成有效搜尋主題，請重新產生研究方向或直接改寫主題。",
        variant: "destructive",
      });
      return;
    }
    const selected = Object.freeze({ ...direction });
    setSelectedDirection(selected);
    setDisplayTitle(draftTopicValue);
    setTopicWorkflowStatus("ready");
    setTopicExpansionMessage(`已選擇查詢輔助方向：${selected.researchQuestionZh}`);
    setTitleSemanticComparison(null);
    toast({
      title: "已選擇研究方向",
      description: `會用此方向補強查詢，但保留原始題目：${draftTopicValue}`,
    });
  };

  const rerunGroundingWithExpansion = (card: TopicRunExpansionCard) => {
    if (
      !currentTopicRunId ||
      card.topicRunId !== currentTopicRunId ||
      card.researchDirection.topicRunId !== currentTopicRunId ||
      card.researchDirection.rawTopic !== draftTopicValue ||
      directionHasSemanticContamination(card.researchDirection, draftTopicValue, previousTopicRef.current)
    ) {
      toast({
        title: "研究方向已過期",
        description: "請用目前輸入的主題重新產生研究方向。",
        variant: "destructive",
      });
      return;
    }
    const refinedTopic =
      card.researchDirection?.researchQuestionZh.trim() ||
      card.researchQuestion?.trim() ||
      card.title.trim();
    if (!refinedTopic || understandTopic(refinedTopic).topicKind === "unknown_or_noise") {
      toast({
        title: "無法重跑搜尋",
        description: "這個標題目前無法形成有效搜尋主題。",
        variant: "destructive",
      });
      return;
    }
    if (card.researchDirection) {
      setSelectedDirection(Object.freeze({ ...card.researchDirection }));
      setTopicWorkflowStatus("ready");
    }
    setDisplayTitle(draftTopicValue);
    void submitGroundingTopic({
      researchTopicOverride: refinedTopic,
      displayTitleOverride: draftTopicValue,
      forceRerun: true,
    });
  };

  const ensureClarificationCards = () => {
    void (async () => {
      setTopicExpansionStatus("loading");
      setTopicExpansionMessage(null);
      const topic = draftTopicValue;
      const effectiveDomain = selectedDomain ?? recommendedDomain ?? inferResearchDomain(topic);
      const validation = validateTopicForWorkflow(topic, { domainHint: effectiveDomain });
      if (validation.status === "invalid") {
        setTopicWorkflowStatus("invalid");
        setTopicExpansionMessage("請輸入具體主題，或先選擇研究領域後再產生研究方向。");
        setTopicExpansionStatus("error");
        setExpansions([]);
        return;
      }
      if (!effectiveDomain) {
        setTopicWorkflowStatus("idle");
        setTopicExpansionMessage("請輸入具體主題，或先選擇研究領域後再產生研究方向。");
        setTopicExpansionStatus("error");
        setExpansions([]);
        return;
      }
      if (!selectedDomain) {
        setSelectedDomain(effectiveDomain);
      }
      const topicRunId = createTopicRunId(topic, effectiveDomain);
      const resetVersion = topicResetVersionRef.current;
      currentTopicRunIdRef.current = topicRunId;
      setCurrentTopicRunId(topicRunId);
      const cards = buildResearchDirectionCards(
        topic,
        effectiveDomain,
        detectedCategory,
        topicRunId,
        previousTopicRef.current,
      ).filter((card) => {
        if (card.rawTopic !== topic) return false;
        if (card.researchDirection.topicRunId !== topicRunId) return false;
        return !directionHasSemanticContamination(
          card.researchDirection,
          topic,
          previousTopicRef.current,
        );
      });
      if (resetVersion !== topicResetVersionRef.current) return;
      if (currentTopicRunIdRef.current !== topicRunId) return;
      setExpansions(cards);
      setTopicWorkflowStatus(validation.status);
      setTopicExpansionMessage(validation.userMessageZh);
      setTopicExpansionStatus(cards.length ? "done" : "error");
    })();
  };

  // ── Clear ────────────────────────────────────────────────────────────────────

  const handleClear = () => {
    resetWorkflowState();
    setInput(DEFAULT_INPUT);
    setDraftTopic("");
    setDebouncedDraftTopic("");
    setDisplayTitle("");
    setExpansions([]);
    setSelectedDirection(null);
    setCurrentTopicRunId(null);
    currentTopicRunIdRef.current = null;
    previousTopicRef.current = null;
    topicResetVersionRef.current += 1;
    setSelectedDomain(null);
    setTopicWorkflowStatus("idle");
    setSelectedTitleSearchSeed(null);
    setTopicExpansionDiagnostics(null);
    setTopicExpansionMessage(null);
    setTitleSemanticComparison(null);
    setTopicExpansionStatus("idle");
    setTopicDiagnosticsOpen(false);
    setSearchTopic("");
    setDeveloperDebugOpen(false);
    setRestoreMessage(null);
    setActiveStep("topic");
    syncGeneratorUrl({
      step: "topic_input",
      workflowId: null,
      topicHash: null,
      runId: null,
      jobId: null,
      mode: "replace",
    });
  };

  const shortTopicHint =
    draftTopicValue &&
    topicWorkflowStatus === "idle" &&
    !hasInvalidDraftTopic &&
    isShortTopic(draftTopicValue);
  const autoSearchEnabled =
    input.sourceRequirement === "需要，並生成參考文獻格式";
  const canContinueToSearch =
    hasDraftTopic &&
    !hasInvalidDraftTopic &&
    (Boolean(selectedDirection) || Boolean(selectedDomain));
  const generateButtonLabel = !hasTopic
    ? "尚未輸入主題"
    : isGenerating
      ? readiness.progressLabel
      : generateStatus === "error"
        ? readiness.buttonLabel
        : readiness.buttonLabel;
  const goToSearchStep = () => {
    if (!hasDraftTopic) {
      setActiveStep("topic");
      toast({
        title: "請先輸入主題",
        description: "設定主題後才能進入來源搜尋。",
        variant: "destructive",
      });
      return;
    }
    if (hasInvalidDraftTopic) {
      setActiveStep("topic");
      toast({
        title: "主題無效",
        description: "請先改成可辨識的研究主題後，再進入來源搜尋。",
        variant: "destructive",
      });
      return;
    }
    if (!selectedDirection && !selectedDomain) {
      setActiveStep("topic");
      setTopicExpansionMessage("請先選擇一個研究領域。");
      toast({
        title: "請先選擇研究領域",
        description: "系統會依你選擇的領域搜尋主要來源。",
      });
      return;
    }
    if (selectedDirection) {
      const plan = groundingPlanFromDirection(selectedDirection, selectedDomain, draftTopicValue);
      void submitGroundingTopic({
        researchTopicOverride: plan.researchTopic,
        displayTitleOverride: plan.displayTitle,
        normalizedTopicOverride: plan.normalizedTopic,
        researchQuestionOverride: plan.researchQuestion,
        querySeedZhOverride: plan.querySeedZh,
        querySeedEnOverride: plan.querySeedEn,
        excludeTermsOverride: plan.excludeTerms,
        selectedDomainOverride: selectedDomain,
        forceRerun: true,
      });
      return;
    }
    if (selectedDomain) {
      const plan = domainFocusedResearchPlan(draftTopicValue, selectedDomain);
      void submitGroundingTopic({
        researchTopicOverride: plan.researchTopic,
        displayTitleOverride: plan.displayTitle,
        normalizedTopicOverride: plan.normalizedTopic,
        researchQuestionOverride: plan.researchQuestion,
        querySeedZhOverride: plan.querySeedZh,
        querySeedEnOverride: plan.querySeedEn,
        excludeTermsOverride: plan.excludeTerms,
        selectedDomainOverride: selectedDomain,
        forceRerun: true,
      });
      return;
    }
    if (!parsedDraftResearchInput) {
      setActiveStep("topic");
      return;
    }
    if (parsedDraftResearchInput.nextAction === "block") {
      setActiveStep("topic");
      toast({
        title: "主題已被安全阻擋",
        description: parsedDraftResearchInput.safetyReason,
        variant: "destructive",
      });
      return;
    }
    if (parsedDraftResearchInput.nextAction === "show_topic_options") {
      setActiveStep("topic");
      toast({
        title: "請先縮小研究方向",
        description: "這個輸入仍然偏短或多義，先從建議方向中選一個再開始搜尋。",
      });
      return;
    }
    if (parsedDraftResearchInput.nextAction === "ask_clarification") {
      setActiveStep("topic");
      toast({
        title: "主題還需要補充",
        description:
          parsedDraftResearchInput.safetyStatus === "needs_reframe"
            ? parsedDraftResearchInput.safetyReason
            : "請補充研究對象、變項、比較條件或研究範圍後再搜尋。",
        variant: "destructive",
      });
      return;
    }
    void submitGroundingTopic();
  };
  const goToManageStep = () => {
    if (!currentWorkflowSources.length || !canProceedToSourceReview) {
      transitionToStep("search", {
        pushCurrentStep: true,
        historyMode: "push",
        routeStep: "grounding_progress",
      });
      if (currentWorkflowSources.length > 0 && !canProceedToSourceReview) {
        toast({
          title: "可審查來源不足",
          description:
            groundingJob?.groundingDiagnostics?.userVisibleStatus ??
            `目前只有 ${currentReviewableSourceCount} 筆可審查來源，至少需要 ${MIN_REVIEWABLE_SOURCE_COUNT} 筆。請放寬搜尋或重新搜尋。`,
        });
      }
      return;
    }
    transitionToStep("manage", {
      pushCurrentStep: true,
      historyMode: "push",
      routeStep: "source_review",
    });
  };
  const goToGenerateStep = () =>
    transitionToStep("generate", {
      pushCurrentStep: true,
      historyMode: "push",
      routeStep: "report_draft",
    });
  const currentStepLabel =
    WORKFLOW_STEPS.find((step) => step.value === visibleStep)?.label ??
    "設定主題";

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />

      <main className="generator-section flex-1 container mx-auto max-w-7xl px-4 pb-12 pt-24">
        <div className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="secondary" className="mb-2">
                研究工作台
              </Badge>
              <h1 className="text-3xl tracking-normal text-foreground">
                <BrandWordmark className="text-inherit" />
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                從主題設定、來源搜尋、來源審查到報告生成，依序完成可匯出的研究工作區。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[40px] self-start lg:self-auto"
              onClick={handleClear}
            >
              <Trash2 className="mr-2 h-4 w-4" /> 重新開始
            </Button>
          </div>
          <WorkflowStepper
            currentStep={visibleStep}
            completedSteps={stepCompleted}
            canEnterStep={canEnterStep}
            onStepClick={handleStepSelect}
            disabled={isStepTransitioning || isSearchingSources || isGenerating}
          />
        </div>

        <section
          className="min-h-[620px] space-y-4"
          data-testid="generator-workspace"
        >
          {activeStep !== "search" && activeStep !== "manage" && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {currentStepLabel}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={
                      topicWorkflowStatus === "ready" ||
                      topicWorkflowStatus === "sensitive_research_only"
                        ? "secondary"
                        : topicWorkflowStatus === "invalid" ||
                          topicWorkflowStatus === "error"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {workflowStatusLabel(topicWorkflowStatus)}
                  </Badge>
                  <Badge variant={visiblePrimarySourceCount ? "secondary" : "outline"}>
                    主要候選 {visiblePrimarySourceCount} 筆
                  </Badge>
                  <Badge variant={acceptedSources.length ? "default" : "outline"}>
                    已接受 {reviewCounts.accepted} 筆
                  </Badge>
                  <Badge variant="outline">{selectedDepthOption.label}</Badge>
                </div>
              </div>
            </div>
          )}

          {restoreMessage ? (
            <div className="mx-auto max-w-4xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {restoreMessage}
            </div>
          ) : null}

          {shortTopicHint && visibleStep === "topic" && !isStepTransitioning && (
            <div className="mx-auto flex max-w-3xl gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                這個主題偏短或範圍較廣；請先選擇研究領域，系統會依領域搜尋主要來源。
              </span>
            </div>
          )}

          {isStepTransitioning ? (
            <StepTransitionScreen
              title={transitionMessage.title}
              description={transitionMessage.description}
              targetStep={transitionTargetStep}
            />
          ) : visibleStep === "topic" ? (
            <TopicStepPanel
              input={input}
              topicValue={draftTopic}
              parsedInput={parsedDraftResearchInput}
              expansions={visibleExpansions}
              topicExpansionDiagnostics={topicExpansionDiagnostics}
              topicExpansionMessage={topicExpansionMessage}
              topicExpansionStatus={topicExpansionStatus}
              topicWorkflowStatus={topicWorkflowStatus}
              titleSemanticComparison={titleSemanticComparison}
              topicDiagnosticsOpen={topicDiagnosticsOpen}
              detectedCategory={detectedCategory}
              needsClarification={Boolean(topicUnderstanding?.needsClarification)}
              autoSearchEnabled={autoSearchEnabled}
              displayTitle={displayTitleValue}
              selectedDirection={selectedDirection}
              selectedDomain={selectedDomain}
              recommendedDomain={recommendedDomain}
              workspaceResume={workspaceResume}
              researchDepthLabel={`${selectedDepthOption.label} / 建議 ${recommendedAcceptedSourceCount} 筆`}
              canContinueToSearch={canContinueToSearch}
              onInputChange={updateInput}
              onTopicChange={handleTopicChange}
              onTopicInputKeyDown={handleTopicInputKeyDown}
              onTopicCompositionStart={() => setIsTopicComposing(true)}
              onTopicCompositionEnd={() => setIsTopicComposing(false)}
              onApplyExpansion={applyExpansion}
              onRerunWithExpansion={rerunGroundingWithExpansion}
              onUseParsedTopicOption={handleUseParsedTopicOption}
              onDomainChange={handleDomainChange}
              onTopicDiagnosticsOpenChange={setTopicDiagnosticsOpen}
              onNext={goToSearchStep}
              onClearWorkspace={handleClear}
            />
          ) : visibleStep === "search" ? (
            <SearchStepPanel
              topic={originalTopicValue}
              originalTopic={originalTopicValue}
              displayTitle={displayTitleValue}
              reportType={input.reportType}
              audience={input.targetAudience || input.academicLevel}
              groundingJob={groundingJob}
              groundingRequestState={groundingRequestState}
              groundingError={groundingError}
              message={sourceSearchMessage}
              sourceCount={currentWorkflowSources.length}
              searchProfile={input.researchDepth}
              onSearchProfileChange={(value) =>
                setInput((current) => ({ ...current, researchDepth: value }))
              }
              hasTopic={hasTopic && !hasInvalidTopic}
              onRetry={() =>
                void submitGroundingTopic({
                  researchTopicOverride: activeResearchTopic,
                  displayTitleOverride:
                    displayTitle.trim() || selectedExpansionTopic || null,
                  forceRerun: true,
                })
              }
              onNext={goToManageStep}
              onBack={goBackStep}
            />
          ) : visibleStep === "manage" ? (
          <ManageStepPanel
            sources={currentWorkflowSources}
            hasWorkspaceTopicMismatch={hasWorkspaceTopicMismatch}
            researchDepth={input.researchDepth}
            recommendedAcceptedSourceCount={recommendedAcceptedSourceCount}
            acceptedCount={acceptedSources.length}
            canGenerateReport={canGenerateReport}
            blockingReason={effectiveBlockingReason}
            pipelineStats={sourcePipelineStats}
            onBack={goBackStep}
            onNext={goToGenerateStep}
            onReview={updateSourceReview}
            onEdit={updateSourceRecord}
            topic={activeReportTopic}
            onAcceptAll={handleAcceptAllSources}
            showTechnicalDetails={workflowVisibility.showTechnicalLogs}
          />
          ) : (
            <GenerateStepPanel
              acceptedCount={acceptedSources.length}
              acceptedSources={acceptedSources}
              researchDepth={input.researchDepth}
              recommendedAcceptedSourceCount={recommendedAcceptedSourceCount}
              readiness={readiness}
              sectionSufficiency={sectionSufficiency}
              limitedReadableSourceWarning={limitedReadableSourceWarning}
              canGenerateReport={canGenerateReport}
              blockingReason={effectiveBlockingReason}
              isGenerating={isGenerating}
              generateButtonLabel={generateButtonLabel}
              generateStatus={generateStatus}
              generateErrorMessage={generateErrorMessage}
              llmStatus={llmStatus}
              presentation={presentation}
              onPresentationChange={(patch) =>
                setPresentation((current) =>
                  normalizeReportPresentation({ ...current, ...patch }),
                )
              }
              onGenerate={handleGenerate}
              onBack={goBackStep}
            />
          )}

          {import.meta.env.DEV ? (
            <Collapsible
              open={developerDebugOpen}
              onOpenChange={setDeveloperDebugOpen}
            >
              <section
                className="mx-auto max-w-5xl rounded-lg border border-border bg-card p-3"
                data-testid="developer-debug-toggle"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[36px]"
                  >
                    開發者除錯 <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <DeveloperDebugPanel
                    keywordDebug={keywordSearchDebug}
                    preflight={preflight}
                    acceptedSources={acceptedSources}
                    evidenceCards={acceptedEvidenceCards}
                    reportGenerationDebug={reportGenerationDebug}
                    visible={workflowVisibility}
                  />
                </CollapsibleContent>
              </section>
            </Collapsible>
          ) : null}
        </section>
      </main>
    </div>
  );
}
