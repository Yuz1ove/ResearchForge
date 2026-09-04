import {
  reportModeFromGenerationMode,
  type ReportGenerationMode,
  type ReportWorkspace,
} from "./reportWorkspace.ts";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import type { EvidenceCard } from "./evidenceCards.ts";
import { buildReportDraft } from "./reportDraft.ts";
import { buildQualityReport, type ResearchSectionKey } from "./qualityJudge.ts";
import {
  ReportPlanSchema,
  WriterEvidenceSetSchema,
  type AcademicSafetyReview,
  type CanonicalStudyAdmissionResult,
  type ReportPlan,
  type ReportReadinessStatus,
  type WriterEvidenceSet,
} from "@workspace/api-zod";
import {
  buildStableCitationMarkerMap,
  extractCitationMarkers,
  guardUnsupportedSectionClaims,
  selectSupportedClaimsForSection,
  sourceIdsFromCitationMarkers,
  validateSectionEvidenceCoverage,
} from "./sectionEvidencePolicy.ts";
import {
  containsRawEnglishEvidenceText,
  sanitizeZhTwReportProse,
} from "./zhTwReportText.ts";
import { applyBoundedCoherencePass } from "./reportComposer.ts";
import { buildStructuredReportPlan } from "./structuredReportPlan.ts";
import { canonicalizeInternalCitationTokens } from "./formalReportDocument.ts";
import { applyUserOutlineToReportPlan } from "./generationUx.ts";

export interface LlmReportSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
  coverageStatus?: "sufficient" | "weak" | "insufficient";
  groundingStatus?: "grounded" | "partially_grounded" | "unsupported";
  unsupportedSentences?: string[];
  generationMethod?: string;
  paragraphClaims?: LlmReportParagraphClaim[];
  sentenceClaimTraces?: LlmSentenceClaimTrace[];
  warnings?: string[];
}

export interface LlmSentenceClaimTrace {
  sentenceId: string;
  text: string;
  realizedClaimIds: string[];
  citationSourceIds: string[];
  factual?: boolean;
  validation?: "pass" | "blocked";
  sectionId?: string;
  paragraphId?: string;
  originalText?: string;
  finalText?: string;
  originalClaimIds?: string[];
  finalClaimIds?: string[];
  evidenceIds?: string[];
  citationIds?: string[];
  action?: import("./reportDraft.ts").ReportSentenceRepairAction;
  actionReason?: string;
  repairStage?: "A_PRESERVE" | "B_DETERMINISTIC" | "C_MODEL" | "D_DELETE";
  repairAttempts?: number;
  providerUsed?: string | null;
  validationBefore?: "pass" | "blocked";
  validationAfter?: "pass" | "blocked";
  deleted?: boolean;
  deletionTimestamp?: string;
}

export interface LlmReportParagraphClaim {
  paragraphId: string;
  sectionId: string;
  claimIds: string[];
  evidenceCardIds: string[];
  citationMarkers: string[];
  generatedTextZhTw: string;
  unsupportedSentences: string[];
}

export interface LlmReportSectionPlan {
  sectionId: string;
  title: string;
  paragraphPurpose?: string;
  plannedClaims?: string[];
  plannedClaimIds?: string[];
  allowedCitationKeys?: string[];
  evidenceCardIds: string[];
  conflictingEvidenceCardIds?: string[];
  evidenceLevel?: "full_text" | "abstract" | "mixed" | "metadata_limited";
  targetWordCount?: number;
  supportLevel?: "strong" | "partial" | "limited";
  hasSufficientEvidence?: boolean;
  needsMoreEvidence?: boolean;
  evidenceGaps?: string[];
  uncertaintyOrLimitations?: string[];
}

export interface LlmReportWriterResult {
  ok: boolean;
  status: "success" | "unavailable" | "invalid_input" | "insufficient_sources" | "error";
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  message: string | null;
  warning: string | null;
  sectionPlan: LlmReportSectionPlan[];
  sections: LlmReportSection[];
  reportGenerationProvider: string;
  reportGenerationModel: string | null;
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  fallbackReason: string | null;
  code?: string;
  details?: {
    reportMode?: string | null;
    acceptedSourcesCount?: number;
    evidenceCardsCount?: number;
    minRequiredSources?: number;
    requestedModel?: string | null;
    actualModel?: string | null;
    fallbackUsed?: boolean;
  };
  generationTraceId?: string;
  reportMode?: "short" | "standard";
  researchReportMode?: "evidence_brief" | "formal_research_report";
  citationDisplayMode?: "compact" | "academic";
  formalResearchArchitecture?: unknown;
  formalResearchValidation?: unknown;
  formalResearchCheckpoint?: FormalResearchCheckpoint;
  reportPlan?: ReportPlan;
  reportPlanStatus?: "plan_built" | "complete" | "filtered" | "degraded_legacy";
  reportPlanDiagnostics?: string[];
  writerEvidenceSet?: WriterEvidenceSet;
  evidenceSetHash?: string;
  writerEvidenceSetHash?: string;
  readinessStatus?: ReportReadinessStatus;
  filteredEvidence?: WriterEvidenceSet["rejectedEvidenceCards"];
  filteredAfterPlanCount?: number;
  requestedModel?: string | null;
  actualModel?: string | null;
  generationMode?: "llm_evidence_grounded" | "fallback_conservative_draft" | string;
  evidenceCards?: EvidenceCard[];
  canonicalEvidenceReturned?: boolean;
  canonicalEvidenceStatus?: "complete" | "partial" | "indeterminate" | "empty";
  canonicalTraceableIndeterminateSourceIds?: string[];
  missingEvidence?: Array<{
    sectionId: string;
    title: string;
    reason: string;
    requiredEvidenceRoles?: string[];
  }>;
  warnings?: string[];
  degradedMode?: boolean;
  fallbackReasons?: string[];
  groundingDiagnostics?: Array<{
    sectionId: string;
    groundingStatus: "grounded" | "partially_grounded" | "unsupported";
    unsupportedSentences: string[];
    diagnostics: string[];
  }>;
  writerDiagnostics?: {
    requestedSections: number;
    completedSections: number;
    modelCompletedSections: number;
    repairedSections: number;
    fallbackSections: number;
    completedSectionIds: string[];
    repairedSectionIds: string[];
    fallbackSectionIds: string[];
    failureReasons: Record<string, string>;
    contextBudgetCalls?: Array<{
      callId: string;
      model: string;
      contextLimit: number;
      usableContextBudget: number;
      maximumInputTokens: number;
      estimatedInputTokens: number;
      actualInputTokens?: number;
      outputTokens?: number;
      assignedSection: string;
      evidenceIdsUsed: string[];
      withinBudget: boolean;
    }>;
    contextBudgetExceededCalls?: number;
    formalResearch?: Record<string, unknown>;
    editorialPass?: {
      status: "applied" | "rejected" | "failed" | "skipped";
      provider: string | null;
      model: string | null;
      issues: string[];
    };
    postEditValidation?: {
      status: "pass" | "blocked";
      issues: string[];
    };
    writerAttempts?: Array<{
      attemptId: string;
      phase: "primary" | "repair" | "editorial";
      sectionIds: string[];
      status: "valid" | "repaired" | "failed";
      failureCategory?: string;
      originalRawOutput?: string;
      repair?: {
        method: "partial_json_object_recovery" | "freeform_section_recovery";
        repairedFields: string[];
        confidence: "high" | "medium" | "low";
        validationResult: "pass" | "failed";
      };
    }>;
    writerVNext?: {
      status: "active" | "inactive";
      atomicClaimCount: number;
      validatedSynthesisClaimCount: number;
      rejectedSynthesisClaimCount: number;
      sectionClaimPlanCount: number;
      paragraphContractCount: number;
      sentenceTraceCount: number;
      locallyRepairedSentenceCount: number;
      deletedSentenceCount: number;
      conclusionMode: string | null;
      validationIssueCount: number;
      centralAnswerContract?: Record<string, unknown>;
      bodyRealizationAudit?: Array<Record<string, unknown>>;
      conclusionEligibilityGate?: Record<string, unknown>;
      conclusionClosureAudit?: Record<string, unknown>;
      evidenceDensityAudit?: Record<string, unknown>;
      longReportFeasibility?: Record<string, unknown>;
    };
  };
}

export interface FormalResearchCheckpoint {
  schemaVersion: "formal-research-checkpoint.v1" | "formal-research-checkpoint.v2";
  workflowId: string;
  topicHash: string;
  topicIntegrityVersion?: string;
  topicIntegrityHash?: string;
  relevancePolicyVersion?: string;
  evidenceSetHash: string | null;
  acceptedSourceIds: string[];
  acceptedSourceCount?: number;
  rejectedSourceCount?: number;
  directFindingSourceCount?: number;
  contentIntegrityValidated?: boolean;
  topicIntegrityValidatedAt?: string;
  evidenceIds: string[];
  completedStages: string[];
  resumeFrom: "source_relevance_review" | "writer_generation" | "validation" | "export";
  safeToResume: boolean;
  providerFailureCategories: string[];
  invalidatedBy: string[];
}

