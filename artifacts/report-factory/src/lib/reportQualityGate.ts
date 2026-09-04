/**
 * Deterministic, renderer-independent quality gate for a canonical report.
 *
 * The gate intentionally consumes audit facts instead of prose grades from the
 * writer model.  A reviewer model may populate an upstream audit, but it cannot
 * override the structural failures detected here.
 */

export const REPORT_QUALITY_DIMENSIONS = [
  "evidence_integrity",
  "citation_precision",
  "synthesis",
  "statistical_correctness",
  "coherence",
  "visual_effectiveness",
  "directness_honesty",
  "contradiction_handling",
  "audience_fit",
  "document_quality",
] as const;

export type ReportQualityDimension = (typeof REPORT_QUALITY_DIMENSIONS)[number];

export type QualityRetryStage =
  | "claim_citation_mapping"
  | "evidence_extraction"
  | "visual_semantic_router"
  | "narrative_planning"
  | "whole_document_editor"
  | "readiness_claim_strength"
  | "exporter_font_config"
  | "canonical_report_model"
  | "audience_report_routing";

export type QualityFailureKind =
  | "citation"
  | "number"
  | "visual"
  | "stitching"
  | "repetition"
  | "overclaim"
  | "CJK"
  | "evidence"
  | "coherence"
  | "contradiction"
  | "audience"
  | "document";

/** Public and testable routing contract. */
export const QUALITY_RETRY_ROUTES: Readonly<Record<QualityFailureKind, QualityRetryStage>> = {
  citation: "claim_citation_mapping",
  number: "evidence_extraction",
  visual: "visual_semantic_router",
  stitching: "narrative_planning",
  repetition: "whole_document_editor",
  overclaim: "readiness_claim_strength",
  CJK: "exporter_font_config",
  evidence: "evidence_extraction",
  coherence: "narrative_planning",
  contradiction: "narrative_planning",
  audience: "audience_report_routing",
  document: "canonical_report_model",
};

export const DEFAULT_QUALITY_GATE_MAX_RETRIES = 2;
export const DEFAULT_QUALITY_GATE_PASS_SCORE = 80;

export interface QualityGateFact {
  factId: string;
  sourceId?: string | null;
  evidenceId?: string | null;
  location?: string | null;
  /** Explicit audit result. When omitted, sourceId + evidenceId are required. */
  traceable?: boolean;
  containsNumber?: boolean;
  numericValue?: number | string | null;
  numberTraceable?: boolean;
  statisticInterpretationValid?: boolean;
  comparisonValid?: boolean;
}

export interface QualityGateClaim {
  claimId: string;
  sectionId?: string | null;
  location?: string | null;
  isMajor?: boolean;
  supportingFactIds?: readonly string[];
  citationIds?: readonly string[];
  citationEntailed?: boolean;
  citationIdentityMatches?: boolean;
  containsNumber?: boolean;
  numberFactIds?: readonly string[];
  directness?: "direct" | "near_direct" | "indirect" | "unknown";
  claimStrength?: string | null;
  overclaim?: boolean;
  calibratedToEvidence?: boolean;
  contradictingFactIds?: readonly string[];
  contradictionAddressed?: boolean;
}

export type CitationIssueKind =
  | "missing_citation"
  | "unsupported_citation"
  | "entailment_failure"
  | "identity_mismatch"
  | "unresolved_reference"
  | "blanket_cluster";

export interface QualityGateCitationIssue {
  kind: CitationIssueKind;
  location: string;
  reason?: string | null;
  blocksExport?: boolean;
}

export interface QualityGateSection {
  sectionId: string;
  location?: string | null;
  text?: string | null;
  substantive?: boolean;
  paperByPaper?: boolean;
  sourceSequenceMatchesInput?: boolean;
  /** 0..1, or 0..100 for callers that emit a percentage. */
  sourceOrderSimilarity?: number | null;
  coherent?: boolean;
  transitionFromPrevious?: boolean;
  repeatedWithSectionIds?: readonly string[];
  /** 0..1, or 0..100 for callers that emit a percentage. */
  repetitionRatio?: number | null;
}

export interface QualityGateVisualAudit {
  visualId: string;
  location?: string | null;
  required?: boolean;
  expectedVisualType?: string | null;
  selectedVisualType?: string | null;
  valuesTraceable?: boolean;
  dataValid?: boolean;
  renderOk?: boolean;
  helpsInterpretation?: boolean;
  sourceNotePresent?: boolean;
}

