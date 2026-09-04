import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { EvidenceCard, GroundingJob, SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  buildFormalResearchArchitecture,
  type FormalResearchArchitecture,
} from "../artifacts/api-server/src/services/formal-research-architecture.ts";
import { buildGeneralResearchQueryPlan } from "../artifacts/api-server/src/services/general-research-query-planner.ts";
import type { ReportInput } from "../artifacts/report-factory/src/lib/generateReport.ts";
import { requestLlmReportDraft } from "../artifacts/report-factory/src/lib/llmReportWriter.ts";
import { sourceCandidateToSourceRecord } from "../artifacts/report-factory/src/lib/researchGrounding.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const apiOrigin = (process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3100").replace(/\/+$/u, "");
const requestedOutput = process.env.RESEARCHFORGE_QA_OUTPUT_DIR?.trim();
const stamp = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date()).replace(/[-: ]/gu, "");
const outputDir = path.resolve(repositoryRoot, requestedOutput || `artifacts/qa/researchforge-general-research-ingestion-${stamp}+0800`);
const protectedFixture = path.join(repositoryRoot, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const nativeFetch = globalThis.fetch;
const extractionOnly = process.env.RESEARCHFORGE_QA_EXTRACTION_ONLY === "true";
const resumeExistingJobs = process.env.RESEARCHFORGE_QA_RESUME_EXISTING === "true";
const aggregateOnly = process.env.RESEARCHFORGE_QA_AGGREGATE_ONLY === "true";
const jobBudgetMs = Math.max(60_000, Math.min(2 * 60 * 60_000, Number(process.env.RESEARCHFORGE_QA_JOB_BUDGET_MS ?? 30 * 60_000)));
const pollWaitMs = Math.max(1_000, Math.min(30_000, Number(process.env.RESEARCHFORGE_QA_POLL_WAIT_MS ?? 20_000)));

const topics = [
  ["01", "caffeine-high-school-attention-sleep", "咖啡因攝取對高中生注意力與睡眠的影響"],
  ["02", "genai-critical-thinking", "生成式 AI 使用對學生批判思考能力的影響"],
  ["03", "urban-greenspace-mental-health", "城市綠地暴露與心理健康之間的關聯"],
  ["04", "microplastics-freshwater-fish", "微塑膠暴露對淡水魚類生理功能的影響"],
  ["05", "ev-ice-lifecycle-emissions", "電動車與燃油車生命週期碳排放的比較"],
  ["06", "rag-hallucination", "Retrieval-Augmented Generation 對大型語言模型 hallucination 的影響"],
  ["07", "hiit-mict-fitness", "高強度間歇訓練與中等強度持續運動對心肺適能的比較"],
  ["08", "algorithmic-recommendation-polarization", "社群媒體演算法推薦與政治極化之間的關聯"],
  ["09", "sleep-academic-performance", "睡眠不足與青少年學業表現之間的關聯"],
  ["10", "green-roof-urban-heat", "都市熱島環境中綠屋頂的降溫效果"],
] as const;

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}
function list<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function shaFile(filename: string): string { return createHash("sha256").update(fs.readFileSync(filename)).digest("hex"); }
function writeJson(relative: string, value: unknown): void {
  const target = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}
function writeText(relative: string, value: string): void {
  const target = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, value.endsWith("\n") ? value : `${value}\n`, "utf8");
  fs.renameSync(temporary, target);
}

async function api(endpoint: string, init?: RequestInit, timeoutMs = 600_000): Promise<{ status: number; body: unknown; durationMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await nativeFetch(`${apiOrigin}/api${endpoint}`, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 2_000) }; }
    return { status: response.status, body, durationMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}

function isTerminalJob(job: GroundingJob): boolean {
  return Boolean(job.acquisition?.terminalStatus);
}

