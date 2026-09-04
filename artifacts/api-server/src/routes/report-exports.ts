import { Router, type IRouter } from "express";
import type { Browser, BrowserContext, Page } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const DEFAULT_RENDER_TIMEOUT_MS = 30_000;
const MAX_PRINT_HTML_BYTES = 2 * 1024 * 1024;
const PDF_CONTENT_TYPE = "application/pdf";
const require = createRequire(import.meta.url);
let embeddedCjkFontCss: string | null = null;

const ALLOWED_TAGS = new Set([
  "body",
  "a",
  "br",
  "div",
  "figure",
  "figcaption",
  "h1",
  "h2",
  "head",
  "html",
  "li",
  "meta",
  "p",
  "section",
  "small",
  "span",
  "strong",
  "style",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "title",
  "tr",
  "ul",
]);

const ALLOWED_CLASS_VALUES = new Set([
  "checks",
  "cover",
  "doi-link",
  "kicker",
  "meta",
  "note",
  "references",
  "scope",
  "slide",
  "source-note",
  "subtitle",
  "sugg",
  "table-caption",
  "toc",
  "visual",
  "rf-figure",
  "rf-bars",
  "rf-bar-row",
  "rf-bar-label",
  "rf-bar-track",
  "rf-bar-fill",
  "rf-bar-value",
  "rf-matrix",
  "rf-graph",
  "rf-edge",
  "rf-proportion-panels",
  "rf-proportion-panel",
  "rf-panel-heading",
  "rf-proportion-track",
  "rf-proportion-glyph",
  "rf-forest",
  "rf-forest-row",
  "rf-forest-label",
  "rf-forest-track",
  "rf-forest-value",
  "rf-semantic-graph",
  "rf-semantic-edge",
  "rf-semantic-table",
  "semantic-caveat",
  "figure-meta",
  "figure-alt",
  "narrative",
  "citation-cluster",
  "citation-link",
  "reference-entry",
  "rf-table",
  "table-meta",
]);

export interface PdfRenderOptions {
  signal: AbortSignal;
  timeoutMs: number;
}

export type PdfRenderer = (
  html: string,
  options: PdfRenderOptions,
) => Promise<Uint8Array>;

export interface ReportExportsRouterOptions {
  maxHtmlBytes?: number;
  renderPdf?: PdfRenderer;
  renderTimeoutMs?: number;
}

export class PdfRenderTimeoutError extends Error {
  constructor() {
    super("產生 PDF 逾時。");
    this.name = "PdfRenderTimeoutError";
  }
}

export class UnsafePrintHtmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePrintHtmlError";
  }
}

export class CjkGlyphValidationError extends Error {
  constructor() {
    super("繁體中文字型未成功載入，PDF 輸出已阻擋。");
    this.name = "CjkGlyphValidationError";
  }
}

export function printHtmlWithEmbeddedCjkFont(html: string): string {
  if (!embeddedCjkFontCss) {
    const fontPath = require.resolve(
      "@fontsource/noto-sans-tc/files/noto-sans-tc-chinese-traditional-400-normal.woff2",
    );
    const fontData = readFileSync(fontPath).toString("base64");
    embeddedCjkFontCss = `@font-face{font-family:'ResearchForge Noto Sans TC';font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fontData}) format('woff2');}`;
  }
  return html.replace("</style>", `${embeddedCjkFontCss}</style>`);
}

export function assertCanonicalExportGateProof(value: unknown): void {
  const proof = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const readiness = proof.readinessStatus;
  if (
    proof.planBuildStatus !== "plan_built" ||
    (readiness !== "ready_complete_report" && readiness !== "ready_limited_report") ||
    typeof proof.evidenceSetHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(proof.evidenceSetHash) ||
    proof.writerEvidenceSetHash !== proof.evidenceSetHash ||
    proof.filteredAfterPlanCount !== 0 ||
    proof.formalResearchValidationPassed !== true ||
    proof.contentIntegrityValidated !== true ||
    proof.resumeFrom !== "export" ||
    proof.safeToResume !== true
  ) {
    throw new Error("canonical_export_gate_not_satisfied");
  }
}

