import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import { restoreAbstractFromInvertedIndex } from "@workspace/api-zod/source-record";

export type AcceptedSourceEnrichmentProvider =
  | "existing_payload"
  | "openalex"
  | "semantic_scholar"
  | "crossref";

export interface AcceptedSourceEnrichmentOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  timeoutMs?: number;
  retryCount?: number;
  backoffMs?: number;
  now?: () => Date;
}

interface ProviderDetail {
  provider: Exclude<AcceptedSourceEnrichmentProvider, "existing_payload">;
  ok: boolean;
  temporary: boolean;
  status: number;
  url: string;
  abstract?: string;
  fullTextUrl?: string;
  landingUrl?: string;
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  providerIds?: Record<string, string>;
  isOpenAccess?: boolean;
  failureReason?: string;
}

interface CacheEntry {
  expiresAt: number;
  value: Promise<ProviderDetail>;
}

const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const DETAIL_CACHE_MAX = 500;
const detailCache = new Map<string, CacheEntry>();
const USER_AGENT = "ResearchForge/1.0 accepted-source-enrichment";

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDoi(value: unknown): string {
  return cleanText(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .toLowerCase();
}

function normalizeTitle(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function longest(values: Array<string | null | undefined>): string {
  return uniqueStrings(values).sort((left, right) => right.length - left.length)[0] ?? "";
}

function safeUrl(value: unknown): string {
  const text = cleanText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function collectAliasAbstracts(
  value: unknown,
  depth = 0,
  seen = new Set<unknown>(),
): string[] {
  if (!value || typeof value !== "object" || depth > 3 || seen.has(value)) return [];
  seen.add(value);
  const abstracts: string[] = [];
  const aliases = new Set([
    "abstract",
    "abstractoriginal",
    "originalabstract",
    "extractedabstract",
    "abstracttext",
    "abstract_text",
    "paperabstract",
  ]);
  for (const [key, nested] of Object.entries(rawRecord(value))) {
    const normalizedKey = key.toLowerCase().replace(/[-\s]/g, "");
    if (aliases.has(normalizedKey)) {
      const text = cleanText(nested);
      if (text) abstracts.push(text);
      continue;
    }
    if (normalizedKey === "abstractinvertedindex" || normalizedKey === "abstract_inverted_index") {
      const restored = restoreAbstractFromInvertedIndex(nested);
      if (restored) abstracts.push(restored);
      continue;
    }
    if (depth < 3 && nested && typeof nested === "object") {
      abstracts.push(...collectAliasAbstracts(nested, depth + 1, seen));
    }
  }
  return abstracts;
}

export function abstractFromAcceptedSourceAliases(source: SourceCandidate): string {
  return longest([
    source.abstract,
    source.abstractOriginal,
    source.extractedAbstract,
    ...collectAliasAbstracts(source.rawProviderPayload),
  ]);
}

function providerIdsFromCandidate(source: SourceCandidate): Record<string, string> {
  const raw = rawRecord(source.rawProviderPayload);
  const nestedIds = rawRecord(raw.providerIds);
  const ids: Record<string, string> = { ...(source.providerIds ?? {}) };
  for (const [key, value] of Object.entries(nestedIds)) {
    const id = cleanText(value);
    if (id) ids[key] = id;
  }
  const rawId = cleanText(raw.id ?? raw.paperId ?? raw.openalexId ?? raw.openAlexId);
  if (rawId) ids[source.provider] = rawId;
  return ids;
}

export function canonicalAcceptedSourceIdentity(source: SourceCandidate): string {
  const doi = normalizeDoi(source.doi);
  if (doi) return `doi:${doi}`;
  const providerIds = providerIdsFromCandidate(source);
  const providerId = Object.entries(providerIds)
    .map(([provider, id]) => `${provider.toLowerCase()}:${cleanText(id).toLowerCase()}`)
    .sort()[0];
  if (providerId) return `provider:${providerId}`;
  if (cleanText(source.dedupeKey)) return `dedupe:${cleanText(source.dedupeKey).toLowerCase()}`;
  const title = normalizeTitle(source.title);
  const author = normalizeTitle(source.authors?.[0]);
  return `title:${title}|author:${author}|year:${source.year ?? ""}`;
}

function detailUrl(
  provider: ProviderDetail["provider"],
  source: SourceCandidate,
): string {
  const doi = normalizeDoi(source.doi);
  if (provider === "openalex") {
    const openAlexId = providerIdsFromCandidate(source).openalex;
    const identity = doi ? `doi:${doi}` : openAlexId;
    return identity
      ? `https://api.openalex.org/works/${encodeURIComponent(identity)}`
      : "";
  }
  if (!doi) return "";
  if (provider === "semantic_scholar") {
    return `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=paperId,title,abstract,tldr,authors,year,venue,externalIds,isOpenAccess,openAccessPdf,url`;
  }
  return `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
}

function parseOpenAlex(payload: unknown, url: string): ProviderDetail {
  const data = rawRecord(payload);
  const best = rawRecord(data.best_oa_location);
  const primary = rawRecord(data.primary_location);
  const source = rawRecord(primary.source);
  const authorships = Array.isArray(data.authorships) ? data.authorships : [];
  const authors = authorships.flatMap((item) => {
    const author = rawRecord(rawRecord(item).author);
    const name = cleanText(author.display_name);
    return name ? [name] : [];
  });
  const abstract = longest([
    ...collectAliasAbstracts(data),
    restoreAbstractFromInvertedIndex(data.abstract_inverted_index),
  ]);
  const fullTextUrl = safeUrl(best.pdf_url ?? primary.pdf_url);
  const landingUrl = safeUrl(best.landing_page_url ?? primary.landing_page_url ?? data.id);
  const doi = normalizeDoi(data.doi);
  const openAlexId = cleanText(data.id);
  return {
    provider: "openalex",
    ok: true,
    temporary: false,
    status: 200,
    url,
    ...(abstract ? { abstract } : {}),
    ...(fullTextUrl ? { fullTextUrl } : {}),
    ...(landingUrl ? { landingUrl } : {}),
    ...(cleanText(data.title ?? data.display_name) ? { title: cleanText(data.title ?? data.display_name) } : {}),
    ...(authors.length ? { authors } : {}),
    ...(typeof data.publication_year === "number" ? { year: data.publication_year } : {}),
    ...(cleanText(source.display_name) ? { venue: cleanText(source.display_name) } : {}),
    ...(doi ? { doi } : {}),
    ...(openAlexId ? { providerIds: { openalex: openAlexId } } : {}),
    ...(typeof rawRecord(data.open_access).is_oa === "boolean"
      ? { isOpenAccess: rawRecord(data.open_access).is_oa as boolean }
      : {}),
  };
}

function parseSemanticScholar(payload: unknown, url: string): ProviderDetail {
  const data = rawRecord(payload);
  const openAccessPdf = rawRecord(data.openAccessPdf);
  const externalIds = rawRecord(data.externalIds);
  const authors = (Array.isArray(data.authors) ? data.authors : []).flatMap((item) => {
    const name = cleanText(rawRecord(item).name);
    return name ? [name] : [];
  });
  const abstract = longest([
    cleanText(data.abstract),
    cleanText(rawRecord(data.tldr).text),
  ]);
  const paperId = cleanText(data.paperId);
  return {
    provider: "semantic_scholar",
    ok: true,
    temporary: false,
    status: 200,
    url,
    ...(abstract ? { abstract } : {}),
    ...(safeUrl(openAccessPdf.url) ? { fullTextUrl: safeUrl(openAccessPdf.url) } : {}),
    ...(safeUrl(data.url) ? { landingUrl: safeUrl(data.url) } : {}),
    ...(cleanText(data.title) ? { title: cleanText(data.title) } : {}),
    ...(authors.length ? { authors } : {}),
    ...(typeof data.year === "number" ? { year: data.year } : {}),
    ...(cleanText(data.venue) ? { venue: cleanText(data.venue) } : {}),
    ...(normalizeDoi(externalIds.DOI) ? { doi: normalizeDoi(externalIds.DOI) } : {}),
    ...(paperId ? { providerIds: { semanticScholar: paperId } } : {}),
    ...(typeof data.isOpenAccess === "boolean" ? { isOpenAccess: data.isOpenAccess } : {}),
  };
}

function parseCrossref(payload: unknown, url: string): ProviderDetail {
  const message = rawRecord(rawRecord(payload).message);
  const links = Array.isArray(message.link) ? message.link.map(rawRecord) : [];
  const readable = links.find((item) =>
    /text\/html|text\/plain|text\/xml|application\/pdf/i.test(cleanText(item["content-type"])),
  );
  const authors = (Array.isArray(message.author) ? message.author : []).flatMap((item) => {
    const record = rawRecord(item);
    const name = cleanText(`${cleanText(record.given)} ${cleanText(record.family)}`);
    return name ? [name] : [];
  });
  const yearParts = rawRecord(message.issued)["date-parts"];
  const year = Array.isArray(yearParts) && Array.isArray(yearParts[0]) && typeof yearParts[0][0] === "number"
    ? yearParts[0][0]
    : undefined;
  const doi = normalizeDoi(message.DOI);
  return {
    provider: "crossref",
    ok: true,
    temporary: false,
    status: 200,
    url,
    ...(cleanText(message.abstract) ? { abstract: cleanText(message.abstract) } : {}),
    ...(safeUrl(readable?.URL) ? { fullTextUrl: safeUrl(readable?.URL) } : {}),
    ...(safeUrl(message.URL) ? { landingUrl: safeUrl(message.URL) } : {}),
    ...(cleanText(Array.isArray(message.title) ? message.title[0] : message.title)
      ? { title: cleanText(Array.isArray(message.title) ? message.title[0] : message.title) }
      : {}),
    ...(authors.length ? { authors } : {}),
    ...(typeof year === "number" ? { year } : {}),
    ...(cleanText(Array.isArray(message["container-title"]) ? message["container-title"][0] : message["container-title"])
      ? { venue: cleanText(Array.isArray(message["container-title"]) ? message["container-title"][0] : message["container-title"]) }
      : {}),
    ...(doi ? { doi, providerIds: { crossref: doi } } : {}),
  };
}

function transientStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function requestProviderDetail(input: {
  provider: ProviderDetail["provider"];
  source: SourceCandidate;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  retryCount: number;
  backoffMs: number;
}): Promise<ProviderDetail> {
  const url = detailUrl(input.provider, input.source);
  if (!url) {
    return {
      provider: input.provider,
      ok: false,
      temporary: false,
      status: 0,
      url: "",
      failureReason: "missing_supported_provider_identity",
    };
  }

  let lastStatus = 0;
  let lastReason = "provider_detail_request_failed";
  for (let attempt = 0; attempt <= input.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await input.fetchImpl(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      });
      lastStatus = response.status;
      if (response.ok) {
        const payload = await response.json();
        if (input.provider === "openalex") return parseOpenAlex(payload, url);
        if (input.provider === "semantic_scholar") return parseSemanticScholar(payload, url);
        return parseCrossref(payload, url);
      }
      lastReason = `provider_detail_http_${response.status}`;
      if (!transientStatus(response.status) || attempt >= input.retryCount) break;
    } catch (error) {
      lastReason = error instanceof Error && error.name === "AbortError"
        ? "provider_detail_timeout"
        : "provider_detail_network_error";
      if (attempt >= input.retryCount) break;
    } finally {
      clearTimeout(timeout);
    }
    await delay(input.backoffMs * 2 ** attempt);
  }
  return {
    provider: input.provider,
    ok: false,
    temporary: transientStatus(lastStatus),
    status: lastStatus,
    url,
    failureReason: lastReason,
  };
}

function cachedProviderDetail(input: Parameters<typeof requestProviderDetail>[0]): Promise<ProviderDetail> {
  const key = `${input.provider}:${canonicalAcceptedSourceIdentity(input.source)}`;
  const now = Date.now();
  const cached = detailCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const value = requestProviderDetail(input);
  detailCache.set(key, { expiresAt: now + DETAIL_CACHE_TTL_MS, value });
  if (detailCache.size > DETAIL_CACHE_MAX) {
    const firstKey = detailCache.keys().next().value;
    if (typeof firstKey === "string") detailCache.delete(firstKey);
  }
  return value;
}

export function clearAcceptedSourceEnrichmentCache(): void {
  detailCache.clear();
}

function mergeProviderIds(
  current: Record<string, string>,
  incoming: Record<string, string> | undefined,
): Record<string, string> {
  return { ...current, ...(incoming ?? {}) };
}

async function enrichOne(
  source: SourceCandidate,
  options: Required<AcceptedSourceEnrichmentOptions>,
): Promise<SourceCandidate> {
  const retrievedAt = options.now().toISOString();
  const existingAbstract = abstractFromAcceptedSourceAliases(source);
  let abstract = existingAbstract;
  let fullTextUrl = safeUrl(source.fullTextUrl);
  let readableUrl = safeUrl(source.readableUrl ?? source.url);
  let title = cleanText(source.title);
  let authors = source.authors ?? [];
  let year = source.year;
  let venue = source.venue;
  let doi = normalizeDoi(source.doi);
  let isOpenAccess = source.isOpenAccess;
  let providerIds = providerIdsFromCandidate(source);
  const enrichmentProviders: string[] = ["existing_payload"];
  const provenance: NonNullable<SourceCandidate["enrichmentProvenance"]> = [{
    provider: "existing_payload",
    method: existingAbstract ? "abstract_alias_merge" : "metadata_merge",
    status: existingAbstract ? "success" : "no_content",
    contentLevel: existingAbstract ? "abstract" : "metadata",
    retrievedAt,
  }];
  const failures: string[] = [];
  let sawTemporaryFailure = false;

  const providers: ProviderDetail["provider"][] = ["openalex", "semantic_scholar", "crossref"];
  const shouldRequestDetails = Boolean(doi || providerIds.openalex) && (!abstract || !fullTextUrl);
  if (shouldRequestDetails) {
    for (const provider of providers) {
      const detail = await cachedProviderDetail({
        provider,
        source: { ...source, doi: doi || source.doi, providerIds },
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        retryCount: options.retryCount,
        backoffMs: options.backoffMs,
      });
      enrichmentProviders.push(provider);
      const detailAbstract = cleanText(detail.abstract);
      const detailFullTextUrl = safeUrl(detail.fullTextUrl);
      provenance.push({
        provider,
        method: "provider_detail_endpoint",
        status: detail.ok ? (detailAbstract || detailFullTextUrl ? "success" : "no_content") : "failed",
        contentLevel: detailAbstract ? "abstract" : "metadata",
        retrievedAt,
        ...(detail.url ? { url: detail.url } : {}),
        ...(detail.failureReason ? { failureReason: detail.failureReason } : {}),
      });
      if (!detail.ok) {
        if (detail.failureReason) failures.push(`${provider}:${detail.failureReason}`);
        sawTemporaryFailure ||= detail.temporary;
        continue;
      }
      abstract = longest([abstract, detailAbstract]);
      fullTextUrl ||= detailFullTextUrl;
      readableUrl ||= safeUrl(detail.landingUrl);
      title = longest([title, detail.title]);
      authors = uniqueStrings([...authors, ...(detail.authors ?? [])]);
      year ??= detail.year;
      venue ||= cleanText(detail.venue);
      doi ||= normalizeDoi(detail.doi);
      providerIds = mergeProviderIds(providerIds, detail.providerIds);
      if (typeof detail.isOpenAccess === "boolean") {
        isOpenAccess = Boolean(isOpenAccess || detail.isOpenAccess);
      }
      if (abstract && fullTextUrl) break;
    }
  } else if (!abstract && !doi && !providerIds.openalex) {
    failures.push("missing_supported_provider_identity");
  }

  const existingFullText =
    source.contentLevel === "fulltext" ||
    source.accessLevel === "full_text" ||
    (source.fullTextCharCount ?? 0) > 0 ||
    (source.extractedChunks?.length ?? 0) > 0;
  const contentLevel: NonNullable<SourceCandidate["contentLevel"]> = existingFullText
    ? "fulltext"
    : abstract
      ? "abstract"
      : "metadata";
  const enrichmentStatus: NonNullable<SourceCandidate["enrichmentStatus"]> =
    contentLevel !== "metadata"
      ? "success"
      : fullTextUrl
        ? "partial"
        : sawTemporaryFailure
          ? "temporary_failure"
          : "permanent_no_content";
  const failureReason = contentLevel === "metadata" && failures.length
    ? uniqueStrings(failures).join(" | ")
    : "";

  return {
    ...source,
    title,
    ...(authors.length ? { authors } : {}),
    ...(typeof year === "number" ? { year } : {}),
    ...(venue ? { venue } : {}),
    ...(doi ? { doi } : {}),
    ...(abstract ? { abstract, abstractOriginal: abstract, extractedAbstract: source.extractedAbstract ?? abstract } : {}),
    ...(fullTextUrl ? { fullTextUrl } : {}),
    ...(readableUrl ? { readableUrl } : {}),
    ...(typeof isOpenAccess === "boolean" ? { isOpenAccess } : {}),
    canonicalSourceIdentity: canonicalAcceptedSourceIdentity({ ...source, doi: doi || source.doi, providerIds }),
    providerIds,
    contentLevel,
    enrichmentAttempted: true,
    enrichmentProviders: uniqueStrings(enrichmentProviders),
    enrichmentStatus,
    ...(failureReason ? { enrichmentFailureReason: failureReason } : {}),
    enrichmentProvenance: provenance,
    enrichedAt: retrievedAt,
  };
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const output = new Array<U>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function enrichAcceptedSources(
  sources: SourceCandidate[],
  options: AcceptedSourceEnrichmentOptions = {},
): Promise<SourceCandidate[]> {
  const resolved: Required<AcceptedSourceEnrichmentOptions> = {
    fetchImpl: options.fetchImpl ?? fetch,
    concurrency: Math.max(1, Math.min(6, options.concurrency ?? 3)),
    timeoutMs: Math.max(250, options.timeoutMs ?? 5_000),
    retryCount: Math.max(0, Math.min(2, options.retryCount ?? 1)),
    backoffMs: Math.max(0, options.backoffMs ?? 120),
    now: options.now ?? (() => new Date()),
  };
  return mapWithConcurrency(sources, resolved.concurrency, async (source) => {
    try {
      return await enrichOne(source, resolved);
    } catch (error) {
      const retrievedAt = resolved.now().toISOString();
      const failureReason = error instanceof Error
        ? cleanText(error.message).slice(0, 180)
        : "unexpected_enrichment_failure";
      return {
        ...source,
        canonicalSourceIdentity: canonicalAcceptedSourceIdentity(source),
        contentLevel: abstractFromAcceptedSourceAliases(source) ? "abstract" : "metadata",
        enrichmentAttempted: true,
        enrichmentProviders: ["existing_payload"],
        enrichmentStatus: "temporary_failure",
        enrichmentFailureReason: failureReason || "unexpected_enrichment_failure",
        enrichmentProvenance: [{
          provider: "existing_payload",
          method: "accepted_source_enrichment",
          status: "failed",
          contentLevel: abstractFromAcceptedSourceAliases(source) ? "abstract" : "metadata",
          retrievedAt,
          failureReason: failureReason || "unexpected_enrichment_failure",
        }],
        enrichedAt: retrievedAt,
      };
    }
  });
}
