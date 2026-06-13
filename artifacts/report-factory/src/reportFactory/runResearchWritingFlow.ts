import type {
  ContentBlock,
  GeneratedReport,
  ReportInput,
  ReportSection,
  TopicCategory,
} from "../lib/generateReport.ts";
import { buildBibliography, type SourceRecord } from "../lib/sourceRecords.ts";
import { defaultPluginRegistry } from "../plugins/registry.ts";
import type { DocxPluginResult, ReportDocument, ReportDocumentBlock, ReportDocumentSection } from "../plugins/contract.ts";
import type { ResearchWritingOrchestratorInput, ResearchWritingPlan, SectionWritingPlan } from "../orchestrator/types.ts";

export interface ResearchWritingFlowInput {
  topic: string;
  reportType?: string;
  requirements?: string;
  sources?: unknown[];
  outputFormat?: "docx";
}

export interface StructuredResearchReportSections {
  title: string;
  abstract: ReportSection;
  introduction: ReportSection;
  researchQuestions: ReportSection;
  literatureReview: ReportSection;
  methodology: ReportSection;
  expectedResults: ReportSection;
  limitations: ReportSection;
  conclusion: ReportSection;
  referencesPlaceholder: ReportSection;
}

export interface ResearchWritingFlowResult {
  sections: StructuredResearchReportSections;
  warnings: string[];
  document: ReportDocument;
  report: GeneratedReport;
  pluginId: string;
  output?: DocxPluginResult;
}

const RESEARCH_ORCHESTRATOR_PLUGIN_ID = "research-writing-orchestrator-v1";
const DOCX_PLUGIN_ID = "export-pipeline-v1";

export async function runResearchWritingFlow(input: ResearchWritingFlowInput): Promise<ResearchWritingFlowResult> {
  const reportInput = buildReportInput(input);
  const orchestratorInput = buildOrchestratorInput(reportInput, input);
  const pluginResult = await defaultPluginRegistry.execute(RESEARCH_ORCHESTRATOR_PLUGIN_ID, orchestratorInput);
  const plan = pluginResult as ResearchWritingPlan;
  const sections = normalizeResearchSections(reportInput.topic, plan);
  const warnings = collectWarnings(plan);
  const document = buildReportDocument(reportInput, sections, plan, warnings);
  const report = buildGeneratedReport(reportInput, sections, plan);
  const result: ResearchWritingFlowResult = {
    sections,
    warnings,
    document,
    report,
    pluginId: RESEARCH_ORCHESTRATOR_PLUGIN_ID,
  };

  if (input.outputFormat === "docx") {
    result.output = await defaultPluginRegistry.execute(DOCX_PLUGIN_ID, { document, mode: "download" }) as DocxPluginResult;
  }

  return result;
}

export function runResearchWritingFlowSync(input: ResearchWritingFlowInput): ResearchWritingFlowResult {
  const reportInput = buildReportInput(input);
  const orchestratorInput = buildOrchestratorInput(reportInput, input);
  const entry = defaultPluginRegistry.get(RESEARCH_ORCHESTRATOR_PLUGIN_ID);
  if (!entry?.execute) {
    throw new Error(`Report Factory plugin has no execution handler: ${RESEARCH_ORCHESTRATOR_PLUGIN_ID}`);
  }

  const plan = entry.execute(orchestratorInput) as ResearchWritingPlan;
  const sections = normalizeResearchSections(reportInput.topic, plan);
  const warnings = collectWarnings(plan);
  const document = buildReportDocument(reportInput, sections, plan, warnings);
  const report = buildGeneratedReport(reportInput, sections, plan);

  return {
    sections,
    warnings,
    document,
    report,
    pluginId: RESEARCH_ORCHESTRATOR_PLUGIN_ID,
  };
}

function buildReportInput(input: ResearchWritingFlowInput): ReportInput {
  const topic = input.topic.trim();
  if (!topic) {
    throw new Error("Research writing flow requires a non-empty topic.");
  }

  const academicLevel = "高中";
  const targetAudience = "高中";

  return {
    topic,
    reportType: input.reportType?.trim() || "研究報告",
    academicLevel,
    targetAudience,
    purpose: "研究報告",
    domainOverride: "",
    mode: "先建立報告架構",
    sourceRequirement: "需要，但先標示「資料來源待補」",
    citationFormat: "APA",
    chartRequirement: "不需要",
    style: "學術研究風格",
    length: "一般報告",
    wordCount: "",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "",
    rubric: "",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: input.requirements?.trim() || "",
    acceptedSources: normalizeAcceptedSources(input.sources),
  };
}

export async function runDocxExportForReportDocument(document: ReportDocument): Promise<DocxPluginResult> {
  return defaultPluginRegistry.execute(DOCX_PLUGIN_ID, { document, mode: "download" }) as Promise<DocxPluginResult>;
}

