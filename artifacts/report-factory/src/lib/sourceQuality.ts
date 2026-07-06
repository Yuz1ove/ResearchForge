import { conceptTermsForTopic } from "@workspace/api-zod/domain-synonyms";
import type { SourceRecord } from "./sourceRecords.ts";

export type TopicAnchorDomain =
  | "chemistry"
  | "biology"
  | "dentistry"
  | "animal_behavior"
  | "medicine"
  | "physics"
  | "social_science"
  | "language"
  | "general"
  | "unknown";

export interface TopicAnchorProfile {
  topic: string;
  domain: TopicAnchorDomain;
  anchorConcepts: string[];
  applicationConcepts: string[];
  exclusionTerms: string[];
}

export type TopicalRelevanceLabel =
  | "high"
  | "medium"
  | "low"
  | "irrelevant";

export interface TopicalRelevanceInput {
  confirmedTopic: string;
  domain?: string;
  anchorConcepts: string[];
  applicationConcepts?: string[];
  exclusionTerms?: string[];
  sourceTitle: string;
  sourceAbstract?: string | null;
  sourceSnippet?: string | null;
  sourceKeywords?: string[] | null;
  sourceVenue?: string | null;
  sourceType?: string | null;
  sourceLanguage?: string | null;
}

export interface TopicalRelevanceResult {
  topicalRelevanceScore: number;
  topicalRelevanceLabel: TopicalRelevanceLabel;
  matchedAnchorConcepts: string[];
  matchedApplicationConcepts: string[];
  negativeSignals: string[];
  relevanceReasonZhTW: string;
  shouldRejectImmediately: boolean;
}

export type EvidenceSufficiency =
  | "strong"
  | "moderate"
  | "weak"
  | "insufficient";

export type SourceSummaryMode =
  | "fulltext"
  | "abstract"
  | "snippet"
  | "metadataFallback"
  | "reject";

export interface EvidenceSufficiencyInput {
  sourceTitle: string;
  sourceAbstract?: string | null;
  sourceSnippet?: string | null;
  extractedText?: string | null;
  sourceType?: string | null;
  sourceLanguage?: string | null;
  topicalRelevanceLabel: TopicalRelevanceLabel;
  shouldRejectImmediately: boolean;
}

export interface EvidenceSufficiencyResult {
  evidenceSufficiency: EvidenceSufficiency;
  usableAsPrimaryEvidence: boolean;
  usableAsSecondaryEvidence: boolean;
  summaryMode: SourceSummaryMode;
  sufficiencyReasonZhTW: string;
}

export interface SourceSummaryInput {
  confirmedTopic: string;
  sourceTitle: string;
  sourceUrl?: string | null;
  sourceType?: string | null;
  sourceLanguage?: string | null;
  sourceAbstract?: string | null;
  sourceSnippet?: string | null;
  extractedText?: string | null;
  topicalRelevanceLabel: TopicalRelevanceLabel;
  topicalRelevanceScore: number;
  relevanceReasonZhTW: string;
  evidenceSufficiency: EvidenceSufficiency;
  summaryMode: SourceSummaryMode;
  matchedAnchorConcepts?: string[];
  matchedApplicationConcepts?: string[];
}

export interface SourceSummaryResult {
  readableSummaryZhTW: string;
  summarySourceType: SourceSummaryMode;
  summaryConfidence: "high" | "medium" | "low";
  qualityWarnings: string[];
}

export type SourceUsageRecommendation =
  | "primary"
  | "secondary"
  | "reference"
  | "exclude";

export interface SourceQualityEvaluation {
  anchorProfile: TopicAnchorProfile;
  topical: TopicalRelevanceResult;
  sufficiency: EvidenceSufficiencyResult;
  summary: SourceSummaryResult;
  usageRecommendation: SourceUsageRecommendation;
}

const LOW_WEIGHT_TERMS = new Set([
  "研究",
  "應用",
  "限制",
  "分析",
  "概念",
  "管理",
  "影響",
  "探討",
  "使用",
  "發展",
  "study",
  "application",
  "applications",
  "limitation",
  "limitations",
  "analysis",
  "concept",
  "concepts",
  "management",
  "impact",
  "impacts",
  "discussion",
  "development",
  "review",
]);

