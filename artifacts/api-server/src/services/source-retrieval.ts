import {
  dedupeSourceRecords,
  normalizeSourceRecord,
  type SourceRecord,
} from "@workspace/api-zod";
import {
  getSourceProviderConfigs,
  SOURCE_PROVIDER_NAMES,
  type SourceProviderConfig,
  type SourceProviderName,
} from "./source-provider-config";

const DEFAULT_MIN_SOURCES = 10;
const DEFAULT_TARGET_SOURCES = 20;

export type SourceProvider = SourceProviderName;
export type SourceSearchErrorCode = "timeout" | "api-failure";
export type SourceSearchDiagnosticsStatus =
  | "success"
  | "partial_success"
  | "insufficient_sources"
  | "empty"
  | "failed";

export type SourceSearchStage = "academic" | "official" | "media";

export interface SourceSearchProviderFailure {
  provider: SourceProvider;
  query: string;
  stage: SourceSearchStage;
  error_type: SourceSearchErrorCode;
  error_message: string;
}

export interface SourceSearchDiagnostics {
  resultCount: number;
  resultTarget: number;
  minSources: number;
  targetSources: number;
  queryCount: number;
  providerCount: number;
  fallbackUsed: boolean;
  status: SourceSearchDiagnosticsStatus;
  providerFailures: SourceSearchProviderFailure[];
  providerResultCounts: Array<{
    provider: SourceProvider;
    query: string;
    stage: SourceSearchStage;
    resultCount: number;
    ok: boolean;
  }>;
  warnings: string[];
}

export type SourceFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface SourceSearchOptions {
  fetchImpl?: SourceFetch;
  providerConfigs?: Partial<Record<SourceProvider, SourceProviderConfig>>;
  stage?: SourceSearchStage;
  minSources?: number;
  targetSources?: number;
}

export interface SourceSearchResultWithDiagnostics {
  sources: SourceRecord[];
  diagnostics: SourceSearchDiagnostics;
  provider_status: SourceProviderSearchResult[];
}

export interface SourceProviderSearchResult {
  ok: boolean;
  provider: SourceProvider;
  query: string;
  stage: SourceSearchStage;
  results: SourceRecord[];
  error_type: SourceSearchErrorCode | null;
  error_message: string | null;
}

export class SourceSearchError extends Error {
  constructor(
    readonly code: SourceSearchErrorCode,
    readonly provider: SourceProvider | "all",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceSearchError";
  }
}

type CrossrefAuthor = {
  given?: string;
  family?: string;
  name?: string;
};

type CrossrefDate = {
  "date-parts"?: number[][];
};

type CrossrefWork = {
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: CrossrefDate;
  published?: CrossrefDate;
  "published-print"?: CrossrefDate;
  "published-online"?: CrossrefDate;
  abstract?: string;
  DOI?: string;
  URL?: string;
  publisher?: string;
  "container-title"?: string[];
};

type CrossrefResponse = {
  message?: {
    items?: CrossrefWork[];
  };
};

type SemanticScholarAuthor = {
  name?: string;
};

type SemanticScholarPaper = {
  title?: string;
  authors?: SemanticScholarAuthor[];
  year?: number;
  abstract?: string;
  externalIds?: {
    DOI?: string;
  };
  url?: string;
  venue?: string;
};

type SemanticScholarResponse = {
  data?: SemanticScholarPaper[];
};

function firstText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstText(item);
      if (text) return text;
    }
  }

  return null;
}

function stripMarkup(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const trimmed = doi.trim();
  return trimmed ? trimmed : null;
}

function normalizeUrl(url: string | null | undefined, doi: string | null): string | null {
  if (url?.trim()) return url.trim();
  if (doi) return `https://doi.org/${doi}`;
  return null;
}

function crossrefYear(work: CrossrefWork): number | null {
  const dates = [
    work.published,
    work["published-print"],
    work["published-online"],
    work.issued,
  ];

  for (const date of dates) {
    const year = date?.["date-parts"]?.[0]?.[0];
    if (typeof year === "number") return year;
  }

  return null;
}

