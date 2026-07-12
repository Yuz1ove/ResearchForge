import type { NormalizedSource } from "@workspace/api-zod/research-tools";

const PROVIDER_RELIABILITY: Record<string, number> = {
  OpenAlex: 18,
  Crossref: 18,
  "Semantic Scholar": 20,
  arXiv: 14,
  DOAJ: 16,
  CORE: 15,
  Unpaywall: 12,
  "Official Source": 14,
  "Institutional Source": 13,
  "Authoritative Media": 8,
};

export function computeSourceQualityScore(source: NormalizedSource): number {
  if (typeof source.sourceQualityScore === "number") return source.sourceQualityScore;

  let score = 0;
  if (source.doi) score += 18;
  if (source.abstract) score += 14;
  if (source.authors.length > 0) score += 10;
  if (source.year) score += 8;
  if (source.venue) score += 8;
  if (source.isPeerReviewed) score += 10;
  if (source.isOpenAccess) score += 6;
  if (typeof source.citationCount === "number") {
    score += Math.min(10, Math.log10(source.citationCount + 1) * 4);
  }
  score += PROVIDER_RELIABILITY[source.provider] ?? 6;

  return Math.max(0, Math.min(100, score));
}
