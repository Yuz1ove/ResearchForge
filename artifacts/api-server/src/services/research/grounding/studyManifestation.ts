import { createHash } from "node:crypto";

export const STUDY_MANIFESTATION_ARTIFACT_FORMATS = [
  "PDF",
  "JATS_XML",
  "TEI_XML",
  "FULL_HTML",
  "TEXT",
  "UNKNOWN",
] as const;

export type StudyManifestationArtifactFormat =
  (typeof STUDY_MANIFESTATION_ARTIFACT_FORMATS)[number];

export const STUDY_MANIFESTATION_VERSION_TYPES = [
  "VERSION_OF_RECORD",
  "AUTHOR_ACCEPTED_MANUSCRIPT",
  "SUBMITTED_MANUSCRIPT",
  "PREPRINT",
  "REPOSITORY_COPY",
  "UNKNOWN_VERSION",
] as const;

export type StudyManifestationVersionType =
  (typeof STUDY_MANIFESTATION_VERSION_TYPES)[number];

export const STUDY_MANIFESTATION_IDENTITY_DECISIONS = [
  "MATCH",
  "POSSIBLE_MATCH",
  "MISMATCH",
  "UNKNOWN",
] as const;

export type StudyManifestationIdentityDecision =
  (typeof STUDY_MANIFESTATION_IDENTITY_DECISIONS)[number];

export const STUDY_MANIFESTATION_ACCESS_POLICY_DECISIONS = [
  "ALLOWED_OFFICIAL_API",
  "ALLOWED_OPEN_REPOSITORY",
  "ALLOWED_PUBLIC_ARTIFACT",
  "ROBOTS_OR_TOS_BLOCKED",
  "AUTH_REQUIRED",
  "PAYWALLED",
  "UNKNOWN_POLICY",
] as const;

export type StudyManifestationAccessPolicyDecision =
  (typeof STUDY_MANIFESTATION_ACCESS_POLICY_DECISIONS)[number];

export interface StudyManifestationIdentityEvidence {
  type:
    | "DOI_EXACT"
    | "DOI_RELATION"
    | "PMID_PMCID_RELATION"
    | "PROVIDER_CANONICAL_ID"
    | "ARXIV_ID_EXACT"
    | "TITLE_AUTHOR_YEAR_FINGERPRINT"
    | "JOURNAL_PREPRINT_RELATION"
    | "REPOSITORY_RELATION"
    | "IDENTIFIER_MISMATCH"
    | "FINGERPRINT_INSUFFICIENT";
  canonicalValue?: string;
  manifestationValue?: string;
  matched: boolean;
  detail: string;
}

export interface StudyIdentityRelation {
  relationType: string;
  canonicalIdentifier: string;
  manifestationIdentifier: string;
  provider: string;
}

export interface CanonicalStudyIdentityInput {
  canonicalStudyId: string;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  arxivId?: string | null;
  providerIds?: Record<string, string> | null;
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  venue?: string | null;
  studyPopulation?: string | null;
  studyDesign?: string | null;
}

export interface ManifestationIdentityInput {
  conflictingIdentifiers?: string[];
  sourceRecordId?: string | null;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  arxivId?: string | null;
  providerIds?: Record<string, string> | null;
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  venue?: string | null;
  studyPopulation?: string | null;
  studyDesign?: string | null;
  relations?: StudyIdentityRelation[] | null;
  officialRepositoryIdentifier?: string | null;
  documentType?: string | null;
}

export interface PayloadArticleIdentityVerification {
  decision: StudyManifestationIdentityDecision;
  confidence: number;
  level: "PERSISTENT_IDENTIFIER" | "BIBLIOGRAPHIC" | "INSUFFICIENT";
  reason: "CANONICAL_ARTICLE_IDENTITY_VERIFIED" | "WRONG_ARTICLE_MATCH" | "CANONICAL_IDENTITY_INSUFFICIENT";
  evidence: StudyManifestationIdentityEvidence[];
  comparisons: Record<string, "MATCH" | "MISMATCH" | "NOT_COMPARABLE">;
}

