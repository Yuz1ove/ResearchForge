import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReaderCitationGroup,
  readerCitationClusterLabel,
  stripReaderCitationTokens,
  type ReaderCitationEntry,
} from "./readerCitations.ts";

test("citation-display-mode keeps provenance while compacting reader labels", () => {
  const entries = [
    { label: "Bai et al., 2021", referenceNumber: 1 },
    { label: "Miller et al., 2020", referenceNumber: 2 },
    { label: "Tang, 2024", referenceNumber: 3 },
  ];
  assert.equal(readerCitationClusterLabel(entries, "compact"), "1–3");
  assert.equal(readerCitationClusterLabel(entries, "academic"), "〔1–3〕");
  assert.equal(
    readerCitationClusterLabel(entries),
    "（Bai et al., 2021；Miller et al., 2020；Tang, 2024）",
  );
});

test("reader citation grouping compresses presentation without changing ownership", () => {
  const entry = (referenceNumber: number, citationId: string, sourceId: string) => ({
    referenceNumber,
    citationId,
    sourceId,
    label: `Source ${referenceNumber}, 2026`,
    source: null,
    referenceText: "Reference",
    anchorId: `ref-${referenceNumber}`,
    externalHref: null,
    printHref: `#ref-${referenceNumber}`,
  }) satisfies ReaderCitationEntry;
  const group = buildReaderCitationGroup([
    entry(1, "citation-a", "source-a"),
    entry(2, "citation-b", "source-b"),
    entry(3, "citation-c", "source-c"),
    entry(6, "citation-f", "source-f"),
  ]);
  assert.equal(group.label, "1–3, 6");
  assert.deepEqual(group.citationIds, ["citation-a", "citation-b", "citation-c", "citation-f"]);
  assert.deepEqual(group.sourceIds, ["source-a", "source-b", "source-c", "source-f"]);
});

test("reader token cleanup removes ASCII and full-width source labels", () => {
  assert.equal(
    stripReaderCitationTokens("研究結果 [source:1]與［source：２］一致。"),
    "研究結果與一致。",
  );
});
