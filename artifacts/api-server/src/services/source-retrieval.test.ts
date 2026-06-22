import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeSources,
  normalizeCrossrefWork,
  normalizeSemanticScholarPaper,
  searchSourceProvider,
  searchSources,
} from "./source-retrieval";
import { getSourceProviderConfigs } from "./source-provider-config";

test("normalizes Crossref works into the unified Source shape", () => {
  const source = normalizeCrossrefWork({
    title: ["Vitamin C and oxidative stress"],
    author: [{ given: "Ada", family: "Lovelace" }, { name: "Research Group" }],
    issued: { "date-parts": [[2020, 1, 1]] },
    abstract: "<jats:p>Vitamin C abstract.</jats:p>",
    DOI: "10.1000/example",
    URL: "https://doi.org/10.1000/example",
    publisher: "Example Publisher",
    "container-title": ["Example Journal"],
  });

  assert.deepEqual(source, {
    id: "doi:10.1000/example",
    title: "Vitamin C and oxidative stress",
    authors: ["Ada Lovelace", "Research Group"],
    year: 2020,
    abstract: "Vitamin C abstract.",
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
  });
});

test("normalizes Semantic Scholar papers into the unified Source shape", () => {
  const source = normalizeSemanticScholarPaper({
    title: "Large language models in education",
    authors: [{ name: "Grace Hopper" }],
    year: 2023,
    abstract: "A paper abstract.",
    externalIds: { DOI: "10.2000/example" },
    url: "https://www.semanticscholar.org/paper/example",
    venue: "Conference on Education",
  });

  assert.deepEqual(source, {
    id: "doi:10.2000/example",
    title: "Large language models in education",
    authors: ["Grace Hopper"],
    year: 2023,
    abstract: "A paper abstract.",
    doi: "10.2000/example",
    url: "https://www.semanticscholar.org/paper/example",
    sourceType: "Semantic Scholar",
    reviewState: "pending",
    publisher: null,
    containerTitle: "Conference on Education",
    accessedAt: null,
  });
});

test("normalizes incomplete source metadata without inventing values", () => {
  const source = normalizeSemanticScholarPaper({
    title: "Incomplete but usable title",
    authors: [{ name: "" }],
  });

  assert.equal(source?.authors.length, 0);
  assert.equal(source?.year, null);
  assert.equal(source?.doi, null);
  assert.equal(source?.url, null);
  assert.equal(source?.reviewState, "pending");
});

test("dedupes sources by DOI before URL or title", () => {
  const sources = dedupeSources([
    {
      id: "doi:10.3000/example",
      title: "Duplicate source",
      authors: [],
      year: 2021,
      abstract: null,
      doi: "10.3000/example",
      url: "https://doi.org/10.3000/example",
      sourceType: "Crossref",
      reviewState: "pending",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
    },
    {
      id: "doi:10.3000/example",
      title: "Duplicate source from another provider",
      authors: ["Someone"],
      year: 2021,
      abstract: null,
      doi: "10.3000/example",
      url: "https://www.semanticscholar.org/paper/example",
      sourceType: "Semantic Scholar",
      reviewState: "pending",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
    },
  ]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.sourceType, "Crossref");
});

