import { Router, type IRouter } from "express";
import healthRouter from "./health";
import generateReportRouter from "./generate-report";
import reportDraftsRouter from "./report-drafts";
import searchKeywordsRouter from "./search-keywords";
import searchSourcesRouter from "./search-sources";
import expandTopicRouter from "./expand-topic";
import topicUnderstandingRouter from "./topic-understanding";
import researchToolsRouter from "./research-tools";
import researchRouter from "./research";
import researchGroundingJobsRouter from "./research-grounding-jobs";
import llmRouter from "./llm";

const router: IRouter = Router();

router.use(healthRouter);
router.use(generateReportRouter);
router.use(reportDraftsRouter);
router.use(searchKeywordsRouter);
router.use(searchSourcesRouter);
router.use(expandTopicRouter);
router.use(topicUnderstandingRouter);
router.use(researchToolsRouter);
router.use(researchRouter);
router.use(researchGroundingJobsRouter);
router.use(llmRouter);

export default router;
