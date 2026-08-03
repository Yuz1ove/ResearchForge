import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptedSourceRecords,
  autoAcceptPrimarySources,
  buildBibliography,
  buildExportReadinessWarnings,
  calculateSourceConfidence,
  candidateSourceRecords,
  classifySourceRecord,
  dedupeSourceRecords,
  formatApaReference,
  normalizeSourceForReview,
  rejectedSourceRecords,
  sourceHasIncompleteMetadata,
  sourceReviewCounts,
  sourceReviewState,
  updateSourceReviewState,
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

test("normalizes accepted source review metadata for evidence workflow", () => {
  const normalized = normalizeSourceForReview(
    source({
      sourceCategory: " 學術論文 ",
      usableSections: ["研究背景", "文獻探討", "不存在"],
      confidence: "high",
      reviewNotes: " 方法清楚 ",
    }),
  );

  assert.equal(normalized.sourceCategory, "academic_paper");
  assert.deepEqual(normalized.usableSections, ["研究背景", "文獻探討"]);
  assert.equal(normalized.confidence, "高");
  assert.equal(normalized.reviewNotes, "方法清楚");
});

test("maps editable source category labels to stable category keys", () => {
  const normalized = normalizeSourceForReview(
    source({
      sourceCategory: " 學術論文 ",
    }),
  );

  assert.equal(normalized.sourceCategory, "academic_paper");
});

test("classifies source types without defaulting to other", () => {
  assert.equal(classifySourceRecord(source({ sourceType: "Crossref", containerTitle: "Nature Medicine" })), "journal_article");
  assert.equal(
    classifySourceRecord(
      source({
        doi: null,
        url: "https://www.cdc.gov/example/report",
        sourceType: "Web",
        publisher: "Centers for Disease Control and Prevention",
        containerTitle: null,
      }),
    ),
    "government_or_institution",
  );
  assert.equal(
    classifySourceRecord(
      source({
        doi: null,
        url: "https://example-news.test/story",
        sourceType: "Web",
        publisher: "Example News",
        containerTitle: null,
      }),
    ),
    "news_or_web",
  );
});

test("calculates source confidence from DOI, year, title, and provider metadata", () => {
  assert.equal(calculateSourceConfidence(source({ sourceType: "Crossref" })), "高");
  assert.equal(calculateSourceConfidence(source({ doi: null, sourceType: "Web", publisher: "Example Publisher" })), "中");
  assert.equal(calculateSourceConfidence(source({ title: "", doi: null, url: null, authors: [], year: null })), "低");
});

