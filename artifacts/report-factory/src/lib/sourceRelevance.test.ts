import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  applySourceRelevanceAssessments,
  buildSourceIntentProfile,
  buildSourceRelevanceAssessment,
} from "./sourceRelevance.ts";
import { supplementTrustedClimateSources } from "./trustedClimateSources.ts";

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

  assert.equal(assessment.relevanceLevel, "primary");
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

test("highly relevant source without abstract is clue and check-first", () => {
  const profile = buildSourceIntentProfile("氣候變遷成因");
  const assessment = buildSourceRelevanceAssessment(
    source({
      title: "Climate change causes from greenhouse gas emissions and fossil fuel combustion",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    profile,
  );

  assert.equal(assessment.relevanceLevel, "clue");
  assert.equal(assessment.shouldShowInMainList, false);
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

  assert.equal(assessed[0]?.relevanceLevel, "primary");
  assert.equal(assessed[0]?.shouldShowInMainList, true);
  assert.equal(assessed[1]?.relevanceLevel, "off_topic");
  assert.equal(assessed[1]?.shouldShowInMainList, false);
});

test("climate source relevance separates primary causes and current-status sources from secondary material", () => {
  const topic = "「氣候變遷」的成因與現況分析";
  const examples = [
    source({
      id: "primary-causes",
      title: "Causes of climate change: greenhouse gas emissions and fossil fuel combustion",
      abstract:
        "Anthropogenic greenhouse gas emissions from fossil fuel combustion include carbon dioxide and methane. These emissions are major drivers of climate change.",
    }),
    source({
      id: "primary-status",
      title: "Observed global warming and current status of climate change indicators",
      abstract:
        "Observed warming is reflected in global temperature trends, CO2 concentration, and sea level change. Climate indicators show continued global warming.",
    }),
    source({
      id: "primary-ipcc",
      title: "IPCC assessment of anthropogenic climate change and greenhouse gases",
      abstract:
        "The IPCC assessment attributes climate change to anthropogenic greenhouse gas emissions and documents observed warming.",
    }),
    source({
      id: "forest-impact",
      title: "Climate change impacts on forest ecosystem water flux",
      abstract:
        "This study examines climate change impacts on forest ecosystem water flux and regional ecological effects.",
    }),
    source({
      id: "financial-risk",
      title: "Climate change and financial risk response",
      abstract:
        "The article discusses financial risk, insurance, and response strategies related to climate change.",
    }),
    source({
      id: "policy-committee",
      title: "Climate change policy committee governance",
      abstract:
        "This paper analyzes governance and committee functions in climate change policy.",
    }),
    source({
      id: "tone-sandhi",
      title: "Beijing tone sandhi and phonetic variation",
      abstract: "This paper studies Beijing tone sandhi and phonetic variation.",
    }),
    source({
      id: "admission",
      title: "University admission strategy",
      abstract: "This article discusses admissions strategy and school recruitment.",
    }),
    source({
      id: "jerusalem",
      title: "Jerusalem political metaphor and national identity",
      abstract: "This essay analyzes political metaphor and national identity.",
    }),
  ];

  const assessed = applySourceRelevanceAssessments(examples, topic);
  const byId = new Map(assessed.map((item) => [item.id, item]));
  const mainList = assessed.filter((item) => item.shouldShowInMainList);

  assert.equal(byId.get("primary-causes")?.relevanceLevel, "primary");
  assert.equal(byId.get("primary-status")?.relevanceLevel, "primary");
  assert.equal(byId.get("primary-ipcc")?.relevanceLevel, "primary");
  assert.equal(byId.get("forest-impact")?.relevanceLevel, "secondary");
  assert.notEqual(byId.get("financial-risk")?.relevanceLevel, "primary");
  assert.notEqual(byId.get("policy-committee")?.relevanceLevel, "primary");
  assert.equal(byId.get("tone-sandhi")?.relevanceLevel, "off_topic");
  assert.equal(byId.get("admission")?.relevanceLevel, "off_topic");
  assert.equal(byId.get("jerusalem")?.relevanceLevel, "off_topic");
  assert.ok(mainList.every((item) => item.relevanceLevel !== "low" && item.relevanceLevel !== "off_topic"));
});

test("metadata-only climate source is not recommended as primary evidence", () => {
  const profile = buildSourceIntentProfile("「氣候變遷」的成因與現況分析");
  const assessment = buildSourceRelevanceAssessment(
    source({
      title: "Climate change causes greenhouse gas emissions and observed warming",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    profile,
  );

  assert.equal(assessment.relevanceLevel, "clue");
  assert.equal(assessment.evidenceGrounding, "metadata_only");
  assert.equal(assessment.shouldRecommendAccept, false);
});

test("trusted climate fallback supplies enough grounded primary sources when providers return metadata only", () => {
  const topic = "「氣候變遷」的成因與現況分析";
  const metadataOnly = [
    source({
      id: "metadata-only",
      title: "Greenhouse gases and climate change",
      abstract: null,
      sourceCategory: "journal_article",
    }),
  ];
  const supplemented = supplementTrustedClimateSources(metadataOnly, topic);
  const assessed = applySourceRelevanceAssessments(supplemented, topic);
  const primary = assessed.filter((item) => item.relevanceLevel === "primary");
  const metadataAssessment = assessed.find((item) => item.id === "metadata-only");

  assert.ok(primary.length >= 8);
  assert.ok(primary.every((item) => item.evidenceGrounding === "abstract_grounded"));
  assert.equal(metadataAssessment?.shouldRecommendAccept, false);
});
