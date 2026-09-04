import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyFullTextRetry,
  qualifyFullTextArtifact,
} from "./fullTextAcquisitionV3";
import { extractSourceContent } from "./sourceContentExtractor";
import { materializeStructuredXml, sniffScholarlyPayload } from "./scholarlyPayloadMaterializer";
import {
  bindStudyManifestationIdentity,
  createStudyManifestation,
  dedupeStudyManifestations,
  materializeStudyManifestation,
  normalizedDocumentFromSections,
  revokeStudyManifestation,
  type CanonicalStudyIdentityInput,
  type StudyManifestation,
} from "./studyManifestation";

const canonical: CanonicalStudyIdentityInput = {
  canonicalStudyId: "study:controlled",
  doi: "10.1234/controlled",
  title: "Controlled intervention effects in secondary students",
  authors: ["Ada Researcher", "Bo Lin"],
  year: 2024,
  venue: "Journal of Controlled Evidence",
  studyPopulation: "secondary students",
  studyDesign: "randomized experiment",
};

const bodySections = [
  { heading: "Introduction", text: "Background and rationale for the controlled study. ".repeat(12) },
  { heading: "Methods", text: "Participants, allocation, measurements, and statistical analysis. ".repeat(12) },
  { heading: "Results", text: "Observed outcomes, effect estimates, and uncertainty are reported. ".repeat(12) },
  { heading: "Discussion", text: "Interpretation, limitations, and applicability are discussed. ".repeat(12) },
  { heading: "References", text: "Reference entries supporting the study context. ".repeat(12) },
];
const body = bodySections.map((section) => `${section.heading}. ${section.text}`).join("\n\n");

function discovered(input: Partial<Parameters<typeof createStudyManifestation>[0]> = {}): StudyManifestation {
  return createStudyManifestation({
    canonical,
    manifestationIdentity: {
      doi: canonical.doi,
      title: canonical.title,
      authors: canonical.authors,
      year: canonical.year,
      sourceRecordId: "record:controlled",
    },
    provider: "controlled_repository",
    sourceRecordId: "record:controlled",
    sourceUrl: "https://repository.example.edu/items/controlled.pdf",
    artifactUrl: "https://repository.example.edu/items/controlled.pdf",
    formatHint: "application/pdf",
    versionType: "REPOSITORY_COPY",
    isOpenAccess: true,
    license: "CC-BY-4.0",
    hostType: "repository",
    accessPath: ["controlled", "repository"],
    routeFingerprint: "route:controlled",
    providerMetadata: {},
    attemptId: "attempt:controlled:1",
    runId: "run:controlled",
    ...input,
  });
}

function qualify(format: "text/html" | "application/jats+xml" | "application/tei+xml" = "text/html") {
  return qualifyFullTextArtifact({
    sourceTitle: canonical.title,
    sourceDoi: canonical.doi,
    canonicalWorkId: canonical.canonicalStudyId,
    artifactTitle: canonical.title,
    artifactDoi: canonical.doi,
    artifactText: body,
    sections: bodySections,
    url: "https://repository.example.edu/items/controlled",
    contentType: format,
    parserUsed: "controlled-parser",
    parserVersion: "1",
    isOpenAccess: true,
    httpStatus: 200,
    byteLength: body.length,
    pageCount: format === "text/html" ? undefined : 6,
    initialOutcome: format === "text/html"
      ? "HTML_FULL_TEXT_FOUND"
      : format.includes("jats") ? "XML_JATS_FULL_TEXT_FOUND" : "XML_TEI_FULL_TEXT_FOUND",
  });
}

