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
import { buildTopicFacets } from "./topicFacets.ts";

const FALLBACK_SUMMARY =
  "本來源目前缺少可用摘要，可先作為背景線索或資料缺口說明；若要作為主要證據，仍需補充可驗證摘要或原文片段。";

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

function topicLabel(topic: string): string {
  return cleanText(topic) || "本研究主題";
}

function summaryFocusKeywords(text: string): string[] {
  const normalized = cleanText(text).toLowerCase();
  const focus: string[] = [];
  if (/greenhouse gas|greenhouse gases|溫室氣體/.test(normalized))
    focus.push("溫室氣體");
  if (/carbon dioxide|co2|二氧化碳/.test(normalized)) focus.push("二氧化碳");
  if (/methane|甲烷/.test(normalized)) focus.push("甲烷");
  if (/fossil fuel|fossil fuels|化石燃料/.test(normalized))
    focus.push("化石燃料");
  if (/observed warming|global warming|temperature trend|全球升溫|溫度趨勢/.test(normalized))
    focus.push("觀測升溫");
  if (/sea level|海平面/.test(normalized)) focus.push("海平面");
  if (/spider|spiders|arachnid|araneae|蜘蛛|蛛形綱/.test(normalized))
    focus.push("蜘蛛主體");
  if (/habitat|microhabitat|棲地|微棲地/.test(normalized))
    focus.push("棲地需求");
  if (/predation|prey capture|foraging|捕食|獵食|覓食/.test(normalized))
    focus.push("捕食策略");
  if (/anti-predator|anti predator|camouflage|避敵|偽裝/.test(normalized))
    focus.push("避敵行為");
  if (/web building|web-building|web|築網|蛛網/.test(normalized))
    focus.push("築網行為");
  if (/survival|adaptation|behavior|behaviour|生存|適應|行為/.test(normalized))
    focus.push("生存適應");
  if (/ecology|ecological|生態/.test(normalized)) focus.push("生態關係");
  return Array.from(new Set(focus));
}

function sourceTypeNoun(source: SourceRecord): string {
  const category = classifySourceRecord(source);
  return SOURCE_CATEGORY_LABELS[category] ?? "研究來源";
}

