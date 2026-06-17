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
import { sourceHasUsableAbstract } from "./sourceSummaries.ts";
import {
  buildQualityReport,
  type QualityReport,
  type ResearchProject,
  type ResearchSectionKey,
  type ResearchSectionSnapshot,
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
  return `（證據 ${evidenceNumbers.get(card.id) ?? "?"}）`;
}

function cardsFor(cards: EvidenceCard[], sections: WorkflowReportSection[]): EvidenceCard[] {
  const wanted = new Set(sections);
  return cards.filter((card) => card.usableSections.some((section) => wanted.has(section)));
}

function evidenceMarkers(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, limit = 3): string {
  return cards
    .slice(0, limit)
    .map((card) => marker(card, evidenceNumbers))
    .join("");
}

function hasUsableSources(sources: SourceRecord[]): boolean {
  return sources.some(sourceHasUsableAbstract);
}

function sourceQualityLimitNote(sources: SourceRecord[]): string {
  if (sources.length === 0) return "目前尚未接受來源，內容只能作為研究架構草稿。";
  if (!hasUsableSources(sources)) return "此段仍需補充原文細節，避免把摘要不足的來源當成完整證據；目前已接受來源缺少可用摘要，草稿不可視為正式完整報告。";
  if (sources.some((source) => !sourceHasUsableAbstract(source))) {
    return "此段仍需補充原文細節，避免把摘要不足的來源當成完整證據。";
  }
  return "";
}

function conciseEvidenceThemes(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, limit = 3): string {
  if (cards.length === 0) return "目前沒有足夠證據可直接支撐此段。";
  const labels = cards.slice(0, limit).map((card) => {
    const title = card.sourceTitle.trim() || "已接受來源";
    return `${title}${marker(card, evidenceNumbers)}`;
  });
  return `可引用的佐證池包括：${labels.join("、")}。`;
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
  const { topic, reportType, audience, acceptedSourceDigest, acceptedSources, evidenceNumbers } = context;
  const evidenceText = conciseEvidenceThemes(plan.selectedEvidence, evidenceNumbers);
  const qualityNote = sourceQualityLimitNote(acceptedSources);
  const gaps = acceptedSourceDigest.gaps.length
    ? `目前資料缺口包括：${acceptedSourceDigest.gaps.join("、")}。`
    : "";

  switch (plan.sectionId) {
    case "title":
      return `《${topic}》${reportType}`;
    case "abstract":
      return [
        acceptedSourceDigest.summary,
        `本草稿以「${topic}」為核心，面向${audience}整理資料基礎、可支撐方向與限制。`,
        `摘要先交代研究範圍與資料狀態，不逐篇排列來源；後續正文再依章節任務選用佐證。`,
        qualityNote,
      ].filter(Boolean).join("");
    case "introduction":
      return [
        `研究「${topic}」的動機，在於釐清此主題的背景、重要性與可討論範圍，而不是把來源卡句子直接改寫成動機。`,
        plan.selectedEvidence.length
          ? `目前可先用背景資料說明主題為何值得研究，並把討論範圍限縮在已接受資料可支撐的部分。${evidenceText}`
          : "目前研究背景證據仍不足，建議補充官方資料或學術文獻後再強化動機段。",
      ].join("");
    case "research_question":
      return [`本報告初步聚焦三個可蒐證問題：`, questionSet(topic, acceptedSourceDigest)].join("\n");
    case "literature_review":
      return plan.selectedEvidence.length
        ? [
          "文獻探討應比較既有資料的共同方向、差異與限制，而不是逐篇摘要來源。",
          `目前可先依核心概念、影響面向與資料限制整理既有觀點。${evidenceText}`,
        ].join("")
        : "目前文獻探討證據不足，建議先補充學術論文、期刊或可信機構資料。";
    case "methodology":
      return [
        "本報告採用文獻整理與來源審查法：先搜尋資料，再依主題相關性、權威性、摘要可用性與使用章節進行篩選。",
        "撰寫時只將已接受來源作為佐證池，不假裝進行未實施的實驗、問卷或訪談。",
        plan.selectedEvidence.length ? evidenceText : "方法段可再補充搜尋條件、排除條件與資料整理步驟。",
      ].join("");
    case "findings":
      return [
        "主要發現應依研究問題與證據面向組織，而不是依來源 1、來源 2 的順序排列。",
        evidenceByAspect(context.evidenceCards, evidenceNumbers),
      ].join("\n");
    case "discussion":
      return [
        "討論段應把資料基礎、可支持方向與缺口連接起來，避免超出已接受來源的證據範圍。",
        plan.selectedEvidence.length
          ? `目前可先討論資料之間的共同指向，以及哪些推論仍需補強。${evidenceText}`
          : "目前尚缺足夠證據，因此討論需維持保守，避免形成正式結論語氣。",
        gaps,
      ].filter(Boolean).join("");
    case "limitations":
      return [
        "限制段需直接說明目前證據不足之處，例如摘要不足、來源數量有限、或缺少全文確認。",
        gaps || "目前限制仍以來源數量與摘要可用性為主。",
      ].join("");
    case "conclusion":
      return [
        `根據目前證據，「${topic}」可先形成一份可追溯來源的初稿，但結論只能限於資料已支撐的範圍。`,
        plan.selectedEvidence.length
          ? `後續建議應回到研究問題與資料缺口逐步補強。${evidenceText}`
          : "結論段仍需更多高相關來源支撐，現階段不宜寫成正式完整報告。",
        acceptedSourceDigest.recommendedNextStep,
      ].join("");
    default:
      return plan.intent;
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
        evidenceCardIds: [],
        citationIds: context.acceptedSources.map((source) => source.id).filter(Boolean),
        warnings: [],
      };
    }

    const plan = buildSectionPlan(outlineSection, context);
    const body = synthesizeSectionParagraph(plan, context);
    const warnings: string[] = [];
    if (plan.needsMoreEvidence) {
      warnings.push("證據不足，請改寫成初步草稿語氣。");
    }
    if (!plan.selectedEvidence.length && !["title", "research_question"].includes(plan.sectionId)) {
      warnings.push("目前此段缺少 evidence card。");
    }

    return {
      sectionId: outlineSection.sectionId,
      title: sectionTitleFor(outlineSection.sectionId, outlineSection.title),
      body,
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
