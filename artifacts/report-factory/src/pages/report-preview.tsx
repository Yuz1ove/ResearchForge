import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { detectTopicCategory } from "@/lib/generateReport";
import {
  mergeLlmReportDraft,
  requestLlmReportDraft,
} from "@/lib/llmReportWriter";
import {
  ACCEPTED_SOURCE_DIGEST_VERSION,
  buildAcceptedSourceDigest,
} from "@/lib/sourceDigest";
import {
  buildExportReadinessWarnings,
  dedupeSourceRecords,
  formatSourceAuthors,
  normalizeSourceForReview,
  SOURCE_CATEGORY_LABELS,
  type SourceCategory,
} from "@/lib/sourceRecords";
import { applySourceAuthorityAndLanguage } from "@/lib/sourceAuthority";
import { applySourceRelevanceAssessments } from "@/lib/sourceRelevance";
import {
  loadReportWorkspace,
  regenerateReportWorkspace,
  saveReportWorkspace,
  workspaceSnapshotIsConsistent,
  workspaceToGeneratedReport,
  type ReportWorkspace,
} from "@/lib/reportWorkspace";
import {
  REPORT_FONT_INSTALL_NOTE,
  REPORT_FONT_OPTIONS,
  normalizeReportPresentation,
  reportFontOptionById,
  type ReportPresentationSettings,
} from "@/lib/reportPresentation";
import {
  previewWorkspaceMatchesContext,
  visibleReportSectionText,
} from "@/lib/reportPreviewGuards";
import {
  buildPlainText,
  downloadDocx,
  downloadMarkdown,
  printPdf,
} from "@/lib/exportReport";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Copy,
  FileDown,
  FileType,
  FileText,
  Printer,
  RefreshCw,
  Search,
  Shapes,
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

function paragraphRows(text: string, minimum = 5): number {
  const lines = text.split("\n").length;
  const estimated = Math.ceil(text.length / 36);
  return Math.max(minimum, Math.min(18, Math.max(lines, estimated)));
}

function digestSummaryNeedsRefresh(
  summary: string | null | undefined,
  version: number | null | undefined,
): boolean {
  const text = summary?.trim() ?? "";
  if (!text) return true;
  if (version !== ACCEPTED_SOURCE_DIGEST_VERSION) return true;
  return /資料類型主要包含|只能作為草稿前的資料基礎判斷|不適合被視為完整結論/u.test(text);
}

function evidenceCardsForSection(
  workspace: ReportWorkspace,
  section: ReportWorkspace["draft"]["sections"][number] | undefined,
) {
  if (!section) return [];
  const cardIds = new Set(section.evidenceCardIds);
  const cards = workspace.evidenceCards.filter((card) => cardIds.has(card.id));
  if (cards.length > 0) return cards;

  const sourceIds = new Set(section.citationIds);
  return workspace.evidenceCards.filter((card) => sourceIds.has(card.sourceId)).slice(0, 4);
}

