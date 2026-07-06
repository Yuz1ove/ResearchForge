export const SOURCE_PROVIDER_NAMES = ["OpenAlex", "Semantic Scholar", "Crossref"] as const;

export type SourceProviderName = (typeof SOURCE_PROVIDER_NAMES)[number];

export const MEDICAL_PROVIDER_STRATEGY = {
  preferredProviders: ["PubMed", "Europe PMC", "OpenAlex", "Crossref", "Semantic Scholar"] as const,
  implementedProviders: SOURCE_PROVIDER_NAMES,
  pendingProviders: ["PubMed", "Europe PMC"] as const,
  fallbackLogMessage:
    "Medical search currently uses OpenAlex/Crossref/Semantic Scholar only.",
} as const;

export interface SourceProviderConfig {
  provider: SourceProviderName;
  endpoint: string;
  timeoutMs: number;
  queryLimit: number;
  pageLimit?: number;
  headers: Record<string, string>;
  mailto?: string;
}

const DEFAULT_METADATA_TIMEOUT_MS = 4000;
const DEFAULT_FULLER_METADATA_TIMEOUT_MS = 6000;
const DEFAULT_RESULTS_PER_PROVIDER = 25;
const DEFAULT_PAGES_PER_PROVIDER_QUERY = 2;
const DEFAULT_USER_AGENT = "ReportFactoryAI/1.0";

function positiveNumber(value: string | undefined, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function getSourceProviderConfigs(env: NodeJS.ProcessEnv = process.env): Record<SourceProviderName, SourceProviderConfig> {
  const semanticScholarApiKey = env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  const userAgent = env.SOURCE_SEARCH_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  return {
    OpenAlex: {
      provider: "OpenAlex",
      endpoint: env.OPENALEX_WORKS_URL?.trim() || "https://api.openalex.org/works",
      timeoutMs: positiveNumber(env.OPENALEX_TIMEOUT_MS, DEFAULT_METADATA_TIMEOUT_MS),
      queryLimit: positiveNumber(env.OPENALEX_QUERY_LIMIT, DEFAULT_RESULTS_PER_PROVIDER),
      pageLimit: positiveNumber(env.OPENALEX_PAGE_LIMIT ?? env.SOURCE_PROVIDER_PAGE_LIMIT, DEFAULT_PAGES_PER_PROVIDER_QUERY),
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      mailto: env.OPENALEX_MAILTO?.trim() || env.CROSSREF_MAILTO?.trim() || undefined,
    },
    Crossref: {
      provider: "Crossref",
      endpoint: env.CROSSREF_WORKS_URL?.trim() || "https://api.crossref.org/works",
      timeoutMs: positiveNumber(env.CROSSREF_TIMEOUT_MS, DEFAULT_METADATA_TIMEOUT_MS),
      queryLimit: positiveNumber(env.CROSSREF_QUERY_LIMIT, DEFAULT_RESULTS_PER_PROVIDER),
      pageLimit: positiveNumber(env.CROSSREF_PAGE_LIMIT ?? env.SOURCE_PROVIDER_PAGE_LIMIT, DEFAULT_PAGES_PER_PROVIDER_QUERY),
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      mailto: env.CROSSREF_MAILTO?.trim() || undefined,
    },
    "Semantic Scholar": {
      provider: "Semantic Scholar",
      endpoint: env.SEMANTIC_SCHOLAR_SEARCH_URL?.trim() || "https://api.semanticscholar.org/graph/v1/paper/search",
      timeoutMs: positiveNumber(env.SEMANTIC_SCHOLAR_TIMEOUT_MS, DEFAULT_FULLER_METADATA_TIMEOUT_MS),
      queryLimit: positiveNumber(env.SEMANTIC_SCHOLAR_QUERY_LIMIT, DEFAULT_RESULTS_PER_PROVIDER),
      pageLimit: positiveNumber(env.SEMANTIC_SCHOLAR_PAGE_LIMIT ?? env.SOURCE_PROVIDER_PAGE_LIMIT, DEFAULT_PAGES_PER_PROVIDER_QUERY),
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
        ...(semanticScholarApiKey ? { "x-api-key": semanticScholarApiKey } : {}),
      },
    },
  };
}
