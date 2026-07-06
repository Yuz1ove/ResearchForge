import {
  acceptedSourceRecords,
  defaultUsableSections,
  normalizeUsableSections,
  sourceRecordKey,
  sourceReviewState,
  type SourceRecord,
  type WorkflowReportSection,
  WORKFLOW_REPORT_SECTIONS,
} from "./sourceRecords.ts";
import { buildSourceEvidenceProfile } from "./sourceEvidence.ts";
import { sourceHasUsableAbstract } from "./sourceSummaries.ts";
import { buildTopicFacets } from "./topicFacets.ts";
import type { EvidenceCardSafety, EvidenceDerivation } from "@workspace/api-zod";

export interface EvidenceCard {
  id: string;
  evidenceId: string;
  evidenceCardId?: string;
  workflowId: string | null;
  topicHash: string | null;
  sourceId: string;
  claimIds?: string[];
  claimTextOriginal?: string;
  claimTextZh?: string;
  supportedByText?: string;
  citationMarker: string;
  title: string;
  sourceType: string;
  reliability: string;
  claim: string;
  claimTextZhTw: string;
  mainClaimZhTw?: string;
  mainClaim: string;
  evidence: string;
  evidencePointZhTw: string;
  usableEvidence: string;
  quoteOrParaphrase: string;
  summary: string;
  sourceExcerptOriginal: string;
  sourceSummaryZhTw: string;
  supportingClaims?: unknown[];
  supportSpans?: Array<{
    claimId?: string;
    text?: string;
    startOffset?: number;
    endOffset?: number;
    pageStart?: number;
    pageEnd?: number;
    sectionHeading?: string;
  }>;
  relevance: string;
  limitations: string[];
  limitationsZhTw: string[];
  sectionTargets: string[];
  sourceTitle: string;
  sourceUrl: string | null;
  sourceDomain: string;
  sourceProvider: string;
  sourceAccessLevel?: string | null;
  extractionStatus?: string | null;
  evidenceType?: string | null;
  sourceLocation?: string | null;
  sectionHeading?: string | null;
  extractionMethod?: string | null;
  quotedText?: string | null;
  trace?: {
    provider?: string;
    query_used?: string;
    url?: string;
    doi?: string;
    extraction_method?: string;
    content_hash?: string;
  } | null;
  sourceCategory: string | null;
  recommendationBucket?: SourceRecord["recommendationBucket"];
  sourceRole?: SourceRecord["sourceRole"];
  retrievalMode?: SourceRecord["retrievalMode"];
  isPeerReviewed?: boolean | null;
  venue?: string | null;
  providerHealthSnapshot?: unknown | null;
  acceptedByUser?: boolean | null;
  userDecision?: SourceRecord["userDecision"];
  acceptedAs?: string | null;
  doi: string | null;
  abstract: string | null;
  provider: string;
  relevanceScore: number | null;
  sourceQualityScore: number | null;
  finalScore: number | null;
  year: number | null;
  usableSections: WorkflowReportSection[];
  confidence: string | null;
  confidenceScore: number;
  derivation: EvidenceDerivation;
  abstractOnly?: boolean;
  limitation: string | null;
  citationText: string;
  pageOrLocation?: string;
  createdAt: string;
  notes: string;
  safety?: EvidenceCardSafety;
  needsManualReview?: boolean | null;
  governanceFlags?: string[];
}

export interface EvidenceCoverageWarning {
  code:
    | "accepted-sources-below-recommended"
    | "evidence-cards-below-accepted-sources"
    | "missing-background-evidence"
    | "missing-literature-evidence";
  message: string;
}

export interface EvidenceCoverageSummary {
  acceptedSourceCount: number;
  evidenceCardCount: number;
  sectionCounts: Record<WorkflowReportSection, number>;
  warnings: EvidenceCoverageWarning[];
  positiveStatuses: string[];
  isBasicReady: boolean;
}

interface BuildEvidenceCardOptions {
  resetText?: boolean;
  topic?: string;
  createdAt?: string;
}

const RECOMMENDED_ACCEPTED_SOURCE_COUNT = 10;
const ZH_TW_SUMMARY_FALLBACK_NOTICE = "此來源尚未完成繁中摘要";

