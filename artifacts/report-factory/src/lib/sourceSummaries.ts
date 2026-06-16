import {
  classifySourceRecord,
  normalizeUsableSections,
  SOURCE_CATEGORY_LABELS,
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
  "此來源與主題可能相關，但摘要不足，建議開啟原始來源確認研究內容。";

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
  return `${chars.slice(0, maxLength - 1).join("").trim()}…`;
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
  const selected = sentences.length ? sentences.slice(0, 2).join(" ") : cleanText(source.abstract);
  return truncateText(normalizeDisplayTextToZhTw(selected), 170);
}

export function sourceRecommendedSections(source: SourceRecord): WorkflowReportSection[] {
  const explicit = normalizeUsableSections(source.usableSections);
  if (explicit.length) return explicit;

  const text = textForSectionHints(source);
  const category = classifySourceRecord(source);
  const sections: WorkflowReportSection[] = [];

  if (category === "academic_paper" || category === "journal_article" || /study|research|review|literature|論文|研究|文獻/.test(text)) {
    pushUnique(sections, "文獻探討");
  }
  if (category === "government_or_institution" || /report|statistics|data|survey|政府|統計|調查|資料|政策/.test(text)) {
    pushUnique(sections, "數據分析");
    pushUnique(sections, "研究背景");
  }
  if (/method|experiment|sample|survey|interview|方法|實驗|樣本|訪談|問卷/.test(text)) {
    pushUnique(sections, "研究方法");
  }
  if (/result|impact|effect|conclusion|finding|影響|結果|結論|成效/.test(text)) {
    pushUnique(sections, "結論");
  }
  if (/background|overview|introduction|history|背景|概述|歷史|現況/.test(text)) {
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
    return `摘要不足；可先作為${label}線索，但接受前建議開啟原文確認。`;
  }
  if (!hasLocator) {
    return `可支援${sections}，但 DOI 或 URL 待補，正式引用前需補齊位置。`;
  }
  return `可優先判斷是否支援${sections}；接受後會進入報告資料基礎。`;
}

export interface SourceSummaryForUser {
  contentSummary: string;
  evidenceSnippets: string[];
  originalEvidenceSnippets: string[];
  groundingStatus: EvidenceGrounding;
  topicRelation: string;
  recommendation: "recommended" | "supporting" | "check_first" | "not_recommended";
  recommendationReason: string;
  usableSections: WorkflowReportSection[];
  suitableSectionLabels: string[];
}

function topicCoreLabel(profile: SourceIntentProfile): string {
  return profile.coreConcepts.slice(0, 3).join("、") || "使用者主題";
}

function relationFromAssessment(
  source: SourceRecord,
  topic: string,
  profile: SourceIntentProfile,
  assessment: SourceRelevanceAssessment,
): string {
  const topicText = cleanText(topic) || "本主題";

  if (assessment.relevanceLevel === "primary") {
    const matched = assessment.matchedFacets.slice(0, 2).join("、") || topicCoreLabel(profile);
    return `此來源直接支撐「${topicText}」的${matched}，可作為主要證據候選。`;
  }

  if (assessment.relevanceLevel === "secondary") {
    return `此來源與「${topicText}」相關，但主要作為影響、政策或延伸脈絡，不適合作為成因/現況主證據。`;
  }

  if (assessment.relevanceLevel === "clue") {
    return `此來源題名與「${topicText}」有初步關聯，但目前缺少可驗證摘要片段，需開啟原文確認。`;
  }

  if (assessment.relevanceLevel === "off_topic" || assessment.relevanceLevel === "low") {
    return "此來源雖可能出現部分相近詞，但主要內容與本主題關聯不足，不建議納入。";
  }

  return `此來源可先作為「${topicText}」的延伸線索，但仍需確認內容是否能支撐研究問題。`;
}

function recommendationFromAssessment(
  source: SourceRecord,
  assessment: SourceRelevanceAssessment,
): SourceSummaryForUser["recommendation"] {
  if (assessment.relevanceLevel === "off_topic" || assessment.relevanceLevel === "low") return "not_recommended";
  if (assessment.relevanceLevel === "clue" || !sourceHasUsableAbstract(source)) return "check_first";
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
    return "可作輔助：此來源可補充延伸背景或輔助論述，但不宜單獨作為主證據。";
  }
  if (recommendation === "check_first") {
    return assessment.reasons.some((reason) => reason.includes("摘要不足"))
      ? "需開啟原文確認：此來源可能相關，但摘要不足。"
      : "需開啟原文確認：此來源有線索，但仍需確認內容是否足以支撐正式證據。";
  }
  return "不建議採用：此來源低相關或離題，不建議納入主要證據池。";
}

function suitableSectionLabels(source: SourceRecord, assessment: SourceRelevanceAssessment): string[] {
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

  if (/成因|greenhouse|fossil|carbon dioxide|co2|methane|emission|anthropogenic|溫室氣體|化石燃料|二氧化碳|甲烷|排放|人為/.test(text)) {
    labels.push("成因分析");
  }
  if (/現況|observed|temperature|concentration|indicator|trend|sea level|ipcc|wmo|nasa|noaa|全球升溫|濃度|趨勢|海平面/.test(text)) {
    labels.push("現況分析");
  }
  if (/data|statistics|indicator|trend|concentration|temperature|emission|數據|統計|指標|趨勢|濃度/.test(text)) {
    labels.push("數據背景");
  }
  if (/journal|review|study|assessment|文獻|研究|論文|期刊|評估/.test(text) || source.sourceCategory === "journal_article" || source.sourceCategory === "academic_paper") {
    labels.push("文獻探討");
  }
  if (assessment.relevanceLevel === "secondary" || /impact|policy|finance|adaptation|effect|影響|政策|金融|調適|因應/.test(text)) {
    labels.push("延伸影響");
  }

  return Array.from(new Set(labels)).slice(0, 3);
}

export function sourceContentSummary(source: SourceRecord): string {
  return sourceSummaryText(source);
}

export function sourceTopicRelation(source: SourceRecord, topic: string, profile = buildSourceIntentProfile(topic)): string {
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
  const assessment = buildSourceRelevanceAssessment(source, profile);
  const recommendation = sourceAdoptionRecommendation(source, assessment);
  const evidenceProfile = buildSourceEvidenceProfile(source, buildTopicFacets(topic));
  const usableSections = sourceRecommendedSections(source);

  return {
    contentSummary: evidenceProfile.summaryZhTw || sourceContentSummary(source),
    evidenceSnippets: evidenceProfile.evidenceSnippets,
    originalEvidenceSnippets: evidenceProfile.originalSnippets,
    groundingStatus: evidenceProfile.groundingStatus,
    topicRelation: relationFromAssessment(source, topic, profile, assessment),
    recommendation,
    recommendationReason: recommendationReason(recommendation, assessment),
    usableSections,
    suitableSectionLabels: suitableSectionLabels(source, assessment),
  };
}
