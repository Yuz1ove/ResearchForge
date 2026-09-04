import { evidenceRecoverySemanticSimilarity } from "./evidenceRecoveryService";

export const EVIDENCE_GAP_ROLES = [
  "direct_primary",
  "quantitative_estimate",
  "uncertainty",
  "longitudinal",
  "temporal_order",
  "experimental",
  "quasi_experimental",
  "mechanism",
  "contradictory",
  "null",
  "confounding",
  "bias",
  "measurement",
  "generalizability",
] as const;

export type EvidenceGapRole = (typeof EVIDENCE_GAP_ROLES)[number];
export type EvidenceGapSection =
  | "introduction"
  | "literature_review"
  | "methodology"
  | "findings"
  | "discussion"
  | "limitations"
  | "conclusion";

export type DiscussionRole =
  | "mechanism"
  | "temporal_order"
  | "causal_support"
  | "contradictory_result"
  | "null_result"
  | "confounder_attenuation"
  | "bias_boundary"
  | "measurement_boundary"
  | "generalizability_boundary"
  | null;

export interface AugmentationInventoryClaim {
  claimId: string;
  sourceId: string;
  proposition: string;
  supportSpan?: string;
  claimType?: string | null;
  usableSections?: string[];
  population?: string | null;
  sourceType?: string | null;
  studyDesign?: string | null;
  followUp?: string | null;
  adjusted?: boolean | null;
  discussionRole?: DiscussionRole;
}

export interface EvidenceGap {
  gapId: string;
  section: EvidenceGapSection;
  role: EvidenceGapRole;
  currentClaimCount: number;
  currentSourceCount: number;
  severity: "critical" | "high" | "medium" | "low";
  neededForLongReport: boolean;
  targetPopulation?: string;
  targetExposure?: string;
  targetOutcome?: string;
  targetMethod?: string;
  searchIntent: string[];
  satisfied: boolean;
}

export interface EvidenceGapTarget {
  gapId: string;
  section: EvidenceGapSection;
  role: EvidenceGapRole;
  minimumClaims: number;
  minimumSources: number;
  severityWhenMissing: EvidenceGap["severity"];
  neededForLongReport: boolean;
  targetPopulation?: string;
  targetExposure?: string;
  targetOutcome?: string;
  targetMethod?: string;
  searchIntent: string[];
  /** Deterministic inventory predicate; intentionally omitted from the emitted matrix. */
  claimFilter?: (claim: AugmentationInventoryClaim) => boolean;
}

const patterns: Record<EvidenceGapRole, RegExp> = {
  direct_primary: /(?:adolescen|teen|secondary school|high school|青少年|高中|國中).*(?:survey|cohort|trial|experiment|participants|students|問卷|研究|樣本)|(?:survey|cohort|trial|experiment|participants|students|問卷|研究|樣本).*(?:adolescen|teen|secondary school|high school|青少年|高中|國中)/iu,
  quantitative_estimate: /(?:\d+(?:\.\d+)?\s*(?:%|hours?|minutes?|points?|名|人|小時|分鐘|分)|[βr]=?\s*[−-]?\d|odds ratio|hazard ratio|effect size)/iu,
  uncertainty: /(?:95\s*%\s*CI|confidence interval|\bCI\b|±|standard (?:deviation|error)|\bSD\s*=|\bSE\s*=|信賴區間|標準差|標準誤)/iu,
  longitudinal: /(?:longitudinal|prospective|cohort|follow[- ]?up|wave\s*\d|cross[- ]lagged|縱貫|縱向|前瞻|追蹤|波次)/iu,
  temporal_order: /(?:predicted|prospectively|one year later|subsequent|wave\s*1.*wave\s*2|time\s*1.*time\s*2|cross[- ]lagged|預測.*之後|後續|一年後|時間順序)/iu,
  experimental: /(?:randomi[sz]ed|randomly assigned|controlled crossover|experimental group|control group|trial|隨機分派|實驗組|對照組|試驗)/iu,
  quasi_experimental: /(?:quasi[- ]experimental|natural experiment|difference[- ]in[- ]differences|fixed effects|準實驗|自然實驗|固定效果)/iu,
  mechanism: /(?:mediat|indirect effect|pathway|arousal|displacement|self-control|social anxiety|機制|中介|間接效果|喚醒|取代|自我控制|社交焦慮)/iu,
  contradictory: /(?:inconclusive|mixed|contradict|conversely|whereas|different associations|較不確定|矛盾|相反|不同關聯)/iu,
  null: /(?:not significant|non[- ]significant|no (?:direct |cross[- ]lagged |predictive )?(?:effect|association)|\bn\.s\.|未達顯著|不顯著|無顯著|沒有.*關聯)/iu,
  confounding: /(?:adjusted|controlling for|controlled for|covariate|confound|attenuat|控制.*共變|調整後|混淆|衰減)/iu,
  bias: /(?:bias|attrition|dropout|missing data|self-selection|selection effect|偏誤|流失|遺失資料|自我選擇)/iu,
  measurement: /(?:self-report|questionnaire|scale|actigraph|polysomnograph|PSQI|instrument|measurement|自陳|問卷|量表|腕動計|多導睡眠|測量)/iu,
  generalizability: /(?:generaliz|external validity|single (?:school|country|site)|college students|convenience sample|not adolescents|外部效度|一般化|大學生|便利抽樣|單一.*學校)/iu,
};

