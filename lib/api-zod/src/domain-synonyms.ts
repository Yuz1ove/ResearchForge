export type ResearchDomain =
  | "chemistry"
  | "biology"
  | "dentistry"
  | "animal_behavior"
  | "medicine"
  | "environment"
  | "physics"
  | "social_science"
  | "language"
  | "general"
  | "unknown";

export type SearchQueryIntent =
  | "definition"
  | "mechanism"
  | "application"
  | "limitation"
  | "experiment"
  | "review"
  | "case"
  | "standard"
  | "general";

export type SearchQueryLanguage = "zh" | "en" | "mixed";
export type SearchQueryPriority = "high" | "medium" | "low";

export interface SearchQueryGroup {
  id: string;
  language: SearchQueryLanguage;
  intent: SearchQueryIntent;
  query: string;
  priority: SearchQueryPriority;
  expectedSourceType?: "paper" | "review" | "report" | "webpage" | "educational" | "unknown";
}

export interface DomainConceptSynonym {
  canonicalConcept: string;
  domain: ResearchDomain;
  zhTerms: string[];
  enTerms: string[];
  zhCoreTermsOverride?: string[];
  enCoreTermsOverride?: string[];
  mechanismTerms?: string[];
  applicationTerms?: string[];
  limitationTerms?: string[];
  relatedApplications?: string[];
  negativeTerms?: string[];
  requiredMatchTerms?: string[];
  queryGroups: SearchQueryGroup[];
}

function q(
  id: string,
  language: SearchQueryLanguage,
  intent: SearchQueryIntent,
  query: string,
  priority: SearchQueryPriority,
  expectedSourceType: SearchQueryGroup["expectedSourceType"] = "paper",
): SearchQueryGroup {
  return { id, language, intent, query, priority, expectedSourceType };
}

