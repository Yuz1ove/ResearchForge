import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Settings,
  Wand2,
  ChevronRight,
  ChevronLeft,
  Clock,
  Download,
  Copy,
  PieChart,
  BarChart,
  LineChart,
  Loader2
} from "lucide-react";
import { useState } from "react";

const REPORT_TYPES: Record<string, string> = {
  "執行摘要": "Executive Summary",
  "市場分析": "Market Analysis",
  "風險評估": "Risk Assessment",
  "競爭分析": "Competitive Analysis",
  "財務報告": "Financial Report",
  "專案狀態更新": "Project Status Update",
};

const AUDIENCES: Record<string, string> = {
  "董事會": "Board of Directors",
  "投資人": "Investors",
  "管理團隊": "Management Team",
  "客戶": "Clients",
  "一般大眾": "General Public",
};

function buildMarkdown(topic: string, type: string, audience: string, tone: string, includeDataSources: boolean, includeCharts: boolean): string {
  const today = new Date().toLocaleDateString("zh-TW");
  return `# ${topic}
**報告類型：** ${type} | **目標讀者：** ${audience} | **日期：** ${today}

## 執行摘要
本報告針對「${topic}」進行全面性分析，專為${audience}量身撰寫。研究發現，此議題在當前環境下具有重要的策略意義，需要立即採取行動以應對已識別的關鍵風險因子。

整體而言，本報告的核心建議為：應在短期內重新分配資源至高成長領域，同時建立跨職能工作小組以協調執行，確保各項行動計畫能在既定時程內落地實施。

## 背景與現況
「${topic}」的當前格局正經歷顯著轉變。根據現有資料與歷史趨勢分析，市場條件的變化要求我們對現行策略框架進行全面審視。

主要的背景驅動因素包括：外部市場競爭加劇、內部資源配置效率的優化空間，以及監管環境的持續演進。我們的首要目標，是在掌握新興機會的同時，有效降低與市場波動相關的下行風險。

## 關鍵發現與行動步驟
1. **立即資源重分配：** 將重心轉移至「${topic}」相關的高成長細分領域，以第二季識別的機會為優先。
2. **成立專案工作小組：** 組建跨職能團隊，於 14 日內啟動執行協調工作。
3. **修訂財務預測：** 依據最新數據要點，更新第三、四季的預測模型。
4. **供應商重新談判：** 主動與核心供應商接洽，爭取更優惠的合作條件。
5. **部署追蹤框架：** 建立更新後的儀表板，針對「${topic}」相關的 KPI 進行持續監控。
6. **向${audience}彙報進度：** 建立定期溝通機制，確保關鍵利害關係人掌握最新執行狀況。

## 風險分析
- **高風險 — 執行延誤：** 跨部門協調不足可能導致「${topic}」相關行動計畫無法在預定時程內完成。
- **中風險 — 競爭對手反應：** 預期主要競爭對手將在本季內採取對應措施，影響市場份額。
- **低風險 — 法規合規調整：** 年底前可能需進行少量合規更新，整體影響可控。

## 結論
綜上所述，積極推進「${topic}」相關的策略舉措，將有助於組織在近期市場挑戰中取得有利地位。建議${audience}持續追蹤本文件所列的關鍵績效指標，以確保執行成效。
${includeDataSources ? `
## 資料來源
- 內部第二季績效指標（財務資料庫）
- 產業基準報告（Gartner, 2024）
- 客戶意見調查（五月批次）
- 外部市場研究報告（Bloomberg Intelligence）` : ""}
${includeCharts ? `
## 圖表建議
- **長條圖** — 各細分領域收益比較，呈現企業客戶的不均衡成長趨勢。
- **折線圖** — 自「${topic}」啟動以來的月度用戶獲取趨勢。
- **圓餅圖** — 當前市佔率分布，對比前三大競爭對手的市場定位。` : ""}`;
}

