import assert from "node:assert/strict";
import test from "node:test";
import { expandTopicCards } from "./generateReport.ts";

const TEMPLATE_PHRASES = ["背景與重要性", "現況分析", "主要面向"];

function joinedCards(topic: string): string {
  return expandTopicCards(topic)
    .map((card) => `${card.title} ${card.angle} ${card.reason}`)
    .join("\n");
}

test("expands flower topics into ecology, pollination, culture, or observation directions", () => {
  const text = joinedCards("花朵");

  assert.match(text, /授粉|生態|文化|校園觀察/);
  assert.equal(expandTopicCards("花朵").every((card) => card.title && card.angle && card.reason), true);
});

test("expands cola topics into health, marketing, environment, or culture directions", () => {
  const text = joinedCards("可樂");

  assert.match(text, /健康|行銷|環境|文化/);
});

test("expands short-video topics into attention, algorithm, sleep, or teen directions", () => {
  const text = joinedCards("短影音");

  assert.match(text, /注意力|演算法|睡眠|青少年/);
});

test("topic expansion cards do not fall back to generic template phrases", () => {
  const text = ["花朵", "可樂", "短影音"].map(joinedCards).join("\n");

  for (const phrase of TEMPLATE_PHRASES) {
    assert.equal(text.includes(phrase), false);
  }
});
