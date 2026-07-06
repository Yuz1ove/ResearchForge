import type { EvidenceCard } from "./evidenceCards.ts";
import type { ReportOutline, ReportOutlineSection } from "./reportOutline.ts";
import {
  buildBibliography,
  type SourceRecord,
  type WorkflowReportSection,
} from "./sourceRecords.ts";
import {
  buildAcceptedSourceDigest,
  type AcceptedSourceDigest,
} from "./sourceDigest.ts";
import {
  buildQualityReport,
  type QualityReport,
  type ResearchProject,
  type ResearchSectionKey,
} from "./qualityJudge.ts";
import {
  buildStableCitationMarkerMap,
  buildSupportedClaimsFromEvidenceCards,
  citationMarkersForSourceIds,
  extractCitationMarkers,
  getSectionEvidencePolicy,
  guardUnsupportedSectionClaims,
  selectSupportedClaimsForSection,
  sourceIdsFromCitationMarkers,
  synthesizeSectionParagraph,
  validateSectionEvidenceCoverage,
  type EvidenceCoverageStatus,
  type SectionEvidenceCoverage,
  type SupportedClaim,
} from "./sectionEvidencePolicy.ts";

export interface ReportDraftInput {
  project: ResearchProject;
  topic: string;
  reportType: string;
  audience: string;
  evidenceCards: EvidenceCard[];
  outline: ReportOutline;
  acceptedSources: SourceRecord[];
  acceptedSourceDigest?: AcceptedSourceDigest;
  citationFormat?: string;
}

export interface ReportDraftSectionEvidenceMapEntry {
  sectionId: string;
  title: string;
  purpose: string;
  evidenceCardIds: string[];
  citationIds: string[];
  citationMarkers: string[];
  coverageStatus: EvidenceCoverageStatus;
  abstractOnlyCount: number;
  missingEvidence: string[];
}

export interface ReportParagraphPlan {
  sectionId: string;
  paragraphPurpose: string;
  topicSentence: string;
  claims: string[];
  evidenceCardIds: string[];
  citationIds: string[];
  synthesisGoal: string;
  missingEvidence: string[];
  limitationOrTransition: string;
}

export interface ReportDraftDebug {
  acceptedSourcesCount: number;
  evidenceCardsCount: number;
  evidenceCardAbstractOnly: Array<{
    evidenceCardId: string;
    sourceId: string;
    abstractOnly: boolean;
  }>;
  evidenceGaps: string[];
  sectionEvidenceMap: ReportDraftSectionEvidenceMapEntry[];
  paragraphPlans: ReportParagraphPlan[];
  supportedClaims: SupportedClaim[];
  sectionCoverage: SectionEvidenceCoverage[];
  reportDraftGeneratedFromPlans: boolean;
}

export interface ReportDraftSection {
  sectionId: string;
  title: string;
  body: string;
  synthesizedProseZhTw: string;
  sectionGoal: string;
  supportingSourceIds: string[];
  citationMarkers: string[];
  evidenceSummary: string;
  evidenceGaps: string[];
  writerNote: string;
  evidenceCardIds: string[];
  citationIds: string[];
  evidenceCoverageStatus: EvidenceCoverageStatus;
  citationCount: number;
  evidenceCardCount: number;
  warnings: string[];
}

export interface ReportDraft {
  reportId: string;
  workflowId: string | null;
  topicHash: string | null;
  title: string;
  sections: ReportDraftSection[];
  referenceList: string[];
  references: string[];
  text: string;
  qualityReport: QualityReport;
  sectionEvidenceMap: ReportDraftSectionEvidenceMapEntry[];
  paragraphPlans: ReportParagraphPlan[];
  debug: ReportDraftDebug;
}

export interface ReportSynthesisContext {
  project: ResearchProject;
  topic: string;
  reportType: string;
  audience: string;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  outline: ReportOutline;
  acceptedSourceDigest: AcceptedSourceDigest;
  evidenceNumbers: Map<string, number>;
  sourceMarkerMap: Map<string, string>;
  supportedClaims: SupportedClaim[];
}

