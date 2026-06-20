import { dedupeSourceRecords, type SourceRecord } from "@workspace/api-zod";
import { createHash, randomUUID } from "node:crypto";
import {
  searchSourceProviders,
  type SourceFetch,
  type SourceProviderSearchResult,
  type SourceSearchOptions,
} from "./source-retrieval";
import {
  LlmAdapterError,
  requestOpenAICompatibleChatCompletion,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";
import { summarizeSourcesWithLlm } from "./source-summarizer";

export interface SearchIntentPlannerInput {
  topic: string;
  reportType?: string;
  audience?: string;
  language?: "zh-TW" | "en" | string;
  sourceMode?: string;
}

export type SearchIntentPlannerStatus =
  | "llm"
  | "rule_fallback"
  | "skipped"
  | "failed";

export interface SearchIntentPlan {
  normalizedTopic: string;
  primaryConcepts: string[];
  contextConcepts: string[];
  outcomeConcepts: string[];
  populationConcepts: string[];
  lowWeightTerms: string[];
  mustHaveTerms: string[];
  shouldHaveTerms: string[];
  penaltyTerms: string[];
  negativeTerms: string[];
  chineseQueries: string[];
  englishQueries: string[];
  reasoningNotes: string[];
  plannerStatus: SearchIntentPlannerStatus;
  fallbackUsed: boolean;
  topicType?: string;
  narrowedResearchQuestions?: ResearchReadyQuestion[];
  excludedDriftTerms?: string[];
}

export interface SearchIntentQuerySet {
  chinese: string[];
  english: string[];
  highPrecision: string[];
  broad: string[];
}

export interface SourceRelevanceDebug {
  sourceId: string;
  title: string;
  score: number;
  matchedPrimaryConcepts: string[];
  matchedMustHaveTerms: string[];
  matchedContextConcepts: string[];
  matchedOutcomeConcepts: string[];
  penalties: string[];
}

export interface ResearchReadyQuestion {
  title: string;
  researchAngle: string;
  whyResearchable: string;
  suggestedSourceTypes: string[];
  zhKeywords: string[];
  enKeywords: string[];
  primaryQueries: string[];
  secondaryQueries: string[];
  excludedDriftTerms: string[];
}

export interface SourceDecisionTrace {
  title: string;
  provider: string;
  url: string | null;
  relevanceScore: number;
  authorityScore: number;
  summaryUsabilityScore: number;
  finalScore: number;
  classification: string;
  rejectReason: string | null;
  matchedTerms: string[];
  driftTerms: string[];
}

export interface SearchTrace {
  workflowId: string;
  topic: string;
  normalizedTopic: string;
  topicHash: string;
  queryPlanHash: string;
  providerQueries: string[];
  candidateCount: number;
  dedupedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  sourceDecisions: SourceDecisionTrace[];
}

type SearchIntentRankedSource = SourceRecord & {
  relevanceLevel?: "primary" | "secondary" | "clue" | "low" | "off_topic";
};

export interface SearchIntentPlannerOptions {
  fetchImpl?: SourceFetch;
  llm?: Partial<OpenAICompatibleLlmConfig>;
}

export interface SearchIntentSourceSearchOptions extends SearchIntentPlannerOptions {
  queryLimit?: number;
  sourceSearch?: SourceSearchOptions;
  includeDebug?: boolean;
}

export interface SearchIntentSummary {
  primaryConcepts: string[];
  contextConcepts: string[];
  outcomeConcepts: string[];
  populationConcepts: string[];
  lowWeightTerms: string[];
  mustHaveTerms: string[];
  plannerStatus: SearchIntentPlannerStatus;
  fallbackUsed: boolean;
}

export interface SearchIntentSourceSearchResult {
  ok: boolean;
  topic: string;
  workflowId: string;
  topicHash: string;
  queryPlanHash: string;
  searchIntent: SearchIntentSummary;
  queries: SearchIntentQuerySet;
  results: SourceRecord[];
  sources: SourceRecord[];
  provider_status: SourceProviderSearchResult[];
  warnings: string[];
  planner: SearchIntentPlan;
  relevance_debug?: SourceRelevanceDebug[];
  searchTrace: SearchTrace;
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  keyword_expansion: {
    normalized_topic: string;
    domains: string[];
    search_queries: string[];
    english_queries: string[];
    chinese_queries: string[];
    preferred_source_types: string[];
    avoid_source_types: string[];
    reasoning_notes: string[];
    fallback_used: boolean;
    llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  };
  groups: SourceProviderSearchResult[];
}

type SearchIntentPlannerErrorCode =
  | "provider-unconfigured"
  | "provider-quota"
  | "provider-timeout"
  | "provider-failure"
  | "invalid-json";

class SearchIntentPlannerError extends Error {
  constructor(
    readonly code: SearchIntentPlannerErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SearchIntentPlannerError";
  }
}

const DEFAULT_SEARCH_INTENT_QUERY_LIMIT = 8;
const MAX_CANDIDATE_RESULTS = 80;
const MAX_QUERY_COUNT = 8;

const URBAN_HEAT_PRIMARY = [
  "urban heat island",
  "heat island effect",
  "thermal environment",
  "thermal comfort",
  "heat stress",
  "microclimate",
];

const URBAN_HEAT_CONTEXT = [
  "campus",
  "school environment",
  "educational buildings",
  "schoolyard",
];

const URBAN_HEAT_OUTCOMES = [
  "student comfort",
  "learning environment",
  "learning comfort",
];

const URBAN_HEAT_LOW_WEIGHT = [
  "students",
  "learning",
  "education",
  "student",
  "school",
];

const URBAN_HEAT_MUST_HAVE = [
  "heat",
  "thermal",
  "temperature",
  "microclimate",
  "urban heat island",
  "UHI",
  "熱",
  "高溫",
  "溫度",
  "微氣候",
  "熱島",
];

const URBAN_HEAT_PENALTIES = [
  "academic performance",
  "education achievement",
  "student achievement",
  "learning performance",
  "student satisfaction",
  "school satisfaction",
];

const SHORT_VIDEO_PRIMARY = [
  "short-form video",
  "short video",
  "TikTok",
  "social media",
  "digital media use",
  "sleep quality",
  "attention",
];

const SHORT_VIDEO_CONTEXT = [
  "high school",
  "secondary school",
  "adolescents",
  "teenagers",
  "高中生",
  "青少年",
];

const SHORT_VIDEO_OUTCOMES = [
  "sleep quality",
  "attention",
  "cognitive control",
  "daytime sleepiness",
];

const SHORT_VIDEO_LOW_WEIGHT = ["students", "education", "school"];

const SHORT_VIDEO_MUST_HAVE = [
  "short-form video",
  "short video",
  "TikTok",
  "social media",
  "digital media",
  "sleep",
  "attention",
  "短影音",
  "睡眠",
  "注意力",
];

const LLM_WRITING_PRIMARY = [
  "large language models",
  "LLM",
  "generative AI",
  "AI writing tools",
  "English writing",
  "second language writing",
  "英文寫作",
  "大型語言模型",
  "生成式 AI",
];

const LLM_WRITING_CONTEXT = [
  "English learning",
  "EFL",
  "ESL",
  "language education",
  "writing instruction",
  "higher education",
  "secondary education",
  "英文學習",
  "英語教育",
  "寫作教學",
];

const LLM_WRITING_OUTCOMES = [
  "writing quality",
  "writing feedback",
  "learner autonomy",
  "academic integrity",
  "writing anxiety",
  "revision",
  "寫作品質",
  "寫作回饋",
  "學習成效",
  "學術誠信",
];

const LLM_WRITING_MUST_HAVE = [
  "large language models",
  "LLM",
  "generative AI",
  "English writing",
  "English learning",
  "second language writing",
  "大型語言模型",
  "生成式 AI",
  "英文寫作",
  "英語學習",
];

const LLM_WRITING_LOW_WEIGHT = [
  "impact",
  "effect",
  "student",
  "learning",
  "影響",
  "學生",
  "學習",
];

const LLM_WRITING_PENALTIES = [
  "software engineering",
  "code generation",
  "prompt injection",
  "model benchmark",
  "computer vision",
  "程式碼生成",
  "軟體工程",
  "模型跑分",
];

const DUMPLING_PRIMARY = [
  "dumpling",
  "dumplings",
  "frozen dumpling",
  "jiaozi",
  "水餃",
  "餃子",
  "冷凍水餃",
];

const DUMPLING_CONTEXT = [
  "Taiwan",
  "Taiwanese food",
  "food labeling",
  "nutrition facts",
  "commercial frozen food",
  "台灣",
  "市售",
  "食品標示",
  "營養標示",
  "家庭飲食",
];

const DUMPLING_OUTCOMES = [
  "sodium",
  "sodium content",
  "nutrition",
  "protein",
  "fat",
  "calories",
  "dietary culture",
  "鈉含量",
  "營養成分",
  "熱量",
  "脂肪",
  "蛋白質",
  "飲食文化",
];

const DUMPLING_MUST_HAVE = [
  "dumpling",
  "dumplings",
  "frozen dumpling",
  "jiaozi",
  "水餃",
  "餃子",
  "冷凍水餃",
  "nutrition",
  "sodium",
  "food labeling",
  "營養",
  "鈉",
  "食品標示",
];

const DUMPLING_LOW_WEIGHT = [
  "food",
  "diet",
  "culture",
  "consumer",
  "飲食",
  "文化",
  "消費者",
];

const DUMPLING_DRIFT_TERMS = [
  "climate change",
  "greenhouse gas",
  "carbon dioxide",
  "global temperature",
  "atmospheric carbon dioxide",
  "IPCC",
  "NASA",
  "NOAA",
  "氣候變遷",
  "溫室氣體",
  "二氧化碳",
  "全球暖化",
];

const FRENCH_FRIES_PRIMARY = [
  "french fries",
  "fries",
  "fried potato",
  "potato chips",
  "potato products",
  "薯條",
  "炸薯條",
  "馬鈴薯製品",
  "速食薯條",
];

const FRENCH_FRIES_CONTEXT = [
  "fast food",
  "food processing",
  "restaurant food",
  "frozen potato products",
  "school meals",
  "速食",
  "油炸食品",
  "加工食品",
  "冷凍食品",
  "外食",
];

const FRENCH_FRIES_OUTCOMES = [
  "nutrition",
  "calories",
  "fat",
  "sodium",
  "acrylamide",
  "oil quality",
  "health risk",
  "營養成分",
  "熱量",
  "脂肪",
  "鈉含量",
  "丙烯醯胺",
  "健康風險",
];

const FRENCH_FRIES_MUST_HAVE = [
  "french fries",
  "fries",
  "fried potato",
  "potato products",
  "薯條",
  "炸薯條",
  "馬鈴薯",
  "nutrition",
  "sodium",
  "fat",
  "acrylamide",
  "營養",
  "鈉",
  "脂肪",
  "丙烯醯胺",
];

const FRENCH_FRIES_LOW_WEIGHT = [
  "food",
  "diet",
  "consumer",
  "fast food",
  "飲食",
  "消費者",
  "速食",
];

const FRENCH_FRIES_DRIFT_TERMS = [
  "computer chip",
  "semiconductor chip",
  "wood chips",
  "potato chip bag art",
  "french language",
  "french revolution",
  "晶片",
  "半導體",
  "法文",
  "法國大革命",
  "木屑",
];

const COLA_HEALTH_PRIMARY = [
  "cola",
  "soda",
  "soft drink",
  "sugar-sweetened beverage",
  "含糖飲料",
  "可樂",
  "碳酸飲料",
];

const COLA_HEALTH_CONTEXT = [
  "consumption",
  "dietary intake",
  "drinking habits",
  "攝取習慣",
  "飲用習慣",
];

const COLA_HEALTH_OUTCOMES = [
  "sugar",
  "caffeine",
  "health",
  "obesity",
  "metabolic health",
  "dental caries",
  "糖分",
  "咖啡因",
  "健康影響",
];

const COLA_HEALTH_MUST_HAVE = [
  "cola",
  "soda",
  "soft drink",
  "sugar-sweetened beverage",
  "可樂",
  "含糖飲料",
  "碳酸飲料",
  "sugar",
  "caffeine",
  "health",
  "糖",
  "咖啡因",
  "健康",
];

const COLA_HEALTH_LOW_WEIGHT = [
  "students",
  "education",
  "research",
  "impact",
  "學生",
  "研究",
  "影響",
];

const COLA_HEALTH_PENALTIES = [
  "coal",
  "coke fuel",
  "coking coal",
  "metallurgical coke",
  "climate change",
  "adult college entrance examination",
  "engineering management enrollment",
  "library book recommendation video",
  "vocational education",
  "招生",
  "高考",
  "工程管理",
  "圖書館推介",
  "職業教育",
  "成人高考",
];

const CLIMATE_CAUSES_PRIMARY = [
  "climate change",
  "global warming",
  "greenhouse gas",
  "溫室氣體",
  "氣候變遷",
  "全球暖化",
  "observed climate change",
  "climate indicators",
];

const CLIMATE_CAUSES_CONTEXT = [
  "fossil fuel",
  "化石燃料",
  "industrialization",
  "工業化",
  "land use",
  "土地利用",
  "deforestation",
  "森林砍伐",
  "IPCC",
  "WMO",
  "NASA",
  "NOAA",
];

const CLIMATE_CAUSES_OUTCOMES = [
  "emissions",
  "carbon dioxide",
  "methane",
  "radiative forcing",
  "observed warming",
  "global temperature",
  "CO2 concentration",
  "sea level",
  "emissions trend",
  "排放",
  "二氧化碳",
  "甲烷",
  "人為活動",
  "全球升溫",
  "溫室氣體濃度",
  "海平面",
];

const CLIMATE_CAUSES_MUST_HAVE = [
  "climate change",
  "global warming",
  "greenhouse gas",
  "fossil fuel",
  "氣候變遷",
  "全球暖化",
  "溫室氣體",
  "化石燃料",
  "emissions",
  "observed warming",
  "CO2 concentration",
  "IPCC",
  "排放",
];

const CLIMATE_CAUSES_LOW_WEIGHT = [
  "cause",
  "causes",
  "research",
  "impact",
  "study",
  "成因",
  "原因",
  "研究",
  "影響",
];

const CLIMATE_CAUSES_PENALTIES = [
  "tone sandhi",
  "beijing dialect",
  "jerusalem",
  "religious title",
  "enrollment",
  "library recommendation",
  "變調",
  "北京話",
  "耶路撒冷",
  "宗教稱號",
  "招生",
  "圖書館推薦",
];

const MARINE_MICROPLASTICS_PRIMARY = [
  "microplastic",
  "microplastics",
  "plastic pollution",
  "marine ecosystem",
  "marine ecology",
  "ocean pollution",
  "微塑膠",
  "塑膠微粒",
  "塑膠污染",
  "海洋生態",
];

const MARINE_MICROPLASTICS_CONTEXT = [
  "marine organisms",
  "marine environment",
  "ocean",
  "seawater",
  "sediment",
  "coastal ecosystem",
  "fish",
  "plankton",
  "food web",
  "海洋生物",
  "海水",
  "沉積物",
  "沿岸生態系",
  "食物網",
];

const MARINE_MICROPLASTICS_OUTCOMES = [
  "ingestion",
  "toxicity",
  "bioaccumulation",
  "biodiversity",
  "ecological risk",
  "ecosystem effects",
  "攝食",
  "毒性",
  "生物累積",
  "生物多樣性",
  "生態風險",
  "生態影響",
];

const MARINE_MICROPLASTICS_MUST_HAVE = [
  "microplastic",
  "microplastics",
  "plastic pollution",
  "marine",
  "ocean",
  "marine ecosystem",
  "微塑膠",
  "塑膠微粒",
  "塑膠污染",
  "海洋",
  "海洋生態",
];

const MARINE_MICROPLASTICS_LOW_WEIGHT = [
  "impact",
  "effect",
  "research",
  "study",
  "影響",
  "研究",
  "高中",
];

const MARINE_MICROPLASTICS_PENALTIES = [
  "urban heat island",
  "thermal comfort",
  "athlete",
  "exercise",
  "sports",
  "baseball",
  "elderly thermal environment",
  "language learning",
  "writing feedback",
  "熱島效應",
  "熱舒適",
  "熱環境",
  "運動",
  "棒球",
  "高齡者",
  "英文寫作",
];

const SPIDER_ECOLOGY_PRIMARY = [
  "spider",
  "spiders",
  "arachnid",
  "Araneae",
  "蜘蛛",
  "蛛形綱",
  "habitat",
  "microhabitat",
  "ecology",
  "distribution",
  "environment",
  "vegetation",
  "biodiversity",
  "predation",
  "anti-predator behavior",
];

const SPIDER_ECOLOGY_CONTEXT = [
  "habitat selection",
  "habitat requirements",
  "microhabitat selection",
  "web building",
  "web-building",
  "foraging behavior",
  "prey capture",
  "reproduction",
  "environmental adaptation",
  "distribution habitat",
  "species richness habitat",
  "environmental factors",
  "棲地選擇",
  "微棲地",
  "分布",
  "環境因子",
  "築網",
  "捕食",
  "避敵",
  "繁殖",
  "環境適應",
];

const SPIDER_ECOLOGY_OUTCOMES = [
  "survival",
  "survival strategy",
  "survival strategies",
  "adaptation",
  "behavior",
  "behaviour",
  "biodiversity",
  "生存",
  "生存策略",
  "適應",
  "行為",
  "生態適應",
];

const SPIDER_ECOLOGY_MUST_HAVE = [
  "spider",
  "spiders",
  "arachnid",
  "Araneae",
  "蜘蛛",
  "蛛形綱",
  "habitat",
  "microhabitat",
  "ecology",
  "distribution",
  "environment",
  "vegetation",
  "biodiversity",
  "棲地",
  "微棲地",
  "生態",
  "分布",
];

const SPIDER_ECOLOGY_LOW_WEIGHT = [
  "strategy",
  "strategies",
  "research",
  "study",
  "students",
  "education",
  "school",
  "策略",
  "研究",
  "學生",
  "教育",
  "高中",
];

const SPIDER_ECOLOGY_PENALTIES = [
  "national security education",
  "library recommendation",
  "library promotion",
  "reading promotion",
  "education administration",
  "government governance",
  "government management",
  "college library",
  "enrollment strategy",
  "education strategy",
  "engineering management",
  "marketing strategy",
  "teaching strategy",
  "student reading",
  "國家安全",
  "國家安全教育",
  "圖書館",
  "圖書館推廣",
  "圖書推介",
  "閱讀推廣",
  "教育行政",
  "政府治理",
  "工程管理",
  "行銷策略",
  "教育策略",
  "招生策略",
  "教學策略",
  "學生閱讀",
  "民辦本科",
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringArray(value: unknown, limit = 16): string[] {
  if (!Array.isArray(value)) return [];
  return unique(
    value.map(cleanString).filter((item): item is string => Boolean(item)),
  ).slice(0, limit);
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isUrbanHeatIslandTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  return hasAny(text, [
    /都市熱島|熱島效應|熱島|校園熱環境|熱舒適|熱壓力|微氣候|高溫|氣溫/,
    /urban heat island|heat island|uhi|thermal comfort|thermal environment|heat stress|microclimate|campus heat/i,
  ]);
}

function isShortVideoSleepAttentionTopic(
  input: SearchIntentPlannerInput,
): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasMediaCue = hasAny(text, [
    /短影音|社群媒體|社交媒體|影音|手機|螢幕/,
    /tiktok|reels|youtube shorts|short[- ]?form|social media|digital media/i,
  ]);
  const hasSleepCue = hasAny(text, [
    /睡眠|失眠|作息/,
    /sleep|insomnia|circadian/i,
  ]);
  const hasAttentionCue = hasAny(text, [
    /注意力|專注|認知/,
    /attention|cognition|focus/i,
  ]);
  return hasMediaCue && (hasSleepCue || hasAttentionCue);
}

function isLlmEnglishWritingLearningTopic(
  input: SearchIntentPlannerInput,
): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasLlmCue = hasAny(text, [
    /大型語言模型|生成式\s*ai|人工智慧|chatgpt|llm/i,
    /large language model|large language models|generative ai|chatgpt|\bllm\b/i,
  ]);
  const hasWritingCue = hasAny(text, [
    /英文寫作|英語寫作|英文學習|英語學習|寫作學習|寫作教學/,
    /english writing|english learning|second language writing|efl|esl|writing instruction/i,
  ]);
  return hasLlmCue && hasWritingCue;
}

function isDumplingTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  return hasAny(text, [
    /水餃|餃子|冷凍水餃|鍋貼/,
    /dumpling|dumplings|jiaozi|frozen dumpling/i,
  ]);
}

function isFrenchFriesTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  return hasAny(text, [
    /薯條|炸薯條|速食薯條|馬鈴薯條/,
    /french fries|fries|fried potato|potato products/i,
  ]);
}

function isColaHealthTopic(input: SearchIntentPlannerInput): boolean {
  const topicOnly = normalizeText(input.topic);
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasBeverageCue = hasAny(text, [
    /可樂|汽水|碳酸飲料|含糖飲料|飲料/,
    /cola|soda|soft drink|sugar[- ]sweetened beverage|carbonated beverage/i,
  ]);
  const hasHealthCue = hasAny(text, [
    /健康|糖|糖分|咖啡因|攝取|肥胖|代謝|蛀牙|飲用/,
    /health|sugar|caffeine|consumption|intake|obesity|metabolic|dental/i,
  ]);
  const hasFuelCue = hasAny(text, [
    /煤|焦煤|焦炭|燃料/,
    /\bcoal\b|coke fuel|coking coal|metallurgical coke/i,
  ]);
  return (
    hasBeverageCue &&
    !hasFuelCue &&
    (hasHealthCue || topicOnly === "可樂" || /^cola$/i.test(topicOnly))
  );
}

function isClimateChangeCauseTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasClimateCue = hasAny(text, [
    /氣候變遷|全球暖化|溫室氣體|氣候/,
    /climate change|global warming|greenhouse gas|climate/i,
  ]);
  const hasCauseCue = hasAny(text, [
    /成因|原因|現況|現狀|觀測|升溫|化石燃料|排放|工業化|土地利用|人為活動|溫室氣體濃度/,
    /cause|causes|current status|observed|warming|trend|fossil fuel|emission|industrialization|land use|anthropogenic|co2 concentration/i,
  ]);
  return hasClimateCue && hasCauseCue;
}

function isMarineMicroplasticsEcologyTopic(
  input: SearchIntentPlannerInput,
): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasMicroplasticsCue = hasAny(text, [
    /塑膠微粒|微塑膠|塑料微粒|塑膠污染/,
    /microplastic|microplastics|plastic pollution/i,
  ]);
  const hasMarineCue = hasAny(text, [
    /海洋|海水|海域|沿岸|海岸|海洋生態/,
    /marine|ocean|seawater|coastal|estuarine/i,
  ]);
  const hasEcologyCue = hasAny(text, [
    /生態|生物|食物鏈|食物網|毒性|攝食|累積|生物多樣性/,
    /ecology|ecosystem|organism|food web|toxicity|ingestion|bioaccumulation|biodiversity/i,
  ]);
  return hasMicroplasticsCue && (hasMarineCue || hasEcologyCue);
}

function isSpiderEcologyTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""}`);
  const hasSpiderCue = hasAny(text, [
    /蜘蛛|蛛形綱|蛛網/,
    /spider|spiders|arachnid|araneae/i,
  ]);
  const hasEcologyCue = hasAny(text, [
    /棲地|微棲地|生存|捕食|避敵|築網|繁殖|生態|適應|動物行為/,
    /habitat|microhabitat|survival|predation|anti[- ]?predator|web[- ]?building|ecology|adaptation|animal behavior|animal behaviour/i,
  ]);
  return hasSpiderCue && hasEcologyCue;
}

function topicTerms(topic: string): string[] {
  const latinTerms = topic
    .split(/[^A-Za-z0-9-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4);
  const chineseChunks = topic
    .split(/[，,。；;：:\s]+/)
    .map((term) => term.trim())
    .filter((term) => /[\u4e00-\u9fff]/.test(term) && term.length >= 2);
  return unique([...latinTerms, ...chineseChunks]).slice(0, 8);
}

function planReason(reason: string, extra?: string): string[] {
  return [
    reason,
    extra ??
      "Search concepts were weighted so generic population or education terms do not dominate provider queries.",
  ];
}

export function buildRuleBasedSearchIntent(
  input: SearchIntentPlannerInput,
  reason = "LLM planner unavailable; deterministic search intent fallback used.",
  plannerStatus: SearchIntentPlannerStatus = "rule_fallback",
): SearchIntentPlan {
  const normalizedTopic = input.topic.trim();

  if (isUrbanHeatIslandTopic(input)) {
    return {
      normalizedTopic,
      primaryConcepts: URBAN_HEAT_PRIMARY,
      contextConcepts: URBAN_HEAT_CONTEXT,
      outcomeConcepts: URBAN_HEAT_OUTCOMES,
      populationConcepts: ["students", "school community"],
      lowWeightTerms: URBAN_HEAT_LOW_WEIGHT,
      mustHaveTerms: URBAN_HEAT_MUST_HAVE,
      shouldHaveTerms: unique([
        ...URBAN_HEAT_CONTEXT,
        ...URBAN_HEAT_OUTCOMES,
        "outdoor thermal comfort",
      ]),
      penaltyTerms: URBAN_HEAT_PENALTIES,
      negativeTerms: [
        "unrelated student learning performance",
        "generic education satisfaction",
      ],
      chineseQueries: [
        "都市熱島效應 校園 熱舒適度",
        "校園熱環境 學生 舒適度",
        "都市熱島 校園微氣候 學習環境",
        "熱舒適度 學校環境 學生",
        "校園 高溫 熱壓力 學習環境",
      ],
      englishQueries: [
        "urban heat island campus thermal comfort students",
        "school campus microclimate thermal comfort",
        "urban heat island school environment thermal comfort",
        "outdoor thermal comfort students campus",
        "campus heat stress learning environment",
        "urban heat island educational buildings thermal environment",
      ],
      reasoningNotes: planReason(
        reason,
        "Urban heat island planning requires heat, thermal, temperature, microclimate, or UHI evidence before student or learning terms receive much weight.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isShortVideoSleepAttentionTopic(input)) {
    return {
      normalizedTopic,
      primaryConcepts: SHORT_VIDEO_PRIMARY,
      contextConcepts: SHORT_VIDEO_CONTEXT,
      outcomeConcepts: SHORT_VIDEO_OUTCOMES,
      populationConcepts: ["high school students", "adolescents"],
      lowWeightTerms: SHORT_VIDEO_LOW_WEIGHT,
      mustHaveTerms: SHORT_VIDEO_MUST_HAVE,
      shouldHaveTerms: [
        "adolescents",
        "high school students",
        "screen time",
        "problematic social media use",
      ],
      penaltyTerms: [
        "generic education technology",
        "student achievement",
        "academic performance",
      ],
      negativeTerms: ["unrelated classroom technology"],
      chineseQueries: [
        "短影音使用 高中生 注意力 睡眠品質",
        "短影音 社群媒體 青少年 睡眠 注意力",
        "數位媒體使用 高中生 睡眠品質 專注力",
        "短影音 使用 注意力 睡眠品質 實證研究",
      ],
      englishQueries: [
        "short-form video use high school students attention sleep quality",
        "short video social media adolescents attention sleep quality",
        "digital media use adolescents sleep quality attention",
        "problematic social media use sleep quality attention students",
      ],
      reasoningNotes: planReason(reason),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isLlmEnglishWritingLearningTopic(input)) {
    return {
      normalizedTopic,
      topicType: "ai_language_learning",
      primaryConcepts: LLM_WRITING_PRIMARY,
      contextConcepts: LLM_WRITING_CONTEXT,
      outcomeConcepts: LLM_WRITING_OUTCOMES,
      populationConcepts: ["students", "language learners", "學生", "英語學習者"],
      lowWeightTerms: LLM_WRITING_LOW_WEIGHT,
      mustHaveTerms: LLM_WRITING_MUST_HAVE,
      shouldHaveTerms: [
        "English writing learning",
        "LLM education",
        "AI-assisted writing",
        "second language writing",
        "writing feedback",
        "英文寫作學習",
        "AI 輔助寫作",
      ],
      penaltyTerms: LLM_WRITING_PENALTIES,
      negativeTerms: [
        "pure software engineering",
        "code generation only",
        "model benchmark without education or writing",
      ],
      chineseQueries: [
        "大型語言模型 英文寫作學習 影響",
        "生成式 AI 英語寫作 教學 回饋",
        "ChatGPT 英文寫作 學習成效",
        "大型語言模型 英語教育 寫作教學",
      ],
      englishQueries: [
        "large language models English writing learning",
        "LLM education English writing feedback",
        "generative AI second language writing learning",
        "ChatGPT English writing instruction EFL students",
        "AI-assisted writing tools English learning systematic review",
      ],
      narrowedResearchQuestions: [
        {
          title: "大型語言模型如何影響英文寫作品質與修訂歷程",
          researchAngle: "整理 LLM 對英文寫作草稿、回饋、修訂與文字品質的影響。",
          whyResearchable: "可使用語言教育、二語寫作與 AI 輔助寫作研究。",
          suggestedSourceTypes: ["academic_paper", "systematic_review", "education_study"],
          zhKeywords: ["大型語言模型", "英文寫作", "寫作回饋", "修訂", "學習成效"],
          enKeywords: ["large language models", "English writing", "writing feedback", "revision"],
          primaryQueries: [
            "large language models English writing learning",
            "LLM education English writing feedback",
          ],
          secondaryQueries: [
            "generative AI second language writing",
            "AI-assisted writing EFL students",
          ],
          excludedDriftTerms: LLM_WRITING_PENALTIES,
        },
        {
          title: "LLM 輔助英文寫作的學習風險與學術誠信",
          researchAngle: "分析依賴 AI 回饋、原創性、引用與學術誠信問題。",
          whyResearchable: "可查找教育科技、學術誠信與語言學習研究。",
          suggestedSourceTypes: ["academic_paper", "education_policy", "review"],
          zhKeywords: ["LLM", "英文寫作", "學術誠信", "AI 輔助寫作"],
          enKeywords: ["LLM", "academic integrity", "AI-assisted writing", "English learning"],
          primaryQueries: [
            "LLM English writing academic integrity",
            "AI-assisted writing English learning risks",
          ],
          secondaryQueries: ["ChatGPT EFL writing academic integrity"],
          excludedDriftTerms: LLM_WRITING_PENALTIES,
        },
      ],
      reasoningNotes: planReason(
        reason,
        "LLM English-writing searches must keep large-language-model, English writing, language learning, education, and writing-feedback terms together; software-only model topics are drift.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isDumplingTopic(input)) {
    const narrowedResearchQuestions: ResearchReadyQuestion[] = [
      {
        title: "台灣市售冷凍水餃的鈉含量與營養標示分析",
        researchAngle: "比較市售冷凍水餃營養標示中的鈉、熱量、脂肪與蛋白質。",
        whyResearchable: "可由食品標示、營養資料庫、政府或消費者檢測資料交叉驗證。",
        suggestedSourceTypes: ["government_food_database", "nutrition_label_dataset", "academic_paper"],
        zhKeywords: ["水餃", "冷凍水餃", "鈉含量", "營養成分", "食品標示"],
        enKeywords: ["dumpling", "frozen dumpling", "sodium content", "nutrition labeling"],
        primaryQueries: ["水餃 營養成分 鈉含量", "冷凍水餃 食品標示", "frozen dumpling nutrition sodium"],
        secondaryQueries: ["台灣 冷凍水餃 營養標示", "dumpling nutrition facts food labeling"],
        excludedDriftTerms: DUMPLING_DRIFT_TERMS,
      },
      {
        title: "水餃在台灣家庭飲食文化中的角色",
        researchAngle: "整理水餃作為家庭料理、便利食品與節慶飲食的文化脈絡。",
        whyResearchable: "可使用飲食文化研究、消費調查與食品產業資料作為證據。",
        suggestedSourceTypes: ["academic_paper", "industry_report", "government_or_institution"],
        zhKeywords: ["水餃", "台灣", "家庭飲食", "飲食文化", "便利食品"],
        enKeywords: ["dumpling", "Taiwanese food culture", "convenience food"],
        primaryQueries: ["台灣 水餃 飲食文化", "水餃 家庭飲食 台灣"],
        secondaryQueries: ["dumpling Taiwanese food culture", "frozen dumpling consumer Taiwan"],
        excludedDriftTerms: DUMPLING_DRIFT_TERMS,
      },
      {
        title: "冷凍水餃與現包水餃的營養差異",
        researchAngle: "比較加工、保存與內餡組成對營養標示和健康風險的影響。",
        whyResearchable: "可比對營養標示、食品成分資料與加工食品研究。",
        suggestedSourceTypes: ["nutrition_database", "academic_paper", "consumer_testing_report"],
        zhKeywords: ["冷凍水餃", "現包水餃", "營養差異", "內餡", "熱量"],
        enKeywords: ["frozen dumpling", "fresh dumpling", "nutrition comparison"],
        primaryQueries: ["冷凍水餃 現包水餃 營養差異", "水餃 內餡 熱量 脂肪 蛋白質"],
        secondaryQueries: ["frozen dumpling fresh dumpling nutrition comparison"],
        excludedDriftTerms: DUMPLING_DRIFT_TERMS,
      },
      {
        title: "市售水餃品牌的食品標示與消費者選擇",
        researchAngle: "分析品牌標示資訊如何影響消費者對健康與便利性的選擇。",
        whyResearchable: "可使用標示資料、消費者研究與市場調查資料。",
        suggestedSourceTypes: ["consumer_research", "market_report", "government_food_labeling"],
        zhKeywords: ["市售水餃", "食品標示", "消費者選擇", "品牌", "冷凍食品"],
        enKeywords: ["dumpling brand", "food labeling", "consumer choice", "frozen food"],
        primaryQueries: ["市售水餃 食品標示 消費者選擇", "冷凍水餃 品牌 營養標示"],
        secondaryQueries: ["frozen dumpling food labeling consumer choice"],
        excludedDriftTerms: DUMPLING_DRIFT_TERMS,
      },
    ];

    return {
      normalizedTopic,
      topicType: "food_nutrition_and_culture",
      primaryConcepts: DUMPLING_PRIMARY,
      contextConcepts: DUMPLING_CONTEXT,
      outcomeConcepts: DUMPLING_OUTCOMES,
      populationConcepts: [],
      lowWeightTerms: DUMPLING_LOW_WEIGHT,
      mustHaveTerms: DUMPLING_MUST_HAVE,
      shouldHaveTerms: [
        "nutrition facts",
        "food labeling",
        "Taiwan",
        "consumer choice",
        "營養標示",
        "台灣",
      ],
      penaltyTerms: DUMPLING_DRIFT_TERMS,
      negativeTerms: DUMPLING_DRIFT_TERMS,
      chineseQueries: [
        "水餃 營養成分 鈉含量",
        "冷凍水餃 食品標示",
        "台灣 水餃 飲食文化",
        "冷凍水餃 現包水餃 營養差異",
        "市售水餃 食品標示 消費者選擇",
      ],
      englishQueries: [
        "dumpling nutrition sodium",
        "frozen dumpling food labeling",
        "Taiwan dumpling food culture",
        "frozen dumpling nutrition facts",
        "dumpling nutrition labeling consumer choice",
      ],
      narrowedResearchQuestions,
      excludedDriftTerms: DUMPLING_DRIFT_TERMS,
      reasoningNotes: planReason(
        reason,
        "Dumpling searches must keep dumpling/jiaozi terms tied to nutrition, sodium, food labeling, Taiwan, or food-culture evidence; climate terms are hard drift.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isFrenchFriesTopic(input)) {
    const narrowedResearchQuestions: ResearchReadyQuestion[] = [
      {
        title: "速食薯條的營養成分與鈉含量分析",
        researchAngle: "比較薯條的熱量、脂肪、鈉含量與份量差異。",
        whyResearchable: "可由食品營養資料庫、速食品牌標示與公共衛生資料交叉驗證。",
        suggestedSourceTypes: ["nutrition_database", "food_labeling", "public_health_study"],
        zhKeywords: ["薯條", "速食", "營養成分", "鈉含量", "熱量"],
        enKeywords: ["french fries", "fast food", "nutrition", "sodium", "calories"],
        primaryQueries: ["薯條 營養成分 鈉含量", "速食薯條 熱量 脂肪", "french fries nutrition sodium calories"],
        secondaryQueries: ["fast food french fries nutrition label", "fried potato products nutrition"],
        excludedDriftTerms: FRENCH_FRIES_DRIFT_TERMS,
      },
      {
        title: "油炸方式與薯條健康風險",
        researchAngle: "檢視油炸溫度、用油品質與丙烯醯胺等加工風險。",
        whyResearchable: "可使用食品安全研究、加工條件資料與機構風險說明。",
        suggestedSourceTypes: ["food_safety_report", "academic_paper", "government_or_institution"],
        zhKeywords: ["薯條", "油炸", "丙烯醯胺", "食品安全", "用油品質"],
        enKeywords: ["french fries", "frying", "acrylamide", "food safety", "oil quality"],
        primaryQueries: ["薯條 油炸 丙烯醯胺 食品安全", "炸薯條 用油品質 健康風險"],
        secondaryQueries: ["french fries acrylamide food safety", "fried potato acrylamide health risk"],
        excludedDriftTerms: FRENCH_FRIES_DRIFT_TERMS,
      },
      {
        title: "青少年速食薯條攝取與飲食習慣",
        researchAngle: "分析薯條作為速食配餐對青少年外食與營養攝取的意義。",
        whyResearchable: "可使用飲食調查、速食消費研究與青少年營養研究。",
        suggestedSourceTypes: ["dietary_survey", "public_health_study", "consumer_research"],
        zhKeywords: ["薯條", "青少年", "速食", "外食", "飲食習慣"],
        enKeywords: ["french fries", "adolescents", "fast food", "dietary habits"],
        primaryQueries: ["薯條 青少年 速食 飲食習慣", "速食薯條 外食 營養攝取"],
        secondaryQueries: ["french fries adolescents fast food dietary habits"],
        excludedDriftTerms: FRENCH_FRIES_DRIFT_TERMS,
      },
      {
        title: "薯條包裝、供應鏈與環境負荷",
        researchAngle: "整理冷凍馬鈴薯、包裝與速食供應鏈的環境面向。",
        whyResearchable: "可查找食品供應鏈、包裝廢棄物與生命週期研究。",
        suggestedSourceTypes: ["life_cycle_assessment", "industry_report", "environmental_study"],
        zhKeywords: ["薯條", "冷凍馬鈴薯", "包裝", "供應鏈", "環境負荷"],
        enKeywords: ["french fries", "frozen potato products", "packaging", "life cycle assessment"],
        primaryQueries: ["薯條 包裝 供應鏈 環境", "冷凍馬鈴薯 製品 環境負荷"],
        secondaryQueries: ["frozen potato products life cycle assessment", "french fries packaging waste"],
        excludedDriftTerms: FRENCH_FRIES_DRIFT_TERMS,
      },
    ];

    return {
      normalizedTopic,
      topicType: "food_nutrition_and_safety",
      primaryConcepts: FRENCH_FRIES_PRIMARY,
      contextConcepts: FRENCH_FRIES_CONTEXT,
      outcomeConcepts: FRENCH_FRIES_OUTCOMES,
      populationConcepts: ["adolescents", "青少年"],
      lowWeightTerms: FRENCH_FRIES_LOW_WEIGHT,
      mustHaveTerms: FRENCH_FRIES_MUST_HAVE,
      shouldHaveTerms: [
        "fast food",
        "nutrition facts",
        "food labeling",
        "food safety",
        "dietary habits",
        "速食",
        "營養標示",
        "食品安全",
      ],
      penaltyTerms: FRENCH_FRIES_DRIFT_TERMS,
      negativeTerms: FRENCH_FRIES_DRIFT_TERMS,
      chineseQueries: [
        "薯條 營養成分 鈉含量",
        "速食薯條 熱量 脂肪",
        "薯條 油炸 丙烯醯胺 食品安全",
        "薯條 青少年 速食 飲食習慣",
        "薯條 包裝 供應鏈 環境",
      ],
      englishQueries: [
        "french fries nutrition sodium calories",
        "french fries acrylamide food safety",
        "fast food french fries dietary habits adolescents",
        "fried potato products nutrition label",
        "frozen potato products life cycle assessment",
      ],
      narrowedResearchQuestions,
      excludedDriftTerms: FRENCH_FRIES_DRIFT_TERMS,
      reasoningNotes: planReason(
        reason,
        "French-fries searches must keep fries/fried-potato terms tied to nutrition, sodium, fat, acrylamide, fast food, food safety, or packaging evidence; chip/semiconductor/French-language drift is negative.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isColaHealthTopic(input)) {
    return {
      normalizedTopic,
      topicType: "beverage_health_and_consumption",
      primaryConcepts: COLA_HEALTH_PRIMARY,
      contextConcepts: COLA_HEALTH_CONTEXT,
      outcomeConcepts: COLA_HEALTH_OUTCOMES,
      populationConcepts: [],
      lowWeightTerms: COLA_HEALTH_LOW_WEIGHT,
      mustHaveTerms: COLA_HEALTH_MUST_HAVE,
      shouldHaveTerms: [
        "systematic review",
        "adolescents",
        "dietary intake",
        "sugar intake",
        "caffeine intake",
        "health outcomes",
      ],
      penaltyTerms: COLA_HEALTH_PENALTIES,
      negativeTerms: [
        "coal or coke fuel",
        "climate change unless the user explicitly chooses packaging/environment",
        "adult education enrollment",
        "engineering management enrollment",
        "library book recommendation video",
        "generic education research",
      ],
      chineseQueries: [
        "可樂 糖分 咖啡因 攝取習慣 健康影響",
        "含糖飲料 攝取 健康 肥胖 咖啡因",
        "碳酸飲料 糖分 健康影響 文獻回顧",
        "可樂 飲用習慣 健康 研究",
      ],
      englishQueries: [
        "cola sugar caffeine consumption health effects",
        "soft drink consumption sugar caffeine health outcomes",
        "sugar-sweetened beverages consumption obesity metabolic health review",
        "soda intake caffeine sugar health systematic review",
      ],
      narrowedResearchQuestions: [
        {
          title: "含糖可樂攝取與青少年健康風險",
          researchAngle: "檢視糖分、咖啡因與含糖飲料攝取對青少年健康的影響。",
          whyResearchable: "可用公共衛生、營養流行病學與系統性回顧文獻驗證。",
          suggestedSourceTypes: ["public_health_study", "systematic_review", "nutrition_guideline"],
          zhKeywords: ["可樂", "含糖飲料", "糖分", "咖啡因", "青少年健康"],
          enKeywords: ["cola", "soft drink", "sugar intake", "caffeine", "adolescents health"],
          primaryQueries: ["可樂 糖分 青少年 健康", "含糖飲料 健康影響", "cola sugar intake adolescents"],
          secondaryQueries: ["soft drink health effects", "sugar-sweetened beverages adolescents health"],
          excludedDriftTerms: ["coal", "coke fuel", "climate change"],
        },
        {
          title: "無糖可樂與含糖可樂的成分比較",
          researchAngle: "比較糖、甜味劑、咖啡因與營養標示差異。",
          whyResearchable: "可由食品標示、營養資料庫與成分研究交叉比對。",
          suggestedSourceTypes: ["food_labeling", "nutrition_database", "academic_paper"],
          zhKeywords: ["可樂", "無糖可樂", "糖分", "咖啡因", "成分比較"],
          enKeywords: ["cola", "diet cola", "ingredient comparison", "caffeine", "sweetener"],
          primaryQueries: ["無糖可樂 成分比較", "可樂 咖啡因 糖分 標示", "diet cola ingredient comparison"],
          secondaryQueries: ["cola caffeine sugar nutrition label"],
          excludedDriftTerms: ["coal", "coke fuel"],
        },
        {
          title: "可樂包裝與塑膠／鋁罐廢棄物問題",
          researchAngle: "分析飲料包裝材料、回收與環境負荷。",
          whyResearchable: "可使用包裝生命週期研究、回收統計與政策資料。",
          suggestedSourceTypes: ["life_cycle_assessment", "government_report", "environmental_study"],
          zhKeywords: ["可樂", "包裝廢棄物", "塑膠瓶", "鋁罐", "回收"],
          enKeywords: ["cola", "beverage packaging waste", "plastic bottle", "aluminum can"],
          primaryQueries: ["可樂 包裝廢棄物 回收", "beverage packaging waste cola"],
          secondaryQueries: ["soft drink packaging life cycle assessment"],
          excludedDriftTerms: ["coal", "coke fuel"],
        },
        {
          title: "可樂品牌廣告對消費偏好的影響",
          researchAngle: "研究品牌廣告、青少年消費偏好與飲料選擇。",
          whyResearchable: "可使用消費者行為、廣告研究與市場調查資料。",
          suggestedSourceTypes: ["consumer_behavior_study", "advertising_research", "market_report"],
          zhKeywords: ["可樂", "品牌廣告", "消費偏好", "青少年", "飲料選擇"],
          enKeywords: ["cola", "brand advertising", "consumer preference", "soft drink"],
          primaryQueries: ["可樂 品牌廣告 消費偏好", "cola advertising consumer preference"],
          secondaryQueries: ["soft drink marketing adolescents preference"],
          excludedDriftTerms: ["coal", "coke fuel"],
        },
      ],
      excludedDriftTerms: ["coal", "coke fuel", "climate change"],
      reasoningNotes: planReason(
        reason,
        "Cola-health searches must keep beverage, sugar/caffeine, consumption, and health terms together; education or student terms cannot pass alone.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isMarineMicroplasticsEcologyTopic(input)) {
    return {
      normalizedTopic,
      topicType: "marine_microplastics_ecology",
      primaryConcepts: MARINE_MICROPLASTICS_PRIMARY,
      contextConcepts: MARINE_MICROPLASTICS_CONTEXT,
      outcomeConcepts: MARINE_MICROPLASTICS_OUTCOMES,
      populationConcepts: [],
      lowWeightTerms: MARINE_MICROPLASTICS_LOW_WEIGHT,
      mustHaveTerms: MARINE_MICROPLASTICS_MUST_HAVE,
      shouldHaveTerms: [
        "marine organisms",
        "food web",
        "bioaccumulation",
        "toxicity",
        "ecological risk",
        "海洋生物",
        "食物網",
        "生物累積",
        "生態風險",
      ],
      penaltyTerms: MARINE_MICROPLASTICS_PENALTIES,
      negativeTerms: [
        "urban heat island",
        "elderly thermal comfort",
        "sports physiology",
        "language writing education",
      ],
      chineseQueries: [
        "微塑膠 海洋生態 影響",
        "塑膠微粒 海洋生物 攝食 毒性",
        "塑膠污染 海洋 食物網 生物累積",
        "微塑膠 海洋生態風險 文獻回顧",
      ],
      englishQueries: [
        "microplastics marine ecosystem ecological effects",
        "microplastics marine organisms ingestion toxicity",
        "plastic pollution marine food web bioaccumulation",
        "microplastics ocean ecology systematic review",
        "microplastics marine environment ecological risk",
      ],
      narrowedResearchQuestions: [
        {
          title: "微塑膠如何影響海洋生物攝食與毒性風險",
          researchAngle: "整理海洋生物攝入微塑膠後的物理、化學與毒性影響。",
          whyResearchable: "可使用海洋污染、生態毒理與海洋生物研究文獻。",
          suggestedSourceTypes: ["academic_paper", "systematic_review", "ecotoxicology_study"],
          zhKeywords: ["微塑膠", "海洋生物", "攝食", "毒性", "塑膠污染"],
          enKeywords: ["microplastics", "marine organisms", "ingestion", "toxicity"],
          primaryQueries: [
            "microplastics marine organisms ingestion toxicity",
            "微塑膠 海洋生物 攝食 毒性",
          ],
          secondaryQueries: [
            "microplastics marine ecosystem ecological effects",
            "microplastics ocean ecology systematic review",
          ],
          excludedDriftTerms: MARINE_MICROPLASTICS_PENALTIES,
        },
        {
          title: "海洋微塑膠在食物網中的累積與生態風險",
          researchAngle: "分析微塑膠在食物網、沉積物與沿岸生態系中的傳遞。",
          whyResearchable: "可查找海洋食物網、生物累積與生態風險評估研究。",
          suggestedSourceTypes: ["academic_paper", "review", "risk_assessment"],
          zhKeywords: ["微塑膠", "食物網", "生物累積", "海洋生態風險"],
          enKeywords: ["microplastics", "food web", "bioaccumulation", "ecological risk"],
          primaryQueries: [
            "plastic pollution marine food web bioaccumulation",
            "microplastics marine ecosystem ecological risk",
          ],
          secondaryQueries: [
            "微塑膠 海洋 食物網 生物累積",
            "microplastics sediment marine ecology",
          ],
          excludedDriftTerms: MARINE_MICROPLASTICS_PENALTIES,
        },
      ],
      excludedDriftTerms: MARINE_MICROPLASTICS_PENALTIES,
      reasoningNotes: planReason(
        reason,
        "Marine microplastics searches must keep microplastic/plastic-pollution terms tied to marine, ocean, ecosystem, food-web, toxicity, or ecological-risk evidence; heat, sports, and writing-learning matches are drift.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isClimateChangeCauseTopic(input)) {
    return {
      normalizedTopic,
      primaryConcepts: CLIMATE_CAUSES_PRIMARY,
      contextConcepts: CLIMATE_CAUSES_CONTEXT,
      outcomeConcepts: CLIMATE_CAUSES_OUTCOMES,
      populationConcepts: [],
      lowWeightTerms: CLIMATE_CAUSES_LOW_WEIGHT,
      mustHaveTerms: CLIMATE_CAUSES_MUST_HAVE,
      shouldHaveTerms: [
        "anthropogenic emissions",
        "carbon dioxide",
        "methane",
        "land use change",
        "observed warming",
        "global temperature",
        "CO2 concentration",
        "emissions trend",
        "WMO state of climate",
        "IPCC",
        "systematic review",
      ],
      penaltyTerms: CLIMATE_CAUSES_PENALTIES,
      negativeTerms: [
        "beijing dialect tone sandhi",
        "jerusalem religious title",
        "enrollment advertisement",
        "library recommendation",
      ],
      chineseQueries: [
        "氣候變遷 成因 溫室氣體 化石燃料",
        "全球暖化 成因 二氧化碳 甲烷 排放",
        "氣候變遷 成因 人為活動 工業化 土地利用",
        "氣候變遷 現況 全球升溫 溫室氣體濃度",
        "氣候變遷 觀測 現況 IPCC",
        "氣候變遷 排放趨勢 二氧化碳濃度",
      ],
      englishQueries: [
        "climate change causes greenhouse gas emissions fossil fuels",
        "anthropogenic climate change causes carbon dioxide methane land use",
        "global warming attribution greenhouse gas fossil fuel combustion",
        "current status of climate change observed warming CO2 concentration",
        "IPCC climate change causes greenhouse gases current status",
        "observed climate change temperature trends emissions",
      ],
      reasoningNotes: planReason(
        reason,
        "Climate-change-cause searches must keep climate, greenhouse gas, fossil fuel, emissions, and land-use terms together; language or religion matches are negative.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isSpiderEcologyTopic(input)) {
    return {
      normalizedTopic,
      primaryConcepts: SPIDER_ECOLOGY_PRIMARY,
      contextConcepts: SPIDER_ECOLOGY_CONTEXT,
      outcomeConcepts: SPIDER_ECOLOGY_OUTCOMES,
      populationConcepts: [],
      lowWeightTerms: SPIDER_ECOLOGY_LOW_WEIGHT,
      mustHaveTerms: SPIDER_ECOLOGY_MUST_HAVE,
      shouldHaveTerms: [
        "spider habitat selection",
        "spider microhabitat",
        "spider predation behavior",
        "spider anti-predator behavior",
        "spider ecology",
        "arachnid ecology",
        "spider survival strategies",
        "spider distribution habitat",
        "spider environmental factors",
        "spider species richness habitat",
      ],
      penaltyTerms: SPIDER_ECOLOGY_PENALTIES,
      negativeTerms: [
        "national security education",
        "library promotion",
        "library recommendation video",
        "enrollment strategy",
        "generic education strategy",
        "government governance strategy",
        "government management",
        "engineering management",
        "marketing strategy",
      ],
      chineseQueries: [
        "蜘蛛 棲地 生態",
        "蜘蛛 微棲地",
        "蜘蛛 棲地選擇 微棲地",
        "蜘蛛 生態 分布",
        "蜘蛛 捕食 避敵 行為",
        "蜘蛛 築網 棲地",
      ],
      englishQueries: [
        "spider habitat",
        "spider habitat selection microhabitat",
        "spider microhabitat",
        "spider ecology",
        "spider distribution habitat",
        "spider species richness habitat",
        "spider environmental factors",
        "arachnid habitat ecology",
      ],
      reasoningNotes: planReason(
        reason,
        "Spider ecology searches must preserve the organism term (spider/spiders/arachnid/蜘蛛) with habitat, ecology, behavior, predation, or survival terms; generic strategy or education matches cannot pass alone.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  const genericTerms = topicTerms(normalizedTopic);
  const audience = cleanString(input.audience);
  return {
    normalizedTopic,
    primaryConcepts: genericTerms.length ? genericTerms : [normalizedTopic],
    contextConcepts: [cleanString(input.reportType)].filter(
      (term): term is string => Boolean(term),
    ),
    outcomeConcepts: [],
    populationConcepts: [],
    lowWeightTerms: [
      "students",
      "education",
      "learning",
      "高中",
      "策略",
      "strategy",
    ],
    mustHaveTerms: genericTerms.length ? genericTerms : [normalizedTopic],
    shouldHaveTerms: audience ? [audience] : [],
    penaltyTerms: [],
    negativeTerms: [],
    chineseQueries: unique([
      normalizedTopic,
      `${normalizedTopic} 文獻回顧`,
      `${normalizedTopic} 實證研究`,
    ]).slice(0, 4),
    englishQueries: unique([
      `${normalizedTopic} peer reviewed research`,
      `${normalizedTopic} systematic review`,
    ]).slice(0, 3),
    reasoningNotes: planReason(reason),
    plannerStatus,
    fallbackUsed: true,
  };
}

function extractJsonObject(text: string): unknown {
  try {
    return safeJsonParse(text);
  } catch (error) {
    if (error instanceof LlmAdapterError) {
      throw new SearchIntentPlannerError("invalid-json", error.message, error);
    }
    throw error;
  }
}

function fallbackReason(error: unknown): string {
  if (error instanceof SearchIntentPlannerError) {
    return `Search intent planner fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof LlmAdapterError) {
    return `Search intent planner fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return `Search intent planner fallback: ${error.message}`;
  }
  return "Search intent planner fallback: unknown provider failure.";
}

function statusFromError(error: unknown): SearchIntentPlannerStatus {
  if (
    (error instanceof SearchIntentPlannerError ||
      error instanceof LlmAdapterError) &&
    error.code === "provider-unconfigured"
  ) {
    return "skipped";
  }
  return "rule_fallback";
}

function llmStatusFromPlannerStatus(
  plan: SearchIntentPlan,
): "success" | "timeout" | "quota_exceeded" | "failed" | "skipped" {
  if (!plan.fallbackUsed && plan.plannerStatus === "llm") return "success";
  if (plan.plannerStatus === "skipped") return "skipped";
  const notes = normalizeText(plan.reasoningNotes.join(" "));
  if (notes.includes("provider-timeout")) return "timeout";
  if (notes.includes("provider-quota")) return "quota_exceeded";
  if (notes.includes("provider-unconfigured")) return "skipped";
  return "failed";
}

function mergeFamilyCriticalTerms(
  input: SearchIntentPlannerInput,
  plan: SearchIntentPlan,
): SearchIntentPlan {
  const fallback = buildRuleBasedSearchIntent(input);
  if (
    !isUrbanHeatIslandTopic(input) &&
    !isShortVideoSleepAttentionTopic(input) &&
    !isLlmEnglishWritingLearningTopic(input) &&
    !isDumplingTopic(input) &&
    !isFrenchFriesTopic(input) &&
    !isColaHealthTopic(input) &&
    !isMarineMicroplasticsEcologyTopic(input) &&
    !isClimateChangeCauseTopic(input) &&
    !isSpiderEcologyTopic(input)
  )
    return plan;

  return {
    ...plan,
    primaryConcepts: unique([
      ...plan.primaryConcepts,
      ...fallback.primaryConcepts,
    ]).slice(0, 14),
    contextConcepts: unique([
      ...plan.contextConcepts,
      ...fallback.contextConcepts,
    ]).slice(0, 12),
    outcomeConcepts: unique([
      ...plan.outcomeConcepts,
      ...fallback.outcomeConcepts,
    ]).slice(0, 12),
    populationConcepts: unique([
      ...plan.populationConcepts,
      ...fallback.populationConcepts,
    ]).slice(0, 8),
    lowWeightTerms: unique([
      ...plan.lowWeightTerms,
      ...fallback.lowWeightTerms,
    ]).slice(0, 12),
    mustHaveTerms: unique([
      ...plan.mustHaveTerms,
      ...fallback.mustHaveTerms,
    ]).slice(0, 18),
    shouldHaveTerms: unique([
      ...plan.shouldHaveTerms,
      ...fallback.shouldHaveTerms,
    ]).slice(0, 18),
    penaltyTerms: unique([
      ...plan.penaltyTerms,
      ...fallback.penaltyTerms,
    ]).slice(0, 14),
    negativeTerms: unique([
      ...plan.negativeTerms,
      ...fallback.negativeTerms,
    ]).slice(0, 10),
    chineseQueries: unique([
      ...plan.chineseQueries,
      ...fallback.chineseQueries,
    ]).slice(0, MAX_QUERY_COUNT),
    englishQueries: unique([
      ...plan.englishQueries,
      ...fallback.englishQueries,
    ]).slice(0, MAX_QUERY_COUNT),
    topicType: plan.topicType ?? fallback.topicType,
    narrowedResearchQuestions:
      plan.narrowedResearchQuestions?.length
        ? plan.narrowedResearchQuestions
        : fallback.narrowedResearchQuestions,
    excludedDriftTerms: unique([
      ...(plan.excludedDriftTerms ?? []),
      ...(fallback.excludedDriftTerms ?? []),
    ]),
  };
}

function coerceSearchIntentPlan(
  value: unknown,
  input: SearchIntentPlannerInput,
): SearchIntentPlan {
  if (!value || typeof value !== "object") {
    throw new SearchIntentPlannerError(
      "invalid-json",
      "LLM planner response was not a JSON object.",
    );
  }

  const data = value as Record<string, unknown>;
  const fallback = buildRuleBasedSearchIntent(
    input,
    "LLM planner returned incomplete planning data; deterministic fields were merged.",
  );
  const normalizedTopic =
    cleanString(data.normalizedTopic) ??
    cleanString(data.normalized_topic) ??
    input.topic.trim();
  const plan: SearchIntentPlan = {
    normalizedTopic,
    primaryConcepts: stringArray(
      data.primaryConcepts ?? data.primary_concepts,
      14,
    ),
    contextConcepts: stringArray(
      data.contextConcepts ?? data.context_concepts,
      12,
    ),
    outcomeConcepts: stringArray(
      data.outcomeConcepts ?? data.outcome_concepts,
      12,
    ),
    populationConcepts: stringArray(
      data.populationConcepts ?? data.population_concepts,
      8,
    ),
    lowWeightTerms: stringArray(
      data.lowWeightTerms ?? data.low_weight_terms,
      12,
    ),
    mustHaveTerms: stringArray(data.mustHaveTerms ?? data.must_have_terms, 18),
    shouldHaveTerms: stringArray(
      data.shouldHaveTerms ?? data.should_have_terms,
      18,
    ),
    penaltyTerms: stringArray(data.penaltyTerms ?? data.penalty_terms, 14),
    negativeTerms: stringArray(data.negativeTerms ?? data.negative_terms, 10),
    chineseQueries: stringArray(
      data.chineseQueries ?? data.chinese_queries,
      MAX_QUERY_COUNT,
    ),
    englishQueries: stringArray(
      data.englishQueries ?? data.english_queries,
      MAX_QUERY_COUNT,
    ),
    reasoningNotes: stringArray(data.reasoningNotes ?? data.reasoning_notes, 8),
    plannerStatus: "llm",
    fallbackUsed: false,
  };

  const merged: SearchIntentPlan = {
    ...plan,
    primaryConcepts: plan.primaryConcepts.length
      ? plan.primaryConcepts
      : fallback.primaryConcepts,
    contextConcepts: plan.contextConcepts.length
      ? plan.contextConcepts
      : fallback.contextConcepts,
    outcomeConcepts: plan.outcomeConcepts.length
      ? plan.outcomeConcepts
      : fallback.outcomeConcepts,
    populationConcepts: plan.populationConcepts.length
      ? plan.populationConcepts
      : fallback.populationConcepts,
    lowWeightTerms: plan.lowWeightTerms.length
      ? plan.lowWeightTerms
      : fallback.lowWeightTerms,
    mustHaveTerms: plan.mustHaveTerms.length
      ? plan.mustHaveTerms
      : fallback.mustHaveTerms,
    shouldHaveTerms: plan.shouldHaveTerms.length
      ? plan.shouldHaveTerms
      : fallback.shouldHaveTerms,
    penaltyTerms: plan.penaltyTerms.length
      ? plan.penaltyTerms
      : fallback.penaltyTerms,
    negativeTerms: plan.negativeTerms.length
      ? plan.negativeTerms
      : fallback.negativeTerms,
    chineseQueries: plan.chineseQueries.length
      ? plan.chineseQueries
      : fallback.chineseQueries,
    englishQueries: plan.englishQueries.length
      ? plan.englishQueries
      : fallback.englishQueries,
    reasoningNotes: plan.reasoningNotes.length
      ? plan.reasoningNotes
      : ["LLM planner returned valid JSON."],
  };

  return mergeFamilyCriticalTerms(input, merged);
}

async function requestLlmSearchIntentPlan(
  input: SearchIntentPlannerInput,
  options?: SearchIntentPlannerOptions,
): Promise<SearchIntentPlan> {
  try {
    const content = await requestOpenAICompatibleChatCompletion({
      purpose: "planner",
      temperature: 0,
      maxTokens: 1_000,
      responseFormat: "json_object",
      llm: options?.llm,
      fetchImpl: options?.fetchImpl,
      messages: [
        {
          role: "system",
          content: [
            "You are ResearchForge's research planner.",
            "Output valid JSON only. No markdown. No explanation.",
            "Use concrete searchable terms, never generic academic/evidence/source wording.",
            "Keys: normalizedTopic, primaryConcepts, contextConcepts, outcomeConcepts, populationConcepts, lowWeightTerms, mustHaveTerms, shouldHaveTerms, penaltyTerms, negativeTerms, chineseQueries, englishQueries, reasoningNotes.",
            "All keys except normalizedTopic are short string arrays.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `reportType: ${input.reportType ?? "研究報告"}`,
            `audience: ${input.audience ?? "高中"}`,
            `language: ${input.language ?? "zh-TW"}`,
            "Return 4-6 Chinese queries and 4-6 English queries.",
            "For short food or drink topics, include nutrition, labeling, public health, consumption, safety, culture, or packaging angles when relevant.",
          ].join("\n"),
        },
      ],
    });
    return coerceSearchIntentPlan(extractJsonObject(content), input);
  } catch (error) {
    if (error instanceof SearchIntentPlannerError) throw error;
    if (error instanceof LlmAdapterError) {
      throw new SearchIntentPlannerError(
        error.code,
        error.message,
        error,
      );
    }
    throw new SearchIntentPlannerError(
      "provider-failure",
      "LLM search intent planning request failed.",
      error,
    );
  }
}

export async function planSearchIntent(
  input: SearchIntentPlannerInput,
  options?: SearchIntentPlannerOptions,
): Promise<SearchIntentPlan> {
  const normalizedInput = {
    ...input,
    topic: input.topic.trim(),
  };

  try {
    return await requestLlmSearchIntentPlan(normalizedInput, options);
  } catch (error) {
    return buildRuleBasedSearchIntent(
      normalizedInput,
      fallbackReason(error),
      statusFromError(error),
    );
  }
}

export function normalizeTopicForHash(topic: string): string {
  return topic.replace(/[「」"'`]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function stableSearchHash(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function topicHashForSearch(topic: string): string {
  const normalized = normalizeTopicForHash(topic);
  if (!normalized) return "empty-topic";
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function queryPlanHashForSearch(
  plan: SearchIntentPlan,
  querySet: SearchIntentQuerySet,
): string {
  return stableSearchHash({
    normalizedTopic: plan.normalizedTopic,
    primaryConcepts: plan.primaryConcepts,
    mustHaveTerms: plan.mustHaveTerms,
    penaltyTerms: plan.penaltyTerms,
    chineseQueries: querySet.chinese,
    englishQueries: querySet.english,
    highPrecision: querySet.highPrecision,
    broad: querySet.broad,
  });
}

export function buildSearchIntentQueries(
  plan: SearchIntentPlan,
): SearchIntentQuerySet {
  const highPrecision = unique([
    ...plan.englishQueries.filter((query) => {
      const normalized = normalizeText(query);
      return (
        plan.mustHaveTerms.some((term) =>
          normalized.includes(normalizeText(term)),
        ) &&
        plan.primaryConcepts.some((term) =>
          normalized.includes(normalizeText(term)),
        )
      );
    }),
    ...plan.englishQueries.slice(0, 4),
  ]).slice(0, MAX_QUERY_COUNT);

  const broad = unique([
    ...plan.shouldHaveTerms
      .slice(0, 4)
      .map((term) =>
        `${plan.primaryConcepts[0] ?? plan.normalizedTopic} ${term}`.trim(),
      ),
    `${plan.primaryConcepts[0] ?? plan.normalizedTopic} ${plan.outcomeConcepts[0] ?? "data statistics"}`.trim(),
  ])
    .filter(Boolean)
    .slice(0, 4);

  return {
    chinese: plan.chineseQueries.slice(0, MAX_QUERY_COUNT),
    english: plan.englishQueries.slice(0, MAX_QUERY_COUNT),
    highPrecision,
    broad,
  };
}

function orderedQueries(
  querySet: SearchIntentQuerySet,
  queryLimit: number,
): string[] {
  return unique(
    [
      ...querySet.highPrecision,
      ...querySet.english,
      ...querySet.chinese,
      ...querySet.broad,
    ]
      .map((query) => query.trim())
      .filter(Boolean),
  ).slice(0, queryLimit);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContains(text: string, term: string): boolean {
  const cleanedTerm = normalizeText(term);
  if (!cleanedTerm) return false;
  const normalizedText = normalizeText(text);
  if (/^[a-z0-9][a-z0-9\s-]*$/i.test(cleanedTerm)) {
    const pattern = escapeRegExp(cleanedTerm).replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i").test(
      normalizedText,
    );
  }
  return normalizedText.includes(cleanedTerm);
}

function matchedTerms(text: string, terms: string[]): string[] {
  return unique(terms.filter((term) => textContains(text, term)));
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[。！？.!?])(?:\s+|(?=\S))/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isUrbanHeatPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [...plan.primaryConcepts, ...plan.mustHaveTerms].join(" "),
  );
  return (
    concepts.includes("urban heat island") ||
    concepts.includes("thermal comfort") ||
    concepts.includes("microclimate") ||
    concepts.includes("heat island") ||
    concepts.includes("uhi")
  );
}

function isFrenchFriesPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      ...plan.primaryConcepts,
      ...plan.mustHaveTerms,
      ...plan.contextConcepts,
      ...plan.penaltyTerms,
    ].join(" "),
  );
  return /french fries|fried potato|薯條|炸薯條|丙烯醯胺|acrylamide/.test(
    concepts,
  );
}

function isMarineMicroplasticsPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
    ].join(" "),
  );
  return (
    /microplastic|microplastics|plastic pollution|微塑膠|塑膠微粒/.test(
      concepts,
    ) &&
    /marine|ocean|seawater|coastal|海洋|海水|沿岸|海域|海洋生態/.test(
      concepts,
    )
  );
}

function sourceYearBonus(year: number | null): number {
  if (!year) return 0;
  if (year >= 2020) return 1.5;
  if (year >= 2015) return 1;
  return 0;
}

function sourceDebugId(source: SourceRecord): string {
  return source.id || source.doi || source.url || source.title;
}

function hasUsableAbstract(source: SourceRecord): boolean {
  return (source.abstract ?? "").trim().length >= 80;
}

function isSpiderEcologyPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.penaltyTerms,
    ].join(" "),
  );
  return /spider|spiders|arachnid|araneae|蜘蛛|蛛形綱/.test(concepts);
}

function evidenceSnippetScore(
  sentence: string,
  plan: SearchIntentPlan,
): number {
  const matchedPrimary = matchedTerms(sentence, plan.primaryConcepts).length;
  const matchedMust = matchedTerms(sentence, plan.mustHaveTerms).length;
  const matchedContext = matchedTerms(sentence, plan.contextConcepts).length;
  const matchedOutcome = matchedTerms(sentence, plan.outcomeConcepts).length;
  return (
    matchedPrimary * 7 +
    matchedMust * 12 +
    matchedContext * 3 +
    matchedOutcome * 5
  );
}

