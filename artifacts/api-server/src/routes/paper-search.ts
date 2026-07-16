import { Router, type IRouter } from "express";
import {
  dedupeSourceRecords,
  type SourceRecord,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  buildFallbackKeywordExpansion,
  expandSearchKeywords,
  type KeywordExpansionResult,
} from "../services/keyword-expansion";
import {
  searchSourceProviders,
  type SourceProviderSearchResult,
} from "../services/source-retrieval";
import {
  summarizeSourcesWithLlm,
  type SourceWithLlmSummary,
} from "../services/source-summarizer";

const DEFAULT_LIMIT = 6;
const MIN_LIMIT = 3;
const MAX_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;
const SUMMARY_EXCERPT_LENGTH = 420;
const PROVIDER_PRIORITY = ["OpenAlex", "Crossref", "Semantic Scholar"] as const;

type SummaryMode = "llm" | "mixed" | "fallback" | "none";

export interface PaperSearchRequest {
  query: string;
  limit: number;
}

export interface PaperSearchPaper {
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

export interface PaperSearchResponse {
  ok: true;
  query: string;
  count: number;
  queries: string[];
  papers: PaperSearchPaper[];
  warnings: string[];
  summaryMode: SummaryMode;
}

export interface PaperSearchRouterOptions {
  expandKeywords?: typeof expandSearchKeywords;
  searchProviders?: typeof searchSourceProviders;
  dedupeSources?: typeof dedupeSourceRecords;
  summarizeSources?: typeof summarizeSourcesWithLlm;
}

type MappedPaper = {
  paper: PaperSearchPaper;
  usedSuccessfulLlmSummary: boolean;
};

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function textLength(value: string): number {
  return Array.from(value).length;
}

export function normalizePaperSearchRequest(body: unknown): PaperSearchRequest | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  if (typeof data.query !== "string") return null;

  const query = data.query.trim();
  const queryLength = textLength(query);
  if (queryLength < MIN_QUERY_LENGTH || queryLength > MAX_QUERY_LENGTH) return null;

  const limit = data.limit === undefined ? DEFAULT_LIMIT : data.limit;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < MIN_LIMIT ||
    limit > MAX_LIMIT
  ) {
    return null;
  }

  return { query, limit };
}

function distinctQueries(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const query = cleanText(value);
    if (!query) continue;
    const key = query.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(query);
  }
  return result;
}

function searchQueriesFor(query: string, expansion: KeywordExpansionResult): string[] {
  const originalKey = query.toLocaleLowerCase();
  const englishCandidates = distinctQueries([
    ...expansion.english_queries,
    ...expansion.search_queries.filter((candidate) => /[a-z]/i.test(candidate)),
  ]);
  const bestEnglishQuery =
    englishCandidates.find((candidate) => candidate.toLocaleLowerCase() !== originalKey) ??
    `${query} academic research`;

  return distinctQueries([query, bestEnglishQuery]);
}

function providerRank(source: SourceRecord): number {
  const provider = cleanText(source.provider) ?? source.sourceType;
  const index = PROVIDER_PRIORITY.indexOf(provider as (typeof PROVIDER_PRIORITY)[number]);
  return index === -1 ? PROVIDER_PRIORITY.length : index;
}

function contentRank(source: SourceRecord): number {
  if (cleanText(source.abstract)) return 0;
  if (cleanText(source.snippet)) return 1;
  return 2;
}

function selectPapers(
  sources: SourceRecord[],
  limit: number,
  dedupeSources: typeof dedupeSourceRecords,
): SourceRecord[] {
  const titled = sources.filter((source) => Boolean(cleanText(source.title)));
  const deduped = dedupeSources(titled);
  return deduped
    .map((source, index) => ({ source, index }))
    .sort((left, right) =>
      contentRank(left.source) - contentRank(right.source) ||
      providerRank(left.source) - providerRank(right.source) ||
      left.index - right.index,
    )
    .slice(0, limit)
    .map(({ source }) => ({ ...source, relevanceLevel: "primary" as const }));
}

/**
 * Provider APIs return dozens of records per query. Concatenating those arrays
 * would let the first (often Chinese) query occupy every visible slot and make
 * the translated academic query irrelevant. Round-robin the query/provider
 * buckets so both searches can contribute before ranking and deduplication.
 */
