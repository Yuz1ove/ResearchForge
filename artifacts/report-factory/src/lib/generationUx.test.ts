import assert from "node:assert/strict";
import test from "node:test";
import type { ReportPlan } from "@workspace/api-zod";

import {
  applyUserOutlineToReportPlan,
  generationStages,
  mapGenerationFailure,
} from "./generationUx.ts";

const PLAN: ReportPlan = {
  workflowId: "wf-1",
  topicHash: "topic-1",
  title: "研究計畫",
  researchQuestion: "研究問題",
  sections: [
    {
      sectionId: "literature_review",
      title: "文獻探討",
      goal: "整理證據",
      requiredEvidenceTypes: ["finding"],
      evidenceCardIds: ["e-1"],
      plannedClaimIds: ["c-1"],
      canonicalSectionRole: "core_evidence",
    },
    {
      sectionId: "conclusion",
      title: "結論",
      goal: "回答問題",
      requiredEvidenceTypes: ["finding"],
      evidenceCardIds: ["e-1"],
      plannedClaimIds: ["c-2"],
      canonicalSectionRole: "conclusion",
    },
    {
      sectionId: "references",
      title: "參考資料",
      goal: "列出來源",
      requiredEvidenceTypes: [],
      evidenceCardIds: [],
      plannedClaimIds: [],
      canonicalSectionRole: "references",
    },
  ],
  plannedClaims: [
    {
      claimId: "c-1",
      claimText: "主張一",
      sectionId: "literature_review",
      supportingEvidenceIds: ["e-1"],
      supportingSourceKeys: ["s-1"],
      evidenceStrength: "moderate",
      scope: "full_text_supported",
      limitations: ["樣本有限"],
      agreementStatus: "single_source",
      allowedCitationKeys: ["cite-1"],
      wordingStrength: "qualified",
    },
    {
      claimId: "c-2",
      claimText: "主張二",
      sectionId: "conclusion",
      supportingEvidenceIds: ["e-1"],
      supportingSourceKeys: ["s-1"],
      evidenceStrength: "moderate",
      scope: "full_text_supported",
      limitations: ["樣本有限"],
      agreementStatus: "single_source",
      allowedCitationKeys: ["cite-1"],
      wordingStrength: "qualified",
    },
  ],
  evidenceGaps: [],
};

test("generation stages expose real states without a fabricated percentage", () => {
  const stages = generationStages({ state: "drafting", evidenceReady: true });
  assert.deepEqual(stages.map((stage) => stage.status), [
    "completed",
    "completed",
    "running",
    "pending",
    "pending",
  ]);
  assert.equal(stages.some((stage) => "progress" in stage), false);
});

test("generation failure maps network errors to the writer stage and retains inputs", () => {
  const failure = mapGenerationFailure(new Error("fetch failed: ECONNRESET"));
  assert.equal(failure.code, "NETWORK_ERROR");
  assert.equal(failure.stage, "writer_request");
  assert.match(failure.retainedState, /主題、來源、證據與報告計畫/u);
});

test("user outline edits reorder, rename, remove, and add without fabricating evidence", () => {
  const edited = applyUserOutlineToReportPlan(PLAN, [
    { sectionId: "conclusion", title: "研究結論" },
    { sectionId: "custom-policy", title: "政策含意" },
  ]);

  assert.deepEqual(edited.sections.map((section) => section.sectionId), [
    "conclusion",
    "custom-policy",
    "references",
  ]);
  assert.equal(edited.sections[0]?.title, "研究結論");
  assert.deepEqual(edited.sections[1]?.evidenceCardIds, []);
  assert.deepEqual(edited.plannedClaims.map((claim) => claim.claimId), ["c-2"]);
  assert.match(edited.evidenceGaps.join(" "), /自訂章節「政策含意」尚無 canonical Evidence Card/u);
});
