import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import type { CanonicalAdmissionProjection } from "../canonical-admission-projection";
import {
  dedupeCanonicalMaterializedArtifacts,
  materializeAdmittedManifestation,
  type AdmittedManifestationMaterializationInput,
  type V6AFailureCode,
} from "./admittedManifestationMaterializer";
import { createStudyManifestation } from "./studyManifestation";

const canonical = {
  canonicalStudyId: "study:v6a-controlled",
  doi: "10.1234/v6a.controlled",
  title: "Controlled Article",
  authors: ["Author One"],
  year: 2024,
  venue: "Controlled Journal",
};

const sourceId = "controlled-source";
const articleDoi = canonical.doi;
const bodyText = "This controlled article evaluates a documented intervention with a prespecified design, reproducible measurements, and complete reporting of the observed outcomes. ";
const controlledSections = ["Methods", "Results", "Discussion", "References"];

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function projectionFor(qualifyingArtifactRefs: string[] = []): CanonicalAdmissionProjection {
  return {
    schemaVersion: "researchforge-canonical-admission-projection/v1",
    projectionVersion: "canonical-admission-projection.v1",
    projectionId: "projection:v6a-controlled",
    projectedAt: "2026-08-29T00:00:00.000Z",
    projectedFrom: {
      owner: "canonical-study-admission",
      schemaVersion: "researchforge-canonical-study-admission/v1",
      admissionVersion: "canonical-evidence-admission.v1",
    },
    ownerContext: {
      jobId: "job:v6a-controlled",
      workflowId: "workflow:v6a-controlled",
      jobRevision: 4,
      checkpointRevision: 3,
    },
    decisions: [{
      decisionId: "admission:v6a-controlled",
      studyId: canonical.canonicalStudyId,
      sourceId,
      jobRevision: 4,
      checkpointRevision: 3,
      evidenceRevision: "evidence:v6a-controlled",
      admissionClass: "LIMITED",
      canonicalStatus: "ADMITTED",
      admitted: true,
      accessState: "FULL_TEXT_HTML",
      qualifyingArtifactRefs,
      admissionVersion: "canonical-evidence-admission.v1",
      reasonCodes: [],
      sourceReasonCodes: [],
    }],
    artifacts: [],
    summary: {
      canonicalDecisionCount: 1,
      canonicalAdmittedDecisionCount: 1,
      canonicalBlockedDecisionCount: 0,
      directStudyCount: 0,
      qualifyingFullTextDecisionCount: qualifyingArtifactRefs.length ? 1 : 0,
      qualifyingArtifactCount: qualifyingArtifactRefs.length,
      duplicateCanonicalDecisionCount: 0,
      duplicateArtifactCount: 0,
      missingCanonicalRecordCount: 0,
      staleDecisionRevisionCount: 0,
      staleArtifactRevisionCount: 0,
      canonicalIdentityMismatchCount: 0,
      blockerCounts: {},
    },
    validation: { pass: true, issues: [] },
  };
}

function response(body: Uint8Array | string, init: ResponseInit = {}, finalUrl?: string): Response {
  const result = new Response(body, init);
  if (finalUrl) Object.defineProperty(result, "url", { value: finalUrl });
  return result;
}

function htmlDocument(kind: "full" | "abstract" | "landing"): string {
  if (kind === "landing") {
    return `<!doctype html><html><head><title>Controlled Article</title><meta name="citation_title" content="Controlled Article"><meta name="citation_doi" content="${articleDoi}"></head><body><header>Publisher navigation and cookie preferences</header><main><h1>Controlled Article</h1><p>Sign in or purchase access to view the article.</p></main></body></html>`;
  }
  const paragraphs = kind === "abstract"
    ? `<h2>Abstract</h2><p>${bodyText}</p>`
    : controlledSections.map((heading) => `<h2>${heading}</h2>${Array.from({ length: 3 }, () => `<p>${bodyText.repeat(4)}</p>`).join("")}`).join("");
  return `<!doctype html><html><head><title>Controlled Article</title><meta name="citation_title" content="Controlled Article"><meta name="citation_doi" content="${articleDoi}"></head><body><article><h1>Controlled Article</h1>${paragraphs}</article></body></html>`;
}