async function pollGroundingJob(jobId: string, directory: string, initialJob: GroundingJob): Promise<{
  job: GroundingJob;
  pollCount: number;
  clientWaitExpirations: number;
  pollTransportTimeouts: number;
  pollDurationMs: number;
}> {
  const startedAt = Date.now();
  let pollCount = 0;
  let clientWaitExpirations = 0;
  let pollTransportTimeouts = 0;
  let lastJob: GroundingJob = initialJob;
  while (Date.now() - startedAt < jobBudgetMs) {
    pollCount += 1;
    let fetched: Awaited<ReturnType<typeof api>>;
    try {
      fetched = await api(
        `/research-grounding-jobs/${encodeURIComponent(jobId)}?waitMs=${pollWaitMs}`,
        undefined,
        pollWaitMs + 10_000,
      );
    } catch (error) {
      pollTransportTimeouts += 1;
      writeJson(`${directory}/grounding-poll-transport-latest.json`, {
        pollCount,
        observedAt: new Date().toISOString(),
        status: "CLIENT_POLL_TRANSPORT_EXPIRED",
        errorName: error instanceof Error ? error.name : "UNKNOWN",
        message: error instanceof Error ? error.message : String(error),
        serverJobTerminalStatus: lastJob.acquisition?.terminalStatus ?? null,
        countsRemainUnknown: !isTerminalJob(lastJob),
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    lastJob = fetched.body as GroundingJob;
    if (lastJob.clientWait?.status === "CLIENT_WAIT_EXPIRED") clientWaitExpirations += 1;
    writeJson(`${directory}/grounding-job-latest.json`, {
      pollCount,
      responseStatus: fetched.status,
      durationMs: fetched.durationMs,
      job: lastJob,
    });
    if (isTerminalJob(lastJob)) {
      return { job: lastJob, pollCount, clientWaitExpirations, pollTransportTimeouts, pollDurationMs: Date.now() - startedAt };
    }
  }
  return { job: lastJob, pollCount, clientWaitExpirations, pollTransportTimeouts, pollDurationMs: Date.now() - startedAt };
}

function sourceRecords(job: GroundingJob, topic: string): SourceRecord[] {
  return list<SourceCandidate>(job.acceptedSources).map((candidate) => sourceCandidateToSourceRecord({
    candidate,
    workflowId: job.workflowId,
    topicHash: job.topicHash,
    queryPlanHash: String(record(job.queryPlan).queryPlanHash ?? job.topicHash),
    originalTopic: topic,
  }));
}

function reportInput(topic: string, sources: SourceRecord[]): ReportInput {
  return {
    topic, researchReportMode: "formal_research_report", citationDisplayMode: "academic",
    reportType: "正式二手研究報告", academicLevel: "專業", targetAudience: "評審與研究讀者",
    researchDepth: "deep", purpose: "依可追溯研究證據回答研究問題並進行跨研究綜合",
    domainOverride: "由題目與證據自動判定", mode: "直接生成完整報告",
    sourceRequirement: "所有事實與數值主張必須綁定 exact evidence span",
    citationFormat: "APA", chartRequirement: "僅輸出通過來源與數值 lineage gate 的圖表",
    style: "正式學術繁體中文；theme-first、claim-first，不逐篇摘要拼貼",
    length: "依證據分級：正式報告或有限證據簡報", wordCount: "2600",
    formalTone: "需要", conversationalTone: "不需要",
    specifiedStructure: "FORMAL_RESEARCH_REPORT canonical schema",
    rubric: "不得由標題推定研究設計；不得把共變項當 moderator；方向須由結果文字或 effect estimate 支持；結論不得新增主張。",
    personalStyle: "", supplementalMaterials: "", outputLanguage: "繁體中文", rewriteSection: "",
    additionalInfo: "若全文、樣本、方向、數值或 moderator 不足，必須明確降級或阻止，不得補寫。",
    acceptedSources: sources,
  };
}

function canonicalAdmissionAudit(input: {
  caseId: string;
  job: GroundingJob;
  architecture: FormalResearchArchitecture;
}): {
  rows: Json[];
  admissionMismatchCount: number;
  formalSafetyViolationCount: number;
  unknownCollapseViolationCount: number;
  terminalAggregateConsistent: boolean;
  canonicalCounts: { formal: number; limited: number; blocked: number };
  writerAdmittedCount: number;
} {
  const admissions = input.job.canonicalStudyAdmissions ?? [];
  const manifest = input.job.acquisition?.terminalManifest;
  const architectureBySource = new Map(
    input.architecture.canonicalStudyAdmissions.map(
      (item) => [item.sourceId, {
        level: item.admissionClass,
        evidenceRevision: item.evidenceRevision,
      }],
    ),
  );
  const writerBySource = new Map(
    input.architecture.writerAdmissionProjection.map((item) => [
      item.sourceId,
      item,
    ]),
  );
  const studyBySource = new Map(
    input.architecture.studies.map((study) => [study.sourceId, study]),
  );
  const jobFactStatusesBySource = new Map<string, string[]>();
  for (const card of list<Json>(input.job.evidenceCards)) {
    const sourceId = String(card.sourceId ?? "");
    if (!sourceId) continue;
    const envelope = record(record(card.structuredStudyFact).studyFactV2);
    const statuses = [
      envelope.domain,
      envelope.populationContext,
      envelope.methodsSummary,
      envelope.primaryQuestion,
      ...Object.values(record(envelope.coreFacts)),
    ].map((value) => String(record(value).status ?? "")).filter(Boolean);
    if (statuses.length > 0) jobFactStatusesBySource.set(sourceId, statuses);
  }
  const canonicalCounts = {
    formal: admissions.filter((item) => item.admissionClass === "FORMAL").length,
    limited: admissions.filter((item) => item.admissionClass === "LIMITED").length,
    blocked: admissions.filter((item) => item.admissionClass === "BLOCKED").length,
  };
  const terminalAggregateConsistent = Boolean(
    manifest &&
      manifest.canonicalAdmissionJobRevision === input.job.revision &&
      manifest.formalStudyCount === canonicalCounts.formal &&
      manifest.limitedStudyCount === canonicalCounts.limited &&
      manifest.blockedStudyCount === canonicalCounts.blocked,
  );
  const qualifyingFullText = new Set([
    "FULL_TEXT_STRUCTURED",
    "FULL_TEXT_HTML",
    "FULL_TEXT_PDF",
    "FULL_TEXT_OCR",
    "FULL_TEXT_REPOSITORY_COPY",
  ]);
  const rows: Json[] = admissions.map((admission) => {
    const architecture = architectureBySource.get(admission.sourceId);
    const writer = writerBySource.get(admission.sourceId);
    const study = studyBySource.get(admission.sourceId);
    const statuses = list<Json>(study?.structuredStudyFacts).flatMap((payload) => {
      const envelope = record(payload.studyFactV2);
      return [
        envelope.domain,
        envelope.populationContext,
        envelope.methodsSummary,
        envelope.primaryQuestion,
        ...Object.values(record(envelope.coreFacts)),
      ].map((value) => String(record(value).status ?? "")).filter(Boolean);
    });
    const auditedStatuses = statuses.length > 0
      ? statuses
      : jobFactStatusesBySource.get(admission.sourceId) ?? [];
    const formalSafetyViolation = admission.admissionClass === "FORMAL" && !(
      admission.acquisitionTerminal &&
      qualifyingFullText.has(admission.accessState) &&
      ["COMPLETE", "PARTIAL"].includes(admission.parserState) &&
      admission.studyFactState === "READY" &&
      admission.provenanceState === "READY"
    );
    const unknownCollapseViolation = admission.accessState === "UNKNOWN" &&
      auditedStatuses.includes("NOT_REPORTED");
    const terminalProjection = terminalAggregateConsistent
      ? admission.admissionClass
      : "TERMINAL_AGGREGATE_MISMATCH";
    const architectureProjection = architecture?.level ??
      "MISSING_ARCHITECTURE_PROJECTION";
    const writerProjection = writer?.admissionClass ??
      "MISSING_WRITER_PROJECTION";
    const consistent = terminalProjection === admission.admissionClass &&
      architectureProjection === admission.admissionClass &&
      writerProjection === admission.admissionClass &&
      architecture?.evidenceRevision === admission.evidenceRevision &&
      writer?.revision === admission.evidenceRevision;
    return {
      caseId: input.caseId,
      jobId: admission.jobId,
      studyId: admission.studyId,
      sourceId: admission.sourceId,
      jobRevision: admission.jobRevision,
      checkpointRevision: admission.checkpointRevision,
      evidenceRevision: admission.evidenceRevision,
      accessState: admission.accessState,
      acquisitionTerminal: admission.acquisitionTerminal,
      qualifyingArtifactRefs: admission.qualifyingArtifactRefs,
      parserState: admission.parserState,
      studyFactState: admission.studyFactState,
      provenanceState: admission.provenanceState,
      canonicalAdmission: admission.admissionClass,
      reasonCodes: admission.reasonCodes,
      terminalProjection,
      architectureProjection,
      writerProjection,
      consistent,
      formalSafetyViolation,
      unknownCollapseViolation,
    };
  });
  const missingCanonicalRows = input.architecture.studies
    .filter((study) => !admissions.some((item) => item.sourceId === study.sourceId))
    .map((study): Json => ({
      caseId: input.caseId,
      jobId: input.job.jobId,
      studyId: study.studyId ?? study.sourceId,
      sourceId: study.sourceId,
      jobRevision: input.job.revision,
      canonicalAdmission: "MISSING_CANONICAL_ADMISSION",
      terminalProjection: "MISSING_CANONICAL_ADMISSION",
      architectureProjection:
        architectureBySource.get(study.sourceId)?.level ??
        "MISSING_ARCHITECTURE_PROJECTION",
      writerProjection:
        writerBySource.get(study.sourceId)?.admissionClass ??
        "MISSING_WRITER_PROJECTION",
      consistent: false,
      formalSafetyViolation: false,
      unknownCollapseViolation: false,
    }));
  rows.push(...missingCanonicalRows);
  return {
    rows,
    admissionMismatchCount: rows.filter((row) => row.consistent !== true).length +
      (rows.length === 0 && !terminalAggregateConsistent ? 1 : 0),
    formalSafetyViolationCount: rows.filter((row) =>
      row.formalSafetyViolation === true
    ).length,
    unknownCollapseViolationCount: rows.filter((row) =>
      row.unknownCollapseViolation === true
    ).length,
    terminalAggregateConsistent,
    canonicalCounts,
    writerAdmittedCount: input.architecture.writerAdmissionProjection.filter(
      (item) => item.admissionClass !== "BLOCKED",
    ).length,
  };
}

function diagnoseCase08(job: GroundingJob, directStudyCount: number): Json {
  if (!isTerminalJob(job)) return { status: "UNKNOWN_JOB_INCOMPLETE", zeroCandidatesConfirmed: false };
  const manifest = job.acquisition?.terminalManifest;
  const queryCount = manifest?.queryCount ?? list<string>(record(job.queryPlan).queries).length;
  const progress = list<Json>(job.groundingDiagnostics?.providerProgress);
  const candidates = list<Json>(job.sourceCandidates);
  const rawResults = progress.reduce((sum, row) => sum + (typeof row.rawResultsCount === "number" ? row.rawResultsCount : 0), 0);
  const normalizedResults = progress.reduce((sum, row) => sum + (typeof row.normalizedCount === "number" ? row.normalizedCount : 0), 0);
  const successfulAttempts = progress.filter((row) => row.status === "success").length;
  const emptyAttempts = progress.filter((row) => row.status === "empty").length;
  const transientFailures = progress.filter((row) => row.status === "timeout" || row.status === "error").length
    + list(job.providerErrors).length;
  const rejectionBuckets: Record<string, number> = {
    exposureMismatch: 0,
    outcomeMismatch: 0,
    populationMismatch: 0,
    sourceTypeRestriction: 0,
    otherRelevanceRejection: 0,
  };
  for (const candidate of candidates) {
    if (candidate.reviewStatus !== "rejected") continue;
    const reason = String(candidate.rejectionReason ?? "").toLocaleLowerCase();
    const key = /exposure|intervention/u.test(reason) ? "exposureMismatch"
      : /outcome|endpoint/u.test(reason) ? "outcomeMismatch"
        : /population|participant|subject/u.test(reason) ? "populationMismatch"
          : /source.?type|review|background|non.?direct/u.test(reason) ? "sourceTypeRestriction"
            : "otherRelevanceRejection";
    rejectionBuckets[key] += 1;
  }
  let diagnosis = "DIRECT_STUDY_ACCEPTED";
  if (queryCount === 0) diagnosis = "QUERY_GENERATION_FAILURE";
  else if (candidates.length === 0 && rawResults === 0 && transientFailures > 0 && successfulAttempts === 0) diagnosis = "PROVIDER_TRANSIENT_FAILURE";
  else if (candidates.length === 0 && rawResults === 0) diagnosis = "PROVIDER_RESPONSE_EMPTY";
  else if (candidates.length === 0 && rawResults > 0 && normalizedResults === 0) diagnosis = "NORMALIZATION_OR_SOURCE_TYPE_RESTRICTION";
  else if (directStudyCount === 0) diagnosis = "RELEVANCE_CLASSIFIER_REJECTED_ALL";
  return {
    status: diagnosis,
    zeroCandidatesConfirmed: candidates.length === 0,
    queryCount,
    rawResults,
    normalizedResults,
    candidateCount: candidates.length,
    directStudyCount,
    successfulAttempts,
    emptyAttempts,
    transientFailures,
    rejectionBuckets,
  };
}

async function runCase(caseId: string, slug: string, topic: string): Promise<Json> {
  const directory = `case-${caseId}-${slug}`;
  const startedAt = new Date().toISOString();
  const deterministicPlan = buildGeneralResearchQueryPlan(topic);
  writeJson(`${directory}/search-plan.json`, { input: { topic }, planner: deterministicPlan });
  const workflowId = `qa-general-${caseId}-${Date.now()}`;
  const existingCreatePath = path.join(outputDir, directory, "grounding-create-response.json");
  const create = resumeExistingJobs && fs.existsSync(existingCreatePath)
    ? JSON.parse(fs.readFileSync(existingCreatePath, "utf8")) as Awaited<ReturnType<typeof api>>
    : await api("/research-grounding-jobs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workflowId,
        requestId: `${workflowId}-request`,
        attemptId: `${workflowId}-attempt-1`,
        topic,
        reportType: "正式二手研究報告",
        audience: "專業",
        searchProfile: "deep",
        debugTrace: true,
      }),
    });
  writeJson(`${directory}/grounding-create-response.json`, create);
  const jobId = String(record(create.body).jobId ?? "");
  if (!jobId) {
    return { caseId, topic, classification: "SEARCH_ONLY_RESULT", firstWeakLayer: "provider_search", reason: "GROUNDING_JOB_NOT_CREATED", startedAt, completedAt: new Date().toISOString() };
  }
  const polled = await pollGroundingJob(jobId, directory, create.body as GroundingJob);
  const job = polled.job;
  writeJson(`${directory}/grounding-job.json`, job);
  writeJson(`${directory}/acquisition-job-audit.json`, {
    jobId,
    terminal: isTerminalJob(job),
    pollCount: polled.pollCount,
    clientWaitExpirations: polled.clientWaitExpirations,
    pollTransportTimeouts: polled.pollTransportTimeouts,
    pollDurationMs: polled.pollDurationMs,
    clientWait: job.clientWait ?? null,
    lifecycle: job.acquisition ?? null,
  });
  if (!isTerminalJob(job)) {
    const incomplete = {
      caseId,
      slug,
      topic,
      jobId,
      classification: "UNKNOWN_JOB_INCOMPLETE",
      upstreamClassification: "UNKNOWN_JOB_INCOMPLETE",
      firstWeakLayer: "acquisition_job_completion",
      reason: "SERVER_JOB_DID_NOT_REACH_TERMINAL_STATE_WITHIN_BOUNDED_JOB_BUDGET",
      jobTerminalState: null,
      searchedCandidates: null,
      acceptedSources: null,
      directStudies: null,
      structuredFullText: null,
      pdfFullText: null,
      ocrFullText: null,
      abstractOnly: null,
      accessDenied: null,
      notFound: null,
      resolverErrors: null,
      structuredStudyFacts: null,
      quantitativeFacts: null,
      limitedStudyAdmissions: null,
      formalStudyAdmissions: null,
      themes: null,
      writerAttempted: false,
      writerPass: false,
      startedAt,
      completedAt: new Date().toISOString(),
      pollCount: polled.pollCount,
      clientWaitExpirations: polled.clientWaitExpirations,
      pollTransportTimeouts: polled.pollTransportTimeouts,
      jobDurationMs: polled.pollDurationMs,
      lifecycle: job.acquisition ?? null,
    };
    writeJson(`${directory}/qa.json`, incomplete);
    return incomplete;
  }
  const terminalManifest = job.acquisition?.terminalManifest;
  const sources = sourceRecords(job, topic);
  const evidenceCards = list<EvidenceCard>(job.evidenceCards);
  writeJson(`${directory}/accepted-sources.json`, sources);
  writeJson(`${directory}/source-review.json`, {
    candidates: list(job.sourceCandidates), accepted: sources,
    providerErrors: job.providerErrors ?? [], warnings: job.warnings ?? [],
  });
  writeJson(`${directory}/evidence-cards.json`, evidenceCards);
  const architecture = buildFormalResearchArchitecture({
    sources,
    evidenceCards: evidenceCards as unknown as import("../artifacts/api-server/src/services/report-writer.ts").ReportWriterEvidenceCard[],
    canonicalStudyAdmissions: job.canonicalStudyAdmissions,
    canonicalContext: {
      jobId,
      jobRevision: job.revision,
      checkpointRevision:
        job.canonicalStudyAdmissions?.[0]?.checkpointRevision,
    },
    workflow: {
      workflowId: job.workflowId, topicHash: job.topicHash, normalizedTopic: topic,
      researchQuestion: topic, namedProviders: list<Json>(record(job.queryPlan).providerHealth).map((item) => String(item.provider ?? "")).filter(Boolean),
      reproducibleSearchStrategy: true, explicitInclusionCriteria: true, explicitExclusionCriteria: true,
      screeningProcedure: true, duplicateRemoval: true, documentedStudySelection: true, qualityAssessment: true,
      queryExpansion: true, themeSynthesis: true,
      searchQueries: list<string>(record(job.queryPlan).queries),
      searchDates: [new Date().toISOString().slice(0, 10)], searchLanguages: ["zh-TW", "en"],
      fullTextRetrievalMethods: ["DOI/OA resolver", "public HTML/PDF extraction"],
      evidenceExtractionMethods: ["two-stage exact-span structured study fact extraction"],
      relevanceQualityAssessmentMethods: ["topic integrity", "direct/background role", "evidence coverage gate"],
      inclusionCriteria: ["topic-direct or explicitly contextual scholarly evidence with traceable access"],
      exclusionCriteria: ["metadata-only claims", "off-topic drift", "unsupported structured fields"],
      topicIntegrityPolicy: "fail closed",
    },
  });
  writeJson(`${directory}/structured-study-evidence.json`, architecture.studies);
  writeJson(`${directory}/evidence-matrix.json`, architecture.evidenceMatrix);
  writeJson(`${directory}/study-difference-matrix.json`, architecture.studyDifferenceMatrices);
  writeJson(`${directory}/evidence-coverage.json`, architecture.evidenceCoverage);
  const admissionAudit = canonicalAdmissionAudit({ caseId, job, architecture });
  writeJson(`${directory}/canonical-admission-matrix.json`, {
    schemaVersion: "researchforge-canonical-admission-matrix/v1",
    jobId,
    jobRevision: job.revision,
    terminalAggregateConsistent: admissionAudit.terminalAggregateConsistent,
    admissionMismatchCount: admissionAudit.admissionMismatchCount,
    formalSafetyViolationCount: admissionAudit.formalSafetyViolationCount,
    unknownCollapseViolationCount: admissionAudit.unknownCollapseViolationCount,
    studies: admissionAudit.rows,
  });
  writeJson(`${directory}/quantitative-facts.json`, architecture.quantitativeFactRegistry);
  writeJson(`${directory}/moderator-table.json`, architecture.studies.map((study) => ({
    sourceId: study.sourceId, moderators: study.moderators, covariates: study.covariates,
    confounders: study.confounders, effectDirection: study.effectDirection,
  })));
  writeJson(`${directory}/figure-provenance.json`, architecture.visualizationPlan);
  const classification = architecture.reportClassification;
  const writerEligible = !extractionOnly &&
    architecture.canonicalAdmissionValidation.pass &&
    admissionAudit.writerAdmittedCount > 0 &&
    architecture.writerAdmissionProjection.every(
      (item) => item.admissionClass !== "BLOCKED",
    ) &&
    (classification === "FORMAL_RESEARCH_REPORT" ||
      classification === "LIMITED_EVIDENCE_BRIEF");
  let writer: Awaited<ReturnType<typeof requestLlmReportDraft>> | null = null;
  let writerRequests = 0;
  if (writerEligible && job.reportPlan) {
    const upstream = globalThis.fetch;
    globalThis.fetch = (async (request, init) => {
      if (/\/api\/report-drafts(?:\?|$)/u.test(String(request))) writerRequests += 1;
      const resolved = String(request).startsWith("/api/") ? `${apiOrigin}${String(request)}` : request;
      return upstream(resolved, init);
    }) as typeof fetch;
    try {
      writer = await requestLlmReportDraft({
        reportInput: reportInput(topic, sources), workflowId: job.workflowId, jobId,
        jobRevision: job.revision,
        canonicalCheckpointRevision:
          job.canonicalStudyAdmissions?.[0]?.checkpointRevision,
        topicHash: job.topicHash, originalTopic: topic, displayTitle: topic,
        acceptedSources: sources,
        evidenceCards: evidenceCards as unknown as import("../artifacts/report-factory/src/lib/evidenceCards.ts").EvidenceCard[],
        canonicalStudyAdmissions: job.canonicalStudyAdmissions,
        reportPlan: job.reportPlan, generationMode: "complete_research_report", timeoutMs: 720_000,
      });
    } finally { globalThis.fetch = upstream; }
    writeJson(`${directory}/writer-response.json`, writer);
  }
  writeJson(`${directory}/provider-usage.json`, {
    groundingRequests: 1, writerRequests, retries: 0, reruns: 0,
    providerErrors: job.providerErrors ?? [],
  });
  const writerValidation = record(writer?.formalResearchValidation);
  const writerPass = Boolean(writer && writer.llm_status === "success" && writer.reportGenerationStatus === "success" && record(writerValidation.synthesisValidation).pass === true);
  const finalClassification = writerEligible && !writerPass ? "BLOCKED_EXTRACTION_FAILURE" : classification;
  const firstWeakLayer = list(job.sourceCandidates).length === 0 ? "provider_search"
    : sources.length < 2 ? "relevance_and_acceptance"
      : architecture.evidenceCoverage.fullTextStudyCount === 0 ? "full_text_acquisition"
        : architecture.evidenceCoverage.sourceSpanProvenanceCoverage < 95 ? "evidence_span_extraction"
          : (architecture.evidenceCoverage.studyTypeInterpretationCoverage ?? architecture.evidenceCoverage.studyDesignCoverage) < 95 ? "structured_study_fact_extraction"
            : (architecture.evidenceCoverage.limitedAdmissionCount ?? 1) === 0 ? "core_study_fact_extraction"
            : architecture.evidenceCoverage.effectDirectionCoverage < 90 ? "effect_direction_extraction"
              : !writerPass && writerEligible ? "cross_study_synthesis"
                : "none";
  const result = {
    caseId, slug, topic, jobId, jobRevision: job.revision,
    classification: finalClassification, upstreamClassification: classification,
    firstWeakLayer, startedAt, completedAt: new Date().toISOString(), groundingStatus: job.status,
    jobTerminalState: job.acquisition?.terminalStatus ?? null,
    jobDurationMs: (() => {
      const createdAt = terminalManifest?.createdAt ? Date.parse(terminalManifest.createdAt) : Number.NaN;
      const completedAt = terminalManifest?.completedAt ? Date.parse(terminalManifest.completedAt) : Number.NaN;
      return Number.isFinite(createdAt) && Number.isFinite(completedAt)
        ? Math.max(0, completedAt - createdAt)
        : polled.pollDurationMs;
    })(),
    pollCount: polled.pollCount,
    clientWaitExpirations: polled.clientWaitExpirations,
    pollTransportTimeouts: polled.pollTransportTimeouts,
    searchedCandidates: list(job.sourceCandidates).length, acceptedSources: sources.length,
    evidenceCards: evidenceCards.length, directStudies: architecture.evidenceCoverage.directStudyCount,
    structuredFullText: terminalManifest?.fullTextStructuredCount ?? null,
    fullTextStructured: terminalManifest?.canonicalAccessStateCounts?.FULL_TEXT_STRUCTURED ?? 0,
    fullTextHtml: terminalManifest?.canonicalAccessStateCounts?.FULL_TEXT_HTML ?? 0,
    pdfFullText: terminalManifest?.fullTextPdfCount ?? null,
    pdfText: (terminalManifest?.canonicalAccessStateCounts?.FULL_TEXT_PDF ?? 0) +
      (terminalManifest?.canonicalAccessStateCounts?.FULL_TEXT_REPOSITORY_COPY ?? 0),
    ocrFullText: terminalManifest?.fullTextOcrCount ?? null,
    ocrText: terminalManifest?.canonicalAccessStateCounts?.FULL_TEXT_OCR ?? 0,
    abstractOnly: terminalManifest?.abstractOnlyCount ?? null,
    accessDenied: terminalManifest?.accessDeniedCount ?? null,
    unknownAccess: terminalManifest?.canonicalAccessStateCounts?.UNKNOWN ?? 0,
    accessStateCounts: terminalManifest?.canonicalAccessStateCounts ?? {},
    notFound: terminalManifest?.notFoundCount ?? null,
    resolverErrors: terminalManifest?.resolverErrorCount ?? null,
    fullTextStudies: architecture.evidenceCoverage.fullTextStudyCount,
    studyDesignCoverage: architecture.evidenceCoverage.studyDesignCoverage,
    populationCoverage: architecture.evidenceCoverage.populationCoverage,
    exposureCoverage: architecture.evidenceCoverage.exposureCoverage,
    outcomeCoverage: architecture.evidenceCoverage.outcomeCoverage,
    effectDirectionCoverage: architecture.evidenceCoverage.effectDirectionCoverage,
    quantitativeFacts: architecture.quantitativeFactRegistry.length,
    moderators: architecture.studies.reduce((sum, study) => sum + study.moderators.length, 0),
    studyTypeInterpretationCoverage: architecture.evidenceCoverage.studyTypeInterpretationCoverage,
    limitedStudyAdmissions: architecture.evidenceCoverage.limitedAdmissionCount,
    formalStudyAdmissions: architecture.evidenceCoverage.formalAdmissionCount,
    canonicalLimitedCount: admissionAudit.canonicalCounts.limited,
    canonicalFormalCount: admissionAudit.canonicalCounts.formal,
    canonicalBlockedCount: admissionAudit.canonicalCounts.blocked,
    terminalLimitedCount: terminalManifest?.limitedStudyCount ?? null,
    terminalFormalCount: terminalManifest?.formalStudyCount ?? null,
    architectureLimitedCount: architecture.evidenceCoverage.limitedAdmissionCount ?? 0,
    architectureFormalCount: architecture.evidenceCoverage.formalAdmissionCount ?? 0,
    writerAdmittedCount: admissionAudit.writerAdmittedCount,
    admissionMismatchCount: admissionAudit.admissionMismatchCount,
    formalSafetyViolationCount: admissionAudit.formalSafetyViolationCount,
    unknownCollapseViolationCount: admissionAudit.unknownCollapseViolationCount,
    canonicalAdmissionRows: admissionAudit.rows,
    canonicalAdmissionValidation: architecture.canonicalAdmissionValidation,
    typeSpecificAdmission: architecture.evidenceCoverage.typeSpecificAdmission,
    extractionOnly,
    writerAttempted: writerRequests > 0, writerRequests, writerPass,
    writerLogicalGenerations: writerRequests > 0 ? 1 : 0,
    writerTransportRequests: writerRequests,
    writerTransportRetries: Math.max(0, writerRequests - (writerRequests > 0 ? 1 : 0)),
    writerContentReruns: 0,
    terminalPayloadBytes: Buffer.byteLength(JSON.stringify(job), "utf8"),
    reasons: architecture.evidenceCoverage.reasons,
    terminalManifest: terminalManifest ?? null,
    lifecycle: job.acquisition ?? null,
    providerProgress: job.groundingDiagnostics?.providerProgress ?? [],
    providerErrors: job.providerErrors ?? [],
    sourceCandidates: job.sourceCandidates ?? [],
    evidenceMatrix: architecture.evidenceMatrix,
    studyDifferenceMatrices: architecture.studyDifferenceMatrices,
    evidenceCoverage: architecture.evidenceCoverage,
    quantitativeFactRegistry: architecture.quantitativeFactRegistry,
    structuredStudies: architecture.studies,
    case08Diagnosis: caseId === "08" ? diagnoseCase08(job, architecture.evidenceCoverage.directStudyCount) : null,
    writerAudit: {
      logicalGenerations: writerRequests > 0 ? 1 : 0,
      transportRequests: writerRequests,
      transportRetries: Math.max(0, writerRequests - (writerRequests > 0 ? 1 : 0)),
      contentReruns: 0,
      llmStatus: writer?.llm_status ?? null,
      reportGenerationStatus: writer?.reportGenerationStatus ?? null,
      validation: writerValidation,
    },
  };
  writeJson(`${directory}/qa.json`, result);
  return result;
}