export function Generator() {
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  const [formData, setFormData] = useState({
    topic: "",
    type: "執行摘要",
    audience: "管理團隊",
    wordCount: "~1,000 字",
    tone: "正式專業",
    includeDataSources: true,
    includeCharts: true,
    referenceMaterial: ""
  });

  const updateForm = (key: keyof typeof formData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step === 1 && !formData.topic.trim()) {
      toast({
        title: "請填寫報告標題",
        description: "請輸入報告主題後再繼續。",
        variant: "destructive"
      });
      return;
    }
    setStep(prev => Math.min(prev + 1, 3) as 1 | 2 | 3);
  };

  const handleBack = () => {
    setStep(prev => Math.max(prev - 1, 1) as 1 | 2 | 3);
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setHasGenerated(false);
    setTimeout(() => {
      setIsGenerating(false);
      setHasGenerated(true);
    }, 2500);
  };

  const handleExportPro = (format: string) => {
    toast({
      title: "即將推出",
      description: `${format} 匯出功能將在專業版方案中提供。`,
    });
  };

  const handleCopyMarkdown = () => {
    const md = buildMarkdown(
      formData.topic || "未命名報告",
      formData.type,
      formData.audience,
      formData.tone,
      formData.includeDataSources,
      formData.includeCharts
    );
    navigator.clipboard.writeText(md);
    toast({
      title: "已複製到剪貼簿",
      description: "報告的 Markdown 版本已成功複製。",
    });
  };

  const today = new Date().toLocaleDateString("zh-TW");

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl flex flex-col lg:flex-row gap-6 h-[calc(100vh-80px)]">

        {/* LEFT SIDEBAR */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-6">
          <Card className="border-border shadow-sm">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">進度</h3>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-[11px] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">

                {[
                  { n: 1, label: "報告設定" },
                  { n: 2, label: "內容設定" },
                  { n: 3, label: "生成報告" },
                ].map(({ n, label }) => (
                  <div key={n} className="relative flex items-center gap-4">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 z-10 transition-colors ${step >= n ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted text-muted-foreground"}`}>
                      <span className="text-xs font-bold">{n}</span>
                    </div>
                    <span className={`text-sm font-medium ${step >= n ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                  </div>
                ))}

              </div>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm hidden lg:block">
            <CardContent className="p-4">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4" /> 最近報告
              </h3>
              <div className="space-y-3">
                {[
                  { title: "Q3 財務摘要總覽", sub: "財務報告 · 昨天" },
                  { title: "競爭對手 SWOT 分析", sub: "競爭分析 · 3 天前" },
                  { title: "IT 基礎架構遷移計畫", sub: "專案狀態更新 · 上週" },
                ].map((r, i) => (
                  <div key={i} className="text-sm p-2 rounded-md hover:bg-muted cursor-pointer transition-colors border border-transparent hover:border-border">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{r.sub}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CENTER FORM */}
        <div className="flex-1 flex flex-col gap-4">
          <Card className="flex-1 flex flex-col border-border shadow-sm overflow-hidden h-full">

            <div className="p-5 border-b border-border bg-card">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                {step === 1 && <><FileText className="h-5 w-5 text-primary" /> 報告設定</>}
                {step === 2 && <><Settings className="h-5 w-5 text-primary" /> 內容設定</>}
                {step === 3 && <><Wand2 className="h-5 w-5 text-primary" /> 確認與生成</>}
              </h2>
            </div>

            <div className="p-6 flex-1 overflow-y-auto bg-card">

              {/* Step 1 */}
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-2">
                    <Label htmlFor="topic">報告主題 <span className="text-destructive">*</span></Label>
                    <Input
                      id="topic"
                      placeholder="例如：Q4 行銷活動成效分析"
                      value={formData.topic}
                      onChange={(e) => updateForm("topic", e.target.value)}
                      data-testid="input-topic"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="type">報告類型</Label>
                    <Select value={formData.type} onValueChange={(val) => updateForm("type", val)}>
                      <SelectTrigger id="type" data-testid="select-type">
                        <SelectValue placeholder="選擇報告類型" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(REPORT_TYPES).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="audience">目標讀者</Label>
                    <Select value={formData.audience} onValueChange={(val) => updateForm("audience", val)}>
                      <SelectTrigger id="audience" data-testid="select-audience">
                        <SelectValue placeholder="選擇目標讀者" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(AUDIENCES).map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="wordCount">報告字數</Label>
                    <Select value={formData.wordCount} onValueChange={(val) => updateForm("wordCount", val)}>
                      <SelectTrigger id="wordCount" data-testid="select-wordcount">
                        <SelectValue placeholder="選擇字數" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="~500 字">約 500 字（簡短版）</SelectItem>
                        <SelectItem value="~1,000 字">約 1,000 字（標準版）</SelectItem>
                        <SelectItem value="~2,000 字">約 2,000 字（詳細版）</SelectItem>
                        <SelectItem value="~3,000 字">約 3,000 字（完整版）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-3">
                    <Label>語氣風格</Label>
                    <RadioGroup
                      value={formData.tone}
                      onValueChange={(val) => updateForm("tone", val)}
                      className="grid grid-cols-1 md:grid-cols-2 gap-3"
                    >
                      {["正式專業", "分析數據導向", "說服策略型", "中立客觀"].map((t) => (
                        <div key={t} className={`flex items-center space-x-2 border rounded-md p-3 cursor-pointer transition-colors ${formData.tone === t ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
                          <RadioGroupItem value={t} id={`tone-${t}`} data-testid={`radio-tone-${t}`} />
                          <Label htmlFor={`tone-${t}`} className="cursor-pointer font-normal w-full">{t}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="space-y-4 p-4 border rounded-md bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>包含資料來源</Label>
                        <div className="text-xs text-muted-foreground">在報告末尾附上引用來源清單</div>
                      </div>
                      <Switch
                        checked={formData.includeDataSources}
                        onCheckedChange={(val) => updateForm("includeDataSources", val)}
                        data-testid="switch-datasources"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>圖表建議</Label>
                        <div className="text-xs text-muted-foreground">推薦適合關鍵數據的視覺化圖表</div>
                      </div>
                      <Switch
                        checked={formData.includeCharts}
                        onCheckedChange={(val) => updateForm("includeCharts", val)}
                        data-testid="switch-charts"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 h-48 flex flex-col">
                    <Label htmlFor="reference">參考資料 <span className="text-muted-foreground font-normal">（選填）</span></Label>
                    <Textarea
                      id="reference"
                      placeholder="貼上任何背景資訊、數據要點、會議記錄或原始素材..."
                      className="flex-1 resize-none"
                      value={formData.referenceMaterial}
                      onChange={(e) => updateForm("referenceMaterial", e.target.value)}
                      data-testid="textarea-reference"
                    />
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 flex flex-col h-full">
                  <div className="bg-muted p-5 rounded-lg border border-border">
                    <h3 className="font-semibold mb-4 text-foreground">設定摘要確認</h3>
                    <dl className="space-y-3 text-sm">
                      {[
                        { label: "報告主題", value: formData.topic },
                        { label: "報告類型", value: formData.type },
                        { label: "目標讀者", value: formData.audience },
                        { label: "字數設定", value: formData.wordCount },
                        { label: "語氣風格", value: formData.tone },
                      ].map(({ label, value }) => (
                        <div key={label} className="grid grid-cols-3 gap-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="col-span-2 font-medium text-foreground">{value}</dd>
                        </div>
                      ))}
                      <div className="grid grid-cols-3 gap-2">
                        <dt className="text-muted-foreground">附加選項</dt>
                        <dd className="col-span-2 font-medium text-foreground flex gap-2">
                          {formData.includeDataSources && <Badge variant="secondary" className="font-normal text-xs">資料來源</Badge>}
                          {formData.includeCharts && <Badge variant="secondary" className="font-normal text-xs">圖表建議</Badge>}
                          {!formData.includeDataSources && !formData.includeCharts && "無"}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex-1 flex items-center justify-center mt-4">
                    <Button
                      size="lg"
                      className="w-full h-16 text-lg"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      data-testid="button-generate"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                          正在生成報告...
                        </>
                      ) : (
                        <>
                          <Wand2 className="mr-2 h-6 w-6" />
                          生成報告
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

            </div>

            <div className="p-4 border-t border-border bg-muted/10 flex justify-between">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={step === 1 || isGenerating}
                data-testid="button-back"
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> 上一步
              </Button>
              {step < 3 && (
                <Button onClick={handleNext} data-testid="button-next">
                  下一步 <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT PREVIEW PANE */}
        <div className="w-full lg:w-[45%] xl:w-1/2 flex flex-col h-[600px] lg:h-full shrink-0">
          <Card className="flex-1 border-border shadow-sm flex flex-col overflow-hidden bg-card">

            {/* Empty State */}
            {!hasGenerated && !isGenerating && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground animate-in fade-in duration-500">
                <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center mb-6">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">報告預覽區</h3>
                <p className="max-w-xs text-sm">完成設定並點擊「生成報告」後，您的結構化報告將顯示在此處。</p>
              </div>
            )}

            {/* Loading State */}
            {isGenerating && (
              <div className="flex-1 p-8 space-y-6 animate-pulse bg-card">
                <div className="h-8 bg-muted rounded w-3/4 mb-8"></div>
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                </div>
                <div className="space-y-3 pt-6">
                  <div className="h-5 bg-muted rounded w-1/3 mb-4"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-4/5"></div>
                </div>
                <div className="space-y-3 pt-6">
                  <div className="h-5 bg-muted rounded w-1/4 mb-4"></div>
                  <div className="h-4 bg-muted rounded w-full"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                </div>
              </div>
            )}

            {/* Generated Report */}
            {hasGenerated && !isGenerating && (
              <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 bg-card">
                <div className="flex-1 overflow-y-auto p-6 md:p-8">

                  {/* Header */}
                  <div className="border-b border-border pb-6 mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
                      {formData.topic || "未命名報告"}
                    </h1>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-normal">{formData.type}</Badge>
                      <Badge variant="outline" className="font-normal">對象：{formData.audience}</Badge>
                      <Badge variant="outline" className="font-normal">{today}</Badge>
                    </div>
                  </div>

                  <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground">

                    <h3>執行摘要</h3>
                    <p>
                      本報告針對「{formData.topic || "本議題"}」進行全面性分析，專為{formData.audience}量身撰寫。研究發現，此議題在當前環境下具有重要的策略意義，需要立即採取行動以應對已識別的關鍵風險因子。
                    </p>
                    <p>
                      採用{formData.tone}的語氣框架，本報告的核心建議為：應在短期內重新分配資源，建立跨職能工作小組以協調執行，確保行動計畫能在既定時程內有效落地。
                    </p>

                    <h3>背景與現況</h3>
                    <p>
                      「{formData.topic || "本議題"}」的當前格局正在經歷顯著轉變。根據現有資料與歷史趨勢，市場環境的變化要求我們對現行策略框架進行全面審視。主要驅動因素包括：外部競爭加劇、內部資源配置的優化空間，以及監管環境的持續演進。
                    </p>

                    <h3>關鍵發現與行動步驟</h3>
                    <ol>
                      <li><strong>立即資源重分配：</strong>將重心轉移至「{formData.topic || "本議題"}」相關的高成長細分領域。</li>
                      <li><strong>成立專案工作小組：</strong>組建跨職能團隊，於 14 日內啟動執行協調工作。</li>
                      <li><strong>修訂財務預測：</strong>依據最新數據，更新第三、四季的預測模型。</li>
                      <li><strong>供應商重新談判：</strong>主動與核心供應商接洽，爭取更優惠的合作條件。</li>
                      <li><strong>部署追蹤框架：</strong>建立更新後的儀表板，針對相關 KPI 進行持續監控。</li>
                      <li><strong>向{formData.audience}定期彙報：</strong>建立定期溝通機制，確保關鍵利害關係人掌握最新進展。</li>
                    </ol>

                    <h3>風險分析</h3>
                    <div className="not-prose space-y-3 my-6">
                      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/20">
                        <Badge variant="destructive" className="mt-0.5 shrink-0">高風險</Badge>
                        <div className="text-sm">
                          <span className="font-medium text-foreground block">執行延誤</span>
                          <span className="text-muted-foreground">跨部門協調不足可能導致「{formData.topic || "本議題"}」相關行動計畫無法在預定時程內完成。</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/20">
                        <Badge className="bg-amber-500 hover:bg-amber-600 mt-0.5 shrink-0">中風險</Badge>
                        <div className="text-sm">
                          <span className="font-medium text-foreground block">競爭對手反應</span>
                          <span className="text-muted-foreground">預期主要競爭對手將在本季內採取對應措施，影響市場份額與定價空間。</span>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/20">
                        <Badge className="bg-green-500 hover:bg-green-600 mt-0.5 shrink-0">低風險</Badge>
                        <div className="text-sm">
                          <span className="font-medium text-foreground block">法規合規調整</span>
                          <span className="text-muted-foreground">年底前可能需進行少量合規更新，整體影響範圍可控。</span>
                        </div>
                      </div>
                    </div>

                    <h3>結論</h3>
                    <p>
                      綜上所述，積極推進「{formData.topic || "本議題"}」相關的策略舉措，將有助於組織在近期市場挑戰中取得有利地位。建議{formData.audience}持續追蹤本文件所列的關鍵績效指標，以確保各項行動計畫的執行成效。
                    </p>

                    {formData.includeDataSources && (
                      <>
                        <h3 className="border-t border-border pt-6 mt-8">資料來源</h3>
                        <ul className="text-xs text-muted-foreground">
                          <li>內部第二季績效指標（財務資料庫）</li>
                          <li>產業基準報告（Gartner, 2024）</li>
                          <li>客戶意見調查（五月批次）</li>
                          <li>外部市場研究報告（Bloomberg Intelligence）</li>
                        </ul>
                      </>
                    )}

                    {formData.includeCharts && (
                      <>
                        <h3 className="border-t border-border pt-6 mt-8">圖表建議</h3>
                        <div className="not-prose grid grid-cols-1 gap-3 mt-4">
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-background">
                            <div className="p-2 bg-primary/10 text-primary rounded"><BarChart className="h-4 w-4" /></div>
                            <div>
                              <div className="text-sm font-medium">各細分領域收益比較（長條圖）</div>
                              <div className="text-xs text-muted-foreground">呈現「{formData.topic || "本議題"}」中企業客戶的不均衡成長趨勢。</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-background">
                            <div className="p-2 bg-primary/10 text-primary rounded"><LineChart className="h-4 w-4" /></div>
                            <div>
                              <div className="text-sm font-medium">月度用戶獲取趨勢（折線圖）</div>
                              <div className="text-xs text-muted-foreground">顯示自計畫啟動以來的月度成長軌跡。</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 border rounded-md bg-background">
                            <div className="p-2 bg-primary/10 text-primary rounded"><PieChart className="h-4 w-4" /></div>
                            <div>
                              <div className="text-sm font-medium">市佔率分布（圓餅圖）</div>
                              <div className="text-xs text-muted-foreground">呈現當前定位相對於前三大競爭對手的市場份額。</div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}

                  </div>
                </div>

                {/* Export Toolbar */}
                <div className="p-4 border-t border-border bg-muted/30 flex flex-wrap gap-3 items-center justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleExportPro("PDF")} data-testid="button-export-pdf">
                      <Download className="mr-2 h-4 w-4" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExportPro("DOCX")} data-testid="button-export-docx">
                      <Download className="mr-2 h-4 w-4" /> DOCX
                    </Button>
                  </div>
                  <Button variant="default" size="sm" onClick={handleCopyMarkdown} data-testid="button-copy-markdown">
                    <Copy className="mr-2 h-4 w-4" /> 複製 Markdown
                  </Button>
                </div>

              </div>
            )}

          </Card>
        </div>

      </main>
    </div>
  );
}
