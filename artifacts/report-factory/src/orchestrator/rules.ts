import type { DomainRule, SectionTemplate } from "./types.ts";

export const academicReportTypeSignals = [
  "研究報告",
  "專題報告",
  "小論文",
  "文獻探討",
  "實驗報告",
  "research report",
  "academic report",
  "paper",
];

export const academicTopicSignals = [
  "學生",
  "高中生",
  "國中生",
  "大學生",
  "學習",
  "注意力",
  "睡眠",
  "心理",
  "社會",
  "文化",
  "環境",
  "科學實驗",
  "實驗",
  "公共議題",
  "歷史",
  "地方認同",
  "校園",
  "研究",
  "影響",
  "形成",
  "氧化",
  "速率",
];

export const directSoftwareActionSignals = [
  "幫我修正",
  "請修正",
  "修正這個",
  "修 bug",
  "修bug",
  "debug",
  "除錯",
  "部署",
  "deploy",
  "幫我寫",
  "請寫",
  "幫我改",
  "修改程式",
  "修改這段",
  "修復",
  "錯誤",
  "error",
  "bug",
  "build failed",
  "api route 的錯誤",
  "api route error",
];

export const softwareArtifactSignals = [
  "ai",
  "人工智慧",
  "網站",
  "網頁",
  "系統",
  "平台",
  "app",
  "api",
  "api route",
  "next.js",
  "nextjs",
  "react",
  "程式",
  "程式碼",
  "資料庫",
  "dashboard",
  "frontend",
  "backend",
  "前端",
  "後端",
  "llm",
  "rag",
  "報告生成器",
];

export const appliedResearchSignals = [
  "設計與實作",
  "設計與實施",
  "開發與評估",
  "系統設計",
  "網站設計",
  "應用研究",
  "可行性",
  "使用者研究",
  "成效評估",
];

export const causeEffectSignals = ["對", "影響", "關係", "相關", "因素"];

export const defaultAcademicSectionTemplates: SectionTemplate[] = [
  {
    sectionId: "abstract",
    title: "摘要",
    purpose: "用短段落概述研究主題、問題、方法與預期貢獻。",
  },
  {
    sectionId: "motivation",
    title: "研究動機",
    purpose: "說明為什麼此題目值得研究，以及它與讀者或社會脈絡的關聯。",
  },
  {
    sectionId: "purpose",
    title: "研究目的",
    purpose: "將主題轉成明確、可回答的研究目標。",
  },
  {
    sectionId: "questions",
    title: "研究問題",
    purpose: "列出後續章節需要回答的核心問題。",
  },
  {
    sectionId: "hypotheses",
    title: "研究假設",
    purpose: "在變項清楚時提出可驗證假設；探索性研究可說明不設方向性假設。",
  },
  {
    sectionId: "literature_review",
    title: "文獻探討",
    purpose: "整理概念定義、既有研究、理論觀點與研究缺口。",
  },
  {
    sectionId: "methods",
    title: "研究方法",
    purpose: "規劃研究設計、資料來源、樣本、工具與分析方式。",
  },
  {
    sectionId: "results_or_expected_results",
    title: "研究結果或預期結果",
    purpose: "描述可呈現的資料型態；尚未收集資料時只能寫預期結果。",
  },
  {
    sectionId: "discussion",
    title: "討論",
    purpose: "連結研究問題、文獻與資料，討論可能解釋與意義。",
  },
  {
    sectionId: "limitations",
    title: "研究限制",
    purpose: "揭露樣本、方法、資料與推論範圍的限制。",
  },
  {
    sectionId: "conclusion",
    title: "結論",
    purpose: "總結研究回答、貢獻與後續研究方向。",
  },
  {
    sectionId: "references",
    title: "參考文獻",
    purpose: "列出實際查證過且可追溯的來源。",
  },
];

export const softwareTriageSectionTemplates: SectionTemplate[] = [
  {
    sectionId: "task_classification",
    title: "任務分類",
    purpose: "確認此輸入是軟體建置或除錯任務，不進入研究報告寫作流程。",
  },
  {
    sectionId: "technical_context",
    title: "技術脈絡",
    purpose: "整理框架、錯誤、目標檔案與需要重現的條件。",
  },
  {
    sectionId: "handoff_plan",
    title: "後續處理計畫",
    purpose: "交給軟體實作模組或工程代理處理。",
  },
];

