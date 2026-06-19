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

  assert.match(summary, /本期刊文章|可提供|支撐/);
  assert.doesNotMatch(summary, /This study examines/);
  assert.ok(Array.from(summary).length <= 170);
});

test("sourceSummaryText does not invent conclusions when abstract is missing", () => {
  const summary = sourceSummaryText(
    source({ abstract: null, title: "A title only source" }),
  );

  assert.match(summary, /背景線索|資料缺口|補充可驗證摘要/);
  assert.equal(sourceHasUsableAbstract(source({ abstract: null })), false);
});

test("sourceDecisionHint keeps accepted sources reversible through review helper", () => {
  const hint = sourceDecisionHint(source({ abstract: null }));

  assert.match(hint, /不列入主要證據候選/);
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
  assert.match(summary.topicRelation, /主要證據|直接支撐|關聯/);
  assert.match(summary.recommendationReason, /推薦採用/);
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

  assert.match(summary.contentSummary, /這篇來源|可支撐|soft drink/i);
  assert.doesNotMatch(summary.contentSummary, /This cohort study/);
  assert.match(summary.topicRelation, /主題|直接支撐|延伸/);
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
  assert.match(summary.topicRelation, /直接支撐|主要證據/);
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
  assert.match(summary.contentSummary, /這篇來源/);
  assert.match(summary.contentSummary, /棲地|microhabitat|ecology|蜘蛛|Spider/);
  assert.doesNotMatch(
    summary.contentSummary,
    /請開啟原文|待確認|尚未取得摘要/,
  );
  assert.ok(Array.from(summary.contentSummary).length >= 80);
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
    /蜘蛛主體|棲地需求|捕食策略|避敵行為|築網行為|生存適應/,
  );
  assert.equal(driftSummary.recommendation, "not_recommended");
  assert.equal(driftSummary.summaryQuality, "irrelevant");
  assert.match(driftSummary.summaryQualityReason, /明顯不符/);
});
