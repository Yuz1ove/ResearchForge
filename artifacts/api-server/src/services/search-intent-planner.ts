import {
  dedupeSourceRecords,
  normalizeSourceRecord,
  type SourceRecord,
} from "@workspace/api-zod";
import {
  entitySearchTerms,
  sanitizeAndBackfillAngles,
  understandTopic,
  type TopicClarificationCard,
  type TopicDomain,
  type TopicResearchAngle,
  type TopicUnderstandingResult,
} from "@workspace/api-zod/topic-understanding";
import { createHash, randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import {
  searchSourceProviders,
  type AcademicSourceProvider,
  type SourceFetch,
  type SourceProviderSearchResult,
  type SourceSearchOptions,
  type FallbackSourceProvider,
} from "./source-retrieval";
import {
  LlmAdapterError,
  requestOpenAICompatibleChatCompletion,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";
import { summarizeSourcesWithLlm } from "./source-summarizer";
import {
  understandTopicWithFallback,
  type TopicUnderstanding,
} from "./topic-understanding";

export interface SearchIntentPlannerInput {
  topic: string;
  originalTopic?: string;
  refinedTopic?: string;
  displayTitle?: string;
  canonicalTopicZh?: string;
  canonicalTopicEn?: string;
  querySeedZh?: string[];
  querySeedEn?: string[];
  subtopics?: PlannerSubtopic[];
  mustIncludeTerms?: string[];
  excludeTerms?: string[];
  domainHints?: string[];
  selectedResearchPlanId?: string;
  workflowId?: string;
  reportType?: string;
  audience?: string;
  language?: "zh-TW" | "en" | string;
  sourceMode?: string;
}

export interface PlannerSubtopic {
  id: string;
  titleZh: string;
  titleEn?: string;
  queryZh?: string[];
  queryEn?: string[];
  mustIncludeTerms?: string[];
  excludeTerms?: string[];
  expectedSourceTypes?: string[];
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
  topicUnderstanding?: TopicUnderstandingResult;
  originalTopic?: string;
  activeResearchTopic?: string;
  displayTitle?: string;
  canonicalTopicZh?: string;
  canonicalEnglishTopic?: string;
  coreConcepts?: string[];
  suppliedQuerySeedZh?: string[];
  suppliedQuerySeedEn?: string[];
  subtopics?: PlannerSubtopic[];
}

export interface SearchIntentQueryPhase {
  stage:
    | "core_english_academic"
    | "academic_synonym"
    | "education_explanation"
    | "chinese_supplemental"
    | "fallback_relaxed";
  queries: string[];
}

export interface SearchIntentQuerySet {
  coreConcepts: string[];
  chinese: string[];
  english: string[];
  highPrecision: string[];
  broad: string[];
  coreEnglishAcademic: string[];
  academicSynonyms: string[];
  education: string[];
  chineseSupplemental: string[];
  fallbackRelaxed: string[];
  phases: SearchIntentQueryPhase[];
}

const ROTATIONAL_MECHANICS_CORE_CONCEPTS = [
  "spinning top",
  "angular momentum",
  "torque",
  "rotational stability",
  "gyroscopic precession",
  "rigid body dynamics",
  "Euler equations",
  "Lagrange top",
];

const ROTATIONAL_MECHANICS_CORE_ENGLISH = [
  "spinning top angular momentum torque rotational stability",
  "spinning top precession angular momentum torque",
  "physics of spinning top gyroscopic stability",
  "rotational dynamics of spinning top",
];

const ROTATIONAL_MECHANICS_ACADEMIC_SYNONYMS = [
  "gyroscopic precession torque angular momentum",
  "rigid body dynamics spinning top stability",
  "Euler equations Lagrange top precession",
];

const ROTATIONAL_MECHANICS_EDUCATION = [
  "spinning top physics angular momentum explanation",
  "gyroscope precession torque explanation",
  "angular momentum spinning top physics classroom",
  "rotational motion spinning top education",
];

const ROTATIONAL_MECHANICS_CHINESE = [
  "陀螺 角動量 扭矩 進動",
  "陀螺 旋轉穩定性 物理",
  "陀螺 進動 角動量",
  "剛體轉動 陀螺 角動量",
];

const ROTATIONAL_MECHANICS_RELAXED = [
  "gyroscopic precession",
  "torque angular momentum",
  "rigid body rotational dynamics",
  "spinning top physics",
  "Lagrange top",
];

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
  originalTopic: string;
  activeResearchTopic: string;
  canonicalEnglishTopic: string;
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

export interface SourceSearchProviderDiagnostic {
  provider: string;
  query: string;
  ok: boolean;
  result_count: number;
  error_type: string | null;
  error_message: string | null;
}

export interface SourceSearchPipelineDiagnostics {
  original_topic: string;
  active_research_topic: string;
  canonical_english_topic: string;
  core_concepts: string[];
  english_queries: string[];
  chinese_queries: string[];
  fallback_relaxed_queries: string[];
  provider_search_results_count: number;
  filtered_results_count: number;
  rejection_reasons: Record<string, number>;
  retrieved_count: number;
  deduped_count: number;
  rejected_count: number;
  candidate_count: number;
  displayed_count: number;
  primary_candidate_count: number;
  provider_status: SourceSearchProviderDiagnostic[];
  warnings: string[];
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
  webFallback?: {
    enabled?: boolean;
    endpoint?: string;
    timeoutMs?: number;
    maxResultsPerQuery?: number;
    fetchImpl?: SourceFetch;
  };
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
  topicKind?: string;
  needsClarification?: boolean;
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
  diagnostics: SourceSearchPipelineDiagnostics;
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  keyword_expansion: {
    normalized_topic: string;
    domains: string[];
    search_queries: string[];
    english_queries: string[];
    chinese_queries: string[];
    core_concepts?: string[];
    core_english_queries?: string[];
    academic_synonym_queries?: string[];
    education_queries?: string[];
    fallback_relaxed_queries?: string[];
    preferred_source_types: string[];
    avoid_source_types: string[];
    reasoning_notes: string[];
    fallback_used: boolean;
    llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  };
  groups: SourceProviderSearchResult[];
  status?: "ok" | "empty";
  queryCount?: number;
  low_confidence_results?: boolean;
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

const DEFAULT_SEARCH_INTENT_QUERY_LIMIT = 18;
const MAX_CANDIDATE_RESULTS = 180;
const MAX_QUERY_COUNT = 16;
const TARGET_SOURCE_COUNT = 20;
const MINIMUM_TOTAL_SOURCES = 20;
const MINIMUM_ACADEMIC_SOURCES = 10;
const DEFAULT_ACADEMIC_QUERY_LIMIT = 5;
const DEFAULT_WEB_FALLBACK_QUERY_LIMIT = 3;
const DEFAULT_SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS = 3_500;
const DEFAULT_SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS = 2_500;

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

const AI_LEARNING_EFFECT_PRIMARY = [
  "artificial intelligence",
  "generative AI",
  "AI tutoring",
  "intelligent tutoring system",
  "educational technology",
  "AI in education",
  "人工智慧",
  "生成式 AI",
  "AI 教學",
  "教育科技",
];

const AI_LEARNING_EFFECT_CONTEXT = [
  "high school students",
  "secondary education",
  "K-12 education",
  "adolescents",
  "classroom learning",
  "高中生",
  "中學生",
  "高中教育",
  "課堂學習",
];

const AI_LEARNING_EFFECT_OUTCOMES = [
  "learning outcomes",
  "academic achievement",
  "learning performance",
  "student engagement",
  "self-regulated learning",
  "motivation",
  "學習成效",
  "學業成就",
  "學習表現",
  "學習動機",
  "學習投入",
];

const AI_LEARNING_EFFECT_MUST_HAVE = [
  "artificial intelligence",
  "generative AI",
  "AI tutoring",
  "intelligent tutoring system",
  "AI in education",
  "high school students",
  "secondary education",
  "secondary students",
  "K-12 education",
  "learning outcomes",
  "academic achievement",
  "人工智慧",
  "生成式 AI",
  "AI 教學",
  "高中生",
  "中學生",
  "學習成效",
  "學業成就",
];

const AI_LEARNING_EFFECT_LOW_WEIGHT = [
  "student",
  "students",
  "learning",
  "education",
  "impact",
  "effect",
  "高中",
  "學生",
  "學習",
  "教育",
  "影響",
];

const AI_LEARNING_EFFECT_PENALTIES = [
  "software engineering",
  "code generation",
  "computer vision",
  "model benchmark",
  "image generation",
  "medical diagnosis",
  "business analytics",
  "prompt injection",
  "higher education",
  "university students",
  "college students",
  "undergraduate students",
  "大學生",
  "高等教育",
  "程式碼生成",
  "軟體工程",
  "影像生成",
  "醫療診斷",
  "模型評測",
  "商業分析",
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

const EGG_NUTRITION_PRIMARY = [
  "egg",
  "eggs",
  "chicken egg",
  "hen egg",
  "egg white",
  "egg yolk",
  "albumen",
  "yolk",
  "雞蛋",
  "蛋白",
  "蛋黃",
  "全蛋",
  "卵白",
  "卵黃",
];

const EGG_NUTRITION_CONTEXT = [
  "nutrition",
  "nutritional composition",
  "nutritive value",
  "food composition",
  "dietary protein",
  "egg nutrition",
  "雞蛋營養",
  "營養成分",
  "營養價值",
  "食品成分",
];

const EGG_NUTRITION_OUTCOMES = [
  "protein quality",
  "amino acid profile",
  "amino acid composition",
  "protein digestibility",
  "biological value",
  "essential amino acids",
  "蛋白質品質",
  "胺基酸組成",
  "氨基酸組成",
  "消化率",
  "生物價",
  "必需胺基酸",
];

const EGG_NUTRITION_MUST_HAVE = [
  "egg",
  "eggs",
  "chicken egg",
  "egg white",
  "egg yolk",
  "albumen",
  "yolk",
  "protein",
  "protein quality",
  "amino acid",
  "amino acids",
  "amino acid profile",
  "digestibility",
  "biological value",
  "雞蛋",
  "蛋白",
  "蛋黃",
  "蛋白質",
  "蛋白質品質",
  "胺基酸",
  "氨基酸",
  "消化率",
  "生物價",
  "營養成分",
];

const EGG_NUTRITION_LOW_WEIGHT = [
  "nutrition",
  "food",
  "diet",
  "value",
  "quality",
  "research",
  "study",
  "營養",
  "食品",
  "飲食",
  "研究",
  "價值",
  "品質",
];

const EGG_NUTRITION_DRIFT_TERMS = [
  "basketball",
  "baseball",
  "volleyball",
  "sports",
  "athlete",
  "climate",
  "climate change",
  "aviation",
  "airplane",
  "aircraft",
  "flight",
  "intravenous",
  "parenteral nutrition",
  "infusion",
  "albumin infusion",
  "籃球",
  "棒球",
  "排球",
  "運動",
  "運動員",
  "氣候",
  "氣候變遷",
  "飛機",
  "航空",
  "輸液",
  "靜脈營養",
  "白蛋白輸注",
];

const COD_PRIMARY = [
  "鱈魚",
  "cod",
  "cod fish",
  "Atlantic cod",
  "Gadus morhua",
];

const COD_CONTEXT = [
  "fish",
  "seafood",
  "fisheries",
  "aquaculture",
  "omega-3",
  "DHA",
  "EPA",
  "fish protein",
  "mercury",
  "heavy metals",
  "sustainable fisheries",
];

const COD_MUST_HAVE = [
  "鱈魚",
  "cod",
  "Atlantic cod",
  "Gadus morhua",
  "fish",
  "seafood",
];

const COD_DRIFT_TERMS = [
  "brand strategy",
  "marketing",
  "customer segmentation",
  "business model",
  "nutrition supplement generic",
  "行銷",
  "品牌策略",
  "顧客分群",
];

const CHICKEN_THIGH_PRIMARY = [
  "雞腿",
  "雞腿肉",
  "chicken thigh",
  "chicken leg",
  "poultry",
  "雞肉",
];

const CHICKEN_THIGH_CONTEXT = [
  "protein",
  "fat content",
  "calories",
  "food safety",
  "Salmonella",
  "poultry nutrition",
  "烹調方式",
  "脂肪含量",
  "熱量",
  "食品安全",
  "沙門氏菌",
];

const CHICKEN_THIGH_MUST_HAVE = [
  "雞腿",
  "雞腿肉",
  "雞肉",
  "chicken thigh",
  "chicken leg",
  "poultry",
];

const CHICKEN_THIGH_DRIFT_TERMS = [
  "egg",
  "eggs",
  "egg white",
  "egg yolk",
  "albumen",
  "yolk",
  "雞蛋",
  "蛋黃",
  "全蛋",
  "breakfast cereal",
  "maize",
  "digital media",
  "eye strain",
  "plant-based protein",
  "amino acid injection",
  "早餐穀片",
  "玉米",
  "數位媒體",
  "眼睛疲勞",
  "植物蛋白",
  "胺基酸注射",
];

const CLAM_PRIMARY = [
  "蛤蜊",
  "文蛤",
  "clam",
  "hard clam",
  "bivalve",
  "Meretrix",
  "Meretrix lusoria",
];

const CLAM_CONTEXT = [
  "shellfish",
  "aquaculture",
  "intertidal",
  "sediment",
  "water quality",
  "habitat",
  "food safety",
  "biotoxins",
  "heavy metals",
  "microbial",
  "水質",
  "棲地",
  "潮間帶",
  "養殖",
  "食用安全",
  "貝毒",
  "重金屬",
  "微生物",
];

const CLAM_MUST_HAVE = [
  "蛤蜊",
  "文蛤",
  "clam",
  "hard clam",
  "bivalve",
  "shellfish",
  "Meretrix",
];

const CLAM_DRIFT_TERMS = [
  "shell command",
  "shell script",
  "linux shell",
  "clam shell craft",
  "craft",
  "軟體",
  "命令列",
  "貝殼工藝",
];

const KOALA_PRIMARY = [
  "無尾熊",
  "樹袋熊",
  "考拉",
  "koala",
  "Phascolarctos cinereus",
];

const KOALA_CONTEXT = [
  "habitat",
  "eucalyptus",
  "conservation",
  "fragmentation",
  "bushfire",
  "chlamydia",
  "population",
  "road mortality",
  "habitat connectivity",
  "棲地",
  "桉樹",
  "尤加利",
  "保育",
  "棲地破碎化",
  "野火",
  "疾病",
  "族群",
];

const KOALA_MUST_HAVE = [
  "無尾熊",
  "樹袋熊",
  "考拉",
  "koala",
  "Phascolarctos cinereus",
];

const KOALA_DRIFT_TERMS = [
  "mattress",
  "toy",
  "cartoon",
  "plush",
  "brand",
  "床墊",
  "玩具",
  "卡通",
  "品牌",
];

const TAIWAN_SEMICONDUCTOR_PRIMARY = [
  "台灣半導體",
  "台灣 半導體",
  "Taiwan semiconductor",
  "Taiwan chip",
  "TSMC",
  "台積電",
  "晶圓代工",
  "foundry",
];

const TAIWAN_SEMICONDUCTOR_CONTEXT = [
  "supply chain",
  "semiconductor supply chain",
  "advanced packaging",
  "packaging and testing",
  "OSAT",
  "wafer",
  "foundry",
  "EUV",
  "CoWoS",
  "geopolitics",
  "export controls",
  "resilience",
  "供應鏈",
  "晶圓",
  "封裝",
  "封測",
  "先進製程",
  "設備",
  "材料",
  "地緣政治",
  "出口管制",
  "韌性",
];

const TAIWAN_SEMICONDUCTOR_MUST_HAVE = [
  "Taiwan",
  "Taiwan semiconductor",
  "semiconductor",
  "supply chain",
  "TSMC",
  "台灣",
  "半導體",
  "供應鏈",
  "台積電",
];

const TAIWAN_SEMICONDUCTOR_DRIFT_TERMS = [
  "potato chips",
  "food chips",
  "poker chips",
  "fish and chips",
  "薯條",
  "馬鈴薯片",
  "食物",
  "零食",
];

const DINOSAUR_PRIMARY = [
  "恐龍",
  "dinosaur",
  "non-avian dinosaur",
];

const DINOSAUR_CONTEXT = [
  "paleontology",
  "fossil record",
  "Mesozoic",
  "Jurassic",
  "Cretaceous",
  "extinction",
  "asteroid impact",
  "bird evolution",
  "古生物學",
  "化石紀錄",
  "中生代",
  "侏羅紀",
  "白堊紀",
  "鳥類演化",
];

const DINOSAUR_MUST_HAVE = [
  "恐龍",
  "dinosaur",
  "fossil",
  "paleontology",
  "化石",
  "古生物",
];

const DON_QUIXOTE_PRIMARY = [
  "唐吉訶德",
  "唐吉柯德",
  "Don Quixote",
  "Cervantes",
  "塞萬提斯",
];

const DON_QUIXOTE_CONTEXT = [
  "textual analysis",
  "novel analysis",
  "chivalric romance satire",
  "idealism and reality",
  "Spanish Golden Age",
  "literary history",
  "文本分析",
  "騎士小說諷刺",
  "理想與現實衝突",
  "西班牙黃金時代文學",
  "文學史地位",
];

const DON_QUIXOTE_MUST_HAVE = [
  "唐吉訶德",
  "唐吉柯德",
  "Don Quixote",
  "Cervantes",
  "塞萬提斯",
];

const DON_QUIXOTE_DRIFT_TERMS = [
  "cod",
  "fish",
  "nutrition",
  "DHA",
  "EPA",
  "fatty acid",
  "seafood",
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
  "microplastics",
  "microplastic",
  "microplastic pollution",
  "micro- and nanoplastics",
  "nanoplastics",
  "plastic pollution",
  "marine ecosystem",
  "marine ecology",
  "ocean pollution",
  "微塑膠",
  "微塑料",
  "奈米塑膠",
  "塑膠微粒",
  "塑料微粒",
  "塑膠污染",
  "海洋生態",
];

const MARINE_MICROPLASTICS_CONTEXT = [
  "drinking water",
  "human health",
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
  "health effects",
  "exposure",
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
  "microplastics",
  "microplastic",
  "microplastic pollution",
  "micro- and nanoplastics",
  "nanoplastics",
  "plastic pollution",
  "marine",
  "ocean",
  "marine ecosystem",
  "微塑膠",
  "微塑料",
  "奈米塑膠",
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

const TELOMERASE_AGING_PRIMARY = [
  "telomerase",
  "telomere",
  "telomeres",
  "cellular senescence",
  "aging",
  "ageing",
  "longevity",
  "端粒酶",
  "端粒",
  "老化",
  "衰老",
  "細胞衰老",
];

const TELOMERASE_AGING_CONTEXT = [
  "telomerase activity",
  "telomere length",
  "replicative senescence",
  "stem cells",
  "cancer risk",
  "age-related disease",
  "端粒長度",
  "端粒酶活性",
  "幹細胞",
  "癌症風險",
];

const TELOMERASE_AGING_PENALTIES = [
  "social media",
  "food poisoning",
  "microplastics",
  "climate change",
  "社群媒體",
  "食物中毒",
  "微塑膠",
];

const SALMONELLA_FOOD_POISONING_PRIMARY = [
  "Salmonella",
  "salmonellosis",
  "food poisoning",
  "foodborne illness",
  "foodborne disease",
  "food safety",
  "沙門氏菌",
  "沙門氏菌感染",
  "食物中毒",
  "食品安全",
];

const SALMONELLA_FOOD_POISONING_CONTEXT = [
  "poultry",
  "eggs",
  "meat",
  "outbreak",
  "contamination",
  "prevention",
  "antimicrobial resistance",
  "家禽",
  "雞蛋",
  "污染",
  "爆發",
  "預防",
  "抗藥性",
];

const SALMONELLA_FOOD_POISONING_PENALTIES = [
  "stock market",
  "social media addiction",
  "telomerase",
  "climate change",
  "股票",
  "社群成癮",
  "端粒酶",
];

const SOCIAL_MEDIA_ADDICTION_PRIMARY = [
  "social media addiction",
  "problematic social media use",
  "problematic internet use",
  "smartphone addiction",
  "adolescents",
  "mental health",
  "社群媒體成癮",
  "社交媒體成癮",
  "問題性社群媒體使用",
  "手機成癮",
  "青少年",
  "心理健康",
];

const SOCIAL_MEDIA_ADDICTION_CONTEXT = [
  "depression",
  "anxiety",
  "sleep quality",
  "attention",
  "self-esteem",
  "academic performance",
  "憂鬱",
  "焦慮",
  "睡眠品質",
  "注意力",
  "自尊",
  "學業表現",
];

const SOCIAL_MEDIA_ADDICTION_PENALTIES = [
  "marketing strategy",
  "brand advertising",
  "fish",
  "food safety",
  "climate change",
  "行銷策略",
  "品牌廣告",
  "食品安全",
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

const BMW_EV_STRATEGY_QUERIES = [
  "BMW electric vehicle transition supply chain strategy",
  "BMW EV strategy battery supply chain",
  "BMW electric vehicle product strategy",
  "BMW supply chain resilience electric vehicles",
  "BMW battery sourcing strategy",
  "BMW critical minerals supply chain",
  "BMW sustainability report electric vehicles supply chain",
  "BMW annual report electric vehicles supply chain",
  "BMW EV transition China battery suppliers",
  "BMW Neue Klasse supply chain strategy",
];

const GENERIC_LOW_SIGNAL_TERMS = new Set([
  "strategy",
  "strategies",
  "product",
  "products",
  "business",
  "market",
  "management",
  "research",
  "study",
  "analysis",
  "effect",
  "impact",
  "策略",
  "產品",
  "商業",
  "市場",
  "管理",
  "研究",
  "分析",
  "影響",
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

function positiveEnvNumber(key: string, fallback: number): number {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function isAiLearningEffectTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasAiCue = hasAny(text, [
    /人工智慧|生成式\s*ai|ai|chatgpt|大型語言模型|智慧教學|教育科技/i,
    /artificial intelligence|generative ai|chatgpt|ai in education|intelligent tutoring/i,
  ]);
  const hasLearningCue = hasAny(text, [
    /高中生|中學生|學生|學習成效|學業成就|學習表現|學習動機|課堂/,
    /high school|secondary education|student|learning outcome|academic achievement|learning performance|student engagement/i,
  ]);
  return hasAiCue && hasLearningCue;
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

function isEggNutritionProteinTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const hasEggCue = hasAny(text, [
    /雞蛋|蛋白(?!質)|蛋黃|全蛋|卵白|卵黃/,
    /\beggs?\b|chicken egg|hen egg|egg white|egg yolk|albumen|\byolk\b/i,
  ]);
  const hasNutritionCue = hasAny(text, [
    /營養成分|營養價值|蛋白質|蛋白質品質|胺基酸|氨基酸|消化率|生物價/,
    /nutrition|nutritional composition|protein quality|amino acid|amino acids|amino acid profile|digestibility|biological value|dietary protein/i,
  ]);
  return hasEggCue && hasNutritionCue;
}

function isCodTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /鱈魚|大西洋鱈魚/,
    /\bcod\b|cod fish|atlantic cod|gadus morhua/i,
  ]);
}

function isChickenThighTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /雞腿|雞腿肉|雞腿排/,
    /chicken thigh|chicken leg|poultry/i,
  ]);
}

function isClamSafetyEcologyTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /蛤蜊|文蛤|雙殼貝|貝類/,
    /hard clam|\bclam\b|bivalve|meretrix|shellfish/i,
  ]);
}

function isKoalaConservationTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /無尾熊|樹袋熊|考拉/,
    /koala|phascolarctos cinereus/i,
  ]);
}

function isTaiwanSemiconductorSupplyChainTopic(
  input: SearchIntentPlannerInput,
): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  const hasTaiwanSemiconductorCue = hasAny(text, [
    /台灣.*半導體|半導體.*台灣|台積電|晶圓代工|晶片.*台灣/,
    /taiwan.*semiconductor|semiconductor.*taiwan|tsmc|taiwan.*chip|chip.*taiwan|foundry/i,
  ]);
  const hasSupplyChainCue = hasAny(text, [
    /供應鏈|產業鏈|封測|設備|材料|韌性|地緣政治|出口管制/,
    /supply chain|value chain|packaging|testing|equipment|materials|resilience|geopolitics|export controls/i,
  ]);
  return hasTaiwanSemiconductorCue && hasSupplyChainCue;
}

function isDinosaurTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /恐龍|中生代|侏羅紀|白堊紀|化石|古生物/,
    /dinosaur|fossil record|paleontology|jurassic|cretaceous|non-avian dinosaur/i,
  ]);
}

function isDonQuixoteTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return hasAny(text, [
    /唐吉訶德|唐吉柯德|塞萬提斯|騎士小說|西班牙黃金時代|文學史/,
    /don quixote|cervantes|chivalric romance|spanish golden age|literary history/i,
  ]);
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

function isClimateMarineEcologyImpactTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""}`);
  const hasClimateCue = hasAny(text, [
    /氣候變遷|全球暖化|海洋暖化|氣候/,
    /climate change|global warming|ocean warming/i,
  ]);
  const hasMarineCue = hasAny(text, [
    /海洋|海水|海洋生態|海洋生物|珊瑚|酸化/,
    /marine|ocean|coral|seawater|ocean acidification/i,
  ]);
  const hasImpactCue = hasAny(text, [
    /影響|衝擊|生態|生物多樣性|棲地|食物網/,
    /impact|effect|ecosystem|ecology|biodiversity|habitat|food web/i,
  ]);
  return hasClimateCue && hasMarineCue && hasImpactCue;
}

function isMarineMicroplasticsEcologyTopic(
  input: SearchIntentPlannerInput,
): boolean {
  const text = normalizeText(
    `${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`,
  );
  const topicOnly = normalizeText(input.topic);
  const hasMicroplasticsCue = hasAny(text, [
    /塑膠微粒|微塑膠|微塑料|塑料微粒|奈米塑膠|塑膠污染/,
    /microplastic|microplastics|nanoplastic|nanoplastics|plastic pollution/i,
  ]);
  const hasMarineCue = hasAny(text, [
    /海洋|海水|海域|沿岸|海岸|海洋生態/,
    /marine|ocean|seawater|coastal|estuarine/i,
  ]);
  const hasEcologyCue = hasAny(text, [
    /生態|生物|食物鏈|食物網|毒性|攝食|累積|生物多樣性/,
    /ecology|ecosystem|organism|food web|toxicity|ingestion|bioaccumulation|biodiversity/i,
  ]);
  const isShortMicroplasticsTopic = /^(微塑膠|微塑料|塑膠微粒|塑料微粒|奈米塑膠|microplastics?|nanoplastics?)$/i.test(topicOnly);
  return hasMicroplasticsCue && (hasMarineCue || hasEcologyCue || isShortMicroplasticsTopic);
}

function isTelomeraseAgingTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""}`);
  const hasTelomeraseCue = hasAny(text, [
    /端粒酶|端粒/,
    /telomerase|telomere|telomeres/i,
  ]);
  const hasAgingCue = hasAny(text, [
    /老化|衰老|長壽|細胞衰老/,
    /aging|ageing|senescence|longevity/i,
  ]);
  return hasTelomeraseCue && hasAgingCue;
}

function isSalmonellaFoodPoisoningTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""}`);
  const hasSalmonellaCue = hasAny(text, [/沙門氏菌/, /salmonella|salmonellosis/i]);
  const hasFoodSafetyCue = hasAny(text, [
    /食物中毒|食品安全|食源性|污染|感染/,
    /food poisoning|foodborne|food safety|contamination|outbreak/i,
  ]);
  return hasSalmonellaCue && hasFoodSafetyCue;
}

function isSocialMediaAddictionTopic(input: SearchIntentPlannerInput): boolean {
  const text = normalizeText(`${input.topic} ${input.reportType ?? ""}`);
  const hasSocialMediaCue = hasAny(text, [
    /社群媒體|社交媒體|社群平台|社交平台|手機|短影音/,
    /social media|social networking|smartphone|instagram|tiktok|facebook/i,
  ]);
  const hasAddictionCue = hasAny(text, [
    /成癮|上癮|沉迷|問題性使用|心理健康/,
    /addiction|addictive|problematic use|compulsive|mental health/i,
  ]);
  return hasSocialMediaCue && hasAddictionCue;
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

function researchQuestionFromClarificationCard(
  card: TopicClarificationCard,
  excludedDriftTerms: string[],
): ResearchReadyQuestion {
  const zhKeywords = unique(
    card.zhQueries.flatMap((query) =>
      query
        .split(/[\s，,、：:；;。！？!?（）()]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const enKeywords = unique(
    card.enQueries.flatMap((query) =>
      query
        .split(/[\s,;:()/-]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, 12);

  return {
    title: card.suggestedTopic,
    researchAngle: card.description,
    whyResearchable:
      "此方向已補上研究對象與查詢詞，可用學術論文或可信機構資料交叉搜尋。",
    suggestedSourceTypes: [
      "academic_paper",
      "systematic_review",
      "official_or_research_institution",
    ],
    zhKeywords,
    enKeywords,
    primaryQueries: unique([...card.enQueries, ...card.zhQueries]).slice(0, 6),
    secondaryQueries: unique([...card.zhQueries, ...card.enQueries]).slice(0, 6),
    excludedDriftTerms,
  };
}

function researchQuestionFromTopicResearchAngle(
  angle: TopicResearchAngle,
  excludedDriftTerms: string[],
): ResearchReadyQuestion {
  const zhKeywords = unique(
    angle.zhQueries.flatMap((query) =>
      query
        .split(/[\s，,、：:；;。！？!?（）()]+/)
        .map((term) => term.trim())
        .filter(Boolean),
    ),
  ).slice(0, 10);
  const enKeywords = unique(
    angle.enQueries.flatMap((query) =>
      query
        .split(/[\s,;:()/-]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, 12);

  return {
    title: angle.researchQuestion,
    researchAngle: angle.label,
    whyResearchable: angle.whyResearchable,
    suggestedSourceTypes: angle.suggestedSourceTypes,
    zhKeywords,
    enKeywords,
    primaryQueries: unique([...angle.enQueries, ...angle.zhQueries]).slice(0, 6),
    secondaryQueries: unique([...angle.zhQueries, ...angle.enQueries]).slice(0, 6),
    excludedDriftTerms,
  };
}

function researchQuestionFromFallbackAngle(
  angle: TopicUnderstanding["researchAngles"][number],
  excludedDriftTerms: string[],
): ResearchReadyQuestion {
  const zhKeywords = unique(
    angle.searchQueries
      .filter((query) => /[\u3400-\u9fff]/u.test(query))
      .flatMap((query) =>
        query
          .split(/[\s，,、：:；;。！？!?（）()]+/)
          .map((term) => term.trim())
          .filter(Boolean),
      ),
  ).slice(0, 10);
  const enKeywords = unique(
    angle.searchQueries
      .filter((query) => /[A-Za-z]/.test(query))
      .flatMap((query) =>
        query
          .split(/[\s,;:()/-]+/)
          .map((term) => term.trim())
          .filter((term) => term.length >= 2),
      ),
  ).slice(0, 12);

  return {
    title: angle.title,
    researchAngle: angle.angle,
    whyResearchable: angle.reason,
    suggestedSourceTypes: [
      "academic_paper",
      "systematic_review",
      "official_or_research_institution",
    ],
    zhKeywords,
    enKeywords,
    primaryQueries: unique(angle.searchQueries.filter((query) => /[A-Za-z]/.test(query))).slice(0, 6),
    secondaryQueries: unique(angle.searchQueries.filter((query) => /[\u3400-\u9fff]/u.test(query))).slice(0, 6),
    excludedDriftTerms,
  };
}

function hasLatin(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function stableEnglishTerms(values: string[]): string[] {
  return unique(values.map((value) => value.trim()).filter((value) => value && hasLatin(value)));
}

function domainEnglishBoostQueries(
  domain: TopicDomain | string,
  canonicalEnglishTopic: string,
): string[] {
  const topic = canonicalEnglishTopic.trim();
  if (!topic || !hasLatin(topic)) return [];

  switch (domain) {
    case "animal_science":
      return [
        topic,
        `${topic} husbandry`,
        `${topic} behavior`,
        `${topic} disease management`,
        `${topic} fiber`,
      ];
    case "health":
      return [
        topic,
        `${topic} infection`,
        `${topic} food safety`,
        `${topic} gastroenteritis`,
      ];
    case "environment":
      return [
        topic,
        `${topic} human exposure`,
        `${topic} toxicology`,
        `${topic} public health`,
      ];
    case "beverage_health":
      return [
        topic,
        `${topic} sugar caffeine`,
        `${topic} dental health`,
        `${topic} obesity risk`,
        `${topic} public health`,
      ];
    case "food_nutrition":
      return [
        topic,
        `${topic} nutrition`,
        `${topic} food safety`,
        `${topic} protein quality`,
      ];
    default:
      return [topic];
  }
}

function stableCrossLanguageEnglishQueries(input: {
  domain: TopicDomain | string;
  canonicalEnglishTopic: string;
  extraEnglishTerms: string[];
  existingQueries: string[];
  limit?: number;
}): string[] {
  const extraEnglishTerms = stableEnglishTerms(input.extraEnglishTerms);
  const existingQueries = cleanQueryList(input.existingQueries, input.limit ?? MAX_QUERY_COUNT);
  const bridgeQueries = cleanQueryList(
    [
      ...domainEnglishBoostQueries(input.domain, input.canonicalEnglishTopic),
      ...extraEnglishTerms,
    ],
    input.limit ?? MAX_QUERY_COUNT,
  );

  const preferBridgeFirst =
    input.domain === "animal_science" ||
    input.domain === "health" ||
    existingQueries.length < 4;
  const prioritized = preferBridgeFirst
    ? [...bridgeQueries, ...existingQueries]
    : [...existingQueries, ...bridgeQueries];

  return cleanQueryList(prioritized, input.limit ?? MAX_QUERY_COUNT);
}

function termsFromQueries(queries: string[]): string[] {
  return unique(
    queries.flatMap((query) =>
      query
        .split(/[\s，,、：:；;。！？!?（）()/-]+/)
        .map((term) => term.trim())
        .filter((term) => {
          if (!term) return false;
          if (/^[A-Za-z]+$/.test(term)) return term.length >= 3;
          return Array.from(term).length >= 2;
        }),
    ),
  );
}

function isBmwElectricVehiclePlanText(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    /\bbmw\b|寶馬|bayerische motoren werke/i.test(value) &&
    /electric vehicle|electrification|\bev\b|battery|supply chain|neue klasse|電動車|電動化|電池|供應鏈|轉型/i.test(
      normalized,
    )
  );
}

function isRotationalMechanicsPlanText(value: string): boolean {
  const normalized = normalizeText(value);
  return (
    /spinning top|gyroscope|陀螺|陀螺儀/.test(normalized) &&
    /angular momentum|torque|precession|rotational stability|rigid body|euler equations|lagrange top|角動量|扭矩|進動|旋轉穩定性|剛體轉動/.test(
      normalized,
    )
  );
}

function isFoodSafetyNutritionPlanText(value: string): boolean {
  const normalized = normalizeText(value);
  const hasEggSubject = /(?:\beggs?\b|chicken egg|hen egg|egg white|egg yolk|albumen|\byolk\b|shell eggs?|雞蛋|蛋品|蛋白(?!質)|蛋黃|全蛋|卵白|卵黃)/i.test(
    normalized,
  );
  return (
    hasEggSubject &&
    /nutrition|protein|cholesterol|food safety|salmonella|storage|refrigeration|safe handling|營養|蛋白質|膽固醇|食品安全|沙門氏菌|保存|冷藏/i.test(
      normalized,
    )
  );
}

function domainQueryExpansion(plan: SearchIntentPlan): string[] {
  const planText = [
    plan.normalizedTopic,
    plan.topicType ?? "",
    ...plan.primaryConcepts,
    ...plan.contextConcepts,
    ...plan.outcomeConcepts,
    ...plan.mustHaveTerms,
    ...plan.shouldHaveTerms,
    ...plan.chineseQueries,
    ...plan.englishQueries,
  ].join(" ");

  if (isBmwElectricVehiclePlanText(planText)) {
    return BMW_EV_STRATEGY_QUERIES;
  }

  if (/taiwan_semiconductor_supply_chain|Taiwan semiconductor|台灣半導體|台灣 半導體|TSMC|台積電/i.test(planText)) {
    return [
      "Taiwan semiconductor supply chain TSMC foundry packaging testing",
      "Taiwan semiconductor industry supply chain equipment materials",
      "TSMC supply chain advanced packaging CoWoS EUV",
      "Taiwan semiconductor supply chain resilience geopolitics export controls",
      "台灣 半導體 供應鏈 晶圓代工 封測 設備 材料",
      "台積電 供應鏈 先進封裝 CoWoS EUV",
    ];
  }

  return [];
}

function deterministicAcademicQueryVariants(plan: SearchIntentPlan): {
  chinese: string[];
  english: string[];
} {
  const text = normalizeText(
    [
      plan.normalizedTopic,
      ...plan.primaryConcepts,
      ...plan.mustHaveTerms,
      ...plan.chineseQueries,
      ...plan.englishQueries,
    ].join(" "),
  );

  if (/微塑膠|微塑料|塑膠微粒|塑料微粒|microplastic|nanoplastic/.test(text)) {
    return {
      chinese: ["微塑膠", "微塑料", "奈米塑膠", "塑膠微粒"],
      english: [
        "microplastics",
        "microplastic pollution",
        "microplastics human health",
        "microplastics drinking water",
        "microplastics marine environment",
        "micro- and nanoplastics",
      ],
    };
  }

  if (/碳酸飲料|含糖飲料|可樂|soft drink|soda|cola|sugar sweetened beverage/.test(text)) {
    return {
      chinese: ["碳酸飲料 健康影響", "含糖飲料 健康", "可樂 糖分 咖啡因"],
      english: [
        "soft drink consumption health effects",
        "sugar-sweetened beverages health outcomes",
        "carbonated beverages obesity metabolic health",
        "soda caffeine sugar health",
      ],
    };
  }

  if (/telomerase|telomere|端粒酶|端粒/.test(text)) {
    return {
      chinese: ["端粒酶 老化", "端粒長度 細胞衰老"],
      english: [
        "telomerase aging",
        "telomere length aging",
        "telomerase cellular senescence",
        "telomeres longevity review",
      ],
    };
  }

  if (/salmonella|salmonellosis|沙門氏菌/.test(text)) {
    return {
      chinese: ["沙門氏菌 食物中毒", "沙門氏菌 食品安全"],
      english: [
        "Salmonella food poisoning",
        "Salmonella foodborne illness",
        "salmonellosis outbreak food safety",
      ],
    };
  }

  if (/social media addiction|problematic social media|社群媒體成癮|社交媒體成癮/.test(text)) {
    return {
      chinese: ["社群媒體成癮", "問題性社群媒體使用", "社交媒體成癮 青少年"],
      english: [
        "social media addiction",
        "problematic social media use",
        "social media addiction mental health",
        "problematic social media use adolescents",
      ],
    };
  }

  if (/氣候變遷.*海洋|海洋.*氣候變遷|climate change.*marine|climate change.*ocean|marine ecosystem/.test(text)) {
    return {
      chinese: ["氣候變遷 海洋生態影響", "氣候變遷 海洋生物多樣性", "海洋暖化 生態系"],
      english: [
        "climate change impacts on marine ecosystems",
        "ocean warming marine biodiversity",
        "climate change marine ecology",
        "climate change ocean acidification marine ecosystems",
      ],
    };
  }

  return {
    chinese: /[\u4e00-\u9fff]/.test(plan.normalizedTopic)
      ? [plan.normalizedTopic]
      : [],
    english: /^[\x00-\x7F]+$/.test(plan.normalizedTopic)
      ? [plan.normalizedTopic, `${plan.normalizedTopic} systematic review`]
      : [],
  };
}

function sourceTypesFromUnderstanding(
  understanding: TopicUnderstandingResult,
): string[] {
  const fromAngles = understanding.researchAngles.flatMap(
    (angle) => angle.suggestedSourceTypes,
  );
  const domainDefaults: Record<string, string[]> = {
    animal_science: ["veterinary_or_biomedical_study", "animal_welfare_guideline"],
    automotive_business: ["company_report", "industry_report", "market_research"],
    beverage_health: ["nutrition_guideline", "public_health_study", "food_labeling"],
    consumer_product: ["product_safety_standard", "consumer_research", "life_cycle_assessment"],
    food_nutrition: ["nutrition_database", "food_safety_report", "public_health_study"],
    household_safety: ["product_safety_standard", "public_health_study", "consumer_guideline"],
    materials_design: ["materials_science_study", "engineering_or_design_study"],
    music_culture: ["musicology_study", "music_education_study", "instrument_acoustics_study"],
  };
  return unique([
    ...(domainDefaults[understanding.domain] ?? ["academic_paper", "official_or_research_institution"]),
    ...fromAngles,
  ]).slice(0, 10);
}

function buildUnderstandingSearchIntent(
  input: SearchIntentPlannerInput,
  understanding: TopicUnderstandingResult,
  reason: string,
  plannerStatus: SearchIntentPlannerStatus,
): SearchIntentPlan {
  const angleCards = understanding.clarificationCards;
  const questions = (
    angleCards.length
      ? angleCards.map((card) =>
          researchQuestionFromClarificationCard(card, understanding.excludedDriftTerms),
        )
      : understanding.researchAngles.map((angle) =>
          researchQuestionFromTopicResearchAngle(angle, understanding.excludedDriftTerms),
        )
  ).slice(0, 6);
  const zhQueries = unique([
    ...understanding.searchQueries.zh,
    ...angleCards.flatMap((card) => card.zhQueries),
    ...questions.flatMap((question) => question.primaryQueries),
  ]).slice(0, MAX_QUERY_COUNT);
  const enQueries = stableCrossLanguageEnglishQueries({
    domain: understanding.domain,
    canonicalEnglishTopic: understanding.canonicalEnglishTopic,
    extraEnglishTerms: [
      ...understanding.englishTerms,
      ...understanding.scientificNames,
      ...(understanding.entity ? entitySearchTerms(understanding.entity) : []),
    ],
    existingQueries: unique([
      ...understanding.searchQueries.en,
      ...angleCards.flatMap((card) => card.enQueries),
      ...questions.flatMap((question) => question.secondaryQueries),
    ]),
  }).slice(0, MAX_QUERY_COUNT);
  const planText = [
    input.topic,
    understanding.normalizedTopic,
    ...understanding.canonicalTerms,
    ...understanding.englishTerms,
    ...enQueries,
    ...zhQueries,
  ].join(" ");
  const expandedEnglishQueries = isBmwElectricVehiclePlanText(planText)
    ? unique([...BMW_EV_STRATEGY_QUERIES, ...enQueries]).slice(0, MAX_QUERY_COUNT)
    : enQueries;
  const queryTerms = termsFromQueries([...zhQueries, ...enQueries]);
  const specificTopicConcepts =
    understanding.topicKind === "specific_research_topic"
      ? unique([
          ...understanding.coreConcepts,
          ...queryTerms,
        ])
      : [];
  const conceptTerms = unique([
    ...specificTopicConcepts,
    ...understanding.canonicalTerms,
    ...understanding.aliases,
    ...understanding.englishTerms,
    ...understanding.scientificNames,
    ...(understanding.entity ? entitySearchTerms(understanding.entity) : []),
  ]);
  const angleLabels = understanding.researchAngles.map((angle) => angle.label);
  const domainContext = sourceTypesFromUnderstanding(understanding);
  const fallbackTerms = topicTerms(input.topic);
  const primaryConcepts = unique(
    conceptTerms.length ? conceptTerms : fallbackTerms.length ? fallbackTerms : [input.topic.trim()],
  ).slice(0, 14);
  const mustHaveTerms = unique([
    ...primaryConcepts,
    ...understanding.scientificNames,
  ]).slice(0, 18);

  return {
    normalizedTopic: understanding.normalizedTopic || input.topic.trim(),
    topicUnderstanding: understanding,
    topicType: `${understanding.domain}_${understanding.topicKind}`,
    primaryConcepts,
    contextConcepts: unique([
      ...domainContext,
      ...angleLabels,
      ...queryTerms,
    ]).slice(0, 14),
    outcomeConcepts: unique([
      ...understanding.researchAngles.map((angle) => angle.researchQuestion),
      ...understanding.researchAngles.map((angle) => angle.whyResearchable),
      ...queryTerms.slice(0, 8),
    ]).slice(0, 12),
    populationConcepts: [],
    lowWeightTerms: [
      "research",
      "study",
      "overview",
      "文獻",
      "研究",
      "影響",
      "策略",
    ],
    mustHaveTerms,
    shouldHaveTerms: unique([
      ...queryTerms,
      ...angleLabels,
      ...domainContext,
    ]).slice(0, 18),
    penaltyTerms: understanding.excludedDriftTerms,
    negativeTerms: understanding.excludedDriftTerms,
    chineseQueries: zhQueries.length
      ? zhQueries
      : unique([
          ...primaryConcepts.map((term) => `${term} 安全 營養 市場 文化`.trim()),
          ...fallbackTerms,
        ]).slice(0, MAX_QUERY_COUNT),
    englishQueries: expandedEnglishQueries.length
      ? expandedEnglishQueries
      : unique([
          ...primaryConcepts.map((term) => `${term} safety nutrition market culture`.trim()),
        ]).slice(0, MAX_QUERY_COUNT),
    narrowedResearchQuestions: questions,
    excludedDriftTerms: understanding.excludedDriftTerms,
    reasoningNotes: planReason(
      reason,
      `Topic understanding classified "${input.topic}" as ${understanding.topicKind} in ${understanding.domain}; queries were generated from researchAngles, aliases, English terms, and excluded meanings.`,
    ),
    plannerStatus,
    fallbackUsed: true,
    originalTopic: input.originalTopic?.trim() || input.topic.trim(),
    activeResearchTopic: input.topic.trim(),
    canonicalEnglishTopic: understanding.canonicalEnglishTopic,
    coreConcepts: understanding.coreConcepts,
  };
}

function buildEntityAwareSearchIntent(
  input: SearchIntentPlannerInput,
  reason: string,
  plannerStatus: SearchIntentPlannerStatus,
): SearchIntentPlan | null {
  const understanding = understandTopic(input.topic);
  if (!understanding.entity) return null;

  const entityTerms = entitySearchTerms(understanding.entity);
  const clarificationQuestions = (
    understanding.clarificationCards.length
      ? understanding.clarificationCards.map((card) =>
          researchQuestionFromClarificationCard(card, understanding.excludedDriftTerms),
        )
      : understanding.researchAngles.map((angle) =>
          researchQuestionFromTopicResearchAngle(angle, understanding.excludedDriftTerms),
        )
  ).slice(0, 6);
  const zhQueries = unique([
    ...understanding.searchQueries.zh,
    ...understanding.clarificationCards.flatMap((card) => card.zhQueries),
    ...clarificationQuestions.flatMap((question) => question.primaryQueries),
  ]).slice(0, MAX_QUERY_COUNT);
  const enQueries = stableCrossLanguageEnglishQueries({
    domain: understanding.domain,
    canonicalEnglishTopic: understanding.canonicalEnglishTopic,
    extraEnglishTerms: [
      ...understanding.englishTerms,
      ...understanding.scientificNames,
      ...entityTerms,
    ],
    existingQueries: unique([
      ...understanding.searchQueries.en,
      ...understanding.clarificationCards.flatMap((card) => card.enQueries),
      ...clarificationQuestions.flatMap((question) => question.secondaryQueries),
    ]),
  }).slice(0, MAX_QUERY_COUNT);
  const categoryConcepts: Record<string, string[]> = {
    animal: ["animal model", "husbandry", "animal welfare", "behavior"],
    food: ["nutrition", "food safety", "consumption", "food labeling"],
    unknown: ["physics", "materials", "learning", "application"],
  };

  return {
    normalizedTopic: understanding.normalizedTopic,
    topicUnderstanding: understanding,
    topicType:
      understanding.topicKind === "specific_research_topic"
        ? `${understanding.entity.category}_specific_entity_topic`
        : `${understanding.entity.category}_entity_clarification`,
    primaryConcepts: unique(entityTerms),
    contextConcepts: unique([
      ...(categoryConcepts[understanding.entity.category] ?? []),
      ...clarificationQuestions.flatMap((question) => question.enKeywords.slice(0, 4)),
      ...clarificationQuestions.flatMap((question) => question.zhKeywords.slice(0, 4)),
    ]).slice(0, 14),
    outcomeConcepts: unique(
      clarificationQuestions.flatMap((question) => [
        question.researchAngle,
        ...question.zhKeywords.slice(0, 3),
      ]),
    ).slice(0, 12),
    populationConcepts: [],
    lowWeightTerms: ["research", "study", "文獻", "研究", "影響"],
    mustHaveTerms: unique([
      ...entityTerms,
      ...(understanding.entity.scientificNames ?? []),
    ]).slice(0, 18),
    shouldHaveTerms: unique([
      ...clarificationQuestions.flatMap((question) => question.enKeywords),
      ...clarificationQuestions.flatMap((question) => question.zhKeywords),
    ]).slice(0, 18),
    penaltyTerms: understanding.excludedDriftTerms,
    negativeTerms: understanding.excludedDriftTerms,
    chineseQueries: zhQueries.length ? zhQueries : entityTerms.slice(0, 4),
    englishQueries: enQueries.length ? enQueries : entityTerms.slice(0, 4),
    narrowedResearchQuestions: clarificationQuestions,
    excludedDriftTerms: understanding.excludedDriftTerms,
    reasoningNotes: planReason(
      reason,
      `Topic understanding classified "${input.topic}" as ${understanding.topicKind}; entity aliases and English/scientific names were used before search.`,
    ),
    plannerStatus,
    fallbackUsed: true,
  };
}

export function buildRuleBasedSearchIntent(
  input: SearchIntentPlannerInput,
  reason = "LLM planner unavailable; deterministic search intent fallback used.",
  plannerStatus: SearchIntentPlannerStatus = "rule_fallback",
): SearchIntentPlan {
  const normalizedTopic = input.topic.trim();
  const understanding = understandTopic(normalizedTopic);

  if (isUrbanHeatIslandTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
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
      topicUnderstanding: understanding,
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
      topicUnderstanding: understanding,
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

  if (isAiLearningEffectTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "ai_learning_effect_secondary_education",
      primaryConcepts: AI_LEARNING_EFFECT_PRIMARY,
      contextConcepts: AI_LEARNING_EFFECT_CONTEXT,
      outcomeConcepts: AI_LEARNING_EFFECT_OUTCOMES,
      populationConcepts: ["high school students", "secondary students", "adolescents", "高中生"],
      lowWeightTerms: AI_LEARNING_EFFECT_LOW_WEIGHT,
      mustHaveTerms: AI_LEARNING_EFFECT_MUST_HAVE,
      shouldHaveTerms: [
        "high school students",
        "secondary education",
        "learning outcomes",
        "academic achievement",
        "student engagement",
        "self-regulated learning",
        "高中生",
        "學習成效",
        "學業成就",
      ],
      penaltyTerms: AI_LEARNING_EFFECT_PENALTIES,
      negativeTerms: [
        "software engineering only",
        "code generation only",
        "model benchmark without education",
        "medical AI without students or learning",
      ],
      chineseQueries: [
        "人工智慧 高中生 學習成效",
        "生成式 AI 高中生 學習成效",
        "AI 教學 高中生 學業成就",
        "教育科技 人工智慧 中學生 學習表現",
        "ChatGPT 高中生 學習動機 學習成效",
        "智慧教學系統 中學生 學習成效",
      ],
      englishQueries: [
        "artificial intelligence high school students learning outcomes",
        "generative AI secondary education learning outcomes",
        "AI tutoring high school students academic achievement",
        "intelligent tutoring system secondary students learning performance",
        "ChatGPT students learning outcomes secondary education",
        "AI in education student engagement academic achievement",
        "educational technology artificial intelligence learning performance students",
      ],
      narrowedResearchQuestions: [
        {
          title: "AI 工具對高中生學習成效與學業表現的影響",
          researchAngle: "比較 AI 教學、生成式 AI 或智慧 tutoring 對學習成果的實證研究。",
          whyResearchable: "可使用教育科技、AI in education、學習成效與學業成就研究交叉驗證。",
          suggestedSourceTypes: ["academic_paper", "systematic_review", "education_study"],
          zhKeywords: ["人工智慧", "高中生", "學習成效", "學業成就"],
          enKeywords: ["artificial intelligence", "high school students", "learning outcomes", "academic achievement"],
          primaryQueries: [
            "artificial intelligence high school students learning outcomes",
            "AI tutoring high school students academic achievement",
          ],
          secondaryQueries: [
            "generative AI secondary education learning outcomes",
            "AI in education student engagement academic achievement",
          ],
          excludedDriftTerms: AI_LEARNING_EFFECT_PENALTIES,
        },
        {
          title: "生成式 AI 對學生投入、動機與自我調節學習的影響",
          researchAngle: "分析 ChatGPT 或生成式 AI 在課堂學習中的使用與學習投入。",
          whyResearchable: "可查學生動機、自我調節、教育科技與課堂介入研究。",
          suggestedSourceTypes: ["academic_paper", "systematic_review", "education_policy"],
          zhKeywords: ["生成式 AI", "學習動機", "學習投入", "自我調節學習"],
          enKeywords: ["generative AI", "student engagement", "motivation", "self-regulated learning"],
          primaryQueries: [
            "generative AI student engagement motivation learning outcomes",
            "ChatGPT students self-regulated learning academic achievement",
          ],
          secondaryQueries: [
            "AI in education motivation student learning performance",
          ],
          excludedDriftTerms: AI_LEARNING_EFFECT_PENALTIES,
        },
      ],
      reasoningNotes: planReason(
        reason,
        "AI learning-effect searches must keep artificial-intelligence terms tied to students, secondary education, learning outcomes, academic achievement, engagement, or motivation; software-only AI matches are drift.",
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
      topicUnderstanding: understanding,
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
      topicUnderstanding: understanding,
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
      topicUnderstanding: understanding,
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

  if (isEggNutritionProteinTopic(input)) {
    const narrowedResearchQuestions: ResearchReadyQuestion[] = [
      {
        title: "雞蛋營養成分與蛋白質品質",
        researchAngle: "整理雞蛋整體營養成分、蛋白質品質與必需胺基酸組成。",
        whyResearchable: "可由食品成分、營養學、蛋白質品質與胺基酸 profile 文獻交叉驗證。",
        suggestedSourceTypes: ["peer_reviewed_journal", "nutrition_database", "food_composition_study"],
        zhKeywords: ["雞蛋", "營養成分", "蛋白質品質", "胺基酸組成"],
        enKeywords: ["egg nutrition", "protein quality", "amino acid profile", "biological value"],
        primaryQueries: [
          "egg nutrition protein quality",
          "egg protein amino acid profile",
          "chicken egg nutritional composition",
        ],
        secondaryQueries: [
          "dietary protein quality egg",
          "egg protein biological value",
        ],
        excludedDriftTerms: EGG_NUTRITION_DRIFT_TERMS,
      },
      {
        title: "蛋白與蛋黃的營養及胺基酸差異",
        researchAngle: "比較 egg white/albumen 與 egg yolk/yolk 在蛋白質、脂質與胺基酸組成上的差異。",
        whyResearchable: "可查找蛋白、蛋黃、albumen、yolk 的營養分析與食品科學研究。",
        suggestedSourceTypes: ["food_science_study", "nutrition_database", "academic_paper"],
        zhKeywords: ["蛋白", "蛋黃", "營養價值", "胺基酸"],
        enKeywords: ["egg white", "albumen", "egg yolk", "yolk", "amino acid composition"],
        primaryQueries: [
          "egg white protein digestibility",
          "egg yolk nutrition amino acids",
          "albumen amino acid composition",
        ],
        secondaryQueries: [
          "egg white yolk amino acid composition",
          "egg yolk protein amino acids nutrition",
        ],
        excludedDriftTerms: EGG_NUTRITION_DRIFT_TERMS,
      },
    ];

    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "egg_nutrition_protein_quality",
      primaryConcepts: EGG_NUTRITION_PRIMARY,
      contextConcepts: EGG_NUTRITION_CONTEXT,
      outcomeConcepts: EGG_NUTRITION_OUTCOMES,
      populationConcepts: [],
      lowWeightTerms: EGG_NUTRITION_LOW_WEIGHT,
      mustHaveTerms: EGG_NUTRITION_MUST_HAVE,
      shouldHaveTerms: [
        "egg nutrition",
        "egg protein quality",
        "amino acid profile",
        "egg white protein",
        "egg yolk nutrition",
        "albumen",
        "protein digestibility",
        "biological value",
        "雞蛋營養成分",
        "蛋白質品質",
        "胺基酸組成",
        "蛋白 蛋黃",
      ],
      penaltyTerms: EGG_NUTRITION_DRIFT_TERMS,
      negativeTerms: EGG_NUTRITION_DRIFT_TERMS,
      chineseQueries: [
        "雞蛋 營養成分 蛋白質品質",
        "雞蛋 胺基酸組成",
        "蛋白 蛋黃 營養價值",
        "雞蛋蛋白質 消化率",
        "雞蛋 生物價 胺基酸",
        "雞蛋 蛋白質 必需胺基酸",
      ],
      englishQueries: [
        "egg nutrition protein quality",
        "egg protein amino acid profile",
        "chicken egg nutritional composition",
        "egg white protein digestibility",
        "egg yolk nutrition amino acids",
        "albumen amino acid composition",
        "dietary protein quality egg",
        "egg protein biological value",
        "egg white yolk amino acid composition",
      ],
      narrowedResearchQuestions,
      excludedDriftTerms: EGG_NUTRITION_DRIFT_TERMS,
      reasoningNotes: planReason(
        reason,
        "Egg nutrition searches must keep egg/chicken egg/albumen/yolk terms tied to nutrition, protein quality, amino-acid composition, digestibility, or biological value; sports, climate, aviation, and unrelated infusion topics are hard drift.",
      ),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isCodTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "cod_food_nutrition",
      primaryConcepts: COD_PRIMARY,
      contextConcepts: COD_CONTEXT,
      outcomeConcepts: ["營養成分", "食品安全", "永續漁業", "omega-3", "重金屬"],
      populationConcepts: [],
      lowWeightTerms: ["fish", "seafood", "nutrition", "營養"],
      mustHaveTerms: COD_MUST_HAVE,
      shouldHaveTerms: unique([...COD_CONTEXT, "omega-3", "DHA", "EPA", "mercury", "heavy metals"]),
      penaltyTerms: COD_DRIFT_TERMS,
      negativeTerms: COD_DRIFT_TERMS,
      chineseQueries: [
        "鱈魚 營養成分 omega-3 DHA EPA",
        "鱈魚 重金屬 mercury 食品安全",
        "鱈魚 永續漁業 漁業管理",
        "大西洋鱈魚 fish protein seafood safety",
      ],
      englishQueries: [
        "Atlantic cod nutrition omega-3 DHA EPA",
        "cod fish heavy metals mercury seafood safety",
        "Gadus morhua nutritional composition",
        "Atlantic cod sustainable fisheries management",
      ],
      narrowedResearchQuestions: [
        {
          title: "鱈魚營養成分與 omega-3 價值",
          researchAngle: "整理鱈魚蛋白質、omega-3、DHA 與 EPA 的營養價值。",
          whyResearchable: "可由魚類營養研究與食品成分資料庫交叉驗證。",
          suggestedSourceTypes: ["food_composition_study", "nutrition_database", "academic_paper"],
          zhKeywords: ["鱈魚", "omega-3", "DHA", "EPA", "營養成分"],
          enKeywords: ["Atlantic cod", "cod fish", "omega-3", "DHA", "EPA"],
          primaryQueries: ["鱈魚 營養成分 omega-3 DHA EPA", "Atlantic cod nutrition omega-3 DHA EPA"],
          secondaryQueries: ["Gadus morhua nutritional composition", "cod fish protein fatty acid composition"],
          excludedDriftTerms: COD_DRIFT_TERMS,
        },
      ],
      excludedDriftTerms: COD_DRIFT_TERMS,
      reasoningNotes: planReason(reason, "Cod searches must keep cod/fish/seafood terms tied to nutrition, food safety, or fisheries context."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isChickenThighTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "chicken_thigh_food_nutrition",
      primaryConcepts: CHICKEN_THIGH_PRIMARY,
      contextConcepts: CHICKEN_THIGH_CONTEXT,
      outcomeConcepts: ["蛋白質", "脂肪含量", "熱量", "Salmonella", "食品安全"],
      populationConcepts: [],
      lowWeightTerms: ["food", "meat", "nutrition", "飲食"],
      mustHaveTerms: CHICKEN_THIGH_MUST_HAVE,
      shouldHaveTerms: unique([...CHICKEN_THIGH_CONTEXT, "chicken protein", "fat content"]),
      penaltyTerms: CHICKEN_THIGH_DRIFT_TERMS,
      negativeTerms: CHICKEN_THIGH_DRIFT_TERMS,
      chineseQueries: [
        "雞腿肉 營養 蛋白質 脂肪 熱量",
        "雞腿 食品安全 沙門氏菌 烹調",
        "雞肉 poultry Salmonella food safety",
        "雞腿 烹調方式 脂肪含量",
      ],
      englishQueries: [
        "chicken thigh nutrition protein fat content",
        "chicken thigh Salmonella food safety",
        "chicken leg calories protein composition",
        "poultry meat cooking storage safety",
      ],
      narrowedResearchQuestions: [
        {
          title: "雞腿肉營養與脂肪含量",
          researchAngle: "整理 chicken thigh 的蛋白質、脂肪與熱量組成。",
          whyResearchable: "可由食品成分與肉品營養研究交叉驗證。",
          suggestedSourceTypes: ["food_composition_study", "nutrition_database", "academic_paper"],
          zhKeywords: ["雞腿肉", "蛋白質", "脂肪", "熱量"],
          enKeywords: ["chicken thigh", "protein", "fat content", "calories"],
          primaryQueries: ["雞腿肉 營養 蛋白質 脂肪 熱量", "chicken thigh nutrition protein fat content"],
          secondaryQueries: ["chicken leg calories protein composition"],
          excludedDriftTerms: CHICKEN_THIGH_DRIFT_TERMS,
        },
      ],
      excludedDriftTerms: CHICKEN_THIGH_DRIFT_TERMS,
      reasoningNotes: planReason(reason, "Chicken-thigh searches must keep chicken/poultry terms tied to nutrition, cooking, or Salmonella food-safety evidence."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isClamSafetyEcologyTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "clam_ecology_food_safety",
      primaryConcepts: CLAM_PRIMARY,
      contextConcepts: CLAM_CONTEXT,
      outcomeConcepts: ["生態棲地", "食用安全", "貝毒", "重金屬", "水質", "養殖管理"],
      populationConcepts: [],
      lowWeightTerms: ["seafood", "shellfish", "food", "ecology", "海鮮", "貝類", "生態"],
      mustHaveTerms: CLAM_MUST_HAVE,
      shouldHaveTerms: unique([...CLAM_CONTEXT, "shellfish safety", "water quality", "aquaculture"]),
      penaltyTerms: CLAM_DRIFT_TERMS,
      negativeTerms: CLAM_DRIFT_TERMS,
      chineseQueries: [
        "蛤蜊 生態 棲地 水質",
        "文蛤 潮間帶 底質 生長",
        "蛤蜊 食用安全 貝毒 重金屬",
        "文蛤 微生物 食品安全",
        "蛤蜊 養殖 水質 病害",
      ],
      englishQueries: [
        "hard clam habitat ecology water quality",
        "clam shellfish safety biotoxins heavy metals",
        "bivalve microbial food safety clam",
        "hard clam aquaculture management water quality",
        "Meretrix lusoria aquaculture food safety",
      ],
      narrowedResearchQuestions: [
        {
          title: "蛤蜊的生態棲地與水質條件",
          researchAngle: "整理蛤蜊／文蛤在潮間帶、底質、水質與養殖環境中的生長條件。",
          whyResearchable: "可用海洋生態、水產養殖與政府監測資料交叉驗證。",
          suggestedSourceTypes: ["aquaculture_study", "marine_ecology_paper", "government_monitoring_data"],
          zhKeywords: ["蛤蜊", "文蛤", "棲地", "水質", "潮間帶"],
          enKeywords: ["clam", "hard clam", "bivalve", "water quality", "habitat"],
          primaryQueries: ["蛤蜊 生態 棲地 水質", "hard clam habitat ecology water quality"],
          secondaryQueries: ["文蛤 潮間帶 底質 生長", "Meretrix lusoria aquaculture food safety"],
          excludedDriftTerms: CLAM_DRIFT_TERMS,
        },
        {
          title: "蛤蜊食用安全與污染風險",
          researchAngle: "分析蛤蜊的貝毒、重金屬、微生物與 shellfish safety 管理。",
          whyResearchable: "可查食品安全、環境污染與官方貝類衛生資料。",
          suggestedSourceTypes: ["food_safety_guideline", "environmental_monitoring", "academic_paper"],
          zhKeywords: ["蛤蜊", "食用安全", "貝毒", "重金屬", "微生物"],
          enKeywords: ["clam", "shellfish safety", "biotoxins", "heavy metals", "microbial"],
          primaryQueries: ["蛤蜊 食用安全 貝毒 重金屬", "clam shellfish safety biotoxins heavy metals"],
          secondaryQueries: ["bivalve microbial food safety clam", "shellfish safety monitoring clam"],
          excludedDriftTerms: CLAM_DRIFT_TERMS,
        },
      ],
      excludedDriftTerms: CLAM_DRIFT_TERMS,
      reasoningNotes: planReason(reason, "Clam searches must keep clam/hard-clam/bivalve/shellfish terms tied to ecology, aquaculture, water quality, or food-safety evidence."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isKoalaConservationTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "koala_habitat_conservation",
      primaryConcepts: KOALA_PRIMARY,
      contextConcepts: KOALA_CONTEXT,
      outcomeConcepts: ["棲地保育", "族群威脅", "疾病", "野火", "道路死亡", "保育政策"],
      populationConcepts: [],
      lowWeightTerms: ["animal", "wildlife", "conservation", "動物", "野生動物", "保育"],
      mustHaveTerms: KOALA_MUST_HAVE,
      shouldHaveTerms: unique([...KOALA_CONTEXT, "habitat conservation", "population threats"]),
      penaltyTerms: KOALA_DRIFT_TERMS,
      negativeTerms: KOALA_DRIFT_TERMS,
      chineseQueries: [
        "無尾熊 保育",
        "無尾熊 棲地",
        "無尾熊 棲地 保育 桉樹",
        "樹袋熊 棲地破碎化 族群",
        "無尾熊 疾病 野火 道路 族群",
        "無尾熊 保育政策 棲地連通性",
      ],
      englishQueries: [
        "koala conservation",
        "koala habitat",
        "Phascolarctos cinereus",
        "koala habitat conservation eucalyptus fragmentation",
        "Phascolarctos cinereus habitat loss conservation",
        "koala chlamydia bushfire road mortality population",
        "koala conservation policy habitat connectivity",
      ],
      narrowedResearchQuestions: [
        {
          title: "無尾熊棲地流失與保育策略",
          researchAngle: "整理桉樹棲地、棲地破碎化、土地利用與保護區管理。",
          whyResearchable: "可使用保育研究、澳洲政府資料與族群監測報告。",
          suggestedSourceTypes: ["conservation_report", "ecology_paper", "government_wildlife_data"],
          zhKeywords: ["無尾熊", "棲地", "保育", "桉樹", "棲地破碎化"],
          enKeywords: ["koala", "habitat conservation", "eucalyptus", "fragmentation"],
          primaryQueries: ["無尾熊 棲地 保育 桉樹", "koala habitat conservation eucalyptus fragmentation"],
          secondaryQueries: ["Phascolarctos cinereus habitat loss conservation"],
          excludedDriftTerms: KOALA_DRIFT_TERMS,
        },
        {
          title: "疾病、野火與道路對無尾熊族群的威脅",
          researchAngle: "分析 chlamydia、bushfire、road mortality 對族群趨勢的影響。",
          whyResearchable: "可查獸醫研究、保育報告、野火後監測與道路死亡資料。",
          suggestedSourceTypes: ["veterinary_study", "conservation_monitoring", "government_report"],
          zhKeywords: ["無尾熊", "疾病", "野火", "道路死亡", "族群"],
          enKeywords: ["koala", "chlamydia", "bushfire", "road mortality", "population"],
          primaryQueries: ["無尾熊 疾病 野火 道路 族群", "koala chlamydia bushfire road mortality population"],
          secondaryQueries: ["koala population threats conservation"],
          excludedDriftTerms: KOALA_DRIFT_TERMS,
        },
      ],
      excludedDriftTerms: KOALA_DRIFT_TERMS,
      reasoningNotes: planReason(reason, "Koala searches must stay anchored to koala/Phascolarctos and habitat, eucalyptus, conservation, disease, bushfire, or road-mortality evidence."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isTaiwanSemiconductorSupplyChainTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "taiwan_semiconductor_supply_chain",
      primaryConcepts: TAIWAN_SEMICONDUCTOR_PRIMARY,
      contextConcepts: TAIWAN_SEMICONDUCTOR_CONTEXT,
      outcomeConcepts: ["產業分工", "供應鏈韌性", "地緣政治風險", "出口管制", "先進製程", "封裝產能"],
      populationConcepts: [],
      lowWeightTerms: ["industry", "technology", "market", "產業", "科技", "市場"],
      mustHaveTerms: TAIWAN_SEMICONDUCTOR_MUST_HAVE,
      shouldHaveTerms: unique([...TAIWAN_SEMICONDUCTOR_CONTEXT, "TSMC", "advanced packaging"]),
      penaltyTerms: TAIWAN_SEMICONDUCTOR_DRIFT_TERMS,
      negativeTerms: TAIWAN_SEMICONDUCTOR_DRIFT_TERMS,
      chineseQueries: [
        "台灣 半導體 供應鏈 晶圓代工 封測",
        "台積電 供應鏈 設備 材料",
        "台灣 半導體 供應鏈 韌性 地緣政治",
        "半導體 出口管制 台灣 供應鏈 風險",
        "台灣 半導體 先進製程 封裝 EUV",
      ],
      englishQueries: [
        "Taiwan semiconductor supply chain foundry packaging testing materials",
        "TSMC supply chain equipment materials",
        "Taiwan semiconductor supply chain resilience geopolitics",
        "semiconductor export controls Taiwan supply chain risk",
        "Taiwan semiconductor advanced packaging EUV CoWoS supply chain",
      ],
      narrowedResearchQuestions: [
        {
          title: "台灣半導體供應鏈的產業分工",
          researchAngle: "整理晶圓代工、封裝測試、設備、材料與關鍵企業角色。",
          whyResearchable: "可用企業年報、政府統計、產業報告與政策資料交叉驗證。",
          suggestedSourceTypes: ["industry_report", "company_report", "government_statistics"],
          zhKeywords: ["台灣半導體", "供應鏈", "晶圓代工", "封測", "設備材料"],
          enKeywords: ["Taiwan semiconductor", "supply chain", "foundry", "packaging", "materials"],
          primaryQueries: ["台灣 半導體 供應鏈 晶圓代工 封測", "Taiwan semiconductor supply chain foundry packaging testing materials"],
          secondaryQueries: ["TSMC supply chain equipment materials"],
          excludedDriftTerms: TAIWAN_SEMICONDUCTOR_DRIFT_TERMS,
        },
        {
          title: "地緣政治下的台灣半導體供應鏈韌性",
          researchAngle: "分析出口管制、美中科技競爭、產能集中與供應鏈重組風險。",
          whyResearchable: "可查政策報告、智庫、國際機構與產業分析。",
          suggestedSourceTypes: ["policy_report", "think_tank_report", "industry_analysis"],
          zhKeywords: ["台灣半導體", "地緣政治", "出口管制", "供應鏈韌性"],
          enKeywords: ["Taiwan semiconductor", "geopolitics", "export controls", "supply chain resilience"],
          primaryQueries: ["台灣 半導體 供應鏈 韌性 地緣政治", "Taiwan semiconductor supply chain resilience geopolitics"],
          secondaryQueries: ["semiconductor export controls Taiwan supply chain risk"],
          excludedDriftTerms: TAIWAN_SEMICONDUCTOR_DRIFT_TERMS,
        },
      ],
      excludedDriftTerms: TAIWAN_SEMICONDUCTOR_DRIFT_TERMS,
      reasoningNotes: planReason(reason, "Taiwan semiconductor searches must combine Taiwan/TSMC/semiconductor with supply-chain, foundry, packaging, equipment/materials, resilience, or export-control context."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isDinosaurTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "dinosaur_paleontology",
      primaryConcepts: DINOSAUR_PRIMARY,
      contextConcepts: DINOSAUR_CONTEXT,
      outcomeConcepts: ["化石紀錄", "滅絕機制", "鳥類演化"],
      populationConcepts: [],
      lowWeightTerms: ["history", "culture", "study", "研究"],
      mustHaveTerms: DINOSAUR_MUST_HAVE,
      shouldHaveTerms: unique([...DINOSAUR_CONTEXT, "asteroid impact", "bird evolution"]),
      penaltyTerms: [],
      negativeTerms: [],
      chineseQueries: [
        "恐龍 化石紀錄 中生代 侏羅紀 白堊紀",
        "恐龍 滅絕 小行星撞擊 白堊紀末",
        "恐龍 鳥類演化 羽毛 化石",
      ],
      englishQueries: [
        "dinosaur fossil record Mesozoic",
        "dinosaur extinction asteroid impact Cretaceous",
        "dinosaur bird evolution feather fossils",
      ],
      narrowedResearchQuestions: [
        {
          title: "恐龍化石紀錄與中生代演化",
          researchAngle: "整理恐龍的化石紀錄、Jurassic、Cretaceous 與演化脈絡。",
          whyResearchable: "可由古生物學與自然史資料支撐。",
          suggestedSourceTypes: ["paleontology_paper", "review", "natural_history_reference"],
          zhKeywords: ["恐龍", "化石紀錄", "中生代", "侏羅紀", "白堊紀"],
          enKeywords: ["dinosaur", "fossil record", "Mesozoic", "Jurassic", "Cretaceous"],
          primaryQueries: ["恐龍 化石紀錄 中生代 侏羅紀 白堊紀", "dinosaur fossil record Mesozoic"],
          secondaryQueries: ["Jurassic Cretaceous dinosaur paleontology"],
          excludedDriftTerms: [],
        },
      ],
      excludedDriftTerms: [],
      reasoningNotes: planReason(reason, "Dinosaur searches should stay anchored to paleontology, fossil evidence, extinction hypotheses, and avian evolution."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isDonQuixoteTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "don_quixote_literature",
      primaryConcepts: DON_QUIXOTE_PRIMARY,
      contextConcepts: DON_QUIXOTE_CONTEXT,
      outcomeConcepts: ["文本分析", "騎士小說諷刺", "理想與現實衝突", "文學史地位"],
      populationConcepts: [],
      lowWeightTerms: ["research", "study", "analysis", "文學"],
      mustHaveTerms: DON_QUIXOTE_MUST_HAVE,
      shouldHaveTerms: unique([...DON_QUIXOTE_CONTEXT, "novel", "literature"]),
      penaltyTerms: DON_QUIXOTE_DRIFT_TERMS,
      negativeTerms: DON_QUIXOTE_DRIFT_TERMS,
      chineseQueries: [
        "唐吉訶德 文本分析 塞萬提斯",
        "唐吉柯德 騎士小說 諷刺 理想 現實",
        "唐吉訶德 文學史 西班牙黃金時代",
      ],
      englishQueries: [
        "Don Quixote textual analysis Cervantes",
        "Don Quixote chivalric romance satire idealism reality",
        "Don Quixote Spanish Golden Age literary history",
      ],
      narrowedResearchQuestions: [
        {
          title: "《唐吉訶德》的文本分析與敘事特色",
          researchAngle: "從敘事結構、人物塑造與理想／現實張力分析《唐吉訶德》。",
          whyResearchable: "可由文學研究、專書與期刊論文支撐。",
          suggestedSourceTypes: ["literature_paper", "book", "comparative_literature"],
          zhKeywords: ["唐吉訶德", "文本分析", "塞萬提斯", "理想與現實"],
          enKeywords: ["Don Quixote", "textual analysis", "Cervantes", "idealism and reality"],
          primaryQueries: ["唐吉訶德 文本分析 塞萬提斯", "Don Quixote textual analysis Cervantes"],
          secondaryQueries: ["Don Quixote Spanish Golden Age literary history"],
          excludedDriftTerms: DON_QUIXOTE_DRIFT_TERMS,
        },
      ],
      excludedDriftTerms: DON_QUIXOTE_DRIFT_TERMS,
      reasoningNotes: planReason(reason, "Don Quixote searches must stay in literature, Cervantes, chivalric-romance satire, and Spanish Golden Age context; cod/fish/nutrition drift is invalid."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isTelomeraseAgingTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "telomerase_aging_biology",
      primaryConcepts: TELOMERASE_AGING_PRIMARY,
      contextConcepts: TELOMERASE_AGING_CONTEXT,
      outcomeConcepts: ["cellular aging", "replicative senescence", "longevity", "age-related disease", "細胞老化", "長壽"],
      populationConcepts: [],
      lowWeightTerms: ["research", "study", "effect", "impact", "研究", "影響"],
      mustHaveTerms: ["telomerase", "telomere", "aging", "senescence", "端粒酶", "端粒", "老化"],
      shouldHaveTerms: unique([...TELOMERASE_AGING_CONTEXT, "cellular aging", "review"]),
      penaltyTerms: TELOMERASE_AGING_PENALTIES,
      negativeTerms: TELOMERASE_AGING_PENALTIES,
      chineseQueries: [
        "端粒酶 老化 端粒長度",
        "端粒 細胞衰老 端粒酶活性",
        "端粒酶 老化 長壽 癌症風險",
        "端粒酶 幹細胞 老化",
      ],
      englishQueries: [
        "telomerase aging telomere length",
        "telomerase activity cellular senescence aging",
        "telomere length aging longevity review",
        "telomerase stem cells aging cancer risk",
        "telomeres replicative senescence age-related disease",
      ],
      narrowedResearchQuestions: [
        {
          title: "端粒酶活性、端粒長度與細胞老化",
          researchAngle: "整理 telomerase activity 與 telomere length 如何影響 replicative senescence。",
          whyResearchable: "可使用細胞生物學、老化研究與綜述文獻。",
          suggestedSourceTypes: ["academic_paper", "review", "cell_biology_study"],
          zhKeywords: ["端粒酶", "端粒長度", "細胞老化", "端粒酶活性"],
          enKeywords: ["telomerase", "telomere length", "cellular senescence", "aging"],
          primaryQueries: ["telomerase aging telomere length", "telomerase activity cellular senescence aging"],
          secondaryQueries: ["端粒酶 老化 端粒長度", "telomere length aging longevity review"],
          excludedDriftTerms: TELOMERASE_AGING_PENALTIES,
        },
      ],
      excludedDriftTerms: TELOMERASE_AGING_PENALTIES,
      reasoningNotes: planReason(reason, "Telomerase-aging searches must keep telomerase/telomere terms tied to aging, senescence, longevity, stem cells, or age-related disease."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isSalmonellaFoodPoisoningTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "salmonella_food_poisoning",
      primaryConcepts: SALMONELLA_FOOD_POISONING_PRIMARY,
      contextConcepts: SALMONELLA_FOOD_POISONING_CONTEXT,
      outcomeConcepts: ["outbreaks", "infection risk", "prevention", "antimicrobial resistance", "爆發", "感染風險", "預防"],
      populationConcepts: [],
      lowWeightTerms: ["food", "health", "study", "飲食", "健康", "研究"],
      mustHaveTerms: ["Salmonella", "salmonellosis", "food poisoning", "foodborne", "沙門氏菌", "食物中毒"],
      shouldHaveTerms: unique([...SALMONELLA_FOOD_POISONING_CONTEXT, "CDC", "WHO", "review"]),
      penaltyTerms: SALMONELLA_FOOD_POISONING_PENALTIES,
      negativeTerms: SALMONELLA_FOOD_POISONING_PENALTIES,
      chineseQueries: [
        "沙門氏菌 食物中毒 食品安全",
        "沙門氏菌 污染 家禽 雞蛋 爆發",
        "沙門氏菌 食源性疾病 預防",
        "沙門氏菌 抗藥性 食品安全",
      ],
      englishQueries: [
        "Salmonella food poisoning food safety",
        "Salmonella foodborne illness outbreak poultry eggs",
        "salmonellosis prevention food contamination",
        "Salmonella antimicrobial resistance food safety",
        "Salmonella outbreaks foodborne disease review",
      ],
      narrowedResearchQuestions: [
        {
          title: "沙門氏菌食物中毒的污染來源與預防",
          researchAngle: "整理 Salmonella 在家禽、雞蛋與肉品中的污染、爆發與預防措施。",
          whyResearchable: "可使用食品安全、流行病學、CDC/WHO 或學術文獻。",
          suggestedSourceTypes: ["food_safety_study", "epidemiology_report", "official_guideline"],
          zhKeywords: ["沙門氏菌", "食物中毒", "家禽", "雞蛋", "食品安全"],
          enKeywords: ["Salmonella", "food poisoning", "foodborne illness", "poultry", "eggs"],
          primaryQueries: ["Salmonella food poisoning food safety", "Salmonella foodborne illness outbreak poultry eggs"],
          secondaryQueries: ["沙門氏菌 食物中毒 食品安全", "salmonellosis prevention food contamination"],
          excludedDriftTerms: SALMONELLA_FOOD_POISONING_PENALTIES,
        },
      ],
      excludedDriftTerms: SALMONELLA_FOOD_POISONING_PENALTIES,
      reasoningNotes: planReason(reason, "Salmonella searches must keep Salmonella/salmonellosis tied to food poisoning, foodborne illness, contamination, outbreaks, prevention, or food safety."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isSocialMediaAddictionTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "social_media_addiction_psychology",
      primaryConcepts: SOCIAL_MEDIA_ADDICTION_PRIMARY,
      contextConcepts: SOCIAL_MEDIA_ADDICTION_CONTEXT,
      outcomeConcepts: ["mental health", "depression", "anxiety", "sleep quality", "attention", "心理健康", "睡眠品質"],
      populationConcepts: ["adolescents", "young adults", "students", "青少年", "學生"],
      lowWeightTerms: ["media", "internet", "students", "effect", "影響", "學生"],
      mustHaveTerms: ["social media", "problematic social media use", "addiction", "mental health", "社群媒體", "成癮", "心理健康"],
      shouldHaveTerms: unique([...SOCIAL_MEDIA_ADDICTION_CONTEXT, "systematic review", "adolescents"]),
      penaltyTerms: SOCIAL_MEDIA_ADDICTION_PENALTIES,
      negativeTerms: SOCIAL_MEDIA_ADDICTION_PENALTIES,
      chineseQueries: [
        "社群媒體成癮 青少年 心理健康",
        "問題性社群媒體使用 睡眠品質 憂鬱 焦慮",
        "社交媒體成癮 學生 注意力 學業表現",
        "手機成癮 社群媒體 青少年 心理健康",
      ],
      englishQueries: [
        "social media addiction adolescents mental health",
        "problematic social media use depression anxiety sleep quality",
        "social networking addiction students attention academic performance",
        "smartphone addiction social media adolescents systematic review",
        "problematic social media use young adults mental health review",
      ],
      narrowedResearchQuestions: [
        {
          title: "社群媒體成癮與青少年心理健康",
          researchAngle: "整理 problematic social media use 與憂鬱、焦慮、睡眠品質的關聯。",
          whyResearchable: "可使用心理學、公共衛生與系統性回顧文獻。",
          suggestedSourceTypes: ["psychology_study", "systematic_review", "public_health_study"],
          zhKeywords: ["社群媒體成癮", "青少年", "心理健康", "憂鬱", "焦慮"],
          enKeywords: ["social media addiction", "adolescents", "mental health", "depression", "anxiety"],
          primaryQueries: ["social media addiction adolescents mental health", "problematic social media use depression anxiety sleep quality"],
          secondaryQueries: ["社群媒體成癮 青少年 心理健康", "smartphone addiction social media adolescents systematic review"],
          excludedDriftTerms: SOCIAL_MEDIA_ADDICTION_PENALTIES,
        },
      ],
      excludedDriftTerms: SOCIAL_MEDIA_ADDICTION_PENALTIES,
      reasoningNotes: planReason(reason, "Social-media-addiction searches must keep social media/problematic-use/addiction terms tied to mental health, sleep, attention, adolescents, or students."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isMarineMicroplasticsEcologyTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
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
        "微塑膠",
        "微塑料",
        "奈米塑膠",
        "微塑膠 海洋生態 影響",
        "微塑膠 飲用水 人體健康",
        "塑膠微粒 海洋生物 攝食 毒性",
        "塑膠污染 海洋 食物網 生物累積",
        "微塑膠 海洋生態風險 文獻回顧",
      ],
      englishQueries: [
        "microplastics",
        "microplastic pollution",
        "microplastics human health",
        "microplastics drinking water",
        "micro- and nanoplastics",
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

  if (isClimateMarineEcologyImpactTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
      topicType: "climate_change_marine_ecology_impacts",
      primaryConcepts: [
        "climate change",
        "global warming",
        "ocean warming",
        "marine ecosystem",
        "marine ecology",
        "ocean acidification",
        "氣候變遷",
        "全球暖化",
        "海洋暖化",
        "海洋生態",
      ],
      contextConcepts: [
        "marine biodiversity",
        "coral reefs",
        "fish distribution",
        "food web",
        "marine organisms",
        "海洋生物多樣性",
        "珊瑚礁",
        "食物網",
      ],
      outcomeConcepts: [
        "biodiversity loss",
        "habitat shift",
        "species distribution",
        "ecosystem services",
        "生物多樣性",
        "棲地變化",
        "物種分布",
      ],
      populationConcepts: [],
      lowWeightTerms: ["impact", "effect", "research", "影響", "研究"],
      mustHaveTerms: [
        "climate change",
        "marine",
        "ocean",
        "ecosystem",
        "氣候變遷",
        "海洋",
        "海洋生態",
      ],
      shouldHaveTerms: [
        "ocean warming",
        "ocean acidification",
        "marine biodiversity",
        "coral reefs",
        "food web",
        "海洋暖化",
        "海洋酸化",
        "生物多樣性",
      ],
      penaltyTerms: ["urban heat island", "business strategy", "education enrollment", "都市熱島", "招生"],
      negativeTerms: ["urban heat island", "business strategy", "education enrollment"],
      chineseQueries: [
        "氣候變遷 海洋生態影響",
        "氣候變遷 海洋生物多樣性",
        "海洋暖化 海洋生態系",
        "海洋酸化 珊瑚礁 生態影響",
        "氣候變遷 海洋食物網 物種分布",
      ],
      englishQueries: [
        "climate change impacts on marine ecosystems",
        "ocean warming marine biodiversity",
        "climate change marine ecology",
        "ocean acidification coral reefs ecosystem impacts",
        "climate change marine food web species distribution",
        "global warming impacts marine organisms systematic review",
      ],
      narrowedResearchQuestions: [
        {
          title: "氣候變遷如何改變海洋生態系與生物多樣性",
          researchAngle: "整理 ocean warming、ocean acidification 對珊瑚礁、魚類分布與食物網的影響。",
          whyResearchable: "可使用海洋生態、IPCC、NOAA 與系統性回顧文獻。",
          suggestedSourceTypes: ["academic_paper", "systematic_review", "official_report"],
          zhKeywords: ["氣候變遷", "海洋生態", "海洋暖化", "海洋酸化", "生物多樣性"],
          enKeywords: ["climate change", "marine ecosystems", "ocean warming", "ocean acidification", "biodiversity"],
          primaryQueries: ["climate change impacts on marine ecosystems", "ocean warming marine biodiversity"],
          secondaryQueries: ["氣候變遷 海洋生態影響", "ocean acidification coral reefs ecosystem impacts"],
          excludedDriftTerms: ["urban heat island", "business strategy", "education enrollment"],
        },
      ],
      excludedDriftTerms: ["urban heat island", "business strategy", "education enrollment"],
      reasoningNotes: planReason(reason, "Climate-marine searches must combine climate-change/ocean-warming terms with marine ecosystem, biodiversity, acidification, coral, food-web, or species-distribution evidence."),
      plannerStatus,
      fallbackUsed: true,
    };
  }

  if (isClimateChangeCauseTopic(input)) {
    return {
      normalizedTopic,
      topicUnderstanding: understanding,
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
      topicUnderstanding: understanding,
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

  if (
    understanding.researchAngles.length > 0 ||
    understanding.topicKind === "known_entity" ||
    understanding.topicKind === "brand_or_product" ||
    understanding.topicKind === "cultural_artifact" ||
    understanding.topicKind === "broad_common_noun"
  ) {
    return buildUnderstandingSearchIntent(
      input,
      understanding,
      reason,
      plannerStatus,
    );
  }

  const genericTerms = topicTerms(normalizedTopic);
  const audience = cleanString(input.audience);
  return {
    normalizedTopic,
    topicUnderstanding: understanding,
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
      `${normalizedTopic} 現況 背景`,
      `${normalizedTopic} 影響 風險`,
      `${normalizedTopic} 應用 案例`,
    ]).slice(0, 4),
    englishQueries: unique([
      `${normalizedTopic} current status impact`,
      `${normalizedTopic} risk application case study`,
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

function sanitizePlannerPlanQueries(
  input: SearchIntentPlannerInput,
  plan: SearchIntentPlan,
): SearchIntentPlan {
  const topicUnderstanding = plan.topicUnderstanding ?? understandTopic(input.topic);
  const suppliedQuerySeedZh = cleanQueryList(input.querySeedZh ?? [], MAX_QUERY_COUNT);
  const suppliedQuerySeedEn = cleanQueryList(input.querySeedEn ?? [], MAX_QUERY_COUNT);
  const suppliedSubtopics = input.subtopics ?? [];
  const subtopicQueryZh = cleanQueryList(
    suppliedSubtopics.flatMap((subtopic) => subtopic.queryZh ?? []),
    MAX_QUERY_COUNT,
  );
  const subtopicQueryEn = cleanQueryList(
    suppliedSubtopics.flatMap((subtopic) => subtopic.queryEn ?? []),
    MAX_QUERY_COUNT,
  );
  const canonicalTopicZh =
    cleanString(input.canonicalTopicZh) ??
    cleanString(plan.canonicalTopicZh) ??
    input.topic.trim();
  if (topicUnderstanding.topicKind === "unknown_or_noise") {
    return {
      ...plan,
      topicUnderstanding,
      originalTopic: input.originalTopic?.trim() || input.topic.trim(),
      activeResearchTopic: input.topic.trim(),
      displayTitle: cleanString(input.displayTitle) ?? input.topic.trim(),
      canonicalTopicZh,
      canonicalEnglishTopic: "",
      chineseQueries: [],
      englishQueries: [],
      narrowedResearchQuestions: [],
      coreConcepts: [],
      suppliedQuerySeedZh: [],
      suppliedQuerySeedEn: [],
      subtopics: suppliedSubtopics,
    };
  }

  const activeResearchTopic = input.topic.trim();
  const canonicalEnglishTopic =
    cleanString(input.canonicalTopicEn) ??
    cleanString(plan.canonicalEnglishTopic) ??
    cleanString(topicUnderstanding.canonicalEnglishTopic) ??
    suppliedQuerySeedEn.find((query) => /[A-Za-z]/.test(query)) ??
    subtopicQueryEn.find((query) => /[A-Za-z]/.test(query)) ??
    (/[A-Za-z]/.test(activeResearchTopic) ? activeResearchTopic : "");
  const englishTopic =
    canonicalEnglishTopic || (/[A-Za-z]/.test(activeResearchTopic) ? activeResearchTopic : "");
  const mergedMustHaveTerms = cleanConceptList(
    [
      ...plan.mustHaveTerms,
      ...(input.mustIncludeTerms ?? []),
      ...suppliedQuerySeedZh,
      ...suppliedQuerySeedEn,
      ...subtopicQueryZh,
      ...subtopicQueryEn,
    ],
    18,
  );
  const mergedPenaltyTerms = unique([
    ...plan.penaltyTerms,
    ...plan.negativeTerms,
    ...(input.excludeTerms ?? []),
    ...suppliedSubtopics.flatMap((subtopic) => subtopic.excludeTerms ?? []),
  ]).slice(0, 18);

  return {
    ...plan,
    topicUnderstanding,
    originalTopic: input.originalTopic?.trim() || input.topic.trim(),
    activeResearchTopic,
    displayTitle: cleanString(input.displayTitle) ?? activeResearchTopic,
    canonicalTopicZh,
    canonicalEnglishTopic,
    coreConcepts: cleanConceptList(
      [
        ...(plan.coreConcepts?.length ? plan.coreConcepts : topicUnderstanding.coreConcepts),
        canonicalTopicZh,
        canonicalEnglishTopic,
        ...(input.mustIncludeTerms ?? []),
        ...suppliedQuerySeedZh,
        ...suppliedQuerySeedEn,
      ],
      12,
    ),
    primaryConcepts: cleanConceptList(
      [
        canonicalTopicZh,
        canonicalEnglishTopic,
        ...suppliedQuerySeedZh,
        ...suppliedQuerySeedEn,
        ...subtopicQueryZh,
        ...subtopicQueryEn,
        ...plan.primaryConcepts,
      ],
      14,
    ),
    contextConcepts: cleanConceptList(
      [
        ...plan.contextConcepts,
        ...(input.domainHints ?? []),
        ...suppliedSubtopics.map((subtopic) => subtopic.titleZh),
        ...suppliedSubtopics.map((subtopic) => subtopic.titleEn ?? ""),
      ],
      14,
    ),
    mustHaveTerms: mergedMustHaveTerms,
    shouldHaveTerms: cleanConceptList(
      [
        ...plan.shouldHaveTerms,
        ...suppliedQuerySeedZh,
        ...suppliedQuerySeedEn,
        ...subtopicQueryZh,
        ...subtopicQueryEn,
      ],
      18,
    ),
    penaltyTerms: mergedPenaltyTerms,
    negativeTerms: mergedPenaltyTerms,
    chineseQueries: sanitizeAndBackfillAngles({
      topic: canonicalTopicZh,
      values: [
        ...suppliedQuerySeedZh,
        ...subtopicQueryZh,
        ...plan.chineseQueries,
      ],
      topicKind: topicUnderstanding.topicKind,
      domain: topicUnderstanding.domain,
      coreConcepts: topicUnderstanding.coreConcepts,
      aliases: topicUnderstanding.aliases,
      canonicalEnglishTopic: topicUnderstanding.canonicalEnglishTopic,
      language: "zh",
    }).slice(0, MAX_QUERY_COUNT),
    englishQueries: sanitizeAndBackfillAngles({
      topic: englishTopic,
      values: [
        ...suppliedQuerySeedEn,
        ...subtopicQueryEn,
        ...plan.englishQueries,
      ],
      topicKind: topicUnderstanding.topicKind,
      domain: topicUnderstanding.domain,
      coreConcepts: topicUnderstanding.coreConcepts,
      aliases: topicUnderstanding.aliases,
      canonicalEnglishTopic: topicUnderstanding.canonicalEnglishTopic,
      language: "en",
    }).slice(0, MAX_QUERY_COUNT),
    reasoningNotes: unique(
      [
        ...plan.reasoningNotes,
        suppliedQuerySeedZh.length || suppliedQuerySeedEn.length
          ? "Frontend research query seeds were prioritized before deterministic query expansion."
          : "",
      ].filter(Boolean),
    ).slice(0, 10),
    suppliedQuerySeedZh,
    suppliedQuerySeedEn,
    subtopics: suppliedSubtopics,
  };
}

function sanitizeSearchIntentQuerySet(
  plan: SearchIntentPlan,
  querySet: SearchIntentQuerySet,
): SearchIntentQuerySet {
  const topicUnderstanding = plan.topicUnderstanding ?? understandTopic(plan.normalizedTopic);
  const englishTopic =
    plan.canonicalEnglishTopic ||
    topicUnderstanding.canonicalEnglishTopic ||
    (/[A-Za-z]/.test(plan.activeResearchTopic ?? plan.normalizedTopic)
      ? plan.activeResearchTopic ?? plan.normalizedTopic
      : "");
  const sanitizeZh = (values: string[]) =>
    sanitizeAndBackfillAngles({
      topic: plan.activeResearchTopic ?? plan.normalizedTopic,
      values,
      topicKind: topicUnderstanding.topicKind,
      domain: topicUnderstanding.domain,
      coreConcepts: topicUnderstanding.coreConcepts,
      aliases: topicUnderstanding.aliases,
      canonicalEnglishTopic: topicUnderstanding.canonicalEnglishTopic,
      language: "zh",
    });
  const sanitizeEn = (values: string[]) =>
    sanitizeAndBackfillAngles({
      topic: englishTopic,
      values,
      topicKind: topicUnderstanding.topicKind,
      domain: topicUnderstanding.domain,
      coreConcepts: topicUnderstanding.coreConcepts,
      aliases: topicUnderstanding.aliases,
      canonicalEnglishTopic: topicUnderstanding.canonicalEnglishTopic,
      language: "en",
    });

  const coreEnglishAcademic = cleanQueryList(sanitizeEn(querySet.coreEnglishAcademic), 6);
  const academicSynonyms = cleanQueryList(sanitizeEn(querySet.academicSynonyms), 6);
  const education = cleanQueryList(sanitizeEn(querySet.education), 4);
  const chineseSupplemental = cleanQueryList(sanitizeZh(querySet.chineseSupplemental), 6);
  const fallbackRelaxed = cleanQueryList(
    unique([
      ...sanitizeEn(querySet.fallbackRelaxed),
      ...sanitizeZh(querySet.fallbackRelaxed),
    ]),
    6,
  );

  return {
    ...querySet,
    chinese: cleanQueryList(sanitizeZh(querySet.chinese), MAX_QUERY_COUNT),
    english: cleanQueryList(sanitizeEn(querySet.english), MAX_QUERY_COUNT),
    highPrecision: cleanQueryList(
      unique([
        ...sanitizeEn(querySet.highPrecision),
        ...sanitizeZh(querySet.highPrecision),
      ]),
      MAX_QUERY_COUNT,
    ),
    broad: cleanQueryList(
      unique([
        ...sanitizeEn(querySet.broad),
        ...sanitizeZh(querySet.broad),
      ]),
      MAX_QUERY_COUNT,
    ),
    coreEnglishAcademic,
    academicSynonyms,
    education,
    chineseSupplemental,
    fallbackRelaxed,
    phases: ([
      { stage: "core_english_academic", queries: coreEnglishAcademic },
      { stage: "academic_synonym", queries: academicSynonyms },
      { stage: "education_explanation", queries: education },
      { stage: "chinese_supplemental", queries: chineseSupplemental },
      { stage: "fallback_relaxed", queries: fallbackRelaxed },
    ] satisfies SearchIntentQueryPhase[]).filter(
      (phase) => phase.queries.length > 0,
    ),
  };
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
    !isAiLearningEffectTopic(input) &&
    !isDumplingTopic(input) &&
    !isFrenchFriesTopic(input) &&
    !isColaHealthTopic(input) &&
    !isEggNutritionProteinTopic(input) &&
    !isChickenThighTopic(input) &&
    !isClamSafetyEcologyTopic(input) &&
    !isKoalaConservationTopic(input) &&
    !isTaiwanSemiconductorSupplyChainTopic(input) &&
    !isTelomeraseAgingTopic(input) &&
    !isSalmonellaFoodPoisoningTopic(input) &&
    !isSocialMediaAddictionTopic(input) &&
    !isMarineMicroplasticsEcologyTopic(input) &&
    !isClimateMarineEcologyImpactTopic(input) &&
    !isClimateChangeCauseTopic(input) &&
    !isSpiderEcologyTopic(input)
  )
    return plan;

  return {
    ...plan,
    primaryConcepts: unique([
      ...fallback.primaryConcepts,
      ...plan.primaryConcepts,
    ]).slice(0, 14),
    contextConcepts: unique([
      ...fallback.contextConcepts,
      ...plan.contextConcepts,
    ]).slice(0, 12),
    outcomeConcepts: unique([
      ...fallback.outcomeConcepts,
      ...plan.outcomeConcepts,
    ]).slice(0, 12),
    populationConcepts: unique([
      ...fallback.populationConcepts,
      ...plan.populationConcepts,
    ]).slice(0, 8),
    lowWeightTerms: unique([
      ...fallback.lowWeightTerms,
      ...plan.lowWeightTerms,
    ]).slice(0, 12),
    mustHaveTerms: unique([
      ...fallback.mustHaveTerms,
      ...plan.mustHaveTerms,
    ]).slice(0, 18),
    shouldHaveTerms: unique([
      ...fallback.shouldHaveTerms,
      ...plan.shouldHaveTerms,
    ]).slice(0, 18),
    penaltyTerms: unique([
      ...fallback.penaltyTerms,
      ...plan.penaltyTerms,
    ]).slice(0, 14),
    negativeTerms: unique([
      ...fallback.negativeTerms,
      ...plan.negativeTerms,
    ]).slice(0, 10),
    chineseQueries: unique([
      ...fallback.chineseQueries,
      ...plan.chineseQueries,
    ]).slice(0, MAX_QUERY_COUNT),
    englishQueries: unique([
      ...fallback.englishQueries,
      ...plan.englishQueries,
    ]).slice(0, MAX_QUERY_COUNT),
    topicType: fallback.topicType ?? plan.topicType,
    narrowedResearchQuestions:
      fallback.narrowedResearchQuestions?.length
        ? fallback.narrowedResearchQuestions
        : plan.narrowedResearchQuestions,
    excludedDriftTerms: unique([
      ...(fallback.excludedDriftTerms ?? []),
      ...(plan.excludedDriftTerms ?? []),
    ]),
    canonicalEnglishTopic:
      fallback.canonicalEnglishTopic || plan.canonicalEnglishTopic,
    coreConcepts: cleanConceptList([
      ...(fallback.coreConcepts ?? []),
      ...(plan.coreConcepts ?? []),
    ], 12),
  };
}

function mergeFallbackPlans(
  primary: SearchIntentPlan,
  supplemental: SearchIntentPlan,
): SearchIntentPlan {
  return {
    ...supplemental,
    ...primary,
    primaryConcepts: unique([
      ...primary.primaryConcepts,
      ...supplemental.primaryConcepts,
    ]).slice(0, 14),
    contextConcepts: unique([
      ...primary.contextConcepts,
      ...supplemental.contextConcepts,
    ]).slice(0, 12),
    outcomeConcepts: unique([
      ...primary.outcomeConcepts,
      ...supplemental.outcomeConcepts,
    ]).slice(0, 12),
    populationConcepts: unique([
      ...primary.populationConcepts,
      ...supplemental.populationConcepts,
    ]).slice(0, 8),
    lowWeightTerms: unique([
      ...primary.lowWeightTerms,
      ...supplemental.lowWeightTerms,
    ]).slice(0, 12),
    mustHaveTerms: unique([
      ...primary.mustHaveTerms,
      ...supplemental.mustHaveTerms,
    ]).slice(0, 18),
    shouldHaveTerms: unique([
      ...primary.shouldHaveTerms,
      ...supplemental.shouldHaveTerms,
    ]).slice(0, 18),
    penaltyTerms: unique([
      ...primary.penaltyTerms,
      ...supplemental.penaltyTerms,
    ]).slice(0, 14),
    negativeTerms: unique([
      ...primary.negativeTerms,
      ...supplemental.negativeTerms,
    ]).slice(0, 10),
    chineseQueries: unique([
      ...primary.chineseQueries,
      ...supplemental.chineseQueries,
    ]).slice(0, MAX_QUERY_COUNT),
    englishQueries: unique([
      ...primary.englishQueries,
      ...supplemental.englishQueries,
    ]).slice(0, MAX_QUERY_COUNT),
    narrowedResearchQuestions:
      primary.narrowedResearchQuestions?.length
        ? primary.narrowedResearchQuestions
        : supplemental.narrowedResearchQuestions,
    excludedDriftTerms: unique([
      ...(primary.excludedDriftTerms ?? []),
      ...(supplemental.excludedDriftTerms ?? []),
    ]),
    reasoningNotes: unique([
      ...primary.reasoningNotes,
      ...supplemental.reasoningNotes,
    ]).slice(0, 10),
    canonicalEnglishTopic:
      primary.canonicalEnglishTopic || supplemental.canonicalEnglishTopic,
    coreConcepts: cleanConceptList([
      ...(primary.coreConcepts ?? []),
      ...(supplemental.coreConcepts ?? []),
    ], 12),
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
    topicUnderstanding: fallback.topicUnderstanding ?? understandTopic(input.topic),
    topicType: cleanString(data.topicType ?? data.topic_type) ?? fallback.topicType,
    narrowedResearchQuestions: fallback.narrowedResearchQuestions,
    excludedDriftTerms: fallback.excludedDriftTerms,
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

  return sanitizePlannerPlanQueries(
    input,
    mergeFamilyCriticalTerms(input, merged),
  );
}

async function requestLlmSearchIntentPlan(
  input: SearchIntentPlannerInput,
  options?: SearchIntentPlannerOptions,
): Promise<SearchIntentPlan> {
  const topicUnderstanding = await understandTopicWithFallback({
    topic: input.topic,
    reportType: input.reportType,
    audience: input.audience,
    sourceMode: input.sourceMode,
    language: input.language,
  });
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
            "You will receive topicUnderstanding. Respect its topicKind, domain, canonicalTerms, aliases, englishTerms, excludedMeanings, and researchAngles.",
            "For short topics, derive queries from researchAngles only. Do not write research direction, research question, searchable topic, academic research, evidence, or source as query terms.",
            "Keys: normalizedTopic, primaryConcepts, contextConcepts, outcomeConcepts, populationConcepts, lowWeightTerms, mustHaveTerms, shouldHaveTerms, penaltyTerms, negativeTerms, chineseQueries, englishQueries, reasoningNotes.",
            "All keys except normalizedTopic are short string arrays.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic: ${input.topic}`,
            `topicUnderstanding: ${JSON.stringify(topicUnderstanding)}`,
            `reportType: ${input.reportType ?? "研究報告"}`,
            `audience: ${input.audience ?? "高中"}`,
            `language: ${input.language ?? "zh-TW"}`,
            "Return 4-6 Chinese queries and 4-6 English queries.",
            "Use suggested zhQueries/enQueries from researchAngles when they exist.",
          ].join("\n"),
        },
      ],
    });
    return {
      ...coerceSearchIntentPlan(extractJsonObject(content), input),
      originalTopic: input.originalTopic?.trim() || input.topic.trim(),
      activeResearchTopic: input.topic.trim(),
      canonicalEnglishTopic:
        topicUnderstanding.canonicalEnglishTopic || undefined,
      coreConcepts: topicUnderstanding.coreConcepts,
    };
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