function sourceEligibleForEvidenceCard(source: SourceRecord): boolean {
  if (sourceReviewState(source) !== "accepted") return false;
  if (
    source.classification === "off_topic" ||
    source.classification === "trusted_but_off_topic" ||
    source.classification === "stale_topic" ||
    source.classification === "stale_workflow"
  ) {
    return false;
  }
  if (source.usageRecommendation === "exclude") return false;
  if (
    source.relevanceLevel === "off_topic" ||
    source.relevanceLevel === "low" ||
    source.relevanceLevel === "clue"
  ) {
    return false;
  }
  if (
    source.recommendationBucket === "manual_review" &&
    !(source.acceptedByUser || source.userDecision === "accepted_as_manual_review")
  ) {
    return false;
  }
  return source.topicalRelevanceLabel !== "irrelevant";
}

function sourceId(source: SourceRecord): string {
  return source.id || sourceRecordKey(source);
}

function sourceDomain(url: string | null | undefined): string {
  if (!url) return "網域待確認";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "網域待確認";
  }
}

function compactEvidenceText(source: SourceRecord): string {
  const abstract = source.abstract?.trim();
  if (abstract) {
    const firstSentence = abstract.split(/(?<=[.!?。！？])\s+/)[0]?.trim();
    if (firstSentence) return localizeAcademicPhrases(firstSentence);
  }
  const locator = source.doi ? `DOI：${source.doi}` : source.url;
  return locator ? `來源位置：${locator}` : "此來源已接受，但仍缺少可驗證的重點摘錄。";
}

function cleanFragment(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").replace(/[。！？.!?；，、\s]+$/u, "").trim() ?? "";
}

