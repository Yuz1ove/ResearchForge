export const SOURCE_PROVIDERS = ["OpenAlex", "Semantic Scholar", "Crossref"] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export const SOURCE_REVIEW_STATES = ["pending", "accepted", "rejected"] as const;
export type SourceReviewState = (typeof SOURCE_REVIEW_STATES)[number];

export const SOURCE_RELEVANCE_LEVELS = ["primary", "secondary", "clue", "low", "off_topic"] as const;
export type SourceRelevanceLevel = (typeof SOURCE_RELEVANCE_LEVELS)[number];

export const SOURCE_EVIDENCE_GROUNDING_STATUSES = [
  "abstract_grounded",
  "snippet_grounded",
  "metadata_only",
  "insufficient",
] as const;
export type SourceEvidenceGroundingStatus = (typeof SOURCE_EVIDENCE_GROUNDING_STATUSES)[number];

export const SOURCE_RELEVANCE_CLASSIFICATIONS = [
  "primary",
  "review",
  "low_quality",
  "off_topic",
  "trusted_but_off_topic",
  "stale_topic",
  "stale_workflow",
] as const;
export type SourceRelevanceClassification = (typeof SOURCE_RELEVANCE_CLASSIFICATIONS)[number];

export interface SourceRecord {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  doi: string | null;
  url: string | null;
  sourceType: SourceProvider;
  reviewState: SourceReviewState;
  publisher: string | null;
  containerTitle: string | null;
  accessedAt: string | null;
  relevanceLevel?: SourceRelevanceLevel | null;
  relevanceScore?: number | null;
  relevanceReasons?: string[] | null;
  matchedCoreConcepts?: string[] | null;
  missingCoreConcepts?: string[] | null;
  matchedFacets?: string[] | null;
  missingRequiredFacets?: string[] | null;
  evidenceGrounding?: SourceEvidenceGroundingStatus | null;
  sourceRelevanceReasonZhTw?: string | null;
  shouldShowInMainList?: boolean | null;
  shouldRecommendAccept?: boolean | null;
  workflowId?: string | null;
  topic?: string | null;
  normalizedTopic?: string | null;
  topicHash?: string | null;
  queryPlanHash?: string | null;
  authorityScore?: number | null;
  summaryUsabilityScore?: number | null;
  metadataCompletenessScore?: number | null;
  recencyScore?: number | null;
  languageFitScore?: number | null;
  finalScore?: number | null;
  classification?: SourceRelevanceClassification | null;
  rejectReason?: string | null;
  matchedTerms?: string[] | null;
  driftTerms?: string[] | null;
}

export type SourceRecordInput = Partial<SourceRecord> & {
  title?: string | null;
  authors?: Array<string | null | undefined> | null;
  sourceType: SourceProvider;
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeDoiValue(value: string | null | undefined): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim() || null;
}

function normalizeYearValue(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.trunc(value);
}

function stableHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizedTitleKey(title: string): string {
  return normalizeWhitespace(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function sourceRecordKey(source: Pick<SourceRecord, "title" | "doi" | "url" | "sourceType">): string {
  const doi = normalizeDoiValue(source.doi);
  if (doi) return `doi:${doi.toLowerCase()}`;

  const title = normalizedTitleKey(source.title);
  if (title) return `title:${title}`;

  const url = cleanText(source.url);
  if (url) return `url:${url.toLowerCase()}`;

  return `source:${source.sourceType}:${stableHash(JSON.stringify(source))}`;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => normalizeWhitespace(item)).filter(Boolean)));
}

function textLength(value: string | null): number {
  return value?.trim().length ?? 0;
}

function cleanStringList(value: string[] | null | undefined): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = uniqueStrings(value);
  return items.length ? items : null;
}

