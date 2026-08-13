import type { SourceRecord } from "./source-record";

export const RESEARCH_FACET_KEYS = [
  "geography",
  "setting",
  "exposure",
  "outcome",
  "population_object",
  "method",
] as const;

export type ResearchFacetKey = (typeof RESEARCH_FACET_KEYS)[number];
export type ResearchDirectnessTier = "A" | "B" | "C" | "D";

export interface ResearchFacet {
  key: ResearchFacetKey;
  labelZhTw: string;
  topicTerms: string[];
  queryTermsZh: string[];
  queryTermsEn: string[];
  required: boolean;
}

export interface ResearchFacetPlan {
  topic: string;
  facets: ResearchFacet[];
  requiredKeys: ResearchFacetKey[];
}

export interface ResearchFacetAssessment {
  tier: ResearchDirectnessTier;
  score: number;
  matchedKeys: ResearchFacetKey[];
  missingKeys: ResearchFacetKey[];
  matchedTerms: string[];
}

export interface ResearchFacetQueries {
  exactBilingual: string[];
  synonymExpansion: string[];
  singleFacetRelaxation: string[];
  gapFill: string[];
}

const FACET_LABELS: Record<ResearchFacetKey, string> = {
  geography: "地理範圍",
  setting: "研究場域",
  exposure: "暴露或解釋變項",
  outcome: "結果變項",
  population_object: "研究對象",
  method: "研究方法",
};

type LexiconEntry = {
  match: RegExp;
  zh: string[];
  en: string[];
};

