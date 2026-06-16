import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  sourceDecisionHint,
  sourceHasUsableAbstract,
  sourceRecommendedSections,
  sourceSummaryForUser,
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

test("sourceSummaryForUser explains cola-health topic relation in Traditional Chinese", () => {
  const summary = sourceSummaryForUser(
    source({
      title: "Sugar-sweetened beverage consumption and adolescent obesity",
      abstract:
        "This study examines soft drink and cola consumption, sugar intake, caffeine exposure, obesity, and health outcomes among adolescents.",
      sourceCategory: "journal_article",
    }),
    "可樂中的成分與攝取習慣對健康的影響",
  );

  assert.equal(summary.recommendation, "recommended");
  assert.match(summary.topicRelation, /可樂中的成分與攝取習慣對健康的影響/);
  assert.match(summary.topicRelation, /核心概念|相關面向/);
  assert.match(summary.recommendationReason, /優先考慮接受/);
  assert.ok(summary.usableSections.length > 0);
});

test("sourceSummaryForUser separates content summary from relation and recommendation", () => {
  const summary = sourceSummaryForUser(
    source({
      title: "Soft drink intake and health outcomes",
      abstract:
        "This cohort study evaluates soft drink intake, sugar exposure, caffeine, and health outcomes.",
      sourceCategory: "journal_article",
    }),
    "可樂中的成分與攝取習慣對健康的影響",
  );

  assert.match(summary.contentSummary, /soft drink intake/);
  assert.match(summary.topicRelation, /與主題關聯|核心概念|相關面向/);
  assert.match(summary.recommendationReason, /採用|接受|確認|不建議/);
});

test("sourceSummaryForUser does not recommend off-topic sources", () => {
  const summary = sourceSummaryForUser(
    source({
      title: "成人高考招生策略研究",
      abstract: "本文分析成人高考招生與職業教育策略。",
      doi: null,
      sourceCategory: "news_or_web",
    }),
    "可樂中的成分與攝取習慣對健康的影響",
  );

  assert.equal(summary.recommendation, "not_recommended");
  assert.match(summary.topicRelation, /關聯不足/);
  assert.match(summary.recommendationReason, /不建議納入/);
});

test("sourceSummaryForUser marks relevant metadata-only sources as check-first", () => {
  const summary = sourceSummaryForUser(
    source({
      title: "Climate change causes from greenhouse gas emissions and fossil fuel combustion",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    "氣候變遷成因",
  );

  assert.equal(summary.recommendation, "check_first");
  assert.match(summary.contentSummary, /摘要不足/);
  assert.match(summary.topicRelation, /摘要不足/);
  assert.match(summary.recommendationReason, /開啟原文確認/);
});
