import type { NormalizedSource, ResearchQueryPlan } from "@workspace/api-zod/research-tools";
import type { ConceptGroup } from "@workspace/api-zod/research-grounding";

type ScoringResearchQueryPlan = ResearchQueryPlan & {
  conceptGroups?: ConceptGroup[];
};
import { normalizeTextKey } from "../normalizers/normalizeText";
import { computeSourceQualityScore } from "./sourceQualityScore";

const GENERIC_TERMS = new Set([
  "a",
  "an",
  "and",
  "applications",
  "background",
  "between",
  "by",
  "comparison",
  "conditions",
  "data",
  "effect",
  "effects",
  "evidence",
  "for",
  "from",
  "general",
  "how",
  "impact",
  "in",
  "influence",
  "limitations",
  "mechanism",
  "of",
  "on",
  "or",
  "policy",
  "report",
  "research",
  "review",
  "source",
  "sources",
  "strategies",
  "strategy",
  "study",
  "the",
  "to",
  "with",
  "作用",
  "原理",
  "受",
  "如何",
  "影響",
  "應用",
  "資料",
  "方向",
  "機制",
  "比較",
  "研究",
  "策略",
  "結果",
  "限制",
  "關係",
]);

export interface RelevanceScoreAnalysis {
  score: number;
  titleMatchScore: number;
  queryIntentMatchScore: number;
  keywordMatchScore: number;
  abstractMatchScore: number;
  domainMatchScore: number;
  sourceQualityScore: number;
  hasCoreConceptMatch: boolean;
  hasTitleCoreConceptMatch: boolean;
  matchedCoreTerms: string[];
  matchedTitleTerms: string[];
  matchedConcepts: string[];
  matchedFields: Array<"title" | "abstract" | "keywords" | "venue" | "authors" | "publisher">;
  confidenceTier: "high" | "fallback" | "rejected";
  acceptReason?: string;
  rejectionReason?: string;
}

export const RELEVANCE_SCORING_CONFIG = {
  highConfidenceThreshold: 0.35,
  fallbackThreshold: 0.18,
  titleWeight: 0.34,
  abstractWeight: 0.2,
  keywordWeight: 0.16,
  venueWeight: 0.06,
  qualityWeight: 0.16,
  multiConceptBonus: 0.16,
  subjectOutcomeBonus: 0.1,
  authoritativeTitleBonus: 0.1,
} as const;

