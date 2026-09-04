import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { verifyCanonicalIdentityForPersistence } from "./acceptedSourceEnrichment";
import type { CanonicalIdentitySnapshot, IndependentCanonicalIdentity } from "./canonicalIdentityRestoration";
import { AuthoritativeExecutionBudgetLedger, type AuthoritativeExecutionBudgetSnapshot } from "../authoritative-execution-budget";

import type {
  CanonicalAdmissionProjection,
  CanonicalDecisionProjectionRow,
} from "../canonical-admission-projection";
import { extractSourceContent, persistImmutableArtifact, type ContentExtractionResult, type ExtractableSource, type SourceContentExtractorOptions } from "./sourceContentExtractor";
import { FULL_TEXT_PROVIDER_PROFILES, resolveLegalFullTextLocations, type FullTextArtifactIdentityV1, type FullTextResolutionResult } from "./fullTextAcquisitionV3";
import { decideManifestationAccessPolicy, verifyPayloadArticleIdentity, type PayloadArticleIdentityVerification } from "./studyManifestation";
import type {
  CanonicalStudyIdentityInput,
  StudyManifestation,
} from "./studyManifestation";

export const V6A_FAILURE_TAXONOMY = [
  "WRONG_ARTICLE_MATCH",
  "CANONICAL_IDENTITY_INSUFFICIENT",
  "FULLTEXT_MATERIALIZATION_FAILED",
  "PAYLOAD_UNAVAILABLE",
  "FETCH_TRANSPORT_FAILURE",
  "REDIRECT_RESOLUTION_FAILURE",
  "CONTENT_TYPE_MISMATCH",
  "PAYLOAD_EMPTY",
  "PAYLOAD_TRUNCATED",
  "F. LANDING_PAGE_NOT_FULLTEXT",
  "HTML_FULLTEXT_NOT_RECOGNIZED",
  "XML_JATS_TEI_NOT_RECOGNIZED",
  "PDF_SIGNATURE_INVALID",
  "ARTIFACT_PERSISTENCE_FAILURE",
  "HASH_OR_PROVENANCE_FAILURE",
  "CANONICAL_BINDING_FAILURE",
  "QUALIFICATION_LOGIC_FAILURE",
  "ROBOTS_OR_TOS_BLOCKED",
  "UNKNOWN_POLICY",
  "AUTH_OR_PAYWALL_REQUIRED",
  "OTHER",
] as const;

export type V6AFailureCode = (typeof V6A_FAILURE_TAXONOMY)[number];

export interface CanonicalMaterializedArtifact {
  schemaVersion: "researchforge-canonical-materialized-artifact/v1";
  artifactId: string;
  caseId?: string;
  studyId: string;
  manifestationId: string;
  sourceProvider: string;
  sourceUrl: string;
  finalUrl: string;
  format: "PDF" | "HTML" | "JATS_XML" | "TEI_XML" | "XML";
  reportedMimeType: string;
  detectedMimeType: string;
  byteLength: number;
  sha256: string;
  retrievedAt: string;
  policyClass: string;
  canonicalAdmissionId: string;
  provenance: {
    admissionEvidenceRevision: string;
    sourceId: string;
    accessPath: string[];
    redirectChain: string[];
    artifactSnapshotPath?: string;
    materializerVersion: "researchforge-fulltext-materializer-v6b";
  };
  materializerVersion: "researchforge-fulltext-materializer-v6b";
  qualificationStatus: "QUALIFIED" | "REJECTED";
  qualificationReason: string;
  underlyingArtifact: FullTextArtifactIdentityV1;
}

export interface CanonicalMaterializationBinding {
  schemaVersion: "researchforge-canonical-materialization-binding/v1";
  bindingId: string;
  artifactId: string;
  canonicalAdmissionId: string;
  studyId: string;
  sourceId: string;
  manifestationId: string;
  artifactRevision: string;
  bound: boolean;
  reasonCodes: string[];
}

export interface AdmittedManifestationMaterializationInput {
  projection: CanonicalAdmissionProjection;
  decisionId: string;
  canonical: CanonicalStudyIdentityInput;
  manifestation: StudyManifestation;
  source: Omit<ExtractableSource, "title"> & { title?: string };
  caseId?: string;
  options: SourceContentExtractorOptions & { artifactSnapshotDirectory: string };
}

