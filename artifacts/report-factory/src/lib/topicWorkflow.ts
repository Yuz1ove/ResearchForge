export type TopicWorkflowState =
  | "idle"
  | "validating"
  | "invalid"
  | "needs_disambiguation"
  | "ready"
  | "sensitive_research_only"
  | "error";

export type TopicLanguage = "zh" | "en" | "mixed" | "unknown";

export type TopicType =
  | "wildlife_conservation"
  | "domestic_livestock"
  | "plant_horticulture"
  | "paleontology"
  | "medicine_endocrinology"
  | "medicine_public_health"
  | "illegal_drug_research_safe"
  | "material_object"
  | "chemistry"
  | "chemical_substance"
  | "physics"
  | "mathematics"
  | "earth_science"
  | "general_science"
  | "geography_environment"
  | "history_culture"
  | "literature_language"
  | "society_policy"
  | "education"
  | "psychology"
  | "economics"
  | "biology_ecology"
  | "public_health_drug"
  | "technology_ai"
  | "engineering"
  | "computer_science"
  | "robotics"
  | "energy"
  | "applied_technology"
  | "general_ambiguous"
  | "sensitive_research_only";

export type ResearchDomain =
  | "natural_science"
  | "humanities_social_science"
  | "life_environment"
  | "technology_engineering_application";

export type TopicSafetyScope =
  | "normal"
  | "sensitive_research_only"
  | "blocked_operational";

export type ResearchDirectionSource = "llm" | "rule_fallback";

export type ResearchIntentTag =
  | "background_context"
  | "mechanism"
  | "health_risk"
  | "public_health"
  | "policy_analysis"
  | "clinical_use"
  | "culture_history"
  | "comparative_analysis"
  | "environmental_impact"
  | "industry_supply_chain"
  | "ethics_welfare"
  | "technology_application"
  | "literature_analysis"
  | "research_methods";

export interface TopicValidationResult {
  status: TopicWorkflowState;
  reason: string;
  rawTopic: string;
  normalizedTopic: string;
  language: TopicLanguage;
  topicType: TopicType;
  safetyScope: TopicSafetyScope;
  userMessageZh: string;
}

export interface TopicWorkflowOptions {
  domainHint?: ResearchDomain | null;
}

export interface GenerateResearchDirectionOptions {
  topicRunId?: string | null;
  previousTopic?: string | null;
}

export interface ResearchDirection {
  id: string;
  topicRunId: string;
  rawTopic: string;
  displayTitleZh: string;
  researchQuestionZh: string;
  polishedTitleZh?: string;
  descriptionZh: string;
  expandedScopeZh?: string;
  intentTag: ResearchIntentTag;
  intentTagZh: string;
  topicType: TopicType;
  safetyScope: TopicSafetyScope;
  searchQueryZh: string;
  englishKeywords: string[];
  bilingualQueries: string[];
  isSafeForSearch: boolean;
  createdFrom: ResearchDirectionSource;
  debugInfo?: Record<string, unknown>;
}

export const RESEARCH_DOMAIN_OPTIONS: readonly {
  id: ResearchDomain;
  label: string;
  description: string;
  topicTypes: readonly TopicType[];
}[] = Object.freeze([
  {
    id: "natural_science",
    label: "自然科學",
    description: "適合物理、化學、數學、天文、地球科學等主題。",
    topicTypes: [
      "chemistry",
      "chemical_substance",
      "physics",
      "mathematics",
      "earth_science",
      "paleontology",
      "general_science",
    ],
  },
  {
    id: "humanities_social_science",
    label: "人文與社會類",
    description: "適合歷史、文化、語言、教育、社會、心理、政策與經濟議題。",
    topicTypes: [
      "history_culture",
      "literature_language",
      "society_policy",
      "education",
      "psychology",
      "economics",
      "general_ambiguous",
    ],
  },
  {
    id: "life_environment",
    label: "生命與環境類",
    description: "適合生物、醫學、保育、農業、環境、生態與公共衛生議題。",
    topicTypes: [
      "wildlife_conservation",
      "domestic_livestock",
      "plant_horticulture",
      "medicine_endocrinology",
      "medicine_public_health",
      "geography_environment",
      "biology_ecology",
      "public_health_drug",
      "illegal_drug_research_safe",
    ],
  },
  {
    id: "technology_engineering_application",
    label: "科技、工程與應用類",
    description: "適合資訊、AI、工程、材料、產品、能源、機械與應用技術。",
    topicTypes: [
      "technology_ai",
      "engineering",
      "material_object",
      "computer_science",
      "robotics",
      "energy",
      "applied_technology",
    ],
  },
]);

type DirectionSpec = {
  title: string;
  question: string;
  description: string;
  intentTag: ResearchIntentTag;
  englishKeywords: string[];
  englishQuery: string;
  zhQuery?: string;
};

const INTENT_LABEL_ZH: Record<ResearchIntentTag, string> = {
  background_context: "背景脈絡",
  mechanism: "作用機制",
  health_risk: "健康風險",
  public_health: "公共衛生",
  policy_analysis: "政策分析",
  clinical_use: "臨床使用",
  culture_history: "歷史文化",
  comparative_analysis: "比較分析",
  environmental_impact: "環境影響",
  industry_supply_chain: "產業供應鏈",
  ethics_welfare: "倫理福利",
  technology_application: "技術應用",
  literature_analysis: "文本分析",
  research_methods: "研究方法",
};

const ILLEGAL_DRUG_TERMS = [
  "海洛因",
  "heroin",
  "芬太尼",
  "fentanyl",
  "甲基安非他命",
  "methamphetamine",
  "安非他命",
  "amphetamine",
  "古柯鹼",
  "cocaine",
  "mdma",
  "搖頭丸",
  "毒品",
  "narcotic",
];

const OTHER_SENSITIVE_TERMS = ["武器", "槍枝", "炸彈", "爆裂物", "自傷", "自殺"];

const OPERATIONAL_TERMS = [
  "製作",
  "合成",
  "取得",
  "購買",
  "販售",
  "劑量",
  "使用方法",
  "使用方式",
  "施用",
  "注射",
  "吸食",
  "提純",
  "規避",
  "躲避",
  "查緝",
  "配方",
  "教學",
  "how to",
  "make",
  "buy",
  "dose",
  "purify",
  "evade",
];

const TOPIC_TERMS: Record<Exclude<TopicType, "general_ambiguous" | "sensitive_research_only">, readonly string[]> = {
  illegal_drug_research_safe: ILLEGAL_DRUG_TERMS,
  chemistry: ["化學反應", "酸鹼", "溶液", "實驗濃度", "沉澱反應", "氧化還原"],
  medicine_endocrinology: [
    "生長激素",
    "growth hormone",
    "胰島素",
    "insulin",
    "甲狀腺素",
    "thyroxine",
    "皮質醇",
    "cortisol",
    "腎上腺素",
    "adrenaline",
    "雌激素",
    "estrogen",
    "睪固酮",
    "testosterone",
  ],
  medicine_public_health: [
    "抗生素",
    "antibiotic",
    "疫苗",
    "vaccine",
    "止痛藥",
    "降血壓藥",
    "抗病毒藥",
    "antiviral",
    "麻醉藥",
    "抗藥性",
    "感染",
    "公共衛生",
    "醫療",
    "臨床",
    "疾病",
  ],
  wildlife_conservation: [
    "石虎",
    "台灣黑熊",
    "穿山甲",
    "梅花鹿",
    "鯨豚",
    "草鴞",
    "櫻花鉤吻鮭",
    "綠蠵龜",
    "海龜",
    "海龜幼體",
    "幼龜",
    "鹿",
    "野生動物",
    "保育",
  ],
  domestic_livestock: ["豬", "雞", "牛", "羊", "鴨", "鵝", "蜜蜂", "蜂", "畜牧", "家禽"],
  plant_horticulture: [
    "玫瑰",
    "蘭花",
    "稻米",
    "茶樹",
    "茶",
    "向日葵",
    "仙人掌",
    "櫻花",
    "咖啡樹",
    "番茄",
    "植物",
  ],
  paleontology: [
    "恐龍化石",
    "化石",
    "恐龍",
    "古生物",
    "古生態",
    "地層年代",
    "地層",
    "岩層",
    "paleontology",
    "fossil",
    "dinosaur",
    "stratigraphy",
  ],
  biology_ecology: ["生物", "生態", "演化", "細胞", "基因", "微生物", "食物鏈", "棲地", "行為模式", "幼體"],
  chemical_substance: [
    "乙醇",
    "氯化鈉",
    "硫酸",
    "二氧化碳",
    "氨",
    "甲烷",
    "微塑膠",
    "鋰",
    "甲醛",
    "formaldehyde",
    "活性碳",
    "活性炭",
    "activated carbon",
    "吸附",
    "化學",
    "化合物",
    "分子",
    "元素",
    "催化",
  ],
  physics: ["太陽帆", "輻射壓", "光壓", "航天推進", "泡泡水", "表面張力", "物理", "力學", "光學", "電磁", "浮力", "聲波", "熱傳導"],
  mathematics: ["數學", "幾何", "代數", "機率", "統計", "函數", "微積分", "數列"],
  earth_science: ["地球科學", "地震", "火山", "板塊", "岩石", "氣象", "天文", "星系"],
  general_science: ["科學方法", "自然科學", "實驗設計", "觀察紀錄", "變因控制"],
  geography_environment: [
    "國家公園",
    "黃石國家公園",
    "河流",
    "濕地",
    "海岸侵蝕",
    "都市熱島",
    "城市熱島",
    "空氣污染",
    "山區步道",
    "河流污染",
    "海岸",
    "人工夜間照明",
    "夜間照明",
    "光害",
    "海洋",
    "氣候",
    "環境",
    "地理",
    "東京",
    "台南",
  ],
  history_culture: [
    "媽祖信仰",
    "月兔",
    "地方文化",
    "傳統技藝",
    "神話",
    "節慶",
    "歷史事件",
    "民俗",
    "宗教",
    "文化",
    "歷史",
  ],
  literature_language: ["文學", "語言", "小說", "詩", "修辭", "閱讀", "翻譯", "文本"],
  society_policy: ["社會", "政策", "公共議題", "治理", "法律", "公平", "社區", "人口"],
  education: ["教育", "學習", "教學", "課程", "學生", "學校", "素養", "同儕回饋", "第二語言", "寫作", "修訂"],
  psychology: ["心理", "情緒", "動機", "認知", "壓力", "睡眠品質", "睡眠不足", "青少年", "工作記憶", "注意力", "行為"],
  economics: ["經濟", "市場", "價格", "通膨", "供需", "產業", "消費"],
  public_health_drug: ["藥物", "用藥", "藥品安全", "抗藥性", "流行病", "健康政策"],
  technology_ai: [
    "人工智慧",
    "ai",
    "機器學習",
    "machine learning",
    "區塊鏈",
    "搜尋引擎",
    "瀏覽器",
    "機器人",
    "演算法",
    "深度學習",
    "網站",
    "程式",
    "半導體",
    "晶片",
  ],
  engineering: ["工程", "橋梁", "機械", "結構", "製程", "控制系統", "土木", "濾材", "移除效率"],
  computer_science: ["資訊", "程式", "資料庫", "網路", "資安", "軟體", "演算法"],
  robotics: ["機器人", "自動化", "感測器", "控制器", "無人機"],
  energy: ["能源", "太陽能", "太陽能板", "光伏", "photovoltaic", "風力", "電池", "儲能", "發電", "氫能", "發電效率"],
  applied_technology: ["應用技術", "產品設計", "技術應用", "智慧製造", "創新應用", "室內環境", "空氣品質"],
  material_object: [
    "玉佩",
    "陶瓷",
    "青銅器",
    "玻璃",
    "紙張",
    "塑膠",
    "石器",
    "布料",
    "材料",
    "器物",
    "工具",
    "產品",
    "手機",
    "家具",
  ],
};

const BROAD_TOPICS = [
  "ai",
  "人工智慧",
  "教育",
  "海洋",
  "癌症",
  "化學",
  "生物",
  "物理",
  "資訊",
  "社會",
  "文化",
  "歷史",
  "茶",
  "鋰",
  "雞",
  "蜂",
  "鹿",
  "東京",
  "台南",
];

const RESEARCH_ANGLE_TERMS = [
  "利用價值",
  "形成原因",
  "發展歷史",
  "應用",
  "影響",
  "原理",
  "比較",
  "限制",
  "機制",
  "價值",
  "原因",
  "歷史",
  "用途",
  "優勢",
  "風險",
  "關係",
];

const SHORT_SEARCHABLE_SUBJECT_TERMS = [
  "太陽帆",
  "月兔",
  "玉佩",
  "黃石國家公園",
  "皂化反應",
  "石虎",
  "豬",
  "玫瑰",
  "恐龍",
  "化石",
  "抗生素",
  "搜尋引擎",
];

const GENERIC_REPORT_REQUEST_PATTERN =
  /幫我(做|寫|產生|生成).{0,6}報告|做一份報告|寫一份報告|我要研究(一個)?(東西|主題)|研究一個東西|報告題目|隨便.*報告/u;

