import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { extractSourceContent } from "./sourceContentExtractor";

const controlledBody = [
  "The methods section documents participant recruitment, measurement instruments, comparison groups, timing, and the prespecified analysis protocol in enough detail for independent review.",
  "The results section reports the primary outcome, uncertainty, and group comparison while retaining the original wording needed for exact provenance and later verification.",
  "The discussion distinguishes the observed association from causal claims and records limitations, setting, follow-up, and the boundary of generalization.",
].join(" ");

const controlledSections = [
  { heading: "Methods", text: controlledBody, pageStart: 1 },
  { heading: "Results", text: controlledBody, pageStart: 2 },
  { heading: "Discussion", text: controlledBody, pageStart: 3 },
];

test("extractSourceContent reads public HTML into sections and chunks", async () => {
  const html = `
    <html>
      <head>
        <title>Rayleigh scattering and sunset color</title>
        <meta name="citation_doi" content="10.1234/rayleigh">
        <meta name="citation_abstract" content="Rayleigh scattering separates shorter and longer wavelengths in the atmosphere.">
      </head>
      <body>
        <article>
          <h1>Rayleigh scattering and sunset color</h1>
          <h2>Mechanism</h2>
          <p>Rayleigh scattering is wavelength dependent and removes more short-wavelength blue light from the direct solar beam than long-wavelength red light during long atmospheric paths at sunset.</p>
          <p>This mechanism changes the spectrum reaching an observer and supports a conservative explanation of why sunset colors often shift toward orange and red under clear atmospheric conditions.</p>
          <p>${controlledBody}</p>
          <h2>Limitations</h2>
          <p>Aerosols, clouds, humidity, and local pollution can modify the observed color, so the optical mechanism should not be treated as the only factor in every sunset observation.</p>
          <p>${controlledBody}</p>
        </article>
      </body>
    </html>
  `;

  const result = await extractSourceContent(
    {
      sourceId: "rayleigh-html",
      doi: "10.1234/rayleigh",
      title: "Rayleigh scattering and sunset color",
      url: "https://example.edu/rayleigh",
      isOpenAccess: true,
      provider: "OpenAlex",
      sourceType: "paper",
    },
    {
      fetchImpl: async () =>
        new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      maxChunks: 4,
    },
  );

  assert.equal(result.access_level, "full_text");
  assert.equal(result.extraction_status, "text_extracted");
  assert.equal(result.extraction_method, "html_readability");
  assert.equal(result.extraction_mode, "html");
  assert.equal(result.can_use_for_claims, true);
  assert.equal(result.extracted_sections.length >= 1, true);
  assert.equal(result.extracted_chunks.length >= 1, true);
  assert.match(result.extracted_chunks[0]?.text ?? "", /Rayleigh scattering/u);
  assert.equal(result.extraction_warnings.length, 0);
});

test("extractSourceContent preserves live HTML tables and figure captions as structured sections", async () => {
  const result = await extractSourceContent({
    sourceId: "structured-html",
    doi: "10.1234/structured",
    title: "Structured results",
    url: "https://journal.example.edu/article",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(`
      <html><head><meta name="citation_doi" content="10.1234/structured"></head><body><h1>Methods</h1><p>Participants completed the protocol and the analysis retained the prespecified comparison between intervention and control conditions.</p>
      <h2>Results</h2><p>${controlledBody}</p>
      <h2>Discussion</h2><p>${controlledBody}</p>
      <table><caption>Table 1. Group comparison</caption><tr><th>Group</th><th>N</th><th>Mean</th></tr><tr><td>Intervention</td><td>42</td><td>8.4</td></tr><tr><td>Control</td><td>40</td><td>7.1</td></tr></table>
      <figure><figcaption>Figure 1. Estimated effect with a 95% confidence interval.</figcaption></figure>
      </body></html>
    `, { status: 200, headers: { "content-type": "text/html" } }),
  });
  assert.equal(result.access_level, "full_text");
  assert.ok(result.extracted_sections.some((section) => /Table 1/iu.test(section.heading) && /Intervention \| 42 \| 8.4/u.test(section.text)));
  assert.ok(result.extracted_sections.some((section) => section.heading === "Figure Caption" && /95% confidence interval/u.test(section.text)));
  assert.equal(result.access_audit_v3?.accessState, "FULL_TEXT_STRUCTURED");
});

