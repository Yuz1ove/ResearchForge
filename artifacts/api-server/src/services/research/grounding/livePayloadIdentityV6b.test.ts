import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanonicalAdmissionProjection } from "../canonical-admission-projection";
import { materializeAdmittedManifestation, type AdmittedManifestationMaterializationInput } from "./admittedManifestationMaterializer";
import { createStudyManifestation, materializeStudyManifestation, normalizedDocumentFromSections, verifyPayloadArticleIdentity, type CanonicalStudyIdentityInput } from "./studyManifestation";
import { qualifyFullTextArtifact } from "./fullTextAcquisitionV3";
import { readPayloadArticleIdentity } from "./scholarlyPayloadMaterializer";

const canonical: CanonicalStudyIdentityInput = { canonicalStudyId: "study:v6b", doi: "10.1234/identity", title: "Caffeine effects on adolescent sleep", authors: ["Ada Researcher", "Bo Lin"], year: 2024, venue: "Evidence Journal" };
const url = "https://controlled.test/article";
const body = "Participants completed the prespecified intervention and documented measurements. Observed estimates and uncertainty were reported independently with limitations and reproducible methods. ";
const sections = ["Methods", "Results", "Discussion", "References"].map(heading => ({ heading, text: body.repeat(8), pageStart: 1 }));
const text = sections.map(s => `${s.heading}. ${s.text}`).join("\n");
const snapshots = mkdtempSync(join(tmpdir(), "researchforge-v6b-tests-"));
const rows: Array<Record<string, unknown>> = [];
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function html(doi = canonical.doi, title = canonical.title) {
  return `<!doctype html><html><head><meta name="citation_title" content="${title}">${doi ? `<meta name="citation_doi" content="${doi}">` : ""}<meta name="citation_author" content="Ada Researcher"><meta name="citation_author" content="Bo Lin"><meta name="citation_publication_date" content="2024"><meta name="citation_journal_title" content="Evidence Journal"></head><body><article>${sections.map(s => `<h2>${s.heading}</h2><p>${s.text}</p>`).join("")}</article></body></html>`;
}
function input(payload: string, contentType = "text/html", target = canonical): AdmittedManifestationMaterializationInput {
  const bytes = new TextEncoder().encode(payload);
  const manifestation = createStudyManifestation({ canonical: target, manifestationIdentity: target, provider: "controlled", sourceRecordId: "source:v6b", sourceUrl: url, artifactUrl: url, versionType: "REPOSITORY_COPY", isOpenAccess: true, hostType: "repository" });
  const projection = {
    validation: { pass: true, issues: [] },
    decisions: [{ decisionId: "admission:v6b", studyId: target.canonicalStudyId, sourceId: "source:v6b", canonicalStatus: "ADMITTED", admissionClass: "LIMITED", admitted: true, accessState: "ABSTRACT_ONLY", evidenceRevision: "revision:v6b", qualifyingArtifactRefs: [hash(bytes)] }],
  } as unknown as CanonicalAdmissionProjection;
  return { canonical: target, manifestation, projection, decisionId: "admission:v6b", source: { title: target.title ?? "Unknown" }, options: { artifactSnapshotDirectory: snapshots, retryCount: 0, timeoutMs: 1000, resolveFullTextLocations: false, fetchImpl: async () => new Response(bytes, { status: 200, headers: { "content-type": contentType } }), pdfParser: async (_sourceId, _workflowId, _url, pdfBytes) => {
    assert.deepEqual(pdfBytes, bytes, "Parser must receive the exact hashed bytes");
    return { sourceId: "source:v6b", workflowId: "controlled", title: target.title ?? undefined, fullText: `${target.doi ?? ""}\n${text}`, sections, extractionMethod: "pdfminer", confidence: "high", requiresOcr: false, warnings: [] };
  } } };
}
async function run(id: string, request: AdmittedManifestationMaterializationInput) {
  const result = await materializeAdmittedManifestation(request);
  rows.push({ id, status: result.status, identity: result.extraction?.access_audit_v3?.artifact?.payloadIdentity ?? null, failure: result.failure ?? null, qualification: result.extraction?.access_audit_v3?.qualifyingFullText ?? false, qualifyingArtifactCount: result.artifact?.qualificationStatus === "QUALIFIED" ? 1 : 0, chunkCount: result.extraction?.chunks.length ?? 0 });
  return result;
}

