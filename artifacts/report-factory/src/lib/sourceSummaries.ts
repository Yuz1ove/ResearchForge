import {
  classifySourceRecord,
  normalizeUsableSections,
  SOURCE_CATEGORY_LABELS,
  type SourceEvidenceChainEntry,
  type SourceEvidenceSnippet,
  type SourceRecord,
  type WorkflowReportSection,
} from "./sourceRecords.ts";
import { normalizeDisplayTextToZhTw } from "./sourceAuthority.ts";
import {
  buildSourceIntentProfile,
  buildSourceRelevanceAssessment,
  type SourceIntentProfile,
  type SourceRelevanceAssessment,
} from "./sourceRelevance.ts";
import {
  buildSourceEvidenceProfile,
  type EvidenceGrounding,
} from "./sourceEvidence.ts";
import {
  evaluateSourceQuality,
  type SourceUsageRecommendation,
} from "./sourceQuality.ts";
import { buildTopicFacets } from "./topicFacets.ts";

const FALLBACK_SUMMARY =
  "本來源目前缺少可用摘要，可先作為背景線索或資料缺口說明；若要作為主要證據，仍需補充可驗證摘要或原文片段。";

const ENGLISH_NOISE_WORDS = new Set([
  "about",
  "after",
  "among",
  "analysis",
  "and",
  "article",
  "based",
  "between",
  "data",
  "effect",
  "effects",
  "from",
  "have",
  "into",
  "model",
  "paper",
  "research",
  "results",
  "review",
  "study",
  "that",
  "their",
  "this",
  "using",
  "with",
]);

const ENGLISH_GLUE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "that",
  "the",
  "through",
  "to",
  "using",
  "via",
  "with",
]);

