import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  CjkGlyphValidationError,
  assertSafePrintHtml,
  createReportExportsRouter,
  printHtmlWithEmbeddedCjkFont,
  type PdfRenderer,
} from "./report-exports";

const safeHtml = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" />
<title>都市熱島效應研究報告</title>
<style>@page { size: A4; margin: 25mm; } body { font-family:"PingFang TC"; } .references p { overflow-wrap:anywhere; }</style></head>
<body><div class="cover"><h1>都市熱島效應研究報告</h1><p class="meta">正式草稿</p></div>
<section><h2>摘要</h2><p>綠地與地表溫度有可追溯關聯。</p></section>
<section class="references"><h2>參考文獻</h2><p>Chen (2024). https://example.org/paper/123</p></section></body></html>`;
const exportGateProof = {
  planBuildStatus: "plan_built",
  readinessStatus: "ready_limited_report",
  evidenceSetHash: "a".repeat(64),
  writerEvidenceSetHash: "a".repeat(64),
  filteredAfterPlanCount: 0,
};

async function withServer(
  renderer: PdfRenderer,
  callback: (baseUrl: string) => Promise<void>,
  renderTimeoutMs = 250,
): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "3mb" }));
  app.use(
    "/api",
    createReportExportsRouter({ renderPdf: renderer, renderTimeoutMs }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address() as AddressInfo;
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    server.closeAllConnections?.();
    server.unref();
  }
}

test("static ResearchForge print HTML passes the server safety gate", () => {
  assert.doesNotThrow(() => assertSafePrintHtml(safeHtml));
});

test("safe internal navigation and DOI hyperlinks pass while arbitrary links fail", () => {
  const linked = safeHtml
    .replace("<section><h2>摘要", '<section id="rf-section-1"><h2>摘要')
    .replace("綠地與地表溫度有可追溯關聯。", '<a href="#rf-section-2"><span>綠地與地表溫度有可追溯關聯。</span></a>')
    .replace('<section class="references">', '<section id="rf-section-2" class="references">')
    .replace(
      "https://example.org/paper/123",
      '<a class="doi-link" href="https://doi.org/10.1000/example">https://doi.org/10.1000/example</a>',
    );

  assert.doesNotThrow(() => assertSafePrintHtml(linked));
  assert.throws(() => assertSafePrintHtml(
    linked.replace("https://doi.org/10.1000/example", "https://evil.example/steal"),
  ));
});

test("reader citation links and reference anchors pass the static PDF safety gate", () => {
  const linked = safeHtml
    .replace(
      "<p>綠地與地表溫度有可追溯關聯。</p>",
      '<p class="narrative">綠地與地表溫度有可追溯關聯<span class="citation-cluster">（<a class="citation-link" href="#rf-reference-ref-1">Chen, 2024</a>）</span>。</p>',
    )
    .replace(
      "<p>Chen (2024). https://example.org/paper/123</p>",
      '<p id="rf-reference-ref-1" class="reference-entry">Chen (2024). Urban heat evidence.</p>',
    );

  assert.doesNotThrow(() => assertSafePrintHtml(linked));
  assert.throws(() => assertSafePrintHtml(
    linked.replace("#rf-reference-ref-1", "#rf-reference-../../escape"),
  ));
});

test("PDF renderer injects the bundled Noto Traditional Chinese font after validation", () => {
  const embedded = printHtmlWithEmbeddedCjkFont(safeHtml);
  assert.match(embedded, /font-family:'ResearchForge Noto Sans TC'/u);
  assert.match(embedded, /data:font\/woff2;base64,/u);
  assert.ok(Buffer.byteLength(embedded, "utf8") > Buffer.byteLength(safeHtml, "utf8") + 500_000);
});

