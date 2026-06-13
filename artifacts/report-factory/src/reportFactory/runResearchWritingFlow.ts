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
import type {
  ConfidenceLevel,
  ResearchWritingOrchestratorInput,
  ResearchWritingPlan,
  VariableRole,
} from "../orchestrator/types.ts";

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
  researchBackground: ReportSection;
  researchMotivation: ReportSection;
  researchPurpose: ReportSection;
  researchQuestions: ReportSection;
  researchHypotheses: ReportSection;
  literatureReview: ReportSection;
  researchMethod: ReportSection;
  variables: ReportSection;
  expectedChartsTables: ReportSection;
  limitations: ReportSection;
  conclusion: ReportSection;
  sourcePlaceholder: ReportSection;
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
  const report = buildGeneratedReport(reportInput, sections);
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
  const report = buildGeneratedReport(reportInput, sections);

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
  const cleanTopic = topic.trim();
  const title = `《${cleanTopic}》${plan.intent === "software_project" ? "任務分流計畫" : "研究報告"}`;
  const independentVariables = variablesByRole(plan, "independent_variable");
  const dependentVariables = variablesByRole(plan, "dependent_variable");
  const contextVariables = variablesByRole(plan, "control_or_context_variable");
  const independentText = joinChineseList(independentVariables.map((variable) => variable.name)) || "主要研究因素";
  const dependentText = joinChineseList(dependentVariables.map((variable) => variable.name)) || "研究結果或態度變化";
  const contextText = joinChineseList(contextVariables.map((variable) => variable.name)) || "高中生";
  const methodsText = joinChineseList(plan.methodPlan.recommendedMethods);

  return {
    title,
    abstract: {
      heading: "摘要",
      blocks: [
        {
          type: "paragraph",
          text: `本研究以「${cleanTopic}」為主題，聚焦${contextText}在日常媒體使用情境中，${independentText}與${dependentText}之間可能存在的關聯。本草稿採 deterministic rule-based 方式生成，目的在於先提供可提交給師長討論的研究報告初稿架構與段落內容。`,
        },
        {
          type: "paragraph",
          text: `研究方法建議以${methodsText || "問卷調查與文獻分析"}為主，先建立變項的操作型定義，再蒐集學生自陳資料或課堂可行的觀察資料。由於目前尚未接入真實來源搜尋與資料分析，本摘要不宣稱研究結果，所有背景主張與量表依據皆需標示為待補來源或需查證。`,
        },
      ],
    },
    researchBackground: {
      heading: "研究背景",
      blocks: [
        {
          type: "paragraph",
          text: `短影音、社群平台與行動裝置已成為許多學生接觸資訊與休閒娛樂的重要管道。若研究主題涉及注意力或睡眠品質，背景章節應先說明媒體使用行為、學習作息與健康習慣之間可能互相影響，但不得加入未查證的流行率、使用時數或醫學結論。`,
        },
        {
          type: "paragraph",
          text: `就高中研究報告而言，本題可從教育、心理與媒體傳播三個角度切入：教育面關心課堂專注與學習狀態，心理面關心注意力與睡眠品質的自我覺察，媒體面則關心短影音使用時間、使用情境與平台互動方式。這些背景都需要後續以文獻或可信資料補強。`,
        },
      ],
    },
    researchMotivation: {
      heading: "研究動機",
      blocks: [
        {
          type: "paragraph",
          text: `本研究動機來自學生生活中常見的觀察：短影音內容節奏快、推薦機制密集，使用者可能在零碎時間反覆觀看；同時，高中生面臨課業、社交與休息時間分配的壓力，容易感受到專注力與睡眠狀態的變化。`,
        },
        {
          type: "paragraph",
          text: `因此，本報告希望把日常經驗轉化為可以討論與檢驗的研究問題。與其直接斷定短影音一定造成負面結果，本研究先以可觀察變項描述使用情形，再設計適合高中專題層級的方法，讓結論建立在資料與來源查證之上。`,
        },
      ],
    },
    researchPurpose: {
      heading: "研究目的",
      blocks: [
        {
          type: "paragraph",
          text: `本研究目的在於釐清${independentText}與${dependentText}之間的可能關係，並建立一套適合高中生研究報告使用的資料蒐集與分析框架。研究不以建立醫學診斷或因果定論為目標，而是以描述、比較與初步關聯分析作為可行範圍。`,
        },
        {
          type: "list",
          items: [
            `整理${independentText}的可能衡量方式，例如使用頻率、使用時段、單次使用長度或使用目的。`,
            `整理${dependentText}的衡量面向，例如自評專注狀態、課堂分心經驗、入睡時間或睡眠滿意度。`,
            `提出適合${contextText}情境的研究問題、假設、方法與圖表呈現方式。`,
            "保留待補來源標記，等待後續來源查證與引用格式補齊。",
          ],
        },
      ],
    },
    researchQuestions: {
      heading: "研究問題",
      blocks: [
        {
          type: "paragraph",
          text: `研究問題應直接對應題目中的核心變項，避免只停留在「短影音好不好」這類過度籠統的判斷。下列問題可作為問卷設計、訪談提綱與文獻探討的共同主軸。`,
        },
        { type: "list", items: plan.researchQuestions },
      ],
    },
    researchHypotheses: {
      heading: "研究假設",
      blocks: [
        {
          type: "paragraph",
          text: `研究假設是可被資料支持或不支持的暫定推論，不是已經成立的結論。本草稿會依題目變項提出方向性假設，但每一項都必須在蒐集資料後重新檢驗，並以需查證標記保留證據缺口。`,
        },
        { type: "list", items: plan.hypotheses },
      ],
    },
    literatureReview: {
      heading: "文獻探討架構",
      blocks: [
        {
          type: "paragraph",
          text: `文獻探討可先建立概念地圖，再補入實際來源。對本題而言，建議從「${independentText}的定義與使用型態」、「${dependentText}的概念與衡量」、「${contextText}的學習與作息情境」三個層次整理。`,
        },
        {
          type: "list",
          items: [
            `核心概念定義：說明${independentText}、${dependentText}等名詞，需查證來源。`,
            "既有研究方向：整理媒體使用、注意力、睡眠品質或青少年生活型態相關研究，待補來源。",
            "可能機制：討論時間排擠、內容刺激、睡前使用與自我控制等可能解釋，需查證。",
            "研究缺口：指出本研究聚焦於高中生情境與可行的校園專題資料，而不是宣稱完整因果模型。",
            `建議搜尋關鍵字：${joinChineseList(plan.sourcePlan.searchKeywords)}。`,
          ],
        },
        { type: "note", text: "待補來源：本節不可直接生成作者、年份、文章標題、期刊名稱、DOI 或 URL。" },
      ],
    },
    researchMethod: {
      heading: "研究方法",
      blocks: [
        {
          type: "paragraph",
          text: `本研究可採量化問卷為主、訪談或開放題為輔的設計。量化資料用來描述短影音使用情形與注意力、睡眠品質自評之間的關聯；質性回應則用來補充學生使用短影音的情境，例如睡前觀看、課間休息或壓力調適。`,
        },
        {
          type: "paragraph",
          text: `研究對象建議設定為${contextText}，樣本來源、樣本數與施測方式需依課程規範、研究倫理與實際可行性決定。本草稿不預設任何樣本數，也不把便利樣本推論為所有高中生。`,
        },
        {
          type: "list",
          items: [
            `建議方法：${joinChineseList(plan.methodPlan.recommendedMethods)}。`,
            `需蒐集資料：${joinChineseList(plan.methodPlan.dataToCollect)}。`,
            "分析方式：可先做描述統計與交叉比較，再視資料品質嘗試相關分析；不得在未設實驗控制時宣稱因果。",
            "倫理提醒：問卷應避免蒐集可識別個資，並向填答者說明用途與匿名處理方式。",
          ],
        },
      ],
    },
    variables: {
      heading: "研究變項",
      blocks: [
        {
          type: "paragraph",
          text: `研究變項需要先被清楚定義，後續問卷題目與圖表才會一致。本題的初步拆解如下，實際操作型定義仍需依文獻、量表或課程要求修正。`,
        },
        { type: "list", items: buildVariableItems(plan) },
      ],
    },
    expectedChartsTables: {
      heading: "預計圖表",
      blocks: [
        {
          type: "paragraph",
          text: `本研究目前尚未蒐集資料，因此只能提出預計圖表與表格，不填入未驗證數字。圖表的目的應是幫助讀者看懂變項分布、組別差異與可能關聯，而不是製造看似精確但沒有來源的結果。`,
        },
        { type: "list", items: buildExpectedChartTableItems(plan) },
      ],
    },
    limitations: {
      heading: "研究限制",
      blocks: [
        {
          type: "paragraph",
          text: `本研究限制需在正文中明確揭露，尤其是樣本來源、資料蒐集方式、量表可信度與因果推論限制。高中專題研究可以提出合理觀察與初步分析，但不宜把自陳問卷或單一學校樣本擴大解讀。`,
        },
        { type: "list", items: plan.methodPlan.limitations },
      ],
    },
    conclusion: {
      heading: "結論",
      blocks: [
        {
          type: "paragraph",
          text: `本報告初稿顯示，「${cleanTopic}」適合發展為以變項分析為核心的高中研究報告。完成後的結論應回到研究問題，說明資料是否支持各項假設，並區分「觀察到的關聯」與「尚不能證明的因果」。`,
        },
        {
          type: "paragraph",
          text: `在尚未補入文獻與實際資料前，本節只能作為結論寫作方向：研究者應先完成來源查證、問卷設計、資料蒐集與圖表分析，再撰寫最終結論與後續建議。`,
        },
      ],
    },
    sourcePlaceholder: {
      heading: "資料來源待補",
      blocks: [
        {
          type: "note",
          text: "待補來源：目前尚未接入真實 web search 或 citation pipeline，因此本節只列出需查證的來源需求，不生成任何假引用、假 URL 或假 DOI。",
        },
        {
          type: "list",
          items: [
            `需查證來源類型：${joinChineseList(plan.sourcePlan.recommendedSourceTypes)}。`,
            `需查證關鍵字：${joinChineseList(plan.sourcePlan.searchKeywords)}。`,
            ...plan.sourcePlan.citationWarnings,
          ],
        },
      ],
    },
  };
}

