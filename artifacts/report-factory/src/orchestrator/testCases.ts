import { pathToFileURL } from "node:url";
import { runResearchWritingOrchestrator } from "./researchWritingOrchestrator.ts";
import type { ResearchWritingIntent, ResearchWritingOrchestratorInput, ResearchWritingPlan } from "./types.ts";

export interface ResearchWritingOrchestratorTestCase {
  id: string;
  description: string;
  input: ResearchWritingOrchestratorInput;
  expectedIntent: ResearchWritingIntent | ResearchWritingIntent[];
  expectedIsSoftwareProject: boolean;
  expectedWarningIncludes?: string;
}

export interface ResearchWritingOrchestratorDemoResult {
  id: string;
  description: string;
  expectedIntent: ResearchWritingIntent | ResearchWritingIntent[];
  expectedIsSoftwareProject: boolean;
  output: ResearchWritingPlan;
}

export const researchWritingOrchestratorTestCases: ResearchWritingOrchestratorTestCase[] = [
  {
    id: "short_video_attention_sleep",
    description: "短影音使用對高中生注意力與睡眠品質之影響",
    input: {
      topic: "短影音使用對高中生注意力與睡眠品質之影響",
      reportType: "研究報告",
      audience: "高中生",
      language: "zh-Hant",
      expectedLength: "medium",
      sourceRequirement: "APA",
      outputFormat: ["markdown", "docx"],
      constraints: [],
    },
    expectedIntent: "academic_research_report",
    expectedIsSoftwareProject: false,
  },
  {
    id: "urban_heat_island_school_comfort",
    description: "都市熱島效應對校園環境與學生學習舒適度之影響",
    input: {
      topic: "都市熱島效應對校園環境與學生學習舒適度之影響",
      reportType: "研究報告",
      audience: "高中生",
      language: "zh-Hant",
      expectedLength: "medium",
      sourceRequirement: "APA",
      outputFormat: ["markdown"],
      constraints: [],
    },
    expectedIntent: "academic_research_report",
    expectedIsSoftwareProject: false,
  },
  {
    id: "taiwan_night_market_culture",
    description: "台灣夜市文化的形成、經濟功能與地方認同之研究",
    input: {
      topic: "台灣夜市文化的形成、經濟功能與地方認同之研究",
      reportType: "研究報告",
      audience: "高中生",
      language: "zh-Hant",
      expectedLength: "medium",
      sourceRequirement: "APA",
      outputFormat: ["markdown"],
      constraints: [],
    },
    expectedIntent: "academic_research_report",
    expectedIsSoftwareProject: false,
  },
  {
    id: "vitamin_c_temperature_oxidation",
    description: "不同溫度對維生素C氧化速率之影響",
    input: {
      topic: "不同溫度對維生素C氧化速率之影響",
      reportType: "實驗報告",
      audience: "高中生",
      language: "zh-Hant",
      expectedLength: "medium",
      sourceRequirement: "APA",
      outputFormat: ["markdown"],
      constraints: [],
    },
    expectedIntent: "academic_research_report",
    expectedIsSoftwareProject: false,
  },
  {
    id: "ai_report_generator_site",
    description: "AI報告生成器網站的設計與實作",
    input: {
      topic: "AI報告生成器網站的設計與實作",
      reportType: "專題報告",
      audience: "高中生",
      language: "zh-Hant",
      expectedLength: "medium",
      sourceRequirement: "APA",
      outputFormat: ["markdown", "docx"],
      constraints: [],
    },
    expectedIntent: ["applied_research", "software_project"],
    expectedIsSoftwareProject: false,
    expectedWarningIncludes: "mixed_technical_research_warning",
  },
  {
    id: "next_api_route_error",
    description: "幫我修正這個 Next.js API route 的錯誤",
    input: {
      topic: "幫我修正這個 Next.js API route 的錯誤",
      reportType: "軟體除錯",
      audience: "developer",
      language: "zh-Hant",
      expectedLength: "short",
      sourceRequirement: "none",
      outputFormat: ["markdown"],
      constraints: [],
    },
    expectedIntent: "software_project",
    expectedIsSoftwareProject: true,
  },
];

export function runResearchWritingOrchestratorDemo(): ResearchWritingOrchestratorDemoResult[] {
  return researchWritingOrchestratorTestCases.map((testCase) => ({
    id: testCase.id,
    description: testCase.description,
    expectedIntent: testCase.expectedIntent,
    expectedIsSoftwareProject: testCase.expectedIsSoftwareProject,
    output: runResearchWritingOrchestrator(testCase.input),
  }));
}

export function validateResearchWritingOrchestratorTestCases(): void {
  const failures = runResearchWritingOrchestratorDemo().flatMap((result) => {
    const expectedIntents = Array.isArray(result.expectedIntent) ? result.expectedIntent : [result.expectedIntent];
    const errors: string[] = [];

    if (!expectedIntents.includes(result.output.intent)) {
      errors.push(`${result.id}: expected intent ${expectedIntents.join(" or ")}, got ${result.output.intent}`);
    }

    if (result.output.isSoftwareProject !== result.expectedIsSoftwareProject) {
      errors.push(
        `${result.id}: expected isSoftwareProject ${result.expectedIsSoftwareProject}, got ${result.output.isSoftwareProject}`,
      );
    }

    const testCase = researchWritingOrchestratorTestCases.find((item) => item.id === result.id);
    if (testCase?.expectedWarningIncludes) {
      const warnings = [
        ...result.output.topicAnalysis.riskWarnings,
        ...result.output.sourcePlan.citationWarnings,
        result.output.nextAction,
      ].join(" ");
      if (!warnings.includes(testCase.expectedWarningIncludes)) {
        errors.push(`${result.id}: expected warning containing ${testCase.expectedWarningIncludes}`);
      }
    }

    return errors;
  });

  if (failures.length > 0) {
    throw new Error(`Research writing orchestrator test cases failed:\n${failures.join("\n")}`);
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];
  return Boolean(entryPath && import.meta.url === pathToFileURL(entryPath).href);
}

if (isDirectExecution()) {
  validateResearchWritingOrchestratorTestCases();
  console.log(JSON.stringify(runResearchWritingOrchestratorDemo(), null, 2));
}
