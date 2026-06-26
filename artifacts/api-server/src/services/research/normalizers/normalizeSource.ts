import type { NormalizedSource } from "@workspace/api-zod/research-tools";
import type { SourceRecord } from "@workspace/api-zod";
import {
  normalizeSourceRecord,
  sourceRecordKey,
} from "@workspace/api-zod";
import { nowIso } from "../workflow/workflowIds";
import {
  cleanWhitespace,
  firstAuthorKey,
  normalizeDoi,
  normalizeTitleKey,
} from "./normalizeText";

function coerceSourceType(source: SourceRecord): NormalizedSource["sourceType"] {
  if (source.sourceKind === "journal") return "journal";
  if (source.sourceKind === "conference") return "conference";
  if (source.sourceKind === "book") return "book";
  if (source.sourceKind === "dataset") return "dataset";
  if (source.sourceKind === "web") return "web";
  if (source.sourceType === "Official Source" || source.sourceType === "Institutional Source") {
    return "government";
  }
  return "unknown";
}

function sourceId(source: SourceRecord): string {
  return source.id || sourceRecordKey(source);
}

export function sourceRecordToNormalizedSource(
  source: SourceRecord,
  overrides: Partial<NormalizedSource> = {},
): NormalizedSource {
  const normalized = normalizeSourceRecord(source);
  const doi = normalizeDoi(normalized.doi ?? undefined);
  const titleKey = normalizeTitleKey(normalized.title);
  const authorKey = firstAuthorKey(normalized.authors);
  const dedupeKey =
    doi ??
    [titleKey, authorKey, normalized.year ?? undefined].filter(Boolean).join("|") ??
    sourceId(normalized);

  return {
    id: sourceId(normalized),
    workflowId: overrides.workflowId ?? normalized.workflowId ?? "unbound-workflow",
    topicHash: overrides.topicHash ?? normalized.topicHash ?? "unbound-topic",
    ...(overrides.queryHash ?? normalized.queryPlanHash
      ? { queryHash: overrides.queryHash ?? normalized.queryPlanHash ?? undefined }
      : {}),
    ...(overrides.queryPlanHash ?? normalized.queryPlanHash
      ? { queryPlanHash: overrides.queryPlanHash ?? normalized.queryPlanHash ?? undefined }
      : {}),
    provider: cleanWhitespace(normalized.provider ?? normalized.sourceType) || normalized.sourceType,
    queryUsed: cleanWhitespace(normalized.queryUsed) || cleanWhitespace(normalized.title) || "unknown query",
    title: normalized.title,
    authors: normalized.authors,
    ...(normalized.year != null ? { year: normalized.year } : {}),
    ...(cleanWhitespace(normalized.containerTitle) ? { venue: cleanWhitespace(normalized.containerTitle) } : {}),
    ...(cleanWhitespace(normalized.publisher) ? { publisher: cleanWhitespace(normalized.publisher) } : {}),
    ...(doi ? { doi } : {}),
    ...(cleanWhitespace(normalized.url) ? { url: cleanWhitespace(normalized.url) } : {}),
    ...(cleanWhitespace(normalized.abstract) ? { abstract: cleanWhitespace(normalized.abstract) } : {}),
    ...(cleanWhitespace(normalized.language) ? { language: cleanWhitespace(normalized.language) } : {}),
    ...(typeof normalized.citationCount === "number" ? { citationCount: normalized.citationCount } : {}),
    sourceType: overrides.sourceType ?? coerceSourceType(normalized),
    ...(typeof normalized.isPeerReviewed === "boolean"
      ? { isPeerReviewed: normalized.isPeerReviewed }
      : {}),
    ...(typeof normalized.isOpenAccess === "boolean"
      ? { isOpenAccess: normalized.isOpenAccess }
      : {}),
    ...(cleanWhitespace(normalized.url) ? { fullTextUrl: cleanWhitespace(normalized.url) } : {}),
    ...(typeof normalized.relevanceScore === "number"
      ? { relevanceScore: normalized.relevanceScore }
      : {}),
    ...(typeof normalized.sourceQualityScore === "number"
      ? { sourceQualityScore: normalized.sourceQualityScore }
      : {}),
    ...(typeof normalized.finalScore === "number" ? { finalScore: normalized.finalScore } : {}),
    dedupeKey,
    retrievedAt: cleanWhitespace(normalized.retrievedAt) || nowIso(),
    ...(cleanWhitespace(normalized.summaryReason)
      ? { rightsNote: cleanWhitespace(normalized.summaryReason) }
      : {}),
    rawProviderPayload: overrides.rawProviderPayload ?? null,
    ...overrides,
  };
}

export function normalizedSourceToSourceRecord(
  source: NormalizedSource,
): SourceRecord {
  return normalizeSourceRecord({
    id: source.id,
    title: source.title,
    authors: source.authors,
    year: source.year ?? null,
    abstract: source.abstract ?? null,
    language: source.language ?? null,
    doi: source.doi ?? null,
    url: source.url ?? source.fullTextUrl ?? null,
    sourceType:
      source.provider === "Official Source" ||
      source.provider === "Institutional Source" ||
      source.provider === "Authoritative Media"
        ? source.provider
        : "OpenAlex",
    reviewState: "accepted",
    publisher: source.publisher ?? null,
    containerTitle: source.venue ?? null,
    provider: source.provider,
    queryUsed: source.queryUsed,
    retrievedAt: source.retrievedAt,
    dedupeKey: source.dedupeKey,
    sourceKind:
      source.sourceType === "government"
        ? "web"
        : source.sourceType === "preprint"
          ? "journal"
          : source.sourceType,
    citationCount: source.citationCount ?? null,
    isOpenAccess: source.isOpenAccess ?? null,
    isPeerReviewed: source.isPeerReviewed ?? null,
    sourceQualityScore: source.sourceQualityScore ?? null,
    relevanceScore: source.relevanceScore ?? null,
    workflowId: source.workflowId,
    topicHash: source.topicHash,
    queryPlanHash: source.queryPlanHash ?? source.queryHash ?? null,
    finalScore: source.finalScore ?? null,
  });
}
