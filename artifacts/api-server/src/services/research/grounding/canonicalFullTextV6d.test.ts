import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtemp, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { materializeCanonicalIdentitySnapshot, type CanonicalSnapshotMaterializationInput } from "./admittedManifestationMaterializer";
import { resolveIndependentCanonicalIdentity } from "./acceptedSourceEnrichment";
import { identityHash, type CanonicalIdentitySnapshot } from "./canonicalIdentityRestoration";
import { persistImmutableArtifact, type SourceContentExtractorOptions } from "./sourceContentExtractor";

// Synthetic responses and parsers only. This suite never uses live V6C values.
const canonicalTitle = "Controlled sleep study and attention";
const canonicalDoi = "10.5555/v6d.controlled";
const url = "https://pmc.ncbi.nlm.nih.gov/articles/PMC900001/";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const paragraph = "This controlled study evaluates participants using documented methods and reproducible measurements. The results and limitations are reported with sufficient detail for scholarly extraction. ";
function html(patch: { doi?: string; title?: string; author?: string; year?: string; heading?: string; abstract?: boolean; noDoi?: boolean } = {}) {
  const title = patch.title ?? canonicalTitle;
  const body = patch.abstract ? `<h2>Abstract</h2><p>${paragraph}</p>` : ["Introduction", "Methods", "Results", "Discussion", "References"].map(h => `<h2>${h}</h2><p>${paragraph.repeat(5)}</p><p>${paragraph.repeat(3)}</p>`).join("");
  return `<!doctype html><html><head><meta name="citation_title" content="${title}">${patch.noDoi ? "" : `<meta name="citation_doi" content="${patch.doi ?? canonicalDoi}">`}<meta name="citation_author" content="${patch.author ?? "Alice Example"}"><meta name="citation_publication_date" content="${patch.year ?? "2024"}"><meta name="citation_journal_title" content="Controlled Journal"></head><body><article><h1>${patch.heading ?? title}</h1>${body}</article></body></html>`;
}
async function fixture(canonicalUrl = url) {
  const dir = await mkdtemp(join(tmpdir(), "researchforge-v6d-controlled-"));
  const canonical = { sourceId: "CONTROLLED-01", canonicalStudyId: "canonical:CONTROLLED-01", revision: 3, title: "Controlled sleep study ...", pmcid: "PMC900001", url: canonicalUrl };
  const baseline: CanonicalIdentitySnapshot = { canonical, sourceHash: identityHash("CONTROLLED original"), sourceVersion: "CONTROLLED-old-revision-3", observedAt: "2026-08-01T00:00:00Z", payloadMaterializedAt: "2026-08-02T00:00:00Z", canonicalHash: identityHash(canonical) };
  const restored = await resolveIndependentCanonicalIdentity(baseline, { fetchImpl: async () => new Response(JSON.stringify({ paperId: "a".repeat(40), title: canonicalTitle, authors: [{ name: "Alice Example" }], year: 2024, venue: "Controlled Journal", externalIds: { DOI: canonicalDoi, PubMed: "123", PubMedCentral: "PMC900001" } }), { headers: { "content-type": "application/json" } }) });
  assert.equal(restored.resolution.ok, true);
  if (!restored.resolution.ok) throw new Error("CONTROLLED_AUTHORITY_FAILED");
  const snapshot = Buffer.from(JSON.stringify(restored.resolution.value));
  const seed = Buffer.from(JSON.stringify({ snapshot: baseline }));
  const snapshotPath = join(dir, "authority.json"), seedProvenancePath = join(dir, "seed.json");
  await writeFile(snapshotPath, snapshot); await writeFile(seedProvenancePath, seed);
  // The job must be outside the protected authority directory.
  const jobDirectory = await mkdtemp(join(tmpdir(), "researchforge-v6d-job-"));
  const input: CanonicalSnapshotMaterializationInput = { authorityOrigin: "V6C_CANONICAL_SNAPSHOT", snapshotPath, snapshotSha256: hash(snapshot), seedProvenancePath, seedProvenanceSha256: hash(seed), caseId: "01", jobId: `controlled-${randomUUID()}`, jobDirectory };
  return input;
}
async function run(payload = html(), contentType = "text/html", config: { input?: CanonicalSnapshotMaterializationInput; transport?: typeof fetch; pdfParser?: SourceContentExtractorOptions["pdfParser"] } = {}) {
  const input = config.input ?? await fixture();
  let requests = 0;
  const bytes = Buffer.from(payload);
  const result = await materializeCanonicalIdentitySnapshot(input, { fetchImpl: async (request, init) => {
    requests++; assert.equal(init?.redirect, "manual");
    return config.transport ? config.transport(request, init) : new Response(bytes, { headers: { "content-type": contentType } });
  }, ...(config.pdfParser ? { pdfParser: config.pdfParser } : {}) });
  assert.equal(result.writerCalls, 0); assert.equal(result.generalizationReady, false);
  assert.ok(requests <= 1); assert.equal(result.budget.retried, 0);
  if (result.status === "BLOCKED") {
    assert.equal(result.manifest, undefined);
    assert.equal((await readdir(input.jobDirectory)).includes("CANONICAL-FULLTEXT-MANIFEST.json"), false);
    assert.equal(result.extraction?.text ?? "", "");
  }
  return { result, requests, input, bytes };
}
const matrix: Array<{ id: string; name: string; result: string; evidenceMode: string }> = [];
function controlled(id: string, name: string, fn: () => Promise<void>) {
  test(`V6D ${id} CONTROLLED ${name}`, async () => {
    try { await fn(); matrix.push({ id, name, result: "PASS", evidenceMode: "CONTROLLED" }); }
    catch (error) { matrix.push({ id, name, result: "FAIL", evidenceMode: "CONTROLLED" }); throw error; }
  });
}
controlled("C01", "exact canonical DOI and title admit", async () => { assert.equal((await run()).result.status, "QUALIFIED"); });
controlled("C02", "harmless title punctuation and DOI normalization", async () => { assert.equal((await run(html({ title: "Controlled sleep study: and attention", doi: "https://doi.org/10.5555/V6D.CONTROLLED" }))).result.status, "QUALIFIED"); });
controlled("C03", "conflicting DOI and similar title reject", async () => { assert.equal((await run(html({ doi: "10.5555/rejected" }))).result.status, "BLOCKED"); });
controlled("C04", "exact DOI and title cannot hide wrong author or year", async () => { const r = (await run(html({ author: "Wrong Person", year: "2010" }))).result; assert.equal(r.status, "BLOCKED"); assert.ok(r.reasonCodes.includes("CANONICAL_BIBLIOGRAPHY_CONFLICT")); });
controlled("C05", "redirect to wrong article cannot make second request", async () => { const r = await run(html(), "text/html", { transport: async () => new Response(null, { status: 302, headers: { location: "https://pmc.ncbi.nlm.nih.gov/articles/PMC900002/" } }) }); assert.equal(r.result.status, "BLOCKED"); assert.equal(r.requests, 1); });
controlled("C06", "PDF response with HTML login rejects", async () => { assert.equal((await run("<html><body>Login required; sign in to access</body></html>", "application/pdf")).result.status, "BLOCKED"); });
controlled("C07", "PDF response with HTML error rejects", async () => { assert.equal((await run("<html><body>500 internal server error</body></html>", "application/pdf")).result.status, "BLOCKED"); });
controlled("C08", "truncated PDF cannot call parser", async () => { let parsed = 0; const r = await run("%PDF-1.7\n" + "x".repeat(3000), "application/pdf", { pdfParser: async () => { parsed++; return null; } }); assert.equal(r.result.status, "BLOCKED"); assert.equal(parsed, 0); });
controlled("C09", "abstract only is not qualifying", async () => { assert.equal((await run(html({ abstract: true }))).result.status, "BLOCKED"); });
controlled("C10", "metadata JSON is not qualifying", async () => { assert.equal((await run(JSON.stringify({ title: canonicalTitle, doi: canonicalDoi }), "application/json")).result.status, "BLOCKED"); });
controlled("C11", "unknown policy prevents request", async () => { const r = await run(html(), "text/html", { input: await fixture("https://unknown.invalid/article") }); assert.equal(r.result.policy, "UNKNOWN_POLICY"); assert.equal(r.requests, 0); });
controlled("C12", "robots and TOS prevent request", async () => { for (const policySignal of ["ROBOTS_BLOCKED", "TOS_BLOCKED"]) { const input = await fixture(); input.policySignal = policySignal; const r = await run(html(), "text/html", { input }); assert.equal(r.result.policy, "ROBOTS_OR_TOS_BLOCKED"); assert.equal(r.requests, 0); } });
controlled("C13", "missing canonical authority fails before request", async () => { const input = await fixture(); input.snapshotPath += ".missing"; await assert.rejects(materializeCanonicalIdentitySnapshot(input), /ENOENT/u); });
controlled("C14", "rejected payload authority and DOI seed explicitly forbidden", async () => { const input = await fixture(); await assert.rejects(materializeCanonicalIdentitySnapshot({ ...input, authorityOrigin: "payload-derived" } as unknown as CanonicalSnapshotMaterializationInput), /REJECTED_IDENTITY_AUTHORITY_INPUT/u); await assert.rejects(materializeCanonicalIdentitySnapshot({ ...input, acquisitionDoi: "10.5555/rejected" } as CanonicalSnapshotMaterializationInput), /REJECTED_IDENTITY_AUTHORITY_INPUT/u); });
controlled("C15", "duplicate completed job reuses artifact without network", async () => { const r = await run(); const duplicate = await materializeCanonicalIdentitySnapshot(r.input, { fetchImpl: async () => { throw new Error("DUPLICATE_NETWORK_FORBIDDEN"); } }); assert.deepEqual(duplicate, JSON.parse(JSON.stringify(r.result))); });
controlled("C16", "timeout and transient failure obey zero retry budget", async () => { for (const transport of [async () => { throw new DOMException("controlled timeout", "AbortError"); }, async () => new Response("Unavailable", { status: 503 })]) { const r = await run(html(), "text/html", { transport }); assert.equal(r.requests, 1); assert.equal(r.result.status, "BLOCKED"); } });
controlled("C17", "permanent failure receives no retry", async () => { const r = await run(html(), "text/html", { transport: async () => new Response("Gone", { status: 410 }) }); assert.equal(r.requests, 1); assert.equal(r.result.status, "BLOCKED"); });
controlled("C18", "canonical head metadata but wrong article body header rejects", async () => { const r = await run(html({ heading: "Unrelated oceanography research" })); assert.equal(r.result.status, "BLOCKED"); assert.equal(r.result.identity?.decision, "MISMATCH"); });
controlled("C19", "valid raw and parsed bytes have immutable manifest hashes", async () => { const r = await run(); const m = r.result.manifest!; assert.ok(m); assert.equal(m.rawArtifactSha256, hash(r.bytes)); assert.equal(hash(await readFile(m.rawArtifactPath)), m.rawArtifactSha256); assert.equal(hash(await readFile(m.parsedArtifactPath)), m.parsedArtifactSha256); assert.equal(m.authority.snapshotSha256, r.input.snapshotSha256); });
controlled("C20", "materialization has zero Writer calls", async () => { const r = await run(); assert.equal(r.result.writerCalls, 0); const source = await readFile(new URL("./admittedManifestationMaterializer.ts", import.meta.url), "utf8"); assert.doesNotMatch(source, /from\s+["'][^"']*(?:report-writer|llm-service|reportComposer)/u); });
controlled("C21", "snapshot corruption is not accepted", async () => { const input = await fixture(); await writeFile(input.snapshotPath, "{}"); await assert.rejects(materializeCanonicalIdentitySnapshot(input), /V6C_IDENTITY_AUTHORITY_HASH_MISMATCH/u); });
controlled("C22", "equal concurrent atomic writes never overwrite different content", async () => { const dir = await mkdtemp(join(tmpdir(), "v6d-immutable-")); const path = join(dir, "raw.bin"); await Promise.all([persistImmutableArtifact(path, Buffer.from("same")), persistImmutableArtifact(path, Buffer.from("same"))]); await assert.rejects(persistImmutableArtifact(path, Buffer.from("different")), /IMMUTABLE_ARTIFACT_CONFLICT/u); assert.equal(await readFile(path, "utf8"), "same"); assert.deepEqual(await readdir(dir), ["raw.bin"]); });
controlled("C23", "missing canonical DOI in body cannot use shared PMCID", async () => { assert.equal((await run(html({ noDoi: true }))).result.status, "BLOCKED"); });
controlled("C24", "PDF parser receives exact downloaded bytes", async () => { const payload = "%PDF-1.7\ncontrolled only\n%%EOF"; const r = await run(payload, "application/pdf", { pdfParser: async (sourceId, workflowId, _url, bytes) => { assert.ok(bytes); assert.deepEqual(Buffer.from(bytes), Buffer.from(payload)); return { sourceId, workflowId, title: canonicalTitle, fullText: `DOI: ${canonicalDoi}\nAuthors: Alice Example\nYear: 2024\nAbstract\n${paragraph.repeat(30)}`, sections: ["Methods", "Results", "Discussion"].map((heading, i) => ({ heading, text: paragraph.repeat(6), pageStart: i + 1 })), extractionMethod: "pdfminer", confidence: "high", requiresOcr: false, warnings: [] }; } }); assert.equal(r.result.status, "QUALIFIED"); });
controlled("C25", "implicit final destination change rejects even matching metadata", async () => { const r = await run(html(), "text/html", { transport: async () => { const response = new Response(html(), { headers: { "content-type": "text/html" } }); Object.defineProperty(response, "url", { value: "https://pmc.ncbi.nlm.nih.gov/articles/PMC900002/" }); return response; } }); assert.equal(r.result.status, "BLOCKED"); });
after(async () => {
  if (process.env.V6D_MATRIX_PATH) await writeFile(process.env.V6D_MATRIX_PATH, JSON.stringify({ evidenceMode: "CONTROLLED", requiredCases: 20, rows: matrix, total: matrix.length, passed: matrix.filter(r => r.result === "PASS").length }, null, 2) + "\n", { flag: "wx" });
});
