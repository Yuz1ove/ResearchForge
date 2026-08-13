import {
  defaultUsableSections,
  normalizeSourceForReview,
  sourceRecordKey,
  sourceReviewState,
  type SourceRecord,
  type SourceReviewState,
} from "./sourceRecords.ts";

export const PAPER_SEARCH_HANDOFF_STORAGE_KEY =
  "researchforge:paper-search-handoff:v1";

const PAPER_SEARCH_SOURCE_REVIEW_STORAGE_PREFIX =
  "researchforge:paper-search-source-review:v1";

export interface PaperSearchSourceReviewContext {
  workflowId: string;
  topicHash: string;
  runId: string;
}

interface StoredPaperSearchSourceDecision {
  keys: string[];
  reviewState: SourceReviewState;
  acceptedByUser: boolean | null;
  userDecision: string | null;
  acceptedAs: string | null;
  needsReview: boolean | null;
}

interface StoredPaperSearchSourceReviews {
  version: 1;
  workflowId: string;
  topicHash: string;
  runId: string;
  decisions: StoredPaperSearchSourceDecision[];
  updatedAt: string;
}

export interface PaperSearchHandoffPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  provider: string | null;
  citationCount: number | null;
  isOpenAccess: boolean | null;
  abstract: string | null;
  summary: string;
  summaryStatus: string | null;
  summarySourceType: string | null;
  summaryConfidence: string | null;
}

export interface PaperSearchHandoff {
  version: 1;
  workflowId: string;
  runId: string;
  query: string;
  queries: string[];
  papers: PaperSearchHandoffPaper[];
  createdAt: string;
}

function paperIdentityKey(paper: PaperSearchHandoffPaper): string {
  const doi = paper.doi?.trim().toLocaleLowerCase();
  if (doi) return `doi:${doi}`;
  if (paper.id.trim()) return `id:${paper.id.trim()}`;
  return `title:${paper.title.trim().toLocaleLowerCase()}:${paper.year ?? ""}`;
}

const PREPRINT_DOI_PATTERNS = [
  /^10\.1101\//u,
  /^10\.21203\/rs\./u,
  /^10\.2139\/ssrn\./u,
  /^10\.48550\/arxiv\./u,
];

function normalizedIdentityText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function normalizedDoi(value: string | null): string | null {
  const doi = value
    ?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .trim()
    .toLocaleLowerCase();
  return doi || null;
}

function isPreprintDoi(value: string | null): boolean {
  const doi = normalizedDoi(value);
  return Boolean(
    doi && PREPRINT_DOI_PATTERNS.some((pattern) => pattern.test(doi)),
  );
}

function sameResearchVersion(
  left: PaperSearchHandoffPaper,
  right: PaperSearchHandoffPaper,
): boolean {
  const leftDoi = normalizedDoi(left.doi);
  const rightDoi = normalizedDoi(right.doi);
  if (!leftDoi || !rightDoi || leftDoi === rightDoi) return false;
  if (!isPreprintDoi(leftDoi) && !isPreprintDoi(rightDoi)) return false;
  if (left.year == null || left.year !== right.year) return false;
  if (
    normalizedIdentityText(left.title) !== normalizedIdentityText(right.title)
  )
    return false;
  const leftAuthors = left.authors.map(normalizedIdentityText).filter(Boolean);
  const rightAuthors = right.authors
    .map(normalizedIdentityText)
    .filter(Boolean);
  return (
    leftAuthors.length > 0 &&
    leftAuthors.length === rightAuthors.length &&
    leftAuthors.every((author, index) => author === rightAuthors[index])
  );
}

function canonicalVersionDoi(
  left: PaperSearchHandoffPaper,
  right: PaperSearchHandoffPaper,
): string | null {
  const dois = [normalizedDoi(left.doi), normalizedDoi(right.doi)].filter(
    (value): value is string => Boolean(value),
  );
  const published = dois.filter((doi) => !isPreprintDoi(doi));
  return (published.length > 0 ? published : dois).sort()[0] ?? null;
}

