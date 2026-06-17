import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceCard } from "./evidenceCards.ts";
import { buildQualityReport, type ResearchSectionSnapshot } from "./qualityJudge.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(index: number): SourceRecord {
  return {
    id: `source-${index}`,
    title: `Source ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "Useful abstract with enough detail for research drafting.",
    doi: `10.1000/source-${index}`,
    url: `https://example.edu/source-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
  };
}

function card(index: number): EvidenceCard {
  return {
    id: `evidence-${index}`,
    sourceId: `source-${index}`,
    claim: "Evidence claim",
    evidence: "Evidence text",
    quoteOrParaphrase: "Evidence text",
    summary: "Evidence summary",
    relevance: "研究背景",
    sourceTitle: `Source ${index}`,
    sourceUrl: `https://example.edu/source-${index}`,
    sourceDomain: "example.edu",
    sourceProvider: "Crossref",
    sourceCategory: "journal_article",
    year: 2024,
    usableSections: ["研究背景", "文獻探討"],
    confidence: "高",
    confidenceScore: 0.7,
    derivation: "abstract-derived",
    limitation: "No full text yet",
    citationText: "Lovelace（2024）",
    pageOrLocation: "abstract",
    createdAt: "2026-06-18T00:00:00.000Z",
    notes: "",
  };
}

function sections(cards: EvidenceCard[]): ResearchSectionSnapshot[] {
  const sourceIds = cards.map((item) => item.sourceId);
  const evidenceIds = cards.map((item) => item.id);
  return [
    { id: "title", key: "title", title: "標題", content: "短影音使用對高中生睡眠品質之影響", evidenceCardIds: [], citationIds: [], warnings: [] },
    { id: "abstract", key: "abstract", title: "摘要", content: "短影音使用對高中生睡眠品質之影響是本文主題。", evidenceCardIds: evidenceIds.slice(0, 2), citationIds: sourceIds.slice(0, 2), warnings: [] },
    { id: "introduction", key: "introduction", title: "研究背景與動機", content: "短影音使用對高中生睡眠品質之影響需要先整理背景。", evidenceCardIds: evidenceIds.slice(0, 2), citationIds: sourceIds.slice(0, 2), warnings: [] },
    { id: "research_question", key: "research_question", title: "研究問題", content: "短影音使用對高中生睡眠品質之影響有哪些可研究問題？", evidenceCardIds: evidenceIds.slice(0, 1), citationIds: sourceIds.slice(0, 1), warnings: [] },
    { id: "literature_review", key: "literature_review", title: "文獻探討", content: "短影音使用對高中生睡眠品質之影響需整理文獻。", evidenceCardIds: evidenceIds.slice(0, 3), citationIds: sourceIds.slice(0, 3), warnings: [] },
    { id: "methodology", key: "methodology", title: "研究方法", content: "短影音使用對高中生睡眠品質之影響採文獻整理法。", evidenceCardIds: evidenceIds.slice(0, 1), citationIds: sourceIds.slice(0, 1), warnings: [] },
    { id: "findings", key: "findings", title: "主要發現", content: "短影音使用對高中生睡眠品質之影響可能相關。", evidenceCardIds: evidenceIds.slice(0, 4), citationIds: sourceIds.slice(0, 4), warnings: [] },
    { id: "discussion", key: "discussion", title: "討論", content: "短影音使用對高中生睡眠品質之影響仍需補充資料。", evidenceCardIds: evidenceIds.slice(0, 4), citationIds: sourceIds.slice(0, 4), warnings: [] },
    { id: "limitations", key: "limitations", title: "限制", content: "短影音使用對高中生睡眠品質之影響仍受來源數與摘要限制。", evidenceCardIds: evidenceIds.slice(0, 1), citationIds: sourceIds.slice(0, 1), warnings: [] },
    { id: "conclusion", key: "conclusion", title: "結論", content: "短影音使用對高中生睡眠品質之影響可形成初步結論。", evidenceCardIds: evidenceIds.slice(0, 2), citationIds: sourceIds.slice(0, 2), warnings: [] },
    { id: "references", key: "references", title: "參考資料", content: "References", evidenceCardIds: [], citationIds: sourceIds, warnings: [] },
  ];
}

test("quality judge maps accepted source counts to readiness tiers", () => {
  const acceptedSources = Array.from({ length: 8 }, (_, index) => source(index + 1));
  const evidenceCards = acceptedSources.map((_, index) => card(index + 1));
  const quality = buildQualityReport({
    topic: "短影音使用對高中生睡眠品質之影響",
    depth: "standard",
    acceptedSources,
    evidenceCards,
    sections: sections(evidenceCards),
  });

  assert.equal(quality.acceptedSourceCount, 8);
  assert.equal(quality.evidenceCardCount, 8);
  assert.equal(quality.readiness, "usable");
  assert.deepEqual(quality.missingCitationWarnings, []);
});

test("quality judge flags unsupported sections and causal overclaims", () => {
  const acceptedSources = [source(1), source(2), source(3)];
  const evidenceCards = [card(1)];
  const draftSections = sections(evidenceCards).map((section) =>
    section.key === "findings"
      ? { ...section, content: "短影音使用對高中生睡眠品質之影響證明必然造成問題。", evidenceCardIds: [], citationIds: [] }
      : section,
  );
  const quality = buildQualityReport({
    topic: "短影音使用對高中生睡眠品質之影響",
    depth: "quick",
    acceptedSources,
    evidenceCards,
    sections: draftSections,
  });

  assert.equal(quality.readiness, "preliminary");
  assert.ok(quality.missingCitationWarnings.some((warning) => warning.includes("主要發現")));
  assert.ok(quality.overclaimWarnings.some((warning) => warning.includes("因果語氣")));
  assert.ok(quality.unsupportedClaimWarnings.some((warning) => warning.includes("quick")));
});
