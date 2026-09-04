import fs from "node:fs";
import path from "node:path";

import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";
import { applyDetailedReportSummary } from "../artifacts/report-factory/src/lib/detailedReport.ts";
import {
  mergeLlmReportDraft,
  type LlmReportWriterResult,
} from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import {
  createReportWorkspace,
  workspaceToGeneratedReport,
} from "../artifacts/report-factory/src/lib/reportWorkspace.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const argument = (name: string): string => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (!value) throw new Error(`Expected --${name}=...`);
  return value.slice(name.length + 3);
};
const root = path.resolve(repositoryRoot, argument("root"));
const slug = argument("case");
const caseRoot = path.join(root, slug);

const configurations: Record<string, { topic: string; domain: string }> = {
  "gen-ai-high-school-learning": {
    topic: "生成式人工智慧輔助高中生學習對學習成效、認知負荷與學術誠信的影響",
    domain: "教育研究／人工智慧",
  },
  "rag-vs-llm-knowledge-qa": {
    topic: "檢索增強生成（RAG）與純大型語言模型在知識密集型問答中的正確性、引用可靠性與成本差異",
    domain: "人工智慧／資訊科學",
  },
  "urban-green-adolescent-mental-health": {
    topic: "都市綠地暴露與青少年心理健康之間的關聯：憂鬱、焦慮與幸福感的證據綜合",
    domain: "醫療／長照／社工／心理",
  },
};

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(caseRoot, filename), "utf8")) as T;
}

function writeJson(filename: string, value: unknown): void {
  const target = path.join(caseRoot, filename);
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

const config = configurations[slug];
if (!config) throw new Error(`Unknown generalization case: ${slug}`);
const summary = readJson<{ verdict?: string }>("acceptance-summary.json");
if (summary.verdict !== "FORMAL_RESEARCH_REPORT_READY_FOR_EXPORT") {
  throw new Error(`${slug} is not authorized for canonical materialization: ${summary.verdict ?? "unknown"}`);
}
const sources = readJson<SourceRecord[]>("accepted-sources.json");
const writer = readJson<LlmReportWriterResult>("writer-response.json");
if (writer.llm_status !== "success" || writer.reportGenerationStatus !== "success") {
  throw new Error(`${slug} Writer result is not successful.`);
}
const evidenceCards = writer.evidenceCards as EvidenceCard[] | undefined;
if (!evidenceCards?.length) {
  throw new Error(`${slug} successful Writer response has no canonical evidence cards.`);
}
const input: ReportInput = {
  topic: config.topic,
  researchReportMode: "formal_research_report",
  citationDisplayMode: "academic",
  reportType: "正式二手研究報告",
  academicLevel: "專業",
  targetAudience: "評審與研究讀者",
  researchDepth: "deep",
  purpose: "依可追溯研究證據直接回答研究問題，呈現跨研究一致性、差異、定量結果與限制",
  domainOverride: config.domain,
  mode: "直接生成完整報告",
  sourceRequirement: "所有事實與數值主張必須綁定 evidence span",
  citationFormat: "APA",
  chartRequirement: "僅輸出通過 CHART_EVIDENCE_GATE 的圖表",
  length: "證據支持範圍內的正式報告",
  wordCount: "2600",
  formalTone: "需要",
  conversationalTone: "不需要",
  specifiedStructure: "FORMAL_RESEARCH_REPORT canonical schema",
  rubric: "單一 claim owner；禁止跨章逐句重複；Methods 只寫實際流程；結論不得新增主張；數值需有來源 span。",
  personalStyle: "",
  supplementalMaterials: "",
  outputLanguage: "繁體中文",
  rewriteSection: "",
  additionalInfo: "摘要與部分全文必須清楚標示取得範圍；不得暗示已進行 meta-analysis。",
  style: "正式學術繁體中文；theme-first 與 claim-first，不逐篇摘要",
  acceptedSources: sources,
};
const plan = writer.reportPlan;
if (!plan?.workflowId || !plan.topicHash) {
  throw new Error(`${slug} successful Writer response has no canonical report plan lineage.`);
}
const workspace = applyDetailedReportSummary(
  mergeLlmReportDraft(
    createReportWorkspace(input, sources, "complete_research_report", plan.workflowId, {
      evidenceCards,
      workflowId: plan.workflowId,
      topicHash: plan.topicHash,
      originalTopic: config.topic,
      researchTopic: config.topic,
      reportPlan: plan,
    }),
    writer,
  ),
  { force: true },
);
const report = workspaceToGeneratedReport(workspace, config.domain);
if (!report.meta.formalReportDocument) {
  throw new Error(`${slug} did not produce a canonical FormalReportDocument.`);
}
writeJson("report-workspace.json", workspace);
writeJson("generated-report.json", report);
writeJson("canonical-report.json", report.meta.formalReportDocument);
writeJson("workspace-preparation.json", {
  schemaVersion: "researchforge-generalization-workspace-preparation/v1",
  slug,
  writerCalls: 0,
  searchCalls: 0,
  sourceCount: sources.length,
  evidenceCardCount: evidenceCards.length,
  sectionCount: workspace.draft.sections.length,
  citationIntegrity: report.meta.citationIntegrity,
  formalQuality: report.meta.formalReportDocument.quality,
  formalMethodology: report.meta.formalReportDocument.methodology,
  formalIntegrity: report.meta.formalReportDocument.integrity,
});
process.stdout.write(`${JSON.stringify({
  slug,
  sourceCount: sources.length,
  evidenceCardCount: evidenceCards.length,
  sectionCount: workspace.draft.sections.length,
  citationIntegrity: report.meta.citationIntegrity.status,
  formalIntegrity: report.meta.formalReportDocument.integrity.status,
}, null, 2)}\n`);
