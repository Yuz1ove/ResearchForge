import assert from "node:assert/strict";
import test from "node:test";
import {
  removeBoilerplateLines,
  scoreEvidenceRelevance,
} from "./evidencePipelineGuards";

const rainTitle = "Terminal velocity of raindrops";
const rainBody =
  "The terminal velocity of raindrops depends on drop diameter, drag coefficient, air density, and shape deformation.";

test("scoreEvidenceRelevance accepts a cross-language paper only through an explicit bridge that matches evidence text", () => {
  const result = scoreEvidenceRelevance({
    topic: "雨水的終端速度",
    title: rainTitle,
    body: rainBody,
    queryUsed: "raindrop terminal velocity",
    source: {
      doi: "10.1000/raindrop-terminal-velocity",
      isPeerReviewed: true,
      sourceQualityScore: 0.92,
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.decision, "accepted");
  assert.equal(result.overlapTerms.length, 0);
  assert.equal(result.bridgeOverlapTerms.includes("raindrop"), true);
  assert.equal(result.diagnostics.includes("relevance_bridge:matched"), true);
});

test("scoreEvidenceRelevance rejects an unrelated English source when the explicit rain query does not match it", () => {
  const result = scoreEvidenceRelevance({
    topic: "雨水的終端速度",
    title: "Hospital analytics and healthcare management",
    body: "This review covers clinical dashboards, patient records, and hospital administration.",
    queryUsed: "raindrop terminal velocity",
    source: {
      doi: "10.1000/high-quality-but-unrelated",
      isPeerReviewed: true,
      sourceQualityScore: 0.99,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.decision, "rejected");
  assert.equal(result.diagnostics.includes("relevance_bridge:not_matched"), true);
});

test("scoreEvidenceRelevance does not treat generic fall or education terms as a rain evidence bridge", () => {
  const result = scoreEvidenceRelevance({
    topic: "雨水的終端速度",
    title: "Relationship between decisional messages and the fall of the Qin Empire",
    body:
      "The fall of the Qin Empire depended on decision making, information flow, and education of the princes.",
    matchedConcepts: ["fall", "education"],
    queryUsed:
      "raindrop terminal velocity diameter drag coefficient deformation fall speed physics relationship",
    source: {
      doi: "10.1000/qin-empire",
      isPeerReviewed: true,
      sourceQualityScore: 0.9,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.decision, "rejected");
  assert.equal(result.diagnostics.includes("relevance_bridge:not_matched"), true);
});

test("scoreEvidenceRelevance reports traceable cross-language evidence as indeterminate without a bridge", () => {
  const result = scoreEvidenceRelevance({
    topic: "雨水的終端速度",
    title: rainTitle,
    body: rainBody,
    source: {
      doi: "10.1000/raindrop-terminal-velocity",
      isPeerReviewed: true,
      sourceQualityScore: 0.99,
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.decision, "indeterminate");
  assert.equal(result.indeterminate, true);
  assert.match(result.reason, /cross-language/u);
});

test("scoreEvidenceRelevance never promotes metadata-only evidence even when its query bridge matches", () => {
  const result = scoreEvidenceRelevance({
    topic: "雨水的終端速度",
    title: rainTitle,
    body: rainBody,
    queryUsed: "raindrop terminal velocity",
    source: {
      doi: "10.1000/metadata-only-rain",
      isPeerReviewed: true,
      sourceQualityScore: 0.99,
      accessLevel: "metadata_only",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.decision, "rejected");
  assert.match(result.reason, /metadata-only/u);
});

test("scoreEvidenceRelevance accepts English gut-microbiome and sleep evidence for a Traditional Chinese topic", () => {
  const result = scoreEvidenceRelevance({
    topic: "腸道菌相與青少年睡眠品質的關聯",
    title:
      "Exercise as a modulator of gut microbiota for improvement of sleep quality",
    body:
      "The microbiota-gut-brain axis regulates sleep, and microbial metabolites may shape sleep architecture through immune and neural pathways.",
    source: {
      doi: "10.3389/fnins.2025.1639099",
      isPeerReviewed: true,
      sourceQualityScore: 0.96,
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.decision, "accepted");
  assert.equal(
    result.overlapTerms.some((term) =>
      ["gut microbiota", "microbiota-gut-brain axis", "sleep quality"].includes(term),
    ),
    true,
  );
});

test("scoreEvidenceRelevance still rejects an accepted-quality English source unrelated to a Chinese gut/sleep topic", () => {
  const result = scoreEvidenceRelevance({
    topic: "腸道菌相與青少年睡眠品質的關聯",
    title: "Hospital logistics dashboards and inventory management",
    body:
      "This paper evaluates warehouse routing, staffing schedules, and procurement dashboards for hospital administrators.",
    queryUsed: "gut microbiota adolescent sleep quality association",
    source: {
      doi: "10.1000/high-quality-off-topic",
      isPeerReviewed: true,
      sourceQualityScore: 0.99,
      reviewStatus: "accepted",
    },
  });

  assert.equal(result.accepted, false);
  assert.equal(result.decision, "rejected");
  assert.equal(result.diagnostics.includes("relevance_bridge:not_matched"), true);
});

test("boilerplate cleaning does not mistake scientific short- and medium-term wording for a Terms page", () => {
  const abstract =
    "The intervention improved sleep quality in the short and medium terms, while long-term outcomes require further study.";
  const result = removeBoilerplateLines(abstract);

  assert.equal(result.text, abstract);
  assert.equal(result.removedLineCount, 0);
  assert.deepEqual(result.flags, []);
});
