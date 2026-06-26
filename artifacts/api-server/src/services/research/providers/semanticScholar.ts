export const SEMANTIC_SCHOLAR_PROVIDER = {
  name: "Semantic Scholar",
  envFlag: "ENABLE_SEMANTIC_SCHOLAR",
  defaultEndpoint: "https://api.semanticscholar.org/graph/v1/paper/search",
  apiKeyEnv: "SEMANTIC_SCHOLAR_API_KEY",
} as const;
