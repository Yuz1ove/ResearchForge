import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GeneratedReport, ReportInput } from "./generateReport.ts";
import {
  assertReportExportAllowed,
  buildDocxBlob,
  buildMarkdown,
  buildPrintHtml,
} from "./exportReport.ts";

const require = createRequire(import.meta.url);
const docxCjkFontPath = require.resolve(
  "@expo-google-fonts/noto-sans-tc/400Regular/NotoSansTC_400Regular.ttf",
);

function reportInput(): ReportInput {
  return {
    topic: "都市熱島效應與校園熱舒適度",
    reportType: "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
    researchDepth: "standard",
    purpose: "學校作業",
    domainOverride: "",
    mode: "先建立報告架構",
    sourceRequirement: "需要，並生成參考文獻格式",
    citationFormat: "APA",
    chartRequirement: "需要",
    style: "高中生自然報告風格",
    length: "一般報告",
    wordCount: "",
    formalTone: "不需要",
    conversationalTone: "不需要",
    specifiedStructure: "",
    rubric: "",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "",
    acceptedSources: [],
  };
}

function canonicalReport(): GeneratedReport {
  return {
    meta: {
      title: "都市熱島效應與校園熱舒適度研究報告",
      category: "自然科學",
      versionLabel: "短版研究報告",
      completeness: 82,
      suggestedAdditions: [],
      acceptedSources: [],
      bibliography: [],
      acceptedSourceCount: 3,
      usedSourceCount: 2,
      usedSourceIds: ["source-1", "source-2"],
      citedSourceIds: ["source-1", "source-2"],
      evidenceSufficiency: "short_ready",
      exportAllowed: true,
      citationIntegrity: { valid: true, errors: [] },
    },
    sections: [
      {
        heading: "摘要",
        blocks: [{
          type: "paragraph",
          text: "校園鋪面與遮蔭配置會影響熱環境，本報告僅整理可追溯證據[S1]。",
        }],
      },
      {
        heading: "研究方法",
        blocks: [{
          type: "list",
          items: ["比對氣溫與地表溫度", "記錄樹蔭與建築遮蔭"],
        }],
      },
      {
        heading: "觀測資料",
        blocks: [{
          type: "dataTable",
          rows: [{
            type: "溫度",
            need: "逐時氣溫與地表溫度",
            use: "比較不同場域",
            priority: "高",
          }],
        }],
      },
      {
        heading: "參考資料",
        blocks: [{
          type: "paragraph",
          text: "[S1] 王小明（2024）。校園熱環境研究。https://doi.org/10.1000/heat-island\n[S2] 教育部氣候調適資料。https://example.edu.tw/climate",
        }],
      },
    ],
  };
}

test("limited drafts cannot be exported", () => {
  const report = canonicalReport();
  report.meta.exportAllowed = false;
  report.meta.isLimitedDraft = true;
  assert.throws(() => assertReportExportAllowed(report), /證據有限／不完整草稿/);
});

test("screen, DOCX, Markdown, and PDF print use the same canonical Traditional Chinese content", async () => {
  const report = canonicalReport();
  const input = reportInput();
  const markdown = buildMarkdown(report, input);
  const printableHtml = buildPrintHtml(report, input);
  const embeddedCjkFontData = new Uint8Array(await readFile(docxCjkFontPath));
  const blob = await buildDocxBlob(report, input, undefined, embeddedCjkFontData);
  const workDir = await mkdtemp(join(tmpdir(), "researchforge-docx-test-"));
  const docxPath = join(workDir, "canonical-zh-tw.docx");

  try {
    await writeFile(docxPath, Buffer.from(await blob.arrayBuffer()));
    const documentXml = execFileSync("unzip", ["-p", docxPath, "word/document.xml"], {
      encoding: "utf8",
    });
    const stylesXml = execFileSync("unzip", ["-p", docxPath, "word/styles.xml"], {
      encoding: "utf8",
    });
    const fontTableXml = execFileSync("unzip", ["-p", docxPath, "word/fontTable.xml"], {
      encoding: "utf8",
    });
    const zipEntries = execFileSync("unzip", ["-Z1", docxPath], { encoding: "utf8" });

    for (const text of [
      "都市熱島效應與校園熱舒適度研究報告",
      "校園鋪面與遮蔭配置會影響熱環境",
      "比對氣溫與地表溫度",
      "逐時氣溫與地表溫度",
      "https://doi.org/10.1000/heat-island",
      "https://example.edu.tw/climate",
      "[S1]",
      "[S2]",
    ]) {
      assert.match(markdown, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(documentXml.includes(text), true, `DOCX should contain ${text}`);
      assert.equal(printableHtml.includes(text), true, `print/PDF HTML should contain ${text}`);
    }
    assert.match(stylesXml, /w:eastAsia="Noto Sans TC"/);
    assert.match(stylesXml, /w:hint="eastAsia"/);
    assert.match(stylesXml, /w:eastAsia="zh-TW"/);
    assert.match(fontTableXml, /w:name="Noto Sans TC"/);
    assert.match(fontTableXml, /w:embedRegular\s+r:id=/);
    assert.match(zipEntries, /word\/fonts\/font1\.odttf/);
    assert.doesNotMatch(documentXml, /provider_status|evidenceCardIds|workflowId|debug/iu);
    assert.equal((documentXml.match(/[\u3400-\u9fff]/gu) ?? []).length > 60, true);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
