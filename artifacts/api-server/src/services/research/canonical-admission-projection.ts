import { createHash } from "node:crypto";

import type {
  CanonicalStudyAdmissionResult,
  GroundingJob,
} from "@workspace/api-zod/research-grounding";
import {
  CANONICAL_STUDY_ADMISSION_SCHEMA_VERSION,
  CANONICAL_STUDY_ADMISSION_VERSION,
} from "./canonical-study-admission";

export const CANONICAL_ADMISSION_PROJECTION_SCHEMA_VERSION =
  "researchforge-canonical-admission-projection/v1" as const;
export const CANONICAL_ADMISSION_PROJECTION_VERSION =
  "canonical-admission-projection.v1" as const;

export type CanonicalProjectionReasonCode =
  | "CANONICAL_ADMISSION_BLOCKED"
  | "CANONICAL_STATUS_UNKNOWN"
  | "MISSING_CANONICAL_ADMISSION"
  | "CONFLICTING_ADMISSION_VERSION"
  | "STALE_DECISION_REVISION"
  | "DUPLICATE_ACTIVE_CANONICAL_DECISION"
  | "CANONICAL_IDENTITY_MISMATCH"
  | "STALE_ARTIFACT_REVISION"
  | "OWNER_VERSION_UNVERIFIABLE"
  | "UNKNOWN_POLICY"
  | "ROBOTS_OR_TOS_BLOCKED"
  | "SOURCE_POLICY_BLOCKED"
  | "QUALIFYING_PROVENANCE_MISSING"
  | "ARTIFACT_NOT_QUALIFIED"
  | "ARTIFACT_IDENTITY_NOT_MATCHED"
  | "ARTIFACT_NOT_MATERIALIZED"
  | "DUPLICATE_ARTIFACT_IDENTITY"
  | CanonicalStudyAdmissionResult["reasonCodes"][number];

export interface CanonicalArtifactBindingInput {
  artifactId: string;
  sourceId: string;
  canonicalStudyId?: string | null;
  artifactRevision?: string | null;
  qualificationStatus?: string | null;
  identityDecision?: string | null;
  materializationStatus?: string | null;
  accessPolicyDecision?: string | null;
  provenanceComplete?: boolean | null;
}

export function canonicalArtifactBindingsForJob(
  job: Pick<GroundingJob, "acceptedSources" | "sourceCandidates">,
): CanonicalArtifactBindingInput[] {
  const sources = [...(job.acceptedSources ?? []), ...(job.sourceCandidates ?? [])];
  const rows: CanonicalArtifactBindingInput[] = [];
  for (const source of sources) {
    for (const provenance of source.enrichmentProvenance ?? []) {
      const manifestations = (provenance as unknown as {
        manifestations?: Array<Record<string, unknown>>;
      }).manifestations ?? [];
      for (const manifestation of manifestations) {
        const artifactId = clean(manifestation.manifestationId);
        if (!artifactId || clean(manifestation.qualificationStatus) !== "QUALIFIED") continue;
        const artifactRevision =
          clean(manifestation.checksumSha256) ||
          clean((manifestation.provenance as Record<string, unknown> | undefined)?.artifactFingerprint) ||
          clean((manifestation.provenance as Record<string, unknown> | undefined)?.routeFingerprint) ||
          null;
        rows.push({
          artifactId,
          sourceId: source.sourceId,
          canonicalStudyId: clean(manifestation.canonicalStudyId) || null,
          artifactRevision,
          qualificationStatus: clean(manifestation.qualificationStatus) || null,
          identityDecision: clean(manifestation.identityDecision) || null,
          materializationStatus: clean(manifestation.materializationStatus) || null,
          accessPolicyDecision: clean(manifestation.accessPolicyDecision) || null,
          provenanceComplete: Boolean(
            artifactRevision &&
              ((manifestation.provenance as Record<string, unknown> | undefined)?.artifactSnapshotPath ||
                manifestation.artifactUrl || manifestation.sourceUrl),
          ),
        });
      }
    }
  }
  const byArtifact = new Map<string, CanonicalArtifactBindingInput>();
  for (const row of rows) {
    if (!byArtifact.has(row.artifactId)) byArtifact.set(row.artifactId, row);
  }
  return [...byArtifact.values()];
}