function sourceEvidenceScore(
  source: SourceRecord,
  plan: SearchIntentPlan,
): {
  directSnippetCount: number;
  snippetScore: number;
  bestSnippetScore: number;
} {
  const abstract = source.abstract ?? "";
  if (!hasUsableAbstract(source)) {
    return { directSnippetCount: 0, snippetScore: 0, bestSnippetScore: 0 };
  }

  const snippets = splitSentences(abstract)
    .map((sentence) => {
      const matchedPrimary = matchedTerms(sentence, plan.primaryConcepts);
      const matchedMust = matchedTerms(sentence, plan.mustHaveTerms);
      const score = evidenceSnippetScore(sentence, plan);
      return {
        score,
        direct: matchedPrimary.length > 0 && matchedMust.length > 0,
      };
    })
    .filter((snippet) => snippet.score > 0);

  if (snippets.length === 0) {
    return { directSnippetCount: 0, snippetScore: 0, bestSnippetScore: 0 };
  }

  return {
    directSnippetCount: snippets.filter((snippet) => snippet.direct).length,
    snippetScore: snippets.reduce((sum, snippet) => sum + snippet.score, 0),
    bestSnippetScore: Math.max(...snippets.map((snippet) => snippet.score)),
  };
}

export function scoreSourceRelevance(
  source: SourceRecord,
  plan: SearchIntentPlan,
): SourceRelevanceDebug {
  const title = source.title ?? "";
  const abstract = source.abstract ?? "";
  const combined = `${title} ${abstract}`;
  const matchedPrimaryTitle = matchedTerms(title, plan.primaryConcepts);
  const matchedPrimaryAbstract = matchedTerms(abstract, plan.primaryConcepts);
  const matchedMustTitle = matchedTerms(title, plan.mustHaveTerms);
  const matchedMustAbstract = matchedTerms(abstract, plan.mustHaveTerms);
  const matchedContextTitle = matchedTerms(title, plan.contextConcepts);
  const matchedContextAbstract = matchedTerms(abstract, plan.contextConcepts);
  const matchedOutcomeTitle = matchedTerms(title, plan.outcomeConcepts);
  const matchedOutcomeAbstract = matchedTerms(abstract, plan.outcomeConcepts);
  const matchedLowWeight = matchedTerms(combined, plan.lowWeightTerms);
  const matchedPenalties = matchedTerms(combined, plan.penaltyTerms);
  const matchedPrimaryConcepts = unique([
    ...matchedPrimaryTitle,
    ...matchedPrimaryAbstract,
  ]);
  const matchedMustHaveTerms = unique([
    ...matchedMustTitle,
    ...matchedMustAbstract,
  ]);
  const matchedContextConcepts = unique([
    ...matchedContextTitle,
    ...matchedContextAbstract,
  ]);
  const matchedOutcomeConcepts = unique([
    ...matchedOutcomeTitle,
    ...matchedOutcomeAbstract,
  ]);
  const penalties: string[] = [];
  const evidence = sourceEvidenceScore(source, plan);

  let score = 0;
  score += matchedPrimaryTitle.length * 8;
  score += matchedMustTitle.length * 8;
  score += matchedContextTitle.length * 3;
  score += matchedOutcomeTitle.length * 2;
  score += evidence.snippetScore;
  score += evidence.bestSnippetScore;
  score += evidence.directSnippetCount * 18;
  score += source.doi ? 1 : 0;
  score += hasUsableAbstract(source) ? 18 : -18;
  score += sourceYearBonus(source.year);

  if (matchedMustHaveTerms.length === 0) {
    score -= 12;
    penalties.push("missing_must_have_terms");
  }

  if (
    matchedLowWeight.length > 0 &&
    matchedPrimaryConcepts.length === 0 &&
    matchedMustHaveTerms.length === 0
  ) {
    score -= 10;
    penalties.push(`low_weight_only:${matchedLowWeight.join(",")}`);
  }

  if (matchedPenalties.length > 0 && matchedMustHaveTerms.length === 0) {
    score -= matchedPenalties.length * 4;
    penalties.push(`penalty_terms:${matchedPenalties.join(",")}`);
  }

  if (isSpiderEcologyPlan(plan)) {
    const subjectTerms = [
      "spider",
      "spiders",
      "arachnid",
      "araneae",
      "蜘蛛",
      "蛛形綱",
    ];
    const conceptTerms = [
      "habitat",
      "microhabitat",
      "ecology",
      "distribution",
      "environment",
      "vegetation",
      "biodiversity",
      "棲地",
      "微棲地",
      "生態",
      "分布",
    ];
    const subjectHits = matchedTerms(combined, subjectTerms);
    const conceptHits = matchedTerms(combined, conceptTerms);
    const driftHits = matchedTerms(combined, SPIDER_ECOLOGY_PENALTIES);
    const nonSpiderTaxonHits = matchedTerms(combined, [
      "spider monkey",
      "spider monkeys",
      "ateles",
    ]);
    if (subjectHits.length === 0) {
      score -= 45;
      penalties.push("missing_spider_subject");
    }
    if (conceptHits.length === 0) {
      score -= 35;
      penalties.push("missing_spider_habitat_or_ecology_concept");
    }
    if (
      driftHits.length > 0 &&
      (subjectHits.length === 0 || conceptHits.length === 0)
    ) {
      score -= 60;
      penalties.push(`spider_drift_terms:${driftHits.join(",")}`);
    }
    if (
      matchedTerms(combined, ["strategy", "strategies", "策略"]).length > 0 &&
      subjectHits.length === 0 &&
      conceptHits.length === 0
    ) {
      score -= 40;
      penalties.push("strategy_only_without_spider_ecology");
    }
    if (nonSpiderTaxonHits.length > 0) {
      score -= 160;
      penalties.push(`non_spider_taxon:${nonSpiderTaxonHits.join(",")}`);
    }
  }

  if (!hasUsableAbstract(source)) {
    penalties.push("metadata_only");
  }

  if (evidence.directSnippetCount === 0) {
    score -= 16;
    penalties.push("no_direct_evidence_snippet");
  }

  if (isUrbanHeatPlan(plan)) {
    const heatTerms = [
      "heat",
      "thermal",
      "temperature",
      "microclimate",
      "urban heat island",
      "uhi",
      "熱",
      "溫度",
      "微氣候",
      "熱島",
    ];
    if (matchedTerms(combined, heatTerms).length === 0) {
      score -= 20;
      penalties.push("urban_heat_without_heat_or_thermal_terms");
    }
  }

  if (isMarineMicroplasticsPlan(plan)) {
    const microplasticTerms = [
      "microplastic",
      "microplastics",
      "plastic pollution",
      "微塑膠",
      "塑膠微粒",
      "塑膠污染",
    ];
    const marineTerms = [
      "marine",
      "ocean",
      "seawater",
      "coastal",
      "estuarine",
      "sea",
      "marine ecosystem",
      "marine organisms",
      "海洋",
      "海水",
      "海域",
      "沿岸",
      "海洋生態",
      "海洋生物",
    ];
    const nonMarineTitleDrift = matchedTerms(title, [
      "soil",
      "terrestrial",
      "freshwater",
      "agricultural soil",
      "wastewater sludge",
      "landfill",
      "土壤",
      "陸域",
      "淡水",
      "農地",
    ]);
    const microplasticHits = matchedTerms(combined, microplasticTerms);
    const marineHits = matchedTerms(combined, marineTerms);
    const marineTitleHits = matchedTerms(title, marineTerms);
    if (microplasticHits.length === 0) {
      score -= 40;
      penalties.push("missing_microplastic_subject");
    }
    if (marineHits.length === 0) {
      score -= 45;
      penalties.push("missing_marine_context");
    }
    if (nonMarineTitleDrift.length > 0 && marineTitleHits.length === 0) {
      score = Math.min(score - 60, 45);
      penalties.push(`non_marine_microplastics_context:${nonMarineTitleDrift.join(",")}`);
    }
  }

  if (isFrenchFriesPlan(plan)) {
    const foodTerms = [
      "french fries",
      "fries",
      "fried potato",
      "potato products",
      "fast food",
      "acrylamide",
      "nutrition",
      "sodium",
      "fat",
      "薯條",
      "炸薯條",
      "馬鈴薯",
      "速食",
      "營養",
      "丙烯醯胺",
    ];
    const driftHits = matchedTerms(combined, FRENCH_FRIES_DRIFT_TERMS);
    const foodHits = matchedTerms(combined, foodTerms);
    if (driftHits.length > 0 && foodHits.length === 0) {
      score -= 80;
      penalties.push(`french_fries_drift_terms:${driftHits.join(",")}`);
    }
    if (
      /not\s+(?:about\s+)?(?:food|fried potato|potato products|french fries)|非(?:食品|薯條|馬鈴薯)/i.test(
        combined,
      )
    ) {
      score -= 120;
      penalties.push("negated_food_topic");
    }
  }

  return {
    sourceId: sourceDebugId(source),
    title: source.title,
    score,
    matchedPrimaryConcepts,
    matchedMustHaveTerms,
    matchedContextConcepts,
    matchedOutcomeConcepts,
    penalties,
  };
}