export interface QualityGateContradictionAudit {
  contradictionId: string;
  location?: string | null;
  material?: boolean;
  addressed: boolean;
  alternativeExplanationIncluded?: boolean;
}

export interface QualityGateFormatParityAudit {
  contentParity?: boolean;
  previewDocxParity?: boolean;
  previewPdfParity?: boolean;
  docxPdfParity?: boolean;
  previewReadable?: boolean;
  docxReadable?: boolean;
  pdfReadable?: boolean;
  cjkGlyphsPreserved?: boolean;
  /** Alias accepted from render audit producers. */
  cjkPreserved?: boolean;
}

export type EvidenceSufficiency = "sufficient" | "limited" | "insufficient";

export interface QualityGateAudienceArchetypeAudit {
  audienceProfileDefined?: boolean;
  audienceFit?: boolean;
  explanationDepthMatchesAudience?: boolean;
  archetypeFit?: boolean;
  reportArchetypeMatchesQuestion?: boolean;
  minimumEvidenceMet?: boolean;
  evidenceSufficiency?: EvidenceSufficiency;
  limitedEvidence?: boolean;
  reportArchetype?: string | null;
  claimsCalibratedToEvidence?: boolean;
  resultVisualsRequired?: boolean;
}

export interface QualityGateStructuralIssue {
  kind: QualityFailureKind;
  dimension: ReportQualityDimension;
  location: string;
  reason: string;
  blocksExport?: boolean;
  penalty?: number;
}

export interface QualityGateLongReportEvidence {
  requested: boolean;
  canonicalBodyCjk: number;
  supportedFactualCjk: number;
  supportedSynthesisCjk: number;
  supportedEvidenceBearingCjk: number;
  evidenceBearingRatio: number;
  duplicateRatio: number;
  unsupportedFactualClaimCount: number;
  minimumCanonicalBodyCjk: number;
  minimumSupportedEvidenceBearingCjk: number;
  minimumEvidenceBearingRatio: number;
  maximumDuplicateRatio: number;
  centralAnswerAligned: boolean;
  conclusionAligned: boolean;
  allConclusionClaimsRealizedInBody: boolean;
  conclusionClaimNovelty: number;
  thresholdsDerivedFromFixtureIds: readonly string[];
}

export interface ReportQualityGateInput {
  facts?: readonly QualityGateFact[];
  claims?: readonly QualityGateClaim[];
  sections?: readonly QualityGateSection[];
  visualAudits?: readonly QualityGateVisualAudit[];
  citationIssues?: readonly QualityGateCitationIssue[];
  contradictions?: readonly QualityGateContradictionAudit[];
  formatParity?: QualityGateFormatParityAudit | null;
  audienceArchetype?: QualityGateAudienceArchetypeAudit | null;
  structuralIssues?: readonly QualityGateStructuralIssue[];
  longReportEvidence?: QualityGateLongReportEvidence | null;
  limitedEvidence?: boolean;
  reportArchetype?: string | null;
  retryCount?: number;
  maxRetries?: number;
  passScore?: number;
}

export interface ReportQualityDimensionResult {
  score: number;
  reason: string;
  failureLocations: string[];
  retryStage: QualityRetryStage | null;
  blocksExport: boolean;
}

export interface QualityRetryInstruction {
  retryStage: QualityRetryStage;
  dimensions: ReportQualityDimension[];
  reasons: string[];
  failureLocations: string[];
  canRetry: boolean;
  nextRetryCount: number | null;
}

export interface ReportQualityGateResult {
  dimensions: Record<ReportQualityDimension, ReportQualityDimensionResult>;
  passed: boolean;
  blockExport: boolean;
  retryPlan: QualityRetryInstruction[];
  retryCount: number;
  maxRetries: number;
  exhausted: boolean;
  downgradeToLimitedBrief: boolean;
}

interface DetectedFailure {
  dimension: ReportQualityDimension;
  kind: QualityFailureKind;
  location: string;
  reason: string;
  penalty: number;
  blocksExport: boolean;
}

const RETRY_STAGE_ORDER: readonly QualityRetryStage[] = [
  "claim_citation_mapping",
  "evidence_extraction",
  "visual_semantic_router",
  "narrative_planning",
  "whole_document_editor",
  "readiness_claim_strength",
  "audience_report_routing",
  "canonical_report_model",
  "exporter_font_config",
];