const POLLUTION_TERMS = [
  "背景脈絡",
  "主要類型",
  "核心特徵",
  "形成過程",
  "使用方式",
  "應用情境",
];

const DISALLOWED_BY_TYPE: Partial<Record<TopicType, readonly string[]>> = {
  wildlife_conservation: ["材料特性", "製造限制", "設計差異", "使用脈絡", "產品設計", "工藝成本", "製造工藝"],
  domestic_livestock: ["材料特性", "製造限制", "設計差異", "使用脈絡", "產品設計", "工藝成本", "製造工藝"],
  plant_horticulture: ["材料特性", "製造限制", "設計差異", "使用脈絡", "產品設計", "工藝成本", "製造工藝"],
  medicine_endocrinology: ["材料特性", "製造限制", "設計差異", "使用脈絡", "產品設計", "工藝成本", "製造工藝"],
  medicine_public_health: ["材料特性", "製造限制", "設計差異", "使用脈絡", "產品設計", "工藝成本", "製造工藝"],
  illegal_drug_research_safe: [
    "使用方式",
    "製作方式",
    "取得",
    "購買",
    "販售",
    "劑量",
    "提純",
    "規避",
    "查緝",
    "教學",
  ],
  sensitive_research_only: ["使用方式", "製作方式", "取得", "購買", "販售", "劑量", "提純", "規避", "查緝", "教學"],
  general_ambiguous: ["材料特性", "製造限制", "設計差異", "產品設計", "工藝成本", "製造工藝"],
};

const BLOCKED_OPERATIONAL_PATTERN =
  /製作|合成|取得|購買|販售|劑量|使用方法|使用方式|施用|注射|吸食|提純|規避|躲避|查緝|配方|教學|how to|make|buy|dose|purify|evade/i;

