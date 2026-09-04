import { createHash } from "node:crypto";
import {
  createStudyManifestation,
  dedupeStudyManifestations,
  verifyPayloadArticleIdentity,
  type CanonicalStudyIdentityInput,
  type PayloadArticleIdentityVerification,
  type ManifestationIdentityInput,
  type StudyIdentityRelation,
  type StudyManifestation,
  type StudyManifestationVersionType,
} from "./studyManifestation";

export const FULL_TEXT_ACQUISITION_OUTCOMES = [
  "NO_FULL_TEXT_DISCOVERED",
  "OA_LOOKUP_SUCCESS",
  "OA_LOOKUP_MISS",
  "DOI_RESOLUTION_FAILED",
  "LANDING_PAGE_ONLY",
  "ABSTRACT_ONLY",
  "HTML_FULL_TEXT_FOUND",
  "XML_JATS_FULL_TEXT_FOUND",
  "XML_TEI_FULL_TEXT_FOUND",
  "PDF_URL_FOUND",
  "PDF_DOWNLOAD_SUCCESS",
  "PDF_DOWNLOAD_BLOCKED",
  "HTTP_401",
  "HTTP_403",
  "HTTP_404",
  "HTTP_429",
  "PROVIDER_TIMEOUT",
  "PROVIDER_NETWORK_ERROR",
  "PROVIDER_SERVER_ERROR",
  "PROVIDER_CIRCUIT_OPEN",
  "ROBOTS_OR_TOS_BLOCKED",
  "ACCESS_BLOCKED",
  "RIGHTS_OR_LICENSE_BLOCKED",
  "INVALID_CONTENT_TYPE",
  "HTML_RETURNED_AS_PDF",
  "CORRUPT_PDF",
  "ENCRYPTED_PDF",
  "SCANNED_PDF",
  "MACHINE_TEXT_PDF",
  "PARSER_FAILED",
  "OCR_REQUIRED",
  "OCR_FAILED",
  "FULL_TEXT_TOO_SHORT",
  "FULL_TEXT_STRUCTURE_INVALID",
  "WRONG_ARTICLE_VERSION",
  "WRONG_ARTICLE_MATCH",
  "CANONICAL_IDENTITY_INSUFFICIENT",
  "DUPLICATE_OR_MIRROR",
  "SUPPLEMENTARY_ONLY",
  "FULL_TEXT_QUALIFIED",
] as const;

export type FullTextAcquisitionOutcome =
  (typeof FULL_TEXT_ACQUISITION_OUTCOMES)[number];

export const FULL_TEXT_ARTIFACT_VERSION_TYPES = [
  "VERSION_OF_RECORD",
  "ACCEPTED_MANUSCRIPT",
  "PREPRINT",
  "REPOSITORY_COPY",
  "UNKNOWN_VERSION",
] as const;

export type FullTextArtifactVersionType =
  (typeof FULL_TEXT_ARTIFACT_VERSION_TYPES)[number];

export const OA_TELEMETRY_EVENT_TYPES = [
  "OA_DISCOVERY_STARTED",
  "OA_PROVIDER_QUERY_STARTED",
  "OA_PROVIDER_QUERY_SUCCEEDED",
  "OA_PROVIDER_QUERY_FAILED",
  "OA_ROUTE_DISCOVERED",
  "OA_ROUTE_DEDUPED",
  "OA_ROUTE_RANKED",
  "OA_ROUTE_VALIDATION_STARTED",
  "OA_ROUTE_VALIDATION_FAILED",
  "OA_ARTIFACT_ACQUIRED",
  "OA_ARTIFACT_INVALID",
  "OA_IDENTITY_MATCHED",
  "OA_IDENTITY_MISMATCH",
  "OA_ARTIFACT_QUALIFIED",
  "OA_ARTIFACT_REJECTED",
  "OA_ALL_ROUTES_EXHAUSTED",
] as const;

export type OaTelemetryEventType = (typeof OA_TELEMETRY_EVENT_TYPES)[number];

export type FullTextProvider =
  | "existing_payload"
  | "openalex"
  | "crossref"
  | "datacite"
  | "europe_pmc"
  | "unpaywall"
  | "doaj"
  | "semantic_scholar"
  | "arxiv"
  | "core"
  | "doi_resolver";

export interface FullTextProviderProfile {
  timeoutMs: number;
  maxRetries: number;
  retryableStatuses: number[];
  minIntervalMs: number;
  maxConcurrency: number;
  backoffMs: number;
  circuitThreshold: number;
  cooldownMs: number;
  headSupported: boolean;
  redirectsExpected: boolean;
}

export const FULL_TEXT_PROVIDER_PROFILES: Record<FullTextProvider, FullTextProviderProfile> = {
  existing_payload: { timeoutMs: 8_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 0, maxConcurrency: 3, backoffMs: 150, circuitThreshold: 3, cooldownMs: 60_000, headSupported: false, redirectsExpected: true },
  unpaywall: { timeoutMs: 5_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 100, maxConcurrency: 2, backoffMs: 250, circuitThreshold: 3, cooldownMs: 60_000, headSupported: true, redirectsExpected: false },
  europe_pmc: { timeoutMs: 6_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 100, maxConcurrency: 2, backoffMs: 200, circuitThreshold: 4, cooldownMs: 45_000, headSupported: true, redirectsExpected: false },
  openalex: { timeoutMs: 6_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 150, maxConcurrency: 1, backoffMs: 500, circuitThreshold: 3, cooldownMs: 60_000, headSupported: true, redirectsExpected: false },
  doaj: { timeoutMs: 6_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 150, maxConcurrency: 1, backoffMs: 300, circuitThreshold: 3, cooldownMs: 60_000, headSupported: true, redirectsExpected: false },
  crossref: { timeoutMs: 6_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 100, maxConcurrency: 2, backoffMs: 250, circuitThreshold: 4, cooldownMs: 45_000, headSupported: true, redirectsExpected: false },
  datacite: { timeoutMs: 6_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 100, maxConcurrency: 1, backoffMs: 250, circuitThreshold: 3, cooldownMs: 60_000, headSupported: true, redirectsExpected: false },
  semantic_scholar: { timeoutMs: 6_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 1_000, maxConcurrency: 1, backoffMs: 1_000, circuitThreshold: 2, cooldownMs: 120_000, headSupported: true, redirectsExpected: false },
  core: { timeoutMs: 8_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 250, maxConcurrency: 1, backoffMs: 500, circuitThreshold: 3, cooldownMs: 60_000, headSupported: true, redirectsExpected: false },
  arxiv: { timeoutMs: 8_000, maxRetries: 1, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 3_000, maxConcurrency: 1, backoffMs: 3_000, circuitThreshold: 3, cooldownMs: 120_000, headSupported: true, redirectsExpected: true },
  doi_resolver: { timeoutMs: 8_000, maxRetries: 0, retryableStatuses: [408, 425, 429, 500, 502, 503, 504], minIntervalMs: 100, maxConcurrency: 2, backoffMs: 250, circuitThreshold: 3, cooldownMs: 60_000, headSupported: true, redirectsExpected: true },
};

export interface OaRouteCandidate {
  studyIdentity: {
    canonicalWorkId: string;
    doi?: string;
    pmcid?: string;
    arxivId?: string;
  };
  provider: FullTextProvider;
  routeType:
    | "STRUCTURED_FULL_TEXT"
    | "DIRECT_PDF"
    | "FULL_TEXT_HTML"
    | "LANDING_PAGE"
    | "DOI_RESOLVER";
  url: string;
  landingUrl?: string;
  declaredOaStatus: "OPEN" | "CLOSED" | "UNKNOWN";
  declaredLicense?: string;
  formatHint?: string;
  artifactVersionType: FullTextArtifactVersionType;
  repositoryIdentifier?: string;
  hostType?: "repository" | "publisher" | "unknown";
  sourceMetadata: Record<string, string | number | boolean | null>;
  discoveredAt: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  routeFingerprint: string;
}

export interface OaProviderAvailability {
  provider: FullTextProvider;
  status: "AVAILABLE" | "PROVIDER_NOT_CONFIGURED" | "DISABLED_BY_BUDGET";
  reasonCode: string;
}

export interface OaTelemetryEvent {
  event: OaTelemetryEventType;
  runId: string;
  caseId: string;
  studyId: string;
  provider: FullTextProvider;
  routeType: string;
  reasonCode: string;
  elapsedMs: number;
  retryCount: number;
  at: string;
}

export const FULL_TEXT_ACCESS_STATES = [
  "FULL_TEXT_STRUCTURED",
  "FULL_TEXT_HTML",
  "FULL_TEXT_PDF",
  "FULL_TEXT_OCR",
  "FULL_TEXT_REPOSITORY_COPY",
  "ABSTRACT_ONLY",
  "METADATA_ONLY",
  "PUBLISHER_SHELL",
  "ACCESS_DENIED",
  "PAYWALLED",
  "LICENSE_RESTRICTED",
  "NOT_FOUND",
  "BROKEN_DOCUMENT",
  "UNSUPPORTED_FORMAT",
  "RESOLVER_ERROR",
  "UNKNOWN_JOB_INCOMPLETE",
  // Retained for backward-compatible parsing of V3 artifacts. New
  // classifications use the more specific states above.
  "BROKEN_LINK",
  "UNRESOLVED",
] as const;

export type FullTextAccessStateV3 = (typeof FULL_TEXT_ACCESS_STATES)[number];

export interface FullTextLocationCandidate {
  url: string;
  provider: FullTextProvider;
  accessPath: string[];
  isOpenAccess: boolean | null;
  version?: string;
  license?: string;
  contentTypeHint?: string;
  landingUrl?: string;
  declaredOaStatus?: string;
  hostType?: "repository" | "publisher" | "unknown";
  repositoryIdentifier?: string;
  sourceMetadata?: Record<string, string | number | boolean | null>;
  discoveredAt?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  routeFingerprint?: string;
  repositoryCopy: boolean;
  routePriority?: number;
  manifestationIdentity?: ManifestationIdentityInput;
  identityRelations?: StudyIdentityRelation[];
}

export interface FullTextResolverRequestAudit {
  candidateRank?: number;
  provider: FullTextLocationCandidate["provider"];
  url: string;
  status: number;
  ok: boolean;
  attemptedAt: string;
  attempt: number;
  result:
    | "SUCCESS"
    | "NOT_FOUND"
    | "ACCESS_DENIED"
    | "RATE_LIMITED"
    | "SERVER_ERROR"
    | "TIMEOUT"
    | "NETWORK_ERROR"
    | "INVALID_RESPONSE"
    | "CIRCUIT_OPEN"
    | "NO_USABLE_ARTIFACT";
  latencyMs: number;
  retryEligibility: "RETRYABLE" | "NOT_RETRYABLE" | "UNKNOWN";
  artifactCreated: boolean;
  legalAccess: boolean | null;
  contentType?: string;
  declaredContentType?: string;
  detectedContentType?: string;
  detectionMethod?: string[];
  contentTypeMismatch?: boolean;
  magicBytes?: string;
  redirectChain?: string[];
  resolutionDepth?: number;
  resolutionSignal?: string;
  resolvedUrl?: string;
  failureClass?: string;
  failureReason?: string;
  phase?: "RESOLUTION" | "ACQUISITION";
  acquisitionOutcome?: FullTextAcquisitionOutcome;
  bytesDownloaded?: number;
  cacheHit?: boolean;
  retryAfterMs?: number;
  circuitState?: "CLOSED" | "OPEN" | "HALF_OPEN";
}

