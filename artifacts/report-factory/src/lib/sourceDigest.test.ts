import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import { buildAcceptedSourceDigest } from "./sourceDigest.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-digest",
    title: "Taiwan student sleep survey data",
    authors: ["Ada Lovelace"],
    year: 2025,
    abstract:
      "This survey describes student sleep routines in Taiwan. It provides data signals for background and discussion without giving a final conclusion.",
    doi: "10.1000/digest",
    url: "https://example.gov.tw/digest",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Taiwan Education Agency",
    containerTitle: "Government Report",
    accessedAt: null,
    sourceCategory: "government_or_institution",
    confidence: "高",
    usableSections: ["研究背景", "數據分析"],
    reviewNotes: "",
    ...overrides,
  };
}

test("accepted source digest warns when no accepted sources exist", () => {
  const digest = buildAcceptedSourceDigest([], { currentYear: 2026 });

  assert.match(digest.summary, /尚未接受任何來源/);
  assert.deepEqual(digest.coverage, []);
  assert.ok(digest.gaps.includes("尚未接受來源"));
});

test("accepted source digest summarizes multiple sources without listing source numbers", () => {
  const digest = buildAcceptedSourceDigest(
    [
      source(),
      source({
        id: "academic",
        title: "Short video attention literature review",
        abstract: "This review compares attention findings and limitations in youth media studies.",
        doi: "10.1000/academic",
        url: "https://doi.org/10.1000/academic",
        sourceCategory: "journal_article",
        publisher: "Example Journal",
        containerTitle: "Media Psychology Review",
        usableSections: ["文獻探討", "結論"],
      }),
    ],
    { topic: "短影音與注意力", currentYear: 2026 },
  );

  assert.match(digest.summary, /短影音與注意力/u);
  assert.match(digest.summary, /目前已接受 2 筆來源/u);
  assert.doesNotMatch(digest.summary, /目前可先從/u);
  assert.doesNotMatch(digest.summary, /來源 1|來源 2|Source 1|Source 2/);
  assert.ok(digest.coverage.length > 0);
});

test("accepted source digest creates metadata-driven gap reminders", () => {
  const digest = buildAcceptedSourceDigest(
    [
      source({
        title: "Old web article",
        year: 2018,
        abstract: null,
        doi: null,
        url: "https://example.com/article",
        sourceType: "Web",
        publisher: "Example Web",
        containerTitle: null,
        sourceCategory: "news_or_web",
        usableSections: [],
      }),
    ],
    { currentYear: 2026 },
  );

  assert.ok(digest.gaps.includes("部分來源摘要不足，已降為保守證據"));
  assert.ok(digest.gaps.includes("缺少近三年研究"));
  assert.ok(digest.gaps.includes("缺少官方資料"));
});

test("accepted source digest does not fabricate concrete statistics", () => {
  const digest = buildAcceptedSourceDigest([source()], { currentYear: 2026 });

  assert.doesNotMatch(digest.summary, /\d+%|增加|降低|證明/);
});

test("accepted source digest uses the paper-search reader summary", () => {
  const digest = buildAcceptedSourceDigest(
    [
      source({
        abstract: null,
        readableSummaryZhTW: "這篇研究整理睡眠時間與學生注意力之間的關聯。",
        llmSummaryZhTw: "這篇研究整理睡眠時間與學生注意力之間的關聯。",
        summarySourceType: "metadataFallback",
      }),
    ],
    { topic: "睡眠與注意力", currentYear: 2026 },
  );

  assert.match(digest.summary, /睡眠時間與學生注意力之間的關聯/u);
});