export function generatedReportToReportDocument(
  report: GeneratedReport,
  input: ReportInput,
  warnings: string[] = [],
): ReportDocument {
  return {
    schemaVersion: "report-document-v1",
    title: report.meta.title,
    topic: input.topic,
    reportType: input.reportType || "研究報告",
    language: input.outputLanguage || "zh-Hant",
    sections: report.sections.length > 0
      ? report.sections.map((section, index) => reportSectionToDocumentSection(`section-${index + 1}`, section))
      : [fallbackDocumentSection()],
    warnings,
    citationPolicy: {
      style: input.citationFormat || "APA",
      allowPlaceholders: true,
      noFabricatedCitations: true,
    },
    meta: {
      category: report.meta.category,
      pluginId: DOCX_PLUGIN_ID,
    },
  };
}

function buildOrchestratorInput(reportInput: ReportInput, flowInput: ResearchWritingFlowInput): ResearchWritingOrchestratorInput {
  return {
    topic: reportInput.topic,
    reportType: reportInput.reportType,
    audience: reportInput.targetAudience,
    language: "zh-Hant",
    expectedLength: "medium",
    sourceRequirement: reportInput.citationFormat,
    outputFormat: flowInput.outputFormat ? [flowInput.outputFormat] : [],
    constraints: flowInput.requirements ? [flowInput.requirements] : [],
  };
}

function normalizeAcceptedSources(sources: unknown[] | undefined): SourceRecord[] {
  if (!sources) return [];

  return sources.filter(isSourceRecord).map((source) => ({
    ...source,
    reviewState: "accepted",
  }));
}

function isSourceRecord(source: unknown): source is SourceRecord {
  return Boolean(
    source &&
      typeof source === "object" &&
      "title" in source &&
      "authors" in source &&
      "sourceType" in source &&
      typeof (source as { title?: unknown }).title === "string" &&
      Array.isArray((source as { authors?: unknown }).authors) &&
      typeof (source as { sourceType?: unknown }).sourceType === "string",
  );
}

function normalizeResearchSections(topic: string, plan: ResearchWritingPlan): StructuredResearchReportSections {
  const sectionById = new Map(plan.sectionPlan.map((section) => [section.sectionId, section]));
  const title = `《${topic.trim()}》${plan.intent === "software_project" ? "任務分流計畫" : "研究寫作計畫"}`;

  return {
    title,
    abstract: buildSection("摘要", sectionById.get("abstract"), [
      `本計畫聚焦於「${topic.trim()}」，目前只產生研究寫作架構，不生成完整正文。`,
      `研究策略：${plan.researchStrategy}`,
    ]),
    introduction: buildSection("前言與研究動機", sectionById.get("motivation"), [
      `主題分析：${plan.topicAnalysis.mainSubject}`,
      `可能範圍：${plan.topicAnalysis.possibleScope}`,
    ]),
    researchQuestions: {
      heading: "研究問題與假設",
      blocks: [
        { type: "list", items: plan.researchQuestions },
        { type: "note", text: `研究假設：${plan.hypotheses.join("；")}` },
      ],
    },
    literatureReview: buildSection("文獻探討規劃", sectionById.get("literature_review"), [
      `建議來源類型：${plan.sourcePlan.recommendedSourceTypes.join("、")}`,
      `搜尋關鍵字：${plan.sourcePlan.searchKeywords.join("、")}`,
      "citation_needed: 文獻內容需由後續 Source/Citation 模組查證後補入。",
    ]),
    methodology: buildSection("研究方法", sectionById.get("methods"), [
      `建議方法：${plan.methodPlan.recommendedMethods.join("、")}`,
      `需蒐集資料：${plan.methodPlan.dataToCollect.join("、")}`,
    ]),
    expectedResults: buildSection("研究結果或預期結果", sectionById.get("results_or_expected_results"), [
      "尚未收集或驗證資料，因此本節只能保留預期結果規劃，不宣稱實際發現。",
      "citation_needed: 任何結果、數字或比較都必須等待資料支持。",
    ]),
    limitations: buildSection("研究限制", sectionById.get("limitations"), plan.methodPlan.limitations),
    conclusion: buildSection("結論規劃", sectionById.get("conclusion"), [
      `後續動作：${plan.nextAction}`,
      "結論需在來源與資料查證後撰寫，避免提前下定論。",
    ]),
    referencesPlaceholder: {
      heading: "參考文獻",
      blocks: [
        {
          type: "note",
          text: "資料來源待補；不得編造引用、統計數字、作者、文章標題、期刊名稱或 URL。",
        },
        {
          type: "list",
          items: plan.sourcePlan.citationWarnings,
        },
      ],
    },
  };
}

function buildSection(heading: string, planSection: SectionWritingPlan | undefined, fallbackParagraphs: string[]): ReportSection {
  const blocks: ContentBlock[] = fallbackParagraphs.map((text) => ({ type: "paragraph", text }));

  if (planSection) {
    blocks.push(
      { type: "paragraph", text: `章節目的：${planSection.purpose}` },
      { type: "paragraph", text: `撰寫指示：${planSection.writerInstruction}` },
      { type: "list", items: planSection.requiredEvidence },
    );
  }

  return {
    heading,
    blocks,
  };
}

