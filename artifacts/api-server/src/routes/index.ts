import { Router, type IRouter } from "express";
import healthRouter from "./health";
import searchKeywordsRouter from "./search-keywords";
import searchSourcesRouter from "./search-sources";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchKeywordsRouter);
router.use(searchSourcesRouter);

export default router;
