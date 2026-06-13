import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express, { type Express } from "express";
import app from "../app";
import {
  createGenerateReportRouter,
  type GenerateReportDocxHandler,
} from "./generate-report";
import {
  buildReportDocxFilename,
  DOCX_MIME_TYPE,
  GenerateReportGenerationError,
  generateReportDocx,
  normalizeGenerateReportRequest,
} from "../services/report-generation";

const topic = "短影音使用對高中生注意力與睡眠品質之影響";

test("POST /api/generate-report returns 400 for missing topic", async () => {
  const response = await postGenerateJson({ reportType: "研究報告", format: "docx" });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: "MISSING_TOPIC",
      message: "Topic is required.",
    },
  });
});

test("POST /api/generate-report returns 400 for blank topic", async () => {
  const response = await postGenerateJson({ topic: "   ", reportType: "研究報告", format: "docx" });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: "MISSING_TOPIC",
      message: "Topic is required.",
    },
  });
});

test("POST /api/generate-report defaults missing reportType to 研究報告", async () => {
  const normalized = normalizeGenerateReportRequest({ topic, format: "docx" });
  assert.equal(normalized.reportType, "研究報告");

  const response = await postGenerateBinary({ topic, format: "docx" });

  assert.equal(response.status, 200);
  assert.equal(decodeURIComponent(response.headers["x-report-factory-report-type"] ?? ""), "研究報告");
});

test("POST /api/generate-report defaults missing format to docx", async () => {
  const normalized = normalizeGenerateReportRequest({ topic, reportType: "研究報告" });
  assert.equal(normalized.format, "docx");

  const response = await postGenerateBinary({ topic, reportType: "研究報告" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-report-factory-format"], "docx");
});

test("POST /api/generate-report returns 400 for unsupported format", async () => {
  const response = await postGenerateJson({ topic, reportType: "研究報告", format: "pdf" });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: "UNSUPPORTED_FORMAT",
      message: "Only docx format is supported.",
    },
  });
});

test("POST /api/generate-report produces a DOCX response for an academic report request", async () => {
  const response = await postGenerateBinary({ topic, reportType: "研究報告", format: "docx" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], DOCX_MIME_TYPE);
  assert.equal(response.headers["x-report-factory-format"], "docx");
  assert.equal(Number(response.headers["content-length"]), response.buffer.byteLength);
  assert.match(response.headers["access-control-expose-headers"] ?? "", /Content-Disposition/);
  assert.match(response.headers["access-control-expose-headers"] ?? "", /X-Report-Factory-Format/);
  assert.match(response.headers["content-disposition"] ?? "", /attachment/);
  assert.match(response.headers["content-disposition"] ?? "", /\.docx/);
  assert.ok(response.buffer.byteLength > 1000);
  assert.equal(response.buffer.subarray(0, 2).toString("utf8"), "PK");
});

test("buildReportDocxFilename keeps Chinese topics safe for downloads", () => {
  const filename = buildReportDocxFilename("../短影音/睡眠?品質..", new Date("2026-06-13T00:00:00.000Z"));

  assert.equal(filename, "ResearchForge-短影音-睡眠-品質-2026-06-13.docx");
  assert.doesNotMatch(filename, /[\\/:*?"<>|\n\r]/);
  assert.ok(filename.endsWith(".docx"));
});

test("POST /api/generate-report returns controlled error for generation service failure", async () => {
  const failingService: GenerateReportDocxHandler = async () => {
    throw new GenerateReportGenerationError("DOCX plugin failed.");
  };
  const response = await postGenerateJson({ topic, reportType: "研究報告", format: "docx" }, buildGenerateReportTestApp(failingService));

  assert.equal(response.status, 500);
  assert.deepEqual(response.body, {
    ok: false,
    error: {
      code: "GENERATION_FAILURE",
      message: "Report generation failed.",
    },
  });
});

test("backend report generation handler does not throw uncaught errors", async () => {
  await assert.doesNotReject(() => generateReportDocx({ topic, reportType: "研究報告", format: "docx" }));

  const unexpectedFailure: GenerateReportDocxHandler = async () => {
    throw new Error("Unexpected test failure");
  };
  let response: { status: number; body: Record<string, unknown> } | undefined;

  await assert.doesNotReject(async () => {
    response = await postGenerateJson({ topic, reportType: "研究報告", format: "docx" }, buildGenerateReportTestApp(unexpectedFailure));
  });
  assert.equal(response?.status, 500);
  assert.deepEqual(response?.body, {
    ok: false,
    error: {
      code: "UNEXPECTED_SERVER_ERROR",
      message: "Unexpected server error.",
    },
  });
});

function buildGenerateReportTestApp(generateDocx: GenerateReportDocxHandler): Express {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api", createGenerateReportRouter(generateDocx));
  return testApp;
}

async function postGenerateJson(
  body: unknown,
  targetApp: Express = app,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return withApiServer(targetApp, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      body: await response.json() as Record<string, unknown>,
    };
  });
}

async function postGenerateBinary(body: unknown): Promise<{
  status: number;
  headers: Record<string, string | null>;
  buffer: Buffer;
}> {
  return withApiServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      headers: {
        "access-control-expose-headers": response.headers.get("access-control-expose-headers"),
        "content-length": response.headers.get("content-length"),
        "content-disposition": response.headers.get("content-disposition"),
        "content-type": response.headers.get("content-type"),
        "x-report-factory-format": response.headers.get("x-report-factory-format"),
        "x-report-factory-report-type": response.headers.get("x-report-factory-report-type"),
      },
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  });
}

async function withApiServer<T>(targetApp: Express, callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = targetApp.listen(0);
  await waitForServer(server);

  try {
    const address = server.address() as AddressInfo;
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

async function waitForServer(server: Server): Promise<void> {
  if (server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
}
