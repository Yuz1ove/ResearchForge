import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { searchSources, type SourceRecord } from "@workspace/api-client-react";
import {
  generateReport,
  expandTopic,
  isShortTopic,
  detectTopicCategory,
  academicToAudience,
  academicToPurpose,
  ReportInput,
  GeneratedReport,
  ReportSection,
  ContentBlock,
  TopicCategory,
  TOPIC_CATEGORIES,
} from "@/lib/generateReport";
import {
  acceptedSourceRecords,
  buildExportReadinessWarnings,
  dedupeSourceRecords,
  formatSourceAuthors,
  normalizeSourceForReview,
  rejectedSourceRecords,
  sourceHasIncompleteMetadata,
  sourceRecordKey,
  type SourceReviewState,
} from "@/lib/sourceRecords";
import {
  buildPlainText,
  downloadTxt,
  downloadMarkdown,
  downloadDocx,
  printPdf,
  downloadJson,
  downloadBlueprint,
  downloadPromptPackage,
} from "@/lib/exportReport";
import { downloadProjectHandoff } from "@/lib/projectState";
import {
  Wand2,
  Loader2,
  Copy,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileText,
  FileType,
  FileDown,
  Printer,
  Sparkles,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  FileJson,
  ClipboardList,
  MessageSquareText,
  Archive,
  Search,
  ExternalLink,
} from "lucide-react";

// ─── Default form state ───────────────────────────────────────────────────────

type ReportInputStringKey = {
  [K in keyof ReportInput]: ReportInput[K] extends string ? K : never;
}[keyof ReportInput];