const GENERIC_STOP_WORDS = new Set([
  "如何",
  "什麼",
  "與",
  "及",
  "和",
  "對",
  "之",
  "的",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "about",
]);

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
};

function cleanWhitespace(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function lowerText(value: string | null | undefined): string {
  return cleanWhitespace(value).toLowerCase();
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function stripHtml(value: string | null | undefined): string {
  const input = cleanWhitespace(value);
  if (!input) return "";
  const decoded = Object.entries(HTML_ENTITY_MAP).reduce(
    (text, [entity, replacement]) => text.replaceAll(entity, replacement),
    input,
  );
  return decoded
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b(undefined|null|NaN)\b/gi, " ")
    .replace(/https?:\/\/\S{30,}/gi, " ")
    .replace(/[。.!?]{3,}/g, "。")
    .replace(/[，,]{3,}/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function textIncludes(text: string, term: string): boolean {
  const normalizedText = lowerText(text);
  const normalizedTerm = lowerText(term);
  if (!normalizedText || !normalizedTerm) return false;
  return normalizedText.includes(normalizedTerm);
}

function matchedTerms(text: string, terms: string[]): string[] {
  return unique(
    terms.filter((term) => {
      const normalized = lowerText(term);
      if (!normalized || LOW_WEIGHT_TERMS.has(normalized)) return false;
      return textIncludes(text, term);
    }),
  );
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/u.test(text);
}

function mostlyEnglish(text: string): boolean {
  const normalized = cleanWhitespace(text);
  const asciiLetters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  const total = Array.from(normalized).length || 1;
  return asciiLetters / total >= 0.25;
}

function normalizeKeywordList(value: string[] | null | undefined): string[] {
  return unique(value?.map((item) => stripHtml(item)).filter(Boolean) ?? []);
}

function genericTopicTerms(topic: string): string[] {
  const normalized = stripHtml(topic);
  return unique(
    normalized
      .split(/[，,。；;：:\s()（）/]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2)
      .filter((term) => !GENERIC_STOP_WORDS.has(term.toLowerCase()))
      .filter((term) => !LOW_WEIGHT_TERMS.has(term.toLowerCase())),
  );
}

function chemistryProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "chemistry",
    anchorConcepts: [
      "氧化還原",
      "氧化",
      "還原",
      "電子轉移",
      "氧化劑",
      "還原劑",
      "氧化數",
      "redox",
      "oxidation",
      "reduction",
      "electron transfer",
      "oxidant",
      "reductant",
      "oxidation state",
      "electrochemistry",
    ],
    applicationConcepts: [
      "腐蝕",
      "燃燒",
      "電池",
      "電化學",
      "金屬氧化物",
      "代謝",
      "工業反應",
      "corrosion",
      "combustion",
      "battery",
      "metal oxide",
      "nickel oxide",
      "cobalt oxide",
      "electrochemical",
    ],
    exclusionTerms: [
      "人工智慧",
      "ai",
      "machine learning",
      "deep learning",
      "語法",
      "英文學習",
      "教育學",
      "語言學",
      "grammar",
      "linguistics",
      "education",
      "management",
      "資訊管理",
      "概念與應用管理",
      "language learning",
    ],
  };
}

function microplasticsHealthProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "medicine",
    anchorConcepts: [
      "microplastics",
      "微塑膠",
      "人體健康",
      "human health",
      "exposure",
      "暴露",
      "toxicology",
      "toxicity",
      "發炎",
      "inflammation",
      "tissue",
      "blood",
      "environmental health",
    ],
    applicationConcepts: [
      "ingestion",
      "吸入",
      "bioaccumulation",
      "oxidative stress",
      "immune response",
      "細胞毒性",
      "血液",
      "組織",
    ],
    exclusionTerms: [
      "plastic manufacturing",
      "manufacturing",
      "education",
      "ai",
      "management",
      "supply chain",
      "marketing",
      "教學",
      "教育",
      "管理",
    ],
  };
}

function salmonellaProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "biology",
    anchorConcepts: [
      "salmonella",
      "沙門氏桿菌",
      "food safety",
      "食品安全",
      "contamination",
      "污染",
      "outbreak",
      "爆發",
      "infection",
      "感染",
      "public health",
      "公共衛生",
    ],
    applicationConcepts: [
      "poultry",
      "eggs",
      "egg",
      "雞蛋",
      "家禽",
      "foodborne",
      "餐飲",
      "surveillance",
    ],
    exclusionTerms: [
      "cooking blog",
      "recipe",
      "management",
      "education",
      "ai",
      "marketing",
      "食譜",
      "部落格",
      "教學",
    ],
  };
}

function climateProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "general",
    anchorConcepts: [
      "氣候變遷",
      "climate change",
      "global warming",
      "全球暖化",
      "greenhouse gas",
      "溫室氣體",
    ],
    applicationConcepts: [
      "carbon dioxide",
      "co2",
      "methane",
      "sea level",
      "temperature trend",
      "observed warming",
      "二氧化碳",
      "甲烷",
      "海平面",
      "升溫",
    ],
    exclusionTerms: ["tone sandhi", "phonetic variation", "admission", "招生", "金融風險 only"],
  };
}

function spiderProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "biology",
    anchorConcepts: [
      "蜘蛛",
      "spider",
      "spiders",
      "arachnid",
      "araneae",
      "棲地",
      "habitat",
      "microhabitat",
    ],
    applicationConcepts: [
      "生態",
      "ecology",
      "adaptation",
      "predation",
      "survival",
      "築網",
      "web building",
    ],
    exclusionTerms: ["圖書館", "招生", "教育行政", "national security", "reading promotion"],
  };
}

function colaProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "medicine",
    anchorConcepts: [
      "cola",
      "可樂",
      "soft drink",
      "sugar-sweetened beverage",
      "含糖飲料",
      "health",
      "健康",
      "sugar",
      "caffeine",
    ],
    applicationConcepts: [
      "obesity",
      "metabolic health",
      "dental caries",
      "consumption",
      "intake",
      "drinking habits",
    ],
    exclusionTerms: ["招生", "圖書館", "工程管理", "耶路撒冷", "tone sandhi"],
  };
}

function shortVideoProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "social_science",
    anchorConcepts: [
      "短影音",
      "short video",
      "short-form video",
      "tiktok",
      "attention",
      "注意力",
      "sleep",
      "睡眠",
    ],
    applicationConcepts: [
      "students",
      "adolescents",
      "screen time",
      "sleep quality",
      "cognitive control",
    ],
    exclusionTerms: ["招生", "圖書館", "管理", "工程管理"],
  };
}

function airplaneProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "physics",
    anchorConcepts: [
      "飛機",
      "aircraft",
      "airplane",
      "aeroplane",
      "aviation",
      "flight safety",
      "runway overrun",
    ],
    applicationConcepts: [
      "quick access recorder",
      "qar",
      "risk assessment",
      "landing",
      "touchdown",
      "飛航安全",
      "跑道衝出",
      "風險評估",
    ],
    exclusionTerms: ["management", "admission", "education", "圖書館", "招生"],
  };
}

function dumplingProfile(topic: string): TopicAnchorProfile {
  return {
    topic,
    domain: "general",
    anchorConcepts: [
      "水餃",
      "dumpling",
      "dumplings",
      "nutrition",
      "sodium",
      "food labeling",
      "營養",
      "鈉",
      "食品標示",
    ],
    applicationConcepts: ["frozen dumpling", "consumer choice", "食品安全"],
    exclusionTerms: ["management", "admission", "education", "圖書館", "招生"],
  };
}

