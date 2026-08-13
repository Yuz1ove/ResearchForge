import type { EvidenceCard } from "./evidenceCards.ts";
import type { ResearchDepth } from "./generateReport.ts";
import { buildStableCitationMarkerMap } from "./sectionEvidencePolicy.ts";
import type { SourceRecord } from "./sourceRecords.ts";

export const RESEARCH_SECTION_KEYS = [
  "title",
  "abstract",
  "introduction",
  "research_question",
  "literature_review",
  "methodology",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
  "references",
] as const;

export type ResearchSectionKey = (typeof RESEARCH_SECTION_KEYS)[number];

export type QualityReadiness = "insufficient" | "preliminary" | "usable" | "strong";

export interface ResearchProject {
  id: string;
  topic: string;
  reportType: string;
  depth: ResearchDepth;
  createdAt: string;
  updatedAt: string;
  status:
    | "draft"
    | "searching"
    | "selecting_sources"
    | "extracting_evidence"
    | "drafting"
    | "judging"
    | "ready_to_export"
    | "exported";
}

export interface ResearchSectionSnapshot {
  id: string;
  key: ResearchSectionKey;
  title: string;
  content: string;
  evidenceCardIds: string[];
  citationIds: string[];
  warnings: string[];
}

export interface QualityReport {
  sourceCount: number;
  acceptedSourceCount: number;
  evidenceCardCount: number;
  missingCitationWarnings: string[];
  unsupportedClaimWarnings: string[];
  overclaimWarnings: string[];
  topicDriftWarnings: string[];
  readiness: QualityReadiness;
}

export interface BuildQualityReportInput {
  topic: string;
  depth: ResearchDepth;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  sections: ResearchSectionSnapshot[];
}

const CAUSAL_MARKERS = /導致|造成|證明|證實|必然|完全|顯示.*因此|根據研究顯示|驗證|confirm|prove|demonstrate/i;
const UNSUPPORTED_MARKERS = /根據研究顯示|由此可知|可見|顯示出|證明|必然|因此必然/i;
const INLINE_CITATION_PATTERN = /[\[［]\s*[SＳsｓ]\s*([0-9０-９]+)\s*[\]］]/giu;
const REQUIRED_SUBSTANTIVE_SECTIONS: ResearchSectionKey[] = [
  "abstract",
  "introduction",
  "research_question",
  "literature_review",
  "methodology",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
];
const CROSS_SECTION_DEDUPE_KEYS = new Set<ResearchSectionKey>([
  "introduction",
  "literature_review",
  "methodology",
  "findings",
  "discussion",
  "limitations",
  "conclusion",
]);
const PLACEHOLDER_PATTERNS = [
  /本節(?:內容)?尚未完成/u,
  /(?:內容|正文|段落|資料|參考資料)(?:尚)?待補/u,
  /尚待(?:撰寫|補充|完成)/u,
  /請補充(?:本節|內容|正文|資料)/u,
  /\b(?:todo|tbd|placeholder)\b/iu,
];
const INTERNAL_LANGUAGE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "supportSpan", pattern: /\b(?:exact\s+)?support\s*span\b|\bsupportspan\b/iu },
  { label: "grounding verifier", pattern: /\bgrounding\s+verifier\b|\bverifier\b/iu },
  { label: "Evidence Card", pattern: /\bevidence\s*cards?\b|證據卡/iu },
  { label: "metadata", pattern: /\bmetadata\b/iu },
  { label: "peer-reviewed evidence", pattern: /\bpeer[-\s]?reviewed\s+evidence\b/iu },
  {
    label: "accepted source 數量",
    pattern:
      /已接受(?:來源)?\s*(?:共|計|數量)?\s*\d+\s*筆|\d+\s*筆(?:已接受|accepted)\s*(?:來源|sources?)/iu,
  },
  {
    label: "internal field",
    pattern:
      /\b(?:acceptedSources?|evidenceCardIds?|citationIds?|sourceIds?|recommendationBucket|retrievalMode|provider_status|debug)\b/iu,
  },
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function withoutInlineCitationMarkers(value: string): string {
  return value.replace(INLINE_CITATION_PATTERN, " ");
}