function jatsDocument(metadataOnly = false): string {
  return metadataOnly
    ? `<article xmlns="http://jats.nlm.nih.gov"><front><article-meta><title-group><article-title>Controlled Article</article-title></title-group><article-id pub-id-type="doi">${articleDoi}</article-id></article-meta></front></article>`
    : `<article xmlns="http://jats.nlm.nih.gov"><front><article-meta><title-group><article-title>Controlled Article</article-title></title-group><article-id pub-id-type="doi">${articleDoi}</article-id></article-meta></front><body>${controlledSections.slice(0, 3).map((heading) => `<sec><title>${heading}</title><p>${bodyText.repeat(6)}</p></sec>`).join("")}</body><back><ref-list><ref><article-title>Reference</article-title></ref></ref-list></back></article>`;
}

const parsedPdf: ParsedDocument = {
  sourceId,
  workflowId: "workflow:v6a-controlled",
  extractionMethod: "pdfminer",
  title: "Controlled Article",
  fullText: `${articleDoi} ${controlledSections.join(" ")} ${bodyText.repeat(16)}`,
  sections: controlledSections.map((heading, index) => ({ heading, text: bodyText.repeat(3), pageStart: index + 1 })),
  confidence: "high",
  requiresOcr: false,
  warnings: [],
};

function manifestationFor(url: string, overrides: Record<string, unknown> = {}) {
  return createStudyManifestation({
    canonical,
    manifestationIdentity: {
      doi: articleDoi,
      title: canonical.title,
      authors: canonical.authors,
      year: canonical.year,
      officialRepositoryIdentifier: url,
    },
    provider: "controlled-manifestation",
    sourceRecordId: sourceId,
    sourceUrl: url,
    artifactUrl: url,
    artifactFormat: "FULL_HTML",
    versionType: "REPOSITORY_COPY",
    isOpenAccess: true,
    hostType: "repository",
    accessPath: ["controlled-admitted-manifestation", url],
    ...(overrides as Partial<Parameters<typeof createStudyManifestation>[0]>),
  });
}

function inputFor(
  url: string,
  fetchImpl: typeof fetch,
  refs: string[] = [],
  options: Partial<AdmittedManifestationMaterializationInput["options"]> = {},
): AdmittedManifestationMaterializationInput {
  return {
    projection: projectionFor(refs),
    decisionId: "admission:v6a-controlled",
    canonical,
    manifestation: manifestationFor(url),
    source: {
      sourceId,
      id: sourceId,
      title: canonical.title,
      doi: articleDoi,
      provider: "controlled-source",
      isOpenAccess: true,
    },
    options: {
      fetchImpl,
      artifactSnapshotDirectory: join(tmpdir(), "researchforge-v6a-controlled-artifacts"),
      timeoutMs: 2_000,
      retryCount: 0,
      resolveFullTextLocations: false,
      ...options,
    },
  };
}

async function runCase(
  url: string,
  payload: Uint8Array | string,
  init: ResponseInit = { status: 200, headers: { "content-type": "text/html" } },
  refs?: string[],
  options?: Partial<AdmittedManifestationMaterializationInput["options"]>,
  finalUrl?: string,
) {
  const bytes = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const fetchImpl = async () => response(bytes, init, finalUrl);
  const result = await materializeAdmittedManifestation(inputFor(url, fetchImpl, refs, options));
  return result;
}

test("V6A controlled matrix: admitted manifestation materializes valid PDF and binds", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\ncontrolled\n%%EOF");
  const result = await runCase(
    "https://controlled.test/article.pdf",
    bytes,
    { status: 200, headers: { "content-type": "application/pdf" } },
    [sha256(bytes)],
    { pdfParser: async () => parsedPdf },
  );
  assert.equal(result.status, "QUALIFIED_AND_BOUND");
  assert.equal(result.artifact?.format, "PDF");
  assert.equal(result.artifact?.qualificationStatus, "QUALIFIED");
  assert.equal(result.binding?.bound, true);
  assert.equal(result.artifact?.sha256, sha256(bytes));
});

test("V6A controlled matrix: PDF URL with HTML payload is a content mismatch", async () => {
  const result = await runCase(
    "https://controlled.test/article.pdf",
    htmlDocument("full"),
    { status: 200, headers: { "content-type": "application/pdf" } },
  );
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "CONTENT_TYPE_MISMATCH");
});

