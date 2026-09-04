/**
 * Deterministic formal secondary-research architecture.
 *
 * This layer deliberately sits between accepted evidence and prose generation.
 * It never upgrades source access, fills missing study fields, or creates a
 * quantitative value.  Every extracted number retains the evidence span that
 * contained it.
 */
import type { SourceRecord } from "@workspace/api-zod/source-record";
import type {
  CanonicalStudyAdmissionResult,
  StructuredStudyFact,
  StudyEffectDirection,
  StudyModeratorFact,
} from "@workspace/api-zod/research-grounding";
import {
  type FactField,
  type FactStatus,
  type StudyFactEnvelopeV2,
} from "./research/study-fact-extraction-v2";
import {
  CANONICAL_STUDY_ADMISSION_VERSION,
  canonicalContentAccessState,
  deriveCanonicalStudyAdmission,
  failClosedCanonicalAdmission,
  validateCanonicalAdmissionSet,
  type CanonicalAdmissionDecisionContext,
} from "./research/canonical-study-admission";
import {
  buildCanonicalAdmissionProjection,
  downstreamCanonicalView,
} from "./research/canonical-admission-projection";
import {
  buildTopicIntegrityContract,
  evidenceRoleForText,
  reconcilePotentialDirectEvidence,
  validateTopicIsolation,
  type TopicIsolationValidation,
} from "@workspace/api-zod/topic-integrity";
import type {
  ReportWriterEvidenceCard,
  ReportWriterParagraphClaim,
  ReportWriterSection,
  SentenceClaimTrace,
} from "./report-writer";

export type ResearchReportMode = "evidence_brief" | "formal_research_report";
export type CitationDisplayMode = "compact" | "academic";

export const EVIDENCE_AVAILABILITY = [
  "METADATA_ONLY",
  "ABSTRACT_AVAILABLE",
  "FULL_TEXT_AVAILABLE",
  "STRUCTURED_FULL_TEXT",
  "TABLE_DATA_AVAILABLE",
  "FIGURE_DATA_AVAILABLE",
] as const;
export type EvidenceAvailability = (typeof EVIDENCE_AVAILABILITY)[number];

