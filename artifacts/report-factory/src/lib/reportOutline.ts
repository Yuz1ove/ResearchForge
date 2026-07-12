import type { EvidenceCard } from "./evidenceCards.ts";
import type { SourceRecord, WorkflowReportSection } from "./sourceRecords.ts";

export interface ReportOutlineInput {
  topic: string;
  reportType: string;
  audience: string;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
}

export interface ReportOutlineSection {
  sectionId: string;
  title: string;
  purpose: string;
  suggestedEvidenceCardIds: string[];
  writingHints: string[];
  notes: string;
}

export interface ReportOutline {
  title: string;
  topic: string;
  reportType: string;
  audience: string;
  acceptedSourceCount: number;
  evidenceCardCount: number;
  sections: ReportOutlineSection[];
}

interface OutlineTemplate {
  sectionId: string;
  title: string;
  purpose: string;
  evidenceSections: WorkflowReportSection[];
  writingHints: string[];
}

const OUTLINE_TEMPLATES: OutlineTemplate[] = [
  {
    sectionId: "title",
    title: "標題",
    purpose: "清楚標示研究主題、報告類型與範圍。",
    evidenceSections: [],
    writingHints: ["以主題為核心，避免過度誇大結論。"],
  },
  {
    sectionId: "abstract",
    title: "摘要",
    purpose: "用一段話整理研究背景、方法、主要證據與結論方向。",
    evidenceSections: ["研究背景", "文獻探討", "數據分析", "結論"],
    writingHints: ["先寫研究問題，再概述證據，不要加入未被證據支持的新主張。"],
  },
  {
    sectionId: "introduction",
    title: "一、研究背景與動機",
    purpose: "說明為什麼這個主題值得研究，以及它和讀者或課程的關聯。",
    evidenceSections: ["研究背景"],
    writingHints: ["用背景證據說明重要性，再銜接到研究問題。"],
  },
  {
    sectionId: "research_question",
    title: "二、研究問題",
    purpose: "把主題轉成可回答、可蒐證的研究問題。",
    evidenceSections: ["研究背景", "文獻探討"],
    writingHints: ["建議列出 2 到 3 個問題，並讓每個問題都能對應到證據卡。"],
  },
  {
    sectionId: "literature_review",
    title: "三、文獻探討",
    purpose: "整理既有研究、概念、定義與不同觀點。",
    evidenceSections: ["文獻探討"],
    writingHints: ["依主題分類來源，不要只逐篇摘要。"],
  },
  {
    sectionId: "methodology",
    title: "四、研究方法",
    purpose: "說明資料來源、篩選方式與分析方法。",
    evidenceSections: ["研究方法"],
    writingHints: ["交代為何使用這些來源，以及如何避免資料偏誤。"],
  },
  {
    sectionId: "findings",
    title: "五、主要發現",
    purpose: "依研究問題整理已接受來源可支撐的證據面向。",
    evidenceSections: ["數據分析", "文獻探討", "研究背景"],
    writingHints: ["每個重要主張都要能回到至少一張證據卡，但不要依來源卡順序排列正文。"],
  },
  {
    sectionId: "discussion",
    title: "六、討論",
    purpose: "比較證據之間的關係，說明限制、矛盾與可延伸的解釋。",
    evidenceSections: ["數據分析", "文獻探討", "結論"],
    writingHints: ["把證據連成推論，並清楚標出還缺什麼資料。"],
  },
  {
    sectionId: "limitations",
    title: "七、限制",
    purpose: "說明目前來源、摘要、全文與研究方法的限制。",
    evidenceSections: ["研究方法", "數據分析", "結論"],
    writingHints: ["限制必須清楚指出，不要假裝資料完整。"],
  },
  {
    sectionId: "conclusion",
    title: "八、結論與建議",
    purpose: "回應研究問題，提出可被證據支持的結論與後續建議。",
    evidenceSections: ["結論", "數據分析"],
    writingHints: ["只提出證據可支撐的結論，避免新增未查證資訊。"],
  },
  {
    sectionId: "references",
    title: "參考資料",
    purpose: "列出已接受來源，作為正文引用與參考文獻的依據。",
    evidenceSections: [],
    writingHints: ["只放已接受來源；metadata 不完整時需標示待補。"],
  },
];

function evidenceIdsForSections(cards: EvidenceCard[], sections: WorkflowReportSection[]): string[] {
  if (sections.length === 0) return [];
  const wanted = new Set<string>(sections);
  return cards
    .filter((card) => card.usableSections.some((section) => wanted.has(section)))
    .map((card) => card.id);
}

export function buildReportOutline(input: ReportOutlineInput): ReportOutline {
  const topic = input.topic.trim() || "未命名主題";
  const reportType = input.reportType.trim() || "研究報告";
  const audience = input.audience.trim() || "一般讀者";

  return {
    title: `《${topic}》${reportType}大綱`,
    topic,
    reportType,
    audience,
    acceptedSourceCount: input.acceptedSources.length,
    evidenceCardCount: input.evidenceCards.length,
    sections: OUTLINE_TEMPLATES.map((template) => ({
      sectionId: template.sectionId,
      title: template.title,
      purpose: template.purpose,
      suggestedEvidenceCardIds: evidenceIdsForSections(input.evidenceCards, template.evidenceSections),
      writingHints: [
        `讀者設定：${audience}。`,
        `報告類型：${reportType}。`,
        ...template.writingHints,
      ],
      notes: "",
    })),
  };
}
