import type { NormalizedSource } from "@workspace/api-zod/research-tools";
import { computeRelevanceScore } from "./relevanceScore";
import { computeSourceQualityScore } from "./sourceQualityScore";
import type { ResearchQueryPlan } from "@workspace/api-zod/research-tools";

export function computeFinalScore(
  source: NormalizedSource,
  plan: ResearchQueryPlan,
): number {
  const relevanceScore = computeRelevanceScore(source, plan);
  const sourceQualityScore = computeSourceQualityScore(source);
  const finalScore = relevanceScore * 0.65 + sourceQualityScore * 0.35;
  return Math.max(0, Math.min(100, Number(finalScore.toFixed(2))));
}
