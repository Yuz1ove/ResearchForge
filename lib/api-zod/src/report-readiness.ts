export type ReportMode = "short" | "standard";
export type ReportClaimMode = "academic_claim_mode" | "background_report_mode";

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
  minRequiredSources: number;
  canGenerate: boolean;
  canGenerateStandard: boolean;
  canGenerateShort: boolean;
  badge: string;
  buttonLabel: string;
  message: string | null;
}

export const SHORT_REPORT_MIN_ACCEPTED_SOURCES = 3;
export const STANDARD_REPORT_MIN_ACCEPTED_SOURCES = 10;
export const ACADEMIC_CLAIM_MIN_SCHOLARLY_SOURCES = 3;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function truthyBoolean(value: unknown): boolean {
  return value === true || value === "true";
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
  const usableSources = acceptedSources
    .map(asRecord)
    .filter(sourceCountsAsUsable);
  const scholarlySourcesCount = usableSources.filter(sourceCountsAsScholarly).length;
  const reliableBackgroundSourcesCount = usableSources.filter(sourceCountsAsReliableBackground).length;
  const officialBackgroundSourcesCount = usableSources.filter(
    (source) => text(source.recommendationBucket) === "official_background",
  ).length;
  return {
    acceptedSourcesCount: acceptedSources.length,
    acceptedUsableSourcesCount: usableSources.length,
    scholarlySourcesCount,
    officialBackgroundSourcesCount,
    reliableBackgroundSourcesCount,
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
  const {
    acceptedSourcesCount,
    acceptedUsableSourcesCount,
    scholarlySourcesCount,
    officialBackgroundSourcesCount,
    reliableBackgroundSourcesCount,
  } = counts;
  const evidenceCardsCount = input.evidenceCards?.length ?? 0;
  const reportMode = inferReportMode(acceptedUsableSourcesCount, input.reportMode);
  const claimMode: ReportClaimMode | "blocked" =
    reportMode === "blocked"
      ? "blocked"
      : scholarlySourcesCount >= ACADEMIC_CLAIM_MIN_SCHOLARLY_SOURCES
        ? "academic_claim_mode"
        : "background_report_mode";
  const minRequiredSources =
    reportMode === "standard"
      ? STANDARD_REPORT_MIN_ACCEPTED_SOURCES
      : SHORT_REPORT_MIN_ACCEPTED_SOURCES;

  if (reportMode === "blocked") {
    return {
      reportMode,
      claimMode,
      acceptedSourcesCount,
      acceptedUsableSourcesCount,
      scholarlySourcesCount,
      officialBackgroundSourcesCount,
      reliableBackgroundSourcesCount,
      evidenceCardsCount,
      minRequiredSources: SHORT_REPORT_MIN_ACCEPTED_SOURCES,
      canGenerate: false,
      canGenerateStandard: false,
      canGenerateShort: false,
      badge: "來源不足",
      buttonLabel: "來源不足",
      message: `目前已接受 ${acceptedUsableSourcesCount} 筆可用來源，至少需 ${SHORT_REPORT_MIN_ACCEPTED_SOURCES} 筆才能生成研究報告。`,
    };
  }

  if (input.evidenceCards && evidenceCardsCount < 1) {
    return {
      reportMode: "blocked",
      claimMode: "blocked",
      acceptedSourcesCount,
      acceptedUsableSourcesCount,
      scholarlySourcesCount,
      officialBackgroundSourcesCount,
      reliableBackgroundSourcesCount,
      evidenceCardsCount,
      minRequiredSources,
      canGenerate: false,
      canGenerateStandard: false,
      canGenerateShort: false,
      badge: "缺少證據卡",
      buttonLabel: "缺少證據卡",
      message: "已接受來源尚未形成證據卡，至少需 1 張證據卡才能生成研究報告。",
    };
  }

  if (reportMode === "short") {
    const backgroundMessage =
      claimMode === "background_report_mode"
        ? "目前來源主要為官方背景或一般可信資料，將生成背景型研究報告；若需要嚴格學術論文式報告，建議補足至少 3 筆同儕審查或學術 metadata 來源。"
        : null;
    return {
      reportMode,
      claimMode,
      acceptedSourcesCount,
      acceptedUsableSourcesCount,
      scholarlySourcesCount,
      officialBackgroundSourcesCount,
      reliableBackgroundSourcesCount,
      evidenceCardsCount,
      minRequiredSources,
      canGenerate: true,
      canGenerateStandard: false,
      canGenerateShort: true,
      badge:
        claimMode === "background_report_mode"
          ? "可生成背景型研究報告"
          : "可生成短版研究報告",
      buttonLabel:
        claimMode === "background_report_mode"
          ? "生成背景型研究報告"
          : "生成短版研究報告",
      message:
        backgroundMessage ??
        (acceptedUsableSourcesCount < STANDARD_REPORT_MIN_ACCEPTED_SOURCES
          ? `目前已接受 ${acceptedUsableSourcesCount} 筆可用來源，可生成短版研究報告。若要生成標準版，建議回到來源管理補足至少 ${STANDARD_REPORT_MIN_ACCEPTED_SOURCES} 筆。`
          : null),
    };
  }

  return {
    reportMode,
    claimMode,
    acceptedSourcesCount,
    acceptedUsableSourcesCount,
    scholarlySourcesCount,
    officialBackgroundSourcesCount,
    reliableBackgroundSourcesCount,
    evidenceCardsCount,
    minRequiredSources,
    canGenerate: true,
    canGenerateStandard: true,
    canGenerateShort: true,
    badge:
      claimMode === "background_report_mode"
        ? "可生成背景型標準報告"
        : "可生成標準研究報告",
    buttonLabel:
      claimMode === "background_report_mode"
        ? "生成背景型研究報告"
        : "生成標準研究報告",
    message:
      claimMode === "background_report_mode"
        ? "目前來源主要為官方背景或一般可信資料，將生成背景型研究報告；若需要嚴格學術論文式報告，建議補足至少 3 筆同儕審查或學術 metadata 來源。"
        : null,
  };
}
