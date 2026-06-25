import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import {
  buildRuleBasedSearchIntent,
  buildSearchIntentQueries,
  planSearchIntent,
  rerankSourcesBySearchIntent,
  searchIntentSources,
} from "./search-intent-planner";
import { understandTopic } from "@workspace/api-zod/topic-understanding";

const shortVideoTopic = "短影音使用對高中生注意力與睡眠品質之影響";
const urbanHeatTopic = "都市熱島效應對校園環境與學生學習舒適度之影響";
const dumplingTopic = "水餃";
const friesTopic = "薯條";
const colaPlainTopic = "可樂";
const colaHealthTopic = "可樂中的成分與攝取習慣對健康的影響";
const guineaPigTopic = "天竺鼠";
const bmwTopic = "BMW";
const classicalGuitarTopic = "古典吉他";
const waterBottleTopic = "水壺";
const eggTopic = "雞蛋";
const codTopic = "鱈魚";
const chickenThighTopic = "雞腿";
const dinosaurTopic = "恐龍";
const donQuixoteTopic = "唐吉柯德";
const smartphoneTopic = "手機";
const turtleTopic = "烏龜";
const helicopterTopic = "直升機";
const spinningTopTopic = "陀螺";
const guineaPigBiomedicalTopic = "天竺鼠作為實驗動物在醫學研究中的應用";
const llmWritingTopic = "大型語言模型對英文寫作學習的影響";
const climateCausesTopic = "「氣候變遷」的成因與現況分析";
const marineMicroplasticsTopic = "塑膠微粒對海洋生態的影響";
const spiderEcologyTopic = "蜘蛛的棲地需求與生存策略";
const spiderHabitatTopic = "蜘蛛與其棲地相關研究";

function sourceRecord(
  patch: Partial<SourceRecord> & { title: string },
): SourceRecord {
  return {
    id: patch.id ?? `title:Crossref:${patch.title.toLowerCase()}`,
    title: patch.title,
    authors: patch.authors ?? [],
    year: patch.year ?? 2023,
    abstract: patch.abstract ?? null,
    doi: patch.doi ?? null,
    url: patch.url ?? null,
    sourceType: patch.sourceType ?? "Crossref",
    reviewState: patch.reviewState ?? "pending",
    publisher: patch.publisher ?? null,
    containerTitle: patch.containerTitle ?? null,
    accessedAt: patch.accessedAt ?? null,
  };
}

test("rule fallback returns digital media, sleep, and attention concepts for short video topics", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: shortVideoTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });

  for (const concept of [
    "short-form video",
    "social media",
    "digital media use",
    "sleep quality",
    "attention",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  assert.ok(
    plan.englishQueries.some((query) => query.includes("short-form video")),
  );
  assert.ok(plan.chineseQueries.some((query) => query.includes("短影音")));
  assert.equal(plan.plannerStatus, "rule_fallback");
  assert.equal(plan.fallbackUsed, true);
});

test("topic understanding classifies guinea pig, fries, and bubble before search planning", () => {
  const guineaPig = understandTopic(guineaPigTopic);
  const fries = understandTopic(friesTopic);
  const bubble = understandTopic("泡泡");

  assert.equal(guineaPig.topicKind, "known_entity");
  assert.equal(guineaPig.needsClarification, true);
  assert.ok(guineaPig.entity?.englishNames.includes("guinea pig"));
  assert.ok(guineaPig.entity?.scientificNames?.includes("Cavia porcellus"));
  assert.match(JSON.stringify(guineaPig), /實驗動物|飼養健康|動物行為/);

  assert.equal(fries.entity?.category, "food");
  assert.equal(fries.needsClarification, true);
  assert.match(JSON.stringify(fries), /食品安全|營養標示|飲食行為/);
  assert.match(JSON.stringify(fries), /french fries|acrylamide/);

  assert.equal(bubble.needsClarification, true);
  assert.match(JSON.stringify(bubble), /表面張力|光學干涉|幼兒學習|材料應用/);
  assert.match(JSON.stringify(bubble), /surface tension|soap bubble/);
});

test("topic understanding gives phone turtle helicopter and spinning top domain-aware research angles", () => {
  const smartphone = understandTopic(smartphoneTopic);
  const turtle = understandTopic(turtleTopic);
  const helicopter = understandTopic(helicopterTopic);
  const spinningTop = understandTopic(spinningTopTopic);

  assert.equal(smartphone.topicKind, "known_entity");
  assert.equal(smartphone.domain, "social_science");
  assert.equal(smartphone.needsClarification, true);
  assert.match(JSON.stringify(smartphone), /睡眠品質|手機成癮|交通安全|行動學習|smartphone addiction/i);
  assert.doesNotMatch(JSON.stringify(smartphone), /definition scope evidence|measurable indicators/i);

  assert.equal(turtle.entity?.category, "animal");
  assert.equal(turtle.domain, "biology");
  assert.match(JSON.stringify(turtle), /棲地保育|外來種|塑膠污染|sea turtle|red-eared slider/i);
  assert.doesNotMatch(JSON.stringify(turtle), /definition scope evidence|measurable indicators/i);

  assert.equal(helicopter.entity?.category, "technology");
  assert.equal(helicopter.domain, "technology");
  assert.match(JSON.stringify(helicopter), /空氣動力學|緊急醫療|噪音污染|rotorcraft|air ambulance/i);
  assert.doesNotMatch(JSON.stringify(helicopter), /definition scope evidence|measurable indicators/i);

  assert.equal(spinningTop.entity?.category, "technology");
  assert.equal(spinningTop.domain, "technology");
  assert.equal(spinningTop.needsClarification, true);
  assert.match(JSON.stringify(spinningTop), /角動量|進動|陀螺儀|MEMS|民俗遊戲|spinning top|gyroscope/i);
  assert.doesNotMatch(JSON.stringify(spinningTop), /definition scope evidence|measurable indicators/i);
});

test("selected spinning top research angle stays focused instead of falling back to generic entity branches", () => {
  const selectedTopic = "陀螺的角動量、扭矩與旋轉穩定性原理";
  const understanding = understandTopic(selectedTopic);
  const contentText = JSON.stringify({
    normalizedTopic: understanding.normalizedTopic,
    topicKind: understanding.topicKind,
    researchAngles: understanding.researchAngles,
    searchQueries: understanding.searchQueries,
  });

  assert.equal(understanding.topicKind, "specific_research_topic");
  assert.equal(understanding.normalizedTopic, selectedTopic);
  assert.equal(understanding.needsClarification, false);
  assert.match(contentText, /角動量|扭矩|旋轉穩定性|進動|spinning top angular momentum|gyroscopic stability torque|rotational dynamics spinning top|precession of spinning top physics/i);
  assert.doesNotMatch(contentText, /MEMS|smartphone drone|folk game|children's play/i);
});

test("rule fallback gives spinning top bilingual search intent instead of generic evidence-template queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spinningTopTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const english = plan.englishQueries.join(" ");
  const chinese = plan.chineseQueries.join(" ");

  assert.match(english, /spinning top|gyroscope|MEMS|attitude control/i);
  assert.match(chinese, /角動量|陀螺儀|民俗遊戲|STEM/);
  assert.doesNotMatch(english, /definition scope evidence|measurable indicators|case study dataset/i);
});

test("topic understanding creates bilingual canonical concept and queries for rare technical Chinese terms", () => {
  const thixotropy = understandTopic("觸變性");

  assert.equal(thixotropy.topicKind, "broad_common_noun");
  assert.equal(thixotropy.canonicalEnglishTopic, "thixotropy");
  assert.equal(thixotropy.domain, "materials_design");
  assert.ok(thixotropy.coreConcepts.some((concept) => /thixotropy/i.test(concept)));
  assert.ok(thixotropy.searchQueries.en.some((query) => /thixotropy/i.test(query)));
  assert.doesNotMatch(
    thixotropy.searchQueries.en.join(" "),
    /觸變性 definition scope evidence/i,
  );
});

test("topic understanding rejects ascii garbage before planning fake cards", () => {
  const invalid = understandTopic("hoeo2f2");

  assert.equal(invalid.topicKind, "unknown_or_noise");
  assert.equal(invalid.canonicalEnglishTopic, "");
  assert.deepEqual(invalid.searchQueries.en, []);
  assert.deepEqual(invalid.searchQueries.zh, []);
});