function contentFingerprint(value: string): string {
  return withoutInlineCitationMarkers(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s。！？!?；;，,、：:"'“”‘’()[\]【】]/gu, "");
}

function contentSentences(value: string): string[] {
  return value
    .replace(/\r\n/gu, "\n")
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function minimumSubstantiveLength(key: ResearchSectionKey): number {
  if (key === "research_question") return 10;
  if (key === "limitations") return 12;
  if (key === "conclusion") return 16;
  return 20;
}

function contentIsSubstantive(section: ResearchSectionSnapshot): boolean {
  const content = cleanText(section.content);
  if (!content) return false;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(content))) return false;
  return contentFingerprint(content).length >= minimumSubstantiveLength(section.key);
}

function buildContentIntegrityWarnings(sections: ResearchSectionSnapshot[]): string[] {
  const warnings: string[] = [];
  const byKey = new Map(sections.map((section) => [section.key, section] as const));

  for (const key of REQUIRED_SUBSTANTIVE_SECTIONS) {
    const section = byKey.get(key);
    if (!section) {
      warnings.push(`缺少 ${key} 章節的實質內容。`);
      continue;
    }
    if (!contentIsSubstantive(section)) {
      warnings.push(`${section.title} 未包含足以構成正式章節的實質內容。`);
    }
  }

  for (const section of sections) {
    const content = cleanText(section.content);
    if (!content || section.key === "title") continue;
    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(content))) {
      warnings.push(`${section.title} 仍含有 placeholder 或待補內容。`);
    }
    const leakedLabels = INTERNAL_LANGUAGE_PATTERNS
      .filter(({ pattern }) => pattern.test(content))
      .map(({ label }) => label);
    if (leakedLabels.length > 0) {
      warnings.push(`${section.title} 含有內部工作語言：${unique(leakedLabels).join("、")}。`);
    }
  }

  const seenSentences = new Map<string, { title: string; key: ResearchSectionKey; sentence: string }>();
  for (const section of sections.filter((item) => CROSS_SECTION_DEDUPE_KEYS.has(item.key))) {
    for (const sentence of contentSentences(section.content)) {
      const fingerprint = contentFingerprint(sentence);
      if (fingerprint.length < 18) continue;
      const existing = seenSentences.get(fingerprint);
      if (existing && existing.key !== section.key) {
        const excerpt = withoutInlineCitationMarkers(sentence).trim().slice(0, 42);
        warnings.push(`${existing.title}與${section.title}重複相同的實質句子：「${excerpt}」。`);
        continue;
      }
      if (!existing) {
        seenSentences.set(fingerprint, { title: section.title, key: section.key, sentence });
      }
    }
  }

  return unique(warnings);
}

function citationMarkersInContent(content: string): Array<{ marker: string; ordinal: number }> {
  return Array.from(content.matchAll(INLINE_CITATION_PATTERN)).flatMap((match) => {
    const ordinal = Number(match[1]?.normalize("NFKC"));
    return Number.isInteger(ordinal) ? [{ marker: `[S${ordinal}]`, ordinal }] : [];
  });
}

function buildInlineCitationIntegrityWarnings(
  sections: ResearchSectionSnapshot[],
  acceptedSources: SourceRecord[],
): string[] {
  const warnings: string[] = [];
  const sourceIdByMarker = new Map(
    Array.from(buildStableCitationMarkerMap(acceptedSources).entries())
      .map(([sourceId, marker]) => [marker, sourceId] as const),
  );

  for (const section of sections) {
    const declaredCitationIds = new Set(section.citationIds.filter(Boolean));
    for (const { marker } of citationMarkersInContent(section.content)) {
      const sourceId = sourceIdByMarker.get(marker);
      if (!sourceId) {
        warnings.push(`${section.title} 含有無法對應 accepted source 的引用標記 ${marker}。`);
        continue;
      }
      if (!declaredCitationIds.has(sourceId)) {
        warnings.push(`${section.title} 的 ${marker} 未與 citationIds 中的來源 ${sourceId} 閉合。`);
      }
    }
  }

  return unique(warnings);
}

