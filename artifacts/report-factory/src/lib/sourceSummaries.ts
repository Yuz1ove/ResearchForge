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
  topicRelation: string;
  recommendation: "recommended" | "check_first" | "not_recommended";
  recommendationReason: string;
  usableSections: WorkflowReportSection[];
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
  const title = cleanText(source.title);
  const topicText = cleanText(topic) || "本主題";
  const matched = assessment.matchedCoreConcepts.slice(0, 3).join("、");
  const sections = sourceRecommendedSections(source).join("、");

  if (assessment.relevanceLevel === "off_topic" || assessment.relevanceLevel === "low") {
    return "此來源雖可能出現部分相近詞，但主要內容與本主題關聯不足，不建議納入。";
  }

  if (!sourceHasUsableAbstract(source)) {
    return `此來源標題與「${topicText}」有初步關聯，但摘要不足，建議開啟原文確認後再判斷是否可支撐${sections}。`;
  }

  if (matched) {
    return `此來源命中${matched}等核心概念，可作為「${topicText}」中${topicCoreLabel(profile)}相關面向的佐證。`;
  }

  return title
    ? `此來源題名為「${title}」，可先作為「${topicText}」的延伸線索，但仍需確認內容是否能支撐${sections}。`
    : `此來源可先作為「${topicText}」的延伸線索，但仍需確認內容是否能支撐${sections}。`;
}

function recommendationFromAssessment(
  source: SourceRecord,
  assessment: SourceRelevanceAssessment,
): SourceSummaryForUser["recommendation"] {
  if (assessment.relevanceLevel === "off_topic" || assessment.relevanceLevel === "low") return "not_recommended";
  if (!sourceHasUsableAbstract(source)) return "check_first";
  if (assessment.shouldRecommendAccept) return "recommended";
  return "check_first";
}

function recommendationReason(
  recommendation: SourceSummaryForUser["recommendation"],
  assessment: SourceRelevanceAssessment,
): string {
  if (recommendation === "recommended") {
    return "此來源主題相關性高，且摘要足以先判斷內容，可優先考慮接受。";
  }
  if (recommendation === "check_first") {
    return assessment.reasons.some((reason) => reason.includes("摘要不足"))
      ? "此來源可能相關，但摘要不足，接受前建議先開啟原文確認。"
      : "此來源有可用線索，但仍需確認內容是否足以支撐正式證據。";
  }
  return "此來源低相關或離題，不建議納入主要證據池。";
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

  return {
    contentSummary: sourceContentSummary(source),
    topicRelation: relationFromAssessment(source, topic, profile, assessment),
    recommendation,
    recommendationReason: recommendationReason(recommendation, assessment),
    usableSections: sourceRecommendedSections(source),
  };
}