export interface AdmittedManifestationMaterializationResult {
  status:
    | "QUALIFIED_AND_BOUND"
    | "MATERIALIZED_NOT_QUALIFIED"
    | "MATERIALIZED_CANONICAL_BINDING_REQUIRED"
    | "BLOCKED_BEFORE_FETCH";
  admission: CanonicalDecisionProjectionRow;
  manifestation: StudyManifestation;
  extraction?: ContentExtractionResult;
  artifact?: CanonicalMaterializedArtifact;
  binding: CanonicalMaterializationBinding | null;
  failure?: {
    code: V6AFailureCode;
    reason: string;
    stage?: "discovery" | "resolution" | "legal_access" | "download" | "identity" | "parsing" | "materialization" | "qualification" | "admission";
  };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function admissionFor(
  projection: CanonicalAdmissionProjection,
  decisionId: string,
): CanonicalDecisionProjectionRow | undefined {
  return projection.decisions.find((decision) => decision.decisionId === decisionId);
}

function allowedPolicy(value: string): boolean {
  return ["ALLOWED_OFFICIAL_API", "ALLOWED_OPEN_REPOSITORY", "ALLOWED_PUBLIC_ARTIFACT"].includes(value);
}

function sourceFor(input: AdmittedManifestationMaterializationInput): ExtractableSource {
  const artifactUrl = clean(input.manifestation.artifactUrl) || clean(input.manifestation.sourceUrl);
  return {
    ...input.source,
    sourceId: input.manifestation.sourceRecordId,
    id: input.manifestation.sourceRecordId,
    title: clean(input.canonical.title) || input.manifestation.sourceRecordId,
    doi: input.canonical.doi,
    pmid: input.canonical.pmid,
    pmcid: input.canonical.pmcid,
    arxivId: input.canonical.arxivId,
    providerIds: input.canonical.providerIds,
    url: artifactUrl,
    readableUrl: artifactUrl,
    fullTextUrl: artifactUrl,
    provider: input.manifestation.provider,
    canonicalSourceIdentity: input.canonical.canonicalStudyId,
    isOpenAccess: input.manifestation.oaStatus === "OPEN" ? true : input.source.isOpenAccess,
    authors: input.canonical.authors,
    year: input.canonical.year,
    venue: input.canonical.venue,
    studyPopulation: input.canonical.studyPopulation ?? input.source.studyPopulation,
    studyDesign: input.canonical.studyDesign ?? input.source.studyDesign,
  };
}

function formatFor(result: ContentExtractionResult): CanonicalMaterializedArtifact["format"] | null {
  const format = result.format_detection?.format;
  if (format === "PDF") return "PDF";
  if (format === "HTML") return "HTML";
  if (format === "JATS_XML") return "JATS_XML";
  if (format === "TEI_XML") return "TEI_XML";
  if (format === "XML") return "XML";
  return null;
}

function failureFor(
  result: ContentExtractionResult,
  options: { snapshotRequired: boolean },
): NonNullable<AdmittedManifestationMaterializationResult["failure"]> {
  const audit = result.access_audit_v3;
  const warningText = result.extraction_warnings.join(" ");
  const status = audit?.resolverRequests.at(-1)?.status ?? result.download_audit?.status ?? 0;
  const detection = result.format_detection;
  const bytes = result.download_audit?.byteLength ?? audit?.contentLength ?? 0;
  const reason = result.failure_reason ?? audit?.qualificationReason ?? (warningText || "NO_USABLE_ARTIFACT");
  if (audit?.artifact?.identityMatch === "MISMATCH") return { code: "WRONG_ARTICLE_MATCH", reason: "WRONG_ARTICLE_MATCH", stage: "identity" };
  if (reason === "CANONICAL_IDENTITY_INSUFFICIENT") return { code: "CANONICAL_IDENTITY_INSUFFICIENT", reason, stage: "identity" };
  if ([404, 410, 429].includes(status) || status >= 500) return { code: "PAYLOAD_UNAVAILABLE", reason, stage: "download" };
  if (/PDF_TEXT_EXTRACTION_UNAVAILABLE|PARSER_FAILED|PDF_PARSE_FAILED/iu.test(`${reason} ${warningText}`)) return { code: "FULLTEXT_MATERIALIZATION_FAILED", reason, stage: "parsing" };
  if (options.snapshotRequired && bytes > 0 && !result.download_audit?.artifactSnapshotPath) {
    return { code: "ARTIFACT_PERSISTENCE_FAILURE", reason: "RAW_ARTIFACT_SNAPSHOT_MISSING" };
  }
  if (status === 403 || /ROBOTS|TOS|POLICY_BLOCKED|ACCESS_BLOCKED|CAPTCHA|CHALLENGE/iu.test(`${reason} ${warningText}`)) {
    return { code: "ROBOTS_OR_TOS_BLOCKED", reason };
  }
  if (status === 200 && detection?.format === "HTML" && /LANDING|LOGIN|PAYWALL|PUBLISHER_SHELL|SIGN_IN/iu.test(`${reason} ${warningText}`)) {
    return { code: "F. LANDING_PAGE_NOT_FULLTEXT", reason };
  }
  if ([401, 402].includes(status) || /AUTH_REQUIRED|PAYWALL|LICENSE|PAYWALL_OR_LOGIN_REQUIRED/iu.test(`${reason} ${warningText}`)) {
    return { code: "AUTH_OR_PAYWALL_REQUIRED", reason };
  }
  if (/UNKNOWN_POLICY/iu.test(`${reason} ${warningText}`)) return { code: "UNKNOWN_POLICY", reason };
  if (/TIMEOUT|FETCH_FAILED|NETWORK_ERROR|CONNECTION_RESET|PROVIDER_NETWORK_ERROR/iu.test(`${reason} ${warningText}`)) {
    return { code: "FETCH_TRANSPORT_FAILURE", reason };
  }
  if (/REDIRECT|RESOLVER_DEPTH|LOOP/iu.test(`${reason} ${warningText}`)) {
    return { code: "REDIRECT_RESOLUTION_FAILURE", reason };
  }
  if (status === 200 && bytes === 0) return { code: "PAYLOAD_EMPTY", reason };
  if (/TRUNCATED|EOF_MISSING|MAX_BYTES_EXCEEDED/iu.test(`${reason} ${warningText}`)) {
    return { code: "PAYLOAD_TRUNCATED", reason };
  }
  if ((detection?.format === "HTML" && result.download_audit?.contentTypeMismatch) || /HTML_RETURNED_AS_PDF|CONTENT_TYPE_MISMATCH/iu.test(`${reason} ${warningText}`)) {
    return { code: "CONTENT_TYPE_MISMATCH", reason };
  }
  if (/pdf/iu.test(detection?.declaredMime ?? "") && detection?.format !== "PDF") {
    return { code: "PDF_SIGNATURE_INVALID", reason };
  }
  if (/INVALID_PDF_MAGIC|CORRUPT_PDF|SIGNATURE/iu.test(`${reason} ${warningText}`)) {
    return { code: "PDF_SIGNATURE_INVALID", reason };
  }
  if (/LANDING_PAGE_ONLY|LANDING_NO_FULLTEXT_LINK|PUBLISHER_SHELL/iu.test(`${reason} ${warningText}`)) {
    return { code: "F. LANDING_PAGE_NOT_FULLTEXT", reason };
  }
  if (detection?.format === "HTML" && result.access_level !== "full_text") {
    return { code: "HTML_FULLTEXT_NOT_RECOGNIZED", reason };
  }
  if (["XML", "JATS_XML", "TEI_XML"].includes(detection?.format ?? "") && result.access_level !== "full_text") {
    return { code: "XML_JATS_TEI_NOT_RECOGNIZED", reason };
  }
  if (/HASH|PROVENANCE/iu.test(`${reason} ${warningText}`)) return { code: "HASH_OR_PROVENANCE_FAILURE", reason };
  if (/QUALIFICATION|STRUCTURE|TOO_SHORT/iu.test(`${reason} ${warningText}`)) {
    return { code: "QUALIFICATION_LOGIC_FAILURE", reason };
  }
  return { code: "OTHER", reason };
}

function buildArtifact(input: {
  extraction: ContentExtractionResult;
  admission: CanonicalDecisionProjectionRow;
  manifestation: StudyManifestation;
  caseId?: string;
}): CanonicalMaterializedArtifact | undefined {
  const extractionArtifact = input.extraction.access_audit_v3?.artifact;
  const format = formatFor(input.extraction);
  if (!extractionArtifact || !format || extractionArtifact.identityMatch !== "MATCH") return undefined;
  const audit = input.extraction.access_audit_v3!;
  const sha = extractionArtifact.checksum;
  const artifactId = `artifact:${sha256(`${input.admission.decisionId}|${input.manifestation.manifestationId}|${sha}`).slice(0, 24)}`;
  return {
    schemaVersion: "researchforge-canonical-materialized-artifact/v1",
    artifactId,
    ...(input.caseId ? { caseId: input.caseId } : {}),
    studyId: input.admission.studyId,
    manifestationId: input.manifestation.manifestationId,
    sourceProvider: input.manifestation.provider,
    sourceUrl: input.manifestation.sourceUrl,
    finalUrl: extractionArtifact.resolvedUrl,
    format,
    reportedMimeType: extractionArtifact.declaredMime ?? audit.declaredMime ?? "unknown",
    detectedMimeType: extractionArtifact.detectedMime ?? audit.detectedMime ?? extractionArtifact.mimeType,
    byteLength: extractionArtifact.byteLength,
    sha256: sha,
    retrievedAt: extractionArtifact.retrievedAt,
    policyClass: input.manifestation.accessPolicyDecision,
    canonicalAdmissionId: input.admission.decisionId,
    provenance: {
      admissionEvidenceRevision: input.admission.evidenceRevision,
      sourceId: input.admission.sourceId,
      accessPath: unique(input.manifestation.provenance.accessPath),
      redirectChain: unique(extractionArtifact.redirectChain ?? audit.redirectChain ?? []),
      ...(input.extraction.download_audit?.artifactSnapshotPath ? { artifactSnapshotPath: input.extraction.download_audit.artifactSnapshotPath } : {}),
      materializerVersion: "researchforge-fulltext-materializer-v6b",
    },
    materializerVersion: "researchforge-fulltext-materializer-v6b",
    qualificationStatus: extractionArtifact.qualificationResult,
    qualificationReason: extractionArtifact.qualificationReason,
    underlyingArtifact: extractionArtifact,
  };
}

export async function materializeAdmittedManifestation(
  input: AdmittedManifestationMaterializationInput,
): Promise<AdmittedManifestationMaterializationResult> {
  const admission = admissionFor(input.projection, input.decisionId);
  if (!input.projection.validation.pass || !admission) {
    throw new Error("CANONICAL_ADMISSION_REFERENCE_INVALID");
  }
  if (!admission.admitted || admission.canonicalStatus !== "ADMITTED" || admission.admissionClass === "BLOCKED" || admission.accessState === "UNKNOWN") {
    throw new Error("CANONICAL_ADMISSION_NOT_ADMITTED");
  }
  if (input.canonical.canonicalStudyId !== admission.studyId || input.manifestation.canonicalStudyId !== admission.studyId || input.manifestation.sourceRecordId !== admission.sourceId) {
    throw new Error("CANONICAL_MANIFESTATION_IDENTITY_MISMATCH");
  }
  if (input.manifestation.identityDecision === "MISMATCH") {
    return { status: "BLOCKED_BEFORE_FETCH", admission, manifestation: input.manifestation, binding: null, failure: { code: "WRONG_ARTICLE_MATCH", reason: "MANIFESTATION_IDENTITY_MISMATCH", stage: "identity" } };
  }
  // Discovery POSSIBLE_MATCH/UNKNOWN may be inspected under the legal policy;
  // only independently verified payload identity can qualify or bind it.
  if (!allowedPolicy(input.manifestation.accessPolicyDecision)) {
    const code = input.manifestation.accessPolicyDecision === "UNKNOWN_POLICY"
      ? "UNKNOWN_POLICY"
      : input.manifestation.accessPolicyDecision === "AUTH_REQUIRED" || input.manifestation.accessPolicyDecision === "PAYWALLED"
        ? "AUTH_OR_PAYWALL_REQUIRED"
        : "ROBOTS_OR_TOS_BLOCKED";
    return {
      status: "BLOCKED_BEFORE_FETCH",
      admission,
      manifestation: input.manifestation,
      binding: null,
      failure: { code, reason: input.manifestation.accessPolicyDecision, stage: "legal_access" },
    };
  }

  const extraction = await extractSourceContent(sourceFor(input), {
    ...input.options,
    resolveFullTextLocations: false,
    manifestationIdentityDecision: input.manifestation.identityDecision,
    manifestationIdentityConfidence: input.manifestation.identityConfidence,
    manifestationIdentityEvidence: input.manifestation.identityEvidence,
  });
  const artifact = buildArtifact({ extraction, admission, manifestation: input.manifestation, caseId: input.caseId });
  const declaredPdfDetectedNonPdf = /pdf/iu.test(extraction.download_audit?.declaredContentType ?? "") && extraction.format_detection?.format !== "PDF";
  const failed = !declaredPdfDetectedNonPdf && extraction.access_level === "full_text" && artifact?.qualificationStatus === "QUALIFIED" && extraction.download_audit?.artifactSnapshotPath
    ? null
    : failureFor(extraction, { snapshotRequired: true });
  if (failed && !failed.stage) {
    failed.stage = /POLICY|ROBOTS|AUTH/u.test(failed.code) ? "legal_access"
      : /FETCH|REDIRECT|UNAVAILABLE/u.test(failed.code) ? "download"
      : /PERSISTENCE|PROVENANCE/u.test(failed.code) ? "materialization"
      : /PDF|TRUNCATED|EMPTY|CONTENT_TYPE/u.test(failed.code) ? "parsing" : "qualification";
  }
  const updatedManifestation: StudyManifestation = {
    ...input.manifestation,
    normalizedDocument: undefined,
    identityDecision: extraction.access_audit_v3?.artifact?.identityMatch ?? "UNKNOWN",
    identityConfidence: extraction.access_audit_v3?.artifact?.payloadIdentity?.confidence ?? 0,
    identityEvidence: extraction.access_audit_v3?.artifact?.payloadIdentity?.evidence ?? [],
    qualificationStatus: failed ? "REJECTED" : "QUALIFIED",
    qualificationReasons: failed ? [] : ["CANONICAL_ARTICLE_IDENTITY_VERIFIED"],
    rejectionReasons: failed ? [failed.reason] : [],
    ...(extraction.download_audit?.declaredContentType ? { contentTypeHeader: extraction.download_audit.declaredContentType } : {}),
    ...(extraction.download_audit?.detectedContentType ? { detectedContentType: extraction.download_audit.detectedContentType } : {}),
    ...(extraction.download_audit?.byteLength !== undefined ? { contentLength: extraction.download_audit.byteLength } : {}),
    ...(extraction.download_audit?.checksum ? { checksumSha256: extraction.download_audit.checksum } : {}),
    ...(extraction.download_audit?.artifactSnapshotPath ? { provenance: { ...input.manifestation.provenance, artifactSnapshotPath: extraction.download_audit.artifactSnapshotPath, rawArtifactRetained: true } } : {}),
    materializationStatus: artifact && !declaredPdfDetectedNonPdf ? "MATERIALIZED" : "FETCH_FAILED",
  };
  if (failed || !artifact) {
    return { status: "MATERIALIZED_NOT_QUALIFIED", admission, manifestation: updatedManifestation, extraction, binding: null, failure: failed ?? { code: "QUALIFICATION_LOGIC_FAILURE", reason: "NO_ARTIFACT_RECORD", stage: "qualification" } };
  }
  const artifactRevision = artifact.sha256;
  const refMatches = admission.qualifyingArtifactRefs.includes(artifactRevision);
  const bindingId = `binding:${sha256(`${admission.decisionId}|${artifact.artifactId}|${artifactRevision}`).slice(0, 24)}`;
  const binding: CanonicalMaterializationBinding = {
    schemaVersion: "researchforge-canonical-materialization-binding/v1",
    bindingId,
    artifactId: artifact.artifactId,
    canonicalAdmissionId: admission.decisionId,
    studyId: admission.studyId,
    sourceId: admission.sourceId,
    manifestationId: input.manifestation.manifestationId,
    artifactRevision,
    bound: refMatches,
    reasonCodes: refMatches ? [] : ["QUALIFYING_ARTIFACT_NOT_IN_CURRENT_ADMISSION_REVISION"],
  };
  if (!refMatches) {
    return { status: "MATERIALIZED_CANONICAL_BINDING_REQUIRED", admission, manifestation: updatedManifestation, extraction, artifact, binding, failure: { code: "CANONICAL_BINDING_FAILURE", reason: "QUALIFYING_ARTIFACT_NOT_IN_CURRENT_ADMISSION_REVISION", stage: "admission" } };
  }
  return { status: "QUALIFIED_AND_BOUND", admission, manifestation: updatedManifestation, extraction, artifact, binding };
}

export function dedupeCanonicalMaterializedArtifacts(
  artifacts: CanonicalMaterializedArtifact[],
): CanonicalMaterializedArtifact[] {
  const byHash = new Map<string, CanonicalMaterializedArtifact>();
  for (const artifact of artifacts) {
    const current = byHash.get(artifact.sha256);
    if (!current || artifact.artifactId.localeCompare(current.artifactId) < 0) byHash.set(artifact.sha256, artifact);
  }
  return [...byHash.values()].sort((left, right) => left.artifactId.localeCompare(right.artifactId));
}

/** V6D binds content to an immutable identity snapshot, not to formal Writer admission. */
export interface CanonicalSnapshotMaterializationInput {
  authorityOrigin: "V6C_CANONICAL_SNAPSHOT";
  snapshotPath: string;
  snapshotSha256: string;
  seedProvenancePath: string;
  seedProvenanceSha256: string;
  caseId: "01";
  jobId: string;
  jobDirectory: string;
  policySignal?: string;
}
export interface CanonicalSnapshotFullTextManifest {
  schemaVersion: "researchforge-canonical-fulltext-manifest/v6d";
  artifactId: string;
  caseId: "01";
  jobId: string;
  authority: { snapshotPath: string; snapshotSha256: string; canonical: IndependentCanonicalIdentity["canonical"] };
  sourceProvider: string;
  sourceUrl: string;
  finalResolvedUrl: string;
  redirectChain: string[];
  retrievedAt: string;
  policy: string;
  license: string | null;
  httpStatus: number;
  contentType: string;
  byteLength: number;
  rawArtifactPath: string;
  rawArtifactSha256: string;
  parsedArtifactPath: string;
  parsedArtifactSha256: string;
  parserUsed: string;
  parserVersion: string;
  pageCount: number | null;
  structure: string[];
  extractedIdentity: ContentExtractionResult["artifact_identity"];
  identityDecision: PayloadArticleIdentityVerification;
  qualification: FullTextArtifactIdentityV1;
  warningReasonCodes: string[];
  provenance: { resultPath: string; seedProvenancePath: string; seedProvenanceSha256: string };
}
export interface CanonicalSnapshotMaterializationResult {
  schemaVersion: "researchforge-canonical-fulltext-job/v6d";
  jobId: string;
  caseId: "01";
  snapshotSha256: string;
  status: "QUALIFIED" | "BLOCKED";
  reasonCodes: string[];
  policy: string;
  resolution: FullTextResolutionResult;
  extraction?: ContentExtractionResult;
  identity?: PayloadArticleIdentityVerification;
  manifest?: CanonicalSnapshotFullTextManifest;
  budget: AuthoritativeExecutionBudgetSnapshot;
  writerCalls: 0;
  generalizationReady: false;
}

const bytesHash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + "\n");