function acceptedSourcesForSection(
  workspace: ReportWorkspace,
  section: ReportWorkspace["draft"]["sections"][number] | undefined,
) {
  if (!section) return [];
  const sourceIds = new Set(section.citationIds);
  return workspace.acceptedSources.filter((source) => source.id && sourceIds.has(source.id));
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

function llmStatusLabel(
  diagnostics: NonNullable<ReportWorkspace["llmDiagnostics"]>,
): string {
  if (!diagnostics.fallbackUsed) return "AI 強化完成";
  if (diagnostics.reportGenerationStatus === "timeout") return "已保留草稿";
  if (diagnostics.reportGenerationStatus === "quota_exceeded") return "稍後再試";
  if (diagnostics.reportGenerationStatus === "skipped") return "沿用現有草稿";
  return "已保留草稿";
}

function llmStatusMessage(
  diagnostics: NonNullable<ReportWorkspace["llmDiagnostics"]>,
): string {
  if (!diagnostics.fallbackUsed) {
    return "已使用 server-side Ollama 依已接受來源生成自然段落。";
  }
  const reason = diagnostics.message ?? diagnostics.fallbackReason ?? diagnostics.warning ?? "";
  if (diagnostics.reportGenerationStatus === "timeout") {
    return `本次 AI 強化逾時，但可編修草稿與來源依據都已保留。${reason}`.trim();
  }
  if (diagnostics.reportGenerationStatus === "quota_exceeded") {
    return `本次 AI 強化暫時不可用，但草稿已保留，可先直接編修。${reason}`.trim();
  }
  if (diagnostics.reportGenerationStatus === "skipped") {
    return `目前沿用可編修草稿，尚未額外套用 AI 強化。${reason}`.trim();
  }
  return `本次 AI 強化未完成，但草稿與來源依據已保留，可直接編修。${reason}`.trim();
}

function evidenceCardStatusLabel(card: ReportWorkspace["evidenceCards"][number]): string {
  if (card.abstractOnly) return "僅摘要";
  if (card.derivation === "metadata-derived") return "摘要不足";
  if (card.derivation === "fulltext-derived") return "片段可驗證";
  return "摘要可用";
}

function sourceStatusLabels(source: ReportWorkspace["acceptedSources"][number]): string[] {
  const labels = ["已接受", sourceCategoryLabel(source.sourceCategory)];
  if (source.topicalRelevanceLabel === "high") labels.push("高相關");
  if (source.topicalRelevanceLabel === "medium") labels.push("中相關");
  if (source.topicalRelevanceLabel === "low") labels.push("低相關");
  if (source.topicalRelevanceLabel === "irrelevant") labels.push("建議排除");
  if (source.evidenceSufficiency === "strong") labels.push("內容充足");
  if (source.evidenceSufficiency === "moderate") labels.push("有摘要可用");
  if (
    source.evidenceSufficiency === "weak" ||
    source.evidenceGrounding === "metadata_only" ||
    source.evidenceGrounding === "insufficient" ||
    !source.abstract
  ) {
    labels.push("證據不足");
  }
  if (source.usageRecommendation === "primary") labels.push("可作主要證據");
  if (source.usageRecommendation === "secondary") labels.push("可作補充來源");
  if (source.usageRecommendation === "reference") labels.push("僅供參考");
  if (source.usageRecommendation === "exclude") labels.push("建議排除");
  return Array.from(new Set(labels));
}

function sourceAbstractOnly(source: ReportWorkspace["acceptedSources"][number]): boolean {
  return !source.evidenceSnippets?.length;
}

function sourceMainClaim(source: ReportWorkspace["acceptedSources"][number]): string {
  return source.evidenceSnippets?.[0]?.reasoningZhTw
    ?? source.sourceRelevanceReasonZhTw
    ?? source.evidenceSummaryZhTw
    ?? source.llmSummaryZhTw
    ?? source.abstract
    ?? "目前尚未抽出可直接使用的主要主張。";
}

function sourceUsableEvidence(source: ReportWorkspace["acceptedSources"][number]): string {
  return source.evidenceSnippets?.[0]?.snippetZhTw
    ?? source.evidenceSummaryZhTw
    ?? source.llmSummaryZhTw
    ?? source.abstract
    ?? "目前只有書目或來源位置，尚不足以支撐正式論點。";
}

function sourceLimitations(source: ReportWorkspace["acceptedSources"][number]): string {
  if (sourceAbstractOnly(source)) {
    return "此來源目前多半只取得摘要或書目層級資訊，不能視為已完整閱讀全文。";
  }
  return source.reviewNotes?.trim() || "此來源已有可用片段，但仍需依正文需要確認引用邊界。";
}

type PreviewTopicUnderstanding = {
  normalizedTopic: string;
  entities: string[];
  likelyMeanings: string[];
  researchAngles: Array<{
    title: string;
    angle: string;
    reason: string;
    searchQueries: string[];
  }>;
};

function supplementalQueriesForGap(
  understanding: PreviewTopicUnderstanding,
  gap: string,
): string[] {
  const normalizedTopic = understanding.normalizedTopic.trim();
  const base = Array.from(
    new Set([
      ...understanding.researchAngles.flatMap((angle) => angle.searchQueries.slice(0, 2)),
      ...understanding.entities,
      ...understanding.likelyMeanings,
      normalizedTopic,
    ]),
  ).filter(Boolean);

  if (gap.includes("台灣")) {
    return base
      .slice(0, 4)
      .flatMap((query) => [`台灣 ${query}`.trim(), `${query} Taiwan`.trim()]);
  }
  if (gap.includes("統計")) {
    return base
      .slice(0, 4)
      .flatMap((query) => [`${query} 統計 調查`.trim(), `${query} dataset review`.trim()]);
  }
  if (gap.includes("反方")) {
    return base
      .slice(0, 4)
      .flatMap((query) => [`${query} limitation review`.trim(), `${query} 爭議 限制`.trim()]);
  }
  if (gap.includes("全文") || gap.includes("摘要")) {
    return base
      .slice(0, 4)
      .flatMap((query) => [`${query} systematic review`.trim(), `${query} academic article`.trim()]);
  }
  return base.slice(0, 8);
}

function workspaceMatchesRouteContext(workspace: ReportWorkspace): boolean {
  const params = new URLSearchParams(window.location.search);
  return previewWorkspaceMatchesContext(
    {
      workflowId: workspace.workflowId,
      topicHash: workspace.topicHash,
      isConsistent: workspaceSnapshotIsConsistent(workspace),
    },
    {
      workflowId: params.get("workflowId"),
      topicHash: params.get("topicHash"),
    },
  );
}

async function runSupplementalSearch(
  topic: string,
  gaps: string[],
): Promise<ReportWorkspace["supplementalSearchDiagnostics"]> {
  if (gaps.length === 0) {
    return {
      attempted: false,
      gaps: [],
      queries: [],
      rawResultCount: 0,
      filteredResultCount: 0,
      status: "skipped",
    };
  }

  let understanding: PreviewTopicUnderstanding = {
    normalizedTopic: topic.trim(),
    entities: [topic.trim()].filter(Boolean),
    likelyMeanings: [],
    researchAngles: [],
  };
  try {
    const understandingResponse = await fetch("/api/topic-understanding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });
    if (understandingResponse.ok) {
      understanding = await understandingResponse.json() as PreviewTopicUnderstanding;
    }
  } catch {
    // Keep generic fallback understanding.
  }

  const queries = Array.from(
    new Set(gaps.flatMap((gap) => supplementalQueriesForGap(understanding, gap))),
  ).slice(0, 8);
  const rawSources: ReportWorkspace["acceptedSources"] = [];

  for (const query of queries) {
    try {
      const response = await fetch("/api/search-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!response.ok) continue;
      const payload = await response.json() as { sources?: ReportWorkspace["acceptedSources"] };
      rawSources.push(...(payload.sources ?? []));
    } catch {
      continue;
    }
  }

  const filtered = applySourceRelevanceAssessments(
    applySourceAuthorityAndLanguage(
      dedupeSourceRecords(rawSources.map((source) => normalizeSourceForReview(source))),
    ),
    topic,
  ).filter((source) => source.relevanceLevel !== "off_topic");

  return {
    attempted: true,
    gaps,
    queries,
    rawResultCount: rawSources.length,
    filteredResultCount: filtered.length,
    status: filtered.length > 0 ? "attempted" : "insufficient",
  };
}

function ReportPreviewContent({ initialWorkspace }: { initialWorkspace: ReportWorkspace }) {
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(
    initialWorkspace.draft.sections.find((section) => section.sectionId !== "title")?.sectionId ??
      initialWorkspace.draft.sections[0]?.sectionId ??
      "",
  );
  const category = useMemo(
    () => detectTopicCategory(workspace.input.topic, workspace.input.reportType, workspace.input.purpose),
    [workspace.input.purpose, workspace.input.reportType, workspace.input.topic],
  );
  const exportReport = useMemo(() => workspaceToGeneratedReport(workspace, category), [category, workspace]);
  const exportWarnings = buildExportReadinessWarnings(exportReport);
  const generatedAcceptedSourceDigest = useMemo(
    () =>
      buildAcceptedSourceDigest(workspace.acceptedSources, {
        topic: workspace.input.topic,
      }),
    [workspace.acceptedSources, workspace.input.topic],
  );
  const acceptedSourceDigest = useMemo(
    () =>
      !workspace.acceptedSourceDigest ||
      digestSummaryNeedsRefresh(
        workspace.acceptedSourceDigest.summary,
        workspace.acceptedSourceDigest.version,
      )
        ? generatedAcceptedSourceDigest
        : workspace.acceptedSourceDigest,
    [generatedAcceptedSourceDigest, workspace.acceptedSourceDigest],
  );
  const editPath = `/generator?reportId=${encodeURIComponent(workspace.id)}`;
  const reportPreviewStyle = useMemo(
    () => ({
      fontFamily: workspace.presentation.fontFamily,
      fontSize: `${workspace.presentation.fontSizePx}px`,
      lineHeight: String(workspace.presentation.lineHeight),
    }),
    [workspace.presentation],
  );
  const activeSection = useMemo(
    () => workspace.draft.sections.find((section) => section.sectionId === activeSectionId) ?? workspace.draft.sections[0],
    [activeSectionId, workspace.draft.sections],
  );
  const activeEvidenceCards = useMemo(
    () => evidenceCardsForSection(workspace, activeSection),
    [activeSection, workspace],
  );
  const activeSources = useMemo(
    () => acceptedSourcesForSection(workspace, activeSection),
    [activeSection, workspace],
  );

  useEffect(() => {
    if (!workspace.draft.sections.some((section) => section.sectionId === activeSectionId)) {
      setActiveSectionId(
        workspace.draft.sections.find((section) => section.sectionId !== "title")?.sectionId ??
          workspace.draft.sections[0]?.sectionId ??
          "",
      );
    }
  }, [activeSectionId, workspace.draft.sections]);

  useEffect(() => {
    if (
      !workspace.acceptedSourceDigest ||
      digestSummaryNeedsRefresh(
        workspace.acceptedSourceDigest.summary,
        workspace.acceptedSourceDigest.version,
      )
    ) {
      persistWorkspace((current) => ({
        ...current,
        acceptedSourceDigest: generatedAcceptedSourceDigest,
      }));
    }
  }, [generatedAcceptedSourceDigest, workspace.acceptedSourceDigest]);

  const persistWorkspace = (updater: (current: ReportWorkspace) => ReportWorkspace) => {
    setWorkspace((current) => {
      const nextWorkspace = {
        ...updater(current),
        updatedAt: new Date().toISOString(),
      };
      saveReportWorkspace(nextWorkspace);
      return nextWorkspace;
    });
  };

  useEffect(() => {
    console.info("ResearchForge report pipeline diagnostics", {
      reportId: workspace.id,
      acceptedSources: workspace.acceptedSources.length,
      evidenceCards: workspace.evidenceCards.length,
      evidenceCardAbstractOnly: workspace.draft.debug?.evidenceCardAbstractOnly ?? [],
      sectionEvidenceMap: workspace.draft.sectionEvidenceMap ?? [],
      evidenceGaps: workspace.draft.debug?.evidenceGaps ?? [],
      supplementalSearch: workspace.supplementalSearchDiagnostics ?? null,
      paragraphPlans: workspace.draft.paragraphPlans ?? [],
      reportDraftGeneratedFromPlans:
        workspace.draft.debug?.reportDraftGeneratedFromPlans ?? false,
    });
  }, [workspace]);

  const updateDigestSummary = (summary: string) => {
    persistWorkspace((current) => ({
      ...current,
      acceptedSourceDigest: {
        ...current.acceptedSourceDigest,
        summary,
      },
    }));
  };

  const updatePresentation = (patch: Partial<ReportPresentationSettings>) => {
    persistWorkspace((current) => ({
      ...current,
      presentation: normalizeReportPresentation({
        ...current.presentation,
        ...patch,
      }),
    }));
  };

  const updateDraftSectionBody = (sectionId: string, body: string) => {
    persistWorkspace((current) => {
      const sections = current.draft.sections.map((section) =>
        section.sectionId === sectionId ? { ...section, body } : section,
      );
      return {
        ...current,
        draft: {
          ...current.draft,
          sections,
          text: sections
            .map((section) => `${section.title}\n${visibleReportSectionText(section)}`)
            .join("\n\n"),
        },
      };
    });
  };

  const warnExportReadiness = () => {
    if (exportWarnings.length === 0) return;
    toast({
      title: "引用準備度提醒",
      description: exportWarnings.map((warning) => warning.message).join(" "),
    });
  };

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const rebuiltWorkspace = regenerateReportWorkspace(workspace);
      const supplementalSearchDiagnostics = await runSupplementalSearch(
        rebuiltWorkspace.input.topic,
        rebuiltWorkspace.draft.debug?.evidenceGaps ?? rebuiltWorkspace.acceptedSourceDigest.gaps,
      );
      console.info("ResearchForge supplemental search diagnostics", supplementalSearchDiagnostics);
      const rebuiltWithSupplemental = {
        ...rebuiltWorkspace,
        supplementalSearchDiagnostics,
      };
      saveReportWorkspace(rebuiltWithSupplemental);
      setWorkspace(rebuiltWithSupplemental);

      const llmDraft = await requestLlmReportDraft({
        reportInput: rebuiltWithSupplemental.input,
        acceptedSources: rebuiltWithSupplemental.acceptedSources,
        evidenceCards: rebuiltWithSupplemental.evidenceCards,
        generationMode: rebuiltWithSupplemental.generationMode,
      });

      const mergedWorkspace = {
        ...mergeLlmReportDraft(rebuiltWithSupplemental, llmDraft),
        updatedAt: new Date().toISOString(),
      };

      saveReportWorkspace(mergedWorkspace);
      setWorkspace(mergedWorkspace);
      toast(
        llmDraft.ok
          ? {
              title: "已重新生成",
              description: "已使用本地 LLM 重新整理草稿與 diagnostics。",
            }
          : {
              title: "已重新整理草稿",
              description: "本次 AI 強化未完成，但可編修草稿與來源依據都已更新。",
            },
      );
    } catch {
      toast({
        title: "重新生成失敗",
        description: "請稍後再試一次。",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildPlainText(exportReport, workspace.input));
    toast({ title: "已複製到剪貼簿", description: "報告純文字已複製。" });
  };

  const handleDownloadDocx = async () => {
    warnExportReadiness();
    try {
      await downloadDocx(exportReport, workspace.input, workspace.presentation);
      toast({ title: "已下載 Word（DOCX）", description: "Word 檔已儲存到你的裝置。" });
    } catch {
      toast({ title: "DOCX 產生失敗", description: "請稍後再試一次。", variant: "destructive" });
    }
  };

  const handlePrintPdf = () => {
    warnExportReadiness();
    const ok = printPdf(exportReport, workspace.input, workspace.presentation);
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
                第三工作區先整理正式草稿與來源依據，第四工作區再調整字體、行距與匯出格式；來源審查可返回生成器調整。
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="outline">第三工作區：正式草稿</Badge>
                <Badge variant="outline">第四工作區：報告格式</Badge>
              </div>
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
              <h2 className="text-base font-semibold text-foreground">摘要</h2>
              <p className="mt-1 text-xs text-muted-foreground">先把已接受來源整合成可修改的工作摘要，再往下編修正式草稿。</p>
            </div>
            <Badge variant="secondary">{workspace.acceptedSources.length} 筆來源</Badge>
          </div>
          <Textarea
            value={acceptedSourceDigest.summary}
            onChange={(event) => updateDigestSummary(event.target.value)}
            rows={paragraphRows(acceptedSourceDigest.summary, 4)}
            className="resize-y border-border bg-background text-sm leading-7 text-foreground/90"
            data-testid="preview-source-digest-editor"
          />
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
          {workspace.supplementalSearchDiagnostics?.attempted ? (
            <div className="mt-4 rounded-md border border-border bg-background px-3 py-3 text-xs leading-5 text-muted-foreground">
              <p className="font-medium text-foreground">補查 diagnostics</p>
              <p className="mt-1">
                已針對 {workspace.supplementalSearchDiagnostics.gaps.length} 個缺口補查，
                共嘗試 {workspace.supplementalSearchDiagnostics.queries.length} 組 query，
                provider 回傳 {workspace.supplementalSearchDiagnostics.rawResultCount} 筆，
                經 relevance scoring 後保留 {workspace.supplementalSearchDiagnostics.filteredResultCount} 筆。
              </p>
              <p className="mt-1">
                {workspace.supplementalSearchDiagnostics.status === "insufficient"
                  ? "已補查但資料不足，缺口仍需保留。"
                  : "補查結果已重新進入 scoring，待你回到來源區決定是否接受。"}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="preview-draft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">生成草稿</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">左側查看本段落由哪些來源語句構成，中間直接改字，右側對照整體骨架。</p>
              </div>
              <Badge variant="outline">{workspace.draft.sections.length} 段</Badge>
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.45fr)_minmax(230px,0.8fr)] xl:items-start">
              <aside className="space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">段落依據</h3>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-3">
                  <p className="text-sm font-semibold text-foreground">{activeSection?.title ?? "尚未選取段落"}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {activeSection?.sectionGoal ?? "點選中間段落或右側骨架，即可查看這一段的來源構成。"}
                  </p>
                </div>
                {activeEvidenceCards.length > 0 ? (
                  activeEvidenceCards.map((card, index) => (
                    <article key={card.id} className="rounded-md border border-border bg-background px-3 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">語句依據 {index + 1}</Badge>
                        <Badge variant={card.derivation === "metadata-derived" ? "outline" : "secondary"}>
                          {evidenceCardStatusLabel(card)}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium leading-5 text-foreground">{card.sourceTitle}</p>
                      <p className="mt-2 text-xs font-medium leading-5 text-foreground">主要主張</p>
                      <p className="mt-1 text-sm leading-6 text-foreground/90">{card.mainClaim || card.summary}</p>
                      <p className="mt-2 text-xs font-medium leading-5 text-foreground">可用證據</p>
                      <p className="mt-1 text-sm leading-6 text-foreground/90">
                        {card.usableEvidence || card.quoteOrParaphrase || card.summary || card.evidence}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {card.citationText}・{card.pageOrLocation || "摘要整理"}
                      </p>
                      {card.limitation ? (
                        <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                          限制：{card.limitation}
                        </p>
                      ) : null}
                    </article>
                  ))
                ) : activeSources.length > 0 ? (
                  activeSources.map((source, index) => (
                    <article key={source.id || `${source.sourceType}-${index}`} className="rounded-md border border-border bg-background px-3 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">來源 {index + 1}</Badge>
                        {sourceStatusLabels(source).slice(0, 2).map((label) => (
                          <Badge key={label} variant={label === "已接受" ? "secondary" : "outline"}>
                            {label}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm font-medium leading-6 text-foreground">{source.title || "標題待確認"}</p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {source.evidenceSummaryZhTw || source.abstract || "目前只有書目線索，尚未抽出可驗證摘錄。"}
                      </p>
                    </article>
                  ))
                ) : (
                  <div className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-sm leading-6 text-muted-foreground">
                    這一段目前還沒有對應的證據卡。若要讓內容更穩，建議先回到生成區補來源或重新生成。
                  </div>
                )}
                {activeSection?.warnings.length ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                    {activeSection.warnings.join(" ")}
                  </div>
                ) : null}
              </aside>

              <div className="space-y-5" style={reportPreviewStyle}>
                {workspace.draft.sections.map((section) => {
                  const isActive = section.sectionId === activeSection?.sectionId;
                  return (
                    <article
                      key={section.sectionId}
                      className={`rounded-md border bg-background px-4 py-4 transition-colors sm:px-5 ${
                        isActive ? "border-primary shadow-sm" : "border-border"
                      }`}
                      onClick={() => setActiveSectionId(section.sectionId)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3
                            className={`text-foreground ${workspace.presentation.headingStyle === "modern" ? "text-[15px] font-semibold tracking-[0.02em] uppercase" : "text-base font-semibold leading-6"}`}
                          >
                            {section.title}
                          </h3>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.sectionGoal}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{section.evidenceCardIds.length} 張證據</Badge>
                          <Badge variant="outline">{section.citationIds.length} 個 citation</Badge>
                        </div>
                      </div>
                      <Textarea
                        value={visibleReportSectionText(section)}
                        onFocus={() => setActiveSectionId(section.sectionId)}
                        onChange={(event) => updateDraftSectionBody(section.sectionId, event.target.value)}
                        rows={paragraphRows(visibleReportSectionText(section), 6)}
                        className="mt-3 resize-y border-border bg-background text-sm text-foreground/90"
                        style={{
                          marginBottom: `${workspace.presentation.paragraphSpacingPx}px`,
                          lineHeight: workspace.presentation.lineHeight,
                        }}
                        data-testid={`draft-editor-${section.sectionId}`}
                      />
                    </article>
                  );
                })}
              </div>

              <aside className="space-y-3">
                <div className="flex items-center gap-2">
                  <Shapes className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">整體骨架</h3>
                </div>
                <div className="space-y-2.5">
                  {workspace.outline.sections.map((section) => {
                    const isActive = section.sectionId === activeSection?.sectionId;
                    return (
                      <button
                        key={section.sectionId}
                        type="button"
                        onClick={() => setActiveSectionId(section.sectionId)}
                        className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{section.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{section.purpose}</p>
                      </button>
                    );
                  })}
                </div>
              </aside>
            </div>
          </section>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.82fr)] xl:items-start">
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
                      {sourceStatusLabels(source).map((label) => (
                        <Badge key={label} variant={label === "已接受" ? "secondary" : "outline"}>
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground" title={title}>{title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                      {formatSourceAuthors(source.authors)}・{source.year ?? "年份待確認"}・{sourceLocator(source)}
                    </p>
                    <div className="mt-3 space-y-2 text-xs leading-5">
                      <div>
                        <p className="font-medium text-foreground">摘要</p>
                        <p className="mt-1 text-muted-foreground">
                          {source.llmSummaryZhTw || source.evidenceSummaryZhTw || source.abstract || "目前尚未整理出可用摘要。"}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">主要主張</p>
                        <p className="mt-1 text-muted-foreground">{sourceMainClaim(source)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">可用證據</p>
                        <p className="mt-1 text-muted-foreground">{sourceUsableEvidence(source)}</p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">限制</p>
                        <p className="mt-1 text-muted-foreground">{sourceLimitations(source)}</p>
                      </div>
                      <p className="text-muted-foreground">
                        abstractOnly: {sourceAbstractOnly(source) ? "true" : "false"}
                      </p>
                    </div>
                    {source.reviewNotes ? (
                      <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                        筆記：{source.reviewNotes}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-card p-4 shadow-sm" data-testid="preview-format-settings">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">第四工作區：報告格式</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {REPORT_FONT_INSTALL_NOTE} 草稿完成後，再在這裡調整字體、標題樣式與段落密度。
                  </p>
                </div>
                <Badge variant="outline">{reportFontOptionById(workspace.presentation.fontId).label}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>字體</Label>
                  <Select
                    value={workspace.presentation.fontId}
                    onValueChange={(value) => {
                      const option = reportFontOptionById(value as ReportPresentationSettings["fontId"]);
                      updatePresentation({ fontId: option.id, fontFamily: option.fontFamily });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPORT_FONT_OPTIONS.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>標題樣式</Label>
                  <Select
                    value={workspace.presentation.headingStyle}
                    onValueChange={(value) =>
                      updatePresentation({
                        headingStyle: value as ReportPresentationSettings["headingStyle"],
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">正式經典</SelectItem>
                      <SelectItem value="modern">簡潔現代</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="space-y-2">
                  <span className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>字級</span>
                    <span>{workspace.presentation.fontSizePx}px</span>
                  </span>
                  <input
                    type="range"
                    min={14}
                    max={22}
                    step={1}
                    value={workspace.presentation.fontSizePx}
                    onChange={(event) => updatePresentation({ fontSizePx: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>
                <label className="space-y-2">
                  <span className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>行距</span>
                    <span>{workspace.presentation.lineHeight.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={1.4}
                    max={2}
                    step={0.05}
                    value={workspace.presentation.lineHeight}
                    onChange={(event) => updatePresentation({ lineHeight: Number(event.target.value) })}
                    className="w-full"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-primary/25 bg-card p-4 shadow-sm" data-testid="preview-export-actions">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">匯出與下載</h2>
                  <p className="mt-1 text-xs text-muted-foreground">匯出會帶入目前頁面上已修改的摘要、草稿與格式設定。</p>
                </div>
                <Badge variant="secondary">可匯出</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
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

  if (workspace && !workspaceMatchesRouteContext(workspace)) {
    return (
      <div className="min-h-screen bg-muted/20">
        <Navbar />
        <main className="container mx-auto max-w-3xl px-4 pb-12 pt-24">
          <section className="rounded-lg border border-border bg-card p-6 text-center">
            <h1 className="text-xl font-semibold text-foreground">此報告不屬於目前工作流程</h1>
            <p className="mt-2 text-sm text-muted-foreground">工作流程、主題或來源快照不一致。請回到生成器重新搜尋並接受目前主題的來源後，再建立新的報告工作區。</p>
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
