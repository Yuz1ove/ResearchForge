import { Router, type IRouter } from "express";
import healthRouter from "./health";
import searchSourcesRouter from "./search-sources";

const router: IRouter = Router();

router.use(healthRouter);
router.use(searchSourcesRouter);

export default router;
