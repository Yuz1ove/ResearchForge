import { createHash } from "node:crypto";

/** Bibliography only. Deliberately has no document, chunk, admission or Writer fields. */
export interface CanonicalIdentityBase {
  sourceId: string;
  canonicalStudyId: string;
  revision: number;
  title: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  providerIds?: Record<string, string>;
  url?: string;
}

export interface CanonicalIdentitySnapshot {
  canonical: CanonicalIdentityBase;
  sourceHash: string;
  sourceVersion: string;
  observedAt: string;
  payloadMaterializedAt: string;
  canonicalHash: string;
}

export interface CanonicalIdentitySeed {
  value: string;
  fieldType: "doi" | "pmcid" | "openalex" | "semanticScholar" | "source_url" | "title";
  origin: "canonical-preexisting" | "approved-metadata-owner" | "payload-derived" |
    "parser-derived" | "manifestation-derived" | "redirect-derived" | "reference-derived";
  originRecordId: string;
  observedBeforePayloadMaterialization: boolean;
  sourceHash: string;
  sourceVersion: string;
}

export type CanonicalIdentityFailure =
  | "IDENTITY_SEED_PROVENANCE_VIOLATION"
  | "CANONICAL_IDENTITY_AMBIGUOUS"
  | "CANONICAL_IDENTITY_CONFLICT"
  | "CANONICAL_IDENTITY_INSUFFICIENT"
  | "CANONICAL_IDENTITY_OWNER_UNAVAILABLE"
  | "CANONICAL_IDENTITY_PERSISTENCE_FAILED";

export interface CanonicalMetadataCandidate {
  title?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
  providerIds?: Record<string, string>;
}

export interface CanonicalMetadataResponse {
  provider: "openalex" | "semantic_scholar" | "crossref";
  retrievedAt: string;
  requestIdentity: string;
  responseIdentity: string;
  responseHash: string;
  rawResponseBody: string;
  requestUrl: string;
  candidates: CanonicalMetadataCandidate[];
}

export interface IndependentCanonicalIdentity {
  status: "INDEPENDENT_METADATA_VERIFIED";
  canonical: CanonicalIdentityBase;
  evidence: {
    version: "researchforge-independent-canonical-identity/v1";
    evidenceId: string;
    seed: CanonicalIdentitySeed;
    owner: "acceptedSourceEnrichment";
    response: CanonicalMetadataResponse;
    resolutionMethod: "CANONICAL_PERSISTENT_IDENTIFIER";
    canonicalRevisionBinding: { previousHash: string; previousRevision: number; revision: number; identityHash: string };
  };
}

export type CanonicalIdentityResult =
  | { ok: true; value: IndependentCanonicalIdentity }
  | { ok: false; reason: CanonicalIdentityFailure; conflicts: string[] };

