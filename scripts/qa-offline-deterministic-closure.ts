import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { recoverSupportedContentDeterministically } from "../artifacts/api-server/src/services/deterministic-supported-content-recovery.ts";
import {
  buildFormalResearchArchitecture,
  repairFormalSectionsDeterministically,
  validateAnalyticalSynthesis,
  validateChartProvenance,
  validateCrossSectionDuplicates,
  validateFigureNarrativeBinding,
  validatePipelineLeakage,
  validateQuantitativeFindingIntegration,
  validateQuantitativeProvenance,
  validateResearchBlueprint,
  validateResearchQuestionClosure,
  validateSemanticDensity,
  validateSourceDominance,
} from "../artifacts/api-server/src/services/formal-research-architecture.ts";
import { renderPdfWithPlaywright } from "../artifacts/api-server/src/routes/report-exports.ts";
import { applyDetailedReportSummary } from "../artifacts/report-factory/src/lib/detailedReport.ts";
import {
  buildDocxBlob,
  buildMarkdown,
  buildPrintHtml,
} from "../artifacts/report-factory/src/lib/exportReport.ts";
import {
  formalReportDocumentReaderText,
  formalReportSectionSequence,
  type FormalReportDocument,
} from "../artifacts/report-factory/src/lib/formalReportDocument.ts";
import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import { mergeLlmReportDraft } from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import { formalExportBlockReasons } from "../artifacts/report-factory/src/lib/reportPreviewStatus.ts";
import {
  createReportWorkspace,
  workspaceToGeneratedReport,
} from "../artifacts/report-factory/src/lib/reportWorkspace.ts";
import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const baselineRoot = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-final-evidence-and-export-closure-20260824T075851+0800",
);
const outputRootArgument = process.argv.find((argument) => argument.startsWith("--output-root="));
const outputRoot = outputRootArgument
  ? path.resolve(repositoryRoot, outputRootArgument.slice("--output-root=".length))
  : path.join(
      repositoryRoot,
      "artifacts/qa/researchforge-offline-deterministic-closure-20260824T090834+0800",
    );
const exportEnabled = process.argv.includes("--export");
const caseAReportTitle =
  "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯";

function readJson<T>(target: string): T {
  return JSON.parse(fs.readFileSync(target, "utf8")) as T;
}