function assertAllowedAttributes(tagName: string, rawAttributes: string): void {
  const attributes = rawAttributes.trim().replace(/\/$/u, "").trim();
  if (!attributes) return;

  const allowed =
    tagName === "html"
      ? new Map([["lang", new Set(["zh-Hant"])]] as const)
      : tagName === "meta"
        ? new Map([["charset", new Set(["utf-8"])]] as const)
        : tagName === "div" ||
            tagName === "p" ||
            tagName === "section" ||
            tagName === "ul" ||
            tagName === "figure" ||
            tagName === "span" ||
            tagName === "strong" ||
            tagName === "table"
          ? new Map([["class", ALLOWED_CLASS_VALUES]] as const)
          : tagName === "a"
            ? new Map([["class", ALLOWED_CLASS_VALUES]] as const)
          : new Map<string, ReadonlySet<string>>();

  const attributePattern = /([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/giu;
  let cursor = 0;
  let count = 0;

  for (const match of attributes.matchAll(attributePattern)) {
    if (attributes.slice(cursor, match.index).trim()) {
      throw new UnsafePrintHtmlError("列印 HTML 含有無法辨識的屬性。");
    }
    cursor = (match.index ?? 0) + match[0].length;
    count += 1;

    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? "";
    const allowedValues = allowed.get(name);
    const dynamicAllowed =
      (tagName === "section" && name === "id" && /^rf-section-\d+$/u.test(value)) ||
      (tagName === "p" && name === "id" && /^rf-reference-[A-Za-z0-9_-]+$/u.test(value)) ||
      (tagName === "a" && name === "href" && (
        /^#rf-section-\d+$/u.test(value) ||
        /^#rf-reference-[A-Za-z0-9_-]+$/u.test(value) ||
        /^https:\/\/doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/iu.test(value)
      ));
    if (!dynamicAllowed && !allowedValues?.has(value)) {
      throw new UnsafePrintHtmlError("列印 HTML 含有未允許的屬性。");
    }
  }

  if (!count || attributes.slice(cursor).trim()) {
    throw new UnsafePrintHtmlError("列印 HTML 含有無法辨識的屬性。");
  }
}

/**
 * The export endpoint accepts only the static document emitted by
 * `buildPrintHtml`. User-authored report text is escaped by that builder; this
 * second server-side gate rejects every tag/attribute/CSS feature capable of
 * executing code or loading a resource.
 */
export function assertSafePrintHtml(
  html: unknown,
  maxHtmlBytes = MAX_PRINT_HTML_BYTES,
): asserts html is string {
  if (typeof html !== "string" || !html.trim()) {
    throw new UnsafePrintHtmlError("缺少列印 HTML。");
  }
  if (Buffer.byteLength(html, "utf8") > maxHtmlBytes) {
    throw new RangeError("列印 HTML 超過允許大小。");
  }
  if (/\u0000|\r(?!\n)/u.test(html)) {
    throw new UnsafePrintHtmlError("列印 HTML 含有不合法的控制字元。");
  }

  const trimmed = html.trim();
  const doctypes = trimmed.match(/<!doctype\s+html>/giu) ?? [];
  if (
    doctypes.length !== 1 ||
    !/^<!doctype\s+html>/iu.test(trimmed) ||
    !/<html\s+lang=(?:"zh-Hant"|'zh-Hant')>/iu.test(trimmed) ||
    !/<meta\s+charset=(?:"utf-8"|'utf-8')\s*\/?\s*>/iu.test(trimmed) ||
    !/<body>/iu.test(trimmed) ||
    !/<\/body>\s*<\/html>\s*$/iu.test(trimmed)
  ) {
    throw new UnsafePrintHtmlError("列印 HTML 文件結構不完整。");
  }
  if (/<!--|<!\[CDATA\[|<\?(?!xml)|<!ENTITY/iu.test(trimmed)) {
    throw new UnsafePrintHtmlError("列印 HTML 含有未允許的語法。");
  }

  const styles = Array.from(
    trimmed.matchAll(/<style>([\s\S]*?)<\/style>/giu),
    (match) => match[1],
  );
  if (styles.length !== 1) {
    throw new UnsafePrintHtmlError("列印 HTML 必須且只能有一個內嵌樣式區塊。");
  }
  const cssWithoutPageRule = styles[0].replace(/@page\b/giu, "");
  if (
    /@|\\|\/\*|\b(?:url|image-set|cross-fade|paint|element|expression)\s*\(|(?:javascript|data|https?|file|ftp):/iu.test(
      cssWithoutPageRule,
    )
  ) {
    throw new UnsafePrintHtmlError("列印樣式含有外部資源或主動內容。");
  }

  const tokenPattern = /<[^>]*>/gu;
  let cursor = 0;
  let styleDepth = 0;
  for (const match of trimmed.matchAll(tokenPattern)) {
    const between = trimmed.slice(cursor, match.index);
    if (!styleDepth && /[<>]/u.test(between)) {
      throw new UnsafePrintHtmlError("列印 HTML 含有不完整的標籤。");
    }
    cursor = (match.index ?? 0) + match[0].length;

    const token = match[0];
    if (/^<!doctype\s+html>$/iu.test(token)) continue;

    const closing = token.match(/^<\/([a-z][a-z0-9]*)\s*>$/iu);
    if (closing) {
      const tagName = closing[1].toLowerCase();
      if (!ALLOWED_TAGS.has(tagName)) {
        throw new UnsafePrintHtmlError("列印 HTML 含有未允許的標籤。");
      }
      if (tagName === "style") styleDepth = Math.max(0, styleDepth - 1);
      continue;
    }

    const opening = token.match(/^<([a-z][a-z0-9]*)([\s\S]*?)>$/iu);
    if (!opening) {
      throw new UnsafePrintHtmlError("列印 HTML 含有無法辨識的標籤。");
    }
    const tagName = opening[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      throw new UnsafePrintHtmlError("列印 HTML 含有未允許的標籤。");
    }
    assertAllowedAttributes(tagName, opening[2]);
    if (tagName === "style") styleDepth += 1;
  }
  if (/[<>]/u.test(trimmed.slice(cursor))) {
    throw new UnsafePrintHtmlError("列印 HTML 含有不完整的標籤。");
  }
}

async function closeQuietly(resource: Browser | BrowserContext | Page | null): Promise<void> {
  if (!resource) return;
  try {
    await resource.close();
  } catch {
    // The timeout path may already have closed the browser and its children.
  }
}

export const renderPdfWithPlaywright: PdfRenderer = async (
  html,
  { signal, timeoutMs },
) => {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  const abortBrowser = () => {
    void closeQuietly(browser);
  };
  signal.addEventListener("abort", abortBrowser, { once: true });

  try {
    if (signal.aborted) throw new PdfRenderTimeoutError();
    const { chromium } = await import("playwright");
    if (signal.aborted) throw new PdfRenderTimeoutError();

    browser = await chromium.launch({ headless: true });
    if (signal.aborted) throw new PdfRenderTimeoutError();

    context = await browser.newContext({ javaScriptEnabled: false });
    await context.route("**/*", (route) => {
      void route.abort("blockedbyclient");
    });
    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    page.setDefaultNavigationTimeout(timeoutMs);
    await page.emulateMedia({ media: "print" });
    await page.setContent(printHtmlWithEmbeddedCjkFont(html), { waitUntil: "load", timeout: timeoutMs });
    await page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()");
    const cjkFontReady = await page.evaluate(
      `Boolean(document.fonts && document.fonts.check('16px "ResearchForge Noto Sans TC"', '臺灣繁體中文校園綠覆率都市熱島'))`,
    );
    if (!cjkFontReady) throw new CjkGlyphValidationError();
    if (signal.aborted) throw new PdfRenderTimeoutError();

    const cdp = await context.newCDPSession(page);
    const printed = await cdp.send("Page.printToPDF", {
      displayHeaderFooter: true,
      headerTemplate:
        '<div style="width:100%;font-size:8px;color:#416b6c;padding:0 23mm;font-family:Arial,sans-serif;">ResearchForge Evidence Synthesis</div>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#6a7778;padding:0 23mm;text-align:center;font-family:Arial,sans-serif;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      marginTop: 14 / 25.4,
      marginRight: 0,
      marginBottom: 14 / 25.4,
      marginLeft: 0,
      preferCSSPageSize: true,
      printBackground: true,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
    return Uint8Array.from(Buffer.from(printed.data, "base64"));
  } finally {
    signal.removeEventListener("abort", abortBrowser);
    await closeQuietly(page);
    await closeQuietly(context);
    await closeQuietly(browser);
  }
};

function renderWithDeadline(
  renderer: PdfRenderer,
  html: string,
  timeoutMs: number,
): Promise<Uint8Array> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new PdfRenderTimeoutError());
    }, timeoutMs);
    timeoutId.unref?.();
  });

  return Promise.race([
    renderer(html, { signal: controller.signal, timeoutMs }),
    timeout,
  ])
    .catch((error: unknown) => {
      // Closing Chromium on abort can reject the in-flight Playwright call
      // before the timeout promise settles. Preserve the public timeout result.
      if (controller.signal.aborted) throw new PdfRenderTimeoutError();
      throw error;
    })
    .finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });
}

