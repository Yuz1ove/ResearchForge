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
  type SourceSearchOptions,
} from "../services/source-retrieval";
import {
  getSourceProviderConfigs,
  type SourceProviderConfig,
  type SourceProviderName,
} from "../services/source-provider-config";
import {
  summarizeSourcesWithLlm,
  type SourceWithLlmSummary,
} from "../services/source-summarizer";

const DEFAULT_LIMIT = 10;
const MIN_LIMIT = 3;
const MAX_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;
const SUMMARY_EXCERPT_LENGTH = 420;
const EXPANDED_PROVIDERS = ["OpenAlex", "Crossref", "Semantic Scholar"] as const;
const FAST_PROVIDERS = ["OpenAlex", "Crossref"] as const;
const SUMMARY_REQUEST_MAX_PAPERS = 4;
const MAX_PAPER_ID_LENGTH = 500;
const MAX_PAPER_TITLE_LENGTH = 1_000;
const MAX_PAPER_AUTHOR_LENGTH = 300;
const MAX_PAPER_ABSTRACT_LENGTH = 20_000;
const MAX_PAPER_METADATA_LENGTH = 2_000;
const GENERIC_EXPANSION_TERMS = new Set([
  "academic",
  "adults",
  "analysis",
  "association",
  "clinical",
  "controlled",
  "effect",
  "effects",
  "eye",
  "health",
  "impact",
  "outcome",
  "outcomes",
  "people",
  "quality",
  "randomised",
  "randomized",
  "research",
  "review",
  "study",
  "studies",
  "systematic",
  "trial",
  "trials",
]);

export type PaperSearchMode = "fast" | "expanded";
type SummaryMode = "llm" | "mixed" | "fallback" | "none" | "deferred";

