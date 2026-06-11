import {
  dedupeSourceRecords,
  normalizeSourceRecord,
  type SourceRecord,
} from "@workspace/api-zod";

const CROSSREF_WORKS_URL = "https://api.crossref.org/works";
const SEMANTIC_SCHOLAR_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search";
const REQUEST_TIMEOUT_MS = 8000;
const RESULTS_PER_PROVIDER = 8;
const MAX_RESULTS = 16;

type SourceProvider = "Crossref" | "Semantic Scholar";
type SourceSearchErrorCode = "timeout" | "api-failure";

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

async function fetchJson<T>(provider: SourceProvider, url: URL, headers?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ReportFactoryAI/1.0",
        ...headers,
      },
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

async function searchCrossref(query: string): Promise<SourceRecord[]> {
  const url = new URL(CROSSREF_WORKS_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("rows", String(RESULTS_PER_PROVIDER));
  url.searchParams.set("select", "title,author,issued,published,published-print,published-online,abstract,DOI,URL,publisher,container-title");

  const data = await fetchJson<CrossrefResponse>("Crossref", url);
  return (data.message?.items ?? [])
    .map(normalizeCrossrefWork)
    .filter((source): source is SourceRecord => Boolean(source));
}

async function searchSemanticScholar(query: string): Promise<SourceRecord[]> {
  const url = new URL(SEMANTIC_SCHOLAR_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(RESULTS_PER_PROVIDER));
  url.searchParams.set("fields", "title,authors,year,abstract,externalIds,url,venue");

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers = apiKey ? { "x-api-key": apiKey } : undefined;
  const data = await fetchJson<SemanticScholarResponse>("Semantic Scholar", url, headers);

  return (data.data ?? [])
    .map(normalizeSemanticScholarPaper)
    .filter((source): source is SourceRecord => Boolean(source));
}

export function dedupeSources(sources: SourceRecord[]): SourceRecord[] {
  return dedupeSourceRecords(sources);
}

export async function searchSources(query: string): Promise<SourceRecord[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const results = await Promise.allSettled([
    searchCrossref(trimmedQuery),
    searchSemanticScholar(trimmedQuery),
  ]);

  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<SourceRecord[]> => result.status === "fulfilled",
  );

  if (!fulfilled.length) {
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);

    const timedOut = errors.some((error) => error instanceof SourceSearchError && error.code === "timeout");
    throw new SourceSearchError(
      timedOut ? "timeout" : "api-failure",
      "all",
      timedOut ? "All source providers timed out" : "All source providers failed",
      errors,
    );
  }

  const sources = fulfilled.flatMap((result) => result.value);
  return dedupeSources(sources).slice(0, MAX_RESULTS);
}
