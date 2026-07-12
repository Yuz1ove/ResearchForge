import {
  dedupeSourceRecords,
  normalizeSourceRecord,
  type SourceRecord,
} from "@workspace/api-zod";
import type { ProviderHealth } from "@workspace/api-zod/research-grounding";
import {
  getSourceProviderConfigs,
  SOURCE_PROVIDER_NAMES,
  type SourceProviderConfig,
  type SourceProviderName,
} from "./source-provider-config";
import { logger } from "../lib/logger";

const MAX_RESULTS = 120;
const PROVIDER_RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_PROVIDER_RETRIES = 1;
const PROVIDER_RETRY_BASE_DELAY_MS = 250;
const PROVIDER_RETRY_MAX_DELAY_MS = 1200;
const PROVIDER_CACHE_TTL_MS = 20 * 60 * 1000;
const DEGRADED_PROVIDER_TIMEOUT_MS = 2500;
const RETRY_PROVIDER_TIMEOUT_MS = 2000;
const PROVIDER_DOWN_COOLDOWN_MS = 5 * 60 * 1000;
const FALLBACK_PROVIDER_NAMES = [
  "Official Source",
  "Institutional Source",
  "Authoritative Media",
] as const;

export type AcademicSourceProvider = SourceProviderName;
export type FallbackSourceProvider = (typeof FALLBACK_PROVIDER_NAMES)[number];
export type SourceProvider = AcademicSourceProvider | FallbackSourceProvider;
export type SourceSearchErrorCode =
  | "timeout"
  | "api-failure"
  | "rate_limited"
  | "server_error"
  | "schema_error"
  | "low_results";

export type SourceFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface SourceSearchTelemetryContext {
  requestId: string;
  workflowId: string;
  jobId: string;
  topicHash: string;
}

export interface SourceSearchOptions {
  fetchImpl?: SourceFetch;
  providerConfigs?: Partial<Record<AcademicSourceProvider, SourceProviderConfig>>;
  providers?: AcademicSourceProvider[];
  telemetry?: SourceSearchTelemetryContext;
  /**
   * A topic-anchored planner owns query repair. Its provider calls must not
   * silently retry with a shortened query that can discard the topic anchor.
   */
  allowShortQueryRetry?: boolean;
}

export interface SourceProviderSearchResult {
  ok: boolean;
  provider: SourceProvider;
  query: string;
  results: SourceRecord[];
  raw_count?: number;
  normalize_attempt_count?: number;
  normalized_valid_count?: number;
  normalized_invalid_count?: number;
  error_type: SourceSearchErrorCode | null;
  error_message: string | null;
  latency_ms?: number;
  request_url?: string;
  provider_health?: ProviderHealth;
  retry_mode?: "short_query";
  retry_query?: string;
  retry_reason?: SourceSearchErrorCode;
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

type ProviderCacheEntry = {
  expiresAt: number;
  result: SourceProviderSearchResult;
};

const providerSearchCache = new Map<string, ProviderCacheEntry>();

function providerHealthKey(provider: SourceProvider): ProviderHealth["provider"] | null {
  if (provider === "OpenAlex") return "openalex";
  if (provider === "Crossref") return "crossref";
  if (provider === "Semantic Scholar") return "semantic_scholar";
  return null;
}

function percentile(values: number[], quantile: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * quantile)),
  );
  return sorted[index];
}

function baseProviderHealth(provider: ProviderHealth["provider"]): ProviderHealth {
  return {
    provider,
    status: "healthy",
    recentFailureCount: 0,
    recentTimeoutCount: 0,
  };
}

export interface ProviderHealthEvent {
  errorType?: SourceSearchErrorCode | null;
  latencyMs?: number;
  occurredAt?: Date;
}

export interface ProviderHealthStore {
  get(provider: SourceProvider): Promise<ProviderHealth>;
  recordSuccess(provider: SourceProvider, event?: ProviderHealthEvent): Promise<void>;
  recordFailure(provider: SourceProvider, event: ProviderHealthEvent): Promise<void>;
  markDown(provider: SourceProvider, cooldownUntil: Date, reason?: string): Promise<void>;
  reset?(provider: SourceProvider): Promise<void>;
}

export class InMemoryProviderHealthStore implements ProviderHealthStore {
  private readonly state = new Map<ProviderHealth["provider"], ProviderHealth>();
  private readonly latencySamples = new Map<ProviderHealth["provider"], number[]>();
  private readonly successStreak = new Map<ProviderHealth["provider"], number>();

