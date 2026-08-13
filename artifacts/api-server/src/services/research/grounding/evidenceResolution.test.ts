import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceAccessTier } from "@workspace/api-zod/research-grounding";
import {
  classifyEvidenceAccess,
  classifyEvidenceSection,
  resolveEvidenceCandidates,
  type EvidenceResolutionCandidate,
} from "./evidenceResolution";

function candidate(
  overrides: Partial<EvidenceResolutionCandidate> = {},
): EvidenceResolutionCandidate {
  return {
    evidenceId: "evidence-full",
    sourceId: "provider-record-full",
    canonicalSourceId: "doi:10.1000/sleep-result",
    claimKey: "sleep-duration:memory-score:adjusted-association",
    text: "Shorter sleep duration was associated with a lower memory score (beta=-0.42).",
    material: "full_text",
    extractionStatus: "text_extracted",
    sectionHeading: "Results",
    sourceLocation: "Results, paragraph 3",
    locator: {
      page: 7,
      sectionHeading: "Results",
      chunkId: "chunk-results-3",
    },
    structuredFullText: true,
    confidence: 0.9,
    numericalResult: {
      measure: "memory score",
      statisticType: "beta",
      value: -0.42,
    },
    ...overrides,
  };
}

test("full_text_sections_are_not_confused", () => {
  assert.equal(classifyEvidenceSection({ sectionHeading: "Abstract" }), "abstract");
  assert.equal(classifyEvidenceSection({ sectionHeading: "Methods" }), "study_design");
  assert.equal(classifyEvidenceSection({ sectionHeading: "Statistical analysis" }), "statistical_methods");
  assert.equal(classifyEvidenceSection({ sectionHeading: "Results" }), "primary_results");
  assert.equal(classifyEvidenceSection({ sectionHeading: "Secondary results" }), "secondary_results");
  assert.equal(classifyEvidenceSection({ sectionHeading: "Discussion" }), "discussion");
  assert.equal(classifyEvidenceSection({ sectionHeading: "Results and Discussion" }), "discussion");
  assert.equal(
    classifyEvidenceSection({
      sectionHeading: "Discussion",
      sourceLocation: "We found a possible mechanism and speculate about causality.",
    }),
    "discussion",
  );
});

test("source_access_classifier_exposes_all_six_shared_tiers", () => {
  const scenarios: Array<[Partial<EvidenceResolutionCandidate>, EvidenceAccessTier]> = [
    [{ material: "full_text", fullTextComplete: true }, "complete_full_text"],
    [{ material: "full_text", structuredFullText: true }, "structured_full_text"],
    [
      {
        material: "full_text",
        structuredFullText: false,
        sectionHeading: null,
        locator: "page 4, paragraph 2",
      },
      "verifiable_full_text_excerpt",
    ],
    [{ material: "abstract", abstractComplete: true }, "complete_abstract"],
    [{ material: "abstract", abstractComplete: false }, "partial_abstract"],
    [{ material: "metadata", locator: null }, "bibliographic_only"],
  ];

  assert.deepEqual(
    scenarios.map(([overrides]) => classifyEvidenceAccess(candidate(overrides))),
    scenarios.map(([, expected]) => expected),
  );
});

test("same_source_abstract_and_full_text_are_deduplicated", () => {
  const result = resolveEvidenceCandidates([
    candidate(),
    candidate({
      evidenceId: "evidence-abstract",
      sourceId: "provider-record-abstract",
      material: "abstract",
      sectionHeading: "Abstract",
      sourceLocation: "Abstract",
      locator: "Abstract, sentence 4",
      structuredFullText: false,
      abstractComplete: true,
      confidence: 0.82,
    }),
  ]);

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.evidenceId, "evidence-full");
  assert.deepEqual(result.evidence[0]?.duplicateEvidenceIds, ["evidence-abstract"]);
  assert.equal(result.conflicts.length, 0);
});

test("full_text_conflict_is_preferred_but_recorded_and_confidence_is_lowered", () => {
  const result = resolveEvidenceCandidates([
    candidate(),
    candidate({
      evidenceId: "evidence-abstract",
      sourceId: "provider-record-abstract",
      material: "abstract",
      sectionHeading: "Abstract",
      sourceLocation: "Abstract",
      locator: "Abstract, sentence 4",
      structuredFullText: false,
      abstractComplete: true,
      confidence: 0.84,
      numericalResult: {
        measure: "memory score",
        statisticType: "beta",
        value: -0.24,
      },
    }),
  ]);

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.evidenceId, "evidence-full");
  assert.equal(result.evidence[0]?.sectionType, "primary_results");
  assert.equal(result.evidence[0]?.verificationStatus, "conflicted");
  assert.equal(result.evidence[0]?.confidence, 0.65);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0]?.kind, "abstract_full_text_numeric_mismatch");
  assert.equal(result.conflicts[0]?.selectedEvidenceId, "evidence-full");
  assert.deepEqual(result.conflicts[0]?.conflictingEvidenceIds, ["evidence-abstract"]);
  assert.equal(result.conflicts[0]?.resolution, "prefer_verifiable_full_text");
});

test("numerical_evidence_without_locator_cannot_be_verified", () => {
  const result = resolveEvidenceCandidates([
    candidate({
      sectionHeading: "Results",
      sourceLocation: null,
      locator: null,
      fullTextComplete: true,
      structuredFullText: false,
    }),
  ]);

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.verificationStatus, "unverified");
});

test("failed_extraction_produces_no_ghost_evidence", () => {
  const result = resolveEvidenceCandidates([
    candidate({
      evidenceId: "stale-failed-result",
      extractionStatus: "extraction_failed",
      // Simulate stale parser output: failure status remains authoritative.
      text: "A stale buffer reported RR=1.9.",
    }),
    candidate({
      evidenceId: "empty-result",
      sourceId: "empty-source",
      canonicalSourceId: "doi:10.1000/empty",
      text: "   ",
      numericalResult: null,
    }),
  ]);

  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(
    result.rejected.map((item) => [item.evidenceId, item.reason]),
    [
      ["empty-result", "empty_evidence_text"],
      ["stale-failed-result", "failed_extraction"],
    ],
  );
});