export interface FullTextArtifactIdentityV1 {
  schemaVersion: "researchforge-fulltext-artifact/v1";
  studyId: string;
  canonicalWorkId: string;
  identifiers: {
    doi?: string;
    pmid?: string;
    pmcid?: string;
    arxivId?: string;
  };
  sourceProvider: FullTextLocationCandidate["provider"];
  sourceUrl: string;
  resolvedUrl: string;
  acquisitionRoute: string[];
  httpStatus: number;
  mimeType: string;
  declaredMime?: string;
  detectedMime?: string;
  formatDetector?: string[];
  contentTypeMismatch?: boolean;
  magicBytes?: string;
  redirectChain?: string[];
  byteLength: number;
  checksum: string;
  retrievedAt: string;
  publicationVersion?: string;
  artifactVersionType: FullTextArtifactVersionType;
  license?: string;
  rightsStatus: "OPEN" | "RESTRICTED" | "UNKNOWN";
  oaStatus: "OPEN" | "CLOSED" | "UNKNOWN";
  accessMethod:
    | "OFFICIAL_OA_REPOSITORY"
    | "PROVIDER_DISCOVERED_OA"
    | "PUBLISHER_DECLARED_OA"
    | "PUBLIC_URL_VALIDATED"
    | "UNKNOWN";
  landingUrl?: string;
  parserUsed: string;
  parserVersion: string;
  pageCount?: number;
  textLength: number;
  structureMarkers: string[];
  identityMatch: "MATCH" | "MISMATCH" | "UNKNOWN";
  identityStrength: "STRONG" | "MEDIUM" | "WEAK" | "NONE";
  identityEvidence: string[];
  payloadIdentity?: PayloadArticleIdentityVerification;
  qualificationResult: "QUALIFIED" | "REJECTED";
  qualificationReason: FullTextAcquisitionOutcome;
  routeFingerprint: string;
  artifactFingerprint: string;
}

export interface FullTextQualificationInput {
  canonicalIdentity?: CanonicalStudyIdentityInput;
  payloadIdentity?: ManifestationIdentityInput;
  sourceTitle?: string | null;
  sourceDoi?: string | null;
  canonicalWorkId?: string | null;
  artifactTitle?: string | null;
  artifactAbstract?: string | null;
  artifactDoi?: string | null;
  artifactText: string;
  sections?: Array<{ heading?: string; text?: string }>;
  url?: string | null;
  contentType?: string | null;
  declaredMime?: string | null;
  detectedMime?: string | null;
  formatDetector?: string[];
  contentTypeMismatch?: boolean;
  magicBytes?: string | null;
  redirectChain?: string[];
  parserUsed?: string | null;
  parserVersion?: string | null;
  pageCount?: number | null;
  publicationVersion?: string | null;
  license?: string | null;
  isOpenAccess?: boolean | null;
  sourceProvider?: FullTextLocationCandidate["provider"];
  accessPath?: string[];
  landingUrl?: string | null;
  repositoryCopy?: boolean;
  hostType?: FullTextLocationCandidate["hostType"];
  httpStatus?: number;
  byteLength?: number;
  checksum?: string | null;
  retrievedAt?: string;
  initialOutcome?: FullTextAcquisitionOutcome | null;
  manifestationIdentityDecision?: StudyManifestation["identityDecision"] | null;
  manifestationIdentityConfidence?: number | null;
  manifestationIdentityEvidence?: StudyManifestation["identityEvidence"];
}

export interface FullTextQualificationResult {
  qualifyingFullText: boolean;
  outcome: FullTextAcquisitionOutcome;
  reason: string;
  identityMatch: FullTextArtifactIdentityV1["identityMatch"];
  structureMarkers: string[];
  artifact: FullTextArtifactIdentityV1;
}

export interface FullTextResolutionResult {
  schemaVersion: "researchforge-fulltext-resolution/v3";
  canonicalIdentity: string;
  locations: FullTextLocationCandidate[];
  candidates: OaRouteCandidate[];
  manifestations: StudyManifestation[];
  requests: FullTextResolverRequestAudit[];
  providerAvailability: OaProviderAvailability[];
  telemetryEvents: OaTelemetryEvent[];
  bounded: true;
}

export interface FullTextAccessAuditV3 {
  schemaVersion: "researchforge-fulltext-access-audit/v3";
  accessState: FullTextAccessStateV3;
  resolvedUrl?: string;
  contentType?: string;
  declaredMime?: string;
  detectedMime?: string;
  detectionMethod?: string[];
  contentTypeMismatch?: boolean;
  magicBytes?: string;
  redirectChain?: string[];
  landingResolutionTrace?: Array<{
    depth: number;
    fromUrl: string;
    toUrl?: string;
    signal: string;
    outcome: string;
  }>;
  contentLength: number;
  textDensity: number;
  sectionEvidence: string[];
  retrievedAt: string;
  accessPath: string[];
  checksum?: string;
  failureReason?: string;
  resolverRequests: FullTextResolverRequestAudit[];
  oaRouteCandidates?: OaRouteCandidate[];
  manifestations?: StudyManifestation[];
  providerAvailability?: OaProviderAvailability[];
  telemetryEvents?: OaTelemetryEvent[];
  acquisitionOutcome?: FullTextAcquisitionOutcome;
  qualifyingFullText?: boolean;
  qualificationReason?: string;
  artifact?: FullTextArtifactIdentityV1;
}

export interface FullTextResolutionInput {
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  arxivId?: string | null;
  canonicalWorkId?: string | null;
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  venue?: string | null;
  providerIds?: Record<string, string> | null;
  studyPopulation?: string | null;
  studyDesign?: string | null;
  runId?: string | null;
  caseId?: string | null;
  studyId?: string | null;
  url?: string | null;
  readableUrl?: string | null;
  fullTextUrl?: string | null;
  isOpenAccess?: boolean | null;
}

export interface FullTextResolutionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResolverRequests?: number;
  unpaywallEmail?: string | null;
  semanticScholarApiKey?: string | null;
  coreApiKey?: string | null;
  retryCount?: number;
  backoffMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface AccessClassificationInput {
  accessLevel: "full_text" | "abstract_only" | "metadata_only" | "blocked_or_paywalled" | "failed_extraction";
  extractionMethod?: string;
  extractionStatus?: string;
  warnings?: string[];
  resolvedUrl?: string;
  contentType?: string;
  declaredMime?: string;
  detectedMime?: string;
  detectionMethod?: string[];
  contentTypeMismatch?: boolean;
  magicBytes?: string;
  redirectChain?: string[];
  landingResolutionTrace?: FullTextAccessAuditV3["landingResolutionTrace"];
  contentLength?: number;
  text?: string;
  sections?: Array<{ heading?: string; text?: string }>;
  contentHash?: string;
  accessPath?: string[];
  resolverRequests?: FullTextResolverRequestAudit[];
  oaRouteCandidates?: OaRouteCandidate[];
  providerAvailability?: OaProviderAvailability[];
  telemetryEvents?: OaTelemetryEvent[];
  manifestations?: StudyManifestation[];
  retrievedAt?: string;
  failureReason?: string;
  acquisitionOutcome?: FullTextAcquisitionOutcome;
  qualification?: FullTextQualificationResult;
}

const USER_AGENT = "ReportFactoryAI/1.0 ResearchForgeFullTextResolver";
const providerCircuitState = new Map<
  FullTextLocationCandidate["provider"],
  { consecutiveTransientFailures: number; openUntil: number }
>();
const providerNextRequestAt = new Map<FullTextProvider, number>();
const REPOSITORY_HOST = /(?:^|\.)(?:ncbi\.nlm\.nih\.gov|ebi\.ac\.uk|europepmc\.org|core\.ac\.uk|arxiv\.org|biorxiv\.org|medrxiv\.org|zenodo\.org|figshare\.com|osf\.io|edu|gov)$/iu;
const OFFICIAL_PUBLIC_REPOSITORY_HOST = /(?:^|\.)(?:pmc\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov|ebi\.ac\.uk|europepmc\.org|arxiv\.org|biorxiv\.org|medrxiv\.org|zenodo\.org|figshare\.com|osf\.io)$/iu;
const ARTICLE_STRUCTURE = /(?:^|\b)(abstract|introduction|background|mechanisms?|methods?|materials?|participants?|results?|findings?|discussion|conclusions?|limitations?|study boundary|references?|tables?|figures?)(?:\b|$)/iu;
const SUBSTANTIVE_STRUCTURE = /(?:^|\b)(mechanisms?|methods?|materials?|participants?|results?|findings?|discussion|conclusions?|limitations?|study boundary)(?:\b|$)/iu;
const TRACKING_QUERY = /^(?:utm_.+|fbclid|gclid|mc_cid|mc_eid|ref|source)$/iu;

function clean(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function normalizeDoi(value: string | null | undefined): string {
  return clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").replace(/^doi:\s*/iu, "").toLocaleLowerCase();
}

function titleTokens(value: string | null | undefined): string[] {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((token) => token.length >= 3);
}

function titleSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.min(leftTokens.size, rightTokens.size);
}

function doiFromText(value: string): string {
  return normalizeDoi(value.match(/\b10\.\d{4,9}\/[-._;()/:\p{L}\p{N}]+/iu)?.[0]);
}