function caseAcceptanceRow(item: Json): Json {
  const manifest = record(item.terminalManifest);
  const createdAt = typeof manifest.createdAt === "string" ? Date.parse(manifest.createdAt) : Number.NaN;
  const completedAt = typeof manifest.completedAt === "string" ? Date.parse(manifest.completedAt) : Number.NaN;
  const terminalRuntimeMs = Number.isFinite(createdAt) && Number.isFinite(completedAt)
    ? Math.max(0, completedAt - createdAt)
    : item.jobDurationMs ?? null;
  return {
    case: item.caseId,
    topic: item.topic,
    finalClassification: item.classification,
    jobId: item.jobId ?? null,
    jobRevision: item.jobRevision ?? null,
    jobTerminalState: item.jobTerminalState ?? null,
    jobDurationMs: terminalRuntimeMs,
    queries: manifest.queryCount ?? null,
    candidates: item.searchedCandidates ?? null,
    deduped: manifest.dedupedCount ?? null,
    directStudies: item.directStudies ?? null,
    accessStateCounts: item.accessStateCounts ?? {},
    fullTextStructured: item.fullTextStructured ?? null,
    fullTextHtml: item.fullTextHtml ?? null,
    structuredFullText: item.structuredFullText ?? null,
    pdfText: item.pdfText ?? null,
    pdfFullText: item.pdfFullText ?? null,
    ocrText: item.ocrText ?? null,
    ocrFullText: item.ocrFullText ?? null,
    abstractOnly: item.abstractOnly ?? null,
    accessDenied: item.accessDenied ?? null,
    unknownAccess: item.unknownAccess ?? null,
    notFound: item.notFound ?? null,
    resolverErrors: item.resolverErrors ?? null,
    structuredStudyFacts: manifest.structuredStudyFactCount ?? item.structuredStudyFacts ?? null,
    quantitativeFacts: item.quantitativeFacts ?? manifest.quantitativeFactCount ?? null,
    limitedStudies: item.limitedStudyAdmissions ?? manifest.limitedStudyCount ?? null,
    formalStudies: item.formalStudyAdmissions ?? manifest.formalStudyCount ?? null,
    canonicalLimitedCount: item.canonicalLimitedCount ?? null,
    canonicalFormalCount: item.canonicalFormalCount ?? null,
    terminalLimitedCount: item.terminalLimitedCount ?? manifest.limitedStudyCount ?? null,
    terminalFormalCount: item.terminalFormalCount ?? manifest.formalStudyCount ?? null,
    architectureLimitedCount: item.architectureLimitedCount ?? null,
    architectureFormalCount: item.architectureFormalCount ?? null,
    writerAdmittedCount: item.writerAdmittedCount ?? 0,
    admissionMismatchCount: item.admissionMismatchCount ?? null,
    formalSafetyViolationCount: item.formalSafetyViolationCount ?? null,
    unknownCollapseViolationCount: item.unknownCollapseViolationCount ?? null,
    themes: Array.isArray(item.evidenceMatrix) ? item.evidenceMatrix.length : item.themes ?? null,
    writerExecuted: item.writerAttempted ?? false,
    writerLogicalGenerations: item.writerLogicalGenerations ?? 0,
    writerTransportRequests: item.writerTransportRequests ?? 0,
    writerTransportRetries: item.writerTransportRetries ?? 0,
    writerContentReruns: item.writerContentReruns ?? 0,
    writerAdmission: item.writerAttempted ? item.upstreamClassification : "NOT_ADMITTED",
    writerValidation: item.writerPass ?? false,
    primaryBlocker: item.firstWeakLayer ?? item.reason ?? "unknown",
    terminalPayloadBytes: item.terminalPayloadBytes ?? null,
    case08Diagnosis: item.case08Diagnosis ?? null,
  };
}

