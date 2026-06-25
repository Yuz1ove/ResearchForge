import { Router, type IRouter } from "express";
import {
  SearchSourcesBody,
  SearchSourcesResponse,
  type SourceRecord,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { searchSources, SourceSearchError } from "../services/source-retrieval";
import {
  searchIntentSources,
  type SearchIntentPlannerInput,
  type SearchIntentSourceSearchResult,
} from "../services/search-intent-planner";

const INVALID_SEARCH_MESSAGE = "請輸入有效的查詢關鍵字。";

export type SearchSourcesHandler = (query: string) => Promise<SourceRecord[]>;
export type TopicSearchSourcesHandler = (input: SearchIntentPlannerInput) => Promise<SearchIntentSourceSearchResult>;

export type NormalizedSearchSourcesRequest =
  | { kind: "query"; query: string }
  | { kind: "topic"; input: SearchIntentPlannerInput };

export interface SearchSourcesRouterOptions {
  querySearchHandler?: SearchSourcesHandler;
  topicSearchHandler?: TopicSearchSourcesHandler;
}

function shortErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return "unknown search-sources error";
}

function extractString(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeSearchSourcesRequest(body: unknown): NormalizedSearchSourcesRequest | null {
  const parsed = SearchSourcesBody.safeParse(body);
  if (!parsed.success) return null;

  const originalTopic =
    extractString(body, "originalTopic") ??
    extractString(body, "topic") ??
    extractString(parsed.data, "topic");
  const activeResearchTopic =
    extractString(body, "activeResearchTopic") ??
    extractString(body, "selectedExpansionTopic") ??
    extractString(body, "searchTopic");
  const refinedTopic =
    extractString(body, "refinedTopic") ??
    extractString(body, "expandedTopic") ??
    extractString(body, "refined_topic");
  const selectedTopic = activeResearchTopic ?? refinedTopic ?? originalTopic;

  if (originalTopic || refinedTopic || activeResearchTopic) {
    return {
      kind: "topic",
      input: {
        topic: selectedTopic ?? "",
        originalTopic: originalTopic ?? selectedTopic ?? "",
        ...(selectedTopic && selectedTopic !== (originalTopic ?? "")
          ? { refinedTopic: selectedTopic }
          : refinedTopic
            ? { refinedTopic }
            : {}),
        reportType: extractString(parsed.data, "reportType"),
        audience: extractString(parsed.data, "audience"),
        language: extractString(parsed.data, "language"),
        sourceMode: extractString(parsed.data, "sourceMode"),
      },
    };
  }

  const query = extractString(parsed.data, "query") ?? extractString(body, "query");
  if (query) return { kind: "query", query };

  return null;
}

export function createSearchSourcesRouter({
  querySearchHandler = searchSources,
  topicSearchHandler = searchIntentSources,
}: SearchSourcesRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/search-sources", async (req, res) => {
    const normalized = normalizeSearchSourcesRequest(req.body);
    if (!normalized) {
      res.status(400).json({ message: INVALID_SEARCH_MESSAGE });
      return;
    }

    try {
      if (normalized.kind === "topic") {
        const result = await topicSearchHandler(normalized.input);
        res.json({
          ...result,
          ok: true,
          provider_status: result.provider_status ?? [],
          groups: result.groups ?? result.provider_status ?? [],
          warnings: result.warnings ?? [],
        });
        return;
      }

      const sources = await querySearchHandler(normalized.query);
      res.json(SearchSourcesResponse.parse({ sources }));
    } catch (error) {
      const message = shortErrorMessage(error);
      logger.warn(
        {
          err: error,
          route: "/api/search-sources",
          kind: normalized.kind,
          topic:
            normalized.kind === "topic"
              ? normalized.input.originalTopic ?? normalized.input.topic
              : undefined,
          refinedTopic:
            normalized.kind === "topic" ? normalized.input.refinedTopic : undefined,
          query: normalized.kind === "query" ? normalized.query : undefined,
        },
        "Source search failed",
      );

      const emptyTopic =
        normalized.kind === "topic"
          ? normalized.input.originalTopic ?? normalized.input.topic
          : normalized.kind === "query"
            ? normalized.query
            : "";
      res.status(200).json({
        ok: true,
        topic: emptyTopic,
        workflowId: "",
        topicHash: "",
        queryPlanHash: "",
        searchIntent: {
          primaryConcepts: [],
          contextConcepts: [],
          outcomeConcepts: [],
          populationConcepts: [],
          lowWeightTerms: [],
          mustHaveTerms: [],
          plannerStatus: "failed",
          fallbackUsed: true,
        },
        queries: {
          coreConcepts: [],
          chinese: [emptyTopic].filter(Boolean),
          english: [],
          highPrecision: [emptyTopic].filter(Boolean),
          broad: [emptyTopic].filter(Boolean),
          coreEnglishAcademic: [],
          academicSynonyms: [],
          education: [],
          chineseSupplemental: [emptyTopic].filter(Boolean),
          fallbackRelaxed: [emptyTopic].filter(Boolean),
          phases: [],
        },
        results: [],
        sources: [],
        provider_status: [],
        warnings: ["來源搜尋暫時無法使用，已回傳空結果。"],
        planner: {
          normalizedTopic: emptyTopic,
          primaryConcepts: [],
          contextConcepts: [],
          outcomeConcepts: [],
          populationConcepts: [],
          lowWeightTerms: [],
          mustHaveTerms: [],
          shouldHaveTerms: [],
          penaltyTerms: [],
          negativeTerms: [],
          chineseQueries: [emptyTopic].filter(Boolean),
          englishQueries: [],
          reasoningNotes: [message],
          plannerStatus: "failed",
          fallbackUsed: true,
        },
        searchTrace: {
          workflowId: "",
          topic: emptyTopic,
          originalTopic: emptyTopic,
          activeResearchTopic: emptyTopic,
          canonicalEnglishTopic: "",
          normalizedTopic: emptyTopic,
          topicHash: "",
          queryPlanHash: "",
          providerQueries: [],
          candidateCount: 0,
          dedupedCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          sourceDecisions: [],
        },
        diagnostics: {
          original_topic: emptyTopic,
          active_research_topic: emptyTopic,
          canonical_english_topic: "",
          core_concepts: [],
          english_queries: [],
          chinese_queries: [emptyTopic].filter(Boolean),
          fallback_relaxed_queries: [emptyTopic].filter(Boolean),
          provider_search_results_count: 0,
          filtered_results_count: 0,
          rejection_reasons: {},
          retrieved_count: 0,
          deduped_count: 0,
          rejected_count: 0,
          candidate_count: 0,
          displayed_count: 0,
          primary_candidate_count: 0,
          provider_status: [],
          warnings: ["來源搜尋暫時無法使用，已回傳空結果。"],
        },
        llm_status: "failed",
        keyword_expansion: {
          normalized_topic: emptyTopic,
          domains: [],
          search_queries: [emptyTopic].filter(Boolean),
          english_queries: [],
          chinese_queries: [emptyTopic].filter(Boolean),
          core_concepts: [],
          core_english_queries: [],
          academic_synonym_queries: [],
          education_queries: [],
          fallback_relaxed_queries: [emptyTopic].filter(Boolean),
          preferred_source_types: [],
          avoid_source_types: [],
          reasoning_notes: [message],
          fallback_used: true,
          llm_status: "failed",
        },
        groups: [],
        debug: {
          statusCode: 200,
          message,
          topic: emptyTopic,
        },
      });
    }
  });

  return router;
}

export default createSearchSourcesRouter();
