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

export interface KeywordExpansionRequest {
  topic: string;
  reportType?: string;
  audience?: string;
  sourceMode?: string;
  language?: string;
}

export type KeywordLlmStatus = "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";

export interface KeywordExpansionResult {
  normalized_topic: string;
  domains: string[];
  search_queries: string[];
  english_queries: string[];
  chinese_queries: string[];
  preferred_source_types: string[];
  avoid_source_types: string[];
  reasoning_notes: string[];
  fallback_used: boolean;
  llm_status: KeywordLlmStatus;
}

export interface KeywordSourceSearchResult {
  ok: boolean;
  llm_status: KeywordLlmStatus;
  keyword_expansion: KeywordExpansionResult;
  groups: SourceProviderSearchResult[];
  sources: SourceRecord[];
}

export interface KeywordLlmConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface KeywordExpansionOptions {
  fetchImpl?: SourceFetch;
  llm?: Partial<KeywordLlmConfig>;
}

export interface KeywordSourceSearchOptions extends KeywordExpansionOptions {
  queryLimit?: number;
  sourceSearch?: SourceSearchOptions;
}

type KeywordExpansionErrorCode =
  | "provider-unconfigured"
  | "provider-quota"
  | "provider-timeout"
  | "provider-failure"
  | "invalid-json";

class KeywordExpansionError extends Error {
  constructor(
    readonly code: KeywordExpansionErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "KeywordExpansionError";
  }
}

const DEFAULT_KEYWORD_LLM_TIMEOUT_MS = 10000;
const DEFAULT_KEYWORD_QUERY_LIMIT = 4;

const CONTROLLED_DOMAINS = [
  "general_academic_research",
  "education",
  "psychology",
  "digital_media",
  "sleep_health",
  "student_wellbeing",
  "public_health",
  "artificial_intelligence",
  "information_systems",
  "software_engineering",
  "healthcare",
  "environmental_science",
  "agriculture",
  "economics",
  "business",
  "sociology",
  "public_policy",
  "community_development",
  "urban_studies",
  "transportation",
] as const;

const controlledDomainSet = new Set<string>(CONTROLLED_DOMAINS);

const DOMAIN_CUES: Record<string, RegExp[]> = {
  general_academic_research: [/./],
  education: [/教育|學生|高中|國中|大學|學校|課程|學習|teacher|student|school|education/i],
  psychology: [/心理|注意力|認知|情緒|壓力|行為|專注|焦慮|attention|cognition|psychology|behavior|behaviour/i],
  digital_media: [/短影音|社群媒體|社交媒體|影音|手機|螢幕|tiktok|reels|youtube shorts|short[- ]?form|social media|digital media/i],
  sleep_health: [/睡眠|失眠|睡眠品質|作息|sleep|insomnia|circadian/i],
  student_wellbeing: [/學生|高中生|國中生|青少年|校園|身心|壓力|wellbeing|well-being|adolescent|teen/i],
  public_health: [/健康|睡眠|公共衛生|青少年|流行病|health|public health|epidemiology/i],
  artificial_intelligence: [/人工智慧|生成式|生成器|報告生成器|AI輸出|大型語言模型|機器學習|演算法|ai|llm|machine learning|artificial intelligence/i],
  information_systems: [/資訊系統|平台|系統|資料庫|網站|app|dashboard|information system|platform/i],
  software_engineering: [/軟體|程式|開發|部署|前端|後端|api|github|software|programming|frontend|backend/i],
  healthcare: [/醫療|臨床|病患|照護|healthcare|clinical|patient/i],
  environmental_science: [/環境|生態|氣候|污染|保育|environment|ecology|climate|pollution/i],
  agriculture: [/農業|農作|畜牧|作物|agriculture|crop|livestock/i],
  economics: [/經濟|市場|價格|成本|收入|economics|market|price|cost/i],
  business: [/商業|企業|品牌|行銷|管理|business|marketing|management/i],
  sociology: [/社會|族群|文化|家庭|sociology|social|culture|family/i],
  public_policy: [/政策|政府|法規|公共政策|治理|government|policy|regulation|governance/i],
  community_development: [/社區|地方創生|居民|社群參與|community|neighborhood|neighbourhood/i],
  urban_studies: [/城市|都市|都會|城鄉|urban|city|cities|municipal/i],
  transportation: [/交通|運輸|通勤|道路|車流|traffic|transport|mobility|commute/i],
};

