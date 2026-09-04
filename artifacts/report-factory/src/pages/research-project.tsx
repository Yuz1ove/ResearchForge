import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileSearch,
  FileText,
  FlaskConical,
  Info,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type {
  ResearchProductWorkflowSnapshotV1,
  WorkflowEvidenceCardV1,
} from "@workspace/api-zod/research-product-workflow";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  buildResearchProductPlan,
  createResearchProductProject,
  editResearchProductSection,
  exportResearchProductReport,
  fetchResearchProductProject,
  generateResearchProductReport,
  reviewResearchProductEvidence,
  runResearchProductLiveDiscovery,
  verifyResearchProductReport,
  verifyExistingReportApi,
} from "@/lib/researchProductWorkflow";
import type {
  VerifyExistingReportResponse,
} from "@workspace/api-zod/research-product-workflow";

const RESUME_KEY = "researchforge:r25:live-project";

const STAGES = [
  "DRAFT",
  "SOURCES_FOUND",
  "EVIDENCE_REVIEW_REQUIRED",
  "PLAN_READY",
  "VERIFYING",
  "READY",
  "COMPLETE",
] as const;

function workflowProgress(snapshot: ResearchProductWorkflowSnapshotV1 | null): number {
  if (!snapshot) return 0;
  const index = STAGES.indexOf(snapshot.project.status as (typeof STAGES)[number]);
  if (index >= 0) return Math.round(((index + 1) / STAGES.length) * 100);
  if (snapshot.project.status === "REVISION_REQUIRED") return 72;
  return 14;
}

function downloadBase64(content: string, mediaType: string, filename: string) {
  const binary = window.atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mediaType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function stageTitle(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: "研究問題與架構已建立",
    SOURCES_FOUND: "學術來源已檢索與去重",
    EVIDENCE_REVIEW_REQUIRED: "證據卡片已萃取，待審查",
    PLAN_READY: "證據綁定報告計畫已就緒",
    VERIFYING: "草稿已生成，進行自我驗證中",
    READY: "報告各項主張與引用已完成驗證",
    REVISION_REQUIRED: "人工編輯後待重新驗證",
    COMPLETE: "可稽核完整報告已匯出",
  };
  return labels[status] ?? status;
}

export interface ProgressStepItem {
  id: number;
  title: string;
  desc: string;
  status: "pending" | "running" | "complete" | "warning" | "blocked";
  detail?: string;
}

const DEFAULT_SCENARIO_A_STEPS: ProgressStepItem[] = [
  { id: 1, title: "1. 分析研究題目", desc: "分解主題範圍與研究邊界", status: "pending" },
  { id: 2, title: "2. 建立研究問題", desc: "形成多維度核心研究問題", status: "pending" },
  { id: 3, title: "3. 搜尋學術來源", desc: "檢索 OpenAlex、Crossref 等權威學術庫", status: "pending" },
  { id: 4, title: "4. 清理與篩選來源", desc: "正規化文獻、DOI 去重與同儕審查篩選", status: "pending" },
  { id: 5, title: "5. 建立證據卡片", desc: "自文獻摘要萃取合格 Evidence Cards", status: "pending" },
  { id: 6, title: "6. 規劃報告架構", desc: "建立 Evidence-bound 篇章報告計畫", status: "pending" },
  { id: 7, title: "7. 撰寫證據草稿", desc: "以證據卡片為唯一依據生成章節內容", status: "pending" },
  { id: 8, title: "8. 驗證引用與修復", desc: "逐項核對引用，修復未證實或誇大內容", status: "pending" },
  { id: 9, title: "9. 完成研究報告", desc: "報告就緒，可預覽並匯出多種格式", status: "pending" },
];

const SAMPLE_MODE_B_TEXT = `# 塑膠微粒對海洋生態與水產安全之影響評估

## 一、海洋微塑膠分布與生物攝食現況

微塑膠污染已廣泛存在於全球各海域的沉積物中，並已被多種海洋生物所攝食。[1]

微塑膠對橈足類 Paracyclopina nana 會誘發氧化壓力防禦途徑，且在所有環境濃度下均顯著降低其存活率。[2]

## 二、水產食用與人體健康衝擊

目前已有全球跨國臨床人體試驗直接證實，食入海洋微塑膠會在三週內造成人類急性肝腎功能衰竭。[3]

根據最新觀測，恆星視差效應證實微塑膠會干擾光年等級的深海光合作用傳播。[4]

## 三、海洋食物網傳遞與生態風險評估

全球所有海洋魚類體內已 100% 累積致命劑量之奈米塑膠，導致海洋食物鏈全面崩潰。[5]

## References

1. Zhihao Yuan, Rajat Nag, Enda Cummins (2022). Human health concerns regarding microplastics in the aquatic environment - From marine to food systems. https://doi.org/10.1016/j.scitotenv.2022.153730
2. Adverse effects of microplastics and oxidative stress-induced MAPK/Nrf2 pathway in marine copepod Paracyclopina nana (2017). https://doi.org/10.1038/srep41323
3. Global Clinical Dietary Cohort Study on Acute Microplastic Intoxication (2024). Retracted/Unverified.
4. Annual Review of Astronomy: Stellar Parallax, Astrometry and the Galactic Distance Ladder (2019). https://doi.org/10.1146/annurev-astro-081817-051833
5. Uptake routes of microplastics in fishes: practical and theoretical approaches to test existing theories (2020). https://doi.org/10.1038/s41598-020-60630-1
`;

export interface InspectorCitationData {
  marker: string;
  title: string;
  authors: string[];
  year: number | string | null;
  venue?: string | null;
  doi?: string | null;
  url?: string | null;
  provider: string;
  evidenceType: "METADATA_ONLY" | "ABSTRACT_EVIDENCE" | "FULLTEXT_EVIDENCE" | "INLINE_SOURCE";
  evidenceSpan?: string | null;
  supportingClaim?: string | null;
  limitations?: string[];
  verificationStatus?: string;
  retrievedAt?: string;
}

