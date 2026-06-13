import { Router, type IRouter } from "express";
import generateReportRouter from "./generate-report";
import healthRouter from "./health";
import searchSourcesRouter from "./search-sources";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchSourcesRouter);
router.use(generateReportRouter);

export default router;