function safePdfFilename(value: unknown): string {
  if (typeof value !== "string") return "report.pdf";
  const basename = Array.from(
    value
    .trim()
    .replace(/[\\/:*?"<>|\r\n\u0000-\u001f]+/gu, "")
    .replace(/[. ]+$/gu, ""),
  )
    .slice(0, 80)
    .join("")
    .replace(/[. ]+$/gu, "");
  if (!basename) return "report.pdf";
  return `${basename.replace(/\.pdf$/iu, "")}.pdf`;
}

export function createReportExportsRouter(
  options: ReportExportsRouterOptions = {},
): IRouter {
  const router: IRouter = Router();
  const renderer = options.renderPdf ?? renderPdfWithPlaywright;
  const timeoutMs = options.renderTimeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS;
  const maxHtmlBytes = options.maxHtmlBytes ?? MAX_PRINT_HTML_BYTES;

  router.post("/report-exports/pdf", async (req, res) => {
    const body = req.body as {
      html?: unknown;
      filename?: unknown;
      exportGateProof?: unknown;
    } | null;
    try {
      assertCanonicalExportGateProof(body?.exportGateProof);
    } catch {
      res.status(422).json({
        code: "EXPORT_GATE_BLOCKED",
        message: "canonical evidence、formal validation、content integrity、readiness 或 evidenceSetHash 尚未通過正式匯出 gate。",
      });
      return;
    }
    try {
      assertSafePrintHtml(body?.html, maxHtmlBytes);
    } catch (error) {
      const tooLarge = error instanceof RangeError;
      res.status(tooLarge ? 413 : 422).json({
        code: tooLarge ? "PDF_HTML_TOO_LARGE" : "PDF_HTML_UNSAFE",
        message: tooLarge
          ? "列印內容超過允許大小。"
          : "列印內容未通過安全檢查。",
      });
      return;
    }

    try {
      const pdf = await renderWithDeadline(renderer, body.html, timeoutMs);
      const filename = safePdfFilename(body.filename);
      const encodedFilename = encodeURIComponent(filename).replace(
        /['()*]/gu,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      res.status(200);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename="report.pdf"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader("Content-Length", String(pdf.byteLength));
      res.setHeader("Content-Type", PDF_CONTENT_TYPE);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(Buffer.from(pdf));
    } catch (error) {
      const timedOut = error instanceof PdfRenderTimeoutError;
      const cjkGlyphMissing = error instanceof CjkGlyphValidationError;
      res.status(timedOut ? 504 : 500).json({
        code: timedOut
          ? "PDF_RENDER_TIMEOUT"
          : cjkGlyphMissing
            ? "PDF_CJK_GLYPH_MISSING"
            : "PDF_RENDER_FAILED",
        message: timedOut
          ? "PDF 產生逾時，請稍後再試。"
          : cjkGlyphMissing
            ? "繁體中文字型未成功載入，PDF 輸出已阻擋。"
          : "PDF 產生失敗，請稍後再試。",
      });
    }
  });

  return router;
}

export default createReportExportsRouter();