function interleaveSourceBuckets(buckets: SourceRecord[][]): SourceRecord[] {
  const interleaved: SourceRecord[] = [];
  const longestBucket = buckets.reduce(
    (longest, bucket) => Math.max(longest, bucket.length),
    0,
  );
  for (let index = 0; index < longestBucket; index += 1) {
    for (const bucket of buckets) {
      const source = bucket[index];
      if (source) interleaved.push(source);
    }
  }
  return interleaved;
}

function safeExcerpt(value: string): string {
  const text = cleanText(value) ?? "";
  if (textLength(text) <= SUMMARY_EXCERPT_LENGTH) return text;
  const characters = Array.from(text).slice(0, SUMMARY_EXCERPT_LENGTH);
  const truncated = characters.join("").replace(/\s+\S*$/, "").trim();
  return `${truncated || characters.join("").trim()}…`;
}

function pushWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function mapPaper(source: SourceWithLlmSummary, warnings: string[]): MappedPaper {
  const title = cleanText(source.title) ?? "";
  const abstract = cleanText(source.abstract);
  const snippet = cleanText(source.snippet);
  const preferredSummary =
    cleanText(source.readableSummaryZhTW) ??
    cleanText(source.readableSummaryZhTw) ??
    cleanText(source.llmSummaryZhTw);
  const reportedStatus = source.summaryStatus ?? source.llmSummaryStatus ?? null;

  let summary: string;
  let summaryStatus: string | null;
  let summarySourceType: string | null;
  let summaryConfidence: string | null;
  let usedSuccessfulLlmSummary = false;

  if (preferredSummary) {
    summary = preferredSummary;
    summaryStatus = reportedStatus ?? "success";
    summarySourceType =
      source.summarySourceType ??
      (abstract ? "abstract" : snippet ? "snippet" : "metadataFallback");
    summaryConfidence =
      source.summaryConfidence ??
      (summarySourceType === "metadataFallback" ? "low" : "medium");
    usedSuccessfulLlmSummary = summaryStatus === "success";
  } else if (abstract || snippet) {
    const fallbackText = abstract ?? snippet ?? "";
    summary = safeExcerpt(fallbackText);
    summaryStatus = "fallback";
    summarySourceType = abstract ? "abstract" : "snippet";
    summaryConfidence = "low";
    pushWarning(
      warnings,
      `「${title}」未取得繁中摘要，已顯示原文${abstract ? "摘要" : "片段"}節錄。`,
    );
  } else {
    summary = "";
    summaryStatus = "unavailable";
    summarySourceType = "metadataFallback";
    summaryConfidence = "low";
    pushWarning(warnings, `「${title}」沒有可用摘要，未產生推測性內容。`);
  }

  return {
    paper: {
      id: source.id,
      title,
      authors: source.authors
        .map((author) => cleanText(author))
        .filter((author): author is string => Boolean(author)),
      year: source.year,
      venue: cleanText(source.containerTitle) ?? cleanText(source.publisher),
      doi: cleanText(source.doi),
      url: cleanText(source.url),
      provider: cleanText(source.provider) ?? cleanText(source.sourceType),
      citationCount:
        typeof source.citationCount === "number" && Number.isFinite(source.citationCount)
          ? source.citationCount
          : null,
      isOpenAccess:
        typeof source.isOpenAccess === "boolean" ? source.isOpenAccess : null,
      abstract,
      summary,
      summaryStatus,
      summarySourceType,
      summaryConfidence,
    },
    usedSuccessfulLlmSummary,
  };
}

function summaryModeFor(mapped: MappedPaper[]): SummaryMode {
  if (mapped.length === 0) return "none";
  const successfulLlmCount = mapped.filter((item) => item.usedSuccessfulLlmSummary).length;
  if (successfulLlmCount === mapped.length) return "llm";
  if (successfulLlmCount > 0) return "mixed";
  return "fallback";
}

function emptyResponse(query: string, queries: string[], warnings: string[]): PaperSearchResponse {
  return {
    ok: true,
    query,
    count: 0,
    queries,
    papers: [],
    warnings,
    summaryMode: "none",
  };
}

