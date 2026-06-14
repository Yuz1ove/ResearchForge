import assert from "node:assert/strict";
import test from "node:test";
import {
  PREFLIGHT_DEBUG_LABELS,
  SEARCH_INTENT_DEBUG_LABELS,
  preflightDebugLabel,
  searchIntentDebugLabel,
} from "./zhTwLabels.ts";

test("preflight debug label map renders Traditional Chinese labels", () => {
  assert.equal(PREFLIGHT_DEBUG_LABELS.domains, "主題領域");
  assert.equal(PREFLIGHT_DEBUG_LABELS.recommended_keywords, "建議搜尋關鍵詞");
  assert.equal(PREFLIGHT_DEBUG_LABELS.preferred_source_types, "優先資料來源類型");
  assert.equal(PREFLIGHT_DEBUG_LABELS.avoid_source_types, "避免資料來源類型");
  assert.equal(PREFLIGHT_DEBUG_LABELS.common_failure_modes, "常見誤判風險");
  assert.equal(preflightDebugLabel("domains"), "主題領域");
});

test("search intent debug label map renders Traditional Chinese labels", () => {
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.searchIntent, "搜尋意圖");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.primaryConcepts, "核心概念");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.contextConcepts, "場域概念");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.outcomeConcepts, "影響結果");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.mustHaveTerms, "必須相關詞");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.lowWeightTerms, "低權重詞");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.plannerStatus, "搜尋規劃狀態");
  assert.equal(SEARCH_INTENT_DEBUG_LABELS.fallbackUsed, "是否使用備援規劃");
  assert.equal(searchIntentDebugLabel("searchIntent"), "搜尋意圖");
});