// Payload identity is deliberately separate from discovery relations: a related
// preprint DOI or provider link does not prove the identity of downloaded bytes.
export function verifyPayloadArticleIdentity(
  canonical: CanonicalStudyIdentityInput,
  payload: ManifestationIdentityInput,
): PayloadArticleIdentityVerification {
  const comparisons: PayloadArticleIdentityVerification["comparisons"] = {};
  const evidence: StudyManifestationIdentityEvidence[] = [];
  const normalize = (value: unknown) => normalizeIdentifier(value).replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//u, "").replace(/\.pdf$/u, "");
  let exactId = false;
  let hasCanonicalId = false;
  for (const field of ["doi", "pmid", "pmcid", "arxivId"] as const) {
    const valid = (value: unknown) => {
      const normalized = normalize(value);
      return field === "doi" && !/^10\.\d{4,9}\/\S+$/u.test(normalized) ? "" : normalized;
    };
    const left = valid(canonical[field]);
    const right = valid(payload[field]);
    hasCanonicalId ||= Boolean(clean(canonical[field]));
    comparisons[field] = left && right ? left === right ? "MATCH" : "MISMATCH" : "NOT_COMPARABLE";
    if (comparisons[field] !== "NOT_COMPARABLE") {
      exactId ||= left === right;
      evidence.push({ type: left !== right ? "IDENTIFIER_MISMATCH" : field === "doi" ? "DOI_EXACT" : field === "arxivId" ? "ARXIV_ID_EXACT" : "PMID_PMCID_RELATION", canonicalValue: left, manifestationValue: right, matched: left === right, detail: `Payload ${field}; exact comparison, no fuzzy identifier or version-relation override.` });
    }
  }
  // Provider identifiers must share a namespace; equal strings from unrelated
  // providers are not the same work. Only document-embedded IDs belong here.
  for (const namespace of Object.keys(canonical.providerIds ?? {}).sort()) {
    const left = normalize(canonical.providerIds?.[namespace]);
    const right = normalize(payload.providerIds?.[namespace]);
    hasCanonicalId ||= Boolean(left);
    comparisons[`provider:${namespace}`] = left && right ? left === right ? "MATCH" : "MISMATCH" : "NOT_COMPARABLE";
    if (left && right) {
      exactId ||= left === right;
      evidence.push({ type: left === right ? "PROVIDER_CANONICAL_ID" : "IDENTIFIER_MISMATCH", canonicalValue: left, manifestationValue: right, matched: left === right, detail: `Document-embedded ${namespace} identifier.` });
    }
  }
  const words = (value: unknown) => clean(value).replace(/&amp;/giu, "&").replace(/&nbsp;/giu, " ").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean);
  const leftTitle = words(canonical.title).join(" ");
  const rightTitle = words(payload.title).join(" ");
  comparisons.title = leftTitle && rightTitle ? leftTitle === rightTitle ? "MATCH" : "MISMATCH" : "NOT_COMPARABLE";
  const surname = (author: string) => words(author.includes(",") ? author.split(",")[0] : author).at(-1) ?? "";
  const leftAuthors = (canonical.authors ?? []).map(surname).filter(Boolean);
  const rightAuthors = (payload.authors ?? []).map(surname).filter(Boolean);
  const given = (author: string) => words(author.includes(",") ? author.split(",").slice(1).join(" ") : author).at(0) ?? "";
  const leftGiven = given(canonical.authors?.[0] ?? "");
  const rightGiven = given(payload.authors?.[0] ?? "");
  const givenAgreement = leftGiven === rightGiven || Math.min(leftGiven.length, rightGiven.length) === 1 && leftGiven[0] === rightGiven[0];
  const authorAgreement = leftAuthors[0] === rightAuthors[0] && givenAgreement && overlap(leftAuthors, rightAuthors) >= 0.5;
  comparisons.authors = leftAuthors.length && rightAuthors.length ? authorAgreement ? "MATCH" : "MISMATCH" : "NOT_COMPARABLE";
  const leftYear = Number(canonical.year);
  const rightYear = Number(payload.year);
  comparisons.year = leftYear > 0 && rightYear > 0 ? Math.abs(leftYear - rightYear) <= 1 ? "MATCH" : "MISMATCH" : "NOT_COMPARABLE";
  const leftVenue = words(canonical.venue).join(" ");
  const rightVenue = words(payload.venue).join(" ");
  comparisons.venue = leftVenue && rightVenue ? leftVenue === rightVenue ? "MATCH" : "MISMATCH" : "NOT_COMPARABLE";
  if (payload.conflictingIdentifiers?.length) comparisons.documentIdentifiers = "MISMATCH";
  const idConflict = Object.entries(comparisons).some(([field, result]) => !["title", "authors", "year", "venue"].includes(field) && result === "MISMATCH");
  // Exact PIDs take precedence over typography/bibliography, never over another
  // contradictory PID. With no shared PID, missing identity is not a mismatch.
  const bibliographicConflict = ["authors", "year", "venue"].some(field => comparisons[field] === "MISMATCH");
  const fingerprint = !hasCanonicalId && comparisons.title === "MATCH" && comparisons.authors === "MATCH" && comparisons.year === "MATCH" && comparisons.venue !== "MISMATCH";
  const unrelatedTitle = words(canonical.title).length >= 2 && words(payload.title).length >= 2 && overlap(words(canonical.title), words(payload.title)) < 0.45;
  const mismatch = idConflict || !exactId && (bibliographicConflict || unrelatedTitle);
  const verified = !mismatch && (exactId || fingerprint);
  evidence.push({ type: fingerprint ? "TITLE_AUTHOR_YEAR_FINGERPRINT" : "FINGERPRINT_INSUFFICIENT", canonicalValue: clean(canonical.title), manifestationValue: clean(payload.title), matched: fingerprint, detail: JSON.stringify(comparisons) });
  return {
    decision: mismatch ? "MISMATCH" : verified ? "MATCH" : "UNKNOWN",
    confidence: mismatch || exactId ? 1 : fingerprint ? 0.95 : 0,
    level: verified ? exactId ? "PERSISTENT_IDENTIFIER" : "BIBLIOGRAPHIC" : "INSUFFICIENT",
    reason: mismatch ? "WRONG_ARTICLE_MATCH" : verified ? "CANONICAL_ARTICLE_IDENTITY_VERIFIED" : "CANONICAL_IDENTITY_INSUFFICIENT",
    evidence, comparisons,
  };
}