export function buildTopicAnchorProfile(topic: string): TopicAnchorProfile {
  const normalized = lowerText(topic);
  const conceptTerms = conceptTermsForTopic(topic);
  if (conceptTerms.concepts.length > 0) {
    const domain = conceptTerms.concepts[0]?.domain;
    return {
      topic,
      domain:
        domain === "environment"
          ? "general"
          : domain === "unknown" || domain == null
            ? "general"
            : domain,
      anchorConcepts: unique([
        ...conceptTerms.zhCoreTerms,
        ...conceptTerms.enCoreTerms,
        ...conceptTerms.zhSynonyms,
        ...conceptTerms.enSynonyms,
        ...conceptTerms.mechanismTerms,
      ]),
      applicationConcepts: unique([
        ...conceptTerms.applicationTerms,
        ...conceptTerms.limitationTerms,
      ]),
      exclusionTerms: conceptTerms.exclusionTerms,
    };
  }
  if (
    /氧化還原|redox|oxidation|reduction|electrochem/.test(normalized)
  ) {
    return chemistryProfile(topic);
  }
  if (/microplastic|微塑膠/.test(normalized) && /health|人體健康|human health/.test(normalized)) {
    return microplasticsHealthProfile(topic);
  }
  if (/salmonella|沙門氏桿菌/.test(normalized)) {
    return salmonellaProfile(topic);
  }
  if (/climate change|氣候變遷|全球暖化|greenhouse gas|溫室氣體/.test(normalized)) {
    return climateProfile(topic);
  }
  if (/spider|蜘蛛|arachnid|araneae/.test(normalized)) {
    return spiderProfile(topic);
  }
  if (/cola|可樂|soft drink|含糖飲料/.test(normalized)) {
    return colaProfile(topic);
  }
  if (/短影音|short[- ]?video|tiktok|注意力|sleep|睡眠/.test(normalized)) {
    return shortVideoProfile(topic);
  }
  if (/飛機|aircraft|airplane|aeroplane|aviation/.test(normalized)) {
    return airplaneProfile(topic);
  }
  if (/水餃|dumpling/.test(normalized)) {
    return dumplingProfile(topic);
  }

  const genericTerms = genericTopicTerms(topic);
  return {
    topic,
    domain: genericTerms.length > 0 ? "general" : "unknown",
    anchorConcepts: genericTerms,
    applicationConcepts: [],
    exclusionTerms: [],
  };
}

function relevanceReason(
  label: TopicalRelevanceLabel,
  anchorHits: string[],
  applicationHits: string[],
  negatives: string[],
): string {
  if (label === "irrelevant") {
    if (negatives.length > 0) {
      return `來源內容偏向${negatives.slice(0, 2).join("、")}，與目前主題的核心概念重合不足。`;
    }
    return "來源題名與內容都沒有明確命中目前主題的核心概念。";
  }
  if (label === "low") {
    if (anchorHits.length > 0) {
      return `只命中部分核心概念（${anchorHits.slice(0, 2).join("、")}），但支撐面仍不足。`;
    }
    return "目前只有零星延伸概念，還不足以判定為高相關來源。";
  }
  if (label === "medium") {
    return `來源命中${unique([...anchorHits, ...applicationHits]).slice(0, 3).join("、")}，可作為補充脈絡。`;
  }
  return `來源明確命中${anchorHits.slice(0, 3).join("、")}等核心概念，與主題關聯穩定。`;
}