function mergedProviders(...values: Array<string | null>): string | null {
  const providers = Array.from(
    new Set(
      values
        .flatMap((value) => value?.split(",") ?? [])
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  return providers.length > 0 ? providers.join(", ") : null;
}

function mergeDuplicatePaper(
  preferred: PaperSearchHandoffPaper,
  fallback: PaperSearchHandoffPaper,
): PaperSearchHandoffPaper {
  const versionDoi = sameResearchVersion(preferred, fallback)
    ? canonicalVersionDoi(preferred, fallback)
    : (preferred.doi ?? fallback.doi);
  return {
    ...preferred,
    authors:
      preferred.authors.length > 0 ? preferred.authors : fallback.authors,
    year: preferred.year ?? fallback.year,
    venue: preferred.venue ?? fallback.venue,
    doi: versionDoi,
    url: versionDoi
      ? `https://doi.org/${versionDoi}`
      : (preferred.url ?? fallback.url),
    provider: mergedProviders(preferred.provider, fallback.provider),
    citationCount:
      preferred.citationCount === null
        ? fallback.citationCount
        : fallback.citationCount === null
          ? preferred.citationCount
          : Math.max(preferred.citationCount, fallback.citationCount),
    isOpenAccess:
      preferred.isOpenAccess === true || fallback.isOpenAccess === true
        ? true
        : (preferred.isOpenAccess ?? fallback.isOpenAccess),
    abstract: preferred.abstract?.trim()
      ? preferred.abstract
      : fallback.abstract,
    summary: preferred.summary.trim() ? preferred.summary : fallback.summary,
    summaryStatus: preferred.summaryStatus ?? fallback.summaryStatus,
    summarySourceType:
      preferred.summarySourceType ?? fallback.summarySourceType,
    summaryConfidence:
      preferred.summaryConfidence ?? fallback.summaryConfidence,
  };
}

/**
 * Merge fast and expanded search responses without losing richer fields from a
 * duplicate provider record. Continue scanning after the visible limit so a
 * later provider duplicate can still backfill an abstract or DOI.
 */
export function mergePaperSearchPapers(
  primary: PaperSearchHandoffPaper[],
  secondary: PaperSearchHandoffPaper[],
  summaries: Map<string, PaperSearchHandoffPaper>,
  limit: number,
): PaperSearchHandoffPaper[] {
  const indexByIdentity = new Map<string, number>();
  const merged: PaperSearchHandoffPaper[] = [];

  for (const paper of [...primary, ...secondary]) {
    const identity = paperIdentityKey(paper);
    const exactExistingIndex = indexByIdentity.get(identity);
    const existingIndex =
      exactExistingIndex ??
      merged.findIndex((candidate) => sameResearchVersion(candidate, paper));
    if (existingIndex >= 0) {
      merged[existingIndex] = mergeDuplicatePaper(
        merged[existingIndex]!,
        paper,
      );
      indexByIdentity.set(identity, existingIndex);
      indexByIdentity.set(
        paperIdentityKey(merged[existingIndex]!),
        existingIndex,
      );
      continue;
    }
    if (merged.length >= limit) continue;
    indexByIdentity.set(identity, merged.length);
    merged.push(paper);
  }

  return merged.map((paper) => {
    const summarized = summaries.get(paper.id);
    return summarized
      ? {
          ...paper,
          summary: summarized.summary,
          summaryStatus: summarized.summaryStatus,
          summarySourceType: summarized.summarySourceType,
          summaryConfidence: summarized.summaryConfidence,
        }
      : paper;
  });
}

type HandoffStorage = Pick<Storage, "getItem" | "setItem">;

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePaper(
  value: unknown,
  index: number,
): PaperSearchHandoffPaper | null {
  if (!value || typeof value !== "object") return null;
  const paper = value as Record<string, unknown>;
  const title = nullableString(paper.title);
  if (!title) return null;
  return {
    id: nullableString(paper.id) ?? `paper-search-${index + 1}`,
    title,
    authors: uniqueStrings(paper.authors),
    year: nullableNumber(paper.year),
    venue: nullableString(paper.venue),
    doi: nullableString(paper.doi),
    url: nullableString(paper.url),
    provider: nullableString(paper.provider),
    citationCount: nullableNumber(paper.citationCount),
    isOpenAccess:
      typeof paper.isOpenAccess === "boolean" ? paper.isOpenAccess : null,
    abstract: nullableString(paper.abstract),
    summary: nullableString(paper.summary) ?? "",
    summaryStatus: nullableString(paper.summaryStatus),
    summarySourceType: nullableString(paper.summarySourceType),
    summaryConfidence: nullableString(paper.summaryConfidence),
  };
}

function clientId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPaperSearchHandoff(input: {
  query: string;
  queries?: string[];
  papers: PaperSearchHandoffPaper[];
  createdAt?: string;
  workflowId?: string;
  runId?: string;
}): PaperSearchHandoff {
  const query = input.query.trim();
  return {
    version: 1,
    workflowId: input.workflowId ?? clientId("paper-search"),
    runId: input.runId ?? clientId("paper-run"),
    query,
    queries: uniqueStrings([query, ...(input.queries ?? [])]),
    papers: input.papers
      .map((paper, index) => normalizePaper(paper, index))
      .filter((paper): paper is PaperSearchHandoffPaper => Boolean(paper)),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function parsePaperSearchHandoff(
  raw: string | null,
): PaperSearchHandoff | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.version !== 1) return null;
    const query = nullableString(parsed.query);
    const workflowId = nullableString(parsed.workflowId);
    const runId = nullableString(parsed.runId);
    const createdAt = nullableString(parsed.createdAt);
    if (!query || !workflowId || !runId || !createdAt) return null;
    const papers = Array.isArray(parsed.papers)
      ? parsed.papers
          .map((paper, index) => normalizePaper(paper, index))
          .filter((paper): paper is PaperSearchHandoffPaper => Boolean(paper))
      : [];
    if (papers.length === 0) return null;
    return {
      version: 1,
      workflowId,
      runId,
      query,
      queries: uniqueStrings([query, ...uniqueStrings(parsed.queries)]),
      papers,
      createdAt,
    };
  } catch {
    return null;
  }
}

export function savePaperSearchHandoff(
  input: Parameters<typeof createPaperSearchHandoff>[0],
  storage: HandoffStorage = window.sessionStorage,
): PaperSearchHandoff {
  const handoff = createPaperSearchHandoff(input);
  storage.setItem(PAPER_SEARCH_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
  return handoff;
}

export function loadPaperSearchHandoff(
  storage: HandoffStorage = window.sessionStorage,
): PaperSearchHandoff | null {
  return parsePaperSearchHandoff(
    storage.getItem(PAPER_SEARCH_HANDOFF_STORAGE_KEY),
  );
}

function paperSearchSourceReviewStorageKey(
  context: PaperSearchSourceReviewContext,
): string {
  return [
    PAPER_SEARCH_SOURCE_REVIEW_STORAGE_PREFIX,
    encodeURIComponent(context.workflowId),
    encodeURIComponent(context.topicHash),
    encodeURIComponent(context.runId),
  ].join(":");
}

function decisionKeys(source: SourceRecord): string[] {
  return Array.from(
    new Set(
      [source.id, source.dedupeKey, sourceRecordKey(source)]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function parsePaperSearchSourceReviews(
  raw: string | null,
  context: PaperSearchSourceReviewContext,
): StoredPaperSearchSourceReviews | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      parsed.version !== 1 ||
      parsed.workflowId !== context.workflowId ||
      parsed.topicHash !== context.topicHash ||
      parsed.runId !== context.runId ||
      !Array.isArray(parsed.decisions)
    ) {
      return null;
    }
    const decisions = parsed.decisions
      .map((value): StoredPaperSearchSourceDecision | null => {
        if (!value || typeof value !== "object") return null;
        const decision = value as Record<string, unknown>;
        if (
          decision.reviewState !== "accepted" &&
          decision.reviewState !== "pending" &&
          decision.reviewState !== "rejected"
        ) {
          return null;
        }
        const keys = uniqueStrings(decision.keys);
        if (keys.length === 0) return null;
        return {
          keys,
          reviewState: decision.reviewState,
          acceptedByUser:
            typeof decision.acceptedByUser === "boolean"
              ? decision.acceptedByUser
              : null,
          userDecision: nullableString(decision.userDecision),
          acceptedAs: nullableString(decision.acceptedAs),
          needsReview:
            typeof decision.needsReview === "boolean"
              ? decision.needsReview
              : null,
        };
      })
      .filter((decision): decision is StoredPaperSearchSourceDecision =>
        Boolean(decision),
      );
    return {
      version: 1,
      workflowId: context.workflowId,
      topicHash: context.topicHash,
      runId: context.runId,
      decisions,
      updatedAt: nullableString(parsed.updatedAt) ?? new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Persist only source-review decisions. Search metadata continues to come from
 * the handoff payload, while the workflow/topic/run tuple prevents a decision
 * from leaking into a different search run for the same paper.
 */
export function savePaperSearchSourceReviews(
  context: PaperSearchSourceReviewContext,
  sources: SourceRecord[],
  storage: HandoffStorage = window.localStorage,
): void {
  const snapshot: StoredPaperSearchSourceReviews = {
    version: 1,
    workflowId: context.workflowId,
    topicHash: context.topicHash,
    runId: context.runId,
    decisions: sources.map((source) => ({
      keys: decisionKeys(source),
      reviewState: sourceReviewState(source),
      acceptedByUser:
        typeof source.acceptedByUser === "boolean"
          ? source.acceptedByUser
          : null,
      userDecision: source.userDecision?.trim() || null,
      acceptedAs: source.acceptedAs?.trim() || null,
      needsReview:
        typeof source.needsReview === "boolean" ? source.needsReview : null,
    })),
    updatedAt: new Date().toISOString(),
  };
  storage.setItem(
    paperSearchSourceReviewStorageKey(context),
    JSON.stringify(snapshot),
  );
}

/** Restore reviewed aliases onto freshly reconstructed handoff sources. */
export function restorePaperSearchSourceReviews(
  context: PaperSearchSourceReviewContext,
  sources: SourceRecord[],
  storage: HandoffStorage = window.localStorage,
): SourceRecord[] {
  const snapshot = parsePaperSearchSourceReviews(
    storage.getItem(paperSearchSourceReviewStorageKey(context)),
    context,
  );
  if (!snapshot) return sources;

  const decisionsByKey = new Map<string, StoredPaperSearchSourceDecision>();
  for (const decision of snapshot.decisions) {
    for (const key of decision.keys) decisionsByKey.set(key, decision);
  }

  return sources.map((source) => {
    const decision = decisionKeys(source)
      .map((key) => decisionsByKey.get(key))
      .find((value): value is StoredPaperSearchSourceDecision =>
        Boolean(value),
      );
    if (!decision) return source;
    return normalizeSourceForReview({
      ...source,
      reviewState: decision.reviewState,
      acceptedByUser: decision.acceptedByUser,
      userDecision: decision.userDecision,
      acceptedAs: decision.acceptedAs,
      needsReview: decision.needsReview,
    });
  });
}

function sourceTypeForProvider(
  provider: string | null,
): SourceRecord["sourceType"] {
  if (provider === "OpenAlex") return "OpenAlex";
  if (provider === "Semantic Scholar") return "Semantic Scholar";
  return "Crossref";
}

function summaryConfidence(value: string | null): "high" | "medium" | "low" {
  if (value === "high" || value === "low") return value;
  return "medium";
}

const GENERIC_QUERY_BRIDGE_TERMS = new Set([
  "analysis",
  "association",
  "effect",
  "effects",
  "evaluation",
  "evidence",
  "quality",
  "relation",
  "relationship",
  "research",
  "review",
  "study",
]);

const DOMAIN_SHORT_QUERY_BRIDGE_TERMS = new Set([
  "gis",
  "gut",
  "llm",
  "rag",
  "uhi",
]);

function latinQueryBridgeTerms(value: string): string[] {
  return Array.from(
    new Set(
      value
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/gu, " ")
        .split(/\s+/u)
        .filter(
          (term) =>
            (term.length >= 4 || DOMAIN_SHORT_QUERY_BRIDGE_TERMS.has(term)) &&
            !GENERIC_QUERY_BRIDGE_TERMS.has(term),
        ),
    ),
  );
}

/**
 * Preserve the actual bilingual search bridge for each paper. An alternate
 * query is only selected when at least two non-generic query concepts occur
 * in the paper title/abstract; otherwise the original user topic is retained.
 */
function traceableQueryUsed(
  handoff: PaperSearchHandoff,
  paper: PaperSearchHandoffPaper,
): string {
  const evidenceText = `${paper.title} ${paper.abstract ?? ""}`
    .normalize("NFKC")
    .toLocaleLowerCase();
  const candidates = handoff.queries
    .map((query, order) => {
      const matchedTerms = latinQueryBridgeTerms(query).filter((term) =>
        evidenceText.includes(term),
      );
      return { query, order, matchedTerms };
    })
    .filter((candidate) => candidate.matchedTerms.length >= 2)
    .sort(
      (left, right) =>
        right.matchedTerms.length - left.matchedTerms.length ||
        left.order - right.order,
    );
  return candidates[0]?.query ?? handoff.query;
}

export function paperSearchHandoffToSources(
  handoff: PaperSearchHandoff,
  context: { topicHash: string; queryPlanHash: string },
): SourceRecord[] {
  return handoff.papers.map((paper, index) => {
    const hasAbstract = Boolean(paper.abstract?.trim());
    const sourceId = paper.id || `paper-search-${index + 1}`;
    return normalizeSourceForReview({
      id: sourceId,
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      abstract: paper.abstract,
      snippet: paper.abstract,
      originalSnippet: paper.abstract,
      language: null,
      abstractMissing: !hasAbstract,
      doi: paper.doi,
      url: paper.url,
      sourceType: sourceTypeForProvider(paper.provider),
      reviewState: "accepted",
      publisher: null,
      containerTitle: paper.venue,
      accessedAt: handoff.createdAt,
      provider: paper.provider,
      queryUsed: traceableQueryUsed(handoff, paper),
      retrievedAt: handoff.createdAt,
      dedupeKey: paper.doi ?? paper.url ?? `${paper.title}:${paper.year ?? ""}`,
      sourceKind: "journal",
      citationCount: paper.citationCount,
      isOpenAccess: paper.isOpenAccess,
      accessLevel: hasAbstract ? "abstract_only" : "metadata_only",
      extractionStatus: hasAbstract ? "partial" : "metadata_only",
      extractionMethod: hasAbstract ? "abstract_only" : "metadata_only",
      extractionMode: hasAbstract ? "abstract" : "metadata_only",
      canUseForClaims: hasAbstract,
      canUseForReport: true,
      sourceUseLevel: hasAbstract
        ? "citable_abstract"
        : "metadata_context_only",
      isPeerReviewed: true,
      sourceQualityScore: paper.doi ? 85 : 72,
      scoreReasons: [
        "已由前置論文搜尋器取得",
        paper.doi ? "具 DOI" : "具原始來源連結",
      ],
      relevanceLevel: "primary",
      evidenceGrounding: hasAbstract ? "abstract_grounded" : "metadata_only",
      shouldShowInMainList: true,
      shouldRecommendAccept: true,
      readableSummaryZhTW: paper.summary,
      readableSummaryZhTw: paper.summary,
      llmSummaryZhTw: paper.summary,
      llmSummaryStatus:
        paper.summaryStatus === "success"
          ? "success"
          : paper.summaryStatus === "pending"
            ? "skipped"
            : paper.summaryStatus === "fallback" ||
                paper.summaryStatus === "unavailable"
              ? "fallback"
              : null,
      summaryStatus:
        paper.summaryStatus === "success"
          ? "success"
          : paper.summaryStatus === "pending"
            ? "skipped"
            : paper.summaryStatus === "fallback" ||
                paper.summaryStatus === "unavailable"
              ? "fallback"
              : null,
      summarySourceType:
        paper.summarySourceType === "abstract" ||
        paper.summarySourceType === "snippet" ||
        paper.summarySourceType === "fulltext" ||
        paper.summarySourceType === "metadataFallback"
          ? paper.summarySourceType
          : hasAbstract
            ? "abstract"
            : "metadataFallback",
      summaryConfidence: summaryConfidence(paper.summaryConfidence),
      originalAbstract: paper.abstract,
      abstractOriginal: paper.abstract,
      sourceCategory: "academic_paper",
      usableSections: defaultUsableSections(),
      confidence: paper.doi ? "高" : "中",
      workflowId: handoff.workflowId,
      topic: handoff.query,
      normalizedTopic: handoff.query,
      topicHash: context.topicHash,
      queryPlanHash: context.queryPlanHash,
      classification: "primary",
      isMetadataOnly: !hasAbstract,
      isPrimaryEvidence: hasAbstract,
      recommendationBucket: "scholarly_recommended",
      sourceRole: "core_scholarly_evidence",
      retrievalMode: "live_provider",
      acceptedByUser: true,
      userDecision: "accepted",
      acceptedAs: "source",
      needsReview: false,
    });
  });
}
