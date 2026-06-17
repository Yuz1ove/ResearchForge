import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCards } from "./evidenceCards.ts";
import { buildReportOutline } from "./reportOutline.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "A useful paper",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "A useful abstract.",
    doi: "10.1000/outline",
    url: "https://example.edu/outline",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    usableSections: ["研究背景", "文獻探討"],
    ...overrides,
  };
}

test("report outline includes required sections and evidence ids", () => {
  const acceptedSources = [source()];
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "短影音使用對高中生睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });

  assert.deepEqual(
    outline.sections.map((section) => section.title),
    [
      "標題",
      "摘要",
      "一、研究背景與動機",
      "二、研究問題",
      "三、文獻探討",
      "四、研究方法",
      "五、主要發現",
      "六、討論",
      "七、限制",
      "八、結論與建議",
      "參考資料",
    ],
  );
  assert(outline.sections.find((section) => section.title === "三、文獻探討")?.suggestedEvidenceCardIds.includes(evidenceCards[0]!.id));
});
