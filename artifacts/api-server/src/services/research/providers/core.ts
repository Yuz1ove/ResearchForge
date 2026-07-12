import type {
  NormalizedSource,
  ResearchQueryPlan,
} from "@workspace/api-zod/research-tools";
import { searchArxivSources } from "./arxiv";

export const CORE_PROVIDER = {
  name: "CORE",
  envFlag: "ENABLE_CORE",
  apiKeyEnv: "CORE_API_KEY",
  defaultEndpoint: "https://api.core.ac.uk/v3/search/works",
} as const;

export interface ResearchProviderDiagnostic {
  provider: string;
  query: string;
  ok: boolean;
  resultCount: number;
  errorType: string | null;
  errorMessage: string | null;
}

export async function runSupplementalProviderSearches(
  plan: ResearchQueryPlan,
  fetchImpl?: typeof fetch,
): Promise<{
  sources: NormalizedSource[];
  diagnostics: ResearchProviderDiagnostic[];
}> {
  const sources: NormalizedSource[] = [];
  const diagnostics: ResearchProviderDiagnostic[] = [];

  try {
    const arxivResults = await searchArxivSources(plan, fetchImpl ?? fetch);
    sources.push(...arxivResults);
    diagnostics.push({
      provider: "arXiv",
      query: plan.enQueries[0] ?? plan.normalizedTopic,
      ok: true,
      resultCount: arxivResults.length,
      errorType: null,
      errorMessage: null,
    });
  } catch (error) {
    diagnostics.push({
      provider: "arXiv",
      query: plan.enQueries[0] ?? plan.normalizedTopic,
      ok: false,
      resultCount: 0,
      errorType: "provider_error",
      errorMessage: error instanceof Error ? error.message : "unknown arXiv error",
    });
  }

  return { sources, diagnostics };
}