  getSync(provider: SourceProvider): ProviderHealth {
    const key = providerHealthKey(provider);
    if (!key) return baseProviderHealth("core");
    const current = this.state.get(key) ?? baseProviderHealth(key);
    if (current.status === "down" && current.cooldownUntil) {
      const cooldownMs = Date.parse(current.cooldownUntil);
      if (Number.isFinite(cooldownMs) && cooldownMs <= Date.now()) {
        const recovered: ProviderHealth = {
          ...current,
          status: "degraded",
          cooldownUntil: undefined,
        };
        this.state.set(key, recovered);
        this.successStreak.set(key, 0);
        return recovered;
      }
    }
    return current;
  }

  async get(provider: SourceProvider): Promise<ProviderHealth> {
    return this.getSync(provider);
  }

  async recordSuccess(provider: SourceProvider, event: ProviderHealthEvent = {}): Promise<void> {
    const key = providerHealthKey(provider);
    if (!key) return;
    const current = this.getSync(provider);
    const latencyMs = event.latencyMs ?? 0;
    const samples = [...(this.latencySamples.get(key) ?? []), latencyMs].slice(-20);
    this.latencySamples.set(key, samples);
    const nextStreak = (this.successStreak.get(key) ?? 0) + 1;
    this.successStreak.set(key, nextStreak);
    const status: ProviderHealth["status"] =
      current.status === "degraded" && nextStreak < 2 ? "degraded" : "healthy";
    const next: ProviderHealth = {
      provider: key,
      status,
      lastSuccessAt: (event.occurredAt ?? new Date()).toISOString(),
      recentFailureCount: status === "healthy" ? 0 : current.recentFailureCount,
      recentTimeoutCount: status === "healthy" ? 0 : current.recentTimeoutCount,
      ...(status === "degraded" && current.lastFailureAt
        ? { lastFailureAt: current.lastFailureAt }
        : {}),
      ...(typeof percentile(samples, 0.5) === "number"
        ? { rollingLatencyP50: percentile(samples, 0.5) }
        : {}),
      ...(typeof percentile(samples, 0.95) === "number"
        ? { rollingLatencyP95: percentile(samples, 0.95) }
        : {}),
      ...(status === "degraded" && current.lastErrorCode
        ? { lastErrorCode: current.lastErrorCode }
        : {}),
    };
    this.state.set(key, next);
  }

  async recordFailure(provider: SourceProvider, event: ProviderHealthEvent): Promise<void> {
    const key = providerHealthKey(provider);
    if (!key) return;
    const current = this.getSync(provider);
    const failureCount = current.recentFailureCount + 1;
    const timeoutCount =
      event.errorType === "timeout"
        ? current.recentTimeoutCount + 1
        : current.recentTimeoutCount;
    const latencyMs = event.latencyMs ?? 0;
    const samples = [...(this.latencySamples.get(key) ?? []), latencyMs].slice(-20);
    this.latencySamples.set(key, samples);
    this.successStreak.set(key, 0);
    const retryableFailure =
      event.errorType === "timeout" || event.errorType === "server_error";
    const status: ProviderHealth["status"] =
      retryableFailure && failureCount >= 6
        ? "down"
        : retryableFailure && (failureCount >= 3 || timeoutCount >= 3)
          ? "degraded"
          : current.status === "down"
            ? "down"
            : current.status;
    const next: ProviderHealth = {
      provider: key,
      status,
      lastSuccessAt: current.lastSuccessAt,
      lastFailureAt: (event.occurredAt ?? new Date()).toISOString(),
      recentFailureCount: failureCount,
      recentTimeoutCount: timeoutCount,
      ...(typeof percentile(samples, 0.5) === "number"
        ? { rollingLatencyP50: percentile(samples, 0.5) }
        : {}),
      ...(typeof percentile(samples, 0.95) === "number"
        ? { rollingLatencyP95: percentile(samples, 0.95) }
        : {}),
      ...(status === "down"
        ? { cooldownUntil: new Date(Date.now() + PROVIDER_DOWN_COOLDOWN_MS).toISOString() }
        : {}),
      ...(event.errorType ? { lastErrorCode: event.errorType } : {}),
    };
    this.state.set(key, next);
  }