function buildUnderstandingFallbackSearchIntent(
  input: SearchIntentPlannerInput,
  understanding: TopicUnderstanding,
  reason: string,
  plannerStatus: SearchIntentPlannerStatus,
): SearchIntentPlan {
  const normalizedTopic = understanding.normalizedTopic.trim() || input.topic.trim();
  const angleQueries = understanding.researchAngles.flatMap((angle) => angle.searchQueries);
  const questions = understanding.researchAngles.map((angle) =>
    researchQuestionFromFallbackAngle(angle, understanding.excludedDriftTerms),
  );
  const chineseQueries = unique(
    angleQueries.filter((query) => /[\u3400-\u9fff]/u.test(query)),
  ).slice(0, MAX_QUERY_COUNT);
  const englishQueries = stableCrossLanguageEnglishQueries({
    domain: understanding.domain,
    canonicalEnglishTopic: understanding.canonicalEnglishTopic,
    extraEnglishTerms: understanding.entities,
    existingQueries: angleQueries.filter((query) => /[A-Za-z]/.test(query)),
  }).slice(0, MAX_QUERY_COUNT);
  const primaryConcepts = unique([
    ...understanding.entities,
    ...understanding.likelyMeanings,
    ...understanding.researchAngles.map((angle) => angle.title),
  ]).slice(0, 12);
  const contextConcepts = unique(
    understanding.researchAngles.flatMap((angle) => [
      angle.title,
      angle.angle,
      angle.reason,
    ]),
  ).slice(0, 12);
  const canonicalEnglishTopic =
    englishQueries.find((query) => /^[A-Za-z][A-Za-z\s-]{2,}$/u.test(query)) ??
    understanding.entities.find((entity) => /[A-Za-z]/.test(entity)) ??
    "";

  return {
    normalizedTopic,
    primaryConcepts,
    contextConcepts,
    outcomeConcepts: unique(understanding.likelyMeanings).slice(0, 8),
    populationConcepts: [],
    lowWeightTerms: ["research", "study", "evidence", "source", "研究", "資料"],
    mustHaveTerms: unique(understanding.entities).slice(0, 12),
    shouldHaveTerms: unique([
      ...understanding.researchAngles.map((angle) => angle.title),
      ...understanding.likelyMeanings,
    ]).slice(0, 14),
    penaltyTerms: [],
    negativeTerms: [],
    chineseQueries,
    englishQueries,
    narrowedResearchQuestions: questions,
    reasoningNotes: planReason(
      reason,
      `Fallback queries were generated from topicUnderstanding researchAngles for topic "${input.topic}".`,
    ),
    plannerStatus,
    fallbackUsed: true,
    topicType: `${understanding.domain}_${understanding.subdomain}`,
    originalTopic: input.originalTopic?.trim() || input.topic.trim(),
    activeResearchTopic: input.topic.trim(),
    canonicalEnglishTopic,
    coreConcepts: unique([
      ...understanding.entities,
      ...understanding.coreConcepts,
      ...understanding.researchAngles.map((angle) => angle.title),
    ]).slice(0, 12),
  };
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
    return sanitizePlannerPlanQueries(
      normalizedInput,
      await requestLlmSearchIntentPlan(normalizedInput, options),
    );
  } catch (error) {
    try {
      const understanding = await understandTopicWithFallback({
        topic: normalizedInput.topic,
        reportType: normalizedInput.reportType,
        audience: normalizedInput.audience,
        sourceMode: normalizedInput.sourceMode,
        language: normalizedInput.language,
      });
      const ruleFallback = buildRuleBasedSearchIntent(
        normalizedInput,
        fallbackReason(error),
        statusFromError(error),
      );
      return sanitizePlannerPlanQueries(
        normalizedInput,
        mergeFamilyCriticalTerms(
          normalizedInput,
          mergeFallbackPlans(
            ruleFallback,
            buildUnderstandingFallbackSearchIntent(
              normalizedInput,
              understanding,
              fallbackReason(error),
              statusFromError(error),
            ),
          ),
        ),
      );
    } catch {
      return sanitizePlannerPlanQueries(
        normalizedInput,
        buildRuleBasedSearchIntent(
          normalizedInput,
          fallbackReason(error),
          statusFromError(error),
        ),
      );
    }
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
    coreConcepts: querySet.coreConcepts,
    primaryConcepts: plan.primaryConcepts,
    mustHaveTerms: plan.mustHaveTerms,
    penaltyTerms: plan.penaltyTerms,
    chineseQueries: querySet.chinese,
    englishQueries: querySet.english,
    highPrecision: querySet.highPrecision,
    broad: querySet.broad,
    coreEnglishAcademic: querySet.coreEnglishAcademic,
    academicSynonyms: querySet.academicSynonyms,
    education: querySet.education,
    chineseSupplemental: querySet.chineseSupplemental,
    fallbackRelaxed: querySet.fallbackRelaxed,
  });
}