test("dedupes sources by DOI before URL or title", () => {
  const deduped = dedupeSourceRecords([
    source(),
    source({
      id: "doi:10.1000/example",
      title: "Same DOI from another provider",
      sourceType: "Semantic Scholar",
      url: "https://www.semanticscholar.org/paper/example",
      abstract:
        "A richer abstract from another provider should be preserved during enrichment.",
    }),
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.sourceType, "Crossref");
  assert.match(deduped[0]?.abstract ?? "", /richer abstract/);
});

test("dedupes same title, first author, and year across providers and keeps richer metadata", () => {
  const deduped = dedupeSourceRecords([
    source({
      id: "title:crossref:spider habitat selection",
      title: "Spider habitat selection",
      doi: null,
      abstract: null,
      sourceType: "Crossref",
    }),
    source({
      id: "title:openalex:spider habitat selection",
      title: "Spider habitat selection",
      doi: null,
      abstract:
        "Spider habitat selection and microhabitat ecology are described in the restored abstract.",
      sourceType: "OpenAlex",
      authors: ["Ada Lovelace", "Open Alex"],
    }),
  ]);

  assert.equal(deduped.length, 1);
  assert.equal(deduped[0]?.sourceType, "Crossref");
  assert.match(deduped[0]?.abstract ?? "", /microhabitat ecology/);
  assert.equal(deduped[0]?.dedupeKey, "title:spider habitat selection|author:ada lovelace|year:2020");
});

test("filters accepted and rejected sources explicitly", () => {
  const accepted = source({ id: "accepted", reviewState: "accepted" });
  const rejected = source({ id: "rejected", reviewState: "rejected", doi: "10.1000/rejected" });
  const pending = source({ id: "pending", reviewState: "pending", doi: "10.1000/pending" });

  assert.deepEqual(acceptedSourceRecords([accepted, rejected, pending]), [accepted]);
  assert.deepEqual(candidateSourceRecords([accepted, rejected, pending]), [pending]);
  assert.deepEqual(rejectedSourceRecords([accepted, rejected, pending]), [rejected]);
});

test("counts source review tabs from filtered records", () => {
  const sources = [
    source({ id: "accepted", reviewState: "accepted" }),
    source({ id: "pending", reviewState: "pending", doi: "10.1000/pending" }),
    source({ id: "rejected", reviewState: "rejected", doi: "10.1000/rejected" }),
  ];

  assert.deepEqual(sourceReviewCounts(sources), {
    all: sources.length,
    accepted: acceptedSourceRecords(sources).length,
    pending: candidateSourceRecords(sources).length,
    rejected: rejectedSourceRecords(sources).length,
  });
});

test("accepted source count stays aligned with review-state driven card state", () => {
  const sources = [
    source({ id: "accepted-1", reviewState: "accepted" }),
    source({ id: "accepted-2", reviewState: "accepted", status: "accepted" } as Partial<SourceRecord>),
    source({ id: "pending-1", reviewState: "pending" }),
  ];

  const acceptedIds = acceptedSourceRecords(sources).map((item) => item.id);
  const acceptedCardCount = sources.filter(
    (item) => sourceReviewState(item) === "accepted",
  ).length;

  assert.equal(acceptedIds.length, acceptedCardCount);
  assert.deepEqual(sourceReviewCounts(sources).accepted, acceptedCardCount);
});

test("reads accepted review aliases before rendering source lists", () => {
  const acceptedByStatus = source({
    id: "status-accepted",
    doi: "10.1000/status-accepted",
    reviewState: "pending",
    status: "accepted",
  } as Partial<SourceRecord>);
  const dismissedByStatus = source({
    id: "status-dismissed",
    doi: "10.1000/status-dismissed",
    reviewState: "pending",
    reviewStatus: "dismissed",
  } as Partial<SourceRecord>);
  const pending = source({ id: "pending", doi: "10.1000/pending", reviewState: "pending" });
  const sources = [acceptedByStatus, dismissedByStatus, pending];

  assert.equal(sourceReviewState(acceptedByStatus), "accepted");
  assert.equal(sourceReviewState(dismissedByStatus), "rejected");
  assert.deepEqual(acceptedSourceRecords(sources), [acceptedByStatus]);
  assert.deepEqual(candidateSourceRecords(sources), [pending]);
  assert.deepEqual(rejectedSourceRecords(sources), [dismissedByStatus]);
});

test("updates source review state without duplicating source records", () => {
  const sources = [
    source({ id: "first", doi: "10.1000/first", title: "First source" }),
    source({ id: "second", doi: "10.1000/second", title: "Second source" }),
  ];

  const accepted = updateSourceReviewState(sources, "first", "accepted");
  const undone = updateSourceReviewState(accepted, "first", "pending");

  assert.equal(accepted.length, 2);
  assert.equal(accepted[0]?.reviewState, "accepted");
  assert.equal(accepted[1]?.reviewState, "pending");
  assert.equal(undone.length, 2);
  assert.equal(undone[0]?.reviewState, "pending");
  assert.deepEqual(undone.map((item) => item.id), ["first", "second"]);
});

test("auto accepts directly relevant primary sources into the same accepted-source state", () => {
  const autoAccepted = autoAcceptPrimarySources([
    source({
      id: "primary",
      doi: "10.1000/primary",
      classification: "primary",
      relevanceLevel: "primary",
      shouldRecommendAccept: true,
      shouldShowInMainList: true,
      evidenceGrounding: "abstract_grounded",
    }),
    source({
      id: "secondary",
      doi: "10.1000/secondary",
      classification: "review",
      relevanceLevel: "secondary",
      shouldRecommendAccept: true,
      shouldShowInMainList: true,
      evidenceGrounding: "abstract_grounded",
    }),
    source({
      id: "metadata-only",
      doi: "10.1000/metadata-only",
      classification: "primary",
      relevanceLevel: "primary",
      shouldRecommendAccept: true,
      shouldShowInMainList: true,
      evidenceGrounding: "metadata_only",
      isMetadataOnly: true,
    }),
  ]);

  assert.equal(sourceReviewState(autoAccepted[0]!), "accepted");
  assert.equal(sourceReviewState(autoAccepted[1]!), "pending");
  assert.equal(sourceReviewState(autoAccepted[2]!), "pending");
  assert.deepEqual(
    acceptedSourceRecords(autoAccepted).map((item) => item.id),
    ["primary"],
  );
});

test("zero recommendations never falls back to accepting every retrieved source", () => {
  const retrieved = Array.from({ length: 12 }, (_, index) =>
    source({
      id: `manual-review-${index + 1}`,
      doi: `10.1000/manual-review-${index + 1}`,
      classification: "primary",
      relevanceLevel: "primary",
      shouldRecommendAccept: undefined,
      shouldShowInMainList: true,
      recommendationBucket: "manual_review",
      evidenceGrounding: "abstract_grounded",
    }),
  );

  const projected = autoAcceptPrimarySources(retrieved);

  assert.equal(projected.length, 12);
  assert.equal(acceptedSourceRecords(projected).length, 0);
  assert.equal(candidateSourceRecords(projected).length, 12);
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
