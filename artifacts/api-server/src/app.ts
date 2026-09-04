import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { isAllowedResearchForgeOrigin } from "./config/cors";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: false,
    origin(origin, callback) {
      callback(null, Boolean(origin && isAllowedResearchForgeOrigin(origin)));
    },
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "ResearchForge API",
    status: "ok",
  });
});

app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: "API route not found.",
  });
});

export default app;
