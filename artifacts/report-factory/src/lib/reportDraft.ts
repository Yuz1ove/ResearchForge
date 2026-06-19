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
  buildAcceptedSourceSynthesis,
  type AcceptedSourceSynthesis,
} from "./acceptedSourceSynthesis.ts";
import { sourceHasUsableAbstract } from "./sourceSummaries.ts";
import {
  buildQualityReport,
  type QualityReport,
  type ResearchProject,
  type ResearchSectionKey,
} from "./qualityJudge.ts";

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

export interface ReportDraftSection {
  sectionId: string;
  title: string;
  body: string;
  sectionGoal: string;
  supportingSourceIds: string[];
  citationMarkers: string[];
  evidenceSummary: string;
  evidenceGaps: string[];
  writerNote: string;
  evidenceCardIds: string[];
  citationIds: string[];
  warnings: string[];
}

export interface ReportDraft {
  title: string;
  sections: ReportDraftSection[];
  referenceList: string[];
  text: string;
  qualityReport: QualityReport;
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
  acceptedSourceSynthesis: AcceptedSourceSynthesis;
  evidenceNumbers: Map<string, number>;
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

function marker(card: EvidenceCard, evidenceNumbers: Map<string, number>): string {
  return `（來源 ${evidenceNumbers.get(card.id) ?? "?"}）`;
}

function cardsFor(cards: EvidenceCard[], sections: WorkflowReportSection[]): EvidenceCard[] {
  const wanted = new Set(sections);
  return cards.filter((card) => card.usableSections.some((section) => wanted.has(section)));
}

function hasUsableSources(sources: SourceRecord[]): boolean {
  return sources.some(sourceHasUsableAbstract);
}

function sourceQualityLimitNote(sources: SourceRecord[]): string {
  if (sources.length === 0) return "目前尚未接受來源，報告僅能說明研究範圍與資料缺口。";
  if (!hasUsableSources(sources)) return "目前已接受來源的摘要仍不足，本文僅能提出初步背景與缺口判斷。";
  if (sources.some((source) => !sourceHasUsableAbstract(source))) {
    return "部分來源只有有限摘要，因此相關段落僅呈現已能驗證的背景與初步觀點。";
  }
  return "";
}

function conciseEvidenceThemes(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, limit = 3): string {
  if (cards.length === 0) return "目前沒有足夠證據可直接支撐此段。";
  const labels = cards.slice(0, limit).map((card) => {
    const title = card.sourceTitle.trim() || "已接受來源";
    return `${title}${marker(card, evidenceNumbers)}`;
  });
  return `目前可用的證據主要來自${labels.join("、")}。`;
}

function questionSet(topic: string, digest: AcceptedSourceDigest): string {
  const coverage = digest.coverage.slice(0, 3);
  const coverageText = coverage.length ? coverage.join("、") : "背景、文獻與資料缺口";
  return [
    `1. 「${topic}」的核心概念、背景與研究範圍為何？`,
    `2. 現有資料在${coverageText}上能支持哪些初步判斷？`,
    `3. 依目前資料缺口，哪些結論仍需要補充來源後才能成立？`,
  ].join("\n");
}

function sectionMarkers(cards: EvidenceCard[], evidenceNumbers: Map<string, number>): string[] {
  return cards.slice(0, 3).map((card) => marker(card, evidenceNumbers));
}

function formalEvidenceGapMessage(
  plan: SectionPlan,
  context: ReportSynthesisContext,
): string {
  if (plan.selectedEvidence.length > 0) return "";
  if (context.acceptedSources.length === 0) {
    return "目前尚未建立可驗證的來源基礎，因此本段以研究背景與資料缺口說明為主。";
  }
  return "目前已接受來源可支撐本段的背景與初步觀點，但對於在地案例、第一手統計或具體比較資料仍不足。因此，本報告以文獻整理與來源審查作為基礎，並將未被資料直接支持的結論保留為研究缺口。";
}

function combineParagraphs(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join("");
}

function sourceRefText(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, limit = 3): string {
  const markers = sectionMarkers(cards, evidenceNumbers).slice(0, limit);
  return markers.length ? markers.join("") : "";
}

function sourceTitleSummary(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, limit = 3): string {
  if (cards.length === 0) return "";
  return cards
    .slice(0, limit)
    .map((card) => `${card.sourceTitle.trim() || "已接受來源"}${marker(card, evidenceNumbers)}`)
    .join("、");
}

function firstEvidencePoints(cards: EvidenceCard[], limit = 3): string[] {
  return cards
    .slice(0, limit)
    .map((card) => card.summary || card.evidence || card.quoteOrParaphrase || card.sourceTitle)
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function proseList(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]}與${items[1]}`;
  return `${items.slice(0, -1).join("、")}與${items[items.length - 1]}`;
}

function synthesisEvidencePoints(
  synthesis: AcceptedSourceSynthesis,
  keys: Array<keyof AcceptedSourceSynthesis["evidenceByFacet"]>,
  limit = 3,
): string[] {
  return keys.flatMap((key) => synthesis.evidenceByFacet[key]).slice(0, limit);
}

function evidenceAspectLabel(section: WorkflowReportSection): string {
  switch (section) {
    case "研究背景":
      return "背景與概念脈絡";
    case "文獻探討":
      return "既有研究觀點";
    case "研究方法":
      return "資料取得與整理方式";
    case "數據分析":
      return "資料與證據面向";
    case "結論":
      return "結論可支持範圍";
  }
}

function evidenceByAspect(cards: EvidenceCard[], evidenceNumbers: Map<string, number>): string {
  const sections: WorkflowReportSection[] = ["研究背景", "文獻探討", "研究方法", "數據分析", "結論"];
  const lines = sections.flatMap((section) => {
    const sectionCards = cardsFor(cards, [section]);
    if (sectionCards.length === 0) return [];
    return `${evidenceAspectLabel(section)}：${conciseEvidenceThemes(sectionCards, evidenceNumbers, 2)}`;
  });

  return lines.length
    ? lines.join("\n")
    : "目前已接受來源尚未標記可用章節，建議回到來源審查補齊章節用途。";
}

export function buildReportSynthesisContext(input: ReportDraftInput): ReportSynthesisContext {
  const topic = input.topic.trim() || input.outline.topic;
  const reportType = input.reportType.trim() || input.outline.reportType;
  const audience = input.audience.trim() || input.outline.audience;
  const acceptedSourceDigest =
    input.acceptedSourceDigest ??
    buildAcceptedSourceDigest(input.acceptedSources, { topic });

  return {
    project: input.project,
    topic,
    reportType,
    audience,
    acceptedSources: input.acceptedSources,
    evidenceCards: input.evidenceCards,
    outline: input.outline,
    acceptedSourceDigest,
    acceptedSourceSynthesis: buildAcceptedSourceSynthesis(input.acceptedSources),
    evidenceNumbers: new Map(input.evidenceCards.map((card, index) => [card.id, index + 1])),
  };
}

export function selectEvidenceForSection(
  evidenceCards: EvidenceCard[],
  sectionId: string,
): EvidenceCard[] {
  return cardsFor(evidenceCards, SECTION_EVIDENCE_MAP[sectionId] ?? []).slice(0, 4);
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
    needsMoreEvidence: selectedEvidence.length === 0 && !["title", "research_question", "references"].includes(outlineSection.sectionId),
  };
}

function synthesizeSectionParagraph(plan: SectionPlan, context: ReportSynthesisContext): string {
  const {
    topic,
    reportType,
    audience,
    acceptedSourceDigest,
    acceptedSources,
    acceptedSourceSynthesis,
    evidenceNumbers,
  } = context;
  const evidenceText = conciseEvidenceThemes(plan.selectedEvidence, evidenceNumbers);
  const qualityNote = sourceQualityLimitNote(acceptedSources);
  const gaps = acceptedSourceDigest.gaps.length
    ? `目前資料缺口包括：${acceptedSourceDigest.gaps.join("、")}。`
    : "";
  const gapMessage = formalEvidenceGapMessage(plan, context);
  const refs = sourceRefText(plan.selectedEvidence, evidenceNumbers);
  const sourceSummary = sourceTitleSummary(plan.selectedEvidence, evidenceNumbers);
  const evidencePoints = firstEvidencePoints(plan.selectedEvidence);
  const synthesisPoints = synthesisEvidencePoints(
    acceptedSourceSynthesis,
    ["causes", "currentStatus", "dataBackground", "impacts", "policy"],
  );
  const limitations = proseList(
    acceptedSourceSynthesis.limitationsZhTw.slice(0, 2),
    gaps || "目前主要限制來自已接受來源數量與摘要完整度。",
  );

  switch (plan.sectionId) {
    case "title":
      return `《${topic}》${reportType}`;
    case "abstract":
      return combineParagraphs([
        acceptedSourceDigest.summary,
        `本報告以「${topic}」為核心，面向${audience}整理已接受來源所能支持的背景、證據面向與限制。`,
        sourceSummary ? `目前引用基礎包含${sourceSummary}。` : "目前引用基礎仍需補強。",
        qualityNote,
      ]);
    case "introduction":
      return combineParagraphs([
        `研究「${topic}」的動機，在於釐清此主題的背景、重要性與可被資料支持的討論範圍。`,
        plan.selectedEvidence.length
          ? `已接受來源提供了初步背景與脈絡，使本報告可以把討論限縮在可追溯的資料範圍內。${evidenceText}`
          : `目前研究背景仍缺少可直接引用的來源，因此本段先界定可查證範圍與資料缺口。`,
        gapMessage,
      ]);
    case "research_question":
      return [`本報告初步聚焦三個可蒐證問題：`, questionSet(topic, acceptedSourceDigest)].join("\n");
    case "literature_review":
      return plan.selectedEvidence.length
        ? combineParagraphs([
          `目前文獻基礎顯示，「${topic}」可先依共同概念、資料面向與限制進行整合。`,
          evidencePoints.length
            ? `可用證據指出${proseList(evidencePoints, "目前資料仍有限")}。`
            : evidenceText,
          acceptedSourceSynthesis.consensusPointsZhTw.length
            ? `跨來源共識包括：${acceptedSourceSynthesis.consensusPointsZhTw.join(" ")}`
            : "不同來源目前尚未形成明確共識，因此文獻探討需保持初步與保守。",
          refs,
        ])
        : combineParagraphs([
          `目前文獻探討證據不足，本文先描述「${topic}」的研究缺口。`,
          gaps || "目前仍缺少可直接支持文獻比較的學術論文、期刊或可信機構資料。",
        ]);
    case "methodology":
      return combineParagraphs([
        "本報告採用文獻整理與來源審查法：先搜尋資料，再依主題相關性、權威性、摘要可用性與使用章節進行篩選。",
        "所有正文推論均限於已接受來源與證據卡可支持的範圍，不假裝進行未實施的實驗、問卷或訪談。",
        plan.selectedEvidence.length
          ? `方法資料基礎主要來自來源審查後保留的證據池。${evidenceText}`
          : "目前方法描述以來源審查流程為主，搜尋條件與排除條件仍是本報告的資料限制。",
      ]);
    case "findings":
      return [
        `目前主要發現以「${topic}」的研究問題與證據面向組織。`,
        synthesisPoints.length
          ? `綜合已接受來源，初步可整理出以下重點：${synthesisPoints.join(" ")}`
          : "目前已接受來源尚未提供足夠片段形成穩定發現，因此本節以可確認的資料面向與缺口為主。",
        evidenceByAspect(context.evidenceCards, evidenceNumbers),
      ].join("\n");
    case "discussion":
      return combineParagraphs([
        `討論「${topic}」時，需要把資料基礎、可支持方向與缺口放在一起判讀。`,
        plan.selectedEvidence.length
          ? `目前資料之間的共同指向可以作為初步推論，但仍不宜超出來源摘要與證據片段。${evidenceText}`
          : "目前尚缺足夠證據，因此討論限於資料基礎、可支持範圍與缺口判讀。",
        gaps,
      ]);
    case "limitations":
      return combineParagraphs([
        `本報告目前的限制主要來自來源數量、摘要完整度與全文確認程度。`,
        limitations,
        qualityNote,
      ]);
    case "conclusion":
      return combineParagraphs([
        `根據目前證據，「${topic}」可先形成一份可追溯來源的初稿，但結論只能限於資料已支撐的範圍。`,
        plan.selectedEvidence.length
          ? `目前較穩定的結論，是本題可沿著已接受來源所涵蓋的背景、證據面向與限制繼續深化。${evidenceText}`
          : "結論段仍需更多高相關來源支撐，現階段僅能確認研究缺口與初步資料範圍。",
        acceptedSourceDigest.recommendedNextStep,
      ]);
    default:
      return `本節聚焦「${topic}」的${plan.title}，目前內容需依已接受來源逐步補強。`;
  }
}

function sectionTitleFor(sectionId: string, title: string): string {
  return sectionId === "title" ? "標題" : title.replace(/^[一二三四五六七八九十]+、/, "");
}

function citationIdsForCards(cards: EvidenceCard[]): string[] {
  return cards.map((card) => card.sourceId);
}

export function buildReportDraft(input: ReportDraftInput): ReportDraft {
  const context = buildReportSynthesisContext(input);
  const bibliography = buildBibliography(context.acceptedSources, input.citationFormat || "APA");
  const references = bibliography.length ? bibliography.map((entry) => entry.text) : ["參考資料待補"];
  const outlineSections = context.outline.sections;

  const sections: ReportDraftSection[] = outlineSections.map((outlineSection) => {
    if (outlineSection.sectionId === "references") {
      return {
        sectionId: "references",
        title: "參考資料",
        body: references.map((reference, index) => `${index + 1}. ${reference}`).join("\n"),
        sectionGoal: outlineSection.purpose,
        supportingSourceIds: context.acceptedSources.map((source) => source.id).filter(Boolean),
        citationMarkers: [],
        evidenceSummary: "參考資料依已接受來源產生。",
        evidenceGaps: [],
        writerNote: "僅列已接受來源，不使用 demo 或未審查來源。",
        evidenceCardIds: [],
        citationIds: context.acceptedSources.map((source) => source.id).filter(Boolean),
        warnings: [],
      };
    }

    const plan = buildSectionPlan(outlineSection, context);
    const body = synthesizeSectionParagraph(plan, context);
    const warnings: string[] = [];
    if (plan.needsMoreEvidence) {
      warnings.push("此段證據不足，內容維持初步草稿。");
    }
    if (!plan.selectedEvidence.length && !["title", "research_question"].includes(plan.sectionId)) {
      warnings.push("此段尚未連結 evidence card。");
    }

    return {
      sectionId: outlineSection.sectionId,
      title: sectionTitleFor(outlineSection.sectionId, outlineSection.title),
      body,
      sectionGoal: outlineSection.purpose,
      supportingSourceIds: citationIdsForCards(plan.selectedEvidence),
      citationMarkers: sectionMarkers(plan.selectedEvidence, context.evidenceNumbers),
      evidenceSummary: conciseEvidenceThemes(plan.selectedEvidence, context.evidenceNumbers),
      evidenceGaps: plan.needsMoreEvidence
        ? context.acceptedSourceDigest.gaps
        : [],
      writerNote: plan.intent,
      evidenceCardIds: plan.selectedEvidence.map((card) => card.id),
      citationIds: citationIdsForCards(plan.selectedEvidence),
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

  return {
    title: `《${context.topic}》${context.reportType}草稿`,
    sections,
    referenceList: references,
    text,
    qualityReport,
  };
}
