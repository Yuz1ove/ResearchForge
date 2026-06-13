import assert from "node:assert/strict";
import test from "node:test";
import { buildPreflightSearchQuery, runSearchPreflight } from "./searchPreflight.ts";

test("matches search tuning guidance without returning the full dataset", () => {
  const result = runSearchPreflight({
    topic: "報告生成器中的引用檢查機制對學生研究報告品質之影響",
    reportType: "研究報告",
  });

  assert.equal(result.matched_case_id, "academic_report_search_case_050");
  assert.equal(result.predicted_report_type, "研究報告");
  assert.equal(result.intent, "academic_report");
  assert.equal(result.isSoftwareProject, false);
  assert.ok(result.domains.includes("artificial_intelligence"));
  assert.ok(result.preferred_source_types.includes("peer_reviewed_journal"));
  assert.ok(result.avoid_source_types.includes("ai_generated_article_without_sources"));
  assert.ok(result.common_failure_modes.some((mode) => mode.includes("AI輸出")));
  assert.ok(result.evidence_requirements.some((rule) => rule.includes("不得生成無來源")));
  assert.ok(result.guidance_cases.length >= 1 && result.guidance_cases.length <= 3);
});

test("falls back to generic academic guidance for low-similarity topics", () => {
  const result = runSearchPreflight({
    topic: "完全陌生的自訂題目",
    reportType: "專題報告",
  });

  assert.equal(result.matched_case_id, "generic_academic_report");
  assert.equal(result.predicted_report_type, "專題報告");
  assert.deepEqual(result.domains, ["general_academic_research"]);
  assert.ok(result.evidence_requirements.some((rule) => rule.includes("百分比")));
  assert.equal(result.guidance_cases.length, 1);
});

test("detects software project signals even when matched tuning cases are academic", () => {
  const result = runSearchPreflight({
    topic: "AI 報告生成器網站開發與引用檢查系統",
    reportType: "專題報告",
  });

  assert.equal(result.isSoftwareProject, true);
  assert.ok(result.domains.includes("software_engineering"));
  assert.ok(result.preferred_source_types.includes("official_documentation"));
  assert.ok(result.avoid_source_types.includes("outdated_tutorial_without_version"));
  assert.ok(result.evidence_requirements.some((rule) => rule.includes("軟體功能")));
});

test("builds a compact search query from topic plus a few guidance keywords", () => {
  const result = runSearchPreflight({
    topic: "豬在農業生產與生態系統中的角色與價值之研究",
    reportType: "研究報告",
  });
  const query = buildPreflightSearchQuery("豬在農業生產與生態系統中的角色與價值之研究", result);

  assert.match(query, /豬在農業生產與生態系統中的角色與價值之研究/);
  assert.ok(query.length < 180);
});
