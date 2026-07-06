import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSourceAgainstIntent,
  parseResearchInput,
} from "@workspace/api-zod/research-intent";
import { groundedEvidenceCardsForAcceptedSources } from "./researchGrounding.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: overrides.id ?? "source-1",
    title: overrides.title ?? "Yellowstone National Park geology and volcanic system overview",
    authors: overrides.authors ?? ["Ada Lovelace"],
    year: overrides.year ?? 2024,
    abstract:
      overrides.abstract ??
      "This source summarizes Yellowstone geology, volcanic activity, and ecosystem management.",
    doi: overrides.doi ?? "10.1000/example",
    url: overrides.url ?? "https://example.org/yellowstone",
    sourceType: overrides.sourceType ?? "Crossref",
    reviewState: overrides.reviewState ?? "accepted",
    publisher: overrides.publisher ?? "Example Publisher",
    containerTitle: overrides.containerTitle ?? "Example Journal",
    accessedAt: overrides.accessedAt ?? null,
    relevanceLevel: overrides.relevanceLevel ?? "primary",
    evidenceGrounding: overrides.evidenceGrounding ?? "abstract_grounded",
    ...overrides,
  };
}

test("parseResearchInput shows topic options for ambiguous short keywords", () => {
  const parsed = parseResearchInput("鵝");

  assert.equal(parsed.inputType, "keyword");
  assert.equal(parsed.nextAction, "show_topic_options");
  assert.equal(parsed.topicOptions.length > 0, true);
  assert.equal(parsed.safetyStatus, "allowed");
});

test("parseResearchInput extracts topic, intent, and query plan from full research sentences", () => {
  const parsed = parseResearchInput("不同溫度對牛奶變質速度的影響");

  assert.equal(parsed.nextAction, "search");
  assert.equal(parsed.researchIntent, "evaluate_impact");
  assert.equal(parsed.canonicalTopic, "不同溫度對牛奶變質速度的影響");
  assert.equal(parsed.domain, "biology");
  assert.equal(parsed.mustIncludeTerms.includes("牛奶"), true);
  assert.equal(parsed.queryPlan.zhQueries.includes("不同溫度對牛奶變質速度的影響"), true);
});

test("parseResearchInput searches generic but meaningful content topics", () => {
  const parsed = parseResearchInput("少子化與高齡化的應對方式");

  assert.equal(parsed.inputType, "sentence");
  assert.equal(parsed.nextAction, "search");
  assert.equal(parsed.domain, "social_science");
  assert.equal(parsed.researchIntent, "practical_application");
  assert.equal(parsed.mustIncludeTerms.includes("少子化"), true);
  assert.equal(parsed.mustIncludeTerms.includes("高齡化"), true);
  assert.equal(
    parsed.queryPlan.enQueries.some((query) => /low fertility|population aging|policy response/i.test(query)),
    true,
  );
});

test("parseResearchInput searches report summary and strategy phrasing", () => {
  const topics = [
    ["再生能源在城市用電中的應用與限制", /renewable energy|urban electricity|applications and limitations/i],
    ["都市熱島效應的成因與降溫策略", /urban heat island|cooling strategies|heat mitigation/i],
    ["校園午餐浪費問題的原因與改善策略", /school lunch|food waste|plate waste|intervention strategies/i],
    ["社群媒體使用與青少年睡眠品質的關係", /social media|adolescent|sleep quality/i],
  ] as const;

  for (const [topic, queryPattern] of topics) {
    const parsed = parseResearchInput(topic);

    assert.equal(parsed.inputType, "sentence", topic);
    assert.equal(parsed.nextAction, "search", topic);
    assert.equal(
      parsed.queryPlan.enQueries.some((query) => queryPattern.test(query)),
      true,
      topic,
    );
  }
});

test("parseResearchInput searches how-mechanism biology questions", () => {
  const parsed = parseResearchInput("蛋白質如何消化並產生肌肉");

  assert.equal(parsed.inputType, "question");
  assert.equal(parsed.nextAction, "search");
  assert.equal(parsed.domain, "biology");
  assert.equal(parsed.researchIntent, "explain_mechanism");
  assert.equal(
    parsed.queryPlan.enQueries.some((query) =>
      /protein digestion|muscle protein synthesis|amino acids|muscle growth/i.test(query),
    ),
    true,
  );
});

