import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PaperSearchStatus = "idle" | "loading" | "success" | "error";

interface PaperSearchPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  provider: string | null;
  citationCount: number | null;
  isOpenAccess: boolean | null;
  abstract: string | null;
  summary: string;
  summaryStatus: string | null;
  summarySourceType: string | null;
  summaryConfidence: string | null;
}

interface PaperSearchResponse {
  ok: boolean;
  query: string;
  count: number;
  queries: string[];
  papers: PaperSearchPaper[];
  warnings: string[];
  summaryMode: string;
}

interface PaperSummaryResponse {
  ok: boolean;
  papers: PaperSearchPaper[];
  warnings: string[];
  summaryMode: string;
}

type EnrichmentPhase = "idle" | "expanding" | "summarizing" | "complete";

interface SummaryProgress {
  completed: number;
  total: number;
}

const FAST_RESULT_LIMIT = 8;
const EXPANDED_RESULT_LIMIT = 12;
const SUMMARY_BATCH_SIZE = 4;

const EXAMPLE_QUERIES = [
  "生成式 AI 與學習成效",
  "塑膠微粒對海洋生態的影響",
  "睡眠不足與青少年注意力",
];

const LOADING_MESSAGES = [
  "正在快速查詢 OpenAlex 與 Crossref…",
  "第一批結果即將顯示，後續內容會在背景補齊…",
  "正在比對題名、作者、DOI 與原文摘要…",
];

function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL?.trim();
  return base ? `${base.replace(/\/+$/, "")}${path}` : path;
}