test("V6A controlled matrix: HTML full text is qualified", async () => {
  const bytes = new TextEncoder().encode(htmlDocument("full"));
  const result = await runCase("https://controlled.test/article.html", bytes, undefined, [sha256(bytes)]);
  assert.equal(result.status, "QUALIFIED_AND_BOUND");
  assert.equal(result.artifact?.format, "HTML");
});

test("V6A controlled matrix: abstract-only HTML is not qualified", async () => {
  const result = await runCase("https://controlled.test/abstract.html", htmlDocument("abstract"));
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "HTML_FULLTEXT_NOT_RECOGNIZED");
});

test("V6A controlled matrix: landing HTML is not full text", async () => {
  const result = await runCase("https://controlled.test/landing", htmlDocument("landing"));
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.ok(["F. LANDING_PAGE_NOT_FULLTEXT", "HTML_FULLTEXT_NOT_RECOGNIZED"].includes(result.failure?.code as V6AFailureCode));
});

test("V6A controlled matrix: JATS XML is qualified", async () => {
  const bytes = new TextEncoder().encode(jatsDocument());
  const result = await runCase("https://controlled.test/article.xml", bytes, { status: 200, headers: { "content-type": "application/xml" } }, [sha256(bytes)]);
  assert.equal(result.status, "QUALIFIED_AND_BOUND");
  assert.equal(result.artifact?.format, "JATS_XML");
});

test("V6A controlled matrix: metadata-only XML is not qualified", async () => {
  const result = await runCase("https://controlled.test/metadata.xml", jatsDocument(true), { status: 200, headers: { "content-type": "application/xml" } });
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "XML_JATS_TEI_NOT_RECOGNIZED");
});

test("V6A controlled matrix: redirect to valid PDF retains final URL and binds", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nredirected\n%%EOF");
  const result = await runCase(
    "https://controlled.test/redirect",
    bytes,
    { status: 200, headers: { "content-type": "application/pdf" } },
    [sha256(bytes)],
    { pdfParser: async () => parsedPdf },
    "https://controlled.test/final.pdf",
  );
  assert.equal(result.status, "QUALIFIED_AND_BOUND");
  assert.equal(result.artifact?.finalUrl, "https://controlled.test/final.pdf");
  assert.deepEqual(result.artifact?.provenance.redirectChain, ["https://controlled.test/redirect", "https://controlled.test/final.pdf"]);
});

test("V6A controlled matrix: redirect to landing page is rejected", async () => {
  const result = await runCase(
    "https://controlled.test/redirect",
    htmlDocument("landing"),
    { status: 200, headers: { "content-type": "text/html" } },
    undefined,
    undefined,
    "https://controlled.test/landing",
  );
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
});

test("V6A controlled matrix: empty payload is rejected", async () => {
  const result = await runCase("https://controlled.test/empty", new Uint8Array(), { status: 200, headers: { "content-type": "application/pdf" } });
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "PAYLOAD_EMPTY");
});

test("V6A controlled matrix: truncated PDF is rejected before qualification", async () => {
  const result = await runCase("https://controlled.test/truncated.pdf", `%PDF-1.7\n${"x".repeat(3_000)}`, { status: 200, headers: { "content-type": "application/pdf" } });
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "PAYLOAD_TRUNCATED");
});

test("V6A controlled matrix: invalid PDF signature is rejected", async () => {
  const result = await runCase("https://controlled.test/invalid.pdf", "not a pdf", { status: 200, headers: { "content-type": "application/pdf" } });
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "PDF_SIGNATURE_INVALID");
});

test("V6A controlled matrix: duplicate artifacts are deterministic by checksum", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nduplicate\n%%EOF");
  const first = await runCase("https://controlled.test/one.pdf", bytes, { status: 200, headers: { "content-type": "application/pdf" } }, [sha256(bytes)], { pdfParser: async () => parsedPdf });
  const secondInput = inputFor("https://controlled.test/two.pdf", async () => response(bytes, { status: 200, headers: { "content-type": "application/pdf" } }), [sha256(bytes)], { pdfParser: async () => parsedPdf });
  const second = await materializeAdmittedManifestation(secondInput);
  assert.equal(first.status, "QUALIFIED_AND_BOUND");
  assert.equal(second.status, "QUALIFIED_AND_BOUND");
  assert.equal(dedupeCanonicalMaterializedArtifacts([first.artifact!, second.artifact!]).length, 1);
});