test("V6B C01 exact DOI + correct PDF accepts hashed bytes", async () => {
  assert.equal((await run("C01", input("%PDF-1.7\ncontrolled\n%%EOF", "application/pdf"))).status, "QUALIFIED_AND_BOUND");
});
test("V6B C02 exact DOI overrides typography only", async () => {
  const result = await run("C02", input(html("https://doi.org/10.1234/IDENTITY", "Stylistically different title")));
  assert.equal(result.status, "QUALIFIED_AND_BOUND");
});
test("V6B C03 conflicting DOI overrides identical title and upstream MATCH", async () => {
  const result = await run("C03", input(html("10.1234/other")));
  assert.equal(result.failure?.code, "WRONG_ARTICLE_MATCH");
  assert.equal(result.artifact, undefined);
});
test("V6B C04 same title contradictory authors rejected", async () => {
  const result = await run("C04", input(html(null).replaceAll("Ada Researcher", "Someone Else"), "text/html", { ...canonical, doi: null }));
  assert.equal(result.failure?.code, "WRONG_ARTICLE_MATCH");
});
test("V6B C05 same title and authors conflicting year rejected", async () => {
  const result = await run("C05", input(html(null).replace("2024", "2010"), "text/html", { ...canonical, doi: null }));
  assert.equal(result.failure?.code, "WRONG_ARTICLE_MATCH");
});
test("V6B C06 no DOI deterministic title author year venue accepts", async () => {
  assert.equal((await run("C06", input(html(null), "text/html", { ...canonical, doi: null }))).status, "QUALIFIED_AND_BOUND");
});
test("V6B C07 title only never qualifies even with upstream MATCH", async () => {
  const result = await run("C07", input(html(null), "text/html", { canonicalStudyId: "study:v6b", title: canonical.title }));
  assert.equal(result.failure?.code, "CANONICAL_IDENTITY_INSUFFICIENT");
});
test("V6B C08 HTTP200 landing page is not full text", async () => {
  const result = await run("C08", input("<!doctype html><html><body><a>Download the article</a></body></html>"));
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
  assert.equal(result.extraction?.access_audit_v3?.qualifyingFullText, false);
});
test("V6B C09 challenge cannot qualify", async () => {
  const result = await run("C09", input("<!doctype html><html><body>Cloudflare CAPTCHA verify you are human</body></html>"));
  assert.equal(result.status, "MATERIALIZED_NOT_QUALIFIED");
});
test("V6B C10 corrupt PDF never reaches parser", async () => {
  const request = input(`%PDF-1.7\n${"x".repeat(3000)}`, "application/pdf");
  request.options.pdfParser = async () => { throw new Error("must not reach parser"); };
  assert.equal((await run("C10", request)).failure?.code, "PAYLOAD_TRUNCATED");
});
test("V6B C11 verified identity survives extraction failure without qualification", () => {
  const result = qualifyFullTextArtifact({ canonicalIdentity: canonical, payloadIdentity: { doi: canonical.doi }, artifactText: "", contentType: "application/pdf", initialOutcome: "PARSER_FAILED", httpStatus: 200, isOpenAccess: true });
  assert.equal(result.identityMatch, "MATCH");
  assert.equal(result.qualifyingFullText, false);
  assert.equal(result.outcome, "PARSER_FAILED");
  rows.push({ id: "C11", identity: result.artifact.payloadIdentity, qualification: false, failure: result.outcome });
});
test("V6B C12 wrong extractable PDF cannot admit text", async () => {
  const request = input("%PDF-1.7\nwrong article\n%%EOF", "application/pdf");
  const parser = request.options.pdfParser!;
  request.options.pdfParser = async (...args) => ({ ...(await parser(...args))!, fullText: `10.1234/wrong\n${text}` });
  const result = await run("C12", request);
  assert.equal(result.failure?.code, "WRONG_ARTICLE_MATCH");
  assert.equal(result.extraction?.text, "");
});
test("V6B C13 redirect to correct document accepts", async () => {
  const request = input(html());
  const fetcher = request.options.fetchImpl!;
  request.options.fetchImpl = async (...args) => { const r = await fetcher(...args); Object.defineProperty(r, "url", { value: "https://controlled.test/final" }); return r; };
  assert.equal((await run("C13", request)).status, "QUALIFIED_AND_BOUND");
});
test("V6B C14 redirect to unrelated document terminal", async () => {
  const request = input(html("10.1234/wrong"));
  const fetcher = request.options.fetchImpl!;
  let calls = 0;
  request.options.fetchImpl = async (...args) => { calls++; const r = await fetcher(...args); Object.defineProperty(r, "url", { value: "https://controlled.test/unrelated" }); return r; };
  assert.equal((await run("C14", request)).failure?.code, "WRONG_ARTICLE_MATCH");
  assert.equal(calls, 1);
});
test("V6B C15 UNKNOWN_POLICY blocks before fetch", async () => {
  const request = input(html());
  request.manifestation.accessPolicyDecision = "UNKNOWN_POLICY";
  request.options.fetchImpl = async () => { throw new Error("No network allowed"); };
  assert.equal((await run("C15", request)).status, "BLOCKED_BEFORE_FETCH");
});
test("V6B C16 rejected article provides zero study-fact inputs", async () => {
  const result = await run("C16", input(html("10.1234/wrong")));
  assert.deepEqual(result.extraction?.chunks, []);
  assert.deepEqual(result.extraction?.extracted_sections, []);
  assert.equal(result.manifestation.normalizedDocument, undefined);
});
test("V6B C17 rejected article produces zero qualifying artifacts", async () => {
  const result = await run("C17", input(html("10.1234/wrong")));
  assert.equal(result.artifact, undefined);
  assert.equal(result.binding, null);
  assert.equal(result.manifestation.qualificationStatus, "REJECTED");
});
test("V6B C18 equivalent identity is deterministic", () => {
  const first = verifyPayloadArticleIdentity(canonical, { doi: "https://doi.org/10.1234/IDENTITY" });
  const second = verifyPayloadArticleIdentity(canonical, { doi: "10.1234/identity" });
  assert.deepEqual(first, second);
  rows.push({ id: "C18", identity: first, deterministic: true });
});
test("V6B C19 bibliography DOI never authenticates document", () => {
  const identity = readPayloadArticleIdentity(`Other title\nAbstract\nBody text\nReferences\nDOI: ${canonical.doi}`, "PDF_TEXT");
  assert.equal(identity.doi, undefined);
});
test("V6B C20 URL/DOI metadata and source fallback cannot authenticate bytes", async () => {
  const request = input(html(null));
  request.source.doi = canonical.doi;
  const result = await run("C20", request);
  assert.equal(result.failure?.code, "CANONICAL_IDENTITY_INSUFFICIENT");
});
test("V6B C21 matching DOI cannot hide contradictory PMCID", () => {
  assert.equal(verifyPayloadArticleIdentity({ ...canonical, pmcid: "PMC1" }, { doi: canonical.doi, pmcid: "PMC2" }).reason, "WRONG_ARTICLE_MATCH");
});
test("V6B C22 source/provider namespaces cannot cross-match", () => {
  assert.notEqual(verifyPayloadArticleIdentity({ canonicalStudyId: "v6b", providerIds: { openalex: "123" } }, { providerIds: { semantic_scholar: "123" } }).decision, "MATCH");
});
test("V6B C23 explicit version relation cannot override payload DOI contradiction", () => {
  assert.equal(verifyPayloadArticleIdentity(canonical, { doi: "10.1234/preprint", relations: [{ canonicalIdentifier: canonical.doi!, manifestationIdentifier: "10.1234/preprint", relationType: "IsPreprintOf", provider: "datacite" }] }).reason, "WRONG_ARTICLE_MATCH");
});
test("V6B C24 stable PMC URL plus title is insufficient", () => {
  const result = qualifyFullTextArtifact({ sourceTitle: canonical.title, artifactTitle: canonical.title, artifactText: text, sections, url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/", httpStatus: 200, contentType: "text/html" });
  assert.equal(result.outcome, "CANONICAL_IDENTITY_INSUFFICIENT");
});
test("V6B C25 only hash refs bind a new payload", async () => {
  const request = input(html());
  request.projection.decisions[0]!.qualifyingArtifactRefs = [url];
  assert.equal((await run("C25", request)).status, "MATERIALIZED_CANONICAL_BINDING_REQUIRED");
});
test("V6B C26 foreign canonical target cannot borrow an admission", async () => {
  const request = input(html());
  request.canonical = { ...canonical, canonicalStudyId: "foreign" };
  await assert.rejects(materializeAdmittedManifestation(request), /CANONICAL_MANIFESTATION_IDENTITY_MISMATCH/);
});
test("V6B C27 bibliographic normalization retains contradictions", () => {
  const base = { ...canonical, doi: null, title: "Caffeine & sleep", authors: ["Researcher, Ada"] };
  assert.equal(verifyPayloadArticleIdentity(base, { ...base, title: "Ｃａｆｆｅｉｎｅ &amp; sleep!", authors: ["Ada Researcher"] }).decision, "MATCH");
});
test("V6B C28 insufficient discovery identity can be legally inspected but not promoted", async () => {
  const request = input(html(), "text/html", { canonicalStudyId: "study:v6b", title: canonical.title });
  request.manifestation.identityDecision = "POSSIBLE_MATCH";
  assert.equal((await run("C28", request)).failure?.code, "CANONICAL_IDENTITY_INSUFFICIENT");
});
test("V6B C29 real HTTP redirect chain is recorded and verified", async () => {
  const request = input(html());
  request.options.fetchImpl = async (target, init) => {
    assert.equal(init?.redirect, "manual");
    return String(target) === url ? new Response(null, { status: 302, headers: { location: "/final" } }) : new Response(html(), { status: 200, headers: { "content-type": "text/html" } });
  };
  const result = await run("C29", request);
  assert.equal(result.status, "QUALIFIED_AND_BOUND");
  assert.deepEqual(result.extraction?.download_audit?.redirectChain, [url, "https://controlled.test/final"]);
});
test("V6B C30 redirect to unknown policy stops before destination fetch", async () => {
  const request = input(html());
  let calls = 0;
  request.options.fetchImpl = async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://unknown.test/file.pdf" } }); };
  assert.equal((await run("C30", request)).failure?.code, "UNKNOWN_POLICY");
  assert.equal(calls, 1);
});
test("V6B C31 same surname with contradictory given author rejected", () => {
  assert.equal(verifyPayloadArticleIdentity({ ...canonical, doi: null }, { ...canonical, doi: null, authors: ["Bob Researcher"] }).reason, "WRONG_ARTICLE_MATCH");
});
test("V6B C32 single-letter title differences are never normalized away", () => {
  const base = { ...canonical, doi: null, title: "Effect of intervention A" };
  assert.notEqual(verifyPayloadArticleIdentity(base, { ...base, title: "Effect of intervention B" }).decision, "MATCH");
});
test("V6B C33 contradictory document DOI metadata fails closed", async () => {
  const result = await run("C33", input(html().replace("</head>", '<meta name="citation_doi" content="10.1234/other"></head>')));
  assert.equal(result.failure?.code, "WRONG_ARTICLE_MATCH");
});
test("V6B C34 citation DOI appearing mid-body cannot authorize PDF", () => {
  assert.equal(readPayloadArticleIdentity(`Article title. Abstract Body. References DOI: ${canonical.doi}`, "PDF_TEXT").doi, undefined);
});
test("V6B C35 rejected re-materialization drops stale normalized text", async () => {
  const request = input(html("10.1234/wrong"));
  request.manifestation.normalizedDocument = normalizedDocumentFromSections({ format: "FULL_HTML", sections });
  const result = await run("C35", request);
  assert.equal(result.manifestation.normalizedDocument, undefined);
  const unknown = materializeStudyManifestation({ manifestation: request.manifestation, identity: verifyPayloadArticleIdentity(canonical, {}), qualificationStatus: "QUALIFIED" });
  assert.equal(unknown.qualificationStatus, "REJECTED");
  assert.equal(unknown.normalizedDocument, undefined);
});
test("V6B C36 missing persistence prevents binding despite exact identity", async () => {
  const request = input(html());
  const nonDirectory = join(snapshots, "not-a-directory");
  writeFileSync(nonDirectory, "controlled persistence failure");
  request.options.artifactSnapshotDirectory = nonDirectory;
  const result = await run("C36", request);
  assert.equal(result.failure?.code, "ARTIFACT_PERSISTENCE_FAILURE");
  assert.equal(result.binding, null);
});
test("V6B C37 malformed DOI strings cannot be persistent proof", () => {
  assert.notEqual(verifyPayloadArticleIdentity({ ...canonical, doi: "garbage" }, { doi: "garbage" }).decision, "MATCH");
});
after(() => {
  if (process.env.V6B_QA_DIRECTORY) writeFileSync(join(process.env.V6B_QA_DIRECTORY, "MATRIX-OBSERVATIONS.json"), JSON.stringify({ evidenceMode: "CONTROLLED", rows }, null, 2));
});