function topicKeywords(topic: string): string[] {
  return unique(
    cleanText(topic)
      .split(/[，,。；;：:\s/()（）]+/)
      .filter((term) => term.length >= 2),
  ).slice(0, 5);
}

function readinessFromAcceptedCount(count: number): QualityReadiness {
  if (count <= 2) return "insufficient";
  if (count <= 5) return "preliminary";
  if (count <= 10) return "usable";
  return "strong";
}

function downgradeReadiness(base: QualityReadiness): QualityReadiness {
  if (base === "strong") return "usable";
  if (base === "usable") return "preliminary";
  return base;
}

function sectionHasEvidence(section: ResearchSectionSnapshot): boolean {
  return section.evidenceCardIds.length > 0 || section.citationIds.length > 0;
}

function citationsOutsideAcceptedSources(
  sections: ResearchSectionSnapshot[],
  acceptedSources: SourceRecord[],
): string[] {
  const acceptedSourceIds = new Set(acceptedSources.map((source) => source.id).filter(Boolean));
  const warnings: string[] = [];

  for (const section of sections) {
    const invalid = section.citationIds.filter((citationId) => !acceptedSourceIds.has(citationId));
    if (invalid.length > 0) {
      warnings.push(`${section.title} 含有不在 accepted sources 中的引用：${invalid.slice(0, 3).join("、")}`);
    }
  }

  return warnings;
}

function buildTopicDriftWarnings(topic: string, sections: ResearchSectionSnapshot[]): string[] {
  const keywords = topicKeywords(topic);
  if (keywords.length === 0) return [];

  return sections
    .filter((section) => !["title", "references"].includes(section.key))
    .filter((section) => {
      const content = cleanText(section.content);
      if (!content) return false;
      return !keywords.some((keyword) => content.includes(keyword));
    })
    .map((section) => `${section.title} 可能偏離主題「${topic}」的關鍵詞。`);
}

function buildMissingCitationWarnings(sections: ResearchSectionSnapshot[]): string[] {
  const requiredSections: ResearchSectionKey[] = [
    "abstract",
    "introduction",
    "literature_review",
    "methodology",
    "findings",
    "discussion",
    "conclusion",
  ];
  const byKey = new Map(sections.map((section) => [section.key, section] as const));
  const warnings: string[] = [];

  for (const key of requiredSections) {
    const section = byKey.get(key);
    if (!section) {
      warnings.push(`缺少 ${key} 章節`);
      continue;
    }
    if (!sectionHasEvidence(section)) {
      warnings.push(`${section.title} 尚未連結 evidence card 或 citation`);
    }
  }

  const limitations = byKey.get("limitations");
  if (!limitations) {
    warnings.push("缺少 limitations 章節");
  } else if (!limitations.content.trim()) {
    warnings.push("limitations 章節尚未撰寫");
  }

  const methodology = byKey.get("methodology");
  if (methodology && !methodology.content.trim()) {
    warnings.push("methodology 章節尚未撰寫");
  }

  return warnings;
}

function buildUnsupportedClaimWarnings(
  topic: string,
  depth: ResearchDepth,
  acceptedSourceCount: number,
  sections: ResearchSectionSnapshot[],
): string[] {
  const baseReadiness = readinessFromAcceptedCount(acceptedSourceCount);
  const warnings: string[] = [];
  for (const section of sections) {
    const content = cleanText(section.content);
    if (!content) continue;
    if (!UNSUPPORTED_MARKERS.test(content)) continue;
    if (section.evidenceCardIds.length > 0 && baseReadiness !== "insufficient") continue;
    warnings.push(`${section.title} 含有可能超出證據的推論語氣，需改寫成保守敘述。`);
  }

  if (depth === "quick") {
    warnings.push(`目前為 quick 深度，${topic} 的結論應維持初步草稿語氣。`);
  }

  return warnings;
}

