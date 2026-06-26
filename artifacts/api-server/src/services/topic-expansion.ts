import {
  type CandidateTopic,
  type HiddenResearchPlan,
  TopicExpansionContentSchema,
  type TopicExpansionKeywordExpansion,
  type TopicExpansionQueryPlan,
  type TopicDirection,
  type TopicExpansionContent,
  type TopicExpansionDiagnostics,
  type TopicExpansionDomain,
  type TopicExpansionEntityType,
  type TopicExpansionGenerationMode,
  type TopicExpansionInputKind,
  type TopicExpansionRequest,
  type TopicExpansionResponse,
  type TitleCandidate,
  type TitleCandidateStyle,
} from "@workspace/api-zod/topic-expansion";
import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
import {
  removeLegacyGenericAngles,
  sanitizeAndBackfillAngles,
  understandTopic,
} from "@workspace/api-zod/topic-understanding";
import { createHash, randomUUID } from "node:crypto";
import { safeJsonParse } from "./llm-adapter";
import {
  logLlmFallback,
  messageFromStatus,
  requestLlmText,
  statusFromLlmError,
  type LlmServiceOperation,
} from "./llm-service";

type FetchImpl = (input: string | URL, init?: RequestInit) => Promise<Response>;

const TOPIC_EXPANSION_RULE_TIMEOUT_MS = 12_000;
const DEFAULT_TOPIC_EXPANSION_TIMEOUT_MS = TOPIC_EXPANSION_RULE_TIMEOUT_MS;
const DEFAULT_TOPIC_VALIDITY_TIMEOUT_MS = 10_000;
const TOPIC_EXPANSION_TEMPERATURE = 0.2;

const TOO_BROAD_TERMS = new Set([
  "ai",
  "人工智慧",
  "教育",
  "環境",
  "健康",
  "科技",
  "technology",
  "environment",
  "health",
  "education",
]);

const COMPLETE_RESEARCH_TOPIC_PATTERNS = [
  /對.+的影響/u,
  /與.+的關係/u,
  /之間的關係/u,
  /的原因與結果/u,
  /成因與影響/u,
  /風險與影響/u,
  /.+分析$/u,
  /.+研究$/u,
  /impact of|relationship between|analysis of|study of|effects of/i,
];

const RESEARCH_TOPIC_CUE_TERMS = [
  "影響",
  "關係",
  "成因",
  "結果",
  "分析",
  "研究",
  "機制",
  "風險",
  "效應",
  "成分",
  "價值",
  "作用",
  "比較",
  "策略",
  "成效",
  "保育",
  "分布",
  "結構",
  "適應",
  "治理",
  "監測",
  "變化",
  "評估",
];

const SHORT_PHRASE_CUE_TERMS = [
  "成癮",
  "變遷",
  "政策",
  "污染",
  "風險",
  "效應",
  "治理",
  "安全",
  "暖化",
  "健康",
  "教育",
];

const FORBIDDEN_GENERIC_TOPICS = [
  /科學定義與量測方法/u,
  /形成機制、應用場景與限制條件/u,
  /核心概念、範圍界線與可驗證資料/u,
  /背景脈絡、主要類型與核心特徵/u,
  /形成過程、使用方式與應用情境/u,
  /爭議、限制與後續發展趨勢/u,
  /可以用哪些指標、案例或資料集交叉驗證/u,
  /(^|[\s、，])背景脈絡($|[\s、，])/u,
  /(^|[\s、，])主要類型($|[\s、，])/u,
  /(^|[\s、，])核心特徵($|[\s、，])/u,
  /(^|[\s、，])形成過程($|[\s、，])/u,
  /(^|[\s、，])使用方式($|[\s、，])/u,
  /(^|[\s、，])應用情境($|[\s、，])/u,
  /(^|[\s、，])爭議($|[\s、，])/u,
  /(^|[\s、，])限制($|[\s、，])/u,
  /(^|[\s、，])發展趨勢($|[\s、，])/u,
  /(^|[\s、，])範圍界線($|[\s、，])/u,
  /(^|[\s、，])可驗證資料($|[\s、，])/u,
  /百科資料/u,
  /政府或機構資料/u,
  /case study dataset/i,
  /measurable indicators/i,
  /definition scope evidence/i,
];

const JSON_SHAPE = `{
  "expandedTopic": "string",
  "researchQuestions": ["string"],
  "searchKeywords": {
    "zh": ["string"],
    "en": ["string"],
    "synonyms": ["string"],
    "academic": ["string"]
  },
  "sourceStrategy": ["string"],
  "exclusions": ["string"]
}`;

const TOPIC_VALIDITY_JSON_SHAPE = `{
  "isValidTopic": true,
  "reason": "string"
}`;

const ANIMAL_ENTITY_PATTERN =
  /螞蟻|ant\b|ants\b|蜜蜂|bee\b|bees\b|蟑螂|cockroach|cockroaches|昆蟲|insect|insects|水母|jellyfish|烏龜|海龜|陸龜|turtle|tortoise|獵豹|cheetah|羊駝|alpaca|無尾熊|koala|鱷魚|crocodile|alligator|恐龍|dinosaur|蛤蜊|clam|沙門氏(?:桿)?菌|salmonella/iu;
const FOOD_ENTITY_PATTERN =
  /吐司|麵包|toast|bread|水餃|餃子|dumpling|jiaozi|可樂|汽水|cola|soft drink|soda|泡麵|instant noodles?|咖啡|coffee|茶|tea|碳酸飲料|含糖飲料/iu;
const HEALTH_ENTITY_PATTERN =
  /疾病|感染|細菌|病毒|病原體|健康|醫學|臨床|流行病學|公共衛生|沙門氏(?:桿)?菌|食物中毒|salmonella|infection|disease|clinical|epidemiology|public health/iu;
const SCIENTIFIC_CONCEPT_PATTERN =
  /負離子|離子|酸鹼值|ph\b|摩擦力|光合作用|溫室效應|negative ions?|air ions?|ionizer|photosynthesis|greenhouse effect|friction/iu;
const SOCIAL_ISSUE_PATTERN =
  /手機成癮|網路成癮|校園霸凌|少子化|氣候變遷|暖化|污染|政策|治理|教育|學習|社會|成癮|climate change|pollution|policy|education|social issue|addiction/iu;
const TECHNOLOGY_ENTITY_PATTERN =
  /ai|人工智慧|演算法|網站|程式|模型|飛機|航太|半導體|晶片|technology|engineering|software|aircraft|semiconductor/iu;
const PLACE_ENTITY_PATTERN = /台灣|臺灣|taiwan|日本|japan|美國|usa|america|亞洲|asia/iu;
const PERSON_OR_GROUP_ENTITY_PATTERN =
  /學生|高中生|青少年|家庭|家長|教師|老師|團體|族群|adolescents?|students?|teachers?|parents?/iu;

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item))
      .filter((item): item is string => Boolean(item));
  }
  const single = cleanString(value);
  return single ? [single] : [];
}

function emptyExpansionContent(): Pick<
  TopicExpansionResponse,
  | "expandedTopic"
  | "researchQuestions"
  | "searchKeywords"
  | "sourceStrategy"
  | "exclusions"
> {
  return {
    expandedTopic: "",
    researchQuestions: [],
    searchKeywords: {
      zh: [],
      en: [],
      synonyms: [],
      academic: [],
    },
    sourceStrategy: [],
    exclusions: [],
  };
}

type ExpansionPlanningContext = {
  understood: ReturnType<typeof understandTopic>;
  inputKind: TopicExpansionInputKind;
  topicDomain: TopicExpansionDomain;
  entityType: TopicExpansionEntityType;
  secondaryDomains: readonly TopicExpansionDomain[];
  englishTopic: string;
};

type RuleBasedExpansion = {
  originalTopic: string;
  inputKind: TopicExpansionInputKind;
  topicDomain: TopicExpansionDomain;
  entityType: TopicExpansionEntityType;
  secondaryDomains: TopicExpansionDomain[];
  generationMode: TopicExpansionGenerationMode;
  fallbackReason?: string;
  canonicalEnglishTopic: string;
  expandedTopic: string;
  keywordExpansion: TopicExpansionKeywordExpansion | null;
  candidateCount: number;
  selectedLensIds: string[];
  rejectedLensIds: string[];
  lensRejectReasons: Record<string, string>;
  directions: TopicDirection[];
  message?: string;
};

type CandidatePoolDiagnostics = {
  candidates: CandidateTopicPlan[];
  rejectedLensIds: string[];
  lensRejectReasons: Record<string, string>;
};

type CandidateTopicPlan = CandidateTopic & {
  category: string;
  scope: string;
  queryPlan: TopicExpansionQueryPlan;
  excludeTerms: string[];
  evidenceNeed: string[];
  broadSuggestion?: boolean;
  diversityKey: string;
  score?: number;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function hasForbiddenGenericText(value: string): boolean {
  const normalized = normalizeText(String(value ?? ""));
  if (!normalized) return false;
  return FORBIDDEN_GENERIC_TOPICS.some((pattern) => pattern.test(normalized));
}

export function classifyInputKind(
  topic: string,
  understood: ReturnType<typeof understandTopic>,
): TopicExpansionInputKind {
  const normalized = normalizeText(topic);
  if (!normalized || understood.topicKind === "unknown_or_noise") {
    return "gibberish";
  }

  if (TOO_BROAD_TERMS.has(normalized.toLowerCase())) {
    return "too_broad";
  }

  if (
    /^[A-Za-z0-9_-]{6,}$/.test(normalized) &&
    /[A-Za-z]/.test(normalized) &&
    /\d/.test(normalized)
  ) {
    return "gibberish";
  }

  if (COMPLETE_RESEARCH_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "complete_research_topic";
  }

  const hasResearchCue =
    normalized.includes("的") &&
    RESEARCH_TOPIC_CUE_TERMS.some((term) => normalized.includes(term));
  if (hasResearchCue && Array.from(normalized).length >= 8) {
    return "complete_research_topic";
  }

  const zhSegments = normalized.match(/[\u3400-\u9fff]+/g) ?? [];
  const charCount = Array.from(normalized).length;
  if (SHORT_PHRASE_CUE_TERMS.some((term) => normalized.includes(term)) && charCount <= 12) {
    return "short_phrase";
  }
  if (
    (zhSegments.length === 1 && charCount <= 4) ||
    (/^[A-Za-z-]+$/.test(normalized) && normalized.split(/\s+/).length === 1)
  ) {
    return "single_keyword";
  }

  if (charCount <= 12) {
    return "short_phrase";
  }

  return understood.topicKind === "broad_common_noun"
    ? "too_broad"
    : "short_phrase";
}

function entityTypeFromUnderstanding(
  understood: ReturnType<typeof understandTopic>,
): TopicExpansionEntityType | null {
  switch (understood.entity?.category) {
    case "animal":
      return "animal";
    case "plant":
      return "plant";
    case "food":
      return "food";
    case "disease":
      return "health_topic";
    case "technology":
    case "product":
    case "consumer_goods":
      return "technology";
    case "place":
      return "place";
    case "person":
      return "person_or_group";
    case "social_issue":
      return "social_issue";
    default:
      return null;
  }
}

export function classifyEntityType(
  topic: string,
  understood: ReturnType<typeof understandTopic>,
  inputKind: TopicExpansionInputKind,
): TopicExpansionEntityType {
  if (inputKind === "gibberish") return "unknown";
  const text = `${topic} ${understood.canonicalEnglishTopic} ${understood.aliases.join(" ")}`
    .toLowerCase();

  if (ANIMAL_ENTITY_PATTERN.test(text)) return "animal";
  if (FOOD_ENTITY_PATTERN.test(text)) return "food";
  if (HEALTH_ENTITY_PATTERN.test(text)) return "health_topic";
  if (SCIENTIFIC_CONCEPT_PATTERN.test(text)) return "scientific_concept";
  if (SOCIAL_ISSUE_PATTERN.test(text)) return "social_issue";
  if (TECHNOLOGY_ENTITY_PATTERN.test(text)) return "technology";
  if (PLACE_ENTITY_PATTERN.test(text)) return "place";
  if (PERSON_OR_GROUP_ENTITY_PATTERN.test(text)) return "person_or_group";

  const fromEntity = entityTypeFromUnderstanding(understood);
  if (fromEntity) return fromEntity;

  switch (understood.domain) {
    case "animal_science":
    case "biology":
      return "animal";
    case "food_nutrition":
    case "beverage_health":
      return "food";
    case "health":
      return "health_topic";
    case "technology":
    case "automotive_business":
    case "consumer_product":
    case "household_safety":
      return "technology";
    case "environment":
    case "social_science":
      return "social_issue";
    case "materials_design":
      return "scientific_concept";
    case "history_culture":
      return "person_or_group";
    default:
      return inputKind === "too_broad" ? "social_issue" : "unknown";
  }
}

export function classifyTopicDomain(
  topic: string,
  understood: ReturnType<typeof understandTopic>,
  inputKind: TopicExpansionInputKind,
  entityType: TopicExpansionEntityType = classifyEntityType(
    topic,
    understood,
    inputKind,
  ),
): TopicExpansionDomain {
  const text = `${topic} ${understood.canonicalEnglishTopic} ${understood.aliases.join(" ")}`
    .toLowerCase();

  if (inputKind === "gibberish") return "unknown";
  if (/實驗|變因|對照組|依變因|自變因|實驗設計|experiment|control group|independent variable/.test(text)) {
    return "experiment_design";
  }
  if (/手機成癮|網路成癮|社群媒體|注意力|睡眠|學習|青少年|smartphone addiction|screen time|social media/.test(text)) {
    return "education_psychology";
  }
  if (/氣候變遷|減碳|能源轉型|公共政策|社會政策|climate change|carbon|energy transition|policy/.test(text)) {
    return "social_policy";
  }
  if (entityType === "animal" || entityType === "plant") {
    return "biology_ecology";
  }
  if (entityType === "food") {
    return "health_medical";
  }
  if (entityType === "health_topic") {
    return "health_medical";
  }
  if (entityType === "scientific_concept") {
    return "natural_science";
  }
  if (entityType === "technology") {
    return "technology_engineering";
  }
  if (entityType === "social_issue") {
    return inputKind === "too_broad" ? "social_policy" : "education_psychology";
  }
  if (/營養|蛋白質|飲食|食品|食物|膳食|水餃|餃子|可樂|汽水|含糖飲料|碳酸飲料|nutrition|protein|diet|food safety|food composition|cola|soft drink|dumpling|soda/.test(text)) {
    return "health_medical";
  }
  if (/負離子|ion|離子|空氣品質|濃度|物理|化學|量測|rheology|thixotropy/.test(text)) {
    return /負離子|ion|離子|定義|特性|claims|health claims/.test(text)
      ? "natural_science"
      : "concept_feature";
  }
  if (/水母|烏龜|獵豹|海龜|陸龜|jellyfish|turtle|cheetah|species|habitat|ecology|conservation/.test(text)) {
    return "biology_ecology";
  }
  if (/沙門氏(?:桿)?菌|salmonella|感染|健康|醫學|疾病|食安|臨床|流行病學|公共衛生/.test(text)) {
    return "health_medical";
  }
  if (/ai|人工智慧|演算法|網站|程式|模型|資安|工程|裝置|晶片|飛機|航太|technology|engineering|software|aircraft/.test(text)) {
    return "technology_engineering";
  }
  if (/歷史|文化|文學|語言|思想|history|culture|literature/.test(text)) {
    return "humanities_culture";
  }

  switch (understood.domain) {
    case "animal_science":
    case "biology":
      return "biology_ecology";
    case "beverage_health":
    case "health":
      return "health_medical";
    case "materials_design":
      return "natural_science";
    case "technology":
    case "automotive_business":
    case "consumer_product":
    case "household_safety":
      return "technology_engineering";
    case "social_science":
      return "education_psychology";
    case "history_culture":
    case "music_culture":
      return "humanities_culture";
    case "environment":
      return "social_policy";
    default:
      return inputKind === "too_broad" ? "unknown" : "concept_feature";
  }
}

export function classifySecondaryDomains(
  topic: string,
  understood: ReturnType<typeof understandTopic>,
  primaryDomain: TopicExpansionDomain,
): TopicExpansionDomain[] {
  const text = `${topic} ${understood.canonicalEnglishTopic} ${understood.aliases.join(" ")}`
    .toLowerCase();
  const secondary: TopicExpansionDomain[] = [];
  const push = (domain: TopicExpansionDomain) => {
    if (domain !== primaryDomain && domain !== "unknown" && !secondary.includes(domain)) {
      secondary.push(domain);
    }
  };

  if (/手機成癮|網路成癮|社群媒體|睡眠|焦慮|憂鬱|smartphone addiction|screen time/.test(text)) {
    push("health_medical");
  }
  if (/氣候變遷|climate change|極端天氣|減碳|暖化|海平面/.test(text)) {
    push("natural_science");
  }
  if (/負離子|negative ions?|air ions?|ionizer|health claims/.test(text)) {
    push("concept_feature");
  }
  if (/水母|jellyfish|螫傷|sting/.test(text)) {
    push("health_medical");
  }
  if (/水餃|餃子|dumpling/.test(text)) {
    push("humanities_culture");
  }
  if (/可樂|cola|soft drink|汽水/.test(text)) {
    push("social_policy");
  }
  if (/沙門氏(?:桿)?菌|salmonella/.test(text)) {
    push("biology_ecology");
  }

  return secondary;
}

const EXPANSION_ENGLISH_HINTS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /吐司|toast|bread/i, terms: ["toast", "bread"] },
  { pattern: /水母|jellyfish/i, terms: ["jellyfish"] },
  { pattern: /烏龜|海龜|陸龜|turtle|tortoise/i, terms: ["turtle", "tortoise", "Testudines"] },
  { pattern: /獵豹|cheetah/i, terms: ["cheetah", "Acinonyx jubatus"] },
  { pattern: /負離子|negative ions?/i, terms: ["negative ions", "air ion concentration"] },
  { pattern: /手機成癮|智慧型手機成癮|smartphone addiction/i, terms: ["smartphone addiction", "problematic smartphone use"] },
  { pattern: /氣候變遷|climate change/i, terms: ["climate change", "global warming"] },
  { pattern: /水餃|餃子|dumpling/i, terms: ["dumpling", "frozen dumpling"] },
  { pattern: /可樂|汽水|含糖飲料|cola|soft drink/i, terms: ["cola", "soft drink", "sugar-sweetened beverage"] },
];

function englishTopicCandidates(context: ExpansionPlanningContext): string[] {
  const hints = EXPANSION_ENGLISH_HINTS.flatMap((hint) =>
    hint.pattern.test(context.understood.originalTopic) ? hint.terms : [],
  );
  return Array.from(
    new Set(
      [
        context.understood.canonicalEnglishTopic,
        ...context.understood.englishTerms,
        ...context.understood.scientificNames,
        ...hints,
      ].filter((term): term is string => Boolean(term && /[A-Za-z]/.test(term))),
    ),
  );
}

