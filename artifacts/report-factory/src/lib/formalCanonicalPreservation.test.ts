import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildFormalReportDocument,
  formalReportSectionSequence,
  type FormalReportDocument,
} from "./formalReportDocument.ts";
import type { ReportDraftSentenceClaimTrace } from "./reportDraft.ts";
import type { ReportWorkspace } from "./reportWorkspace.ts";

const frozenWorkspacePath = new URL(
  "../../../qa/researchforge-writer-final-closure-acceptance-20260823-123552/live-run-2/writer-canonical-input.json",
  import.meta.url,
);

function frozenWorkspace(): ReportWorkspace {
  return JSON.parse(readFileSync(frozenWorkspacePath, "utf8")) as ReportWorkspace;
}

function bodyText(document: FormalReportDocument): string {
  return formalReportSectionSequence(document)
    .flatMap((section) => section.blocks.map((block) => block.text))
    .join("\n\n");
}

function cjk(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function normalizedSentence(value: string): string {
  return value
    .replace(/\[[^\]]+\]/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLocaleLowerCase("zh-TW");
}

function strictDuplicateCount(value: string): number {
  const sentences = value
    .split(/(?<=[。！？!?；;])/u)
    .map(normalizedSentence)
    .filter((sentence) => sentence.length >= 18);
  return sentences.length - new Set(sentences).size;
}

function uniqueSourceBindings(workspace: ReportWorkspace, count: number) {
  const seen = new Set<string>();
  return workspace.evidenceCards.flatMap((card) => {
    if (seen.has(card.sourceId)) return [];
    seen.add(card.sourceId);
    return [{ sourceId: card.sourceId, evidenceId: card.id }];
  }).slice(0, count);
}

function addSupportCorpus(
  workspace: ReportWorkspace,
  bindings: Array<{ sourceId: string; evidenceId: string }>,
  texts: string[],
): void {
  bindings.forEach((binding, index) => {
    const text = texts[index] ?? texts[0] ?? "";
    workspace.acceptedSources = workspace.acceptedSources.map((source) =>
      source.id === binding.sourceId
        ? {
            ...source,
            extractedText: `${source.extractedText ?? ""} ${text}`,
            mainEvidencePointZhTw: `${source.mainEvidencePointZhTw ?? ""} ${text}`,
          }
        : source
    );
    workspace.evidenceCards = workspace.evidenceCards.map((card) =>
      card.id === binding.evidenceId
        ? {
            ...card,
            claimTextZhTw: `${card.claimTextZhTw ?? ""} ${text}`,
            supportedByText: `${card.supportedByText ?? ""} ${text}`,
            supportSpan: `${card.supportSpan ?? ""} ${text}`,
          }
        : card
    );
  });
}

function trace(input: {
  sentenceId: string;
  text: string;
  claimId: string;
  evidenceId: string;
  sourceId: string;
  paragraphId?: string;
}): ReportDraftSentenceClaimTrace {
  return {
    sentenceId: input.sentenceId,
    sectionId: "findings",
    paragraphId: input.paragraphId ?? "findings-p1",
    originalText: input.text,
    finalText: input.text,
    originalClaimIds: [input.claimId],
    finalClaimIds: [input.claimId],
    realizedClaimIds: [input.claimId],
    evidenceIds: [input.evidenceId],
    citationSourceIds: [input.sourceId],
    citationIds: [input.sourceId],
    factual: true,
    validation: "pass",
    action: "UNCHANGED",
    actionReason: "canonical_preservation_fixture",
    repairStage: "A_PRESERVE",
    repairAttempts: 0,
    providerUsed: null,
    validationBefore: "pass",
    validationAfter: "pass",
    deleted: false,
  };
}

function replaceFindingsTraces(
  workspace: ReportWorkspace,
  traces: ReportDraftSentenceClaimTrace[],
): void {
  const prose = traces.map((item) => item.finalText).join(" ");
  workspace.draft.sections = workspace.draft.sections.map((section) =>
    section.sectionId === "findings"
      ? {
          ...section,
          body: prose,
          prose,
          synthesizedProseZhTw: prose,
          sentenceClaimTraces: traces,
          citationIds: [...new Set(traces.flatMap((item) => item.citationSourceIds))],
          supportingSourceIds: [...new Set(traces.flatMap((item) => item.citationSourceIds))],
        }
      : section
  );
}

function canonicalFindings(document: FormalReportDocument) {
  return document.analysisSections.find((section) => section.id === "findings")!;
}

test("P1 frozen Writer artifact preserves lineage but is blocked when repeated fallback synthesis remains", () => {
  const document = buildFormalReportDocument(frozenWorkspace());
  const body = bodyText(document);
  const bodySections = formalReportSectionSequence(document);
  const provenancePoints = bodySections
    .flatMap((section) => section.figures)
    .reduce((sum, figure) =>
      sum + ("provenance" in figure
        ? (figure.provenance as { dataPoints?: unknown[] }).dataPoints?.length ?? 0
        : 0), 0);

  assert.equal(document.integrity.status, "blocked");
  assert.ok(document.quality.retryPlan.some((retry) =>
    retry.reasons.some((reason) => reason.startsWith("FAIL_WRITER_SUBSTANTIVE_SYNTHESIS:"))
  ));
  assert.equal(document.integrity.writerPreservation.status, "pass");
  assert.equal(document.integrity.writerPreservation.requiredClaimIds.length, 99);
  assert.deepEqual(document.integrity.writerPreservation.missingSentenceIds, []);
  assert.deepEqual(document.integrity.writerPreservation.missingClaimIds, []);
  assert.deepEqual(document.integrity.writerPreservation.missingEvidenceIds, []);
  assert.deepEqual(document.integrity.writerPreservation.missingSourceIds, []);
  assert.ok(cjk(body) >= 7_000);
  assert.equal(strictDuplicateCount(body), 0);
  assert.equal(bodySections.flatMap((section) => section.figures).length, 4);
  assert.equal(document.appendix.flatMap((section) => section.tables).length, 3);
  assert.equal(document.evidenceTable.provenanceRows.length > 0, true);
  assert.equal(document.evidenceTable.columns.length, 3);
  assert.equal(provenancePoints, 15);
});

test("P2 exact duplicate with identical role and lineage renders once and merges sentence identities", () => {
  const workspace = frozenWorkspace();
  const [binding] = uniqueSourceBindings(workspace, 1);
  assert.ok(binding);
  const text = "在青少年樣本中，夜間短影音使用與較晚入睡呈方向性關聯。";
  addSupportCorpus(workspace, [binding], [text]);
  replaceFindingsTraces(workspace, [
    trace({ sentenceId: "p2-exact-a", text, claimId: "p2-claim", ...binding }),
    trace({ sentenceId: "p2-exact-b", text, claimId: "p2-claim", ...binding }),
  ]);

  const document = buildFormalReportDocument(workspace);
  const findings = canonicalFindings(document);
  assert.equal(findings.blocks.filter((block) => block.text.includes(text)).length, 1);
  assert.equal(findings.blocks.some((block) =>
    block.writerSentenceIds?.includes("p2-exact-a") &&
    block.writerSentenceIds.includes("p2-exact-b")
  ), true);
  assert.equal(document.integrity.deduplication.trueDuplicatesRemoved.some((item) =>
    item.removedWriterSentenceIds.includes("p2-exact-b")
  ), true);
});

test("P3 lexical-near claims with different populations and applicability remain distinct", () => {
  const workspace = frozenWorkspace();
  const [binding] = uniqueSourceBindings(workspace, 1);
  assert.ok(binding);
  const adolescent = "在青少年樣本中，夜間短影音使用與較晚入睡呈方向性關聯。";
  const university = "在大學生樣本中，夜間短影音使用與較晚入睡的證據不可直接外推至青少年。";
  addSupportCorpus(workspace, [binding], [`${adolescent} ${university}`]);
  replaceFindingsTraces(workspace, [
    trace({ sentenceId: "p3-adolescent", text: adolescent, claimId: "p3-adolescent-claim", ...binding }),
    trace({ sentenceId: "p3-university", text: university, claimId: "p3-university-claim", ...binding }),
  ]);

  const document = buildFormalReportDocument(workspace);
  const rendered = canonicalFindings(document).blocks.map((block) => block.text).join("");
  assert.match(rendered, /青少年樣本/u);
  assert.match(rendered, /大學生樣本/u);
  assert.match(rendered, /不可直接外推/u);
});

test("P4 same claim with different evidence retains both source/evidence contributions", () => {
  const workspace = frozenWorkspace();
  const bindings = uniqueSourceBindings(workspace, 2);
  assert.equal(bindings.length, 2);
  const text = "夜間短影音使用與較晚入睡呈方向性關聯。";
  addSupportCorpus(workspace, bindings, [text, text]);
  replaceFindingsTraces(workspace, bindings.map((binding, index) =>
    trace({
      sentenceId: `p4-evidence-${index + 1}`,
      text,
      claimId: "p4-shared-claim",
      ...binding,
    })
  ));

  const document = buildFormalReportDocument(workspace);
  const findings = canonicalFindings(document);
  assert.equal(findings.blocks.flatMap((block) => block.writerSentenceIds ?? []).includes("p4-evidence-1"), true);
  assert.equal(findings.blocks.flatMap((block) => block.writerSentenceIds ?? []).includes("p4-evidence-2"), true);
  assert.equal(findings.blocks.flatMap((block) => block.evidenceIds ?? []).includes(bindings[0]!.evidenceId), true);
  assert.equal(findings.blocks.flatMap((block) => block.evidenceIds ?? []).includes(bindings[1]!.evidenceId), true);
  assert.equal(findings.blocks.flatMap((block) => block.sourceIds ?? []).includes(bindings[0]!.sourceId), true);
  assert.equal(findings.blocks.flatMap((block) => block.sourceIds ?? []).includes(bindings[1]!.sourceId), true);
  assert.equal(strictDuplicateCount(findings.blocks.map((block) => block.text).join("")), 0);
});

test("P5 conflicting positive and negative evidence both remain visible", () => {
  const workspace = frozenWorkspace();
  const bindings = uniqueSourceBindings(workspace, 2);
  assert.equal(bindings.length, 2);
  const positive = "一項青少年研究顯示，較高夜間短影音使用與較晚入睡相關。";
  const negative = "另一項青少年研究顯示，完整調整後夜間短影音使用與較晚入睡的關聯未達顯著。";
  addSupportCorpus(workspace, bindings, [positive, negative]);
  replaceFindingsTraces(workspace, [
    trace({ sentenceId: "p5-positive", text: positive, claimId: "p5-positive-claim", ...bindings[0]! }),
    trace({ sentenceId: "p5-negative", text: negative, claimId: "p5-negative-claim", ...bindings[1]! }),
  ]);

  const rendered = canonicalFindings(buildFormalReportDocument(workspace))
    .blocks.map((block) => block.text).join("");
  assert.match(rendered, /較晚入睡相關/u);
  assert.match(rendered, /關聯未達顯著/u);
});

test("P6 unsupported Writer fragment fails closed even when marked validation-pass", () => {
  const workspace = frozenWorkspace();
  const [binding] = uniqueSourceBindings(workspace, 1);
  assert.ok(binding);
  const unsupported = "未有來源支持的介入使睡眠效率提高999.9%。";
  replaceFindingsTraces(workspace, [
    trace({ sentenceId: "p6-unsupported", text: unsupported, claimId: "p6-unsupported-claim", ...binding }),
  ]);

  const document = buildFormalReportDocument(workspace);
  assert.equal(document.integrity.status, "blocked");
  assert.equal(document.integrity.citationMappingIssues.some((issue) =>
    issue.includes("unsupported_number:999.9")
  ), true);
});

test("P7 factual Writer sentence with missing claim/evidence/source lineage fails closed", () => {
  const workspace = frozenWorkspace();
  const [binding] = uniqueSourceBindings(workspace, 1);
  assert.ok(binding);
  const supported = workspace.draft.sections.find((section) => section.sectionId === "findings")
    ?.sentenceClaimTraces?.find((item) => item.factual)?.finalText;
  assert.ok(supported);
  const missingLineage = trace({
    sentenceId: "p7-missing-lineage",
    text: supported,
    claimId: "temporary",
    ...binding,
  });
  missingLineage.originalClaimIds = [];
  missingLineage.finalClaimIds = [];
  missingLineage.realizedClaimIds = [];
  missingLineage.evidenceIds = [];
  missingLineage.citationSourceIds = [];
  missingLineage.citationIds = [];
  replaceFindingsTraces(workspace, [missingLineage]);

  const document = buildFormalReportDocument(workspace);
  assert.equal(document.integrity.status, "blocked");
  assert.equal(document.integrity.factIssues.includes("writer_trace_claim_missing:p7-missing-lineage"), true);
  assert.equal(document.integrity.factIssues.includes("writer_trace_evidence_missing:p7-missing-lineage"), true);
  assert.equal(document.integrity.factIssues.includes("writer_trace_source_missing:p7-missing-lineage"), true);
});

test("P8 canonical JSON round trip preserves substantive Writer sentence and lineage identities", () => {
  const original = buildFormalReportDocument(frozenWorkspace());
  const roundTripped = JSON.parse(JSON.stringify(original)) as FormalReportDocument;
  const originalBlocks = formalReportSectionSequence(original).flatMap((section) => section.blocks);
  const roundTripBlocks = formalReportSectionSequence(roundTripped).flatMap((section) => section.blocks);
  const identities = (blocks: typeof originalBlocks, key: "writerSentenceIds" | "argumentClaimIds" | "evidenceIds" | "sourceIds") =>
    [...new Set(blocks.flatMap((block) => block[key] ?? []))].sort();

  assert.deepEqual(identities(roundTripBlocks, "writerSentenceIds"), identities(originalBlocks, "writerSentenceIds"));
  assert.deepEqual(identities(roundTripBlocks, "argumentClaimIds"), identities(originalBlocks, "argumentClaimIds"));
  assert.deepEqual(identities(roundTripBlocks, "evidenceIds"), identities(originalBlocks, "evidenceIds"));
  assert.deepEqual(identities(roundTripBlocks, "sourceIds"), identities(originalBlocks, "sourceIds"));
  assert.equal(roundTripped.integrity.writerPreservation.status, "pass");
});