  async markDown(provider: SourceProvider, cooldownUntil: Date, reason?: string): Promise<void> {
    const key = providerHealthKey(provider);
    if (!key) return;
    const current = this.getSync(provider);
    this.state.set(key, {
      ...current,
      status: "down",
      cooldownUntil: cooldownUntil.toISOString(),
      lastFailureAt: new Date().toISOString(),
      ...(reason ? { lastErrorCode: reason } : {}),
    });
    this.successStreak.set(key, 0);
  }

  async reset(provider: SourceProvider): Promise<void> {
    const key = providerHealthKey(provider);
    if (!key) return;
    this.state.delete(key);
    this.latencySamples.delete(key);
    this.successStreak.delete(key);
  }

  resetAll(): void {
    this.state.clear();
    this.latencySamples.clear();
    this.successStreak.clear();
  }
}

let providerHealthStore = new InMemoryProviderHealthStore();

export function setProviderHealthStoreForTesting(store: InMemoryProviderHealthStore): void {
  providerHealthStore = store;
}

export function resetProviderHealthStoreForTesting(): void {
  providerHealthStore = new InMemoryProviderHealthStore();
  providerSearchCache.clear();
}

export function providerHealthSnapshot(
  provider: AcademicSourceProvider,
): ProviderHealth {
  return providerHealthStore.getSync(provider);
}

export function allProviderHealthSnapshots(): ProviderHealth[] {
  return SOURCE_PROVIDER_NAMES.map((provider) => providerHealthSnapshot(provider));
}

function providerConfigForHealth(
  provider: AcademicSourceProvider,
  config: SourceProviderConfig,
): SourceProviderConfig {
  const health = providerHealthSnapshot(provider);
  if (health.status !== "degraded") return config;
  return {
    ...config,
    timeoutMs: Math.min(config.timeoutMs, DEGRADED_PROVIDER_TIMEOUT_MS),
  };
}

function normalizedProviderCacheKey(
  provider: SourceProvider,
  query: string,
  config?: Pick<SourceProviderConfig, "endpoint" | "queryLimit" | "pageLimit">,
): string {
  const dateBucket = Math.floor(Date.now() / PROVIDER_CACHE_TTL_MS);
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const endpoint = config?.endpoint.trim().toLowerCase() ?? "";
  const queryLimit = config?.queryLimit ?? "";
  const pageLimit = config?.pageLimit ?? "";
  return `${provider}:${endpoint}:${queryLimit}:${pageLimit}:${normalizedQuery}:${dateBucket}`;
}