function auditRows(results: Json[]): {
  providerAttempts: Json[];
  resolverAttempts: Json[];
  accessMatrix: Json[];
  studyFactCoverage: Json[];
  differenceMatrices: Json[];
  themeAudit: Json[];
  writerAudit: Json[];
  claimAudit: Json[];
  latency: Json[];
} {
  const providerAttempts: Json[] = [];
  const resolverAttempts: Json[] = [];
  const accessMatrix: Json[] = [];
  const studyFactCoverage: Json[] = [];
  const differenceMatrices: Json[] = [];
  const themeAudit: Json[] = [];
  const writerAudit: Json[] = [];
  const claimAudit: Json[] = [];
  const latency: Json[] = [];
  for (const result of results) {
    const caseId = String(result.caseId ?? "unknown");
    for (const attempt of list<Json>(result.providerProgress)) providerAttempts.push({ caseId, jobId: result.jobId ?? null, ...attempt });
    for (const error of list<Json>(result.providerErrors)) providerAttempts.push({ caseId, jobId: result.jobId ?? null, result: "ERROR", ...error });
    for (const candidate of list<Json>(result.sourceCandidates)) {
      const sourceId = String(candidate.sourceId ?? "unknown");
      const provenance = list<Json>(candidate.enrichmentProvenance);
      for (const entry of provenance) {
        if (entry.accessState) accessMatrix.push({
          caseId,
          jobId: result.jobId ?? null,
          sourceId,
          doi: candidate.doi ?? null,
          canonicalSourceIdentity: candidate.canonicalSourceIdentity ?? null,
          accessState: entry.accessState,
          resolvedUrl: entry.url ?? null,
          contentType: entry.contentType ?? null,
          contentLength: entry.contentLength ?? null,
          accessPath: entry.accessPath ?? [],
          checksum: entry.checksum ?? null,
          failureReason: entry.failureReason ?? null,
        });
        for (const request of list<Json>(entry.resolverRequests)) resolverAttempts.push({
          caseId,
          jobId: result.jobId ?? null,
          sourceId,
          doi: candidate.doi ?? null,
          ...request,
        });
      }
    }
    for (const study of list<Json>(result.structuredStudies)) {
      const statusCounts: Record<string, number> = {};
      const factPayloads = list<Json>(study.structuredStudyFacts);
      for (const payload of factPayloads) {
        const envelope = record(payload.studyFactV2);
        const fields = [
          envelope.domain,
          envelope.populationContext,
          envelope.methodsSummary,
          envelope.primaryQuestion,
          ...Object.values(record(envelope.coreFacts)),
        ];
        for (const value of fields) {
          const status = String(record(value).status ?? "");
          if (status) statusCounts[status] = (statusCounts[status] ?? 0) + 1;
        }
      }
      studyFactCoverage.push({
        caseId,
        sourceId: study.sourceId ?? null,
        studyId: study.studyId ?? null,
        accessState: study.accessState ?? study.contentAccessState ?? null,
        statusCounts,
        studyDesign: study.studyDesign ?? null,
        population: study.population ?? null,
        sampleSize: study.sampleSize ?? null,
        effectDirection: study.effectDirection ?? null,
      });
    }
    for (const matrix of list<Json>(result.studyDifferenceMatrices)) differenceMatrices.push({ caseId, ...matrix });
    for (const row of list<Json>(result.evidenceMatrix)) themeAudit.push({
      caseId,
      themeId: row.themeId ?? null,
      sourceIds: row.sourceIds ?? [],
      admissionStatus: row.admissionStatus ?? null,
      agreement: row.agreement ?? "unknown",
      evidenceStrength: row.evidenceStrength ?? "insufficient",
      differenceSummary: record(row.studyDifferenceMatrix).summary ?? null,
    });
    writerAudit.push({ caseId, jobId: result.jobId ?? null, ...record(result.writerAudit) });
    const writerValidation = record(record(result.writerAudit).validation);
    claimAudit.push({
      caseId,
      claimRealization: writerValidation.claimRealization ?? writerValidation.claimRealizationAudit ?? null,
      citationResolution: writerValidation.citationResolution ?? null,
      quantitativeProvenance: writerValidation.quantitativeProvenance ?? null,
      unsupportedSentenceGate: writerValidation.unsupportedSentenceGate ?? null,
      overstated: writerValidation.overstated ?? "NOT_IMPLEMENTED",
    });
    const lifecycle = record(result.lifecycle);
    const stageLatencies = list<Json>(lifecycle.stages).map((stage) => {
      const started = typeof stage.startedAt === "string" ? Date.parse(stage.startedAt) : Number.NaN;
      const finished = typeof stage.finishedAt === "string" ? Date.parse(stage.finishedAt) : Number.NaN;
      return {
        stage: stage.stage ?? null,
        status: stage.status ?? null,
        durationMs: Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, finished - started) : null,
        attemptCount: stage.attemptCount ?? 0,
        provider: stage.provider ?? null,
        inputCount: stage.inputCount ?? null,
        outputCount: stage.outputCount ?? null,
      };
    });
    latency.push({ caseId, jobId: result.jobId ?? null, totalJobRuntimeMs: result.jobDurationMs ?? null, stages: stageLatencies });
  }
  return { providerAttempts, resolverAttempts, accessMatrix, studyFactCoverage, differenceMatrices, themeAudit, writerAudit, claimAudit, latency };
}