test("V6A controlled matrix: same artifact through two URLs preserves one canonical artifact", async () => {
  const bytes = new TextEncoder().encode(htmlDocument("full"));
  const first = await runCase("https://controlled.test/one.html", bytes, { status: 200, headers: { "content-type": "text/html" } }, [sha256(bytes)]);
  const secondInput = inputFor("https://controlled.test/two.html", async () => response(bytes, { status: 200, headers: { "content-type": "text/html" } }), [sha256(bytes)]);
  const second = await materializeAdmittedManifestation(secondInput);
  assert.equal(first.status, "QUALIFIED_AND_BOUND");
  assert.equal(second.status, "QUALIFIED_AND_BOUND");
  assert.deepEqual(dedupeCanonicalMaterializedArtifacts([first.artifact!, second.artifact!]).map((item) => item.sha256), [sha256(bytes)]);
});

test("V6A controlled matrix: policy-blocked manifestation is fail-closed before fetch", async () => {
  let fetchCalls = 0;
  const fetchImpl = async () => { fetchCalls += 1; return response("should not fetch", { status: 200 }); };
  const input = inputFor("https://controlled.test/blocked", fetchImpl);
  input.manifestation = manifestationFor(input.manifestation.sourceUrl, { policySignal: "robots or terms blocked" });
  const result = await materializeAdmittedManifestation(input);
  assert.equal(result.status, "BLOCKED_BEFORE_FETCH");
  assert.equal(result.failure?.code, "ROBOTS_OR_TOS_BLOCKED");
  assert.equal(fetchCalls, 0);
});

test("V6A controlled matrix: unknown policy is fail-closed before fetch", async () => {
  const input = inputFor("https://unknown.test/article", async () => response("should not fetch", { status: 200 }));
  input.manifestation = manifestationFor(input.manifestation.sourceUrl, { isOpenAccess: null, hostType: "unknown" });
  const result = await materializeAdmittedManifestation(input);
  assert.equal(result.status, "BLOCKED_BEFORE_FETCH");
  assert.equal(result.failure?.code, "UNKNOWN_POLICY");
});

test("V6A controlled matrix: 401 is classified as auth-required", async () => {
  const result = await runCase("https://controlled.test/auth", "login", { status: 401, headers: { "content-type": "text/html" } });
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "AUTH_OR_PAYWALL_REQUIRED");
});

test("V6A controlled matrix: 403 is classified as robots or terms blocked", async () => {
  const result = await runCase("https://controlled.test/forbidden", "forbidden", { status: 403, headers: { "content-type": "text/html" } });
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.failure?.code, "ROBOTS_OR_TOS_BLOCKED");
});

test("V6A controlled matrix: missing current admission artifact reference cannot bind", async () => {
  const bytes = new TextEncoder().encode(htmlDocument("full"));
  const result = await runCase("https://controlled.test/unbound.html", bytes);
  assert.equal(result.status, "MATERIALIZED_CANONICAL_BINDING_REQUIRED");
  assert.equal(result.failure?.code, "CANONICAL_BINDING_FAILURE");
  assert.equal(result.binding?.bound, false);
});

test("V6A materializer requires a current valid canonical admission projection", async () => {
  const input = inputFor("https://controlled.test/invalid-projection", async () => response(htmlDocument("full")));
  input.projection = { ...projectionFor(), validation: { pass: false, issues: ["stale"] } };
  await assert.rejects(() => materializeAdmittedManifestation(input), /CANONICAL_ADMISSION_REFERENCE_INVALID/);
});

test("V6A materializer preserves only qualified artifacts as canonical output", async () => {
  const bytes = new TextEncoder().encode(htmlDocument("full"));
  const root = await mkdtemp(join(tmpdir(), "researchforge-v6a-test-"));
  const result = await runCase("https://controlled.test/persisted.html", bytes, undefined, [sha256(bytes)], { artifactSnapshotDirectory: root });
  assert.equal(result.artifact?.provenance.artifactSnapshotPath?.startsWith(root), true);
  assert.equal(result.manifestation.materializationStatus, "MATERIALIZED");
  assert.equal(result.manifestation.provenance.rawArtifactRetained, true);
});
