import {
  dedupeSourceRecords,
  type SourceRecord,
} from "@workspace/api-zod";
import {
  searchSourceProviders,
  type SourceFetch,
  type SourceProviderSearchResult,
  type SourceSearchOptions,
} from "./source-retrieval";
import { getReportModelConfig } from "./report-model-config";

export interface SearchIntentPlannerInput {
  topic: string;
  reportType?: string;
  audience?: string;
  language?: "zh-TW" | "en" | string;
  sourceMode?: string;
}

export type SearchIntentPlannerStatus = "llm" | "rule_fallback" | "skipped" | "failed";

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
  topicKind?: SearchIntentTopicKind;
  domain?: SearchIntentFallbackFamily;
  fallbackFamily?: SearchIntentFallbackFamily | null;
  legacyTemplateHits?: string[];
}

export interface SearchIntentQuerySet {
  chinese: string[];
  english: string[];
  highPrecision: string[];
  broad: string[];
}

export type SearchIntentTopicKind = "unknown_or_noise" | "single_term" | "descriptive_topic";
export type SearchIntentFallbackFamily =
  | "food"
  | "biology"
  | "mechanism"
  | "health"
  | "environment"
  | "social"
  | "general_object"
  | "unknown";

export interface SearchIntentTopicProfile {
  topicKind: SearchIntentTopicKind;
  domain: SearchIntentFallbackFamily;
  fallbackFamily: SearchIntentFallbackFamily | null;
  shouldSearchNow: boolean;
}

