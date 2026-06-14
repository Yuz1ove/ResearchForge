import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];
const host = process.env["HOST"]?.trim();

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = host
  ? app.listen(port, host, onListen)
  : app.listen(port, onListen);

function onListen(err?: Error) {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host: host || "default" }, "Server listening");
}

void server;