export const TERM_BRIDGE: Record<string, string[]> = {
  泡泡: ["soap bubble", "bubble", "soap film"],
  肥皂泡: ["soap bubble", "soap bubbles"],
  肥皂膜: ["soap film", "soap films"],
  薄膜: ["thin film", "thin films"],
  薄膜干涉: ["thin film interference", "optical interference"],
  干涉: ["interference", "optical interference"],
  繞射: ["diffraction"],
  光波長: ["wavelength", "visible light wavelength"],
  光學: ["optics", "optical"],
  咖啡因: ["caffeine"],
  茶葉: ["tea leaves", "tea"],
  浸泡時間: ["steeping time", "brewing time", "infusion time"],
  萃取: ["extraction", "caffeine extraction"],
  金屬離子: ["metal ions", "metal cations"],
  金屬鹽: ["metal salts"],
  火焰顏色: ["flame color", "flame colour"],
  焰色反應: ["flame test", "flame tests"],
  焰色試驗: ["flame test", "flame tests"],
  發射光譜: ["emission spectra", "atomic emission spectra"],
  洋流: ["ocean currents", "ocean circulation"],
  海流: ["ocean currents", "marine currents"],
  黑潮: ["Kuroshio Current", "Kuroshio"],
  海域: ["waters", "marine waters"],
  生物多樣性: ["biodiversity", "marine biodiversity"],
  海洋生態: ["marine ecosystem", "marine ecology"],
  物種分布: ["species distribution"],
  光合作用: ["photosynthesis", "photosynthetic"],
  光合作用速率: ["photosynthetic rate", "photosynthesis rate"],
  光照強度: ["light intensity", "irradiance"],
  光強度: ["light intensity", "irradiance"],
  限制因子: ["limiting factors", "limiting factor"],
  睡眠品質: ["sleep quality", "sleep duration", "sleep disturbance", "insomnia"],
  心率: ["heart rate", "heart rate variability", "cardiac autonomic"],
  自律神經: ["autonomic nervous system", "sympathetic", "parasympathetic"],
  生理時鐘: ["circadian rhythm", "circadian"],
  都市空氣污染: ["urban air pollution", "ambient air pollution", "traffic pollution"],
  空氣污染: ["air pollution", "particulate matter", "pm2.5", "nitrogen dioxide", "no2"],
  兒童: ["children", "child", "pediatric", "paediatric"],
  氣喘: ["asthma", "wheezing", "respiratory health"],
  塑膠: ["plastic", "plastics", "polymer"],
  塑膠容器: ["plastic container", "plastic containers", "food contact plastic", "plastic packaging"],
  容器: ["container", "containers", "food container", "packaging"],
  加熱: ["heating", "heated", "thermal exposure", "heat treatment"],
  受熱: ["heating", "heated", "thermal", "heat"],
  釋放: ["leaching", "chemical migration", "release", "released"],
  熱裂解: ["thermal degradation", "thermal decomposition", "pyrolysis"],
  有害物質: ["harmful chemicals", "toxic chemicals", "volatile organic compounds", "voc"],
  BPA: ["bpa", "bisphenol a"],
  雙酚A: ["bpa", "bisphenol a"],
  鄰苯二甲酸酯: ["phthalates", "phthalate"],
  微塑膠: ["microplastics", "microplastic"],
  睡眠不足: ["sleep deprivation", "insufficient sleep", "sleep restriction"],
  高中生: ["high school students", "secondary school students", "adolescents"],
  注意力: ["attention", "cognitive function", "executive function"],
  學習表現: ["academic performance", "learning outcomes", "school performance"],
  藍染: ["indigo dyeing", "indigo dye", "natural dye"],
  臺灣: ["Taiwan", "Taiwanese"],
  台灣: ["Taiwan", "Taiwanese"],
  文化保存: ["cultural preservation", "cultural heritage", "heritage preservation"],
  工藝: ["traditional craft", "craftsmanship", "intangible cultural heritage"],
  生成式人工智慧: ["generative AI", "generative artificial intelligence", "large language model", "ChatGPT"],
  "生成式 AI": ["generative AI", "generative artificial intelligence", "large language model", "ChatGPT"],
  人工智慧: ["artificial intelligence", "AI"],
  寫作能力: ["writing ability", "writing skills", "writing performance"],
  寫作倫理: ["writing ethics", "AI writing ethics", "academic integrity", "plagiarism"],
  學習動機: ["learning motivation", "student motivation", "motivation to learn"],
  學術誠信: ["academic integrity", "plagiarism"],
  抗生素抗藥性: ["antibiotic resistance", "antimicrobial resistance", "drug-resistant bacteria"],
  抗藥性: ["antibiotic resistance", "antimicrobial resistance"],
  室內通風: ["indoor ventilation", "classroom ventilation", "ventilation rate"],
  通風: ["ventilation", "indoor ventilation", "air exchange"],
  二氧化碳濃度: ["carbon dioxide concentration", "CO2 concentration", "indoor CO2"],
  教室: ["classroom", "school classroom"],
  專注度: ["attention", "concentration", "cognitive performance"],
  熊貓: ["panda", "giant panda", "Ailuropoda melanoleuca", "panda Chinese terminology"],
  貓熊: ["cat-bear", "panda", "giant panda", "Chinese terminology"],
  大熊貓: ["giant panda", "Ailuropoda melanoleuca", "Ursidae"],
  小熊貓: ["red panda", "Ailurus fulgens", "Ailuridae"],
  小貓熊: ["red panda", "Ailurus fulgens", "Ailuridae"],
  名稱差異: ["terminology difference", "naming difference", "Chinese terminology"],
  命名史: ["naming history", "terminology history"],
	 };

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function normalizedTerms(value: string | null | undefined): string[] {
  const normalized = normalizeTextKey(value);
  if (!normalized) return [];

  const pieces = normalized.split(" ").filter(Boolean);
  const terms = new Set<string>();
  if (
    normalized.length >= 2 &&
    !GENERIC_TERMS.has(normalized)
  ) {
    terms.add(normalized);
  }

  for (const piece of pieces) {
    const isZh = /[\u3400-\u9fff]/u.test(piece);
    if (GENERIC_TERMS.has(piece)) continue;
    if (isZh && piece.length >= 2) {
      terms.add(piece);
      continue;
    }
    if (!isZh && piece.length >= 3) {
      terms.add(piece);
    }
  }

  for (let size = 2; size <= Math.min(3, pieces.length); size += 1) {
    for (let index = 0; index <= pieces.length - size; index += 1) {
      const phrase = pieces.slice(index, index + size).join(" ");
      if (phrase.length >= 6 && !GENERIC_TERMS.has(phrase)) {
        terms.add(phrase);
      }
    }
  }

  return [...terms];
}

