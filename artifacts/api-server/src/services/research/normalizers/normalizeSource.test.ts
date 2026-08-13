import assert from "node:assert/strict";
import test from "node:test";

import { dedupeSourceRecords, normalizeSourceRecord } from "@workspace/api-zod";
import {
  normalizedSourceToSourceRecord,
  sourceRecordToNormalizedSource,
} from "./normalizeSource";

test("source normalization preserves a publisher-readable URL separately from the DOI URL", () => {
  const source = normalizeSourceRecord({
    title: "Measurement of falling raindrops",
    authors: ["Yasuhide Takano"],
    year: 2014,
    abstract: null,
    doi: "10.2208/jscejhe.70.i_523",
    url: "https://doi.org/10.2208/jscejhe.70.i_523",
    fullTextUrl:
      "https://www.jstage.jst.go.jp/article/jscejhe/70/4/70_88/_article/-char/en/",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Japan Society of Civil Engineers",
    containerTitle: "Journal of Japan Society of Civil Engineers",
    accessedAt: null,
    provider: "Crossref",
    queryUsed: "raindrop terminal velocity",
  });

  const normalized = sourceRecordToNormalizedSource(source, {
    workflowId: "wf-rain",
    topicHash: "rain-hash",
  });
  const restored = normalizedSourceToSourceRecord(normalized);

  assert.equal(normalized.url, "https://doi.org/10.2208/jscejhe.70.i_523");
  assert.match(normalized.fullTextUrl ?? "", /jstage\.jst\.go\.jp/u);
  assert.equal(restored.url, "https://doi.org/10.2208/jscejhe.70.i_523");
  assert.match(restored.fullTextUrl ?? "", /jstage\.jst\.go\.jp/u);
});

test("Semantic Scholar provider labels never round-trip as publication venue", () => {
  const source = normalizeSourceRecord({
    id: "semantic-scholar-provider-label",
    title: "Urban canopy and thermal exposure",
    authors: ["A. Researcher"],
    year: 2024,
    abstract: "This abstract reports a traceable urban heat finding.",
    doi: "10.1000/semantic-provider",
    url: "https://www.semanticscholar.org/paper/example",
    sourceType: "Semantic Scholar",
    reviewState: "accepted",
    provider: "Semantic Scholar",
    publisher: "Semantic Scholar",
    containerTitle: "Semantic Scholar",
    accessedAt: null,
  });
  const normalized = sourceRecordToNormalizedSource(source, {
    workflowId: "wf-semantic-provider",
    topicHash: "semantic-provider-hash",
  });
  const restored = normalizedSourceToSourceRecord(normalized);

  assert.equal(source.provider, "Semantic Scholar");
  assert.equal(source.publisher, null);
  assert.equal(source.containerTitle, null);
  assert.equal(normalized.publisher, undefined);
  assert.equal(normalized.venue, undefined);
  assert.equal(restored.publisher, null);
  assert.equal(restored.containerTitle, null);
});

test("source normalization promotes every supported abstract alias into canonical abstract", () => {
  const aliases = ["abstractOriginal", "originalAbstract", "extractedAbstract"] as const;
  for (const alias of aliases) {
    const source = normalizeSourceRecord({
      title: `Alias fixture ${alias}`,
      authors: ["A. Researcher"],
      year: 2025,
      abstract: null,
      [alias]: `${alias} contains a real provider abstract with methods and findings.`,
      doi: `10.1000/${alias.toLowerCase()}`,
      url: null,
      sourceType: "OpenAlex",
      reviewState: "accepted",
      publisher: null,
      containerTitle: "Journal of Alias Tests",
      accessedAt: null,
    });
    assert.match(source.abstract ?? "", /real provider abstract/u, alias);
    assert.equal(source.contentLevel, "abstract", alias);
    assert.equal(source.isMetadataOnly, false, alias);
  }
});

test("source normalization restores an OpenAlex inverted abstract from provider payload", () => {
  const source = normalizeSourceRecord({
    title: "OpenAlex inverted abstract fixture",
    authors: ["A. Researcher"],
    year: 2025,
    abstract: null,
    doi: "10.1000/inverted",
    url: null,
    sourceType: "OpenAlex",
    reviewState: "accepted",
    publisher: null,
    containerTitle: "Journal of Alias Tests",
    accessedAt: null,
    rawProviderPayload: {
      abstract_inverted_index: {
        Resource: [0],
        guarding: [1],
        responds: [2],
        to: [3],
        training: [4],
      },
    },
  } as Parameters<typeof normalizeSourceRecord>[0] & { rawProviderPayload: unknown });

  assert.equal(source.abstract, "Resource guarding responds to training");
  assert.equal(source.abstractMissing, false);
});

