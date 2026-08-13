import type { StandardizedNumericalResult } from "./standardizedEvidenceFacts.ts";

export type RoutedStatisticType =
  | "proportion"
  | "odds_ratio"
  | "correlation_coefficient";

export type StatisticalVisualType =
  | "proportion_facets"
  | "forest_plot"
  | "correlation_structure";

export type StatisticalComparisonMode =
  | "independent_facets"
  | "interval_display"
  | "association_network"
  | "pooled"
  | "ranked";

export interface VisualSemanticRoute {
  statisticType: RoutedStatisticType;
  visualType: StatisticalVisualType;
  comparisonMode: Exclude<StatisticalComparisonMode, "pooled" | "ranked">;
  rankingAllowed: false;
  poolingAllowed: false;
  referenceValue: 1 | null;
  caveat: string;
}

export type VisualSemanticRouteResult =
  | { ok: true; route: VisualSemanticRoute }
  | { ok: false; reason: string };

export interface RouteVisualStatisticGroupInput {
  results: StandardizedNumericalResult[];
  requestedVisualType: StatisticalVisualType;
  comparisonMode: StatisticalComparisonMode;
}

interface SemanticDatumIdentity {
  datumKey: string;
}

export interface ProportionFacetDatum extends SemanticDatumIdentity {
  label: string;
  value: number;
  unit: "%";
  metric: string;
  sourceId: string;
  evidenceId: string;
  factId: string;
  numericalResultId: string;
  sampleDefinition: string;
  directComparisonAllowed: false;
}

export interface ForestPlotDatum extends SemanticDatumIdentity {
  label: string;
  estimate: number;
  lowerBound: number;
  upperBound: number;
  unit: "OR";
  sourceId: string;
  evidenceId: string;
  factId: string;
  numericalResultId: string;
}

export interface CorrelationLinkDatum extends SemanticDatumIdentity {
  from: string;
  to: string;
  value: number;
  unit: "r";
  sourceId: string;
  evidenceId: string;
  factId: string;
  numericalResultId: string;
}

export interface SchematicDatum extends SemanticDatumIdentity {
  label: string;
  count?: number;
}

/**
 * Renderer-independent semantic data. FigureSpec.data remains the deterministic
 * text fallback; renderers that understand this payload can draw the faithful
 * statistical form without guessing from labels.
 */
export type EvidenceVisualSemanticData =
  | {
      kind: "proportion_facets";
      scaleMinimum: 0;
      scaleMaximum: 100;
      unit: "%";
      panelMode: "independent";
      directComparisonAllowed: false;
      rankingAllowed: false;
      poolingAllowed: false;
      panels: ProportionFacetDatum[];
    }
  | {
      kind: "forest_plot";
      statisticType: "odds_ratio";
      referenceValue: 1;
      rankingAllowed: false;
      poolingAllowed: false;
      rows: ForestPlotDatum[];
    }
  | {
      kind: "correlation_structure";
      statisticType: "correlation_coefficient";
      nodes: Array<{ id: string; label: string }>;
      links: CorrelationLinkDatum[];
      percentConversionAllowed: false;
      causalClaim: false;
    }
  | {
      kind: "mediation_path";
      nodes: Array<{ id: string; label: string }>;
      edges: Array<SemanticDatumIdentity & { from: string; to: string; label: string }>;
      coefficientDisplay: "omitted";
      causalClaim: false;
    }
  | {
      kind: "evidence_coverage";
      dimensions: SchematicDatum[];
      intersection: SchematicDatum;
      rankingAllowed: false;
    }
  | {
      kind: "applicability_boundary";
      groups: Array<SchematicDatum & { use: string }>;
      rankingAllowed: false;
    };