export interface NormalizedDocumentLocator {
  type: "CHAR_OFFSET" | "PAGE" | "XPATH" | "DOM_SELECTOR";
  value: string;
}

export interface NormalizedDocumentBlock {
  blockId: string;
  kind: "SECTION" | "PARAGRAPH" | "TABLE" | "FIGURE_CAPTION" | "REFERENCE";
  heading?: string;
  text: string;
  locator: NormalizedDocumentLocator;
}

export interface NormalizedDocumentRepresentation {
  schemaVersion: "researchforge-normalized-document/v1";
  format: StudyManifestationArtifactFormat;
  title?: string;
  abstract?: string;
  blocks: NormalizedDocumentBlock[];
  sectionCount: number;
  paragraphCount: number;
  tableCount: number;
  figureCaptionCount: number;
  referenceCount: number;
  textLength: number;
}

export interface StudyManifestation {
  schemaVersion: "researchforge-study-manifestation/v1";
  manifestationId: string;
  canonicalStudyId: string;
  provider: string;
  sourceRecordId: string;
  sourceUrl: string;
  landingUrl?: string;
  artifactUrl?: string;
  artifactFormat: StudyManifestationArtifactFormat;
  versionType: StudyManifestationVersionType;
  identityEvidence: StudyManifestationIdentityEvidence[];
  identityConfidence: number;
  identityDecision: StudyManifestationIdentityDecision;
  accessPolicyDecision: StudyManifestationAccessPolicyDecision;
  license?: string;
  oaStatus: "OPEN" | "CLOSED" | "UNKNOWN";
  contentTypeHeader?: string;
  detectedContentType?: string;
  contentLength?: number;
  checksumSha256?: string;
  fetchedAt?: string;
  materializationStatus:
    | "DISCOVERED"
    | "POLICY_BLOCKED"
    | "FETCH_FAILED"
    | "MATERIALIZED"
    | "PARSER_FAILED"
    | "REVOKED";
  qualificationStatus: "NOT_EVALUATED" | "QUALIFIED" | "REJECTED";
  qualificationReasons: string[];
  rejectionReasons: string[];
  provenance: {
    accessPath: string[];
    routeFingerprint: string;
    artifactSnapshotPath?: string;
    rawArtifactRetained: boolean;
    providerMetadata: Record<string, string | number | boolean | null>;
  };
  attemptId: string;
  runId: string;
  normalizedDocument?: NormalizedDocumentRepresentation;
  directStudyAdmissionDecided: false;
}

const VERSION_RELATIONS = new Set([
  "hasversion",
  "isversionof",
  "isnewversionof",
  "ispreviousversionof",
  "ispreprintof",
  "haspreprint",
  "isoriginalformof",
  "isidenticalto",
]);

const OFFICIAL_API_HOSTS = new Set([
  "api.crossref.org",
  "api.datacite.org",
  "api.openalex.org",
  "api.semanticscholar.org",
  "api.unpaywall.org",
  "api.core.ac.uk",
  "doaj.org",
  "ebi.ac.uk",
]);