test("fixture 01: a robots-blocked publisher manifestation yields to an allowed OA repository manifestation", () => {
  const blocked = createStudyManifestation({
    canonical,
    manifestationIdentity: { doi: canonical.doi },
    provider: "publisher",
    sourceUrl: "https://publisher.example/article",
    versionType: "VERSION_OF_RECORD",
    isOpenAccess: false,
    policySignal: "ROBOTS_OR_TOS_BLOCKED",
    runId: "run:controlled",
  });
  const alternate = discovered({ provider: "unpaywall" });
  assert.equal(blocked.accessPolicyDecision, "ROBOTS_OR_TOS_BLOCKED");
  assert.equal(blocked.materializationStatus, "POLICY_BLOCKED");
  assert.equal(alternate.accessPolicyDecision, "ALLOWED_OPEN_REPOSITORY");
});

test("fixture 02: a publisher 403 does not prevent an identity-matched PMC JATS manifestation", () => {
  assert.equal(classifyFullTextRetry({ status: 403 }), "NOT_RETRYABLE");
  const jats = discovered({
    provider: "europe_pmc",
    sourceUrl: "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML",
    artifactUrl: "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML",
    formatHint: "application/jats+xml",
  });
  assert.equal(jats.identityDecision, "MATCH");
  assert.equal(jats.accessPolicyDecision, "ALLOWED_OFFICIAL_API");
});

test("fixture 03: HTML bytes returned from a PDF URL are not classified as PDF", () => {
  const html = new TextEncoder().encode("<!doctype html><html><body>article landing page</body></html>");
  const detection = sniffScholarlyPayload({ bytes: html, declaredContentType: "application/pdf", url: "https://example.edu/file.pdf" });
  assert.equal(detection.format, "HTML");
  assert.equal(detection.mismatch, true);
});

test("fixture 04: abstract-only HTML is rejected", () => {
  const abstract = "This abstract reports a study summary without the article body. ".repeat(8);
  const result = qualifyFullTextArtifact({
    sourceTitle: canonical.title,
    sourceDoi: canonical.doi,
    artifactTitle: canonical.title,
    artifactDoi: canonical.doi,
    artifactText: abstract,
    artifactAbstract: abstract,
    sections: [{ heading: "Abstract", text: abstract }],
    url: "https://repository.example.edu/abstract",
    contentType: "text/html",
    isOpenAccess: true,
    httpStatus: 200,
    initialOutcome: "HTML_FULL_TEXT_FOUND",
  });
  assert.equal(result.outcome, "ABSTRACT_ONLY");
});

test("fixture 05: complete article HTML qualifies and preserves normalized locators", () => {
  const result = qualify("text/html");
  const normalized = normalizedDocumentFromSections({ format: "FULL_HTML", title: canonical.title, sections: bodySections });
  assert.equal(result.qualifyingFullText, true);
  assert.ok(normalized.blocks.every((block) => block.locator.value.length > 0));
});

test("fixture 06: JATS XML materializes body structure and qualifies semantically", () => {
  const xml = `<article><front><article-meta><title-group><article-title>${canonical.title}</article-title></title-group><article-id pub-id-type="doi">${canonical.doi}</article-id></article-meta></front><body>${bodySections.slice(0, 4).map((section) => `<sec><title>${section.heading}</title><p>${section.text}</p></sec>`).join("")}</body><back><ref-list><ref>${bodySections[4]!.text}</ref></ref-list></back></article>`;
  const materialized = materializeStructuredXml(xml);
  assert.equal(materialized.format, "JATS_XML");
  assert.equal(qualify("application/jats+xml").qualifyingFullText, true);
});

test("fixture 07: TEI XML materializes body structure and qualifies semantically", () => {
  const xml = `<TEI><teiHeader><fileDesc><titleStmt><title>${canonical.title}</title></titleStmt></fileDesc></teiHeader><text><body>${bodySections.slice(0, 4).map((section) => `<div><head>${section.heading}</head><p>${section.text}</p></div>`).join("")}</body><back><listBibl><bibl>${bodySections[4]!.text}</bibl></listBibl></back></text></TEI>`;
  const materialized = materializeStructuredXml(xml);
  assert.equal(materialized.format, "TEI_XML");
  assert.equal(qualify("application/tei+xml").qualifyingFullText, true);
});

