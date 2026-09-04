import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { SourceRecord } from "@workspace/api-zod/source-record";
import {
  replayWriterVNextOffline,
  type ReportWriterEvidenceCard,
} from "./report-writer";

const serviceDir = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.resolve(
  serviceDir,
  "../../../qa/researchforge-writer-closure-final-acceptance-20260823",
);
const fixtureDir = path.join(bundleDir, "fixture/attempt-2");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

test("Attempt 2 replay keeps every previously failed Central Answer claim hard-bound with zero provider calls", () => {
  const cards = readJson<ReportWriterEvidenceCard[]>(path.join(fixtureDir, "evidence-cards.json"));
  const sources = readJson<SourceRecord[]>(path.join(fixtureDir, "accepted-sources.json"));
  const previous = readJson<{
    details: {
      writerDiagnostics: {
        writerVNext: {
          centralAnswerContract: {
            researchQuestion: string;
            supportingClaimIds: string[];
            synthesisClaimIds: string[];
          };
          bodyRealizationAudit: Array<{ claimId: string; realizationStatus: string }>;
        };
      };
    };
  }>(path.join(fixtureDir, "writer-parsed-output.previous.json"));
  const old = previous.details.writerDiagnostics.writerVNext;
  const centralIds = [
    ...old.centralAnswerContract.supportingClaimIds,
    ...old.centralAnswerContract.synthesisClaimIds,
  ];
  const previouslyFailedIds = [...new Set(
    old.bodyRealizationAudit
      .filter((record) => centralIds.includes(record.claimId) && record.realizationStatus !== "fully_realized")
      .map((record) => record.claimId),
  )];
  assert.equal(previouslyFailedIds.length, 7);

  const replay = replayWriterVNextOffline({
    workflowId: cards[0]?.workflowId ?? undefined,
    evidenceVersion: "attempt-2-frozen-20260823",
    evidenceCards: cards,
    acceptedSources: sources,
    requestedSectionIds: [
      "introduction",
      "literature_review",
      "methodology",
      "findings",
      "discussion",
      "limitations",
      "conclusion",
    ],
    researchQuestion: old.centralAnswerContract.researchQuestion,
    preferredCentralClaimIds: centralIds,
    longForm: true,
  });

  assert.equal(replay.status, "pass");
  assert.equal(replay.centralClaimsDropped, 0);
  assert.equal(replay.centralClaimsAssigned, centralIds.length);
  assert.equal(replay.conclusionEligibilityGate.status, "pass");
  assert.equal(replay.conclusionClosureAudit.conclusion_claim_novelty, 0);
  for (const claimId of previouslyFailedIds) {
    const realization = replay.bodyRealizationRegistry.find((record) => record.claimId === claimId);
    assert.equal(realization?.realizationStatus, "fully_realized", claimId);
    assert.equal(realization?.entailmentStatus, "entailed", claimId);
    assert.ok(realization?.paragraphIds.length, claimId);
  }
});
