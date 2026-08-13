import {
  CrossSourceClaimGraphSchema,
  NormalizedFactSchema,
  type NormalizedFact,
} from "@workspace/api-zod";

import {
  buildContradictionAnalysis,
  buildHeterogeneityAnalysis,
  buildStatisticalInterpretations,
  classifyFactComparability,
  routeReportArchetype,
} from "./reportIntelligence.ts";

export const REPORT_INTELLIGENCE_BENCHMARK_VERSION = "researchforge-report-intelligence/v1";

export type BenchmarkStatus = "PASS" | "FAIL" | "REGRESSION" | "NOT APPLICABLE" | "BLOCKED";

export interface ReportIntelligenceBenchmarkRow {
  benchmarkId: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  scenario: string;
  checks: string[];
  status: BenchmarkStatus;
  diagnostics: string[];
}

export interface ReportIntelligenceBenchmarkResult {
  version: string;
  rows: ReportIntelligenceBenchmarkRow[];
  unexplainedRegressions: string[];
  passed: boolean;
}

function benchmarkFact(id: string, overrides: Partial<NormalizedFact> = {}): NormalizedFact {
  const sourceId = overrides.sourceId ?? `benchmark-source-${id}`;
  return NormalizedFactSchema.parse({
    factId: `benchmark-fact-${id}`,
    evidenceId: `benchmark-evidence-${id}`,
    sourceId,
    canonicalSourceId: sourceId,
    sourceType: "journal_article",
    evidenceLevel: "direct",
    sourceAccessLevel: "structured_full_text",
    sectionType: "primary_results",
    claimTextZhTw: "較高短影音使用與較差睡眠品質同向變動。",
    population: "高中生",
    ageGroup: "15–18 歲",
    sampleSize: 500,
    geography: "臺灣",
    studySetting: "高中校園",
    studyDesign: "橫斷觀察研究",
    exposureConcept: "短影音使用",
    exposureMeasure: "每日使用時數",
    outcomeConcept: "睡眠品質",
    outcomeMeasure: "PSQI 分數",
    statisticType: "correlation",
    value: 0.3,
    lowerCI: 0.12,
    upperCI: 0.46,
    pValue: 0.01,
    unit: "coefficient",
    direction: "positive",
    mediator: null,
    moderator: null,
    confounders: null,
    adjustmentStatus: "已調整年齡與性別",
    evidenceDirectness: "A",
    sourceSpan: "Results paragraph 2",
    certainty: "moderate",
    confidence: 0.88,
    authorInterpretation: null,
    authorLimitations: null,
    extractionConfidence: 0.91,
    verificationStatus: "verified",
    evidenceFunction: "support",
    location: "臺灣",
    setting: "高中校園",
    exposure: "短影音使用",
    outcome: "睡眠品質",
    method: "橫斷觀察研究",
    numericalResults: [{
      rawText: "r = 0.30, 95% CI 0.12–0.46, p = 0.01",
      measure: "PSQI 分數",
      value: 0.3,
      unit: "coefficient",
      statisticType: "correlation",
      lowerCI: 0.12,
      upperCI: 0.46,
      pValue: 0.01,
      uncertainty: "95% CI",
    }],
    associationDirection: "positive",
    uncertainty: "95% CI",
    directness: "A",
    applicability: "高中校園樣本",
    locator: "Results paragraph 2",
    themeKey: "short-video-sleep",
    conceptAxes: ["exposure:short-video", "outcome:sleep-quality"],
    comparabilityKey: "high-school|short-video-hours|PSQI|correlation",
    limitations: ["橫斷研究無法確認時間先後。"],
    supportingEvidenceIds: [`benchmark-evidence-${id}`],
    supportingSourceIds: [sourceId],
    writerEligible: true,
    ...overrides,
  });
}

function row(input: Omit<ReportIntelligenceBenchmarkRow, "status"> & {
  passed: boolean;
  baselineStatus?: BenchmarkStatus;
}): ReportIntelligenceBenchmarkRow {
  const status: BenchmarkStatus = input.passed
    ? "PASS"
    : input.baselineStatus === "PASS"
      ? "REGRESSION"
      : "FAIL";
  return {
    benchmarkId: input.benchmarkId,
    scenario: input.scenario,
    checks: input.checks,
    status,
    diagnostics: input.diagnostics,
  };
}