test("parseResearchInput expands protein muscle growth natural questions", () => {
  const parsed = parseResearchInput("蛋白質如何幫助人類增長肌肉");
  const queryText = parsed.queryPlan.enQueries.join(" ");

  assert.equal(parsed.inputType, "question");
  assert.equal(parsed.nextAction, "search");
  assert.equal(parsed.canonicalTopic, "蛋白質與肌肉增長");
  assert.equal(parsed.domain, "biology");
  assert.equal(parsed.researchIntent, "explain_mechanism");
  assert.match(queryText, /protein intake/i);
  assert.match(queryText, /muscle hypertrophy/i);
  assert.match(queryText, /muscle protein synthesis/i);
});

test("parseResearchInput expands tea organ health research sentences", () => {
  const parsed = parseResearchInput("茶葉對於器官的健康影響");
  const queryText = parsed.queryPlan.enQueries.join(" ");

  assert.equal(parsed.inputType, "sentence");
  assert.equal(parsed.nextAction, "search");
  assert.equal(parsed.canonicalTopic, "茶葉與人體器官健康");
  assert.equal(parsed.domain, "medicine");
  assert.equal(parsed.researchIntent, "evaluate_impact");
  assert.match(queryText, /tea polyphenols/i);
  assert.match(queryText, /catechins/i);
  assert.match(queryText, /EGCG/i);
  assert.match(queryText, /liver/i);
  assert.match(queryText, /kidney/i);
  assert.match(queryText, /cardiovascular health/i);
});

test("parseResearchInput blocks dangerous actionable topics before search", () => {
  const parsed = parseResearchInput("安非他命製作");

  assert.equal(parsed.nextAction, "block");
  assert.equal(parsed.safetyStatus, "blocked");
  assert.equal(parsed.safetyCategory, "illegal_drug_manufacturing");
  assert.equal(parsed.safeAlternatives.length >= 1, true);
});

test("parseResearchInput asks for clarification on invalid noise input", () => {
  const parsed = parseResearchInput("？？？？");

  assert.equal(parsed.inputType, "invalid");
  assert.equal(parsed.nextAction, "ask_clarification");
});

test("evaluateSourceAgainstIntent rejects topic drift sources", () => {
  const parsed = parseResearchInput("黃石國家公園");
  const relevant = evaluateSourceAgainstIntent(
    {
      title: "Yellowstone National Park geology and ecosystem management",
      abstract:
        "This article reviews Yellowstone geology, ecology, and park management evidence.",
      url: "https://example.org/yellowstone-geology",
    },
    parsed,
  );
  const drifted = evaluateSourceAgainstIntent(
    {
      title: "Sea turtle fundraising campaign for ocean conservation",
      abstract:
        "Donate to marine turtle rescue and fundraising activities across coastal habitats.",
      url: "https://example.org/sea-turtle-fundraising",
    },
    parsed,
  );

  assert.equal(relevant.decision, "accept");
  assert.equal(drifted.decision, "reject");
  assert.equal(drifted.excludeHits.includes("sea turtle"), true);
});

test("groundedEvidenceCardsForAcceptedSources builds limited fallback cards for accepted metadata-only sources", () => {
  const acceptedWithAbstract = source({
    id: "accepted-1",
    title: "Accepted source with abstract",
    abstract:
      "This accepted source includes enough abstract evidence to derive one fallback evidence card.",
  });
  const acceptedMetadataOnly = source({
    id: "accepted-2",
    title: "Metadata only source",
    abstract: null,
    evidenceGrounding: "metadata_only",
  });

  const cards = groundedEvidenceCardsForAcceptedSources({
    acceptedSources: [acceptedWithAbstract, acceptedMetadataOnly],
    groundingEvidenceCards: [],
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
  });

  assert.equal(cards.some((card) => card.sourceId === "accepted-1"), true);
  const metadataOnlyCard = cards.find((card) => card.sourceId === "accepted-2");
  assert.equal(Boolean(metadataOnlyCard), true);
  assert.equal(metadataOnlyCard?.derivation, "metadata-derived");
  assert.match(metadataOnlyCard?.limitation ?? "", /書目線索|具體研究結論/);
});