function englishAbstractCueSummary(
  source: SourceRecord,
  topic: string,
  assessment?: SourceRelevanceAssessment,
): string {
  const topicText = topicLabel(topic);
  const title = cleanText(source.title) || "此來源";
  const focusKeywords = summaryFocusKeywords(
    `${source.title ?? ""} ${source.abstract ?? ""}`,
  ).slice(0, 5);
  const facets = assessment?.matchedFacets?.slice(0, 2) ?? [];
  const focusText = focusKeywords.length
    ? focusKeywords.join("、")
    : facets.length
      ? facets.join("、")
      : "主題背景與研究線索";
  const sectionText =
    sourceRecommendedSections(source).slice(0, 2).join("、") ||
    "研究背景與文獻探討";

  return truncateText(
    `本${sourceTypeNoun(source)}〈${title}〉可提供${focusText}相關資料，能用來支撐「${topicText}」的${sectionText}討論。若要形成正式結論，仍應確認摘要片段是否直接對應研究問題。`,
    220,
  );
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
  if (!sourceHasUsableAbstract(source)) return FALLBACK_SUMMARY;

  const sentences = splitSentences(source.abstract ?? "");
  const selected = sentences.length
    ? sentences.slice(0, 2).join(" ")
    : cleanText(source.abstract);
  const translated = normalizeDisplayTextToZhTw(selected);
  if (/^[\x00-\x7F\s.,;:'"!?()[\]-]+$/.test(translated)) {
    return truncateText(englishAbstractCueSummary(source, ""), 170);
  }
  return truncateText(translated, 170);
}

export function sourceParagraphSummary(
  source: SourceRecord,
  topic: string,
  assessment?: SourceRelevanceAssessment,
): string {
  const title = cleanText(source.title) || "此來源";
  const topicText = topicLabel(topic);
  const abstract = cleanText(source.abstract);
  const facets = assessment?.matchedFacets?.slice(0, 2) ?? [];
  const sections = sourceRecommendedSections(source).slice(0, 2).join("、");

  if (abstract.length >= 24) {
    const focusKeywords = summaryFocusKeywords(`${title} ${abstract}`).slice(0, 5);
    const focusText = focusKeywords.length
      ? `摘要可辨識的重點包括${focusKeywords.join("、")}。`
      : "";
    const evidenceFocus = facets.length
      ? `目前可見內容主要連到${facets.join("、")}。`
      : `目前可見內容可用來輔助判斷「${topicText}」的研究脈絡。`;
    return truncateText(
      normalizeDisplayTextToZhTw(
        `這篇來源〈${title}〉的摘要顯示，${focusText || "摘要內容提供主題相關線索。"}${evidenceFocus}它可支撐報告中的${sections || "研究背景與文獻探討"}段落。`,
      ),
      240,
    );
  }

  if (
    cleanText(source.containerTitle) ||
    cleanText(source.publisher) ||
    facets.length > 0
  ) {
    const metadataFocus = facets.length
      ? `題名或出版資訊與${facets.join("、")}有初步關聯`
      : `題名或出版資訊與「${topicText}」有初步關聯`;
    return `此來源〈${title}〉目前主要提供書目資料，${metadataFocus}；可作為背景或延伸線索，若要成為主要證據仍需補充可驗證摘要。`;
  }

  return `此來源〈${title}〉目前只有基本書目資訊，可標示研究缺口，但不足以支撐正式結論。`;
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
  const hasAbstract = sourceHasUsableAbstract(source);
  const hasLocator = Boolean(cleanText(source.doi) || cleanText(source.url));
  const sections = sourceRecommendedSections(source).join("、");

  if (!hasAbstract) {
    return `摘要資料不足；系統會先把它作為${label}線索，不列入主要證據候選。`;
  }
  if (!hasLocator) {
    return `可支援${sections}，但 DOI 或 URL 待補，正式引用前需補齊位置。`;
  }
  return `可優先判斷是否支援${sections}；接受後會進入報告資料基礎。`;
}

export interface SourceSummaryForUser {
  contentSummary: string;
  summaryQuality: "good" | "partial" | "poor" | "irrelevant";
  summaryQualityReason: string;
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
      source.shouldShowInMainList ?? relevanceLevel === "primary",
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

  if (assessment.relevanceLevel === "primary") {
    const matched =
      assessment.matchedFacets.slice(0, 2).join("、") ||
      topicCoreLabel(profile);
    return `此來源直接支撐「${topicText}」的${matched}，可作為主要證據候選。`;
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
  const assessment = metadataBackedAssessment(
    source,
    buildSourceRelevanceAssessment(source, profile),
  );
  const recommendation = sourceAdoptionRecommendation(source, assessment);
  const evidenceProfile = buildSourceEvidenceProfile(
    source,
    buildTopicFacets(topic),
  );
  const usableSections = sourceRecommendedSections(source);
  const summaryQuality = summaryQualityFromAssessment(
    source,
    assessment,
    evidenceProfile,
  );
  const llmSummary = cleanText(source.llmSummaryZhTw) || null;
  const contentSummary =
    llmSummary ??
    (evidenceProfile.evidenceSnippets.length > 0
      ? sourceParagraphSummary(source, topic, assessment)
      : !sourceHasUsableAbstract(source)
        ? evidenceProfile.summaryZhTw
        : sourceParagraphSummary(source, topic, assessment));

  return {
    contentSummary,
    summaryQuality: summaryQuality.quality,
    summaryQualityReason: summaryQuality.reason,
    evidenceSnippets: evidenceProfile.evidenceSnippets,
    originalEvidenceSnippets: evidenceProfile.originalSnippets,
    evidenceChain: evidenceProfile.evidenceChain,
    mainEvidenceFacet: evidenceProfile.mainEvidenceFacet,
    groundingStatus: evidenceProfile.groundingStatus,
    topicRelation: relationFromAssessment(source, topic, profile, assessment),
    recommendation,
    recommendationReason: recommendationReason(recommendation, assessment),
    usableSections,
    suitableSectionLabels: suitableSectionLabels(source, assessment),
  };
}
