import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import app from "./app";

const FORBIDDEN_RESPONSE_SIGNATURES = [
  "import { createRequire",
  "node:module",
  "node:path",
  "globalThis.require",
  "__commonJS",
  "node_modules/.pnpm",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "JWT_SECRET",
  "sk-",
  "postgres://",
  "postgresql://",
] as const;

test("API root, health, CORS, and 404 responses do not expose server source", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");

  t.after(() => {
    server.close();
    server.closeAllConnections?.();
    server.unref();
  });

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const closeConnection = { Connection: "close" };

  const rootResponse = await fetch(`${baseUrl}/`, { headers: closeConnection });
  assert.equal(rootResponse.status, 200);
  assert.match(
    rootResponse.headers.get("content-type") ?? "",
    /^application\/json\b/,
  );
  const rootBody = await rootResponse.text();
  assert.deepEqual(JSON.parse(rootBody), {
    service: "ResearchForge API",
    status: "ok",
  });

  const healthResponse = await fetch(`${baseUrl}/api/healthz`, { headers: closeConnection });
  assert.equal(healthResponse.status, 200);
  assert.match(
    healthResponse.headers.get("content-type") ?? "",
    /^application\/json\b/,
  );
  const healthBody = await healthResponse.text();
  assert.deepEqual(JSON.parse(healthBody), { status: "ok" });

  const allowedOrigin =
    "https://researchforge-preview-abc123-yuz1ove-s-projects.vercel.app";
  const optionsResponse = await fetch(`${baseUrl}/api/healthz`, {
    method: "OPTIONS",
    headers: {
      ...closeConnection,
      Origin: allowedOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type, authorization",
    },
  });
  assert.equal(optionsResponse.status, 204);
  assert.equal(
    optionsResponse.headers.get("access-control-allow-origin"),
    allowedOrigin,
  );
  assert.match(
    optionsResponse.headers.get("access-control-allow-methods") ?? "",
    /POST/,
  );
  assert.match(
    optionsResponse.headers.get("access-control-allow-headers") ?? "",
    /content-type/i,
  );
  assert.equal(
    optionsResponse.headers.get("access-control-allow-credentials"),
    null,
  );

  const localOriginResponse = await fetch(`${baseUrl}/api/healthz`, {
    headers: { ...closeConnection, Origin: "http://127.0.0.1:22067" },
  });
  assert.equal(
    localOriginResponse.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:22067",
  );

  const rejectedOriginResponse = await fetch(`${baseUrl}/api/healthz`, {
    headers: { ...closeConnection, Origin: "https://evil.example" },
  });
  assert.equal(
    rejectedOriginResponse.headers.get("access-control-allow-origin"),
    null,
  );

  const rejectedPreflightResponse = await fetch(`${baseUrl}/api/healthz`, {
    method: "OPTIONS",
    headers: {
      ...closeConnection,
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "POST",
    },
  });
  assert.equal(
    rejectedPreflightResponse.headers.get("access-control-allow-origin"),
    null,
  );

  const notFoundResponse = await fetch(`${baseUrl}/api/not-a-real-route`, {
    headers: closeConnection,
  });
  assert.equal(notFoundResponse.status, 404);
  const notFoundBody = await notFoundResponse.text();
  assert.doesNotMatch(notFoundBody, /(?:Error:|at\s+\S+\s+\([^)]*:\d+:\d+\))/);

  for (const body of [rootBody, healthBody, notFoundBody]) {
    for (const signature of FORBIDDEN_RESPONSE_SIGNATURES) {
      assert.equal(
        body.includes(signature),
        false,
        `response exposed ${signature}`,
      );
    }
  }
});
