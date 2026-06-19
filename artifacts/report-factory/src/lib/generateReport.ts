// generateReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mock report generation engine for Report Factory AI.
//
// To connect a real model later: replace the body of `generateReport()` with an
// async call to /api/generate (or the OpenAI chat completions endpoint) that
// returns the same `GeneratedReport` shape. All UI renders generically from the
// block-based model below, so no UI changes are required for the swap.
//
// IMPORTANT: This mock never fabricates citations, URLs, authors, or statistics.
// Where real data is required it emits Traditional-Chinese placeholder notes.
// All code/comments are English; all user-facing strings are Traditional Chinese.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildBibliography,
  sourceHasIncompleteMetadata,
  type BibliographyEntry,
  type SourceRecord,
} from "./sourceRecords.ts";

// ─── Form option lists (single source of truth, imported by the UI) ──────────

export const REPORT_TYPES = [
  "研究報告",
  "心得報告",
  "專題報告",
  "實驗報告",
  "商業報告",
  "商業／產品分析報告",
  "讀書報告",
  "其他",
] as const;

export const TARGET_AUDIENCES = [
  "國中",
  "高中",
  "大學",
  "老師",
  "評審",
  "客戶",
  "公司主管",
  "一般讀者",
] as const;

export const REPORT_PURPOSES = [
  "學校作業",
  "研究報告",
  "科展報告",
  "專題製作",
  "讀書心得",
  "實驗報告",
  "商業分析",
  "簡報講稿",
  "網站／AI／程式專案",
  "其他",
] as const;

export const GENERATION_MODES = [
  "先建立報告架構",
  "直接生成完整報告",
  "只生成資料需求表",
  "只生成圖表與圖片建議",
  "只生成品質檢查表",
  "只重寫指定章節",
  "Eric 研究模式",
  "簡報大綱",
] as const;

// Academic level replaces the former "目標讀者 / 報告目的" pair (V3 PART 5).
export const ACADEMIC_LEVELS = ["國中", "高中", "大學", "專業"] as const;

/** academicToAudience — derive the reader framing (targetAudience) from the
 *  selected academic level, so the engine keeps a single source of truth. */
export function academicToAudience(level: string): string {
  switch (level) {
    case "國中":
      return "國中";
    case "大學":
      return "大學";
    case "專業":
      return "評審";
    case "高中":
    default:
      return "高中";
  }
}

/** academicToPurpose — a sensible default report purpose per academic level,
 *  used when deriving ReportInput before generation. */
export function academicToPurpose(level: string): string {
  switch (level) {
    case "大學":
    case "專業":
      return "研究報告";
    case "國中":
    case "高中":
    default:
      return "學校作業";
  }
}

export const SOURCE_REQUIREMENTS = [
  "不需要",
  "需要，但先標示「資料來源待補」",
  "需要，並生成參考文獻格式",
] as const;

export const CITATION_FORMATS = ["不需要", "APA", "MLA", "Chicago", "其他"] as const;

export const CHART_REQUIREMENTS = ["需要", "不需要"] as const;

export const REPORT_STYLES = [
  "高中生自然報告風格",
  "90 分以上學校報告風格",
  "學術研究風格",
  "商業顧問風格",
  "口語簡報風格",
  "深度研究報告風格",
] as const;

export const REPORT_LENGTHS = ["短版摘要", "一般報告", "完整報告", "深度研究"] as const;

export const FORMAL_TONE_OPTIONS = ["需要", "不需要"] as const;
export const CONVERSATIONAL_TONE_OPTIONS = ["不需要", "需要"] as const;
export const OUTPUT_LANGUAGES = ["繁體中文", "英文", "日文", "其他"] as const;

export type ResearchDepth = "quick" | "standard" | "deep";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportInput {
  topic: string;
  reportType: string;
  /** V3: academic level (國中／高中／大學／專業). Drives tone and reader framing. */
  academicLevel: string;
  /** Derived from academicLevel; retained for engine/export compatibility. */
  targetAudience: string;
  /** Research workflow depth. Drives source-count guidance, quality threshold, and section depth. */
  researchDepth: ResearchDepth;
  purpose: string;
  /** V3: when set to a TopicCategory, overrides AI domain detection. "" = auto. */
  domainOverride: string;
  mode: string;
  sourceRequirement: string;
  citationFormat: string;
  chartRequirement: string;
  style: string;
  length: string;
  wordCount: string;
  formalTone: string;
  conversationalTone: string;
  specifiedStructure: string;
  rubric: string;
  personalStyle: string;
  supplementalMaterials: string;
  outputLanguage: string;
  rewriteSection: string;
  additionalInfo: string;
  acceptedSources: SourceRecord[];
}

export type TopicCategory =
  | "生物／動物"
  | "科學實驗"
  | "社會議題"
  | "歷史／地理／公民"
  | "讀書心得"
  | "商業／產品分析"
  | "AI／網站／程式專案"
  | "醫療／長照／社工／心理"
  | "食品／飲食文化"
  | "化學／化工"
  | "一般學校報告";

/** All categories in display order — used by the UI domain-override dropdown and
 *  to validate ReportInput.domainOverride. */
export const TOPIC_CATEGORIES: readonly TopicCategory[] = [
  "生物／動物",
  "科學實驗",
  "社會議題",
  "歷史／地理／公民",
  "讀書心得",
  "商業／產品分析",
  "AI／網站／程式專案",
  "醫療／長照／社工／心理",
  "食品／飲食文化",
  "化學／化工",
  "一般學校報告",
];

export interface SuggestionBlock {
  title: string;
  position: string;
  purpose: string;
  content: string;
}

export interface DataRequirementRow {
  type: string;
  need: string;
  use: string;
  priority: "高" | "中" | "低";
}

export interface QualityCheck {
  label: string;
  passed: boolean;
  reason?: string;
}

export interface SlideItem {
  page: number;
  title: string;
  points: string[];
  visual: string;
}

export type BlockType =
  | "paragraph"
  | "list"
  | "note"
  | "suggestions"
  | "dataTable"
  | "quality"
  | "slides";

export interface ContentBlock {
  type: BlockType;
  text?: string;
  items?: string[];
  suggestions?: SuggestionBlock[];
  suggestionKind?: "圖表" | "圖片" | "流程圖";
  rows?: DataRequirementRow[];
  checks?: QualityCheck[];
  slides?: SlideItem[];
}

export interface ReportSection {
  heading: string;
  blocks: ContentBlock[];
}

export interface ReportMeta {
  title: string;
  category: TopicCategory;
  versionLabel: string;
  completeness: number;
  suggestedAdditions: string[];
  acceptedSources: SourceRecord[];
  bibliography: BibliographyEntry[];
  researchDraft?: unknown;
  qualityReport?: unknown;
  evidenceCards?: unknown;
}

export interface GeneratedReport {
  meta: ReportMeta;
  shortTopic?: { message: string; expansions: string[] };
  sections: ReportSection[];
}