const OPEN_REPOSITORY_HOST = /(?:^|\.)(?:pmc\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov|europepmc\.org|ebi\.ac\.uk|arxiv\.org|biorxiv\.org|medrxiv\.org|zenodo\.org|figshare\.com|osf\.io|hal\.science|hal\.archives-ouvertes\.fr)$/iu;

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/gu, " ").trim()
    : "";
}

function normalizeIdentifier(value: unknown): string {
  return clean(value)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "")
    .replace(/^(?:doi|pmid|pmcid|arxiv)\s*:\s*/iu, "")
    .toLocaleLowerCase();
}

function normalizedWords(value: unknown): string[] {
  return clean(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((token) => token.length >= 2);
}

function overlap(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length;
  return intersection / Math.min(leftSet.size, rightSet.size);
}

function titleSimilarity(left: unknown, right: unknown): number {
  return overlap(normalizedWords(left), normalizedWords(right));
}

function authorTokens(authors: string[] | null | undefined): string[] {
  return (authors ?? []).flatMap((author) => {
    const tokens = normalizedWords(author);
    return tokens.length ? [tokens.at(-1)!] : [];
  });
}

function hasConflictingContext(canonical: CanonicalStudyIdentityInput, manifestation: ManifestationIdentityInput): boolean {
  const populationLeft = normalizedWords(canonical.studyPopulation);
  const populationRight = normalizedWords(manifestation.studyPopulation);
  if (populationLeft.length && populationRight.length && overlap(populationLeft, populationRight) < 0.25) return true;
  const designLeft = normalizedWords(canonical.studyDesign);
  const designRight = normalizedWords(manifestation.studyDesign);
  return Boolean(designLeft.length && designRight.length && overlap(designLeft, designRight) < 0.25);
}

function hasConflictingDocumentRole(
  canonical: CanonicalStudyIdentityInput,
  manifestation: ManifestationIdentityInput,
): boolean {
  const canonicalText = `${clean(canonical.title)} ${clean(canonical.studyDesign)}`;
  const manifestationText = `${clean(manifestation.title)} ${clean(manifestation.documentType)} ${clean(manifestation.studyDesign)}`;
  const role = /\b(?:systematic review|meta-analysis|scoping review|narrative review|review article|protocol|study protocol|correction|erratum|editorial|commentary|conference abstract)\b/iu;
  return role.test(manifestationText) && !role.test(canonicalText);
}

function confidence(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1_000) / 1_000));
}

