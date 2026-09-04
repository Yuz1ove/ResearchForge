import type {
  QualityFailureKind,
  QualityGateStructuralIssue,
  QualityRetryStage,
  ReportQualityDimension,
} from "./reportQualityGate.ts";

export const REPORT_METHODOLOGY_CRITERIA = [
  "research_question",
  "audience_and_purpose",
  "design_or_synthesis_method",
  "construct_operationalization",
  "sampling_or_source_selection",
  "evidence_traceability",
  "question_led_synthesis",
  "statistical_uncertainty",
  "ethics_and_governance",
  "reproducibility",
] as const;

export type ReportMethodologyCriterion = (typeof REPORT_METHODOLOGY_CRITERIA)[number];
export type MethodologyCriterionStatus =
  | "pass"
  | "warning"
  | "fail"
  | "not_applicable"
  | "not_assessed";

export type MethodologyCriterionSignal = boolean | null | undefined;

export interface ReportMethodologyRubricInput {
  researchQuestionDefined: MethodologyCriterionSignal;
  audienceAndPurposeDefined: MethodologyCriterionSignal;
  designOrSynthesisMethodDefined: MethodologyCriterionSignal;
  constructsOperationalized: MethodologyCriterionSignal;
  samplingOrSourceSelectionExplained: MethodologyCriterionSignal;
  evidenceTraceabilityComplete: MethodologyCriterionSignal;
  synthesisLedByResearchQuestion: MethodologyCriterionSignal;
  statisticalUncertaintyHandled: MethodologyCriterionSignal;
  ethicsAndGovernanceReviewed: MethodologyCriterionSignal;
  reproducibilityMetadataPresent: MethodologyCriterionSignal;
}

export interface ReportMethodologyCriterionResult {
  criterion: ReportMethodologyCriterion;
  status: MethodologyCriterionStatus;
  score: number | null;
  reason: string;
  blocksExport: boolean;
  dimension: ReportQualityDimension;
  retryStage: QualityRetryStage;
}

export interface ReportMethodologyRubricResult {
  schemaVersion: "report-methodology-rubric/v1";
  score: number;
  passed: boolean;
  blockExport: boolean;
  criteria: Record<ReportMethodologyCriterion, ReportMethodologyCriterionResult>;
  structuralIssues: QualityGateStructuralIssue[];
}

interface CriterionDefinition {
  inputKey: keyof ReportMethodologyRubricInput;
  dimension: ReportQualityDimension;
  failureKind: QualityFailureKind;
  retryStage: QualityRetryStage;
  blocking: boolean;
  passReason: string;
  missingReason: string;
}

