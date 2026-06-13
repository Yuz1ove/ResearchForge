import assert from "node:assert/strict";
import test from "node:test";
import { runDocxPlugin } from "../plugins/docxPlugin.ts";
import { defaultPluginRegistry } from "../plugins/registry.ts";
import { runResearchWritingFlowSync } from "./runResearchWritingFlow.ts";

const topic = "短影音使用對高中生注意力與睡眠品質之影響";
const expectedAcademicSectionHeadings = [
  "摘要",
  "研究背景",
  "研究動機",
  "研究目的",
  "研究問題",
  "研究假設",
  "文獻探討架構",
  "研究方法",
  "研究變項",
  "預計圖表",
  "研究限制",
  "結論",
  "資料來源待補",
];

test("runs research writing flow through plugin registry into report document schema and DOCX blob", async () => {
  const orchestratorEntry = defaultPluginRegistry.get("research-writing-orchestrator-v1");
  const docxEntry = defaultPluginRegistry.get("export-pipeline-v1");

  assert.equal(orchestratorEntry?.manifest.status, "alpha");
  assert.equal(docxEntry?.manifest.status, "alpha");
  assert.equal(typeof orchestratorEntry?.execute, "function");
  assert.equal(typeof docxEntry?.execute, "function");

  const flow = runResearchWritingFlowSync({
    topic,
    reportType: "研究報告",
  });

  assert.equal(flow.document.schemaVersion, "report-document-v1");
  assert.equal(flow.document.title, `《${topic}》研究報告`);
  assert.equal(flow.document.meta.intent, "academic_research_report");
  assert.equal(flow.document.reportType, "研究報告");
  assert.deepEqual(flow.document.sections.map((section) => section.title), expectedAcademicSectionHeadings);
  assert.ok(flow.sections.abstract.blocks.length > 0);
  assert.ok(flow.report.sections.some((section) => section.heading === "資料來源待補"));
  assert.ok(flow.warnings.some((warning) => warning.includes("citation") || warning.includes("引用")));

  const docxResult = await runDocxPlugin({
    document: flow.document,
    mode: "blob",
  });

  assert.equal(docxResult.format, "docx");
  assert.equal(docxResult.downloaded, false);
  assert.ok(docxResult.blob);
  assert.ok(docxResult.blob.size > 1000);
});

test("generates paragraph-level academic report content instead of a thin outline", () => {
  const flow = runResearchWritingFlowSync({
    topic,
    reportType: "研究報告",
  });
  const paragraphs = flow.document.sections
    .flatMap((section) => section.blocks)
    .filter((block) => block.type === "paragraph")
    .map((block) => block.text ?? "")
    .filter((text) => text.length >= 45);
  const fullText = documentText(flow.document);

  assert.ok(paragraphs.length >= 10);
  assert.match(fullText, /待補來源|需查證/);
  assert.doesNotMatch(fullText, /只產生研究寫作架構/);
});

test("source placeholder section avoids fake URLs and fake citation records", () => {
  const flow = runResearchWritingFlowSync({
    topic,
    reportType: "研究報告",
  });
  const sourceText = sectionText(requiredSection(flow.document, "資料來源待補"));

  assert.match(sourceText, /待補來源/);
  assert.match(sourceText, /不得編造|不生成任何假引用/);
  assert.doesNotMatch(sourceText, /https?:\/\/|www\.|doi\.org|10\.\d{4,9}\//i);
  assert.doesNotMatch(sourceText, /[A-Z][a-z]+,\s[A-Z]\.\s\(\d{4}\)/);
});

test("short video topic produces attention and sleep-related variables", () => {
  const flow = runResearchWritingFlowSync({
    topic,
    reportType: "研究報告",
  });
  const variablesText = sectionText(requiredSection(flow.document, "研究變項"));

  assert.match(variablesText, /自變項：短影音使用/);
  assert.match(variablesText, /依變項：注意力/);
  assert.match(variablesText, /依變項：睡眠品質/);
  assert.match(variablesText, /控制或脈絡變項：高中生/);
  assert.doesNotMatch(variablesText, /生注意力/);
});

test("uses default research report type and rejects empty topic clearly", () => {
  const flow = runResearchWritingFlowSync({ topic });

  assert.equal(flow.document.reportType, "研究報告");

  assert.throws(
    () => runResearchWritingFlowSync({ topic: "   " }),
    /requires a non-empty topic/,
  );
});

test("DOCX plugin creates a safe fallback document for empty content", async () => {
  const result = await runDocxPlugin({
    mode: "blob",
    document: {
      schemaVersion: "report-document-v1",
      title: "空內容測試",
      topic: "空內容測試",
      reportType: "研究報告",
      language: "zh-Hant",
      sections: [
        {
          id: "empty",
          title: "空章節",
          blocks: [],
        },
      ],
      warnings: [],
      citationPolicy: {
        style: "APA",
        allowPlaceholders: true,
        noFabricatedCitations: true,
      },
      meta: {},
    },
  });

  assert.equal(result.format, "docx");
  assert.ok(result.blob);
  assert.ok(result.blob.size > 1000);
  assert.ok(result.warnings.some((warning) => warning.includes("empty_document_fallback")));
});

type ReportDocumentForTest = ReturnType<typeof runResearchWritingFlowSync>["document"];
type ReportDocumentSectionForTest = ReportDocumentForTest["sections"][number];

function requiredSection(document: ReportDocumentForTest, heading: string): ReportDocumentSectionForTest {
  const section = document.sections.find((item) => item.title === heading);
  assert.ok(section, `Expected section heading: ${heading}`);
  return section;
}

function documentText(document: ReportDocumentForTest): string {
  return document.sections.map(sectionText).join("\n");
}

function sectionText(section: ReportDocumentSectionForTest): string {
  return section.blocks
    .flatMap((block) => [
      block.text ?? "",
      ...(block.items ?? []),
      ...(block.checks ?? []).map((check) => `${check.label} ${check.reason ?? ""}`),
    ])
    .join("\n");
}