export const identityHash = (value: unknown): string =>
  createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const norm = (value?: string) => (value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const doi = (value?: string) => (value ?? "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").trim().toLowerCase();
const pid = (value?: string) => (value ?? "").trim().toLowerCase();
const openalex = (value?: string) => pid(value).replace(/^https?:\/\/openalex\.org\//u, "");
const fail = (reason: CanonicalIdentityFailure, ...conflicts: string[]): CanonicalIdentityResult => ({ok:false,reason,conflicts});

export function canonicalPmcidFromUrl(value?: string): string | undefined {
  try {
    const url = new URL(value ?? "");
    if (url.protocol !== "https:" || url.hostname !== "pmc.ncbi.nlm.nih.gov" || url.port || url.username || url.password || url.search || url.hash) return;
    return url.pathname.match(/^\/articles\/(PMC\d+)\/?$/u)?.[1];
  } catch { return; }
}

function seedValue(base: CanonicalIdentityBase, field: CanonicalIdentitySeed["fieldType"]): string | undefined {
  if (field === "openalex" || field === "semanticScholar") return base.providerIds?.[field];
  if (field === "source_url") return base.url;
  return base[field];
}

export function deriveCanonicalIdentitySeed(snapshot: CanonicalIdentitySnapshot): CanonicalIdentitySeed {
  const base = snapshot.canonical;
  const fieldType = (["doi", "pmcid", "openalex", "semanticScholar"] as const).find(field => seedValue(base, field)) ??
    (canonicalPmcidFromUrl(base.url) ? "source_url" : "title");
  return {
    value: seedValue(base, fieldType) ?? "", fieldType, origin: "canonical-preexisting",
    originRecordId: base.sourceId, observedBeforePayloadMaterialization: Date.parse(snapshot.observedAt) < Date.parse(snapshot.payloadMaterializedAt),
    sourceHash: snapshot.sourceHash, sourceVersion: snapshot.sourceVersion,
  };
}

export function validateCanonicalIdentitySeed(snapshot: CanonicalIdentitySnapshot, seed: CanonicalIdentitySeed): CanonicalIdentityResult | null {
  const allowedFields = new Set(["sourceId","canonicalStudyId","revision","title","authors","year","venue","doi","pmid","pmcid","providerIds","url"]);
  // Owner-to-owner evidence is intentionally unsupported until an authenticated mapping exists.
  if (Object.keys(snapshot.canonical).some(field => !allowedFields.has(field)) ||
      seed.origin !== "canonical-preexisting" || !seed.observedBeforePayloadMaterialization ||
      !Number.isFinite(Date.parse(snapshot.observedAt)) || !Number.isFinite(Date.parse(snapshot.payloadMaterializedAt)) ||
      Date.parse(snapshot.observedAt) >= Date.parse(snapshot.payloadMaterializedAt) ||
      !/^[a-f0-9]{64}$/u.test(snapshot.sourceHash) || snapshot.canonicalHash !== identityHash(snapshot.canonical) ||
      !snapshot.sourceVersion || !snapshot.canonical.sourceId || !snapshot.canonical.canonicalStudyId ||
      !Number.isInteger(snapshot.canonical.revision) || snapshot.canonical.revision < 0 ||
      seed.originRecordId !== snapshot.canonical.sourceId || seed.sourceHash !== snapshot.sourceHash ||
      seed.sourceVersion !== snapshot.sourceVersion || seed.value !== seedValue(snapshot.canonical, seed.fieldType)) {
    return fail("IDENTITY_SEED_PROVENANCE_VIOLATION", "Seed must bind the exact pre-payload canonical snapshot field.");
  }
  if (seed.fieldType === "title") return fail("CANONICAL_IDENTITY_INSUFFICIENT", "Title convergence is not an existing owner policy.");
  if ((seed.fieldType === "source_url" && !canonicalPmcidFromUrl(seed.value)) ||
      (seed.fieldType === "pmcid" && !/^PMC\d+$/u.test(seed.value)) ||
      (seed.fieldType === "doi" && !/^10\.\d{4,9}\/\S+$/u.test(doi(seed.value))) ||
      (seed.fieldType === "openalex" && !/^w\d+$/u.test(openalex(seed.value))) ||
      (seed.fieldType === "semanticScholar" && !/^[a-f0-9]{40}$/iu.test(seed.value))) {
    return fail("CANONICAL_IDENTITY_INSUFFICIENT", "Unsupported canonical persistent identifier.");
  }
  return null;
}

export function canonicalMetadataRequest(seed: CanonicalIdentitySeed): {provider: CanonicalMetadataResponse["provider"]; url: string; requestIdentity: string} {
  const provider = seed.fieldType === "openalex" ? "openalex" : seed.fieldType === "doi" ? "crossref" : "semantic_scholar";
  const pmcid = seed.fieldType === "source_url" ? canonicalPmcidFromUrl(seed.value) : seed.fieldType === "pmcid" ? seed.value : undefined;
  const url = provider === "openalex"
    ? "https://api.openalex.org/works/" + encodeURIComponent(seed.value.replace(/^https?:\/\/openalex\.org\//iu, ""))
    : provider === "crossref"
      ? "https://api.crossref.org/works/" + encodeURIComponent(doi(seed.value))
      : "https://api.semanticscholar.org/graph/v1/paper/" +
        (pmcid ? "PMCID:" + encodeURIComponent(pmcid.replace(/^PMC/u, "")) : encodeURIComponent(seed.value)) +
        "?fields=paperId,title,authors,year,venue,externalIds";
  return {provider,url,requestIdentity:"canonical-metadata-detail:" + provider + ":" + url};
}

export function verifyIndependentCanonicalResponse(
  snapshot: CanonicalIdentitySnapshot, seed: CanonicalIdentitySeed, response: CanonicalMetadataResponse,
): CanonicalIdentityResult {
  const invalid = validateCanonicalIdentitySeed(snapshot, seed);
  // No title-only acceptance, including multiple plausible title search results.
  if (seed.fieldType === "title" && invalid?.ok === false && invalid.reason === "CANONICAL_IDENTITY_INSUFFICIENT" && response.candidates.length > 1)
    return fail("CANONICAL_IDENTITY_AMBIGUOUS", "Multiple title candidates; no authorized convergence policy.");
  if (invalid) return invalid;
  const expectedRequest = canonicalMetadataRequest(seed);
  if (response.provider !== expectedRequest.provider || response.requestUrl !== expectedRequest.url ||
      response.requestIdentity !== expectedRequest.requestIdentity) return fail("IDENTITY_SEED_PROVENANCE_VIOLATION", "Owner response does not bind the seed request.");
  if (!response.requestIdentity || !response.responseIdentity || !/^[a-f0-9]{64}$/u.test(response.responseHash) ||
      response.responseHash !== identityHash(response.rawResponseBody) ||
      !Number.isFinite(Date.parse(response.retrievedAt))) return fail("CANONICAL_IDENTITY_INSUFFICIENT", "Missing owner response provenance.");
  if (response.candidates.length > 1) return fail("CANONICAL_IDENTITY_AMBIGUOUS", "Multiple owner records.");
  const candidate = response.candidates[0];
  if (!candidate) return fail("CANONICAL_IDENTITY_INSUFFICIENT", "No owner record.");
  const canonical = snapshot.canonical;
  const conflicts: string[] = [];
  for (const field of ["doi", "pmid", "pmcid"] as const) {
    const normalize = field === "doi" ? doi : pid;
    if (canonical[field] && candidate[field] && normalize(canonical[field]) !== normalize(candidate[field])) conflicts.push(field);
  }
  for (const [provider, current] of Object.entries(canonical.providerIds ?? {})) {
    const incoming = candidate.providerIds?.[provider];
    if (incoming && (provider === "openalex" ? openalex(current) !== openalex(incoming) : pid(current) !== pid(incoming))) conflicts.push("providerId:" + provider);
  }
  const title = norm(candidate.title);
  const prefix = /(?:\.\.\.|…)\s*$/u.test(canonical.title);
  const expectedTitle = norm(canonical.title);
  if (title && (prefix ? !(title === expectedTitle || title.startsWith(expectedTitle + " ")) : title !== expectedTitle)) conflicts.push("title");
  if (canonical.authors?.length && candidate.authors?.length && !canonical.authors.every(a => candidate.authors!.some(b => norm(a) === norm(b)))) conflicts.push("authors");
  if (canonical.year !== undefined && candidate.year !== undefined && canonical.year !== candidate.year) conflicts.push("year");
  if (canonical.venue && candidate.venue && norm(canonical.venue) !== norm(candidate.venue)) conflicts.push("venue");
  const sourcePmcid = canonical.pmcid ?? canonicalPmcidFromUrl(canonical.url);
  if (sourcePmcid && candidate.pmcid && pid(sourcePmcid) !== pid(candidate.pmcid)) conflicts.push("canonical-url-pmcid");
  if (conflicts.length) return fail("CANONICAL_IDENTITY_CONFLICT", ...conflicts);
  const binding = seed.fieldType === "doi" ? doi(candidate.doi) === doi(seed.value) :
    seed.fieldType === "openalex" ? openalex(candidate.providerIds?.openalex) === openalex(seed.value) :
    seed.fieldType === "semanticScholar" ? pid(candidate.providerIds?.semanticScholar) === pid(seed.value) :
    pid(candidate.pmcid) === pid(seed.fieldType === "source_url" ? canonicalPmcidFromUrl(seed.value) : seed.value);
  if (!binding || !title || /(?:\.\.\.|…)\s*$/u.test(candidate.title ?? "") || !candidate.authors?.some(a=>norm(a)) ||
      !Number.isInteger(candidate.year) || candidate.year! < 1000 || !norm(candidate.venue) ||
      (canonical.doi && !candidate.doi) || (canonical.authors?.length && !candidate.authors?.length))
    return fail("CANONICAL_IDENTITY_INSUFFICIENT", "Incomplete bibliography or missing exact requested identifier binding.");
  const next: CanonicalIdentityBase = {
    ...canonical, revision: canonical.revision + 1, title: candidate.title!.trim(),
    authors: [...candidate.authors!], year: candidate.year, venue: candidate.venue,
    ...(candidate.doi ? {doi: canonical.doi ?? doi(candidate.doi)} : {}),
    ...(candidate.pmid ? {pmid: canonical.pmid ?? candidate.pmid} : {}),
    ...(candidate.pmcid ? {pmcid: canonical.pmcid ?? candidate.pmcid} : {}),
    providerIds: {...candidate.providerIds, ...canonical.providerIds},
  };
  const nextHash = identityHash(next);
  const evidenceId = identityHash({sourceHash: snapshot.sourceHash, seed, responseHash:response.responseHash, request:response.requestIdentity, nextHash});
  return {ok:true,value:{
    status:"INDEPENDENT_METADATA_VERIFIED",canonical:next,
    evidence:{version:"researchforge-independent-canonical-identity/v1",evidenceId,seed,owner:"acceptedSourceEnrichment",response,
      resolutionMethod:"CANONICAL_PERSISTENT_IDENTIFIER",
      canonicalRevisionBinding:{previousHash:snapshot.canonicalHash,previousRevision:canonical.revision,revision:next.revision,identityHash:nextHash}},
  }};
}