function collectPlanTerms(plan: ScoringResearchQueryPlan): {
  coreTerms: string[];
  queryTerms: string[];
  domainTerms: string[];
} {
  const coreTerms = unique([
    ...normalizedTerms(plan.normalizedTopic),
    ...plan.zhQueries.flatMap((query) => normalizedTerms(query)),
    ...plan.enQueries.flatMap((query) => normalizedTerms(query)),
    ...(plan.diagnostics?.primaryConcepts ?? []).flatMap((term) => normalizedTerms(term)),
    ...(plan.diagnostics?.contextConcepts ?? []).flatMap((term) => normalizedTerms(term)),
    ...plan.researchSubtopics.flatMap((subtopic) => [
      ...normalizedTerms(subtopic.labelZh),
      ...normalizedTerms(subtopic.labelEn),
    ]),
  ]);
  const queryTerms = unique([
    ...plan.zhQueries.flatMap((query) => normalizedTerms(query)),
    ...plan.enQueries.flatMap((query) => normalizedTerms(query)),
  ]);
  return {
    coreTerms,
    queryTerms,
    domainTerms: unique([
      ...coreTerms.filter((term) => term.length >= 4),
      ...queryTerms.filter((term) => term.length >= 4),
    ]).slice(0, 24),
  };
}

function bridgeTerms(term: string): string[] {
  const normalized = term.trim();
  return TERM_BRIDGE[normalized] ?? [];
}

function conceptGroupsForPlan(plan: ScoringResearchQueryPlan): ConceptGroup[] {
  if (Array.isArray(plan.conceptGroups) && plan.conceptGroups.length > 0) {
    return plan.conceptGroups;
  }

  const rawTerms = unique([
    ...normalizedTerms(plan.normalizedTopic),
    ...(plan.diagnostics?.primaryConcepts ?? []),
    ...(plan.diagnostics?.contextConcepts ?? []),
    ...plan.researchSubtopics.flatMap((subtopic) => [
      subtopic.labelZh,
      subtopic.labelEn ?? "",
    ]),
  ]).filter((term) => !GENERIC_TERMS.has(term));

  const groups = rawTerms.slice(0, 14).map((term, index) => {
    const zhTerms = /[\u3400-\u9fff]/u.test(term) ? [term] : [];
    const enTerms = /[A-Za-z]/.test(term) ? [term] : [];
    return {
      name: term,
      zhTerms,
      enTerms: unique([...enTerms, ...bridgeTerms(term)]),
      weight: index < 4 ? 1 : 0.7,
    };
  });

  return groups.length > 0
    ? groups
    : [
        {
          name: plan.normalizedTopic,
          zhTerms: normalizedTerms(plan.normalizedTopic).filter((term) => /[\u3400-\u9fff]/u.test(term)),
          enTerms: plan.enQueries.flatMap((query) => normalizedTerms(query)).slice(0, 8),
          weight: 1,
        },
      ];
}

function matchedTerms(text: string, terms: string[]): string[] {
  return unique(
    terms.filter((term) => {
      const normalized = normalizeTextKey(term);
      return normalized && text.includes(normalized);
    }),
  );
}

function fieldMatches(
  fields: Record<"title" | "abstract" | "keywords" | "venue" | "authors" | "publisher", string>,
  terms: string[],
): Array<"title" | "abstract" | "keywords" | "venue" | "authors" | "publisher"> {
  const matched: Array<"title" | "abstract" | "keywords" | "venue" | "authors" | "publisher"> = [];
  for (const [field, text] of Object.entries(fields) as Array<[keyof typeof fields, string]>) {
    if (matchedTerms(text, terms).length > 0) matched.push(field);
  }
  return matched;
}

function coverageScore(matches: string[], terms: string[], floor = 0): number {
  if (terms.length === 0) return floor;
  return Math.max(floor, Math.min(1, matches.length / Math.min(terms.length, 8)));
}

function blendMissingAbstract(titleScore: number, queryScore: number): number {
  if (titleScore <= 0 && queryScore <= 0) return 0;
  return Math.min(0.55, titleScore * 0.7 + queryScore * 0.3);
}