function hasPenalty(debug: SourceRelevanceDebug, exactOrPrefix: string): boolean {
  return debug.penalties.some(
    (penalty) =>
      penalty === exactOrPrefix || penalty.startsWith(`${exactOrPrefix}:`),
  );
}

function relevanceLevelFromDebug(debug: SourceRelevanceDebug): NonNullable<SourceRecord["relevanceLevel"]> {
  const metadataOnly = hasPenalty(debug, "metadata_only");
  const noDirectEvidence = hasPenalty(debug, "no_direct_evidence_snippet");
  const hardOffTopic =
    hasPenalty(debug, "spider_drift_terms") ||
    hasPenalty(debug, "french_fries_drift_terms") ||
    hasPenalty(debug, "negated_food_topic") ||
    hasPenalty(debug, "strategy_only_without_spider_ecology") ||
    hasPenalty(debug, "missing_spider_subject") ||
    hasPenalty(debug, "non_spider_taxon");

  if (hardOffTopic) return "off_topic";
  if (
    hasPenalty(debug, "missing_spider_habitat_or_ecology_concept") ||
    hasPenalty(debug, "missing_must_have_terms")
  ) {
    return debug.score >= 30 ? "low" : "off_topic";
  }
  if (metadataOnly) return debug.score >= 25 ? "clue" : "low";
  if (noDirectEvidence) return debug.score >= 60 ? "secondary" : "clue";
  if (
    debug.score >= 70 &&
    debug.matchedPrimaryConcepts.length > 0 &&
    debug.matchedMustHaveTerms.length > 0
  ) {
    return "primary";
  }
  if (debug.score >= 35) return "secondary";
  if (debug.score >= 15) return "low";
  return "off_topic";
}

