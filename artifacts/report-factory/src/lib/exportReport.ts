/**
 * AI assistance disclosure: Portions of this export module were drafted or
 * refactored with Replit Agent and OpenAI Codex. See /AI_ASSISTANCE.md for the
 * scope of assistance and verification performed for the submitted version.
 */
import type { GeneratedReport, ReportInput, ContentBlock } from "./generateReport";
import {
  DEFAULT_REPORT_PRESENTATION,
  normalizeReportPresentation,
  reportFontOptionById,
  type ReportPresentationSettings,
} from "./reportPresentation.ts";
import {
  formalReportDocumentReaderText,
  scanReaderFacingForbiddenTokens,
  type FigureSpec,
  type FormalReportDocument,
  type FormalReportTable,
} from "./formalReportDocument.ts";
import {
  buildReaderCitationGroup,
  buildReaderCitationEntries,
  readerAcademicCitationMarker,
  stripReaderCitationTokens,
  type ReaderCitationEntry,
} from "./readerCitations.ts";
import { RESEARCHFORGE_PUBLICATION_LAYOUT } from "./publicationLayout.ts";
import { loadEmbeddedCjkFont } from "./embeddedCjkFont.ts";

// docx is heavy; it is lazy-loaded inside downloadDocx so it never enters the
// initial bundle. `D` is the dynamically imported module namespace.
type DocxModule = typeof import("docx");

/** Ordered CJK family candidates shared by Preview and print HTML. */
export const REPORT_CJK_FONT_FALLBACKS = [
  "ResearchForge Noto Sans TC",
  "Noto Sans TC Thin",
  "Noto Sans CJK TC",
  "Noto Serif CJK TC",
  "Noto Sans TC",
  "Source Han Sans TC",
  "Source Han Serif TC",
  "Microsoft JhengHei",
  "PingFang TC",
  "Heiti TC",
  "Arial Unicode MS",
] as const;

export const REPORT_CJK_FONT_STACK = REPORT_CJK_FONT_FALLBACKS
  .map((family) => `"${family}"`)
  .join(",");

interface ReaderCitationContext {
  entries: ReaderCitationEntry[];
}

export interface PublicationExportHints {
  /** Cached visible TOC pages from a deterministic first-pass render. */
  tocPageNumbers?: readonly number[];
}

function readerCitationContext(
  formalDocument: FormalReportDocument | undefined,
  report: GeneratedReport,
): ReaderCitationContext {
  const entries = formalDocument
    ? buildReaderCitationEntries(formalDocument.references, report.meta.acceptedSources)
    : [];
  return { entries };
}

function blockReaderCitations(
  block: ContentBlock,
  context: ReaderCitationContext,
): ReaderCitationEntry[] {
  const citationIds = new Set(block.citationIds ?? []);
  return context.entries.filter((entry) => citationIds.has(entry.citationId));
}

function citationEntriesForIds(
  citationIds: readonly string[],
  context: ReaderCitationContext,
): ReaderCitationEntry[] {
  const ids = new Set(citationIds);
  return context.entries.filter((entry) => ids.has(entry.citationId));
}

function splitTerminalPunctuation(value: string): { body: string; punctuation: string } {
  const match = value.match(/^(.*?)([。！？!?]+)$/u);
  return match
    ? { body: match[1]!, punctuation: match[2]! }
    : { body: value, punctuation: "" };
}

function appendReaderCitationText(
  value: string,
  entries: readonly ReaderCitationEntry[],
  markdown: boolean,
): string {
  const clean = entries.length > 0 ? stripReaderCitationTokens(value) : value;
  if (entries.length === 0) return clean;
  const { body, punctuation } = splitTerminalPunctuation(clean);
  const group = buildReaderCitationGroup(entries);
  const academicMarker = readerAcademicCitationMarker(group.referenceNumbers);
  const marker = markdown && entries[0]
    ? `[${academicMarker}](#${entries[0].anchorId})`
    : academicMarker;
  return `${body}${marker}${punctuation}`;
}

function referenceLines(
  context: ReaderCitationContext,
  markdown: boolean,
): string[] {
  return context.entries.flatMap((entry) => markdown
    ? [`<a id="${entry.anchorId}"></a>${entry.referenceNumber}. ${entry.referenceText}`, ""]
    : [`${entry.referenceNumber}. ${entry.referenceText}`]);
}

interface SemanticFigureTabulation {
  columns: string[];
  rows: string[][];
  caveat: string;
}

function semanticNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}

function readerMetricLabel(value: string): string {
  if (value === "poor_sleep_prevalence") return "睡眠不佳比例";
  return value.replace(/_/gu, " ");
}

function semanticFigureTabulation(figure: FigureSpec): SemanticFigureTabulation | null {
  const semantic = figure.semanticData;
  if (!semantic) return null;
  switch (semantic.kind) {
    case "proportion_facets":
      return {
        columns: ["獨立面板", "比例", "樣本與判定定義"],
        rows: semantic.panels.map((panel) => [
          panel.label,
          `${semanticNumber(panel.value)}%`,
          panel.sampleDefinition || readerMetricLabel(panel.metric),
        ]),
        caveat: "各面板保留原研究的樣本與判定定義，不直接排名或合併。",
      };
    case "forest_plot":
      return {
        columns: ["研究", "OR", "95% 區間"],
        rows: semantic.rows.map((row) => [
          row.label,
          semanticNumber(row.estimate),
          `${semanticNumber(row.lowerBound)}–${semanticNumber(row.upperBound)}`,
        ]),
        caveat: "OR 以 1 為基準線；僅顯示原研究點估計與區間，不做合併或排名。",
      };
    case "correlation_structure": {
      const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
      return {
        columns: ["關聯結構", "相關係數"],
        rows: semantic.links.map((link) => [
          `${labelById.get(link.from) ?? link.from} ↔ ${labelById.get(link.to) ?? link.to}`,
          `r = ${semanticNumber(link.value)}`,
        ]),
        caveat: "相關係數保留為 r，不轉換成百分比，也不解讀為因果。",
      };
    }
    case "mediation_path": {
      const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
      return {
        columns: ["中介路徑", "證據說明"],
        rows: semantic.edges.map((edge) => [
          `${labelById.get(edge.from) ?? edge.from} → ${labelById.get(edge.to) ?? edge.to}`,
          edge.label,
        ]),
        caveat: "圖中省略未能完整核對的係數，路徑不代表已證實的因果關係。",
      };
    }
    case "evidence_coverage":
      return {
        columns: ["證據範圍", "來源數"],
        rows: [
          ...semantic.dimensions.map((dimension) => [dimension.label, dimension.count == null ? "—" : String(dimension.count)]),
          [semantic.intersection.label, semantic.intersection.count == null ? "—" : String(semantic.intersection.count)],
        ],
        caveat: "覆蓋數只用於識別證據範圍與交集，不代表研究品質排名。",
      };
    case "applicability_boundary":
      return {
        columns: ["適用群體／情境", "來源數", "可支持的用途"],
        rows: semantic.groups.map((group) => [
          group.label,
          group.count == null ? "—" : String(group.count),
          group.use,
        ]),
        caveat: "各群體僅顯示證據可適用邊界，不進行強弱排名。",
      };
  }
}

function semanticFigureDataNote(figure: FigureSpec): string | null {
  const tabulation = semanticFigureTabulation(figure);
  if (!tabulation) return null;
  return tabulation.rows
    .map((row) => row.filter(Boolean).join("："))
    .join("；");
}

interface SemanticFigureDrawing {
  svg: Uint8Array;
  png: Uint8Array;
  width: number;
  height: number;
}

type Rgb = readonly [number, number, number];

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(tag: string, data: Uint8Array): Uint8Array {
  const tagBytes = new TextEncoder().encode(tag);
  const result = new Uint8Array(12 + data.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.byteLength, false);
  result.set(tagBytes, 4);
  result.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(result.slice(4, 8 + data.byteLength)), false);
  return result;
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength;) {
    const length = Math.min(65_535, data.byteLength - offset);
    const final = offset + length === data.byteLength;
    const block = new Uint8Array(5 + length);
    block[0] = final ? 1 : 0;
    block[1] = length & 0xff;
    block[2] = (length >>> 8) & 0xff;
    const complement = (~length) & 0xffff;
    block[3] = complement & 0xff;
    block[4] = (complement >>> 8) & 0xff;
    block.set(data.subarray(offset, offset + length), 5);
    blocks.push(block);
    offset += length;
  }
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  const result = new Uint8Array(2 + blocks.reduce((sum, block) => sum + block.byteLength, 0) + 4);
  result.set([0x78, 0x01]);
  let cursor = 2;
  for (const block of blocks) {
    result.set(block, cursor);
    cursor += block.byteLength;
  }
  new DataView(result.buffer).setUint32(cursor, ((b << 16) | a) >>> 0, false);
  return result;
}

function encodeRgbPng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const scanlines = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const output = y * (1 + width * 3);
    scanlines[output] = 0;
    scanlines.set(pixels.subarray(y * width * 3, (y + 1) * width * 3), output + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  header.set([8, 2, 0, 0, 0], 8);
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = [pngChunk("IHDR", header), pngChunk("IDAT", zlibStore(scanlines)), pngChunk("IEND", new Uint8Array())];
  const result = new Uint8Array(signature.byteLength + chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  result.set(signature);
  let cursor = signature.byteLength;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return result;
}

function semanticFigureFallbackPng(figure: FigureSpec, sourceWidth: number, sourceHeight: number): Uint8Array {
  const width = 410;
  const height = Math.max(75, Math.round(sourceHeight * width / sourceWidth));
  const pixels = new Uint8Array(width * height * 3);
  pixels.fill(255);
  const scaleX = width / sourceWidth;
  const scaleY = height / sourceHeight;
  const setPixel = (x: number, y: number, color: Rgb) => {
    const px = Math.round(x * scaleX);
    const py = Math.round(y * scaleY);
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const offset = (py * width + px) * 3;
    pixels.set(color, offset);
  };
  const fillRect = (x: number, y: number, rectWidth: number, rectHeight: number, color: Rgb) => {
    const left = Math.max(0, Math.floor(x * scaleX));
    const top = Math.max(0, Math.floor(y * scaleY));
    const right = Math.min(width, Math.ceil((x + rectWidth) * scaleX));
    const bottom = Math.min(height, Math.ceil((y + rectHeight) * scaleY));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const offset = (py * width + px) * 3;
        pixels.set(color, offset);
      }
    }
  };
  const line = (x1: number, y1: number, x2: number, y2: number, color: Rgb, thickness = 2) => {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1) * scaleX, Math.abs(y2 - y1) * scaleY)));
    for (let step = 0; step <= steps; step += 1) {
      const x = x1 + (x2 - x1) * step / steps;
      const y = y1 + (y2 - y1) * step / steps;
      for (let offset = -thickness; offset <= thickness; offset += 1) {
        setPixel(x, y + offset / scaleY, color);
      }
    }
  };
  const diamond = (x: number, y: number, radius: number, color: Rgb) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const span = radius - Math.abs(dy);
      fillRect(x - span, y + dy, span * 2 + 1, 1.5, color);
    }
  };
  const track: Rgb = [228, 236, 235];
  const mark: Rgb = [65, 107, 108];
  const node: Rgb = [211, 224, 222];
  const boundary: Rgb = [233, 220, 185];
  const semantic = figure.semanticData;
  if (!semantic) return encodeRgbPng(width, height, pixels);

  if (semantic.kind === "proportion_facets") {
    semantic.panels.forEach((panel, index) => {
      const y = 26 + index * 62;
      fillRect(245, y, 420, 18, track);
      fillRect(245, y, Math.max(0, Math.min(100, panel.value)) * 4.2, 18, mark);
    });
  } else if (semantic.kind === "forest_plot") {
    const values = semantic.rows.flatMap((row) => [row.lowerBound, row.upperBound, semantic.referenceValue]).filter((value) => value > 0);
    const minimum = Math.min(...(values.length > 0 ? values : [0.5]));
    const maximum = Math.max(...(values.length > 0 ? values : [2]));
    const logMinimum = Math.log(minimum);
    const logRange = Math.max(0.000001, Math.log(maximum) - logMinimum);
    const xFor = (value: number) => 260 + ((Math.log(value) - logMinimum) / logRange) * 390;
    line(xFor(semantic.referenceValue), 28, xFor(semantic.referenceValue), sourceHeight - 22, boundary, 1);
    semantic.rows.forEach((row, index) => {
      const y = 50 + index * 58;
      line(xFor(row.lowerBound), y, xFor(row.upperBound), y, mark);
      line(xFor(row.lowerBound), y - 6, xFor(row.lowerBound), y + 6, mark);
      line(xFor(row.upperBound), y - 6, xFor(row.upperBound), y + 6, mark);
      diamond(xFor(row.estimate), y, 8, mark);
    });
  } else if (semantic.kind === "correlation_structure" || semantic.kind === "mediation_path") {
    const edges = semantic.kind === "correlation_structure" ? semantic.links : semantic.edges;
    edges.forEach((_, index) => {
      const y = 18 + index * 72;
      fillRect(28, y, 250, 44, node);
      line(278, y + 22, 542, y + 22, mark);
      if (semantic.kind === "mediation_path") diamond(535, y + 22, 7, mark);
      fillRect(542, y, 250, 44, node);
    });
  } else if (semantic.kind === "evidence_coverage") {
    const count = Math.max(1, semantic.dimensions.length);
    const gap = 12;
    const cardWidth = Math.floor((760 - gap * (count - 1)) / count);
    semantic.dimensions.forEach((_, index) => {
      const x = 30 + index * (cardWidth + gap);
      fillRect(x, 24, cardWidth, 62, node);
      line(x + cardWidth / 2, 86, 410, 145, mark);
    });
    fillRect(250, 145, 320, 62, boundary);
  } else {
    semantic.groups.forEach((_, index) => {
      const y = 32 + index * 64;
      fillRect(34, y, 190, 46, node);
      line(224, y + 23, 280, y + 23, mark);
      diamond(270, y + 23, 7, mark);
      fillRect(280, y, 500, 46, boundary);
    });
  }
  return encodeRgbPng(width, height, pixels);
}

