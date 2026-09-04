import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { EvidenceCard, GroundingJob, SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  buildFormalResearchArchitecture,
  type StructuredStudyEvidence,
} from "../artifacts/api-server/src/services/formal-research-architecture.ts";
import {
  buildEvidenceGapDrivenQueryPlan,
  type EvidenceGapDrivenQueryPlannerInput,
  type EvidenceGapQueryPurpose,
} from "../artifacts/api-server/src/services/evidence-gap-driven-query-planner.ts";
import {
  auditDirectStudyCandidatesV3,
  diagnoseDirectEvidenceGapV3,
  type DirectStudyCandidateAuditInput,
} from "../artifacts/api-server/src/services/direct-study-relevance-v3.ts";
import { sourceCandidateToSourceRecord } from "../artifacts/report-factory/src/lib/researchGrounding.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

type Json = Record<string, unknown>;

interface GapCase {
  caseId: string;
  slug: string;
  topic: string;
  researchQuestion: string;
  firstEvidenceGap: string;
  counts: { directStudies: number; trueFullText: number; limitedStudies: number; formalStudies: number };
  studyTypes: Record<string, number>;
  themes: Array<{ themeId: string; independentStudies: number; synthesisEligible: boolean }>;
  missingFormalFields: string[];
  recommendedQueryPurposes: EvidenceGapQueryPurpose[];
}

interface GapMap {
  schemaVersion: string;
  cases: GapCase[];
}