function evidenceGroundingFromDebug(debug: SourceRelevanceDebug): SourceRecord["evidenceGrounding"] {
  if (hasPenalty(debug, "metadata_only")) return "metadata_only";
  if (hasPenalty(debug, "no_direct_evidence_snippet")) return "insufficient";
  return "abstract_grounded";
}

function reasonFromRelevanceDebug(
  level: NonNullable<SourceRecord["relevanceLevel"]>,
  debug: SourceRelevanceDebug,
): string {
  if (level === "primary") {
    const concepts = unique([
      ...debug.matchedMustHaveTerms,
      ...debug.matchedContextConcepts,
    ]).slice(0, 3);
    return concepts.length
      ? `直接命中${concepts.join("、")}，且摘要可支撐主題。`
      : "摘要與題名直接支撐研究主題。";
  }
  if (level === "secondary") {
    return "與研究主題有明確關聯，但較適合作為延伸或背景來源。";
  }
  if (level === "clue") {
    return "題名或摘要提供初步線索，但證據片段不足，已降為次要候選。";
  }
  if (level === "low") {
    return "只命中部分主題詞，尚不足以作為主要證據。";
  }
  return "未通過主題硬閘門，已排除主要候選。";
}

interface SourceWorkflowContext {
  workflowId: string;
  topic: string;
  normalizedTopic: string;
  topicHash: string;
  queryPlanHash: string;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sourceAuthorityScore(source: SourceRecord): number {
  let score = 45;
  if (source.sourceType === "Crossref" || source.sourceType === "OpenAlex") score += 25;
  if (source.sourceType === "Semantic Scholar") score += 20;
  if (source.doi) score += 15;
  const text = `${source.publisher ?? ""} ${source.containerTitle ?? ""} ${source.url ?? ""}`.toLowerCase();
  if (/\.gov|gov\.tw|who\.int|un\.org|oecd\.org|worldbank\.org|ipcc|nasa|noaa|epa/.test(text)) {
    score += 15;
  }
  if (/journal|期刊|university|大學|研究院/.test(text)) score += 5;
  return clampScore(score);
}

function sourceMetadataCompletenessScore(source: SourceRecord): number {
  const checks = [
    Boolean(source.title?.trim()),
    Boolean(source.abstract?.trim()),
    Boolean(source.url?.trim() || source.doi?.trim()),
    Boolean(source.year),
    source.authors.length > 0 || Boolean(source.publisher?.trim()),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function sourceSummaryUsabilityScore(
  source: SourceRecord,
  evidenceGrounding: SourceRecord["evidenceGrounding"],
): number {
  if (evidenceGrounding === "abstract_grounded" || evidenceGrounding === "snippet_grounded") return 85;
  if (evidenceGrounding === "metadata_only") return 25;
  const abstractLength = source.abstract?.trim().length ?? 0;
  if (abstractLength >= 160) return 75;
  if (abstractLength >= 80) return 60;
  if (abstractLength > 0) return 35;
  return 10;
}

function sourceRecencyScore(year: number | null): number {
  if (!year) return 45;
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - year);
  if (age <= 5) return 90;
  if (age <= 10) return 75;
  if (age <= 20) return 55;
  return 35;
}

function sourceLanguageFitScore(source: SourceRecord, plan: SearchIntentPlan): number {
  const text = `${source.title} ${source.abstract ?? ""}`;
  const matched = matchedTerms(text, [
    ...plan.primaryConcepts,
    ...plan.mustHaveTerms,
    ...plan.contextConcepts,
  ]);
  return matched.length > 0 ? 80 : 45;
}

function sourceDriftTerms(
  source: SourceRecord,
  plan: SearchIntentPlan,
  debug: SourceRelevanceDebug,
): string[] {
  const text = `${source.title} ${source.abstract ?? ""}`;
  const explicitDrift = matchedTerms(text, [
    ...plan.penaltyTerms,
    ...(plan.excludedDriftTerms ?? []),
    ...plan.negativeTerms,
  ]);
  const penaltyDrift = debug.penalties
    .filter((penalty) => penalty.includes(":"))
    .flatMap((penalty) => penalty.split(":").slice(1).join(":").split(","))
    .map((term) => term.trim())
    .filter(Boolean);
  return unique([...explicitDrift, ...penaltyDrift]);
}

function sourceFinalScore(scores: {
  relevanceScore: number;
  sourceQualityScore: number;
}): number {
  return Math.round(
    scores.relevanceScore * 0.6 +
      scores.sourceQualityScore * 0.4,
  );
}

function sourceClassification(input: {
  relevanceScore: number;
  authorityScore: number;
  finalScore: number;
  source: SourceRecord;
  relevanceLevel: NonNullable<SourceRecord["relevanceLevel"]>;
}): { classification: NonNullable<SourceRecord["classification"]>; rejectReason: string | null } {
  const hasRequiredVisibleMetadata =
    Boolean(input.source.title?.trim()) &&
    Boolean(input.source.url?.trim() || input.source.doi?.trim());

  if (input.relevanceScore < 20 && input.authorityScore >= 80) {
    return {
      classification: "trusted_but_off_topic",
      rejectReason: "trusted_source_but_topic_mismatch",
    };
  }
  if (input.relevanceScore < 20 || input.relevanceLevel === "off_topic") {
    return { classification: "off_topic", rejectReason: "low_topic_relevance" };
  }
  if (!hasRequiredVisibleMetadata) {
    return { classification: "low_quality", rejectReason: "incomplete_metadata" };
  }
  if (
    input.finalScore < 50 &&
    input.relevanceLevel !== "secondary" &&
    input.relevanceLevel !== "clue"
  ) {
    return { classification: "low_quality", rejectReason: "final_score_below_threshold" };
  }
  if (input.relevanceLevel === "primary") {
    return { classification: "primary", rejectReason: null };
  }
  return { classification: "review", rejectReason: null };
}

function sourceWithRelevanceMetadata(
  source: SourceRecord,
  plan: SearchIntentPlan,
  debug: SourceRelevanceDebug,
  workflow?: SourceWorkflowContext,
): SearchIntentRankedSource {
  const relevanceLevel = relevanceLevelFromDebug(debug);
  const evidenceGrounding = evidenceGroundingFromDebug(debug);
  const missingRequired = plan.mustHaveTerms.filter(
    (term) => !debug.matchedMustHaveTerms.includes(term),
  );
  const reason = reasonFromRelevanceDebug(relevanceLevel, debug);
  const relevanceScore = clampScore(debug.score);
  const authorityScore = sourceAuthorityScore(source);
  const summaryUsabilityScore = sourceSummaryUsabilityScore(source, evidenceGrounding);
  const metadataCompletenessScore = sourceMetadataCompletenessScore(source);
  const recencyScore = sourceRecencyScore(source.year);
  const languageFitScore = sourceLanguageFitScore(source, plan);
  const sourceQualityScore = clampScore(
    source.sourceQualityScore ?? metadataCompletenessScore,
  );
  const finalScore = sourceFinalScore({
    relevanceScore,
    sourceQualityScore,
  });
  const classification = sourceClassification({
    relevanceScore,
    authorityScore,
    finalScore,
    source,
    relevanceLevel,
  });
  const matchedTermsForSource = unique([
    ...debug.matchedPrimaryConcepts,
    ...debug.matchedMustHaveTerms,
    ...debug.matchedContextConcepts,
    ...debug.matchedOutcomeConcepts,
  ]);
  const driftTerms = sourceDriftTerms(source, plan, debug);
  const forcedRejected =
    classification.classification === "off_topic" ||
    classification.classification === "trusted_but_off_topic";

  return {
    ...source,
    ...(workflow ?? {}),
    relevanceLevel,
    relevanceScore,
    relevanceReasons: [reason],
    matchedCoreConcepts: debug.matchedPrimaryConcepts,
    missingCoreConcepts: [],
    matchedFacets: unique([
      ...debug.matchedMustHaveTerms,
      ...debug.matchedContextConcepts,
      ...debug.matchedOutcomeConcepts,
    ]),
    missingRequiredFacets: missingRequired,
    evidenceGrounding,
    sourceRelevanceReasonZhTw: reason,
    authorityScore,
    summaryUsabilityScore,
    metadataCompletenessScore,
    recencyScore,
    languageFitScore,
    finalScore,
    sourceQualityScore,
    scoreReasons: source.scoreReasons,
    classification: classification.classification,
    rejectReason: classification.rejectReason,
    matchedTerms: matchedTermsForSource,
    driftTerms,
    reviewState: forcedRejected ? "rejected" : source.reviewState,
    shouldShowInMainList:
      classification.classification === "primary" ||
      (classification.classification === "review" &&
        (relevanceLevel === "secondary" || relevanceLevel === "clue")),
    shouldRecommendAccept:
      (classification.classification === "primary" ||
        classification.classification === "review") &&
      relevanceLevel !== "low" &&
      relevanceLevel !== "off_topic",
  };
}

export function rerankSourcesBySearchIntent(
  sources: SourceRecord[],
  plan: SearchIntentPlan,
  workflow?: SourceWorkflowContext,
): {
  sources: SearchIntentRankedSource[];
  relevanceDebug: SourceRelevanceDebug[];
} {
  const scored = sources.map((source, index) => {
    const debug = scoreSourceRelevance(source, plan);
    const ranked = sourceWithRelevanceMetadata(source, plan, debug, workflow);
    return {
      source: ranked,
      index,
      debug,
    };
  });

  scored.sort((a, b) => {
    if ((b.source.finalScore ?? 0) !== (a.source.finalScore ?? 0)) {
      return (b.source.finalScore ?? 0) - (a.source.finalScore ?? 0);
    }
    if ((b.source.relevanceScore ?? 0) !== (a.source.relevanceScore ?? 0)) {
      return (b.source.relevanceScore ?? 0) - (a.source.relevanceScore ?? 0);
    }
    if ((b.source.sourceQualityScore ?? 0) !== (a.source.sourceQualityScore ?? 0)) {
      return (b.source.sourceQualityScore ?? 0) - (a.source.sourceQualityScore ?? 0);
    }
    if ((b.source.year ?? 0) !== (a.source.year ?? 0)) {
      return (b.source.year ?? 0) - (a.source.year ?? 0);
    }
    if ((b.source.citationCount ?? 0) !== (a.source.citationCount ?? 0)) {
      return (b.source.citationCount ?? 0) - (a.source.citationCount ?? 0);
    }
    return a.index - b.index;
  });

  return {
    sources: scored.map((item) => item.source),
    relevanceDebug: scored.map((item) => item.debug),
  };
}

function searchIntentSummary(plan: SearchIntentPlan): SearchIntentSummary {
  return {
    primaryConcepts: plan.primaryConcepts,
    contextConcepts: plan.contextConcepts,
    outcomeConcepts: plan.outcomeConcepts,
    populationConcepts: plan.populationConcepts,
    lowWeightTerms: plan.lowWeightTerms,
    mustHaveTerms: plan.mustHaveTerms,
    plannerStatus: plan.plannerStatus,
    fallbackUsed: plan.fallbackUsed,
  };
}

function resultWarnings(
  groups: SourceProviderSearchResult[],
  sources: SourceRecord[],
  plan: SearchIntentPlan,
): string[] {
  const warnings: string[] = [];
  const failedGroups = groups.filter((group) => !group.ok);
  if (failedGroups.length > 0) {
    warnings.push("部分來源提供者暫時無法使用，已顯示可用結果。");
  }
  if (plan.fallbackUsed) {
    warnings.push("LLM 搜尋意圖規劃不可用，已使用 deterministic fallback。");
  }
  if (sources.length === 0) {
    warnings.push("目前沒有找到符合搜尋意圖的來源。");
  }
  return unique(warnings);
}

function domainsFromPlan(plan: SearchIntentPlan): string[] {
  const concepts = normalizeText(
    [
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
    ].join(" "),
  );
  const domains = ["general_academic_research"];
  if (
    concepts.includes("spider") ||
    concepts.includes("arachnid") ||
    concepts.includes("ecology") ||
    concepts.includes("habitat") ||
    concepts.includes("棲地") ||
    concepts.includes("生態")
  ) {
    domains.push("biology", "ecology", "zoology", "environmental_science");
  }
  if (
    concepts.includes("short-form video") ||
    concepts.includes("digital media") ||
    concepts.includes("social media")
  ) {
    domains.push("digital_media");
  }
  if (concepts.includes("sleep")) domains.push("sleep_health");
  if (concepts.includes("attention") || concepts.includes("cognitive"))
    domains.push("psychology");
  if (
    concepts.includes("urban heat") ||
    concepts.includes("thermal") ||
    concepts.includes("microclimate") ||
    concepts.includes("heat island")
  ) {
    domains.push("environmental_science", "urban_studies");
  }
  if (
    concepts.includes("student") ||
    concepts.includes("school") ||
    concepts.includes("campus")
  ) {
    domains.push("education");
  }
  return unique(domains);
}

function preferredSourceTypes(plan: SearchIntentPlan): string[] {
  const types = [
    "peer_reviewed_journal",
    "systematic_review",
    "official_report",
    "university_or_research_institution_publication",
  ];
  const concepts = normalizeText(
    [
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
    ].join(" "),
  );
  if (
    concepts.includes("spider") ||
    concepts.includes("arachnid") ||
    concepts.includes("ecology") ||
    concepts.includes("habitat") ||
    concepts.includes("棲地") ||
    concepts.includes("生態")
  ) {
    types.push("zoology_study", "ecology_study", "natural_science_journal");
  }
  if (isUrbanHeatPlan(plan))
    types.push("urban_climate_or_built_environment_study");
  return unique(types);
}

function sourceDecisionTrace(source: SourceRecord): SourceDecisionTrace {
  return {
    title: source.title,
    provider: source.sourceType,
    url: source.url ?? null,
    relevanceScore: source.relevanceScore ?? 0,
    authorityScore: source.authorityScore ?? 0,
    summaryUsabilityScore: source.summaryUsabilityScore ?? 0,
    finalScore: source.finalScore ?? 0,
    classification: source.classification ?? source.relevanceLevel ?? "review",
    rejectReason: source.rejectReason ?? null,
    matchedTerms: source.matchedTerms ?? source.matchedFacets ?? [],
    driftTerms: source.driftTerms ?? [],
  };
}

export async function searchIntentSources(
  input: SearchIntentPlannerInput,
  options?: SearchIntentSourceSearchOptions,
): Promise<SearchIntentSourceSearchResult> {
  const plan = await planSearchIntent(input, options);
  const querySet = buildSearchIntentQueries(plan);
  const workflowId = randomUUID();
  const topicHash = topicHashForSearch(plan.normalizedTopic);
  const queryPlanHash = queryPlanHashForSearch(plan, querySet);
  const workflowContext: SourceWorkflowContext = {
    workflowId,
    topic: input.topic.trim(),
    normalizedTopic: plan.normalizedTopic,
    topicHash,
    queryPlanHash,
  };
  const queryLimit =
    options?.queryLimit ??
    (Number(process.env.SEARCH_INTENT_QUERY_LIMIT) ||
      DEFAULT_SEARCH_INTENT_QUERY_LIMIT);
  const queries = orderedQueries(querySet, queryLimit);
  const groups = (
    await Promise.all(
      queries.map((query) =>
        searchSourceProviders(
          query,
          options?.sourceSearch ?? { fetchImpl: options?.fetchImpl },
        ),
      ),
    )
  ).flat();
  const candidateCount = groups.reduce((sum, group) => sum + group.results.length, 0);
  const dedupedSources = dedupeSourceRecords(
    groups.flatMap((group) => group.results),
  );
  const reranked = rerankSourcesBySearchIntent(dedupedSources, plan, workflowContext);
  const sources = await summarizeSourcesWithLlm(
    plan.normalizedTopic,
    reranked.sources.slice(0, MAX_CANDIDATE_RESULTS),
    {
      llm: options?.llm,
      fetchImpl: options?.fetchImpl,
    },
  );
  const primaryCount = sources.filter(
    (source) => source.relevanceLevel === "primary",
  ).length;
  const secondaryCount = sources.filter(
    (source) =>
      source.relevanceLevel === "secondary" || source.relevanceLevel === "clue",
  ).length;
  const lowCount = sources.filter(
    (source) =>
      source.relevanceLevel === "low" || source.relevanceLevel === "off_topic",
  ).length;
  const plannerLlmStatus = llmStatusFromPlannerStatus(plan);
  const rejectedCount = sources.filter(
    (source) =>
      source.reviewState === "rejected" ||
      source.classification === "off_topic" ||
      source.classification === "trusted_but_off_topic",
  ).length;
  const searchTrace: SearchTrace = {
    workflowId,
    topic: input.topic.trim(),
    normalizedTopic: plan.normalizedTopic,
    topicHash,
    queryPlanHash,
    providerQueries: unique(groups.map((group) => group.query)),
    candidateCount,
    dedupedCount: dedupedSources.length,
    acceptedCount: sources.filter((source) => source.reviewState === "accepted").length,
    rejectedCount,
    sourceDecisions: sources.map(sourceDecisionTrace),
  };

  return {
    ok: true,
    topic: plan.normalizedTopic,
    workflowId,
    topicHash,
    queryPlanHash,
    searchIntent: searchIntentSummary(plan),
    queries: querySet,
    results: sources,
    sources,
    provider_status: groups,
    warnings: unique([
      ...resultWarnings(groups, sources, plan),
      ...(sources.length > 0 && primaryCount < 3
        ? [
            `主要來源不足，已找到 ${primaryCount} 筆主要來源與 ${secondaryCount} 筆延伸候選；可接受至少 3 筆主要／延伸來源生成初步報告。另有 ${lowCount} 筆低相關來源已折疊。`,
          ]
        : []),
    ]),
    planner: plan,
    ...((options?.includeDebug ?? process.env.NODE_ENV === "development")
      ? { relevance_debug: reranked.relevanceDebug.slice(0, MAX_CANDIDATE_RESULTS) }
      : {}),
    searchTrace,
    llm_status: plannerLlmStatus,
    keyword_expansion: {
      normalized_topic: plan.normalizedTopic,
      domains: domainsFromPlan(plan),
      search_queries: queries,
      english_queries: plan.englishQueries,
      chinese_queries: plan.chineseQueries,
      preferred_source_types: preferredSourceTypes(plan),
      avoid_source_types: [
        "uncited_blog",
        "marketing_article",
        "content_farm",
        "ai_generated_article_without_sources",
      ],
      reasoning_notes: plan.reasoningNotes,
      fallback_used: plan.fallbackUsed,
      llm_status: plannerLlmStatus,
    },
    groups,
  };
}