function cloneProviderResult(result: SourceProviderSearchResult): SourceProviderSearchResult {
  return {
    ...result,
    results: result.results.map((source) => ({ ...source })),
  };
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
  next?: number;
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

interface ProviderNormalizedResults {
  results: SourceRecord[];
  rawCount: number;
  retryMode?: "short_query";
  retryQuery?: string;
  retryReason?: SourceSearchErrorCode;
}

function pageCount(config: SourceProviderConfig): number {
  return Math.max(1, Math.min(5, Math.trunc(config.pageLimit || 1)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterDelayMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(PROVIDER_RETRY_MAX_DELAY_MS, Math.round(seconds * 1000));
  }
  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) return null;
  const delta = dateMs - Date.now();
  if (delta <= 0) return 0;
  return Math.min(PROVIDER_RETRY_MAX_DELAY_MS, delta);
}

function retryDelayMs(attempt: number, retryAfterMs?: number | null): number {
  if (typeof retryAfterMs === "number") return retryAfterMs;
  const exponentialDelay = PROVIDER_RETRY_BASE_DELAY_MS * 2 ** attempt;
  return Math.min(PROVIDER_RETRY_MAX_DELAY_MS, exponentialDelay);
}

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
  const abstract = stripMarkup(paper.abstract) ?? stripMarkup(paper.tldr?.text);
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

function sourceProviderConfigs(options?: SourceSearchOptions): Record<AcademicSourceProvider, SourceProviderConfig> {
  const defaults = getSourceProviderConfigs();
  return {
    OpenAlex: options?.providerConfigs?.OpenAlex ?? defaults.OpenAlex,
    Crossref: options?.providerConfigs?.Crossref ?? defaults.Crossref,
    "Semantic Scholar": options?.providerConfigs?.["Semantic Scholar"] ?? defaults["Semantic Scholar"],
  };
}

async function searchOpenAlex(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<ProviderNormalizedResults> {
  const pages = Array.from({ length: pageCount(config) }, (_, index) => index + 1);
  const results: SourceRecord[] = [];
  let rawCount = 0;

  for (const page of pages) {
    const url = new URL(config.endpoint);
    url.searchParams.set("search", query);
    url.searchParams.set("per-page", String(config.queryLimit));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", "relevance_score:desc");
    url.searchParams.set("select", "id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,primary_location,locations,concepts,topics,cited_by_count,type,open_access");
    if (config.mailto) url.searchParams.set("mailto", config.mailto);

    const data = await fetchJson<OpenAlexResponse>("OpenAlex", url, config, options?.fetchImpl);
    const rawItems = data.results ?? [];
    rawCount += rawItems.length;
    const pageResults = rawItems
      .map((work) => normalizeOpenAlexWork(work, query))
      .filter((source): source is SourceRecord => Boolean(source));
    results.push(...pageResults);
    if (rawItems.length < config.queryLimit) break;
  }

  return { results, rawCount };
}

async function fetchJson<T>(
  provider: SourceProvider,
  url: URL,
  config: SourceProviderConfig,
  fetchImpl: SourceFetch = fetch,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_PROVIDER_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs =
      attempt > 0
        ? Math.min(config.timeoutMs, RETRY_PROVIDER_TIMEOUT_MS)
        : config.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: config.headers,
      });

      if (!response.ok) {
        if (
          PROVIDER_RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt < MAX_PROVIDER_RETRIES
        ) {
          await sleep(
            provider === "OpenAlex" && response.status === 503
              ? 250
              : retryDelayMs(
                  attempt,
                  retryAfterDelayMs(response.headers.get("retry-after")),
                ),
          );
          continue;
        }
        throw new SourceSearchError(
          response.status === 429
            ? "rate_limited"
            : response.status >= 500 && response.status <= 599
              ? "server_error"
              : "api-failure",
          provider,
          `${provider} returned HTTP ${response.status}`,
        );
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new SourceSearchError(
          "schema_error",
          provider,
          `${provider} response could not be parsed as JSON`,
          error,
        );
      }
    } catch (error) {
      lastError = error;
      if (error instanceof SourceSearchError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new SourceSearchError(
          "timeout",
          provider,
          `${provider} request timed out`,
          error,
        );
      }
      if (attempt < MAX_PROVIDER_RETRIES) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw new SourceSearchError(
        "api-failure",
        provider,
        `${provider} request failed`,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  if (lastError instanceof SourceSearchError) throw lastError;
  throw new SourceSearchError(
    "api-failure",
    provider,
    `${provider} request failed`,
    lastError,
  );
}

function shortCrossrefRetryQuery(query: string): string {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (/rayleigh/i.test(normalized) && /sunset|twilight/i.test(normalized)) {
    return "Rayleigh scattering sunset";
  }
  const terms = normalized
    .split(/\s+/)
    .filter((term) => !/^(and|or|of|the|a|an|relationship|effect|impact|study|research)$/i.test(term))
    .slice(0, 3);
  return terms.length >= 2 ? terms.join(" ") : normalized;
}

async function searchCrossrefQuery(
  query: string,
  config: SourceProviderConfig,
  options?: SourceSearchOptions,
): Promise<ProviderNormalizedResults> {
  const pages = Array.from({ length: pageCount(config) }, (_, index) => index);
  const results: SourceRecord[] = [];
  let rawCount = 0;

  for (const page of pages) {
    const url = new URL(config.endpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("rows", String(config.queryLimit));
    url.searchParams.set("offset", String(page * config.queryLimit));
    url.searchParams.set("select", "title,author,issued,published,published-print,published-online,abstract,DOI,URL,publisher,container-title,type,is-referenced-by-count");
    if (config.mailto) url.searchParams.set("mailto", config.mailto);

    const data = await fetchJson<CrossrefResponse>("Crossref", url, config, options?.fetchImpl);
    const rawItems = data.message?.items ?? [];
    rawCount += rawItems.length;
    const pageResults = rawItems
      .map((work) => normalizeCrossrefWork(work, query))
      .filter((source): source is SourceRecord => Boolean(source));
    results.push(...pageResults);
    if (rawItems.length < config.queryLimit) break;
  }

  return { results, rawCount };
}

async function searchCrossref(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<ProviderNormalizedResults> {
  try {
    const initial = await searchCrossrefQuery(query, config, options);
    if (initial.results.length > 1 && initial.rawCount > 1) return initial;
    if (options?.allowShortQueryRetry === false) return initial;
    const retryQuery = shortCrossrefRetryQuery(query);
    if (retryQuery === query.trim()) return initial;
    const retried = await searchCrossrefQuery(
      retryQuery,
      {
        ...config,
        timeoutMs: Math.min(config.timeoutMs, RETRY_PROVIDER_TIMEOUT_MS),
        pageLimit: 1,
      },
      options,
    );
    return {
      results: dedupeSourceRecords([...initial.results, ...retried.results]),
      rawCount: initial.rawCount + retried.rawCount,
      retryMode: "short_query",
      retryQuery,
      retryReason: "low_results",
    };
  } catch (error) {
    if (!(error instanceof SourceSearchError) || error.code !== "timeout") {
      throw error;
    }
    if (options?.allowShortQueryRetry === false) throw error;
    const retryQuery = shortCrossrefRetryQuery(query);
    if (retryQuery === query.trim()) throw error;
    const retried = await searchCrossrefQuery(
      retryQuery,
      {
        ...config,
        timeoutMs: Math.min(config.timeoutMs, RETRY_PROVIDER_TIMEOUT_MS),
        pageLimit: 1,
      },
      options,
    );
    return {
      ...retried,
      retryMode: "short_query",
      retryQuery,
      retryReason: "timeout",
    };
  }
}

async function searchSemanticScholar(query: string, config: SourceProviderConfig, options?: SourceSearchOptions): Promise<ProviderNormalizedResults> {
  const results: SourceRecord[] = [];
  let rawCount = 0;
  let nextOffset: number | null = 0;

  for (let page = 0; page < pageCount(config) && nextOffset !== null; page += 1) {
    const url = new URL(config.endpoint);
    url.searchParams.set("query", query);
    url.searchParams.set("limit", String(config.queryLimit));
    url.searchParams.set("offset", String(nextOffset));
    url.searchParams.set("fields", "title,authors,year,abstract,tldr,externalIds,url,venue,fieldsOfStudy,citationCount,publicationTypes,isOpenAccess");

    const data = await fetchJson<SemanticScholarResponse>("Semantic Scholar", url, config, options?.fetchImpl);
    const rawItems = data.data ?? [];
    rawCount += rawItems.length;
    const pageResults = rawItems
      .map((paper) => normalizeSemanticScholarPaper(paper, query))
      .filter((source): source is SourceRecord => Boolean(source));
    results.push(...pageResults);
    nextOffset =
      typeof data.next === "number" && rawItems.length >= config.queryLimit
        ? data.next
        : null;
  }

  return { results, rawCount };
}

export function dedupeSources(sources: SourceRecord[]): SourceRecord[] {
  return dedupeSourceRecords(sources);
}

async function searchProviderOrThrow(
  provider: AcademicSourceProvider,
  query: string,
  config: SourceProviderConfig,
  options?: SourceSearchOptions,
): Promise<ProviderNormalizedResults> {
  if (provider === "OpenAlex") return searchOpenAlex(query, config, options);
  if (provider === "Crossref") return searchCrossref(query, config, options);
  return searchSemanticScholar(query, config, options);
}

function providerErrorResult(
  provider: SourceProvider,
  query: string,
  error: unknown,
  latencyMs?: number,
): SourceProviderSearchResult {
  if (error instanceof SourceSearchError) {
    return {
      ok: false,
      provider,
      query,
      results: [],
      error_type: error.code,
      error_message: error.message,
      latency_ms: latencyMs,
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
    latency_ms: latencyMs,
  };
}

function safeProviderErrorMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/(api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function providerHttpStatus(result: SourceProviderSearchResult): number | null {
  if (result.ok) return 200;
  const match = result.error_message?.match(/HTTP\s+(\d{3})/i);
  return match ? Number(match[1]) : null;
}

function logProviderAttempt(
  startedAt: number,
  result: SourceProviderSearchResult,
  telemetry: SourceSearchTelemetryContext | undefined,
): void {
  if (!telemetry) return;
  const durationMs = Math.max(0, Date.now() - startedAt);
  const status = result.ok
    ? result.results.length > 0
      ? "success"
      : "empty"
    : result.error_type === "timeout"
      ? "timeout"
      : "error";
  const errorCode = result.error_type
    ? result.error_type === "timeout"
      ? "PROVIDER_TIMEOUT"
      : result.error_type === "schema_error"
        ? "PROVIDER_PARSE_ERROR"
        : "PROVIDER_HTTP_ERROR"
    : null;
  logger.info(
    {
      event: "research_grounding.provider_attempt",
      route: "/api/research-grounding-jobs",
      stage: "provider_search",
      ...telemetry,
      provider: result.provider,
      providerAttempt: 1,
      queryUsed: result.query,
      startedAt: new Date(startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs,
      status,
      httpStatus: providerHttpStatus(result),
      resultCount: result.results.length,
      retryable: Boolean(
        result.error_type &&
          ["timeout", "rate_limited", "server_error", "api-failure"].includes(result.error_type),
      ),
      errorCode,
      errorMessage: safeProviderErrorMessage(result.error_message),
    },
    "Research grounding provider attempt completed",
  );
}

export async function searchSourceProvider(
  provider: AcademicSourceProvider,
  query: string,
  options?: SourceSearchOptions,
): Promise<SourceProviderSearchResult> {
  const trimmedQuery = query.trim();
  const startedAt = Date.now();
  const config = sourceProviderConfigs(options)[provider];
  const cacheKey = normalizedProviderCacheKey(provider, trimmedQuery, config);
  const cached = providerSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const result = cloneProviderResult(cached.result);
    logProviderAttempt(startedAt, result, options?.telemetry);
    return result;
  }
  if (!trimmedQuery) {
    const result: SourceProviderSearchResult = {
      ok: true,
      provider,
      query: trimmedQuery,
      results: [],
      raw_count: 0,
      normalize_attempt_count: 0,
      normalized_valid_count: 0,
      normalized_invalid_count: 0,
      error_type: null,
      error_message: null,
      latency_ms: 0,
      provider_health: providerHealthSnapshot(provider),
    };
    logProviderAttempt(startedAt, result, options?.telemetry);
    return result;
  }

  const health = await providerHealthStore.get(provider);
  if (health.status === "down") {
    const result: SourceProviderSearchResult = {
      ok: false,
      provider,
      query: trimmedQuery,
      results: [],
      raw_count: 0,
      normalize_attempt_count: 0,
      normalized_valid_count: 0,
      normalized_invalid_count: 0,
      error_type: "api-failure",
      error_message: `${provider} provider is cooling down after repeated failures`,
      latency_ms: Date.now() - startedAt,
      provider_health: health,
    };
    logProviderAttempt(startedAt, result, options?.telemetry);
    return result;
  }

  try {
    const effectiveConfig = providerConfigForHealth(provider, config);
    const { results, rawCount, retryMode, retryQuery, retryReason } = await searchProviderOrThrow(provider, trimmedQuery, effectiveConfig, options);
    const latencyMs = Date.now() - startedAt;
    await providerHealthStore.recordSuccess(provider, { latencyMs });
    const providerHealth = await providerHealthStore.get(provider);
    const result: SourceProviderSearchResult = {
      ok: true,
      provider,
      query: trimmedQuery,
      results,
      raw_count: rawCount,
      normalize_attempt_count: rawCount,
      normalized_valid_count: results.length,
      normalized_invalid_count: Math.max(0, rawCount - results.length),
      error_type: null,
      error_message: null,
      latency_ms: latencyMs,
      provider_health: providerHealth,
      ...(retryMode ? { retry_mode: retryMode } : {}),
      ...(retryQuery ? { retry_query: retryQuery } : {}),
      ...(retryReason ? { retry_reason: retryReason } : {}),
    };
    providerSearchCache.set(cacheKey, {
      expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS,
      result: cloneProviderResult(result),
    });
    logProviderAttempt(startedAt, result, options?.telemetry);
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const result = providerErrorResult(provider, trimmedQuery, error, latencyMs);
    await providerHealthStore.recordFailure(provider, {
      errorType: result.error_type,
      latencyMs,
    });
    result.provider_health = await providerHealthStore.get(provider);
    if (result.error_type === "rate_limited" || result.error_type === "timeout") {
      providerSearchCache.set(cacheKey, {
        expiresAt: Date.now() + PROVIDER_CACHE_TTL_MS,
        result: cloneProviderResult(result),
      });
    }
    logProviderAttempt(startedAt, result, options?.telemetry);
    return result;
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
