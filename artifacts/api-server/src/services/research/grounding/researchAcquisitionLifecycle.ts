import type {
  AcquisitionLifecycle,
  AcquisitionRetryEligibility,
  AcquisitionStageName,
  AcquisitionStageStatus,
  AcquisitionTerminalManifest,
  AcquisitionTerminalStatus,
  GroundingJob,
  GroundingJobStatus,
} from "@workspace/api-zod/research-grounding";
import {
  CANONICAL_STUDY_ADMISSION_VERSION,
  deriveCanonicalStudyAdmissionsForJob,
  studyFactEnvelopesForJob,
} from "../canonical-study-admission";
import {
  buildCanonicalAdmissionProjection,
  canonicalArtifactBindingsForJob,
} from "../canonical-admission-projection";

export const ACQUISITION_STAGES: AcquisitionStageName[] = [
  "QUEUED",
  "NORMALIZING",
  "SEARCHING",
  "DEDUPLICATING",
  "CLASSIFYING_DIRECT_STUDIES",
  "RESOLVING_FULL_TEXT",
  "PARSING_FULL_TEXT",
  "EXTRACTING_STUDY_FACTS",
  "BUILDING_EVIDENCE",
  "BUILDING_THEMES",
  "BUILDING_SYNTHESIS_INPUTS",
];

const DEFAULT_TOTAL_JOB_BUDGET_MS = 30 * 60 * 1_000;
const MIN_TOTAL_JOB_BUDGET_MS = 1_000;
const MAX_TOTAL_JOB_BUDGET_MS = 2 * 60 * 60 * 1_000;

function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function acquisitionTotalJobBudgetMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const configured = Number(env.RESEARCH_ACQUISITION_TOTAL_JOB_BUDGET_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TOTAL_JOB_BUDGET_MS;
  return Math.max(
    MIN_TOTAL_JOB_BUDGET_MS,
    Math.min(MAX_TOTAL_JOB_BUDGET_MS, Math.floor(configured)),
  );
}

function artifactLocationFor(stage: AcquisitionStageName): string {
  const locations: Record<AcquisitionStageName, string> = {
    QUEUED: "job_payload#/requestPayload",
    NORMALIZING: "job_payload#/queryPlan",
    SEARCHING: "job_payload#/searchCheckpoint",
    DEDUPLICATING: "job_payload#/sourceCandidates",
    CLASSIFYING_DIRECT_STUDIES: "job_payload#/acceptedSources",
    RESOLVING_FULL_TEXT: "job_payload#/acceptedSources/*/enrichmentProvenance",
    PARSING_FULL_TEXT: "job_payload#/acceptedSources/*/extractedSections",
    EXTRACTING_STUDY_FACTS: "job_payload#/claimCandidates/*/structuredStudyFact",
    BUILDING_EVIDENCE: "job_payload#/evidenceCards",
    BUILDING_THEMES: "job_payload#/reportPlan",
    BUILDING_SYNTHESIS_INPUTS: "job_payload#/reportPlan",
  };
  return locations[stage];
}

export function initialAcquisitionLifecycle(input: {
  totalJobBudgetMs?: number;
  now?: Date;
} = {}): AcquisitionLifecycle {
  const timestamp = nowIso(input.now);
  return {
    schemaVersion: "researchforge-acquisition-job/v4",
    currentStage: "QUEUED",
    terminalStatus: null,
    stages: ACQUISITION_STAGES.map((stage) => ({
      stage,
      status: stage === "QUEUED" ? "RUNNING" : "PENDING",
      startedAt: stage === "QUEUED" ? timestamp : null,
      finishedAt: null,
      attemptCount: stage === "QUEUED" ? 1 : 0,
      provider: null,
      inputCount: stage === "QUEUED" ? 1 : null,
      outputCount: null,
      errorClass: null,
      retryEligibility: "NOT_APPLICABLE",
      artifactLocation: artifactLocationFor(stage),
    })),
    safeResumeStage: "QUEUED",
    searchCheckpointAvailable: false,
    resumedFromCheckpoint: false,
    runAttemptCount: 0,
    providerRequestCount: 0,
    resolverRequestCount: 0,
    writerCallCount: 0,
    modelSubcallCount: 0,
    totalJobBudgetMs:
      input.totalJobBudgetMs ?? acquisitionTotalJobBudgetMs(),
    lastErrorClass: null,
    terminalManifest: null,
  };
}