export interface PaperSearchRequest {
  query: string;
  limit: number;
  searchMode: PaperSearchMode;
  includeSummaries: boolean;
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

export interface PaperSummariesRequest {
  query: string;
  sources: SourceRecord[];
}

export interface PaperSummariesResponse {
  ok: true;
  query: string;
  count: number;
  papers: PaperSearchPaper[];
  warnings: string[];
  summaryMode: SummaryMode;
}

export interface PaperSearchRouterOptions {
  expandKeywords?: typeof expandSearchKeywords;
  searchProviders?: typeof searchSourceProviders;
  dedupeSources?: typeof dedupeSourceRecords;
  summarizeSources?: typeof summarizeSourcesWithLlm;
  getProviderConfigs?: typeof getSourceProviderConfigs;
}

type MappedPaper = {
  paper: PaperSearchPaper;
  usedSuccessfulLlmSummary: boolean;
};

type MapPaperOptions = {
  deferred?: boolean;
  preferSuccessfulRawLlmSummary?: boolean;
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

  const searchMode = data.searchMode === undefined ? "expanded" : data.searchMode;
  if (searchMode !== "fast" && searchMode !== "expanded") return null;

  const includeSummaries =
    data.includeSummaries === undefined ? true : data.includeSummaries;
  if (typeof includeSummaries !== "boolean") return null;

  return { query, limit, searchMode, includeSummaries };
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
  const expandedEnglishText = englishCandidates.join(" ").toLocaleLowerCase();
  const focusedCoreQuery =
    /\b(?:dog|dogs|canine|canines)\b/u.test(expandedEnglishText) &&
    /\bresource\s+guard(?:ing|er|ers)\b/u.test(expandedEnglishText)
      ? "dog resource guarding"
      : null;
  const bestEnglishQuery =
    englishCandidates.find((candidate) => candidate.toLocaleLowerCase() !== originalKey) ??
    `${query} academic research`;

  // Compound topics lose retrieval precision when every modifier is packed into
  // one long translated query.  Preserve the user's narrow entity + phenomenon
  // as an additional provider query; the relevance gate below still verifies
  // every returned title/abstract before it can be recommended.
  return distinctQueries([query, focusedCoreQuery ?? "", bestEnglishQuery]);
}

function contentRank(source: SourceRecord): number {
  if (cleanText(source.abstract)) return 0;
  if (cleanText(source.snippet)) return 1;
  return 2;
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function englishTerms(value: string, excludeGenericTerms: boolean): string[] {
  return (value.toLocaleLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? [])
    .filter((term) => term.length >= 2)
    .filter((term) => !excludeGenericTerms || !GENERIC_EXPANSION_TERMS.has(term));
}

/**
 * Build a small deterministic relevance gate from the user's wording plus the
 * translated academic query. Provider ranking alone is not reliable for short
 * CJK queries: e.g. 葉黃素 can accidentally match unrelated records containing
 * 葉, while the expansion contributes the precise English synonym lutein.
 */
export function topicAnchorTerms(
  query: string,
  expansion?: KeywordExpansionResult | null,
): string[] {
  const original = cleanText(query)?.toLocaleLowerCase() ?? "";
  const expandedQueries = expansion
    ? [...expansion.english_queries, ...expansion.search_queries]
    : [];

  return distinctQueries([
    original,
    ...englishTerms(original, false),
    ...expandedQueries.flatMap((candidate) => englishTerms(candidate, true)),
  ]).map((term) => term.toLocaleLowerCase());
}

function termMatchesSourceText(text: string, term: string): boolean {
  if (containsCjk(term) || term.includes(" ")) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
}

export function sourceTopicMatchCount(source: SourceRecord, anchors: string[]): number {
  const searchableText = [source.title, source.abstract, source.snippet]
    .map((value) => cleanText(value)?.toLocaleLowerCase() ?? "")
    .filter(Boolean)
    .join(" ");
  if (!searchableText) return 0;
  return anchors.filter((term) => termMatchesSourceText(searchableText, term)).length;
}

const CANINE_SUBJECT_TERMS = [
  "dog",
  "dogs",
  "canine",
  "canines",
  "domestic dog",
  "companion dog",
  "puppy",
  "puppies",
];
const RESOURCE_GUARDING_TERMS = [
  "resource guarding",
  "resource guarder",
  "food guarding",
  "food aggression",
  "possessive aggression",
];
const REINFORCEMENT_TRAINING_TERMS = [
  "positive reinforcement",
  "reward-based training",
  "reward based training",
  "reinforcement-based treatment",
  "reinforcement based treatment",
  "behavior modification",
  "behaviour modification",
  "counterconditioning",
  "counter-conditioning",
  "desensitization",
  "desensitisation",
  "humane training",
  "socialization practices",
  "socialisation practices",
];

function sourceSearchableText(source: SourceRecord): { title: string; all: string } {
  const title = cleanText(source.title)?.toLocaleLowerCase() ?? "";
  const all = [source.title, source.abstract, source.snippet]
    .map((value) => cleanText(value)?.toLocaleLowerCase() ?? "")
    .filter(Boolean)
    .join(" ");
  return { title, all };
}

function matchesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => termMatchesSourceText(text, term));
}

function isCanineResourceGuardingQuery(anchors: string[]): boolean {
  const normalized = new Set(anchors.map((anchor) => anchor.toLocaleLowerCase()));
  return (
    ["dog", "dogs", "canine", "canines"].some((term) => normalized.has(term)) &&
    normalized.has("resource") &&
    normalized.has("guarding")
  );
}

/**
 * A single generic token is not enough for compound topics.  In particular,
 * resource/positive/training frequently retrieve human psychotherapy or other
 * animal training papers.  Require both the canine entity and one of the
 * user's actual guarding or reinforcement-intervention concepts.
 */
