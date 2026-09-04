import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { classifyFullTextRetry, qualifyFullTextArtifact } from "./fullTextAcquisitionV3";
import {
  discoverLandingArtifactLinks,
  inspectScholarlyHtml,
  materializeStructuredXml,
  resolveCandidateUrl,
  sniffScholarlyPayload,
} from "./scholarlyPayloadMaterializer";
import { extractSourceContent } from "./sourceContentExtractor";

const encoder = new TextEncoder();
const paragraph = "This controlled scholarly paragraph preserves a substantive argument, documentary context, analytical reasoning, citations, limitations, and enough exact text for deterministic format-aware qualification. ";
const articleHtml = (headings = ["Context", "Argument", "Evidence", "Interpretation", "References"]) => `<html><head><meta name="citation_title" content="Controlled Article"><meta name="citation_doi" content="10.1234/controlled"><script type="application/ld+json">{"@type":"ScholarlyArticle"}</script></head><body><article>${headings.map((heading) => `<h2>${heading}</h2><p>${paragraph.repeat(5)}</p>`).join("")}</article></body></html>`;

test("fixture 01: real PDF bytes override a wrong declared Content-Type", () => {
  const detected = sniffScholarlyPayload({ bytes: encoder.encode("%PDF-1.7 controlled"), declaredContentType: "text/html" });
  assert.equal(detected.format, "PDF");
  assert.equal(detected.detectedMime, "application/pdf");
  assert.equal(detected.mismatch, true);
});

test("fixture 02: HTML pretending to be PDF is byte-classified as HTML", () => {
  const detected = sniffScholarlyPayload({ bytes: encoder.encode("<!doctype html><html><body>Error</body></html>"), declaredContentType: "application/pdf", url: "https://example.edu/a.pdf" });
  assert.equal(detected.format, "HTML");
  assert.equal(detected.mismatch, true);
});

test("fixture 03: citation_pdf_url is a high-confidence bounded landing signal", () => {
  const links = discoverLandingArtifactLinks('<meta content="/paper.pdf" name="citation_pdf_url">', "https://repo.example.edu/item/1");
  assert.deepEqual(links.map((link) => [link.url, link.formatHint, link.confidence]), [["https://repo.example.edu/paper.pdf", "PDF", "HIGH"]]);
});

test("fixture 04: direct PDF anchors resolve relative URLs", () => {
  const links = discoverLandingArtifactLinks('<a href="files/article.pdf">Download PDF</a>', "https://repo.example.edu/item/");
  assert.equal(links[0]?.url, "https://repo.example.edu/item/files/article.pdf");
});

test("fixture 05: abstract-only scholarly HTML stays non-fulltext", () => {
  const inspected = inspectScholarlyHtml(`<html><head><meta name="citation_title" content="Controlled"></head><body><h2>Abstract</h2><p>${paragraph}</p></body></html>`, "https://journal.example/article");
  assert.equal(inspected.payloadClass, "HTML_ABSTRACT_ONLY");
});

test("fixture 06: structured full-text HTML is recognized", () => {
  const inspected = inspectScholarlyHtml(articleHtml(["Methods", "Results", "Discussion"]), "https://journal.example/article");
  assert.equal(inspected.payloadClass, "HTML_FULLTEXT");
});

test("fixture 07: JATS XML preserves body sections, captions, and references", () => {
  const xml = `<?xml version="1.0"?><article xmlns="https://jats.nlm.nih.gov"><front><article-meta><title-group><article-title>JATS Article</article-title></title-group><article-id pub-id-type="doi">10.1234/jats</article-id><abstract><p>Summary</p></abstract></article-meta></front><body><sec><title>Methods</title><p>${paragraph.repeat(3)}</p><fig><caption><p>Figure one caption</p></caption></fig></sec><sec><title>Results</title><p>${paragraph.repeat(3)}</p></sec></body><back><ref-list><ref><mixed-citation>Reference one</mixed-citation></ref></ref-list></back></article>`;
  const materialized = materializeStructuredXml(xml);
  assert.equal(materialized.format, "JATS_XML");
  assert.equal(materialized.doi, "10.1234/jats");
  assert.ok(materialized.sections.length >= 2);
  assert.match(materialized.text, /Reference one/u);
});

