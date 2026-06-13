import assert from "node:assert/strict";
import test from "node:test";
import { runDocxPlugin } from "../plugins/docxPlugin.ts";
import { defaultPluginRegistry } from "../plugins/registry.ts";
import { runResearchWritingFlowSync } from "./runResearchWritingFlow.ts";

const topic = "短影音使用對高中生注意力與睡眠品質之影響";

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
  assert.equal(flow.document.meta.intent, "academic_research_report");
  assert.equal(flow.document.reportType, "研究報告");
  assert.ok(flow.document.sections.length >= 9);
  assert.ok(flow.sections.abstract.blocks.length > 0);
  assert.ok(flow.report.sections.some((section) => section.heading === "參考文獻"));
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
