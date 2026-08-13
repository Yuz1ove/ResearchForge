import assert from "node:assert/strict";
import test from "node:test";

import {
  assessResearchDirectness,
  buildResearchFacetQueries,
  inferResearchFacets,
  summarizeFacetAdequacy,
} from "@workspace/api-zod/research-topic-facets";

const topic = "台灣 urban heat island 與校園綠覆率的關聯";

function candidate(title: string, abstract = "") {
  return { title, abstract, snippet: null, containerTitle: null, publisher: null };
}

test("facet planning produces exact bilingual, synonym, relaxation, and gap-fill queries", () => {
  const plan = inferResearchFacets(topic);
  const queries = buildResearchFacetQueries(plan, ["geography", "exposure"]);

  assert.deepEqual(plan.requiredKeys, ["geography", "setting", "exposure", "outcome"]);
  assert.ok(queries.exactBilingual.some((query) =>
    /Taiwan/iu.test(query) && /campus/iu.test(query) && /green coverage/iu.test(query) && /urban heat island/iu.test(query),
  ));
  assert.ok(queries.exactBilingual.some((query) => /臺灣/u.test(query) && /校園/u.test(query)));
  assert.ok(queries.synonymExpansion.length > 0);
  assert.ok(queries.singleFacetRelaxation.length >= 3);
  assert.ok(queries.gapFill.some((query) => /Taiwan|臺灣/iu.test(query)));
  assert.ok(queries.gapFill.some((query) => /green coverage|綠覆率/iu.test(query)));
});

test("directness tiers require research-facet overlap rather than generic urban vocabulary", () => {
  const plan = inferResearchFacets(topic);
  const tierA = assessResearchDirectness(candidate(
    "Taiwan school campus green coverage and urban heat island thermal environment",
  ), plan);
  const tierB = assessResearchDirectness(candidate(
    "Taiwan university campus thermal environment and heat stress",
  ), plan);
  const tierC = assessResearchDirectness(candidate(
    "Green space and land surface temperature across world cities",
  ), plan);
  const tierD = assessResearchDirectness(candidate(
    "Street view imagery in urban analytics and GIS",
  ), plan);

  assert.equal(tierA.tier, "A");
  assert.equal(tierB.tier, "B");
  assert.equal(tierC.tier, "C");
  assert.equal(tierD.tier, "D");
  assert.equal(summarizeFacetAdequacy([tierA, tierB, tierB], plan).adequate, true);
  assert.equal(summarizeFacetAdequacy([tierC, tierD], plan).adequate, false);
});

test("facet logic generalizes to an unrelated social-media and sleep topic", () => {
  const unrelated = inferResearchFacets("臺灣高中生短影音使用時間與睡眠品質的關聯");
  const queries = buildResearchFacetQueries(unrelated);
  const direct = assessResearchDirectness(candidate(
    "Screen time, short-form video use, and sleep among high school students in Taiwan",
  ), unrelated);
  const drift = assessResearchDirectness(candidate(
    "Urban vegetation mapping with street-view imagery",
  ), unrelated);

  assert.ok(unrelated.requiredKeys.includes("geography"));
  assert.ok(unrelated.requiredKeys.includes("exposure"));
  assert.ok(unrelated.requiredKeys.includes("outcome"));
  assert.ok(unrelated.requiredKeys.includes("population_object"));
  assert.ok(queries.exactBilingual.some((query) => /Taiwan/iu.test(query) && /short-form video/iu.test(query) && /sleep/iu.test(query)));
  assert.equal(direct.tier, "A");
  assert.equal(drift.tier, "D");
});

test("directness_classification_consistent", () => {
  const plan = inferResearchFacets("高中生短影音使用與睡眠品質的關聯");
  const exactPopulation = assessResearchDirectness(candidate(
    "Short-form video use and sleep quality among high school students",
  ), plan);
  const collegePopulation = assessResearchDirectness(candidate(
    "Short-form video use and sleep quality among college students",
  ), plan);
  const adjacentExposure = assessResearchDirectness(candidate(
    "General social media use and sleep quality among high school students",
  ), plan);
  const adjacentPopulation = assessResearchDirectness(candidate(
    "Short-form video use and sleep quality among adolescents",
  ), plan);

  assert.equal(exactPopulation.tier, "A");
  assert.equal(collegePopulation.tier, "B");
  assert.equal(adjacentExposure.tier, "B");
  assert.equal(adjacentPopulation.tier, "B");
  assert.deepEqual(collegePopulation.missingKeys, ["population_object"]);
});

test("known DOI recall fixtures never leak into generated product queries", () => {
  const knownRecallDois = [
    "10.1007/s00484-017-1345-x",
    "10.3966/101632122020030111006",
    "10.1007/s00704-026-06369-7",
  ];
  const queries = Object.values(buildResearchFacetQueries(inferResearchFacets(topic))).flat();
  for (const doi of knownRecallDois) {
    assert.ok(queries.every((query) => !query.includes(doi)));
  }
});