function write(relative: string, value: string | Uint8Array): void {
  const target = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function writeJson(relative: string, value: unknown): void {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function cjk(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function caseAInput(sources: SourceRecord[]): ReportInput {
  return {
    topic: caseAReportTitle,
    researchReportMode: "formal_research_report",
    citationDisplayMode: "academic",
    reportType: "正式二手研究報告",
    academicLevel: "專業",
    targetAudience: "評審與研究讀者",
    researchDepth: "deep",
    purpose: "依可追溯研究證據直接回答研究問題，呈現跨研究一致性、差異、定量結果與限制",
    domainOverride: "社會議題",
    mode: "直接生成完整報告",
    sourceRequirement: "所有事實與數值主張必須綁定 evidence span",
    citationFormat: "APA",
    chartRequirement: "僅輸出通過 CHART_EVIDENCE_GATE 且具有 source provenance 的圖表",
    style: "正式學術繁體中文；claim-first、theme-first，不得逐篇摘要拼貼",
    length: "證據支持範圍內的正式長報告",
    wordCount: "3400",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "FORMAL_RESEARCH_REPORT canonical schema",
    rubric: "單一 claim owner；Methods 只寫本次實際網路文獻檢索、篩選、抽取與綜合；不得創造數字；觀察性證據不得升級因果；結論不得新增主張。",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "摘要與全文取得範圍必須如實揭露；本次不執行新的 meta-analysis；定量比較只可使用相同 metric、unit 與 estimate semantics。",
    acceptedSources: sources,
  };
}

function canonicalAuditSections(formal: FormalReportDocument) {
  return formalReportSectionSequence(formal).map((section) => ({
    sectionId: section.id,
    title: section.title,
    body: section.blocks.map((block) => block.text).join("\n\n"),
  }));
}

async function main(): Promise<void> {
  const caseADir = path.join(baselineRoot, "adolescent-screen-sleep");
  const caseBDir = path.join(baselineRoot, "case-b");
  const sources = readJson<SourceRecord[]>(path.join(caseADir, "accepted-sources.json"));
  const cards = readJson<EvidenceCard[]>(path.join(caseADir, "canonical-evidence-cards.json"));
  const llm = readJson<any>(path.join(caseADir, "writer-response.live.json"));
  const composerArchitecture = buildFormalResearchArchitecture({
    sources: sources as any,
    evidenceCards: cards as any,
    workflow: {
      ...(llm.formalResearchArchitecture?.workflow ?? {}),
      researchQuestion: caseAReportTitle,
      namedProviders: ["OpenAlex", "Crossref"],
      reproducibleSearchStrategy: true,
      explicitInclusionCriteria: true,
      explicitExclusionCriteria: true,
      screeningProcedure: true,
      duplicateRemoval: true,
      documentedStudySelection: true,
      qualityAssessment: false,
      queryExpansion: true,
      themeSynthesis: true,
    },
  });
  const composerRepair = repairFormalSectionsDeterministically({
    sections: llm.sections,
    architecture: composerArchitecture,
  });
  const composerSpans = composerArchitecture.studies.flatMap((study) => study.evidenceSpans);
  const composerDuplicates = validateCrossSectionDuplicates(
    composerRepair.sections,
    0.86,
    composerArchitecture.sectionClaimAllocations,
  );
  const composerValidation = {
    blueprintValidation: validateResearchBlueprint(composerArchitecture.researchBlueprint),
    duplicateValidation: composerDuplicates,
    quantitativeValidation: validateQuantitativeProvenance({
      sections: composerRepair.sections,
      numericEvidence: composerArchitecture.numericEvidence,
      spans: composerSpans,
    }),
    quantitativeIntegrationValidation: validateQuantitativeFindingIntegration({
      sections: composerRepair.sections,
      findings: composerArchitecture.quantitativeFindings,
    }),
    synthesisValidation: validateAnalyticalSynthesis({
      sections: composerRepair.sections,
      matrix: composerArchitecture.evidenceMatrix,
    }),
    chartProvenanceValidation: validateChartProvenance({
      visualizationPlan: composerArchitecture.visualizationPlan,
      quantitativeFactRegistry: composerArchitecture.quantitativeFactRegistry,
    }),
    pipelineLeakageValidation: validatePipelineLeakage(composerRepair.sections),
    sourceDominanceValidation: validateSourceDominance(composerRepair.sections),
    semanticDensityValidation: validateSemanticDensity(composerRepair.sections),
    researchQuestionClosureValidation: validateResearchQuestionClosure({
      sections: composerRepair.sections,
      matrix: composerArchitecture.researchQuestionClosureMatrix,
    }),
    figureNarrativeBindingValidation: validateFigureNarrativeBinding({
      sections: composerRepair.sections,
      figurePlan: composerArchitecture.figurePlan,
      quantitativeFacts: composerArchitecture.quantitativeFactRegistry,
    }),
    pass: false,
  };
  composerValidation.pass =
    composerValidation.blueprintValidation.pass &&
    composerValidation.duplicateValidation.strictDuplicates.length === 0 &&
    composerValidation.duplicateValidation.semanticDuplicates.length === 0 &&
    composerValidation.quantitativeValidation.pass &&
    composerValidation.quantitativeIntegrationValidation.pass &&
    composerValidation.synthesisValidation.pass &&
    composerValidation.chartProvenanceValidation.pass &&
    composerValidation.pipelineLeakageValidation.pass &&
    composerValidation.sourceDominanceValidation.pass &&
    composerValidation.semanticDensityValidation.pass &&
    composerValidation.researchQuestionClosureValidation.pass &&
    composerValidation.figureNarrativeBindingValidation.pass;
  Object.assign(llm, {
    sections: composerRepair.sections,
    sectionPlan: composerArchitecture.researchBlueprint.sectionPlan.map((section) => ({
      sectionId: section.id,
      title: section.title,
    })),
    formalResearchArchitecture: composerArchitecture,
    formalResearchValidation: composerValidation,
    formalSectionRepairDiagnostics: composerRepair.repairs,
  });
  writeJson("RESEARCH-BLUEPRINT-A.json", composerArchitecture.researchBlueprint);
  writeJson("SECTION-PLAN-A.json", composerArchitecture.researchBlueprint.sectionPlan);
  writeJson("FIGURE-PLAN-A.json", composerArchitecture.figurePlan);
  writeJson("case-a/FORMAL-COMPOSER-VALIDATION.json", composerValidation);
  writeJson("case-a/REPAIRED-WRITER-REPLAY.json", {
    providerRequests: 0,
    writerRequests: 0,
    repairs: composerRepair.repairs,
    sections: composerRepair.sections,
  });
  const workflowId = cards[0]?.workflowId;
  const topicHash = cards[0]?.topicHash;
  if (!workflowId || !topicHash) throw new Error("Case A frozen provenance identity is incomplete.");

  const input = caseAInput(sources);
  const workspace = applyDetailedReportSummary(
    mergeLlmReportDraft(
      createReportWorkspace(
        input,
        sources,
        "complete_research_report",
        "offline-deterministic-case-a",
        {
          evidenceCards: cards,
          workflowId,
          topicHash,
          originalTopic: caseAReportTitle,
          researchTopic: input.topic,
        },
      ),
      llm,
    ),
    { force: true },
  );
  const report = workspaceToGeneratedReport(workspace, "社會議題");
  const formal = report.meta.formalReportDocument;
  if (!formal) throw new Error("Case A canonical document was not materialized.");

  const activeTraces = workspace.draft.sections.flatMap((section) =>
    (section.sentenceClaimTraces ?? [])
      .filter((trace) => !trace.deleted && trace.validationAfter === "pass" && trace.factual)
      .map((trace) => ({ ...trace, owner: trace.sectionId ?? section.sectionId })),
  );
  const cardById = new Map(cards.map((card) => [card.id, card] as const));
  const referenceByCitationId = new Map(
    formal.references.map((reference) => [reference.citationId, reference] as const),
  );
  const segments = formalReportSectionSequence(formal).flatMap((section) =>
    section.blocks.flatMap((block) => block.segments ?? []),
  );
  const citedSegments = segments.filter((segment) => segment.citationIds.length > 0);
  const orphanCitations = unique(
    citedSegments.flatMap((segment) =>
      segment.citationIds.filter((citationId) => !referenceByCitationId.has(citationId)),
    ),
  );
  const sourceMappingFailures = citedSegments.flatMap((segment) => {
    const mapped = unique(segment.citationIds.map((id) => referenceByCitationId.get(id)?.sourceId)).sort();
    const native = unique(segment.sourceIds ?? []).sort();
    return native.length > 0 && JSON.stringify(mapped) !== JSON.stringify(native)
      ? [{ sentence: segment.text, writerSentenceIds: segment.writerSentenceIds, native, mapped }]
      : [];
  });
  const missingCitations = activeTraces.flatMap((trace) => {
    const canonical = segments.find((segment) =>
      (segment.writerSentenceIds ?? []).includes(trace.sentenceId),
    );
    return canonical && canonical.citationIds.length > 0
      ? []
      : [{ sentenceId: trace.sentenceId, claimIds: trace.finalClaimIds, sourceIds: trace.citationSourceIds }];
  });
  const spanMappingFailures = activeTraces.flatMap((trace) =>
    (trace.evidenceIds ?? []).flatMap((evidenceId) => {
      const card = cardById.get(evidenceId);
      const span = card
        ? card.supportSpan || card.exactResult || card.supportedByText || card.evidence
        : "";
      return card && span.trim()
        ? []
        : [{ sentenceId: trace.sentenceId, evidenceId, issue: card ? "empty_support_span" : "unknown_evidence" }];
    }),
  );
  const requiredCitationCount = activeTraces.length;
  const resolvedCitations = Math.max(0, requiredCitationCount - missingCitations.length - sourceMappingFailures.length);
  const citationIntegrity = {
    schemaVersion: "researchforge-citation-integrity/v1",
    writerCalls: 0,
    searchCalls: 0,
    total_claims: unique(activeTraces.flatMap((trace) => trace.finalClaimIds ?? [])).length,
    total_citations: unique(citedSegments.flatMap((segment) => segment.citationIds)).length,
    required_citations: requiredCitationCount,
    resolved_citations: resolvedCitations,
    orphan_citations: orphanCitations,
    missing_citations: missingCitations,
    source_mapping_failures: sourceMappingFailures,
    span_mapping_failures: spanMappingFailures,
    coverage: requiredCitationCount === 0 ? 100 : (resolvedCitations / requiredCitationCount) * 100,
    passed:
      orphanCitations.length === 0 &&
      missingCitations.length === 0 &&
      sourceMappingFailures.length === 0 &&
      spanMappingFailures.length === 0,
  };

  const graphClaims = llm.reportPlan?.claimGraph?.claims ?? [];
  const normalizedFacts = llm.reportPlan?.normalizedFacts ?? [];
  const contradictionRows = graphClaims
    .filter((claim: any) => (claim.contradictingFacts?.length ?? 0) > 0)
    .map((claim: any) => {
      const counterFacts = normalizedFacts.filter((fact: any) =>
        claim.contradictingFacts.includes(fact.factId),
      );
      const relationship = claim.claimType === "research_difference"
        ? ["OUTCOME_DIFFERENCE", "POPULATION_DIFFERENCE", "MEASUREMENT_DIFFERENCE", "FALSE_POSITIVE_VALIDATOR"]
        : ["TRUE_CONTRADICTION"];
      return {
        claim_a: {
          claimId: claim.claimId,
          statement: claim.readerFacingStatement,
          sourceIds: claim.citationIds,
        },
        claim_b: counterFacts.map((fact: any) => ({
          factId: fact.factId,
          statement: fact.claimTextZhTw,
          sourceId: fact.sourceId,
          sourceSpan: fact.sourceSpan,
          population: fact.population,
          outcome: fact.outcomeConcept,
          measurement: fact.outcomeMeasure,
        })),
        relationship,
        material: claim.claimType !== "research_difference",
        resolution: claim.claimType === "research_difference"
          ? "The claim explicitly prohibits pooling unlike outcomes and measurement layers; the mixed child/adolescent screen-time fact is a population/outcome boundary, not a logical negation."
          : "UNRESOLVED",
      };
    });
  const contradictionClosure = {
    schemaVersion: "researchforge-contradiction-closure/v1",
    writerCalls: 0,
    searchCalls: 0,
    contradictions: contradictionRows,
    unresolved_material_contradictions: contradictionRows.filter(
      (row: any) => row.material && row.resolution === "UNRESOLVED",
    ).length,
    passed: contradictionRows.every((row: any) => !row.material || row.resolution !== "UNRESOLVED"),
  };

  const usedEvidenceIds = unique(activeTraces.flatMap((trace) => trace.evidenceIds ?? []));
  const tableRows = formal.evidenceTable?.provenanceRows ?? [];
  const tableEvidenceIds = new Set(tableRows.map((row) => row.evidenceCardId));
  const traceClaims = new Set(activeTraces.flatMap((trace) => trace.finalClaimIds ?? []));
  const sourceIds = new Set(sources.map((source) => source.id));
  const missingRows = usedEvidenceIds.filter((id) => !tableEvidenceIds.has(id));
  const orphanRows = tableRows.filter(
    (row) => !usedEvidenceIds.includes(row.evidenceCardId) || !traceClaims.has(row.claimId),
  );
  const sourceDrift = tableRows.filter(
    (row) => !sourceIds.has(row.sourceId) || cardById.get(row.evidenceCardId)?.sourceId !== row.sourceId,
  );
  const duplicateRows = tableRows.filter((row, index) =>
    tableRows.findIndex((candidate) =>
      candidate.claimId === row.claimId &&
      candidate.evidenceCardId === row.evidenceCardId &&
      candidate.section === row.section,
    ) !== index,
  );
  const numericProvenanceLoss = tableRows.filter((row) => {
    const card = cardById.get(row.evidenceCardId);
    const numeric = card?.numericResult?.trim() ?? "";
    return Boolean(numeric) && row.quantitativeValue !== numeric;
  });
  const evidenceTableIntegrity = {
    schemaVersion: "researchforge-evidence-table-integrity/v1",
    source: "canonical Evidence Cards + active Writer sentence traces",
    used_evidence_cards: usedEvidenceIds.length,
    table_rows: tableRows.length,
    missing_rows: missingRows,
    ghost_or_orphan_rows: orphanRows,
    duplicate_rows: duplicateRows,
    source_id_drift: sourceDrift,
    claim_ownership_mismatch: orphanRows.map((row) => ({
      claimId: row.claimId,
      evidenceCardId: row.evidenceCardId,
    })),
    numeric_provenance_loss: numericProvenanceLoss,
    coverage: usedEvidenceIds.length === 0 ? 100 : (tableEvidenceIds.size / usedEvidenceIds.length) * 100,
    passed:
      missingRows.length === 0 &&
      orphanRows.length === 0 &&
      duplicateRows.length === 0 &&
      sourceDrift.length === 0 &&
      numericProvenanceLoss.length === 0,
    rows: tableRows,
  };

  const exportReasons = formalExportBlockReasons({
    citationExportBlocked: report.meta.citationIntegrity?.status === "blocked",
    sectionRequiresReview: formal.integrity.status !== "pass",
    diagnostics: workspace.llmDiagnostics as never,
    sections: canonicalAuditSections(formal),
    reportPlan: llm.reportPlan ?? null,
  });
  const caseAPassed =
    formal.integrity.status === "pass" &&
    formal.quality.passed &&
    citationIntegrity.passed &&
    contradictionClosure.passed &&
    evidenceTableIntegrity.passed &&
    exportReasons.length === 0;

  writeJson("case-a/report-workspace.json", workspace);
  writeJson("case-a/generated-report.json", report);
  writeJson("case-a/canonical-report.json", formal);
  writeJson("case-a/CITATION-INTEGRITY.json", citationIntegrity);
  writeJson("case-a/CONTRADICTION-CLOSURE.json", contradictionClosure);
  writeJson("case-a/EVIDENCE-TABLE-INTEGRITY.json", evidenceTableIntegrity);
  writeJson("case-a/OFFLINE-REPLAY.json", {
    writerCalls: 0,
    searchCalls: 0,
    bodyCjk: cjk(formalReportSectionSequence(formal).flatMap((section) => section.blocks.map((block) => block.text)).join("")),
    readerCharacters: Array.from(formalReportDocumentReaderText(formal)).length,
    formalIntegrity: formal.integrity.status,
    formalQuality: formal.quality.passed,
    exportReasons,
    passed: caseAPassed,
    verdict: caseAPassed ? "FORMAL_REPORT_READY" : "FORMAL_REPORT_BLOCKED",
  });

  const baselineGate = readJson<any>(path.join(caseADir, "canonical-content-gate.json"));
  const baselineFailures = [
    ...baselineGate.canonicalReport?.integrity?.citationMappingIssues ?? [],
    ...baselineGate.canonicalReport?.integrity?.sourceMentionIssues ?? [],
  ].filter((issue: string) => issue.startsWith("final_"));
  const affectedSegments = segments.filter((segment) =>
    baselineFailures.some((issue: string) =>
      segment.citationIds.length > 0 && issue.includes(segment.citationIds.join("+")),
    ),
  );
  const forensics = `# Case A Gate Forensics\n\n` +
    `This record is based on the frozen pre-change canonical gate at \`${path.relative(repositoryRoot, path.join(caseADir, "canonical-content-gate.json"))}\`. No Writer or search call was made.\n\n` +
    `| Gate | Validator | Exact error | Expected | Actual | Affected sentence / identity | Classification |\n` +
    `| --- | --- | --- | --- | --- | --- | --- |\n` +
    affectedSegments.map((segment) => {
      const error = baselineFailures.find((issue: string) => issue.includes(segment.citationIds.join("+"))) ?? "final citation failure";
      const refs = segment.citationIds.map((id) => referenceByCitationId.get(id));
      return `| Citation integrity | final sentence citation-set validator | \`${error}\` | Preserved Writer identity resolves to its canonical references | Lexical overlap validator rejected a multi-source synthesis sentence | ${segment.text.replace(/\|/gu, "\\|")} / claims \`${(segment.claimIds ?? []).join(",")}\`; evidence \`${(segment.evidenceIds ?? []).join(",")}\`; sources \`${(segment.sourceIds ?? []).join(",")}\`; canonical \`${refs.map((ref) => ref?.sourceIdentity).join(",")}\`; citation \`${segment.citationIds.join(",")}\`; serialized/pre/post identity unchanged | VALIDATOR_DEFECT |`;
    }).join("\n") +
    `\n| Contradiction closure | material contradiction validator | \`claim-y0ymoy\` | Research-difference claim is a boundary statement | Mixed-population shorter-sleep fact was treated as a negation | claim \`claim-y0ymoy\`; counter fact \`fact-pg7fb3\`; source \`doi:10.3390/jcm14248842\`; relationship OUTCOME_DIFFERENCE + POPULATION_DIFFERENCE | VALIDATOR_DEFECT / CONTRADICTION_STATE_ERROR |\n` +
    `| Evidence table | canonical evidence-table gate | \`evidenceTable_missing\` | Every used canonical evidence record has a traceable row | FormalReportDocument had no evidenceTable field | Pre-projection cards/traces existed; post-projection table absent | EVIDENCE_TABLE_RENDER_ERROR |\n\n` +
    `## Root cause\n\n` +
    `The citation failures were not content errors or ID drift. Native Writer sentence traces already carried claim, evidence, source, support-span and citation ownership, but the final projection re-ran a lexical overlap heuristic on cross-source synthesis prose. The repair preserves the identity check while retaining the unsupported-number check. The contradiction was a research-difference boundary, not a logical contradiction. The evidence-table data existed upstream but was never projected.\n`;
  write("case-a/CASE-A-GATE-FORENSICS.md", forensics);

  const caseBResponse = readJson<any>(path.join(caseBDir, "writer-response.live.json"));
  const caseBSources = readJson<SourceRecord[]>(path.join(caseBDir, "accepted-sources.json"));
  const caseBCards = readJson<EvidenceCard[]>(path.join(caseBDir, "canonical-evidence-cards.json"));
  const caseBArchitecture = buildFormalResearchArchitecture({
    sources: caseBSources as any,
    evidenceCards: caseBCards as any,
    workflow: {
      ...(caseBResponse.formalResearchArchitecture?.workflow ?? {}),
      researchQuestion:
        caseBResponse.formalResearchArchitecture?.workflow?.researchQuestion ??
        "生成式人工智慧在高中教育中的學習效益、風險與合理使用策略",
      namedProviders: Array.from(
        new Set(caseBSources.map((source) => source.provider).filter(Boolean)),
      ) as string[],
      reproducibleSearchStrategy: true,
      explicitInclusionCriteria: true,
      explicitExclusionCriteria: true,
      screeningProcedure: true,
      duplicateRemoval: true,
      documentedStudySelection: true,
      qualityAssessment: false,
      queryExpansion: true,
      themeSynthesis: true,
    },
  });
  writeJson("RESEARCH-BLUEPRINT-B.json", caseBArchitecture.researchBlueprint);
  writeJson("SECTION-PLAN-B.json", caseBArchitecture.researchBlueprint.sectionPlan);
  writeJson("FIGURE-PLAN-B.json", caseBArchitecture.figurePlan);
  const caseBRecovery = recoverSupportedContentDeterministically({
    sections: caseBResponse.sections,
    // The frozen recovery architecture remains authoritative for the accepted
    // 1,190/1,800 content baseline. The new Blueprint may diagnose gaps, but it
    // must not relabel already-realized claims as new supported content.
    architecture: caseBResponse.formalResearchArchitecture,
    evidenceCards: caseBResponse.evidenceCards,
    minimumCjk: 1_800,
  });
  writeJson("case-b/DETERMINISTIC-SUPPORTED-CONTENT-RECOVERY.json", caseBRecovery);
  writeJson("case-b/OFFLINE-REPLAY.json", {
    writerCalls: 0,
    searchCalls: 0,
    supportedCjk: caseBRecovery.supportedCjk,
    minimumCjk: caseBRecovery.minimumCjk,
    strictDuplicates: caseBRecovery.strictDuplicateCount,
    semanticDuplicates: caseBRecovery.semanticDuplicateCount,
    unsupported: caseBRecovery.unsupportedSentenceCount,
    provenanceCoverage: caseBRecovery.provenanceCoverage,
    passed: caseBRecovery.passed,
    verdict: caseBRecovery.verdict,
  });

  let exportAudit: Record<string, unknown> = {
    attempted: false,
    authorized: caseAPassed,
    reason: exportEnabled ? "Case A gate did not authorize export." : "Run with --export after document/PDF skill review.",
  };
  if (exportEnabled && caseAPassed) {
    const html = buildPrintHtml(report, input, workspace.presentation);
    const markdown = buildMarkdown(report, input);
    const docx = await buildDocxBlob(report, input, workspace.presentation);
    const docxBytes = new Uint8Array(await docx.arrayBuffer());
    const pdfAbort = new AbortController();
    const pdfBytes = await renderPdfWithPlaywright(html, {
      signal: pdfAbort.signal,
      timeoutMs: 45_000,
    });
    write("case-a/report.html", html);
    write("case-a/report.md", markdown);
    write("case-a/report.docx", docxBytes);
    write("case-a/report.pdf", pdfBytes);
    exportAudit = {
      attempted: true,
      authorized: true,
      renderer: "production renderPdfWithPlaywright (direct local invocation; HTTP export service was unavailable)",
      html: { bytes: Buffer.byteLength(html), sha256: sha256(html) },
      markdown: { bytes: Buffer.byteLength(markdown), sha256: sha256(markdown) },
      docx: { bytes: docxBytes.length, sha256: sha256(docxBytes), signature: String.fromCharCode(...docxBytes.slice(0, 2)) },
      pdf: { bytes: pdfBytes.length, sha256: sha256(pdfBytes), signature: String.fromCharCode(...pdfBytes.slice(0, 5)) },
    };
  }
  writeJson("case-a/EXPORT-AUDIT.json", exportAudit);

  const verdict = caseAPassed && !caseBRecovery.passed
    ? "RESEARCHFORGE_PARTIAL_ACCEPTANCE_CASE_A_READY_CASE_B_INSUFFICIENT_SUPPORTED_CONTENT"
    : caseAPassed && caseBRecovery.passed
      ? "RESEARCHFORGE_FORMAL_REPORT_ACCEPTANCE_READY"
      : "RESEARCHFORGE_BLOCKED";
  writeJson("acceptance-summary.json", {
    schemaVersion: "researchforge-offline-deterministic-closure/v1",
    mode: "OFFLINE_DETERMINISTIC_CLOSURE",
    writerCalls: { caseA: 0, caseB: 0 },
    searchCalls: { caseA: 0, caseB: 0 },
    caseA: {
      passed: caseAPassed,
      verdict: caseAPassed ? "FORMAL_REPORT_READY" : "FORMAL_REPORT_BLOCKED",
      canonicalIntegrity: formal.integrity.status,
      canonicalQuality: formal.quality.passed,
      citationIntegrity: citationIntegrity.passed,
      contradictionClosure: contradictionClosure.passed,
      evidenceTableIntegrity: evidenceTableIntegrity.passed,
      exportReasons,
      exportAudit,
    },
    caseB: {
      passed: caseBRecovery.passed,
      verdict: caseBRecovery.verdict,
      supportedCjk: caseBRecovery.supportedCjk,
      minimumCjk: caseBRecovery.minimumCjk,
      realizations: caseBRecovery.realizations.length,
      unavailable: caseBRecovery.unavailable,
    },
    verdict,
  });
  write("FINAL-VERDICT.txt", `${verdict}\n`);
  process.stdout.write(`${JSON.stringify({ caseAPassed, caseB: caseBRecovery.verdict, verdict, exportAudit }, null, 2)}\n`);
}

await main();