function svgEscape(value: string): string {
  return escapeHtml(value).replace(/"/gu, "&quot;").replace(/'/gu, "&apos;");
}

function compactSvgLabel(value: string, limit = 32): string {
  const characters = Array.from(value.replace(/\s+/gu, " ").trim());
  return characters.length <= limit ? characters.join("") : `${characters.slice(0, limit - 1).join("")}…`;
}

function semanticFigureDrawing(figure: FigureSpec): SemanticFigureDrawing | null {
  const semantic = figure.semanticData;
  if (!semantic) return null;
  const width = 820;
  const font = "Arial Unicode MS, Noto Sans CJK TC, Noto Sans TC, Source Han Sans TC, Microsoft JhengHei, PingFang TC, sans-serif";
  const baseStyle = `<style>text{font-family:${font};fill:#243535} .label{font-size:15px} .small{font-size:12px;fill:#627273} .value{font-size:14px;font-weight:700;fill:#173f42} .node{fill:#f3f7f6;stroke:#9fb7b5;stroke-width:1.5} .track{fill:#e4eceb} .mark{fill:#416b6c} .line{stroke:#416b6c;stroke-width:2} .boundary{fill:#fbf7ec;stroke:#a3833b;stroke-width:1.5}</style>`;
  const shell = (height: number, body: string): SemanticFigureDrawing => ({
    svg: new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${svgEscape(figure.altText)}">${baseStyle}<rect width="100%" height="100%" fill="#ffffff"/><g>${body}</g></svg>`,
    ),
    png: semanticFigureFallbackPng(figure, width, height),
    width: 620,
    height: Math.max(150, Math.min(440, Math.round((height / width) * 620))),
  });

  if (semantic.kind === "proportion_facets") {
    const height = 60 + semantic.panels.length * 62;
    const rows = semantic.panels.map((panel, index) => {
      const y = 42 + index * 62;
      const pointX = 245 + Math.max(0, Math.min(100, panel.value)) * 4.2;
      return `<g data-datum-key="${svgEscape(panel.datumKey)}"><text class="label" x="20" y="${y}">${svgEscape(compactSvgLabel(panel.label, 27))}</text>` +
        `<line x1="245" y1="${y - 8}" x2="665" y2="${y - 8}" stroke="#9fb7b5" stroke-width="1.5"/><circle class="mark" cx="${pointX}" cy="${y - 8}" r="7"/>` +
        `<text class="value" x="680" y="${y}">${semanticNumber(panel.value)}%</text><text class="small" x="245" y="${y + 20}">${svgEscape(compactSvgLabel(`${readerMetricLabel(panel.metric)}｜${panel.sampleDefinition}`, 58))}</text></g>`;
    }).join("");
    return shell(height, `<text class="value" x="20" y="22">獨立比例面板（0–100%）</text>${rows}`);
  }

  if (semantic.kind === "forest_plot") {
    const height = 90 + semantic.rows.length * 58;
    const values = semantic.rows.flatMap((row) => [row.lowerBound, row.upperBound, semantic.referenceValue]).filter((value) => value > 0);
    const minimum = Math.min(...(values.length > 0 ? values : [0.5]));
    const maximum = Math.max(...(values.length > 0 ? values : [2]));
    const logMinimum = Math.log(minimum);
    const logRange = Math.max(0.000001, Math.log(maximum) - logMinimum);
    const xFor = (value: number) => 260 + ((Math.log(value) - logMinimum) / logRange) * 390;
    const referenceX = xFor(semantic.referenceValue);
    const rows = semantic.rows.map((row, index) => {
      const y = 50 + index * 58;
      const estimateX = xFor(row.estimate);
      const lowerX = xFor(row.lowerBound);
      const upperX = xFor(row.upperBound);
      return `<g data-datum-key="${svgEscape(row.datumKey)}"><text class="label" x="20" y="${y + 5}">${svgEscape(compactSvgLabel(row.label, 28))}</text>` +
        `<line class="line" x1="${lowerX}" y1="${y}" x2="${upperX}" y2="${y}"/><line class="line" x1="${lowerX}" y1="${y - 6}" x2="${lowerX}" y2="${y + 6}"/><line class="line" x1="${upperX}" y1="${y - 6}" x2="${upperX}" y2="${y + 6}"/>` +
        `<polygon class="mark" points="${estimateX},${y - 7} ${estimateX + 7},${y} ${estimateX},${y + 7} ${estimateX - 7},${y}"/>` +
        `<text class="small" x="670" y="${y + 5}">OR ${semanticNumber(row.estimate)}（${semanticNumber(row.lowerBound)}–${semanticNumber(row.upperBound)}）</text></g>`;
    }).join("");
    return shell(height, `<text class="value" x="20" y="22">OR 與信賴區間</text><line x1="${referenceX}" y1="30" x2="${referenceX}" y2="${height - 25}" stroke="#a3833b" stroke-dasharray="5 4"/><text class="small" x="${referenceX + 5}" y="${height - 8}">OR = 1</text>${rows}`);
  }

  if (semantic.kind === "correlation_structure" || semantic.kind === "mediation_path") {
    const edges = semantic.kind === "correlation_structure" ? semantic.links : semantic.edges;
    const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
    const height = 40 + edges.length * 72;
    const rows = edges.map((edge, index) => {
      const y = 18 + index * 72;
      const relation = "value" in edge
        ? `r = ${semanticNumber(edge.value)}`
        : edge.label;
      const arrow = semantic.kind === "correlation_structure" ? "↔" : "→";
      return `<g data-datum-key="${svgEscape(edge.datumKey)}"><rect class="node" x="28" y="${y}" width="250" height="44" rx="7"/><text class="label" text-anchor="middle" x="153" y="${y + 27}">${svgEscape(compactSvgLabel(labelById.get(edge.from) ?? edge.from, 28))}</text>` +
        `<text class="value" text-anchor="middle" x="410" y="${y + 20}">${arrow}</text><text class="small" text-anchor="middle" x="410" y="${y + 39}">${svgEscape(compactSvgLabel(relation, 26))}</text>` +
        `<rect class="node" x="542" y="${y}" width="250" height="44" rx="7"/><text class="label" text-anchor="middle" x="667" y="${y + 27}">${svgEscape(compactSvgLabel(labelById.get(edge.to) ?? edge.to, 28))}</text></g>`;
    }).join("");
    return shell(height, rows);
  }

  if (semantic.kind === "evidence_coverage") {
    const count = Math.max(1, semantic.dimensions.length);
    const gap = 12;
    const cardWidth = Math.floor((760 - gap * (count - 1)) / count);
    const cards = semantic.dimensions.map((dimension, index) => {
      const x = 30 + index * (cardWidth + gap);
      const center = x + cardWidth / 2;
      return `<g data-datum-key="${svgEscape(dimension.datumKey)}"><rect class="node" x="${x}" y="24" width="${cardWidth}" height="62" rx="7"/><text class="label" text-anchor="middle" x="${center}" y="49">${svgEscape(compactSvgLabel(dimension.label, 18))}</text><text class="value" text-anchor="middle" x="${center}" y="72">${dimension.count ?? "—"}</text><line class="line" x1="${center}" y1="86" x2="410" y2="145"/></g>`;
    }).join("");
    return shell(230, `${cards}<g data-datum-key="${svgEscape(semantic.intersection.datumKey)}"><rect class="boundary" x="250" y="145" width="320" height="62" rx="9"/><text class="label" text-anchor="middle" x="410" y="171">${svgEscape(compactSvgLabel(semantic.intersection.label, 34))}</text><text class="value" text-anchor="middle" x="410" y="194">${semantic.intersection.count ?? "—"}</text></g>`);
  }

  const height = 58 + semantic.groups.length * 64;
  const groups = semantic.groups.map((group, index) => {
    const y = 32 + index * 64;
    return `<g data-datum-key="${svgEscape(group.datumKey)}"><rect class="node" x="34" y="${y}" width="190" height="46" rx="7"/><text class="label" text-anchor="middle" x="129" y="${y + 27}">${svgEscape(compactSvgLabel(group.label, 21))}</text>` +
      `<line class="line" x1="224" y1="${y + 23}" x2="268" y2="${y + 23}"/><polygon class="mark" points="268,${y + 23} 258,${y + 17} 258,${y + 29}"/>` +
      `<rect class="boundary" x="280" y="${y}" width="500" height="46" rx="7"/><text class="small" x="296" y="${y + 27}">${svgEscape(compactSvgLabel(group.use, 62))}</text><text class="value" text-anchor="end" x="765" y="${y + 18}">${group.count ?? ""}</text></g>`;
  }).join("");
  return shell(height, groups);
}

// ─── Shared text builders (plain text / markdown) ─────────────────────────────