const DEFINITIONS: Record<ReportMethodologyCriterion, CriterionDefinition> = {
  research_question: {
    inputKey: "researchQuestionDefined",
    dimension: "coherence",
    failureKind: "coherence",
    retryStage: "narrative_planning",
    blocking: true,
    passReason: "研究問題已明確界定。",
    missingReason: "缺少可回答、可約束範圍的研究問題。",
  },
  audience_and_purpose: {
    inputKey: "audienceAndPurposeDefined",
    dimension: "audience_fit",
    failureKind: "audience",
    retryStage: "audience_report_routing",
    blocking: false,
    passReason: "報告目的與目標讀者已定義。",
    missingReason: "未定義報告目的或目標讀者。",
  },
  design_or_synthesis_method: {
    inputKey: "designOrSynthesisMethodDefined",
    dimension: "document_quality",
    failureKind: "document",
    retryStage: "canonical_report_model",
    blocking: true,
    passReason: "研究設計或證據綜合方法已說明。",
    missingReason: "缺少研究設計或證據綜合方法。",
  },
  construct_operationalization: {
    inputKey: "constructsOperationalized",
    dimension: "statistical_correctness",
    failureKind: "number",
    retryStage: "evidence_extraction",
    blocking: true,
    passReason: "核心概念、暴露與結果已操作化。",
    missingReason: "需要操作化的核心變項或構念仍未定義。",
  },
  sampling_or_source_selection: {
    inputKey: "samplingOrSourceSelectionExplained",
    dimension: "evidence_integrity",
    failureKind: "evidence",
    retryStage: "evidence_extraction",
    blocking: false,
    passReason: "樣本或來源納入方式已說明。",
    missingReason: "樣本或來源選擇規則未充分說明。",
  },
  evidence_traceability: {
    inputKey: "evidenceTraceabilityComplete",
    dimension: "evidence_integrity",
    failureKind: "evidence",
    retryStage: "evidence_extraction",
    blocking: true,
    passReason: "主要事實均保留來源、定位與原文範圍。",
    missingReason: "至少一項主要事實無法追溯到精確證據。",
  },
  question_led_synthesis: {
    inputKey: "synthesisLedByResearchQuestion",
    dimension: "synthesis",
    failureKind: "stitching",
    retryStage: "narrative_planning",
    blocking: true,
    passReason: "內容依研究問題與主題綜合，而非逐篇拼接。",
    missingReason: "綜合仍受來源順序或逐篇摘要主導。",
  },
  statistical_uncertainty: {
    inputKey: "statisticalUncertaintyHandled",
    dimension: "statistical_correctness",
    failureKind: "number",
    retryStage: "evidence_extraction",
    blocking: true,
    passReason: "數值解讀、不確定性與限制均已校準。",
    missingReason: "統計解讀或不確定性邊界不完整。",
  },
  ethics_and_governance: {
    inputKey: "ethicsAndGovernanceReviewed",
    dimension: "document_quality",
    failureKind: "document",
    retryStage: "canonical_report_model",
    blocking: false,
    passReason: "倫理、授權或治理需求已檢視。",
    missingReason: "尚未完成倫理、授權或治理檢視。",
  },
  reproducibility: {
    inputKey: "reproducibilityMetadataPresent",
    dimension: "document_quality",
    failureKind: "document",
    retryStage: "canonical_report_model",
    blocking: false,
    passReason: "工作流、主題與證據版本資訊足以支援重播。",
    missingReason: "缺少重播所需的工作流或版本資訊。",
  },
};

function criterionResult(
  criterion: ReportMethodologyCriterion,
  signal: MethodologyCriterionSignal,
): ReportMethodologyCriterionResult {
  const definition = DEFINITIONS[criterion];
  const common = {
    criterion,
    dimension: definition.dimension,
    retryStage: definition.retryStage,
  };
  if (signal === null) {
    return {
      ...common,
      status: "not_applicable",
      score: null,
      reason: "此報告類型不適用。",
      blocksExport: false,
    };
  }
  if (signal === undefined) {
    return {
      ...common,
      status: "not_assessed",
      score: null,
      reason: `尚未評估：${definition.missingReason}`,
      blocksExport: false,
    };
  }
  if (signal) {
    return {
      ...common,
      status: "pass",
      score: 100,
      reason: definition.passReason,
      blocksExport: false,
    };
  }
  return {
    ...common,
    status: definition.blocking ? "fail" : "warning",
    score: definition.blocking ? 0 : 60,
    reason: definition.missingReason,
    blocksExport: definition.blocking,
  };
}

export function evaluateReportMethodologyRubric(
  input: ReportMethodologyRubricInput,
): ReportMethodologyRubricResult {
  const criteria = Object.fromEntries(REPORT_METHODOLOGY_CRITERIA.map((criterion) => [
    criterion,
    criterionResult(criterion, input[DEFINITIONS[criterion].inputKey]),
  ])) as Record<ReportMethodologyCriterion, ReportMethodologyCriterionResult>;
  const scored = Object.values(criteria).flatMap((result) =>
    result.score === null ? [] : [result.score]
  );
  const structuralIssues = REPORT_METHODOLOGY_CRITERIA.flatMap((criterion) => {
    const result = criteria[criterion];
    const definition = DEFINITIONS[criterion];
    return result.status === "fail"
      ? [{
          kind: definition.failureKind,
          dimension: definition.dimension,
          location: `methodology:${criterion}`,
          reason: result.reason,
          blocksExport: true,
          penalty: 35,
        } satisfies QualityGateStructuralIssue]
      : [];
  });
  const blockExport = structuralIssues.length > 0;
  return {
    schemaVersion: "report-methodology-rubric/v1",
    score: scored.length === 0
      ? 0
      : Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length),
    passed: !blockExport,
    blockExport,
    criteria,
    structuralIssues,
  };
}
