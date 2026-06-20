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

export const SOURCE_KINDS = ["journal", "conference", "book", "dataset", "web", "unknown"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

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
  provider?: string | null;
  queryUsed?: string | null;
  retrievedAt?: string | null;
  dedupeKey?: string | null;
  sourceKind?: SourceKind | null;
  citationCount?: number | null;
  isOpenAccess?: boolean | null;
  isPeerReviewed?: boolean | null;
  sourceQualityScore?: number | null;
  scoreReasons?: string[] | null;
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
  return text.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase() || null;
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
    .replace(/^[\s:.]+|[\s:.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedAuthorKey(author: string | null | undefined): string {
  return normalizeWhitespace(author ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function sourceRecordKey(
  source: Pick<SourceRecord, "title" | "doi" | "url" | "sourceType"> &
    Partial<Pick<SourceRecord, "authors" | "year">>,
): string {
  const doi = normalizeDoiValue(source.doi);
  if (doi) return `doi:${doi.toLowerCase()}`;

  const title = normalizedTitleKey(source.title);
  const firstAuthor = normalizedAuthorKey(source.authors?.[0]);
  const year = normalizeYearValue(source.year);
  if (title && firstAuthor && year) return `title:${title}|author:${firstAuthor}|year:${year}`;
  if (title) return `title:${title}`;

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

function normalizeSourceKind(value: SourceRecordInput["sourceKind"]): SourceKind | null {
  if ((SOURCE_KINDS as readonly unknown[]).includes(value)) {
    return value as SourceKind;
  }
  return null;
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

function nonNegativeInteger(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.trunc(value));
}

function sourceKindFromRecord(
  source: Pick<
    SourceRecord,
    "sourceKind" | "sourceType" | "containerTitle" | "publisher" | "doi" | "url"
  >,
): SourceKind {
  if (source.sourceKind && (SOURCE_KINDS as readonly string[]).includes(source.sourceKind)) {
    return source.sourceKind;
  }

  const text = `${source.containerTitle ?? ""} ${source.publisher ?? ""} ${source.url ?? ""}`.toLowerCase();
  if (/dataset|data set|資料集/.test(text)) return "dataset";
  if (/book|isbn|monograph|chapter|出版社|書籍|專書/.test(text)) return "book";
  if (/conference|proceedings|symposium|會議|研討會/.test(text)) return "conference";
  if (/journal|期刊|transactions|letters|review/.test(text)) return "journal";
  if (source.doi && source.sourceType !== "Semantic Scholar") return "journal";
  if (source.url && !source.doi) return "web";
  return "unknown";
}

export function sourceQualityAssessment(
  source: Pick<
    SourceRecord,
    | "title"
    | "authors"
    | "year"
    | "abstract"
    | "doi"
    | "containerTitle"
    | "publisher"
    | "citationCount"
    | "isOpenAccess"
    | "sourceKind"
    | "sourceType"
    | "url"
  >,
): { sourceQualityScore: number; scoreReasons: string[]; sourceKind: SourceKind } {
  const reasons: string[] = [];
  let score = 0;
  const sourceKind = sourceKindFromRecord(source);

  if (source.doi) {
    score += 20;
    reasons.push("has DOI");
  }
  if (source.title?.trim()) {
    score += 10;
    reasons.push("has title");
  }
  if (source.authors.length > 0) {
    score += 10;
    reasons.push("has authors");
  }
  if (source.year) {
    score += 10;
    reasons.push("has year");
  }
  if (source.containerTitle?.trim() || source.publisher?.trim()) {
    score += 10;
    reasons.push("has venue");
  }
  if (source.abstract?.trim()) {
    score += 15;
    reasons.push("has abstract");
  }
  if (typeof source.citationCount === "number" && source.citationCount > 0) {
    score += Math.min(15, Math.log10(source.citationCount + 1) * 5);
    reasons.push("citation count available");
  }
  if (source.isOpenAccess) {
    score += 5;
    reasons.push("open access");
  }
  if (sourceKind === "journal" || sourceKind === "conference") {
    score += 5;
    reasons.push("journal/conference source");
  }

  return {
    sourceQualityScore: Math.min(100, Math.round(score)),
    scoreReasons: reasons,
    sourceKind,
  };
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
  | "provider"
  | "queryUsed"
  | "retrievedAt"
  | "dedupeKey"
  | "sourceKind"
  | "citationCount"
  | "isOpenAccess"
  | "isPeerReviewed"
  | "sourceQualityScore"
  | "scoreReasons"
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
    ...(source.provider != null ? { provider: source.provider } : {}),
    ...(source.queryUsed != null ? { queryUsed: source.queryUsed } : {}),
    ...(source.retrievedAt != null ? { retrievedAt: source.retrievedAt } : {}),
    ...(source.dedupeKey != null ? { dedupeKey: source.dedupeKey } : {}),
    ...(source.sourceKind != null ? { sourceKind: source.sourceKind } : {}),
    ...(source.citationCount != null ? { citationCount: source.citationCount } : {}),
    ...(source.isOpenAccess != null ? { isOpenAccess: source.isOpenAccess } : {}),
    ...(source.isPeerReviewed != null ? { isPeerReviewed: source.isPeerReviewed } : {}),
    ...(source.sourceQualityScore != null
      ? { sourceQualityScore: source.sourceQualityScore }
      : {}),
    ...(source.scoreReasons != null ? { scoreReasons: source.scoreReasons } : {}),
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
  const sourceType = existing.sourceType;

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
    provider: existing.provider ?? incoming.provider ?? existing.sourceType,
    queryUsed: existing.queryUsed ?? incoming.queryUsed ?? null,
    retrievedAt: existing.retrievedAt ?? incoming.retrievedAt ?? null,
    dedupeKey: existing.dedupeKey ?? incoming.dedupeKey ?? null,
    sourceKind: existing.sourceKind ?? incoming.sourceKind ?? null,
    citationCount: mergeOptionalScore(existing.citationCount, incoming.citationCount),
    isOpenAccess:
      typeof existing.isOpenAccess === "boolean" || typeof incoming.isOpenAccess === "boolean"
        ? Boolean(existing.isOpenAccess || incoming.isOpenAccess)
        : null,
    isPeerReviewed:
      typeof existing.isPeerReviewed === "boolean" || typeof incoming.isPeerReviewed === "boolean"
        ? Boolean(existing.isPeerReviewed || incoming.isPeerReviewed)
        : null,
    sourceQualityScore: mergeOptionalScore(existing.sourceQualityScore, incoming.sourceQualityScore),
    scoreReasons: mergeOptionalStringLists(existing.scoreReasons, incoming.scoreReasons),
  });

  const doi = existing.doi ?? incoming.doi;
  const doiUrl = doi ? `https://doi.org/${doi}` : null;
  const mergedBase: SourceRecord = {
    ...existing,
    title:
      existing.title.length >= incoming.title.length
        ? existing.title
        : incoming.title,
    authors: uniqueStrings([...existing.authors, ...incoming.authors]),
    year: existing.year ?? incoming.year,
    abstract,
    doi,
    url: doiUrl ?? existing.url ?? incoming.url,
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
  const quality = sourceQualityAssessment(mergedBase);
  const mergedProviders =
    existing.sourceType === incoming.sourceType
      ? []
      : [`merged providers: ${uniqueStrings([existing.sourceType, incoming.sourceType]).join(", ")}`];

  return {
    ...mergedBase,
    dedupeKey: sourceRecordKey(mergedBase),
    sourceKind: quality.sourceKind,
    sourceQualityScore: quality.sourceQualityScore,
    scoreReasons: uniqueStrings([
      ...quality.scoreReasons,
      ...(metadata.scoreReasons ?? []),
      ...mergedProviders,
    ]),
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
  const citationCount = nonNegativeInteger(source.citationCount);
  const isOpenAccess =
    typeof source.isOpenAccess === "boolean" ? source.isOpenAccess : null;
  const isPeerReviewed =
    typeof source.isPeerReviewed === "boolean" ? source.isPeerReviewed : null;
  const sourceKind = normalizeSourceKind(source.sourceKind);
  const dedupeKey = cleanText(source.dedupeKey) ?? sourceRecordKey(record);
  const quality = sourceQualityAssessment({
    ...record,
    citationCount,
    isOpenAccess,
    sourceKind,
  });
  const metadata = metadataFields({
    provider: cleanText(source.provider),
    queryUsed: cleanText(source.queryUsed),
    retrievedAt: cleanText(source.retrievedAt),
    dedupeKey,
    sourceKind: quality.sourceKind,
    citationCount,
    isOpenAccess,
    isPeerReviewed,
    sourceQualityScore: finiteScore(source.sourceQualityScore) ?? quality.sourceQualityScore,
    scoreReasons: uniqueStrings([
      ...quality.scoreReasons,
      ...(cleanStringList(source.scoreReasons) ?? []),
    ]),
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
    id: record.id || dedupeKey,
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