function preferredEnglishTopic(context: ExpansionPlanningContext): string {
  return englishTopicCandidates(context)[0] ?? "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

function makeZhQueries(topic: string, facets: string[]): string[] {
  const base = normalizeText(topic);
  return uniqueStrings(facets.map((facet) => `${base} ${facet}`.trim()));
}

function makeEnQueries(englishTopic: string, facets: string[]): string[] {
  const base = normalizeText(englishTopic);
  if (!base) return [];
  return uniqueStrings(facets.map((facet) => `${base} ${facet}`.trim()));
}

function defaultExcludeTerms(
  context: ExpansionPlanningContext,
  extras: string[] = [],
): string[] {
  const domainDefaults: Record<TopicExpansionDomain, string[]> = {
    biology_ecology: ["卡通", "遊戲", "貼圖", "meme"],
    health_medical: ["偏方", "廣告", "療效宣稱", "保健品業配"],
    natural_science: ["廣告", "開箱", "品牌頁", "促銷"],
    experiment_design: ["心得文", "作業代寫", "懶人包", "口語短片"],
    social_policy: ["懶人包", "迷因", "口水戰", "品牌廣告"],
    education_psychology: ["迷因", "星座", "短片", "網紅行銷"],
    technology_engineering: ["logo", "貼圖", "遊戲攻略", "品牌廣告"],
    humanities_culture: ["迷因", "粉絲剪輯", "商店頁", "購物連結"],
    concept_feature: ["廣告", "促銷", "開箱", "品牌頁"],
    unknown: ["logo", "meme", "遊戲", "廣告"],
  };
  return uniqueStrings([
    ...domainDefaults[context.topicDomain],
    ...context.understood.excludedDriftTerms,
    ...extras,
  ]).slice(0, 6);
}

function defaultExpectedEvidence(domain: TopicExpansionDomain): string[] {
  switch (domain) {
    case "biology_ecology":
      return ["族群監測資料", "棲地或環境變化資料", "生態研究", "保育或風險評估報告"];
    case "health_medical":
      return ["流行病學研究", "臨床或毒理資料", "系統性回顧", "公共衛生指引"];
    case "natural_science":
      return ["量測數據", "實驗方法論文", "物理或化學研究", "證據評估資料"];
    case "experiment_design":
      return ["實驗設計文獻", "量測方法", "對照組資料", "誤差分析"];
    case "social_policy":
      return ["官方統計", "政策報告", "台灣在地資料", "國際比較研究"];
    case "education_psychology":
      return ["心理學研究", "教育研究", "問卷或行為資料", "介入成效研究"];
    case "technology_engineering":
      return ["工程研究", "技術文件", "性能比較資料", "風險或治理報告"];
    case "humanities_culture":
      return ["原典或文本資料", "歷史文獻", "文化研究", "比較觀點分析"];
    case "concept_feature":
      return ["定義與量測資料", "應用研究", "證據評估", "限制與反證資料"];
    case "unknown":
    default:
      return ["基礎學術資料", "可信機構資料", "定義與範圍資料", "案例或統計資料"];
  }
}

function directionCategoryLabel(domain: TopicExpansionDomain): string {
  switch (domain) {
    case "biology_ecology":
      return "生物生態";
    case "health_medical":
      return "健康醫學";
    case "natural_science":
      return "自然科學";
    case "experiment_design":
      return "實驗設計";
    case "social_policy":
      return "社會政策";
    case "education_psychology":
      return "教育心理";
    case "technology_engineering":
      return "科技工程";
    case "humanities_culture":
      return "人文文化";
    case "concept_feature":
      return "概念特徵";
    case "unknown":
    default:
      return "研究方向";
  }
}

function topicSummaryLine(
  topic: string,
  domain: TopicExpansionDomain,
): string {
  switch (domain) {
    case "biology_ecology":
      return `聚焦於 ${topic} 的生態角色、環境壓力與人類影響。`;
    case "health_medical":
      return `聚焦於 ${topic} 的暴露來源、健康機制與介入建議。`;
    case "natural_science":
      return `聚焦於 ${topic} 的定義、量測方法與科學證據。`;
    case "experiment_design":
      return `聚焦於 ${topic} 的變因設定、量測方法與實驗限制。`;
    case "social_policy":
      return `聚焦於 ${topic} 的現況趨勢、政策回應與台灣在地資料。`;
    case "education_psychology":
      return `聚焦於 ${topic} 的睡眠、注意力、學習表現與介入策略。`;
    case "technology_engineering":
      return `聚焦於 ${topic} 的技術原理、應用情境與風險限制。`;
    case "humanities_culture":
      return `聚焦於 ${topic} 的歷史脈絡、文本詮釋與文化意義。`;
    case "concept_feature":
      return `聚焦於 ${topic} 的定義、應用場景、證據與限制。`;
    case "unknown":
    default:
      return `目前先提供 ${topic} 的可研究切角，建議再縮小研究範圍。`;
  }
}

type TopicSpecialization = {
  coreTermsZh?: string[];
  coreTermsEn?: string[];
  relatedTermsZh?: string[];
  relatedTermsEn?: string[];
  dimensionTermsZh?: string[];
  dimensionTermsEn?: string[];
  excludeTerms?: string[];
};

function matchTopicSpecialization(
  context: ExpansionPlanningContext,
): TopicSpecialization | null {
  const topicText = `${context.understood.originalTopic} ${context.englishTopic}`.toLowerCase();
  if (/螞蟻|ant\b|ants\b/.test(topicText)) {
    return {
      coreTermsZh: ["螞蟻", "昆蟲"],
      coreTermsEn: ["ant", "ants"],
      relatedTermsZh: ["社會分工", "群體行為", "費洛蒙溝通", "覓食路徑", "土壤環境", "入侵種"],
      relatedTermsEn: ["social organization", "collective behavior", "pheromone communication", "foraging trail", "soil ecology", "invasive ants"],
      dimensionTermsZh: ["生態角色", "行為適應", "人類互動", "入侵管理"],
      dimensionTermsEn: ["ecological role", "behavioral adaptation", "human interaction", "invasive management"],
      excludeTerms: ["卡通", "遊戲", "貼圖", "螞蟻人", "Ant-Man"],
    };
  }
  if (/水母|jellyfish/.test(topicText)) {
    return {
      coreTermsZh: ["水母", "刺胞動物"],
      coreTermsEn: ["jellyfish", "cnidarian"],
      relatedTermsZh: ["大量繁殖", "海洋暖化", "螫傷", "漁業影響", "食物鏈", "海洋生態"],
      relatedTermsEn: ["jellyfish bloom", "ocean warming", "jellyfish sting", "fisheries impact", "food web", "marine ecosystem"],
      dimensionTermsZh: ["生態影響", "健康風險", "環境指標", "沿海產業"],
      dimensionTermsEn: ["ecological impact", "health risk", "environmental indicator", "coastal industry"],
      excludeTerms: ["卡通", "遊戲", "logo", "jellyfish lamp", "海綿寶寶"],
    };
  }
  if (/烏龜|海龜|陸龜|turtle|tortoise/.test(topicText)) {
    return {
      coreTermsZh: ["烏龜", "海龜", "龜類"],
      coreTermsEn: ["turtle", "tortoise", "Testudines"],
      relatedTermsZh: ["棲地", "保育", "外來種", "壽命", "生理適應", "塑膠污染"],
      relatedTermsEn: ["habitat", "conservation", "invasive species", "longevity", "physiological adaptation", "plastic pollution"],
      dimensionTermsZh: ["族群監測", "保育管理", "環境壓力", "人為干擾"],
      dimensionTermsEn: ["population monitoring", "conservation management", "environmental stress", "human disturbance"],
      excludeTerms: ["忍者龜", "turtle trading", "logo turtle", "玩具"],
    };
  }
  if (/獵豹|cheetah/.test(topicText)) {
    return {
      coreTermsZh: ["獵豹"],
      coreTermsEn: ["cheetah", "Acinonyx jubatus"],
      relatedTermsZh: ["速度演化", "棲地破碎化", "保育", "遺傳多樣性", "運動生理"],
      relatedTermsEn: ["speed evolution", "habitat fragmentation", "conservation", "genetic diversity", "locomotion physiology"],
      dimensionTermsZh: ["身體結構", "族群脆弱性", "疾病風險", "人獸衝突"],
      dimensionTermsEn: ["anatomical adaptation", "population vulnerability", "disease risk", "human-wildlife conflict"],
      excludeTerms: ["卡通", "球隊 logo", "貼圖", "遊戲"],
    };
  }
  if (/負離子|negative ions?|air ions?|ionizer/.test(topicText)) {
    return {
      coreTermsZh: ["負離子", "空氣離子"],
      coreTermsEn: ["negative ions", "air ions"],
      relatedTermsZh: ["空氣品質", "濃度測量", "健康宣稱", "產品迷思", "室內環境"],
      relatedTermsEn: ["air quality", "concentration measurement", "health claims", "indoor environment", "ionizer"],
      dimensionTermsZh: ["物理定義", "測量方法", "證據評估", "應用限制"],
      dimensionTermsEn: ["physical definition", "measurement methods", "evidence review", "application limits"],
      excludeTerms: ["廣告", "購物", "產品推薦", "beauty device", "purifier sale"],
    };
  }
  if (/手機成癮|智慧型手機成癮|smartphone addiction|problematic smartphone use/.test(topicText)) {
    return {
      coreTermsZh: ["手機成癮", "智慧型手機使用"],
      coreTermsEn: ["smartphone addiction", "problematic smartphone use"],
      relatedTermsZh: ["睡眠品質", "注意力", "社群媒體", "學業表現", "焦慮", "憂鬱"],
      relatedTermsEn: ["sleep quality", "attention", "social media", "academic performance", "anxiety", "depression"],
      dimensionTermsZh: ["青少年", "家庭因素", "學校介入", "行為風險"],
      dimensionTermsEn: ["adolescents", "family factors", "school intervention", "behavioral risk"],
      excludeTerms: ["短影音推薦", "購機優惠", "手機開箱", "brand campaign"],
    };
  }
  if (/氣候變遷|climate change|global warming/.test(topicText)) {
    return {
      coreTermsZh: ["氣候變遷", "全球暖化"],
      coreTermsEn: ["climate change", "global warming"],
      relatedTermsZh: ["極端天氣", "公共健康", "減碳政策", "能源轉型", "災害風險", "台灣"],
      relatedTermsEn: ["extreme weather", "public health", "decarbonization policy", "energy transition", "disaster risk", "Taiwan"],
      dimensionTermsZh: ["弱勢族群", "在地資料", "政策回應", "國際比較"],
      dimensionTermsEn: ["vulnerable groups", "local data", "policy response", "international comparison"],
      excludeTerms: ["迷因", "政治口水", "品牌活動", "周邊商品"],
    };
  }
  if (/水餃|餃子|dumpling/.test(topicText)) {
    return {
      coreTermsZh: ["水餃", "餃子"],
      coreTermsEn: ["dumpling", "frozen dumpling"],
      relatedTermsZh: ["飲食文化", "營養", "食品標示", "冷凍水餃", "鈉含量", "食品安全"],
      relatedTermsEn: ["food culture", "nutrition", "food labeling", "frozen dumpling", "sodium content", "food safety"],
      dimensionTermsZh: ["台灣飲食", "加工食品", "消費比較", "料理方式"],
      dimensionTermsEn: ["Taiwan food culture", "processed food", "consumer comparison", "cooking methods"],
      excludeTerms: ["遊戲", "貼圖", "logo", "餐廳廣告", "外送折扣"],
    };
  }
  if (/可樂|汽水|含糖飲料|cola|soft drink|sugar-sweetened beverage/.test(topicText)) {
    return {
      coreTermsZh: ["可樂", "碳酸飲料", "含糖飲料"],
      coreTermsEn: ["cola", "soft drink", "sugar-sweetened beverage"],
      relatedTermsZh: ["含糖量", "健康影響", "無糖可樂", "成分", "環境包裝", "品牌廣告"],
      relatedTermsEn: ["sugar intake", "health effects", "diet cola", "ingredients", "packaging waste", "brand advertising"],
      dimensionTermsZh: ["青少年攝取", "肥胖風險", "牙齒健康", "公共衛生"],
      dimensionTermsEn: ["adolescent intake", "obesity risk", "dental health", "public health"],
      excludeTerms: ["廣告片", "折扣促銷", "收藏瓶", "logo", "周邊商品"],
    };
  }
  return null;
}

function domainDimensionTerms(domain: TopicExpansionDomain): {
  zh: string[];
  en: string[];
} {
  switch (domain) {
    case "biology_ecology":
      return {
        zh: ["生態角色", "棲地分布", "族群變化", "保育管理", "健康與安全"],
        en: ["ecological role", "habitat distribution", "population change", "conservation management", "health and safety"],
      };
    case "health_medical":
      return {
        zh: ["作用機制", "健康影響", "風險族群", "介入策略", "證據品質"],
        en: ["mechanism", "health effects", "risk groups", "intervention strategy", "evidence quality"],
      };
    case "natural_science":
    case "concept_feature":
      return {
        zh: ["定義與測量", "形成機制", "應用限制", "證據評估", "常見迷思"],
        en: ["definition and measurement", "formation mechanism", "application limits", "evidence review", "common misconceptions"],
      };
    case "experiment_design":
      return {
        zh: ["自變因", "依變因", "控制變因", "量測方法", "誤差分析"],
        en: ["independent variable", "dependent variable", "control variables", "measurement methods", "error analysis"],
      };
    case "social_policy":
      return {
        zh: ["現況趨勢", "政策回應", "社會差異", "公共健康", "台灣在地資料"],
        en: ["current trends", "policy response", "social disparity", "public health", "Taiwan local data"],
      };
    case "education_psychology":
      return {
        zh: ["睡眠", "注意力", "學習表現", "家庭因素", "介入策略"],
        en: ["sleep", "attention", "academic performance", "family factors", "intervention strategies"],
      };
    case "technology_engineering":
      return {
        zh: ["技術原理", "應用情境", "風險限制", "效能比較", "社會影響"],
        en: ["technical principles", "applications", "risks and limits", "performance comparison", "social impact"],
      };
    case "humanities_culture":
      return {
        zh: ["歷史背景", "文本分析", "文化意義", "社會脈絡", "觀點比較"],
        en: ["historical context", "textual analysis", "cultural meaning", "social context", "comparative perspectives"],
      };
    case "unknown":
    default:
      return {
        zh: ["研究問題", "證據類型", "可驗證資料"],
        en: ["research questions", "evidence types", "verifiable data"],
      };
  }
}

export function buildKeywordExpansion(
  context: ExpansionPlanningContext,
): TopicExpansionKeywordExpansion {
  const specialization = matchTopicSpecialization(context);
  const dimensionDefaults = domainDimensionTerms(context.topicDomain);
  const canonicalZh = [
    context.understood.originalTopic,
    ...context.understood.canonicalTerms,
    ...context.understood.aliases,
  ].filter((term): term is string => Boolean(term && /[\u3400-\u9fff]/.test(term)));
  const canonicalEn = englishTopicCandidates(context);
  const angleZh = context.understood.researchAngles.flatMap((angle) => angle.zhQueries);
  const angleEn = context.understood.researchAngles.flatMap((angle) => angle.enQueries);

  return {
    coreTermsZh: uniqueStrings([
      ...canonicalZh,
      ...(specialization?.coreTermsZh ?? []),
    ]).slice(0, 5),
    coreTermsEn: uniqueStrings([
      ...canonicalEn,
      ...(specialization?.coreTermsEn ?? []),
    ]).slice(0, 5),
    relatedTermsZh: uniqueStrings([
      ...(specialization?.relatedTermsZh ?? []),
      ...context.understood.coreConcepts.filter((term) => /[\u3400-\u9fff]/.test(term)),
      ...angleZh,
    ])
      .filter((term) => !hasForbiddenGenericText(term))
      .slice(0, 10),
    relatedTermsEn: uniqueStrings([
      ...(specialization?.relatedTermsEn ?? []),
      ...context.understood.coreConcepts.filter((term) => /[A-Za-z]/.test(term)),
      ...angleEn,
    ])
      .filter((term) => !hasForbiddenGenericText(term))
      .slice(0, 10),
    dimensionTermsZh: uniqueStrings([
      ...(specialization?.dimensionTermsZh ?? []),
      ...dimensionDefaults.zh,
    ]).slice(0, 8),
    dimensionTermsEn: uniqueStrings([
      ...(specialization?.dimensionTermsEn ?? []),
      ...dimensionDefaults.en,
    ]).slice(0, 8),
    excludeTerms: uniqueStrings([
      ...defaultExcludeTerms(context),
      ...(specialization?.excludeTerms ?? []),
    ]).slice(0, 8),
  };
}

function buildQueryPlan(
  context: ExpansionPlanningContext,
  seedZh: string[],
  seedEn: string[],
  keywordExpansion: TopicExpansionKeywordExpansion,
): TopicExpansionQueryPlan {
  const englishBase =
    preferredEnglishTopic(context) ||
    keywordExpansion.coreTermsEn[0] ||
    keywordExpansion.relatedTermsEn[0] ||
    "";
  const primaryQueriesZh = uniqueStrings([
    ...seedZh,
    ...makeZhQueries(
      context.understood.originalTopic,
      keywordExpansion.dimensionTermsZh.slice(0, 2),
    ),
  ]).slice(0, 4);
  const secondaryQueriesZh = uniqueStrings([
    ...makeZhQueries(
      context.understood.originalTopic,
      keywordExpansion.relatedTermsZh.slice(0, 3),
    ),
  ]).slice(0, 4);
  const primaryQueriesEn = uniqueStrings([
    ...seedEn,
    ...makeEnQueries(englishBase, keywordExpansion.dimensionTermsEn.slice(0, 2)),
  ]).slice(0, 4);
  const secondaryQueriesEn = uniqueStrings([
    ...makeEnQueries(englishBase, keywordExpansion.relatedTermsEn.slice(0, 3)),
  ]).slice(0, 4);
  return {
    primaryQueriesZh,
    secondaryQueriesZh,
    primaryQueriesEn:
      primaryQueriesEn.length > 0
        ? primaryQueriesEn
        : uniqueStrings([
            ...makeEnQueries(englishBase, keywordExpansion.dimensionTermsEn.slice(0, 3)),
            ...keywordExpansion.relatedTermsEn.slice(0, 3),
          ]).slice(0, 4),
    secondaryQueriesEn:
      secondaryQueriesEn.length > 0
        ? secondaryQueriesEn
        : uniqueStrings([
            ...keywordExpansion.relatedTermsEn.slice(0, 4),
          ]).slice(0, 4),
    excludedDriftTerms: keywordExpansion.excludeTerms.slice(0, 8),
  };
}

function createCandidatePlan(input: {
  id: string;
  context: ExpansionPlanningContext;
  keywordExpansion: TopicExpansionKeywordExpansion;
  title: string;
  angle: string;
  researchQuestion: string;
  scope: string;
  sourceTypes: string[];
  expectedEvidence: string[];
  evidenceNeed: string[];
  seedKeywords: string[];
  queryPlan: TopicExpansionQueryPlan;
  priority: number;
  diversityKey: string;
}): CandidateTopicPlan {
  return {
    id: input.id,
    title: input.title,
    domain: input.context.topicDomain,
    angle: input.angle,
    researchQuestion: input.researchQuestion,
    sourceTypes: uniqueStrings(input.sourceTypes).slice(0, 5),
    expectedEvidence: uniqueStrings(input.expectedEvidence).slice(0, 5),
    seedKeywords: uniqueStrings(input.seedKeywords).slice(0, 8),
    priority: input.priority,
    category: directionCategoryLabel(input.context.topicDomain),
    scope: input.scope,
    queryPlan: input.queryPlan,
    excludeTerms: input.keywordExpansion.excludeTerms.slice(0, 8),
    evidenceNeed: uniqueStrings(input.evidenceNeed).slice(0, 5),
    diversityKey: input.diversityKey,
    broadSuggestion: input.context.inputKind === "too_broad",
  };
}

function lensRejectReason(
  context: ExpansionPlanningContext,
  lensId: string,
  candidate: CandidateTopicPlan,
): string | null {
  switch (lensId) {
    case "definition_measurement":
      return context.entityType === "scientific_concept"
        ? null
        : "definition_measurement_only_for_scientific_concept";
    case "health_claims":
      return context.entityType === "scientific_concept" ||
        context.entityType === "health_topic"
        ? null
        : "health_claims_only_for_health_or_scientific_concept";
    case "mechanism_process": {
      if (context.entityType !== "animal" && context.entityType !== "food") {
        return null;
      }
      const naturalMechanismCue =
        /機制|過程|費洛蒙|溝通|代謝|適應|pathway|mechanism|communication|metabolism|adaptation/i;
      return naturalMechanismCue.test(
        `${candidate.title} ${candidate.researchQuestion}`,
      )
        ? null
        : `${context.entityType}_topics_should_not_use_generic_mechanism_process`;
    }
    default:
      return null;
  }
}

function buildCandidatePool(
  context: ExpansionPlanningContext,
  keywordExpansion: TopicExpansionKeywordExpansion,
): CandidatePoolDiagnostics {
  const specialized = buildSpecializedCandidates(context, keywordExpansion) ?? [];
  const generic = buildGenericCandidates(context, keywordExpansion);
  const rejectedLensIds: string[] = [];
  const lensRejectReasons: Record<string, string> = {};
  const candidates = [...specialized, ...generic].filter((candidate) => {
    const reason = lensRejectReason(context, candidate.diversityKey, candidate);
    if (!reason) return true;
    rejectedLensIds.push(candidate.diversityKey);
    lensRejectReasons[candidate.diversityKey] = reason;
    return false;
  });

  if (context.entityType !== "scientific_concept") {
    rejectedLensIds.push("definition_measurement");
    lensRejectReasons.definition_measurement ??=
      "definition_measurement_only_for_scientific_concept";
  }
  if (
    context.entityType !== "scientific_concept" &&
    context.entityType !== "health_topic"
  ) {
    rejectedLensIds.push("health_claims");
    lensRejectReasons.health_claims ??=
      "health_claims_only_for_health_or_scientific_concept";
  }

  return {
    candidates: Array.from(
      new Map(candidates.map((candidate) => [candidate.id, candidate] as const)).values(),
    ),
    rejectedLensIds: uniqueStrings(rejectedLensIds),
    lensRejectReasons,
  };
}

function buildSpecializedCandidates(
  context: ExpansionPlanningContext,
  keywordExpansion: TopicExpansionKeywordExpansion,
): CandidateTopicPlan[] | null {
  const topicText = `${context.understood.originalTopic} ${context.englishTopic}`.toLowerCase();
  const evidence = defaultExpectedEvidence(context.topicDomain);
  const topic = context.understood.originalTopic;
  const english = preferredEnglishTopic(context);

  if (/螞蟻|ant\b|ants\b/.test(topicText)) {
    return [
      createCandidatePlan({
        id: "bio-ant-1",
        context,
        keywordExpansion,
        title: `${topic}的社會分工與群體行為`,
        angle: "社會分工與群體行為",
        researchQuestion: `${topic}如何透過工蟻、兵蟻或蟻后分工，維持群體合作與資源分配？`,
        scope: "聚焦社會分工、合作行為、巢內角色與資源分配。",
        sourceTypes: ["昆蟲行為研究", "生態學研究", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["群體分工", "合作行為", "巢內角色", "資源分配"],
        seedKeywords: ["社會分工", "群體行為", "ant colony behavior"],
        queryPlan: buildQueryPlan(context, ["螞蟻 社會分工 群體行為", "螞蟻 工蟻 蟻后 合作", "螞蟻 群體 資源分配"], ["ant colony social organization", "ant worker queen division of labor", "ant collective behavior resource allocation"], keywordExpansion),
        priority: 99,
        diversityKey: "behavior_adaptation",
      }),
      createCandidatePlan({
        id: "bio-ant-2",
        context,
        keywordExpansion,
        title: `${topic}在生態系中的角色與土壤環境影響`,
        angle: "生態角色與環境影響",
        researchQuestion: `${topic}是否會透過築巢、搬運有機物與捕食互動，改變土壤環境與周邊生態系？`,
        scope: "聚焦土壤擾動、養分循環、捕食互動與生態角色。",
        sourceTypes: ["生態研究", "土壤環境研究", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["土壤變化", "養分循環", "築巢行為", "捕食互動"],
        seedKeywords: ["生態角色", "土壤環境", "ant soil ecology"],
        queryPlan: buildQueryPlan(context, ["螞蟻 生態角色 土壤環境", "螞蟻 築巢 養分循環", "螞蟻 捕食 生態系"], ["ant ecological role soil environment", "ant nesting nutrient cycling", "ant predation ecosystem"], keywordExpansion),
        priority: 97,
        diversityKey: "ecology_role",
      }),
      createCandidatePlan({
        id: "bio-ant-3",
        context,
        keywordExpansion,
        title: `入侵${topic}對本土生態與人類生活的影響`,
        angle: "入侵風險與管理",
        researchQuestion: `入侵${topic}是否會透過競爭、叮咬、居家干擾或農業衝擊，影響本土生態與人類生活？`,
        scope: "聚焦入侵種擴散、競爭壓力、居家困擾、農業與管理策略。",
        sourceTypes: ["入侵種研究", "政府或機構資料", "環境管理報告"],
        expectedEvidence: evidence,
        evidenceNeed: ["入侵分布", "競爭影響", "居家干擾", "管理策略"],
        seedKeywords: ["入侵種", "管理策略", "invasive ants"],
        queryPlan: buildQueryPlan(context, ["入侵螞蟻 本土生態 人類生活", "螞蟻 入侵種 管理", "螞蟻 居家 農業 影響"], ["invasive ants native ecology human impact", "ant invasive species management", "ant household agriculture impact"], keywordExpansion),
        priority: 96,
        diversityKey: "invasive_management",
      }),
      createCandidatePlan({
        id: "bio-ant-4",
        context,
        keywordExpansion,
        title: `${topic}覓食路徑與費洛蒙溝通機制`,
        angle: "覓食與溝通機制",
        researchQuestion: `${topic}如何利用費洛蒙訊號建立覓食路徑，並在群體中傳遞資源位置資訊？`,
        scope: "聚焦費洛蒙訊號、路徑形成、決策協調與群體溝通。",
        sourceTypes: ["昆蟲行為研究", "實驗生物學", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["費洛蒙訊號", "覓食路徑", "群體溝通", "行為實驗"],
        seedKeywords: ["費洛蒙", "覓食路徑", "pheromone communication"],
        queryPlan: buildQueryPlan(context, ["螞蟻 費洛蒙 覓食路徑", "螞蟻 溝通機制 行為", "螞蟻 群體 決策"], ["ant pheromone communication foraging trail", "ant communication mechanism behavior", "ant collective decision making"], keywordExpansion),
        priority: 95,
        diversityKey: "mechanism_process",
      }),
    ];
  }

  if (/水母|jellyfish/.test(topicText)) {
    return [
      createCandidatePlan({
        id: "bio-jellyfish-1",
        context,
        keywordExpansion,
        title: "水母大量繁殖與海洋生態變化",
        angle: "大量繁殖與生態影響",
        researchQuestion: "水母大量繁殖是否會改變海洋食物網、優勢物種組成與近岸生態穩定性？",
        scope: "以近岸海域、海水升溫、優養化與食物網變化為主要研究範圍。",
        sourceTypes: ["海洋生態研究", "長期監測資料", "學術論文", "環境監測報告"],
        expectedEvidence: evidence,
        evidenceNeed: ["水母族群變化", "海洋溫度資料", "食物網變化", "近岸海域監測"],
        seedKeywords: ["水母", "大量繁殖", "海洋生態", "jellyfish bloom"],
        queryPlan: buildQueryPlan(context, ["水母 大量繁殖 海洋生態 影響", "水母 海洋暖化 食物網", "水母 食物鏈 海洋 生態"], ["jellyfish bloom marine ecosystem impact", "jellyfish ocean warming food web", "jellyfish bloom food web"], keywordExpansion),
        priority: 98,
        diversityKey: "ecology",
      }),
      createCandidatePlan({
        id: "bio-jellyfish-2",
        context,
        keywordExpansion,
        title: "水母與海洋暖化、優養化之間的關聯",
        angle: "環境變遷驅動因子",
        researchQuestion: "海洋暖化與優養化是否會提高水母大量繁殖的機率與持續時間？",
        scope: "聚焦環境變項與水母 bloom 之間的關聯。",
        sourceTypes: ["海洋監測資料", "環境研究", "期刊論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["海水溫度變化", "營養鹽資料", "水母 bloom 時間序列"],
        seedKeywords: ["海洋暖化", "優養化", "jellyfish bloom"],
        queryPlan: buildQueryPlan(context, ["水母 海洋暖化 優養化", "水母 bloom 環境因子", "水母 海水溫度 變化"], ["jellyfish bloom ocean warming eutrophication", "jellyfish bloom environmental drivers", "jellyfish sea temperature variation"], keywordExpansion),
        priority: 92,
        diversityKey: "environment",
      }),
      createCandidatePlan({
        id: "bio-jellyfish-3",
        context,
        keywordExpansion,
        title: "水母螫傷對人體健康與海岸安全的影響",
        angle: "健康與公共安全",
        researchQuestion: "水母螫傷在不同海岸活動情境下會造成哪些健康風險與公共安全問題？",
        scope: "聚焦海岸活動、螫傷案例、急救處置與公共安全。",
        sourceTypes: ["公共衛生資料", "海岸安全通報", "醫學研究", "政府機構資料"],
        expectedEvidence: evidence,
        evidenceNeed: ["螫傷案例統計", "急救處置", "海岸安全通報", "健康風險資料"],
        seedKeywords: ["水母螫傷", "公共安全", "健康風險"],
        queryPlan: buildQueryPlan(context, ["水母 螫傷 健康風險", "水母 公共安全 海岸", "水母 急救 處置"], ["jellyfish sting public health risk", "jellyfish coastal safety incidents", "jellyfish sting first aid evidence"], keywordExpansion),
        priority: 95,
        diversityKey: "health",
      }),
      createCandidatePlan({
        id: "bio-jellyfish-4",
        context,
        keywordExpansion,
        title: "水母對漁業資源與沿海產業的衝擊",
        angle: "漁業與產業影響",
        researchQuestion: "水母數量增加是否會影響漁獲量、漁具運作與沿海觀光或產業活動？",
        scope: "聚焦漁業資源、漁網堵塞、沿海觀光與產業風險。",
        sourceTypes: ["漁業資料", "產業報告", "政府統計", "海洋研究"],
        expectedEvidence: evidence,
        evidenceNeed: ["漁獲量資料", "漁具受損案例", "沿海產業衝擊", "觀光風險資料"],
        seedKeywords: ["漁業影響", "沿海產業", "jellyfish fisheries impact"],
        queryPlan: buildQueryPlan(context, ["水母 漁業 影響 海洋暖化", "水母 漁獲量 產業 衝擊", "水母 沿海觀光 風險"], ["jellyfish fisheries impact ocean warming", "jellyfish catch industry disruption", "jellyfish coastal tourism risk"], keywordExpansion),
        priority: 94,
        diversityKey: "industry",
      }),
      createCandidatePlan({
        id: "bio-jellyfish-5",
        context,
        keywordExpansion,
        title: "水母在食物鏈與海洋環境指標中的角色",
        angle: "食物鏈與環境指標",
        researchQuestion: "水母能否作為海洋環境變遷或食物網改變的指標物種？",
        scope: "聚焦食物鏈位置、優勢物種轉變與環境指標價值。",
        sourceTypes: ["生態研究", "海洋資料庫", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["食物鏈資料", "優勢物種變化", "指標物種研究"],
        seedKeywords: ["食物鏈", "環境指標", "marine ecosystem"],
        queryPlan: buildQueryPlan(context, ["水母 食物鏈 海洋 生態", "水母 環境指標 海洋", "水母 生態角色"], ["jellyfish food web marine ecology", "jellyfish environmental indicator", "jellyfish ecological role"], keywordExpansion),
        priority: 90,
        diversityKey: "indicator",
      }),
    ];
  }

  if (/烏龜|海龜|陸龜|turtle|tortoise/.test(topicText)) {
    return [
      createCandidatePlan({
        id: "bio-turtle-1",
        context,
        keywordExpansion,
        title: "烏龜棲地需求、族群監測與保育管理",
        angle: "棲地與保育",
        researchQuestion: "不同棲地條件如何影響烏龜的族群分布、繁殖成功率與保育管理策略？",
        scope: "聚焦濕地、河口、海岸棲地與族群監測。",
        sourceTypes: ["生態研究", "保育報告", "政府調查資料", "環境監測資料"],
        expectedEvidence: evidence,
        evidenceNeed: ["棲地分布", "族群監測", "保育管理資料", "繁殖成功率"],
        seedKeywords: ["烏龜", "棲地", "保育", "turtle habitat"],
        queryPlan: buildQueryPlan(context, ["烏龜 棲地 保育 族群", "海龜 棲地 監測", "烏龜 繁殖 成功率"], ["turtle habitat conservation population monitoring", "sea turtle habitat management", "turtle breeding success"], keywordExpansion),
        priority: 98,
        diversityKey: "habitat",
      }),
      createCandidatePlan({
        id: "bio-turtle-2",
        context,
        keywordExpansion,
        title: "外來龜種對本土烏龜族群與棲地的影響",
        angle: "外來種與競爭壓力",
        researchQuestion: "外來龜種是否會透過競爭、疾病傳播或放生行為影響本土烏龜族群與棲地？",
        scope: "聚焦巴西龜、疾病傳播、競爭關係與放生問題。",
        sourceTypes: ["生態保育研究", "野生動物管理", "政府調查資料"],
        expectedEvidence: evidence,
        evidenceNeed: ["外來種分布", "競爭關係", "疾病傳播", "放生紀錄"],
        seedKeywords: ["外來種", "巴西龜", "turtle invasive species"],
        queryPlan: buildQueryPlan(context, ["外來種 烏龜 巴西龜 本土生態", "龜類 競爭 疾病 放生", "烏龜 外來種 棲地"], ["invasive turtle red-eared slider native turtle impact", "turtle competition disease transmission", "turtle invasive species habitat"], keywordExpansion),
        priority: 95,
        diversityKey: "invasive",
      }),
      createCandidatePlan({
        id: "bio-turtle-3",
        context,
        keywordExpansion,
        title: "塑膠污染、漁業活動與人為干擾對烏龜生存的影響",
        angle: "污染與人為干擾",
        researchQuestion: "塑膠污染、漁業活動與人為干擾是否會顯著提高烏龜受傷、誤食或死亡風險？",
        scope: "聚焦塑膠攝食、纏繞、漁業活動與海岸干擾。",
        sourceTypes: ["海洋保育研究", "野生動物保護資料", "風險評估"],
        expectedEvidence: evidence,
        evidenceNeed: ["塑膠攝食", "纏繞案例", "死亡風險", "漁業干擾資料"],
        seedKeywords: ["塑膠污染", "人為干擾", "sea turtle entanglement"],
        queryPlan: buildQueryPlan(context, ["烏龜 塑膠污染 人為干擾", "海龜 漁業 纏繞 攝食", "烏龜 死亡 風險"], ["turtle plastic pollution human disturbance", "sea turtle fisheries entanglement ingestion", "turtle mortality risk"], keywordExpansion),
        priority: 94,
        diversityKey: "pollution",
      }),
      createCandidatePlan({
        id: "bio-turtle-4",
        context,
        keywordExpansion,
        title: "烏龜壽命、生理適應與環境耐受能力",
        angle: "生理適應",
        researchQuestion: "烏龜的壽命、生理特徵與環境耐受能力如何支撐其長期存活？",
        scope: "聚焦壽命、生理適應、代謝與環境耐受。",
        sourceTypes: ["動物生理研究", "比較生物學", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["壽命研究", "生理適應", "代謝資料", "環境耐受能力"],
        seedKeywords: ["壽命", "生理適應", "turtle longevity"],
        queryPlan: buildQueryPlan(context, ["烏龜 壽命 生理適應", "海龜 代謝 環境耐受", "龜類 長壽 生理"], ["turtle longevity physiological adaptation", "sea turtle metabolism environmental tolerance", "turtle long lifespan physiology"], keywordExpansion),
        priority: 89,
        diversityKey: "physiology",
      }),
    ];
  }

  if (/獵豹|cheetah/.test(topicText)) {
    return [
      createCandidatePlan({
        id: "bio-cheetah-1",
        context,
        keywordExpansion,
        title: "獵豹速度演化與身體結構適應",
        angle: "速度演化與構造",
        researchQuestion: "獵豹的高速奔跑能力與哪些骨骼、肌肉、呼吸或尾部穩定結構適應有關？",
        scope: "聚焦速度演化、捕食策略與運動生理。",
        sourceTypes: ["動物生理研究", "演化生物學", "比較解剖研究", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["骨骼適應", "肌肉結構", "運動生理", "速度演化"],
        seedKeywords: ["獵豹", "速度演化", "cheetah anatomy"],
        queryPlan: buildQueryPlan(context, ["獵豹 速度演化 身體結構", "獵豹 運動生理 捕食", "獵豹 骨骼 肌肉 適應"], ["cheetah speed evolution anatomy", "cheetah locomotion physiology", "cheetah skeletal muscular adaptation"], keywordExpansion),
        priority: 99,
        diversityKey: "speed",
      }),
      createCandidatePlan({
        id: "bio-cheetah-2",
        context,
        keywordExpansion,
        title: "棲地破碎化對獵豹族群保育的影響",
        angle: "棲地與保育",
        researchQuestion: "棲地破碎化與人類土地利用變化是否會降低獵豹的遷移能力、捕食效率與保育成效？",
        scope: "聚焦棲地破碎化、遷移廊道與人獸衝突。",
        sourceTypes: ["保育研究", "棲地監測", "GIS 或遷移資料", "政府或 NGO 報告"],
        expectedEvidence: evidence,
        evidenceNeed: ["棲地破碎化", "遷移廊道", "人獸衝突", "保育成效"],
        seedKeywords: ["棲地破碎化", "保育", "cheetah conservation"],
        queryPlan: buildQueryPlan(context, ["獵豹 棲地破碎化 保育", "獵豹 遷移 廊道 人獸衝突", "獵豹 土地利用 影響"], ["cheetah habitat fragmentation conservation", "cheetah corridor human conflict", "cheetah land use impact"], keywordExpansion),
        priority: 97,
        diversityKey: "habitat",
      }),
      createCandidatePlan({
        id: "bio-cheetah-3",
        context,
        keywordExpansion,
        title: "獵豹低遺傳多樣性與疾病風險",
        angle: "族群遺傳與脆弱性",
        researchQuestion: "獵豹偏低的遺傳多樣性是否會提高疾病風險、繁殖限制或族群脆弱性？",
        scope: "聚焦遺傳多樣性、疾病風險、繁殖與保育介入。",
        sourceTypes: ["遺傳學研究", "疾病監測資料", "保育生物學", "學術論文"],
        expectedEvidence: evidence,
        evidenceNeed: ["遺傳多樣性", "疾病風險", "繁殖成功率", "族群脆弱性"],
        seedKeywords: ["遺傳多樣性", "疾病風險", "population genetics"],
        queryPlan: buildQueryPlan(context, ["獵豹 遺傳多樣性 疾病風險", "獵豹 族群遺傳 繁殖", "獵豹 保育 脆弱性"], ["cheetah genetic diversity disease risk", "cheetah population genetics reproduction", "cheetah conservation vulnerability"], keywordExpansion),
        priority: 96,
        diversityKey: "genetics",
      }),
    ];
  }

  if (/水餃|餃子|dumpling/.test(topicText)) {
    return [
      createCandidatePlan({
        id: "food-dumpling-1",
        context,
        keywordExpansion,
        title: "水餃的營養組成、鈉含量與飲食健康",
        angle: "營養與健康",
        researchQuestion: "不同類型水餃的營養組成與鈉含量，是否會影響日常飲食健康評估？",
        scope: "聚焦熱量、蛋白質、脂肪、鈉含量與加工程度。",
        sourceTypes: ["食品營養資料", "食品科學研究", "政府食品資料庫"],
        expectedEvidence: defaultExpectedEvidence("health_medical"),
        evidenceNeed: ["營養標示", "鈉含量", "熱量比較", "食品資料庫"],
        seedKeywords: ["營養", "鈉含量", "dumpling nutrition"],
        queryPlan: buildQueryPlan(context, ["水餃 營養 鈉含量", "冷凍水餃 熱量 蛋白質", "水餃 食品標示"], ["dumpling nutrition sodium", "frozen dumpling calories protein", "dumpling food labeling"], keywordExpansion),
        priority: 97,
        diversityKey: "nutrition",
      }),
      createCandidatePlan({
        id: "food-dumpling-2",
        context,
        keywordExpansion,
        title: "冷凍水餃的食品標示、加工特性與消費選擇",
        angle: "加工食品與標示",
        researchQuestion: "冷凍水餃的食品標示、加工特性與保存方式，如何影響消費者判讀與選擇？",
        scope: "聚焦標示制度、成分表、保存方式與消費資訊。",
        sourceTypes: ["食品標示規範", "政府機構資料", "食品加工研究"],
        expectedEvidence: defaultExpectedEvidence("health_medical"),
        evidenceNeed: ["食品標示規範", "成分表", "加工保存資料", "消費資訊"],
        seedKeywords: ["食品標示", "冷凍水餃", "food labeling"],
        queryPlan: buildQueryPlan(context, ["冷凍水餃 食品標示", "水餃 成分表 保存", "加工食品 水餃"], ["frozen dumpling food labeling", "dumpling ingredient label storage", "processed dumpling food"], keywordExpansion),
        priority: 95,
        diversityKey: "labeling",
      }),
      createCandidatePlan({
        id: "food-dumpling-3",
        context,
        keywordExpansion,
        title: "水餃的飲食文化、地方差異與台灣日常飲食意義",
        angle: "飲食文化",
        researchQuestion: "水餃在台灣飲食文化與地方差異中，如何呈現家庭料理、節慶與日常飲食的意義？",
        scope: "聚焦台灣飲食文化、地方差異與日常消費。",
        sourceTypes: ["飲食文化研究", "地方飲食文獻", "文化論述資料"],
        expectedEvidence: ["飲食文化研究", "地方差異紀錄", "台灣日常飲食資料", "歷史或文化文獻"],
        evidenceNeed: ["地方差異", "台灣飲食文化", "家庭料理", "節慶飲食"],
        seedKeywords: ["飲食文化", "台灣", "dumpling food culture"],
        queryPlan: buildQueryPlan(context, ["水餃 飲食文化 台灣", "餃子 地方差異 家庭料理", "水餃 節慶 日常飲食"], ["dumpling food culture Taiwan", "dumpling regional differences home cooking", "dumpling festival everyday food"], keywordExpansion),
        priority: 90,
        diversityKey: "culture",
      }),
      createCandidatePlan({
        id: "food-dumpling-4",
        context,
        keywordExpansion,
        title: "水餃原料、保存與食品安全風險",
        angle: "食品安全",
        researchQuestion: "水餃的原料來源、冷凍保存與製程，會帶來哪些食品安全與微生物風險？",
        scope: "聚焦原料來源、保存條件、微生物與食品安全風險。",
        sourceTypes: ["食品安全資料", "政府檢驗報告", "食品科學研究"],
        expectedEvidence: defaultExpectedEvidence("health_medical"),
        evidenceNeed: ["食品安全檢驗", "微生物風險", "保存條件", "原料來源"],
        seedKeywords: ["食品安全", "冷凍保存", "food safety"],
        queryPlan: buildQueryPlan(context, ["水餃 食品安全 冷凍保存", "水餃 微生物 風險", "水餃 原料 檢驗"], ["dumpling food safety frozen storage", "dumpling microbial risk", "dumpling ingredient inspection"], keywordExpansion),
        priority: 94,
        diversityKey: "safety",
      }),
    ];
  }

  if (/可樂|汽水|cola|soft drink/.test(topicText)) {
    return [
      createCandidatePlan({
        id: "beverage-cola-1",
        context,
        keywordExpansion,
        title: "可樂與含糖碳酸飲料對健康的影響",
        angle: "含糖飲料健康影響",
        researchQuestion: "長期攝取可樂或含糖碳酸飲料，是否會提高肥胖、代謝與牙齒健康風險？",
        scope: "聚焦含糖量、攝取頻率、肥胖風險與牙齒健康。",
        sourceTypes: ["公共衛生資料", "營養研究", "系統性回顧", "政府衛生機構資料"],
        expectedEvidence: defaultExpectedEvidence("health_medical"),
        evidenceNeed: ["含糖量", "肥胖風險", "牙齒健康", "流行病學研究"],
        seedKeywords: ["含糖飲料", "健康影響", "cola sugar intake"],
        queryPlan: buildQueryPlan(context, ["可樂 含糖飲料 健康影響", "可樂 肥胖 牙齒 健康", "碳酸飲料 代謝 風險"], ["cola sugar intake health effects", "soft drink obesity dental health", "sugar-sweetened beverage metabolic risk"], keywordExpansion),
        priority: 98,
        diversityKey: "health",
      }),
      createCandidatePlan({
        id: "beverage-cola-2",
        context,
        keywordExpansion,
        title: "無糖可樂與一般可樂的成分與風險比較",
        angle: "成分與比較",
        researchQuestion: "無糖可樂與一般可樂在糖分、甜味劑、咖啡因與健康風險上有何差異？",
        scope: "聚焦含糖量、人工甜味劑、咖啡因與比較研究。",
        sourceTypes: ["食品成分資料", "營養研究", "健康風險比較研究"],
        expectedEvidence: defaultExpectedEvidence("health_medical"),
        evidenceNeed: ["成分表", "甜味劑研究", "咖啡因", "風險比較"],
        seedKeywords: ["無糖可樂", "成分比較", "diet cola comparison"],
        queryPlan: buildQueryPlan(context, ["無糖可樂 一般可樂 比較", "可樂 成分 甜味劑 咖啡因", "可樂 糖分 比較"], ["diet cola comparison", "cola ingredients sweetener caffeine", "cola sugar content comparison"], keywordExpansion),
        priority: 96,
        diversityKey: "comparison",
      }),
      createCandidatePlan({
        id: "beverage-cola-3",
        context,
        keywordExpansion,
        title: "可樂品牌廣告、消費文化與青少年飲料選擇",
        angle: "品牌與消費文化",
        researchQuestion: "可樂品牌廣告與流行文化，是否會影響青少年對含糖飲料的偏好與消費行為？",
        scope: "聚焦品牌廣告、青少年消費、社會文化與選擇偏好。",
        sourceTypes: ["行銷研究", "消費者研究", "文化研究", "公共衛生資料"],
        expectedEvidence: ["品牌廣告資料", "青少年消費調查", "行銷研究", "文化分析"],
        evidenceNeed: ["品牌廣告", "青少年偏好", "消費行為", "文化影響"],
        seedKeywords: ["品牌廣告", "青少年", "cola advertising"],
        queryPlan: buildQueryPlan(context, ["可樂 品牌廣告 青少年", "可樂 消費文化 飲料選擇", "含糖飲料 廣告 偏好"], ["cola brand advertising adolescents", "cola consumer culture beverage choice", "soft drink advertising preference"], keywordExpansion),
        priority: 90,
        diversityKey: "culture",
      }),
      createCandidatePlan({
        id: "beverage-cola-4",
        context,
        keywordExpansion,
        title: "可樂包裝、回收與環境衝擊",
        angle: "包裝與環境",
        researchQuestion: "可樂相關包裝材料、一次性容器與回收制度，會帶來哪些環境衝擊？",
        scope: "聚焦鋁罐、塑膠瓶、回收制度與環境外部成本。",
        sourceTypes: ["環境報告", "回收統計", "永續研究", "政策資料"],
        expectedEvidence: ["回收統計", "包裝廢棄物資料", "環境衝擊研究", "政策報告"],
        evidenceNeed: ["包裝材料", "回收制度", "環境衝擊", "一次性容器資料"],
        seedKeywords: ["環境包裝", "回收", "packaging waste"],
        queryPlan: buildQueryPlan(context, ["可樂 包裝 回收 環境", "可樂 塑膠瓶 鋁罐 衝擊", "飲料 包裝 廢棄物"], ["cola packaging recycling environment", "cola plastic bottle aluminum can impact", "beverage packaging waste"], keywordExpansion),
        priority: 92,
        diversityKey: "environment",
      }),
    ];
  }

  return null;
}

function buildGenericCandidates(
  context: ExpansionPlanningContext,
  keywordExpansion: TopicExpansionKeywordExpansion,
): CandidateTopicPlan[] {
  const topic = context.understood.originalTopic;
  const evidence = defaultExpectedEvidence(context.topicDomain);
  const category = directionCategoryLabel(context.topicDomain);
  const english = preferredEnglishTopic(context);
  const create = (
    id: string,
    angle: string,
    title: string,
    researchQuestion: string,
    scope: string,
    sourceTypes: string[],
    expectedEvidence: string[],
    evidenceNeed: string[],
    zh: string[],
    en: string[],
    priority: number,
    diversityKey: string,
  ) =>
    createCandidatePlan({
      id,
      context,
      keywordExpansion,
      title,
      angle,
      researchQuestion,
      scope,
      sourceTypes,
      expectedEvidence,
      evidenceNeed,
      seedKeywords: [topic, ...keywordExpansion.relatedTermsZh.slice(0, 2), ...keywordExpansion.relatedTermsEn.slice(0, 2)],
      queryPlan: buildQueryPlan(context, zh, en, keywordExpansion),
      priority,
      diversityKey,
    });

  switch (context.topicDomain) {
    case "health_medical":
      return [
        create("health-1", category, `${topic}的暴露來源、接觸情境與風險族群`, `${topic}主要透過哪些暴露來源或接觸情境影響不同風險族群？`, "先界定暴露來源、接觸情境與風險族群。", ["公共衛生資料", "流行病學研究", "官方指引", "醫學期刊"], evidence, ["暴露來源", "風險族群", "接觸情境"], makeZhQueries(topic, ["暴露來源 風險族群", "接觸情境 健康", "公共衛生"]), makeEnQueries(english, ["exposure sources risk groups", "health effects public health", "epidemiology review"]), 95, "exposure"),
        create("health-2", category, `${topic}的作用機制、健康影響與主要症狀`, `${topic}透過哪些生理或毒理機制影響人體，並造成哪些主要健康結果？`, "聚焦作用機制、症狀與短期長期健康影響。", ["臨床研究", "毒理研究", "系統性回顧", "醫學資料庫"], evidence, ["作用機制", "健康結果", "症狀"], makeZhQueries(topic, ["作用機制 健康影響", "症狀 風險", "臨床 研究"]), makeEnQueries(english, ["mechanism health effects", "clinical symptoms review", "toxicology evidence"]), 96, "mechanism"),
        create("health-3", category, `${topic}的預防介入、指引建議與證據品質`, `${topic}有哪些有效的預防或介入方式，現有證據品質是否足以支持實務建議？`, "聚焦臨床指引、介入研究與證據強度評估。", ["臨床指引", "介入研究", "公共衛生政策", "系統性回顧"], evidence, ["介入方式", "臨床指引", "證據品質"], makeZhQueries(topic, ["預防 介入 指引", "證據品質 系統性回顧", "建議"]), makeEnQueries(english, ["prevention intervention guideline", "systematic review evidence quality", "public health recommendation"]), 94, "intervention"),
        create("health-4", category, `${topic}的成分、標示與攝取比較`, `${topic}在成分、標示或攝取量上有哪些差異，這些差異會如何影響健康判讀？`, "適用於食品、飲料與營養相關主題。", ["食品成分資料", "營養研究", "政府標示資料"], evidence, ["成分表", "攝取量", "標示差異"], makeZhQueries(topic, ["成分 標示 比較", "攝取量 健康", "營養 資料"]), makeEnQueries(english, ["ingredients labeling comparison", "intake health effects", "nutrition data"]), 90, "composition"),
      ];
    case "natural_science":
    case "concept_feature":
      return [
        create("science-1", category, `如何定義與觀察${topic}：核心指標與量測設計`, `${topic}在科學上如何定義、量測與判讀，其核心指標是什麼？`, "聚焦定義、儀器量測、指標解讀與可重現方法。", ["物理或化學研究", "量測方法論文", "技術手冊", "科學教材"], evidence, ["定義", "量測方法", "核心指標"], makeZhQueries(topic, ["定義 量測 方法", "科學 指標", "儀器 研究"]), makeEnQueries(english, ["definition measurement methods", "scientific indicators", "instrumentation research"]), 97, "definition_measurement"),
        create("science-2", category, `${topic}如何形成並產生作用：原理、應用與限制`, `${topic}由哪些物理或化學機制形成，在哪些應用情境下才具有研究意義？`, "連結形成原理、使用情境與限制條件。", ["基礎研究", "應用研究", "工程測試資料", "產業技術文件"], evidence, ["形成機制", "應用場景", "限制條件"], makeZhQueries(topic, ["形成機制 應用 限制", "物理 化學 原理", "應用情境"]), makeEnQueries(english, ["formation mechanism applications", "physical chemical principles", "use cases limitations"]), 95, "mechanism_process"),
        create("science-3", category, `${topic}的效果宣稱與常見迷思，哪些證據站得住腳`, `${topic}若涉及效果宣稱或常見迷思，現有證據是否足以支持這些說法？`, "聚焦實驗證據、系統性回顧與反證資料。", ["證據評估論文", "系統性回顧", "公共機構資料", "實驗研究"], evidence, ["健康宣稱", "反證資料", "證據評估"], makeZhQueries(topic, ["健康宣稱 證據", "迷思 科學", "效果 檢驗"]), makeEnQueries(english, ["health claims evidence", "scientific myths review", "effectiveness evaluation"]), 96, "health_claims"),
        create("science-4", category, `${topic}在不同環境與條件下會怎麼變化`, `${topic}在不同環境條件、空間或材料配置下，是否呈現可量測的差異？`, "聚焦條件差異與量測結果。", ["實驗研究", "環境監測", "比較研究"], evidence, ["條件差異", "環境變化", "量測結果"], makeZhQueries(topic, ["不同條件 測量", "環境 差異", "比較 研究"]), makeEnQueries(english, ["condition comparison measurement", "environmental variation", "comparative study"]), 89, "condition_variation"),
      ];
    case "social_policy":
      return [
        create("policy-1", category, `${topic}的現況趨勢與主要影響`, `${topic}目前呈現哪些趨勢，對環境、經濟或公共生活造成哪些可觀察影響？`, "先界定趨勢、影響面向與可取得的統計資料。", ["官方統計", "政策報告", "學術研究", "國際機構資料"], evidence, ["趨勢資料", "主要影響", "統計資料"], makeZhQueries(topic, ["台灣 現況 趨勢", "影響 統計", "公共生活"]), makeEnQueries(english, ["current trends impact", "policy statistics", "public effects"]), 97, "trends"),
        create("policy-2", category, `${topic}的政策回應、治理策略與台灣在地資料`, `面對 ${topic}，現有政策回應與治理策略是否有效，台灣在地資料顯示了什麼？`, "納入台灣在地資料、政策工具與治理成效。", ["政府資料", "政策評估報告", "地方統計", "學術研究"], evidence, ["政策工具", "治理成效", "台灣在地資料"], makeZhQueries(topic, ["台灣 政策 回應", "治理 策略", "在地資料"]), makeEnQueries(english, ["Taiwan policy response", "governance strategy", "local data assessment"]), 98, "policy"),
        create("policy-3", category, `${topic}的公共健康、弱勢影響與國際比較`, `${topic}是否對特定弱勢族群產生不成比例影響，國際比較又能提供哪些調整方向？`, "聚焦弱勢族群、公共健康與跨國比較。", ["國際比較報告", "公共政策研究", "社會影響分析"], evidence, ["弱勢族群", "公共健康", "國際比較"], makeZhQueries(topic, ["公共健康 弱勢族群 台灣", "國際比較", "社會影響"]), makeEnQueries(english, ["public health vulnerable populations", "international comparison", "social impact"]), 95, "equity"),
        create("policy-4", category, `${topic}的成因、驅動因素與未來調整方向`, `${topic}的成因或驅動因素是什麼，未來政策或社會調整方向應如何設計？`, "聚焦成因、驅動因素與調整方向。", ["學術論文", "政策研究", "國際報告"], evidence, ["驅動因素", "調整方向", "成因分析"], makeZhQueries(topic, ["成因 驅動因素", "未來調整 方向", "政策 設計"]), makeEnQueries(english, ["drivers causes", "policy adjustment directions", "policy design"]), 90, "drivers"),
      ];
    case "education_psychology":
      return [
        create("edu-1", category, `${topic}對睡眠、注意力與情緒的影響`, `${topic}是否會影響睡眠品質、注意力維持或情緒狀態？`, "聚焦睡眠、注意力、情緒與學生族群。", ["心理學研究", "教育研究", "公共衛生資料", "問卷研究"], evidence, ["睡眠品質", "注意力", "情緒狀態"], makeZhQueries(topic, ["睡眠 注意力 情緒", "青少年 影響", "心理 研究"]), makeEnQueries(english, ["sleep attention emotion", "adolescent effects", "psychology research"]), 98, "wellbeing"),
        create("edu-2", category, `${topic}與學習表現、社群媒體使用或成癮行為的關係`, `${topic}與學業表現、社群媒體使用強度或成癮行為之間是否存在顯著關聯？`, "聚焦使用時間、學習表現與成癮行為指標。", ["教育研究", "行為研究", "問卷調查", "系統性回顧"], evidence, ["學習表現", "使用強度", "成癮指標"], makeZhQueries(topic, ["學習表現 社群媒體", "成癮 行為 關係", "問卷 研究"]), makeEnQueries(english, ["academic performance social media", "addictive behavior association", "survey research"]), 97, "learning"),
        create("edu-3", category, `${topic}的家庭、學校因素與介入策略`, `哪些家庭、學校或介入策略能降低 ${topic} 帶來的不良影響？`, "聚焦家庭監管、學校環境與介入方案。", ["介入研究", "學校政策資料", "教育心理學研究"], evidence, ["家庭因素", "學校介入", "改善策略"], makeZhQueries(topic, ["家庭 學校 介入策略", "管理 教育", "改善 方案"]), makeEnQueries(english, ["family school intervention", "management education", "mitigation strategies"]), 94, "intervention"),
        create("edu-4", category, `${topic}與風險行為、安全與日常生活管理`, `${topic}是否會增加日常生活中的分心、安全或風險行為問題？`, "可延伸到交通安全、分心與生活管理。", ["行為研究", "公共安全資料", "公共衛生研究"], evidence, ["風險行為", "安全問題", "生活管理"], makeZhQueries(topic, ["風險行為 安全", "分心 影響", "日常生活 管理"]), makeEnQueries(english, ["risk behavior safety", "distraction effects", "daily life management"]), 88, "risk"),
      ];
    case "biology_ecology":
      return [
        create("bio-1", category, `${topic}在生態系中的角色與食物鏈關聯`, `${topic}是否會透過食物鏈位置、捕食關係或族群變化改變周遭生態系？`, "以棲地、食物網、族群變化與環境壓力為主要研究範圍。", ["生態研究", "物種資料庫", "保育機構資料", "長期監測報告"], evidence, ["食物鏈", "族群變化", "生態角色"], makeZhQueries(topic, ["食物鏈 生態角色", "生態系 影響", "族群 變化"]), makeEnQueries(english, ["food web ecology", "ecosystem impact", "population change"]), 95, "ecology_role"),
        create("bio-2", category, `${topic}的棲地分布、環境壓力與保育管理`, `${topic}的棲地條件與環境壓力是否會影響其分布、繁殖或存活率，並改變保育管理策略？`, "聚焦棲地分布、環境變遷、族群監測與保育壓力。", ["棲地調查", "保育報告", "地理或海洋監測資料", "學術論文"], evidence, ["棲地分布", "環境壓力", "族群監測"], makeZhQueries(topic, ["棲地 分布 族群", "環境壓力 保育", "監測 研究"]), makeEnQueries(english, ["habitat distribution", "environmental pressure conservation", "population monitoring"]), 94, "habitat_conservation"),
        create("bio-3", category, `${topic}的行為特徵、適應策略與資源利用`, `${topic}會如何透過行為特徵、適應策略或資源利用方式回應環境壓力？`, "聚焦覓食、活動節律、競爭行為與適應策略。", ["動物行為研究", "生態研究", "學術論文"], evidence, ["行為特徵", "適應策略", "資源利用"], makeZhQueries(topic, ["行為特徵 適應策略", "資源利用 生態", "覓食 行為"]), makeEnQueries(english, ["behavioral adaptation", "resource use ecology", "foraging behavior"]), 92, "behavior_adaptation"),
        create("bio-4", category, `${topic}與人類活動、公共安全或管理策略的關係`, `${topic}與人類活動之間是否存在公共安全、保育治理或生活管理上的實證關聯？`, "納入人為干擾、保育政策、公共安全與生活管理等應用面。", ["政府機構資料", "保育政策報告", "公共安全資料", "學術研究"], evidence, ["人類活動", "保育治理", "公共安全"], makeZhQueries(topic, ["人類活動 保育 管理", "公共安全 風險", "生活 影響"]), makeEnQueries(english, ["human interaction management", "public safety risk", "daily life impact"]), 90, "human_interaction"),
      ];
    case "technology_engineering":
      return [
        create("tech-1", category, `${topic}的技術原理、關鍵元件與核心機制`, `${topic}的技術原理是什麼，哪些關鍵元件或機制決定其表現？`, "聚焦原理、架構、關鍵元件與核心機制。", ["工程研究", "技術文件", "白皮書", "產業資料"], evidence, ["技術原理", "關鍵元件", "核心機制"], makeZhQueries(topic, ["技術原理 關鍵元件", "核心機制", "工程 研究"]), makeEnQueries(english, ["technical principles key components", "core mechanism", "engineering research"]), 96, "principles"),
        create("tech-2", category, `${topic}的應用情境、性能比較與限制`, `${topic}在不同應用情境下的性能、優勢與限制有何差異？`, "聚焦應用場景、性能指標與限制條件。", ["效能比較研究", "應用案例", "技術評測", "產業資料"], evidence, ["應用場景", "性能比較", "限制條件"], makeZhQueries(topic, ["應用情境 性能 比較", "限制 風險", "案例 研究"]), makeEnQueries(english, ["applications performance comparison", "limitations risks", "case studies"]), 95, "applications"),
        create("tech-3", category, `${topic}的風險治理、使用者影響與社會後果`, `${topic}可能帶來哪些治理風險、使用者影響或社會後果，該如何應對？`, "聚焦風險管理、治理規範、使用者影響與社會後果。", ["政策報告", "風險評估", "社會影響研究", "標準文件"], evidence, ["風險治理", "使用者影響", "社會後果"], makeZhQueries(topic, ["風險 治理 使用者 影響", "社會 後果", "規範 標準"]), makeEnQueries(english, ["risk governance user impact", "social consequences", "regulation standards"]), 92, "governance"),
      ];
    case "humanities_culture":
      return [
        create("hum-1", category, `${topic}的歷史背景、文本脈絡與核心議題`, `${topic}在歷史背景或文本脈絡中呈現了哪些核心議題？`, "聚焦歷史背景、文本脈絡與主題意義。", ["專書", "期刊論文", "原始文獻", "文化研究"], evidence, ["歷史背景", "文本脈絡", "核心議題"], makeZhQueries(topic, ["歷史背景 文本 脈絡", "核心議題", "主題 分析"]), makeEnQueries(english, ["historical context textual analysis", "core themes", "cultural interpretation"]), 95, "history"),
        create("hum-2", category, `${topic}的文化意義、不同觀點與比較分析`, `${topic}在不同時代、群體或觀點中如何被理解與比較？`, "聚焦文化意義、不同觀點與比較分析。", ["文化評論", "比較研究", "歷史資料", "學術論文"], evidence, ["文化意義", "不同觀點", "比較分析"], makeZhQueries(topic, ["文化意義 比較 分析", "不同觀點", "詮釋"]), makeEnQueries(english, ["cultural meaning comparative analysis", "different perspectives", "interpretation"]), 93, "comparison"),
        create("hum-3", category, `${topic}的社會傳播、教育使用與當代延伸`, `${topic}如何被傳播、教學或再詮釋，並對當代社會產生哪些延伸意義？`, "聚焦傳播路徑、教育使用與當代轉化。", ["教育研究", "媒體資料", "文化史資料", "評論文章"], evidence, ["社會傳播", "教育使用", "當代延伸"], makeZhQueries(topic, ["傳播 教育 使用", "當代 延伸", "媒體 研究"]), makeEnQueries(english, ["dissemination education use", "contemporary extension", "media studies"]), 90, "dissemination"),
      ];
    case "experiment_design":
      return [
        create("exp-1", category, `${topic}的自變因、依變因與控制變因設定`, `若以 ${topic} 設計研究，哪些自變因、依變因與控制變因最關鍵？`, "聚焦變因拆解、操作化定義與控制條件。", ["實驗方法研究", "教學資料", "實驗設計指南"], evidence, ["自變因", "依變因", "控制變因"], makeZhQueries(topic, ["自變因 依變因 控制變因", "操作化 定義", "實驗設計"]), makeEnQueries(english, ["independent dependent control variables", "operational definition", "experimental design"]), 96, "variables"),
        create("exp-2", category, `${topic}的量測方法、對照組與資料記錄方式`, `如何為 ${topic} 建立可重現的量測方法、對照組安排與資料記錄流程？`, "聚焦對照組、量測工具、紀錄格式與重現性。", ["方法論文", "實驗教材", "儀器手冊"], evidence, ["量測方法", "對照組", "資料記錄"], makeZhQueries(topic, ["量測方法 對照組", "資料記錄 可重現", "實驗 工具"]), makeEnQueries(english, ["measurement methods control group", "data logging reproducibility", "experimental instruments"]), 94, "measurement"),
        create("exp-3", category, `${topic}的誤差來源、限制與結果解釋`, `${topic}的研究結果可能受到哪些誤差來源與限制影響，應如何解釋？`, "聚焦誤差分析、限制說明與結果詮釋。", ["方法論文", "統計或量測資料", "實驗報告"], evidence, ["誤差來源", "限制", "結果解釋"], makeZhQueries(topic, ["誤差來源 限制", "結果解釋", "實驗 誤差分析"]), makeEnQueries(english, ["error sources limitations", "result interpretation", "experimental error analysis"]), 92, "error"),
      ];
    case "unknown":
    default:
      return [];
  }
}

export function candidateTopicGeneration(
  context: ExpansionPlanningContext,
  keywordExpansion: TopicExpansionKeywordExpansion,
): CandidateTopicPlan[] {
  return buildCandidatePool(context, keywordExpansion).candidates;
}

function candidateScore(
  candidate: CandidateTopicPlan,
  context: ExpansionPlanningContext,
  keywordExpansion: TopicExpansionKeywordExpansion,
): number {
  const combined = `${candidate.title} ${candidate.researchQuestion} ${candidate.scope}`.toLowerCase();
  const relevance =
    (combined.includes(context.understood.originalTopic.toLowerCase()) ? 3 : 0) +
    keywordExpansion.relatedTermsZh.filter((term: string) => combined.includes(term.toLowerCase())).length +
    keywordExpansion.relatedTermsEn.filter((term: string) => combined.includes(term.toLowerCase())).length;
  const specificity = candidate.researchQuestion.length > 18 ? 3 : 1;
  const searchability =
    (candidate.queryPlan.primaryQueriesZh.length >= 3 ? 2 : 0) +
    (candidate.queryPlan.primaryQueriesEn.length >= 3 ? 2 : 0);
  const evidencePotential = Math.min(candidate.expectedEvidence.length, 4);
  const driftPenalty = hasForbiddenGenericText(combined) ? 8 : 0;
  return candidate.priority + relevance + specificity + searchability + evidencePotential - driftPenalty;
}

export function candidateMergeAndRerank(
  candidates: CandidateTopicPlan[],
  context: ExpansionPlanningContext,
  keywordExpansion: TopicExpansionKeywordExpansion,
): CandidateTopicPlan[] {
  const deduped = Array.from(
    new Map(
      candidates
        .filter((candidate) => !hasForbiddenGenericText(candidate.title))
        .map((candidate) => {
          const key = normalizeText(candidate.title).toLowerCase();
          return [
            key,
            {
              ...candidate,
              score: candidateScore(candidate, context, keywordExpansion),
            },
          ] as const;
        }),
    ).values(),
  ).sort((left, right) => (right.score ?? 0) - (left.score ?? 0));

  const selected: CandidateTopicPlan[] = [];
  const diversityKeys = new Set<string>();
  const targetCount = deduped.length >= 8 ? 4 : 3;
  for (const candidate of deduped) {
    if (diversityKeys.has(candidate.diversityKey)) continue;
    selected.push(candidate);
    diversityKeys.add(candidate.diversityKey);
    if (selected.length >= targetCount) break;
  }
  if (selected.length < targetCount) {
    const selectedIds = new Set(selected.map((candidate) => candidate.id));
    for (const candidate of deduped) {
      if (selectedIds.has(candidate.id)) continue;
      selected.push(candidate);
      selectedIds.add(candidate.id);
      if (selected.length >= targetCount) break;
    }
  }
  return selected;
}

function researchDirectionBuilder(
  candidates: CandidateTopicPlan[],
): TopicDirection[] {
  return candidates.map((candidate, index) =>
    makeDirection({
      id: candidate.id,
      title: candidate.title,
      category: candidate.category,
      researchQuestion: candidate.researchQuestion,
      scope: candidate.scope,
      sourceTypes: candidate.sourceTypes,
      queryZh: [
        ...candidate.queryPlan.primaryQueriesZh,
        ...candidate.queryPlan.secondaryQueriesZh,
      ],
      queryEn: [
        ...candidate.queryPlan.primaryQueriesEn,
        ...candidate.queryPlan.secondaryQueriesEn,
      ],
      excludeTerms: candidate.excludeTerms,
      expectedEvidence: candidate.expectedEvidence,
      evidenceNeed: candidate.evidenceNeed,
      searchPriority: index + 1,
      broadSuggestion: candidate.broadSuggestion,
    }),
  );
}

function makeDirection(input: {
  id: string;
  title: string;
  category: string;
  researchQuestion: string;
  scope: string;
  sourceTypes: string[];
  queryZh: string[];
  queryEn: string[];
  excludeTerms: string[];
  expectedEvidence: string[];
  evidenceNeed?: string[];
  searchPriority?: number;
  broadSuggestion?: boolean;
}): TopicDirection {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    researchQuestion: input.researchQuestion,
    scope: input.scope,
    sourceTypes: uniqueStrings(input.sourceTypes),
    queryZh: uniqueStrings(input.queryZh).slice(0, 4),
    queryEn: uniqueStrings(input.queryEn).slice(0, 4),
    excludeTerms: uniqueStrings(input.excludeTerms).slice(0, 6),
    expectedEvidence: uniqueStrings(input.expectedEvidence).slice(0, 5),
    evidenceNeed: uniqueStrings(input.evidenceNeed ?? input.expectedEvidence).slice(0, 5),
    searchPriority: input.searchPriority ?? 1,
    broadSuggestion: input.broadSuggestion,
  };
}

function directionsFromResearchAngles(
  context: ExpansionPlanningContext,
): TopicDirection[] {
  const category = directionCategoryLabel(context.topicDomain);
  const englishTopic = preferredEnglishTopic(context);
  const usableAngles = context.understood.researchAngles.filter(
    (angle) =>
      !hasForbiddenGenericText(angle.label) &&
      !hasForbiddenGenericText(angle.researchQuestion) &&
      !hasForbiddenGenericText(angle.whyResearchable),
  );
  if (usableAngles.length === 0) return [];
  return usableAngles.slice(0, 4).map((angle, index) =>
    makeDirection({
      id: `${context.topicDomain}-${index + 1}`,
      title: angle.researchQuestion,
      category,
      researchQuestion: angle.researchQuestion,
      scope: angle.whyResearchable,
      sourceTypes: angle.suggestedSourceTypes,
      queryZh: angle.zhQueries.length > 0 ? angle.zhQueries : makeZhQueries(context.understood.originalTopic, [angle.label]),
      queryEn:
        angle.enQueries.length > 0
          ? angle.enQueries
          : makeEnQueries(englishTopic, [angle.label]),
      excludeTerms: defaultExcludeTerms(context),
      expectedEvidence: defaultExpectedEvidence(context.topicDomain),
      broadSuggestion: context.inputKind === "too_broad",
    }),
  );
}

function buildDomainAwareDirections(
  context: ExpansionPlanningContext,
): TopicDirection[] {
  const topic = context.understood.originalTopic;
  const englishTopic = preferredEnglishTopic(context);
  const category = directionCategoryLabel(context.topicDomain);
  const evidence = defaultExpectedEvidence(context.topicDomain);
  const commonExcludes = defaultExcludeTerms(context);
  const withTaiwan = /氣候變遷|公共政策|教育|能源|健康/u.test(topic);

  switch (context.topicDomain) {
    case "biology_ecology":
      if (/水母|jellyfish/i.test(`${topic} ${englishTopic}`)) {
        return [
          makeDirection({
            id: "bio-jellyfish-1",
            title: "水母大量繁殖與海洋生態變化",
            category,
            researchQuestion: "水母大量繁殖是否會改變海洋食物網、優勢物種組成與近岸生態穩定性？",
            scope: "聚焦水母 bloom、海水升溫、優養化與近岸海域生態變化。",
            sourceTypes: ["海洋生態研究", "長期監測資料", "學術論文", "環境監測報告"],
            queryZh: makeZhQueries(topic, ["大量繁殖 海洋生態 影響", "海洋暖化 食物網", "近岸海域 bloom"]),
            queryEn: makeEnQueries(englishTopic, ["bloom marine ecosystem impact", "ocean warming food web", "coastal bloom monitoring"]),
            excludeTerms: defaultExcludeTerms(context, ["卡通", "水母燈"]),
            expectedEvidence: evidence,
          }),
          makeDirection({
            id: "bio-jellyfish-2",
            title: "水母螫傷對人體健康與海岸公共安全的影響",
            category,
            researchQuestion: "水母螫傷在不同海岸活動情境下會造成哪些健康風險與公共安全問題？",
            scope: "聚焦螫傷案例、海水浴場風險、旅遊安全與急救處置。",
            sourceTypes: ["公共衛生資料", "海岸安全通報", "醫學研究", "政府機構資料"],
            queryZh: makeZhQueries(topic, ["螫傷 健康風險", "公共安全 海岸", "急救 處置"]),
            queryEn: makeEnQueries(englishTopic, ["sting public health risk", "coastal safety incidents", "sting first aid evidence"]),
            excludeTerms: defaultExcludeTerms(context, ["卡通", "水母燈"]),
            expectedEvidence: evidence,
          }),
          makeDirection({
            id: "bio-jellyfish-3",
            title: "水母增加對漁業資源、設備與沿海產業的衝擊",
            category,
            researchQuestion: "水母數量增加是否會影響漁獲量、漁具運作與沿海觀光或產業活動？",
            scope: "聚焦漁業資源、漁網堵塞、發電冷卻系統與觀光產業衝擊。",
            sourceTypes: ["漁業資料", "產業報告", "政府統計", "海洋研究"],
            queryZh: makeZhQueries(topic, ["漁業 影響 海洋暖化", "漁獲量 產業 衝擊", "沿海觀光 風險"]),
            queryEn: makeEnQueries(englishTopic, ["fisheries impact ocean warming", "catch industry disruption", "coastal tourism risk"]),
            excludeTerms: defaultExcludeTerms(context, ["卡通", "水母燈"]),
            expectedEvidence: evidence,
          }),
        ];
      }
      if (/烏龜|海龜|陸龜|turtle|tortoise/i.test(`${topic} ${englishTopic}`)) {
        return [
          makeDirection({
            id: "bio-turtle-1",
            title: "烏龜棲地需求、族群監測與保育管理",
            category,
            researchQuestion: "不同棲地條件如何影響烏龜的族群分布、繁殖成功率與保育管理策略？",
            scope: "可查濕地、河口、海岸棲地與保育監測資料。",
            sourceTypes: ["生態研究", "保育報告", "政府或機構資料"],
            queryZh: ["烏龜 棲地 保育 族群", "海龜 棲地 監測"],
            queryEn: ["turtle habitat conservation population monitoring", "sea turtle habitat management"],
            excludeTerms: defaultExcludeTerms(context, ["Teenage Mutant Ninja Turtles", "turtle trading"]),
            expectedEvidence: evidence,
          }),
          makeDirection({
            id: "bio-turtle-2",
            title: "外來龜種對本土烏龜族群與棲地的影響",
            category,
            researchQuestion: "外來龜種是否會透過競爭、疾病傳播或放生行為影響本土烏龜族群與棲地？",
            scope: "可研究巴西龜、競爭關係、疾病傳播與放生問題。",
            sourceTypes: ["生態保育研究", "野生動物管理", "環境教育資料"],
            queryZh: ["外來種 烏龜 巴西龜 本土生態", "龜類 競爭 疾病 放生"],
            queryEn: ["invasive turtle red-eared slider native turtle impact", "turtle competition disease transmission"],
            excludeTerms: defaultExcludeTerms(context, ["Teenage Mutant Ninja Turtles", "turtle trading"]),
            expectedEvidence: evidence,
          }),
          makeDirection({
            id: "bio-turtle-3",
            title: "塑膠污染、漁業活動與人為干擾對烏龜生存的影響",
            category,
            researchQuestion: "塑膠污染、漁業活動與人為干擾是否會顯著提高烏龜受傷、誤食或死亡風險？",
            scope: "可查塑膠攝食、纏繞、道路死亡與保育措施。",
            sourceTypes: ["海洋保育研究", "野生動物保護資料", "風險評估"],
            queryZh: ["烏龜 塑膠污染 人為干擾", "海龜 漁業 纏繞 攝食"],
            queryEn: ["turtle plastic pollution human disturbance", "sea turtle fisheries entanglement ingestion"],
            excludeTerms: defaultExcludeTerms(context, ["Teenage Mutant Ninja Turtles", "turtle trading"]),
            expectedEvidence: evidence,
          }),
        ];
      }
      if (/獵豹|cheetah/i.test(`${topic} ${englishTopic}`)) {
        return [
          makeDirection({
            id: "bio-cheetah-1",
            title: "獵豹速度演化與身體結構適應",
            category,
            researchQuestion: "獵豹的高速奔跑能力與哪些骨骼、肌肉、呼吸或尾部穩定結構適應有關？",
            scope: "聚焦速度演化、身體結構、捕食策略與運動生理。",
            sourceTypes: ["動物生理研究", "演化生物學", "比較解剖研究", "學術論文"],
            queryZh: ["獵豹 速度演化 身體結構", "獵豹 運動生理 捕食", "獵豹 骨骼 肌肉 適應"],
            queryEn: ["cheetah speed evolution anatomy", "cheetah locomotion physiology", "cheetah skeletal muscular adaptation"],
            excludeTerms: defaultExcludeTerms(context, ["卡通", "球隊 logo"]),
            expectedEvidence: evidence,
          }),
          makeDirection({
            id: "bio-cheetah-2",
            title: "棲地破碎化對獵豹族群保育的影響",
            category,
            researchQuestion: "棲地破碎化與人類土地利用變化是否會降低獵豹的遷移能力、捕食效率與保育成效？",
            scope: "聚焦棲地破碎化、遷移廊道、人獸衝突與保育政策。",
            sourceTypes: ["保育研究", "棲地監測", "GIS 或遷移資料", "政府或 NGO 報告"],
            queryZh: ["獵豹 棲地破碎化 保育", "獵豹 遷移 廊道 人獸衝突", "獵豹 土地利用 影響"],
            queryEn: ["cheetah habitat fragmentation conservation", "cheetah corridor human conflict", "cheetah land use impact"],
            excludeTerms: defaultExcludeTerms(context, ["卡通", "球隊 logo"]),
            expectedEvidence: evidence,
          }),
          makeDirection({
            id: "bio-cheetah-3",
            title: "獵豹低遺傳多樣性與疾病風險",
            category,
            researchQuestion: "獵豹偏低的遺傳多樣性是否會提高疾病風險、繁殖限制或族群脆弱性？",
            scope: "聚焦族群遺傳、繁殖成功率、疾病風險與保育介入。",
            sourceTypes: ["遺傳學研究", "疾病監測資料", "保育生物學", "學術論文"],
            queryZh: ["獵豹 遺傳多樣性 疾病風險", "獵豹 族群遺傳 繁殖", "獵豹 保育 脆弱性"],
            queryEn: ["cheetah genetic diversity disease risk", "cheetah population genetics reproduction", "cheetah conservation vulnerability"],
            excludeTerms: defaultExcludeTerms(context, ["卡通", "球隊 logo"]),
            expectedEvidence: evidence,
          }),
        ];
      }
      return [
        makeDirection({
          id: "bio-1",
          title: `${topic}在生態系中的角色與食物鏈關聯`,
          category,
          researchQuestion: `${topic}是否會透過食物鏈位置、捕食關係或族群變化改變周遭生態系？`,
          scope: "以棲地、食物網、族群變化與環境壓力為主要研究範圍。",
          sourceTypes: ["生態研究", "物種資料庫", "保育機構資料", "長期監測報告"],
          queryZh: makeZhQueries(topic, ["食物鏈 生態角色", "生態系 影響", "族群 變化"]),
          queryEn: makeEnQueries(englishTopic, ["food web ecology", "ecosystem impact", "population change"]),
          excludeTerms: defaultExcludeTerms(context, ["卡通", "玩具"]),
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "bio-2",
          title: `${topic}的棲地分布、環境壓力與族群監測`,
          category,
          researchQuestion: `${topic}的棲地條件與環境壓力是否會影響其分布、繁殖或存活率？`,
          scope: "聚焦棲地分布、環境變遷、族群監測與保育壓力。",
          sourceTypes: ["棲地調查", "保育報告", "地理或海洋監測資料", "學術論文"],
          queryZh: makeZhQueries(topic, ["棲地 分布 族群", "環境壓力 保育", "監測 研究"]),
          queryEn: makeEnQueries(englishTopic, ["habitat distribution", "environmental pressure conservation", "population monitoring"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "bio-3",
          title: `${topic}與人類活動、公共安全或保育管理的關係`,
          category,
          researchQuestion: `${topic}與人類活動之間是否存在公共安全、保育治理或產業衝擊上的實證關聯？`,
          scope: "納入人為干擾、保育政策、漁業或旅遊安全等應用面。",
          sourceTypes: ["政府機構資料", "保育政策報告", "公共安全資料", "學術研究"],
          queryZh: makeZhQueries(topic, ["人類活動 保育 管理", "公共安全 風險", "產業 影響"]),
          queryEn: makeEnQueries(englishTopic, ["human impact conservation management", "public safety risk", "industry impact"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "health_medical":
      return [
        makeDirection({
          id: "health-1",
          title: `${topic}的暴露來源、接觸情境與風險族群`,
          category,
          researchQuestion: `${topic}主要透過哪些暴露來源或接觸情境影響不同風險族群？`,
          scope: "先界定暴露來源、接觸情境、年齡層與風險族群。",
          sourceTypes: ["公共衛生資料", "流行病學研究", "官方指引", "醫學期刊"],
          queryZh: makeZhQueries(topic, ["暴露來源 風險族群", "接觸情境 健康", "公共衛生"]),
          queryEn: makeEnQueries(englishTopic, ["exposure sources risk groups", "health effects public health", "epidemiology review"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "health-2",
          title: `${topic}的作用機制、健康影響與主要症狀`,
          category,
          researchQuestion: `${topic}透過哪些生理或毒理機制影響人體，並造成哪些主要健康結果？`,
          scope: "聚焦作用機制、症狀、短期與長期健康影響。",
          sourceTypes: ["臨床研究", "毒理研究", "系統性回顧", "醫學資料庫"],
          queryZh: makeZhQueries(topic, ["作用機制 健康影響", "症狀 風險", "臨床 研究"]),
          queryEn: makeEnQueries(englishTopic, ["mechanism health effects", "clinical symptoms review", "toxicology evidence"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "health-3",
          title: `${topic}的預防介入、指引建議與證據品質`,
          category,
          researchQuestion: `${topic}有哪些有效的預防或介入方式，現有證據品質是否足以支持實務建議？`,
          scope: "聚焦臨床指引、介入研究與證據強度評估。",
          sourceTypes: ["臨床指引", "介入研究", "公共衛生政策", "系統性回顧"],
          queryZh: makeZhQueries(topic, ["預防 介入 指引", "證據品質 系統性回顧", "建議"]),
          queryEn: makeEnQueries(englishTopic, ["prevention intervention guideline", "systematic review evidence quality", "public health recommendation"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "natural_science":
    case "concept_feature":
      return [
        makeDirection({
          id: "science-1",
          title: `${topic}的科學定義與量測方法`,
          category,
          researchQuestion: `${topic}在科學上如何定義、量測與判讀，其核心指標是什麼？`,
          scope: "以定義、儀器量測、指標解讀與可重現方法為主。",
          sourceTypes: ["物理或化學研究", "量測方法論文", "技術手冊", "科學教材"],
          queryZh: makeZhQueries(topic, ["定義 量測 方法", "科學 指標", "儀器 研究"]),
          queryEn: makeEnQueries(englishTopic, ["definition measurement methods", "scientific indicators", "instrumentation research"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "science-2",
          title: `${topic}的形成機制、應用場景與限制條件`,
          category,
          researchQuestion: `${topic}由哪些物理或化學機制形成，在哪些應用情境下才具有研究意義？`,
          scope: "連結形成機制、使用情境與限制條件，避免空泛宣稱。",
          sourceTypes: ["基礎研究", "應用研究", "工程測試資料", "產業技術文件"],
          queryZh: makeZhQueries(topic, ["形成機制 應用 限制", "物理 化學 原理", "應用情境"]),
          queryEn: makeEnQueries(englishTopic, ["formation mechanism applications", "physical chemical principles", "use cases limitations"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "science-3",
          title: `${topic}相關健康宣稱或常見迷思的證據檢驗`,
          category,
          researchQuestion: `${topic}若涉及效果宣稱或常見迷思，現有證據是否足以支持這些說法？`,
          scope: "聚焦實驗證據、系統性回顧與反證資料，不把廣告當證據。",
          sourceTypes: ["證據評估論文", "系統性回顧", "公共機構資料", "實驗研究"],
          queryZh: makeZhQueries(topic, ["健康宣稱 證據", "迷思 科學", "效果 檢驗"]),
          queryEn: makeEnQueries(englishTopic, ["health claims evidence", "scientific myths review", "effectiveness evaluation"]),
          excludeTerms: defaultExcludeTerms(context, ["廣告", "開箱", "業配"]),
          expectedEvidence: evidence,
        }),
      ];
    case "experiment_design":
      return [
        makeDirection({
          id: "exp-1",
          title: `${topic}的自變因、依變因與控制變因設定`,
          category,
          researchQuestion: `若以 ${topic} 設計研究，哪些自變因、依變因與控制變因最關鍵？`,
          scope: "聚焦變因拆解、操作化定義與控制條件。",
          sourceTypes: ["實驗方法研究", "教學資料", "實驗設計指南"],
          queryZh: makeZhQueries(topic, ["自變因 依變因 控制變因", "操作化 定義", "實驗設計"]),
          queryEn: makeEnQueries(englishTopic, ["independent dependent control variables", "operational definition", "experimental design"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "exp-2",
          title: `${topic}的量測方法、對照組與資料記錄方式`,
          category,
          researchQuestion: `如何為 ${topic} 建立可重現的量測方法、對照組安排與資料記錄流程？`,
          scope: "聚焦對照組、量測工具、紀錄格式與重現性。",
          sourceTypes: ["方法論文", "實驗教材", "儀器手冊"],
          queryZh: makeZhQueries(topic, ["量測方法 對照組", "資料記錄 可重現", "實驗 工具"]),
          queryEn: makeEnQueries(englishTopic, ["measurement methods control group", "data logging reproducibility", "experimental instruments"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "exp-3",
          title: `${topic}的誤差來源、限制與結果解釋`,
          category,
          researchQuestion: `${topic} 的研究結果可能受到哪些誤差來源與限制影響，應如何解釋？`,
          scope: "聚焦誤差分析、限制說明與結果詮釋。",
          sourceTypes: ["方法論文", "統計或量測資料", "實驗報告"],
          queryZh: makeZhQueries(topic, ["誤差來源 限制", "結果解釋", "實驗 誤差分析"]),
          queryEn: makeEnQueries(englishTopic, ["error sources limitations", "result interpretation", "experimental error analysis"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "social_policy":
      return [
        makeDirection({
          id: "policy-1",
          title: `${topic}的現況趨勢與主要影響`,
          category,
          researchQuestion: `${topic}目前呈現哪些趨勢，對環境、經濟或公共生活造成哪些可觀察影響？`,
          scope: "先界定趨勢、影響面向與可取得的統計資料。",
          sourceTypes: ["官方統計", "政策報告", "學術研究", "國際機構資料"],
          queryZh: makeZhQueries(topic, withTaiwan ? ["台灣 現況 趨勢", "影響 統計", "公共生活"] : ["現況 趨勢", "影響 統計", "公共生活"]),
          queryEn: makeEnQueries(englishTopic, ["current trends impact", "policy statistics", "public effects"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "policy-2",
          title: `${topic}的政策回應、治理策略與台灣在地資料`,
          category,
          researchQuestion: `面對 ${topic}，現有政策回應與治理策略是否有效，台灣在地資料顯示了什麼？`,
          scope: "納入台灣在地資料、政策工具與治理成效。",
          sourceTypes: ["政府資料", "政策評估報告", "地方統計", "學術研究"],
          queryZh: makeZhQueries(topic, ["台灣 政策 回應", "治理 策略", "在地資料"]),
          queryEn: makeEnQueries(englishTopic, ["Taiwan policy response", "governance strategy", "local data assessment"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "policy-3",
          title: `${topic}的弱勢影響、國際比較與未來調整方向`,
          category,
          researchQuestion: `${topic}是否對特定弱勢族群產生不成比例影響，國際比較又能提供哪些修正方向？`,
          scope: "聚焦弱勢族群、跨國比較與政策修正建議。",
          sourceTypes: ["國際比較報告", "公共政策研究", "社會影響分析"],
          queryZh: makeZhQueries(topic, ["弱勢族群 國際比較", "未來調整 方向", "社會影響"]),
          queryEn: makeEnQueries(englishTopic, ["vulnerable groups international comparison", "policy adjustment directions", "social impact"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "education_psychology":
      return [
        makeDirection({
          id: "edu-1",
          title: `${topic}對睡眠、注意力與情緒的影響`,
          category,
          researchQuestion: `${topic}是否會影響睡眠品質、注意力維持或情緒狀態？`,
          scope: "聚焦睡眠、注意力、情緒與青少年或學生族群。",
          sourceTypes: ["心理學研究", "教育研究", "公共衛生資料", "問卷研究"],
          queryZh: makeZhQueries(topic, ["睡眠 注意力 情緒", "青少年 影響", "心理 研究"]),
          queryEn: makeEnQueries(englishTopic, ["sleep attention emotion", "adolescent effects", "psychology research"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "edu-2",
          title: `${topic}與學習表現、社群媒體使用或成癮行為的關係`,
          category,
          researchQuestion: `${topic}與學業表現、社群媒體使用強度或成癮行為之間是否存在顯著關聯？`,
          scope: "聚焦使用時間、學習表現、社群媒體與成癮行為指標。",
          sourceTypes: ["教育研究", "行為研究", "問卷調查", "系統性回顧"],
          queryZh: makeZhQueries(topic, ["學習表現 社群媒體", "成癮 行為 關係", "問卷 研究"]),
          queryEn: makeEnQueries(englishTopic, ["academic performance social media", "addictive behavior association", "survey research"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "edu-3",
          title: `${topic}的家庭、學校因素與介入策略`,
          category,
          researchQuestion: `哪些家庭、學校或介入策略能降低 ${topic} 帶來的不良影響？`,
          scope: "聚焦家庭監管、學校環境與介入方案。",
          sourceTypes: ["介入研究", "學校政策資料", "教育心理學研究"],
          queryZh: makeZhQueries(topic, ["家庭 學校 介入策略", "管理 教育", "改善 方案"]),
          queryEn: makeEnQueries(englishTopic, ["family school intervention", "management education", "mitigation strategies"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "technology_engineering":
      return [
        makeDirection({
          id: "tech-1",
          title: `${topic}的技術原理、關鍵元件與核心機制`,
          category,
          researchQuestion: `${topic}的技術原理是什麼，哪些關鍵元件或機制決定其表現？`,
          scope: "聚焦原理、架構、關鍵元件與核心機制。",
          sourceTypes: ["工程研究", "技術文件", "白皮書", "產業資料"],
          queryZh: makeZhQueries(topic, ["技術原理 關鍵元件", "核心機制", "工程 研究"]),
          queryEn: makeEnQueries(englishTopic, ["technical principles key components", "core mechanism", "engineering research"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "tech-2",
          title: `${topic}的應用情境、性能比較與限制`,
          category,
          researchQuestion: `${topic}在不同應用情境下的性能、優勢與限制有何差異？`,
          scope: "聚焦應用場景、性能指標、限制條件與比較基準。",
          sourceTypes: ["效能比較研究", "應用案例", "技術評測", "產業資料"],
          queryZh: makeZhQueries(topic, ["應用情境 性能 比較", "限制 風險", "案例 研究"]),
          queryEn: makeEnQueries(englishTopic, ["applications performance comparison", "limitations risks", "case studies"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "tech-3",
          title: `${topic}的風險治理、使用者影響與社會後果`,
          category,
          researchQuestion: `${topic}可能帶來哪些治理風險、使用者影響或社會後果，該如何應對？`,
          scope: "聚焦風險管理、治理規範、使用者影響與社會後果。",
          sourceTypes: ["政策報告", "風險評估", "社會影響研究", "標準文件"],
          queryZh: makeZhQueries(topic, ["風險 治理 使用者 影響", "社會 後果", "規範 標準"]),
          queryEn: makeEnQueries(englishTopic, ["risk governance user impact", "social consequences", "regulation standards"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "humanities_culture":
      return [
        makeDirection({
          id: "humanities-1",
          title: `${topic}的歷史背景、文本脈絡與核心議題`,
          category,
          researchQuestion: `${topic}在歷史背景或文本脈絡中呈現了哪些核心議題？`,
          scope: "聚焦歷史背景、文本脈絡與主題意義。",
          sourceTypes: ["專書", "期刊論文", "原始文獻", "文化研究"],
          queryZh: makeZhQueries(topic, ["歷史背景 文本 脈絡", "核心議題", "主題 分析"]),
          queryEn: makeEnQueries(englishTopic, ["historical context textual analysis", "core themes", "cultural interpretation"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "humanities-2",
          title: `${topic}的文化意義、不同觀點與比較分析`,
          category,
          researchQuestion: `${topic}在不同時代、群體或觀點中如何被理解與比較？`,
          scope: "聚焦文化意義、不同觀點與比較分析。",
          sourceTypes: ["文化評論", "比較研究", "歷史資料", "學術論文"],
          queryZh: makeZhQueries(topic, ["文化意義 比較 分析", "不同觀點", "詮釋"]),
          queryEn: makeEnQueries(englishTopic, ["cultural meaning comparative analysis", "different perspectives", "interpretation"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
        makeDirection({
          id: "humanities-3",
          title: `${topic}的社會傳播、教育使用與當代延伸`,
          category,
          researchQuestion: `${topic}如何被傳播、教學或再詮釋，並對當代社會產生哪些延伸意義？`,
          scope: "聚焦傳播路徑、教育使用與當代轉化。",
          sourceTypes: ["教育研究", "媒體資料", "文化史資料", "評論文章"],
          queryZh: makeZhQueries(topic, ["傳播 教育 使用", "當代 延伸", "媒體 研究"]),
          queryEn: makeEnQueries(englishTopic, ["dissemination education use", "contemporary extension", "media studies"]),
          excludeTerms: commonExcludes,
          expectedEvidence: evidence,
        }),
      ];
    case "unknown":
    default:
      return [];
  }
}

function buildRuleBasedExpansion(
  topic: string,
  understood: ReturnType<typeof understandTopic>,
): RuleBasedExpansion {
  const inputKind = classifyInputKind(topic, understood);
  const entityType = classifyEntityType(topic, understood, inputKind);
  const topicDomain = classifyTopicDomain(topic, understood, inputKind, entityType);
  const secondaryDomains = classifySecondaryDomains(topic, understood, topicDomain);
  const context: ExpansionPlanningContext = {
    understood,
    inputKind,
    topicDomain,
    entityType,
    secondaryDomains,
    englishTopic: understood.canonicalEnglishTopic,
  };

  if (inputKind === "gibberish") {
    return {
      originalTopic: topic,
      inputKind,
      topicDomain: "unknown",
      entityType: "unknown",
      secondaryDomains: [],
      generationMode: "error",
      fallbackReason: "GIBBERISH_INPUT",
      canonicalEnglishTopic: "",
      expandedTopic: "",
      keywordExpansion: null,
      candidateCount: 0,
      selectedLensIds: [],
      rejectedLensIds: [],
      lensRejectReasons: {},
      directions: [],
      message: "無法辨識有效研究主題，請輸入明確的中文或英文研究題目。",
    };
  }

  const keywordExpansion = buildKeywordExpansion(context);
  const candidatePool = buildCandidatePool(context, keywordExpansion);
  const candidates = candidatePool.candidates;
  const rankedCandidates = candidateMergeAndRerank(
    candidates,
    context,
    keywordExpansion,
  );
  const directions = researchDirectionBuilder(rankedCandidates);
  const selectedLensIds = uniqueStrings(
    rankedCandidates.map((candidate) => candidate.diversityKey),
  );

  if (inputKind === "too_broad" && directions.length > 0) {
    return {
      originalTopic: topic,
      inputKind,
      topicDomain,
      entityType,
      secondaryDomains,
      generationMode: "rule",
      fallbackReason: "TOO_BROAD_INPUT",
      canonicalEnglishTopic: preferredEnglishTopic(context),
      expandedTopic: `${topic}目前範圍較廣，建議先從下列研究方向縮小。`,
      keywordExpansion,
      candidateCount: candidates.length,
      selectedLensIds,
      rejectedLensIds: candidatePool.rejectedLensIds,
      lensRejectReasons: candidatePool.lensRejectReasons,
      directions: directions.map((direction) => ({ ...direction, broadSuggestion: true })),
      message: "題目過於廣泛，已先提供可縮小的方向建議。",
    };
  }

  return {
    originalTopic: topic,
    inputKind,
    topicDomain,
    entityType,
    secondaryDomains,
    generationMode: "rule",
    canonicalEnglishTopic: preferredEnglishTopic(context),
    expandedTopic: topicSummaryLine(topic, topicDomain),
    keywordExpansion,
    candidateCount: candidates.length,
    selectedLensIds,
    rejectedLensIds: candidatePool.rejectedLensIds,
    lensRejectReasons: candidatePool.lensRejectReasons,
    directions,
    message: "已依主題領域、候選研究題與 query plan 建立可研究、可搜尋的研究方向。",
  };
}

function contentFromDirections(plan: RuleBasedExpansion): TopicExpansionContent {
  return {
    expandedTopic: plan.expandedTopic || plan.originalTopic,
    researchQuestions: plan.directions.map((direction) => direction.researchQuestion),
    searchKeywords: {
      zh: uniqueStrings([
        ...(plan.keywordExpansion?.coreTermsZh ?? []),
        ...(plan.keywordExpansion?.relatedTermsZh ?? []),
        ...plan.directions.flatMap((direction) => direction.queryZh),
      ]).slice(0, 12),
      en: uniqueStrings([
        ...(plan.keywordExpansion?.coreTermsEn ?? []),
        ...(plan.keywordExpansion?.relatedTermsEn ?? []),
        ...plan.directions.flatMap((direction) => direction.queryEn),
      ]).slice(0, 12),
      synonyms: uniqueStrings([
        ...(plan.keywordExpansion?.dimensionTermsZh ?? []),
        ...(plan.keywordExpansion?.dimensionTermsEn ?? []),
      ]).slice(0, 8),
      academic: uniqueStrings(plan.directions.flatMap((direction) => direction.sourceTypes)).slice(0, 8),
    },
    sourceStrategy: uniqueStrings(plan.directions.map((direction) => direction.category)).slice(0, 6),
    exclusions: uniqueStrings([
      ...(plan.keywordExpansion?.excludeTerms ?? []),
      ...plan.directions.flatMap((direction) => direction.excludeTerms),
    ]).slice(0, 8),
  };
}

function contentLooksGeneric(content: TopicExpansionContent): boolean {
  return hasForbiddenGenericText(
    [
      content.expandedTopic,
      ...content.researchQuestions,
      ...content.searchKeywords.zh,
      ...content.searchKeywords.en,
      ...content.sourceStrategy,
    ].join(" "),
  );
}

function mergeRuleContentWithLlmContent(
  ruleContent: TopicExpansionContent,
  llmContent: TopicExpansionContent,
): TopicExpansionContent {
  return {
    expandedTopic:
      !hasForbiddenGenericText(llmContent.expandedTopic) && llmContent.expandedTopic
        ? llmContent.expandedTopic
        : ruleContent.expandedTopic,
    researchQuestions:
      llmContent.researchQuestions.length > 0 &&
      !llmContent.researchQuestions.some((question) => hasForbiddenGenericText(question))
        ? llmContent.researchQuestions
        : ruleContent.researchQuestions,
    searchKeywords: {
      zh: uniqueStrings([...ruleContent.searchKeywords.zh, ...llmContent.searchKeywords.zh]).slice(0, 12),
      en: uniqueStrings([...ruleContent.searchKeywords.en, ...llmContent.searchKeywords.en]).slice(0, 12),
      synonyms: uniqueStrings([...ruleContent.searchKeywords.synonyms, ...llmContent.searchKeywords.synonyms]).slice(0, 8),
      academic: uniqueStrings([...ruleContent.searchKeywords.academic, ...llmContent.searchKeywords.academic]).slice(0, 8),
    },
    sourceStrategy: uniqueStrings([
      ...ruleContent.sourceStrategy,
      ...llmContent.sourceStrategy.filter((value) => !hasForbiddenGenericText(value)),
    ]).slice(0, 6),
    exclusions: uniqueStrings([...ruleContent.exclusions, ...llmContent.exclusions]).slice(0, 8),
  };
}

function sanitizeTopicExpansionContent(
  content: TopicExpansionContent,
  understood: ReturnType<typeof understandTopic>,
): TopicExpansionContent {
  const fallbackResearchQuestions = understood.researchAngles
    .map((researchAngle) => researchAngle.researchQuestion)
    .slice(0, 4);
  const researchQuestions = removeLegacyGenericAngles(content.researchQuestions);
  const englishTopic =
    understood.canonicalEnglishTopic ||
    (/[A-Za-z]/.test(understood.originalTopic) ? understood.originalTopic : "");

  return {
    ...content,
    researchQuestions:
      researchQuestions.length > 0
        ? researchQuestions
        : fallbackResearchQuestions,
    searchKeywords: {
      zh: sanitizeAndBackfillAngles({
        topic: understood.originalTopic,
        values: content.searchKeywords.zh,
        topicKind: understood.topicKind,
        domain: understood.domain,
        coreConcepts: understood.coreConcepts,
        aliases: understood.aliases,
        canonicalEnglishTopic: understood.canonicalEnglishTopic,
        language: "zh",
      }).slice(0, 10),
      en: sanitizeAndBackfillAngles({
        topic: englishTopic,
        values: content.searchKeywords.en,
        topicKind: understood.topicKind,
        domain: understood.domain,
        coreConcepts: understood.coreConcepts,
        aliases: understood.aliases,
        canonicalEnglishTopic: understood.canonicalEnglishTopic,
        language: "en",
      }).slice(0, 10),
      synonyms: removeLegacyGenericAngles(content.searchKeywords.synonyms).slice(0, 8),
      academic: removeLegacyGenericAngles(content.searchKeywords.academic).slice(0, 8),
    },
    sourceStrategy: removeLegacyGenericAngles(content.sourceStrategy).slice(0, 6),
  };
}

function visibleTitleLength(title: string): number {
  return Array.from(title.trim()).length;
}

function compactTopicText(topic: string): string {
  return topic.replace(/研究|探討|分析|影響$/gu, "").trim() || topic.trim();
}

function trimmedTitleCandidate(title: string): string {
  const chars = Array.from(title.trim());
  if (chars.length <= 40) return title.trim();
  return `${chars.slice(0, 39).join("").trim()}…`;
}

function titleCandidateStyleLabel(
  style: TitleCandidateStyle,
  fallback = "report title",
): string {
  switch (style) {
    case "academic":
      return "學理與現象";
    case "poetic_academic":
      return "亮眼標題";
    case "narrative":
      return "敘事風格";
    case "question":
      return "問題導向";
    case "contrast":
      return "對照觀點";
    case "practical":
      return fallback;
    default:
      return fallback;
  }
}

function pickFacet(
  values: string[],
  patterns: RegExp[],
  fallback: string,
): string {
  const match = values.find((value) => patterns.some((pattern) => pattern.test(value)));
  return match ?? fallback;
}

function toResearchFacet(value: string, topic: string): string {
  const cleaned = value
    .replace(topic, "")
    .replace(/[：:]/g, " ")
    .replace(/^(如何|是否|哪些|什麼|哪裡|從)/u, "")
    .replace(/(的|與|在)$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || value.trim();
}

function sanitizeTitleFacet(value: string): string {
  return value
    .replace(/形成機制/gu, "原理")
    .replace(/作用機制/gu, "原理")
    .replace(/應用限制/gu, "應用")
    .replace(/量測方法/gu, "觀察方法")
    .replace(/對照組與資料記錄方式/gu, "觀察方法與結果整理")
    .trim();
}

function buildHiddenResearchPlan(input: {
  topic: string;
  topicDomain: TopicExpansionDomain;
  secondaryDomains: TopicExpansionDomain[];
  keywordExpansion?: TopicExpansionKeywordExpansion | null;
  content?: TopicExpansionContent;
  directions?: TopicDirection[];
}): HiddenResearchPlan {
  const canonicalTopicZh =
    input.content?.expandedTopic?.trim() ||
    input.directions?.[0]?.title?.trim() ||
    input.topic.trim();
  const canonicalTopicEn =
    input.content?.searchKeywords.en.find((query) => /[A-Za-z]/.test(query)) ||
    input.keywordExpansion?.coreTermsEn[0] ||
    input.keywordExpansion?.relatedTermsEn[0] ||
    "";
  return {
    selectedTopicSeed: input.topic,
    possibleDomains: uniqueStrings([
      input.topicDomain,
      ...input.secondaryDomains,
    ]) as TopicExpansionDomain[],
    displayTitle: canonicalTopicZh,
    canonicalTopicZh,
    ...(canonicalTopicEn ? { canonicalTopicEn } : {}),
    querySeedZh: uniqueStrings([
      ...(input.content?.searchKeywords.zh ?? []),
      ...((input.keywordExpansion?.coreTermsZh ?? []).slice(0, 2)),
      ...((input.keywordExpansion?.relatedTermsZh ?? []).slice(0, 4)),
      ...(input.directions?.flatMap((direction) => direction.queryZh) ?? []),
    ]).slice(0, 6),
    querySeedEn: uniqueStrings([
      ...(input.content?.searchKeywords.en ?? []),
      ...((input.keywordExpansion?.coreTermsEn ?? []).slice(0, 2)),
      ...((input.keywordExpansion?.relatedTermsEn ?? []).slice(0, 4)),
      ...(input.directions?.flatMap((direction) => direction.queryEn) ?? []),
    ]).slice(0, 6),
    mustIncludeTerms: uniqueStrings([
      ...((input.keywordExpansion?.coreTermsZh ?? []).slice(0, 3)),
      ...((input.keywordExpansion?.coreTermsEn ?? []).slice(0, 3)),
    ]).slice(0, 6),
    excludeTerms: uniqueStrings([
      ...(input.keywordExpansion?.excludeTerms ?? []),
      ...(input.directions?.flatMap((direction) => direction.excludeTerms) ?? []),
    ]).slice(0, 8),
    domainHints: uniqueStrings([
      input.topicDomain,
      ...input.secondaryDomains,
    ]).slice(0, 6),
    subtopics: (input.directions ?? []).slice(0, 5).map((direction, index) => ({
      id: direction.id || `direction-${index + 1}`,
      titleZh: direction.title,
      ...(direction.queryEn[0] ? { titleEn: direction.queryEn[0] } : {}),
      queryZh: direction.queryZh.slice(0, 4),
      queryEn: direction.queryEn.slice(0, 4),
      mustIncludeTerms: direction.expectedEvidence.slice(0, 3),
      excludeTerms: direction.excludeTerms.slice(0, 6),
      expectedSourceTypes: direction.sourceTypes.slice(0, 4),
    })),
    selectedResearchPlanId:
      input.directions?.[0]?.id ||
      `research-plan:${canonicalTopicZh.replace(/\s+/g, "-")}`,
  };
}

function buildTitleCandidates(input: {
  topic: string;
  topicDomain: TopicExpansionDomain;
  entityType: TopicExpansionEntityType;
  keywordExpansion?: TopicExpansionKeywordExpansion | null;
  directions?: TopicDirection[];
  source: "llm" | "rule" | "hybrid";
}): TitleCandidate[] {
  const topic = input.topic.trim();
  if (!topic) return [];

  const focusTopic = compactTopicText(topic);
  const relatedTerms = uniqueStrings([
    ...(input.keywordExpansion?.relatedTermsZh ?? []),
    ...(input.keywordExpansion?.dimensionTermsZh ?? []),
    ...(input.directions?.map((direction) => toResearchFacet(direction.title, topic)) ?? []),
  ]);

  const titles: Array<{ title: string; style: TitleCandidateStyle }> = [];
  const push = (title: string, style: TitleCandidateStyle) => {
    const cleaned = trimmedTitleCandidate(title.replace(/\s+/g, " ").trim());
    if (!cleaned || visibleTitleLength(cleaned) < 8) return;
    if (hasForbiddenGenericText(cleaned)) return;
    if (titles.some((candidate) => candidate.title === cleaned)) return;
    titles.push({ title: cleaned, style });
  };

  if (input.entityType === "animal" || input.topicDomain === "biology_ecology") {
    const behavior = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/群體|行為|覓食|溝通|費洛蒙/u],
      "行為模式",
      ),
    );
    const ecology = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/生態|土壤|棲地|食物鏈|保育|環境/u],
      "生態角色",
      ),
    );
    const interaction = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/入侵|人類|保育|風險|影響/u],
      "人類互動與環境影響",
      ),
    );
    if (/群體|社會|分工/u.test(behavior)) {
      push(`微小社會的巨大秩序：${topic}${behavior}與${ecology}`, "poetic_academic");
    } else {
      push(`${topic}的祕密生活：${behavior}與${ecology}`, "poetic_academic");
    }
    if (/土壤/u.test(ecology)) {
      push(`地表下的工程師：${topic}如何改變${ecology}`, "narrative");
    } else {
      push(`從棲地到食物鏈：${topic}的${ecology}`, "academic");
    }
    if (/費洛蒙|覓食|溝通/u.test(behavior)) {
      push(`費洛蒙鋪成的道路：${topic}${behavior}`, "narrative");
    }
    push(`${topic}不只是小生物：${interaction}`, "contrast");
  } else if (input.entityType === "food") {
    const nutrition = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/營養|糖|鈉|咖啡因|成分|添加/u],
      "營養與飲食選擇",
      ),
    );
    const safety = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/標示|食品安全|保存|加工|冷凍/u],
      "食品標示與保存",
      ),
    );
    const culture = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/文化|早餐|台灣|日常|消費/u],
      "日常飲食文化",
      ),
    );
    push(`餐桌上的${topic}：${nutrition}、${safety}與${culture}`, "poetic_academic");
    push(`一口${topic}裡的學問：${safety}與${nutrition}`, "narrative");
    push(`從日常飲食到消費選擇：${topic}的${culture}`, "practical");
    push(`${topic}不只是方便食物：${nutrition}與${safety}`, "contrast");
  } else if (
    input.topicDomain === "experiment_design" ||
    input.topicDomain === "natural_science" ||
    input.topicDomain === "concept_feature" ||
    input.entityType === "scientific_concept"
  ) {
    const mechanism = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/原理|機制|反應|變化|表面張力|干涉|電子|量測/u],
      "原理與現象",
      ),
    );
    const application = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/應用|量測|實驗|變因|結果|觀察/u],
      "實驗觀察與應用",
      ),
    );
    if (/實驗/u.test(topic)) {
      push(`一場${topic}裡的學問：從${mechanism}到${application}`, "narrative");
      push(`看見現象背後的原理：${topic}中的${application}`, "academic");
      push(`${focusTopic}中的科學：${mechanism}與${application}`, "poetic_academic");
    } else {
      push(`看不見的變化：${topic}的${mechanism}`, "poetic_academic");
      push(`從生活現象到科學解釋：${topic}與${application}`, "academic");
      push(`${topic}不只是課本名詞：${mechanism}與${application}`, "contrast");
    }
  } else if (
    input.topicDomain === "education_psychology" ||
    input.topicDomain === "social_policy" ||
    input.entityType === "social_issue"
  ) {
    const impact = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/睡眠|注意力|健康|極端天氣|影響|風險|學習/u],
      "影響與風險",
      ),
    );
    const response = sanitizeTitleFacet(
      pickFacet(
      relatedTerms,
      [/對策|政策|介入|治理|台灣|調適|回應/u],
      "社會回應",
      ),
    );
    push(`看見${topic}背後的問題：${impact}與${response}`, "academic");
    push(`${topic}不只是表面現象：${impact}如何影響日常生活`, "contrast");
    push(`從原因到回應：${topic}的${response}`, "practical");
  } else {
    const firstFacet = sanitizeTitleFacet(relatedTerms[0] ?? "主要觀察面向");
    const secondFacet = sanitizeTitleFacet(relatedTerms[1] ?? "延伸應用");
    push(`${topic}的另一種看法：${firstFacet}與${secondFacet}`, "academic");
    push(`從${topic}出發：重新理解${firstFacet}`, "narrative");
    push(`${topic}不只是表面概念：${secondFacet}`, "contrast");
  }

  for (const direction of input.directions ?? []) {
    if (
      hasForbiddenGenericText(direction.title) ||
      hasForbiddenGenericText(direction.researchQuestion) ||
      hasForbiddenGenericText(direction.scope)
    ) {
      continue;
    }
    const style: TitleCandidateStyle =
      direction.searchPriority === 1 ? "academic" : "practical";
    const title = direction.title.includes("：")
      ? direction.title
      : `${titleCandidateStyleLabel(style, "研究題目")}：${direction.title}`;
    push(title, style);
    if (titles.length >= 5) break;
  }

  return titles.slice(0, 5).map((candidate, index) => ({
    id: `title-${index + 1}`,
    title: candidate.title,
    style: candidate.style,
    displayOnly: true,
    source: input.source,
  }));
}

function buildTopicExpansionResponse(input: {
  status: LlmStructuredStatus;
  message: string;
  diagnostics: TopicExpansionDiagnostics;
  content?: TopicExpansionContent;
  directions?: TopicDirection[];
  originalTopic?: string;
  inputKind?: TopicExpansionInputKind;
  topicDomain?: TopicExpansionDomain;
  entityType?: TopicExpansionEntityType;
  secondaryDomains?: TopicExpansionDomain[];
  generationMode?: TopicExpansionGenerationMode;
  fallbackReason?: string;
  modelUsed?: string;
  llmLatencyMs?: number;
  canonicalEnglishTopic?: string;
  coreConcepts?: string[];
  keywordExpansion?: TopicExpansionKeywordExpansion | null;
  candidateCount?: number;
  selectedLensIds?: string[];
  rejectedLensIds?: string[];
  lensRejectReasons?: Record<string, string>;
  titleCandidates?: TitleCandidate[];
  hiddenResearchPlan?: HiddenResearchPlan | null;
}): TopicExpansionResponse {
  const understood = understandTopic(input.diagnostics.originalTopic ?? "");
  const sanitizedContent = input.content
    ? sanitizeTopicExpansionContent(input.content, understood)
    : undefined;
  const diagnosticSearchQueries = sanitizedContent
    ? {
        zh: sanitizedContent.searchKeywords.zh.slice(0, 8),
        en: sanitizedContent.searchKeywords.en.slice(0, 8),
      }
    : input.diagnostics.searchQueries;
  const hiddenResearchPlan =
    input.status === "invalid_input" || input.status === "error"
      ? null
      : input.hiddenResearchPlan ??
        buildHiddenResearchPlan({
          topic: input.originalTopic ?? input.diagnostics.originalTopic ?? "",
          topicDomain: input.topicDomain ?? input.diagnostics.topicDomain ?? "unknown",
          secondaryDomains:
            input.secondaryDomains ?? input.diagnostics.secondaryDomains ?? [],
          keywordExpansion: input.keywordExpansion ?? input.diagnostics.keywordExpansion,
          content: sanitizedContent,
          directions: input.directions,
        });
  const titleCandidates =
    input.status === "invalid_input" || input.status === "error"
      ? []
      : input.titleCandidates ??
        buildTitleCandidates({
          topic: input.originalTopic ?? input.diagnostics.originalTopic ?? "",
          topicDomain: input.topicDomain ?? input.diagnostics.topicDomain ?? "unknown",
          entityType: input.entityType ?? input.diagnostics.entityType ?? "unknown",
          keywordExpansion: input.keywordExpansion ?? input.diagnostics.keywordExpansion,
          directions: input.directions,
          source:
            input.generationMode === "llm_polished"
              ? "llm"
              : input.generationMode === "title_fallback" ||
                  input.generationMode === "hybrid_fallback"
                ? "hybrid"
                : "rule",
        });
  return {
    status: input.status,
    message: input.message,
    originalTopic: input.originalTopic ?? input.diagnostics.originalTopic ?? "",
    inputKind: input.inputKind,
    topicDomain: input.topicDomain,
    entityType: input.entityType,
    secondaryDomains: input.secondaryDomains,
    generationMode: input.generationMode,
    fallbackReason: input.fallbackReason ?? input.diagnostics.fallbackReason,
    modelUsed: input.modelUsed ?? input.diagnostics.model,
    llmLatencyMs: input.llmLatencyMs ?? input.diagnostics.latencyMs,
    keywordExpansion: input.keywordExpansion ?? null,
    candidateCount: input.candidateCount ?? input.directions?.length ?? 0,
    ...(sanitizedContent ?? emptyExpansionContent()),
    titleCandidates,
    hiddenResearchPlan,
    directions: input.directions ?? [],
    diagnostics: {
      ...input.diagnostics,
      developerOnly: true,
      llm_status: input.diagnostics.llm_status ?? input.status,
      inputKind: input.inputKind ?? input.diagnostics.inputKind,
      topicDomain: input.topicDomain ?? input.diagnostics.topicDomain,
      entityType: input.entityType ?? input.diagnostics.entityType,
      secondaryDomains:
        input.secondaryDomains ?? input.diagnostics.secondaryDomains,
      generationMode:
        input.generationMode ?? input.diagnostics.generationMode,
      modelUsed: input.modelUsed ?? input.diagnostics.modelUsed ?? input.diagnostics.model,
      llmLatencyMs:
        input.llmLatencyMs ?? input.diagnostics.llmLatencyMs ?? input.diagnostics.latencyMs,
      fallbackReason:
        input.fallbackReason ?? input.diagnostics.fallbackReason,
      canonicalEnglishTopic:
        input.canonicalEnglishTopic ?? input.diagnostics.canonicalEnglishTopic,
      coreConcepts: input.coreConcepts ?? input.diagnostics.coreConcepts,
      keywordExpansion:
        input.keywordExpansion ?? input.diagnostics.keywordExpansion ?? null,
      candidateCount:
        input.candidateCount ??
        input.directions?.length ??
        input.diagnostics.candidateCount,
      selectedLensIds:
        input.selectedLensIds ?? input.diagnostics.selectedLensIds,
      rejectedLensIds:
        input.rejectedLensIds ?? input.diagnostics.rejectedLensIds,
      lensRejectReasons:
        input.lensRejectReasons ?? input.diagnostics.lensRejectReasons,
      searchQueries: diagnosticSearchQueries,
      fallback_used:
        input.diagnostics.fallback_used ?? input.diagnostics.fallbackUsed,
    },
  };
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeKeywordObject(value: unknown): TopicExpansionContent["searchKeywords"] {
  if (Array.isArray(value)) {
    return {
      zh: stringArray(value).filter((item) => /[\u3400-\u9fff]/.test(item)),
      en: stringArray(value).filter((item) => /[A-Za-z]/.test(item)),
      synonyms: [],
      academic: [],
    };
  }

  if (!value || typeof value !== "object") {
    return { zh: [], en: [], synonyms: [], academic: [] };
  }

  const data = value as Record<string, unknown>;
  return {
    zh: stringArray(data.zh ?? data.chinese ?? data.zhTw),
    en: stringArray(data.en ?? data.english),
    synonyms: stringArray(data.synonyms ?? data.aliases),
    academic: stringArray(data.academic ?? data.academicTerms ?? data.sourceTypes),
  };
}

export function normalizeTopicExpansion(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const data = { ...(value as Record<string, unknown>) };

  data.expandedTopic = data.expandedTopic ?? data.normalizedTopic ?? data.topic;
  data.researchQuestions = data.researchQuestions ?? data.questions;
  data.searchKeywords = normalizeKeywordObject(data.searchKeywords ?? data.keywords);
  data.sourceStrategy = stringArray(data.sourceStrategy ?? data.sources ?? data.sourceTypes);
  data.exclusions = stringArray(data.exclusions ?? data.excludedMeanings ?? data.exclude);

  return data;
}

function zodErrorMessages(error: unknown): string[] {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return ["Unknown schema validation error."];
  }
  const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues ?? [];
  return issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
}

function normalizedFieldNames(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function containsAnyTerm(text: string, terms: string[]): string[] {
  const normalized = text.toLowerCase();
  return terms.filter((term) => normalized.includes(term.toLowerCase()));
}

function topicGroundingIssues(
  content: TopicExpansionContent,
  topic: string,
): string[] {
  const understood = understandTopic(topic);
  const combinedText = [
    content.expandedTopic,
    ...content.researchQuestions,
    ...content.searchKeywords.zh,
    ...content.searchKeywords.en,
    ...content.searchKeywords.synonyms,
    ...content.searchKeywords.academic,
    ...content.sourceStrategy,
    ...content.exclusions,
  ].join(" ");
  const issues: string[] = [];
  const driftHits = containsAnyTerm(
    combinedText,
    understood.excludedDriftTerms,
  );
  if (driftHits.length > 0) {
    issues.push(`drift_terms_detected: ${driftHits.join(", ")}`);
  }
  if (
    understood.canonicalTerms.length > 0 &&
    !containsAnyTerm(combinedText, [
      ...understood.canonicalTerms,
      ...understood.aliases,
      ...understood.englishTerms,
    ]).length
  ) {
    issues.push("canonical_topic_terms_missing");
  }
  if (
    understood.researchAngles.length > 0 &&
    understood.topicKind !== "unknown_or_noise"
  ) {
    const genericHits = containsAnyTerm(combinedText, [
      "現況與脈絡",
      "影響與風險",
      "改善與應用",
      "overview current status",
      "impact risk case study",
      "application strategy comparison",
    ]);
    if (
      genericHits.length > 0 &&
      containsAnyTerm(
        combinedText,
        understood.researchAngles.map((angle) => angle.researchQuestion),
      ).length === 0
    ) {
      issues.push("generic_template_detected_for_domain_topic");
    }
  }
  return issues;
}

function parseAndValidate(
  rawText: string,
  topic: string,
): {
  value: TopicExpansionContent | null;
  providerStatus: TopicExpansionDiagnostics["provider_status"];
  validationIssues?: string[];
  normalizedFields?: string[];
} {
  let parsed: unknown;
  try {
    parsed = safeJsonParse(rawText);
  } catch {
    return {
      value: null,
      providerStatus: "json_parse_failed",
      validationIssues: ["Raw LLM output did not contain a valid JSON object."],
    };
  }

  const normalized = normalizeTopicExpansion(parsed);
  const normalizedFields = normalizedFieldNames(normalized);
  const result = TopicExpansionContentSchema.safeParse(normalized);
  if (!result.success) {
    return {
      value: null,
      providerStatus: "schema_validation_failed",
      validationIssues: zodErrorMessages(result.error),
      normalizedFields,
    };
  }

  const groundingIssues = topicGroundingIssues(result.data, topic);
  if (groundingIssues.length > 0) {
    return {
      value: null,
      providerStatus: "schema_validation_failed",
      validationIssues: groundingIssues,
      normalizedFields,
    };
  }

  return { value: result.data, providerStatus: "ok", normalizedFields };
}

function fallbackModelFor(primaryModel: string): string | undefined {
  const configuredFallback = process.env.OLLAMA_FALLBACK_MODEL?.trim();
  if (configuredFallback) return configuredFallback;
  if (/gemma4:e4b/i.test(primaryModel)) return "gemma4:e2b";
  if (/gemma4:e2b/i.test(primaryModel)) return "qwen3:4b";
  if (/qwen3:8b/i.test(primaryModel)) return "qwen3:4b";
  return undefined;
}

function sample(text: string): string {
  return text.trim().slice(0, 800);
}

function defaultTopicModel(): string {
  return (
    process.env.LLM_MODEL?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    "qwen3:4b"
  );
}

function compactTopicHints(
  understood: ReturnType<typeof understandTopic>,
): string {
  const lines = [
    `normalizedTopic: ${understood.normalizedTopic}`,
    `canonicalEnglishTopic: ${understood.canonicalEnglishTopic || "(unresolved)"}`,
    `topicKind: ${understood.topicKind}`,
    `domain: ${understood.domain}`,
  ];

  if (understood.canonicalTerms.length > 0) {
    lines.push(`canonicalTerms: ${understood.canonicalTerms.slice(0, 4).join(", ")}`);
  }
  if (understood.aliases.length > 0) {
    lines.push(`aliases: ${understood.aliases.slice(0, 5).join(", ")}`);
  }
  if (understood.englishTerms.length > 0) {
    lines.push(`englishTerms: ${understood.englishTerms.slice(0, 5).join(", ")}`);
  }
  if (understood.coreConcepts.length > 0) {
    lines.push(`coreConcepts: ${understood.coreConcepts.slice(0, 6).join(", ")}`);
  }
  if (understood.researchAngles.length > 0) {
    lines.push(
      `researchAngles:\n${understood.researchAngles
        .slice(0, 3)
        .map((angle) => `- ${angle.label}: ${angle.researchQuestion}`)
        .join("\n")}`,
    );
  }
  if (understood.searchQueries.en.length > 0) {
    lines.push(`englishQueries: ${understood.searchQueries.en.slice(0, 4).join(" | ")}`);
  }
  if (understood.searchQueries.zh.length > 0) {
    lines.push(`chineseQueries: ${understood.searchQueries.zh.slice(0, 4).join(" | ")}`);
  }
  if (understood.excludedDriftTerms.length > 0) {
    lines.push(`avoidDrift: ${understood.excludedDriftTerms.slice(0, 8).join(", ")}`);
  }

  return lines.join("\n");
}

function understandingDiagnostics(
  understood: ReturnType<typeof understandTopic>,
): Pick<
  TopicExpansionDiagnostics,
  | "originalTopic"
  | "normalizedTopic"
  | "canonicalEnglishTopic"
  | "domain"
  | "coreConcepts"
  | "searchQueries"
> {
  return {
    originalTopic: understood.originalTopic,
    normalizedTopic: understood.normalizedTopic,
    canonicalEnglishTopic: understood.canonicalEnglishTopic,
    domain: understood.domain,
    coreConcepts: understood.coreConcepts.slice(0, 8),
    searchQueries: {
      zh: understood.searchQueries.zh.slice(0, 8),
      en: understood.searchQueries.en.slice(0, 8),
    },
  };
}

function taxonomyFallbackContent(
  understood: ReturnType<typeof understandTopic>,
): TopicExpansionContent | null {
  if (understood.topicKind === "unknown_or_noise" || understood.researchAngles.length === 0) {
    return null;
  }
  const angles = understood.researchAngles.slice(0, 4);
  return {
    expandedTopic: understood.normalizedTopic,
    researchQuestions: angles.map((angle) => angle.researchQuestion),
    searchKeywords: {
      zh: uniqueStrings([
        ...understood.canonicalTerms,
        ...understood.searchQueries.zh,
        ...angles.flatMap((angle) => angle.zhQueries.slice(0, 2)),
      ]).slice(0, 10),
      en: uniqueStrings([
        understood.canonicalEnglishTopic,
        ...understood.englishTerms,
        ...understood.searchQueries.en,
        ...angles.flatMap((angle) => angle.enQueries.slice(0, 2)),
      ]).slice(0, 10),
      synonyms: uniqueStrings(understood.aliases).slice(0, 8),
      academic: uniqueStrings(
        angles.flatMap((angle) => angle.suggestedSourceTypes.slice(0, 2)),
      ).slice(0, 8),
    },
    sourceStrategy: uniqueStrings(
      angles.flatMap((angle) => angle.suggestedSourceTypes.slice(0, 2)),
    ).slice(0, 6),
    exclusions: uniqueStrings(understood.excludedDriftTerms).slice(0, 6),
  };
}

function suspiciousAsciiTopic(topic: string): boolean {
  const normalized = topic.trim();
  if (!normalized) return false;
  if (/[\u3400-\u9fff]/.test(normalized)) return false;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)?$/.test(normalized)) return false;
  const words = normalized.split(/\s+/);
  return words.length <= 2 && words.every((word) => word.length >= 5);
}

function shouldRunTopicValidityCheck(
  input: TopicExpansionRequest,
  understood: ReturnType<typeof understandTopic>,
): boolean {
  return (
    suspiciousAsciiTopic(input.topic) &&
    understood.domain === "general_research" &&
    (understood.topicKind === "ambiguous" ||
      understood.topicKind === "broad_common_noun")
  );
}

function normalizeTopicValidityResult(
  value: unknown,
): { isValidTopic: boolean; reason: string } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.isValidTopic !== "boolean") return null;
  if (typeof data.reason !== "string" || !data.reason.trim()) return null;
  return {
    isValidTopic: data.isValidTopic,
    reason: data.reason.trim(),
  };
}

async function validateTopicMeaningfulness(
  input: TopicExpansionRequest,
  understood: ReturnType<typeof understandTopic>,
  fetchImpl: FetchImpl,
): Promise<{
  isValidTopic: boolean;
  reason: string;
} | null> {
  if (!shouldRunTopicValidityCheck(input, understood)) return null;

  try {
    const configuredValidityTimeout = Number(
      process.env.TOPIC_VALIDITY_TIMEOUT_MS,
    );
    const llmResult = await requestLlmText({
      operation: "topic_expansion",
      purpose: "planner",
      messages: [
        {
          role: "system",
          content: [
            "You classify whether an input is a meaningful research topic.",
            "Return JSON only.",
            "Do not invent meanings for random strings.",
            "Treat keyboard mash, nonsense syllables, and opaque gibberish as invalid.",
            "Treat real objects, organisms, technologies, foods, places, and social issues as valid broad topics even if they still need expansion.",
            `Your JSON must exactly match this shape: ${TOPIC_VALIDITY_JSON_SHAPE}`,
          ].join(" "),
        },
        {
          role: "user",
          content: [`topic: ${input.topic}`, compactTopicHints(understood)]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      temperature: TOPIC_EXPANSION_TEMPERATURE,
      maxTokens: 90,
      responseFormat: "json_object",
      llm: {
        baseUrl:
          process.env.OLLAMA_BASE_URL?.trim()?.endsWith("/v1")
            ? process.env.OLLAMA_BASE_URL.trim()
            : `${(process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "")}/v1`,
        model: defaultTopicModel(),
        timeoutMs:
          Number.isFinite(configuredValidityTimeout) &&
          configuredValidityTimeout > 0
            ? configuredValidityTimeout
            : Math.min(
                Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000,
                DEFAULT_TOPIC_VALIDITY_TIMEOUT_MS,
              ),
      },
      fetchImpl,
    });
    return normalizeTopicValidityResult(safeJsonParse(llmResult.content));
  } catch {
    return null;
  }
}

type TopicExpansionAttempt = {
  content: TopicExpansionContent | null;
  diagnostics: TopicExpansionDiagnostics;
  status: LlmStructuredStatus;
  message: string;
  primaryFailure?: TopicExpansionDiagnostics["provider_status"];
};

function canUseTaxonomyFallback(
  attempt: Pick<TopicExpansionAttempt, "status" | "diagnostics">,
): boolean {
  return (
    attempt.status === "unavailable" ||
    attempt.diagnostics.provider_status === "timeout" ||
    attempt.diagnostics.provider_status === "provider_unavailable" ||
    attempt.diagnostics.provider_status === "provider_error"
  );
}

async function tryOllamaExpansion(
  input: TopicExpansionRequest,
  model: string,
  fetchImpl: FetchImpl,
  context: { requestId: string; generatedAt: string },
): Promise<TopicExpansionAttempt> {
  const startedAt = Date.now();
  const understood = understandTopic(input.topic);
  const diagnostics: TopicExpansionDiagnostics = {
    llm_status: "success",
    provider: "ollama",
    model,
    temperature: TOPIC_EXPANSION_TEMPERATURE,
    cacheHit: false,
    requestId: context.requestId,
    generatedAt: context.generatedAt,
    ...understandingDiagnostics(understood),
    provider_status: "ok",
    fallbackUsed: false,
    fallback_used: false,
  };

  let rawText = "";
  const configuredTimeout = Number(process.env.TOPIC_EXPANSION_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout > 0
      ? configuredTimeout
      : Math.min(
          Number(process.env.OLLAMA_TIMEOUT_MS) || 60_000,
          DEFAULT_TOPIC_EXPANSION_TIMEOUT_MS,
        );
  try {
    const llmResult = await requestLlmText({
      operation: "topic_expansion",
      purpose: "planner",
      messages: [
        {
          role: "system",
          content: [
            "You expand research topics into concrete research directions.",
            "Return one JSON object only.",
            "Keep every direction specific, searchable, and evidence-oriented.",
            "Avoid generic templates like background, scope, definition, evidence, case study, dataset.",
            "Do not include markdown fences or extra explanation.",
            `Use this JSON shape exactly: ${JSON_SHAPE}`,
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `reportType: ${input.reportType ?? "研究報告"}`,
            `audience: ${input.audience ?? "高中"}`,
            `sourceMode: ${input.sourceMode ?? "需要，並生成參考文獻格式"}`,
            `language: ${input.language ?? "zh-TW"}`,
            compactTopicHints(understood),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      temperature: TOPIC_EXPANSION_TEMPERATURE,
      maxTokens: 600,
      llm: {
        baseUrl:
          process.env.OLLAMA_BASE_URL?.trim()?.endsWith("/v1")
            ? process.env.OLLAMA_BASE_URL.trim()
            : `${(process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434").replace(/\/+$/, "")}/v1`,
        model,
        timeoutMs,
      },
      fetchImpl,
    });
    rawText = llmResult.content;
    diagnostics.provider = llmResult.provider;
    diagnostics.model = llmResult.model;
  } catch (error) {
    const status = statusFromLlmError(error);
    diagnostics.provider_status =
      status === "unavailable"
        ? error instanceof Error && error.name === "LlmAdapterError" && "code" in error && error.code === "provider-timeout"
          ? "timeout"
          : "provider_unavailable"
        : "provider_error";
    diagnostics.llm_status = status;
    diagnostics.fallbackUsed = true;
    diagnostics.fallback_used = true;
    diagnostics.fallbackReason =
      error instanceof Error && error.name === "LlmAdapterError" && "code" in error
        ? String(error.code)
        : diagnostics.provider_status;
    diagnostics.latencyMs = Date.now() - startedAt;
    logLlmFallback({
      operation: "topic_expansion",
      status,
      provider: diagnostics.provider,
      model: diagnostics.model ?? model,
      endpoint: null,
      reason: diagnostics.fallbackReason,
      route: "/api/expand-topic",
    });
    return {
      content: null,
      diagnostics,
      status,
      message: messageFromStatus(status, "topic_expansion"),
      primaryFailure: diagnostics.provider_status,
    };
  }

  const parsed = parseAndValidate(rawText, input.topic);
  diagnostics.provider_status = parsed.providerStatus;
  diagnostics.latencyMs = Date.now() - startedAt;
  diagnostics.rawOutputSample = sample(rawText);
  diagnostics.rawResponseHash = hashText(rawText);
  diagnostics.validationIssues = parsed.validationIssues;
  diagnostics.validationErrors = parsed.validationIssues;
  diagnostics.normalizedFields = parsed.normalizedFields;

  if (!parsed.value) {
    diagnostics.llm_status = "error";
    diagnostics.fallbackUsed = true;
    diagnostics.fallback_used = true;
    diagnostics.fallbackReason = parsed.providerStatus;
    logLlmFallback({
      operation: "topic_expansion",
      status: "error",
      provider: diagnostics.provider,
      model: diagnostics.model ?? model,
      endpoint: null,
      reason: diagnostics.fallbackReason,
      route: "/api/expand-topic",
    });
    return {
      content: null,
      diagnostics,
      status: "error",
      message: "LLM 回傳格式異常或內容未通過主題 grounding 檢查。",
      primaryFailure: parsed.providerStatus,
    };
  }

  if (contentLooksGeneric(parsed.value)) {
    diagnostics.llm_status = "error";
    diagnostics.provider_status = "schema_validation_failed";
    diagnostics.fallbackUsed = true;
    diagnostics.fallback_used = true;
    diagnostics.fallbackReason = "LOCAL_LLM_GENERIC_TEMPLATE_REJECTED";
    diagnostics.validationIssues = [
      ...(diagnostics.validationIssues ?? []),
      "generic_template_detected_in_llm_topic_expansion",
    ];
    diagnostics.validationErrors = diagnostics.validationIssues;
    return {
      content: null,
      diagnostics,
      status: "error",
      message: "LLM 產生了通用模板方向，已改用領域規則擴寫。",
      primaryFailure: "schema_validation_failed",
    };
  }

  return {
    content: parsed.value,
    diagnostics,
    status: "success",
    message: "LLM topic expansion completed.",
  };
}

export async function expandTopicWithOllama(
  input: TopicExpansionRequest,
  options: { fetchImpl?: FetchImpl } = {},
): Promise<TopicExpansionResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const requestId = randomUUID();
  const generatedAt = new Date().toISOString();
  const understood = understandTopic(input.topic);
  const rulePlan = buildRuleBasedExpansion(input.topic, understood);
  const ruleContent = contentFromDirections(rulePlan);
  const ruleCoreConcepts =
    understood.coreConcepts.length > 0
      ? understood.coreConcepts.slice(0, 8)
      : rulePlan.canonicalEnglishTopic
        ? [rulePlan.canonicalEnglishTopic]
        : [];

  if (rulePlan.inputKind === "gibberish") {
    logLlmFallback({
      operation: "topic_expansion",
      status: "invalid_input",
      provider: process.env.LLM_PROVIDER?.trim() || "ollama",
      model: process.env.OLLAMA_MODEL?.trim() || "gemma4:e2b",
      endpoint: null,
      reason: "GIBBERISH_INPUT",
      route: "/api/expand-topic",
    });
    return buildTopicExpansionResponse({
      status: "invalid_input",
      message:
        rulePlan.message ??
        "查無足夠研究方向：輸入內容不像有效研究主題，請改用具體概念、物種、食品、技術或議題。",
      originalTopic: rulePlan.originalTopic,
      inputKind: rulePlan.inputKind,
      topicDomain: rulePlan.topicDomain,
      entityType: rulePlan.entityType,
      secondaryDomains: rulePlan.secondaryDomains,
      generationMode: "error",
      fallbackReason: "GIBBERISH_INPUT",
      keywordExpansion: null,
      candidateCount: 0,
      selectedLensIds: [],
      rejectedLensIds: [],
      lensRejectReasons: {},
      directions: [],
      canonicalEnglishTopic: rulePlan.canonicalEnglishTopic,
      coreConcepts: ruleCoreConcepts,
      diagnostics: {
        llm_status: "invalid_input",
        provider: "ollama",
        model: defaultTopicModel(),
        temperature: TOPIC_EXPANSION_TEMPERATURE,
        cacheHit: false,
        requestId,
        generatedAt,
        ...understandingDiagnostics(understood),
        inputKind: rulePlan.inputKind,
        topicDomain: rulePlan.topicDomain,
        entityType: rulePlan.entityType,
        secondaryDomains: rulePlan.secondaryDomains,
        generationMode: "error",
        modelUsed: defaultTopicModel(),
        llmLatencyMs: 0,
        keywordExpansion: null,
        candidateCount: 0,
        provider_status: "invalid_input",
        fallbackUsed: true,
        fallback_used: true,
        fallbackReason: "GIBBERISH_INPUT",
      },
    });
  }

  if (rulePlan.inputKind === "too_broad") {
    return buildTopicExpansionResponse({
      status: "success",
      message: rulePlan.message ?? "題目較廣，已先提供可延伸成報告題目的標題方向。",
      originalTopic: rulePlan.originalTopic,
      inputKind: rulePlan.inputKind,
      topicDomain: rulePlan.topicDomain,
      entityType: rulePlan.entityType,
      secondaryDomains: rulePlan.secondaryDomains,
      generationMode: "title_fallback",
      fallbackReason: "TOO_BROAD_INPUT",
      keywordExpansion: rulePlan.keywordExpansion,
      candidateCount: rulePlan.candidateCount,
      selectedLensIds: rulePlan.selectedLensIds,
      rejectedLensIds: rulePlan.rejectedLensIds,
      lensRejectReasons: rulePlan.lensRejectReasons,
      directions: rulePlan.directions,
      content: ruleContent,
      canonicalEnglishTopic: rulePlan.canonicalEnglishTopic,
      coreConcepts: ruleCoreConcepts,
      diagnostics: {
        llm_status: "success",
        provider: "ollama",
        model: defaultTopicModel(),
        temperature: TOPIC_EXPANSION_TEMPERATURE,
        cacheHit: false,
        requestId,
        generatedAt,
        ...understandingDiagnostics(understood),
        inputKind: rulePlan.inputKind,
        topicDomain: rulePlan.topicDomain,
        entityType: rulePlan.entityType,
        secondaryDomains: rulePlan.secondaryDomains,
        generationMode: "title_fallback",
        modelUsed: defaultTopicModel(),
        llmLatencyMs: 0,
        keywordExpansion: rulePlan.keywordExpansion,
        candidateCount: rulePlan.candidateCount,
        selectedLensIds: rulePlan.selectedLensIds,
        rejectedLensIds: rulePlan.rejectedLensIds,
        lensRejectReasons: rulePlan.lensRejectReasons,
        provider_status: "ok",
        fallbackUsed: true,
        fallback_used: true,
        fallbackReason: "TOO_BROAD_INPUT",
      },
    });
  }

  const primaryModel = defaultTopicModel();
  const primary = await tryOllamaExpansion(input, primaryModel, fetchImpl, {
    requestId,
    generatedAt,
  });

  if (primary.content) {
    const mergedContent = mergeRuleContentWithLlmContent(
      ruleContent,
      sanitizeTopicExpansionContent(primary.content, understood),
    );
    return buildTopicExpansionResponse({
      status: "success",
      message: "AI 已完成題目優化，並保留後續搜尋可用的研究資料。",
      originalTopic: rulePlan.originalTopic,
      inputKind: rulePlan.inputKind,
      topicDomain: rulePlan.topicDomain,
      entityType: rulePlan.entityType,
      secondaryDomains: rulePlan.secondaryDomains,
      generationMode: "llm_polished",
      keywordExpansion: rulePlan.keywordExpansion,
      candidateCount: rulePlan.candidateCount,
      selectedLensIds: rulePlan.selectedLensIds,
      rejectedLensIds: rulePlan.rejectedLensIds,
      lensRejectReasons: rulePlan.lensRejectReasons,
      directions: rulePlan.directions,
      content: mergedContent,
      modelUsed: primary.diagnostics.model ?? primaryModel,
      llmLatencyMs: primary.diagnostics.latencyMs,
      canonicalEnglishTopic: rulePlan.canonicalEnglishTopic,
      coreConcepts: ruleCoreConcepts,
      diagnostics: {
        ...primary.diagnostics,
        provider_status: "ok",
        llm_status: "success",
        fallbackUsed: false,
        fallback_used: false,
        fallbackReason: undefined,
        inputKind: rulePlan.inputKind,
        topicDomain: rulePlan.topicDomain,
        entityType: rulePlan.entityType,
        secondaryDomains: rulePlan.secondaryDomains,
        keywordExpansion: rulePlan.keywordExpansion,
        candidateCount: rulePlan.candidateCount,
        selectedLensIds: rulePlan.selectedLensIds,
        rejectedLensIds: rulePlan.rejectedLensIds,
        lensRejectReasons: rulePlan.lensRejectReasons,
        generationMode: "llm_polished",
      },
    });
  }
  const fallbackReason =
    primary.diagnostics.provider_status === "timeout"
      ? "LOCAL_LLM_TIMEOUT"
      : primary.diagnostics.provider_status === "json_parse_failed" ||
          primary.diagnostics.provider_status === "schema_validation_failed"
        ? "LOCAL_LLM_JSON_PARSE_FAILED"
        : primary.diagnostics.provider_status === "provider_unavailable" ||
            primary.diagnostics.provider_status === "ollama_unavailable"
          ? "LOCAL_LLM_UNAVAILABLE"
          : primary.diagnostics.fallbackReason ?? "LOCAL_LLM_UNAVAILABLE";
  return buildTopicExpansionResponse({
    status: "success",
    message:
      primary.diagnostics.provider_status === "timeout"
        ? "本機 LLM 題目優化逾時，已快速回傳標題候選。"
        : "本機 LLM 暫不可用，已改用規則式標題候選。",
    originalTopic: rulePlan.originalTopic,
    inputKind: rulePlan.inputKind,
    topicDomain: rulePlan.topicDomain,
    entityType: rulePlan.entityType,
    secondaryDomains: rulePlan.secondaryDomains,
    generationMode: "title_fallback",
    fallbackReason,
    keywordExpansion: rulePlan.keywordExpansion,
    candidateCount: rulePlan.candidateCount,
    selectedLensIds: rulePlan.selectedLensIds,
    rejectedLensIds: rulePlan.rejectedLensIds,
    lensRejectReasons: rulePlan.lensRejectReasons,
    directions: rulePlan.directions,
    content: ruleContent,
    modelUsed: primary.diagnostics.model ?? primaryModel,
    llmLatencyMs: primary.diagnostics.latencyMs,
    canonicalEnglishTopic: rulePlan.canonicalEnglishTopic,
    coreConcepts: ruleCoreConcepts,
    diagnostics: {
      ...primary.diagnostics,
      llm_status:
        primary.status === "unavailable" ? "unavailable" : primary.diagnostics.llm_status,
      inputKind: rulePlan.inputKind,
      topicDomain: rulePlan.topicDomain,
      entityType: rulePlan.entityType,
      secondaryDomains: rulePlan.secondaryDomains,
      keywordExpansion: rulePlan.keywordExpansion,
      candidateCount: rulePlan.candidateCount,
      selectedLensIds: rulePlan.selectedLensIds,
      rejectedLensIds: rulePlan.rejectedLensIds,
      lensRejectReasons: rulePlan.lensRejectReasons,
      generationMode: "title_fallback",
      modelUsed: primary.diagnostics.model ?? primaryModel,
      llmLatencyMs: primary.diagnostics.latencyMs,
      fallbackUsed: true,
      fallback_used: true,
      fallbackReason,
    },
  });
}
