import assert from "node:assert/strict";
import test from "node:test";
import {
  expandTopicCards,
  generateReport,
  type ReportInput,
} from "./generateReport.ts";
import { readerFacingInternalTerms } from "./reportPreviewGuards.ts";
import type { SourceRecord } from "./sourceRecords.ts";

const TEMPLATE_PHRASES = ["背景與重要性", "現況分析", "主要面向"];
const OLD_TEMPLATE_TERMS = ["academic research", "evidence", "source"];
const GENERIC_LABELS = ["生活連結", "資料策略", "研究限制"];

function joinedCards(topic: string): string {
  return expandTopicCards(topic)
    .map((card) => `${card.title} ${card.angle} ${card.reason} ${card.chineseKeywords?.join(" ")} ${card.englishKeywords?.join(" ")} ${card.suggestedQuery}`)
    .join("\n");
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

test("expands flower topics into ecology, pollination, culture, or observation directions", () => {
  const text = joinedCards("花朵");

  assert.match(text, /授粉|生態|文化|校園觀察/);
  assert.equal(expandTopicCards("花朵").every((card) => card.title && card.angle && card.reason), true);
});

test("expands cola topics into health, marketing, environment, or culture directions", () => {
  const text = joinedCards("可樂");

  assert.match(text, /可樂成分與青少年健康影響/);
  assert.match(text, /無糖可樂與含糖可樂成分比較/);
  assert.match(text, /可樂包裝與環境廢棄物問題/);
  assert.match(text, /可樂品牌廣告如何影響消費偏好/);
});

test("expands short-video topics into attention, algorithm, sleep, or teen directions", () => {
  const text = joinedCards("短影音");

  assert.match(text, /注意力|演算法|睡眠|青少年/);
});

test("topic expansion cards do not fall back to generic template phrases", () => {
  const text = ["花朵", "可樂", "短影音", "薯條"].map(joinedCards).join("\n");

  for (const phrase of TEMPLATE_PHRASES) {
    assert.equal(text.includes(phrase), false);
  }
  for (const term of OLD_TEMPLATE_TERMS) {
    assert.equal(text.includes(term), false);
  }
});

test("expands dumpling topics into research-ready query planner cards", () => {
  const cards = expandTopicCards("水餃");
  const text = joinedCards("水餃");

  assert.equal(cards.length >= 4, true);
  assert.match(text, /水餃在台灣飲食文化中的演變/);
  assert.match(text, /冷凍水餃與現包水餃的營養差異/);
  assert.match(text, /市售冷凍水餃鈉含量與健康風險比較/);
  assert.equal(
    cards.every(
      (card) =>
        card.chineseKeywords?.length &&
        card.englishKeywords?.length &&
        card.suggestedQuery?.includes("水餃") &&
        card.researchValue,
    ),
    true,
  );
  for (const label of GENERIC_LABELS) {
    assert.notEqual(cards.some((card) => card.title === label), true);
  }
});

test("expands cola topics into concrete research subtopics with query fields", () => {
  const cards = expandTopicCards("可樂");
  const text = joinedCards("可樂");

  assert.equal(cards.length >= 4, true);
  assert.match(text, /cola|diet cola|consumer behavior/);
  assert.equal(
    cards.every(
      (card) =>
        card.chineseKeywords?.length &&
        card.englishKeywords?.length &&
        card.suggestedQuery?.includes("可樂") &&
        card.searchBoundary,
    ),
    true,
  );
  for (const label of GENERIC_LABELS) {
    assert.notEqual(cards.some((card) => card.title === label), true);
  }
});

test("expands french fries topics into nutrition, food safety, dietary, and environment directions", () => {
  const cards = expandTopicCards("薯條");
  const text = joinedCards("薯條");

  assert.equal(cards.length >= 4, true);
  assert.match(text, /速食薯條的營養成分與鈉含量分析/);
  assert.match(text, /油炸方式與薯條食品安全風險/);
  assert.match(text, /青少年速食薯條攝取與飲食習慣/);
  assert.match(text, /薯條包裝與速食供應鏈的環境負荷/);
  assert.match(text, /french fries|acrylamide|dietary habits|life cycle assessment/);
  assert.equal(
    cards.every(
      (card) =>
        card.chineseKeywords?.length &&
        card.englishKeywords?.length &&
        card.suggestedQuery?.includes("薯條") &&
        card.searchBoundary,
    ),
    true,
  );
  for (const label of GENERIC_LABELS) {
    assert.notEqual(cards.some((card) => card.title === label), true);
  }
});

test("expands guinea pig entity into animal-aware clarification cards", () => {
  const cards = expandTopicCards("天竺鼠");
  const text = joinedCards("天竺鼠");

  assert.equal(cards.length >= 3, true);
  assert.match(text, /實驗動物|飼養環境|社會行為|動物福利/);
  assert.match(text, /guinea pig|Cavia porcellus/i);
  assert.ok(!/生活連結|資料策略|研究限制/.test(text));
});

test("expands bubble broad noun into concrete physics, learning, and material directions", () => {
  const cards = expandTopicCards("泡泡");
  const text = joinedCards("泡泡");

  assert.equal(cards.length >= 4, true);
  assert.match(text, /表面張力|光學干涉|幼兒感官學習|氣泡材料/);
  assert.match(text, /surface tension|soap bubble|microbubble/i);
  assert.ok(!/生活連結|資料策略|研究限制/.test(text));
});

test("expands airplane topics into mechanics, aviation, and construction directions", () => {
  const cards = expandTopicCards("飛機");
  const text = joinedCards("飛機");

  assert.equal(cards.length >= 3, true);
  assert.match(text, /機翼|機身|升力|民航|飛航安全|材料|製造|組裝/);
  assert.match(text, /aircraft|aviation|manufacturing/i);
  assert.ok(!/背景與重要性|現況分析|主要面向|生活連結|資料策略|研究限制/.test(text));
});

test("generated reader blocks and bibliography contain no internal pipeline terms", () => {
  const acceptedSource: SourceRecord = {
    id: "source-1",
    title: "Citation Enforced Prompting for Faithful Question Answering",
    authors: [],
    year: null,
    abstract: "This study evaluates grounded generation.",
    doi: null,
    url: null,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: null,
    containerTitle: null,
    accessedAt: null,
  };
  const input: ReportInput = {
    topic: "檢索增強生成的回答忠實度",
    reportType: "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
    researchDepth: "standard",
    purpose: "學校作業",
    domainOverride: "",
    mode: "直接生成完整報告",
    sourceRequirement: "需要",
    citationFormat: "APA",
    chartRequirement: "不需要",
    style: "正式、清楚、有邏輯",
    length: "一般報告",
    wordCount: "",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "",
    rubric: "",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "",
    acceptedSources: [acceptedSource],
  };

  const report = generateReport(input);
  const readerText = stringValues(report.sections).join("\n");

  assert.deepEqual(readerFacingInternalTerms(readerText), []);
  assert.match(readerText, /Citation Enforced Prompting for Faithful Question Answering/u);
  assert.match(readerText, /書目資料待補/u);
});
