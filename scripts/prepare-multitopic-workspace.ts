import fs from "node:fs";
import path from "node:path";

import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";
import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import { applyDetailedReportSummary } from "../artifacts/report-factory/src/lib/detailedReport.ts";
import { mergeLlmReportDraft, type LlmReportWriterResult } from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import { createReportWorkspace, workspaceToGeneratedReport } from "../artifacts/report-factory/src/lib/reportWorkspace.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";
import {
  buildTopicIntegrityContract,
  evidenceRoleForText,
  reconcilePotentialDirectEvidence,
} from "../lib/api-zod/src/topic-integrity.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const argument = (name: string): string => {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (!value) throw new Error(`Expected --${name}=...`);
  return value.slice(name.length + 3);
};
const liveRoot = path.resolve(repositoryRoot, argument("live-root"));
const outputRoot = path.resolve(repositoryRoot, argument("output-root"));
const slug = argument("case");

const cases: Record<string, { topic: string; domain: string }> = {
  "sleep-academic-performance": { topic: "睡眠不足與高中生學業表現之間的關聯", domain: "教育研究／公共衛生" },
  "retrieval-practice-vs-rereading": { topic: "檢索練習（retrieval practice）相較於重讀對長期記憶保留效果的影響", domain: "教育心理" },
  "hiit-vs-mict": { topic: "高強度間歇訓練（HIIT）與中等強度持續訓練（MICT）對心肺適能改善效果的比較", domain: "運動科學／健康" },
  "intermittent-fasting-vs-calorie-restriction": { topic: "間歇性斷食與持續熱量限制對成年人減重效果的比較", domain: "營養／臨床醫學" },
  "pm25-lung-function": { topic: "長期 PM2.5 暴露與兒童及青少年肺功能的關聯", domain: "環境健康／公共衛生" },
  "green-space-mental-health": { topic: "都市綠地暴露與青少年心理健康之間的關聯", domain: "都市研究／公共衛生" },
  "genai-writing-education": { topic: "生成式人工智慧輔助寫作對學生學習成果、寫作品質與原創性的影響", domain: "教育研究／人工智慧" },
  "rag-vs-finetuning": { topic: "Retrieval-Augmented Generation（RAG）與 Fine-Tuning 在領域問答任務中的準確率、成本與延遲比較", domain: "資訊工程／人工智慧" },
  "low-resource-multilingual-llm": { topic: "大型語言模型在低資源語言上的跨語言理解與推理表現", domain: "自然語言處理／人工智慧" },
  "lfp-vs-nmc-battery": { topic: "LFP 與 NMC 鋰離子電池在能量密度、循環壽命與熱安全上的比較", domain: "電池工程／材料科學" },
  "minimum-wage-youth-employment": { topic: "最低工資調升對青年就業的影響", domain: "經濟政策／公共政策" },
  "microplastics-human-health": { topic: "微塑膠暴露對人類健康結果的現有證據", domain: "環境健康／毒理學" },
};

function readJson<T>(target: string): T {
  return JSON.parse(fs.readFileSync(target, "utf8")) as T;
}

function writeJson(target: string, value: unknown): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, target);
}

const config = cases[slug];
if (!config) throw new Error(`Unknown multi-topic case: ${slug}`);
const liveCaseRoot = path.join(liveRoot, slug);
const outputCaseRoot = path.join(outputRoot, slug);
const summary = readJson<Record<string, unknown>>(path.join(liveCaseRoot, "acceptance-summary.json"));
const writer = readJson<LlmReportWriterResult>(path.join(liveCaseRoot, "writer-response.json"));
const rawSources = readJson<SourceRecord[]>(path.join(liveCaseRoot, "accepted-sources.json"));
const groundingCards = readJson<EvidenceCard[]>(path.join(liveCaseRoot, "grounding-evidence-cards.json"));
const plan = writer.reportPlan;
if (!plan?.workflowId || !plan.topicHash) throw new Error(`${slug} has no canonical ReportPlan lineage.`);
const rawEvidenceCards = (writer.evidenceCards as EvidenceCard[] | undefined)?.length
  ? writer.evidenceCards as EvidenceCard[]
  : groundingCards;
