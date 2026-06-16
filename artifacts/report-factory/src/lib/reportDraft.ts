import type { EvidenceCard } from "./evidenceCards.ts";
import type { ReportOutline } from "./reportOutline.ts";
import { buildBibliography, type SourceRecord, type WorkflowReportSection } from "./sourceRecords.ts";
import { buildAcceptedSourceDigest, type AcceptedSourceDigest } from "./sourceDigest.ts";
import { sourceHasUsableAbstract } from "./sourceSummaries.ts";

export interface ReportDraftInput {
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

function markersFromCards(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, limit = 3): string {
  return cards
    .slice(0, limit)
    .map((card) => marker(card, evidenceNumbers))
    .join("");
}

function supportedParagraph(cards: EvidenceCard[], evidenceNumbers: Map<string, number>, sentence: string, fallback: string): string {
  if (cards.length === 0) return fallback;
  return `${sentence}${markersFromCards(cards, evidenceNumbers)}`;
}

function sourceTitles(cards: EvidenceCard[], limit = 3): string {
  const titles = cards
    .map((card) => card.sourceTitle.trim())
    .filter(Boolean)
    .slice(0, limit);
  if (titles.length === 0) return "已接受來源";
  if (titles.length === 1) return `「${titles[0]}」`;
  return titles.map((title) => `「${title}」`).join("、");
}

function groupedEvidenceSummary(cards: EvidenceCard[], evidenceNumbers: Map<string, number>): string {
  if (cards.length === 0) return "目前尚無可整理的證據卡。";

  const sections: WorkflowReportSection[] = ["研究背景", "文獻探討", "研究方法", "數據分析", "結論"];
  const lines = sections.flatMap((section) => {
    const sectionCards = cardsFor(cards, section);
    if (sectionCards.length === 0) return [];
    return `${section}：可先使用${sourceTitles(sectionCards)}作為段落佐證，撰寫時需依研究問題整合內容${markersFromCards(sectionCards, evidenceNumbers, 2)}`;
  });

  return lines.length ? lines.join("\n") : "目前已接受來源尚未標記可用章節，建議回到來源審查補齊章節用途。";
}

function needsOriginalDetailNote(sources: SourceRecord[]): boolean {
  return sources.some((source) => !sourceHasUsableAbstract(source));
}

function originalDetailNote(sources: SourceRecord[]): string {
  return needsOriginalDetailNote(sources) ? "此段仍需補充原文細節，避免把摘要不足的來源當成完整證據。" : "";
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
  const acceptedSourceDigest =
    input.acceptedSourceDigest ??
    buildAcceptedSourceDigest(input.acceptedSources, { topic });
  const detailNote = originalDetailNote(input.acceptedSources);

  const sections: ReportDraftSection[] = [
    {
      sectionId: "title",
      title: "標題",
      body: `《${topic}》${reportType}`,
    },
    {
      sectionId: "abstract",
      title: "摘要",
      body: [
        acceptedSourceDigest.summary,
        `本報告以「${topic}」為核心，面向${audience}先整理研究背景、文獻脈絡與可用資料，再依資料缺口修正草稿深度。`,
        markersFromCards([...backgroundCards, ...literatureCards, ...dataCards], evidenceNumbers, 3) || "目前證據仍不足，摘要僅能先說明研究方向。",
        detailNote,
      ].filter(Boolean).join(""),
    },
    {
      sectionId: "motivation",
      title: "研究動機",
      body: `研究「${topic}」的動機，在於釐清此主題的背景、重要性與可討論面向。${supportedParagraph(
        backgroundCards,
        evidenceNumbers,
        "目前已接受資料可先協助建立基本背景，但仍需要在正文中補上更具體的脈絡與定義。",
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
      body: supportedParagraph(
        literatureCards,
        evidenceNumbers,
        "文獻探討應依研究問題分類整理既有觀點，先比較資料對主題的共同指向與限制，而不是逐篇摘要來源。",
        "目前文獻探討證據不足，建議先補充學術論文、期刊或可信機構資料。",
      ),
    },
    {
      sectionId: "method",
      title: "研究方法",
      body: `本報告採用文獻整理與資料基礎摘要法：先搜尋來源，人工接受可信資料，再依研究背景、文獻探討、方法、數據與結論用途整理證據。${supportedParagraph(
        methodCards,
        evidenceNumbers,
        "若來源提供方法資訊，正文可補充篩選標準、樣本或資料取得方式。",
        "研究方法可再補充來源篩選標準、排除條件與分析步驟。",
      )}`,
    },
    {
      sectionId: "evidence",
      title: "資料與證據整理",
      body: groupedEvidenceSummary(input.evidenceCards, evidenceNumbers),
    },
    {
      sectionId: "discussion",
      title: "討論",
      body: `綜合目前資料，討論時應優先連結背景、文獻與數據證據，並標示仍待補強之處。${supportedParagraph(
        dataCards.length ? dataCards : literatureCards,
        evidenceNumbers,
        "目前資料可提供初步討論基礎，但仍要把推論限制與資料缺口寫清楚。",
        "目前尚缺足夠數據分析證據，因此討論需避免過度推論。",
      )}${acceptedSourceDigest.gaps.length ? `資料缺口包括：${acceptedSourceDigest.gaps.join("、")}。` : ""}`,
    },
    {
      sectionId: "conclusion",
      title: "結論與建議",
      body: `根據目前證據，「${topic}」可先形成一份可追溯來源的初稿。${supportedParagraph(
        conclusionCards,
        evidenceNumbers,
        "結論應回應研究問題，並把建議限定在已接受資料能支撐的範圍內。",
        "結論段仍需更多證據支撐，建議補齊可直接回應研究問題的來源。",
      )}${acceptedSourceDigest.recommendedNextStep}`,
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