function looksMostlyAscii(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return Boolean(text) && /^[\x00-\x7F\s.,;:'"!?()[\]{}<>/%+-]+$/.test(text);
}

function localizeAcademicPhrases(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bsodium perchlorate\b/giu, "過氯酸鈉"],
    [/\bNaClO4\b/gu, "過氯酸鈉（NaClO4）"],
    [/\breactivity profile\b/giu, "反應性特徵"],
    [/\bstrong oxidizing agent\b/giu, "強氧化劑"],
    [/\bfriction-sensitive mixture\b/giu, "對摩擦敏感的混合物"],
    [/\bemergency response\b/giu, "緊急應變"],
    [/\blaboratory\b/giu, "實驗室"],
    [/\bhandling\b/giu, "操作"],
    [/\bstorage\b/giu, "儲存"],
    [/\bheat hazards?\b/giu, "受熱危害"],
    [/\bfire hazards?\b/giu, "火災危害"],
    [/orientation estimation/giu, "姿態估計"],
    [/attitude estimation/giu, "姿態估計"],
    [/sensor fusion/giu, "感測器融合"],
    [/micromachined gyroscope/giu, "微機電陀螺儀"],
    [/inertial measurement units?/giu, "慣性量測單元"],
    [/\bIMU\b/gu, "慣性量測單元"],
    [/gyroscope/giu, "陀螺儀"],
    [/navigation/giu, "導航"],
    [/rigid body dynamics/giu, "剛體動力學"],
    [/angular momentum/giu, "角動量"],
    [/rotational stability/giu, "旋轉穩定性"],
    [/gyroscopic stability/giu, "陀螺穩定性"],
    [/precession/giu, "進動"],
    [/torque/giu, "扭矩"],
    [/spinning top/giu, "陀螺"],
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function snippetMainClaim(
  snippet: { snippetZhTw?: string; reasoningZhTw?: string; matchedFacet?: string },
): string {
  return (
    cleanFragment(snippet.snippetZhTw) ||
    cleanFragment(snippet.reasoningZhTw) ||
    cleanFragment(snippet.matchedFacet) ||
    "此片段提供可驗證的研究線索"
  );
}

function fallbackMainClaim(source: SourceRecord, summaryText: string): string {
  return (
    cleanFragment(source.evidenceSummaryZhTw) ||
    cleanFragment(source.sourceRelevanceReasonZhTw) ||
    cleanFragment(localizeAcademicPhrases(summaryText)) ||
    (source.title?.trim() ? `此來源討論${source.title.trim()}` : "此來源提供研究線索")
  );
}

function preferredZhSummary(source: SourceRecord, fallback = ""): string {
  return (
    cleanFragment(source.readableSummaryZhTW) ||
    cleanFragment(source.readableSummaryZhTw) ||
    cleanFragment(source.mainEvidencePointZhTw) ||
    cleanFragment(source.evidenceSummaryZhTw) ||
    cleanFragment(source.abstractZhTw) ||
    cleanFragment(fallback)
  );
}

function confidenceScore(source: SourceRecord, hasSnippet: boolean): number {
  const sourceConfidence = source.confidence?.trim();
  if (source.evidenceGrounding === "metadata_only" || source.evidenceGrounding === "insufficient") return 0.35;
  if (!sourceHasUsableAbstract(source)) return 0.35;
  if (hasSnippet && sourceConfidence === "高") return 0.74;
  if (hasSnippet && sourceConfidence === "中") return 0.66;
  if (hasSnippet) return 0.58;
  if (sourceConfidence === "高") return 0.6;
  if (sourceConfidence === "中") return 0.52;
  return 0.42;
}

function evidenceDerivation(source: SourceRecord, hasSnippet: boolean): EvidenceDerivation {
  if (source.evidenceGrounding === "snippet_grounded") return "fulltext-derived";
  if (hasSnippet || sourceHasUsableAbstract(source)) return "abstract-derived";
  return "metadata-derived";
}

function limitationForEvidence(source: SourceRecord, derivation: EvidenceDerivation): string | null {
  if (derivation === "fulltext-derived") return null;
  if (derivation === "abstract-derived") return "目前依題名、摘要與書目資料整理證據；尚未讀取全文，不能編造頁碼或超出摘要內容。";
  if (source.abstract?.trim()) return "摘要過短，僅能作為書目與主題線索；正式結論需補充更完整的可驗證摘要。";
  return "此來源尚無摘要，僅可建立書目線索，不可產生具體研究結論。";
}

function sourceIsOfficialBackground(source: SourceRecord): boolean {
  if (source.recommendationBucket === "official_background") return true;
  if (
    source.doi ||
    source.isPeerReviewed ||
    source.sourceType === "Crossref" ||
    source.sourceType === "OpenAlex" ||
    source.sourceType === "Semantic Scholar"
  ) {
    return false;
  }
  const text = [
    source.recommendationBucket,
    source.sourceType,
    source.sourceKind,
    source.sourceCategory,
    source.provider,
    source.publisher,
    source.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\bofficial_background\b|official source|institutional source|government|education|educational|university|extension|encyclopedia|nasa|ucar|noaa|\.gov|\.edu/.test(text);
}

function evidenceCardSourceType(source: SourceRecord): string {
  if (source.recommendationBucket === "official_background") return "official_background";
  if (sourceIsOfficialBackground(source)) return "institutional_education";
  return source.sourceType;
}

function evidenceLimitations(source: SourceRecord, derivation: EvidenceDerivation): string[] {
  const limitations = [
    limitationForEvidence(source, derivation),
    sourceIsOfficialBackground(source)
      ? "非同行評審論文；只能作為官方教育或機構背景說明，不可支撐學術因果、統計顯著或系統性文獻回顧結論。"
      : null,
  ].filter((item): item is string => Boolean(item));
  return Array.from(new Set(limitations));
}

function citationText(source: SourceRecord): string {
  const author = source.authors[0]?.trim() || source.publisher?.trim() || "作者待確認";
  const year = source.year ?? "年份待確認";
  return `${author}（${year}）`;
}

function reliabilityLabel(source: SourceRecord, hasSnippet: boolean): string {
  const score =
    source.finalScore ??
    source.sourceQualityScore ??
    source.relevanceScore ??
    source.evidenceQuality ??
    source.topicRelevance ??
    null;
  if (typeof score === "number") {
    if (score >= 80) return "高";
    if (score >= 60) return "中";
    return "有限";
  }
  if (source.confidence === "高") return "高";
  if (source.confidence === "中") return "中";
  if (hasSnippet) return "中";
  return "有限";
}

function sectionTargetsForEvidence(
  sections: WorkflowReportSection[],
): string[] {
  const targets = new Set<string>();
  for (const section of sections) {
    switch (section) {
      case "研究背景":
        targets.add("abstract");
        targets.add("introduction");
        targets.add("research_question");
        break;
      case "文獻探討":
        targets.add("abstract");
        targets.add("research_question");
        targets.add("literature_review");
        targets.add("discussion");
        targets.add("conclusion");
        break;
      case "研究方法":
        targets.add("methodology");
        targets.add("limitations");
        break;
      case "數據分析":
        targets.add("abstract");
        targets.add("findings");
        targets.add("discussion");
        targets.add("conclusion");
        break;
      case "結論":
        targets.add("discussion");
        targets.add("limitations");
        targets.add("conclusion");
        break;
    }
  }
  return Array.from(targets);
}

function sourceToEvidenceCards(
  source: SourceRecord,
  _ordinal: number,
  options: Pick<BuildEvidenceCardOptions, "topic" | "createdAt">,
): EvidenceCard[] {
  const id = sourceId(source);
  const title = source.title || "標題待確認";
  const usableSections = normalizeUsableSections(source.usableSections);
  const evidenceProfile = buildSourceEvidenceProfile(source, buildTopicFacets(options.topic ?? ""));
  const baseSections = sourceIsOfficialBackground(source)
    ? (["研究背景"] as WorkflowReportSection[])
    : usableSections.length
      ? usableSections
      : defaultUsableSections();
  const snippets = evidenceProfile.evidenceSnippets.slice(0, 3);
  const cards: EvidenceCard[] = [];
  const sourceFacts = (source.sourceFacts ?? [])
    .filter((fact) => fact.fact.trim() && fact.supportedByText.trim())
    .sort((a, b) => b.relevanceToTopic - a.relevanceToTopic)
    .slice(0, 3);

  if (sourceFacts.length > 0) {
    sourceFacts.forEach((fact, index) => {
      const derivation = evidenceDerivation(source, true);
      const limitations = evidenceLimitations(source, derivation);
      const originalEvidence = fact.supportedByText || compactEvidenceText(source);
      const sourceSummaryZh = preferredZhSummary(source, fact.fact);
      const summaryIsFallbackNotice = sourceSummaryZh.includes(
        ZH_TW_SUMMARY_FALLBACK_NOTICE,
      );
      const localizedClaim = looksMostlyAscii(fact.fact)
        ? summaryIsFallbackNotice
          ? localizeAcademicPhrases(fact.fact)
          : preferredZhSummary(source, localizeAcademicPhrases(fact.fact))
        : fact.fact;
      const localizedEvidence = looksMostlyAscii(originalEvidence)
        ? summaryIsFallbackNotice
          ? localizeAcademicPhrases(originalEvidence)
          : preferredZhSummary(
              source,
              !looksMostlyAscii(fact.fact) ? fact.fact : localizeAcademicPhrases(originalEvidence),
            )
        : originalEvidence;
      cards.push({
        id: `evidence:${id}:fact:${index + 1}`,
        evidenceId: `evidence:${id}:fact:${index + 1}`,
        workflowId: source.workflowId ?? null,
        topicHash: source.topicHash ?? null,
        sourceId: id,
        citationMarker: citationText(source),
        title,
        sourceType: evidenceCardSourceType(source),
        reliability: reliabilityLabel(source, true),
        claim: localizedClaim,
        claimTextZhTw: localizedClaim,
        mainClaim: localizedClaim,
        evidence: localizedEvidence,
        evidencePointZhTw: localizedEvidence,
        usableEvidence: localizedEvidence,
        quoteOrParaphrase: localizedEvidence,
        summary: sourceSummaryZh || localizedClaim,
        sourceExcerptOriginal: originalEvidence,
        sourceSummaryZhTw: sourceSummaryZh || localizedClaim,
        relevance: fact.category,
        limitations,
        limitationsZhTw: limitations,
        sectionTargets: sectionTargetsForEvidence(baseSections),
        sourceTitle: title,
        sourceUrl: source.url,
        sourceDomain: sourceDomain(source.url),
        sourceProvider: source.sourceType,
        sourceAccessLevel: source.accessLevel ?? null,
        evidenceType: fact.category,
        sourceLocation: "sourceFact",
        sectionHeading: null,
        extractionMethod: source.extractionMethod ?? null,
        quotedText: originalEvidence,
        trace: {
          provider: source.provider ?? source.sourceType,
          query_used: source.queryUsed ?? undefined,
          url: source.url ?? undefined,
          doi: source.doi ?? undefined,
          extraction_method: source.extractionMethod ?? undefined,
          content_hash: source.contentHash ?? undefined,
        },
        sourceCategory: source.sourceCategory?.trim() || null,
        recommendationBucket: source.recommendationBucket ?? null,
        sourceRole: source.sourceRole ?? null,
        retrievalMode: source.retrievalMode ?? null,
        isPeerReviewed: source.isPeerReviewed ?? null,
        venue: source.containerTitle ?? null,
        providerHealthSnapshot: source.providerHealthSnapshot ?? null,
        acceptedByUser: source.acceptedByUser ?? null,
        userDecision: source.userDecision ?? null,
        acceptedAs: source.acceptedAs ?? null,
        doi: source.doi,
        abstract: source.abstract,
        provider: source.provider || source.sourceType,
        relevanceScore: source.relevanceScore ?? null,
        sourceQualityScore: source.sourceQualityScore ?? null,
        finalScore: source.finalScore ?? null,
        year: source.year,
        usableSections: baseSections,
        confidence: source.confidence?.trim() || null,
        confidenceScore: Math.max(confidenceScore(source, true), fact.relevanceToTopic),
        derivation,
        abstractOnly: derivation !== "fulltext-derived",
        limitation: limitations[0] ?? null,
        citationText: citationText(source),
        pageOrLocation: "sourceFact",
        createdAt: options.createdAt ?? new Date().toISOString(),
        notes: source.reviewNotes?.trim() || "",
      });
    });
    return cards;
  }

  if (snippets.length > 0) {
    snippets.forEach((snippet, index) => {
      const evidence = snippet.snippetZhTw || snippet.reasoningZhTw || compactEvidenceText(source);
      const derivation = evidenceDerivation(source, true);
      const limitations = evidenceLimitations(source, derivation);
      cards.push({
        id: `evidence:${id}:${index + 1}`,
        evidenceId: `evidence:${id}:${index + 1}`,
        workflowId: source.workflowId ?? null,
        topicHash: source.topicHash ?? null,
        sourceId: id,
        citationMarker: citationText(source),
        title,
        sourceType: evidenceCardSourceType(source),
        reliability: reliabilityLabel(source, true),
        claim: snippetMainClaim(snippet),
        claimTextZhTw: snippetMainClaim(snippet),
        mainClaim: snippetMainClaim(snippet),
        evidence,
        evidencePointZhTw:
          snippet.reasoningZhTw || snippet.snippetZhTw || snippetMainClaim(snippet),
        usableEvidence: evidence,
        quoteOrParaphrase: evidence,
        summary: snippet.reasoningZhTw || evidenceProfile.summaryZhTw || evidence,
        sourceExcerptOriginal: snippet.originalSnippet || evidence,
        sourceSummaryZhTw:
          source.readableSummaryZhTW ??
          source.readableSummaryZhTw ??
          source.evidenceSummaryZhTw ??
          snippet.reasoningZhTw ??
          evidence,
        relevance: snippet.matchedFacet,
        limitations,
        limitationsZhTw: limitations,
        sectionTargets: sectionTargetsForEvidence(baseSections),
        sourceTitle: title,
        sourceUrl: source.url,
        sourceDomain: sourceDomain(source.url),
        sourceProvider: source.sourceType,
        sourceAccessLevel: source.accessLevel ?? null,
        evidenceType: snippet.matchedFacet,
        sourceLocation: "abstract",
        sectionHeading: null,
        extractionMethod: source.extractionMethod ?? null,
        quotedText: snippet.originalSnippet || evidence,
        trace: {
          provider: source.provider ?? source.sourceType,
          query_used: source.queryUsed ?? undefined,
          url: source.url ?? undefined,
          doi: source.doi ?? undefined,
          extraction_method: source.extractionMethod ?? undefined,
          content_hash: source.contentHash ?? undefined,
        },
        sourceCategory: source.sourceCategory?.trim() || null,
        recommendationBucket: source.recommendationBucket ?? null,
        sourceRole: source.sourceRole ?? null,
        retrievalMode: source.retrievalMode ?? null,
        isPeerReviewed: source.isPeerReviewed ?? null,
        venue: source.containerTitle ?? null,
        providerHealthSnapshot: source.providerHealthSnapshot ?? null,
        acceptedByUser: source.acceptedByUser ?? null,
        userDecision: source.userDecision ?? null,
        acceptedAs: source.acceptedAs ?? null,
        doi: source.doi,
        abstract: source.abstract,
        provider: source.provider || source.sourceType,
        relevanceScore: source.relevanceScore ?? null,
        sourceQualityScore: source.sourceQualityScore ?? null,
        finalScore: source.finalScore ?? null,
        year: source.year,
        usableSections: baseSections,
        confidence: source.confidence?.trim() || null,
        confidenceScore: confidenceScore(source, true),
        derivation,
        abstractOnly: derivation !== "fulltext-derived",
        limitation: limitations[0] ?? null,
        citationText: citationText(source),
        pageOrLocation: "abstract",
        createdAt: options.createdAt ?? new Date().toISOString(),
        notes: source.reviewNotes?.trim() || "",
      });
    });
    return cards;
  }

  const derivation = evidenceDerivation(source, false);
  const limitations = evidenceLimitations(source, derivation);
  cards.push({
    id: `evidence:${id}:0`,
    evidenceId: `evidence:${id}:0`,
    workflowId: source.workflowId ?? null,
    topicHash: source.topicHash ?? null,
    sourceId: id,
    citationMarker: citationText(source),
    title,
    sourceType: evidenceCardSourceType(source),
    reliability: reliabilityLabel(source, false),
    claim: fallbackMainClaim(source, compactEvidenceText(source)),
    claimTextZhTw: fallbackMainClaim(source, compactEvidenceText(source)),
    mainClaim: fallbackMainClaim(source, compactEvidenceText(source)),
    evidence: compactEvidenceText(source),
    evidencePointZhTw:
      source.evidenceSummaryZhTw ||
      source.mainEvidencePointZhTw ||
      fallbackMainClaim(source, compactEvidenceText(source)),
    usableEvidence: compactEvidenceText(source),
    quoteOrParaphrase: compactEvidenceText(source),
    summary: evidenceProfile.summaryZhTw || compactEvidenceText(source),
    sourceExcerptOriginal:
      source.originalAbstract ??
      source.originalSnippet ??
      source.abstract ??
      compactEvidenceText(source),
    sourceSummaryZhTw:
      source.readableSummaryZhTW ??
      source.readableSummaryZhTw ??
      source.evidenceSummaryZhTw ??
      compactEvidenceText(source),
    relevance: source.mainEvidenceFacet || "研究背景",
    limitations,
    limitationsZhTw: limitations,
    sectionTargets: sectionTargetsForEvidence(baseSections),
    sourceTitle: title,
    sourceUrl: source.url,
    sourceDomain: sourceDomain(source.url),
    sourceProvider: source.sourceType,
    sourceAccessLevel: source.accessLevel ?? null,
    evidenceType: derivation === "metadata-derived" ? "metadata" : "background",
    sourceLocation: derivation === "abstract-derived" ? "abstract" : "metadata",
    sectionHeading: null,
    extractionMethod: source.extractionMethod ?? null,
    quotedText: compactEvidenceText(source),
    trace: {
      provider: source.provider ?? source.sourceType,
      query_used: source.queryUsed ?? undefined,
      url: source.url ?? undefined,
      doi: source.doi ?? undefined,
      extraction_method: source.extractionMethod ?? undefined,
      content_hash: source.contentHash ?? undefined,
    },
    sourceCategory: source.sourceCategory?.trim() || null,
    recommendationBucket: source.recommendationBucket ?? null,
    sourceRole: source.sourceRole ?? null,
    retrievalMode: source.retrievalMode ?? null,
    isPeerReviewed: source.isPeerReviewed ?? null,
    venue: source.containerTitle ?? null,
    providerHealthSnapshot: source.providerHealthSnapshot ?? null,
    acceptedByUser: source.acceptedByUser ?? null,
    userDecision: source.userDecision ?? null,
    acceptedAs: source.acceptedAs ?? null,
    doi: source.doi,
    abstract: source.abstract,
    provider: source.provider || source.sourceType,
    relevanceScore: source.relevanceScore ?? null,
    sourceQualityScore: source.sourceQualityScore ?? null,
    finalScore: source.finalScore ?? null,
    year: source.year,
    usableSections: baseSections,
    confidence: source.confidence?.trim() || null,
    confidenceScore: confidenceScore(source, false),
    derivation,
    abstractOnly: derivation !== "fulltext-derived",
    limitation: limitations[0] ?? null,
    citationText: citationText(source),
    pageOrLocation: derivation === "abstract-derived" ? "abstract" : undefined,
    createdAt: options.createdAt ?? new Date().toISOString(),
    notes: source.reviewNotes?.trim() || "",
  });
  return cards;
}

export function buildEvidenceCards(
  sources: SourceRecord[],
  existingCards: EvidenceCard[] = [],
  options: BuildEvidenceCardOptions = {},
): EvidenceCard[] {
  const acceptedSources = acceptedSourceRecords(sources).filter(
    sourceEligibleForEvidenceCard,
  );
  const existingById = new Map(existingCards.map((card) => [card.id, card]));
  const seen = new Set<string>();
  const cards: EvidenceCard[] = [];

  acceptedSources.forEach((source, index) => {
    const id = sourceId(source);
    if (seen.has(id)) return;
    seen.add(id);

    const generatedCards = sourceToEvidenceCards(source, index + 1, options);
    generatedCards.forEach((generated) => {
      const existing = existingById.get(generated.id);
      if (!existing) {
        cards.push(generated);
        return;
      }

      cards.push({
        ...generated,
        id: existing.id || generated.id,
        title: generated.title,
        evidenceId: generated.evidenceId,
        workflowId: generated.workflowId,
        topicHash: generated.topicHash,
        sourceType: generated.sourceType,
        citationMarker: options.resetText ? generated.citationMarker : existing.citationMarker ?? generated.citationMarker,
        reliability: options.resetText ? generated.reliability : existing.reliability || generated.reliability,
        claim: options.resetText ? generated.claim : existing.claim || generated.claim,
        claimTextZhTw:
          options.resetText
            ? generated.claimTextZhTw
            : existing.claimTextZhTw ?? generated.claimTextZhTw,
        mainClaim: options.resetText ? generated.mainClaim : existing.mainClaim || generated.mainClaim,
        evidence: options.resetText ? generated.evidence : existing.evidence || generated.evidence,
        evidencePointZhTw:
          options.resetText
            ? generated.evidencePointZhTw
            : existing.evidencePointZhTw ?? generated.evidencePointZhTw,
        usableEvidence: options.resetText ? generated.usableEvidence : existing.usableEvidence || generated.usableEvidence,
        quoteOrParaphrase: options.resetText ? generated.quoteOrParaphrase : existing.quoteOrParaphrase || generated.quoteOrParaphrase,
        summary: options.resetText ? generated.summary : existing.summary || generated.summary,
        sourceExcerptOriginal:
          options.resetText
            ? generated.sourceExcerptOriginal
            : existing.sourceExcerptOriginal ?? generated.sourceExcerptOriginal,
        sourceSummaryZhTw:
          options.resetText
            ? generated.sourceSummaryZhTw
            : existing.sourceSummaryZhTw ?? generated.sourceSummaryZhTw,
        relevance: options.resetText ? generated.relevance : existing.relevance || generated.relevance,
        limitations: options.resetText ? generated.limitations : existing.limitations ?? generated.limitations,
        limitationsZhTw:
          options.resetText
            ? generated.limitationsZhTw
            : existing.limitationsZhTw ?? generated.limitationsZhTw,
        sectionTargets: options.resetText ? generated.sectionTargets : existing.sectionTargets ?? generated.sectionTargets,
        sourceAccessLevel:
          options.resetText
            ? generated.sourceAccessLevel
            : existing.sourceAccessLevel ?? generated.sourceAccessLevel,
        evidenceType:
          options.resetText
            ? generated.evidenceType
            : existing.evidenceType ?? generated.evidenceType,
        sourceLocation:
          options.resetText
            ? generated.sourceLocation
            : existing.sourceLocation ?? generated.sourceLocation,
        sectionHeading:
          options.resetText
            ? generated.sectionHeading
            : existing.sectionHeading ?? generated.sectionHeading,
        extractionMethod:
          options.resetText
            ? generated.extractionMethod
            : existing.extractionMethod ?? generated.extractionMethod,
        quotedText:
          options.resetText
            ? generated.quotedText
            : existing.quotedText ?? generated.quotedText,
        trace: options.resetText ? generated.trace : existing.trace ?? generated.trace,
        sourceCategory: options.resetText ? generated.sourceCategory : existing.sourceCategory ?? generated.sourceCategory,
        recommendationBucket: generated.recommendationBucket,
        sourceRole: generated.sourceRole,
        retrievalMode: generated.retrievalMode,
        isPeerReviewed: generated.isPeerReviewed,
        venue: generated.venue,
        providerHealthSnapshot: generated.providerHealthSnapshot,
        acceptedByUser: generated.acceptedByUser,
        userDecision: generated.userDecision,
        acceptedAs: generated.acceptedAs,
        doi: generated.doi,
        abstract: generated.abstract,
        provider: generated.provider,
        relevanceScore: generated.relevanceScore,
        sourceQualityScore: generated.sourceQualityScore,
        finalScore: generated.finalScore,
        usableSections: options.resetText ? generated.usableSections : existing.usableSections ?? generated.usableSections,
        confidence: options.resetText ? generated.confidence : existing.confidence ?? generated.confidence,
        confidenceScore: options.resetText ? generated.confidenceScore : existing.confidenceScore ?? generated.confidenceScore,
        derivation: options.resetText ? generated.derivation : existing.derivation ?? generated.derivation,
        abstractOnly: options.resetText ? generated.abstractOnly : existing.abstractOnly ?? generated.abstractOnly,
        limitation: options.resetText ? generated.limitation : existing.limitation ?? generated.limitation,
        citationText: options.resetText ? generated.citationText : existing.citationText ?? generated.citationText,
        pageOrLocation: options.resetText ? generated.pageOrLocation : existing.pageOrLocation ?? generated.pageOrLocation,
        createdAt: existing.createdAt ?? generated.createdAt,
        notes: options.resetText ? generated.notes : existing.notes ?? generated.notes,
      });
    });
  });

  return cards;
}

export function summarizeEvidenceCoverage(
  evidenceCards: EvidenceCard[],
  acceptedSources: SourceRecord[],
  recommendedAcceptedSourceCount = RECOMMENDED_ACCEPTED_SOURCE_COUNT,
): EvidenceCoverageSummary {
  const sectionCounts = WORKFLOW_REPORT_SECTIONS.reduce(
    (acc, section) => ({ ...acc, [section]: 0 }),
    {} as Record<WorkflowReportSection, number>,
  );

  for (const card of evidenceCards) {
    const sections = normalizeUsableSections(card.usableSections);
    for (const section of sections) {
      sectionCounts[section] += 1;
    }
  }

  const acceptedSourceCount = acceptedSourceRecords(acceptedSources).length;
  const warnings: EvidenceCoverageWarning[] = [];

  if (acceptedSourceCount < recommendedAcceptedSourceCount) {
    warnings.push({
      code: "accepted-sources-below-recommended",
      message: `建議至少接受 ${recommendedAcceptedSourceCount} 筆來源`,
    });
  }

  if (evidenceCards.length < acceptedSourceCount) {
    warnings.push({
      code: "evidence-cards-below-accepted-sources",
      message: "證據卡少於已接受來源",
    });
  }

  if (sectionCounts["研究背景"] === 0) {
    warnings.push({ code: "missing-background-evidence", message: "研究背景尚缺證據" });
  }

  if (sectionCounts["文獻探討"] === 0) {
    warnings.push({ code: "missing-literature-evidence", message: "文獻探討尚缺證據" });
  }

  const positiveStatuses: string[] = [];
  if (acceptedSourceCount >= recommendedAcceptedSourceCount) positiveStatuses.push("已達基本來源數量");
  if (evidenceCards.length > 0) positiveStatuses.push("已建立證據卡");
  if (sectionCounts["研究背景"] > 0 && sectionCounts["文獻探討"] > 0) {
    positiveStatuses.push("研究背景與文獻探討已有證據");
  }

  return {
    acceptedSourceCount,
    evidenceCardCount: evidenceCards.length,
    sectionCounts,
    warnings,
    positiveStatuses,
    isBasicReady:
      acceptedSourceCount >= recommendedAcceptedSourceCount &&
      evidenceCards.length > 0 &&
      sectionCounts["研究背景"] > 0 &&
      sectionCounts["文獻探討"] > 0,
  };
}