export const domainRules: DomainRule[] = [
  {
    domain: "education",
    keywords: ["學生", "高中生", "國中生", "大學生", "學習", "校園", "課程", "教育"],
    recommendedSourceTypes: ["peer_reviewed_journal", "education_statistics", "school_or_government_report"],
    methodHints: ["問卷調查", "訪談", "學習情境觀察"],
    dataHints: ["學生背景資料", "學習情境描述", "量表或問卷回應"],
  },
  {
    domain: "psychology",
    keywords: ["注意力", "睡眠", "心理", "壓力", "動機", "情緒", "認知"],
    recommendedSourceTypes: ["peer_reviewed_journal", "validated_scale_documentation", "health_or_psychology_report"],
    methodHints: ["量表測量", "相關分析", "半結構式訪談"],
    dataHints: ["注意力指標", "睡眠品質指標", "自陳量表資料"],
  },
  {
    domain: "media_communication",
    keywords: ["短影音", "社群媒體", "媒體", "手機", "網路使用", "平台"],
    recommendedSourceTypes: ["peer_reviewed_journal", "media_usage_survey", "official_statistics"],
    methodHints: ["使用行為問卷", "內容分析", "訪談"],
    dataHints: ["使用頻率", "使用時間", "平台類型", "使用情境"],
  },
  {
    domain: "environmental_science",
    keywords: ["都市熱島", "環境", "氣候", "溫度", "校園環境", "熱舒適", "空氣"],
    recommendedSourceTypes: ["peer_reviewed_journal", "government_environmental_data", "meteorological_dataset"],
    methodHints: ["實地量測", "環境資料分析", "問卷調查"],
    dataHints: ["溫度紀錄", "濕度紀錄", "校園空間條件", "舒適度回饋"],
  },
  {
    domain: "culture_history",
    keywords: ["文化", "歷史", "夜市", "地方認同", "形成", "傳統", "社群"],
    recommendedSourceTypes: ["academic_book", "peer_reviewed_journal", "local_history_archive", "government_cultural_report"],
    methodHints: ["文獻分析", "田野觀察", "訪談"],
    dataHints: ["歷史資料", "地方敘事", "觀察紀錄", "訪談摘要"],
  },
  {
    domain: "economics_society",
    keywords: ["經濟", "產業", "消費", "地方發展", "社會", "公共議題"],
    recommendedSourceTypes: ["government_statistics", "peer_reviewed_journal", "industry_or_policy_report"],
    methodHints: ["次級資料分析", "問卷調查", "個案研究"],
    dataHints: ["經濟活動資料", "政策或產業資料", "利害關係人觀點"],
  },
  {
    domain: "chemistry_experiment",
    keywords: ["維生素c", "氧化", "速率", "溫度", "實驗", "變因", "濃度"],
    recommendedSourceTypes: ["peer_reviewed_journal", "chemistry_textbook", "lab_protocol"],
    methodHints: ["控制變因實驗", "重複測量", "數據表與圖表分析"],
    dataHints: ["溫度條件", "反應時間", "濃度或顏色變化", "重複試驗紀錄"],
  },
  {
    domain: "information_systems",
    keywords: ["ai", "人工智慧", "網站", "系統", "平台", "報告生成器", "資料", "分析"],
    recommendedSourceTypes: ["peer_reviewed_journal", "official_documentation", "technical_report", "usability_study"],
    methodHints: ["需求分析", "原型評估", "使用者測試"],
    dataHints: ["使用者需求", "功能需求", "測試任務", "使用回饋"],
  },
  {
    domain: "software_engineering",
    keywords: ["next.js", "api route", "react", "程式碼", "部署", "debug", "bug", "錯誤", "實作"],
    recommendedSourceTypes: ["official_documentation", "release_notes", "issue_tracker", "technical_article_with_version"],
    methodHints: ["錯誤重現", "版本核對", "最小修復驗證"],
    dataHints: ["錯誤訊息", "重現步驟", "框架版本", "相關檔案"],
  },
];