export function bindStudyManifestationIdentity(input: {
  canonical: CanonicalStudyIdentityInput;
  manifestation: ManifestationIdentityInput;
}): {
  decision: StudyManifestationIdentityDecision;
  confidence: number;
  evidence: StudyManifestationIdentityEvidence[];
} {
  const canonicalDoi = normalizeIdentifier(input.canonical.doi);
  const manifestationDoi = normalizeIdentifier(input.manifestation.doi);
  const evidence: StudyManifestationIdentityEvidence[] = [];
  if (canonicalDoi && manifestationDoi) {
    if (canonicalDoi === manifestationDoi) {
      evidence.push({ type: "DOI_EXACT", canonicalValue: canonicalDoi, manifestationValue: manifestationDoi, matched: true, detail: "Exact normalized DOI match." });
      return { decision: "MATCH", confidence: 1, evidence };
    }
    const relation = (input.manifestation.relations ?? []).find((item) => {
      const relationType = clean(item.relationType).replace(/[^a-z]/giu, "").toLocaleLowerCase();
      if (!VERSION_RELATIONS.has(relationType)) return false;
      const pair = [normalizeIdentifier(item.canonicalIdentifier), normalizeIdentifier(item.manifestationIdentifier)];
      return pair.includes(canonicalDoi) && pair.includes(manifestationDoi);
    });
    if (relation) {
      evidence.push({ type: /preprint/iu.test(relation.relationType) ? "JOURNAL_PREPRINT_RELATION" : "DOI_RELATION", canonicalValue: canonicalDoi, manifestationValue: manifestationDoi, matched: true, detail: `${relation.provider}:${relation.relationType}` });
      return { decision: "MATCH", confidence: 0.98, evidence };
    }
    evidence.push({ type: "IDENTIFIER_MISMATCH", canonicalValue: canonicalDoi, manifestationValue: manifestationDoi, matched: false, detail: "Different DOI values with no explicit version relation." });
    return { decision: "MISMATCH", confidence: 1, evidence };
  }

  const canonicalPmid = normalizeIdentifier(input.canonical.pmid);
  const canonicalPmcid = normalizeIdentifier(input.canonical.pmcid);
  const manifestationPmid = normalizeIdentifier(input.manifestation.pmid);
  const manifestationPmcid = normalizeIdentifier(input.manifestation.pmcid);
  if ((canonicalPmid && canonicalPmid === manifestationPmid) || (canonicalPmcid && canonicalPmcid === manifestationPmcid)) {
    evidence.push({ type: "PMID_PMCID_RELATION", canonicalValue: canonicalPmcid || canonicalPmid, manifestationValue: manifestationPmcid || manifestationPmid, matched: true, detail: "Official PMID/PMCID identifier match." });
    return { decision: "MATCH", confidence: 0.99, evidence };
  }

  const canonicalArxiv = normalizeIdentifier(input.canonical.arxivId);
  const manifestationArxiv = normalizeIdentifier(input.manifestation.arxivId);
  if (canonicalArxiv && manifestationArxiv) {
    const matched = canonicalArxiv.replace(/v\d+$/u, "") === manifestationArxiv.replace(/v\d+$/u, "");
    evidence.push({ type: matched ? "ARXIV_ID_EXACT" : "IDENTIFIER_MISMATCH", canonicalValue: canonicalArxiv, manifestationValue: manifestationArxiv, matched, detail: matched ? "Normalized arXiv identifier match." : "Different arXiv identifiers." });
    return { decision: matched ? "MATCH" : "MISMATCH", confidence: 0.99, evidence };
  }

  const canonicalProviderIds = new Set(Object.values(input.canonical.providerIds ?? {}).map(normalizeIdentifier).filter(Boolean));
  const manifestationProviderIds = Object.values(input.manifestation.providerIds ?? {}).map(normalizeIdentifier).filter(Boolean);
  const providerMatch = manifestationProviderIds.find((identifier) => canonicalProviderIds.has(identifier));
  if (providerMatch) {
    evidence.push({ type: "PROVIDER_CANONICAL_ID", canonicalValue: providerMatch, manifestationValue: providerMatch, matched: true, detail: "Provider canonical identifier match." });
    return { decision: "MATCH", confidence: 0.97, evidence };
  }

  const titleScore = titleSimilarity(input.canonical.title, input.manifestation.title);
  const authorScore = overlap(authorTokens(input.canonical.authors), authorTokens(input.manifestation.authors));
  const canonicalYear = Number(input.canonical.year ?? 0);
  const manifestationYear = Number(input.manifestation.year ?? 0);
  const yearComparable = canonicalYear > 0 && manifestationYear > 0;
  const yearDelta = yearComparable ? Math.abs(canonicalYear - manifestationYear) : null;
  const venueScore = titleSimilarity(input.canonical.venue, input.manifestation.venue);
  const contextConflict = hasConflictingContext(input.canonical, input.manifestation) ||
    hasConflictingDocumentRole(input.canonical, input.manifestation);
  const stableRepositoryIdentity = Boolean(clean(input.manifestation.officialRepositoryIdentifier));
  const exactTitleWithStableRepository = titleScore >= 0.98 && normalizedWords(input.canonical.title).length >= 5 && stableRepositoryIdentity;
  const fingerprintMatch = titleScore >= 0.86 && authorScore >= 0.5 && yearDelta !== null && yearDelta <= 1 && !contextConflict;
  evidence.push({
    type: fingerprintMatch || exactTitleWithStableRepository ? "TITLE_AUTHOR_YEAR_FINGERPRINT" : "FINGERPRINT_INSUFFICIENT",
    canonicalValue: clean(input.canonical.title),
    manifestationValue: clean(input.manifestation.title),
    matched: fingerprintMatch || exactTitleWithStableRepository,
    detail: `title=${titleScore.toFixed(3)};authors=${authorScore.toFixed(3)};yearDelta=${yearDelta ?? "UNKNOWN"};venue=${venueScore.toFixed(3)};contextConflict=${contextConflict}`,
  });
  if (fingerprintMatch) return { decision: "MATCH", confidence: confidence(0.72 + titleScore * 0.16 + authorScore * 0.08 + venueScore * 0.04), evidence };
  // A stable repository identifier plus an exact title is useful evidence, but
  // it is not an identity relation by itself. Without author/year evidence the
  // result remains POSSIBLE_MATCH and cannot be admitted.
  if (exactTitleWithStableRepository && !contextConflict) return { decision: "POSSIBLE_MATCH", confidence: 0.8, evidence };
  if (!contextConflict && titleScore >= 0.75 && (authorScore >= 0.34 || yearDelta !== null && yearDelta <= 2)) {
    return { decision: "POSSIBLE_MATCH", confidence: confidence(0.45 + titleScore * 0.25 + authorScore * 0.1), evidence };
  }
  if (contextConflict || (titleScore > 0 && titleScore < 0.45)) return { decision: "MISMATCH", confidence: confidence(Math.max(0.55, 1 - titleScore)), evidence };
  return { decision: "UNKNOWN", confidence: confidence(titleScore * 0.5), evidence };
}

