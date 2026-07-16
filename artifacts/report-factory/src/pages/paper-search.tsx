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

const EXAMPLE_QUERIES = [
  "生成式 AI 與學習成效",
  "塑膠微粒對海洋生態的影響",
  "睡眠不足與青少年注意力",
];

const LOADING_MESSAGES = [
  "正在查詢 OpenAlex 與 Crossref 的學術資料…",
  "正在比對題名、作者、DOI 與原文摘要…",
  "正在把論文重點整理成繁體中文摘要…",
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
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">論文重點</h3>
              <Badge variant={summaryBadgeVariant(paper)}>{summaryLabel(paper)}</Badge>
              {paper.summaryConfidence === "low" ? (
                <span className="text-xs text-muted-foreground">資訊有限，引用前請查看原文</span>
              ) : null}
            </div>
            <p className="text-[15px] leading-7 text-foreground/90" data-testid="paper-summary">
              {paper.summary}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {paper.doi ? <span>DOI：{paper.doi}</span> : <span>此來源未提供 DOI</span>}
            </div>
            {paper.abstract ? (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer select-none font-medium text-foreground hover:text-primary">
                  查看原文摘要
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
  const abortRef = useRef<AbortController | null>(null);
  const autoSearchStartedRef = useRef(false);

  const runSearch = useCallback(async (rawQuery: string) => {
    const nextQuery = rawQuery.trim().replace(/\s+/g, " ");
    if (nextQuery.length < 2) {
      setStatus("error");
      setErrorMessage("請輸入至少 2 個字的研究關鍵詞。");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 90_000);

    setQuery(nextQuery);
    setSearchedQuery(nextQuery);
    setStatus("loading");
    setResult(null);
    setErrorMessage(null);
    setLoadingMessageIndex(0);

    const url = new URL(window.location.href);
    url.searchParams.set("q", nextQuery);
    window.history.replaceState(window.history.state, "", url);

    try {
      const response = await fetch(apiUrl("/api/paper-search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: nextQuery, limit: 4 }),
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as
        | PaperSearchResponse
        | { message?: string }
        | null;
      if (!response.ok) {
        const message = data && "message" in data ? data.message : null;
        throw new Error(message || `搜尋服務回傳 HTTP ${response.status}`);
      }
      if (!data || !("papers" in data) || !Array.isArray(data.papers)) {
        throw new Error("搜尋服務回傳了無法辨識的資料，請稍後再試。");
      }
      if (abortRef.current !== controller) return;
      setResult(data);
      setStatus("success");
    } catch (error) {
      if (abortRef.current !== controller) return;
      setStatus("error");
      setErrorMessage(userFacingError(error));
    } finally {
      window.clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

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
              同時查詢學術資料庫、合併重複結果，並根據論文原文摘要整理繁體中文重點。
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
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
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
                <LoaderCircle className="h-7 w-7 animate-spin" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">正在搜尋「{searchedQuery}」</h2>
              <p className="mt-2 text-muted-foreground">
                {LOADING_MESSAGES[loadingMessageIndex]}
              </p>
              <div className="mx-auto mt-7 grid max-w-3xl gap-3 text-left">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="animate-pulse rounded-lg border border-border p-4">
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
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    搜尋完成
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">
                    「{result.query}」找到 {paperCount} 篇論文
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {aiSummaryCount > 0
                      ? `${aiSummaryCount} 篇已完成 AI 繁中摘要，其餘依可用摘要內容保守整理。`
                      : "目前摘要採用安全備援整理；每篇都可開啟原始來源確認。"}
                  </p>
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