export function evaluateTopicalRelevance(
  input: TopicalRelevanceInput,
): TopicalRelevanceResult {
  const title = stripHtml(input.sourceTitle);
  const abstract = stripHtml(input.sourceAbstract);
  const snippet = stripHtml(input.sourceSnippet);
  const keywords = normalizeKeywordList(input.sourceKeywords).join(" ");
  const venue = stripHtml(input.sourceVenue);
  const combined = [title, abstract, snippet, keywords, venue].filter(Boolean).join(" ");
  const titleAnchors = matchedTerms(title, input.anchorConcepts);
  const abstractAnchors = matchedTerms(abstract, input.anchorConcepts);
  const snippetAnchors = matchedTerms(snippet, input.anchorConcepts);
  const keywordAnchors = matchedTerms(keywords, input.anchorConcepts);
  const matchedAnchorConcepts = unique([
    ...titleAnchors,
    ...abstractAnchors,
    ...snippetAnchors,
    ...keywordAnchors,
  ]);
  const matchedApplicationConcepts = matchedTerms(
    combined,
    input.applicationConcepts ?? [],
  );
  const titleNegativeSignals = matchedTerms(title, input.exclusionTerms ?? []);
  const negativeSignals = matchedTerms(combined, input.exclusionTerms ?? []);
  const lexicalEvidenceCount =
    titleAnchors.length + abstractAnchors.length + snippetAnchors.length + keywordAnchors.length;

  let score =
    matchedAnchorConcepts.length * 24 +
    matchedApplicationConcepts.length * 10 +
    (titleAnchors.length > 0 ? 16 : 0) +
    (abstractAnchors.length > 0 ? 14 : 0) +
    (snippetAnchors.length > 0 ? 8 : 0) +
    (keywordAnchors.length > 0 ? 6 : 0) -
    negativeSignals.length * 22;

  if (lexicalEvidenceCount === 0) score -= 20;
  if (matchedAnchorConcepts.length === 0 && matchedApplicationConcepts.length > 0) {
    score -= 12;
  }

  let topicalRelevanceLabel: TopicalRelevanceLabel = "low";
  let shouldRejectImmediately = false;

  if (titleNegativeSignals.length > 0 && titleAnchors.length === 0) {
    topicalRelevanceLabel = "irrelevant";
    shouldRejectImmediately = true;
  } else if (matchedAnchorConcepts.length === 0 && negativeSignals.length > 0) {
    topicalRelevanceLabel = "irrelevant";
    shouldRejectImmediately = true;
  } else if (matchedAnchorConcepts.length === 0 && matchedApplicationConcepts.length === 0) {
    topicalRelevanceLabel = "irrelevant";
    shouldRejectImmediately = true;
  } else if (
    matchedAnchorConcepts.length >= 2 &&
    (titleAnchors.length > 0 || abstractAnchors.length > 0)
  ) {
    topicalRelevanceLabel = negativeSignals.length === 0 ? "high" : "medium";
  } else if (
    matchedAnchorConcepts.length >= 1 &&
    (abstractAnchors.length > 0 ||
      titleAnchors.length > 0 ||
      matchedApplicationConcepts.length > 0)
  ) {
    topicalRelevanceLabel = negativeSignals.length >= 2 ? "low" : "medium";
  } else if (matchedApplicationConcepts.length >= 2) {
    topicalRelevanceLabel = "medium";
  } else if (matchedAnchorConcepts.length >= 1 || matchedApplicationConcepts.length >= 1) {
    topicalRelevanceLabel = "low";
  } else {
    topicalRelevanceLabel = "irrelevant";
    shouldRejectImmediately = true;
  }

  if (
    topicalRelevanceLabel !== "irrelevant" &&
    negativeSignals.length > 0 &&
    matchedAnchorConcepts.length === 0
  ) {
    topicalRelevanceLabel = "irrelevant";
    shouldRejectImmediately = true;
  }

  const topicalRelevanceScore = clampScore(score);

  return {
    topicalRelevanceScore,
    topicalRelevanceLabel,
    matchedAnchorConcepts,
    matchedApplicationConcepts,
    negativeSignals,
    relevanceReasonZhTW: relevanceReason(
      topicalRelevanceLabel,
      matchedAnchorConcepts,
      matchedApplicationConcepts,
      negativeSignals,
    ),
    shouldRejectImmediately,
  };
}

export function evaluateEvidenceSufficiency(
  input: EvidenceSufficiencyInput,
): EvidenceSufficiencyResult {
  const abstract = stripHtml(input.sourceAbstract);
  const snippet = stripHtml(input.sourceSnippet);
  const extractedText = stripHtml(input.extractedText);

  if (input.shouldRejectImmediately || input.topicalRelevanceLabel === "irrelevant") {
    return {
      evidenceSufficiency: "insufficient",
      usableAsPrimaryEvidence: false,
      usableAsSecondaryEvidence: false,
      summaryMode: "reject",
      sufficiencyReasonZhTW: "來源已在主題相關度階段被排除，不納入證據使用。",
    };
  }

  if (extractedText.length >= 600) {
    return {
      evidenceSufficiency: "strong",
      usableAsPrimaryEvidence: input.topicalRelevanceLabel === "high",
      usableAsSecondaryEvidence: true,
      summaryMode: "fulltext",
      sufficiencyReasonZhTW: "已有較完整的正文內容，可作為正式證據判讀基礎。",
    };
  }

  if (abstract.length >= 80) {
    return {
      evidenceSufficiency: "moderate",
      usableAsPrimaryEvidence: input.topicalRelevanceLabel === "high",
      usableAsSecondaryEvidence: true,
      summaryMode: "abstract",
      sufficiencyReasonZhTW: "目前有摘要可供判讀，但仍不代表已完整閱讀全文。",
    };
  }

  if (snippet.length >= 40) {
    return {
      evidenceSufficiency: "weak",
      usableAsPrimaryEvidence: false,
      usableAsSecondaryEvidence:
        input.topicalRelevanceLabel === "high" ||
        input.topicalRelevanceLabel === "medium",
      summaryMode: "snippet",
      sufficiencyReasonZhTW: "目前只看到片段資訊，可作為補充來源，但不宜直接當主證據。",
    };
  }

  return {
    evidenceSufficiency: "insufficient",
    usableAsPrimaryEvidence: false,
    usableAsSecondaryEvidence: false,
    summaryMode: "metadataFallback",
    sufficiencyReasonZhTW: "目前只有標題或書目資訊，證據不足，不能視為正式摘要依據。",
  };
}

