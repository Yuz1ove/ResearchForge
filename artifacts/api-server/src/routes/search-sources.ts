import { Router, type IRouter } from "express";
import {
  SearchSourcesBody,
  SearchSourcesResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { searchSources, SourceSearchError } from "../services/source-retrieval";

const router: IRouter = Router();

router.post("/search-sources", async (req, res) => {
  const parsed = SearchSourcesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "請輸入有效的查詢關鍵字。" });
    return;
  }

  const query = parsed.data.query.trim();
  if (!query) {
    res.status(400).json({ message: "請輸入有效的查詢關鍵字。" });
    return;
  }

  try {
    const sources = await searchSources(query);
    const data = SearchSourcesResponse.parse({ sources });
    res.json(data);
  } catch (error) {
    if (error instanceof SourceSearchError && error.code === "timeout") {
      logger.warn({ err: error }, "Source search timed out");
      res.status(504).json({ message: "來源搜尋逾時，請稍後再試。" });
      return;
    }

    logger.warn({ err: error }, "Source search failed");
    res.status(502).json({ message: "來源搜尋服務暫時無法使用，請稍後再試。" });
  }
});

export default router;