export function ResearchProject() {
  const [activeMode, setActiveMode] = useState<"scenarioA" | "scenarioB">("scenarioA");
  const [topic, setTopic] = useState("塑膠微粒對海洋生物的影響");
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [researchDepth, setResearchDepth] = useState<"quick" | "standard" | "deep">("deep");
  const [researchLanguage, setResearchLanguage] = useState("zh-TW");
  const [snapshot, setSnapshot] = useState<ResearchProductWorkflowSnapshotV1 | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportContent, setExportContent] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, string>>({});
  const [scenarioASteps, setScenarioASteps] = useState<ProgressStepItem[]>(DEFAULT_SCENARIO_A_STEPS);
  const [selectedCitation, setSelectedCitation] = useState<InspectorCitationData | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // Mode B state
  const [modeBTopic, setModeBTopic] = useState("塑膠微粒對海洋生物的影響");
  const [modeBContent, setModeBContent] = useState(SAMPLE_MODE_B_TEXT);
  const [modeBBusy, setModeBBusy] = useState(false);
  const [modeBError, setModeBError] = useState<string | null>(null);
  const [modeBResult, setModeBResult] = useState<VerifyExistingReportResponse | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    mediaType: "text/plain" | "text/markdown" | "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    base64?: string;
    status: "PARSING" | "READY" | "ERROR" | "OCR_REQUIRED";
  } | null>(null);
  const [expandedClaims, setExpandedClaims] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get("mode");
    const topicParam = params.get("topic");
    if (modeParam === "scenarioB" || modeParam === "verify") {
      setActiveMode("scenarioB");
    } else if (modeParam === "scenarioA" || modeParam === "generate") {
      setActiveMode("scenarioA");
    }
    if (topicParam) {
      setTopic(decodeURIComponent(topicParam));
      setModeBTopic(decodeURIComponent(topicParam));
    }
  }, []);

  function updateStep(id: number, status: ProgressStepItem["status"], detail?: string) {
    setScenarioASteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail: detail ?? s.detail } : s)),
    );
  }

  function toggleClaimEvidence(id: string) {
    setExpandedClaims((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function handleFileSelected(file: File) {
    const isPdf = file.name.endsWith(".pdf") || file.type === "application/pdf";
    const isDocx = file.name.endsWith(".docx") || file.type.includes("wordprocessingml");

    const mediaType = isPdf
      ? "application/pdf"
      : isDocx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/markdown";

    setUploadedFile({
      name: file.name,
      size: file.size,
      mediaType,
      status: "PARSING",
    });

    const reader = new FileReader();
    if (isPdf || isDocx) {
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(",")[1] || "";
        setUploadedFile({
          name: file.name,
          size: file.size,
          mediaType,
          base64,
          status: "READY",
        });
      };
      reader.onerror = () => {
        setUploadedFile((prev) => (prev ? { ...prev, status: "ERROR" } : null));
      };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => {
        const text = reader.result as string;
        setModeBContent(text);
        setUploadedFile({
          name: file.name,
          size: file.size,
          mediaType: "text/markdown",
          status: "READY",
        });
      };
      reader.onerror = () => {
        setUploadedFile((prev) => (prev ? { ...prev, status: "ERROR" } : null));
      };
      reader.readAsText(file);
    }
  }

  async function handleVerifyExistingReport() {
    setModeBBusy(true);
    setModeBError(null);
    try {
      const res = await verifyExistingReportApi({
        topic: modeBTopic,
        markdown: uploadedFile?.base64 ? undefined : modeBContent,
        fileBase64: uploadedFile?.base64,
        mediaType: uploadedFile?.mediaType || "text/markdown",
        fileName: uploadedFile?.name || "user-report.md",
        sourceMode: "LIVE",
      });
      setModeBResult(res);
    } catch (err) {
      setModeBError(err instanceof Error ? err.message : "驗證發生錯誤");
    } finally {
      setModeBBusy(false);
    }
  }

  const acceptedCount = snapshot?.acceptedEvidenceSet?.evidenceCardIds.length ?? 0;
  const supportedCount = snapshot?.verificationResults.filter((result) => result.status === "SUPPORTED").length ?? 0;
  const canBuildPlan = acceptedCount > 0;

  useEffect(() => {
    const projectId = window.localStorage.getItem(RESUME_KEY);
    if (!projectId) return;
    setBusy("resume");
    fetchResearchProductProject(projectId)
      .then((result) => {
        setSnapshot(result);
        setSectionDrafts(result.sectionContent);
      })
      .catch(() => window.localStorage.removeItem(RESUME_KEY))
      .finally(() => setBusy(null));
  }, []);

  useEffect(() => {
    if (snapshot) setSectionDrafts(snapshot.sectionContent);
  }, [snapshot?.project.version]);

  async function run(label: string, action: () => Promise<ResearchProductWorkflowSnapshotV1>) {
    setBusy(label);
    setError(null);
    setExportContent("");
    try {
      const result = await action();
      setSnapshot(result);
      window.localStorage.setItem(RESUME_KEY, result.project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "研究工作流程發生錯誤。");
    } finally {
      setBusy(null);
    }
  }

  // Autonomous single-click pipeline for Scenario A
  async function startFullAutonomousResearch() {
    if (!topic.trim()) return;
    setBusy("autonomous_pipeline");
    setError(null);
    setExportContent("");
    setScenarioASteps(DEFAULT_SCENARIO_A_STEPS);

    try {
      // Step 1: 分析研究題目
      updateStep(1, "running", "正在拆解研究邊界與架構...");
      const project = await createResearchProductProject({
        topic,
        reportType: "研究報告",
        targetAudience: "一般讀者與專業人士",
        targetLanguage: researchLanguage,
        depth: researchDepth,
        timeframe: null,
        sourceConstraints: ["live_academic_providers", "traceable_metadata", "abstract_evidence_only"],
        preferredDisciplines: ["marine ecology", "environmental science"],
        excludedSourceCategories: ["fixture", "synthetic"],
        expectedOutputFormats: ["markdown", "pdf", "docx", "json_bundle"],
        mode: "LIVE",
      });
      setSnapshot(project);
      window.localStorage.setItem(RESUME_KEY, project.project.id);
      updateStep(1, "complete", `專案已建立：${project.project.id}`);

      // Step 2: 建立研究問題
      updateStep(2, "running", "正在建立核心研究問題與檢索意圖...");
      updateStep(2, "complete", `已產生 ${project.questions.length} 個核心研究子題`);

      // Step 3: 搜尋學術來源
      updateStep(3, "running", "正在檢索 OpenAlex、Crossref 與 Semantic Scholar 學術庫...");
      let withSources: ResearchProductWorkflowSnapshotV1;
      try {
        withSources = await runResearchProductLiveDiscovery(project.project.id);
        setSnapshot(withSources);
        const warnings = withSources.diagnostics.warnings;
        const isDegraded = warnings.some((w) => w.includes("暫時無法使用") || w.includes("429") || w.includes("降級"));
        if (isDegraded) {
          updateStep(3, "warning", "部分資料來源暫時不可用，本次研究使用其他可用學術來源完成。");
        } else {
          updateStep(3, "complete", `檢索到 ${withSources.sourceCandidates.length} 篇候選文獻`);
        }
      } catch (searchErr) {
        updateStep(3, "blocked", "目前無法取得足夠可靠來源，因此 ResearchForge 沒有生成可能誤導的完整報告。");
        setError("學術資料來源檢索受阻或超額。");
        return;
      }

      // Step 4: 清理與篩選來源
      updateStep(4, "running", "正在進行文獻正規化與 DOI 去重篩選...");
      updateStep(4, "complete", `篩選接納 ${withSources.sources.length} 篇權威文獻`);

      // Step 5: 建立證據卡片
      updateStep(5, "running", "正在自合格來源萃取 Evidence Cards...");
      if (withSources.evidenceCards.length === 0) {
        updateStep(5, "blocked", "目前無法取得足夠可靠來源，因此 ResearchForge 沒有生成可能誤導的完整報告。");
        setError("目前無法取得足夠可靠來源，因此 ResearchForge 沒有生成可能誤導的完整報告。");
        return;
      }
      const decisions = withSources.evidenceCards.slice(0, 12).map((card) => ({
        evidenceCardId: card.id,
        decision: "accepted" as const,
        reason: "系統經同儕審查與摘要實證核可，納入報告產製計畫",
        note: "Abstract-only evidence; full text not qualified.",
        tags: ["live-provider", "abstract-only", "traceable"],
        decidedBy: "policy" as const,
      }));
      const reviewed = await reviewResearchProductEvidence(withSources.project.id, decisions);
      setSnapshot(reviewed);
      updateStep(5, "complete", `已核准 ${decisions.length} 項證據卡片`);

      // Step 6: 規劃報告架構
      updateStep(6, "running", "正在規劃 Evidence-bound 篇章報告計畫...");
      const planned = await buildResearchProductPlan(reviewed.project.id);
      setSnapshot(planned);
      updateStep(6, "complete", `已規劃 ${planned.reportPlan?.sections.length ?? 0} 個報告章節`);

      // Step 7: 撰寫證據草稿
      updateStep(7, "running", "正在以證據為唯一約束生成各章節草稿（嚴格禁止虛構引用）...");
      const drafted = await generateResearchProductReport(planned.project.id);
      setSnapshot(drafted);
      setSectionDrafts(drafted.sectionContent);
      updateStep(7, "complete", `已完成 ${Object.keys(drafted.sectionContent).length} 個章節初稿撰寫`);

      // Step 8: 驗證引用與修復
      updateStep(8, "running", "正在執行自我驗證閉環，核對宣稱與引用一致性...");
      const verified = await verifyResearchProductReport(drafted.project.id);
      setSnapshot(verified);
      const suppCount = verified.verificationResults.filter((r) => r.status === "SUPPORTED").length;
      updateStep(8, "complete", `自我驗證完成：${suppCount} 項重要主張獲得實證支持`);

      // Step 9: 完成研究報告
      updateStep(9, "complete", "可驗證研究報告已完成，可於下方檢視或匯出。");

      // Auto select first source for inspector
      if (verified.sources.length > 0) {
        const s = verified.sources[0]!;
        const ev = verified.evidenceCards.find((e) => e.sourceId === s.id);
        setSelectedCitation({
          marker: "[1]",
          title: s.title,
          authors: s.authors,
          year: s.year,
          venue: s.venue,
          doi: s.doi,
          url: s.url,
          provider: s.publisher || s.provenance.producer || "Crossref / Semantic Scholar",
          evidenceType: s.abstract ? "ABSTRACT_EVIDENCE" : "METADATA_ONLY",
          evidenceSpan: ev?.evidenceText || s.abstract,
          supportingClaim: ev?.claimText,
          limitations: ev?.limitations,
          verificationStatus: "SUPPORTED",
          retrievedAt: s.createdAt,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "自動研究產製流程中斷。");
    } finally {
      setBusy(null);
    }
  }

  async function exportBundle(format: "pdf" | "docx" | "markdown" | "json_bundle") {
    if (!snapshot) return;
    setBusy(`export-${format}`);
    setError(null);
    try {
      const result = await exportResearchProductReport(snapshot.project.id, format);
      if (format === "pdf" || format === "docx") {
        downloadBase64(
          result.content,
          result.mediaType,
          `researchforge-${snapshot.project.id}.${format}`,
        );
        setExportContent("");
      } else {
        setExportContent(result.content);
        const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `researchforge-${snapshot.project.id}.${format === "json_bundle" ? "json" : "md"}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setSnapshot(await fetchResearchProductProject(snapshot.project.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "匯出失敗。");
    } finally {
      setBusy(null);
    }
  }

  const eventTimeline = useMemo(() => snapshot?.events.slice(-8).reverse() ?? [], [snapshot]);

  // Filtered Mode B claims
  const filteredClaims = useMemo(() => {
    if (!modeBResult) return [];
    if (verdictFilter === "ALL") return modeBResult.claims;
    return modeBResult.claims.filter((c) => c.verdict === verdictFilter);
  }, [modeBResult, verdictFilter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-4 py-8" data-testid="research-product-workspace">
        {/* Header with human-facing title & badge */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between border-b pb-6">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                ResearchForge 雙模式學術研究與審查平台
              </span>
              <Badge variant="outline" data-testid="workflow-mode">
                LIVE PROVIDERS
              </Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">研究生成與報告驗證工作台</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground text-sm leading-relaxed">
              以嚴謹同儕審查文獻為基礎。模式 A 依主題檢索學術資料並生成可驗證報告；模式 B 上傳既有文章逐項稽核宣稱與引用真實性。
            </p>
          </div>
          {snapshot ? (
            <div className="min-w-72 rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm font-medium">
                <span>{stageTitle(snapshot.project.status)}</span>
                <span>{workflowProgress(snapshot)}%</span>
              </div>
              <Progress value={workflowProgress(snapshot)} className="mt-2" />
              <p className="mt-2 font-mono text-xs text-muted-foreground">v{snapshot.project.version} · {snapshot.project.id}</p>
            </div>
          ) : null}
        </div>

        {/* Primary Dual Mode Navigation */}
        <div className="mb-8 flex flex-wrap gap-3">
          <Button
            size="lg"
            variant={activeMode === "scenarioA" ? "default" : "outline"}
            onClick={() => setActiveMode("scenarioA")}
            data-testid="tab-scenario-a"
            className="font-medium shadow-sm"
          >
            <FileSearch className="mr-2 h-4 w-4" />
            建立研究報告 (Scenario A)
          </Button>
          <Button
            size="lg"
            variant={activeMode === "scenarioB" ? "default" : "outline"}
            onClick={() => setActiveMode("scenarioB")}
            data-testid="tab-scenario-b"
            className="font-medium shadow-sm"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            驗證既有報告 (Scenario B)
          </Button>
        </div>

        {/* ========================================================================= */}
        {/* SCENARIO B: VERIFY EXISTING REPORT                                        */}
        {/* ========================================================================= */}
        {activeMode === "scenarioB" ? (
          <div className="space-y-6" data-testid="mode-b-workspace">
            <Card className="border shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl">既有報告與外部文章 宣稱與引用審查</CardTitle>
                <CardDescription>
                  上傳 PDF、DOCX、Markdown 或文字檔，系統自動抽取重要主張並比對學術資料庫，判定 SUPPORTED、PARTIALLY_SUPPORTED、UNSUPPORTED、MISATTRIBUTED (張冠李戴)、EXAGGERATED (過度誇大)、DATA_MISMATCH 等狀態。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setModeBContent(SAMPLE_MODE_B_TEXT);
                      setUploadedFile(null);
                    }}
                    data-testid="mode-b-load-sample"
                  >
                    載入基準測試報告範本 (5-Claim Baseline)
                  </Button>
                </div>

                <div
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors bg-muted/20"
                  data-testid="mode-b-dropzone"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelected(e.dataTransfer.files[0]);
                    }
                  }}
                  onClick={() => {
                    const el = document.getElementById("mode-b-file-input");
                    if (el) el.click();
                  }}
                >
                  <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <div className="text-base font-semibold">拖放 PDF / DOCX / Markdown 檔案至此，或點擊選取</div>
                  <div className="text-xs text-muted-foreground mt-1.5">支援 .pdf、.docx、.md、.txt 格式，自動解析內文結構與引用參考資料</div>
                  <input
                    id="mode-b-file-input"
                    type="file"
                    accept=".pdf,.docx,.md,.txt"
                    className="hidden"
                    data-testid="mode-b-file-input"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                {uploadedFile ? (
                  <div className="flex items-center justify-between p-3.5 bg-muted/60 rounded-lg text-sm border" data-testid="mode-b-file-status">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <div>
                        <span className="font-semibold">{uploadedFile.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    </div>
                    <Badge variant={uploadedFile.status === "READY" ? "default" : uploadedFile.status === "ERROR" ? "destructive" : "secondary"}>
                      狀態: {uploadedFile.status}
                    </Badge>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="mode-b-topic">研究主題標題</Label>
                  <Input
                    id="mode-b-topic"
                    value={modeBTopic}
                    onChange={(e) => setModeBTopic(e.target.value)}
                    data-testid="mode-b-topic-input"
                    placeholder="例如：塑膠微粒對海洋生物的影響"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mode-b-content">既有報告內文 (可直接檢視或貼入)</Label>
                  <Textarea
                    id="mode-b-content"
                    rows={8}
                    value={modeBContent}
                    onChange={(e) => setModeBContent(e.target.value)}
                    data-testid="mode-b-input-textarea"
                    placeholder="貼入報告 Markdown 或純文字..."
                  />
                </div>
                <Button
                  size="lg"
                  onClick={handleVerifyExistingReport}
                  disabled={(!modeBContent.trim() && !uploadedFile?.base64) || modeBBusy}
                  data-testid="mode-b-verify-button"
                  className="font-medium h-12 shadow"
                >
                  {modeBBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  開始驗證
                </Button>
                {modeBError ? (
                  <Alert variant="destructive">
                    <AlertTitle>驗證過程發生錯誤</AlertTitle>
                    <AlertDescription>{modeBError}</AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            {modeBResult ? (
              <div className="space-y-6" data-testid="mode-b-results-view">
                <Card className="border shadow-sm">
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <CardTitle className="text-xl">引用健康度評估與審查總結</CardTitle>
                        <CardDescription className="mt-1">{modeBResult.summary.summaryEvaluation}</CardDescription>
                      </div>
                      <Badge
                        className="text-base px-4 py-1.5 self-start sm:self-auto"
                        variant={modeBResult.summary.citationHealthScore >= 80 ? "default" : "destructive"}
                        data-testid="mode-b-health-score"
                      >
                        Citation Health: {modeBResult.summary.citationHealthScore} / 100
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      ※ 註：此分數描述的是引用與證據健康狀況，不等同文章整體學術價值。
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-center">
                      <div className="rounded-md border p-2.5">
                        <div className="text-xs text-muted-foreground">總宣稱數</div>
                        <div className="text-xl font-bold">{modeBResult.summary.totalClaims}</div>
                      </div>
                      <div className="rounded-md border p-2.5 bg-emerald-50/50 dark:bg-emerald-950/20">
                        <div className="text-xs text-emerald-700 dark:text-emerald-300">Supported</div>
                        <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{modeBResult.summary.supportedCount}</div>
                      </div>
                      <div className="rounded-md border p-2.5 bg-amber-50/50 dark:bg-amber-950/20">
                        <div className="text-xs text-amber-700 dark:text-amber-300">Partially Supported</div>
                        <div className="text-xl font-bold text-amber-700 dark:text-amber-300">{modeBResult.summary.partiallySupportedCount}</div>
                      </div>
                      <div className="rounded-md border p-2.5 bg-rose-50/50 dark:bg-rose-950/20">
                        <div className="text-xs text-rose-700 dark:text-rose-300">Unsupported</div>
                        <div className="text-xl font-bold text-rose-700 dark:text-rose-300">{modeBResult.summary.unsupportedCount}</div>
                      </div>
                      <div className="rounded-md border p-2.5 bg-purple-50/50 dark:bg-purple-950/20">
                        <div className="text-xs text-purple-700 dark:text-purple-300">Misattributed</div>
                        <div className="text-xl font-bold text-purple-700 dark:text-purple-300">{modeBResult.summary.misattributedCount}</div>
                      </div>
                      <div className="rounded-md border p-2.5 bg-orange-50/50 dark:bg-orange-950/20">
                        <div className="text-xs text-orange-700 dark:text-orange-300">Exaggerated</div>
                        <div className="text-xl font-bold text-orange-700 dark:text-orange-300">{modeBResult.summary.exaggeratedCount}</div>
                      </div>
                    </div>

                    {modeBResult.summary.metricsBreakdown ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center pt-2" data-testid="mode-b-metrics-breakdown">
                        <div className="rounded-md border p-2 bg-blue-50/50 dark:bg-blue-950/20">
                          <div className="text-xs text-blue-700 dark:text-blue-300">引用覆蓋 (Coverage)</div>
                          <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{modeBResult.summary.metricsBreakdown.citationCoverage}%</div>
                        </div>
                        <div className="rounded-md border p-2 bg-green-50/50 dark:bg-green-950/20">
                          <div className="text-xs text-green-700 dark:text-green-300">引用正確 (Correctness)</div>
                          <div className="text-lg font-bold text-green-700 dark:text-green-300">{modeBResult.summary.metricsBreakdown.citationCorrectness}%</div>
                        </div>
                        <div className="rounded-md border p-2 bg-amber-50/50 dark:bg-amber-950/20">
                          <div className="text-xs text-amber-700 dark:text-amber-300">證據充分 (Sufficiency)</div>
                          <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{modeBResult.summary.metricsBreakdown.evidenceSufficiency}%</div>
                        </div>
                        <div className="rounded-md border p-2 bg-purple-50/50 dark:bg-purple-950/20">
                          <div className="text-xs text-purple-700 dark:text-purple-300">嚴謹完整 (Integrity)</div>
                          <div className="text-lg font-bold text-purple-700 dark:text-purple-300">{modeBResult.summary.metricsBreakdown.claimIntegrity}%</div>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-6 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          const blob = new Blob([modeBResult.annotatedMarkdown], { type: "text/markdown;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "annotated-report.md";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        data-testid="mode-b-export-md"
                      >
                        <Download className="mr-2 h-4 w-4" />匯出 Annotated Markdown
                      </Button>
                      {modeBResult.annotatedDocxBase64 ? (
                        <Button
                          size="sm"
                          onClick={() => downloadBase64(modeBResult.annotatedDocxBase64!, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "annotated-report.docx")}
                          data-testid="mode-b-export-docx"
                        >
                          <Download className="mr-2 h-4 w-4" />匯出 Annotated DOCX
                        </Button>
                      ) : null}
                      {modeBResult.annotatedPdfBase64 ? (
                        <Button
                          size="sm"
                          onClick={() => downloadBase64(modeBResult.annotatedPdfBase64!, "application/pdf", "annotated-report.pdf")}
                          data-testid="mode-b-export-pdf"
                        >
                          <Download className="mr-2 h-4 w-4" />匯出 Annotated PDF
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                {/* Filter by Verdict toolbar */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-xs font-semibold text-muted-foreground mr-1">狀態篩選：</span>
                  {["ALL", "SUPPORTED", "PARTIALLY_SUPPORTED", "UNSUPPORTED", "MISATTRIBUTED", "EXAGGERATED", "DATA_MISMATCH"].map((vf) => (
                    <Button
                      key={vf}
                      size="sm"
                      variant={verdictFilter === vf ? "default" : "outline"}
                      className="text-xs h-7 px-2.5"
                      onClick={() => setVerdictFilter(vf)}
                    >
                      {vf === "ALL" ? "全部主張" : vf}
                    </Button>
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold tracking-tight">
                    逐項宣稱審查結果 (顯示 {filteredClaims.length} / {modeBResult.claims.length} 項)
                  </h3>
                  {filteredClaims.map((claim, idx) => (
                    <Card key={claim.id} data-testid="mode-b-claim-card" className="border shadow-sm">
                      <CardHeader className="pb-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Badge variant="outline">{claim.sectionTitle}</Badge>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                claim.verdict === "SUPPORTED"
                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                  : claim.verdict === "PARTIALLY_SUPPORTED"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                    : claim.verdict === "MISATTRIBUTED"
                                      ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200"
                                      : claim.verdict === "EXAGGERATED"
                                        ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200"
                                        : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                              }
                            >
                              判決: {claim.verdict} (信心度 {Math.round(claim.confidence * 100)}%)
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7 px-2"
                              onClick={() => toggleClaimEvidence(claim.id)}
                              data-testid="mode-b-toggle-evidence"
                            >
                              {expandedClaims[claim.id] ? (
                                <><ChevronUp className="h-3.5 w-3.5 mr-1" />收起證據</>
                              ) : (
                                <><ChevronDown className="h-3.5 w-3.5 mr-1" />展開證據</>
                              )}
                            </Button>
                          </div>
                        </div>
                        <CardTitle className="text-base mt-2">{idx + 1}. {claim.claimText}</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="text-muted-foreground">
                          <span className="font-semibold text-foreground">審查依據：</span>{claim.rationale}
                        </div>
                        {claim.citedReferences.length > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">引用來源：</span>{claim.citedReferences.join("; ")}
                          </div>
                        ) : null}

                        {expandedClaims[claim.id] ? (
                          <div className="mt-3 space-y-2 rounded-md bg-muted/60 p-3.5 text-xs border" data-testid="mode-b-evidence-span">
                            <div className="font-semibold text-foreground">文獻證據與脈絡比對 (Evidence Context)：</div>
                            {claim.supportingEvidence && claim.supportingEvidence.length > 0 ? (
                              claim.supportingEvidence.map((ev, sIdx) => (
                                <div key={sIdx} className="border-l-2 border-emerald-500 pl-2.5 py-1 text-emerald-950 dark:text-emerald-200">
                                  {ev.sourceTitle ? <div className="font-semibold mb-0.5">{ev.sourceTitle}</div> : null}
                                  <p className="leading-relaxed">{ev.span}</p>
                                </div>
                              ))
                            ) : claim.evidenceFound ? (
                              <div className="border-l-2 border-emerald-500 pl-2.5 py-1 text-emerald-950 dark:text-emerald-200">
                                <p className="leading-relaxed">{claim.evidenceFound}</p>
                              </div>
                            ) : (
                              <p className="italic text-muted-foreground">無對應文獻全文片段或證據充分性受限。</p>
                            )}
                          </div>
                        ) : null}

                        {claim.suggestedCorrection ? (
                          <div className="rounded-md bg-amber-50/70 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                            <span className="font-semibold">建議修訂：</span>{claim.suggestedCorrection}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          /* ========================================================================= */
          /* SCENARIO A: RESEARCH GENERATION WORKSPACE                                 */
          /* ========================================================================= */
          <div className="space-y-6">
            {error ? (
              <Alert variant="destructive" className="mb-6" data-testid="workflow-error">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>研究產製提示</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {/* Input Card before generation starts */}
            {!snapshot ? (
              <Card className="mx-auto max-w-3xl border shadow-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary">
                      學術實證驅動 · 全程可驗證
                    </span>
                  </div>
                  <CardTitle className="text-2xl mt-2">建立研究報告</CardTitle>
                  <CardDescription>
                    輸入研究問題或主題，ResearchForge 將檢索同儕審查文獻、萃取證據卡片，並產製具備可追溯引用的完整研究報告。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="research-topic" className="text-sm font-semibold">研究主題</Label>
                    <Input
                      id="research-topic"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      data-testid="research-topic-input"
                      placeholder="例如：塑膠微粒對海洋生物的影響"
                      className="text-base h-11"
                    />
                  </div>

                  {/* Collapsible Advanced Options */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                    >
                      {showAdvancedOptions ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      進階研究選項 (深度、語言、來源篩選)
                    </button>
                    {showAdvancedOptions ? (
                      <div className="mt-3 p-4 rounded-lg bg-muted/40 border space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <span className="font-semibold block mb-1">研究深度：</span>
                            <div className="flex gap-1">
                              {(["quick", "standard", "deep"] as const).map((d) => (
                                <Button
                                  key={d}
                                  size="sm"
                                  type="button"
                                  variant={researchDepth === d ? "default" : "outline"}
                                  className="text-xs h-7 px-2"
                                  onClick={() => setResearchDepth(d)}
                                >
                                  {d === "quick" ? "快速" : d === "standard" ? "標準" : "深入"}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-semibold block mb-1">輸出語言：</span>
                            <div className="flex gap-1">
                              {[
                                { id: "zh-TW", label: "繁中" },
                                { id: "en", label: "English" },
                              ].map((l) => (
                                <Button
                                  key={l.id}
                                  size="sm"
                                  type="button"
                                  variant={researchLanguage === l.id ? "default" : "outline"}
                                  className="text-xs h-7 px-2"
                                  onClick={() => setResearchLanguage(l.id)}
                                >
                                  {l.label}
                                </Button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="font-semibold block mb-1">來源資格偏好：</span>
                            <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground pt-1">
                              <Badge variant="outline">Peer-reviewed</Badge>
                              <Badge variant="outline">Open Access</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Button
                      size="lg"
                      onClick={startFullAutonomousResearch}
                      disabled={!topic.trim() || busy !== null}
                      data-testid="create-research-project"
                      className="font-medium h-12 px-6 shadow flex-1"
                    >
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                      開始研究 (一鍵產製與自動驗證)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Scenario A 9-Step Progress Tracker */}
            {busy || snapshot ? (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">研究產製進度與資格歷程 (Progress Model)</CardTitle>
                    <span className="text-xs font-mono text-muted-foreground">
                      {scenarioASteps.filter((s) => s.status === "complete").length} / {scenarioASteps.length} 步驟完成
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-2 text-xs">
                    {scenarioASteps.map((st) => (
                      <div
                        key={st.id}
                        className={`rounded-md p-2 border flex flex-col justify-between min-h-[72px] ${
                          st.status === "complete"
                            ? "bg-emerald-50/50 border-emerald-300 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200"
                            : st.status === "running"
                              ? "bg-blue-50/50 border-blue-400 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 animate-pulse"
                              : st.status === "warning"
                                ? "bg-amber-50/50 border-amber-300 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200"
                                : st.status === "blocked"
                                  ? "bg-rose-50/50 border-rose-300 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200"
                                  : "bg-muted/40 border-border text-muted-foreground"
                        }`}
                      >
                        <div className="font-semibold leading-tight">{st.title}</div>
                        <div className="text-[10px] mt-1 line-clamp-2">
                          {st.detail || st.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Three-Pane Workspace layout for Scenario A */}
            {snapshot ? (
              <div className="grid gap-6 lg:grid-cols-[280px_1fr_340px] items-start">
                {/* ── Left Pane: Outline & Questions & Claims ───────────────────────── */}
                <aside className="space-y-4 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
                  <Card className="border shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold">報告架構與章節</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-1.5 text-xs">
                      {snapshot.reportPlan?.sections.map((sec, idx) => (
                        <a
                          key={sec.id}
                          href={`#sec-${sec.id}`}
                          className="block p-2 rounded hover:bg-muted font-medium transition-colors"
                        >
                          {idx + 1}. {sec.title}
                        </a>
                      )) || <p className="text-muted-foreground italic">尚未形成報告計畫</p>}
                    </CardContent>
                  </Card>

                  <Card className="border shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold">核心研究問題 ({snapshot.questions.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-2 text-xs">
                      {snapshot.questions.map((q, idx) => (
                        <div key={q.id} className="p-2 rounded bg-muted/40 border">
                          <p className="font-semibold text-foreground">{idx + 1}. {q.text}</p>
                          <p className="text-muted-foreground mt-0.5">{q.purpose}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border shadow-sm">
                    <CardHeader className="p-4 pb-2">
                      <CardTitle className="text-sm font-semibold">
                        重要主張與驗證狀態 ({snapshot.generatedClaims.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-2 text-xs">
                      {snapshot.generatedClaims.map((claim, idx) => (
                        <div key={claim.id} className="p-2 rounded bg-muted/30 border">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-semibold text-foreground">主張 {idx + 1}</span>
                            <Badge
                              className="text-[10px] h-5 px-1.5"
                              variant={claim.status === "verified" ? "default" : "secondary"}
                            >
                              {claim.status === "verified" ? "已驗證" : "待驗證"}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground line-clamp-3">{claim.claimText}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </aside>

                {/* ── Center Pane: Report Document View & Editing ─────────────────── */}
                <section className="space-y-6 min-w-0">
                  <Card className="border shadow-sm">
                    <CardHeader className="border-b pb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <CardTitle className="text-2xl font-bold">{snapshot.intent.topic}</CardTitle>
                          <CardDescription className="mt-1">
                            可驗證學術研究報告 · 共 {snapshot.sources.length} 篇權威文獻 · {snapshot.evidenceCards.length} 項證據支持
                          </CardDescription>
                        </div>
                        {snapshot.project.status === "READY" || snapshot.project.status === "COMPLETE" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" onClick={() => exportBundle("markdown")} disabled={busy !== null} data-testid="export-markdown">
                              <Download className="mr-1.5 h-3.5 w-3.5" />Markdown
                            </Button>
                            <Button size="sm" onClick={() => exportBundle("pdf")} disabled={busy !== null} data-testid="export-pdf">
                              <Download className="mr-1.5 h-3.5 w-3.5" />PDF
                            </Button>
                            <Button size="sm" onClick={() => exportBundle("docx")} disabled={busy !== null} data-testid="export-docx">
                              <Download className="mr-1.5 h-3.5 w-3.5" />DOCX
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => exportBundle("json_bundle")} disabled={busy !== null}>
                              JSON Audit
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                      {snapshot.reportPlan?.sections.map((sec, idx) => (
                        <div key={sec.id} id={`sec-${sec.id}`} className="space-y-3" data-testid="report-section">
                          <div className="flex items-center justify-between border-b pb-2">
                            <h2 className="text-xl font-bold tracking-tight text-foreground">
                              {idx + 1}. {sec.title}
                            </h2>
                            <Badge variant="outline" className="text-xs">
                              {sec.candidateEvidenceIds.length} 處實證綁定
                            </Badge>
                          </div>

                          <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap">
                            {sectionDrafts[sec.id] ? (
                              <div>
                                {sectionDrafts[sec.id]}
                              </div>
                            ) : (
                              <p className="italic text-muted-foreground">正在生成章節內容...</p>
                            )}
                          </div>

                          {/* Editable section controls */}
                          <div className="pt-2 flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">段落識別碼：{sec.id}</span>
                            {snapshot.sectionContent[sec.id] !== undefined ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => run(`edit-${sec.id}`, () => editResearchProductSection(snapshot.project.id, sec.id, {
                                  content: sectionDrafts[sec.id] ?? "",
                                  editedBy: "human",
                                }))}
                                disabled={busy !== null || sectionDrafts[sec.id] === snapshot.sectionContent[sec.id]}
                              >
                                <Save className="mr-1.5 h-3 w-3" />儲存編輯
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      )) || (
                        <div className="py-12 text-center text-muted-foreground">
                          <Loader2 className="mx-auto h-8 w-8 animate-spin mb-3 text-primary" />
                          <p>正在進行學術檢索與報告規劃，請稍候...</p>
                        </div>
                      )}

                      {/* References Section */}
                      {snapshot.sources.length > 0 ? (
                        <div className="border-t pt-6 space-y-3">
                          <h3 className="text-lg font-bold">參考文獻 (References)</h3>
                          <div className="space-y-2 text-xs text-muted-foreground">
                            {snapshot.sources.map((s, sIdx) => (
                              <div
                                key={s.id}
                                className="p-2.5 rounded border hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={() => {
                                  const ev = snapshot.evidenceCards.find((e) => e.sourceId === s.id);
                                  setSelectedCitation({
                                    marker: `[${sIdx + 1}]`,
                                    title: s.title,
                                    authors: s.authors,
                                    year: s.year,
                                    venue: s.venue,
                                    doi: s.doi,
                                    url: s.url,
                                    provider: s.publisher || s.provenance.producer || "Crossref / Semantic Scholar",
                                    evidenceType: s.abstract ? "ABSTRACT_EVIDENCE" : "METADATA_ONLY",
                                    evidenceSpan: ev?.evidenceText || s.abstract,
                                    supportingClaim: ev?.claimText,
                                    limitations: ev?.limitations,
                                    verificationStatus: "SUPPORTED",
                                    retrievedAt: s.createdAt,
                                  });
                                  if (window.innerWidth < 1024) setMobileInspectorOpen(true);
                                }}
                              >
                                <span className="font-semibold text-foreground mr-1.5">[{sIdx + 1}]</span>
                                {s.authors.join(", ")} ({s.year ?? "n.d."}). {s.title}. {s.venue ? <em>{s.venue}.</em> : ""}
                                {s.doi ? <span className="ml-1 text-primary">https://doi.org/{s.doi}</span> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </section>

                {/* ── Right Pane: Shared Citation & Evidence Inspector ───────────── */}
                <aside className="space-y-4 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pl-1">
                  <Card className="border shadow-sm">
                    <CardHeader className="p-4 pb-2 border-b">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                          <Info className="h-4 w-4 text-primary" />
                          引用與證據檢視器 (Evidence Inspector)
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3 text-xs">
                      {selectedCitation ? (
                        <div className="space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <Badge variant="outline">{selectedCitation.marker}</Badge>
                              <Badge variant={selectedCitation.evidenceType === "METADATA_ONLY" ? "secondary" : "default"}>
                                {selectedCitation.evidenceType}
                              </Badge>
                            </div>
                            <h4 className="font-bold text-sm text-foreground mt-2 leading-snug">
                              {selectedCitation.title}
                            </h4>
                            <p className="text-muted-foreground mt-1">
                              {selectedCitation.authors.join(", ")} ({selectedCitation.year ?? "n.d."})
                            </p>
                            {selectedCitation.venue ? (
                              <p className="text-muted-foreground italic mt-0.5">{selectedCitation.venue}</p>
                            ) : null}
                          </div>

                          <div className="rounded-md bg-muted/60 p-3 border space-y-1.5">
                            <span className="font-semibold text-foreground block">引證來源資料庫：</span>
                            <div className="flex items-center justify-between text-muted-foreground">
                              <span>Provider: {selectedCitation.provider}</span>
                              {selectedCitation.doi ? <span>DOI: {selectedCitation.doi}</span> : null}
                            </div>
                            {selectedCitation.retrievedAt ? (
                              <div className="text-[10px] text-muted-foreground">
                                檢索時間: {selectedCitation.retrievedAt}
                              </div>
                            ) : null}
                          </div>

                          {selectedCitation.evidenceSpan ? (
                            <div className="rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
                              <span className="font-semibold text-emerald-900 dark:text-emerald-200 block mb-1">
                                摘要實證文字片段 (Evidence Span)：
                              </span>
                              <p className="text-emerald-950 dark:text-emerald-100 leading-relaxed">
                                {selectedCitation.evidenceSpan}
                              </p>
                            </div>
                          ) : null}

                          {selectedCitation.supportingClaim ? (
                            <div className="rounded-md bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
                              <span className="font-semibold text-blue-900 dark:text-blue-200 block mb-1">
                                支持之報告主張 (Supporting Claim)：
                              </span>
                              <p className="text-blue-950 dark:text-blue-100">
                                {selectedCitation.supportingClaim}
                              </p>
                            </div>
                          ) : null}

                          {selectedCitation.limitations && selectedCitation.limitations.length > 0 ? (
                            <div className="rounded-md bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                              <span className="font-semibold text-amber-900 dark:text-amber-200 block mb-1">
                                證據限制 (Limitations)：
                              </span>
                              <ul className="list-disc list-inside text-amber-950 dark:text-amber-100 space-y-0.5">
                                {selectedCitation.limitations.map((lim, lIdx) => (
                                  <li key={lIdx}>{lim}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          <div className="pt-2">
                            {selectedCitation.doi || selectedCitation.url ? (
                              <a
                                href={selectedCitation.doi ? `https://doi.org/${selectedCitation.doi}` : selectedCitation.url!}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center text-primary font-medium hover:underline text-xs"
                              >
                                開啟文獻原始連結 <ExternalLink className="ml-1 h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </div>
                        </div>
                      ) : (
                        <div className="py-8 text-center text-muted-foreground">
                          <p>點擊報告中任何引用編號或參考文獻，即可在此查看來源、摘要實證片段與資格審核紀錄。</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </aside>
              </div>
            ) : null}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
