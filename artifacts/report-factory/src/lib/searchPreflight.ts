interface SearchTuningCase {
  case_id: string;
  input_for_report_generator: {
    topic: string;
    reportType: string;
  };
  expected_classification: {
    intent: string;
    isSoftwareProject: boolean;
    domains: string[];
    reportStrategy?: string;
  };
  search_guidance: {
    recommended_keywords: string[];
    preferred_source_types: string[];
    avoid_source_types: string[];
    source_priority_rules: string[];
  };
  common_failure_modes: string[];
  evidence_requirements: string[];
  safety_and_ethics_notes: string[];
}

export interface SearchPreflightInput {
  topic: string;
  reportType: string;
}

export interface SearchPreflightGuidance {
  matched_case_id: string;
  confidence: number;
  predicted_report_type: string;
  report_strategy: string;
  intent: string;
  isSoftwareProject: boolean;
  domains: string[];
  recommended_keywords: string[];
  preferred_source_types: string[];
  avoid_source_types: string[];
  source_priority_rules: string[];
  common_failure_modes: string[];
  evidence_requirements: string[];
  safety_and_ethics_notes: string[];
}

export interface SearchPreflightResult extends SearchPreflightGuidance {
  guidance_cases: SearchPreflightGuidance[];
}

type ScoredCase = {
  item: SearchTuningCase;
  score: number;
};

const cases: SearchTuningCase[] = [
  {
    case_id: "academic_report_search_case_050",
    input_for_report_generator: {
      topic: "報告生成器中的引用檢查機制對學生研究報告品質之影響",
      reportType: "研究報告",
    },
    expected_classification: {
      intent: "academic_report",
      isSoftwareProject: false,
      domains: ["education", "artificial_intelligence", "digital_media"],
      reportStrategy: "academic_report_with_source_quality_focus",
    },
    search_guidance: {
      recommended_keywords: [
        "引用檢查",
        "學生研究報告品質",
        "AI writing tools",
        "citation quality",
        "information literacy",
      ],
      preferred_source_types: [
        "peer_reviewed_journal",
        "systematic_review",
        "university_or_research_institution_publication",
      ],
      avoid_source_types: [
        "ai_generated_article_without_sources",
        "uncited_blog",
        "marketing_article",
      ],
      source_priority_rules: [
        "優先使用同儕審查研究、教育科技研究與資訊素養相關文獻。",
        "AI工具功能描述不可取代可查證的研究證據。",
      ],
    },
    common_failure_modes: [
      "把AI輸出的引用清單視為已驗證來源。",
      "將工具設計假設誤寫成學生報告品質已提升的研究結果。",
    ],
    evidence_requirements: [
      "不得生成無來源的百分比、樣本數、效果量或研究結果。",
      "引用品質、學生表現與學習成效必須由可追溯研究或課堂資料支持。",
    ],
    safety_and_ethics_notes: [
      "涉及學生資料時需避免個資揭露，並區分教學情境與正式實驗資料。",
    ],
  },
];

