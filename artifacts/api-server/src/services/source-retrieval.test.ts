import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupeSources,
  normalizeCrossrefWork,
  normalizeSemanticScholarPaper,
} from "./source-retrieval";

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
