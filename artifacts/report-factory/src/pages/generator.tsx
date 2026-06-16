import { useEffect, useMemo, useRef, useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { searchSources, type SourceSearchResult } from "@workspace/api-client-react";
import {
  expandTopic,
  isShortTopic,
  detectTopicCategory,
  academicToAudience,
  academicToPurpose,
  ReportInput,
  TopicCategory,
  TOPIC_CATEGORIES,
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
import {
  buildEvidenceCards,
  type EvidenceCard,
} from "@/lib/evidenceCards";
import {
  generationReadiness,
  generatorWorkflowVisibility,
  loadReportWorkspace,
  startReportWorkspaceNavigation,
} from "@/lib/reportWorkspace";
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
};

type WorkspaceResumeState = {
  reportId: string;
  loaded: boolean;
};

type GeneratorWorkflowStep = "topic" | "search" | "manage" | "generate";

const DEFAULT_INPUT: ReportInput = {
  topic: "",
  reportType: "研究報告",
  academicLevel: "高中",
  targetAudience: "高中",
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

const RECOMMENDED_ACCEPTED_SOURCE_MIN = 10;

// ─── Field config (visible labels map to stable internal generator values) ───

type SelectOption = { label: string; value: string };

const MAIN_SELECT_FIELDS: { key: ReportInputStringKey; label: string; options: SelectOption[] }[] = [
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

const ADVANCED_SELECT_FIELDS: { key: ReportInputStringKey; label: string; options: SelectOption[] }[] = [
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

const ADVANCED_TEXT_FIELDS: { key: ReportInputStringKey; label: string; placeholder: string }[] = [
  { key: "wordCount", label: "字數需求", placeholder: "例如：1200 字、3000 字、8 頁" },
];

const ADVANCED_TEXTAREA_FIELDS: { key: ReportInputStringKey; label: string; placeholder: string; minHeight: string }[] = [
  { key: "specifiedStructure", label: "指定架構", placeholder: "例如：前言、研究方法、結果、討論、結論", minHeight: "min-h-[88px]" },
  { key: "rubric", label: "評分標準", placeholder: "貼上老師提供的評分標準或檢核項目。", minHeight: "min-h-[96px]" },
  { key: "personalStyle", label: "個人語氣", placeholder: "例如：自然高中生語氣、保留個人反思、避免太像論文。", minHeight: "min-h-[88px]" },
  { key: "supplementalMaterials", label: "自行提供資料", placeholder: "貼上課堂資料、書籍資訊、網址、作者、年份、引用來源或原始數據。", minHeight: "min-h-[120px]" },
  { key: "additionalInfo", label: "其他補充", placeholder: "可貼上老師要求、課堂資料、個人觀點或想加入的內容。", minHeight: "min-h-[96px]" },
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
  const option = fields.find((field) => field.key === key)?.options.find((item) => item.value === value);
  return option?.label ?? value;
}

function sourceErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) {
        if (/http\s*(403|429)|daily_limit_exceeded|quota|rate limit|too many requests/i.test(message)) {
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
  if (checked) return current.includes(section) ? current : [...current, section];
  return current.filter((item) => item !== section);
}

function evidenceCardLabel(card: EvidenceCard): string {
  return card.sourceTitle || card.sourceDomain || card.sourceId;
}

function keywordSearchDebugFromResult(result: SourceSearchResult): KeywordSearchDebugState | null {
  if (!result.keyword_expansion && !result.searchIntent && !result.queries) return null;

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
  const llmStatus = result.llm_status ?? result.searchIntent?.plannerStatus ?? "skipped";

  return {
    fallbackUsed: result.searchIntent?.fallbackUsed ?? result.keyword_expansion?.fallback_used ?? false,
    llmStatus,
    llmStatusLabel: result.searchIntent?.plannerStatus
      ? plannerStatusLabelMap[result.searchIntent.plannerStatus] ?? result.searchIntent.plannerStatus
      : llmStatusLabelMap[llmStatus] ?? llmStatus,
    queries: result.keyword_expansion?.search_queries
      ?? [
        ...(result.queries?.highPrecision ?? []),
        ...(result.queries?.english ?? []),
        ...(result.queries?.chinese ?? []),
      ],
    providerErrors: (result.provider_status ?? result.groups ?? [])
      .filter((group) => !group.ok)
      .map((group) => {
        const detail = [group.error_type, group.error_message].filter(Boolean).join("：");
        return `${group.provider} / ${group.query}${detail ? ` - ${detail}` : ""}`;
      }),
    searchIntent: result.searchIntent ?? null,
    intentQueries: result.queries ?? null,
    warnings: result.warnings ?? [],
  };
}

function hasProviderFailures(result: SourceSearchResult): boolean {
  return (result.provider_status ?? result.groups)?.some((group) => !group.ok) ?? false;
}

function SearchIntentFieldLabel({ field }: { field: SearchIntentDebugLabelKey }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span>{searchIntentDebugLabel(field)}</span>
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground">{field}</code>
    </p>
  );
}

function SearchIntentDebugPanel({ debug }: { debug: KeywordSearchDebugState }) {
  if (!debug.searchIntent) return null;

  return (
    <div className="mb-3 rounded-md border border-border bg-muted/20 p-3" data-testid="search-intent-debug">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">{searchIntentDebugLabel("searchIntent")}</span>
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">searchIntent</code>
        <Badge variant="outline">
          {searchIntentDebugLabel("plannerStatus")}：{debug.llmStatusLabel}
        </Badge>
        <Badge variant={debug.searchIntent.fallbackUsed ? "secondary" : "outline"}>
          {searchIntentDebugLabel("fallbackUsed")}：{debug.searchIntent.fallbackUsed ? "是" : "否"}
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
          <p className="text-xs font-medium text-muted-foreground">高精度查詢 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">queries.highPrecision</code></p>
          <PreflightPills items={debug.intentQueries.highPrecision.slice(0, 6)} />
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
  { value: "topic", label: "設定主題", description: "輸入研究方向", Icon: ClipboardList },
  { value: "search", label: "搜尋來源", description: "查找可信資料", Icon: Search },
  { value: "manage", label: "管理來源", description: "審查與補 metadata", Icon: BookOpen },
  { value: "generate", label: "生成報告", description: "建立結果頁", Icon: Wand2 },
];

function workflowStepIndex(step: GeneratorWorkflowStep): number {
  return WORKFLOW_STEPS.findIndex((item) => item.value === step);
}

function safeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function safeSourceReviewCounts(sources: SourceRecord[]): ReturnType<typeof sourceReviewCounts> {
  const counts = sourceReviewCounts(sources);
  return {
    all: safeCount(counts.all),
    accepted: safeCount(counts.accepted),
    pending: safeCount(counts.pending),
    rejected: safeCount(counts.rejected),
  };
}

function generatorWorkflowStep({
  hasTopic,
  sources,
  isSearching,
  isGenerating,
  canGenerate,
}: {
  hasTopic: boolean;
  sources: SourceRecord[];
  isSearching: boolean;
  isGenerating: boolean;
  canGenerate: boolean;
}): GeneratorWorkflowStep {
  if (!hasTopic) return "topic";
  if (isGenerating || canGenerate) return "generate";
  if (sources.length > 0) return "manage";
  if (isSearching) return "search";
  return "search";
}

function WorkflowStepper({ currentStep }: { currentStep: GeneratorWorkflowStep }) {
  const currentIndex = workflowStepIndex(currentStep);

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-4 shadow-sm" data-testid="generator-workflow-stepper">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {WORKFLOW_STEPS.map((step, index) => {
          const completed = index < currentIndex;
          const active = index === currentIndex;
          const Icon = step.Icon;
          return (
            <div key={step.value} className="relative flex items-center gap-3 sm:flex-col sm:items-center sm:text-center">
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
                {completed ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
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

function sourceReviewBadgeVariant(reviewState: SourceReviewState): "default" | "secondary" | "outline" | "destructive" {
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

function sourceAuthorShortLabel(authors: string[]): string {
  if (authors.length === 0) return "作者待確認";
  if (authors.length === 1) return authors[0];
  return `${authors[0]} 等`;
}

function parseAuthorsInput(value: string): string[] {
  return value
    .split(/[、,，;]/)
    .map((author) => author.trim())
    .filter(Boolean);
}

function sourcesForReviewTab(sources: SourceRecord[], tab: SourceReviewTab): SourceRecord[] {
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

function SourceReviewCard({
  source,
  isExpanded,
  onExpandedChange,
  onReview,
  onEdit,
}: {
  source: SourceRecord;
  isExpanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
}) {
  const sourceId = source.id || sourceRecordKey(source);
  const reviewState = sourceReviewState(source);
  const title = source.title || "標題待確認";
  const year = source.year ? String(source.year) : "年份待確認";
  const usableSections = normalizeUsableSections(source.usableSections);
  const incomplete = sourceHasIncompleteMetadata(source);
  const reviewLabel = sourceReviewLabel(reviewState);
  const confidence = source.confidence ?? "中";
  const StatusIcon = reviewState === "accepted" ? CheckCircle2 : reviewState === "rejected" ? XCircle : AlertTriangle;
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

  return (
    <Collapsible open={isExpanded} onOpenChange={onExpandedChange}>
      <article
        className={`rounded-lg border p-3 transition-colors sm:p-4 ${cardTone}`}
        data-testid={`source-card-${reviewState}`}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${statusTone}`}>
              <StatusIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={sourceReviewBadgeVariant(reviewState)}>{reviewLabel}</Badge>
                <Badge variant="outline">{sourceCategoryLabel(source.sourceCategory)}</Badge>
                <Badge variant="secondary">可信度 {confidence}</Badge>
                <Badge variant="outline">相關度 已排序</Badge>
                {incomplete && <Badge variant="outline">資料不完整</Badge>}
              </div>
              <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={title}>
                {title}
              </h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>作者：{sourceAuthorShortLabel(source.authors)}</span>
                <span>年份：{year}</span>
                <span>來源：{source.sourceType}</span>
                <span>類型：{sourceCategoryLabel(source.sourceCategory)}</span>
              </div>
              <div className="min-w-0 text-xs text-muted-foreground">
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center font-medium text-primary hover:underline"
                  >
                    <span className="truncate">原始連結：{sourceLocatorLabel(source)}</span>
                    <ExternalLink className="ml-1 h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span>原始連結：{source.doi ? `DOI ${source.doi}` : "待確認"}</span>
                )}
              </div>
            </div>
          </div>

          <CollapsibleTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[36px] shrink-0 self-start xl:self-center"
              data-testid="button-source-expand"
              aria-label={isExpanded ? "收合來源細節" : "展開來源細節"}
              title={isExpanded ? "收合來源細節" : "展開來源細節"}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/70 pt-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-title`} className="text-xs">標題</Label>
              <Input
                id={`${sourceId}-title`}
                value={source.title}
                onChange={(event) => onEdit(sourceId, { title: event.target.value })}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-authors`} className="text-xs">作者</Label>
              <Input
                id={`${sourceId}-authors`}
                value={source.authors.join("、")}
                placeholder="以頓號或逗號分隔多位作者"
                onChange={(event) => onEdit(sourceId, { authors: parseAuthorsInput(event.target.value) })}
                className="h-10 bg-background"
              />
              <p className="text-xs text-muted-foreground">顯示：{formatSourceAuthors(source.authors)}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-year`} className="text-xs">年份</Label>
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
              <Label htmlFor={`${sourceId}-provider`} className="text-xs">來源平台</Label>
              <Input
                id={`${sourceId}-provider`}
                value={source.sourceType}
                disabled
                className="h-10 bg-muted/40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-container`} className="text-xs">期刊／會議／出處</Label>
              <Input
                id={`${sourceId}-container`}
                value={source.containerTitle ?? ""}
                onChange={(event) => onEdit(sourceId, { containerTitle: event.target.value })}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-publisher`} className="text-xs">出版者</Label>
              <Input
                id={`${sourceId}-publisher`}
                value={source.publisher ?? ""}
                onChange={(event) => onEdit(sourceId, { publisher: event.target.value })}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-doi`} className="text-xs">DOI</Label>
              <Input
                id={`${sourceId}-doi`}
                value={source.doi ?? ""}
                onChange={(event) => onEdit(sourceId, { doi: event.target.value })}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor={`${sourceId}-url`} className="text-xs">URL</Label>
              <Input
                id={`${sourceId}-url`}
                value={source.url ?? ""}
                onChange={(event) => onEdit(sourceId, { url: event.target.value })}
                className="h-10 bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${sourceId}-sourceCategory`} className="text-xs">來源類型</Label>
              <Select
                value={source.sourceCategory ?? "unknown"}
                onValueChange={(value) => onEdit(sourceId, { sourceCategory: value })}
              >
                <SelectTrigger id={`${sourceId}-sourceCategory`} className="h-10 bg-background">
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
              <Label htmlFor={`${sourceId}-confidence`} className="text-xs">可信度</Label>
              <Select
                value={source.confidence ?? "中"}
                onValueChange={(value) => onEdit(sourceId, { confidence: value })}
              >
                <SelectTrigger id={`${sourceId}-confidence`} className="h-10 bg-background">
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
                  <label key={section} className="flex min-h-[28px] items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={usableSections.includes(section)}
                      onCheckedChange={(checked) =>
                        onEdit(sourceId, {
                          usableSections: toggleWorkflowSection(
                            usableSections.length ? usableSections : defaultUsableSections(),
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
              <Label htmlFor={`${sourceId}-reviewNotes`} className="text-xs">審查筆記</Label>
              <Textarea
                id={`${sourceId}-reviewNotes`}
                value={source.reviewNotes ?? ""}
                placeholder="例如：方法清楚，但樣本偏小"
                onChange={(event) => onEdit(sourceId, { reviewNotes: event.target.value })}
                className="min-h-[76px] resize-y bg-background"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="min-h-[36px]"
                disabled={reviewState === "accepted"}
                onClick={() => onReview(sourceId, "accepted")}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> 接受
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[36px]"
                disabled={reviewState === "rejected"}
                onClick={() => onReview(sourceId, "rejected")}
              >
                <XCircle className="mr-2 h-4 w-4" /> 拒絕
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-[36px]"
                disabled={reviewState === "pending"}
                onClick={() => onReview(sourceId, "pending")}
              >
                標為待審
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </article>
    </Collapsible>
  );
}

function SourceSearchPanel({
  sources,
  status,
  message,
  isSearching,
  hasTopic,
  onSearch,
  onReview,
  onEdit,
}: {
  sources: SourceRecord[];
  status: "idle" | "loading" | "done" | "empty" | "error";
  message: string;
  isSearching: boolean;
  hasTopic: boolean;
  onSearch: () => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
}) {
  const [activeTab, setActiveTab] = useState<SourceReviewTab>("all");
  const [expandedSourceIds, setExpandedSourceIds] = useState<string[]>([]);
  const previousReviewStates = useRef<Map<string, SourceReviewState>>(new Map());
  const counts = sourceReviewCounts(sources);
  const visibleSources = sourcesForReviewTab(sources, activeTab);
  const activeTabLabel = SOURCE_REVIEW_TABS.find((tab) => tab.value === activeTab)?.label ?? "來源";

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

        if (previousState === undefined) {
          if (nextState === "pending") nextExpanded.add(key);
        } else if (previousState !== nextState) {
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
      if (open) return current.includes(sourceId) ? current : [...current, sourceId];
      return current.filter((item) => item !== sourceId);
    });
  };

  const handleReview = (sourceId: string, reviewState: SourceReviewState) => {
    setSourceExpanded(sourceId, reviewState === "pending");
    onReview(sourceId, reviewState);
  };

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">研究來源</h2>
          <p className="text-sm text-muted-foreground">
            從 Crossref 與 Semantic Scholar 搜尋真實來源；接受的來源會進入參考文獻，拒絕的來源不會匯出。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={counts.accepted ? "default" : "outline"}>
            已接受來源：{counts.accepted} 筆
          </Badge>
          <Badge variant={counts.accepted >= RECOMMENDED_ACCEPTED_SOURCE_MIN ? "secondary" : "outline"}>
            建議至少 {RECOMMENDED_ACCEPTED_SOURCE_MIN} 筆
          </Badge>
          <Badge variant={counts.rejected ? "secondary" : "outline"}>已拒絕 {counts.rejected} 筆</Badge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[40px]"
            onClick={onSearch}
            disabled={isSearching || !hasTopic}
            data-testid="button-search-sources-panel"
          >
            {isSearching ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 搜尋中
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> 搜尋來源
              </>
            )}
          </Button>
        </div>
      </div>

      {status === "idle" && (
        <div className="rounded-lg border border-dashed border-border bg-card/60 px-4 py-5 text-sm text-muted-foreground">
          輸入研究主題後，可先搜尋學術與網路來源，再選取準備使用的資料。
        </div>
      )}

      {status === "loading" && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-8 text-center" data-testid="sources-loading">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">正在搜尋來源</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            ResearchForge 正在為你搜尋相關學術資料與可信網頁，並整理成可審查來源。
          </p>
          <div className="mt-5 flex justify-center gap-2" aria-hidden="true">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/40" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary/70 [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
          </div>
        </div>
      )}

      {status === "empty" && (
        <div className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground" data-testid="sources-empty">
          {message || "目前沒有找到符合此主題的來源。"}
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive" data-testid="sources-error">
          <p className="font-semibold">來源搜尋失敗</p>
          <p className="mt-1">{message || "來源搜尋失敗，請稍後再試。"}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 min-h-[36px]"
            onClick={onSearch}
            disabled={isSearching || !hasTopic}
          >
            <Search className="mr-2 h-4 w-4" /> 重新搜尋
          </Button>
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-3" data-testid="sources-list">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SourceReviewTab)}>
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
            <div className="space-y-3" data-testid={`sources-list-${activeTab}`}>
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
                  />
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
              {activeTabLabel}目前沒有來源。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function GenerationReadinessPanel({
  acceptedCount,
  readiness,
  isGenerating,
  generateButtonLabel,
  generateStatus,
  onGenerate,
}: {
  acceptedCount: number;
  readiness: ReturnType<typeof generationReadiness>;
  isGenerating: boolean;
  generateButtonLabel: string;
  generateStatus: "idle" | "loading" | "done" | "error";
  onGenerate: () => void;
}) {
  const progressValue = isGenerating
    ? 72
    : readiness.canGenerateFull
      ? 100
      : readiness.canGenerate
        ? 60
        : Math.min(45, acceptedCount * 9);

  return (
    <section className="rounded-lg border border-primary/25 bg-card p-4 shadow-sm" data-testid="generation-readiness-panel">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">生成準備度</h2>
          <p className="text-sm text-muted-foreground">
            建立報告工作區後會前往獨立結果頁，草稿、來源與匯出集中在那裡檢視。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={readiness.canGenerateFull ? "default" : readiness.canGenerate ? "secondary" : "outline"}>
            已接受 {acceptedCount} 筆來源
          </Badge>
          <Button
            type="button"
            size="lg"
            className="min-h-[44px]"
            onClick={onGenerate}
            disabled={isGenerating || !readiness.canGenerate}
            data-testid="button-generate"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {generateButtonLabel}
              </>
            ) : generateStatus === "error" ? (
              <>
                <XCircle className="mr-2 h-5 w-5" /> {generateButtonLabel}
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-5 w-5" /> {generateButtonLabel}
              </>
            )}
          </Button>
        </div>
      </div>
      <Progress value={progressValue} />
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Badge variant={readiness.canGenerate ? "secondary" : "outline"}>
          {readiness.canGenerateFull ? "可生成完整報告" : readiness.canGenerate ? "可生成簡版草稿" : "來源不足"}
        </Badge>
        {isGenerating && <Badge variant="outline">{readiness.progressLabel}</Badge>}
      </div>
      {readiness.warning && (
        <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{readiness.warning}</span>
        </div>
      )}
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

  const debugEvidenceCards = visible.showEvidenceCards ? buildEvidenceCards(acceptedSources, [], { resetText: true }) : [];

  return (
    <section className="mb-4 space-y-3 rounded-lg border border-border bg-card p-4" data-testid="developer-debug-panel">
      <div>
        <h2 className="text-base font-semibold text-foreground">開發者除錯</h2>
        <p className="text-xs text-muted-foreground">技術查詢、provider 狀態與中間證據卡只在此處顯示。</p>
      </div>

      {keywordDebug && visible.showTechnicalLogs && (
        <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground" data-testid="keyword-search-debug">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">關鍵詞搜尋除錯</span>
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/api/search-sources</code>
            <Badge variant="outline">LLM：{keywordDebug.llmStatusLabel}</Badge>
            <Badge variant={keywordDebug.fallbackUsed ? "secondary" : "outline"}>
              {keywordDebug.fallbackUsed ? "已使用備援關鍵詞" : "LLM 關鍵詞可用"}
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

      {preflight && visible.showTechnicalLogs && <PreflightDebugPanel preflight={preflight} />}

      {visible.showEvidenceCards && (
        <div className="rounded-md border border-border bg-muted/20 p-3" data-testid="debug-evidence-cards">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">中間證據卡</p>
            <Badge variant="outline">{debugEvidenceCards.length} 張</Badge>
          </div>
          {debugEvidenceCards.length ? (
            <div className="space-y-2">
              {debugEvidenceCards.slice(0, 6).map((card, index) => (
                <div key={card.id} className="rounded-md border border-border bg-background px-3 py-2 text-xs">
                  <p className="truncate font-medium text-foreground" title={evidenceCardLabel(card)}>
                    來源 {index + 1}：{evidenceCardLabel(card)}
                  </p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{card.evidence}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">尚無已接受來源可建立證據卡。</p>
          )}
        </div>
      )}
    </section>
  );
}

function PreflightPills({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item} variant="outline" className="max-w-full whitespace-normal break-words text-left">
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
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-muted-foreground">{field}</code>
    </p>
  );
}

function PreflightDebugPanel({ preflight }: { preflight: SearchPreflightResult }) {
  return (
    <div className="report-card mb-4 rounded-lg border border-border bg-card p-4" data-testid="preflight-debug-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">搜尋前檢查除錯面板</h2>
          <p className="text-xs text-muted-foreground">只傳入最相關的搜尋指引，不傳完整大型測試資料給生成流程。</p>
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
  const [generateStatus, setGenerateStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [expansions, setExpansions] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [sourceSearchStatus, setSourceSearchStatus] = useState<"idle" | "loading" | "done" | "empty" | "error">("idle");
  const [sourceSearchMessage, setSourceSearchMessage] = useState("");
  const [keywordSearchDebug, setKeywordSearchDebug] = useState<KeywordSearchDebugState | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [developerDebugOpen, setDeveloperDebugOpen] = useState(false);
  const [workspaceResume, setWorkspaceResume] = useState<WorkspaceResumeState | null>(null);

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

  // Live AI domain detection (recomputed as topic / type / level change).
  const derivedPurpose = academicToPurpose(input.academicLevel);
  const hasTopic = Boolean(input.topic.trim());
  const preflight = useMemo(
    () => (hasTopic ? runSearchPreflight({ topic: input.topic.trim(), reportType: input.reportType }) : null),
    [hasTopic, input.reportType, input.topic],
  );
  const detectedCategory: TopicCategory | null = input.topic.trim()
    ? detectTopicCategory(input.topic.trim(), input.reportType, derivedPurpose)
    : null;
  const AUTO = "自動偵測";
  const acceptedSources = acceptedSourceRecords(sources);
  const rejectedSources = rejectedSourceRecords(sources);
  const readiness = generationReadiness(acceptedSources.length);
  const workflowVisibility = generatorWorkflowVisibility(developerDebugOpen);
  const currentStep = generatorWorkflowStep({
    hasTopic,
    sources,
    isSearching: isSearchingSources,
    isGenerating,
    canGenerate: readiness.canGenerate,
  });
  const reviewCounts = safeSourceReviewCounts(sources);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("reportId");
    if (!reportId || workspaceResume?.loaded) return;

    const workspace = loadReportWorkspace(reportId);
    if (!workspace) return;

    setWorkspaceResume({ reportId, loaded: true });
    setInput(workspace.input);
    setSources(workspace.acceptedSources);
    setSourceSearchStatus("done");
    setSourceSearchMessage("已載入報告工作區來源，可調整後重新生成。");
  }, [workspaceResume?.loaded]);

  // ── Source search ──────────────────────────────────────────────────────────

  const handleSearchSources = async () => {
    const topic = input.topic.trim();
    if (!topic) {
      setSourceSearchStatus("error");
      setSourceSearchMessage("請先輸入研究主題。");
      toast({
        title: "請先輸入主題",
        description: "輸入研究主題後，才能搜尋 Crossref 與 Semantic Scholar 來源。",
        variant: "destructive",
      });
      return;
    }

    setIsSearchingSources(true);
    setSourceSearchStatus("loading");
    setSourceSearchMessage("");
    setKeywordSearchDebug(null);
    setSources([]);

    try {
      const result = await searchSources({
        topic,
        reportType: input.reportType,
        audience: input.targetAudience || input.academicLevel,
        sourceMode: input.sourceRequirement,
        language: input.outputLanguage,
      });
      const normalizedSources = dedupeSourceRecords(result.sources.map(normalizeSourceForReview));
      setSources(normalizedSources);
      setKeywordSearchDebug(keywordSearchDebugFromResult(result));
      if (normalizedSources.length) {
        setSourceSearchStatus("done");
        const partialProviderFailure = hasProviderFailures(result);
        toast({
          title: partialProviderFailure ? "部分來源搜尋失敗" : "已找到來源",
          description: partialProviderFailure
            ? "已顯示可用來源，部分資料來源暫時無法使用。"
            : `已套用關鍵詞搜尋策略，共找到 ${normalizedSources.length} 筆可選來源。`,
        });
      } else {
        setSourceSearchStatus("empty");
        setSourceSearchMessage("已產生搜尋關鍵詞，但目前沒有找到符合此主題的來源，請換更具體的關鍵詞再試一次。");
      }
    } catch (error) {
      const preflightResult = preflight ?? runSearchPreflight({ topic, reportType: input.reportType });
      const searchQuery = buildPreflightSearchQuery(topic, preflightResult);

      try {
        const result = await searchSources({ query: searchQuery });
        const normalizedSources = dedupeSourceRecords(result.sources.map(normalizeSourceForReview));
        setSources(normalizedSources);
        setKeywordSearchDebug({
          fallbackUsed: true,
          llmStatus: "skipped",
          llmStatusLabel: "略過",
          queries: [searchQuery],
          providerErrors: [`/api/search-sources topic - ${sourceTechnicalErrorMessage(error)}`],
          searchIntent: null,
          intentQueries: null,
          warnings: [],
        });
        if (normalizedSources.length) {
          setSourceSearchStatus("done");
          toast({
            title: "已找到來源",
            description: `關鍵詞搜尋端點暫不可用，已改用既有搜尋，共找到 ${normalizedSources.length} 筆可選來源。`,
          });
        } else {
          setSourceSearchStatus("empty");
          setSourceSearchMessage("目前沒有找到符合此主題的來源，請換更具體的關鍵詞再試一次。");
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

  const updateSourceRecord = (sourceId: string, patch: Partial<SourceRecord>) => {
    setSources((current) =>
      current.map((source) => {
        const key = source.id || sourceRecordKey(source);
        if (key !== sourceId) return source;
        return normalizeSourceForReview({ ...source, ...patch, id: key });
      }),
    );
  };

  const updateSourceReview = (sourceId: string, reviewState: SourceReviewState) => {
    setSources((current) => updateSourceReviewState(current, sourceId, reviewState));
  };

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    if (!input.topic.trim()) {
      setGenerateStatus("error");
      toast({
        title: "請填寫報告主題",
        description: "主題欄位不能為空，請輸入你的報告主題後再生成。",
        variant: "destructive",
      });
      return;
    }
    const currentReadiness = generationReadiness(acceptedSources.length);
    if (!currentReadiness.canGenerate) {
      setGenerateStatus("error");
      toast({
        title: "來源不足",
        description: currentReadiness.warning ?? "請先接受更多可信來源後再生成。",
        variant: "destructive",
      });
      return;
    }

    const effectiveInput: ReportInput = {
      ...input,
      targetAudience: input.targetAudience || academicToAudience(input.academicLevel),
      purpose: academicToPurpose(input.academicLevel),
      acceptedSources,
    };

    setIsGenerating(true);
    setGenerateStatus("loading");
    setInput(effectiveInput);

    try {
      const navigation = startReportWorkspaceNavigation({
        input: effectiveInput,
        acceptedSources,
        existingReportId: workspaceResume?.reportId,
        navigate,
      });

      if (!navigation) {
        setGenerateStatus("error");
        setIsGenerating(false);
        return;
      }

      setGenerateStatus("done");
    } catch {
      setGenerateStatus("error");
      setIsGenerating(false);
      toast({ title: "生成失敗", description: "請確認輸入內容後再試一次。", variant: "destructive" });
    }
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
    setExpansions(expandTopic(input.topic.trim()));
  };

  const applyExpansion = (title: string) => {
    updateInput("topic", title);
    setExpansions([]);
    toast({ title: "已套用主題", description: "已將擴寫後的題目填入主題欄位。" });
  };

  // ── Clear ────────────────────────────────────────────────────────────────────

  const handleClear = () => {
    setInput(DEFAULT_INPUT);
    setExpansions([]);
    setSources([]);
    setSourceSearchStatus("idle");
    setSourceSearchMessage("");
    setKeywordSearchDebug(null);
    setGenerateStatus("idle");
  };

  const shortTopicHint = input.topic.trim() && isShortTopic(input.topic);
  const autoSearchEnabled = input.sourceRequirement === "需要，並生成參考文獻格式";
  const generateButtonLabel = !hasTopic
    ? "尚未輸入主題"
    : isGenerating
      ? readiness.progressLabel
      : generateStatus === "error"
        ? readiness.buttonLabel
        : readiness.buttonLabel;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />

      <main className="generator-section flex-1 container mx-auto max-w-7xl px-4 pb-12 pt-24">
        <div className="mb-6 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Badge variant="secondary" className="mb-2">研究工作台</Badge>
              <h1 className="text-3xl font-bold tracking-normal text-foreground">ResearchForge</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                從主題設定、來源搜尋、來源審查到報告生成，依序完成可匯出的研究工作區。
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="min-h-[40px] self-start lg:self-auto" onClick={handleClear}>
              <Trash2 className="mr-2 h-4 w-4" /> 重新開始
            </Button>
          </div>
          <WorkflowStepper currentStep={currentStep} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
          <aside className="w-full">
            <div className="generator-card flex flex-col gap-5 rounded-lg border border-border bg-card p-5 shadow-sm lg:sticky lg:top-24">
              <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">研究設定</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">先定義主題與輸出條件，再進入來源流程。</p>
                </div>
                {workspaceResume && <Badge variant="outline">工作區續編</Badge>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="topic">
                  報告主題 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="topic"
                  placeholder="例如：豬在農業生產與生態系統中的角色與價值"
                  value={input.topic}
                  onChange={(e) => updateInput("topic", e.target.value)}
                  data-testid="input-topic"
                  className="h-11"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleExpand}
                  data-testid="button-expand-topic"
                >
                  <Sparkles className="mr-2 h-4 w-4" /> 擴寫主題
                </Button>

                {expansions.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">選擇建議主題：</p>
                    {expansions.map((title, i) => (
                      <button
                        key={i}
                        onClick={() => applyExpansion(title)}
                        className="block w-full text-left text-sm text-foreground hover:text-primary leading-relaxed"
                        data-testid={`expansion-${i}`}
                      >
                        {i + 1}. {title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground">核心設定</p>
                {MAIN_SELECT_FIELDS.map((f) => (
                  <div key={f.key} className="space-y-2">
                    <Label htmlFor={f.key}>{f.label}</Label>
                    <Select value={input[f.key]} onValueChange={(v) => updateInput(f.key, v)}>
                      <SelectTrigger id={f.key} data-testid={`select-${f.key}`} className="h-11">
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
                {autoSearchEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="min-h-[40px] w-full"
                    onClick={handleSearchSources}
                    disabled={isSearchingSources || !hasTopic}
                    data-testid="button-search-sources"
                  >
                    {isSearchingSources ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 搜尋來源中...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" /> 搜尋來源
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="border-t border-border pt-4 space-y-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setAdvancedOpen((open) => !open)}
                  aria-expanded={advancedOpen}
                  data-testid="button-advanced-settings"
                >
                  <span className="text-xs font-semibold text-muted-foreground">進階設定</span>
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>

                {advancedOpen && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="domainOverride">主題領域</Label>
                      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                        {detectedCategory ? (
                          <span className="text-foreground">
                            系統判定：
                            <span className="ml-1 font-semibold text-primary">{detectedCategory}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">輸入主題後會自動判定領域。</span>
                        )}
                      </div>
                      <Select
                        value={input.domainOverride || AUTO}
                        onValueChange={(v) => updateInput("domainOverride", v === AUTO ? "" : v)}
                      >
                        <SelectTrigger id="domainOverride" data-testid="select-domainOverride" className="h-11">
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
                        <Select value={input[f.key]} onValueChange={(v) => updateInput(f.key, v)}>
                          <SelectTrigger id={f.key} data-testid={`select-${f.key}`} className="h-11">
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
                          onChange={(e) => updateInput(f.key, e.target.value)}
                          data-testid={`input-${f.key}`}
                          className="h-11"
                        />
                      </div>
                    ))}

                    {ADVANCED_TEXTAREA_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-2">
                        <Label htmlFor={f.key}>{f.label}</Label>
                        <Textarea
                          id={f.key}
                          placeholder={f.placeholder}
                          value={input[f.key]}
                          onChange={(e) => updateInput(f.key, e.target.value)}
                          data-testid={`input-${f.key}`}
                          className={`${f.minHeight} resize-y`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {readiness.warning && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  {readiness.warning}
                </div>
              )}

              {workspaceResume && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={handleClear}
                  data-testid="button-clear-form"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> 清除工作區來源
                </Button>
              )}
            </div>
          </aside>

          <section className="min-h-[620px] space-y-4" data-testid="generator-workspace">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">研究流程</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    目前步驟：{WORKFLOW_STEPS.find((step) => step.value === currentStep)?.label ?? "設定主題"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={hasTopic ? "secondary" : "outline"}>{hasTopic ? "主題已設定" : "等待主題"}</Badge>
                  <Badge variant={sources.length ? "secondary" : "outline"}>來源 {reviewCounts.all} 筆</Badge>
                  <Badge variant={acceptedSources.length ? "default" : "outline"}>已接受 {reviewCounts.accepted} 筆</Badge>
                  {rejectedSources.length > 0 && <Badge variant="outline">已拒絕 {reviewCounts.rejected} 筆</Badge>}
                </div>
              </div>
            </div>

            <Collapsible open={developerDebugOpen} onOpenChange={setDeveloperDebugOpen}>
              <section className="rounded-lg border border-border bg-card p-3" data-testid="developer-debug-toggle">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="min-h-[36px]">
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

            {shortTopicHint && (
              <div className="report-card flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  你的主題較簡短，生成後會是基礎版本。若要提高報告品質，建議補充研究方向、老師要求、資料來源或個人觀點，或先使用「幫我擴寫主題」。
                </span>
              </div>
            )}

            {!hasTopic && (
              <div className="report-card flex min-h-[460px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border bg-card p-10 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                  <ClipboardList className="h-9 w-9 text-primary" />
                </div>
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">先設定研究主題</h3>
                  <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                    在左側輸入主題後，下一步會進入來源搜尋。ResearchForge 會把報告草稿放到獨立結果頁，不在這裡堆疊段落。
                  </p>
                </div>
              </div>
            )}

            {hasTopic && sources.length === 0 && sourceSearchStatus === "idle" && !isGenerating && (
              <div className="rounded-lg border border-border bg-card p-6 shadow-sm" data-testid="sources-ready">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Search className="h-6 w-6" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">準備搜尋來源</h3>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                      目前主題為「{input.topic.trim()}」。請先搜尋來源，再接受可用資料，最後建立報告工作區。
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">1. 搜尋真實來源</div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">2. 審查 metadata</div>
                      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">3. 生成結果頁</div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-[44px] shrink-0"
                    onClick={handleSearchSources}
                    disabled={isSearchingSources || !autoSearchEnabled}
                    data-testid="button-search-sources-ready"
                  >
                    <Search className="mr-2 h-5 w-5" /> 搜尋來源
                  </Button>
                </div>
              </div>
            )}

            {hasTopic && (sourceSearchStatus !== "idle" || sources.length > 0) && (
              <SourceSearchPanel
                sources={sources}
                status={sourceSearchStatus}
                message={sourceSearchMessage}
                isSearching={isSearchingSources}
                hasTopic={hasTopic}
                onSearch={handleSearchSources}
                onReview={updateSourceReview}
                onEdit={updateSourceRecord}
              />
            )}

            {hasTopic && sources.length > 0 && (
              <GenerationReadinessPanel
                acceptedCount={acceptedSources.length}
                readiness={readiness}
                isGenerating={isGenerating}
                generateButtonLabel={generateButtonLabel}
                generateStatus={generateStatus}
                onGenerate={handleGenerate}
              />
            )}

            {isGenerating && (
              <div className="report-card flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {readiness.progressLabel}
                </div>
                <Progress value={74} />
                <p className="text-sm text-muted-foreground">
                  正在整理已接受來源、產生大綱與草稿，完成後會自動前往報告預覽頁。
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
