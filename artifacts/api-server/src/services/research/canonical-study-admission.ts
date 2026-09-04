import { createHash } from "node:crypto";

import type {
  CanonicalStudyAccessState,
  CanonicalStudyAdmissionReasonCode,
  CanonicalStudyAdmissionResult,
  GroundingJob,
} from "@workspace/api-zod/research-grounding";
import {
  admitStudyFactEnvelopeV2,
  type StudyAdmissionV2,
  type StudyFactEnvelopeV2,
} from "./study-fact-extraction-v2";

export const CANONICAL_STUDY_ADMISSION_SCHEMA_VERSION =
  "researchforge-canonical-study-admission/v1" as const;
export const CANONICAL_STUDY_ADMISSION_VERSION =
  "canonical-evidence-admission.v1" as const;

const QUALIFYING_FULL_TEXT_STATES = new Set<CanonicalStudyAccessState>([
  "FULL_TEXT_STRUCTURED",
  "FULL_TEXT_HTML",
  "FULL_TEXT_PDF",
  "FULL_TEXT_OCR",
  "FULL_TEXT_REPOSITORY_COPY",
]);

interface ResolverRequestLike {
  result?: string | null;
}

interface EnrichmentProvenanceLike {
  accessState?: string | null;
  checksum?: string | null;
  url?: string | null;
  resolvedUrl?: string | null;
  artifactCreated?: boolean | null;
  legalAccess?: boolean | null;
  resolverRequests?: ResolverRequestLike[] | null;
  qualifyingFullText?: boolean | null;
  acquisitionOutcome?: string | null;
  artifact?: {
    checksum?: string | null;
    resolvedUrl?: string | null;
    qualificationResult?: string | null;
    qualificationReason?: string | null;
    identityMatch?: string | null;
  } | null;
}

export interface CanonicalAdmissionSourceLike {
  id?: string | null;
  sourceId?: string | null;
  doi?: string | null;
  canonicalSourceIdentity?: string | null;
  accessLevel?: string | null;
  contentLevel?: string | null;
  extractionStatus?: string | null;
  extractionMethod?: string | null;
  fullTextCharCount?: number | null;
  fullTextUrl?: string | null;
  readableUrl?: string | null;
  contentHash?: string | null;
  abstract?: string | null;
  abstractOriginal?: string | null;
  originalAbstract?: string | null;
  extractedAbstract?: string | null;
  enrichmentProvenance?: EnrichmentProvenanceLike[] | null;
}

