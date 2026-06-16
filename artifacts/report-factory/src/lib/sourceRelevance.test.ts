import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  applySourceRelevanceAssessments,
  buildSourceIntentProfile,
  buildSourceRelevanceAssessment,
} from "./sourceRelevance.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-relevance",
    title: "Sugar-sweetened beverage consumption and metabolic health",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "This peer reviewed study examines soft drink and cola consumption, sugar intake, caffeine exposure, obesity, and health outcomes.",
    doi: "10.1000/relevance",
    url: "https://doi.org/10.1000/relevance",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "journal_article",
    ...overrides,
  };
}

test("cola health relevance keeps English high-quality research in the main list", () => {
  const profile = buildSourceIntentProfile("可樂中的成分與攝取習慣對健康的影響");
  const assessment = buildSourceRelevanceAssessment(source(), profile);

  assert.equal(assessment.relevanceLevel, "high");
  assert.equal(assessment.shouldShowInMainList, true);
  assert.equal(assessment.shouldRecommendAccept, true);
  assert.ok(assessment.matchedCoreConcepts.includes("soft drink"));
  assert.ok(assessment.matchedCoreConcepts.includes("cola"));
});

test("cola health relevance removes admissions and engineering-management noise from the main list", () => {
  const profile = buildSourceIntentProfile("可樂中的成分與攝取習慣對健康的影響");
  const noisySources = [
    source({
      id: "adult-exam",
      title: "成人高考招生策略研究",
      abstract: "本文分析成人高考招生與職業教育策略。",
      doi: null,
      sourceCategory: "news_or_web",
    }),
    source({
      id: "engineering",
      title: "工程管理招生宣傳影片與圖書館推介",
      abstract: "工程管理招生與圖書館推介影片設計。",
      doi: null,
      sourceCategory: "news_or_web",
    }),
  ];

  for (const noisySource of noisySources) {
    const assessment = buildSourceRelevanceAssessment(noisySource, profile);
    assert.equal(assessment.relevanceLevel, "off_topic");
    assert.equal(assessment.shouldShowInMainList, false);
    assert.equal(assessment.shouldRecommendAccept, false);
  }
});

test("climate change causes relevance removes tone-sandhi and religious-title noise", () => {
  const profile = buildSourceIntentProfile("氣候變遷成因");
  const noisySources = [
    source({
      id: "beijing-tone",
      title: "北京話變調規律研究",
      abstract: "此研究討論北京話語音變調。",
      doi: "10.1000/tone",
    }),
    source({
      id: "jerusalem",
      title: "建設中國的耶路撒冷與宗教稱號",
      abstract: "本文討論政治與宗教稱號。",
      doi: null,
    }),
  ];

  for (const noisySource of noisySources) {
    const assessment = buildSourceRelevanceAssessment(noisySource, profile);
    assert.equal(assessment.relevanceLevel, "off_topic");
    assert.equal(assessment.shouldShowInMainList, false);
  }
});

test("highly relevant source without abstract is medium and check-first", () => {
  const profile = buildSourceIntentProfile("氣候變遷成因");
  const assessment = buildSourceRelevanceAssessment(
    source({
      title: "Climate change causes from greenhouse gas emissions and fossil fuel combustion",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    profile,
  );

  assert.equal(assessment.relevanceLevel, "medium");
  assert.equal(assessment.shouldShowInMainList, true);
  assert.equal(assessment.shouldRecommendAccept, false);
  assert.ok(assessment.reasons.some((reason) => reason.includes("摘要不足")));
});

test("applySourceRelevanceAssessments persists gate metadata on source records", () => {
  const assessed = applySourceRelevanceAssessments(
    [
      source(),
      source({ id: "adult-exam", title: "成人高考招生策略研究", abstract: "招生與職業教育。", doi: null }),
    ],
    "可樂中的成分與攝取習慣對健康的影響",
  );

  assert.equal(assessed[0]?.relevanceLevel, "high");
  assert.equal(assessed[0]?.shouldShowInMainList, true);
  assert.equal(assessed[1]?.relevanceLevel, "off_topic");
  assert.equal(assessed[1]?.shouldShowInMainList, false);
});