function isSentenceLikeQuery(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    return (
      Array.from(normalized).length >= 24 &&
      !/\s/.test(normalized) &&
      /的|與|及|影響|研究|分析|比較/.test(normalized)
    );
  }
  const tokens = normalized.split(/\s+/);
  return (
    tokens.length >= 10 &&
    /^(the|a|an|this|that|these|those|what|which|how|why|when|where)$/i.test(tokens[0] ?? "")
  );
}

function isTooGenericRelaxedConcept(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    return Array.from(normalized).length <= 2;
  }

  const genericEnglishConcepts = new Set([
    "egg",
    "eggs",
    "protein",
    "value",
    "nutrition",
    "health",
    "education",
    "students",
    "research",
    "study",
    "data",
    "evidence",
  ]);

  return normalized.split(/\s+/).length <= 1 && genericEnglishConcepts.has(normalized);
}

function stripTopicLiteralQueries(
  queries: string[],
  plan: SearchIntentPlan,
  limit = MAX_QUERY_COUNT,
): string[] {
  const blocked = new Set(
    [
      plan.normalizedTopic,
      plan.originalTopic,
      plan.activeResearchTopic,
      plan.displayTitle,
      plan.canonicalTopicZh,
      plan.topicUnderstanding?.normalizedTopic,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );

  return cleanQueryList(
    queries.filter((query) => !blocked.has(query.trim().toLowerCase())),
    limit,
  );
}

function cleanQueryList(queries: string[], limit = MAX_QUERY_COUNT): string[] {
  return unique(
    queries
      .map((query) => query.trim())
      .filter((query) => query && !isSentenceLikeQuery(query)),
  ).slice(0, limit);
}

function cleanConceptList(concepts: string[], limit = 12): string[] {
  const lowSignalConcepts = new Set([
    "research",
    "study",
    "evidence",
    "overview",
    "education",
    "students",
    "data",
    "statistics",
    "文獻",
    "研究",
    "資料",
    "證據",
  ]);

  return unique(
    concepts
      .map((concept) => concept.trim())
      .filter((concept) => {
        if (!concept) return false;
        if (isSentenceLikeQuery(concept)) return false;
        return !lowSignalConcepts.has(concept.toLowerCase());
      }),
  ).slice(0, limit);
}

function fallbackRelaxedQueriesFromConcepts(concepts: string[]): string[] {
  const cleaned = cleanConceptList(concepts, 10).filter(
    (concept) => !isTooGenericRelaxedConcept(concept),
  );
  if (cleaned.length === 0) return [];
  const fallbackQueries: string[] = [];

  for (let index = 0; index < cleaned.length && fallbackQueries.length < 6; index += 1) {
    const current = cleaned[index]!;
    if (index === 0) {
      fallbackQueries.push(current);
      continue;
    }
    fallbackQueries.push(`${cleaned[0]} ${current}`.trim());
  }

  return cleanQueryList(fallbackQueries, 6);
}

function queryBucketsForPlan(plan: SearchIntentPlan): {
  coreConcepts: string[];
  coreEnglishAcademic: string[];
  academicSynonyms: string[];
  education: string[];
  chineseSupplemental: string[];
  fallbackRelaxed: string[];
} {
  const understanding = plan.topicUnderstanding;
  const planText = [
    plan.normalizedTopic,
    plan.topicType ?? "",
    ...plan.primaryConcepts,
    ...plan.coreConcepts ?? [],
    ...plan.chineseQueries,
    ...plan.englishQueries,
  ].join(" ");

  if (isRotationalMechanicsPlanText(planText)) {
    return {
      coreConcepts: ROTATIONAL_MECHANICS_CORE_CONCEPTS,
      coreEnglishAcademic: ROTATIONAL_MECHANICS_CORE_ENGLISH,
      academicSynonyms: ROTATIONAL_MECHANICS_ACADEMIC_SYNONYMS,
      education: ROTATIONAL_MECHANICS_EDUCATION,
      chineseSupplemental: ROTATIONAL_MECHANICS_CHINESE,
      fallbackRelaxed: ROTATIONAL_MECHANICS_RELAXED,
    };
  }
  const canonicalEnglishTopic =
    understanding?.canonicalEnglishTopic ??
    plan.canonicalEnglishTopic ??
    "";
  const seededEnglishQueries = cleanQueryList(
    [
      ...(plan.suppliedQuerySeedEn ?? []),
      ...(plan.subtopics?.flatMap((subtopic) => subtopic.queryEn ?? []) ?? []),
      ...plan.englishQueries,
    ],
    MAX_QUERY_COUNT,
  );
  const seededChineseQueries = cleanQueryList(
    [
      ...(plan.suppliedQuerySeedZh ?? []),
      ...(plan.subtopics?.flatMap((subtopic) => subtopic.queryZh ?? []) ?? []),
      ...plan.chineseQueries,
    ],
    MAX_QUERY_COUNT,
  );
  const baseCoreConcepts = cleanConceptList([
    ...plan.primaryConcepts,
    ...(plan.coreConcepts ?? []),
    plan.canonicalTopicZh ?? "",
    canonicalEnglishTopic,
    ...(understanding?.coreConcepts ?? []),
  ]);
  const cleanedEnglishQueries = stripTopicLiteralQueries(
    seededEnglishQueries,
    plan,
    MAX_QUERY_COUNT,
  );
  const cleanedChineseQueries = stripTopicLiteralQueries(
    seededChineseQueries,
    plan,
    MAX_QUERY_COUNT,
  );
  const secondaryConcept = baseCoreConcepts.find(
    (concept) => concept.toLowerCase() !== canonicalEnglishTopic.toLowerCase(),
  );

  const education = cleanQueryList(
    canonicalEnglishTopic
      ? [
          `${canonicalEnglishTopic} ${secondaryConcept ?? "concept"} explanation`.trim(),
          `${canonicalEnglishTopic} educational explanation`.trim(),
          `${canonicalEnglishTopic} classroom resource`.trim(),
        ]
      : [],
    4,
  );

  const academicSynonyms = cleanQueryList(
    cleanedEnglishQueries.slice(4).length
      ? cleanedEnglishQueries.slice(4)
      : canonicalEnglishTopic && secondaryConcept
        ? [
            `${canonicalEnglishTopic} ${secondaryConcept}`.trim(),
            `${secondaryConcept} review`.trim(),
          ]
        : [],
    6,
  );

  return {
    coreConcepts: baseCoreConcepts,
    coreEnglishAcademic: cleanedEnglishQueries.slice(0, 4),
    academicSynonyms,
    education,
    chineseSupplemental: cleanedChineseQueries.slice(0, 6),
    fallbackRelaxed: fallbackRelaxedQueriesFromConcepts([
      ...baseCoreConcepts,
      ...cleanedEnglishQueries,
    ]),
  };
}

function buildQueryPhases(
  buckets: ReturnType<typeof queryBucketsForPlan>,
): SearchIntentQueryPhase[] {
  const phases: SearchIntentQueryPhase[] = [
    {
      stage: "core_english_academic",
      queries: cleanQueryList(buckets.coreEnglishAcademic, 6),
    },
    {
      stage: "academic_synonym",
      queries: cleanQueryList(buckets.academicSynonyms, 6),
    },
    {
      stage: "education_explanation",
      queries: cleanQueryList(buckets.education, 4),
    },
    {
      stage: "chinese_supplemental",
      queries: cleanQueryList(buckets.chineseSupplemental, 6),
    },
    {
      stage: "fallback_relaxed",
      queries: cleanQueryList(buckets.fallbackRelaxed, 6),
    },
  ];
  return phases.filter((phase) => phase.queries.length > 0);
}

export function buildSearchIntentQueries(
  plan: SearchIntentPlan,
): SearchIntentQuerySet {
  const expandedQueries = domainQueryExpansion(plan);
  const deterministicVariants = deterministicAcademicQueryVariants(plan);
  const queryBuckets = queryBucketsForPlan(plan);
  const phases = buildQueryPhases(queryBuckets);
  const highPrecision = unique([
    ...queryBuckets.coreEnglishAcademic,
    ...deterministicVariants.english.slice(0, 2),
    ...expandedQueries.slice(0, 2),
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
    ...queryBuckets.academicSynonyms.slice(0, 2),
  ]).slice(0, MAX_QUERY_COUNT);

  const broad = unique([
    ...queryBuckets.fallbackRelaxed,
    ...queryBuckets.education.slice(0, 2),
    ...plan.shouldHaveTerms
      .slice(0, 2)
      .map((term) =>
        `${plan.primaryConcepts[0] ?? plan.normalizedTopic} ${term}`.trim(),
      ),
  ])
    .filter(Boolean)
    .slice(0, 6);

  return {
    coreConcepts: queryBuckets.coreConcepts,
    chinese: stripTopicLiteralQueries([
      ...deterministicVariants.chinese,
      ...queryBuckets.chineseSupplemental,
    ], plan, MAX_QUERY_COUNT),
    english: stripTopicLiteralQueries([
      ...queryBuckets.coreEnglishAcademic,
      ...queryBuckets.academicSynonyms,
      ...deterministicVariants.english,
      ...expandedQueries,
      ...queryBuckets.education,
      ...queryBuckets.fallbackRelaxed,
    ], plan, MAX_QUERY_COUNT),
    highPrecision: stripTopicLiteralQueries(highPrecision, plan, MAX_QUERY_COUNT),
    broad: stripTopicLiteralQueries(broad, plan, 6),
    coreEnglishAcademic: queryBuckets.coreEnglishAcademic,
    academicSynonyms: queryBuckets.academicSynonyms,
    education: queryBuckets.education,
    chineseSupplemental: queryBuckets.chineseSupplemental,
    fallbackRelaxed: queryBuckets.fallbackRelaxed,
    phases,
  };
}

function orderedQueries(
  querySet: SearchIntentQuerySet,
  queryLimit: number,
): string[] {
  return unique(
    [
      ...querySet.coreEnglishAcademic,
      ...querySet.academicSynonyms,
      ...querySet.education,
      ...querySet.chineseSupplemental,
      ...querySet.fallbackRelaxed,
      ...querySet.highPrecision,
      ...querySet.english,
      ...querySet.chinese,
      ...querySet.broad,
    ]
      .map((query) => query.trim())
    .filter(Boolean),
  ).slice(0, queryLimit);
}

function queryExecutionPhases(
  querySet: SearchIntentQuerySet,
  queryLimit: number,
): SearchIntentQueryPhase[] {
  const phaseBudgets: Array<{
    stage: SearchIntentQueryPhase["stage"];
    max: number;
  }> = [
    { stage: "core_english_academic", max: 3 },
    { stage: "academic_synonym", max: 2 },
    { stage: "education_explanation", max: 1 },
    { stage: "chinese_supplemental", max: 1 },
    { stage: "fallback_relaxed", max: 1 },
  ];
  const phaseMap = new Map(
    querySet.phases.map((phase) => [phase.stage, phase.queries] as const),
  );
  let remaining = Math.max(0, queryLimit);

  return phaseBudgets
    .map(({ stage, max }) => {
      if (remaining <= 0) return null;
      const queries = (phaseMap.get(stage) ?? []).slice(0, Math.min(max, remaining));
      remaining -= queries.length;
      if (queries.length === 0) return null;
      return { stage, queries };
    })
    .filter((phase): phase is SearchIntentQueryPhase => Boolean(phase));
}

function isAcademicSource(source: SourceRecord): boolean {
  return (
    source.sourceType === "OpenAlex" ||
    source.sourceType === "Crossref" ||
    source.sourceType === "Semantic Scholar"
  );
}

function shouldAlwaysUseTrustedWebFallback(plan: SearchIntentPlan): boolean {
  return isBmwElectricVehiclePlanText(
    [
      plan.normalizedTopic,
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.outcomeConcepts,
      ...plan.mustHaveTerms,
      ...plan.shouldHaveTerms,
      ...plan.englishQueries,
      ...plan.chineseQueries,
    ].join(" "),
  );
}

function providerZeroWarning(group: SourceProviderSearchResult): string | null {
  if (!group.ok) {
    const reason = group.error_message ?? group.error_type ?? "failed";
    return `${group.provider} ${reason}`;
  }
  if (group.results.length === 0) return `${group.provider} returned 0 for "${group.query}"`;
  return null;
}

function noSourceWarnings(groups: SourceProviderSearchResult[]): string[] {
  const statusLines = groups
    .map(providerZeroWarning)
    .filter((line): line is string => Boolean(line));
  return statusLines.length
    ? statusLines.slice(0, 8)
    : ["所有來源 provider 都沒有回傳可用 metadata。"];
}

function publicSearchConfig(options?: SearchIntentSourceSearchOptions): {
  enabled: boolean;
  endpoint: string;
  timeoutMs: number;
  maxResultsPerQuery: number;
  maxQueriesPerProvider: number;
} {
  const envEnabled = process.env.SOURCE_WEB_FALLBACK_ENABLED?.trim().toLowerCase();
  return {
    enabled:
      options?.webFallback?.enabled ??
      !(envEnabled === "0" || envEnabled === "false" || envEnabled === "off"),
    endpoint:
      options?.webFallback?.endpoint ??
      process.env.SOURCE_WEB_SEARCH_URL?.trim() ??
      "https://html.duckduckgo.com/html/",
    timeoutMs:
      options?.webFallback?.timeoutMs ??
      (Number(process.env.SOURCE_WEB_SEARCH_TIMEOUT_MS) || 8000),
    maxResultsPerQuery:
      options?.webFallback?.maxResultsPerQuery ??
      (Number(process.env.SOURCE_WEB_SEARCH_RESULTS_PER_QUERY) || 5),
    maxQueriesPerProvider: positiveEnvNumber(
      "SOURCE_WEB_SEARCH_QUERIES_PER_PROVIDER",
      DEFAULT_WEB_FALLBACK_QUERY_LIMIT,
    ),
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    );
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function resolvePublicSearchUrl(rawUrl: string): string | null {
  const decoded = decodeHtmlEntities(rawUrl);
  try {
    const url = new URL(decoded, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    if (redirected) return decodeURIComponent(redirected);
    return url.toString();
  } catch {
    return decoded.startsWith("http") ? decoded : null;
  }
}

function sourceHostFromUrl(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

type PublicWebResult = {
  title: string;
  url: string;
  snippet: string | null;
};

function parsePublicSearchResults(html: string): PublicWebResult[] {
  const results: PublicWebResult[] = [];
  const anchorPattern =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const matches = Array.from(html.matchAll(anchorPattern));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const rawUrl = match?.[1];
    const rawTitle = match?.[2];
    if (!rawUrl || !rawTitle) continue;
    const url = resolvePublicSearchUrl(rawUrl);
    const title = stripHtml(rawTitle);
    if (!url || !title) continue;
    const nextIndex = matches[index + 1]?.index ?? html.length;
    const segment = html.slice(match.index ?? 0, nextIndex);
    const snippetMatch =
      segment.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i) ??
      segment.match(/class="[^"]*result__body[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const snippet = snippetMatch?.[1] ? stripHtml(snippetMatch[1]) : null;
    results.push({ title, url, snippet });
  }
  return results;
}

function sourcePublisherFromHost(host: string): string {
  const known: Record<string, string> = {
    "bmwgroup.com": "BMW Group",
    "bmw.com": "BMW",
    "tsmc.com": "TSMC",
    "itri.org.tw": "ITRI",
    "moea.gov.tw": "Ministry of Economic Affairs, Taiwan",
    "nist.gov": "NIST",
    "semi.org": "SEMI",
    "semiconductors.org": "Semiconductor Industry Association",
    "iucnredlist.org": "IUCN Red List",
    "dcceew.gov.au": "Australian Department of Climate Change, Energy, the Environment and Water",
    "environment.gov.au": "Australian Government Department of the Environment",
    "des.qld.gov.au": "Queensland Government",
    "iea.org": "IEA",
    "oecd.org": "OECD",
    "europa.eu": "European Union",
    "worldbank.org": "World Bank",
    "imf.org": "IMF",
    "nhtsa.gov": "NHTSA",
    "epa.gov": "EPA",
    "fda.gov": "FDA",
    "usda.gov": "USDA",
    "cdc.gov": "CDC",
    "foodsafety.gov": "FoodSafety.gov",
    "foodstandards.gov.au": "Food Standards Australia New Zealand",
    "food.gov.uk": "Food Standards Agency",
    "efsa.europa.eu": "European Food Safety Authority",
    "un.org": "United Nations",
    "who.int": "World Health Organization",
    "reuters.com": "Reuters",
    "apnews.com": "Associated Press",
    "bbc.com": "BBC",
    "bbc.co.uk": "BBC",
    "cnn.com": "CNN",
    "ft.com": "Financial Times",
    "theguardian.com": "The Guardian",
    "nytimes.com": "The New York Times",
    "cnbc.com": "CNBC",
    "bloomberg.com": "Bloomberg",
  };
  const match = Object.entries(known).find(([domain]) => host.endsWith(domain));
  return match?.[1] ?? host;
}

function sourceYearFromText(text: string): number | null {
  const matches = Array.from(text.matchAll(/\b(20[0-2]\d|19[7-9]\d)\b/g))
    .map((match) => Number(match[1]))
    .filter((year) => Number.isFinite(year));
  return matches.length ? Math.max(...matches) : null;
}

function officialSourceHost(host: string): boolean {
  return (
    host === "bmwgroup.com" ||
    host.endsWith(".bmwgroup.com") ||
    host === "bmw.com" ||
    host.endsWith(".bmw.com") ||
    host === "tsmc.com" ||
    host.endsWith(".tsmc.com") ||
    /\.gov$|\.gov\.[a-z]+$|gov\.tw$/.test(host)
  );
}

function institutionalSourceHost(host: string): boolean {
  return /iea\.org$|oecd\.org$|worldbank\.org$|imf\.org$|europa\.eu$|nhtsa\.gov$|epa\.gov$|energy\.gov$|fda\.gov$|usda\.gov$|cdc\.gov$|foodsafety\.gov$|foodstandards\.gov\.au$|food\.gov\.uk$|efsa\.europa\.eu$|un\.org$|unctad\.org$|wto\.org$|ilo\.org$|who\.int$|itri\.org\.tw$|semi\.org$|semiconductors\.org$|nist\.gov$|iucnredlist\.org$/.test(
    host,
  );
}

function authoritativeMediaHost(host: string): boolean {
  return /reuters\.com$|apnews\.com$|bbc\.(com|co\.uk)$|cnn\.com$|ft\.com$|theguardian\.com$|nytimes\.com$|cnbc\.com$|bloomberg\.com$/.test(
    host,
  );
}

function resultAllowedForProvider(
  provider: FallbackSourceProvider,
  result: PublicWebResult,
): boolean {
  const host = sourceHostFromUrl(result.url);
  if (!host) return false;
  if (provider === "Official Source") return officialSourceHost(host);
  if (provider === "Institutional Source") return institutionalSourceHost(host);
  return authoritativeMediaHost(host);
}

function sourceTypeQuality(provider: FallbackSourceProvider): number {
  if (provider === "Official Source") return 82;
  if (provider === "Institutional Source") return 78;
  return 64;
}

function normalizePublicWebSource(
  result: PublicWebResult,
  provider: FallbackSourceProvider,
  queryUsed: string,
): SourceRecord | null {
  const host = sourceHostFromUrl(result.url);
  if (!host || !result.title.trim()) return null;
  const publisher = sourcePublisherFromHost(host);
  const snippet = result.snippet?.trim() || `${result.title} (${publisher})`;
  return normalizeSourceRecord({
    title: result.title,
    authors: [],
    year: sourceYearFromText(`${result.title} ${snippet}`),
    abstract: snippet,
    snippet,
    abstractMissing: true,
    doi: null,
    url: result.url,
    sourceType: provider,
    reviewState: "pending",
    publisher,
    containerTitle: provider,
    accessedAt: null,
    provider: publisher,
    queryUsed,
    retrievedAt: new Date().toISOString(),
    sourceKind: "web",
    isPeerReviewed: false,
    sourceQualityScore: sourceTypeQuality(provider),
    scoreReasons: [
      provider === "Authoritative Media"
        ? "authoritative media metadata"
        : "official or institutional web metadata",
      "abstract missing; provider snippet used",
    ],
  });
}

function trustedSeedSourcesForPlan(plan: SearchIntentPlan): SourceRecord[] {
  const seedSources: SourceRecord[] = [];
  if (isKoalaPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:iucn-koala-red-list",
        title: "Phascolarctos cinereus: The IUCN Red List of Threatened Species",
        authors: ["IUCN"],
        year: null,
        abstract:
          "The IUCN Red List profile for the koala summarizes population status, habitat dependence, threats including habitat loss, disease, fire and road mortality, and conservation actions for Phascolarctos cinereus.",
        doi: null,
        url: "https://www.iucnredlist.org/species/16892/166496779",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "IUCN Red List",
        containerTitle: "IUCN Red List",
        accessedAt: null,
        provider: "IUCN",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted conservation seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:dcceew-koala-conservation",
        title: "National Recovery Plan for the Koala",
        authors: ["Australian Government"],
        year: 2022,
        abstract:
          "The Australian Government koala recovery plan describes habitat protection, threat management, disease, bushfire impacts, monitoring and conservation actions for koala populations and habitat.",
        doi: null,
        url: "https://www.dcceew.gov.au/environment/biodiversity/threatened/publications/recovery/koala-2022",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Australian Government",
        containerTitle: "Department of Climate Change, Energy, the Environment and Water",
        accessedAt: null,
        provider: "DCCEEW",
        sourceKind: "web",
        sourceQualityScore: 86,
        scoreReasons: ["trusted official seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:qld-koala-conservation-strategy",
        title: "South East Queensland Koala Conservation Strategy",
        authors: ["Queensland Government"],
        year: 2020,
        abstract:
          "Queensland's koala conservation strategy addresses habitat protection, habitat connectivity, population monitoring, disease, vehicle strike and policy actions for koala conservation.",
        doi: null,
        url: "https://environment.des.qld.gov.au/wildlife/animals/living-with/koalas/conservation/strategy",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Queensland Government",
        containerTitle: "Koala conservation strategy",
        accessedAt: null,
        provider: "Queensland Government",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted official seed source"],
      }),
    );
  }
  if (isTaiwanSemiconductorPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:tsmc-annual-reports",
        title: "TSMC Annual Reports",
        authors: ["Taiwan Semiconductor Manufacturing Company"],
        year: null,
        abstract:
          "TSMC annual reports describe the company's foundry business, advanced process roadmap, capacity planning, customer demand, capital expenditure, risk factors and supplier sustainability disclosures within Taiwan's semiconductor supply chain.",
        doi: null,
        url: "https://investor.tsmc.com/english/annual-reports",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Taiwan Semiconductor Manufacturing Company",
        containerTitle: "TSMC Investor Relations",
        accessedAt: null,
        provider: "TSMC",
        sourceKind: "web",
        sourceQualityScore: 88,
        scoreReasons: ["trusted official Taiwan semiconductor seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:tsmc-responsible-supply-chain-report",
        title: "TSMC Responsible Supply Chain Report",
        authors: ["Taiwan Semiconductor Manufacturing Company"],
        year: 2024,
        abstract:
          "TSMC's responsible supply chain report covers supplier governance, resilience, sustainability requirements, risk management and local supplier collaboration across semiconductor manufacturing inputs and services.",
        doi: null,
        url: "https://esg.tsmc.com/file/public/2024-TSMC-Responsible-Supply-Chain-Report-e.pdf",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Taiwan Semiconductor Manufacturing Company",
        containerTitle: "TSMC ESG",
        accessedAt: null,
        provider: "TSMC ESG",
        sourceKind: "web",
        sourceQualityScore: 88,
        scoreReasons: ["trusted official supply-chain seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:moea-taiwan-semiconductor-supply-chain",
        title:
          "MOEA: Taiwan's semiconductor industry and domestic supply chain strategy",
        authors: ["Ministry of Economic Affairs, R.O.C."],
        year: null,
        abstract:
          "MOEA materials discuss Taiwan's semiconductor industry advantages, domestic supply-chain strategy, equipment sector development and policy efforts to strengthen Taiwan's position in global semiconductor supply chains.",
        doi: null,
        url: "https://www.moea.gov.tw/Mns/english/content/Content.aspx?menu_id=42766",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Ministry of Economic Affairs, R.O.C.",
        containerTitle: "MOEA English",
        accessedAt: null,
        provider: "MOEA",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted official Taiwan policy seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:nist-tsmc-chips",
        title: "NIST CHIPS for America: TSMC Arizona",
        authors: ["National Institute of Standards and Technology"],
        year: 2024,
        abstract:
          "NIST CHIPS materials on TSMC Arizona connect Taiwan-origin advanced foundry technology with semiconductor manufacturing capacity, supply-chain resilience and advanced-node chip production.",
        doi: null,
        url: "https://www.nist.gov/chips/tsmc-arizona-phoenix",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "National Institute of Standards and Technology",
        containerTitle: "CHIPS for America",
        accessedAt: null,
        provider: "NIST",
        sourceKind: "web",
        sourceQualityScore: 82,
        scoreReasons: ["trusted official semiconductor supply-chain seed source"],
      }),
    );
  }
  if (isSalmonellaFoodPoisoningPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:cdc-salmonella",
        title: "CDC: Salmonella",
        authors: ["Centers for Disease Control and Prevention"],
        year: null,
        abstract:
          "CDC describes Salmonella infection, common food sources, outbreak investigation, symptoms, risk groups and prevention practices for salmonellosis and foodborne illness.",
        doi: null,
        url: "https://www.cdc.gov/salmonella/",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Centers for Disease Control and Prevention",
        containerTitle: "CDC Salmonella",
        accessedAt: null,
        provider: "CDC",
        sourceKind: "web",
        sourceQualityScore: 86,
        scoreReasons: ["trusted official Salmonella seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:who-salmonella-non-typhoidal",
        title: "WHO: Salmonella (non-typhoidal)",
        authors: ["World Health Organization"],
        year: null,
        abstract:
          "WHO summarizes non-typhoidal Salmonella as a foodborne disease, covering transmission through contaminated food, disease burden, prevention, control and food-safety measures.",
        doi: null,
        url: "https://www.who.int/news-room/fact-sheets/detail/salmonella-(non-typhoidal)",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "World Health Organization",
        containerTitle: "WHO Fact Sheet",
        accessedAt: null,
        provider: "WHO",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted institutional foodborne-disease seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:fsis-salmonella",
        title: "USDA FSIS: Salmonella",
        authors: ["USDA Food Safety and Inspection Service"],
        year: null,
        abstract:
          "USDA FSIS guidance explains Salmonella as a foodborne pathogen, including contamination risks in meat and poultry, safe handling, cooking and prevention measures.",
        doi: null,
        url: "https://www.fsis.usda.gov/food-safety/foodborne-illness-and-disease/pathogens/salmonella",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "USDA Food Safety and Inspection Service",
        containerTitle: "FSIS Food Safety",
        accessedAt: null,
        provider: "USDA FSIS",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted official food-safety seed source"],
      }),
    );
  }
  if (isColaHealthPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:cdc-sugar-sweetened-beverages",
        title: "Sugar-Sweetened Beverage Consumption",
        authors: ["Centers for Disease Control and Prevention"],
        year: null,
        abstract:
          "CDC summarizes evidence and surveillance context for sugar-sweetened beverage consumption, including added sugar intake, obesity, type 2 diabetes, heart disease, kidney disease, dental caries and public-health reduction strategies.",
        doi: null,
        url: "https://www.cdc.gov/nutrition/php/data-research/sugar-sweetened-beverages.html",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "Centers for Disease Control and Prevention",
        containerTitle: "CDC Nutrition",
        accessedAt: null,
        provider: "CDC",
        sourceKind: "web",
        sourceQualityScore: 86,
        scoreReasons: ["trusted official sugary-drink health seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:who-sugars-guideline",
        title: "Guideline: Sugars intake for adults and children",
        authors: ["World Health Organization"],
        year: 2015,
        abstract:
          "WHO guidelines synthesize evidence on free sugars and health outcomes such as body weight and dental caries, providing intake recommendations relevant to sugar-sweetened and carbonated beverages.",
        doi: null,
        url: "https://www.who.int/publications/i/item/9789241549028",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "World Health Organization",
        containerTitle: "WHO Guidelines",
        accessedAt: null,
        provider: "WHO",
        sourceKind: "web",
        sourceQualityScore: 86,
        scoreReasons: ["trusted institutional nutrition guideline seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:harvard-sugary-drinks-health",
        title: "Sugary Drinks",
        authors: ["Harvard T.H. Chan School of Public Health"],
        year: null,
        abstract:
          "Harvard Nutrition Source reviews health concerns around sugary drinks, including weight gain, diabetes, cardiovascular risk, dental health, serving size and population-level consumption patterns.",
        doi: null,
        url: "https://nutritionsource.hsph.harvard.edu/healthy-drinks/sugary-drinks/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "Harvard T.H. Chan School of Public Health",
        containerTitle: "The Nutrition Source",
        accessedAt: null,
        provider: "Harvard T.H. Chan School of Public Health",
        sourceKind: "web",
        sourceQualityScore: 82,
        scoreReasons: ["trusted academic public-health seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:aha-reducing-sugary-drinks",
        title: "Our commitment to reducing consumption of sugary drinks",
        authors: ["American Heart Association"],
        year: null,
        abstract:
          "The American Heart Association explains policy and health rationales for reducing sugary drink consumption, connecting sugar-sweetened beverages to cardiometabolic risk and prevention strategies.",
        doi: null,
        url: "https://www.heart.org/en/get-involved/advocate/policy-research/our-policy-positions/our-commitment-to-reducing-consumption-of-sugary-drinks",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "American Heart Association",
        containerTitle: "AHA Policy Research",
        accessedAt: null,
        provider: "AHA",
        sourceKind: "web",
        sourceQualityScore: 80,
        scoreReasons: ["trusted health-organization seed source"],
      }),
    );
  }
  if (isTelomeraseAgingPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:pmc-telomeres-senescence-aging",
        title: "Telomeres, cellular senescence and aging",
        authors: ["NCBI PubMed Central"],
        year: 2024,
        abstract:
          "This open-access review discusses telomere shortening, telomerase, cellular senescence and their roles in organismal aging, age-related disease mechanisms and therapeutic questions.",
        doi: null,
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11287966/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "NCBI PubMed Central",
        containerTitle: "PubMed Central",
        accessedAt: null,
        provider: "NCBI PMC",
        sourceKind: "web",
        sourceQualityScore: 86,
        scoreReasons: ["trusted open-access biomedical review seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:pmc-telomeres-cell-senescence",
        title: "Telomeres and Cell Senescence: Size Matters Not",
        authors: ["NCBI PubMed Central"],
        year: 2017,
        abstract:
          "This review examines how telomere structure and dysfunction can trigger cellular senescence, clarifying the relationship between telomere length, telomerase activity and aging biology.",
        doi: null,
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5514392/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "NCBI PubMed Central",
        containerTitle: "PubMed Central",
        accessedAt: null,
        provider: "NCBI PMC",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted open-access biomedical review seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:pmc-telomeres-lifestyle-cancer-aging",
        title: "Telomeres, lifestyle, cancer, and aging",
        authors: ["NCBI PubMed Central"],
        year: 2012,
        abstract:
          "The review connects telomere biology and telomerase to aging, cancer risk and modifiable lifestyle factors, useful for distinguishing evidence-based aging mechanisms from overgeneralized claims.",
        doi: null,
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3370421/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "NCBI PubMed Central",
        containerTitle: "PubMed Central",
        accessedAt: null,
        provider: "NCBI PMC",
        sourceKind: "web",
        sourceQualityScore: 82,
        scoreReasons: ["trusted open-access biomedical review seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:europepmc-telomerase-cancer-aging",
        title: "Telomerase at the intersection of cancer and aging",
        authors: ["Europe PMC"],
        year: 2013,
        abstract:
          "This biomedical review discusses telomerase regulation at the intersection of cancer and aging, including why telomerase activation has therapeutic promise but also oncogenic risk.",
        doi: null,
        url: "https://europepmc.org/article/pmc/3896987",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "Europe PMC",
        containerTitle: "Europe PMC",
        accessedAt: null,
        provider: "Europe PMC",
        sourceKind: "web",
        sourceQualityScore: 82,
        scoreReasons: ["trusted biomedical literature seed source"],
      }),
    );
  }
  if (isSocialMediaAddictionPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:pmc-social-media-youth-mental-health",
        title: "Effects of Social Media Use on Youth and Adolescent Mental Health",
        authors: ["NCBI PubMed Central"],
        year: 2025,
        abstract:
          "This open-access review examines associations between social media use and adolescent mental health outcomes, including problematic use, anxiety, depression, sleep and risk-protective factors.",
        doi: null,
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12108867/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "NCBI PubMed Central",
        containerTitle: "PubMed Central",
        accessedAt: null,
        provider: "NCBI PMC",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted open-access mental-health review seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:pmc-problematic-social-media-use",
        title: "Problematic Social Media Use in Adolescents and Young Adults",
        authors: ["NCBI PubMed Central"],
        year: 2022,
        abstract:
          "This review addresses problematic social media use in adolescents and young adults, comparing measurement approaches, addictive-use constructs, comorbid mental-health outcomes and intervention needs.",
        doi: null,
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9052033/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "NCBI PubMed Central",
        containerTitle: "PubMed Central",
        accessedAt: null,
        provider: "NCBI PMC",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted open-access mental-health review seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:jmir-problematic-social-media-use",
        title: "Problematic Social Media Use in Adolescents and Young Adults",
        authors: ["JMIR Mental Health"],
        year: 2022,
        abstract:
          "JMIR Mental Health publishes a peer-reviewed overview of problematic social media use, emphasizing assessment, prevalence patterns, psychological correlates and research gaps.",
        doi: null,
        url: "https://mental.jmir.org/2022/4/e33450/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "JMIR Publications",
        containerTitle: "JMIR Mental Health",
        accessedAt: null,
        provider: "JMIR",
        sourceKind: "web",
        sourceQualityScore: 86,
        scoreReasons: ["trusted peer-reviewed mental-health seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:hhs-social-media-youth-mental-health-advisory",
        title: "Social Media and Youth Mental Health: The U.S. Surgeon General's Advisory",
        authors: ["U.S. Surgeon General"],
        year: 2023,
        abstract:
          "The U.S. Surgeon General's advisory synthesizes evidence and uncertainty on social media and youth mental health, including problematic use, sleep, body image, cyberbullying and safety recommendations.",
        doi: null,
        url: "https://www.hhs.gov/sites/default/files/sg-youth-mental-health-social-media-advisory.pdf",
        sourceType: "Official Source",
        reviewState: "pending",
        publisher: "U.S. Department of Health and Human Services",
        containerTitle: "Surgeon General Advisory",
        accessedAt: null,
        provider: "HHS",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted official public-health seed source"],
      }),
    );
  }
  if (isClimateMarineEcologyPlan(plan)) {
    seedSources.push(
      normalizeSourceRecord({
        id: "trusted:ipcc-srocc",
        title: "Special Report on the Ocean and Cryosphere in a Changing Climate",
        authors: ["Intergovernmental Panel on Climate Change"],
        year: 2019,
        abstract:
          "IPCC SROCC assesses how climate change affects the ocean, marine ecosystems, coastal systems, biodiversity, fisheries, sea-level rise, ocean warming, deoxygenation and acidification.",
        doi: null,
        url: "https://www.ipcc.ch/srocc/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "Intergovernmental Panel on Climate Change",
        containerTitle: "IPCC Special Report",
        accessedAt: null,
        provider: "IPCC",
        sourceKind: "web",
        sourceQualityScore: 88,
        scoreReasons: ["trusted climate-science assessment seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:ipcc-ar6-wg2-oceans-coastal-ecosystems",
        title: "IPCC AR6 WGII Chapter 3: Ocean and Coastal Ecosystems and Their Services",
        authors: ["Intergovernmental Panel on Climate Change"],
        year: 2022,
        abstract:
          "IPCC AR6 WGII Chapter 3 evaluates observed and projected climate impacts on ocean and coastal ecosystems, biodiversity, food webs, fisheries, ecosystem services and adaptation options.",
        doi: null,
        url: "https://www.ipcc.ch/report/ar6/wg2/chapter/chapter-3/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "Intergovernmental Panel on Climate Change",
        containerTitle: "IPCC AR6 WGII",
        accessedAt: null,
        provider: "IPCC",
        sourceKind: "web",
        sourceQualityScore: 88,
        scoreReasons: ["trusted climate-science assessment seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:ipcc-srocc-changing-ocean",
        title: "SROCC Chapter 5: Changing Ocean, Marine Ecosystems, and Dependent Communities",
        authors: ["Intergovernmental Panel on Climate Change"],
        year: 2019,
        abstract:
          "IPCC SROCC Chapter 5 focuses on climate-driven ocean change, marine ecosystem responses, biodiversity shifts, dependent communities and risks under warming and acidification.",
        doi: null,
        url: "https://www.ipcc.ch/srocc/chapter/chapter-5/",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "Intergovernmental Panel on Climate Change",
        containerTitle: "IPCC SROCC",
        accessedAt: null,
        provider: "IPCC",
        sourceKind: "web",
        sourceQualityScore: 88,
        scoreReasons: ["trusted climate-science assessment seed source"],
      }),
      normalizeSourceRecord({
        id: "trusted:eea-climate-change-marine-life",
        title: "How climate change impacts marine life",
        authors: ["European Environment Agency"],
        year: 2024,
        abstract:
          "The European Environment Agency summarizes climate impacts on marine life, including ocean warming, acidification, oxygen loss, species distribution shifts and ecosystem vulnerability.",
        doi: null,
        url: "https://www.eea.europa.eu/en/analysis/publications/how-climate-change-impacts-marine-life",
        sourceType: "Institutional Source",
        reviewState: "pending",
        publisher: "European Environment Agency",
        containerTitle: "EEA Publications",
        accessedAt: null,
        provider: "EEA",
        sourceKind: "web",
        sourceQualityScore: 84,
        scoreReasons: ["trusted environmental assessment seed source"],
      }),
    );
  }
  if (!isMarineMicroplasticsPlan(plan)) return seedSources;
  seedSources.push(
    normalizeSourceRecord({
      id: "trusted:unep-marine-litter-plastic-pollution",
      title:
        "From Pollution to Solution: A global assessment of marine litter and plastic pollution",
      authors: ["United Nations Environment Programme"],
      year: 2021,
      abstract:
        "UNEP assesses marine litter and plastic pollution, including microplastics, their sources, pathways, ecological impacts on marine organisms and ecosystems, and policy responses for monitoring and reduction.",
      doi: null,
      url: "https://www.unep.org/resources/pollution-solution-global-assessment-marine-litter-and-plastic-pollution",
      sourceType: "Institutional Source",
      reviewState: "pending",
      publisher: "United Nations Environment Programme",
      containerTitle: "UNEP report",
      accessedAt: null,
      provider: "UNEP",
      sourceKind: "web",
      sourceQualityScore: 82,
      scoreReasons: ["trusted institutional seed source"],
    }),
    normalizeSourceRecord({
      id: "trusted:gesamp-microplastics-marine-environment",
      title:
        "Sources, fate and effects of microplastics in the marine environment: a global assessment",
      authors: ["GESAMP"],
      year: 2015,
      abstract:
        "GESAMP reviews sources, transport, fate and ecological effects of microplastics in the marine environment, including ingestion by marine organisms, food-web transfer and risk assessment needs.",
      doi: null,
      url: "https://www.gesamp.org/publications/reports-and-studies-no-90",
      sourceType: "Institutional Source",
      reviewState: "pending",
      publisher: "GESAMP",
      containerTitle: "Reports and Studies No. 90",
      accessedAt: null,
      provider: "GESAMP",
      sourceKind: "web",
      sourceQualityScore: 80,
      scoreReasons: ["trusted scientific advisory report"],
    }),
    normalizeSourceRecord({
      id: "trusted:noaa-microplastics",
      title: "Microplastics",
      authors: ["NOAA Marine Debris Program"],
      year: null,
      abstract:
        "NOAA Marine Debris Program explains microplastics as small plastic debris in marine and aquatic environments, describing sources, persistence, monitoring concerns and potential effects on wildlife.",
      doi: null,
      url: "https://marinedebris.noaa.gov/what-marine-debris/microplastics",
      sourceType: "Official Source",
      reviewState: "pending",
      publisher: "NOAA Marine Debris Program",
      containerTitle: "NOAA Marine Debris Program",
      accessedAt: null,
      provider: "NOAA",
      sourceKind: "web",
      sourceQualityScore: 84,
      scoreReasons: ["trusted official seed source"],
    }),
    normalizeSourceRecord({
      id: "trusted:noaa-ncei-marine-microplastics",
      title: "Marine Microplastics",
      authors: ["NOAA National Centers for Environmental Information"],
      year: null,
      abstract:
        "NOAA NCEI provides a global marine microplastics data product aggregating field observations into discoverable datasets for monitoring microplastic distribution in ocean and coastal environments.",
      doi: null,
      url: "https://www.ncei.noaa.gov/products/microplastics",
      sourceType: "Official Source",
      reviewState: "pending",
      publisher: "NOAA National Centers for Environmental Information",
      containerTitle: "NOAA NCEI Products",
      accessedAt: null,
      provider: "NOAA NCEI",
      sourceKind: "web",
      sourceQualityScore: 84,
      scoreReasons: ["trusted official marine-microplastics data seed source"],
    }),
    normalizeSourceRecord({
      id: "trusted:ec-microplastics",
      title: "Microplastics",
      authors: ["European Commission"],
      year: null,
      abstract:
        "The European Commission explains microplastic persistence, mobility and accumulation in the environment, including the sea, and summarizes policy responses to microplastic pollution.",
      doi: null,
      url: "https://environment.ec.europa.eu/topics/plastics/microplastics_en",
      sourceType: "Official Source",
      reviewState: "pending",
      publisher: "European Commission",
      containerTitle: "Environment",
      accessedAt: null,
      provider: "European Commission",
      sourceKind: "web",
      sourceQualityScore: 82,
      scoreReasons: ["trusted official policy seed source"],
    }),
    normalizeSourceRecord({
      id: "trusted:oecd-plastic-pollution-ocean",
      title: "Stemming plastic pollution to protect the ocean",
      authors: ["Organisation for Economic Co-operation and Development"],
      year: 2025,
      abstract:
        "OECD summarizes plastic leakage to aquatic environments and ocean pollution pathways, supporting policy framing for macroplastic and microplastic pollution reduction.",
      doi: null,
      url: "https://www.oecd.org/en/data/insights/data-explainers/2025/05/stemming-plastic-pollution-to-protect-the-ocean.html",
      sourceType: "Institutional Source",
      reviewState: "pending",
      publisher: "Organisation for Economic Co-operation and Development",
      containerTitle: "OECD Data Explainers",
      accessedAt: null,
      provider: "OECD",
      sourceKind: "web",
      sourceQualityScore: 80,
      scoreReasons: ["trusted institutional plastic-pollution seed source"],
    }),
  );
  return seedSources;
}

async function fetchPublicSearchHtml(
  query: string,
  config: ReturnType<typeof publicSearchConfig>,
  fetchImpl: SourceFetch = fetch,
): Promise<string> {
  const url = new URL(config.endpoint);
  url.searchParams.set("q", query);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ReportFactoryAI/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`public search returned HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function fallbackQueriesForProvider(
  provider: FallbackSourceProvider,
  baseQueries: string[],
  plan: SearchIntentPlan,
  maxQueries = DEFAULT_WEB_FALLBACK_QUERY_LIMIT,
): string[] {
  const seedQueries = unique([
    ...domainQueryExpansion(plan),
    ...baseQueries,
    ...plan.englishQueries,
  ]).slice(0, Math.max(2, maxQueries + 2));

  if (provider === "Official Source") {
    const official = seedQueries.map(
      (query) => `${query} official annual report sustainability report investor relations`,
    );
    if (isBmwElectricVehiclePlanText(seedQueries.join(" "))) {
      official.unshift(
        "BMW annual report electric vehicles supply chain site:bmwgroup.com",
        "BMW sustainability report electric vehicles supply chain site:bmwgroup.com",
        "BMW Neue Klasse supply chain strategy site:bmwgroup.com",
        "BMW electric vehicle strategy press release site:press.bmwgroup.com",
        "BMW battery supply chain sustainability site:bmwgroup.com",
        "BMW Group electric mobility supply chain report",
      );
    }
    if (isTaiwanSemiconductorPlan(plan)) {
      official.unshift(
        "Taiwan semiconductor supply chain report site:moea.gov.tw",
        "Taiwan semiconductor supply chain TSMC annual report site:tsmc.com",
        "TSMC supply chain sustainability report site:tsmc.com",
        "Taiwan semiconductor supply chain resilience site:nist.gov",
        "Taiwan semiconductor industry supply chain site:itri.org.tw",
      );
    }
    if (isClamPlan(plan)) {
      official.unshift(
        "clam shellfish safety biotoxins official site:fda.gov",
        "shellfish safety heavy metals clam site:fda.gov",
        "bivalve shellfish safety food standards site:foodstandards.gov.au",
        "clam aquaculture water quality government report",
      );
    }
    if (isKoalaPlan(plan)) {
      official.unshift(
        "koala conservation strategy site:dcceew.gov.au",
        "koala habitat conservation site:environment.gov.au",
        "koala habitat fragmentation conservation site:des.qld.gov.au",
        "koala chlamydia bushfire road mortality site:dcceew.gov.au",
        "Phascolarctos cinereus habitat conservation government report",
      );
    }
    if (isSalmonellaFoodPoisoningPlan(plan)) {
      official.unshift(
        "Salmonella food poisoning CDC food safety",
        "Salmonella foodborne illness outbreak CDC",
        "Salmonella food safety FDA",
        "Salmonella poultry food safety USDA FSIS",
        "salmonellosis foodborne disease WHO",
      );
    }
    if (
      !isSalmonellaFoodPoisoningPlan(plan) &&
      isFoodSafetyNutritionPlanText(seedQueries.join(" "))
    ) {
      official.unshift(
        "egg nutrition food safety storage USDA site:usda.gov",
        "eggs safe handling storage Salmonella FDA site:fda.gov",
        "egg safety refrigeration Salmonella CDC site:cdc.gov",
        "egg nutrition food safety official site:foodsafety.gov",
        "egg storage Salmonella food safety government",
        "eggs nutrition safe storage site:usda.gov",
        "shell eggs food safety site:fda.gov",
      );
    }
    return unique(official).slice(0, maxQueries);
  }

  if (provider === "Institutional Source") {
    const institutional = seedQueries.map(
      (query) => `${query} IEA OECD EU government report`,
    );
    if (isBmwElectricVehiclePlanText(seedQueries.join(" "))) {
      institutional.unshift(
        "electric vehicle battery supply chain critical minerals IEA report",
        "electric vehicle supply chains OECD report",
        "EU electric vehicle battery supply chain critical raw materials",
        "electric vehicle supply chain battery market IEA",
        "critical minerals electric vehicle batteries OECD",
        "electric vehicles battery supply chain European Union report",
      );
    }
    if (isTaiwanSemiconductorPlan(plan)) {
      institutional.unshift(
        "Taiwan semiconductor supply chain SEMI report",
        "Taiwan semiconductor industry supply chain SIA report",
        "TSMC supply chain advanced packaging CoWoS industry analysis",
        "semiconductor supply chain Taiwan geopolitics export controls think tank report",
        "Taiwan semiconductor supply chain resilience report",
      );
    }
    if (isClamPlan(plan)) {
      institutional.unshift(
        "clam shellfish safety biotoxins EFSA scientific opinion",
        "bivalve shellfish food safety WHO FAO report",
        "hard clam aquaculture water quality research institute",
        "shellfish heavy metals microbial food safety review",
      );
    }
    if (isKoalaPlan(plan)) {
      institutional.unshift(
        "koala IUCN Red List Phascolarctos cinereus",
        "Phascolarctos cinereus IUCN habitat population threats",
        "koala habitat conservation IUCN report",
        "koala population threats chlamydia bushfire conservation report",
        "Phascolarctos cinereus habitat loss conservation review",
        "koala habitat connectivity conservation policy report",
      );
    }
    if (isSalmonellaFoodPoisoningPlan(plan)) {
      institutional.unshift(
        "Salmonella foodborne disease systematic review",
        "Salmonella outbreak food safety surveillance report",
        "salmonellosis food contamination epidemiology review",
        "Salmonella antimicrobial resistance food safety review",
      );
    }
    if (
      !isSalmonellaFoodPoisoningPlan(plan) &&
      isFoodSafetyNutritionPlanText(seedQueries.join(" "))
    ) {
      institutional.unshift(
        "egg nutrition dietary guidelines USDA report",
        "egg food safety Salmonella EFSA scientific opinion",
        "eggs storage safe handling WHO food safety",
        "egg nutrition food safety public health report",
        "egg food safety risk assessment EFSA",
        "Salmonella eggs public health guidance WHO",
      );
    }
    return unique(institutional).slice(0, maxQueries);
  }

  const media = seedQueries.map(
    (query) => `${query} Reuters BBC Financial Times Guardian NYTimes CNBC`,
  );
  if (isBmwElectricVehiclePlanText(seedQueries.join(" "))) {
    media.unshift(
      "BMW electric vehicle supply chain strategy Reuters",
      "BMW EV battery supply chain Financial Times",
      "BMW Neue Klasse electric vehicle strategy Reuters",
      "BMW battery supply chain Reuters",
      "BMW electric vehicle product strategy CNBC",
      "BMW EV transition supply chain AP News",
    );
  }
  if (isTaiwanSemiconductorPlan(plan)) {
    media.unshift(
      "Taiwan semiconductor supply chain TSMC Reuters",
      "TSMC advanced packaging supply chain Reuters",
      "Taiwan semiconductor geopolitics supply chain Financial Times",
      "semiconductor export controls Taiwan supply chain Bloomberg",
    );
  }
  if (isClamPlan(plan)) {
    media.unshift(
      "clam shellfish safety biotoxins AP News",
      "shellfish heavy metals food safety Reuters",
      "hard clam aquaculture water quality news",
    );
  }
  if (isKoalaPlan(plan)) {
    media.unshift(
      "koala habitat conservation Reuters",
      "koala chlamydia bushfire road mortality AP News",
      "koala population habitat loss BBC",
    );
  }
  if (isSalmonellaFoodPoisoningPlan(plan)) {
    media.unshift(
      "Salmonella food poisoning outbreak Reuters",
      "Salmonella food safety Associated Press",
      "Salmonella outbreak foodborne illness BBC",
    );
  }
  if (
    !isSalmonellaFoodPoisoningPlan(plan) &&
    isFoodSafetyNutritionPlanText(seedQueries.join(" "))
  ) {
    media.unshift(
      "egg nutrition food safety Salmonella Reuters",
      "egg storage refrigeration Salmonella BBC",
      "egg prices nutrition food safety AP News",
      "egg safety Salmonella Associated Press",
      "egg nutrition cholesterol food safety Reuters",
    );
  }
  return unique(media).slice(0, maxQueries);
}

function fallbackDisabledResult(
  provider: FallbackSourceProvider,
  query: string,
): SourceProviderSearchResult {
  return {
    ok: false,
    provider,
    query,
    results: [],
    error_type: "api-failure",
    error_message: `${provider} public web fallback disabled`,
  };
}

async function searchFallbackProviderQuery(
  provider: FallbackSourceProvider,
  query: string,
  options: SearchIntentSourceSearchOptions | undefined,
): Promise<SourceProviderSearchResult> {
  const config = publicSearchConfig(options);
  if (!config.enabled) return fallbackDisabledResult(provider, query);

  try {
    const html = await fetchPublicSearchHtml(
      query,
      config,
      options?.webFallback?.fetchImpl ?? options?.sourceSearch?.fetchImpl ?? options?.fetchImpl,
    );
    const results = parsePublicSearchResults(html)
      .filter((result) => resultAllowedForProvider(provider, result))
      .slice(0, config.maxResultsPerQuery)
      .map((result) => normalizePublicWebSource(result, provider, query))
      .filter((source): source is SourceRecord => Boolean(source));
    return {
      ok: true,
      provider,
      query,
      results,
      error_type: null,
      error_message: null,
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      provider,
      query,
      results: [],
      error_type: timedOut ? "timeout" : "api-failure",
      error_message:
        error instanceof Error
          ? error.message
          : `${provider} public web fallback failed`,
    };
  }
}

async function searchFallbackProvider(
  provider: FallbackSourceProvider,
  baseQueries: string[],
  plan: SearchIntentPlan,
  options?: SearchIntentSourceSearchOptions,
  queryLimitOverride?: number,
): Promise<SourceProviderSearchResult[]> {
  const config = publicSearchConfig(options);
  const queries = fallbackQueriesForProvider(
    provider,
    baseQueries,
    plan,
    queryLimitOverride ?? config.maxQueriesPerProvider,
  );
  if (queries.length === 0) {
    return [
      {
        ok: true,
        provider,
        query: "",
        results: [],
        error_type: null,
        error_message: null,
      },
    ];
  }
  return Promise.all(
    queries.map((query) => searchFallbackProviderQuery(provider, query, options)),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContains(text: string, term: string): boolean {
  const cleanedTerm = normalizeText(term);
  if (!cleanedTerm) return false;
  let normalizedText = normalizeText(text);
  if (cleanedTerm === "天竺") {
    normalizedText = normalizedText.replace(/天竺鼠/g, "");
  }
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

function isAiSecondaryEducationPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
    ].join(" "),
  );
  return (
    /artificial intelligence|generative ai|ai tutoring|ai in education|intelligent tutoring|人工智慧|生成式 ai|ai 教學/.test(
      concepts,
    ) &&
    /high school|secondary education|secondary students|k-12|k12|adolescents|高中|高中生|中學生/.test(
      concepts,
    )
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

function isEggNutritionPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.outcomeConcepts,
      ...plan.mustHaveTerms,
    ].join(" "),
  );
  const hasEggSubject = /(?:\beggs?\b|chicken egg|hen egg|egg white|egg yolk|albumen|\byolk\b|雞蛋|蛋品|蛋白(?!質)|蛋黃|全蛋|卵白|卵黃)/i.test(
    concepts,
  );
  return (
    hasEggSubject &&
    /nutrition|protein quality|amino acid|biological value|營養|蛋白質品質|胺基酸|氨基酸|生物價/.test(
      concepts,
    )
  );
}

function isSalmonellaFoodPoisoningPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      plan.normalizedTopic,
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.outcomeConcepts,
      ...plan.mustHaveTerms,
      ...plan.englishQueries,
      ...plan.chineseQueries,
    ].join(" "),
  );
  return (
    /salmonella|salmonellosis|沙門氏菌/.test(concepts) &&
    /food poisoning|foodborne|food safety|contamination|outbreak|食物中毒|食源性|食品安全|污染|爆發/.test(
      concepts,
    )
  );
}

function isChickenThighPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
    ].join(" "),
  );
  return /chicken thigh|chicken leg|poultry|雞腿|雞腿肉|雞肉/.test(concepts);
}

function isClamPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
    ].join(" "),
  );
  return /clam|hard clam|bivalve|shellfish|meretrix|蛤蜊|文蛤|雙殼貝|貝類/.test(concepts);
}

function isKoalaPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
    ].join(" "),
  );
  return /koala|phascolarctos|無尾熊|樹袋熊|考拉/.test(concepts);
}

function isTaiwanSemiconductorPlan(plan: SearchIntentPlan): boolean {
  const concepts = normalizeText(
    [
      plan.topicType ?? "",
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
    ].join(" "),
  );
  return (
    /taiwan|tsmc|台灣|台積電/.test(concepts) &&
    /semiconductor|chip supply chain|foundry|半導體|晶圓|供應鏈|封測/.test(concepts)
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

function trustedSeedPlanText(plan: SearchIntentPlan): string {
  return normalizeText(
    [
      plan.topicType ?? "",
      plan.normalizedTopic,
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.mustHaveTerms,
      ...plan.outcomeConcepts,
      ...plan.englishQueries,
      ...plan.chineseQueries,
    ].join(" "),
  );
}

function isColaHealthPlan(plan: SearchIntentPlan): boolean {
  const concepts = trustedSeedPlanText(plan);
  return (
    /cola|soda|soft drink|sugar[- ]sweetened beverage|carbonated beverage|可樂|碳酸飲料|含糖飲料|汽水/.test(
      concepts,
    ) &&
    /health|sugar|caffeine|obesity|metabolic|dental|健康|糖|咖啡因|肥胖|代謝|蛀牙/.test(
      concepts,
    )
  );
}

function isTelomeraseAgingPlan(plan: SearchIntentPlan): boolean {
  const concepts = trustedSeedPlanText(plan);
  return (
    /telomerase|telomere|telomeres|端粒酶|端粒/.test(concepts) &&
    /aging|ageing|senescence|longevity|老化|衰老|長壽|細胞衰老/.test(
      concepts,
    )
  );
}

function isSocialMediaAddictionPlan(plan: SearchIntentPlan): boolean {
  const concepts = trustedSeedPlanText(plan);
  return (
    /social media|problematic social media|social networking|社群媒體|社交媒體/.test(
      concepts,
    ) &&
    /addiction|problematic use|mental health|depression|anxiety|sleep|成癮|問題性使用|心理健康|憂鬱|焦慮|睡眠/.test(
      concepts,
    )
  );
}

function isClimateMarineEcologyPlan(plan: SearchIntentPlan): boolean {
  const concepts = trustedSeedPlanText(plan);
  return (
    /climate change|ocean warming|ocean acidification|氣候變遷|全球暖化|海洋暖化/.test(
      concepts,
    ) &&
    /marine|ocean|coastal|ecosystem|biodiversity|coral|food web|海洋|海洋生態|海洋生物|生物多樣性|珊瑚|食物網/.test(
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

function isTrustedFallbackSource(source: SourceRecord): boolean {
  return (
    source.sourceType === "Official Source" ||
    source.sourceType === "Institutional Source" ||
    source.sourceType === "Authoritative Media"
  );
}

function matchedOnlyLowSignalTerms(terms: string[]): boolean {
  if (terms.length === 0) return false;
  return terms.every((term) => GENERIC_LOW_SIGNAL_TERMS.has(normalizeText(term)));
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

  if (isTrustedFallbackSource(source)) {
    score += source.sourceType === "Authoritative Media" ? 8 : 14;
  }

  if (matchedMustHaveTerms.length === 0) {
    score -= 12;
    penalties.push("missing_must_have_terms");
  }

  if (
    matchedOnlyLowSignalTerms([
      ...matchedPrimaryConcepts,
      ...matchedMustHaveTerms,
      ...matchedContextConcepts,
      ...matchedOutcomeConcepts,
    ])
  ) {
    score = Math.min(score, 32);
    penalties.push("generic_terms_only");
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
    score -= isTrustedFallbackSource(source) ? 6 : 16;
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

  if (isAiSecondaryEducationPlan(plan)) {
    const secondaryTerms = [
      "high school",
      "high school students",
      "secondary education",
      "secondary students",
      "secondary school",
      "k-12",
      "k12",
      "adolescent",
      "adolescents",
      "高中",
      "高中生",
      "中學生",
      "中等教育",
    ];
    const higherEducationTerms = [
      "higher education",
      "university",
      "university students",
      "college students",
      "undergraduate",
      "undergraduates",
      "tertiary education",
      "大學",
      "大學生",
      "高等教育",
    ];
    const secondaryHits = matchedTerms(combined, secondaryTerms);
    const higherEducationHits = matchedTerms(combined, higherEducationTerms);
    if (secondaryHits.length > 0) {
      score += 18 + secondaryHits.length * 4;
    }
    if (higherEducationHits.length > 0 && secondaryHits.length === 0) {
      score = Math.min(score - 72, 58);
      penalties.push(
        `higher_education_without_secondary_context:${higherEducationHits.join(",")}`,
      );
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

  if (isEggNutritionPlan(plan)) {
    const eggSubjectTerms = [
      "egg",
      "eggs",
      "chicken egg",
      "hen egg",
      "egg white",
      "egg yolk",
      "albumen",
      "yolk",
      "雞蛋",
      "蛋白",
      "蛋黃",
      "全蛋",
      "卵白",
      "卵黃",
    ];
    const nutritionAxisTerms = [
      "nutrition",
      "nutritional composition",
      "protein",
      "protein quality",
      "amino acid",
      "amino acids",
      "amino acid profile",
      "amino acid composition",
      "digestibility",
      "biological value",
      "營養",
      "營養成分",
      "營養價值",
      "蛋白質",
      "蛋白質品質",
      "胺基酸",
      "氨基酸",
      "消化率",
      "生物價",
    ];
    const driftHits = matchedTerms(combined, EGG_NUTRITION_DRIFT_TERMS);
    const subjectHits = matchedTerms(combined, eggSubjectTerms);
    const axisHits = matchedTerms(combined, nutritionAxisTerms);
    if (subjectHits.length === 0) {
      score -= 65;
      penalties.push("egg_plan_missing_egg_subject");
    }
    if (axisHits.length === 0) {
      score -= 50;
      penalties.push("egg_plan_missing_nutrition_or_protein_axis");
    }
    if (driftHits.length > 0 && (subjectHits.length === 0 || axisHits.length === 0)) {
      score -= 120;
      penalties.push(`egg_drift_terms:${driftHits.join(",")}`);
    }
  }

  if (isChickenThighPlan(plan)) {
    const chickenTerms = [
      "chicken thigh",
      "chicken leg",
      "poultry",
      "chicken meat",
      "雞腿",
      "雞腿肉",
      "雞腿排",
      "雞肉",
      "家禽",
    ];
    const nutritionSafetyTerms = [
      "nutrition",
      "protein",
      "fat",
      "fat content",
      "calories",
      "food safety",
      "Salmonella",
      "cooking",
      "營養",
      "蛋白質",
      "脂肪",
      "熱量",
      "食品安全",
      "沙門氏菌",
      "烹調",
    ];
    const eggTerms = [
      "egg",
      "eggs",
      "egg white",
      "egg yolk",
      "albumen",
      "yolk",
      "雞蛋",
      "蛋黃",
      "全蛋",
      "卵白",
      "卵黃",
    ];
    const chickenHits = matchedTerms(combined, chickenTerms);
    const axisHits = matchedTerms(combined, nutritionSafetyTerms);
    const eggHits = matchedTerms(combined, eggTerms);
    if (chickenHits.length === 0) {
      score -= 70;
      penalties.push("chicken_thigh_missing_chicken_subject");
    }
    if (axisHits.length === 0) {
      score -= 30;
      penalties.push("chicken_thigh_missing_nutrition_or_safety_axis");
    }
    if (eggHits.length > 0 && chickenHits.length === 0) {
      score -= 160;
      penalties.push(`chicken_thigh_egg_drift:${eggHits.join(",")}`);
    }
  }

  if (isClamPlan(plan)) {
    const clamTerms = [
      "clam",
      "hard clam",
      "bivalve",
      "shellfish",
      "Meretrix",
      "蛤蜊",
      "文蛤",
      "雙殼貝",
      "貝類",
    ];
    const clamContextTerms = [
      "habitat",
      "ecology",
      "water quality",
      "aquaculture",
      "food safety",
      "biotoxins",
      "heavy metals",
      "microbial",
      "棲地",
      "生態",
      "水質",
      "養殖",
      "食用安全",
      "食品安全",
      "貝毒",
      "重金屬",
      "微生物",
    ];
    const driftHits = matchedTerms(combined, CLAM_DRIFT_TERMS);
    const subjectHits = matchedTerms(combined, clamTerms);
    const contextHits = matchedTerms(combined, clamContextTerms);
    if (subjectHits.length === 0) {
      score -= 65;
      penalties.push("clam_missing_clam_subject");
    }
    if (contextHits.length === 0) {
      score -= 30;
      penalties.push("clam_missing_ecology_or_food_safety_context");
    }
    if (driftHits.length > 0 && subjectHits.length === 0) {
      score -= 120;
      penalties.push(`clam_drift_terms:${driftHits.join(",")}`);
    }
  }

  if (isKoalaPlan(plan)) {
    const koalaTerms = [
      "koala",
      "Phascolarctos",
      "無尾熊",
      "樹袋熊",
      "考拉",
    ];
    const conservationTerms = [
      "habitat",
      "eucalyptus",
      "conservation",
      "fragmentation",
      "population",
      "chlamydia",
      "bushfire",
      "road mortality",
      "棲地",
      "桉樹",
      "尤加利",
      "保育",
      "族群",
      "疾病",
      "野火",
      "道路",
    ];
    const driftHits = matchedTerms(combined, KOALA_DRIFT_TERMS);
    const subjectHits = matchedTerms(combined, koalaTerms);
    const contextHits = matchedTerms(combined, conservationTerms);
    if (subjectHits.length === 0) {
      score -= 70;
      penalties.push("koala_missing_koala_subject");
    }
    if (contextHits.length === 0) {
      score -= 32;
      penalties.push("koala_missing_conservation_context");
    }
    if (driftHits.length > 0 && subjectHits.length === 0) {
      score -= 130;
      penalties.push(`koala_drift_terms:${driftHits.join(",")}`);
    }
  }

  if (isTaiwanSemiconductorPlan(plan)) {
    const taiwanTerms = ["Taiwan", "Taiwanese", "TSMC", "台灣", "台積電"];
    const semiconductorTerms = [
      "semiconductor",
      "chip",
      "foundry",
      "wafer",
      "EUV",
      "CoWoS",
      "packaging",
      "testing",
      "半導體",
      "晶片",
      "晶圓",
      "晶圓代工",
      "封裝",
      "封測",
      "先進製程",
    ];
    const supplyChainTerms = [
      "supply chain",
      "value chain",
      "equipment",
      "materials",
      "resilience",
      "export controls",
      "geopolitics",
      "供應鏈",
      "產業鏈",
      "設備",
      "材料",
      "韌性",
      "出口管制",
      "地緣政治",
    ];
    const driftHits = matchedTerms(combined, TAIWAN_SEMICONDUCTOR_DRIFT_TERMS);
    const taiwanHits = matchedTerms(combined, taiwanTerms);
    const semiconductorHits = matchedTerms(combined, semiconductorTerms);
    const supplyChainHits = matchedTerms(combined, supplyChainTerms);
    if (taiwanHits.length === 0) {
      score -= 45;
      penalties.push("taiwan_semiconductor_missing_taiwan_context");
    }
    if (semiconductorHits.length === 0) {
      score -= 65;
      penalties.push("taiwan_semiconductor_missing_semiconductor_subject");
    }
    if (supplyChainHits.length === 0) {
      score -= 25;
      penalties.push("taiwan_semiconductor_missing_supply_chain_context");
    }
    if (driftHits.length > 0 && semiconductorHits.length === 0) {
      score -= 130;
      penalties.push(`taiwan_semiconductor_drift_terms:${driftHits.join(",")}`);
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

function relevanceLevelFromDebug(
  debug: SourceRelevanceDebug,
  source?: SourceRecord,
): NonNullable<SourceRecord["relevanceLevel"]> {
  const metadataOnly = hasPenalty(debug, "metadata_only");
  const noDirectEvidence = hasPenalty(debug, "no_direct_evidence_snippet");
  const trustedFallback = source ? isTrustedFallbackSource(source) : false;
  const hardOffTopic =
    hasPenalty(debug, "spider_drift_terms") ||
    hasPenalty(debug, "french_fries_drift_terms") ||
    hasPenalty(debug, "egg_drift_terms") ||
    hasPenalty(debug, "chicken_thigh_egg_drift") ||
    hasPenalty(debug, "clam_drift_terms") ||
    hasPenalty(debug, "koala_drift_terms") ||
    hasPenalty(debug, "taiwan_semiconductor_drift_terms") ||
    hasPenalty(debug, "negated_food_topic") ||
    hasPenalty(debug, "strategy_only_without_spider_ecology") ||
    hasPenalty(debug, "missing_spider_subject") ||
    hasPenalty(debug, "non_spider_taxon");

  if (hardOffTopic) return "off_topic";
  if (
    hasPenalty(debug, "missing_spider_habitat_or_ecology_concept") ||
    hasPenalty(debug, "egg_plan_missing_egg_subject") ||
    hasPenalty(debug, "egg_plan_missing_nutrition_or_protein_axis") ||
    hasPenalty(debug, "chicken_thigh_missing_chicken_subject") ||
    hasPenalty(debug, "clam_missing_clam_subject") ||
    hasPenalty(debug, "koala_missing_koala_subject") ||
    hasPenalty(debug, "missing_microplastic_subject") ||
    hasPenalty(debug, "missing_marine_context") ||
    hasPenalty(debug, "taiwan_semiconductor_missing_semiconductor_subject") ||
    hasPenalty(debug, "taiwan_semiconductor_missing_taiwan_context") ||
    hasPenalty(debug, "missing_must_have_terms")
  ) {
    if (
      trustedFallback &&
      debug.score >= 70 &&
      debug.matchedPrimaryConcepts.length > 0 &&
      (debug.matchedMustHaveTerms.length > 0 ||
        debug.matchedContextConcepts.length > 0)
    ) {
      return "secondary";
    }
    return debug.score >= 30 ? "low" : "off_topic";
  }
  if (metadataOnly) {
    if (trustedFallback && debug.score >= 24) return "secondary";
    return debug.score >= 25 ? "clue" : "low";
  }
  if (noDirectEvidence) return debug.score >= 50 ? "secondary" : "clue";
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
  if (source.sourceType === "Official Source") score += 35;
  if (source.sourceType === "Institutional Source") score += 30;
  if (source.sourceType === "Authoritative Media") score += 18;
  if (source.doi) score += 15;
  const text = `${source.publisher ?? ""} ${source.containerTitle ?? ""} ${source.url ?? ""}`.toLowerCase();
  if (/\.gov|gov\.tw|who\.int|un\.org|oecd\.org|worldbank\.org|ipcc|nasa|noaa|epa/.test(text)) {
    score += 15;
  }
  if (/bmwgroup\.com|annual report|sustainability report|investor relations/.test(text)) {
    score += 10;
  }
  if (/reuters|associated press|bbc|cnn|financial times|the guardian|new york times|cnbc|bloomberg/.test(text)) {
    score += 6;
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
  metadataCompletenessScore: number;
  summaryUsabilityScore: number;
  recencyScore: number;
}): number {
  return Math.round(
    scores.relevanceScore * 0.4 +
      scores.sourceQualityScore * 0.25 +
      scores.metadataCompletenessScore * 0.2 +
      scores.summaryUsabilityScore * 0.1 +
      scores.recencyScore * 0.05,
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

function sourceRecommendation(
  classification: NonNullable<SourceRecord["classification"]>,
  relevanceLevel: NonNullable<SourceRecord["relevanceLevel"]>,
  evidenceGrounding: SourceRecord["evidenceGrounding"],
): string {
  if (classification === "off_topic" || classification === "trusted_but_off_topic") {
    return "rejected";
  }
  if (evidenceGrounding === "metadata_only") return "metadata_only_review";
  if (classification === "primary" && relevanceLevel === "primary") {
    return "primary_candidate";
  }
  if (classification === "review" || relevanceLevel === "secondary" || relevanceLevel === "clue") {
    return "supporting_candidate";
  }
  return "review_before_accepting";
}

function sourceWithRelevanceMetadata(
  source: SourceRecord,
  plan: SearchIntentPlan,
  debug: SourceRelevanceDebug,
  workflow?: SourceWorkflowContext,
): SearchIntentRankedSource {
  const relevanceLevel = relevanceLevelFromDebug(debug, source);
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
  let sourceQualityScore = clampScore(
    source.sourceQualityScore ?? metadataCompletenessScore,
  );
  if (source.sourceType === "Official Source" || source.sourceType === "Institutional Source") {
    sourceQualityScore = clampScore(Math.max(sourceQualityScore, 70));
  }
  if (source.sourceType === "Authoritative Media") {
    sourceQualityScore = clampScore(Math.max(55, Math.min(sourceQualityScore, 75)));
  }
  const finalScore = sourceFinalScore({
    relevanceScore,
    sourceQualityScore,
    metadataCompletenessScore,
    summaryUsabilityScore,
    recencyScore,
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
    topicRelevance: relevanceScore,
    evidenceQuality: summaryUsabilityScore,
    metadataCompleteness: metadataCompletenessScore,
    abstractQuality: summaryUsabilityScore,
    sourceTrust: authorityScore,
    isMetadataOnly: evidenceGrounding === "metadata_only",
    isPrimaryEvidence:
      classification.classification === "primary" &&
      relevanceLevel === "primary" &&
      evidenceGrounding !== "metadata_only",
    scoreReasons: source.scoreReasons,
    classification: classification.classification,
    rejectReason: classification.rejectReason,
    rejectionReason: classification.rejectReason,
    recommendation: sourceRecommendation(
      classification.classification,
      relevanceLevel,
      evidenceGrounding,
    ),
    matchedTerms: matchedTermsForSource,
    driftTerms,
    reviewState: forcedRejected ? "rejected" : source.reviewState,
    shouldShowInMainList:
      classification.classification === "primary" ||
      (classification.classification === "review" &&
        relevanceLevel !== "low" &&
        relevanceLevel !== "off_topic" &&
        finalScore >= 70),
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
    topicKind: plan.topicUnderstanding?.topicKind,
    needsClarification: plan.topicUnderstanding?.needsClarification,
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
    warnings.push(
      "OpenAlex、Crossref、Semantic Scholar 與 fallback 來源本次未找到足夠資料，請嘗試加入產業、地區、時間或公司名稱。",
    );
    warnings.push(...noSourceWarnings(groups));
  } else if (!sources.some((source) => source.relevanceLevel === "primary")) {
    warnings.push("目前主要來源不足，已保留可審查的延伸、官方、機構或權威媒體候選。");
  } else if (sources.length < TARGET_SOURCE_COUNT) {
    warnings.push(
      `目前僅找到 ${sources.length} 筆通過品質與關聯度篩選的可審查來源；可補充 DOI、URL 或 BibTeX 手動來源。`,
    );
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

function providerPolicyForPlan(plan: SearchIntentPlan): AcademicSourceProvider[] {
  return ["OpenAlex", "Semantic Scholar", "Crossref"];
}

function isAcademicProviderName(value: string): value is AcademicSourceProvider {
  return value === "OpenAlex" || value === "Semantic Scholar" || value === "Crossref";
}

function providerRateLimited(group: SourceProviderSearchResult): boolean {
  if (group.ok) return false;
  const message = `${group.error_type ?? ""} ${group.error_message ?? ""}`;
  return /429|rate limit|too many requests/i.test(message);
}

async function searchAcademicProviderGroups(
  queries: string[],
  plan: SearchIntentPlan,
  options?: SearchIntentSourceSearchOptions,
  activeProviders?: Set<AcademicSourceProvider>,
): Promise<SourceProviderSearchResult[]> {
  const providerPolicy =
    options?.sourceSearch?.providers ?? providerPolicyForPlan(plan);
  const availableProviders =
    activeProviders ?? new Set<AcademicSourceProvider>(providerPolicy);
  const groups: SourceProviderSearchResult[] = [];

  for (const query of queries) {
    const providers = providerPolicy.filter((provider) =>
      availableProviders.has(provider),
    );
    if (!providers.length) break;

    const queryGroups = await searchSourceProviders(query, {
      ...(options?.sourceSearch ?? {}),
      fetchImpl: options?.sourceSearch?.fetchImpl ?? options?.fetchImpl,
      providers,
    });
    groups.push(...queryGroups);

    for (const group of queryGroups) {
      if (isAcademicProviderName(group.provider) && providerRateLimited(group)) {
        availableProviders.delete(group.provider);
      }
    }
  }

  return groups;
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

function isReviewableRankedSource(source: SourceRecord): boolean {
  if (
    source.reviewState === "rejected" ||
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow" ||
    source.relevanceLevel === "low" ||
    source.relevanceLevel === "off_topic"
  ) {
    return false;
  }
  return (
    source.classification === "primary" ||
    source.classification === "review" ||
    source.relevanceLevel === "primary" ||
    source.relevanceLevel === "secondary" ||
    source.relevanceLevel === "clue"
  );
}

function topReviewableSources(
  sources: SourceRecord[],
  targetCount = TARGET_SOURCE_COUNT,
): SourceRecord[] {
  const reviewable = sources.filter(isReviewableRankedSource);
  if (reviewable.length >= targetCount) return reviewable.slice(0, targetCount);

  const seen = new Set(reviewable.map((source) => source.id));
  const supplemental = sources.filter((source) => {
    if (seen.has(source.id)) return false;
    if (source.reviewState === "rejected") return false;
    if (source.relevanceLevel === "off_topic") return false;
    if (source.relevanceLevel === "low") return false;
    if (
      source.classification === "off_topic" ||
      source.classification === "trusted_but_off_topic"
    ) {
      return false;
    }
    return (source.finalScore ?? 0) >= 45 && (source.sourceQualityScore ?? 0) >= 55;
  });

  return [...reviewable, ...supplemental].slice(0, targetCount);
}

function lowConfidenceRecallCandidates(
  sources: SourceRecord[],
  targetCount = 10,
): SourceRecord[] {
  return sources
    .filter((source) => {
      if (source.reviewState === "rejected") return false;
      if (
        source.classification === "stale_topic" ||
        source.classification === "stale_workflow"
      ) {
        return false;
      }
      const hasRichMetadata =
        Boolean(source.doi) ||
        Boolean(source.abstract?.trim()) ||
        Boolean(source.containerTitle?.trim()) ||
        (source.metadataCompletenessScore ?? 0) >= 50 ||
        (source.sourceQualityScore ?? 0) >= 55;
      const hasTopicClue =
        (source.relevanceScore ?? 0) >= 10 ||
        (source.matchedTerms?.length ?? 0) > 0 ||
        (source.matchedCoreConcepts?.length ?? 0) > 0;
      const trustedProvider =
        source.sourceType === "OpenAlex" ||
        source.sourceType === "Crossref" ||
        source.sourceType === "Semantic Scholar" ||
        source.sourceType === "Official Source" ||
        source.sourceType === "Institutional Source";
      return hasRichMetadata && (hasTopicClue || trustedProvider);
    })
    .slice(0, targetCount)
    .map((source) =>
      normalizeSourceRecord({
        ...source,
        reviewState: "pending",
        classification: "review",
        relevanceLevel:
          source.relevanceLevel === "off_topic" ? "clue" : source.relevanceLevel ?? "clue",
        rejectReason: null,
        rejectionReason: null,
        shouldShowInMainList: false,
        shouldRecommendAccept: false,
        sourceRelevanceReasonZhTw:
          source.sourceRelevanceReasonZhTw ??
          "目前此來源與主題的直接命中較弱，但 metadata 與摘要完整度仍足以保留為低信心候選。",
      }),
    );
}

function sourceRejectedForDiagnostics(source: SourceRecord): boolean {
  return (
    source.reviewState === "rejected" ||
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.relevanceLevel === "off_topic" ||
    source.relevanceLevel === "low"
  );
}

function providerDiagnostic(
  group: SourceProviderSearchResult,
): SourceSearchProviderDiagnostic {
  return {
    provider: group.provider,
    query: group.query,
    ok: group.ok,
    result_count: group.results.length,
    error_type: group.error_type,
    error_message: group.error_message,
  };
}

function providerRawCountSummary(groups: SourceProviderSearchResult[]): Record<string, number> {
  return groups.reduce<Record<string, number>>((summary, group) => {
    summary[group.provider] = (summary[group.provider] ?? 0) + group.results.length;
    return summary;
  }, {});
}

function rejectionReasonSummary(sources: SourceRecord[]): Record<string, number> {
  return sources.reduce<Record<string, number>>((summary, source) => {
    const reason = source.rejectReason ?? source.rejectionReason;
    if (!reason) return summary;
    summary[reason] = (summary[reason] ?? 0) + 1;
    return summary;
  }, {});
}

function logSearchTelemetry(input: {
  originalTopic: string;
  activeResearchTopic: string;
  canonicalEnglishTopic: string;
  coreConcepts: string[];
  topic: string;
  workflowId: string;
  queryPlanHash: string;
  querySet: SearchIntentQuerySet;
  groups: SourceProviderSearchResult[];
  candidateCount: number;
  dedupedCount: number;
  reviewableCount: number;
  rejectedCount: number;
  filteredCount: number;
  displayedCount: number;
  rejectionReasons: Record<string, number>;
  warnings: string[];
}): void {
  logger.info(
    {
      event: "researchforge.search.telemetry",
      original_topic: input.originalTopic,
      active_research_topic: input.activeResearchTopic,
      canonical_english_topic: input.canonicalEnglishTopic,
      core_concepts: input.coreConcepts,
      topic: input.topic,
      workflowId: input.workflowId,
      queryPlanHash: input.queryPlanHash,
      query_plan: input.querySet,
      provider_raw_counts: providerRawCountSummary(input.groups),
      provider_queries: input.groups.map((group) => ({
        provider: group.provider,
        query: group.query,
        ok: group.ok,
        raw_results: group.results.length,
        error_type: group.error_type,
        error_message: group.error_message,
      })),
      before_dedup: input.candidateCount,
      after_dedup: input.dedupedCount,
      after_quality_filter: input.reviewableCount,
      filtered_results_count: input.filteredCount,
      rejected: input.rejectedCount,
      rejection_reasons: input.rejectionReasons,
      shown_to_user: input.displayedCount,
      warnings: input.warnings,
    },
    "ResearchForge source search telemetry",
  );
}

export async function searchIntentSources(
  input: SearchIntentPlannerInput,
  options?: SearchIntentSourceSearchOptions,
): Promise<SearchIntentSourceSearchResult> {
  const plannerLlm = {
    ...(options?.llm ?? {}),
    timeoutMs:
      options?.llm?.timeoutMs ??
      positiveEnvNumber(
        "SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS",
        DEFAULT_SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS,
      ),
  };
  const summaryLlm = {
    ...(options?.llm ?? {}),
    timeoutMs:
      options?.llm?.timeoutMs ??
      positiveEnvNumber(
        "SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS",
        DEFAULT_SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS,
      ),
  };
  let plan = await planSearchIntent(input, { ...options, llm: plannerLlm });
  const genericUnderstanding = await understandTopicWithFallback({
    topic: input.topic,
    reportType: input.reportType,
    audience: input.audience,
    sourceMode: input.sourceMode,
    language: input.language,
  });
  const topicUnderstanding = plan.topicUnderstanding ?? understandTopic(input.topic);
  plan = {
    ...plan,
    topicUnderstanding,
    originalTopic: input.originalTopic?.trim() || input.topic.trim(),
    activeResearchTopic: input.topic.trim(),
    displayTitle: cleanString(input.displayTitle) ?? plan.displayTitle ?? input.topic.trim(),
    canonicalTopicZh:
      cleanString(input.canonicalTopicZh) ?? plan.canonicalTopicZh ?? input.topic.trim(),
    canonicalEnglishTopic:
      cleanString(input.canonicalTopicEn) ||
      plan.canonicalEnglishTopic ||
      input.querySeedEn?.find((query) => /[A-Za-z]/.test(query)) ||
      genericUnderstanding.canonicalEnglishTopic ||
      topicUnderstanding.canonicalEnglishTopic,
    coreConcepts: plan.coreConcepts?.length
      ? plan.coreConcepts
      : genericUnderstanding.coreConcepts.length
        ? genericUnderstanding.coreConcepts
        : topicUnderstanding.coreConcepts,
  };
  if (genericUnderstanding.topicKind === "unknown_or_noise") {
    const topic = input.topic.trim();
    const warnings = ["查無結果：輸入內容不像有效研究主題，請改用具體關鍵詞。"];
    return {
      ok: true,
      topic,
      workflowId: "",
      topicHash: "",
      queryPlanHash: "",
      searchIntent: {
        primaryConcepts: [],
        contextConcepts: [],
        outcomeConcepts: [],
        populationConcepts: [],
        lowWeightTerms: [],
        mustHaveTerms: [],
        plannerStatus: "skipped",
        fallbackUsed: false,
        topicKind: "unknown_or_noise",
        needsClarification: true,
      },
      queries: {
        coreConcepts: [],
        chinese: [],
        english: [],
        highPrecision: [],
        broad: [],
        coreEnglishAcademic: [],
        academicSynonyms: [],
        education: [],
        chineseSupplemental: [],
        fallbackRelaxed: [],
        phases: [],
      },
      results: [],
      sources: [],
      provider_status: [],
      warnings,
      planner: {
        ...plan,
        normalizedTopic: topic,
        primaryConcepts: [],
        contextConcepts: [],
        outcomeConcepts: [],
        populationConcepts: [],
        lowWeightTerms: [],
        mustHaveTerms: [],
        shouldHaveTerms: [],
        penaltyTerms: [],
        negativeTerms: [],
        chineseQueries: [],
        englishQueries: [],
        reasoningNotes: warnings,
        plannerStatus: "skipped",
        fallbackUsed: false,
      },
      searchTrace: {
        workflowId: "",
        topic,
        originalTopic: plan.originalTopic ?? topic,
        activeResearchTopic: plan.activeResearchTopic ?? topic,
        canonicalEnglishTopic: plan.canonicalEnglishTopic ?? "",
        normalizedTopic: topic,
        topicHash: "",
        queryPlanHash: "",
        providerQueries: [],
        candidateCount: 0,
        dedupedCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        sourceDecisions: [],
      },
      diagnostics: {
        original_topic: plan.originalTopic ?? topic,
        active_research_topic: plan.activeResearchTopic ?? topic,
        canonical_english_topic: plan.canonicalEnglishTopic ?? "",
        core_concepts: plan.coreConcepts ?? [],
        english_queries: [],
        chinese_queries: [],
        fallback_relaxed_queries: [],
        provider_search_results_count: 0,
        filtered_results_count: 0,
        rejection_reasons: {},
        retrieved_count: 0,
        deduped_count: 0,
        rejected_count: 0,
        candidate_count: 0,
        displayed_count: 0,
        primary_candidate_count: 0,
        provider_status: [],
        warnings,
      },
      llm_status: "skipped",
      keyword_expansion: {
        normalized_topic: topic,
        domains: [],
        search_queries: [],
        english_queries: [],
        chinese_queries: [],
        core_concepts: [],
        core_english_queries: [],
        academic_synonym_queries: [],
        education_queries: [],
        fallback_relaxed_queries: [],
        preferred_source_types: [],
        avoid_source_types: [],
        reasoning_notes: warnings,
        fallback_used: false,
        llm_status: "skipped",
      },
      groups: [],
      status: "empty",
      queryCount: 0,
    };
  }
  const querySet = sanitizeSearchIntentQuerySet(
    plan,
    buildSearchIntentQueries(plan),
  );
  const workflowId = cleanString(input.workflowId) ?? randomUUID();
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
  const academicQueryBudget = Math.max(
    positiveEnvNumber(
      "SEARCH_INTENT_ACADEMIC_QUERY_LIMIT",
      DEFAULT_ACADEMIC_QUERY_LIMIT,
    ),
    querySet.phases.length > 0 ? 8 : DEFAULT_ACADEMIC_QUERY_LIMIT,
  );
  const academicQueryPhases = queryExecutionPhases(querySet, academicQueryBudget);
  const plannerLlmStatus = llmStatusFromPlannerStatus(plan);
  const groups: SourceProviderSearchResult[] = [];
  const seedSources = trustedSeedSourcesForPlan(plan);
  let dedupedSources = dedupeSourceRecords(
    [...groups.flatMap((group) => group.results), ...seedSources],
  );
  const useTrustedWebFallback = shouldAlwaysUseTrustedWebFallback(plan);
  const refreshRankedSources = (): SearchIntentRankedSource[] => {
    dedupedSources = dedupeSourceRecords(
      [...groups.flatMap((group) => group.results), ...seedSources],
    );
    return rerankSourcesBySearchIntent(
      dedupedSources,
      plan,
      workflowContext,
    ).sources;
  };
  let preliminaryRanked = rerankSourcesBySearchIntent(
    dedupedSources,
    plan,
    workflowContext,
  ).sources;
  let academicSourceCount = preliminaryRanked
    .filter(isAcademicSource)
    .filter(isReviewableRankedSource).length;
  let reviewableCount = preliminaryRanked.filter(isReviewableRankedSource).length;
  const activeAcademicProviders = new Set<AcademicSourceProvider>(
    options?.sourceSearch?.providers ?? providerPolicyForPlan(plan),
  );

  for (const phase of academicQueryPhases) {
    const phaseGroups = await searchAcademicProviderGroups(
      phase.queries,
      plan,
      options,
      activeAcademicProviders,
    );
    groups.push(...phaseGroups);
    preliminaryRanked = refreshRankedSources();
    academicSourceCount = preliminaryRanked
      .filter(isAcademicSource)
      .filter(isReviewableRankedSource).length;
    reviewableCount = preliminaryRanked.filter(isReviewableRankedSource).length;

    if (
      academicSourceCount >= MINIMUM_ACADEMIC_SOURCES &&
      reviewableCount >= TARGET_SOURCE_COUNT
    ) {
      break;
    }
  }

  if (
    useTrustedWebFallback ||
    academicSourceCount < MINIMUM_ACADEMIC_SOURCES ||
    reviewableCount < TARGET_SOURCE_COUNT
  ) {
    groups.push(
      ...(
        await Promise.all([
          searchFallbackProvider("Official Source", queries, plan, options),
          searchFallbackProvider("Institutional Source", queries, plan, options),
        ])
      ).flat(),
    );
    preliminaryRanked = refreshRankedSources();
    academicSourceCount = preliminaryRanked
      .filter(isAcademicSource)
      .filter(isReviewableRankedSource).length;
    reviewableCount = preliminaryRanked.filter(isReviewableRankedSource).length;
  }

  if (useTrustedWebFallback || reviewableCount < MINIMUM_TOTAL_SOURCES) {
    groups.push(
      ...(await searchFallbackProvider("Authoritative Media", queries, plan, options)),
    );
    preliminaryRanked = refreshRankedSources();
    reviewableCount = preliminaryRanked.filter(isReviewableRankedSource).length;
  }

  if (useTrustedWebFallback || reviewableCount < TARGET_SOURCE_COUNT) {
    const expandedFallbackQueryLimit = Math.max(
      DEFAULT_WEB_FALLBACK_QUERY_LIMIT * 2,
      publicSearchConfig(options).maxQueriesPerProvider,
    );
    groups.push(
      ...(
        await Promise.all([
          searchFallbackProvider(
            "Official Source",
            queries,
            plan,
            options,
            expandedFallbackQueryLimit,
          ),
          searchFallbackProvider(
            "Institutional Source",
            queries,
            plan,
            options,
            expandedFallbackQueryLimit,
          ),
          searchFallbackProvider(
            "Authoritative Media",
            queries,
            plan,
            options,
            expandedFallbackQueryLimit,
          ),
        ])
      ).flat(),
    );
    preliminaryRanked = refreshRankedSources();
  }

  const candidateCount =
    groups.reduce((sum, group) => sum + group.results.length, 0) +
    seedSources.length;
  const reranked = rerankSourcesBySearchIntent(dedupedSources, plan, workflowContext);
  const reviewableRankedCount = reranked.sources.filter(isReviewableRankedSource).length;
  const rejectedRankedCount = reranked.sources.filter(sourceRejectedForDiagnostics).length;
  const filteredResultsCount = Math.max(0, dedupedSources.length - reviewableRankedCount);
  const rejectionReasons = rejectionReasonSummary(reranked.sources);
  const rankedSources = topReviewableSources(reranked.sources, TARGET_SOURCE_COUNT);
  const lowConfidenceResults =
    rankedSources.length === 0 && dedupedSources.length > 0
      ? lowConfidenceRecallCandidates(reranked.sources, 10)
      : [];
  const sourcesForSummary =
    lowConfidenceResults.length > 0 ? lowConfidenceResults : rankedSources;
  const sources = await summarizeSourcesWithLlm(
    plan.normalizedTopic,
    sourcesForSummary,
    {
      llm: summaryLlm,
      fetchImpl: options?.fetchImpl,
    },
  );
  logger.info(
    {
      event: "researchforge.source_summaries",
      workflowId,
      topic: plan.normalizedTopic,
      summaries: sources.map((source) => ({
        id: source.id,
        title: source.title,
        summarySourceType: source.summarySourceType ?? null,
        summaryConfidence: source.summaryConfidence ?? null,
        summaryStatus: source.summaryStatus ?? source.llmSummaryStatus ?? null,
      })),
    },
    "ResearchForge source summary diagnostics",
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
  const rejectedCount = sources.filter(
    (source) =>
      source.reviewState === "rejected" ||
      source.classification === "off_topic" ||
      source.classification === "trusted_but_off_topic",
  ).length;
  const warnings = unique([
    ...resultWarnings(groups, sources, plan),
    ...(candidateCount < 80
      ? [
          `本次 provider 實際回傳 ${candidateCount} 筆候選，低於 80 筆；已避免用低相關來源湊數。`,
        ]
      : []),
    ...(reviewableRankedCount < TARGET_SOURCE_COUNT
      ? ["目前高相關來源不足，建議調整題目或關鍵詞。"]
      : []),
    ...(lowConfidenceResults.length > 0
      ? [
          "目前找到的來源信心較低，建議重新生成研究查詢或補充關鍵詞；系統已保留可再審查候選。",
        ]
      : []),
    ...(sources.length > 0 && primaryCount < 3
      ? [
          `主要來源不足，已找到 ${primaryCount} 筆主要來源與 ${secondaryCount} 筆延伸候選；可接受至少 3 筆主要／延伸來源生成初步報告。另有 ${lowCount} 筆低相關來源已折疊。`,
        ]
      : []),
  ]);
  const searchTrace: SearchTrace = {
    workflowId,
    topic: input.topic.trim(),
    originalTopic: plan.originalTopic ?? input.topic.trim(),
    activeResearchTopic: plan.activeResearchTopic ?? input.topic.trim(),
    canonicalEnglishTopic: plan.canonicalEnglishTopic ?? "",
    normalizedTopic: plan.normalizedTopic,
    topicHash,
    queryPlanHash,
    providerQueries: unique(groups.map((group) => group.query)),
    candidateCount,
    dedupedCount: dedupedSources.length,
    acceptedCount: sources.filter((source) => source.reviewState === "accepted").length,
    rejectedCount: Math.max(rejectedCount, rejectedRankedCount),
    sourceDecisions: reranked.sources
      .slice(0, MAX_CANDIDATE_RESULTS)
      .map(sourceDecisionTrace),
  };
  const diagnostics: SourceSearchPipelineDiagnostics = {
    original_topic: plan.originalTopic ?? input.topic.trim(),
    active_research_topic: plan.activeResearchTopic ?? input.topic.trim(),
    canonical_english_topic: plan.canonicalEnglishTopic ?? "",
    core_concepts: querySet.coreConcepts.length
      ? querySet.coreConcepts
      : (plan.coreConcepts ?? []),
    english_queries: unique([
      ...querySet.coreEnglishAcademic,
      ...querySet.academicSynonyms,
      ...querySet.education,
    ]),
    chinese_queries: querySet.chineseSupplemental,
    fallback_relaxed_queries: querySet.fallbackRelaxed,
    provider_search_results_count: groups.reduce(
      (sum, group) => sum + group.results.length,
      0,
    ),
    filtered_results_count: filteredResultsCount,
    rejection_reasons: rejectionReasons,
    retrieved_count: candidateCount,
    deduped_count: dedupedSources.length,
    rejected_count: Math.max(rejectedCount, rejectedRankedCount),
    candidate_count: reviewableRankedCount,
    displayed_count: sources.length,
    primary_candidate_count: primaryCount,
    provider_status: groups.map(providerDiagnostic),
    warnings,
  };
  logSearchTelemetry({
    originalTopic: plan.originalTopic ?? input.topic.trim(),
    activeResearchTopic: plan.activeResearchTopic ?? input.topic.trim(),
    canonicalEnglishTopic: plan.canonicalEnglishTopic ?? "",
    coreConcepts: diagnostics.core_concepts,
    topic: input.topic.trim(),
    workflowId,
    queryPlanHash,
    querySet,
    groups,
    candidateCount,
    dedupedCount: dedupedSources.length,
    reviewableCount: reviewableRankedCount,
    rejectedCount: Math.max(rejectedCount, rejectedRankedCount),
    filteredCount: filteredResultsCount,
    displayedCount: sources.length,
    rejectionReasons,
    warnings,
  });

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
    warnings,
    planner: plan,
    ...((options?.includeDebug ?? process.env.NODE_ENV === "development")
      ? { relevance_debug: reranked.relevanceDebug.slice(0, MAX_CANDIDATE_RESULTS) }
      : {}),
    searchTrace,
    diagnostics,
    llm_status: plannerLlmStatus,
    keyword_expansion: {
      normalized_topic: plan.normalizedTopic,
      domains: domainsFromPlan(plan),
      search_queries: queries,
      english_queries: unique([
        ...querySet.coreEnglishAcademic,
        ...querySet.academicSynonyms,
        ...querySet.education,
      ]),
      chinese_queries: querySet.chineseSupplemental,
      core_concepts: diagnostics.core_concepts,
      core_english_queries: querySet.coreEnglishAcademic,
      academic_synonym_queries: querySet.academicSynonyms,
      education_queries: querySet.education,
      fallback_relaxed_queries: querySet.fallbackRelaxed,
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
    status: sources.length > 0 ? "ok" : "empty",
    queryCount: queries.length,
    ...(lowConfidenceResults.length > 0 ? { low_confidence_results: true } : {}),
  };
}