function claimHaystack(claim: AugmentationInventoryClaim): string {
  return [
    claim.proposition,
    claim.supportSpan,
    claim.population,
    claim.sourceType,
    claim.studyDesign,
    claim.followUp,
    claim.adjusted ? "adjusted" : "",
    claim.discussionRole,
  ].filter(Boolean).join(" ");
}

export function claimEvidenceRoles(claim: AugmentationInventoryClaim): EvidenceGapRole[] {
  const text = claimHaystack(claim);
  return EVIDENCE_GAP_ROLES.filter((role) => patterns[role].test(text));
}

export function buildEvidenceGapMatrix(
  claims: readonly AugmentationInventoryClaim[],
  targets: readonly EvidenceGapTarget[],
): EvidenceGap[] {
  return targets.map((target) => {
    const matching = claims.filter((claim) =>
      claimEvidenceRoles(claim).includes(target.role) &&
      (target.claimFilter?.(claim) ?? true));
    const sourceCount = new Set(matching.map((claim) => claim.sourceId)).size;
    const satisfied = matching.length >= target.minimumClaims && sourceCount >= target.minimumSources;
    return {
      gapId: target.gapId,
      section: target.section,
      role: target.role,
      currentClaimCount: matching.length,
      currentSourceCount: sourceCount,
      severity: satisfied ? "low" : target.severityWhenMissing,
      neededForLongReport: target.neededForLongReport,
      targetPopulation: target.targetPopulation,
      targetExposure: target.targetExposure,
      targetOutcome: target.targetOutcome,
      targetMethod: target.targetMethod,
      searchIntent: [...target.searchIntent],
      satisfied,
    };
  });
}

export interface SemanticDedupeClaim {
  claimId: string;
  proposition: string;
  sourceId: string;
  population?: string | null;
  studyDesign?: string | null;
  followUp?: string | null;
  adjusted?: boolean | null;
  discussionRole?: DiscussionRole;
  significance?: "significant" | "null" | "not_reported";
}

function distinctMethodologicalFacet(left: SemanticDedupeClaim, right: SemanticDedupeClaim): boolean {
  return ["population", "studyDesign", "followUp", "adjusted", "discussionRole", "significance"].some((field) => {
    const a = left[field as keyof SemanticDedupeClaim];
    const b = right[field as keyof SemanticDedupeClaim];
    return a !== undefined && a !== null && b !== undefined && b !== null && a !== b;
  });
}

export function areSemanticEvidenceDuplicates(
  left: SemanticDedupeClaim,
  right: SemanticDedupeClaim,
  threshold = 0.84,
): boolean {
  if (distinctMethodologicalFacet(left, right)) return false;
  return evidenceRecoverySemanticSimilarity(left.proposition, right.proposition) >= threshold;
}

export interface SourceInternalConflict {
  sourceId: string;
  field: "sample_size" | "exposure_duration";
  values: Array<{ value: number; unit?: string; location: string; span?: string }>;
  resolution: "resolved" | "unresolved";
  authoritativeValue?: number;
  authoritativeLocation?: string;
}

function isAuthoritativeLocation(location: string): boolean {
  return /(?:methods?|participants?|procedure|results?|table)/iu.test(location);
}

export function resolveSourceInternalConflict(
  sourceId: string,
  field: SourceInternalConflict["field"],
  values: SourceInternalConflict["values"],
): SourceInternalConflict {
  const authoritative = values.filter((item) => isAuthoritativeLocation(item.location));
  const unique = [...new Set(authoritative.map((item) => `${item.value}:${item.unit ?? ""}`))];
  if (authoritative.length > 0 && unique.length === 1) {
    return {
      sourceId,
      field,
      values,
      resolution: "resolved",
      authoritativeValue: authoritative[0]?.value,
      authoritativeLocation: authoritative.map((item) => item.location).join("; "),
    };
  }
  return { sourceId, field, values, resolution: "unresolved" };
}

export interface EvidenceDiversityResult {
  passed: boolean;
  coverage: Record<
    "direct_adolescent" | "quantitative" | "temporal_longitudinal" | "mechanism" | "conflicting_or_null" | "confounding_bias" | "generalizability",
    { claimCount: number; sourceCount: number; adequate: boolean }
  >;
  missing: string[];
}

export function evaluateEvidenceDiversity(claims: readonly AugmentationInventoryClaim[]): EvidenceDiversityResult {
  const requirements = {
    direct_adolescent: ["direct_primary"] as EvidenceGapRole[],
    quantitative: ["quantitative_estimate"] as EvidenceGapRole[],
    temporal_longitudinal: ["longitudinal", "temporal_order"] as EvidenceGapRole[],
    mechanism: ["mechanism"] as EvidenceGapRole[],
    conflicting_or_null: ["contradictory", "null"] as EvidenceGapRole[],
    confounding_bias: ["confounding", "bias"] as EvidenceGapRole[],
    generalizability: ["generalizability"] as EvidenceGapRole[],
  };
  const coverage = Object.fromEntries(Object.entries(requirements).map(([key, roles]) => {
    const matched = claims.filter((claim) => roles.some((role) => claimEvidenceRoles(claim).includes(role)));
    const sourceCount = new Set(matched.map((claim) => claim.sourceId)).size;
    return [key, { claimCount: matched.length, sourceCount, adequate: matched.length > 0 && sourceCount > 0 }];
  })) as EvidenceDiversityResult["coverage"];
  const missing = Object.entries(coverage).filter(([, value]) => !value.adequate).map(([key]) => key);
  return { passed: missing.length === 0, coverage, missing };
}
