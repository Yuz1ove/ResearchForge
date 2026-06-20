import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCards, summarizeEvidenceCoverage } from "./evidenceCards.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "Attention and sleep quality",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "Students report lower sleep quality when screen time is high.",
    doi: "10.1000/sleep",
    url: "https://example.edu/sleep",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "學術論文",
    usableSections: ["研究背景", "文獻探討"],
    confidence: "高",
    provider: "Crossref",
    sourceQualityScore: 92,
    relevanceScore: 84,
    finalScore: 87,
    reviewNotes: "樣本描述清楚。",
    ...overrides,
  };
}

test("builds evidence cards from accepted sources and inherits metadata", () => {
  const cards = buildEvidenceCards([source()]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.sourceId, "source-1");
  assert.equal(cards[0]?.sourceCategory, "學術論文");
  assert.equal(cards[0]?.doi, "10.1000/sleep");
  assert.equal(cards[0]?.abstract, "Students report lower sleep quality when screen time is high.");
  assert.equal(cards[0]?.provider, "Crossref");
  assert.equal(cards[0]?.sourceQualityScore, 92);
  assert.equal(cards[0]?.relevanceScore, 84);
  assert.equal(cards[0]?.finalScore, 87);
  assert.deepEqual(cards[0]?.usableSections, ["研究背景", "文獻探討"]);
  assert.equal(cards[0]?.confidence, "高");
  assert.equal(cards[0]?.derivation, "abstract-derived");
  assert.equal(cards[0]?.pageOrLocation, "abstract");
  assert.equal(cards[0]?.confidenceScore <= 0.74, true);
  assert.equal(cards[0]?.notes, "樣本描述清楚。");
});

test("ignores pending and rejected sources", () => {
  const cards = buildEvidenceCards([
    source({ id: "accepted", reviewState: "accepted" }),
    source({ id: "pending", reviewState: "pending", doi: "10.1000/pending" }),
    source({ id: "rejected", reviewState: "rejected", doi: "10.1000/rejected" }),
  ]);

  assert.deepEqual(cards.map((card) => card.sourceId), ["accepted"]);
});

test("does not duplicate by sourceId and removes no-longer-accepted sources on regenerate", () => {
  const first = buildEvidenceCards([source({ id: "accepted" })]);
  const edited = [{ ...first[0]!, claim: "人工編輯後的主張" }];
  const regenerated = buildEvidenceCards(
    [
      source({ id: "accepted" }),
      source({ id: "other", doi: "10.1000/other", title: "Other source" }),
      source({ id: "accepted", doi: "10.1000/duplicate" }),
    ],
    edited,
  );
  const afterCancel = buildEvidenceCards([source({ id: "accepted", reviewState: "pending" })], regenerated);

  assert.equal(regenerated.length, 2);
  assert.equal(regenerated[0]?.claim, "人工編輯後的主張");
  assert.deepEqual(afterCancel, []);
});

test("creates up to three evidence cards when abstract contains multiple matched snippets", () => {
  const cards = buildEvidenceCards(
    [
      source({
        id: "climate",
        title: "Climate change evidence",
        abstract:
          "Anthropogenic greenhouse gas emissions drive climate change. Observed warming and sea level indicators show current status. Climate impacts create risks for ecosystems.",
      }),
    ],
    [],
    { topic: "氣候變遷的成因與現況" },
  );

  assert.equal(cards.length >= 2, true);
  assert.equal(cards.length <= 3, true);
  assert.equal(cards.every((card) => card.sourceId === "climate"), true);
  assert.equal(cards.every((card) => card.limitation?.includes("尚未讀取全文")), true);
});

test("metadata-only evidence is bibliographic and low confidence", () => {
  const cards = buildEvidenceCards([
    source({
      id: "metadata-only",
      abstract: null,
      evidenceGrounding: "metadata_only",
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.derivation, "metadata-derived");
  assert.equal(cards[0]?.confidenceScore, 0.35);
  assert.match(cards[0]?.limitation ?? "", /不可產生具體研究結論|僅能作為書目/);
});

test("coverage summary counts usable sections and reports required warnings", () => {
  const accepted = [
    source({ id: "one", usableSections: ["研究背景"] }),
    source({ id: "two", doi: "10.1000/two", usableSections: ["研究背景"] }),
  ];
  const cards = buildEvidenceCards(accepted);
  const summary = summarizeEvidenceCoverage(cards, accepted);

  assert.equal(summary.sectionCounts["研究背景"], 2);
  assert.equal(summary.sectionCounts["文獻探討"], 0);
  assert(summary.warnings.some((warning) => warning.message === "文獻探討尚缺證據"));
  assert(summary.warnings.some((warning) => warning.message === "建議至少接受 10 筆來源"));
});
