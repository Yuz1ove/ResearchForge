import assert from "node:assert/strict";
import test from "node:test";
import type { TopicExpansionResponse } from "@workspace/api-zod/topic-expansion";
import {
  hasLegacyVisibleTitleTemplate,
  topicExpansionToTitleCards,
} from "./topicTitleEnhancement.ts";

test("title candidates only expose visible report titles on the first page", () => {
  const result = {
    status: "success",
    expandedTopic: "聚焦於 螞蟻 的生態角色、環境壓力與人類影響。",
    researchQuestions: ["螞蟻如何維持群體合作？"],
    searchKeywords: { zh: ["螞蟻"], en: ["ant"], synonyms: [], academic: [] },
    sourceStrategy: ["生物生態"],
    exclusions: [],
    titleCandidates: [
      {
        id: "title-1",
        title: "微小社會的巨大秩序：螞蟻群體分工與生態角色",
        style: "poetic_academic",
        displayOnly: true,
        source: "hybrid",
      },
    ],
    hiddenResearchPlan: {
      selectedTopicSeed: "螞蟻",
      possibleDomains: ["biology_ecology"],
      querySeedZh: ["螞蟻 群體行為 生態角色"],
      querySeedEn: ["ant collective behavior ecology"],
    },
    diagnostics: {
      provider: "ollama",
      provider_status: "timeout",
      fallbackUsed: true,
      fallback_used: true,
    },
  } as TopicExpansionResponse;

  const cards = topicExpansionToTitleCards(result);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.title, "微小社會的巨大秩序：螞蟻群體分工與生態角色");
  assert.equal(cards[0]?.reason, "");
  assert.equal(cards[0]?.queryZh, undefined);
  assert.equal(cards[0]?.queryEn, undefined);
  assert.equal(cards[0]?.expectedEvidence, undefined);
  assert.equal(cards[0]?.sourceTypes, undefined);
});

test("legacy title templates are blocked from user-visible title cards", () => {
  assert.equal(hasLegacyVisibleTitleTemplate("螞蟻的科學定義與量測方法"), true);
  assert.equal(hasLegacyVisibleTitleTemplate("背景脈絡、主要類型與核心特徵"), true);
  assert.equal(hasLegacyVisibleTitleTemplate("微小社會的巨大秩序：螞蟻群體分工與生態角色"), false);
});
