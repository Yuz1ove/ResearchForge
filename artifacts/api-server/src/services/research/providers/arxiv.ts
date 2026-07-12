import type {
  NormalizedSource,
  ResearchQueryPlan,
} from "@workspace/api-zod/research-tools";
import { nowIso } from "../workflow/workflowIds";
import { normalizeTextKey } from "../normalizers/normalizeText";

export const ARXIV_PROVIDER = {
  name: "arXiv",
  envFlag: "ENABLE_ARXIV",
  defaultEndpoint: "https://export.arxiv.org/api/query",
} as const;

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(entry: string, tag: string): string | undefined {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  const value = match?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return value ? decodeXml(value) : undefined;
}

function extractAuthors(entry: string): string[] {
  return Array.from(entry.matchAll(/<name>([\s\S]*?)<\/name>/gi))
    .map((match) => decodeXml(match[1] ?? "").trim())
    .filter(Boolean);
}

function extractPublishedYear(entry: string): number | undefined {
  const published = extractTag(entry, "published");
  const year = published?.slice(0, 4);
  const parsed = Number(year);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function searchArxivSources(
  plan: ResearchQueryPlan,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedSource[]> {
  if (process.env.ENABLE_ARXIV?.trim().toLowerCase() === "false") return [];
  const endpoint = process.env.ARXIV_API_URL?.trim() || ARXIV_PROVIDER.defaultEndpoint;
  const queries = plan.enQueries.slice(0, 4);
  const results: NormalizedSource[] = [];

  for (const query of queries) {
    const url = new URL(endpoint);
    url.searchParams.set("search_query", `all:${query}`);
    url.searchParams.set("start", "0");
    url.searchParams.set("max_results", "8");

    const response = await fetchImpl(url, {
      headers: { Accept: "application/atom+xml" },
    });
    if (!response.ok) continue;
    const xml = await response.text();
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/gi) ?? [];

    for (const entry of entries) {
      const id = extractTag(entry, "id");
      const title = extractTag(entry, "title");
      if (!id || !title || normalizeTextKey(title).length < 8) continue;
      const summary = extractTag(entry, "summary");
      results.push({
        id,
        workflowId: plan.workflowId,
        topicHash: plan.topicHash,
        queryHash: plan.queryHash,
        queryPlanHash: plan.queryPlanHash,
        provider: "arXiv",
        queryUsed: query,
        title,
        authors: extractAuthors(entry),
        ...(extractPublishedYear(entry) ? { year: extractPublishedYear(entry) } : {}),
        ...(summary ? { abstract: summary } : {}),
        sourceType: "preprint",
        isPeerReviewed: false,
        isOpenAccess: true,
        fullTextUrl: id,
        dedupeKey: `arxiv:${id}`,
        retrievedAt: nowIso(),
        rightsNote: "Open-access preprint metadata from arXiv.",
        rawProviderPayload: entry,
      });
    }
  }

  return results;
}