test("topic understanding resolves short entities into domain-specific research angles", () => {
  const cases = [
    {
      topic: bmwTopic,
      topicKind: "brand_or_product",
      domain: "automotive_business",
      expected: /電動化策略|品牌定位|永續製造|BMW electric vehicle/i,
    },
    {
      topic: classicalGuitarTopic,
      topicKind: "cultural_artifact",
      domain: "music_culture",
      expected: /音色與結構|教育與練習|文化史|classical guitar/i,
    },
    {
      topic: waterBottleTopic,
      topicKind: "broad_common_noun",
      domain: "household_safety",
      expected: /材料安全|重複使用與衛生|環境效益|water bottle/i,
    },
    {
      topic: eggTopic,
      topicKind: "broad_common_noun",
      domain: "food_nutrition",
      expected: /營養價值|食品安全|生產與價格|egg nutrition/i,
    },
  ];

  for (const item of cases) {
    const understanding = understandTopic(item.topic);
    const text = JSON.stringify(understanding);
    assert.equal(understanding.topicKind, item.topicKind);
    assert.equal(understanding.domain, item.domain);
    assert.equal(understanding.needsClarification, true);
    assert.equal(understanding.shouldSearchNow, false);
    assert.ok(understanding.researchAngles.length >= 3);
    assert.match(text, item.expected);
    assert.doesNotMatch(
      text,
      /research direction|research question|searchable topic|academic research/i,
    );
  }
});

test("topic understanding keeps Don Quixote in literature without cod-fish drift", () => {
  const understanding = understandTopic(donQuixoteTopic);
  const contentText = JSON.stringify({
    normalizedTopic: understanding.normalizedTopic,
    researchAngles: understanding.researchAngles,
    clarificationCards: understanding.clarificationCards,
  });

  assert.equal(understanding.needsClarification, true);
  assert.match(
    contentText,
    /唐吉訶德|唐吉柯德|Don Quixote|Cervantes|騎士小說|西班牙黃金時代/i,
  );
  assert.doesNotMatch(contentText, /cod fish|omega-3|DHA|EPA|fatty acid|seafood/i);
});

test("rule fallback builds topic-specific query plans for cod chicken thigh dinosaur and Don Quixote", () => {
  const cases = [
    {
      topic: codTopic,
      expected: /Atlantic cod|Gadus morhua|omega-3|DHA|EPA|sustainable fisheries|seafood safety/i,
      unexpected: /digital media|eye strain|breakfast cereal|maize/i,
    },
    {
      topic: chickenThighTopic,
      expected: /chicken thigh|chicken leg|poultry|Salmonella|food safety|fat content/i,
      unexpected: /digital media|eye strain|breakfast cereal|maize|plant-based protein/i,
    },
    {
      topic: dinosaurTopic,
      expected: /paleontology|fossil record|Mesozoic|Cretaceous|bird evolution|非鳥類恐龍/i,
      unexpected: /nutrition|DHA|EPA|seafood/i,
    },
    {
      topic: donQuixoteTopic,
      expected: /Don Quixote|Cervantes|騎士小說|理想與現實|西班牙黃金時代/i,
      unexpected: /cod fish|omega-3|DHA|EPA|seafood/i,
    },
  ] as const;

  for (const item of cases) {
    const plan = buildRuleBasedSearchIntent({
      topic: item.topic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    });
    const queries = buildSearchIntentQueries(plan);
    const text = [
      plan.normalizedTopic,
      ...plan.primaryConcepts,
      ...plan.mustHaveTerms,
      ...queries.highPrecision,
      ...queries.english,
      ...queries.chinese,
      ...queries.broad,
    ].join(" ");

    assert.match(text, item.expected);
    assert.doesNotMatch(text, item.unexpected);
  }
});

test("rule fallback builds topic-specific query plans for phone turtle and helicopter", () => {
  const cases = [
    {
      topic: smartphoneTopic,
      expected: /smartphone addiction|sleep quality|traffic safety|mobile learning|青少年/i,
      unexpected: /definition scope evidence|measurable indicators|case study dataset/i,
    },
    {
      topic: turtleTopic,
      expected: /turtle habitat|sea turtle|invasive turtle|plastic pollution|保育/i,
      unexpected: /definition scope evidence|measurable indicators|case study dataset/i,
    },
    {
      topic: helicopterTopic,
      expected: /helicopter aerodynamics|air ambulance|noise pollution|safety management|旋翼/i,
      unexpected: /definition scope evidence|measurable indicators|case study dataset/i,
    },
  ] as const;

  for (const item of cases) {
    const plan = buildRuleBasedSearchIntent({
      topic: item.topic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    });
    const queries = buildSearchIntentQueries(plan);
    const text = [
      plan.normalizedTopic,
      ...plan.primaryConcepts,
      ...plan.mustHaveTerms,
      ...queries.highPrecision,
      ...queries.english,
      ...queries.chinese,
    ].join(" ");

    assert.match(text, item.expected);
    assert.doesNotMatch(text, item.unexpected);
  }
});

test("rule fallback uses topic understanding angles for short topics without generic template terms", () => {
  for (const topic of [
    bmwTopic,
    classicalGuitarTopic,
    waterBottleTopic,
    eggTopic,
    guineaPigTopic,
  ]) {
    const plan = buildRuleBasedSearchIntent({
      topic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    });
    const text = [
      plan.normalizedTopic,
      plan.topicType,
      ...plan.primaryConcepts,
      ...plan.contextConcepts,
      ...plan.outcomeConcepts,
      ...plan.mustHaveTerms,
      ...plan.chineseQueries,
      ...plan.englishQueries,
      ...(plan.narrowedResearchQuestions ?? []).flatMap((question) => [
        question.title,
        question.zhKeywords.join(" "),
        question.enKeywords.join(" "),
        question.primaryQueries.join(" "),
      ]),
    ].join(" ");

    assert.equal(plan.topicUnderstanding?.needsClarification, true);
    assert.ok(plan.narrowedResearchQuestions?.length);
    assert.doesNotMatch(
      text,
      /research direction|research question|searchable topic|academic research/i,
    );
  }
});

test("rule fallback keeps cola health core concepts ahead of generic education terms", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: colaHealthTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const allQueries = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ];

  for (const concept of [
    "cola",
    "soft drink",
    "sugar-sweetened beverage",
    "含糖飲料",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["sugar", "caffeine", "health"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.outcomeConcepts.includes("咖啡因"));
  assert.ok(plan.penaltyTerms.includes("成人高考"));
  assert.ok(
    allQueries.some((query) => /cola|soft drink|sugar-sweetened/i.test(query)),
  );
  assert.ok(
    !allQueries.some((query) =>
      /education students peer reviewed research/i.test(query),
    ),
    "generic education query should not be generated",
  );
});

test("rule fallback turns LLM English writing learning into education and writing queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: llmWritingTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");

  assert.equal(plan.topicType, "ai_language_learning");
  assert.match(queryText, /large language models English writing learning/i);
  assert.match(queryText, /LLM education English writing feedback/i);
  assert.match(queryText, /generative AI second language writing/i);
  assert.match(queryText, /大型語言模型 英文寫作學習/);
  assert.ok(plan.penaltyTerms.includes("software engineering"));
  assert.ok(!/大型語言模型對英文寫作學習的影響 peer reviewed research/i.test(queryText));
});

test("rule fallback turns marine microplastics into ecological search queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: marineMicroplasticsTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
    ...(plan.narrowedResearchQuestions ?? []).flatMap((question) => [
      question.title,
      question.zhKeywords.join(" "),
      question.enKeywords.join(" "),
      question.primaryQueries.join(" "),
    ]),
  ].join(" ");

  assert.equal(plan.topicType, "marine_microplastics_ecology");
  for (const term of [
    "microplastics",
    "plastic pollution",
    "marine ecosystem",
    "海洋生態",
  ]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected ${term}`);
  }
  for (const term of ["microplastic", "marine", "ocean", "塑膠微粒", "海洋"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.match(queryText, /microplastics marine ecosystem ecological effects/i);
  assert.match(queryText, /microplastics marine organisms ingestion toxicity/i);
  assert.match(queryText, /plastic pollution marine food web bioaccumulation/i);
  assert.match(queryText, /微塑膠 海洋生態 影響/);
  assert.ok(plan.penaltyTerms.includes("熱環境"));
  assert.ok(!/塑膠微粒對海洋生態的影響 peer reviewed research/i.test(queryText));
});

test("rule fallback turns dumpling into a research-ready query planner without climate drift", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: dumplingTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");
  const questionText = (plan.narrowedResearchQuestions ?? [])
    .map((question) =>
      [
        question.title,
        question.researchAngle,
        question.zhKeywords.join(" "),
        question.enKeywords.join(" "),
        question.primaryQueries.join(" "),
      ].join(" "),
    )
    .join("\n");

  assert.equal(plan.topicType, "food_nutrition_and_culture");
  for (const term of ["水餃", "餃子", "冷凍水餃"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected ${term}`);
  }
  assert.ok(plan.mustHaveTerms.includes("sodium"));
  assert.ok(plan.mustHaveTerms.includes("食品標示"));
  assert.match(questionText, /鈉含量|營養標示|食品標示/);
  assert.match(questionText, /dumpling|frozen dumpling/i);
  assert.ok(!/生活連結|資料策略/.test(questionText));
  assert.ok(!/climate change|carbon dioxide|greenhouse gas/i.test(queryText));
});