function arxivPdfUrl(value: string): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/(?:^|\.)arxiv\.org$/iu.test(parsed.hostname)) return null;
    const id = parsed.pathname.match(/^\/(?:abs|html|pdf)\/([^/?#]+?)(?:\.pdf)?$/iu)?.[1];
    return id ? `https://arxiv.org/pdf/${id}.pdf` : null;
  } catch {
    return null;
  }
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function canonicalRouteUrl(value: string): string {
  const url = safeUrl(value);
  if (!url) return clean(value);
  const normalized = new URL(url);
  normalized.protocol = normalized.protocol.toLocaleLowerCase();
  normalized.hostname = normalized.hostname.toLocaleLowerCase().replace(/^www\./iu, "");
  normalized.hash = "";
  for (const key of [...normalized.searchParams.keys()]) {
    if (TRACKING_QUERY.test(key)) normalized.searchParams.delete(key);
  }
  normalized.searchParams.sort();
  if (normalized.pathname !== "/") normalized.pathname = normalized.pathname.replace(/\/+$/u, "");
  return normalized.toString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function routeFingerprint(value: string): string {
  return sha256(canonicalRouteUrl(value));
}

function officialPublicRepositoryUrl(value: string): boolean {
  const url = safeUrl(value);
  if (!url) return false;
  return OFFICIAL_PUBLIC_REPOSITORY_HOST.test(new URL(url).hostname.replace(/^www\./iu, ""));
}

function artifactVersionType(input: {
  version?: string | null;
  repositoryCopy?: boolean;
}): FullTextArtifactVersionType {
  const version = clean(input.version).toLocaleLowerCase();
  if (/version of record|publishedversion|published version|\bvor\b/iu.test(version)) return "VERSION_OF_RECORD";
  if (/accepted/iu.test(version)) return "ACCEPTED_MANUSCRIPT";
  if (/submitted|preprint/iu.test(version)) return "PREPRINT";
  if (input.repositoryCopy || /repository[_ ]copy/iu.test(version)) return "REPOSITORY_COPY";
  return "UNKNOWN_VERSION";
}

function manifestationVersionType(value: FullTextArtifactVersionType): StudyManifestationVersionType {
  if (value === "VERSION_OF_RECORD") return "VERSION_OF_RECORD";
  if (value === "ACCEPTED_MANUSCRIPT") return "AUTHOR_ACCEPTED_MANUSCRIPT";
  if (value === "PREPRINT") return "PREPRINT";
  if (value === "REPOSITORY_COPY") return "REPOSITORY_COPY";
  return "UNKNOWN_VERSION";
}

function routeType(location: FullTextLocationCandidate): OaRouteCandidate["routeType"] {
  const hint = clean(location.contentTypeHint).toLocaleLowerCase();
  if (/jats|xml/iu.test(hint)) return "STRUCTURED_FULL_TEXT";
  if (/pdf/iu.test(hint) || /\.pdf(?:[?#]|$)/iu.test(location.url)) return "DIRECT_PDF";
  if (/html/iu.test(hint) && location.isOpenAccess === true) return "FULL_TEXT_HTML";
  if (location.provider === "doi_resolver") return "DOI_RESOLVER";
  return "LANDING_PAGE";
}

function toOaRouteCandidate(
  location: FullTextLocationCandidate,
  identity: { canonicalWorkId: string; doi?: string },
): OaRouteCandidate {
  return {
    studyIdentity: identity,
    provider: location.provider,
    routeType: routeType(location),
    url: location.url,
    ...(location.landingUrl ? { landingUrl: location.landingUrl } : {}),
    declaredOaStatus: location.isOpenAccess === true ? "OPEN" : location.isOpenAccess === false ? "CLOSED" : "UNKNOWN",
    ...(clean(location.license) ? { declaredLicense: clean(location.license) } : {}),
    ...(clean(location.contentTypeHint) ? { formatHint: clean(location.contentTypeHint) } : {}),
    artifactVersionType: artifactVersionType(location),
    ...(location.repositoryIdentifier ? { repositoryIdentifier: location.repositoryIdentifier } : {}),
    hostType: location.hostType ?? (location.repositoryCopy ? "repository" : "unknown"),
    sourceMetadata: location.sourceMetadata ?? {},
    discoveredAt: location.discoveredAt ?? new Date().toISOString(),
    confidence: location.confidence ?? (location.isOpenAccess === true ? "HIGH" : "LOW"),
    routeFingerprint: location.routeFingerprint ?? routeFingerprint(location.url),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function repositoryCopy(url: string): boolean {
  try {
    return REPOSITORY_HOST.test(new URL(url).hostname.replace(/^www\./iu, ""));
  } catch {
    return false;
  }
}

function addLocation(output: FullTextLocationCandidate[], input: Omit<FullTextLocationCandidate, "repositoryCopy">): void {
  const url = safeUrl(input.url);
  if (!url) return;
  const isRepositoryCopy = repositoryCopy(url);
  output.push({
    ...input,
    url,
    repositoryCopy: isRepositoryCopy,
    routeFingerprint: input.routeFingerprint ?? routeFingerprint(url),
    hostType: input.hostType ?? (isRepositoryCopy ? "repository" : "unknown"),
    discoveredAt: input.discoveredAt ?? new Date().toISOString(),
  });
}

function routeRank(location: FullTextLocationCandidate): number {
  const hint = clean(location.contentTypeHint).toLocaleLowerCase();
  const version = clean(location.version).toLocaleLowerCase();
  if (location.provider === "existing_payload" && hint.includes("pdf")) return 0;
  if (location.provider === "europe_pmc" && /xml|jats/iu.test(hint)) return 1;
  if (location.repositoryCopy && hint.includes("pdf")) return 2;
  if (location.provider === "arxiv" && hint.includes("pdf")) return 3;
  if (location.isOpenAccess && hint.includes("pdf")) return 4;
  if (location.isOpenAccess && /html|xml/iu.test(hint)) return 5;
  if (/version of record|publishedversion|vor/iu.test(version)) return 6;
  if (location.repositoryCopy) return 7;
  if (location.provider === "doi_resolver") return 99;
  return 20;
}

export function planLegalFullTextRoutes(
  locations: FullTextLocationCandidate[],
): FullTextLocationCandidate[] {
  const byUrl = new Map<string, FullTextLocationCandidate>();
  for (const location of locations) {
    const url = safeUrl(location.url);
    if (!url) continue;
    const key = canonicalRouteUrl(url);
    const candidate = {
      ...location,
      url,
      routePriority: routeRank(location),
      routeFingerprint: location.routeFingerprint ?? routeFingerprint(url),
    };
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, candidate);
      continue;
    }
    const evidenceRank = (item: FullTextLocationCandidate): number =>
      item.isOpenAccess === true && item.provider !== "existing_payload" ? 0
        : clean(item.license) ? 1
          : item.isOpenAccess === true ? 2
            : item.repositoryCopy ? 3
              : item.isOpenAccess === null ? 4 : 5;
    const preferred = evidenceRank(candidate) < evidenceRank(existing) ||
        (evidenceRank(candidate) === evidenceRank(existing) && routeRank(candidate) < routeRank(existing))
      ? candidate
      : existing;
    const alternate = preferred === candidate ? existing : candidate;
    byUrl.set(key, {
      ...alternate,
      ...preferred,
      isOpenAccess: preferred.isOpenAccess === true || alternate.isOpenAccess === true
        ? true
        : preferred.isOpenAccess === false && alternate.isOpenAccess === false ? false : null,
      license: clean(preferred.license) || clean(alternate.license) || undefined,
      landingUrl: preferred.landingUrl ?? alternate.landingUrl,
      sourceMetadata: { ...(alternate.sourceMetadata ?? {}), ...(preferred.sourceMetadata ?? {}) },
      accessPath: uniqueStrings([...preferred.accessPath, ...alternate.accessPath]),
      routeFingerprint: routeFingerprint(url),
    });
  }
  return [...byUrl.values()].sort((left, right) =>
    routeRank(left) - routeRank(right) ||
    left.provider.localeCompare(right.provider) ||
    left.url.localeCompare(right.url)
  );
}

function acquisitionOutcomeForHttp(status: number): FullTextAcquisitionOutcome {
  if (status === 401) return "HTTP_401";
  if (status === 403) return "HTTP_403";
  if (status === 404 || status === 410) return "HTTP_404";
  if (status === 429) return "HTTP_429";
  if (status >= 500) return "PROVIDER_SERVER_ERROR";
  return "OA_LOOKUP_MISS";
}

export function classifyFullTextRetry(input: {
  status?: number | null;
  failure?: "TIMEOUT" | "CONNECTION_RESET" | "NETWORK_ERROR" | "PAYWALL" | "AUTH_REQUIRED" | "INVALID_CONTENT" | "POLICY_BLOCKED" | null;
}): "RETRYABLE" | "NOT_RETRYABLE" | "UNKNOWN" {
  if (["TIMEOUT", "CONNECTION_RESET", "NETWORK_ERROR"].includes(input.failure ?? "")) return "RETRYABLE";
  if (["PAYWALL", "AUTH_REQUIRED", "INVALID_CONTENT", "POLICY_BLOCKED"].includes(input.failure ?? "")) return "NOT_RETRYABLE";
  const status = Number(input.status ?? 0);
  if ([0, 408, 425, 429, 500, 502, 503, 504].includes(status)) return "RETRYABLE";
  if ([401, 403, 404, 410, 451].includes(status)) return "NOT_RETRYABLE";
  if (status >= 200 && status < 400) return "NOT_RETRYABLE";
  return "UNKNOWN";
}

function transientHttpStatus(status: number): boolean {
  return classifyFullTextRetry({ status }) === "RETRYABLE";
}

function providerCircuitIsOpen(provider: FullTextLocationCandidate["provider"], now: number): boolean {
  const state = providerCircuitState.get(provider);
  if (!state) return false;
  if (state.openUntil > now) return true;
  if (state.openUntil > 0) providerCircuitState.delete(provider);
  return false;
}

function recordProviderResult(
  provider: FullTextLocationCandidate["provider"],
  transientFailure: boolean,
  now: number,
): void {
  if (!transientFailure) {
    providerCircuitState.delete(provider);
    return;
  }
  const failures = (providerCircuitState.get(provider)?.consecutiveTransientFailures ?? 0) + 1;
  const profile = FULL_TEXT_PROVIDER_PROFILES[provider];
  providerCircuitState.set(provider, {
    consecutiveTransientFailures: failures,
    openUntil: failures >= profile.circuitThreshold
      ? now + profile.cooldownMs
      : 0,
  });
}

export function resetFullTextProviderCircuitStateForTests(): void {
  providerCircuitState.clear();
  providerNextRequestAt.clear();
}

async function waitForProviderRateSlot(
  provider: FullTextProvider,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<void> {
  const interval = FULL_TEXT_PROVIDER_PROFILES[provider].minIntervalMs;
  if (interval <= 0) return;
  const now = Date.now();
  const reservedAt = Math.max(now, providerNextRequestAt.get(provider) ?? now);
  providerNextRequestAt.set(provider, reservedAt + interval);
  if (reservedAt > now) await sleepImpl(reservedAt - now);
}

async function jsonRequest(
  provider: FullTextLocationCandidate["provider"],
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  requests: FullTextResolverRequestAudit[],
  options: {
    maxAttempts: number;
    backoffMs: number;
    sleepImpl: (ms: number) => Promise<void>;
    headers?: Record<string, string>;
  },
): Promise<Record<string, unknown> | null> {
  if (providerCircuitIsOpen(provider, Date.now())) {
    requests.push({
      provider,
      url,
      status: 0,
      ok: false,
      attemptedAt: new Date().toISOString(),
      attempt: requests.length + 1,
      result: "CIRCUIT_OPEN",
      latencyMs: 0,
      retryEligibility: "NOT_RETRYABLE",
      artifactCreated: false,
      legalAccess: true,
      phase: "RESOLUTION",
      acquisitionOutcome: "PROVIDER_CIRCUIT_OPEN",
      failureClass: "CIRCUIT_OPEN",
      failureReason: "PROVIDER_CIRCUIT_OPEN",
      circuitState: "OPEN",
    });
    return null;
  }
  for (let providerAttempt = 1; providerAttempt <= options.maxAttempts; providerAttempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const attemptedAt = new Date().toISOString();
    const startedAt = Date.now();
    const attempt = requests.length + 1;
    try {
      if (fetchImpl === fetch) await waitForProviderRateSlot(provider, options.sleepImpl);
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...(options.headers ?? {}) },
      });
      const result = response.ok
        ? "SUCCESS"
        : [404, 410].includes(response.status)
          ? "NOT_FOUND"
          : [401, 403, 451].includes(response.status)
            ? "ACCESS_DENIED"
            : response.status === 429
              ? "RATE_LIMITED"
              : response.status >= 500
                ? "SERVER_ERROR"
                : "INVALID_RESPONSE";
      const retryable = transientHttpStatus(response.status);
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader && /^\d+(?:\.\d+)?$/u.test(retryAfterHeader.trim())
        ? Number(retryAfterHeader)
        : null;
      const retryAfterMs = retryAfterSeconds === null
        ? 0
        : Math.max(0, Math.min(60_000, Math.round(retryAfterSeconds * 1_000)));
      requests.push({
        provider,
        url,
        status: response.status,
        ok: response.ok,
        attemptedAt,
        attempt,
        result,
        latencyMs: Math.max(0, Date.now() - startedAt),
        retryEligibility: retryable ? "RETRYABLE" : "NOT_RETRYABLE",
        artifactCreated: false,
        legalAccess: true,
        phase: "RESOLUTION",
        acquisitionOutcome: response.ok ? "OA_LOOKUP_SUCCESS" : acquisitionOutcomeForHttp(response.status),
        contentType: response.headers.get("content-type") ?? undefined,
        resolvedUrl: response.url || url,
        ...(retryAfterMs > 0 ? { retryAfterMs } : {}),
        circuitState: "CLOSED",
        ...(!response.ok ? { failureClass: result, failureReason: `HTTP_${response.status}` } : {}),
      });
      recordProviderResult(provider, !response.ok && retryable, Date.now());
      if (response.ok) return record(await response.json());
      if (!retryable || providerAttempt >= options.maxAttempts) return null;
      if (providerCircuitIsOpen(provider, Date.now())) return null;
      await options.sleepImpl(Math.max(retryAfterMs, options.backoffMs * 2 ** (providerAttempt - 1)));
      continue;
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      requests.push({
        provider,
        url,
        status: 0,
        ok: false,
        attemptedAt,
        attempt,
        result: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        latencyMs: Math.max(0, Date.now() - startedAt),
        retryEligibility: "RETRYABLE",
        artifactCreated: false,
        legalAccess: true,
        phase: "RESOLUTION",
        acquisitionOutcome: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_NETWORK_ERROR",
        failureClass: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        failureReason: timedOut ? "TIMEOUT" : "NETWORK_ERROR",
        circuitState: "CLOSED",
      });
      recordProviderResult(provider, true, Date.now());
      if (providerAttempt >= options.maxAttempts) return null;
      if (providerCircuitIsOpen(provider, Date.now())) return null;
    } finally {
      clearTimeout(timeout);
    }
    await options.sleepImpl(options.backoffMs * 2 ** (providerAttempt - 1));
  }
  return null;
}

function openAlexLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[]): void {
  const rawLocations = [payload.best_oa_location, ...list(payload.locations)];
  const openAccess = record(payload.open_access);
  const workOpenAccess = openAccess.is_oa;
  const workDoi = normalizeDoi(payload.doi as string | undefined);
  const workId = clean(payload.id as string | undefined);
  const workTitle = clean(payload.title as string | undefined);
  for (const raw of rawLocations) {
    const location = record(raw);
    const source = record(location.source);
    const license = clean(location.license as string | undefined) || undefined;
    const landingUrl = safeUrl(location.landing_page_url) ?? undefined;
    const sourceType = clean(source.type as string | undefined).toLocaleLowerCase();
    for (const value of [location.pdf_url, location.landing_page_url]) {
      const url = safeUrl(value);
      if (!url) continue;
      addLocation(output, {
        url,
        provider: "openalex",
        accessPath: ["DOI", "OpenAlex", url],
        isOpenAccess: typeof location.is_oa === "boolean"
          ? location.is_oa
          : typeof workOpenAccess === "boolean"
            ? workOpenAccess
            : null,
        ...(license ? { license } : {}),
        ...(clean(location.version as string | undefined) ? { version: clean(location.version as string) } : {}),
        ...(landingUrl ? { landingUrl } : {}),
        ...(clean(openAccess.oa_status as string | undefined) ? { declaredOaStatus: clean(openAccess.oa_status as string) } : {}),
        hostType: sourceType === "repository" ? "repository" : sourceType === "journal" ? "publisher" : "unknown",
        ...(clean(source.id as string | undefined) ? { repositoryIdentifier: clean(source.id as string) } : {}),
        sourceMetadata: {
          sourceId: clean(source.id as string | undefined) || null,
          sourceName: clean(source.display_name as string | undefined) || null,
          sourceType: sourceType || null,
          openAlexWorkId: clean(payload.id as string | undefined) || null,
        },
        manifestationIdentity: {
          doi: workDoi,
          title: workTitle,
          providerIds: workId ? { openalex: workId } : {},
          sourceRecordId: workId || workDoi,
          officialRepositoryIdentifier: clean(source.id as string | undefined) || null,
        },
        confidence: typeof location.is_oa === "boolean" ? "HIGH" : "MEDIUM",
        ...(url.toLocaleLowerCase().includes(".pdf") ? { contentTypeHint: "application/pdf" } : {}),
      });
    }
  }
}

function crossrefLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[]): void {
  const message = record(payload.message);
  const messageDoi = normalizeDoi(message.DOI as string | undefined);
  const messageTitle = clean(list(message.title)[0] as string | undefined);
  const messageAuthors = list(message.author).map((value) => {
    const author = record(value);
    return clean(`${clean(author.given as string | undefined)} ${clean(author.family as string | undefined)}`);
  }).filter(Boolean);
  const dateParts = list(record(message.published)["date-parts"])[0];
  const messageYear = Number(Array.isArray(dateParts) ? dateParts[0] : 0) || undefined;
  const relationEntries: StudyIdentityRelation[] = [];
  for (const [relationType, rawItems] of Object.entries(record(message.relation))) {
    for (const rawItem of list(rawItems)) {
      const item = record(rawItem);
      const related = clean(item.id as string | undefined);
      if (!related || !messageDoi) continue;
      relationEntries.push({
        relationType,
        canonicalIdentifier: messageDoi,
        manifestationIdentifier: related,
        provider: "crossref",
      });
    }
  }
  const licenses = list(message.license).map(record);
  const openLicense = licenses.find((entry) => /^https?:\/\/(?:creativecommons\.org|creativecommons\.org\/publicdomain|opensource\.org)\//iu.test(clean(entry.URL as string | undefined)));
  const license = clean(openLicense?.URL as string | undefined) || undefined;
  const primaryUrl = safeUrl(record(message.resource).primary && record(record(message.resource).primary).URL);
  for (const raw of list(message.link)) {
    const link = record(raw);
    const url = safeUrl(link.URL);
    if (!url) continue;
    const contentType = clean(link["content-type"] as string | undefined) || undefined;
    addLocation(output, {
      url,
      provider: "crossref",
      accessPath: ["DOI", "Crossref", url],
      isOpenAccess: license ? true : null,
      ...(license ? { license } : {}),
      ...(contentType ? { contentTypeHint: contentType } : {}),
      ...(clean(link["content-version"] as string | undefined) ? { version: clean(link["content-version"] as string) } : {}),
      ...(primaryUrl ? { landingUrl: primaryUrl } : {}),
      hostType: "publisher",
      sourceMetadata: {
        intendedApplication: clean(link["intended-application"] as string | undefined) || null,
        crossrefResourceUrl: primaryUrl ?? null,
      },
      manifestationIdentity: {
        doi: messageDoi,
        title: messageTitle,
        authors: messageAuthors,
        year: messageYear,
        sourceRecordId: messageDoi,
        relations: relationEntries,
      },
      identityRelations: relationEntries,
      confidence: license ? "HIGH" : "LOW",
    });
  }
  if (primaryUrl && license) {
    addLocation(output, {
      url: primaryUrl,
      provider: "crossref",
      accessPath: ["DOI", "Crossref", "licensed_resource", primaryUrl],
      isOpenAccess: true,
      license,
      landingUrl: primaryUrl,
      hostType: "publisher",
      contentTypeHint: "text/html",
      sourceMetadata: { crossrefLicensedResource: true },
      manifestationIdentity: {
        doi: messageDoi,
        title: messageTitle,
        authors: messageAuthors,
        year: messageYear,
        sourceRecordId: messageDoi,
        relations: relationEntries,
      },
      identityRelations: relationEntries,
      confidence: "HIGH",
    });
  }
}

function dataciteLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[], targetDoi: string): void {
  const data = record(payload.data);
  const attributes = record(data.attributes);
  const doi = normalizeDoi((attributes.doi ?? data.id) as string | undefined);
  if (doi && doi !== targetDoi) return;
  const title = clean(record(list(attributes.titles)[0]).title as string | undefined);
  const authors = list(attributes.creators).map((value) => clean(record(value).name as string | undefined)).filter(Boolean);
  const year = Number(attributes.publicationYear ?? 0) || undefined;
  const rights = list(attributes.rightsList).map(record);
  const openRight = rights.find((right) => /creative\s*commons|\bcc[- ]?(?:by|zero)|public domain|open access/iu.test(
    `${clean(right.rights as string | undefined)} ${clean(right.rightsUri as string | undefined)}`,
  ));
  const license = clean(openRight?.rightsUri as string | undefined) || clean(openRight?.rights as string | undefined) || undefined;
  const relations: StudyIdentityRelation[] = [];
  for (const value of list(attributes.relatedIdentifiers)) {
    const related = record(value);
    const relatedIdentifier = clean(related.relatedIdentifier as string | undefined);
    const relationType = clean(related.relationType as string | undefined);
    if (!relatedIdentifier || !relationType || !targetDoi) continue;
    relations.push({
      relationType,
      canonicalIdentifier: targetDoi,
      manifestationIdentifier: relatedIdentifier,
      provider: "datacite",
    });
    const relatedType = clean(related.relatedIdentifierType as string | undefined).toLocaleUpperCase();
    const relatedUrl = relatedType === "DOI"
      ? `https://doi.org/${normalizeDoi(relatedIdentifier) ?? relatedIdentifier}`
      : safeUrl(relatedIdentifier);
    if (!relatedUrl) continue;
    const relatedIsRepository = repositoryCopy(relatedUrl);
    if (!relatedIsRepository && !license) continue;
    addLocation(output, {
      url: relatedUrl,
      provider: "datacite",
      accessPath: ["DOI", "DataCite", relationType, relatedIdentifier],
      isOpenAccess: relatedIsRepository || Boolean(license),
      ...(license ? { license } : {}),
      version: /preprint/iu.test(relationType) ? "preprint" : "repository_copy",
      hostType: relatedIsRepository ? "repository" : "unknown",
      sourceMetadata: {
        dataciteRecordId: clean(data.id as string | undefined) || targetDoi,
        relatedIdentifier,
        relationType,
      },
      manifestationIdentity: {
        doi: relatedType === "DOI" ? normalizeDoi(relatedIdentifier) : null,
        title,
        authors,
        year,
        sourceRecordId: relatedIdentifier,
        relations,
        officialRepositoryIdentifier: relatedIsRepository ? relatedIdentifier : null,
        documentType: clean(record(attributes.types).resourceTypeGeneral as string | undefined),
      },
      identityRelations: relations,
      confidence: "HIGH",
    });
  }
  const primaryUrl = safeUrl(attributes.url);
  const contentUrls = list(attributes.contentUrl).map(safeUrl).filter((value): value is string => Boolean(value));
  for (const url of [...contentUrls, ...(primaryUrl ? [primaryUrl] : [])]) {
    const isRepository = repositoryCopy(url);
    if (!isRepository && !license) continue;
    addLocation(output, {
      url,
      provider: "datacite",
      accessPath: ["DOI", "DataCite", contentUrls.includes(url) ? "contentUrl" : "url", url],
      isOpenAccess: isRepository || Boolean(license),
      ...(license ? { license } : {}),
      version: isRepository ? "repository_copy" : "unknown",
      hostType: isRepository ? "repository" : "unknown",
      sourceMetadata: { dataciteRecordId: clean(data.id as string | undefined) || targetDoi },
      manifestationIdentity: {
        doi: doi || targetDoi,
        title,
        authors,
        year,
        sourceRecordId: clean(data.id as string | undefined) || targetDoi,
        relations,
        officialRepositoryIdentifier: isRepository ? clean(data.id as string | undefined) || targetDoi : null,
        documentType: clean(record(attributes.types).resourceTypeGeneral as string | undefined),
      },
      identityRelations: relations,
      confidence: "HIGH",
      ...(url.toLocaleLowerCase().includes(".pdf") ? { contentTypeHint: "application/pdf" } : {}),
    });
  }
}

function europePmcLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[], targetDoi: string): void {
  const results = list(record(payload.resultList).result).map(record);
  for (const result of results) {
    const resultDoi = normalizeDoi(result.doi as string | undefined);
    if (resultDoi && resultDoi !== targetDoi) continue;
    const pmcid = clean(result.pmcid as string | undefined).toLocaleUpperCase();
    if (!pmcid || result.inEPMC === "N" || result.isOpenAccess !== "Y") continue;
    const license = clean(result.license as string | undefined) || undefined;
    const landingUrl = `https://europepmc.org/articles/${encodeURIComponent(pmcid)}`;
    const common = {
      provider: "europe_pmc" as const,
      isOpenAccess: true,
      version: "repository_copy",
      landingUrl,
      hostType: "repository" as const,
      repositoryIdentifier: pmcid,
      sourceMetadata: {
        pmcid,
        pmid: clean(result.pmid as string | undefined) || null,
        doi: resultDoi || null,
        title: clean(result.title as string | undefined) || null,
      },
      manifestationIdentity: {
        doi: resultDoi || targetDoi,
        pmid: clean(result.pmid as string | undefined) || null,
        pmcid,
        title: clean(result.title as string | undefined) || null,
        sourceRecordId: pmcid,
        officialRepositoryIdentifier: pmcid,
      },
      confidence: "HIGH" as const,
      ...(license ? { license } : {}),
    };
    addLocation(output, {
      ...common,
      url: `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(pmcid)}/fullTextXML`,
      accessPath: ["DOI", "Europe PMC", pmcid, "JATS_XML"],
      contentTypeHint: "application/xml+jats",
    });
    for (const rawUrl of list(record(result.fullTextUrlList).fullTextUrl)) {
      const fullText = record(rawUrl);
      if (clean(fullText.availabilityCode as string | undefined).toLocaleUpperCase() !== "OA") continue;
      const url = safeUrl(fullText.url);
      if (!url) continue;
      const style = clean(fullText.documentStyle as string | undefined).toLocaleLowerCase();
      addLocation(output, {
        ...common,
        url,
        accessPath: ["DOI", "Europe PMC", pmcid, style || "FULL_TEXT"],
        contentTypeHint: style === "pdf" ? "application/pdf" : style === "html" ? "text/html" : undefined,
        sourceMetadata: {
          ...common.sourceMetadata,
          externalSite: clean(fullText.site as string | undefined) || null,
        },
      });
    }
  }
}

function unpaywallLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[], targetDoi: string): void {
  for (const raw of [payload.best_oa_location, ...list(payload.oa_locations)]) {
    const location = record(raw);
    for (const value of [location.url_for_pdf, location.url_for_landing_page]) {
      const url = safeUrl(value);
      if (!url) continue;
      addLocation(output, {
        url,
        provider: "unpaywall",
        accessPath: ["DOI", "Unpaywall", url],
        isOpenAccess: true,
        ...(clean(location.license as string | undefined) ? { license: clean(location.license as string) } : {}),
        ...(clean(location.version as string | undefined) ? { version: clean(location.version as string) } : {}),
        ...(safeUrl(location.url_for_landing_page) ? { landingUrl: safeUrl(location.url_for_landing_page)! } : {}),
        hostType: clean(location.host_type as string | undefined).toLocaleLowerCase() === "repository" ? "repository" : "publisher",
        sourceMetadata: {
          hostType: clean(location.host_type as string | undefined) || null,
          evidence: clean(location.evidence as string | undefined) || null,
        },
        manifestationIdentity: {
          doi: normalizeDoi(payload.doi as string | undefined) || targetDoi,
          title: clean(payload.title as string | undefined) || null,
          sourceRecordId: normalizeDoi(payload.doi as string | undefined) || targetDoi,
          officialRepositoryIdentifier: clean(location.host_type as string | undefined).toLocaleLowerCase() === "repository"
            ? url
            : null,
        },
        confidence: "HIGH",
        ...(url.toLocaleLowerCase().includes(".pdf") ? { contentTypeHint: "application/pdf" } : {}),
      });
    }
  }
}

function doajLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[], targetDoi: string): void {
  for (const rawResult of list(payload.results)) {
    const result = record(rawResult);
    const bibjson = record(result.bibjson);
    const identifiers = list(bibjson.identifier).map(record);
    const doi = identifiers.find((identifier) => clean(identifier.type as string | undefined).toLocaleLowerCase() === "doi");
    if (normalizeDoi(doi?.id as string | undefined) !== targetDoi) continue;
    const title = clean(bibjson.title as string | undefined);
    for (const rawLink of list(bibjson.link)) {
      const link = record(rawLink);
      if (clean(link.type as string | undefined).toLocaleLowerCase() !== "fulltext") continue;
      const url = safeUrl(link.url);
      if (!url) continue;
      const contentType = clean(link.content_type as string | undefined).toLocaleLowerCase();
      const explicitPdfUrl = /(?:\.pdf(?:[?#]|$)|\/pdf(?:[/?#]|$))/iu.test(url);
      addLocation(output, {
        url,
        provider: "doaj",
        accessPath: ["DOI", "DOAJ", url],
        isOpenAccess: true,
        version: "version of record",
        hostType: "publisher",
        // DOAJ records sometimes label an article landing URL as `pdf`. Preserve
        // that provider claim in metadata, but only rank a syntactically direct
        // PDF route as DIRECT_PDF before the acquisition response is inspected.
        contentTypeHint: contentType === "pdf" && explicitPdfUrl
          ? "application/pdf"
          : contentType === "html"
            ? "text/html"
            : undefined,
        sourceMetadata: {
          doajArticleId: clean(result.id as string | undefined) || null,
          title: title || null,
          declaredContentType: contentType || null,
        },
        manifestationIdentity: {
          doi: targetDoi,
          title: title || null,
          sourceRecordId: clean(result.id as string | undefined) || targetDoi,
        },
        confidence: "HIGH",
      });
    }
  }
}

function semanticScholarLocations(payload: Record<string, unknown>, output: FullTextLocationCandidate[], targetDoi: string): void {
  const identifiers = record(payload.externalIds);
  if (normalizeDoi(identifiers.DOI as string | undefined) !== targetDoi) return;
  const openAccessPdf = record(payload.openAccessPdf);
  const url = safeUrl(openAccessPdf.url);
  if (!url) return;
  addLocation(output, {
    url,
    provider: "semantic_scholar",
    accessPath: ["DOI", "Semantic Scholar", "openAccessPdf", url],
    isOpenAccess: true,
    version: clean(openAccessPdf.status as string | undefined) || "unknown",
    contentTypeHint: "application/pdf",
    sourceMetadata: {
      paperId: clean(payload.paperId as string | undefined) || null,
      title: clean(payload.title as string | undefined) || null,
      status: clean(openAccessPdf.status as string | undefined) || null,
    },
    manifestationIdentity: {
      doi: targetDoi,
      providerIds: clean(payload.paperId as string | undefined) ? { semanticScholar: clean(payload.paperId as string) } : {},
      title: clean(payload.title as string | undefined) || null,
      authors: list(payload.authors).map((value) => clean(record(value).name as string | undefined)).filter(Boolean),
      year: Number(payload.year ?? 0) || null,
      sourceRecordId: clean(payload.paperId as string | undefined) || targetDoi,
      officialRepositoryIdentifier: repositoryCopy(url) ? url : null,
      documentType: list(payload.publicationTypes).map((value) => clean(value as string)).filter(Boolean).join("|"),
    },
    confidence: "HIGH",
  });
}

function buildResolutionTelemetry(input: FullTextResolutionInput, result: {
  locations: FullTextLocationCandidate[];
  requests: FullTextResolverRequestAudit[];
}): OaTelemetryEvent[] {
  const runId = clean(input.runId) || "UNKNOWN_RUN";
  const caseId = clean(input.caseId) || "UNKNOWN_CASE";
  const studyId = clean(input.studyId) || normalizeDoi(input.doi) || clean(input.canonicalWorkId) || clean(input.title) || "UNKNOWN_STUDY";
  const startedAt = result.requests[0]?.attemptedAt ?? result.locations[0]?.discoveredAt ?? new Date().toISOString();
  const events: OaTelemetryEvent[] = [{
    event: "OA_DISCOVERY_STARTED",
    runId,
    caseId,
    studyId,
    provider: "existing_payload",
    routeType: "DISCOVERY",
    reasonCode: "STARTED",
    elapsedMs: 0,
    retryCount: 0,
    at: startedAt,
  }];
  const providerCounts = new Map<FullTextProvider, number>();
  for (const request of result.requests) {
    const retryCount = providerCounts.get(request.provider) ?? 0;
    providerCounts.set(request.provider, retryCount + 1);
    events.push({
      event: "OA_PROVIDER_QUERY_STARTED",
      runId,
      caseId,
      studyId,
      provider: request.provider,
      routeType: "PROVIDER_METADATA_DISCOVERY",
      reasonCode: "QUERY_STARTED",
      elapsedMs: 0,
      retryCount,
      at: request.attemptedAt,
    });
    events.push({
      event: request.ok ? "OA_PROVIDER_QUERY_SUCCEEDED" : "OA_PROVIDER_QUERY_FAILED",
      runId,
      caseId,
      studyId,
      provider: request.provider,
      routeType: "PROVIDER_METADATA_DISCOVERY",
      reasonCode: request.failureReason ?? request.acquisitionOutcome ?? request.result,
      elapsedMs: request.latencyMs,
      retryCount,
      at: request.attemptedAt,
    });
  }
  for (const location of result.locations) {
    events.push({
      event: "OA_ROUTE_DISCOVERED",
      runId,
      caseId,
      studyId,
      provider: location.provider,
      routeType: routeType(location),
      reasonCode: location.isOpenAccess === true ? "DECLARED_OA" : "CANDIDATE_ONLY",
      elapsedMs: 0,
      retryCount: 0,
      at: location.discoveredAt ?? startedAt,
    });
    events.push({
      event: "OA_ROUTE_RANKED",
      runId,
      caseId,
      studyId,
      provider: location.provider,
      routeType: routeType(location),
      reasonCode: `RANK_${location.routePriority ?? routeRank(location)}`,
      elapsedMs: 0,
      retryCount: 0,
      at: location.discoveredAt ?? startedAt,
    });
  }
  return events;
}

function finalizeResolution(input: FullTextResolutionInput, value: {
  canonicalIdentity: string;
  locations: FullTextLocationCandidate[];
  requests: FullTextResolverRequestAudit[];
  providerAvailability: OaProviderAvailability[];
}): FullTextResolutionResult {
  const locations = planLegalFullTextRoutes(value.locations);
  const identity = {
    canonicalWorkId: value.canonicalIdentity,
    ...(normalizeDoi(input.doi) ? { doi: normalizeDoi(input.doi)! } : {}),
  };
  const runId = clean(input.runId) || "UNKNOWN_RUN";
  const canonicalStudyId = value.canonicalIdentity;
  const manifestations = dedupeStudyManifestations(locations.map((location, index) => {
    const artifactVersion = artifactVersionType(location);
    const identityInput: ManifestationIdentityInput = {
      ...(location.manifestationIdentity ?? {}),
      relations: location.identityRelations ?? location.manifestationIdentity?.relations ?? [],
    };
    return createStudyManifestation({
      canonical: {
        canonicalStudyId,
        doi: input.doi,
        pmid: input.pmid,
        pmcid: input.pmcid,
        arxivId: input.arxivId,
        providerIds: input.providerIds,
        title: input.title,
        authors: input.authors,
        year: input.year,
        venue: input.venue,
        studyPopulation: input.studyPopulation,
        studyDesign: input.studyDesign,
      },
      manifestationIdentity: identityInput,
      provider: location.provider,
      sourceRecordId: identityInput.sourceRecordId ?? location.repositoryIdentifier ?? location.routeFingerprint,
      sourceUrl: location.url,
      landingUrl: location.landingUrl,
      artifactUrl: routeType(location) === "LANDING_PAGE" || routeType(location) === "DOI_RESOLVER"
        ? null
        : location.url,
      formatHint: location.contentTypeHint,
      versionType: manifestationVersionType(artifactVersion),
      isOpenAccess: location.isOpenAccess,
      license: location.license,
      hostType: location.hostType,
      accessPath: location.accessPath,
      routeFingerprint: location.routeFingerprint,
      providerMetadata: location.sourceMetadata,
      attemptId: `attempt:${runId}:${index + 1}`,
      runId,
    });
  }));
  return {
    schemaVersion: "researchforge-fulltext-resolution/v3",
    canonicalIdentity: value.canonicalIdentity,
    locations,
    candidates: locations.map((location) => toOaRouteCandidate(location, identity)),
    manifestations,
    requests: value.requests,
    providerAvailability: value.providerAvailability,
    telemetryEvents: buildResolutionTelemetry(input, { locations, requests: value.requests }),
    bounded: true,
  };
}

export async function resolveLegalFullTextLocations(
  input: FullTextResolutionInput,
  options: FullTextResolutionOptions = {},
): Promise<FullTextResolutionResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(250, options.timeoutMs ?? 5_000);
  const maxRequests = Math.max(0, Math.min(8, options.maxResolverRequests ?? 6));
  const retryCount = Math.max(0, Math.min(1, options.retryCount ?? 1));
  const backoffMs = Math.max(0, Math.min(2_000, options.backoffMs ?? 150));
  const sleepImpl = options.sleepImpl ?? (async (ms: number) => {
    if (ms > 0) await new Promise<void>((resolve) => setTimeout(resolve, ms));
  });
  const doi = normalizeDoi(input.doi);
  const providerTimeout = (provider: FullTextProvider) => options.timeoutMs === undefined
    ? FULL_TEXT_PROVIDER_PROFILES[provider].timeoutMs
    : Math.min(timeoutMs, FULL_TEXT_PROVIDER_PROFILES[provider].timeoutMs);
  const providerBackoff = (provider: FullTextProvider) => options.backoffMs === undefined
    ? FULL_TEXT_PROVIDER_PROFILES[provider].backoffMs
    : backoffMs;
  const canonicalIdentity = doi || clean(input.canonicalWorkId) || clean(input.title) || "unresolved-source";
  const locations: FullTextLocationCandidate[] = [];
  const requests: FullTextResolverRequestAudit[] = [];
  const queriedProviders = new Set<FullTextProvider>();
  for (const value of [input.fullTextUrl, input.readableUrl, input.url]) {
    const url = safeUrl(value);
    if (!url) continue;
    const officialRepository = officialPublicRepositoryUrl(url);
    addLocation(locations, {
      url,
      provider: "existing_payload",
      accessPath: ["existing_payload", url],
      isOpenAccess: officialRepository ? true : input.isOpenAccess ?? null,
      ...(officialRepository ? {
        version: "repository_copy",
        hostType: "repository" as const,
        confidence: "HIGH" as const,
        sourceMetadata: { officialPublicRepository: true },
      } : {}),
      ...(url.toLocaleLowerCase().includes(".pdf") ? { contentTypeHint: "application/pdf" } : {}),
      manifestationIdentity: {
        doi,
        pmid: input.pmid,
        pmcid: input.pmcid,
        arxivId: input.arxivId,
        providerIds: input.providerIds,
        title: input.title,
        authors: input.authors,
        year: input.year,
        venue: input.venue,
        studyPopulation: input.studyPopulation,
        studyDesign: input.studyDesign,
        sourceRecordId: input.canonicalWorkId ?? doi,
        officialRepositoryIdentifier: officialRepository ? url : null,
      },
    });
    const arxivPdf = arxivPdfUrl(url);
    if (arxivPdf) {
      addLocation(locations, {
        url: arxivPdf,
        provider: "arxiv",
        accessPath: ["known_identifier", "arXiv", "PDF"],
        isOpenAccess: true,
        version: "submittedVersion",
        contentTypeHint: "application/pdf",
        manifestationIdentity: {
          arxivId: input.arxivId ?? arxivPdf.match(/\/pdf\/([^/?#]+)/iu)?.[1] ?? null,
          title: input.title,
          authors: input.authors,
          year: input.year,
          sourceRecordId: input.arxivId ?? arxivPdf,
          officialRepositoryIdentifier: input.arxivId ?? arxivPdf,
        },
      });
    }
  }
  const unpaywallEmail = clean(options.unpaywallEmail ?? process.env.UNPAYWALL_EMAIL);
  const semanticScholarApiKey = clean(options.semanticScholarApiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY);
  const coreApiKey = clean(options.coreApiKey ?? process.env.CORE_API_KEY);
  const providerAvailability = (): OaProviderAvailability[] => {
    const alwaysAvailable: FullTextProvider[] = ["europe_pmc", "openalex", "crossref", "datacite", "doaj", "semantic_scholar"];
    const output: OaProviderAvailability[] = alwaysAvailable.map((provider) => ({
      provider,
      status: queriedProviders.has(provider) ? "AVAILABLE" : "DISABLED_BY_BUDGET",
      reasonCode: queriedProviders.has(provider) ? "QUERY_ATTEMPTED" : doi ? "REQUEST_BUDGET_EXHAUSTED" : "DOI_REQUIRED",
    }));
    output.push({
      provider: "unpaywall",
      status: !unpaywallEmail ? "PROVIDER_NOT_CONFIGURED" : queriedProviders.has("unpaywall") ? "AVAILABLE" : "DISABLED_BY_BUDGET",
      reasonCode: !unpaywallEmail ? "UNPAYWALL_EMAIL_MISSING" : queriedProviders.has("unpaywall") ? "QUERY_ATTEMPTED" : "REQUEST_BUDGET_EXHAUSTED",
    });
    output.push({
      provider: "core",
      status: !coreApiKey ? "PROVIDER_NOT_CONFIGURED" : "DISABLED_BY_BUDGET",
      reasonCode: !coreApiKey ? "CORE_API_KEY_MISSING" : "CORE_ADAPTER_NOT_ENABLED_IN_THIS_RUN",
    });
    return output;
  };
  if (!doi || maxRequests === 0) {
    return finalizeResolution(input, {
      canonicalIdentity,
      locations,
      requests,
      providerAvailability: providerAvailability(),
    });
  }

  type ProviderTask = {
    provider: FullTextProvider;
    url: string;
    headers?: Record<string, string>;
    collect: (payload: Record<string, unknown>, output: FullTextLocationCandidate[]) => void;
  };
  const openAlexKey = clean(process.env.OPENALEX_API_KEY);
  const openAlexQuery = new URLSearchParams({
    select: "id,doi,title,open_access,best_oa_location,locations",
    ...(openAlexKey ? { api_key: openAlexKey } : {}),
  });
  const providerTasks: ProviderTask[] = [
    ...(unpaywallEmail ? [{
      provider: "unpaywall" as const,
      url: `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(unpaywallEmail)}`,
      collect: (payload: Record<string, unknown>, output: FullTextLocationCandidate[]) => unpaywallLocations(payload, output, doi),
    }] : []),
    {
      provider: "europe_pmc",
      url: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`DOI:${doi}`)}&format=json&pageSize=3&resultType=core`,
      collect: (payload, output) => europePmcLocations(payload, output, doi),
    },
    {
      provider: "openalex",
      url: `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?${openAlexQuery.toString()}`,
      collect: openAlexLocations,
    },
    {
      provider: "doaj",
      url: `https://doaj.org/api/search/articles/${encodeURIComponent(`doi:${doi}`)}?pageSize=1`,
      collect: (payload, output) => doajLocations(payload, output, doi),
    },
    {
      provider: "crossref",
      url: `https://api.crossref.org/works/${encodeURIComponent(doi)}`,
      collect: crossrefLocations,
    },
    {
      provider: "semantic_scholar",
      url: `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=paperId,title,year,authors,externalIds,openAccessPdf,publicationTypes`,
      ...(semanticScholarApiKey ? { headers: { "x-api-key": semanticScholarApiKey } } : {}),
      collect: (payload: Record<string, unknown>, output: FullTextLocationCandidate[]) => semanticScholarLocations(payload, output, doi),
    },
    {
      provider: "datacite",
      url: `https://api.datacite.org/dois/${encodeURIComponent(doi)}`,
      collect: (payload, output) => dataciteLocations(payload, output, doi),
    },
  ];
  const reservedRetryBudget = options.retryCount !== undefined && retryCount > 0 && maxRequests > 1 ? 1 : 0;
  const selectedTasks = providerTasks.slice(0, Math.min(maxRequests - reservedRetryBudget, providerTasks.length));
  const attemptBudgets = selectedTasks.map(() => 1);
  let remainingAttemptBudget = maxRequests - selectedTasks.length;
  for (let index = 0; index < selectedTasks.length && remainingAttemptBudget > 0; index += 1) {
    const task = selectedTasks[index]!;
    if (retryCount > 0 && FULL_TEXT_PROVIDER_PROFILES[task.provider].maxRetries > 0) {
      attemptBudgets[index] = 2;
      remainingAttemptBudget -= 1;
    }
  }

  // Each provider owns a local audit buffer so concurrent completion order cannot
  // change the persisted request ordering or ranking evidence.
  const taskResults = await Promise.all(selectedTasks.map(async (task, index) => {
    queriedProviders.add(task.provider);
    const localRequests: FullTextResolverRequestAudit[] = [];
    const localLocations: FullTextLocationCandidate[] = [];
    const payload = await jsonRequest(
      task.provider,
      task.url,
      fetchImpl,
      providerTimeout(task.provider),
      localRequests,
      {
        maxAttempts: attemptBudgets[index]!,
        backoffMs: providerBackoff(task.provider),
        sleepImpl,
        ...(task.headers ? { headers: task.headers } : {}),
      },
    );
    if (payload) task.collect(payload, localLocations);
    return { requests: localRequests, locations: localLocations };
  }));
  for (const result of taskResults) {
    for (const request of result.requests) {
      requests.push({ ...request, attempt: requests.length + 1 });
    }
    locations.push(...result.locations);
  }
  addLocation(locations, {
    url: `https://doi.org/${doi}`,
    provider: "doi_resolver",
    accessPath: ["DOI", "resolver"],
    isOpenAccess: null,
    manifestationIdentity: {
      doi,
      title: input.title,
      authors: input.authors,
      year: input.year,
      venue: input.venue,
      sourceRecordId: doi,
    },
  });
  return finalizeResolution(input, {
    canonicalIdentity,
    locations,
    requests,
    providerAvailability: providerAvailability(),
  });
}

function artifactIdentifiers(input: FullTextQualificationInput): FullTextArtifactIdentityV1["identifiers"] {
  const doi = normalizeDoi(input.payloadIdentity?.doi ?? input.artifactDoi);
  const pmcid = clean(input.payloadIdentity?.pmcid).toLocaleUpperCase();
  const pmid = clean(input.payloadIdentity?.pmid);
  const arxivId = clean(input.payloadIdentity?.arxivId);
  return {
    ...(doi ? { doi } : {}),
    ...(pmid ? { pmid } : {}),
    ...(pmcid ? { pmcid } : {}),
    ...(arxivId ? { arxivId } : {}),
  };
}

function outcomeReason(outcome: FullTextAcquisitionOutcome): string {
  return outcome.toLocaleLowerCase().replace(/_/gu, " ");
}

export function qualifyFullTextArtifact(
  input: FullTextQualificationInput,
): FullTextQualificationResult {
  const text = clean(input.artifactText);
  const headings = (input.sections ?? []).map((section) => clean(section.heading)).filter(Boolean);
  const structureMarkers = uniqueStrings([
    ...headings.filter((heading) => ARTICLE_STRUCTURE.test(heading)),
    ...[...text.matchAll(/(?:^|[.。!?]\s+)(Abstract|Introduction|Background|Methods?|Materials?|Participants?|Results?|Findings?|Discussion|Conclusions?|Limitations?|References?)(?=[:.\s])/giu)]
      .map((match) => clean(match[1])),
  ]).slice(0, 20);
  const identifiers = artifactIdentifiers(input);
  const sourceDoi = normalizeDoi(input.sourceDoi);
  const payloadIdentity = verifyPayloadArticleIdentity(input.canonicalIdentity ?? {
    canonicalStudyId: clean(input.canonicalWorkId), title: input.sourceTitle, doi: sourceDoi,
  }, input.payloadIdentity ?? { title: input.artifactTitle, doi: identifiers.doi });
  const identityMatch: FullTextArtifactIdentityV1["identityMatch"] = payloadIdentity.decision === "MATCH" ? "MATCH" : payloadIdentity.decision === "MISMATCH" ? "MISMATCH" : "UNKNOWN";
  const identityStrength: FullTextArtifactIdentityV1["identityStrength"] = payloadIdentity.level === "PERSISTENT_IDENTIFIER" ? "STRONG" : payloadIdentity.level === "BIBLIOGRAPHIC" ? "MEDIUM" : "NONE";
  const identityEvidence = payloadIdentity.evidence.map(item => `PAYLOAD_${item.type}:${item.matched ? "MATCH" : "NO_MATCH"}`);
  const substantiveMarkers = structureMarkers.filter((marker) => SUBSTANTIVE_STRUCTURE.test(marker));
  const substantiveSections = (input.sections ?? []).filter((section) => clean(section.text).length >= 200);
  const referenceTopology = headings.some((heading) => /references?|bibliography|works cited/iu.test(heading));
  const disciplineTolerantStructure = substantiveSections.length >= 3 && headings.length >= 3 && text.length >= 3_000 &&
    (referenceTopology || substantiveSections.length >= 5);
  const onlyAbstract = substantiveSections.length <= 1 && structureMarkers.length > 0 && substantiveMarkers.length === 0 &&
    structureMarkers.every((marker) => /abstract|references?/iu.test(marker));
  const normalizedAbstract = clean(input.artifactAbstract);
  const abstractDominates = normalizedAbstract.length >= 160 && substantiveMarkers.length === 0 &&
    (text === normalizedAbstract || text.includes(normalizedAbstract)) &&
    text.length <= normalizedAbstract.length + 500;
  const supplementary = /\b(?:supplementary|supporting information|appendix only)\b/iu.test(
    `${clean(input.artifactTitle)} ${clean(input.url)} ${headings.join(" ")}`,
  );
  const version = clean(input.publicationVersion).toLocaleLowerCase();
  const canonicalWorkId = clean(input.canonicalWorkId) || sourceDoi || clean(input.sourceTitle) || "unresolved-source";
  const url = safeUrl(input.url) ?? "https://invalid.local/unresolved-artifact";
  const declaredLegalAccess = input.isOpenAccess === true || Boolean(clean(input.license)) || officialPublicRepositoryUrl(url);
  const normalizedContentType = clean(input.contentType).toLocaleLowerCase();
  const htmlArtifact = /html/iu.test(normalizedContentType) || (!normalizedContentType && input.initialOutcome === "HTML_FULL_TEXT_FOUND");
  const xmlArtifact = /xml|jats|tei/iu.test(normalizedContentType) || (!normalizedContentType && ["XML_JATS_FULL_TEXT_FOUND", "XML_TEI_FULL_TEXT_FOUND"].includes(input.initialOutcome ?? ""));
  const pdfArtifact = /pdf/iu.test(normalizedContentType) || (!normalizedContentType && ["PDF_DOWNLOAD_SUCCESS", "MACHINE_TEXT_PDF", "SCANNED_PDF"].includes(input.initialOutcome ?? ""));
  const challengeOrLogin = /(?:captcha|cloudflare|verify you are human|attention required|access denied|sign in to continue|login required|consent required|enable javascript and cookies)/iu.test(text);
  let outcome = input.initialOutcome ?? "FULL_TEXT_QUALIFIED";
  let qualifyingFullText = true;
  const positiveInitialOutcomes: FullTextAcquisitionOutcome[] = [
    "FULL_TEXT_QUALIFIED",
    "HTML_FULL_TEXT_FOUND",
    "XML_JATS_FULL_TEXT_FOUND",
    "XML_TEI_FULL_TEXT_FOUND",
    "PDF_DOWNLOAD_SUCCESS",
    "MACHINE_TEXT_PDF",
    "SCANNED_PDF",
  ];

  if (identityMatch === "MISMATCH") {
    outcome = "WRONG_ARTICLE_MATCH";
    qualifyingFullText = false;
  } else if (input.initialOutcome && !positiveInitialOutcomes.includes(input.initialOutcome)) {
    outcome = input.initialOutcome;
    qualifyingFullText = false;
  } else if ((input.httpStatus ?? 0) !== 200) {
    outcome = "INVALID_CONTENT_TYPE";
    qualifyingFullText = false;
  } else if (supplementary) {
    outcome = "SUPPLEMENTARY_ONLY";
    qualifyingFullText = false;
  } else if (/erratum|correction|editorial/iu.test(`${clean(input.artifactTitle)} ${version}`)) {
    outcome = "WRONG_ARTICLE_VERSION";
    qualifyingFullText = false;
  } else if (onlyAbstract || abstractDominates || (/\babstract\b/iu.test(headings.join(" ")) && text.length < 1_200 && substantiveMarkers.length === 0)) {
    outcome = "ABSTRACT_ONLY";
    qualifyingFullText = false;
  } else if (!declaredLegalAccess) {
    outcome = "RIGHTS_OR_LICENSE_BLOCKED";
    qualifyingFullText = false;
  } else if (htmlArtifact && challengeOrLogin) {
    outcome = "LANDING_PAGE_ONLY";
    qualifyingFullText = false;
  } else if (text.length < 400) {
    outcome = "FULL_TEXT_TOO_SHORT";
    qualifyingFullText = false;
  } else if (htmlArtifact && ((substantiveMarkers.length < 2 && !disciplineTolerantStructure) || text.length < 1_200)) {
    outcome = "FULL_TEXT_STRUCTURE_INVALID";
    qualifyingFullText = false;
  } else if (xmlArtifact && substantiveMarkers.length < 2 && !disciplineTolerantStructure) {
    outcome = "FULL_TEXT_STRUCTURE_INVALID";
    qualifyingFullText = false;
  } else if (pdfArtifact && (typeof input.pageCount !== "number" || input.pageCount <= 0)) {
    outcome = "FULL_TEXT_STRUCTURE_INVALID";
    qualifyingFullText = false;
  } else if (substantiveMarkers.length < 2 && text.length < 1_200) {
    outcome = "FULL_TEXT_STRUCTURE_INVALID";
    qualifyingFullText = false;
  } else if (identityMatch !== "MATCH") {
    outcome = "CANONICAL_IDENTITY_INSUFFICIENT";
    qualifyingFullText = false;
  } else {
    outcome = "FULL_TEXT_QUALIFIED";
  }

  const provider = input.sourceProvider ?? "existing_payload";
  const checksum = clean(input.checksum) || createHash("sha256").update(text).digest("hex");
  const versionType = artifactVersionType({
    version: input.publicationVersion,
    repositoryCopy: input.repositoryCopy ?? officialPublicRepositoryUrl(url),
  });
  const rightsStatus: FullTextArtifactIdentityV1["rightsStatus"] = declaredLegalAccess
    ? "OPEN"
    : input.isOpenAccess === false ? "RESTRICTED" : "UNKNOWN";
  const accessMethod: FullTextArtifactIdentityV1["accessMethod"] = officialPublicRepositoryUrl(url)
    ? "OFFICIAL_OA_REPOSITORY"
    : input.isOpenAccess === true && provider !== "existing_payload"
      ? input.hostType === "publisher" ? "PUBLISHER_DECLARED_OA" : "PROVIDER_DISCOVERED_OA"
      : input.isOpenAccess === true ? "PUBLIC_URL_VALIDATED" : "UNKNOWN";
  const artifact: FullTextArtifactIdentityV1 = {
    schemaVersion: "researchforge-fulltext-artifact/v1",
    studyId: sourceDoi || clean(input.sourceTitle) || canonicalWorkId,
    canonicalWorkId,
    identifiers,
    sourceProvider: provider,
    sourceUrl: url,
    resolvedUrl: url,
    acquisitionRoute: input.accessPath ?? [provider, url],
    httpStatus: input.httpStatus ?? 0,
    mimeType: clean(input.contentType) || "application/octet-stream",
    ...(clean(input.declaredMime) ? { declaredMime: clean(input.declaredMime) } : {}),
    ...(clean(input.detectedMime) ? { detectedMime: clean(input.detectedMime) } : {}),
    ...(input.formatDetector?.length ? { formatDetector: uniqueStrings(input.formatDetector) } : {}),
    ...(typeof input.contentTypeMismatch === "boolean" ? { contentTypeMismatch: input.contentTypeMismatch } : {}),
    ...(clean(input.magicBytes) ? { magicBytes: clean(input.magicBytes) } : {}),
    ...(input.redirectChain?.length ? { redirectChain: uniqueStrings(input.redirectChain) } : {}),
    byteLength: Math.max(0, input.byteLength ?? 0),
    checksum,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    ...(clean(input.publicationVersion) ? { publicationVersion: clean(input.publicationVersion) } : {}),
    artifactVersionType: versionType,
    ...(clean(input.license) ? { license: clean(input.license) } : {}),
    rightsStatus,
    oaStatus: declaredLegalAccess ? "OPEN" : input.isOpenAccess === false ? "CLOSED" : "UNKNOWN",
    accessMethod,
    ...(safeUrl(input.landingUrl) ? { landingUrl: safeUrl(input.landingUrl)! } : {}),
    parserUsed: clean(input.parserUsed) || "unknown-parser",
    parserVersion: clean(input.parserVersion) || "unknown-version",
    ...(typeof input.pageCount === "number" ? { pageCount: input.pageCount } : {}),
    textLength: text.length,
    structureMarkers,
    identityMatch,
    identityStrength,
    identityEvidence,
    payloadIdentity,
    qualificationResult: qualifyingFullText ? "QUALIFIED" : "REJECTED",
    qualificationReason: outcome,
    routeFingerprint: routeFingerprint(url),
    artifactFingerprint: checksum,
  };
  return {
    qualifyingFullText,
    outcome,
    reason: outcomeReason(outcome),
    identityMatch,
    structureMarkers,
    artifact,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function selectCanonicalFullTextArtifact(input: {
  artifacts: FullTextArtifactIdentityV1[];
  canonicalWorkId: string;
}): {
  selected: FullTextArtifactIdentityV1 | null;
  alternates: FullTextArtifactIdentityV1[];
  rejected: Array<{ checksum: string; outcome: FullTextAcquisitionOutcome }>;
} {
  const canonical = clean(input.canonicalWorkId).toLocaleLowerCase();
  const rejected: Array<{ checksum: string; outcome: FullTextAcquisitionOutcome }> = [];
  const eligible = input.artifacts.filter((artifact) => {
    if (artifact.qualificationResult !== "QUALIFIED" || artifact.identityMatch !== "MATCH") {
      rejected.push({ checksum: artifact.checksum, outcome: artifact.qualificationReason });
      return false;
    }
    if (clean(artifact.canonicalWorkId).toLocaleLowerCase() !== canonical) {
      rejected.push({ checksum: artifact.checksum, outcome: "WRONG_ARTICLE_MATCH" });
      return false;
    }
    return true;
  });
  eligible.sort((left, right) => {
    const versionRank = (artifact: FullTextArtifactIdentityV1) =>
      /version of record|publishedversion|vor/iu.test(artifact.publicationVersion ?? "") ? 3
        : /accepted/iu.test(artifact.publicationVersion ?? "") ? 2
          : /submitted|preprint/iu.test(artifact.publicationVersion ?? "") ? 1 : 0;
    return versionRank(right) - versionRank(left) ||
      Date.parse(right.retrievedAt) - Date.parse(left.retrievedAt) ||
      right.checksum.localeCompare(left.checksum);
  });
  const selected = eligible[0] ?? null;
  const alternates: FullTextArtifactIdentityV1[] = [];
  for (const candidate of eligible.slice(1)) {
    if (candidate.artifactFingerprint === selected?.artifactFingerprint || candidate.checksum === selected?.checksum) {
      rejected.push({ checksum: candidate.checksum, outcome: "DUPLICATE_OR_MIRROR" });
    } else {
      alternates.push(candidate);
    }
  }
  return { selected, alternates, rejected };
}

function stateFor(input: AccessClassificationInput): FullTextAccessStateV3 {
  const warnings = (input.warnings ?? []).join(" ");
  const extraction = `${input.extractionMethod ?? ""} ${input.extractionStatus ?? ""}`;
  if (input.qualification && !input.qualification.qualifyingFullText) {
    if (input.qualification.outcome === "ABSTRACT_ONLY") return "ABSTRACT_ONLY";
    if (input.qualification.outcome === "LANDING_PAGE_ONLY") return "PUBLISHER_SHELL";
    if (["RIGHTS_OR_LICENSE_BLOCKED", "HTTP_401", "HTTP_403", "ROBOTS_OR_TOS_BLOCKED", "ACCESS_BLOCKED"].includes(input.qualification.outcome)) {
      return "ACCESS_DENIED";
    }
    return "BROKEN_DOCUMENT";
  }
  if (input.accessLevel === "full_text") {
    if (/ocr/iu.test(extraction)) return "FULL_TEXT_OCR";
    if ((input.sections ?? []).some((section) => /methods?|results?|discussion|table|figure/iu.test(clean(section.heading)))) return "FULL_TEXT_STRUCTURED";
    if (input.accessPath?.some((step) => /repository|europe pmc|core|arxiv|zenodo|osf/iu.test(step))) return "FULL_TEXT_REPOSITORY_COPY";
    if (/pdf|grobid/iu.test(`${extraction} ${input.contentType ?? ""} ${input.resolvedUrl ?? ""}`)) return "FULL_TEXT_PDF";
    return "FULL_TEXT_HTML";
  }
  if (/PUBLISHER_SHELL/iu.test(warnings)) return "PUBLISHER_SHELL";
  if (/UNKNOWN_JOB_INCOMPLETE|JOB_INTERRUPTED|JOB_BUDGET/iu.test(`${warnings} ${input.failureReason ?? ""}`)) return "UNKNOWN_JOB_INCOMPLETE";
  if (input.accessLevel === "blocked_or_paywalled" || /PAYWALL|LOGIN_REQUIRED/iu.test(warnings)) return "PAYWALLED";
  if (/LICENSE_RESTRICTED|LICENSE_DENIED|HTTP_451/iu.test(warnings)) return "LICENSE_RESTRICTED";
  if (/ROBOTS|POLICY|HTTP_401|HTTP_403/iu.test(warnings)) return "ACCESS_DENIED";
  if (/HTTP_404|HTTP_410|NOT_FOUND/iu.test(warnings)) return "NOT_FOUND";
  if (/UNSUPPORTED_CONTENT_TYPE|UNSUPPORTED_FORMAT/iu.test(`${warnings} ${input.failureReason ?? ""}`)) return "UNSUPPORTED_FORMAT";
  if (/PDF_(?:PARSE|TEXT_EXTRACTION)_FAILED|PDF_TEXT_EXTRACTION_UNAVAILABLE|CORRUPT|BROKEN_DOCUMENT/iu.test(`${warnings} ${input.failureReason ?? ""}`)) return "BROKEN_DOCUMENT";
  if (/TIMEOUT|NETWORK_ERROR|RESOLVER_ERROR|HTTP_429|HTTP_5\d\d/iu.test(`${warnings} ${input.failureReason ?? ""}`)) return "RESOLVER_ERROR";
  if (input.accessLevel === "abstract_only") return "ABSTRACT_ONLY";
  if (input.accessLevel === "metadata_only") return "METADATA_ONLY";
  return "UNKNOWN_JOB_INCOMPLETE";
}

export function buildFullTextAccessAudit(input: AccessClassificationInput): FullTextAccessAuditV3 {
  const text = input.text ?? "";
  const contentLength = Math.max(0, input.contentLength ?? text.length);
  const sectionEvidence = (input.sections ?? [])
    .map((section) => clean(section.heading))
    .filter(Boolean);
  return {
    schemaVersion: "researchforge-fulltext-access-audit/v3",
    accessState: stateFor(input),
    ...(input.resolvedUrl ? { resolvedUrl: input.resolvedUrl } : {}),
    ...(input.contentType ? { contentType: input.contentType } : {}),
    ...(input.declaredMime ? { declaredMime: input.declaredMime } : {}),
    ...(input.detectedMime ? { detectedMime: input.detectedMime } : {}),
    ...(input.detectionMethod?.length ? { detectionMethod: uniqueStrings(input.detectionMethod) } : {}),
    ...(typeof input.contentTypeMismatch === "boolean" ? { contentTypeMismatch: input.contentTypeMismatch } : {}),
    ...(input.magicBytes ? { magicBytes: input.magicBytes } : {}),
    ...(input.redirectChain?.length ? { redirectChain: uniqueStrings(input.redirectChain) } : {}),
    ...(input.landingResolutionTrace?.length ? { landingResolutionTrace: input.landingResolutionTrace } : {}),
    contentLength,
    textDensity: contentLength === 0 ? 0 : Math.round((text.length / contentLength) * 10_000) / 10_000,
    sectionEvidence,
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    accessPath: input.accessPath ?? [],
    ...(input.contentHash || text ? { checksum: input.contentHash || createHash("sha256").update(text).digest("hex") } : {}),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    resolverRequests: input.resolverRequests ?? [],
    ...(input.oaRouteCandidates ? { oaRouteCandidates: input.oaRouteCandidates } : {}),
    ...(input.manifestations ? { manifestations: input.manifestations } : {}),
    ...(input.providerAvailability ? { providerAvailability: input.providerAvailability } : {}),
    ...(input.telemetryEvents ? { telemetryEvents: input.telemetryEvents } : {}),
    ...(input.acquisitionOutcome || input.qualification?.outcome
      ? { acquisitionOutcome: input.qualification?.outcome ?? input.acquisitionOutcome }
      : {}),
    ...(input.qualification
      ? {
          qualifyingFullText: input.qualification.qualifyingFullText,
          qualificationReason: input.qualification.reason,
          artifact: input.qualification.artifact,
        }
      : {}),
  };
}