const TOPIC_ENGLISH_HINTS: Record<string, string[]> = {
  石虎: ["leopard cat", "habitat fragmentation", "conservation"],
  台灣黑熊: ["Formosan black bear", "wildlife conservation", "habitat corridor"],
  穿山甲: ["pangolin", "wildlife monitoring", "roadkill"],
  草鴞: ["grass owl", "habitat conservation", "farmland ecology"],
  櫻花鉤吻鮭: ["Formosan landlocked salmon", "stream habitat", "conservation"],
  綠蠵龜: ["green sea turtle", "marine conservation", "nesting habitat"],
  恐龍化石: ["dinosaur fossil", "paleontology", "stratigraphy", "fossil preservation"],
  藻類: ["algae", "algal fossils", "cyanobacteria", "stromatolite", "microfossil"],
  化石: ["fossil", "paleontology", "stratigraphy", "fossil record"],
  恐龍: ["dinosaur", "paleontology", "evolution", "fossil record"],
  豬: ["pig farming", "livestock disease", "animal welfare"],
  雞: ["poultry farming", "avian influenza", "animal welfare"],
  牛: ["cattle farming", "feed nutrition", "methane emissions"],
  蜜蜂: ["honeybee", "pollination", "colony health"],
  玫瑰: ["rose cultivation", "plant disease", "horticulture"],
  蘭花: ["orchid cultivation", "breeding", "horticulture"],
  稻米: ["rice cultivation", "crop breeding", "climate adaptation"],
  茶樹: ["tea plant", "cultivation", "pest management"],
  生長激素: ["growth hormone", "endocrine regulation", "clinical diagnosis"],
  胰島素: ["insulin", "glucose metabolism", "endocrinology"],
  甲狀腺素: ["thyroxine", "thyroid hormone", "metabolism"],
  抗生素: ["antibiotic", "antimicrobial resistance", "public health"],
  疫苗: ["vaccine", "immunization", "public health"],
  海洛因: ["heroin addiction", "public health harms", "harm reduction"],
  芬太尼: ["fentanyl public health", "overdose prevention", "harm reduction"],
  玉佩: ["jade pendant", "material culture", "archaeology", "conservation"],
  陶瓷: ["ceramics", "craft technique", "conservation"],
  青銅器: ["bronze artifact", "archaeology", "conservation"],
  乙醇: ["ethanol", "chemical properties", "safety risk"],
  氯化鈉: ["sodium chloride", "chemical properties", "industrial application"],
  硫酸: ["sulfuric acid", "chemical safety", "industrial application"],
  濕地: ["wetland ecosystem", "environmental governance", "monitoring data"],
  都市熱島: ["urban heat island", "climate adaptation", "remote sensing"],
  黃石國家公園: ["Yellowstone National Park", "geothermal features", "ecosystem conservation", "volcanic geology"],
  月兔: ["moon rabbit", "mythology", "cultural symbolism"],
  媽祖信仰: ["Mazu belief", "folk religion", "cultural heritage"],
  太陽帆: ["solar sail propulsion", "radiation pressure", "spacecraft mission", "deep space exploration"],
  輻射壓: ["radiation pressure", "solar radiation pressure", "photon momentum"],
  搜尋引擎: ["search engine", "ranking algorithm", "information retrieval"],
  瀏覽器: ["web browser", "web standards", "privacy governance"],
  太陽能板: ["solar panel", "photovoltaic module", "surface roughness", "optical reflection", "power conversion efficiency"],
  表面粗糙度: ["surface roughness", "textured surface", "light trapping"],
  光反射: ["optical reflectance", "surface reflection", "anti-reflection"],
  發電效率: ["power conversion efficiency", "photovoltaic performance", "solar cell efficiency"],
  睡眠不足: ["sleep deprivation", "sleep restriction", "adolescent cognition"],
  工作記憶: ["working memory", "cognitive performance"],
  注意力: ["attention", "sustained attention"],
  同儕回饋: ["peer feedback", "peer review", "writing revision"],
  第二語言: ["second language", "L2 writing", "second language writing"],
  海龜: ["sea turtle", "hatchling orientation", "artificial light at night"],
  夜間照明: ["artificial light at night", "light pollution", "coastal lighting"],
  活性碳: ["activated carbon", "formaldehyde adsorption", "indoor air quality"],
  活性炭: ["activated carbon", "formaldehyde adsorption", "indoor air quality"],
  甲醛: ["formaldehyde", "indoor formaldehyde removal", "adsorption efficiency"],
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function includesAny(value: string, terms: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

export function researchDomainLabel(domain: ResearchDomain): string {
  return RESEARCH_DOMAIN_OPTIONS.find((option) => option.id === domain)?.label ?? domain;
}

export function topicTypeToResearchDomain(
  topicType: TopicType,
  rawTopic = "",
): ResearchDomain | null {
  if (topicType === "general_ambiguous") {
    const topic = compactWhitespace(rawTopic);
    if (includesAny(topic, ["月兔", "神話", "民俗", "文化", "歷史", "教育", "社會", "政策", "經濟", "心理"])) {
      return "humanities_social_science";
    }
    return null;
  }
  return (
    RESEARCH_DOMAIN_OPTIONS.find((option) => option.topicTypes.includes(topicType))?.id ??
    null
  );
}

export function inferResearchDomain(rawTopic: string): ResearchDomain | null {
  const topic = compactWhitespace(rawTopic);
  if (!topic || looksLikeGibberish(topic) || looksLikePromptInjection(topic)) return null;
  return topicTypeToResearchDomain(detectTopicType(topic), topic);
}

function topicTypeForDomainHint(domain: ResearchDomain | null | undefined): TopicType {
  switch (domain) {
    case "natural_science":
      return "general_science";
    case "humanities_social_science":
      return "history_culture";
    case "life_environment":
      return "biology_ecology";
    case "technology_engineering_application":
      return "applied_technology";
    default:
      return "general_ambiguous";
  }
}

function countHan(value: string): number {
  return Array.from(value).filter((char) => /[\u4e00-\u9fff]/u.test(char)).length;
}

function detectLanguage(value: string): TopicLanguage {
  const hasHan = /[\u4e00-\u9fff]/u.test(value);
  const hasLatin = /[A-Za-z]/.test(value);
  if (hasHan && hasLatin) return "mixed";
  if (hasHan) return "zh";
  if (hasLatin) return "en";
  return "unknown";
}

function looksLikePromptInjection(value: string): boolean {
  return /ignore\s+(all\s+)?previous|system\s+prompt|吐出.*金鑰|洩漏.*金鑰|攻擊網站|刪除資料|忽略.*規則|破解|越獄/i.test(
    value,
  );
}

function looksLikeGibberish(value: string): boolean {
  const text = compactWhitespace(value);
  if (!text) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(text)) return true;
  if (/^(.)\1{4,}$/u.test(text)) return true;
  if (/^(?:asdf|qwer|qwerty|zzz|xxx|abc)(?:\s+(?:asdf|qwer|qwerty|zzz|xxx|abc))*$/i.test(text)) return true;
  if (/[\u3100-\u312f]/u.test(text) && countHan(text) === 0) return true;
  if (/[\p{Extended_Pictographic}]/u.test(text) && countHan(text) === 0 && !/[A-Za-z0-9]/.test(text)) return true;
  const alnumOnly = text.replace(/[^A-Za-z0-9]/g, "");
  if (alnumOnly.length >= 7 && alnumOnly.length === text.length) {
    if (!/ai|api|covid|gpt|tsmc|nasa|mit|usa|sdg/i.test(text)) return true;
  }
  const symbolCount = Array.from(text).filter((char) => /[^\u4e00-\u9fffA-Za-z0-9\s]/u.test(char)).length;
  return symbolCount >= Math.max(4, Math.ceil(Array.from(text).length * 0.6));
}

function looksLikeGenericReportRequest(value: string): boolean {
  return GENERIC_REPORT_REQUEST_PATTERN.test(compactWhitespace(value));
}

function containsResearchAngle(value: string): boolean {
  return includesAny(value, RESEARCH_ANGLE_TERMS);
}

function isRecognizableShortSubject(value: string): boolean {
  const topic = compactWhitespace(value);
  if (!topic) return false;
  if (BROAD_TOPICS.some((item) => item.toLowerCase() === topic.toLowerCase())) return false;
  return SHORT_SEARCHABLE_SUBJECT_TERMS.some((term) => topic.includes(term));
}

function hasResearchableSubjectAndAngle(value: string): boolean {
  const topic = compactWhitespace(value);
  if (!containsResearchAngle(topic)) return false;
  if (looksLikeGenericReportRequest(topic)) return false;
  return isRecognizableShortSubject(topic) || detectTopicType(topic) !== "general_ambiguous";
}

function isSpecificResearchTopic(value: string): boolean {
  return (
    hasResearchableSubjectAndAngle(value) ||
    /對.+的影響/u.test(value) ||
    /與.+的(?:關係|關聯)/u.test(value) ||
    /在.+中的/u.test(value) ||
    (/比較|成效|因素|機制|風險|政策|影響|關係|關聯|差異|評估|分析|探討/u.test(value) &&
      Array.from(value).length >= 10) ||
    /effect|impact|relationship|comparison|risk|policy|analysis|evaluation|mechanism/i.test(value)
  );
}

function detectTopicType(topic: string): TopicType {
  if (includesAny(topic, TOPIC_TERMS.illegal_drug_research_safe)) return "illegal_drug_research_safe";
  if (includesAny(topic, OTHER_SENSITIVE_TERMS)) return "sensitive_research_only";
  if (includesAny(topic, TOPIC_TERMS.medicine_endocrinology)) return "medicine_endocrinology";
  if (includesAny(topic, TOPIC_TERMS.medicine_public_health)) return "medicine_public_health";
  if (includesAny(topic, TOPIC_TERMS.wildlife_conservation)) return "wildlife_conservation";
  if (includesAny(topic, TOPIC_TERMS.domestic_livestock)) return "domestic_livestock";
  if (includesAny(topic, TOPIC_TERMS.plant_horticulture)) return "plant_horticulture";
  if (includesAny(topic, TOPIC_TERMS.paleontology)) return "paleontology";
  if (includesAny(topic, TOPIC_TERMS.biology_ecology)) return "biology_ecology";
  if (includesAny(topic, TOPIC_TERMS.chemical_substance)) return "chemical_substance";
  if (includesAny(topic, TOPIC_TERMS.physics)) return "physics";
  if (includesAny(topic, TOPIC_TERMS.chemistry)) return "chemistry";
  if (includesAny(topic, TOPIC_TERMS.mathematics)) return "mathematics";
  if (includesAny(topic, TOPIC_TERMS.earth_science)) return "earth_science";
  if (includesAny(topic, TOPIC_TERMS.general_science)) return "general_science";
  if (includesAny(topic, TOPIC_TERMS.geography_environment)) return "geography_environment";
  if (includesAny(topic, TOPIC_TERMS.history_culture)) return "history_culture";
  if (
    includesAny(topic, TOPIC_TERMS.education) &&
    !/人工智慧|生成式|(^|[^A-Za-z])AI(?=$|[^A-Za-z])|artificial intelligence|generative ai|machine learning/i.test(topic) &&
    /同儕|回饋|學生|高中|學習|教學|寫作|修訂|第二語言|peer feedback|student|learning|writing|revision|second language/i.test(topic)
  ) {
    return "education";
  }
  if (includesAny(topic, TOPIC_TERMS.literature_language)) return "literature_language";
  if (includesAny(topic, TOPIC_TERMS.society_policy)) return "society_policy";
  if (includesAny(topic, TOPIC_TERMS.education)) return "education";
  if (includesAny(topic, TOPIC_TERMS.psychology)) return "psychology";
  if (includesAny(topic, TOPIC_TERMS.economics)) return "economics";
  if (includesAny(topic, TOPIC_TERMS.public_health_drug)) return "public_health_drug";
  if (includesAny(topic, TOPIC_TERMS.technology_ai)) return "technology_ai";
  if (includesAny(topic, TOPIC_TERMS.computer_science)) return "computer_science";
  if (includesAny(topic, TOPIC_TERMS.robotics)) return "robotics";
  if (includesAny(topic, TOPIC_TERMS.energy)) return "energy";
  if (includesAny(topic, TOPIC_TERMS.engineering)) return "engineering";
  if (includesAny(topic, TOPIC_TERMS.applied_technology)) return "applied_technology";
  if (includesAny(topic, TOPIC_TERMS.material_object)) return "material_object";
  return "general_ambiguous";
}

export function validateTopicForWorkflow(
  rawTopic: string,
  options: TopicWorkflowOptions = {},
): TopicValidationResult {
  const raw = String(rawTopic ?? "");
  const normalizedTopic = compactWhitespace(raw);
  const language = detectLanguage(normalizedTopic);

  if (!normalizedTopic) {
    return {
      status: "idle",
      reason: "empty",
      rawTopic: raw,
      normalizedTopic,
      language,
      topicType: "general_ambiguous",
      safetyScope: "normal",
      userMessageZh: "等待主題。",
    };
  }

  if (normalizedTopic.length > 280) {
    return invalidResult(raw, normalizedTopic, language, "too_long", "輸入內容太長，請縮短成一句研究主題。");
  }

  if (looksLikePromptInjection(normalizedTopic)) {
    return invalidResult(raw, normalizedTopic, language, "prompt_injection", "這段輸入像是系統指令或攻擊要求，請改成研究主題。");
  }

  if (looksLikeGibberish(normalizedTopic)) {
    return invalidResult(raw, normalizedTopic, language, "gibberish", "查無可辨識研究主題，請改用具體且有語意的關鍵詞。");
  }

  if (looksLikeGenericReportRequest(normalizedTopic)) {
    return invalidResult(raw, normalizedTopic, language, "missing_research_subject", "請補充明確研究對象，例如人物、地點、現象、器物或科學概念。");
  }

  const detectedTopicType = detectTopicType(normalizedTopic);
  const topicType =
    detectedTopicType === "general_ambiguous" && options.domainHint
      ? topicTypeForDomainHint(options.domainHint)
      : detectedTopicType;
  const sensitive = topicType === "illegal_drug_research_safe" || topicType === "sensitive_research_only";
  const operational = sensitive && includesAny(normalizedTopic, OPERATIONAL_TERMS);
  if (sensitive) {
    return {
      status: "sensitive_research_only",
      reason: operational ? "sensitive_operational_reframed" : "sensitive_researchable",
      rawTopic: raw,
      normalizedTopic,
      language,
      topicType,
      safetyScope: operational ? "blocked_operational" : "sensitive_research_only",
      userMessageZh: "此主題將限制於公共安全、歷史、政策、健康風險或學術分析角度。",
    };
  }

  const broad = BROAD_TOPICS.some((topic) => topic.toLowerCase() === normalizedTopic.toLowerCase());
  const shortHanNoun = countHan(normalizedTopic) > 0 && countHan(normalizedTopic) <= 3;
  const domainBackedShortTopic =
    Boolean(options.domainHint) &&
    isRecognizableShortSubject(normalizedTopic) &&
    !broad;
  if (domainBackedShortTopic || hasResearchableSubjectAndAngle(normalizedTopic)) {
    return {
      status: "ready",
      reason: domainBackedShortTopic ? "short_but_searchable_with_domain" : "subject_with_research_angle",
      rawTopic: raw,
      normalizedTopic,
      language,
      topicType,
      safetyScope: "normal",
      userMessageZh: options.domainHint
        ? `已根據${researchDomainLabel(options.domainHint)}領域自動縮窄研究方向，可直接搜尋，也可手動調整。`
        : "主題已包含研究對象與研究角度。",
    };
  }

  if (shortHanNoun || broad) {
    return {
      status: "needs_disambiguation",
      reason: shortHanNoun ? "short_valid_topic" : "broad_topic",
      rawTopic: raw,
      normalizedTopic,
      language,
      topicType,
      safetyScope: "normal",
      userMessageZh: "需要先選擇研究方向。",
    };
  }

  if (isSpecificResearchTopic(normalizedTopic)) {
    return {
      status: "ready",
      reason: "specific_research_topic",
      rawTopic: raw,
      normalizedTopic,
      language,
      topicType,
      safetyScope: "normal",
      userMessageZh: "主題已設定。",
    };
  }

  return {
    status: "needs_disambiguation",
    reason: "researchable_but_broad",
    rawTopic: raw,
    normalizedTopic,
    language,
    topicType,
    safetyScope: "normal",
    userMessageZh: "這個主題仍偏廣，請先選擇研究方向。",
  };
}

function invalidResult(
  rawTopic: string,
  normalizedTopic: string,
  language: TopicLanguage,
  reason: string,
  userMessageZh: string,
): TopicValidationResult {
  return {
    status: "invalid",
    reason,
    rawTopic,
    normalizedTopic,
    language,
    topicType: "general_ambiguous",
    safetyScope: "normal",
    userMessageZh,
  };
}

function cleanTitle(value: string): string {
  return compactWhitespace(value)
    .replace(/\bunknown\b/gi, "")
    .replace(/definition_overview|practical_application/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRepeatedLongFragment(value: string): boolean {
  const chars = Array.from(value);
  for (let size = 4; size <= 10; size += 1) {
    const seen = new Map<string, number>();
    for (let index = 0; index <= chars.length - size; index += 1) {
      const fragment = chars.slice(index, index + size).join("");
      if (!/[\u4e00-\u9fff]/u.test(fragment)) continue;
      const count = (seen.get(fragment) ?? 0) + 1;
      if (count > 2) return true;
      seen.set(fragment, count);
    }
  }
  return false;
}

function isPollutedText(value: string): boolean {
  if (hasRepeatedLongFragment(value)) return true;
  const hitCount = POLLUTION_TERMS.reduce(
    (count, term) => count + (value.match(new RegExp(term, "g"))?.length ?? 0),
    0,
  );
  return value.length > 80 && hitCount >= 4;
}

function normalizeForDedupe(value: string): string {
  return cleanTitle(value).replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "").toLowerCase();
}

function titlesTooSimilar(a: string, b: string): boolean {
  const left = normalizeForDedupe(a);
  const right = normalizeForDedupe(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  return shorter.length >= 8 && longer.includes(shorter) && shorter.length / longer.length > 0.72;
}

function topicEnglishKeywords(topic: string, type: TopicType): string[] {
  const matchedHints = uniqueStrings([
    ...(TOPIC_ENGLISH_HINTS[topic] ?? []),
    ...Object.entries(TOPIC_ENGLISH_HINTS)
      .filter(([key]) => topic.includes(key))
      .flatMap(([, terms]) => terms),
  ]);
  const typeHints = (() => {
  switch (type) {
    case "wildlife_conservation":
      return ["wildlife conservation", "habitat change", "population monitoring"];
    case "domestic_livestock":
      return ["livestock production", "animal disease control", "animal welfare"];
    case "plant_horticulture":
      return ["horticulture", "cultivation conditions", "plant breeding"];
    case "paleontology":
      return ["paleontology", "fossil record", "stratigraphy", "dinosaur evolution"];
    case "biology_ecology":
      return ["biology", "ecology", "ecosystem"];
    case "medicine_endocrinology":
      return ["endocrinology", "hormone regulation", "clinical diagnosis"];
    case "medicine_public_health":
    case "public_health_drug":
      return ["public health", "clinical use", "health policy"];
    case "illegal_drug_research_safe":
    case "sensitive_research_only":
      return ["public health harms", "policy regulation", "harm reduction"];
    case "material_object":
      return ["material culture", "craft technique", "conservation"];
    case "chemical_substance":
    case "chemistry":
      return ["chemical properties", "environmental impact", "safety risk"];
    case "physics":
      return ["surface tension", "concentration", "bubble stability"];
    case "mathematics":
      return ["mathematical model", "statistical analysis", "problem solving"];
    case "earth_science":
      return ["earth science", "environmental observation", "geoscience"];
    case "general_science":
      return ["scientific method", "experimental design", "variables"];
    case "geography_environment":
      return ["environmental governance", "ecosystem", "monitoring data"];
    case "education":
      return ["education", "student learning", "instructional intervention", "learning outcome"];
    case "psychology":
      return ["psychology", "cognitive performance", "working memory", "attention"];
    case "history_culture":
    case "literature_language":
      return ["cultural history", "textual analysis", "meaning transmission"];
    case "society_policy":
    case "economics":
      return ["social science", "policy analysis", "institutional context"];
    case "technology_ai":
      return ["technical principle", "data governance", "social impact"];
    case "engineering":
      return ["engineering performance", "process variables", "measurement method"];
    case "computer_science":
    case "robotics":
      return ["technical principle", "system design", "performance evaluation"];
    case "energy":
      return ["photovoltaic performance", "energy efficiency", "material properties"];
    case "applied_technology":
      return ["application performance", "process factors", "removal efficiency"];
    case "general_ambiguous":
    default:
      return ["research scope", "historical background", "research methods"];
  }
  })();
  return uniqueStrings([...matchedHints, ...typeHints]);
}

function makeDirection(
  validation: TopicValidationResult,
  index: number,
  input: DirectionSpec,
  topicRunId = `topic-${hashText(validation.normalizedTopic)}`,
): ResearchDirection {
  const displayTitleZh = cleanTitle(input.title);
  const question = cleanTitle(input.question);
  const fallbackQuestion = `${validation.normalizedTopic}的${INTENT_LABEL_ZH[input.intentTag]}`;
  const researchQuestionZh = isPollutedText(question) ? fallbackQuestion : question;
  const searchQueryZh = cleanTitle(input.zhQuery ?? `${researchQuestionZh} ${validation.normalizedTopic}`);
  const englishKeywords = uniqueStrings([...topicEnglishKeywords(validation.normalizedTopic, validation.topicType), ...input.englishKeywords]).slice(0, 8);
  const bilingualQueries = uniqueStrings([
    searchQueryZh,
    input.englishQuery,
    researchQuestionZh,
    ...englishKeywords,
  ]).slice(0, 8);

  return Object.freeze({
    id: `${validation.topicType}-${index + 1}-${hashText(displayTitleZh)}`,
    topicRunId,
    rawTopic: validation.rawTopic,
    displayTitleZh: isPollutedText(displayTitleZh) ? fallbackQuestion.slice(0, 24) : displayTitleZh,
    researchQuestionZh,
    polishedTitleZh: researchQuestionZh,
    descriptionZh: cleanTitle(input.description),
    expandedScopeZh: cleanTitle(input.description),
    intentTag: input.intentTag,
    intentTagZh: INTENT_LABEL_ZH[input.intentTag],
    topicType: validation.topicType,
    safetyScope: validation.safetyScope,
    searchQueryZh,
    englishKeywords,
    bilingualQueries,
    isSafeForSearch:
      validation.safetyScope === "normal" ||
      (validation.safetyScope !== "blocked_operational" &&
        !BLOCKED_OPERATIONAL_PATTERN.test(`${displayTitleZh} ${researchQuestionZh}`)),
    createdFrom: "rule_fallback" as const,
  });
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => cleanTitle(value)).filter(Boolean)));
}

function hashText(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash.toString(36);
}

function spec(
  title: string,
  question: string,
  description: string,
  intentTag: ResearchIntentTag,
  englishKeywords: string[],
  englishQuery: string,
  zhQuery?: string,
): DirectionSpec {
  return { title, question, description, intentTag, englishKeywords, englishQuery, zhQuery };
}

type DirectionPattern = {
  title: string;
  question: (topic: string) => string;
  description: (topic: string) => string;
  intentTag: ResearchIntentTag;
  zhTerms: string[];
  englishKeywords: string[];
};

