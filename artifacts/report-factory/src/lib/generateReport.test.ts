import assert from "node:assert/strict";
import test from "node:test";
import { expandTopicCards } from "./generateReport.ts";

const TEMPLATE_PHRASES = ["背景與重要性", "現況分析", "主要面向"];
const OLD_TEMPLATE_TERMS = ["academic research", "evidence", "source"];
const GENERIC_LABELS = ["生活連結", "比較", "行銷", "環境", "資料策略"];

function joinedCards(topic: string): string {
  return expandTopicCards(topic)
    .map((card) => `${card.title} ${card.angle} ${card.reason} ${card.chineseKeywords?.join(" ")} ${card.englishKeywords?.join(" ")} ${card.suggestedQuery}`)
    .join("\n");
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