test("DOI dedupe preserves the abstract and richer metadata when metadata-only arrives first", () => {
  const sources = dedupeSourceRecords([
    normalizeSourceRecord({
      title: "Resource guarding intervention study",
      authors: [],
      year: 2024,
      abstract: null,
      doi: "https://doi.org/10.1000/guarding",
      url: null,
      sourceType: "Crossref",
      reviewState: "accepted",
      publisher: null,
      containerTitle: null,
      accessedAt: null,
      isMetadataOnly: true,
    }),
    normalizeSourceRecord({
      title: "Resource guarding intervention study",
      authors: ["A. Researcher", "B. Trainer"],
      year: 2024,
      abstractOriginal:
        "This abstract reports the intervention methods, observed outcomes, and study limitations.",
      doi: "10.1000/guarding",
      url: "https://example.org/guarding",
      sourceType: "OpenAlex",
      reviewState: "accepted",
      publisher: "Research Press",
      containerTitle: "Applied Animal Behaviour Science",
      accessedAt: null,
      providerIds: { openalex: "https://openalex.org/W123" },
    }),
  ]);

  assert.equal(sources.length, 1);
  assert.match(sources[0]?.abstract ?? "", /observed outcomes/u);
  assert.deepEqual(sources[0]?.authors, ["A. Researcher", "B. Trainer"]);
  assert.equal(sources[0]?.containerTitle, "Applied Animal Behaviour Science");
  assert.equal(sources[0]?.contentLevel, "abstract");
  assert.equal(sources[0]?.isMetadataOnly, false);
});

test("dedupe bridges a metadata-only copy to a richer DOI copy on strict identity", () => {
  const metadataOnly = normalizeSourceRecord({
    id: "crossref-metadata-copy",
    title: "Resource guarding intervention study",
    authors: ["A. Researcher"],
    year: 2024,
    abstract: null,
    doi: null,
    url: null,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: null,
    containerTitle: null,
    accessedAt: null,
  });
  const richDoiCopy = normalizeSourceRecord({
    id: "openalex-rich-copy",
    title: "Resource guarding intervention study",
    authors: ["A. Researcher", "B. Trainer"],
    year: 2024,
    abstractOriginal:
      "This provider abstract reports the intervention methods, observed outcomes, and limitations.",
    doi: "10.1000/guarding-rich",
    url: "https://example.org/guarding-rich",
    sourceType: "OpenAlex",
    reviewState: "accepted",
    publisher: "Research Press",
    containerTitle: "Applied Animal Behaviour Science",
    accessedAt: null,
  });

  const sources = dedupeSourceRecords([metadataOnly, richDoiCopy]);

  assert.equal(sources.length, 1);
  assert.equal(sources[0]?.doi, "10.1000/guarding-rich");
  assert.equal(sources[0]?.dedupeKey, "doi:10.1000/guarding-rich");
  assert.equal(sources[0]?.canonicalSourceIdentity, "doi:10.1000/guarding-rich");
  assert.match(sources[0]?.abstract ?? "", /observed outcomes/u);
  assert.equal(sources[0]?.containerTitle, "Applied Animal Behaviour Science");
});

test("metadata-to-DOI bridge requires title, first author, and year to all match", () => {
  const base = {
    title: "Resource guarding intervention study",
    authors: ["A. Researcher"],
    year: 2024,
    abstract: null,
    url: null,
    sourceType: "Crossref" as const,
    reviewState: "accepted" as const,
    publisher: null,
    containerTitle: null,
    accessedAt: null,
  };
  const sources = dedupeSourceRecords([
    normalizeSourceRecord({ ...base, id: "metadata", doi: null }),
    normalizeSourceRecord({
      ...base,
      id: "doi-copy",
      authors: ["Different Author"],
      doi: "10.1000/different-author",
    }),
  ]);

  assert.equal(sources.length, 2);
});

test("dedupe never merges same-title studies with different DOI identities", () => {
  const base = {
    title: "Effects of positive reinforcement training",
    authors: ["A. Researcher"],
    year: 2024,
    abstract: null,
    url: null,
    sourceType: "Crossref" as const,
    reviewState: "accepted" as const,
    publisher: null,
    containerTitle: "Behaviour Journal",
    accessedAt: null,
  };
  const sources = dedupeSourceRecords([
    normalizeSourceRecord({ ...base, doi: "10.1000/study-a" }),
    normalizeSourceRecord({ ...base, doi: "10.1000/study-b" }),
  ]);
  assert.equal(sources.length, 2);
});

test("dedupe does not collapse merely similar titles without a shared canonical identity", () => {
  const records = [1, 2, 10].map((index) =>
    normalizeSourceRecord({
      id: `study-${index}`,
      title: `Student alertness study ${index}`,
      authors: ["A. Researcher"],
      year: 2024,
      abstract: "Caffeine intake patterns in students.",
      doi: null,
      url: null,
      sourceType: "OpenAlex",
      reviewState: "pending",
      publisher: null,
      containerTitle: "Journal of Alertness",
      accessedAt: null,
    }),
  );

  assert.equal(dedupeSourceRecords(records).length, 3);
});

test("metadata-only official background can support a labelled background report but not claims", () => {
  const source = normalizeSourceRecord({
    id: "nasa-background",
    title: "Why sunsets appear red",
    authors: ["NASA Education"],
    year: 2024,
    abstract: null,
    doi: null,
    url: "https://example.gov/sunset",
    sourceType: "Official Source",
    reviewState: "accepted",
    publisher: "NASA",
    containerTitle: "Education",
    accessedAt: null,
    recommendationBucket: "official_background",
    acceptedByUser: true,
    userDecision: "accepted_as_background",
    acceptedAs: "background",
  });

  assert.equal(source.contentLevel, "metadata");
  assert.equal(source.canUseForClaims, false);
  assert.equal(source.canUseForReport, true);
});
