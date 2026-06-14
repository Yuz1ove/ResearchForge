import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSearchSourcesRequest } from "./search-sources";

test("search source request normalization rejects invalid input without opening a network listener", () => {
  assert.equal(normalizeSearchSourcesRequest({}), null);
  assert.equal(normalizeSearchSourcesRequest({ query: "   " }), null);
  assert.equal(normalizeSearchSourcesRequest({ topic: "   " }), null);
});

test("search source request normalization keeps existing query-style calls", () => {
  assert.deepEqual(normalizeSearchSourcesRequest({ query: "  student sleep quality  " }), {
    kind: "query",
    query: "student sleep quality",
  });
});

test("search source request normalization accepts generator topic-style calls", () => {
  assert.deepEqual(
    normalizeSearchSourcesRequest({
      topic: "  短影音使用對高中生注意力與睡眠品質之影響  ",
      reportType: "研究報告",
      audience: "高中",
      language: "zh-TW",
      sourceMode: "academic",
    }),
    {
      kind: "topic",
      input: {
        topic: "短影音使用對高中生注意力與睡眠品質之影響",
        reportType: "研究報告",
        audience: "高中",
        language: "zh-TW",
        sourceMode: "academic",
      },
    },
  );
});
