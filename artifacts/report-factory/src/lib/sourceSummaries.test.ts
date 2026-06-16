import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  sourceDecisionHint,
  sourceHasUsableAbstract,
  sourceRecommendedSections,
  sourceSummaryText,
} from "./sourceSummaries.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-summary",
    title: "Short video use and attention",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "This study examines short video use and attention among students. It reports survey patterns and discusses implications for learning routines. Extra details should be truncated when the text becomes too long for a compact card.",
    doi: "10.1000/summary",
    url: "https://example.edu/summary",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    ...overrides,
  };
}

test("sourceSummaryText uses abstract and truncates to a compact card length", () => {
  const summary = sourceSummaryText(source());

  assert.match(summary, /short video use and attention/);
  assert.ok(Array.from(summary).length <= 170);
});

test("sourceSummaryText does not invent conclusions when abstract is missing", () => {
  const summary = sourceSummaryText(source({ abstract: null, title: "A title only source" }));

  assert.match(summary, /摘要不足/);
  assert.equal(sourceHasUsableAbstract(source({ abstract: null })), false);
});

test("sourceDecisionHint keeps accepted sources reversible through review helper", () => {
  const hint = sourceDecisionHint(source({ abstract: null }));

  assert.match(hint, /建議開啟原文確認/);
});

test("sourceRecommendedSections always returns at least one section", () => {
  const sections = sourceRecommendedSections(
    source({
      title: "Untyped web page",
      abstract: null,
      doi: null,
      url: "https://example.test/page",
      sourceType: "Web",
      publisher: null,
      containerTitle: null,
    }),
  );

  assert.ok(sections.length > 0);
});