function buildGeneratedReport(
  input: ReportInput,
  sections: StructuredResearchReportSections,
): GeneratedReport {
  const reportSections: ReportSection[] = [
    sections.abstract,
    sections.researchBackground,
    sections.researchMotivation,
    sections.researchPurpose,
    sections.researchQuestions,
    sections.researchHypotheses,
    sections.literatureReview,
    sections.researchMethod,
    sections.variables,
    sections.expectedChartsTables,
    sections.limitations,
    sections.conclusion,
    sections.sourcePlaceholder,
  ];

  return {
    meta: {
      title: sections.title,
      category: detectResearchTopicCategory(input.topic, input.reportType),
      versionLabel: "Research Orchestrator Alpha",
      completeness: 62,
      suggestedAdditions: ["查證來源", "補充文獻", "蒐集問卷資料", "完成引用"],
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
    reportSectionToDocumentSection("researchBackground", sections.researchBackground),
    reportSectionToDocumentSection("researchMotivation", sections.researchMotivation),
    reportSectionToDocumentSection("researchPurpose", sections.researchPurpose),
    reportSectionToDocumentSection("researchQuestions", sections.researchQuestions),
    reportSectionToDocumentSection("researchHypotheses", sections.researchHypotheses),
    reportSectionToDocumentSection("literatureReview", sections.literatureReview),
    reportSectionToDocumentSection("researchMethod", sections.researchMethod),
    reportSectionToDocumentSection("variables", sections.variables),
    reportSectionToDocumentSection("expectedChartsTables", sections.expectedChartsTables),
    reportSectionToDocumentSection("limitations", sections.limitations),
    reportSectionToDocumentSection("conclusion", sections.conclusion),
    reportSectionToDocumentSection("sourcePlaceholder", sections.sourcePlaceholder),
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
      "deterministic_rule_based_draft: 內容為規則式研究報告草稿，提交前仍需補來源、查證資料並完成引用。",
    ]),
  );
}

