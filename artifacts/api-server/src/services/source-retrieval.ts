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

const MAX_RESULTS = 120;

export type SourceProvider = SourceProviderName;
export type SourceSearchErrorCode = "timeout" | "api-failure";

export type SourceFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface SourceSearchOptions {
  fetchImpl?: SourceFetch;
  providerConfigs?: Partial<Record<SourceProvider, SourceProviderConfig>>;
  providers?: SourceProvider[];
}

export interface SourceProviderSearchResult {
  ok: boolean;
  provider: SourceProvider;
  query: string;
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
  type?: string;
  "is-referenced-by-count"?: number;
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
  tldr?: {
    text?: string;
  };
  externalIds?: {
    DOI?: string;
  };
  url?: string;
  venue?: string;
  fieldsOfStudy?: string[];
  citationCount?: number;
  publicationTypes?: string[];
  isOpenAccess?: boolean;
};

type SemanticScholarResponse = {
  data?: SemanticScholarPaper[];
};

type OpenAlexAuthor = {
  author?: {
    display_name?: string;
  };
};

type OpenAlexInvertedIndex = Record<string, number[]>;

type OpenAlexWork = {
  id?: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  abstract_inverted_index?: OpenAlexInvertedIndex | null;
  cited_by_count?: number;
  type?: string;
  authorships?: OpenAlexAuthor[];
  primary_location?: {
    source?: {
      display_name?: string;
    } | null;
    landing_page_url?: string | null;
    raw_source_name?: string | null;
  } | null;
  host_venue?: {
    display_name?: string;
    url?: string;
  } | null;
  locations?: Array<{
    landing_page_url?: string | null;
    raw_source_name?: string | null;
    source?: {
      display_name?: string;
    } | null;
  }>;
  concepts?: Array<{
    display_name?: string;
  }>;
  topics?: Array<{
    display_name?: string;
  }>;
  open_access?: {
    is_oa?: boolean;
  };
};

type OpenAlexResponse = {
  results?: OpenAlexWork[];
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
  const trimmed = doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeUrl(url: string | null | undefined, doi: string | null): string | null {
  if (doi) return `https://doi.org/${doi}`;
  if (url?.trim()) return url.trim();
  return null;
}

function sourceKindFromProviderType(value: string | null | undefined): SourceRecord["sourceKind"] {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (/(journal|article|posted-content|peer-review)/.test(normalized)) return "journal";
  if (/(proceedings|conference)/.test(normalized)) return "conference";
  if (/(book|chapter|monograph)/.test(normalized)) return "book";
  if (/(dataset|data)/.test(normalized)) return "dataset";
  if (/(web|reference-entry)/.test(normalized)) return "web";
  return null;
}

function citationCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

function crossrefYear(work: CrossrefWork): number | null {
  const dates = [
    work["published-print"],
    work["published-online"],
    work.issued,
    work.published,
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

export function normalizeCrossrefWork(work: CrossrefWork, queryUsed?: string): SourceRecord | null {
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
    provider: "Crossref",
    queryUsed,
    retrievedAt: new Date().toISOString(),
    sourceKind: sourceKindFromProviderType(work.type),
    citationCount: citationCount(work["is-referenced-by-count"]),
    isPeerReviewed: sourceKindFromProviderType(work.type) === "journal",
  });
}

export function normalizeSemanticScholarPaper(paper: SemanticScholarPaper, queryUsed?: string): SourceRecord | null {
  const title = firstText(paper.title);
  if (!title) return null;

  const doi = normalizeDoi(paper.externalIds?.DOI);
  const abstract = stripMarkup(paper.abstract);
  return normalizeSourceRecord({
    title,
    authors: paper.authors?.map((author) => author.name?.trim()).filter((name): name is string => Boolean(name)) ?? [],
    year: typeof paper.year === "number" ? paper.year : null,
    abstract,
    doi,
    url: normalizeUrl(paper.url, doi),
    sourceType: "Semantic Scholar",
    reviewState: "pending",
    publisher: null,
    containerTitle: paper.venue ?? null,
    accessedAt: null,
    provider: "Semantic Scholar",
    queryUsed,
    retrievedAt: new Date().toISOString(),
    sourceKind: sourceKindFromProviderType(firstText(paper.publicationTypes)),
    citationCount: citationCount(paper.citationCount),
    isOpenAccess: typeof paper.isOpenAccess === "boolean" ? paper.isOpenAccess : null,
  });
}

function restoreOpenAlexAbstract(
  invertedIndex: OpenAlexInvertedIndex | null | undefined,
): string | null {
  if (!invertedIndex) return null;

  const wordsByPosition: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      if (typeof position === "number" && Number.isFinite(position)) {
        wordsByPosition.push({ word, position });
      }
    }
  }

  const restored = wordsByPosition
    .sort((a, b) => a.position - b.position)
    .map((item) => item.word)
    .join(" ")
    .replace(/\s+([,.;:!?%)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();

  return restored || null;
}

function openAlexAuthors(authorships: OpenAlexAuthor[] | undefined): string[] {
  return (authorships ?? [])
    .map((authorship) => authorship.author?.display_name?.trim())
    .filter((name): name is string => Boolean(name));
}

function openAlexVenue(work: OpenAlexWork): string | null {
  return (
    firstText(work.primary_location?.source?.display_name) ??
    firstText(work.primary_location?.raw_source_name) ??
    firstText(work.host_venue?.display_name) ??
    firstText(
      work.locations?.map(
        (location) =>
          location.source?.display_name ?? location.raw_source_name,
      ),
    )
  );
}

function openAlexUrl(work: OpenAlexWork, doi: string | null): string | null {
  return normalizeUrl(
    firstText([
      work.primary_location?.landing_page_url,
      work.host_venue?.url,
      work.locations?.map((location) => location.landing_page_url),
      work.id,
    ]),
    doi,
  );
}

export function normalizeOpenAlexWork(work: OpenAlexWork, queryUsed?: string): SourceRecord | null {
  const title = firstText(work.title ?? work.display_name);
  if (!title) return null;

  const doi = normalizeDoi(work.doi);
  const restoredAbstract = stripMarkup(
    restoreOpenAlexAbstract(work.abstract_inverted_index),
  );

  return normalizeSourceRecord({
    title,
    authors: openAlexAuthors(work.authorships),
    year: typeof work.publication_year === "number" ? work.publication_year : null,
    abstract: restoredAbstract,
    doi,
    url: openAlexUrl(work, doi),
    sourceType: "OpenAlex",
    reviewState: "pending",
    publisher: null,
    containerTitle: openAlexVenue(work),
    accessedAt: null,
    provider: "OpenAlex",
    queryUsed,
    retrievedAt: new Date().toISOString(),
    sourceKind: sourceKindFromProviderType(work.type),
    citationCount: citationCount(work.cited_by_count),
    isOpenAccess: typeof work.open_access?.is_oa === "boolean" ? work.open_access.is_oa : null,
  });
}

function sourceProviderConfigs(options?: SourceSearchOptions): Record<SourceProvider, SourceProviderConfig> {
  const defaults = getSourceProviderConfigs();
  return {
    OpenAlex: options?.providerConfigs?.OpenAlex ?? defaults.OpenAlex,
    Crossref: options?.providerConfigs?.Crossref ?? defaults.Crossref,
    "Semantic Scholar": options?.providerConfigs?.["Semantic Scholar"] ?? defaults["Semantic Scholar"],
  };
}

async function searchOpenAlex(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const url = new URL(config.endpoint);
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(config.queryLimit));
  url.searchParams.set("sort", "relevance_score:desc");
  url.searchParams.set("select", "id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,primary_location,locations,concepts,topics,cited_by_count,type,open_access");
  if (config.mailto) url.searchParams.set("mailto", config.mailto);

  const data = await fetchJson<OpenAlexResponse>("OpenAlex", url, config, options?.fetchImpl);
  return (data.results ?? [])
    .map((work) => normalizeOpenAlexWork(work, query))
    .filter((source): source is SourceRecord => Boolean(source));
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
  url.searchParams.set("select", "title,author,issued,published,published-print,published-online,abstract,DOI,URL,publisher,container-title,type,is-referenced-by-count");
  if (config.mailto) url.searchParams.set("mailto", config.mailto);

  const data = await fetchJson<CrossrefResponse>("Crossref", url, config, options?.fetchImpl);
  return (data.message?.items ?? [])
    .map((work) => normalizeCrossrefWork(work, query))
    .filter((source): source is SourceRecord => Boolean(source));
}