export function acquisitionStageForGroundingStatus(
  status: GroundingJobStatus,
): AcquisitionStageName {
  if (status === "queued") return "QUEUED";
  if (
    [
      "planning",
      "rewriting_query",
      "topic_filtering",
      "building_seed_queries",
      "expanding_queries",
      "safety_reviewing",
    ].includes(status)
  ) return "NORMALIZING";
  if (
    [
      "searching",
      "searching_initial",
      "searching_fallback",
      "academic_retrying",
      "searching_metadata",
      "searching_sources",
      "showing_partial_candidates",
    ].includes(status)
  ) return "SEARCHING";
  if (["evaluating_sources", "scoring_sources"].includes(status)) {
    return "DEDUPLICATING";
  }
  if (status === "classifying_direct_studies") {
    return "CLASSIFYING_DIRECT_STUDIES";
  }
  if (["enriching_sources_background", "resolving_full_text"].includes(status)) {
    return "RESOLVING_FULL_TEXT";
  }
  if (status === "parsing_full_text") return "PARSING_FULL_TEXT";
  if (["llm_enhancing", "extracting_study_facts"].includes(status)) {
    return "EXTRACTING_STUDY_FACTS";
  }
  if (status === "building_evidence") return "BUILDING_EVIDENCE";
  if (status === "generation_ready") return "BUILDING_SYNTHESIS_INPUTS";
  return "BUILDING_THEMES";
}

function stageIndex(stage: AcquisitionStageName): number {
  return ACQUISITION_STAGES.indexOf(stage);
}

export function advanceAcquisitionLifecycle(
  lifecycle: AcquisitionLifecycle,
  input: {
    stage: AcquisitionStageName;
    status?: AcquisitionStageStatus;
    provider?: string | null;
    inputCount?: number | null;
    outputCount?: number | null;
    errorClass?: string | null;
    retryEligibility?: AcquisitionRetryEligibility;
    searchCheckpointAvailable?: boolean;
    resumedFromCheckpoint?: boolean;
    providerRequestCount?: number;
    resolverRequestCount?: number;
    now?: Date;
  },
): AcquisitionLifecycle {
  if (lifecycle.terminalStatus) return lifecycle;
  const timestamp = nowIso(input.now);
  const targetIndex = stageIndex(input.stage);
  const stages = lifecycle.stages.map((checkpoint) => {
    const index = stageIndex(checkpoint.stage);
    if (
      index < targetIndex &&
      (checkpoint.status === "RUNNING" || checkpoint.status === "PENDING")
    ) {
      return {
        ...checkpoint,
        status: "COMPLETE" as const,
        startedAt: checkpoint.startedAt ?? timestamp,
        finishedAt: checkpoint.finishedAt ?? timestamp,
      };
    }
    if (checkpoint.stage !== input.stage) return checkpoint;
    const nextStatus = input.status ?? "RUNNING";
    const beginsNewAttempt =
      nextStatus === "RUNNING" && checkpoint.status !== "RUNNING";
    return {
      ...checkpoint,
      status: nextStatus,
      startedAt: checkpoint.startedAt ?? timestamp,
      finishedAt:
        nextStatus === "RUNNING" || nextStatus === "PENDING"
          ? null
          : timestamp,
      attemptCount: checkpoint.attemptCount + (beginsNewAttempt ? 1 : 0),
      provider: input.provider ?? checkpoint.provider,
      inputCount: input.inputCount ?? checkpoint.inputCount,
      outputCount: input.outputCount ?? checkpoint.outputCount,
      errorClass: input.errorClass ?? checkpoint.errorClass,
      retryEligibility:
        input.retryEligibility ?? checkpoint.retryEligibility,
    };
  });
  return {
    ...lifecycle,
    currentStage: input.stage,
    stages,
    safeResumeStage: input.stage,
    searchCheckpointAvailable:
      input.searchCheckpointAvailable ?? lifecycle.searchCheckpointAvailable,
    resumedFromCheckpoint:
      input.resumedFromCheckpoint ?? lifecycle.resumedFromCheckpoint,
    providerRequestCount:
      input.providerRequestCount ?? lifecycle.providerRequestCount,
    resolverRequestCount:
      input.resolverRequestCount ?? lifecycle.resolverRequestCount,
    lastErrorClass: input.errorClass ?? lifecycle.lastErrorClass,
  };
}

