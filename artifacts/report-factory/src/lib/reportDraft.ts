import type { EvidenceCard } from "./evidenceCards.ts";
import type { ReportOutline } from "./reportOutline.ts";
import { buildBibliography, type SourceRecord, type WorkflowReportSection } from "./sourceRecords.ts";

export interface ReportDraftInput {
  topic: string;
  reportType: string;
  audience: string;
  evidenceCards: EvidenceCard[];
  outline: ReportOutline;
  acceptedSources: SourceRecord[];
  citationFormat?: string;
}

export interface ReportDraftSection {
  sectionId: string;
  title: string;
  body: string;
}

export interface ReportDraft {
  title: string;
  sections: ReportDraftSection[];
  referenceList: string[];
  text: string;
}

function marker(card: EvidenceCard, evidenceNumbers: Map<string, number>): string {
  return `（來源 ${evidenceNumbers.get(card.id) ?? "?"}）`;
}

function cardsFor(cards: EvidenceCard[], section: WorkflowReportSection): EvidenceCard[] {
  return cards.filter((card) => card.usableSections.includes(section));
}

function sentenceFromCards(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, fallback: string): string {
  if (cards.length === 0) return fallback;
  return cards
    .slice(0, 3)
    .map((card) => `${card.claim}${marker(card, evidenceNumbers)}`)
    .join("；");
}

function evidenceList(cards: EvidenceCard[], evidenceNumbers: Map<string, number>): string {
  if (cards.length === 0) return "目前尚無可整理的證據卡。";
  return cards
    .map((card) => `${marker(card, evidenceNumbers)} ${card.claim}：${card.evidence}`)
    .join("\n");
}

export function buildReportDraft(input: ReportDraftInput): ReportDraft {
  const topic = input.topic.trim() || input.outline.topic;
  const reportType = input.reportType.trim() || input.outline.reportType;
  const audience = input.audience.trim() || input.outline.audience;
  const evidenceNumbers = new Map(input.evidenceCards.map((card, index) => [card.id, index + 1]));
  const backgroundCards = cardsFor(input.evidenceCards, "研究背景");
  const literatureCards = cardsFor(input.evidenceCards, "文獻探討");
  const methodCards = cardsFor(input.evidenceCards, "研究方法");
  const dataCards = cardsFor(input.evidenceCards, "數據分析");
  const conclusionCards = cardsFor(input.evidenceCards, "結論");
  const bibliography = buildBibliography(input.acceptedSources, input.citationFormat || "APA");
  const references = bibliography.length ? bibliography.map((entry) => entry.text) : ["參考資料待補"];

  const sections: ReportDraftSection[] = [
    {
      sectionId: "title",
      title: "標題",
      body: `《${topic}》${reportType}`,
    },
    {
      sectionId: "abstract",
      title: "摘要",
      body: `本報告以「${topic}」為核心，面向${audience}整理已接受來源與證據卡。${sentenceFromCards(
        [...backgroundCards, ...literatureCards, ...dataCards],
        evidenceNumbers,
        "目前證據仍不足，摘要僅能先說明研究方向。",
      )}後續仍需依老師或研究要求補齊細節。`,
    },
    {
      sectionId: "motivation",
      title: "研究動機",
      body: `研究「${topic}」的動機，在於釐清此主題的背景、重要性與可討論面向。${sentenceFromCards(
        backgroundCards,
        evidenceNumbers,
        "目前研究背景證據仍不足，建議補充官方資料或學術文獻。",
      )}`,
    },
    {
      sectionId: "questions",
      title: "研究問題",
      body: [
        `本報告初步聚焦三個問題：`,
        `1. 「${topic}」的背景與核心概念為何？`,
        `2. 既有資料如何說明「${topic}」的重要面向？`,
        `3. 根據目前證據，可以提出哪些結論與建議？`,
      ].join("\n"),
    },
    {
      sectionId: "literature",
      title: "文獻探討",
      body: sentenceFromCards(
        literatureCards,
        evidenceNumbers,
        "目前文獻探討證據不足，建議先補充學術論文、期刊或可信機構資料。",
      ),
    },
    {
      sectionId: "method",
      title: "研究方法",
      body: `本報告採用文獻整理與證據卡歸納法：先搜尋來源、人工接受可信資料，再把每筆已接受來源整理為可檢查的證據卡。${sentenceFromCards(
        methodCards,
        evidenceNumbers,
        "研究方法可再補充來源篩選標準、排除條件與分析步驟。",
      )}`,
    },
    {
      sectionId: "evidence",
      title: "資料與證據整理",
      body: evidenceList(input.evidenceCards, evidenceNumbers),
    },
    {
      sectionId: "discussion",
      title: "討論",
      body: `綜合目前資料，討論時應優先連結背景、文獻與數據證據，並標示仍待補強之處。${sentenceFromCards(
        dataCards.length ? dataCards : literatureCards,
        evidenceNumbers,
        "目前尚缺足夠數據分析證據，因此討論需避免過度推論。",
      )}`,
    },
    {
      sectionId: "conclusion",
      title: "結論與建議",
      body: `根據目前證據，「${topic}」可先形成一份可追溯來源的初稿。${sentenceFromCards(
        conclusionCards,
        evidenceNumbers,
        "結論段仍需更多證據支撐，建議補齊可直接回應研究問題的來源。",
      )}`,
    },
    {
      sectionId: "references",
      title: "參考資料",
      body: references.map((reference, index) => `${index + 1}. ${reference}`).join("\n"),
    },
  ];

  const text = sections.map((section) => `${section.title}\n${section.body}`).join("\n\n");

  return {
    title: `《${topic}》${reportType}草稿`,
    sections,
    referenceList: references,
    text,
  };
}
