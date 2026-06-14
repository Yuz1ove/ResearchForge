import assert from "node:assert/strict";
import test from "node:test";
import { PREFLIGHT_DEBUG_LABELS, preflightDebugLabel } from "./zhTwLabels.ts";

test("preflight debug label map renders Traditional Chinese labels", () => {
  assert.equal(PREFLIGHT_DEBUG_LABELS.domains, "主題領域");
  assert.equal(PREFLIGHT_DEBUG_LABELS.recommended_keywords, "建議搜尋關鍵詞");
  assert.equal(PREFLIGHT_DEBUG_LABELS.preferred_source_types, "優先資料來源類型");
  assert.equal(PREFLIGHT_DEBUG_LABELS.avoid_source_types, "避免資料來源類型");
  assert.equal(PREFLIGHT_DEBUG_LABELS.common_failure_modes, "常見誤判風險");
  assert.equal(preflightDebugLabel("domains"), "主題領域");
});
