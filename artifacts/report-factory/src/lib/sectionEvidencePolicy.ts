import type { EvidenceCard } from "./evidenceCards.ts";
import type { ResearchSectionKey } from "./qualityJudge.ts";
import type { SourceRecord } from "./sourceRecords.ts";

export type ClaimType =
  | "background"
  | "definition"
  | "method_context"
  | "finding"
  | "comparison"
  | "limitation"
  | "research_gap";

export type ClaimSupportLevel = "strong" | "moderate" | "weak";

export type EvidenceCoverageStatus = "sufficient" | "weak" | "insufficient";

export interface SectionEvidencePolicy {
  sectionKey: ResearchSectionKey;
  sectionTitle: string;
  purpose: string;
  minEvidenceCards: number;
  minCitations: number;
  allowedClaimTypes: ClaimType[];
  forbiddenClaimPatterns: RegExp[];
  allowedSourceTypes: string[];
  fallbackBehavior: string;
  shouldBeLongForm: boolean;
  targetLengthRange: {
    min: number;
    max: number;
  };
  allowUncitedAssertiveSentences: boolean;
}

export interface SupportedClaim {
  id: string;
  sectionKey: ResearchSectionKey;
  claimTextZh: string;
  claimType: ClaimType;
  supportLevel: ClaimSupportLevel;
  evidenceIds: string[];
  citationMarkers: string[];
  sourceTypes: string[];
  canUseInAcademicClaim: boolean;
  limitations: string[];
  confidence: number;
  requiresCaveat: boolean;
}

export interface SectionEvidenceCoverage {
  sectionKey: ResearchSectionKey;
  status: EvidenceCoverageStatus;
  evidenceCardCount: number;
  citationCount: number;
  minEvidenceCards: number;
  minCitations: number;
  diagnostics: string[];
}

export interface UnsupportedClaimGuardResult {
  text: string;
  warnings: string[];
  diagnostics: string[];
}

const BACKGROUND_FORBIDDEN_PATTERNS = [
  /本研究發現/u,
  /本研究證實/u,
  /已證實/u,
  /顯著提升/u,
  /顯著降低/u,
  /造成/u,
  /導致/u,
  /因此可以證明/u,
  /足以說明/u,
  /研究結果顯示/u,
];

const STRONG_CLAIM_PATTERNS = [
  ...BACKGROUND_FORBIDDEN_PATTERNS,
  /證明/u,
  /證實/u,
  /顯著/u,
  /因果/u,
  /主要發現/u,
  /實驗結果/u,
  /統計結論/u,
];