test("fixture 08: TEI XML uses the TEI header, div/head/p, and listBibl", () => {
  const xml = `<?xml version="1.0"?><TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>TEI Article</title></titleStmt><publicationStmt><idno type="DOI">10.1234/tei</idno></publicationStmt></fileDesc><profileDesc><abstract><p>Summary</p></abstract></profileDesc></teiHeader><text><body><div><head>Analysis</head><p>${paragraph.repeat(3)}</p></div><div><head>Interpretation</head><p>${paragraph.repeat(3)}</p></div></body><back><listBibl><biblStruct><monogr><title>Reference two</title></monogr></biblStruct></listBibl></back></text></TEI>`;
  const materialized = materializeStructuredXml(xml);
  assert.equal(materialized.format, "TEI_XML");
  assert.equal(materialized.title, "TEI Article");
  assert.equal(materialized.doi, "10.1234/tei");
  assert.match(materialized.text, /Reference two/u);
});

test("fixture 09: JSON metadata is not classified as full text", () => {
  assert.equal(sniffScholarlyPayload({ bytes: encoder.encode('{"title":"Metadata"}'), declaredContentType: "application/octet-stream" }).payloadClass, "JSON_METADATA");
});

test("fixture 10: login HTML is explicit", () => {
  assert.equal(inspectScholarlyHtml('<html><body><form class="login"><p>Sign in to continue to institutional access</p></form></body></html>', "https://example.edu").payloadClass, "HTML_LOGIN");
});

test("fixture 11: paywall HTML is explicit", () => {
  assert.equal(inspectScholarlyHtml("<html><body><p>Purchase article access or subscribe to access.</p></body></html>", "https://example.edu").payloadClass, "HTML_PAYWALL");
});

test("fixture 12: HTTP-200 error pages are explicit", () => {
  assert.equal(inspectScholarlyHtml("<html><body><h1>Service unavailable</h1></body></html>", "https://example.edu").payloadClass, "HTML_ERROR");
});

test("fixture 13: scanned/no-text PDF remains blocked when OCR is unavailable", async () => {
  const result = await extractSourceContent({ sourceId: "scan", title: "Scanned article", url: "https://repo.example.edu/scan.pdf", isOpenAccess: true, provider: "manual" }, {
    fetchImpl: async () => new Response(encoder.encode("%PDF-1.7 scanned"), { status: 200, headers: { "content-type": "application/pdf" } }),
    pdfParser: async () => ({ sourceId: "scan", workflowId: "wf", extractionMethod: "pdfminer", fullText: "", confidence: "low", requiresOcr: true, warnings: [] }),
  });
  assert.notEqual(result.access_level, "full_text");
  assert.equal(result.extraction_warnings.includes("OCR_DISABLED"), true);
});

const qualificationBase = {
  sourceTitle: "Controlled Article",
  sourceDoi: "10.1234/controlled",
  canonicalWorkId: "10.1234/controlled",
  artifactTitle: "Controlled Article",
  artifactDoi: "10.1234/controlled",
  artifactText: paragraph.repeat(25),
  sections: ["Methods", "Results", "Discussion"].map((heading) => ({ heading, text: paragraph.repeat(4) })),
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC123/",
  contentType: "text/html",
  isOpenAccess: true,
  httpStatus: 200,
  initialOutcome: "HTML_FULL_TEXT_FOUND" as const,
};

test("fixture 14: title mismatch is rejected", () => {
  const result = qualifyFullTextArtifact({ ...qualificationBase, sourceDoi: null, artifactDoi: null, artifactTitle: "Unrelated Document" });
  assert.equal(result.outcome, "WRONG_ARTICLE_MATCH");
});