interface LegacyAngleFilterResult {
  queries: string[];
  hits: string[];
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

export interface SearchIntentLlmConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface SearchIntentPlannerOptions {
  fetchImpl?: SourceFetch;
  llm?: Partial<SearchIntentLlmConfig>;
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
  searchIntent: SearchIntentSummary;
  queries: SearchIntentQuerySet;
  results: SourceRecord[];
  sources: SourceRecord[];
  provider_status: SourceProviderSearchResult[];
  warnings: string[];
  planner: SearchIntentPlan;
  relevance_debug?: SourceRelevanceDebug[];
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

const DEFAULT_SEARCH_INTENT_LLM_TIMEOUT_MS = 8000;
const DEFAULT_SEARCH_INTENT_QUERY_LIMIT = 6;
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

const SHORT_VIDEO_LOW_WEIGHT = [
  "students",
  "education",
  "school",
];

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
];

const CLIMATE_CAUSES_OUTCOMES = [
  "emissions",
  "carbon dioxide",
  "methane",
  "radiative forcing",
  "排放",
  "二氧化碳",
  "甲烷",
  "人為活動",
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

const LEGACY_GENERIC_PHRASES = [
  /\bdefinition\s+scope\s+evidence\b/i,
  /\bmeasurable\s+indicators\b/i,
  /\bcase\s+study\s+dataset\b/i,
  /\bevidence\s+research\b/i,
];

const LEGACY_GENERIC_TOKEN_SET = new Set([
  "definition",
  "scope",
  "evidence",
  "measurable",
  "indicators",
  "case",
  "study",
  "dataset",
  "research",
]);

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

function asciiTokens(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function fallbackTopicStem(topic: string): string {
  const stem = topic
    .replace(/[()（）]/g, " ")
    .replace(/的工作原理|工作原理|運動原理|原理|機制|研究|探討|分析|影響|作用|效果|關係/g, " ")
    .replace(/[對與及和之的]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stem || topic.trim();
}

function isUnknownOrNoiseTopic(topic: string): boolean {
  const trimmed = topic.trim();
  if (!trimmed) return true;
  if (/^[^A-Za-z0-9一-鿿]+$/.test(trimmed)) return true;
  if (/^[A-Za-z0-9_-]{6,}$/.test(trimmed) && !/[aeiou]/i.test(trimmed) && !/[一-鿿]/.test(trimmed)) {
    return true;
  }
  return false;
}

export function inferSearchIntentTopicProfile(topic: string): SearchIntentTopicProfile {
  const trimmed = topic.trim();
  if (isUnknownOrNoiseTopic(trimmed)) {
    return {
      topicKind: "unknown_or_noise",
      domain: "unknown",
      fallbackFamily: null,
      shouldSearchNow: false,
    };
  }

  const descriptiveTopic = /[對與及和之的]/.test(trimmed)
    || /影響|原理|機制|作用|效果|關係|回收|成效|健康|環境|生態|工作/.test(trimmed)
    || trimmed.includes(" ");

  let family: SearchIntentFallbackFamily = "general_object";
  if (hasAny(trimmed, [/健康|人體|胃|睡眠|疾病|感染|風險|咖啡因|桿菌|細菌|病毒|毒理|症狀/, /health|human|sleep|disease|infection|risk|caffeine|bacteria|virus|toxic/i])) {
    family = "health";
  } else if (hasAny(trimmed, [/環境|生態|海洋|污染|氣候|回收|永續|廢棄物|塑膠/, /environment|ecology|marine|pollution|climate|recycling|sustainability|waste/i])) {
    family = "environment";
  } else if (hasAny(trimmed, [/學習|學生|教育|成效|教學|社會|社群|AI|人工智慧/, /learning|student|education|academic|social|ai|artificial intelligence/i])) {
    family = "social";
  } else if (hasAny(trimmed, [/原理|機制|結構|運動|工作|電池|裝置|系統|工程|設計|指南針/, /mechanism|principle|structure|dynamics|device|battery|system|engineering|design|compass/i])) {
    family = "mechanism";
  } else if (hasAny(trimmed, [/生物|動物|植物|菌|藻|棲地|行為|繁殖|物種/, /biology|animal|plant|species|habitat|behavior|reproduction|organism/i])) {
    family = "biology";
  } else if (hasAny(trimmed, [/食品|食物|飲料|營養|烘焙|料理|糖分|飲食|咖啡|茶/, /food|beverage|nutrition|bread|baking|diet|cuisine/i])) {
    family = "food";
  }

  return {
    topicKind: descriptiveTopic ? "descriptive_topic" : "single_term",
    domain: family,
    fallbackFamily: family,
    shouldSearchNow: true,
  };
}

export function hasLegacyGenericTemplate(query: string, topic = ""): boolean {
  const normalized = normalizeText(query);
  if (!normalized) return false;
  if (LEGACY_GENERIC_PHRASES.some((pattern) => pattern.test(normalized))) return true;

  const topicTokenSet = new Set(asciiTokens(topic));
  const residualTokens = asciiTokens(query).filter((token) => !topicTokenSet.has(token));
  if (residualTokens.length === 0) return false;
  return residualTokens.every((token) => LEGACY_GENERIC_TOKEN_SET.has(token));
}

export function removeLegacyGenericAngles(queries: string[], topic = ""): LegacyAngleFilterResult {
  const kept: string[] = [];
  const hits: string[] = [];

  for (const query of unique(queries.map((item) => item.trim()).filter(Boolean))) {
    if (hasLegacyGenericTemplate(query, topic)) {
      hits.push(query);
      continue;
    }
    kept.push(query);
  }

  return { queries: kept, hits };
}

function buildDomainLevelFallbackQueries(
  topic: string,
  profile: SearchIntentTopicProfile,
): { chineseQueries: string[]; englishQueries: string[]; reasoningNote: string } {
  const stem = fallbackTopicStem(topic);
  const fragments: Record<Exclude<SearchIntentFallbackFamily, "unknown">, { chinese: string[]; english: string[] }> = {
    food: {
      chinese: ["成分與營養", "製程與品質", "飲食文化與消費", "保存與食品安全"],
      english: ["food composition nutrition", "processing quality", "consumer culture", "food safety storage"],
    },
    biology: {
      chinese: ["生態特徵", "棲地與行為", "生命史與繁殖", "物種觀察"],
      english: ["ecology habitat behavior", "life history reproduction", "species characteristics", "field observation"],
    },
    mechanism: {
      chinese: ["工作原理", "結構與機制", "動力學與穩定性", "設計與應用"],
      english: ["working principle mechanism", "structure dynamics stability", "design application", "experimental analysis"],
    },
    health: {
      chinese: ["健康影響", "暴露與風險", "病理機制", "預防與治療"],
      english: ["health effects", "exposure risk", "pathophysiology", "prevention treatment"],
    },
    environment: {
      chinese: ["環境影響", "生態風險", "污染與管理", "政策與回收"],
      english: ["environmental impact", "ecological risk", "pollution management", "policy recycling"],
    },
    social: {
      chinese: ["學習成效", "行為影響", "教育應用", "社會因素"],
      english: ["learning outcomes", "behavioral impact", "educational application", "social factors"],
    },
    general_object: {
      chinese: ["核心特性", "結構與用途", "材料與製程", "使用情境"],
      english: ["core characteristics", "structure application", "materials manufacturing", "usage context"],
    },
  };

  const family = (profile.fallbackFamily ?? "general_object") as Exclude<SearchIntentFallbackFamily, "unknown">;
  const englishSeed = unique(topicTerms(topic).filter((term) => /[A-Za-z]/.test(term))).join(" ").trim();
  return {
    chineseQueries: unique(fragments[family].chinese.map((fragment) => `${stem} ${fragment}`.trim())).slice(0, 4),
    englishQueries: englishSeed
      ? unique(fragments[family].english.map((fragment) => `${englishSeed} ${fragment}`.trim())).slice(0, 4)
      : [],
    reasoningNote: `Domain-level fallback built ${family} search angles after generic queries were removed or missing.`,
  };
}

export function sanitizeSearchIntentPlan(
  input: SearchIntentPlannerInput,
  plan: SearchIntentPlan,
): SearchIntentPlan {
  const profile = inferSearchIntentTopicProfile(plan.normalizedTopic || input.topic);
  const normalizedTopic = (plan.normalizedTopic || input.topic).trim();

  if (!profile.shouldSearchNow) {
    return {
      ...plan,
      normalizedTopic,
      primaryConcepts: [],
      contextConcepts: [],
      outcomeConcepts: [],
      populationConcepts: [],
      lowWeightTerms: [],
      mustHaveTerms: [],
      shouldHaveTerms: [],
      chineseQueries: [],
      englishQueries: [],
      reasoningNotes: unique([
        ...plan.reasoningNotes,
        `Topic "${normalizedTopic}" was classified as unknown_or_noise; search execution was skipped.`,
      ]).slice(0, 8),
      plannerStatus: "skipped",
      topicKind: profile.topicKind,
      domain: profile.domain,
      fallbackFamily: profile.fallbackFamily,
      legacyTemplateHits: [],
    };
  }

  const filteredChinese = removeLegacyGenericAngles(plan.chineseQueries, normalizedTopic);
  const filteredEnglish = removeLegacyGenericAngles(plan.englishQueries, normalizedTopic);
  const legacyTemplateHits = unique([...filteredChinese.hits, ...filteredEnglish.hits]).slice(0, 8);
  const needsBackfill = filteredChinese.queries.length === 0 && filteredEnglish.queries.length === 0;
  const fallbackQueries = needsBackfill
    ? buildDomainLevelFallbackQueries(normalizedTopic, profile)
    : { chineseQueries: filteredChinese.queries, englishQueries: filteredEnglish.queries, reasoningNote: "" };

  return {
    ...plan,
    normalizedTopic,
    chineseQueries: needsBackfill ? fallbackQueries.chineseQueries : filteredChinese.queries,
    englishQueries: needsBackfill ? fallbackQueries.englishQueries : filteredEnglish.queries,
    reasoningNotes: unique([
      ...plan.reasoningNotes,
      ...(legacyTemplateHits.length
        ? [`Removed legacy generic search angles: ${legacyTemplateHits.join(" | ")}`]
        : []),
      ...(needsBackfill ? [fallbackQueries.reasoningNote] : []),
    ]).slice(0, 8),
    topicKind: profile.topicKind,
    domain: profile.domain,
    fallbackFamily: profile.fallbackFamily,
    legacyTemplateHits,
  };
}

function stringArray(value: unknown, limit = 16): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.map(cleanString).filter((item): item is string => Boolean(item))).slice(0, limit);
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isUrbanHeatIslandTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /都市熱島|熱島效應|熱島|校園熱環境|熱舒適|熱壓力|微氣候|高溫|氣溫/,
    /urban heat island|heat island|uhi|thermal comfort|thermal environment|heat stress|microclimate|campus heat/i,
  ]);
}

function isShortVideoSleepAttentionTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  const hasMediaCue = hasAny(text, [/短影音|社群媒體|社交媒體|影音|手機|螢幕/, /tiktok|reels|youtube shorts|short[- ]?form|social media|digital media/i]);
  const hasSleepCue = hasAny(text, [/睡眠|失眠|作息/, /sleep|insomnia|circadian/i]);
  const hasAttentionCue = hasAny(text, [/注意力|專注|認知/, /attention|cognition|focus/i]);
  return hasMediaCue && (hasSleepCue || hasAttentionCue);
}

function isColaHealthTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  const hasBeverageCue = hasAny(text, [
    /可樂|汽水|碳酸飲料|含糖飲料|飲料/,
    /cola|soda|soft drink|sugar[- ]sweetened beverage|carbonated beverage/i,
  ]);
  const hasHealthCue = hasAny(text, [
    /健康|糖|糖分|咖啡因|攝取|肥胖|代謝|蛀牙|飲用/,
    /health|sugar|caffeine|consumption|intake|obesity|metabolic|dental/i,
  ]);
  return hasBeverageCue && hasHealthCue;
}

function isClimateChangeCauseTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  const hasClimateCue = hasAny(text, [
    /氣候變遷|全球暖化|溫室氣體|氣候/,
    /climate change|global warming|greenhouse gas|climate/i,
  ]);
  const hasCauseCue = hasAny(text, [
    /成因|原因|化石燃料|排放|工業化|土地利用|人為活動/,
    /cause|causes|fossil fuel|emission|industrialization|land use|anthropogenic/i,
  ]);
  return hasClimateCue && hasCauseCue;
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
  return [reason, extra ?? "Search concepts were weighted so generic population or education terms do not dominate provider queries."];
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
      shouldHaveTerms: unique([...URBAN_HEAT_CONTEXT, ...URBAN_HEAT_OUTCOMES, "outdoor thermal comfort"]),
      penaltyTerms: URBAN_HEAT_PENALTIES,
      negativeTerms: ["unrelated student learning performance", "generic education satisfaction"],
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
      shouldHaveTerms: ["adolescents", "high school students", "screen time", "problematic social media use"],
      penaltyTerms: ["generic education technology", "student achievement", "academic performance"],
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

  if (isColaHealthTopic(input)) {
    return {
      normalizedTopic,
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
      reasoningNotes: planReason(
        reason,
        "Cola-health searches must keep beverage, sugar/caffeine, consumption, and health terms together; education or student terms cannot pass alone.",
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
        "全球暖化 成因 溫室氣體 排放",
        "氣候變遷 人為活動 工業化 土地利用",
        "氣候變遷 成因 IPCC 溫室氣體",
      ],
      englishQueries: [
        "climate change causes greenhouse gas emissions fossil fuel",
        "global warming causes greenhouse gases fossil fuel combustion",
        "anthropogenic climate change causes land use industrialization",
        "climate change causes greenhouse gas emissions IPCC",
      ],
      reasoningNotes: planReason(
        reason,
        "Climate-change-cause searches must keep climate, greenhouse gas, fossil fuel, emissions, and land-use terms together; language or religion matches are negative.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  const genericTerms = topicTerms(normalizedTopic);
  const audience = cleanString(input.audience);
  const profile = inferSearchIntentTopicProfile(normalizedTopic);
  const fallbackQueries = profile.shouldSearchNow
    ? buildDomainLevelFallbackQueries(normalizedTopic, profile)
    : { chineseQueries: [], englishQueries: [], reasoningNote: "Topic classified as unknown_or_noise." };

  return {
    normalizedTopic,
    primaryConcepts: profile.shouldSearchNow ? (genericTerms.length ? genericTerms : [normalizedTopic]) : [],
    contextConcepts: profile.shouldSearchNow
      ? [audience, cleanString(input.reportType)].filter((term): term is string => Boolean(term))
      : [],
    outcomeConcepts: [],
    populationConcepts: profile.shouldSearchNow && audience ? [audience] : [],
    lowWeightTerms: profile.shouldSearchNow ? ["students", "education", "learning"] : [],
    mustHaveTerms: profile.shouldSearchNow ? (genericTerms.length ? genericTerms : [normalizedTopic]) : [],
    shouldHaveTerms: profile.shouldSearchNow && audience ? [audience] : [],
    penaltyTerms: [],
    negativeTerms: [],
    chineseQueries: fallbackQueries.chineseQueries,
    englishQueries: fallbackQueries.englishQueries,
    reasoningNotes: unique([...planReason(reason), fallbackQueries.reasoningNote]).slice(0, 8),
    plannerStatus: profile.shouldSearchNow ? plannerStatus : "skipped",
    fallbackUsed: true,
    topicKind: profile.topicKind,
    domain: profile.domain,
    fallbackFamily: profile.fallbackFamily,
    legacyTemplateHits: [],
  };

}

function llmConfig(options?: SearchIntentPlannerOptions): SearchIntentLlmConfig {
  const reportModelConfig = getReportModelConfig();
  return {
    baseUrl: options?.llm?.baseUrl
      ?? process.env.SEARCH_INTENT_LLM_BASE_URL
      ?? process.env.KEYWORD_LLM_BASE_URL
      ?? process.env.LLM_BASE_URL
      ?? process.env.OPENAI_BASE_URL
      ?? "https://api.openai.com/v1",
    apiKey: options?.llm?.apiKey
      ?? process.env.SEARCH_INTENT_LLM_API_KEY
      ?? process.env.KEYWORD_LLM_API_KEY
      ?? process.env.LLM_API_KEY
      ?? process.env.OPENAI_API_KEY,
    model: options?.llm?.model
      ?? process.env.SEARCH_INTENT_LLM_MODEL
      ?? process.env.KEYWORD_LLM_MODEL
      ?? process.env.LLM_MODEL
      ?? process.env.OPENAI_MODEL
      ?? reportModelConfig.fastModel,
    timeoutMs: options?.llm?.timeoutMs
      ?? (Number(process.env.SEARCH_INTENT_LLM_TIMEOUT_MS) || DEFAULT_SEARCH_INTENT_LLM_TIMEOUT_MS),
  };
}

function chatCompletionsUrl(baseUrl: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBase);
}

function isQuotaOrAuthFailure(status: number, body: string): boolean {
  const normalizedBody = body.toLowerCase();
  return status === 403
    || status === 429
    || normalizedBody.includes("daily_limit_exceeded")
    || normalizedBody.includes("quota")
    || normalizedBody.includes("rate limit");
}

function llmHttpErrorMessage(status: number): string {
  if (status === 401) return "LLM planner provider returned HTTP 401.";
  if (status === 403 || status === 429) return `LLM planner quota or access limit returned HTTP ${status}.`;
  if (status === 502) return "LLM planner provider returned HTTP 502.";
  return `LLM planner provider returned HTTP ${status}.`;
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new SearchIntentPlannerError("invalid-json", "LLM planner response did not contain valid JSON.");
  }
}

