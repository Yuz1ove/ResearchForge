import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCards } from "./evidenceCards.ts";
import { buildReportDraft } from "./reportDraft.ts";
import { buildReportOutline } from "./reportOutline.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "Screen time and sleep",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "Screen time can be associated with lower sleep quality.",
    doi: "10.1000/draft",
    url: "https://example.edu/draft",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    usableSections: ["研究背景", "文獻探討", "結論"],
    ...overrides,
  };
}

test("draft generator includes section headings, source markers, and reference list", () => {
  const acceptedSources = [source()];
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "短影音使用對高中生睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    topic: "短影音使用對高中生睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  assert.match(draft.text, /研究動機/);
  assert.match(draft.text, /（來源 1）/);
  assert.match(draft.text, /參考資料/);
  assert.equal(draft.referenceList.length, 1);
  assert.match(draft.referenceList[0]!, /Screen time and sleep/);
});