const GATED_DOMAINS = new Set([
  "urban_studies",
  "transportation",
  "public_policy",
  "community_development",
]);

const DEFAULT_PREFERRED_SOURCE_TYPES = [
  "peer_reviewed_journal",
  "systematic_review",
  "official_report",
  "university_or_research_institution_publication",
];

const DEFAULT_AVOID_SOURCE_TYPES = [
  "uncited_blog",
  "marketing_article",
  "content_farm",
  "social_media_as_core_evidence",
  "ai_generated_article_without_sources",
];

function normalize(value: string): string {
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

function stringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return unique(value.map(cleanString).filter((item): item is string => Boolean(item))).slice(0, limit);
}

function hasCue(domain: string, text: string): boolean {
  return (DOMAIN_CUES[domain] ?? []).some((pattern) => pattern.test(text));
}

function inferDomains(input: KeywordExpansionRequest): string[] {
  const text = normalize(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  return CONTROLLED_DOMAINS.filter((domain) => {
    if (domain === "general_academic_research") return false;
    return hasCue(domain, text);
  });
}

function cleanupDomains(domains: string[], input: KeywordExpansionRequest): string[] {
  const text = normalize(`${input.topic} ${input.reportType ?? ""} ${input.audience ?? ""}`);
  const supportedExisting = domains
    .filter((domain) => controlledDomainSet.has(domain))
    .filter((domain) => {
      if (domain === "general_academic_research") return true;
      if (GATED_DOMAINS.has(domain) && !hasCue(domain, text)) return false;
      return hasCue(domain, text);
    });
  const inferred = inferDomains(input);
  const cleaned = unique([...supportedExisting, ...inferred])
    .filter((domain) => !(domain === "general_academic_research" && supportedExisting.length + inferred.length > 1))
    .slice(0, 8);

  return cleaned.length ? cleaned : ["general_academic_research"];
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function buildChineseQueries(input: KeywordExpansionRequest): string[] {
  const topic = input.topic.trim();
  const text = normalize(`${input.topic} ${input.audience ?? ""}`);
  const terms = [
    hasAny(text, [/短影音|影音|tiktok|reels|short/i]) ? "短影音使用" : null,
    hasAny(text, [/高中|學生|青少年|student|adolescent/i]) ? "高中生" : null,
    hasAny(text, [/注意力|專注|attention/i]) ? "注意力" : null,
    hasAny(text, [/睡眠|sleep/i]) ? "睡眠品質" : null,
  ].filter((term): term is string => Boolean(term));
  const focused = terms.length >= 2 ? terms.join(" ") : topic;

  return unique([
    topic,
    `${topic} 文獻回顧`,
    `${focused} 實證研究`,
    `${focused} 系統性回顧`,
  ]).slice(0, 4);
}

function buildEnglishQueries(input: KeywordExpansionRequest, domains: string[]): string[] {
  const text = normalize(`${input.topic} ${input.audience ?? ""}`);
  const isShortVideoStudentSleepTopic = domains.includes("digital_media")
    && domains.includes("sleep_health")
    && domains.includes("student_wellbeing");

  if (isShortVideoStudentSleepTopic) {
    return [
      "short-form video use high school students attention sleep quality",
      "short video social media adolescents attention sleep quality",
      "digital media use students attention sleep quality systematic review",
    ];
  }

  const audience = hasAny(text, [/高中|學生|青少年|student|adolescent/i]) ? "students" : "people";
  const domainTerms = domains
    .filter((domain) => domain !== "general_academic_research")
    .map((domain) => domain.replace(/_/g, " "))
    .slice(0, 3)
    .join(" ");

  return unique([
    `${domainTerms || input.topic} ${audience} peer reviewed research`.trim(),
    `${domainTerms || input.topic} systematic review`.trim(),
  ]).slice(0, 3);
}

export function buildFallbackKeywordExpansion(
  input: KeywordExpansionRequest,
  reason = "LLM provider unavailable; deterministic keyword fallback used.",
  llmStatus: KeywordLlmStatus = "skipped",
): KeywordExpansionResult {
  const normalizedTopic = input.topic.trim();
  const domains = cleanupDomains([], input);
  const chineseQueries = buildChineseQueries(input);
  const englishQueries = buildEnglishQueries(input, domains);

  return {
    normalized_topic: normalizedTopic,
    domains,
    search_queries: unique([...englishQueries, ...chineseQueries]).slice(0, 6),
    english_queries: englishQueries,
    chinese_queries: chineseQueries,
    preferred_source_types: DEFAULT_PREFERRED_SOURCE_TYPES,
    avoid_source_types: DEFAULT_AVOID_SOURCE_TYPES,
    reasoning_notes: [
      reason,
      "Domains were selected from a controlled taxonomy and gated by explicit topic cues.",
    ],
    fallback_used: true,
    llm_status: llmStatus,
  };
}

function keywordLlmConfig(options?: KeywordExpansionOptions): KeywordLlmConfig {
  return {
    baseUrl: options?.llm?.baseUrl
      ?? process.env.KEYWORD_LLM_BASE_URL
      ?? process.env.LLM_BASE_URL
      ?? process.env.OPENAI_BASE_URL
      ?? "https://api.openai.com/v1",
    apiKey: options?.llm?.apiKey
      ?? process.env.KEYWORD_LLM_API_KEY
      ?? process.env.LLM_API_KEY
      ?? process.env.OPENAI_API_KEY,
    model: options?.llm?.model
      ?? process.env.KEYWORD_LLM_MODEL
      ?? process.env.LLM_MODEL
      ?? process.env.OPENAI_MODEL
      ?? "gpt-4o-mini",
    timeoutMs: options?.llm?.timeoutMs
      ?? (Number(process.env.KEYWORD_LLM_TIMEOUT_MS) || DEFAULT_KEYWORD_LLM_TIMEOUT_MS),
  };
}

function chatCompletionsUrl(baseUrl: string): URL {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("chat/completions", normalizedBase);
}

function fallbackReason(error: unknown): string {
  if (error instanceof KeywordExpansionError) {
    return `LLM keyword expansion fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) {
    return `LLM keyword expansion fallback: ${error.message}`;
  }
  return "LLM keyword expansion fallback: unknown provider failure.";
}

function llmStatusFromError(error: unknown): KeywordLlmStatus {
  if (error instanceof KeywordExpansionError) {
    if (error.code === "provider-unconfigured") return "skipped";
    if (error.code === "provider-quota") return "quota_exceeded";
    if (error.code === "provider-timeout") return "timeout";
    return "failed";
  }

  return "failed";
}

function isQuotaOrAuthFailure(status: number, body: string): boolean {
  return status === 403
    || status === 429
    || body.includes("DAILY_LIMIT_EXCEEDED")
    || body.includes("quota")
    || body.includes("rate limit");
}

function llmHttpErrorMessage(status: number): string {
  if (status === 401) return "LLM provider returned HTTP 401.";
  if (status === 403 || status === 429) return `LLM provider quota or access limit returned HTTP ${status}.`;
  return `LLM provider returned HTTP ${status}.`;
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
    throw new KeywordExpansionError("invalid-json", "LLM response did not contain valid JSON.");
  }
}

function coerceKeywordExpansion(
  value: unknown,
  input: KeywordExpansionRequest,
  fallbackUsed: boolean,
): KeywordExpansionResult {
  if (!value || typeof value !== "object") {
    throw new KeywordExpansionError("invalid-json", "LLM response was not a JSON object.");
  }

  const data = value as Record<string, unknown>;
  const normalizedTopic = cleanString(data.normalized_topic) ?? input.topic.trim();
  const domains = cleanupDomains(stringArray(data.domains, 8), input);
  const chineseQueries = stringArray(data.chinese_queries, 4);
  const englishQueries = stringArray(data.english_queries, 4);
  const fallback = buildFallbackKeywordExpansion(input, "LLM returned incomplete keyword data; deterministic fields were merged.");
  const searchQueries = unique([
    ...stringArray(data.search_queries, 6),
    ...englishQueries,
    ...chineseQueries,
    ...fallback.english_queries,
    ...fallback.chinese_queries,
  ]).slice(0, 6);

  return {
    normalized_topic: normalizedTopic,
    domains,
    search_queries: searchQueries,
    english_queries: englishQueries.length ? englishQueries : fallback.english_queries,
    chinese_queries: chineseQueries.length ? chineseQueries : fallback.chinese_queries,
    preferred_source_types: stringArray(data.preferred_source_types, 8).length
      ? stringArray(data.preferred_source_types, 8)
      : DEFAULT_PREFERRED_SOURCE_TYPES,
    avoid_source_types: stringArray(data.avoid_source_types, 8).length
      ? stringArray(data.avoid_source_types, 8)
      : DEFAULT_AVOID_SOURCE_TYPES,
    reasoning_notes: stringArray(data.reasoning_notes, 8).length
      ? stringArray(data.reasoning_notes, 8)
      : ["LLM keyword expansion returned valid JSON."],
    fallback_used: fallbackUsed,
    llm_status: fallbackUsed ? "failed" : "success",
  };
}

async function requestLlmKeywordExpansion(
  input: KeywordExpansionRequest,
  options?: KeywordExpansionOptions,
): Promise<KeywordExpansionResult> {
  const config = keywordLlmConfig(options);
  if (!config.apiKey?.trim()) {
    throw new KeywordExpansionError("provider-unconfigured", "No LLM API key is configured.");
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
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "You expand academic source-search keywords for ResearchForge.",
              "Return strict JSON only, with no markdown.",
              `Allowed domains: ${CONTROLLED_DOMAINS.join(", ")}.`,
              "Do not include urban_studies, transportation, public_policy, or community_development unless the topic explicitly mentions city, traffic, policy, community, government, or similar cues.",
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
                normalized_topic: "string",
                domains: "string[]",
                search_queries: "string[]",
                english_queries: "string[]",
                chinese_queries: "string[]",
                preferred_source_types: "string[]",
                avoid_source_types: "string[]",
                reasoning_notes: "string[]",
                fallback_used: "boolean",
              },
            }),
          },
        ],
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new KeywordExpansionError(
        isQuotaOrAuthFailure(response.status, body) ? "provider-quota" : "provider-failure",
        llmHttpErrorMessage(response.status),
      );
    }

    const payload = extractJsonObject(body) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new KeywordExpansionError("invalid-json", "LLM response did not include message content.");
    }

    return coerceKeywordExpansion(extractJsonObject(content), input, false);
  } catch (error) {
    if (error instanceof KeywordExpansionError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new KeywordExpansionError("provider-timeout", "LLM keyword expansion timed out.", error);
    }
    throw new KeywordExpansionError("provider-failure", "LLM keyword expansion request failed.", error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function expandSearchKeywords(
  input: KeywordExpansionRequest,
  options?: KeywordExpansionOptions,
): Promise<KeywordExpansionResult> {
  const normalizedInput = {
    ...input,
    topic: input.topic.trim(),
  };

  try {
    const result = await requestLlmKeywordExpansion(normalizedInput, options);
    return {
      ...result,
      domains: cleanupDomains(result.domains, normalizedInput),
      fallback_used: false,
    };
  } catch (error) {
    return buildFallbackKeywordExpansion(normalizedInput, fallbackReason(error), llmStatusFromError(error));
  }
}

export async function searchKeywordSources(
  input: KeywordExpansionRequest,
  options?: KeywordSourceSearchOptions,
): Promise<KeywordSourceSearchResult> {
  const keywordExpansion = await expandSearchKeywords(input, options);
  const queryLimit = options?.queryLimit ?? (Number(process.env.KEYWORD_SEARCH_QUERY_LIMIT) || DEFAULT_KEYWORD_QUERY_LIMIT);
  const queries = unique(keywordExpansion.search_queries.map((query) => query.trim()).filter(Boolean)).slice(0, queryLimit);
  const groups = (await Promise.all(
    queries.map((query) => searchSourceProviders(query, options?.sourceSearch ?? { fetchImpl: options?.fetchImpl })),
  )).flat();
  const sources = dedupeSourceRecords(groups.flatMap((group) => group.results)).slice(0, 24);

  return {
    ok: true,
    llm_status: keywordExpansion.llm_status,
    keyword_expansion: keywordExpansion,
    groups,
    sources,
  };
}