const TITLE_PATTERN_BANK: Partial<Record<TopicType, DirectionPattern[]>> = {
  wildlife_conservation: [
    pattern("棲地變遷", (topic) => `${topic}棲地破碎化對族群分布與保育廊道規劃的影響`, (topic) => `可結合${topic}出沒紀錄、土地利用變遷、道路密度與保護區資料，分析族群分布與棲地破碎化之間的關聯。`, "environmental_impact", ["棲地破碎化", "族群分布", "保育廊道"], ["habitat fragmentation", "population distribution", "conservation corridor"]),
    pattern("分布熱點", (topic) => `${topic}出沒紀錄熱點與人為活動干擾之空間分布分析`, (topic) => `以公民科學紀錄、保育調查與地理資訊資料比對${topic}熱點，評估觀測密度、土地開發與干擾來源。`, "research_methods", ["出沒紀錄", "分布熱點", "人為干擾"], ["distribution hotspot", "occurrence records", "human disturbance"]),
    pattern("路殺風險", (topic) => `${topic}路殺風險、道路密度與保育策略之關聯研究`, (topic) => `可比較道路密度、通報紀錄、季節變化與棲地切割資料，找出${topic}高風險路段與緩解設施優先順序。`, "environmental_impact", ["路殺風險", "道路密度", "保育策略"], ["roadkill risk", "road density", "mitigation strategy"]),
    pattern("保育政策", (topic) => `${topic}保育政策、棲地管理與地方治理成效之比較`, (topic) => `整理法規、保育計畫、地方參與與執行成效資料，討論${topic}保育在政策目標與現場治理間的落差。`, "policy_analysis", ["保育政策", "棲地管理", "地方治理"], ["conservation policy", "habitat management", "local governance"]),
    pattern("族群監測", (topic) => `${topic}族群監測方法、資料品質與估算不確定性之研究`, (topic) => `從相機陷阱、目擊通報、遺傳監測與樣區調查切入，評估${topic}族群趨勢資料的代表性與限制。`, "research_methods", ["族群監測", "資料品質", "估算不確定性"], ["population monitoring", "camera trap", "data uncertainty"]),
    pattern("生態廊道", (topic) => `${topic}生態廊道選址對棲地連通性與族群交流的影響`, (topic) => `運用保護區邊界、土地覆蓋、道路穿越設施與熱點紀錄，分析${topic}廊道規劃對棲地連通性的改善效果。`, "environmental_impact", ["生態廊道", "棲地連通性", "族群交流"], ["ecological corridor", "habitat connectivity", "gene flow"]),
    pattern("紀錄偏差", (topic) => `開放資料在${topic}族群監測與保育決策中的應用限制`, (topic) => `檢視開放資料平台、通報熱區、採樣努力與缺漏區域，說明${topic}資料偏差如何影響保育判斷。`, "research_methods", ["開放資料", "紀錄偏差", "保育決策"], ["open data bias", "sampling effort", "conservation decision"]),
  ],
  domestic_livestock: [
    pattern("畜牧生產", (topic) => `現代${topic}畜牧生產中疫病防治與動物福利的平衡`, (topic) => `可比較養殖規模、飼養密度、疫病監測與福利標章資料，討論${topic}產業效率與照護品質如何達成平衡。`, "industry_supply_chain", ["畜牧生產", "疫病防治", "動物福利"], ["livestock production", "disease prevention", "animal welfare"]),
    pattern("疫病防治", (topic) => `${topic}疫病監測、生物安全措施與產業穩定之關聯分析`, (topic) => `從畜牧場管理、疫苗接種、疾病通報與檢疫制度切入，分析疫病風險如何影響${topic}產業穩定與食品供應。`, "public_health", ["疫病監測", "生物安全", "產業穩定"], ["disease surveillance", "biosecurity", "livestock industry"]),
    pattern("動物福利", (topic) => `${topic}飼養環境、行為需求與動物福利評估指標之研究`, (topic) => `整理飼養空間、環境控制、行為表現與福利規範資料，評估${topic}管理模式對健康與生產表現的影響。`, "ethics_welfare", ["飼養環境", "行為需求", "動物福利"], ["housing condition", "behavior needs", "welfare indicators"]),
    pattern("飼料營養", (topic) => `${topic}飼料營養、健康指標與生產效率之關聯分析`, (topic) => `可比較蛋白質來源、飼料成本、營養轉換率與疾病紀錄，說明${topic}營養管理對產量與健康的研究價值。`, "mechanism", ["飼料營養", "健康指標", "生產效率"], ["feed nutrition", "health indicators", "production efficiency"]),
    pattern("供應鏈", (topic) => `${topic}產業供應鏈、價格波動與消費需求之研究`, (topic) => `結合產銷統計、飼料價格、冷鏈物流與消費市場資料，分析${topic}供應鏈韌性與價格波動因素。`, "industry_supply_chain", ["供應鏈", "價格波動", "消費需求"], ["supply chain", "price volatility", "consumer demand"]),
    pattern("環境負荷", (topic) => `${topic}養殖廢棄物對環境負荷與管理政策的影響`, (topic) => `以廢水、臭味、溫室氣體與土壤水體監測資料評估${topic}養殖環境衝擊，並比較治理技術與政策工具。`, "environmental_impact", ["養殖廢棄物", "環境負荷", "管理政策"], ["livestock waste", "environmental burden", "management policy"]),
    pattern("人畜共病", (topic) => `${topic}人畜共通疾病風險、監測系統與公共衛生治理`, (topic) => `可整理跨物種傳播案例、農場監測、通報制度與防疫資源，討論${topic}相關風險對公共衛生的影響。`, "public_health", ["人畜共病", "監測系統", "公共衛生"], ["zoonotic disease", "surveillance system", "public health"]),
  ],
  plant_horticulture: [
    pattern("栽培條件", (topic) => `${topic}栽培條件對生長表現、花期與品質的影響`, (topic) => `可比較光照、溫度、土壤、水分與病蟲害管理對${topic}生長、花期和觀賞或產量品質的影響。`, "mechanism", ["栽培條件", "生長表現", "花期品質"], ["cultivation conditions", "growth performance", "flowering quality"]),
    pattern("品種改良", (topic) => `${topic}品種改良在觀賞價值與抗病性提升上的應用`, (topic) => `從育種目標、性狀紀錄、抗病性測試與市場偏好資料，分析${topic}品種改良如何改變品質與產業價值。`, "research_methods", ["品種改良", "觀賞價值", "抗病性"], ["plant breeding", "ornamental value", "disease resistance"]),
    pattern("病蟲害", (topic) => `${topic}主要病蟲害風險與整合防治策略之研究`, (topic) => `整理病原、害蟲發生紀錄、氣候條件與防治措施，評估${topic}病蟲害管理對產量與品質的影響。`, "environmental_impact", ["病蟲害", "整合防治", "品質影響"], ["plant disease", "pest management", "integrated control"]),
    pattern("氣候適應", (topic) => `氣候變遷下${topic}栽培管理與病蟲害風險之研究`, (topic) => `可使用高溫、乾旱、極端降雨與產量波動資料，分析${topic}栽培系統面對氣候壓力的調適策略。`, "environmental_impact", ["氣候變遷", "栽培管理", "病蟲害風險"], ["climate adaptation", "cultivation management", "pest risk"]),
    pattern("經濟價值", (topic) => `${topic}產業鏈、品牌化與地方經濟價值之分析`, (topic) => `結合產地分布、通路價格、加工利用與消費需求資料，討論${topic}在園藝產業與地方經濟中的角色。`, "industry_supply_chain", ["產業鏈", "品牌化", "地方經濟"], ["supply chain", "branding", "local economy"]),
    pattern("文化象徵", (topic) => `${topic}在文化象徵、園藝產業與地方生活中的角色`, (topic) => `透過文學圖像、節慶禮俗、景觀設計與消費資料，比較${topic}的象徵意義及其當代轉化。`, "culture_history", ["文化象徵", "園藝產業", "地方生活"], ["cultural symbolism", "horticulture industry", "local culture"]),
    pattern("生態功能", (topic) => `${topic}在授粉網絡、生物多樣性與景觀生態中的功能`, (topic) => `可查授粉者紀錄、棲地配置、景觀植栽與生物多樣性資料，評估${topic}的生態服務與管理價值。`, "environmental_impact", ["授粉網絡", "生物多樣性", "景觀生態"], ["pollination network", "biodiversity", "landscape ecology"]),
  ],
  paleontology: [
    pattern("藻類關聯", (topic) => `${topic}在古環境與藻類或微化石證據中的關聯`, (topic) => `可整理藻類、藍綠菌、微化石或生物標誌與沉積環境資料，分析${topic}如何協助判讀古環境與化石保存條件。`, "background_context", ["藻類關聯", "微化石", "古環境"], ["algae", "algal fossils", "cyanobacteria", "microfossil", "paleoenvironment"]),
    pattern("形成保存", (topic) => `${topic}形成條件與保存環境對古生態重建的影響`, (topic) => `可整理沉積環境、埋藏條件、礦化作用與保存狀態資料，分析${topic}如何支持或限制古生態重建。`, "mechanism", ["化石形成", "保存條件", "古生態重建"], ["fossil formation", "fossil preservation", "paleoecology"]),
    pattern("地層年代", (topic) => `${topic}地層年代、分布紀錄與演化研究之關聯`, (topic) => `結合地層對比、年代判定、發現地紀錄與分類資料，討論${topic}在恐龍演化研究中的證據價值。`, "research_methods", ["地層年代", "分布紀錄", "演化研究"], ["stratigraphy", "geological age", "dinosaur evolution"]),
    pattern("演化分類", (topic) => `${topic}在恐龍演化、分類研究與親緣關係判讀中的角色`, (topic) => `可比較骨骼形態、分類特徵、系統發生研究與化石紀錄缺口，評估${topic}對恐龍分類的貢獻。`, "comparative_analysis", ["恐龍演化", "分類研究", "親緣關係"], ["dinosaur evolution", "taxonomy", "phylogeny"]),
    pattern("發現分布", (topic) => `${topic}發現地、分布紀錄與古環境重建之研究`, (topic) => `整理化石產地、地理分布、沉積相與伴生生物資料，分析${topic}發現紀錄如何反映古環境條件。`, "background_context", ["發現地", "分布紀錄", "古環境"], ["fossil locality", "distribution record", "paleoenvironment"]),
    pattern("展示教育", (topic) => `${topic}在博物館展示、科學教育與大眾理解中的角色`, (topic) => `可比較展示敘事、標本複製、教育活動與觀眾理解資料，討論${topic}如何連結科學知識與公共教育。`, "technology_application", ["博物館展示", "科學教育", "大眾理解"], ["museum exhibition", "science education", "public understanding"]),
    pattern("證據限制", (topic) => `${topic}證據在古生態研究中的限制與不確定性`, (topic) => `檢視保存偏差、採集偏差、地層缺口與解釋模型，說明${topic}作為古生態證據時需要注意的限制。`, "research_methods", ["保存偏差", "採集偏差", "研究限制"], ["preservation bias", "sampling bias", "research limitation"]),
    pattern("採集倫理", (topic) => `${topic}採集倫理、標本保存與保護規範之研究`, (topic) => `從採集法規、產地保護、標本典藏與非法交易案例切入，評估${topic}研究與展示所需的倫理規範。`, "ethics_welfare", ["採集倫理", "標本保存", "保護規範"], ["collection ethics", "specimen conservation", "heritage protection"]),
  ],
  medicine_endocrinology: [
    pattern("生理作用", (topic) => `${topic}在人體發育、代謝調節與臨床診斷中的角色`, (topic) => `可從內分泌調節、兒童發育、代謝變化與臨床檢驗資料切入，分析${topic}異常對健康的影響。`, "mechanism", ["生理作用", "代謝調節", "臨床診斷"], ["physiological role", "metabolic regulation", "clinical diagnosis"]),
    pattern("內分泌調節", (topic) => `${topic}分泌節律、回饋調控與內分泌軸線之研究`, (topic) => `整理分泌節律、回饋機制、相關腺體與生理指標，說明${topic}在內分泌系統中的調節功能。`, "mechanism", ["內分泌調節", "分泌節律", "回饋調控"], ["endocrine regulation", "feedback loop", "secretion rhythm"]),
    pattern("臨床診斷", (topic) => `${topic}分泌異常對生長發育與健康風險的影響`, (topic) => `可比較檢驗數值、症狀表現、診斷流程與追蹤資料，評估${topic}異常與發育代謝風險的關聯。`, "clinical_use", ["分泌異常", "生長發育", "健康風險"], ["abnormal secretion", "development", "health risk"]),
    pattern("治療用途", (topic) => `${topic}治療應用、療效監測與臨床使用限制之分析`, (topic) => `從適應症、治療目標、療效追蹤與副作用監測資料，討論${topic}在臨床治療中的效益與限制。`, "clinical_use", ["治療應用", "療效監測", "使用限制"], ["therapeutic application", "efficacy monitoring", "clinical limitation"]),
    pattern("濫用風險", (topic) => `${topic}治療應用、濫用風險與醫療倫理議題分析`, (topic) => `檢視非醫療濫用、運動禁藥、長期健康後果與管制資料，分析${topic}相關醫療倫理與風險溝通。`, "health_risk", ["濫用風險", "醫療倫理", "健康後果"], ["misuse risk", "medical ethics", "health consequences"]),
    pattern("發育代謝", (topic) => `${topic}對兒童發育、骨骼成熟與能量代謝的影響`, (topic) => `可結合成長曲線、骨齡、血糖代謝與臨床追蹤資料，探討${topic}對發育與代謝指標的影響。`, "mechanism", ["兒童發育", "骨骼成熟", "能量代謝"], ["child development", "bone maturation", "energy metabolism"]),
    pattern("醫療倫理", (topic) => `${topic}臨床決策、公平近用與兒少醫療倫理之研究`, (topic) => `透過治療適應症、醫療資源、家庭決策與倫理指引資料，評估${topic}使用上的公平性與治理需求。`, "ethics_welfare", ["臨床決策", "公平近用", "醫療倫理"], ["clinical decision", "treatment access", "medical ethics"]),
  ],
  medicine_public_health: [
    pattern("作用機制", (topic) => `${topic}作用機制與臨床使用限制之研究`, (topic) => `可整理藥理作用、治療目標、療效指標與禁忌資料，說明${topic}在臨床使用上的適用範圍與限制。`, "mechanism", ["作用機制", "臨床使用", "使用限制"], ["mechanism of action", "clinical use", "treatment limitation"]),
    pattern("臨床使用", (topic) => `${topic}臨床指引、處方管理與照護情境之分析`, (topic) => `從適應症、療程設計、醫囑遵從與照護場域資料，評估${topic}臨床使用模式及其管理挑戰。`, "clinical_use", ["臨床指引", "處方管理", "照護情境"], ["clinical guideline", "prescription management", "care setting"]),
    pattern("抗藥副作用", (topic) => `${topic}濫用、抗藥性風險與公共衛生治理策略`, (topic) => `結合抗藥性監測、不良反應通報、風險族群與用藥規範資料，討論${topic}對公共衛生治理的挑戰。`, "health_risk", ["抗藥性風險", "副作用", "公共衛生治理"], ["antimicrobial resistance", "adverse effects", "public health governance"]),
    pattern("公共衛生", (topic) => `${topic}在疾病預防、族群健康與公共衛生策略中的角色`, (topic) => `可使用流行病學、社區介入、健康不平等與政策成效資料，分析${topic}對族群健康的影響。`, "public_health", ["疾病預防", "族群健康", "公共衛生策略"], ["disease prevention", "population health", "public health strategy"]),
    pattern("管制政策", (topic) => `${topic}使用規範、醫療資源分配與政策管理之分析`, (topic) => `比較法規、處方管制、保險給付與國際政策資料，討論${topic}管理制度如何影響安全與可近性。`, "policy_analysis", ["使用規範", "醫療資源", "政策管理"], ["regulatory policy", "healthcare resource", "stewardship"]),
    pattern("醫療資源", (topic) => `${topic}可近性、成本效益與健康公平之研究`, (topic) => `以醫療資源分布、城鄉差距、費用負擔與療效資料，評估${topic}近用差異對健康公平的影響。`, "policy_analysis", ["可近性", "成本效益", "健康公平"], ["healthcare access", "cost effectiveness", "health equity"]),
    pattern("環境殘留", (topic) => `${topic}環境殘留對生態系與健康風險的潛在影響`, (topic) => `可查水體監測、廢棄藥品、污水處理與生態毒性資料，分析${topic}殘留污染的風險與治理方法。`, "environmental_impact", ["環境殘留", "生態系", "健康風險"], ["environmental residues", "ecological risk", "water monitoring"]),
  ],
  illegal_drug_research_safe: [
    pattern("成癮機制", (topic) => `${topic}成癮機制與神經生物學影響之研究`, (topic) => `聚焦成癮形成、腦部獎賞系統、精神健康與醫療風險資料，僅從公共衛生與學術角度分析${topic}危害。`, "mechanism", ["成癮機制", "神經生物學", "公共衛生"], ["addiction mechanism", "neurobiology", "public health"]),
    pattern("公共危害", (topic) => `${topic}濫用造成的公共衛生危害與社會支持需求`, (topic) => `可整理死亡率、急診負擔、感染風險與族群差異資料，評估${topic}相關公共危害與服務需求。`, "public_health", ["公共衛生危害", "社會支持", "族群差異"], ["public health harms", "social support", "epidemiology"]),
    pattern("管制政策", (topic) => `${topic}管制政策、戒治服務與減害策略之比較`, (topic) => `比較法規演變、司法處遇、戒治服務與社區介入資料，分析${topic}政策工具的健康與社會效果。`, "policy_analysis", ["管制政策", "戒治服務", "減害策略"], ["drug policy", "treatment service", "harm reduction"]),
    pattern("戒治服務", (topic) => `${topic}戒治服務可近性、復發風險與照護缺口之研究`, (topic) => `從治療資源、轉介流程、復發率與社會支持資料，討論${topic}相關戒治服務的可近性與成效。`, "public_health", ["戒治服務", "復發風險", "照護缺口"], ["treatment access", "relapse risk", "care gap"]),
    pattern("減害政策", (topic) => `${topic}減害政策、風險溝通與健康結果改善之分析`, (topic) => `可參考國際減害政策、社區健康指標與服務利用資料，評估${topic}相關策略對健康風險降低的效果。`, "policy_analysis", ["減害政策", "風險溝通", "健康結果"], ["harm reduction", "risk communication", "health outcomes"]),
    pattern("社會支持", (topic) => `${topic}相關社會支持系統與復歸困境之研究`, (topic) => `整理家庭支持、社福資源、就業復歸與社區網絡資料，分析${topic}相關污名如何影響求助與復原。`, "ethics_welfare", ["社會支持", "復歸困境", "求助障礙"], ["social support", "recovery community", "help seeking"]),
    pattern("污名犯罪", (topic) => `${topic}相關污名、犯罪議題與社會支持系統分析`, (topic) => `檢視媒體再現、司法資料、社會污名與服務使用紀錄，討論${topic}犯罪化框架對公共衛生介入的影響。`, "policy_analysis", ["污名", "犯罪議題", "社會支持"], ["stigma", "criminalization", "social support"]),
  ],
  sensitive_research_only: [],
  material_object: [
    pattern("材料特性", (topic) => `${topic}材料特性、製作工藝與文化意義之研究`, (topic) => `可結合材質成分、製作痕跡、年代背景與博物館典藏資料，分析${topic}的物質特徵及其文化價值。`, "mechanism", ["材料特性", "製作工藝", "文化意義"], ["material properties", "craft technique", "cultural meaning"]),
    pattern("製造工藝", (topic) => `${topic}製作工藝、技術傳承與時代變遷之分析`, (topic) => `整理工序、工具、匠師技術、產地與年代資料，討論${topic}工藝演變如何反映社會需求與技術限制。`, "background_context", ["製作工藝", "技術傳承", "時代變遷"], ["craft technique", "technical transmission", "historical change"]),
    pattern("設計差異", (topic) => `${topic}造型設計、使用場景與審美價值的演變`, (topic) => `可比較造型、紋飾、尺寸、功能與地域風格資料，分析${topic}設計差異背後的使用情境與審美變化。`, "comparative_analysis", ["造型設計", "使用場景", "審美價值"], ["design variation", "use context", "aesthetic value"]),
    pattern("歷史脈絡", (topic) => `${topic}在歷史脈絡、社會階層與象徵系統中的角色`, (topic) => `透過文獻、出土資料、流通路徑與使用者身分，探討${topic}在不同時代與社會階層中的意義。`, "culture_history", ["歷史脈絡", "社會階層", "象徵系統"], ["historical context", "social status", "symbolic system"]),
    pattern("文化意義", (topic) => `${topic}文化意義、禮俗功能與地方認同之研究`, (topic) => `可分析信仰、禮俗、身份象徵、家族記憶與地方文化資料，說明${topic}如何承載社會意義。`, "culture_history", ["文化意義", "禮俗功能", "地方認同"], ["cultural meaning", "ritual function", "local identity"]),
    pattern("保存修復", (topic) => `${topic}保存修復方法與材料劣化風險之分析`, (topic) => `結合劣化診斷、修復材料、環境控制與展示條件資料，評估${topic}保存策略的風險與倫理限制。`, "research_methods", ["保存修復", "材料劣化", "展示條件"], ["conservation restoration", "material deterioration", "museum display"]),
    pattern("使用場景", (topic) => `${topic}從日常使用、儀式實踐到收藏展示的功能轉變`, (topic) => `比較日常、儀式、商業與收藏脈絡中的紀錄，分析${topic}使用場景變化與社會生活之間的關係。`, "background_context", ["使用場景", "儀式實踐", "收藏展示"], ["use context", "ritual practice", "collecting display"]),
  ],
  chemical_substance: [
    pattern("化學性質", (topic) => `${topic}化學性質、反應機制與工業應用之研究`, (topic) => `可查分子結構、溶解度、反應條件、穩定性與製程用途資料，建立${topic}從性質到應用的研究範圍。`, "mechanism", ["化學性質", "反應機制", "工業應用"], ["chemical properties", "reaction mechanism", "industrial application"]),
    pattern("反應機制", (topic) => `${topic}反應路徑、催化條件與副反應風險之分析`, (topic) => `整理反應路徑、催化劑、溫度濃度與副產物資料，評估${topic}反應機制在實驗與產業中的限制。`, "mechanism", ["反應路徑", "催化條件", "副反應"], ["reaction pathway", "catalysis condition", "side reaction"]),
    pattern("工業應用", (topic) => `${topic}在產業製程、供應鏈與安全管理中的角色`, (topic) => `結合製程用途、市場需求、替代品、儲運規範與事故案例，分析${topic}工業應用的效益與風險。`, "industry_supply_chain", ["工業應用", "產業製程", "安全管理"], ["industrial application", "production process", "safety management"]),
    pattern("環境影響", (topic) => `${topic}排放途徑、環境影響與污染治理策略之研究`, (topic) => `可使用空氣、水體、土壤監測與生態毒性資料，評估${topic}排放對環境系統與治理政策的影響。`, "environmental_impact", ["排放途徑", "環境影響", "污染治理"], ["emission pathway", "environmental impact", "pollution control"]),
    pattern("安全風險", (topic) => `${topic}暴露風險、職業安全與事故預防管理之分析`, (topic) => `從職業暴露、儲存運輸、事故案例與安全資料表切入，討論${topic}風險評估與管理策略。`, "health_risk", ["暴露風險", "職業安全", "事故預防"], ["exposure risk", "occupational safety", "accident prevention"]),
    pattern("檢測方法", (topic) => `${topic}檢測方法、濃度監測與數據品質之研究`, (topic) => `比較採樣流程、儀器分析、檢出限、標準方法與誤差來源，評估${topic}監測資料的可靠性。`, "research_methods", ["檢測方法", "濃度監測", "數據品質"], ["detection method", "concentration monitoring", "data quality"]),
    pattern("法規管理", (topic) => `${topic}法規管理、風險分級與環境治理之分析`, (topic) => `可整理分類標示、排放標準、職安規範與國際管制資料，討論${topic}管理制度的治理效果。`, "policy_analysis", ["法規管理", "風險分級", "環境治理"], ["chemical regulation", "risk classification", "environmental governance"]),
  ],
  physics: [
    pattern("表面張力", (topic) => `${topic}中表面張力、界面作用與泡泡形成機制之研究`, (topic) => `可從液體分子作用、界面張力、清潔劑比例與薄膜形成切入，分析${topic}如何影響泡泡生成。`, "mechanism", ["表面張力", "界面作用", "泡泡形成"], ["surface tension", "interface interaction", "bubble formation"]),
    pattern("濃度變因", (topic) => `不同${topic}配比對泡泡大小、壽命與穩定性的影響`, (topic) => `以濃度、黏度、水質與攪拌方式作為變因，比較泡泡大小、破裂時間與穩定性資料。`, "research_methods", ["濃度", "泡泡穩定性", "變因控制"], ["concentration", "bubble stability", "controlled variables"]),
    pattern("穩定性比較", (topic) => `${topic}與泡泡薄膜穩定性、蒸發速度和破裂條件之關聯`, (topic) => `可觀察薄膜厚度、環境濕度、溫度與蒸發速度，說明${topic}造成泡泡穩定性差異的原因。`, "comparative_analysis", ["薄膜穩定性", "蒸發速度", "破裂條件"], ["film stability", "evaporation rate", "rupture condition"]),
    pattern("實驗設計", (topic) => `${topic}實驗中的控制變因、測量方法與數據可信度`, (topic) => `設計可重複的泡泡水實驗流程，控制容器、吹泡方式、環境條件與記錄方法，提升${topic}資料品質。`, "research_methods", ["實驗設計", "控制變因", "測量方法"], ["experimental design", "measurement method", "data reliability"]),
    pattern("材料添加", (topic) => `添加糖、甘油或清潔劑比例對${topic}泡泡穩定性的影響`, (topic) => `比較不同添加物對黏度、表面張力與水分蒸發的影響，評估泡泡壽命與形成效率。`, "mechanism", ["添加物", "黏度", "表面張力"], ["additives", "viscosity", "surface tension"]),
    pattern("生活應用", (topic) => `${topic}背後的物理概念與生活實驗教學應用`, (topic) => `將表面張力、光干涉、薄膜與變因控制轉化為可操作的生活科學活動，評估教學與觀察價值。`, "technology_application", ["物理概念", "生活實驗", "教學應用"], ["physics concept", "hands-on experiment", "science education"]),
  ],
  general_science: [
    pattern("形成機制", (topic) => `${topic}的形成機制、觀察證據與研究限制`, (topic) => `先界定${topic}的可觀察現象、形成條件與資料來源，整理目前可用證據及其解釋限制。`, "mechanism", ["形成機制", "觀察證據", "研究限制"], ["scientific mechanism", "observation evidence", "research limitation"]),
    pattern("資料方法", (topic) => `${topic}研究中的資料蒐集、測量方法與可信度評估`, (topic) => `可比較觀察紀錄、測量工具、樣本來源與誤差控制，評估${topic}研究資料的代表性與可信度。`, "research_methods", ["資料蒐集", "測量方法", "可信度"], ["data collection", "measurement method", "data reliability"]),
    pattern("分類比較", (topic) => `${topic}的主要類型、分類依據與比較分析`, (topic) => `整理${topic}的分類標準、代表案例與差異特徵，建立可比較的研究框架。`, "comparative_analysis", ["主要類型", "分類依據", "比較分析"], ["classification", "comparative analysis", "scientific evidence"]),
    pattern("環境條件", (topic) => `${topic}與環境條件、時間尺度及變化因素之關聯`, (topic) => `從環境條件、時間變化、區域差異與觀測資料切入，分析${topic}如何受到外在因素影響。`, "environmental_impact", ["環境條件", "時間尺度", "變化因素"], ["environmental condition", "time scale", "change factor"]),
    pattern("科學教育", (topic) => `${topic}在科學教育、博物館展示與大眾理解中的角色`, (topic) => `可檢視教材、展示案例、科普文本與學習成效，討論${topic}如何被轉化為可理解的科學知識。`, "technology_application", ["科學教育", "展示案例", "大眾理解"], ["science education", "museum display", "public understanding"]),
    pattern("倫理規範", (topic) => `${topic}研究中的資料倫理、保存規範與公共溝通`, (topic) => `整理研究資料保存、採集或觀測規範、公共參與與風險溝通，評估${topic}研究的治理需求。`, "ethics_welfare", ["資料倫理", "保存規範", "公共溝通"], ["research ethics", "data preservation", "public communication"]),
  ],
  geography_environment: [
    pattern("地理特徵", (topic) => `${topic}地理特徵、空間分布與土地利用變遷之研究`, (topic) => `可整合地形、土地利用、遙測影像與開放圖資，分析${topic}空間分布及其環境變遷脈絡。`, "background_context", ["地理特徵", "空間分布", "土地利用"], ["geographic features", "spatial distribution", "land use change"]),
    pattern("生態系", (topic) => `${topic}生態系服務、環境變遷與管理政策之研究`, (topic) => `從棲地類型、物種組成、生態服務與保育資料切入，評估${topic}生態價值與管理需求。`, "environmental_impact", ["生態系服務", "環境變遷", "管理政策"], ["ecosystem services", "environmental change", "management policy"]),
    pattern("人類活動", (topic) => `人類活動對${topic}景觀變化與生物多樣性的影響`, (topic) => `比較開發、觀光、交通、農業或工業活動資料，分析${topic}景觀變化與生物多樣性壓力來源。`, "comparative_analysis", ["人類活動", "景觀變化", "生物多樣性"], ["human activity", "landscape change", "biodiversity"]),
    pattern("環境變遷", (topic) => `${topic}在氣候變遷、污染壓力與調適治理中的風險`, (topic) => `運用長期監測、極端事件、污染指標與調適政策資料，討論${topic}面對環境變遷的脆弱度。`, "environmental_impact", ["氣候變遷", "污染壓力", "調適治理"], ["climate change", "pollution pressure", "adaptation governance"]),
    pattern("管理政策", (topic) => `${topic}保育、利用與地方發展之間的治理衝突`, (topic) => `可比較法規、主管機關、社區參與與土地利用資料，分析${topic}管理政策在保育與發展間的取捨。`, "policy_analysis", ["保育利用", "地方發展", "治理衝突"], ["conservation use", "local development", "governance conflict"]),
    pattern("災害風險", (topic) => `${topic}災害風險、脆弱度評估與韌性管理之研究`, (topic) => `整合淹水、熱傷害、崩塌、侵蝕或污染事件資料，評估${topic}災害風險與社區韌性。`, "health_risk", ["災害風險", "脆弱度", "韌性管理"], ["hazard risk", "vulnerability assessment", "resilience management"]),
    pattern("觀測資料", (topic) => `${topic}觀測資料在環境監測與風險評估中的應用`, (topic) => `可使用遙測、現地監測、開放資料與模型輸出，比較${topic}資料來源品質、尺度與研究限制。`, "research_methods", ["觀測資料", "環境監測", "風險評估"], ["monitoring data", "environmental monitoring", "risk assessment"]),
  ],
  history_culture: [
    pattern("歷史形成", (topic) => `${topic}的歷史形成、象徵意義與文化傳承`, (topic) => `可查文獻、地方志、口述史與制度脈絡資料，分析${topic}如何在歷史變遷中形成並延續。`, "culture_history", ["歷史形成", "象徵意義", "文化傳承"], ["historical formation", "symbolic meaning", "cultural transmission"]),
    pattern("象徵意義", (topic) => `${topic}在信仰實踐、圖像敘事與集體記憶中的象徵意義`, (topic) => `透過圖像、神話、儀式文本與社群記憶資料，討論${topic}象徵意義在不同時代的轉變。`, "culture_history", ["象徵意義", "信仰實踐", "集體記憶"], ["symbolic meaning", "religious practice", "collective memory"]),
    pattern("社會功能", (topic) => `${topic}在地方社會、信仰實踐與集體記憶中的角色`, (topic) => `整理社區活動、儀式秩序、教育傳承與公共參與資料，分析${topic}如何凝聚地方社會。`, "background_context", ["地方社會", "社會功能", "公共參與"], ["local society", "social function", "public participation"]),
    pattern("文獻詮釋", (topic) => `${topic}的文獻詮釋、地域差異與當代轉化`, (topic) => `可比較史料、研究觀點、文本版本與資料缺口，討論${topic}在不同詮釋框架下的差異。`, "literature_analysis", ["文獻詮釋", "地域差異", "當代轉化"], ["textual interpretation", "regional variation", "contemporary transformation"]),
    pattern("地域差異", (topic) => `${topic}在不同地域社群中的表現差異與傳播路徑`, (topic) => `利用地方版本、移民路徑、社群網絡與展演資料，比較${topic}地域特色及其形成原因。`, "comparative_analysis", ["地域差異", "社群網絡", "傳播路徑"], ["regional variation", "community network", "diffusion path"]),
    pattern("當代轉化", (topic) => `${topic}從傳統敘事到現代文化再詮釋的演變`, (topic) => `觀察觀光、社群媒體、影視展演與品牌化案例，分析${topic}如何被當代社會重新理解與使用。`, "technology_application", ["當代轉化", "文化再詮釋", "媒體展演"], ["contemporary adaptation", "cultural reinterpretation", "media performance"]),
    pattern("文化傳承", (topic) => `${topic}文化傳承策略、教育實踐與保存挑戰之研究`, (topic) => `結合文化資產政策、教育活動、社區參與與保存爭議資料，評估${topic}傳承工作的限制與價值。`, "policy_analysis", ["文化傳承", "教育實踐", "保存挑戰"], ["cultural heritage", "education practice", "preservation challenge"]),
  ],
  technology_ai: [
    pattern("技術原理", (topic) => `${topic}的核心技術原理、資料流程與應用場景`, (topic) => `可查演算法、系統架構、索引排序、資料處理與應用案例，建立${topic}技術運作與使用限制的研究範圍。`, "mechanism", ["技術原理", "資料流程", "應用場景"], ["technical principle", "data pipeline", "application scenario"]),
    pattern("應用場景", (topic) => `${topic}在資訊檢索、決策輔助與產業應用中的影響`, (topic) => `比較教育、醫療、商業、公共服務或日常使用案例，分析${topic}應用場景、效益與限制。`, "technology_application", ["資訊檢索", "決策輔助", "產業應用"], ["information retrieval", "decision support", "industry application"]),
    pattern("資料流程", (topic) => `${topic}資料蒐集、索引排序與隱私風險之研究`, (topic) => `從資料蒐集、清理、索引、排序、輸出與留存紀錄切入，評估${topic}資料流程的透明度與隱私風險。`, "research_methods", ["資料蒐集", "索引排序", "隱私風險"], ["data collection", "index ranking", "privacy risk"]),
    pattern("風險治理", (topic) => `${topic}風險治理、責任分工與使用者信任之研究`, (topic) => `可整理安全事件、偏誤案例、透明度設計與問責框架，討論${topic}治理制度如何影響使用者信任。`, "policy_analysis", ["風險治理", "責任分工", "使用者信任"], ["risk governance", "accountability", "user trust"]),
    pattern("效能比較", (topic) => `${topic}效能比較、排序品質與評估指標之分析`, (topic) => `結合速度、準確率、可靠性、成本、相關性與使用者評估資料，比較${topic}不同系統或方法的效能。`, "comparative_analysis", ["效能比較", "排序品質", "評估指標"], ["performance comparison", "ranking quality", "evaluation metrics"]),
    pattern("社會影響", (topic) => `${topic}發展對產業結構、勞動技能與資訊公平的影響`, (topic) => `從產業採用、職務變化、技能需求與資訊落差資料，分析${topic}對社會與勞動市場的影響。`, "industry_supply_chain", ["產業結構", "勞動技能", "資訊公平"], ["industry structure", "labor skills", "information equity"]),
    pattern("法規倫理", (topic) => `${topic}發展下的資料隱私、法規倫理與社會影響`, (topic) => `可比較監管政策、國際規範、倫理原則與使用者權益資料，討論${topic}治理與社會責任。`, "ethics_welfare", ["資料隱私", "法規倫理", "社會影響"], ["data privacy", "regulation ethics", "social impact"]),
  ],
  engineering: [
    pattern("性能變因", (topic) => `${topic}的關鍵性能變因、量測方法與工程機制`, (topic) => `可查材料、幾何、操作條件、量測指標與效率變化，分析${topic}的工程機制與限制。`, "mechanism", ["性能變因", "量測方法", "工程機制"], ["performance factors", "measurement method", "engineering mechanism"]),
    pattern("材料製程", (topic) => `${topic}的材料特性、製程條件與性能差異`, (topic) => `比較材料表面、孔隙、粗糙度、處理條件或製程參數，說明${topic}如何影響實際性能。`, "comparative_analysis", ["材料特性", "製程條件", "性能差異"], ["material properties", "process conditions", "performance difference"]),
    pattern("應用限制", (topic) => `${topic}的應用場景、可靠度與限制因素`, (topic) => `整理實驗條件、使用環境、耐久性與尺度化限制，評估${topic}能否支撐實際應用。`, "technology_application", ["應用場景", "可靠度", "限制因素"], ["application context", "reliability", "limiting factors"]),
    pattern("文獻方法", (topic) => `${topic}相關研究的實驗設計、指標與資料品質`, (topic) => `檢視研究設計、對照組、量測指標與資料完整性，判斷${topic}文獻證據的可用程度。`, "research_methods", ["實驗設計", "量測指標", "資料品質"], ["experimental design", "evaluation metrics", "data quality"]),
    pattern("效率比較", (topic) => `${topic}在不同條件下的效率比較與最佳化`, (topic) => `比較操作條件、材料配置、環境變因與效率指標，找出${topic}可能的最佳化方向。`, "comparative_analysis", ["效率比較", "不同條件", "最佳化"], ["efficiency comparison", "operating conditions", "optimization"]),
    pattern("失效風險", (topic) => `${topic}的失效模式、維護需求與安全風險`, (topic) => `分析老化、污染、疲乏、堵塞或環境壓力等因素，說明${topic}在長期使用中的風險。`, "research_methods", ["失效模式", "維護需求", "安全風險"], ["failure mode", "maintenance requirements", "safety risk"]),
  ],
  energy: [
    pattern("效率機制", (topic) => `${topic}的光電轉換效率、反射損失與材料表面機制`, (topic) => `可查光伏元件、表面紋理、反射率、光捕獲與電性輸出資料，分析${topic}如何影響發電效率。`, "mechanism", ["光電轉換效率", "反射損失", "材料表面"], ["photovoltaic efficiency", "optical reflectance", "surface texture"]),
    pattern("材料設計", (topic) => `${topic}的表面結構、抗反射設計與性能比較`, (topic) => `比較粗糙度、微結構、鍍膜或封裝材料對反射、吸收與輸出功率的影響。`, "comparative_analysis", ["表面結構", "抗反射設計", "性能比較"], ["surface roughness", "anti-reflection coating", "power output"]),
    pattern("量測方法", (topic) => `${topic}的量測指標、實驗條件與誤差來源`, (topic) => `整理反射率、入射角、照度、溫度、電流電壓曲線與效率計算方式，檢查${topic}研究結果的限制。`, "research_methods", ["量測指標", "實驗條件", "誤差來源"], ["reflectance measurement", "current voltage curve", "efficiency measurement"]),
    pattern("應用限制", (topic) => `${topic}在實際太陽能板設計與維護中的限制`, (topic) => `評估表面污染、耐久性、製程成本與戶外環境如何改變${topic}的實際效益。`, "technology_application", ["實際設計", "耐久性", "製程成本"], ["solar panel design", "durability", "outdoor performance"]),
    pattern("環境條件", (topic) => `${topic}在照度、入射角與溫度條件下的性能變化`, (topic) => `比較光照強度、入射角、溫度與表面狀態，分析${topic}在不同環境條件下的效率差異。`, "comparative_analysis", ["照度", "入射角", "溫度條件"], ["irradiance", "incident angle", "temperature effect"]),
    pattern("長期可靠度", (topic) => `${topic}的戶外老化、污染累積與長期可靠度`, (topic) => `追蹤灰塵、磨耗、清潔方式與戶外曝露時間，評估${topic}效果是否能長期維持。`, "research_methods", ["戶外老化", "污染累積", "長期可靠度"], ["outdoor aging", "soiling", "long-term reliability"]),
  ],
  psychology: [
    pattern("認知表現", (topic) => `${topic}的工作記憶、注意力與認知表現差異`, (topic) => `可查睡眠時長、實驗任務、反應時間與正確率等資料，分析${topic}對認知表現的影響。`, "mechanism", ["工作記憶", "注意力", "認知表現"], ["working memory", "attention", "cognitive performance"]),
    pattern("族群差異", (topic) => `${topic}在青少年族群中的風險因子與表現差異`, (topic) => `比較年齡、性別、課業壓力、作息與睡眠品質，評估${topic}研究結果的適用範圍。`, "comparative_analysis", ["青少年", "風險因子", "表現差異"], ["adolescents", "risk factors", "performance difference"]),
    pattern("研究方法", (topic) => `${topic}相關研究的測驗工具、樣本與限制`, (topic) => `檢視工作記憶任務、注意力測驗、睡眠紀錄與樣本設計，判斷${topic}文獻證據的強度。`, "research_methods", ["測驗工具", "樣本設計", "研究限制"], ["cognitive tasks", "sleep measurement", "study limitations"]),
    pattern("教育影響", (topic) => `${topic}對學習表現與校園介入的啟示`, (topic) => `整理課堂注意力、學習效率、作息介入與健康教育資料，說明${topic}可能帶來的教育意涵。`, "research_methods", ["學習表現", "校園介入", "健康教育"], ["academic performance", "school intervention", "sleep education"]),
    pattern("睡眠條件", (topic) => `${topic}中的睡眠時長、睡眠品質與作息條件`, (topic) => `比較短睡眠、睡眠限制、晚睡與睡眠品質指標，釐清${topic}研究中的暴露條件。`, "background_context", ["睡眠時長", "睡眠品質", "作息條件"], ["sleep duration", "sleep quality", "sleep restriction"]),
    pattern("神經認知", (topic) => `${topic}的神經認知機制與執行功能關聯`, (topic) => `整理執行功能、抑制控制、警覺度與神經認知模型，說明${topic}可能的作用路徑。`, "mechanism", ["神經認知", "執行功能", "警覺度"], ["executive function", "vigilance", "neurocognitive mechanism"]),
  ],
  education: [
    pattern("學習成效", (topic) => `${topic}對學習成效、修訂品質與表現差異的影響`, (topic) => `可查介入設計、前後測、評分規準與學生作品，分析${topic}如何影響學習成果。`, "research_methods", ["學習成效", "修訂品質", "表現差異"], ["learning outcome", "revision quality", "student performance"]),
    pattern("互動機制", (topic) => `${topic}中的互動品質、回饋類型與修訂行為`, (topic) => `整理回饋內容、同儕互動、修訂策略與寫作品質指標，說明${topic}的作用機制。`, "mechanism", ["互動品質", "回饋類型", "修訂行為"], ["peer feedback", "feedback quality", "writing revision"]),
    pattern("第二語言", (topic) => `${topic}在第二語言寫作教學中的應用與限制`, (topic) => `聚焦第二語言學習者、寫作任務、語言準確度與內容組織，評估${topic}的適用條件。`, "literature_analysis", ["第二語言", "寫作教學", "應用限制"], ["second language writing", "L2 writing", "writing instruction"]),
    pattern("研究設計", (topic) => `${topic}相關研究的實驗設計、評量工具與資料品質`, (topic) => `檢查樣本、對照組、評量規準、盲評與統計方式，判斷${topic}研究證據是否足夠。`, "research_methods", ["實驗設計", "評量工具", "資料品質"], ["experimental design", "assessment rubric", "data quality"]),
    pattern("學習者差異", (topic) => `${topic}在不同學生程度與寫作能力中的差異`, (topic) => `比較語言程度、先備寫作能力、動機與合作經驗，分析${topic}效果是否因學生特徵而不同。`, "comparative_analysis", ["學生程度", "寫作能力", "學習者差異"], ["learner proficiency", "writing ability", "student differences"]),
    pattern("教學設計", (topic) => `${topic}的教學流程、回饋訓練與教師支持`, (topic) => `整理回饋規準、同儕訓練、教師引導與修訂循環，評估${topic}在課堂中的實施條件。`, "research_methods", ["教學流程", "回饋訓練", "教師支持"], ["instructional design", "peer training", "teacher support"]),
  ],
  applied_technology: [
    pattern("效能因素", (topic) => `${topic}的效能因素、操作條件與量測指標`, (topic) => `可查材料、流量、濃度、溫濕度、接觸時間與效率指標，分析${topic}的實際效能。`, "mechanism", ["效能因素", "操作條件", "量測指標"], ["performance factors", "operating conditions", "measurement metrics"]),
    pattern("材料機制", (topic) => `${topic}的材料特性、吸附機制與限制因素`, (topic) => `整理孔隙結構、表面官能基、污染物濃度與競爭吸附資料，說明${topic}的材料機制。`, "mechanism", ["材料特性", "吸附機制", "限制因素"], ["material properties", "adsorption mechanism", "limiting factors"]),
    pattern("應用情境", (topic) => `${topic}在實際室內環境中的應用、維護與風險`, (topic) => `評估空氣流通、污染源、濾材壽命、再生方式與安全限制，判斷${topic}是否適合實際使用。`, "technology_application", ["室內環境", "維護", "安全限制"], ["indoor environment", "filter lifetime", "application limitations"]),
    pattern("文獻方法", (topic) => `${topic}相關研究的實驗設計、對照條件與資料品質`, (topic) => `檢視實驗艙、濃度控制、採樣方法與效率計算方式，判斷${topic}證據能否支持結論。`, "research_methods", ["實驗設計", "對照條件", "資料品質"], ["experimental chamber", "control conditions", "data quality"]),
    pattern("效率比較", (topic) => `${topic}在不同材料與環境條件下的效率比較`, (topic) => `比較材料種類、粒徑、流速、濕度與污染物濃度，找出${topic}效果差異的主要來源。`, "comparative_analysis", ["材料條件", "環境條件", "效率比較"], ["material comparison", "humidity effect", "removal efficiency"]),
    pattern("維護壽命", (topic) => `${topic}的濾材壽命、再生方式與性能衰退`, (topic) => `追蹤飽和、再生、污染負荷與使用時間，評估${topic}是否能長期穩定運作。`, "research_methods", ["濾材壽命", "再生方式", "性能衰退"], ["filter lifetime", "regeneration", "performance decay"]),
  ],
  general_ambiguous: [
    pattern("研究範圍", (topic) => `${topic}的概念界定、研究範圍與當代發展`, (topic) => `先釐清定義、研究邊界、關鍵概念與可查資料來源，建立${topic}後續分析的問題意識與方法選擇。`, "background_context", ["概念界定", "研究範圍", "當代發展"], ["concept definition", "research scope", "contemporary development"]),
    pattern("背景脈絡", (topic) => `${topic}的歷史背景、主要類型與社會影響`, (topic) => `可整理起源、演變、代表案例、類型分類與社會討論資料，分析${topic}形成脈絡與影響範圍。`, "culture_history", ["歷史背景", "主要類型", "社會影響"], ["historical background", "main categories", "social impact"]),
    pattern("主要類型", (topic) => `${topic}主要類型、應用脈絡與比較分析`, (topic) => `透過分類架構、案例資料、應用領域與評估指標，比較${topic}不同類型的差異與研究價值。`, "comparative_analysis", ["主要類型", "應用脈絡", "比較分析"], ["main categories", "application context", "comparative analysis"]),
    pattern("社會影響", (topic) => `${topic}在不同脈絡下的應用、爭議與限制`, (topic) => `聚焦利害關係人、公共討論、倫理疑慮與制度影響資料，分析${topic}在社會脈絡中的爭議與限制。`, "policy_analysis", ["社會影響", "爭議限制", "利害關係人"], ["social impact", "controversy limitation", "stakeholder"]),
    pattern("研究趨勢", (topic) => `${topic}相關研究趨勢、資料來源與分析方法`, (topic) => `可查近年文獻、研究熱點、資料庫、方法變化與知識缺口，評估${topic}作為研究題目的可行性。`, "research_methods", ["研究趨勢", "資料來源", "分析方法"], ["research trends", "data sources", "analysis methods"]),
    pattern("資料方法", (topic) => `${topic}可量化資料、指標設計與研究方法之分析`, (topic) => `整理統計資料、開放資料、訪談文本或案例紀錄，設計${topic}可比較的變項、指標與分析角度。`, "research_methods", ["可量化資料", "指標設計", "研究方法"], ["quantitative data", "indicator design", "research methods"]),
    pattern("爭議限制", (topic) => `${topic}公共爭議、制度限制與未來研究方向`, (topic) => `從政策文件、媒體討論、專家觀點與案例資料，分析${topic}爭議焦點、制度限制與後續研究價值。`, "policy_analysis", ["公共爭議", "制度限制", "未來研究"], ["public controversy", "institutional limitation", "future research"]),
  ],
};