const DIMENSION_PASS_REASONS: Readonly<Record<ReportQualityDimension, string>> = {
  evidence_integrity: "主要主張均連到可追溯事實與來源。",
  citation_precision: "引用映射、蘊含關係與來源身分均閉合。",
  synthesis: "未偵測到逐篇拼接或來源順序敘事。",
  statistical_correctness: "數值可追溯，統計解讀與比較方式均通過稽核。",
  coherence: "章節具實質內容且銜接、重複度稽核均通過。",
  visual_effectiveness: "視覺選型、資料與渲染稽核均通過。",
  directness_honesty: "主張強度與直接性、證據充分度一致。",
  contradiction_handling: "重要矛盾與替代解釋均已呈現。",
  audience_fit: "說明深度與報告類型符合問題與受眾。",
  document_quality: "Preview、DOCX、PDF 的內容與字形可讀性一致。",
};

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/gu, " ").trim() ?? "";
}

function boundedInteger(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function boundedScore(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratio(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value > 1 ? value / 100 : value;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map(compact).filter(Boolean))].sort();
}

function location(prefix: string, id: string, supplied?: string | null): string {
  return compact(supplied) || `${prefix}:${compact(id) || "unknown"}`;
}

function normalizedSectionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s。！？!?；;，,、：:"'“”‘’()[\]【】]/gu, "");
}

function isLimitedEvidenceArchetype(value: string | null | undefined): boolean {
  return /limited[_\s-]*evidence[_\s-]*(?:brief|report)|有限證據(?:簡報|報告)/iu.test(compact(value));
}