const FACET_LEXICON: Record<ResearchFacetKey, LexiconEntry[]> = {
  geography: [
    { match: /(?:臺灣|台灣|taiwan)/iu, zh: ["臺灣"], en: ["Taiwan"] },
    { match: /(?:臺北|台北|taipei)/iu, zh: ["臺北"], en: ["Taipei"] },
    { match: /(?:高雄|kaohsiung)/iu, zh: ["高雄"], en: ["Kaohsiung"] },
    { match: /(?:香港|hong kong)/iu, zh: ["香港"], en: ["Hong Kong"] },
    { match: /(?:日本|japan)/iu, zh: ["日本"], en: ["Japan"] },
    { match: /(?:中國|china)/iu, zh: ["中國"], en: ["China"] },
  ],
  setting: [
    {
      match: /(?:校園|學校|校舍|campus|school(?:yard)?|university|college|educational setting)/iu,
      zh: ["校園", "學校", "大學校園"],
      en: ["campus", "school", "university campus", "schoolyard"],
    },
    {
      match: /(?:城市|都市|urban|city)/iu,
      zh: ["都市"],
      en: ["urban", "city"],
    },
    {
      match: /(?:醫院|hospital|clinical setting|clinic)/iu,
      zh: ["醫院", "臨床場域"],
      en: ["hospital", "clinical setting"],
    },
    {
      match: /(?:職場|workplace|office)/iu,
      zh: ["職場"],
      en: ["workplace", "office"],
    },
  ],
  exposure: [
    {
      match: /(?:綠覆率|綠地|綠化|樹冠|植被|green coverage|green space|greenery|tree canopy|vegetation|ndvi)/iu,
      zh: ["綠覆率", "綠地", "樹冠", "植被"],
      en: ["green coverage", "green space", "tree canopy", "vegetation", "NDVI"],
    },
    {
      match: /(?:空氣污染|pm2\.?5|air pollution|particulate matter)/iu,
      zh: ["空氣污染", "細懸浮微粒"],
      en: ["air pollution", "PM2.5", "particulate matter"],
    },
    { match: /(?:短影音|short-form video)/iu, zh: ["短影音"], en: ["short-form video"] },
    { match: /(?:螢幕時間|screen time)/iu, zh: ["螢幕時間"], en: ["screen time"] },
    { match: /(?:社群媒體|social media)/iu, zh: ["社群媒體"], en: ["social media"] },
    {
      match: /(?:飲食|diet|nutrition|攝取|intake|consumption)/iu,
      zh: ["飲食", "攝取量"],
      en: ["diet", "intake", "consumption"],
    },
  ],
  outcome: [
    {
      match: /(?:都市熱島|熱島|地表溫度|熱環境|熱舒適|urban heat island|\buhi\b|land surface temperature|\blst\b|thermal environment|thermal comfort|heat stress|microclimate)/iu,
      zh: ["都市熱島", "地表溫度", "熱環境", "熱舒適"],
      en: ["urban heat island", "land surface temperature", "thermal environment", "thermal comfort", "heat stress", "microclimate"],
    },
    {
      match: /(?:睡眠|sleep|失眠|insomnia)/iu,
      zh: ["睡眠", "失眠"],
      en: ["sleep", "insomnia"],
    },
    {
      match: /(?:學習成效|學業表現|academic performance|learning outcome)/iu,
      zh: ["學習成效", "學業表現"],
      en: ["academic performance", "learning outcome"],
    },
    {
      match: /(?:死亡率|mortality|發病率|incidence|風險|risk)/iu,
      zh: ["風險", "發病率", "死亡率"],
      en: ["risk", "incidence", "mortality"],
    },
  ],
  population_object: [
    {
      match: /(?:高中生|高級中學(?:學生)?|senior high school students?|high school students?)/iu,
      zh: ["高中生", "高級中學學生"],
      en: ["high school students", "senior high school students"],
    },
    {
      match: /(?:中學生|中學學生|secondary school students?|middle school students?)/iu,
      zh: ["中學生"],
      en: ["secondary school students", "middle school students"],
    },
    {
      match: /(?:大學生|大專生|college students?|university students?|undergraduates?)/iu,
      zh: ["大學生", "大專生"],
      en: ["college students", "university students", "undergraduates"],
    },
    {
      match: /(?:青少年|adolescents?)/iu,
      zh: ["青少年"],
      en: ["adolescents"],
    },
    {
      match: /(?:學生|學童|children|child|student|youth)/iu,
      zh: ["學生", "學童"],
      en: ["students", "schoolchildren", "children"],
    },
    {
      match: /(?:成人|adult|older adults?|高齡|elderly)/iu,
      zh: ["成人", "高齡者"],
      en: ["adults", "older adults"],
    },
    {
      match: /(?:建築|building|街廓|block|site|地點|location)/iu,
      zh: ["建築", "地點"],
      en: ["buildings", "sites", "locations"],
    },
  ],
  method: [
    {
      match: /(?:關聯|相關|association|relationship|correlation|regression)/iu,
      zh: ["關聯", "相關分析", "迴歸分析"],
      en: ["association", "relationship", "correlation", "regression"],
    },
    {
      match: /(?:遙測|衛星|remote sensing|satellite|gis|地理資訊)/iu,
      zh: ["遙測", "地理資訊系統"],
      en: ["remote sensing", "satellite", "GIS"],
    },
    {
      match: /(?:實驗|experiment|試驗|trial|randomi[sz]ed)/iu,
      zh: ["實驗", "試驗"],
      en: ["experiment", "trial", "randomized"],
    },
  ],
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function firstTerms(facet: ResearchFacet, language: "zh" | "en", count = 2): string[] {
  return (language === "zh" ? facet.queryTermsZh : facet.queryTermsEn).slice(0, count);
}

export function inferResearchFacets(
  topic: string,
  conceptHints: Partial<Record<ResearchFacetKey, string[]>> = {},
): ResearchFacetPlan {
  const fullText = [topic, ...Object.values(conceptHints).flatMap((items) => items ?? [])].join(" ");
  const facets = RESEARCH_FACET_KEYS.flatMap((key): ResearchFacet[] => {
    const entries = FACET_LEXICON[key].filter((entry) => entry.match.test(fullText)).slice(0, 1);
    const hints = unique(conceptHints[key] ?? []);
    if (entries.length === 0 && hints.length === 0) return [];
    const topicTerms = unique([
      ...hints,
      ...entries.flatMap((entry) => [...entry.zh, ...entry.en]).filter((term) =>
        fullText.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
      ),
    ]);
    const queryTermsZh = unique([...entries.flatMap((entry) => entry.zh), ...hints.filter((term) => /[\u3400-\u9fff]/u.test(term))]);
    const queryTermsEn = unique([...entries.flatMap((entry) => entry.en), ...hints.filter((term) => /[A-Za-z]/.test(term))]);
    return [{
      key,
      labelZhTw: FACET_LABELS[key],
      topicTerms,
      queryTermsZh,
      queryTermsEn,
      required: ["geography", "setting", "exposure", "outcome", "population_object"].includes(key),
    }];
  });

  const eligibleRequired = facets.filter((facet) => facet.required).map((facet) => facet.key);
  const requiredKeys = eligibleRequired.length >= 2
    ? eligibleRequired
    : facets.slice(0, Math.min(3, facets.length)).map((facet) => facet.key);
  return {
    topic,
    facets: facets.map((facet) => ({ ...facet, required: requiredKeys.includes(facet.key) })),
    requiredKeys,
  };
}

export function assessResearchDirectness(
  source: Pick<SourceRecord, "title" | "abstract" | "snippet" | "containerTitle" | "publisher">,
  plan: ResearchFacetPlan,
): ResearchFacetAssessment {
  const haystack = [source.title, source.abstract, source.snippet, source.containerTitle, source.publisher]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  const matchedKeys: ResearchFacetKey[] = [];
  const matchedTerms: string[] = [];
  for (const facet of plan.facets) {
    const terms = unique([...facet.topicTerms, ...facet.queryTermsZh, ...facet.queryTermsEn]);
    const hits = terms.filter((term) => haystack.includes(term.toLocaleLowerCase()));
    if (hits.length > 0) {
      matchedKeys.push(facet.key);
      matchedTerms.push(...hits);
    }
  }
  const required = plan.requiredKeys;
  const matchedRequired = required.filter((key) => matchedKeys.includes(key));
  const missingKeys = required.filter((key) => !matchedKeys.includes(key));
  const ratio = required.length > 0 ? matchedRequired.length / required.length : 0;
  const tier: ResearchDirectnessTier =
    required.length > 0 && matchedRequired.length === required.length
      ? "A"
      : required.length > 0 && (matchedRequired.length >= Math.max(2, required.length - 1) || ratio >= 0.67)
        ? "B"
        : matchedRequired.length > 0
          ? "C"
          : "D";
  return {
    tier,
    score: Math.round(ratio * 100),
    matchedKeys,
    missingKeys,
    matchedTerms: unique(matchedTerms),
  };
}

function combinedQuery(facets: ResearchFacet[], language: "zh" | "en"): string {
  return unique(facets.flatMap((facet) => firstTerms(facet, language, 1))).join(" ");
}

export function buildResearchFacetQueries(
  plan: ResearchFacetPlan,
  missingKeys: ResearchFacetKey[] = plan.requiredKeys,
): ResearchFacetQueries {
  const requiredFacets = plan.facets.filter((facet) => facet.required);
  const optionalMethod = plan.facets.find((facet) => facet.key === "method");
  const exactBilingual = unique([
    combinedQuery(requiredFacets, "en"),
    combinedQuery(requiredFacets, "zh"),
    optionalMethod ? combinedQuery([...requiredFacets, optionalMethod], "en") : "",
    unique(requiredFacets.flatMap((facet) => {
      if (facet.key === "setting") return facet.queryTermsEn.slice(0, 2);
      if (facet.key === "exposure") return facet.queryTermsEn.slice(2, 3);
      if (facet.key === "outcome") return facet.queryTermsEn.slice(2, 3);
      return facet.queryTermsEn.slice(0, 1);
    })).join(" "),
    unique(requiredFacets.flatMap((facet) => {
      if (facet.key === "geography") return facet.queryTermsEn.slice(0, 1);
      if (facet.key === "setting") return facet.queryTermsEn.slice(0, 2);
      if (facet.key === "exposure") return facet.queryTermsEn.slice(2, 4);
      if (facet.key === "outcome") return facet.queryTermsEn.slice(2, 3);
      return facet.queryTermsEn.slice(0, 1);
    })).join(" "),
  ]);
  const synonymExpansion = unique([
    unique(requiredFacets.flatMap((facet) => firstTerms(facet, "en", 2))).join(" "),
    unique(requiredFacets.flatMap((facet) => firstTerms(facet, "zh", 2))).join(" "),
  ]);
  const singleFacetRelaxation = unique(requiredFacets.map((relaxed) =>
    combinedQuery(requiredFacets.filter((facet) => facet.key !== relaxed.key), "en"),
  )).filter((query) => query.split(/\s+/u).length >= 2);
  const gapFill = unique((missingKeys.length === 0 ? [] : missingKeys).flatMap((missingKey) => {
    const missing = plan.facets.find((facet) => facet.key === missingKey);
    if (!missing) return [];
    const strongestOtherFacets = requiredFacets.filter((facet) => facet.key !== missingKey).slice(0, 2);
    return [
      combinedQuery([missing, ...strongestOtherFacets], "en"),
      combinedQuery([missing, ...strongestOtherFacets], "zh"),
    ];
  })).filter((query) => query.split(/\s+/u).length >= 2);
  if (missingKeys.length === 0) gapFill.push(...exactBilingual.slice(0, 5));
  return { exactBilingual, synonymExpansion, singleFacetRelaxation, gapFill };
}

export function summarizeFacetAdequacy(
  assessments: ResearchFacetAssessment[],
  plan: ResearchFacetPlan,
): {
  adequate: boolean;
  tierCounts: Record<ResearchDirectnessTier, number>;
  missingKeys: ResearchFacetKey[];
  reason: string | null;
} {
  const tierCounts = assessments.reduce<Record<ResearchDirectnessTier, number>>(
    (counts, item) => ({ ...counts, [item.tier]: counts[item.tier] + 1 }),
    { A: 0, B: 0, C: 0, D: 0 },
  );
  const missingKeys = plan.requiredKeys.filter((key) =>
    assessments.filter((item) => item.tier === "A" || item.tier === "B")
      .every((item) => !item.matchedKeys.includes(key)),
  );
  const adequate = tierCounts.A >= 1 && tierCounts.A + tierCounts.B >= 3 && missingKeys.length === 0;
  return {
    adequate,
    tierCounts,
    missingKeys,
    reason: adequate ? null : `直接證據不足（A=${tierCounts.A}、B=${tierCounts.B}；缺少：${missingKeys.join("、") || "跨構面直接研究"}）`,
  };
}