function blockToLines(
  b: ContentBlock,
  md: boolean,
  citationContext?: ReaderCitationContext,
): string[] {
  switch (b.type) {
    case "paragraph": {
      if (!b.text) return [];
      if (citationContext && b.citationSegments?.length) {
        return [b.citationSegments.map((segment) => appendReaderCitationText(
          segment.text,
          citationEntriesForIds(segment.citationIds, citationContext),
          md,
        )).join("")];
      }
      const entries = citationContext ? blockReaderCitations(b, citationContext) : [];
      return [appendReaderCitationText(b.text, entries, md)];
    }
    case "list":
      return (b.items ?? []).map((i) => (md ? `- ${i}` : `• ${i}`));
    case "note":
      return b.text ? [md ? `> ${b.text}` : `※ ${b.text}`] : [];
    case "suggestions":
      return (b.suggestions ?? []).flatMap((s, i) => [
        `【建議${b.suggestionKind} ${i + 1}：${s.title}】`,
        `位置：${s.position}`,
        `用途：${s.purpose}`,
        `${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${s.content}`,
        "",
      ]);
    case "dataTable":
      if (md) {
        return [
          "| 資料類型 | 需要內容 | 用途 | 優先程度 |",
          "| --- | --- | --- | --- |",
          ...(b.rows ?? []).map((r) => `| ${r.type} | ${r.need} | ${r.use} | ${r.priority} |`),
        ];
      }
      return (b.rows ?? []).map((r) => `${r.type}｜${r.need}｜${r.use}｜優先：${r.priority}`);
    case "formalTable": {
      const table = b.table;
      if (!table) return [];
      if (!md) {
        return [
          `表 ${table.number}　${table.title}`,
          table.columns.join("｜"),
          ...table.rows.map((row) => row.join("｜")),
          ...(table.units ? [`單位：${table.units}`] : []),
          ...(table.legend ? [`圖例：${table.legend}`] : []),
          `資料來源：${table.sourceNote}`,
          ...(table.note ? [`註：${table.note}`] : []),
          `文字摘要：${table.altText}`,
        ];
      }
      const escapeCell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
      return [
        `**表 ${table.number}　${table.title}**`,
        `| ${table.columns.map(escapeCell).join(" | ")} |`,
        `| ${table.columns.map(() => "---").join(" | ")} |`,
        ...table.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
        ...(table.units ? [`*單位：${table.units}*`] : []),
        ...(table.legend ? [`*圖例：${table.legend}*`] : []),
        `*資料來源：${table.sourceNote}*`,
        ...(table.note ? [`*註：${table.note}*`] : []),
        `*文字摘要：${table.altText}*`,
      ];
    }
    case "formalFigure": {
      const figure = b.figure;
      if (!figure) return [];
      const metadata = [
        figure.units ? `單位：${figure.units}` : null,
        figure.legend.length > 0
          ? `圖例：${figure.legend.map((item) => `${item.key}＝${item.label}`).join("；")}`
          : null,
      ].filter((value): value is string => Boolean(value));
      const semanticTable = semanticFigureTabulation(figure);
      if (semanticTable) {
        const escapeCell = (value: string) => value.replace(/\|/gu, "\\|").replace(/\n/gu, " ");
        return md
          ? [
              `**圖 ${figure.number}　${figure.title}**`,
              `| ${semanticTable.columns.map(escapeCell).join(" | ")} |`,
              `| ${semanticTable.columns.map(() => "---").join(" | ")} |`,
              ...semanticTable.rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
              `*解讀邊界：${semanticTable.caveat}*`,
              ...metadata.map((value) => `*${value}*`),
              `*資料來源：${figure.sourceNote}*`,
              ...(figure.note ? [`*註：${figure.note}*`] : []),
              `*文字摘要：${figure.altText}*`,
            ]
          : [
              `圖 ${figure.number}　${figure.title}`,
              semanticTable.columns.join("｜"),
              ...semanticTable.rows.map((row) => row.join("｜")),
              `解讀邊界：${semanticTable.caveat}`,
              ...metadata,
              `資料來源：${figure.sourceNote}`,
              ...(figure.note ? [`註：${figure.note}`] : []),
              `文字摘要：${figure.altText}`,
            ];
      }
      if (figure.data.kind === "categorical_bar") {
        const maxValue = Math.max(1, ...figure.data.categories.map((item) => item.value));
        const rows = figure.data.categories.map((item) => {
          const bar = "■".repeat(item.value === 0 ? 0 : Math.max(1, Math.round((item.value / maxValue) * 12)));
          return md
            ? `| ${item.label.replace(/\|/gu, "\\|")} | ${item.value} | ${bar} |`
            : `${item.label}｜${item.value}｜${bar}`;
        });
        return md
          ? [
              `**圖 ${figure.number}　${figure.title}**`,
              "| 類別 | 數值 | 分布 |",
              "| --- | ---: | --- |",
              ...rows,
              ...metadata.map((value) => `*${value}*`),
              `*資料來源：${figure.sourceNote}*`,
              ...(figure.note ? [`*註：${figure.note}*`] : []),
              `*文字摘要：${figure.altText}*`,
            ]
          : [
              `圖 ${figure.number}　${figure.title}`,
              ...rows,
              ...metadata,
              `資料來源：${figure.sourceNote}`,
              ...(figure.note ? [`註：${figure.note}`] : []),
              `文字摘要：${figure.altText}`,
            ];
      }
      if (figure.data.kind === "matrix") {
        const columns = ["範圍", ...figure.data.columns];
        const rows = figure.data.rows.map((row) => [row.label, ...row.values]);
        return md
          ? [
              `**圖 ${figure.number}　${figure.title}**`,
              `| ${columns.join(" | ")} |`,
              `| ${columns.map(() => "---").join(" | ")} |`,
              ...rows.map((row) => `| ${row.join(" | ")} |`),
              ...metadata.map((value) => `*${value}*`),
              `*資料來源：${figure.sourceNote}*`,
              ...(figure.note ? [`*註：${figure.note}*`] : []),
              `*文字摘要：${figure.altText}*`,
            ]
          : [
              `圖 ${figure.number}　${figure.title}`,
              columns.join("｜"),
              ...rows.map((row) => row.join("｜")),
              ...metadata,
              `資料來源：${figure.sourceNote}`,
              ...(figure.note ? [`註：${figure.note}`] : []),
              `文字摘要：${figure.altText}`,
            ];
      }
      const graphData = figure.data;
      return [
        md ? `**圖 ${figure.number}　${figure.title}**` : `圖 ${figure.number}　${figure.title}`,
        ...graphData.edges.map((edge) => {
          const from = graphData.nodes.find((node) => node.id === edge.from)?.label ?? edge.from;
          const to = graphData.nodes.find((node) => node.id === edge.to)?.label ?? edge.to;
          return `${from} → ${to}${edge.label ? `（${edge.label}）` : ""}`;
        }),
        ...metadata,
        `資料來源：${figure.sourceNote}`,
        ...(figure.note ? [`註：${figure.note}`] : []),
        `文字摘要：${figure.altText}`,
      ];
    }
    case "quality":
      return (b.checks ?? []).map((c) => (md ? `- [${c.passed ? "x" : " "}] ${c.label}` : `${c.passed ? "✓" : "✗"} ${c.label}`));
    case "slides":
      return (b.slides ?? []).flatMap((s) => [
        `第 ${s.page} 頁：${s.title}`,
        ...s.points.map((p) => (md ? `- ${p}` : `• ${p}`)),
        `視覺建議：${s.visual}`,
        "",
      ]);
    default:
      return [];
  }
}

function metaLine(input: ReportInput, today: string): string {
  return `類型：${input.reportType}｜模式：${input.mode}｜風格：${input.style}｜對象：${input.targetAudience}｜${today}`;
}

/**
 * The immutable handoff used by every reader-facing export. Keeping the title,
 * metadata, section order, blocks, citation markers, and bibliography-bearing
 * report sections here prevents format-specific export code from rewriting the
 * generated report independently.
 */
export interface CanonicalExportDocument {
  title: string;
  metadataLine: string;
  classificationLine: string;
  shortTopic: GeneratedReport["shortTopic"] | null;
  sections: GeneratedReport["sections"];
  formalDocument?: FormalReportDocument;
}

export class ReportExportIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportExportIntegrityError";
  }
}

function assertReportCitationIntegrity(report: GeneratedReport): void {
  const integrity = report.meta.citationIntegrity;
  if (integrity?.status !== "blocked") return;
  const diagnostics = [
    integrity.unknownMarkers.length > 0
      ? `無法解析：${integrity.unknownMarkers.join("、")}`
      : null,
    integrity.ambiguousMarkers.length > 0
      ? `對應不唯一：${integrity.ambiguousMarkers.join("、")}`
      : null,
  ].filter(Boolean).join("；");
  throw new ReportExportIntegrityError(
    `引用完整性檢查未通過，無法正式匯出${diagnostics ? `（${diagnostics}）` : ""}。`,
  );
}

function assertReaderFacingIntegrity(report: GeneratedReport): void {
  const formalDocument = report.meta.formalReportDocument;
  const text = formalDocument
    ? formalReportDocumentReaderText(formalDocument)
    : report.sections
        .flatMap((section) => section.blocks)
        .flatMap((block) => block.text ?? block.items ?? [])
        .join("\n");
  const forbidden = Array.from(new Set([
    ...(report.meta.readerFacingAudit?.forbiddenTokens ?? []),
    ...scanReaderFacingForbiddenTokens(text),
  ]));
  if (
    report.meta.readerFacingAudit?.status === "blocked" ||
    formalDocument?.integrity.status === "blocked" ||
    forbidden.length > 0
  ) {
    throw new ReportExportIntegrityError(
      `讀者版內容仍含未解析引用或內部標記，正式匯出已阻擋${forbidden.length ? `（${forbidden.join("、")}）` : ""}。`,
    );
  }
}

function assertFormalExportProof(report: GeneratedReport): void {
  const proof = report.meta.formalExportProof;
  const formalDocument = report.meta.formalReportDocument;
  const canonicalLimitedBoundaryProjection = Boolean(
    formalDocument?.metadata.reportKind === "limited_evidence_brief" &&
    formalDocument.integrity.status === "pass" &&
    formalDocument.quality.passed === true &&
    formalDocument.quality.blockExport === false &&
    formalDocument.abstract.validation.status === "pass" &&
    formalDocument.metadata.eligibleSourceCount > 0 &&
    formalDocument.metadata.evidenceExcerptCount > 0 &&
    proof?.planBuildStatus === "plan_built" &&
    proof.readinessStatus === "ready_limited_report" &&
    proof.evidenceSetHash.length === 64 &&
    proof.evidenceSetHash === proof.writerEvidenceSetHash &&
    proof.filteredAfterPlanCount === 0 &&
    proof.contentIntegrityValidated === true &&
    proof.safeToResume === true
  );
  if (
    canonicalLimitedBoundaryProjection ||
    (proof?.planBuildStatus === "plan_built" &&
      (proof.readinessStatus === "ready_complete_report" ||
        proof.readinessStatus === "ready_limited_report") &&
      proof.evidenceSetHash.length === 64 &&
      proof.evidenceSetHash === proof.writerEvidenceSetHash &&
      proof.filteredAfterPlanCount === 0 &&
      proof.formalResearchValidationPassed === true &&
      proof.contentIntegrityValidated === true &&
      proof.resumeFrom === "export" &&
      proof.safeToResume === true)
  ) {
    return;
  }
  throw new ReportExportIntegrityError(
    "canonical WriterEvidenceSet、formal validation、content integrity、readiness 或 evidenceSetHash 尚未通過正式匯出 gate。",
  );
}

export function buildCanonicalExportDocument(
  report: GeneratedReport,
  input: ReportInput,
  today = new Date().toLocaleDateString("zh-TW"),
): CanonicalExportDocument {
  assertReportCitationIntegrity(report);
  assertReaderFacingIntegrity(report);
  assertFormalExportProof(report);
  const formalDocument = report.meta.formalReportDocument;
  return {
    title: report.meta.title,
    metadataLine: formalDocument
      ? `日期：${formalDocument.metadata.generatedDate}｜文件版本：${formalDocument.metadata.documentVersion}`
      : metaLine(input, today),
    classificationLine: formalDocument
      ? `研究問題：${formalDocument.metadata.researchQuestion}`
      : `分類：${report.meta.category}｜目前版本：${report.meta.versionLabel}（完整度約 ${report.meta.completeness}%）`,
    shortTopic: formalDocument ? null : report.shortTopic ?? null,
    sections: report.sections,
    ...(formalDocument ? { formalDocument } : {}),
  };
}