test("rule fallback turns french fries into nutrition and food-safety search plans", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: friesTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");
  const questionText = (plan.narrowedResearchQuestions ?? [])
    .map((question) =>
      [
        question.title,
        question.researchAngle,
        question.zhKeywords.join(" "),
        question.enKeywords.join(" "),
        question.primaryQueries.join(" "),
      ].join(" "),
    )
    .join("\n");

  assert.equal(plan.topicType, "food_nutrition_and_safety");
  for (const term of ["薯條", "炸薯條", "french fries"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected ${term}`);
  }
  assert.ok(plan.mustHaveTerms.includes("acrylamide"));
  assert.ok(plan.mustHaveTerms.includes("丙烯醯胺"));
  assert.match(questionText, /營養成分|鈉含量|食品安全|飲食習慣/);
  assert.match(questionText, /french fries|fast food|acrylamide/i);
  assert.ok(!/academic research evidence|computer chip|semiconductor/i.test(queryText));
});

test("rule fallback turns plain cola into concrete research queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: colaPlainTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const text = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...(plan.narrowedResearchQuestions ?? []).flatMap((question) => [
      question.title,
      question.zhKeywords.join(" "),
      question.enKeywords.join(" "),
      question.primaryQueries.join(" "),
    ]),
  ].join(" ");

  assert.equal(plan.topicType, "beverage_health_and_consumption");
  for (const term of ["可樂", "含糖飲料", "糖分", "咖啡因"]) {
    assert.ok(text.includes(term), `expected ${term}`);
  }
  assert.match(text, /cola|soft drink|sugar intake|diet cola/i);
  assert.match(text, /青少年健康|成分比較|包裝|廣告/);
  assert.ok(!/\bcoal\b|coke fuel/i.test(queries.english.join(" ")));
});

test("rule fallback understands bare guinea pig as known entity requiring clarification", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: guineaPigTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const text = [
    plan.normalizedTopic,
    ...plan.primaryConcepts,
    ...plan.mustHaveTerms,
    ...plan.englishQueries,
    ...(plan.narrowedResearchQuestions ?? []).flatMap((question) => [
      question.title,
      question.zhKeywords.join(" "),
      question.enKeywords.join(" "),
      question.primaryQueries.join(" "),
    ]),
  ].join(" ");

  assert.equal(plan.topicUnderstanding?.topicKind, "known_entity");
  assert.equal(plan.topicUnderstanding?.needsClarification, true);
  assert.match(text, /guinea pig|Cavia porcellus/i);
  assert.match(text, /實驗動物|飼養環境|社會行為/);
  assert.ok(plan.excludedDriftTerms?.includes("India"));
  assert.ok(plan.excludedDriftTerms?.includes("Buddhism"));
});

test("rule fallback lets specific guinea pig topics search with English and scientific names", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: guineaPigBiomedicalTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");

  assert.equal(plan.topicUnderstanding?.topicKind, "specific_research_topic");
  assert.equal(plan.topicUnderstanding?.needsClarification, false);
  assert.match(queryText, /guinea pig|Cavia porcellus/i);
  assert.ok(plan.mustHaveTerms.includes("guinea pig"));
  assert.ok(plan.mustHaveTerms.includes("Cavia porcellus"));
  assert.ok(plan.penaltyTerms.includes("India"));
  assert.ok(!/Tang dynasty|Buddhism/.test(queryText));
});

test("applying a research angle produces search-ready queries", () => {
  for (const baseTopic of [bmwTopic, classicalGuitarTopic, waterBottleTopic, eggTopic]) {
    const understanding = understandTopic(baseTopic);
    const suggestedTopic = understanding.clarificationCards[0]?.suggestedTopic;
    assert.ok(suggestedTopic, `expected suggested topic for ${baseTopic}`);

    const plan = buildRuleBasedSearchIntent({
      topic: suggestedTopic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    });
    const queryText = [
      ...plan.chineseQueries,
      ...plan.englishQueries,
      ...(plan.narrowedResearchQuestions ?? []).flatMap((question) => [
        question.title,
        question.zhKeywords.join(" "),
        question.enKeywords.join(" "),
        question.primaryQueries.join(" "),
      ]),
    ].join(" ");

    assert.equal(plan.topicUnderstanding?.needsClarification, false);
    assert.ok(plan.chineseQueries.length > 0 || plan.englishQueries.length > 0);
    assert.doesNotMatch(
      queryText,
      /research direction|research question|searchable topic|academic research/i,
    );
  }
});

test("applying the spinning top mechanics angle makes source-search queries follow the selected expansion topic", () => {
  const selectedTopic = "陀螺的角動量、扭矩與旋轉穩定性原理";
  const plan = buildRuleBasedSearchIntent({
    topic: selectedTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");

  assert.equal(plan.topicUnderstanding?.normalizedTopic, selectedTopic);
  assert.equal(plan.topicUnderstanding?.topicKind, "specific_research_topic");
  assert.deepEqual(queries.coreConcepts, [
    "spinning top",
    "angular momentum",
    "torque",
    "rotational stability",
    "gyroscopic precession",
    "rigid body dynamics",
    "Euler equations",
    "Lagrange top",
  ]);
  assert.ok(
    queries.coreEnglishAcademic.includes(
      "spinning top angular momentum torque rotational stability",
    ),
  );
  assert.ok(
    queries.academicSynonyms.includes(
      "gyroscopic precession torque angular momentum",
    ),
  );
  assert.ok(
    queries.education.includes(
      "spinning top physics angular momentum explanation",
    ),
  );
  assert.ok(queries.chineseSupplemental.includes("陀螺 角動量 扭矩 進動"));
  assert.ok(queries.fallbackRelaxed.includes("Lagrange top"));
  assert.ok(
    queries.phases.some(
      (phase) =>
        phase.stage === "fallback_relaxed" &&
        phase.queries.includes("Lagrange top"),
    ),
  );
  assert.ok(
    !queries.english.includes(selectedTopic) &&
      !queries.chinese.includes(selectedTopic),
  );
  assert.match(queryText, /spinning top angular momentum/i);
  assert.match(queryText, /gyroscopic stability torque/i);
  assert.match(queryText, /rotational dynamics spinning top|precession of spinning top physics/i);
  assert.match(queryText, /陀螺 角動量 扭矩 旋轉穩定性|陀螺 進動 旋轉力學 物理/i);
  assert.doesNotMatch(queryText, /MEMS gyroscope smartphone drone|folk game|children's play/i);
});

test("BMW EV transition topic expands into product and supply-chain English queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: "BMW 在電動車轉型中的產品與供應鏈策略",
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");

  assert.equal(plan.topicUnderstanding?.needsClarification, false);
  assert.match(queryText, /BMW electric vehicle transition supply chain strategy/i);
  assert.match(queryText, /BMW EV strategy battery supply chain/i);
  assert.match(queryText, /BMW electric vehicle product strategy/i);
  assert.match(queryText, /BMW Neue Klasse supply chain strategy/i);
});

test("rule fallback keeps climate change cause concepts in every main query family", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: climateCausesTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
  ].join(" ");

  for (const concept of [
    "climate change",
    "global warming",
    "greenhouse gas",
    "溫室氣體",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["fossil fuel", "化石燃料", "emissions", "排放"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.contextConcepts.includes("land use"));
  assert.ok(plan.outcomeConcepts.includes("observed warming"));
  assert.ok(plan.mustHaveTerms.includes("CO2 concentration"));
  assert.ok(plan.penaltyTerms.includes("北京話"));
  assert.match(queryText, /climate change|氣候變遷/);
  assert.match(queryText, /greenhouse gas|溫室氣體/);
  assert.match(queryText, /fossil fuel|化石燃料/);
  assert.match(queryText, /observed warming|CO2 concentration|IPCC/);
  assert.ok(!/education students peer reviewed research/i.test(queryText));
});

test("rule fallback keeps spider ecology queries anchored to spider, habitat, and survival", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spiderEcologyTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
  ].join(" ");

  for (const concept of ["spider", "arachnid", "蜘蛛", "habitat", "ecology"]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const term of ["spider", "habitat", "棲地", "生態"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.ok(plan.outcomeConcepts.includes("survival strategies"));
  assert.ok(plan.contextConcepts.includes("habitat selection"));
  assert.ok(plan.penaltyTerms.includes("國家安全教育"));
  assert.match(queryText, /spider|蜘蛛/);
  assert.match(queryText, /habitat|棲地/);
  assert.match(queryText, /survival|生存|ecology|生態/);
  assert.ok(
    !/高中教育|education students peer reviewed research/i.test(queryText),
  );
});

test("rule fallback turns egg nutrition protein quality into precise bilingual queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: "雞蛋的營養成分、蛋白質品質與胺基酸組成之研究",
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const queryText = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].join(" ");

  assert.equal(plan.topicType, "egg_nutrition_protein_quality");
  for (const term of ["egg", "egg white", "egg yolk", "albumen", "yolk", "雞蛋", "蛋白", "蛋黃"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected ${term}`);
  }
  for (const term of ["protein quality", "amino acid profile", "digestibility", "biological value", "胺基酸"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
  assert.match(queryText, /egg nutrition protein quality/i);
  assert.match(queryText, /egg protein amino acid profile/i);
  assert.match(queryText, /chicken egg nutritional composition/i);
  assert.match(queryText, /egg white protein digestibility/i);
  assert.match(queryText, /albumen amino acid composition/i);
  assert.match(queryText, /雞蛋 營養成分 蛋白質品質/);
  assert.match(queryText, /雞蛋 胺基酸組成/);
  const allQueries = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ].map((query) => query.trim().toLowerCase());
  for (const forbidden of ["egg", "protein", "value", "nutrition"]) {
    assert.equal(allQueries.includes(forbidden), false, `forbidden broad query ${forbidden}`);
  }
  for (const drift of ["basketball", "baseball", "volleyball", "climate", "airplane", "籃球", "氣候", "飛機"]) {
    assert.ok(plan.penaltyTerms.includes(drift), `expected drift ${drift}`);
  }
});

