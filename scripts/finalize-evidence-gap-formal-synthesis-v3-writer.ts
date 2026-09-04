import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { ReportPlan } from "../lib/api-zod/src/research-grounding.ts";
import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";
import { applyDetailedReportSummary } from "../artifacts/report-factory/src/lib/detailedReport.ts";
import { buildDocxBlob, buildMarkdown, buildPrintHtml, downloadPdf } from "../artifacts/report-factory/src/lib/exportReport.ts";
import { formalReportDocumentReaderText } from "../artifacts/report-factory/src/lib/formalReportDocument.ts";
import {
  compactEvidenceCardsForWriterTransport,
  mergeLlmReportDraft,
  requestLlmReportDraft,
} from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import { formalExportBlockReasons } from "../artifacts/report-factory/src/lib/reportPreviewStatus.ts";
import { createReportWorkspace, workspaceToGeneratedReport } from "../artifacts/report-factory/src/lib/reportWorkspace.ts";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(repositoryRoot, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-evidence-gap-formal-synthesis-v3-20260827T150400+0800");
const replayRoot = path.join(outputRoot, "deterministic-replay");
const apiOrigin = (process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3100").replace(/\/+$/u, "");
const nativeFetch = globalThis.fetch;
const protectedFixture = path.join(repositoryRoot, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const documentMarker = "/Users/Yuz1ove/.codex/plugins/cache/openai-primary-runtime/documents/26.826.11250/skills/documents/container_tools/mark_artifact_operation_started.mjs";
const pdfMarker = "/Users/Yuz1ove/.codex/plugins/cache/openai-primary-runtime/pdf/26.826.11250/skills/pdf/container_tools/mark_artifact_operation_started.mjs";

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}

function write(relative: string, value: string | Uint8Array): void {
  const target = path.join(outputRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value);
  fs.renameSync(temporary, target);
}

function writeJson(relative: string, value: unknown): void {
  write(relative, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function cjk(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function reportInput(topic: string, sources: SourceRecord[]): ReportInput {
  return {
    topic,
    researchReportMode: "formal_research_report",
    citationDisplayMode: "academic",
    reportType: "正式二手研究報告",
    academicLevel: "專業",
    targetAudience: "評審與研究讀者",
    researchDepth: "deep",
    purpose: "依可追溯研究證據回答研究問題並進行跨研究綜合",
    domainOverride: "運動科學與健康",
    mode: "直接生成完整報告",
    sourceRequirement: "所有事實與數值主張必須綁定 exact evidence span",
    citationFormat: "APA",
    chartRequirement: "僅輸出通過來源、數值 lineage 與數據相容性 gate 的圖表",
    style: "正式學術繁體中文；theme-first、claim-first，不逐篇摘要拼貼",
    length: "證據支持範圍內的正式長報告",
    wordCount: "2800",
    formalTone: "需要",
    conversationalTone: "不需要",
    specifiedStructure: "FORMAL_RESEARCH_REPORT canonical schema",
    rubric: "評述與原始研究必須分層；設計類型不得當主題；Methods 只寫真實執行的檢索、篩選、抽取與綜合；不得創造數字；結論不得新增主張。",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "全文與摘要取得範圍必須如實揭露；本次不執行新的 meta-analysis；定量比較只可使用相容的 metric、unit 與 estimate semantics。",
    acceptedSources: sources,
  };
}

async function runFormalCase(config: Json): Promise<Json> {
  const caseId = String(config.caseId);
  const slug = String(config.slug);
  const topic = String(config.topic);
  const replayDir = path.join(replayRoot, "cases", `case-${caseId}-${slug}`);
  const outputDir = `cases/case-${caseId}-${slug}`;
  const sources = readJson<SourceRecord[]>(path.join(replayDir, "accepted-sources.json"));
  const cards = readJson<EvidenceCard[]>(path.join(replayDir, "canonical-evidence-cards.json"));
  const reportPlan = readJson<ReportPlan>(path.join(replayDir, "report-plan.json"));
  const input = reportInput(topic, sources);
  const workflowId = String(reportPlan.workflowId);
  const topicHash = String(reportPlan.topicHash);
  const liveResponsePath = path.join(outputRoot, outputDir, "writer-response.live.json");
  const liveCountsPath = path.join(outputRoot, outputDir, "live-writer-call-counts.json");
  const previousCounts = fs.existsSync(liveCountsPath)
    ? record(readJson<unknown>(liveCountsPath))
    : {};
  const previousWriterRequests = Number(previousCounts.reportDraftRequests ?? 0);
  const previousEvidenceSetRequests = Number(previousCounts.evidenceSetPreflightRequests ?? 0);
  const currentLiveResponse = fs.existsSync(liveResponsePath)
    ? record(readJson<unknown>(liveResponsePath))
    : {};
  const previousReportDraftStatuses = list<number>(previousCounts.reportDraftResponseStatuses).length > 0
    ? list<number>(previousCounts.reportDraftResponseStatuses)
    : previousWriterRequests > 0 && String(currentLiveResponse.warning ?? "").includes("HTTP 413")
      ? [413]
      : [];
  const previousContentGenerationAttempts = Number(
    previousCounts.controlledContentGenerationAttempts ??
      previousReportDraftStatuses.filter((status) => status === 200).length,
  );
  if (fs.existsSync(liveResponsePath)) {
    const backup = path.join(outputRoot, outputDir, "writer-response.preflight-413.json");
    if (!fs.existsSync(backup)) fs.copyFileSync(liveResponsePath, backup);
    if (String(currentLiveResponse.warning ?? "").includes("HTTP 413")) {
      const reportDraftBackup = path.join(outputRoot, outputDir, "writer-response.report-draft-413.json");
      if (!fs.existsSync(reportDraftBackup)) fs.copyFileSync(liveResponsePath, reportDraftBackup);
    }
  }
  if (fs.existsSync(liveCountsPath)) {
    const backup = path.join(outputRoot, outputDir, "live-writer-call-counts.preflight-413.json");
    if (!fs.existsSync(backup)) fs.copyFileSync(liveCountsPath, backup);
    if (previousReportDraftStatuses.includes(413)) {
      const reportDraftBackup = path.join(outputRoot, outputDir, "live-writer-call-counts.report-draft-413.json");
      if (!fs.existsSync(reportDraftBackup)) fs.copyFileSync(liveCountsPath, reportDraftBackup);
    }
  }
  const transportCards = compactEvidenceCardsForWriterTransport(cards);
  const rawCardBytes = Buffer.byteLength(JSON.stringify(cards));
  const compactCardBytes = Buffer.byteLength(JSON.stringify(transportCards));
  const preflightPayloadBytes = Buffer.byteLength(JSON.stringify({
    workflowId,
    topicHash,
    topic: input.topic,
    researchReportMode: input.researchReportMode,
    citationDisplayMode: input.citationDisplayMode,
    acceptedSources: sources,
    evidenceCards: transportCards,
    aliases: [input.topic],
    matchedConcepts: [input.topic],
  }));
  writeJson(`${outputDir}/writer-transport-audit.json`, {
    rawCardBytes,
    compactCardBytes,
    preflightPayloadBytes,
    studyFactV2EnvelopeCountBefore: cards.filter((card) => Boolean(card.structuredStudyFact?.studyFactV2)).length,
    studyFactV2EnvelopeCountAfter: transportCards.filter((card) => Boolean(card.structuredStudyFact?.studyFactV2)).length,
    cardCountUnchanged: transportCards.length === cards.length,
    purpose: "Deduplicate repeated study-level envelopes without removing span-level evidence cards.",
  });
  let writerRequests = 0;
  let evidenceSetRequests = 0;
  const reportDraftResponseStatuses: number[] = [];
  const evidenceSetResponseStatuses: number[] = [];
  globalThis.fetch = (async (request, init) => {
    const raw = String(request);
    const isReportDraft = /\/api\/report-drafts(?:\?|$)/u.test(raw);
    const isEvidenceSet = /\/api\/report-evidence-sets(?:\?|$)/u.test(raw);
    if (isReportDraft) writerRequests += 1;
    if (isEvidenceSet) evidenceSetRequests += 1;
    const resolved = raw.startsWith("/api/") ? `${apiOrigin}${raw}` : request;
    const response = await nativeFetch(resolved, init);
    if (isReportDraft) reportDraftResponseStatuses.push(response.status);
    if (isEvidenceSet) evidenceSetResponseStatuses.push(response.status);
    return response;
  }) as typeof fetch;
  let llm: Awaited<ReturnType<typeof requestLlmReportDraft>>;
  try {
    llm = await requestLlmReportDraft({
      reportInput: input,
      workflowId,
      jobId: `evidence-gap-v3-writer-${caseId}-${randomUUID()}`,
      topicHash,
      originalTopic: topic,
      displayTitle: topic,
      acceptedSources: sources,
      evidenceCards: cards,
      reportPlan,
      generationMode: "complete_research_report",
      timeoutMs: 900_000,
    });
  } finally {
    globalThis.fetch = nativeFetch;
  }
  const currentContentGenerationAttempts = reportDraftResponseStatuses.filter((status) => status === 200).length;
  const cumulativeWriterRequests = previousWriterRequests + writerRequests;
  const cumulativeEvidenceSetRequests = previousEvidenceSetRequests + evidenceSetRequests;
  const cumulativeContentGenerationAttempts = previousContentGenerationAttempts + currentContentGenerationAttempts;
  writeJson(`${outputDir}/writer-response.live.json`, llm);
  writeJson(`${outputDir}/live-writer-call-counts.json`, {
    reportDraftRequests: cumulativeWriterRequests,
    evidenceSetPreflightRequests: cumulativeEvidenceSetRequests,
    controlledContentGenerationAttempts: cumulativeContentGenerationAttempts,
    reportDraftResponseStatuses: [...previousReportDraftStatuses, ...reportDraftResponseStatuses],
    currentEvidenceSetResponseStatuses: evidenceSetResponseStatuses,
    currentRun: {
      reportDraftRequests: writerRequests,
      evidenceSetPreflightRequests: evidenceSetRequests,
      controlledContentGenerationAttempts: currentContentGenerationAttempts,
      reportDraftResponseStatuses,
    },
    contentReruns: 0,
    evidenceSetTransportRetries: Math.max(0, cumulativeEvidenceSetRequests - 1),
    reportDraftTransportRetries: Math.max(0, cumulativeWriterRequests - 1),
  });
  const validation = record(llm.formalResearchValidation);
  const duplicate = record(validation.duplicateValidation);
  const quantitative = record(validation.quantitativeValidation);
  const integration = record(validation.quantitativeIntegrationValidation);
  const synthesis = record(validation.synthesisValidation);
  const architecture = record(llm.formalResearchArchitecture);
  const checkpoint = record(llm.formalResearchCheckpoint);
  const unsupportedSentenceCount = llm.sections.reduce((sum, section) => sum + list(section.unsupportedSentences).length, 0);
  const contentChecks = {
    writerRequestExactlyOnce: cumulativeContentGenerationAttempts === 1,
    currentRunReportDraftEndpointExactlyOnce: writerRequests === 1,
    controlledContentGenerationExactlyOnce: cumulativeContentGenerationAttempts === 1,
    writerSuccess: llm.llm_status === "success" && llm.reportGenerationStatus === "success",
    noFallback: llm.fallbackUsed === false && llm.fallback_used === false && llm.degradedMode !== true,
    formalArchitecture: architecture.reportClassification === "FORMAL_RESEARCH_REPORT",
    formalValidationPass: validation.pass === true,
    duplicateGatePass: duplicate.pass === true && list(duplicate.strictDuplicates).length === 0 && list(duplicate.semanticDuplicates).length === 0,
    quantitativeProvenancePass: quantitative.pass === true,
    quantitativeIntegrationPass: Number(quantitative.claims ?? 0) === 0 || integration.pass === true,
    analyticalSynthesisPass: synthesis.pass === true,
    noUnsupportedSections: llm.sections.every((section) => section.groundingStatus !== "unsupported"),
    zeroUnsupportedSentences: unsupportedSentenceCount === 0,
    checkpointSafe: checkpoint.contentIntegrityValidated === true && checkpoint.safeToResume === true,
  };
  const contentPassed = Object.values(contentChecks).every(Boolean);
  writeJson(`${outputDir}/claim-audit.json`, {
    stage: "POST_CONTROLLED_WRITER",
    passed: contentPassed,
    checks: contentChecks,
    validation,
    unsupportedSentenceCount,
    sectionClaimAllocations: list(architecture.sectionClaimAllocations),
    quantitativeFacts: list(architecture.quantitativeFactRegistry),
    visualizationPlan: list(architecture.visualizationPlan),
  });
  writeJson(`${outputDir}/writer-content-gate.json`, { passed: contentPassed, checks: contentChecks });
  if (!contentPassed) {
    writeJson(`${outputDir}/formal-export-gate.json`, { passed: false, notRun: true, reason: "WRITER_CONTENT_GATE_FAILED" });
    return {
      caseId,
      slug,
      topic,
      status: "BLOCKED_WRITER_CONTENT_GATE",
      writerRequests,
      cumulativeWriterRequests,
      cumulativeEvidenceSetRequests,
      controlledContentGenerationAttempts: cumulativeContentGenerationAttempts,
      exported: false,
      contentChecks,
    };
  }
  const workspace = applyDetailedReportSummary(mergeLlmReportDraft(createReportWorkspace(input, sources, "complete_research_report", `evidence-gap-v3-${caseId}`, {
    evidenceCards: cards,
    workflowId,
    topicHash,
    originalTopic: topic,
    researchTopic: topic,
  }), llm), { force: true });
  const report = workspaceToGeneratedReport(workspace, "運動科學與健康");
  const formal = report.meta.formalReportDocument;
  if (!formal) throw new Error("CANONICAL_FORMAL_REPORT_MISSING");
  const readerText = formalReportDocumentReaderText(formal);
  const exportReasons = formalExportBlockReasons({
    citationExportBlocked: report.meta.citationIntegrity?.status === "blocked",
    sectionRequiresReview: workspace.draft.sections.some((section) => section.groundingStatus === "unsupported"),
    diagnostics: workspace.llmDiagnostics as never,
    sections: workspace.draft.sections,
    reportPlan: llm.reportPlan ?? reportPlan,
  });
  const canonicalChecks = {
    formalQualityPass: formal.quality.passed,
    methodologyPass: formal.methodology.passed,
    citationIntegrityPass: formal.integrity.status === "pass",
    exportGateClear: exportReasons.length === 0,
    supportedLength: cjk(readerText) >= 1800,
    evidenceTablePresent: Boolean(formal.evidenceTable),
    referencesPresent: formal.references.length > 0,
    noInternalReaderTokens: !/\b(?:source|evidence|claim)[_-][\w-]+|\{s\d+\}/iu.test(readerText),
  };
  const canonicalPassed = Object.values(canonicalChecks).every(Boolean);
  writeJson(`${outputDir}/canonical-content-gate.json`, { passed: canonicalPassed, checks: canonicalChecks, exportReasons, readerCjk: cjk(readerText) });
  writeJson(`${outputDir}/report-workspace.json`, workspace);
  writeJson(`${outputDir}/generated-report.json`, report);
  writeJson(`${outputDir}/canonical-report.json`, formal);
  if (!canonicalPassed) {
    writeJson(`${outputDir}/formal-export-gate.json`, { passed: false, notRun: true, reason: "CANONICAL_CONTENT_GATE_FAILED", canonicalChecks, exportReasons });
    return {
      caseId,
      slug,
      topic,
      status: "BLOCKED_CANONICAL_CONTENT_GATE",
      writerRequests,
      cumulativeWriterRequests,
      cumulativeEvidenceSetRequests,
      controlledContentGenerationAttempts: cumulativeContentGenerationAttempts,
      exported: false,
      contentChecks,
      canonicalChecks,
    };
  }
  writeJson(`${outputDir}/document-design-contract.json`, {
    preset: "standard_business_brief",
    firstPageHeaderPattern: "editorial_cover",
    output: "canonical ResearchForge formal report",
    preservation: "existing ResearchForge publication layout and canonical report model",
  });
  execFileSync(process.execPath, [documentMarker, "--operation-kind", "create", "--expected-output-count", "1", "--output-format", "docx"], { stdio: "ignore" });
  const html = buildPrintHtml(report, input, workspace.presentation);
  const markdown = buildMarkdown(report, input);
  const docx = await buildDocxBlob(report, input, workspace.presentation);
  const docxBytes = new Uint8Array(await docx.arrayBuffer());
  execFileSync(process.execPath, [pdfMarker, "--operation-kind", "create", "--expected-output-count", "1", "--output-format", "pdf"], { stdio: "ignore" });
  globalThis.fetch = (async (request, init) => {
    const raw = String(request);
    return nativeFetch(raw.startsWith("/api/") ? `${apiOrigin}${raw}` : request, init);
  }) as typeof fetch;
  const pdfs: Blob[] = [];
  try {
    await downloadPdf(report, input, workspace.presentation, { fetchImpl: globalThis.fetch, saveBlob(blob) { pdfs.push(blob); } });
  } finally {
    globalThis.fetch = nativeFetch;
  }
  const pdf = pdfs[0];
  if (!pdf) throw new Error("PDF_EXPORT_RETURNED_NO_BLOB");
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
  const exportChecks = {
    previewReadable: /<!doctype html>/iu.test(html) && html.includes(report.meta.title),
    docxReadable: docxBytes[0] === 0x50 && docxBytes[1] === 0x4b,
    pdfReadable: Buffer.from(pdfBytes.slice(0, 5)).toString("ascii") === "%PDF-",
    cjkPresent: /[\u3400-\u9fff]/u.test(html),
  };
  if (!Object.values(exportChecks).every(Boolean)) throw new Error("EXPORT_BYTE_GATE_FAILED");
  write(`${outputDir}/preview.html`, html);
  write(`${outputDir}/formal-report.md`, markdown);
  write(`${outputDir}/formal-report.docx`, docxBytes);
  write(`${outputDir}/formal-report.pdf`, pdfBytes);
  writeJson(`${outputDir}/formal-export-gate.json`, {
    passed: true,
    pendingVisualQa: true,
    exportChecks,
    sha256: {
      preview: createHash("sha256").update(html).digest("hex"),
      markdown: createHash("sha256").update(markdown).digest("hex"),
      docx: createHash("sha256").update(docxBytes).digest("hex"),
      pdf: createHash("sha256").update(pdfBytes).digest("hex"),
    },
  });
  return {
    caseId,
    slug,
    topic,
    status: "EXPORTED_PENDING_VISUAL_QA",
    writerRequests,
    cumulativeWriterRequests,
    cumulativeEvidenceSetRequests,
    controlledContentGenerationAttempts: cumulativeContentGenerationAttempts,
    exported: true,
    contentChecks,
    canonicalChecks,
    exportChecks,
  };
}

async function main(): Promise<void> {
  const before = sha256(protectedFixture);
  if (before !== expectedProtectedSha) throw new Error(`PROTECTED_FIXTURE_MISMATCH_BEFORE:${before}`);
  const acceptance = readJson<{ topics: Json[] }>(path.join(replayRoot, "ACCEPTANCE-MATRIX.json"));
  const eligible = acceptance.topics.filter((item) => item.classification === "FORMAL_RESEARCH_REPORT");
  const results: Json[] = [];
  for (const config of eligible) {
    try { results.push(await runFormalCase(config)); }
    catch (error) {
      const countsPath = path.join(outputRoot, "cases", `case-${String(config.caseId)}-${String(config.slug)}`, "live-writer-call-counts.json");
      const counts = fs.existsSync(countsPath) ? record(readJson<unknown>(countsPath)) : {};
      results.push({
        caseId: config.caseId,
        slug: config.slug,
        status: "BLOCKED_EXCEPTION",
        writerRequests: Number(counts.reportDraftRequests ?? 0),
        exported: false,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      });
    }
  }
  const after = sha256(protectedFixture);
  writeJson("CONTROLLED-WRITER-ACCEPTANCE.json", {
    schemaVersion: "researchforge-evidence-gap-formal-synthesis-v3/controlled-writer",
    status: results.every((item) => item.exported === true) ? "PASS_PENDING_VISUAL_QA" : "PARTIAL",
    eligibleCases: eligible.map((item) => item.caseId),
    totalWriterRequests: results.reduce((sum, item) => sum + Number(item.controlledContentGenerationAttempts ?? 0), 0),
    totalReportDraftTransportAttempts: results.reduce((sum, item) => sum + Number(item.cumulativeWriterRequests ?? item.writerRequests ?? 0), 0),
    results,
    protectedFixture: { expectedProtectedSha, before, after, unchanged: before === after && after === expectedProtectedSha },
  });
  process.stdout.write(`${results.every((item) => item.exported === true) ? "PASS_PENDING_VISUAL_QA" : "PARTIAL"}\n`);
}

if (process.env.RESEARCHFORGE_QA_COMPILE_ONLY !== "1") {
  void main().catch((error) => {
    globalThis.fetch = nativeFetch;
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