export function buildPlainText(report: GeneratedReport, input: ReportInput): string {
  const document = buildCanonicalExportDocument(report, input);
  const citations = readerCitationContext(document.formalDocument, report);
  const lines: string[] = [
    document.title,
    ...(document.formalDocument ? [document.formalDocument.titlePage.subtitle] : []),
    document.metadataLine,
    document.classificationLine,
    "",
  ];
  if (document.formalDocument?.tableOfContents.length) {
    lines.push(
      "【目錄】",
      ...document.formalDocument.tableOfContents.map((entry) => entry.label),
      "",
    );
  }
  if (document.shortTopic) {
    lines.push(`【提醒】${document.shortTopic.message}`, "建議延伸主題：", ...document.shortTopic.expansions.map((e, i) => `${i + 1}. ${e}`), "");
  }
  for (const section of document.sections) {
    lines.push(`【${section.heading}】`);
    if (isReferenceSection(section.heading) && citations.entries.length > 0) {
      lines.push(...referenceLines(citations, false));
    } else {
      for (const b of section.blocks) lines.push(...blockToLines(b, false, citations));
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildMarkdown(report: GeneratedReport, input: ReportInput): string {
  const document = buildCanonicalExportDocument(report, input);
  const citations = readerCitationContext(document.formalDocument, report);
  const lines: string[] = [
    `# ${document.title}`,
    ...(document.formalDocument ? [`*${document.formalDocument.titlePage.subtitle}*`, ""] : []),
    `> ${document.metadataLine}`,
    `>`,
    `> ${document.classificationLine.replace("｜", " ｜ ")}`,
    "",
  ];
  if (document.formalDocument?.tableOfContents.length) {
    lines.push(
      "## 目錄",
      "",
      ...document.formalDocument.tableOfContents.map((entry) => entry.label),
      "",
    );
  }
  if (document.shortTopic) {
    lines.push(`> ⚠️ ${document.shortTopic.message}`, "", "**建議延伸主題：**", ...document.shortTopic.expansions.map((e, i) => `${i + 1}. ${e}`), "");
  }
  for (const section of document.sections) {
    lines.push(`## ${section.heading}`);
    if (isReferenceSection(section.heading) && citations.entries.length > 0) {
      lines.push(...referenceLines(citations, true));
    } else {
      for (const b of section.blocks) lines.push(...blockToLines(b, true, citations));
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ─── Download helpers ─────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Defer revoke so the browser has time to start the download (avoids edge-case timing issues).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFileName(topic: string): string {
  const base = Array.from(
    topic
      .trim()
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\n\r\u0000-\u001f]+/g, "")
      .replace(/[. ]+$/, ""),
  )
    .slice(0, 40)
    .join("")
    .replace(/[. ]+$/, "");
  return base || "report-draft";
}

export function downloadTxt(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildPlainText(report, input)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}.txt`);
}

export function downloadMarkdown(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildMarkdown(report, input)], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}.md`);
}

// ─── JSON export (machine-readable handoff of the full draft) ──────────────────

export function buildJson(report: GeneratedReport, input: ReportInput): string {
  const canonicalDocument = buildCanonicalExportDocument(report, input);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      input,
      canonicalDocument,
      meta: report.meta,
      shortTopic: report.shortTopic ?? null,
      sections: report.sections,
    },
    null,
    2,
  );
}

export function downloadJson(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildJson(report, input)], { type: "application/json;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}.json`);
}

// ─── Research blueprint (Markdown plan, no fabricated content) ─────────────────

/** buildBlueprint — a concise, copy-ready research plan derived from the draft.
 *  It lists the planning skeleton (headings) and the data still to be gathered,
 *  without inventing facts or sources. */
export function buildBlueprint(report: GeneratedReport, input: ReportInput): string {
  const today = new Date().toLocaleDateString("zh-TW");
  const lines: string[] = [
    `# 研究規劃藍圖：${report.meta.title}`,
    "",
    `- 主題：${input.topic}`,
    `- 研究類型：${input.reportType}`,
    `- 學術程度：${input.academicLevel}`,
    `- 判定領域：${report.meta.category}`,
    `- 產生日期：${today}`,
    "",
    "## 規劃章節",
  ];
  report.sections.forEach((s, i) => lines.push(`${i + 1}. ${s.heading}`));

  // Surface every data-requirement row so the user knows what to collect.
  const dataRows = report.sections
    .flatMap((s) => s.blocks)
    .filter((b) => b.type === "dataTable")
    .flatMap((b) => b.rows ?? []);
  if (dataRows.length > 0) {
    lines.push("", "## 待蒐集資料", "| 資料類型 | 需要內容 | 用途 | 優先程度 |", "| --- | --- | --- | --- |");
    dataRows.forEach((r) => lines.push(`| ${r.type} | ${r.need} | ${r.use} | ${r.priority} |`));
  }

  lines.push(
    "",
    "## 品質檢查",
    report.meta.qualityReport
      ? JSON.stringify(report.meta.qualityReport, null, 2)
      : "品質報告待補。",
    "",
    "## 注意事項",
    "- 本藍圖為規劃用途，內容中的事實、數據與引用需自行查證後補齊。",
    "- 標示〔…〕或「資料來源待補」處，請填入實際查證後的資料。",
  );
  return lines.join("\n");
}

export function downloadBlueprint(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildBlueprint(report, input)], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}-藍圖.md`);
}

// ─── Prompt package (ready-to-paste prompt for an external AI) ─────────────────

/** buildPromptPackage — assembles a Traditional-Chinese prompt that a user can
 *  paste into another AI to flesh out the planned report. It embeds the planned
 *  structure and constraints, but asks the model to supply verified content. */
export function buildPromptPackage(report: GeneratedReport, input: ReportInput): string {
  const headings = report.sections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");
  const lines: string[] = [
    "你是一位專業的研究報告協作者，請使用繁體中文協助我完成下列報告。",
    "",
    "## 報告基本資訊",
    `- 主題：${input.topic}`,
    `- 研究類型：${input.reportType}`,
    `- 學術程度：${input.academicLevel}`,
    `- 判定領域：${report.meta.category}`,
    `- 報告風格：${input.style}`,
    `- 報告長度：${input.length}`,
    input.additionalInfo.trim() ? `- 補充要求：${input.additionalInfo.trim()}` : "",
    "",
    "## 請依下列章節架構撰寫",
    headings,
    "",
    "## 撰寫要求",
    "1. 全程使用繁體中文。",
    "2. 內容須正確、具體，並符合該領域的學術慣例。",
    "3. 凡引用數據、研究或事實，請明確標註資料來源；若無法確定，請以「資料來源待補」標示，切勿杜撰。",
    "4. 保持各章節邏輯連貫，並適度加入圖表或表格建議。",
  ].filter((l) => l !== "");
  return lines.join("\n");
}

export function downloadPromptPackage(report: GeneratedReport, input: ReportInput) {
  const blob = new Blob([buildPromptPackage(report, input)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${safeFileName(input.topic)}-prompt.txt`);
}

// ─── DOCX export ──────────────────────────────────────────────────────────────

const DOCX_A4_WIDTH_TWIPS = 11906;
const DOCX_A4_HEIGHT_TWIPS = 16838;
const DOCX_23_MM_TWIPS = 1304;
const DOCX_CONTENT_WIDTH_TWIPS = DOCX_A4_WIDTH_TWIPS - (DOCX_23_MM_TWIPS * 2);
const DOCX_BODY_FONT_SIZE_HALF_POINTS = 22;
const DOCX_BODY_LINE_SPACING_TWIPS = 330;
const DOCX_BODY_FIRST_LINE_TWIPS = 440;
const DOCX_REFERENCE_HANGING_TWIPS = 720;
const DOCX_EMBEDDED_CJK_FONT_FAMILY = "Noto Sans TC Thin";
const DOCX_PRIMARY_CJK_FONT_FAMILY = DOCX_EMBEDDED_CJK_FONT_FAMILY;
const DOCX_CJK_FONT = {
  // OOXML exposes one face per script rather than a CSS cascade. Point every
  // script slot at the same OFL face embedded below so layout metrics and
  // glyph selection remain stable across Word and portable QA rendering.
  ascii: DOCX_PRIMARY_CJK_FONT_FAMILY,
  hAnsi: DOCX_PRIMARY_CJK_FONT_FAMILY,
  eastAsia: DOCX_PRIMARY_CJK_FONT_FAMILY,
  cs: DOCX_PRIMARY_CJK_FONT_FAMILY,
  hint: "eastAsia",
} as const;
const DOCX_ZH_TW_LANGUAGE = {
  value: "zh-TW",
  eastAsia: "zh-TW",
} as const;
const DOCX_DEEP_TEAL = "173F42";
const DOCX_MUTED_TEAL = "416B6C";
const DOCX_GOLD = "A3833B";
const DOCX_BODY_SPACING = {
  line: DOCX_BODY_LINE_SPACING_TWIPS,
  lineRule: "auto" as const,
};

function isReferenceSection(heading: string): boolean {
  return /(?:資料來源|參考文獻|參考資料|references|bibliography)/iu.test(heading);
}

function referenceTextRuns(D: DocxModule, text: string) {
  const { ExternalHyperlink, TextRun } = D;
  const doiPattern = /https:\/\/doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/giu;
  const children: Array<InstanceType<DocxModule["TextRun"]> | InstanceType<DocxModule["ExternalHyperlink"]>> = [];
  let offset = 0;
  for (const match of text.matchAll(doiPattern)) {
    if (match.index! > offset) children.push(new TextRun(text.slice(offset, match.index)));
    children.push(new ExternalHyperlink({
      link: match[0],
      children: [new TextRun({ text: match[0], color: "0563C1", underline: {} })],
    }));
    offset = match.index! + match[0].length;
  }
  if (offset < text.length) children.push(new TextRun(text.slice(offset)));
  return children.length > 0 ? children : [new TextRun(text)];
}

function docxReaderCitationRuns(
  D: DocxModule,
  text: string,
  entries: readonly ReaderCitationEntry[],
) {
  const { InternalHyperlink, TextRun } = D;
  const clean = entries.length > 0 ? stripReaderCitationTokens(text) : text;
  if (entries.length === 0) return [new TextRun(clean)];
  const { body, punctuation } = splitTerminalPunctuation(clean);
  const group = buildReaderCitationGroup(entries);
  const markerRun = new TextRun({
    text: readerAcademicCitationMarker(group.referenceNumbers),
    size: 19,
    bold: true,
    color: DOCX_MUTED_TEAL,
    font: DOCX_CJK_FONT,
  });
  return [
    new TextRun(body),
    entries[0]
      ? new InternalHyperlink({ anchor: entries[0].anchorId, children: [markerRun] })
      : markerRun,
    new TextRun(punctuation),
  ];
}

function docxReferenceParagraphs(
  D: DocxModule,
  context: ReaderCitationContext,
): InstanceType<DocxModule["Paragraph"]>[] {
  const { Bookmark, Paragraph } = D;
  return context.entries.map((entry) => new Paragraph({
    children: [new Bookmark({
      id: entry.anchorId,
      children: [
        new D.TextRun({ text: `${entry.referenceNumber}. `, bold: true, color: DOCX_DEEP_TEAL }),
        ...referenceTextRuns(D, entry.referenceText),
      ],
    })],
    spacing: { after: 160, ...DOCX_BODY_SPACING },
    indent: {
      left: DOCX_REFERENCE_HANGING_TWIPS,
      hanging: DOCX_REFERENCE_HANGING_TWIPS,
    },
  }));
}