export interface TopicExpansionCard {
  title: string;
  angle: string;
  reason: string;
  researchValue?: string;
  dataDirections?: string[];
  chineseKeywords?: string[];
  englishKeywords?: string[];
  suggestedQuery?: string;
  searchBoundary?: string;
  excludedTerms?: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chars(s: string): number {
  return Array.from(s.trim()).length;
}

function has(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

const SOURCE_NOTE = "資料來源待補；建議查詢政府網站、學術論文、期刊、出版社或可信機構資料。";
const INSERT_SOURCE_NOTE = "【此處建議加入資料來源】此處需要補充官方資料或學術資料。";

function needsSource(input: ReportInput): boolean {
  return input.sourceRequirement !== "不需要";
}

function wantsReferences(input: ReportInput): boolean {
  return input.sourceRequirement === "需要，並生成參考文獻格式";
}

function hasAcceptedSources(input: ReportInput): boolean {
  return input.acceptedSources.some((source) => source.reviewState === "accepted");
}

function hasUserSources(input: ReportInput): boolean {
  if (hasAcceptedSources(input)) return true;
  const text = `${input.supplementalMaterials}\n${input.additionalInfo}`;
  return /https?:\/\/|doi|DOI|作者|出版社|政府|期刊|論文|資料來源|參考/.test(text);
}

function userMaterialLines(input: ReportInput): string[] {
  const lines: string[] = [];
  if (input.wordCount.trim()) lines.push(`字數需求：${input.wordCount.trim()}`);
  if (input.specifiedStructure.trim()) lines.push(`指定段落架構：${input.specifiedStructure.trim()}`);
  if (input.rubric.trim()) lines.push(`評分標準或檢核表：${input.rubric.trim()}`);
  if (input.personalStyle.trim()) lines.push(`個人寫作風格要求：${input.personalStyle.trim()}`);
  if (input.supplementalMaterials.trim()) lines.push(`使用者補充資料或參考來源：${input.supplementalMaterials.trim()}`);
  if (input.rewriteSection.trim()) lines.push(`指定重寫章節：${input.rewriteSection.trim()}`);
  if (input.additionalInfo.trim()) lines.push(`其他補充資料：${input.additionalInfo.trim()}`);
  return lines;
}

type NormalizedMode =
  | "structure"
  | "full"
  | "data"
  | "charts"
  | "quality"
  | "rewrite"
  | "eric"
  | "slides";

function normalizeMode(mode: string): NormalizedMode {
  switch (mode) {
    case "直接生成完整報告":
    case "完整報告":
      return "full";
    case "只生成資料需求表":
    case "資料需求表":
      return "data";
    case "只生成圖表與圖片建議":
    case "圖表與圖片建議":
      return "charts";
    case "只生成品質檢查表":
      return "quality";
    case "只重寫指定章節":
      return "rewrite";
    case "Eric 研究模式":
      return "eric";
    case "簡報大綱":
      return "slides";
    case "先建立報告架構":
    case "報告架構":
    default:
      return "structure";
  }
}

// ─── Topic category detection ────────────────────────────────────────────────

export function detectTopicCategory(
  topic: string,
  reportType: string,
  purpose: string,
): TopicCategory {
  const t = topic.toLowerCase();
  const tt = topic;
  const rt = reportType;
  const pp = purpose;

  // Book reflection — strongest signals first
  if (
    /[《〈].+[》〉]/.test(tt) ||
    has(tt, ["心得", "讀後", "讀書"]) ||
    has(rt, ["讀書心得", "讀書", "心得"]) ||
    has(pp, ["讀書心得"])
  ) {
    return "讀書心得";
  }

  // Science experiment
  if (
    has(rt, ["實驗", "科展"]) ||
    has(pp, ["實驗報告", "科展報告"]) ||
    has(tt, ["實驗", "氧化", "發酵", "溶解", "酸鹼", "ph", "結晶", "電解"]) ||
    (has(tt, ["溫度", "光照", "濃度", "速率", "生長", "影響"]) && has(tt, ["對", "影響", "速率", "之"]))
  ) {
    return "科學實驗";
  }

  // Food / culinary / beverage — MUST precede biology so "牛排" → food, not animal
  if (
    has(pp, ["飲食", "食品", "料理", "餐飲"]) ||
    has(rt, ["飲食", "食品", "料理"]) ||
    has(tt, [
      // eggs as food (checked before bare animal keyword "雞")
      "雞蛋", "鴨蛋", "鵝蛋", "鹹蛋", "皮蛋", "蛋類", "蛋品", "雞蛋營養",
      // animal-origin food compounds (checked before bare animal keywords)
      "牛排", "牛肉", "雞排", "雞肉", "豬排", "豬肉", "羊肉", "海鮮", "魚片", "魚排",
      // beverages
      "咖啡", "茶葉", "奶茶", "果汁", "飲料", "啤酒", "紅酒", "白酒", "牛奶",
      // culinary / food industry
      "水餃", "餃子", "dumpling", "薯條", "炸薯條", "速食薯條", "馬鈴薯條", "french fries", "fries",
      "料理", "烹飪", "烹調", "飲食", "食品", "食物", "食材", "餐廳", "餐飲", "烘焙",
      "甜點", "零食", "麵包", "點心", "外食", "速食", "有機食", "素食", "純素",
      "食安", "食品安全", "農產品", "熟成", "發酵食", "醃製", "保存食",
    ])
  ) {
    return "食品／飲食文化";
  }

  // Chemistry / materials / nutrition science
  if (
    has(tt, [
      "維生素", "礦物質", "蛋白質", "碳水化合物", "脂肪酸", "胺基酸", "膳食纖維",
      "化學", "化合物", "分子", "原子", "元素", "酵素", "化工", "高分子", "奈米",
      "有機化", "無機", "氧化還原", "催化", "合成", "聚合", "塑料", "陶瓷材料",
    ])
  ) {
    return "化學／化工";
  }

  // AI / website / programming project
  if (
    has(pp, ["網站", "程式", "ai", "AI"]) ||
    has(rt, ["網站", "程式", "AI"]) ||
    has(t, ["ai", "app", "bridge", "python", "ollama", "api", "演算法"]) ||
    has(tt, [
      "網站", "程式", "系統", "平台", "工具", "自動化", "資料庫", "演算法",
      "人工智慧", "機器學習", "生成器", "深度學習", "大型語言模型", "神經網路",
    ])
  ) {
    return "AI／網站／程式專案";
  }

  // Business / product / industry analysis — includes well-known company names
  if (
    has(pp, ["商業分析"]) ||
    has(rt, ["商業", "市場"]) ||
    has(tt, [
      "商業模式", "競品", "行銷", "品牌", "產品分析", "市場", "營收", "獲利", "創業", "電商",
      // company names & industry terms
      "台積電", "鴻海", "聯發科", "聯電", "華碩", "宏碁", "中華電信", "台灣大哥大",
      "TSMC", "tsmc", "股票", "半導體", "晶片", "晶圓", "積體電路", "投資",
      "上市公司", "股市", "產業鏈", "供應鏈", "企業策略", "競爭力",
    ])
  ) {
    return "商業／產品分析";
  }

  // Medical / long-term care / social work / psychology
  if (
    has(tt, [
      "長照", "失智", "社工", "焦慮", "憂鬱", "心理", "醫療", "護理", "照顧", "照護",
      "復健", "諮商", "高齡照", "安寧", "身心", "成癮", "自殺防治", "心理學",
    ])
  ) {
    return "醫療／長照／社工／心理";
  }

  // Social issues
  if (
    has(rt, ["社會議題"]) ||
    has(tt, [
      "少子化", "高齡化", "霸凌", "詐騙", "交通安全", "環保", "污染", "性別", "平權",
      "貧富", "失業", "移工", "氣候變遷", "假訊息", "成癮", "公共", "權益",
      // sustainability / SDGs
      "SDG", "sdg", "永續發展", "永續", "ESG", "esg", "淨零", "碳中和", "聯合國永續",
    ]) ||
    (has(tt, ["影響"]) && has(tt, ["學生", "青少年", "社會", "兒童"]))
  ) {
    return "社會議題";
  }

  // History / geography / civics
  if (
    has(tt, [
      "古蹟", "歷史", "地理", "地形", "公民", "選舉", "投票", "創生", "朝代", "戰爭",
      "鄭成功", "清朝", "日治", "氣候", "河川", "山脈", "文化資產", "條約", "制度",
    ])
  ) {
    return "歷史／地理／公民";
  }

  // Biology / animal — bare animal keywords; food compounds already caught above
  if (
    has(tt, [
      "鵝", "貓", "狗", "蚯蚓", "蝴蝶", "青蛙", "魚", "蜜蜂", "雞", "鴨", "豬", "牛",
      "羊", "馬", "兔", "鳥", "昆蟲", "植物", "動物", "細菌", "病毒", "生態", "物種",
      "螞蟻", "蜘蛛", "蛇", "龜", "鯨", "獅", "虎", "熊", "猴", "象",
    ])
  ) {
    return "生物／動物";
  }

  return "一般學校報告";
}

// ─── Short-topic detection & expansion ───────────────────────────────────────

const BROAD_TOPICS = ["鵝", "ai", "咖啡", "手機", "社工", "長照", "台南", "貓", "狗", "水", "電", "茶"];

export function isShortTopic(topic: string): boolean {
  const t = topic.trim();
  if (!t) return false;
  return chars(t) <= 4 || BROAD_TOPICS.includes(t.toLowerCase());
}

type TopicExpansionKind =
  | "nature"
  | "food"
  | "tech"
  | "education"
  | "environment"
  | "culture"
  | "scienceExperiment"
  | "business"
  | "care"
  | "book"
  | "general";

function topicExpansionKind(topic: string, category?: TopicCategory): TopicExpansionKind {
  const t = topic.trim();
  const lower = t.toLowerCase();

  if (has(t, ["花語", "茶文化", "廟宇", "動漫", "流行音樂", "藝術", "文化"])) return "culture";
  if (has(t, ["花朵", "植物", "蜜蜂", "細菌", "海龜", "昆蟲", "生態", "物種"])) return "nature";
  if (has(t, ["水餃", "餃子", "dumpling", "薯條", "炸薯條", "速食薯條", "馬鈴薯條", "french fries", "fries", "可樂", "咖啡", "泡麵", "手搖飲", "早餐", "飲料", "奶茶", "速食", "食品"])) return "food";
  if (has(lower, ["ai"]) || has(t, ["短影音", "手機", "社群媒體", "電動車", "人工智慧", "演算法", "平台"])) return "tech";
  if (has(t, ["睡眠", "注意力", "考試壓力", "補習", "閱讀", "學習", "壓力"])) return "education";
  if (has(t, ["氣候變遷", "都市熱島", "空氣污染", "少子化", "夜市文化", "環境", "污染", "永續"])) return "environment";

  switch (category) {
    case "生物／動物":
      return "nature";
    case "食品／飲食文化":
    case "化學／化工":
      return "food";
    case "AI／網站／程式專案":
      return "tech";
    case "醫療／長照／社工／心理":
      return "care";
    case "社會議題":
    case "歷史／地理／公民":
      return "environment";
    case "商業／產品分析":
      return "business";
    case "科學實驗":
      return "scienceExperiment";
    case "讀書心得":
      return "book";
    default:
      return "general";
  }
}

function expansionCard(title: string, angle: string, reason: string): TopicExpansionCard {
  const topicTerms = normalizeTerms(
    title
      .replace(/[「」《》〈〉]/g, " ")
      .split(/[\s，,、：:；;。！？!?（）()]+/)
      .filter((term) => chars(term) >= 2),
  );
  return {
    title,
    angle,
    reason,
    researchValue: reason,
    dataDirections: [angle, "官方統計或資料庫", "期刊／機構研究", "案例或標示資料"],
    chineseKeywords: normalizeTerms([...topicTerms.slice(0, 3), angle]),
    englishKeywords: ["official data", "systematic review", "case study"],
    suggestedQuery: buildSuggestedQuery(title, [angle], ["official data", "systematic review"]),
    searchBoundary: "保持研究對象與題目一致，避免只做作文式聯想或個人心得。",
  };
}

function normalizeTerms(terms: string[]): string[] {
  return Array.from(new Set(terms.map((term) => term.trim()).filter(Boolean)));
}

function buildSuggestedQuery(
  topic: string,
  chineseKeywords: string[] = [],
  englishKeywords: string[] = [],
): string {
  return normalizeTerms([topic, ...chineseKeywords.slice(0, 3), ...englishKeywords.slice(0, 2)]).join(" ");
}

function plannerCard(
  title: string,
  angle: string,
  reason: string,
  extras: Omit<TopicExpansionCard, "title" | "angle" | "reason"> = {},
): TopicExpansionCard {
  return {
    title,
    angle,
    reason,
    ...extras,
  };
}

function natureExpansionCards(topic: string): TopicExpansionCard[] {
  const t = topic || "自然主題";
  if (has(t, ["花朵", "植物"])) {
    return [
      plannerCard(`${t}如何透過授粉與繁殖維持族群`, "生態", "可觀察花粉、昆蟲互動與植物繁殖方式。", {
        researchValue: "釐清花朵如何靠授粉與繁殖維持族群，適合連結生態、農業與觀察資料。",
        dataDirections: ["授粉研究", "植物繁殖", "昆蟲互動", "生態系資料"],
        chineseKeywords: ["花朵", "授粉", "植物繁殖", "生態系"],
        englishKeywords: ["pollination", "plant reproduction", "ecology", "flower ecology"],
        suggestedQuery: buildSuggestedQuery(t, ["花朵", "授粉", "植物繁殖"], ["pollination", "plant reproduction", "ecology"]),
        searchBoundary: "避免只寫花語或美感心得，需鎖定授粉與繁殖的研究資料。",
      }),
      plannerCard(`${t}在校園或城市環境中的生長條件`, "校園觀察", "適合做實地觀察，記錄光照、水分與季節差異。", {
        researchValue: "把花朵放進實際場域觀察，有助比較光照、水分、季節與棲地條件。",
        dataDirections: ["校園觀察", "城市綠化", "光照與水分", "季節變化"],
        chineseKeywords: ["花朵", "校園觀察", "光照", "水分", "季節"],
        englishKeywords: ["flower growth conditions", "urban ecology", "light", "water", "seasonal change"],
        suggestedQuery: buildSuggestedQuery(t, ["校園觀察", "光照", "水分"], ["flower growth conditions", "urban ecology"]),
        searchBoundary: "避免偏到純心得或一般生活連結，需保留可觀察條件與環境變因。",
      }),
      plannerCard(`${t}與蜜蜂等昆蟲互動對生態系的影響`, "生物互動", "可連結授粉者、食物網與生物多樣性。", {
        researchValue: "花朵與授粉昆蟲的互動可對應到生物多樣性、食物網與授粉效率。",
        dataDirections: ["授粉者研究", "食物網", "生物多樣性", "授粉效率"],
        chineseKeywords: ["花朵", "蜜蜂", "授粉者", "生物多樣性"],
        englishKeywords: ["pollinator", "bee", "food web", "biodiversity"],
        suggestedQuery: buildSuggestedQuery(t, ["蜜蜂", "授粉者", "生物多樣性"], ["pollinator", "bee", "biodiversity"]),
        searchBoundary: "避免把主題擴成所有昆蟲研究，需回到花朵與授粉互動。",
      }),
      plannerCard(`${t}在花卉文化與節慶中的象徵意義`, "文化", "研究自然物如何在節慶、儀式與地方生活中形成象徵意義。", {
        researchValue: "若要連結文化面，可以研究花卉如何在節慶、儀式與地方習俗中被賦予意義。",
        dataDirections: ["花卉文化", "節慶使用", "象徵意義", "民俗資料"],
        chineseKeywords: ["花朵", "花卉文化", "節慶", "象徵意義"],
        englishKeywords: ["flower culture", "festival", "symbolism", "floral meaning"],
        suggestedQuery: buildSuggestedQuery(t, ["花卉文化", "節慶", "象徵意義"], ["flower culture", "festival", "symbolism"]),
        searchBoundary: "避免只寫抒情心得，需連到民俗、文化或社會脈絡。",
      }),
      plannerCard(`${t}面對氣候與季節變化的適應方式`, "環境變化", "可分析開花時間、溫度與降雨對生長的影響。", {
        researchValue: "可用來研究氣候、溫度與降雨變化如何影響花期與生長節奏。",
        dataDirections: ["花期變化", "氣候因素", "溫度資料", "降雨資料"],
        chineseKeywords: ["花朵", "花期", "氣候變化", "溫度", "降雨"],
        englishKeywords: ["flowering time", "climate change", "temperature", "rainfall"],
        suggestedQuery: buildSuggestedQuery(t, ["花期", "氣候變化", "溫度"], ["flowering time", "climate change"]),
        searchBoundary: "避免把主題寫成泛用環境議題，仍需緊扣花朵與花期。",
      }),
    ];
  }
  if (has(t, ["蜜蜂"])) {
    return [
      plannerCard("蜜蜂授粉對農業生產與生態系的影響", "生態", "可分析作物授粉、生物多樣性與糧食安全。", {
        researchValue: "從農業生產與生態系兩端看蜜蜂授粉的重要性，適合找作物產量與糧食安全資料。",
        dataDirections: ["作物授粉", "糧食安全", "生物多樣性", "農業資料"],
        chineseKeywords: ["蜜蜂", "授粉", "農業生產", "糧食安全"],
        englishKeywords: ["bee pollination", "agricultural production", "biodiversity", "food security"],
        suggestedQuery: buildSuggestedQuery(t, ["授粉", "農業生產", "糧食安全"], ["bee pollination", "food security"]),
        searchBoundary: "避免只談養蜂趣聞，需保留農業與生態證據。",
      }),
      plannerCard("蜜蜂族群減少可能反映哪些環境問題", "環境", "適合討論農藥、棲地變化與氣候因素。", {
        researchValue: "可追查蜜蜂數量變化背後的環境壓力，例如農藥、棲地變化與氣候因素。",
        dataDirections: ["農藥影響", "棲地變化", "氣候因素", "環境監測"],
        chineseKeywords: ["蜜蜂族群", "農藥", "棲地", "氣候因素"],
        englishKeywords: ["bee population", "pesticides", "habitat change", "climate factors"],
        suggestedQuery: buildSuggestedQuery(t, ["農藥", "棲地變化", "氣候因素"], ["bee population", "pesticides"]),
        searchBoundary: "避免把問題泛化成所有昆蟲消失，重點仍是蜜蜂族群。",
      }),
      plannerCard("蜂巢分工如何展現昆蟲社會行為", "行為科學", "可整理蜂后、工蜂與群體溝通。", {
        researchValue: "可從分工、溝通與群體組織理解蜜蜂的社會行為。",
        dataDirections: ["社會性昆蟲", "分工", "群體溝通", "行為生態"],
        chineseKeywords: ["蜂巢", "分工", "群體溝通", "社會行為"],
        englishKeywords: ["social insects", "division of labor", "communication", "bee colony"],
        suggestedQuery: buildSuggestedQuery(t, ["蜂巢分工", "群體溝通", "社會行為"], ["social insects", "division of labor"]),
        searchBoundary: "避免只寫生物介紹，需落到分工與行為資料。",
      }),
      plannerCard("蜂產品與人類生活的關係", "生活應用", "可連結蜂蜜、蜂蠟與食品安全。", {
        researchValue: "若要偏生活應用，可整理蜂蜜、蜂蠟與相關產品的用途、品質與食安。",
        dataDirections: ["蜂蜜", "蜂蠟", "食品安全", "產品應用"],
        chineseKeywords: ["蜂產品", "蜂蜜", "蜂蠟", "食品安全"],
        englishKeywords: ["bee products", "honey", "beeswax", "food safety"],
        suggestedQuery: buildSuggestedQuery(t, ["蜂產品", "蜂蜜", "蜂蠟"], ["bee products", "honey", "beeswax"]),
        searchBoundary: "避免變成購物介紹，需保留品質與安全研究面向。",
      }),
      plannerCard("校園或社區如何營造友善授粉環境", "行動方案", "可提出種植蜜源植物與減少農藥的策略。", {
        researchValue: "把研究延伸到行動面，可看校園與社區如何改善授粉環境。",
        dataDirections: ["友善授粉", "蜜源植物", "農藥減量", "社區行動"],
        chineseKeywords: ["蜜蜂", "友善授粉", "蜜源植物", "農藥減量"],
        englishKeywords: ["pollinator friendly", "nectar plants", "pesticide reduction", "community action"],
        suggestedQuery: buildSuggestedQuery(t, ["友善授粉", "蜜源植物", "農藥減量"], ["pollinator friendly", "community action"]),
        searchBoundary: "避免把主題寫成活動企劃，仍要回到可查證的環境資料。",
      }),
    ];
  }
  if (has(t, ["細菌"])) {
    return [
      plannerCard("細菌在人體健康與腸道微生態中的角色", "健康", "研究益菌、感染風險與日常衛生之間的關係。", {
        researchValue: "可從健康與腸道微生態兩端，研究細菌與人體共生或致病的關係。",
        dataDirections: ["腸道微生態", "感染風險", "益菌研究", "衛生資料"],
        chineseKeywords: ["細菌", "腸道微生態", "健康", "益菌"],
        englishKeywords: ["bacteria", "gut microbiome", "health", "probiotics"],
        suggestedQuery: buildSuggestedQuery(t, ["腸道微生態", "健康", "益菌"], ["bacteria", "gut microbiome"]),
        searchBoundary: "避免只寫一般科普，需進到具體健康或微生態研究。",
      }),
      plannerCard("細菌如何參與分解與物質循環", "生態", "可連結土壤、腐敗與自然循環。", {
        researchValue: "可研究細菌在分解、土壤與物質循環中的角色。",
        dataDirections: ["分解作用", "土壤生態", "物質循環", "腐敗資料"],
        chineseKeywords: ["細菌", "分解", "物質循環", "土壤生態"],
        englishKeywords: ["decomposition", "nutrient cycling", "soil bacteria", "ecology"],
        suggestedQuery: buildSuggestedQuery(t, ["分解", "物質循環", "土壤生態"], ["decomposition", "nutrient cycling"]),
        searchBoundary: "避免離題到整個生態系統概論，仍要聚焦細菌。",
      }),
      plannerCard("抗生素使用與抗藥性問題", "公共衛生", "適合討論用藥觀念與醫療挑戰。", {
        researchValue: "適合從公共衛生角度分析抗生素使用與抗藥性。",
        dataDirections: ["抗藥性", "用藥行為", "公共衛生", "醫療資料"],
        chineseKeywords: ["抗生素", "抗藥性", "公共衛生", "用藥"],
        englishKeywords: ["antibiotic resistance", "antibiotic use", "public health", "drug resistance"],
        suggestedQuery: buildSuggestedQuery(t, ["抗生素", "抗藥性", "公共衛生"], ["antibiotic resistance", "public health"]),
        searchBoundary: "避免變成醫療宣導文，需連結研究與統計資料。",
      }),
      plannerCard("食品保存如何抑制細菌生長", "食品安全", "可比較溫度、水分與保存方式。", {
        researchValue: "可比較冷藏、加熱、乾燥等保存方式如何影響細菌生長。",
        dataDirections: ["食品保存", "溫度控制", "水分活性", "食品安全"],
        chineseKeywords: ["細菌", "食品保存", "冷藏", "食品安全"],
        englishKeywords: ["food preservation", "bacterial growth", "temperature control", "food safety"],
        suggestedQuery: buildSuggestedQuery(t, ["食品保存", "食品安全", "冷藏"], ["food preservation", "bacterial growth"]),
        searchBoundary: "避免只寫廚房常識，需保留保存條件與細菌生長資料。",
      }),
      plannerCard("細菌觀察實驗的安全設計", "實驗方法", "可規劃培養限制、變因與安全規範。", {
        researchValue: "若主題需要實驗設計，可研究觀察細菌時的變因與安全規範。",
        dataDirections: ["實驗設計", "變因控制", "培養限制", "安全規範"],
        chineseKeywords: ["細菌觀察", "實驗設計", "變因", "安全規範"],
        englishKeywords: ["bacteria observation", "experimental design", "variables", "biosafety"],
        suggestedQuery: buildSuggestedQuery(t, ["細菌觀察", "實驗設計", "安全規範"], ["experimental design", "biosafety"]),
        searchBoundary: "避免把主題寫成實作教學，仍需保留研究設計思維。",
      }),
    ];
  }
  return [
    plannerCard(`${t}的棲地需求與生存策略`, "生態", "可分析環境條件、食物來源與族群變化。", {
      researchValue: "先把研究對象收斂到可觀察的棲地與生存條件，再往外找證據。",
      dataDirections: ["棲地條件", "生存策略", "族群變化", "環境因素"],
      chineseKeywords: [t, "棲地需求", "生存策略", "生態"],
      englishKeywords: ["habitat", "survival strategy", "ecology", "population change"],
      suggestedQuery: buildSuggestedQuery(t, ["棲地需求", "生存策略", "生態"], ["habitat", "survival strategy"]),
      searchBoundary: "避免只寫概念介紹，需鎖定可查證的環境與行為資料。",
    }),
    plannerCard(`${t}與其他生物之間的互動關係`, "生物互動", "可連結掠食、共生、競爭或授粉等關係。", {
      researchValue: "可透過生物互動把主題放進更完整的生態關係中。",
      dataDirections: ["掠食", "共生", "競爭", "授粉"],
      chineseKeywords: [t, "生物互動", "掠食", "共生"],
      englishKeywords: ["interaction", "predation", "symbiosis", "competition"],
      suggestedQuery: buildSuggestedQuery(t, ["生物互動", "掠食", "共生"], ["interaction", "predation"]),
      searchBoundary: "避免擴散到無關物種，仍需回到本題目本身。",
    }),
    plannerCard(`${t}面臨的人為威脅與保育方法`, "保育", "適合討論污染、棲地破壞與保護行動。", {
      researchValue: "可把研究重點放在威脅來源與保育措施的比較。",
      dataDirections: ["人為威脅", "棲地破壞", "保育方法", "政策行動"],
      chineseKeywords: [t, "人為威脅", "保育", "棲地破壞"],
      englishKeywords: ["conservation", "human impact", "habitat loss", "threats"],
      suggestedQuery: buildSuggestedQuery(t, ["人為威脅", "保育", "棲地破壞"], ["conservation", "habitat loss"]),
      searchBoundary: "避免變成單純倡議，需有威脅與措施的資料基礎。",
    }),
    plannerCard(`${t}在地方文化或日常生活中的意義`, "文化", "可整理人類如何理解與使用自然資源。", {
      researchValue: "若需要文化面切入，可以從地方生活或使用習慣整理其意義。",
      dataDirections: ["地方文化", "日常生活", "資源使用", "民俗資料"],
      chineseKeywords: [t, "地方文化", "日常生活", "民俗"],
      englishKeywords: ["local culture", "daily life", "cultural meaning", "folk practice"],
      suggestedQuery: buildSuggestedQuery(t, ["地方文化", "日常生活", "民俗"], ["local culture", "daily life"]),
      searchBoundary: "避免只寫心得或作文式聯想，需保留文化研究脈絡。",
    }),
    plannerCard(`${t}的校園或社區觀察研究設計`, "觀察方法", "可規劃觀察地點、紀錄方式與倫理注意事項。", {
      researchValue: "可把題目轉成可實作的觀察型研究，明確規劃觀察方法。",
      dataDirections: ["觀察設計", "紀錄方式", "場域選擇", "倫理注意"],
      chineseKeywords: [t, "觀察研究", "校園", "社區"],
      englishKeywords: ["observation study", "fieldwork", "research design", "ethics"],
      suggestedQuery: buildSuggestedQuery(t, ["觀察研究", "校園", "社區"], ["observation study", "research design"]),
      searchBoundary: "避免把主題做成單純活動設計，仍需可蒐證。",
    }),
  ];
}

function foodExpansionCards(topic: string): TopicExpansionCard[] {
  const t = topic || "食品";
  if (has(t, ["水餃", "餃子", "dumpling"])) {
    return [
      plannerCard("水餃在台灣飲食文化中的演變", "飲食文化", "可追查家常料理、節慶與地方飲食的變化。", {
        researchValue: "把水餃視為飲食文化與地方生活的一部分，而不是只當成日常食物。",
        dataDirections: ["飲食文化", "地方飲食", "歷史資料", "民俗資料"],
        chineseKeywords: ["水餃", "飲食文化", "台灣", "地方料理"],
        englishKeywords: ["dumpling", "food culture", "Taiwan", "culinary history"],
        suggestedQuery: buildSuggestedQuery(t, ["水餃", "飲食文化", "台灣"], ["dumpling", "food culture", "Taiwan"]),
        searchBoundary: "避免只寫口味或個人喜好，需查文化與歷史資料。",
        excludedTerms: ["食譜", "料理教學", "餐廳推薦"],
      }),
      plannerCard("冷凍水餃與現包水餃的營養差異", "營養比較", "可比較營養標示、鈉含量與加工差異。", {
        researchValue: "這是一個可直接查營養資料與食品標示的研究題目。",
        dataDirections: ["營養標示", "鈉含量", "加工方式", "食品資料庫"],
        chineseKeywords: ["冷凍水餃", "現包水餃", "營養標示", "鈉含量"],
        englishKeywords: ["frozen dumpling", "fresh dumpling", "nutrition label", "sodium"],
        suggestedQuery: buildSuggestedQuery(t, ["冷凍水餃", "營養標示", "鈉含量"], ["frozen dumpling", "nutrition label"]),
        searchBoundary: "避免只做口感比較，需保留營養與加工差異。",
        excludedTerms: ["食譜", "手作教學", "餐廳推薦"],
      }),
      plannerCard("水餃內餡組成對熱量與營養的影響", "成分分析", "可分析豬肉、蔬菜、海鮮等內餡差異。", {
        researchValue: "可把研究焦點放在內餡組成如何改變熱量、脂肪與蛋白質。",
        dataDirections: ["內餡組成", "熱量", "脂肪", "蛋白質"],
        chineseKeywords: ["水餃內餡", "熱量", "脂肪", "蛋白質"],
        englishKeywords: ["dumpling filling", "calories", "fat", "protein"],
        suggestedQuery: buildSuggestedQuery(t, ["水餃內餡", "熱量", "脂肪"], ["dumpling filling", "calories"]),
        searchBoundary: "避免變成菜單介紹，需回到營養成分資料。",
        excludedTerms: ["料理做法", "包餡技巧"],
      }),
      plannerCard("市售冷凍水餃鈉含量與健康風險比較", "健康風險", "可比較不同品牌或口味的鈉含量與攝取風險。", {
        researchValue: "可直接找食品標示與健康建議，形成可查證的研究方向。",
        dataDirections: ["鈉含量", "品牌比較", "健康風險", "食品標示"],
        chineseKeywords: ["冷凍水餃", "鈉含量", "健康風險", "食品標示"],
        englishKeywords: ["frozen dumpling", "sodium intake", "health risk", "food label"],
        suggestedQuery: buildSuggestedQuery(t, ["冷凍水餃", "鈉含量", "健康風險"], ["frozen dumpling", "sodium intake"]),
        searchBoundary: "避免把主題變成減肥建議文，需依據標示與資料比較。",
        excludedTerms: ["減肥神話", "個人偏方"],
      }),
    ];
  }
  if (has(t, ["薯條", "炸薯條", "速食薯條", "馬鈴薯條", "french fries", "fries"])) {
    return [
      plannerCard("速食薯條的營養成分與鈉含量分析", "營養標示", "可比較熱量、脂肪、鈉含量與份量差異。", {
        researchValue: "把薯條從日常食物轉成可查食品標示與營養資料的研究題目。",
        dataDirections: ["營養標示", "鈉含量", "熱量", "速食資料"],
        chineseKeywords: ["薯條", "速食", "營養成分", "鈉含量", "熱量"],
        englishKeywords: ["french fries", "fast food", "nutrition", "sodium", "calories"],
        suggestedQuery: buildSuggestedQuery(t, ["薯條", "營養成分", "鈉含量"], ["french fries", "nutrition", "sodium"]),
        searchBoundary: "避免只寫口味或餐廳推薦，需保留營養與標示資料。",
        excludedTerms: ["餐廳推薦", "食譜", "口味排行"],
      }),
      plannerCard("油炸方式與薯條食品安全風險", "食品安全", "可討論油炸溫度、用油品質與丙烯醯胺。", {
        researchValue: "可連到食品安全研究與機構風險說明，比單純健康口號更可蒐證。",
        dataDirections: ["油炸溫度", "用油品質", "丙烯醯胺", "食品安全"],
        chineseKeywords: ["薯條", "油炸", "丙烯醯胺", "食品安全"],
        englishKeywords: ["french fries", "frying", "acrylamide", "food safety"],
        suggestedQuery: buildSuggestedQuery(t, ["油炸", "丙烯醯胺", "食品安全"], ["french fries", "acrylamide"]),
        searchBoundary: "避免變成恐嚇式健康文，需引用食品安全研究或機構資料。",
        excludedTerms: ["減肥偏方", "網路傳言"],
      }),
      plannerCard("青少年速食薯條攝取與飲食習慣", "飲食行為", "可分析外食、速食配餐與營養攝取。", {
        researchValue: "把薯條放進青少年外食與速食消費情境，適合學校報告。",
        dataDirections: ["青少年", "速食", "外食", "飲食調查"],
        chineseKeywords: ["薯條", "青少年", "速食", "飲食習慣"],
        englishKeywords: ["french fries", "adolescents", "fast food", "dietary habits"],
        suggestedQuery: buildSuggestedQuery(t, ["青少年", "速食", "飲食習慣"], ["french fries", "dietary habits"]),
        searchBoundary: "避免只寫個人喜好，需回到飲食調查或公共衛生資料。",
      }),
      plannerCard("薯條包裝與速食供應鏈的環境負荷", "環境", "可從冷凍馬鈴薯、包裝與廢棄物切入。", {
        researchValue: "若要延伸環境面，可研究包裝、冷凍食品供應鏈與生命週期資料。",
        dataDirections: ["包裝廢棄物", "供應鏈", "冷凍馬鈴薯", "生命週期"],
        chineseKeywords: ["薯條", "包裝", "供應鏈", "環境負荷"],
        englishKeywords: ["french fries", "frozen potato products", "packaging", "life cycle assessment"],
        suggestedQuery: buildSuggestedQuery(t, ["包裝", "供應鏈", "環境"], ["frozen potato products", "life cycle assessment"]),
        searchBoundary: "避免泛化成所有速食環境問題，仍需回到薯條或馬鈴薯製品。",
      }),
    ];
  }
  if (has(t, ["可樂", "cola", "soda", "soft drink"])) {
    return [
      plannerCard("可樂成分與青少年健康影響", "健康", "可分析糖分、咖啡因與青少年飲用情境。", {
        researchValue: "這是最直接的健康研究方向，可對應含糖飲料與青少年資料。",
        dataDirections: ["糖分", "咖啡因", "青少年", "健康風險"],
        chineseKeywords: ["可樂", "含糖飲料", "青少年", "健康"],
        englishKeywords: ["cola", "sugar-sweetened beverage", "adolescent health", "caffeine"],
        suggestedQuery: buildSuggestedQuery(t, ["可樂", "含糖飲料", "青少年"], ["cola", "adolescent health", "caffeine"]),
        searchBoundary: "避免只寫健康口號，需回到成分與研究證據。",
        excludedTerms: ["減肥偏方", "網路傳言"],
      }),
      plannerCard("無糖可樂與含糖可樂成分比較", "成分比較", "可比較甜味劑、咖啡因與熱量差異。", {
        researchValue: "可以用產品標示直接比較，資料取得相對容易。",
        dataDirections: ["成分標示", "人工甜味劑", "熱量", "咖啡因"],
        chineseKeywords: ["無糖可樂", "含糖可樂", "成分比較", "人工甜味劑"],
        englishKeywords: ["diet cola", "regular cola", "ingredient comparison", "artificial sweeteners"],
        suggestedQuery: buildSuggestedQuery(t, ["無糖可樂", "成分比較", "人工甜味劑"], ["diet cola", "regular cola"]),
        searchBoundary: "避免只寫味道差異，需保留成分與標示比較。",
        excludedTerms: ["盲測心得", "口味排行"],
      }),
      plannerCard("可樂包裝與環境廢棄物問題", "環境", "可從塑膠瓶、鋁罐與回收制度切入。", {
        researchValue: "把飲料研究延伸到包裝廢棄物與回收行為，兼顧環境議題。",
        dataDirections: ["包裝材料", "回收制度", "塑膠廢棄物", "鋁罐"],
        chineseKeywords: ["可樂", "包裝", "回收", "塑膠瓶", "鋁罐"],
        englishKeywords: ["cola packaging", "recycling", "plastic bottle", "aluminum can"],
        suggestedQuery: buildSuggestedQuery(t, ["包裝", "回收", "塑膠瓶"], ["cola packaging", "recycling"]),
        searchBoundary: "避免只談環保口號，需保留包裝與廢棄物資料。",
        excludedTerms: ["資源回收標語", "環保宣傳"],
      }),
      plannerCard("可樂品牌廣告如何影響消費偏好", "廣告與消費", "可分析品牌形象、廣告語言與消費心理。", {
        researchValue: "這個題目適合找廣告、品牌與消費心理研究。",
        dataDirections: ["品牌形象", "廣告內容", "消費心理", "市場調查"],
        chineseKeywords: ["可樂廣告", "品牌形象", "消費心理", "消費偏好"],
        englishKeywords: ["cola advertising", "brand image", "consumer behavior", "marketing"],
        suggestedQuery: buildSuggestedQuery(t, ["可樂廣告", "品牌形象", "消費心理"], ["cola advertising", "consumer behavior"]),
        searchBoundary: "避免只寫廣告印象，需保留消費研究與市場資料。",
        excludedTerms: ["口號收集", "廣告片段欣賞"],
      }),
    ];
  }
  return [
    expansionCard(`${t}中的成分與攝取習慣對健康的影響`, "健康", "可分析營養標示、攝取量與青少年飲食習慣。"),
    expansionCard(`${t}品牌如何透過廣告塑造消費印象`, "行銷", "適合討論品牌、廣告語言與消費心理。"),
    expansionCard(`${t}包裝、製程與廢棄物對環境的影響`, "環境", "可連結回收、塑膠污染與企業責任。"),
    expansionCard(`${t}在日常飲食文化中的流行原因`, "文化", "分析生活方式、同儕影響與地方飲食習慣。"),
    expansionCard(`${t}的替代選擇是否真的比較健康`, "科學比較", "可比較糖分、添加物、營養標示或加工方式。"),
  ];
}

function techExpansionCards(topic: string): TopicExpansionCard[] {
  const t = topic || "科技主題";
  if (has(t, ["短影音", "短視頻", "tiktok", "reels", "youtube shorts", "社群媒體"])) {
    return [
      plannerCard(`${t}對注意力與學習效率的影響`, "注意力", "研究使用時間、分心情境與自我管理的關係。", {
        researchValue: "從認知與學習成效切入，最能直接支撐學生研究報告。",
        dataDirections: ["注意力", "學習效率", "使用時間", "自我管理"],
        chineseKeywords: ["短影音", "注意力", "學習效率", "學生"],
        englishKeywords: ["short video", "attention", "learning efficiency", "student"],
        suggestedQuery: buildSuggestedQuery(t, ["注意力", "學習效率", "學生"], ["short video", "attention"]),
        searchBoundary: "避免只寫抱怨或心得，需有學習與認知研究。",
      }),
      plannerCard(`${t}背後的演算法如何影響內容選擇`, "演算法", "適合分析推薦機制、資訊泡泡與平台責任。", {
        researchValue: "可研究平台推薦如何塑造使用者接觸到的內容。",
        dataDirections: ["推薦機制", "資訊泡泡", "平台責任", "內容暴露"],
        chineseKeywords: ["短影音", "演算法", "推薦機制", "內容選擇"],
        englishKeywords: ["recommendation algorithm", "filter bubble", "platform responsibility", "content exposure"],
        suggestedQuery: buildSuggestedQuery(t, ["演算法", "推薦機制", "資訊泡泡"], ["recommendation algorithm", "filter bubble"]),
        searchBoundary: "避免只談平台功能介紹，需保留資訊暴露與平台責任。",
      }),
      plannerCard(`${t}使用時間與睡眠品質的關係`, "睡眠", "可連結夜間使用、藍光與生活作息。", {
        researchValue: "這是和青少年生活最容易連結、也最容易找研究資料的方向。",
        dataDirections: ["使用時間", "睡眠品質", "藍光", "作息"],
        chineseKeywords: ["短影音", "睡眠品質", "藍光", "作息"],
        englishKeywords: ["screen time", "sleep quality", "blue light", "sleep habits"],
        suggestedQuery: buildSuggestedQuery(t, ["睡眠品質", "藍光", "作息"], ["screen time", "sleep quality"]),
        searchBoundary: "避免把問題泛化成所有手機使用，需保留短影音情境。",
      }),
      plannerCard(`${t}在青少年生活中的角色與風險`, "青少年", "分析社交、娛樂、隱私與心理壓力等青少年使用情境。", {
        researchValue: "若要聚焦族群，可把青少年當作研究對象而非課堂程度。",
        dataDirections: ["青少年", "社交", "隱私", "心理壓力"],
        chineseKeywords: ["短影音", "青少年", "心理壓力", "社交"],
        englishKeywords: ["adolescent", "social media", "privacy", "psychological stress"],
        suggestedQuery: buildSuggestedQuery(t, ["青少年", "心理壓力", "社交"], ["adolescent", "social media"]),
        searchBoundary: "避免只寫生活現象，需保留心理與社會風險資料。",
      }),
    ];
  }
  return [
    expansionCard(`${t}對注意力與學習習慣的影響`, "注意力", "分析使用時間、分心情境與自我管理。"),
    expansionCard(`${t}背後的演算法如何影響內容選擇`, "演算法", "適合分析推薦機制、資訊泡泡與平台責任。"),
    expansionCard(`${t}使用時間與睡眠品質的關係`, "睡眠", "可連結夜間使用、藍光與生活作息。"),
    expansionCard(`${t}在青少年生活中的角色與風險`, "青少年", "分析社交、娛樂、隱私與心理壓力。"),
    expansionCard(`${t}的產業發展與倫理議題`, "科技社會", "可整理創新應用、商業模式與監管問題。"),
  ];
}

function educationExpansionCards(topic: string): TopicExpansionCard[] {
  const t = topic || "學習主題";
  return [
    expansionCard(`${t}如何影響學生的學習表現`, "學習", "可整理習慣、環境與成效之間的關係。"),
    expansionCard(`${t}與心理壓力或情緒調節的關聯`, "心理", "適合討論壓力來源、調適策略與支持系統。"),
    expansionCard(`${t}在不同年齡學生身上的差異`, "教育階段", "可比較國中、高中或大學生的需求。"),
    expansionCard(`${t}的家庭與學校支持策略`, "支持系統", "可提出時間安排、師長協助與同儕互助。"),
    expansionCard(`${t}是否能透過習慣設計改善`, "行動方案", "適合設計可觀察、可執行的小型研究。"),
  ];
}

function environmentExpansionCards(topic: string): TopicExpansionCard[] {
  const t = topic || "社會議題";
  return [
    expansionCard(`${t}的成因與日常生活關聯`, "背景脈絡", "可整理自然因素、人為活動與生活場景。"),
    expansionCard(`${t}對不同族群或地區的影響`, "社會影響", "適合比較年齡、職業、城鄉或地方差異。"),
    expansionCard(`${t}的台灣在地案例與公共政策`, "在地案例", "整理政府資料、地方新聞與政策措施。"),
    expansionCard(`${t}可用哪些數據或指標觀察`, "統計資料", "可找近年統計、監測資料或官方報告。"),
    expansionCard(`面對${t}的可行改善策略`, "解決策略", "分析個人、學校、企業與政府的責任分工。"),
  ];
}

function cultureExpansionCards(topic: string): TopicExpansionCard[] {
  const t = topic || "文化主題";
  return [
    expansionCard(`${t}的歷史脈絡與形成原因`, "歷史", "可整理起源、時代背景與重要轉變。"),
    expansionCard(`${t}在日常生活中的象徵與功能`, "文化意義", "適合分析儀式、社群認同與生活方式。"),
    expansionCard(`${t}如何受到媒體與商業化影響`, "媒體與產業", "分析傳播、品牌化與消費文化的影響。"),
    expansionCard(`${t}在不同世代之間的理解差異`, "世代觀點", "可比較年輕族群、家庭與地方社群。"),
    expansionCard(`${t}的保存、創新與未來發展`, "文化保存", "可提出教育、展演、社區參與或數位化方向。"),
  ];
}

export function expandTopicCards(topic: string, category?: TopicCategory): TopicExpansionCard[] {
  const t = topic.trim() || "主題";
  switch (topicExpansionKind(t, category ?? detectTopicCategory(t, "", ""))) {
    case "nature":
      return natureExpansionCards(t);
    case "food":
      return foodExpansionCards(t);
    case "tech":
      return techExpansionCards(t);
    case "education":
      return educationExpansionCards(t);
    case "environment":
      return environmentExpansionCards(t);
    case "culture":
      return cultureExpansionCards(t);
    case "scienceExperiment":
      return [
        expansionCard(`不同條件對「${t}」的影響之實驗探討`, "實驗設計", "可設定自變因、應變因與控制變因。"),
        expansionCard(`「${t}」的變因分析與量化測量`, "數據", "適合規劃表格、重複測量與圖表呈現。"),
        expansionCard(`「${t}」實驗誤差來源與改進方法`, "誤差分析", "分析測量工具、環境干擾與操作差異。"),
        expansionCard(`「${t}」的原理驗證與生活應用`, "科學原理", "可把課本概念連結到日常現象。"),
        expansionCard(`「${t}」實驗安全與倫理注意事項`, "安全", "可列出材料限制、操作規範與風險管理。"),
      ];
    case "business":
      return [
        expansionCard(`「${t}」的目標客群與需求情境`, "市場", "可分析使用者痛點、購買動機與族群差異。"),
        expansionCard(`「${t}」的競品比較與差異化策略`, "競爭", "適合整理功能、價格、通路與品牌定位。"),
        expansionCard(`「${t}」的商業模式與收入來源`, "商業模式", "分析訂閱、廣告、銷售或服務費等收入來源。"),
        expansionCard(`「${t}」的成本、風險與執行限制`, "風險", "可評估資源、人力、法規與市場不確定性。"),
        expansionCard(`「${t}」未來擴張與永續經營方向`, "發展", "可提出產品迭代、合作與長期策略。"),
      ];
    case "care":
      return [
        expansionCard(`「${t}」的服務對象與需求分析`, "需求", "可整理使用者處境、照顧壓力與資源落差。"),
        expansionCard(`「${t}」的現況與主要挑戰`, "現況", "適合補充機構、政策或專業資料。"),
        expansionCard(`「${t}」相關制度與服務資源`, "制度", "可查政府、醫療或社福單位資訊。"),
        expansionCard(`「${t}」的案例分析與專業觀點`, "案例", "可比較情境差異，但需注意隱私與倫理。"),
        expansionCard(`面對「${t}」的支持策略與個人反思`, "支持", "可提出家庭、學校或社區層面的協助。"),
      ];
    case "book":
      return [
        expansionCard(`《${t}》的主題意識與核心問題`, "主旨", "可先整理作品想回應的問題。"),
        expansionCard(`《${t}》人物或情節如何推動主題`, "文本分析", "適合引用具體段落並說明作用。"),
        expansionCard(`《${t}》與個人生活經驗的連結`, "反思", "可把閱讀感受轉成具體觀察。"),
        expansionCard(`《${t}》值得討論的爭議或限制`, "批判", "可提出同意與不同意之處。"),
        expansionCard(`從《${t}》延伸出的行動或提問`, "延伸", "可連結課程、社會議題或後續閱讀。"),
      ];
    default:
      return [
        expansionCard(`「${t}」可以從哪些具體問題切入`, "研究問題", "先把大題目縮成可搜尋、可回答的問題。"),
        expansionCard(`「${t}」與日常生活或課程內容的關聯`, "生活連結", "可找出讀者容易理解的情境。"),
        expansionCard(`「${t}」有哪些可比較的不同觀點`, "比較", "適合整理支持、反對或不同族群看法。"),
        expansionCard(`「${t}」可用哪些資料類型佐證`, "資料策略", "可規劃官方資料、學術文章、新聞或案例。"),
        expansionCard(`「${t}」的限制與下一步研究方向`, "研究限制", "可先標示缺口，避免過度推論。"),
      ];
  }
}

export function expandTopic(topic: string, category?: TopicCategory): string[] {
  return expandTopicCards(topic, category).map((card) => card.title);
}

// ─── Category content model ──────────────────────────────────────────────────

interface CustomSection {
  heading: string;
  body: string;
}

interface CategoryContent {
  summaryDirection: string; // 摘要方向 (架構)
  summary: string; // 摘要 (完整)
  background: string;
  motivation: string;
  purpose: string[];
  questions: string[];
  hypothesis: string[];
  literature: string[];
  method: string;
  analysis: string; // 研究結果與分析 (完整)
  discussion: string;
  limitations: string[];
  conclusion: string;
  futureWork: string[];
  customSections: CustomSection[]; // category-specific structure (spec §6)
  charts: SuggestionBlock[];
  images: SuggestionBlock[];
  flowcharts: SuggestionBlock[];
}

// ─── Biology knowledge base (common-knowledge facts only) ────────────────────

interface BioFact {
  intro: string;
  classification: string;
  habits: string;
  habitat: string;
  humanRelation: string;
  value: string;
  issues: string;
}

const BIO_FACTS: Record<string, BioFact> = {
  鵝: {
    intro:
      "鵝是人類長期飼養的家禽之一，常見於農業與畜牧環境中。牠不只具有食用價值，也因警覺性高、群居性明顯，而在人類生活與農村文化中扮演特殊角色。",
    classification:
      "鵝屬於鳥綱雁形目鴨科，由野雁馴化而來。體型比鴨大，頸部較長，喙基部常有肉瘤，腳掌具蹼、善於游泳；羽毛多為白色或灰褐色。",
    habits:
      "鵝具有明顯的群居性與地域性，警覺性高，遇到陌生人或動物會大聲鳴叫示警，因此早期農家常以鵝看守家園。以草料、穀物為主食，屬草食偏雜食。",
    habitat:
      "鵝適合飼養於有水域（如池塘、溝渠）與草地的環境，需要乾淨水源供其覓食與整理羽毛；耐寒、適應力強。",
    humanRelation:
      "鵝與農業、畜牧業及人類飲食密切相關，可提供鵝肉、鵝蛋與羽絨，在部分地區也具有看守與除草的功能。",
    value:
      "經濟上，鵝肉與鵝肝是重要食品，羽絨可製成保暖衣物與寢具；文化上，鵝常出現在文學、節慶與民俗中；生態上，適度放牧有助於草地管理。",
    issues:
      "可進一步探討的議題包括：飼養管理與環境衛生、動物福利、禽流感等疾病防治，以及鵝肉產業的市場現況與發展。",
  },
  貓: {
    intro:
      "貓是常見的家庭寵物與伴侶動物，與人類共同生活已有數千年歷史，兼具陪伴、療癒與捕鼠等功能。",
    classification:
      "貓屬於哺乳綱食肉目貓科，為小型肉食性動物。具有靈活的身體、銳利的爪與牙、敏銳的夜視與聽覺，肉墊使其行動安靜。",
    habits:
      "貓多在晨昏與夜間活動，具領域性，會以磨蹭、抓痕標記領域；愛清潔，常自行理毛；獨立性強但也會與人建立依附關係。",
    habitat:
      "家貓主要生活於人類居住環境，需要安全的活動空間、躲藏處與穩定的食物與水源。",
    humanRelation:
      "貓作為伴侶動物提供陪伴與情感支持，並在文化、藝術與網路社群中佔有重要地位；流浪貓議題則涉及公共衛生與動物保護。",
    value:
      "情感與療癒價值高，亦帶動寵物經濟（食品、用品、醫療）；同時引發 TNR（捕捉、絕育、回置）與生態影響等討論。",
    issues:
      "可探討的議題包括：負責任飼養、流浪貓族群管理、人貓共生與動物福利。",
  },
  狗: {
    intro:
      "狗是人類最早馴化的動物之一，被稱為「人類最好的朋友」，在陪伴、工作與服務等面向都扮演重要角色。",
    classification:
      "狗屬於哺乳綱食肉目犬科，由狼馴化而來。嗅覺與聽覺極為發達，品種多元，體型、毛色與性格差異大。",
    habits:
      "狗是群居性動物，具有社會階級觀念，能與人類及同伴建立緊密關係；透過吠叫、肢體與氣味溝通，可經由訓練學習指令。",
    habitat:
      "狗適應力強，可生活於家庭、農村與工作場域，需要足夠運動、互動與穩定照顧。",
    humanRelation:
      "狗擔任伴侶犬、導盲犬、警犬、搜救犬等多種角色，與人類生活高度連結；流浪犬則涉及公共安全與動物保護議題。",
    value:
      "情感陪伴與工作價值兼具，帶動寵物產業發展；同時引發棄養、結紮與動物福利等社會討論。",
    issues:
      "可探討的議題包括：負責任飼養、流浪犬管理、犬隻訓練與動物福利。",
  },
  蜜蜂: {
    intro:
      "蜜蜂是重要的授粉昆蟲，對農業生產與生態系平衡有關鍵影響，同時也是蜂蜜等產品的來源。",
    classification:
      "蜜蜂屬於昆蟲綱膜翅目蜜蜂科，為社會性昆蟲，群體分為蜂后、雄蜂與工蜂，分工明確。",
    habits:
      "蜜蜂以花蜜與花粉為食，透過「8 字舞」傳遞蜜源位置；工蜂負責採蜜、築巢、育幼與守衛。",
    habitat:
      "蜜蜂築巢於樹洞或人工蜂箱中，活動範圍依蜜源分布而定，對環境變化（農藥、氣候）相當敏感。",
    humanRelation:
      "蜜蜂為許多農作物授粉，攸關糧食生產；其產品（蜂蜜、蜂王乳、蜂蠟）也具經濟價值。",
    value:
      "生態上是關鍵授粉者，經濟上支撐養蜂與農業；近年蜂群數量下降（如蜂群崩壞）引發廣泛關注。",
    issues:
      "可探討的議題包括：授粉與糧食安全、農藥對蜂群的影響、氣候變遷與蜂群健康。",
  },
  蚯蚓: {
    intro:
      "蚯蚓是常見的土壤動物，有「大地的犁」之稱，對土壤改良與有機物分解扮演重要角色。",
    classification:
      "蚯蚓屬於環節動物門寡毛綱，身體分節、無骨骼，以體表呼吸，雌雄同體。",
    habits:
      "蚯蚓在土中鑽行、取食腐爛有機物，排出的糞便（蚓糞）是良好的天然肥料；多在潮濕、陰暗環境活動。",
    habitat:
      "蚯蚓生活於富含有機質、濕潤且通氣的土壤中，乾旱或淹水都會威脅其生存。",
    humanRelation:
      "蚯蚓有助於鬆土、改善土壤結構與肥力，常被應用於有機農業與廚餘堆肥（蚯蚓養殖）。",
    value:
      "生態上促進土壤健康與養分循環，農業上可用於堆肥與土壤改良，是友善環境耕作的重要幫手。",
    issues:
      "可探討的議題包括：蚯蚓堆肥的操作與效益、土壤汙染對蚯蚓的影響、蚯蚓與土壤生態的關係。",
  },
  蜘蛛: {
    intro:
      "蜘蛛是分布廣泛的陸生節肢動物，多數會吐絲結網，以捕食昆蟲為生，在自然界扮演重要的捕食者角色。",
    classification:
      "蜘蛛屬於節肢動物門蛛形綱蜘蛛目，身體分為頭胸部與腹部兩節，具有八隻腳（與昆蟲六足不同），無觸角與翅膀。",
    habits:
      "蜘蛛多數為肉食性，以絲腺吐絲結網或主動獵捕昆蟲；部分種類具毒腺以麻痺獵物，繁殖時雌蛛常以卵囊保護卵。",
    habitat:
      "蜘蛛廣泛分布於草叢、樹林、洞穴、住家牆角等環境，幾乎遍及全球各種陸域棲地。",
    humanRelation:
      "蜘蛛能捕食蚊蠅、蟑螂等害蟲，對農業與居家害蟲控制有益；少數種類（如台灣的赤背寡婦蛛）具醫療上需注意的毒性。",
    value:
      "生態上是重要的害蟲天敵，有助於維持昆蟲族群平衡；蛛絲的強韌特性也是仿生材料研究的重要對象。",
    issues:
      "可探討的議題包括：蜘蛛在害蟲生物防治的應用、蛛絲的仿生科技、人們對蜘蛛的恐懼與迷思釐清。",
  },
};

function bioFallback(topic: string): BioFact {
  return {
    intro: `「${topic}」是一種生物，本報告將從分類、特徵、習性、棲息環境及與人類的關係等面向進行整理。〔建議補充「${topic}」的基本介紹與常見別名〕`,
    classification: `〔建議補充「${topic}」的生物分類（門綱目科）與主要外型特徵，例如體型、構造與辨識重點。〕`,
    habits: `〔建議補充「${topic}」的食性、活動時間、繁殖與行為等生活習性。〕`,
    habitat: `〔建議補充「${topic}」的主要棲息環境與分布區域。〕`,
    humanRelation: `〔建議補充「${topic}」與人類生活、農業或文化的關係。〕`,
    value: `〔建議補充「${topic}」的經濟、文化或生態價值。〕`,
    issues: `可探討「${topic}」相關的保育、利用或管理議題（建議補充具體面向）。`,
  };
}

// ─── Food / culinary knowledge base (common-knowledge facts only) ────────────

interface FoodFact {
  intro: string;
  nutrition: string;
  source: string; // 來源／生產
  processing: string; // 製程／加工／保存
  safety: string; // 食品安全／品質
  culture: string; // 飲食文化／市場
  issues: string;
}

const FOOD_FACTS: Record<string, FoodFact> = {
  雞蛋: {
    intro:
      "雞蛋是日常飲食中常見且重要的蛋白質來源，由蛋殼、蛋白與蛋黃三部分組成，營養豐富且烹調用途廣泛。",
    nutrition:
      "一顆雞蛋（約 50 公克）含有約 6～7 公克的優質蛋白質，並提供卵磷脂、維生素 A、D、B12 與鐵、硒等營養素；蛋黃含脂肪與膽固醇，蛋白則幾乎為純蛋白質。",
    source:
      "雞蛋主要來自蛋雞（如白色來亨雞、紅羽蛋雞）養殖，飼養方式包含格子籠、平飼與放牧；產地、飼料與飼養環境會影響蛋的品質與風味。",
    processing:
      "雞蛋採收後經清洗、依重量分級與冷藏保存；常見加工品包含液蛋、皮蛋、鹹蛋、滷蛋，以及美乃滋、蛋粉等蛋製品。",
    safety:
      "雞蛋的主要食安風險為沙門氏菌污染，應冷藏保存、避免食用破殼或不新鮮的蛋並充分加熱；新鮮度可用浮水測試或觀察氣室大小判斷。",
    culture:
      "雞蛋在台灣與各國飲食文化中應用廣泛（如荷包蛋、茶葉蛋、蛋餅、布丁、蛋糕）；近年蛋價、供應穩定與友善飼養等議題也受到關注。",
    issues:
      "可探討的議題包括：蛋價波動與供應穩定、禽流感對產量的影響、友善飼養與動物福利，以及膽固醇攝取的健康討論。",
  },
};

function foodFallback(topic: string): FoodFact {
  return {
    intro: `「${topic}」是一種食品／飲食主題，本報告將從來源、營養、製程、安全到飲食文化進行整理。〔建議補充「${topic}」的基本介紹〕`,
    nutrition: `〔建議補充「${topic}」的主要營養成分與含量（如蛋白質、脂肪、碳水化合物、維生素與礦物質）。〕`,
    source: `〔建議補充「${topic}」的產地、原料來源或生產方式。〕`,
    processing: `〔建議補充「${topic}」的製程、加工方式與保存方法。〕`,
    safety: `〔建議補充「${topic}」的食品安全規範、衛生標準與品質控管重點。〕`,
    culture: `〔建議補充「${topic}」的飲食文化背景、市場現況或消費趨勢。〕`,
    issues: `可探討「${topic}」相關的食安、產業或健康議題（建議補充具體面向）。`,
  };
}

function buildFood(topic: string): CategoryContent {
  const f = FOOD_FACTS[topic.trim()] ?? foodFallback(topic);
  return {
    summaryDirection: `本報告以「${topic}」為對象，從食品來源、營養成分、製程與保存、食品安全，到飲食文化與市場現況，做系統性的整理與分析。`,
    summary: `${f.intro}本報告整理「${topic}」的營養成分、來源與生產、製程與保存、食品安全，以及飲食文化與相關議題。`,
    background: `${f.intro}${f.source}`,
    motivation: `選擇「${topic}」作為主題，是希望透過系統性的資料整理，更完整地了解其營養價值、生產製程與在飲食生活中的角色。`,
    purpose: [
      `認識「${topic}」的營養成分與價值。`,
      `了解「${topic}」的來源、生產與製程。`,
      `探討「${topic}」的食品安全與品質管理。`,
      `分析「${topic}」的飲食文化與市場現況。`,
    ],
    questions: [
      `「${topic}」含有哪些主要營養成分？`,
      `「${topic}」是如何生產與製作的？`,
      `「${topic}」在食品安全上需要注意什麼？`,
      `「${topic}」的飲食文化與市場現況為何？`,
    ],
    hypothesis: [],
    literature: [
      `「${topic}」的營養成分與健康相關資料`,
      `「${topic}」的生產、製程與保存研究`,
      `「${topic}」的食品安全規範與檢驗標準`,
      `「${topic}」的飲食文化或市場趨勢報導`,
    ],
    method: `採用文獻整理與資料分析法：蒐集「${topic}」的營養標示、生產與製程資料、食品安全規範與市場報導，整理比較後進行分析。在製程與品質安全方面，${f.processing}此外，${f.safety}`,
    analysis: `從飲食文化與市場面來看，${f.culture}綜合資料可了解「${topic}」在飲食生活與產業中的定位與發展。〔建議補充實際市場或消費數據，${SOURCE_NOTE}〕`,
    discussion: `延伸討論「${topic}」的相關議題：${f.issues}`,
    limitations: [
      `本報告以二手資料整理為主，缺乏第一手的檢驗或實測數據。`,
      `營養與品質會因品種、產地、製程與保存方式而有差異，難以一概而論。`,
    ],
    conclusion: `綜合以上，「${topic}」在營養、製程與飲食文化上各具特色，並與食品安全與產業發展密切相關；深入認識有助於做出更健康、安全的飲食選擇。`,
    futureWork: [
      `補充實際營養檢測或市場消費數據以強化分析。`,
      `比較不同產地、品種或製程的「${topic}」品質差異。`,
    ],
    customSections: [
      { heading: "一、營養成分", body: f.nutrition },
      { heading: "二、來源與生產", body: f.source },
    ],
    charts: [
      {
        title: `${topic}營養成分表`,
        position: "營養成分後",
        purpose: `整理「${topic}」每單位的主要營養成分與含量。`,
        content: `以表格列出蛋白質、脂肪、碳水化合物、維生素與礦物質等欄位（實際數值${SOURCE_NOTE}）。`,
      },
      {
        title: `${topic}市場或消費趨勢圖`,
        position: "現況與市場分析後",
        purpose: `呈現「${topic}」的產量、消費量或價格變化趨勢。`,
        content: `以折線圖或長條圖呈現（實際數據${SOURCE_NOTE}）。`,
      },
    ],
    images: [
      {
        title: `${topic}的結構或外觀圖`,
        position: "營養成分與價值後",
        purpose: `標示「${topic}」的組成或外觀特徵。`,
        content: "可使用標註式照片或示意圖。",
      },
    ],
    flowcharts: [
      {
        title: `${topic}的生產或製程流程圖`,
        position: "製程與品質安全後",
        purpose: `說明「${topic}」從原料到成品（或上市）的主要流程。`,
        content: "以箭頭串連各製程階段，並標示品質與安全管控點。",
      },
    ],
  };
}

// ─── Chemistry knowledge base (common-knowledge facts only) ──────────────────

interface ChemFact {
  intro: string;
  theory: string; // 化學結構與性質
  reaction: string; // 反應／機制
  experiment: string; // 實驗設計／測定
  application: string; // 應用
  safety: string; // 安全與注意
  issues: string;
}

const CHEM_FACTS: Record<string, ChemFact> = {
  維生素C: {
    intro:
      "維生素 C（又稱抗壞血酸，Ascorbic acid）是一種水溶性維生素，化學式為 C₆H₈O₆，是人體必需但無法自行合成的營養素。",
    theory:
      "維生素 C 分子含有烯二醇（enediol）結構，具有強還原性、易溶於水；在高溫、光照、氧氣與金屬離子存在下容易被氧化分解，是其不穩定的主因。",
    reaction:
      "維生素 C 透過提供電子（氧化還原反應）清除自由基，可將氧化型物質還原，自身則被氧化為去氫抗壞血酸（DHA）。",
    experiment:
      "常以碘滴定法或 2,6-二氯酚靛酚（DCPIP）滴定法測定維生素 C 含量：維生素 C 會還原碘／DCPIP 使其褪色，再依滴定體積換算濃度。",
    application:
      "維生素 C 廣泛作為食品抗氧化劑與營養強化劑，並參與膠原蛋白合成、促進非血基質鐵吸收與維持免疫功能等生理作用。",
    safety:
      "維生素 C 一般安全，但長期過量攝取可能造成腸胃不適或增加結石風險；滴定實驗中碘、DCPIP 等試劑需依規範操作並注意安全。",
    issues:
      "可探討的議題包括：不同溫度與烹調方式對維生素 C 保留率的影響、不同蔬果的維生素 C 含量比較，以及保存條件對含量的影響。",
  },
};

function chemFallback(topic: string): ChemFact {
  return {
    intro: `「${topic}」是一個化學／化工相關主題，本報告將從化學結構與性質、反應機制、實驗設計到應用進行整理。〔建議補充「${topic}」的基本定義〕`,
    theory: `〔建議補充「${topic}」的化學結構、分子式與主要物理化學性質。〕`,
    reaction: `〔建議補充「${topic}」相關的化學反應式或作用機制。〕`,
    experiment: `〔建議補充測定或驗證「${topic}」的實驗方法與設計。〕`,
    application: `〔建議補充「${topic}」在生活、食品、醫藥或工業上的應用。〕`,
    safety: `〔建議補充「${topic}」的安全性、危害性與操作注意事項。〕`,
    issues: `可探討「${topic}」相關的科學或應用議題（建議補充具體面向）。`,
  };
}

function buildChemistry(topic: string): CategoryContent {
  const f = CHEM_FACTS[topic.trim()] ?? chemFallback(topic);
  return {
    summaryDirection: `本報告以「${topic}」為對象，從化學結構與性質、反應機制、實驗測定方法，到實際應用與相關議題，做系統性的整理與分析。`,
    summary: `${f.intro}本報告整理「${topic}」的化學結構與性質、反應機制、實驗設計與測定方法，以及主要應用與相關議題。`,
    background: f.intro,
    motivation: `選擇「${topic}」作為主題，是希望透過化學原理與實驗的整理，更完整地理解其性質、反應與在生活或產業中的應用。`,
    purpose: [
      `認識「${topic}」的化學結構與基本性質。`,
      `了解「${topic}」相關的反應與作用機制。`,
      `掌握測定或驗證「${topic}」的實驗方法。`,
      `探討「${topic}」的應用領域與相關議題。`,
    ],
    questions: [
      `「${topic}」具有哪些化學結構與性質？`,
      `「${topic}」涉及哪些反應或作用機制？`,
      `如何透過實驗測定或驗證「${topic}」？`,
      `「${topic}」有哪些重要的應用？`,
    ],
    hypothesis: [
      `「${topic}」的化學性質決定了其反應行為與應用方式。`,
      `在控制條件下，「${topic}」的測定結果具有可重現性。`,
    ],
    literature: [
      `「${topic}」的化學結構與性質資料`,
      `「${topic}」相關反應與機制的研究`,
      `「${topic}」的測定方法與實驗設計`,
      `「${topic}」在食品、醫藥或工業上的應用`,
    ],
    method: f.experiment,
    analysis: `依測定結果可比較不同條件下「${topic}」的含量或反應變化，並對照理論預期評估其性質。〔此處需填入實際實驗或測定數據〕`,
    discussion: `討論「${topic}」結果與理論的一致性、可能的誤差來源，以及延伸議題：${f.issues}`,
    limitations: [
      `本報告以文獻整理為主，部分數據需由實際實驗取得。`,
      `測定結果會受試劑純度、操作與環境條件影響而有誤差。`,
    ],
    conclusion: `綜合以上，「${topic}」的化學性質、反應機制與應用彼此呼應；理解其原理有助於在實驗、食品或產業情境中正確應用。`,
    futureWork: [
      `設計並執行實際實驗以取得量化數據。`,
      `比較不同條件（溫度、濃度、時間）對「${topic}」的影響。`,
    ],
    customSections: [
      { heading: "一、化學結構與性質", body: f.theory },
      { heading: "二、反應與作用機制", body: f.reaction },
      { heading: "三、主要應用", body: f.application },
      { heading: "四、安全與注意事項", body: f.safety },
    ],
    charts: [
      {
        title: `${topic}測定數據圖`,
        position: "結果與分析後",
        purpose: `呈現不同條件下「${topic}」的測定結果或變化趨勢。`,
        content: `以折線圖或長條圖呈現（實際數據由實驗取得）。`,
      },
    ],
    images: [
      {
        title: `${topic}的分子結構圖`,
        position: "化學原理與性質後",
        purpose: `標示「${topic}」的分子結構與官能基。`,
        content: "可使用結構式或分子模型示意圖。",
      },
    ],
    flowcharts: [
      {
        title: `${topic}的實驗流程圖`,
        position: "實驗設計後",
        purpose: `說明測定「${topic}」的實驗操作順序。`,
        content: "以流程圖整理取樣、滴定（或反應）與計算步驟。",
      },
    ],
  };
}

// ─── Category content builders ───────────────────────────────────────────────

function buildBiology(topic: string): CategoryContent {
  const f = BIO_FACTS[topic.trim()] ?? bioFallback(topic);
  return {
    summaryDirection: `本報告以「${topic}」為對象，從生物分類、特徵、生活習性、棲息環境，到與人類生活的關係與價值，做系統性的整理與討論。`,
    summary: `${f.intro}本報告整理「${topic}」的分類與特徵、生活習性、棲息環境，以及與人類生活的關係與相關議題。`,
    background: f.intro,
    motivation: `選擇「${topic}」作為主題，是希望透過系統性的資料整理，更完整地認識這種生物的特性與牠在生態及人類生活中的角色。`,
    purpose: [
      `認識「${topic}」的生物分類與基本特徵。`,
      `了解「${topic}」的生活習性與棲息環境。`,
      `探討「${topic}」與人類生活的關係及其價值。`,
      `整理「${topic}」相關的研究問題與可蒐證方向。`,
    ],
    questions: [
      `「${topic}」具有哪些重要的生物特徵？`,
      `「${topic}」的生活習性與棲息環境為何？`,
      `「${topic}」與人類生活有什麼關係與價值？`,
      `關於「${topic}」目前有哪些值得關注的議題？`,
    ],
    hypothesis: [
      `「${topic}」的特徵與習性與其棲息環境密切相關。`,
      `「${topic}」在生態系與人類生活中具有不可忽視的角色。`,
    ],
    literature: [
      `「${topic}」的分類與形態相關資料`,
      `「${topic}」的行為與生態研究`,
      `「${topic}」與人類、產業或文化關係的整理`,
      `保育、飼養或利用相關的討論`,
    ],
    method: `採用文獻整理與觀察歸納法：蒐集「${topic}」的圖鑑、百科、研究與報導資料，整理其特徵與習性，並輔以觀察或案例進行分析。`,
    analysis: `綜合資料可看出，${f.habits}此外，${f.habitat}這些特性彼此呼應，反映出「${topic}」如何適應其生存環境。`,
    discussion: `從「${topic}」與人類的關係來看，${f.humanRelation}由此延伸，${f.issues}`,
    limitations: [
      `本報告以二手資料整理為主，缺乏第一手的田野觀察與量化數據。`,
      `部分特徵會因品種、地區或個體而有差異，難以一概而論。`,
    ],
    conclusion: `綜合以上，「${topic}」在分類、習性與生態上各具特色，且與人類生活關係密切。深入認識牠有助於我們在利用與保育之間取得平衡。`,
    futureWork: [
      `進行實地觀察或訪談，補充第一手資料。`,
      `蒐集量化統計（如數量、產量、分布）強化分析。`,
    ],
    customSections: [
      { heading: "一、主題基本介紹", body: f.intro },
      { heading: "二、生物分類與基本特徵", body: f.classification },
      { heading: "三、生活習性", body: f.habits },
      { heading: "四、棲息環境", body: f.habitat },
      { heading: "五、與人類生活的關係", body: f.humanRelation },
      { heading: "六、經濟、文化或生態價值", body: f.value },
      { heading: "七、相關問題與討論", body: f.issues },
    ],
    charts: [
      {
        title: `${topic}的特徵整理表`,
        position: "主題基本介紹後",
        purpose: `快速整理「${topic}」的分類、外型、習性與主要用途。`,
        content: "包含分類、體型、食性、活動習性與主要用途等欄位。",
      },
      {
        title: `${topic}相關數據比較圖`,
        position: "與人類生活的關係後",
        purpose: `比較「${topic}」在不同地區、品種或年份的相關數據。`,
        content: `以長條圖呈現（實際數據${SOURCE_NOTE}）。`,
      },
    ],
    images: [
      {
        title: `${topic}的外型構造圖`,
        position: "生物分類與基本特徵後",
        purpose: `標示「${topic}」的主要身體構造與辨識重點。`,
        content: "可使用標註式照片或繪圖，標出關鍵特徵。",
      },
      {
        title: `${topic}的棲息環境照片`,
        position: "棲息環境後",
        purpose: `呈現「${topic}」實際的生活環境。`,
        content: "建議使用實地拍攝或授權圖片（來源待確認）。",
      },
    ],
    flowcharts: [
      {
        title: `${topic}的生命週期流程圖`,
        position: "生活習性後",
        purpose: `說明「${topic}」從出生到成熟的主要階段。`,
        content: "以箭頭串連各生命階段。",
      },
    ],
  };
}

function buildExperiment(topic: string): CategoryContent {
  return {
    summaryDirection: `本實驗以「${topic}」為題，透過控制變因、操作變因與測量應變變因，觀察並記錄結果，以驗證假設並歸納結論。`,
    summary: `本實驗探討「${topic}」，藉由設計操作變因與控制變因，量測應變變因的變化，分析數據並討論誤差與改進方法。`,
    background: `「${topic}」涉及可觀察、可測量的科學現象。透過實驗設計，可以系統性地檢驗變因之間的關係。`,
    motivation: `希望以實際操作驗證「${topic}」背後的原理，並培養設計實驗、蒐集數據與分析結果的能力。`,
    purpose: [
      `驗證「${topic}」中各變因之間的關係。`,
      `透過量化數據觀察應變變因的變化趨勢。`,
      `分析誤差來源並提出改進方法。`,
    ],
    questions: [
      `在「${topic}」中，操作變因如何影響應變變因？`,
      `各變因之間是否存在可量化的規律？`,
      `實驗結果與理論預期是否一致？`,
    ],
    hypothesis: [
      `操作變因增加（或改變）時，應變變因會呈現規律的變化。`,
      `在控制其他條件下，「${topic}」的結果具有可重現性。`,
    ],
    literature: [
      `「${topic}」相關的科學原理與定義`,
      `類似實驗的設計方法與既有結果`,
      `測量工具與誤差控制的方法`,
    ],
    method: `採用實驗研究法：設定操作變因、控制變因與應變變因，重複多次量測以取平均，並以圖表呈現數據後進行分析。`,
    analysis: `將各組數據整理為表格與圖表後，比較不同操作變因下應變變因的差異，觀察是否呈現預期的趨勢，並計算可能的誤差範圍。〔此處需填入實際實驗數據〕`,
    discussion: `討論結果與假設是否相符、可能的誤差來源（如測量誤差、環境干擾、操作不一致），以及如何改進實驗設計以提升準確度。`,
    limitations: [
      `受器材精度與實驗次數限制，數據可能存在誤差。`,
      `環境變因（溫度、濕度等）不易完全控制。`,
    ],
    conclusion: `根據實驗數據可初步歸納「${topic}」中變因之間的關係〔依實際數據填寫結論〕，並指出後續可改進的方向。`,
    futureWork: [
      `增加實驗次數與樣本以提升可靠度。`,
      `改良器材或方法以降低誤差。`,
    ],
    customSections: [
      { heading: "一、實驗目的", body: `驗證「${topic}」中操作變因對應變變因的影響，並歸納其規律。` },
      { heading: "二、實驗原理", body: `說明「${topic}」所依據的科學原理與相關概念。〔建議補充教科書或可信資料的原理說明〕` },
      {
        heading: "三、實驗變因",
        body: "操作變因（自行設定並改變的條件）、應變變因（觀察與測量的結果）、控制變因（需保持固定的條件）。〔請依「" + topic + "」填入具體變因〕",
      },
      { heading: "四、實驗器材", body: `列出進行「${topic}」所需的器材與材料（如量測工具、容器、樣本等）。` },
      { heading: "五、實驗步驟", body: `依序寫出可重現的操作步驟，包含準備、操作、量測與記錄。` },
      { heading: "六、數據紀錄方式", body: `以表格記錄每次量測結果，並計算平均值，再轉換為圖表呈現。` },
      { heading: "七、預期結果", body: `依原理推測操作變因改變時應變變因的變化方向。` },
      { heading: "八、誤差來源與改進方法", body: `列出可能誤差（測量、環境、操作）並提出對應的改進方式。` },
    ],
    charts: [
      {
        title: `${topic}數據關係圖`,
        position: "數據紀錄方式後",
        purpose: "呈現操作變因與應變變因之間的關係趨勢。",
        content: "以折線圖或散佈圖呈現各組量測結果（實際數據由實驗取得）。",
      },
      {
        title: "各組結果比較長條圖",
        position: "實驗結果後",
        purpose: "比較不同操作變因下的應變變因平均值。",
        content: "X 軸為操作變因，Y 軸為應變變因平均值，加上誤差線。",
      },
    ],
    images: [
      {
        title: "實驗器材配置圖",
        position: "實驗器材後",
        purpose: "說明器材的擺設與實驗裝置。",
        content: "可用照片或示意圖標示各器材位置。",
      },
    ],
    flowcharts: [
      {
        title: "實驗流程圖",
        position: "實驗步驟後",
        purpose: "以流程圖整理實驗操作順序。",
        content: "準備 → 設定變因 → 操作 → 量測記錄 → 整理分析。",
      },
    ],
  };
}

function buildSocialIssue(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告針對「${topic}」這項社會議題，從成因、現況、影響到解決策略進行分析，並提出個人觀點。`,
    summary: `本報告探討社會議題「${topic}」，分析其形成原因、現況與影響層面，比較不同觀點並提出可行的解決策略與個人看法。`,
    background: `「${topic}」是當前社會關注的議題，牽涉多方面的成因與影響，值得深入分析。〔建議補充相關背景與統計數據〕`,
    motivation: `希望透過資料整理與分析，釐清「${topic}」的成因與影響，並思考個人與社會可以採取的行動。`,
    purpose: [
      `釐清「${topic}」的形成原因。`,
      `分析「${topic}」的現況與影響層面。`,
      `比較不同立場的觀點。`,
      `提出可行的解決策略與個人看法。`,
    ],
    questions: [
      `「${topic}」是如何形成的？`,
      `「${topic}」對個人、家庭與社會造成哪些影響？`,
      `面對「${topic}」有哪些不同的觀點與解決策略？`,
    ],
    hypothesis: [
      `「${topic}」是由多重因素交互作用造成。`,
      `透過適當的政策與行動，「${topic}」的負面影響可被緩解。`,
    ],
    literature: [
      `「${topic}」的定義與相關統計（數據待補）`,
      `成因與影響的相關研究或報導`,
      `國內外的因應政策與案例`,
    ],
    method: `採用文獻分析與案例比較法：蒐集統計、研究與新聞報導，整理成因與影響，並比較不同案例與解決策略。`,
    analysis: `從資料可見「${topic}」的成因與影響涉及多個層面〔此處建議插入統計數據與案例佐證〕，不同族群所受影響程度不一。`,
    discussion: `比較支持與反對、不同立場的觀點，討論各種解決策略的可行性與限制，並反思個人與社會的角色。`,
    limitations: [
      `缺乏第一手調查數據，分析以既有資料為主。`,
      `議題具爭議性，不同立場可能有不同解讀。`,
    ],
    conclusion: `綜合來看，「${topic}」需要從個人、社會與制度多管齊下因應。本報告整理其成因、影響與策略，作為後續討論的基礎。`,
    futureWork: [
      `進行問卷或訪談蒐集第一手意見。`,
      `追蹤相關政策的實施成效。`,
    ],
    customSections: [
      { heading: "一、議題背景", body: `介紹「${topic}」的基本情況與為何受到關注。〔建議補充統計數據〕` },
      { heading: "二、形成原因", body: `分析「${topic}」的主要成因（如社會、經濟、文化、制度等面向）。` },
      { heading: "三、現況分析", body: `說明「${topic}」目前的狀況與趨勢。〔此處需要插入官方或研究統計〕` },
      { heading: "四、影響層面", body: `分析對個人、家庭、社會與經濟的影響。` },
      { heading: "五、案例討論", body: `舉出國內外相關案例進行比較（案例來源待確認）。` },
      { heading: "六、不同觀點", body: `整理不同立場（支持／反對／中立）的看法與理由。` },
      { heading: "七、解決策略", body: `提出可行的政策、教育或行動方案。` },
      { heading: "八、個人看法", body: `提出對「${topic}」的個人立場與理由。` },
    ],
    charts: [
      {
        title: `${topic}趨勢變化圖`,
        position: "現況分析後",
        purpose: `呈現「${topic}」隨時間的變化趨勢。`,
        content: `以折線圖呈現歷年數據（${SOURCE_NOTE}）。`,
      },
      {
        title: "影響層面占比圖",
        position: "影響層面後",
        purpose: "呈現不同影響層面的比重或分布。",
        content: "以圓餅圖或長條圖呈現（數據待補）。",
      },
    ],
    images: [
      {
        title: "議題概念圖",
        position: "議題背景後",
        purpose: `以圖像整理「${topic}」的成因與影響關係。`,
        content: "可用心智圖呈現核心概念與關聯。",
      },
    ],
    flowcharts: [
      {
        title: "成因與影響關係圖",
        position: "形成原因後",
        purpose: "呈現成因如何導致各種影響。",
        content: "以箭頭連結成因 → 現況 → 影響 → 對策。",
      },
    ],
  };
}

function buildHistoryGeo(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，整理其背景、歷史脈絡或地理位置、重要事件或制度、現況與影響，並提出個人觀點。`,
    summary: `本報告探討「${topic}」，從背景、歷史脈絡或地理位置出發，整理重要事件或制度、現況與影響，並討論相關爭議與個人看法。`,
    background: `「${topic}」具有其特定的歷史、地理或制度背景，值得加以整理與理解。〔建議補充可信的史地或公民資料〕`,
    motivation: `希望透過資料整理，更清楚地認識「${topic}」的脈絡與意義，並思考其對現今的影響。`,
    purpose: [
      `整理「${topic}」的背景與脈絡。`,
      `了解相關的重要事件、制度或地理特徵。`,
      `分析「${topic}」的現況與影響。`,
      `討論相關爭議並提出個人觀點。`,
    ],
    questions: [
      `「${topic}」的背景與發展脈絡為何？`,
      `「${topic}」中有哪些重要事件、制度或特徵？`,
      `「${topic}」對現今社會有什麼影響？`,
    ],
    hypothesis: [
      `「${topic}」的形成與其時代或地理背景密切相關。`,
      `理解「${topic}」有助於認識當前社會與環境。`,
    ],
    literature: [
      `「${topic}」的史料、地圖或制度文件（來源待確認）`,
      `相關研究與導覽、報導資料`,
      `不同觀點的評析`,
    ],
    method: `採用文獻整理與比較分析法：蒐集史地或公民相關資料，整理脈絡與重要面向，並比較不同觀點。`,
    analysis: `綜合資料可看出「${topic}」的發展脈絡與重要面向〔建議補充具體事件、年代或地理數據〕，並對現況產生影響。`,
    discussion: `討論「${topic}」相關的爭議與不同詮釋，並反思其對現代公民的意義。`,
    limitations: [
      `史地資料來源眾多，需審慎查證真實性。`,
      `部分內容涉及不同立場，詮釋可能有差異。`,
    ],
    conclusion: `綜合以上，「${topic}」在歷史、地理或制度上具有其重要性，理解其脈絡有助於培養公民素養與在地認同。`,
    futureWork: [
      `實地踏查或參訪以補充第一手觀察。`,
      `查閱官方檔案或學術研究強化內容。`,
    ],
    customSections: [
      { heading: "一、主題背景", body: `介紹「${topic}」的基本背景與重要性。` },
      { heading: "二、歷史脈絡或地理位置", body: `說明「${topic}」的時間脈絡或所在位置與環境。〔建議補充年代或地圖資料〕` },
      { heading: "三、重要事件或制度", body: `整理與「${topic}」相關的關鍵事件、人物或制度。` },
      { heading: "四、現況", body: `說明「${topic}」目前的狀況或保存、運作情形。` },
      { heading: "五、影響", body: `分析「${topic}」對社會、文化或環境的影響。` },
      { heading: "六、爭議或討論", body: `整理相關的爭議點或不同觀點。` },
      { heading: "七、個人觀點", body: `提出對「${topic}」的看法與省思。` },
    ],
    charts: [
      {
        title: `${topic}年代／數據整理表`,
        position: "重要事件或制度後",
        purpose: `整理「${topic}」的重要時間點或相關數據。`,
        content: "以表格列出年代、事件或數值（資料來源待確認）。",
      },
    ],
    images: [
      {
        title: `${topic}相關圖片或地圖`,
        position: "歷史脈絡或地理位置後",
        purpose: `呈現「${topic}」的實景、文物或地理位置。`,
        content: "建議使用授權圖片或自行拍攝（來源待確認）。",
      },
    ],
    flowcharts: [
      {
        title: "發展脈絡時間軸",
        position: "重要事件或制度後",
        purpose: `以時間軸呈現「${topic}」的發展過程。`,
        content: "依年代順序串連重要事件。",
      },
    ],
  };
}

function buildBookReflection(topic: string): CategoryContent {
  const book = topic.replace(/[《》〈〉]/g, "").replace(/讀書心得|心得|讀後感?/g, "").trim() || topic;
  return {
    summaryDirection: `本心得以《${book}》為對象，整理書籍大意與重要內容，分享印象最深的段落、個人心得與生活連結，並提出反思。`,
    summary: `本篇為《${book}》的讀書心得，先整理書籍大意與重點，再分享印象最深的段落、個人感受與生活經驗的連結，最後提出批判與反思。`,
    background: `《${book}》〔建議補充作者與出版資訊〕。閱讀這本書讓我對其主題有更深的體會，因此整理成這篇心得。`,
    motivation: `選擇《${book}》是因為其主題與我的興趣或經驗相關，希望透過閱讀與書寫整理自己的想法。`,
    purpose: [
      `整理《${book}》的內容大意與重點。`,
      `分享閱讀過程中印象最深的部分。`,
      `連結書中內容與個人生活經驗。`,
      `提出對本書的反思與啟發。`,
    ],
    questions: [
      `《${book}》主要想傳達什麼？`,
      `書中哪些內容讓我最有感觸？為什麼？`,
      `這本書對我的想法或生活有什麼影響？`,
    ],
    hypothesis: [],
    literature: [
      `《${book}》的內容與主題（以書籍本身為主）`,
      `作者其他作品或相關訪談（資料待確認）`,
    ],
    method: `以文本閱讀與反思為主：細讀《${book}》，摘錄重點段落，再結合個人經驗進行思考與書寫。`,
    analysis: `整理《${book}》的核心內容後，我特別注意到〔填入印象深刻的主題或情節〕，並從中看見作者想傳達的觀點。`,
    discussion: `結合自身經驗，我認為書中的觀點〔填入個人感受與連結〕；同時也可從不同角度思考，提出自己的看法或質疑。`,
    limitations: [
      `心得以個人主觀感受為主，未必能涵蓋全書深意。`,
      `對作者背景與寫作脈絡的了解有限。`,
    ],
    conclusion: `讀完《${book}》，我獲得〔填入主要啟發〕。這本書讓我重新思考相關議題，也提醒自己在生活中加以實踐。`,
    futureWork: [
      `閱讀作者其他作品或相關書籍延伸思考。`,
      `將書中啟發實際運用於生活或學習中。`,
    ],
    customSections: [
      { heading: "一、書名與作者", body: `書名：《${book}》。作者：〔建議補充作者姓名與出版社、出版年份〕。` },
      { heading: "二、作者介紹", body: `〔建議補充作者背景與寫作風格，資料來源待確認〕` },
      { heading: "三、書籍大意", body: `簡述《${book}》的主要內容與架構。` },
      { heading: "四、重要內容整理", body: `整理書中重要的觀點、情節或章節重點。` },
      { heading: "五、印象最深的段落", body: `摘錄並說明最有感觸的段落與原因。` },
      { heading: "六、個人心得", body: `分享閱讀後的個人感受與想法。` },
      { heading: "七、與生活經驗的連結", body: `將書中內容連結到自己的生活或學習經驗。` },
      { heading: "八、批判與反思", body: `提出對本書的不同看法、質疑或延伸思考。` },
    ],
    charts: [
      {
        title: `《${book}》重點整理表`,
        position: "重要內容整理後",
        purpose: "整理書中主要章節或觀點。",
        content: "以表格列出章節／主題與重點。",
      },
    ],
    images: [
      {
        title: "書籍封面或關鍵情節示意圖",
        position: "書名與作者後",
        purpose: "讓讀者快速認識本書。",
        content: "可放書籍封面（使用時請註明來源）或自繪情節示意圖。",
      },
    ],
    flowcharts: [
      {
        title: "閱讀心得脈絡圖",
        position: "個人心得後",
        purpose: "呈現從閱讀到反思的思考歷程。",
        content: "閱讀 → 觸動 → 連結經驗 → 反思 → 行動。",
      },
    ],
  };
}

function buildBusiness(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以商業視角分析「${topic}」，涵蓋產品背景、目標客群、競品、核心功能、商業模式、成本與風險，並提出執行建議。`,
    summary: `本報告針對「${topic}」進行商業與產品分析，從目標客群、使用情境、競品比較到商業模式與風險，提出可執行的結論與建議。`,
    background: `「${topic}」面對特定的市場需求與使用者痛點。本報告分析其機會與挑戰，作為決策參考。〔建議補充市場數據〕`,
    motivation: `希望以決策導向的方式評估「${topic}」的可行性，找出差異化定位與獲利模式。`,
    purpose: [
      `分析「${topic}」的目標客群與使用情境。`,
      `比較競品並找出差異化優勢。`,
      `規劃商業模式、成本與風險。`,
      `提出可執行的發展建議。`,
    ],
    questions: [
      `「${topic}」要解決誰的什麼問題？`,
      `市場上有哪些競品？「${topic}」的差異化在哪裡？`,
      `「${topic}」如何獲利並控制風險？`,
    ],
    hypothesis: [
      `「${topic}」存在明確的目標客群與未被滿足的需求。`,
      `透過差異化定位，「${topic}」具備可行的獲利模式。`,
    ],
    literature: [
      `「${topic}」所屬市場規模與趨勢（數據待補）`,
      `主要競品的功能與定價（資料待確認）`,
      `相關商業模式案例`,
    ],
    method: `採用商業分析方法：以使用者輪廓、競品分析、商業模式（如商業模式圖）與 SWOT 等工具，整合質化與量化資訊。`,
    analysis: `比較「${topic}」與競品的功能、定價與定位後，可看出其機會與威脅〔建議補充市場與競品數據〕，並據此調整策略。`,
    discussion: `討論「${topic}」的核心優勢、潛在風險與資源需求，評估在不同情境下的可行性。`,
    limitations: [
      `市場與競品數據需以實際調查為準，本報告為初步分析。`,
      `商業環境變動快速，預估具不確定性。`,
    ],
    conclusion: `綜合分析，「${topic}」具備〔填入主要優勢〕，建議聚焦於〔填入策略重點〕並控管〔填入主要風險〕，以提升成功機會。`,
    futureWork: [
      `進行使用者訪談與市場驗證（MVP 測試）。`,
      `建立財務試算與里程碑規劃。`,
    ],
    customSections: [
      { heading: "一、執行摘要", body: `用一段話說明「${topic}」的定位、目標與核心價值。` },
      { heading: "二、產品背景", body: `說明「${topic}」要解決的問題與市場機會。` },
      { heading: "三、目標客群", body: `描述主要使用者輪廓與需求。` },
      { heading: "四、使用情境", body: `列出使用者在何種情境下會使用「${topic}」。` },
      { heading: "五、競品分析", body: `比較主要競品的功能、定價與優劣（資料待確認）。` },
      { heading: "六、核心功能", body: `列出「${topic}」的主要功能與差異化重點。` },
      { heading: "七、商業模式", body: `說明收入來源與成本結構（如訂閱、廣告、抽成等）。` },
      { heading: "八、技術需求", body: `概述實作「${topic}」所需的技術與資源。` },
      { heading: "九、成本與資源", body: `估算所需的人力、時間與資金（數據待補）。` },
      { heading: "十、風險分析", body: `列出市場、技術與營運風險及因應方式。` },
      { heading: "十一、執行步驟", body: `規劃從開發到上線的階段與里程碑。` },
    ],
    charts: [
      {
        title: "競品比較表",
        position: "競品分析後",
        purpose: `比較「${topic}」與競品的功能與定價。`,
        content: "以表格列出功能、價格、目標客群等欄位（資料待確認）。",
      },
      {
        title: "商業模式圖（Business Model Canvas）",
        position: "商業模式後",
        purpose: "整體呈現價值主張、客群、通路與收入結構。",
        content: "以九宮格呈現商業模式各要素。",
      },
    ],
    images: [
      {
        title: "產品使用情境示意圖",
        position: "使用情境後",
        purpose: `具體呈現使用者操作「${topic}」的情境。`,
        content: "可用流程截圖或情境插圖呈現。",
      },
    ],
    flowcharts: [
      {
        title: "使用者旅程流程圖",
        position: "使用情境後",
        purpose: "呈現使用者從認識到使用的歷程。",
        content: "認識 → 註冊 → 使用 → 付費 → 回購。",
      },
    ],
  };
}

function buildTechProject(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，從使用者需求、核心功能、系統架構、技術選型到開發與測試流程，規劃完整的專案藍圖。`,
    summary: `本報告規劃「${topic}」專案，說明使用者需求、核心功能、系統架構與技術選型，並涵蓋資料流程、開發步驟、測試方式與風險。`,
    background: `「${topic}」旨在以技術手段解決特定需求。本報告整理其需求與技術規劃，作為開發依據。`,
    motivation: `希望透過系統化規劃，釐清「${topic}」的功能範圍與技術可行性，降低開發風險。`,
    purpose: [
      `釐清「${topic}」的使用者需求與核心功能。`,
      `設計系統架構並選擇合適技術。`,
      `規劃資料流程、開發與測試步驟。`,
      `評估風險與未來擴充方向。`,
    ],
    questions: [
      `「${topic}」要解決什麼問題、服務哪些使用者？`,
      `「${topic}」需要哪些核心功能與技術？`,
      `如何確保「${topic}」的品質與可維護性？`,
    ],
    hypothesis: [
      `「${topic}」的核心需求可透過所選技術有效實現。`,
      `良好的架構設計能提升「${topic}」的可維護性與擴充性。`,
    ],
    literature: [
      `「${topic}」相關技術與框架的官方文件`,
      `類似系統的設計與最佳實務`,
      `資料安全與效能相關資料`,
    ],
    method: `採用系統分析與設計方法：先進行需求分析，再設計架構與資料流程，採用迭代開發並搭配測試驗證。`,
    analysis: `依需求拆解功能模組，評估各技術選項的優劣後選定方案〔建議補充技術比較〕，並設計資料流程確保正確與安全。`,
    discussion: `討論架構取捨、效能與安全考量，以及在資源限制下的取捨與優先順序。`,
    limitations: [
      `本報告為規劃階段，實際效能需以實作與測試驗證。`,
      `技術更新快速，選型需持續評估。`,
    ],
    conclusion: `綜合規劃，「${topic}」在功能與技術上具可行性，建議採用〔填入技術方案〕並依里程碑分階段開發與測試。`,
    futureWork: [
      `完成原型（Prototype）並進行使用者測試。`,
      `加入更多功能或串接外部服務。`,
    ],
    customSections: [
      { heading: "一、專案背景", body: `說明「${topic}」要解決的問題與目標。` },
      { heading: "二、使用者需求", body: `列出主要使用者與其需求（功能性與非功能性）。` },
      { heading: "三、核心功能", body: `條列「${topic}」的主要功能模組。` },
      { heading: "四、系統架構", body: `描述前端、後端、資料庫與外部服務的關係。` },
      { heading: "五、技術選型", body: `列出採用的語言、框架與工具及選擇理由。` },
      { heading: "六、資料流程", body: `說明資料如何輸入、處理、儲存與輸出。` },
      { heading: "七、開發步驟", body: `規劃開發階段與里程碑。` },
      { heading: "八、測試方式", body: `說明單元測試、整合測試與使用者測試的做法。` },
      { heading: "九、風險與限制", body: `列出技術、時間與資源風險及因應。` },
      { heading: "十、未來擴充", body: `規劃後續可加入的功能或優化方向。` },
    ],
    charts: [
      {
        title: "技術選型比較表",
        position: "技術選型後",
        purpose: "比較不同技術方案的優劣。",
        content: "以表格列出方案、優點、缺點與採用與否。",
      },
    ],
    images: [
      {
        title: "系統架構圖",
        position: "系統架構後",
        purpose: `呈現「${topic}」各元件之間的關係。`,
        content: "以方塊圖標示前端、後端、資料庫與外部服務。",
      },
      {
        title: "介面原型圖（Wireframe）",
        position: "核心功能後",
        purpose: "呈現主要畫面的版面配置。",
        content: "以線框圖呈現關鍵頁面。",
      },
    ],
    flowcharts: [
      {
        title: "資料流程圖",
        position: "資料流程後",
        purpose: "呈現資料在系統中的流動。",
        content: "使用者輸入 → 處理 → 儲存 → 回傳結果。",
      },
    ],
  };
}