export interface CanonicalProjectionOwnerContext {
  jobId: string;
  workflowId: string;
  jobRevision: number;
  checkpointRevision: number;
}

export interface CanonicalDecisionProjectionRow {
  decisionId: string;
  studyId: string;
  sourceId: string;
  jobRevision: number;
  checkpointRevision: number;
  evidenceRevision: string;
  admissionClass: CanonicalStudyAdmissionResult["admissionClass"];
  canonicalStatus: "ADMITTED" | "BLOCKED";
  admitted: boolean;
  accessState: CanonicalStudyAdmissionResult["accessState"];
  qualifyingArtifactRefs: string[];
  admissionVersion: string;
  reasonCodes: CanonicalProjectionReasonCode[];
  sourceReasonCodes: CanonicalStudyAdmissionResult["reasonCodes"];
}

export interface CanonicalArtifactProjectionRow {
  artifactId: string;
  sourceId: string;
  canonicalStudyId: string | null;
  artifactRevision: string | null;
  decisionId: string | null;
  evidenceRevision: string | null;
  admissionClass: CanonicalStudyAdmissionResult["admissionClass"] | null;
  canonicalStatus: "ADMITTED" | "BLOCKED" | "MISSING";
  admitted: boolean;
  qualificationStatus: string | null;
  identityDecision: string | null;
  materializationStatus: string | null;
  accessPolicyDecision: string | null;
  reasonCodes: CanonicalProjectionReasonCode[];
}

export interface CanonicalProjectionSummary {
  canonicalDecisionCount: number;
  canonicalAdmittedDecisionCount: number;
  canonicalBlockedDecisionCount: number;
  directStudyCount: number;
  qualifyingFullTextDecisionCount: number;
  qualifyingArtifactCount: number;
  duplicateCanonicalDecisionCount: number;
  duplicateArtifactCount: number;
  missingCanonicalRecordCount: number;
  staleDecisionRevisionCount: number;
  staleArtifactRevisionCount: number;
  canonicalIdentityMismatchCount: number;
  blockerCounts: Record<string, number>;
}

export interface CanonicalAdmissionProjection {
  schemaVersion: typeof CANONICAL_ADMISSION_PROJECTION_SCHEMA_VERSION;
  projectionVersion: typeof CANONICAL_ADMISSION_PROJECTION_VERSION;
  projectionId: string;
  projectedAt: string;
  projectedFrom: {
    owner: "canonical-study-admission";
    schemaVersion: typeof CANONICAL_STUDY_ADMISSION_SCHEMA_VERSION;
    admissionVersion: typeof CANONICAL_STUDY_ADMISSION_VERSION;
  };
  ownerContext: CanonicalProjectionOwnerContext;
  decisions: CanonicalDecisionProjectionRow[];
  artifacts: CanonicalArtifactProjectionRow[];
  summary: CanonicalProjectionSummary;
  validation: { pass: boolean; issues: string[] };
}

export interface DownstreamCanonicalView {
  consumer: string;
  projectionId: string;
  projectionVersion: string;
  projectedFromOwnerVersion: string;
  ownerContext: CanonicalProjectionOwnerContext;
  admittedDecisionIds: string[];
  admittedArtifactIds: string[];
  decisions: Array<{
    decisionId: string;
    studyId: string;
    sourceId: string;
    evidenceRevision: string;
    admissionClass: CanonicalStudyAdmissionResult["admissionClass"];
    admitted: boolean;
    reasonCodes: CanonicalProjectionReasonCode[];
  }>;
  artifacts: Array<{
    artifactId: string;
    sourceId: string;
    canonicalStudyId: string | null;
    artifactRevision: string | null;
    decisionId: string | null;
    evidenceRevision: string | null;
    admitted: boolean;
    reasonCodes: CanonicalProjectionReasonCode[];
  }>;
  summary: CanonicalProjectionSummary;
}

