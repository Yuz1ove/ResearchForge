import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedDocument } from "@workspace/api-zod/research-tools";
import { extractSourceContent } from "./sourceContentExtractor";

test("extractSourceContent reads public HTML into sections and chunks", async () => {
  const html = `
    <html>
      <head>
        <title>Rayleigh scattering and sunset color</title>
        <meta name="citation_abstract" content="Rayleigh scattering separates shorter and longer wavelengths in the atmosphere.">
      </head>
      <body>
        <article>
          <h1>Rayleigh scattering and sunset color</h1>
          <h2>Mechanism</h2>
          <p>Rayleigh scattering is wavelength dependent and removes more short-wavelength blue light from the direct solar beam than long-wavelength red light during long atmospheric paths at sunset.</p>
          <p>This mechanism changes the spectrum reaching an observer and supports a conservative explanation of why sunset colors often shift toward orange and red under clear atmospheric conditions.</p>
          <h2>Limitations</h2>
          <p>Aerosols, clouds, humidity, and local pollution can modify the observed color, so the optical mechanism should not be treated as the only factor in every sunset observation.</p>
        </article>
      </body>
    </html>
  `;

  const result = await extractSourceContent(
    {
      sourceId: "rayleigh-html",
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
  assert.equal(result.access_level, "full_text");
  assert.equal(result.extraction_method, "html_readability");
  assert.equal(result.can_use_for_claims, true);
  assert.match(result.extracted_chunks.map((chunk) => chunk.text).join(" "), /terminal[- ]velocity/iu);
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
        new Response(new Uint8Array([37, 80, 68, 70]), {
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