test("the print HTML safety gate rejects active and external content", () => {
  const unsafeDocuments = [
    safeHtml.replace("<p>綠地", '<p onclick="alert(1)">綠地'),
    safeHtml.replace("</body>", '<script>alert(1)</script></body>'),
    safeHtml.replace("</body>", '<iframe src="https://evil.example"></iframe></body>'),
    safeHtml.replace("</body>", '<img src="data:image/svg+xml,x" /></body>'),
    safeHtml.replace("</head>", '<link rel="stylesheet" href="https://evil.example/x.css" /></head>'),
    safeHtml.replace("body {", '@import "https://evil.example/x.css"; body {'),
    safeHtml.replace("body {", "body { background:url(https://evil.example/x); } body {"),
    safeHtml.replace('<meta charset="utf-8" />', '<meta http-equiv="refresh" content="0;url=https://evil.example" />'),
  ];

  for (const html of unsafeDocuments) {
    assert.throws(() => assertSafePrintHtml(html));
  }
});

test("PDF route uses the injected renderer and returns a direct attachment", async () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\nfixture");
  let renderedHtml = "";
  let receivedTimeout = 0;
  const renderer: PdfRenderer = async (html, options) => {
    renderedHtml = html;
    receivedTimeout = options.timeoutMs;
    assert.equal(options.signal.aborted, false);
    return pdfBytes;
  };

  await withServer(renderer, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/report-exports/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({ html: safeHtml, filename: "都市熱島效應研究報告.pdf", exportGateProof }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/u);
    assert.match(response.headers.get("content-disposition") ?? "", /filename\*=UTF-8''/u);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), pdfBytes);
  });

  assert.equal(renderedHtml, safeHtml);
  assert.equal(receivedTimeout, 250);
});

test("PDF route rejects a missing or mismatched canonical export proof before rendering", async () => {
  let calls = 0;
  const renderer: PdfRenderer = async () => {
    calls += 1;
    return new Uint8Array();
  };

  await withServer(renderer, async (baseUrl) => {
    for (const proof of [
      undefined,
      { ...exportGateProof, writerEvidenceSetHash: "b".repeat(64) },
      { ...exportGateProof, filteredAfterPlanCount: 1 },
    ]) {
      const response = await fetch(`${baseUrl}/api/report-exports/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ html: safeHtml, exportGateProof: proof }),
      });
      assert.equal(response.status, 422);
      const body = await response.json() as { code?: unknown };
      assert.equal(body.code, "EXPORT_GATE_BLOCKED");
    }
  });

  assert.equal(calls, 0);
});

test("unsafe HTML is rejected before the PDF renderer runs", async () => {
  let calls = 0;
  const renderer: PdfRenderer = async () => {
    calls += 1;
    return new Uint8Array();
  };

  await withServer(renderer, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/report-exports/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({
        html: safeHtml.replace("</body>", '<object data="https://evil.example"></object></body>'),
        exportGateProof,
      }),
    });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), {
      code: "PDF_HTML_UNSAFE",
      message: "列印內容未通過安全檢查。",
    });
  });

  assert.equal(calls, 0);
});

test("PDF renderer timeout aborts the render and fails closed", async () => {
  let aborted = false;
  const renderer: PdfRenderer = (_html, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(new Error("aborted by test renderer"));
        },
        { once: true },
      );
    });

  await withServer(
    renderer,
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/report-exports/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify({ html: safeHtml, exportGateProof }),
      });
      assert.equal(response.status, 504);
      const body = (await response.json()) as { code?: unknown };
      assert.equal(body.code, "PDF_RENDER_TIMEOUT");
    },
    25,
  );

  assert.equal(aborted, true);
});

test("PDF renderer failures do not fall back to browser printing", async () => {
  const renderer: PdfRenderer = async () => {
    throw new Error("renderer unavailable");
  };

  await withServer(renderer, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/report-exports/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({ html: safeHtml, exportGateProof }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: "PDF_RENDER_FAILED",
      message: "PDF 產生失敗，請稍後再試。",
    });
  });
});

test("missing CJK glyph coverage returns a specific hard failure", async () => {
  const renderer: PdfRenderer = async () => {
    throw new CjkGlyphValidationError();
  };

  await withServer(renderer, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/report-exports/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Connection: "close" },
      body: JSON.stringify({ html: safeHtml, exportGateProof }),
    });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: "PDF_CJK_GLYPH_MISSING",
      message: "繁體中文字型未成功載入，PDF 輸出已阻擋。",
    });
  });
});