function normalizedStatisticType(result: StandardizedNumericalResult): RoutedStatisticType | null {
  const statisticType = result.statisticType.trim().toLocaleLowerCase();
  const unit = result.unit.trim().toLocaleLowerCase();
  if (statisticType === "odds_ratio" || unit === "or") return "odds_ratio";
  if (statisticType === "correlation_coefficient" || unit === "r") {
    return "correlation_coefficient";
  }
  if (
    statisticType === "prevalence" ||
    statisticType === "proportion" ||
    statisticType === "sleep_prevalence" ||
    (unit === "%" && result.metric.trim().toLocaleLowerCase() === "poor_sleep_prevalence")
  ) {
    return "proportion";
  }
  return null;
}

/**
 * Routes one standardized result to a statistically honest visual family.
 * Invalid or incomplete statistics are rejected instead of being coerced into
 * a generic bar chart.
 */
export function routeVisualStatistic(
  result: StandardizedNumericalResult,
): VisualSemanticRouteResult {
  const statisticType = normalizedStatisticType(result);
  if (!statisticType) {
    return { ok: false, reason: `unsupported_statistic_type:${result.statisticType || "unknown"}` };
  }

  if (statisticType === "proportion") {
    if (result.unit !== "%" || result.value == null || result.value < 0 || result.value > 100) {
      return { ok: false, reason: `invalid_proportion:${result.resultId}` };
    }
    return {
      ok: true,
      route: {
        statisticType,
        visualType: "proportion_facets",
        comparisonMode: "independent_facets",
        rankingAllowed: false,
        poolingAllowed: false,
        referenceValue: null,
        caveat: "比例須保留各研究的樣本與判定定義，跨研究只作分別理解。",
      },
    };
  }

  if (statisticType === "odds_ratio") {
    const { value, lowerBound, upperBound } = result;
    if (
      result.unit.toLocaleUpperCase() !== "OR" ||
      value == null || lowerBound == null || upperBound == null ||
      value <= 0 || lowerBound <= 0 || upperBound <= 0 ||
      lowerBound > value || value > upperBound
    ) {
      return { ok: false, reason: `invalid_odds_ratio_interval:${result.resultId}` };
    }
    return {
      ok: true,
      route: {
        statisticType,
        visualType: "forest_plot",
        comparisonMode: "interval_display",
        rankingAllowed: false,
        poolingAllowed: false,
        referenceValue: 1,
        caveat: "OR 以 1 為基準線並顯示信賴區間；不得換算成風險百分比。",
      },
    };
  }

  if (
    result.unit !== "r" ||
    result.value == null ||
    result.value < -1 ||
    result.value > 1
  ) {
    return { ok: false, reason: `invalid_correlation_coefficient:${result.resultId}` };
  }
  return {
    ok: true,
    route: {
      statisticType,
      visualType: "correlation_structure",
      comparisonMode: "association_network",
      rankingAllowed: false,
      poolingAllowed: false,
      referenceValue: null,
      caveat: "r 保留為相關係數，不轉成百分比，也不由量尺正負自行推論好壞。",
    },
  };
}

/**
 * Validates a requested group-level encoding. Cross-study ranking and pooling
 * are always fail-closed because neither operation is justified by merely
 * sharing a unit or statistic label.
 */
export function routeVisualStatisticGroup(
  input: RouteVisualStatisticGroupInput,
): VisualSemanticRouteResult {
  if (input.results.length === 0) return { ok: false, reason: "empty_statistic_group" };
  if (input.comparisonMode === "pooled" || input.comparisonMode === "ranked") {
    return { ok: false, reason: `forbidden_${input.comparisonMode}_comparison` };
  }

  const routed = input.results.map(routeVisualStatistic);
  const failure = routed.find((result): result is Extract<VisualSemanticRouteResult, { ok: false }> => !result.ok);
  if (failure) return failure;
  const routes = routed.map((result) => (result as Extract<VisualSemanticRouteResult, { ok: true }>).route);
  const first = routes[0]!;
  if (routes.some((route) => route.visualType !== first.visualType)) {
    return { ok: false, reason: "mixed_statistic_types" };
  }
  if (first.visualType !== input.requestedVisualType) {
    return {
      ok: false,
      reason: `visual_type_mismatch:${first.visualType}:${input.requestedVisualType}`,
    };
  }
  if (first.comparisonMode !== input.comparisonMode) {
    return {
      ok: false,
      reason: `comparison_mode_mismatch:${first.comparisonMode}:${input.comparisonMode}`,
    };
  }
  return { ok: true, route: first };
}