function host(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./iu, "").toLocaleLowerCase();
  } catch {
    return "";
  }
}

export function decideManifestationAccessPolicy(input: {
  provider: string;
  sourceUrl: string;
  isOpenAccess?: boolean | null;
  license?: string | null;
  hostType?: "repository" | "publisher" | "unknown" | null;
  httpStatus?: number | null;
  policySignal?: string | null;
}): StudyManifestationAccessPolicyDecision {
  const signal = clean(input.policySignal).toLocaleUpperCase();
  if (/ROBOTS|TOS|POLICY_BLOCKED/u.test(signal)) return "ROBOTS_OR_TOS_BLOCKED";
  if (/PAYWALL|PAYWALLED/u.test(signal) || input.httpStatus === 402) return "PAYWALLED";
  if (/AUTH|LOGIN_REQUIRED/u.test(signal) || [401, 403].includes(Number(input.httpStatus ?? 0))) return "AUTH_REQUIRED";
  const hostname = host(input.sourceUrl);
  if (OFFICIAL_API_HOSTS.has(hostname)) return "ALLOWED_OFFICIAL_API";
  if (OPEN_REPOSITORY_HOST.test(hostname) || input.hostType === "repository" && input.isOpenAccess === true) {
    return input.isOpenAccess === false ? "UNKNOWN_POLICY" : "ALLOWED_OPEN_REPOSITORY";
  }
  if (input.isOpenAccess === true && (clean(input.license) || input.hostType === "publisher")) {
    return "ALLOWED_PUBLIC_ARTIFACT";
  }
  return "UNKNOWN_POLICY";
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

export function artifactFormatFromHint(value: string | null | undefined): StudyManifestationArtifactFormat {
  const normalized = clean(value).toLocaleLowerCase();
  if (/pdf/iu.test(normalized)) return "PDF";
  if (/jats/iu.test(normalized)) return "JATS_XML";
  if (/tei/iu.test(normalized)) return "TEI_XML";
  if (/html|xhtml/iu.test(normalized)) return "FULL_HTML";
  if (/text|plain/iu.test(normalized)) return "TEXT";
  return "UNKNOWN";
}

export function normalizedDocumentFromSections(input: {
  format: StudyManifestationArtifactFormat;
  title?: string | null;
  abstract?: string | null;
  sections: Array<{
    heading?: string | null;
    text: string;
    page?: number | null;
    locator?: NormalizedDocumentLocator | null;
  }>;
}): NormalizedDocumentRepresentation {
  let charOffset = 0;
  let paragraphCount = 0;
  let tableCount = 0;
  let figureCaptionCount = 0;
  let referenceCount = 0;
  const blocks = input.sections.flatMap((section, sectionIndex): NormalizedDocumentBlock[] => {
    const text = clean(section.text);
    if (!text) return [];
    const heading = clean(section.heading);
    const kind: NormalizedDocumentBlock["kind"] = /references?|bibliography|works cited/iu.test(heading)
      ? "REFERENCE"
      : /tables?/iu.test(heading)
        ? "TABLE"
        : /figures?|captions?/iu.test(heading)
          ? "FIGURE_CAPTION"
          : heading ? "SECTION" : "PARAGRAPH";
    paragraphCount += kind === "PARAGRAPH" || kind === "SECTION" ? 1 : 0;
    tableCount += kind === "TABLE" ? 1 : 0;
    figureCaptionCount += kind === "FIGURE_CAPTION" ? 1 : 0;
    referenceCount += kind === "REFERENCE" ? 1 : 0;
    const locator = section.locator ?? (typeof section.page === "number"
      ? { type: "PAGE" as const, value: String(section.page) }
      : { type: "CHAR_OFFSET" as const, value: `${charOffset}:${charOffset + text.length}` });
    charOffset += text.length + 2;
    return [{
      blockId: `block:${String(sectionIndex + 1).padStart(4, "0")}:${sha256(`${heading}|${text}`).slice(0, 12)}`,
      kind,
      ...(heading ? { heading } : {}),
      text,
      locator,
    }];
  });
  return {
    schemaVersion: "researchforge-normalized-document/v1",
    format: input.format,
    ...(clean(input.title) ? { title: clean(input.title) } : {}),
    ...(clean(input.abstract) ? { abstract: clean(input.abstract) } : {}),
    blocks,
    sectionCount: blocks.filter((block) => block.kind === "SECTION").length,
    paragraphCount,
    tableCount,
    figureCaptionCount,
    referenceCount,
    textLength: blocks.reduce((sum, block) => sum + block.text.length, 0),
  };
}

export function createStudyManifestation(input: {
  canonical: CanonicalStudyIdentityInput;
  manifestationIdentity?: ManifestationIdentityInput;
  provider: string;
  sourceRecordId?: string | null;
  sourceUrl: string;
  landingUrl?: string | null;
  artifactUrl?: string | null;
  artifactFormat?: StudyManifestationArtifactFormat;
  formatHint?: string | null;
  versionType: StudyManifestationVersionType;
  isOpenAccess?: boolean | null;
  license?: string | null;
  hostType?: "repository" | "publisher" | "unknown" | null;
  policySignal?: string | null;
  accessPath?: string[];
  routeFingerprint?: string | null;
  providerMetadata?: Record<string, string | number | boolean | null>;
  attemptId?: string | null;
  runId?: string | null;
}): StudyManifestation {
  const binding = bindStudyManifestationIdentity({
    canonical: input.canonical,
    manifestation: input.manifestationIdentity ?? {},
  });
  const sourceRecordId = clean(input.sourceRecordId) || clean(input.manifestationIdentity?.sourceRecordId) || input.provider;
  const routeFingerprint = clean(input.routeFingerprint) || sha256(input.sourceUrl);
  const accessPolicyDecision = decideManifestationAccessPolicy({
    provider: input.provider,
    sourceUrl: input.artifactUrl ?? input.sourceUrl,
    isOpenAccess: input.isOpenAccess,
    license: input.license,
    hostType: input.hostType,
    policySignal: input.policySignal,
  });
  const blocked = ["ROBOTS_OR_TOS_BLOCKED", "AUTH_REQUIRED", "PAYWALLED", "UNKNOWN_POLICY"].includes(accessPolicyDecision);
  return {
    schemaVersion: "researchforge-study-manifestation/v1",
    manifestationId: `manifestation:${sha256(`${input.canonical.canonicalStudyId}|${routeFingerprint}|${input.versionType}`).slice(0, 24)}`,
    canonicalStudyId: input.canonical.canonicalStudyId,
    provider: input.provider,
    sourceRecordId,
    sourceUrl: input.sourceUrl,
    ...(clean(input.landingUrl) ? { landingUrl: clean(input.landingUrl) } : {}),
    ...(clean(input.artifactUrl) ? { artifactUrl: clean(input.artifactUrl) } : {}),
    artifactFormat: input.artifactFormat ?? artifactFormatFromHint(input.formatHint),
    versionType: input.versionType,
    identityEvidence: binding.evidence,
    identityConfidence: binding.confidence,
    identityDecision: binding.decision,
    accessPolicyDecision,
    ...(clean(input.license) ? { license: clean(input.license) } : {}),
    oaStatus: input.isOpenAccess === true ? "OPEN" : input.isOpenAccess === false ? "CLOSED" : "UNKNOWN",
    materializationStatus: blocked ? "POLICY_BLOCKED" : "DISCOVERED",
    qualificationStatus: "NOT_EVALUATED",
    qualificationReasons: [],
    rejectionReasons: blocked ? [accessPolicyDecision] : [],
    provenance: {
      accessPath: unique(input.accessPath ?? []),
      routeFingerprint,
      rawArtifactRetained: false,
      providerMetadata: input.providerMetadata ?? {},
    },
    attemptId: clean(input.attemptId) || `attempt:${sha256(`${routeFingerprint}|0`).slice(0, 20)}`,
    runId: clean(input.runId) || "UNKNOWN_RUN",
    directStudyAdmissionDecided: false,
  };
}

export function materializeStudyManifestation(input: {
  manifestation: StudyManifestation;
  identity: ReturnType<typeof bindStudyManifestationIdentity>;
  contentTypeHeader?: string | null;
  detectedContentType?: string | null;
  contentLength?: number | null;
  checksumSha256?: string | null;
  fetchedAt?: string | null;
  artifactUrl?: string | null;
  artifactSnapshotPath?: string | null;
  normalizedDocument?: NormalizedDocumentRepresentation;
  qualificationStatus: "QUALIFIED" | "REJECTED";
  qualificationReasons?: string[];
  rejectionReasons?: string[];
}): StudyManifestation {
  const rawArtifactRetained = Boolean(clean(input.artifactSnapshotPath));
  const rejected = input.qualificationStatus === "REJECTED" || input.identity.decision !== "MATCH";
  return {
    ...input.manifestation,
    ...(clean(input.artifactUrl) ? { artifactUrl: clean(input.artifactUrl) } : {}),
    identityEvidence: input.identity.evidence,
    identityConfidence: input.identity.confidence,
    identityDecision: input.identity.decision,
    ...(clean(input.contentTypeHeader) ? { contentTypeHeader: clean(input.contentTypeHeader) } : {}),
    ...(clean(input.detectedContentType) ? { detectedContentType: clean(input.detectedContentType) } : {}),
    ...(typeof input.contentLength === "number" ? { contentLength: Math.max(0, Math.trunc(input.contentLength)) } : {}),
    ...(clean(input.checksumSha256) ? { checksumSha256: clean(input.checksumSha256) } : {}),
    ...(clean(input.fetchedAt) ? { fetchedAt: clean(input.fetchedAt) } : {}),
    materializationStatus: rejected && !clean(input.checksumSha256) ? "FETCH_FAILED" : "MATERIALIZED",
    qualificationStatus: rejected ? "REJECTED" : input.qualificationStatus,
    qualificationReasons: rejected ? [] : unique(input.qualificationReasons ?? []),
    rejectionReasons: unique([
      ...(input.rejectionReasons ?? []),
      ...(input.identity.decision === "POSSIBLE_MATCH" ? ["IDENTITY_POSSIBLE_MATCH_NOT_ADMITTED"] : []),
      ...(input.identity.decision === "UNKNOWN" ? ["IDENTITY_UNKNOWN_NOT_ADMITTED"] : []),
      ...(input.identity.decision === "MISMATCH" ? ["IDENTITY_MISMATCH"] : []),
    ]),
    provenance: {
      ...input.manifestation.provenance,
      ...(rawArtifactRetained ? { artifactSnapshotPath: clean(input.artifactSnapshotPath) } : {}),
      rawArtifactRetained,
    },
    normalizedDocument: rejected || input.identity.decision !== "MATCH" ? undefined : input.normalizedDocument,
  };
}

export function dedupeStudyManifestations(manifestations: StudyManifestation[]): StudyManifestation[] {
  const byArtifact = new Map<string, StudyManifestation>();
  for (const manifestation of manifestations) {
    const key = manifestation.checksumSha256
      ? `checksum:${manifestation.checksumSha256}`
      : `route:${manifestation.canonicalStudyId}|${manifestation.provenance.routeFingerprint}|${manifestation.versionType}`;
    const existing = byArtifact.get(key);
    if (!existing) {
      byArtifact.set(key, manifestation);
      continue;
    }
    const rank = (item: StudyManifestation): number =>
      (item.qualificationStatus === "QUALIFIED" ? 100 : 0) +
      (item.identityDecision === "MATCH" ? 30 : item.identityDecision === "POSSIBLE_MATCH" ? 10 : 0) +
      (item.provenance.rawArtifactRetained ? 5 : 0);
    if (rank(manifestation) > rank(existing)) byArtifact.set(key, manifestation);
  }
  return [...byArtifact.values()].sort((left, right) => left.manifestationId.localeCompare(right.manifestationId));
}

export function revokeStudyManifestation(
  manifestation: StudyManifestation,
  reason = "ARTIFACT_REVOKED",
): StudyManifestation {
  const revoked = { ...manifestation };
  delete revoked.checksumSha256;
  delete revoked.contentLength;
  delete revoked.contentTypeHeader;
  delete revoked.detectedContentType;
  delete revoked.fetchedAt;
  delete revoked.normalizedDocument;
  delete revoked.artifactUrl;
  return {
    ...revoked,
    materializationStatus: "REVOKED",
    qualificationStatus: "REJECTED",
    qualificationReasons: [],
    rejectionReasons: unique([...manifestation.rejectionReasons, reason]),
    provenance: {
      ...manifestation.provenance,
      rawArtifactRetained: false,
      artifactSnapshotPath: undefined,
    },
  };
}
