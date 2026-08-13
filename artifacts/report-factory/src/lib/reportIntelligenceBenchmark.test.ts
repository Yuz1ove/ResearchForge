import assert from "node:assert/strict";
import test from "node:test";

import { runReportIntelligenceBenchmarkSuite } from "./reportIntelligenceBenchmark.ts";

test("benchmark_suite_has_no_unexplained_regression", () => {
  const result = runReportIntelligenceBenchmarkSuite({
    A: "PASS",
    B: "PASS",
    C: "PASS",
    D: "PASS",
    E: "PASS",
    F: "PASS",
    G: "PASS",
  });

  assert.deepEqual(result.rows.map((row) => row.benchmarkId), ["A", "B", "C", "D", "E", "F", "G"]);
  assert.deepEqual(result.rows.map((row) => row.status), Array(7).fill("PASS"));
  assert.deepEqual(result.unexplainedRegressions, []);
  assert.equal(result.passed, true);
});

test("benchmark runner emits only the declared regression-matrix vocabulary", () => {
  const result = runReportIntelligenceBenchmarkSuite();
  assert.ok(result.rows.every((row) => ["PASS", "FAIL", "REGRESSION", "NOT APPLICABLE", "BLOCKED"].includes(row.status)));
});