export const DOMAIN_CONCEPT_SYNONYMS: DomainConceptSynonym[] = [
  {
    canonicalConcept: "sodium perchlorate",
    domain: "chemistry",
    zhCoreTermsOverride: ["過氯酸鈉", "高氯酸鈉", "NaClO4"],
    enCoreTermsOverride: ["sodium perchlorate", "NaClO4"],
    zhTerms: [
      "過氯酸鈉",
      "高氯酸鈉",
      "NaClO4",
      "過氯酸鹽",
      "高氯酸鹽",
      "高氯酸根",
    ],
    enTerms: [
      "sodium perchlorate",
      "NaClO4",
      "oxidizing salt",
      "inorganic oxidizer",
      "perchlorate salt",
      "perchlorate",
    ],
    mechanismTerms: [
      "oxidizer",
      "thermal decomposition",
      "oxidation reaction",
      "ionic compound",
      "solubility",
      "氧化劑",
      "熱分解",
      "氧化反應",
      "離子化合物",
      "溶解度",
    ],
    applicationTerms: [
      "analytical chemistry",
      "laboratory reagent",
      "oxidizing reagent",
      "分析化學",
      "實驗試劑",
      "氧化試劑",
    ],
    limitationTerms: [
      "safety",
      "reactivity",
      "storage",
      "hazard",
      "environmental contamination",
      "thyroid risk",
      "安全",
      "反應性",
      "儲存",
      "危害",
      "環境污染",
    ],
    relatedApplications: [
      "analytical chemistry",
      "laboratory reagent",
      "environmental contamination",
    ],
    negativeTerms: [
      "AI",
      "machine learning",
      "grammar",
      "education",
      "management",
      "biodiesel cost",
      "fuel economy",
      "artificial intelligence in medicine",
      "sodium channel",
      "hyponatremia",
      "polymer electrolyte",
      "solid electrolyte",
      "energy storage",
      "rocket propellant",
      "ammonium perchlorate",
      "lithium perchlorate",
      "magnesium perchlorate",
      "potassium perchlorate",
    ],
    queryGroups: [
      q("perchlorate-zh-definition", "zh", "definition", "過氯酸鈉 高氯酸鈉 性質 氧化劑", "high"),
      q("perchlorate-zh-mechanism", "zh", "mechanism", "過氯酸鈉 熱分解 氧化反應", "high"),
      q("perchlorate-zh-safety", "zh", "limitation", "過氯酸鈉 安全 反應性 儲存", "high", "report"),
      q("perchlorate-zh-environment", "zh", "case", "過氯酸鹽 環境污染 甲狀腺 風險", "medium", "report"),
      q("perchlorate-en-definition", "en", "definition", "sodium perchlorate chemical properties oxidizer", "high"),
      q("perchlorate-en-decomposition", "en", "mechanism", "sodium perchlorate thermal decomposition oxidizer", "high"),
      q("perchlorate-en-application", "en", "application", "sodium perchlorate analytical chemistry laboratory reagent", "medium"),
      q("perchlorate-en-safety", "en", "limitation", "sodium perchlorate safety hazard storage reactivity", "high", "report"),
      q("perchlorate-en-environment", "en", "case", "perchlorate contamination thyroid environmental risk", "medium", "review"),
      q("perchlorate-mixed", "mixed", "general", "過氯酸鈉 sodium perchlorate NaClO4", "high"),
    ],
  },
  {
    canonicalConcept: "saponification",
    domain: "chemistry",
    zhTerms: [
      "皂化",
      "皂化反應",
      "鹼水解",
      "酯類水解",
      "油脂水解",
      "脂肪酸鹽",
      "肥皂製備",
      "三酸甘油酯水解",
      "氫氧化鈉水解",
      "氫氧化鉀水解",
    ],
    enTerms: [
      "saponification",
      "saponification reaction",
      "alkaline hydrolysis",
      "base-catalyzed hydrolysis",
      "ester hydrolysis",
      "hydrolysis of esters",
      "hydrolysis of triglycerides",
      "triglyceride hydrolysis",
      "soap formation",
      "fatty acid salts",
      "glycerol",
      "saponification value",
      "NaOH hydrolysis",
      "KOH hydrolysis",
    ],
    mechanismTerms: [
      "ester hydrolysis",
      "base-catalyzed hydrolysis",
      "alkaline hydrolysis",
      "hydrolysis of triglycerides",
      "鹼水解",
      "酯類水解",
      "三酸甘油酯水解",
    ],
    applicationTerms: [
      "soap making",
      "biodiesel",
      "oil hydrolysis",
      "fat hydrolysis",
      "ester kinetics",
      "肥皂製備",
      "油脂水解",
    ],
    limitationTerms: [
      "reaction conditions",
      "kinetics",
      "alkali concentration",
      "temperature",
      "saponification value",
      "反應條件",
      "限制",
    ],
    relatedApplications: [
      "soap making",
      "biodiesel",
      "oil hydrolysis",
      "fat hydrolysis",
      "ester kinetics",
    ],
    negativeTerms: [
      "AI",
      "machine learning",
      "grammar",
      "education",
      "linguistics",
      "management",
      "transesterification cost",
      "biodiesel cost",
      "fuel economy",
      "fuel efficiency",
      "sea turtle conservation",
      "cancer cell migration",
    ],
    queryGroups: [
      q("saponification-zh-definition", "zh", "definition", "皂化反應 原理", "high"),
      q("saponification-zh-mechanism", "zh", "mechanism", "皂化 鹼水解 油脂", "high"),
      q("saponification-zh-ester", "zh", "mechanism", "酯類 鹼水解 皂化", "high"),
      q("saponification-zh-application", "zh", "application", "肥皂製備 皂化反應", "medium", "educational"),
      q("saponification-en-definition", "en", "definition", "saponification reaction mechanism", "high"),
      q("saponification-en-alkaline", "en", "mechanism", "alkaline hydrolysis of esters", "high"),
      q("saponification-en-triglyceride", "en", "mechanism", "base-catalyzed hydrolysis of triglycerides", "high"),
      q("saponification-en-oils", "en", "mechanism", "hydrolysis of oils and fats NaOH", "high"),
      q("saponification-en-soap", "en", "application", "soap formation fatty acid salts glycerol", "high"),
      q("saponification-en-value", "en", "standard", "saponification value oils fats", "medium"),
      q("saponification-en-kinetics", "en", "mechanism", "ester hydrolysis kinetics base catalyzed", "medium"),
      q("saponification-mixed", "mixed", "general", "皂化 saponification alkaline hydrolysis", "medium"),
    ],
  },
  {
    canonicalConcept: "redox",
    domain: "chemistry",
    zhTerms: ["氧化還原", "氧化", "還原", "電子轉移", "氧化劑", "還原劑", "氧化數", "電化學"],
    enTerms: ["redox", "oxidation", "reduction", "electron transfer", "oxidant", "reductant", "oxidation state", "electrochemistry"],
    mechanismTerms: ["electron transfer", "oxidation state", "redox reaction", "電子轉移", "氧化數"],
    applicationTerms: ["corrosion", "combustion", "battery", "metal oxide", "nickel oxide", "cobalt oxide"],
    relatedApplications: ["corrosion", "combustion", "battery", "metal oxide", "nickel oxide", "cobalt oxide"],
    negativeTerms: ["AI", "grammar", "linguistics", "management", "education"],
    queryGroups: [
      q("redox-zh-definition", "zh", "definition", "氧化還原反應 原理 電子轉移", "high"),
      q("redox-zh-electrochemistry", "zh", "application", "氧化還原 電化學 應用", "medium"),
      q("redox-en-definition", "en", "definition", "redox reaction electron transfer mechanism", "high"),
      q("redox-en-electrochemistry", "en", "application", "oxidation reduction electrochemistry applications", "high"),
      q("redox-en-metal-oxide", "en", "case", "redox metal oxide nickel cobalt oxide", "medium"),
    ],
  },
  {
    canonicalConcept: "HIV/AIDS",
    domain: "medicine",
    zhCoreTermsOverride: [
      "愛滋病",
      "HIV感染",
      "人類免疫缺乏病毒",
      "後天免疫缺乏症候群",
    ],
    enCoreTermsOverride: [
      "HIV",
      "AIDS",
      "human immunodeficiency virus",
      "acquired immunodeficiency syndrome",
    ],
    zhTerms: [
      "愛滋病",
      "HIV感染",
      "HIV 感染",
      "人類免疫缺乏病毒",
      "後天免疫缺乏症候群",
      "傳染途徑",
      "風險因子",
      "公共衛生影響",
      "抗病毒治療",
      "社會污名",
      "預防策略",
    ],
    enTerms: [
      "HIV",
      "AIDS",
      "HIV/AIDS",
      "human immunodeficiency virus",
      "acquired immunodeficiency syndrome",
      "HIV infection",
      "HIV transmission",
      "HIV risk factors",
      "HIV/AIDS epidemiology",
      "antiretroviral therapy",
      "public health impact",
      "social impact",
      "stigma",
      "prevention",
    ],
    mechanismTerms: [
      "HIV transmission",
      "risk factors",
      "sexual transmission",
      "bloodborne transmission",
      "mother-to-child transmission",
      "epidemiology",
      "傳染途徑",
      "風險因子",
      "流行病學",
      "垂直感染",
    ],
    applicationTerms: [
      "antiretroviral therapy",
      "ART",
      "pre-exposure prophylaxis",
      "PrEP",
      "prevention",
      "public health",
      "stigma",
      "抗病毒治療",
      "暴露前預防",
      "預防策略",
      "公共衛生",
      "社會污名",
    ],
    limitationTerms: [
      "screening",
      "testing",
      "cohort study",
      "systematic review",
      "clinical trial",
      "surveillance",
      "篩檢",
      "世代研究",
      "系統性回顧",
      "臨床試驗",
      "監測",
    ],
    negativeTerms: [
      "scientific method",
      "general research method",
      "generic experimental design",
      "school science inquiry",
      "case research methodology",
      "科學方法",
      "一般研究方法",
      "實驗設計通論",
      "方法論",
    ],
    requiredMatchTerms: [
      "愛滋病",
      "HIV",
      "AIDS",
      "人類免疫缺乏病毒",
      "後天免疫缺乏症候群",
      "human immunodeficiency virus",
      "acquired immunodeficiency syndrome",
    ],
    queryGroups: [
      q("hiv-zh-risk", "zh", "general", "愛滋病 風險因子 傳染途徑 影響", "high", "review"),
      q("hiv-zh-epidemiology", "zh", "review", "愛滋病 風險因子 流行病學 研究", "high", "review"),
      q("hiv-zh-public-health", "zh", "application", "HIV 公共衛生 影響 文獻回顧", "high", "review"),
      q("hiv-en-risk", "en", "review", "HIV AIDS risk factors transmission epidemiology", "high", "review"),
      q("hiv-en-public-health", "en", "review", "HIV AIDS public health impact systematic review", "high", "review"),
      q("hiv-en-prevention", "en", "application", "HIV transmission prevention study antiretroviral therapy", "high", "review"),
      q("hiv-en-cohort", "en", "case", "HIV risk factors cohort study", "medium", "paper"),
      q("hiv-en-art", "en", "review", "antiretroviral therapy clinical trial review HIV", "medium", "review"),
    ],
  },
  {
    canonicalConcept: "microplastics human health",
    domain: "medicine",
    zhTerms: ["微塑膠", "人體健康", "健康影響", "暴露", "毒性", "發炎", "血液", "組織"],
    enTerms: ["microplastics", "human health", "health effects", "exposure", "toxicity", "inflammation", "blood", "tissue", "human exposure"],
    mechanismTerms: ["toxicity", "inflammation", "oxidative stress", "human exposure", "毒性", "發炎", "暴露"],
    applicationTerms: ["blood", "tissue", "drinking water", "food exposure", "血液", "組織"],
    negativeTerms: ["sea turtle conservation", "marine turtle ingestion", "plastic manufacturing", "management"],
    requiredMatchTerms: ["微塑膠", "微塑料", "塑膠微粒", "microplastics", "microplastic", "nanoplastics", "nanoplastic"],
    queryGroups: [
      q("microplastics-health-zh", "zh", "general", "微塑膠 人體健康 暴露 毒性", "high"),
      q("microplastics-health-en", "en", "review", "microplastics human health exposure toxicity review", "high", "review"),
      q("microplastics-blood-en", "en", "case", "microplastics blood tissue human exposure", "high"),
      q("microplastics-inflammation-en", "en", "mechanism", "microplastics inflammation oxidative stress human health", "medium"),
    ],
  },
  {
    canonicalConcept: "Salmonella food safety",
    domain: "biology",
    zhTerms: ["沙門氏桿菌", "沙門氏菌", "食品安全", "食物中毒", "污染"],
    enTerms: ["Salmonella", "salmonellosis", "food safety", "foodborne illness", "contamination"],
    mechanismTerms: ["contamination", "foodborne illness", "salmonellosis", "污染", "食源性"],
    applicationTerms: ["eggs", "poultry", "outbreak", "public health", "雞蛋", "家禽", "公共衛生"],
    negativeTerms: ["stock market", "social media addiction", "telomerase", "climate change"],
    requiredMatchTerms: ["沙門氏桿菌", "沙門氏菌", "Salmonella", "salmonellosis"],
    queryGroups: [
      q("salmonella-zh", "zh", "general", "沙門氏桿菌 食品安全 污染", "high"),
      q("salmonella-en-foodborne", "en", "definition", "Salmonella food safety foodborne illness", "high"),
      q("salmonella-en-outbreak", "en", "case", "Salmonella outbreak eggs poultry public health", "high"),
      q("salmonella-en-review", "en", "review", "Salmonella contamination food safety review", "medium", "review"),
    ],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function containsTerm(text: string, term: string): boolean {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  if (
    normalizedTerm === "氧化" &&
    /二氧化碳|抗氧化|carbon dioxide|\bco2\b/i.test(normalizedText) &&
    !/氧化還原|氧化反應|氧化劑|氧化數|電子轉移|電化學|redox|oxidation[-\s]?reduction/i.test(normalizedText)
  ) {
    return false;
  }
  if (/^[a-z0-9][a-z0-9\s-]*$/i.test(normalizedTerm)) {
    const pattern = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i").test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

export function uniqueStrings(items: string[], limit = Number.POSITIVE_INFINITY): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

export function findDomainConceptsForTopic(topic: string): DomainConceptSynonym[] {
  const text = normalize(topic);
  return DOMAIN_CONCEPT_SYNONYMS.filter((concept) => {
    const requiredMatchTerms = concept.requiredMatchTerms ?? [];
    if (
      requiredMatchTerms.length > 0 &&
      !requiredMatchTerms.some((term) => containsTerm(text, term))
    ) {
      return false;
    }
    return [
      concept.canonicalConcept,
      ...concept.zhTerms,
      ...concept.enTerms,
      ...(concept.mechanismTerms ?? []),
      ...(concept.applicationTerms ?? []),
    ].some((term) => containsTerm(text, term));
  });
}

export function detectResearchDomain(topic: string): ResearchDomain {
  const concept = findDomainConceptsForTopic(topic)[0];
  if (concept) return concept.domain;
  const text = normalize(topic);
  if (/牙菌斑|牙垢|口腔生物膜|牙周病|dental plaque|oral biofilm|periodontal|plaque control/.test(text)) return "dentistry";
  if (/狗|犬|護食|資源防衛|食物攻擊|dog|canine|resource guarding|food aggression|veterinary behavior/.test(text)) return "animal_behavior";
  if (/化學|反應|酸|鹼|酯|hydrolysis|chemistry|reaction/.test(text)) return "chemistry";
  if (/生物|細菌|食品安全|biology|salmonella|microplastic/.test(text)) return "biology";
  if (/健康|醫學|毒性|medicine|health|toxicity/.test(text)) return "medicine";
  if (/環境|污染|氣候|environment|pollution|climate/.test(text)) return "environment";
  if (/天文|星星|恆星|星系|光年|視差|宇宙|astronomy|stellar|\bstars?\b|parallax|light[-\s]?year/.test(text)) return "physics";
  if (/物理|力學|physics|mechanics/.test(text)) return "physics";
  if (/社會|教育|管理|social|education|management/.test(text)) return "social_science";
  if (/語言|文學|language|linguistics|literature/.test(text)) return "language";
  return topic.trim() ? "general" : "unknown";
}

export function conceptQueryGroupsForTopic(topic: string): SearchQueryGroup[] {
  return uniqueStrings(
    findDomainConceptsForTopic(topic).flatMap((concept) =>
      concept.queryGroups.map((group) => JSON.stringify(group)),
    ),
  ).map((item) => JSON.parse(item) as SearchQueryGroup);
}

export function conceptTermsForTopic(topic: string): {
  concepts: DomainConceptSynonym[];
  zhCoreTerms: string[];
  enCoreTerms: string[];
  zhSynonyms: string[];
  enSynonyms: string[];
  mechanismTerms: string[];
  applicationTerms: string[];
  limitationTerms: string[];
  exclusionTerms: string[];
} {
  const concepts = findDomainConceptsForTopic(topic);
  return {
    concepts,
    zhCoreTerms: uniqueStrings(
      concepts.flatMap((concept) =>
        concept.zhCoreTermsOverride?.length
          ? concept.zhCoreTermsOverride
          : concept.zhTerms.slice(0, 3),
      ),
      16,
    ),
    enCoreTerms: uniqueStrings(
      concepts.flatMap((concept) =>
        concept.enCoreTermsOverride?.length
          ? [concept.canonicalConcept, ...concept.enCoreTermsOverride]
          : [concept.canonicalConcept, ...concept.enTerms.slice(0, 3)],
      ),
      16,
    ),
    zhSynonyms: uniqueStrings(concepts.flatMap((concept) => concept.zhTerms), 32),
    enSynonyms: uniqueStrings(concepts.flatMap((concept) => concept.enTerms), 40),
    mechanismTerms: uniqueStrings(concepts.flatMap((concept) => concept.mechanismTerms ?? []), 32),
    applicationTerms: uniqueStrings(concepts.flatMap((concept) => [...(concept.applicationTerms ?? []), ...(concept.relatedApplications ?? [])]), 32),
    limitationTerms: uniqueStrings(concepts.flatMap((concept) => concept.limitationTerms ?? []), 24),
    exclusionTerms: uniqueStrings(concepts.flatMap((concept) => concept.negativeTerms ?? []), 32),
  };
}