function docxBlock(
  D: DocxModule,
  b: ContentBlock,
  referenceSection = false,
  citationContext?: ReaderCitationContext,
): InstanceType<DocxModule["Paragraph"]>[] {
  const { Paragraph, TextRun } = D;
  switch (b.type) {
    case "paragraph":
      if (b.citationSegments?.length && citationContext) {
        return [new Paragraph({
          children: b.citationSegments.flatMap((segment) => docxReaderCitationRuns(
            D,
            segment.text,
            citationEntriesForIds(segment.citationIds, citationContext),
          )),
          spacing: { after: 160, ...DOCX_BODY_SPACING },
          indent: b.paragraphRole === "reading_guide" || /^\s*關鍵詞\s*[:：]/u.test(b.text ?? "")
            ? undefined
            : { firstLine: DOCX_BODY_FIRST_LINE_TWIPS },
        })];
      }
      // A paragraph may carry style/length lead lines joined by \n.
      return (b.text ?? "")
        .split("\n")
        .filter((t) => t.length > 0)
        .map(
          (t, index, lines) =>
            new Paragraph({
              children: referenceSection
                ? referenceTextRuns(D, t)
                : docxReaderCitationRuns(
                    D,
                    t,
                    index === lines.length - 1 && citationContext
                      ? blockReaderCitations(b, citationContext)
                      : [],
                  ),
              spacing: { after: 160, ...DOCX_BODY_SPACING },
              indent: referenceSection
                ? { left: DOCX_REFERENCE_HANGING_TWIPS, hanging: DOCX_REFERENCE_HANGING_TWIPS }
                : b.paragraphRole === "reading_guide" || /^\s*關鍵詞\s*[:：]/u.test(t)
                  ? undefined
                  : { firstLine: DOCX_BODY_FIRST_LINE_TWIPS },
            }),
        );

    case "list":
      return (b.items ?? []).map(
        (i) =>
          new Paragraph({
            children: referenceSection ? referenceTextRuns(D, i) : [new TextRun(i)],
            bullet: referenceSection ? undefined : { level: 0 },
            indent: referenceSection
              ? { left: DOCX_REFERENCE_HANGING_TWIPS, hanging: DOCX_REFERENCE_HANGING_TWIPS }
              : undefined,
            spacing: { after: 80, ...DOCX_BODY_SPACING },
          }),
      );

    case "note":
      return b.text
        ? [new Paragraph({ children: [new TextRun({ text: `※ ${b.text}`, italics: true, color: "8a6d00" })], spacing: { after: 140, ...DOCX_BODY_SPACING } })]
        : [];

    case "suggestions":
      return (b.suggestions ?? []).flatMap((s, i) => [
        new Paragraph({ children: [new TextRun({ text: `建議${b.suggestionKind} ${i + 1}：${s.title}`, bold: true })], spacing: { before: 120, after: 60, ...DOCX_BODY_SPACING } }),
        new Paragraph({ children: [new TextRun(`位置：${s.position}`)], spacing: { after: 40, ...DOCX_BODY_SPACING } }),
        new Paragraph({ children: [new TextRun(`用途：${s.purpose}`)], spacing: { after: 40, ...DOCX_BODY_SPACING } }),
        new Paragraph({ children: [new TextRun(`${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${s.content}`)], spacing: { after: 120, ...DOCX_BODY_SPACING } }),
      ]);

    case "quality":
      return (b.checks ?? []).map(
        (c) => new Paragraph({ children: [new TextRun(`${c.passed ? "✓" : "✗"} ${c.label}`)], bullet: { level: 0 }, spacing: { after: 60, ...DOCX_BODY_SPACING } }),
      );

    case "slides":
      return (b.slides ?? []).flatMap((s) => [
        new Paragraph({ children: [new TextRun({ text: `第 ${s.page} 頁：${s.title}`, bold: true })], spacing: { before: 120, after: 60, ...DOCX_BODY_SPACING } }),
        ...s.points.map((p) => new Paragraph({ children: [new TextRun(p)], bullet: { level: 0 }, spacing: { after: 40, ...DOCX_BODY_SPACING } })),
        new Paragraph({ children: [new TextRun({ text: `視覺建議：${s.visual}`, italics: true })], spacing: { after: 120, ...DOCX_BODY_SPACING } }),
      ]);

    default:
      return [];
  }
}

function docxDataTable(D: DocxModule, b: ContentBlock): (InstanceType<DocxModule["Table"]> | InstanceType<DocxModule["Paragraph"]>)[] {
  if (b.type !== "dataTable" || !b.rows?.length) return [];
  const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle } = D;
  const headerCells = ["資料類型", "需要內容", "用途", "優先程度"].map(
    (h) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })], spacing: DOCX_BODY_SPACING })],
        shading: { fill: "f1f5f9" },
      }),
  );
  const rows = [
    new TableRow({ children: headerCells, tableHeader: true, cantSplit: true }),
    ...b.rows.map(
      (r) =>
        new TableRow({
          cantSplit: true,
          children: [r.type, r.need, r.use, r.priority].map(
            (v) => new TableCell({ children: [new Paragraph({ children: [new TextRun(String(v))], spacing: DOCX_BODY_SPACING })] }),
          ),
        }),
    ),
  ];
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        left: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        right: { style: BorderStyle.SINGLE, size: 1, color: "cbd5e1" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "e2e8f0" },
      },
    }),
    new Paragraph({ children: [], spacing: { after: 120, ...DOCX_BODY_SPACING } }),
  ];
}

function docxFormalTable(
  D: DocxModule,
  table: FormalReportTable,
): (InstanceType<DocxModule["Table"]> | InstanceType<DocxModule["Paragraph"]>)[] {
  const {
    AlignmentType,
    BorderStyle,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = D;
  const weights = table.columns.length === 4
    ? [1700, 2050, 3200, 2348]
    : table.columns.map(() => Math.floor(DOCX_CONTENT_WIDTH_TWIPS / table.columns.length));
  const delta = DOCX_CONTENT_WIDTH_TWIPS - weights.reduce((sum, value) => sum + value, 0);
  if (weights.length > 0) weights[weights.length - 1] = (weights.at(-1) ?? 0) + delta;
  const cell = (text: string, columnIndex: number, header = false) =>
    new TableCell({
      width: { size: weights[columnIndex] ?? 1200, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 110, bottom: 110, left: 120, right: 120 },
      shading: header ? { fill: DOCX_DEEP_TEAL } : undefined,
      children: [
        new Paragraph({
          alignment: columnIndex === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { after: 0, line: 280, lineRule: "auto" },
          children: [
            new TextRun({
              text,
              bold: header,
              color: header ? "FFFFFF" : "243535",
              size: 19,
              font: DOCX_CJK_FONT,
            }),
          ],
        }),
      ],
    });
  return [
    new Paragraph({
      children: [new TextRun({
        text: `表 ${table.number}　${table.title}`,
        bold: true,
        size: 20,
        color: DOCX_DEEP_TEAL,
        font: DOCX_CJK_FONT,
      })],
      spacing: { before: 160, after: 80, ...DOCX_BODY_SPACING },
      keepNext: true,
    }),
    new Table({
      width: { size: DOCX_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
      indent: { size: 120, type: WidthType.DXA },
      columnWidths: weights,
      rows: [
        new TableRow({
          children: table.columns.map((heading, index) => cell(heading, index, true)),
          tableHeader: true,
          cantSplit: true,
        }),
        ...table.rows.map((row) =>
          new TableRow({
            // Evidence-trace rows can be taller than one printable page. Let
            // Word/LibreOffice split those rows so a caption is never orphaned
            // on an otherwise blank page while the whole first row is pushed
            // forward. The repeating header preserves table context.
            cantSplit: false,
            children: table.columns.map((_, index) => cell(row[index] ?? "", index)),
          }),
        ),
      ],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "9FB7B5" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "9FB7B5" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "9FB7B5" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "9FB7B5" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "D7E2E1" },
        insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "D7E2E1" },
      },
    }),
    ...[
      table.units ? `單位：${table.units}` : null,
      table.legend ? `圖例：${table.legend}` : null,
      `資料來源：${table.sourceNote}`,
      table.note ? `註：${table.note}` : null,
      `文字摘要：${table.altText}`,
    ].filter((value): value is string => Boolean(value)).map((line, index, lines) =>
      new Paragraph({
        children: [new TextRun({
          text: line,
          italics: true,
          size: 18,
          color: "5F6F70",
          font: DOCX_CJK_FONT,
        })],
        spacing: {
          before: index === 0 ? 80 : 20,
          after: index === lines.length - 1 ? 180 : 0,
          line: 280,
          lineRule: "auto",
        },
      }),
    ),
  ];
}

function docxFormalFigure(
  D: DocxModule,
  figure: FigureSpec,
): (InstanceType<DocxModule["Table"]> | InstanceType<DocxModule["Paragraph"]>)[] {
  const {
    AlignmentType,
    BorderStyle,
    ImageRun,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = D;
  const semanticTable = semanticFigureTabulation(figure);
  const semanticDrawing = semanticFigureDrawing(figure);
  const caption = new Paragraph({
    children: [new TextRun({
      text: `圖 ${figure.number}　${figure.title}`,
      bold: true,
      size: 20,
      color: DOCX_DEEP_TEAL,
      font: DOCX_CJK_FONT,
    })],
    spacing: { before: 180, after: 80, ...DOCX_BODY_SPACING },
    keepNext: true,
  });
  const compactProportion = figure.semanticData?.kind === "proportion_facets";
  const footerLines = [
    !compactProportion && semanticDrawing ? `圖形資料：${semanticFigureDataNote(figure)}` : null,
    semanticTable ? `解讀邊界：${semanticTable.caveat}` : null,
    !compactProportion && figure.units ? `單位：${figure.units}` : null,
    !compactProportion && figure.legend.length > 0
      ? `圖例：${figure.legend.map((item) => `${item.key}＝${item.label}`).join("；")}`
      : null,
    `資料來源：${figure.sourceNote}`,
    figure.note ? `註：${figure.note}` : null,
    !compactProportion ? `文字摘要：${figure.altText}` : null,
  ].filter((value): value is string => Boolean(value));
  const footer = footerLines.map((line) => new Paragraph({
    children: [new TextRun({
      text: line,
      italics: true,
      size: 18,
      color: "5F6F70",
      font: DOCX_CJK_FONT,
    })],
    spacing: { before: 50, after: 0, line: 260, lineRule: "auto" },
  }));
  const border = { style: BorderStyle.SINGLE, size: 2, color: "C7D5D4" } as const;
  const makeCell = (
    text: string,
    width: number,
    header = false,
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT,
  ) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      shading: header ? { fill: DOCX_DEEP_TEAL } : undefined,
      children: [new Paragraph({
        alignment,
        spacing: { after: 0, line: 270, lineRule: "auto" },
        children: [new TextRun({
          text,
          bold: header,
          color: header ? "FFFFFF" : "243535",
          size: 19,
          font: DOCX_CJK_FONT,
        })],
      })],
    });

  let rows: InstanceType<DocxModule["TableRow"]>[];
  let widths: number[];
  const data = figure.data;
  if (semanticTable) {
    const columnCount = semanticTable.columns.length;
    if (columnCount === 3) {
      widths = [Math.floor(DOCX_CONTENT_WIDTH_TWIPS * 0.3), Math.floor(DOCX_CONTENT_WIDTH_TWIPS * 0.18)];
      widths.push(DOCX_CONTENT_WIDTH_TWIPS - widths[0] - widths[1]);
    } else {
      widths = Array.from({ length: columnCount }, () => Math.floor(DOCX_CONTENT_WIDTH_TWIPS / columnCount));
      widths[widths.length - 1] += DOCX_CONTENT_WIDTH_TWIPS - widths.reduce((sum, value) => sum + value, 0);
    }
    rows = [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: semanticTable.columns.map((value, index) => makeCell(value, widths[index], true, AlignmentType.CENTER)),
      }),
      ...semanticTable.rows.map((row) => new TableRow({
        cantSplit: true,
        children: semanticTable.columns.map((_, index) => makeCell(
          row[index] ?? "",
          widths[index],
          false,
          index === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        )),
      })),
    ];
  } else if (data.kind === "categorical_bar") {
    widths = [2500, 1200, DOCX_CONTENT_WIDTH_TWIPS - 3700];
    const maxValue = Math.max(1, ...data.categories.map((item) => item.value));
    rows = [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: ["類別", "數值", "相對分布"].map((value, index) => makeCell(value, widths[index], true, AlignmentType.CENTER)),
      }),
      ...data.categories.map((item) => new TableRow({
        cantSplit: true,
        children: [
          makeCell(item.label, widths[0]),
          makeCell(String(item.value), widths[1], false, AlignmentType.CENTER),
          makeCell("■".repeat(item.value === 0 ? 0 : Math.max(1, Math.round((item.value / maxValue) * 16))), widths[2]),
        ],
      })),
    ];
  } else if (data.kind === "matrix") {
    const columnCount = data.columns.length + 1;
    widths = Array.from({ length: columnCount }, () => Math.floor(DOCX_CONTENT_WIDTH_TWIPS / columnCount));
    widths[widths.length - 1] += DOCX_CONTENT_WIDTH_TWIPS - widths.reduce((sum, value) => sum + value, 0);
    rows = [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: ["範圍", ...data.columns].map((value, index) => makeCell(value, widths[index], true, AlignmentType.CENTER)),
      }),
      ...data.rows.map((row) => new TableRow({
        cantSplit: true,
        children: [row.label, ...row.values].map((value, index) => makeCell(value, widths[index], false, index === 0 ? AlignmentType.LEFT : AlignmentType.CENTER)),
      })),
    ];
  } else {
    widths = [DOCX_CONTENT_WIDTH_TWIPS];
    rows = data.nodes.map((node, index) => {
      return new TableRow({
        cantSplit: true,
        children: [makeCell(
          `${String(index + 1).padStart(2, "0")}　${node.label}${index < data.nodes.length - 1 ? "　↓" : ""}`,
          widths[0],
        )],
      });
    });
  }

  const visual = new Table({
    width: { size: DOCX_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    indent: { size: 120, type: WidthType.DXA },
    columnWidths: widths,
    rows,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
  });
  const drawingParagraph = semanticDrawing && figure.semanticData?.kind !== "proportion_facets"
    ? new Paragraph({
        alignment: AlignmentType.CENTER,
        keepNext: true,
        children: [new ImageRun({
          // PNG is the primary OOXML image so Word and LibreOffice use the
          // same deterministic rendering.  Some LibreOffice builds ignore an
          // SVG AlternateContent fallback even when the PNG relationship is
          // valid, leaving a blank figure in an otherwise healthy document.
          type: "png",
          data: semanticDrawing.png,
          transformation: {
            width: semanticDrawing.width,
            height: semanticDrawing.height,
          },
          altText: {
            name: `ResearchForge semantic figure ${figure.number}`,
            title: figure.title,
            description: figure.altText,
          },
        })],
        spacing: { after: 80, ...DOCX_BODY_SPACING },
      })
    : null;
  if (drawingParagraph) {
    return [
      caption,
      drawingParagraph,
      ...footer,
      new Paragraph({ children: [], spacing: { after: 150 } }),
    ];
  }
  return [
    caption,
    visual,
    ...footer,
    new Paragraph({ children: [], spacing: { after: 150 } }),
  ];
}

