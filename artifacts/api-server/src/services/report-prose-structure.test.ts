import assert from "node:assert/strict";
import test from "node:test";
import { extractCanonicalCitationMarkers } from "./citation-markers";
import {
  normalizeReportSectionProse,
  reportSectionParagraphs,
} from "./report-prose-structure";

test("report prose normalization removes card labels, deduplicates claims, and unions citations", () => {
  const prose = normalizeReportSectionProse(
    [
      "主旨：雨滴終端速度會隨直徑增加而改變[S1]。",
      "摘要重點：雨滴終端速度會隨直徑增加而改變［Ｓ2］。",
      "限制：大型雨滴的變形會限制球形模型的適用範圍[S3]。",
      "限制說明：大型雨滴的變形會限制球形模型的適用範圍[S3]。",
      "光學影像可用來比較雨滴尺寸與下落速度[S4]。",
    ].join(""),
  );
  const paragraphs = reportSectionParagraphs(prose);

  assert.equal(paragraphs.length >= 2 && paragraphs.length <= 4, true);
  assert.doesNotMatch(prose, /(?:主旨|摘要重點|限制說明|限制)s*[：:]/u);
  assert.equal(prose.match(/雨滴終端速度會隨直徑增加而改變/gu)?.length, 1);
  assert.equal(prose.match(/大型雨滴的變形會限制球形模型/gu)?.length, 1);
  assert.deepEqual(extractCanonicalCitationMarkers(prose), ["[S1]", "[S2]", "[S3]", "[S4]"]);
  assert.match(prose, /\[S1\]\[S2\]/u);
});

test("report prose normalization supplements a one-sentence model section to two paragraphs", () => {
  const prose = normalizeReportSectionProse(
    "量測結果可支撐雨滴尺寸與下落速度的比較[S1]。",
    ["本節先界定量測範圍與證據使用邊界。尚未被來源覆蓋的部分不納入結論。"],
  );

  assert.equal(reportSectionParagraphs(prose).length, 2);
  assert.match(prose, /\[S1\]/u);
});

test("report prose normalization removes conflicting adjacent Chinese punctuation", () => {
  const prose = normalizeReportSectionProse(
    "現有證據支持方向性關聯；。但仍不能據此推定因果。；第二段說明適用邊界。",
  );

  assert.doesNotMatch(prose, /；。|。；/u);
  assert.match(prose, /方向性關聯；/u);
});
