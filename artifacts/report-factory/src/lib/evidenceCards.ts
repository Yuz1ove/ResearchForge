import {
  acceptedSourceRecords,
  canonicalSourceKeyForSource,
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
import type { EvidenceCardSafety, EvidenceDerivation, StructuredStudyFact } from "@workspace/api-zod";
import {
  UNTRANSLATED_EVIDENCE_NOTICE,
  verifiedZhTwReportText,
} from "./zhTwReportText.ts";

export interface EvidenceCard {
  id: string;
  evidenceId: string;
  evidenceCardId?: string;
  workflowId: string | null;
  topicHash: string | null;
  sourceId: string;
  canonicalSourceKey?: string;
  dedupeKey?: string;
  citationKey?: string;
  claimIds?: string[];
  claimTextOriginal?: string;
  claimText?: string;
  claimTextZh?: string;
  supportedByText?: string;
  supportSpan?: string;
  supportStart?: number;
  supportEnd?: number;
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
  structuredStudyFact?: StructuredStudyFact;
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
  sectionFit?: string[];
  sourceTitle: string;
  authors?: string[];
  sourceUrl: string | null;
  sourceDomain: string;
  sourceProvider: string;
  sourceMetadata?: Record<string, unknown> | null;
  sourceAccessLevel?: string | null;
  extractionStatus?: string | null;
  evidenceType?: string | null;
  sourceLocation?: string | null;
  sectionHeading?: string | null;
  extractionMethod?: "llm_structured_extract" | "rule_fallback_claim_extraction" | "manual_review" | string | null;
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
  topicRelevance?: number | null;
  sourceQualityScore: number | null;
  sourceQuality?: number | null;
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
  needsReview?: boolean | null;
  rejectionReason?: string | null;
  groundingConfidence?: number | null;
  extractedAt?: string | null;
  governanceFlags?: string[];
  location?: string | null;
  researchSetting?: string | null;
  studyDesign?: string | null;
  dataScope?: string | null;
  exposure?: string | null;
  comparator?: string | null;
  outcome?: string | null;
  exactResult?: string | null;
  numericResult?: string | null;
  applicability?: string | null;
  locator?: string | null;
  evidenceDirectnessTier?: "A" | "B" | "C" | "D" | null;
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

export interface EvidenceExtractionIssue {
  sourceId: string;
  title: string;
  stage: "metadata_mapping" | "abstract_extraction" | "evidence_card_builder" | "evidence_validation";
  missingFields: string[];
  message: string;
}

export interface EvidenceExtractionDiagnostics {
  acceptedSourceCount: number;
  evidenceCardCount: number;
  usableEvidenceCardCount: number;
  fullTextEvidenceCardCount: number;
  abstractEvidenceCardCount: number;
  bibliographicCardCount: number;
  issues: EvidenceExtractionIssue[];
  blockingMessage: string | null;
}

interface BuildEvidenceCardOptions {
  resetText?: boolean;
  topic?: string;
  createdAt?: string;
}

const RECOMMENDED_ACCEPTED_SOURCE_COUNT = 10;

function sourceHasExplicitRejection(source: SourceRecord): boolean {
  const record = source as SourceRecord & Record<string, unknown>;
  const rejectedState = (value: unknown) =>
    value === "rejected" || value === "dismissed";
  return Boolean(
    rejectedState(record.reviewState) ||
      rejectedState(record.status) ||
      rejectedState(record.reviewStatus) ||
      record.userDecision === "rejected" ||
      record.recommendationBucket === "rejected" ||
      record.sourceRole === "rejected" ||
      record.sourceUseLevel === "rejected" ||
      record.usageRecommendation === "exclude" ||
      record.shouldRejectImmediately === true,
  );
}

function sourceEligibleForEvidenceCard(source: SourceRecord): boolean {
  if (sourceHasExplicitRejection(source)) return false;
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
  if (source.relevanceLevel === "off_topic") {
    return false;
  }
  const explicitlyAccepted =
    source.acceptedByUser === true ||
    source.userDecision === "accepted" ||
    source.userDecision === "accepted_as_background" ||
    source.userDecision === "accepted_as_scholarly_evidence" ||
    source.userDecision === "accepted_as_manual_review";
  if (
    (source.relevanceLevel === "low" || source.relevanceLevel === "clue") &&
    !explicitlyAccepted
  ) return false;
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
  const localized = verifiedZhTwReportText(
    source.mainEvidencePointZhTw,
    source.evidenceSummaryZhTw,
    source.readableSummaryZhTw,
    source.readableSummaryZhTW,
    source.abstractZhTw,
  );
  if (localized) return localized;
  if (source.abstract?.trim()) return UNTRANSLATED_EVIDENCE_NOTICE;
  const locator = source.doi ? `DOI：${source.doi}` : source.url;
  return locator ? `來源位置：${locator}` : "此來源已接受，但仍缺少可驗證的重點摘錄。";
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[0]?.trim();
    if (match) return match;
  }
  return null;
}

function contextualNumericResults(text: string): string[] {
  const candidates = [
    ...text.matchAll(/R[²2]\s*[<=>]?\s*0?\.\d+/giu),
    ...text.matchAll(/p\s*[<=>]\s*0?\.\d+/giu),
    ...text.matchAll(/-?\d+(?:\.\d+)?\s*(?:°\s*C|°C|℃|[%％])/giu),
  ]
    .map((match) => match[0].replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  return [...new Set(candidates)];
}

function structuredEvidenceFields(
  source: SourceRecord,
  supportText: string,
  locator: string,
): Pick<
  EvidenceCard,
  | "location"
  | "researchSetting"
  | "studyDesign"
  | "dataScope"
  | "exposure"
  | "outcome"
  | "exactResult"
  | "numericResult"
  | "applicability"
  | "locator"
  | "evidenceDirectnessTier"
> {
  const text = [source.title, source.abstract, supportText].filter(Boolean).join(" ");
  // Only retain explicit measures/statistics here. Years, sample ordinals and
  // bare counts belong to scope metadata and must never become chart values.
  const numericValues = contextualNumericResults(supportText);
  return {
    location: firstMatch(text, [/(?:臺灣|台灣|Taiwan|Taipei|臺北|台北|高雄|Kaohsiung|Chiayi|嘉義|廣州|Guangzhou|鄭州|Zhengzhou|吉達|Jeddah|武漢|Wuhan)/iu]),
    researchSetting: firstMatch(text, [/(?:大學)?校園|學校|校園|schoolyard|university campus|school campus|campus|urban neighborhood|都市地區/iu]),
    studyDesign: firstMatch(text, [/(?:cross-sectional|longitudinal|cohort|case study|field measurement|remote sensing|GIS|ENVI-met|simulation|regression|相關分析|迴歸分析|遙測|實地量測|模擬)/iu]),
    dataScope: firstMatch(text, [
      /(?:n\s*[=:]\s*[\d,]+|(?:納入|招募|調查|樣本(?:為|含)?|研究對象為|conducted on|surveyed|recruited(?: from)?|sample of|participants? included)\s*[\d,]+\s*(?:名|位)?(?:所學校|個校園|個地點|sites?|schools?|campuses?|participants?|students?|adolescents?|college students?|high school students?|受試者|參與者|學生|青少年|大學生)?)/iu,
      /[\d,]+\s*(?:名|位)?(?:受試者|參與者|學生|青少年|大學生|高中生|中學生|participants?|students?|adolescents?|college students?|high school students?)/iu,
    ]),
    exposure: firstMatch(text, [
      /(?:short[-‐‑–— ]form video(?:\s*\(SFV\))? addiction|SFV addiction|短影音成癮)/iu,
      /(?:hours spent on (?:social media|short[-‐‑–— ]form video)|短影音使用時數|社群媒體使用時數)/iu,
      /(?:TikTok use|TikTok 使用)/iu,
      /(?:short[-‐‑–— ]form video use|短影音使用)/iu,
      /(?:social media use|use of social media|一般社群媒體使用)/iu,
      /(?:綠覆率|綠視率|綠地|樹冠|植被遮蔭|水體蒸發|植被|green coverage|green view|green space|tree canopy|vegetation shading|water evaporation|GCR|GVI|NDVI)/iu,
    ]),
    outcome: firstMatch(text, [
      /(?:poor sleep(?:ers?)?|sleep quality score|sleep quality|睡眠不佳|睡眠品質分數|睡眠品質)/iu,
      /(?:depressive symptoms?|depression|憂鬱症狀|憂鬱)/iu,
      /(?:social anxiety|社交焦慮|self-control|自我控制|happiness|幸福感|parent-child relationship|親子關係)/iu,
      /(?:都市熱島|熱島|地表溫度|環境溫度|氣溫|相對濕度|熱環境|熱舒適|urban heat island|UHI|land surface temperature|LST|ambient temperature|air temperature|relative humidity|thermal environment|thermal comfort|heat stress)/iu,
    ]),
    exactResult: supportText.trim() || null,
    numericResult: numericValues.length > 0 ? [...new Set(numericValues)].join("；") : null,
    applicability:
      source.researchDirectnessTier === "A"
        ? "直接對應研究問題的主要構面"
        : source.researchDirectnessTier === "B"
          ? "涵蓋多數構面，可作近直接證據"
          : source.researchDirectnessTier === "C"
            ? "僅涵蓋部分構面，只能間接引用"
            : "未涵蓋主要構面，不應用於核心主張",
    locator,
    evidenceDirectnessTier: source.researchDirectnessTier ?? null,
  };
}

function cleanFragment(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").replace(/[。！？.!?；，、\s]+$/u, "").trim() ?? "";
}

function firstEvidenceSentence(value: string | null | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return cleanFragment(normalized.split(/(?<=[.!?。！？])/u)[0]);
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
    cleanFragment(verifiedZhTwReportText(
      source.mainEvidencePointZhTw,
      source.evidenceSummaryZhTw,
      source.readableSummaryZhTw,
      source.readableSummaryZhTW,
      source.abstractZhTw,
      source.sourceRelevanceReasonZhTw,
      summaryText,
    )) ||
    UNTRANSLATED_EVIDENCE_NOTICE
  );
}

function preferredZhSummary(source: SourceRecord, fallback = ""): string {
  return cleanFragment(verifiedZhTwReportText(
    source.readableSummaryZhTW,
    source.readableSummaryZhTw,
    source.mainEvidencePointZhTw,
    source.evidenceSummaryZhTw,
    source.abstractZhTw,
    fallback,
  ));
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
  if (
    source.evidenceGrounding === "metadata_only" ||
    source.evidenceGrounding === "insufficient"
  ) {
    return "metadata-derived";
  }
  if (
    (source.accessLevel === "full_text" || source.contentLevel === "fulltext") &&
    Boolean(source.extractedText?.trim())
  ) {
    return "fulltext-derived";
  }
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
  const canonicalSourceKey = canonicalSourceKeyForSource(source);
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
      const localizedClaim = verifiedZhTwReportText(
        fact.fact,
        sourceSummaryZh,
        source.mainEvidencePointZhTw,
        source.evidenceSummaryZhTw,
      ) || UNTRANSLATED_EVIDENCE_NOTICE;
      const localizedEvidence = verifiedZhTwReportText(
        originalEvidence,
        sourceSummaryZh,
        localizedClaim,
      ) || UNTRANSLATED_EVIDENCE_NOTICE;
      cards.push({
        id: `evidence:${id}:fact:${index + 1}`,
        evidenceId: `evidence:${id}:fact:${index + 1}`,
        workflowId: source.workflowId ?? null,
        topicHash: source.topicHash ?? null,
        sourceId: id,
        canonicalSourceKey,
        dedupeKey: canonicalSourceKey,
        citationKey: canonicalSourceKey,
        citationMarker: citationText(source),
        title,
        sourceType: evidenceCardSourceType(source),
        reliability: reliabilityLabel(source, true),
        claim: localizedClaim,
        claimText: fact.fact,
        claimTextZhTw: localizedClaim,
        supportedByText: originalEvidence,
        supportSpan: originalEvidence,
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
        authors: [...source.authors],
        sourceUrl: source.url,
        sourceDomain: sourceDomain(source.url),
        sourceProvider: source.sourceType,
        sourceAccessLevel: source.accessLevel ?? null,
        evidenceType: fact.category,
        sourceLocation: "sourceFact",
        ...structuredEvidenceFields(source, originalEvidence, "sourceFact"),
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
      const evidence = verifiedZhTwReportText(
        snippet.snippetZhTw,
        snippet.reasoningZhTw,
        source.readableSummaryZhTW,
        source.readableSummaryZhTw,
        source.mainEvidencePointZhTw,
        source.evidenceSummaryZhTw,
        source.abstractZhTw,
      ) || UNTRANSLATED_EVIDENCE_NOTICE;
      const originalEvidence = snippet.originalSnippet || source.abstract || evidence;
      const originalClaim = firstEvidenceSentence(originalEvidence) || snippetMainClaim(snippet);
      const localizedSnippetClaim = verifiedZhTwReportText(
        snippet.snippetZhTw,
        snippet.reasoningZhTw,
        source.mainEvidencePointZhTw,
        source.evidenceSummaryZhTw,
        source.readableSummaryZhTW,
        source.readableSummaryZhTw,
      ) || UNTRANSLATED_EVIDENCE_NOTICE;
      const derivation = evidenceDerivation(source, true);
      const limitations = evidenceLimitations(source, derivation);
      cards.push({
        id: `evidence:${id}:${index + 1}`,
        evidenceId: `evidence:${id}:${index + 1}`,
        workflowId: source.workflowId ?? null,
        topicHash: source.topicHash ?? null,
        sourceId: id,
        canonicalSourceKey,
        dedupeKey: canonicalSourceKey,
        citationKey: canonicalSourceKey,
        citationMarker: citationText(source),
        title,
        sourceType: evidenceCardSourceType(source),
        reliability: reliabilityLabel(source, true),
        claim: localizedSnippetClaim,
        claimText: originalClaim,
        claimTextZhTw: localizedSnippetClaim,
        supportedByText: originalEvidence,
        supportSpan: originalEvidence,
        mainClaim: localizedSnippetClaim,
        evidence,
        evidencePointZhTw: evidence,
        usableEvidence: evidence,
        quoteOrParaphrase: evidence,
        summary: verifiedZhTwReportText(
          snippet.reasoningZhTw,
          evidenceProfile.summaryZhTw,
          evidence,
        ) || UNTRANSLATED_EVIDENCE_NOTICE,
        sourceExcerptOriginal: originalEvidence,
        sourceSummaryZhTw: verifiedZhTwReportText(
          source.readableSummaryZhTW,
          source.readableSummaryZhTw,
          source.evidenceSummaryZhTw,
          snippet.reasoningZhTw,
          evidence,
        ) || UNTRANSLATED_EVIDENCE_NOTICE,
        relevance: snippet.matchedFacet,
        limitations,
        limitationsZhTw: limitations,
        sectionTargets: sectionTargetsForEvidence(baseSections),
        sourceTitle: title,
        authors: [...source.authors],
        sourceUrl: source.url,
        sourceDomain: sourceDomain(source.url),
        sourceProvider: source.sourceType,
        sourceAccessLevel: source.accessLevel ?? null,
        evidenceType: snippet.matchedFacet,
        sourceLocation: "abstract",
        ...structuredEvidenceFields(source, originalEvidence, "abstract"),
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
  const fallbackEvidence = compactEvidenceText(source);
  const fallbackClaim = fallbackMainClaim(source, fallbackEvidence);
  const exactFallbackSupport =
    source.originalAbstract ?? source.originalSnippet ?? source.abstract ?? null;
  const exactFallbackClaim = firstEvidenceSentence(exactFallbackSupport);
  const localizedFallbackClaim = verifiedZhTwReportText(
    firstEvidenceSentence(source.abstractZhTw),
    source.mainEvidencePointZhTw,
    source.evidenceSummaryZhTw,
    source.readableSummaryZhTW,
    source.readableSummaryZhTw,
    fallbackClaim,
  ) || UNTRANSLATED_EVIDENCE_NOTICE;
  cards.push({
    id: `evidence:${id}:0`,
    evidenceId: `evidence:${id}:0`,
    workflowId: source.workflowId ?? null,
    topicHash: source.topicHash ?? null,
    sourceId: id,
    canonicalSourceKey,
    dedupeKey: canonicalSourceKey,
    citationKey: canonicalSourceKey,
    citationMarker: citationText(source),
    title,
    sourceType: evidenceCardSourceType(source),
    reliability: reliabilityLabel(source, false),
    claim: localizedFallbackClaim,
    claimText: exactFallbackClaim || fallbackClaim,
    claimTextZhTw: localizedFallbackClaim,
    ...(exactFallbackSupport
      ? {
          supportedByText: exactFallbackSupport,
          supportSpan: exactFallbackSupport,
        }
      : {}),
    mainClaim: localizedFallbackClaim,
    evidence: fallbackEvidence,
    evidencePointZhTw: verifiedZhTwReportText(
      source.evidenceSummaryZhTw,
      source.mainEvidencePointZhTw,
      source.readableSummaryZhTW,
      source.readableSummaryZhTw,
      fallbackClaim,
    ) || UNTRANSLATED_EVIDENCE_NOTICE,
    usableEvidence: fallbackEvidence,
    quoteOrParaphrase: fallbackEvidence,
    summary: verifiedZhTwReportText(evidenceProfile.summaryZhTw, fallbackEvidence) || UNTRANSLATED_EVIDENCE_NOTICE,
    sourceExcerptOriginal:
      source.originalAbstract ??
      source.originalSnippet ??
      source.abstract ??
      fallbackEvidence,
    sourceSummaryZhTw: verifiedZhTwReportText(
      source.readableSummaryZhTW,
      source.readableSummaryZhTw,
      source.evidenceSummaryZhTw,
      fallbackEvidence,
    ) || UNTRANSLATED_EVIDENCE_NOTICE,
    relevance: source.mainEvidenceFacet || "研究背景",
    limitations,
    limitationsZhTw: limitations,
    sectionTargets: sectionTargetsForEvidence(baseSections),
    sourceTitle: title,
    authors: [...source.authors],
    sourceUrl: source.url,
    sourceDomain: sourceDomain(source.url),
    sourceProvider: source.sourceType,
    sourceAccessLevel: source.accessLevel ?? null,
    evidenceType: derivation === "metadata-derived"
      ? "metadata"
      : /(?:\bResults?\b|結果(?:顯示|指出|為)|發現|顯著|associated|correlat|predict|\b(?:OR|RR|HR|r)\s*[=:]|%|％)/iu.test(exactFallbackSupport ?? fallbackEvidence)
        ? "finding"
        : "background",
    sourceLocation: derivation === "abstract-derived" ? "abstract" : "metadata",
    ...structuredEvidenceFields(
      source,
      exactFallbackSupport ?? fallbackEvidence,
      derivation === "abstract-derived" ? "abstract" : "metadata",
    ),
    sectionHeading: null,
    extractionMethod: source.extractionMethod ?? null,
    quotedText: exactFallbackSupport ?? fallbackEvidence,
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
    const canonicalKey = canonicalSourceKeyForSource(source);
    const sourceIdKey = `source-id:${id}`;
    if (seen.has(canonicalKey) || seen.has(sourceIdKey)) return;
    seen.add(canonicalKey);
    seen.add(sourceIdKey);

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

export function evidenceCardHasUsableSupport(card: EvidenceCard): boolean {
  if (card.derivation !== "abstract-derived" && card.derivation !== "fulltext-derived") {
    return false;
  }
  const support =
    card.supportSpan?.trim() ||
    card.supportedByText?.trim() ||
    card.sourceExcerptOriginal?.trim();
  const hasLocator = Boolean(
    card.doi?.trim() || /^https?:\/\//iu.test(card.sourceUrl?.trim() ?? ""),
  );
  return Boolean(
    support &&
      support.length >= 24 &&
      card.sourceId?.trim() &&
      card.sourceTitle?.trim() &&
      card.provider?.trim() &&
      hasLocator,
  );
}

export function analyzeEvidenceExtraction(
  acceptedSources: SourceRecord[],
  evidenceCards: EvidenceCard[],
): EvidenceExtractionDiagnostics {
  const accepted = acceptedSourceRecords(acceptedSources);
  const cardsBySourceId = new Map<string, EvidenceCard[]>();
  for (const card of evidenceCards) {
    const existing = cardsBySourceId.get(card.sourceId) ?? [];
    existing.push(card);
    cardsBySourceId.set(card.sourceId, existing);
  }
  const issues: EvidenceExtractionIssue[] = [];
  for (const source of accepted) {
    const id = sourceId(source);
    const aliases = [source.id, source.dedupeKey, sourceRecordKey(source)].filter(
      (value): value is string => Boolean(value),
    );
    const sourceCards = aliases.flatMap((alias) => cardsBySourceId.get(alias) ?? []);
    const usableCards = sourceCards.filter(evidenceCardHasUsableSupport);
    const missingFields = [
      !source.title?.trim() ? "title" : "",
      source.authors.length === 0 ? "authors" : "",
      source.year == null ? "year" : "",
      !source.doi?.trim() && !source.url?.trim() ? "doi_or_url" : "",
      !(source.provider?.trim() || source.sourceType?.trim()) ? "provider" : "",
      !source.abstract?.trim() ? "abstract" : "",
    ].filter(Boolean);
    if (!source.title?.trim() || (!source.doi?.trim() && !source.url?.trim())) {
      issues.push({
        sourceId: id,
        title: source.title || "標題待確認",
        stage: "metadata_mapping",
        missingFields,
        message: `metadata mapping 缺少 ${missingFields.join("、") || "可追溯欄位"}，無法建立可追溯證據。`,
      });
    } else if (!source.abstract?.trim()) {
      issues.push({
        sourceId: id,
        title: source.title,
        stage: "abstract_extraction",
        missingFields,
        message: `provider=${source.provider ?? source.sourceType} 未提供 abstract；已保留書目背景卡，但不可支撐具體研究結論。`,
      });
    } else if (sourceCards.length === 0) {
      issues.push({
        sourceId: id,
        title: source.title,
        stage: "evidence_card_builder",
        missingFields,
        message: `abstract 已保存（${source.abstract.length} 字），但 evidence card builder 沒有產出卡片；請檢查 review/status 與來源 identity mapping。`,
      });
    } else if (usableCards.length === 0) {
      issues.push({
        sourceId: id,
        title: source.title,
        stage: "evidence_validation",
        missingFields,
        message: "證據卡已建立，但缺少 exact abstract/full-text support span 或 DOI/URL，因此只能作為書目背景。",
      });
    }
  }
  const usableCards = evidenceCards.filter(evidenceCardHasUsableSupport);
  const fullTextEvidenceCardCount = usableCards.filter(
    (card) => card.derivation === "fulltext-derived",
  ).length;
  const abstractEvidenceCardCount = usableCards.filter(
    (card) => card.derivation === "abstract-derived",
  ).length;
  const bibliographicCardCount = evidenceCards.filter(
    (card) => card.derivation === "metadata-derived",
  ).length;
  const blockingMessage = usableCards.length > 0
    ? null
    : accepted.length === 0
      ? "來源審查尚未接受任何來源，因此 evidence card builder 尚未執行。"
      : evidenceCards.length === 0
        ? `已檢查 ${accepted.length} 筆 accepted sources，但 evidence card builder 未產出卡片；請查看下方逐筆 metadata／abstract／identity 診斷。`
        : `已建立 ${bibliographicCardCount} 張書目背景卡，但沒有含 exact abstract/full-text support span 的可引用證據；請查看下方 abstract 抽取結果。`;
  return {
    acceptedSourceCount: accepted.length,
    evidenceCardCount: evidenceCards.length,
    usableEvidenceCardCount: usableCards.length,
    fullTextEvidenceCardCount,
    abstractEvidenceCardCount,
    bibliographicCardCount,
    issues,
    blockingMessage,
  };
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
