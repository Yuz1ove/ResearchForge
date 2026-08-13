import assert from "node:assert/strict";
import test from "node:test";

import {
  containsRawEnglishEvidenceText,
  sanitizeZhTwReportProse,
  UNTRANSLATED_EVIDENCE_NOTICE,
} from "./zhTwReportText.ts";

test("detects Chinese text immediately followed by an unquoted Abstract tail", () => {
  const input =
    "研究背景顯示睡眠不足可能影響注意力，Abstract The aim is to evaluate the mutual influences between sleep duration and adolescent risk behaviours[S1]。";

  assert.equal(containsRawEnglishEvidenceText(input), true);
  assert.doesNotMatch(sanitizeZhTwReportProse(input), /Abstract The aim/iu);
});

test("keeps a valid Chinese prefix before replacing the raw English tail", () => {
  const input =
    "研究背景顯示睡眠不足可能影響注意力，Abstract The aim is to evaluate the mutual influences between sleep duration and adolescent risk behaviours[S1]。";
  const sanitized = sanitizeZhTwReportProse(input);

  assert.match(sanitized, /^研究背景顯示睡眠不足可能影響注意力。/u);
  assert.match(sanitized, new RegExp(`${UNTRANSLATED_EVIDENCE_NOTICE}\\[S1\\]`));
});

test("binds citations after punctuation to their original sentence", () => {
  const sanitized = sanitizeZhTwReportProse(
    "研究問題聚焦睡眠與注意力。[S1][S2]\n下一句只說明尚待補充的限制。",
  );

  assert.match(sanitized, /研究問題聚焦睡眠與注意力\[S1\]\[S2\]。/u);
  assert.doesNotMatch(sanitized, /\[S1\]\[S2\]\s*下一句/u);
});

test("keeps Japanese source text in trace data instead of the zh-TW report body", () => {
  const sanitized = sanitizeZhTwReportProse(
    "雨滴のモデルとして異なる半径の球を用い，終端速度の理論値と測定値が概ね一致した。[S1]",
  );

  assert.doesNotMatch(sanitized, /\u306eモデル|用い|一致し/u);
  assert.equal(sanitized, `${UNTRANSLATED_EVIDENCE_NOTICE}[S1]。`);
});