function detectFailures(input: ReportQualityGateInput): DetectedFailure[] {
  const failures: DetectedFailure[] = [];
  const facts = input.facts ?? [];
  const claims = input.claims ?? [];
  const sections = input.sections ?? [];
  const visualAudits = input.visualAudits ?? [];
  const factById = new Map(facts.map((fact) => [compact(fact.factId), fact] as const));

  const add = (
    dimension: ReportQualityDimension,
    kind: QualityFailureKind,
    failureLocation: string,
    reason: string,
    penalty = 35,
    blocksExport = true,
  ): void => {
    failures.push({
      dimension,
      kind,
      location: compact(failureLocation) || "report:unknown",
      reason: compact(reason),
      penalty: Math.max(0, Math.min(100, penalty)),
      blocksExport,
    });
  };

  const longReport = input.longReportEvidence;
  if (longReport?.requested) {
    if (longReport.thresholdsDerivedFromFixtureIds.length < 2) {
      add(
        "evidence_integrity",
        "evidence",
        "report:long-report-thresholds",
        "長報告門檻缺少至少兩個 accepted fixture 的推導紀錄。",
      );
    }
    if (longReport.canonicalBodyCjk < longReport.minimumCanonicalBodyCjk) {
      add("coherence", "coherence", "report:long-report-length", "Canonical 正文低於由 accepted fixtures 推導的長報告門檻。");
    }
    if (
      longReport.supportedEvidenceBearingCjk <
        longReport.minimumSupportedEvidenceBearingCjk ||
      longReport.evidenceBearingRatio < longReport.minimumEvidenceBearingRatio
    ) {
      add("evidence_integrity", "evidence", "report:evidence-bearing-content", "可追溯 factual 與 synthesis 內容低於長報告證據承載門檻。");
    }
    if (longReport.duplicateRatio > longReport.maximumDuplicateRatio) {
      add("coherence", "repetition", "report:duplicate-content", "語意重複內容超過 accepted fixture 分布允許值。");
    }
    if (longReport.unsupportedFactualClaimCount !== 0) {
      add("evidence_integrity", "evidence", "report:unsupported-factual-claims", "長報告含有未被驗證證據支持的 factual claim。");
    }
    if (!longReport.centralAnswerAligned) {
      add("coherence", "coherence", "report:central-answer", "正文未實現 deterministic Central Answer Contract。");
    }
    if (
      !longReport.conclusionAligned ||
      !longReport.allConclusionClaimsRealizedInBody ||
      longReport.conclusionClaimNovelty !== 0
    ) {
      add("coherence", "coherence", "report:conclusion-closure", "結論含有正文未實現、未閉合或新增的 substantive claim。");
    }
  }

  for (const fact of facts) {
    const factLocation = location("fact", fact.factId, fact.location);
    const traceable = fact.traceable ?? Boolean(compact(fact.sourceId) && compact(fact.evidenceId));
    if (!traceable) {
      add(
        "evidence_integrity",
        "evidence",
        factLocation,
        `事實 ${fact.factId} 未同時閉合來源與證據身分。`,
      );
    }

    const containsNumber = fact.containsNumber === true || fact.numericValue != null;
    if (containsNumber && fact.numberTraceable === false) {
      add(
        "statistical_correctness",
        "number",
        factLocation,
        `事實 ${fact.factId} 的數值無法追溯到原始證據。`,
      );
    }
    if (containsNumber && fact.statisticInterpretationValid === false) {
      add(
        "statistical_correctness",
        "number",
        factLocation,
        `事實 ${fact.factId} 的統計量解讀未通過結構化驗證。`,
      );
    }
    if (containsNumber && fact.comparisonValid === false) {
      add(
        "statistical_correctness",
        "number",
        factLocation,
        `事實 ${fact.factId} 與其他結果不具可比較性。`,
      );
    }
  }

  for (const claim of claims) {
    const claimLocation = location("claim", claim.claimId, claim.location ?? claim.sectionId);
    const supportingFactIds = uniqueSorted(claim.supportingFactIds ?? []);
    const citationIds = uniqueSorted(claim.citationIds ?? []);
    const major = claim.isMajor !== false;

    if (major && supportingFactIds.length === 0) {
      add(
        "evidence_integrity",
        "evidence",
        claimLocation,
        `主要主張 ${claim.claimId} 沒有 supportingFactIds。`,
      );
    }

    const unknownSupportingFacts = supportingFactIds.filter((factId) => !factById.has(factId));
    if (unknownSupportingFacts.length > 0) {
      add(
        "evidence_integrity",
        "evidence",
        claimLocation,
        `主張 ${claim.claimId} 參照不存在的事實：${unknownSupportingFacts.join("、")}。`,
      );
    }

    if (major && citationIds.length === 0) {
      add(
        "citation_precision",
        "citation",
        claimLocation,
        `主要主張 ${claim.claimId} 沒有 citationIds。`,
      );
    }
    if (claim.citationEntailed === false) {
      add(
        "citation_precision",
        "citation",
        claimLocation,
        `主張 ${claim.claimId} 與引用證據不構成蘊含關係。`,
      );
    }
    if (claim.citationIdentityMatches === false) {
      add(
        "citation_precision",
        "citation",
        claimLocation,
        `主張 ${claim.claimId} 的正文引用與參考文獻身分不一致。`,
      );
    }

    if (claim.containsNumber === true) {
      const numericalFactIds = uniqueSorted(claim.numberFactIds ?? []);
      if (numericalFactIds.length === 0) {
        add(
          "statistical_correctness",
          "number",
          claimLocation,
          `含數值主張 ${claim.claimId} 沒有 numberFactIds。`,
        );
      } else if (numericalFactIds.some((factId) => !factById.has(factId))) {
        add(
          "statistical_correctness",
          "number",
          claimLocation,
          `含數值主張 ${claim.claimId} 參照不存在的數值事實。`,
        );
      }
    }

    const strongClaim = /causal|strong|definitive|因果|確定|直接結論/iu.test(
      compact(claim.claimStrength),
    );
    const directnessMismatch =
      strongClaim && (claim.directness === "near_direct" || claim.directness === "indirect");
    if (claim.overclaim === true || claim.calibratedToEvidence === false || directnessMismatch) {
      add(
        "directness_honesty",
        "overclaim",
        claimLocation,
        `主張 ${claim.claimId} 的結論強度超過證據直接性。`,
      );
    }

    if (
      (claim.contradictingFactIds?.length ?? 0) > 0 &&
      claim.contradictionAddressed === false
    ) {
      add(
        "contradiction_handling",
        "contradiction",
        claimLocation,
        `主張 ${claim.claimId} 隱藏了已知反向或不顯著事實。`,
      );
    }
  }

  for (const issue of input.citationIssues ?? []) {
    add(
      "citation_precision",
      "citation",
      issue.location,
      compact(issue.reason) || `引用稽核失敗：${issue.kind}。`,
      issue.kind === "blanket_cluster" ? 25 : 35,
      issue.blocksExport ?? true,
    );
  }

  const seenSectionText = new Map<string, string>();
  for (const section of sections) {
    const sectionLocation = location("section", section.sectionId, section.location);
    const text = compact(section.text);
    if (section.substantive === false || (section.text != null && !text)) {
      add(
        "coherence",
        "coherence",
        sectionLocation,
        `章節 ${section.sectionId} 缺少實質內容。`,
      );
    }
    if (
      section.paperByPaper === true ||
      section.sourceSequenceMatchesInput === true ||
      (ratio(section.sourceOrderSimilarity) ?? 0) >= 0.8
    ) {
      add(
        "synthesis",
        "stitching",
        sectionLocation,
        `章節 ${section.sectionId} 仍依來源順序逐篇拼接。`,
      );
    }
    if (section.coherent === false || section.transitionFromPrevious === false) {
      add(
        "coherence",
        "coherence",
        sectionLocation,
        `章節 ${section.sectionId} 未與前後論證自然銜接。`,
        30,
      );
    }

    const fingerprint = normalizedSectionText(text);
    const duplicateOf = fingerprint.length >= 24 ? seenSectionText.get(fingerprint) : undefined;
    const explicitRepetition =
      (section.repeatedWithSectionIds?.length ?? 0) > 0 ||
      (ratio(section.repetitionRatio) ?? 0) >= 0.25;
    if (duplicateOf || explicitRepetition) {
      const peer = duplicateOf ?? uniqueSorted(section.repeatedWithSectionIds ?? []).join("、");
      add(
        "coherence",
        "repetition",
        sectionLocation,
        `章節 ${section.sectionId} 與 ${peer || "其他章節"} 有過高實質重複。`,
      );
    }
    if (fingerprint.length >= 24 && !seenSectionText.has(fingerprint)) {
      seenSectionText.set(fingerprint, section.sectionId);
    }
  }

  for (const visual of visualAudits) {
    const visualLocation = location("visual", visual.visualId, visual.location);
    const expected = compact(visual.expectedVisualType);
    const selected = compact(visual.selectedVisualType);
    if (visual.required === true && !selected) {
      add(
        "visual_effectiveness",
        "visual",
        visualLocation,
        `必要視覺 ${visual.visualId} 尚未選型。`,
      );
    }
    if (expected && selected && expected !== selected) {
      add(
        "visual_effectiveness",
        "visual",
        visualLocation,
        `視覺 ${visual.visualId} 選型 ${selected} 不符合 ${expected}。`,
      );
    }
    if (visual.valuesTraceable === false || visual.dataValid === false) {
      add(
        "visual_effectiveness",
        "visual",
        visualLocation,
        `視覺 ${visual.visualId} 的資料未通過可追溯性驗證。`,
      );
    }
    if (visual.renderOk === false) {
      add(
        "visual_effectiveness",
        "visual",
        visualLocation,
        `視覺 ${visual.visualId} 未通過渲染 QA。`,
      );
    }
    if (visual.helpsInterpretation === false) {
      add(
        "visual_effectiveness",
        "visual",
        visualLocation,
        `視覺 ${visual.visualId} 未幫助讀者理解核心關係。`,
        30,
      );
    }
    if (visual.sourceNotePresent === false) {
      add(
        "visual_effectiveness",
        "visual",
        visualLocation,
        `視覺 ${visual.visualId} 缺少來源註記。`,
        25,
      );
    }
  }

  if (input.audienceArchetype?.resultVisualsRequired === true && visualAudits.length === 0) {
    add(
      "visual_effectiveness",
      "visual",
      "report:visual-plan",
      "此報告需要結果型視覺，但沒有任何視覺稽核項目。",
    );
  }

  for (const contradiction of input.contradictions ?? []) {
    if (contradiction.material !== false && !contradiction.addressed) {
      add(
        "contradiction_handling",
        "contradiction",
        location("contradiction", contradiction.contradictionId, contradiction.location),
        `重要矛盾 ${contradiction.contradictionId} 未在正文中處理。`,
      );
    }
    if (
      contradiction.material !== false &&
      contradiction.addressed &&
      contradiction.alternativeExplanationIncluded === false
    ) {
      add(
        "contradiction_handling",
        "contradiction",
        location("contradiction", contradiction.contradictionId, contradiction.location),
        `重要矛盾 ${contradiction.contradictionId} 未提出替代解釋。`,
        25,
      );
    }
  }

  const audience = input.audienceArchetype;
  const archetype = compact(audience?.reportArchetype) || compact(input.reportArchetype);
  const alreadyLimitedBrief = isLimitedEvidenceArchetype(archetype);
  const evidenceLimited =
    input.limitedEvidence === true ||
    audience?.limitedEvidence === true ||
    audience?.evidenceSufficiency === "limited" ||
    audience?.evidenceSufficiency === "insufficient" ||
    audience?.minimumEvidenceMet === false;

  if (audience?.audienceProfileDefined === false) {
    add("audience_fit", "audience", "report:audience", "報告未定義 AudienceProfile。", 30);
  }
  if (audience?.audienceFit === false || audience?.explanationDepthMatchesAudience === false) {
    add(
      "audience_fit",
      "audience",
      "report:audience",
      "說明深度或術語密度不符合目標受眾。",
    );
  }
  if (audience?.archetypeFit === false || audience?.reportArchetypeMatchesQuestion === false) {
    add(
      "audience_fit",
      "audience",
      "report:archetype",
      "ReportArchetype 不符合研究問題類型。",
    );
  }
  if (audience?.claimsCalibratedToEvidence === false) {
    add(
      "directness_honesty",
      "overclaim",
      "report:claim-strength",
      "全文主張強度未依證據充分度校準。",
    );
  }
  if (evidenceLimited && !alreadyLimitedBrief) {
    add(
      "directness_honesty",
      "overclaim",
      "report:readiness",
      "證據不足以支撐完整報告，必須降級為 Limited Evidence Brief。",
    );
  }

  const parity = input.formatParity;
  if (parity) {
    const parityChecks: Array<[boolean | undefined, string, string]> = [
      [parity.contentParity, "report:format-parity", "Canonical 內容未在所有格式保持一致。"],
      [parity.previewDocxParity, "document:docx", "Preview 與 DOCX 內容不一致。"],
      [parity.previewPdfParity, "document:pdf", "Preview 與 PDF 內容不一致。"],
      [parity.docxPdfParity, "document:docx-pdf", "DOCX 與 PDF 內容不一致。"],
      [parity.previewReadable, "document:preview", "Preview 未通過可讀性 QA。"],
      [parity.docxReadable, "document:docx", "DOCX 未通過可讀性 QA。"],
      [parity.pdfReadable, "document:pdf", "PDF 未通過可讀性 QA。"],
    ];
    for (const [value, parityLocation, reason] of parityChecks) {
      if (value === false) add("document_quality", "document", parityLocation, reason);
    }
    const cjkPreserved = parity.cjkGlyphsPreserved ?? parity.cjkPreserved;
    if (cjkPreserved === false) {
      add(
        "document_quality",
        "CJK",
        "document:cjk",
        "DOCX／PDF 出現 CJK 缺字或字形遺失。",
      );
    }
  }

  for (const issue of input.structuralIssues ?? []) {
    add(
      issue.dimension,
      issue.kind,
      issue.location,
      issue.reason,
      issue.penalty ?? 35,
      issue.blocksExport ?? true,
    );
  }

  const seen = new Set<string>();
  return failures.filter((failure) => {
    const key = [failure.dimension, failure.kind, failure.location, failure.reason].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dimensionResults(
  failures: readonly DetectedFailure[],
): Record<ReportQualityDimension, ReportQualityDimensionResult> {
  return Object.fromEntries(
    REPORT_QUALITY_DIMENSIONS.map((dimension) => {
      const relevant = failures.filter((failure) => failure.dimension === dimension);
      const score = Math.max(
        0,
        100 - relevant.reduce((total, failure) => total + failure.penalty, 0),
      );
      const reasons = uniqueSorted(relevant.map((failure) => failure.reason));
      const result: ReportQualityDimensionResult = {
        score,
        reason: reasons.length > 0 ? reasons.join("；") : DIMENSION_PASS_REASONS[dimension],
        failureLocations: uniqueSorted(relevant.map((failure) => failure.location)),
        retryStage: relevant.length > 0 ? QUALITY_RETRY_ROUTES[relevant[0]!.kind] : null,
        blocksExport: relevant.some((failure) => failure.blocksExport),
      };
      return [dimension, result];
    }),
  ) as unknown as Record<ReportQualityDimension, ReportQualityDimensionResult>;
}

function buildRetryPlan(
  failures: readonly DetectedFailure[],
  canRetry: boolean,
  retryCount: number,
): QualityRetryInstruction[] {
  const stages = new Map<QualityRetryStage, DetectedFailure[]>();
  for (const failure of failures) {
    const stage = QUALITY_RETRY_ROUTES[failure.kind];
    stages.set(stage, [...(stages.get(stage) ?? []), failure]);
  }

  return RETRY_STAGE_ORDER.flatMap((stage) => {
    const stageFailures = stages.get(stage);
    if (!stageFailures?.length) return [];
    return [{
      retryStage: stage,
      dimensions: REPORT_QUALITY_DIMENSIONS.filter((dimension) =>
        stageFailures.some((failure) => failure.dimension === dimension),
      ),
      reasons: uniqueSorted(stageFailures.map((failure) => failure.reason)),
      failureLocations: uniqueSorted(stageFailures.map((failure) => failure.location)),
      canRetry,
      nextRetryCount: canRetry ? retryCount + 1 : null,
    }];
  });
}

export function evaluateReportQuality(input: ReportQualityGateInput): ReportQualityGateResult {
  const retryCount = boundedInteger(input.retryCount, 0);
  const maxRetries = boundedInteger(input.maxRetries, DEFAULT_QUALITY_GATE_MAX_RETRIES);
  const passScore = boundedScore(input.passScore, DEFAULT_QUALITY_GATE_PASS_SCORE);
  const failures = detectFailures(input);
  const dimensions = dimensionResults(failures);
  const blockExport = REPORT_QUALITY_DIMENSIONS.some(
    (dimension) => dimensions[dimension].blocksExport,
  );
  const passed =
    !blockExport &&
    REPORT_QUALITY_DIMENSIONS.every((dimension) => dimensions[dimension].score >= passScore);
  const exhausted = !passed && retryCount >= maxRetries;
  const audience = input.audienceArchetype;
  const evidenceLimited =
    input.limitedEvidence === true ||
    audience?.limitedEvidence === true ||
    audience?.evidenceSufficiency === "limited" ||
    audience?.evidenceSufficiency === "insufficient" ||
    audience?.minimumEvidenceMet === false;
  const archetype = compact(audience?.reportArchetype) || compact(input.reportArchetype);
  const downgradeToLimitedBrief =
    evidenceLimited && !isLimitedEvidenceArchetype(archetype) && blockExport;
  const canRetry = !passed && !exhausted;

  return {
    dimensions,
    passed,
    blockExport,
    retryPlan: passed ? [] : buildRetryPlan(failures, canRetry, retryCount),
    retryCount,
    maxRetries,
    exhausted,
    downgradeToLimitedBrief,
  };
}

/** Alias with the domain language used by the generation pipeline. */
export const runReportQualityGate = evaluateReportQuality;

export interface ReportQualityGateOptions {
  maxRetries?: number;
  passScore?: number;
}

export class ReportQualityGate {
  readonly maxRetries: number;
  readonly passScore: number;

  constructor(options: ReportQualityGateOptions = {}) {
    this.maxRetries = boundedInteger(options.maxRetries, DEFAULT_QUALITY_GATE_MAX_RETRIES);
    this.passScore = boundedScore(options.passScore, DEFAULT_QUALITY_GATE_PASS_SCORE);
  }

  evaluate(input: ReportQualityGateInput): ReportQualityGateResult {
    return evaluateReportQuality({
      ...input,
      maxRetries: input.maxRetries ?? this.maxRetries,
      passScore: input.passScore ?? this.passScore,
    });
  }
}

export interface QualityRetryAttemptAudit {
  attempt: number;
  retryStage: QualityRetryStage | "limited_evidence_downgrade";
  dimensions: ReportQualityDimension[];
  failureLocations: string[];
  beforePassed: boolean;
  afterPassed: boolean;
  changed: boolean;
  diagnostics: string[];
}

export interface ReportQualityRetryOrchestratorInput<State> {
  initialState: State;
  buildGateInput: (state: State) => ReportQualityGateInput | Promise<ReportQualityGateInput>;
  repairStage: (input: {
    state: State;
    instruction: QualityRetryInstruction;
    attempt: number;
  }) => State | Promise<State>;
  downgradeToLimitedBrief?: (input: {
    state: State;
    quality: ReportQualityGateResult;
  }) => State | Promise<State>;
  maxRetries?: number;
  passScore?: number;
}

export interface ReportQualityRetryOrchestratorResult<State> {
  state: State;
  quality: ReportQualityGateResult;
  attempts: QualityRetryAttemptAudit[];
  exportAllowed: boolean;
  terminalReason:
    | "passed"
    | "passed_after_limited_evidence_downgrade"
    | "retry_exhausted"
    | "no_retryable_stage"
    | "repeated_failure_without_progress";
}

function qualityFailureSignature(quality: ReportQualityGateResult): string {
  return quality.retryPlan.map((instruction) => [
    instruction.retryStage,
    ...instruction.dimensions,
    ...instruction.failureLocations,
    ...instruction.reasons,
  ].join("|")).join("\n");
}

function blockingDimensions(quality: ReportQualityGateResult): ReportQualityDimension[] {
  return REPORT_QUALITY_DIMENSIONS.filter((dimension) => quality.dimensions[dimension].blocksExport);
}

/**
 * Runs the quality gate as an actual repair loop. Upstream stages stay injected
 * as callbacks so the orchestrator can rerun extraction, citation mapping,
 * planning, model writing, visual routing or export without duplicating those
 * implementations. Every repair is re-audited before another stage may run.
 */
export async function orchestrateReportQualityRetries<State>(
  input: ReportQualityRetryOrchestratorInput<State>,
): Promise<ReportQualityRetryOrchestratorResult<State>> {
  const maxRetries = boundedInteger(input.maxRetries, DEFAULT_QUALITY_GATE_MAX_RETRIES);
  const passScore = boundedScore(input.passScore, DEFAULT_QUALITY_GATE_PASS_SCORE);
  const attempts: QualityRetryAttemptAudit[] = [];
  let state = input.initialState;
  let quality = evaluateReportQuality({
    ...(await input.buildGateInput(state)),
    retryCount: 0,
    maxRetries,
    passScore,
  });
  if (quality.passed) {
    return { state, quality, attempts, exportAllowed: true, terminalReason: "passed" };
  }

  if (quality.downgradeToLimitedBrief && input.downgradeToLimitedBrief) {
    const beforeSignature = qualityFailureSignature(quality);
    state = await input.downgradeToLimitedBrief({ state, quality });
    quality = evaluateReportQuality({
      ...(await input.buildGateInput(state)),
      retryCount: 0,
      maxRetries,
      passScore,
    });
    attempts.push({
      attempt: 0,
      retryStage: "limited_evidence_downgrade",
      dimensions: blockingDimensions(quality),
      failureLocations: quality.retryPlan.flatMap((instruction) => instruction.failureLocations),
      beforePassed: false,
      afterPassed: quality.passed,
      changed: beforeSignature !== qualityFailureSignature(quality),
      diagnostics: ["evidence_limited_report_downgraded_before_repair"],
    });
    if (quality.passed) {
      return {
        state,
        quality,
        attempts,
        exportAllowed: true,
        terminalReason: "passed_after_limited_evidence_downgrade",
      };
    }
  }

  const seenSignatures = new Set<string>();
  for (let retryCount = 0; retryCount < maxRetries; retryCount += 1) {
    const signature = qualityFailureSignature(quality);
    if (!signature || quality.retryPlan.length === 0) {
      return {
        state,
        quality,
        attempts,
        exportAllowed: false,
        terminalReason: "no_retryable_stage",
      };
    }
    if (seenSignatures.has(signature)) {
      return {
        state,
        quality,
        attempts,
        exportAllowed: false,
        terminalReason: "repeated_failure_without_progress",
      };
    }
    seenSignatures.add(signature);
    const instruction = quality.retryPlan.find((item) => item.canRetry);
    if (!instruction) {
      return {
        state,
        quality,
        attempts,
        exportAllowed: false,
        terminalReason: "no_retryable_stage",
      };
    }
    const beforeQuality = quality;
    state = await input.repairStage({
      state,
      instruction,
      attempt: retryCount + 1,
    });
    quality = evaluateReportQuality({
      ...(await input.buildGateInput(state)),
      retryCount: retryCount + 1,
      maxRetries,
      passScore,
    });
    const changed = qualityFailureSignature(beforeQuality) !== qualityFailureSignature(quality);
    attempts.push({
      attempt: retryCount + 1,
      retryStage: instruction.retryStage,
      dimensions: instruction.dimensions,
      failureLocations: instruction.failureLocations,
      beforePassed: beforeQuality.passed,
      afterPassed: quality.passed,
      changed,
      diagnostics: changed ? ["quality_failure_signature_changed"] : ["repair_made_no_auditable_progress"],
    });
    if (quality.passed) {
      return { state, quality, attempts, exportAllowed: true, terminalReason: "passed" };
    }
  }

  return {
    state,
    quality,
    attempts,
    exportAllowed: false,
    terminalReason: "retry_exhausted",
  };
}
