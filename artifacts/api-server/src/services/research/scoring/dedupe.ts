import type { NormalizedSource } from "@workspace/api-zod/research-tools";
import {
  firstAuthorKey,
  normalizeDoi,
  normalizeTitleKey,
} from "../normalizers/normalizeText";

function metadataCompleteness(source: NormalizedSource): number {
  let score = 0;
  if (source.doi) score += 4;
  if (source.abstract) score += 3;
  if (source.authors.length > 0) score += 2;
  if (source.year) score += 1;
  if (source.venue) score += 1;
  if (typeof source.citationCount === "number") score += 1;
  if (typeof source.finalScore === "number") score += source.finalScore / 100;
  return score;
}

function yearNear(a?: number, b?: number): boolean {
  if (!a || !b) return false;
  return Math.abs(a - b) <= 1;
}

function titleSimilarity(a: string, b: string): number {
  const aTokens = new Set(normalizeTitleKey(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizeTitleKey(b).split(" ").filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersect = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) intersect += 1;
  }
  return intersect / new Set([...aTokens, ...bTokens]).size;
}

function canonicalSource(
  left: NormalizedSource,
  right: NormalizedSource,
): NormalizedSource {
  return metadataCompleteness(left) >= metadataCompleteness(right) ? left : right;
}

function mergeSourceGroup(group: NormalizedSource[]): NormalizedSource {
  return group.reduce((current, next) => {
    const canonical = canonicalSource(current, next);
    const secondary = canonical === current ? next : current;
    return {
      ...canonical,
      mergedFrom: [
        ...(canonical.mergedFrom ?? []),
        {
          provider: secondary.provider,
          id: secondary.id,
          ...(secondary.doi ? { doi: secondary.doi } : {}),
          ...(secondary.url ? { url: secondary.url } : {}),
        },
      ],
      rawProviderPayload: canonical.rawProviderPayload ?? secondary.rawProviderPayload,
    };
  });
}

export function dedupeNormalizedSources(
  sources: NormalizedSource[],
): NormalizedSource[] {
  const buckets = new Map<string, NormalizedSource[]>();

  for (const source of sources) {
    const doi = normalizeDoi(source.doi);
    const titleKey = normalizeTitleKey(source.title);
    const authorKey = firstAuthorKey(source.authors);
    const key = doi || [titleKey, authorKey, source.year ?? ""].join("|");
    const existing = buckets.get(key);
    if (existing) {
      existing.push(source);
      continue;
    }

    let matchedKey: string | null = null;
    for (const [candidateKey, candidateGroup] of buckets.entries()) {
      const candidate = candidateGroup[0];
      if (!candidate) continue;
      const similar =
        titleSimilarity(candidate.title, source.title) >= 0.92 &&
        firstAuthorKey(candidate.authors) === authorKey &&
        yearNear(candidate.year, source.year);
      if (similar) {
        matchedKey = candidateKey;
        break;
      }
    }

    if (matchedKey) {
      buckets.get(matchedKey)?.push(source);
    } else {
      buckets.set(key, [source]);
    }
  }

  return Array.from(buckets.values()).map(mergeSourceGroup);
}