interface PriorStudy {
  sourceId: string;
  studyId?: string;
  title: string;
  doi?: string;
  studyDesign?: string;
  contentAccessState?: string;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const apiOrigin = (process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3100").replace(/\/+$/u, "");
const outputDir = path.resolve(repositoryRoot, process.env.RESEARCHFORGE_QA_OUTPUT_DIR ?? "artifacts/qa/researchforge-evidence-gap-formal-synthesis-v3-20260827T150400+0800");
const gapMapPath = path.join(outputDir, "CASE-EVIDENCE-GAP-MAP.json");
const priorRoot = path.join(repositoryRoot, "artifacts/qa/researchforge-general-research-ingestion-20260825T140800+0800/cases");
const protectedFixture = path.join(repositoryRoot, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";
const nativeFetch = globalThis.fetch;

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}

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
  fs.writeFileSync(target, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function sha256(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function command(...args: string[]): string {
  return execFileSync(args[0]!, args.slice(1), { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

async function api(endpoint: string, init?: RequestInit, timeoutMs = 720_000): Promise<{ status: number; body: unknown; durationMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await nativeFetch(`${apiOrigin}/api${endpoint}`, { ...init, signal: controller.signal });
    const raw = await response.text();
    let body: unknown;
    try { body = raw ? JSON.parse(raw) : null; }
    catch { body = { raw: raw.slice(0, 2_000) }; }
    return { status: response.status, body, durationMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

function priorCaseDir(gap: GapCase): string {
  return path.join(priorRoot, `case-${gap.caseId}-${gap.slug}`);
}

function priorDirectStudies(gap: GapCase): PriorStudy[] {
  if (gap.counts.directStudies === 0) return [];
  const caseDir = priorCaseDir(gap);
  const matrix = readJson<Array<{ sourceIds?: string[] }>>(path.join(caseDir, "evidence-matrix.json"));
  const directIds = new Set(matrix.flatMap((row) => row.sourceIds ?? []));
  const studies = readJson<PriorStudy[]>(path.join(caseDir, "structured-study-evidence.json"));
  return studies.filter((study) => directIds.has(study.sourceId));
}

function plannerInput(gap: GapCase): EvidenceGapDrivenQueryPlannerInput {
  const prior = priorDirectStudies(gap);
  return {
    caseId: gap.caseId,
    topic: gap.topic,
    researchQuestion: gap.researchQuestion,
    existingDirectStudies: prior.map((study) => ({
      sourceId: study.sourceId,
      doi: study.doi,
      title: study.title,
      canonicalWorkId: study.studyId,
      studyType: study.studyDesign,
      accessState: study.contentAccessState === "full_text" ? "FULL_TEXT_HTML" : study.contentAccessState,
      missingFormalFields: gap.missingFormalFields,
    })),
    studyTypes: Object.keys(gap.studyTypes),
    existingThemes: gap.themes.map((theme) => ({
      themeId: theme.themeId,
      independentStudyCount: theme.independentStudies,
      admissionStatus: theme.synthesisEligible ? "LIMITED" : "BLOCKED",
    })),
    missingThemes: gap.themes.filter((theme) => theme.independentStudies < 2 || !theme.synthesisEligible).map((theme) => ({
      themeId: theme.themeId,
      independentStudyCount: theme.independentStudies,
      missingIndependentStudies: Math.max(0, 2 - theme.independentStudies),
      admissionStatus: "BLOCKED",
    })),
    missingFormalFields: gap.missingFormalFields,
    purposes: gap.recommendedQueryPurposes,
    maxQueries: 16,
  };
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

function workflow(job: GroundingJob, gap: GapCase, searchQueries: string[]) {
  return {
    workflowId: job.workflowId,
    topicHash: job.topicHash,
    normalizedTopic: gap.topic,
    researchQuestion: gap.researchQuestion,
    namedProviders: list<Json>(record(job.queryPlan).providerHealth).map((item) => String(item.provider ?? "")).filter(Boolean),
    reproducibleSearchStrategy: true,
    explicitInclusionCriteria: true,
    explicitExclusionCriteria: true,
    screeningProcedure: true,
    duplicateRemoval: true,
    documentedStudySelection: true,
    qualityAssessment: true,
    queryExpansion: true,
    themeSynthesis: true,
    searchQueries,
    searchDates: [new Date().toISOString().slice(0, 10)],
    searchLanguages: ["zh-TW", "en"],
    fullTextRetrievalMethods: ["canonical DOI resolution", "OpenAlex/Crossref/Europe PMC/Unpaywall OA locations", "public HTML/PDF extraction"],
    evidenceExtractionMethods: ["section-aware Study Fact V2", "table parser", "figure-caption parser", "exact-span quantitative extraction"],
    relevanceQualityAssessmentMethods: ["topic-integrity contract", "direct-study relevance V3", "canonical study independence", "type-specific admission"],
    inclusionCriteria: ["topic-direct scholarly study with exact evidence span", "legal readable content only"],
    exclusionCriteria: ["metadata-only substantive claim", "off-topic evidence", "publisher shell counted as full text", "duplicate or derived report counted as independent"],
    topicIntegrityPolicy: "fail closed",
  };
}

function accessStateForSource(source: SourceRecord): Json {
  const raw = source as SourceRecord & {
    enrichmentProvenance?: Array<Json>;
    extractionMethod?: string;
    extractionStatus?: string;
    extractionWarnings?: string[];
    fullTextCharCount?: number;
    extractedSections?: Array<{ heading?: string; text?: string }>;
    contentHash?: string;
    fullTextUrl?: string;
    readableUrl?: string;
    accessLevel?: string;
  };
  const provenance = [...(raw.enrichmentProvenance ?? [])].reverse().find((item) => typeof item.accessState === "string");
  let accessState = String(provenance?.accessState ?? "");
  if (!accessState) {
    const warningText = (raw.extractionWarnings ?? []).join(" ");
    const method = raw.extractionMethod ?? "";
    accessState = /publisher.?shell/iu.test(warningText) ? "PUBLISHER_SHELL"
      : /paywall/iu.test(warningText) ? "PAYWALLED"
        : /denied|robots/iu.test(warningText) ? "ACCESS_DENIED"
          : raw.accessLevel === "full_text" && /xml|jats|tei/iu.test(method) ? "FULL_TEXT_STRUCTURED"
            : raw.accessLevel === "full_text" && /pdf/iu.test(method) ? "FULL_TEXT_PDF"
              : raw.accessLevel === "full_text" ? "FULL_TEXT_HTML"
                : raw.accessLevel === "abstract_only" ? "ABSTRACT_ONLY"
                  : raw.accessLevel === "metadata_only" ? "METADATA_ONLY"
                    : "UNRESOLVED";
  }
  return {
    sourceId: source.id,
    canonicalIdentity: source.dedupeKey ?? source.doi ?? source.id,
    accessState,
    resolvedUrl: provenance?.resolvedUrl ?? provenance?.url ?? raw.fullTextUrl ?? raw.readableUrl ?? source.url,
    accessPath: provenance?.accessPath ?? [],
    extractionMethod: raw.extractionMethod,
    extractionStatus: raw.extractionStatus,
    contentLength: raw.fullTextCharCount ?? 0,
    sectionCount: raw.extractedSections?.length ?? 0,
    checksum: provenance?.checksum ?? raw.contentHash,
    resolverRequests: provenance?.resolverRequests ?? [],
    failureReason: provenance?.failureReason ?? raw.extractionWarnings?.join("; "),
  };
}

function directStudiesForArchitecture(architecture: ReturnType<typeof buildFormalResearchArchitecture>): StructuredStudyEvidence[] {
  const ids = new Set(architecture.evidenceMatrix.flatMap((row) => row.sourceIds));
  return architecture.studies.filter((study) => ids.has(study.sourceId));
}

async function runCase(gap: GapCase): Promise<Json> {
  const directory = `cases/case-${gap.caseId}-${gap.slug}`;
  const plan = buildEvidenceGapDrivenQueryPlan(plannerInput(gap));
  writeJson(`${directory}/EvidenceGapDrivenQueryPlan.json`, plan);
  const querySeedZh = plan.queries.filter((query) => query.language === "zh").map((query) => query.query).slice(0, 4);
  const querySeedEn = plan.queries.filter((query) => query.language !== "zh").map((query) => query.query).slice(0, 8);
  const workflowId = `qa-evidence-gap-v3-${gap.caseId}-${Date.now()}`;
  const create = await api("/research-grounding-jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workflowId,
      requestId: `${workflowId}-request`,
      attemptId: `${workflowId}-attempt-1`,
      topic: gap.topic,
      researchQuestion: gap.researchQuestion,
      querySeedZh,
      querySeedEn,
      reportType: "正式二手研究報告",
      audience: "專業",
      searchProfile: "deep",
      debugTrace: true,
    }),
  });
  writeJson(`${directory}/grounding-create-response.json`, create);
  const jobId = String(record(create.body).jobId ?? "");
  if (!jobId) throw new Error(`GROUNDING_JOB_NOT_CREATED:${gap.caseId}:HTTP_${create.status}`);
  const fetched = await api(`/research-grounding-jobs/${encodeURIComponent(jobId)}`);
  writeJson(`${directory}/grounding-job.json`, fetched.body);
  const job = fetched.body as GroundingJob;
  const sources = sourceRecords(job, gap.topic);
  const evidenceCards = list<EvidenceCard>(job.evidenceCards);
  const candidateAudit = auditDirectStudyCandidatesV3(list<DirectStudyCandidateAuditInput>(job.sourceCandidates));
  const architecture = buildFormalResearchArchitecture({
    sources,
    evidenceCards: evidenceCards as unknown as import("../artifacts/api-server/src/services/report-writer.ts").ReportWriterEvidenceCard[],
    workflow: workflow(job, gap, plan.queries.map((query) => query.query)),
  });
  const directStudies = directStudiesForArchitecture(architecture);
  const relevanceDiagnosis = diagnoseDirectEvidenceGapV3({
    candidates: candidateAudit,
    admittedDirectSourceIds: directStudies.map((study) => study.sourceId),
  });
  const accessAudit = sources.map(accessStateForSource);
  const trueFullText = accessAudit.filter((item) => ["FULL_TEXT_STRUCTURED", "FULL_TEXT_HTML", "FULL_TEXT_PDF", "FULL_TEXT_REPOSITORY_COPY"].includes(String(item.accessState)));
  const writerEligible = architecture.reportClassification === "FORMAL_RESEARCH_REPORT";
  writeJson(`${directory}/accepted-sources.json`, sources);
  writeJson(`${directory}/evidence-cards.json`, evidenceCards);
  writeJson(`${directory}/direct-study-relevance-audit.json`, { candidates: candidateAudit, diagnosis: relevanceDiagnosis });
  writeJson(`${directory}/fulltext-access-audit.json`, { states: accessAudit, trueFullTextCount: trueFullText.length });
  writeJson(`${directory}/structured-study-facts.json`, directStudies.map((study) => ({
    sourceId: study.sourceId,
    studyId: study.studyId,
    title: study.title,
    studyDesign: study.studyDesign,
    contentAccessState: study.contentAccessState,
    evidenceSpans: study.evidenceSpans,
    studyFactV2: study.structuredStudyFacts?.map((fact) => record(fact).studyFactV2).find(Boolean) ?? null,
  })));
  writeJson(`${directory}/study-admission-matrix.json`, architecture.evidenceCoverage.typeSpecificAdmission ?? []);
  writeJson(`${directory}/theme-matrix.json`, architecture.evidenceMatrix);
  writeJson(`${directory}/source-independence-matrix.json`, architecture.evidenceMatrix.flatMap((row) => row.sourceIndependence ?? []));
  writeJson(`${directory}/evidence-diversity-audit.json`, architecture.evidenceMatrix.map((row) => ({
    themeId: row.themeId,
    normalizedProposition: row.normalizedProposition,
    evidenceDiversity: row.evidenceDiversity,
    independentStudyIds: row.independentStudyIds,
    primaryIndependentSourceCount: row.primaryIndependentSourceCount,
    formalIndependentSourceCount: row.formalIndependentSourceCount,
    admissionStatus: row.admissionStatus,
  })));
  writeJson(`${directory}/central-answer-contract.json`, {
    researchQuestions: architecture.researchBlueprint.researchQuestions,
    synthesisAxes: architecture.researchBlueprint.synthesisAxes,
    conclusionRequirements: architecture.researchBlueprint.conclusionRequirements,
    closureMatrix: architecture.researchQuestionClosureMatrix,
  });
  writeJson(`${directory}/claim-audit.json`, {
    stage: "PRE_WRITER",
    status: writerEligible ? "PENDING_CONTROLLED_WRITER" : "NOT_RUN_FAIL_CLOSED",
    reason: writerEligible ? "FORMAL_ADMISSION_PASSED" : `WRITER_LOCKED:${architecture.reportClassification}`,
    sectionClaimAllocations: architecture.sectionClaimAllocations,
    quantitativeFacts: architecture.quantitativeFactRegistry,
    visualizationPlan: architecture.visualizationPlan,
  });
  writeJson(`${directory}/writer-admission-decision.json`, {
    classification: architecture.reportClassification,
    eligible: writerEligible,
    writerRequests: 0,
    decision: writerEligible ? "ADMIT_ONE_CONTROLLED_WRITER_REQUEST" : "LOCK_WRITER",
    reasons: architecture.evidenceCoverage.reasons,
  });
  const result = {
    caseId: gap.caseId,
    slug: gap.slug,
    topic: gap.topic,
    firstEvidenceGap: gap.firstEvidenceGap,
    classification: architecture.reportClassification,
    candidates: list(job.sourceCandidates).length,
    acceptedSources: sources.length,
    directStudies: architecture.evidenceCoverage.directStudyCount,
    trueFullText: trueFullText.length,
    limitedStudies: architecture.evidenceCoverage.limitedAdmissionCount ?? 0,
    formalStudies: architecture.evidenceCoverage.formalAdmissionCount ?? 0,
    themes: architecture.evidenceMatrix.length,
    formalThemes: architecture.evidenceMatrix.filter((row) => row.admissionStatus === "FORMAL").length,
    relevanceRootCause: relevanceDiagnosis.rootCause,
    writerEligible,
    writerRequests: 0,
    groundingRequests: 1,
    providerErrors: job.providerErrors ?? [],
    reasons: architecture.evidenceCoverage.reasons,
  };
  writeJson(`${directory}/qa.json`, result);
  return result;
}

async function main(): Promise<void> {
  const protectedBefore = sha256(protectedFixture);
  if (protectedBefore !== expectedProtectedSha) throw new Error(`PROTECTED_FIXTURE_MISMATCH_BEFORE:${protectedBefore}`);
  const map = readJson<GapMap>(gapMapPath);
  const selected = new Set((process.env.RESEARCHFORGE_QA_CASE_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  const results: Json[] = [];
  for (const gap of map.cases.filter((item) => selected.size === 0 || selected.has(item.caseId))) {
    try {
      results.push(await runCase(gap));
      process.stdout.write(`CASE_${gap.caseId}_COMPLETE\n`);
    } catch (error) {
      const failure = {
        caseId: gap.caseId,
        slug: gap.slug,
        topic: gap.topic,
        classification: "SEARCH_ONLY_RESULT",
        writerEligible: false,
        writerRequests: 0,
        groundingRequests: 1,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      };
      writeJson(`cases/case-${gap.caseId}-${gap.slug}/qa.json`, failure);
      results.push(failure);
      process.stdout.write(`CASE_${gap.caseId}_FAILED\n`);
    }
  }
  const protectedAfter = sha256(protectedFixture);
  const limited = results.filter((item) => item.classification === "LIMITED_EVIDENCE_BRIEF").length;
  const formal = results.filter((item) => item.classification === "FORMAL_RESEARCH_REPORT").length;
  const blocked = results.length - limited - formal;
  const preWriterThreshold = limited + formal === results.length && formal >= 8;
  writeJson("PRE-WRITER-ACCEPTANCE-MATRIX.json", {
    schemaVersion: "researchforge-evidence-gap-formal-synthesis-v3/pre-writer-live",
    status: preWriterThreshold ? "PASS_PENDING_CONTROLLED_WRITER" : "PARTIAL",
    limited,
    formal,
    blocked,
    threshold: { limitedOrBetter: `${limited + formal}/${results.length}`, formal: `${formal}/${results.length}`, requiredFormal: 8 },
    topics: results,
  });
  writeJson("provider-usage-pre-writer.json", {
    totalGroundingRequests: results.reduce((sum, item) => sum + Number(item.groundingRequests ?? 0), 0),
    totalWriterRequests: 0,
    retries: 0,
    reruns: 0,
    bounded: true,
  });
  writeJson("repository-state-pre-writer.json", {
    branch: command("git", "branch", "--show-current"),
    head: command("git", "rev-parse", "HEAD"),
    protectedFixture,
    expectedProtectedSha,
    protectedBefore,
    protectedAfter,
    protectedUnchanged: protectedBefore === protectedAfter && protectedAfter === expectedProtectedSha,
  });
  writeText("PRE-WRITER-VERDICT.txt", preWriterThreshold ? "PASS_PENDING_CONTROLLED_WRITER" : "PARTIAL");
  process.stdout.write(`${preWriterThreshold ? "PASS_PENDING_CONTROLLED_WRITER" : "PARTIAL"}\n${outputDir}\n`);
}

if (process.env.RESEARCHFORGE_QA_COMPILE_ONLY !== "1") {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