function splitSentences(text: string): string[] {
  return stripHtml(text)
    .split(/(?<=[。！？.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function truncateText(text: string, maxLength = 160): string {
  const chars = Array.from(cleanWhitespace(text));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, maxLength - 1).join("").trim()}…`;
}

function joinMatchedConcepts(input: SourceSummaryInput): string {
  return unique([
    ...(input.matchedAnchorConcepts ?? []),
    ...(input.matchedApplicationConcepts ?? []),
  ])
    .slice(0, 3)
    .join("、");
}

function fallbackRelation(input: SourceSummaryInput): string {
  const matched = joinMatchedConcepts(input);
  if (input.topicalRelevanceLabel === "high" && matched) {
    return `就目前資訊來看，它可直接補充「${input.confirmedTopic}」中與${matched}相關的說明。`;
  }
  if (input.topicalRelevanceLabel === "medium" && matched) {
    return `它較適合補充「${input.confirmedTopic}」周邊與${matched}相關的脈絡。`;
  }
  if (input.topicalRelevanceLabel === "low") {
    return `它與「${input.confirmedTopic}」只有局部重疊，使用前仍要再核對全文。`;
  }
  return "目前不建議把它當成主要證據。";
}

function summarizeWithEvidenceText(
  text: string,
  input: SourceSummaryInput,
  mode: "fulltext" | "abstract" | "snippet",
): string {
  const cleaned = stripHtml(text);
  const sentences = splitSentences(cleaned);
  const firstSentence = sentences[0] ?? cleaned;
  const secondSentence = sentences[1] ?? "";
  const relation = fallbackRelation(input);

  if (hasChinese(firstSentence) && !mostlyEnglish(firstSentence)) {
    const base = [firstSentence, secondSentence].filter(Boolean).join(" ");
    return truncateText(`${base} ${relation}`, mode === "snippet" ? 150 : 170);
  }

  const matched = joinMatchedConcepts(input);
  if (mode === "snippet") {
    return truncateText(
      `目前僅能從片段資訊判斷，這份資料圍繞${matched || "相關概念"}展開。${relation} 由於資訊仍不完整，後續引用前應再確認原文內容。`,
      165,
    );
  }

  return truncateText(
    `目前可確認這份資料主要涉及${matched || "主題相關概念"}。${relation} ${
      mode === "fulltext"
        ? "因為可用內容較完整，後續可進一步抽取正式證據。"
        : "目前判斷仍以摘要為主，不應擴張到摘要未明說的內容。"
    }`,
    165,
  );
}

export function generateReadableSourceSummary(
  input: SourceSummaryInput,
): SourceSummaryResult {
  if (input.summaryMode === "reject") {
    return {
      readableSummaryZhTW:
        "此來源與目前研究主題的核心概念不符，系統建議排除，不納入主要證據。",
      summarySourceType: "reject",
      summaryConfidence: "low",
      qualityWarnings: ["此來源已被判定為不相關。"],
    };
  }

  if (input.summaryMode === "metadataFallback") {
    const lowOverlap =
      input.topicalRelevanceLabel === "low" ||
      input.topicalRelevanceLabel === "irrelevant";
    return {
      readableSummaryZhTW: lowOverlap
        ? "此來源目前僅能根據標題與基本資訊判斷，且與目前主題的核心概念重合不足，建議排除或僅作為低優先候選。"
        : "此來源目前僅提供標題與基本書目資訊，尚缺乏摘要、片段或正文內容，因此只能初步判斷其可能方向。由於證據不足，不建議直接作為主要證據。",
      summarySourceType: "metadataFallback",
      summaryConfidence: "low",
      qualityWarnings: ["目前只有標題與書目資訊，不能假設已讀過摘要或全文。"],
    };
  }

  if (input.summaryMode === "snippet") {
    return {
      readableSummaryZhTW: summarizeWithEvidenceText(
        input.sourceSnippet ?? input.sourceAbstract ?? input.sourceTitle,
        input,
        "snippet",
      ),
      summarySourceType: "snippet",
      summaryConfidence: "low",
      qualityWarnings: ["目前僅有片段資訊，尚未確認全文內容。"],
    };
  }

  if (input.summaryMode === "fulltext") {
    return {
      readableSummaryZhTW: summarizeWithEvidenceText(
        input.extractedText ?? input.sourceAbstract ?? input.sourceTitle,
        input,
        "fulltext",
      ),
      summarySourceType: "fulltext",
      summaryConfidence: "high",
      qualityWarnings: [],
    };
  }

  return {
    readableSummaryZhTW: summarizeWithEvidenceText(
      input.sourceAbstract ?? input.sourceTitle,
      input,
      "abstract",
    ),
    summarySourceType: "abstract",
    summaryConfidence: input.evidenceSufficiency === "moderate" ? "medium" : "low",
    qualityWarnings:
      input.evidenceSufficiency === "moderate"
        ? ["目前摘要整理依 abstract 判讀，不能延伸成全文結論。"]
        : [],
  };
}

export function sourceUsageRecommendation(
  topical: TopicalRelevanceResult,
  sufficiency: EvidenceSufficiencyResult,
): SourceUsageRecommendation {
  if (
    topical.topicalRelevanceLabel === "irrelevant" ||
    sufficiency.summaryMode === "reject"
  ) {
    return "exclude";
  }
  if (
    topical.topicalRelevanceLabel === "high" &&
    (sufficiency.evidenceSufficiency === "strong" ||
      sufficiency.evidenceSufficiency === "moderate") &&
    (sufficiency.summaryMode === "fulltext" ||
      sufficiency.summaryMode === "abstract")
  ) {
    return "primary";
  }
  if (sufficiency.usableAsSecondaryEvidence) {
    return "secondary";
  }
  return "reference";
}

export function evaluateSourceQuality(
  source: SourceRecord,
  confirmedTopic: string,
): SourceQualityEvaluation {
  const anchorProfile = buildTopicAnchorProfile(confirmedTopic);
  const topical = evaluateTopicalRelevance({
    confirmedTopic,
    domain: anchorProfile.domain,
    anchorConcepts: anchorProfile.anchorConcepts,
    applicationConcepts: anchorProfile.applicationConcepts,
    exclusionTerms: anchorProfile.exclusionTerms,
    sourceTitle: source.title,
    sourceAbstract: source.abstract,
    sourceSnippet: source.snippet,
    sourceKeywords: source.matchedTerms ?? source.matchedFacets ?? [],
    sourceVenue: source.containerTitle ?? source.publisher,
    sourceType: source.sourceType,
    sourceLanguage: source.sourceLanguage ?? source.language,
  });
  const sufficiency = evaluateEvidenceSufficiency({
    sourceTitle: source.title,
    sourceAbstract: source.abstract,
    sourceSnippet: source.snippet,
    extractedText: source.extractedText,
    sourceType: source.sourceType,
    sourceLanguage: source.sourceLanguage ?? source.language,
    topicalRelevanceLabel: topical.topicalRelevanceLabel,
    shouldRejectImmediately: topical.shouldRejectImmediately,
  });
  const summary = generateReadableSourceSummary({
    confirmedTopic,
    sourceTitle: source.title,
    sourceUrl: source.url,
    sourceType: source.sourceType,
    sourceLanguage: source.sourceLanguage ?? source.language,
    sourceAbstract: source.abstract,
    sourceSnippet: source.snippet,
    extractedText: source.extractedText,
    topicalRelevanceLabel: topical.topicalRelevanceLabel,
    topicalRelevanceScore: topical.topicalRelevanceScore,
    relevanceReasonZhTW: topical.relevanceReasonZhTW,
    evidenceSufficiency: sufficiency.evidenceSufficiency,
    summaryMode: sufficiency.summaryMode,
    matchedAnchorConcepts: topical.matchedAnchorConcepts,
    matchedApplicationConcepts: topical.matchedApplicationConcepts,
  });

  return {
    anchorProfile,
    topical,
    sufficiency,
    summary,
    usageRecommendation: sourceUsageRecommendation(topical, sufficiency),
  };
}
