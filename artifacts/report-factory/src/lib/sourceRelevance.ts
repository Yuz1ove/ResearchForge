import type { SourceRecord } from "./sourceRecords.ts";

export interface SourceIntentProfile {
  coreConcepts: string[];
  researchVariables: string[];
  requiredConceptGroups: string[][];
  usefulContextTerms: string[];
  excludeTerms: string[];
}

export interface SourceRelevanceAssessment {
  relevanceLevel: "high" | "medium" | "low" | "off_topic";
  relevanceScore: number;
  reasons: string[];
  matchedCoreConcepts: string[];
  missingCoreConcepts: string[];
  shouldShowInMainList: boolean;
  shouldRecommendAccept: boolean;
}

const DEFAULT_PROFILE: SourceIntentProfile = {
  coreConcepts: [],
  researchVariables: [],
  requiredConceptGroups: [],
  usefulContextTerms: [],
  excludeTerms: [],
};

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function textForSource(source: SourceRecord): string {
  return [
    source.title,
    source.abstract,
    source.publisher,
    source.containerTitle,
    source.sourceCategory,
    source.sourceType,
    source.doi,
    source.url,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
}

function textContains(text: string, term: string): boolean {
  const cleaned = cleanText(term);
  if (!cleaned) return false;
  return text.includes(cleaned);
}

function matchTerms(text: string, terms: string[]): string[] {
  return unique(terms.filter((term) => textContains(text, term)));
}

function matchedConceptGroups(text: string, groups: string[][]): string[][] {
  return groups.filter((group) => group.some((term) => textContains(text, term)));
}

function sourceHasAbstract(source: SourceRecord): boolean {
  return cleanText(source.abstract).length >= 24;
}

function authoritySignal(source: SourceRecord): number {
  const text = textForSource(source);
  const host = source.url ? (() => {
    try {
      return new URL(source.url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  })() : "";

  let score = 0;
  if (source.doi) score += 2;
  if (source.year) score += 1;
  if (source.abstract) score += 1;
  if (/\.gov(\.|$)|\.edu(\.|$)|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$/.test(host)) score += 2;
  if (/crossref|semantic scholar|openalex|pubmed|doi|scopus|web of science/.test(text)) score += 1;
  if (/journal|review|systematic review|meta-analysis|期刊|論文|研究|政府|機構|大學|醫院|研究院/.test(text)) score += 1;
  return score;
}

function sourceAuthorityScore(source: SourceRecord): number {
  const authority = authoritySignal(source);
  const category = source.sourceCategory ?? "";
  if (category === "government_or_institution") return authority + 2;
  if (category === "academic_paper" || category === "journal_article") return authority + 1;
  return authority;
}

function inferLevel(score: number, matchedCoreCount: number, hasAbstract: boolean, hasExclusion: boolean, requiredGroupHits: number): "high" | "medium" | "low" | "off_topic" {
  if (hasExclusion) return "off_topic";
  if (matchedCoreCount === 0 && requiredGroupHits === 0) return "low";
  if (matchedCoreCount >= 2 && requiredGroupHits > 0 && hasAbstract && score >= 15) return "high";
  if (matchedCoreCount >= 1 || requiredGroupHits > 0 || hasAbstract) return "medium";
  return "low";
}

function relatedReasonText(level: SourceRelevanceAssessment["relevanceLevel"], matches: string[], missing: string[], hasAbstract: boolean, authority: number): string[] {
  const reasons: string[] = [];
  if (matches.length) reasons.push(`命中核心概念：${matches.slice(0, 4).join("、")}`);
  if (missing.length) reasons.push(`尚未命中核心概念：${missing.slice(0, 4).join("、")}`);
  if (!hasAbstract) reasons.push("摘要不足，需先開啟原文確認");
  if (authority >= 12) reasons.push("權威性高");
  else if (authority >= 8) reasons.push("權威性中");
  else reasons.push("權威性待確認");
  if (level === "off_topic") reasons.unshift("明顯與主題無關");
  return reasons;
}

export function buildSourceRelevanceAssessment(
  source: SourceRecord,
  profile: SourceIntentProfile = DEFAULT_PROFILE,
): SourceRelevanceAssessment {
  const text = textForSource(source);
  const coreConcepts = unique(profile.coreConcepts);
  const researchVariables = unique(profile.researchVariables);
  const usefulContextTerms = unique(profile.usefulContextTerms);
  const excludeTerms = unique(profile.excludeTerms);
  const matchedCoreConcepts = matchTerms(text, coreConcepts);
  const missingCoreConcepts = coreConcepts.filter((term) => !matchedCoreConcepts.includes(term));
  const matchedVariables = matchTerms(text, researchVariables);
  const matchedContext = matchTerms(text, usefulContextTerms);
  const matchedExclusions = matchTerms(text, excludeTerms);
  const requiredGroupHits = matchedConceptGroups(text, profile.requiredConceptGroups).length;
  const hasAbstract = sourceHasAbstract(source);
  const authority = sourceAuthorityScore(source);

  const rawScore =
    matchedCoreConcepts.length * 8 +
    matchedVariables.length * 4 +
    matchedContext.length * 2 +
    authority +
    (hasAbstract ? 2 : 0) -
    matchedExclusions.length * 8;

  const relevanceLevel = inferLevel(
    rawScore,
    matchedCoreConcepts.length,
    hasAbstract,
    matchedExclusions.length > 0,
    requiredGroupHits,
  );

  const shouldShowInMainList = relevanceLevel === "high" || relevanceLevel === "medium";
  const shouldRecommendAccept = relevanceLevel === "high" && hasAbstract && matchedExclusions.length === 0;

  return {
    relevanceLevel,
    relevanceScore: rawScore,
    reasons: relatedReasonText(relevanceLevel, matchedCoreConcepts, missingCoreConcepts, hasAbstract, authority),
    matchedCoreConcepts,
    missingCoreConcepts,
    shouldShowInMainList,
    shouldRecommendAccept,
  };
}

export function applySourceRelevanceAssessments(
  sources: SourceRecord[],
  topic: string,
): SourceRecord[] {
  const profile = buildSourceIntentProfile(topic);
  return sources.map((source) => {
    const assessment = buildSourceRelevanceAssessment(source, profile);
    return {
      ...source,
      relevanceLevel: assessment.relevanceLevel,
      relevanceScore: assessment.relevanceScore,
      relevanceReasons: assessment.reasons,
      matchedCoreConcepts: assessment.matchedCoreConcepts,
      missingCoreConcepts: assessment.missingCoreConcepts,
      shouldShowInMainList: assessment.shouldShowInMainList,
      shouldRecommendAccept: assessment.shouldRecommendAccept,
    };
  });
}

export function buildSourceIntentProfile(topic: string): SourceIntentProfile {
  const normalized = cleanText(topic);

  if (/可樂|cola|soda|soft drink|sugar-sweetened beverage|含糖飲料|碳酸飲料|汽水/.test(normalized)) {
    return {
      coreConcepts: ["cola", "soda", "soft drink", "sugar-sweetened beverage", "含糖飲料", "可樂", "碳酸飲料", "sugar", "caffeine", "health"],
      researchVariables: ["consumption", "intake", "drinking habits", "攝取習慣", "飲用習慣", "sugar", "caffeine", "obesity", "metabolic health", "dental caries"],
      requiredConceptGroups: [
        ["cola", "soda", "soft drink", "sugar-sweetened beverage", "含糖飲料", "可樂", "碳酸飲料"],
        ["sugar", "caffeine", "health", "obesity", "metabolic health", "dental caries", "糖分", "咖啡因", "健康"],
      ],
      usefulContextTerms: ["adolescents", "students", "systematic review", "review", "survey", "臨床", "研究"],
      excludeTerms: ["招生", "高考", "工程管理", "圖書館推介", "職業教育", "成人高考", "北京話變調", "耶路撒冷"],
    };
  }

  if (/氣候變遷|全球暖化|溫室氣體|climate change|global warming|greenhouse gas/.test(normalized)) {
    return {
      coreConcepts: ["climate change", "global warming", "greenhouse gas", "溫室氣體", "氣候變遷", "全球暖化", "fossil fuel", "化石燃料", "emissions", "排放"],
      researchVariables: ["industrialization", "land use", "deforestation", "anthropogenic", "carbon dioxide", "methane", "工業化", "土地利用", "森林砍伐", "人為活動"],
      requiredConceptGroups: [
        ["climate change", "global warming", "氣候變遷", "全球暖化"],
        ["greenhouse gas", "fossil fuel", "溫室氣體", "化石燃料", "emissions", "排放"],
      ],
      usefulContextTerms: ["review", "systematic review", "IPCC", "government", "university", "study", "research", "大學", "政府"],
      excludeTerms: ["北京話變調", "耶路撒冷", "宗教稱號", "招生", "圖書館推薦", "成人高考"],
    };
  }

  if (/短影音|short[- ]?video|tiktok|social media|注意力|睡眠|sleep/.test(normalized)) {
    return {
      coreConcepts: ["short-form video", "short video", "TikTok", "social media", "digital media", "短影音", "睡眠", "注意力", "adolescents"],
      researchVariables: ["attention", "sleep", "sleep quality", "screen time", "cognitive control", "daytime sleepiness", "專注", "睡眠品質", "使用時間"],
      requiredConceptGroups: [
        ["short-form video", "short video", "TikTok", "短影音"],
        ["attention", "sleep", "sleep quality", "睡眠", "注意力"],
      ],
      usefulContextTerms: ["students", "adolescents", "high school", "secondary school", "高中生", "青少年"],
      excludeTerms: ["教育行政", "招生", "圖書館", "工程管理"],
    };
  }

  return {
    coreConcepts: normalized ? [normalized] : [],
    researchVariables: [],
    requiredConceptGroups: normalized ? [[normalized]] : [],
    usefulContextTerms: ["review", "systematic review", "research"],
    excludeTerms: [],
  };
}
