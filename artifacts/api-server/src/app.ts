import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { isAllowedResearchForgeOrigin } from "./config/cors";
import {
  RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION,
  type ResearchForgeDeploymentIdentity,
} from "@workspace/api-zod/deployment-contract";

const app: Express = express();

function deploymentIdentity(): ResearchForgeDeploymentIdentity {
  return {
    service: "ResearchForge API",
    status: "ok",
    contractVersion: RESEARCHFORGE_DEPLOYMENT_CONTRACT_VERSION,
    commitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.RESEARCHFORGE_GIT_SHA ??
      "development",
    gitRef:
      process.env.VERCEL_GIT_COMMIT_REF ??
      process.env.RESEARCHFORGE_GIT_REF ??
      "development",
    dirty: process.env.RESEARCHFORGE_GIT_DIRTY === "true",
  };
}

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
  res.json(deploymentIdentity());
});

app.get("/api/deployment", (_req, res) => {
  res.json(deploymentIdentity());
});

app.use("/api", router);

app.use((_req, res) => {
  res.status(404).json({
    code: "NOT_FOUND",
    message: "API route not found.",
  });
});

export default app;
