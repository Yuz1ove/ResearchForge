import type { SourceRecord } from "./sourceRecords.ts";
import {
  buildSourceEvidenceProfile,
  type EvidenceGrounding,
} from "./sourceEvidence.ts";
import {
  buildTopicFacets,
  type TopicFacets,
} from "./topicFacets.ts";

export interface SourceIntentProfile {
  coreConcepts: string[];
  researchVariables: string[];
  requiredConceptGroups: string[][];
  usefulContextTerms: string[];
  excludeTerms: string[];
}

export type SourceFacetRelevanceLevel = "primary" | "secondary" | "clue" | "low" | "off_topic";

export interface SourceFacetAssessment {
  relevanceLevel: SourceFacetRelevanceLevel;
  relevanceScore: number;
  matchedFacets: string[];
  missingRequiredFacets: string[];
  evidenceGrounding: EvidenceGrounding;
  reasonZhTw: string;
  shouldShowInMainList: boolean;
  shouldRecommendAccept: boolean;
}

export interface SourceRelevanceAssessment extends SourceFacetAssessment {
  reasons: string[];
  matchedCoreConcepts: string[];
  missingCoreConcepts: string[];
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
  if (/\.gov(\.|$)|\.edu(\.|$)|who\.int$|un\.org$|oecd\.org$|worldbank\.org$|europa\.eu$|ipcc\.ch$|wmo\.int$|nasa\.gov$|noaa\.gov$/.test(host)) score += 3;
  if (/crossref|semantic scholar|openalex|pubmed|doi|scopus|web of science|ipcc|wmo|nasa|noaa/.test(text)) score += 1;
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

function matchedTopicCore(text: string, facets: TopicFacets): string[] {
  return matchTerms(text, facets.topicCore);
}

function matchedRequiredFacetLabels(text: string, facets: TopicFacets): string[] {
  return facets.requiredFacets
    .filter((facet) => matchTerms(text, facet.terms).length > 0)
    .map((facet) => facet.labelZhTw);
}

function matchedSecondaryFacetLabels(text: string, facets: TopicFacets): string[] {
  return facets.secondaryFacets
    .filter((facet) => matchTerms(text, facet.terms).length > 0)
    .map((facet) => facet.labelZhTw);
}

function hasDowngradingSecondaryFacet(text: string, facets: TopicFacets): boolean {
  const downgradeFacetIds = new Set(["adaptation", "policy", "finance", "local_case", "ecological_effects"]);
  return facets.secondaryFacets.some((facet) =>
    downgradeFacetIds.has(facet.id) && matchTerms(text, facet.terms).length > 0
  );
}

function matchedDowngradeTerms(text: string, facets: TopicFacets): string[] {
  return matchTerms(text, facets.excludeOrDowngrade);
}

function sourceLooksExtremelySpecificFromTitle(source: SourceRecord, facets: TopicFacets): boolean {
  const title = cleanText(source.title);
  if (!title) return false;
  return matchedTopicCore(title, facets).length > 0
    && matchedRequiredFacetLabels(title, facets).length > 0
    && matchedSecondaryFacetLabels(title, facets).length === 0;
}

function inferFacetLevel(input: {
  hasCore: boolean;
  requiredHits: number;
  secondaryHits: number;
  downgradeHits: number;
  hasDowngradingSecondary: boolean;
  hasEvidence: boolean;
  hasAbstract: boolean;
  titleSpecific: boolean;
}): SourceFacetRelevanceLevel {
  if (!input.hasCore && input.requiredHits === 0) return "off_topic";
  if (input.downgradeHits > 0 && input.requiredHits === 0) return "low";
  if (input.hasCore && input.requiredHits > 0 && input.hasDowngradingSecondary) return "secondary";
  if (input.hasCore && input.requiredHits > 0 && input.hasEvidence) return "primary";
  if (input.titleSpecific && !input.hasAbstract) return "clue";
  if (input.hasCore && input.secondaryHits > 0 && input.requiredHits === 0) return "secondary";
  if (input.hasCore && input.secondaryHits > 0) return "secondary";
  if (input.hasCore && input.requiredHits > 0 && !input.hasEvidence) return "clue";
  if (input.hasCore) return "low";
  return "off_topic";
}

function reasonForLevel(
  level: SourceFacetRelevanceLevel,
  matchedRequired: string[],
  matchedSecondary: string[],
  grounding: EvidenceGrounding,
): string {
  if (level === "primary") {
    return `直接命中${matchedRequired.join("、")}，且有可驗證摘要片段可支撐主題。`;
  }
  if (level === "secondary") {
    return matchedSecondary.length
      ? `主要落在${matchedSecondary.join("、")}，可作延伸資料，不適合作為成因/現況主證據。`
      : "與主題有部分關聯，但尚未直接回答必要面向。";
  }
  if (level === "clue") {
    return grounding === "metadata_only"
      ? "摘要不足：題名看似相關，但目前只有 metadata；需開啟原文確認後才能採用。"
      : "摘要不足：有初步線索，但可驗證片段不足，需先確認原文。";
  }
  if (level === "low") {
    return "只命中主題詞或延伸面向，未能回答研究主題的必要面向。";
  }
  return "明顯與研究主題無關。";
}

export function buildSourceFacetAssessment(
  source: SourceRecord,
  topicFacets: TopicFacets,
): SourceFacetAssessment {
  const text = textForSource(source);
  const coreHits = matchedTopicCore(text, topicFacets);
  const requiredHits = matchedRequiredFacetLabels(text, topicFacets);
  const secondaryHits = matchedSecondaryFacetLabels(text, topicFacets);
  const downgradeHits = matchedDowngradeTerms(text, topicFacets);
  const downgradingSecondary = hasDowngradingSecondaryFacet(cleanText(source.title), topicFacets);
  const evidenceProfile = buildSourceEvidenceProfile(source, topicFacets);
  const hasAbstract = sourceHasAbstract(source);
  const titleSpecific = sourceLooksExtremelySpecificFromTitle(source, topicFacets);
  const relevanceLevel = inferFacetLevel({
    hasCore: coreHits.length > 0,
    requiredHits: requiredHits.length,
    secondaryHits: secondaryHits.length,
    downgradeHits: downgradeHits.length,
    hasDowngradingSecondary: downgradingSecondary,
    hasEvidence: evidenceProfile.hasRequiredEvidence,
    hasAbstract,
    titleSpecific,
  });
  const authority = sourceAuthorityScore(source);
  const relevanceScore =
    coreHits.length * 10
    + requiredHits.length * 18
    + secondaryHits.length * 6
    + authority
    + evidenceProfile.snippetScore
    + evidenceProfile.directSnippetCount * 14
    + (evidenceProfile.hasRequiredEvidence ? 12 : 0)
    + (hasAbstract ? 3 : 0)
    - downgradeHits.length * 10
    - (relevanceLevel === "off_topic" ? 20 : 0);
  const missingRequiredFacets = topicFacets.requiredFacets
    .map((facet) => facet.labelZhTw)
    .filter((label) => !requiredHits.includes(label));
  const shouldShowInMainList = relevanceLevel === "primary";
  const shouldRecommendAccept = relevanceLevel === "primary"
    && evidenceProfile.evidenceSnippets.length > 0
    && (evidenceProfile.groundingStatus === "abstract_grounded" || evidenceProfile.groundingStatus === "snippet_grounded");

  return {
    relevanceLevel,
    relevanceScore,
    matchedFacets: unique([...requiredHits, ...secondaryHits]),
    missingRequiredFacets,
    evidenceGrounding: evidenceProfile.groundingStatus,
    reasonZhTw: reasonForLevel(
      relevanceLevel,
      requiredHits,
      secondaryHits,
      evidenceProfile.groundingStatus,
    ),
    shouldShowInMainList,
    shouldRecommendAccept,
  };
}

function legacyProfileAssessment(
  source: SourceRecord,
  profile: SourceIntentProfile,
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
  const isOffTopic = matchedExclusions.length > 0;
  const isPrimary = matchedCoreConcepts.length >= 2 && requiredGroupHits > 0 && hasAbstract && !isOffTopic;
  const relevanceLevel: SourceFacetRelevanceLevel = isOffTopic
    ? "off_topic"
    : isPrimary
      ? "primary"
      : matchedCoreConcepts.length > 0 || requiredGroupHits > 0
        ? hasAbstract
          ? "secondary"
          : "clue"
        : "low";
  const rawScore =
    matchedCoreConcepts.length * 8 +
    matchedVariables.length * 4 +
    matchedContext.length * 2 +
    authority +
    (hasAbstract ? 2 : 0) -
    matchedExclusions.length * 8;
  const reasons = [
    matchedCoreConcepts.length ? `命中核心概念：${matchedCoreConcepts.slice(0, 4).join("、")}` : null,
    missingCoreConcepts.length ? `尚未命中核心概念：${missingCoreConcepts.slice(0, 4).join("、")}` : null,
    !hasAbstract ? "摘要不足，需先開啟原文確認" : null,
    relevanceLevel === "off_topic" ? "明顯與主題無關" : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    relevanceLevel,
    relevanceScore: rawScore,
    reasons,
    matchedCoreConcepts,
    missingCoreConcepts,
    matchedFacets: matchedCoreConcepts,
    missingRequiredFacets: missingCoreConcepts,
    evidenceGrounding: hasAbstract ? "abstract_grounded" : "metadata_only",
    reasonZhTw: reasons[0] ?? "來源相關性待確認。",
    shouldShowInMainList: relevanceLevel === "primary" || relevanceLevel === "secondary" || relevanceLevel === "clue",
    shouldRecommendAccept: relevanceLevel === "primary" && hasAbstract && matchedExclusions.length === 0,
  };
}

export function buildSourceRelevanceAssessment(
  source: SourceRecord,
  profile: SourceIntentProfile = DEFAULT_PROFILE,
): SourceRelevanceAssessment {
  const topicCore = profile.coreConcepts;
  const climateLike = topicCore.some((term) => /氣候變遷|全球暖化|climate change|global warming|greenhouse gas|溫室氣體/.test(cleanText(term)));

  if (climateLike) {
    const facets = buildTopicFacets(topicCore.join(" "));
    const facetAssessment = buildSourceFacetAssessment(source, facets);
    const text = textForSource(source);
    const matchedCoreConcepts = matchedTopicCore(text, facets);
    const missingCoreConcepts = facets.topicCore.filter((term) => !matchedCoreConcepts.includes(term));
    return {
      ...facetAssessment,
      reasons: [facetAssessment.reasonZhTw],
      matchedCoreConcepts,
      missingCoreConcepts,
    };
  }

  return legacyProfileAssessment(source, profile);
}

export function applySourceRelevanceAssessments(
  sources: SourceRecord[],
  topic: string,
): SourceRecord[] {
  const topicFacets = buildTopicFacets(topic);
  const profile = buildSourceIntentProfile(topic);
  const useFacetAssessment = topicFacets.requiredFacets.length > 0;

  return sources.map((source) => {
    const assessment = (() => {
      if (!useFacetAssessment) return buildSourceRelevanceAssessment(source, profile);
      const facetAssessment = buildSourceFacetAssessment(source, topicFacets);
      const sourceText = textForSource(source);
      const coreMatches = matchedTopicCore(sourceText, topicFacets);
      return {
        ...facetAssessment,
        reasons: [facetAssessment.reasonZhTw],
        matchedCoreConcepts: coreMatches,
        missingCoreConcepts: topicFacets.topicCore.filter((term) => !coreMatches.includes(term)),
      };
    })();

    const evidenceProfile = useFacetAssessment ? buildSourceEvidenceProfile(source, topicFacets) : null;

    return {
      ...source,
      relevanceLevel: assessment.relevanceLevel,
      relevanceScore: assessment.relevanceScore,
      relevanceReasons: assessment.reasons,
      matchedCoreConcepts: assessment.matchedCoreConcepts,
      missingCoreConcepts: assessment.missingCoreConcepts,
      evidenceGrounding: assessment.evidenceGrounding,
      matchedFacets: assessment.matchedFacets,
      missingRequiredFacets: assessment.missingRequiredFacets,
      sourceRelevanceReasonZhTw: assessment.reasonZhTw,
      shouldShowInMainList: assessment.shouldShowInMainList,
      shouldRecommendAccept: assessment.shouldRecommendAccept,
      mainEvidenceFacet: evidenceProfile?.mainEvidenceFacet ?? null,
      evidenceSummaryZhTw: evidenceProfile?.summaryZhTw ?? null,
      evidenceSnippets: evidenceProfile?.evidenceSnippets ?? null,
      evidenceChain: evidenceProfile?.evidenceChain ?? null,
    };
  }).sort((a, b) => {
    const scoreDelta = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    const levelRank: Record<SourceFacetRelevanceLevel, number> = {
      primary: 5,
      secondary: 4,
      clue: 3,
      low: 2,
      off_topic: 1,
    };
    const levelA = (a.relevanceLevel ?? "off_topic") as SourceFacetRelevanceLevel;
    const levelB = (b.relevanceLevel ?? "off_topic") as SourceFacetRelevanceLevel;
    return levelRank[levelB] - levelRank[levelA];
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
    const facets = buildTopicFacets(topic);
    return {
      coreConcepts: facets.topicCore,
      researchVariables: facets.requiredFacets.flatMap((facet) => facet.terms),
      requiredConceptGroups: [
        facets.topicCore,
        ...facets.requiredFacets.map((facet) => facet.terms),
      ],
      usefulContextTerms: ["review", "systematic review", "IPCC", "WMO", "NASA", "NOAA", "government", "university", "study", "research", "大學", "政府"],
      excludeTerms: facets.excludeOrDowngrade,
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
