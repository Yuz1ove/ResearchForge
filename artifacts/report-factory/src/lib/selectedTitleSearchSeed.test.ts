import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSelectedTitleSearchPayload,
  createSelectedTitleSearchSeed,
} from "./topicTitleEnhancement.ts";

test("selected title search seed keeps original topic, selected title, and hidden research plan", () => {
  const seed = createSelectedTitleSearchSeed(
    "泡泡實驗",
    "泡影中的科學：從液膜穩定性到薄膜干涉",
    {
      selectedTopicSeed: "泡泡實驗",
      possibleDomains: ["natural_science", "experiment_design"],
      querySeedZh: ["泡泡實驗 表面張力", "液膜 穩定性 薄膜干涉"],
      querySeedEn: ["bubble experiment surface tension", "thin film interference bubble"],
    },
  );

  assert.equal(seed.originalTopic, "泡泡實驗");
  assert.equal(seed.selectedTitle, "泡影中的科學：從液膜穩定性到薄膜干涉");
  assert.deepEqual(seed.hiddenResearchPlan?.querySeedZh, [
    "泡泡實驗 表面張力",
    "液膜 穩定性 薄膜干涉",
  ]);
  assert.deepEqual(seed.hiddenResearchPlan?.querySeedEn, [
    "bubble experiment surface tension",
    "thin film interference bubble",
  ]);
});

test("selected title search payload keeps display title separate from canonical search topic and query seeds", () => {
  const seed = createSelectedTitleSearchSeed(
    "泡泡實驗",
    "泡影中的科學：從液膜穩定性到薄膜干涉",
    {
      selectedTopicSeed: "泡泡實驗",
      possibleDomains: ["natural_science", "experiment_design"],
      displayTitle: "泡影中的科學：從液膜穩定性到薄膜干涉",
      canonicalTopicZh: "液膜穩定性與薄膜干涉",
      canonicalTopicEn: "thin film stability and interference",
      querySeedZh: ["泡泡實驗 表面張力", "液膜 穩定性 薄膜干涉"],
      querySeedEn: ["bubble experiment surface tension", "thin film interference bubble"],
      mustIncludeTerms: ["液膜", "薄膜干涉"],
      excludeTerms: ["玩具泡泡機"],
      domainHints: ["natural_science"],
      subtopics: [
        {
          id: "bubble-1",
          titleZh: "液膜穩定性",
          queryZh: ["液膜 穩定性"],
          queryEn: ["thin film stability"],
        },
      ],
      selectedResearchPlanId: "bubble-plan",
    },
  );

  const payload = buildSelectedTitleSearchPayload({ seed });

  assert.equal(payload.displayTitle, "泡影中的科學：從液膜穩定性到薄膜干涉");
  assert.equal(payload.canonicalTopicZh, "液膜穩定性與薄膜干涉");
  assert.equal(payload.canonicalTopicEn, "thin film stability and interference");
  assert.deepEqual(payload.querySeedZh, [
    "泡泡實驗 表面張力",
    "液膜 穩定性 薄膜干涉",
  ]);
  assert.deepEqual(payload.querySeedEn, [
    "bubble experiment surface tension",
    "thin film interference bubble",
  ]);
  assert.equal(payload.subtopics.length, 1);
  assert.deepEqual(payload.mustIncludeTerms, [
    "液膜",
    "薄膜干涉",
    "液膜穩定性與薄膜干涉",
    "泡泡實驗 表面張力",
    "液膜 穩定性 薄膜干涉",
    "bubble experiment surface tension",
    "thin film interference bubble",
  ]);
  assert.deepEqual(payload.excludeTerms, ["玩具泡泡機"]);
  assert.deepEqual(payload.domainHints, [
    "natural_science",
    "experiment_design",
  ]);
  assert.equal(payload.selectedResearchPlanId, "bubble-plan");
});