const DEFAULT_INPUT: ReportInput = {
  topic: "",
  reportType: "研究報告",
  academicLevel: "高中",
  targetAudience: "高中",
  purpose: "學校作業",
  domainOverride: "",
  mode: "先建立報告架構",
  sourceRequirement: "需要，但先標示「資料來源待補」",
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
      if (typeof message === "string" && message.trim()) return message;
    }
  }

  return "來源搜尋暫時無法使用，請稍後再試。";
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="leading-loose text-foreground/90 whitespace-pre-line">{block.text}</p>;

    case "list":
      return (
        <ul className="space-y-2">
          {block.items?.map((item, i) => (
            <li key={i} className="flex gap-2 leading-loose">
              <span className="text-primary shrink-0 mt-0.5">•</span>
              <span className="text-foreground/90">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "note":
      return (
        <div className="flex gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-sm leading-relaxed">
          <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{block.text}</span>
        </div>
      );

    case "suggestions":
      return (
        <div className="space-y-3">
          {block.suggestions?.length ? (
            block.suggestions.map((s, i) => (
              <div key={i} className="rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed">
                <p className="font-semibold text-foreground">
                  【建議{block.suggestionKind} {i + 1}：{s.title}】
                </p>
                <p className="text-muted-foreground">位置：{s.position}</p>
                <p className="text-muted-foreground">用途：{s.purpose}</p>
                <p className="text-muted-foreground">{block.suggestionKind === "流程圖" ? "流程" : "內容"}：{s.content}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">（無建議{block.suggestionKind}）</p>
          )}
        </div>
      );

    case "dataTable":
      return (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 px-2 font-semibold">資料類型</th>
                <th className="py-2 px-2 font-semibold">需要內容</th>
                <th className="py-2 px-2 font-semibold">用途</th>
                <th className="py-2 px-2 font-semibold whitespace-nowrap">優先程度</th>
              </tr>
            </thead>
            <tbody>
              {block.rows?.map((r, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="py-2 px-2 font-medium text-foreground whitespace-nowrap">{r.type}</td>
                  <td className="py-2 px-2 text-muted-foreground">{r.need}</td>
                  <td className="py-2 px-2 text-muted-foreground">{r.use}</td>
                  <td className="py-2 px-2">
                    <Badge
                      variant={r.priority === "高" ? "default" : r.priority === "中" ? "secondary" : "outline"}
                    >
                      {r.priority}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "quality":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {block.checks?.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {c.passed ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className={c.passed ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              {!c.passed && c.reason ? <span className="text-muted-foreground">：{c.reason}</span> : null}
            </div>
          ))}
        </div>
      );

    case "slides":
      return (
        <div className="space-y-3">
          {block.slides?.map((s) => (
            <div key={s.page} className="rounded-md border border-border bg-muted/30 p-3">
              <p className="font-semibold text-foreground mb-1">
                第 {s.page} 頁：{s.title}
              </p>
              <ul className="space-y-1 mb-2">
                {s.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed">
                    <span className="text-primary shrink-0 mt-0.5">•</span>
                    <span className="text-foreground/90">{p}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">視覺建議：{s.visual}</p>
            </div>
          ))}
        </div>
      );

    default:
      return null;
  }
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function SectionView({ section }: { section: ReportSection }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="report-section border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 min-h-[48px] bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        data-testid={`section-toggle-${section.heading}`}
      >
        <span className="font-semibold text-sm text-foreground">{section.heading}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 py-4 space-y-3">
          {section.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceSearchPanel({
  sources,
  acceptedCount,
  rejectedCount,
  status,
  message,
  isSearching,
  hasTopic,
  onSearch,
  onReview,
  onEdit,
}: {
  sources: SourceRecord[];
  acceptedCount: number;
  rejectedCount: number;
  status: "idle" | "loading" | "done" | "empty" | "error";
  message: string;
  isSearching: boolean;
  hasTopic: boolean;
  onSearch: () => void;
  onReview: (sourceId: string, reviewState: SourceReviewState) => void;
  onEdit: (sourceId: string, patch: Partial<SourceRecord>) => void;
}) {
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">研究來源</h2>
          <p className="text-sm text-muted-foreground">
            從 Crossref 與 Semantic Scholar 搜尋真實來源；接受的來源會進入參考文獻，拒絕的來源不會匯出。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={acceptedCount ? "default" : "outline"}>已接受 {acceptedCount} 筆</Badge>
          <Badge variant={rejectedCount ? "secondary" : "outline"}>已拒絕 {rejectedCount} 筆</Badge>
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
        <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="sources-loading">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在搜尋 Crossref 與 Semantic Scholar...
          </div>
          {[1, 2, 3].map((item) => (
            <div key={item} className="animate-pulse rounded-md border border-border p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {status === "empty" && (
        <div className="rounded-lg border border-border bg-card px-4 py-5 text-sm text-muted-foreground" data-testid="sources-empty">
          {message || "目前沒有找到符合此主題的來源。"}
        </div>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-destructive" data-testid="sources-error">
          {message || "來源搜尋失敗，請稍後再試。"}
        </div>
      )}

      {sources.length > 0 && (
        <div className="grid grid-cols-1 gap-3" data-testid="sources-list">
          {sources.map((source) => {
            const key = source.id || sourceRecordKey(source);
            const accepted = source.reviewState === "accepted";
            const rejected = source.reviewState === "rejected";
            const incomplete = sourceHasIncompleteMetadata(source);

            return (
              <article
                key={key}
                className={`rounded-lg border bg-card p-4 transition-colors ${
                  accepted
                    ? "border-green-500 shadow-sm"
                    : rejected
                      ? "border-border bg-muted/30 opacity-75"
                      : "border-border"
                }`}
                data-testid={`source-card-${source.sourceType}`}
              >
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={source.sourceType === "Crossref" ? "secondary" : "outline"}>{source.sourceType}</Badge>
                      <Badge variant={accepted ? "default" : rejected ? "secondary" : "outline"}>
                        {accepted ? "已接受" : rejected ? "已拒絕" : "待審核"}
                      </Badge>
                      {incomplete && <Badge variant="outline">metadata 不完整</Badge>}
                    </div>
                    {source.url && (
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-[32px] items-center rounded-md px-2 text-xs font-medium text-primary hover:underline"
                      >
                        開啟連結 <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`${key}-title`} className="text-xs">標題</Label>
                      <Input
                        id={`${key}-title`}
                        value={source.title}
                        onChange={(event) => onEdit(key, { title: event.target.value })}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`${key}-authors`} className="text-xs">作者</Label>
                      <Input
                        id={`${key}-authors`}
                        value={source.authors.join("、")}
                        placeholder="以頓號或逗號分隔多位作者"
                        onChange={(event) => onEdit(key, { authors: event.target.value.split(/[、,]/).map((author) => author.trim()).filter(Boolean) })}
                        className="h-10"
                      />
                      <p className="text-xs text-muted-foreground">顯示：{formatSourceAuthors(source.authors)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${key}-year`} className="text-xs">年份</Label>
                      <Input
                        id={`${key}-year`}
                        value={source.year ?? ""}
                        inputMode="numeric"
                        placeholder="年份待確認"
                        onChange={(event) => {
                          const value = event.target.value.trim();
                          onEdit(key, { year: value ? Number(value) : null });
                        }}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${key}-container`} className="text-xs">期刊／會議／出處</Label>
                      <Input
                        id={`${key}-container`}
                        value={source.containerTitle ?? ""}
                        onChange={(event) => onEdit(key, { containerTitle: event.target.value })}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${key}-publisher`} className="text-xs">出版者</Label>
                      <Input
                        id={`${key}-publisher`}
                        value={source.publisher ?? ""}
                        onChange={(event) => onEdit(key, { publisher: event.target.value })}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`${key}-doi`} className="text-xs">DOI</Label>
                      <Input
                        id={`${key}-doi`}
                        value={source.doi ?? ""}
                        onChange={(event) => onEdit(key, { doi: event.target.value })}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label htmlFor={`${key}-url`} className="text-xs">URL</Label>
                      <Input
                        id={`${key}-url`}
                        value={source.url ?? ""}
                        onChange={(event) => onEdit(key, { url: event.target.value })}
                        className="h-10"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={accepted ? "secondary" : "default"}
                      className="min-h-[36px]"
                      onClick={() => onReview(key, "accepted")}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> 接受
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={rejected ? "secondary" : "outline"}
                      className="min-h-[36px]"
                      onClick={() => onReview(key, "rejected")}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> 拒絕
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-[36px]"
                      onClick={() => onReview(key, "pending")}
                    >
                      標為待審
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Generator() {
  const { toast } = useToast();

  const [input, setInput] = useState<ReportInput>(DEFAULT_INPUT);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [expansions, setExpansions] = useState<string[]>([]);
  const [sources, setSources] = useState<SourceRecord[]>([]);
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [sourceSearchStatus, setSourceSearchStatus] = useState<"idle" | "loading" | "done" | "empty" | "error">("idle");
  const [sourceSearchMessage, setSourceSearchMessage] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const detectedCategory: TopicCategory | null = input.topic.trim()
    ? detectTopicCategory(input.topic.trim(), input.reportType, derivedPurpose)
    : null;
  const AUTO = "自動偵測";
  const acceptedSources = acceptedSourceRecords(sources);
  const rejectedSources = rejectedSourceRecords(sources);
  const reportInput = report ? { ...input, acceptedSources: report.meta.acceptedSources } : input;

  // ── Source search ──────────────────────────────────────────────────────────

  const handleSearchSources = async () => {
    const query = input.topic.trim();
    if (!query) {
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
    setSources([]);

    try {
      const result = await searchSources({ query });
      setSources(dedupeSourceRecords(result.sources.map(normalizeSourceForReview)));
      if (result.sources.length) {
        setSourceSearchStatus("done");
        toast({ title: "已找到來源", description: `共找到 ${result.sources.length} 筆可選來源。` });
      } else {
        setSourceSearchStatus("empty");
        setSourceSearchMessage("目前沒有找到符合此主題的來源，請換更具體的關鍵字再試一次。");
      }
    } catch (error) {
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
    updateSourceRecord(sourceId, { reviewState });
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
    setIsGenerating(true);
    setGenerateStatus("loading");
    setReport(null);
    // Academic level is the single source of truth: derive reader + purpose
    // defensively here so generation stays consistent even if state drifts.
    const effectiveInput: ReportInput = {
      ...input,
      targetAudience: input.targetAudience || academicToAudience(input.academicLevel),
      purpose: academicToPurpose(input.academicLevel),
      acceptedSources,
    };
    setInput(effectiveInput);
    // Simulate async — swap setTimeout for a real API call in the future.
    setTimeout(() => {
      try {
        setReport(generateReport(effectiveInput));
        setGenerateStatus("done");
      } catch {
        setGenerateStatus("error");
        toast({ title: "生成失敗", description: "請確認輸入內容後再試一次。", variant: "destructive" });
      } finally {
        setIsGenerating(false);
      }
    }, 1400);
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

  // ── Copy / download / clear ───────────────────────────────────────────────────

  const warnExportReadiness = (currentReport: GeneratedReport) => {
    const warnings = buildExportReadinessWarnings(currentReport);
    if (warnings.length === 0) return;

    toast({
      title: "引用準備度提醒",
      description: warnings.map((warning) => warning.message).join(" "),
    });
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(buildPlainText(report, reportInput));
    toast({ title: "已複製到剪貼簿", description: "報告純文字已複製，可直接貼入文件。" });
  };

  const handleDownloadTxt = () => {
    if (!report) return;
    warnExportReadiness(report);
    downloadTxt(report, reportInput);
    toast({ title: "已下載 TXT", description: "純文字檔已儲存到你的裝置。" });
  };

  const handleDownloadMarkdown = () => {
    if (!report) return;
    warnExportReadiness(report);
    downloadMarkdown(report, reportInput);
    toast({ title: "已下載 Markdown", description: "Markdown 檔已儲存到你的裝置。" });
  };

  const handleDownloadDocx = async () => {
    if (!report) return;
    warnExportReadiness(report);
    try {
      await downloadDocx(report, reportInput);
      toast({ title: "已下載 Word（DOCX）", description: "含封面、目錄、頁首頁尾的 Word 檔已儲存。" });
    } catch {
      toast({ title: "DOCX 產生失敗", description: "請稍後再試一次。", variant: "destructive" });
    }
  };

  const handleDownloadJson = () => {
    if (!report) return;
    warnExportReadiness(report);
    downloadJson(report, reportInput);
    toast({ title: "已下載 JSON", description: "完整資料（JSON）已儲存，可供程式或其他工具使用。" });
  };

  const handleDownloadBlueprint = () => {
    if (!report) return;
    downloadBlueprint(report, reportInput);
    toast({ title: "已下載研究藍圖", description: "規劃藍圖（Markdown）已儲存。" });
  };

  const handleDownloadPrompt = () => {
    if (!report) return;
    downloadPromptPackage(report, reportInput);
    toast({ title: "已下載 AI 提示包", description: "可貼入其他 AI 以完成報告內容的提示已儲存。" });
  };

  const handleDownloadProjectHandoff = () => {
    downloadProjectHandoff();
    toast({ title: "已下載專案狀態", description: "專案能力與架構說明（Markdown）已儲存。" });
  };

  const handlePrintPdf = () => {
    if (!report) return;
    warnExportReadiness(report);
    const ok = printPdf(report, reportInput);
    if (ok) {
      toast({ title: "正在開啟列印視窗", description: "請在列印對話框選擇「另存為 PDF」。" });
    } else {
      toast({ title: "無法開啟列印視窗", description: "請允許本網站開啟彈出視窗後再試一次。", variant: "destructive" });
    }
  };

  const handleClear = () => {
    setInput(DEFAULT_INPUT);
    setReport(null);
    setExpansions([]);
    setSources([]);
    setSourceSearchStatus("idle");
    setSourceSearchMessage("");
    setGenerateStatus("idle");
  };

  const shortTopicHint = input.topic.trim() && isShortTopic(input.topic) && !report;
  const hasTopic = Boolean(input.topic.trim());
  const autoSearchEnabled = input.sourceRequirement === "需要，並生成參考文獻格式";
  const generateButtonLabel = !hasTopic
    ? "尚未輸入主題"
    : isGenerating
      ? "生成中..."
      : generateStatus === "error"
        ? "生成錯誤"
        : report
          ? "完成，可重新生成"
          : "生成報告草稿";

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />

      <main className="generator-section flex-1 container mx-auto px-4 pt-24 pb-12 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">報告生成器</h1>
          <p className="text-muted-foreground text-sm mt-1">
            填寫以下資訊，即可快速生成結構完整、可後續修改的報告草稿。
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">

          {/* ── Form panel ─────────────────────────────────────────────────── */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0">
            <div className="generator-card bg-card border border-border rounded-xl shadow-sm p-6 flex flex-col gap-5 lg:sticky lg:top-24">

              {/* Main fields */}
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
                    className="w-full"
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

              <Button
                size="lg"
                className="w-full h-12 text-base"
                onClick={handleGenerate}
                disabled={isGenerating || !hasTopic}
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
                ) : report ? (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" /> {generateButtonLabel}
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-5 w-5" /> {generateButtonLabel}
                  </>
                )}
              </Button>

              {report && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={handleClear}
                  data-testid="button-clear-form"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> 清除並重新開始
                </Button>
              )}
            </div>
          </div>

          {/* ── Result panel ───────────────────────────────────────────────── */}
          <div className="flex-1 min-h-[600px]">
            {(autoSearchEnabled || sources.length > 0 || sourceSearchStatus !== "idle") && (
              <SourceSearchPanel
                sources={sources}
                acceptedCount={acceptedSources.length}
                rejectedCount={rejectedSources.length}
                status={sourceSearchStatus}
                message={sourceSearchMessage}
                isSearching={isSearchingSources}
                hasTopic={hasTopic}
                onSearch={handleSearchSources}
                onReview={updateSourceReview}
                onEdit={updateSourceRecord}
              />
            )}

            {/* Short-topic hint (before generating) */}
            {shortTopicHint && (
              <div className="report-card mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex gap-2">
                <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  你的主題較簡短，生成後會是基礎版本。若要提高報告品質，建議補充研究方向、老師要求、資料來源或個人觀點，或先使用「幫我擴寫主題」。
                </span>
              </div>
            )}

            {/* Empty state */}
            {!report && !isGenerating && (
              <div className="report-card h-full min-h-[480px] flex flex-col items-center justify-center text-center bg-card border border-border rounded-xl p-10 gap-4">
                <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                  <FileText className="h-9 w-9 text-muted-foreground/50" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">報告草稿將顯示在這裡</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    填寫左側表單並點擊「生成報告草稿」，即可在此看到完整的結構化報告。
                  </p>
                </div>
              </div>
            )}

            {/* Loading skeleton */}
            {isGenerating && (
              <div className="report-card bg-card border border-border rounded-xl p-6 flex flex-col gap-4 animate-pulse">
                <div className="h-7 bg-muted rounded w-2/3" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-20" />
                  <div className="h-6 bg-muted rounded w-16" />
                  <div className="h-6 bg-muted rounded w-24" />
                </div>
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="border border-border rounded-lg overflow-hidden">
                    <div className="h-10 bg-muted/60" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-muted rounded w-full" />
                      <div className="h-4 bg-muted rounded w-5/6" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report output */}
            {report && !isGenerating && (
              <div className="flex flex-col gap-4">

                {/* Header + completeness card */}
                <div className="report-card bg-card border border-border rounded-xl shadow-sm p-5">
                  <h2 className="text-xl font-bold text-foreground mb-3">{report.meta.title}</h2>
                  <div className="flex flex-wrap gap-2 mb-4">
                    <Badge variant="default">{report.meta.category}</Badge>
                    <Badge variant="secondary">{displayOptionLabel("mode", input.mode)}</Badge>
                    <Badge variant="secondary">{displayOptionLabel("style", input.style)}</Badge>
                    <Badge variant="secondary">{displayOptionLabel("length", input.length)}</Badge>
                    <Badge variant="outline" className="text-muted-foreground">
                      {displayOptionLabel("targetAudience", input.targetAudience)}
                    </Badge>
                  </div>

                  {/* Completeness */}
                  <div className="rounded-lg bg-muted/40 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        目前版本：{report.meta.versionLabel}
                      </span>
                      <span className="text-sm font-semibold text-primary">
                        完整度約 {report.meta.completeness}%
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${report.meta.completeness}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      建議補充：{report.meta.suggestedAdditions.join("、")}
                    </p>
                  </div>
                  <div className="mt-4 rounded-lg border border-border bg-background p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <p className="text-sm font-medium text-foreground">已接受來源</p>
                      <Badge variant={report.meta.acceptedSources.length ? "default" : "outline"}>
                        {report.meta.acceptedSources.length} 筆
                      </Badge>
                    </div>
                    {report.meta.bibliography.length ? (
                      <ol className="space-y-1 text-xs leading-relaxed text-muted-foreground list-decimal pl-5">
                        {report.meta.bibliography.map((entry) => (
                          <li key={entry.sourceId}>{entry.text}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-muted-foreground">尚未有接受來源；參考文獻會保留待補提醒。</p>
                    )}
                  </div>
                </div>

                {/* Short-topic warning + expansions */}
                {report.shortTopic && (
                  <div className="report-card rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex gap-2 text-sm text-amber-800 mb-3">
                      <Lightbulb className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{report.shortTopic.message}</span>
                    </div>
                    <p className="text-xs font-medium text-amber-900 mb-2">建議的延伸主題（點選即可套用）：</p>
                    <div className="space-y-1.5">
                      {report.shortTopic.expansions.map((title, i) => (
                        <button
                          key={i}
                          onClick={() => applyExpansion(title)}
                          className="block w-full text-left text-sm text-amber-900 hover:text-amber-950 hover:underline leading-relaxed"
                          data-testid={`short-expansion-${i}`}
                        >
                          {i + 1}. {title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="action-buttons report-card bg-card border border-border rounded-xl shadow-sm p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">匯出文件</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="min-h-[44px]" onClick={handleDownloadDocx} data-testid="button-export-docx">
                        <FileType className="mr-2 h-4 w-4" /> Word（DOCX）
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handlePrintPdf} data-testid="button-export-pdf">
                        <Printer className="mr-2 h-4 w-4" /> PDF（列印）
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownloadMarkdown} data-testid="button-export-md">
                        <FileDown className="mr-2 h-4 w-4" /> Markdown
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownloadTxt} data-testid="button-export-txt">
                        <FileText className="mr-2 h-4 w-4" /> TXT
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleCopy} data-testid="button-copy">
                        <Copy className="mr-2 h-4 w-4" /> 複製文字
                      </Button>
                    </div>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">規劃與交接</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownloadBlueprint} data-testid="button-export-blueprint">
                        <ClipboardList className="mr-2 h-4 w-4" /> 研究藍圖
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownloadPrompt} data-testid="button-export-prompt">
                        <MessageSquareText className="mr-2 h-4 w-4" /> AI 提示包
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownloadJson} data-testid="button-export-json">
                        <FileJson className="mr-2 h-4 w-4" /> JSON
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownloadProjectHandoff} data-testid="button-export-handoff">
                        <Archive className="mr-2 h-4 w-4" /> 匯出專案狀態
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={handleGenerate} data-testid="button-regenerate">
                      <RefreshCw className="mr-2 h-4 w-4" /> 重新生成
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px] text-destructive hover:text-destructive"
                      onClick={handleClear}
                      data-testid="button-clear"
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> 清除內容
                    </Button>
                  </div>
                </div>

                {/* Sections */}
                <div className="report-card bg-card border border-border rounded-xl shadow-sm p-5 flex flex-col gap-3">
                  {report.sections.map((s, i) => (
                    <SectionView key={`${s.heading}-${i}`} section={s} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
