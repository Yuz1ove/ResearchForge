import assert from "node:assert/strict";
import test from "node:test";
import {
  areSemanticEvidenceDuplicates,
  buildEvidenceGapMatrix,
  claimEvidenceRoles,
  evaluateEvidenceDiversity,
  resolveSourceInternalConflict,
  type AugmentationInventoryClaim,
} from "./sourceAugmentationService";
import { buildWriterClaimGraph } from "../../report-writer";

const longitudinal: AugmentationInventoryClaim = {
  claimId: "claim-longitudinal",
  sourceId: "doi:10.1000/longitudinal",
  proposition: "831名青少年接受三波評估，第一波熄燈後螢幕時間預測第二波較差睡眠品質。",
  supportSpan: "831 participants underwent online assessment three times. Screen time in Wave1 predicted sleep quality in Wave2.",
  population: "adolescents",
  studyDesign: "three-wave longitudinal RI-CLPM",
  adjusted: true,
  discussionRole: "temporal_order",
};

test("gap matrix derives counts from claim content and source identity", () => {
  const matrix = buildEvidenceGapMatrix([longitudinal], [{
    gapId: "discussion-temporal",
    section: "discussion",
    role: "temporal_order",
    minimumClaims: 2,
    minimumSources: 2,
    severityWhenMissing: "critical",
    neededForLongReport: true,
    searchIntent: ["adolescent screen sleep longitudinal"],
  }]);
  assert.deepEqual(matrix[0], {
    gapId: "discussion-temporal",
    section: "discussion",
    role: "temporal_order",
    currentClaimCount: 1,
    currentSourceCount: 1,
    severity: "critical",
    neededForLongReport: true,
    targetPopulation: undefined,
    targetExposure: undefined,
    targetOutcome: undefined,
    targetMethod: undefined,
    searchIntent: ["adolescent screen sleep longitudinal"],
    satisfied: false,
  });
  assert.ok(claimEvidenceRoles(longitudinal).includes("longitudinal"));
  assert.ok(claimEvidenceRoles(longitudinal).includes("temporal_order"));
});

test("semantic dedupe preserves design, adjustment, population, horizon, and null distinctions", () => {
  const base = {
    claimId: "a",
    sourceId: "source-a",
    proposition: "短影音使用與較差睡眠品質相關。",
    population: "adolescents",
    studyDesign: "cross-sectional",
    adjusted: false,
    significance: "significant" as const,
  };
  assert.equal(areSemanticEvidenceDuplicates(base, { ...base, claimId: "b", sourceId: "source-b" }), true);
  assert.equal(areSemanticEvidenceDuplicates(base, { ...base, claimId: "b", sourceId: "source-b", studyDesign: "longitudinal" }), false);
  assert.equal(areSemanticEvidenceDuplicates(base, { ...base, claimId: "b", sourceId: "source-b", adjusted: true }), false);
  assert.equal(areSemanticEvidenceDuplicates(base, { ...base, claimId: "b", sourceId: "source-b", significance: "null" }), false);
});

test("Methods and Procedure resolve the 30-versus-40 sample conflict without erasing provenance", () => {
  const conflict = resolveSourceInternalConflict("doi:10.55606/jurrikes.v3i2.8145", "sample_size", [
    { value: 30, location: "Title", span: "A Study of 30 Students" },
    { value: 40, location: "Abstract", span: "The participants were 40 students" },
    { value: 30, location: "Methods — Participants", span: "consisted of 30 junior high school students" },
    { value: 30, location: "Procedure", span: "From a total of 30 eligible students" },
  ]);
  assert.equal(conflict.resolution, "resolved");
  assert.equal(conflict.authoritativeValue, 30);
  assert.match(conflict.authoritativeLocation ?? "", /Methods/);
  assert.equal(conflict.values.length, 4);
});

test("conflicting authoritative duration statements remain unresolved", () => {
  const conflict = resolveSourceInternalConflict("doi:10.55606/jurrikes.v3i2.8145", "exposure_duration", [
    { value: 180, unit: "seconds", location: "Methods — Research Design" },
    { value: 5, unit: "minutes", location: "Procedure" },
  ]);
  assert.equal(conflict.resolution, "unresolved");
  assert.equal(conflict.authoritativeValue, undefined);
});

test("diversity gate requires discussion-grade roles instead of raw source count", () => {
  const result = evaluateEvidenceDiversity([longitudinal]);
  assert.equal(result.passed, false);
  assert.ok(result.coverage.temporal_longitudinal.adequate);
  assert.ok(result.missing.includes("conflicting_or_null"));
});

test("Writer section planning does not lose gap-driven sources behind the long-form cap", () => {
  const cards = Array.from({ length: 10 }, (_, index) => ({
    id: `evidence-${index}`,
    sourceId: `source-${index}`,
    claim: `青少年短影音使用與睡眠結果相關，來源 ${index}。`,
    claimText: `青少年短影音使用與睡眠結果相關，來源 ${index}。`,
    claimTextZhTw: `青少年短影音使用與睡眠結果相關，來源 ${index}。`,
    supportSpan: `研究結果顯示青少年短影音使用與睡眠結果相關，來源 ${index}。`,
    supportedByText: `研究結果顯示青少年短影音使用與睡眠結果相關，來源 ${index}。`,
    governanceFlags: [
      "exact_support_span_verified",
      ...(index >= 8 ? ["gap_driven_source_augmentation_v1"] : []),
    ],
    sourceRole: index >= 8 ? "gap_driven_augmentation" : "baseline",
    usableSections: ["discussion"],
    sectionTargets: ["discussion"],
    sectionFit: ["discussion"],
    directness: "A",
    evidenceGrounding: "full_text_grounded",
    relevance: "association",
  })) as never;
  const graph = buildWriterClaimGraph({
    workflowId: "workflow",
    evidenceVersion: "version",
    evidenceCards: cards,
    requestedSectionIds: ["discussion"],
    researchQuestion: "青少年短影音使用與睡眠有何關聯？",
    longForm: true,
  });
  const selected = graph.sectionClaimPlans[0]!.allowedAtomicClaimIds;
  assert.equal(selected.length, 10);
  assert.ok(selected.includes("atomic-evidence-8"));
  assert.ok(selected.includes("atomic-evidence-9"));
  assert.equal(new Set(selected.map((id) => id.replace("atomic-evidence-", "source-"))).size, 10);
  assert.ok(graph.centralAnswerContract.sourceIds.includes("source-8"));
  assert.ok(graph.centralAnswerContract.sourceIds.includes("source-9"));
});