test("rule fallback expands broad spider habitat topics into multiple English academic queries", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spiderHabitatTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const allQueries = [
    ...queries.highPrecision,
    ...queries.english,
    ...queries.chinese,
    ...queries.broad,
  ];

  for (const query of [
    "spider habitat",
    "spider ecology",
    "spider habitat selection",
  ]) {
    assert.ok(allQueries.some((item) => item.includes(query)), `expected ${query}`);
  }
  for (const term of ["spider", "arachnid", "蜘蛛"]) {
    assert.ok(plan.primaryConcepts.includes(term), `expected subject ${term}`);
  }
  for (const term of ["habitat", "ecology", "棲地"]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected concept ${term}`);
  }
  for (const drift of ["圖書館推廣", "招生策略", "教育策略"]) {
    assert.ok(plan.penaltyTerms.includes(drift), `expected drift term ${drift}`);
  }
});

test("rule fallback weights urban heat island, thermal comfort, and microclimate over generic learning terms", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });

  for (const concept of [
    "urban heat island",
    "thermal comfort",
    "microclimate",
    "heat stress",
  ]) {
    assert.ok(plan.primaryConcepts.includes(concept), `expected ${concept}`);
  }
  for (const context of [
    "campus",
    "school environment",
    "educational buildings",
    "schoolyard",
  ]) {
    assert.ok(plan.contextConcepts.includes(context), `expected ${context}`);
  }
  for (const term of ["students", "learning", "education"]) {
    assert.ok(
      plan.lowWeightTerms.includes(term),
      `expected low-weight ${term}`,
    );
  }
  for (const term of [
    "heat",
    "thermal",
    "temperature",
    "microclimate",
    "urban heat island",
    "UHI",
  ]) {
    assert.ok(plan.mustHaveTerms.includes(term), `expected must-have ${term}`);
  }
});

test("LLM planner falls back on provider failure, invalid JSON, and quota-style HTTP responses", async () => {
  const invalidJson = await planSearchIntent(
    { topic: urbanHeatTopic, language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test",
        timeoutMs: 50,
      },
      fetchImpl: async () => new Response("not json", { status: 200 }),
    },
  );
  assert.equal(invalidJson.fallbackUsed, true);
  assert.equal(invalidJson.plannerStatus, "rule_fallback");

  for (const status of [403, 429, 502]) {
    const plan = await planSearchIntent(
      { topic: urbanHeatTopic, language: "zh-TW" },
      {
        llm: {
          apiKey: "test-key",
          baseUrl: "https://llm.example/v1",
          model: "test",
          timeoutMs: 50,
        },
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: {
                code: status === 429 ? "DAILY_LIMIT_EXCEEDED" : "FAILED",
              },
            }),
            { status },
          ),
      },
    );

    assert.equal(plan.fallbackUsed, true, `expected fallback for ${status}`);
    assert.equal(plan.plannerStatus, "rule_fallback");
    assert.ok(
      plan.reasoningNotes.some((note) =>
        note.includes("Search intent planner fallback"),
      ),
    );
  }
});

test("LLM planner falls back on empty model message content", async () => {
  const plan = await planSearchIntent(
    { topic: friesTopic, language: "zh-TW" },
    {
      llm: {
        apiKey: "test-key",
        baseUrl: "https://llm.example/v1",
        model: "test",
        timeoutMs: 50,
      },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "" } }],
          }),
          { status: 200 },
        ),
    },
  );

  assert.equal(plan.fallbackUsed, true);
  assert.equal(plan.plannerStatus, "rule_fallback");
  assert.equal(plan.topicType, "food_nutrition_and_safety");
  assert.ok(
    plan.englishQueries.some((query) => /french fries/i.test(query)),
  );
});

test("urban heat query generation prioritizes thermal and campus concepts over generic learning performance", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    language: "zh-TW",
  });
  const queries = buildSearchIntentQueries(plan);
  const english = queries.english.join(" ");

  for (const term of [
    "urban heat island",
    "campus",
    "thermal comfort",
    "microclimate",
    "school environment",
  ]) {
    assert.match(english, new RegExp(term.replace(/\s+/g, "\\s+"), "i"));
  }

  assert.ok(!/students learning performance/i.test(english));
  assert.ok(!/education achievement/i.test(english));
  assert.ok(!/academic performance/i.test(english));
});

test("reranking promotes campus thermal comfort over generic student learning results", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: urbanHeatTopic,
    language: "zh-TW",
  });
  const sources = [
    sourceRecord({
      id: "generic-learning",
      title: "Student learning performance in secondary education",
      abstract:
        "This study examines academic performance and school satisfaction.",
    }),
    sourceRecord({
      id: "thermal-comfort",
      title:
        "Urban heat island effects on campus thermal comfort and microclimate",
      abstract:
        "Campus temperature, outdoor thermal comfort, and heat stress are measured in school environments.",
      doi: "10.1000/uhi-campus",
    }),
    sourceRecord({
      id: "school-satisfaction",
      title: "School satisfaction and student comfort",
      abstract:
        "A survey about students, learning, and school satisfaction without heat environment measurements.",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(
    sources,
    plan,
  );
  assert.equal(ranked[0]?.id, "thermal-comfort");
  const genericDebug = relevanceDebug.find(
    (item) => item.sourceId === "generic-learning",
  );
  const schoolDebug = relevanceDebug.find(
    (item) => item.sourceId === "school-satisfaction",
  );
  assert.ok(genericDebug?.penalties.includes("missing_must_have_terms"));
  assert.ok(
    genericDebug?.penalties.includes(
      "urban_heat_without_heat_or_thermal_terms",
    ),
  );
  assert.ok((schoolDebug?.score ?? 0) < (relevanceDebug[0]?.score ?? 0));
});

test("climate reranking promotes direct evidence snippets over metadata-only climate matches", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: climateCausesTopic,
    language: "zh-TW",
  });
  const sources = [
    sourceRecord({
      id: "metadata-title",
      title:
        "Climate change causes greenhouse gas emissions and observed warming",
      abstract: null,
      doi: "10.1000/metadata-title",
    }),
    sourceRecord({
      id: "policy-committee",
      title: "Climate change policy committee governance",
      abstract:
        "This article discusses climate change policy, committee governance, and institutional response functions without emissions or observed climate indicator evidence.",
    }),
    sourceRecord({
      id: "direct-evidence",
      title:
        "Observed climate change and anthropogenic greenhouse gas emissions",
      abstract:
        "Human activities, principally through greenhouse gas emissions from fossil fuel combustion, have caused global warming. Observed warming is reflected in global temperature trends and CO2 concentration.",
      doi: "10.1000/direct-climate",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(
    sources,
    plan,
  );
  const metadataDebug = relevanceDebug.find(
    (item) => item.sourceId === "metadata-title",
  );
  const directDebug = relevanceDebug.find(
    (item) => item.sourceId === "direct-evidence",
  );

  assert.equal(ranked[0]?.id, "direct-evidence");
  assert.ok(metadataDebug?.penalties.includes("metadata_only"));
  assert.ok(metadataDebug?.penalties.includes("no_direct_evidence_snippet"));
  assert.ok(!directDebug?.penalties.includes("no_direct_evidence_snippet"));
});

test("dumpling relevance gate rejects trusted climate sources as off topic", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: dumplingTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "ipcc-climate",
        title: "AR6 Synthesis Report: Climate Change 2023",
        abstract:
          "Greenhouse gas emissions, global warming, carbon dioxide concentrations, and global temperature changes are assessed by the IPCC.",
        doi: "10.1000/ipcc-climate",
        url: "https://www.ipcc.ch/report/ar6/syr/",
        publisher: "IPCC",
      }),
    ],
    plan,
  );
  const source = sources[0];

  assert.ok(source);
  assert.ok((source.relevanceScore ?? 100) < 30);
  assert.equal(source.classification, "trusted_but_off_topic");
  assert.equal(source.rejectReason, "trusted_source_but_topic_mismatch");
  assert.equal(source.shouldShowInMainList, false);
  assert.equal(source.shouldRecommendAccept, false);
  assert.equal(source.reviewState, "rejected");
});

test("dumpling relevance gate keeps relevant nutrition and labeling sources", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: dumplingTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "dumpling-sodium",
        title: "Sodium content and nutrition labeling of frozen dumplings",
        abstract:
          "This study compares frozen dumpling nutrition facts, sodium content, calories, protein, fat, and food labeling information for commercially available dumplings and jiaozi products.",
        doi: "10.1000/dumpling-sodium",
        url: "https://doi.org/10.1000/dumpling-sodium",
        publisher: "Journal of Food Nutrition",
      }),
    ],
    plan,
  );
  const source = sources[0];

  assert.ok(source);
  assert.ok((source.relevanceScore ?? 0) >= 30);
  assert.ok(source.classification === "primary" || source.classification === "review");
  assert.notEqual(source.reviewState, "rejected");
  assert.ok(source.matchedTerms?.some((term) => /dumpling|sodium|nutrition/i.test(term)));
});

test("secondary candidates stay available for preliminary reports but out of the main list", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: friesTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "fries-secondary",
        title:
          "French fries nutrition sodium calories fat and acrylamide in fast food dietary surveys",
        abstract:
          "French fries are discussed in fast-food dietary surveys.",
        doi: "10.1000/fries-secondary",
        url: "https://doi.org/10.1000/fries-secondary",
        publisher: "Journal of Public Health Nutrition",
      }),
    ],
    plan,
  );
  const source = sources[0];

  assert.ok(source);
  assert.notEqual(source.relevanceLevel, "off_topic");
  assert.notEqual(source.classification, "off_topic");
  assert.notEqual(source.reviewState, "rejected");
  assert.equal(source.shouldShowInMainList, false);
  assert.equal(source.shouldRecommendAccept, true);
});

test("ranking prefers high relevance and source quality before recency", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: llmWritingTopic,
    language: "zh-TW",
  });
  const { sources } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "newer-weak",
        title: "Generative AI writing tools commentary",
        abstract:
          "This commentary mentions generative AI and writing tools but provides limited education evidence and no empirical details.",
        year: 2025,
        doi: null,
        authors: [],
        sourceQualityScore: 35,
        citationCount: 0,
      }),
      sourceRecord({
        id: "strong-evidence",
        title: "Large language models and English writing feedback in EFL learning",
        abstract:
          "Large language models are used in English writing learning to provide writing feedback, revision support, and second language writing instruction evidence for EFL learners.",
        year: 2022,
        doi: "10.1000/llm-writing-feedback",
        authors: ["Ada Lovelace"],
        containerTitle: "Journal of Language Education",
        sourceQualityScore: 95,
        citationCount: 128,
      }),
    ],
    plan,
  );

  assert.equal(sources[0]?.id, "strong-evidence");
  assert.equal(sources[0]?.sourceQualityScore, 100);
  assert.equal(sources[0]?.finalScore, Math.round((sources[0]?.relevanceScore ?? 0) * 0.6 + 100 * 0.4));
  assert.ok((sources[0]?.finalScore ?? 0) > (sources[1]?.finalScore ?? 0));
});

test("AI learning reranking prefers secondary education over higher education drift", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: "AI 對高中生學習成效",
    language: "zh-TW",
  });
  const { sources, relevanceDebug } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "higher-education-ai",
        title: "Students' voices on generative AI in higher education",
        abstract:
          "This study explores university students' perceptions of generative AI in higher education, including learning outcomes, engagement, and academic achievement.",
        year: 2023,
        doi: "10.1000/higher-education-ai",
        authors: ["Higher Education Researcher"],
        containerTitle: "International Journal of Educational Technology",
        sourceQualityScore: 100,
        citationCount: 300,
      }),
      sourceRecord({
        id: "secondary-ai-learning",
        title: "Artificial intelligence tutoring for high school students' learning outcomes",
        abstract:
          "Artificial intelligence tutoring systems in secondary education are evaluated with high school students, measuring learning outcomes, academic achievement, engagement, and learning performance.",
        year: 2022,
        doi: "10.1000/secondary-ai-learning",
        authors: ["Secondary Education Researcher"],
        containerTitle: "Computers and Education",
        sourceQualityScore: 95,
        citationCount: 120,
      }),
    ],
    plan,
  );

  assert.equal(sources[0]?.id, "secondary-ai-learning");
  assert.equal(sources[0]?.relevanceLevel, "primary");
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "higher-education-ai")
      ?.penalties.some((penalty) =>
        penalty.startsWith("higher_education_without_secondary_context"),
      ),
  );
});

test("marine microplastics reranking promotes marine ecology over unrelated heat or sports sources", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: marineMicroplasticsTopic,
    language: "zh-TW",
  });
  const { sources, relevanceDebug } = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "thermal-comfort",
        title: "Thermal comfort and elderly exercise in urban environments",
        abstract:
          "This study examines heat stress, sports participation, exercise, and thermal environment comfort among elderly residents.",
        year: 2025,
        doi: "10.1000/thermal-exercise",
        authors: ["Heat Researcher"],
        containerTitle: "Journal of Thermal Comfort",
        sourceQualityScore: 100,
      }),
      sourceRecord({
        id: "soil-microplastics",
        title: "Source, migration and toxicology of microplastics in soil",
        abstract:
          "Microplastics in agricultural soil and terrestrial environments are analyzed for source migration and toxicity, without marine ecosystem, ocean, coastal, or seawater evidence.",
        year: 2024,
        doi: "10.1000/soil-microplastics",
        authors: ["Soil Scientist"],
        containerTitle: "Environmental Toxicology",
        sourceQualityScore: 100,
        citationCount: 500,
      }),
      sourceRecord({
        id: "marine-microplastics",
        title:
          "Microplastics in marine ecosystems: ingestion, toxicity, and ecological risk",
        abstract:
          "Microplastics and plastic pollution affect marine organisms through ingestion, toxicity, bioaccumulation, and food web transfer. Evidence from ocean and coastal ecosystems shows ecological risk to biodiversity.",
        year: 2021,
        doi: "10.1000/marine-microplastics",
        authors: ["Marine Ecologist"],
        containerTitle: "Marine Pollution Bulletin",
        sourceQualityScore: 95,
        citationCount: 320,
      }),
    ],
    plan,
  );

  assert.equal(sources[0]?.id, "marine-microplastics");
  assert.equal(sources[0]?.relevanceLevel, "primary");
  assert.equal(sources[0]?.shouldShowInMainList, true);
  assert.ok((sources[0]?.finalScore ?? 0) > (sources[1]?.finalScore ?? 0));
  assert.ok(
    (sources.find((source) => source.id === "soil-microplastics")?.finalScore ?? 100) <
      (sources[0]?.finalScore ?? 0),
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "thermal-comfort")
      ?.penalties.includes("missing_must_have_terms"),
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "soil-microplastics")
      ?.penalties.some((penalty) =>
        penalty.startsWith("non_marine_microplastics_context"),
      ),
  );
});

test("spider reranking rejects generic strategy papers that miss the spider subject", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: spiderEcologyTopic,
    language: "zh-TW",
  });
  const sources = [
    sourceRecord({
      id: "national-security",
      title: "高中地理教學中國家安全教育存在問題及改進策略研究",
      abstract: "本文探討國家安全教育與教學策略。",
    }),
    sourceRecord({
      id: "library-video",
      title: "民辦本科院校圖書館圖書推介視頻的現狀與優化策略",
      abstract: "本文分析圖書館推介與閱讀推廣策略。",
    }),
    sourceRecord({
      id: "spider-habitat",
      title: "Spider habitat selection and microhabitat ecology",
      abstract:
        "This study examines spider habitat selection, microhabitat conditions, predation behavior, and survival adaptation in ecological communities.",
      doi: "10.1000/spider-habitat",
    }),
    sourceRecord({
      id: "spider-monkey",
      title: "Spider monkeys: behavior, ecology and evolution of the genus Ateles",
      abstract:
        "This book reviews spider monkey behavior, ecology, habitat use, and primate evolution in Ateles.",
      doi: "10.1000/spider-monkey",
    }),
  ];

  const { sources: ranked, relevanceDebug } = rerankSourcesBySearchIntent(
    sources,
    plan,
  );
  assert.equal(ranked[0]?.id, "spider-habitat");
  assert.equal(ranked[0]?.relevanceLevel, "primary");
  assert.equal(ranked[0]?.shouldShowInMainList, true);
  assert.equal(
    ranked.find((source) => source.id === "spider-monkey")?.relevanceLevel,
    "off_topic",
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "national-security")
      ?.penalties.includes("missing_must_have_terms"),
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "spider-monkey")
      ?.penalties.some((penalty) => penalty.startsWith("non_spider_taxon")),
  );
  assert.ok(
    relevanceDebug
      .find((item) => item.sourceId === "library-video")
      ?.penalties.some(
        (penalty) =>
          penalty.startsWith("penalty_terms") ||
          penalty.startsWith("spider_drift_terms"),
      ),
  );
});

test("egg nutrition reranking rejects sports climate aviation and metadata-only drift", () => {
  const plan = buildRuleBasedSearchIntent({
    topic: "雞蛋的營養成分、蛋白質品質與胺基酸組成之研究",
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
  });
  const ranked = rerankSourcesBySearchIntent(
    [
      sourceRecord({
        id: "egg-amino-acid",
        title: "Amino acid profile and protein quality of chicken egg white and yolk",
        abstract:
          "Chicken egg nutrition research compares egg white albumen and egg yolk amino acid composition, protein digestibility, essential amino acids, and biological value.",
        doi: "10.1000/egg-amino",
      }),
      sourceRecord({
        id: "basketball",
        title: "Basketball training nutrition and sports performance",
        abstract:
          "This sports study evaluates athletes, basketball, volleyball, and training performance nutrition.",
      }),
      sourceRecord({
        id: "climate",
        title: "Climate effects on aviation and airplane fuel use",
        abstract:
          "Climate and airplane aviation emissions are modeled for aircraft fuel planning and flight operations.",
      }),
      sourceRecord({
        id: "metadata-only",
        title: "Egg protein amino acid composition in food science",
        abstract: null,
        doi: "10.1000/egg-metadata",
      }),
    ],
    plan,
  );

  const direct = ranked.sources.find((source) => source.id === "egg-amino-acid");
  const basketball = ranked.sources.find((source) => source.id === "basketball");
  const climate = ranked.sources.find((source) => source.id === "climate");
  const metadataOnly = ranked.sources.find((source) => source.id === "metadata-only");

  assert.equal(direct?.relevanceLevel, "primary");
  assert.equal(direct?.isPrimaryEvidence, true);
  assert.equal(basketball?.relevanceLevel, "off_topic");
  assert.equal(basketball?.reviewState, "rejected");
  assert.equal(basketball?.shouldRecommendAccept, false);
  assert.equal(climate?.relevanceLevel, "off_topic");
  assert.equal(climate?.reviewState, "rejected");
  assert.equal(metadataOnly?.evidenceGrounding, "metadata_only");
  assert.notEqual(metadataOnly?.relevanceLevel, "primary");
  assert.equal(metadataOnly?.isPrimaryEvidence, false);
});

test("source intent search labels primary candidates before building low-source warnings", async () => {
  const result = await searchIntentSources(
    {
      topic: spiderHabitatTopic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 1,
      includeDebug: true,
      webFallback: { enabled: false },
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(
              JSON.stringify({
                results: [
                  {
                    id: "https://openalex.org/W1",
                    display_name:
                      "Spider habitat selection and microhabitat ecology",
                    publication_year: 2024,
                    doi: "https://doi.org/10.1000/spider-habitat",
                    abstract_inverted_index: {
                      Spider: [0],
                      habitat: [1],
                      selection: [2],
                      and: [3],
                      microhabitat: [4],
                      ecology: [5],
                      explain: [6],
                      survival: [7],
                      adaptation: [8],
                      predation: [10],
                      behavior: [11],
                      in: [12],
                      ecological: [13],
                      communities: [14],
                    },
                    authorships: [{ author: { display_name: "A. Researcher" } }],
                    primary_location: {
                      source: { display_name: "Journal of Arachnology" },
                    },
                  },
                ],
              }),
            );
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({ message: "semantic quota" }),
              { status: 429 },
            );
          }

          return new Response(
            JSON.stringify({
              message: {
                items: [
                  {
                    title: [
                      "Spider monkeys: behavior, ecology and evolution of the genus Ateles",
                    ],
                    abstract:
                      "Spider monkey ecology and habitat behavior in primate populations.",
                    issued: { "date-parts": [[2020]] },
                    DOI: "10.1000/spider-monkey",
                    URL: "https://doi.org/10.1000/spider-monkey",
                  },
                ],
              },
            }),
          );
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.ok(result.sources.some((source) => source.relevanceLevel === "primary"));
  assert.ok(
    !result.sources.some((source) => source.title.includes("Spider monkeys")),
  );
  const spiderDecision = result.searchTrace.sourceDecisions.find((decision) =>
    decision.title.includes("Spider monkeys"),
  );
  assert.ok(spiderDecision);
  assert.ok(
    !result.warnings.some((warning) => warning.includes("已找到 0 筆主要來源")),
  );
});

test("source intent search returns planner output and provider failures without crashing", async () => {
  const result = await searchIntentSources(
    {
      topic: urbanHeatTopic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
      {
        llm: { apiKey: "" },
        queryLimit: 1,
        includeDebug: true,
        webFallback: { enabled: false },
        sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 1,
            headers: {
              Accept: "application/json",
              "User-Agent": "ReportFactoryAI/Test",
            },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(JSON.stringify({ results: [] }));
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({ message: "semantic failure" }),
              { status: 503 },
            );
          }

          return new Response(
            JSON.stringify({
              message: {
                items: [
                  {
                    title: [
                      "Urban heat island effects on campus thermal comfort",
                    ],
                    abstract:
                      "School campus microclimate, heat stress, and outdoor thermal comfort.",
                    issued: { "date-parts": [[2024]] },
                    DOI: "10.1000/uhi-campus",
                    URL: "https://doi.org/10.1000/uhi-campus",
                  },
                ],
              },
            }),
          );
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.searchIntent.fallbackUsed, true);
  assert.equal(result.searchIntent.plannerStatus, "skipped");
  assert.ok(result.searchIntent.primaryConcepts.includes("urban heat island"));
  assert.ok(
    result.queries.highPrecision.some((query) =>
      query.includes("urban heat island"),
    ),
  );
  const academicProviderStatus = result.provider_status.filter((group) =>
    ["OpenAlex", "Semantic Scholar", "Crossref"].includes(group.provider),
  );
  assert.equal(new Set(academicProviderStatus.map((group) => group.provider)).size, 3);
  assert.ok(academicProviderStatus.some((group) => group.ok === false));
  assert.ok(
    result.searchTrace.sourceDecisions.some(
      (decision) =>
        decision.provider === "Crossref" &&
        decision.url === "https://doi.org/10.1000/uhi-campus",
    ),
  );
  assert.match(result.workflowId, /^[0-9a-f-]{36}$/i);
  assert.equal(result.topicHash.length > 0, true);
  assert.equal(result.queryPlanHash.length > 0, true);
  assert.equal(result.searchTrace.workflowId, result.workflowId);
  assert.ok(result.searchTrace.providerQueries.every((query) => query.includes("urban heat") || query.includes("thermal") || query.includes("campus") || query.includes("熱")));
  assert.ok(result.sources.every((source) => source.workflowId === result.workflowId));
  assert.ok(
    result.warnings.some((warning) => warning.includes("部分來源提供者")),
  );
});

test("source intent search still retrieves for searchable topics that need clarification", async () => {
  let providerCalled = false;
  const result = await searchIntentSources(
    {
      topic: bmwTopic,
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 1,
      webFallback: { enabled: false },
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: { Accept: "application/json" },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 1,
            headers: { Accept: "application/json" },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 1,
            headers: { Accept: "application/json" },
          },
        },
        fetchImpl: async () => {
          providerCalled = true;
          return new Response(JSON.stringify({ results: [] }));
        },
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(providerCalled, true);
  assert.equal(result.searchIntent.needsClarification, true);
  assert.ok(result.provider_status.length > 0);
  assert.ok(result.planner.narrowedResearchQuestions?.length);
  assert.doesNotMatch(
    JSON.stringify(result.planner),
    /research direction|research question|searchable topic|academic research/i,
  );
});

test("source intent search skips invalid noise topics with empty diagnostics", async () => {
  const result = await searchIntentSources(
    {
      topic: "hoeo2f2",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      fetchImpl: async () => new Response("provider unavailable", { status: 500 }),
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, "empty");
  assert.equal(result.queryCount, 0);
  assert.equal(result.llm_status, "skipped");
  assert.equal(result.sources.length, 0);
  assert.equal(result.queries.highPrecision.length, 0);
  assert.ok(
    result.warnings.includes("查無結果：輸入內容不像有效研究主題，請改用具體關鍵詞。"),
  );
});

function publicSearchHtml(
  results: Array<{ title: string; url: string; snippet: string }>,
): string {
  return results
    .map(
      (result) => `
        <div class="result">
          <a class="result__a" href="/l/?kh=-1&uddg=${encodeURIComponent(result.url)}">${result.title}</a>
          <a class="result__snippet">${result.snippet}</a>
        </div>
      `,
    )
    .join("\n");
}

function openAlexWorks(
  seed: string,
  count: number,
  terms: string[],
): Record<string, unknown>[] {
  const seedKey = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  const titlePrefix =
    terms.length > 0 ? terms.join(" ") : seed.replace(/^https?:\/\//, "");
  return Array.from({ length: count }, (_, index) => ({
    id: `https://openalex.org/W${seedKey}-${index + 1}`,
    display_name: `${titlePrefix} evidence study ${index + 1}`,
    publication_year: 2024 - (index % 5),
    doi: `https://doi.org/10.1000/${seedKey}-${index + 1}`,
    abstract_inverted_index: Object.fromEntries(
      terms.map((term, termIndex) => [term, [termIndex + index * 20]]),
    ),
    authorships: [{ author: { display_name: `Researcher ${index + 1}` } }],
    primary_location: {
      source: { display_name: "Journal of Applied Research" },
    },
    type: "article",
    cited_by_count: 20 + index,
  }));
}

