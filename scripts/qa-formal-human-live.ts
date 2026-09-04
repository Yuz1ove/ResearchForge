import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import {
  buildDocxBlob,
  buildMarkdown,
  buildPrintHtml,
  downloadPdf,
} from "../artifacts/report-factory/src/lib/exportReport.ts";
import { applyDetailedReportSummary } from "../artifacts/report-factory/src/lib/detailedReport.ts";
import { mergeLlmReportDraft, requestLlmReportDraft } from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import { formalReportDocumentReaderText } from "../artifacts/report-factory/src/lib/formalReportDocument.ts";
import { createReportWorkspace, workspaceToGeneratedReport } from "../artifacts/report-factory/src/lib/reportWorkspace.ts";
import { formalExportBlockReasons } from "../artifacts/report-factory/src/lib/reportPreviewStatus.ts";
import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";
import type { ReportPlan } from "../lib/api-zod/src/research-grounding.ts";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    "artifacts/qa/researchforge-formal-human-acceptance-20260823T230500",
);
const inputDir = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_INPUT_DIR ?? outputDir,
);
const apiOrigin = (process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3110").replace(/\/+$/u, "");
const deferExport = process.env.RESEARCHFORGE_QA_DEFER_EXPORT === "1";
const nativeFetch = globalThis.fetch;
const protectedFixture = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const documentMarker = "/Users/Yuz1ove/.codex/plugins/cache/openai-primary-runtime/documents/26.819.11345/skills/documents/container_tools/mark_artifact_operation_started.mjs";
const pdfMarker = "/Users/Yuz1ove/.codex/plugins/cache/openai-primary-runtime/pdf/26.819.11345/skills/pdf/container_tools/mark_artifact_operation_started.mjs";

const cases = [
  {
    slug: "exercise-blood-pressure",
    topic: "規律有氧運動對成人收縮壓與舒張壓的影響",
    domain: "醫療／長照／社工／心理",
    targetWordCount: "2600",
    requiresQuantitativeChart: true,
  },
  {
    slug: "adolescent-screen-sleep",
    topic: "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯",
    domain: "社會議題",
    targetWordCount: "3400",
    // No two accepted study-level values share compatible metric, unit, and
    // estimate semantics, so Figure 4 must remain rejected fail closed.
    requiresQuantitativeChart: false,
  },
  {
    slug: "case-b",
    topic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    domain: "教育研究／人工智慧",
    targetWordCount: "2600",
    requiresQuantitativeChart: false,
  },
] as const;

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(inputDir, relative), "utf8")) as T;
}

function artifactSlug(config: (typeof cases)[number]): string {
  return process.env.RESEARCHFORGE_QA_CASE_OUTPUT_SLUG?.trim() || config.slug;
}

function write(relative: string, value: Uint8Array | string): void {
  const target = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value);
  fs.renameSync(temporary, target);
}