const CONTROLLED_ACADEMIC_DOMAINS = [
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

const controlledDomainSet = new Set<string>(CONTROLLED_ACADEMIC_DOMAINS);

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

function genericGuidance(input?: SearchPreflightInput): SearchPreflightGuidance {
  return {
    matched_case_id: "generic_academic_report",
    confidence: 0.35,
    predicted_report_type: input?.reportType.trim() || "研究報告",
    report_strategy: "generic_academic_report_guidance",
    intent: "academic_report",
    isSoftwareProject: false,
    domains: ["general_academic_research"],
    recommended_keywords: ["文獻回顧", "實證研究", "研究方法", "official report", "peer reviewed research"],
    preferred_source_types: [
      "peer_reviewed_journal",
      "systematic_review",
      "official_report",
      "government_statistics",
      "university_or_research_institution_publication",
    ],
    avoid_source_types: [
      "uncited_blog",
      "marketing_article",
      "content_farm",
      "social_media_as_core_evidence",
      "ai_generated_article_without_sources",
    ],
    source_priority_rules: [
      "正式期刊、官方統計與研究機構資料優先。",
      "新聞可用於背景脈絡，不可作為核心學術證據。",
      "來源若無作者、日期、出版單位或可追溯連結，應降權或排除。",
    ],
    common_failure_modes: [
      "把主題寫成一般介紹而非研究報告。",
      "自行生成無來源的數字或研究結果。",
      "使用低可信來源作為核心證據。",
    ],
    evidence_requirements: [
      "不得生成無來源的百分比、金額、樣本數、排名、效果量、產量或風險倍數。",
      "所有數字型主張必須由搜尋結果中的可信來源支持。",
      "若資料無法驗證，最終報告應改寫為保守描述或標示為待查證。",
      "參考文獻需核對作者、年份、題名、期刊、卷期、頁碼、DOI或正式連結。",
    ],
    safety_and_ethics_notes: [],
  };
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function hasCue(domain: string, text: string): boolean {
  return (DOMAIN_CUES[domain] ?? []).some((pattern) => pattern.test(text));
}

function inferDomainsFromTopic(input: SearchPreflightInput): string[] {
  const text = normalize(`${input.topic} ${input.reportType}`);
  return CONTROLLED_ACADEMIC_DOMAINS.filter((domain) => {
    if (domain === "general_academic_research") return false;
    return hasCue(domain, text);
  });
}

function cleanupDomains(domains: string[], input: SearchPreflightInput): string[] {
  const text = normalize(`${input.topic} ${input.reportType}`);
  const supportedExisting = domains
    .filter((domain) => controlledDomainSet.has(domain))
    .filter((domain) => {
      if (domain === "general_academic_research") return true;
      if (GATED_DOMAINS.has(domain) && !hasCue(domain, text)) return false;
      return hasCue(domain, text);
    });
  const inferred = inferDomainsFromTopic(input);
  const cleaned = unique([...supportedExisting, ...inferred])
    .filter((domain) => !(domain === "general_academic_research" && supportedExisting.length + inferred.length > 1))
    .slice(0, 8);

  return cleaned.length ? cleaned : ["general_academic_research"];
}

function applyDomainCleanup<T extends SearchPreflightGuidance>(
  guidance: T,
  input: SearchPreflightInput,
): T {
  return {
    ...guidance,
    domains: cleanupDomains(guidance.domains, input),
  };
}

function tokenize(value: string): string[] {
  const normalized = normalize(value);
  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];
  const cjkTokens = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  const cjkBigrams = cjkTokens.flatMap((token) => {
    const chars = Array.from(token);
    if (chars.length <= 2) return [token];
    return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
  });

  return unique([...asciiTokens, ...cjkTokens, ...cjkBigrams]).filter((token) => token.length >= 2);
}

function includesNormalized(haystack: string, needle: string): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  return Boolean(h && n && (h.includes(n) || n.includes(h)));
}

function tokenOverlapScore(inputTokens: string[], candidateText: string, weight: number): number {
  if (inputTokens.length === 0) return 0;
  const candidate = normalize(candidateText);
  const matches = inputTokens.filter((token) => candidate.includes(token));
  return (matches.length / inputTokens.length) * weight;
}

function keywordScore(inputText: string, keywords: string[]): number {
  const normalizedInput = normalize(inputText);
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalize(keyword);
    if (!normalizedKeyword) return score;
    if (normalizedInput.includes(normalizedKeyword)) return score + 12;
    if (normalizedKeyword.includes(normalizedInput) && normalizedInput.length >= 4) return score + 8;
    return score + tokenOverlapScore(tokenize(normalizedKeyword), normalizedInput, 5);
  }, 0);
}

function isSoftwareProjectInput(input: SearchPreflightInput): boolean {
  const text = normalize(`${input.topic} ${input.reportType}`);
  const softwareSignals = [
    "app",
    "api",
    "dashboard",
    "database",
    "frontend",
    "backend",
    "github",
    "llm",
    "rag",
    "web",
    "網站",
    "程式",
    "軟體",
    "系統",
    "平台",
    "工具",
    "應用程式",
    "自動化",
    "資料庫",
    "演算法",
    "開發",
    "部署",
    "前端",
    "後端",
    "人工智慧",
    "大型語言模型",
  ];
  return softwareSignals.some((signal) => text.includes(signal));
}

function applyInputOverrides(
  guidance: SearchPreflightGuidance,
  input: SearchPreflightInput,
): SearchPreflightGuidance {
  if (!isSoftwareProjectInput(input)) return guidance;

  return {
    ...guidance,
    isSoftwareProject: true,
    domains: unique(["software_engineering", "information_systems", ...guidance.domains]),
    preferred_source_types: unique([
      "official_documentation",
      "technical_report",
      "peer_reviewed_journal",
      "university_or_research_institution_publication",
      ...guidance.preferred_source_types,
    ]),
    avoid_source_types: unique([
      "uncited_blog",
      "ai_generated_article_without_sources",
      "outdated_tutorial_without_version",
      ...guidance.avoid_source_types,
    ]),
    source_priority_rules: unique([
      "軟體或AI專案需優先核對官方文件、版本資訊、技術報告與可追溯研究來源。",
      ...guidance.source_priority_rules,
    ]),
    common_failure_modes: unique([
      "把工具功能、產品願景或預期效果寫成已驗證研究結果。",
      ...guidance.common_failure_modes,
    ]),
    evidence_requirements: unique([
      "軟體功能、模型能力、效能、準確率、成本或使用成效必須有可查證來源或實測資料支持。",
      ...guidance.evidence_requirements,
    ]),
    safety_and_ethics_notes: unique([
      "涉及AI或軟體系統時，需區分設計假設、實作能力、測試結果與正式研究證據。",
      ...guidance.safety_and_ethics_notes,
    ]),
  };
}