export function semanticDatumKeys(data: EvidenceVisualSemanticData): string[] {
  switch (data.kind) {
    case "proportion_facets":
      return data.panels.map((panel) => panel.datumKey);
    case "forest_plot":
      return data.rows.map((row) => row.datumKey);
    case "correlation_structure":
      return data.links.map((link) => link.datumKey);
    case "mediation_path":
      return data.edges.map((edge) => edge.datumKey);
    case "evidence_coverage":
      return [...data.dimensions.map((dimension) => dimension.datumKey), data.intersection.datumKey];
    case "applicability_boundary":
      return data.groups.map((group) => group.datumKey);
  }
}

export function semanticVisualTypeMatchesStatistic(
  visualType: string,
  data: EvidenceVisualSemanticData,
): boolean {
  const expected = new Map<string, EvidenceVisualSemanticData["kind"]>([
    ["sleep_evidence_coverage", "evidence_coverage"],
    ["prevalence_facets", "proportion_facets"],
    ["odds_ratio_forest", "forest_plot"],
    ["correlation_structure", "correlation_structure"],
    ["statistical_mediation_path", "mediation_path"],
    ["population_applicability_boundary", "applicability_boundary"],
  ]);
  const expectedKind = expected.get(visualType);
  return expectedKind == null || expectedKind === data.kind;
}

export function auditVisualSemanticData(data: EvidenceVisualSemanticData): string[] {
  const issues: string[] = [];
  const keys = semanticDatumKeys(data);
  if (keys.some((key) => !key)) issues.push("semantic_datum_key_missing");
  if (new Set(keys).size !== keys.length) issues.push("semantic_datum_key_duplicate");

  if (data.kind === "proportion_facets") {
    if (
      data.scaleMinimum !== 0 || data.scaleMaximum !== 100 ||
      data.panelMode !== "independent" || data.directComparisonAllowed ||
      data.rankingAllowed || data.poolingAllowed
    ) {
      issues.push("proportion_facets_false_comparison");
    }
    if (data.panels.some((panel) =>
      panel.unit !== "%" || panel.value < 0 || panel.value > 100 || panel.directComparisonAllowed
    )) {
      issues.push("proportion_facets_invalid_value");
    }
  } else if (data.kind === "forest_plot") {
    if (data.referenceValue !== 1 || data.rankingAllowed || data.poolingAllowed) {
      issues.push("forest_plot_invalid_semantics");
    }
    if (data.rows.some((row) =>
      row.unit !== "OR" || row.lowerBound <= 0 || row.upperBound <= 0 ||
      row.lowerBound > row.estimate || row.estimate > row.upperBound
    )) {
      issues.push("forest_plot_invalid_interval");
    }
  } else if (data.kind === "correlation_structure") {
    if (data.percentConversionAllowed || data.causalClaim) {
      issues.push("correlation_structure_overclaim");
    }
    if (data.links.some((link) => link.unit !== "r" || link.value < -1 || link.value > 1)) {
      issues.push("correlation_structure_invalid_value");
    }
  } else if (data.kind === "mediation_path") {
    if (data.coefficientDisplay !== "omitted" || data.causalClaim) {
      issues.push("mediation_path_overclaim");
    }
  } else if (data.kind === "evidence_coverage") {
    if (data.rankingAllowed || [...data.dimensions, data.intersection].some((item) => (item.count ?? 0) < 0)) {
      issues.push("evidence_coverage_invalid_count");
    }
  } else if (data.rankingAllowed || data.groups.some((group) => (group.count ?? 0) < 0)) {
    issues.push("applicability_boundary_invalid_count");
  }

  return issues;
}
