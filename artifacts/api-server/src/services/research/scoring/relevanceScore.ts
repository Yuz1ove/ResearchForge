import type {
  NormalizedSource,
  ResearchQueryPlan,
} from "@workspace/api-zod/research-tools";
import { normalizeTextKey } from "../normalizers/normalizeText";

function containsAny(text: string, terms: string[]): number {
  return terms.reduce((count, term) => {
    const normalized = normalizeTextKey(term);
    return normalized && text.includes(normalized) ? count + 1 : count;
  }, 0);
}

export function computeRelevanceScore(
  source: NormalizedSource,
  plan: ResearchQueryPlan,
): number {
  if (typeof source.relevanceScore === "number") return source.relevanceScore;

  const text = normalizeTextKey(
    [source.title, source.abstract ?? "", ...(source.keywords ?? [])].join(" "),
  );
  if (!text) return 0;

  const topicHits = containsAny(text, [plan.normalizedTopic]);
  const subtopicHits = containsAny(
    text,
    plan.researchSubtopics.flatMap((subtopic) => [subtopic.labelZh, subtopic.labelEn ?? ""]),
  );
  const queryHits = containsAny(text, [...plan.zhQueries, ...plan.enQueries]);
  const driftHits = containsAny(text, plan.excludedDriftTerms);

  const score = topicHits * 28 + subtopicHits * 12 + queryHits * 4 - driftHits * 20;
  return Math.max(0, Math.min(100, score));
}