export interface SectionPlan {
  sectionId: string;
  key: ResearchSectionKey;
  title: string;
  intent: string;
  evidenceSections: WorkflowReportSection[];
  selectedEvidence: EvidenceCard[];
  needsMoreEvidence: boolean;
}

const SECTION_EVIDENCE_MAP: Record<string, WorkflowReportSection[]> = {
  abstract: ["研究背景", "文獻探討", "數據分析", "結論"],
  introduction: ["研究背景"],
  research_question: ["研究背景", "文獻探討"],
  literature_review: ["文獻探討"],
  methodology: ["研究方法"],
  findings: ["數據分析", "文獻探討", "研究背景"],
  discussion: ["數據分析", "文獻探討", "結論"],
  limitations: ["研究方法", "數據分析", "結論"],
  conclusion: ["結論", "數據分析", "文獻探討"],
  references: [],
  title: [],
};

const INSTRUCTION_TEXT_PATTERNS = [
  /應討論/gu,
  /可再補充/gu,
  /請撰寫/gu,
  /本段應/gu,
  /寫作指引/giu,
  /section guideline/giu,
  /instruction/giu,
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function stripTrailingPunctuation(value: string): string {
  return cleanText(value).replace(/[。！？.!?；;：:、，,\s]+$/u, "");
}

function marker(card: EvidenceCard, sourceMarkerMap: Map<string, string>): string {
  return sourceMarkerMap.get(card.sourceId) ?? "";
}

function cardsFor(cards: EvidenceCard[], sections: WorkflowReportSection[]): EvidenceCard[] {
  const wanted = new Set(sections);
  return cards.filter((card) => card.usableSections.some((section) => wanted.has(section)));
}

function sectionMarkers(cards: EvidenceCard[], sourceMarkerMap: Map<string, string>): string[] {
  return citationMarkersForSourceIds(cards.map((card) => card.sourceId), sourceMarkerMap);
}

function citationIdsForCards(cards: EvidenceCard[]): string[] {
  return cards.map((card) => card.sourceId);
}

function proseList(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]}與${items[1]}`;
  return `${items.slice(0, -1).join("、")}與${items[items.length - 1]}`;
}

function abstractOnly(card: EvidenceCard): boolean {
  return card.abstractOnly ?? card.derivation !== "fulltext-derived";
}

function evidenceLead(card: EvidenceCard): string {
  return (
    stripTrailingPunctuation(card.mainClaim) ||
    stripTrailingPunctuation(card.usableEvidence) ||
    stripTrailingPunctuation(card.summary) ||
    stripTrailingPunctuation(card.evidence) ||
    stripTrailingPunctuation(card.sourceTitle) ||
    "此來源提供研究線索"
  );
}

function evidenceTitleSummary(cards: EvidenceCard[], sourceMarkerMap: Map<string, string>, limit = 3): string {
  return cards
    .slice(0, limit)
    .map((card) => `${card.sourceTitle || "已接受來源"}${marker(card, sourceMarkerMap)}`)
    .join("、");
}

function evidenceHighlights(cards: EvidenceCard[], sourceMarkerMap: Map<string, string>, limit = 3): string[] {
  return cards.slice(0, limit).map((card) => `${evidenceLead(card)}${marker(card, sourceMarkerMap)}`);
}

function evidenceLimitationSummary(cards: EvidenceCard[]): string {
  const explicit = cards
    .flatMap((card) => card.limitations)
    .map(stripTrailingPunctuation)
    .filter(Boolean);
  if (explicit.length > 0) {
    return `限制在於${proseList(Array.from(new Set(explicit)).slice(0, 2), "證據完整度仍有限")}。`;
  }
  if (cards.some(abstractOnly)) {
    return "目前多數內容仍以摘要或書目片段為基礎，不能等同於已讀取全文。";
  }
  return "";
}

function sectionGapSummary(gaps: string[], fallback: string): string[] {
  return gaps.length > 0 ? gaps.slice(0, 3) : [fallback];
}

function sectionTopicSentence(
  sectionId: string,
  topic: string,
  claims: string[],
): string {
  const claimLead = claims[0] ?? topic;
  switch (sectionId) {
    case "abstract":
      return `本摘要根據已接受來源整理「${topic}」目前可被證據支持的重點與限制。`;
    case "introduction":
      return `「${topic}」的研究背景可先從現有來源共同提到的概念與應用情境切入。`;
    case "research_question":
      return `依照目前來源內容，本報告將研究問題聚焦在幾個已可蒐證的面向。`;
    case "literature_review":
      return `現有文獻對「${topic}」的討論，主要圍繞${claimLead}等核心面向。`;
    case "methodology":
      return "本報告採用來源審查與證據卡整理方式組裝草稿，不額外虛構實驗或訪談結果。";
    case "findings":
      return `綜合已接受來源，目前能較穩定支持的發現集中在${claimLead}等面向。`;
    case "discussion":
      return `把目前證據放在一起看，「${topic}」可以先形成有限但可追溯的解讀。`;
    case "limitations":
      return `本研究草稿的限制主要來自資料範圍、摘要完整度與主題覆蓋差異。`;
    case "conclusion":
      return `根據現有來源，「${topic}」可先得到一份受證據約束的初步結論。`;
    default:
      return `本節整理「${topic}」目前可確認的證據內容。`;
  }
}

function sectionSynthesisGoal(sectionId: string): string {
  switch (sectionId) {
    case "abstract":
      return "快速交代主題、主要證據與限制";
    case "introduction":
      return "交代背景與研究重要性";
    case "research_question":
      return "把主題收斂成可蒐證問題";
    case "literature_review":
      return "整合來源共識，不逐篇摘要";
    case "methodology":
      return "說明本草稿的取材方式與證據邊界";
    case "findings":
      return "整合主要發現";
    case "discussion":
      return "連接發現與限制";
    case "limitations":
      return "明確標示不足處";
    case "conclusion":
      return "收束成保守結論";
    default:
      return "整理本節可用證據";
  }
}

function buildResearchQuestions(topic: string, claims: string[], gaps: string[]): string[] {
  const first = claims[0] ?? topic;
  const second = claims[1] ?? "現有證據的適用範圍";
  return [
    `1. 「${topic}」目前可從哪些可驗證概念切入，例如${first}？`,
    `2. 現有來源是否能把${second}連成一致的研究脈絡？`,
    `3. 哪些結論仍受${proseList(gaps.slice(0, 2), "資料缺口")}限制而不能下定論？`,
  ];
}

function sanitizeReportParagraph(text: string): string {
  let sanitized = text.trim();
  for (const pattern of INSTRUCTION_TEXT_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }
  sanitized = sanitized.replace(/\s+/g, " ").trim();
  return sanitized || "目前可用證據不足，本段暫不形成正式結論。";
}

function sectionTitleFor(sectionId: string, title: string): string {
  return sectionId === "title" ? "標題" : title.replace(/^[一二三四五六七八九十]+、/, "");
}

export function buildReportSynthesisContext(input: ReportDraftInput): ReportSynthesisContext {
  const topic = input.topic.trim() || input.outline.topic;
  const reportType = input.reportType.trim() || input.outline.reportType;
  const audience = input.audience.trim() || input.outline.audience;
  const acceptedSourceDigest =
    input.acceptedSourceDigest ??
    buildAcceptedSourceDigest(input.acceptedSources, { topic });

  const sourceMarkerMap = buildStableCitationMarkerMap(input.acceptedSources);
  const supportedClaims = buildSupportedClaimsFromEvidenceCards(input.evidenceCards, {
    markerMap: sourceMarkerMap,
  });

  return {
    project: input.project,
    topic,
    reportType,
    audience,
    acceptedSources: input.acceptedSources,
    evidenceCards: input.evidenceCards,
    outline: input.outline,
    acceptedSourceDigest,
    evidenceNumbers: new Map(input.evidenceCards.map((card, index) => [card.id, index + 1])),
    sourceMarkerMap,
    supportedClaims,
  };
}

export function selectEvidenceForSection(
  evidenceCards: EvidenceCard[],
  sectionId: string,
): EvidenceCard[] {
  const policy = getSectionEvidencePolicy(sectionId);
  const defaultLimit = sectionId === "literature_review" ? 8 : Math.max(4, policy.minEvidenceCards);
  return cardsFor(evidenceCards, SECTION_EVIDENCE_MAP[sectionId] ?? []).slice(0, defaultLimit);
}

export function buildSectionPlan(
  outlineSection: ReportOutlineSection,
  context: ReportSynthesisContext,
): SectionPlan {
  const selectedEvidence = selectEvidenceForSection(context.evidenceCards, outlineSection.sectionId);
  return {
    sectionId: outlineSection.sectionId,
    key: outlineSection.sectionId as ResearchSectionKey,
    title: outlineSection.title,
    intent: outlineSection.purpose,
    evidenceSections: SECTION_EVIDENCE_MAP[outlineSection.sectionId] ?? [],
    selectedEvidence,
    needsMoreEvidence:
      selectedEvidence.length === 0 &&
      !["title", "research_question", "references"].includes(outlineSection.sectionId),
  };
}

function buildSectionEvidenceMap(
  outlineSections: ReportOutlineSection[],
  context: ReportSynthesisContext,
): ReportDraftSectionEvidenceMapEntry[] {
  return outlineSections
    .filter((section) => !["title", "references"].includes(section.sectionId))
    .map((section) => {
      const plan = buildSectionPlan(section, context);
      const selectedClaims = selectSupportedClaimsForSection(
        context.supportedClaims,
        section.sectionId as ResearchSectionKey,
      );
      const evidenceCardIdsFromClaims = Array.from(
        new Set(selectedClaims.flatMap((claim) => claim.evidenceIds)),
      );
      const citationMarkers = Array.from(
        new Set(selectedClaims.flatMap((claim) => claim.citationMarkers)),
      );
      const citationIds = sourceIdsFromCitationMarkers(citationMarkers, context.sourceMarkerMap);
      const evidenceCardIds = evidenceCardIdsFromClaims.length > 0
        ? evidenceCardIdsFromClaims
        : plan.selectedEvidence.map((card) => card.id);
      const coverage = validateSectionEvidenceCoverage({
        sectionKey: section.sectionId as ResearchSectionKey,
        text: "",
        claims: selectedClaims,
        evidenceCardIds,
        citationMarkers,
      });
      return {
        sectionId: section.sectionId,
        title: sectionTitleFor(section.sectionId, section.title),
        purpose: section.purpose,
        evidenceCardIds,
        citationIds: citationIds.length > 0 ? citationIds : citationIdsForCards(plan.selectedEvidence),
        citationMarkers,
        coverageStatus: coverage.status,
        abstractOnlyCount: plan.selectedEvidence.filter(abstractOnly).length,
        missingEvidence: coverage.diagnostics.length > 0 || plan.needsMoreEvidence
          ? sectionGapSummary(
              [...coverage.diagnostics, ...context.acceptedSourceDigest.gaps],
              "本節尚缺直接對應的證據卡",
            )
          : [],
      };
    });
}

function buildParagraphPlans(
  sectionEvidenceMap: ReportDraftSectionEvidenceMapEntry[],
  context: ReportSynthesisContext,
): ReportParagraphPlan[] {
  return sectionEvidenceMap.map((entry) => {
    const cards = context.evidenceCards.filter((card) => entry.evidenceCardIds.includes(card.id));
    const claims = cards.length > 0
      ? evidenceHighlights(cards, context.sourceMarkerMap, 3)
      : [];
    const missingEvidence =
      cards.length > 0
        ? []
        : sectionGapSummary(context.acceptedSourceDigest.gaps, "尚缺本節可用證據");
    const limitationOrTransition = cards.length > 0
      ? evidenceLimitationSummary(cards)
      : `目前只能保留研究缺口：${proseList(missingEvidence, "尚缺對應證據")}。`;
    return {
      sectionId: entry.sectionId,
      paragraphPurpose: entry.purpose,
      topicSentence: sectionTopicSentence(entry.sectionId, context.topic, claims),
      claims,
      evidenceCardIds: entry.evidenceCardIds,
      citationIds: entry.citationIds,
      synthesisGoal: sectionSynthesisGoal(entry.sectionId),
      missingEvidence,
      limitationOrTransition,
    };
  });
}

function renderParagraphPlan(
  plan: ReportParagraphPlan,
  context: ReportSynthesisContext,
): string {
  const cards = context.evidenceCards.filter((card) => plan.evidenceCardIds.includes(card.id));
  const sourceSummary = evidenceTitleSummary(cards, context.sourceMarkerMap, 3);

  if (plan.sectionId === "research_question") {
    return sanitizeReportParagraph([
      plan.topicSentence,
      ...buildResearchQuestions(context.topic, plan.claims, context.acceptedSourceDigest.gaps),
      plan.claims.length > 0 ? `目前問題設定主要參考${sourceSummary}。` : "",
      plan.limitationOrTransition,
    ]
      .filter(Boolean)
      .join("\n"));
  }

  if (cards.length === 0) {
    return sanitizeReportParagraph([
      plan.topicSentence,
      `目前沒有可直接支撐本節的 evidence card，因此僅能標示資料缺口：${proseList(plan.missingEvidence, "尚缺直接證據")}。`,
      plan.limitationOrTransition,
    ]
      .filter(Boolean)
      .join(""));
  }

  const claimsSentence =
    plan.claims.length > 0
      ? `可整理出的重點包括：${plan.claims.join("；")}。`
      : "";
  const sourceSentence = sourceSummary
    ? `本段主要整合${sourceSummary}。`
    : "";

  switch (plan.sectionId) {
    case "abstract":
      return sanitizeReportParagraph([plan.topicSentence, claimsSentence, sourceSentence, plan.limitationOrTransition]
        .filter(Boolean)
        .join(""));
    case "introduction":
      return sanitizeReportParagraph([
        plan.topicSentence,
        claimsSentence,
        `綜合目前來源，研究背景可收斂到已被文獻提及的具體面向，而非只停留在原始題目。`,
        plan.limitationOrTransition,
      ]
        .filter(Boolean)
        .join(""));
    case "literature_review":
      return sanitizeReportParagraph([
        plan.topicSentence,
        claimsSentence,
        sourceSentence,
        `本節以交叉整理方式整合來源共識、差異與限制。`,
        plan.limitationOrTransition,
      ]
        .filter(Boolean)
        .join(""));
    case "methodology":
      return sanitizeReportParagraph([
        plan.topicSentence,
        `本報告整理 ${context.acceptedSources.length} 筆已接受來源與 ${context.evidenceCards.length} 張證據卡，並依章節用途分配可驗證片段。`,
        sourceSentence,
        plan.limitationOrTransition,
      ]
        .filter(Boolean)
        .join(""));
    case "findings":
      return sanitizeReportParagraph([plan.topicSentence, claimsSentence, sourceSentence, plan.limitationOrTransition]
        .filter(Boolean)
        .join(""));
    case "discussion":
      return sanitizeReportParagraph([
        plan.topicSentence,
        claimsSentence,
        `綜合判讀時，較合理的做法是把上述證據視為目前可支持的方向，並保留尚未被完全證實的部分。`,
        plan.limitationOrTransition,
      ]
        .filter(Boolean)
        .join(""));
    case "limitations":
      return sanitizeReportParagraph([
        plan.topicSentence,
        cards.some(abstractOnly)
          ? "目前部分來源仍屬摘要層級整理，若要形成更完整的理論推論，仍需補進可讀全文或更直接的實驗／教學資料。"
          : "雖然已有可用來源，但題目所需的理論、在地案例或統計資料可能仍未完全覆蓋。",
        plan.limitationOrTransition,
      ]
        .filter(Boolean)
        .join(""));
    case "conclusion":
      return sanitizeReportParagraph([
        plan.topicSentence,
        claimsSentence,
        `因此，現階段可先把已獲支持的部分整理成初步結論，並同步保留${proseList(context.acceptedSourceDigest.gaps.slice(0, 2), "剩餘資料缺口")}。`,
        plan.limitationOrTransition,
      ]
        .filter(Boolean)
        .join(""));
    default:
      return sanitizeReportParagraph([plan.topicSentence, claimsSentence, sourceSentence, plan.limitationOrTransition]
        .filter(Boolean)
        .join(""));
  }
}

export function buildReportDraft(input: ReportDraftInput): ReportDraft {
  const context = buildReportSynthesisContext(input);
  const bibliography = buildBibliography(context.acceptedSources, input.citationFormat || "APA");
  const references = bibliography.length ? bibliography.map((entry) => entry.text) : ["參考資料待補"];
  const outlineSections = context.outline.sections;
  const sectionEvidenceMap = buildSectionEvidenceMap(outlineSections, context);
  const paragraphPlans = buildParagraphPlans(sectionEvidenceMap, context);
  const planBySection = new Map(paragraphPlans.map((plan) => [plan.sectionId, plan]));
  const evidenceMapBySection = new Map(sectionEvidenceMap.map((entry) => [entry.sectionId, entry]));

  const sections: ReportDraftSection[] = outlineSections.map((outlineSection) => {
    if (outlineSection.sectionId === "references") {
      return {
        sectionId: "references",
        title: "參考資料",
        body: references.map((reference, index) => `${index + 1}. ${reference}`).join("\n"),
        synthesizedProseZhTw: references
          .map((reference, index) => `${index + 1}. ${reference}`)
          .join("\n"),
        sectionGoal: outlineSection.purpose,
        supportingSourceIds: context.acceptedSources.map((source) => source.id).filter(Boolean),
        citationMarkers: [],
        evidenceSummary: "參考資料依已接受來源產生。",
        evidenceGaps: [],
        writerNote: "僅列已接受來源，不使用 demo 或未審查來源。",
        evidenceCardIds: [],
        citationIds: context.acceptedSources.map((source) => source.id).filter(Boolean),
        evidenceCoverageStatus: "sufficient",
        citationCount: 0,
        evidenceCardCount: 0,
        warnings: [],
      };
    }

    if (outlineSection.sectionId === "title") {
      return {
        sectionId: "title",
        title: "標題",
        body: `《${context.topic}》${context.reportType}`,
        synthesizedProseZhTw: `《${context.topic}》${context.reportType}`,
        sectionGoal: outlineSection.purpose,
        supportingSourceIds: [],
        citationMarkers: [],
        evidenceSummary: "標題依目前研究主題建立。",
        evidenceGaps: [],
        writerNote: "保留主題本身，不延伸成模板句。",
        evidenceCardIds: [],
        citationIds: [],
        evidenceCoverageStatus: "sufficient",
        citationCount: 0,
        evidenceCardCount: 0,
        warnings: [],
      };
    }

    const plan = planBySection.get(outlineSection.sectionId);
    const evidenceEntry = evidenceMapBySection.get(outlineSection.sectionId);
    const selectedEvidence = context.evidenceCards.filter((card) =>
      (evidenceEntry?.evidenceCardIds ?? []).includes(card.id),
    );
    const warnings: string[] = [];
    if ((evidenceEntry?.missingEvidence.length ?? 0) > 0) {
      warnings.push("此段證據不足，已明確標示缺口。");
    }
    if (selectedEvidence.some(abstractOnly)) {
      warnings.push("本段部分依據僅來自摘要或書目片段。");
    }
    const sectionKey = outlineSection.sectionId as ResearchSectionKey;
    const synthesized = synthesizeSectionParagraph({
      sectionKey,
      topic: context.topic,
      claims: context.supportedClaims,
      acceptedSources: context.acceptedSources,
      evidenceCards: context.evidenceCards,
      markerMap: context.sourceMarkerMap,
    });
    warnings.push(...synthesized.warnings);
    const fallbackBody = plan ? renderParagraphPlan(plan, context) : `本節尚未完成：${outlineSection.purpose}`;
    const body = synthesized.body || fallbackBody;
    const acceptedMarkers = new Set(context.sourceMarkerMap.values());
    const actualMarkers = extractCitationMarkers(body).filter((marker) =>
      acceptedMarkers.has(marker),
    );
    const actualCitationIds = sourceIdsFromCitationMarkers(actualMarkers, context.sourceMarkerMap);
    const sectionEvidenceCardIds = synthesized.evidenceCardIds.length > 0
      ? synthesized.evidenceCardIds
      : evidenceEntry?.evidenceCardIds ?? [];
    const supportedSectionClaims = selectSupportedClaimsForSection(
      context.supportedClaims,
      sectionKey,
    );
    const sectionCoverage = validateSectionEvidenceCoverage({
      sectionKey,
      text: body,
      claims: supportedSectionClaims,
      evidenceCardIds: sectionEvidenceCardIds,
      citationMarkers: actualMarkers,
    });

    return {
      sectionId: outlineSection.sectionId,
      title: sectionTitleFor(outlineSection.sectionId, outlineSection.title),
      body,
      synthesizedProseZhTw: body,
      sectionGoal: outlineSection.purpose,
      supportingSourceIds: actualCitationIds,
      citationMarkers: actualMarkers,
      evidenceSummary:
        selectedEvidence.length > 0
          ? evidenceTitleSummary(selectedEvidence, context.sourceMarkerMap)
          : "目前尚未連結到對應 evidence card。",
      evidenceGaps: evidenceEntry?.missingEvidence ?? [],
      writerNote: plan?.synthesisGoal ?? outlineSection.purpose,
      evidenceCardIds: sectionEvidenceCardIds,
      citationIds: actualCitationIds,
      evidenceCoverageStatus: sectionCoverage.status,
      citationCount: sectionCoverage.citationCount,
      evidenceCardCount: sectionCoverage.evidenceCardCount,
      warnings,
    };
  });

  const qualityReport = buildQualityReport({
    topic: context.topic,
    depth: input.project.depth,
    acceptedSources: context.acceptedSources,
    evidenceCards: context.evidenceCards,
    sections: sections.map((section) => ({
      id: section.sectionId,
      key: section.sectionId as ResearchSectionKey,
      title: section.title,
      content: section.body,
      evidenceCardIds: section.evidenceCardIds,
      citationIds: section.citationIds,
      warnings: section.warnings,
    })),
  });

  const text = sections.map((section) => `${section.title}\n${section.body}`).join("\n\n");
  const debug: ReportDraftDebug = {
    acceptedSourcesCount: context.acceptedSources.length,
    evidenceCardsCount: context.evidenceCards.length,
    evidenceCardAbstractOnly: context.evidenceCards.map((card) => ({
      evidenceCardId: card.id,
      sourceId: card.sourceId,
      abstractOnly: abstractOnly(card),
    })),
    evidenceGaps: context.acceptedSourceDigest.gaps,
    sectionEvidenceMap,
    paragraphPlans,
    supportedClaims: context.supportedClaims,
    sectionCoverage: sections.map((section) =>
      validateSectionEvidenceCoverage({
        sectionKey: section.sectionId as ResearchSectionKey,
        text: section.body,
        claims: selectSupportedClaimsForSection(context.supportedClaims, section.sectionId as ResearchSectionKey),
        evidenceCardIds: section.evidenceCardIds,
        citationMarkers: section.citationMarkers,
      }),
    ),
    reportDraftGeneratedFromPlans: true,
  };

  return {
    reportId: input.project.id,
    workflowId: context.acceptedSources[0]?.workflowId ?? null,
    topicHash: context.acceptedSources[0]?.topicHash ?? null,
    title: `《${context.topic}》${context.reportType}草稿`,
    sections,
    referenceList: references,
    references,
    text,
    qualityReport,
    sectionEvidenceMap,
    paragraphPlans,
    debug,
  };
}