function semanticPapers(
  seed: string,
  count: number,
  abstract: string,
): Record<string, unknown>[] {
  const seedKey = createHash("sha256").update(seed).digest("hex").slice(0, 16);
  return Array.from({ length: count }, (_, index) => ({
    title: `${abstract} systematic evidence ${index + 1}`,
    authors: [{ name: `Scholar ${index + 1}` }],
    year: 2024 - (index % 4),
    abstract,
    externalIds: {
      DOI: `10.1000/semantic-${seedKey}-${index + 1}`,
    },
    url: `https://semanticscholar.example/${seedKey}/${index + 1}`,
    venue: "Educational and Social Research",
    citationCount: 15 + index,
    publicationTypes: ["JournalArticle"],
  }));
}

function assertTopTwentyReviewable(result: { ok: boolean; sources: SourceRecord[] }) {
  assert.equal(result.ok, true);
  assert.equal(result.sources.length, 20);
  assert.ok(
    result.sources.every(
      (source) =>
        source.relevanceLevel !== "low" &&
        source.relevanceLevel !== "off_topic" &&
        source.classification !== "off_topic" &&
        source.classification !== "trusted_but_off_topic",
    ),
  );
}

test("source intent search caps planner and summarizer LLM waits in retrieval flow", async () => {
  const originalPlannerTimeout = process.env.SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS;
  const originalSummaryTimeout = process.env.SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS;
  process.env.SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS = "20";
  process.env.SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS = "20";
  let academicFetchCount = 0;
  let fallbackFetchCount = 0;
  let llmFetchCount = 0;

  try {
    const result = await searchIntentSources(
      {
        topic: "BMW 在電動車轉型中的產品與供應鏈策略",
        reportType: "研究報告",
        audience: "高中",
        language: "zh-TW",
      },
      {
        queryLimit: 2,
        includeDebug: true,
        fetchImpl: async (_input, init) => {
          llmFetchCount += 1;
          return new Promise<Response>((_resolve, reject) => {
            const abort = () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            };
            if (init?.signal?.aborted) {
              abort();
              return;
            }
            init?.signal?.addEventListener("abort", abort, { once: true });
          });
        },
        sourceSearch: {
          providerConfigs: {
            OpenAlex: {
              provider: "OpenAlex",
              endpoint: "https://example.test/openalex/works",
              timeoutMs: 50,
              queryLimit: 1,
              headers: { Accept: "application/json" },
            },
            Crossref: {
              provider: "Crossref",
              endpoint: "https://example.test/works",
              timeoutMs: 50,
              queryLimit: 1,
              headers: { Accept: "application/json" },
            },
            "Semantic Scholar": {
              provider: "Semantic Scholar",
              endpoint: "https://example.test/paper/search",
              timeoutMs: 50,
              queryLimit: 1,
              headers: { Accept: "application/json" },
            },
          },
          fetchImpl: async (input) => {
            academicFetchCount += 1;
            const url = String(input);
            if (url.includes("openalex")) {
              return new Response(
                JSON.stringify({
                  results: [
                    {
                      id: "https://openalex.org/WBMW-TIMEOUT",
                      display_name:
                        "BMW electric vehicle supply chain strategy during product transition",
                      publication_year: 2024,
                      abstract_inverted_index: {
                        BMW: [0],
                        electric: [1],
                        vehicle: [2],
                        supply: [3],
                        chain: [4],
                        strategy: [5],
                        product: [6],
                        transition: [7],
                      },
                      authorships: [{ author: { display_name: "EV Scholar" } }],
                      primary_location: {
                        source: { display_name: "Automotive Strategy Journal" },
                      },
                      type: "article",
                    },
                  ],
                }),
              );
            }
            return new Response(JSON.stringify({ message: { items: [] }, data: [] }));
          },
        },
        webFallback: {
          endpoint: "https://example.test/search",
          timeoutMs: 50,
          maxResultsPerQuery: 2,
          fetchImpl: async () => {
            fallbackFetchCount += 1;
            return new Response(
              publicSearchHtml([
                {
                  title: "BMW Group Report 2024",
                  url: "https://www.bmwgroup.com/en/report/2024/",
                  snippet:
                    "BMW Group annual report describes electric vehicles, product strategy, supply chain, and sustainability.",
                },
              ]),
            );
          },
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.llm_status, "timeout");
    assert.equal(result.sources.length > 0, true);
    assert.equal(llmFetchCount >= 1, true);
    assert.equal(academicFetchCount <= 24, true);
    assert.equal(fallbackFetchCount <= 27, true);
    assert.ok(
      result.sources.some((source) => source.sourceType === "Official Source"),
    );
  } finally {
    if (originalPlannerTimeout === undefined) {
      delete process.env.SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS;
    } else {
      process.env.SOURCE_SEARCH_PLANNER_LLM_TIMEOUT_MS = originalPlannerTimeout;
    }
    if (originalSummaryTimeout === undefined) {
      delete process.env.SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS;
    } else {
      process.env.SOURCE_SEARCH_SUMMARY_LLM_TIMEOUT_MS = originalSummaryTimeout;
    }
  }
});

test("BMW EV strategy smoke returns academic, official, institutional, and media candidates", async () => {
  const result = await searchIntentSources(
    {
      topic: "BMW 在電動車轉型中的產品與供應鏈策略",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 3,
      includeDebug: true,
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 2,
            headers: { Accept: "application/json" },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 2,
            headers: { Accept: "application/json" },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 2,
            headers: { Accept: "application/json" },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(
              JSON.stringify({
                results: openAlexWorks(url, 8, [
                  "BMW",
                  "electric",
                  "vehicle",
                  "supply",
                  "chain",
                  "strategy",
                  "battery",
                  "transition",
                ]),
              }),
            );
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({
                data: semanticPapers(
                  url,
                  6,
                  "BMW and other electric vehicle manufacturers manage battery supply chain resilience, critical minerals, product platforms, and supplier risk during the EV transition.",
                ),
              }),
            );
          }

          return new Response(
            JSON.stringify({ message: { items: [] } }),
          );
        },
      },
      webFallback: {
        endpoint: "https://example.test/search",
        timeoutMs: 50,
        maxResultsPerQuery: 3,
        fetchImpl: async (input) => {
          const url = String(input);
          if (/Reuters|Financial Times|Guardian|NYTimes|CNBC/i.test(url)) {
            return new Response(
              publicSearchHtml([
                {
                  title: "BMW intensifies electric vehicle and battery strategy",
                  url: "https://www.reuters.com/business/autos-transportation/bmw-electric-vehicles-battery-strategy-2024-01-01/",
                  snippet:
                    "Reuters reports on BMW electric vehicle product plans, battery supply chain pressure, and the Neue Klasse transition.",
                },
              ]),
            );
          }
          if (/IEA|OECD|EU|government/i.test(url)) {
            return new Response(
              publicSearchHtml([
                {
                  title: "Global Supply Chains of EV Batteries",
                  url: "https://www.iea.org/reports/global-supply-chains-of-ev-batteries",
                  snippet:
                    "IEA report on electric vehicle battery supply chains, critical minerals, manufacturing concentration, and resilience.",
                },
              ]),
            );
          }
          return new Response(
            publicSearchHtml([
              {
                title: "BMW Group Report 2024",
                url: "https://www.bmwgroup.com/en/report/2024/",
                snippet:
                  "BMW Group annual report with electric vehicles, Neue Klasse product strategy, suppliers, and supply chain sustainability.",
              },
              {
                title: "BMW Group Sustainability Report",
                url: "https://www.bmwgroup.com/en/sustainability/report.html",
                snippet:
                  "BMW Group official sustainability reporting on electric vehicles, battery sourcing, supply chains, and carbon reduction.",
              },
            ]),
          );
        },
      },
    },
  );

  assertTopTwentyReviewable(result);
  assert.ok(
    result.sources.filter((source) =>
      ["OpenAlex", "Semantic Scholar", "Official Source", "Institutional Source"].includes(
        source.sourceType,
      ),
    ).length >= 2,
  );
  assert.ok(
    result.sources.some((source) => source.sourceType === "Official Source"),
  );
  assert.ok(
    result.provider_status.some(
      (group) => group.provider === "Authoritative Media" && group.ok,
    ),
  );
  assert.ok(
    result.sources.some((source) =>
      /BMW electric vehicle.*supply chain|BMW EV strategy battery supply chain/i.test(
        source.queryUsed ?? "",
      ),
    ),
  );
  assert.ok(
    result.keyword_expansion.search_queries.some((query) =>
      /BMW electric vehicle transition supply chain strategy/i.test(query),
    ),
  );
  assert.ok(!result.warnings.some((warning) => warning.includes("目前沒有找到符合搜尋意圖的來源")));
});