test("V3 HTML recovery keeps article body before large tables exhaust the chunk budget", async () => {
  const tables = Array.from({ length: 8 }, (_, index) => `<table><caption>Table ${index + 1}</caption><tr><td>${controlledBody.repeat(3)}</td></tr></table>`).join("");
  const result = await extractSourceContent({
    sourceId: "body-before-tables",
    doi: "10.1234/body-before-tables",
    title: "Body before tables",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC123/",
    isOpenAccess: true,
    provider: "europe_pmc",
  }, {
    maxChunks: 3,
    fetchImpl: async () => new Response(`<html><head><meta name="citation_title" content="Body before tables"><meta name="citation_doi" content="10.1234/body-before-tables"></head><body><article>${tables}<h2>Introduction</h2><p>${controlledBody}</p><h2>Methods</h2><p>${controlledBody}</p><h2>Results</h2><p>${controlledBody}</p></article></body></html>`, { status: 200, headers: { "content-type": "text/html" } }),
  });
  assert.equal(result.access_level, "full_text");
  assert.match(result.extracted_chunks[0]?.section_heading ?? "", /Introduction/u);
  assert.ok(result.extracted_sections.some((section) => section.heading === "Results"));
});

test("V3 generic scholarly XML preserves sections instead of stripping tags into fake text", async () => {
  const result = await extractSourceContent({
    sourceId: "generic-scholarly-xml",
    title: "Generic Scholarly XML",
    doi: "10.1234/generic-xml",
    url: "https://repo.example/article.xml",
    isOpenAccess: true,
  }, {
    fetchImpl: async () => new Response(`<?xml version="1.0"?><paper><title>Generic Scholarly XML</title><doi>10.1234/generic-xml</doi><body><section><heading>Evidence</heading><p>${controlledBody.repeat(3)}</p></section><section><heading>Interpretation</heading><p>${controlledBody.repeat(3)}</p></section><section><heading>References</heading><p>${controlledBody.repeat(3)}</p></section></body></paper>`, { status: 200, headers: { "content-type": "application/xml" } }),
  });
  assert.equal(result.access_level, "full_text");
  assert.equal(result.extraction_method, "xml");
  assert.deepEqual(result.extracted_sections.slice(0, 3).map((section) => section.heading), ["Evidence", "Interpretation", "References"]);
});