TITLE_PATTERN_BANK.chemistry = TITLE_PATTERN_BANK.chemical_substance;
TITLE_PATTERN_BANK.mathematics = TITLE_PATTERN_BANK.general_ambiguous;
TITLE_PATTERN_BANK.earth_science = TITLE_PATTERN_BANK.geography_environment;
TITLE_PATTERN_BANK.literature_language = TITLE_PATTERN_BANK.history_culture;
TITLE_PATTERN_BANK.society_policy = TITLE_PATTERN_BANK.general_ambiguous;
TITLE_PATTERN_BANK.economics = TITLE_PATTERN_BANK.general_ambiguous;
TITLE_PATTERN_BANK.biology_ecology = TITLE_PATTERN_BANK.geography_environment;
TITLE_PATTERN_BANK.public_health_drug = TITLE_PATTERN_BANK.medicine_public_health;
TITLE_PATTERN_BANK.computer_science = TITLE_PATTERN_BANK.technology_ai;
TITLE_PATTERN_BANK.robotics = TITLE_PATTERN_BANK.technology_ai;
TITLE_PATTERN_BANK.sensitive_research_only = TITLE_PATTERN_BANK.illegal_drug_research_safe;

function pattern(
  title: string,
  question: (topic: string) => string,
  description: (topic: string) => string,
  intentTag: ResearchIntentTag,
  zhTerms: string[],
  englishKeywords: string[],
): DirectionPattern {
  return { title, question, description, intentTag, zhTerms, englishKeywords };
}

