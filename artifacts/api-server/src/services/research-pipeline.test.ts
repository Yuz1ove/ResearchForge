import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "@workspace/api-zod";
import {
  buildGroundedIntro,
  buildIntroClaims,
  buildResearchEvidenceCards,
  classifyTopicSemantically,
  enrichSourcesWithResearchPipeline,
  expandBilingualQueries,
} from "./research-pipeline";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "redox-source",
    title: "Redox reactions and electron transfer",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "Redox reactions involve electron transfer and changes in oxidation state. Observable effects can include color change, corrosion, combustion, heat release, and metal deposition.",
    doi: "10.1000/redox",
    url: "https://doi.org/10.1000/redox",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Journal",
    containerTitle: "Journal of Chemistry Education",
    accessedAt: null,
    sourceKind: "journal",
    isPeerReviewed: true,
    ...overrides,
  };
}

test("classifies redox as chemistry reaction with observable-level distinction", () => {
  const classification = classifyTopicSemantically("氧化還原反應");

  assert.equal(classification.primaryType, "chemistry_reaction");
  assert.equal(classification.keyConcepts.includes("electron transfer"), true);
  assert.match(classification.observableLevel?.microscopic ?? "", /not directly visible/);
  assert.match(classification.observableLevel?.macroscopic ?? "", /color change|corrosion/);
});

test("saponification expansion produces zh and academic English queries", () => {
  const classification = classifyTopicSemantically("皂化反應");
  const queries = expandBilingualQueries(classification);
  const texts = queries.map((query) => query.query);

  assert.equal(queries.some((query) => query.language === "zh-TW"), true);
  assert.equal(queries.some((query) => query.language === "en"), true);
  assert.equal(texts.includes("油脂鹼性水解"), true);
  assert.equal(texts.includes("saponification reaction"), true);
  assert.equal(texts.includes("alkaline hydrolysis of esters"), true);
  assert.equal(texts.includes("ester hydrolysis"), true);
});

test("source pipeline extracts facts, relevance, evidence cards, and grounded intro without template", () => {
  const classification = classifyTopicSemantically("氧化還原反應");
  const expandedQueries = expandBilingualQueries(classification);
  const enriched = enrichSourcesWithResearchPipeline([source()], classification, expandedQueries);
  const cards = buildResearchEvidenceCards(enriched.sourceFacts, enriched.sources, enriched.relevanceScores);
  const introClaims = buildIntroClaims(cards);
  const intro = buildGroundedIntro(classification, introClaims, 5);

  assert.equal(enriched.sourceValidations[0]?.sourceType, "journal");
  assert.equal(enriched.readableExtractions[0]?.extractionStatus, "success");
  assert.equal(enriched.sourceFacts.some((fact) => fact.category === "mechanism"), true);
  assert.equal(enriched.sourceFacts.some((fact) => fact.category === "observable_phenomenon"), true);
  assert.equal(enriched.relevanceScores[0]?.label, "high");
  assert.equal(cards.length >= 1, true);
  assert.equal(intro.fallbackUsed, false);
  assert.doesNotMatch(`${intro.title} ${intro.subtitle} ${intro.intro}`, /看不見|看不到|神秘|背後的秘密/);
});

test("grounded intro falls back when accepted sources are below minimum", () => {
  const classification = classifyTopicSemantically("研究資料自動整理系統");
  const intro = buildGroundedIntro(classification, [], 0);

  assert.equal(intro.fallbackUsed, true);
  assert.equal(intro.validation.passed, false);
  assert.match(intro.intro, /資料有限|核心概念/);
});