function normalizeRelevanceLevel(value: SourceRecordInput["relevanceLevel"]): SourceRecord["relevanceLevel"] {
  if ((SOURCE_RELEVANCE_LEVELS as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function normalizeEvidenceGrounding(
  value: SourceRecordInput["evidenceGrounding"],
): SourceRecord["evidenceGrounding"] {
  if ((SOURCE_EVIDENCE_GROUNDING_STATUSES as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function normalizeClassification(
  value: SourceRecordInput["classification"],
): SourceRecord["classification"] {
  if ((SOURCE_RELEVANCE_CLASSIFICATIONS as readonly unknown[]).includes(value)) {
    return value;
  }
  return null;
}

function finiteScore(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mergeOptionalStringLists(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
): string[] | null {
  const merged = uniqueStrings([...(existing ?? []), ...(incoming ?? [])]);
  return merged.length ? merged : null;
}

function mergeOptionalScore(
  existing: number | null | undefined,
  incoming: number | null | undefined,
): number | null {
  if (typeof existing === "number" && typeof incoming === "number") {
    return Math.max(existing, incoming);
  }
  return existing ?? incoming ?? null;
}

function metadataFields(source: Pick<
  SourceRecord,
  | "relevanceLevel"
  | "relevanceScore"
  | "relevanceReasons"
  | "matchedCoreConcepts"
  | "missingCoreConcepts"
  | "matchedFacets"
  | "missingRequiredFacets"
  | "evidenceGrounding"
  | "sourceRelevanceReasonZhTw"
  | "shouldShowInMainList"
  | "shouldRecommendAccept"
  | "workflowId"
  | "topic"
  | "normalizedTopic"
  | "topicHash"
  | "queryPlanHash"
  | "authorityScore"
  | "summaryUsabilityScore"
  | "metadataCompletenessScore"
  | "recencyScore"
  | "languageFitScore"
  | "finalScore"
  | "classification"
  | "rejectReason"
  | "matchedTerms"
  | "driftTerms"
>): Partial<SourceRecord> {
  return {
    ...(source.relevanceLevel != null ? { relevanceLevel: source.relevanceLevel } : {}),
    ...(source.relevanceScore != null ? { relevanceScore: source.relevanceScore } : {}),
    ...(source.relevanceReasons != null ? { relevanceReasons: source.relevanceReasons } : {}),
    ...(source.matchedCoreConcepts != null ? { matchedCoreConcepts: source.matchedCoreConcepts } : {}),
    ...(source.missingCoreConcepts != null ? { missingCoreConcepts: source.missingCoreConcepts } : {}),
    ...(source.matchedFacets != null ? { matchedFacets: source.matchedFacets } : {}),
    ...(source.missingRequiredFacets != null
      ? { missingRequiredFacets: source.missingRequiredFacets }
      : {}),
    ...(source.evidenceGrounding != null ? { evidenceGrounding: source.evidenceGrounding } : {}),
    ...(source.sourceRelevanceReasonZhTw != null
      ? { sourceRelevanceReasonZhTw: source.sourceRelevanceReasonZhTw }
      : {}),
    ...(source.shouldShowInMainList != null
      ? { shouldShowInMainList: source.shouldShowInMainList }
      : {}),
    ...(source.shouldRecommendAccept != null
      ? { shouldRecommendAccept: source.shouldRecommendAccept }
      : {}),
    ...(source.workflowId != null ? { workflowId: source.workflowId } : {}),
    ...(source.topic != null ? { topic: source.topic } : {}),
    ...(source.normalizedTopic != null ? { normalizedTopic: source.normalizedTopic } : {}),
    ...(source.topicHash != null ? { topicHash: source.topicHash } : {}),
    ...(source.queryPlanHash != null ? { queryPlanHash: source.queryPlanHash } : {}),
    ...(source.authorityScore != null ? { authorityScore: source.authorityScore } : {}),
    ...(source.summaryUsabilityScore != null
      ? { summaryUsabilityScore: source.summaryUsabilityScore }
      : {}),
    ...(source.metadataCompletenessScore != null
      ? { metadataCompletenessScore: source.metadataCompletenessScore }
      : {}),
    ...(source.recencyScore != null ? { recencyScore: source.recencyScore } : {}),
    ...(source.languageFitScore != null ? { languageFitScore: source.languageFitScore } : {}),
    ...(source.finalScore != null ? { finalScore: source.finalScore } : {}),
    ...(source.classification != null ? { classification: source.classification } : {}),
    ...(source.rejectReason != null ? { rejectReason: source.rejectReason } : {}),
    ...(source.matchedTerms != null ? { matchedTerms: source.matchedTerms } : {}),
    ...(source.driftTerms != null ? { driftTerms: source.driftTerms } : {}),
  };
}

function mergeSourceRecords(existing: SourceRecord, incoming: SourceRecord): SourceRecord {
  const existingAbstractLength = textLength(existing.abstract);
  const incomingAbstractLength = textLength(incoming.abstract);
  const abstract =
    incomingAbstractLength > existingAbstractLength
      ? incoming.abstract
      : existing.abstract;
  const sourceType =
    existingAbstractLength === 0 && incomingAbstractLength > 0
      ? incoming.sourceType
      : existing.sourceType;

  const metadata = metadataFields({
    relevanceLevel: existing.relevanceLevel ?? incoming.relevanceLevel ?? null,
    relevanceScore: mergeOptionalScore(existing.relevanceScore, incoming.relevanceScore),
    relevanceReasons: mergeOptionalStringLists(
      existing.relevanceReasons,
      incoming.relevanceReasons,
    ),
    matchedCoreConcepts: mergeOptionalStringLists(
      existing.matchedCoreConcepts,
      incoming.matchedCoreConcepts,
    ),
    missingCoreConcepts: mergeOptionalStringLists(
      existing.missingCoreConcepts,
      incoming.missingCoreConcepts,
    ),
    matchedFacets: mergeOptionalStringLists(existing.matchedFacets, incoming.matchedFacets),
    missingRequiredFacets: mergeOptionalStringLists(
      existing.missingRequiredFacets,
      incoming.missingRequiredFacets,
    ),
    evidenceGrounding: existing.evidenceGrounding ?? incoming.evidenceGrounding ?? null,
    sourceRelevanceReasonZhTw:
      existing.sourceRelevanceReasonZhTw ?? incoming.sourceRelevanceReasonZhTw ?? null,
    shouldShowInMainList:
      existing.shouldShowInMainList ?? incoming.shouldShowInMainList ?? null,
    shouldRecommendAccept:
      existing.shouldRecommendAccept ?? incoming.shouldRecommendAccept ?? null,
    workflowId: existing.workflowId ?? incoming.workflowId ?? null,
    topic: existing.topic ?? incoming.topic ?? null,
    normalizedTopic: existing.normalizedTopic ?? incoming.normalizedTopic ?? null,
    topicHash: existing.topicHash ?? incoming.topicHash ?? null,
    queryPlanHash: existing.queryPlanHash ?? incoming.queryPlanHash ?? null,
    authorityScore: mergeOptionalScore(existing.authorityScore, incoming.authorityScore),
    summaryUsabilityScore: mergeOptionalScore(
      existing.summaryUsabilityScore,
      incoming.summaryUsabilityScore,
    ),
    metadataCompletenessScore: mergeOptionalScore(
      existing.metadataCompletenessScore,
      incoming.metadataCompletenessScore,
    ),
    recencyScore: mergeOptionalScore(existing.recencyScore, incoming.recencyScore),
    languageFitScore: mergeOptionalScore(existing.languageFitScore, incoming.languageFitScore),
    finalScore: mergeOptionalScore(existing.finalScore, incoming.finalScore),
    classification: existing.classification ?? incoming.classification ?? null,
    rejectReason: existing.rejectReason ?? incoming.rejectReason ?? null,
    matchedTerms: mergeOptionalStringLists(existing.matchedTerms, incoming.matchedTerms),
    driftTerms: mergeOptionalStringLists(existing.driftTerms, incoming.driftTerms),
  });

  return {
    ...existing,
    title:
      existing.title.length >= incoming.title.length
        ? existing.title
        : incoming.title,
    authors: uniqueStrings([...existing.authors, ...incoming.authors]),
    year: existing.year ?? incoming.year,
    abstract,
    doi: existing.doi ?? incoming.doi,
    url: existing.url ?? incoming.url,
    sourceType,
    reviewState:
      existing.reviewState === "accepted" || incoming.reviewState === "accepted"
        ? "accepted"
        : existing.reviewState === "rejected" || incoming.reviewState === "rejected"
          ? "rejected"
          : "pending",
    publisher: existing.publisher ?? incoming.publisher,
    containerTitle: existing.containerTitle ?? incoming.containerTitle,
    accessedAt: existing.accessedAt ?? incoming.accessedAt,
    ...metadata,
  };
}

export function normalizeSourceRecord(source: SourceRecordInput): SourceRecord {
  const title = cleanText(source.title) ?? "";
  const authors = (source.authors ?? [])
    .map((author) => cleanText(author))
    .filter((author): author is string => Boolean(author));
  const doi = normalizeDoiValue(source.doi);
  const url = cleanText(source.url);
  const record: SourceRecord = {
    id: cleanText(source.id) ?? "",
    title,
    authors,
    year: normalizeYearValue(source.year),
    abstract: cleanText(source.abstract),
    doi,
    url,
    sourceType: source.sourceType,
    reviewState: source.reviewState ?? "pending",
    publisher: cleanText(source.publisher),
    containerTitle: cleanText(source.containerTitle),
    accessedAt: cleanText(source.accessedAt),
  };
  const metadata = metadataFields({
    relevanceLevel: normalizeRelevanceLevel(source.relevanceLevel),
    relevanceScore:
      typeof source.relevanceScore === "number" && Number.isFinite(source.relevanceScore)
        ? source.relevanceScore
        : null,
    relevanceReasons: cleanStringList(source.relevanceReasons),
    matchedCoreConcepts: cleanStringList(source.matchedCoreConcepts),
    missingCoreConcepts: cleanStringList(source.missingCoreConcepts),
    matchedFacets: cleanStringList(source.matchedFacets),
    missingRequiredFacets: cleanStringList(source.missingRequiredFacets),
    evidenceGrounding: normalizeEvidenceGrounding(source.evidenceGrounding),
    sourceRelevanceReasonZhTw: cleanText(source.sourceRelevanceReasonZhTw),
    shouldShowInMainList:
      typeof source.shouldShowInMainList === "boolean"
        ? source.shouldShowInMainList
        : null,
    shouldRecommendAccept:
      typeof source.shouldRecommendAccept === "boolean"
        ? source.shouldRecommendAccept
        : null,
    workflowId: cleanText(source.workflowId),
    topic: cleanText(source.topic),
    normalizedTopic: cleanText(source.normalizedTopic),
    topicHash: cleanText(source.topicHash),
    queryPlanHash: cleanText(source.queryPlanHash),
    authorityScore: finiteScore(source.authorityScore),
    summaryUsabilityScore: finiteScore(source.summaryUsabilityScore),
    metadataCompletenessScore: finiteScore(source.metadataCompletenessScore),
    recencyScore: finiteScore(source.recencyScore),
    languageFitScore: finiteScore(source.languageFitScore),
    finalScore: finiteScore(source.finalScore),
    classification: normalizeClassification(source.classification),
    rejectReason: cleanText(source.rejectReason),
    matchedTerms: cleanStringList(source.matchedTerms),
    driftTerms: cleanStringList(source.driftTerms),
  });

  return {
    ...record,
    ...metadata,
    id: record.id || sourceRecordKey(record),
  };
}

export function dedupeSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  const seen = new Map<string, SourceRecord>();
  const deduped: SourceRecord[] = [];

  for (const source of sources) {
    const normalized = normalizeSourceRecord(source);
    const key = sourceRecordKey(normalized);
    const existing = seen.get(key);
    if (existing) {
      const merged = { ...mergeSourceRecords(existing, normalized), id: existing.id || key };
      seen.set(key, merged);
      const index = deduped.findIndex((item) => item.id === existing.id);
      if (index >= 0) deduped[index] = merged;
      continue;
    }
    const inserted = { ...normalized, id: normalized.id || key };
    seen.set(key, inserted);
    deduped.push(inserted);
  }

  return deduped;
}

export function acceptedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "accepted");
}

export function rejectedSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  return sources.filter((source) => source.reviewState === "rejected");
}