test("returns structured provider failure instead of throwing", async () => {
  const configs = getSourceProviderConfigs();
  const result = await searchSourceProvider("Crossref", "student attention", {
    providerConfigs: {
      Crossref: {
        ...configs.Crossref,
        endpoint: "https://example.test/works",
        timeoutMs: 50,
        queryLimit: 1,
      },
    },
    fetchImpl: async () => new Response(JSON.stringify({ message: "failure" }), { status: 500 }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, "Crossref");
  assert.equal(result.query, "student attention");
  assert.equal(result.error_type, "api-failure");
  assert.match(result.error_message ?? "", /HTTP 500/);
  assert.deepEqual(result.results, []);
});

test("returns structured provider timeout instead of throwing", async () => {
  const configs = getSourceProviderConfigs();
  const timeoutFetch = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  const result = await searchSourceProvider("Semantic Scholar", "sleep quality", {
    providerConfigs: {
      "Semantic Scholar": {
        ...configs["Semantic Scholar"],
        endpoint: "https://example.test/paper/search",
        timeoutMs: 5,
        queryLimit: 1,
      },
    },
    fetchImpl: timeoutFetch,
  });

  assert.equal(result.ok, false);
  assert.equal(result.provider, "Semantic Scholar");
  assert.equal(result.error_type, "timeout");
  assert.match(result.error_message ?? "", /timed out/);
  assert.deepEqual(result.results, []);
});

test("returns deduped partial results when one provider succeeds and another fails", async () => {
  const configs = getSourceProviderConfigs();
  const result = await searchSources("student sleep quality", {
    providerConfigs: {
      Crossref: {
        ...configs.Crossref,
        endpoint: "https://example.test/works",
        timeoutMs: 50,
        queryLimit: 1,
      },
      "Semantic Scholar": {
        ...configs["Semantic Scholar"],
        endpoint: "https://example.test/paper/search",
        timeoutMs: 50,
        queryLimit: 1,
      },
    },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("paper/search")) {
        return new Response(JSON.stringify({ message: "semantic failure" }), { status: 503 });
      }

      return new Response(JSON.stringify({
        message: {
          items: [
            {
              title: ["Student sleep quality and attention"],
              author: [{ given: "Ada", family: "Lovelace" }],
              issued: { "date-parts": [[2024]] },
              DOI: "10.4000/student-sleep",
              URL: "https://doi.org/10.4000/student-sleep",
            },
          ],
        },
      }));
    },
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.sourceType, "Crossref");
  assert.equal(result.sources[0]?.doi, "10.4000/student-sleep");
  assert.equal(result.diagnostics.resultTarget, 20);
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes("目前取得")));
});

test("keeps partial results when academic providers fail with 429 or malformed responses", async () => {
  const configs = getSourceProviderConfigs();
  const result = await searchSources("BMW electric vehicle strategy", {
    providerConfigs: {
      Crossref: {
        ...configs.Crossref,
        endpoint: "https://example.test/works",
        timeoutMs: 50,
        queryLimit: 1,
      },
      OpenAlex: {
        ...configs.OpenAlex,
        endpoint: "https://example.test/openalex",
        timeoutMs: 50,
        queryLimit: 1,
      },
      "Semantic Scholar": {
        ...configs["Semantic Scholar"],
        endpoint: "https://example.test/paper/search",
        timeoutMs: 50,
        queryLimit: 1,
      },
    },
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes("paper/search")) {
        return new Response("{", { status: 200 });
      }
      if (url.includes("openalex")) {
        return new Response(JSON.stringify({ error: "rate limited" }), { status: 429 });
      }
      return new Response(JSON.stringify({
        message: {
          items: [
            {
              title: ["BMW Group electric vehicle transition annual report"],
              author: [{ given: "Ada", family: "Analyst" }],
              issued: { "date-parts": [[2024]] },
              DOI: "10.5000/bmw-annual",
              URL: "https://doi.org/10.5000/bmw-annual",
            },
          ],
        },
      }));
    },
  });

  assert.equal(result.sources.length, 1);
  assert.equal(result.diagnostics.status, "insufficient_sources");
  assert.ok(result.diagnostics.providerFailures.some((failure) => failure.provider !== "Crossref"));
  assert.ok(result.diagnostics.providerFailures.some((failure) => failure.stage === "academic"));
  assert.ok(result.diagnostics.warnings.some((warning) => warning.includes("外部學術 API")));
});

test("merges duplicate source metadata so longer abstracts survive dedupe", () => {
  const merged = dedupeSources([
    {
      id: "crossref-duplicate",
      title: "Salmonella and food safety",
      authors: ["A. Author"],
      year: 2024,
      abstract: null,
      doi: "10.5000/salmonella",
      url: "https://doi.org/10.5000/salmonella",
      sourceType: "Crossref",
      reviewState: "pending",
      publisher: "Example Press",
      containerTitle: "Example Journal",
      accessedAt: null,
    },
    {
      id: "openalex-duplicate",
      title: "Salmonella and food safety",
      authors: ["A. Author", "B. Researcher"],
      year: 2024,
      abstract: "This paper examines Salmonella cross-contamination, food poisoning risk, and storage temperature in food safety practice.",
      doi: "10.5000/salmonella",
      url: "https://openalex.org/W123",
      sourceType: "OpenAlex",
      reviewState: "pending",
      publisher: "Example Press",
      containerTitle: "Example Journal",
      accessedAt: null,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.match(merged[0]?.abstract ?? "", /cross-contamination/);
  assert.equal(merged[0]?.url, "https://doi.org/10.5000/salmonella");
  assert.deepEqual(merged[0]?.authors, ["A. Author", "B. Researcher"]);
});
