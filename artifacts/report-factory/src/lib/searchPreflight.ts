import searchTuningDataset from "../data/search-tuning/report_search_tuning_test_cases_100.json" with { type: "json" };

type SearchTuningDataset = {
  cases?: SearchTuningCase[];
};

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

const cases = ((searchTuningDataset as SearchTuningDataset).cases ?? []).filter((item) => item.case_id);

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
    const overridden = applyInputOverrides(guidance, input);
    return { ...overridden, guidance_cases: [overridden] };
  }

  const scored = cases
    .map((item): ScoredCase => ({ item, score: scoreCase(item, input) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0 || scored[0].score < 16) {
    const guidance = genericGuidance(input);
    const overridden = applyInputOverrides(guidance, input);
    return { ...overridden, guidance_cases: [overridden] };
  }

  const top = scored.slice(0, 3).map(({ item, score }) => toGuidance(item, confidenceFromScore(score)));
  const merged = mergeGuidance(top[0], top);
  return { ...applyInputOverrides(merged, input), guidance_cases: merged.guidance_cases };
}

export function buildPreflightSearchQuery(topic: string, preflight: SearchPreflightResult): string {
  const keywords = preflight.recommended_keywords
    .filter((keyword) => !includesNormalized(keyword, topic))
    .slice(0, 2);
  return unique([topic, ...keywords]).join(" ");
}