function scoreCase(item: SearchTuningCase, input: SearchPreflightInput): number {
  const topic = input.topic.trim();
  const inputText = `${topic} ${input.reportType}`;
  const topicTokens = tokenize(topic);
  const caseTopic = item.input_for_report_generator.topic;
  const domains = item.expected_classification.domains.join(" ");
  const keywords = item.search_guidance.recommended_keywords;

  let score = 0;
  if (includesNormalized(caseTopic, topic)) score += 28;
  if (item.input_for_report_generator.reportType === input.reportType) score += 5;
  score += tokenOverlapScore(topicTokens, caseTopic, 32);
  score += keywordScore(inputText, keywords);
  score += tokenOverlapScore(tokenize(inputText), domains, 12);
  return score;
}

function confidenceFromScore(score: number): number {
  if (score <= 0) return 0.35;
  return Math.max(0.4, Math.min(0.95, Math.round((score / 70) * 100) / 100));
}

function toGuidance(item: SearchTuningCase, confidence: number): SearchPreflightGuidance {
  return {
    matched_case_id: item.case_id,
    confidence,
    predicted_report_type: item.input_for_report_generator.reportType,
    report_strategy: item.expected_classification.reportStrategy ?? item.expected_classification.intent,
    intent: item.expected_classification.intent,
    isSoftwareProject: item.expected_classification.isSoftwareProject,
    domains: item.expected_classification.domains,
    recommended_keywords: item.search_guidance.recommended_keywords,
    preferred_source_types: item.search_guidance.preferred_source_types,
    avoid_source_types: item.search_guidance.avoid_source_types,
    source_priority_rules: item.search_guidance.source_priority_rules,
    common_failure_modes: item.common_failure_modes,
    evidence_requirements: item.evidence_requirements,
    safety_and_ethics_notes: item.safety_and_ethics_notes,
  };
}

function mergeGuidance(primary: SearchPreflightGuidance, guidanceCases: SearchPreflightGuidance[]): SearchPreflightResult {
  return {
    ...primary,
    guidance_cases: guidanceCases,
    domains: unique(guidanceCases.flatMap((item) => item.domains)),
    recommended_keywords: unique(guidanceCases.flatMap((item) => item.recommended_keywords)).slice(0, 12),
    preferred_source_types: unique(guidanceCases.flatMap((item) => item.preferred_source_types)),
    avoid_source_types: unique(guidanceCases.flatMap((item) => item.avoid_source_types)),
    source_priority_rules: unique(guidanceCases.flatMap((item) => item.source_priority_rules)),
    common_failure_modes: unique(guidanceCases.flatMap((item) => item.common_failure_modes)),
    evidence_requirements: unique(guidanceCases.flatMap((item) => item.evidence_requirements)),
    safety_and_ethics_notes: unique(guidanceCases.flatMap((item) => item.safety_and_ethics_notes)),
  };
}

export function runSearchPreflight(input: SearchPreflightInput): SearchPreflightResult {
  const topic = input.topic.trim();
  if (!topic || cases.length === 0) {
    const guidance = genericGuidance(input);
    const overridden = applyDomainCleanup(applyInputOverrides(guidance, input), input);
    return { ...overridden, guidance_cases: [overridden] };
  }

  const scored = cases
    .map((item): ScoredCase => ({ item, score: scoreCase(item, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < 16) {
    const guidance = genericGuidance(input);
    const overridden = applyDomainCleanup(applyInputOverrides(guidance, input), input);
    return { ...overridden, guidance_cases: [overridden] };
  }

  const top = scored.slice(0, 3).map(({ item, score }) => toGuidance(item, confidenceFromScore(score)));
  const merged = mergeGuidance(top[0], top);
  return {
    ...applyDomainCleanup(applyInputOverrides(merged, input), input),
    guidance_cases: merged.guidance_cases,
  };
}

export function buildPreflightSearchQuery(topic: string, preflight: SearchPreflightResult): string {
  const keywords = preflight.recommended_keywords
    .filter((keyword) => !includesNormalized(keyword, topic))
    .slice(0, 2);
  return unique([topic, ...keywords]).join(" ");
}
