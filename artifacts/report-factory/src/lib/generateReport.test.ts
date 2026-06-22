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

test("expands salmonella food safety topics into pathogen, contamination, and public health directions", () => {
  const text = joinedCards("食品安全與沙門氏桿菌感染風險");

  assert.match(text, /沙門氏桿菌|食品中毒|交叉污染|保存溫度|公共衛生|大腸桿菌/);
});

test("expands pig agriculture ecology topics into farming, disease control, manure, and ecosystem directions", () => {
  const text = joinedCards("豬隻在農業與生態系統中的角色");

  assert.match(text, /畜牧管理|疾病防治|抗生素|糞便|土壤|生態/);
});

test("expands BMW electric vehicle transition topics into brand positioning and competition directions", () => {
  const text = joinedCards("BMW 電動車轉型與豪華車市場競爭");

  assert.match(text, /品牌定位|豪華車市場|Mercedes-Benz|Audi|Tesla|電動車策略|供應鏈|ESG/);
});

test("topic expansion cards do not fall back to generic template phrases", () => {
  const text = ["花朵", "可樂", "短影音"].map(joinedCards).join("\n");

  for (const phrase of TEMPLATE_PHRASES) {
    assert.equal(text.includes(phrase), false);
  }
});