async function searchSemanticScholar(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const url = new URL(config.endpoint);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(config.queryLimit));
  url.searchParams.set("fields", "title,authors,year,abstract,tldr,externalIds,url,venue,fieldsOfStudy,citationCount,publicationTypes,isOpenAccess");

  const data = await fetchJson<SemanticScholarResponse>("Semantic Scholar", url, config, options?.fetchImpl);

  return (data.data ?? [])
    .map((paper) => normalizeSemanticScholarPaper(paper, query))
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
  if (provider === "OpenAlex") return searchOpenAlex(query, config, options);
  if (provider === "Crossref") return searchCrossref(query, config, options);
  return searchSemanticScholar(query, config, options);
}

function providerErrorResult(
  provider: SourceProvider,
  query: string,
  error: unknown,
): SourceProviderSearchResult {
  if (error instanceof SourceSearchError) {
    return {
      ok: false,
      provider,
      query,
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
  const config = sourceProviderConfigs(options)[provider];
  if (!trimmedQuery) {
    return {
      ok: true,
      provider,
      query: trimmedQuery,
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
      results,
      error_type: null,
      error_message: null,
    };
  } catch (error) {
    return providerErrorResult(provider, trimmedQuery, error);
  }
}

export async function searchSourceProviders(
  query: string,
  options?: SourceSearchOptions,
): Promise<SourceProviderSearchResult[]> {
  const providers = options?.providers?.length
    ? options.providers
    : SOURCE_PROVIDER_NAMES;
  return Promise.all(
    providers.map((provider) => searchSourceProvider(provider, query, options)),
  );
}

export async function searchSources(query: string, options?: SourceSearchOptions): Promise<SourceRecord[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const providerResults = await searchSourceProviders(trimmedQuery, options);
  const fulfilled = providerResults.filter((result) => result.ok);

  if (!fulfilled.length) {
    const timedOut = providerResults.some((result) => result.error_type === "timeout");
    throw new SourceSearchError(
      timedOut ? "timeout" : "api-failure",
      "all",
      timedOut ? "All source providers timed out" : "All source providers failed",
      providerResults,
    );
  }

  const sources = fulfilled.flatMap((result) => result.results);
  return dedupeSources(sources).slice(0, MAX_RESULTS);
}