function crossrefAuthors(authors: CrossrefAuthor[] | undefined): string[] {
  if (!authors?.length) return [];

  return authors
    .map((author) => {
      if (author.name?.trim()) return author.name.trim();
      const fullName = [author.given, author.family]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(" ")
        .trim();
      return fullName || null;
    })
    .filter((name): name is string => Boolean(name));
}

export function normalizeCrossrefWork(work: CrossrefWork): SourceRecord | null {
  const title = firstText(work.title);
  if (!title) return null;

  const doi = normalizeDoi(work.DOI);
  return normalizeSourceRecord({
    title,
    authors: crossrefAuthors(work.author),
    year: crossrefYear(work),
    abstract: stripMarkup(work.abstract),
    doi,
    url: normalizeUrl(work.URL, doi),
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: work.publisher ?? null,
    containerTitle: firstText(work["container-title"]),
    accessedAt: null,
  });
}

export function normalizeSemanticScholarPaper(paper: SemanticScholarPaper): SourceRecord | null {
  const title = firstText(paper.title);
  if (!title) return null;

  const doi = normalizeDoi(paper.externalIds?.DOI);
  return normalizeSourceRecord({
    title,
    authors: paper.authors?.map((author) => author.name?.trim()).filter((name): name is string => Boolean(name)) ?? [],
    year: typeof paper.year === "number" ? paper.year : null,
    abstract: stripMarkup(paper.abstract),
    doi,
    url: normalizeUrl(paper.url, doi),
    sourceType: "Semantic Scholar",
    reviewState: "pending",
    publisher: null,
    containerTitle: paper.venue ?? null,
    accessedAt: null,
  });
}

function sourceProviderConfigs(options?: SourceSearchOptions): Record<SourceProvider, SourceProviderConfig> {
  const defaults = getSourceProviderConfigs();
  return {
    Crossref: options?.providerConfigs?.Crossref ?? defaults.Crossref,
    OpenAlex: options?.providerConfigs?.OpenAlex ?? defaults.OpenAlex,
    "Semantic Scholar": options?.providerConfigs?.["Semantic Scholar"] ?? defaults["Semantic Scholar"],
    Web: options?.providerConfigs?.Web ?? defaults.Web,
  };
}

function cleanSnippet(text: string | null | undefined, maxLength = 260): string | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const chars = Array.from(cleaned);
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join("").trim()}…` : cleaned;
}

function decodeOpenAlexAbstract(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value) as Record<string, string[]>;
    const entries = data ? Object.values(data).flat() : [];
    return cleanSnippet(entries.join(" "));
  } catch {
    return cleanSnippet(value);
  }
}

type OpenAlexAuthor = {
  author?: {
    display_name?: string;
  };
};

type OpenAlexWork = {
  display_name?: string;
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]>;
  abstract?: string;
  doi?: string | null;
  id?: string;
  primary_location?: {
    landing_page_url?: string | null;
    source?: {
      display_name?: string | null;
    };
  };
  host_venue?: {
    display_name?: string | null;
  };
  authorships?: OpenAlexAuthor[];
};

type OpenAlexResponse = {
  results?: OpenAlexWork[];
};

type PublicWebSource = {
  title?: string;
  url?: string;
  snippet?: string;
  source?: string;
};

function openAlexAbstract(work: OpenAlexWork): string | null {
  if (work.abstract) return decodeOpenAlexAbstract(work.abstract);
  const index = work.abstract_inverted_index;
  if (!index) return null;

  const words = Object.entries(index)
    .flatMap(([word, positions]) => positions.map((position) => ({ word, position })))
    .sort((a, b) => a.position - b.position)
    .map((item) => item.word);

  return cleanSnippet(words.join(" "));
}

function openAlexUrl(work: OpenAlexWork, doi: string | null): string | null {
  if (work.primary_location?.landing_page_url?.trim()) return work.primary_location.landing_page_url.trim();
  if (doi) return `https://doi.org/${doi}`;
  if (work.id?.trim()) return work.id.trim();
  return null;
}