test("source-aware recovery tries a legal OA location after DOI metadata", async () => {
  const requests: string[] = [];
  const result = await extractSourceContent({
    sourceId: "doi-recovery",
    title: "Recovered paper",
    doi: "10.1234/recovered",
    url: "https://doi.org/10.1234/recovered",
    provider: "crossref",
    sourceType: "paper",
  }, {
    resolveFullTextLocations: true,
    maxResolverRequests: 3,
    fetchImpl: (async (request) => {
      const url = String(request);
      requests.push(url);
      if (url.includes("api.openalex.org")) {
        return new Response(JSON.stringify({ best_oa_location: { is_oa: true, landing_page_url: "https://repository.example.edu/recovered" } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("repository.example.edu")) {
        return new Response(`<html><head><title>Recovered paper</title><meta name="citation_doi" content="10.1234/recovered"></head><body><h1>Methods</h1><p>${controlledBody}</p><h1>Results</h1><p>${controlledBody}</p><h1>Discussion</h1><p>${controlledBody}</p></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch,
  });
  assert.equal(result.access_level, "full_text");
  assert.equal(result.access_audit_v3?.accessState, "FULL_TEXT_STRUCTURED");
  assert.equal(result.access_audit_v3?.resolverRequests.length, 4);
  assert.deepEqual(
    result.access_audit_v3?.resolverRequests.map((request) => request.attempt),
    [1, 2, 3, 4],
  );
  assert.equal(result.access_audit_v3?.resolverRequests.at(-1)?.artifactCreated, true);
  assert.ok(requests.some((url) => url.includes("repository.example.edu")));
});

test("V3 fan-out tries a wrong-identity OA location before the correct qualifying location", async () => {
  const artifactRequests: string[] = [];
  const article = (doi: string, title: string) => `<html><head><meta name="citation_title" content="${title}"><meta name="citation_doi" content="${doi}"></head><body><article><h2>Methods</h2><p>${controlledBody}</p><h2>Results</h2><p>${controlledBody}</p><h2>Discussion</h2><p>${controlledBody}</p></article></body></html>`;
  const result = await extractSourceContent({
    sourceId: "fanout-study",
    workflowId: "wf-fanout",
    title: "Correct Fanout Study",
    doi: "10.1234/correct-fanout",
    provider: "openalex",
    isOpenAccess: true,
  }, {
    resolveFullTextLocations: true,
    maxResolverRequests: 2,
    maxResolvedLocations: 3,
    retryCount: 0,
    fetchImpl: (async (request) => {
      const url = String(request);
      if (url.includes("europepmc")) return new Response(JSON.stringify({ resultList: { result: [] } }), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("api.openalex.org")) return new Response(JSON.stringify({
        open_access: { is_oa: true, oa_status: "green" },
        locations: [
          { is_oa: true, landing_page_url: "https://repo.example/a-wrong", source: { type: "repository" } },
          { is_oa: true, landing_page_url: "https://repo.example/z-correct", source: { type: "repository" } },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
      artifactRequests.push(url);
      if (url.endsWith("/a-wrong")) return new Response(article("10.9999/wrong", "Wrong Study"), { status: 200, headers: { "content-type": "text/html" } });
      return new Response(article("10.1234/correct-fanout", "Correct Fanout Study"), { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
  });
  assert.deepEqual(artifactRequests, ["https://repo.example/a-wrong", "https://repo.example/z-correct"]);
  assert.equal(result.access_audit_v3?.qualifyingFullText, true);
  const acquisition = result.access_audit_v3?.resolverRequests.filter((request) => request.phase === "ACQUISITION") ?? [];
  assert.deepEqual(acquisition.map((request) => request.candidateRank), [1, 2]);
  assert.equal(acquisition[0]?.acquisitionOutcome, "WRONG_ARTICLE_MATCH");
  assert.equal(acquisition[1]?.acquisitionOutcome, "FULL_TEXT_QUALIFIED");
});

test("extractSourceContent reads a Crossref-resolved J-STAGE article without a separate OA flag", async () => {
  const html = `
    <html>
      <head>
        <meta name="citation_abstract" content="Raindrop diameter and terminal velocity were measured with high-speed imaging.">
      </head>
      <body>
        <article>
          <h1>Measurement of falling raindrops</h1>
          <h2>Abstract</h2>
          <p>High-speed outdoor imaging measured raindrop diameter, falling velocity, and aspect ratio under natural rainfall conditions.</p>
          <p>The observed relationship between drop diameter and falling velocity was consistent with established indoor terminal-velocity measurements for drops below three millimetres.</p>
        </article>
      </body>
    </html>
  `;
  let requestedUrl = "";

  const result = await extractSourceContent(
    {
      sourceId: "doi:10.2208/jscejhe.70.i_523",
      title: "Measurement of velocity, diameter and aspect ratio of falling raindrops",
      url: "https://doi.org/10.2208/jscejhe.70.i_523",
      fullTextUrl:
        "https://www.jstage.jst.go.jp/article/jscejhe/70/4/70_88/_article/-char/en/",
      provider: "Crossref",
      sourceType: "paper",
    },
    {
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    },
  );

  assert.match(requestedUrl, /jstage\.jst\.go\.jp/u);
  assert.equal(result.access_level, "failed_extraction");
  assert.equal(result.can_use_for_claims, false);
  assert.equal(result.access_audit_v3?.acquisitionOutcome, "ABSTRACT_ONLY");
});

test("extractSourceContent does not label a publisher metadata shell as full text", async () => {
  const html = `
    <html><head><title>Urban thermal environment article</title></head><body>
      <article><h1>Urban thermal environment article</h1>
      <p>Urban thermal environment article. Online ISSN: 1881-817X. Print ISSN: 1348-0685. 資料トップ 発行日: 2007/04/30 公開日: 2017/02/25. EndNote, Reference Manager, ProCite, and RefWorks citation tools.</p>
      </article>
    </body></html>`;
  const result = await extractSourceContent({
    sourceId: "publisher-shell",
    title: "Urban thermal environment article",
    url: "https://www.jstage.jst.go.jp/article/example",
    provider: "Crossref",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
  });
  assert.notEqual(result.access_level, "full_text");
  assert.equal(result.full_text_char_count, 0);
  assert.equal(result.extraction_warnings.includes("HTML_PUBLISHER_SHELL_NOT_FULL_TEXT"), true);
});

test("HTML qualification fails closed for abstract, metadata, TOC, login, challenge, viewer, stub, unrelated, and malformed pages", async () => {
  const fixtures = [
    { name: "abstract-only HTML", html: `<html><head><title>Target article</title><meta name="citation_doi" content="10.1234/target"></head><body><h2>Abstract</h2><p>${"Abstract summary only. ".repeat(20)}</p></body></html>` },
    { name: "metadata landing HTML", html: `<html><head><title>Target article</title><meta name="citation_doi" content="10.1234/target"></head><body><p>Volume 1 Issue 2 Online ISSN 1234-5678 Download citation EndNote RefWorks</p></body></html>` },
    { name: "journal issue TOC", html: `<html><body><h1>Journal issue</h1>${Array.from({ length: 12 }, (_, index) => `<h2>Article ${index + 1}</h2><p>Title, authors, abstract, and citation tools.</p>`).join("")}</body></html>` },
    { name: "login page", html: `<html><body><form class="login"><h1>Sign in</h1><p>Sign in to continue to institutional access.</p></form></body></html>` },
    { name: "Cloudflare challenge", html: `<html><head><title>Attention Required</title></head><body><div id="cf-chl-widget">Verify you are human. Enable JavaScript and cookies.</div></body></html>` },
    { name: "PDF viewer shell", html: `<html><body><h1>PDF Viewer</h1><p>Loading document viewer. Download citation. Online ISSN 1234-5678. RefWorks.</p></body></html>` },
    { name: "article stub", html: `<html><head><title>Target article</title><meta name="citation_doi" content="10.1234/target"></head><body><h1>Target article</h1><p>Article content will be available soon.</p></body></html>` },
    { name: "unrelated article", html: `<html><head><title>Unrelated article</title><meta name="citation_doi" content="10.9999/unrelated"></head><body><h2>Methods</h2><p>${controlledBody}</p><h2>Results</h2><p>${controlledBody}</p><h2>Discussion</h2><p>${controlledBody}</p></body></html>` },
    { name: "malformed HTML", html: `<html><head><title>Target article<body>${"unclosed metadata ".repeat(100)}` },
  ];
  for (const fixture of fixtures) {
    const result = await extractSourceContent({
      sourceId: `negative-${fixture.name}`,
      title: "Target article",
      doi: "10.1234/target",
      url: "https://journal.example.edu/target",
      isOpenAccess: true,
      provider: "manual",
      sourceType: "paper",
    }, {
      fetchImpl: async () => new Response(fixture.html, { status: 200, headers: { "content-type": "text/html" } }),
    });
    assert.notEqual(result.access_level, "full_text", fixture.name);
    assert.notEqual(result.access_audit_v3?.qualifyingFullText, true, fixture.name);
  }
});

test("extractSourceContent returns structured PDF warnings when parser cannot extract text", async () => {
  const emptyPdfParse: ParsedDocument = {
    sourceId: "rayleigh-pdf",
    workflowId: "wf-test",
    extractionMethod: "pdfminer",
    fullText: "",
    sections: [],
    confidence: "low",
    requiresOcr: true,
    warnings: [],
  };

  const result = await extractSourceContent(
    {
      sourceId: "rayleigh-pdf",
      workflowId: "wf-test",
      title: "Scanned Rayleigh scattering article",
      url: "https://example.edu/rayleigh.pdf",
      isOpenAccess: true,
      provider: "CORE",
      sourceType: "paper",
    },
    {
      fetchImpl: async () =>
        new Response(new Uint8Array([37, 80, 68, 70, 45]), {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      pdfParser: async () => emptyPdfParse,
    },
  );

  assert.equal(result.access_level, "failed_extraction");
  assert.equal(result.extraction_status, "extraction_unavailable_no_parser");
  assert.equal(result.extraction_method, "pdf_parser");
  assert.equal(result.can_use_for_claims, false);
  assert.deepEqual(result.extracted_chunks, []);
  assert.equal(result.extraction_warnings.includes("PDF_PARSE_EMPTY_TEXT"), true);
  assert.equal(result.extraction_warnings.includes("OCR_DISABLED"), true);
  assert.match(result.user_facing_message ?? "", /GROBID\/OCR/u);
});

test("extractSourceContent falls back to abstract-only when no readable URL exists", async () => {
  const result = await extractSourceContent({
    sourceId: "rayleigh-abstract",
    title: "Rayleigh scattering abstract record",
    abstractOriginal:
      "Rayleigh scattering provides an abstract-level explanation for wavelength-dependent sky and sunset color, but this record does not expose full text.",
    provider: "OpenAlex",
    sourceType: "paper",
  });

  assert.equal(result.access_level, "abstract_only");
  assert.equal(result.extraction_status, "extraction_skipped_no_full_text");
  assert.equal(result.extraction_method, "abstract_only");
  assert.equal(result.can_use_for_claims, true);
  assert.equal(result.extracted_chunks.length, 1);
  assert.equal(result.extracted_chunks[0]?.source_location, "abstract");
  assert.equal(result.extraction_warnings.includes("NO_FULL_TEXT_URL"), true);
});

test("extractSourceContent natively preserves DOCX headings and exact text chunks", async () => {
  const archive = new JSZip();
  archive.file("docProps/core.xml", `
    <cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Sleep duration evidence review</dc:title>
      <dc:identifier>10.1234/docx-evidence</dc:identifier>
    </cp:coreProperties>
  `);
  archive.file("word/document.xml", `
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Results</w:t></w:r></w:p>
      <w:p><w:r><w:t>Longer sleep duration was associated with improved learning efficiency in the observed student cohort, while the study retained the original measurement wording for later citation verification.</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Limitations</w:t></w:r></w:p>
      <w:p><w:r><w:t>Self-reported sleep duration may introduce recall error, so the observed association cannot by itself establish a causal effect on learning outcomes. The article also documents recruitment, outcome measurement, follow-up timing, and the boundary between association and causation for reproducible interpretation.</w:t></w:r></w:p>
    </w:body></w:document>
  `);
  const bytes = await archive.generateAsync({ type: "uint8array" });

  const result = await extractSourceContent({
    sourceId: "docx-source",
    doi: "10.1234/docx-evidence",
    title: "Sleep duration evidence review",
    url: "https://example.edu/evidence.docx",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    }),
  });

  assert.equal(result.access_level, "full_text");
  assert.equal(result.extraction_method, "docx_native");
  assert.equal(result.extraction_mode, "docx");
  assert.equal(result.extracted_title, "Sleep duration evidence review");
  assert.deepEqual(result.extracted_sections.map((section) => section.heading), ["Results", "Limitations"]);
  assert.match(result.extracted_chunks[0]?.text ?? "", /original measurement wording/u);
});

test("extractSourceContent follows EPUB spine order and extracts XHTML sections", async () => {
  const archive = new JSZip();
  archive.file("META-INF/container.xml", `
    <container><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>
  `);
  archive.file("OPS/package.opf", `
    <package xmlns:dc="http://purl.org/dc/elements/1.1/">
      <metadata><dc:title>Urban heat evidence</dc:title><dc:identifier>10.1234/epub-evidence</dc:identifier></metadata>
      <manifest><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="chapter1"/></spine>
    </package>
  `);
  archive.file("OPS/chapter1.xhtml", `
    <html><body><h1>Findings</h1>
      <p>Neighbourhoods with less tree canopy recorded higher daytime surface temperature in the observed period, with the strongest contrast appearing during clear summer afternoons.</p>
      <h2>Study boundary</h2>
      <p>The measurements describe surface temperature rather than personal heat exposure, and the sampling window does not represent every season or weather condition. The study reports sensor placement, the observation period, comparison neighbourhoods, and uncertainty so readers can interpret the observed contrast without extending it beyond the sampled setting.</p>
    </body></html>
  `);
  const bytes = await archive.generateAsync({ type: "uint8array" });

  const result = await extractSourceContent({
    sourceId: "epub-source",
    doi: "10.1234/epub-evidence",
    title: "Urban heat evidence",
    url: "https://example.edu/evidence.epub",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": "application/epub+zip" },
    }),
  });

  assert.equal(result.access_level, "full_text");
  assert.equal(result.extraction_method, "epub_native");
  assert.equal(result.extraction_mode, "epub");
  assert.equal(result.extracted_title, "Urban heat evidence");
  assert.deepEqual(result.extracted_sections.map((section) => section.heading), ["Findings", "Study boundary"]);
  assert.match(result.extracted_chunks.map((chunk) => chunk.text).join(" "), /surface temperature/u);
});

test("native archive extraction stops when the uncompressed budget is exceeded", async () => {
  const archive = new JSZip();
  archive.file("word/document.xml", `<w:document><w:body><w:p><w:r><w:t>${"evidence ".repeat(200)}</w:t></w:r></w:p></w:body></w:document>`);
  const bytes = await archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  const result = await extractSourceContent({
    sourceId: "bounded-docx",
    title: "Bounded DOCX",
    url: "https://example.edu/bounded.docx",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    }),
    maxDocumentUncompressedBytes: 128,
  });

  assert.equal(result.access_level, "failed_extraction");
  assert.equal(result.can_use_for_claims, false);
  assert.ok(result.extraction_warnings.includes("ARCHIVE_UNCOMPRESSED_LIMIT_EXCEEDED"));
});

test("extractSourceContent dispatches Europe PMC JATS before unstructured parsers", async () => {
  const xml = `<?xml version="1.0"?><article><front><article-meta>
    <article-id pub-id-type="doi">10.1234/jats</article-id>
    <title-group><article-title>Controlled JATS article</article-title></title-group>
    <abstract><p>Structured abstract.</p></abstract>
  </article-meta></front><body>
    <sec><title>Methods</title><p>${controlledBody}</p></sec>
    <sec><title>Results</title><p>${controlledBody}</p></sec>
    <sec><title>Discussion</title><p>${controlledBody}</p></sec>
  </body></article>`;
  const result = await extractSourceContent({
    sourceId: "jats-source",
    title: "Controlled JATS article",
    doi: "10.1234/jats",
    url: "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML",
    isOpenAccess: true,
    provider: "OpenAlex",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(xml, { status: 200, headers: { "content-type": "application/xml" } }),
  });
  assert.equal(result.access_level, "full_text");
  assert.equal(result.extraction_method, "jats_xml");
  assert.equal(result.access_audit_v3?.acquisitionOutcome, "FULL_TEXT_QUALIFIED");
  assert.equal(result.access_audit_v3?.artifact?.identifiers.doi, "10.1234/jats");
});

test("download retry is bounded to one transient 429 before a qualified HTML success", async () => {
  let calls = 0;
  const result = await extractSourceContent({
    sourceId: "retry-html",
    doi: "10.1234/retry-html",
    title: "Retry HTML article",
    url: "https://repository.example.edu/retry",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    retryCount: 1,
    backoffMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return new Response(`<html><head><title>Retry HTML article</title><meta name="citation_doi" content="10.1234/retry-html"></head><body><h2>Methods</h2><p>${controlledBody}</p><h2>Results</h2><p>${controlledBody}</p><h2>Discussion</h2><p>${controlledBody}</p></body></html>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.access_level, "full_text");
  assert.deepEqual(
    result.access_audit_v3?.resolverRequests.map((request) => request.acquisitionOutcome),
    ["HTTP_429", "FULL_TEXT_QUALIFIED"],
  );
});

test("HTTP 403 remains an access failure and is never retried", async () => {
  let calls = 0;
  const result = await extractSourceContent({
    sourceId: "blocked-403",
    title: "Restricted article",
    url: "https://repository.example.edu/restricted.pdf",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    retryCount: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response("forbidden", { status: 403 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.access_level, "blocked_or_paywalled");
  assert.equal(result.access_audit_v3?.acquisitionOutcome, "HTTP_403");
  assert.equal(result.access_audit_v3?.qualifyingFullText, undefined);
});

test("HTML returned from a PDF route is rejected before parser dispatch", async () => {
  let parserCalls = 0;
  const result = await extractSourceContent({
    sourceId: "html-as-pdf",
    title: "HTML challenge",
    url: "https://repository.example.edu/article.pdf",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response("<!doctype html><html><body>Sign in to continue</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    pdfParser: async () => {
      parserCalls += 1;
      return null;
    },
  });
  assert.equal(parserCalls, 0);
  assert.equal(result.access_level, "failed_extraction");
  assert.equal(result.access_audit_v3?.acquisitionOutcome, "HTML_RETURNED_AS_PDF");
});

test("machine-text PDF is qualified only after parser structure and identity match", async () => {
  const parsed: ParsedDocument = {
    sourceId: "machine-pdf",
    workflowId: "wf-test",
    extractionMethod: "pdfminer",
    title: "Machine PDF article",
    fullText: `10.1234/machine ${controlledBody} ${controlledBody}`,
    sections: controlledSections,
    confidence: "high",
    requiresOcr: false,
    warnings: [],
  };
  const result = await extractSourceContent({
    sourceId: "machine-pdf",
    workflowId: "wf-test",
    title: "Machine PDF article",
    doi: "10.1234/machine",
    url: "https://repository.example.edu/machine.pdf",
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(new TextEncoder().encode("%PDF-1.7 body %%EOF"), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }),
    pdfParser: async () => parsed,
  });
  assert.equal(result.access_level, "full_text");
  assert.equal(result.access_audit_v3?.artifact?.identityMatch, "MATCH");
  assert.equal(result.access_audit_v3?.artifact?.qualificationResult, "QUALIFIED");
});

test("wrong-article and supplementary PDFs are downloaded but rejected from canonical full text", async () => {
  const run = async (parsed: ParsedDocument) => extractSourceContent({
    sourceId: parsed.sourceId,
    workflowId: "wf-test",
    title: "Target article",
    doi: "10.1234/target",
    url: `https://repository.example.edu/${parsed.sourceId}.pdf`,
    isOpenAccess: true,
    provider: "manual",
    sourceType: "paper",
  }, {
    fetchImpl: async () => new Response(new TextEncoder().encode("%PDF-1.7 body %%EOF"), {
      status: 200,
      headers: { "content-type": "application/pdf" },
    }),
    pdfParser: async () => parsed,
  });
  const wrong = await run({
    sourceId: "wrong",
    workflowId: "wf-test",
    extractionMethod: "pdfminer",
    title: "Unrelated paper",
    fullText: `10.9999/wrong ${controlledBody}`,
    sections: controlledSections,
    confidence: "high",
    warnings: [],
  });
  const supplementary = await run({
    sourceId: "supplementary",
    workflowId: "wf-test",
    extractionMethod: "pdfminer",
    title: "Supplementary material for Target article",
    fullText: controlledBody,
    sections: controlledSections,
    confidence: "high",
    warnings: [],
  });
  assert.equal(wrong.access_audit_v3?.acquisitionOutcome, "WRONG_ARTICLE_MATCH");
  assert.equal(wrong.access_level, "failed_extraction");
  assert.equal(supplementary.access_audit_v3?.acquisitionOutcome, "SUPPLEMENTARY_ONLY");
  assert.equal(supplementary.access_level, "failed_extraction");
});

test("scanned PDF uses OCR only after machine-text parsing reports OCR required", async () => {
  const previous = process.env.ENABLE_OCR;
  process.env.ENABLE_OCR = "true";
  try {
    const result = await extractSourceContent({
      sourceId: "scanned",
      workflowId: "wf-test",
      title: "Scanned article",
      doi: "10.1234/scanned",
      url: "https://repository.example.edu/scanned.pdf",
      isOpenAccess: true,
      provider: "manual",
      sourceType: "paper",
    }, {
      fetchImpl: async () => new Response(new TextEncoder().encode("%PDF-1.7 image %%EOF"), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
      pdfParser: async () => ({
        sourceId: "scanned",
        workflowId: "wf-test",
        extractionMethod: "pdfminer",
        fullText: "",
        sections: [],
        confidence: "low",
        requiresOcr: true,
        warnings: [],
      }),
      ocrParser: async () => ({
        sourceId: "scanned",
        workflowId: "wf-test",
        extractionMethod: "tesseract",
        title: "Scanned article",
        fullText: `10.1234/scanned ${controlledBody}`,
        sections: controlledSections,
        confidence: "medium",
        requiresOcr: true,
        warnings: [],
      }),
    });
    assert.equal(result.access_level, "full_text");
    assert.equal(result.extraction_method, "ocr");
    assert.equal(result.access_audit_v3?.accessState, "FULL_TEXT_OCR");
  } finally {
    if (previous === undefined) delete process.env.ENABLE_OCR;
    else process.env.ENABLE_OCR = previous;
  }
});