export async function materializeCanonicalIdentitySnapshot(
  input: CanonicalSnapshotMaterializationInput,
  dependencies: Pick<SourceContentExtractorOptions, "fetchImpl" | "pdfParser"> = {},
): Promise<CanonicalSnapshotMaterializationResult> {
  const keys = ["authorityOrigin", "snapshotPath", "snapshotSha256", "seedProvenancePath", "seedProvenanceSha256", "caseId", "jobId", "jobDirectory", "policySignal"];
  if (input.authorityOrigin !== "V6C_CANONICAL_SNAPSHOT" || Object.keys(input).some(key => !keys.includes(key))) {
    throw new Error("REJECTED_IDENTITY_AUTHORITY_INPUT");
  }
  const snapshotBytes = await readFile(input.snapshotPath);
  const seedBytes = await readFile(input.seedProvenancePath);
  if (bytesHash(snapshotBytes) !== input.snapshotSha256 || bytesHash(seedBytes) !== input.seedProvenanceSha256) throw new Error("V6C_IDENTITY_AUTHORITY_HASH_MISMATCH");
  const authority = JSON.parse(snapshotBytes.toString()) as IndependentCanonicalIdentity;
  const seed = JSON.parse(seedBytes.toString()) as { snapshot: CanonicalIdentitySnapshot };
  if (!verifyCanonicalIdentityForPersistence(seed.snapshot, authority) || input.caseId !== "01" || !authority.canonical.url) throw new Error("V6C_IDENTITY_AUTHORITY_INVALID");
  const canonical = authority.canonical;
  if (!/^[a-zA-Z0-9_-]+$/u.test(input.jobId) || canonical.sourceId !== seed.snapshot.canonical.sourceId || seed.snapshot.sourceVersion.includes(input.jobId)) throw new Error("V6D_JOB_IDENTITY_INVALID");
  const directory = resolve(input.jobDirectory);
  if (directory === dirname(resolve(input.snapshotPath)) || directory.startsWith(dirname(resolve(input.snapshotPath)) + "/")) throw new Error("PROTECTED_EVIDENCE_DESTINATION");
  const resultPath = join(directory, "MATERIALIZATION-RESULT.json");
  // Completed identical jobs reuse immutable evidence; incomplete jobs cannot retry.
  try {
    const previous = JSON.parse(await readFile(resultPath, "utf8")) as CanonicalSnapshotMaterializationResult;
    if (previous.jobId !== input.jobId || previous.snapshotSha256 !== input.snapshotSha256) throw new Error("IMMUTABLE_JOB_CONFLICT");
    if (previous.manifest) {
      if (bytesHash(await readFile(previous.manifest.rawArtifactPath)) !== previous.manifest.rawArtifactSha256 || bytesHash(await readFile(previous.manifest.parsedArtifactPath)) !== previous.manifest.parsedArtifactSha256) throw new Error("IMMUTABLE_ARTIFACT_CONFLICT");
    }
    return previous;
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "LIVE-ATTEMPT.lock"), jsonBytes({ jobId: input.jobId, snapshotSha256: input.snapshotSha256 }), { flag: "wx", mode: 0o600 });
  const timeoutMs = Math.min(5_000, FULL_TEXT_PROVIDER_PROFILES.existing_payload.timeoutMs);
  const ledger = new AuthoritativeExecutionBudgetLedger({ configured: {
    query: 0, expandedQuery: 0, provider: 1, providerQueryPair: 1, requestAttempt: 1,
    retry: 0, redirect: 0, resolver: 0, materialization: 1, fallbackLayer: 0, elapsedTime: timeoutMs,
  } });
  // Resolve the independently persisted canonical URL with the existing owner.
  // No metadata provider lookup, payload DOI seed, cache, or fallback query.
  const resolution = await resolveLegalFullTextLocations({
    ...canonical, canonicalWorkId: canonical.canonicalStudyId,
  }, { maxResolverRequests: 0, retryCount: 0, fetchImpl: async () => { throw new Error("RESOLVER_NETWORK_FORBIDDEN"); } });
  const location = resolution.locations.find(candidate => candidate.url === canonical.url && candidate.provider === "existing_payload");
  const policy = decideManifestationAccessPolicy({ provider: "existing_payload", sourceUrl: canonical.url!, policySignal: input.policySignal });
  let result: CanonicalSnapshotMaterializationResult = {
    schemaVersion: "researchforge-canonical-fulltext-job/v6d", jobId: input.jobId, caseId: input.caseId,
    snapshotSha256: input.snapshotSha256, status: "BLOCKED", reasonCodes: [], policy, resolution,
    budget: ledger.snapshot(), writerCalls: 0, generalizationReady: false,
  };
  if (!location || !allowedPolicy(policy)) result.reasonCodes = [!location ? "NO_APPROVED_CANONICAL_ROUTE" : policy];
  else {
    let guardReason: string | undefined;
    const guardedFetch: typeof fetch = async (request, init) => {
      const url = String(request);
      if (url !== canonical.url || init?.redirect !== "manual") {
        guardReason = "UNAPPROVED_REDIRECT_OR_REQUEST";
        throw new Error(guardReason);
      }
      const execution = await ledger.execute({ operation: "materialization", provider: "existing_payload", requestIdentity: url, attemptType: "initial" }, () => (dependencies.fetchImpl ?? fetch)(request, init));
      if (execution.status === "EXECUTED") return execution.value;
      if (execution.status === "FAILED") throw execution.error;
      guardReason = execution.status === "BLOCKED_BY_BUDGET" ? execution.block.reasonCode : "REQUEST_DEDUPLICATED";
      throw new Error(guardReason);
    };
    const extraction = await extractSourceContent({ ...canonical, id: canonical.sourceId, canonicalSourceIdentity: canonical.canonicalStudyId, provider: "existing_payload", isOpenAccess: location.isOpenAccess }, {
      fetchImpl: guardedFetch, ...(dependencies.pdfParser ? { pdfParser: dependencies.pdfParser } : {}),
      timeoutMs, retryCount: 0, resolveFullTextLocations: false, maxResolverRequests: 0,
      landingResolverMaxDepth: 0, artifactSnapshotDirectory: join(directory, "raw"),
    });
    const identity = verifyPayloadArticleIdentity(canonical, extraction.artifact_identity ?? {});
    const reasons: string[] = [];
    if (guardReason) reasons.push(guardReason);
    if (identity.decision !== "MATCH") reasons.push(identity.reason);
    // This phase is narrower than legacy shared-PID acceptance. Reuse the
    // owner's comparisons without adding fuzzy thresholds or guessed fields.
    if (canonical.doi && identity.comparisons.doi !== "MATCH") reasons.push("CANONICAL_DOI_NOT_VERIFIED");
    if (["title", "authors", "year"].some(field => identity.comparisons[field] === "MISMATCH")) reasons.push("CANONICAL_BIBLIOGRAPHY_CONFLICT");
    const finalUrl = extraction.provenance.url_used ?? canonical.url!;
    if (finalUrl !== canonical.url) reasons.push("FINAL_DESTINATION_NOT_CANONICAL_ROUTE");
    const artifact = extraction.access_audit_v3?.artifact;
    if (extraction.access_level !== "full_text" || !extraction.access_audit_v3?.qualifyingFullText || artifact?.qualificationResult !== "QUALIFIED") reasons.push(extraction.failure_reason ?? artifact?.qualificationReason ?? "FULLTEXT_NOT_QUALIFIED");
    const rawPath = extraction.download_audit?.artifactSnapshotPath;
    if (!rawPath || !artifact || artifact.checksum !== bytesHash(await readFile(rawPath))) reasons.push("RAW_ARTIFACT_HASH_OR_PERSISTENCE_MISSING");
    result = { ...result, extraction, identity, reasonCodes: unique(reasons), budget: ledger.snapshot() };
    if (!reasons.length && rawPath && artifact) {
      const parsed = jsonBytes({ text: extraction.text, sections: extraction.extracted_sections, parser: extraction.extraction_method, toolVersions: extraction.tool_versions });
      const parsedPath = join(directory, "canonical-parsed.json");
      await persistImmutableArtifact(parsedPath, parsed);
      const manifest: CanonicalSnapshotFullTextManifest = {
        schemaVersion: "researchforge-canonical-fulltext-manifest/v6d", artifactId: `artifact:${sha256(`${input.snapshotSha256}|${artifact.checksum}`)}`,
        caseId: input.caseId, jobId: input.jobId,
        authority: { snapshotPath: resolve(input.snapshotPath), snapshotSha256: input.snapshotSha256, canonical },
        sourceProvider: location.provider, sourceUrl: canonical.url!, finalResolvedUrl: finalUrl,
        redirectChain: extraction.download_audit?.redirectChain ?? [canonical.url!], retrievedAt: extraction.fetched_at,
        policy, license: location.license ?? null, httpStatus: extraction.download_audit!.status,
        contentType: extraction.download_audit!.contentType, byteLength: extraction.download_audit!.byteLength,
        rawArtifactPath: rawPath, rawArtifactSha256: artifact.checksum, parsedArtifactPath: parsedPath, parsedArtifactSha256: bytesHash(parsed),
        parserUsed: artifact.parserUsed, parserVersion: artifact.parserVersion, pageCount: extraction.page_count ?? null,
        structure: artifact.structureMarkers, extractedIdentity: extraction.artifact_identity, identityDecision: identity, qualification: artifact,
        warningReasonCodes: unique([...extraction.extraction_warnings, ...(identity.comparisons.venue === "MISMATCH" ? ["VENUE_SPELLING_DISAGREEMENT_WITH_EXACT_DOI"] : [])]),
        provenance: { resultPath, seedProvenancePath: resolve(input.seedProvenancePath), seedProvenanceSha256: input.seedProvenanceSha256 },
      };
      result = { ...result, status: "QUALIFIED", manifest };
    } else {
      // A V6D rejection must not leak legacy qualified text or claim inputs.
      result.extraction = { ...extraction, text: "", chunks: [], extracted_chunks: [], extracted_sections: [], can_use_for_claims: false, can_use_for_report: false };
    }
  }
  if (bytesHash(await readFile(input.snapshotPath)) !== input.snapshotSha256 || bytesHash(await readFile(input.seedProvenancePath)) !== input.seedProvenanceSha256) throw new Error("V6C_IDENTITY_AUTHORITY_CHANGED");
  if (result.manifest) await persistImmutableArtifact(join(directory, "CANONICAL-FULLTEXT-MANIFEST.json"), jsonBytes(result.manifest));
  await persistImmutableArtifact(resultPath, jsonBytes(result));
  return result;
}