export interface CanonicalAdmissionDecisionContext {
  jobId: string;
  workflowId: string;
  jobRevision: number;
  checkpointRevision: number;
  acquisitionTerminal: boolean;
  decidedAt: string;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceIdFor(
  source: CanonicalAdmissionSourceLike,
  envelope?: StudyFactEnvelopeV2,
): string {
  return clean(source.sourceId) || clean(source.id) || clean(envelope?.sourceId) ||
    clean(envelope?.studyId) || "unknown-source";
}

function studyIdFor(
  source: CanonicalAdmissionSourceLike,
  envelope?: StudyFactEnvelopeV2,
): string {
  return clean(envelope?.studyId) || clean(source.doi) || sourceIdFor(source, envelope);
}

function resolverStates(source: CanonicalAdmissionSourceLike): string[] {
  return unique(
    (source.enrichmentProvenance ?? [])
      .map((entry) => clean(entry.accessState))
      .filter(Boolean),
  );
}

function resolverResults(source: CanonicalAdmissionSourceLike): string[] {
  return unique(
    (source.enrichmentProvenance ?? []).flatMap((entry) =>
      (entry.resolverRequests ?? [])
        .map((request) => clean(request.result))
        .filter(Boolean)
    ),
  );
}

function qualifyingArtifactRefs(source: CanonicalAdmissionSourceLike): string[] {
  const explicitQualification = (source.enrichmentProvenance ?? [])
    .some((entry) => typeof entry.qualifyingFullText === "boolean" || Boolean(entry.artifact));
  const references = (source.enrichmentProvenance ?? []).flatMap((entry) => {
    if (
      !QUALIFYING_FULL_TEXT_STATES.has(
        clean(entry.accessState) as CanonicalStudyAccessState,
      ) ||
      entry.legalAccess === false ||
      entry.artifactCreated === false ||
      entry.qualifyingFullText === false ||
      clean(entry.artifact?.qualificationResult) === "REJECTED" ||
      (Boolean(entry.artifact) && clean(entry.artifact?.identityMatch) !== "MATCH")
    ) {
      return [];
    }
    return [
      entry.artifact?.checksum,
      entry.artifact?.resolvedUrl,
      entry.checksum,
      entry.resolvedUrl,
      entry.url,
    ]
      .map(clean)
      .filter(Boolean);
  });
  return unique([
    ...references,
    ...(!explicitQualification
      ? [clean(source.contentHash), clean(source.fullTextUrl), clean(source.readableUrl)]
      : []),
  ].filter(Boolean));
}

function abstractAvailable(
  source: CanonicalAdmissionSourceLike,
  envelope?: StudyFactEnvelopeV2,
): boolean {
  return envelope?.documentInterpretability === "ABSTRACT_ONLY" ||
    /abstract/iu.test(`${clean(source.accessLevel)} ${clean(source.contentLevel)}`) ||
    [
      source.abstract,
      source.abstractOriginal,
      source.originalAbstract,
      source.extractedAbstract,
    ].some((value) => clean(value).length > 0);
}

function canonicalAccessState(input: {
  source: CanonicalAdmissionSourceLike;
  envelope?: StudyFactEnvelopeV2;
  acquisitionTerminal: boolean;
}): CanonicalStudyAccessState {
  if (!input.acquisitionTerminal) return "UNKNOWN";
  const states = resolverStates(input.source);
  const results = resolverResults(input.source);
  const fullTextState = [...states].reverse().find((state) =>
    QUALIFYING_FULL_TEXT_STATES.has(state as CanonicalStudyAccessState)
  ) as CanonicalStudyAccessState | undefined;
  const parserUsable = Boolean(
    input.envelope &&
      ["INTERPRETABLE", "PARTIAL"].includes(
        input.envelope.documentInterpretability,
      ),
  );
  const artifactRefs = qualifyingArtifactRefs(input.source);
  const charCount = Number(input.source.fullTextCharCount) || 0;
  const explicitQualification = (input.source.enrichmentProvenance ?? [])
    .some((entry) => typeof entry.qualifyingFullText === "boolean" || Boolean(entry.artifact));
  if (
    fullTextState &&
    parserUsable &&
    (artifactRefs.length > 0 || (!explicitQualification && charCount >= 1_200))
  ) {
    return fullTextState;
  }
  if (abstractAvailable(input.source, input.envelope)) return "ABSTRACT_ONLY";
  if (states.includes("PAYWALLED")) return "PAYWALLED";
  if (states.some((state) => ["ACCESS_DENIED", "LICENSE_RESTRICTED"].includes(state))) {
    return "ACCESS_DENIED";
  }
  if (results.includes("RATE_LIMITED")) return "RATE_LIMITED";
  if (results.includes("SERVER_ERROR")) return "SERVER_ERROR";
  if (states.some((state) => ["RESOLVER_ERROR", "UNRESOLVED"].includes(state))) {
    return "RESOLVER_ERROR";
  }
  if (
    states.some((state) => [
      "METADATA_ONLY",
      "PUBLISHER_SHELL",
      "NOT_FOUND",
      "BROKEN_DOCUMENT",
      "BROKEN_LINK",
      "UNSUPPORTED_FORMAT",
    ].includes(state))
  ) {
    return "NO_USABLE_ARTIFACT";
  }
  if (fullTextState) return "NO_USABLE_ARTIFACT";
  return "UNKNOWN";
}

function parserState(
  envelope?: StudyFactEnvelopeV2,
): CanonicalStudyAdmissionResult["parserState"] {
  if (!envelope) return "INCOMPLETE";
  if (envelope.documentInterpretability === "INTERPRETABLE") return "COMPLETE";
  if (["PARTIAL", "ABSTRACT_ONLY"].includes(envelope.documentInterpretability)) {
    return "PARTIAL";
  }
  if (envelope.documentInterpretability === "TRUNCATED") return "INCOMPLETE";
  return "FAILED";
}

function missingAdmission(): StudyAdmissionV2 {
  return {
    level: "BLOCKED",
    eligible: false,
    requirements: [],
    reasons: ["study_fact_envelope_missing"],
    provenanceComplete: false,
    numericalProvenanceComplete: false,
    criticalContradiction: false,
  };
}

function evidenceRevision(input: {
  source: CanonicalAdmissionSourceLike;
  envelope?: StudyFactEnvelopeV2;
  admission: StudyAdmissionV2;
  accessState: CanonicalStudyAccessState;
}): string {
  return sha256(JSON.stringify({
    sourceId: sourceIdFor(input.source, input.envelope),
    studyId: studyIdFor(input.source, input.envelope),
    canonicalSourceIdentity: clean(input.source.canonicalSourceIdentity) || null,
    accessLevel: clean(input.source.accessLevel) || null,
    contentLevel: clean(input.source.contentLevel) || null,
    extractionStatus: clean(input.source.extractionStatus) || null,
    fullTextCharCount: Number(input.source.fullTextCharCount) || 0,
    contentHash: clean(input.source.contentHash) || null,
    resolverStates: resolverStates(input.source),
    resolverResults: resolverResults(input.source),
    accessState: input.accessState,
    studyFact: input.envelope
      ? {
          extractionVersion: input.envelope.extractionVersion,
          studyType: input.envelope.studyType,
          documentInterpretability: input.envelope.documentInterpretability,
          qualityFlags: [...input.envelope.qualityFlags].sort(),
          primaryFindingStatuses: input.envelope.primaryFindings.map((field) => ({
            status: field.status,
            evidence: field.evidence.map((item) => sha256(item.exactEvidence)),
          })),
          requirements: input.admission.requirements.map((item) => ({
            field: item.field,
            status: item.status,
            satisfied: item.satisfied,
          })),
        }
      : null,
  }));
}

export function deriveCanonicalStudyAdmission(input: {
  source: CanonicalAdmissionSourceLike;
  envelope?: StudyFactEnvelopeV2;
  context: CanonicalAdmissionDecisionContext;
}): CanonicalStudyAdmissionResult {
  const admission = input.envelope
    ? admitStudyFactEnvelopeV2(input.envelope)
    : missingAdmission();
  const accessState = canonicalAccessState({
    source: input.source,
    envelope: input.envelope,
    acquisitionTerminal: input.context.acquisitionTerminal,
  });
  const parser = parserState(input.envelope);
  const fullTextQualified = QUALIFYING_FULL_TEXT_STATES.has(accessState);
  const provenanceState: CanonicalStudyAdmissionResult["provenanceState"] =
    !input.envelope || input.envelope.provenance.length === 0
      ? "MISSING"
      : admission.provenanceComplete && admission.numericalProvenanceComplete
        ? "READY"
        : "INCOMPLETE";
  const studyFactState: CanonicalStudyAdmissionResult["studyFactState"] =
    !input.envelope
      ? "MISSING"
      : parser === "FAILED"
        ? "FAILED"
        : admission.eligible
          ? "READY"
          : "PARTIAL";
  const formal = Boolean(
    input.context.acquisitionTerminal &&
      fullTextQualified &&
      ["COMPLETE", "PARTIAL"].includes(parser) &&
      studyFactState === "READY" &&
      provenanceState === "READY" &&
      admission.level === "FORMAL",
  );
  const limited = Boolean(
    input.context.acquisitionTerminal &&
      accessState !== "UNKNOWN" &&
      !["NO_USABLE_ARTIFACT", "RATE_LIMITED", "SERVER_ERROR", "RESOLVER_ERROR"].includes(accessState) &&
      studyFactState === "READY" &&
      provenanceState === "READY" &&
      admission.eligible,
  );
  const admissionClass: CanonicalStudyAdmissionResult["admissionClass"] = formal
    ? "FORMAL"
    : limited
      ? "LIMITED"
      : "BLOCKED";
  const reasonCodes: CanonicalStudyAdmissionReasonCode[] = [];
  if (fullTextQualified) reasonCodes.push("QUALIFYING_FULL_TEXT_PRESENT");
  if (accessState === "ABSTRACT_ONLY") reasonCodes.push("ABSTRACT_ONLY");
  if (accessState === "UNKNOWN") reasonCodes.push("ACCESS_UNKNOWN");
  if (!input.context.acquisitionTerminal) reasonCodes.push("ACQUISITION_INCOMPLETE");
  if (!fullTextQualified && admission.level === "FORMAL") {
    reasonCodes.push("FULL_TEXT_UNRESOLVED");
  }
  const upstreamResolverStates = resolverStates(input.source);
  if (upstreamResolverStates.includes("ACCESS_DENIED")) {
    reasonCodes.push("FULL_TEXT_ACCESS_DENIED");
  }
  if (upstreamResolverStates.includes("PAYWALLED")) {
    reasonCodes.push("FULL_TEXT_PAYWALLED");
  }
  if (accessState === "NO_USABLE_ARTIFACT") reasonCodes.push("NO_USABLE_ARTIFACT");
  if (accessState === "RATE_LIMITED") reasonCodes.push("RATE_LIMITED");
  if (accessState === "SERVER_ERROR") reasonCodes.push("SERVER_ERROR");
  if (accessState === "RESOLVER_ERROR") reasonCodes.push("RESOLVER_ERROR");
  if (parser === "INCOMPLETE") reasonCodes.push("PARSER_INCOMPLETE");
  if (parser === "FAILED") reasonCodes.push("PARSER_FAILED");
  if (studyFactState === "READY") reasonCodes.push("STUDY_FACTS_READY");
  else reasonCodes.push("INSUFFICIENT_STUDY_FACTS");
  if (!admission.provenanceComplete) reasonCodes.push("MISSING_PROVENANCE");
  if (!admission.numericalProvenanceComplete) {
    reasonCodes.push("MISSING_NUMERICAL_PROVENANCE");
  }
  if (admission.criticalContradiction) reasonCodes.push("CRITICAL_CONTRADICTION");
  if (admission.requirements.some((item) => !item.satisfied)) {
    reasonCodes.push("FORMAL_REQUIREMENT_MISSING");
  }
  if (input.envelope?.studyType === "UNCLASSIFIABLE") {
    reasonCodes.push("STUDY_TYPE_UNCLASSIFIABLE");
  }
  if (admissionClass === "FORMAL") reasonCodes.push("FORMAL_ADMITTED");
  if (admissionClass === "LIMITED") reasonCodes.push("LIMITED_ADMITTED");
  const revision = evidenceRevision({
    source: input.source,
    envelope: input.envelope,
    admission,
    accessState,
  });
  const sourceId = sourceIdFor(input.source, input.envelope);
  const studyId = studyIdFor(input.source, input.envelope);
  return {
    schemaVersion: CANONICAL_STUDY_ADMISSION_SCHEMA_VERSION,
    admissionVersion: CANONICAL_STUDY_ADMISSION_VERSION,
    decisionId: `admission:${sha256(`${input.context.jobId}|${studyId}|${revision}`).slice(0, 24)}`,
    jobId: input.context.jobId,
    workflowId: input.context.workflowId,
    studyId,
    sourceId,
    jobRevision: input.context.jobRevision,
    checkpointRevision: input.context.checkpointRevision,
    evidenceRevision: revision,
    accessState,
    acquisitionTerminal: input.context.acquisitionTerminal,
    qualifyingArtifactRefs: qualifyingArtifactRefs(input.source),
    parserState: parser,
    studyFactState,
    provenanceState,
    admissionClass,
    reasonCodes: unique(reasonCodes),
    missingRequirements: unique([
      ...admission.requirements
        .filter((item) => !item.satisfied)
        .map((item) => `${item.field}:${item.status}`),
      ...admission.reasons,
    ]),
    upstreamReferences: {
      sourceId,
      canonicalSourceIdentity: clean(input.source.canonicalSourceIdentity) || null,
      studyFactExtractionVersion: clean(input.envelope?.extractionVersion) || null,
      resolverStates: upstreamResolverStates,
      parserVersion: clean(input.envelope?.extractionVersion) || null,
    },
    decidedAt: input.context.decidedAt,
  };
}

function envelopeRank(envelope: StudyFactEnvelopeV2): number {
  const interpretability = {
    INTERPRETABLE: 6,
    PARTIAL: 5,
    ABSTRACT_ONLY: 4,
    TRUNCATED: 3,
    CORRUPTED: 2,
    UNAVAILABLE: 1,
  }[envelope.documentInterpretability];
  return interpretability * 1_000 + envelope.provenance.length * 10 +
    envelope.primaryFindings.length;
}

export function studyFactEnvelopesForJob(job: GroundingJob): StudyFactEnvelopeV2[] {
  const byStudy = new Map<string, StudyFactEnvelopeV2>();
  for (const claim of job.claimCandidates ?? []) {
    const fact = claim.structuredStudyFact as
      | { studyFactV2?: StudyFactEnvelopeV2 }
      | undefined;
    const envelope = fact?.studyFactV2;
    if (!envelope) continue;
    const key = envelope.studyId || envelope.sourceId;
    const existing = byStudy.get(key);
    if (!existing || envelopeRank(envelope) > envelopeRank(existing)) {
      byStudy.set(key, envelope);
    }
  }
  return [...byStudy.values()];
}

export function deriveCanonicalStudyAdmissionsForJob(input: {
  job: GroundingJob;
  terminal: boolean;
  jobRevision?: number;
  checkpointRevision?: number;
  decidedAt?: string;
}): CanonicalStudyAdmissionResult[] {
  const envelopes = studyFactEnvelopesForJob(input.job);
  const envelopeBySource = new Map(
    envelopes.map((envelope) => [envelope.sourceId, envelope]),
  );
  const sources = [
    ...(input.job.acceptedSources ?? []),
    ...(input.job.sourceCandidates ?? []),
  ];
  const sourceById = new Map<string, CanonicalAdmissionSourceLike>();
  for (const source of sources) {
    const key = sourceIdFor(source);
    if (!sourceById.has(key)) sourceById.set(key, source);
  }
  const context: CanonicalAdmissionDecisionContext = {
    jobId: input.job.jobId,
    workflowId: input.job.workflowId,
    jobRevision: input.jobRevision ?? input.job.revision,
    checkpointRevision: input.checkpointRevision ?? input.job.revision,
    acquisitionTerminal: input.terminal,
    decidedAt: input.decidedAt ?? input.job.updatedAt,
  };
  const admittedSourceIds = new Set(
    (input.job.acceptedSources ?? []).map((source) => source.sourceId),
  );
  for (const envelope of envelopes) admittedSourceIds.add(envelope.sourceId);
  return [...admittedSourceIds]
    .map((sourceId) => deriveCanonicalStudyAdmission({
      source: sourceById.get(sourceId) ?? {
        sourceId,
        doi: envelopeBySource.get(sourceId)?.canonicalId,
      },
      envelope: envelopeBySource.get(sourceId),
      context,
    }))
    .sort((left, right) =>
      left.studyId.localeCompare(right.studyId) ||
      left.sourceId.localeCompare(right.sourceId)
    );
}

export function canonicalContentAccessState(
  admission: CanonicalStudyAdmissionResult,
): "metadata_only" | "abstract_only" | "partial_full_text" | "full_text" {
  if (admission.accessState === "ABSTRACT_ONLY") return "abstract_only";
  if (QUALIFYING_FULL_TEXT_STATES.has(admission.accessState)) {
    return admission.parserState === "PARTIAL" ? "partial_full_text" : "full_text";
  }
  return "metadata_only";
}

export interface CanonicalAdmissionSetValidation {
  pass: boolean;
  issues: string[];
}

export function validateCanonicalAdmissionSet(input: {
  admissions: CanonicalStudyAdmissionResult[];
  jobId?: string | null;
  workflowId?: string | null;
  jobRevision?: number | null;
  checkpointRevision?: number | null;
  requiredSourceIds: string[];
}): CanonicalAdmissionSetValidation {
  const issues: string[] = [];
  const bySource = new Map<string, CanonicalStudyAdmissionResult>();
  for (const admission of input.admissions) {
    if (admission.admissionVersion !== CANONICAL_STUDY_ADMISSION_VERSION) {
      issues.push(`CONFLICTING_ADMISSION_VERSION:${admission.sourceId}`);
    }
    if (input.jobId && admission.jobId !== input.jobId) {
      issues.push(`STALE_REVISION:job:${admission.sourceId}`);
    }
    if (input.workflowId && admission.workflowId !== input.workflowId) {
      issues.push(`STALE_REVISION:workflow:${admission.sourceId}`);
    }
    if (
      input.jobRevision != null &&
      admission.jobRevision !== input.jobRevision
    ) {
      issues.push(`STALE_REVISION:job_revision:${admission.sourceId}`);
    }
    if (
      input.checkpointRevision != null &&
      admission.checkpointRevision !== input.checkpointRevision
    ) {
      issues.push(`STALE_REVISION:checkpoint_revision:${admission.sourceId}`);
    }
    if (bySource.has(admission.sourceId)) {
      issues.push(`DUPLICATE_CANONICAL_ADMISSION:${admission.sourceId}`);
    }
    bySource.set(admission.sourceId, admission);
  }
  for (const sourceId of unique(input.requiredSourceIds)) {
    if (!bySource.has(sourceId)) {
      issues.push(`MISSING_CANONICAL_ADMISSION:${sourceId}`);
    }
  }
  return { pass: issues.length === 0, issues: unique(issues) };
}

export function failClosedCanonicalAdmission(input: {
  source: CanonicalAdmissionSourceLike;
  context: CanonicalAdmissionDecisionContext;
  reason: "STALE_REVISION" | "MISSING_CANONICAL_ADMISSION" | "CONFLICTING_ADMISSION_VERSION";
}): CanonicalStudyAdmissionResult {
  const base = deriveCanonicalStudyAdmission({
    source: input.source,
    context: { ...input.context, acquisitionTerminal: false },
  });
  return {
    ...base,
    acquisitionTerminal: input.context.acquisitionTerminal,
    admissionClass: "BLOCKED",
    reasonCodes: unique([...base.reasonCodes, input.reason]),
    missingRequirements: unique([...base.missingRequirements, input.reason]),
  };
}
