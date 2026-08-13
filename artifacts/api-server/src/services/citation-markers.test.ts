import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCitationMarker,
  canonicalizeCitationMarkersInText,
  extractCanonicalCitationMarkers,
  unresolvedInternalCitationTokens,
} from "./citation-markers";

test("all supported legacy citation variants normalize to one internal canonical marker", () => {
  const variants = [
    "{s2}",
    "{S2}",
    "{{s2}}",
    "[s2]",
    "［Ｓ2］",
    "[source:2]",
    "source_2",
    "citation_2",
  ];

  for (const variant of variants) {
    assert.equal(canonicalizeCitationMarkersInText(`證據${variant}。`), "證據[S2]。");
    assert.equal(canonicalCitationMarker(variant), "[S2]");
  }
  assert.deepEqual(
    extractCanonicalCitationMarkers(variants.join(" ")),
    ["[S2]"],
  );
});

test("scientific supplement labels remain prose instead of becoming citations", () => {
  const text = "Figure S2a 與 Table S1 是附錄標籤；這一句才是來源 [s3]。";
  const normalized = canonicalizeCitationMarkersInText(text);

  assert.match(normalized, /Figure S2a/u);
  assert.match(normalized, /Table S1/u);
  assert.match(normalized, /\[S3\]/u);
  assert.deepEqual(extractCanonicalCitationMarkers(text), ["[S3]"]);
});

test("unresolved tool and workflow tokens are reported for fail-closed export", () => {
  const text = "turn0search1 【37†L2-L4】 sourceId evidenceSetHash evidenceCardId reasonCode";
  const tokens = unresolvedInternalCitationTokens(text);

  assert.deepEqual(tokens, [
    "turn0search1",
    "【37†L2-L4】",
    "sourceId",
    "evidenceSetHash",
    "evidenceCardId",
    "reasonCode",
  ]);
});