export function analyzeRelevanceScore(
  source: NormalizedSource,
  plan: ScoringResearchQueryPlan,
): RelevanceScoreAnalysis {
  const upstreamScore =
    typeof source.relevanceScore === "number"
      ? Math.max(0, Math.min(1, source.relevanceScore / 100))
      : null;

  const titleText = normalizeTextKey(source.title);
  const abstractText = normalizeTextKey(source.abstract ?? "");
  const keywordText = normalizeTextKey((source.keywords ?? []).join(" "));
  const venueText = normalizeTextKey(source.venue ?? "");
  const authorsText = normalizeTextKey(source.authors.join(" "));
  const publisherText = normalizeTextKey(source.publisher ?? "");
  const queryUsedText = normalizeTextKey(source.queryUsed);
  const domainText = normalizeTextKey(
    [source.title, source.abstract ?? "", source.venue ?? "", source.publisher ?? ""].join(" "),
  );
  const anyText = normalizeTextKey(
    [
      source.title,
      source.abstract ?? "",
      (source.keywords ?? []).join(" "),
      source.venue ?? "",
      source.publisher ?? "",
    ].join(" "),
  );
  if (!anyText) {
    return {
      score: 0,
      titleMatchScore: 0,
      queryIntentMatchScore: 0,
      keywordMatchScore: 0,
      abstractMatchScore: 0,
      domainMatchScore: 0,
      sourceQualityScore: 0,
      hasCoreConceptMatch: false,
      hasTitleCoreConceptMatch: false,
      matchedCoreTerms: [],
      matchedTitleTerms: [],
      matchedConcepts: [],
      matchedFields: [],
      confidenceTier: "rejected",
      rejectionReason: "invalid_metadata",
    };
  }

  const { coreTerms, queryTerms, domainTerms } = collectPlanTerms(plan);
  const conceptGroups = conceptGroupsForPlan(plan);
  const fields = {
    title: titleText,
    abstract: abstractText,
    keywords: keywordText,
    venue: venueText,
    authors: authorsText,
    publisher: publisherText,
  };
  const matchedConceptGroups = conceptGroups
    .map((group) => {
      const terms = unique([
        ...group.zhTerms.flatMap((term) => normalizedTerms(term)),
        ...group.enTerms.flatMap((term) => normalizedTerms(term)),
      ]);
      const matched = fieldMatches(fields, terms);
      return { group, matched };
    })
    .filter((item) => item.matched.length > 0);
  const matchedConcepts = matchedConceptGroups.map((item) => item.group.name);
  const matchedFields = unique(matchedConceptGroups.flatMap((item) => item.matched));
  const matchedCoreTerms = matchedTerms(anyText, coreTerms);
  const matchedTitleTerms = matchedTerms(titleText, coreTerms);
  const matchedQueryTerms = matchedTerms(queryUsedText, queryTerms);
  const matchedKeywordTerms = matchedTerms(keywordText, coreTerms);
  const matchedAbstractTerms = matchedTerms(abstractText, coreTerms);
  const matchedDomainTerms = matchedTerms(domainText, domainTerms);
  const driftHits = matchedTerms(anyText, plan.excludedDriftTerms).length;
  const sourceQualityScore = Math.max(
    0,
    Math.min(1, computeSourceQualityScore(source) / 100),
  );

  const titleMatchScore = coverageScore(matchedTitleTerms, coreTerms);
  const queryIntentMatchScore =
    queryUsedText.length > 0
      ? coverageScore(matchedQueryTerms, queryTerms, titleMatchScore > 0 ? 0.2 : 0)
      : 0;
  const keywordMatchScore =
    keywordText.length > 0
      ? coverageScore(matchedKeywordTerms, coreTerms)
      : Math.min(0.45, titleMatchScore * 0.7);
  const abstractMatchScore =
    abstractText.length > 0
      ? coverageScore(matchedAbstractTerms, coreTerms)
      : blendMissingAbstract(titleMatchScore, queryIntentMatchScore);
  const domainMatchScore =
    matchedDomainTerms.length > 0
      ? coverageScore(matchedDomainTerms, domainTerms, 0.35)
      : titleMatchScore > 0 || abstractMatchScore > 0
        ? 0.3
        : source.sourceType === "journal" || source.sourceType === "conference"
          ? 0.18
          : 0;

  const conceptTitleScore = Math.min(
    1,
    matchedConceptGroups
      .filter((item) => item.matched.includes("title"))
      .reduce((sum, item) => sum + item.group.weight, 0) / 2,
  );
  const conceptAbstractScore = Math.min(
    1,
    matchedConceptGroups
      .filter((item) => item.matched.includes("abstract"))
      .reduce((sum, item) => sum + item.group.weight, 0) / 3,
  );
  const conceptKeywordScore = Math.min(
    1,
    matchedConceptGroups
      .filter((item) => item.matched.includes("keywords"))
      .reduce((sum, item) => sum + item.group.weight, 0) / 2,
  );
  const conceptVenueScore = Math.min(
    1,
    matchedConceptGroups
      .filter((item) => item.matched.includes("venue") || item.matched.includes("publisher"))
      .reduce((sum, item) => sum + item.group.weight, 0) / 2,
  );
  const metadataQualityBonus =
    (source.doi ? 0.025 : 0) +
    (source.year ? 0.015 : 0) +
    (source.venue ? 0.02 : 0) +
    (source.authors.length ? 0.015 : 0) +
    (source.publisher ? 0.015 : 0) +
    (source.abstract ? 0.03 : 0);
  const authorityText = `${titleText} ${abstractText} ${venueText} ${publisherText}`;
  const qualitySignalBonus =
    /review|systematic review|meta-analysis|clinical trial|guideline|official report|government|who|cdc|nih|university|journal article/i.test(
      authorityText,
    )
      ? 0.08
      : 0;
  const multiConceptBonus =
    matchedConcepts.length >= 2 ? RELEVANCE_SCORING_CONFIG.multiConceptBonus : 0;
  const subjectOutcomeBonus =
    matchedConceptGroups.some((item) => item.matched.includes("title")) &&
    matchedConcepts.length >= 2
      ? RELEVANCE_SCORING_CONFIG.subjectOutcomeBonus
      : 0;
  const lexicalScore = Math.max(
    0,
    Math.min(
      1,
      titleMatchScore * 0.35 +
        queryIntentMatchScore * 0.15 +
        keywordMatchScore * 0.15 +
        abstractMatchScore * 0.15 +
        domainMatchScore * 0.1 +
        sourceQualityScore * 0.1 -
        Math.min(0.25, driftHits * 0.08),
    ),
  );
  const conceptScore = Math.min(
    1,
    conceptTitleScore * RELEVANCE_SCORING_CONFIG.titleWeight +
      conceptAbstractScore * RELEVANCE_SCORING_CONFIG.abstractWeight +
      conceptKeywordScore * RELEVANCE_SCORING_CONFIG.keywordWeight +
      conceptVenueScore * RELEVANCE_SCORING_CONFIG.venueWeight +
      sourceQualityScore * RELEVANCE_SCORING_CONFIG.qualityWeight +
      metadataQualityBonus +
      qualitySignalBonus +
      multiConceptBonus +
      subjectOutcomeBonus,
  );
  const score = Math.max(lexicalScore, conceptScore, upstreamScore ?? 0);
  const confidenceTier =
    score >= RELEVANCE_SCORING_CONFIG.highConfidenceThreshold ||
    (conceptTitleScore > 0 && matchedConcepts.length >= 2 && score >= 0.28)
      ? "high"
      : score >= RELEVANCE_SCORING_CONFIG.fallbackThreshold
        ? "fallback"
        : "rejected";
  const acceptReason =
    confidenceTier === "high"
      ? matchedConcepts.length >= 2
        ? "strong_concept_match"
        : conceptTitleScore > 0
          ? "direct_topic_match"
          : qualitySignalBonus > 0
            ? "authoritative_review_match"
            : "sufficient_metadata_match"
      : undefined;
  const rejectionReason =
    confidenceTier === "rejected"
      ? matchedConcepts.length === 0
        ? "missing_core_concept"
        : "low_topic_relevance"
      : undefined;

  return {
    score,
    titleMatchScore,
    queryIntentMatchScore,
    keywordMatchScore,
    abstractMatchScore,
    domainMatchScore,
    sourceQualityScore,
    hasCoreConceptMatch: matchedCoreTerms.length > 0 || matchedConcepts.length > 0,
    hasTitleCoreConceptMatch: matchedTitleTerms.length > 0 || conceptTitleScore > 0,
    matchedCoreTerms,
    matchedTitleTerms,
    matchedConcepts,
    matchedFields,
    confidenceTier,
    ...(acceptReason ? { acceptReason } : {}),
    ...(rejectionReason ? { rejectionReason } : {}),
  };
}

export function computeRelevanceScore(
  source: NormalizedSource,
  plan: ScoringResearchQueryPlan,
): number {
  return Math.round(analyzeRelevanceScore(source, plan).score * 100);
}