function normalizeOpenAlexWork(work: OpenAlexWork): SourceRecord | null {
  const title = firstText(work.display_name);
  if (!title) return null;

  const doi = normalizeDoi(work.doi);
  const authors = work.authorships?.map((item) => item.author?.display_name?.trim()).filter((name): name is string => Boolean(name)) ?? [];
  const venue = firstText(work.host_venue?.display_name ?? work.primary_location?.source?.display_name ?? null);

  return normalizeSourceRecord({
    title,
    authors,
    year: typeof work.publication_year === "number" ? work.publication_year : null,
    abstract: openAlexAbstract(work),
    doi,
    url: normalizeUrl(openAlexUrl(work, doi), doi),
    sourceType: "OpenAlex" as SourceProvider,
    reviewState: "pending",
    publisher: null,
    containerTitle: venue,
    accessedAt: null,
  });
}

function sourceTypeFromStage(_stage: SourceSearchStage, _url: string | null | undefined, _title: string): SourceRecord["sourceType"] {
  return "Web";
}

function normalizePublicWebSource(source: PublicWebSource, stage: SourceSearchStage): SourceRecord | null {
  const title = firstText(source.title);
  if (!title) return null;

  const url = cleanSnippet(source.url, 280);
  const snippet = cleanSnippet(source.snippet, 320);
  return normalizeSourceRecord({
    title,
    authors: source.source?.trim() ? [source.source.trim()] : [],
    year: null,
    abstract: snippet,
    doi: null,
    url,
    sourceType: sourceTypeFromStage(stage, url, title),
    reviewState: "pending",
    publisher: source.source ?? null,
    containerTitle: source.source ?? null,
    accessedAt: null,
  });
}