/** Build the DOCX independently from browser download side effects for QA. */
export async function buildDocxBlob(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings = DEFAULT_REPORT_PRESENTATION,
  publicationHints: PublicationExportHints = {},
): Promise<Blob> {
  const D = await import("docx");
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    PageNumber,
    Header,
    Footer,
    PageOrientation,
    SectionType,
    LineRuleType,
    TableOfContents,
  } = D;
  const canonicalDocument = buildCanonicalExportDocument(report, input);
  const citations = readerCitationContext(canonicalDocument.formalDocument, report);

  type P = InstanceType<DocxModule["Paragraph"]>;
  type T = InstanceType<DocxModule["Table"]>;

  const page = {
    size: {
      width: DOCX_A4_WIDTH_TWIPS,
      height: DOCX_A4_HEIGHT_TWIPS,
      orientation: PageOrientation.PORTRAIT,
    },
    margin: {
      top: DOCX_23_MM_TWIPS,
      right: DOCX_23_MM_TWIPS,
      bottom: DOCX_23_MM_TWIPS,
      left: DOCX_23_MM_TWIPS,
    },
  } as const;

  const formal = canonicalDocument.formalDocument;

  const cover: P[] = [
    new Paragraph({ children: [], spacing: { before: 2050 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: formal?.titlePage.reportTypeLabel ?? "研究報告",
        bold: true,
        size: 20,
        color: DOCX_GOLD,
        font: DOCX_CJK_FONT,
      })],
      spacing: { after: 260 },
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: canonicalDocument.title,
          bold: true,
          size: presentation.headingStyle === "classic" ? 56 : 52,
          color: DOCX_DEEP_TEAL,
          font: DOCX_CJK_FONT,
        }),
      ],
      spacing: { after: 180 },
    }),
    ...(formal
      ? [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: formal.titlePage.subtitle,
            size: 27,
            color: DOCX_MUTED_TEAL,
            font: DOCX_CJK_FONT,
          })],
          spacing: { after: 640 },
        })]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: canonicalDocument.metadataLine,
          size: DOCX_BODY_FONT_SIZE_HALF_POINTS,
          color: "526566",
          font: DOCX_CJK_FONT,
        }),
      ],
      spacing: { after: 140 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: canonicalDocument.classificationLine.replace("｜", "　｜　"),
          size: DOCX_BODY_FONT_SIZE_HALF_POINTS,
          color: "526566",
          font: DOCX_CJK_FONT,
        }),
      ],
      spacing: { after: 220 },
    }),
    ...(formal
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({
              text: `資料範圍：${formal.titlePage.evidenceScope}`,
              size: 19,
              color: "6A7778",
              font: DOCX_CJK_FONT,
            })],
            spacing: { after: 100 },
          }),
        ]
      : []),
  ];

  const toc = formal?.tableOfContents.length
    ? [
        new Paragraph({
          children: [new TextRun({
            text: "目錄",
            bold: true,
            size: 34,
            color: DOCX_DEEP_TEAL,
            font: DOCX_CJK_FONT,
          })],
          spacing: { after: 240, ...DOCX_BODY_SPACING },
        }),
        new Paragraph({
          children: [new TextRun({
            text: `${formal.titlePage.reportTypeLabel}　|　${formal.metadata.documentVersion}　|　${formal.metadata.generatedDate}`,
            size: 18,
            color: "6A7778",
            font: DOCX_CJK_FONT,
          })],
          spacing: { after: 60, ...DOCX_BODY_SPACING },
        }),
        new Paragraph({
          children: [new TextRun({
            text: `研究問題：${formal.metadata.researchQuestion}`,
            size: 18,
            color: "6A7778",
            font: DOCX_CJK_FONT,
          })],
          spacing: { after: 180, ...DOCX_BODY_SPACING },
        }),
        new TableOfContents("ResearchForge Table of Contents", {
          hyperlink: true,
          headingStyleRange: "1-3",
          beginDirty: true,
          cachedEntries: formal.tableOfContents.map((entry, index) => ({
            title: entry.label,
            level: entry.level,
            page: (publicationHints.tocPageNumbers?.[index] ?? 0) > 0
              ? publicationHints.tocPageNumbers?.[index]
              : undefined,
          })),
        }),
      ]
    : [];

  const body: (P | T)[] = [];
  if (canonicalDocument.shortTopic) {
    body.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `提醒：${canonicalDocument.shortTopic.message}`,
            italics: true,
            color: "8a6d00",
          }),
        ],
        spacing: { after: 120, ...DOCX_BODY_SPACING },
      }),
    );
  }
  for (const section of canonicalDocument.sections) {
    const referenceSection = isReferenceSection(section.heading);
    body.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({
          text: section.heading,
          color: DOCX_DEEP_TEAL,
          font: DOCX_CJK_FONT,
        })],
        spacing: { before: 240, after: 120, ...DOCX_BODY_SPACING },
        pageBreakBefore: true,
        keepNext: true,
      }),
    );
    if (referenceSection && citations.entries.length > 0) {
      body.push(...docxReferenceParagraphs(D, citations));
      continue;
    }
    for (const b of section.blocks) {
      if (b.type === "dataTable") body.push(...docxDataTable(D, b));
      else if (b.type === "formalTable" && b.table) body.push(...docxFormalTable(D, b.table));
      else if (b.type === "formalFigure" && b.figure) body.push(...docxFormalFigure(D, b.figure));
      else body.push(...docxBlock(D, b, referenceSection, citations));
    }
  }

  const embeddedCjkFont = await loadEmbeddedCjkFont();

  const doc = new Document({
    creator: "ResearchForge",
    title: canonicalDocument.title,
    ...(embeddedCjkFont
      ? {
          fonts: [{
            name: DOCX_EMBEDDED_CJK_FONT_FAMILY,
            data: embeddedCjkFont as unknown as Buffer,
          }],
        }
      : {}),
    customProperties: [{
      name: "ResearchForgeCjkFallbacks",
      value: REPORT_CJK_FONT_FALLBACKS.join("; "),
    }, {
      name: "ResearchForgeEmbeddedCjkFont",
      value: embeddedCjkFont ? `${DOCX_EMBEDDED_CJK_FONT_FAMILY} (OFL)` : "unavailable",
    }],
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: {
            size: DOCX_BODY_FONT_SIZE_HALF_POINTS,
            font: DOCX_CJK_FONT,
            language: DOCX_ZH_TW_LANGUAGE,
          },
          paragraph: {
            spacing: {
              line: DOCX_BODY_LINE_SPACING_TWIPS,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
        heading1: {
          run: { size: 34, bold: true, color: DOCX_DEEP_TEAL, font: DOCX_CJK_FONT, language: DOCX_ZH_TW_LANGUAGE },
          paragraph: {
            spacing: {
              line: DOCX_BODY_LINE_SPACING_TWIPS,
              lineRule: LineRuleType.AUTO,
            },
            keepNext: true,
          },
        },
        heading2: {
          run: { size: 28, bold: true, color: DOCX_MUTED_TEAL, font: DOCX_CJK_FONT, language: DOCX_ZH_TW_LANGUAGE },
          paragraph: {
            spacing: {
              line: DOCX_BODY_LINE_SPACING_TWIPS,
              lineRule: LineRuleType.AUTO,
            },
            keepNext: true,
          },
        },
        title: {
          run: { font: DOCX_CJK_FONT, language: DOCX_ZH_TW_LANGUAGE },
        },
        listParagraph: {
          run: { size: DOCX_BODY_FONT_SIZE_HALF_POINTS, font: DOCX_CJK_FONT, language: DOCX_ZH_TW_LANGUAGE },
          paragraph: {
            spacing: {
              line: DOCX_BODY_LINE_SPACING_TWIPS,
              lineRule: LineRuleType.AUTO,
            },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page,
        },
        children: cover,
      },
      {
        properties: { page },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: canonicalDocument.title,
                    size: 18,
                    color: DOCX_MUTED_TEAL,
                    font: DOCX_CJK_FONT,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "第 ", size: 18, color: DOCX_MUTED_TEAL, font: DOCX_CJK_FONT }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: DOCX_MUTED_TEAL, font: DOCX_CJK_FONT }),
                  new TextRun({ text: " 頁／共 ", size: 18, color: DOCX_MUTED_TEAL, font: DOCX_CJK_FONT }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: DOCX_MUTED_TEAL, font: DOCX_CJK_FONT }),
                  new TextRun({ text: " 頁", size: 18, color: DOCX_MUTED_TEAL, font: DOCX_CJK_FONT }),
                ],
              }),
            ],
          }),
        },
        children: [...toc, ...body],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function downloadDocx(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings = DEFAULT_REPORT_PRESENTATION,
) {
  const blob = await buildDocxBlob(report, input, presentation);
  triggerDownload(blob, `${safeFileName(input.topic)}.docx`);
}

// ─── Deterministic server-rendered PDF ─────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function linkifyDoiHtml(value: string): string {
  const escaped = escapeHtml(value);
  return escaped.replace(
    /https:\/\/doi\.org\/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/giu,
    (url) => `<a class="doi-link" href="${url}">${url}</a>`,
  );
}

