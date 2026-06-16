import type { SourceRecord } from "./sourceRecords.ts";

export interface SourceAuthorityProfile {
  score: number;
  level: "high" | "medium" | "check" | "insufficient_summary" | "low_relevance";
  label: string;
  badges: string[];
}

export interface SourceLanguageProfile {
  language: "zh-TW" | "zh-CN" | "en" | "other" | "unknown";
  label: string;
  shouldConvertToZhTw: boolean;
  isSimplifiedChinese: boolean;
}

const SIMPLIFIED_TO_TRADITIONAL: Record<string, string> = {
  研究报告: "研究報告",
  综述: "綜述",
  数据: "資料",
  调查: "調查",
  实验: "實驗",
  结果: "結果",
  发现: "發現",
  影响: "影響",
  健康影响: "健康影響",
  气候变化: "氣候變遷",
  全球变暖: "全球暖化",
  温室气体: "溫室氣體",
  化石燃料: "化石燃料",
  排放量: "排放量",
  糖摄入: "糖攝取",
  咖啡因摄入: "咖啡因攝取",
  饮用习惯: "飲用習慣",
  相关: "相關",
  建议: "建議",
};

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sourceText(source: SourceRecord): string {
  return [
    source.title,
    source.abstract,
    source.publisher,
    source.containerTitle,
    source.sourceCategory,
    source.sourceType,
    source.url,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function sourceHost(source: SourceRecord): string {
  if (!source.url) return "";
  try {
    return new URL(source.url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceHasUsableAbstract(source: SourceRecord): boolean {
  return cleanText(source.abstract).length >= 24;
}

function authorityScore(source: SourceRecord): number {
  const text = sourceText(source).toLowerCase();
  const host = sourceHost(source);
  let score = 0;

  if (source.doi) score += 4;
  if (typeof source.year === "number") score += source.year >= 2018 ? 2 : 1;
  if (sourceHasUsableAbstract(source)) score += 2;
  if (source.authors.length > 0) score += 1;
  if (source.containerTitle) score += 1;
  if (source.sourceCategory === "academic_paper" || source.sourceCategory === "journal_article") score += 3;
  if (source.sourceCategory === "government_or_institution") score += 3;
  if (/systematic review|meta-analysis|review|journal|pubmed|crossref|semantic scholar|openalex|doi/.test(text)) score += 2;
  if (/\.gov(\.|$)|gov\.tw$|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$|unesco\.org$/.test(host)) score += 4;
  if (/\.edu(\.|$)|university|college|大學|學院|研究院|醫院|醫學中心|research institute/.test(`${host} ${text}`)) score += 3;
  if (/news|blog|content farm|行銷|廣告|招生|推介/.test(text)) score -= 3;
  if (source.relevanceLevel === "low" || source.relevanceLevel === "off_topic" || source.relevanceLevel === "clue") score -= 4;

  return score;
}

export function sourceAuthorityScore(source: SourceRecord): number {
  return authorityScore(source);
}

export function sourceAuthorityProfile(source: SourceRecord): SourceAuthorityProfile {
  const score = sourceAuthorityScore(source);
  const hasSummary = sourceHasUsableAbstract(source);
  const lowRelevance = source.relevanceLevel === "low" || source.relevanceLevel === "off_topic" || source.relevanceLevel === "clue";

  if (lowRelevance) {
    return {
      score,
      level: "low_relevance",
      label: "低相關，已降權",
      badges: ["低相關，已降權"],
    };
  }

  if (!hasSummary) {
    return {
      score,
      level: "insufficient_summary",
      label: "摘要不足",
      badges: ["摘要不足"],
    };
  }

  if (score >= 10) {
    return {
      score,
      level: "high",
      label: "權威性高",
      badges: ["權威性高"],
    };
  }

  if (score >= 6) {
    return {
      score,
      level: "medium",
      label: "權威性中",
      badges: ["權威性中"],
    };
  }

  return {
    score,
    level: "check",
    label: "權威性待確認",
    badges: ["權威性待確認"],
  };
}

export function sourceLanguageProfile(source: SourceRecord): SourceLanguageProfile {
  const text = sourceText(source);
  const simplifiedSignals = /研究报告|综述|数据|调查|实验|结果|发现|影响|气候变化|全球变暖|温室气体|建议/.test(text);
  const traditionalSignals = /研究報告|綜述|資料|調查|實驗|結果|發現|影響|氣候變遷|全球暖化|溫室氣體|建議/.test(text);
  const englishSignals = /[a-z]{4,}/i.test(text);

  if (simplifiedSignals && !traditionalSignals) {
    return {
      language: "zh-CN",
      label: "簡中來源",
      shouldConvertToZhTw: true,
      isSimplifiedChinese: true,
    };
  }

  if (traditionalSignals) {
    return {
      language: "zh-TW",
      label: "繁中來源",
      shouldConvertToZhTw: false,
      isSimplifiedChinese: false,
    };
  }

  if (englishSignals) {
    return {
      language: "en",
      label: "英文來源",
      shouldConvertToZhTw: true,
      isSimplifiedChinese: false,
    };
  }

  return {
    language: "unknown",
    label: "來源語言待確認",
    shouldConvertToZhTw: true,
    isSimplifiedChinese: false,
  };
}

export function sourceDisplayLanguageLabel(source: SourceRecord): string {
  return sourceLanguageProfile(source).label;
}

export function normalizeDisplayTextToZhTw(text: string): string {
  let normalized = cleanText(text);
  for (const [simplified, traditional] of Object.entries(SIMPLIFIED_TO_TRADITIONAL)) {
    normalized = normalized.replaceAll(simplified, traditional);
  }
  return normalized;
}

export function applySourceAuthorityAndLanguage(sources: SourceRecord[]): SourceRecord[] {
  return sources.map((source) => {
    const authority = sourceAuthorityProfile(source);
    const language = sourceLanguageProfile(source);
    return {
      ...source,
      authorityLevel: authority.level,
      authorityScore: authority.score,
      authorityLabel: authority.label,
      sourceLanguage: language.language,
      sourceLanguageLabel: language.label,
      abstract: source.abstract ? normalizeDisplayTextToZhTw(source.abstract) : source.abstract,
    };
  });
}
