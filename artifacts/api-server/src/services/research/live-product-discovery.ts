import { createHash } from "node:crypto";
import type {
  ResearchProductWorkflowSnapshotV1,
  SearchQueryV1,
  SourceCandidateInput,
  WorkflowEvidenceCardInput,
} from "@workspace/api-zod/research-product-workflow";
import type { SourceRecord } from "@workspace/api-zod";
import type { SearchIntentSourceSearchResult } from "../search-intent-planner";
import {
  ProductWorkflowError,
  registerEvidenceCards,
  registerSourceCandidates,
} from "./product-workflow";

const LIVE_DISCOVERY_ADAPTER_VERSION = "researchforge.live-discovery.r24.v1";

function stableId(prefix: string, ...parts: string[]): string {
  const digest = createHash("sha256")
    .update(parts.join("\u001f"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function normalizedScore(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const numeric = value! > 1 ? value! / 100 : value!;
  return Math.max(0, Math.min(1, numeric));
}

function publicationType(source: SourceRecord): string {
  if (source.sourceKind) return source.sourceKind;
  if (source.containerTitle) return "journal";
  return source.sourceType;
}

function providerId(source: SourceRecord): string | null {
  const direct = Object.values(source.providerIds ?? {}).find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return direct ?? source.id ?? null;
}

function sourceCandidate(
  source: SourceRecord,
  queryId: string,
): SourceCandidateInput {
  const provider = source.provider?.trim() || source.sourceType;
  const retrievedAt = source.retrievedAt?.trim() || "retrieval-time-unavailable";
  return {
    id: stableId("candidate", provider, source.id, source.queryUsed ?? ""),
    queryIds: [queryId],
    provider,
    providerId: providerId(source),
    providerRawRef: [
      "live-search-record",
      provider,
      source.id,
      source.queryUsed ?? "query-unavailable",
      retrievedAt,
    ].join(":"),
    title: source.title,
    authors: source.authors,
    year: source.year,
    venue: source.containerTitle ?? null,
    doi: source.doi,
    url: source.url,
    abstract: source.abstract,
    language: source.language ?? null,
    keywords: [...new Set([
      ...(source.matchedCoreConcepts ?? []),
      ...(source.matchedResearchFacets ?? []),
    ])].slice(0, 16),
    sourceType: publicationType(source),
    publisher: source.publisher,
    citationCount: source.citationCount ?? null,
    openAccess: source.isOpenAccess ?? null,
    license: null,
    relevance: normalizedScore(
      source.relevanceScore ?? source.topicRelevance ?? source.finalScore,
      0.7,
    ),
    authority: normalizedScore(
      source.authorityScore ?? source.sourceQualityScore ?? source.sourceTrust,
      0.7,
    ),
  };
}

function firstSupportedSentence(abstract: string): string {
  const normalized = abstract.replace(/^\s*abstract\s*/iu, "").replace(/\s+/gu, " ").trim();
  const bounded = normalized.slice(0, 600);
  const sentence = bounded.match(/^.*?[.!?。！？](?:\s|$)/u)?.[0]?.trim();
  return sentence || bounded;
}

function liveQueries(
  snapshot: ResearchProductWorkflowSnapshotV1,
  result: SearchIntentSourceSearchResult,
  now: string,
): SearchQueryV1[] {
  const activeQuestions = snapshot.questions.filter((question) => question.status === "active");
  const fallbackQuestion = activeQuestions[0] ?? snapshot.questions[0];
  if (!fallbackQuestion) {
    throw new ProductWorkflowError(
      "INVALID_TRANSITION",
      "LIVE discovery requires at least one research question.",
      409,
    );
  }
  const sourceQueries = result.sources
    .map((source) => source.queryUsed?.trim())
    .filter((query): query is string => Boolean(query));
  const successfulQueries = result.provider_status
    .filter((group) => group.ok && group.results.length > 0)
    .map((group) => group.query.trim())
    .filter(Boolean);
  const boundedQueries = [...new Set([...sourceQueries, ...successfulQueries])].slice(
    0,
    snapshot.diagnostics.queryBudget,
  );
  return boundedQueries.map((query, index) => {
    const question = activeQuestions[index % activeQuestions.length] ?? fallbackQuestion;
    return {
      id: stableId("query", snapshot.project.id, query),
      projectId: snapshot.project.id,
      researchQuestionId: question.id,
      query,
      origin: index === 0 ? "exact_keyword" : "narrower_subtopic",
      language: /[\u3400-\u9fff]/u.test(query) ? "zh-TW" : "en",
      providerTarget: "all",
      priority: Math.max(50, 100 - index * 3),
      status: "completed",
      createdAt: now,
      updatedAt: now,
      provenance: {
        mode: "LIVE",
        producer: "live-search-query-adapter",
        producerVersion: LIVE_DISCOVERY_ADAPTER_VERSION,
        parentRefs: [result.workflowId, result.queryPlanHash],
        generatedAt: now,
      },
    };
  });
}

function evidenceCards(
  snapshot: ResearchProductWorkflowSnapshotV1,
): WorkflowEvidenceCardInput[] {
  const activeQuestions = snapshot.questions.filter((question) => question.status === "active");
  if (activeQuestions.length === 0) return [];
  return snapshot.sources.flatMap((source, index) => {
    const document = snapshot.documents.find((item) => item.sourceId === source.id);
    const block = snapshot.parsedBlocks.find((item) => item.documentId === document?.id);
    if (
      !document ||
      !block ||
      !source.abstract ||
      source.admissionStatus !== "ACCEPTED"
    ) {
      return [];
    }
    const question = activeQuestions[index % activeQuestions.length]!;
    return [{
      id: stableId("evidence", snapshot.project.id, source.id, block.id),
      sourceId: source.id,
      documentId: document.id,
      blockId: block.id,
      claimText: firstSupportedSentence(source.abstract),
      evidenceText: block.text,
      evidenceType: "FINDING" as const,
      researchQuestionIds: [question.id],
      sectionHints: [],
      page: block.page,
      sourceStartOffset: block.startOffset,
      sourceEndOffset: block.endOffset,
      confidence: Math.max(0.5, Math.min(0.95, source.quality.relevance)),
      qualityNotes: [
        "live_provider_metadata",
        "traceable_provider_abstract",
        `source_integrity:${source.quality.sourceIntegrity}`,
      ],
      limitations: [
        "This evidence is limited to the provider-supplied abstract; full text was not acquired or reviewed.",
      ],
      createdBy: "rule" as const,
      extractorVersion: LIVE_DISCOVERY_ADAPTER_VERSION,
    }];
  });
}

export function materializeLiveSourceDiscovery(
  snapshot: ResearchProductWorkflowSnapshotV1,
  result: SearchIntentSourceSearchResult,
): ResearchProductWorkflowSnapshotV1 {
  if (snapshot.project.mode !== "LIVE") {
    throw new ProductWorkflowError(
      "INVALID_TRANSITION",
      "Live source discovery is only permitted for a LIVE project.",
      409,
    );
  }
  const now = new Date().toISOString();
  const queries = liveQueries(snapshot, result, now);
  const fallbackQueryId = queries[0]?.id ?? snapshot.queries[0]?.id;
  if (!fallbackQueryId) {
    throw new ProductWorkflowError(
      "INVALID_TRANSITION",
      "LIVE discovery did not produce an auditable query identity.",
      409,
    );
  }
  const queryIdByText = new Map(queries.map((query) => [query.query, query.id]));
  const candidates = result.sources.map((source) =>
    sourceCandidate(
      source,
      queryIdByText.get(source.queryUsed?.trim() ?? "") ?? fallbackQueryId,
    ),
  );
  const providerFailures = result.provider_status
    .filter((group) => !group.ok)
    .map(
      (group) =>
        `${group.provider}:${group.error_type ?? "provider_error"}:${group.query}`,
    );
  const prepared: ResearchProductWorkflowSnapshotV1 = {
    ...snapshot,
    queries: queries.length > 0 ? queries : snapshot.queries,
    diagnostics: {
      ...snapshot.diagnostics,
      warnings: [...new Set([
        ...snapshot.diagnostics.warnings,
        ...result.warnings.map((warning) => `live_search:${warning}`),
        `live_search:retrieved=${result.diagnostics.retrieved_count}`,
        `live_search:deduped=${result.diagnostics.deduped_count}`,
        `live_search:displayed=${result.diagnostics.displayed_count}`,
      ])],
    },
  };
  const withSources = registerSourceCandidates(prepared, candidates, {
    providerFailures,
  });
  const cards = evidenceCards(withSources);
  return cards.length > 0
    ? registerEvidenceCards(withSources, cards)
    : withSources;
}
