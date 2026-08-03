export type ReportMode = "short" | "standard";
export type ReportClaimMode = "academic_claim_mode" | "background_report_mode";
export type EvidenceSufficiencyLevel =
  | "not_evaluated"
  | "none"
  | "limited"
  | "short_ready"
  | "standard_ready";

export interface ReportReadinessInput {
  acceptedSources: readonly unknown[];
  evidenceCards?: readonly unknown[] | null;
  reportMode?: ReportMode | null;
}

export interface ReportReadiness {
  reportMode: ReportMode | "blocked";
  claimMode: ReportClaimMode | "blocked";
  acceptedSourcesCount: number;
  acceptedUsableSourcesCount: number;
  scholarlySourcesCount: number;
  officialBackgroundSourcesCount: number;
  reliableBackgroundSourcesCount: number;
  evidenceCardsCount: number;
  usableEvidenceCardsCount: number;
  verifiedEvidenceCardsCount: number;
  distinctUsableEvidenceSourceCount: number;
  citationReadyClaimsCount: number;
  requiredSectionCoverageCount: number;
  sourceDiversityCount: number;
  extractionFailureCount: number;
  evidenceSufficiency: EvidenceSufficiencyLevel;
  blockingReasons: string[];
  warnings: string[];
  minRequiredSources: number;
  canGenerate: boolean;
  canGenerateStandard: boolean;
  canGenerateShort: boolean;
  canExport: boolean;
  isLimitedDraft: boolean;
  badge: string;
  buttonLabel: string;
  message: string | null;
}

export const SHORT_REPORT_MIN_ACCEPTED_SOURCES = 3;
export const STANDARD_REPORT_MIN_ACCEPTED_SOURCES = 10;
export const ACADEMIC_CLAIM_MIN_SCHOLARLY_SOURCES = 3;
export const SHORT_REPORT_MIN_EVIDENCE_SOURCES = 2;
export const STANDARD_REPORT_MIN_EVIDENCE_SOURCES = 3;
export const STANDARD_REPORT_MIN_CITATION_READY_CLAIMS = 4;
export const STANDARD_REPORT_MIN_SECTION_COVERAGE = 3;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truthyBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(text).filter(Boolean)));
}