function buildGeneratedReport(
  input: ReportInput,
  sections: StructuredResearchReportSections,
  plan: ResearchWritingPlan,
): GeneratedReport {
  const qualitySection: ReportSection = {
    heading: "品質檢查表",
    blocks: [
      {
        type: "quality",
        checks: plan.qualityChecklist.map((label) => ({ label, passed: !label.includes("不得") })),
      },
    ],
  };
  const reportSections: ReportSection[] = [
    sections.abstract,
    sections.introduction,
    sections.researchQuestions,
    sections.literatureReview,
    sections.methodology,
    sections.expectedResults,
    sections.limitations,
    sections.conclusion,
    sections.referencesPlaceholder,
    qualitySection,
  ];

  return {
    meta: {
      title: sections.title,
      category: detectResearchTopicCategory(input.topic, input.reportType),
      versionLabel: "Research Orchestrator Alpha",
      completeness: 45,
      suggestedAdditions: ["查證來源", "補充資料", "撰寫正文", "完成引用"],
      acceptedSources: input.acceptedSources,
      bibliography: buildBibliography(input.acceptedSources, input.citationFormat || "APA"),
    },
    sections: reportSections,
  };
}

function buildReportDocument(
  input: ReportInput,
  sections: StructuredResearchReportSections,
  plan: ResearchWritingPlan,
  warnings: string[],
): ReportDocument {
  const reportDocumentSections: ReportDocumentSection[] = [
    reportSectionToDocumentSection("abstract", sections.abstract),
    reportSectionToDocumentSection("introduction", sections.introduction),
    reportSectionToDocumentSection("researchQuestions", sections.researchQuestions),
    reportSectionToDocumentSection("literatureReview", sections.literatureReview),
    reportSectionToDocumentSection("methodology", sections.methodology),
    reportSectionToDocumentSection("expectedResults", sections.expectedResults),
    reportSectionToDocumentSection("limitations", sections.limitations),
    reportSectionToDocumentSection("conclusion", sections.conclusion),
    reportSectionToDocumentSection("referencesPlaceholder", sections.referencesPlaceholder),
  ];

  return {
    schemaVersion: "report-document-v1",
    title: sections.title,
    topic: input.topic,
    reportType: input.reportType || "研究報告",
    language: "zh-Hant",
    sections: reportDocumentSections.length > 0 ? reportDocumentSections : [fallbackDocumentSection()],
    warnings,
    citationPolicy: {
      style: input.citationFormat || "APA",
      allowPlaceholders: true,
      noFabricatedCitations: true,
    },
    meta: {
      intent: plan.intent,
      category: detectResearchTopicCategory(input.topic, input.reportType),
      pluginId: RESEARCH_ORCHESTRATOR_PLUGIN_ID,
    },
  };
}

function detectResearchTopicCategory(topic: string, reportType: string): TopicCategory {
  const text = `${topic} ${reportType}`;
  if (/實驗|氧化|溫度|速率|維生素|化學/.test(text)) return "科學實驗";
  if (/AI|ai|網站|系統|程式|API|Next\.js|生成器/.test(text)) return "AI／網站／程式專案";
  if (/文化|夜市|歷史|地方認同/.test(text)) return "歷史／地理／公民";
  if (/心理|注意力|睡眠|學生|社會|校園/.test(text)) return "社會議題";
  return "一般學校報告";
}

function reportSectionToDocumentSection(id: string, section: ReportSection): ReportDocumentSection {
  return {
    id,
    title: section.heading,
    blocks: section.blocks.map(contentBlockToDocumentBlock),
  };
}

function contentBlockToDocumentBlock(block: ContentBlock): ReportDocumentBlock {
  switch (block.type) {
    case "list":
      return { type: "list", items: block.items ?? [] };
    case "note":
      return { type: "note", text: block.text ?? "" };
    case "quality":
      return { type: "quality", checks: block.checks ?? [] };
    case "paragraph":
    default:
      return { type: "paragraph", text: block.text ?? "" };
  }
}

function fallbackDocumentSection(): ReportDocumentSection {
  return {
    id: "safe-fallback",
    title: "安全 fallback document",
    blocks: [
      {
        type: "note",
        text: "內容為空，已產生安全 fallback 文件。請補齊主題、章節與資料來源後再匯出。",
      },
    ],
  };
}

function collectWarnings(plan: ResearchWritingPlan): string[] {
  return Array.from(
    new Set([
      ...plan.topicAnalysis.riskWarnings,
      ...plan.sourcePlan.citationWarnings,
      ...plan.methodPlan.limitations,
      "No full report body generated by Research Writing Orchestrator Alpha.",
    ]),
  );
}
