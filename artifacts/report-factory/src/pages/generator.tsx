import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/layout/navbar";
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
import {
  expandTopicCards,
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
import { buildEvidenceCards, type EvidenceCard } from "@/lib/evidenceCards";
import {
  sourceHasUsableAbstract,
  sourceSummaryForUser,
} from "@/lib/sourceSummaries";
import { applySourceRelevanceAssessments } from "@/lib/sourceRelevance";
import { applySourceAuthorityAndLanguage } from "@/lib/sourceAuthority";
import { supplementTrustedClimateSources } from "@/lib/trustedClimateSources";
import {
  createReportWorkspace,
  generationReadiness,
  generatorWorkflowVisibility,
  loadReportWorkspace,
  reportTopicFingerprint,
  reportWorkspacePath,
  saveReportWorkspace,
  workspaceMatchesTopic,
} from "@/lib/reportWorkspace";
import {
  mergeLlmReportDraft,
  requestLlmReportDraft,
} from "@/lib/llmReportWriter";
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
  queries: string[];
  providerErrors: string[];
  searchIntent: SourceSearchResult["searchIntent"] | null;
  intentQueries: SourceSearchResult["queries"] | null;
  warnings: string[];
  retrievalStats: {
    rawResults: number;
    providerGroups: number;
    successfulProviderGroups: number;
  };
};

type SourcePipelineStats = KeywordSearchDebugState["retrievalStats"] & {
  dedupedResults: number;
  primaryCandidates: number;
  secondaryCandidates: number;
  lowRelevance: number;
  rejected: number;
};

type WorkspaceResumeState = {
  reportId: string;
  loaded: boolean;
};

type SourceWorkflowLock = {
  workflowId: string;
  topicHash: string;
  queryPlanHash: string;
};

type GeneratorWorkflowStep = "topic" | "search" | "manage" | "generate";

const DEFAULT_INPUT: ReportInput = {
  topic: "",
  reportType: "研究報告",
  academicLevel: "高中",
  targetAudience: "高中",
  researchDepth: "standard",
  purpose: "學校作業",
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

const RESEARCH_DEPTH_OPTIONS: {
  label: string;
  value: ReportInput["researchDepth"];
  recommendedSources: number;
}[] = [
  { label: "quick：3-5 筆", value: "quick", recommendedSources: 5 },
  { label: "standard：6-10 筆", value: "standard", recommendedSources: 10 },
  { label: "deep：10-20 筆", value: "deep", recommendedSources: 12 },
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
      { label: "讀書心得", value: "讀書心得" },
      { label: "專題報告", value: "專題報告" },
      { label: "實驗報告", value: "實驗報告" },
      { label: "簡報大綱", value: "簡報大綱" },
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
      { label: "商業顧問", value: "商業顧問風格" },
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

function displayOptionLabel(key: ReportInputStringKey, value: string): string {
  const fields = [...MAIN_SELECT_FIELDS, ...ADVANCED_SELECT_FIELDS];
  const option = fields
    .find((field) => field.key === key)
    ?.options.find((item) => item.value === value);
  return option?.label ?? value;
}

function sourceErrorMessage(error: unknown): string {
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
  if (source.url) return sourceDomainLabel(source.url);
  if (source.doi) return `DOI ${source.doi}`;
  return "來源位置待確認";
}

function sourceCategoryLabel(value: string | null | undefined): string {
  if (!value) return SOURCE_CATEGORY_LABELS.unknown;
  return SOURCE_CATEGORY_LABELS[value as SourceCategory] ?? value;
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
    searchIntent: result.searchIntent ?? null,
    intentQueries: result.queries ?? null,
    warnings: result.warnings ?? [],
    retrievalStats: {
      rawResults:
        result.searchTrace?.candidateCount ??
        providerGroups.reduce((sum, group) => sum + (group.results?.length ?? 0), 0),
      providerGroups: providerGroups.length,
      successfulProviderGroups: providerGroups.filter((group) => group.ok)
        .length,
    },
  };
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

type SourceReviewTab = "all" | "accepted" | "pending" | "rejected";

const SOURCE_REVIEW_TABS: { value: SourceReviewTab; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "accepted", label: "已接受" },
  { value: "pending", label: "待審核" },
  { value: "rejected", label: "已拒絕" },
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
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow"
  )
    return source.classification;
  if (source.relevanceLevel === "off_topic") return "off_topic";
  if (
    source.relevanceLevel !== "secondary" &&
    source.relevanceLevel !== "clue" &&
    (source.relevanceScore ?? 0) < 20
  )
    return "low_topic_relevance";
  return null;
}

function sourceCanEnterReport(
  source: SourceRecord,
  lock: SourceWorkflowLock | null,
): boolean {
  return sourceAcceptBlockReason(source, lock) === null;
}

function applyWorkflowLockToSources(
  sources: SourceRecord[],
  lock: SourceWorkflowLock,
  topic: string,
): SourceRecord[] {
  return sources.map((source) =>
    normalizeSourceForReview({
      ...source,
      workflowId: source.workflowId ?? lock.workflowId,
      topic: source.topic ?? topic,
      normalizedTopic: source.normalizedTopic ?? topic,
      topicHash: source.topicHash ?? lock.topicHash,
      queryPlanHash: source.queryPlanHash ?? lock.queryPlanHash,
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

function sourceRelevanceLabel(level: SourceRecord["relevanceLevel"]): string {
  switch (level) {
    case "primary":
      return "主要來源";
    case "secondary":
      return "延伸來源";
    case "clue":
      return "線索來源";
    case "low":
      return "低相關";
    case "off_topic":
      return "離題";
    default:
      return "相關度待確認";
  }
}

function sourceRelevanceBadgeVariant(
  level: SourceRecord["relevanceLevel"],
): "default" | "secondary" | "outline" | "destructive" {
  switch (level) {
    case "primary":
      return "default";
    case "secondary":
      return "secondary";
    case "clue":
      return "outline";
    case "low":
      return "outline";
    case "off_topic":
      return "destructive";
    default:
      return "outline";
  }
}

function sourceRelevanceTierLabel(
  level: SourceRecord["relevanceLevel"],
): string {
  switch (level) {
    case "primary":
      return "高";
    case "secondary":
    case "clue":
      return "中";
    case "low":
    case "off_topic":
      return "低";
    default:
      return "待確認";
  }
}

function evidenceGroundingLabel(
  status: SourceRecord["evidenceGrounding"],
): string {
  switch (status) {
    case "abstract_grounded":
    case "snippet_grounded":
      return "有摘要可用";
    case "metadata_only":
      return "只有 metadata";
    case "insufficient":
      return "摘要不足";
    default:
      return "片段待確認";
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
  const abstract = source.abstract?.trim();
  if (!abstract) return null;
  return compactSourceLine(abstract, 180);
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
      return candidateSourceRecords(sources);
    case "rejected":
      return rejectedSourceRecords(sources);
    case "all":
    default:
      return sources;
  }
}

function primaryCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      source.relevanceLevel === "primary",
  );
}

function secondaryCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      (source.relevanceLevel === "secondary" ||
        source.relevanceLevel === "clue"),
  );
}

function lowRelevanceCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      (source.relevanceLevel === "low" ||
        source.relevanceLevel === "off_topic" ||
        source.shouldShowInMainList === false),
  );
}

function reviewableCandidateSources(sources: SourceRecord[]): SourceRecord[] {
  const lowIds = new Set(
    lowRelevanceCandidateSources(sources).map(
      (source) => source.id || sourceRecordKey(source),
    ),
  );
  return sources.filter(
    (source) =>
      sourceReviewState(source) === "pending" &&
      !lowIds.has(source.id || sourceRecordKey(source)),
  );
}

function SourceReviewCard({
  source,
  isExpanded,
  onExpandedChange,
  onReview,
  onEdit,
  topic,
}: {
  source: SourceRecord;
  isExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
  topic: string;
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
  const relevanceLevel = source.relevanceLevel ?? null;
  const relevanceReasons = source.relevanceReasons ?? [];
  const scoreReasons = source.scoreReasons ?? [];
  const snippet = abstractSnippet(source);
  const providerLabel = source.provider || source.sourceType;
  const venueLabel = source.containerTitle || source.publisher || "出處待確認";
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
    summary.recommendation === "not_recommended"
      ? "仍要接受"
      : summary.recommendation === "supporting"
        ? "作為輔助"
        : summary.recommendation === "check_first"
          ? "確認後接受"
          : "接受來源";

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
          <div className="flex min-w-0 gap-3">
            {!compactMode && (
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${statusTone}`}
              >
                <StatusIcon className="h-4 w-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h3
                    className="line-clamp-2 text-sm font-semibold leading-6 text-foreground"
                    title={title}
                  >
                    {title}
                  </h3>
                  {reviewState !== "rejected" && (
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{sourceAuthorShortLabel(source.authors)}</span>
                      <span>{year}</span>
                      <span>{category}</span>
                      <span>{venueLabel}</span>
                      <span>{providerLabel}</span>
                    </div>
                  )}
                </div>
                {!compactMode && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant={sourceReviewBadgeVariant(reviewState)}>
                      {reviewLabel}
                    </Badge>
                    <Badge variant="secondary">可信度 {confidence}</Badge>
                    <Badge variant={summaryQualityBadgeVariant(summaryQuality)}>
                      {summaryQualityLabel(summaryQuality)}
                    </Badge>
                    <Badge variant={hasAbstract ? "outline" : "secondary"}>
                      {evidenceGroundingLabel(summary.groundingStatus)}
                    </Badge>
                    <Badge
                      variant={sourceRelevanceBadgeVariant(relevanceLevel)}
                    >
                      相關度 {sourceRelevanceTierLabel(relevanceLevel)}
                    </Badge>
                    <Badge variant="outline">{authorityLabel}</Badge>
                    <Badge variant="outline">{languageLabel}</Badge>
                    <Badge variant="secondary">{providerLabel}</Badge>
                    {source.doi && <Badge variant="outline">DOI</Badge>}
                    {source.isOpenAccess && <Badge variant="outline">Open Access</Badge>}
                    {incomplete && (
                      <Badge variant="outline">引用資料不完整</Badge>
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
                <p className="text-sm leading-6 text-foreground/90">
                  <span className="font-medium text-foreground">
                    來源摘要：
                  </span>
                  {summary.contentSummary}
                </p>
                {snippet && (
                  <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">Abstract：</span>
                    {snippet}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
                    <span className="block text-[11px] text-muted-foreground">相關性</span>
                    <span className="font-medium text-foreground">{scoreLabel(source.relevanceScore)}</span>
                  </div>
                  <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
                    <span className="block text-[11px] text-muted-foreground">來源品質</span>
                    <span className="font-medium text-foreground">{scoreLabel(source.sourceQualityScore)}</span>
                  </div>
                  <div className="rounded-md border border-border/70 bg-muted/20 px-2 py-1.5">
                    <span className="block text-[11px] text-muted-foreground">總分</span>
                    <span className="font-medium text-foreground">{scoreLabel(source.finalScore)}</span>
                  </div>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  {summary.summaryQualityReason}
                </p>
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
                  <p>與主題關聯：{summary.topicRelation}</p>
                  <p>採用建議：{summary.recommendationReason}</p>
                  {relevanceReasons.length > 0 && (
                    <p>主題相關性：{relevanceReasons.slice(0, 2).join("；")}</p>
                  )}
                  {scoreReasons.length > 0 && (
                    <p>評分原因：{scoreReasons.slice(0, 4).join("；")}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    適合使用章節
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
                variant={
                  summary.recommendation === "recommended"
                    ? "default"
                    : "outline"
                }
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
                展開詳情
              </Button>
            </CollapsibleTrigger>
            {!compactMode && source.url ? (
              <Button
                asChild
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-[36px]"
              >
                <a href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> 查看原始來源
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
                查看原始來源
              </Button>
            ) : null}
          </div>
        </div>

        <CollapsibleContent>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/70 pt-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <h4 className="text-sm font-semibold text-foreground">
                進階資料與引用資訊
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                補齊引用 metadata 與審查筆記；接受或拒絕可直接在摘要卡操作。
              </p>
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

function SearchStepPanel({
  topic,
  reportType,
  audience,
  status,
  message,
  sourceCount,
  isSearching,
  hasTopic,
  onSearch,
  onBack,
}: {
  topic: string;
  reportType: string;
  audience: string;
  status: "idle" | "loading" | "done" | "empty" | "error";
  message: string;
  sourceCount: number;
  isSearching: boolean;
  hasTopic: boolean;
  onSearch: () => void;
  onBack: () => void;
}) {
  return (
    <section
      className="mx-auto max-w-4xl space-y-4"
      data-testid="generator-search-step"
    >
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3">
              步驟 2
            </Badge>
            <h2 className="text-2xl font-semibold tracking-normal text-foreground">
              搜尋來源
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              先確認主題摘要，再搜尋相關學術資料與可信文獻。搜尋完成後會自動進入來源管理。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-[40px]"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> 上一步
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3 sm:col-span-2">
            <span className="block text-xs font-medium text-muted-foreground">
              主題摘要
            </span>
            <span className="mt-1 block font-medium text-foreground">
              {topic || "尚未設定主題"}
            </span>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
            <span className="block text-xs font-medium text-muted-foreground">
              報告設定
            </span>
            <span className="mt-1 block text-foreground">
              {reportType}・{audience}
            </span>
          </div>
        </div>
      </div>

      {status === "loading" ? (
        <div
          className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-12 text-center shadow-sm"
          data-testid="sources-loading"
        >
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-9 w-9 animate-spin" />
          </div>
          <h3 className="text-xl font-semibold text-foreground">
            正在搜尋來源
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            ResearchForge 正在為你搜尋相關學術資料與文獻，並整理成可審查來源。
          </p>
          <div className="mt-6 flex justify-center gap-2" aria-hidden="true">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/70 [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          {status === "done" && sourceCount > 0 ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-700">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                已找到 {sourceCount} 筆來源
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {message || "已整理來源，接下來會進入管理來源工作區。"}
              </p>
            </>
          ) : status === "empty" ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                尚未找到可用來源
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {message ||
                  "目前沒有找到符合此主題的來源，請換更具體的關鍵詞再試一次。"}
              </p>
            </>
          ) : status === "error" ? (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <XCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-destructive">
                來源搜尋失敗
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {message || "來源搜尋失敗，請稍後再試。"}
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                準備搜尋來源
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                點擊搜尋後，ResearchForge 會依主題與報告設定查找候選來源。
              </p>
            </>
          )}

          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
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
              className="min-h-[42px]"
              onClick={onSearch}
              disabled={isSearching || !hasTopic}
              data-testid="button-search-sources"
            >
              <Search className="mr-2 h-4 w-4" />
              {status === "error" || status === "empty"
                ? "重新搜尋"
                : "搜尋來源"}
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
}: {
  sources: SourceRecord[];
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
  topic: string;
  recommendedAcceptedSourceCount: number;
  pipelineStats: SourcePipelineStats | null;
}) {
  const [activeTab, setActiveTab] = useState<SourceReviewTab>("all");
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const previousReviewStates = useRef<Map<string, SourceReviewState>>(
    new Map(),
  );
  const counts = sourceReviewCounts(sources);
  const primarySources = primaryCandidateSources(sources);
  const secondarySources = secondaryCandidateSources(sources);
  const lowRelevanceSources = lowRelevanceCandidateSources(sources);
  const reviewableSources = reviewableCandidateSources(sources);
  const visibleSources =
    activeTab === "all"
      ? reviewableSources
      : sourcesForReviewTab(sources, activeTab);
  const activeTabLabel =
    SOURCE_REVIEW_TABS.find((tab) => tab.value === activeTab)?.label ?? "來源";
  const primaryPendingCount = primarySources.length;
  const secondaryPendingCount = secondarySources.length;
  const lowPendingCount = lowRelevanceSources.length;
  const stats: SourcePipelineStats = pipelineStats ?? {
    rawResults: sources.length,
    providerGroups: 0,
    successfulProviderGroups: 0,
    dedupedResults: sources.length,
    primaryCandidates: primaryPendingCount,
    secondaryCandidates: secondaryPendingCount,
    lowRelevance: lowPendingCount,
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
            接受的來源會進入參考文獻，拒絕的來源不會匯出；展開卡片可補
            metadata。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={counts.accepted ? "default" : "outline"}>
            已接受來源：{counts.accepted} 筆
          </Badge>
          <Badge
            variant={
              counts.accepted >= recommendedAcceptedSourceCount
                ? "secondary"
                : "outline"
            }
          >
            最低 3 筆 / 建議 {recommendedAcceptedSourceCount} 筆
          </Badge>
          <Badge variant={counts.rejected ? "secondary" : "outline"}>
            已拒絕 {counts.rejected} 筆
          </Badge>
          <Badge variant="outline">主要候選 {primaryPendingCount} 筆</Badge>
          <Badge variant="outline">延伸候選 {secondaryPendingCount} 筆</Badge>
          <Badge variant="outline">低相關 {lowPendingCount} 筆</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            檢索資料池
          </p>
          <p className="mt-1 text-foreground">
            raw {stats.rawResults} 筆，deduped {stats.dedupedResults} 筆
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            provider batches {stats.successfulProviderGroups} / {stats.providerGroups}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            候選分組
          </p>
          <p className="mt-1 text-foreground">
            primary {stats.primaryCandidates}，secondary {stats.secondaryCandidates}
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            降級結果
          </p>
          <p className="mt-1 text-foreground">
            low relevance {stats.lowRelevance}，rejected {stats.rejected}
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
                待審核 ({counts.pending})
              </TabsTrigger>
              <TabsTrigger value="rejected" data-testid="tab-sources-rejected">
                已拒絕 ({counts.rejected})
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
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              {activeTab === "all" && counts.all > 0
                ? `目前沒有符合主題的主要候選；已找到 ${lowPendingCount} 筆低相關來源，預設不建議採用。`
                : `${activeTabLabel}目前沒有來源。`}
            </div>
          )}
          {lowRelevanceSources.length > 0 && (
            <Collapsible>
              <div className="rounded-md border border-border bg-muted/10 px-3 py-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-[40px] w-full items-center justify-between gap-2 text-left"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        低相關來源 ({lowRelevanceSources.length})
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        已預設收合，不會進入主要推薦列表。
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div
                    className="space-y-3"
                    data-testid="sources-list-low-relevance"
                  >
                    {lowRelevanceSources.map((source) => {
                      const key = source.id || sourceRecordKey(source);
                      return (
                        <SourceReviewCard
                          key={key}
                          source={source}
                          isExpanded={expandedSourceIds.includes(key)}
                          onExpandedChange={(open) =>
                            setSourceExpanded(key, open)
                          }
                          onReview={handleReview}
                          onEdit={onEdit}
                          topic={topic}
                        />
                      );
                    })}
                  </div>
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
  expansions,
  advancedOpen,
  detectedCategory,
  autoSearchEnabled,
  workspaceResume,
  researchDepthLabel,
  onInputChange,
  onExpandTopic,
  onApplyExpansion,
  onAdvancedOpenChange,
  onNext,
  onClearWorkspace,
}: {
  input: ReportInput;
  expansions: TopicExpansionCard[];
  advancedOpen: boolean;
  detectedCategory: TopicCategory | null;
  autoSearchEnabled: boolean;
  workspaceResume: WorkspaceResumeState | null;
  researchDepthLabel: string;
  onInputChange: (key: ReportInputStringKey, value: string) => void;
  onExpandTopic: () => void;
  onApplyExpansion: (title: string) => void;
  onAdvancedOpenChange: (open: boolean) => void;
  onNext: () => void;
  onClearWorkspace: () => void;
}) {
  const AUTO = "自動偵測";
  const hasTopic = Boolean(input.topic.trim());

  return (
    <section className="mx-auto max-w-3xl" data-testid="generator-topic-step">
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3">
              步驟 1
            </Badge>
            <h2 className="text-2xl font-semibold tracking-normal text-foreground">
              設定主題
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              先定義研究主題與輸出條件，下一步再進入獨立的來源搜尋工作區。
            </p>
          </div>
          {workspaceResume && <Badge variant="outline">工作區續編</Badge>}
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="topic">
              報告主題 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="topic"
              placeholder="例如：豬在農業生產與生態系統中的角色與價值"
              value={input.topic}
              onChange={(e) => onInputChange("topic", e.target.value)}
              data-testid="input-topic"
              className="h-11"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[38px] w-full"
              onClick={onExpandTopic}
              data-testid="button-expand-topic"
            >
              <Sparkles className="mr-2 h-4 w-4" /> 擴寫主題
            </Button>

            {expansions.length > 0 && (
              <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-foreground">
                    研究子題建議
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    可搜尋研究方向與查詢規劃，套用後會清空舊來源並重新開始搜尋。
                  </p>
                </div>
                {expansions.map((card, i) => (
                  <article
                    key={`${card.title}-${card.angle}`}
                    className="rounded-md border border-border bg-background px-3 py-3"
                    data-testid={`expansion-${i}`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <Badge variant="secondary" className="mb-2">
                          {card.angle}
                        </Badge>
                        <h3 className="text-sm font-semibold leading-6 text-foreground">
                          {card.title}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {card.reason}
                        </p>
                        {card.researchValue && (
                          <p className="mt-2 text-xs leading-5 text-foreground/80">
                            研究價值：{card.researchValue}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-[36px] shrink-0"
                        onClick={() => onApplyExpansion(card.title)}
                      >
                        套用此題目
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                      {card.dataDirections?.length ? (
                        <div>
                          <span className="font-medium text-foreground">
                            可找資料：
                          </span>
                          {card.dataDirections.join("、")}
                        </div>
                      ) : null}
                      {card.chineseKeywords?.length ? (
                        <div>
                          <span className="font-medium text-foreground">
                            中文關鍵詞：
                          </span>
                          {card.chineseKeywords.join("、")}
                        </div>
                      ) : null}
                      {card.englishKeywords?.length ? (
                        <div>
                          <span className="font-medium text-foreground">
                            英文關鍵詞：
                          </span>
                          {card.englishKeywords.join(", ")}
                        </div>
                      ) : null}
                      {card.suggestedQuery ? (
                        <div>
                          <span className="font-medium text-foreground">
                            建議查詢：
                          </span>
                          {card.suggestedQuery}
                        </div>
                      ) : null}
                    </div>
                    {card.searchBoundary && (
                      <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                        搜尋邊界：{card.searchBoundary}
                        {card.excludedTerms?.length
                          ? ` 避免漂移：${card.excludedTerms.join("、")}。`
                          : ""}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MAIN_SELECT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Select
                  value={input[f.key]}
                  onValueChange={(v) => onInputChange(f.key, v)}
                >
                  <SelectTrigger
                    id={f.key}
                    data-testid={`select-${f.key}`}
                    className="h-11"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="researchDepth">研究深度</Label>
              <Select
                value={input.researchDepth}
                onValueChange={(value) => onInputChange("researchDepth", value)}
              >
                <SelectTrigger
                  id="researchDepth"
                  data-testid="select-researchDepth"
                  className="h-11"
                >
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
              <p className="text-xs text-muted-foreground">
                目前建議來源數：{researchDepthLabel}
              </p>
            </div>
          </div>

          {!autoSearchEnabled && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              目前資料來源設定為自行提供；仍可進入來源搜尋階段，再決定是否搜尋或回來調整。
            </div>
          )}

          <Collapsible open={advancedOpen} onOpenChange={onAdvancedOpenChange}>
            <div className="rounded-md border border-border bg-muted/20">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-[44px] w-full items-center justify-between px-3 text-left"
                  data-testid="button-advanced-settings"
                >
                  <span className="text-sm font-semibold text-foreground">
                    進階設定
                  </span>
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CollapsibleTrigger>

              <CollapsibleContent className="border-t border-border px-3 py-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="domainOverride">主題領域</Label>
                    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                      {detectedCategory ? (
                        <span className="text-foreground">
                          系統判定：
                          <span className="ml-1 font-semibold text-primary">
                            {detectedCategory}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          輸入主題後會自動判定領域。
                        </span>
                      )}
                    </div>
                    <Select
                      value={input.domainOverride || AUTO}
                      onValueChange={(v) =>
                        onInputChange("domainOverride", v === AUTO ? "" : v)
                      }
                    >
                      <SelectTrigger
                        id="domainOverride"
                        data-testid="select-domainOverride"
                        className="h-11 bg-background"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO}>自動判定</SelectItem>
                        {TOPIC_CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {ADVANCED_SELECT_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-2">
                      <Label htmlFor={f.key}>{f.label}</Label>
                      <Select
                        value={input[f.key]}
                        onValueChange={(v) => onInputChange(f.key, v)}
                      >
                        <SelectTrigger
                          id={f.key}
                          data-testid={`select-${f.key}`}
                          className="h-11 bg-background"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}

                  {ADVANCED_TEXT_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-2">
                      <Label htmlFor={f.key}>{f.label}</Label>
                      <Input
                        id={f.key}
                        placeholder={f.placeholder}
                        value={input[f.key]}
                        onChange={(e) => onInputChange(f.key, e.target.value)}
                        data-testid={`input-${f.key}`}
                        className="h-11 bg-background"
                      />
                    </div>
                  ))}

                  {ADVANCED_TEXTAREA_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-2 sm:col-span-2">
                      <Label htmlFor={f.key}>{f.label}</Label>
                      <Textarea
                        id={f.key}
                        placeholder={f.placeholder}
                        value={input[f.key]}
                        onChange={(e) => onInputChange(f.key, e.target.value)}
                        data-testid={`input-${f.key}`}
                        className={`${f.minHeight} resize-y bg-background`}
                      />
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

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
              disabled={!hasTopic}
              onClick={onNext}
            >
              下一步：搜尋來源 <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ManageStepPanel({
  sources,
  acceptedCount,
  hasWorkspaceTopicMismatch,
  researchDepth,
  recommendedAcceptedSourceCount,
  pipelineStats,
  onBack,
  onNext,
  onReview,
  onEdit,
  topic,
}: {
  sources: SourceRecord[];
  acceptedCount: number;
  hasWorkspaceTopicMismatch: boolean;
  researchDepth: ReportInput["researchDepth"];
  recommendedAcceptedSourceCount: number;
  pipelineStats: SourcePipelineStats | null;
  onBack: () => void;
  onNext: () => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
  topic: string;
}) {
  const sourceQualityReadiness = generationReadiness(
    acceptedSourceRecords(sources),
    researchDepth,
  );
  const canProceedToGenerate =
    sourceQualityReadiness.canGenerate && !hasWorkspaceTopicMismatch;
  const sourceGateWarning = hasWorkspaceTopicMismatch
    ? "目前來源屬於另一個主題，請重新搜尋後再生成。"
    : sourceQualityReadiness.primarySourceCount + sourceQualityReadiness.secondarySourceCount < 3
      ? "目前主要／延伸來源不足。請重新搜尋或調整主題，至少需要 3 筆可驗證來源。"
      : sourceQualityReadiness.lowQualityAcceptedCount > 0
        ? "系統找到多筆延伸或低相關來源，但它們不足以支撐本研究主題。"
        : sourceQualityReadiness.warning;

  return (
    <section
      className="mx-auto max-w-5xl space-y-4"
      data-testid="generator-manage-step"
    >
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Badge variant="secondary" className="mb-3">
              步驟 3
            </Badge>
            <h2 className="text-2xl font-semibold tracking-normal text-foreground">
              管理來源
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              審查候選來源、補 metadata，並留下要進入報告的可信資料。
            </p>
          </div>
          <Badge
            variant={acceptedCount ? "default" : "outline"}
            className="w-fit"
          >
            已接受來源：{acceptedCount} 筆
          </Badge>
          <Badge variant="outline" className="w-fit">
            {researchDepth} 建議 {recommendedAcceptedSourceCount} 筆
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {sources.length > 0 ? (
          <SourceManagePanel
            sources={sources}
            onReview={onReview}
            onEdit={onEdit}
            topic={topic}
            recommendedAcceptedSourceCount={recommendedAcceptedSourceCount}
            pipelineStats={pipelineStats}
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
          {!canProceedToGenerate && (
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
  researchDepth,
  recommendedAcceptedSourceCount,
  readiness,
  isGenerating,
  generateButtonLabel,
  generateStatus,
  onGenerate,
  onBack,
}: {
  acceptedCount: number;
  researchDepth: ReportInput["researchDepth"];
  recommendedAcceptedSourceCount: number;
  readiness: ReturnType<typeof generationReadiness>;
  isGenerating: boolean;
  generateButtonLabel: string;
  generateStatus: "idle" | "loading" | "done" | "error";
  onGenerate: () => void;
  onBack: () => void;
}) {
  const progressValue = isGenerating
    ? 72
    : readiness.canGenerateFull
      ? 100
      : readiness.canGenerate
        ? 60
        : Math.min(45, acceptedCount * 9);

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
              {readiness.canGenerateFull
                ? "來源品質已達完整報告門檻，可以建立完整報告工作區。"
                : readiness.canGenerate
                  ? "來源品質已達初步報告門檻；主要來源不足時，報告會清楚標示為初步報告。"
                  : "來源品質不足，請先回到來源管理補足相關且有摘要的可信來源。"}
            </p>
          </div>
        </div>

        <Progress value={progressValue} />
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Badge
            variant={
              readiness.canGenerateFull
                ? "default"
                : readiness.canGenerate
                  ? "secondary"
                  : "outline"
            }
          >
            {readiness.canGenerateFull
              ? "可生成正式報告"
              : readiness.canGenerate
                ? "可生成初步報告"
                : "來源不足"}
          </Badge>
          <Badge variant="outline">
            主要 {readiness.primarySourceCount} 筆
          </Badge>
          <Badge variant="outline">
            延伸 {readiness.secondarySourceCount} 筆
          </Badge>
          <Badge variant="outline">
            相關來源 {readiness.relevantSourceCount} 筆
          </Badge>
          <Badge variant="outline">
            可用摘要 {readiness.usableSummaryCount} 筆
          </Badge>
          <Badge variant="outline">涵蓋面 {readiness.coverageCount} 項</Badge>
          {isGenerating && (
            <Badge variant="outline">{readiness.progressLabel}</Badge>
          )}
        </div>

        {readiness.warning && (
          <div className="mt-4 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{readiness.warning}</span>
          </div>
        )}

        {readiness.diagnostics.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
            {readiness.diagnostics.slice(0, 5).map((diagnostic) => (
              <li key={diagnostic}>{diagnostic}</li>
            ))}
          </ul>
        )}

        {generateStatus === "error" && readiness.canGenerate && (
          <div className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>生成失敗，請確認輸入內容後再試一次。</span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="min-h-[42px]"
            onClick={onBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> 上一步：管理來源
          </Button>
          {readiness.canGenerate ? (
            <Button
              type="button"
              size="lg"
              className="min-h-[46px]"
              onClick={onGenerate}
              disabled={isGenerating}
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
  visible,
}: {
  keywordDebug: KeywordSearchDebugState | null;
  preflight: SearchPreflightResult | null;
  acceptedSources: SourceRecord[];
  visible: ReturnType<typeof generatorWorkflowVisibility>;
}) {
  if (!visible.showTechnicalLogs && !visible.showEvidenceCards) return null;

  const debugEvidenceCards = visible.showEvidenceCards
    ? buildEvidenceCards(acceptedSources, [], { resetText: true })
    : [];

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
                  <p className="mt-1 line-clamp-2 text-muted-foreground">
                    {card.evidence}
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [expansions, setExpansions] = useState<TopicExpansionCard[]>([]);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [sourceSearchStatus, setSourceSearchStatus] = useState<
    "idle" | "loading" | "done" | "empty" | "error"
  >("idle");
  const [sourceSearchMessage, setSourceSearchMessage] = useState("");
  const [keywordSearchDebug, setKeywordSearchDebug] =
    useState<KeywordSearchDebugState | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [developerDebugOpen, setDeveloperDebugOpen] = useState(false);
  const [workspaceResume, setWorkspaceResume] =
    useState<WorkspaceResumeState | null>(null);
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
  const activeTopicFingerprintRef = useRef<string | null>(null);
  const suppressTopicResetRef = useRef(false);

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
  const hasTopic = Boolean(input.topic.trim());
  const preflight = useMemo(
    () =>
      hasTopic
        ? runSearchPreflight({
            topic: input.topic.trim(),
            reportType: input.reportType,
          })
        : null,
    [hasTopic, input.reportType, input.topic],
  );
  const detectedCategory: TopicCategory | null = input.topic.trim()
    ? detectTopicCategory(input.topic.trim(), input.reportType, derivedPurpose)
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
  const acceptedSources = acceptedSourceRecords(currentWorkflowSources).filter(
    (source) => sourceCanEnterReport(source, sourceWorkflowLock),
  );
  const selectedDepthOption =
    RESEARCH_DEPTH_OPTIONS.find(
      (option) => option.value === input.researchDepth,
    ) ?? RESEARCH_DEPTH_OPTIONS[1]!;
  const readiness = generationReadiness(acceptedSources, input.researchDepth);
  const recommendedAcceptedSourceCount =
    input.researchDepth === "deep" ? 10 : 10;
  const currentTopicFingerprint = hasTopic
    ? reportTopicFingerprint(input.topic.trim())
    : null;
  const hasWorkspaceTopicMismatch =
    Boolean(sources.length) &&
    Boolean(sourceWorkspaceFingerprint) &&
    Boolean(currentTopicFingerprint) &&
    sourceWorkspaceFingerprint !== currentTopicFingerprint;
  const workflowVisibility = generatorWorkflowVisibility(developerDebugOpen);
  const reviewCounts = safeSourceReviewCounts(currentWorkflowSources);
  const sourcePipelineStats: SourcePipelineStats | null = currentWorkflowSources.length
    ? {
        rawResults:
          keywordSearchDebug?.retrievalStats.rawResults || currentWorkflowSources.length,
        providerGroups:
          keywordSearchDebug?.retrievalStats.providerGroups ?? 0,
        successfulProviderGroups:
          keywordSearchDebug?.retrievalStats.successfulProviderGroups ?? 0,
        dedupedResults: currentWorkflowSources.length,
        primaryCandidates: primaryCandidateSources(currentWorkflowSources).length,
        secondaryCandidates: secondaryCandidateSources(currentWorkflowSources).length,
        lowRelevance: lowRelevanceCandidateSources(currentWorkflowSources).length,
        rejected: rejectedSourceRecords(currentWorkflowSources).length,
      }
    : null;
  const sourceReviewAvailable =
    sourceSearchStatus !== "idle" || currentWorkflowSources.length > 0;
  const stepCompleted: Record<GeneratorWorkflowStep, boolean> = {
    topic: hasTopic && activeStep !== "topic",
    search: sourceReviewAvailable && activeStep !== "search",
    manage: currentWorkflowSources.length > 0 && activeStep !== "manage",
    generate: false,
  };
  const canEnterStep = (step: GeneratorWorkflowStep) => {
    if (step === "topic") return true;
    if (!hasTopic) return false;
    if (step === "search") return true;
    if (step === "manage")
      return currentWorkflowSources.length > 0 && !hasWorkspaceTopicMismatch;
    if (step === "generate")
      return readiness.canGenerate && !hasWorkspaceTopicMismatch;
    return true;
  };
  const handleStepSelect = (step: GeneratorWorkflowStep) => {
    if (
      isStepTransitioning ||
      isSearchingSources ||
      isGenerating ||
      step === activeStep ||
      !canEnterStep(step)
    )
      return;
    beginStepTransition(
      step,
      workflowTransitionCopy(activeStep, step),
      step === "generate" ? 520 : 420,
    );
  };
  const scheduleManageStepAfterSearch = (sourceCount: number) => {
    if (sourceCount <= 0) return;
    if (stepDelayTimerRef.current !== null) {
      window.clearTimeout(stepDelayTimerRef.current);
    }
    stepDelayTimerRef.current = window.setTimeout(() => {
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

  useEffect(() => {
    return () => clearStepTransition();
  }, []);

  useEffect(() => {
    const topic = input.topic.trim();
    const fingerprint = reportTopicFingerprint(topic);

    if (suppressTopicResetRef.current) {
      activeTopicFingerprintRef.current = topic ? fingerprint : null;
      suppressTopicResetRef.current = false;
      return;
    }

    const previousFingerprint = activeTopicFingerprintRef.current;
    if (!topic) {
      activeTopicFingerprintRef.current = null;
      return;
    }

    if (previousFingerprint === null) {
      activeTopicFingerprintRef.current = fingerprint;
      return;
    }

    if (previousFingerprint === fingerprint) return;

    activeTopicFingerprintRef.current = fingerprint;
    if (
      sources.length === 0 &&
      sourceSearchStatus === "idle" &&
      !workspaceResume
    )
      return;

    clearStepTransition();
    setSources([]);
    setSourceWorkspaceFingerprint(null);
    setSourceWorkflowId(null);
    setSourceQueryPlanHash(null);
    setKeywordSearchDebug(null);
    setExpansions([]);
    setSourceSearchStatus("idle");
    setSourceSearchMessage("主題已變更，請重新搜尋來源。");
    setGenerateStatus("idle");
    setWorkspaceResume(null);
    setActiveStep("search");
    toast({
      title: "主題已變更",
      description: "已清空前一個主題的來源與接受紀錄，請重新搜尋。",
    });
  }, [input.topic, sourceSearchStatus, sources.length, toast, workspaceResume]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("reportId");
    if (!reportId || workspaceResume?.loaded) return;

    const workspace = loadReportWorkspace(reportId);
    if (!workspace) return;
    if (!workspaceMatchesTopic(workspace, workspace.input.topic)) return;

    suppressTopicResetRef.current = true;
    activeTopicFingerprintRef.current = workspace.topicFingerprint;
    const resumeLock = {
      workflowId: workspace.workflowId,
      topicHash: workspace.topicHash,
      queryPlanHash:
        workspace.acceptedSources.find((source) => source.queryPlanHash)
          ?.queryPlanHash ?? workspace.topicHash,
    };
    setWorkspaceResume({ reportId, loaded: true });
    setInput(workspace.input);
    setSources(
      applyWorkflowLockToSources(
        workspace.acceptedSources,
        resumeLock,
        workspace.input.topic,
      ),
    );
    setSourceWorkflowId(resumeLock.workflowId);
    setSourceWorkspaceFingerprint(resumeLock.topicHash);
    setSourceQueryPlanHash(resumeLock.queryPlanHash);
    setSourceSearchStatus("done");
    setSourceSearchMessage("已載入報告工作區來源，可調整後重新生成。");
    setActiveStep(
      workspace.acceptedSources.length > 0
        ? "manage"
        : workspace.input.topic.trim()
          ? "search"
          : "topic",
    );
  }, [workspaceResume?.loaded]);

  // ── Source search ──────────────────────────────────────────────────────────

  const handleSearchSources = async () => {
    const topic = input.topic.trim();
    if (!topic) {
      setSourceSearchStatus("error");
      setSourceSearchMessage("請先輸入研究主題。");
      setActiveStep("topic");
      toast({
        title: "請先輸入主題",
        description:
          "輸入研究主題後，才能搜尋 Crossref 與 Semantic Scholar 來源。",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingSources(true);
    setSourceSearchStatus("loading");
    setSourceSearchMessage("");
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
      const result = await searchSources({
        topic,
        reportType: input.reportType,
        audience: input.targetAudience || input.academicLevel,
        sourceMode: input.sourceRequirement,
        language: input.outputLanguage,
      });
      const workflowLock: SourceWorkflowLock = {
        workflowId:
          result.workflowId ??
          result.searchTrace?.workflowId ??
          createClientWorkflowId(),
        topicHash:
          result.topicHash ??
          result.searchTrace?.topicHash ??
          reportTopicFingerprint(topic),
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
              : topic,
          ),
      };
      const dedupedSources = dedupeSourceRecords(
        supplementTrustedClimateSources(
          result.sources.map(normalizeSourceForReview),
          topic,
        ),
      );
      const relevanceAssessedSources =
        result.searchTrace || result.planner
          ? dedupedSources
          : applySourceRelevanceAssessments(dedupedSources, topic);
      const normalizedSources = applySourceAuthorityAndLanguage(
        relevanceAssessedSources,
      );
      const workflowSources = applyWorkflowLockToSources(
        normalizedSources,
        workflowLock,
        topic,
      );
      setSources(workflowSources);
      setSourceWorkflowId(workflowLock.workflowId);
      setSourceWorkspaceFingerprint(workflowLock.topicHash);
      setSourceQueryPlanHash(workflowLock.queryPlanHash);
      setKeywordSearchDebug(keywordSearchDebugFromResult(result));
      if (workflowSources.length) {
        setSourceSearchStatus("done");
        const partialProviderFailure = hasProviderFailures(result);
        const primaryCount = workflowSources.filter(
          (source) =>
            source.relevanceLevel === "primary" &&
            source.shouldShowInMainList !== false,
        ).length;
        const lowCount = workflowSources.filter(
          (source) =>
            source.relevanceLevel === "low" ||
            source.relevanceLevel === "off_topic" ||
            source.shouldShowInMainList === false,
        ).length;
        const searchSummaryMessage =
          primaryCount > 0
            ? `已找到 ${primaryCount} 筆主要候選來源，另有 ${lowCount} 筆低相關來源已折疊。`
            : `目前沒有符合主題的主要來源；已找到 ${lowCount} 筆低相關來源，預設不建議採用。`;
        setSourceSearchMessage(searchSummaryMessage);
        toast({
          title: partialProviderFailure ? "部分來源搜尋失敗" : "已找到來源",
          description: partialProviderFailure
            ? `已顯示可用來源，部分資料來源暫時無法使用。${searchSummaryMessage}`
            : primaryCount > 0
              ? `高相關來源不足時不會用低相關來源湊數。${searchSummaryMessage}`
              : searchSummaryMessage,
        });
        scheduleManageStepAfterSearch(workflowSources.length);
      } else {
        setSourceSearchStatus("empty");
        setSourceSearchMessage(
          "已產生搜尋關鍵詞，但目前沒有找到符合此主題的來源，請換更具體的關鍵詞再試一次。",
        );
      }
    } catch (error) {
      const preflightResult =
        preflight ??
        runSearchPreflight({ topic, reportType: input.reportType });
      const searchQuery = buildPreflightSearchQuery(topic, preflightResult);

      try {
        const result = await searchSources({ query: searchQuery });
        const fallbackLock: SourceWorkflowLock = {
          workflowId: createClientWorkflowId(),
          topicHash: reportTopicFingerprint(topic),
          queryPlanHash: reportTopicFingerprint(searchQuery),
        };
        const normalizedSources = applySourceAuthorityAndLanguage(
          applySourceRelevanceAssessments(
            dedupeSourceRecords(
              supplementTrustedClimateSources(
                result.sources.map(normalizeSourceForReview),
                topic,
              ),
            ),
            topic,
          ),
        );
        const workflowSources = applyWorkflowLockToSources(
          normalizedSources,
          fallbackLock,
          topic,
        );
        setSources(workflowSources);
        setSourceWorkflowId(fallbackLock.workflowId);
        setSourceWorkspaceFingerprint(fallbackLock.topicHash);
        setSourceQueryPlanHash(fallbackLock.queryPlanHash);
        setKeywordSearchDebug({
          fallbackUsed: true,
          llmStatus: "skipped",
          llmStatusLabel: "略過",
          queries: [searchQuery],
          providerErrors: [
            `/api/search-sources topic - ${sourceTechnicalErrorMessage(error)}`,
          ],
          searchIntent: null,
          intentQueries: null,
          warnings: [],
          retrievalStats: {
            rawResults: result.sources.length,
            providerGroups:
              result.groups?.length ?? result.provider_status?.length ?? 0,
            successfulProviderGroups: (
              result.groups ?? result.provider_status ?? []
            ).filter((group) => group.ok).length,
          },
        });
        if (workflowSources.length) {
          setSourceSearchStatus("done");
          toast({
            title: "已找到來源",
            description: `關鍵詞搜尋端點暫不可用，已改用既有搜尋。主要候選 ${workflowSources.filter((source) => source.relevanceLevel === "primary").length} 筆，低相關已折疊。`,
          });
          scheduleManageStepAfterSearch(workflowSources.length);
        } else {
          setSourceSearchStatus("empty");
          setSourceSearchMessage(
            "目前沒有找到符合此主題的來源，請換更具體的關鍵詞再試一次。",
          );
        }
      } catch (fallbackError) {
        setSourceSearchStatus("error");
        setSourceSearchMessage(sourceErrorMessage(fallbackError));
        toast({
          title: "來源搜尋失敗",
          description: sourceErrorMessage(fallbackError),
          variant: "destructive",
        });
      }
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
    if (reviewState === "accepted") {
      const source = sources.find(
        (item) => (item.id || sourceRecordKey(item)) === sourceId,
      );
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
              : "此來源未通過主題相關性門檻，不能作為主要報告來源。",
          variant: "destructive",
        });
        return;
      }
    }

    setSources((current) =>
      updateSourceReviewState(current, sourceId, reviewState),
    );
  };

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
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
    const currentReadiness = generationReadiness(
      acceptedSources,
      input.researchDepth,
    );
    const unsafeAcceptedSources = acceptedSourceRecords(currentWorkflowSources).filter(
      (source) => !sourceCanEnterReport(source, sourceWorkflowLock),
    );
    if (hasWorkspaceTopicMismatch) {
      setGenerateStatus("error");
      toast({
        title: "主題與來源不一致",
        description: "目前來源屬於另一個主題，請重新搜尋後再生成。",
        variant: "destructive",
      });
      return;
    }
    if (unsafeAcceptedSources.length > 0 || !sourceWorkflowLock) {
      setGenerateStatus("error");
      toast({
        title: "來源與目前工作流程不一致",
        description:
          "目前已接受來源不足，或部分來源與目前主題不一致。請重新搜尋並接受相關來源後再生成報告。",
        variant: "destructive",
      });
      return;
    }
    if (!currentReadiness.canGenerate) {
      setGenerateStatus("error");
      toast({
        title: "來源不足",
        description:
          currentReadiness.warning ?? "請先接受更多可信來源後再生成。",
        variant: "destructive",
      });
      return;
    }

    const effectiveInput: ReportInput = {
      ...input,
      targetAudience:
        input.targetAudience || academicToAudience(input.academicLevel),
      purpose: academicToPurpose(input.academicLevel),
      acceptedSources,
    };

    setIsGenerating(true);
    setGenerateStatus("loading");
    setInput(effectiveInput);

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
          );
          if (!readinessForWorkspace.canGenerate) {
            setGenerateStatus("error");
            setIsGenerating(false);
            return;
          }
          let workspace = createReportWorkspace(
            effectiveInput,
            acceptedSources,
            readinessForWorkspace.mode === "quick_draft"
              ? "quick_draft"
              : "full_report",
          );
          const llmDraft = await requestLlmReportDraft({
            reportInput: effectiveInput,
            acceptedSources,
            evidenceCards: workspace.evidenceCards,
            generationMode: workspace.generationMode,
          });
          workspace = mergeLlmReportDraft(workspace, llmDraft);
          saveReportWorkspace(workspace);

          setGenerateStatus("done");
          if (!llmDraft.ok) {
            toast({
              title: "已建立初稿",
              description:
                llmDraft.warning ??
                "LLM 報告生成暫不可用，已保留來源導向草稿。",
            });
          }
          navigate(reportWorkspacePath(workspace.id));
        } catch {
          setGenerateStatus("error");
          setIsGenerating(false);
          toast({
            title: "生成失敗",
            description: "請確認輸入內容後再試一次。",
            variant: "destructive",
          });
        }
      },
    );
  };

  // ── Expand topic ──────────────────────────────────────────────────────────────

  const handleExpand = () => {
    if (!input.topic.trim()) {
      toast({
        title: "請先輸入主題",
        description: "輸入一個簡短的主題後，系統會幫你擴寫成完整的報告題目。",
        variant: "destructive",
      });
      return;
    }
    setExpansions(
      expandTopicCards(input.topic.trim(), detectedCategory ?? undefined),
    );
  };

  const applyExpansion = (title: string) => {
    updateInput("topic", title);
    setExpansions([]);
    toast({
      title: "已套用研究題目",
      description: "已將研究方向填入主題欄位。",
    });
  };

  // ── Clear ────────────────────────────────────────────────────────────────────

  const handleClear = () => {
    clearStepTransition();
    setInput(DEFAULT_INPUT);
    activeTopicFingerprintRef.current = null;
    suppressTopicResetRef.current = false;
    setExpansions([]);
    setSources([]);
    setSourceWorkspaceFingerprint(null);
    setSourceWorkflowId(null);
    setSourceQueryPlanHash(null);
    setSourceSearchStatus("idle");
    setSourceSearchMessage("");
    setKeywordSearchDebug(null);
    setGenerateStatus("idle");
    setIsGenerating(false);
    setIsSearchingSources(false);
    setDeveloperDebugOpen(false);
    setWorkspaceResume(null);
    setActiveStep("topic");
  };

  const shortTopicHint = input.topic.trim() && isShortTopic(input.topic);
  const autoSearchEnabled =
    input.sourceRequirement === "需要，並生成參考文獻格式";
  const generateButtonLabel = !hasTopic
    ? "尚未輸入主題"
    : isGenerating
      ? readiness.progressLabel
      : generateStatus === "error"
        ? readiness.buttonLabel
        : readiness.buttonLabel;
  const goToStep = (step: GeneratorWorkflowStep) => handleStepSelect(step);
  const goToSearchStep = () => {
    if (!hasTopic) {
      setActiveStep("topic");
      toast({
        title: "請先輸入主題",
        description: "設定主題後才能進入來源搜尋。",
        variant: "destructive",
      });
      return;
    }
    goToStep("search");
  };
  const goToManageStep = () => {
    if (!currentWorkflowSources.length) {
      goToStep("search");
      return;
    }
    goToStep("manage");
  };
  const goToGenerateStep = () => goToStep("generate");
  const currentStepLabel =
    WORKFLOW_STEPS.find((step) => step.value === activeStep)?.label ??
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
              <h1 className="text-3xl font-bold tracking-normal text-foreground">
                ResearchForge
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
            currentStep={activeStep}
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
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {currentStepLabel}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={hasTopic ? "secondary" : "outline"}>
                  {hasTopic ? "主題已設定" : "等待主題"}
                </Badge>
                <Badge variant={currentWorkflowSources.length ? "secondary" : "outline"}>
                  來源 {reviewCounts.all} 筆
                </Badge>
                <Badge variant={acceptedSources.length ? "default" : "outline"}>
                  已接受 {reviewCounts.accepted} 筆
                </Badge>
                <Badge variant="outline">{selectedDepthOption.label}</Badge>
                {reviewCounts.rejected > 0 && (
                  <Badge variant="outline">
                    已拒絕 {reviewCounts.rejected} 筆
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {shortTopicHint && activeStep === "topic" && !isStepTransitioning && (
            <div className="mx-auto flex max-w-3xl gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                你的主題較簡短。若要提高報告品質，建議補充研究方向、老師要求、資料來源或個人觀點，或先使用「擴寫主題」。
              </span>
            </div>
          )}

          {isStepTransitioning ? (
            <StepTransitionScreen
              title={transitionMessage.title}
              description={transitionMessage.description}
              targetStep={transitionTargetStep}
            />
          ) : activeStep === "topic" ? (
            <TopicStepPanel
              input={input}
              expansions={expansions}
              advancedOpen={advancedOpen}
              detectedCategory={detectedCategory}
              autoSearchEnabled={autoSearchEnabled}
              workspaceResume={workspaceResume}
              researchDepthLabel={`${selectedDepthOption.label} / 建議 ${recommendedAcceptedSourceCount} 筆`}
              onInputChange={updateInput}
              onExpandTopic={handleExpand}
              onApplyExpansion={applyExpansion}
              onAdvancedOpenChange={setAdvancedOpen}
              onNext={goToSearchStep}
              onClearWorkspace={handleClear}
            />
          ) : activeStep === "search" ? (
            <SearchStepPanel
              topic={input.topic.trim()}
              reportType={input.reportType}
              audience={input.targetAudience || input.academicLevel}
              status={sourceSearchStatus}
              message={sourceSearchMessage}
              sourceCount={currentWorkflowSources.length}
              isSearching={isSearchingSources}
              hasTopic={hasTopic}
              onSearch={handleSearchSources}
              onBack={() => goToStep("topic")}
            />
          ) : activeStep === "manage" ? (
            <ManageStepPanel
              sources={currentWorkflowSources}
              acceptedCount={acceptedSources.length}
              hasWorkspaceTopicMismatch={hasWorkspaceTopicMismatch}
              researchDepth={input.researchDepth}
              recommendedAcceptedSourceCount={recommendedAcceptedSourceCount}
              pipelineStats={sourcePipelineStats}
              onBack={() => goToStep("search")}
              onNext={goToGenerateStep}
              onReview={updateSourceReview}
              onEdit={updateSourceRecord}
              topic={input.topic}
            />
          ) : (
            <GenerateStepPanel
              acceptedCount={acceptedSources.length}
              researchDepth={input.researchDepth}
              recommendedAcceptedSourceCount={recommendedAcceptedSourceCount}
              readiness={readiness}
              isGenerating={isGenerating}
              generateButtonLabel={generateButtonLabel}
              generateStatus={generateStatus}
              onGenerate={handleGenerate}
              onBack={goToManageStep}
            />
          )}

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
                  visible={workflowVisibility}
                />
              </CollapsibleContent>
            </section>
          </Collapsible>
        </section>
      </main>
    </div>
  );
}
