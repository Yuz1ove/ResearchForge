import assert from "node:assert/strict";
import test from "node:test";

import {
  FULL_TEXT_ACQUISITION_OUTCOMES,
  buildFullTextAccessAudit,
  planLegalFullTextRoutes,
  qualifyFullTextArtifact,
  resetFullTextProviderCircuitStateForTests,
  resolveLegalFullTextLocations,
  selectCanonicalFullTextArtifact,
  type FullTextAcquisitionOutcome,
  type FullTextArtifactIdentityV1,
} from "./fullTextAcquisitionV3";

test("legal full-text resolver follows canonical DOI through bounded scholarly endpoints", async () => {
  const seen: string[] = [];
  const result = await resolveLegalFullTextLocations({ doi: "10.1234/example" }, {
    maxResolverRequests: 3,
    fetchImpl: (async (request) => {
      const url = String(request);
      seen.push(url);
      if (url.includes("openalex")) {
        return new Response(JSON.stringify({
          best_oa_location: {
            is_oa: true,
            landing_page_url: "https://repository.example.edu/item/1",
            pdf_url: "https://repository.example.edu/item/1.pdf",
            license: "cc-by",
          },
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: { link: [] }, resultList: { result: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  assert.equal(result.requests.length, 3);
  assert.equal(seen.length, 3);
  assert.ok(result.requests.every((request, index) => request.attempt === index + 1 && request.latencyMs >= 0));
  assert.ok(result.requests.every((request) => request.result === "SUCCESS" && request.artifactCreated === false));
  assert.ok(result.requests.every((request) => request.phase === "RESOLUTION"));
  assert.ok(result.locations.some((location) => location.url.endsWith(".pdf") && location.repositoryCopy));
  assert.ok(result.locations.every((location) => !/google scholar/iu.test(location.url)));
});

test("provider reconciliation upgrades an existing route only when structured OA evidence confirms it", async () => {
  const pdfUrl = "https://www.medrxiv.org/content/10.1101/2024.09.11.24313513v1.full.pdf";
  const result = await resolveLegalFullTextLocations({
    doi: "10.1101/2024.09.11.24313513",
    canonicalWorkId: "doi:10.1101/2024.09.11.24313513",
    fullTextUrl: pdfUrl,
    isOpenAccess: false,
    runId: "run-1",
    caseId: "06",
    studyId: "study-1",
  }, {
    maxResolverRequests: 4,
    fetchImpl: (async (request) => {
      const url = String(request);
      if (url.includes("openalex")) {
        return new Response(JSON.stringify({
          id: "https://openalex.org/W1",
          doi: "https://doi.org/10.1101/2024.09.11.24313513",
          open_access: { is_oa: true, oa_status: "green" },
          best_oa_location: {
            is_oa: true,
            pdf_url: pdfUrl,
            landing_page_url: "https://doi.org/10.1101/2024.09.11.24313513",
            version: "acceptedVersion",
            source: { id: "https://openalex.org/S1", display_name: "medRxiv", type: "repository" },
          },
          locations: [],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("europepmc")) {
        return new Response(JSON.stringify({ resultList: { result: [] } }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("doaj")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ message: { link: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  const reconciled = result.locations.find((location) => location.url === pdfUrl);
  assert.equal(reconciled?.provider, "openalex");
  assert.equal(reconciled?.isOpenAccess, true);
  assert.equal(reconciled?.version, "acceptedVersion");
  assert.equal(reconciled?.routeFingerprint?.length, 64);
  assert.ok(result.candidates.some((candidate) =>
    candidate.url === pdfUrl && candidate.declaredOaStatus === "OPEN" && candidate.artifactVersionType === "ACCEPTED_MANUSCRIPT"
  ));
  assert.equal(result.providerAvailability.find((provider) => provider.provider === "unpaywall")?.status, "PROVIDER_NOT_CONFIGURED");
  assert.ok(result.telemetryEvents.some((event) => event.event === "OA_ROUTE_RANKED" && event.caseId === "06"));
});

test("DOAJ fulltext metadata cannot promote a landing URL to a direct PDF route", async () => {
  const landingUrl = "https://journal.example/articles/controlled-study";
  const result = await resolveLegalFullTextLocations({ doi: "10.1234/doaj-route" }, {
    maxResolverRequests: 3,
    retryCount: 0,
    fetchImpl: (async (request) => {
      if (String(request).includes("doaj")) {
        return new Response(JSON.stringify({
          results: [{
            id: "doaj-1",
            bibjson: {
              title: "Controlled study",
              identifier: [{ type: "doi", id: "10.1234/doaj-route" }],
              link: [{ type: "fulltext", content_type: "pdf", url: landingUrl }],
            },
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ resultList: { result: [] }, message: { link: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  const route = result.candidates.find((candidate) => candidate.url === landingUrl);
  assert.equal(route?.routeType, "LANDING_PAGE");
  assert.equal(route?.declaredOaStatus, "OPEN");
  assert.equal(route?.sourceMetadata.declaredContentType, "pdf");
});

test("publisher shell never counts as true full text", () => {
  const audit = buildFullTextAccessAudit({
    accessLevel: "abstract_only",
    extractionMethod: "html_readability",
    warnings: ["HTML_PUBLISHER_SHELL_NOT_FULL_TEXT"],
    text: "Abstract and citation tools only",
    sections: [{ heading: "Abstract", text: "Abstract only" }],
  });
  assert.equal(audit.accessState, "PUBLISHER_SHELL");
});

test("structured HTML, repository PDF, and OCR are true full-text states", () => {
  const html = buildFullTextAccessAudit({
    accessLevel: "full_text",
    extractionMethod: "html_readability",
    resolvedUrl: "https://journal.example/article",
    text: "Methods Results Discussion",
    sections: [{ heading: "Methods", text: "method" }, { heading: "Results", text: "result" }],
  });
  assert.equal(html.accessState, "FULL_TEXT_STRUCTURED");
  const pdf = buildFullTextAccessAudit({
    accessLevel: "full_text",
    extractionMethod: "pdf_parser",
    resolvedUrl: "https://repository.example.edu/paper.pdf",
    accessPath: ["DOI", "repository_copy"],
    text: "body",
  });
  assert.equal(pdf.accessState, "FULL_TEXT_REPOSITORY_COPY");
  const ocr = buildFullTextAccessAudit({
    accessLevel: "full_text",
    extractionMethod: "targeted_ocr",
    resolvedUrl: "https://repository.example.edu/scanned.pdf",
    text: "Recovered page text",
  });
  assert.equal(ocr.accessState, "FULL_TEXT_OCR");
});

test("access denial, paywall, not found, broken document, and incomplete remain distinct", () => {
  assert.equal(buildFullTextAccessAudit({ accessLevel: "abstract_only", warnings: ["ROBOTS_OR_POLICY_SKIPPED"] }).accessState, "ACCESS_DENIED");
  assert.equal(buildFullTextAccessAudit({ accessLevel: "blocked_or_paywalled", warnings: ["PAYWALL_OR_LOGIN_REQUIRED"] }).accessState, "PAYWALLED");
  assert.equal(buildFullTextAccessAudit({ accessLevel: "failed_extraction", warnings: ["FETCH_HTTP_404"] }).accessState, "NOT_FOUND");
  assert.equal(buildFullTextAccessAudit({ accessLevel: "failed_extraction", warnings: ["PDF_PARSE_FAILED"] }).accessState, "BROKEN_DOCUMENT");
  assert.equal(buildFullTextAccessAudit({ accessLevel: "failed_extraction", warnings: ["NETWORK_ERROR"] }).accessState, "RESOLVER_ERROR");
  assert.equal(buildFullTextAccessAudit({ accessLevel: "failed_extraction", warnings: ["JOB_INTERRUPTED"] }).accessState, "UNKNOWN_JOB_INCOMPLETE");
});

test("controlled acquisition taxonomy classifies thirty deterministic fixtures without collapsing failures", () => {
  const body = [
    "Methods. Participants completed the prespecified protocol and the comparison groups were measured with the same instrument under the documented sampling plan.",
    "Results. The primary outcome and uncertainty were reported for both groups, with the original wording retained for exact provenance and independent verification.",
    "Discussion. The authors separated the measured association from causal claims and documented limitations, setting, follow-up, and the scope of generalization.",
  ].join(" ");
  const sections = [
    { heading: "Methods", text: body },
    { heading: "Results", text: body },
    { heading: "Discussion", text: body },
  ];
  const positive: Array<{ name: string; initial: FullTextAcquisitionOutcome }> = [
    { name: "DOI to OA PDF success", initial: "PDF_DOWNLOAD_SUCCESS" },
    { name: "JATS XML full text", initial: "XML_JATS_FULL_TEXT_FOUND" },
    { name: "HTML full article", initial: "HTML_FULL_TEXT_FOUND" },
    { name: "machine-generated PDF", initial: "MACHINE_TEXT_PDF" },
    { name: "scanned PDF after OCR", initial: "SCANNED_PDF" },
    { name: "Unpaywall direct PDF", initial: "MACHINE_TEXT_PDF" },
    { name: "Unpaywall landing to legal PDF", initial: "MACHINE_TEXT_PDF" },
    { name: "OpenAlex OA PDF", initial: "MACHINE_TEXT_PDF" },
    { name: "OpenAlex repository location", initial: "MACHINE_TEXT_PDF" },
    { name: "PMC PDF", initial: "MACHINE_TEXT_PDF" },
    { name: "arXiv official PDF", initial: "MACHINE_TEXT_PDF" },
    { name: "accepted manuscript identity match", initial: "MACHINE_TEXT_PDF" },
  ];
  const negative: Array<{ name: string; initial: FullTextAcquisitionOutcome }> = [
    { name: "publisher landing page", initial: "LANDING_PAGE_ONLY" },
    { name: "HTTP 403", initial: "HTTP_403" },
    { name: "permanent 404", initial: "HTTP_404" },
    { name: "corrupt PDF", initial: "CORRUPT_PDF" },
    { name: "HTML masquerading as PDF", initial: "HTML_RETURNED_AS_PDF" },
    { name: "rights blocked", initial: "RIGHTS_OR_LICENSE_BLOCKED" },
    { name: "provider timeout", initial: "PROVIDER_TIMEOUT" },
    { name: "parser failed", initial: "PARSER_FAILED" },
    { name: "OCR required", initial: "OCR_REQUIRED" },
    { name: "no legal full text", initial: "NO_FULL_TEXT_DISCOVERED" },
    { name: "CAPTCHA or challenge", initial: "ACCESS_BLOCKED" },
    { name: "preprint journal version ambiguity", initial: "WRONG_ARTICLE_VERSION" },
    { name: "duplicate artifact", initial: "DUPLICATE_OR_MIRROR" },
  ];
  const rows = [
    ...positive.map((fixture) => ({
      name: fixture.name,
      expected: "FULL_TEXT_QUALIFIED" as FullTextAcquisitionOutcome,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        sourceDoi: "10.1234/controlled",
        canonicalWorkId: "10.1234/controlled",
        artifactTitle: "Controlled evidence article",
        artifactDoi: "10.1234/controlled",
        artifactText: `${body} ${body} ${body} ${body} ${body} ${body}`,
        sections,
        url: "https://repository.example.edu/controlled.pdf",
        contentType: fixture.initial === "XML_JATS_FULL_TEXT_FOUND"
          ? "application/xml+jats"
          : fixture.initial === "HTML_FULL_TEXT_FOUND" ? "text/html" : "application/pdf",
        parserUsed: "controlled-parser",
        parserVersion: "1",
        isOpenAccess: true,
        httpStatus: 200,
        byteLength: 4096,
        ...(["PDF_DOWNLOAD_SUCCESS", "MACHINE_TEXT_PDF", "SCANNED_PDF"].includes(fixture.initial) ? { pageCount: 3 } : {}),
        initialOutcome: fixture.initial,
      }),
    })),
    ...negative.map((fixture) => ({
      name: fixture.name,
      expected: fixture.initial,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        sourceDoi: "10.1234/controlled",
        canonicalWorkId: "10.1234/controlled",
        artifactTitle: "Controlled evidence article",
        artifactDoi: "10.1234/controlled",
        artifactText: body,
        sections,
        url: "https://repository.example.edu/controlled.pdf",
        contentType: "application/pdf",
        parserUsed: "controlled-parser",
        parserVersion: "1",
        isOpenAccess: true,
        httpStatus: 200,
        byteLength: 4096,
        initialOutcome: fixture.initial,
      }),
    })),
    {
      name: "abstract only",
      expected: "ABSTRACT_ONLY" as FullTextAcquisitionOutcome,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        artifactTitle: "Controlled evidence article",
        artifactText: "This abstract summarizes the study but does not expose the article body.",
        artifactAbstract: "This abstract summarizes the study but does not expose the article body.",
        sections: [{ heading: "Abstract", text: "abstract" }],
        url: "https://journal.example/article",
        isOpenAccess: true,
        httpStatus: 200,
        initialOutcome: "HTML_FULL_TEXT_FOUND",
      }),
    },
    {
      name: "wrong article PDF",
      expected: "WRONG_ARTICLE_MATCH" as FullTextAcquisitionOutcome,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        sourceDoi: "10.1234/controlled",
        artifactTitle: "Entirely unrelated article",
        artifactDoi: "10.9999/wrong",
        artifactText: body,
        sections,
        url: "https://repository.example.edu/wrong.pdf",
        isOpenAccess: true,
        httpStatus: 200,
        pageCount: 2,
        initialOutcome: "MACHINE_TEXT_PDF",
      }),
    },
    {
      name: "supplementary-only PDF",
      expected: "SUPPLEMENTARY_ONLY" as FullTextAcquisitionOutcome,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        artifactTitle: "Supplementary material for Controlled evidence article",
        artifactText: body,
        sections,
        url: "https://repository.example.edu/supplementary.pdf",
        isOpenAccess: true,
        httpStatus: 200,
        pageCount: 2,
        initialOutcome: "MACHINE_TEXT_PDF",
      }),
    },
    {
      name: "full text too short",
      expected: "FULL_TEXT_TOO_SHORT" as FullTextAcquisitionOutcome,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        artifactTitle: "Controlled evidence article",
        artifactText: "Methods and results are unavailable.",
        sections: [{ heading: "Methods", text: "short" }, { heading: "Results", text: "short" }],
        url: "https://repository.example.edu/short.pdf",
        isOpenAccess: true,
        httpStatus: 200,
        pageCount: 1,
        initialOutcome: "MACHINE_TEXT_PDF",
      }),
    },
    {
      name: "full text structure invalid",
      expected: "FULL_TEXT_STRUCTURE_INVALID" as FullTextAcquisitionOutcome,
      result: qualifyFullTextArtifact({
        sourceTitle: "Controlled evidence article",
        artifactTitle: "Controlled evidence article",
        artifactText: "Narrative content without identifiable article sections. ".repeat(12),
        sections: [{ heading: "Readable body", text: "narrative" }],
        url: "https://repository.example.edu/unstructured.html",
        isOpenAccess: true,
        httpStatus: 200,
        initialOutcome: "HTML_FULL_TEXT_FOUND",
      }),
    },
  ];
  assert.equal(rows.length, 30);
  assert.equal(FULL_TEXT_ACQUISITION_OUTCOMES.length >= 32, true);
  for (const row of rows) {
    assert.equal(row.result.outcome, row.expected, row.name);
    assert.equal(row.result.qualifyingFullText, row.expected === "FULL_TEXT_QUALIFIED", row.name);
  }
});

test("resolver retries 429 once and records both bounded attempts", async () => {
  let calls = 0;
  let europePmcCalls = 0;
  const result = await resolveLegalFullTextLocations({ doi: "10.1234/retry" }, {
    maxResolverRequests: 5,
    retryCount: 1,
    backoffMs: 0,
    fetchImpl: (async (request) => {
      calls += 1;
      if (String(request).includes("europepmc")) {
        europePmcCalls += 1;
        if (europePmcCalls === 1) {
          return new Response("{}", { status: 429, headers: { "content-type": "application/json" } });
        }
      }
      return new Response(JSON.stringify({ message: { link: [] }, resultList: { result: [] }, results: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });
  assert.equal(calls, 5);
  const europePmcRequests = result.requests.filter((request) => request.provider === "europe_pmc");
  assert.deepEqual(europePmcRequests.map((request) => request.result), ["RATE_LIMITED", "SUCCESS"]);
  assert.deepEqual(europePmcRequests.map((request) => request.acquisitionOutcome), ["HTTP_429", "OA_LOOKUP_SUCCESS"]);
});

test("provider circuit opens at its provider-specific threshold and skips network I/O", async () => {
  resetFullTextProviderCircuitStateForTests();
  let calls = 0;
  try {
    const run = () => resolveLegalFullTextLocations({ doi: "10.1234/circuit" }, {
      maxResolverRequests: 1,
      retryCount: 0,
      backoffMs: 0,
      fetchImpl: (async () => {
        calls += 1;
        return new Response("{}", { status: 429, headers: { "content-type": "application/json" } });
      }) as typeof fetch,
    });
    await run();
    await run();
    await run();
    await run();
    const circuitResult = await run();
    assert.equal(calls, 4);
    assert.equal(circuitResult.requests[0]?.result, "CIRCUIT_OPEN");
    assert.equal(circuitResult.requests[0]?.acquisitionOutcome, "PROVIDER_CIRCUIT_OPEN");
  } finally {
    resetFullTextProviderCircuitStateForTests();
  }
});

test("route planning deduplicates mirrors and prioritizes structured JATS over landing pages", () => {
  const routes = planLegalFullTextRoutes([
    { url: "https://doi.org/10.1234/a", provider: "doi_resolver", accessPath: ["DOI"], isOpenAccess: null, repositoryCopy: false },
    { url: "https://repo.example.edu/a.pdf", provider: "openalex", accessPath: ["DOI", "OpenAlex"], isOpenAccess: true, repositoryCopy: true, contentTypeHint: "application/pdf" },
    { url: "https://repo.example.edu/a.pdf#mirror", provider: "unpaywall", accessPath: ["DOI", "Unpaywall"], isOpenAccess: true, repositoryCopy: true, contentTypeHint: "application/pdf" },
    { url: "https://www.ebi.ac.uk/europepmc/webservices/rest/PMC1/fullTextXML", provider: "europe_pmc", accessPath: ["DOI", "Europe PMC", "JATS_XML"], isOpenAccess: true, repositoryCopy: true, contentTypeHint: "application/xml+jats" },
  ]);
  assert.equal(routes[0]?.provider, "europe_pmc");
  assert.equal(routes.at(-1)?.provider, "doi_resolver");
  assert.equal(routes.filter((route) => route.url.includes("a.pdf")).length, 1);
});

test("artifact selection rejects stale mirrors and prefers version of record", () => {
  const base = qualifyFullTextArtifact({
    sourceTitle: "Controlled evidence article",
    sourceDoi: "10.1234/controlled",
    canonicalWorkId: "10.1234/controlled",
    artifactTitle: "Controlled evidence article",
    artifactDoi: "10.1234/controlled",
    artifactText: "Methods. measured protocol. Results. measured outcome. Discussion. limitations. ".repeat(12),
    sections: [{ heading: "Methods", text: "method" }, { heading: "Results", text: "result" }],
    url: "https://repo.example.edu/article.pdf",
    isOpenAccess: true,
    httpStatus: 200,
    pageCount: 3,
    initialOutcome: "MACHINE_TEXT_PDF",
  }).artifact;
  const artifacts: FullTextArtifactIdentityV1[] = [
    { ...base, checksum: "stale", artifactFingerprint: "stale", publicationVersion: "submittedVersion", artifactVersionType: "PREPRINT", retrievedAt: "2026-08-20T00:00:00.000Z" },
    { ...base, checksum: "current", artifactFingerprint: "current", publicationVersion: "version of record", artifactVersionType: "VERSION_OF_RECORD", retrievedAt: "2026-08-21T00:00:00.000Z" },
  ];
  const selected = selectCanonicalFullTextArtifact({ artifacts, canonicalWorkId: "10.1234/controlled" });
  assert.equal(selected.selected?.checksum, "current");
  assert.deepEqual(selected.alternates.map((artifact) => artifact.checksum), ["stale"]);
  assert.deepEqual(selected.rejected, []);
});