test("AI learning effect smoke returns top 20 ranked academic candidates", async () => {
  const result = await searchIntentSources(
    {
      topic: "AI 對高中生學習成效",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 4,
      includeDebug: true,
      webFallback: { enabled: false },
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 8,
            headers: { Accept: "application/json" },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 8,
            headers: { Accept: "application/json" },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 8,
            headers: { Accept: "application/json" },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(
              JSON.stringify({
                results: openAlexWorks(
                  url,
                  10,
                  [
                    "artificial",
                    "intelligence",
                    "high",
                    "school",
                    "students",
                    "learning",
                    "outcomes",
                    "achievement",
                  ],
                ),
              }),
            );
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({
                data: semanticPapers(
                  url,
                  10,
                  "Artificial intelligence and generative AI tools in secondary education are associated with student learning outcomes, academic achievement, engagement, and learning performance.",
                ),
              }),
            );
          }
          return new Response(JSON.stringify({ message: { items: [] } }));
        },
      },
    },
  );

  assertTopTwentyReviewable(result);
  assert.equal(result.planner.topicType, "ai_learning_effect_secondary_education");
  assert.ok(
    result.keyword_expansion.search_queries.some((query) =>
      /artificial intelligence high school students learning outcomes/i.test(query),
    ),
  );
});

