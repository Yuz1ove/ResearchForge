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

  assert.match(summary, /目前可確認這份資料主要涉及|短影音|attention/i);
  assert.doesNotMatch(summary, /This study examines/);
  assert.ok(Array.from(summary).length <= 170);
});

test("sourceSummaryText prefers backend readableSummaryZhTW when available", () => {
  const summary = sourceSummaryText(
    source({
      readableSummaryZhTW:
        "這份來源主要整理短影音使用與學生注意力分散之間的關係，並說明它可作為目前研究主題的直接背景證據。",
      summarySourceType: "abstract",
      summaryConfidence: "high",
    }),
  );

  assert.match(summary, /短影音使用與學生注意力分散/);
  assert.doesNotMatch(summary, /主旨：|摘要重點/);
});

test("sourceSummaryText does not invent conclusions when abstract is missing", () => {
  const summary = sourceSummaryText(
    source({ abstract: null, title: "A title only source" }),
  );

  assert.match(summary, /標題與基本書目資訊|證據不足|主要證據/);
  assert.equal(sourceHasUsableAbstract(source({ abstract: null })), false);
});

test("sourceDecisionHint keeps accepted sources reversible through review helper", () => {
  const hint = sourceDecisionHint(source({ abstract: null }));

  assert.match(hint, /不能列入主要證據|有限書目資訊/);
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
  assert.match(summary.topicRelation, /核心概念|關聯穩定|cola|sugar/i);
  assert.match(summary.recommendationReason, /可作主要證據/);
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

  assert.match(summary.contentSummary, /含糖飲料|soft drink|health/i);
  assert.doesNotMatch(summary.contentSummary, /This cohort study/);
  assert.match(summary.topicRelation, /核心概念|關聯|cola|soft drink/i);
  assert.match(summary.recommendationReason, /主要證據|補充來源|僅供參考|建議排除/);
});

test("sourceSummaryForUser rewrites mixed English aircraft summaries into more natural Chinese", () => {
  const summary = sourceSummaryForUser(
    source({
      title:
        "A Runway Overrun Risk Assessment Model for Civil Aircraft Based on Quick Access Recorder Data",
      abstract:
        "In this paper, we propose a new dynamic runway overrun risk assessment model based on QAR data for civil aircraft safety.",
      sourceCategory: "journal_article",
      matchedFacets: ["aircraft", "flight safety"],
    }),
    "飛機",
  );

  assert.match(summary.contentSummary, /runway overrun|flight safety|aircraft/i);
  assert.doesNotMatch(summary.contentSummary, /In this paper|QAR data/i);
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
  assert.match(summary.topicRelation, /重合不足|核心概念/);
  assert.match(summary.recommendationReason, /建議排除/);
});