function buildHealthcare(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，從服務對象、現況、挑戰、相關制度到案例與專業觀點進行整理，並提出個人反思與建議。`,
    summary: `本報告探討「${topic}」，說明服務對象與問題族群、現況與挑戰，整理相關制度與服務，並透過案例與專業觀點提出反思與建議。`,
    background: `「${topic}」涉及特定族群的需求與照顧議題，具有社會重要性。〔建議補充官方統計與專業資料〕`,
    motivation: `希望透過資料整理，更了解「${topic}」的現況與挑戰，並思考可行的支持方式。`,
    purpose: [
      `了解「${topic}」的服務對象與需求。`,
      `分析「${topic}」的現況與主要挑戰。`,
      `整理相關制度與服務資源。`,
      `透過案例提出專業觀點與個人反思。`,
    ],
    questions: [
      `「${topic}」主要服務或關注哪些族群？`,
      `「${topic}」目前面臨哪些挑戰？`,
      `有哪些制度或服務可以提供支持？`,
    ],
    hypothesis: [
      `「${topic}」的需求隨人口與社會結構變化而增加。`,
      `整合性的制度與服務能有效改善現況。`,
    ],
    literature: [
      `「${topic}」相關的官方統計與政策（資料待補）`,
      `專業研究與實務報告`,
      `服務模式與案例整理`,
    ],
    method: `採用文獻整理與案例分析法：蒐集官方資料、研究與實務案例，整理現況與挑戰並提出觀點。請注意本報告不做醫療診斷。`,
    analysis: `綜合資料可見「${topic}」面臨需求增加與資源不足等挑戰〔建議補充官方統計〕，需要制度、專業與家庭多方協力。`,
    discussion: `以尊重、客觀的態度討論「${topic}」的服務模式與限制；涉及醫療或心理判斷之處，應交由專業人員評估。`,
    limitations: [
      `本報告以二手資料為主，未進行實地調查。`,
      `涉及醫療與心理之內容需專業來源佐證，本報告不做診斷。`,
    ],
    conclusion: `綜合以上，「${topic}」需要制度支持、專業服務與社會理解的結合。本報告整理現況與建議，盼促進更完善的照顧與支持。`,
    futureWork: [
      `訪談服務對象或專業人員補充第一手觀點。`,
      `蒐集官方統計與政策評估資料。`,
    ],
    customSections: [
      { heading: "一、主題背景", body: `說明「${topic}」的背景與重要性。` },
      { heading: "二、服務對象或問題族群", body: `描述「${topic}」主要關注的族群與其需求。` },
      { heading: "三、現況說明", body: `說明「${topic}」目前的狀況。〔此處需要官方或研究統計〕` },
      { heading: "四、主要挑戰", body: `分析「${topic}」面臨的困難（人力、資源、制度等）。` },
      { heading: "五、相關制度或服務", body: `整理可運用的政策、補助或服務資源（資料待確認）。` },
      { heading: "六、案例分析", body: `以案例說明服務的實際情形（案例來源待確認，注意隱私）。` },
      { heading: "七、專業觀點", body: `引述專業人員或研究的看法（需專業來源佐證）。` },
      { heading: "八、個人反思", body: `提出對「${topic}」的反思與感受。` },
    ],
    charts: [
      {
        title: `${topic}相關統計圖`,
        position: "現況說明後",
        purpose: `呈現「${topic}」相關族群或需求的變化。`,
        content: `以折線圖或長條圖呈現官方數據（${SOURCE_NOTE}）。`,
      },
    ],
    images: [
      {
        title: "服務流程或資源示意圖",
        position: "相關制度或服務後",
        purpose: "讓讀者了解可運用的資源與管道。",
        content: "可用示意圖整理服務申請或轉介流程。",
      },
    ],
    flowcharts: [
      {
        title: "服務／轉介流程圖",
        position: "相關制度或服務後",
        purpose: "呈現取得服務的步驟。",
        content: "發現需求 → 評估 → 申請 → 提供服務 → 追蹤。",
      },
    ],
  };
}

function buildGeneral(topic: string): CategoryContent {
  return {
    summaryDirection: `本報告以「${topic}」為題，整理其背景、重要面向、現況與相關討論，並提出結論與個人觀點。`,
    summary: `本報告探討「${topic}」，從背景與動機出發，整理主要面向與現況，分析相關討論，最後提出結論與個人看法。`,
    background: `「${topic}」是值得整理與了解的主題。本報告蒐集相關資料，系統性地呈現其重要面向。〔建議補充背景資料〕`,
    motivation: `希望透過資料整理與分析，更完整地認識「${topic}」，並培養蒐集與組織資訊的能力。`,
    purpose: [
      `整理「${topic}」的背景與重要性。`,
      `分析「${topic}」的主要面向與現況。`,
      `提出結論與個人觀點。`,
    ],
    questions: [
      `「${topic}」的重要性與背景為何？`,
      `「${topic}」有哪些主要面向？`,
      `從「${topic}」可以得到什麼結論或啟發？`,
    ],
    hypothesis: [
      `「${topic}」可從多個面向加以理解。`,
      `深入整理「${topic}」有助於做出更完整的判斷。`,
    ],
    literature: [
      `「${topic}」的定義與基本資料`,
      `相關研究、報導或案例（來源待確認）`,
      `不同觀點的整理`,
    ],
    method: `採用文獻整理與歸納分析法：蒐集「${topic}」的相關資料，分類整理後加以分析並提出結論。`,
    analysis: `整理資料後可看出「${topic}」涵蓋多個面向〔建議補充具體資料與案例〕，彼此相互關聯。`,
    discussion: `比較不同資料與觀點，討論「${topic}」的重點與爭議，並提出個人判斷。`,
    limitations: [
      `本報告以二手資料整理為主，深度與廣度受限。`,
      `部分內容需更多資料佐證。`,
    ],
    conclusion: `綜合以上，「${topic}」具有多面向的內涵。本報告整理其重點與討論，作為後續深入研究的基礎。`,
    futureWork: [
      `補充第一手資料或實例。`,
      `針對特定面向做更深入的探討。`,
    ],
    customSections: [
      { heading: "一、主題背景", body: `介紹「${topic}」的基本背景與重要性。` },
      { heading: "二、主要面向", body: `整理「${topic}」的重要面向或分類。` },
      { heading: "三、現況分析", body: `說明「${topic}」目前的狀況或發展。` },
      { heading: "四、相關討論", body: `整理與「${topic}」相關的案例或不同觀點。` },
      { heading: "五、個人觀點", body: `提出對「${topic}」的看法。` },
    ],
    charts: [
      {
        title: `${topic}重點整理表`,
        position: "主要面向後",
        purpose: `整理「${topic}」的主要面向與重點。`,
        content: "以表格分類呈現各面向與說明。",
      },
    ],
    images: [
      {
        title: `${topic}概念圖`,
        position: "主題背景後",
        purpose: `以圖像呈現「${topic}」的核心概念與關聯。`,
        content: "可用心智圖整理重點。",
      },
    ],
    flowcharts: [
      {
        title: "主題架構圖",
        position: "主要面向後",
        purpose: `呈現「${topic}」各面向之間的關係。`,
        content: "以樹狀或關係圖呈現。",
      },
    ],
  };
}

function buildCategoryContent(topic: string, category: TopicCategory): CategoryContent {
  switch (category) {
    case "生物／動物":
      return buildBiology(topic);
    case "科學實驗":
      return buildExperiment(topic);
    case "社會議題":
      return buildSocialIssue(topic);
    case "歷史／地理／公民":
      return buildHistoryGeo(topic);
    case "讀書心得":
      return buildBookReflection(topic);
    case "商業／產品分析":
      return buildBusiness(topic);
    case "AI／網站／程式專案":
      return buildTechProject(topic);
    case "醫療／長照／社工／心理":
      return buildHealthcare(topic);
    case "食品／飲食文化":
      return buildFood(topic);
    case "化學／化工":
      return buildChemistry(topic);
    default:
      return buildGeneral(topic);
  }
}

// ─── Domain structure engine (Phase A) ───────────────────────────────────────
// The report skeleton is chosen from the topic domain + requested report type,
// instead of forcing one science-experiment spine onto every report. The
// per-category content builders already produce the raw fields (background,
// analysis, literature, …); this layer only decides which sections appear, in
// what order, and under which domain-appropriate headings.

export type StructureKind =
  | "experiment"
  | "business"
  | "market"
  | "book"
  | "tech"
  | "care"
  | "biology"
  | "chemistry"
  | "food"
  | "social"
  | "history"
  | "analytical";

/**
 * selectStructure — pick the section skeleton. reportType / purpose are stronger
 * signals than the detected category: a biology topic written as a 科展報告 is an
 * experiment, but the same topic as a 學校研究報告 is analytical (so it should NOT
 * get hypotheses / control groups).
 */
function selectStructure(category: TopicCategory, reportType: string, purpose: string): StructureKind {
  if (has(reportType, ["科展", "實驗"]) || has(purpose, ["科展", "實驗"]) || category === "科學實驗") {
    return "experiment";
  }
  if (has(reportType, ["市場研究"]) || has(purpose, ["市場研究", "市場分析"])) return "market";
  if (has(reportType, ["讀書心得", "讀書", "心得"]) || has(purpose, ["讀書心得", "讀書", "心得"]) || category === "讀書心得") {
    return "book";
  }
  if (has(reportType, ["商業"]) || has(purpose, ["商業分析"]) || category === "商業／產品分析") {
    return "business";
  }
  if (
    category === "AI／網站／程式專案" ||
    has(reportType, ["網站", "ＡＩ", "AI", "程式"]) ||
    has(purpose, ["網站", "AI", "程式"])
  ) {
    return "tech";
  }
  if (
    category === "醫療／長照／社工／心理" ||
    has(reportType, ["醫療", "長照", "社工", "社會工作", "心理", "照護", "照顧"]) ||
    has(purpose, ["醫療", "長照", "社工", "心理", "照護"])
  ) {
    return "care";
  }
  // Domain-specific knowledge frameworks (V3 PART 3). These run after the
  // reportType-driven overrides above so a 科展 biology topic still maps to
  // "experiment", but a 學校研究報告 biology topic gets the biology spine.
  if (category === "生物／動物") return "biology";
  if (category === "化學／化工") return "chemistry";
  if (category === "食品／飲食文化") return "food";
  if (category === "社會議題") return "social";
  if (category === "歷史／地理／公民") return "history";
  return "analytical";
}

const CJK_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五"];

/** numbered — apply 一、二、… prefixes after conditional sections are resolved. */
function numbered(items: ReportSection[]): ReportSection[] {
  return items.map((s, i) => ({ ...s, heading: `${CJK_NUM[i] ?? String(i + 1)}、${s.heading}` }));
}

/**
 * buildDomainSpine — the ordered body sections for the chosen structure. Headings
 * are bare here; numbering is applied last so conditional sections (e.g. an empty
 * hypothesis list) don't leave gaps. Bodies reuse existing CategoryContent fields
 * and never fabricate data — unknowns use 〔…〕 / 資料來源待補 placeholders.
 */
function buildDomainSpine(kind: StructureKind, input: ReportInput, content: CategoryContent): ReportSection[] {
  const t = input.topic;
  const p = (text: string): ContentBlock => ({ type: "paragraph", text });
  const l = (items: string[]): ContentBlock => ({ type: "list", items });
  const sectionsAsParas = (cs: CustomSection[]): ContentBlock[] =>
    cs.map((c) => ({ type: "paragraph", text: `${c.heading}：${c.body}` }) as ContentBlock);

  let raw: ReportSection[];

  switch (kind) {
    case "experiment":
      raw = [
        { heading: "實驗名稱", blocks: [p(t)] },
        { heading: "實驗目的", blocks: [l(content.purpose)] },
        {
          heading: "實驗原理",
          blocks: [
            p(`整理與「${t}」相關的科學原理、定義與既有研究方向：`),
            l(content.literature),
            ...(needsSource(input) ? [{ type: "note", text: INSERT_SOURCE_NOTE } as ContentBlock] : []),
          ],
        },
        { heading: "實驗器材", blocks: [p(`列出進行「${t}」所需的器材、材料、試劑與量測工具。此處需要補充資料。`)] },
        {
          heading: "實驗變因",
          blocks: [
            l([
              "操作變因：請填入本實驗主動改變的條件。",
              "應變變因：請填入觀察或量測的結果。",
              "控制變因：請列出需固定的條件。",
            ]),
          ],
        },
        { heading: "實驗步驟", blocks: [p(content.method)] },
        { heading: "實驗結果", blocks: [p("此處需要補充實際觀察結果與原始紀錄。")] },
        { heading: "數據整理", blocks: [p(content.analysis)] },
        { heading: "圖表分析", blocks: [suggestionsBlock("圖表", content.charts)] },
        { heading: "討論", blocks: [p(content.discussion)] },
        { heading: "結論", blocks: [p(content.conclusion)] },
        { heading: "誤差來源", blocks: [l(content.limitations)] },
        { heading: "改進方法", blocks: [l(content.futureWork)] },
      ];
      break;
    case "business":
      raw = [
        { heading: "執行摘要", blocks: [p(content.summary)] },
        { heading: "研究背景", blocks: [p(content.background)] },
        { heading: "市場現況", blocks: [p(`說明「${t}」所處市場的範圍、規模、成長性與主要參與者。〔建議補充市場數據，${SOURCE_NOTE}〕`)] },
        { heading: "目標客群", blocks: [p(`描述「${t}」的主要使用者、需求、使用情境與決策者。`), l(content.purpose)] },
        { heading: "競品分析", blocks: [p(content.analysis)] },
        {
          heading: "產品定位",
          blocks: [
            p(`以 SWOT 與價值主張評估「${t}」的差異化定位：`),
            l([
              `優勢（Strengths）：〔填入「${t}」的內部優勢〕`,
              "劣勢（Weaknesses）：〔填入內部不足或限制〕",
              "機會（Opportunities）：〔填入外部市場機會〕",
              "威脅（Threats）：〔填入外部競爭或風險〕",
            ]),
          ],
        },
        { heading: "商業模式", blocks: [p(`說明「${t}」的價值主張、收入來源、成本結構、通路與關鍵資源。`)] },
        { heading: "成本與資源需求", blocks: [p("列出人力、時間、技術、營運與預算需求。此處需要補充資料。")] },
        { heading: "風險分析", blocks: [l(content.limitations)] },
        { heading: "執行步驟", blocks: [l(content.futureWork)] },
        {
          heading: "預期效益",
          blocks: [p(`說明「${t}」預期帶來的效率、品質、營收、品牌或決策效益。實際效益需以後續數據驗證。`)],
        },
        { heading: "結論與建議", blocks: [p(content.conclusion)] },
      ];
      break;
    case "market":
      raw = [
        {
          heading: "市場概況",
          blocks: [p(`說明「${t}」所在市場的整體規模、結構與發展階段。〔建議補充市場數據，${SOURCE_NOTE}〕`)],
        },
        {
          heading: "客群分析",
          blocks: [p(`描述「${t}」的主要客群輪廓、需求與消費行為，並區分不同的客群區隔。`), l(content.purpose)],
        },
        { heading: "競爭態勢", blocks: [p(content.analysis)] },
        { heading: "市場趨勢", blocks: [l(content.literature)] },
        {
          heading: "機會點",
          blocks: [p(`綜合市場與競爭分析，找出「${t}」可切入的市場缺口與成長機會。`)],
        },
        { heading: "建議", blocks: [p(content.conclusion), l(content.futureWork)] },
      ];
      break;
    case "book":
      raw = [
        { heading: "書名與作者", blocks: [p(`書名或主題：${t}。作者、出版社與出版年份：此處需要補充資料。`)] },
        { heading: "作者介紹", blocks: [p("請根據書籍或可信來源補充作者背景，不要捏造作者生平。")] },
        { heading: "書籍大意", blocks: [p(`概述「${t}」的主要內容、章節脈絡與作者想傳達的核心訊息。`)] },
        { heading: "重要內容整理", blocks: [l(content.purpose)] },
        { heading: "印象最深的段落", blocks: [p("請摘錄或描述印象最深的段落，並說明原因。若未提供原文，請標示此處需要補充資料。")] },
        { heading: "個人心得", blocks: [p(content.discussion)] },
        { heading: "與生活經驗的連結", blocks: [p(`說明「${t}」如何連結到個人的學習、家庭、同儕互動或生活經驗。`)] },
        { heading: "批判與反思", blocks: [p("提出自己同意與不同意的地方，避免只做情節摘要。")] },
        { heading: "結論", blocks: [p(content.conclusion)] },
      ];
      break;
    case "tech":
      raw = [
        {
          heading: "問題定義",
          blocks: [p(`說明「${t}」要解決的問題、目標使用者與專案範圍。`), l(content.questions)],
        },
        { heading: "技術背景", blocks: [l(content.literature)] },
        {
          heading: "系統設計",
          blocks: [p(`描述「${t}」的整體架構，包含前端、後端、資料庫與外部服務之間的關係，以及主要功能模組。`)],
        },
        { heading: "實作規劃", blocks: [p(content.method)] },
        {
          heading: "評估與測試",
          blocks: [p(`說明如何驗證「${t}」的正確性與效能，包含單元測試、整合測試與使用者測試。`)],
        },
        { heading: "未來發展", blocks: [p(content.conclusion), l(content.futureWork)] },
      ];
      break;
    case "care":
      raw = [
        { heading: "背景與重要性", blocks: [p(content.background)] },
        { heading: "服務對象與需求", blocks: [l(content.purpose)] },
        { heading: "現況與挑戰", blocks: [p(content.analysis)] },
        { heading: "相關制度與資源", blocks: [l(content.literature)] },
        { heading: "案例與專業觀點", blocks: [p(content.discussion)] },
        { heading: "反思與建議", blocks: [p(content.conclusion), l(content.futureWork)] },
      ];
      break;
    case "biology":
      raw = [
        { heading: "研究背景", blocks: [p(content.background)] },
        {
          heading: "文獻探討",
          blocks: [
            p(`整理與「${t}」相關的分類、特徵與既有研究方向：`),
            l(content.literature),
            ...(needsSource(input) ? [{ type: "note", text: INSERT_SOURCE_NOTE } as ContentBlock] : []),
          ],
        },
        { heading: "生物特徵與生態", blocks: sectionsAsParas(content.customSections) },
        { heading: "研究方法", blocks: [p(content.method)] },
        { heading: "分析與討論", blocks: [p(content.analysis), p(content.discussion)] },
        { heading: "結論", blocks: [p(content.conclusion)] },
      ];
      break;
    case "chemistry":
      raw = [
        { heading: "研究背景", blocks: [p(content.background)] },
        { heading: "化學原理與性質", blocks: sectionsAsParas(content.customSections) },
        { heading: "實驗設計", blocks: [p(content.method)] },
        { heading: "結果與分析", blocks: [p(content.analysis)] },
        { heading: "討論", blocks: [p(content.discussion)] },
        { heading: "結論", blocks: [p(content.conclusion)] },
      ];
      break;
    case "food":
      raw = [
        { heading: "食品背景與來源", blocks: [p(content.background)] },
        { heading: "營養成分與價值", blocks: sectionsAsParas(content.customSections) },
        { heading: "製程與品質安全", blocks: [p(content.method)] },
        { heading: "現況與市場分析", blocks: [p(content.analysis)] },
        { heading: "飲食文化與討論", blocks: [p(content.discussion)] },
        { heading: "結論與建議", blocks: [p(content.conclusion), l(content.futureWork)] },
      ];
      break;
    case "social":
      raw = [
        { heading: "社會背景", blocks: [p(content.background)] },
        { heading: "現況分析", blocks: [p(content.analysis)] },
        { heading: "問題分析（成因與影響）", blocks: sectionsAsParas(content.customSections) },
        { heading: "案例與多元觀點", blocks: [p(content.discussion)] },
        { heading: "解決建議", blocks: [l(content.futureWork)] },
        { heading: "結論與個人觀點", blocks: [p(content.conclusion)] },
      ];
      break;
    case "history":
      raw = [
        { heading: "主題背景", blocks: [p(content.background)] },
        { heading: "歷史脈絡與重要面向", blocks: sectionsAsParas(content.customSections) },
        { heading: "現況與影響", blocks: [p(content.analysis)] },
        { heading: "討論與爭議", blocks: [p(content.discussion)] },
        { heading: "結論與省思", blocks: [p(content.conclusion)] },
      ];
      break;
    default: // analytical — 一般學校報告
      raw = [
        { heading: "背景與重要性", blocks: [p(content.background)] },
        { heading: "現況分析", blocks: [p(content.analysis)] },
        { heading: "主要面向探討", blocks: sectionsAsParas(content.customSections) },
        { heading: "案例與討論", blocks: [p(content.discussion)] },
        { heading: "結論與觀點", blocks: [p(content.conclusion)] },
      ];
  }

  return numbered(raw);
}

// ─── Style & length tone helpers ─────────────────────────────────────────────

function styleNote(style: string, audience: string): string {
  const map: Record<string, string> = {
    高中生自然報告風格: `語氣自然、用詞淺顯，適合${audience}閱讀並可直接提交給老師。`,
    高中生可提交: `語氣自然、用詞淺顯，適合${audience}閱讀並可直接提交給老師。`,
    "90 分以上學校報告風格": `結構完整、含研究問題、方法、圖表與研究限制，適合正式評分。`,
    "90 分以上學校報告": `結構完整、含研究問題、方法、圖表與研究限制，適合正式評分。`,
    學術研究風格: `用詞正式、加強文獻探討與研究方法，並含限制與未來研究。`,
    商業顧問風格: `以決策為導向，聚焦市場、成本、風險與執行，結論可支持行動。`,
    口語簡報風格: `句子簡短、重點清楚，適合口頭報告，可轉為簡報講稿。`,
    深度研究報告風格: `結構詳盡、分析深入，並需要真實資料來源補強。`,
    深度研究報告: `結構詳盡、分析深入，並需要真實資料來源補強。`,
  };
  return map[style] ?? `語氣設定為「${style}」。`;
}

/**
 * styleLead — a tone-setting opening sentence prepended to the summary so the
 * generated text itself (not just the reminder) reflects the chosen style.
 */
function styleLead(style: string): string {
  const map: Record<string, string> = {
    高中生自然報告風格: "（以高中生自然報告風格撰寫，保留個人理解與清楚說明。）",
    高中生可提交: "（以淺顯、口語化的方式說明，方便理解與直接提交。）",
    "90 分以上學校報告風格": "（以嚴謹、完整的學術結構撰寫，強調研究問題、方法與限制。）",
    "90 分以上學校報告": "（以嚴謹、完整的學術結構撰寫，強調研究問題、方法與限制。）",
    學術研究風格: "（採正式學術語氣，加重文獻探討、研究方法與理論依據。）",
    商業顧問風格: "（以決策導向撰寫，聚焦市場、成本、風險與可執行建議。）",
    口語簡報風格: "（以精簡、條列式重點呈現，適合口頭報告與簡報講稿。）",
    深度研究報告風格: "（以深入分析撰寫，延伸比較、數據與多元觀點。）",
    深度研究報告: "（以深入分析撰寫，延伸比較、數據與多元觀點。）",
  };
  return map[style] ?? "";
}

type LengthDetail = "brief" | "normal" | "full" | "deep";

interface LengthSpec {
  versionBase: string;
  completeness: number;
  remind: boolean; // 深度研究 reminder
  detail: LengthDetail;
  lead: string; // length framing sentence prepended to summary
  listCap: number; // max items shown in expandable lists (Infinity = no cap)
}

function lengthSpec(length: string): LengthSpec {
  switch (length) {
    case "短版摘要":
      return {
        versionBase: "短版摘要",
        completeness: 50,
        remind: false,
        detail: "brief",
        lead: "（短版摘要：以下為精簡版本，僅聚焦核心重點，可再依需求擴寫。）",
        listCap: 3,
      };
    case "完整報告":
      return {
        versionBase: "完整報告草稿",
        completeness: 80,
        remind: false,
        detail: "full",
        lead: "（完整報告：以下涵蓋各主要面向，建議搭配資料來源充實內容。）",
        listCap: Infinity,
      };
    case "深度研究":
      return {
        versionBase: "深度研究草稿",
        completeness: 85,
        remind: true,
        detail: "deep",
        lead: "（深度研究：以下提供延伸方向，建議補充更多文獻、數據與比較分析。）",
        listCap: Infinity,
      };
    default:
      return {
        versionBase: "一般報告草稿",
        completeness: 65,
        remind: false,
        detail: "normal",
        lead: "",
        listCap: Infinity,
      };
  }
}

// ─── Source / reference helpers ──────────────────────────────────────────────

function citationTemplate(format: string): string {
  switch (format) {
    case "APA":
      return "作者或機構名稱。（年份）。文章或資料標題。網站或出版單位。網址";
    case "MLA":
      return "作者。〈文章標題〉。《網站或出版單位名稱》，年份，網址。";
    case "Chicago":
      return "作者。「文章標題。」網站或出版單位名稱。年份。網址。";
    case "其他":
      return "請依老師或單位指定格式填寫（格式範例待補）。";
    default:
      return "";
  }
}

function buildReferenceBlocks(input: ReportInput): ContentBlock[] {
  const bibliography = buildBibliography(input.acceptedSources, input.citationFormat || "APA");
  if (!needsSource(input) && bibliography.length === 0) return [];

  if (bibliography.length > 0) {
    const incompleteCount = bibliography.filter((entry) => entry.incomplete).length;
    return [
      {
        type: "paragraph",
        text: `參考文獻格式（${input.citationFormat === "不需要" ? "APA" : input.citationFormat || "APA"}）：`,
      },
      {
        type: "list",
        items: bibliography.map((entry) => entry.text),
      },
      ...(incompleteCount > 0
        ? [
            {
              type: "note",
              text: `${incompleteCount} 筆已接受來源的 metadata 不完整；已標示 incomplete，請補齊作者、年份、標題或 DOI／網址後再正式提交。`,
            } as ContentBlock,
          ]
        : []),
      {
        type: "paragraph",
        text: "資料來源可信度分級：A＝政府、官方、學術論文；B＝大學、研究機構、出版社；C＝新聞媒體、專業網站；D＝部落格、論壇、未知來源。",
      },
    ];
  }

  const blocks: ContentBlock[] = [
    {
      type: "note",
      text: "此處需要補充真實資料來源，建議使用官方網站、政府資料、學術論文、期刊或可信機構資料。為避免錯誤，本系統不自動產生來源，請自行查證後填入。",
    },
  ];
  if (wantsReferences(input) && input.citationFormat !== "不需要") {
    blocks.push({
      type: "paragraph",
      text: `參考文獻格式（${input.citationFormat}）：`,
    });
    blocks.push({
      type: "list",
      items: [
        citationTemplate(input.citationFormat),
        "範例（請替換為實際資料）：〔作者或機構〕。〔年份〕。〔標題〕。〔出處〕。〔網址〕",
        "資料來源待補",
        "來源待確認",
      ],
    });
  } else {
    blocks.push({
      type: "list",
      items: ["資料來源待補", "此處需要補充官方資料或學術資料", "建議查詢政府網站、學術論文、期刊、出版社或可信機構資料"],
    });
  }
  blocks.push({
    type: "paragraph",
    text: "資料來源可信度分級：A＝政府、官方、學術論文；B＝大學、研究機構、出版社；C＝新聞媒體、專業網站；D＝部落格、論壇、未知來源。",
  });
  return blocks;
}

// ─── Data requirement rows ───────────────────────────────────────────────────

function buildDataRows(topic: string, kind: StructureKind): DataRequirementRow[] {
  // Common opening + closing rows; domain-specific middle rows make each report's
  // data-collection table genuinely different per topic domain (V3 acceptance).
  const wrap = (specific: DataRequirementRow[]): DataRequirementRow[] => [
    { type: "主題背景資料", need: `「${topic}」的定義、基本介紹與重要性`, use: "建立報告的背景與前言", priority: "高" },
    ...specific,
    { type: "使用者個人觀點", need: "個人看法、反思或經驗", use: "提升報告深度與獨特性", priority: "高" },
    { type: "引用來源", need: "可信的出處與連結", use: "撰寫參考文獻、避免抄襲", priority: "高" },
  ];

  switch (kind) {
    case "biology":
      return wrap([
        { type: "物種分類資料", need: `「${topic}」的門綱目科分類與形態特徵`, use: "撰寫生物分類與特徵", priority: "高" },
        { type: "生態與習性資料", need: "食性、繁殖、棲地與行為觀察", use: "支持習性與棲息環境分析", priority: "高" },
        { type: "圖鑑／照片", need: "外型構造圖與棲地照片", use: "標註特徵、輔助辨識", priority: "中" },
        { type: "族群／分布數據", need: "數量、分布或產量統計", use: "繪製比較圖、量化分析", priority: "中" },
      ]);
    case "chemistry":
      return wrap([
        { type: "物質基本資料", need: `「${topic}」的化學式、結構與物理化學性質`, use: "撰寫化學原理與性質", priority: "高" },
        { type: "反應與機制資料", need: "相關化學反應式與作用機制", use: "解釋原理與實驗依據", priority: "高" },
        { type: "實驗測定數據", need: "可重現的量測數據（濃度、含量等）", use: "結果分析與圖表", priority: "高" },
        { type: "安全資料（SDS）", need: "危害性、保存與操作注意事項", use: "實驗安全與討論", priority: "中" },
      ]);
    case "food":
      return wrap([
        { type: "營養成分資料", need: `「${topic}」的營養標示與成分含量`, use: "撰寫營養與成分", priority: "高" },
        { type: "生產／來源資料", need: "產地、原料來源或製程流程", use: "說明來源與製程", priority: "中" },
        { type: "食品安全規範", need: "衛生標準、保存與檢驗法規", use: "安全與品質分析", priority: "高" },
        { type: "市場／消費數據", need: "產量、消費量或價格趨勢", use: "現況與市場分析、圖表", priority: "中" },
      ]);
    case "social":
      return wrap([
        { type: "官方統計數據", need: `「${topic}」的政府或機構統計`, use: "佐證現況與影響", priority: "高" },
        { type: "成因相關研究", need: "學術研究或調查報告", use: "問題分析", priority: "高" },
        { type: "國內外案例", need: "相關政策或事件案例", use: "案例探討與比較", priority: "中" },
        { type: "多元觀點資料", need: "不同立場的論述與報導", use: "呈現多元觀點與討論", priority: "中" },
      ]);
    case "history":
      return wrap([
        { type: "史料／檔案", need: `「${topic}」的史料、地圖或制度文件`, use: "建立歷史脈絡與背景", priority: "高" },
        { type: "重要事件年表", need: "關鍵年代、人物與事件", use: "整理發展脈絡與時間軸", priority: "高" },
        { type: "現況與影響資料", need: "保存、運作或影響的現況", use: "現況與影響分析", priority: "中" },
        { type: "不同詮釋觀點", need: "學界或社會的不同解讀", use: "討論與爭議", priority: "中" },
      ]);
    case "business":
      return wrap([
        { type: "市場規模數據", need: `「${topic}」所屬市場規模與成長率`, use: "市場分析", priority: "高" },
        { type: "競品資料", need: "主要競品功能、定價與市占", use: "競品分析與比較表", priority: "高" },
        { type: "財務／成本數據", need: "成本結構、營收或獲利估算", use: "商業模式與風險評估", priority: "中" },
        { type: "產業趨勢報告", need: "產業鏈與趨勢分析", use: "產業概況與未來展望", priority: "中" },
      ]);
    case "market":
      return wrap([
        { type: "市場規模與區隔", need: "整體規模與客群區隔數據", use: "市場概況與客群分析", priority: "高" },
        { type: "消費行為調查", need: "問卷或調查資料", use: "客群分析", priority: "高" },
        { type: "競爭者資料", need: "競爭者定位與市占", use: "競爭態勢分析", priority: "中" },
        { type: "趨勢數據", need: "歷年趨勢與預測", use: "市場趨勢與機會點", priority: "中" },
      ]);
    case "tech":
      return wrap([
        { type: "需求規格", need: `「${topic}」的使用者需求與功能規格`, use: "問題定義與系統設計", priority: "高" },
        { type: "技術文件", need: "框架、API 與函式庫官方文件", use: "技術背景與選型", priority: "高" },
        { type: "架構參考", need: "類似系統設計與最佳實務", use: "系統設計", priority: "中" },
        { type: "測試資料", need: "測試案例與效能指標", use: "評估與測試", priority: "中" },
      ]);
    case "experiment":
      return wrap([
        { type: "科學原理資料", need: `「${topic}」相關原理與定義`, use: "實驗原理與文獻探討", priority: "高" },
        { type: "實驗數據", need: "多次量測的原始數據", use: "結果分析與圖表", priority: "高" },
        { type: "器材與方法", need: "器材規格與操作步驟", use: "實驗方法與重現性", priority: "中" },
        { type: "誤差分析資料", need: "誤差來源與對照組數據", use: "討論與改進", priority: "中" },
      ]);
    case "care":
      return wrap([
        { type: "官方統計與政策", need: `「${topic}」的統計與相關制度`, use: "背景與制度資源", priority: "高" },
        { type: "專業研究與實務", need: "學術研究或實務報告", use: "現況與挑戰分析", priority: "高" },
        { type: "服務模式案例", need: "服務模式與案例整理", use: "案例與專業觀點", priority: "中" },
        { type: "服務對象需求", need: "需求調查或訪談（不做醫療診斷）", use: "服務對象與需求", priority: "中" },
      ]);
    case "book":
      return wrap([
        { type: "書籍基本資料", need: `《${topic}》的作者、出版資訊與章節架構`, use: "內容摘要", priority: "高" },
        { type: "重點段落摘錄", need: "印象深刻的觀點與引文", use: "重點觀念與反思", priority: "高" },
        { type: "個人經驗連結", need: "與自身生活或學習的連結", use: "個人啟發", priority: "中" },
        { type: "延伸資料", need: "相關書評或補充資料", use: "批判與應用", priority: "低" },
      ]);
    default:
      return wrap([
        { type: "統計數據", need: "相關的數量、比例或趨勢數據", use: "佐證現況與分析", priority: "中" },
        { type: "文獻資料", need: "書籍、論文、期刊或官方文件", use: "支持論點、撰寫文獻探討", priority: "高" },
        { type: "案例", need: "國內外相關實例", use: "具體說明與比較", priority: "中" },
        { type: "圖表數據", need: "可繪製圖表的原始數據", use: "製作圖表呈現結果", priority: "中" },
      ]);
  }
}

// ─── Quality checklist ───────────────────────────────────────────────────────

function buildQualityChecks(input: ReportInput, content: CategoryContent): QualityCheck[] {
  const sourcesReady = !needsSource(input) || hasUserSources(input);
  const chartsReady = input.chartRequirement !== "需要" || content.charts.length > 0 || content.images.length > 0 || content.flowcharts.length > 0;
  const wordCountReady = !input.wordCount.trim() || normalizeMode(input.mode) !== "structure";
  const readerReady = Boolean(input.targetAudience || input.academicLevel);

  return [
    {
      label: "是否符合主題",
      passed: chars(input.topic) > 0,
      reason: chars(input.topic) > 0 ? undefined : "尚未輸入主題。",
    },
    {
      label: "是否架構清楚",
      passed: content.customSections.length > 0,
      reason: content.customSections.length > 0 ? undefined : "尚未建立可用章節架構。",
    },
    {
      label: "是否有研究深度",
      passed: content.questions.length > 0 && content.method.length > 0,
      reason: content.questions.length > 0 && content.method.length > 0 ? undefined : "需要補充研究問題或方法。",
    },
    {
      label: "是否有資料來源",
      passed: sourcesReady,
      reason: sourcesReady ? undefined : "使用者尚未提供真實來源；目前只能標示資料來源待補。",
    },
    {
      label: "是否有圖表建議",
      passed: chartsReady,
      reason: chartsReady ? undefined : "已選擇需要圖表，但目前缺少可用圖表或圖片建議。",
    },
    {
      label: "是否有結論與反思",
      passed: content.conclusion.length > 0 && (content.futureWork.length > 0 || content.discussion.length > 0),
      reason: content.conclusion.length > 0 ? undefined : "尚未形成結論。",
    },
    {
      label: "是否語氣一致",
      passed: Boolean(input.style),
      reason: input.style ? undefined : "尚未指定報告風格。",
    },
    {
      label: "是否有錯字或格式錯誤",
      passed: false,
      reason: "目前為本地模擬生成，仍需人工校對錯字、格式與專有名詞。",
    },
    {
      label: "是否符合指定字數",
      passed: wordCountReady,
      reason: wordCountReady ? undefined : "架構模式尚未撰寫完整正文，無法保證字數。",
    },
    {
      label: "是否符合指定讀者程度",
      passed: readerReady,
      reason: readerReady ? undefined : "尚未指定使用對象或學術程度。",
    },
  ];
}

// ─── Suggestion block helper ─────────────────────────────────────────────────

function suggestionsBlock(kind: "圖表" | "圖片" | "流程圖", list: SuggestionBlock[]): ContentBlock {
  return { type: "suggestions", suggestionKind: kind, suggestions: list };
}

function additionalInfoSection(input: ReportInput): ReportSection | null {
  const lines = userMaterialLines(input);
  if (lines.length === 0) return null;
  return {
    heading: "使用者需求與補充資料（已優先納入）",
    blocks: [
      { type: "note", text: "以下為你提供的字數、架構、評分標準、寫作風格與來源資料，後續撰寫需逐項對應。" },
      { type: "list", items: lines },
      { type: "note", text: "撰寫時請確認上述每一項要求都已對應到報告的相關段落。" },
    ],
  };
}

/**
 * applyStyleAndLength — post-process generated sections so the chosen style and
 * length materially change the output: a tone-setting lead is prepended to the
 * summary, short-version output is trimmed, and deep research gains an extension
 * prompt. Operates on freshly built section objects (safe to replace blocks).
 */
function applyStyleAndLength(sections: ReportSection[], input: ReportInput): ReportSection[] {
  const ls = lengthSpec(input.length);
  const lead = `${styleLead(input.style)}${ls.lead}`.trim();

  if (lead && sections.length > 0) {
    const first = sections[0];
    const idx = first.blocks.findIndex((b) => b.type === "paragraph");
    if (idx >= 0) {
      const p = first.blocks[idx];
      first.blocks[idx] = { ...p, text: `${lead}\n${p.text ?? ""}` };
    } else {
      first.blocks = [{ type: "note", text: lead }, ...first.blocks];
    }
  }

  if (ls.listCap !== Infinity) {
    for (const s of sections) {
      s.blocks = s.blocks.map((b) => {
        if (b.type === "list" && b.items && b.items.length > ls.listCap) {
          return {
            ...b,
            items: [...b.items.slice(0, ls.listCap), "…（短版摘要已精簡，需完整內容請改用一般或完整報告長度）"],
          };
        }
        return b;
      });
    }
  }

  if (ls.detail === "deep" && sections.length > 0) {
    sections[0].blocks = [
      ...sections[0].blocks,
      {
        type: "note",
        text: "深度研究建議：補充至少 3 筆真實文獻、跨案例或跨時間的比較，以及量化數據佐證，以提升分析深度。",
      },
    ];
  }

  return sections;
}

// ─── Mode builders ───────────────────────────────────────────────────────────

function buildFiveStepSection(input: ReportInput, content: CategoryContent, kind: StructureKind): ReportSection {
  return {
    heading: "五步驟生成流程",
    blocks: [
      {
        type: "list",
        items: [
          `Step 1：需求確認｜主題「${input.topic}」、類型「${input.reportType}」、對象「${input.targetAudience}」、風格「${input.style}」。`,
          `Step 2：報告架構設計｜採用「${frameworkLabel(kind)}」，先建立章節與研究問題，不直接硬寫全文。`,
          `Step 3：資料需求表｜列出必要資料、可信來源與圖表數據；缺資料處標示「此處需要補充資料」。`,
          `Step 4：正式撰寫｜使用確認後的架構與真實來源撰寫正文；目前模式為「${input.mode}」。`,
          `Step 5：品質檢查｜完成後逐項檢查主題、架構、資料來源、圖表、結論、語氣、字數與讀者程度。`,
        ],
      },
      {
        type: "note",
        text:
          normalizeMode(input.mode) === "full"
            ? "你選擇直接生成完整報告，因此系統會同時輸出正文草稿與檢查提醒。"
            : "目前先輸出規劃與資料需求，避免在資料不足時直接產生不可靠的完整報告。",
      },
    ],
  };
}

function buildSourceSafetySection(input: ReportInput): ReportSection {
  const hasSources = hasUserSources(input);
  return {
    heading: "資料來源與引用安全規則",
    blocks: [
      {
        type: "note",
        text: "本工具只會把你接受的搜尋結果或你貼上的來源線索納入引用規劃；未接受或遭拒絕的來源不得進入參考文獻。若 metadata 不完整，系統不得捏造作者、年份、文章名稱或網址。",
      },
      {
        type: "list",
        items: [
          hasSources ? "已偵測到已接受來源或使用者貼上的來源線索；仍需逐一人工查證。" : "目前沒有可驗證來源，只能輸出「資料來源待補」「來源待確認」「此處需要補充資料」。",
          "APA、MLA、Chicago 或其他引用格式只能根據使用者提供的來源格式化，不可假造來源。",
          "每個重要事實若沒有來源，請標示「此處需要補充資料」。",
          "可信度 A：政府、官方、學術論文；B：大學、研究機構、出版社；C：新聞媒體、專業網站；D：部落格、論壇、未知來源。",
        ],
      },
    ],
  };
}

function buildQualityOnlySections(input: ReportInput, content: CategoryContent): ReportSection[] {
  return [
    {
      heading: "品質檢查表",
      blocks: [{ type: "quality", checks: buildQualityChecks(input, content) }],
    },
    buildSourceSafetySection(input),
  ];
}

function buildRewriteSections(input: ReportInput, content: CategoryContent, kind: StructureKind): ReportSection[] {
  const target = input.rewriteSection.trim() || "尚未指定章節";
  return [
    {
      heading: "指定章節重寫規劃",
      blocks: [
        {
          type: "paragraph",
          text: `重寫目標：${target}。請先貼上原章節內容或在補充資料區提供要改寫的段落；若沒有原文，系統只能提供重寫方向，不會假裝已完成改寫。`,
        },
        {
          type: "list",
          items: [
            `維持主題「${input.topic}」與架構「${frameworkLabel(kind)}」。`,
            `語氣依「${input.style}」調整。`,
            "補足缺少的資料來源標示，沒有來源的事實需標示「此處需要補充資料」。",
            "改寫後保留個人寫作風格與評分標準要求。",
          ],
        },
      ],
    },
    {
      heading: "可直接使用的重寫提示",
      blocks: [
        {
          type: "paragraph",
          text: [
            `請將下列章節改寫為「${input.style}」，輸出語言為「${input.outputLanguage || "繁體中文"}」。`,
            `報告主題：${input.topic}`,
            `指定章節：${target}`,
            `字數需求：${input.wordCount || "未指定"}`,
            `評分標準：${input.rubric || "未提供"}`,
            `原文或補充資料：${input.supplementalMaterials || input.additionalInfo || "此處需要補充資料"}`,
            "請勿新增未提供的作者、年份、文章名稱或網址；缺來源處標示「來源待確認」。",
          ].join("\n"),
        },
      ],
    },
    buildSourceSafetySection(input),
  ];
}

function buildStructureSections(
  input: ReportInput,
  content: CategoryContent,
  kind: StructureKind,
): ReportSection[] {
  const sections: ReportSection[] = [];
  const addInfo = additionalInfoSection(input);

  sections.push(buildFiveStepSection(input, content, kind));
  sections.push({ heading: "摘要方向", blocks: [{ type: "paragraph", text: content.summaryDirection }] });
  if (addInfo) sections.push(addInfo);

  // Domain-aware body skeleton (replaces the former fixed experiment spine).
  sections.push(...buildDomainSpine(kind, input, content));

  if (input.chartRequirement === "需要") {
    sections.push({ heading: "預計圖表", blocks: [suggestionsBlock("圖表", content.charts)] });
    sections.push({
      heading: "預計圖片與流程圖",
      blocks: [suggestionsBlock("圖片", content.images), suggestionsBlock("流程圖", content.flowcharts)],
    });
  }

  sections.push({ heading: "資料需求表", blocks: [{ type: "dataTable", rows: buildDataRows(input.topic, kind) }] });

  const refBlocks = buildReferenceBlocks(input);
  if (refBlocks.length > 0) sections.push({ heading: "參考資料與來源", blocks: refBlocks });
  sections.push(buildSourceSafetySection(input));

  return sections;
}

function buildFullSections(
  input: ReportInput,
  content: CategoryContent,
  kind: StructureKind,
): ReportSection[] {
  const sections: ReportSection[] = [];
  const addInfo = additionalInfoSection(input);

  sections.push(buildFiveStepSection(input, content, kind));
  sections.push({ heading: "摘要", blocks: [{ type: "paragraph", text: content.summary }] });
  if (addInfo) sections.push(addInfo);

  // Domain-aware body skeleton (replaces the former fixed experiment spine).
  sections.push(...buildDomainSpine(kind, input, content));

  if (input.chartRequirement === "需要") {
    sections.push({ heading: "圖表建議", blocks: [suggestionsBlock("圖表", content.charts)] });
  }

  const refBlocks = buildReferenceBlocks(input);
  sections.push({
    heading: "參考文獻",
    blocks: refBlocks.length > 0 ? refBlocks : [{ type: "note", text: "未要求資料來源；如需提交正式報告，建議補充真實參考文獻。" }],
  });
  sections.push(buildSourceSafetySection(input));

  return sections;
}

function buildSlideSections(input: ReportInput, content: CategoryContent): ReportSection[] {
  const t = input.topic;
  const bibliography = buildBibliography(input.acceptedSources, input.citationFormat || "APA");
  const slides: SlideItem[] = [
    { page: 1, title: "封面", points: [`題目：${t}`, `報告類型：${input.reportType}`, `對象：${input.targetAudience}`], visual: "封面圖或主題代表圖片" },
    { page: 2, title: "研究背景", points: [content.background], visual: "背景情境圖或概念圖" },
    { page: 3, title: "研究動機", points: [content.motivation], visual: "問題情境插圖" },
    { page: 4, title: "研究目的", points: content.purpose, visual: "目標條列或圖示" },
    { page: 5, title: "核心問題", points: content.questions, visual: "問號或重點標示" },
    { page: 6, title: "主要分析", points: content.customSections.slice(0, 4).map((c) => `${c.heading.replace(/^[一二三四五六七八九十]+、/, "")}：${c.body}`), visual: "重點整理表" },
    { page: 7, title: "圖表頁", points: content.charts.map((c) => `${c.title}：${c.purpose}`), visual: "對應圖表" },
    { page: 8, title: "討論", points: [content.discussion], visual: "對照或比較圖" },
    { page: 9, title: "結論", points: [content.conclusion], visual: "重點總結圖示" },
    {
      page: 10,
      title: "參考資料",
      points: bibliography.length
        ? bibliography.map((entry) => entry.text)
        : needsSource(input)
          ? ["資料來源待補", "建議補充真實官方或學術資料"]
          : ["（本次未要求資料來源）"],
      visual: "參考資料列表",
    },
  ];
  return [{ heading: "簡報大綱", blocks: [{ type: "slides", slides }] }];
}

function buildDataTableSections(input: ReportInput, kind: StructureKind): ReportSection[] {
  return [
    {
      heading: "資料需求表",
      blocks: [
        { type: "paragraph", text: `以下整理完成「${input.topic}」報告所需蒐集的資料、用途與優先程度，請依此逐項補齊。` },
        { type: "dataTable", rows: buildDataRows(input.topic, kind) },
        ...(needsSource(input) ? [{ type: "note", text: SOURCE_NOTE } as ContentBlock] : []),
      ],
    },
  ];
}

function buildChartImageSections(input: ReportInput, content: CategoryContent): ReportSection[] {
  return [
    { heading: "建議圖表", blocks: [suggestionsBlock("圖表", content.charts)] },
    { heading: "建議圖片", blocks: [suggestionsBlock("圖片", content.images)] },
    { heading: "建議流程圖", blocks: [suggestionsBlock("流程圖", content.flowcharts)] },
  ];
}

// ─── Research planner (Eric 研究模式 / Phase F) ───────────────────────────────

export type ResearchIntent =
  | "探究原理"
  | "比較分析"
  | "現況調查"
  | "實作開發"
  | "文獻回顧"
  | "心得反思";

/** detectIntent — infer the research intent behind a topic, used to frame the
 *  planning blueprint. Pure heuristic on topic + report type. */
export function detectIntent(input: ReportInput): ResearchIntent {
  const t = input.topic;
  const rt = input.reportType;
  if (has(rt, ["讀書心得"]) || has(t, ["心得", "讀後"])) return "心得反思";
  if (has(rt, ["網站", "程式", "AI"]) || has(t, ["系統", "app", "平台", "開發", "程式", "網站"])) {
    return "實作開發";
  }
  if (has(rt, ["實驗", "科展"]) || has(t, ["氧化", "速率", "變因", "測定", "對", "影響"])) {
    return "探究原理";
  }
  if (has(t, ["比較", "差異", "vs", "優劣", "競品"])) return "比較分析";
  if (has(rt, ["市場", "商業", "社會議題"]) || has(t, ["現況", "趨勢", "市場", "議題", "永續"])) {
    return "現況調查";
  }
  return "文獻回顧";
}

const INTENT_NOTE: Record<ResearchIntent, string> = {
  探究原理: "此主題偏向探究現象背後的原理或變因關係，建議以假設與驗證為核心。",
  比較分析: "此主題偏向比較不同對象或方案，建議建立明確的比較面向與標準。",
  現況調查: "此主題偏向描述現況與趨勢，建議蒐集統計數據與多元觀點。",
  實作開發: "此主題偏向實作或專案，建議以需求、設計、實作與測試為主軸。",
  文獻回顧: "此主題偏向整理既有知識，建議以系統性的文獻整理與分類為主。",
  心得反思: "此主題偏向個人理解與反思，建議聚焦重點觀念與個人連結。",
};

/** frameworkLabel — human-readable name for the chosen structure skeleton. */
export function frameworkLabel(kind: StructureKind): string {
  const m: Record<StructureKind, string> = {
    experiment: "科學實驗架構",
    business: "商業分析架構",
    market: "市場研究架構",
    book: "讀書心得架構",
    tech: "資訊專案架構",
    care: "照護／社工架構",
    biology: "生物學研究架構",
    chemistry: "化學研究架構",
    food: "食品科學架構",
    social: "社會議題架構",
    history: "史地公民架構",
    analytical: "一般分析架構",
  };
  return m[kind];
}

/** firstText — pull the first readable line out of a section for the outline. */
function firstText(section: ReportSection): string {
  for (const b of section.blocks) {
    if (b.type === "paragraph" && b.text) return b.text;
    if (b.type === "list" && b.items && b.items.length > 0) return b.items[0];
  }
  return "〔請補充本段內容〕";
}

/**
 * buildEricSections — the research-planning blueprint (Topic → Domain → Intent →
 * Framework → Questions → Evidence → Report). Reuses the same domain content and
 * spine so the plan matches what 報告架構／完整報告 would produce.
 */
function buildEricSections(
  input: ReportInput,
  content: CategoryContent,
  kind: StructureKind,
  category: TopicCategory,
): ReportSection[] {
  const t = input.topic;
  const intent = detectIntent(input);
  const spine = buildDomainSpine(kind, input, content);

  const raw: ReportSection[] = [
    {
      heading: "研究領域與研究意圖",
      blocks: [
        {
          type: "paragraph",
          text: `主題：「${t}」。系統判定領域：${category}；採用架構：${frameworkLabel(kind)}；研究意圖：${intent}。`,
        },
        { type: "note", text: INTENT_NOTE[intent] },
      ],
    },
    { heading: "研究問題", blocks: [{ type: "list", items: content.questions }] },
    { heading: "研究目的", blocks: [{ type: "list", items: content.purpose }] },
    ...(content.hypothesis.length > 0
      ? [{ heading: "研究假設", blocks: [{ type: "list", items: content.hypothesis } as ContentBlock] }]
      : []),
    {
      heading: "文獻探討方向",
      blocks: [
        { type: "paragraph", text: `建議從以下方向蒐集與「${t}」相關的文獻：` },
        { type: "list", items: content.literature },
        ...(needsSource(input) ? [{ type: "note", text: INSERT_SOURCE_NOTE } as ContentBlock] : []),
      ],
    },
    {
      heading: "建議研究架構（章節）",
      blocks: [{ type: "list", items: spine.map((s) => s.heading) }],
    },
    { heading: "建議圖表", blocks: [suggestionsBlock("圖表", content.charts)] },
    {
      heading: "建議資料表格",
      blocks: [
        { type: "paragraph", text: "完成本研究建議蒐集的資料、用途與優先程度：" },
        { type: "dataTable", rows: buildDataRows(t, kind) },
      ],
    },
    { heading: "建議流程圖", blocks: [suggestionsBlock("流程圖", content.flowcharts)] },
    {
      heading: "報告初稿大綱",
      blocks: spine.map((s) => ({ type: "paragraph", text: `${s.heading}｜${firstText(s)}` }) as ContentBlock),
    },
  ];

  return numbered(raw);
}

// ─── Completeness ────────────────────────────────────────────────────────────

function computeMeta(input: ReportInput, category: TopicCategory, content: CategoryContent): ReportMeta {
  const ls = lengthSpec(input.length);
  const mode = normalizeMode(input.mode);

  const modeBase: Record<NormalizedMode, { label: string; base: number }> = {
    structure: { label: "五步驟報告架構草稿", base: 45 },
    full: { label: "完整報告草稿", base: 80 },
    data: { label: "資料需求表", base: 35 },
    charts: { label: "圖表與圖片建議", base: 45 },
    quality: { label: "品質檢查表", base: 30 },
    rewrite: { label: "指定章節重寫規劃", base: 42 },
    eric: { label: "研究規劃藍圖", base: 60 },
    slides: { label: "簡報大綱", base: 55 },
  };
  const m = modeBase[mode];

  // Combine mode base with a small nudge from length and additional info.
  let completeness = Math.round((m.base + ls.completeness) / 2);
  if (userMaterialLines(input).length > 0) completeness += 5;
  if (hasAcceptedSources(input)) completeness += 6;
  if (input.acceptedSources.some((source) => sourceHasIncompleteMetadata(source))) completeness -= 3;
  if (input.chartRequirement === "需要") completeness += 2;
  // Without real sources we cap below "finished".
  completeness = Math.min(completeness, hasAcceptedSources(input) ? 92 : 88);

  const suggested: string[] = [];
  if (needsSource(input)) suggested.push("資料來源");
  suggested.push("統計數據", "案例", "圖表資料");
  if (!input.personalStyle.trim()) suggested.push("個人觀點");
  if (!input.rubric.trim()) suggested.push("老師評分標準");

  return {
    title: `《${input.topic}》${input.reportType}`,
    category,
    versionLabel: m.label,
    completeness,
    suggestedAdditions: suggested,
    acceptedSources: input.acceptedSources,
    bibliography: buildBibliography(input.acceptedSources, input.citationFormat || "APA"),
  };
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * generateReport
 * Synchronous mock generator. Swap the body for an async model call later;
 * keep the GeneratedReport return shape stable so the UI needs no changes.
 */
export function generateReport(input: ReportInput): GeneratedReport {
  const topic = input.topic.trim();
  const mode = normalizeMode(input.mode);
  const safeInput: ReportInput = isShortTopic(topic) && mode === "full"
    ? { ...input, mode: "先建立報告架構" }
    : input;
  // V3: an explicit domain override (set in the UI) wins over AI detection.
  const override = safeInput.domainOverride?.trim();
  const category: TopicCategory =
    override && (TOPIC_CATEGORIES as readonly string[]).includes(override)
      ? (override as TopicCategory)
      : detectTopicCategory(topic, safeInput.reportType, safeInput.purpose);
  const content = buildCategoryContent(topic, category);
  const kind = selectStructure(category, safeInput.reportType, safeInput.purpose);
  const meta = computeMeta(safeInput, category, content);

  let sections: ReportSection[];
  switch (normalizeMode(safeInput.mode)) {
    case "full":
      sections = buildFullSections(safeInput, content, kind);
      break;
    case "eric":
      sections = buildEricSections(safeInput, content, kind, category);
      break;
    case "slides":
      sections = buildSlideSections(safeInput, content);
      break;
    case "data":
      sections = buildDataTableSections(safeInput, kind);
      break;
    case "charts":
      sections = buildChartImageSections(safeInput, content);
      break;
    case "quality":
      sections = buildQualityOnlySections(safeInput, content);
      break;
    case "rewrite":
      sections = buildRewriteSections(safeInput, content, kind);
      break;
    default:
      sections = buildStructureSections(safeInput, content, kind);
  }

  // Style + length materially shape narrative output (summary lead, trimming,
  // deep-research prompts). Skip pure-table/suggestion modes that have no summary.
  if (["structure", "full", "slides"].includes(normalizeMode(safeInput.mode))) {
    sections = applyStyleAndLength(sections, safeInput);
  }

  // Quality checklist is appended for narrative modes.
  if (["structure", "full"].includes(normalizeMode(safeInput.mode))) {
    sections.push({
      heading: "報告品質檢查表",
      blocks: [{ type: "quality", checks: buildQualityChecks(safeInput, content) }],
    });
  }

  // Style note at the very end as a small reminder section.
  sections.push({
    heading: "寫作風格提醒",
    blocks: [
      { type: "note", text: `${styleNote(safeInput.style, safeInput.targetAudience)}${lengthSpec(safeInput.length).remind ? "（深度研究需補充真實資料來源、統計與參考文獻。）" : ""}` },
    ],
  });

  const report: GeneratedReport = { meta, sections };

  if (isShortTopic(topic)) {
    report.shortTopic = {
      message:
        mode === "full"
          ? "你的主題較簡短，系統已改為先建立研究方向、報告架構與資料需求表，避免在資料不足時硬寫完整報告。"
          : "你的主題較簡短，系統已先產生基礎版本。若要提高報告品質，建議補充研究方向、老師要求、資料來源或個人觀點。",
      expansions: expandTopic(topic, category),
    };
  }

  return report;
}