export function createPaperSearchRouter({
  expandKeywords = expandSearchKeywords,
  searchProviders = searchSourceProviders,
  dedupeSources = dedupeSourceRecords,
  summarizeSources = summarizeSourcesWithLlm,
}: PaperSearchRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/paper-search", async (req, res) => {
    const input = normalizePaperSearchRequest(req.body);
    if (!input) {
      res.status(400).json({
        ok: false,
        message: "請輸入 2 至 200 個字的關鍵詞；limit 必須是 3 至 10 的整數。",
      });
      return;
    }

    const warnings: string[] = [];
    let queries: string[] = [input.query];

    try {
      let expansion: KeywordExpansionResult;
      try {
        expansion = await expandKeywords({
          topic: input.query,
          sourceMode: "academic",
          language: "zh-TW",
        });
      } catch (error) {
        logger.warn({ err: error, route: "/api/paper-search" }, "Paper keyword expansion failed");
        expansion = buildFallbackKeywordExpansion(
          { topic: input.query, sourceMode: "academic", language: "zh-TW" },
          "Keyword expansion failed; deterministic fallback used.",
          "failed",
        );
      }

      queries = searchQueriesFor(input.query, expansion);
      if (expansion.fallback_used) {
        pushWarning(warnings, "英文檢索詞由備援規則產生，搜尋範圍可能較廣。");
      }

      const attempts = await Promise.allSettled(
        queries.map((query) =>
          searchProviders(query, {
            providers: [...PROVIDER_PRIORITY],
          }),
        ),
      );
      const groups: SourceProviderSearchResult[] = [];
      let rejectedSearchCount = 0;
      for (const attempt of attempts) {
        if (attempt.status === "fulfilled") {
          groups.push(...attempt.value);
        } else {
          rejectedSearchCount += 1;
          logger.warn(
            { err: attempt.reason, route: "/api/paper-search" },
            "Paper provider search failed",
          );
        }
      }

      const failedProviders = distinctQueries(
        groups.filter((group) => !group.ok).map((group) => group.provider),
      );
      if (failedProviders.length > 0 || rejectedSearchCount > 0) {
        const providerSuffix = failedProviders.length > 0
          ? `（${failedProviders.join("、")}）`
          : "";
        pushWarning(
          warnings,
          `部分論文來源暫時無法使用${providerSuffix}，已保留其餘可用結果。`,
        );
      }

      const candidateBuckets = PROVIDER_PRIORITY.flatMap((provider) =>
        attempts.flatMap((attempt) =>
          attempt.status === "fulfilled"
            ? [
                attempt.value
                  .filter((group) => group.provider === provider)
                  .flatMap((group) => group.results),
              ]
            : [],
        ),
      ).filter((bucket) => bucket.length > 0);
      const candidates = interleaveSourceBuckets(candidateBuckets);
      const selected = selectPapers(candidates, input.limit, dedupeSources);
      if (selected.length === 0) {
        pushWarning(warnings, "找不到符合條件且具有標題的論文。");
        res.status(200).json(emptyResponse(input.query, queries, warnings));
        return;
      }

      let summarized: SourceWithLlmSummary[] = selected;
      try {
        const summaryResult = await summarizeSources(input.query, selected, {
          maxSources: selected.length,
        });
        const summaryById = new Map(summaryResult.map((source) => [source.id, source]));
        summarized = selected.map((source) => summaryById.get(source.id) ?? source);
      } catch (error) {
        logger.warn({ err: error, route: "/api/paper-search" }, "Paper summaries failed");
        pushWarning(warnings, "繁中摘要服務暫時無法使用，已改用原文摘要或片段節錄。");
      }

      const mapped = summarized.map((source) => mapPaper(source, warnings));
      const papers = mapped.map((item) => item.paper);
      const response: PaperSearchResponse = {
        ok: true,
        query: input.query,
        count: papers.length,
        queries,
        papers,
        warnings,
        summaryMode: summaryModeFor(mapped),
      };
      res.status(200).json(response);
    } catch (error) {
      logger.warn({ err: error, route: "/api/paper-search" }, "Paper search failed");
      pushWarning(warnings, "論文搜尋暫時無法使用，請稍後再試。");
      res.status(200).json(emptyResponse(input.query, queries, warnings));
    }
  });

  return router;
}

export default createPaperSearchRouter();
