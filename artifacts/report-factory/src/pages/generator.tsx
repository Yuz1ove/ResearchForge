import { useState } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { generateReportDraft, ReportDraft, ReportInput } from "@/lib/generateReport";
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
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  "學校研究報告",
  "科展報告",
  "專題報告",
  "商業分析報告",
  "市場研究報告",
  "實驗報告",
  "讀書心得報告",
  "社會議題報告",
  "網站 / AI / 產品規劃報告",
];

const REPORT_STYLES = [
  "學術正式",
  "高中生可提交",
  "商業顧問",
  "簡潔條列",
  "詳細完整",
  "Eric 90 分報告風格",
];

const REPORT_LENGTHS = [
  "短版摘要",
  "中等篇幅",
  "完整報告",
  "研究架構版",
];

// ─── Section component ────────────────────────────────────────────────────────

function ReportSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
        data-testid={`section-toggle-${title}`}
      >
        <span className="font-semibold text-sm text-foreground">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 py-4 text-sm text-muted-foreground leading-relaxed">{children}</div>}
    </div>
  );
}

// ─── Report output renderer ───────────────────────────────────────────────────

function ReportOutput({
  draft,
  input,
  onCopy,
  onDownload,
  onClear,
  onRegenerate,
}: {
  draft: ReportDraft;
  input: ReportInput;
  onCopy: () => void;
  onDownload: () => void;
  onClear: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Report header */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h2 className="text-xl font-bold text-foreground mb-3">{draft.title}</h2>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{input.type}</Badge>
          <Badge variant="secondary">{input.style}</Badge>
          <Badge variant="secondary">{input.length}</Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {new Date().toLocaleDateString("zh-TW")}
          </Badge>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onCopy} data-testid="button-copy">
          <Copy className="mr-2 h-4 w-4" /> 複製報告
        </Button>
        <Button size="sm" variant="outline" onClick={onDownload} data-testid="button-download">
          <Download className="mr-2 h-4 w-4" /> 下載 Markdown
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} data-testid="button-regenerate">
          <RefreshCw className="mr-2 h-4 w-4" /> 重新生成
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onClear} data-testid="button-clear">
          <Trash2 className="mr-2 h-4 w-4" /> 清除內容
        </Button>
      </div>

      {/* Sections */}
      <div className="flex flex-col gap-3 overflow-y-auto flex-1 pr-1">
        <ReportSection title="摘要">
          <p>{draft.summary}</p>
        </ReportSection>

        <ReportSection title="研究背景">
          <p>{draft.background}</p>
        </ReportSection>

        <ReportSection title="研究目的">
          <p className="whitespace-pre-line">{draft.purpose}</p>
        </ReportSection>

        <ReportSection title="研究問題">
          <ol className="space-y-2 list-none">
            {draft.researchQuestions.map((q, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary font-semibold shrink-0">{i + 1}.</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </ReportSection>

        <ReportSection title="研究假設">
          <p className="whitespace-pre-line">{draft.hypothesis}</p>
        </ReportSection>

        <ReportSection title="文獻探討大綱">
          <ol className="space-y-2 list-none">
            {draft.literatureOutline.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary font-semibold shrink-0 w-4">{i + 1}.</span>
                <span>{item.replace(/^\d+\.\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </ReportSection>

        <ReportSection title="研究方法">
          <p>{draft.methodology}</p>
        </ReportSection>

        <ReportSection title="預計圖表" defaultOpen={false}>
          <ul className="space-y-2">
            {draft.plannedCharts.map((c, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="text-primary mt-0.5 shrink-0">▸</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title="預計圖片" defaultOpen={false}>
          <ul className="space-y-2">
            {draft.plannedImages.map((img, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="text-primary mt-0.5 shrink-0">▸</span>
                <span>{img}</span>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title="研究限制" defaultOpen={false}>
          <ul className="space-y-2">
            {draft.limitations.map((l, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className="text-amber-500 mt-0.5 shrink-0">!</span>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </ReportSection>

        <ReportSection title="結論草稿">
          <p>{draft.conclusion}</p>
        </ReportSection>

        {/* Quality checklist */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-primary/5 border-b border-border">
            <span className="font-semibold text-sm text-foreground">報告品質檢查表</span>
          </div>
          <div className="px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {draft.qualityChecks.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {c.passed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <span className={c.passed ? "text-foreground" : "text-muted-foreground line-through"}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export function Generator() {
  const { toast } = useToast();

  const [input, setInput] = useState<ReportInput>({
    topic: "",
    type: "學校研究報告",
    style: "學術正式",
    length: "中等篇幅",
  });

  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const updateInput = (key: keyof ReportInput, value: string) => {
    setInput(prev => ({ ...prev, [key]: value }));
  };

  // ── Generate ──────────────────────────────────────────────────────────────

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
    setDraft(null);
    // Simulate async — swap setTimeout for real API call in the future
    setTimeout(() => {
      const result = generateReportDraft(input);
      setDraft(result);
      setIsGenerating(false);
    }, 1800);
  };

  // ── Copy ──────────────────────────────────────────────────────────────────

  const handleCopy = () => {
    if (!draft) return;
    const text = buildPlainText(draft, input);
    navigator.clipboard.writeText(text);
    toast({ title: "已複製到剪貼簿", description: "報告純文字已成功複製，可直接貼入文件。" });
  };

  // ── Download Markdown ─────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!draft) return;
    const md = buildMarkdown(draft, input);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "report-draft.md";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "已下載 Markdown", description: "report-draft.md 已儲存到你的裝置。" });
  };

  // ── Clear ─────────────────────────────────────────────────────────────────

  const handleClear = () => {
    setInput({ topic: "", type: "學校研究報告", style: "學術正式", length: "中等篇幅" });
    setDraft(null);
  };

  // ── Regenerate ────────────────────────────────────────────────────────────

  const handleRegenerate = () => {
    handleGenerate();
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">報告生成器</h1>
          <p className="text-muted-foreground text-sm mt-1">填寫以下資訊，即可快速生成結構完整的報告草稿。</p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">

          {/* ── Form panel ───────────────────────────────────────────────── */}
          <div className="w-full lg:w-80 xl:w-96 shrink-0">
            <div className="bg-card border border-border rounded-xl shadow-sm p-6 flex flex-col gap-5 sticky top-24">

              <div className="space-y-2">
                <Label htmlFor="topic">
                  報告主題 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="topic"
                  placeholder="例如：不同溫度對維生素C氧化速率之影響"
                  value={input.topic}
                  onChange={e => updateInput("topic", e.target.value)}
                  data-testid="input-topic"
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="type">報告類型</Label>
                <Select value={input.type} onValueChange={v => updateInput("type", v)}>
                  <SelectTrigger id="type" data-testid="select-type" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="style">報告風格</Label>
                <Select value={input.style} onValueChange={v => updateInput("style", v)}>
                  <SelectTrigger id="style" data-testid="select-style" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_STYLES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="length">報告長度</Label>
                <Select value={input.length} onValueChange={v => updateInput("length", v)}>
                  <SelectTrigger id="length" data-testid="select-length" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPORT_LENGTHS.map(l => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="lg"
                className="w-full h-12 text-base mt-2"
                onClick={handleGenerate}
                disabled={isGenerating}
                data-testid="button-generate"
              >
                {isGenerating ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> 生成中...</>
                ) : (
                  <><Wand2 className="mr-2 h-5 w-5" /> 生成報告草稿</>
                )}
              </Button>

              {draft && (
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

          {/* ── Result panel ─────────────────────────────────────────────── */}
          <div className="flex-1 min-h-[600px]">

            {/* Empty state */}
            {!draft && !isGenerating && (
              <div className="h-full min-h-[480px] flex flex-col items-center justify-center text-center bg-card border border-border rounded-xl p-10 gap-4">
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
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col gap-4 animate-pulse">
                <div className="h-7 bg-muted rounded w-2/3" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded w-20" />
                  <div className="h-6 bg-muted rounded w-16" />
                  <div className="h-6 bg-muted rounded w-24" />
                </div>
                <div className="flex gap-2 mt-2">
                  <div className="h-8 bg-muted rounded w-24" />
                  <div className="h-8 bg-muted rounded w-28" />
                  <div className="h-8 bg-muted rounded w-24" />
                </div>
                {[1, 2, 3, 4].map(n => (
                  <div key={n} className="border border-border rounded-lg overflow-hidden">
                    <div className="h-10 bg-muted/60" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-muted rounded w-full" />
                      <div className="h-4 bg-muted rounded w-5/6" />
                      <div className="h-4 bg-muted rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report output */}
            {draft && !isGenerating && (
              <div className="bg-card border border-border rounded-xl shadow-sm p-6">
                <ReportOutput
                  draft={draft}
                  input={input}
                  onCopy={handleCopy}
                  onDownload={handleDownload}
                  onClear={handleClear}
                  onRegenerate={handleRegenerate}
                />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── Plain-text builder (for copy) ───────────────────────────────────────────

function buildPlainText(d: ReportDraft, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  return [
    d.title,
    `類型：${input.type} ｜ 風格：${input.style} ｜ ${today}`,
    "",
    "【摘要】",
    d.summary,
    "",
    "【研究背景】",
    d.background,
    "",
    "【研究目的】",
    d.purpose,
    "",
    "【研究問題】",
    d.researchQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
    "",
    "【研究假設】",
    d.hypothesis,
    "",
    "【文獻探討大綱】",
    d.literatureOutline.join("\n"),
    "",
    "【研究方法】",
    d.methodology,
    "",
    "【預計圖表】",
    d.plannedCharts.join("\n"),
    "",
    "【預計圖片】",
    d.plannedImages.join("\n"),
    "",
    "【研究限制】",
    d.limitations.join("\n"),
    "",
    "【結論草稿】",
    d.conclusion,
    "",
    "【品質檢查】",
    d.qualityChecks.map(c => `${c.passed ? "✓" : "✗"} ${c.label}`).join("\n"),
  ].join("\n");
}

// ─── Markdown builder (for download) ─────────────────────────────────────────

function buildMarkdown(d: ReportDraft, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  return [
    `# ${d.title}`,
    `> 類型：${input.type} ｜ 風格：${input.style} ｜ 長度：${input.length} ｜ 日期：${today}`,
    "",
    "## 摘要",
    d.summary,
    "",
    "## 研究背景",
    d.background,
    "",
    "## 研究目的",
    d.purpose,
    "",
    "## 研究問題",
    d.researchQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
    "",
    "## 研究假設",
    d.hypothesis,
    "",
    "## 文獻探討大綱",
    d.literatureOutline.join("\n"),
    "",
    "## 研究方法",
    d.methodology,
    "",
    "## 預計圖表",
    d.plannedCharts.map(c => `- ${c}`).join("\n"),
    "",
    "## 預計圖片",
    d.plannedImages.map(img => `- ${img}`).join("\n"),
    "",
    "## 研究限制",
    d.limitations.map(l => `- ${l}`).join("\n"),
    "",
    "## 結論草稿",
    d.conclusion,
    "",
    "## 報告品質檢查表",
    d.qualityChecks.map(c => `- [${c.passed ? "x" : " "}] ${c.label}`).join("\n"),
  ].join("\n");
}
