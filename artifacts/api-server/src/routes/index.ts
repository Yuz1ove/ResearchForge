import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generateReportRouter from "./generate-report";
import searchKeywordsRouter from "./search-keywords";
import searchSourcesRouter from "./search-sources";
import expandTopicRouter from "./expand-topic";
import topicUnderstandingRouter from "./topic-understanding";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateReportRouter);
router.use(searchKeywordsRouter);
router.use(searchSourcesRouter);
router.use(expandTopicRouter);
router.use(topicUnderstandingRouter);

export default router;
