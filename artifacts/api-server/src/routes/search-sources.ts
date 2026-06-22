import { Router, type IRouter } from "express";
import {
  SearchSourcesBody,
  SearchSourcesResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  searchSources,
  SourceSearchError,
  type SourceSearchResultWithDiagnostics,
} from "../services/source-retrieval";
import {
  searchIntentSources,
  type SearchIntentPlannerInput,
  type SearchIntentSourceSearchResult,
} from "../services/search-intent-planner";

const INVALID_SEARCH_MESSAGE = "請輸入有效的查詢關鍵字。";

export type SearchSourcesHandler = (query: string) => Promise<SourceSearchResultWithDiagnostics>;
export type TopicSearchSourcesHandler = (input: SearchIntentPlannerInput) => Promise<SearchIntentSourceSearchResult>;

export type NormalizedSearchSourcesRequest =
  | { kind: "query"; query: string }
  | { kind: "topic"; input: SearchIntentPlannerInput };

export interface SearchSourcesRouterOptions {
  querySearchHandler?: SearchSourcesHandler;
  topicSearchHandler?: TopicSearchSourcesHandler;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeSearchSourcesRequest(body: unknown): NormalizedSearchSourcesRequest | null {
  const parsed = SearchSourcesBody.safeParse(body);
  if (!parsed.success) return null;

  const topic = cleanString(parsed.data.topic);
  if (topic) {
    return {
      kind: "topic",
      input: {
        topic,
        reportType: cleanString(parsed.data.reportType),
        audience: cleanString(parsed.data.audience),
        language: cleanString(parsed.data.language),
        sourceMode: cleanString(parsed.data.sourceMode),
      },
    };
  }

  const query = cleanString(parsed.data.query);
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
        res.json(SearchSourcesResponse.parse(result));
        return;
      }

      const queryResult = await querySearchHandler(normalized.query);
      res.json(SearchSourcesResponse.parse(queryResult));
    } catch (error) {
      if (error instanceof SourceSearchError && error.code === "timeout") {
        logger.warn({ err: error }, "Source search timed out");
        res.status(200).json({
          sources: [],
          warnings: ["來源搜尋逾時，請稍後再試。"],
          diagnostics: {
            resultCount: 0,
            resultTarget: 20,
            minSources: 10,
            targetSources: 20,
            queryCount: 0,
            providerCount: 0,
            fallbackUsed: false,
            status: "failed",
            providerFailures: [
              {
                provider: "Crossref",
                query: "",
                stage: "academic",
                error_type: "timeout",
                error_message: "來源搜尋逾時，請稍後再試。",
              },
            ],
            providerResultCounts: [],
            warnings: ["來源搜尋逾時，請稍後再試。"],
          },
        } as unknown as Parameters<typeof SearchSourcesResponse.parse>[0]);
        return;
      }

      logger.warn({ err: error }, "Source search failed");
        res.status(200).json({
          sources: [],
          warnings: ["外部來源服務暫時無法使用，請稍後再試。"],
          diagnostics: {
            resultCount: 0,
            resultTarget: 20,
            minSources: 10,
            targetSources: 20,
            queryCount: 0,
            providerCount: 0,
            fallbackUsed: false,
            status: "failed",
            providerFailures: [
              {
                provider: "Crossref",
                query: "",
                stage: "academic",
                error_type: "api-failure",
                error_message: "外部來源服務暫時無法使用，請稍後再試。",
              },
            ],
          providerResultCounts: [],
          warnings: ["外部來源服務暫時無法使用，請稍後再試。"],
        },
      } as unknown as Parameters<typeof SearchSourcesResponse.parse>[0]);
    }
  });

  return router;
}

export default createSearchSourcesRouter();