function fallbackReason(error: unknown): string {
  if (error instanceof SearchIntentPlannerError) {
    return `Search intent planner fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return `Search intent planner fallback: ${error.message}`;
  }
  return "Search intent planner fallback: unknown provider failure.";
}

function statusFromError(error: unknown): SearchIntentPlannerStatus {
  if (error instanceof SearchIntentPlannerError && error.code === "provider-unconfigured") {
    return "skipped";
  }
  return "rule_fallback";
}

function llmStatusFromPlannerStatus(
  plannerStatus: SearchIntentPlannerStatus,
  fallbackUsed: boolean,
): "success" | "failed" | "skipped" {
  if (!fallbackUsed && plannerStatus === "llm") return "success";
  if (plannerStatus === "skipped") return "skipped";
  return "failed";
}

function mergeFamilyCriticalTerms(
  input: SearchIntentPlannerInput,
  plan: SearchIntentPlan,
): SearchIntentPlan {
  const fallback = buildRuleBasedSearchIntent(input);
  if (
    !isUrbanHeatIslandTopic(input)
    && !isShortVideoSleepAttentionTopic(input)
    && !isColaHealthTopic(input)
    && !isClimateChangeCauseTopic(input)
  ) return plan;

  return {
    ...plan,
    primaryConcepts: unique([...plan.primaryConcepts, ...fallback.primaryConcepts]).slice(0, 14),
    contextConcepts: unique([...plan.contextConcepts, ...fallback.contextConcepts]).slice(0, 12),
    outcomeConcepts: unique([...plan.outcomeConcepts, ...fallback.outcomeConcepts]).slice(0, 12),
    populationConcepts: unique([...plan.populationConcepts, ...fallback.populationConcepts]).slice(0, 8),
    lowWeightTerms: unique([...plan.lowWeightTerms, ...fallback.lowWeightTerms]).slice(0, 12),
    mustHaveTerms: unique([...plan.mustHaveTerms, ...fallback.mustHaveTerms]).slice(0, 18),
    shouldHaveTerms: unique([...plan.shouldHaveTerms, ...fallback.shouldHaveTerms]).slice(0, 18),
    penaltyTerms: unique([...plan.penaltyTerms, ...fallback.penaltyTerms]).slice(0, 14),
    negativeTerms: unique([...plan.negativeTerms, ...fallback.negativeTerms]).slice(0, 10),
    chineseQueries: unique([...plan.chineseQueries, ...fallback.chineseQueries]).slice(0, MAX_QUERY_COUNT),
    englishQueries: unique([...plan.englishQueries, ...fallback.englishQueries]).slice(0, MAX_QUERY_COUNT),
  };
}

function coerceSearchIntentPlan(value: unknown, input: SearchIntentPlannerInput): SearchIntentPlan {
  if (!value || typeof value !== "object") {
    throw new SearchIntentPlannerError("invalid-json", "LLM planner response was not a JSON object.");
  }

  const data = value as Record<string, unknown>;
  const fallback = buildRuleBasedSearchIntent(input, "LLM planner returned incomplete planning data; deterministic fields were merged.");
  const normalizedTopic = cleanString(data.normalizedTopic) ?? cleanString(data.normalized_topic) ?? input.topic.trim();
  const plan: SearchIntentPlan = {
    normalizedTopic,
    primaryConcepts: stringArray(data.primaryConcepts ?? data.primary_concepts, 14),
    contextConcepts: stringArray(data.contextConcepts ?? data.context_concepts, 12),
    outcomeConcepts: stringArray(data.outcomeConcepts ?? data.outcome_concepts, 12),
    populationConcepts: stringArray(data.populationConcepts ?? data.population_concepts, 8),
    lowWeightTerms: stringArray(data.lowWeightTerms ?? data.low_weight_terms, 12),
    mustHaveTerms: stringArray(data.mustHaveTerms ?? data.must_have_terms, 18),
    shouldHaveTerms: stringArray(data.shouldHaveTerms ?? data.should_have_terms, 18),
    penaltyTerms: stringArray(data.penaltyTerms ?? data.penalty_terms, 14),
    negativeTerms: stringArray(data.negativeTerms ?? data.negative_terms, 10),
    chineseQueries: stringArray(data.chineseQueries ?? data.chinese_queries, MAX_QUERY_COUNT),
    englishQueries: stringArray(data.englishQueries ?? data.english_queries, MAX_QUERY_COUNT),
    reasoningNotes: stringArray(data.reasoningNotes ?? data.reasoning_notes, 8),
    plannerStatus: "llm",
    fallbackUsed: false,
  };

  const merged: SearchIntentPlan = {
    ...plan,
    primaryConcepts: plan.primaryConcepts.length ? plan.primaryConcepts : fallback.primaryConcepts,
    contextConcepts: plan.contextConcepts.length ? plan.contextConcepts : fallback.contextConcepts,
    outcomeConcepts: plan.outcomeConcepts.length ? plan.outcomeConcepts : fallback.outcomeConcepts,
    populationConcepts: plan.populationConcepts.length ? plan.populationConcepts : fallback.populationConcepts,
    lowWeightTerms: plan.lowWeightTerms.length ? plan.lowWeightTerms : fallback.lowWeightTerms,
    mustHaveTerms: plan.mustHaveTerms.length ? plan.mustHaveTerms : fallback.mustHaveTerms,
    shouldHaveTerms: plan.shouldHaveTerms.length ? plan.shouldHaveTerms : fallback.shouldHaveTerms,
    penaltyTerms: plan.penaltyTerms.length ? plan.penaltyTerms : fallback.penaltyTerms,
    negativeTerms: plan.negativeTerms.length ? plan.negativeTerms : fallback.negativeTerms,
    chineseQueries: plan.chineseQueries.length ? plan.chineseQueries : fallback.chineseQueries,
    englishQueries: plan.englishQueries.length ? plan.englishQueries : fallback.englishQueries,
    reasoningNotes: plan.reasoningNotes.length ? plan.reasoningNotes : ["LLM planner returned valid JSON."],
  };

  return mergeFamilyCriticalTerms(input, merged);
}

async function requestLlmSearchIntentPlan(
  input: SearchIntentPlannerInput,
  options?: SearchIntentPlannerOptions,
): Promise<SearchIntentPlan> {
  const config = llmConfig(options);
  if (!config.apiKey?.trim()) {
    throw new SearchIntentPlannerError("provider-unconfigured", "No LLM API key is configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await (options?.fetchImpl ?? fetch)(chatCompletionsUrl(config.baseUrl ?? ""), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You are a Search Intent Planner for academic source retrieval.",
              "Return strict JSON only, with no markdown.",
              "Plan search concepts and queries only. Do not invent sources, citations, report content, summaries, or diagrams.",
              "Weight domain concepts above generic population terms.",
              "For urban heat island topics, heat, thermal, temperature, microclimate, urban heat island, or UHI terms must dominate over students, learning, or education.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              topic: input.topic,
              reportType: input.reportType ?? "研究報告",
              audience: input.audience ?? "",
              sourceMode: input.sourceMode ?? "",
              language: input.language ?? "zh-TW",
              required_schema: {
                normalizedTopic: "string",
                primaryConcepts: "string[]",
                contextConcepts: "string[]",
                outcomeConcepts: "string[]",
                populationConcepts: "string[]",
                lowWeightTerms: "string[]",
                mustHaveTerms: "string[]",
                shouldHaveTerms: "string[]",
                penaltyTerms: "string[]",
                negativeTerms: "string[]",
                chineseQueries: "string[]",
                englishQueries: "string[]",
                reasoningNotes: "string[]",
              },
            }),
          },
        ],
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new SearchIntentPlannerError(
        isQuotaOrAuthFailure(response.status, body) ? "provider-quota" : "provider-failure",
        llmHttpErrorMessage(response.status),
      );
    }

    const payload = extractJsonObject(body) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new SearchIntentPlannerError("invalid-json", "LLM planner response did not include message content.");
    }

    return coerceSearchIntentPlan(extractJsonObject(content), input);
  } catch (error) {
    if (error instanceof SearchIntentPlannerError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SearchIntentPlannerError("provider-timeout", "LLM search intent planning timed out.", error);
    }
    throw new SearchIntentPlannerError("provider-failure", "LLM search intent planning request failed.", error);
  } finally {
    clearTimeout(timeout);
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
    return sanitizeSearchIntentPlan(
      normalizedInput,
      await requestLlmSearchIntentPlan(normalizedInput, options),
    );
  } catch (error) {
    return sanitizeSearchIntentPlan(
      normalizedInput,
      buildRuleBasedSearchIntent(
        normalizedInput,
        fallbackReason(error),
        statusFromError(error),
      ),
    );
  }
}

export function buildSearchIntentQueries(plan: SearchIntentPlan): SearchIntentQuerySet {
  if (plan.topicKind === "unknown_or_noise") {
    return { chinese: [], english: [], highPrecision: [], broad: [] };
  }

  const chinese = removeLegacyGenericAngles(plan.chineseQueries, plan.normalizedTopic).queries.slice(0, MAX_QUERY_COUNT);
  const english = removeLegacyGenericAngles(plan.englishQueries, plan.normalizedTopic).queries.slice(0, MAX_QUERY_COUNT);
  const highPrecision = unique([
    ...english.filter((query) => {
      const normalized = normalizeText(query);
      return plan.mustHaveTerms.some((term) => normalized.includes(normalizeText(term)))
        && plan.primaryConcepts.some((term) => normalized.includes(normalizeText(term)));
    }),
    ...english.slice(0, 4),
    ...chinese.filter((query) => plan.mustHaveTerms.some((term) => textContains(query, term))).slice(0, 2),
  ]).slice(0, MAX_QUERY_COUNT);

  const broad = removeLegacyGenericAngles(unique([
    ...plan.shouldHaveTerms.slice(0, 4).map((term) => `${plan.primaryConcepts[0] ?? plan.normalizedTopic} ${term}`.trim()),
    ...english.slice(0, 2),
    ...chinese.slice(0, 2),
  ]).filter(Boolean), plan.normalizedTopic).queries.slice(0, 4);

  return {
    chinese,
    english,
    highPrecision,
    broad,
  };
}

function orderedQueries(querySet: SearchIntentQuerySet, queryLimit: number): string[] {
  return unique([
    ...querySet.highPrecision,
    ...querySet.english,
    ...querySet.chinese,
    ...querySet.broad,
  ].map((query) => query.trim()).filter(Boolean)).slice(0, queryLimit);
}

function textContains(text: string, term: string): boolean {
  const cleanedTerm = normalizeText(term);
  if (!cleanedTerm) return false;
  return normalizeText(text).includes(cleanedTerm);
}

function matchedTerms(text: string, terms: string[]): string[] {
  return unique(terms.filter((term) => textContains(text, term)));
}

function isUrbanHeatPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText([...plan.primaryConcepts, ...plan.mustHaveTerms].join(" "));
  return concepts.includes("urban heat island")
    || concepts.includes("thermal comfort")
    || concepts.includes("microclimate")
    || concepts.includes("heat island")
    || concepts.includes("uhi");
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

export function scoreSourceRelevance(source: SourceRecord, plan: SearchIntentPlan): SourceRelevanceDebug {
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
  const matchedPrimaryConcepts = unique([...matchedPrimaryTitle, ...matchedPrimaryAbstract]);
  const matchedMustHaveTerms = unique([...matchedMustTitle, ...matchedMustAbstract]);
  const matchedContextConcepts = unique([...matchedContextTitle, ...matchedContextAbstract]);
  const matchedOutcomeConcepts = unique([...matchedOutcomeTitle, ...matchedOutcomeAbstract]);
  const penalties: string[] = [];

  let score = 0;
  score += matchedPrimaryTitle.length * 8;
  score += matchedPrimaryAbstract.length * 5;
  score += matchedMustTitle.length * 8;
  score += matchedMustAbstract.length * 5;
  score += matchedContextTitle.length * 3;
  score += matchedContextAbstract.length * 2;
  score += matchedOutcomeTitle.length * 2;
  score += matchedOutcomeAbstract.length * 1.5;
  score += source.doi ? 1 : 0;
  score += source.abstract ? 1 : 0;
  score += sourceYearBonus(source.year);

  if (matchedMustHaveTerms.length === 0) {
    score -= 12;
    penalties.push("missing_must_have_terms");
  }

  if (matchedLowWeight.length > 0 && matchedPrimaryConcepts.length === 0 && matchedMustHaveTerms.length === 0) {
    score -= 10;
    penalties.push(`low_weight_only:${matchedLowWeight.join(",")}`);
  }

  if (matchedPenalties.length > 0 && matchedMustHaveTerms.length === 0) {
    score -= matchedPenalties.length * 4;
    penalties.push(`penalty_terms:${matchedPenalties.join(",")}`);
  }

  if (isUrbanHeatPlan(plan)) {
    const heatTerms = ["heat", "thermal", "temperature", "microclimate", "urban heat island", "uhi", "熱", "溫度", "微氣候", "熱島"];
    if (matchedTerms(combined, heatTerms).length === 0) {
      score -= 20;
      penalties.push("urban_heat_without_heat_or_thermal_terms");
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

export function rerankSourcesBySearchIntent(
  sources: SourceRecord[],
  plan: SearchIntentPlan,
): { sources: SourceRecord[]; relevanceDebug: SourceRelevanceDebug[] } {
  const scored = sources.map((source, index) => ({
    source,
    index,
    debug: scoreSourceRelevance(source, plan),
  }));

  scored.sort((a, b) => {
    if (b.debug.score !== a.debug.score) return b.debug.score - a.debug.score;
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

function resultWarnings(groups: SourceProviderSearchResult[], sources: SourceRecord[], plan: SearchIntentPlan): string[] {
  const warnings: string[] = [];
  const failedGroups = groups.filter((group) => !group.ok);
  if (failedGroups.length > 0) {
    warnings.push("部分來源提供者暫時無法使用，已顯示可用結果。");
  }
  if (plan.topicKind === "unknown_or_noise") {
    warnings.push("輸入主題目前無法判定為可研究主題，未執行來源搜尋。");
    return unique(warnings);
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
  const concepts = normalizeText([
    ...plan.primaryConcepts,
    ...plan.contextConcepts,
    ...plan.mustHaveTerms,
  ].join(" "));
  const domains = ["general_academic_research"];
  if (concepts.includes("short-form video") || concepts.includes("digital media") || concepts.includes("social media")) {
    domains.push("digital_media");
  }
  if (concepts.includes("sleep")) domains.push("sleep_health");
  if (concepts.includes("attention") || concepts.includes("cognitive")) domains.push("psychology");
  if (concepts.includes("urban heat") || concepts.includes("thermal") || concepts.includes("microclimate") || concepts.includes("heat island")) {
    domains.push("environmental_science", "urban_studies");
  }
  if (concepts.includes("student") || concepts.includes("school") || concepts.includes("campus")) {
    domains.push("education");
  }
  return unique(domains);
}

function preferredSourceTypes(plan: SearchIntentPlan): string[] {
  const types = ["peer_reviewed_journal", "systematic_review", "official_report", "university_or_research_institution_publication"];
  if (isUrbanHeatPlan(plan)) types.push("urban_climate_or_built_environment_study");
  return unique(types);
}

export function sanitizeSearchIntentSourceSearchResult(
  result: SearchIntentSourceSearchResult,
): SearchIntentSourceSearchResult {
  const plan = sanitizeSearchIntentPlan({ topic: result.planner?.normalizedTopic ?? result.topic }, result.planner);
  const querySet = buildSearchIntentQueries(plan);
  const queryLimit = Math.max(
    result.keyword_expansion.search_queries.length,
    result.queries.highPrecision.length,
    result.queries.english.length,
    result.queries.chinese.length,
    DEFAULT_SEARCH_INTENT_QUERY_LIMIT,
  );
  const searchQueries = orderedQueries(querySet, queryLimit);
  const llmStatus = llmStatusFromPlannerStatus(plan.plannerStatus, plan.fallbackUsed);

  return {
    ...result,
    topic: plan.normalizedTopic,
    searchIntent: searchIntentSummary(plan),
    queries: querySet,
    planner: plan,
    warnings: unique([...result.warnings, ...resultWarnings(result.provider_status, result.sources, plan)]),
    llm_status: llmStatus,
    keyword_expansion: {
      ...result.keyword_expansion,
      normalized_topic: plan.normalizedTopic,
      domains: domainsFromPlan(plan),
      search_queries: searchQueries,
      english_queries: plan.englishQueries,
      chinese_queries: plan.chineseQueries,
      preferred_source_types: preferredSourceTypes(plan),
      reasoning_notes: plan.reasoningNotes,
      fallback_used: plan.fallbackUsed,
      llm_status: llmStatus,
    },
  };
}

export async function searchIntentSources(
  input: SearchIntentPlannerInput,
  options?: SearchIntentSourceSearchOptions,
): Promise<SearchIntentSourceSearchResult> {
  const plan = await planSearchIntent(input, options);
  const querySet = buildSearchIntentQueries(plan);
  const queryLimit = options?.queryLimit
    ?? (Number(process.env.SEARCH_INTENT_QUERY_LIMIT) || DEFAULT_SEARCH_INTENT_QUERY_LIMIT);
  const queries = orderedQueries(querySet, queryLimit);
  const groups = queries.length > 0
    ? (await Promise.all(
      queries.map((query) => searchSourceProviders(query, options?.sourceSearch ?? { fetchImpl: options?.fetchImpl })),
    )).flat()
    : [];
  const dedupedSources = dedupeSourceRecords(groups.flatMap((group) => group.results));
  const reranked = rerankSourcesBySearchIntent(dedupedSources, plan);
  const sources = reranked.sources.slice(0, 24);
  const plannerLlmStatus = llmStatusFromPlannerStatus(plan.plannerStatus, plan.fallbackUsed);

  return sanitizeSearchIntentSourceSearchResult({
    ok: true,
    topic: plan.normalizedTopic,
    searchIntent: searchIntentSummary(plan),
    queries: querySet,
    results: sources,
    sources,
    provider_status: groups,
    warnings: resultWarnings(groups, sources, plan),
    planner: plan,
    ...(options?.includeDebug ?? process.env.NODE_ENV === "development"
      ? { relevance_debug: reranked.relevanceDebug.slice(0, 24) }
      : {}),
    llm_status: plannerLlmStatus,
    keyword_expansion: {
      normalized_topic: plan.normalizedTopic,
      domains: domainsFromPlan(plan),
      search_queries: queries,
      english_queries: plan.englishQueries,
      chinese_queries: plan.chineseQueries,
      preferred_source_types: preferredSourceTypes(plan),
      avoid_source_types: ["uncited_blog", "marketing_article", "content_farm", "ai_generated_article_without_sources"],
      reasoning_notes: plan.reasoningNotes,
      fallback_used: plan.fallbackUsed,
      llm_status: plannerLlmStatus,
    },
    groups,
  });
}