const SECTION_POLICIES: Record<ResearchSectionKey, SectionEvidencePolicy> = {
  title: {
    sectionKey: "title",
    sectionTitle: "標題",
    purpose: "只產生清楚題名，不塞摘要、引用或研究結論。",
    minEvidenceCards: 0,
    minCitations: 0,
    allowedClaimTypes: [],
    forbiddenClaimPatterns: [/\[S\d+\]/u, /研究發現/u, /研究結果/u],
    allowedSourceTypes: [],
    fallbackBehavior: "保留使用者主題與報告類型。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 6, max: 60 },
    allowUncitedAssertiveSentences: true,
  },
  abstract: {
    sectionKey: "abstract",
    sectionTitle: "摘要",
    purpose: "整理研究主題、資料範圍、目前證據狀態與正文可追溯的保守結論。",
    minEvidenceCards: 2,
    minCitations: 2,
    allowedClaimTypes: ["background", "definition", "finding", "comparison", "limitation", "research_gap"],
    forbiddenClaimPatterns: [/本研究證實/u, /比正文更強/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "來源不足時改寫成本報告依目前可接受來源整理，不寫成本研究證實。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 120, max: 260 },
    allowUncitedAssertiveSentences: false,
  },
  introduction: {
    sectionKey: "introduction",
    sectionTitle: "研究背景與動機",
    purpose: "放現象背景、概念定義、研究重要性與值得探討的理由。",
    minEvidenceCards: 2,
    minCitations: 2,
    allowedClaimTypes: ["background", "definition", "research_gap"],
    forbiddenClaimPatterns: BACKGROUND_FORBIDDEN_PATTERNS,
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "agency", "encyclopedia"],
    fallbackBehavior: "只界定背景與研究重要性，不生成研究發現或因果結論。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 150, max: 280 },
    allowUncitedAssertiveSentences: false,
  },
  research_question: {
    sectionKey: "research_question",
    sectionTitle: "研究問題",
    purpose: "把主題轉成可回答、可驗證、可討論的問題，不提前回答問題。",
    minEvidenceCards: 2,
    minCitations: 2,
    allowedClaimTypes: ["research_gap", "background", "definition"],
    forbiddenClaimPatterns: [/結論/u, /證實/u, /發現/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "用來源不足與矛盾處生成待驗證問題。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 90, max: 220 },
    allowUncitedAssertiveSentences: false,
  },
  literature_review: {
    sectionKey: "literature_review",
    sectionTitle: "文獻探討",
    purpose: "比較來源觀點、證據層級、支持關係與缺口，不逐篇摘要。",
    minEvidenceCards: 4,
    minCitations: 4,
    allowedClaimTypes: ["background", "definition", "finding", "comparison", "limitation", "research_gap"],
    forbiddenClaimPatterns: [/目前文獻不足。?$/u, /不足以形成有效比較/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "少於 4 張 evidence cards 時降級成初步文獻整理，少於 2 張時不生成假文獻探討。",
    shouldBeLongForm: true,
    targetLengthRange: { min: 300, max: 900 },
    allowUncitedAssertiveSentences: false,
  },
  methodology: {
    sectionKey: "methodology",
    sectionTitle: "研究方法",
    purpose: "說明資料檢索、來源篩選、證據卡整理與文獻綜合方式，不假裝做了實驗。",
    minEvidenceCards: 1,
    minCitations: 1,
    allowedClaimTypes: ["method_context", "limitation"],
    forbiddenClaimPatterns: [/本文分析全文/u, /本研究進行實驗/u, /訪談了/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "寫成資料檢索與證據整理方法，沒有全文時標明只能依 metadata 或 abstract 整理。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 120, max: 260 },
    allowUncitedAssertiveSentences: false,
  },
  findings: {
    sectionKey: "findings",
    sectionTitle: "主要發現",
    purpose: "只整理 accepted evidence cards 支撐的主張，強主張至少需要兩張證據卡。",
    minEvidenceCards: 3,
    minCitations: 3,
    allowedClaimTypes: ["finding", "comparison", "limitation"],
    forbiddenClaimPatterns: [/官方教育資料.*證實/u, /顯著.*\[[^\]]*\]?$/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly"],
    fallbackBehavior: "若主要來源是官方或教育資料，標題與語氣降級成可支持的初步方向。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 160, max: 360 },
    allowUncitedAssertiveSentences: false,
  },
  discussion: {
    sectionKey: "discussion",
    sectionTitle: "討論",
    purpose: "比較、解釋、提出限制與可能機制，但不能超出證據。",
    minEvidenceCards: 2,
    minCitations: 2,
    allowedClaimTypes: ["finding", "comparison", "limitation", "research_gap"],
    forbiddenClaimPatterns: [/已經證明/u, /必然/u, /完全/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "使用可能、目前來源顯示、仍需進一步驗證等保守語氣。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 160, max: 360 },
    allowUncitedAssertiveSentences: false,
  },
  limitations: {
    sectionKey: "limitations",
    sectionTitle: "限制",
    purpose: "根據 source metadata 與 governance flags 說明來源類型、同儕審查、全文與因果限制。",
    minEvidenceCards: 1,
    minCitations: 1,
    allowedClaimTypes: ["limitation", "research_gap", "method_context"],
    forbiddenClaimPatterns: [/資料完整/u, /沒有任何限制/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "依來源 metadata 保守列出限制，不胡寫外部缺口。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 130, max: 300 },
    allowUncitedAssertiveSentences: false,
  },
  conclusion: {
    sectionKey: "conclusion",
    sectionTitle: "結論與建議",
    purpose: "只收束前面已支撐內容，不新增新事實。",
    minEvidenceCards: 2,
    minCitations: 2,
    allowedClaimTypes: ["finding", "comparison", "limitation", "research_gap"],
    forbiddenClaimPatterns: [/新增/u, /本研究證實/u, /足以證明/u],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "來源不足時明確保守收束，避免完整結論語氣。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 120, max: 300 },
    allowUncitedAssertiveSentences: false,
  },
  references: {
    sectionKey: "references",
    sectionTitle: "參考資料",
    purpose: "列出已接受來源。",
    minEvidenceCards: 0,
    minCitations: 0,
    allowedClaimTypes: [],
    forbiddenClaimPatterns: [],
    allowedSourceTypes: ["peer_reviewed", "scholarly", "official_background", "educational", "metadata"],
    fallbackBehavior: "只列已接受來源。",
    shouldBeLongForm: false,
    targetLengthRange: { min: 0, max: 2000 },
    allowUncitedAssertiveSentences: true,
  },
};

const ASSERTIVE_SENTENCE_PATTERN =
  /顯示|指出|說明|造成|導致|影響|提升|降低|相關|證實|發現|根據|由於|因此|支持|支撐|可見|證明/u;

const RAW_EVIDENCE_LEAK_PATTERNS = [
  /此來源為低信心待人工審查/u,
  /若確認與主題相關，可以手動接受/u,
  /available evidence/iu,
  /candidate/iu,
  /provider_status/iu,
  /debug/iu,
  /0\s*個\s*citation/iu,
  /\d+\s*張證據/u,
  /source card/iu,
  /recommendationBucket/iu,
  /retrievalMode/iu,
  /evidence cards?/iu,
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function dedupe(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(cleanText).filter(Boolean)));
}

function stripEnding(value: string): string {
  return cleanText(value).replace(/[。！？!?；;，,\s]+$/u, "");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function sourceIdForMarker(source: SourceRecord, index: number): string {
  return source.id || [source.sourceType, source.doi, source.url, source.title, index + 1]
    .filter(Boolean)
    .join(":");
}

export function buildStableCitationMarkerMap(sources: SourceRecord[]): Map<string, string> {
  return new Map(
    sources
      .map((source, index) => [sourceIdForMarker(source, index), `[S${index + 1}]`] as const)
      .filter(([id]) => Boolean(id)),
  );
}

export function citationMarkersForSourceIds(
  sourceIds: string[],
  markerMap: Map<string, string>,
): string[] {
  return dedupe(sourceIds.map((id) => markerMap.get(id)));
}

export function extractCitationMarkers(text: string): string[] {
  return dedupe(text.match(/\[S\d+\]/gu) ?? []);
}

export function sourceIdsFromCitationMarkers(
  markers: string[],
  markerMap: Map<string, string>,
): string[] {
  const markerToSource = new Map(Array.from(markerMap.entries()).map(([id, marker]) => [marker, id]));
  return dedupe(markers.map((marker) => markerToSource.get(marker)));
}

export function getSectionEvidencePolicy(sectionKey: string): SectionEvidencePolicy {
  return SECTION_POLICIES[(sectionKey as ResearchSectionKey) in SECTION_POLICIES ? sectionKey as ResearchSectionKey : "introduction"];
}

export function allSectionEvidencePolicies(): SectionEvidencePolicy[] {
  return Object.values(SECTION_POLICIES);
}

export function evidenceCardIsScholarly(card: EvidenceCard): boolean {
  if (card.recommendationBucket === "scholarly_recommended") return true;
  if (card.isPeerReviewed === true) return true;
  if (card.doi?.trim()) return true;
  if (evidenceCardIsOfficialOrEducational(card)) return false;
  return /\b(crossref|openalex|semantic scholar|journal|conference|paper|review|academic|scholarly)\b/iu.test(
    [
      card.sourceType,
      card.sourceProvider,
      card.provider,
      card.venue,
      card.sourceCategory,
      card.sourceRole,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function evidenceCardIsOfficialOrEducational(card: EvidenceCard): boolean {
  if (card.recommendationBucket === "official_background") return true;
  return /\b(official_background|official|institutional|government|agency|education|educational|university|extension|encyclopedia|nasa|ucar|noaa|\.gov|\.edu)\b/iu.test(
    [
      card.sourceType,
      card.sourceProvider,
      card.provider,
      card.sourceCategory,
      card.sourceRole,
      card.sourceDomain,
      card.sourceUrl,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export function evidenceCardIsAbstractOnly(card: EvidenceCard): boolean {
  return card.abstractOnly === true ||
    card.derivation === "abstract-derived" ||
    card.derivation === "metadata-derived" ||
    !card.abstract;
}

function sourceTypeForClaim(card: EvidenceCard): string {
  if (evidenceCardIsScholarly(card)) return "scholarly";
  if (evidenceCardIsOfficialOrEducational(card)) return "official_background";
  if (evidenceCardIsAbstractOnly(card)) return "metadata";
  return card.sourceType || "unknown";
}

function confidenceForCards(cards: EvidenceCard[]): number {
  if (cards.length === 0) return 0;
  const average = cards.reduce((sum, card) => sum + (card.confidenceScore ?? 0.4), 0) / cards.length;
  const sourceBonus = Math.min(0.18, (cards.length - 1) * 0.06);
  return Math.min(0.95, Math.max(0.2, average + sourceBonus));
}

function supportLevelForCards(cards: EvidenceCard[]): ClaimSupportLevel {
  const confidence = confidenceForCards(cards);
  if (cards.length >= 2 && confidence >= 0.72 && cards.some(evidenceCardIsScholarly)) return "strong";
  if (confidence >= 0.5) return "moderate";
  return "weak";
}

function claimTextFromCards(cards: EvidenceCard[], type: ClaimType): string {
  const points = dedupe(
    cards.map((card) =>
      stripEnding(
        card.claimTextZhTw ||
          card.mainClaim ||
          card.evidencePointZhTw ||
          card.sourceSummaryZhTw ||
          card.summary ||
          card.sourceTitle,
      ),
    ),
  ).slice(0, 3);
  if (points.length === 0) return "目前來源只能提供有限的研究線索";
  if (type === "comparison") {
    return `不同來源可比較的重點包括${points.join("、")}`;
  }
  if (type === "limitation" || type === "research_gap") {
    return `目前證據仍受限於${points.join("、")}`;
  }
  if (type === "definition") {
    return `本題的概念可先界定為${points[0]}`;
  }
  if (points.length === 1) return points[0]!;
  return `多個來源共同指向${points.join("、")}`;
}

function claimTypesForCard(card: EvidenceCard): ClaimType[] {
  if (evidenceCardIsOfficialOrEducational(card) && !evidenceCardIsScholarly(card)) {
    return ["background", "definition", "limitation", "research_gap"];
  }
  if (evidenceCardIsScholarly(card)) {
    return ["finding", "comparison", "background", "limitation", "research_gap"];
  }
  if (evidenceCardIsAbstractOnly(card)) return ["background", "research_gap", "limitation"];
  return ["background", "limitation"];
}

function sectionForClaimType(type: ClaimType): ResearchSectionKey {
  switch (type) {
    case "finding":
      return "findings";
    case "comparison":
      return "literature_review";
    case "method_context":
      return "methodology";
    case "limitation":
      return "limitations";
    case "research_gap":
      return "discussion";
    case "definition":
    case "background":
    default:
      return "introduction";
  }
}

export function buildSupportedClaimsFromEvidenceCards(
  evidenceCards: EvidenceCard[],
  options: {
    markerMap: Map<string, string>;
  },
): SupportedClaim[] {
  const cards = evidenceCards.filter((card) => card.sourceId && options.markerMap.has(card.sourceId));
  const scholarlyCards = cards.filter(evidenceCardIsScholarly);
  const fullScholarlyCards = scholarlyCards.filter((card) => !evidenceCardIsAbstractOnly(card));
  const abstractOnlyScholarlyCards = scholarlyCards.filter(evidenceCardIsAbstractOnly);
  const backgroundCards = cards.filter((card) => !evidenceCardIsScholarly(card));
  const claims: SupportedClaim[] = [];

  const addClaim = (claimType: ClaimType, claimCards: EvidenceCard[], index: number) => {
    if (claimCards.length === 0) return;
    const sourceTypes = dedupe(claimCards.map(sourceTypeForClaim));
    const citationMarkers = citationMarkersForSourceIds(
      claimCards.map((card) => card.sourceId),
      options.markerMap,
    );
    const academic = claimCards.some(evidenceCardIsScholarly) && !claimCards.every(evidenceCardIsAbstractOnly);
    const limitations = dedupe([
      ...claimCards.flatMap((card) => card.limitationsZhTw ?? []),
      ...claimCards.flatMap((card) => card.limitations ?? []),
      claimCards.some(evidenceCardIsOfficialOrEducational)
        ? "官方、教育或機構資料只能支撐背景與概念，不能單獨支撐強研究結論。"
        : null,
      claimCards.some(evidenceCardIsAbstractOnly)
        ? "部分來源僅依摘要或 metadata 整理，支持力需降級。"
        : null,
    ]);
    const supportLevel = evidenceCardIsAbstractOnly(claimCards[0]!) && claimCards.length === 1
      ? "weak"
      : supportLevelForCards(claimCards);
    claims.push({
      id: `claim:${claimType}:${index + 1}:${claimCards.map((card) => card.id).join("|")}`,
      sectionKey: sectionForClaimType(claimType),
      claimTextZh: claimTextFromCards(claimCards, claimType),
      claimType,
      supportLevel,
      evidenceIds: dedupe(claimCards.map((card) => card.id)),
      citationMarkers,
      sourceTypes,
      canUseInAcademicClaim: academic && (claimType === "finding" || claimType === "comparison"),
      limitations,
      confidence: confidenceForCards(claimCards),
      requiresCaveat: supportLevel !== "strong" || limitations.length > 0,
    });
  };

  chunk(fullScholarlyCards, 2).forEach((claimCards, index) => {
    addClaim(index % 2 === 0 ? "finding" : "comparison", claimCards, index);
  });
  chunk(abstractOnlyScholarlyCards, 1).forEach((claimCards, index) => {
    addClaim("finding", claimCards, index + fullScholarlyCards.length);
  });
  chunk(backgroundCards, 3).forEach((claimCards, index) => {
    const first = claimCards[0]!;
    const types = claimTypesForCard(first);
    addClaim(types.includes("definition") && index === 0 ? "definition" : "background", claimCards, index);
  });
  const limitedCards = cards.filter((card) => evidenceCardIsAbstractOnly(card) || card.limitations.length > 0);
  if (limitedCards.length > 0) addClaim("limitation", limitedCards.slice(0, 4), 0);
  if (cards.length < 5) addClaim("research_gap", cards.slice(0, 3), 0);

  return claims;
}

export function selectSupportedClaimsForSection(
  claims: SupportedClaim[],
  sectionKey: ResearchSectionKey,
): SupportedClaim[] {
  const policy = getSectionEvidencePolicy(sectionKey);
  return claims
    .filter((claim) => policy.allowedClaimTypes.includes(claim.claimType))
    .filter((claim) => {
      if (sectionKey === "findings") return claim.canUseInAcademicClaim;
      if (sectionKey === "introduction") return claim.claimType !== "finding" && claim.claimType !== "comparison";
      return true;
    })
    .sort((a, b) => {
      const supportOrder = { strong: 3, moderate: 2, weak: 1 } as const;
      return supportOrder[b.supportLevel] - supportOrder[a.supportLevel] ||
        b.evidenceIds.length - a.evidenceIds.length ||
        b.confidence - a.confidence;
    });
}

function claimMarkersText(claims: SupportedClaim[], min = 1): string {
  return dedupe(claims.flatMap((claim) => claim.citationMarkers)).slice(0, Math.max(min, 1)).join("");
}

function claimEvidenceIds(claims: SupportedClaim[]): string[] {
  return dedupe(claims.flatMap((claim) => claim.evidenceIds));
}

function sentenceWithMarkers(text: string, markers: string): string {
  const cleaned = stripEnding(text);
  return markers ? `${cleaned}${markers}。` : `${cleaned}。`;
}

function sourceTypeSummary(claims: SupportedClaim[]): string {
  const types = dedupe(claims.flatMap((claim) => claim.sourceTypes));
  const hasScholarly = types.includes("scholarly");
  const hasOfficial = types.includes("official_background") || types.includes("educational");
  const hasMetadata = types.includes("metadata");
  if (hasScholarly && hasOfficial) return "同儕審查或學術來源與官方／教育背景資料並存";
  if (hasScholarly) return "主要包含學術或同儕審查來源";
  if (hasOfficial) return "主要包含官方、教育或機構背景資料";
  if (hasMetadata) return "部分來源只有摘要或 metadata";
  return "來源類型仍需人工確認";
}

function limitationSentence(claims: SupportedClaim[], markers: string): string {
  const limitations = dedupe(claims.flatMap((claim) => claim.limitations)).slice(0, 2);
  if (limitations.length === 0) return sentenceWithMarkers("因此本段只收束目前可追溯的內容，仍不新增未查證事實", markers);
  return sentenceWithMarkers(`限制在於${limitations.join("；")}`, markers);
}

export function synthesizeSectionParagraph(input: {
  sectionKey: ResearchSectionKey;
  topic: string;
  claims: SupportedClaim[];
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  markerMap: Map<string, string>;
}): {
  body: string;
  warnings: string[];
  evidenceCardIds: string[];
  citationMarkers: string[];
  citationIds: string[];
  coverage: SectionEvidenceCoverage;
} {
  const policy = getSectionEvidencePolicy(input.sectionKey);
  const claims = selectSupportedClaimsForSection(input.claims, input.sectionKey);
  const markers = claimMarkersText(claims, policy.minCitations || 1);
  const allMarkers = dedupe(claims.flatMap((claim) => claim.citationMarkers));
  const evidenceCardIds = claimEvidenceIds(claims);
  const coverage = validateSectionEvidenceCoverage({
    sectionKey: input.sectionKey,
    text: "",
    claims,
    evidenceCardIds,
    citationMarkers: allMarkers,
  });
  const warnings: string[] = [];
  let body = "";

  if (input.sectionKey === "research_question") {
    const lead = claims[0]?.claimTextZh ?? input.topic;
    body = [
      `1. 「${input.topic}」可以如何被界定為可觀察或可比較的研究問題？`,
      `2. 現有來源在「${stripEnding(lead)}」方面提供哪些線索，仍有哪些未被直接驗證？`,
      "3. 若後續要形成較強結論，還需要補充哪些同儕審查文獻、全文或方法資料？",
    ].join("\n");
  } else if (input.sectionKey === "methodology") {
    const metadataOnlyCount = input.evidenceCards.filter(evidenceCardIsAbstractOnly).length;
    body = [
      `本報告採資料檢索、來源篩選、證據卡整理與文獻綜合方式撰寫「${input.topic}」。`,
      `正文只使用已接受來源能追溯的證據卡，不把沒有證據編號或已接受來源的想法寫成正式主張${markers}。`,
      metadataOnlyCount > 0
        ? "因部分來源僅有摘要或 metadata，本報告只說明可由摘要與書目資料整理出的內容，不能宣稱已分析全文。"
        : "若來源未提供全文，本報告仍以摘要、書目與可讀摘錄作為保守整理基礎。",
    ].join("");
  } else if (input.sectionKey === "limitations") {
    const peerReviewedCount = input.evidenceCards.filter(evidenceCardIsScholarly).length;
    const officialCount = input.evidenceCards.filter(evidenceCardIsOfficialOrEducational).length;
    const abstractOnlyCount = input.evidenceCards.filter(evidenceCardIsAbstractOnly).length;
    body = [
      `目前來源結構顯示，官方、教育或機構背景資料約 ${officialCount} 筆，較適合支撐背景與概念整理。`,
      `可視為學術或同儕審查證據的來源約 ${peerReviewedCount} 筆，因此強研究結論仍需更多論文或正式研究報告支撐。`,
      `摘要或 metadata 層級來源約 ${abstractOnlyCount} 筆，代表本報告不能宣稱已完成全文分析，也不能直接做因果、統計顯著或實驗結果結論。`,
    ].join("");
  } else if (claims.length === 0 || evidenceCardIds.length < policy.minEvidenceCards) {
    warnings.push("目前此段來源不足，已改為保守敘述。");
    if (input.sectionKey === "literature_review" && evidenceCardIds.length < 2) {
      body = "目前來源不足，建議回到來源審查補充同儕審查文獻、全文或可比較的學術來源後，再生成正式文獻探討。";
    } else if (input.sectionKey === "literature_review") {
      body = [
        `初步文獻整理：目前可用來源仍少於正式文獻探討所需的 5 張證據卡，因此本節只整理已能追溯的背景與缺口${markers}。`,
        `${sourceTypeSummary(claims)}，其中官方或教育資料可協助說明概念，但不能單獨支撐正式研究結論${markers}。`,
        "後續應補充同儕審查論文、全文或可比較的方法資料，再形成更完整的文獻比較。",
      ].join("\n\n");
    } else {
      body = `目前來源尚不足以支持「${policy.sectionTitle}」形成更強正式主張。本節僅保留研究範圍與限制，避免把未被引用標記支撐的內容寫成結論。`;
    }
  } else if (input.sectionKey === "abstract") {
    body = [
      sentenceWithMarkers(`本報告依目前可接受來源整理「${input.topic}」的研究主題、資料範圍與證據狀態`, markers),
      sentenceWithMarkers(`目前可追溯的重點包括${claims.slice(0, 2).map((claim) => stripEnding(claim.claimTextZh)).join("；")}`, markers),
      sentenceWithMarkers("這些內容只能作為正文中已引用主張的摘要，不應寫成比正文更強的研究結論", markers),
      limitationSentence(claims, markers),
    ].join("");
  } else if (input.sectionKey === "introduction") {
    body = [
      sentenceWithMarkers(`「${input.topic}」的研究背景可先從概念界定、現象脈絡與值得探討的理由切入`, markers),
      sentenceWithMarkers(`目前來源能協助說明${claims.slice(0, 2).map((claim) => stripEnding(claim.claimTextZh)).join("；")}`, markers),
      sentenceWithMarkers("本節只用這些內容建立研究動機，不提前宣稱研究已得到發現、因果或統計結論", markers),
    ].join("");
  } else if (input.sectionKey === "literature_review") {
    const first = claims.slice(0, 2);
    const second = claims.slice(2, 4);
    const third = claims.slice(4, 6);
    const paragraphOne = sentenceWithMarkers(
      `目前文獻與背景資料共同指向「${input.topic}」需要先釐清${first.map((claim) => stripEnding(claim.claimTextZh)).join("，並比較")}`,
      claimMarkersText(first, 2) || markers,
    );
    const paragraphTwo = sentenceWithMarkers(
      second.length > 0
        ? `不同來源的證據層級並不相同：${sourceTypeSummary(second)}，可支持的範圍應限於${second.map((claim) => stripEnding(claim.claimTextZh)).join("；")}`
        : `${sourceTypeSummary(claims)}，官方或教育來源可支撐背景說明，但不能直接當成正式研究結論`,
      claimMarkersText(second, 2) || markers,
    );
    const paragraphThree = sentenceWithMarkers(
      third.length > 0
        ? `綜合比較後，可形成的後續方向是檢驗${third.map((claim) => stripEnding(claim.claimTextZh)).join("；")}，但仍需確認全文、方法與同儕審查證據`
        : "目前仍需補充更多同儕審查文獻、全文與方法資料，才能把背景資料提升為完整文獻比較",
      claimMarkersText(third, 2) || markers,
    );
    body = [paragraphOne, paragraphTwo, paragraphThree].join("\n\n");
  } else if (input.sectionKey === "findings") {
    const titlePrefix = input.evidenceCards.filter(evidenceCardIsScholarly).length < 3
      ? "可支持的初步方向"
      : "主要發現";
    body = [
      sentenceWithMarkers(`${titlePrefix}應限於已接受證據卡能追溯的內容`, markers),
      sentenceWithMarkers(`目前較可成立的主張包括${claims.slice(0, 3).map((claim) => stripEnding(claim.claimTextZh)).join("；")}`, markers),
      sentenceWithMarkers("若主張需要因果或顯著差異語氣，仍必須補充更多 peer-reviewed evidence 後才能升級", markers),
    ].join("");
  } else if (input.sectionKey === "discussion") {
    body = [
      sentenceWithMarkers(`把目前證據放在一起看，「${input.topic}」只能形成有限但可追溯的解讀`, markers),
      sentenceWithMarkers(`目前來源顯示較合理的討論方向是${claims.slice(0, 3).map((claim) => stripEnding(claim.claimTextZh)).join("；")}`, markers),
      sentenceWithMarkers("這些解讀仍需進一步驗證，尤其不能把背景資料外推成因果或統計結論", markers),
    ].join("");
  } else if (input.sectionKey === "conclusion") {
    body = [
      sentenceWithMarkers(`根據前述已支撐內容，「${input.topic}」目前只能形成保守結論`, markers),
      sentenceWithMarkers(`可收束的重點包括${claims.slice(0, 2).map((claim) => stripEnding(claim.claimTextZh)).join("；")}`, markers),
      sentenceWithMarkers("後續建議是補充同儕審查來源、全文或更直接的方法資料，再提升結論強度", markers),
    ].join("");
  } else {
    body = claims.map((claim) => sentenceWithMarkers(claim.claimTextZh, claim.citationMarkers.join(""))).join("");
  }

  const guarded = guardUnsupportedSectionClaims({
    sectionKey: input.sectionKey,
    text: body,
    availableCitationMarkers: allMarkers,
  });
  warnings.push(...guarded.warnings);
  const finalMarkers = extractCitationMarkers(guarded.text).filter((marker) => allMarkers.includes(marker));
  const finalCoverage = validateSectionEvidenceCoverage({
    sectionKey: input.sectionKey,
    text: guarded.text,
    claims,
    evidenceCardIds,
    citationMarkers: finalMarkers,
  });
  const finalCitationIds = sourceIdsFromCitationMarkers(finalMarkers, input.markerMap);
  return {
    body: guarded.text,
    warnings: dedupe(warnings),
    evidenceCardIds,
    citationMarkers: finalMarkers,
    citationIds: finalCitationIds,
    coverage: finalCoverage,
  };
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceIsAssertive(sentence: string): boolean {
  return ASSERTIVE_SENTENCE_PATTERN.test(sentence);
}

function sentenceHasCitation(sentence: string, allowedMarkers: string[]): boolean {
  const markers = extractCitationMarkers(sentence);
  return markers.some((marker) => allowedMarkers.includes(marker));
}

function rewriteStrongBackgroundClaim(sentence: string): string {
  return sentence
    .replace(/本研究發現/gu, "目前來源可作為背景線索指出")
    .replace(/本研究證實|已證實|因此可以證明|足以說明/gu, "目前來源尚不足以證明")
    .replace(/顯著提升/gu, "可能提高")
    .replace(/顯著降低/gu, "可能降低")
    .replace(/造成|導致/gu, "可能與此相關")
    .replace(/研究結果顯示/gu, "目前來源顯示");
}

export function guardUnsupportedSectionClaims(input: {
  sectionKey: ResearchSectionKey;
  text: string;
  availableCitationMarkers: string[];
}): UnsupportedClaimGuardResult {
  const policy = getSectionEvidencePolicy(input.sectionKey);
  const allowedMarkers = dedupe(input.availableCitationMarkers);
  const warnings: string[] = [];
  const diagnostics: string[] = [];
  const guardedSentences = splitSentences(input.text)
    .map((sentence) => {
      if (RAW_EVIDENCE_LEAK_PATTERNS.some((pattern) => pattern.test(sentence))) {
        warnings.push("已移除 evidence card/debug 原文洩漏。");
        diagnostics.push(`raw_leak_removed:${input.sectionKey}`);
        return "";
      }

      let nextSentence = sentence;
      if (policy.forbiddenClaimPatterns.some((pattern) => pattern.test(nextSentence))) {
        nextSentence = rewriteStrongBackgroundClaim(nextSentence);
        warnings.push("已將不符合章節政策的強主張改為保守語氣。");
        diagnostics.push(`forbidden_claim_rewritten:${input.sectionKey}`);
      }

      if (
        sentenceIsAssertive(nextSentence) &&
        !sentenceHasCitation(nextSentence, allowedMarkers) &&
        !policy.allowUncitedAssertiveSentences
      ) {
        const marker = allowedMarkers[0];
        if (marker) {
          nextSentence = `${stripEnding(nextSentence)}${marker}。`;
          diagnostics.push(`citation_marker_added:${input.sectionKey}`);
        } else {
          nextSentence = "目前來源尚不足以支持此結論。";
          warnings.push("已阻擋無引用標記的正式主張。");
          diagnostics.push(`unsupported_claim_blocked:${input.sectionKey}`);
        }
      }
      return nextSentence;
    })
    .filter(Boolean);

  const uniqueGuardedSentences = dedupe(guardedSentences);
  return {
    text: uniqueGuardedSentences.join(input.sectionKey === "literature_review" ? "\n\n" : ""),
    warnings: dedupe(warnings),
    diagnostics: dedupe(diagnostics),
  };
}

export function validateSectionEvidenceCoverage(input: {
  sectionKey: ResearchSectionKey;
  text: string;
  claims: SupportedClaim[];
  evidenceCardIds: string[];
  citationMarkers: string[];
}): SectionEvidenceCoverage {
  const policy = getSectionEvidencePolicy(input.sectionKey);
  const citationMarkers = input.text
    ? extractCitationMarkers(input.text)
    : input.citationMarkers;
  const evidenceCardCount = dedupe(input.evidenceCardIds).length;
  const citationCount = dedupe(citationMarkers).length;
  const diagnostics: string[] = [];
  if (evidenceCardCount < policy.minEvidenceCards) {
    diagnostics.push(`minEvidenceCards:${evidenceCardCount}/${policy.minEvidenceCards}`);
  }
  if (citationCount < policy.minCitations) {
    diagnostics.push(`minCitations:${citationCount}/${policy.minCitations}`);
  }
  const strongEnoughClaims = input.claims.filter((claim) => {
    if (input.sectionKey === "findings") return claim.canUseInAcademicClaim;
    return policy.allowedClaimTypes.includes(claim.claimType);
  });
  if (input.sectionKey === "findings" && strongEnoughClaims.length === 0) {
    diagnostics.push("findings_without_academic_claim");
  }
  let status: EvidenceCoverageStatus = "sufficient";
  if (evidenceCardCount < policy.minEvidenceCards || citationCount < policy.minCitations) {
    status = evidenceCardCount === 0 && policy.minEvidenceCards > 0 ? "insufficient" : "weak";
  }
  if (input.sectionKey === "literature_review" && evidenceCardCount < 2) status = "insufficient";
  if (input.sectionKey === "findings" && strongEnoughClaims.length === 0) status = "insufficient";
  if (policy.minEvidenceCards === 0 && policy.minCitations === 0) status = "sufficient";
  return {
    sectionKey: input.sectionKey,
    status,
    evidenceCardCount,
    citationCount,
    minEvidenceCards: policy.minEvidenceCards,
    minCitations: policy.minCitations,
    diagnostics: dedupe(diagnostics),
  };
}