test("sourceSummaryForUser marks relevant metadata-only sources as check-first", () => {
  const summary = sourceSummaryForUser(
    source({
      title:
        "Climate change causes from greenhouse gas emissions and fossil fuel combustion",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    "氣候變遷成因",
  );

  assert.equal(summary.recommendation, "check_first");
  assert.match(summary.contentSummary, /延伸線索|補充可驗證摘要|主要證據/);
  assert.doesNotMatch(
    `${summary.contentSummary} ${summary.topicRelation} ${summary.recommendationReason}`,
    /請開啟原文|待確認|尚未取得摘要/,
  );
  assert.equal(summary.summaryConfidence, "low");
});

test("sourceSummaryForUser respects backend source classification for non-climate planner topics", () => {
  const summary = sourceSummaryForUser(
    source({
      title: "Frozen dumpling nutrition, sodium content, and food labeling",
      abstract:
        "This source examines frozen dumpling nutrition facts, sodium content, food labeling, and consumer choice.",
      sourceCategory: "journal_article",
      relevanceLevel: "primary",
      relevanceScore: 88,
      classification: "primary",
      matchedTerms: ["dumpling", "nutrition", "food labeling"],
      shouldShowInMainList: true,
      shouldRecommendAccept: true,
      sourceRelevanceReasonZhTw:
        "來源聚焦水餃營養成分、鈉含量與食品標示，可支撐研究問題。",
    }),
    "水餃",
  );

  assert.notEqual(summary.summaryQuality, "irrelevant");
  assert.notEqual(summary.recommendation, "not_recommended");
  assert.match(summary.topicRelation, /可支撐研究問題|營養成分|食品標示/);
  assert.doesNotMatch(summary.summaryQualityReason, /明顯不符|離題/);
});

test("sourceSummaryForUser writes a complete zh-TW paragraph for spider habitat abstracts", () => {
  const summary = sourceSummaryForUser(
    source({
      title: "Spider habitat selection and microhabitat ecology",
      abstract:
        "This study examines spider habitat selection, microhabitat conditions, vegetation structure, species richness, and ecological distribution across forest sites.",
      sourceCategory: "journal_article",
    }),
    "蜘蛛與其棲地相關研究",
  );

  assert.equal(summary.recommendation, "recommended");
  assert.match(summary.contentSummary, /棲地|蜘蛛|核心面向/);
  assert.doesNotMatch(
    summary.contentSummary,
    /請開啟原文|待確認|尚未取得摘要/,
  );
  assert.ok(Array.from(summary.contentSummary).length >= 20);
});

test("sourceSummaryForUser builds evidence snippets and zh-TW refined summary for climate sources", () => {
  const summary = sourceSummaryForUser(
    source({
      title:
        "Observed global warming and current status of climate change indicators",
      abstract:
        "Observed warming is reflected in global temperature trends, CO2 concentration, and sea level change. Greenhouse gas emissions remain a major driver of climate change.",
      sourceCategory: "journal_article",
    }),
    "「氣候變遷」的成因與現況分析",
  );

  assert.equal(summary.recommendation, "recommended");
  assert.equal(summary.groundingStatus, "abstract_grounded");
  assert.ok(summary.evidenceSnippets.length > 0);
  assert.ok(summary.evidenceSnippets[0]?.matchedFacet);
  assert.ok(summary.evidenceSnippets[0]?.supportLevel);
  assert.ok(summary.evidenceSnippets[0]?.reasoningZhTw);
  assert.ok(summary.evidenceChain.length > 0);
  assert.ok(summary.mainEvidenceFacet);
  assert.match(summary.contentSummary, /溫室氣體|二氧化碳|觀測升溫|海平面/);
  assert.ok(summary.suitableSectionLabels.includes("現況分析"));
});

test("sourceSummaryForUser marks spider ecology sources as good and generic strategy drift as irrelevant", () => {
  const spiderSummary = sourceSummaryForUser(
    source({
      title: "Spider habitat selection and microhabitat ecology",
      abstract:
        "This study examines spider habitat selection, microhabitat conditions, predation behavior, anti-predator behavior, web building, and survival adaptation.",
      sourceCategory: "journal_article",
    }),
    "蜘蛛的棲地需求與生存策略",
  );

  const driftSummary = sourceSummaryForUser(
    source({
      title: "高中地理教學中國家安全教育存在問題及改進策略研究",
      abstract: "本文探討國家安全教育的改進策略。",
      doi: null,
      sourceCategory: "news_or_web",
    }),
    "蜘蛛的棲地需求與生存策略",
  );

  assert.equal(spiderSummary.recommendation, "recommended");
  assert.equal(spiderSummary.summaryQuality, "good");
  assert.match(spiderSummary.summaryQualityReason, /摘要/);
  assert.match(
    spiderSummary.contentSummary,
    /主旨：|棲地|捕食|避敵|築網|生存|蜘蛛/,
  );
  assert.equal(driftSummary.recommendation, "not_recommended");
  assert.equal(driftSummary.summaryQuality, "irrelevant");
  assert.match(driftSummary.summaryQualityReason, /明顯不符/);
});
