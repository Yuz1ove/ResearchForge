import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import app from "../app";
import {
  generateReportDocx,
  normalizeGenerateReportRequest,
} from "../services/report-generation";

const topic = "短影音使用對高中生注意力與睡眠品質之影響";
const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

test("POST /api/generate-report returns 400 for missing topic", async () => {
  const response = await postGenerateJson({ topic: "   ", reportType: "研究報告", format: "docx" });

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "請輸入報告主題。");
  assert.equal(response.body.code, "missing_topic");
});

test("POST /api/generate-report defaults missing reportType to 研究報告", async () => {
  const normalized = normalizeGenerateReportRequest({ topic, format: "docx" });
  assert.equal(normalized.reportType, "研究報告");

  const response = await postGenerateBinary({ topic, format: "docx" });

  assert.equal(response.status, 200);
  assert.equal(decodeURIComponent(response.headers["x-report-factory-report-type"] ?? ""), "研究報告");
});

test("POST /api/generate-report returns 400 for unsupported format", async () => {
  const response = await postGenerateJson({ topic, reportType: "研究報告", format: "pdf" });

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "目前只支援 docx 格式。");
  assert.equal(response.body.code, "unsupported_format");
});

test("POST /api/generate-report produces a DOCX response for an academic report request", async () => {
  const response = await postGenerateBinary({ topic, reportType: "研究報告", format: "docx" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], docxMimeType);
  assert.match(response.headers["content-disposition"] ?? "", /attachment/);
  assert.match(response.headers["content-disposition"] ?? "", /\.docx/);
  assert.ok(response.buffer.byteLength > 1000);
  assert.equal(response.buffer.subarray(0, 2).toString("utf8"), "PK");
});

test("backend report generation handler does not throw uncaught errors", async () => {
  await assert.doesNotReject(() => generateReportDocx({ topic, reportType: "研究報告", format: "docx" }));

  const response = await postGenerateJson({ topic: " ", format: "docx" });
  assert.equal(response.status, 400);
});

async function postGenerateJson(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return withApiServer(async (baseUrl) => {
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
  return withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/generate-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      status: response.status,
      headers: {
        "content-disposition": response.headers.get("content-disposition"),
        "content-type": response.headers.get("content-type"),
        "x-report-factory-report-type": response.headers.get("x-report-factory-report-type"),
      },
      buffer: Buffer.from(await response.arrayBuffer()),
    };
  });
}

async function withApiServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = app.listen(0);
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
