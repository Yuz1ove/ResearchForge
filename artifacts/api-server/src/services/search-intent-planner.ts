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
  "social media",
  "digital media",
  "sleep",
  "attention",
  "短影音",
  "睡眠",
  "注意力",
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

  const genericTerms = topicTerms(normalizedTopic);
  const audience = cleanString(input.audience);
  return {
    normalizedTopic,
    primaryConcepts: genericTerms.length ? genericTerms : [normalizedTopic],
    contextConcepts: [audience, cleanString(input.reportType)].filter((term): term is string => Boolean(term)),
    outcomeConcepts: [],
    populationConcepts: audience ? [audience] : [],
    lowWeightTerms: ["students", "education", "learning"],
    mustHaveTerms: genericTerms.length ? genericTerms : [normalizedTopic],
    shouldHaveTerms: audience ? [audience] : [],
    penaltyTerms: [],
    negativeTerms: [],
    chineseQueries: unique([normalizedTopic, `${normalizedTopic} 文獻回顧`, `${normalizedTopic} 實證研究`]).slice(0, 4),
    englishQueries: unique([`${normalizedTopic} peer reviewed research`, `${normalizedTopic} systematic review`]).slice(0, 3),
    reasoningNotes: planReason(reason),
    plannerStatus,
    fallbackUsed: true,
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
  if (!isUrbanHeatIslandTopic(input) && !isShortVideoSleepAttentionTopic(input)) return plan;

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
    return await requestLlmSearchIntentPlan(normalizedInput, options);
  } catch (error) {
    return buildRuleBasedSearchIntent(
      normalizedInput,
      fallbackReason(error),
      statusFromError(error),
    );
  }
}

export function buildSearchIntentQueries(plan: SearchIntentPlan): SearchIntentQuerySet {
  const highPrecision = unique([
    ...plan.englishQueries.filter((query) => {
      const normalized = normalizeText(query);
      return plan.mustHaveTerms.some((term) => normalized.includes(normalizeText(term)))
        && plan.primaryConcepts.some((term) => normalized.includes(normalizeText(term)));
    }),
    ...plan.englishQueries.slice(0, 4),
  ]).slice(0, MAX_QUERY_COUNT);

  const broad = unique([
    ...plan.shouldHaveTerms.slice(0, 4).map((term) => `${plan.primaryConcepts[0] ?? plan.normalizedTopic} ${term}`.trim()),
    `${plan.normalizedTopic} peer reviewed research`,
  ]).filter(Boolean).slice(0, 4);

  return {
    chinese: plan.chineseQueries.slice(0, MAX_QUERY_COUNT),
    english: plan.englishQueries.slice(0, MAX_QUERY_COUNT),
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

export async function searchIntentSources(
  input: SearchIntentPlannerInput,
  options?: SearchIntentSourceSearchOptions,
): Promise<SearchIntentSourceSearchResult> {
  const plan = await planSearchIntent(input, options);
  const querySet = buildSearchIntentQueries(plan);
  const queryLimit = options?.queryLimit
    ?? (Number(process.env.SEARCH_INTENT_QUERY_LIMIT) || DEFAULT_SEARCH_INTENT_QUERY_LIMIT);
  const queries = orderedQueries(querySet, queryLimit);
  const groups = (await Promise.all(
    queries.map((query) => searchSourceProviders(query, options?.sourceSearch ?? { fetchImpl: options?.fetchImpl })),
  )).flat();
  const dedupedSources = dedupeSourceRecords(groups.flatMap((group) => group.results));
  const reranked = rerankSourcesBySearchIntent(dedupedSources, plan);
  const sources = reranked.sources.slice(0, 24);
  const plannerLlmStatus = llmStatusFromPlannerStatus(plan.plannerStatus, plan.fallbackUsed);

  return {
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
  };
}