const ACADEMIC_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbased on\b/gi, "基於"],
  [/\bcase study\b/gi, "案例研究"],
  [/\bfuel efficiency\b/gi, "燃油效率"],
  [/\bcontrol surfaces\b/gi, "控制面"],
  [/\bflight stability\b/gi, "飛行穩定"],
  [/\bobserved warming\b/gi, "觀測升溫"],
  [/\bcurrent status\b/gi, "現況"],
  [/\bclimate change indicators\b/gi, "氣候變遷指標"],
  [/\btemperature trends\b/gi, "溫度趨勢"],
  [/\bco2 concentration\b/gi, "二氧化碳濃度"],
  [/\bconcentration\b/gi, "濃度"],
  [/\bsea level change\b/gi, "海平面變化"],
  [/\bdigital twin\b/gi, "數位分身"],
  [/\bstructural life\b/gi, "結構壽命"],
  [/\bstructural health monitoring\b/gi, "結構健康監測"],
  [/\bcomposite structures\b/gi, "複合材料結構"],
  [/\bcomposite materials\b/gi, "複合材料"],
  [/\bfibre optic sensors?\b/gi, "光纖感測器"],
  [/\bfiber optic sensors?\b/gi, "光纖感測器"],
  [/\brecent advances\b/gi, "最新進展"],
  [/\bapplications?\b/gi, "應用"],
  [/\badvancement(s)?\b/gi, "進展"],
  [/\breview\b/gi, "綜述"],
  [/\baluminum alloys?\b/gi, "鋁合金"],
  [/\bseries\b/gi, "系列"],
  [/\bindicators\b/gi, "指標"],
  [/\bCO2\b/g, "二氧化碳"],
  [/\bcargo\b/gi, "貨運"],
  [/\bfleet management\b/gi, "機隊管理"],
  [/\bflight operations\b/gi, "飛航作業"],
  [/\bscheduling\b/gi, "調度"],
  [/\bassembly\b/gi, "組裝"],
  [/\baerostructural\b/gi, "航太結構"],
  [/\btwin-fuselage\b/gi, "雙機身"],
  [/\bstrut-braced-wing\b/gi, "支柱撐翼"],
  [/\bconfiguration(s)?\b/gi, "構型"],
  [/\boverview\b/gi, "概述"],
  [/\bcomparative\b/gi, "比較"],
  [/\boptimization\b/gi, "最佳化"],
  [/\boptimisation\b/gi, "最佳化"],
  [/\bdynamic\b/gi, "動態"],
  [/\bmodel(s)?\b/gi, "模型"],
  [/\bdata\b/gi, "資料"],
  [/\bstudy\b/gi, "研究"],
  [/\bstudies\b/gi, "研究"],
  [/\bresults show\b/gi, "結果顯示"],
  [/\bperformance\b/gi, "性能"],
  [/\bimprovement(s)?\b/gi, "改善"],
  [/\bsafety\b/gi, "安全"],
  [/\bunmanned\b/gi, "無人"],
  [/\bmanned\b/gi, "有人"],
  [/\blateral\b/gi, "側向"],
  [/\bspacing\b/gi, "間距"],
  [/\boperation(s)?\b/gi, "作業"],
  [/\bmixed\b/gi, "混合"],
  [/\bQAR\b/g, "快速存取記錄器"],
  [/\bquick access recorder\b/gi, "快速存取記錄器"],
  [/\brunway overrun\b/gi, "跑道衝出"],
  [/\brisk assessment\b/gi, "風險評估"],
  [/\bcivil aircraft\b/gi, "民航飛機"],
  [/\bfixed-wing aircraft\b/gi, "固定翼飛機"],
  [/\bflight parameters\b/gi, "飛行參數"],
  [/\bflight safety\b/gi, "飛航安全"],
  [/\btouchdown distance\b/gi, "接地距離"],
  [/\bkinetic energy\b/gi, "動能"],
  [/\bflight phase\b/gi, "飛行階段"],
  [/\baircraft\b/gi, "飛機"],
  [/\bairplane\b/gi, "飛機"],
  [/\baeroplane\b/gi, "飛機"],
  [/\baviation\b/gi, "航空"],
  [/\bprediction\b/gi, "預測"],
  [/\bdesign\b/gi, "設計"],
  [/\bmaterials\b/gi, "材料"],
  [/\bmanufacturing\b/gi, "製造"],
  [/\bmaintenance\b/gi, "維修"],
  [/\boptimization\b/gi, "最佳化"],
  [/\bconfiguration\b/gi, "構型"],
  [/\bwing\b/gi, "機翼"],
  [/\bfuselage\b/gi, "機身"],
  [/\bsoft drink\b/gi, "含糖飲料"],
  [/\bsugar-sweetened beverage\b/gi, "含糖飲料"],
  [/\bshort video\b/gi, "短影音"],
  [/\battention\b/gi, "注意力"],
  [/\bclimate change\b/gi, "氣候變遷"],
  [/\bgreenhouse gas\b/gi, "溫室氣體"],
  [/\bsea level\b/gi, "海平面"],
  [/\bglobal warming\b/gi, "全球暖化"],
  [/\bstudents?\b/gi, "學生"],
  [/\badolescents?\b/gi, "青少年"],
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function splitSentences(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[。！？.!?])(?:\s+|(?=\S))/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function truncateText(text: string, maxLength = 160): string {
  const chars = Array.from(cleanText(text));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars
    .slice(0, maxLength - 1)
    .join("")
    .trim()}…`;
}

function looksMostlyAscii(text: string): boolean {
  return /^[\x00-\x7F\s.,;:'"!?()[\]{}<>/%+-]+$/.test(cleanText(text));
}

function applyAcademicTermReplacements(text: string): string {
  let normalized = normalizeDisplayTextToZhTw(cleanText(text));
  for (const [pattern, replacement] of ACADEMIC_TERM_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function polishReaderFacingText(text: string): string {
  return cleanText(text)
    .replace(/\b(for|and|of|on|in|with|from|to|via)\b/gi, " ")
    .replace(/\b(new|current|overall|respectively|approach|approaches|framework|frameworks)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：、])/g, "$1")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([）)])/g, "$1")
    .trim();
}

function stripAcademicSentenceLead(text: string): string {
  return cleanText(text)
    .replace(
      /^in\s+this\s+((systematic|narrative|literature|cohort|case[- ]control|cross[- ]sectional|retrospective|prospective|observational|experimental|comparative|empirical)\s+){0,2}(study|paper|article|review|analysis)[,:]?\s*/i,
      "",
    )
    .replace(
      /^(this|the)\s+((systematic|narrative|literature|cohort|case[- ]control|cross[- ]sectional|retrospective|prospective|observational|experimental|comparative|empirical)\s+){0,2}(study|paper|article|review|analysis)[,:]?\s*/i,
      "",
    )
    .replace(
      /^(taking|using|based on)\b[^.]{0,160}?\b(case study|dataset|data)\b,?\s*/i,
      "",
    )
    .replace(/^(we|authors?)\s+/i, "")
    .replace(
      /^(examines?|analyzes?|investigates?|evaluates?|explores?|proposes?|presents?|predicts?|describes?|reports?|discusses?)\s+/i,
      "",
    )
    .replace(/^\s*(the)\s+/i, "")
    .trim();
}

function englishWordCount(text: string): number {
  return cleanText(text).match(/[A-Za-z]{3,}/g)?.length ?? 0;
}

function containsHeavyEnglish(text: string): boolean {
  const normalized = cleanText(text);
  const asciiLetters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  const chars = Array.from(normalized).length || 1;
  return englishWordCount(normalized) >= 4 || asciiLetters / chars >= 0.22;
}

function meaningfulResearchTerms(text: string): string[] {
  return polishReaderFacingText(applyAcademicTermReplacements(text))
    .split(/[，。；：、,;:()[\]{}<>/%+-]|\s+/)
    .map((token) => cleanText(token))
    .filter((token) => token.length >= 2)
    .filter((token) => {
      if (/[\u4e00-\u9fff]/u.test(token)) return true;
      if (/^[A-Z0-9-]{2,6}$/.test(token)) return true;
      if (ENGLISH_NOISE_WORDS.has(token.toLowerCase())) return false;
      if (ENGLISH_GLUE_WORDS.has(token.toLowerCase())) return false;
      return false;
    })
    .filter((token, index, items) => items.indexOf(token) === index)
    .slice(0, 4);
}

function readerFacingActionDetail(action: string): string {
  switch (action) {
    case "提出並說明":
      return "設計與判斷方式";
    case "評估":
      return "評估方式與風險判讀";
    case "比較":
      return "差異與表現比較";
    case "預測":
      return "預測方向與判斷依據";
    case "探討":
      return "核心議題與可能影響";
    default:
      return "核心重點";
  }
}

function naturalChineseLead(
  focus: string,
  action: string,
  facets: string[],
  sentence: string,
): string {
  const terms = [
    ...facets,
    ...meaningfulResearchTerms(sentence),
    ...meaningfulResearchTerms(focus),
  ].filter((term, index, items) => term && items.indexOf(term) === index);
  const termText = terms.slice(0, 3).join("、");
  if (termText) {
    return `內容聚焦${termText}，可用來理解${focus}的${readerFacingActionDetail(action)}。`;
  }
  return `內容聚焦${focus}，可用來快速掌握這篇研究的${readerFacingActionDetail(action)}。`;
}

function readerFacingFacetLabels(facets: string[]): string[] {
  return facets
    .map((facet) => polishReaderFacingText(applyAcademicTermReplacements(facet)))
    .map((facet) => cleanText(facet))
    .filter((facet, index, items) => facet && items.indexOf(facet) === index);
}

function normalizedUserFacingLlmSummary(
  summary: string | null | undefined,
  maxLength: number,
): string {
  const normalized = polishReaderFacingText(
    applyAcademicTermReplacements(cleanText(summary)),
  )
    .replace(/^(這篇來源|此來源)屬於[^。！？!?]+[。！？!?]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return truncateText(normalized, maxLength);
}

function englishTitleKeywords(title: string): string[] {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token, index, items) =>
        token.length >= 4 &&
        !ENGLISH_NOISE_WORDS.has(token) &&
        !/^\d+$/.test(token) &&
        items.indexOf(token) === index,
    )
    .slice(0, 6);
}

function sourceFocusTitle(title: string, topic = "", facets: string[] = []): string {
  const normalized = polishReaderFacingText(
    applyAcademicTermReplacements(
    cleanText(title)
      .replace(/^(a|an|the)\s+/i, "")
      .replace(/\s*[:|-]\s*.*/, ""),
    ),
  );
  if (!containsHeavyEnglish(normalized)) {
    return truncateText(normalized || cleanText(title), 72);
  }
  const topicText = cleanText(topic);
  const termPool = [
    ...readerFacingFacetLabels(facets),
    ...meaningfulResearchTerms(normalized),
  ].filter((term, index, items) => term && items.indexOf(term) === index);
  const usefulTerms = termPool.filter(
    (term) => term !== topicText && !topicText.includes(term),
  );
  if (usefulTerms.length >= 2) {
    return truncateText(usefulTerms.slice(0, 3).join("、"), 72);
  }
  if (usefulTerms.length === 1 && topicText) {
    return truncateText(`${topicText}${usefulTerms[0]}`, 72);
  }
  if (topicText) return truncateText(`${topicText}相關研究`, 72);
  return truncateText(normalized || cleanText(title), 72);
}

function summaryActionLabel(text: string): string {
  const normalized = cleanText(text).toLowerCase();
  if (/\b(propose|develop|present|design|build)\b/.test(normalized)) return "提出並說明";
  if (/\b(predict|forecast)\b/.test(normalized)) return "預測";
  if (/\b(compare|comparative)\b/.test(normalized)) return "比較";
  if (/\b(assess|assessment|evaluate|evaluation)\b/.test(normalized)) return "評估";
  if (/\b(analyze|analysis|investigate|investigation|examine|study|explore)\b/.test(normalized)) {
    return "探討";
  }
  return "說明";
}

function titleOrFacetFocus(
  source: SourceRecord,
  topic: string,
  facets: string[],
): string {
  const titleFocus = sourceFocusTitle(source.title, topic, facets);
  if (titleFocus) return titleFocus;
  if (facets.length > 0) return facets.slice(0, 2).join("、");
  return "這篇研究主題";
}

function chooseBestAbstractSentence(
  source: SourceRecord,
  facets: string[],
): string {
  const sentences = splitSentences(source.abstract ?? "").slice(0, 4);
  if (sentences.length === 0) return "";

  const titleKeywords = englishTitleKeywords(source.title);
  const scored = sentences.map((sentence, index) => {
    const normalized = sentence.toLowerCase();
    const titleHits = titleKeywords.reduce(
      (score, keyword) => score + (normalized.includes(keyword) ? 2 : 0),
      0,
    );
    const facetHits = facets.reduce(
      (score, facet) =>
        score +
        (facet &&
        normalized.includes(facet.toLowerCase())
          ? 3
          : 0),
      0,
    );
    const verbBonus = /\b(propose|develop|present|predict|assess|evaluate|analyze|examine|study|investigate)\b/.test(
      normalized,
    )
      ? 2
      : 0;
    const lengthBonus = sentence.length >= 48 ? 1 : 0;
    return {
      sentence,
      score: titleHits + facetHits + verbBonus + lengthBonus - index,
    };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.sentence ?? sentences[0] ?? "";
}

function readerFacingAbstractSummary(
  source: SourceRecord,
  topic: string,
  facets: string[] = [],
  maxLength = 260,
): string {
  const abstract = cleanText(source.abstract);
  const topicText = topicLabel(topic);
  if (abstract.length < 24) return FALLBACK_SUMMARY;

  const focus = titleOrFacetFocus(source, topicText, facets);
  const facetLabels = readerFacingFacetLabels(facets);
  const action = summaryActionLabel([source.title, abstract].join(" "));
  const bestSentence = chooseBestAbstractSentence(source, facets) || abstract;
  const normalizedSentence = polishReaderFacingText(
    stripAcademicSentenceLead(applyAcademicTermReplacements(bestSentence)),
  )
    .replace(/\s+/g, " ")
    .trim();
  const fallbackSentence = truncateText(
    polishReaderFacingText(applyAcademicTermReplacements(bestSentence)),
    128,
  );
  const lead = normalizedSentence || fallbackSentence;
  const naturalLead = naturalChineseLead(focus, action, facetLabels, lead);
  const relationText = facetLabels.length > 0
    ? `，與「${topicText}」最相關的是${facetLabels.slice(0, 2).join("、")}`
    : "";

  if (!looksMostlyAscii(lead) && !containsHeavyEnglish(lead)) {
    return truncateText(
      `主旨：本文${action}「${focus}」${relationText}。摘要重點：${lead}。`,
      maxLength,
    );
  }

  return truncateText(
    `主旨：本文${action}「${focus}」${relationText}。摘要重點：${naturalLead}`,
    maxLength,
  );
}

function topicLabel(topic: string): string {
  return cleanText(topic) || "本研究主題";
}

function textForSectionHints(source: SourceRecord): string {
  return [
    source.title,
    source.abstract,
    source.containerTitle,
    source.publisher,
    source.sourceCategory,
    source.sourceType,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pushUnique<T>(items: T[], item: T): void {
  if (!items.includes(item)) items.push(item);
}

export function sourceHasUsableAbstract(source: SourceRecord): boolean {
  return cleanText(source.abstract).length >= 24;
}

export function sourceSummaryText(source: SourceRecord): string {
  if (cleanText(source.readableSummaryZhTW)) {
    return truncateText(cleanText(source.readableSummaryZhTW), 170);
  }
  if (cleanText(source.llmSummaryZhTw) && !source.summaryFallbackUsed) {
    return normalizedUserFacingLlmSummary(source.llmSummaryZhTw, 220);
  }
  return truncateText(
    evaluateSourceQuality(source, source.topic ?? source.title ?? "目前主題").summary
      .readableSummaryZhTW,
    170,
  );
}

export function sourceParagraphSummary(
  source: SourceRecord,
  topic: string,
  assessment?: SourceRelevanceAssessment,
): string {
  if (cleanText(source.readableSummaryZhTW)) {
    return truncateText(cleanText(source.readableSummaryZhTW), 260);
  }
  if (cleanText(source.llmSummaryZhTw) && !source.summaryFallbackUsed) {
    return normalizedUserFacingLlmSummary(source.llmSummaryZhTw, 260);
  }
  const evidenceProfile = buildSourceEvidenceProfile(source, buildTopicFacets(topic));
  if (evidenceProfile.evidenceSnippets.length > 0 && cleanText(evidenceProfile.summaryZhTw)) {
    return truncateText(evidenceProfile.summaryZhTw, 260);
  }
  return truncateText(
    evaluateSourceQuality(source, topic).summary.readableSummaryZhTW,
    260,
  );
}

export function sourceRecommendedSections(
  source: SourceRecord,
): WorkflowReportSection[] {
  const explicit = normalizeUsableSections(source.usableSections);
  if (explicit.length) return explicit;

  const text = textForSectionHints(source);
  const category = classifySourceRecord(source);
  const sections: WorkflowReportSection[] = [];

  if (
    category === "academic_paper" ||
    category === "journal_article" ||
    /study|research|review|literature|論文|研究|文獻/.test(text)
  ) {
    pushUnique(sections, "文獻探討");
  }
  if (
    category === "government_or_institution" ||
    /report|statistics|data|survey|政府|統計|調查|資料|政策/.test(text)
  ) {
    pushUnique(sections, "數據分析");
    pushUnique(sections, "研究背景");
  }
  if (
    /method|experiment|sample|survey|interview|方法|實驗|樣本|訪談|問卷/.test(
      text,
    )
  ) {
    pushUnique(sections, "研究方法");
  }
  if (
    /result|impact|effect|conclusion|finding|影響|結果|結論|成效/.test(text)
  ) {
    pushUnique(sections, "結論");
  }
  if (
    /background|overview|introduction|history|背景|概述|歷史|現況/.test(text)
  ) {
    pushUnique(sections, "研究背景");
  }

  if (sections.length === 0) {
    pushUnique(sections, "研究背景");
    pushUnique(sections, "文獻探討");
  }

  return sections.slice(0, 3);
}

export function sourceDecisionHint(source: SourceRecord): string {
  const category = classifySourceRecord(source);
  const label = SOURCE_CATEGORY_LABELS[category];
  const quality = evaluateSourceQuality(
    source,
    source.topic ?? source.title ?? "目前主題",
  );
  const sections = sourceRecommendedSections(source).join("、");

  if (quality.usageRecommendation === "exclude") {
    return `這筆${label}與目前主題關聯不足，預設建議排除。`;
  }
  if (quality.sufficiency.evidenceSufficiency === "insufficient") {
    return `這筆${label}目前只有有限書目資訊，不能列入主要證據。`;
  }
  if (!cleanText(source.doi) && !cleanText(source.url)) {
    return `可支援${sections}，但 DOI 或 URL 待補，正式引用前需補齊位置。`;
  }
  return `可優先判斷是否支援${sections}；接受後會進入報告資料基礎。`;
}

export interface SourceSummaryForUser {
  contentSummary: string;
  summaryQuality: "good" | "partial" | "poor" | "irrelevant";
  summaryQualityReason: string;
  summarySourceType: SourceRecord["summarySourceType"];
  summaryConfidence: SourceRecord["summaryConfidence"];
  summaryWarnings: string[];
  relevanceReasonZhTW: string | null;
  evidenceSnippets: SourceEvidenceSnippet[];
  originalEvidenceSnippets: string[];
  evidenceChain: SourceEvidenceChainEntry[];
  mainEvidenceFacet: string | null;
  groundingStatus: EvidenceGrounding;
  topicRelation: string;
  recommendation:
    | "recommended"
    | "supporting"
    | "check_first"
    | "not_recommended";
  recommendationReason: string;
  usableSections: WorkflowReportSection[];
  suitableSectionLabels: string[];
}

function topicCoreLabel(profile: SourceIntentProfile): string {
  return profile.coreConcepts.slice(0, 3).join("、") || "使用者主題";
}

function isSpiderLikeTopic(profile: SourceIntentProfile): boolean {
  const text = cleanText(
    [
      ...profile.coreConcepts,
      ...profile.researchVariables,
      ...profile.usefulContextTerms,
    ].join(" "),
  );
  return /spider|spiders|arachnid|araneae|蜘蛛|蛛形綱/.test(text);
}

function summaryQualityFromAssessment(
  source: SourceRecord,
  assessment: SourceRelevanceAssessment,
  evidenceProfile: ReturnType<typeof buildSourceEvidenceProfile>,
): { quality: SourceSummaryForUser["summaryQuality"]; reason: string } {
  if (
    assessment.relevanceLevel === "off_topic" ||
    assessment.relevanceLevel === "low"
  ) {
    return {
      quality: "irrelevant",
      reason: "與主題明顯不符，不建議作為主要證據。",
    };
  }
  if (source.summaryConfidence === "low") {
    return {
      quality: "poor",
      reason: "目前摘要主要根據書目資訊或有限片段整理，引用前仍需再確認原始內容。",
    };
  }
  if (source.summaryConfidence === "medium") {
    return {
      quality: "partial",
      reason: "摘要可讀，但主要來自 snippet 或有限片段，適合作為初步判讀。",
    };
  }
  if (
    !sourceHasUsableAbstract(source) ||
    evidenceProfile.groundingStatus === "metadata_only"
  ) {
    return {
      quality: "poor",
      reason: "只有標題或書目資訊可用，較適合作為背景線索。",
    };
  }
  if (
    evidenceProfile.evidenceSnippets.length > 0 &&
    evidenceProfile.groundingStatus === "abstract_grounded"
  ) {
    return {
      quality: "good",
      reason: "有可用摘要與驗證片段，可穩定支持來源判讀。",
    };
  }
  return {
    quality: "partial",
    reason: "有摘要，但可驗證片段有限，只能保守整理內容。",
  };
}

function metadataBackedAssessment(
  source: SourceRecord,
  fallback: SourceRelevanceAssessment,
): SourceRelevanceAssessment {
  if (!source.classification && !source.relevanceLevel) return fallback;

  const staleOrOffTopic =
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow";
  const relevanceLevel = staleOrOffTopic
    ? "off_topic"
    : source.relevanceLevel ??
      (source.classification === "primary" ? "primary" : fallback.relevanceLevel);
  const matchedFacets =
    source.matchedFacets ?? source.matchedTerms ?? fallback.matchedFacets;
  const reasons = [
    ...(source.relevanceReasons ?? []),
    source.sourceRelevanceReasonZhTw,
    source.rejectReason,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    ...fallback,
    relevanceLevel,
    relevanceScore: source.relevanceScore ?? fallback.relevanceScore,
    matchedFacets,
    missingRequiredFacets:
      source.missingRequiredFacets ?? fallback.missingRequiredFacets,
    evidenceGrounding: source.evidenceGrounding ?? fallback.evidenceGrounding,
    reasonZhTw: source.sourceRelevanceReasonZhTw ?? fallback.reasonZhTw,
    shouldShowInMainList:
      source.shouldShowInMainList ??
      (relevanceLevel === "primary" ||
        (relevanceLevel === "secondary" && sourceHasUsableAbstract(source))),
    shouldRecommendAccept:
      source.shouldRecommendAccept ??
      (source.classification === "primary" &&
        relevanceLevel === "primary" &&
        sourceHasUsableAbstract(source)),
    reasons: reasons.length > 0 ? reasons : fallback.reasons,
    matchedCoreConcepts:
      source.matchedCoreConcepts ?? fallback.matchedCoreConcepts,
    missingCoreConcepts:
      source.missingCoreConcepts ?? fallback.missingCoreConcepts,
  };
}

function relationFromAssessment(
  source: SourceRecord,
  topic: string,
  profile: SourceIntentProfile,
  assessment: SourceRelevanceAssessment,
): string {
  const topicText = cleanText(topic) || "本主題";
  const spiderTopic = isSpiderLikeTopic(profile);
  const matchedLabels = readerFacingFacetLabels(assessment.matchedFacets);
  const distinctMatchedLabels = matchedLabels.filter(
    (term) => term !== topicText && !topicText.includes(term),
  );

  if (assessment.relevanceLevel === "primary") {
    const matched =
      distinctMatchedLabels.slice(0, 2).join("、") || topicCoreLabel(profile);
    return matched
      ? `此來源直接支撐「${topicText}」的${matched}，可作為主要證據候選。`
      : `此來源直接支撐「${topicText}」主題，可作為主要證據候選。`;
  }

  if (assessment.relevanceLevel === "secondary") {
    if (
      spiderTopic &&
      !assessment.reasons.some((reason) =>
        /棲地|生存|生態|捕食|避敵|築網/.test(reason),
      )
    ) {
      return `此來源雖提到蜘蛛，但目前未清楚聚焦棲地、生存或生態面向，較適合作為延伸線索。`;
    }
    return `此來源與「${topicText}」相關，但主要作為影響、政策或延伸脈絡，不適合作為成因/現況主證據。`;
  }

  if (assessment.relevanceLevel === "clue") {
    return `此來源題名與「${topicText}」有初步關聯，但目前缺少可用摘要或片段，系統會先列為次要候選。`;
  }

  if (
    assessment.relevanceLevel === "off_topic" ||
    assessment.relevanceLevel === "low"
  ) {
    return "此來源雖可能出現部分相近詞，但主要內容與本主題關聯不足，不建議納入。";
  }

  return `此來源可先作為「${topicText}」的延伸線索，但仍需確認內容是否能支撐研究問題。`;
}

function recommendationFromAssessment(
  source: SourceRecord,
  assessment: SourceRelevanceAssessment,
): SourceSummaryForUser["recommendation"] {
  if (
    assessment.relevanceLevel === "off_topic" ||
    assessment.relevanceLevel === "low"
  )
    return "not_recommended";
  if (assessment.relevanceLevel === "clue" || !sourceHasUsableAbstract(source))
    return "check_first";
  if (
    assessment.relevanceLevel === "secondary" &&
    assessment.reasons.some((reason) =>
      /僅命中蜘蛛主體|未清楚命中棲地/.test(reason),
    )
  ) {
    return "supporting";
  }
  if (assessment.shouldRecommendAccept) return "recommended";
  return "supporting";
}

function recommendationReason(
  recommendation: SourceSummaryForUser["recommendation"],
  assessment: SourceRelevanceAssessment,
): string {
  if (recommendation === "recommended") {
    return "推薦採用：此來源直接支撐必要面向，且摘要片段足以先判斷內容。";
  }
  if (recommendation === "supporting") {
    return "輔助來源：此來源適合提供延伸背景或旁證脈絡，但不宜單獨作為主證據。";
  }
  if (recommendation === "check_first") {
    return assessment.reasons.some((reason) => reason.includes("摘要不足"))
      ? "暫列次要候選：此來源可能相關，但摘要不足。"
      : "暫列次要候選：此來源有線索，但目前不足以支撐正式證據。";
  }
  return "不建議採用：此來源低相關或離題，不建議納入主要證據池。";
}

function suitableSectionLabels(
  source: SourceRecord,
  assessment: SourceRelevanceAssessment,
): string[] {
  const labels: string[] = [];
  const text = [
    source.title,
    source.abstract,
    assessment.matchedFacets.join(" "),
    assessment.reasonZhTw,
  ]
    .map(cleanText)
    .join(" ")
    .toLowerCase();

  if (
    /成因|greenhouse|fossil|carbon dioxide|co2|methane|emission|anthropogenic|溫室氣體|化石燃料|二氧化碳|甲烷|排放|人為/.test(
      text,
    )
  ) {
    labels.push("成因分析");
  }
  if (
    /現況|observed|temperature|concentration|indicator|trend|sea level|ipcc|wmo|nasa|noaa|全球升溫|濃度|趨勢|海平面/.test(
      text,
    )
  ) {
    labels.push("現況分析");
  }
  if (
    /data|statistics|indicator|trend|concentration|temperature|emission|數據|統計|指標|趨勢|濃度/.test(
      text,
    )
  ) {
    labels.push("數據背景");
  }
  if (
    /journal|review|study|assessment|文獻|研究|論文|期刊|評估/.test(text) ||
    source.sourceCategory === "journal_article" ||
    source.sourceCategory === "academic_paper"
  ) {
    labels.push("文獻探討");
  }
  if (
    assessment.relevanceLevel === "secondary" ||
    /impact|policy|finance|adaptation|effect|影響|政策|金融|調適|因應/.test(
      text,
    )
  ) {
    labels.push("延伸影響");
  }

  return Array.from(new Set(labels)).slice(0, 3);
}

export function sourceContentSummary(source: SourceRecord): string {
  return sourceSummaryText(source);
}

export function sourceTopicRelation(
  source: SourceRecord,
  topic: string,
  profile = buildSourceIntentProfile(topic),
): string {
  const assessment = buildSourceRelevanceAssessment(source, profile);
  return relationFromAssessment(source, topic, profile, assessment);
}

export function sourceAdoptionRecommendation(
  source: SourceRecord,
  assessment: SourceRelevanceAssessment,
): SourceSummaryForUser["recommendation"] {
  return recommendationFromAssessment(source, assessment);
}

export function sourceSummaryForUser(
  source: SourceRecord,
  topic: string,
  profile = buildSourceIntentProfile(topic),
): SourceSummaryForUser {
  const quality = evaluateSourceQuality(source, topic);
  const assessment = metadataBackedAssessment(
    source,
    buildSourceRelevanceAssessment(source, profile),
  );
  const evidenceProfile = buildSourceEvidenceProfile(
    source,
    buildTopicFacets(topic),
  );
  const usableSections = sourceRecommendedSections(source);
  const usageRecommendation: SourceUsageRecommendation =
    source.usageRecommendation ?? quality.usageRecommendation;
  const topicalLabel =
    source.topicalRelevanceLabel ?? quality.topical.topicalRelevanceLabel;
  const evidenceSufficiency =
    source.evidenceSufficiency ?? quality.sufficiency.evidenceSufficiency;
  const contentSummary = sourceParagraphSummary(source, topic, assessment);
  const summarySourceType =
    source.summarySourceType ??
    (quality.summary.summarySourceType === "reject"
      ? "metadataFallback"
      : quality.summary.summarySourceType);
  const summaryConfidence =
    source.summaryConfidence ?? quality.summary.summaryConfidence;
  const summaryWarnings = Array.from(
    new Set([
      ...(source.summaryWarnings ?? []),
      ...(source.qualityWarnings ?? []),
      ...quality.summary.qualityWarnings,
    ]),
  );
  const summaryQuality =
    topicalLabel === "irrelevant"
      ? {
          quality: "irrelevant" as const,
          reason: "此來源與主題核心概念明顯不符，建議排除。",
        }
      : evidenceSufficiency === "strong" || evidenceSufficiency === "moderate"
        ? {
            quality: "good" as const,
            reason:
              evidenceSufficiency === "strong"
                ? "已有足夠內容可支撐正式判讀。"
                : "目前有摘要可用，但仍需避免超出摘要內容。",
          }
        : evidenceSufficiency === "weak"
          ? {
              quality: "partial" as const,
              reason: "目前主要依片段資訊判讀，適合作為補充來源。",
            }
          : {
              quality: "poor" as const,
              reason: "目前只有標題或書目資訊，不能視為正式證據。",
            };
  const topicRelation =
    cleanText(source.relevanceReasonZhTW) ||
    cleanText(source.sourceRelevanceReasonZhTw) ||
    cleanText(quality.topical.relevanceReasonZhTW) ||
    null;
  const recommendationReason = (() => {
    switch (usageRecommendation) {
      case "primary":
        return "可作主要證據：主題相關度高，且目前至少有摘要可供判讀。";
      case "secondary":
        return "可作補充來源：有關聯，但較適合補充背景或延伸脈絡。";
      case "reference":
        return "僅供參考：資訊不足或關聯偏弱，引用前需再確認。";
      case "exclude":
      default:
        return "建議排除：與主題關聯不足，不應納入主要證據池。";
    }
  })();
  const recommendation =
    usageRecommendation === "primary"
      ? "recommended"
      : usageRecommendation === "secondary"
        ? "supporting"
        : usageRecommendation === "reference"
          ? "check_first"
          : "not_recommended";

  return {
    contentSummary,
    summaryQuality: summaryQuality.quality,
    summaryQualityReason: summaryQuality.reason,
    summarySourceType,
    summaryConfidence,
    summaryWarnings,
    relevanceReasonZhTW:
      topicRelation,
    evidenceSnippets: evidenceProfile.evidenceSnippets,
    originalEvidenceSnippets: evidenceProfile.originalSnippets,
    evidenceChain: evidenceProfile.evidenceChain,
    mainEvidenceFacet: evidenceProfile.mainEvidenceFacet,
    groundingStatus:
      summarySourceType === "metadataFallback"
        ? "metadata_only"
        : summarySourceType === "fulltext" || summarySourceType === "snippet"
          ? "snippet_grounded"
          : "abstract_grounded",
    topicRelation: topicRelation ?? quality.topical.relevanceReasonZhTW,
    recommendation,
    recommendationReason,
    usableSections,
    suitableSectionLabels: suitableSectionLabels(source, assessment),
  };
}