test("fixture 15: DOI mismatch is rejected", () => {
  const result = qualifyFullTextArtifact({ ...qualificationBase, artifactDoi: "10.9999/wrong" });
  assert.equal(result.outcome, "WRONG_ARTICLE_MATCH");
});

test("V6B tightened invariant: title plus unbound PMC URL is not verified identity", () => {
  const title = "Caffeine Consuming Children and Adolescents Show Altered Sleep Behavior";
  const result = qualifyFullTextArtifact({
    ...qualificationBase,
    sourceTitle: `${title} ...`,
    artifactTitle: title,
    sourceDoi: null,
    artifactDoi: null,
    canonicalWorkId: "provider:web:title:caffeine consuming children and adolescents show altered sleep behavior",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4701022/",
  });
  assert.equal(result.artifact.identityStrength, "NONE");
  assert.equal(result.qualifyingFullText, false);
  assert.equal(result.outcome, "CANONICAL_IDENTITY_INSUFFICIENT");
});

test("forensic boundary: a short shared title prefix remains weak even on PMC", () => {
  const result = qualifyFullTextArtifact({
    ...qualificationBase,
    sourceTitle: "Shared Short Title Prefix",
    artifactTitle: "Shared Short Title Prefix With A Different Extended Claim",
    sourceDoi: null,
    artifactDoi: null,
    canonicalWorkId: "provider:web:title:shared-short-title-prefix",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC999/",
  });
  assert.equal(result.artifact.identityStrength, "NONE");
  assert.equal(result.outcome, "CANONICAL_IDENTITY_INSUFFICIENT");
});

test("forensic negative: exact title on a non-repository host remains weak without bibliographic identity", () => {
  const result = qualifyFullTextArtifact({
    ...qualificationBase,
    sourceTitle: "Long Exact Controlled Scholarly Article Title",
    artifactTitle: "Long Exact Controlled Scholarly Article Title",
    sourceDoi: null,
    artifactDoi: null,
    canonicalWorkId: "provider:web:title:long-exact-controlled-scholarly-article-title",
    url: "https://journal.example/article",
  });
  assert.equal(result.artifact.identityStrength, "NONE");
  assert.equal(result.qualifyingFullText, false);
});

test("fixture 16: landing resolution detects a direct-link loop", async () => {
  const result = await extractSourceContent({ sourceId: "loop", title: "Loop", url: "https://repo.example.edu/loop", isOpenAccess: true, provider: "manual" }, {
    fetchImpl: async () => new Response('<html><body><a href="/loop">Full Text</a></body></html>', { status: 200, headers: { "content-type": "text/html" } }),
  });
  assert.ok(result.landing_resolution_trace?.some((entry) => entry.outcome === "RESOLUTION_LOOP_DETECTED"));
  assert.notEqual(result.access_level, "full_text");
});

