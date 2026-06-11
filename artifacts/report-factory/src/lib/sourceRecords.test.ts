import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedSourceRecords,
  buildBibliography,
  buildExportReadinessWarnings,
  dedupeSourceRecords,
  formatApaReference,
  normalizeSourceForReview,
  rejectedSourceRecords,
  sourceHasIncompleteMetadata,
  type SourceRecord,
} from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "doi:10.1000/example",
    title: "Vitamin C and oxidative stress",
    authors: ["Ada Lovelace", "Grace Hopper"],
    year: 2020,
    abstract: "A useful abstract.",
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    ...overrides,
  };
}

test("normalizes editable source metadata and preserves pending review state", () => {
  const normalized = normalizeSourceForReview(
    source({
      id: "",
      authors: [" Ada Lovelace ", ""],
      doi: "https://doi.org/10.1000/example",
      url: "  https://example.test/source  ",
    }),
  );

  assert.equal(normalized.id, "doi:10.1000/example");
  assert.deepEqual(normalized.authors, ["Ada Lovelace"]);
  assert.equal(normalized.doi, "10.1000/example");
  assert.equal(normalized.url, "https://example.test/source");
  assert.equal(normalized.reviewState, "pending");
});

test("dedupes sources by DOI before URL or title", () => {
  const deduped = dedupeSourceRecords([
    source(),
    source({
      id: "doi:10.1000/example",
      title: "Same DOI from another provider",
      sourceType: "Semantic Scholar",
      url: "https://www.semanticscholar.org/paper/example",
    }),
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.sourceType, "Crossref");
});

test("filters accepted and rejected sources explicitly", () => {
  const accepted = source({ id: "accepted", reviewState: "accepted" });
  const rejected = source({ id: "rejected", reviewState: "rejected", doi: "10.1000/rejected" });
  const pending = source({ id: "pending", reviewState: "pending", doi: "10.1000/pending" });

  assert.deepEqual(acceptedSourceRecords([accepted, rejected, pending]), [accepted]);
  assert.deepEqual(rejectedSourceRecords([accepted, rejected, pending]), [rejected]);
});

test("formats accepted sources as APA-style bibliography entries", () => {
  const bibliography = buildBibliography([source({ reviewState: "accepted" })], "APA");

  assert.equal(bibliography.length, 1);
  assert.equal(
    bibliography[0]?.text,
    "Lovelace, A. & Hopper, G. (2020). Vitamin C and oxidative stress. Example Journal. https://doi.org/10.1000/example",
  );
});

test("excludes rejected sources from bibliography output", () => {
  const bibliography = buildBibliography([
    source({ reviewState: "accepted" }),
    source({ id: "rejected", doi: "10.1000/rejected", reviewState: "rejected" }),
  ]);

  assert.equal(bibliography.length, 1);
  assert.equal(bibliography[0]?.sourceId, "doi:10.1000/example");
});

test("marks incomplete metadata without inventing details", () => {
  const incomplete = source({
    id: "incomplete",
    title: "Incomplete source",
    authors: [],
    year: null,
    doi: null,
    url: null,
    reviewState: "accepted",
  });
  const reference = formatApaReference(incomplete);

  assert.equal(sourceHasIncompleteMetadata(incomplete), true);
  assert.equal(reference.incomplete, true);
  assert.deepEqual(reference.missingFields, ["作者", "年份", "DOI 或網址"]);
  assert.match(reference.text, /作者未提供/);
  assert.match(reference.text, /年份未提供/);
  assert.match(reference.text, /metadata incomplete/);
});

test("builds export readiness warnings for source and citation gaps", () => {
  const report = {
    meta: {
      acceptedSources: [
        source({
          id: "incomplete",
          authors: [],
          year: null,
          doi: null,
          url: null,
          reviewState: "accepted",
        }),
      ],
    },
    sections: [
      {
        heading: "參考文獻",
        blocks: [{ type: "note", text: "資料來源待補" }],
      },
    ],
  };
  const warnings = buildExportReadinessWarnings(report);

  assert.deepEqual(
    warnings.map((warning) => warning.code),
    ["incomplete-source-metadata", "citation-placeholders"],
  );
});

test("warns when no accepted sources are present", () => {
  const warnings = buildExportReadinessWarnings({
    meta: { acceptedSources: [] },
    sections: [],
  });

  assert.deepEqual(warnings.map((warning) => warning.code), ["no-accepted-sources"]);
});