function isSolarSailTopic(topic: string): boolean {
  return /太陽帆|solar sail|solar sailing/i.test(topic);
}

function solarSailDirectionBank(topic: string): DirectionSpec[] {
  void topic;
  return [
    spec(
      "物理原理",
      "太陽帆如何利用太陽輻射壓進行航天推進，其在深空任務中的應用價值與限制為何？",
      "聚焦光子動量、太陽輻射壓、帆面材料與姿態控制，說明太陽帆推進如何形成可驗證的航天技術。",
      "mechanism",
      ["solar sail propulsion", "radiation pressure", "photon momentum", "spacecraft propulsion"],
      "solar sail propulsion radiation pressure",
      "太陽帆 輻射壓 推進 原理",
    ),
    spec(
      "任務應用",
      "太陽帆在航天任務、深空探測與小型太空器推進中的應用價值為何？",
      "比較 IKAROS、LightSail、NEA Scout 等任務案例，分析太陽帆在低燃料深空任務中的效益與限制。",
      "technology_application",
      ["solar sail spacecraft mission applications", "IKAROS", "LightSail", "NEA Scout"],
      "solar sail spacecraft mission applications",
      "太陽帆 航天任務 應用 價值",
    ),
    spec(
      "深空限制",
      "太陽帆用於深空探測時，在推力大小、任務時間、材料與操控上有哪些優勢與限制？",
      "從推力密度、距離太陽變化、帆面展開、材料耐久性與導航控制切入，評估深空探測可行性。",
      "comparative_analysis",
      ["solar sailing deep space exploration limitations", "sail deployment", "trajectory control"],
      "solar sailing deep space exploration limitations",
      "太陽帆 深空探測 優勢 限制",
    ),
    spec(
      "材料設計",
      "太陽帆材料的反射率、面密度與耐久性如何影響推進效率與任務可靠度？",
      "整理薄膜材料、反射率、面密度、熱環境與展開機構資料，建立材料條件與推進效率的關聯。",
      "research_methods",
      ["solar sail materials reflectivity areal density", "thin film spacecraft sail"],
      "solar sail materials reflectivity areal density",
      "太陽帆 材料 反射率 面密度 推進效率",
    ),
    spec(
      "任務比較",
      "IKAROS、LightSail 與 NEA Scout 等太陽帆任務在目標、設計與成果上有何差異？",
      "用實際任務資料比較帆面規模、控制方法、任務目標與成果，避免只停留在概念介紹。",
      "comparative_analysis",
      ["IKAROS LightSail NEA Scout solar sail", "solar sail mission comparison"],
      "IKAROS LightSail NEA Scout solar sail",
      "IKAROS LightSail NEA Scout 太陽帆 任務 比較",
    ),
    spec(
      "未來發展",
      "太陽帆推進技術未來在低成本航天、長時間巡航與深空探測中的發展限制為何？",
      "從任務成本、技術成熟度、姿態控制、發射限制與深空通信需求，討論太陽帆的未來研究價值。",
      "technology_application",
      ["solar sail future missions", "low-cost spacecraft propulsion", "deep space mission"],
      "solar sail future missions deep space spacecraft propulsion",
      "太陽帆 未來航天 深空任務 技術限制",
    ),
  ];
}