test("egg nutrition amino acid smoke retrieves 80 candidates and returns top 20 ranked sources", async () => {
  const result = await searchIntentSources(
    {
      topic: "雞蛋的營養成分、蛋白質品質與胺基酸組成之研究",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
    },
    {
      llm: { apiKey: "" },
      queryLimit: 4,
      includeDebug: true,
      webFallback: { enabled: false },
      sourceSearch: {
        providerConfigs: {
          OpenAlex: {
            provider: "OpenAlex",
            endpoint: "https://example.test/openalex/works",
            timeoutMs: 50,
            queryLimit: 8,
            headers: { Accept: "application/json" },
          },
          Crossref: {
            provider: "Crossref",
            endpoint: "https://example.test/works",
            timeoutMs: 50,
            queryLimit: 8,
            headers: { Accept: "application/json" },
          },
          "Semantic Scholar": {
            provider: "Semantic Scholar",
            endpoint: "https://example.test/paper/search",
            timeoutMs: 50,
            queryLimit: 8,
            headers: { Accept: "application/json" },
          },
        },
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.includes("openalex")) {
            return new Response(
              JSON.stringify({
                results: openAlexWorks(
                  url,
                  10,
                  [
                    "egg",
                    "nutrition",
                    "protein",
                    "quality",
                    "amino",
                    "acid",
                    "albumen",
                    "yolk",
                    "digestibility",
                  ],
                ),
              }),
            );
          }
          if (url.includes("paper/search")) {
            return new Response(
              JSON.stringify({
                data: semanticPapers(
                  url,
                  10,
                  "Egg nutrition studies compare chicken egg white albumen and egg yolk amino acid profile, protein quality, digestibility, essential amino acids, and biological value.",
                ),
              }),
            );
          }
          return new Response(JSON.stringify({ message: { items: [] } }));
        },
      },
    },
  );

  assertTopTwentyReviewable(result);
  assert.ok(result.diagnostics.retrieved_count >= 60);
  assert.ok(result.diagnostics.displayed_count <= 20);
  assert.equal(result.diagnostics.primary_candidate_count > 0, true);
  assert.ok(
    result.keyword_expansion.search_queries.some((query) =>
      /egg nutrition protein quality/i.test(query),
    ),
  );
  assert.ok(
    result.keyword_expansion.search_queries.some((query) =>
      /egg protein amino acid profile/i.test(query),
    ),
  );
  assert.equal(
    result.sources.some((source) =>
      /basketball|baseball|volleyball|climate|airplane|籃球|棒球|排球|氣候|飛機/i.test(
        `${source.title} ${source.abstract ?? ""}`,
      ),
    ),
    false,
  );
});