test("fixture 08: mirrors with the same checksum deduplicate to one canonical artifact", () => {
  const first = materializeStudyManifestation({
    manifestation: discovered(),
    identity: bindStudyManifestationIdentity({ canonical, manifestation: { doi: canonical.doi } }),
    checksumSha256: "a".repeat(64),
    qualificationStatus: "QUALIFIED",
  });
  const second = materializeStudyManifestation({
    manifestation: discovered({ provider: "openalex", routeFingerprint: "route:mirror" }),
    identity: bindStudyManifestationIdentity({ canonical, manifestation: { doi: canonical.doi } }),
    checksumSha256: "a".repeat(64),
    qualificationStatus: "QUALIFIED",
  });
  assert.equal(dedupeStudyManifestations([first, second]).length, 1);
});

test("fixture 09: explicit preprint relation binds two DOI manifestations to one canonical study", () => {
  const result = bindStudyManifestationIdentity({
    canonical,
    manifestation: {
      doi: "10.5678/preprint",
      relations: [{ relationType: "IsPreprintOf", canonicalIdentifier: canonical.doi!, manifestationIdentifier: "10.5678/preprint", provider: "datacite" }],
    },
  });
  assert.equal(result.decision, "MATCH");
  assert.equal(result.evidence[0]?.type, "JOURNAL_PREPRINT_RELATION");
});

test("fixture 10: similar title with different authors, year, and design is an identity mismatch", () => {
  const result = bindStudyManifestationIdentity({
    canonical: { ...canonical, doi: null },
    manifestation: { title: canonical.title, authors: ["Other Author"], year: 2015, studyDesign: "qualitative interview" },
  });
  assert.equal(result.decision, "MISMATCH");
});

test("fixture 11: a review remains a manifestation record and never decides direct-study admission", () => {
  const review = createStudyManifestation({
    canonical: { ...canonical, doi: null },
    manifestationIdentity: { title: `Systematic review of ${canonical.title}`, authors: canonical.authors, year: canonical.year, documentType: "Systematic Review" },
    provider: "controlled",
    sourceUrl: "https://repository.example.edu/review",
    versionType: "REPOSITORY_COPY",
    isOpenAccess: true,
    hostType: "repository",
  });
  assert.equal(review.directStudyAdmissionDecided, false);
  assert.notEqual(review.identityDecision, "MATCH");
});

test("fixture 12: a protocol and results paper cannot be merged", () => {
  const result = bindStudyManifestationIdentity({
    canonical,
    manifestation: { doi: "10.1234/protocol", title: canonical.title, authors: canonical.authors, year: canonical.year, documentType: "Study Protocol" },
  });
  assert.equal(result.decision, "MISMATCH");
});

test("fixture 13: an image-only PDF requires OCR before it can qualify", () => {
  const blocked = qualifyFullTextArtifact({
    sourceTitle: canonical.title,
    sourceDoi: canonical.doi,
    artifactTitle: canonical.title,
    artifactDoi: canonical.doi,
    artifactText: "",
    sections: [],
    url: "https://repository.example.edu/scanned.pdf",
    contentType: "application/pdf",
    isOpenAccess: true,
    httpStatus: 200,
    pageCount: 6,
    initialOutcome: "OCR_REQUIRED",
  });
  assert.equal(blocked.outcome, "OCR_REQUIRED");
  const ocr = qualifyFullTextArtifact({
    sourceTitle: canonical.title, sourceDoi: canonical.doi, artifactTitle: canonical.title, artifactDoi: canonical.doi,
    artifactText: body, sections: bodySections, url: "https://repository.example.edu/scanned.pdf", contentType: "application/pdf",
    isOpenAccess: true, httpStatus: 200, pageCount: 6, initialOutcome: "SCANNED_PDF",
  });
  assert.equal(ocr.qualifyingFullText, true);
});