function isSeaTurtleArtificialLightTopic(topic: string): boolean {
  return (
    /海龜|綠蠵龜|幼龜|幼體|sea turtle|marine turtle|hatchling/i.test(topic) &&
    /人工夜間照明|夜間照明|光害|光污染|入海|orientation|disorientation|artificial light|light pollution|coastal lighting|beach lighting/i.test(
      topic,
    )
  );
}

function seaTurtleArtificialLightDirectionBank(topic: string): DirectionSpec[] {
  return [
    spec(
      "入海定向",
      `${topic}中的人工夜間照明如何影響海龜幼體入海定向？`,
      `聚焦海龜幼體在孵化後由沙灘移向海面的方向選擇，整理光源強度、波長、距離與錯向移動資料，判斷人工夜間照明是否改變入海行為。`,
      "environmental_impact",
      ["sea turtle hatchling orientation", "artificial light at night", "seaward orientation"],
      "sea turtle hatchling orientation artificial light at night seaward orientation",
      `${topic} 海龜幼體 入海定向 人工夜間照明`,
    ),
    spec(
      "光害機制",
      `${topic}中光害強度、波長與海龜幼體錯向行為的關聯`,
      `比較不同人造光源、月光背景、海灘地形與幼體行動路徑，說明夜間照明干擾海龜幼體定向的可能機制。`,
      "mechanism",
      ["light pollution", "hatchling disorientation", "coastal lighting"],
      "sea turtle hatchling disorientation light pollution coastal lighting",
      `${topic} 光害 波長 錯向行為`,
    ),
    spec(
      "海岸管理",
      `${topic}對海岸照明管理與保育措施的啟示`,
      `整理遮光、低波長照明、季節性管制與巢區管理案例，評估照明管制是否能降低海龜幼體迷失或死亡風險。`,
      "policy_analysis",
      ["coastal lighting management", "turtle-friendly lighting", "nesting beach conservation"],
      "sea turtle coastal lighting management turtle friendly lighting nesting beach conservation",
      `${topic} 海岸照明管理 保育措施`,
    ),
    spec(
      "研究方法",
      `${topic}相關研究的觀測設計、行為指標與資料限制`,
      `檢視實地觀測、實驗光源、追蹤路徑、入海成功率與樣本季節，判斷文獻證據是否能支持因果推論。`,
      "research_methods",
      ["field experiment", "hatchling behavior", "orientation measurement"],
      "sea turtle hatchling behavior field experiment orientation measurement",
      `${topic} 觀測設計 行為指標 入海成功率`,
    ),
    spec(
      "物種差異",
      `${topic}在不同海龜物種、海灘條件與孵化季節中的差異`,
      `比較物種、巢位、沙灘坡度、背景光與孵化時間，分析人工夜間照明影響是否會因環境條件而改變。`,
      "comparative_analysis",
      ["marine turtle species", "nesting beach", "seasonal variation"],
      "marine turtle hatchling orientation nesting beach seasonal variation artificial light",
      `${topic} 物種差異 海灘條件 季節變化`,
    ),
    spec(
      "風險評估",
      `${topic}造成幼體迷失、捕食暴露與入海成功率下降的風險`,
      `彙整迷失距離、滯留時間、捕食暴露與入海成功率資料，評估夜間照明對海龜幼體早期存活的影響程度。`,
      "environmental_impact",
      ["hatchling mortality", "predation exposure", "sea-finding success"],
      "sea turtle hatchling mortality predation exposure sea finding success artificial light",
      `${topic} 幼體迷失 捕食暴露 入海成功率`,
    ),
  ];
}

