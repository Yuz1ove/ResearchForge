import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceRecoverySemanticSimilarity,
  validateEvidenceRecoveryCycle,
  type EvidenceRecoveryCandidate,
  type EvidenceRecoverySource,
} from "./evidenceRecoveryService";

const material = [
  "A cross-sectional survey included 512 adolescents aged 11–18 years.",
  "Poor sleep quality prevalence was 51.2%.",
  "Bedtime digital media use was significantly associated with poor sleep quality.",
].join(" ");

function source(
  overrides: Partial<EvidenceRecoverySource> = {},
): EvidenceRecoverySource {
  return {
    sourceId: "doi:10.1000/recovery",
    title: "Digital media and adolescent sleep",
    accepted: true,
    materials: [{ type: "structured_abstract", locator: "Abstract", text: material }],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<EvidenceRecoveryCandidate> = {},
): EvidenceRecoveryCandidate {
  return {
    sourceId: "doi:10.1000/recovery",
    normalizedClaimText: "橫斷面調查納入512名11至18歲青少年。",
    facet: "sample_size",
    supports: [
      {
        locator: "Abstract",
        exactText:
          "A cross-sectional survey included 512 adolescents aged 11–18 years.",
      },
    ],
    entailmentReviewed: true,
    claimType: "method",
    usableSections: ["methodology", "limitations"],
    ...overrides,
  };
}

test("bounded recovery accepts exact source-present evidence with stable lineage", () => {
  const input = {
    sources: [source()],
    existingEvidence: [],
    candidates: [candidate()],
  };
  const first = validateEvidenceRecoveryCycle(input);
  const second = validateEvidenceRecoveryCycle(input);

  assert.equal(first.accepted.length, 1);
  assert.equal(first.rejected.length, 0);
  assert.deepEqual(first.accepted[0]?.lineage, {
    sourceId: "doi:10.1000/recovery",
    evidenceId: first.accepted[0]?.evidenceId,
    claimId: first.accepted[0]?.claimId,
    stable: true,
    exactSupportVerified: true,
    entailmentReviewed: true,
  });
  assert.equal(first.accepted[0]?.evidenceId, second.accepted[0]?.evidenceId);
  assert.equal(first.accepted[0]?.claimId, second.accepted[0]?.claimId);
  assert.deepEqual(first.facetsPerSource["doi:10.1000/recovery"], [
    "sample_size",
  ]);
});

test("recovery rejects missing support, unreviewed entailment, and numeric mutation", () => {
  const result = validateEvidenceRecoveryCycle({
    sources: [source()],
    existingEvidence: [],
    candidates: [
      candidate({
        normalizedClaimText: "不存在的結果。",
        supports: [{ locator: "Abstract", exactText: "not in the source" }],
      }),
      candidate({ entailmentReviewed: false }),
      candidate({ normalizedClaimText: "橫斷面調查納入521名11至18歲青少年。" }),
    ],
  });

  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ["support_span_not_found", "entailment_not_reviewed", "number_mutation"],
  );
  assert.equal(result.counts.unsupportedCandidates, 3);
});

test("recovery semantically dedupes against existing and newly recovered cards", () => {
  assert.ok(
    evidenceRecoverySemanticSimilarity(
      "睡眠品質不佳的盛行率為51.2%。",
      "研究顯示睡眠品質不佳盛行率是51.2%。",
    ) > 0.84,
  );
  const duplicate = candidate({
    normalizedClaimText: "研究顯示睡眠品質不佳盛行率是51.2%。",
    facet: "absolute_value",
    supports: [
      { locator: "Abstract", exactText: "Poor sleep quality prevalence was 51.2%." },
    ],
    claimType: "finding",
  });
  const result = validateEvidenceRecoveryCycle({
    sources: [source()],
    existingEvidence: [
      {
        evidenceId: "existing-1",
        sourceId: "doi:10.1000/recovery",
        normalizedClaimText: "睡眠品質不佳的盛行率為51.2%。",
        supportSpans: ["Poor sleep quality prevalence was 51.2%."],
      },
    ],
    candidates: [duplicate, candidate(), candidate({ ...duplicate, normalizedClaimText: "睡眠品質不佳盛行率為51.2%。" })],
  });

  assert.equal(result.accepted.length, 1);
  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ["semantic_duplicate_existing", "semantic_duplicate_existing"],
  );
  assert.equal(result.counts.duplicateCandidates, 2);
});

test("recovery enforces accepted-source identity and a per-source card budget", () => {
  const second = candidate({
    normalizedClaimText: "睡前使用數位媒體與睡眠品質不佳顯著相關。",
    facet: "qualitative_finding",
    supports: [
      {
        locator: "Abstract",
        exactText:
          "Bedtime digital media use was significantly associated with poor sleep quality.",
      },
    ],
    claimType: "association",
  });
  const result = validateEvidenceRecoveryCycle({
    sources: [source(), source({ sourceId: "rejected", accepted: false })],
    existingEvidence: [],
    candidates: [candidate(), second, candidate({ sourceId: "rejected" })],
    options: { maxAddedCardsPerSource: 1 },
  });

  assert.equal(result.accepted.length, 1);
  assert.deepEqual(
    result.rejected.map((item) => item.reason),
    ["source_budget_exceeded", "source_not_accepted"],
  );
  assert.equal(result.counts.cappedCandidates, 1);
});