function writeJson(relative: string, value: unknown): void {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function shaFile(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function cjk(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function reportInput(config: (typeof cases)[number], sources: SourceRecord[]): ReportInput {
  return {
    topic: config.topic,
    researchReportMode: "formal_research_report",
    citationDisplayMode: "academic",
    reportType: "正式二手研究報告",
    academicLevel: "專業",
    targetAudience: "評審與研究讀者",
    researchDepth: "deep",
    purpose: "依可追溯研究證據直接回答研究問題，呈現跨研究一致性、差異、定量結果與限制",
    domainOverride: config.domain,
    mode: "直接生成完整報告",
    sourceRequirement: "所有事實與數值主張必須綁定 evidence span",
    citationFormat: "APA",
    chartRequirement: "僅輸出通過 CHART_EVIDENCE_GATE 且具有 source provenance 的圖表",
    style: "正式學術繁體中文；claim-first、theme-first，不得逐篇摘要拼貼",
    length: "證據支持範圍內的正式長報告",
    wordCount: config.targetWordCount,
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

function visualSemanticsPass(visuals: Json[]): boolean {
  return visuals.every((visual) => {
    const status = String(visual.status ?? "");
    if (status === "APPROVED") {
      return list(visual.sourceIds).length > 0 && Boolean(visual.derivationRule) && Boolean(visual.sourceNote);
    }
    return status === "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART" && list(visual.rejectionReasons).length > 0;
  });
}

async function runCase(config: (typeof cases)[number]): Promise<Json> {
  const startedAt = new Date().toISOString();
  const outputSlug = artifactSlug(config);
  const sources = readJson<SourceRecord[]>(`${config.slug}/accepted-sources.json`);
  const evidenceCards = readJson<EvidenceCard[]>(`${config.slug}/canonical-evidence-cards.json`);
  const reportPlan = readJson<ReportPlan>(`${config.slug}/report-plan.json`);
  const contract = readJson<Json>(`${config.slug}/topic-integrity-contract.json`);
  const offlineGate = readJson<{ passed: boolean }>(`${config.slug}/offline-content-gate.json`);
  if (!offlineGate.passed) throw new Error(`${config.slug}: offline content gate was not passed`);
  const input = reportInput(config, sources);
  const runId = `formal-human-${config.slug}-${randomUUID()}`;
  const workflowId = String(sources[0]?.workflowId ?? evidenceCards[0]?.workflowId);
  const topicHash = String(sources[0]?.topicHash ?? evidenceCards[0]?.topicHash);
  const writerRequestAttempts = 1;
  let writerRequests = 0;
  let evidenceSetRequests = 0;
  const upstreamFetch = globalThis.fetch;
  globalThis.fetch = (async (request, init) => {
    const url = String(request);
    if (/\/api\/report-drafts(?:\?|$)/u.test(url)) writerRequests += 1;
    if (/\/api\/report-evidence-sets(?:\?|$)/u.test(url)) evidenceSetRequests += 1;
    return upstreamFetch(request, init);
  }) as typeof fetch;
  let llm: Awaited<ReturnType<typeof requestLlmReportDraft>>;
  try {
    llm = await requestLlmReportDraft({
      reportInput: input,
      workflowId,
      jobId: runId,
      topicHash,
      originalTopic: config.topic,
      displayTitle: config.topic,
      acceptedSources: sources,
      evidenceCards,
      reportPlan,
      generationMode: "complete_research_report",
      timeoutMs: 900_000,
    });
  } finally {
    globalThis.fetch = upstreamFetch;
  }
  writeJson(`${outputSlug}/writer-response.live.json`, llm);
  writeJson(`${outputSlug}/live-call-counts.json`, {
    writerRequestAttempts,
    contentBearingReportDraftRequests: writerRequests,
    evidenceSetPreflightRequests: evidenceSetRequests,
    transportRetries: 0,
    contentReruns: 0,
  });

  const validation = record(llm.formalResearchValidation);
  const duplicate = record(validation.duplicateValidation);
  const quantitative = record(validation.quantitativeValidation);
  const quantitativeIntegration = record(validation.quantitativeIntegrationValidation);
  const synthesis = record(validation.synthesisValidation);
  const architecture = record(llm.formalResearchArchitecture);
  const checkpoint = record(llm.formalResearchCheckpoint);
  const diagnostics = record(llm.writerDiagnostics);
  const vnext = record(diagnostics.writerVNext);
  const centralContract = record(vnext.centralAnswerContract);
  const requiredClaims = list<Json>(centralContract.requiredClaims);
  const realization = list<Json>(vnext.bodyRealizationAudit);
  const fullyRealized = requiredClaims.filter((claim) =>
    realization.some((item) => item.claimId === claim.centralClaimId && item.realizationStatus === "fully_realized" && item.entailmentStatus === "entailed"),
  );
  const conclusionGate = record(vnext.conclusionEligibilityGate);
  const conclusionAudit = record(vnext.conclusionClosureAudit);
  const visuals = list<Json>(architecture.visualizationPlan);
  const sectionReaderText = llm.sections.map((section) => `${section.title}\n${section.prose}`).join("\n");
  const citedEvidenceIds = new Set(llm.sections.flatMap((section) => list<string>(section.evidenceCardIds)));
  const citedCaseBFacets = {
    benefit: evidenceCards.some((card) => /:targeted:benefit$/u.test(card.evidenceId) && citedEvidenceIds.has(card.evidenceId)),
    limitation: evidenceCards.some((card) => /:targeted:limitation(?:-|$)/u.test(card.evidenceId) && citedEvidenceIds.has(card.evidenceId)),
    risk: evidenceCards.some((card) => /:targeted:risk$/u.test(card.evidenceId) && citedEvidenceIds.has(card.evidenceId)),
  };
  const unsupportedSentenceCount = llm.sections.reduce(
    (sum, section) => sum + list(section.unsupportedSentences).length,
    0,
  );
  const sectionDegradationCount = list(llm.sectionDegradationDiagnostics).length;
  writeJson(`${outputSlug}/ACCEPTED-SOURCES.json`, sources);
  writeJson(
    `${outputSlug}/STRUCTURED-STUDY-EVIDENCE.json`,
    list(architecture.studies),
  );
  writeJson(`${outputSlug}/EVIDENCE-MATRIX.json`, list(architecture.evidenceMatrix));
  writeJson(`${outputSlug}/CLAIM-ALLOCATION.json`, {
    allocations: list(architecture.sectionClaimAllocations),
    ownership: list(architecture.sectionClaimOwnership),
  });
  writeJson(`${outputSlug}/QUANTITATIVE-FINDINGS-REGISTRY.json`, {
    findings: list(architecture.quantitativeFindingsRegistry),
    facts: list(architecture.quantitativeFactRegistry),
  });
  writeJson(`${outputSlug}/VISUALIZATION-PLAN.json`, visuals);
  writeJson(
    `${outputSlug}/CHART-PROVENANCE.json`,
    record(validation.chartProvenanceValidation),
  );
  writeJson(`${outputSlug}/FORMAL-RESEARCH-CHECKPOINT.json`, checkpoint);
  writeJson(
    `${outputSlug}/SEMANTIC-REUSE-REPORT.json`,
    list(duplicate.semanticReuseReport),
  );
  writeJson(
    `${outputSlug}/SECTION-DEGRADATION-DIAGNOSTICS.json`,
    list(llm.sectionDegradationDiagnostics),
  );
  const contentChecks = {
    writerRequestExactlyOnce: writerRequests === 1,
    writerSuccess: llm.llm_status === "success" && llm.reportGenerationStatus === "success",
    noFallback: llm.fallbackUsed === false && llm.fallback_used === false && llm.degradedMode !== true,
    formalValidationPass: validation.pass === true,
    zeroStrictDuplicates: list(duplicate.strictDuplicates).length === 0,
    zeroSemanticDuplicates: list(duplicate.semanticDuplicates).length === 0,
    quantitativeProvenancePass: quantitative.pass === true,
    quantitativeVisibleInBody:
      quantitative.pass === true &&
      (Number(quantitative.claims ?? 0) === 0 ||
        (Number(quantitative.bodyNumericClaimCoverage ?? 0) === 100 &&
          quantitativeIntegration.pass === true &&
          Number(quantitativeIntegration.coverage ?? 0) === 100)),
    synthesisPass: synthesis.pass === true,
    completeArchitecture: llm.sections.length >= 7,
    noUnsupportedSection: llm.sections.every((section) => section.groundingStatus !== "unsupported"),
    zeroUnsupportedSentences: unsupportedSentenceCount === 0,
    zeroSectionDegradation: sectionDegradationCount === 0,
    checkpointV2: checkpoint.schemaVersion === "formal-research-checkpoint.v2",
    contentIntegrityValidated: checkpoint.contentIntegrityValidated === true && checkpoint.safeToResume === true,
    policyBound: checkpoint.topicIntegrityVersion === contract.schemaVersion && checkpoint.relevancePolicyVersion === contract.policyVersion,
    centralAnswerComplete: requiredClaims.length > 0 && fullyRealized.length === requiredClaims.length,
    conclusionClosedWorld: conclusionGate.status === "pass" && conclusionAudit.passed === true && Number(conclusionAudit.conclusion_claim_novelty ?? -1) === 0,
    visualizationSemantics: visualSemanticsPass(visuals),
    chartProvenancePass:
      record(validation.chartProvenanceValidation).pass === true,
    evidenceGroundedQuantitativeChart:
      !config.requiresQuantitativeChart ||
      visuals.some((visual) =>
        visual.type === "quantitative_chart" &&
        visual.status === "APPROVED" &&
        list(visual.sourceIds).length > 0 &&
        list(visual.numericEvidenceIds).length > 0 &&
        record(visual.provenance).generatedFromValidatedFactsOnly === true,
      ),
    caseBSupportedLength: config.slug !== "case-b" || cjk(sectionReaderText) >= 1800,
    caseBFacetRealization:
      config.slug !== "case-b" || Object.values(citedCaseBFacets).every(Boolean),
    caseBNoSummaryPatchwork:
      config.slug !== "case-b" ||
      (synthesis.pass === true &&
        !/(?:研究|文獻)[一二三四五六七八九十A-ZＡ-Ｚ]\s*(?:指出|顯示|認為).*(?:研究|文獻)[一二三四五六七八九十A-ZＡ-Ｚ]\s*(?:指出|顯示|認為)/su.test(sectionReaderText)),
  };
  const contentPassed = Object.values(contentChecks).every(Boolean);
  writeJson(`${outputSlug}/writer-content-gate.json`, {
    passed: contentPassed,
    checks: contentChecks,
    centralAnswer: { required: requiredClaims.length, fullyRealized: fullyRealized.length },
    conclusionEligibilityGate: conclusionGate,
    conclusionClosureAudit: conclusionAudit,
    writerReaderCjk: cjk(sectionReaderText),
    citedCaseBFacets,
    unsupportedSentenceCount,
    sectionDegradationCount,
  });
  if (!contentPassed) {
    writeJson(`${outputSlug}/CANONICAL-CONTENT-GATE.json`, {
      passed: false,
      notRun: true,
      reason: "writer_content_gate_blocked",
      contentChecks,
    });
    write(
      `${outputSlug}/FINAL-REPORT.md`,
      `# FORMAL_REPORT_NOT_EXPORTED\n\nTopic: ${config.topic}\n\nThe Writer content gate did not pass. No canonical report or export was produced.\n`,
    );
    return {
      slug: config.slug,
      status: "BLOCKED_CONTENT_GATE",
      writerRequests,
      contentChecks,
      exported: false,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  const workspace = applyDetailedReportSummary(
    mergeLlmReportDraft(
      createReportWorkspace(input, sources, "complete_research_report", runId, {
        evidenceCards,
        workflowId,
        topicHash,
        originalTopic: config.topic,
        researchTopic: config.topic,
      }),
      llm,
    ),
    { force: true },
  );
  const report = workspaceToGeneratedReport(workspace, config.domain);
  const formal = report.meta.formalReportDocument;
  if (!formal) throw new Error(`${config.slug}: canonical FormalReportDocument missing`);
  const readerText = formalReportDocumentReaderText(formal);
  const exportReasons = formalExportBlockReasons({
    citationExportBlocked: report.meta.citationIntegrity?.status === "blocked",
    sectionRequiresReview: workspace.draft.sections.some((section) => section.groundingStatus === "unsupported"),
    diagnostics: workspace.llmDiagnostics as never,
    sections: workspace.draft.sections,
    reportPlan: llm.reportPlan ?? reportPlan,
  });
  const formalBodySections = [
    formal.researchQuestion,
    formal.scopeAndMethod,
    ...formal.analysisSections,
    formal.crossSourceSynthesis,
    formal.limitations,
    formal.conclusion,
  ];
  const tables = [formal.evidenceTable, ...formalBodySections.flatMap((section) => section.tables)].filter(Boolean);
  const figures = formalBodySections.flatMap((section) => section.figures);
  const canonicalChecks = {
    formalQualityPass: formal.quality.passed,
    methodologyPass: formal.methodology.passed,
    citationIntegrityPass: formal.integrity.status === "pass",
    exportGateClear: exportReasons.length === 0,
    supportedLength: cjk(readerText) >= 1800,
    evidenceTablePresent: tables.length > 0,
    evidenceFigurePresent: figures.length > 0,
    referencesPresent: formal.references.length === sources.length,
    noReaderInternalIds: !/\b(?:source|evidence|claim)[_-][\w-]+|\{s\d+\}/iu.test(readerText),
  };
  const canonicalPassed = Object.values(canonicalChecks).every(Boolean);
  writeJson(`${outputSlug}/canonical-content-gate.json`, {
    passed: canonicalPassed,
    checks: canonicalChecks,
    readerCjk: cjk(readerText),
    tableCount: tables.length,
    figureCount: figures.length,
    referenceCount: formal.references.length,
    exportReasons,
    quality: formal.quality,
    methodology: formal.methodology,
    integrity: formal.integrity,
  });
  writeJson(`${outputSlug}/CANONICAL-CONTENT-GATE.json`, {
    passed: canonicalPassed,
    checks: canonicalChecks,
    readerCjk: cjk(readerText),
    tableCount: tables.length,
    figureCount: figures.length,
    referenceCount: formal.references.length,
    exportReasons,
    quality: formal.quality,
    methodology: formal.methodology,
    integrity: formal.integrity,
  });
  writeJson(`${outputSlug}/report-workspace.json`, workspace);
  writeJson(`${outputSlug}/generated-report.json`, report);
  writeJson(`${outputSlug}/canonical-report.json`, formal);
  if (!canonicalPassed) {
    write(
      `${outputSlug}/FINAL-REPORT.md`,
      `# FORMAL_REPORT_NOT_EXPORTED\n\nTopic: ${config.topic}\n\nThe canonical content gate did not pass. No export was produced.\n`,
    );
    return {
      slug: config.slug,
      status: "BLOCKED_CANONICAL_GATE",
      writerRequests,
      contentChecks,
      canonicalChecks,
      exported: false,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  if (deferExport) {
    write(
      `${outputSlug}/FINAL-REPORT.md`,
      `# FORMAL_REPORT_ACCEPTED_EXPORT_DEFERRED\n\nTopic: ${config.topic}\n\nWriter and canonical content gates passed. Export is deferred until both controlled cases are independently accepted.\n`,
    );
    return {
      slug: config.slug,
      status: "ACCEPTED_PENDING_DUAL_CASE_EXPORT",
      writerRequests,
      contentChecks,
      canonicalChecks,
      contentAuthorized: true,
      exported: false,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  execFileSync(process.execPath, [
    documentMarker,
    "--operation-kind", "create",
    "--expected-output-count", "1",
    "--output-format", "docx",
  ], { stdio: "ignore" });
  const html = buildPrintHtml(report, input, workspace.presentation);
  const markdown = buildMarkdown(report, input);
  const docx = await buildDocxBlob(report, input, workspace.presentation);
  const docxBytes = new Uint8Array(await docx.arrayBuffer());
  execFileSync(process.execPath, [
    pdfMarker,
    "--operation-kind", "create",
    "--expected-output-count", "1",
    "--output-format", "pdf",
  ], { stdio: "ignore" });
  const pdfBlobs: Blob[] = [];
  await downloadPdf(report, input, workspace.presentation, {
    fetchImpl: globalThis.fetch,
    saveBlob(blob) {
      pdfBlobs.push(blob);
    },
  });
  const pdfBlob = pdfBlobs[0];
  if (!pdfBlob) throw new Error(`${config.slug}: PDF export returned no blob`);
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());
  const exportChecks = {
    previewReadable: html.toLocaleLowerCase().includes("<!doctype html>") && html.includes(report.meta.title),
    cjkPresent: /[\u3400-\u9fff]/u.test(html),
    docxReadable: docxBytes[0] === 0x50 && docxBytes[1] === 0x4b,
    pdfReadable: Buffer.from(pdfBytes.slice(0, 5)).toString("ascii") === "%PDF-",
  };
  if (!Object.values(exportChecks).every(Boolean)) throw new Error(`${config.slug}: export readability gate failed`);
  write(`${outputSlug}/preview.html`, html);
  write(`${outputSlug}/formal-report.md`, markdown);
  write(`${outputSlug}/FINAL-REPORT.md`, markdown);
  write(`${outputSlug}/formal-report.docx`, docxBytes);
  write(`${outputSlug}/formal-report.pdf`, pdfBytes);
  writeJson(`${outputSlug}/formal-export-gate.json`, {
    passed: true,
    exportChecks,
    canonicalReaderTextSha256: createHash("sha256").update(readerText).digest("hex"),
    fileSha256: {
      preview: createHash("sha256").update(html).digest("hex"),
      markdown: createHash("sha256").update(markdown).digest("hex"),
      docx: createHash("sha256").update(docxBytes).digest("hex"),
      pdf: createHash("sha256").update(pdfBytes).digest("hex"),
    },
    bytes: { preview: Buffer.byteLength(html), markdown: Buffer.byteLength(markdown), docx: docxBytes.length, pdf: pdfBytes.length },
  });
  return {
    slug: config.slug,
    status: "EXPORTED_PENDING_VISUAL_QA",
    writerRequests,
    contentChecks,
    canonicalChecks,
    exportChecks,
    exported: true,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const offline = readJson<{ status: string }>("offline-acceptance.json");
  if (offline.status !== "PASS") throw new Error("Provider-free offline acceptance did not pass");
  const protectedBefore = shaFile(protectedFixture);
  if (protectedBefore !== expectedProtectedSha) throw new Error("Protected fixture mismatch before live Writer");
  globalThis.fetch = (async (request, init) => {
    const rawUrl = String(request);
    const resolved = rawUrl.startsWith("/api/") ? `${apiOrigin}${rawUrl}` : rawUrl;
    return nativeFetch(resolved, init);
  }) as typeof fetch;
  const requestedSlug = process.env.RESEARCHFORGE_QA_TOPIC_SLUG?.trim();
  const selectedCases = requestedSlug
    ? cases.filter((config) => config.slug === requestedSlug)
    : cases;
  if (selectedCases.length === 0) throw new Error(`Unknown controlled case slug: ${requestedSlug}`);
  const results: Json[] = [];
  try {
    for (const config of selectedCases) {
      try {
        results.push(await runCase(config));
      } catch (error) {
        const outputSlug = artifactSlug(config);
        writeJson(`${outputSlug}/CANONICAL-CONTENT-GATE.json`, {
          passed: false,
          notRun: true,
          reason: "live_writer_exception",
          error: error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError",
        });
        write(
          `${outputSlug}/FINAL-REPORT.md`,
          `# FORMAL_REPORT_NOT_EXPORTED\n\nTopic: ${config.topic}\n\nThe controlled live Writer run ended with an exception. No canonical report or export was produced.\n`,
        );
        results.push({
          slug: config.slug,
          status: "BLOCKED_EXCEPTION",
          writerRequests: 1,
          exported: false,
          error: error instanceof Error ? `${error.name}: ${error.message}` : "UnknownError",
        });
      }
    }
  } finally {
    globalThis.fetch = nativeFetch;
  }
  const protectedAfter = shaFile(protectedFixture);
  const allExported = results.every((result) => result.exported === true);
  const allContentAuthorized = results.every((result) => result.contentAuthorized === true);
  const protectedUnchanged = protectedBefore === protectedAfter && protectedAfter === expectedProtectedSha;
  const accepted = deferExport ? allContentAuthorized : allExported;
  writeJson("live-acceptance.json", {
    schemaVersion: "researchforge-formal-human-acceptance-live/v1",
    status: accepted && protectedUnchanged
      ? deferExport
        ? "PASS_CONTENT_AUTHORIZED_EXPORT_DEFERRED"
        : "PASS_PENDING_VISUAL_QA"
      : "BLOCKED",
    completedAt: new Date().toISOString(),
    topics: results,
    protectedFixture: { expectedProtectedSha, protectedBefore, protectedAfter, protectedUnchanged },
  });
  process.stdout.write(`${accepted && protectedUnchanged ? deferExport ? "LIVE_CONTENT_PASS_EXPORT_DEFERRED" : "LIVE_EXPORT_PASS_PENDING_VISUAL_QA" : "LIVE_ACCEPTANCE_BLOCKED"}\n${outputDir}\n`);
  if (!accepted || !protectedUnchanged) process.exitCode = 2;
}

if (process.env.RESEARCHFORGE_QA_COMPILE_ONLY !== "1") {
  void main().catch((error) => {
    globalThis.fetch = nativeFetch;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