async function fetchJson<T>(
  provider: SourceProvider,
  url: URL,
  config: SourceProviderConfig,
  fetchImpl: SourceFetch = fetch,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: config.headers,
    });

    if (!response.ok) {
      throw new SourceSearchError(
        "api-failure",
        provider,
        `${provider} returned HTTP ${response.status}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof SourceSearchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SourceSearchError("timeout", provider, `${provider} request timed out`, error);
    }
    throw new SourceSearchError("api-failure", provider, `${provider} request failed`, error);
  } finally {
    clearTimeout(timeout);
  }
}

async function searchCrossref(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const url = new URL(config.endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(config.queryLimit));
  url.searchParams.set("select", "title,author,issued,published,published-print,published-online,abstract,DOI,URL,publisher,container-title");
  if (config.mailto) url.searchParams.set("mailto", config.mailto);

  const data = await fetchJson<CrossrefResponse>("Crossref", url, config, options?.fetchImpl);
  return (data.message?.items ?? [])
    .map(normalizeCrossrefWork)
    .filter((source): source is SourceRecord => Boolean(source));
}

async function searchOpenAlex(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const url = new URL(config.endpoint);
  url.searchParams.set(config.queryParam ?? "search", query);
  url.searchParams.set("per-page", String(config.queryLimit));
  url.searchParams.set("sort", "relevance_score:desc");
  if (config.selectParam) url.searchParams.set("select", config.selectParam);

  const data = await fetchJson<OpenAlexResponse>("OpenAlex", url, config, options?.fetchImpl);
  return (data.results ?? [])
    .map(normalizeOpenAlexWork)
    .filter((source): source is SourceRecord => Boolean(source));
}

function decodeBingRedirect(url: string): string {
  try {
    const parsed = new URL(url);
    const encoded = parsed.searchParams.get("u");
    if (!encoded) return url;
    const trimmed = encoded.startsWith("a1") ? encoded.slice(2) : encoded;
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return decoded.startsWith("http") ? decoded : url;
  } catch {
    return url;
  }
}

function extractBingResults(markdown: string): PublicWebSource[] {
  const results: PublicWebSource[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = line.match(/^\d+\.\s+##\s+\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
    if (!match) continue;
    const title = match[1]?.trim();
    const url = decodeBingRedirect(match[2]?.trim() ?? "");
    let snippet = "";
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j] ?? "";
      if (/^\d+\.\s+##\s+\[/.test(candidate)) break;
      if (candidate.trim()) {
        snippet = candidate.trim();
        break;
      }
    }
    results.push({
      title,
      url,
      snippet,
      source: "Bing",
    });
    if (results.length >= 8) break;
  }
  return results;
}

async function searchPublicWeb(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const endpoint = new URL(config.endpoint);
  endpoint.searchParams.set(config.queryParam ?? "q", query);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const response = await fetchImpl(endpoint, {
    signal: AbortSignal.timeout(config.timeoutMs),
    headers: config.headers,
  });

  if (!response.ok) {
    throw new SourceSearchError("api-failure", "Web", `Web search returned HTTP ${response.status}`);
  }

  const markdown = await response.text();
  const stage = options?.stage ?? config.searchStage ?? "media";
  return extractBingResults(markdown)
    .map((source) => normalizePublicWebSource(source, stage))
    .filter((source): source is SourceRecord => Boolean(source));
}

async function searchSemanticScholar(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const url = new URL(config.endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(config.queryLimit));
  url.searchParams.set("fields", "title,authors,year,abstract,externalIds,url,venue");

  const data = await fetchJson<SemanticScholarResponse>("Semantic Scholar", url, config, options?.fetchImpl);

  return (data.data ?? [])
    .map(normalizeSemanticScholarPaper)
    .filter((source): source is SourceRecord => Boolean(source));
}

export function dedupeSources(sources: SourceRecord[]): SourceRecord[] {
  return dedupeSourceRecords(sources);
}

async function searchProviderOrThrow(
  provider: SourceProvider,
  query: string,
  config: SourceProviderConfig,
  options?: SourceSearchOptions,
): Promise<SourceRecord[]> {
  if (provider === "Crossref") return searchCrossref(query, config, options);
  if (provider === "OpenAlex") return searchOpenAlex(query, config, options);
  if (provider === "Semantic Scholar") return searchSemanticScholar(query, config, options);
  return searchPublicWeb(query, config, options);
}

function providerErrorResult(
  provider: SourceProvider,
  query: string,
  stage: SourceSearchStage,
  error: unknown,
): SourceProviderSearchResult {
  if (error instanceof SourceSearchError) {
    return {
      ok: false,
      provider,
      query,
      stage,
      results: [],
      error_type: error.code,
      error_message: error.message,
    };
  }

  const message = error instanceof Error ? error.message : "Source provider request failed";
  return {
    ok: false,
    provider,
    query,
    stage,
    results: [],
    error_type: "api-failure",
    error_message: message,
  };
}

export async function searchSourceProvider(
  provider: SourceProvider,
  query: string,
  options?: SourceSearchOptions,
): Promise<SourceProviderSearchResult> {
  const trimmedQuery = query.trim();
  const stage = options?.stage ?? "academic";
  const config = sourceProviderConfigs(options)[provider];
  if (!trimmedQuery) {
    return {
      ok: true,
      provider,
      query: trimmedQuery,
      stage,
      results: [],
      error_type: null,
      error_message: null,
    };
  }

  try {
    const results = await searchProviderOrThrow(provider, trimmedQuery, config, options);
    return {
      ok: true,
      provider,
      query: trimmedQuery,
      stage,
      results,
      error_type: null,
      error_message: null,
    };
  } catch (error) {
    return providerErrorResult(provider, trimmedQuery, stage, error);
  }
}

export async function searchSourceProviders(
  query: string,
  options?: SourceSearchOptions,
): Promise<SourceProviderSearchResult[]> {
  const stage = options?.stage ?? "academic";
  const providers =
    stage === "academic"
      ? ["Crossref", "OpenAlex", "Semantic Scholar"] as const
      : stage === "official"
        ? ["Web", "Crossref"] as const
        : ["Web"] as const;
  const settled = await Promise.allSettled(providers.map((provider) => searchSourceProvider(provider, query, options)));
  return settled.map((item, index) => {
    const provider = providers[index];
    if (item.status === "fulfilled") return item.value;
    return providerErrorResult(provider, query.trim(), stage, item.reason);
  });
}

export function buildSourceSearchDiagnostics(
  providerResults: SourceProviderSearchResult[],
  minSources: number,
  targetSources: number,
  fallbackUsed: boolean,
): SourceSearchDiagnostics {
  const providerFailures = providerResults
    .filter((result) => !result.ok)
    .map((result) => ({
      provider: result.provider,
      query: result.query,
      stage: result.stage ?? "academic",
      error_type: result.error_type ?? "api-failure",
      error_message: result.error_message ?? `${result.provider} request failed`,
    }));

  const resultCount = providerResults
    .filter((result) => result.ok)
    .reduce((count, result) => count + result.results.length, 0);

  const providerResultCounts = providerResults.map((result) => ({
    provider: result.provider,
    query: result.query,
    stage: result.stage ?? "academic",
    resultCount: result.results.length,
    ok: result.ok,
  }));

  const warnings: string[] = [];
  const academicFailures = providerFailures.some((failure) => failure.provider !== "Web");
  const webFailures = providerFailures.some((failure) => failure.provider === "Web");
  if (academicFailures) warnings.push("外部學術 API 暫時不可用。");
  if (webFailures) warnings.push("公共網頁備援暫時不可用。");
  if (providerFailures.length > 0) {
    warnings.push("部分資料來源暫時不可用，已保留可用結果。");
  }
  if (resultCount < minSources) {
    warnings.push(`目前取得 ${resultCount}/${minSources} 筆，少於最低建議來源數。`);
  } else if (resultCount < targetSources) {
    warnings.push(`目前取得 ${resultCount}/${targetSources} 筆來源。`);
  }

  let status: SourceSearchDiagnosticsStatus = "success";
  if (resultCount === 0 && providerFailures.length === 0) {
    status = "empty";
  } else if (resultCount === 0 && providerFailures.length > 0) {
    status = "failed";
  } else if (resultCount < minSources) {
    status = "insufficient_sources";
  } else if (resultCount < targetSources || providerFailures.length > 0) {
    status = "partial_success";
  }

  return {
    resultCount,
    resultTarget: targetSources,
    minSources,
    targetSources,
    queryCount: providerResults.length > 0 ? new Set(providerResults.map((result) => result.query)).size : 0,
    providerCount: SOURCE_PROVIDER_NAMES.length,
    fallbackUsed,
    status,
    providerFailures,
    providerResultCounts,
    warnings,
  };
}

export async function searchSources(query: string, options?: SourceSearchOptions): Promise<SourceSearchResultWithDiagnostics> {
  const trimmedQuery = query.trim();
  const minSources = options?.minSources ?? DEFAULT_MIN_SOURCES;
  const targetSources = options?.targetSources ?? DEFAULT_TARGET_SOURCES;
  if (!trimmedQuery) {
    return {
      sources: [],
      diagnostics: {
        resultCount: 0,
        resultTarget: targetSources,
        minSources,
        targetSources,
        queryCount: 0,
        providerCount: SOURCE_PROVIDER_NAMES.length,
        fallbackUsed: false,
        status: "empty",
        providerFailures: [],
        providerResultCounts: [],
        warnings: ["請輸入有效的查詢關鍵字。"],
      },
      provider_status: [],
    };
  }

  const academicResults = await searchSourceProviders(trimmedQuery, { ...options, stage: "academic" });
  let providerResults = [...academicResults];
  let fallbackUsed = false;
  let sources = dedupeSources(providerResults.flatMap((result) => result.results));

  if (sources.length < minSources) {
    fallbackUsed = true;
    const officialResults = await searchSourceProviders(trimmedQuery, { ...options, stage: "official" });
    providerResults = [...providerResults, ...officialResults];
    sources = dedupeSources(providerResults.flatMap((result) => result.results));
  }

  if (sources.length < targetSources) {
    fallbackUsed = true;
    const mediaResults = await searchSourceProviders(trimmedQuery, { ...options, stage: "media" });
    providerResults = [...providerResults, ...mediaResults];
    sources = dedupeSources(providerResults.flatMap((result) => result.results));
  }

  sources = sources.slice(0, targetSources);
  const diagnostics = buildSourceSearchDiagnostics(providerResults, minSources, targetSources, fallbackUsed);

  return {
    sources,
    diagnostics,
    provider_status: providerResults,
  };
}