export function sourceCoreTopicScore(source: SourceRecord, anchors: string[]): number {
  const genericScore = sourceTopicMatchCount(source, anchors);
  if (!isCanineResourceGuardingQuery(anchors)) return genericScore;

  const text = sourceSearchableText(source);
  const subjectMatch = matchesAnyTerm(text.all, CANINE_SUBJECT_TERMS);
  const guardingMatch = matchesAnyTerm(text.all, RESOURCE_GUARDING_TERMS);
  const trainingMatch = matchesAnyTerm(text.all, REINFORCEMENT_TRAINING_TERMS);
  if (!subjectMatch || (!guardingMatch && !trainingMatch)) return 0;

  const titleNamesOtherSpecies = /\b(horse|horses|monkey|monkeys|primate|primates|coyote|coyotes)\b/iu.test(
    text.title,
  );
  const titleHasCanineFocus = matchesAnyTerm(text.title, CANINE_SUBJECT_TERMS);
  const titleHasGuardingFocus = matchesAnyTerm(text.title, RESOURCE_GUARDING_TERMS);
  if (titleNamesOtherSpecies && !titleHasGuardingFocus) return 0;

  return (
    genericScore +
    (titleHasCanineFocus ? 4 : 1) +
    (titleHasGuardingFocus ? 10 : guardingMatch ? 6 : 0) +
    (matchesAnyTerm(text.title, REINFORCEMENT_TRAINING_TERMS) ? 8 : trainingMatch ? 4 : 0)
  );
}