/**
 * Fixed, provider-free A–G contract suite. It protects deterministic report
 * intelligence behavior; it does not substitute for live provider or rendered
 * document acceptance, which is reported separately by QA.
 */
export function runReportIntelligenceBenchmarkSuite(
  baseline: Partial<Record<ReportIntelligenceBenchmarkRow["benchmarkId"], BenchmarkStatus>> = {},
): ReportIntelligenceBenchmarkResult {
  const rows: ReportIntelligenceBenchmarkRow[] = [];

  const quantitativeFacts = [benchmarkFact("a1"), benchmarkFact("a2"), benchmarkFact("a3")];
  const quantitativeStats = buildStatisticalInterpretations({ facts: quantitativeFacts });
  const quantitativeHeterogeneity = buildHeterogeneityAnalysis(quantitativeFacts);
  rows.push(row({
    benchmarkId: "A",
    scenario: "多筆定量研究方向一致",
    checks: ["統計抽取", "視覺路由", "跨研究可比性"],
    passed: quantitativeStats.length === 3 &&
      quantitativeStats.every((item) => item.recommendedVisual === "correlation_matrix") &&
      quantitativeHeterogeneity.comparisons.every((item) => item.status === "COMPARABLE"),
    baselineStatus: baseline.A,
    diagnostics: [
      `interpretations=${quantitativeStats.length}`,
      `comparisons=${quantitativeHeterogeneity.comparisons.length}`,
    ],
  }));

  const odds = benchmarkFact("b-or", {
    statisticType: "odds_ratio",
    value: 1.6,
    lowerCI: 1.1,
    upperCI: 2.3,
    unit: "ratio",
    numericalResults: [{ rawText: "OR = 1.6, 95% CI 1.1–2.3", measure: "睡眠不佳", value: 1.6, unit: "ratio", statisticType: "odds_ratio", lowerCI: 1.1, upperCI: 2.3, pValue: null, uncertainty: "95% CI" }],
  });
  const correlation = benchmarkFact("b-r");
  const incompatible = classifyFactComparability(odds, correlation);
  rows.push(row({
    benchmarkId: "B",
    scenario: "有數字但統計指標不可直接比較",
    checks: ["不錯誤合併", "不建立虛假排名", "保留方向性綜合"],
    passed: incompatible.status === "DIRECTION_ONLY" && !incompatible.numericPoolingAllowed,
    baselineStatus: baseline.B,
    diagnostics: [`status=${incompatible.status}`, `pooling=${incompatible.numericPoolingAllowed}`],
  }));

  const contradictionGraph = CrossSourceClaimGraphSchema.parse({
    researchQuestion: "結果方向是否一致？",
    claims: [{
      claimId: "benchmark-claim-c",
      claimType: "research_difference",
      readerFacingStatement: "跨來源結果不一致。",
      supportingFacts: ["benchmark-fact-c-support", "benchmark-fact-c-null"],
      contradictingFacts: ["benchmark-fact-c-counter"],
      backgroundFacts: [],
      applicability: ["高中生"],
      confidence: 0.55,
      citationIds: ["benchmark-source-c-support", "benchmark-source-c-null", "benchmark-source-c-counter"],
      visualizable: false,
      visualId: null,
      evidenceDirectness: "B",
      limitations: [],
    }],
    edges: [],
  });
  const contradiction = buildContradictionAnalysis({
    claimGraph: contradictionGraph,
    facts: [
      benchmarkFact("c-support"),
      benchmarkFact("c-counter", { associationDirection: "negative", direction: "negative" }),
      benchmarkFact("c-null", { associationDirection: "null", direction: "null" }),
    ],
  })[0];
  rows.push(row({
    benchmarkId: "C",
    scenario: "研究結果互相矛盾",
    checks: ["反例保留", "無顯著結果保留", "替代解釋"],
    passed: contradiction?.status === "contradictory" &&
      contradiction.counterFactIds.length === 1 && contradiction.nullFactIds.length === 1 &&
      contradiction.alternativeExplanations.length > 0,
    baselineStatus: baseline.C,
    diagnostics: [
      `status=${contradiction?.status ?? "missing"}`,
      `counter=${contradiction?.counterFactIds.length ?? 0}`,
      `null=${contradiction?.nullFactIds.length ?? 0}`,
    ],
  }));

  const abstractFact = benchmarkFact("d", {
    sourceAccessLevel: "partial_abstract",
    sectionType: "abstract",
    evidenceLevel: "near_direct",
    evidenceDirectness: "B",
    directness: "B",
    verificationStatus: "needs_review",
  });
  const limited = routeReportArchetype({
    question: "現有研究如何回答這個問題？",
    facts: [abstractFact],
    forceLimited: true,
  });
  rows.push(row({
    benchmarkId: "D",
    scenario: "只有少量摘要證據",
    checks: ["誠實降級", "不虛構全文", "不硬填章節"],
    passed: limited.archetypeId === "limited_evidence_report" && !limited.minimumConditionsMet,
    baselineStatus: baseline.D,
    diagnostics: [`archetype=${limited.archetypeId}`, `downgradedFrom=${limited.downgradedFrom}`],
  }));

  const multilingualZh = benchmarkFact("e-zh", { sourceId: "doi:10.1000/multilingual", canonicalSourceId: "doi:10.1000/multilingual" });
  const multilingualEn = benchmarkFact("e-en", {
    sourceId: "doi:10.1000/multilingual",
    canonicalSourceId: "doi:10.1000/multilingual",
    population: "high school students",
    exposureConcept: "short-form video use",
    exposure: "short-form video use",
    outcomeConcept: "sleep quality",
    outcome: "sleep quality",
  });
  const multilingualComparison = classifyFactComparability(multilingualZh, multilingualEn);
  rows.push(row({
    benchmarkId: "E",
    scenario: "不同語言來源",
    checks: ["概念標準化", "引用身分一致", "不重複計數"],
    passed: multilingualComparison.status === "COMPARABLE" &&
      new Set([multilingualZh.canonicalSourceId, multilingualEn.canonicalSourceId]).size === 1 &&
      multilingualZh.value === multilingualEn.value,
    baselineStatus: baseline.E,
    diagnostics: [`status=${multilingualComparison.status}`, "canonicalSources=1"],
  }));

  const background = benchmarkFact("f", {
    evidenceLevel: "background",
    evidenceFunction: "background",
    evidenceDirectness: "C",
    directness: "C",
    associationDirection: "not_applicable",
    direction: "not_applicable",
  });
  const noDirect = routeReportArchetype({
    question: "目前證據能否直接回答研究問題？",
    facts: [background],
    forceLimited: true,
  });
  rows.push(row({
    benchmarkId: "F",
    scenario: "沒有直接證據",
    checks: ["背景不冒充直接結果", "顯示研究缺口"],
    passed: background.evidenceLevel === "background" &&
      noDirect.archetypeId === "limited_evidence_report",
    baselineStatus: baseline.F,
    diagnostics: [`evidenceLevel=${background.evidenceLevel}`, `archetype=${noDirect.archetypeId}`],
  }));

  const design = routeReportArchetype({
    question: "如何設計一個隨機實驗，包含變項、假設、流程與驗證方式？",
    facts: [],
  });
  rows.push(row({
    benchmarkId: "G",
    scenario: "方法型或實驗設計問題",
    checks: ["正確 archetype", "變項與假設", "流程與驗證"],
    passed: design.archetypeId === "experimental_design" &&
      design.sectionBlueprint.some((section) => /變項|假設/u.test(section)) &&
      design.sectionBlueprint.some((section) => /流程|驗證/u.test(section)),
    baselineStatus: baseline.G,
    diagnostics: [`archetype=${design.archetypeId}`, `sections=${design.sectionBlueprint.join("|")}`],
  }));

  const unexplainedRegressions = rows
    .filter((item) => item.status === "REGRESSION")
    .map((item) => item.benchmarkId);
  return {
    version: REPORT_INTELLIGENCE_BENCHMARK_VERSION,
    rows,
    unexplainedRegressions,
    passed: rows.every((item) => item.status === "PASS" || item.status === "NOT APPLICABLE") &&
      unexplainedRegressions.length === 0,
  };
}