function variablesByRole(plan: ResearchWritingPlan, role: VariableRole) {
  return plan.topicAnalysis.variables.filter((variable) => variable.role === role);
}

function buildVariableItems(plan: ResearchWritingPlan): string[] {
  if (plan.topicAnalysis.variables.length === 0) {
    return ["研究變項待補：題目尚未呈現明確變項，需先與老師確認研究範圍與操作型定義。"];
  }

  return plan.topicAnalysis.variables.map((variable) =>
    `${variableRoleLabel(variable.role)}：${variable.name}（信心：${confidenceLabel(variable.confidence)}；${variable.reason}）`,
  );
}

function buildExpectedChartTableItems(plan: ResearchWritingPlan): string[] {
  const independentVariables = variablesByRole(plan, "independent_variable").map((variable) => variable.name);
  const dependentVariables = variablesByRole(plan, "dependent_variable").map((variable) => variable.name);
  const independentText = joinChineseList(independentVariables) || "主要研究因素";
  const items = [
    `表 1：研究變項操作型定義表，列出${joinChineseList([...independentVariables, ...dependentVariables]) || "各研究變項"}、問卷題目來源與需查證依據。`,
    `表 2：${independentText}分組與基本資料摘要表，僅在實際問卷回收後填入數字。`,
    `圖 1：${independentText}分布長條圖，用於呈現使用頻率、使用時段或使用情境。`,
    "圖 2：研究流程圖，呈現題目、變項、資料蒐集、分析與來源查證流程。",
  ];

  for (const dependentVariable of dependentVariables) {
    items.push(`圖表：${independentText}與${dependentVariable}的交叉表或散佈圖，需等資料蒐集後再判讀。`);
  }

  return unique(items).slice(0, 8);
}

function variableRoleLabel(role: VariableRole): string {
  switch (role) {
    case "independent_variable":
      return "自變項";
    case "dependent_variable":
      return "依變項";
    case "control_or_context_variable":
      return "控制或脈絡變項";
    case "related_factor":
    default:
      return "相關因素";
  }
}

function confidenceLabel(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
    default:
      return "低";
  }
}

function joinChineseList(items: readonly string[]): string {
  return unique(items.map((item) => item.trim()).filter(Boolean)).join("、");
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
