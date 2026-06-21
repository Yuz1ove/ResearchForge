export const SOURCE_PROVIDER_NAMES = ["Crossref", "OpenAlex", "Semantic Scholar", "Web"] as const;

export type SourceProviderName = (typeof SOURCE_PROVIDER_NAMES)[number];

export interface SourceProviderConfig {
  provider: SourceProviderName;
  endpoint: string;
  timeoutMs: number;
  queryLimit: number;
  headers: Record<string, string>;
  mailto?: string;
  queryParam?: string;
  selectParam?: string;
  acceptHeader?: string;
  extraParams?: Record<string, string>;
  searchStage?: "academic" | "official" | "media";
}

const DEFAULT_SOURCE_TIMEOUT_MS = 8000;
const DEFAULT_RESULTS_PER_PROVIDER = 8;
const DEFAULT_USER_AGENT = "ReportFactoryAI/1.0";

export function getSourceProviderConfigs(env: NodeJS.ProcessEnv = process.env): Record<SourceProviderName, SourceProviderConfig> {
  const semanticScholarApiKey = env.SEMANTIC_SCHOLAR_API_KEY?.trim();
  const userAgent = env.SOURCE_SEARCH_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

  return {
    Crossref: {
      provider: "Crossref",
      endpoint: env.CROSSREF_WORKS_URL?.trim() || "https://api.crossref.org/works",
      timeoutMs: Number(env.CROSSREF_TIMEOUT_MS) || DEFAULT_SOURCE_TIMEOUT_MS,
      queryLimit: Number(env.CROSSREF_QUERY_LIMIT) || DEFAULT_RESULTS_PER_PROVIDER,
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      mailto: env.CROSSREF_MAILTO?.trim() || undefined,
    },
    OpenAlex: {
      provider: "OpenAlex",
      endpoint: env.OPENALEX_WORKS_URL?.trim() || "https://api.openalex.org/works",
      timeoutMs: Number(env.OPENALEX_TIMEOUT_MS) || DEFAULT_SOURCE_TIMEOUT_MS,
      queryLimit: Number(env.OPENALEX_QUERY_LIMIT) || DEFAULT_RESULTS_PER_PROVIDER,
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
      },
      queryParam: "search",
      selectParam: "display_name,authorships,publication_year,abstract_inverted_index,doi,id,primary_location,host_venue",
    },
    "Semantic Scholar": {
      provider: "Semantic Scholar",
      endpoint: env.SEMANTIC_SCHOLAR_SEARCH_URL?.trim() || "https://api.semanticscholar.org/graph/v1/paper/search",
      timeoutMs: Number(env.SEMANTIC_SCHOLAR_TIMEOUT_MS) || DEFAULT_SOURCE_TIMEOUT_MS,
      queryLimit: Number(env.SEMANTIC_SCHOLAR_QUERY_LIMIT) || DEFAULT_RESULTS_PER_PROVIDER,
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent,
        ...(semanticScholarApiKey ? { "x-api-key": semanticScholarApiKey } : {}),
      },
    },
    Web: {
      provider: "Web",
      endpoint: env.PUBLIC_WEB_SEARCH_URL?.trim() || "https://r.jina.ai/http://www.bing.com/search",
      timeoutMs: Number(env.PUBLIC_WEB_TIMEOUT_MS) || DEFAULT_SOURCE_TIMEOUT_MS,
      queryLimit: Number(env.PUBLIC_WEB_QUERY_LIMIT) || DEFAULT_RESULTS_PER_PROVIDER,
      headers: {
        Accept: "text/plain",
        "User-Agent": userAgent,
      },
      queryParam: "q",
      searchStage: "official",
    },
  };
}