export function beginAcquisitionRun(
  lifecycle: AcquisitionLifecycle,
  input: { resumedFromCheckpoint: boolean; now?: Date },
): AcquisitionLifecycle {
  const advanced = advanceAcquisitionLifecycle(lifecycle, {
    stage: lifecycle.safeResumeStage,
    status: "RUNNING",
    resumedFromCheckpoint: input.resumedFromCheckpoint,
    now: input.now,
  });
  return {
    ...advanced,
    runAttemptCount: advanced.runAttemptCount + 1,
  };
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function resolverAttemptCount(job: GroundingJob): number {
  return (job.sourceCandidates ?? []).reduce(
    (sum, source) =>
      sum +
      (source.enrichmentProvenance ?? []).reduce(
        (inner, entry) => inner + records(entry.resolverRequests).length,
        0,
      ),
    0,
  );
}

function providerAttemptCount(job: GroundingJob): number {
  const progress = job.groundingDiagnostics?.providerProgress ?? [];
  const fromProgress = progress.reduce(
    (sum, item) => sum + (item.queryCount ?? 1),
    0,
  );
  return fromProgress || (job.providerErrors?.length ?? 0);
}

function queryCount(job: GroundingJob): number {
  if (!job.queryPlan) return 0;
  return new Set([
    ...job.queryPlan.primaryQueries,
    ...job.queryPlan.secondaryQueries,
    ...job.queryPlan.bilingualQueries.zh,
    ...job.queryPlan.bilingualQueries.en,
  ]).size;
}

export function buildAcquisitionTerminalManifest(
  job: GroundingJob,
  terminalStatus: AcquisitionTerminalStatus,
  completedAt = nowIso(),
): AcquisitionTerminalManifest {
  const terminalComplete = terminalStatus !== "FAILED";
  const admissions = job.canonicalStudyAdmissions ??
    deriveCanonicalStudyAdmissionsForJob({
      job,
      terminal: terminalComplete,
      jobRevision: job.revision,
      checkpointRevision: job.revision,
      decidedAt: completedAt,
    });
  const ownerDecision = admissions[0];
  const projection = buildCanonicalAdmissionProjection({
    decisions: admissions,
    artifacts: canonicalArtifactBindingsForJob(job),
    ownerContext: {
      jobId: job.jobId,
      workflowId: job.workflowId,
      jobRevision: job.revision,
      checkpointRevision: ownerDecision?.checkpointRevision ?? job.revision,
    },
    projectedAt: completedAt,
  });
  const admittedDecisionIds = new Set(
    projection.decisions.filter((item) => item.admitted).map((item) => item.decisionId),
  );
  const access = admissions.filter((item) => admittedDecisionIds.has(item.decisionId)).reduce<Record<string, number>>((counts, item) => {
    counts[item.accessState] = (counts[item.accessState] ?? 0) + 1;
    return counts;
  }, {});
  const envelopes = studyFactEnvelopesForJob(job);
  const diagnostic = job.groundingDiagnostics;
  const caseId =
    typeof job.requestPayload?.caseId === "string"
      ? job.requestPayload.caseId
      : null;
  const resolverAttempts = resolverAttemptCount(job);
  const budget = diagnostic?.budgetAuthority;
  const budgetOverrunCount = budget
    ? Object.keys(budget.effective).filter((dimension) => {
        if (dimension === "elapsedTime") return false;
        const key = dimension as keyof typeof budget.effective;
        return budget.reserved[key] > budget.effective[key];
      }).length
    : 0;
  const hiddenAttemptCount = budget
    ? Object.keys(budget.reserved).filter((dimension) => {
        const key = dimension as keyof typeof budget.reserved;
        return budget.executed[key] > budget.reserved[key];
      }).length
    : 0;
  return {
    jobId: job.jobId,
    caseId,
    topic: job.originalTopic,
    createdAt: job.createdAt,
    completedAt,
    terminalStatus,
    currentStage: job.acquisition?.currentStage ?? "BUILDING_SYNTHESIS_INPUTS",
    queryCount: terminalComplete ? budget?.executed.query ?? queryCount(job) : null,
    providerAttempts: terminalComplete
      ? budget?.executed.requestAttempt ?? providerAttemptCount(job)
      : null,
    candidateCount: terminalComplete ? job.sourceCandidates?.length ?? 0 : null,
    dedupedCount: terminalComplete
      ? diagnostic?.dedupedCount ?? job.sourceCandidates?.length ?? 0
      : null,
    directStudyCount: projection.summary.directStudyCount,
    fullTextResolverAttempts: terminalComplete ? resolverAttempts : null,
    fullTextStructuredCount: terminalComplete
      ? (access.FULL_TEXT_STRUCTURED ?? 0) + (access.FULL_TEXT_HTML ?? 0)
      : null,
    fullTextPdfCount: terminalComplete
      ? (access.FULL_TEXT_PDF ?? 0) + (access.FULL_TEXT_REPOSITORY_COPY ?? 0)
      : null,
    fullTextOcrCount: terminalComplete ? (access.FULL_TEXT_OCR ?? 0) : null,
    abstractOnlyCount: terminalComplete ? access.ABSTRACT_ONLY ?? 0 : null,
    accessDeniedCount: terminalComplete
      ? (access.ACCESS_DENIED ?? 0) + (access.PAYWALLED ?? 0)
      : null,
    notFoundCount: terminalComplete
      ? access.NO_USABLE_ARTIFACT ?? 0
      : null,
    resolverErrorCount: terminalComplete
      ? (access.RESOLVER_ERROR ?? 0) + (access.RATE_LIMITED ?? 0) +
        (access.SERVER_ERROR ?? 0)
      : null,
    unknownIncompleteCount: terminalComplete
      ? access.UNKNOWN ?? 0
      : 1,
    structuredStudyFactCount: terminalComplete ? envelopes.length : null,
    quantitativeFactCount: terminalComplete
      ? envelopes.reduce(
          (sum, envelope) => sum + envelope.quantitativeFacts.length,
          0,
        )
      : null,
    limitedStudyCount: projection.decisions.filter((item) =>
      item.admitted && item.admissionClass === "LIMITED"
    ).length,
    formalStudyCount: projection.decisions.filter((item) =>
      item.admitted && item.admissionClass === "FORMAL"
    ).length,
    blockedStudyCount: projection.summary.canonicalBlockedDecisionCount,
    limitedOrBetterStudyCount: projection.summary.canonicalAdmittedDecisionCount,
    canonicalAdmissionVersion: CANONICAL_STUDY_ADMISSION_VERSION,
    canonicalAdmissionJobRevision: job.revision,
    canonicalProjectionId: projection.projectionId,
    canonicalProjectionVersion: projection.projectionVersion,
    canonicalBindingPass: projection.validation.pass,
    canonicalBindingMismatchCount: projection.validation.issues.length,
    canonicalBindingIssues: projection.validation.issues,
    qualifyingArtifactCount: projection.summary.qualifyingArtifactCount,
    ...(budget
      ? {
          budgetLedgerId: budget.ledgerId,
          budgetAuthorityPass: budgetOverrunCount === 0 && hiddenAttemptCount === 0,
          budgetOverrunCount,
          hiddenAttemptCount,
          budgetBlockedRequestCount: budget.blockedByBudget,
          budgetConfigured: budget.configured,
          budgetEffective: budget.effective,
          budgetReserved: budget.reserved,
          budgetExecuted: budget.executed,
        }
      : {}),
    canonicalAccessStateCounts: access,
    errors: job.acquisition?.lastErrorClass
      ? [job.acquisition.lastErrorClass]
      : [],
    warnings: strings(job.warnings),
    artifactPaths: job.acquisition?.stages
      .map((stage) => stage.artifactLocation)
      .filter((value): value is string => Boolean(value)) ?? [],
  };
}

export function terminalizeAcquisitionLifecycle(
  job: GroundingJob,
  terminalStatus: AcquisitionTerminalStatus,
  input: {
    errorClass?: string | null;
    retryEligibility?: AcquisitionRetryEligibility;
    now?: Date;
  } = {},
): AcquisitionLifecycle {
  const lifecycle =
    job.acquisition ??
    initialAcquisitionLifecycle({ now: input.now });
  const timestamp = nowIso(input.now);
  const preliminaryManifest = buildAcquisitionTerminalManifest(
    {
      ...job,
      acquisition: { ...lifecycle, terminalStatus },
    },
    terminalStatus,
    timestamp,
  );
  const effectiveTerminalStatus: AcquisitionTerminalStatus =
    preliminaryManifest.canonicalBindingPass === false ? "BLOCKED" : terminalStatus;
  const currentStatus: AcquisitionStageStatus =
    effectiveTerminalStatus === "COMPLETE"
      ? "COMPLETE"
      : effectiveTerminalStatus === "PARTIAL"
        ? "PARTIAL"
        : effectiveTerminalStatus === "BLOCKED"
          ? "BLOCKED"
          : "FAILED";
  const advanced = advanceAcquisitionLifecycle(lifecycle, {
    stage: lifecycle.currentStage,
    status: currentStatus,
    errorClass: input.errorClass ?? null,
    retryEligibility:
      input.retryEligibility ??
      (terminalStatus === "FAILED" ? "NON_RETRYABLE" : "NOT_APPLICABLE"),
    now: input.now,
  });
  const jobForManifest: GroundingJob = {
    ...job,
    acquisition: { ...advanced, terminalStatus: effectiveTerminalStatus },
  };
  return {
    ...advanced,
    terminalStatus: effectiveTerminalStatus,
    lastErrorClass:
      preliminaryManifest.canonicalBindingPass === false
        ? "CANONICAL_BINDING_AUDIT_FAILED"
        : input.errorClass ?? advanced.lastErrorClass,
    terminalManifest: buildAcquisitionTerminalManifest(
      jobForManifest,
      effectiveTerminalStatus,
      timestamp,
    ),
  };
}

export function acquisitionTerminalStatusForJob(
  status: GroundingJobStatus,
): AcquisitionTerminalStatus {
  if (status === "failed") return "FAILED";
  if (
    status === "no_sources_after_fallback" ||
    status === "no_results_after_expansion"
  ) return "BLOCKED";
  if (
    status === "partial" ||
    status === "waiting_for_review" ||
    status === "source_review_needs_manual"
  ) return "PARTIAL";
  return "COMPLETE";
}

export function acquisitionErrorClassification(error: unknown): {
  errorClass: string;
  retryEligibility: AcquisitionRetryEligibility;
} {
  const message = error instanceof Error ? error.message : String(error);
  if (/access.denied|paywall|license|legal.restriction|http[_ ]?(?:401|403)/iu.test(message)) {
    return { errorClass: "ACCESS_OR_LICENSE_RESTRICTION", retryEligibility: "NON_RETRYABLE" };
  }
  if (/unsupported.format|broken.document|http[_ ]?(?:404|410)/iu.test(message)) {
    return { errorClass: "BROKEN_OR_UNSUPPORTED_DOCUMENT", retryEligibility: "NON_RETRYABLE" };
  }
  if (/ocr|poor.text|table.extraction|parser.quality/iu.test(message)) {
    return { errorClass: "QUALITY_FALLBACK_REQUIRED", retryEligibility: "QUALITY_FALLBACK" };
  }
  if (/timeout|timed out|rate.limit|http[_ ]?5\d\d|dns|network|temporary|interruption/iu.test(message)) {
    return { errorClass: "TRANSIENT_PROVIDER_OR_PROCESS_FAILURE", retryEligibility: "RETRYABLE" };
  }
  return { errorClass: "UNCLASSIFIED_PIPELINE_FAILURE", retryEligibility: "NON_RETRYABLE" };
}
