import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  generateReport,
  expandTopic,
  isShortTopic,
  ReportInput,
  GeneratedReport,
  ReportSection,
  ContentBlock,
  REPORT_TYPES,
  TARGET_AUDIENCES,
  REPORT_PURPOSES,
  GENERATION_MODES,
  SOURCE_REQUIREMENTS,
  CITATION_FORMATS,
  CHART_REQUIREMENTS,
  REPORT_STYLES,
  REPORT_LENGTHS,
} from "@/lib/generateReport";
import {
  Wand2,
  Loader2,
  Copy,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Default form state ───────────────────────────────────────────────────────

const DEFAULT_INPUT: ReportInput = {
  topic: "",
  reportType: "學校研究報告",
  targetAudience: "高中生",
  purpose: "學校作業",
  mode: "報告架構",
  sourceRequirement: "需要，但先標示「資料來源待補」",
  citationFormat: "APA",
  chartRequirement: "需要",
  style: "高中生可提交",
  length: "一般報告",
  additionalInfo: "",
};

// ─── Field config (label + options + key) ─────────────────────────────────────

const SELECT_FIELDS: { key: keyof ReportInput; label: string; options: readonly string[] }[] = [
  { key: "reportType", label: "報告類型", options: REPORT_TYPES },
  { key: "targetAudience", label: "目標讀者", options: TARGET_AUDIENCES },
  { key: "purpose", label: "報告目的", options: REPORT_PURPOSES },
  { key: "mode", label: "生成模式", options: GENERATION_MODES },
  { key: "style", label: "報告風格", options: REPORT_STYLES },
  { key: "length", label: "報告長度", options: REPORT_LENGTHS },
  { key: "chartRequirement", label: "圖表建議需求", options: CHART_REQUIREMENTS },
  { key: "sourceRequirement", label: "資料來源需求", options: SOURCE_REQUIREMENTS },
  { key: "citationFormat", label: "引用格式", options: CITATION_FORMATS },
];

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

// ─── Main page ────────────────────────────────────────────────────────────────

export function Generator() {
  const { toast } = useToast();

  const [input, setInput] = useState<ReportInput>(DEFAULT_INPUT);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expansions, setExpansions] = useState<string[]>([]);

  const updateInput = (key: keyof ReportInput, value: string) => {
    setInput((prev) => ({ ...prev, [key]: value }));
  };

  // ── Generate ────────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    if (!input.topic.trim()) {
      toast({
        title: "請填寫報告主題",
        description: "主題欄位不能為空，請輸入你的報告主題後再生成。",
        variant: "destructive",
      });
      return;
    }
    setIsGenerating(true);
    setReport(null);
    // Simulate async — swap setTimeout for a real API call in the future.
    setTimeout(() => {
      setReport(generateReport(input));
      setIsGenerating(false);
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

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(buildPlainText(report, input));
    toast({ title: "已複製到剪貼簿", description: "報告純文字已複製，可直接貼入文件。" });
  };

  const handleDownload = () => {
    if (!report) return;
    const blob = new Blob([buildMarkdown(report, input)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report-draft.md";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "已下載 Markdown", description: "report-draft.md 已儲存到你的裝置。" });
  };

  const handleClear = () => {
    setInput(DEFAULT_INPUT);
    setReport(null);
    setExpansions([]);
  };

  const shortTopicHint = input.topic.trim() && isShortTopic(input.topic) && !report;

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

              {/* Topic */}
              <div className="space-y-2">
                <Label htmlFor="topic">
                  報告主題 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="topic"
                  placeholder="例如：不同溫度對維生素C氧化速率之影響"
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
                  <Sparkles className="mr-2 h-4 w-4" /> 幫我擴寫主題
                </Button>

                {expansions.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">點選一個建議題目即可套用：</p>
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

              {/* Selects */}
              {SELECT_FIELDS.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Select value={input[f.key]} onValueChange={(v) => updateInput(f.key, v)}>
                    <SelectTrigger id={f.key} data-testid={`select-${f.key}`} className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

              {/* Additional info */}
              <div className="space-y-2">
                <Label htmlFor="additionalInfo">補充資料／老師要求／評分標準</Label>
                <Textarea
                  id="additionalInfo"
                  placeholder="可貼上老師要求、評分標準、課堂資料、個人觀點、指定段落、參考資料或想加入的內容。"
                  value={input.additionalInfo}
                  onChange={(e) => updateInput("additionalInfo", e.target.value)}
                  data-testid="input-additional"
                  className="min-h-[96px] resize-y"
                />
              </div>

              <Button
                size="lg"
                className="w-full h-12 text-base"
                onClick={handleGenerate}
                disabled={isGenerating}
                data-testid="button-generate"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 生成中...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-5 w-5" /> 生成報告草稿
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
                    <Badge variant="secondary">{input.mode}</Badge>
                    <Badge variant="secondary">{input.style}</Badge>
                    <Badge variant="secondary">{input.length}</Badge>
                    <Badge variant="outline" className="text-muted-foreground">
                      {input.targetAudience}
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
                <div className="action-buttons report-card flex flex-wrap gap-3">
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleCopy} data-testid="button-copy">
                    <Copy className="mr-2 h-4 w-4" /> 複製報告
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleDownload} data-testid="button-download">
                    <Download className="mr-2 h-4 w-4" /> 下載 Markdown
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-[44px]" onClick={handleGenerate} data-testid="button-regenerate">
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

// ─── Plain-text & Markdown builders ───────────────────────────────────────────

function blockToLines(b: ContentBlock, md: boolean): string[] {
  switch (b.type) {
    case "paragraph":
      return b.text ? [b.text] : [];
    case "list":
      return (b.items ?? []).map((i) => (md ? `- ${i}` : `• ${i}`));
    case "note":
      return b.text ? [md ? `> ${b.text}` : `※ ${b.text}`] : [];
    case "suggestions":
      return (b.suggestions ?? []).flatMap((s, i) => [
        `【建議${b.suggestionKind} ${i + 1}：${s.title}】`,
        `位置：${s.position}`,
        `用途：${s.purpose}`,
        `${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${s.content}`,
        "",
      ]);
    case "dataTable":
      if (md) {
        return [
          "| 資料類型 | 需要內容 | 用途 | 優先程度 |",
          "| --- | --- | --- | --- |",
          ...(b.rows ?? []).map((r) => `| ${r.type} | ${r.need} | ${r.use} | ${r.priority} |`),
        ];
      }
      return (b.rows ?? []).map((r) => `${r.type}｜${r.need}｜${r.use}｜優先：${r.priority}`);
    case "quality":
      return (b.checks ?? []).map((c) => (md ? `- [${c.passed ? "x" : " "}] ${c.label}` : `${c.passed ? "✓" : "✗"} ${c.label}`));
    case "slides":
      return (b.slides ?? []).flatMap((s) => [
        `第 ${s.page} 頁：${s.title}`,
        ...s.points.map((p) => (md ? `- ${p}` : `• ${p}`)),
        `視覺建議：${s.visual}`,
        "",
      ]);
    default:
      return [];
  }
}

function buildPlainText(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    report.meta.title,
    `類型：${input.reportType}｜模式：${input.mode}｜風格：${input.style}｜對象：${input.targetAudience}｜${today}`,
    `分類：${report.meta.category}｜目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`,
    "",
  ];
  if (report.shortTopic) {
    lines.push(`【提醒】${report.shortTopic.message}`, "建議延伸主題：", ...report.shortTopic.expansions.map((e, i) => `${i + 1}. ${e}`), "");
  }
  for (const section of report.sections) {
    lines.push(`【${section.heading}】`);
    for (const b of section.blocks) lines.push(...blockToLines(b, false));
    lines.push("");
  }
  return lines.join("\n");
}

function buildMarkdown(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    `# ${report.meta.title}`,
    `> 類型：${input.reportType} ｜ 模式：${input.mode} ｜ 風格：${input.style} ｜ 對象：${input.targetAudience} ｜ 日期：${today}`,
    `>`,
    `> 分類：${report.meta.category} ｜ 目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`,
    "",
  ];
  if (report.shortTopic) {
    lines.push(`> ⚠️ ${report.shortTopic.message}`, "", "**建議延伸主題：**", ...report.shortTopic.expansions.map((e, i) => `${i + 1}. ${e}`), "");
  }
  for (const section of report.sections) {
    lines.push(`## ${section.heading}`);
    for (const b of section.blocks) lines.push(...blockToLines(b, true));
    lines.push("");
  }
  return lines.join("\n");
}