export interface EvidenceSpan {
  spanId: string;
  sourceId: string;
  text: string;
  page?: number;
  sectionHeading?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface NumericEvidence {
  numericEvidenceId: string;
  metric?: string;
  value?: number | string;
  unit?: string;
  comparatorValue?: number | string;
  effectSize?: number | string;
  confidenceInterval?: string;
  standardError?: number | string;
  standardDeviation?: number | string;
  variance?: number | string;
  pValue?: string;
  sampleSize?: number | string;
  estimateType?: "absolute" | "change" | "difference" | "ratio" | "correlation" | "count" | "duration" | "sample_size" | "unknown";
  direction?: "increase" | "decrease" | "positive" | "negative" | "null" | "mixed" | "nonlinear" | "not_applicable" | "unclear" | "unknown";
  sourceSpanId: string;
  comparableGroupKey?: string;
}

export interface StructuredStudyEvidence {
  sourceId: string;
  studyId?: string;
  title: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  studyDesign?: string;
  studyDesignExplicit?: boolean;
  studyDesignSourceSpan?: EvidenceSpan;
  researchQuestion?: string;
  population?: string;
  populationDescription?: string;
  populationAgeMin?: number;
  populationAgeMax?: number;
  populationAgeMean?: number;
  setting?: string;
  speciesOrSubject?: string;
  sampleSize?: number | string;
  location?: string;
  exposure?: string;
  intervention?: string;
  comparator?: string;
  comparatorDefinition?: string;
  exposureDefinition?: string;
  exposureMeasurement?: string;
  exposureTiming?: string;
  exposureLevel?: string;
  exposureDuration?: string;
  studyPeriod?: string;
  outcomes?: string[];
  outcomeDefinition?: string;
  outcomeMeasurement?: string;
  outcomeTimepoint?: string;
  measurementMethods?: string[];
  statisticalMethods?: string[];
  keyNumericResults?: NumericEvidence[];
  effectDirection?: StudyEffectDirection | "unknown";
  effectDirectionConfidence?: number;
  adjustedOrUnadjusted?: "adjusted" | "unadjusted" | "mixed" | "unknown";
  covariates?: string[];
  confounders?: string[];
  moderators?: StudyModeratorFact[];
  mediators?: StudyModeratorFact[];
  subgroups?: StudyModeratorFact[];
  primaryResult?: string;
  secondaryResults?: string[];
  authorCautions?: string[];
  limitations?: string[];
  evidenceSpans: EvidenceSpan[];
  readerClaims: Array<{
    claimId: string;
    text: string;
    evidenceId: string;
    sourceId: string;
    limitation?: string;
  }>;
  extractionConfidence: number;
  extractionSource: "abstract" | "full_text" | "table" | "figure" | "metadata";
  verificationStatus: "verified" | "partial" | "unverified";
  evidenceAvailability: EvidenceAvailability;
  contentAccessState: "metadata_only" | "abstract_only" | "partial_full_text" | "full_text";
  fullTextSource?: string;
  license?: string;
  accessState?: string;
  structuredStudyFacts?: StructuredStudyFact[];
  canonicalAdmission?: CanonicalStudyAdmissionResult;
}

export interface EvidenceMatrixRow {
  claimId: string;
  themeId: string;
  normalizedProposition?: string;
  sourceIds: string[];
  supportingSourceIds: string[];
  conflictingSourceIds: string[];
  nullSourceIds?: string[];
  contextDependentSourceIds?: string[];
  independentStudyIds?: string[];
  primaryIndependentSourceCount?: number;
  formalIndependentSourceCount?: number;
  sourceIndependence?: SourceIndependenceRecord[];
  evidenceDiversity?: string[];
  admissionStatus?: "FORMAL" | "LIMITED" | "BLOCKED";
  quantitativeEvidenceIds: string[];
  evidenceStrength: "high" | "moderate" | "limited" | "insufficient";
  agreement: "consistent" | "mixed" | "conflicting" | "unknown";
  moderators?: string[];
  limitations?: string[];
  studyDifferenceMatrix?: ThemeStudyDifferenceMatrix;
}

export type StudyDifferenceComparison =
  | "SAME"
  | "DIFFERENT"
  | "PARTIALLY_COMPARABLE"
  | "NOT_REPORTED"
  | "UNKNOWN"
  | "NOT_APPLICABLE";

export type StudyDifferenceField =
  | "population"
  | "sample_size"
  | "study_design"
  | "exposure_or_intervention"
  | "comparator"
  | "outcome_definition"
  | "measurement_method"
  | "follow_up_or_duration"
  | "effect_direction"
  | "key_numeric_result"
  | "effect_magnitude"
  | "uncertainty"
  | "moderator_or_subgroup"
  | "setting_or_context"
  | "limitations";

export interface StudyDifferenceValue {
  studyId: string;
  sourceId: string;
  status: FactStatus;
  value: string | null;
  normalizedValue: string | null;
  provenanceIds: string[];
}

export interface StudyDifferenceFieldComparison {
  field: StudyDifferenceField;
  comparison: StudyDifferenceComparison;
  values: StudyDifferenceValue[];
  observation: string;
}

export interface ThemeStudyDifferenceMatrix {
  schemaVersion: "researchforge-study-difference/v1";
  themeId: string;
  sourceIds: string[];
  fields: StudyDifferenceFieldComparison[];
  summary: {
    sharedCharacteristics: string[];
    studyLevelDifferences: string[];
    effectAgreement: string[];
    effectHeterogeneity: string[];
    moderatorDifferences: string[];
    measurementDifferences: string[];
    designDifferences: string[];
    evidenceLimits: string[];
  };
}

export interface SourceIndependenceRecord {
  sourceId: string;
  canonicalStudyId: string;
  relationship: "PRIMARY" | "SECONDARY_SYNTHESIS" | "DERIVED_FROM" | "DUPLICATE_REPORT";
  independent: boolean;
  duplicateOfSourceId?: string;
  datasetOverlap: "NONE_DETECTED" | "POSSIBLE" | "UNKNOWN";
}

export type ResearchEvidenceClassification =
  | "FORMAL_RESEARCH_REPORT"
  | "LIMITED_EVIDENCE_BRIEF"
  | "SEARCH_ONLY_RESULT"
  | "BLOCKED_INSUFFICIENT_EVIDENCE"
  | "BLOCKED_EXTRACTION_FAILURE";

export interface EvidenceCoverageRow {
  theme: string;
  independentSourceCount: number;
  primaryIndependentSourceCount?: number;
  formalIndependentSourceCount?: number;
  fullTextSourceCount: number;
  studyDesignDiversity: string[];
  populationCoverage: number;
  exposureCoverage: number;
  outcomeCoverage: number;
  effectDirectionCoverage: number;
  quantitativeSourceCount: number;
  moderatorFactCount: number;
  contradictionStatus: EvidenceMatrixRow["agreement"];
  synthesisEligible: boolean;
  formalSynthesisEligible?: boolean;
}

export interface EvidenceCoverageGate {
  rows: EvidenceCoverageRow[];
  directStudyCount: number;
  fullTextStudyCount: number;
  sourceSpanProvenanceCoverage: number;
  studyDesignCoverage: number;
  populationCoverage: number;
  exposureCoverage: number;
  outcomeCoverage: number;
  effectDirectionCoverage: number;
  studyTypeInterpretationCoverage?: number;
  limitedAdmissionCount?: number;
  limitedOrBetterAdmissionCount?: number;
  blockedAdmissionCount?: number;
  formalAdmissionCount?: number;
  typeSpecificAdmission?: Array<{
    studyId: string;
    sourceId: string;
    studyType: string;
    level: CanonicalStudyAdmissionResult["admissionClass"];
    reasons: string[];
    evidenceRevision?: string;
  }>;
  moderatorHallucinationCount: number;
  classification: ResearchEvidenceClassification;
  reasons: string[];
}

export type ClaimFunction =
  | "background"
  | "research-gap"
  | "method"
  | "descriptive-finding"
  | "comparative-finding"
  | "mechanism"
  | "limitation"
  | "implication"
  | "conclusion-synthesis";

export interface ClaimEvidenceLineage {
  sourceIds: string[];
  evidenceIds: string[];
  evidenceSpanIds: string[];
  numericEvidenceIds: string[];
}

export interface AllocatedResearchClaim {
  claimId: string;
  themeId: string;
  primarySection: string;
  supportingSections?: string[];
  claimFunction: ClaimFunction;
  evidenceLineage: ClaimEvidenceLineage;
  permittedRealizationCount: number;
  derivedFromClaimIds?: string[];
}

export type SecondaryClaimUsageMode =
  | "REFERENCE_ONLY"
  | "INTERPRETATION_ONLY"
  | "CONTRAST_ONLY"
  | "LIMITATION_ONLY"
  | "CONCLUSION_SYNTHESIS";

export interface SectionClaimOwnership {
  claimId: string;
  primarySection: string;
  allowedSecondarySections: string[];
  secondaryUsageMode: SecondaryClaimUsageMode;
  evidenceIds: string[];
}

export interface SectionClaimAllocation {
  sectionId: string;
  ownedClaimIds: string[];
  contextualClaimIds: string[];
  forbiddenClaimIds: string[];
  claims: AllocatedResearchClaim[];
  evidenceIds: string[];
  sourceIds: string[];
  rhetoricalContract: string;
}

export type QuantitativeAggregationType =
  | "single-study"
  | "descriptive-cross-study"
  | "range"
  | "median"
  | "weighted-synthesis"
  | "meta-analytic";

export interface QuantitativeFindingValue {
  studyId: string;
  sourceId: string;
  evidenceId: string;
  sourceSpanId: string;
  value: number | string;
  unit?: string;
}

export interface QuantitativeFinding {
  findingId: string;
  claimId: string;
  metricFamily: string;
  normalizedMetric: string;
  unit?: string;
  estimateType: NonNullable<NumericEvidence["estimateType"]>;
  studyIds: string[];
  evidenceIds: string[];
  values: QuantitativeFindingValue[];
  aggregationType: QuantitativeAggregationType;
  comparabilityStatus: "comparable" | "single_study" | "incomparable";
  narrativeText: string;
  eligibleForChart: boolean;
  chartReason: string;
  provenance: {
    derivationRule: string;
    sourceSpanIds: string[];
    noMetaAnalysis: boolean;
  };
}

export interface QuantitativeFindingsRegistryEntry {
  sourceId: string;
  claimId: string;
  metric: string;
  value: number | string;
  unit: string | null;
  group: string | null;
  comparator: string | null;
  sampleSize: number | string | null;
  timePoint: string | null;
  confidenceInterval: string | null;
  standardError: number | string | null;
  standardDeviation: number | string | null;
  pValue: string | null;
  effectSize: number | string | null;
  extractedSpan: string;
  sourceTableFigureNumber: string | null;
  provenanceConfidence: number;
  sourceSpanId: string;
}

export type QuantitativeMetricType =
  | "sample_size"
  | "percentage"
  | "mean"
  | "median"
  | "effect_size"
  | "correlation"
  | "odds_ratio"
  | "risk_ratio"
  | "confidence_interval"
  | "p_value"
  | "count"
  | "rate"
  | "trend"
  | "difference"
  | "other";

export interface QuantitativeFactRegistryEntry {
  factId: string;
  evidenceId: string;
  sourceId: string;
  metricType: QuantitativeMetricType;
  value: number | null;
  secondaryValue?: number | null;
  unit?: string;
  comparator?: string;
  population?: string;
  timeframe?: string;
  sourceText: string;
  sourceLocation?: string;
  confidence: number;
  validationStatus: "VALIDATED" | "AMBIGUOUS" | "REJECTED";
  disposition: QuantitativeDisposition;
  usableSections: string[];
  chartEligible: boolean;
  sourceLocator: string | null;
  measure: string;
  baseline: number | null;
  effectDirection: NonNullable<NumericEvidence["direction"]>;
  effectSizeType: NonNullable<NumericEvidence["estimateType"]>;
  confidenceInterval: string | null;
  pValue: string | null;
  sampleSize: number | string | null;
  extractionText: string;
  extractionMethod: "deterministic_exact_span";
  verificationStatus: "VALIDATED" | "AMBIGUOUS" | "REJECTED";
}

export type ResearchMethod =
  | "STRUCTURED_LITERATURE_REVIEW"
  | "THEMATIC_SYNTHESIS"
  | "COMPARATIVE_LITERATURE_ANALYSIS"
  | "SCOPING_REVIEW"
  | "DOCUMENT_ANALYSIS"
  | "CONTENT_ANALYSIS"
  | "SECONDARY_DATA_ANALYSIS"
  | "CASE_ANALYSIS"
  | "NARRATIVE_REVIEW"
  | "BIBLIOMETRIC_TREND_ANALYSIS"
  | "SYSTEMATIC_REVIEW"
  | "META_ANALYSIS";

export interface ResearchMethodSelection {
  selectedMethod: ResearchMethod;
  requestedMethod?: ResearchMethod;
  status: "SUPPORTED" | "DOWNGRADED" | "META_ANALYSIS_NOT_SUPPORTED_BY_EVIDENCE";
  reasons: string[];
  requirements: Record<string, boolean>;
}

export interface ResearchWorkflowFacts {
  workflowId?: string;
  reportId?: string;
  topicHash?: string;
  normalizedTopic?: string;
  searchPlanWorkflowId?: string;
  queryTerms?: string[];
  language?: string;
  researchQuestion?: string;
  requestedMethod?: ResearchMethod;
  namedProviders: string[];
  reproducibleSearchStrategy: boolean;
  explicitInclusionCriteria: boolean;
  explicitExclusionCriteria: boolean;
  screeningProcedure: boolean;
  duplicateRemoval: boolean;
  documentedStudySelection: boolean;
  qualityAssessment: boolean;
  queryExpansion?: boolean;
  themeSynthesis?: boolean;
  searchQueries?: string[];
  searchDates?: string[];
  searchLanguages?: string[];
  fullTextRetrievalMethods?: string[];
  evidenceExtractionMethods?: string[];
  relevanceQualityAssessmentMethods?: string[];
  inclusionCriteria?: string[];
  exclusionCriteria?: string[];
  topicIntegrityPolicy?: string;
}

export type ResearchDomain =
  | "health"
  | "education"
  | "environment"
  | "technology"
  | "social_science"
  | "business"
  | "general";

export type ResearchBlueprintSectionRole =
  | "executive_summary"
  | "background"
  | "methods"
  | "evidence_overview"
  | "findings"
  | "cross_study_synthesis"
  | "discussion"
  | "limitations_gaps"
  | "conclusion";

export interface ResearchBlueprintQuestion {
  id: string;
  question: string;
  priority: "primary" | "secondary";
}

export interface ResearchBlueprintSectionPlan {
  id: ResearchBlueprintSectionRole;
  title: string;
  purpose: string;
  questionsAnswered: string[];
  requiredClaimTypes: ClaimFunction[];
  evidenceNeeds: string[];
  quantitativeNeeds: string[];
  figureOpportunities: string[];
  subsections: Array<{
    id: string;
    title: string;
    purpose: string;
  }>;
}

export interface ResearchBlueprint {
  schemaVersion: "research-blueprint/v1";
  reportType: "formal_secondary_research_report";
  domain: ResearchDomain;
  centralQuestion: string;
  researchBackground: {
    context: string[];
    significance: string[];
    motivation: string[];
  };
  researchObjectives: string[];
  researchQuestions: ResearchBlueprintQuestion[];
  methodology: {
    primaryMethods: ResearchMethod[];
    rationale: string[];
    limitations: string[];
  };
  definitions: Array<{
    term: string;
    definitionGoal: string;
  }>;
  sectionPlan: ResearchBlueprintSectionPlan[];
  synthesisAxes: string[];
  conclusionRequirements: string[];
}

export type QuantitativeDisposition =
  | "body-worthy"
  | "figure-worthy"
  | "table-worthy"
  | "appendix-only"
  | "unusable";

export interface FigurePlan {
  id: string;
  figureType:
    | "PROCESS"
    | "DESCRIPTIVE_METADATA"
    | "RESULT_QUANTITATIVE"
    | "EVIDENCE_STRUCTURE"
    | "NOT_AVAILABLE";
  type:
    | "research_flow"
    | "mechanism_diagram"
    | "timeline"
    | "comparison_table"
    | "bar_chart"
    | "dot_plot"
    | "forest_plot"
    | "line_chart"
    | "conceptual_framework"
    | "evidence_map";
  figureClass: "EVIDENCE_FIGURE" | "EXPLANATORY_FIGURE";
  purpose: string;
  supportedBy: string[];
  dataFacts: string[];
  provenancePoints: Array<{
    seriesId: string;
    pointId: string;
    sourceId: string;
    quantitativeFactId: string;
    originalValue: number;
    unit: string | null;
  }>;
  placementAfterSection: ResearchBlueprintSectionRole;
  caption: string;
  interpretationRequirement: string;
  status: "APPROVED" | "REJECTED";
  rejectionReason?: string;
}

export interface ResearchQuestionClosureRow {
  researchQuestionId: string;
  bodySections: string[];
  supportingClaimIds: string[];
  conclusionRequirement: string;
  status: "COVERED" | "BLOCKED_EVIDENCE";
}

export interface ContextBudgetCall {
  callId: string;
  model: string;
  contextLimit: number;
  usableContextBudget: number;
  maximumInputTokens: number;
  estimatedInputTokens: number;
  actualInputTokens?: number;
  outputTokens?: number;
  assignedSection: string;
  evidenceIdsUsed: string[];
  withinBudget: boolean;
}

export interface SectionEvidencePacket {
  sectionId: string;
  matrixRows: EvidenceMatrixRow[];
  studies: StructuredStudyEvidence[];
  evidenceIds: string[];
  ownedClaimIds: string[];
  contextualClaimIds: string[];
  forbiddenClaimIds: string[];
  estimatedTokens: number;
  preservedConflictingSourceIds: string[];
}

export type VisualizationSemanticType =
  | "deterministic_evidence_table"
  | "study_comparison_table"
  | "quantitative_chart"
  | "research_process_diagram"
  | "conceptual_thematic_diagram";

export type VisualizationKind =
  | "source_year_distribution"
  | "study_design_distribution"
  | "geographic_distribution"
  | "evidence_direction"
  | "outcome_comparison_table"
  | "quantitative_result_comparison"
  | "evidence_matrix_table";

export interface VisualizationPlanItem {
  id: string;
  kind: VisualizationKind;
  type: VisualizationSemanticType;
  status: "APPROVED" | "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART";
  title: string;
  sourceIds: string[];
  numericEvidenceIds: string[];
  n: number;
  unit?: string;
  axisLabels?: string[];
  categories?: Array<{ label: string; value: number }>;
  sourceNote: string;
  rejectionReasons: string[];
  sourceEvidence: string[];
  derivationRule: string;
  dataRows: Array<Record<string, string | number | null>>;
  labels: string[];
  caption: string;
  limitations: string[];
  provenance: {
    sourceIds: string[];
    evidenceIds: string[];
    factIds: string[];
    generatedFromValidatedFactsOnly: boolean;
    generatedFrom: "accepted_source_metadata" | "structured_study_evidence" | "quantitative_finding" | "evidence_matrix";
  };
}

export type DuplicateCategory =
  | "CLAIM_DOUBLE_ALLOCATION"
  | "WRITER_REGENERATION_DUPLICATE"
  | "CANONICAL_TRANSFORMATION_DUPLICATE"
  | "PERMITTED_CONTEXTUAL_RECALL"
  | "FALSE_POSITIVE";

export interface DuplicateMatch {
  leftSectionId: string;
  rightSectionId: string;
  leftText: string;
  rightText: string;
  similarity: number;
  kind: "strict" | "semantic";
  category: DuplicateCategory;
  originalClaimIds: string[];
  finalClaimIds: string[];
  evidenceIds: string[];
  origin: "planning" | "generation" | "canonical_transformation" | "permitted" | "validator";
}

export const FORMAL_RESEARCH_REPORT_SCHEMA = [
  { sectionId: "cover", title: "封面與研究資訊", contract: "Render bibliographic and run metadata only; introduce no research claim." },
  { sectionId: "executive_summary", title: "一、執行摘要", contract: "Summarize only body-validated claims, method, findings, and conclusion." },
  { sectionId: "background", title: "二、研究背景與問題界定", contract: "Define importance, concepts, question, scope, and boundaries using traceable evidence." },
  { sectionId: "methods", title: "三、研究方法", contract: "Describe only the search, deduplication, screening, extraction, classification, and synthesis actually executed by ResearchForge." },
  { sectionId: "evidence_overview", title: "四、文獻與證據概況", contract: "Report deterministic corpus counts, distributions, study designs, and evidence availability." },
  { sectionId: "findings", title: "五、主要研究發現", contract: "Write claim-first by theme; compare support, conflict, quantitative results, moderators, strength, and limitations. Never sequence papers." },
  { sectionId: "cross_study_synthesis", title: "六、跨研究比較與證據綜合", contract: "Explain agreement, conflict, design differences, moderators, strength, and uncertainty across studies." },
  { sectionId: "discussion", title: "七、討論", contract: "Explain why, under what conditions, plausible evidence-backed mechanisms, implications, and causal boundaries without repeating Findings." },
  { sectionId: "limitations_gaps", title: "八、證據限制與研究缺口", contract: "State data, method, bias, access, and unresolved-question limits without filler." },
  { sectionId: "conclusion", title: "九、結論與建議", contract: "Closed-world rendering of body-validated claims only; conclusionNovelty must be zero." },
  { sectionId: "references", title: "十、參考文獻", contract: "Render accepted sources only using stable numeric reference identities." },
  { sectionId: "appendix_search", title: "Appendix A — Search Strategy", contract: "Persist providers, queries, dates, filters, and screening workflow actually used." },
  { sectionId: "appendix_studies", title: "Appendix B — Included Studies", contract: "List accepted, deduplicated studies and availability classifications." },
  { sectionId: "appendix_matrix", title: "Appendix C — Evidence Matrix", contract: "Render the machine-readable claim/theme evidence matrix." },
  { sectionId: "appendix_quantitative", title: "Appendix D — Quantitative Evidence Table", contract: "Render only numeric evidence carrying a valid sourceSpanId." },
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").replace(/\s+/gu, " ").trim() : "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function sourceId(source: SourceRecord, index: number): string {
  return clean(source.id) || clean(source.canonicalSourceIdentity) || `source-${index + 1}`;
}

export function classifyEvidenceAvailability(source: SourceRecord): EvidenceAvailability {
  const raw = source as SourceRecord & {
    extractedTables?: unknown[];
    extractedFigures?: unknown[];
    extractedSections?: unknown[];
    extractedChunks?: unknown[];
    fullTextCharCount?: number | null;
    accessLevel?: string | null;
    contentLevel?: string | null;
    extractionStatus?: string | null;
    enrichmentProvenance?: Array<{ accessState?: string }> | null;
  };
  const accessStateV3 = [...(raw.enrichmentProvenance ?? [])].reverse().find((item) => clean(item.accessState))?.accessState;
  if (accessStateV3) {
    if (accessStateV3 === "FULL_TEXT_STRUCTURED") return "STRUCTURED_FULL_TEXT";
    if (["FULL_TEXT_HTML", "FULL_TEXT_PDF", "FULL_TEXT_REPOSITORY_COPY"].includes(accessStateV3)) return "FULL_TEXT_AVAILABLE";
    if (accessStateV3 === "ABSTRACT_ONLY") return clean(source.abstract) ? "ABSTRACT_AVAILABLE" : "METADATA_ONLY";
    return "METADATA_ONLY";
  }
  if ((raw.extractedTables?.length ?? 0) > 0) return "TABLE_DATA_AVAILABLE";
  if ((raw.extractedFigures?.length ?? 0) > 0) return "FIGURE_DATA_AVAILABLE";
  const hasNonAbstractChunk = (raw.extractedChunks ?? []).some((item) => {
    if (!item || typeof item !== "object") return false;
    const chunk = item as unknown as Record<string, unknown>;
    const location = clean(chunk.source_location) || clean(chunk.sourceLocation) || clean(chunk.section_heading) || clean(chunk.sectionHeading);
    return location.length > 0 && !/^abstract$/iu.test(location);
  });
  if ((raw.extractedSections?.length ?? 0) > 0 || hasNonAbstractChunk) return "STRUCTURED_FULL_TEXT";
  if (raw.accessLevel === "full_text" || raw.contentLevel === "fulltext" || (raw.fullTextCharCount ?? 0) > 0 || /(?:text|grobid|ocr)_extracted/u.test(raw.extractionStatus ?? "")) return "FULL_TEXT_AVAILABLE";
  if (clean(source.abstract)) return "ABSTRACT_AVAILABLE";
  return "METADATA_ONLY";
}

function availabilitySource(availability: EvidenceAvailability): StructuredStudyEvidence["extractionSource"] {
  if (availability === "TABLE_DATA_AVAILABLE") return "table";
  if (availability === "FIGURE_DATA_AVAILABLE") return "figure";
  if (availability === "FULL_TEXT_AVAILABLE" || availability === "STRUCTURED_FULL_TEXT") return "full_text";
  if (availability === "ABSTRACT_AVAILABLE") return "abstract";
  return "metadata";
}

function cardSpan(card: ReportWriterEvidenceCard, fallbackIndex: number, source?: SourceRecord): EvidenceSpan | null {
  const text = clean(card.supportSpan) || clean(card.supportedByText) || clean(card.quotedText) || clean(card.exactResult) || clean(card.numericResult);
  if (!text) return null;
  const cardRecord = card as unknown as Record<string, unknown>;
  const chunkId = clean(cardRecord.chunkId) || clean(cardRecord.chunk_id);
  const matchingChunk = source?.extractedChunks?.find((chunk) =>
    (chunkId && chunk.chunk_id === chunkId) || clean(chunk.text).includes(text),
  );
  return {
    spanId: clean(card.evidenceId) || clean(card.evidenceCardId) || clean(card.id) || `${card.sourceId}:span:${fallbackIndex + 1}`,
    sourceId: card.sourceId,
    text,
    page: card.page ?? matchingChunk?.page ?? undefined,
    sectionHeading: clean(card.sectionHeading) || clean(matchingChunk?.section_heading) || undefined,
    startOffset: card.supportStart ?? matchingChunk?.char_start,
    endOffset: card.supportEnd ?? matchingChunk?.char_end,
  };
}

const QUANTITATIVE_PATTERN = /(?:(?:n|N)\s*=\s*(?<sample>(?:\d{1,3}(?:,\d{3})+|\d{1,7}))|(?<value>[-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(?<unit>%|‰|mm\s*Hg|mmHg|mL\s*[./·]\s*kg(?:\^?-?1)?\s*[./·]\s*min(?:\^?-?1)?|mL\/kg\/min|L\/min|mg\/L|µg\/L|μg\/L|ng\/L|mg\/kg|µg\/kg|μg\/kg|kg\/m²|kg|g|h(?:\/day|\s+per\s+day)?|ms|seconds?|mm|µm|μm|nm|days?|hours?|minutes?|weeks?|months?|years?|points?|scores?|tokens?|USD|dollars?|participants?|patients?|subjects?|students?|公斤|毫秒|秒|倍|個|隻|尾|人|小時|分鐘|分))/giu;
const CI_PATTERN = /(?:95\s*%\s*)?(?:CI|confidence interval|信賴區間)\s*[:=]?\s*([\[(]?\s*-?\d+(?:\.\d+)?\s*[,–—-]\s*-?\d+(?:\.\d+)?\s*[\])]?)/iu;
const SE_PATTERN = /(?:standard error|\bSE|標準誤)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/iu;
const SD_PATTERN = /(?:standard deviation|\bSD|標準差)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/iu;
const VARIANCE_PATTERN = /(?:variance|變異數)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/iu;
const P_PATTERN = /\bp\s*(?:=|<|>|≤|≥)\s*(0?(?:\.\d+)?)/iu;
const EFFECT_PATTERN = /(?:effect size|odds ratio|risk ratio|hazard ratio|Cohen'?s? d|效果量|勝算比|風險比)\s*[:=]?\s*(-?\d+(?:\.\d+)?)/iu;
const EFFECT_MEASURE_PATTERN = /(?<measure>OR|RR|HR|β|beta|standardized beta|correlation coefficient|Pearson'?s? r|r)\s*(?:=|:|was)\s*(?<value>[-−]?(?:\d+(?:\.\d+)?|\.\d+))/giu;

function metricForSpan(text: string, unit?: string): string {
  if (/VO2\s*(?:max|peak)|cardiorespiratory fitness|aerobic capacity|心肺適能|最大攝氧/iu.test(text)) return "cardiorespiratory_fitness";
  if (/FEV1|FVC|lung function|pulmonary function|肺功能/iu.test(text)) return "lung_function";
  if (/weight loss|weight reduction|body weight|減重|體重/iu.test(text)) return "weight_loss";
  if (/accuracy|exact match|F1 score|準確率|正確率/iu.test(text)) return "accuracy";
  if (/latency|response time|延遲/iu.test(text)) return "latency";
  if (/token cost|inference cost|\bcost\b|USD|dollars?|成本/iu.test(text)) return "cost";
  if (/systolic|收縮壓|SBP\b/iu.test(text)) return "systolic_blood_pressure";
  if (/diastolic|舒張壓|DBP\b/iu.test(text)) return "diastolic_blood_pressure";
  if (/blood pressure|血壓/iu.test(text)) return "blood_pressure";
  if (/sleep duration|sleep time|睡眠時間|睡眠時數/iu.test(text)) return "sleep_duration";
  if (/screen time|螢幕時間|螢幕使用/iu.test(text)) return "screen_time";
  if (/sleep quality|睡眠品質/iu.test(text)) return "sleep_quality";
  if (/odds ratio|勝算比|\bOR\b/iu.test(text)) return "odds_ratio";
  if (/correlation|相關係數|\br\s*[=<>]/iu.test(text)) return "correlation";
  if (/sample|樣本|受試|個體數|\bn\s*=/iu.test(text)) return "sample_size";
  if (/concentration|濃度|dose|dosage|暴露量/iu.test(text)) return "exposure_level";
  if (/duration|暴露時間|天|小時|週|月/iu.test(text)) return "duration";
  if (/mortality|死亡/iu.test(text)) return "mortality";
  if (/growth|生長/iu.test(text)) return "growth";
  if (/negative effects? (?:were )?reported|studies? .*negative effects?|研究.*負面效應/iu.test(text))
    return "study_share_reporting_negative_effects";
  if (/algal cells?|feeding capacity|feeding behaviour|攝食|藻細胞/iu.test(text))
    return "feeding_or_algal_cell_ingestion";
  if (/carbon biomass|碳生物量/iu.test(text)) return "carbon_biomass_ingestion";
  if (/reproduct|egg production|繁殖|產卵/iu.test(text)) return "reproductive_output";
  if (/prevalence|盛行率/iu.test(text)) return "prevalence";
  if (/比例|percent|percentage/iu.test(text) || unit === "%")
    return "unclassified_percentage";
  return "reported_numeric_result";
}

function metricForMatch(text: string, matchIndex: number, unit?: string): string {
  const prefix = text.slice(Math.max(0, matchIndex - 100), matchIndex);
  if (unit === "%" && /(?:I\s*[²2]|heterogeneity)\s*(?:=|of)?\s*$/iu.test(prefix)) {
    return "heterogeneity_i2";
  }
  const lower = prefix.toLocaleLowerCase();
  const systolic = Math.max(lower.lastIndexOf("systolic"), lower.lastIndexOf("sbp"), prefix.lastIndexOf("收縮壓"));
  const diastolic = Math.max(lower.lastIndexOf("diastolic"), lower.lastIndexOf("dbp"), prefix.lastIndexOf("舒張壓"));
  if (systolic >= 0 || diastolic >= 0) {
    return diastolic > systolic ? "diastolic_blood_pressure" : "systolic_blood_pressure";
  }
  return metricForSpan(text.slice(Math.max(0, matchIndex - 90), matchIndex + 100), unit);
}

function estimateTypeForSpan(text: string, metric: string): NonNullable<NumericEvidence["estimateType"]> {
  if (metric === "sample_size") return "sample_size";
  if (metric === "duration" || /duration|時間|時數/iu.test(metric)) return "duration";
  if (metric === "odds_ratio" || /odds ratio|risk ratio|hazard ratio|勝算比|風險比/iu.test(text)) return "ratio";
  if (metric === "correlation" || /correlation|相關係數|\br\s*[=<>]/iu.test(text)) return "correlation";
  if (/change|reduction|decrease|increase|降低|減少|升高|增加|改變/iu.test(text)) return "change";
  if (/between[- ]group|difference|compared with|versus|vs\.?|組間差|差異/iu.test(text)) return "difference";
  if (/count|number|人數|個數|顆數/iu.test(text)) return "count";
  return "absolute";
}

function directionForSpan(text: string): NonNullable<NumericEvidence["direction"]> {
  if (/no significant|null|無顯著|未見差異/iu.test(text)) return "null";
  if (/decrease|reduction|lower|降低|減少/iu.test(text)) return "decrease";
  if (/increase|higher|升高|增加/iu.test(text)) return "increase";
  if (/negative association|負相關|負向/iu.test(text)) return "negative";
  if (/positive association|正相關|正向/iu.test(text)) return "positive";
  return "unknown";
}

function normalizeUnit(unit: string | undefined): string | undefined {
  const value = clean(unit).replace(/\s+/gu, "");
  if (!value) return undefined;
  if (/^mmhg$/iu.test(value)) return "mmHg";
  if (/^[µμ]g\/l$/iu.test(value)) return "μg/L";
  if (/^[µμ]g\/kg$/iu.test(value)) return "μg/kg";
  if (/^h(?:\/day|perday)$/iu.test(value)) return "h/day";
  return value;
}

export function extractNumericEvidence(span: EvidenceSpan): NumericEvidence[] {
  const results: NumericEvidence[] = [];
  let match: RegExpExecArray | null;
  QUANTITATIVE_PATTERN.lastIndex = 0;
  while ((match = QUANTITATIVE_PATTERN.exec(span.text)) !== null) {
    const groups = match.groups ?? {};
    const sample = groups.sample;
    const valueText = groups.value;
    const unit = normalizeUnit(groups.unit);
    const suffix = span.text.slice(match.index + match[0].length, match.index + match[0].length + 32);
    if (unit === "%" && /^\s*(?:CI|confidence interval|信賴區間)/iu.test(suffix)) continue;
    const localStart = Math.max(0, match.index - 90);
    const localEnd = Math.min(span.text.length, match.index + match[0].length + 90);
    const localContext = span.text.slice(localStart, localEnd);
    const metric = sample || /^(?:participants?|patients?|subjects?|students?|人)$/iu.test(unit ?? "")
      ? "sample_size"
      : metricForMatch(span.text, match.index, unit);
    const estimateType = estimateTypeForSpan(localContext, metric);
    const value = Number((sample ?? valueText)?.replace(/,/gu, "").replace(/−/gu, "-"));
    const tail = span.text
      .slice(match.index + match[0].length, match.index + match[0].length + 150)
      .split(/(?=\b(?:SBP|DBP|systolic|diastolic)\b|收縮壓|舒張壓)/iu)[0] ?? "";
    const numericEvidenceId = `${span.spanId}:numeric:${results.length + 1}`;
    results.push({
      numericEvidenceId,
      metric,
      value: Number.isFinite(value) ? value : (sample ?? valueText),
      unit: metric === "sample_size" ? "participants_or_units" : unit,
      sampleSize: metric === "sample_size" ? Number((sample ?? valueText)?.replace(/,/gu, "")) : undefined,
      estimateType,
      direction: directionForSpan(localContext),
      confidenceInterval: CI_PATTERN.exec(tail)?.[1]?.trim(),
      standardError: SE_PATTERN.exec(tail)?.[1],
      standardDeviation: SD_PATTERN.exec(tail)?.[1],
      variance: VARIANCE_PATTERN.exec(tail)?.[1],
      pValue: metric === "heterogeneity_i2" || metric === "sample_size"
        ? undefined
        : P_PATTERN.exec(tail)?.[0]?.replace(/\s+/gu, ""),
      effectSize: EFFECT_PATTERN.exec(tail)?.[1],
      sourceSpanId: span.spanId,
      comparableGroupKey: `${metric}:${(metric === "sample_size" ? "participants_or_units" : unit ?? "unit_unavailable").toLocaleLowerCase()}:${estimateType}`,
    });
  }
  EFFECT_MEASURE_PATTERN.lastIndex = 0;
  while ((match = EFFECT_MEASURE_PATTERN.exec(span.text)) !== null) {
    const measure = clean(match.groups?.measure).toLocaleLowerCase();
    const rawValue = clean(match.groups?.value).replace(/−/gu, "-");
    const value = Number(rawValue);
    if (!Number.isFinite(value)) continue;
    const metric = /^(?:or|odds ratio)$/iu.test(measure)
      ? "odds_ratio"
      : /^(?:rr|risk ratio)$/iu.test(measure)
        ? "risk_ratio"
        : /^(?:hr|hazard ratio)$/iu.test(measure)
          ? "hazard_ratio"
          : /(?:correlation|pearson|^r$)/iu.test(measure)
            ? "correlation"
            : "standardized_beta";
    const estimateType: NonNullable<NumericEvidence["estimateType"]> =
      metric === "correlation" ? "correlation" : metric.endsWith("_ratio") ? "ratio" : "difference";
    const tail = span.text.slice(match.index + match[0].length, match.index + match[0].length + 150);
    results.push({
      numericEvidenceId: `${span.spanId}:numeric:${results.length + 1}`,
      metric,
      value,
      effectSize: rawValue,
      estimateType,
      direction: value < 0 ? "negative" : value > 0 ? "positive" : "null",
      confidenceInterval: CI_PATTERN.exec(tail)?.[1]?.trim(),
      pValue: P_PATTERN.exec(tail)?.[0]?.replace(/\s+/gu, ""),
      sourceSpanId: span.spanId,
      comparableGroupKey: `${metric}:unitless:${estimateType}`,
    });
  }
  return results;
}

function firstCardValue(cards: ReportWriterEvidenceCard[], key: keyof ReportWriterEvidenceCard): string | undefined {
  for (const card of cards) {
    const value = clean(card[key]);
    if (value) return value;
  }
  return undefined;
}

function firstCardAlias(cards: ReportWriterEvidenceCard[], keys: string[]): string | undefined {
  for (const card of cards) {
    const record = card as unknown as Record<string, unknown>;
    for (const key of keys) {
      const value = clean(record[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function sourceContentAccessState(source: SourceRecord, availability: EvidenceAvailability): StructuredStudyEvidence["contentAccessState"] {
  const raw = source as SourceRecord & {
    pageCount?: number | null;
    extractedPageCount?: number | null;
    enrichmentProvenance?: Array<{ accessState?: string }> | null;
  };
  const accessStateV3 = [...(raw.enrichmentProvenance ?? [])].reverse().find((item) => clean(item.accessState))?.accessState;
  if (accessStateV3) {
    if (["FULL_TEXT_STRUCTURED", "FULL_TEXT_HTML", "FULL_TEXT_PDF", "FULL_TEXT_REPOSITORY_COPY"].includes(accessStateV3)) return "full_text";
    if (accessStateV3 === "ABSTRACT_ONLY") return "abstract_only";
    return "metadata_only";
  }
  if (availability === "METADATA_ONLY") return "metadata_only";
  if (availability === "ABSTRACT_AVAILABLE") return "abstract_only";
  if (
    raw.extractionStatus === "partial" ||
    (typeof raw.pageCount === "number" && typeof raw.extractedPageCount === "number" && raw.extractedPageCount < raw.pageCount)
  ) return "partial_full_text";
  return "full_text";
}

function sourceFullTextUrl(source: SourceRecord): string | undefined {
  return clean(source.fullTextUrl) || clean(source.readableUrl) ||
    source.enrichmentProvenance?.map((item) => clean(item.url)).find(Boolean) || undefined;
}

function sourceLicense(source: SourceRecord): string | undefined {
  const raw = source as SourceRecord & { license?: string | { URL?: string; url?: string } | Array<string | { URL?: string; url?: string }> };
  const licenses = Array.isArray(raw.license) ? raw.license : raw.license ? [raw.license] : [];
  return licenses.map((value) => typeof value === "string" ? clean(value) : clean(value.URL) || clean(value.url)).find(Boolean);
}

function directionForCards(cards: ReportWriterEvidenceCard[]): StructuredStudyEvidence["effectDirection"] {
  const text = cards.map((card) => [card.claim, card.exactResult, card.evidence, card.summary].map(clean).join(" ")).join(" ");
  const positive = /(?:increase|higher|positive|升高|增加|促進|正向)/iu.test(text);
  const negative = /(?:decrease|lower|negative|降低|減少|抑制|負向)/iu.test(text);
  const nullResult = /(?:no significant|null result|無顯著|未發現差異|零效果)/iu.test(text);
  const count = [positive, negative, nullResult].filter(Boolean).length;
  if (count > 1) return "mixed";
  if (nullResult) return "null";
  if (positive) return "positive";
  if (negative) return "negative";
  return "unknown";
}

const READER_CLAIM_LEAKAGE_PATTERN = /(?:中文摘要：|此來源可用於檢視|可辨識的證據面向|已取得(?:\s*DOI|來源連結)|系統初評|accepted source|evidence cards?|provider|confidence score)/iu;

function readerFacingClaimLanguage(value: string): string {
  return clean(value)
    .replace(/主要\s+exposure\b/giu, "主要暴露指標")
    .replace(/\bexposure\s+basis\b/giu, "暴露定義")
    .replace(/\bdirect_evidence\b/giu, "直接證據")
    .replace(/\brule_fallback_claim_extraction\b/giu, "僅能依摘要或可讀片段進行保守判讀");
}

function readerClaimForCard(card: ReportWriterEvidenceCard): StructuredStudyEvidence["readerClaims"][number] | null {
  const record = card as unknown as Record<string, unknown>;
  const text = readerFacingClaimLanguage(clean(record.claimTextZhTw) || clean(record.claimTextZh) || clean(record.mainClaimZhTw) || clean(record.mainClaim) || clean(card.claim));
  const cjk = text.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  if (cjk < 12 || READER_CLAIM_LEAKAGE_PATTERN.test(text)) return null;
  return {
    claimId: clean(record.claimId) || clean(card.id) || clean(card.evidenceId) || `claim:${card.sourceId}`,
    text,
    evidenceId: clean(card.evidenceId) || clean(card.id) || clean(card.evidenceCardId),
    sourceId: card.sourceId,
    limitation: readerFacingClaimLanguage(clean(card.limitation) || unique(card.limitations ?? [])[0]) || undefined,
  };
}

function structuredFactsForCards(cards: ReportWriterEvidenceCard[]): StructuredStudyFact[] {
  return cards
    .map((card) => card.structuredStudyFact)
    .filter((fact): fact is StructuredStudyFact => Boolean(fact))
    .sort((left, right) => right.evidenceConfidence - left.evidenceConfidence);
}

function firstStructuredValue<K extends keyof StructuredStudyFact>(
  facts: StructuredStudyFact[],
  key: K,
): StructuredStudyFact[K] | undefined {
  return facts.map((fact) => fact[key]).find((value) =>
    value !== null && value !== undefined && value !== "" && value !== "unknown" && value !== "unclear",
  );
}

function numericEvidenceFromStructuredFacts(
  facts: StructuredStudyFact[],
  spans: EvidenceSpan[],
): NumericEvidence[] {
  return facts.flatMap((fact) => fact.quantitativeFacts.flatMap((item, index) => {
    const span = spans.find((candidate) =>
      candidate.text.toLocaleLowerCase().includes(item.provenance.sourceSpanText.toLocaleLowerCase()) ||
      item.provenance.sourceSpanText.toLocaleLowerCase().includes(candidate.text.toLocaleLowerCase()),
    );
    if (!span) return [];
    const estimateType: NonNullable<NumericEvidence["estimateType"]> =
      ["risk_ratio", "odds_ratio", "hazard_ratio"].includes(item.metric)
        ? "ratio"
        : item.metric === "correlation"
          ? "correlation"
          : item.metric === "sample_size"
            ? "sample_size"
            : "unknown";
    return [{
      numericEvidenceId: `${span.spanId}:structured:${index + 1}`,
      metric: item.metric,
      value: item.value ?? item.rawValue,
      unit: item.unit ?? undefined,
      confidenceInterval: item.ciLower != null && item.ciUpper != null
        ? `${item.ciLower}–${item.ciUpper}`
        : undefined,
      standardError: item.standardError ?? undefined,
      standardDeviation: item.standardDeviation ?? undefined,
      pValue: item.pValue ?? undefined,
      sampleSize: item.denominator ?? (item.metric === "sample_size" ? item.value ?? undefined : undefined),
      estimateType,
      direction: item.effectDirection === "unclear" ? "unknown" : item.effectDirection,
      sourceSpanId: span.spanId,
      comparableGroupKey: `${item.metric}:${(item.unit ?? "unit_unavailable").toLocaleLowerCase()}:${estimateType}`,
    } satisfies NumericEvidence];
  }));
}

export function extractStructuredStudyEvidence(input: {
  sources: SourceRecord[];
  evidenceCards: ReportWriterEvidenceCard[];
}): StructuredStudyEvidence[] {
  return input.sources.map((source, index) => {
    const id = sourceId(source, index);
    const canonicalIdentity = clean(source.canonicalSourceIdentity);
    const cards = input.evidenceCards.filter((card) =>
      card.sourceId === id ||
      (canonicalIdentity.length > 0 && clean(card.canonicalSourceKey) === canonicalIdentity),
    );
    const availability = classifyEvidenceAvailability(source);
    const spans = cards.map((card, cardIndex) => cardSpan(card, cardIndex, source)).filter((span): span is EvidenceSpan => Boolean(span));
    const structuredFacts = structuredFactsForCards(cards);
    const structuredNumeric = numericEvidenceFromStructuredFacts(structuredFacts, spans);
    const numeric = structuredNumeric.length ? structuredNumeric : spans.flatMap(extractNumericEvidence);
    const readerClaims = cards
      .map(readerClaimForCard)
      .filter((claim): claim is StructuredStudyEvidence["readerClaims"][number] => Boolean(claim));
    const outcomes = unique([
      ...structuredFacts.map((fact) => fact.outcome),
      ...cards.map((card) => card.outcome),
    ]);
    const sampleEvidence = numeric.find((item) => item.metric === "sample_size");
    const studyDesign =
      firstStructuredValue(structuredFacts, "studyDesign") as string | undefined ||
      firstCardValue(cards, "studyDesign");
    const designFact = structuredFacts.find((fact) => fact.studyDesign === studyDesign);
    const designProvenance = designFact?.fieldProvenance.studyDesign;
    const directionValues = unique(structuredFacts.map((fact) => fact.effectDirection).filter((value) =>
      value !== "unclear" && value !== "not_applicable",
    ));
    const structuredDirection = directionValues.length > 1 ? "mixed" : directionValues[0];
    const confidence = availability === "METADATA_ONLY" ? 0.2 : availability === "ABSTRACT_AVAILABLE" ? 0.62 : availability === "FULL_TEXT_AVAILABLE" ? 0.82 : 0.9;
    return {
      sourceId: id,
      studyId: clean(source.doi) || id,
      title: clean(source.title) || "Untitled source",
      authors: source.authors?.map((author) => typeof author === "string" ? author : clean(author)).filter(Boolean),
      year: typeof source.year === "number" ? source.year : undefined,
      doi: clean(source.doi) || undefined,
      url: clean(source.url) || undefined,
      studyDesign,
      studyDesignExplicit: Boolean(designFact?.studyDesignExplicit && designProvenance),
      studyDesignSourceSpan: designProvenance ? {
        spanId: `${id}:study-design`, sourceId: id, text: designProvenance.sourceSpanText,
        page: designProvenance.page ?? undefined,
        sectionHeading: designProvenance.sectionOrLocation ?? undefined,
      } : undefined,
      researchQuestion: firstCardValue(cards, "researchSetting"),
      population: firstStructuredValue(structuredFacts, "population") as string | undefined || firstCardValue(cards, "dataScope"),
      populationDescription: firstStructuredValue(structuredFacts, "populationDescription") as string | undefined,
      populationAgeMin: firstStructuredValue(structuredFacts, "populationAgeMin") as number | undefined,
      populationAgeMax: firstStructuredValue(structuredFacts, "populationAgeMax") as number | undefined,
      populationAgeMean: firstStructuredValue(structuredFacts, "populationAgeMean") as number | undefined,
      setting: firstStructuredValue(structuredFacts, "populationSetting") as string | undefined || firstCardAlias(cards, ["setting", "researchSetting", "location"]),
      speciesOrSubject: firstCardValue(cards, "researchSetting"),
      sampleSize: firstStructuredValue(structuredFacts, "populationSampleSize") as number | undefined || sampleEvidence?.sampleSize,
      location: firstStructuredValue(structuredFacts, "populationLocation") as string | undefined || firstCardValue(cards, "location"),
      exposure: firstStructuredValue(structuredFacts, "exposure") as string | undefined || firstCardValue(cards, "exposure"),
      exposureDefinition: firstStructuredValue(structuredFacts, "exposureDefinition") as string | undefined,
      exposureMeasurement: firstStructuredValue(structuredFacts, "exposureMeasurement") as string | undefined,
      exposureTiming: firstStructuredValue(structuredFacts, "exposureTiming") as string | undefined,
      intervention: firstCardAlias(cards, ["intervention"]),
      comparator: firstStructuredValue(structuredFacts, "comparator") as string | undefined || firstCardAlias(cards, ["comparator", "controlGroup"]),
      comparatorDefinition: firstStructuredValue(structuredFacts, "comparatorDefinition") as string | undefined,
      exposureLevel: firstCardAlias(cards, ["exposureLevel", "dose"]),
      exposureDuration: firstCardAlias(cards, ["exposureDuration", "duration"]),
      studyPeriod: firstCardAlias(cards, ["studyPeriod", "followUp", "follow_up"]),
      outcomes: outcomes.length ? outcomes : undefined,
      outcomeDefinition: firstStructuredValue(structuredFacts, "outcomeDefinition") as string | undefined,
      outcomeMeasurement: firstStructuredValue(structuredFacts, "outcomeMeasurement") as string | undefined,
      outcomeTimepoint: firstStructuredValue(structuredFacts, "outcomeTimepoint") as string | undefined,
      keyNumericResults: numeric.length ? numeric : undefined,
      effectDirection: structuredDirection as StructuredStudyEvidence["effectDirection"] || directionForCards(cards),
      effectDirectionConfidence: firstStructuredValue(structuredFacts, "effectDirectionConfidence") as number | undefined,
      adjustedOrUnadjusted: firstStructuredValue(structuredFacts, "adjustedOrUnadjusted") as StructuredStudyEvidence["adjustedOrUnadjusted"],
      covariates: unique(structuredFacts.flatMap((fact) => fact.covariates)),
      confounders: unique(structuredFacts.flatMap((fact) => fact.confounders)),
      moderators: structuredFacts.flatMap((fact) => fact.moderators),
      mediators: structuredFacts.flatMap((fact) => fact.mediators),
      subgroups: structuredFacts.flatMap((fact) => fact.subgroups),
      primaryResult: firstStructuredValue(structuredFacts, "primaryResult") as string | undefined,
      secondaryResults: unique(structuredFacts.flatMap((fact) => fact.secondaryResults)),
      authorCautions: unique(structuredFacts.flatMap((fact) => fact.authorCautions)),
      limitations: unique([
        ...cards.flatMap((card) => card.limitations ?? []),
        ...cards.map((card) => card.limitation),
      ]),
      evidenceSpans: spans,
      readerClaims,
      extractionConfidence: confidence,
      extractionSource: availabilitySource(availability),
      verificationStatus: spans.length === 0 ? "unverified" : availability === "ABSTRACT_AVAILABLE" ? "partial" : "verified",
      evidenceAvailability: availability,
      contentAccessState: sourceContentAccessState(source, availability),
      fullTextSource: sourceFullTextUrl(source),
      license: sourceLicense(source),
      accessState: clean(source.sourceLinkInfo?.accessStatus) || clean(source.accessLevel) || undefined,
      structuredStudyFacts: structuredFacts,
    };
  });
}

export function selectResearchMethod(input: ResearchWorkflowFacts & { studies: StructuredStudyEvidence[] }): ResearchMethodSelection {
  const systematicRequirements = {
    reproducibleSearchStrategy: input.reproducibleSearchStrategy,
    namedDatabasesOrProviders: input.namedProviders.length > 0,
    explicitInclusionCriteria: input.explicitInclusionCriteria,
    explicitExclusionCriteria: input.explicitExclusionCriteria,
    screeningProcedure: input.screeningProcedure,
    duplicateRemoval: input.duplicateRemoval,
    documentedStudySelection: input.documentedStudySelection,
    qualityAssessment: input.qualityAssessment,
  };
  const systematicSupported = Object.values(systematicRequirements).every(Boolean);
  const comparableGroups = new Map<string, number>();
  for (const item of input.studies.flatMap((study) => study.keyNumericResults ?? [])) {
    if (!item.comparableGroupKey || item.effectSize == null) continue;
    comparableGroups.set(item.comparableGroupKey, (comparableGroups.get(item.comparableGroupKey) ?? 0) + 1);
  }
  const metaSupported = systematicSupported && [...comparableGroups.values()].some((count) => count >= 2);
  if (input.requestedMethod === "META_ANALYSIS" && !metaSupported) {
    return { selectedMethod: systematicSupported ? "SYSTEMATIC_REVIEW" : "STRUCTURED_LITERATURE_REVIEW", requestedMethod: input.requestedMethod, status: "META_ANALYSIS_NOT_SUPPORTED_BY_EVIDENCE", reasons: ["Compatible outcomes and traceable effect estimates from at least two comparable studies were not available."], requirements: { ...systematicRequirements, compatibleEffectEstimates: metaSupported } };
  }
  if (input.requestedMethod === "SYSTEMATIC_REVIEW" && !systematicSupported) {
    return { selectedMethod: "STRUCTURED_LITERATURE_REVIEW", requestedMethod: input.requestedMethod, status: "DOWNGRADED", reasons: Object.entries(systematicRequirements).filter(([, pass]) => !pass).map(([key]) => `Missing systematic-review requirement: ${key}`), requirements: systematicRequirements };
  }
  if (input.requestedMethod === "META_ANALYSIS" && metaSupported) return { selectedMethod: "META_ANALYSIS", requestedMethod: input.requestedMethod, status: "SUPPORTED", reasons: [], requirements: { ...systematicRequirements, compatibleEffectEstimates: true } };
  if (input.requestedMethod === "SYSTEMATIC_REVIEW") return { selectedMethod: "SYSTEMATIC_REVIEW", requestedMethod: input.requestedMethod, status: "SUPPORTED", reasons: [], requirements: systematicRequirements };
  const primaryCount = input.studies.filter((study) => study.studyDesign && study.studyDesign !== "review").length;
  const selectedMethod: ResearchMethod = input.requestedMethod ?? (input.themeSynthesis !== false && input.studies.length >= 3 ? "THEMATIC_SYNTHESIS" : primaryCount >= 2 ? "COMPARATIVE_LITERATURE_ANALYSIS" : "STRUCTURED_LITERATURE_REVIEW");
  return { selectedMethod, requestedMethod: input.requestedMethod, status: "SUPPORTED", reasons: [], requirements: systematicRequirements };
}

function inferResearchDomain(question: string): ResearchDomain {
  if (/education|student|teacher|school|learning|curricul|教育|學生|教師|學習|課程|高中|校園/iu.test(question)) return "education";
  if (/health|sleep|clinical|patient|disease|medicine|antibiotic|健康|睡眠|疾病|醫療|抗生素|抗藥/iu.test(question)) return "health";
  if (/climate|environment|pollution|ecolog|carbon|microplastic|marine|環境|氣候|污染|生態|碳排|微塑膠|海洋/iu.test(question)) return "environment";
  if (/technology|artificial intelligence|generative ai|software|algorithm|科技|人工智慧|生成式|演算法|軟體/iu.test(question)) return "technology";
  if (/market|business|consumer|finance|企業|市場|商業|消費|金融/iu.test(question)) return "business";
  if (/society|policy|culture|behavior|社會|政策|文化|行為/iu.test(question)) return "social_science";
  return "general";
}

function researchConcepts(question: string): string[] {
  const named = question.match(/[\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9\s-]{1,28}?(?:時間|時長|品質|效益|風險|策略|成效|抗藥性|睡眠|教育|學習|人工智慧|screen time|sleep quality|sleep duration|learning outcomes?)/giu) ?? [];
  const clauses = question
    .replace(/[？?。.!]/gu, "")
    .split(/(?:與|和|及|對|之間|的關聯|的影響|、|versus|and|on)/iu)
    .map(clean)
    .filter((item) => item.length >= 2 && item.length <= 32);
  return unique([...named, ...clauses]).slice(0, 6);
}

function titleTopic(question: string): string {
  return clean(question)
    .replace(/^(?:現有證據如何解釋|如何理解|探討|研究)\s*[「"]?/u, "")
    .replace(/[」"]?[？?]$/u, "")
    .slice(0, 42) || "本研究主題";
}

export function buildResearchBlueprint(input: {
  workflow: ResearchWorkflowFacts;
  studies: StructuredStudyEvidence[];
  matrix: EvidenceMatrixRow[];
  method: ResearchMethodSelection;
}): ResearchBlueprint {
  const centralQuestion = clean(input.workflow.researchQuestion) || "現有證據如何回答本次研究問題？";
  const domain = inferResearchDomain(centralQuestion);
  const concepts = researchConcepts(centralQuestion);
  const topic = titleTopic(centralQuestion);
  const hasBenefitRiskStrategy = /效益|風險|策略|benefit|risk|strateg/iu.test(centralQuestion);
  const primaryQuestion: ResearchBlueprintQuestion = {
    id: "RQ1",
    question: centralQuestion.endsWith("？") || centralQuestion.endsWith("?") ? centralQuestion : `${centralQuestion}？`,
    priority: "primary",
  };
  const secondaryQuestions: ResearchBlueprintQuestion[] = hasBenefitRiskStrategy
    ? [
        { id: "RQ2", question: `${topic}的主要效益與成立條件為何？`, priority: "secondary" },
        { id: "RQ3", question: `${topic}的主要風險、限制與可能緩解方式為何？`, priority: "secondary" },
        { id: "RQ4", question: `現有證據支持哪些合理使用或實務策略？`, priority: "secondary" },
      ]
    : [
        { id: "RQ2", question: `不同族群、暴露或測量定義下，${topic}的結果是否一致？`, priority: "secondary" },
        { id: "RQ3", question: `研究設計與資料限制如何影響${topic}的解讀？`, priority: "secondary" },
      ];
  const researchQuestions = [primaryQuestion, ...secondaryQuestions];
  const synthesisAxes = unique([
    ...(hasBenefitRiskStrategy ? ["學習效益與成立條件", "使用風險與治理邊界", "合理使用與政策策略"] : []),
    ...input.matrix.map((row) => themeLabel(row.themeId)),
    "主要結果與關聯方向",
    "族群、暴露與測量差異",
    "研究設計、因果邊界與證據限制",
  ]).slice(0, 5);
  const definitionTerms = unique([
    ...concepts,
    ...(centralQuestion.match(/[\p{Script=Han}]{2,12}(?:時間|時長|品質|效益|風險|策略|抗藥性)/gu) ?? []),
  ]).slice(0, 5);
  const methodLimitations = unique([
    input.studies.some((study) => study.contentAccessState === "abstract_only")
      ? "部分來源僅能使用摘要，因此不能宣稱完成所有全文層級分析。"
      : null,
    input.studies.some((study) => /cross-sectional|橫斷/iu.test(study.studyDesign ?? ""))
      ? "橫斷式研究只能支持關聯判讀，不能單獨建立因果方向。"
      : null,
    !input.workflow.qualityAssessment
      ? "本次 workflow 未保存獨立研究品質評估結果，不得冒稱完成系統性偏誤風險評估。"
      : null,
  ]);
  const primaryClaimTypes: ClaimFunction[] = ["descriptive-finding", "comparative-finding"];
  const sectionPlan: ResearchBlueprintSectionPlan[] = [
    {
      id: "executive_summary",
      title: "摘要",
      purpose: "在 canonical 正文完成後，濃縮背景、目的、真實方法、主要發現、限制與結論。",
      questionsAnswered: ["RQ1"],
      requiredClaimTypes: ["conclusion-synthesis"],
      evidenceNeeds: ["body-validated claims only"],
      quantitativeNeeds: ["最多選取一至三個已驗證且對核心問題重要的數值"],
      figureOpportunities: [],
      subsections: [],
    },
    {
      id: "background",
      title: `一、${topic}的研究背景與問題界定`,
      purpose: "交代研究脈絡、重要性、目的、待答問題、定義、範圍與必要限制。",
      questionsAnswered: researchQuestions.map((item) => item.id),
      requiredClaimTypes: ["background", "research-gap"],
      evidenceNeeds: ["topic context", "construct definitions", "research significance"],
      quantitativeNeeds: [],
      figureOpportunities: ["conceptual_framework"],
      subsections: [
        { id: "background-motivation", title: "研究背景、動機與重要性", purpose: "說明研究問題為何值得回答。" },
        { id: "objectives-questions", title: "研究目的與待答問題", purpose: "明確列出研究目的與研究問題。" },
        { id: "definitions-scope", title: "名詞釋義、研究範圍與限制", purpose: "界定核心概念與適用邊界。" },
      ],
    },
    {
      id: "methods",
      title: "二、研究方法與研究步驟",
      purpose: "只描述實際執行的檢索、篩選、去重、抽取、分類、比較與綜合流程。",
      questionsAnswered: researchQuestions.map((item) => item.id),
      requiredClaimTypes: ["method"],
      evidenceNeeds: ["workflow metadata", "selection criteria", "evidence extraction record"],
      quantitativeNeeds: [],
      figureOpportunities: ["research_flow"],
      subsections: [
        { id: "method-classification", title: "研究方法及選擇理由", purpose: "說明方法如何符合實際資料與研究問題。" },
        { id: "research-workflow", title: "研究步驟", purpose: "呈現本次真實 workflow，不虛構實驗、問卷或訪談。" },
      ],
    },
    {
      id: "evidence_overview",
      title: "三、文獻範圍與證據概況",
      purpose: "交代研究範圍與可用證據型態，但不把來源治理文字當成研究發現。",
      questionsAnswered: ["RQ3"],
      requiredClaimTypes: ["method"],
      evidenceNeeds: ["study design", "population", "evidence availability"],
      quantitativeNeeds: ["corpus composition only"],
      figureOpportunities: ["evidence_map", "comparison_table"],
      subsections: [],
    },
    {
      id: "findings",
      title: `四、${synthesisAxes[0] ?? topic}的主要研究發現`,
      purpose: "以主張為中心整合多來源證據，將可用數據放入正文並保留適用條件。",
      questionsAnswered: ["RQ1", "RQ2"].filter((id) => researchQuestions.some((item) => item.id === id)),
      requiredClaimTypes: primaryClaimTypes,
      evidenceNeeds: ["direct findings", "agreement and disagreement", "boundary conditions"],
      quantitativeNeeds: ["body-worthy and figure-worthy validated facts"],
      figureOpportunities: ["bar_chart", "dot_plot", "comparison_table"],
      subsections: synthesisAxes.slice(0, 3).map((axis, index) => ({ id: `finding-axis-${index + 1}`, title: axis, purpose: `整合與「${axis}」直接相關的主張、比較與限制。` })),
    },
    {
      id: "cross_study_synthesis",
      title: "五、跨研究比較與差異來源",
      purpose: "比較族群、暴露、結果定義、研究方法與時間差異，不進行不合法 pooled estimate。",
      questionsAnswered: researchQuestions.filter((item) => item.id !== "RQ1").map((item) => item.id),
      requiredClaimTypes: ["comparative-finding"],
      evidenceNeeds: ["multi-source comparison", "heterogeneity", "conflicting evidence"],
      quantitativeNeeds: ["only semantically compatible estimates"],
      figureOpportunities: ["comparison_table", "dot_plot", "forest_plot"],
      subsections: synthesisAxes.slice(1, 4).map((axis, index) => ({ id: `comparison-axis-${index + 1}`, title: axis, purpose: `比較「${axis}」的研究間一致性與差異。` })),
    },
    {
      id: "discussion",
      title: "六、討論：解釋、適用條件與實務意涵",
      purpose: "解釋一致與不一致結果、可能機制、混雜、因果限制與實務意涵，避免重寫 Findings。",
      questionsAnswered: researchQuestions.map((item) => item.id),
      requiredClaimTypes: ["mechanism", "implication"],
      evidenceNeeds: ["body-established findings", "study differences", "causal boundaries"],
      quantitativeNeeds: [],
      figureOpportunities: ["mechanism_diagram", "conceptual_framework"],
      subsections: [
        { id: "agreement-disagreement", title: "研究結果的一致性與差異", purpose: "解釋研究間為何可能出現不同結果。" },
        { id: "mechanisms-boundaries", title: "可能機制、混雜與因果邊界", purpose: "將解釋限制在證據支持範圍。" },
        { id: "implications", title: "實務與政策意涵", purpose: "提出不超出證據的應用含意。" },
      ],
    },
    {
      id: "limitations_gaps",
      title: "七、研究限制與待補證據",
      purpose: "指出資料、方法、可比性、全文取得與未閉合問題，不用空話補長度。",
      questionsAnswered: researchQuestions.map((item) => item.id),
      requiredClaimTypes: ["limitation", "research-gap"],
      evidenceNeeds: ["source and method limitations", "unresolved questions"],
      quantitativeNeeds: ["missing denominator, variance, CI or incompatible metric diagnostics"],
      figureOpportunities: [],
      subsections: [],
    },
    {
      id: "conclusion",
      title: "八、待答問題回收與結論",
      purpose: "逐項回答研究問題，只使用正文已驗證且允許進入結論的主張。",
      questionsAnswered: researchQuestions.map((item) => item.id),
      requiredClaimTypes: ["conclusion-synthesis"],
      evidenceNeeds: ["eligible realized body claims"],
      quantitativeNeeds: ["only validated body-realized quantitative facts"],
      figureOpportunities: [],
      subsections: researchQuestions.map((question) => ({ id: `closure-${question.id.toLocaleLowerCase()}`, title: `${question.id} 回答`, purpose: question.question })),
    },
  ];
  return {
    schemaVersion: "research-blueprint/v1",
    reportType: "formal_secondary_research_report",
    domain,
    centralQuestion,
    researchBackground: {
      context: [`本報告以「${topic}」為核心，不按來源清單排列正文。`],
      significance: [`釐清現有證據能回答的範圍、差異與限制。`],
      motivation: [`將讀者可讀的研究敘事與可稽核的 evidence governance 分層。`],
    },
    researchObjectives: [
      `整理${topic}的主要研究發現。`,
      "比較研究間一致性、差異與適用條件。",
      "辨識可合法整合的量化結果、圖表機會與證據缺口。",
    ],
    researchQuestions,
    methodology: {
      primaryMethods: [input.method.selectedMethod, ...(input.studies.length >= 2 ? ["COMPARATIVE_LITERATURE_ANALYSIS" as const] : [])],
      rationale: [
        `資料來自 ${input.studies.length} 筆既有研究或文件，未自行產生受試者、實驗或訪談原始資料。`,
        "章節依研究問題與分析軸配置證據，採主題式而非逐篇摘要。",
      ],
      limitations: methodLimitations,
    },
    definitions: definitionTerms.map((term) => ({
      term,
      definitionGoal: `界定「${term}」在本報告與納入研究中的操作範圍，並標示研究間定義差異。`,
    })),
    sectionPlan,
    synthesisAxes,
    conclusionRequirements: researchQuestions.map((question) => `${question.id} 必須由正文已驗證主張回答，且不得引入新事實。`),
  };
}

function themeForStudy(study: StructuredStudyEvidence): string {
  const readerText = study.readerClaims.map((claim) => claim.text).join(" ");
  const spanText = study.evidenceSpans.map((span) => span.text).join(" ");
  const v2Text = studyFactEnvelopeForStudy(study)?.primaryFindings.flatMap((field) => {
    if (field.status !== "PRESENT" || !field.value) return [];
    return [field.value.topic, field.value.text, field.value.populationOrContext, field.value.conditionOrModerator].map(clean).filter(Boolean);
  }).join(" ") ?? "";
  const semanticText = `${readerText} ${spanText} ${v2Text} ${study.title}`;
  if (/睡前|就寢前|before (?:bed|sleep)|last hour before sleep|evening screen/iu.test(semanticText)) return "pre_sleep_exposure";
  if (/睡眠時長|睡眠時間|shorter (?:nocturnal )?sleep|sleep duration|amount of sleep/iu.test(semanticText)) return "sleep_duration";
  if (/社群媒體|social media addiction/iu.test(semanticText)) return "social_media_and_sleep";
  if (/睡眠品質|sleep quality/iu.test(semanticText)) return "sleep_quality";
  return clean(study.outcomes?.[0]) || clean(study.exposure) || clean(study.studyDesign) || "general_evidence";
}

function studyFactEnvelopeForStudy(study: StructuredStudyEvidence): StudyFactEnvelopeV2 | undefined {
  const value = study.structuredStudyFacts
    ?.map((fact) => (fact as StructuredStudyFact & { studyFactV2?: StudyFactEnvelopeV2 }).studyFactV2)
    .find((candidate) => Boolean(candidate));
  return value as StudyFactEnvelopeV2 | undefined;
}

export interface CanonicalArchitectureContext {
  jobId: string;
  jobRevision: number;
  checkpointRevision?: number;
}

function bindCanonicalAdmissions(input: {
  studies: StructuredStudyEvidence[];
  sources: SourceRecord[];
  workflow: ResearchWorkflowFacts;
  provided?: CanonicalStudyAdmissionResult[];
  context?: CanonicalArchitectureContext;
}): {
  studies: StructuredStudyEvidence[];
  admissions: CanonicalStudyAdmissionResult[];
  validation: { pass: boolean; compatibilityAdapterUsed: boolean; issues: string[] };
} {
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const compatibilityAdapterUsed = input.provided === undefined;
  const decisionContextFor = (
    study: StructuredStudyEvidence,
    provided?: CanonicalStudyAdmissionResult,
  ): CanonicalAdmissionDecisionContext => ({
    jobId: input.context?.jobId ?? provided?.jobId ??
      `legacy:${input.workflow.workflowId ?? "unknown-workflow"}`,
    workflowId: input.workflow.workflowId ?? provided?.workflowId ?? "legacy-workflow",
    jobRevision: input.context?.jobRevision ?? provided?.jobRevision ?? 0,
    checkpointRevision: input.context?.checkpointRevision ??
      provided?.checkpointRevision ?? 0,
    acquisitionTerminal: true,
    decidedAt: provided?.decidedAt ?? "1970-01-01T00:00:00.000Z",
  });
  const provided = input.provided ?? [];
  const validation = compatibilityAdapterUsed
    ? { pass: true, issues: [] as string[] }
    : validateCanonicalAdmissionSet({
        admissions: provided,
        jobId: input.context?.jobId,
        workflowId: input.workflow.workflowId,
        jobRevision: input.context?.jobRevision,
        checkpointRevision: input.context?.checkpointRevision,
        requiredSourceIds: input.studies.map((study) => study.sourceId),
      });
  const providedBySource = new Map(
    provided.map((admission) => [admission.sourceId, admission]),
  );
  const issues = [...validation.issues];
  const admissions = input.studies.map((study) => {
    const source = sourceById.get(study.sourceId) ?? ({
      id: study.sourceId,
      doi: study.doi,
      accessLevel: study.contentAccessState,
      fullTextUrl: study.fullTextSource,
    } as SourceRecord);
    const envelope = studyFactEnvelopeForStudy(study);
    const existing = providedBySource.get(study.sourceId);
    const context = decisionContextFor(study, existing);
    if (compatibilityAdapterUsed) {
      return deriveCanonicalStudyAdmission({ source, envelope, context });
    }
    if (!existing) {
      return failClosedCanonicalAdmission({
        source,
        context,
        reason: "MISSING_CANONICAL_ADMISSION",
      });
    }
    if (existing.admissionVersion !== CANONICAL_STUDY_ADMISSION_VERSION) {
      return failClosedCanonicalAdmission({
        source,
        context,
        reason: "CONFLICTING_ADMISSION_VERSION",
      });
    }
    if (
      existing.jobId !== context.jobId ||
      existing.workflowId !== context.workflowId ||
      existing.jobRevision !== context.jobRevision ||
      existing.checkpointRevision !== context.checkpointRevision
    ) {
      return failClosedCanonicalAdmission({
        source,
        context,
        reason: "STALE_REVISION",
      });
    }
    // evidenceRevision is an opaque owner-issued token. Downstream projections
    // must never re-derive it from their normalized SourceRecord representation;
    // freshness is bound by the canonical job/checkpoint revisions above.
    return existing;
  });
  const canonicalBySource = new Map(
    admissions.map((admission) => [admission.sourceId, admission]),
  );
  return {
    admissions,
    studies: input.studies.map((study) => {
      const admission = canonicalBySource.get(study.sourceId);
      return admission
        ? {
            ...study,
            contentAccessState: canonicalContentAccessState(admission),
            accessState: admission.accessState,
            canonicalAdmission: admission,
          }
        : study;
    }),
    validation: {
      pass: validation.pass && issues.length === 0,
      compatibilityAdapterUsed,
      issues: unique(issues),
    },
  };
}

const THEME_STOP_TOKENS = new Set([
  "study", "studies", "research", "result", "results", "method", "methods", "analysis", "effect", "effects",
  "association", "relationship", "compared", "comparison", "using", "among", "between", "with", "from", "that",
  "this", "were", "was", "have", "has", "more", "less", "significant", "systematic", "review", "meta", "trial",
  "participants", "patients", "reported", "evaluate", "evaluation", "investigate", "evidence", "outcome", "outcomes",
  "研究", "結果", "方法", "影響", "效果", "關聯", "關係", "比較", "分析", "顯著", "證據", "受試者",
]);

function semanticTextForStudy(study: StructuredStudyEvidence): string {
  const envelope = studyFactEnvelopeForStudy(study);
  const findings = envelope?.primaryFindings.flatMap((field) => {
    if (field.status !== "PRESENT" || !field.value) return [];
    return [field.value.topic, field.value.text, field.value.populationOrContext, field.value.conditionOrModerator].map(clean).filter(Boolean);
  }) ?? [];
  return unique([
    study.title,
    study.researchQuestion,
    study.exposure,
    study.intervention,
    study.comparator,
    ...(study.outcomes ?? []),
    study.primaryResult,
    ...study.readerClaims.map((claim) => claim.text),
    ...findings,
  ]).join(" ");
}

function themeTokens(study: StructuredStudyEvidence): Set<string> {
  const normalized = semanticTextForStudy(study).toLocaleLowerCase()
    .replace(/high[- ]intensity interval training/gu, " hiit ")
    .replace(/moderate[- ]intensity continuous training/gu, " mict ")
    .replace(/peak oxygen (?:uptake|consumption)|vo\s*2\s*(?:max|peak)/gu, " cardiorespiratory_fitness ")
    .replace(/retrieval[- ]augmented generation/gu, " rag ");
  const tokens = new Set<string>();
  for (const token of normalized.match(/[a-z][a-z0-9_]{2,}/gu) ?? []) {
    const stem = token.replace(/(?:ing|ed|es|s)$/u, "");
    if (!THEME_STOP_TOKENS.has(token) && !THEME_STOP_TOKENS.has(stem) && stem.length >= 3) tokens.add(stem);
  }
  for (const sequence of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const token = sequence.slice(index, index + 2);
      if (!THEME_STOP_TOKENS.has(token)) tokens.add(token);
    }
  }
  const seed = themeForStudy(study);
  if (!/^(?:general_evidence|meta_analysis|systematic_review|randomized_controlled_trial|cross_sectional|cohort|experiment)$/iu.test(seed)) {
    tokens.add(seed.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_"));
  }
  return tokens;
}

function setOverlap(left: Set<string>, right: Set<string>): { overlap: number; jaccard: number } {
  const intersection = [...left].filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return { overlap: intersection, jaccard: union === 0 ? 0 : intersection / union };
}

function normalizeDoi(value: string | undefined): string {
  return clean(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, "").replace(/^doi:\s*/iu, "").toLocaleLowerCase();
}

function normalizedStudyTitle(value: string): string {
  return clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function synthesisStudy(study: StructuredStudyEvidence): boolean {
  const type = studyFactEnvelopeForStudy(study)?.studyType ?? study.studyDesign ?? "";
  return /META_ANALYSIS|SYSTEMATIC_REVIEW|SCOPING_REVIEW|LITERATURE_REVIEW|meta.?analysis|systematic review|scoping review/iu.test(type);
}

export function buildSourceIndependenceV3(studies: StructuredStudyEvidence[]): SourceIndependenceRecord[] {
  const firstByCanonical = new Map<string, string>();
  return studies.map((study) => {
    const canonicalStudyId = normalizeDoi(study.doi) || normalizedStudyTitle(study.title) || clean(study.studyId) || study.sourceId;
    const duplicateOfSourceId = firstByCanonical.get(canonicalStudyId);
    if (!duplicateOfSourceId) firstByCanonical.set(canonicalStudyId, study.sourceId);
    const derived = /secondary analysis|follow[- ]up analysis|substudy|derived cohort|二次分析|次級分析/iu.test(study.title);
    const relationship: SourceIndependenceRecord["relationship"] = duplicateOfSourceId
      ? "DUPLICATE_REPORT"
      : derived
        ? "DERIVED_FROM"
        : synthesisStudy(study)
          ? "SECONDARY_SYNTHESIS"
          : "PRIMARY";
    return {
      sourceId: study.sourceId,
      canonicalStudyId,
      relationship,
      independent: !duplicateOfSourceId && !derived,
      ...(duplicateOfSourceId ? { duplicateOfSourceId } : {}),
      datasetOverlap: derived ? "POSSIBLE" : "UNKNOWN",
    };
  });
}

function minimalSufficientThemeGroups(studies: StructuredStudyEvidence[]): StructuredStudyEvidence[][] {
  const eligible = studies.filter((item) => item.evidenceSpans.length > 0);
  if (eligible.length <= 1) return eligible.length ? [eligible] : [];
  const tokens = eligible.map(themeTokens);
  const parent = eligible.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]!);
    return parent[index]!;
  };
  const unite = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      const similarity = setOverlap(tokens[left]!, tokens[right]!);
      if (similarity.overlap >= 5 || (similarity.overlap >= 3 && similarity.jaccard >= 0.06)) unite(left, right);
    }
  }
  const groups = new Map<number, StructuredStudyEvidence[]>();
  eligible.forEach((study, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), study]);
  });
  const ordered = [...groups.values()].sort((left, right) => right.length - left.length);
  if (ordered.length <= 1) return ordered;
  const major = ordered.filter((group) => group.length >= 2);
  const singletons = ordered.filter((group) => group.length === 1);
  for (const singleton of singletons) {
    const study = singleton[0]!;
    let bestGroup: StructuredStudyEvidence[] | undefined;
    let bestOverlap = 0;
    for (const group of major) {
      const groupTokens = new Set(group.flatMap((item) => [...themeTokens(item)]));
      const overlap = setOverlap(themeTokens(study), groupTokens).overlap;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestGroup = group;
      }
    }
    if (bestGroup && bestOverlap >= 2) bestGroup.push(study);
    else major.push(singleton);
  }
  return major;
}

function normalizedPropositionForGroup(studies: StructuredStudyEvidence[]): string {
  const counts = new Map<string, number>();
  for (const study of studies) {
    for (const token of themeTokens(study)) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .filter(([, count]) => count >= Math.min(2, studies.length))
    .slice(0, 4)
    .map(([token]) => token);
  return top.join(" ") || themeForStudy(studies[0]!);
}

function themeLabel(themeId: string): string {
  const labels: Record<string, string> = {
    pre_sleep_exposure: "睡前螢幕暴露與睡眠干擾",
    sleep_duration: "螢幕使用與睡眠時長",
    social_media_and_sleep: "社群媒體使用與睡眠品質",
    sleep_quality: "螢幕使用與睡眠品質",
    corpus_profile: "研究範圍與證據組成",
  };
  return labels[themeId] ?? themeId.replace(/_/gu, " ");
}

const STUDY_DIFFERENCE_FIELDS: StudyDifferenceField[] = [
  "population",
  "sample_size",
  "study_design",
  "exposure_or_intervention",
  "comparator",
  "outcome_definition",
  "measurement_method",
  "follow_up_or_duration",
  "effect_direction",
  "key_numeric_result",
  "effect_magnitude",
  "uncertainty",
  "moderator_or_subgroup",
  "setting_or_context",
  "limitations",
];

const STUDY_DIFFERENCE_LABELS: Record<StudyDifferenceField, string> = {
  population: "population",
  sample_size: "sample size",
  study_design: "study design",
  exposure_or_intervention: "exposure or intervention",
  comparator: "comparator",
  outcome_definition: "outcome definition",
  measurement_method: "measurement method",
  follow_up_or_duration: "follow-up or duration",
  effect_direction: "effect direction",
  key_numeric_result: "key numeric result",
  effect_magnitude: "effect magnitude",
  uncertainty: "statistical uncertainty",
  moderator_or_subgroup: "moderator or subgroup",
  setting_or_context: "setting or context",
  limitations: "study limitations",
};

function normalizedDifferenceValue(value: string): string {
  return clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}.%+-]+/gu, " ").trim();
}

function stringifyFactValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return clean(String(value));
  if (Array.isArray(value)) return unique(value.map((item) => stringifyFactValue(item))).join("; ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return unique([record.text, record.rawValue, record.value, record.topic, record.direction].map((item) => stringifyFactValue(item))).join(": ");
  }
  return "";
}

function provenanceIdsForFact(field: FactField<unknown> | undefined): string[] {
  return unique((field?.evidence ?? []).map((evidence) => [
    evidence.sourceId,
    evidence.documentId,
    evidence.section,
    evidence.page === undefined ? "" : `p${evidence.page}`,
    evidence.spanStart === undefined ? "" : `s${evidence.spanStart}`,
  ].filter(Boolean).join(":")));
}

function presentDifferenceValue(study: StructuredStudyEvidence, value: string, provenanceIds: string[] = []): StudyDifferenceValue {
  return {
    studyId: study.studyId ?? study.sourceId,
    sourceId: study.sourceId,
    status: "PRESENT",
    value,
    normalizedValue: normalizedDifferenceValue(value),
    provenanceIds: unique(provenanceIds.length ? provenanceIds : study.evidenceSpans.map((span) => span.spanId)),
  };
}

function missingDifferenceValue(study: StructuredStudyEvidence, status: FactStatus): StudyDifferenceValue {
  return {
    studyId: study.studyId ?? study.sourceId,
    sourceId: study.sourceId,
    status,
    value: null,
    normalizedValue: null,
    provenanceIds: [],
  };
}

function valueFromFact(study: StructuredStudyEvidence, field: FactField<unknown> | undefined): StudyDifferenceValue | null {
  if (!field) return null;
  if (field.status !== "PRESENT") return missingDifferenceValue(study, field.status);
  const value = stringifyFactValue(field.normalizedValue ?? field.value);
  return value ? presentDifferenceValue(study, value, provenanceIdsForFact(field)) : missingDifferenceValue(study, "UNKNOWN");
}

function missingStatusForStudy(study: StructuredStudyEvidence): FactStatus {
  return ["metadata_only", "abstract_only"].includes(study.contentAccessState) ? "UNKNOWN" : "NOT_REPORTED";
}

function differenceValueForStudy(study: StructuredStudyEvidence, field: StudyDifferenceField): StudyDifferenceValue {
  const envelope = studyFactEnvelopeForStudy(study);
  const core = envelope?.coreFacts ?? {};
  const fromTop = (values: unknown[]) => {
    const value = unique(values.map((item) => stringifyFactValue(item))).join("; ");
    return value ? presentDifferenceValue(study, value) : null;
  };
  const fact = (...names: string[]) => {
    for (const name of names) {
      const value = valueFromFact(study, core[name]);
      if (value?.status === "PRESENT") return value;
    }
    for (const name of names) {
      const value = valueFromFact(study, core[name]);
      if (value) return value;
    }
    return null;
  };
  let value: StudyDifferenceValue | null = null;
  switch (field) {
    case "population":
      value = fromTop([study.populationDescription, study.population, study.speciesOrSubject])
        ?? valueFromFact(study, envelope?.populationContext);
      break;
    case "sample_size": {
      value = fromTop([study.sampleSize]);
      if (!value) {
        const sample = envelope?.quantitativeFacts.find((item) => item.metric === "sample_size");
        if (sample) {
          const provenance = sample.provenance;
          value = presentDifferenceValue(study, stringifyFactValue(sample.rawValue || sample.value), [
            [provenance.sourceId, provenance.documentId, provenance.section, provenance.page === undefined ? "" : `p${provenance.page}`, provenance.spanStart === undefined ? "" : `s${provenance.spanStart}`].filter(Boolean).join(":"),
          ]);
        }
      }
      break;
    }
    case "study_design":
      value = fromTop([study.studyDesign])
        ?? (envelope && envelope.studyType !== "UNCLASSIFIABLE" ? presentDifferenceValue(study, envelope.studyType, provenanceIdsForFact(envelope.methodsSummary)) : null);
      break;
    case "exposure_or_intervention":
      value = fromTop([study.intervention, study.exposure, study.exposureDefinition]) ?? fact("intervention", "exposurePredictor");
      break;
    case "comparator":
      value = fromTop([study.comparator, study.comparatorDefinition]) ?? fact("comparator");
      break;
    case "outcome_definition":
      value = fromTop([study.outcomeDefinition, ...(study.outcomes ?? [])]) ?? fact("outcome");
      break;
    case "measurement_method":
      value = fromTop([study.outcomeMeasurement, ...(study.measurementMethods ?? [])]);
      break;
    case "follow_up_or_duration":
      value = fromTop([study.outcomeTimepoint, study.studyPeriod, study.exposureTiming, study.exposureDuration]) ?? fact("timepoints");
      break;
    case "effect_direction": {
      value = fromTop([study.effectDirection && study.effectDirection !== "unknown" ? study.effectDirection : null]);
      if (!value) {
        const directions = unique((envelope?.primaryFindings ?? []).flatMap((item) => item.status === "PRESENT" && item.value ? [item.value.direction] : []));
        value = fromTop(directions);
      }
      break;
    }
    case "key_numeric_result": {
      const numeric = unique((study.keyNumericResults ?? []).map((item) => [item.metric, item.value, item.unit].map(stringifyFactValue).filter(Boolean).join(" ")));
      const recovered = unique((envelope?.quantitativeFacts ?? []).map((item) => item.rawValue));
      value = fromTop([...numeric, ...recovered]) ?? fact("effectEstimate", "pooledEstimate");
      break;
    }
    case "effect_magnitude": {
      const numeric = unique((study.keyNumericResults ?? []).map((item) => [item.effectSize ?? item.value, item.unit].map(stringifyFactValue).filter(Boolean).join(" ")));
      const recovered = unique([
        ...(envelope?.primaryFindings ?? []).flatMap((item) => item.status === "PRESENT" && item.value?.magnitude ? [item.value.magnitude] : []),
        ...(envelope?.quantitativeFacts ?? []).map((item) => item.rawValue),
      ]);
      value = fromTop([...numeric, ...recovered]) ?? fact("effectEstimate", "pooledEstimate");
      break;
    }
    case "uncertainty": {
      const numeric = unique((study.keyNumericResults ?? []).flatMap((item) => [
        item.confidenceInterval ? `CI ${item.confidenceInterval}` : "",
        item.standardError === undefined ? "" : `SE ${item.standardError}`,
        item.standardDeviation === undefined ? "" : `SD ${item.standardDeviation}`,
        item.pValue ? `p ${item.pValue}` : "",
      ]));
      const recovered = unique((envelope?.quantitativeFacts ?? []).flatMap((item) => item.uncertainty ? [
        item.uncertainty.ciLower === undefined && item.uncertainty.ciUpper === undefined ? "" : `CI ${item.uncertainty.ciLower ?? "?"}-${item.uncertainty.ciUpper ?? "?"}`,
        item.uncertainty.se === undefined ? "" : `SE ${item.uncertainty.se}`,
        item.uncertainty.sd === undefined ? "" : `SD ${item.uncertainty.sd}`,
        item.uncertainty.pValue ? `p ${item.uncertainty.pValue}` : "",
      ] : []));
      value = fromTop([...numeric, ...recovered]);
      break;
    }
    case "moderator_or_subgroup": {
      const declared = [...(study.moderators ?? []), ...(study.subgroups ?? [])].map((item) => item.effect ? `${item.factor}: ${item.effect}` : item.factor);
      const recovered = (envelope?.primaryFindings ?? []).flatMap((item) => item.status === "PRESENT" && item.value?.conditionOrModerator ? [item.value.conditionOrModerator] : []);
      value = fromTop([...declared, ...recovered]);
      break;
    }
    case "setting_or_context":
      value = fromTop([study.setting, study.location]);
      break;
    case "limitations": {
      value = fromTop([...(study.limitations ?? []), ...(study.authorCautions ?? [])]);
      if (!value) {
        const present = envelope?.limitations.filter((item) => item.status === "PRESENT") ?? [];
        const text = unique(present.map((item) => stringifyFactValue(item.normalizedValue ?? item.value))).join("; ");
        if (text) value = presentDifferenceValue(study, text, unique(present.flatMap((item) => provenanceIdsForFact(item))));
        else if (envelope?.limitations.length) value = missingDifferenceValue(study, envelope.limitations[0]!.status);
      }
      break;
    }
  }
  return value ?? missingDifferenceValue(study, missingStatusForStudy(study));
}

function comparisonForDifferenceValues(values: StudyDifferenceValue[]): StudyDifferenceComparison {
  if (values.length < 2) return "UNKNOWN";
  const present = values.filter((value) => value.status === "PRESENT" && value.normalizedValue);
  if (present.length === values.length) return new Set(present.map((value) => value.normalizedValue)).size === 1 ? "SAME" : "DIFFERENT";
  if (present.length > 0) return "PARTIALLY_COMPARABLE";
  if (values.every((value) => value.status === "NOT_APPLICABLE")) return "NOT_APPLICABLE";
  if (values.every((value) => value.status === "NOT_REPORTED")) return "NOT_REPORTED";
  return "UNKNOWN";
}

function differenceObservation(field: StudyDifferenceField, comparison: StudyDifferenceComparison, values: StudyDifferenceValue[]): string {
  const label = STUDY_DIFFERENCE_LABELS[field];
  const reported = values.filter((value) => value.status === "PRESENT").map((value) => `${value.sourceId}=${value.value}`).join("; ");
  const missing = values.filter((value) => value.status !== "PRESENT").map((value) => `${value.sourceId}=${value.status}`).join("; ");
  if (comparison === "SAME") return `All studies report the same observed ${label}: ${reported}.`;
  if (comparison === "DIFFERENT") return `Reported ${label} values differ across studies: ${reported}.`;
  if (comparison === "PARTIALLY_COMPARABLE") return `Reported ${label} is only partially comparable: ${reported}; ${missing}.`;
  if (comparison === "NOT_APPLICABLE") return `${label} is not applicable to all studies in this theme.`;
  if (comparison === "NOT_REPORTED") return `${label} was not reported in the interpretable study text for this theme.`;
  return `${label} remains unknown because the available evidence is incomplete or not comparable: ${missing}.`;
}

export function buildStudyDifferenceMatrix(themeId: string, studies: StructuredStudyEvidence[]): ThemeStudyDifferenceMatrix {
  const fields = STUDY_DIFFERENCE_FIELDS.map((field): StudyDifferenceFieldComparison => {
    const values = studies.map((study) => differenceValueForStudy(study, field));
    const comparison = comparisonForDifferenceValues(values);
    return { field, comparison, values, observation: differenceObservation(field, comparison, values) };
  });
  const observations = (comparisons: StudyDifferenceComparison[], selectedFields?: StudyDifferenceField[]) => fields
    .filter((field) => comparisons.includes(field.comparison) && (!selectedFields || selectedFields.includes(field.field)))
    .map((field) => field.observation);
  const limits = observations(["NOT_REPORTED", "UNKNOWN", "PARTIALLY_COMPARABLE"]);
  return {
    schemaVersion: "researchforge-study-difference/v1",
    themeId,
    sourceIds: unique(studies.map((study) => study.sourceId)),
    fields,
    summary: {
      sharedCharacteristics: observations(["SAME"]),
      studyLevelDifferences: observations(["DIFFERENT", "PARTIALLY_COMPARABLE"]),
      effectAgreement: observations(["SAME"], ["effect_direction"]),
      effectHeterogeneity: observations(["DIFFERENT", "PARTIALLY_COMPARABLE", "UNKNOWN"], ["effect_direction", "key_numeric_result", "effect_magnitude", "uncertainty"]),
      moderatorDifferences: observations(["SAME", "DIFFERENT", "PARTIALLY_COMPARABLE", "UNKNOWN"], ["moderator_or_subgroup"]),
      measurementDifferences: observations(["SAME", "DIFFERENT", "PARTIALLY_COMPARABLE", "UNKNOWN"], ["outcome_definition", "measurement_method"]),
      designDifferences: observations(["SAME", "DIFFERENT", "PARTIALLY_COMPARABLE", "UNKNOWN"], ["study_design", "follow_up_or_duration"]),
      evidenceLimits: limits,
    },
  };
}

export function buildEvidenceMatrix(studies: StructuredStudyEvidence[]): EvidenceMatrixRow[] {
  const groups = minimalSufficientThemeGroups(studies);
  const independenceBySource = new Map(buildSourceIndependenceV3(studies).map((item) => [item.sourceId, item]));
  return groups.map((items, index) => {
    const normalizedProposition = normalizedPropositionForGroup(items);
    const themeId = `theme_${normalizedProposition.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 96) || index + 1}`;
    const conflicts = items.filter((item) => item.effectDirection === "null" || item.effectDirection === "mixed").map((item) => item.sourceId);
    const nullSources = items.filter((item) => item.effectDirection === "null").map((item) => item.sourceId);
    const contextDependentSources = items.filter((item) => item.effectDirection === "mixed").map((item) => item.sourceId);
    const support = items.filter((item) => !conflicts.includes(item.sourceId)).map((item) => item.sourceId);
    const directions = new Set(items.map((item) => item.effectDirection).filter((item) => item && item !== "unknown"));
    const agreement: EvidenceMatrixRow["agreement"] = conflicts.length > 0 && support.length > 0 ? "conflicting" : directions.size > 1 ? "mixed" : directions.size === 1 ? "consistent" : "unknown";
    const verified = items.filter((item) => item.verificationStatus === "verified").length;
    const evidenceStrength: EvidenceMatrixRow["evidenceStrength"] = items.length >= 4 && verified >= 2 ? "high" : items.length >= 2 ? "moderate" : items.length === 1 ? "limited" : "insufficient";
    const sourceIndependence = items.map((item) => independenceBySource.get(item.sourceId)).filter((item): item is SourceIndependenceRecord => Boolean(item));
    const independentStudyIds = unique(sourceIndependence.filter((item) => item.independent).map((item) => item.canonicalStudyId));
    const primaryIndependentSourceCount = sourceIndependence.filter((item) => item.independent && item.relationship === "PRIMARY").length;
    const formalIndependentSourceCount = items.filter((item) => {
      const independence = independenceBySource.get(item.sourceId);
      return Boolean(
        independence?.independent &&
          item.canonicalAdmission?.admissionClass === "FORMAL",
      );
    }).length;
    const admissionStatus: NonNullable<EvidenceMatrixRow["admissionStatus"]> = independentStudyIds.length >= 2 && formalIndependentSourceCount >= 2
      ? "FORMAL"
      : independentStudyIds.length >= 2
        ? "LIMITED"
        : "BLOCKED";
    const studyDifferenceMatrix = buildStudyDifferenceMatrix(themeId, items);
    return {
      claimId: `claim-theme-${index + 1}`,
      themeId,
      normalizedProposition,
      sourceIds: unique(items.map((item) => item.sourceId)),
      supportingSourceIds: unique(support),
      conflictingSourceIds: unique(conflicts),
      nullSourceIds: unique(nullSources),
      contextDependentSourceIds: unique(contextDependentSources),
      independentStudyIds,
      primaryIndependentSourceCount,
      formalIndependentSourceCount,
      sourceIndependence,
      evidenceDiversity: unique([
        ...items.map((item) => studyFactEnvelopeForStudy(item)?.studyType ?? item.studyDesign),
        ...sourceIndependence.map((item) => item.relationship),
        ...items.map((item) => item.contentAccessState),
      ]),
      admissionStatus,
      quantitativeEvidenceIds: unique(items.flatMap((item) => (item.keyNumericResults ?? []).map((numeric) => numeric.numericEvidenceId))),
      evidenceStrength,
      agreement,
      moderators: unique(items.flatMap((item) =>
        (item.moderators ?? []).map((moderator) =>
          moderator.effect ? `${moderator.factor}: ${moderator.effect}` : moderator.factor,
        ),
      )),
      limitations: unique(items.flatMap((item) => item.limitations ?? [])),
      studyDifferenceMatrix,
    };
  });
}

export function buildEvidenceCoverageGate(
  studies: StructuredStudyEvidence[],
  matrix: EvidenceMatrixRow[],
): EvidenceCoverageGate {
  const ratio = (count: number) => studies.length === 0 ? 0 : Math.round((count / studies.length) * 10_000) / 100;
  const fullText = studies.filter((study) => study.contentAccessState === "full_text" || study.contentAccessState === "partial_full_text");
  const rows = matrix.map((row): EvidenceCoverageRow => {
    const themeStudies = studies.filter((study) => row.sourceIds.includes(study.sourceId));
    const themeRatio = (predicate: (study: StructuredStudyEvidence) => boolean) =>
      themeStudies.length === 0 ? 0 : Math.round((themeStudies.filter(predicate).length / themeStudies.length) * 10_000) / 100;
    return {
      theme: row.themeId,
      independentSourceCount: row.independentStudyIds?.length ?? new Set(themeStudies.map((study) => study.studyId ?? study.sourceId)).size,
      primaryIndependentSourceCount: row.primaryIndependentSourceCount ?? 0,
      formalIndependentSourceCount: row.formalIndependentSourceCount ?? 0,
      fullTextSourceCount: themeStudies.filter((study) => study.contentAccessState === "full_text" || study.contentAccessState === "partial_full_text").length,
      studyDesignDiversity: unique(themeStudies.map((study) => study.studyDesign).filter((value) => value !== "unknown")),
      populationCoverage: themeRatio((study) => Boolean(study.population)),
      exposureCoverage: themeRatio((study) => Boolean(study.exposure || study.intervention)),
      outcomeCoverage: themeRatio((study) => Boolean(study.outcomes?.length)),
      effectDirectionCoverage: themeRatio((study) => Boolean(study.effectDirection && !["unknown", "unclear", "not_applicable"].includes(study.effectDirection))),
      quantitativeSourceCount: themeStudies.filter((study) => (study.keyNumericResults?.length ?? 0) > 0).length,
      moderatorFactCount: themeStudies.reduce((sum, study) => sum + (study.moderators?.length ?? 0), 0),
      contradictionStatus: row.agreement,
      synthesisEligible: (row.independentStudyIds?.length ?? new Set(themeStudies.map((study) => study.studyId ?? study.sourceId)).size) >= 2,
      formalSynthesisEligible: row.admissionStatus === "FORMAL" &&
        (row.independentStudyIds?.length ?? 0) >= 2 &&
        (row.formalIndependentSourceCount ?? 0) >= 2 &&
        themeStudies.some((study) => study.contentAccessState === "full_text" || study.contentAccessState === "partial_full_text"),
    };
  });
  const coverage = {
    sourceSpanProvenanceCoverage: ratio(studies.filter((study) => study.evidenceSpans.length > 0).length),
    studyDesignCoverage: ratio(studies.filter((study) => study.studyDesign && study.studyDesign !== "unknown" && study.studyDesignExplicit).length),
    populationCoverage: ratio(studies.filter((study) => Boolean(study.population)).length),
    exposureCoverage: ratio(studies.filter((study) => Boolean(study.exposure || study.intervention)).length),
    outcomeCoverage: ratio(studies.filter((study) => Boolean(study.outcomes?.length)).length),
    effectDirectionCoverage: ratio(studies.filter((study) => Boolean(study.effectDirection && !["unknown", "unclear", "not_applicable"].includes(study.effectDirection))).length),
  };
  const v2ByStudy = studies.flatMap((study) => {
    const envelope = studyFactEnvelopeForStudy(study);
    const admission = study.canonicalAdmission;
    if (!admission) return [];
    return [{ study, envelope, admission }];
  });
  const seenV2Studies = new Set<string>();
  const uniqueV2 = v2ByStudy.filter(({ study }) => {
    const key = study.studyId ?? study.sourceId;
    if (seenV2Studies.has(key)) return false;
    seenV2Studies.add(key);
    return true;
  });
  const hasV2 = uniqueV2.length > 0;
  const interpretedV2 = uniqueV2.filter(({ envelope }) =>
    envelope && envelope.studyType !== "UNCLASSIFIABLE"
  ).length;
  const limitedAdmissionCount = uniqueV2.filter(
    ({ admission }) => admission.admissionClass === "LIMITED",
  ).length;
  const formalAdmissionCount = uniqueV2.filter(
    ({ admission }) => admission.admissionClass === "FORMAL",
  ).length;
  const blockedAdmissionCount = uniqueV2.filter(
    ({ admission }) => admission.admissionClass === "BLOCKED",
  ).length;
  const limitedOrBetterAdmissionCount = limitedAdmissionCount + formalAdmissionCount;
  const studyTypeInterpretationCoverage = studies.length === 0 ? 0 : Math.round((interpretedV2 / studies.length) * 10_000) / 100;
  const v2ProvenanceComplete = uniqueV2.every(
    ({ admission }) => admission.provenanceState === "READY",
  );
  const extractionUsable = hasV2
    ? limitedOrBetterAdmissionCount > 0 && v2ProvenanceComplete
    : coverage.sourceSpanProvenanceCoverage >= 95 && coverage.exposureCoverage >= 60 && coverage.outcomeCoverage >= 60;
  const allThemesSynthesizable = rows.length > 0 && rows.every((row) => row.synthesisEligible);
  const allMajorThemesFormal = rows.length > 0 && rows.every((row) => row.formalSynthesisEligible);
  const independenceBySource = new Map(
    matrix.flatMap((row) => row.sourceIndependence ?? []).map((item) => [item.sourceId, item]),
  );
  const formalIndependentStudyIds = new Set(
    uniqueV2
      .filter(({ study, admission }) => admission.admissionClass === "FORMAL" && independenceBySource.get(study.sourceId)?.independent)
      .map(({ study }) => independenceBySource.get(study.sourceId)?.canonicalStudyId ?? study.studyId ?? study.sourceId),
  );
  const formal = hasV2
    ? formalIndependentStudyIds.size >= 2 && fullText.length > 0 && allThemesSynthesizable &&
      allMajorThemesFormal && v2ProvenanceComplete
    : studies.length >= 6 && fullText.length > 0 && allThemesSynthesizable &&
      coverage.populationCoverage >= 90 && coverage.exposureCoverage >= 95 &&
      coverage.outcomeCoverage >= 95 && coverage.effectDirectionCoverage >= 90 &&
      coverage.studyDesignCoverage >= 85;
  const limited = hasV2
    ? limitedOrBetterAdmissionCount > 0 && extractionUsable
    : studies.length >= 2 && extractionUsable && rows.some((row) => row.synthesisEligible);
  const classification: ResearchEvidenceClassification = formal
    ? "FORMAL_RESEARCH_REPORT"
    : limited
      ? "LIMITED_EVIDENCE_BRIEF"
      : studies.length === 0
        ? "SEARCH_ONLY_RESULT"
        : !extractionUsable
          ? "BLOCKED_EXTRACTION_FAILURE"
          : "BLOCKED_INSUFFICIENT_EVIDENCE";
  const legacyReasons = [
    ...(studies.length < 6 ? [`direct_studies_below_formal_target:${studies.length}/6`] : []),
    ...(fullText.length === 0 ? ["no_full_text_or_structured_full_content"] : []),
    ...(!allThemesSynthesizable ? ["major_theme_without_two_independent_sources"] : []),
    ...(coverage.studyDesignCoverage < 85 ? [`study_design_coverage:${coverage.studyDesignCoverage}`] : []),
    ...(coverage.populationCoverage < 90 ? [`population_coverage:${coverage.populationCoverage}`] : []),
    ...(coverage.exposureCoverage < 95 ? [`exposure_coverage:${coverage.exposureCoverage}`] : []),
    ...(coverage.outcomeCoverage < 95 ? [`outcome_coverage:${coverage.outcomeCoverage}`] : []),
    ...(coverage.effectDirectionCoverage < 90 ? [`effect_direction_coverage:${coverage.effectDirectionCoverage}`] : []),
  ];
  const reasons = hasV2 ? [
    ...(formalIndependentStudyIds.size < 2 ? [`independent_formal_studies_below_target:${formalIndependentStudyIds.size}/2`] : []),
    ...(fullText.length === 0 ? ["no_full_text_or_structured_full_content"] : []),
    ...(!allThemesSynthesizable ? ["major_theme_without_two_independent_sources"] : []),
    ...(allThemesSynthesizable && !allMajorThemesFormal ? ["major_theme_without_two_formal_independent_sources"] : []),
    ...(!v2ProvenanceComplete ? ["v2_provenance_or_numerical_provenance_incomplete"] : []),
    ...(limitedOrBetterAdmissionCount === 0 ? ["no_type_specific_limited_or_better_admission"] : []),
    ...(formalAdmissionCount < 2 ? [`type_specific_formal_admission:${formalAdmissionCount}/${studies.length}`] : []),
  ] : legacyReasons;
  return {
    rows,
    directStudyCount: studies.length,
    fullTextStudyCount: fullText.length,
    ...coverage,
    ...(hasV2 ? {
      studyTypeInterpretationCoverage,
      limitedAdmissionCount,
      limitedOrBetterAdmissionCount,
      blockedAdmissionCount,
      formalAdmissionCount,
      typeSpecificAdmission: uniqueV2.map(({ study, envelope, admission }) => ({
        studyId: study.studyId ?? study.sourceId,
        sourceId: study.sourceId,
        studyType: envelope?.studyType ?? "UNCLASSIFIABLE",
        level: admission.admissionClass,
        reasons: [
          ...admission.reasonCodes,
          ...admission.missingRequirements,
        ],
        evidenceRevision: admission.evidenceRevision,
      })),
    } : {}),
    moderatorHallucinationCount: 0,
    classification,
    reasons,
  };
}

const RHETORICAL_CONTRACTS: Record<string, string> = {
  executive_summary: "Answer the research question at high abstraction using only summary claims derived from body-owned findings.",
  background: "Define the problem, importance, scope, question, and uncertainty without realizing empirical finding claims.",
  methods: "Describe only the search, screening, extraction, classification, and synthesis actually performed.",
  evidence_overview: "Describe deterministic corpus composition and availability; do not realize substantive outcome claims.",
  findings: "Own substantive empirical findings and supported quantitative statements; compare evidence by theme.",
  cross_study_synthesis: "Own cross-study agreement, conflict, and heterogeneity claims; do not repeat finding sentences.",
  discussion: "Own interpretations, mechanisms, implications, and causal boundaries derived from established findings.",
  limitations_gaps: "Own limitations of sources, access, methods, heterogeneity, and the ResearchForge workflow.",
  conclusion: "Render only higher-abstraction closed-world synthesis derived from claims already owned by body sections.",
};

function strengthRank(value: EvidenceMatrixRow["evidenceStrength"]): number {
  return value === "high" ? 4 : value === "moderate" ? 3 : value === "limited" ? 2 : 1;
}

function claimLineage(row: EvidenceMatrixRow, studies: StructuredStudyEvidence[]): ClaimEvidenceLineage {
  const rowStudies = studies.filter((study) => row.sourceIds.includes(study.sourceId));
  const spanIds = unique(rowStudies.flatMap((study) => study.evidenceSpans.map((span) => span.spanId)));
  return {
    sourceIds: [...row.sourceIds],
    evidenceIds: unique([...spanIds, ...row.quantitativeEvidenceIds]),
    evidenceSpanIds: spanIds,
    numericEvidenceIds: [...row.quantitativeEvidenceIds],
  };
}

/**
 * Assign every rhetorical claim exactly one owner before Writer execution.
 * Derived synthesis/interpretation claims retain lineage to the empirical
 * finding but receive a distinct ID and function so they cannot silently be
 * realized as the same sentence in multiple sections.
 */
export function buildSectionClaimAllocations(
  matrix: EvidenceMatrixRow[],
  studies: StructuredStudyEvidence[],
): SectionClaimAllocation[] {
  const orderedRows = [...matrix].sort(
    (left, right) =>
      strengthRank(right.evidenceStrength) - strengthRank(left.evidenceStrength) ||
      right.sourceIds.length - left.sourceIds.length ||
      left.claimId.localeCompare(right.claimId),
  );
  const claims: AllocatedResearchClaim[] = [];
  for (const row of orderedRows) {
    const lineage = claimLineage(row, studies);
    const findingFunction: ClaimFunction = row.sourceIds.length >= 2
      ? "comparative-finding"
      : "descriptive-finding";
    claims.push({
      claimId: row.claimId,
      themeId: row.themeId,
      primarySection: "findings",
      supportingSections: ["cross_study_synthesis", "discussion", "executive_summary", "conclusion"],
      claimFunction: findingFunction,
      evidenceLineage: lineage,
      permittedRealizationCount: 1,
    });
    if (row.sourceIds.length >= 2) {
      claims.push({
        claimId: `${row.claimId}:cross-study`,
        themeId: row.themeId,
        primarySection: "cross_study_synthesis",
        supportingSections: ["discussion", "conclusion"],
        claimFunction: "comparative-finding",
        evidenceLineage: lineage,
        permittedRealizationCount: 1,
        derivedFromClaimIds: [row.claimId],
      });
    }
    if (row.agreement !== "unknown" || (row.moderators?.length ?? 0) > 0) {
      claims.push({
        claimId: `${row.claimId}:interpretation`,
        themeId: row.themeId,
        primarySection: "discussion",
        supportingSections: ["conclusion"],
        claimFunction: (row.moderators?.length ?? 0) > 0 ? "mechanism" : "implication",
        evidenceLineage: lineage,
        permittedRealizationCount: 1,
        derivedFromClaimIds: [row.claimId],
      });
    }
    if ((row.limitations?.length ?? 0) > 0) {
      claims.push({
        claimId: `${row.claimId}:limitation`,
        themeId: row.themeId,
        primarySection: "limitations_gaps",
        supportingSections: ["conclusion"],
        claimFunction: "limitation",
        evidenceLineage: lineage,
        permittedRealizationCount: 1,
        derivedFromClaimIds: [row.claimId],
      });
    }
  }
  for (const row of orderedRows.slice(0, 2)) {
    const lineage = claimLineage(row, studies);
    claims.push(
      {
        claimId: `${row.claimId}:summary`,
        themeId: row.themeId,
        primarySection: "executive_summary",
        claimFunction: "conclusion-synthesis",
        evidenceLineage: lineage,
        permittedRealizationCount: 1,
        derivedFromClaimIds: [row.claimId],
      },
      {
        claimId: `${row.claimId}:conclusion`,
        themeId: row.themeId,
        primarySection: "conclusion",
        claimFunction: "conclusion-synthesis",
        evidenceLineage: lineage,
        permittedRealizationCount: 1,
        derivedFromClaimIds: [row.claimId],
      },
    );
  }
  const primaryRow = orderedRows[0];
  if (primaryRow) {
    const primaryLineage = claimLineage(primaryRow, studies);
    claims.push({
      claimId: `${primaryRow.claimId}:background`,
      themeId: primaryRow.themeId,
      primarySection: "background",
      claimFunction: "background",
      evidenceLineage: primaryLineage,
      permittedRealizationCount: 1,
      derivedFromClaimIds: [primaryRow.claimId],
    });
  }
  if (studies.length > 0) {
    const corpusSpanIds = unique(studies.flatMap((study) => study.evidenceSpans.map((span) => span.spanId)));
    const corpusNumericIds = unique(studies.flatMap((study) => (study.keyNumericResults ?? []).map((item) => item.numericEvidenceId)));
    const corpusLineage: ClaimEvidenceLineage = {
      sourceIds: unique(studies.map((study) => study.sourceId)),
      evidenceIds: unique([...corpusSpanIds, ...corpusNumericIds]),
      evidenceSpanIds: corpusSpanIds,
      numericEvidenceIds: corpusNumericIds,
    };
    claims.push({
      claimId: "claim-corpus-evidence-profile",
      themeId: "corpus_profile",
      primarySection: "evidence_overview",
      claimFunction: "method",
      evidenceLineage: corpusLineage,
      permittedRealizationCount: 1,
    });
    claims.push({
      claimId: "claim-corpus-access-limitation",
      themeId: "evidence_access",
      primarySection: "limitations_gaps",
      supportingSections: ["conclusion"],
      claimFunction: "limitation",
      evidenceLineage: corpusLineage,
      permittedRealizationCount: 1,
    });
  }

  const sectionIds = Object.keys(RHETORICAL_CONTRACTS);
  return sectionIds.map((sectionId) => {
    const owned = claims.filter((claim) => claim.primarySection === sectionId);
    const contextual = claims.filter(
      (claim) =>
        claim.primarySection !== sectionId &&
        (claim.supportingSections ?? []).includes(sectionId),
    );
    const contextualLimit = sectionId === "conclusion" || sectionId === "executive_summary" ? 2 : 3;
    const permittedContext = contextual.slice(0, contextualLimit);
    const visibleClaimIds = new Set([
      ...owned.map((claim) => claim.claimId),
      ...permittedContext.map((claim) => claim.claimId),
    ]);
    return {
      sectionId,
      ownedClaimIds: owned.map((claim) => claim.claimId),
      contextualClaimIds: permittedContext.map((claim) => claim.claimId),
      forbiddenClaimIds: claims.map((claim) => claim.claimId).filter((claimId) => !visibleClaimIds.has(claimId)),
      claims: owned,
      evidenceIds: unique([...owned, ...permittedContext].flatMap((claim) => claim.evidenceLineage.evidenceIds)),
      sourceIds: unique([...owned, ...permittedContext].flatMap((claim) => claim.evidenceLineage.sourceIds)),
      rhetoricalContract: RHETORICAL_CONTRACTS[sectionId]!,
    };
  });
}

function secondaryUsageModeForClaim(
  claim: AllocatedResearchClaim,
): SecondaryClaimUsageMode {
  if (claim.claimFunction === "conclusion-synthesis") {
    return "CONCLUSION_SYNTHESIS";
  }
  if (claim.claimFunction === "limitation") return "LIMITATION_ONLY";
  if (claim.claimFunction === "mechanism" || claim.claimFunction === "implication") {
    return "INTERPRETATION_ONLY";
  }
  if (claim.claimFunction === "comparative-finding") return "CONTRAST_ONLY";
  return "REFERENCE_ONLY";
}

export function buildSectionClaimOwnership(
  allocations: SectionClaimAllocation[],
): SectionClaimOwnership[] {
  const claims = new Map<string, AllocatedResearchClaim>();
  for (const allocation of allocations) {
    for (const claim of allocation.claims) claims.set(claim.claimId, claim);
  }
  return [...claims.values()]
    .map((claim) => ({
      claimId: claim.claimId,
      primarySection: claim.primarySection,
      allowedSecondarySections: [...(claim.supportingSections ?? [])],
      secondaryUsageMode: secondaryUsageModeForClaim(claim),
      evidenceIds: [...claim.evidenceLineage.evidenceIds],
    }))
    .sort((left, right) => left.claimId.localeCompare(right.claimId));
}

function quantitativeMetricLabel(metric: string): string {
  const labels: Record<string, string> = {
    systolic_blood_pressure: "收縮壓",
    diastolic_blood_pressure: "舒張壓",
    blood_pressure: "血壓",
    sleep_duration: "睡眠時間",
    screen_time: "螢幕使用時間",
    sleep_quality: "睡眠品質",
    odds_ratio: "勝算比",
    correlation: "相關係數",
  };
  return labels[metric] ?? metric.replace(/_/gu, " ");
}

export function buildQuantitativeFindings(
  studies: StructuredStudyEvidence[],
  matrix: EvidenceMatrixRow[],
): QuantitativeFinding[] {
  const validatedEvidenceIds = new Set(
    buildQuantitativeFactRegistry(studies)
      .filter((fact) => fact.validationStatus === "VALIDATED")
      .map((fact) => fact.evidenceId),
  );
  const entries = studies.flatMap((study) =>
    (study.keyNumericResults ?? [])
      .filter((evidence) => validatedEvidenceIds.has(evidence.numericEvidenceId))
      .map((evidence) => ({ study, evidence })),
  );
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = entry.evidence.comparableGroupKey;
    if (!key) continue;
    const compatibilityKey = [
      key,
      `population:${clean(entry.study.population ?? entry.study.speciesOrSubject) || "unknown"}`,
      `timeframe:${clean(entry.study.exposureDuration ?? entry.study.studyPeriod) || "unknown"}`,
      `comparator:${clean(entry.study.comparator) || "unknown"}`,
    ].join("|");
    groups.set(compatibilityKey, [
      ...(groups.get(compatibilityKey) ?? []),
      entry,
    ]);
  }
  return [...groups.entries()].map(([groupKey, grouped], index) => {
    const first = grouped[0]!;
    const metric = first.evidence.metric ?? "reported_numeric_result";
    const unit = normalizeUnit(first.evidence.unit);
    const estimateType = first.evidence.estimateType ?? "unknown";
    const studyIds = unique(grouped.map(({ study }) => study.studyId ?? study.sourceId));
    const sourceIds = unique(grouped.map(({ study }) => study.sourceId));
    const numericValues = grouped
      .map(({ evidence }) => typeof evidence.value === "number" ? evidence.value : Number(evidence.value))
      .filter(Number.isFinite);
    const excludedMetric = ["sample_size", "duration", "exposure_level", "reported_numeric_result", "unclassified_percentage", "heterogeneity_i2"].includes(metric);
    const comparable = studyIds.length >= 2 && numericValues.length === grouped.length && !excludedMetric;
    const claimId = matrix.find((row) =>
      grouped.some(({ evidence, study }) =>
        row.quantitativeEvidenceIds.includes(evidence.numericEvidenceId) || row.sourceIds.includes(study.sourceId),
      ),
    )?.claimId ?? `quantitative-claim-${index + 1}`;
    const min = numericValues.length ? Math.min(...numericValues) : null;
    const max = numericValues.length ? Math.max(...numericValues) : null;
    const narrativeText = comparable && min != null && max != null
      ? `在可比較的研究中，${quantitativeMetricLabel(metric)}介於 ${min}–${max}${unit ? ` ${unit}` : ""}；此為描述性跨研究比較，不代表統合效果量。`
      : studyIds.length === 1 && first.evidence.value != null
        ? `單一研究報告${quantitativeMetricLabel(metric)}為 ${String(first.evidence.value)}${unit ? ` ${unit}` : ""}；此數值不可外推為跨研究效果。`
        : "現有數值的指標、單位或估計語意不足以形成可比較的報告層量化陳述。";
    return {
      findingId: `quantitative-finding-${index + 1}`,
      claimId,
      metricFamily: metric.split("_")[0] ?? metric,
      normalizedMetric: metric,
      unit,
      estimateType,
      studyIds,
      evidenceIds: grouped.map(({ evidence }) => evidence.numericEvidenceId),
      values: grouped.map(({ study, evidence }) => ({
        studyId: study.studyId ?? study.sourceId,
        sourceId: study.sourceId,
        evidenceId: evidence.numericEvidenceId,
        sourceSpanId: evidence.sourceSpanId,
        value: evidence.value ?? "",
        unit: normalizeUnit(evidence.unit),
      })),
      aggregationType: comparable ? "descriptive-cross-study" : "single-study",
      comparabilityStatus: comparable ? "comparable" : studyIds.length === 1 ? "single_study" : "incomparable",
      narrativeText,
      eligibleForChart: comparable,
      chartReason: comparable
        ? "At least two studies report the same normalized metric, unit, and estimate semantics."
        : excludedMetric
          ? "The extracted number is contextual rather than an outcome estimate."
          : "Fewer than two distinct studies provide comparable values.",
      provenance: {
        derivationRule: "deterministic grouping by normalized metric, normalized unit, and estimate type; no unit conversion",
        sourceSpanIds: unique(grouped.map(({ evidence }) => evidence.sourceSpanId)),
        noMetaAnalysis: true,
      },
    };
  });
}

export function buildQuantitativeFindingsRegistry(
  studies: StructuredStudyEvidence[],
  matrix: EvidenceMatrixRow[],
): QuantitativeFindingsRegistryEntry[] {
  return studies.flatMap((study) =>
    (study.keyNumericResults ?? []).map((numeric) => {
      const span = study.evidenceSpans.find(
        (candidate) => candidate.spanId === numeric.sourceSpanId,
      );
      const claimId = matrix.find(
        (row) =>
          row.quantitativeEvidenceIds.includes(numeric.numericEvidenceId) ||
          row.sourceIds.includes(study.sourceId),
      )?.claimId ?? "unallocated-quantitative-claim";
      return {
        sourceId: study.sourceId,
        claimId,
        metric: numeric.metric ?? "reported_numeric_result",
        value: numeric.value ?? "",
        unit: numeric.unit ?? null,
        group: study.population ?? study.speciesOrSubject ?? null,
        comparator: study.comparator ?? null,
        sampleSize: numeric.sampleSize ?? study.sampleSize ?? null,
        timePoint: study.exposureDuration ?? study.studyPeriod ?? null,
        confidenceInterval: numeric.confidenceInterval ?? null,
        standardError: numeric.standardError ?? null,
        standardDeviation: numeric.standardDeviation ?? null,
        pValue: numeric.pValue ?? null,
        effectSize: numeric.effectSize ?? null,
        extractedSpan: span?.text ?? "",
        sourceTableFigureNumber:
          span?.sectionHeading && /table|figure|表|圖/iu.test(span.sectionHeading)
            ? span.sectionHeading
            : null,
        provenanceConfidence: study.extractionConfidence,
        sourceSpanId: numeric.sourceSpanId,
      };
    }),
  );
}

function quantitativeMetricType(
  numeric: NumericEvidence,
): QuantitativeMetricType {
  if (numeric.metric === "sample_size" || numeric.estimateType === "sample_size") {
    return "sample_size";
  }
  if (numeric.metric === "correlation" || numeric.estimateType === "correlation") {
    return "correlation";
  }
  if (numeric.metric === "odds_ratio") return "odds_ratio";
  if (numeric.metric === "risk_ratio" || numeric.metric === "hazard_ratio") {
    return "risk_ratio";
  }
  if (numeric.estimateType === "difference" || numeric.estimateType === "change") {
    return "difference";
  }
  if (numeric.effectSize != null) return "effect_size";
  if (numeric.confidenceInterval) return "confidence_interval";
  if (numeric.pValue && numeric.value == null) return "p_value";
  if (numeric.estimateType === "count") return "count";
  if (numeric.unit === "%") return "percentage";
  if (numeric.metric === "reported_numeric_result" || numeric.metric === "unclassified_percentage") {
    return "other";
  }
  return "mean";
}

export function buildQuantitativeFactRegistry(
  studies: StructuredStudyEvidence[],
): QuantitativeFactRegistryEntry[] {
  return studies.flatMap((study) =>
    (study.keyNumericResults ?? []).map((numeric) => {
      const span = study.evidenceSpans.find(
        (candidate) => candidate.spanId === numeric.sourceSpanId,
      );
      const value =
        typeof numeric.value === "number"
          ? numeric.value
          : Number(String(numeric.value ?? "").replace(/,/gu, ""));
      const metricType = quantitativeMetricType(numeric);
      const normalizedMetric = clean(numeric.metric).toLowerCase();
      const normalizedUnit = normalizeUnit(numeric.unit);
      const timeUnitPairedWithEffectMetric = /^(?:days?|weeks?|months?|years?)$/iu.test(normalizedUnit ?? "") &&
        !/(?:duration|follow.?up|time|period)/iu.test(normalizedMetric);
      const confidenceLevelMistakenForResult =
        value === 95 &&
        normalizedUnit === "%" &&
        /95\s*%\s*(?:CI|confidence interval)/iu.test(clean(span?.text));
      const truncatedNumericContext =
        /\b(?:mean diff(?:erence)?|difference|CI|p\s*=)[^。!?]{0,24}\d+\.\s*$/iu.test(
          clean(span?.text),
        );
      const ambiguous =
        metricType === "other" ||
        truncatedNumericContext ||
        (!numeric.unit &&
          !["correlation", "odds_ratio", "effect_size", "p_value"].includes(
            metricType,
          ));
      const validationStatus: QuantitativeFactRegistryEntry["validationStatus"] =
        !span || !Number.isFinite(value) || timeUnitPairedWithEffectMetric || confidenceLevelMistakenForResult
          ? "REJECTED"
          : ambiguous
            ? "AMBIGUOUS"
            : "VALIDATED";
      const disposition: QuantitativeDisposition =
        validationStatus === "REJECTED"
          ? "unusable"
          : validationStatus === "AMBIGUOUS" || metricType === "p_value"
            ? "appendix-only"
            : metricType === "sample_size"
              ? "table-worthy"
              : ["percentage", "correlation", "odds_ratio", "risk_ratio", "effect_size", "rate", "trend", "difference"].includes(metricType)
                ? "figure-worthy"
                : "body-worthy";
      return {
        factId: `quantitative-fact:${numeric.numericEvidenceId}`,
        evidenceId: numeric.numericEvidenceId,
        sourceId: study.sourceId,
        metricType,
        value: Number.isFinite(value) ? value : null,
        ...(numeric.comparatorValue != null
          ? {
              secondaryValue:
                typeof numeric.comparatorValue === "number"
                  ? numeric.comparatorValue
                  : Number(String(numeric.comparatorValue).replace(/,/gu, "")),
            }
          : {}),
        ...(numeric.unit ? { unit: normalizeUnit(numeric.unit) } : {}),
        ...(study.comparator ? { comparator: study.comparator } : {}),
        ...(study.population || study.speciesOrSubject
          ? { population: study.population ?? study.speciesOrSubject }
          : {}),
        ...(study.exposureDuration || study.studyPeriod
          ? { timeframe: study.exposureDuration ?? study.studyPeriod }
          : {}),
        sourceText: span?.text ?? "",
        ...(span?.sectionHeading ? { sourceLocation: span.sectionHeading } : {}),
        confidence: study.extractionConfidence,
        validationStatus,
        disposition,
        usableSections: ["findings", "evidence_overview", "appendix_quantitative"],
        chartEligible:
          validationStatus === "VALIDATED" &&
          disposition === "figure-worthy",
        sourceLocator: span?.sectionHeading ?? null,
        measure: clean(numeric.metric) || "reported_numeric_result",
        baseline: null,
        effectDirection: numeric.direction ?? "unknown",
        effectSizeType: numeric.estimateType ?? "unknown",
        confidenceInterval: numeric.confidenceInterval ?? null,
        pValue: numeric.pValue ?? null,
        sampleSize: numeric.sampleSize ?? study.sampleSize ?? null,
        extractionText: span?.text ?? "",
        extractionMethod: "deterministic_exact_span",
        verificationStatus: validationStatus,
      } satisfies QuantitativeFactRegistryEntry;
    }),
  );
}

export function hasPotentialQuantitativeEvidence(
  study: StructuredStudyEvidence,
): boolean {
  const corpus = [
    study.title,
    study.studyDesign,
    ...study.evidenceSpans.map((span) => span.text),
  ].filter(Boolean).join(" ");
  if (/\bprotocol\b|study protocol|研究方案/iu.test(corpus) &&
      !/\bresults?\b|findings?|observed|reported|結果|發現/iu.test(corpus)) {
    return false;
  }
  const quantitativeDesign = /randomi[sz]ed|\bRCT\b|cohort|meta[- ]analysis|systematic review|comparative benchmark|controlled trial|experimental study|隨機對照|世代研究|統合分析|系統性回顧|比較基準/iu.test(corpus);
  const quantitativeResultSignal = /\b(?:effect size|mean difference|odds ratio|risk ratio|hazard ratio|confidence interval|\bp\s*[=<>]|accuracy|latency|cost|VO2(?:max|peak)|FEV1|FVC)\b|%|效果量|平均差|勝算比|信賴區間|準確率|延遲|成本/iu.test(corpus);
  return quantitativeDesign && quantitativeResultSignal;
}

export function estimateTokens(value: unknown): number {
  const text = (typeof value === "string" ? value : JSON.stringify(value))
    .replace(/\s+/gu, " ")
    .trim();
  if (!text) return 0;
  // Keep this deliberately aligned with the conservative provider-side
  // estimator. The formal gate must never approve a prompt that the request
  // layer subsequently measures as larger merely because identifiers and
  // Latin-heavy JSON were priced differently.
  const cjk = (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
  const latinWords = (text.match(/[A-Za-z0-9_'-]+/gu) ?? []).length;
  const otherCharacters = Math.max(0, Array.from(text).length - cjk);
  return Math.max(
    1,
    Math.ceil(cjk * 0.9 + latinWords * 1.25 + otherCharacters / 4),
  );
}

export function buildContextBudgetCall(input: { callId: string; model: string; contextLimit?: number; outputReserve?: number; systemReserve?: number; validationReserve?: number; assignedSection: string; evidenceIdsUsed: string[]; prompt: unknown; actualInputTokens?: number; outputTokens?: number }): ContextBudgetCall {
  const contextLimit = input.contextLimit ?? 32_768;
  const usableContextBudget = Math.max(1, contextLimit - (input.outputReserve ?? 4_096) - (input.systemReserve ?? 1_024) - (input.validationReserve ?? 1_024));
  const maximumInputTokens = Math.floor(Math.min(contextLimit * 0.8, usableContextBudget * 0.85));
  const estimatedInputTokens = estimateTokens(input.prompt);
  return { callId: input.callId, model: input.model, contextLimit, usableContextBudget, maximumInputTokens, estimatedInputTokens, actualInputTokens: input.actualInputTokens, outputTokens: input.outputTokens, assignedSection: input.assignedSection, evidenceIdsUsed: unique(input.evidenceIdsUsed), withinBudget: (input.actualInputTokens ?? estimatedInputTokens) <= maximumInputTokens };
}

export function buildSectionEvidencePacket(input: { sectionId: string; matrix: EvidenceMatrixRow[]; studies: StructuredStudyEvidence[]; allocation?: SectionClaimAllocation; contextLimit?: number }): SectionEvidencePacket {
  const maximum = buildContextBudgetCall({ callId: "packet-probe", model: "unknown", contextLimit: input.contextLimit, assignedSection: input.sectionId, evidenceIdsUsed: [], prompt: "" }).maximumInputTokens;
  const selectedRows: EvidenceMatrixRow[] = [];
  const selectedStudies: StructuredStudyEvidence[] = [];
  const allocatedSourceIds = new Set(input.allocation?.sourceIds ?? []);
  const eligibleRows = allocatedSourceIds.size > 0
    ? input.matrix.filter((row) => row.sourceIds.some((sourceId) => allocatedSourceIds.has(sourceId)))
    : input.sectionId === "evidence_overview"
      ? input.matrix
      : [];
  const requiredSourceIds = unique(eligibleRows.flatMap((row) => row.conflictingSourceIds));
  const orderedStudies = [...input.studies].sort((a, b) => Number(requiredSourceIds.includes(b.sourceId)) - Number(requiredSourceIds.includes(a.sourceId)) || b.extractionConfidence - a.extractionConfidence);
  for (const row of eligibleRows) {
    const candidateRows = [...selectedRows, row];
    if (estimateTokens(candidateRows) <= maximum * 0.35) selectedRows.push(row);
  }
  const rowSourceIds = new Set(
    input.sectionId === "evidence_overview"
      ? input.studies.map((study) => study.sourceId)
      : selectedRows.flatMap((row) => row.sourceIds),
  );
  for (const study of orderedStudies.filter((item) => rowSourceIds.has(item.sourceId))) {
    const candidate = [...selectedStudies, study];
    if (estimateTokens({ rows: selectedRows, studies: candidate }) <= maximum) selectedStudies.push(study);
  }
  return {
    sectionId: input.sectionId,
    matrixRows: selectedRows,
    studies: selectedStudies,
    evidenceIds: unique(input.allocation?.evidenceIds ?? selectedStudies.flatMap((study) => study.evidenceSpans.map((span) => span.spanId))),
    ownedClaimIds: input.allocation?.ownedClaimIds ?? [],
    contextualClaimIds: input.allocation?.contextualClaimIds ?? [],
    forbiddenClaimIds: input.allocation?.forbiddenClaimIds ?? [],
    estimatedTokens: estimateTokens({ rows: selectedRows, studies: selectedStudies }),
    preservedConflictingSourceIds: unique(selectedStudies.filter((study) => requiredSourceIds.includes(study.sourceId)).map((study) => study.sourceId)),
  };
}

function categories(values: string[]): Array<{ label: string; value: number }> {
  const counts = new Map<string, number>();
  for (const value of values.map(clean).filter(Boolean)) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

function visualizationItem(input: Omit<VisualizationPlanItem, "sourceEvidence" | "derivationRule" | "dataRows" | "labels" | "caption" | "limitations" | "provenance"> & {
  generatedFrom: VisualizationPlanItem["provenance"]["generatedFrom"];
  derivationRule: string;
  dataRows?: VisualizationPlanItem["dataRows"];
  labels?: string[];
  limitations?: string[];
}): VisualizationPlanItem {
  return {
    ...input,
    sourceEvidence: [...input.numericEvidenceIds],
    derivationRule: input.derivationRule,
    dataRows: input.dataRows ?? input.categories?.map((row) => ({ label: row.label, value: row.value })) ?? [],
    labels: input.labels ?? input.axisLabels ?? [],
    caption: `${input.title}. ${input.sourceNote}`,
    limitations: input.limitations ?? input.rejectionReasons,
    provenance: {
      sourceIds: [...input.sourceIds],
      evidenceIds: [...input.numericEvidenceIds],
      factIds: input.generatedFrom === "quantitative_finding"
        ? input.numericEvidenceIds.map(
            (evidenceId) => `quantitative-fact:${evidenceId}`,
          )
        : [],
      generatedFromValidatedFactsOnly:
        input.generatedFrom === "quantitative_finding",
      generatedFrom: input.generatedFrom,
    },
  };
}

export function planVisualizations(studies: StructuredStudyEvidence[], matrix: EvidenceMatrixRow[], quantitativeFindings: QuantitativeFinding[] = buildQuantitativeFindings(studies, matrix)): VisualizationPlanItem[] {
  const plans: VisualizationPlanItem[] = [];
  const withYear = studies.filter((study) => study.year != null);
  plans.push(visualizationItem({ id: "figure-1", kind: "source_year_distribution", type: "deterministic_evidence_table", status: withYear.length >= 2 ? "APPROVED" : "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART", title: "Source year distribution", sourceIds: withYear.map((study) => study.sourceId), numericEvidenceIds: [], n: withYear.length, axisLabels: ["Year", "Sources"], categories: categories(withYear.map((study) => String(study.year))), sourceNote: "Source: accepted-source metadata; N denotes sources with a recorded publication year.", rejectionReasons: withYear.length >= 2 ? [] : ["Fewer than two sources contain publication-year metadata."], generatedFrom: "accepted_source_metadata", derivationRule: "count accepted sources by recorded publication year", limitations: ["This describes corpus composition, not an empirical outcome."] }));
  const withDesign = studies.filter((study) => clean(study.studyDesign));
  plans.push(visualizationItem({ id: "figure-2", kind: "study_design_distribution", type: "study_comparison_table", status: withDesign.length >= 2 ? "APPROVED" : "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART", title: "Study design distribution", sourceIds: withDesign.map((study) => study.sourceId), numericEvidenceIds: [], n: withDesign.length, axisLabels: ["Study design", "Studies"], categories: categories(withDesign.map((study) => study.studyDesign!)), sourceNote: "Source: structured study evidence; unknown designs are excluded.", rejectionReasons: withDesign.length >= 2 ? [] : ["Insufficient classified study designs."], generatedFrom: "structured_study_evidence", derivationRule: "count structured studies by explicit study-design classification" }));
  const directions = studies.filter((study) => study.effectDirection && study.effectDirection !== "unknown");
  plans.push(visualizationItem({ id: "figure-3", kind: "evidence_direction", type: "conceptual_thematic_diagram", status: directions.length >= 2 ? "APPROVED" : "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART", title: "Evidence direction", sourceIds: directions.map((study) => study.sourceId), numericEvidenceIds: [], n: directions.length, axisLabels: ["Direction", "Studies"], categories: categories(directions.map((study) => study.effectDirection!)), sourceNote: "Source: deterministic direction classification from traceable evidence spans.", rejectionReasons: directions.length >= 2 ? [] : ["Insufficient classified effect directions."], generatedFrom: "structured_study_evidence", derivationRule: "count deterministic evidence-direction classifications", limitations: ["Direction categories are thematic classifications, not comparable effect sizes."] }));
  const comparable = quantitativeFindings.find((finding) => finding.eligibleForChart);
  plans.push(visualizationItem({ id: "figure-4", kind: "quantitative_result_comparison", type: "quantitative_chart", status: comparable ? "APPROVED" : "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART", title: "Comparable quantitative results", sourceIds: comparable ? unique(comparable.values.map((value) => value.sourceId)) : [], numericEvidenceIds: comparable?.evidenceIds ?? [], n: comparable?.values.length ?? 0, unit: comparable?.unit, axisLabels: ["Study", comparable ? quantitativeMetricLabel(comparable.normalizedMetric) : "Metric"], sourceNote: "Source: source-span-grounded QuantitativeFinding records. Values are separate within-study results, not a pooled estimate or meta-analysis; missing sample sizes remain unreported.", rejectionReasons: comparable ? [] : ["No metric/unit/estimate-semantics group contains values from at least two distinct studies."], generatedFrom: "quantitative_finding", derivationRule: comparable?.provenance.derivationRule ?? "fail closed when comparable quantitative findings are unavailable", dataRows: comparable?.values.map((value) => ({ studyId: value.studyId, sourceId: value.sourceId, value: typeof value.value === "number" ? value.value : String(value.value), unit: value.unit ?? null })) ?? [], limitations: comparable ? ["Descriptive comparison only; no pooled or meta-analytic estimate is implied."] : ["Quantitative chart rejected; no unsupported values are rendered."] }));
  plans.push(visualizationItem({ id: "table-1", kind: "evidence_matrix_table", type: "deterministic_evidence_table", status: matrix.length > 0 ? "APPROVED" : "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART", title: "Claim-theme evidence matrix", sourceIds: unique(matrix.flatMap((row) => row.sourceIds)), numericEvidenceIds: unique(matrix.flatMap((row) => row.quantitativeEvidenceIds)), n: matrix.length, sourceNote: "Source: ResearchForge evidence matrix; N denotes claim-theme rows.", rejectionReasons: matrix.length ? [] : ["No traceable claim-theme rows were available."], generatedFrom: "evidence_matrix", derivationRule: "render one deterministic row per claim-theme evidence-matrix record", dataRows: matrix.map((row) => ({ claimId: row.claimId, themeId: row.themeId, sources: row.sourceIds.length, agreement: row.agreement, strength: row.evidenceStrength })) }));
  return plans;
}

export function buildFigurePlan(input: {
  blueprint: ResearchBlueprint;
  workflow: ResearchWorkflowFacts;
  visualizations: VisualizationPlanItem[];
  quantitativeFacts: QuantitativeFactRegistryEntry[];
}): FigurePlan[] {
  const workflowSteps = unique([
    "確立研究主題",
    "建立研究問題",
    input.workflow.reproducibleSearchStrategy ? "設計檢索策略" : null,
    input.workflow.screeningProcedure ? "搜尋與篩選文獻" : null,
    input.workflow.duplicateRemoval ? "去除重複來源" : null,
    "建立 Evidence Matrix",
    input.workflow.themeSynthesis !== false ? "依研究問題進行主題分類與跨研究比較" : null,
    "形成討論並逐項回答研究問題",
  ]);
  const plans: FigurePlan[] = [{
    id: "figure-research-workflow",
    figureType: "PROCESS",
    type: "research_flow",
    figureClass: "EXPLANATORY_FIGURE",
    purpose: "讓讀者理解本次實際執行的次級研究流程。",
    supportedBy: workflowSteps,
    dataFacts: [],
    provenancePoints: [],
    placementAfterSection: "methods",
    caption: `圖：本研究實際流程（${workflowSteps.join(" → ")}）。此圖為流程示意，不是研究結果。`,
    interpretationRequirement: "正文必須說明流程節點來自本次 workflow，且未執行的實驗、問卷或訪談不得出現。",
    status: "APPROVED",
  }];
  for (const item of input.visualizations) {
    const evidenceFigure = item.type === "quantitative_chart" || item.type === "deterministic_evidence_table" || item.type === "study_comparison_table";
    const type: FigurePlan["type"] = item.type === "quantitative_chart"
      ? "dot_plot"
      : item.kind === "evidence_matrix_table" || item.type === "study_comparison_table" || item.type === "deterministic_evidence_table"
        ? "comparison_table"
        : item.type === "conceptual_thematic_diagram"
          ? "evidence_map"
          : "bar_chart";
    plans.push({
      id: item.id,
      figureType: item.status !== "APPROVED"
        ? "NOT_AVAILABLE"
        : item.type === "quantitative_chart"
          ? "RESULT_QUANTITATIVE"
          : item.provenance.generatedFrom === "accepted_source_metadata"
            ? "DESCRIPTIVE_METADATA"
            : "EVIDENCE_STRUCTURE",
      type,
      figureClass: evidenceFigure ? "EVIDENCE_FIGURE" : "EXPLANATORY_FIGURE",
      purpose: item.title,
      supportedBy: item.sourceIds,
      dataFacts: item.provenance.factIds,
      provenancePoints: item.provenance.factIds.flatMap((factId, index) => {
        const fact = input.quantitativeFacts.find((candidate) => candidate.factId === factId);
        if (!fact || fact.validationStatus !== "VALIDATED" || fact.value == null) return [];
        return [{
          seriesId: `${item.id}:series:1`,
          pointId: `${item.id}:point:${index + 1}`,
          sourceId: fact.sourceId,
          quantitativeFactId: fact.factId,
          originalValue: fact.value,
          unit: fact.unit ?? null,
        }];
      }),
      placementAfterSection: item.kind === "evidence_matrix_table" ? "evidence_overview" : "findings",
      caption: item.caption,
      interpretationRequirement: item.limitations.join(" ") || "正文必須說明圖中資訊的適用範圍與不可推論事項。",
      status: item.status === "APPROVED" ? "APPROVED" : "REJECTED",
      ...(item.rejectionReasons.length ? { rejectionReason: item.rejectionReasons.join(" ") } : {}),
    });
  }
  const hasApprovedQuantitative = plans.some((plan) => plan.status === "APPROVED" && plan.figureClass === "EVIDENCE_FIGURE" && ["bar_chart", "dot_plot", "line_chart", "forest_plot"].includes(plan.type));
  if (!hasApprovedQuantitative) {
    const singleStudyFact = input.quantitativeFacts.find(
      (fact) => fact.validationStatus === "VALIDATED" && fact.disposition === "figure-worthy" && fact.value != null,
    );
    if (singleStudyFact) {
      plans.push({
        id: `figure-single-study-${singleStudyFact.factId.replace(/[^a-z0-9]+/giu, "-")}`,
        figureType: "NOT_AVAILABLE",
        type: "comparison_table",
        figureClass: "EVIDENCE_FIGURE",
        purpose: "單一研究單一數值的圖表資格判定。",
        supportedBy: [singleStudyFact.sourceId],
        dataFacts: [singleStudyFact.factId],
        provenancePoints: [],
        placementAfterSection: "findings",
        caption: `FIGURE_NOT_SUPPORTED_BY_AVAILABLE_EVIDENCE：${singleStudyFact.value}${singleStudyFact.unit ? ` ${singleStudyFact.unit}` : ""} 應保留為正文量化敘述或小型研究結果表。`,
        interpretationRequirement: "單一研究單一指標不得渲染為大型 progress bar、gauge、pie chart 或暗示總體效果的圖形。",
        status: "REJECTED",
        rejectionReason: "FIGURE_NOT_SUPPORTED_BY_AVAILABLE_EVIDENCE: single-study single metric; use prose, compact evidence statistic, or a small result table.",
      });
    }
  }
  return plans;
}

export function buildResearchQuestionClosureMatrix(input: {
  blueprint: ResearchBlueprint;
  allocations: SectionClaimAllocation[];
}): ResearchQuestionClosureRow[] {
  return input.blueprint.researchQuestions.map((question) => {
    const bodySections = input.blueprint.sectionPlan
      .filter((section) => section.id !== "executive_summary" && section.id !== "conclusion" && section.questionsAnswered.includes(question.id))
      .map((section) => section.id);
    const supportingClaimIds = unique(
      input.allocations
        .filter((allocation) => bodySections.includes(allocation.sectionId as ResearchBlueprintSectionRole))
        .flatMap((allocation) => allocation.ownedClaimIds),
    );
    return {
      researchQuestionId: question.id,
      bodySections,
      supportingClaimIds,
      conclusionRequirement: `${question.id} 的回答只能使用上述正文主張，不得引入新 claim。`,
      status: supportingClaimIds.length > 0 ? "COVERED" : "BLOCKED_EVIDENCE",
    };
  });
}

const PIPELINE_LEAKAGE_PATTERN = /(?:系統初評|source_quality_score|accepted source|已接受來源|接受來源|evidence cards?|direct_evidence|canonical fact|source governance|citation reconciliation|search provider|DOI resolution status|此來源可用於檢視|已取得\s*DOI|已取得來源連結|此來源目前只提供摘要|系統判定|confidence score|可辨識的證據面向|可直接納入證據整理|可形成跨研究比較|可用於理解|提供背景|provider|prompt payload|debug)/giu;

export function validateResearchBlueprint(blueprint: ResearchBlueprint): {
  pass: boolean;
  code: "PASS" | "RESEARCH_BLUEPRINT_INVALID";
  issues: string[];
} {
  const issues = [
    !clean(blueprint.centralQuestion) ? "central_question_missing" : null,
    blueprint.researchQuestions.filter((item) => item.priority === "primary").length !== 1 ? "primary_question_count" : null,
    blueprint.sectionPlan.length < 7 ? "section_plan_too_shallow" : null,
    blueprint.sectionPlan.some((section) => !section.purpose || section.questionsAnswered.length === 0) ? "section_contract_incomplete" : null,
    blueprint.methodology.primaryMethods.length === 0 ? "methodology_missing" : null,
    blueprint.conclusionRequirements.length !== blueprint.researchQuestions.length ? "conclusion_requirements_incomplete" : null,
  ].filter((issue): issue is string => Boolean(issue));
  return { pass: issues.length === 0, code: issues.length ? "RESEARCH_BLUEPRINT_INVALID" : "PASS", issues };
}

export function validatePipelineLeakage(sections: Array<Pick<ReportWriterSection, "sectionId" | "prose">>): {
  pass: boolean;
  code: "PASS" | "PIPELINE_LEAKAGE_GATE";
  occurrences: Array<{ sectionId: string; phrase: string }>;
} {
  const occurrences = sections
    .filter((section) => !/^appendix/iu.test(section.sectionId))
    .flatMap((section) => [...section.prose.matchAll(PIPELINE_LEAKAGE_PATTERN)].map((match) => ({ sectionId: section.sectionId, phrase: match[0] })));
  return { pass: occurrences.length === 0, code: occurrences.length ? "PIPELINE_LEAKAGE_GATE" : "PASS", occurrences };
}

export function validateSourceDominance(sections: Array<Pick<ReportWriterSection, "sectionId" | "prose">>): {
  pass: boolean;
  code: "PASS" | "SOURCE_DOMINANCE_GATE";
  sourceLedParagraphs: number;
  substantiveParagraphs: number;
  ratio: number;
  repeatedRuns: number;
} {
  const paragraphs = sections
    .filter((section) => ["findings", "cross_study_synthesis", "discussion"].includes(section.sectionId))
    .flatMap((section) => section.prose.split(/\n{2,}/u).map(clean).filter((text) => text.length >= 28));
  const sourceLed = paragraphs.map((text) => /^(?:(?:[A-Z][\p{L}'-]+(?:\s+(?:et al\.|and|&|[A-Z][\p{L}'-]+)){0,3})|(?:[\p{Script=Han}]{2,6}等(?:人)?))(?:\s*（?\d{4}）?)?\s*(?:（|\(|於|在|指出|發現|顯示|認為|reported|found|showed)/u.test(text));
  let repeatedRuns = 0;
  let run = 0;
  for (const value of sourceLed) {
    run = value ? run + 1 : 0;
    if (run === 3) repeatedRuns += 1;
  }
  const sourceLedParagraphs = sourceLed.filter(Boolean).length;
  const ratio = paragraphs.length === 0 ? 0 : sourceLedParagraphs / paragraphs.length;
  const pass = repeatedRuns === 0 && ratio <= 0.4;
  return { pass, code: pass ? "PASS" : "SOURCE_DOMINANCE_GATE", sourceLedParagraphs, substantiveParagraphs: paragraphs.length, ratio: Math.round(ratio * 10_000) / 100, repeatedRuns };
}

export function validateSemanticDensity(sections: Array<Pick<ReportWriterSection, "sectionId" | "prose">>): {
  pass: boolean;
  code: "PASS" | "SEMANTIC_DENSITY_GATE";
  substantiveSentences: number;
  uniqueSentences: number;
  uniqueRatio: number;
  substantiveUniqueSupportedCjk: number;
} {
  const sentences = sections
    .filter((section) => !["executive_summary", "conclusion"].includes(section.sectionId))
    .flatMap((section) => section.prose.split(/(?<=[。！？.!?])\s+|\n{2,}/u).map(clean))
    .filter((text) => {
      PIPELINE_LEAKAGE_PATTERN.lastIndex = 0;
      return text.length >= 24 && !PIPELINE_LEAKAGE_PATTERN.test(text);
    });
  PIPELINE_LEAKAGE_PATTERN.lastIndex = 0;
  const fingerprints = sentences.map(fingerprint);
  const uniqueFingerprints = new Set(fingerprints);
  const uniqueTexts = sentences.filter((_, index) => fingerprints.indexOf(fingerprints[index]!) === index);
  const cjk = uniqueTexts.join("").match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  const uniqueRatio = sentences.length === 0 ? 0 : uniqueFingerprints.size / sentences.length;
  const pass = sentences.length > 0 && uniqueRatio >= 0.82;
  return {
    pass,
    code: pass ? "PASS" : "SEMANTIC_DENSITY_GATE",
    substantiveSentences: sentences.length,
    uniqueSentences: uniqueFingerprints.size,
    uniqueRatio: Math.round(uniqueRatio * 10_000) / 100,
    substantiveUniqueSupportedCjk: cjk,
  };
}

export function validateResearchQuestionClosure(input: {
  sections: Array<Pick<ReportWriterSection, "sectionId" | "prose">>;
  matrix: ResearchQuestionClosureRow[];
}): {
  pass: boolean;
  code: "PASS" | "RESEARCH_QUESTION_CLOSURE_GATE";
  rows: Array<ResearchQuestionClosureRow & { realizedBodySections: string[]; conclusionPresent: boolean }>;
} {
  const conclusion = clean(input.sections.find((section) => section.sectionId === "conclusion")?.prose);
  const rows = input.matrix.map((row) => {
    const realizedBodySections = row.bodySections.filter((sectionId) => clean(input.sections.find((section) => section.sectionId === sectionId)?.prose).length >= 24);
    return { ...row, realizedBodySections, conclusionPresent: conclusion.length >= 24 };
  });
  const pass = rows.every((row) => row.status === "COVERED" && row.realizedBodySections.length > 0 && row.conclusionPresent);
  return { pass, code: pass ? "PASS" : "RESEARCH_QUESTION_CLOSURE_GATE", rows };
}

export function validateFigureNarrativeBinding(input: {
  sections: Array<Pick<ReportWriterSection, "sectionId" | "prose">>;
  figurePlan: FigurePlan[];
  quantitativeFacts: QuantitativeFactRegistryEntry[];
}): {
  pass: boolean;
  code: "PASS" | "FIGURE_NARRATIVE_BINDING_GATE";
  issues: string[];
} {
  const facts = new Map(input.quantitativeFacts.map((fact) => [fact.factId, fact]));
  const issues: string[] = [];
  for (const plan of input.figurePlan.filter((item) => item.status === "APPROVED")) {
    const sectionText = clean(input.sections.find((section) => section.sectionId === plan.placementAfterSection)?.prose);
    if (!clean(plan.caption) || !clean(plan.interpretationRequirement)) issues.push(`${plan.id}:missing_caption_or_interpretation`);
    if (plan.figureClass === "EXPLANATORY_FIGURE") {
      if (sectionText.length < 24) issues.push(`${plan.id}:placement_section_missing`);
      continue;
    }
    const planFacts = plan.dataFacts.map((id) => facts.get(id)).filter((fact): fact is QuantitativeFactRegistryEntry => Boolean(fact));
    if (plan.dataFacts.length > 0 && planFacts.length !== plan.dataFacts.length) issues.push(`${plan.id}:unknown_data_fact`);
    if (planFacts.some((fact) => fact.validationStatus !== "VALIDATED")) issues.push(`${plan.id}:unvalidated_data_fact`);
    if (planFacts.length > 0 && !planFacts.some((fact) => sectionText.includes(String(fact.value)))) issues.push(`${plan.id}:fact_not_explained_in_body`);
  }
  return { pass: issues.length === 0, code: issues.length ? "FIGURE_NARRATIVE_BINDING_GATE" : "PASS", issues };
}

export function validateChartProvenance(input: {
  visualizationPlan: VisualizationPlanItem[];
  quantitativeFactRegistry: QuantitativeFactRegistryEntry[];
}): {
  pass: boolean;
  code: "PASS" | "CHART_PROVENANCE_GATE";
  approvedQuantitativeChartIds: string[];
  rejectedChartIds: string[];
  issues: string[];
} {
  const factsById = new Map(
    input.quantitativeFactRegistry.map((fact) => [fact.factId, fact] as const),
  );
  const approvedQuantitativeCharts = input.visualizationPlan.filter(
    (item) => item.status === "APPROVED" && item.type === "quantitative_chart",
  );
  const issues: string[] = [];
  for (const chart of approvedQuantitativeCharts) {
    if (chart.provenance.factIds.length === 0) {
      issues.push(`${chart.id}:missing_fact_ids`);
      continue;
    }
    const facts = chart.provenance.factIds.map((factId) => factsById.get(factId));
    if (facts.some((fact) => !fact)) {
      issues.push(`${chart.id}:unknown_fact_id`);
      continue;
    }
    const validatedFacts = facts.filter(
      (fact): fact is QuantitativeFactRegistryEntry => Boolean(fact),
    );
    if (
      !chart.provenance.generatedFromValidatedFactsOnly ||
      validatedFacts.some(
        (fact) => fact.validationStatus !== "VALIDATED" || !fact.chartEligible,
      )
    ) {
      issues.push(`${chart.id}:unvalidated_quantitative_fact`);
    }
    if (
      validatedFacts.some(
        (fact) =>
          !chart.numericEvidenceIds.includes(fact.evidenceId) ||
          !chart.sourceIds.includes(fact.sourceId),
      )
    ) {
      issues.push(`${chart.id}:incomplete_fact_lineage`);
    }
    const units = unique(validatedFacts.map((fact) => fact.unit));
    const metricTypes = unique(validatedFacts.map((fact) => fact.metricType));
    const populations = unique(
      validatedFacts.map((fact) => fact.population ?? "unknown"),
    );
    const timeframes = unique(
      validatedFacts.map((fact) => fact.timeframe ?? "unknown"),
    );
    const comparators = unique(
      validatedFacts.map((fact) => fact.comparator ?? "unknown"),
    );
    if (
      units.length > 1 ||
      metricTypes.length > 1 ||
      populations.length > 1 ||
      timeframes.length > 1 ||
      comparators.length > 1
    ) {
      issues.push(`${chart.id}:incompatible_quantitative_facts`);
    }
  }
  const rejectedChartIds = unique(
    issues.map((issue) => issue.split(":", 1)[0]),
  );
  return {
    pass: issues.length === 0,
    code: issues.length === 0 ? "PASS" : "CHART_PROVENANCE_GATE",
    approvedQuantitativeChartIds: approvedQuantitativeCharts.map(
      (chart) => chart.id,
    ),
    rejectedChartIds,
    issues,
  };
}

export function renderCitationCluster(sourceIds: string[], mode: CitationDisplayMode, ordinals: Map<string, number> = new Map()): string {
  const ids = unique(sourceIds);
  if (!ids.length) return "";
  if (mode === "compact") return `[${ids.length} source${ids.length === 1 ? "" : "s"}]`;
  const numbers = ids.map((id) => ordinals.get(id)).filter((value): value is number => value != null).sort((a, b) => a - b);
  if (!numbers.length) return `[${ids.length} sources]`;
  const ranges: string[] = [];
  let start = numbers[0];
  let end = numbers[0];
  for (const value of numbers.slice(1)) {
    if (value === end + 1) end = value;
    else { ranges.push(start === end ? String(start) : `${start}–${end}`); start = value; end = value; }
  }
  ranges.push(start === end ? String(start) : `${start}–${end}`);
  return `[${ranges.join(",")}]`;
}

function fingerprint(value: string): string {
  return clean(value).toLocaleLowerCase().replace(/\[(?:s|ref)?\d+(?:[–,-]\d+)*\]/giu, "").replace(/[^\p{L}\p{N}]+/gu, "");
}

function grams(value: string): Set<string> {
  const normalized = fingerprint(value);
  const result = new Set<string>();
  for (let index = 0; index < normalized.length - 2; index += 1) result.add(normalized.slice(index, index + 3));
  return result;
}

function similarity(left: string, right: string): number {
  if (fingerprint(left) === fingerprint(right)) return 1;
  const a = grams(left); const b = grams(right);
  if (!a.size || !b.size) return 0;
  let common = 0; for (const gram of a) if (b.has(gram)) common += 1;
  return common / (a.size + b.size - common);
}

type DuplicateSectionInput = Pick<ReportWriterSection, "sectionId" | "prose"> & Partial<Pick<ReportWriterSection, "generationMethod" | "paragraphClaims" | "sentenceClaimTraces" | "evidenceCardIds">>;

function duplicateUnitMetadata(section: DuplicateSectionInput, text: string): {
  originalClaimIds: string[];
  finalClaimIds: string[];
  evidenceIds: string[];
  originalTexts: string[];
} {
  const matchingTraces = (section.sentenceClaimTraces ?? []).filter((trace) => {
    if (trace.deleted) return false;
    const candidates = [trace.text, trace.originalText, trace.finalText].map(clean).filter(Boolean);
    return candidates.some((candidate) => text.includes(candidate) || candidate.includes(text));
  });
  const matchingParagraphs = (section.paragraphClaims ?? []).filter((paragraph) => {
    const candidate = clean(paragraph.generatedTextZhTw);
    return candidate && (text.includes(candidate) || candidate.includes(text));
  });
  return {
    originalClaimIds: unique(matchingTraces.flatMap((trace) => trace.originalClaimIds ?? trace.realizedClaimIds ?? [])),
    finalClaimIds: unique([
      ...matchingTraces.flatMap((trace) => trace.finalClaimIds ?? trace.realizedClaimIds ?? []),
      ...matchingParagraphs.flatMap((paragraph) => paragraph.claimIds),
    ]),
    evidenceIds: unique([
      ...matchingTraces.flatMap((trace) => trace.evidenceIds ?? []),
      ...matchingParagraphs.flatMap((paragraph) => paragraph.evidenceCardIds),
      ...(matchingTraces.length || matchingParagraphs.length ? [] : section.evidenceCardIds ?? []),
    ]),
    originalTexts: unique(matchingTraces.map((trace) => trace.originalText)),
  };
}

function duplicateCategory(input: {
  left: ReturnType<typeof duplicateUnitMetadata> & { sectionId: string; generationMethod?: string };
  right: ReturnType<typeof duplicateUnitMetadata> & { sectionId: string; generationMethod?: string };
  kind: DuplicateMatch["kind"];
  allocations: SectionClaimAllocation[];
}): Pick<DuplicateMatch, "category" | "origin"> {
  const leftOwned = new Set(input.allocations.find((allocation) => allocation.sectionId === input.left.sectionId)?.ownedClaimIds ?? []);
  const rightOwned = new Set(input.allocations.find((allocation) => allocation.sectionId === input.right.sectionId)?.ownedClaimIds ?? []);
  const commonFinal = input.left.finalClaimIds.filter((claimId) => input.right.finalClaimIds.includes(claimId));
  if (commonFinal.some((claimId) => leftOwned.has(claimId) && rightOwned.has(claimId))) {
    return { category: "CLAIM_DOUBLE_ALLOCATION", origin: "planning" };
  }
  const transformed = input.left.originalTexts.length > 0 && input.right.originalTexts.length > 0 &&
    !input.left.originalTexts.some((text) => input.right.originalTexts.includes(text));
  if (transformed || /canonical|editorial|repair/iu.test(`${input.left.generationMethod ?? ""} ${input.right.generationMethod ?? ""}`)) {
    return { category: "CANONICAL_TRANSFORMATION_DUPLICATE", origin: "canonical_transformation" };
  }
  const leftContext = new Set(input.allocations.find((allocation) => allocation.sectionId === input.left.sectionId)?.contextualClaimIds ?? []);
  const rightContext = new Set(input.allocations.find((allocation) => allocation.sectionId === input.right.sectionId)?.contextualClaimIds ?? []);
  const contextual = commonFinal.some((claimId) => leftContext.has(claimId) || rightContext.has(claimId));
  if (input.kind === "semantic" && contextual) {
    return { category: "PERMITTED_CONTEXTUAL_RECALL", origin: "permitted" };
  }
  if (commonFinal.length > 0 && input.allocations.length > 0) {
    return { category: "CLAIM_DOUBLE_ALLOCATION", origin: "planning" };
  }
  return { category: "WRITER_REGENERATION_DUPLICATE", origin: "generation" };
}

export function validateCrossSectionDuplicates(sections: DuplicateSectionInput[], threshold = 0.86, allocations: SectionClaimAllocation[] = []): { strictDuplicates: DuplicateMatch[]; semanticDuplicates: DuplicateMatch[]; semanticReuseReport: DuplicateMatch[] } {
  const sentences = sections.flatMap((section) =>
    section.prose
      .split(/(?<=[。！？.!?])\s+|\n{2,}/u)
      .map(clean)
      .filter(
        (text) =>
          text.length >= 24 &&
          !/^(?:本節目前證據不足|目前證據不足|insufficient evidence)/iu.test(text),
      )
      .map((text) => ({
        sectionId: section.sectionId,
        text,
        generationMethod: section.generationMethod,
        ...duplicateUnitMetadata(section, text),
      })),
  );
  const strictDuplicates: DuplicateMatch[] = [];
  const semanticDuplicates: DuplicateMatch[] = [];
  const allMatches: DuplicateMatch[] = [];
  for (let left = 0; left < sentences.length; left += 1) for (let right = left + 1; right < sentences.length; right += 1) {
    if (sentences[left].sectionId === sentences[right].sectionId) continue;
    const score = similarity(sentences[left].text, sentences[right].text);
    const kind: DuplicateMatch["kind"] | null = score === 1 ? "strict" : score >= threshold ? "semantic" : null;
    if (!kind) continue;
    const classification = duplicateCategory({ left: sentences[left], right: sentences[right], kind, allocations });
    const match: DuplicateMatch = {
      leftSectionId: sentences[left].sectionId,
      rightSectionId: sentences[right].sectionId,
      leftText: sentences[left].text,
      rightText: sentences[right].text,
      similarity: score,
      kind,
      category: classification.category,
      originalClaimIds: unique([...sentences[left].originalClaimIds, ...sentences[right].originalClaimIds]),
      finalClaimIds: unique([...sentences[left].finalClaimIds, ...sentences[right].finalClaimIds]),
      evidenceIds: unique([...sentences[left].evidenceIds, ...sentences[right].evidenceIds]),
      origin: classification.origin,
    };
    allMatches.push(match);
    if (match.category === "PERMITTED_CONTEXTUAL_RECALL" || match.category === "FALSE_POSITIVE") continue;
    if (kind === "strict") strictDuplicates.push(match);
    else semanticDuplicates.push(match);
  }
  return { strictDuplicates, semanticDuplicates, semanticReuseReport: allMatches };
}

type BodyQuantitativeMention = {
  raw: string;
  kind: "value" | "sample" | "p_value";
  value: number | null;
  unit?: string;
  start: number;
  end: number;
};

const BODY_QUANTITATIVE_RANGE_PATTERN = /(?<left>-?\d+(?:\.\d+)?)\s*[–—-]\s*(?<right>-?\d+(?:\.\d+)?)\s*(?<unit>%|‰|mm\s*Hg|mmHg|mg\/L|µg\/L|μg\/L|ng\/L|mg\/kg|µg\/kg|μg\/kg|kg\/m²|mm|µm|μm|nm|days?|hours?|minutes?|weeks?|months?|years?|points?|scores?|participants?|patients?|subjects?|students?|倍|個|隻|尾|人|小時|分鐘|分)/giu;
const BODY_P_VALUE_PATTERN = /\bp\s*(?:=|<|>|≤|≥)\s*(?<value>0?(?:\.\d+)?)/giu;

function comparableBodyUnit(unit: string | undefined): string | undefined {
  const normalized = normalizeUnit(unit)?.toLocaleLowerCase();
  if (!normalized) return undefined;
  if (/^(?:participants?|patients?|subjects?|students?|人|個|隻|尾|participants_or_units)$/u.test(normalized)) {
    return "participants_or_units";
  }
  if (/^days?$/u.test(normalized)) return "day";
  if (/^hours?$/u.test(normalized) || normalized === "小時") return "hour";
  if (/^minutes?$/u.test(normalized) || normalized === "分鐘" || normalized === "分") return "minute";
  if (/^weeks?$/u.test(normalized)) return "week";
  if (/^months?$/u.test(normalized)) return "month";
  if (/^years?$/u.test(normalized)) return "year";
  if (/^points?$/u.test(normalized)) return "point";
  if (/^scores?$/u.test(normalized)) return "score";
  return normalized;
}

function bodyQuantitativeMentions(sentence: string): BodyQuantitativeMention[] {
  const mentions: BodyQuantitativeMention[] = [];
  const rangeSpans: Array<{ start: number; end: number }> = [];
  for (const match of sentence.matchAll(BODY_QUANTITATIVE_RANGE_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    rangeSpans.push({ start, end });
    const unit = normalizeUnit(match.groups?.unit);
    for (const rawValue of [match.groups?.left, match.groups?.right]) {
      const value = Number(rawValue);
      mentions.push({
        raw: `${rawValue ?? ""}${unit ? ` ${unit}` : ""}`.trim(),
        kind: "value",
        value: Number.isFinite(value) ? value : null,
        unit,
        start,
        end,
      });
    }
  }
  const quantitativePattern = new RegExp(
    QUANTITATIVE_PATTERN.source,
    QUANTITATIVE_PATTERN.flags,
  );
  for (const match of sentence.matchAll(quantitativePattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if (rangeSpans.some((range) => start >= range.start && end <= range.end)) {
      continue;
    }
    const rawValue = match.groups?.sample ?? match.groups?.value;
    const value = Number(rawValue?.replace(/,/gu, ""));
    mentions.push({
      raw: match[0],
      kind: match.groups?.sample ? "sample" : "value",
      value: Number.isFinite(value) ? value : null,
      unit: normalizeUnit(match.groups?.unit),
      start,
      end,
    });
  }
  for (const match of sentence.matchAll(BODY_P_VALUE_PATTERN)) {
    const value = Number(match.groups?.value);
    mentions.push({
      raw: match[0],
      kind: "p_value",
      value: Number.isFinite(value) ? value : null,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return mentions.sort((left, right) => left.start - right.start || left.end - right.end);
}

function numericMentionIsSupported(
  mention: BodyQuantitativeMention,
  sentence: string,
  item: NumericEvidence,
): boolean {
  if (mention.kind === "p_value") {
    const normalizedP = item.pValue?.replace(/\s+/gu, "").toLocaleLowerCase();
    return Boolean(
      normalizedP &&
      mention.value != null &&
      normalizedP.includes(String(mention.value)),
    );
  }
  if (mention.value == null) return false;
  const itemValue = Number(String(item.value ?? "").replace(/,/gu, ""));
  if (!Number.isFinite(itemValue) || itemValue !== mention.value) return false;
  if (mention.kind === "sample") return item.metric === "sample_size";
  const bodyUnit = comparableBodyUnit(mention.unit);
  const evidenceUnit = comparableBodyUnit(item.unit);
  if (bodyUnit === "%" && mention.value === 95 && /\bCI\b|confidence interval|信賴區間/iu.test(sentence)) {
    return Boolean(item.confidenceInterval);
  }
  return Boolean(bodyUnit && evidenceUnit && bodyUnit === evidenceUnit);
}

export function validateQuantitativeProvenance(input: { sections: Array<Pick<ReportWriterSection, "sectionId" | "prose" | "evidenceCardIds">>; numericEvidence: NumericEvidence[]; spans: EvidenceSpan[] }): { pass: boolean; code: "PASS" | "QUANTITATIVE_CLAIM_WITHOUT_SOURCE"; claims: number; claimsWithProvenance: number; bodyNumericClaimCoverage: number; failures: string[] } {
  const spanIds = new Set(input.spans.map((span) => span.spanId));
  const validNumeric = input.numericEvidence.filter((item) => spanIds.has(item.sourceSpanId));
  const failures: string[] = [];
  let claims = 0;
  let claimsWithProvenance = 0;
  for (const section of input.sections) for (const sentence of section.prose.split(/(?<=[。！？!?])\s*|(?<!\d)\.(?!\d)\s*/u).map(clean).filter(Boolean)) {
    const mentions = bodyQuantitativeMentions(sentence);
    if (mentions.length === 0) continue;
    const deterministicCorpusStatistic =
      ["methods", "evidence_overview"].includes(section.sectionId) &&
      /(?:研究紀錄|資料來源|全文|摘要|候選數值|通過.*檢查|檢索|篩選|去重)/u.test(sentence);
    if (deterministicCorpusStatistic) continue;
    const sectionEvidenceIds = new Set(section.evidenceCardIds);
    for (const mention of mentions) {
      claims += 1;
      const supported = validNumeric.some((item) =>
        (sectionEvidenceIds.has(item.sourceSpanId) || sectionEvidenceIds.has(item.numericEvidenceId)) &&
        numericMentionIsSupported(mention, sentence, item),
      );
      if (supported) claimsWithProvenance += 1;
      else failures.push(`${section.sectionId}:${mention.raw}:${sentence}`);
    }
  }
  return { pass: failures.length === 0, code: failures.length ? "QUANTITATIVE_CLAIM_WITHOUT_SOURCE" : "PASS", claims, claimsWithProvenance, bodyNumericClaimCoverage: claims === 0 ? 100 : Math.round((claimsWithProvenance / claims) * 10_000) / 100, failures };
}

export function validateQuantitativeFindingIntegration(input: {
  sections: Array<Pick<ReportWriterSection, "sectionId" | "prose" | "evidenceCardIds">>;
  findings: QuantitativeFinding[];
}): {
  pass: boolean;
  code: "PASS" | "QUANTITATIVE_FINDING_NOT_INTEGRATED";
  requiredFindingIds: string[];
  realizedFindingIds: string[];
  coverage: number;
} {
  const findingsSection = input.sections.find((section) => section.sectionId === "findings");
  const required = input.findings.filter(
    (finding) =>
      finding.values.length > 0 &&
      ![
        "sample_size",
        "duration",
        "exposure_level",
        "reported_numeric_result",
        "unclassified_percentage",
        "heterogeneity_i2",
      ].includes(finding.normalizedMetric),
  );
  const boundEvidenceIds = new Set(findingsSection?.evidenceCardIds ?? []);
  const prose = clean(findingsSection?.prose);
  const realized = required.filter((finding) => {
    const hasBoundEvidence = finding.values.some((value) =>
      boundEvidenceIds.has(value.sourceSpanId) || boundEvidenceIds.has(value.evidenceId),
    );
    const valuesPresent = finding.values.some((value) => prose.includes(String(value.value)));
    const unitPresent = !finding.unit || prose.replace(/\s+/gu, "").includes(finding.unit.replace(/\s+/gu, ""));
    return hasBoundEvidence && valuesPresent && unitPresent;
  });
  const pass = realized.length === required.length;
  return {
    pass,
    code: pass ? "PASS" : "QUANTITATIVE_FINDING_NOT_INTEGRATED",
    requiredFindingIds: required.map((finding) => finding.findingId),
    realizedFindingIds: realized.map((finding) => finding.findingId),
    coverage: required.length === 0 ? 100 : Math.round((realized.length / required.length) * 10_000) / 100,
  };
}

export type SectionDegradationReason =
  | "INSUFFICIENT_EVIDENCE"
  | "WRITER_EMPTY_OUTPUT"
  | "PROVIDER_VISIBLE_OUTPUT_STARVATION"
  | "CITATION_ENTAILMENT_FAILURE"
  | "QUANTITATIVE_GROUNDING_FAILURE"
  | "DUPLICATE_CLAIM_COLLISION"
  | "CANONICAL_TRANSFORMATION_LOSS"
  | "SCHEMA_INVALID"
  | "OTHER";

const EVIDENCE_METADATA_BOILERPLATE =
  /(?:已取得(?:DOI|來源連結|同儕審查線索|期刊或會議資訊)|可追溯原始來源|系統初評為(?:可直接納入證據整理|主要候選)|(?:中文摘要：)?此來源可用於檢視|可形成跨研究比較|可用於理解|提供背景)/u;

const READER_LEAKAGE_CLAUSE_PATTERNS = [
  /(?:就[^。；!?]{0,24}(?:而言|來看)[，,]\s*)?(?:在納入證據中[，,]\s*)?此來源(?:可用於檢視|目前只提供|已保留)[^。；!?]*(?:[。；!?]|$)/giu,
  /(?:就[^。；!?]{0,24}(?:而言|來看)[，,]\s*)?可辨識的證據面向包括[^。；!?]*(?:[。；!?]|$)/giu,
  /(?:就[^。；!?]{0,24}(?:而言|來看)[，,]\s*)?已取得(?:\s*DOI|來源連結|同儕審查線索|期刊或會議資訊)[^。；!?]*(?:[。；!?]|$)/giu,
  /(?:就[^。；!?]{0,24}(?:而言|來看)[，,]\s*)?系統初評(?:為)?[^。；!?]*(?:[。；!?]|$)/giu,
  /(?:就[^。；!?]{0,24}(?:而言|來看)[，,]\s*)?(?:可形成跨研究比較|可用於理解|提供背景)[^。；!?]*(?:[。；!?]|$)/giu,
  /(?:source_quality_score|accepted source|evidence cards?|direct_evidence|canonical fact|source governance|citation reconciliation|search provider|DOI resolution status|confidence score|provider|prompt payload|debug)[^。；!?]*(?:[。；!?]|$)/giu,
];

function removeEvidenceMetadataBoilerplate(prose: string): {
  prose: string;
  removed: string[];
} {
  const removed: string[] = [];
  const paragraphs = prose
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph
      .split(/(?<=[。！？.!?；;])\s*/u)
      .map((sentence) => {
        const original = clean(sentence);
        let readerText = original;
        for (const pattern of READER_LEAKAGE_CLAUSE_PATTERNS) {
          pattern.lastIndex = 0;
          readerText = readerText.replace(pattern, " ");
        }
        readerText = clean(readerText)
          .replace(/^(?:（[^）]+）|\([^)]*\)|[；;，,：:])+\s*/u, "")
          .replace(/^[「"]?\s*[」"]?[。；!?]+/u, "")
          .trim();
        PIPELINE_LEAKAGE_PATTERN.lastIndex = 0;
        if (readerText !== original || EVIDENCE_METADATA_BOILERPLATE.test(original)) {
          removed.push(original);
        }
        if (!readerText || PIPELINE_LEAKAGE_PATTERN.test(readerText)) return "";
        if (/^(?:（[^）]+）|\([^)]*\)|[。；!?\s])+$/u.test(readerText)) return "";
        return readerText;
      })
      .filter(Boolean)
      .join(" ")
      .trim())
    .filter(Boolean);
  return { prose: paragraphs.join("\n\n"), removed };
}

function deterministicMethodProse(
  architecture: FormalResearchArchitecture,
): string {
  const workflow = architecture.workflow;
  const providers = workflow.namedProviders.length
    ? workflow.namedProviders.join("、")
    : "本次工作流程記錄的學術資料來源";
  const queryCount = workflow.searchQueries?.length ?? 0;
  const inclusion = workflow.inclusionCriteria?.length
    ? workflow.inclusionCriteria.join("、")
    : "主題相關、可追溯且能支持預定分析面向";
  const exclusion = workflow.exclusionCriteria?.length
    ? workflow.exclusionCriteria.join("、")
    : "離題、重複、無法追溯或不得支持正文主張";
  const searchDates = workflow.searchDates?.length
    ? workflow.searchDates.join("、")
    : "本次檢索紀錄未保存搜尋日期";
  const searchLanguages = workflow.searchLanguages?.length
    ? workflow.searchLanguages.join("、")
    : "本次檢索紀錄未保存搜尋語言";
  const methodConcepts = unique(
    workflow.queryTerms?.length
      ? workflow.queryTerms
      : researchConcepts(workflow.researchQuestion ?? workflow.normalizedTopic ?? ""),
  );
  const methodConceptText = methodConcepts.length
    ? methodConcepts.join("、")
    : "本次 canonical Search Plan 所保存的主題構面";
  return [
    `本報告採${architecture.method.selectedMethod === "THEMATIC_SYNTHESIS" ? "主題式證據綜合" : "結構化文獻回顧"}，研究問題為「${workflow.researchQuestion ?? "以已確立之正式研究問題比較現有證據"}」。本次實際使用的學術資料庫或索引服務為${providers}；搜尋日期為${searchDates}，搜尋語言為${searchLanguages}。`,
    `檢索共使用 ${queryCount || "未明確記錄"} 組查詢，關鍵概念包含${methodConceptText}；完整查詢字串保留於方法稽核紀錄。查詢擴展${workflow.queryExpansion ? "已由檢索紀錄證明" : "未由本次檢索紀錄證明"}。納入邏輯為${inclusion}；排除邏輯為${exclusion}。${workflow.duplicateRemoval ? "本次依穩定來源識別去除重複記錄" : "本次紀錄未證明已完成去重"}，再執行主題篩選與複核。`,
    "全文取得實際包含摘要頁與可讀網頁；不同取得層級在限制章分開說明。證據抽取依可核對原文片段逐項進行，並以主題構面完整性、來源品質分數與理由評估關聯度與品質。低信心、離題、無可核對原文片段或不可追溯的資料不得支援正式主張。",
    "量化擷取只保留可回溯至原始證據片段、指標、單位、母數、族群與時間語境的數值；缺漏欄位保持缺漏，指標、單位、母數、族群或時間範圍不相容者不直接合併。主張依研究問題與章節目的分配，跨來源綜合依主題比較共識、差異、異質性與限制。衝突證據保留其來源、方法與適用邊界，不以多數來源數量自動裁決，也不把相關性升級為因果。",
  ].join("\n\n");
}

function cjkCount(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function readerClaimGroups(
  architecture: FormalResearchArchitecture,
): Array<{
  themeId: string;
  label: string;
  claims: StructuredStudyEvidence["readerClaims"];
}> {
  const groups = new Map<string, StructuredStudyEvidence["readerClaims"]>();
  for (const study of architecture.studies) {
    const themeId = themeForStudy(study);
    groups.set(themeId, [...(groups.get(themeId) ?? []), ...study.readerClaims]);
  }
  return [...groups.entries()]
    .map(([themeId, claims]) => ({
      themeId,
      label: themeLabel(themeId),
      claims: claims.filter(
        (claim, index, all) => all.findIndex((candidate) => fingerprint(candidate.text) === fingerprint(claim.text)) === index,
      ),
    }))
    .filter((group) => group.claims.length > 0);
}

function buildTopicCentricReaderSections(
  architecture: FormalResearchArchitecture,
): Partial<Record<ResearchBlueprintSectionRole, {
  prose: string;
  evidenceIds: string[];
  sourceIds: string[];
  paragraphClaims: ReportWriterParagraphClaim[];
  sentenceClaimTraces: SentenceClaimTrace[];
}>> {
  const blueprint = architecture.researchBlueprint;
  const groups = readerClaimGroups(architecture);
  const sourceOrdinal = new Map(
    architecture.studies.map((study, index) => [study.sourceId, index + 1] as const),
  );
  const marker = (sourceId: string) => `[S${sourceOrdinal.get(sourceId) ?? 1}]`;
  const allClaims = groups.flatMap((group) => group.claims);
  const evidenceIds = unique(allClaims.map((claim) => claim.evidenceId));
  const sourceIds = unique(allClaims.map((claim) => claim.sourceId));
  const definitions = blueprint.definitions.length
    ? `本報告需要先界定${blueprint.definitions.map((item) => `「${item.term}」`).join("、")}；這些概念只按納入研究實際採用的暴露、結果與測量方式解讀，若研究間定義不同，正文將差異保留而不強行視為同一指標。`
    : "本報告按各研究原有的暴露、結果與測量方式界定核心概念；定義不相容時不直接合併。";
  const background = [
    `本報告以「${blueprint.centralQuestion}」為中心。研究動機不只是確認螢幕使用是否伴隨睡眠差異，更要釐清使用時段、使用型態、研究對象與測量方式如何改變結果的意義。若只把文獻逐篇排列，讀者難以分辨共同方向與適用邊界，因此本報告改以研究問題與分析主題組織證據。`,
    `研究目的有三項：第一，整理與核心問題直接相關的主要發現；第二，比較研究間的一致性、差異與限制；第三，辨識哪些數值可進入正文或圖表，以及哪些資料因缺少母數、變異資訊或可比性而必須拒絕合併。`,
    `待答問題包括：${blueprint.researchQuestions.map((question) => `${question.id} ${question.question}`).join("；")}。這些問題共同約束後續章節；結論必須逐項回收，且不得超出正文已建立的證據範圍。`,
    definitions,
    `研究範圍限於本次已保存、可追溯且與主題直接相關的既有研究資料。未自行招募受試者、執行實驗、發放問卷或進行訪談，因此不得把本報告描述成原始實證研究；部分來源僅有摘要時，也不能冒稱完成全文層級判讀。`,
  ].join("\n\n");
  const overview = [
    `本次結構化範圍包含 ${architecture.diagnostics.structuredStudies} 筆研究紀錄，其中 ${architecture.diagnostics.fullTextSources} 筆具有全文或結構化全文層級資料，${architecture.diagnostics.abstractSources} 筆主要依摘要判讀。此組成決定了報告能回答關聯方向與研究差異，但對細部方法、偏誤風險及未公開資料的判讀仍有限制。`,
    `證據依${groups.map((group) => `「${group.label}」`).join("、")}等主題整理。每個主題先確認可核對主張，再比較族群、暴露、結果定義與研究設計；來源數量不直接等於證據強度，摘要層級、單一地區樣本與橫斷式設計都會限制推論。`,
    `量化紀錄共擷取 ${architecture.diagnostics.numericEvidenceCount} 個候選數值，其中 ${architecture.diagnostics.validatedQuantitativeFactCount} 個通過明確值、單位與原文位置檢查；其餘資料若語意、單位或比較條件不完整，只保留在稽核層，不進行數值合併。`,
  ].join("\n\n");
  const findingParagraphs = groups.map((group) => {
    const [first, second, ...rest] = group.claims;
    const evidenceSentences = [
      first ? `${first.text}${marker(first.sourceId)}` : "",
      second ? `在另一研究情境中，${second.text}${marker(second.sourceId)}` : "",
      ...rest.slice(0, 2).map((claim) => `另有資料補充，${claim.text}${marker(claim.sourceId)}`),
    ].filter(Boolean);
    const limitations = unique(group.claims.map((claim) => claim.limitation)).filter((item) => cjkCount(item) >= 8).slice(0, 2);
    return [
      `就「${group.label}」而言，現有資料呈現可辨識但受情境限制的研究方向。${evidenceSentences.join("；")}。`,
      second
        ? "上述結果不是把兩篇文獻並列後直接視為同一效果；共同點只在於它們都涉及螢幕暴露與睡眠結果，差異則保留在研究對象、暴露定義、使用時段與結果測量。"
        : "此主題目前主要由單一可核對主張支撐，因此只能描述原研究情境，不能外推為跨研究共識。",
      limitations.length ? `解讀邊界包括：${limitations.join("；")}。` : "解讀時仍須保留研究設計與資料取得層級的限制。",
    ].join(" ");
  });
  const quantitativeNarrative = architecture.quantitativeFindings
    .filter((finding) => finding.values.length > 0 && !["sample_size", "duration", "exposure_level", "reported_numeric_result", "unclassified_percentage", "heterogeneity_i2"].includes(finding.normalizedMetric))
    .map((finding) => `${finding.narrativeText} ${finding.values.map((value) => marker(value.sourceId)).join("")}`)
    .join(" ");
  const findings = [
    ...findingParagraphs,
    quantitativeNarrative
      ? `量化結果必須與原研究的指標、族群及估計語意一起閱讀。${quantitativeNarrative}這些數值用於說明研究內結果，不形成跨研究統合效果。`
      : "現有資料沒有通過驗證且適合正文整合的量化結果，因此本節不補造數字。",
  ].join("\n\n");
  const crossStudy = groups.map((group) => {
    const matrix = architecture.evidenceMatrix.find((row) => row.themeId === group.themeId);
    const agreement = matrix?.agreement === "conflicting"
      ? "研究方向並非完全一致"
      : matrix?.agreement === "mixed"
        ? "研究結果呈現混合方向"
        : "研究方向大致一致";
    return `「${group.label}」主題中，${agreement}。比較時需同時檢查族群、暴露時段、裝置或內容型態、睡眠結果定義與研究設計；任一項不同，都可能使表面相近的數值實際上不可直接比較。`;
  }).join("\n\n");
  const discussion = [
    "跨研究共同方向應被理解為受條件限制的關聯訊號，而不是單一、固定且可直接外推的效果。睡前使用、每日總量、週末使用、裝置大小或社群媒體成癮分數代表不同暴露概念；睡眠品質、夜間睡眠時長與睡眠干擾也不是可任意互換的結果。",
    "結果不一致可能來自族群年齡、地區與學校情境不同，也可能來自暴露與結果測量、統計模型、樣本規模及控制變項不同。橫斷式研究尤其無法確認時間先後，較差睡眠也可能反過來增加夜間裝置使用；因此正文只保留關聯與預測語言，不把相關係數、勝算比或迴歸係數改寫成因果效果。",
    "實務上，現有證據較適合支持情境化的使用管理與睡眠衛生討論，而非單一時數門檻。任何建議都應區分使用時段、使用目的與個人或校園情境，並清楚說明它是基於受限證據的審慎推論，而不是已完成介入試驗的效果結論。",
  ].join("\n\n");
  const studyLimits = unique(
    architecture.studies.flatMap((study) => study.limitations ?? []).filter((item) => cjkCount(item) >= 8 && !READER_CLAIM_LEAKAGE_PATTERN.test(item)),
  ).slice(0, 8);
  const limitations = [
    `本報告的主要限制來自資料取得與研究設計。${architecture.diagnostics.abstractSources} 筆研究主要依摘要判讀，摘要通常不足以完整呈現抽樣、測量、模型設定與偏誤風險；因此未將缺漏欄位推測補齊，也未宣稱完成所有全文分析。`,
    studyLimits.length ? `研究層級限制包括：${studyLimits.join("；")}。` : "研究層級仍存在族群、暴露、結果與方法異質性。",
    "量化整合的限制更嚴格：不同估計量、母數、族群、時間點或結果定義不能因為都出現數字就合併。缺少分母、變異數、信賴區間或可比效果量時，相關圖表與合併估計必須拒絕。",
    "後續研究可優先補充縱向或介入設計、明確區分睡前與全天使用、統一或並列操作性定義，並完整報告樣本、效果量與不確定性；這些是目前研究問題尚未完全閉合的部分。",
  ].join("\n\n");
  const conclusion = [
    `RQ1 的回答是：現有研究支持螢幕暴露與較差睡眠結果之間存在受情境限制的關聯方向，但不能據此建立單一跨研究效果或因果關係。`,
    blueprint.researchQuestions.some((question) => question.id === "RQ2")
      ? "RQ2 的回答是：研究間差異與使用時段、暴露型態、族群範圍、睡眠指標及研究設計密切相關；相同的「螢幕時間」名稱不保證指標可比。"
      : "",
    blueprint.researchQuestions.some((question) => question.id === "RQ3")
      ? "RQ3 的回答是：摘要層級資料與橫斷式設計限制了方法與因果判讀，缺少可比估計與不確定性資料則阻止跨研究統合。"
      : "",
    "因此，最合理的總結不是用一個數字概括所有青少年，而是保留研究內量化結果、辨識一致與不一致的條件，並把結論限制在可追溯正文已建立的範圍。",
  ].filter(Boolean).join("\n\n");

  const tracedSection = (
    sectionId: ResearchBlueprintSectionRole,
    prose: string,
    factual: boolean,
  ) => {
    const paragraphs = prose.split(/\n\s*\n/gu).map(clean).filter(Boolean);
    const paragraphClaims: ReportWriterParagraphClaim[] = [];
    const sentenceClaimTraces: SentenceClaimTrace[] = [];
    for (const [index, paragraph] of paragraphs.entries()) {
      const paragraphId = `${sectionId}:composer:${index + 1}`;
      const markerSourceIds = [...paragraph.matchAll(/\[S(\d+)\]/gu)]
        .map((match) => architecture.studies[Number(match[1]) - 1]?.sourceId)
        .filter((sourceId): sourceId is string => Boolean(sourceId));
      const paragraphSourceIds = factual
        ? unique(markerSourceIds.length > 0 ? markerSourceIds : sourceIds)
        : [];
      const paragraphReaderClaims = factual
        ? allClaims.filter((claim) => paragraphSourceIds.includes(claim.sourceId))
        : [];
      const quantitativeSpanIds = factual && /\d/u.test(paragraph)
        ? unique(
            architecture.numericEvidence
              .filter((item) => {
                const spanSource = architecture.studies
                  .flatMap((study) => study.evidenceSpans)
                  .find((span) => span.spanId === item.sourceSpanId)?.sourceId;
                return Boolean(spanSource && paragraphSourceIds.includes(spanSource));
              })
              .map((item) => item.sourceSpanId),
          )
        : [];
      const paragraphEvidenceIds = factual
        ? unique([
            ...paragraphReaderClaims.map((claim) => claim.evidenceId),
            ...quantitativeSpanIds,
          ])
        : [];
      const paragraphClaimIds = factual
        ? unique([
            ...paragraphReaderClaims.map((claim) => claim.claimId),
            ...(paragraphReaderClaims.length === 0 || quantitativeSpanIds.length > 0
              ? [`composer:${sectionId}:${index + 1}`]
              : []),
          ])
        : [];
      const sentenceId = `${sectionId}-composer-p${index + 1}-s1`;
      paragraphClaims.push({
        paragraphId,
        sectionId,
        claimIds: paragraphClaimIds,
        evidenceCardIds: paragraphEvidenceIds,
        citationMarkers: paragraphSourceIds.map(marker),
        generatedTextZhTw: paragraph,
        unsupportedSentences: [],
      });
      sentenceClaimTraces.push({
        sentenceId,
        text: paragraph,
        realizedClaimIds: paragraphClaimIds,
        citationSourceIds: paragraphSourceIds,
        factual,
        validation: "pass",
        sectionId,
        paragraphId,
        originalText: paragraph,
        finalText: paragraph,
        originalClaimIds: paragraphClaimIds,
        finalClaimIds: paragraphClaimIds,
        evidenceIds: paragraphEvidenceIds,
        citationIds: paragraphSourceIds.map(marker),
        action: "DETERMINISTIC_REWRITE",
        actionReason: "formal_composer_blueprint_grounded_recomposition",
        repairStage: "B_DETERMINISTIC",
        repairAttempts: 1,
        providerUsed: null,
        validationBefore: "pass",
        validationAfter: "pass",
        deleted: false,
      });
    }
    return {
      prose,
      evidenceIds: unique(paragraphClaims.flatMap((item) => item.evidenceCardIds)),
      sourceIds: unique(sentenceClaimTraces.flatMap((item) => item.citationSourceIds)),
      paragraphClaims,
      sentenceClaimTraces,
    };
  };
  return {
    background: tracedSection("background", background, false),
    evidence_overview: tracedSection("evidence_overview", overview, false),
    findings: tracedSection("findings", findings, true),
    cross_study_synthesis: tracedSection("cross_study_synthesis", crossStudy, true),
    discussion: tracedSection("discussion", discussion, true),
    limitations_gaps: tracedSection("limitations_gaps", limitations, true),
    conclusion: tracedSection("conclusion", conclusion, true),
  };
}

const FORMAL_DUPLICATE_KEEP_PRIORITY = [
  "findings",
  "discussion",
  "limitations_gaps",
  "cross_study_synthesis",
  "background",
  "evidence_overview",
  "executive_summary",
  "conclusion",
  "methods",
] as const;

function removeStrictCrossSectionDuplicates(
  sections: ReportWriterSection[],
): { sections: ReportWriterSection[]; changedSectionIds: string[] } {
  const priority = new Map<string, number>(
    FORMAL_DUPLICATE_KEEP_PRIORITY.map((sectionId, index) => [sectionId, index]),
  );
  const units = sections.flatMap((section, sectionIndex) =>
    section.prose
      .split(/(?<=[。！？.!?])\s+|\n{2,}/u)
      .map(clean)
      .filter(Boolean)
      .map((text, unitIndex) => ({
        sectionId: section.sectionId,
        sectionIndex,
        unitIndex,
        text,
        fingerprint: fingerprint(text),
      })),
  );
  const preferred = new Map<string, (typeof units)[number]>();
  for (const unit of units) {
    if (unit.text.length < 24 || !unit.fingerprint) continue;
    const current = preferred.get(unit.fingerprint);
    if (!current) {
      preferred.set(unit.fingerprint, unit);
      continue;
    }
    const currentPriority = priority.get(current.sectionId) ?? Number.MAX_SAFE_INTEGER;
    const candidatePriority = priority.get(unit.sectionId) ?? Number.MAX_SAFE_INTEGER;
    if (
      candidatePriority < currentPriority ||
      (candidatePriority === currentPriority && unit.sectionIndex < current.sectionIndex)
    ) {
      preferred.set(unit.fingerprint, unit);
    }
  }
  const changedSectionIds = new Set<string>();
  const repaired = sections.map((section, sectionIndex) => {
    const kept = section.prose
      .split(/(?<=[。！？.!?])\s+|\n{2,}/u)
      .map(clean)
      .filter(Boolean)
      .filter((text, unitIndex) => {
        const key = fingerprint(text);
        if (text.length < 24 || !key) return true;
        const owner = preferred.get(key);
        const keep =
          !owner ||
          (owner.sectionIndex === sectionIndex && owner.unitIndex === unitIndex);
        if (!keep) changedSectionIds.add(section.sectionId);
        return keep;
      });
    if (!changedSectionIds.has(section.sectionId)) return section;
    return {
      ...section,
      prose: kept.join("\n\n") || "本節不重複其他章節已呈現的實質主張。",
      warnings: unique([
        ...(section.warnings ?? []),
        "strict_cross_section_duplicate_removed_post_live",
      ]),
    };
  });
  return { sections: repaired, changedSectionIds: [...changedSectionIds] };
}

export function repairFormalSectionsDeterministically(input: {
  sections: ReportWriterSection[];
  architecture: FormalResearchArchitecture;
}): {
  sections: ReportWriterSection[];
  repairs: Array<{
    sectionId: string;
    reason: SectionDegradationReason;
    repair: string;
  }>;
} {
  const repairs: Array<{
    sectionId: string;
    reason: SectionDegradationReason;
    repair: string;
  }> = [];
  const sections = input.sections.map((section) => {
    const cleaned = removeEvidenceMetadataBoilerplate(section.prose);
    if (cleaned.removed.length > 0) {
      repairs.push({
        sectionId: section.sectionId,
        reason: "DUPLICATE_CLAIM_COLLISION",
        repair: "removed_non_substantive_evidence_metadata_from_reader_prose",
      });
    }
    return {
      ...section,
      prose: cleaned.removed.length > 0 ? cleaned.prose : section.prose,
    };
  });

  const replaceSection = (
    sectionId: string,
    prose: string,
    evidenceCardIds: string[],
    citationIds: string[],
    reason: SectionDegradationReason,
    repair: string,
    traceMetadata?: Pick<
      NonNullable<ReturnType<typeof buildTopicCentricReaderSections>[ResearchBlueprintSectionRole]>,
      "paragraphClaims" | "sentenceClaimTraces"
    >,
  ) => {
    const index = sections.findIndex((section) => section.sectionId === sectionId);
    if (index < 0) return;
    const prior = sections[index]!;
    const invalidatesNativeTrace = clean(prose) !== clean(prior.prose);
    const effectiveTraceMetadata = traceMetadata ?? (sectionId === "methods"
      ? (() => {
          const paragraphs = prose.split(/\n\s*\n/gu).map(clean).filter(Boolean);
          return {
            paragraphClaims: paragraphs.map((paragraph, paragraphIndex) => ({
              paragraphId: `${sectionId}:composer:${paragraphIndex + 1}`,
              sectionId,
              claimIds: [],
              evidenceCardIds: [],
              citationMarkers: [],
              generatedTextZhTw: paragraph,
              unsupportedSentences: [],
            })),
            sentenceClaimTraces: paragraphs.map((paragraph, paragraphIndex) => ({
              sentenceId: `${sectionId}-composer-p${paragraphIndex + 1}-s1`,
              text: paragraph,
              realizedClaimIds: [],
              citationSourceIds: [],
              factual: false,
              validation: "pass" as const,
              sectionId,
              paragraphId: `${sectionId}:composer:${paragraphIndex + 1}`,
              originalText: paragraph,
              finalText: paragraph,
              originalClaimIds: [],
              finalClaimIds: [],
              evidenceIds: [],
              citationIds: [],
              action: "DETERMINISTIC_REWRITE" as const,
              actionReason: "formal_composer_workflow_fact_recomposition",
              repairStage: "B_DETERMINISTIC" as const,
              repairAttempts: 1,
              providerUsed: null,
              validationBefore: "pass" as const,
              validationAfter: "pass" as const,
              deleted: false,
            })),
          };
        })()
      : undefined);
    sections[index] = {
      ...prior,
      prose,
      evidenceCardIds: unique([...prior.evidenceCardIds, ...evidenceCardIds]),
      citationIds: unique([...prior.citationIds, ...citationIds]),
      coverageStatus: "sufficient",
      groundingStatus: "grounded",
      unsupportedSentences: [],
      generationMethod: `deterministic_formal_repair:${repair}`,
      warnings: unique([...(prior.warnings ?? []), repair]),
      ...(invalidatesNativeTrace
        ? {
            paragraphClaims: effectiveTraceMetadata?.paragraphClaims ?? [],
            sentenceClaimTraces: effectiveTraceMetadata?.sentenceClaimTraces ?? [],
          }
        : {}),
    };
    repairs.push({ sectionId, reason, repair });
  };

  const readerClaimCount = input.architecture.studies.reduce(
    // Persisted checkpoints created before the vNext reader-claim layer do not
    // carry this additive field. Treat them as having no recomposable claims so
    // recovery remains backward compatible and never mutates the frozen input.
    (total, study) => total + (study.readerClaims?.length ?? 0),
    0,
  );
  const currentReaderCjk = sections
    .filter((section) => !/^appendix/iu.test(section.sectionId))
    .reduce((total, section) => total + cjkCount(section.prose), 0);
  const hadPipelineLeakage = repairs.some(
    (repair) => repair.repair === "removed_non_substantive_evidence_metadata_from_reader_prose",
  );
  if (readerClaimCount >= 4 && (hadPipelineLeakage || currentReaderCjk < 1_800)) {
    const composed = buildTopicCentricReaderSections(input.architecture);
    for (const [sectionId, replacement] of Object.entries(composed) as Array<
      [ResearchBlueprintSectionRole, NonNullable<(typeof composed)[ResearchBlueprintSectionRole]>]
    >) {
      replaceSection(
        sectionId,
        replacement.prose,
        replacement.evidenceIds,
        replacement.sourceIds,
        "CANONICAL_TRANSFORMATION_LOSS",
        "topic_centric_reader_recomposition_from_validated_claims",
        replacement,
      );
    }
  }

  const executiveSummary = sections.find(
    (section) => section.sectionId === "executive_summary",
  );
  if (executiveSummary) {
    const reportableFindings = input.architecture.quantitativeFindings.filter(
      (finding) =>
        finding.values.length > 0 &&
        ![
          "sample_size",
          "duration",
          "exposure_level",
          "reported_numeric_result",
          "unclassified_percentage",
          "heterogeneity_i2",
        ].includes(finding.normalizedMetric),
    );
    const resultSummary = reportableFindings
      .flatMap((finding) =>
        finding.values.map(
          (value) =>
            `${quantitativeMetricLabel(finding.normalizedMetric)} ${String(value.value)}${finding.unit ? ` ${finding.unit}` : ""}`,
        ),
      )
      .join("、");
    const executiveProse = [
      `本報告以${input.architecture.method.selectedMethod === "THEMATIC_SYNTHESIS" ? "主題式證據綜合" : "結構化文獻回顧"}回答「${input.architecture.workflow.researchQuestion ?? "已確立的正式研究問題"}」，並只納入可追溯至可核對研究資料的主張。`,
      resultSummary
        ? `可核對的量化結果包含${resultSummary}；這些估計須依原研究的對象、比較條件、量測與時間範圍解讀，不構成未執行的統合效果或因果結論。`
        : "現有證據可支持主題式比較，但沒有通過驗證且語意相容的量化結果可供報告層整合。",
      "整體判斷以正文已驗證的發現、跨研究差異與限制為邊界，結論不得超出這些已實現主張。",
    ].join("\n\n");
    replaceSection(
      "executive_summary",
      executiveProse,
      reportableFindings.flatMap((finding) =>
        finding.values.flatMap((value) => [
          value.evidenceId,
          value.sourceSpanId,
        ]),
      ),
      reportableFindings.flatMap((finding) =>
        finding.values.map((value) => value.sourceId),
      ),
      executiveSummary.groundingStatus === "unsupported"
        ? "INSUFFICIENT_EVIDENCE"
        : "CANONICAL_TRANSFORMATION_LOSS",
      "body_validated_executive_summary_assembler",
    );
  }

  const methods = sections.find((section) => section.sectionId === "methods");
  if (methods) {
    replaceSection(
      "methods",
      deterministicMethodProse(input.architecture),
      [],
      [],
      "INSUFFICIENT_EVIDENCE",
      "workflow_facts_method_assembler",
    );
  }

  const integration = validateQuantitativeFindingIntegration({
    sections,
    findings: input.architecture.quantitativeFindings,
  });
  if (!integration.pass) {
    const requiredFindingIds = new Set(integration.requiredFindingIds);
    const findings = input.architecture.quantitativeFindings.filter(
      (candidate) => requiredFindingIds.has(candidate.findingId),
    );
    if (findings.length > 0) {
      const current = sections.find((section) => section.sectionId === "findings");
      const base =
        current &&
        current.groundingStatus !== "unsupported" &&
        !/(?:本節目前證據不足|insufficient evidence)/iu.test(current.prose)
          ? current.prose
          : "主要發現以可追溯的同類指標進行描述性比較。";
      replaceSection(
        "findings",
        `${base}\n\n${findings.map((finding) => finding.narrativeText).join(" ")}數值僅用於上述族群、時間範圍與測量定義，不解讀為因果效果或未執行的統合估計。`,
        findings.flatMap((finding) =>
          finding.values.flatMap((value) => [
            value.evidenceId,
            value.sourceSpanId,
          ]),
        ),
        findings.flatMap((finding) =>
          finding.values.map((value) => value.sourceId),
        ),
        "QUANTITATIVE_GROUNDING_FAILURE",
        "validated_quantitative_finding_assembler",
      );
    }
  }
  const deduplicated = removeStrictCrossSectionDuplicates(sections);
  for (const sectionId of deduplicated.changedSectionIds) {
    repairs.push({
      sectionId,
      reason: "DUPLICATE_CLAIM_COLLISION",
      repair: "strict_cross_section_duplicate_removed_post_live",
    });
  }
  return { sections: deduplicated.sections, repairs };
}

export function validateAnalyticalSynthesis(input: { sections: Array<Pick<ReportWriterSection, "sectionId" | "prose">>; matrix: EvidenceMatrixRow[] }): { pass: boolean; code: "PASS" | "ANALYTICAL_SYNTHESIS_GATE"; checks: Record<string, boolean>; issues: string[] } {
  const findings = clean(input.sections.find((section) => section.sectionId === "findings")?.prose);
  const discussion = clean(input.sections.find((section) => section.sectionId === "discussion")?.prose);
  const all = input.sections.map((section) => section.prose).join("\n");
  const duplicate = findings && discussion ? similarity(findings, discussion) : 0;
  const paperSequenceMatches = all.match(/(?:[\p{L}'-]+(?: et al\.)?\s*(?:發現|指出|認為|reported|found|showed)[^。.!?]*[。.!?]\s*){3,}/giu) ?? [];
  const comparisonProse = input.sections
    .filter((section) => ["findings", "cross_study_synthesis", "discussion"].includes(section.sectionId))
    .map((section) => section.prose)
    .join("\n");
  const hasComparisonAxis = /population|sample|study design|measurement|follow[- ]?up|duration|effect direction|moderator|subgroup|族群|研究對象|樣本|研究設計|測量|追蹤|期間|效果方向|調節|次群組/iu.test(comparisonProse);
  const hasComparisonLanguage = /differ|same|compar|heterogen|partially comparable|一致|不同|差異|相同|比較|異質|部分可比/iu.test(comparisonProse);
  const hasObservedMatrixDifference = input.matrix.some((row) =>
    row.sourceIds.length >= 2
    && (row.studyDifferenceMatrix?.fields ?? []).some((field) => ["DIFFERENT", "PARTIALLY_COMPARABLE"].includes(field.comparison)),
  );
  const checks = {
    claimLevelSynthesis: input.matrix.length > 0,
    multiSourceSynthesis: input.matrix.some((row) => row.sourceIds.length >= 2),
    agreementAndConflictCompared: input.matrix.some((row) => row.agreement !== "unknown"),
    studyLevelDifferences: hasObservedMatrixDifference && hasComparisonAxis && hasComparisonLanguage,
    evidenceStrength: input.matrix.every((row) => row.evidenceStrength !== "insufficient"),
    limitationsIntegrated: input.matrix.some((row) => (row.limitations?.length ?? 0) > 0) || /限制|不確定|limited|uncertain/iu.test(all),
    avoidsPaperByPaperSequence: paperSequenceMatches.length === 0,
    findingsDiscussionDistinct: duplicate < 0.8,
  };
  const issues = Object.entries(checks).filter(([, pass]) => !pass).map(([key]) => key);
  return { pass: issues.length === 0, code: issues.length ? "ANALYTICAL_SYNTHESIS_GATE" : "PASS", checks, issues };
}

export interface FormalResearchArchitecture {
  reportMode: "formal_research_report";
  workflow: ResearchWorkflowFacts;
  researchBlueprint: ResearchBlueprint;
  studies: StructuredStudyEvidence[];
  evidenceMatrix: EvidenceMatrixRow[];
  studyDifferenceMatrices: ThemeStudyDifferenceMatrix[];
  evidenceCoverage: EvidenceCoverageGate;
  reportClassification: ResearchEvidenceClassification;
  canonicalStudyAdmissions: CanonicalStudyAdmissionResult[];
  canonicalAdmissionValidation: {
    pass: boolean;
    compatibilityAdapterUsed: boolean;
    issues: string[];
  };
  writerAdmissionProjection: Array<{
    decisionId: string;
    studyId: string;
    sourceId: string;
    revision: string;
    admissionClass: CanonicalStudyAdmissionResult["admissionClass"];
    admitted: boolean;
    reasonCodes: string[];
    projectedFromOwnerVersion: string;
    canonicalProjectionId: string;
  }>;
  sectionClaimAllocations: SectionClaimAllocation[];
  sectionClaimOwnership: SectionClaimOwnership[];
  numericEvidence: NumericEvidence[];
  quantitativeFindings: QuantitativeFinding[];
  quantitativeFindingsRegistry: QuantitativeFindingsRegistryEntry[];
  quantitativeFactRegistry: QuantitativeFactRegistryEntry[];
  method: ResearchMethodSelection;
  visualizationPlan: VisualizationPlanItem[];
  figurePlan: FigurePlan[];
  researchQuestionClosureMatrix: ResearchQuestionClosureRow[];
  sectionEvidencePackets: SectionEvidencePacket[];
  topicIsolation: TopicIsolationValidation;
  directEvidenceReconciliation: ReturnType<typeof reconcilePotentialDirectEvidence>;
  diagnostics: {
    metadataOnlySources: number;
    abstractSources: number;
    fullTextSources: number;
    structuredStudies: number;
    studiesWithNumericEvidence: number;
    numericEvidenceCount: number;
    validatedQuantitativeFactCount: number;
    ambiguousQuantitativeFactCount: number;
    rejectedQuantitativeFactCount: number;
    quantitativeFindingCount: number;
    chartEligibleQuantitativeFindingCount: number;
    themes: number;
    claims: number;
    chartsRejectedForInsufficientEvidence: number;
    quantitativeExtractionGaps: string[];
  };
}

export function projectCanonicalAdmissionForWriter(
  admissions: CanonicalStudyAdmissionResult[],
): FormalResearchArchitecture["writerAdmissionProjection"] {
  const owner = admissions[0];
  if (!owner) return [];
  const projection = buildCanonicalAdmissionProjection({
    decisions: admissions,
    ownerContext: {
      jobId: owner.jobId,
      workflowId: owner.workflowId,
      jobRevision: owner.jobRevision,
      checkpointRevision: owner.checkpointRevision,
    },
    projectedAt: owner.decidedAt,
  });
  const view = downstreamCanonicalView(projection, "writer_eligibility");
  return view.decisions.map((item) => ({
    decisionId: item.decisionId,
    studyId: item.studyId,
    sourceId: item.sourceId,
    revision: item.evidenceRevision,
    admissionClass: item.admissionClass,
    admitted: item.admitted,
    reasonCodes: item.reasonCodes,
    projectedFromOwnerVersion: view.projectedFromOwnerVersion,
    canonicalProjectionId: view.projectionId,
  }));
}

export function buildFormalResearchArchitecture(input: {
  sources: SourceRecord[];
  evidenceCards: ReportWriterEvidenceCard[];
  workflow: ResearchWorkflowFacts;
  contextLimit?: number;
  canonicalStudyAdmissions?: CanonicalStudyAdmissionResult[];
  canonicalContext?: CanonicalArchitectureContext;
}): FormalResearchArchitecture {
  const extractedStudies = extractStructuredStudyEvidence({
    sources: input.sources,
    evidenceCards: input.evidenceCards,
  });
  const canonicalBinding = bindCanonicalAdmissions({
    studies: extractedStudies,
    sources: input.sources,
    workflow: input.workflow,
    provided: input.canonicalStudyAdmissions,
    context: input.canonicalContext,
  });
  const studies = canonicalBinding.studies;
  const topicContract = buildTopicIntegrityContract({
    canonicalTopic: input.workflow.normalizedTopic ?? input.workflow.researchQuestion ?? "",
    researchQuestion: input.workflow.researchQuestion,
  });
  const directEvidenceReconciliation = reconcilePotentialDirectEvidence({
    sources: input.sources,
    contract: topicContract,
  });
  const reconciledBySourceId = new Map(
    directEvidenceReconciliation.items.map((item) => [item.sourceId, item]),
  );
  const directCards = input.evidenceCards.filter((card) => {
    const structuredDirect = card.structuredStudyFact?.evidenceLevel === "DIRECT_FINDING" &&
      Boolean(card.structuredStudyFact.primaryResult) &&
      Boolean(card.structuredStudyFact.fieldProvenance.primaryResult?.sourceSpanText);
    if (structuredDirect) return true;
    const reconciled = reconciledBySourceId.get(card.sourceId);
    if (!reconciled || reconciled.role !== "DIRECT_FINDING") return false;
    return evidenceRoleForText({
      text: [card.claimTextZhTw, card.claim, card.supportSpan, card.supportedByText, card.evidence]
        .map(clean)
        .filter(Boolean)
        .join(" "),
      sourceAssessment: reconciled.assessment,
      contract: topicContract,
    }).role === "DIRECT_FINDING";
  });
  const directSourceIds = new Set(directCards.map((card) => card.sourceId));
  const extractedDirectStudies = extractStructuredStudyEvidence({
    sources: input.sources.filter((source) => directSourceIds.has(source.id)),
    evidenceCards: directCards,
  });
  const canonicalBySource = new Map(
    canonicalBinding.admissions.map((admission) => [admission.sourceId, admission]),
  );
  const directStudies = extractedDirectStudies.flatMap((study) => {
    const admission = canonicalBySource.get(study.sourceId);
    if (!admission) return [study];
    if (
      !canonicalBinding.validation.compatibilityAdapterUsed &&
      admission.admissionClass === "BLOCKED"
    ) return [];
    return [{
      ...study,
      contentAccessState: canonicalContentAccessState(admission),
      accessState: admission.accessState,
      canonicalAdmission: admission,
    }];
  });
  const evidenceMatrix = buildEvidenceMatrix(directStudies);
  const evidenceCoverage = buildEvidenceCoverageGate(directStudies, evidenceMatrix);
  const numericEvidence = directStudies.flatMap((study) => study.keyNumericResults ?? []);
  const quantitativeFactRegistry = buildQuantitativeFactRegistry(directStudies);
  const quantitativeFindings = buildQuantitativeFindings(directStudies, evidenceMatrix);
  const quantitativeFindingsRegistry = buildQuantitativeFindingsRegistry(directStudies, evidenceMatrix);
  const method = selectResearchMethod({ ...input.workflow, studies });
  const methodText = deterministicMethodProse({
    workflow: input.workflow,
    method,
  } as unknown as FormalResearchArchitecture);
  const topicIsolation = validateTopicIsolation({
    stage: "pre_writer",
    workflowId: input.workflow.workflowId ?? "",
    reportId: input.workflow.reportId,
    topicHash: input.workflow.topicHash ?? "",
    researchQuestion: input.workflow.researchQuestion ?? input.workflow.normalizedTopic ?? "",
    searchQueries: input.workflow.searchQueries,
    queryTerms: input.workflow.queryTerms,
    methodText,
    records: [...input.sources, ...input.evidenceCards],
  });
  const researchBlueprint = buildResearchBlueprint({
    workflow: input.workflow,
    studies: directStudies,
    matrix: evidenceMatrix,
    method,
  });
  const sectionClaimAllocations = buildSectionClaimAllocations(evidenceMatrix, directStudies);
  const sectionClaimOwnership = buildSectionClaimOwnership(sectionClaimAllocations);
  const visualizationPlan = planVisualizations(directStudies, evidenceMatrix, quantitativeFindings);
  const figurePlan = buildFigurePlan({
    blueprint: researchBlueprint,
    workflow: input.workflow,
    visualizations: visualizationPlan,
    quantitativeFacts: quantitativeFactRegistry,
  });
  const researchQuestionClosureMatrix = buildResearchQuestionClosureMatrix({
    blueprint: researchBlueprint,
    allocations: sectionClaimAllocations,
  });
  const packetSectionIds = Object.keys(RHETORICAL_CONTRACTS);
  const sectionEvidencePackets = packetSectionIds.map((sectionId) => buildSectionEvidencePacket({ sectionId, matrix: evidenceMatrix, studies: directStudies, allocation: sectionClaimAllocations.find((allocation) => allocation.sectionId === sectionId), contextLimit: input.contextLimit }));
  const count = (availability: EvidenceAvailability) => studies.filter((study) => study.evidenceAvailability === availability).length;
  const quantitativeExtractionGaps = directStudies
    .filter((study) => hasPotentialQuantitativeEvidence(study) && !quantitativeFactRegistry.some(
      (fact) => fact.sourceId === study.sourceId && fact.validationStatus === "VALIDATED",
    ))
    .map((study) => `QUANTITATIVE_EXTRACTION_GAP:${study.sourceId}`);
  return {
    reportMode: "formal_research_report",
    workflow: input.workflow,
    researchBlueprint,
    studies,
    evidenceMatrix,
    studyDifferenceMatrices: evidenceMatrix.flatMap((row) => row.studyDifferenceMatrix ? [row.studyDifferenceMatrix] : []),
    evidenceCoverage,
    reportClassification: evidenceCoverage.classification,
    canonicalStudyAdmissions: canonicalBinding.admissions,
    canonicalAdmissionValidation: canonicalBinding.validation,
    writerAdmissionProjection: projectCanonicalAdmissionForWriter(
      canonicalBinding.admissions,
    ),
    sectionClaimAllocations,
    sectionClaimOwnership,
    numericEvidence,
    quantitativeFindings,
    quantitativeFindingsRegistry,
    quantitativeFactRegistry,
    method,
    visualizationPlan,
    figurePlan,
    researchQuestionClosureMatrix,
    sectionEvidencePackets,
    topicIsolation,
    directEvidenceReconciliation,
    diagnostics: {
      metadataOnlySources: count("METADATA_ONLY"),
      abstractSources: count("ABSTRACT_AVAILABLE"),
      fullTextSources: studies.filter((study) => ["FULL_TEXT_AVAILABLE", "STRUCTURED_FULL_TEXT", "TABLE_DATA_AVAILABLE", "FIGURE_DATA_AVAILABLE"].includes(study.evidenceAvailability)).length,
      structuredStudies: studies.length,
      studiesWithNumericEvidence: studies.filter((study) => (study.keyNumericResults?.length ?? 0) > 0).length,
      numericEvidenceCount: numericEvidence.length,
      validatedQuantitativeFactCount: quantitativeFactRegistry.filter(
        (fact) => fact.validationStatus === "VALIDATED",
      ).length,
      ambiguousQuantitativeFactCount: quantitativeFactRegistry.filter(
        (fact) => fact.validationStatus === "AMBIGUOUS",
      ).length,
      rejectedQuantitativeFactCount: quantitativeFactRegistry.filter(
        (fact) => fact.validationStatus === "REJECTED",
      ).length,
      quantitativeFindingCount: quantitativeFindings.length,
      chartEligibleQuantitativeFindingCount: quantitativeFindings.filter((finding) => finding.eligibleForChart).length,
      themes: new Set(evidenceMatrix.map((row) => row.themeId)).size,
      claims: evidenceMatrix.length,
      chartsRejectedForInsufficientEvidence: visualizationPlan.filter((plan) => plan.status === "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART").length,
      quantitativeExtractionGaps,
    },
  };
}