function sourceHaystack(source: Record<string, unknown>): string {
  return [
    source.recommendationBucket,
    source.bucket,
    source.sourceType,
    source.sourceKind,
    source.sourceCategory,
    source.provider,
    source.publisher,
    source.containerTitle,
    source.venue,
    source.url,
    source.title,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sourceIsRejected(source: Record<string, unknown>): boolean {
  const haystack = sourceHaystack(source);
  return (
    text(source.reviewState) === "rejected" ||
    text(source.reviewStatus) === "rejected" ||
    text(source.status) === "rejected" ||
    text(source.recommendationBucket) === "rejected" ||
    text(source.usageRecommendation) === "exclude" ||
    text(source.topicalRelevanceLabel) === "irrelevant" ||
    /(^|\s)(off_topic|stale_topic|stale_workflow|trusted_but_off_topic)(\s|$)/.test(haystack)
  );
}

function sourceCountsAsUsable(source: Record<string, unknown>): boolean {
  if (sourceIsRejected(source)) return false;
  if (source.canUseForReport === false) return false;
  if (text(source.sourceUseLevel) === "rejected") return false;
  if (text(source.extractionStatus) === "failed" && text(source.evidenceGrounding) === "insufficient") return false;
  return true;
}

function sourceCountsAsScholarly(source: Record<string, unknown>): boolean {
  const haystack = sourceHaystack(source);
  if (text(source.recommendationBucket) === "official_background") return false;
  if (text(source.recommendationBucket) === "scholarly_recommended") return true;
  if (text(source.doi)) return true;
  if (truthyBoolean(source.isPeerReviewed)) return true;
  return /\b(crossref|openalex|semantic scholar|journal|conference|paper|review|doi|academic)\b/.test(
    haystack,
  );
}

function sourceCountsAsReliableBackground(source: Record<string, unknown>): boolean {
  const haystack = sourceHaystack(source);
  if (text(source.recommendationBucket) === "official_background") return true;
  return /\b(official|institutional|government|education|educational|university|college|extension|encyclopedia|nasa|ucar|noaa|\.gov|\.edu)\b/.test(
    haystack,
  );
}

function readinessCounts(acceptedSources: readonly unknown[]) {
  const usableSources = acceptedSources.map(asRecord).filter(sourceCountsAsUsable);
  return {
    acceptedSourcesCount: acceptedSources.length,
    acceptedUsableSourcesCount: usableSources.length,
    scholarlySourcesCount: usableSources.filter(sourceCountsAsScholarly).length,
    officialBackgroundSourcesCount: usableSources.filter(
      (source) => text(source.recommendationBucket) === "official_background",
    ).length,
    reliableBackgroundSourcesCount: usableSources.filter(sourceCountsAsReliableBackground).length,
    extractionFailureCount: acceptedSources
      .map(asRecord)
      .filter((source) =>
        text(source.extractionStatus) === "failed" ||
        text(source.claimExtractionStatus) === "failed" ||
        text(source.evidenceGrounding) === "insufficient"
      ).length,
  };
}

function acceptedSourceIds(acceptedSources: readonly unknown[]): Set<string> {
  return new Set(
    acceptedSources
      .map(asRecord)
      .map((source) => text(source.id) || text(source.sourceId))
      .filter(Boolean),
  );
}

function supportText(card: Record<string, unknown>): string {
  const direct =
    text(card.supportSpan) ||
    text(card.supportedByText) ||
    text(card.quotedText) ||
    text(card.quoted_text);
  if (direct) return direct;
  const spans = Array.isArray(card.supportSpans) ? card.supportSpans : [];
  return spans
    .map(asRecord)
    .map((span) => text(span.text))
    .find(Boolean) ?? "";
}

function claimText(card: Record<string, unknown>): string {
  return (
    text(card.claimText) ||
    text(card.claimTextZhTw) ||
    text(card.claimTextZh) ||
    text(card.claim) ||
    text(card.mainClaim)
  );
}

function evidenceCardIsUsable(
  card: Record<string, unknown>,
  sourceIds: ReadonlySet<string>,
): boolean {
  const sourceId = text(card.sourceId);
  if (!sourceId || !sourceIds.has(sourceId)) return false;
  if (!claimText(card) || !supportText(card)) return false;
  if (["rejected", "unsupported", "failed"].includes(text(card.status))) return false;
  if (["rejected", "failed"].includes(text(card.verificationStatus))) return false;
  if (text(card.groundingStatus) === "unsupported") return false;
  if (["failed", "metadata_only"].includes(text(card.extractionMethod))) return false;
  return true;
}

function evidenceCardIsVerified(card: Record<string, unknown>): boolean {
  if (card.needsReview === true || card.needsManualReview === true) return false;
  if (text(card.extractionMethod) === "rule_fallback_claim_extraction") return false;
  return !["rejected", "failed", "unsupported"].includes(
    text(card.verificationStatus) || text(card.groundingStatus),
  );
}

function evidenceCoverage(card: Record<string, unknown>): string[] {
  return Array.from(new Set([
    ...stringList(card.sectionFit),
    ...stringList(card.sectionTargets),
    ...stringList(card.usableSections),
    ...stringList(card.usableFor),
  ].map((section) => section.toLowerCase().replace(/\s+/g, "_"))));
}

function evidenceCounts(
  acceptedSources: readonly unknown[],
  evidenceCards: readonly unknown[],
) {
  const sourceIds = acceptedSourceIds(acceptedSources);
  const usableCards = evidenceCards.map(asRecord).filter((card) =>
    evidenceCardIsUsable(card, sourceIds),
  );
  const distinctSources = new Set(usableCards.map((card) => text(card.sourceId)));
  const coveredSections = new Set(usableCards.flatMap(evidenceCoverage));
  const citationReadyClaims = new Set(
    usableCards.map((card, index) =>
      text(card.id) || text(card.evidenceId) || `${text(card.sourceId)}:${index}`,
    ),
  );
  return {
    evidenceCardsCount: evidenceCards.length,
    usableEvidenceCardsCount: usableCards.length,
    verifiedEvidenceCardsCount: usableCards.filter(evidenceCardIsVerified).length,
    distinctUsableEvidenceSourceCount: distinctSources.size,
    citationReadyClaimsCount: citationReadyClaims.size,
    requiredSectionCoverageCount: coveredSections.size,
    // Distinct usable sources are the minimum defensible diversity measure.
    // Domain-specific provider/type diversity can be layered on later without
    // weakening this gate.
    sourceDiversityCount: distinctSources.size,
  };
}

export function inferReportMode(
  acceptedSourcesCount: number,
  requestedMode?: ReportMode | null,
): ReportMode | "blocked" {
  if (acceptedSourcesCount < SHORT_REPORT_MIN_ACCEPTED_SOURCES) return "blocked";
  if (requestedMode === "standard") {
    return acceptedSourcesCount >= STANDARD_REPORT_MIN_ACCEPTED_SOURCES
      ? "standard"
      : "short";
  }
  if (requestedMode === "short") return "short";
  return acceptedSourcesCount >= STANDARD_REPORT_MIN_ACCEPTED_SOURCES
    ? "standard"
    : "short";
}

export function getReportReadiness(input: ReportReadinessInput): ReportReadiness {
  const counts = readinessCounts(input.acceptedSources);
  const evidenceGateEnabled = input.evidenceCards !== undefined && input.evidenceCards !== null;
  const evidence = evidenceCounts(input.acceptedSources, input.evidenceCards ?? []);
  const legacyMode = inferReportMode(counts.acceptedUsableSourcesCount, input.reportMode);
  const standardEvidenceReady =
    evidence.distinctUsableEvidenceSourceCount >= STANDARD_REPORT_MIN_EVIDENCE_SOURCES &&
    evidence.citationReadyClaimsCount >= STANDARD_REPORT_MIN_CITATION_READY_CLAIMS &&
    evidence.verifiedEvidenceCardsCount >= STANDARD_REPORT_MIN_EVIDENCE_SOURCES &&
    evidence.requiredSectionCoverageCount >= STANDARD_REPORT_MIN_SECTION_COVERAGE &&
    evidence.sourceDiversityCount >= STANDARD_REPORT_MIN_EVIDENCE_SOURCES;
  const shortEvidenceReady =
    counts.acceptedUsableSourcesCount >= SHORT_REPORT_MIN_ACCEPTED_SOURCES &&
    evidence.distinctUsableEvidenceSourceCount >= SHORT_REPORT_MIN_EVIDENCE_SOURCES &&
    evidence.citationReadyClaimsCount >= SHORT_REPORT_MIN_EVIDENCE_SOURCES;
  const limitedEvidenceReady = evidence.distinctUsableEvidenceSourceCount === 1;

  let evidenceSufficiency: EvidenceSufficiencyLevel = "not_evaluated";
  let reportMode: ReportMode | "blocked" = legacyMode;
  if (evidenceGateEnabled) {
    if (evidence.distinctUsableEvidenceSourceCount === 0) {
      evidenceSufficiency = "none";
      reportMode = "blocked";
    } else if (limitedEvidenceReady || !shortEvidenceReady) {
      evidenceSufficiency = "limited";
      reportMode = "short";
    } else if (
      legacyMode === "standard" &&
      standardEvidenceReady
    ) {
      evidenceSufficiency = "standard_ready";
      reportMode = "standard";
    } else {
      evidenceSufficiency = "short_ready";
      reportMode = "short";
    }
  }

  const claimMode: ReportClaimMode | "blocked" =
    reportMode === "blocked"
      ? "blocked"
      : counts.scholarlySourcesCount >= ACADEMIC_CLAIM_MIN_SCHOLARLY_SOURCES
        ? "academic_claim_mode"
        : "background_report_mode";
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (counts.extractionFailureCount > 0) {
    warnings.push(`${counts.extractionFailureCount} 筆已接受來源的證據抽取失敗或不足。`);
  }
  if (evidenceGateEnabled && evidence.distinctUsableEvidenceSourceCount === 0) {
    blockingReasons.push("沒有可引用的 evidence card／claim／support span。");
  }
  if (evidenceGateEnabled && input.reportMode === "standard" && !standardEvidenceReady) {
    blockingReasons.push("standard 報告未通過集中式 evidence sufficiency gate。");
  }

  const common = {
    ...counts,
    ...evidence,
    reportMode,
    claimMode,
    evidenceSufficiency,
    blockingReasons,
    warnings,
  };

  if (reportMode === "blocked") {
    const noCards = evidenceGateEnabled && input.evidenceCards?.length === 0;
    const message = evidenceGateEnabled
      ? "目前沒有可引用的 usable evidence，至少需 1 張證據卡；研究報告生成已停止。"
      : `目前已接受 ${counts.acceptedUsableSourcesCount} 筆可用來源，至少需 ${SHORT_REPORT_MIN_ACCEPTED_SOURCES} 筆才能生成研究報告。`;
    return {
      ...common,
      minRequiredSources: SHORT_REPORT_MIN_ACCEPTED_SOURCES,
      canGenerate: false,
      canGenerateStandard: false,
      canGenerateShort: false,
      canExport: false,
      isLimitedDraft: false,
      badge: noCards ? "缺少證據卡" : evidenceGateEnabled ? "證據不足" : "來源不足",
      buttonLabel: noCards ? "缺少證據卡" : evidenceGateEnabled ? "證據不足" : "來源不足",
      message,
    };
  }

  if (evidenceGateEnabled && evidenceSufficiency === "limited") {
    const message =
      "目前只有 1 個 distinct usable evidence source，只能建立「證據有限／不完整」草稿；不得標示或匯出為標準／完整研究報告。";
    return {
      ...common,
      minRequiredSources: SHORT_REPORT_MIN_ACCEPTED_SOURCES,
      canGenerate: true,
      canGenerateStandard: false,
      canGenerateShort: false,
      canExport: false,
      isLimitedDraft: true,
      badge: "證據有限／不完整",
      buttonLabel: "建立證據有限草稿",
      message,
      warnings: [...warnings, message],
    };
  }

  if (reportMode === "short") {
    const backgroundMessage =
      claimMode === "background_report_mode"
        ? "目前來源主要為官方背景或一般可信資料，將生成背景型研究報告；若需要嚴格學術論文式報告，請補足學術 evidence cards。"
        : counts.acceptedUsableSourcesCount < STANDARD_REPORT_MIN_ACCEPTED_SOURCES || !standardEvidenceReady
          ? "可生成短版研究報告；目前證據只通過短版門檻。若要生成標準版，必須補足 distinct usable sources、citation-ready claims 與章節覆蓋。"
          : null;
    return {
      ...common,
      minRequiredSources: SHORT_REPORT_MIN_ACCEPTED_SOURCES,
      canGenerate: true,
      canGenerateStandard: false,
      canGenerateShort: true,
      canExport: true,
      isLimitedDraft: false,
      badge: claimMode === "background_report_mode" ? "可生成背景型研究報告" : "可生成短版研究報告",
      buttonLabel: claimMode === "background_report_mode" ? "生成背景型研究報告" : "生成短版研究報告",
      message: backgroundMessage,
    };
  }

  const message = claimMode === "background_report_mode"
    ? "來源仍以背景資料為主；標準報告將限制學術主張強度。"
    : null;
  return {
    ...common,
    minRequiredSources: STANDARD_REPORT_MIN_ACCEPTED_SOURCES,
    canGenerate: true,
    canGenerateStandard: true,
    canGenerateShort: true,
    canExport: true,
    isLimitedDraft: false,
    badge: claimMode === "background_report_mode" ? "可生成背景型標準報告" : "可生成標準研究報告",
    buttonLabel: claimMode === "background_report_mode" ? "生成背景型研究報告" : "生成標準研究報告",
    message,
  };
}