export interface CanonicalBindingMismatch {
  consumer: string;
  code:
    | "CANONICAL_PROJECTION_INVALID"
    | "PROJECTION_ID_MISMATCH"
    | "OWNER_VERSION_MISMATCH"
    | "OWNER_CONTEXT_MISMATCH"
    | "ADMITTED_DECISION_SET_MISMATCH"
    | "ADMITTED_ARTIFACT_SET_MISMATCH"
    | "DECISION_BINDING_MISMATCH"
    | "ARTIFACT_BINDING_MISMATCH"
    | "BLOCKER_REASON_MISMATCH"
    | "SUMMARY_COUNT_MISMATCH";
  detail: string;
}

export interface PreClosureCanonicalBindingAudit {
  schemaVersion: "researchforge-pre-closure-canonical-binding-audit/v5";
  auditedAt: string;
  projectionId: string;
  pass: boolean;
  closureAllowed: boolean;
  mismatchCount: number;
  mismatches: CanonicalBindingMismatch[];
  consumers: string[];
  summary: CanonicalProjectionSummary;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function recordCount(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function canonicalIdentity(decision: CanonicalStudyAdmissionResult): string {
  return `${decision.studyId}|${decision.sourceId}`;
}

function policyReasons(value: string): CanonicalProjectionReasonCode[] {
  if (value === "UNKNOWN_POLICY") return ["UNKNOWN_POLICY"];
  if (value === "ROBOTS_OR_TOS_BLOCKED") return ["ROBOTS_OR_TOS_BLOCKED"];
  if (value && !value.startsWith("ALLOWED_")) return ["SOURCE_POLICY_BLOCKED"];
  return [];
}

function primaryBlocker(row: CanonicalArtifactProjectionRow): string | null {
  const priorities: CanonicalProjectionReasonCode[] = [
    "UNKNOWN_POLICY",
    "ROBOTS_OR_TOS_BLOCKED",
    "MISSING_CANONICAL_ADMISSION",
    "DUPLICATE_ACTIVE_CANONICAL_DECISION",
    "STALE_DECISION_REVISION",
    "CANONICAL_IDENTITY_MISMATCH",
    "STALE_ARTIFACT_REVISION",
    "CANONICAL_ADMISSION_BLOCKED",
    "SOURCE_POLICY_BLOCKED",
    "QUALIFYING_PROVENANCE_MISSING",
    "ARTIFACT_IDENTITY_NOT_MATCHED",
    "ARTIFACT_NOT_MATERIALIZED",
    "ARTIFACT_NOT_QUALIFIED",
    "DUPLICATE_ARTIFACT_IDENTITY",
  ];
  return priorities.find((reason) => row.reasonCodes.includes(reason)) ??
    row.reasonCodes[0] ?? null;
}

export function buildCanonicalAdmissionProjection(input: {
  decisions: CanonicalStudyAdmissionResult[];
  artifacts?: CanonicalArtifactBindingInput[];
  ownerContext: CanonicalProjectionOwnerContext;
  projectedAt?: string;
}): CanonicalAdmissionProjection {
  const artifacts = input.artifacts ?? [];
  const validationIssues: string[] = [];
  const duplicateIdentities = new Set<string>();
  const identityCounts = recordCount(input.decisions.map(canonicalIdentity));
  for (const [identity, count] of Object.entries(identityCounts)) {
    if (count > 1) duplicateIdentities.add(identity);
  }

  const decisions = input.decisions.map<CanonicalDecisionProjectionRow>((decision) => {
    const reasons: CanonicalProjectionReasonCode[] = [...decision.reasonCodes];
    const versionValid =
      decision.schemaVersion === CANONICAL_STUDY_ADMISSION_SCHEMA_VERSION &&
      decision.admissionVersion === CANONICAL_STUDY_ADMISSION_VERSION;
    const contextValid =
      decision.jobId === input.ownerContext.jobId &&
      decision.workflowId === input.ownerContext.workflowId &&
      decision.jobRevision === input.ownerContext.jobRevision &&
      decision.checkpointRevision === input.ownerContext.checkpointRevision;
    const duplicate = duplicateIdentities.has(canonicalIdentity(decision));
    if (!versionValid) {
      reasons.push("CONFLICTING_ADMISSION_VERSION", "OWNER_VERSION_UNVERIFIABLE");
      validationIssues.push(`OWNER_VERSION_UNVERIFIABLE:${decision.decisionId}`);
    }
    if (!contextValid) {
      reasons.push("STALE_DECISION_REVISION");
      validationIssues.push(`STALE_DECISION_REVISION:${decision.decisionId}`);
    }
    if (duplicate) {
      reasons.push("DUPLICATE_ACTIVE_CANONICAL_DECISION");
      validationIssues.push(`DUPLICATE_ACTIVE_CANONICAL_DECISION:${canonicalIdentity(decision)}`);
    }
    if (decision.admissionClass === "BLOCKED") {
      reasons.push("CANONICAL_ADMISSION_BLOCKED");
    }
    if (decision.accessState === "UNKNOWN") reasons.push("CANONICAL_STATUS_UNKNOWN");
    const admitted =
      versionValid && contextValid && !duplicate &&
      decision.admissionClass !== "BLOCKED" && decision.accessState !== "UNKNOWN";
    return {
      decisionId: decision.decisionId,
      studyId: decision.studyId,
      sourceId: decision.sourceId,
      jobRevision: decision.jobRevision,
      checkpointRevision: decision.checkpointRevision,
      evidenceRevision: decision.evidenceRevision,
      admissionClass: decision.admissionClass,
      canonicalStatus: admitted ? "ADMITTED" : "BLOCKED",
      admitted,
      accessState: decision.accessState,
      qualifyingArtifactRefs: [...decision.qualifyingArtifactRefs],
      admissionVersion: decision.admissionVersion,
      reasonCodes: unique(reasons),
      sourceReasonCodes: [...decision.reasonCodes],
    };
  });

  const decisionsBySource = new Map<string, CanonicalDecisionProjectionRow>();
  for (const row of decisions) {
    if (!decisionsBySource.has(row.sourceId)) decisionsBySource.set(row.sourceId, row);
  }
  const artifactFingerprints = new Set<string>();
  let duplicateArtifactCount = 0;
  const artifactRows = artifacts.map<CanonicalArtifactProjectionRow>((artifact) => {
    const decision = decisionsBySource.get(artifact.sourceId);
    const reasons: CanonicalProjectionReasonCode[] = [];
    const artifactRevision = clean(artifact.artifactRevision) || null;
    const canonicalStudyId = clean(artifact.canonicalStudyId) || null;
    if (!decision) {
      reasons.push("MISSING_CANONICAL_ADMISSION");
      validationIssues.push(`MISSING_CANONICAL_ADMISSION:${artifact.sourceId}`);
    } else {
      reasons.push(...decision.sourceReasonCodes);
      if (!decision.admitted) {
        reasons.push(...decision.reasonCodes.filter((reason) =>
          [
            "CANONICAL_ADMISSION_BLOCKED",
            "CANONICAL_STATUS_UNKNOWN",
            "CONFLICTING_ADMISSION_VERSION",
            "OWNER_VERSION_UNVERIFIABLE",
            "STALE_DECISION_REVISION",
            "DUPLICATE_ACTIVE_CANONICAL_DECISION",
          ].includes(reason),
        ));
      }
      if (canonicalStudyId && canonicalStudyId !== decision.studyId) {
        reasons.push("CANONICAL_IDENTITY_MISMATCH");
        validationIssues.push(`CANONICAL_IDENTITY_MISMATCH:${artifact.artifactId}`);
      }
      if (!artifactRevision || !decision.qualifyingArtifactRefs.includes(artifactRevision)) {
        reasons.push(artifactRevision ? "STALE_ARTIFACT_REVISION" : "QUALIFYING_PROVENANCE_MISSING");
        validationIssues.push(`${artifactRevision ? "STALE_ARTIFACT_REVISION" : "QUALIFYING_PROVENANCE_MISSING"}:${artifact.artifactId}`);
      }
    }
    reasons.push(...policyReasons(clean(artifact.accessPolicyDecision)));
    if (artifact.provenanceComplete !== true) reasons.push("QUALIFYING_PROVENANCE_MISSING");
    if (artifact.identityDecision !== "MATCH") reasons.push("ARTIFACT_IDENTITY_NOT_MATCHED");
    if (artifact.materializationStatus !== "MATERIALIZED") reasons.push("ARTIFACT_NOT_MATERIALIZED");
    if (artifact.qualificationStatus !== "QUALIFIED") reasons.push("ARTIFACT_NOT_QUALIFIED");
    const fingerprint = `${artifact.sourceId}|${canonicalStudyId ?? ""}|${artifactRevision ?? ""}`;
    if (artifactFingerprints.has(fingerprint)) {
      duplicateArtifactCount += 1;
      reasons.push("DUPLICATE_ARTIFACT_IDENTITY");
    } else {
      artifactFingerprints.add(fingerprint);
    }
    const uniqueReasons = unique(reasons);
    const blockingReasons = new Set<CanonicalProjectionReasonCode>([
      "CANONICAL_ADMISSION_BLOCKED",
      "CANONICAL_STATUS_UNKNOWN",
      "MISSING_CANONICAL_ADMISSION",
      "CONFLICTING_ADMISSION_VERSION",
      "STALE_DECISION_REVISION",
      "DUPLICATE_ACTIVE_CANONICAL_DECISION",
      "CANONICAL_IDENTITY_MISMATCH",
      "STALE_ARTIFACT_REVISION",
      "OWNER_VERSION_UNVERIFIABLE",
      "UNKNOWN_POLICY",
      "ROBOTS_OR_TOS_BLOCKED",
      "SOURCE_POLICY_BLOCKED",
      "QUALIFYING_PROVENANCE_MISSING",
      "ARTIFACT_NOT_QUALIFIED",
      "ARTIFACT_IDENTITY_NOT_MATCHED",
      "ARTIFACT_NOT_MATERIALIZED",
      "DUPLICATE_ARTIFACT_IDENTITY",
    ]);
    const admitted = Boolean(decision?.admitted) &&
      !uniqueReasons.some((reason) => blockingReasons.has(reason));
    return {
      artifactId: artifact.artifactId,
      sourceId: artifact.sourceId,
      canonicalStudyId,
      artifactRevision,
      decisionId: decision?.decisionId ?? null,
      evidenceRevision: decision?.evidenceRevision ?? null,
      admissionClass: decision?.admissionClass ?? null,
      canonicalStatus: decision ? (decision.admitted ? "ADMITTED" : "BLOCKED") : "MISSING",
      admitted,
      qualificationStatus: clean(artifact.qualificationStatus) || null,
      identityDecision: clean(artifact.identityDecision) || null,
      materializationStatus: clean(artifact.materializationStatus) || null,
      accessPolicyDecision: clean(artifact.accessPolicyDecision) || null,
      reasonCodes: uniqueReasons,
    };
  });

  const admittedDecisionIdsWithArtifacts = new Set(
    artifactRows.filter((row) => row.admitted).map((row) => row.decisionId).filter(Boolean),
  );
  const blockerCounts = recordCount(
    artifactRows.filter((row) => !row.admitted).map(primaryBlocker).filter((value): value is string => Boolean(value)),
  );
  const summary: CanonicalProjectionSummary = {
    canonicalDecisionCount: decisions.length,
    canonicalAdmittedDecisionCount: decisions.filter((row) => row.admitted).length,
    canonicalBlockedDecisionCount: decisions.filter((row) => !row.admitted).length,
    directStudyCount: decisions.filter((row) => row.admitted).length,
    qualifyingFullTextDecisionCount: admittedDecisionIdsWithArtifacts.size,
    qualifyingArtifactCount: artifactRows.filter((row) => row.admitted).length,
    duplicateCanonicalDecisionCount: duplicateIdentities.size,
    duplicateArtifactCount,
    missingCanonicalRecordCount: artifactRows.filter((row) => row.reasonCodes.includes("MISSING_CANONICAL_ADMISSION")).length,
    staleDecisionRevisionCount: decisions.filter((row) => row.reasonCodes.includes("STALE_DECISION_REVISION")).length,
    staleArtifactRevisionCount: artifactRows.filter((row) => row.reasonCodes.includes("STALE_ARTIFACT_REVISION")).length,
    canonicalIdentityMismatchCount: artifactRows.filter((row) => row.reasonCodes.includes("CANONICAL_IDENTITY_MISMATCH")).length,
    blockerCounts,
  };
  const projectedAt = input.projectedAt ?? new Date().toISOString();
  const projectionId = `canonical-projection:${stableHash({
    context: input.ownerContext,
    decisions: decisions.map((row) => [row.decisionId, row.evidenceRevision, row.admitted]),
    artifacts: artifactRows.map((row) => [row.artifactId, row.artifactRevision, row.decisionId, row.admitted]),
  }).slice(0, 24)}`;
  return deepFreeze({
    schemaVersion: CANONICAL_ADMISSION_PROJECTION_SCHEMA_VERSION,
    projectionVersion: CANONICAL_ADMISSION_PROJECTION_VERSION,
    projectionId,
    projectedAt,
    projectedFrom: {
      owner: "canonical-study-admission",
      schemaVersion: CANONICAL_STUDY_ADMISSION_SCHEMA_VERSION,
      admissionVersion: CANONICAL_STUDY_ADMISSION_VERSION,
    },
    ownerContext: { ...input.ownerContext },
    decisions,
    artifacts: artifactRows,
    summary,
    validation: {
      pass: unique(validationIssues).length === 0,
      issues: unique(validationIssues),
    },
  });
}

export function downstreamCanonicalView(
  projection: CanonicalAdmissionProjection,
  consumer: string,
): DownstreamCanonicalView {
  return deepFreeze({
    consumer,
    projectionId: projection.projectionId,
    projectionVersion: projection.projectionVersion,
    projectedFromOwnerVersion: projection.projectedFrom.admissionVersion,
    ownerContext: { ...projection.ownerContext },
    admittedDecisionIds: projection.decisions.filter((row) => row.admitted).map((row) => row.decisionId),
    admittedArtifactIds: projection.artifacts.filter((row) => row.admitted).map((row) => row.artifactId),
    decisions: projection.decisions.map((row) => ({
      decisionId: row.decisionId,
      studyId: row.studyId,
      sourceId: row.sourceId,
      evidenceRevision: row.evidenceRevision,
      admissionClass: row.admissionClass,
      admitted: row.admitted,
      reasonCodes: [...row.reasonCodes],
    })),
    artifacts: projection.artifacts.map((row) => ({
      artifactId: row.artifactId,
      sourceId: row.sourceId,
      canonicalStudyId: row.canonicalStudyId,
      artifactRevision: row.artifactRevision,
      decisionId: row.decisionId,
      evidenceRevision: row.evidenceRevision,
      admitted: row.admitted,
      reasonCodes: [...row.reasonCodes],
    })),
    summary: {
      ...projection.summary,
      blockerCounts: { ...projection.summary.blockerCounts },
    },
  });
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function auditPreClosureCanonicalBinding(input: {
  projection: CanonicalAdmissionProjection;
  downstream: DownstreamCanonicalView[];
  auditedAt?: string;
}): PreClosureCanonicalBindingAudit {
  const expected = downstreamCanonicalView(input.projection, "canonical_expected");
  const mismatches: CanonicalBindingMismatch[] = [];
  if (!input.projection.validation.pass) {
    mismatches.push({
      consumer: "canonical_projection",
      code: "CANONICAL_PROJECTION_INVALID",
      detail: input.projection.validation.issues.join(", "),
    });
  }
  for (const view of input.downstream) {
    if (view.projectionId !== expected.projectionId) {
      mismatches.push({ consumer: view.consumer, code: "PROJECTION_ID_MISMATCH", detail: `${view.projectionId} != ${expected.projectionId}` });
    }
    if (view.projectedFromOwnerVersion !== expected.projectedFromOwnerVersion) {
      mismatches.push({ consumer: view.consumer, code: "OWNER_VERSION_MISMATCH", detail: `${view.projectedFromOwnerVersion} != ${expected.projectedFromOwnerVersion}` });
    }
    if (!same(view.ownerContext, expected.ownerContext)) {
      mismatches.push({ consumer: view.consumer, code: "OWNER_CONTEXT_MISMATCH", detail: "job/workflow/revision binding differs from the canonical projection" });
    }
    if (!same(view.admittedDecisionIds, expected.admittedDecisionIds)) {
      mismatches.push({ consumer: view.consumer, code: "ADMITTED_DECISION_SET_MISMATCH", detail: "downstream admitted decision IDs differ from canonical" });
    }
    if (!same(view.admittedArtifactIds, expected.admittedArtifactIds)) {
      mismatches.push({ consumer: view.consumer, code: "ADMITTED_ARTIFACT_SET_MISMATCH", detail: "downstream admitted artifact IDs differ from canonical" });
    }
    if (!same(view.decisions.map(({ reasonCodes: _reasonCodes, ...row }) => row), expected.decisions.map(({ reasonCodes: _reasonCodes, ...row }) => row))) {
      mismatches.push({ consumer: view.consumer, code: "DECISION_BINDING_MISMATCH", detail: "decision identity, revision, or status differs from canonical" });
    }
    if (!same(view.artifacts.map(({ reasonCodes: _reasonCodes, ...row }) => row), expected.artifacts.map(({ reasonCodes: _reasonCodes, ...row }) => row))) {
      mismatches.push({ consumer: view.consumer, code: "ARTIFACT_BINDING_MISMATCH", detail: "artifact identity or revision binding differs from canonical" });
    }
    if (!same(view.decisions.map((row) => row.reasonCodes), expected.decisions.map((row) => row.reasonCodes)) ||
      !same(view.artifacts.map((row) => row.reasonCodes), expected.artifacts.map((row) => row.reasonCodes))) {
      mismatches.push({ consumer: view.consumer, code: "BLOCKER_REASON_MISMATCH", detail: "canonical blocker reasons were lost or rewritten" });
    }
    if (!same(view.summary, expected.summary)) {
      mismatches.push({ consumer: view.consumer, code: "SUMMARY_COUNT_MISMATCH", detail: "downstream summary differs from the audited canonical summary" });
    }
  }
  return {
    schemaVersion: "researchforge-pre-closure-canonical-binding-audit/v5",
    auditedAt: input.auditedAt ?? new Date().toISOString(),
    projectionId: input.projection.projectionId,
    pass: mismatches.length === 0,
    closureAllowed: mismatches.length === 0,
    mismatchCount: mismatches.length,
    mismatches,
    consumers: input.downstream.map((view) => view.consumer),
    summary: expected.summary,
  };
}
