import { useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { detectTopicCategory } from "@/lib/generateReport";
import { buildAcceptedSourceDigest } from "@/lib/sourceDigest";
import {
  buildExportReadinessWarnings,
  formatSourceAuthors,
  SOURCE_CATEGORY_LABELS,
  type SourceCategory,
} from "@/lib/sourceRecords";
import {
  loadReportWorkspace,
  regenerateReportWorkspace,
  reportWorkspacePath,
  saveReportWorkspace,
  workspaceToGeneratedReport,
  type ReportWorkspace,
} from "@/lib/reportWorkspace";
import {
  buildPlainText,
  downloadDocx,
  downloadJson,
  downloadMarkdown,
  downloadTxt,
  printPdf,
} from "@/lib/exportReport";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Copy,
  FileDown,
  FileType,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";

function sourceCategoryLabel(value: string | null | undefined): string {
  if (!value) return SOURCE_CATEGORY_LABELS.unknown;
  return SOURCE_CATEGORY_LABELS[value as SourceCategory] ?? value;
}

function sourceLocator(source: ReportWorkspace["acceptedSources"][number]): string {
  if (source.doi) return `DOI ${source.doi}`;
  if (!source.url) return "來源位置待確認";
  try {
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    return source.url;
  }
}

function formatWorkspaceTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function readinessLabel(readiness: ReportWorkspace["qualityReport"]["readiness"]): string {
  switch (readiness) {
    case "strong":
      return "可輸出正式草稿";
    case "usable":
      return "可用草稿";
    case "preliminary":
      return "初步草稿";
    case "insufficient":
    default:
      return "證據不足";
  }
}

function readinessBadgeVariant(readiness: ReportWorkspace["qualityReport"]["readiness"]): "default" | "secondary" | "outline" {
  if (readiness === "strong") return "default";
  if (readiness === "usable" || readiness === "preliminary") return "secondary";
  return "outline";
}

function ReportPreviewContent({ initialWorkspace }: { initialWorkspace: ReportWorkspace }) {
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const category = useMemo(
    () => detectTopicCategory(workspace.input.topic, workspace.input.reportType, workspace.input.purpose),
    [workspace.input.purpose, workspace.input.reportType, workspace.input.topic],
  );
  const exportReport = useMemo(() => workspaceToGeneratedReport(workspace, category), [category, workspace]);
  const exportWarnings = buildExportReadinessWarnings(exportReport);
  const acceptedSourceDigest = useMemo(
    () =>
      workspace.acceptedSourceDigest ??
      buildAcceptedSourceDigest(workspace.acceptedSources, {
        topic: workspace.input.topic,
      }),
    [workspace.acceptedSourceDigest, workspace.acceptedSources, workspace.input.topic],
  );
  const editPath = `/generator?reportId=${encodeURIComponent(workspace.id)}`;

  const warnExportReadiness = () => {
    if (exportWarnings.length === 0) return;
    toast({
      title: "引用準備度提醒",
      description: exportWarnings.map((warning) => warning.message).join(" "),
    });
  };

  const handleRegenerate = () => {
    setIsRegenerating(true);
    setTimeout(() => {
      const nextWorkspace = regenerateReportWorkspace(workspace);
      saveReportWorkspace(nextWorkspace);
      setWorkspace(nextWorkspace);
      setIsRegenerating(false);
      toast({ title: "已重新生成", description: "大綱、草稿與引用標記已依目前來源重新整理。" });
    }, 900);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildPlainText(exportReport, workspace.input));
    toast({ title: "已複製到剪貼簿", description: "報告純文字已複製。" });
  };

  const handleDownloadDocx = async () => {
    warnExportReadiness();
    try {
      await downloadDocx(exportReport, workspace.input);
      toast({ title: "已下載 Word（DOCX）", description: "Word 檔已儲存到你的裝置。" });
    } catch {
      toast({ title: "DOCX 產生失敗", description: "請稍後再試一次。", variant: "destructive" });
    }
  };

  const handlePrintPdf = () => {
    warnExportReadiness();
    const ok = printPdf(exportReport, workspace.input);
    toast(
      ok
        ? { title: "正在開啟列印視窗", description: "請在列印對話框選擇「另存為 PDF」。" }
        : { title: "無法開啟列印視窗", description: "請允許本網站開啟彈出視窗後再試一次。", variant: "destructive" },
    );
  };

  const handleMarkdown = () => {
    warnExportReadiness();
    downloadMarkdown(exportReport, workspace.input);
    toast({ title: "已下載 Markdown", description: "Markdown 檔已儲存。" });
  };

  const handleTxt = () => {
    warnExportReadiness();
    downloadTxt(exportReport, workspace.input);
    toast({ title: "已下載 TXT", description: "純文字檔已儲存。" });
  };

  const handleJson = () => {
    warnExportReadiness();
    downloadJson(exportReport, workspace.input);
    toast({ title: "已下載 JSON", description: "工作區資料已匯出。" });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-4 pb-12 pt-24">
        <div className="mb-5 rounded-lg border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={workspace.generationMode === "full_report" ? "default" : "secondary"}>
                  {workspace.generationMode === "full_report" ? "完整報告" : "快速草稿"}
                </Badge>
                <Badge variant="outline">{workspace.acceptedSources.length} 筆已接受來源</Badge>
                <Badge variant="outline">工作區 {workspace.id}</Badge>
              </div>
              <h1 className="truncate text-2xl font-bold text-foreground" title={workspace.draft.title}>
                {workspace.draft.title}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                大綱、草稿、來源與匯出集中在此頁；來源審查可返回生成器調整。
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <span className="block font-medium text-foreground">報告類型</span>
                  {workspace.input.reportType}
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <span className="block font-medium text-foreground">使用對象</span>
                  {workspace.input.targetAudience || workspace.input.academicLevel}
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <span className="block font-medium text-foreground">建立時間</span>
                  {formatWorkspaceTime(workspace.createdAt)}
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <span className="block font-medium text-foreground">更新時間</span>
                  {formatWorkspaceTime(workspace.updatedAt)}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={editPath}>
                <Button variant="outline" className="min-h-[40px]">
                  <Search className="mr-2 h-4 w-4" /> 編輯來源
                </Button>
              </Link>
              <Button onClick={handleRegenerate} disabled={isRegenerating} className="min-h-[40px]" data-testid="button-preview-regenerate">
                {isRegenerating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 重新生成中
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" /> 重新生成
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {isRegenerating && (
          <section className="mb-4 rounded-lg border border-border bg-card p-4" data-testid="preview-generation-progress">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">正在更新工作區</span>
              <span className="text-muted-foreground">大綱與草稿</span>
            </div>
            <Progress value={76} />
          </section>
        )}

        {exportWarnings.length > 0 && (
          <section className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{exportWarnings.map((warning) => warning.message).join(" ")}</span>
          </section>
        )}

        <section className="mb-5 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="preview-quality-report">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">品質檢查</h2>
              <p className="mt-1 text-xs text-muted-foreground">來源、證據卡與章節 grounding 的規則檢查結果。</p>
            </div>
            <Badge variant={readinessBadgeVariant(workspace.qualityReport.readiness)}>
              {readinessLabel(workspace.qualityReport.readiness)}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">已接受來源</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{workspace.qualityReport.acceptedSourceCount} 筆</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">證據卡</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{workspace.qualityReport.evidenceCardCount} 張</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">citation 警告</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{workspace.qualityReport.missingCitationWarnings.length} 項</p>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <p className="text-xs text-muted-foreground">過度推論</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{workspace.qualityReport.overclaimWarnings.length + workspace.qualityReport.unsupportedClaimWarnings.length} 項</p>
            </div>
          </div>
          {[
            ...workspace.qualityReport.missingCitationWarnings,
            ...workspace.qualityReport.unsupportedClaimWarnings,
            ...workspace.qualityReport.overclaimWarnings,
            ...workspace.qualityReport.topicDriftWarnings,
          ].length > 0 && (
            <ul className="mt-4 space-y-1.5 rounded-md border border-border bg-muted/20 px-3 py-3 text-xs leading-5 text-muted-foreground">
              {[
                ...workspace.qualityReport.missingCitationWarnings,
                ...workspace.qualityReport.unsupportedClaimWarnings,
                ...workspace.qualityReport.overclaimWarnings,
                ...workspace.qualityReport.topicDriftWarnings,
              ].map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-5 rounded-lg border border-primary/20 bg-card p-4 shadow-sm sm:p-5" data-testid="preview-source-digest">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">資料基礎摘要</h2>
              <p className="mt-1 text-xs text-muted-foreground">由已接受來源彙整，作為正式草稿前的資料理解基礎。</p>
            </div>
            <Badge variant="secondary">{workspace.acceptedSources.length} 筆來源</Badge>
          </div>
          <p className="text-sm leading-7 text-foreground/90">{acceptedSourceDigest.summary}</p>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <h3 className="text-sm font-semibold text-foreground">涵蓋面</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {acceptedSourceDigest.coverage.length ? (
                  acceptedSourceDigest.coverage.map((item) => (
                    <Badge key={item} variant="outline">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">尚未建立涵蓋面</span>
                )}
              </div>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <h3 className="text-sm font-semibold text-foreground">資料缺口</h3>
              <ul className="mt-2 space-y-1.5 text-xs leading-5 text-muted-foreground">
                {acceptedSourceDigest.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-border bg-background px-3 py-3">
              <h3 className="text-sm font-semibold text-foreground">下一步建議</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{acceptedSourceDigest.recommendedNextStep}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.35fr)] xl:items-start">
          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-card p-4" data-testid="preview-outline">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">報告大綱</h2>
                <Badge variant="outline">{workspace.outline.sections.length} 節</Badge>
              </div>
              <div className="space-y-2.5">
                {workspace.outline.sections.map((section) => (
                  <div key={section.sectionId} className="rounded-md border border-border bg-background px-3 py-3">
                    <p className="text-sm font-semibold text-foreground">{section.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{section.purpose}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4" data-testid="preview-evidence-summary">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">證據摘要</h2>
                <Badge variant="outline">{workspace.evidenceCards.length} 張</Badge>
              </div>
              <div className="space-y-2.5">
                {workspace.evidenceCards.slice(0, 6).map((card, index) => (
                  <article key={card.id} className="rounded-md border border-border bg-background px-3 py-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">證據 {index + 1}</Badge>
                      <Badge variant={card.derivation === "metadata-derived" ? "outline" : "secondary"}>
                        {card.derivation}
                      </Badge>
                      <Badge variant="outline">信心 {Math.round(card.confidenceScore * 100)}%</Badge>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium leading-6 text-foreground">{card.summary || card.evidence}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.sourceTitle}</p>
                    {card.limitation && (
                      <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">{card.limitation}</p>
                    )}
                  </article>
                ))}
                {workspace.evidenceCards.length > 6 && (
                  <p className="text-xs text-muted-foreground">另有 {workspace.evidenceCards.length - 6} 張證據卡保留於工作區資料。</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4" data-testid="preview-accepted-sources">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-foreground">已接受來源</h2>
                <Badge variant="outline">{workspace.acceptedSources.length} 筆</Badge>
              </div>
              <div className="space-y-3">
                {workspace.acceptedSources.map((source, index) => {
                  const title = source.title || "標題待確認";
                  return (
                    <article key={source.id || `${source.sourceType}-${index}`} className="rounded-md border border-border bg-background p-3.5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">來源 {index + 1}</Badge>
                        <Badge variant="secondary">{sourceCategoryLabel(source.sourceCategory)}</Badge>
                        <Badge variant="outline">可信度 {source.confidence ?? "中"}</Badge>
                      </div>
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={title}>{title}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        {formatSourceAuthors(source.authors)}・{source.year ?? "年份待確認"}・{sourceLocator(source)}
                      </p>
                      {source.reviewNotes && <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">筆記：{source.reviewNotes}</p>}
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-primary/25 bg-card p-4 shadow-sm" data-testid="preview-export-actions">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">匯出與下載</h2>
                  <p className="mt-1 text-xs text-muted-foreground">輸出正式交付檔，或複製純文字再自行排版。</p>
                </div>
                <Badge variant="secondary">可匯出</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Button size="sm" className="min-h-[42px] justify-start" onClick={handleDownloadDocx} data-testid="button-preview-export-docx">
                  <FileType className="mr-2 h-4 w-4" /> DOCX
                </Button>
                <Button size="sm" variant="outline" className="min-h-[42px] justify-start" onClick={handlePrintPdf} data-testid="button-preview-export-pdf">
                  <Printer className="mr-2 h-4 w-4" /> PDF
                </Button>
                <Button size="sm" variant="outline" className="min-h-[42px] justify-start" onClick={handleCopy} data-testid="button-preview-copy">
                  <Copy className="mr-2 h-4 w-4" /> 複製
                </Button>
                <Button size="sm" variant="outline" className="min-h-[42px] justify-start" onClick={handleMarkdown} data-testid="button-preview-export-md">
                  <FileDown className="mr-2 h-4 w-4" /> Markdown
                </Button>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="preview-draft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">生成草稿</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">內文中的（來源 N）為 inline citation markers。</p>
              </div>
              <Badge variant="outline">{workspace.draft.sections.length} 段</Badge>
            </div>
            <div className="mx-auto max-w-3xl space-y-5">
              {workspace.draft.sections.map((section) => (
                <article key={section.sectionId} className="rounded-md border border-border bg-background px-4 py-4 sm:px-5">
                  <h3 className="text-base font-semibold leading-6 text-foreground">{section.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{section.evidenceCardIds.length} 張證據</Badge>
                    <Badge variant="outline">{section.citationIds.length} 個 citation</Badge>
                    {section.warnings.slice(0, 2).map((warning) => (
                      <Badge key={warning} variant="secondary">{warning}</Badge>
                    ))}
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-foreground/90 sm:text-[15px] sm:leading-8">{section.body}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export function ReportPreview() {
  const [, reportMatch] = useRoute("/reports/:reportId");
  const [, previewMatch] = useRoute("/preview/:reportId");
  const reportId = reportMatch?.reportId ?? previewMatch?.reportId;
  const workspace = reportId ? loadReportWorkspace(reportId) : null;

  if (!workspace || !reportId) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <main className="container mx-auto max-w-3xl px-4 pb-12 pt-24">
          <section className="rounded-lg border border-border bg-card p-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">找不到報告工作區</h1>
            <p className="mt-2 text-sm text-muted-foreground">這個工作區可能尚未建立，或瀏覽器儲存資料已被清除。</p>
            <Link href="/generator">
              <Button className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> 回到生成器
              </Button>
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return <ReportPreviewContent initialWorkspace={workspace} />;
}
