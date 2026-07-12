import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
const isNodeTest = Boolean(process.env.NODE_TEST_CONTEXT);

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "apiKey",
    "*.apiKey",
    "authorization",
    "*.authorization",
    "headers.Authorization",
    "*.headers.Authorization",
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "SCHOOL_LLM_API_KEY",
    "*.SCHOOL_LLM_API_KEY",
  ],
  ...(isProduction || isNodeTest
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
