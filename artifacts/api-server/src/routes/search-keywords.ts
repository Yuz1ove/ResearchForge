import { Router, type IRouter } from "express";
import {
  SearchKeywordsBody,
  SearchKeywordsResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import {
  searchKeywordSources,
  type KeywordExpansionRequest,
  type KeywordSourceSearchResult,
} from "../services/keyword-expansion";

export type SearchKeywordsHandler = (input: KeywordExpansionRequest) => Promise<KeywordSourceSearchResult>;

export function normalizeSearchKeywordsRequest(body: unknown): KeywordExpansionRequest | null {
  const parsed = SearchKeywordsBody.safeParse(body);
  if (!parsed.success) return null;

  const topic = parsed.data.topic.trim();
  if (!topic) return null;

  return {
    ...parsed.data,
    topic,
  };
}

export function createSearchKeywordsRouter(searchKeywordsHandler: SearchKeywordsHandler = searchKeywordSources): IRouter {
  const router: IRouter = Router();

  router.post("/search-keywords", async (req, res) => {
    const normalized = normalizeSearchKeywordsRequest(req.body);
    if (!normalized) {
      res.status(400).json({ message: "請輸入有效的研究主題。" });
      return;
    }

    try {
      const result = await searchKeywordsHandler(normalized);
      res.json(SearchKeywordsResponse.parse(result));
    } catch (error) {
      logger.warn({ err: error }, "Keyword source search failed unexpectedly");
      res.status(502).json({ message: "關鍵詞與來源搜尋服務暫時無法使用，請稍後再試。" });
    }
  });

  return router;
}

export default createSearchKeywordsRouter();