function formalFigureToHtml(figure: FigureSpec): string {
  const metadata = [
    figure.units ? `<span>單位：${escapeHtml(figure.units)}</span>` : "",
    figure.legend.length > 0
      ? `<span>圖例：${figure.legend.map((item) => `${escapeHtml(item.key)}＝${escapeHtml(item.label)}`).join("；")}</span>`
      : "",
  ].filter(Boolean).join("<br />");
  let visual = "";
  const data = figure.data;
  const semantic = figure.semanticData;
  const semanticTable = semanticFigureTabulation(figure);
  if (semantic?.kind === "proportion_facets") {
    visual = `<div class="rf-proportion-panels">${semantic.panels.map((panel) => (
      `<div class="rf-proportion-panel"><div class="rf-panel-heading"><strong>${escapeHtml(panel.label)}</strong><span>${semanticNumber(panel.value)}%</span></div>` +
      `<div class="rf-proportion-axis"><i style="left:${Math.max(0, Math.min(100, panel.value))}%"></i><b class="tick-zero">0</b><b class="tick-mid">50</b><b class="tick-max">100%</b></div>` +
      `<small>${escapeHtml(readerMetricLabel(panel.metric))}｜${escapeHtml(panel.sampleDefinition)}</small></div>`
    )).join("")}</div>`;
  } else if (semantic?.kind === "forest_plot") {
    const bounds = semantic.rows.flatMap((row) => [row.lowerBound, row.upperBound, semantic.referenceValue]).filter((value) => value > 0);
    const minimum = Math.min(...(bounds.length > 0 ? bounds : [0.5]));
    const maximum = Math.max(...(bounds.length > 0 ? bounds : [2]));
    const logMinimum = Math.log(minimum);
    const logRange = Math.max(0.000001, Math.log(maximum) - logMinimum);
    const position = (value: number) => Math.max(0, Math.min(100, ((Math.log(value) - logMinimum) / logRange) * 100));
    const diagram = (row: (typeof semantic.rows)[number]) => {
      const width = 31;
      const indexAt = (value: number) => Math.round((position(value) / 100) * (width - 1));
      const lower = indexAt(row.lowerBound);
      const upper = indexAt(row.upperBound);
      const estimate = indexAt(row.estimate);
      const reference = indexAt(semantic.referenceValue);
      const glyphs = Array.from({ length: width }, () => " ");
      for (let index = lower; index <= upper; index += 1) glyphs[index] = "─";
      glyphs[reference] = "│";
      glyphs[estimate] = "◆";
      return glyphs.join("");
    };
    visual = `<div class="rf-forest">${semantic.rows.map((row) => {
      return `<div class="rf-forest-row"><span class="rf-forest-label">${escapeHtml(row.label)}</span>` +
        `<span class="rf-forest-track">${diagram(row)}</span>` +
        `<span class="rf-forest-value">OR ${semanticNumber(row.estimate)}（${semanticNumber(row.lowerBound)}–${semanticNumber(row.upperBound)}）</span></div>`;
    }).join("")}</div>`;
  } else if (semantic?.kind === "correlation_structure") {
    const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
    visual = `<div class="rf-semantic-graph">${semantic.links.map((link) => (
      `<div class="rf-semantic-edge"><span>${escapeHtml(labelById.get(link.from) ?? link.from)}</span><strong>↔<small>r = ${semanticNumber(link.value)}</small></strong><span>${escapeHtml(labelById.get(link.to) ?? link.to)}</span></div>`
    )).join("")}</div>`;
  } else if (semantic?.kind === "mediation_path") {
    const labelById = new Map(semantic.nodes.map((node) => [node.id, node.label]));
    visual = `<div class="rf-semantic-graph">${semantic.edges.map((edge) => (
      `<div class="rf-semantic-edge"><span>${escapeHtml(labelById.get(edge.from) ?? edge.from)}</span><strong>→<small>${escapeHtml(edge.label)}</small></strong><span>${escapeHtml(labelById.get(edge.to) ?? edge.to)}</span></div>`
    )).join("")}</div>`;
  } else if (semanticTable) {
    visual = `<table class="rf-semantic-table"><thead><tr>${semanticTable.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>` +
      `<tbody>${semanticTable.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  } else if (data.kind === "categorical_bar") {
    const maxValue = Math.max(1, ...data.categories.map((item) => item.value));
    visual = `<div class="rf-bars">${data.categories.map((item) => (
      `<div class="rf-bar-row"><span class="rf-bar-label">${escapeHtml(item.label)}</span>` +
      `<span class="rf-bar-track"><span class="rf-bar-fill">${"■".repeat(item.value === 0 ? 0 : Math.max(1, Math.round((item.value / maxValue) * 12)))}</span></span>` +
      `<strong class="rf-bar-value">${item.value}</strong></div>`
    )).join("")}</div>`;
  } else if (data.kind === "matrix") {
    visual = `<table class="rf-matrix"><thead><tr><th>範圍</th>${data.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>` +
      `<tbody>${data.rows.map((row) => `<tr><th>${escapeHtml(row.label)}</th>${row.values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  } else {
    visual = `<ol class="rf-workflow">${data.nodes.map((node, index) => (
      `<li><span class="rf-workflow-index">${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(node.label)}</strong>${index < data.nodes.length - 1 ? '<i aria-hidden="true">→</i>' : ""}</li>`
    )).join("")}</ol>`;
  }
  return `<figure class="rf-figure">` +
    `<figcaption>圖 ${figure.number}　${escapeHtml(figure.title)}</figcaption>${visual}` +
    `${semanticTable ? `<p class="semantic-caveat">解讀邊界：${escapeHtml(semanticTable.caveat)}</p>` : ""}` +
    `${metadata ? `<p class="figure-meta">${metadata}</p>` : ""}` +
    `<p class="source-note">資料來源：${escapeHtml(figure.sourceNote)}</p>` +
    `${figure.note ? `<p class="source-note">註：${escapeHtml(figure.note)}</p>` : ""}` +
    `<p class="figure-alt">文字摘要：${escapeHtml(figure.altText)}</p></figure>`;
}

function readerCitationHtml(
  text: string,
  entries: readonly ReaderCitationEntry[],
): string {
  const clean = entries.length > 0 ? stripReaderCitationTokens(text) : text;
  const { body, punctuation } = splitTerminalPunctuation(clean);
  const group = buildReaderCitationGroup(entries);
  const citationCluster = entries.length > 0
    ? `<span class="citation-cluster"><a href="#${entries[0]!.anchorId}">${escapeHtml(readerAcademicCitationMarker(group.referenceNumbers))}</a></span>`
    : "";
  return `${escapeHtml(body)}${citationCluster}${escapeHtml(punctuation)}`;
}

function referenceEntriesToHtml(context: ReaderCitationContext): string {
  return context.entries.map((entry) => (
    `<p id="${entry.anchorId}" class="reference-entry"><span class="reference-index">${entry.referenceNumber}.</span>${linkifyDoiHtml(entry.referenceText)}</p>`
  )).join("");
}

function blockToHtml(
  b: ContentBlock,
  citationContext?: ReaderCitationContext,
): string {
  switch (b.type) {
    case "paragraph":
      return (b.text ?? "")
        .split("\n")
        .filter((t) => t.length > 0)
        .map((t, index, lines) => {
          const narrativeClass = b.paragraphRole === "reading_guide" || /^\s*關鍵詞\s*[:：]/u.test(t)
            ? ""
            : ' class="narrative"';
          const content = index === lines.length - 1 && citationContext && b.citationSegments?.length
            ? b.citationSegments.map((segment) => readerCitationHtml(
                segment.text,
                citationEntriesForIds(segment.citationIds, citationContext),
              )).join("")
            : readerCitationHtml(
                t,
                index === lines.length - 1 && citationContext
                  ? blockReaderCitations(b, citationContext)
                  : [],
              );
          return `<p${narrativeClass}>${content}</p>`;
        })
        .join("");
    case "list":
      return `<ul>${(b.items ?? []).map((i) => `<li>${linkifyDoiHtml(i)}</li>`).join("")}</ul>`;
    case "note":
      return b.text ? `<p class="note">※ ${escapeHtml(b.text)}</p>` : "";
    case "suggestions":
      return (b.suggestions ?? [])
        .map(
          (s, i) =>
            `<div class="sugg"><strong>建議${b.suggestionKind} ${i + 1}：${escapeHtml(s.title)}</strong>` +
            `<div>位置：${escapeHtml(s.position)}</div><div>用途：${escapeHtml(s.purpose)}</div>` +
            `<div>${b.suggestionKind === "流程圖" ? "流程" : "內容"}：${escapeHtml(s.content)}</div></div>`,
        )
        .join("");
    case "dataTable":
      return (
        `<table><thead><tr><th>資料類型</th><th>需要內容</th><th>用途</th><th>優先程度</th></tr></thead><tbody>` +
        (b.rows ?? [])
          .map((r) => `<tr><td>${escapeHtml(r.type)}</td><td>${escapeHtml(r.need)}</td><td>${escapeHtml(r.use)}</td><td>${escapeHtml(r.priority)}</td></tr>`)
          .join("") +
        `</tbody></table>`
      );
    case "formalTable": {
      const table = b.table;
      if (!table) return "";
      const metadata = [
        table.units ? `<span>單位：${escapeHtml(table.units)}</span>` : "",
        table.legend ? `<span>圖例：${escapeHtml(table.legend)}</span>` : "",
      ].filter(Boolean).join("<br />");
      return (
        `<figure class="rf-table"><figcaption>表 ${table.number}　${escapeHtml(table.title)}</figcaption>` +
        `<table><thead><tr>${table.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>` +
        table.rows
          .map((row) => `<tr>${table.columns.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`)
          .join("") +
        `</tbody></table>${metadata ? `<p class="table-meta">${metadata}</p>` : ""}` +
        `<p class="source-note">資料來源：${escapeHtml(table.sourceNote)}</p>` +
        `${table.note ? `<p class="source-note">註：${escapeHtml(table.note)}</p>` : ""}` +
        `<p class="figure-alt">文字摘要：${escapeHtml(table.altText)}</p></figure>`
      );
    }
    case "formalFigure":
      return b.figure ? formalFigureToHtml(b.figure) : "";
    case "quality":
      return `<ul class="checks">${(b.checks ?? []).map((c) => `<li>${c.passed ? "✓" : "✗"} ${escapeHtml(c.label)}</li>`).join("")}</ul>`;
    case "slides":
      return (b.slides ?? [])
        .map(
          (s) =>
            `<div class="slide"><strong>第 ${s.page} 頁：${escapeHtml(s.title)}</strong>` +
            `<ul>${s.points.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` +
            `<div class="visual">視覺建議：${escapeHtml(s.visual)}</div></div>`,
        )
        .join("");
    default:
      return "";
  }
}

export function buildPrintHtml(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings,
  publicationHints: PublicationExportHints = {},
): string {
  const canonicalDocument = buildCanonicalExportDocument(report, input);
  const citations = readerCitationContext(canonicalDocument.formalDocument, report);
  const normalizedPresentation = normalizeReportPresentation(presentation);
  const fontFamily = reportFontOptionById(normalizedPresentation.fontId).fontFamily;
  const sectionsHtml = canonicalDocument.sections
    .map(
      (s, index) => {
        const referenceSection = isReferenceSection(s.heading);
        const body = referenceSection && citations.entries.length > 0
          ? referenceEntriesToHtml(citations)
          : s.blocks.map((block) => blockToHtml(block, citations)).join("");
        return `<section id="rf-section-${index + 1}"${referenceSection ? ' class="references"' : ""}><h1>${escapeHtml(s.heading)}</h1>${body}</section>`;
      },
    )
    .join("");
  const formal = canonicalDocument.formalDocument;
  const tocHtml = formal?.tableOfContents.length
    ? `<section class="toc"><h2>目錄</h2><div class="toc-meta"><strong>${escapeHtml(formal.titlePage.reportTypeLabel)}</strong><span>${escapeHtml(`${formal.metadata.documentVersion}　|　${formal.metadata.generatedDate}`)}</span><span>研究問題：${escapeHtml(formal.metadata.researchQuestion)}</span></div>${formal.tableOfContents
        .map((entry, index) => `<p><a href="#rf-section-${index + 1}"><span>${escapeHtml(entry.label)}</span><b>${publicationHints.tocPageNumbers?.[index] ?? ""}</b></a></p>`)
        .join("")}</section>`
    : "";
  const shortTopicHtml = canonicalDocument.shortTopic
    ? `<p class="note">提醒：${escapeHtml(canonicalDocument.shortTopic.message)}</p>`
    : "";

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8" /><link rel="icon" href="data:," />
<title>${escapeHtml(canonicalDocument.title)}</title>
<style>
  @page { size: A4; margin: 23mm 23mm 24mm; }
  * { box-sizing: border-box; }
  body { font-family:${REPORT_CJK_FONT_STACK},${fontFamily}; color:#${RESEARCHFORGE_PUBLICATION_LAYOUT.color.ink}; line-height:${Math.min(1.7, Math.max(RESEARCHFORGE_PUBLICATION_LAYOUT.typography.bodyLineHeight, normalizedPresentation.lineHeight))}; font-size:${Math.min(14.67, normalizedPresentation.fontSizePx)}px; margin:0; }
  .cover { text-align:center; padding:28vh 0 0; page-break-after:always; }
  .cover .kicker { color:#a3833b; font-size:10pt; font-weight:700; letter-spacing:0.12em; margin:0 0 20px; }
  .cover h1 { color:#173f42; font-size:${normalizedPresentation.headingStyle === "classic" ? "28pt" : "26pt"}; line-height:1.35; margin:0 0 12px; letter-spacing:${normalizedPresentation.headingStyle === "modern" ? "0.02em" : "0"}; }
  .cover .subtitle { color:#416b6c; font-size:13pt; margin:0 0 52px; }
  .cover .meta { color:#526566; font-size:10.5pt; margin:6px 0; }
  .cover .scope { color:#6a7778; font-size:9.5pt; margin:10px 0 0; }
  .toc { padding-top:10mm; }
  .toc-meta { display:grid; grid-template-columns:auto 1fr; gap:4px 18px; margin:0 0 18px; padding:12px 14px; border-left:2px solid #a3833b; color:#5f6f70; font-size:8.5pt; }
  .toc-meta span:last-child { grid-column:1 / -1; }
  .toc p { border-bottom:1px dotted #c7d3d2; padding:6px 0 4px; margin:0; }
  .toc a { color:#314849; text-decoration:none; display:flex; justify-content:space-between; gap:12px; }
  .toc a b { color:#5f6f70; font-weight:500; padding-left:10px; font-variant-numeric:tabular-nums; }
  h2, section[id^="rf-section-"] > h1 { color:#173f42; font-size:${normalizedPresentation.headingStyle === "classic" ? "16pt" : "15pt"}; border-bottom:1px solid #a3833b; padding-bottom:5px; margin:24px 0 12px; page-break-after:avoid; break-after:avoid-page; letter-spacing:${normalizedPresentation.headingStyle === "modern" ? "0.012em" : "0"}; }
  p { margin:0 0 ${Math.min(8, normalizedPresentation.paragraphSpacingPx)}px; orphans:2; widows:2; }
  p.narrative { text-indent:2em; }
  ul { margin:0 0 12px; padding-left:22px; }
  li { margin:0 0 5px; }
  p, li, td { overflow-wrap:anywhere; word-break:break-word; }
  .references ul { list-style:none; padding-left:0; }
  .references p, .references li { padding-left:2em; text-indent:-2em; overflow-wrap:anywhere; word-break:break-word; }
  .reference-entry { break-inside:avoid; page-break-inside:avoid; position:relative; }
  .reference-index { display:inline-block; min-width:2em; color:#416b6c; font-weight:700; }
  .citation-cluster { white-space:nowrap; color:#416b6c; font-size:0.88em; line-height:inherit; margin-left:0.22em; vertical-align:baseline; font-weight:600; }
  .citation-cluster a { color:inherit; text-decoration:none; }
  a.doi-link { color:#416b6c; text-decoration:none; border-bottom:1px dotted #9fb7b5; overflow-wrap:anywhere; word-break:break-all; }
  .note { background:#fbf7ec; border-left:3px solid #a3833b; padding:7px 11px; color:#765f27; }
  .sugg, .slide { border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; margin:0 0 10px; }
  .visual { color:#64748b; font-size:10.5pt; }
  .table-caption { color:#173f42; font-size:10.5pt; font-weight:700; margin:16px 0 7px; page-break-after:avoid; }
  .rf-table { margin:18px 0 20px; break-inside:auto; page-break-inside:auto; }
  .rf-table figcaption { color:#173f42; font-size:10.5pt; font-weight:700; margin:0 0 8px; break-after:avoid; page-break-after:avoid; }
  .table-meta { color:#627273; font-size:8.7pt; margin:4px 0; }
  .source-note { color:#627273; font-size:8.7pt; font-style:normal; margin:4px 0 16px; break-before:avoid; page-break-before:avoid; }
  .rf-figure { margin:18px 0 20px; break-inside:avoid; page-break-inside:avoid; }
  .rf-figure figcaption { color:#173f42; font-size:10.5pt; font-weight:700; margin:0 0 8px; }
  .rf-bars { border:1px solid #b9c9c7; padding:12px; }
  .rf-bar-row { display:grid; grid-template-columns:minmax(105px,1.2fr) 3fr 34px; gap:8px; align-items:center; margin:7px 0; }
  .rf-bar-label { font-size:8.8pt; }
  .rf-bar-track { display:block; min-height:17px; background:#e4eceb; border-radius:2px; overflow:hidden; }
  .rf-bar-fill { display:block; color:#416b6c; letter-spacing:1px; line-height:17px; white-space:nowrap; }
  .rf-bar-value { text-align:right; font-size:9pt; }
  .rf-matrix th:first-child { background:#eef3f2; color:#243535; }
  .rf-matrix td { text-align:center; }
  .rf-graph { border:1px solid #b9c9c7; padding:10px; }
  .rf-edge { display:grid; grid-template-columns:1fr 24px 1fr; align-items:center; gap:5px; margin:6px 0; text-align:center; }
  .rf-edge span { border:1px solid #9fb7b5; padding:6px; border-radius:4px; background:#f3f7f6; }
  .rf-edge small { grid-column:1 / -1; color:#627273; }
  .rf-workflow { list-style:none; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px 18px; margin:0; padding:14px; border:1px solid #b9c9c7; counter-reset:workflow; }
  .rf-workflow li { position:relative; min-height:72px; padding:12px 10px 10px; border-top:2px solid #416b6c; background:#f3f7f6; break-inside:avoid; }
  .rf-workflow-index { display:block; margin-bottom:7px; color:#a3833b; font-size:8pt; font-variant-numeric:tabular-nums; letter-spacing:0.08em; }
  .rf-workflow strong { display:block; color:#243535; font-size:9pt; font-weight:600; line-height:1.45; }
  .rf-workflow i { position:absolute; right:-15px; top:30px; color:#416b6c; font-size:12pt; font-style:normal; }
  .rf-workflow li:nth-child(4) i { display:none; }
  .rf-proportion-panels { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }
  .rf-proportion-panel { border:1px solid #b9c9c7; border-top:3px solid #416b6c; padding:16px 18px; break-inside:avoid; background:#fff; }
  .rf-panel-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; font-size:9.5pt; }
  .rf-panel-heading span { color:#173f42; font-size:22pt; font-weight:700; line-height:1; }
  .rf-proportion-axis { position:relative; height:28px; margin:18px 4px 12px; border-top:1px solid #9fb7b5; }
  .rf-proportion-axis i { position:absolute; top:-6px; width:11px; height:11px; border:2px solid #fff; border-radius:50%; background:#416b6c; transform:translateX(-50%); box-shadow:0 0 0 1px #416b6c; }
  .rf-proportion-axis b { position:absolute; top:7px; color:#627273; font-size:7.5pt; font-weight:500; }
  .rf-proportion-axis .tick-zero { left:0; }
  .rf-proportion-axis .tick-mid { left:50%; transform:translateX(-50%); }
  .rf-proportion-axis .tick-max { right:0; }
  .rf-proportion-panel small { color:#627273; font-size:8pt; }
  .rf-forest { border:1px solid #b9c9c7; padding:10px; }
  .rf-forest-row { display:grid; grid-template-columns:minmax(90px,1.2fr) minmax(180px,2fr) minmax(125px,1.3fr); gap:9px; align-items:center; margin:9px 0; font-size:8.5pt; break-inside:avoid; }
  .rf-forest-track { display:block; min-height:18px; padding:1px 4px; background:#f3f7f6; color:#173f42; font-family:monospace; white-space:pre; overflow:hidden; }
  .rf-forest-value { font-variant-numeric:tabular-nums; }
  .rf-semantic-graph { border:1px solid #b9c9c7; padding:10px; }
  .rf-semantic-edge { display:grid; grid-template-columns:1fr minmax(64px,.7fr) 1fr; gap:8px; align-items:center; margin:8px 0; text-align:center; break-inside:avoid; }
  .rf-semantic-edge span { border:1px solid #9fb7b5; padding:7px; background:#f3f7f6; }
  .rf-semantic-edge strong { display:flex; flex-direction:column; color:#173f42; }
  .rf-semantic-edge small { color:#627273; font-weight:400; }
  .semantic-caveat { color:#765f27; background:#fbf7ec; border-left:3px solid #a3833b; padding:6px 8px; margin:6px 0; font-size:8.5pt; }
  .figure-meta, .figure-alt { color:#627273; font-size:8.7pt; margin:4px 0; }
  .figure-alt { height:0; max-height:0; margin:0; padding:0; border:0; overflow:hidden; font-size:0; line-height:0; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; margin:0; font-size:9pt; page-break-inside:auto; }
  thead { display:table-header-group; }
  tr { break-inside:avoid; page-break-inside:avoid; }
  th, td { border:1px solid #b9c9c7; padding:7px 8px; text-align:left; vertical-align:middle; }
  th { background:#173f42; color:#fff; font-weight:700; }
  section { break-inside:auto; }
  section[id^="rf-section-"] { break-before:page; page-break-before:always; }
  section[id^="rf-section-"] > h2 { margin-top:0; }
</style></head>
<body>
  <div class="cover">
    <p class="kicker">${escapeHtml(formal?.titlePage.reportTypeLabel ?? "研究報告")}</p>
    <h1>${escapeHtml(canonicalDocument.title)}</h1>
    ${formal ? `<p class="subtitle">${escapeHtml(formal.titlePage.subtitle)}</p>` : ""}
    <div class="meta">${escapeHtml(canonicalDocument.metadataLine)}</div>
    <div class="meta">${escapeHtml(canonicalDocument.classificationLine.replace("｜", "　｜　"))}</div>
    ${formal ? `<p class="scope">資料範圍：${escapeHtml(formal.titlePage.evidenceScope)}</p>` : ""}
  </div>
  ${tocHtml}
  ${shortTopicHtml}
  ${sectionsHtml}
</body></html>`;
}

export class PdfExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExportError";
  }
}

export interface PdfDownloadDependencies {
  fetchImpl?: typeof fetch;
  saveBlob?: (blob: Blob, filename: string) => void;
}

function reportExportApiUrl(path: string): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const base = env?.VITE_API_BASE_URL?.trim();
  if (!base) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/+$/, "")}${normalizedPath}`;
}

function pdfErrorMessage(status: number): string {
  if (status === 413) return "報告內容過長，無法產生 PDF。";
  if (status === 422) return "報告內容未通過 PDF 安全檢查。";
  if (status === 504) return "PDF 產生逾時，請稍後再試。";
  return "伺服器無法產生 PDF，請稍後再試。";
}

export async function downloadPdf(
  report: GeneratedReport,
  input: ReportInput,
  presentation: ReportPresentationSettings = DEFAULT_REPORT_PRESENTATION,
  dependencies: PdfDownloadDependencies = {},
): Promise<void> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(reportExportApiUrl("/api/report-exports/pdf"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: buildPrintHtml(report, input, presentation),
        filename: `${safeFileName(input.topic)}.pdf`,
        exportGateProof: report.meta.formalExportProof,
      }),
    });
  } catch (error) {
    if (error instanceof ReportExportIntegrityError) throw error;
    throw new PdfExportError("無法連線至 PDF 產生服務。");
  }

  if (!response.ok) throw new PdfExportError(pdfErrorMessage(response.status));
  if (!/^application\/pdf\b/iu.test(response.headers.get("content-type") ?? "")) {
    throw new PdfExportError("伺服器回傳的檔案不是有效的 PDF。");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    bytes.byteLength < 5 ||
    String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-"
  ) {
    throw new PdfExportError("伺服器回傳的 PDF 檔案不完整。");
  }

  const pdfBlob = new Blob([bytes], { type: "application/pdf" });
  (dependencies.saveBlob ?? triggerDownload)(
    pdfBlob,
    `${safeFileName(input.topic)}.pdf`,
  );
}