test("fixture 14: insufficient OCR text still fails qualification", () => {
  const result = qualifyFullTextArtifact({
    sourceTitle: canonical.title, sourceDoi: canonical.doi, artifactTitle: canonical.title, artifactDoi: canonical.doi,
    artifactText: "Methods unreadable", sections: [{ heading: "Methods", text: "unreadable" }],
    url: "https://repository.example.edu/scanned.pdf", contentType: "application/pdf", isOpenAccess: true,
    httpStatus: 200, pageCount: 6, initialOutcome: "SCANNED_PDF",
  });
  assert.equal(result.qualifyingFullText, false);
});

test("fixture 15: robots or unknown publisher policy is rejected before fetch", async () => {
  let fetchCount = 0;
  const result = await extractSourceContent({ title: canonical.title!, url: "https://publisher.example/article", isOpenAccess: false }, {
    fetchImpl: (async () => { fetchCount += 1; return new Response("unexpected"); }) as typeof fetch,
  });
  assert.equal(fetchCount, 0);
  assert.match(result.extraction_warnings.join("|"), /ROBOTS_OR_POLICY_SKIPPED/u);
});

test("fixture 16: HTTP 403 is non-retryable and no proxy or user-agent fallback occurs", async () => {
  let fetchCount = 0;
  const result = await extractSourceContent({ title: canonical.title!, url: "https://repository.example.edu/article", isOpenAccess: true }, {
    retryCount: 1,
    fetchImpl: (async (_request, init) => {
      fetchCount += 1;
      assert.equal(Object.keys((init?.headers ?? {}) as Record<string, string>).some((key) => /proxy/iu.test(key)), false);
      return new Response("forbidden", { status: 403, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
  });
  assert.equal(fetchCount, 1);
  assert.equal(result.download_audit?.attempts[0]?.retryEligibility, "NOT_RETRYABLE");
});

test("fixture 17: UNKNOWN identity never collapses into MATCH", () => {
  const result = bindStudyManifestationIdentity({ canonical: { canonicalStudyId: "unknown" }, manifestation: {} });
  assert.equal(result.decision, "UNKNOWN");
});

test("fixture 18: unknown access policy fails closed", () => {
  const manifestation = createStudyManifestation({
    canonical,
    manifestationIdentity: { doi: canonical.doi },
    provider: "unknown",
    sourceUrl: "https://unknown.example/artifact",
    versionType: "UNKNOWN_VERSION",
    isOpenAccess: null,
  });
  assert.equal(manifestation.accessPolicyDecision, "UNKNOWN_POLICY");
  assert.equal(manifestation.materializationStatus, "POLICY_BLOCKED");
});

test("fixture 19: a fuzzy title without relation evidence is not admitted", () => {
  const result = bindStudyManifestationIdentity({
    canonical: { ...canonical, doi: null },
    manifestation: { title: "Controlled intervention effects among students", officialRepositoryIdentifier: "repo:1" },
  });
  assert.notEqual(result.decision, "MATCH");
});

test("fixture 20: revocation clears materialized chunks and canonical qualification", () => {
  const original = materializeStudyManifestation({
    manifestation: discovered(),
    identity: bindStudyManifestationIdentity({ canonical, manifestation: { doi: canonical.doi } }),
    checksumSha256: "b".repeat(64),
    artifactSnapshotPath: "/controlled/snapshot.pdf",
    normalizedDocument: normalizedDocumentFromSections({ format: "PDF", title: canonical.title, sections: bodySections }),
    qualificationStatus: "QUALIFIED",
  });
  const revoked = revokeStudyManifestation(original);
  assert.equal(revoked.materializationStatus, "REVOKED");
  assert.equal(revoked.qualificationStatus, "REJECTED");
  assert.equal(revoked.normalizedDocument, undefined);
  assert.equal(revoked.checksumSha256, undefined);
  assert.equal(revoked.provenance.rawArtifactRetained, false);
});