function directionBank(validation: TopicValidationResult): DirectionSpec[] {
  const topic = validation.normalizedTopic;
  if (isSolarSailTopic(topic)) {
    return solarSailDirectionBank(topic);
  }
  if (validation.topicType === "wildlife_conservation" && isSeaTurtleArtificialLightTopic(topic)) {
    return seaTurtleArtificialLightDirectionBank(topic);
  }
  const patterns = TITLE_PATTERN_BANK[validation.topicType] ?? TITLE_PATTERN_BANK.general_ambiguous ?? [];
  return patterns.map((item) =>
    spec(
      item.title,
      item.question(topic),
      item.description(topic),
      item.intentTag,
      item.englishKeywords,
      buildEnglishQuery(topic, validation.topicType, item.englishKeywords),
      buildZhQuery(topic, item.zhTerms),
    ),
  );
}

function generalAmbiguousBank(topic: string): DirectionSpec[] {
  const validation: TopicValidationResult = {
    status: "needs_disambiguation",
    reason: "fallback",
    rawTopic: topic,
    normalizedTopic: topic,
    language: detectLanguage(topic),
    topicType: "general_ambiguous",
    safetyScope: "normal",
    userMessageZh: "這個主題仍偏廣，請先選擇研究方向。",
  };
  return directionBank(validation);
}

function buildZhQuery(topic: string, terms: string[]): string {
  return uniqueStrings([topic, ...terms]).join(" ");
}

function buildEnglishQuery(topic: string, type: TopicType, terms: string[]): string {
  return uniqueStrings([...topicEnglishKeywords(topic, type), ...terms]).slice(0, 6).join(" ");
}

function directionViolations(direction: ResearchDirection): string[] {
  const text = `${direction.displayTitleZh} ${direction.researchQuestionZh} ${direction.descriptionZh} ${direction.searchQueryZh}`;
  const forbidden = DISALLOWED_BY_TYPE[direction.topicType] ?? [];
  return forbidden.filter((term) => text.includes(term));
}

export function topicSemanticKeywords(topic: string): string[] {
  const normalizedTopic = compactWhitespace(topic);
  if (!normalizedTopic) return [];
  const topicType = detectTopicType(normalizedTopic);
  const typedTerms =
    topicType === "general_ambiguous" || topicType === "sensitive_research_only"
      ? []
      : [...(TOPIC_TERMS[topicType] ?? [])];
  const directEnglish = TOPIC_ENGLISH_HINTS[normalizedTopic] ?? [];
  const matchedEnglish = Object.entries(TOPIC_ENGLISH_HINTS)
    .filter(([key]) => normalizedTopic.includes(key))
    .flatMap(([, terms]) => terms);
  const zhChunks = normalizedTopic
    .split(/[\s，,、：:；;。！？!?（）()/-]+/)
    .filter((term) => Array.from(term).length >= 2);
  const latinChunks = normalizedTopic
    .split(/[^A-Za-z0-9]+/)
    .filter((term) => term.length >= 3);
  return uniqueStrings([
    normalizedTopic,
    ...zhChunks,
    ...latinChunks,
    ...typedTerms,
    ...directEnglish,
    ...matchedEnglish,
  ]).filter((term) => term.length >= 2);
}

export function directionText(direction: ResearchDirection): string {
  return [
    direction.displayTitleZh,
    direction.researchQuestionZh,
    direction.polishedTitleZh ?? "",
    direction.descriptionZh,
    direction.expandedScopeZh ?? "",
    direction.searchQueryZh,
    direction.englishKeywords.join(" "),
    direction.bilingualQueries.join(" "),
  ].join(" ");
}

export function hasSemanticContamination(input: {
  candidateText: string;
  currentTopic: string;
  previousTopic?: string | null;
}): boolean {
  const previousTopic = compactWhitespace(input.previousTopic ?? "");
  if (!previousTopic) return false;

  const candidate = input.candidateText.toLowerCase();
  const currentKeywords = new Set(
    topicSemanticKeywords(input.currentTopic).map((term) => term.toLowerCase()),
  );
  const previousKeywords = topicSemanticKeywords(previousTopic)
    .map((term) => term.toLowerCase())
    .filter((term) => !currentKeywords.has(term));

  if (previousKeywords.length === 0) return false;
  const hits = previousKeywords.filter((term) => candidate.includes(term));
  const strongHits = hits.filter((term) => term.length >= 3);
  return hits.length >= 2 || strongHits.length >= 1;
}

export function directionHasSemanticContamination(
  direction: ResearchDirection,
  currentTopic: string,
  previousTopic?: string | null,
): boolean {
  if (direction.rawTopic !== currentTopic) return true;
  return hasSemanticContamination({
    candidateText: directionText(direction),
    currentTopic,
    previousTopic,
  });
}

function isSemanticallySafe(direction: ResearchDirection): boolean {
  if (directionViolations(direction).length > 0) return false;
  if (
    (direction.topicType === "illegal_drug_research_safe" || direction.topicType === "sensitive_research_only") &&
    BLOCKED_OPERATIONAL_PATTERN.test(`${direction.displayTitleZh} ${direction.researchQuestionZh} ${direction.descriptionZh}`)
  ) {
    return false;
  }
  return true;
}

export function generateResearchDirections(
  validation: TopicValidationResult,
  options: GenerateResearchDirectionOptions = {},
): ResearchDirection[] {
  if (validation.status === "idle" || validation.status === "invalid" || validation.status === "error") {
    return [];
  }

  const topicRunId = options.topicRunId ?? `topic-${hashText(validation.normalizedTopic)}`;
  const keepCurrentTopic = (direction: ResearchDirection) =>
    direction.rawTopic === validation.rawTopic &&
    !directionHasSemanticContamination(direction, validation.rawTopic, options.previousTopic);

  const primary = buildDirections(validation, directionBank(validation), topicRunId).filter(keepCurrentTopic);
  if (primary.length >= 6) return primary.slice(0, 10);
  if (primary.length >= 4) return primary;

  const fallbackValidation = { ...validation, topicType: "general_ambiguous" as const };
  const fallback = buildDirections(
    fallbackValidation,
    generalAmbiguousBank(validation.normalizedTopic),
    topicRunId,
  ).filter(keepCurrentTopic);
  return (fallback.length ? fallback : primary).slice(0, 10);
}

function buildDirections(
  validation: TopicValidationResult,
  specs: DirectionSpec[],
  topicRunId?: string,
): ResearchDirection[] {
  const deduped: ResearchDirection[] = [];
  specs
    .map((direction, index) => makeDirection(validation, index, direction, topicRunId))
    .filter((direction) => direction.displayTitleZh && direction.researchQuestionZh && direction.descriptionZh)
    .filter((direction) => direction.searchQueryZh && direction.englishKeywords.length >= 2 && direction.bilingualQueries.length >= 2)
    .filter(isSemanticallySafe)
    .forEach((direction) => {
      if (deduped.some((existing) => titlesTooSimilar(existing.displayTitleZh, direction.displayTitleZh))) {
        return;
      }
      if (
        deduped.some(
          (existing) =>
            existing.intentTag === direction.intentTag &&
            titlesTooSimilar(existing.researchQuestionZh, direction.researchQuestionZh),
        )
      ) {
        return;
      }
      deduped.push(direction);
    });
  return deduped;
}

export function workflowStatusLabel(status: TopicWorkflowState): string {
  switch (status) {
    case "idle":
      return "等待主題";
    case "validating":
      return "正在判斷主題";
    case "invalid":
      return "主題無效";
    case "needs_disambiguation":
      return "需要先選擇研究方向";
    case "sensitive_research_only":
      return "已限制為安全研究角度";
    case "ready":
      return "主題已設定";
    case "error":
    default:
      return "主題處理失敗";
  }
}
