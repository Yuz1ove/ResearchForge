import assert from "node:assert/strict";
import test from "node:test";

import { buildEvidenceGapDrivenQueryPlan } from "./evidence-gap-driven-query-planner";

test("planner targets direct empirical evidence when no direct study exists", () => {
  const plan = buildEvidenceGapDrivenQueryPlan({
    topic: "Remote work and employee productivity",
    researchQuestion: "Association between remote work and employee productivity",
    existingDirectStudies: [],
  });
  assert.ok(plan.queries.some((query) => query.purpose === "DIRECT_EMPIRICAL"));
  assert.ok(plan.queries.some((query) => query.purpose === "REVIEW_SEED"));
  assert.ok(plan.queries.every((query) => query.targetGap.length > 0));
  assert.ok(plan.queries.every((query) => query.expectedEvidenceType.length > 0));
});

test("planner uses canonical identity for full-text and field-specific recovery", () => {
  const plan = buildEvidenceGapDrivenQueryPlan({
    topic: "Urban trees and heat exposure",
    existingDirectStudies: [{
      sourceId: "doi:10.1234/example",
      doi: "10.1234/example",
      accessState: "ABSTRACT_ONLY",
      missingFormalFields: ["methodsSummary", "effectEstimate"],
    }],
  });
  const fullText = plan.queries.find((query) => query.purpose === "FULLTEXT_RECOVERY");
  assert.equal(fullText?.query, "10.1234/example");
  assert.equal(fullText?.provider, "oa_location");
  assert.ok(plan.queries.some((query) => query.purpose === "METHOD_RECOVERY" && /methodsSummary/u.test(query.targetGap)));
  assert.ok(plan.queries.some((query) => query.purpose === "QUANTITATIVE_RECOVERY" && /effectEstimate/u.test(query.targetGap)));
});

test("planner keeps Case 10 contextual effect dimensions and emits a bounded plan", () => {
  const plan = buildEvidenceGapDrivenQueryPlan({
    topic: "都市熱島環境中綠屋頂的降溫效果",
    caseId: "10",
    existingDirectStudies: [{ doi: "10.1000/green-roof", accessState: "METADATA_ONLY" }],
    missingThemes: [{ themeId: "surface_temperature", independentStudyCount: 1 }],
    missingFormalFields: ["methodsSummary", "mainObservations"],
    maxQueries: 7,
  });
  assert.equal(plan.dimensions.context, "都市熱島");
  assert.equal(plan.dimensions.exposureOrIntervention, "綠屋頂");
  assert.equal(plan.dimensions.outcome, "降溫");
  assert.ok(plan.queries.length <= 7);
  assert.ok(plan.queries.some((query) => query.purpose === "FULLTEXT_RECOVERY"));
  assert.ok(plan.queries.some((query) => query.purpose === "REPLICATION"));
});

test("planner is evidence-gap driven rather than case or title hardcoded", () => {
  const first = buildEvidenceGapDrivenQueryPlan({
    topic: "Dietary sodium and blood pressure",
    existingDirectStudies: [],
  });
  const second = buildEvidenceGapDrivenQueryPlan({
    topic: "Wetland restoration and bird richness",
    existingDirectStudies: [{ doi: "10.5555/wetland", accessState: "FULL_TEXT_HTML" }],
    missingThemes: [{ themeId: "species_richness", independentStudyCount: 1 }],
  });
  assert.ok(first.queries.some((query) => query.purpose === "DIRECT_EMPIRICAL"));
  assert.ok(!second.queries.some((query) => query.purpose === "DIRECT_EMPIRICAL"));
  assert.ok(second.queries.some((query) => query.purpose === "REPLICATION"));
  assert.ok(second.queries.every((query) => !/Case\s*\d+/iu.test(query.query)));
});
