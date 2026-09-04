import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalStudyAdmissionResult,
  GroundingJob,
} from "@workspace/api-zod/research-grounding";
import {
  auditPreClosureCanonicalBinding,
  buildCanonicalAdmissionProjection,
  downstreamCanonicalView,
  type CanonicalArtifactBindingInput,
} from "./canonical-admission-projection";
import { buildAcquisitionTerminalManifest } from "./grounding/researchAcquisitionLifecycle";

function decision(
  overrides: Partial<CanonicalStudyAdmissionResult> = {},
): CanonicalStudyAdmissionResult {
  return {
    schemaVersion: "researchforge-canonical-study-admission/v1",
    admissionVersion: "canonical-evidence-admission.v1",
    decisionId: "admission:test",
    jobId: "job-test",
    workflowId: "workflow-test",
    studyId: "study:test",
    sourceId: "source:test",
    jobRevision: 7,
    checkpointRevision: 6,
    evidenceRevision: "evidence-revision-7",
    accessState: "FULL_TEXT_STRUCTURED",
    acquisitionTerminal: true,
    qualifyingArtifactRefs: ["artifact-sha-7"],
    parserState: "COMPLETE",
    studyFactState: "READY",
    provenanceState: "READY",
    admissionClass: "LIMITED",
    reasonCodes: ["QUALIFYING_FULL_TEXT_PRESENT", "STUDY_FACTS_READY", "LIMITED_ADMITTED"],
    missingRequirements: [],
    upstreamReferences: {
      sourceId: "source:test",
      canonicalSourceIdentity: "study:test",
      studyFactExtractionVersion: "study-fact-v2",
      resolverStates: ["FULL_TEXT_STRUCTURED"],
      parserVersion: "study-fact-v2",
    },
    decidedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}

function artifact(
  overrides: Partial<CanonicalArtifactBindingInput> = {},
): CanonicalArtifactBindingInput {
  return {
    artifactId: "manifestation:test",
    sourceId: "source:test",
    canonicalStudyId: "study:test",
    artifactRevision: "artifact-sha-7",
    qualificationStatus: "QUALIFIED",
    identityDecision: "MATCH",
    materializationStatus: "MATERIALIZED",
    accessPolicyDecision: "ALLOWED_OPEN_REPOSITORY",
    provenanceComplete: true,
    ...overrides,
  };
}

function project(
  decisions: CanonicalStudyAdmissionResult[],
  artifacts: CanonicalArtifactBindingInput[],
) {
  return buildCanonicalAdmissionProjection({
    decisions,
    artifacts,
    ownerContext: {
      jobId: "job-test",
      workflowId: "workflow-test",
      jobRevision: 7,
      checkpointRevision: 6,
    },
    projectedAt: "2026-08-29T00:01:00.000Z",
  });
}

test("canonical BLOCKED overrides artifact.qualifying=true", () => {
  const projection = project([
    decision({
      admissionClass: "BLOCKED",
      reasonCodes: ["QUALIFYING_FULL_TEXT_PRESENT", "INSUFFICIENT_STUDY_FACTS"],
    }),
  ], [artifact()]);
  assert.equal(projection.artifacts[0]?.admitted, false);
  assert.ok(projection.artifacts[0]?.reasonCodes.includes("CANONICAL_ADMISSION_BLOCKED"));
  assert.equal(projection.summary.qualifyingArtifactCount, 0);
});

test("canonical BLOCKED overrides successful materialization and parsing", () => {
  const projection = project([
    decision({ admissionClass: "BLOCKED", parserState: "COMPLETE" }),
  ], [artifact({ materializationStatus: "MATERIALIZED", qualificationStatus: "QUALIFIED" })]);
  assert.equal(projection.artifacts[0]?.admitted, false);
  assert.equal(projection.summary.qualifyingFullTextDecisionCount, 0);
});

test("canonical admitted with matching artifact revision is admitted exactly once", () => {
  const projection = project([decision()], [artifact(), artifact()]);
  assert.equal(projection.summary.canonicalAdmittedDecisionCount, 1);
  assert.equal(projection.summary.qualifyingArtifactCount, 1);
  assert.equal(projection.summary.duplicateArtifactCount, 1);
});

test("canonical admitted with stale artifact revision fails closed", () => {
  const projection = project([decision()], [artifact({ artifactRevision: "artifact-sha-stale" })]);
  assert.equal(projection.artifacts[0]?.admitted, false);
  assert.ok(projection.artifacts[0]?.reasonCodes.includes("STALE_ARTIFACT_REVISION"));
});

test("old and active artifact revisions do not double count", () => {
  const projection = project([decision()], [
    artifact({ artifactId: "manifestation:old", artifactRevision: "artifact-sha-old" }),
    artifact({ artifactId: "manifestation:active" }),
  ]);
  assert.equal(projection.summary.qualifyingArtifactCount, 1);
  assert.equal(projection.artifacts.find((item) => item.artifactId === "manifestation:old")?.admitted, false);
});

test("missing canonical record fails closed", () => {
  const projection = project([], [artifact()]);
  assert.equal(projection.artifacts[0]?.admitted, false);
  assert.ok(projection.artifacts[0]?.reasonCodes.includes("MISSING_CANONICAL_ADMISSION"));
});

test("UNKNOWN_POLICY is preserved and never admitted", () => {
  const projection = project([
    decision({ admissionClass: "BLOCKED", accessState: "UNKNOWN", reasonCodes: ["ACCESS_UNKNOWN"] }),
  ], [artifact({ accessPolicyDecision: "UNKNOWN_POLICY" })]);
  assert.equal(projection.artifacts[0]?.admitted, false);
  assert.ok(projection.artifacts[0]?.reasonCodes.includes("UNKNOWN_POLICY"));
  assert.equal(projection.summary.blockerCounts.UNKNOWN_POLICY, 1);
});

test("ROBOTS_OR_TOS_BLOCKED cannot be overwritten by materialization success", () => {
  const projection = project([decision()], [
    artifact({ accessPolicyDecision: "ROBOTS_OR_TOS_BLOCKED" }),
  ]);
  assert.equal(projection.artifacts[0]?.admitted, false);
  assert.ok(projection.artifacts[0]?.reasonCodes.includes("ROBOTS_OR_TOS_BLOCKED"));
});

test("CANONICAL_ADMISSION_BLOCKED produces zero downstream counts", () => {
  const projection = project([
    decision({ admissionClass: "BLOCKED", reasonCodes: ["INSUFFICIENT_STUDY_FACTS"] }),
  ], [artifact()]);
  const view = downstreamCanonicalView(projection, "terminal_manifest");
  assert.equal(view.summary.canonicalAdmittedDecisionCount, 0);
  assert.equal(view.summary.qualifyingArtifactCount, 0);
  assert.deepEqual(view.admittedDecisionIds, []);
  assert.deepEqual(view.admittedArtifactIds, []);
});

test("stale canonical decision revision is blocked", () => {
  const projection = project([decision({ jobRevision: 6 })], [artifact()]);
  assert.equal(projection.decisions[0]?.admitted, false);
  assert.ok(projection.decisions[0]?.reasonCodes.includes("STALE_DECISION_REVISION"));
  assert.equal(projection.artifacts[0]?.admitted, false);
});

test("duplicate active canonical decision fails closed", () => {
  const projection = project([
    decision(),
    decision({ decisionId: "admission:duplicate" }),
  ], [artifact()]);
  assert.equal(projection.summary.duplicateCanonicalDecisionCount, 1);
  assert.equal(projection.summary.canonicalAdmittedDecisionCount, 0);
  assert.ok(projection.decisions.every((item) => item.reasonCodes.includes("DUPLICATE_ACTIVE_CANONICAL_DECISION")));
});

test("pre-closure audit blocks final report summary mismatch", () => {
  const projection = project([decision()], [artifact()]);
  const canonical = downstreamCanonicalView(projection, "terminal_manifest");
  const report = downstreamCanonicalView(projection, "final_report");
  const mismatchedReport = {
    ...report,
    summary: { ...report.summary, qualifyingArtifactCount: report.summary.qualifyingArtifactCount + 1 },
  };
  const audit = auditPreClosureCanonicalBinding({
    projection,
    downstream: [canonical, mismatchedReport],
    auditedAt: "2026-08-29T00:02:00.000Z",
  });
  assert.equal(audit.pass, false);
  assert.equal(audit.closureAllowed, false);
  assert.ok(audit.mismatches.some((item) => item.code === "SUMMARY_COUNT_MISMATCH"));
});

test("terminal manifest consumes canonical projection instead of decision presence", () => {
  const blocked = decision({
    admissionClass: "BLOCKED",
    reasonCodes: ["QUALIFYING_FULL_TEXT_PRESENT", "INSUFFICIENT_STUDY_FACTS"],
  });
  const job = {
    jobId: "job-test",
    workflowId: "workflow-test",
    revision: 7,
    originalTopic: "test topic",
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:30.000Z",
    requestPayload: { caseId: "04" },
    canonicalStudyAdmissions: [blocked],
    acceptedSources: [{
      sourceId: "source:test",
      enrichmentProvenance: [{
        manifestations: [{
          manifestationId: "manifestation:test",
          canonicalStudyId: "study:test",
          checksumSha256: "artifact-sha-7",
          qualificationStatus: "QUALIFIED",
          identityDecision: "MATCH",
          materializationStatus: "MATERIALIZED",
          accessPolicyDecision: "ALLOWED_OPEN_REPOSITORY",
          artifactUrl: "https://example.test/article",
        }],
      }],
    }],
    sourceCandidates: [],
    warnings: [],
  } as unknown as GroundingJob;
  const manifest = buildAcquisitionTerminalManifest(
    job,
    "PARTIAL",
    "2026-08-29T00:01:00.000Z",
  );
  assert.equal(manifest.directStudyCount, 0);
  assert.equal(manifest.fullTextStructuredCount, 0);
  assert.equal(manifest.qualifyingArtifactCount, 0);
  assert.equal(manifest.canonicalBindingPass, true);
});