test("fixture 17: landing resolution stops at depth two", async () => {
  const result = await extractSourceContent({ sourceId: "depth", title: "Depth", url: "https://repo.example.edu/a", isOpenAccess: true, provider: "manual" }, {
    fetchImpl: async (request) => {
      const path = new URL(String(request)).pathname;
      const next = path === "/a" ? "/b" : path === "/b" ? "/c" : "/d";
      return new Response(`<html><body><a href="${next}">Full Text</a></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    },
  });
  assert.ok(result.landing_resolution_trace?.some((entry) => entry.outcome === "DIRECT_ARTIFACT_FOLLOWED"));
  assert.equal(result.failure_reason, "RESOLVER_DEPTH_EXCEEDED");
});

test("fixture 18: duplicate full-text links are deduplicated", () => {
  const links = discoverLandingArtifactLinks('<meta name="citation_pdf_url" content="/a.pdf"><a href="/a.pdf">Download PDF</a><embed src="/a.pdf">', "https://repo.example.edu/item");
  assert.equal(links.length, 1);
});

test("fixture 19: a repository landing page materializes its direct PDF", async () => {
  const parsed: ParsedDocument = {
    sourceId: "repository-landing",
    workflowId: "wf",
    extractionMethod: "pdfminer",
    title: "Repository Article",
    fullText: `10.1234/repository ${paragraph.repeat(20)}`,
    sections: ["Methods", "Results", "Discussion"].map((heading, index) => ({ heading, text: paragraph.repeat(4), pageStart: index + 1 })),
    confidence: "high",
    requiresOcr: false,
    warnings: [],
  };
  const result = await extractSourceContent({ sourceId: "repository-landing", workflowId: "wf", title: "Repository Article", doi: "10.1234/repository", url: "https://repo.example.edu/item", isOpenAccess: true, provider: "manual" }, {
    fetchImpl: async (request) => String(request).endsWith(".pdf")
      ? new Response(encoder.encode("%PDF-1.7 controlled"), { status: 200, headers: { "content-type": "text/html" } })
      : new Response('<html><head><meta name="citation_pdf_url" content="/paper.pdf"></head><body>Landing</body></html>', { status: 200, headers: { "content-type": "text/html" } }),
    pdfParser: async () => parsed,
  });
  assert.equal(result.access_level, "full_text");
  assert.equal(result.download_audit?.contentTypeMismatch, true);
  assert.ok(result.download_audit?.attempts.length === 2);
});

test("fixture 20: a legitimate non-IMRAD scholarly article qualifies by topology", () => {
  const sections = ["Historical setting", "Primary sources", "Argument", "Counterargument", "Works cited"]
    .map((heading) => ({ heading, text: paragraph.repeat(5) }));
  const result = qualifyFullTextArtifact({ ...qualificationBase, artifactText: sections.map((section) => section.text).join(" "), sections });
  assert.equal(result.qualifyingFullText, true);
});

test("V3 fixture 01-03: canonical URL resolution handles base, path, protocol, query, and fragments", () => {
  assert.equal(resolveCandidateUrl("https://repo.example/item/1", "/download/paper.pdf#page=2"), "https://repo.example/download/paper.pdf");
  assert.equal(resolveCandidateUrl("https://repo.example/items/1/", "../pdf/file.pdf"), "https://repo.example/items/pdf/file.pdf");
  assert.equal(resolveCandidateUrl("https://repo.example/item", "//cdn.example/paper.pdf"), "https://cdn.example/paper.pdf");
  assert.equal(resolveCandidateUrl("https://repo.example/item?old=1", "?download=1"), "https://repo.example/item?download=1");
  const links = discoverLandingArtifactLinks('<base href="https://cdn.example/public/"><a href="paper.pdf#viewer">Download PDF</a>', "https://repo.example/item");
  assert.equal(links[0]?.url, "https://cdn.example/public/paper.pdf");
});

test("V3 fixture 04: JSON-LD encoding exposes a bounded public content URL", () => {
  const links = discoverLandingArtifactLinks('<script type="application/ld+json">{"@type":"ScholarlyArticle","encoding":{"contentUrl":"/full/article.xml","encodingFormat":"application/xml"}}</script>', "https://journal.example/work/1");
  assert.equal(links[0]?.url, "https://journal.example/full/article.xml");
  assert.equal(links[0]?.signal, "JSONLD_PUBLIC_ARTIFACT");
});

test("V3 fixture 05: NEXT_DATA hydration exposes only named public artifact fields", () => {
  const links = discoverLandingArtifactLinks('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"downloadUrl":"/bitstream/article.pdf","unrelated":"https://evil.example/"}}}</script>', "https://repo.example/item/1");
  assert.deepEqual(links.map((link) => link.url), ["https://repo.example/bitstream/article.pdf"]);
});

test("V3 fixture 06-07: iframe and object document endpoints are discoverable", () => {
  const links = discoverLandingArtifactLinks('<iframe src="/viewer/article.pdf"></iframe><object data="/object/article.xml" type="application/xml"></object>', "https://repo.example/item");
  assert.deepEqual(links.map((link) => link.formatHint), ["PDF", "XML"]);
});

test("V3 fixture 10-11: truncated PDF and declared-PDF HTML are separated by bytes", () => {
  const truncated = sniffScholarlyPayload({ bytes: encoder.encode(`%PDF-1.7 ${"x".repeat(2500)}`), declaredContentType: "application/pdf" });
  const html = sniffScholarlyPayload({ bytes: encoder.encode("<!doctype html><html><body>viewer</body></html>"), declaredContentType: "application/pdf" });
  assert.equal(truncated.payloadClass, "PDF_INVALID");
  assert.ok(truncated.detectionMethod.includes("PDF_EOF_MISSING_TRUNCATED_PAYLOAD"));
  assert.equal(html.format, "HTML");
});

test("V3 fixture 13-14: prefixed JATS and TEI namespace variants preserve scholarly bodies", () => {
  const jats = materializeStructuredXml(`<?xml version="1.0"?><j:article xmlns:j="https://jats.nlm.nih.gov"><j:front><j:article-meta><j:title-group><j:article-title>Prefixed JATS</j:article-title></j:title-group></j:article-meta></j:front><j:body><j:sec><j:title>Evidence</j:title><j:p>${paragraph.repeat(3)}</j:p></j:sec></j:body></j:article>`);
  const tei = materializeStructuredXml(`<?xml version="1.0"?><t:TEI xmlns:t="http://www.tei-c.org/ns/1.0"><t:teiHeader><t:fileDesc><t:titleStmt><t:title>Prefixed TEI</t:title></t:titleStmt></t:fileDesc></t:teiHeader><t:text><t:body><t:div><t:head>Evidence</t:head><t:p>${paragraph.repeat(3)}</t:p></t:div></t:body></t:text></t:TEI>`);
  assert.equal(jats.format, "JATS_XML");
  assert.equal(tei.format, "TEI_XML");
  assert.ok(jats.sections.length === 1 && tei.sections.length === 1);
});

test("V3 fixture 12: a deterministic secondary PDF parser can recover after primary failure", async () => {
  const parsed: ParsedDocument = {
    sourceId: "secondary-pdf",
    workflowId: "wf",
    extractionMethod: "pdfminer",
    title: "Secondary Parser Article",
    fullText: `10.1234/secondary ${paragraph.repeat(20)}`,
    sections: ["Methods", "Results", "Discussion"].map((heading, index) => ({ heading, text: paragraph.repeat(4), pageStart: index + 1 })),
    confidence: "high",
    requiresOcr: false,
    warnings: [],
  };
  const result = await extractSourceContent({ sourceId: "secondary-pdf", workflowId: "wf", title: "Secondary Parser Article", doi: "10.1234/secondary", url: "https://repo.example/secondary.pdf", isOpenAccess: true }, {
    fetchImpl: async () => new Response(encoder.encode("%PDF-1.7 controlled"), { status: 200, headers: { "content-type": "application/pdf" } }),
    pdfParser: async () => { throw new Error("primary failed"); },
    secondaryPdfParser: async () => parsed,
  });
  assert.equal(result.access_level, "full_text");
  assert.ok(result.extraction_warnings.includes("PDF_SECONDARY_PARSER_USED"));
});

test("retry taxonomy separates transient transport from permanent access/content failures", () => {
  for (const status of [429, 502, 503, 504]) assert.equal(classifyFullTextRetry({ status }), "RETRYABLE");
  for (const status of [401, 403, 404, 410]) assert.equal(classifyFullTextRetry({ status }), "NOT_RETRYABLE");
  assert.equal(classifyFullTextRetry({ failure: "CONNECTION_RESET" }), "RETRYABLE");
  assert.equal(classifyFullTextRetry({ failure: "PAYWALL" }), "NOT_RETRYABLE");
});