const topicContract = buildTopicIntegrityContract({
  canonicalTopic: config.topic,
  researchQuestion: config.topic,
  domain: config.domain,
});
const reconciliation = reconcilePotentialDirectEvidence({
  sources: rawSources,
  contract: topicContract,
});
const assessmentBySourceId = new Map(
  reconciliation.items.map((item) => [item.sourceId, item.assessment]),
);
const sources = rawSources.map((source) => {
  const assessment = assessmentBySourceId.get(source.id);
  return assessment
    ? {
        ...source,
        formalEvidenceRole: assessment.sourceRole,
        topicIntegrityAssessment: assessment,
        usableSections: assessment.allowedSections,
        isPrimaryEvidence: assessment.sourceRole === "DIRECT_FINDING",
      }
    : source;
});
const evidenceCards = rawEvidenceCards.map((card) => {
  const assessment = assessmentBySourceId.get(card.sourceId);
  if (!assessment) return card;
  const role = evidenceRoleForText({
    text: [card.claimTextZhTw, card.claim, card.supportSpan, card.supportedByText, card.evidence]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" "),
    sourceAssessment: assessment,
    contract: topicContract,
  });
  return {
    ...card,
    formalEvidenceRole: role.role,
    usableSections: role.allowedSections,
    sectionTargets: role.allowedSections,
    topicIntegrityReason: role.reason,
  };
});
if (sources.length === 0 || evidenceCards.length === 0) {
  throw new Error(`${slug} has no source-bound evidence and cannot be published.`);
}
const successfulWriter = writer.llm_status === "success" && writer.reportGenerationStatus === "success";
const insufficientWriter = writer.status === "insufficient_sources" &&
  plan.readinessStatus === "ready_limited_report";
if (!successfulWriter && !insufficientWriter) {
  throw new Error(`${slug} has no publishable Writer or insufficient-evidence lineage.`);
}
const generationMode = plan.readinessStatus === "ready_complete_report"
  ? "complete_research_report" as const
  : "limited_evidence_brief" as const;
let classification = insufficientWriter
  ? "INSUFFICIENT_EVIDENCE_REPORT"
  : generationMode === "complete_research_report"
  ? "FORMAL_RESEARCH_REPORT"
  : "LIMITED_EVIDENCE_BRIEF";
const input: ReportInput = {
  topic: config.topic,
  researchReportMode: "formal_research_report",
  citationDisplayMode: "academic",
  reportType: "正式二手研究報告",
  academicLevel: "專業",
  targetAudience: "評審與研究讀者",
  researchDepth: "deep",
  purpose: "依可追溯研究證據回答研究問題，呈現跨研究一致性、差異、數值結果與限制",
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
const mergedWorkspace = mergeLlmReportDraft(
  createReportWorkspace(input, sources, generationMode, plan.workflowId, {
    evidenceCards,
    workflowId: plan.workflowId,
    topicHash: plan.topicHash,
    originalTopic: config.topic,
    researchTopic: config.topic,
    reportPlan: plan,
  }),
  writer,
);
const publishableWriterTraceCount = mergedWorkspace.draft.sections.flatMap((section) =>
  section.sentenceClaimTraces ?? []
).filter((trace) =>
  !trace.deleted &&
  trace.validationAfter === "pass" &&
  trace.factual !== false &&
  trace.realizedClaimIds.length > 0 &&
  trace.evidenceIds.length > 0 &&
  trace.citationSourceIds.length > 0 &&
  !/(?:中文摘要：此來源可用於檢視|可辨識的證據面向包括|已取得\s*DOI.*可追溯原始來源|系統初評為可直接納入證據整理)/iu.test(trace.finalText)
).length;
if (publishableWriterTraceCount === 0 && mergedWorkspace.llmDiagnostics) {
  mergedWorkspace.llmDiagnostics.reportGenerationStatus = "skipped";
}
const workspace = applyDetailedReportSummary(mergedWorkspace, { force: true });
const report = workspaceToGeneratedReport(workspace, config.domain);
const formal = report.meta.formalReportDocument;
if (!formal) throw new Error(`${slug} did not produce a FormalReportDocument.`);
if (formal.metadata.directEvidenceSourceCount === 0) {
  classification = reconciliation.falseInsufficient
    ? "BLOCK_EXPORT_FALSE_INSUFFICIENT"
    : "INSUFFICIENT_EVIDENCE_REPORT";
}
writeJson(path.join(outputCaseRoot, "report-workspace.json"), workspace);
writeJson(path.join(outputCaseRoot, "generated-report.json"), report);
writeJson(path.join(outputCaseRoot, "canonical-report.json"), formal);
writeJson(path.join(outputCaseRoot, "CASE-STATUS.json"), {
  schemaVersion: "researchforge-multitopic-case-status/v1",
  slug,
  topic: config.topic,
  classification,
  upstreamVerdict: summary.verdict ?? null,
  writerLineage: successfulWriter ? "SUCCESS" : "SKIPPED_INSUFFICIENT_SOURCES",
  planReadiness: plan.readinessStatus,
  sources: sources.length,
  evidenceCards: evidenceCards.length,
  citationIntegrity: report.meta.citationIntegrity.status,
  formalIntegrity: formal.integrity.status,
  qualityPassed: formal.quality.passed,
  qualityBlockExport: formal.quality.blockExport,
  retryPlan: formal.quality.retryPlan,
  directEvidenceReconciliation: reconciliation,
});
process.stdout.write(`${JSON.stringify({
  slug,
  classification,
  sources: sources.length,
  evidenceCards: evidenceCards.length,
  citationIntegrity: report.meta.citationIntegrity.status,
  formalIntegrity: formal.integrity.status,
  qualityPassed: formal.quality.passed,
  directEvidenceReconciliation: reconciliation.code,
}, null, 2)}\n`);
