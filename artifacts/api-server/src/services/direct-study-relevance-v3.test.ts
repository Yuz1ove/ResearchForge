import assert from "node:assert/strict";
import test from "node:test";
import { auditDirectStudyCandidatesV3, diagnoseDirectEvidenceGapV3 } from "./direct-study-relevance-v3";

test("direct relevance V3 emits one explicit rejection reason for every candidate", () => {
  const audit = auditDirectStudyCandidatesV3([
    { sourceId: "s1", title: "Wrong population", topicIntegrityAssessment: { acceptedForCanonicalEvidence: false, evidenceEntailment: { populationMatch: false } } },
    { sourceId: "s2", title: "Wrong exposure", topicIntegrityAssessment: { acceptedForCanonicalEvidence: false, evidenceEntailment: { interventionExposureMatch: false } } },
    { sourceId: "s3", title: "Wrong outcome", topicIntegrityAssessment: { acceptedForCanonicalEvidence: false, evidenceEntailment: { outcomeMatch: false } } },
    { sourceId: "s4", title: "Opinion article", sourceKind: "editorial", topicIntegrityAssessment: { acceptedForCanonicalEvidence: false } },
  ]);
  assert.deepEqual(audit.map((item) => item.reason), ["POPULATION_MISMATCH", "EXPOSURE_MISMATCH", "OUTCOME_MISMATCH", "NOT_EMPIRICAL"]);
  assert.ok(audit.every((item) => item.decision === "REJECTED"));
});

test("duplicate DOI is audited without adding a direct independent study", () => {
  const accepted = { acceptedForCanonicalEvidence: true, sourceRole: "DIRECT_FINDING", evidenceEntailment: { relationship: "direct" } };
  const audit = auditDirectStudyCandidatesV3([
    { sourceId: "s1", title: "Original", doi: "10.1000/shared", formalEvidenceRole: "DIRECT_FINDING", topicIntegrityAssessment: accepted },
    { sourceId: "s2", title: "Duplicate", doi: "https://doi.org/10.1000/shared", formalEvidenceRole: "DIRECT_FINDING", topicIntegrityAssessment: accepted },
  ]);
  assert.deepEqual(audit.map((item) => item.reason), ["DIRECT_EMPIRICAL_MATCH", "DUPLICATE_STUDY"]);
});

test("gap diagnosis distinguishes query failure from classifier false-negative", () => {
  const direct = auditDirectStudyCandidatesV3([{ sourceId: "s1", title: "Direct", formalEvidenceRole: "DIRECT_FINDING", topicIntegrityAssessment: { acceptedForCanonicalEvidence: true, sourceRole: "DIRECT_FINDING" } }]);
  assert.equal(diagnoseDirectEvidenceGapV3({ candidates: [], admittedDirectSourceIds: [] }).rootCause, "QUERY_PLAN_FAILURE");
  assert.equal(diagnoseDirectEvidenceGapV3({ candidates: direct, admittedDirectSourceIds: [] }).rootCause, "CLASSIFIER_FALSE_NEGATIVE");
});

test("V3 direct-study fixture rejects reviews even when an upstream classifier mislabeled them direct", () => {
  const audit = auditDirectStudyCandidatesV3([{
    sourceId: "review",
    title: "A Systematic Review of Retrieval-Augmented Generation and Hallucination",
    sourceType: "review",
    formalEvidenceRole: "DIRECT_FINDING",
    topicIntegrityAssessment: { acceptedForCanonicalEvidence: true, sourceRole: "DIRECT_FINDING" },
  }]);
  assert.equal(audit[0]?.decision, "REJECTED");
  assert.equal(audit[0]?.reason, "NOT_EMPIRICAL");
});

test("V3 direct-study fixture accepts empirical non-IMRAD technical evaluations", () => {
  const audit = auditDirectStudyCandidatesV3([{
    sourceId: "benchmark",
    title: "RAG factuality benchmark across retrieval conditions",
    sourceType: "conference",
    formalEvidenceRole: "DIRECT_FINDING",
    topicIntegrityAssessment: { acceptedForCanonicalEvidence: true, sourceRole: "DIRECT_FINDING" },
  }]);
  assert.equal(audit[0]?.decision, "DIRECT");
});

test("V3 dedupe fixture retains distinct direct studies with different DOI identities", () => {
  const accepted = { acceptedForCanonicalEvidence: true, sourceRole: "DIRECT_FINDING" };
  const audit = auditDirectStudyCandidatesV3([
    { sourceId: "one", title: "Study one", doi: "10.1000/one", formalEvidenceRole: "DIRECT_FINDING", topicIntegrityAssessment: accepted },
    { sourceId: "two", title: "Study two", doi: "10.1000/two", formalEvidenceRole: "DIRECT_FINDING", topicIntegrityAssessment: accepted },
  ]);
  assert.equal(audit.filter((item) => item.decision === "DIRECT").length, 2);
});
