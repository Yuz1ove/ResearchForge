/**
 * AI assistance disclosure: Portions of this evidence-bound preview workflow
 * were drafted or refactored with Replit Agent and OpenAI Codex. See
 * /AI_ASSISTANCE.md for the verification and disclosure details.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { useToast } from "@/hooks/use-toast";
import { detectTopicCategory } from "@/lib/generateReport";
import {
  applyDetailedReportSummary,
  buildDetailedReportParagraphs,
  type DetailedReportCitation,
} from "@/lib/detailedReport";
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
  formatSourceAuthors,
  SOURCE_CATEGORY_LABELS,
  type SourceCategory,
} from "@/lib/sourceRecords";
import { reportEvidenceCardsForAcceptedSources } from "@/lib/researchGrounding";
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
  sanitizeReaderFacingInternalLanguage,
  sectionRequiresExportReview,
  visibleReportSectionText,
} from "@/lib/reportPreviewGuards";
import {
  formalExportBlockReasons,
  previewLlmStatus,
} from "@/lib/reportPreviewStatus";
import {
  buildPlainText,
  downloadDocx,
  downloadMarkdown,
  downloadPdf,
  PdfExportError,
  REPORT_CJK_FONT_STACK,
} from "@/lib/exportReport";
import {
  formalReportSectionSequence,
  type FigureSpec,
  type FormalReportTable,
} from "@/lib/formalReportDocument";
import {
  baseAuthorYearCitationLabel,
  buildReaderCitationEntries,
  readerAcademicCitationMarker,
  stripReaderCitationTokens,
} from "@/lib/readerCitations";
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
  CheckCircle2,
  Loader2,
  XCircle,
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

function citationReaderLabel(citation: DetailedReportCitation): string {
  return citation.label || baseAuthorYearCitationLabel(citation.source);
}

function splitTerminalPunctuation(value: string): { body: string; punctuation: string } {
  const match = value.match(/^(.*?)([。！？!?]+)$/u);
  return match
    ? { body: match[1]!, punctuation: match[2]! }
    : { body: value, punctuation: "" };
}

function compactCitationDetail(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}…`
    : normalized;
}

function InlineCitationText({
  text,
  citations,
  displayMode,
  citationKeyPrefix,
  activeCitationKey,
  onToggle,
}: {
  text: string;
  citations: DetailedReportCitation[];
  displayMode: "compact" | "academic";
  citationKeyPrefix: string;
  activeCitationKey: string | null;
  onToggle: (citationKey: string, citation: DetailedReportCitation) => void;
}) {
  void citationKeyPrefix;
  void activeCitationKey;
  void onToggle;
  const cleanText = stripReaderCitationTokens(text);
  const { body, punctuation } = splitTerminalPunctuation(cleanText);
  const citationNumbers = Array.from(new Set(citations
    .map((citation) => Number.parseInt(citation.marker, 10))
    .filter((value) => Number.isInteger(value) && value > 0)))
    .sort((left, right) => left - right);
  const ranges: string[] = [];
  for (let index = 0; index < citationNumbers.length; index += 1) {
    const start = citationNumbers[index]!;
    let end = start;
    while (index + 1 < citationNumbers.length && citationNumbers[index + 1] === end + 1) {
      index += 1;
      end = citationNumbers[index]!;
    }
    ranges.push(start === end ? String(start) : `${start}\u2013${end}`);
  }
  const readerLabel = ranges.join(", ");
  const readerMarker = readerAcademicCitationMarker(citationNumbers);
  const firstCitation = citations[0];
  return (
    <>
      <span>{body}</span>
      {citations.length > 0 && firstCitation ? (
        <span className="citation-cluster ml-1 whitespace-nowrap text-[0.88em] font-semibold text-muted-foreground" aria-label={`資料來源 ${readerLabel}`} data-citation-display-mode={displayMode}>
          <a
            href={firstCitation.anchorId ? `#${firstCitation.anchorId}` : "#preview-report-references"}
            className="rounded-sm text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            title={`資料來源 ${readerLabel}`}
          >
            {readerMarker}
          </a>
        </span>
      ) : null}
      <span>{punctuation}</span>
    </>
  );
}

function InlineCitationSegments({
  segments,
  displayMode,
  citationKeyPrefix,
  activeCitationKey,
  onToggle,
}: {
  segments: Array<{ text: string; citations: DetailedReportCitation[] }>;
  displayMode: "compact" | "academic";
  citationKeyPrefix: string;
  activeCitationKey: string | null;
  onToggle: (citationKey: string, citation: DetailedReportCitation) => void;
}) {
  return <>{segments.map((segment, index) => (
    <InlineCitationText
      key={`${citationKeyPrefix}-segment-${index}`}
      text={segment.text}
      citations={segment.citations}
      displayMode={displayMode}
      citationKeyPrefix={`${citationKeyPrefix}-segment-${index}`}
      activeCitationKey={activeCitationKey}
      onToggle={onToggle}
    />
  ))}</>;
}

function InlineCitationDetail({
  citationKey,
  citation,
  evidenceCards,
}: {
  citationKey: string;
  citation: DetailedReportCitation;
  evidenceCards: ReportWorkspace["evidenceCards"];
}) {
  const card = evidenceCards.find((item) => item.sourceId === citation.source.id);
  const supportSpan = compactCitationDetail(card ? evidenceSupportSpan(card) : "", 520);
  const claim = compactCitationDetail(
    card?.claimText ?? card?.mainClaimZhTw ?? card?.mainClaim ?? card?.summary ?? "",
    320,
  );
  return (
    <aside
      id={`${citationKey}-detail`}
      className="rounded-md border border-primary/20 bg-primary/[0.035] px-3 py-3 text-xs leading-5 text-foreground sm:px-4"
      data-testid="inline-citation-detail"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{citationReaderLabel(citation)}</Badge>
        <Badge variant="secondary">{sourceReadableStatusLabel(citation.source)}</Badge>
      </div>
      <p className="mt-2 font-semibold leading-5">{citation.source.title || "標題待確認"}</p>
      <p className="mt-1 text-muted-foreground">
        {formatSourceAuthors(citation.source.authors)}・{citation.source.year ?? "年份待確認"}
        {citation.source.doi ? `・DOI ${citation.source.doi}` : ""}
      </p>
      {claim ? <p className="mt-2"><span className="font-medium">支持主張：</span>{claim}</p> : null}
      {supportSpan ? <p className="mt-2"><span className="font-medium">來源支持片段：</span>{supportSpan}</p> : null}
      {citation.href || citation.source.url ? (
        <a
          href={citation.href || citation.source.url || undefined}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex font-medium text-primary underline underline-offset-2"
        >
          開啟 DOI／來源頁
        </a>
      ) : null}
    </aside>
  );
}

function FormalTablePreview({ table }: { table: FormalReportTable }) {
  return (
    <figure className="mt-4" data-testid={`formal-table-${table.number}`}>
      <figcaption className="mb-2 text-sm font-semibold text-foreground">
        表 {table.number}　{table.title}
      </figcaption>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[580px] table-fixed border-collapse text-left text-xs leading-5">
          <thead className="bg-primary text-primary-foreground">
            <tr>{table.columns.map((column) => <th key={column} className="border-r border-primary-foreground/20 px-3 py-2 last:border-r-0">{column}</th>)}</tr>
          </thead>
          <tbody>{table.rows.map((row, rowIndex) => (
            <tr key={`${table.number}-${rowIndex}`} className="border-t border-border odd:bg-muted/20">
              {table.columns.map((_, columnIndex) => <td key={`${rowIndex}-${columnIndex}`} className="border-r border-border px-3 py-2 align-top last:border-r-0">{row[columnIndex] ?? ""}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {table.units ? <p className="mt-2 text-xs text-muted-foreground">單位：{table.units}</p> : null}
      {table.legend ? <p className="mt-1 text-xs text-muted-foreground">圖例：{table.legend}</p> : null}
      <p className="mt-2 text-xs italic text-muted-foreground">資料來源：{table.sourceNote}</p>
      {table.note ? <p className="mt-1 text-xs text-muted-foreground">註：{table.note}</p> : null}
      <p className="sr-only">文字摘要：{table.altText}</p>
    </figure>
  );
}

function FormalFigurePreview({ figure }: { figure: FigureSpec }) {
  const data = figure.data;
  const semantic = figure.semanticData;
  const visual = semantic?.kind === "proportion_facets" ? (
    <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2" data-semantic-visual="proportion_facets">
      {semantic.panels.map((panel) => (
        <div key={panel.datumKey} className="rounded border border-border bg-muted/10 p-3">
          <div className="flex items-start justify-between gap-2 text-xs"><strong>{panel.label}</strong><span className="tabular-nums">{panel.value}%</span></div>
          <div className="relative my-4 h-px bg-border" aria-label={`0 至 100%，點估計 ${panel.value}%`}>
            <span className="absolute -top-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background bg-primary" style={{ left: `${Math.max(0, Math.min(100, panel.value))}%` }} />
            <span className="absolute top-2 left-0 text-[9px] text-muted-foreground">0</span>
            <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">50</span>
            <span className="absolute top-2 right-0 text-[9px] text-muted-foreground">100%</span>
          </div>
          <div className="h-3" />
          <p className="text-[11px] leading-5 text-muted-foreground">{panel.metric}｜{panel.sampleDefinition}</p>
        </div>
      ))}
    </div>
  ) : semantic?.kind === "forest_plot" ? (() => {
    const bounds = semantic.rows.flatMap((row) => [row.lowerBound, row.upperBound, semantic.referenceValue]).filter((value) => value > 0);
    const minimum = Math.min(...(bounds.length > 0 ? bounds : [0.5]));
    const maximum = Math.max(...(bounds.length > 0 ? bounds : [2]));
    const logMinimum = Math.log(minimum);
    const logRange = Math.max(0.000001, Math.log(maximum) - logMinimum);
    const position = (value: number) => Math.max(0, Math.min(100, ((Math.log(value) - logMinimum) / logRange) * 100));
    const referencePosition = position(semantic.referenceValue);
    return (
      <div className="space-y-3 rounded-md border border-border p-3" data-semantic-visual="forest_plot">
        {semantic.rows.map((row) => {
          const lower = position(row.lowerBound);
          const upper = position(row.upperBound);
          const estimate = position(row.estimate);
          return (
            <div key={row.datumKey} className="grid grid-cols-[minmax(90px,1fr)_minmax(160px,2fr)] gap-x-3 gap-y-1 text-xs sm:grid-cols-[minmax(90px,1fr)_minmax(180px,2fr)_minmax(130px,1fr)]">
              <span>{row.label}</span>
              <span className="relative h-5 bg-muted/40">
                <i className="absolute inset-y-0 border-l border-dashed border-amber-700" style={{ left: `${referencePosition}%` }} />
                <i className="absolute top-[9px] h-0.5 bg-primary" style={{ left: `${lower}%`, width: `${Math.max(1, upper - lower)}%` }} />
                <b className="absolute top-[5px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-primary" style={{ left: `${estimate}%` }} />
              </span>
              <span className="col-start-2 tabular-nums text-muted-foreground sm:col-start-3">OR {row.estimate} （{row.lowerBound}–{row.upperBound}）</span>
            </div>
          );
        })}
      </div>
    );
  })() : semantic?.kind === "correlation_structure" ? (() => {
    const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
    return (
      <div className="space-y-2 rounded-md border border-border p-3" data-semantic-visual="correlation_structure">
        {semantic.links.map((link) => <div key={link.datumKey} className="grid grid-cols-[1fr_72px_1fr] items-center gap-2 text-center text-xs"><span className="rounded border border-border bg-muted/30 p-2">{labelById.get(link.from) ?? link.from}</span><strong className="flex flex-col">↔<small className="font-normal text-muted-foreground">r = {link.value}</small></strong><span className="rounded border border-border bg-muted/30 p-2">{labelById.get(link.to) ?? link.to}</span></div>)}
      </div>
    );
  })() : semantic?.kind === "mediation_path" ? (() => {
    const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
    return (
      <div className="space-y-2 rounded-md border border-border p-3" data-semantic-visual="mediation_path">
        {semantic.edges.map((edge) => <div key={edge.datumKey} className="grid grid-cols-[1fr_minmax(74px,.8fr)_1fr] items-center gap-2 text-center text-xs"><span className="rounded border border-border bg-muted/30 p-2">{labelById.get(edge.from) ?? edge.from}</span><strong className="flex flex-col">→<small className="font-normal text-muted-foreground">{edge.label}</small></strong><span className="rounded border border-border bg-muted/30 p-2">{labelById.get(edge.to) ?? edge.to}</span></div>)}
      </div>
    );
  })() : semantic?.kind === "evidence_coverage" ? (
    <div className="overflow-x-auto rounded-md border border-border" data-semantic-visual="evidence_coverage"><table className="w-full table-fixed text-xs"><thead className="bg-primary text-primary-foreground"><tr><th className="px-3 py-2 text-left">證據範圍</th><th className="w-28 px-3 py-2 text-center">來源數</th></tr></thead><tbody>{[...semantic.dimensions, semantic.intersection].map((item) => <tr key={item.datumKey} className="border-t border-border"><td className="px-3 py-2">{item.label}</td><td className="px-3 py-2 text-center tabular-nums">{item.count ?? "—"}</td></tr>)}</tbody></table></div>
  ) : semantic?.kind === "applicability_boundary" ? (
    <div className="overflow-x-auto rounded-md border border-border" data-semantic-visual="applicability_boundary"><table className="w-full min-w-[480px] table-fixed text-xs"><thead className="bg-primary text-primary-foreground"><tr><th className="px-3 py-2 text-left">適用群體／情境</th><th className="w-24 px-3 py-2 text-center">來源數</th><th className="px-3 py-2 text-left">可支持的用途</th></tr></thead><tbody>{semantic.groups.map((group) => <tr key={group.datumKey} className="border-t border-border"><td className="px-3 py-2">{group.label}</td><td className="px-3 py-2 text-center tabular-nums">{group.count ?? "—"}</td><td className="px-3 py-2">{group.use}</td></tr>)}</tbody></table></div>
  ) : data.kind === "categorical_bar" ? (() => {
    const maxValue = Math.max(1, ...data.categories.map((item) => item.value));
    return (
      <div className="space-y-2 rounded-md border border-border p-3">
        {data.categories.map((item) => (
          <div key={item.key} className="grid grid-cols-[minmax(100px,1.2fr)_3fr_32px] items-center gap-2 text-xs">
            <span>{item.label}</span>
            <span className="h-3 overflow-hidden rounded-sm bg-muted"><span className="block h-full bg-primary" style={{ width: `${item.value === 0 ? 0 : Math.max(4, (item.value / maxValue) * 100)}%` }} /></span>
            <strong className="text-right tabular-nums">{item.value}</strong>
          </div>
        ))}
      </div>
    );
  })() : data.kind === "matrix" ? (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[480px] table-fixed border-collapse text-xs">
        <thead className="bg-primary text-primary-foreground"><tr><th className="px-3 py-2 text-left">範圍</th>{data.columns.map((column) => <th key={column} className="px-3 py-2 text-center">{column}</th>)}</tr></thead>
        <tbody>{data.rows.map((row) => <tr key={row.label} className="border-t border-border"><th className="bg-muted/30 px-3 py-2 text-left">{row.label}</th>{row.values.map((value, index) => <td key={`${row.label}-${index}`} className="border-l border-border px-3 py-2 text-center">{value}</td>)}</tr>)}</tbody>
      </table>
    </div>
  ) : (
    <ol className="grid list-none gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
      {data.nodes.map((node, index) => (
        <li key={node.id} className="relative border-t-2 border-primary bg-muted/20 px-3 py-3 text-xs leading-5">
          <span className="mb-1 block text-[10px] font-semibold tracking-[0.12em] text-amber-700">{String(index + 1).padStart(2, "0")}</span>
          <strong className="font-medium">{node.label}</strong>
          {index < data.nodes.length - 1 ? <span className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-primary lg:block">→</span> : null}
        </li>
      ))}
    </ol>
  );
  return (
    <figure className="mt-4" aria-label={figure.altText} data-testid={`formal-figure-${figure.number}`}>
      <figcaption className="mb-2 text-sm font-semibold text-foreground">圖 {figure.number}　{figure.title}</figcaption>
      {visual}
      {semantic?.kind === "proportion_facets" ? <p className="mt-2 border-l-2 border-amber-600 bg-amber-50 px-2 py-1 text-xs text-amber-900">解讀邊界：各面板保留原研究樣本與判定定義，不直接排名或合併。</p> : null}
      {semantic?.kind === "forest_plot" ? <p className="mt-2 border-l-2 border-amber-600 bg-amber-50 px-2 py-1 text-xs text-amber-900">解讀邊界：OR 以 1 為基準線，不做合併或排名。</p> : null}
      {semantic?.kind === "correlation_structure" ? <p className="mt-2 border-l-2 border-amber-600 bg-amber-50 px-2 py-1 text-xs text-amber-900">解讀邊界：r 不轉換成百分比，也不解讀為因果。</p> : null}
      {semantic?.kind === "mediation_path" ? <p className="mt-2 border-l-2 border-amber-600 bg-amber-50 px-2 py-1 text-xs text-amber-900">解讀邊界：省略未能完整核對的係數，路徑不代表已證實的因果。</p> : null}
      {figure.units ? <p className="mt-2 text-xs text-muted-foreground">單位：{figure.units}</p> : null}
      {figure.legend.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">圖例：{figure.legend.map((item) => `${item.key}＝${item.label}`).join("；")}</p> : null}
      <p className="mt-1 text-xs italic text-muted-foreground">資料來源：{figure.sourceNote}</p>
      {figure.note ? <p className="mt-1 text-xs text-muted-foreground">註：{figure.note}</p> : null}
      <p className="sr-only">文字摘要：{figure.altText}</p>
    </figure>
  );
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

function sourceHasVerifiableReportText(
  source: ReportWorkspace["acceptedSources"][number],
): boolean {
  const record = source as ReportWorkspace["acceptedSources"][number] & Record<string, unknown>;
  return Boolean(
    source.abstract?.trim() ||
    source.originalAbstract?.trim() ||
    source.abstractOriginal?.trim() ||
    (typeof record.extractedAbstract === "string" && record.extractedAbstract.trim()) ||
    (Array.isArray(record.extractedChunks) && record.extractedChunks.length > 0),
  );
}

function recoverReportEvidenceCards(workspace: ReportWorkspace) {
  const acceptedSourceIds = new Set(workspace.acceptedSources.map((source) => source.id));
  const existingCards = workspace.evidenceCards.filter((card) =>
    acceptedSourceIds.has(card.sourceId),
  );
  const recoveredCards = reportEvidenceCardsForAcceptedSources({
    acceptedSources: workspace.acceptedSources.filter(sourceHasVerifiableReportText),
    groundingEvidenceCards: [],
    topic: workspace.input.topic,
  });
  return Array.from(
    new Map(
      [...existingCards, ...recoveredCards].map((card) => [card.id, card] as const),
    ).values(),
  );
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

function evidenceCardStatusLabel(card: ReportWorkspace["evidenceCards"][number]): string {
  if (card.sourceAccessLevel === "full_text") return "全文片段";
  if (card.sourceAccessLevel === "abstract_only") return "僅摘要";
  if (card.sourceAccessLevel === "metadata_only") return "僅書目資訊";
  if (card.sourceAccessLevel === "failed_extraction") return "內容擷取失敗";
  if (card.abstractOnly) return "僅摘要";
  if (card.derivation === "metadata-derived") return "摘要不足";
  if (card.derivation === "fulltext-derived") return "片段可驗證";
  return "摘要可用";
}

function sourceReadableStatusLabel(source: ReportWorkspace["acceptedSources"][number]): string {
  switch (source.accessLevel) {
    case "full_text":
      return "可核對全文";
    case "abstract_only":
      return "僅摘要";
    case "metadata_only":
      return "僅書目資訊";
    case "blocked_or_paywalled":
      return "需人工複核";
    case "failed_extraction":
      return "內容擷取失敗";
    default:
      return source.abstract ? "僅摘要" : "僅書目資訊";
  }
}

function extractionStatusLabel(value: string | null | undefined): string {
  switch (value) {
    case "text_extracted":
    case "grobid_extracted":
    case "ocr_extracted":
      return "已取得可讀內容";
    case "metadata_only":
    case "extraction_skipped_no_full_text":
      return "目前僅有摘要或書目資訊";
    case "failed":
    case "extraction_failed":
    case "extraction_unavailable_no_parser":
    case "failed_extraction":
      return "內容擷取失敗";
    case "pending":
      return "待整理";
    default:
      return value ? sanitizeReaderFacingInternalLanguage(value) : "尚未整理";
  }
}

function extractionMethodLabel(value: string | null | undefined): string {
  switch (value) {
    case "rule_fallback_claim_extraction":
    case "rule_fallback":
      return "規則輔助整理";
    case "llm":
    case "llm_claim_extraction":
      return "模型輔助整理";
    case "grobid":
    case "grobid_extracted":
      return "學術文件文字擷取";
    case "ocr":
    case "ocr_extracted":
      return "影像文字辨識";
    default:
      return value ? sanitizeReaderFacingInternalLanguage(value) : "尚未整理";
  }
}

function sourceExtractionDetails(source: ReportWorkspace["acceptedSources"][number]): string[] {
  const details: string[] = [];
  if (source.extractionStatus) details.push(`內容狀態：${extractionStatusLabel(source.extractionStatus)}`);
  if (source.extractionMode) details.push(`整理方式：${extractionMethodLabel(source.extractionMode)}`);
  if (source.extractionMethod) details.push(`擷取方式：${extractionMethodLabel(source.extractionMethod)}`);
  if (typeof source.fullTextCharCount === "number" && source.fullTextCharCount > 0) {
    details.push(`全文字數：${source.fullTextCharCount.toLocaleString()}`);
  }
  const sectionCount = source.extractedSections?.length ?? 0;
  const chunkCount = source.extractedChunks?.length ?? 0;
  if (sectionCount > 0 || chunkCount > 0) {
    details.push(`可用段落：${sectionCount}；證據摘錄：${chunkCount}`);
  }
  if (typeof source.claimCount === "number") {
    details.push(`可用主張：${source.acceptedClaimCount ?? 0}/${source.claimCount}`);
  }
  if (typeof source.acceptedEvidenceCardCount === "number") {
    details.push(`引用依據：${source.acceptedEvidenceCardCount}`);
  }
  return details;
}

function sourceExtractionWarnings(source: ReportWorkspace["acceptedSources"][number]): string {
  return sanitizeReaderFacingInternalLanguage([
    ...(source.extractionWarnings ?? []),
    ...(source.claimExtractionWarnings ?? []),
    source.userFacingMessage ?? "",
    source.failureReason ?? "",
  ].filter(Boolean).join("；"));
}

function evidenceCoverageLabel(
  status: ReportWorkspace["draft"]["sections"][number]["evidenceCoverageStatus"] | undefined,
): string {
  switch (status) {
    case "sufficient":
      return "來源充足";
    case "weak":
      return "部分充足";
    case "insufficient":
    default:
      return "來源不足";
  }
}

function evidenceCoverageBadgeVariant(
  status: ReportWorkspace["draft"]["sections"][number]["evidenceCoverageStatus"] | undefined,
): "default" | "secondary" | "outline" {
  if (status === "sufficient") return "default";
  if (status === "weak") return "secondary";
  return "outline";
}

function groundingStatusLabel(
  status: ReportWorkspace["draft"]["sections"][number]["groundingStatus"] | undefined,
  generationMethod?: string,
  warnings: string[] = [],
): string {
  if (generationMethod === "grounding_verifier_blocked") return "引用支撐不足";
  if (generationMethod === "insufficient_evidence_notice") return "證據不足";
  if (generationMethod === "needs_manual_review" || warnings.includes("needs_manual_review")) return "待人工複核";
  if (generationMethod === "extraction_failed") return "內容擷取失敗";
  if (status === "grounded") return "引用已核對";
  if (status === "partially_grounded") return "部分引用待補";
  return "證據不足";
}

function groundingStatusBadgeVariant(
  status: ReportWorkspace["draft"]["sections"][number]["groundingStatus"] | undefined,
  generationMethod?: string,
  warnings: string[] = [],
): "default" | "secondary" | "outline" {
  if (generationMethod === "grounding_verifier_blocked" || generationMethod === "insufficient_evidence_notice") return "outline";
  if (generationMethod === "needs_manual_review" || warnings.includes("needs_manual_review")) return "secondary";
  if (status === "grounded") return "default";
  if (status === "partially_grounded") return "secondary";
  return "outline";
}

function evidenceSupportSpan(card: ReportWorkspace["evidenceCards"][number]): string {
  return card.supportSpan ??
    card.supportSpans?.[0]?.text ??
    card.supportedByText ??
    card.usableEvidence ??
    card.evidence ??
    "";
}

function sourceStatusLabels(source: ReportWorkspace["acceptedSources"][number]): string[] {
  const labels = ["已接受", sourceCategoryLabel(source.sourceCategory), sourceReadableStatusLabel(source)];
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

function ReportPreviewContent({ initialWorkspace }: { initialWorkspace: ReportWorkspace }) {
  const { toast } = useToast();
  const [workspace, setWorkspace] = useState(() =>
    applyDetailedReportSummary(initialWorkspace),
  );
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationStage, setRegenerationStage] = useState<
    "idle" | "rebuilding" | "drafting" | "saving" | "completed" | "failed"
  >("idle");
  const [regenerationFailedStage, setRegenerationFailedStage] = useState<
    "rebuilding" | "drafting" | "saving" | null
  >(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(
    initialWorkspace.draft.sections.find((section) => section.sectionId !== "title")?.sectionId ??
      initialWorkspace.draft.sections[0]?.sectionId ??
      "",
  );
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeInlineCitation, setActiveInlineCitation] = useState<{
    key: string;
    citation: DetailedReportCitation;
  } | null>(null);
  const citationDisplayMode = workspace.input.citationDisplayMode ?? "compact";
  const category = useMemo(
    () => detectTopicCategory(workspace.input.topic, workspace.input.reportType, workspace.input.purpose),
    [workspace.input.purpose, workspace.input.reportType, workspace.input.topic],
  );
  const exportReport = useMemo(() => workspaceToGeneratedReport(workspace, category), [category, workspace]);
  const formalReportDocument = exportReport.meta.formalReportDocument;
  const readerReferences = useMemo(
    () => buildReaderCitationEntries(
      formalReportDocument?.references ?? [],
      workspace.acceptedSources,
    ),
    [formalReportDocument, workspace.acceptedSources],
  );
  const exportWarnings = buildExportReadinessWarnings(exportReport);
  const citationExportBlocked = exportWarnings.some(
    (warning) => warning.code === "citation-integrity-blocked",
  );
  const exportAuditSections = formalReportDocument
    ? formalReportSectionSequence(formalReportDocument).map((section) => ({
        sectionId: section.id,
        title: section.title,
        body: section.blocks.map((block) => block.text).join("\n\n"),
      }))
    : workspace.draft.sections;
  const exportBlockReasons = formalExportBlockReasons({
    citationExportBlocked,
    sectionRequiresReview: formalReportDocument
      ? formalReportDocument.integrity.status !== "pass"
      : workspace.draft.sections.some(sectionRequiresExportReview),
    diagnostics: workspace.llmDiagnostics,
    sections: exportAuditSections,
    reportPlan: workspace.generationPayload.reportPlan ?? null,
  });
  const formalExportBlocked = exportBlockReasons.length > 0;
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
  const reportAbstractSection = workspace.draft.sections.find(
    (section) => section.sectionId === "abstract",
  );
  const reportSummaryText = reportAbstractSection
    ? visibleReportSectionText(reportAbstractSection)
    : acceptedSourceDigest.summary;
  const readerFacingReportSummaryText = reportSummaryText;
  const detailedReportParagraphs = useMemo(
    () => buildDetailedReportParagraphs(workspace),
    [workspace],
  );
  const editPath = `/workspace?reportId=${encodeURIComponent(workspace.id)}`;
  const reportPreviewStyle = useMemo(
    () => ({
      fontFamily: `${REPORT_CJK_FONT_STACK},${workspace.presentation.fontFamily}`,
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

  const updateReportTitle = (title: string) => {
    persistWorkspace((current) => {
      const draft = {
        ...current.draft,
        title,
      };
      return {
        ...current,
        draft,
        generationPayload: {
          ...current.generationPayload,
          displayTitle: title,
        },
        report: {
          ...current.report,
          meta: {
            ...current.report.meta,
            title,
            researchDraft: draft,
          },
        },
      };
    });
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
        section.sectionId === sectionId
          ? {
              ...section,
              body,
              prose: body,
              synthesizedProseZhTw: body,
              groundingStatus: "unsupported" as const,
              generationMethod: "needs_manual_review",
              unsupportedSentences: section.unsupportedSentences ?? [],
              warnings: Array.from(new Set([...(section.warnings ?? []), "needs_manual_review"])),
            }
          : section,
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

  const focusEvidenceCard = (cardId: string) => {
    setActiveEvidenceId(cardId);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`evidence-card-${cardId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const warnExportReadiness = (): boolean => {
    if (exportWarnings.length === 0 && !formalExportBlocked) return true;
    toast({
      title: formalExportBlocked ? "正式匯出已阻擋" : "引用準備度提醒",
      description: [
        ...exportBlockReasons,
        ...exportWarnings.map((warning) => warning.message),
      ].join(" "),
      ...(formalExportBlocked ? { variant: "destructive" as const } : {}),
    });
    return !formalExportBlocked;
  };

  const handleRegenerate = async () => {
    let activeStage: "rebuilding" | "drafting" | "saving" = "rebuilding";
    setIsRegenerating(true);
    setRegenerationStage("rebuilding");
    setRegenerationFailedStage(null);
    try {
      const recoveredEvidenceCards = recoverReportEvidenceCards(workspace);
      const rebuiltWorkspace = regenerateReportWorkspace({
        ...workspace,
        evidenceCards: recoveredEvidenceCards,
        generationPayload: {
          ...workspace.generationPayload,
          evidenceCards: recoveredEvidenceCards,
        },
      });
      saveReportWorkspace(rebuiltWorkspace);
      setWorkspace(rebuiltWorkspace);

      activeStage = "drafting";
      setRegenerationStage(activeStage);
      const llmDraft = await requestLlmReportDraft({
        reportInput: rebuiltWorkspace.input,
        workflowId: rebuiltWorkspace.workflowId,
        topicHash: rebuiltWorkspace.topicHash,
        originalTopic:
          rebuiltWorkspace.generationPayload?.originalTopic ??
          rebuiltWorkspace.input.topic,
        displayTitle:
          rebuiltWorkspace.generationPayload?.displayTitle ??
          rebuiltWorkspace.draft.title,
        acceptedSources: rebuiltWorkspace.acceptedSources,
        evidenceCards: rebuiltWorkspace.evidenceCards,
        academicSafetyReview:
          rebuiltWorkspace.generationPayload?.academicSafetyReview ?? null,
        reportPlan: rebuiltWorkspace.generationPayload?.reportPlan ?? null,
        generationMode: rebuiltWorkspace.generationMode,
        outline: rebuiltWorkspace.outline.sections,
      });

      const mergedWorkspace = {
        ...applyDetailedReportSummary(
          mergeLlmReportDraft(rebuiltWorkspace, llmDraft),
          { force: true },
        ),
        updatedAt: new Date().toISOString(),
      };

      activeStage = "saving";
      setRegenerationStage(activeStage);
      saveReportWorkspace(mergedWorkspace);
      setWorkspace(mergedWorkspace);
      setRegenerationStage("completed");
      const regenerationStatus = previewLlmStatus(llmDraft);
      toast(
        regenerationStatus.kind === "complete"
          ? {
              title: "已重新生成",
              description: "已使用伺服器端模型重新整理草稿與引用檢查結果。",
            }
          : regenerationStatus.kind === "partial"
            ? {
                title: "已完成保守補強",
                description: regenerationStatus.message,
              }
          : {
              title: "已重新整理草稿",
              description: regenerationStatus.message,
            },
      );
    } catch {
      setRegenerationFailedStage(activeStage);
      setRegenerationStage("failed");
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
    if (!warnExportReadiness()) return;
    navigator.clipboard.writeText(buildPlainText(exportReport, workspace.input));
    toast({ title: "已複製到剪貼簿", description: "報告純文字已複製。" });
  };

  const handleDownloadDocx = async () => {
    if (!warnExportReadiness()) return;
    try {
      await downloadDocx(exportReport, workspace.input, workspace.presentation);
      toast({ title: "已下載 Word（DOCX）", description: "Word 檔已儲存到你的裝置。" });
    } catch {
      toast({ title: "DOCX 產生失敗", description: "請稍後再試一次。", variant: "destructive" });
    }
  };

  const handleDownloadPdf = async () => {
    if (!warnExportReadiness()) return;
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await downloadPdf(exportReport, workspace.input, workspace.presentation);
      toast({ title: "已下載 PDF", description: "A4 PDF 檔已儲存到你的裝置。" });
    } catch (error) {
      toast({
        title: "PDF 產生失敗",
        description:
          error instanceof PdfExportError
            ? error.message
            : "伺服器暫時無法產生 PDF，請稍後再試。",
        variant: "destructive",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleMarkdown = () => {
    if (!warnExportReadiness()) return;
    downloadMarkdown(exportReport, workspace.input);
    toast({ title: "已下載 Markdown", description: "Markdown 檔已儲存。" });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-4 pb-12 pt-24">
        <section className="mb-5 rounded-lg border border-border bg-card px-4 py-4 shadow-sm sm:px-5" data-testid="preview-report-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={formalReportDocument?.metadata.reportKind === "limited_evidence_brief"
                  ? "secondary"
                  : workspace.generationMode === "complete_research_report" ? "default" : "secondary"}>
                  {formalReportDocument?.metadata.reportKind === "limited_evidence_brief"
                    ? "有限證據報告"
                    : formalReportDocument?.metadata.reportKind === "evidence_synthesis_report"
                      ? "學術證據綜合報告"
                      : workspace.generationMode === "complete_research_report"
                    ? "完整研究報告"
                    : workspace.generationMode === "standard_research_report"
                      ? "標準研究報告"
                      : workspace.generationMode === "short_research_report"
                        ? "短版研究報告"
                        : workspace.generationMode === "single_source_review"
                          ? "單篇文獻整理"
                          : "初步資料整理"}
                </Badge>
                <Badge variant="outline">{workspace.acceptedSources.length} 筆已接受來源</Badge>
                <Badge variant="outline">工作區 {workspace.id}</Badge>
              </div>
              <h1 className="text-base font-semibold text-foreground">標題</h1>
              <p className="mt-1 text-xs text-muted-foreground">可直接修改報告標題。</p>
              <AutoResizeTextarea
                value={workspace.draft.title}
                onChange={(event) => updateReportTitle(event.target.value)}
                minRows={2}
                maxHeightPx={160}
                className="mt-3 resize-y border-border bg-background text-xl font-semibold leading-8 text-foreground"
                data-testid="preview-report-title-editor"
              />
              {formalReportDocument?.titlePage.subtitle ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground" data-testid="preview-report-subtitle">
                  {formalReportDocument.titlePage.subtitle}
                </p>
              ) : null}
              {formalReportDocument?.abstract.keywords.length ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground" data-testid="preview-report-keywords">
                  關鍵詞：{formalReportDocument.abstract.keywords.join("、")}
                </p>
              ) : null}
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
              <Button size="sm" variant="outline" className="min-h-[40px]" onClick={handleDownloadDocx} disabled={formalExportBlocked} data-testid="button-preview-export-docx">
                <FileType className="mr-2 h-4 w-4" /> DOCX
              </Button>
              <Button size="sm" variant="outline" className="min-h-[40px]" onClick={handleDownloadPdf} disabled={formalExportBlocked || isExportingPdf} data-testid="button-preview-export-pdf">
                <Printer className={`mr-2 h-4 w-4 ${isExportingPdf ? "animate-pulse" : ""}`} /> {isExportingPdf ? "PDF 產生中" : "PDF"}
              </Button>
              <Button size="sm" variant="outline" className="min-h-[40px]" onClick={handleCopy} disabled={formalExportBlocked} data-testid="button-preview-copy">
                <Copy className="mr-2 h-4 w-4" /> 複製
              </Button>
              <Button size="sm" variant="outline" className="min-h-[40px]" onClick={handleMarkdown} disabled={formalExportBlocked} data-testid="button-preview-export-md">
                <FileDown className="mr-2 h-4 w-4" /> Markdown
              </Button>
            </div>
          </div>
        </section>

        {regenerationStage !== "idle" && (
          <section
            className="mb-4 rounded-lg border border-border bg-card p-4"
            data-testid="preview-generation-progress"
            aria-live="polite"
          >
            <div className="mb-3 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">重新生成階段</span>
              <Badge variant={regenerationStage === "failed" ? "destructive" : regenerationStage === "completed" ? "secondary" : "outline"}>
                {regenerationStage === "completed" ? "已完成" : regenerationStage === "failed" ? "失敗" : "執行中"}
              </Badge>
            </div>
            <ol className="grid gap-2 sm:grid-cols-3">
              {([
                ["rebuilding", "重建 Evidence Card 與工作區"],
                ["drafting", "呼叫現有 Report Writer"],
                ["saving", "驗證並保存報告"],
              ] as const).map(([stage, label], index, all) => {
                const currentIndex = all.findIndex(([item]) =>
                  item === (regenerationStage === "failed" ? regenerationFailedStage : regenerationStage),
                );
                const completed = regenerationStage === "completed" || currentIndex > index;
                const running = stage === regenerationStage;
                const failed = regenerationStage === "failed" && index === currentIndex;
                return (
                  <li key={stage} className="flex items-start gap-2 rounded-md border border-border bg-muted/15 px-3 py-2.5 text-sm">
                    {completed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                    ) : running ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
                    ) : failed ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <span className="mt-0.5 block h-4 w-4 shrink-0 rounded-full border border-border" />
                    )}
                    <span className="leading-5 text-foreground">{label}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {workspace.llmDiagnostics && (
          <section
            className={`mb-4 flex gap-3 rounded-lg border px-4 py-3 text-sm ${
              workspace.llmDiagnostics.fallbackUsed ||
              workspace.llmDiagnostics.degradedMode ||
              workspace.llmDiagnostics.reportGenerationStatus !== "success"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            data-testid="preview-llm-status"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{previewLlmStatus(workspace.llmDiagnostics).label}</p>
              <p className="mt-1 leading-6">{previewLlmStatus(workspace.llmDiagnostics).message}</p>
            </div>
          </section>
        )}

        {exportWarnings.length > 0 && (
          <section className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{exportWarnings.map((warning) => warning.message).join(" ")}</span>
          </section>
        )}

        {exportBlockReasons.length > 0 && (
          <section className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="preview-export-blocked-reasons">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>正式匯出已阻擋：{exportBlockReasons.join(" ")}</span>
          </section>
        )}

        <nav
          className="sticky top-[68px] z-20 mb-4 overflow-x-auto rounded-lg border border-border bg-background/95 px-2 py-2 shadow-sm backdrop-blur"
          aria-label="報告章節導覽"
          data-testid="preview-sticky-navigation"
        >
          <div className="flex min-w-max items-center gap-1 text-sm">
            <a className="rounded-md px-3 py-2 font-medium text-foreground hover:bg-muted" href="#preview-report-summary">摘要</a>
            {detailedReportParagraphs.map((paragraph, index) => (
              <a
                key={paragraph.id}
                className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                href={`#preview-report-${paragraph.id}`}
              >
                {index + 1}. {paragraph.title}
              </a>
            ))}
            {readerReferences.length > 0 ? (
              <a className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="#preview-report-references">資料來源</a>
            ) : null}
            <a className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground" href="#preview-export-actions">匯出</a>
          </div>
        </nav>

        <section id="preview-report-summary" className="mb-5 scroll-mt-32 rounded-lg border border-primary/20 bg-card p-4 shadow-sm sm:p-5" data-testid="preview-report-summary">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">摘要</h2>
              <p className="mt-1 text-xs text-muted-foreground">報告的整體重點，可直接修改。</p>
            </div>
            <Badge variant="secondary">{workspace.acceptedSources.length} 筆來源</Badge>
          </div>
          <AutoResizeTextarea
            value={readerFacingReportSummaryText}
            onChange={(event) => {
              if (reportAbstractSection) {
                updateDraftSectionBody(reportAbstractSection.sectionId, event.target.value);
              } else {
                updateDigestSummary(event.target.value);
              }
            }}
            minRows={3}
            maxHeightPx={360}
            className="resize-y border-border bg-background text-sm leading-7 text-foreground/90"
            style={{ textIndent: "2em" }}
            data-testid="preview-report-summary-editor"
          />
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="preview-detailed-report">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">詳細報告</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">各章依證據先行順序呈現閱讀導引、圖表與分析段落，作者—年份引用可點擊展開。</p>
            </div>
            <Badge variant="outline">{detailedReportParagraphs.length} 個報告章節</Badge>
          </div>
          <div className="space-y-5" style={reportPreviewStyle}>
            {detailedReportParagraphs.map((paragraph, paragraphIndex) => (
              <article id={`preview-report-${paragraph.id}`} key={paragraph.id} className="scroll-mt-32 rounded-md border border-border bg-background px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3
                    className={`text-foreground ${workspace.presentation.headingStyle === "modern" ? "text-[15px] font-semibold tracking-[0.02em] uppercase" : "text-base font-semibold leading-6"}`}
                  >
                    {paragraphIndex + 1}. {paragraph.title}
                  </h3>
                  <Badge variant="outline">{paragraph.citations.length} 筆精確來源</Badge>
                </div>
                {paragraph.orderedContent?.length ? (
                  <div
                    className="mt-4 flex flex-col text-sm leading-8 text-foreground/90"
                    style={{ rowGap: `${Math.max(12, workspace.presentation.paragraphSpacingPx)}px` }}
                    data-testid={`detailed-report-paragraph-${paragraph.id}`}
                  >
                    {paragraph.orderedContent.map((node, contentIndex) => {
                      if (node.nodeType === "table") {
                        return <FormalTablePreview key={`ordered-table-${node.table.number}-${contentIndex}`} table={node.table} />;
                      }
                      if (node.nodeType === "figure") {
                        return <FormalFigurePreview key={`ordered-figure-${node.figure.number}-${contentIndex}`} figure={node.figure} />;
                      }
                      const citationPrefix = `${paragraph.id}-ordered-${contentIndex}`;
                      return (
                        <div key={citationPrefix} className="space-y-2">
                          <p
                            className="whitespace-pre-wrap"
                            style={{ textIndent: node.paragraphRole === "reading_guide" ? undefined : "2em" }}
                            data-testid={`detailed-report-ordered-paragraph-${paragraph.id}-${contentIndex}`}
                          >
                            {node.citationSegments?.length ? (
                              <InlineCitationSegments
                                segments={node.citationSegments}
                                displayMode={citationDisplayMode}
                                citationKeyPrefix={citationPrefix}
                                activeCitationKey={activeInlineCitation?.key ?? null}
                                onToggle={(key, citation) =>
                                  setActiveInlineCitation((current) =>
                                    current?.key === key ? null : { key, citation },
                                  )
                                }
                              />
                            ) : (
                              <InlineCitationText
                                text={node.text}
                                citations={node.citations}
                                displayMode={citationDisplayMode}
                                citationKeyPrefix={citationPrefix}
                                activeCitationKey={activeInlineCitation?.key ?? null}
                                onToggle={(key, citation) =>
                                  setActiveInlineCitation((current) =>
                                    current?.key === key ? null : { key, citation },
                                  )
                                }
                              />
                            )}
                          </p>
                          {activeInlineCitation?.key.startsWith(`${citationPrefix}-`) ? (
                            <InlineCitationDetail
                              citationKey={activeInlineCitation.key}
                              citation={activeInlineCitation.citation}
                              evidenceCards={workspace.evidenceCards}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : paragraph.subsections.length > 0 ? (
                  <div
                    className="mt-4 space-y-5"
                    data-testid={`detailed-report-paragraph-${paragraph.id}`}
                  >
                    {paragraph.subsections.map((subsection, subsectionIndex) => (
                      <section
                        key={`${paragraph.id}-${subsection.sectionId}`}
                        className="rounded-md bg-muted/20 px-3 py-3 sm:px-4"
                      >
                        {paragraph.subsections.length > 1 ? (
                          <h4 className="flex items-center gap-2 text-sm font-semibold leading-6 text-foreground">
                            <span className="text-xs font-medium tabular-nums text-primary">
                              {paragraphIndex + 1}.{subsectionIndex + 1}
                            </span>
                            {subsection.title}
                          </h4>
                        ) : null}
                        <div
                          className="mt-2 flex flex-col text-sm leading-8 text-foreground/90"
                          style={{ rowGap: `${Math.max(12, workspace.presentation.paragraphSpacingPx)}px` }}
                        >
                          {subsection.paragraphs.map((body, bodyIndex) => (
                            <div key={`${subsection.sectionId}-${bodyIndex}`} className="space-y-2">
                              <p
                                className="whitespace-pre-wrap"
                                style={{ textIndent: "2em" }}
                                data-testid={`detailed-report-subparagraph-${subsection.sectionId}-${bodyIndex}`}
                              >
                                <InlineCitationText
                                  text={body}
                                  citations={subsection.citationGroups?.[bodyIndex] ?? paragraph.citations}
                                  displayMode={citationDisplayMode}
                                  citationKeyPrefix={`${paragraph.id}-${subsection.sectionId}-${bodyIndex}`}
                                  activeCitationKey={activeInlineCitation?.key ?? null}
                                  onToggle={(key, citation) =>
                                    setActiveInlineCitation((current) =>
                                      current?.key === key ? null : { key, citation },
                                    )
                                  }
                                />
                              </p>
                              {activeInlineCitation?.key.startsWith(
                                `${paragraph.id}-${subsection.sectionId}-${bodyIndex}-`,
                              ) ? (
                                <InlineCitationDetail
                                  citationKey={activeInlineCitation.key}
                                  citation={activeInlineCitation.citation}
                                  evidenceCards={workspace.evidenceCards}
                                />
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p
                    className="mt-3 whitespace-pre-wrap text-sm leading-8 text-foreground/90"
                    style={{
                      marginBottom: `${workspace.presentation.paragraphSpacingPx}px`,
                      textIndent: "2em",
                    }}
                    data-testid={`detailed-report-paragraph-${paragraph.id}`}
                  >
                    <InlineCitationText
                      text={paragraph.body || "此段尚待重新生成。"}
                      citations={paragraph.citations}
                      displayMode={citationDisplayMode}
                      citationKeyPrefix={`${paragraph.id}-body`}
                      activeCitationKey={activeInlineCitation?.key ?? null}
                      onToggle={(key, citation) =>
                        setActiveInlineCitation((current) =>
                          current?.key === key ? null : { key, citation },
                        )
                      }
                    />
                  </p>
                )}
                {!paragraph.orderedContent?.length && paragraph.subsections.length === 0 && activeInlineCitation?.key.startsWith(`${paragraph.id}-body-`) ? (
                  <div className="mt-2">
                    <InlineCitationDetail
                      citationKey={activeInlineCitation.key}
                      citation={activeInlineCitation.citation}
                      evidenceCards={workspace.evidenceCards}
                    />
                  </div>
                ) : null}
                {!paragraph.orderedContent?.length
                  ? paragraph.tables.map((table) => <FormalTablePreview key={`table-${table.number}`} table={table} />)
                  : null}
                {!paragraph.orderedContent?.length
                  ? paragraph.figures.map((figure) => <FormalFigurePreview key={`figure-${figure.number}`} figure={figure} />)
                  : null}
              </article>
            ))}
            {readerReferences.length > 0 ? (
              <section
                id="preview-report-references"
                className="scroll-mt-32 rounded-md border border-border bg-background px-4 py-4 sm:px-5"
                data-testid="preview-report-references"
              >
                <h3 className="text-base font-semibold leading-6 text-foreground">資料來源</h3>
                <div className="mt-4 space-y-3 text-sm leading-7 text-foreground/90">
                  {readerReferences.map((reference) => (
                    <p
                      id={reference.anchorId}
                      key={reference.citationId}
                      style={{ paddingLeft: "2em", textIndent: "-2em" }}
                    >
                      <span className="mr-2 font-semibold text-muted-foreground">{reference.referenceNumber}.</span>
                      {reference.externalHref ? (
                        <a
                          href={reference.externalHref}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-border underline-offset-2 hover:text-primary"
                        >
                          {reference.referenceText}
                        </a>
                      ) : reference.referenceText}
                    </p>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>

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
          <AutoResizeTextarea
            value={acceptedSourceDigest.summary}
            onChange={(event) => updateDigestSummary(event.target.value)}
            minRows={3}
            maxHeightPx={320}
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
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" data-testid="preview-draft">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold text-foreground">生成草稿</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">左側瀏覽章節計畫，中間直接編修報告，右側核對目前段落的 Evidence Card 與來源。</p>
              </div>
              <Badge variant="outline">{workspace.draft.sections.length} 段</Badge>
            </div>
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.45fr)_minmax(230px,0.8fr)] xl:items-start">
              <aside className="order-3 space-y-3 xl:order-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">證據與來源</h3>
                </div>
                <div className="rounded-md border border-border bg-background px-3 py-3">
                  <p className="text-sm font-semibold text-foreground">{activeSection?.title ?? "尚未選取段落"}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {activeSection?.sectionGoal ?? "點選中間段落或右側骨架，即可查看這一段的來源構成。"}
                  </p>
                </div>
                {activeEvidenceCards.length > 0 ? (
                  activeEvidenceCards.map((card, index) => (
                    <article
                      key={card.id}
                      id={`evidence-card-${card.id}`}
                      className={`rounded-md border bg-background px-3 py-3 transition-colors ${
                        activeEvidenceId === card.id ? "border-primary shadow-sm" : "border-border"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">語句依據 {index + 1}</Badge>
                        <Badge variant="outline">{card.citationMarker || card.citationText}</Badge>
                        <Badge variant={card.derivation === "metadata-derived" ? "outline" : "secondary"}>
                          {evidenceCardStatusLabel(card)}
                        </Badge>
                        {card.extractionMethod ? (
                          <Badge variant={card.extractionMethod === "rule_fallback_claim_extraction" ? "outline" : "secondary"}>
                            {extractionMethodLabel(card.extractionMethod)}
                          </Badge>
                        ) : null}
                        {card.needsReview || card.needsManualReview || card.extractionMethod === "rule_fallback_claim_extraction" ? (
                          <Badge variant="outline">需人工複核</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs font-medium leading-5 text-foreground">{card.sourceTitle}</p>
                      <p className="mt-2 text-xs font-medium leading-5 text-foreground">主要主張</p>
                      <p className="mt-1 text-sm leading-6 text-foreground/90">{card.claimText || card.mainClaimZhTw || card.mainClaim || card.summary}</p>
                      {evidenceSupportSpan(card) ? (
                        <>
                          <p className="mt-2 text-xs font-medium leading-5 text-foreground">來源支持片段</p>
                          <p className="mt-1 text-sm leading-6 text-foreground/90">{evidenceSupportSpan(card)}</p>
                        </>
                      ) : null}
                      {(card.sectionFit?.length || card.sectionTargets?.length) ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          適用段落：{(card.sectionFit ?? card.sectionTargets).join("、")}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs font-medium leading-5 text-foreground">可用證據</p>
                      <p className="mt-1 text-sm leading-6 text-foreground/90">
                        {card.usableEvidence || card.quoteOrParaphrase || card.summary || card.evidence}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        {card.citationText}・{card.sourceLocation || card.pageOrLocation || "摘要整理"}
                        {card.extractionMethod ? `・${extractionMethodLabel(card.extractionMethod)}` : ""}
                        {card.extractionStatus ? `・${extractionStatusLabel(card.extractionStatus)}` : ""}
                        {card.needsReview || card.needsManualReview ? "・需人工複核" : ""}
                      </p>
                      {card.limitation || card.rejectionReason ? (
                        <p className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs leading-5 text-muted-foreground">
                          {card.rejectionReason ? `排除原因：${sanitizeReaderFacingInternalLanguage(card.rejectionReason)}` : `限制：${sanitizeReaderFacingInternalLanguage(card.limitation)}`}
                        </p>
                      ) : null}
                      {card.limitations.length > 0 ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          限制：{sanitizeReaderFacingInternalLanguage(card.limitations.slice(0, 2).join("；"))}
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

              <div className="order-1 space-y-5 xl:order-2" style={reportPreviewStyle}>
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
                          <Badge variant={evidenceCoverageBadgeVariant(section.evidenceCoverageStatus)}>
                            {evidenceCoverageLabel(section.evidenceCoverageStatus)}
                          </Badge>
                          <Badge variant={groundingStatusBadgeVariant(section.groundingStatus, section.generationMethod, section.warnings)}>
                            {groundingStatusLabel(section.groundingStatus, section.generationMethod, section.warnings)}
                          </Badge>
                          <Badge variant="outline">{section.evidenceCardCount ?? section.evidenceCardIds.length} 張證據</Badge>
                          <Badge variant="outline">{section.citationCount ?? section.citationMarkers.length} 筆引用</Badge>
                          <Badge variant="outline">{section.unsupportedSentences?.length ?? 0} 句待補證據</Badge>
                        </div>
                      </div>
                      {section.evidenceCoverageStatus === "insufficient" ? (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          目前此段來源不足，建議補充來源或改為保守敘述。
                        </div>
                      ) : null}
                      <AutoResizeTextarea
                        value={visibleReportSectionText(section)}
                        onFocus={() => setActiveSectionId(section.sectionId)}
                        onChange={(event) => updateDraftSectionBody(section.sectionId, event.target.value)}
                        minRows={4}
                        maxHeightPx={420}
                        className="mt-3 resize-y border-border bg-background text-sm text-foreground/90"
                        style={{
                          marginBottom: `${workspace.presentation.paragraphSpacingPx}px`,
                          lineHeight: workspace.presentation.lineHeight,
                        }}
                        data-testid={`draft-editor-${section.sectionId}`}
                      />
                      {section.citationMarkers.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {section.citationMarkers.map((marker, markerIndex) => {
                            const targetCard =
                              workspace.evidenceCards.find((card) =>
                                section.evidenceCardIds.includes(card.id) &&
                                (card.citationMarker === marker || card.citationText === marker),
                              ) ??
                              workspace.evidenceCards.find((card) =>
                                section.evidenceCardIds.includes(card.id),
                              );
                            return (
                              <button
                                key={`${section.sectionId}-${marker}-${markerIndex}`}
                                type="button"
                                className="rounded-md border border-border bg-muted/30 px-2 py-1 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                                onClick={() => {
                                  setActiveSectionId(section.sectionId);
                                  if (targetCard) focusEvidenceCard(targetCard.id);
                                }}
                              >
                                {marker}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      {(section.unsupportedSentences?.length ?? 0) > 0 ? (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                          待補證據句子：{section.unsupportedSentences?.slice(0, 2).map((sentence) => sanitizeReaderFacingInternalLanguage(sentence)).join(" ")}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <aside className="order-2 space-y-3 xl:order-1">
                <div className="flex items-center gap-2">
                  <Shapes className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">章節計畫</h3>
                </div>
                <div className="space-y-2.5">
                  {workspace.outline.sections.map((section) => {
                    const isActive = section.sectionId === activeSection?.sectionId;
                    const draftSection = workspace.draft.sections.find((item) => item.sectionId === section.sectionId);
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{section.title}</p>
                          {draftSection ? (
                            <>
                              <Badge variant={evidenceCoverageBadgeVariant(draftSection.evidenceCoverageStatus)}>
                                {evidenceCoverageLabel(draftSection.evidenceCoverageStatus)}
                              </Badge>
                              <Badge variant={groundingStatusBadgeVariant(draftSection.groundingStatus, draftSection.generationMethod, draftSection.warnings)}>
                                {groundingStatusLabel(draftSection.groundingStatus, draftSection.generationMethod, draftSection.warnings)}
                              </Badge>
                            </>
                          ) : null}
                        </div>
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
                          {source.llmSummaryZhTw ||
                            source.readableSummaryZhTW ||
                            source.readableSummaryZhTw ||
                            source.evidenceSummaryZhTw ||
                            source.abstract ||
                            "目前尚未整理出可用摘要。"}
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
                      {sourceExtractionDetails(source).length > 0 ? (
                        <div>
                          <p className="font-medium text-foreground">全文抽取</p>
                          <p className="mt-1 text-muted-foreground">{sourceExtractionDetails(source).join("｜")}</p>
                        </div>
                      ) : null}
                      {sourceExtractionWarnings(source) ? (
                        <div>
                          <p className="font-medium text-foreground">抽取警告</p>
                          <p className="mt-1 text-muted-foreground">{sourceExtractionWarnings(source)}</p>
                        </div>
                      ) : null}
                      <p className="text-muted-foreground">
                        內容層級：{sourceAbstractOnly(source) ? "目前以摘要或書目資訊為主" : "已取得可核對片段"}
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

            <section id="preview-export-actions" className="scroll-mt-32 rounded-lg border border-primary/25 bg-card p-4 shadow-sm" data-testid="preview-export-actions">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-foreground">匯出與下載</h2>
                  <p className="mt-1 text-xs text-muted-foreground">匯出會帶入目前頁面上已修改的摘要、草稿與格式設定。</p>
                </div>
                <Badge variant={formalExportBlocked ? "destructive" : "secondary"}>
                  {formalExportBlocked ? "正式匯出已阻擋" : "可匯出"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
                <Button size="sm" className="min-h-[42px] justify-start" onClick={handleDownloadDocx} disabled={formalExportBlocked} data-testid="button-preview-export-docx">
                  <FileType className="mr-2 h-4 w-4" /> DOCX
                </Button>
                <Button size="sm" variant="outline" className="min-h-[42px] justify-start" onClick={handleDownloadPdf} disabled={formalExportBlocked || isExportingPdf} data-testid="button-preview-export-pdf">
                  <Printer className={`mr-2 h-4 w-4 ${isExportingPdf ? "animate-pulse" : ""}`} /> {isExportingPdf ? "PDF 產生中" : "PDF"}
                </Button>
                <Button size="sm" variant="outline" className="min-h-[42px] justify-start" onClick={handleCopy} disabled={formalExportBlocked} data-testid="button-preview-copy">
                  <Copy className="mr-2 h-4 w-4" /> 複製
                </Button>
                <Button size="sm" variant="outline" className="min-h-[42px] justify-start" onClick={handleMarkdown} disabled={formalExportBlocked} data-testid="button-preview-export-md">
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