function sumKnown(rows: Json[], key: string): number | null {
  const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
  return values.length === rows.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function waterfallMarkdown(rows: Json[], audits: ReturnType<typeof auditRows>): string {
  const steps: Array<[string, number | null, string]> = [
    ["query generation", sumKnown(rows, "queries"), "bounded deterministic query plan"],
    ["provider search", audits.providerAttempts.length, "provider attempt ledger entries"],
    ["candidate normalization", sumKnown(rows, "candidates"), "normalized candidates"],
    ["dedupe", sumKnown(rows, "deduped"), "canonical DOI/work identity"],
    ["direct study", sumKnown(rows, "directStudies"), "direct evidence classification"],
    ["full-text resolution", audits.resolverAttempts.length, "legal resolver attempts"],
    ["structured parsing", sumKnown(rows, "structuredFullText"), "structured HTML/XML/JATS"],
    ["PDF parsing", sumKnown(rows, "pdfFullText"), "repository/publisher PDF"],
    ["OCR fallback", sumKnown(rows, "ocrFullText"), "scan-only fallback"],
    ["study facts", sumKnown(rows, "structuredStudyFacts"), "provenance-bound envelopes"],
    ["quantitative facts", sumKnown(rows, "quantitativeFacts"), "source-location provenance retained"],
    ["LIMITED", sumKnown(rows, "limitedStudies"), "type-specific admission"],
    ["FORMAL", sumKnown(rows, "formalStudies"), "type-specific admission"],
    ["theme building", sumKnown(rows, "themes"), "semantic theme clustering"],
    ["writer output", rows.filter((row) => row.writerExecuted === true).length, "one logical generation per changed evidence state"],
    ["writer validation", rows.filter((row) => row.writerValidation === true).length, "synthesis and provenance gates"],
    ["export", 0, "content gate not yet proven"],
  ];
  return [
    "# Pipeline Waterfall",
    "",
    "| Stage | Count | Primary interpretation |",
    "|---|---:|---|",
    ...steps.map(([stage, count, reason]) => `| ${stage} | ${count ?? "UNKNOWN"} | ${reason} |`),
    "",
    "Counts marked UNKNOWN are never coerced to zero when a job did not complete the relevant work.",
  ].join("\n");
}

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  const protectedBefore = shaFile(protectedFixture);
  const results: Json[] = [];
  const selected = new Set(
    (process.env.RESEARCHFORGE_QA_CASE_IDS ?? process.env.RESEARCHFORGE_QA_CASE_ID ?? "")
      .split(",").map((value) => value.trim()).filter(Boolean),
  );
  for (const [caseId, slug, topic] of topics.filter(([caseId]) => selected.size === 0 || selected.has(caseId))) {
    try {
      if (aggregateOnly) {
        const existingQa = path.join(outputDir, `case-${caseId}-${slug}`, "qa.json");
        if (!fs.existsSync(existingQa)) {
          throw new Error(`AGGREGATE_ONLY_QA_MISSING:${caseId}`);
        }
        results.push(JSON.parse(fs.readFileSync(existingQa, "utf8")) as Json);
      } else {
        results.push(await runCase(caseId, slug, topic));
      }
    }
    catch (error) {
      results.push({ caseId, slug, topic, classification: "SEARCH_ONLY_RESULT", firstWeakLayer: "runtime", reason: error instanceof Error ? error.message : String(error) });
    }
  }
  const protectedAfter = shaFile(protectedFixture);
  const formal = results.filter((item) => item.classification === "FORMAL_RESEARCH_REPORT").length;
  const limited = results.filter((item) => item.classification === "LIMITED_EVIDENCE_BRIEF").length;
  const publishable = formal + limited;
  const terminalJobs = results.filter((item) => typeof item.jobTerminalState === "string").length;
  const writerValidated = results.filter((item) => item.writerPass === true).length;
  const allTenSelected = results.length === 10;
  const liveContentGate = allTenSelected && terminalJobs === 10 && publishable === 10 && formal >= 8;
  const admissionMismatchCount = results.reduce(
    (sum, item) => sum + Number(item.admissionMismatchCount ?? 0),
    0,
  );
  const formalSafetyViolationCount = results.reduce(
    (sum, item) => sum + Number(item.formalSafetyViolationCount ?? 0),
    0,
  );
  const unknownCollapseViolationCount = results.reduce(
    (sum, item) => sum + Number(item.unknownCollapseViolationCount ?? 0),
    0,
  );
  const liveCanonicalGate = allTenSelected && terminalJobs === 10 &&
    admissionMismatchCount === 0 && formalSafetyViolationCount === 0 &&
    unknownCollapseViolationCount === 0;
  const verdict = terminalJobs !== results.length
    ? "RESEARCHFORGE_CANONICAL_EVIDENCE_ADMISSION_SUBSTRATE_V1_PARTIAL_LIVE_BLOCKED"
    : admissionMismatchCount > 0
      ? "RESEARCHFORGE_CANONICAL_EVIDENCE_ADMISSION_SUBSTRATE_V1_BLOCKED_ADMISSION_DIVERGENCE"
      : "RESEARCHFORGE_CANONICAL_EVIDENCE_ADMISSION_SUBSTRATE_V1_LIVE_PASS_PENDING_REGRESSION";
  const rows = results.map(caseAcceptanceRow);
  const audits = auditRows(results);
  const dropReasons: Record<string, number> = {};
  for (const result of results) {
    for (const candidate of list<Json>(result.sourceCandidates)) {
      if (candidate.reviewStatus === "accepted") continue;
      const reason = String(candidate.rejectionReason ?? candidate.reviewStatus ?? "unknown");
      dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
    }
  }
  const gitStatus = execFileSync("git", ["status", "--porcelain=v1"], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const repositoryState = {
    branch: execFileSync("git", ["branch", "--show-current"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    dirtyEntries: gitStatus.split("\n").filter(Boolean).length,
    protectedFixture, expectedProtectedSha, protectedBefore, protectedAfter,
    protectedUnchanged: protectedBefore === expectedProtectedSha && protectedAfter === expectedProtectedSha,
  };
  const acceptance = {
    schemaVersion: "researchforge-canonical-evidence-admission-substrate/v1",
    evidenceMode: "CURRENT LIVE",
    verdict,
    casesRun: results.length,
    terminalJobs,
    limitedOrBetter: publishable,
    formal,
    limited,
    writerValidated,
    admissionMismatchCount,
    formalSafetyViolationCount,
    unknownCollapseViolationCount,
    liveCanonicalGate,
    generalizationReady: false,
    secondaryDiagnostics: {
      limitedOrBetter: publishable,
      formal,
      writerValidated,
      previousGeneralizationTarget: {
        terminalJobs: 10,
        limitedOrBetter: 10,
        formalMinimum: 8,
      },
      previousGeneralizationTargetPassed: liveContentGate,
    },
    dropReasons,
    cases: rows,
  };
  writeJson("FINAL-ACCEPTANCE-MATRIX.json", acceptance);
  const canonicalAdmissionRows = results.flatMap((item) =>
    list<Json>(item.canonicalAdmissionRows)
  );
  writeJson("CANONICAL-ADMISSION-MATRIX.json", {
    schemaVersion: "researchforge-canonical-admission-matrix/v1",
    evidenceMode: "CURRENT LIVE",
    cases: results.length,
    studies: canonicalAdmissionRows.length,
    admissionMismatchCount,
    formalSafetyViolationCount,
    unknownCollapseViolationCount,
    pass: admissionMismatchCount === 0 && formalSafetyViolationCount === 0 &&
      unknownCollapseViolationCount === 0,
    rows: canonicalAdmissionRows,
  });
  writeJson("LIVE-10-CASE-LATEST-CODE.json", acceptance);
  writeJson("ACQUISITION-JOB-AUDIT.json", results.map((item) => ({
    caseId: item.caseId,
    jobId: item.jobId ?? null,
    terminalState: item.jobTerminalState ?? null,
    terminalManifest: item.terminalManifest ?? null,
    lifecycle: item.lifecycle ?? null,
    clientWaitExpirations: item.clientWaitExpirations ?? 0,
    pollTransportTimeouts: item.pollTransportTimeouts ?? 0,
  })));
  writeJson("PROVIDER-ATTEMPT-AUDIT.json", { evidenceMode: "CURRENT LIVE", attempts: audits.providerAttempts });
  writeJson("FULL-TEXT-RESOLVER-AUDIT.json", { evidenceMode: "CURRENT LIVE", attempts: audits.resolverAttempts });
  writeJson("FULL-TEXT-ACCESS-MATRIX.json", { evidenceMode: "CURRENT LIVE", studies: audits.accessMatrix });
  writeJson("STUDY-FACT-COVERAGE.json", { evidenceMode: "CURRENT LIVE", studies: audits.studyFactCoverage });
  writeJson("STUDY-DIFFERENCE-MATRIX.json", { evidenceMode: "CURRENT LIVE", themes: audits.differenceMatrices });
  writeJson("THEME-SYNTHESIS-AUDIT.json", { evidenceMode: "CURRENT LIVE", themes: audits.themeAudit });
  writeJson("WRITER-REQUEST-AUDIT.json", { evidenceMode: "CURRENT LIVE", cases: audits.writerAudit });
  writeJson("CLAIM-REALIZATION-AUDIT.json", { evidenceMode: "CURRENT LIVE", cases: audits.claimAudit });
  writeJson("PIPELINE-LATENCY.json", { evidenceMode: "CURRENT LIVE", cases: audits.latency });
  writeJson("REGRESSION-REPORT.json", { status: "PENDING_EXTERNAL_REGRESSION", note: "Replaced after the official API, Report Factory, focused, typecheck, build, and diff checks finish." });
  writeText("PIPELINE-WATERFALL.md", waterfallMarkdown(rows, audits));
  writeJson("acceptance-matrix.json", acceptance);
  writeJson("repository-state.json", repositoryState);
  writeJson("REPOSITORY-STATE.json", repositoryState);
  writeJson("provider-usage.json", {
    totalGroundingRequests: results.length,
    totalWriterRequests: results.reduce((sum, item) => sum + Number(item.writerRequests ?? 0), 0),
    extractionOnly, aggregateOnly, contentReruns: 0, blindRetries: 0,
    logicalWriterGenerations: results.reduce(
      (sum, item) => sum + Number(item.writerLogicalGenerations ?? 0),
      0,
    ),
    transportRequests: results.reduce(
      (sum, item) => sum + Number(item.writerTransportRequests ?? 0),
      0,
    ),
    transportRetries: results.reduce(
      (sum, item) => sum + Number(item.writerTransportRetries ?? 0),
      0,
    ),
  });
  const fullTextRecovered = audits.accessMatrix.filter((item) => /^FULL_TEXT_/u.test(String(item.accessState ?? ""))).length;
  const directStudies = rows.reduce((sum, item) => sum + (typeof item.directStudies === "number" ? item.directStudies : 0), 0);
  const caseLines = rows.map((row) => `| ${row.case} | ${row.jobTerminalState ?? "UNKNOWN"} | ${row.finalClassification} | ${row.candidates ?? "UNKNOWN"} | ${row.directStudies ?? "UNKNOWN"} | ${row.structuredFullText ?? "UNKNOWN"}/${row.pdfFullText ?? "UNKNOWN"}/${row.ocrFullText ?? "UNKNOWN"} | ${row.limitedStudies ?? "UNKNOWN"} | ${row.formalStudies ?? "UNKNOWN"} | ${row.primaryBlocker} |`);
  writeText("FINAL-REPORT.md", [
    "# ResearchForge Acquisition Completion and Study Difference Synthesis V4",
    "",
    "## A. Executive Verdict",
    "",
    `**${verdict}** — CURRENT LIVE admission mismatch ${admissionMismatchCount}, formal-safety violations ${formalSafetyViolationCount}, UNKNOWN-collapse violations ${unknownCollapseViolationCount}, ${terminalJobs}/${results.length} terminal jobs.`,
    "",
    "`RESEARCHFORGE_GENERALIZATION_READY = false`",
    "",
    "## B. Repository Identity",
    "",
    `Path: ${repositoryRoot}  `,
    `Branch: ${repositoryState.branch}  `,
    `HEAD: ${repositoryState.head}  `,
    `Dirty entries observed: ${repositoryState.dirtyEntries}. No commit, push, merge, PR, or deploy was performed.`,
    "",
    "## C. Protected Fixture",
    "",
    `Before: ${protectedBefore}  `,
    `After: ${protectedAfter}  `,
    `Expected and unchanged: ${repositoryState.protectedUnchanged}`,
    "",
    "## D. Root Cause",
    "",
    "The create route previously awaited the whole grounding pipeline, so the client ceiling prevented jobId materialization. Job persistence lacked a formal lease/stage/terminal contract, and studyLevelDifferences was incorrectly proxied by moderator presence. Full-text attempts also lacked a complete resolver ledger and sufficiently specific access states.",
    "",
    "## E. Durable Acquisition Implementation",
    "",
    "POST now returns a persisted queued job immediately; leased background execution, stage checkpoints, bounded total job budget, immutable terminal state, terminal manifest, and persisted original request support polling and recovery.",
    "",
    "## F. Client Timeout Semantics",
    "",
    "CLIENT_WAIT_EXPIRED records only that the caller stopped waiting. It does not terminalize or zero the server job; polling or a later worker can resume it by jobId.",
    "",
    "## G. Resume / Checkpoint / Idempotency",
    "",
    "Search results, canonical candidates, accepted sources, parsed/enrichment provenance, Study Facts, evidence cards, report plan, and synthesis-input stages are checkpointed. Canonical source identity and evidence IDs are deduplicated on replay.",
    "",
    "## H. Full-Text Acquisition",
    "",
    `Direct studies: ${directStudies}; resolver attempts: ${audits.resolverAttempts.length}; recovered full-text audit rows: ${fullTextRecovered}; recovery rate: ${directStudies ? `${Math.round(fullTextRecovered / directStudies * 10_000) / 100}%` : "UNKNOWN"}. Structured content is preferred, then legal repository/publisher PDF, then OCR only for scan fallback, then abstract-only.`,
    "",
    "## I. Live 10-Case Results",
    "",
    "| Case | Terminal | Classification | Candidates | Direct | FT structured/PDF/OCR | LIMITED | FORMAL | Primary blocker |",
    "|---|---|---|---:|---:|---|---:|---:|---|",
    ...caseLines,
    "",
    "## J. Study Fact Coverage",
    "",
    "PRESENT, NOT_REPORTED, UNKNOWN, NOT_APPLICABLE, and extraction failure remain distinct in STUDY-FACT-COVERAGE.json. Unfinished acquisition is never converted to zero or NOT_REPORTED.",
    "",
    "## K. Study Difference Synthesis",
    "",
    `Deterministic theme matrices emitted: ${audits.differenceMatrices.length}. Missing/missing is not SAME; Writer receives the comparison matrix and must realize an observed field comparison for studyLevelDifferences to pass.`,
    "",
    "## L. Writer Audit",
    "",
    `Logical generations: ${audits.writerAudit.reduce((sum, item) => sum + Number(item.logicalGenerations ?? 0), 0)}; transport requests: ${audits.writerAudit.reduce((sum, item) => sum + Number(item.transportRequests ?? 0), 0)}; content reruns: 0; validated cases: ${writerValidated}.`,
    "",
    "## M. Claim / Citation / Numerical Provenance",
    "",
    "Per-case claim, citation, unsupported-sentence, and quantitative provenance outputs are preserved in CLAIM-REALIZATION-AUDIT.json. OVERSTATED is marked NOT_IMPLEMENTED where no reliable validator output exists.",
    "",
    "## N. Regression",
    "",
    "See REGRESSION-REPORT.json. This file is finalized only from the official suites and build checks, never inferred from the live cases.",
    "",
    "## O. Export",
    "",
    "CURRENT RUN NOT RUN. No PDF, DOCX, or reports.zip was generated because the formal content gates were not pre-authorized as passed.",
    "",
    "## P. Remaining Blockers",
    "",
    liveContentGate ? "Live content targets passed; remaining closure depends on official regression and export gates." : `Live target remains unmet: required 10/10 LIMITED-or-better and at least 8/10 FORMAL; observed ${publishable}/${results.length} and ${formal}/${results.length}.`,
    "",
    "## Q. Next Smallest Step",
    "",
    terminalJobs !== results.length ? "Resume the remaining non-terminal job(s) from their persisted safe checkpoints and re-poll by jobId." : "Use the per-case first weak layer and resolver ledger to repair the smallest remaining evidence-sufficiency blocker, then run one controlled live rerun only after the evidence state changes.",
  ].join("\n"));
  writeText("FINAL-VERDICT.txt", verdict);
  process.stdout.write(`${verdict}\n${outputDir}\n`);
}

void main().catch((error) => {
  globalThis.fetch = nativeFetch;
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