// The paired Vercel API has a 60-second function budget. The API runs section
// groups with bounded concurrency, so 57 seconds leaves response/persistence
// headroom without discarding groups that completed just after the old limit.
const DEFAULT_REPORT_DRAFT_TIMEOUT_MS = 57_000;

function reportWriterApiUrl(path: string): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const base = env?.VITE_API_BASE_URL?.trim();
  if (!base) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base.replace(/\/+$/, "")}${normalizedPath}`;
}

function timeoutFallbackResult(reason: string): LlmReportWriterResult {
  return {
    ok: false,
    status: "error",
    llm_status: "timeout",
    fallback_used: true,
    message: "AI 段落強化逾時，已保留 evidence-grounded 完整草稿。",
    warning: reason,
    sectionPlan: [],
    sections: [],
    reportGenerationProvider: "school-openai-compatible",
    reportGenerationModel: null,
    reportGenerationStatus: "timeout",
    fallbackUsed: true,
    fallbackReason: reason,
    degradedMode: true,
    fallbackReasons: [reason],
  };
}

function sanitizeSection(value: unknown): LlmReportSection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const rawProse = typeof data.prose === "string"
    ? canonicalizeInternalCitationTokens(data.prose.trim())
    : "";
  const prose = sanitizeZhTwReportProse(rawProse);
  const evidenceCardIds = Array.isArray(data.evidenceCardIds)
    ? data.evidenceCardIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const citationIds = Array.isArray(data.citationIds)
    ? data.citationIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const warnings = Array.isArray(data.warnings)
    ? data.warnings
        .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
    : [];
  if (containsRawEnglishEvidenceText(rawProse)) {
    warnings.push("raw_english_evidence_removed_from_zh_tw_prose");
  }
  const unsupportedSentences = Array.isArray(data.unsupportedSentences)
    ? data.unsupportedSentences
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const paragraphClaims = Array.isArray(data.paragraphClaims)
    ? data.paragraphClaims.flatMap((item): LlmReportParagraphClaim[] => {
        if (!item || typeof item !== "object") return [];
        const claim = item as Record<string, unknown>;
        const paragraphId = typeof claim.paragraphId === "string" ? claim.paragraphId.trim() : "";
        const claimSectionId = typeof claim.sectionId === "string" ? claim.sectionId.trim() : "";
        const generatedTextZhTw = typeof claim.generatedTextZhTw === "string"
          ? sanitizeZhTwReportProse(claim.generatedTextZhTw.trim())
          : "";
        if (!paragraphId || claimSectionId !== sectionId || !generatedTextZhTw) return [];
        const strings = (key: string) => Array.isArray(claim[key])
          ? (claim[key] as unknown[])
              .map((value) => typeof value === "string" ? value.trim() : "")
              .filter(Boolean)
          : [];
        return [{
          paragraphId,
          sectionId: claimSectionId,
          claimIds: strings("claimIds"),
          evidenceCardIds: strings("evidenceCardIds"),
          citationMarkers: strings("citationMarkers"),
          generatedTextZhTw,
          unsupportedSentences: strings("unsupportedSentences"),
        }];
      })
    : [];
  const sentenceClaimTraces = Array.isArray(data.sentenceClaimTraces)
    ? data.sentenceClaimTraces.flatMap((item): LlmSentenceClaimTrace[] => {
        if (!item || typeof item !== "object") return [];
        const trace = item as Record<string, unknown>;
        const sentenceId =
          typeof trace.sentenceId === "string" ? trace.sentenceId.trim() : "";
        const text =
          typeof trace.text === "string"
            ? sanitizeZhTwReportProse(trace.text.trim())
            : "";
        if (!sentenceId || !text) return [];
        const strings = (key: string) =>
          Array.isArray(trace[key])
            ? (trace[key] as unknown[])
                .map((value) =>
                  typeof value === "string" ? value.trim() : "",
                )
                .filter(Boolean)
            : [];
        return [
          {
            sentenceId,
            text,
            realizedClaimIds: strings("realizedClaimIds"),
            citationSourceIds: strings("citationSourceIds"),
            factual:
              typeof trace.factual === "boolean" ? trace.factual : undefined,
            validation:
              trace.validation === "pass" || trace.validation === "blocked"
                ? trace.validation
                : undefined,
            sectionId:
              typeof trace.sectionId === "string" ? trace.sectionId.trim() : undefined,
            paragraphId:
              typeof trace.paragraphId === "string" ? trace.paragraphId.trim() : undefined,
            originalText:
              typeof trace.originalText === "string"
                ? sanitizeZhTwReportProse(trace.originalText.trim())
                : undefined,
            finalText:
              typeof trace.finalText === "string"
                ? sanitizeZhTwReportProse(trace.finalText.trim())
                : undefined,
            originalClaimIds: strings("originalClaimIds"),
            finalClaimIds: strings("finalClaimIds"),
            evidenceIds: strings("evidenceIds"),
            citationIds: strings("citationIds"),
            action:
              typeof trace.action === "string"
                ? trace.action as LlmSentenceClaimTrace["action"]
                : undefined,
            actionReason:
              typeof trace.actionReason === "string" ? trace.actionReason.trim() : undefined,
            repairStage:
              typeof trace.repairStage === "string"
                ? trace.repairStage as LlmSentenceClaimTrace["repairStage"]
                : undefined,
            repairAttempts:
              typeof trace.repairAttempts === "number" ? trace.repairAttempts : undefined,
            providerUsed:
              typeof trace.providerUsed === "string" ? trace.providerUsed.trim() : null,
            validationBefore:
              trace.validationBefore === "pass" || trace.validationBefore === "blocked"
                ? trace.validationBefore
                : undefined,
            validationAfter:
              trace.validationAfter === "pass" || trace.validationAfter === "blocked"
                ? trace.validationAfter
                : undefined,
            deleted: trace.deleted === true,
            deletionTimestamp:
              typeof trace.deletionTimestamp === "string"
                ? trace.deletionTimestamp.trim()
                : undefined,
          },
        ];
      })
    : [];
  if (!sectionId || !title || !prose) return null;
  return {
    sectionId,
    title,
    prose,
    evidenceCardIds,
    citationIds,
    coverageStatus:
      data.coverageStatus === "sufficient" ||
      data.coverageStatus === "weak" ||
      data.coverageStatus === "insufficient"
        ? data.coverageStatus
        : undefined,
    groundingStatus:
      data.groundingStatus === "grounded" ||
      data.groundingStatus === "partially_grounded" ||
      data.groundingStatus === "unsupported"
        ? data.groundingStatus
        : undefined,
    unsupportedSentences,
    generationMethod:
      typeof data.generationMethod === "string" ? data.generationMethod : undefined,
    ...(paragraphClaims.length ? { paragraphClaims } : {}),
    ...(sentenceClaimTraces.length ? { sentenceClaimTraces } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

function sanitizeSectionPlan(value: unknown): LlmReportSectionPlan | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const evidenceCardIds = Array.isArray(data.evidenceCardIds)
    ? data.evidenceCardIds
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const evidenceGaps = Array.isArray(data.evidenceGaps)
    ? data.evidenceGaps
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
  const plannedClaims = Array.isArray(data.plannedClaims)
    ? data.plannedClaims.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const plannedClaimIds = Array.isArray(data.plannedClaimIds)
    ? data.plannedClaimIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const allowedCitationKeys = Array.isArray(data.allowedCitationKeys)
    ? data.allowedCitationKeys.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const conflictingEvidenceCardIds = Array.isArray(data.conflictingEvidenceCardIds)
    ? data.conflictingEvidenceCardIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const uncertaintyOrLimitations = Array.isArray(data.uncertaintyOrLimitations)
    ? data.uncertaintyOrLimitations.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (!sectionId || !title) return null;
  return {
    sectionId,
    title,
    paragraphPurpose:
      typeof data.paragraphPurpose === "string" ? data.paragraphPurpose : undefined,
    plannedClaims,
    plannedClaimIds,
    allowedCitationKeys,
    evidenceCardIds,
    conflictingEvidenceCardIds,
    evidenceLevel:
      data.evidenceLevel === "full_text" ||
      data.evidenceLevel === "abstract" ||
      data.evidenceLevel === "mixed" ||
      data.evidenceLevel === "metadata_limited"
        ? data.evidenceLevel
        : undefined,
    targetWordCount:
      typeof data.targetWordCount === "number" && Number.isFinite(data.targetWordCount)
        ? Math.max(0, Math.trunc(data.targetWordCount))
        : undefined,
    supportLevel:
      data.supportLevel === "strong" ||
      data.supportLevel === "partial" ||
      data.supportLevel === "limited"
        ? data.supportLevel
        : undefined,
    hasSufficientEvidence:
      typeof data.hasSufficientEvidence === "boolean" ? data.hasSufficientEvidence : undefined,
    needsMoreEvidence:
      typeof data.needsMoreEvidence === "boolean" ? data.needsMoreEvidence : undefined,
    evidenceGaps,
    uncertaintyOrLimitations,
  };
}

function sanitizeWriterDiagnostics(
  value: unknown,
): LlmReportWriterResult["writerDiagnostics"] {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const number = (key: string) =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.max(0, Math.trunc(data[key] as number))
      : 0;
  const strings = (key: string) =>
    Array.isArray(data[key])
      ? (data[key] as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
  const failureReasons = data.failureReasons && typeof data.failureReasons === "object"
    ? Object.fromEntries(
        Object.entries(data.failureReasons as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      )
    : {};
  const editorialRecord = data.editorialPass && typeof data.editorialPass === "object"
    ? data.editorialPass as Record<string, unknown>
    : null;
  const editorialStatus = editorialRecord?.status;
  const validationRecord = data.postEditValidation && typeof data.postEditValidation === "object"
    ? data.postEditValidation as Record<string, unknown>
    : null;
  const validationStatus = validationRecord?.status;
  const writerVNextRecord =
    data.writerVNext && typeof data.writerVNext === "object"
      ? (data.writerVNext as Record<string, unknown>)
      : null;
  const writerVNextStatus = writerVNextRecord?.status;
  const writerAttempts = Array.isArray(data.writerAttempts)
    ? data.writerAttempts
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .filter((item) =>
          typeof item.attemptId === "string" &&
          (item.phase === "primary" || item.phase === "repair" || item.phase === "editorial") &&
          (item.status === "valid" || item.status === "repaired" || item.status === "failed"),
        )
        .map((item) => ({
          attemptId: item.attemptId as string,
          phase: item.phase as "primary" | "repair" | "editorial",
          sectionIds: Array.isArray(item.sectionIds)
            ? item.sectionIds.filter((id): id is string => typeof id === "string")
            : [],
          status: item.status as "valid" | "repaired" | "failed",
          ...(typeof item.failureCategory === "string"
            ? { failureCategory: item.failureCategory }
            : {}),
          ...(typeof item.originalRawOutput === "string"
            ? { originalRawOutput: item.originalRawOutput }
            : {}),
          ...(item.repair && typeof item.repair === "object"
            ? { repair: item.repair as {
                method: "partial_json_object_recovery" | "freeform_section_recovery";
                repairedFields: string[];
                confidence: "high" | "medium" | "low";
                validationResult: "pass" | "failed";
              } }
            : {}),
        }))
    : [];
  const contextBudgetCalls = Array.isArray(data.contextBudgetCalls)
    ? data.contextBudgetCalls
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
          callId: typeof item.callId === "string" ? item.callId : "unknown",
          model: typeof item.model === "string" ? item.model : "unknown",
          contextLimit: typeof item.contextLimit === "number" ? item.contextLimit : 0,
          usableContextBudget:
            typeof item.usableContextBudget === "number" ? item.usableContextBudget : 0,
          maximumInputTokens:
            typeof item.maximumInputTokens === "number" ? item.maximumInputTokens : 0,
          estimatedInputTokens:
            typeof item.estimatedInputTokens === "number" ? item.estimatedInputTokens : 0,
          ...(typeof item.actualInputTokens === "number"
            ? { actualInputTokens: item.actualInputTokens }
            : {}),
          ...(typeof item.outputTokens === "number" ? { outputTokens: item.outputTokens } : {}),
          assignedSection:
            typeof item.assignedSection === "string" ? item.assignedSection : "unknown",
          evidenceIdsUsed: Array.isArray(item.evidenceIdsUsed)
            ? item.evidenceIdsUsed.filter((id): id is string => typeof id === "string")
            : [],
          withinBudget: item.withinBudget === true,
        }))
    : [];
  const writerVNextNumber = (key: string) =>
    writerVNextRecord &&
    typeof writerVNextRecord[key] === "number" &&
    Number.isFinite(writerVNextRecord[key])
      ? Math.max(0, Math.trunc(writerVNextRecord[key] as number))
      : 0;
  return {
    requestedSections: number("requestedSections"),
    completedSections: number("completedSections"),
    modelCompletedSections: number("modelCompletedSections"),
    repairedSections: number("repairedSections"),
    fallbackSections: number("fallbackSections"),
    completedSectionIds: strings("completedSectionIds"),
    repairedSectionIds: strings("repairedSectionIds"),
    fallbackSectionIds: strings("fallbackSectionIds"),
    failureReasons,
    contextBudgetCalls,
    contextBudgetExceededCalls: number("contextBudgetExceededCalls"),
    writerAttempts,
    ...(data.formalResearch && typeof data.formalResearch === "object"
      ? { formalResearch: data.formalResearch as Record<string, unknown> }
      : {}),
    ...(editorialRecord && (
      editorialStatus === "applied" || editorialStatus === "rejected" ||
      editorialStatus === "failed" || editorialStatus === "skipped"
    ) ? {
      editorialPass: {
        status: editorialStatus,
        provider: typeof editorialRecord.provider === "string" ? editorialRecord.provider : null,
        model: typeof editorialRecord.model === "string" ? editorialRecord.model : null,
        issues: Array.isArray(editorialRecord.issues)
          ? editorialRecord.issues.filter((item): item is string => typeof item === "string")
          : [],
      },
    } : {}),
    ...(validationRecord && (validationStatus === "pass" || validationStatus === "blocked") ? {
      postEditValidation: {
        status: validationStatus,
        issues: Array.isArray(validationRecord.issues)
          ? validationRecord.issues.filter((item): item is string => typeof item === "string")
          : [],
      },
    } : {}),
    ...(writerVNextRecord &&
    (writerVNextStatus === "active" || writerVNextStatus === "inactive")
      ? {
          writerVNext: {
            status: writerVNextStatus,
            atomicClaimCount: writerVNextNumber("atomicClaimCount"),
            validatedSynthesisClaimCount: writerVNextNumber(
              "validatedSynthesisClaimCount",
            ),
            rejectedSynthesisClaimCount: writerVNextNumber(
              "rejectedSynthesisClaimCount",
            ),
            sectionClaimPlanCount: writerVNextNumber(
              "sectionClaimPlanCount",
            ),
            paragraphContractCount: writerVNextNumber(
              "paragraphContractCount",
            ),
            sentenceTraceCount: writerVNextNumber("sentenceTraceCount"),
            locallyRepairedSentenceCount: writerVNextNumber(
              "locallyRepairedSentenceCount",
            ),
            deletedSentenceCount: writerVNextNumber("deletedSentenceCount"),
            conclusionMode:
              typeof writerVNextRecord.conclusionMode === "string"
                ? writerVNextRecord.conclusionMode
                : null,
            validationIssueCount: writerVNextNumber("validationIssueCount"),
            ...(writerVNextRecord.centralAnswerContract &&
            typeof writerVNextRecord.centralAnswerContract === "object"
              ? {
                  centralAnswerContract:
                    writerVNextRecord.centralAnswerContract as Record<string, unknown>,
                }
              : {}),
            ...(Array.isArray(writerVNextRecord.bodyRealizationAudit)
              ? {
                  bodyRealizationAudit: writerVNextRecord.bodyRealizationAudit.filter(
                    (item): item is Record<string, unknown> =>
                      Boolean(item && typeof item === "object"),
                  ),
                }
              : {}),
            ...(["conclusionEligibilityGate", "conclusionClosureAudit", "evidenceDensityAudit", "longReportFeasibility"] as const)
              .reduce<Record<string, Record<string, unknown>>>((result, key) => {
                const item = writerVNextRecord[key];
                if (item && typeof item === "object" && !Array.isArray(item)) {
                  result[key] = item as Record<string, unknown>;
                }
                return result;
              }, {}),
          },
        }
      : {}),
  };
}

function sanitizeFormalResearchCheckpoint(
  value: unknown,
): FormalResearchCheckpoint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  if (
    (data.schemaVersion !== "formal-research-checkpoint.v1" &&
      data.schemaVersion !== "formal-research-checkpoint.v2") ||
    typeof data.workflowId !== "string" ||
    typeof data.topicHash !== "string" ||
    (data.evidenceSetHash !== null && typeof data.evidenceSetHash !== "string") ||
    (data.resumeFrom !== "source_relevance_review" &&
      data.resumeFrom !== "writer_generation" &&
      data.resumeFrom !== "validation" &&
      data.resumeFrom !== "export")
  ) {
    return undefined;
  }
  const strings = (key: string): string[] =>
    Array.isArray(data[key])
      ? (data[key] as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
  const optionalString = (key: string): string | undefined =>
    typeof data[key] === "string" ? data[key] : undefined;
  const optionalCount = (key: string): number | undefined =>
    typeof data[key] === "number" && Number.isInteger(data[key]) && data[key] >= 0
      ? data[key]
      : undefined;
  const topicIntegrityVersion = optionalString("topicIntegrityVersion");
  const topicIntegrityHash = optionalString("topicIntegrityHash");
  const relevancePolicyVersion = optionalString("relevancePolicyVersion");
  const acceptedSourceCount = optionalCount("acceptedSourceCount");
  const rejectedSourceCount = optionalCount("rejectedSourceCount");
  const directFindingSourceCount = optionalCount("directFindingSourceCount");
  const topicIntegrityValidatedAt = optionalString("topicIntegrityValidatedAt");
  return {
    schemaVersion: data.schemaVersion,
    workflowId: data.workflowId,
    topicHash: data.topicHash,
    ...(topicIntegrityVersion ? { topicIntegrityVersion } : {}),
    ...(topicIntegrityHash ? { topicIntegrityHash } : {}),
    ...(relevancePolicyVersion ? { relevancePolicyVersion } : {}),
    evidenceSetHash: data.evidenceSetHash as string | null,
    acceptedSourceIds: strings("acceptedSourceIds"),
    ...(acceptedSourceCount !== undefined ? { acceptedSourceCount } : {}),
    ...(rejectedSourceCount !== undefined ? { rejectedSourceCount } : {}),
    ...(directFindingSourceCount !== undefined ? { directFindingSourceCount } : {}),
    ...(typeof data.contentIntegrityValidated === "boolean" ? { contentIntegrityValidated: data.contentIntegrityValidated } : {}),
    ...(topicIntegrityValidatedAt ? { topicIntegrityValidatedAt } : {}),
    evidenceIds: strings("evidenceIds"),
    completedStages: strings("completedStages"),
    resumeFrom: data.resumeFrom,
    safeToResume: data.safeToResume === true,
    providerFailureCategories: strings("providerFailureCategories"),
    invalidatedBy: strings("invalidatedBy"),
  };
}

function normalizeResult(value: unknown): LlmReportWriterResult {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sections = Array.isArray(data.sections)
    ? data.sections
        .map(sanitizeSection)
        .filter((section): section is LlmReportSection => Boolean(section))
    : [];
  const sectionPlan = Array.isArray(data.sectionPlan)
    ? data.sectionPlan
        .map(sanitizeSectionPlan)
        .filter((section): section is LlmReportSectionPlan => Boolean(section))
    : [];
  const evidenceCards = Array.isArray(data.evidenceCards)
    ? data.evidenceCards.filter((item): item is EvidenceCard => {
        if (!item || typeof item !== "object") return false;
        const card = item as Record<string, unknown>;
        return typeof card.id === "string" &&
          typeof card.sourceId === "string" &&
          typeof card.claimText === "string" &&
          typeof card.supportSpan === "string";
      })
    : [];
  const parsedReportPlan = ReportPlanSchema.safeParse(data.reportPlan);
  return {
    ok: data.ok === true,
    status:
      data.status === "success" ||
      data.status === "unavailable" ||
      data.status === "invalid_input" ||
      data.status === "insufficient_sources" ||
      data.status === "error"
        ? data.status
        : "error",
    llm_status:
      data.llm_status === "success" ||
      data.llm_status === "timeout" ||
      data.llm_status === "quota_exceeded" ||
      data.llm_status === "failed" ||
      data.llm_status === "skipped"
        ? data.llm_status
        : "failed",
    fallback_used: data.fallback_used === true,
    message: typeof data.message === "string" ? data.message : null,
    warning: typeof data.warning === "string" ? data.warning : null,
    sectionPlan,
    sections,
    reportGenerationProvider:
      typeof data.reportGenerationProvider === "string"
        ? data.reportGenerationProvider
        : "ollama",
    reportGenerationModel:
      typeof data.reportGenerationModel === "string"
        ? data.reportGenerationModel
        : typeof data.model === "string"
          ? data.model
          : null,
    reportGenerationStatus:
      data.reportGenerationStatus === "success" ||
      data.reportGenerationStatus === "timeout" ||
      data.reportGenerationStatus === "quota_exceeded" ||
      data.reportGenerationStatus === "failed" ||
      data.reportGenerationStatus === "skipped"
        ? data.reportGenerationStatus
        : data.llm_status === "success" ||
            data.llm_status === "timeout" ||
            data.llm_status === "quota_exceeded" ||
            data.llm_status === "failed" ||
            data.llm_status === "skipped"
          ? data.llm_status
          : "failed",
    fallbackUsed: data.fallbackUsed === true || data.fallback_used === true,
    fallbackReason:
      typeof data.fallbackReason === "string"
        ? data.fallbackReason
        : typeof data.warning === "string"
          ? data.warning
          : null,
    code: typeof data.code === "string" ? data.code : undefined,
    details:
      data.details && typeof data.details === "object"
        ? data.details as LlmReportWriterResult["details"]
        : undefined,
    generationTraceId:
      typeof data.generationTraceId === "string" ? data.generationTraceId : undefined,
    reportMode:
      data.reportMode === "short" || data.reportMode === "standard"
        ? data.reportMode
        : undefined,
    researchReportMode:
      data.researchReportMode === "formal_research_report" ||
      data.researchReportMode === "evidence_brief"
        ? data.researchReportMode
        : undefined,
    citationDisplayMode:
      data.citationDisplayMode === "academic" ||
      data.citationDisplayMode === "compact"
        ? data.citationDisplayMode
        : undefined,
    formalResearchArchitecture:
      data.formalResearchArchitecture &&
      typeof data.formalResearchArchitecture === "object"
        ? data.formalResearchArchitecture
        : undefined,
    formalResearchValidation:
      data.formalResearchValidation &&
      typeof data.formalResearchValidation === "object"
        ? data.formalResearchValidation
        : undefined,
    formalResearchCheckpoint:
      sanitizeFormalResearchCheckpoint(data.formalResearchCheckpoint),
    reportPlan: parsedReportPlan.success ? parsedReportPlan.data : undefined,
    reportPlanStatus:
      data.reportPlanStatus === "plan_built" ||
      data.reportPlanStatus === "complete" ||
      data.reportPlanStatus === "filtered" ||
      data.reportPlanStatus === "degraded_legacy"
        ? data.reportPlanStatus
        : undefined,
    reportPlanDiagnostics: Array.isArray(data.reportPlanDiagnostics)
      ? data.reportPlanDiagnostics.filter((item): item is string => typeof item === "string")
      : undefined,
    writerEvidenceSet: WriterEvidenceSetSchema.safeParse(data.writerEvidenceSet).success
      ? WriterEvidenceSetSchema.parse(data.writerEvidenceSet)
      : undefined,
    evidenceSetHash:
      typeof data.evidenceSetHash === "string" ? data.evidenceSetHash : undefined,
    writerEvidenceSetHash:
      typeof data.writerEvidenceSetHash === "string"
        ? data.writerEvidenceSetHash
        : undefined,
    readinessStatus:
      data.readinessStatus === "ready_complete_report" ||
      data.readinessStatus === "ready_limited_report" ||
      data.readinessStatus === "needs_targeted_search" ||
      data.readinessStatus === "blocked_insufficient_evidence" ||
      data.readinessStatus === "invalid_evidence_set"
        ? data.readinessStatus
        : undefined,
    filteredEvidence: Array.isArray(data.filteredEvidence)
      ? data.filteredEvidence.filter((item): item is WriterEvidenceSet["rejectedEvidenceCards"][number] =>
          Boolean(item && typeof item === "object" && typeof (item as { evidenceCardId?: unknown }).evidenceCardId === "string"),
        )
      : undefined,
    filteredAfterPlanCount:
      typeof data.filteredAfterPlanCount === "number"
        ? data.filteredAfterPlanCount
        : undefined,
    requestedModel:
      typeof data.requestedModel === "string" ? data.requestedModel : null,
    actualModel:
      typeof data.actualModel === "string" ? data.actualModel : null,
    generationMode:
      typeof data.generationMode === "string" ? data.generationMode : undefined,
    evidenceCards,
    canonicalEvidenceReturned: Array.isArray(data.evidenceCards),
    canonicalEvidenceStatus:
      data.canonicalEvidenceStatus === "complete" ||
      data.canonicalEvidenceStatus === "partial" ||
      data.canonicalEvidenceStatus === "indeterminate" ||
      data.canonicalEvidenceStatus === "empty"
        ? data.canonicalEvidenceStatus
        : undefined,
    canonicalTraceableIndeterminateSourceIds:
      data.canonicalEvidenceDiagnostics &&
      typeof data.canonicalEvidenceDiagnostics === "object" &&
      Array.isArray(
        (data.canonicalEvidenceDiagnostics as Record<string, unknown>)
          .traceableIndeterminateSourceIds,
      )
        ? (
            (data.canonicalEvidenceDiagnostics as Record<string, unknown>)
              .traceableIndeterminateSourceIds as unknown[]
          ).filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        : undefined,
    missingEvidence: Array.isArray(data.missingEvidence)
      ? data.missingEvidence
          .map((item): NonNullable<LlmReportWriterResult["missingEvidence"]>[number] | null => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const sectionId = typeof record.sectionId === "string" ? record.sectionId : "";
            const title = typeof record.title === "string" ? record.title : sectionId;
            const reason = typeof record.reason === "string" ? record.reason : "";
            if (!sectionId || !reason) return null;
            const requiredEvidenceRoles = Array.isArray(record.requiredEvidenceRoles)
              ? record.requiredEvidenceRoles.filter((role): role is string => typeof role === "string")
              : [];
            return {
              sectionId,
              title,
              reason,
              ...(requiredEvidenceRoles.length ? { requiredEvidenceRoles } : {}),
            };
          })
          .filter((item): item is NonNullable<LlmReportWriterResult["missingEvidence"]>[number] => Boolean(item))
      : undefined,
    warnings: Array.isArray(data.warnings)
      ? data.warnings.filter((item): item is string => typeof item === "string")
      : undefined,
    degradedMode: data.degradedMode === true,
    fallbackReasons: Array.isArray(data.fallbackReasons)
      ? data.fallbackReasons.filter((item): item is string => typeof item === "string")
      : undefined,
    writerDiagnostics: sanitizeWriterDiagnostics(data.writerDiagnostics),
    groundingDiagnostics: Array.isArray(data.groundingDiagnostics)
      ? data.groundingDiagnostics
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const sectionId = typeof record.sectionId === "string" ? record.sectionId : "";
            const groundingStatus =
              record.groundingStatus === "grounded" ||
              record.groundingStatus === "partially_grounded" ||
              record.groundingStatus === "unsupported"
                ? record.groundingStatus
                : null;
            if (!sectionId || !groundingStatus) return null;
            return {
              sectionId,
              groundingStatus,
              unsupportedSentences: Array.isArray(record.unsupportedSentences)
                ? record.unsupportedSentences.filter((value): value is string => typeof value === "string")
                : [],
              diagnostics: Array.isArray(record.diagnostics)
                ? record.diagnostics.filter((value): value is string => typeof value === "string")
                : [],
            };
          })
          .filter((item): item is NonNullable<LlmReportWriterResult["groundingDiagnostics"]>[number] => Boolean(item))
      : undefined,
  };
}

function sourceMixProfileForReportInput(input: ReportInput): string {
  const text = [
    input.reportType,
    input.targetAudience,
    input.academicLevel,
    input.topic,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/商業|企業|產業|產品|市場|business|industry|market|product/.test(text)) {
    return "business_industry";
  }
  if (/醫療|長照|社工|心理|健康|獸醫|medical|health|psycholog|veterinary/.test(text)) {
    return "professional_guidance";
  }
  if (/大學|研究所|碩士|博士|專業|學術|university|college|graduate|academic/.test(text)) {
    return "academic_strict";
  }
  return "school_report_balanced";
}

/**
 * Study Fact V2 envelopes are study-level records, while evidence cards are
 * span-level records. Keep the envelope on exactly one card per study/source
 * so canonical admission remains reproducible without multiplying the same
 * full document envelope across every span in the transport payload.
 */
export function compactEvidenceCardsForWriterTransport(cards: EvidenceCard[]): EvidenceCard[] {
  const envelopeSeen = new Set<string>();
  return cards.map((card) => {
    // `supportingClaims` is a pipeline-level collection repeated on every
    // span card. The report-drafts route never reads it: each transport card
    // already carries its canonical claim text, exact support span, claim ids,
    // and provenance. Omitting the repeated collection is therefore lossless
    // for Writer admission while avoiding quadratic request growth.
    const { supportingClaims: _repeatedSupportingClaims, ...transportCard } = card;
    const fact = transportCard.structuredStudyFact;
    if (!fact?.studyFactV2) return transportCard;
    const key = fact.studyId?.trim() || card.sourceId;
    if (!envelopeSeen.has(key)) {
      envelopeSeen.add(key);
      return transportCard;
    }
    const { studyFactV2: _duplicatedEnvelope, ...compactFact } = fact;
    return { ...transportCard, structuredStudyFact: compactFact };
  });
}

async function resultFromErrorResponse(
  response: Response,
): Promise<LlmReportWriterResult> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const normalized = normalizeResult(payload);
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const recoverable =
    response.status === 404 ||
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;
  const fallbackReason =
    typeof data.code === "string"
      ? data.code
      : normalized.fallbackReason ?? `LLM report writer HTTP ${response.status}`;
  return {
    ...normalized,
    ok: recoverable,
    status: recoverable ? "success" : "invalid_input",
    llm_status: response.status === 504 ? "timeout" : "failed",
    fallback_used: recoverable || Boolean(normalized.details?.fallbackUsed ?? normalized.fallback_used),
    message:
      typeof data.message === "string"
        ? data.message
        : response.status === 400
          ? "報告生成資料不足，請回到來源管理確認已接受來源。"
          : "AI 服務或配對 API 暫時不可用，已保留 evidence-grounded 完整草稿。",
    warning:
      typeof data.warning === "string" ? data.warning : `LLM report writer HTTP ${response.status}`,
    sectionPlan: normalized.sectionPlan,
    sections: recoverable ? normalized.sections : [],
    reportGenerationProvider:
      normalized.reportGenerationProvider === "ollama"
        ? "school-openai-compatible"
        : normalized.reportGenerationProvider,
    reportGenerationModel: normalized.actualModel ?? normalized.reportGenerationModel,
    reportGenerationStatus: response.status === 504 ? "timeout" : "failed",
    fallbackUsed: recoverable || Boolean(normalized.details?.fallbackUsed ?? normalized.fallbackUsed),
    fallbackReason,
    degradedMode: recoverable || normalized.degradedMode,
    canonicalEvidenceReturned: false,
    fallbackReasons: recoverable
      ? Array.from(new Set([...(normalized.fallbackReasons ?? []), fallbackReason]))
      : normalized.fallbackReasons,
  };
}

export async function requestLlmReportDraft(input: {
  reportInput: ReportInput;
  workflowId: string | null;
  jobId?: string | null;
  jobRevision?: number | null;
  canonicalCheckpointRevision?: number | null;
  topicHash: string | null;
  originalTopic: string;
  displayTitle: string;
  acceptedSources: SourceRecord[];
  evidenceCards: EvidenceCard[];
  canonicalStudyAdmissions?: CanonicalStudyAdmissionResult[];
  centralAnswerClaimIds?: string[];
  academicSafetyReview?: AcademicSafetyReview | null;
  reportPlan?: ReportPlan | null;
  generationMode: Exclude<ReportGenerationMode, "blocked">;
  outline?: Array<{ sectionId: string; title: string }>;
  timeoutMs?: number;
}): Promise<LlmReportWriterResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_REPORT_DRAFT_TIMEOUT_MS;
  const reportMode = reportModeFromGenerationMode(input.generationMode);
  const apiGenerationMode =
    input.generationMode === "background_report_mode"
      ? "background_report_mode"
      : "academic_claim_mode";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const transportEvidenceCards = compactEvidenceCardsForWriterTransport(input.evidenceCards);
  let response: Response;
  try {
    const evidenceSetResponse = await fetch(
      reportWriterApiUrl("/api/report-evidence-sets"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: input.workflowId,
          topicHash: input.topicHash,
          topic: input.reportInput.topic,
          researchReportMode:
            input.reportInput.researchReportMode ?? "evidence_brief",
          citationDisplayMode:
            input.reportInput.citationDisplayMode ?? "compact",
          acceptedSources: input.acceptedSources,
          evidenceCards: transportEvidenceCards,
          aliases: [input.reportInput.topic],
          matchedConcepts: [input.reportInput.topic],
        }),
        signal: controller.signal,
      },
    );
    if (!evidenceSetResponse.ok) {
      return await resultFromErrorResponse(evidenceSetResponse);
    }
    const evidenceSetPayload = await evidenceSetResponse.json() as Record<string, unknown>;
    const parsedEvidenceSet = WriterEvidenceSetSchema.safeParse(
      evidenceSetPayload.writerEvidenceSet,
    );
    const writerEvidenceSet = parsedEvidenceSet.success
      ? parsedEvidenceSet.data
      : null;
    const canonicalEvidenceCards = Array.isArray(evidenceSetPayload.evidenceCards)
      ? evidenceSetPayload.evidenceCards.filter(
          (card): card is EvidenceCard =>
            Boolean(
              card &&
              typeof card === "object" &&
              typeof (card as { id?: unknown }).id === "string" &&
              typeof (card as { sourceId?: unknown }).sourceId === "string",
            ),
        )
      : [];
    const canonicalWorkflowId = input.workflowId ?? writerEvidenceSet?.runId ?? null;
    const canonicalTopicHash = input.topicHash ??
      input.acceptedSources.find((source) => source.topicHash?.trim())?.topicHash ??
      null;
    if (
      !writerEvidenceSet ||
      canonicalEvidenceCards.length === 0 ||
      !canonicalWorkflowId ||
      !canonicalTopicHash
    ) {
      return {
        ...timeoutFallbackResult("canonical_writer_evidence_set_invalid"),
        ok: false,
        status: "invalid_input",
        fallback_used: false,
        fallbackUsed: false,
        readinessStatus: "invalid_evidence_set",
      };
    }
    const canonicalReportPlan = buildStructuredReportPlan({
      workflowId: canonicalWorkflowId,
      topicHash: canonicalTopicHash,
      title: input.displayTitle || input.reportInput.topic,
      researchQuestion: input.reportInput.topic,
      reportType: input.reportInput.reportType,
      audience: input.reportInput.targetAudience || input.reportInput.academicLevel,
      evidenceCards: canonicalEvidenceCards,
      academicSafetyReview: input.academicSafetyReview,
      writerEvidenceSet,
      targetedRetrievalAttempted: input.acceptedSources.some((source) =>
        source.exactSearchCompleted === true || source.gapFillSearchCompleted === true,
      ) || !input.acceptedSources.some((source) =>
        source.exactSearchCompleted != null || source.gapFillSearchAttempted != null,
      ),
    });
    if (!canonicalReportPlan) {
      return {
        ...timeoutFallbackResult("canonical_report_plan_not_built"),
        ok: false,
        status: "invalid_input",
        fallback_used: false,
        fallbackUsed: false,
        readinessStatus: "invalid_evidence_set",
      };
    }
    const reportPlan = applyUserOutlineToReportPlan(
      canonicalReportPlan,
      input.outline,
    );
    const outline = reportPlan.sections
      .filter((section) => section.canonicalSectionRole !== "references")
      .map((section) => ({ sectionId: section.sectionId, title: section.title }));
    response = await fetch(reportWriterApiUrl("/api/report-drafts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowId: canonicalWorkflowId,
        jobId: input.jobId ?? input.workflowId,
        jobRevision: input.jobRevision ?? undefined,
        canonicalCheckpointRevision:
          input.canonicalCheckpointRevision ?? undefined,
        topicHash: canonicalTopicHash,
        topic: input.reportInput.topic,
        originalTopic: input.originalTopic,
        displayTitle: input.displayTitle,
        reportMode,
        researchReportMode:
          input.reportInput.researchReportMode ?? "evidence_brief",
        citationDisplayMode:
          input.reportInput.citationDisplayMode ?? "compact",
        reportType: input.reportInput.reportType,
        audience: input.reportInput.targetAudience || input.reportInput.academicLevel,
        language: input.reportInput.outputLanguage || "繁體中文",
        locale: "zh-TW",
        writingStyle: input.reportInput.style,
        requestedLength: input.reportInput.length,
        targetWordCount: input.reportInput.wordCount,
        specifiedStructure: input.reportInput.specifiedStructure,
        rubric: input.reportInput.rubric,
        generationMode: apiGenerationMode,
        sourceMixProfile: sourceMixProfileForReportInput(input.reportInput),
        outline,
        acceptedSources: input.acceptedSources,
        acceptedSourceIds: input.acceptedSources.map((source) => source.id).filter(Boolean),
        evidenceCards: transportEvidenceCards,
        canonicalStudyAdmissions: input.canonicalStudyAdmissions,
        evidenceCardIds: transportEvidenceCards.map((card) => card.id).filter(Boolean),
        centralAnswerClaimIds: input.centralAnswerClaimIds,
        academicSafetyReview: input.academicSafetyReview ?? null,
        reportPlan,
        writerEvidenceSet,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return timeoutFallbackResult(
        `LLM report writer timed out after ${timeoutMs}ms`,
      );
    }
    const cause =
      error instanceof Error &&
      error.cause &&
      typeof error.cause === "object"
        ? (error.cause as { code?: unknown; message?: unknown })
        : null;
    const reason = [
      error instanceof Error
        ? error.message
        : "LLM report writer request failed",
      typeof cause?.code === "string" ? cause.code : null,
      typeof cause?.message === "string" ? cause.message : null,
    ]
      .filter((item): item is string => Boolean(item))
      .join(":");
    return {
      ok: false,
      status: "error",
      llm_status: "failed",
      fallback_used: true,
      message: "AI 服務目前無法連線，已保留 evidence-grounded 完整草稿。",
      warning: reason,
      sectionPlan: [],
      sections: [],
      reportGenerationProvider: "school-openai-compatible",
      reportGenerationModel: null,
      reportGenerationStatus: "failed",
      fallbackUsed: true,
      fallbackReason: reason,
      degradedMode: true,
      fallbackReasons: [reason],
    };
  } finally {
    clearTimeout(timeoutId);
  }
  if (!response.ok) {
    return resultFromErrorResponse(response);
  }
  return normalizeResult(await response.json());
}

export function mergeLlmReportDraft(
  workspace: ReportWorkspace,
  llmResult: LlmReportWriterResult,
): ReportWorkspace {
  const acceptedSourceIds = new Set(
    workspace.acceptedSources.map((source) => source.id).filter(Boolean),
  );
  const returnedEvidenceCards = Array.from(
    new Map(
      (llmResult.evidenceCards ?? [])
        .filter((card) => acceptedSourceIds.has(card.sourceId))
        .map((card) => [card.id, card] as const),
    ).values(),
  );
  const traceableIndeterminateSourceIds = new Set(
    llmResult.canonicalTraceableIndeterminateSourceIds ?? [],
  );
  const traceableLocalEvidenceCards = workspace.evidenceCards.filter((card) =>
    traceableIndeterminateSourceIds.has(card.sourceId),
  );
  const canonicalEvidenceCards = Array.from(
    new Map(
      [...returnedEvidenceCards, ...traceableLocalEvidenceCards]
        .map((card) => [card.id, card] as const),
    ).values(),
  );
  const shouldReplaceWithCanonicalEvidence =
    llmResult.canonicalEvidenceReturned === true &&
    (returnedEvidenceCards.length > 0 || llmResult.canonicalEvidenceStatus !== "indeterminate");
  const mergedEvidenceCards = shouldReplaceWithCanonicalEvidence
    ? canonicalEvidenceCards
    : [
        ...workspace.evidenceCards,
        ...returnedEvidenceCards.filter(
          (card) => !workspace.evidenceCards.some((existing) => existing.id === card.id),
        ),
      ];
  const shouldRebuildBaseline =
    shouldReplaceWithCanonicalEvidence ||
    mergedEvidenceCards.length > workspace.evidenceCards.length;
  const rebuiltDraft = shouldRebuildBaseline
    ? buildReportDraft({
        project: workspace.project,
        topic: workspace.input.topic,
        reportType: workspace.input.reportType,
        audience: workspace.input.targetAudience || workspace.input.academicLevel,
        evidenceCards: mergedEvidenceCards,
        outline: workspace.outline,
        acceptedSources: workspace.acceptedSources,
        acceptedSourceDigest: workspace.acceptedSourceDigest,
        citationFormat: workspace.input.citationFormat,
      })
    : workspace.draft;
  const baselineDraft = shouldRebuildBaseline
    ? { ...rebuiltDraft, title: workspace.draft.title }
    : rebuiltDraft;
  const llmDiagnostics = {
    reportGenerationProvider: llmResult.reportGenerationProvider,
    reportGenerationModel: llmResult.reportGenerationModel,
    reportGenerationStatus: llmResult.reportGenerationStatus,
    fallbackUsed: llmResult.fallbackUsed,
    fallbackReason: llmResult.fallbackReason,
    message: llmResult.message,
    warning: llmResult.warning,
    degradedMode:
      llmResult.degradedMode === true ||
      (llmResult.reportPlanStatus !== undefined &&
        llmResult.reportPlanStatus !== "plan_built" &&
        llmResult.reportPlanStatus !== "complete") ||
      (llmResult.readinessStatus !== undefined &&
        llmResult.readinessStatus !== "ready_complete_report" &&
        llmResult.readinessStatus !== "ready_limited_report") ||
      (llmResult.evidenceSetHash !== undefined &&
        llmResult.writerEvidenceSetHash !== undefined &&
        llmResult.evidenceSetHash !== llmResult.writerEvidenceSetHash) ||
      llmResult.fallbackUsed ||
      (llmResult.writerDiagnostics?.fallbackSections ?? 0) > 0 ||
      llmResult.reportGenerationStatus !== "success" ||
      llmResult.sections.some(
        (section) =>
          section.groundingStatus === "unsupported" ||
          section.generationMethod === "fallback_bundle_synthesis" ||
          section.generationMethod === "grounding_verifier_blocked" ||
          section.generationMethod === "insufficient_evidence_notice",
      ),
    fallbackReasons: llmResult.fallbackReasons,
    groundingDiagnostics: llmResult.groundingDiagnostics,
    generationMode: llmResult.generationMode,
    missingEvidence: llmResult.missingEvidence,
    warnings: llmResult.warnings,
    sectionPlan: llmResult.sectionPlan,
    reportPlanStatus: llmResult.reportPlanStatus,
    reportPlanDiagnostics: llmResult.reportPlanDiagnostics,
    writerEvidenceSet: llmResult.writerEvidenceSet,
    evidenceSetHash: llmResult.evidenceSetHash,
    writerEvidenceSetHash: llmResult.writerEvidenceSetHash,
    readinessStatus: llmResult.readinessStatus,
    filteredEvidence: llmResult.filteredEvidence,
    filteredAfterPlanCount: llmResult.filteredAfterPlanCount,
    writerDiagnostics: llmResult.writerDiagnostics,
    formalResearchValidation: llmResult.formalResearchValidation,
    formalResearchCheckpoint: llmResult.formalResearchCheckpoint,
  };
  const withDraft = (
    draft: typeof baselineDraft,
    qualityReport = draft.qualityReport,
  ): ReportWorkspace => ({
    ...workspace,
    llmDiagnostics,
    evidenceCards: mergedEvidenceCards,
    generationPayload: {
      ...workspace.generationPayload,
      evidenceCards: mergedEvidenceCards,
      reportPlan: llmResult.reportPlan ?? workspace.generationPayload.reportPlan,
      writerEvidenceSet:
        llmResult.writerEvidenceSet ?? workspace.generationPayload.writerEvidenceSet,
      formalResearchCheckpoint:
        llmResult.formalResearchCheckpoint ?? workspace.generationPayload.formalResearchCheckpoint,
    },
    draft,
    report: {
      ...workspace.report,
      meta: {
        ...workspace.report.meta,
        researchDraft: draft,
        qualityReport,
        evidenceCards: mergedEvidenceCards,
      },
    },
    qualityReport,
  });
  const unusableGenerationMethods = new Set([
    "grounding_verifier_blocked",
    "insufficient_evidence_notice",
  ]);
  const modelResponseCanImproveDraft =
    llmResult.ok &&
    (!llmResult.fallbackUsed ||
      llmResult.generationMode === "hybrid_evidence_grounded") &&
    llmResult.llm_status === "success" &&
    llmResult.reportGenerationStatus === "success";
  const fallbackCanFillEvidenceGaps = llmResult.ok && llmResult.fallbackUsed;
  const eligibleSections = llmResult.sections.filter(
    (section) =>
      section.prose.trim().length > 0 &&
      section.groundingStatus !== "unsupported" &&
      !unusableGenerationMethods.has(section.generationMethod ?? "") &&
      (modelResponseCanImproveDraft ||
        (fallbackCanFillEvidenceGaps &&
          section.generationMethod === "fallback_bundle_synthesis" &&
          section.evidenceCardIds.length > 0)),
  );
  if (eligibleSections.length === 0) {
    return withDraft(baselineDraft);
  }
  const sectionsById = new Map(
    eligibleSections.map((section) => [section.sectionId, section]),
  );
  const formalComposerMode = workspace.input.researchReportMode === "formal_research_report" &&
    (llmResult.sectionPlan?.length ?? 0) > 0;
  const baselineSectionById = new Map(
    baselineDraft.sections.map((section) => [section.sectionId, section] as const),
  );
  const formalSectionTemplateIds: Record<string, string> = {
    background: "introduction",
    methods: "methodology",
    evidence_overview: "literature_review",
    findings: "findings",
    cross_study_synthesis: "discussion",
    discussion: "discussion",
    limitations_gaps: "limitations",
    conclusion: "conclusion",
  };
  const formalPlannedSectionIds = Array.from(new Set(
    ((llmResult.sectionPlan?.length ?? 0) > 0
      ? llmResult.sectionPlan!.map((section) => section.sectionId)
      : eligibleSections.map((section) => section.sectionId))
      .filter((sectionId) => sectionId !== "executive_summary" && sectionsById.has(sectionId)),
  ));
  const mergeCandidateSections = formalComposerMode
    ? [
        ...baselineDraft.sections.filter((section) =>
          section.sectionId === "title" || section.sectionId === "abstract"
        ),
        ...formalPlannedSectionIds.flatMap((sectionId) => {
          const llmSection = sectionsById.get(sectionId);
          const templateId = formalSectionTemplateIds[sectionId] ?? sectionId;
          const template = baselineSectionById.get(templateId);
          if (!llmSection || !template) return [];
          return [{
            ...template,
            sectionId,
            title: llmSection.title,
            body: "",
            synthesizedProseZhTw: "",
            sectionGoal: llmSection.title,
            supportingSourceIds: Array.from(new Set(llmSection.citationIds)),
            citationMarkers: [],
            evidenceSummary: "",
            evidenceGaps: [],
            evidenceCardIds: Array.from(new Set(llmSection.evidenceCardIds)),
            citationIds: Array.from(new Set(llmSection.citationIds)),
            citationCount: 0,
            evidenceCardCount: llmSection.evidenceCardIds.length,
            warnings: [],
          }];
        }),
        ...baselineDraft.sections.filter((section) => section.sectionId === "references"),
      ]
    : baselineDraft.sections;
  const allowedEvidenceIds = new Set(mergedEvidenceCards.map((card) => card.id));
  const allowedSourceIds = acceptedSourceIds;
  const evidenceToSource = new Map(
    mergedEvidenceCards.map((card) => [card.id, card.sourceId]),
  );
  const evidenceSourceIds = new Set(
    mergedEvidenceCards.map((card) => card.sourceId).filter(Boolean),
  );
  const citationRegistrySources = workspace.acceptedSources.filter((source) =>
    evidenceSourceIds.has(source.id),
  );
  const stableSourceMarkerMap = buildStableCitationMarkerMap(citationRegistrySources);
  const markerRegistrations = mergedEvidenceCards.flatMap((card) => {
    if (!evidenceSourceIds.has(card.sourceId)) return [];
    const marker = extractCitationMarkers(card.citationMarker ?? "")[0];
    return marker ? [{ sourceId: card.sourceId, marker }] : [];
  });
  const registeredMarkersBySource = new Map<string, Set<string>>();
  const registeredSourcesByMarker = new Map<string, Set<string>>();
  for (const registration of markerRegistrations) {
    const sourceMarkers = registeredMarkersBySource.get(registration.sourceId) ?? new Set<string>();
    sourceMarkers.add(registration.marker);
    registeredMarkersBySource.set(registration.sourceId, sourceMarkers);
    const markerSources = registeredSourcesByMarker.get(registration.marker) ?? new Set<string>();
    markerSources.add(registration.sourceId);
    registeredSourcesByMarker.set(registration.marker, markerSources);
  }
  const evidenceRegistryIsCompleteAndUnambiguous = citationRegistrySources.length > 0 &&
    citationRegistrySources.every((source) => registeredMarkersBySource.get(source.id)?.size === 1) &&
    Array.from(registeredSourcesByMarker.values()).every((sourceIds) => sourceIds.size === 1);
  // The writer emits prose against the marker registry carried by the evidence
  // cards. Re-sorting the same sources here can silently bind [S1] to a
  // different paper, then cause the grounding guard to delete otherwise valid
  // sentences. Use the evidence registry when it is complete; retain the
  // deterministic map only as a fail-closed fallback for legacy payloads.
  const sourceMarkerMap = evidenceRegistryIsCompleteAndUnambiguous
    ? new Map(
        citationRegistrySources.map((source) => [
          source.id,
          Array.from(registeredMarkersBySource.get(source.id) ?? [])[0]!,
        ]),
      )
    : stableSourceMarkerMap;
  const acceptedMarkers = new Set(sourceMarkerMap.values());
  const nextDraft = {
    ...baselineDraft,
    // Formal Composer sections are created from the Blueprint order and use
    // legacy draft sections only as structural shells. Their IDs, titles,
    // evidence ownership and sentence lineage remain authoritative.
    sections: mergeCandidateSections.map((section) => {
      const llmSection = sectionsById.get(section.sectionId);
      if (!llmSection) return section;
      const isSafeFallbackSection =
        llmSection.generationMethod === "fallback_bundle_synthesis";
      const localSectionAlreadySubstantive =
        section.body.trim().length >= 120 &&
        !/目前沒有可直接支撐|證據不足|來源不足|尚未完成|資料缺口|尚缺直接證據/u.test(
          section.body,
        );
      if (isSafeFallbackSection && localSectionAlreadySubstantive) return section;
      const activeReportPlan = llmResult.reportPlan ?? workspace.generationPayload.reportPlan;
      const plannedSectionEvidenceIds = activeReportPlan?.sections
        .find((plannedSection) => plannedSection.sectionId === section.sectionId)
        ?.evidenceCardIds.filter((id) => allowedEvidenceIds.has(id)) ?? [];
      // A structured ReportPlan is the canonical section binding.  The local
      // baseline draft may have applied an older per-section card cap; using
      // that legacy subset here silently removed valid fourth-or-later sources
      // from otherwise correct model prose and reassigned its citations.
      const sectionAllowedEvidenceIds = new Set(
        plannedSectionEvidenceIds.length > 0
          ? plannedSectionEvidenceIds
          : section.evidenceCardIds,
      );
      const plannedSectionSourceIds = Array.from(sectionAllowedEvidenceIds)
        .map((id) => evidenceToSource.get(id))
        .filter((id): id is string => Boolean(id));
      const sectionAllowedSourceIds = new Set([
        ...section.citationIds,
        ...section.supportingSourceIds,
        ...plannedSectionSourceIds,
      ]);
      const evidenceCardIds = llmSection.evidenceCardIds.filter((id) =>
        allowedEvidenceIds.has(id) && sectionAllowedEvidenceIds.has(id),
      );
      const citationIds = llmSection.citationIds
        .map((id) => evidenceToSource.get(id) ?? id)
        .filter((id) => allowedSourceIds.has(id) && sectionAllowedSourceIds.has(id));
      const effectiveCitationIds = Array.from(new Set(
        citationIds.length > 0
          ? citationIds
          : evidenceCardIds
              .map((id) => evidenceToSource.get(id))
              .filter((id): id is string => Boolean(id)),
      ));
      const availableMarkers = effectiveCitationIds
        .map((id) => sourceMarkerMap.get(id))
        .filter((marker): marker is string => Boolean(marker));
      const fallbackSectionMarkers = section.citationMarkers.filter((marker) =>
        acceptedMarkers.has(marker),
      );
      const guardMarkers = availableMarkers.length > 0
        ? availableMarkers
        : fallbackSectionMarkers;
      const hasCompleteWriterSentenceLineage =
        (llmSection.sentenceClaimTraces?.length ?? 0) > 0 &&
        llmSection.sentenceClaimTraces!.every((trace) =>
          trace.deleted === true ||
          trace.factual === false ||
          (
            (trace.validationAfter ?? trace.validation) === "pass" &&
            trace.realizedClaimIds.length > 0 &&
            trace.citationSourceIds.length > 0
          )
        );
      const lineageProse = hasCompleteWriterSentenceLineage
        ? Array.from(
            llmSection.sentenceClaimTraces!.reduce<Map<string, LlmSentenceClaimTrace[]>>(
              (groups, trace) => {
                if (trace.deleted) return groups;
                const paragraphId = trace.paragraphId ||
                  trace.sentenceId.match(/^(.*?-p\d+)-s\d+(?:-\d+)?$/u)?.[1] ||
                  `${section.sectionId}-p1`;
                const traces = groups.get(paragraphId) ?? [];
                traces.push(trace);
                groups.set(paragraphId, traces);
                return groups;
              },
              new Map(),
            ),
          )
            .map(([, traces]) => traces.map((trace) => {
              const rawText = (trace.finalText || trace.text).trim();
              if (!rawText || trace.factual === false) return rawText;
              const markers = Array.from(new Set(
                trace.citationSourceIds
                  .map((sourceId) => sourceMarkerMap.get(sourceId))
                  .filter((marker): marker is string => Boolean(marker)),
              ));
              if (markers.length === 0) return rawText;
              const punctuation = rawText.match(/([。！？!?；;])$/u)?.[1] ?? "。";
              const body = rawText.replace(/[。！？!?；;]+$/u, "").trim();
              return `${body}${markers.join("")}${punctuation}`;
            }).filter(Boolean).join(" "))
            .filter(Boolean)
            .join("\n\n")
        : llmSection.prose;
      // Server-side Writer vNext has already validated these exact sentences
      // against immutable claim/source lineage. Running the legacy text-only
      // guard again would fuzzy-match and delete content that has stronger
      // structured proof than the guard can observe.
      const guarded = hasCompleteWriterSentenceLineage
        ? { text: lineageProse, warnings: [] as string[] }
        : guardUnsupportedSectionClaims({
            sectionKey: section.sectionId as ResearchSectionKey,
            text: lineageProse,
            availableCitationMarkers: guardMarkers,
          });
      const actualMarkers = extractCitationMarkers(guarded.text)
        .filter((marker) => acceptedMarkers.has(marker) && guardMarkers.includes(marker));
      const actualCitationIds = sourceIdsFromCitationMarkers(actualMarkers, sourceMarkerMap);
      const effectiveEvidenceCardIds = evidenceCardIds.length
        ? evidenceCardIds
        : workspace.generationPayload.reportPlan
          ? []
          : section.evidenceCardIds;
      const coverage = validateSectionEvidenceCoverage({
        sectionKey: section.sectionId as ResearchSectionKey,
        text: guarded.text,
        claims: selectSupportedClaimsForSection(
          baselineDraft.debug.supportedClaims ?? [],
          section.sectionId as ResearchSectionKey,
        ),
        evidenceCardIds: effectiveEvidenceCardIds,
        citationMarkers: actualMarkers,
      });
      return {
        ...section,
        title: /^第\s*\d+\s*章$/u.test(llmSection.title.trim())
          ? section.title
          : llmSection.title || section.title,
        prose: guarded.text,
        body: guarded.text,
        synthesizedProseZhTw: guarded.text,
        supportingSourceIds: actualCitationIds,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationIds: actualCitationIds,
        citationMarkers: actualMarkers,
        evidenceCoverageStatus: llmSection.coverageStatus ?? coverage.status,
        groundingStatus: llmSection.groundingStatus,
        unsupportedSentences: llmSection.unsupportedSentences,
        generationMethod: llmSection.generationMethod,
        paragraphClaims: llmSection.paragraphClaims?.map((paragraphClaim) => ({
          ...paragraphClaim,
          // Writer vNext atomic/synthesis identities intentionally live in a
          // different namespace from legacy ReportPlan planned claims. They
          // are immutable provenance and must survive this boundary verbatim.
          claimIds: Array.from(new Set(paragraphClaim.claimIds)),
          evidenceCardIds: paragraphClaim.evidenceCardIds.filter((id) =>
            allowedEvidenceIds.has(id) && sectionAllowedEvidenceIds.has(id),
          ),
        })),
        sentenceClaimTraces: llmSection.sentenceClaimTraces?.map((trace) => {
          const paragraphMatch = trace.sentenceId.match(/^(.*?)-p(\d+)-s\d+(?:-\d+)?$/u);
          const paragraphId = trace.paragraphId || (paragraphMatch
            ? `${section.sectionId}-p${paragraphMatch[2]}`
            : `${section.sectionId}-p1`);
          const paragraphEvidenceIds = llmSection.paragraphClaims
            ?.find((claim) => claim.paragraphId === paragraphId)
            ?.evidenceCardIds.filter((id) =>
              allowedEvidenceIds.has(id) && sectionAllowedEvidenceIds.has(id),
            ) ?? [];
          const finalText = trace.finalText || trace.text;
          const validation = trace.validationAfter ?? trace.validation ?? "pass";
          return {
            sentenceId: trace.sentenceId,
            sectionId: trace.sectionId || section.sectionId,
            paragraphId,
            originalText: trace.originalText || trace.text,
            finalText,
            originalClaimIds: Array.from(new Set(
              trace.originalClaimIds?.length
                ? trace.originalClaimIds
                : trace.realizedClaimIds,
            )),
            finalClaimIds: Array.from(new Set(
              trace.finalClaimIds?.length
                ? trace.finalClaimIds
                : trace.realizedClaimIds,
            )),
            realizedClaimIds: Array.from(new Set(trace.realizedClaimIds)),
            evidenceIds: Array.from(new Set(
              (trace.evidenceIds?.length ? trace.evidenceIds : paragraphEvidenceIds)
                .filter((id) => allowedEvidenceIds.has(id)),
            )),
            citationSourceIds: Array.from(new Set(
              trace.citationSourceIds.filter((id) => allowedSourceIds.has(id)),
            )),
            citationIds: Array.from(new Set(trace.citationIds ?? [])),
            factual: trace.factual !== false,
            validation,
            action: trace.action ?? "UNCHANGED",
            actionReason: trace.actionReason ?? "writer_validated_sentence",
            repairStage: trace.repairStage ?? "A_PRESERVE",
            repairAttempts: trace.repairAttempts ?? 0,
            providerUsed: trace.providerUsed ?? null,
            validationBefore: trace.validationBefore ?? validation,
            validationAfter: validation,
            deleted: trace.deleted === true,
            ...(trace.deletionTimestamp
              ? { deletionTimestamp: trace.deletionTimestamp }
              : {}),
          };
        }),
        citationCount: coverage.citationCount,
        evidenceCardCount: coverage.evidenceCardCount,
        writerNote: "LLM 只在本節既有的主張與引用綁定內編輯文字。",
        warnings:
          llmSection.warnings && llmSection.warnings.length > 0
            ? Array.from(new Set([...llmSection.warnings, ...guarded.warnings]))
            : Array.from(new Set([...section.warnings, ...guarded.warnings])),
      };
    }),
  };
  const coherencePass = applyBoundedCoherencePass({
    sections: nextDraft.sections,
    discoursePlan:
      (llmResult.reportPlan ?? workspace.generationPayload.reportPlan)?.discoursePlan,
  });
  nextDraft.sections = coherencePass.sections;
  nextDraft.text = nextDraft.sections
    .map((section) => `${section.title}\n${section.body}`)
    .join("\n\n");
  const nextQualityReport = buildQualityReport({
    topic: workspace.input.topic,
    depth: workspace.project.depth,
    acceptedSources: workspace.acceptedSources,
    evidenceCards: mergedEvidenceCards,
    sections: nextDraft.sections.map((section) => ({
      id: section.sectionId,
      key: section.sectionId as ResearchSectionKey,
      title: section.title,
      content: section.body,
      evidenceCardIds: section.evidenceCardIds,
      citationIds: section.citationIds,
      warnings: section.warnings,
    })),
  });
  nextDraft.qualityReport = nextQualityReport;
  return withDraft(nextDraft, nextQualityReport);
}