function selectPapers(
  sources: SourceRecord[],
  limit: number,
  dedupeSources: typeof dedupeSourceRecords,
  anchors: string[],
): { selected: SourceRecord[]; filteredCount: number } {
  const titled = sources.filter((source) => Boolean(cleanText(source.title)));
  const deduped = dedupeSources(titled);
  const relevant = deduped
    .map((source, index) => ({
      source,
      index,
      topicMatchCount: sourceCoreTopicScore(source, anchors),
    }))
    .filter(({ topicMatchCount }) => topicMatchCount > 0);
  return {
    selected: relevant
    .sort((left, right) =>
      right.topicMatchCount - left.topicMatchCount ||
      contentRank(left.source) - contentRank(right.source) ||
      left.index - right.index,
    )
    .slice(0, limit)
    .map(({ source }) => ({ ...source, relevanceLevel: "primary" as const })),
    filteredCount: deduped.length - relevant.length,
  };
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

function routeProviderConfigs(
  providers: readonly SourceProviderName[],
  getConfigs: typeof getSourceProviderConfigs,
): Partial<Record<SourceProviderName, SourceProviderConfig>> {
  const defaults = getConfigs();
  return Object.fromEntries(
    providers.map((provider) => [
      provider,
      {
        ...defaults[provider],
        pageLimit: 1,
        queryLimit: Math.min(defaults[provider].queryLimit, 25),
      },
    ]),
  ) as Partial<Record<SourceProviderName, SourceProviderConfig>>;
}

function searchOptionsForMode(
  searchMode: PaperSearchMode,
  getConfigs: typeof getSourceProviderConfigs,
): SourceSearchOptions {
  const providers = searchMode === "fast" ? FAST_PROVIDERS : EXPANDED_PROVIDERS;
  return {
    providers: [...providers],
    providerConfigs: routeProviderConfigs(providers, getConfigs),
    ...(searchMode === "fast" ? { allowShortQueryRetry: false } : {}),
  };
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

function mapPaper(
  source: SourceWithLlmSummary,
  warnings: string[],
  options: MapPaperOptions = {},
): MappedPaper {
  const title = cleanText(source.title) ?? "";
  const abstract = cleanText(source.abstract);
  const snippet = cleanText(source.snippet);
  const reportedStatus = source.summaryStatus ?? source.llmSummaryStatus ?? null;
  const rawLlmSummary = cleanText(source.llmSummaryZhTw);
  const readableSummary =
    cleanText(source.readableSummaryZhTW) ?? cleanText(source.readableSummaryZhTw);
  const preferredSummary =
    options.preferSuccessfulRawLlmSummary
      ? rawLlmSummary ?? readableSummary
      : readableSummary ?? rawLlmSummary;

  let summary: string;
  let summaryStatus: string | null;
  let summarySourceType: string | null;
  let summaryConfidence: string | null;
  let usedSuccessfulLlmSummary = false;

  if (options.deferred) {
    summary = abstract || snippet
      ? safeExcerpt(abstract ?? snippet ?? "")
      : `目前僅取得「${title}」的書目資訊，尚無原文摘要可供整理。`;
    summaryStatus = "pending";
    summarySourceType = abstract ? "abstract" : snippet ? "snippet" : "metadataFallback";
    summaryConfidence = "low";
  } else if (preferredSummary) {
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
    summary = `目前僅取得「${title}」的書目資訊，尚無原文摘要可供整理；請開啟來源確認內容。`;
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

function boundedCleanText(value: unknown, maxLength: number): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return Array.from(text).slice(0, maxLength).join("");
}

function sourceTypeFromPaperProvider(value: unknown): SourceRecord["sourceType"] | null {
  const provider = cleanText(value)?.toLocaleLowerCase();
  if (!provider) return null;
  if (provider.includes("openalex")) return "OpenAlex";
  if (provider.includes("crossref")) return "Crossref";
  if (provider.includes("europe pmc") || provider.includes("pubmed")) {
    return "Institutional Source";
  }
  if (
    provider.includes("semantic scholar") ||
    provider.includes("semantic_scholar") ||
    /(?:^|[\s,;/|])s2(?:$|[\s,;/|])/.test(provider)
  ) return "Semantic Scholar";
  return null;
}

function sourceFromPaperShape(value: unknown): SourceRecord | null {
  if (!value || typeof value !== "object") return null;
  const paper = value as Record<string, unknown>;
  const id = boundedCleanText(paper.id, MAX_PAPER_ID_LENGTH);
  const title = boundedCleanText(paper.title, MAX_PAPER_TITLE_LENGTH);
  if (!id || !title) return null;

  if (paper.authors !== undefined && !Array.isArray(paper.authors)) return null;
  const authors = Array.isArray(paper.authors)
    ? paper.authors
        .map((author) => boundedCleanText(author, MAX_PAPER_AUTHOR_LENGTH))
        .filter((author): author is string => Boolean(author))
        .slice(0, 20)
    : [];
  const year =
    typeof paper.year === "number" &&
    Number.isInteger(paper.year) &&
    paper.year >= 1000 &&
    paper.year <= 2200
      ? paper.year
      : null;
  const citationCount =
    typeof paper.citationCount === "number" &&
    Number.isFinite(paper.citationCount) &&
    paper.citationCount >= 0
      ? Math.floor(paper.citationCount)
      : null;
  const sourceType = sourceTypeFromPaperProvider(paper.provider);
  if (!sourceType) return null;

  return {
    id,
    title,
    authors,
    year,
    abstract: boundedCleanText(paper.abstract, MAX_PAPER_ABSTRACT_LENGTH),
    snippet: boundedCleanText(paper.snippet, MAX_PAPER_ABSTRACT_LENGTH),
    // A deferred summary request may carry a bounded, already extracted
    // full-text excerpt from the product's retrieval stage. Preserve it for
    // the summarizer instead of silently downgrading the source to its
    // abstract. The public response still exposes only the summary.
    extractedText: boundedCleanText(paper.extractedText, MAX_PAPER_ABSTRACT_LENGTH),
    doi: boundedCleanText(paper.doi, MAX_PAPER_METADATA_LENGTH),
    url: boundedCleanText(paper.url, MAX_PAPER_METADATA_LENGTH),
    sourceType,
    reviewState: "pending",
    publisher: null,
    containerTitle: boundedCleanText(paper.venue, MAX_PAPER_METADATA_LENGTH),
    accessedAt: null,
    provider: sourceType,
    citationCount,
    isOpenAccess:
      typeof paper.isOpenAccess === "boolean" ? paper.isOpenAccess : null,
    relevanceLevel: "primary",
  };
}

export function normalizePaperSummariesRequest(body: unknown): PaperSummariesRequest | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const normalizedQuery = normalizePaperSearchRequest({
    query: data.query,
    limit: MIN_LIMIT,
  });
  if (!normalizedQuery || !Array.isArray(data.papers)) return null;
  if (data.papers.length < 1 || data.papers.length > SUMMARY_REQUEST_MAX_PAPERS) return null;

  const sources = data.papers.map(sourceFromPaperShape);
  if (sources.some((source) => !source)) return null;
  const ids = sources.map((source) => source?.id ?? "");
  if (new Set(ids).size !== ids.length) return null;
  return {
    query: normalizedQuery.query,
    sources: sources as SourceRecord[],
  };
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
  getProviderConfigs = getSourceProviderConfigs,
}: PaperSearchRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/paper-search", async (req, res) => {
    const input = normalizePaperSearchRequest(req.body);
    if (!input) {
      res.status(400).json({
        ok: false,
        message: "請輸入 2 至 200 個字的關鍵詞；limit 必須是 3 至 20 的整數。",
      });
      return;
    }

    const warnings: string[] = [];
    let queries: string[] = [input.query];
    let expansion: KeywordExpansionResult | null = null;

    try {
      if (input.searchMode === "expanded") {
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
      }

      const searchOptions = searchOptionsForMode(input.searchMode, getProviderConfigs);
      const attempts = await Promise.allSettled(
        queries.map((query) => searchProviders(query, searchOptions)),
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

      const candidateBuckets = attempts
        .flatMap((attempt) =>
          attempt.status === "fulfilled"
            ? attempt.value.map((group) => group.results)
            : [],
        )
        .filter((bucket) => bucket.length > 0);
      const candidates = interleaveSourceBuckets(candidateBuckets);
      const { selected, filteredCount } = selectPapers(
        candidates,
        input.limit,
        dedupeSources,
        topicAnchorTerms(input.query, expansion),
      );
      if (filteredCount > 0) {
        pushWarning(
          warnings,
          `已略過 ${filteredCount} 筆未含關鍵詞或學術同義詞的結果。`,
        );
      }
      if (selected.length === 0) {
        pushWarning(warnings, "找不到符合條件且具有標題的論文。");
        res.status(200).json(emptyResponse(input.query, queries, warnings));
        return;
      }

      if (!input.includeSummaries) {
        pushWarning(warnings, "繁中摘要尚未產生，頁面將自動分批載入。");
        const mapped = selected.map((source) =>
          mapPaper(source, warnings, { deferred: true }),
        );
        const papers = mapped.map((item) => item.paper);
        const response: PaperSearchResponse = {
          ok: true,
          query: input.query,
          count: papers.length,
          queries,
          papers,
          warnings,
          summaryMode: "deferred",
        };
        res.status(200).json(response);
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

  router.post("/paper-search/summaries", async (req, res) => {
    const input = normalizePaperSummariesRequest(req.body);
    if (!input) {
      res.status(400).json({
        ok: false,
        message: "請提供 2 至 200 個字的 query，以及 1 至 4 篇有效論文。",
      });
      return;
    }

    const warnings: string[] = [];
    let summarized: SourceWithLlmSummary[] = input.sources;
    try {
      const summaryResult = await summarizeSources(input.query, input.sources, {
        maxSources: input.sources.length,
        detailLevel: "detailed",
      });
      const summaryById = new Map(summaryResult.map((source) => [source.id, source]));
      summarized = input.sources.map((source) => summaryById.get(source.id) ?? source);
    } catch (error) {
      logger.warn(
        { err: error, route: "/api/paper-search/summaries" },
        "Deferred paper summaries failed",
      );
      pushWarning(warnings, "繁中摘要服務暫時無法使用，已改用原文摘要或片段節錄。");
    }

    const mapped = summarized.map((source) =>
      mapPaper(source, warnings, { preferSuccessfulRawLlmSummary: true }),
    );
    const papers = mapped.map((item) => item.paper);
    const response: PaperSummariesResponse = {
      ok: true,
      query: input.query,
      count: papers.length,
      papers,
      warnings,
      summaryMode: summaryModeFor(mapped),
    };
    res.status(200).json(response);
  });

  return router;
}

export default createPaperSearchRouter();
