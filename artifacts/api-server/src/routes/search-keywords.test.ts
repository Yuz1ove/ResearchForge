import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchKeywordsRequest } from "./search-keywords";

test("search keyword request normalization rejects invalid input without opening a network listener", () => {
  assert.equal(normalizeSearchKeywordsRequest({}), null);
  assert.equal(normalizeSearchKeywordsRequest({ topic: "   " }), null);
});

test("search keyword request normalization trims valid topics", () => {
  const request = normalizeSearchKeywordsRequest({
    topic: "  短影音使用對高中生注意力與睡眠品質之影響  ",
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
    sourceMode: "academic",
  });

  assert.deepEqual(request, {
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    language: "zh-TW",
    sourceMode: "academic",
  });
});