function initialQuery(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

function paperLink(paper: PaperSearchPaper): string | null {
  if (paper.url) return paper.url;
  return paper.doi ? `https://doi.org/${paper.doi}` : null;
}

function authorsLabel(authors: string[]): string {
  if (authors.length === 0) return "作者資料未提供";
  const visible = authors.slice(0, 4).join("、");
  return authors.length > 4 ? `${visible} 等 ${authors.length} 位作者` : visible;
}

function summaryLabel(paper: PaperSearchPaper): string {
  if (paper.summaryStatus === "pending") return "AI 整理中";
  if (paper.summaryStatus === "success") return "AI 繁中摘要";
  if (paper.summarySourceType === "metadataFallback") return "書目重點整理";
  if (paper.summarySourceType === "abstract") return "依原文摘要整理";
  return "內容摘要";
}

function summaryBadgeVariant(
  paper: PaperSearchPaper,
): "default" | "secondary" | "outline" {
  if (paper.summaryStatus === "success") return "default";
  if (paper.summaryConfidence === "low") return "outline";
  return "secondary";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function paperBatches(papers: PaperSearchPaper[]): PaperSearchPaper[][] {
  const batches: PaperSearchPaper[][] = [];
  for (let index = 0; index < papers.length; index += SUMMARY_BATCH_SIZE) {
    batches.push(papers.slice(index, index + SUMMARY_BATCH_SIZE));
  }
  return batches;
}

function summaryFields(paper: PaperSearchPaper): Partial<PaperSearchPaper> {
  return {
    summary: paper.summary,
    summaryStatus: paper.summaryStatus,
    summarySourceType: paper.summarySourceType,
    summaryConfidence: paper.summaryConfidence,
  };
}

function mergedPaperList(
  primary: PaperSearchPaper[],
  secondary: PaperSearchPaper[],
  summaries: Map<string, PaperSearchPaper>,
  limit: number,
): PaperSearchPaper[] {
  const seen = new Set<string>();
  const merged: PaperSearchPaper[] = [];
  for (const paper of [...primary, ...secondary]) {
    const key = paper.id || `${paper.doi ?? ""}:${paper.title.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const summarized = summaries.get(paper.id);
    merged.push(summarized ? { ...paper, ...summaryFields(summarized) } : paper);
    if (merged.length >= limit) break;
  }
  return merged;
}

function userFacingError(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "搜尋時間較久，已先停止這次請求。請縮短關鍵詞後再試一次。";
  }
  const message = error instanceof Error ? error.message : "";
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "目前無法連線到論文搜尋服務。請確認 API 已啟動，或稍後再試。";
  }
  return message || "搜尋暫時失敗，請稍後再試。";
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json().catch(() => null)) as
    | T
    | { message?: string }
    | null;
  if (!response.ok) {
    const message = data && typeof data === "object" && "message" in data
      ? data.message
      : null;
    throw new Error(message || `搜尋服務回傳 HTTP ${response.status}`);
  }
  if (!data) throw new Error("搜尋服務回傳了無法辨識的資料，請稍後再試。");
  return data as T;
}

function PaperCard({ paper, index }: { paper: PaperSearchPaper; index: number }) {
  const link = paperLink(paper);

  return (
    <article
      className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
      data-testid="paper-card"
    >
      <div className="grid md:grid-cols-[3.5rem_1fr]">
        <div className="hidden border-r border-border bg-muted/50 py-6 text-center text-sm font-semibold text-muted-foreground md:block">
          {String(index + 1).padStart(2, "0")}
        </div>

        <div className="p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{paper.provider ?? "學術來源"}</Badge>
            {paper.year ? <Badge variant="secondary">{paper.year}</Badge> : null}
            {paper.isOpenAccess ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                開放取用
              </Badge>
            ) : null}
            {typeof paper.citationCount === "number" && paper.citationCount > 0 ? (
              <span className="text-xs text-muted-foreground">
                被引用 {paper.citationCount.toLocaleString("zh-TW")} 次
              </span>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold leading-snug text-foreground sm:text-xl">
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="transition-colors hover:text-primary"
                    data-testid="paper-title-link"
                  >
                    {paper.title}
                  </a>
                ) : (
                  paper.title
                )}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {authorsLabel(paper.authors)}
              </p>
              {paper.venue ? (
                <p className="mt-1 text-sm text-muted-foreground">{paper.venue}</p>
              ) : null}
            </div>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                aria-label={`開啟論文：${paper.title}`}
                className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>

          <div className="mt-5 rounded-lg border border-primary/15 bg-accent/55 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {paper.summaryStatus === "pending" ? (
                <LoaderCircle className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
              ) : (
                <Sparkles className="h-4 w-4 text-primary" />
              )}
              <h3 className="text-sm font-semibold">論文重點</h3>
              <Badge variant={summaryBadgeVariant(paper)}>{summaryLabel(paper)}</Badge>
              {paper.summaryConfidence === "low" ? (
                <span className="text-xs text-muted-foreground">資訊有限，引用前請查看原文</span>
              ) : null}
            </div>
            <p
              className="text-[15px] leading-7 text-foreground/90"
              data-testid="paper-summary"
              aria-live={paper.summaryStatus === "pending" ? "polite" : undefined}
            >
              {paper.summary}
            </p>
            {paper.summaryStatus === "pending" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                已先顯示可用的原文摘要節錄，繁中重點完成後會自動更新。
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {paper.doi ? <span>DOI：{paper.doi}</span> : <span>此來源未提供 DOI</span>}
            </div>
            {paper.abstract ? (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer select-none font-medium text-foreground hover:text-primary">
                  查看完整原文摘要
                </summary>
                <p className="mt-3 max-w-4xl rounded-md bg-muted/60 p-4 leading-6">
                  {paper.abstract}
                </p>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function PaperSearch() {
  const startingQuery = useMemo(initialQuery, []);
  const [query, setQuery] = useState(startingQuery);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [status, setStatus] = useState<PaperSearchStatus>("idle");
  const [result, setResult] = useState<PaperSearchResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [enrichmentPhase, setEnrichmentPhase] = useState<EnrichmentPhase>("idle");
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress>({
    completed: 0,
    total: 0,
  });
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);
  const summariesByIdRef = useRef(new Map<string, PaperSearchPaper>());
  const visiblePaperIdsRef = useRef<string[]>([]);
  const autoSearchStartedRef = useRef(false);

  const applySummaryPapers = useCallback(
    (papers: PaperSearchPaper[], warnings: string[], runId: number) => {
      if (activeRunIdRef.current !== runId) return;
      for (const paper of papers) summariesByIdRef.current.set(paper.id, paper);

      setResult((current) => {
        if (!current) return current;
        return {
          ...current,
          papers: current.papers.map((paper) => {
            const summarized = summariesByIdRef.current.get(paper.id);
            return summarized ? { ...paper, ...summaryFields(summarized) } : paper;
          }),
          warnings: uniqueStrings([...current.warnings, ...warnings]),
        };
      });

      const completed = visiblePaperIdsRef.current.filter((id) =>
        summariesByIdRef.current.has(id),
      ).length;
      setSummaryProgress({ completed, total: visiblePaperIdsRef.current.length });
    },
    [],
  );

  const summarizePaperBatches = useCallback(
    async (
      topic: string,
      papers: PaperSearchPaper[],
      controller: AbortController,
      runId: number,
    ) => {
      for (const batch of paperBatches(papers)) {
        if (controller.signal.aborted || activeRunIdRef.current !== runId) return;
        try {
          const data = await postJson<PaperSummaryResponse>(
            "/api/paper-search/summaries",
            { query: topic, papers: batch },
            controller.signal,
          );
          if (!Array.isArray(data.papers)) {
            throw new Error("摘要服務回傳格式錯誤。");
          }
          applySummaryPapers(data.papers, data.warnings ?? [], runId);
        } catch (error) {
          if (controller.signal.aborted || activeRunIdRef.current !== runId) return;
          const fallbackPapers = batch.map((paper) => ({
            ...paper,
            summaryStatus: "fallback",
            summaryConfidence: "low",
          }));
          applySummaryPapers(
            fallbackPapers,
            ["部分繁中摘要暫時無法完成，已保留可追溯的原文摘要節錄。"],
            runId,
          );
        }
      }
    },
    [applySummaryPapers],
  );

  const runSearch = useCallback(
    async (rawQuery: string) => {
      const nextQuery = rawQuery.trim().replace(/\s+/g, " ");
      if (nextQuery.length < 2) {
        setStatus("error");
        setErrorMessage("請輸入至少 2 個字的研究關鍵詞。");
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const runId = activeRunIdRef.current + 1;
      activeRunIdRef.current = runId;
      const timeoutId = window.setTimeout(() => controller.abort(), 150_000);

      summariesByIdRef.current.clear();
      visiblePaperIdsRef.current = [];
      setQuery(nextQuery);
      setSearchedQuery(nextQuery);
      setStatus("loading");
      setResult(null);
      setErrorMessage(null);
      setLoadingMessageIndex(0);
      setEnrichmentPhase("expanding");
      setSummaryProgress({ completed: 0, total: 0 });

      const url = new URL(window.location.href);
      url.searchParams.set("q", nextQuery);
      window.history.replaceState(window.history.state, "", url);

      const expandedPromise: Promise<{
        data: PaperSearchResponse | null;
        error: unknown;
      }> = postJson<PaperSearchResponse>(
        "/api/paper-search",
        {
          query: nextQuery,
          limit: EXPANDED_RESULT_LIMIT,
          searchMode: "expanded",
          includeSummaries: false,
        },
        controller.signal,
      )
        .then((data) => ({ data, error: null }))
        .catch((error: unknown) => ({ data: null, error }));

      try {
        let initialResult: PaperSearchResponse;
        let initialWasExpanded = false;
        try {
          initialResult = await postJson<PaperSearchResponse>(
            "/api/paper-search",
            {
              query: nextQuery,
              limit: FAST_RESULT_LIMIT,
              searchMode: "fast",
              includeSummaries: false,
            },
            controller.signal,
          );
        } catch (fastError) {
          const expandedOutcome = await expandedPromise;
          if (!expandedOutcome.data) throw fastError;
          initialResult = expandedOutcome.data;
          initialWasExpanded = true;
        }

        if (!Array.isArray(initialResult.papers)) {
          throw new Error("搜尋服務回傳了無法辨識的資料，請稍後再試。");
        }
        if (controller.signal.aborted || activeRunIdRef.current !== runId) return;

        visiblePaperIdsRef.current = initialResult.papers.map((paper) => paper.id);
        setSummaryProgress({ completed: 0, total: initialResult.papers.length });
        setResult(initialResult);
        setStatus("success");

        const firstSummaryPromise = initialWasExpanded
          ? Promise.resolve()
          : summarizePaperBatches(
              nextQuery,
              initialResult.papers.slice(0, SUMMARY_BATCH_SIZE),
              controller,
              runId,
            );

        let finalResult = initialResult;
        if (!initialWasExpanded) {
          const expandedOutcome = await expandedPromise;
          if (controller.signal.aborted || activeRunIdRef.current !== runId) return;
          if (expandedOutcome.data && Array.isArray(expandedOutcome.data.papers)) {
            const papers = mergedPaperList(
              expandedOutcome.data.papers,
              initialResult.papers,
              summariesByIdRef.current,
              EXPANDED_RESULT_LIMIT,
            );
            finalResult = {
              ...expandedOutcome.data,
              count: papers.length,
              papers,
              warnings: uniqueStrings([
                ...initialResult.warnings,
                ...expandedOutcome.data.warnings,
              ]),
            };
          } else if (expandedOutcome.error) {
            finalResult = {
              ...initialResult,
              warnings: uniqueStrings([
                ...initialResult.warnings,
                "延伸英文檢索暫時未完成，已保留快速搜尋結果。",
              ]),
            };
          }

          visiblePaperIdsRef.current = finalResult.papers.map((paper) => paper.id);
          const completed = visiblePaperIdsRef.current.filter((id) =>
            summariesByIdRef.current.has(id),
          ).length;
          setSummaryProgress({ completed, total: finalResult.papers.length });
          setResult(finalResult);
        }

        setEnrichmentPhase("summarizing");
        await firstSummaryPromise;
        if (controller.signal.aborted || activeRunIdRef.current !== runId) return;

        const pendingPapers = finalResult.papers.filter(
          (paper) => !summariesByIdRef.current.has(paper.id),
        );
        await summarizePaperBatches(nextQuery, pendingPapers, controller, runId);
        if (controller.signal.aborted || activeRunIdRef.current !== runId) return;
        setEnrichmentPhase("complete");
      } catch (error) {
        if (controller.signal.aborted || activeRunIdRef.current !== runId) return;
        setStatus("error");
        setEnrichmentPhase("idle");
        setErrorMessage(userFacingError(error));
      } finally {
        window.clearTimeout(timeoutId);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [summarizePaperBatches],
  );

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (status !== "loading") return;
    const timer = window.setInterval(() => {
      setLoadingMessageIndex((current) =>
        Math.min(current + 1, LOADING_MESSAGES.length - 1),
      );
    }, 4_500);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    if (!startingQuery || autoSearchStartedRef.current) return;
    autoSearchStartedRef.current = true;
    void runSearch(startingQuery);
  }, [runSearch, startingQuery]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query);
  };

  const paperCount = result?.papers.length ?? 0;
  const aiSummaryCount =
    result?.papers.filter((paper) => paper.summaryStatus === "success").length ?? 0;
  const isEnriching =
    enrichmentPhase === "expanding" || enrichmentPhase === "summarizing";
  const summaryProgressPercent = summaryProgress.total > 0
    ? Math.round((summaryProgress.completed / summaryProgress.total) * 100)
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-border bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_48%)]">
          <div className="pointer-events-none absolute -left-20 top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-64 w-64 rounded-full bg-orange-200/30 blur-3xl" />

          <div className="container relative mx-auto max-w-5xl px-4 py-16 text-center sm:py-20">
            <Badge className="mb-5 gap-1.5 rounded-full px-3 py-1">
              <FileSearch className="h-3.5 w-3.5" />
              AI 論文搜尋
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              輸入關鍵詞，找到論文與中文摘要
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              先顯示第一批學術結果，再於背景擴充英文檢索並逐篇補上繁體中文重點。
            </p>

            <form
              onSubmit={handleSubmit}
              className="mx-auto mt-9 flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-lg sm:flex-row"
              data-testid="paper-search-form"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="例如：生成式 AI 與學習成效"
                  aria-label="論文搜尋關鍵詞"
                  className="h-12 border-0 bg-transparent pl-11 text-base shadow-none focus-visible:ring-0"
                  disabled={status === "loading"}
                  data-testid="paper-search-input"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-12 min-w-32"
                disabled={status === "loading" || query.trim().length < 2}
                data-testid="paper-search-submit"
              >
                {status === "loading" ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
                    搜尋中
                  </>
                ) : (
                  <>
                    搜尋論文
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">試試看：</span>
              {EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void runSearch(example)}
                  disabled={status === "loading"}
                  className="rounded-full border border-border bg-background/80 px-3 py-1.5 text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto max-w-5xl px-4 py-10 sm:py-12">
          {status === "idle" ? (
            <div className="grid gap-4 sm:grid-cols-3" data-testid="paper-search-empty-state">
              {[
                {
                  icon: <Search className="h-5 w-5" />,
                  title: "跨資料庫搜尋",
                  text: "搜尋 OpenAlex、Crossref 等學術來源，保留 DOI 與原始連結。",
                },
                {
                  icon: <Bot className="h-5 w-5" />,
                  title: "繁中重點摘要",
                  text: "只根據取得的原文摘要整理，不補寫論文未提供的結果。",
                },
                {
                  icon: <ShieldCheck className="h-5 w-5" />,
                  title: "結果可追溯",
                  text: "每篇都保留作者、年份、期刊與來源網址，方便回到原文確認。",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-card p-5">
                  <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-2.5 text-primary">
                    {item.icon}
                  </div>
                  <h2 className="font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          {status === "loading" ? (
            <div
              className="rounded-xl border border-border bg-card p-8 text-center shadow-sm"
              aria-live="polite"
              data-testid="paper-search-loading"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LoaderCircle className="h-7 w-7 animate-spin motion-reduce:animate-none" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">正在搜尋「{searchedQuery}」</h2>
              <p className="mt-2 text-muted-foreground">
                {LOADING_MESSAGES[loadingMessageIndex]}
              </p>
              <div className="mx-auto mt-7 grid max-w-3xl gap-3 text-left">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="animate-pulse rounded-lg border border-border p-4 motion-reduce:animate-none">
                    <div className="h-4 w-24 rounded bg-muted" />
                    <div className="mt-3 h-5 w-3/4 rounded bg-muted" />
                    <div className="mt-3 h-3 w-full rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {status === "error" ? (
            <div
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-7 text-center"
              role="alert"
              data-testid="paper-search-error"
            >
              <FileSearch className="mx-auto h-9 w-9 text-destructive" />
              <h2 className="mt-4 text-xl font-semibold">這次搜尋沒有完成</h2>
              <p className="mx-auto mt-2 max-w-xl text-muted-foreground">{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-5"
                onClick={() => void runSearch(query)}
                disabled={query.trim().length < 2}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                再試一次
              </Button>
            </div>
          ) : null}

          {status === "success" && result ? (
            <div data-testid="paper-search-results">
              <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1" aria-live="polite" data-testid="paper-search-enrichment-status">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    {isEnriching ? (
                      <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {enrichmentPhase === "expanding"
                      ? "快速結果已顯示"
                      : enrichmentPhase === "summarizing"
                        ? "更多論文已加入，正在整理摘要"
                        : "搜尋與摘要完成"}
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">
                    「{result.query}」找到 {paperCount} 篇論文
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {enrichmentPhase === "expanding"
                      ? `正在背景擴充到最多 ${EXPANDED_RESULT_LIMIT} 篇；已完成 ${summaryProgress.completed} 篇內容整理。`
                      : enrichmentPhase === "summarizing"
                        ? `${summaryProgress.completed} / ${summaryProgress.total} 篇已整理完成，結果會逐篇自動更新。`
                        : aiSummaryCount > 0
                          ? `${aiSummaryCount} 篇已完成較完整的 AI 繁中摘要，其餘保留原文重點。`
                          : "目前摘要採用安全備援整理；每篇都可開啟原始來源確認。"}
                  </p>
                  {isEnriching && summaryProgress.total > 0 ? (
                    <div className="mt-3 h-1.5 max-w-xl overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
                        style={{ width: `${summaryProgressPercent}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <Button type="button" variant="outline" onClick={() => void runSearch(result.query)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新搜尋
                </Button>
              </div>

              {paperCount > 0 ? (
                <div className="space-y-5">
                  {result.papers.map((paper, index) => (
                    <PaperCard key={paper.id || `${paper.title}-${index}`} paper={paper} index={index} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
                  <BookOpen className="mx-auto h-10 w-10 text-muted-foreground" />
                  <h2 className="mt-4 text-xl font-semibold">暫時沒有找到相符論文</h2>
                  <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
                    試著改用更具體的研究對象、變項或英文關鍵詞，例如「高中生 睡眠 注意力」。
                  </p>
                </div>
              )}

              {(result.queries.length > 1 || result.warnings.length > 0) && (
                <details className="mt-6 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  <summary className="cursor-pointer font-medium">搜尋範圍與狀態</summary>
                  <div className="mt-3 space-y-2 text-muted-foreground">
                    {result.queries.length > 0 ? (
                      <p>使用查詢：{result.queries.join("、")}</p>
                    ) : null}
                    {result.warnings.slice(0, 3).map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ) : null}

          <div className="mt-10 flex flex-col items-center justify-between gap-4 rounded-xl bg-sidebar px-6 py-6 text-sidebar-foreground sm:flex-row">
            <div>
              <p className="font-semibold">需要把來源整理成完整報告？</p>
              <p className="mt-1 text-sm text-sidebar-foreground/70">
                進階工作台可審查來源、建立章節與匯出報告。
              </p>
            </div>
            <Link href="/workspace">
              <Button variant="secondary">
                開啟進階研究工作台
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