function buildOverclaimWarnings(
  acceptedSourceCount: number,
  evidenceCardCount: number,
  sections: ResearchSectionSnapshot[],
): string[] {
  const warnings: string[] = [];
  const lowEvidence = acceptedSourceCount < 6 || evidenceCardCount < acceptedSourceCount;

  if (!lowEvidence) return warnings;

  for (const section of sections) {
    const content = cleanText(section.content);
    if (!content) continue;
    if (!CAUSAL_MARKERS.test(content)) continue;
    warnings.push(`${section.title} 使用因果語氣但目前證據偏少，建議改為關聯或可能性表述。`);
  }

  return warnings;
}

export function buildQualityReport(input: BuildQualityReportInput): QualityReport {
  const acceptedSourceCount = input.acceptedSources.length;
  const evidenceCardCount = input.evidenceCards.length;
  const sourceReadiness = readinessFromAcceptedCount(acceptedSourceCount);
  const evidenceReadiness = evidenceCardCount === 0
    ? "insufficient"
    : evidenceCardCount < acceptedSourceCount
      ? downgradeReadiness(sourceReadiness)
      : sourceReadiness;

  const missingCitationWarnings = buildMissingCitationWarnings(input.sections);
  const unsupportedClaimWarnings = buildUnsupportedClaimWarnings(input.topic, input.depth, acceptedSourceCount, input.sections);
  const overclaimWarnings = buildOverclaimWarnings(acceptedSourceCount, evidenceCardCount, input.sections);
  const topicDriftWarnings = buildTopicDriftWarnings(input.topic, input.sections);
  const citationWarnings = citationsOutsideAcceptedSources(input.sections, input.acceptedSources);
  const inlineCitationIntegrityWarnings = buildInlineCitationIntegrityWarnings(
    input.sections,
    input.acceptedSources,
  );
  const contentIntegrityWarnings = buildContentIntegrityWarnings(input.sections);
  const combinedMissingCitationWarnings = unique([
    ...missingCitationWarnings,
    ...citationWarnings,
    ...inlineCitationIntegrityWarnings,
  ]);
  const combinedUnsupportedClaimWarnings = unique([
    ...unsupportedClaimWarnings,
    ...contentIntegrityWarnings,
  ]);
  const hardIntegrityWarnings = unique([
    ...combinedMissingCitationWarnings,
    ...contentIntegrityWarnings,
  ]);

  const readinessCandidates: QualityReadiness[] = [
    sourceReadiness,
    evidenceReadiness,
    combinedMissingCitationWarnings.length > 0 ? "preliminary" : "strong",
    combinedUnsupportedClaimWarnings.length > 0 ? "preliminary" : "strong",
    overclaimWarnings.length > 0 ? "preliminary" : "strong",
    topicDriftWarnings.length > 0 ? "preliminary" : "strong",
  ];

  let readiness: QualityReadiness = "strong";
  if (readinessCandidates.includes("insufficient")) readiness = "insufficient";
  else if (readinessCandidates.includes("preliminary")) readiness = "preliminary";
  else if (readinessCandidates.includes("usable")) readiness = "usable";

  if (acceptedSourceCount === 0) readiness = "insufficient";
  else if (acceptedSourceCount <= 2) readiness = "insufficient";
  else if (acceptedSourceCount <= 5 && readiness === "strong") readiness = "preliminary";
  else if (acceptedSourceCount <= 10 && readiness === "strong") readiness = "usable";

  if (evidenceCardCount === 0) readiness = "insufficient";
  if ((combinedUnsupportedClaimWarnings.length > 0 || overclaimWarnings.length > 0 || topicDriftWarnings.length > 0) && readiness === "strong") {
    readiness = "usable";
  }
  if (
    hardIntegrityWarnings.length > 0 &&
    (readiness === "strong" || readiness === "usable")
  ) {
    readiness = "preliminary";
  }

  return {
    sourceCount: acceptedSourceCount,
    acceptedSourceCount,
    evidenceCardCount,
    missingCitationWarnings: combinedMissingCitationWarnings,
    unsupportedClaimWarnings: combinedUnsupportedClaimWarnings,
    overclaimWarnings: unique(overclaimWarnings),
    topicDriftWarnings: unique(topicDriftWarnings),
    readiness,
  };
}
