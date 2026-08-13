import type { EvidenceCard } from "./evidenceCards.ts";
import type { FigureSpec } from "./formalReportDocument.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import type {
  StandardizedEvidenceFact,
  StandardizedNumericalResult,
} from "./standardizedEvidenceFacts.ts";
import {
  auditVisualSemanticData,
  routeVisualStatistic,
  routeVisualStatisticGroup,
  semanticDatumKeys,
  semanticVisualTypeMatchesStatistic,
  type EvidenceVisualSemanticData,
  type VisualSemanticRoute,
} from "./visualSemanticRouter.ts";

/**
 * A reader-facing visual purpose. These values describe the argument made by a
 * visual; they deliberately do not describe a renderer or chart library.
 */
export type EvidenceVisualPurpose =
  | "research_question_coverage"
  | "metric_translation"
  | "outcome_hierarchy"
  | "numeric_small_multiples"
  | "mechanism_synthesis"
  | "applicability_boundary"
  | "study_design"
  | "sleep_evidence_coverage"
  | "prevalence_facets"
  | "odds_ratio_forest"
  | "correlation_structure"
  | "statistical_mediation_path"
  | "population_applicability_boundary";

export type EvidenceVisualClaimMode =
  | "evidence_synthesis"
  | "explanatory_synthesis"
  | "research_design";

export type EvidenceVisualSourceField =
  | "structured_evidence_fields"
  | "standardized_numerical_result"
  | "exact_result_semantic_extract"
  | "derived_coverage_count"
  | "explanatory_synthesis";

export interface EvidenceVisualDatumProvenance {
  datumKey: string;
  displayValue: string;
  metric: string;
  unit: string | null;
  evidenceIds: string[];
  sourceIds: string[];
  factIds: string[];
  numericalResultIds: string[];
  sourceField: EvidenceVisualSourceField;
  /** Exact substring of exactResult when the datum is a reported number. */
  exactText: string | null;
  locator: string | null;
  derivation: string;
}

export interface EvidenceVisualProvenance {
  origin: "structured_evidence";
  evidenceIds: string[];
  sourceIds: string[];
  dataPoints: EvidenceVisualDatumProvenance[];
}

/**
 * This is structurally assignable to FigureSpec. The additional fields keep
 * placement, purpose and datum-level provenance out of reader-facing labels.
 */
export type EvidenceVisualSpec = FigureSpec & {
  visualId: string;
  visualType: EvidenceVisualPurpose;
  renderMode: "deterministic";
  claimMode: EvidenceVisualClaimMode;
  preferredSectionId: string;
  provenance: EvidenceVisualProvenance;
  comparabilityWarning: string | null;
  /** Explicit statistical semantics for renderers; FigureSpec.data is a deterministic fallback. */
  semanticData?: EvidenceVisualSemanticData;
  /** Present for numeric statistics that were accepted by VisualSemanticRouter. */
  semanticRoute?: VisualSemanticRoute;
};

/**
 * Generated explanatory art must travel through a separate record. It cannot
 * be mistaken for an evidence figure merely because it has evidence context.
 */
export interface GeneratedConceptImageRecord {
  visualId: string;
  renderMode: "generated_concept_image";
  imageRole: "conceptual_explanation";
  preferredSectionId: string;
  prompt: string;
  altText: string;
  provider: string;
  model: string | null;
  status: "requested" | "generated" | "failed" | "fallback";
  assetUri: string | null;
  fallbackVisualId: string | null;
  evidenceIds: string[];
  sourceIds: string[];
  limitationNote: string;
}

export interface BuildEvidenceVisualsInput {
  topic: string;
  evidenceCards: EvidenceCard[];
  sources?: SourceRecord[];
  /** Canonical facts are preferred when the caller has already built them. */
  standardizedFacts?: StandardizedEvidenceFact[];
  startNumber?: number;
  maxVisuals?: number;
}

interface FactorProfile {
  sourceId: string;
  evidenceIds: string[];
  cards: EvidenceCard[];
  text: string;
  taiwan: boolean;
  campus: boolean;
  green: boolean;
  heat: boolean;
}

interface ShortVideoSleepProfile {
  sourceId: string;
  evidenceIds: string[];
  cards: EvidenceCard[];
  groundedText: string;
  title: string;
  highSchool: boolean;
  adolescent: boolean;
  college: boolean;
  shortFormVideo: boolean;
  tiktok: boolean;
  generalSocialMedia: boolean;
  sleep: boolean;
  mediation: boolean;
  review: boolean;
  backgroundOnly: boolean;
}

interface DetectedConcept {
  id: string;
  label: string;
  explanatoryLabel: string;
  evidenceIds: string[];
  sourceIds: string[];
  exactText: string | null;
  locator: string | null;
}

interface NumericFact {
  key: string;
  sourceId: string;
  evidenceId: string;
  sourceLabel: string;
  method: string;
  metric: string;
  statisticType: string;
  displayValue: string;
  unit: string | null;
  exactText: string;
  locator: string | null;
  factId: string | null;
  numericalResultIds: string[];
}

interface ConceptRule {
  id: string;
  label: string;
  explanatoryLabel: string;
  pattern: RegExp;
}

const TAIWAN_PATTERN = /(?:臺灣|台灣|Taiwan|Taipei|台北|Kaohsiung|高雄)/iu;
const CAMPUS_PATTERN = /(?:校園|大學|campus|university|college)/iu;
const GREEN_PATTERN = /(?:綠覆|綠量|綠地|植被|植栽|樹冠|綠視率|green\s+(?:cover|coverage|space|vegetation|view)|vegetation|canopy|GCR|GVI|NDVI|LAI)/iu;
const HEAT_PATTERN = /(?:都市熱島|地表溫度|氣溫|環境溫度|熱環境|熱舒適|溫差|降溫|urban\s+heat\s+island|\bUHI\b|\bSUHI\b|land\s+surface\s+temperature|\bLST\b|air\s+temperature|ambient\s+temperature|thermal|cooling)/iu;
const SHORT_VIDEO_PATTERN = /(?:短影音|短視頻|short[-‐‑‒–— ]form\s+videos?|\bSFV\b|TikTok)/iu;
const NARROW_SHORT_VIDEO_PATTERN = /(?:短影音|短視頻|short[-‐‑‒–— ]form\s+videos?|\bSFV\b)/iu;
const TIKTOK_EXPOSURE_PATTERN = /\bTikTok(?:\s+(?:use|usage|addiction|exposure))?\b/iu;
const GENERAL_SOCIAL_MEDIA_PATTERN = /(?:一般社群媒體|社群媒體(?:使用|暴露|平台|時數)?|(?:use\s+of|general|problematic|hours?\s+spent\s+on)?\s*social\s+media(?:\s+(?:use|usage|platforms?|exposure|hours?))?|social\s+network(?:ing)?(?:\s+(?:use|usage))?)/iu;
const SLEEP_PATTERN = /(?:睡眠品質|睡眠不佳|睡眠障礙|sleep\s+quality|poor\s+sleep|sleep\s+disorders?)/iu;
const SCHOOL_AGE_PATTERN = /(?:高中生|高中|中學生|中學|青少年|high\s+school|secondary\s+school|adolescents?)/iu;

const METRIC_RULES: ConceptRule[] = [
  {
    id: "gvi",
    label: "綠視率／GVI",
    explanatoryLabel: "行人視角可見綠量",
    pattern: /(?:綠視率|green\s+view\s+index|green\s+vegetation\s+index|\bGVI\b)/iu,
  },
  {
    id: "gcr",
    label: "綠覆率／GCR",
    explanatoryLabel: "綠地面積比例",
    pattern: /(?:綠覆率|green\s+coverage\s+ratio|green\s+cover(?:age)?\s+ratio|\bGCR\b|\bSGCR\b)/iu,
  },
  {
    id: "canopy-density",
    label: "冠層密度／CD",
    explanatoryLabel: "樹冠水平覆蓋",
    pattern: /(?:冠層密度|canopy\s+density|\bCD\b)/iu,
  },
  {
    id: "lai",
    label: "葉面積指數／LAI",
    explanatoryLabel: "葉面積密度",
    pattern: /(?:葉面積指數|leaf\s+area\s+index|\bLAI\b)/iu,
  },
  {
    id: "ndvi",
    label: "NDVI",
    explanatoryLabel: "遙測植被活性",
    pattern: /(?:常態化差異植生指標|normalized\s+difference\s+vegetation\s+index|\bNDVI\b)/iu,
  },
  {
    id: "land-cover",
    label: "植被／土地覆蓋",
    explanatoryLabel: "地表覆蓋分類",
    pattern: /(?:土地覆蓋|地表覆蓋|land\s+(?:use\s+and\s+)?land\s+cover|vegetation\s+cover|green\s+vegetation)/iu,
  },
];

const OUTCOME_RULES: Array<ConceptRule & { level: "environment" | "comfort" | "physiology" }> = [
  {
    id: "air-temperature",
    label: "空氣／環境溫度",
    explanatoryLabel: "環境層",
    level: "environment",
    pattern: /(?:空氣溫度|氣溫|環境溫度|air\s+temperature|ambient\s+temperature)/iu,
  },
  {
    id: "lst",
    label: "地表溫度／LST",
    explanatoryLabel: "環境層",
    level: "environment",
    pattern: /(?:地表溫度|land\s+surface\s+temperature|\bLST\b)/iu,
  },
  {
    id: "uhi",
    label: "都市熱島／UHI",
    explanatoryLabel: "環境層",
    level: "environment",
    pattern: /(?:都市熱島|urban\s+heat\s+island|\bSUHI\b|\bUHI\b)/iu,
  },
  {
    id: "thermal-comfort",
    label: "熱舒適",
    explanatoryLabel: "主觀感受層",
    level: "comfort",
    pattern: /(?:熱舒適|thermal\s+comfort|熱感受|thermal\s+sensation)/iu,
  },
  {
    id: "physiological-response",
    label: "皮膚電導等生理反應",
    explanatoryLabel: "生理層",
    level: "physiology",
    pattern: /(?:皮膚電導|生理反應|skin\s+conductance|electrodermal|biosensor|\bSCR\b|\bnSCR\b)/iu,
  },
];

const MECHANISM_RULES: ConceptRule[] = [
  {
    id: "shading",
    label: "樹冠與植被遮蔭",
    explanatoryLabel: "減少直接熱暴露",
    pattern: /(?:遮蔭|樹蔭|shade|shading|canopy\s+shading)/iu,
  },
  {
    id: "evapotranspiration",
    label: "蒸散／蒸發",
    explanatoryLabel: "潛熱交換路徑",
    pattern: /(?:蒸散|蒸發|evapotranspiration|transpiration|evaporation)/iu,
  },
  {
    id: "radiation",
    label: "日照與輻射負荷",
    explanatoryLabel: "短波輻射條件",
    pattern: /(?:日照強度|太陽輻射|光合有效輻射|sunlight\s+intensity|solar\s+radiation|photosynthetically\s+active\s+radiation|\bPAR\b)/iu,
  },
  {
    id: "surface-cover",
    label: "不透水面與建成覆蓋",
    explanatoryLabel: "蓄熱地表條件",
    pattern: /(?:不透水|人工表面|建成用地|impervious|artificial\s+surfaces?|built-up\s+land\s+cover)/iu,
  },
  {
    id: "urban-form",
    label: "都市形態與通風",
    explanatoryLabel: "風場與天空開闊度",
    pattern: /(?:高寬比|通風|天空視域|建築視域|aspect\s+ratio|ventilation|sky\s+view\s+factor|building\s+view\s+factor)/iu,
  },
];

const COMPARABILITY_WARNING = "各列的研究方法、空間尺度、指標定義與結果單位不同；不得依數值大小直接排序研究效果。";

function compact(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function evidenceId(card: EvidenceCard): string {
  return compact(card.evidenceId) || compact(card.evidenceCardId) || compact(card.id);
}

function cardIsUsable(card: EvidenceCard): boolean {
  const decision = compact(card.userDecision).toLowerCase();
  return Boolean(
    compact(card.sourceId) &&
      evidenceId(card) &&
      card.acceptedByUser !== false &&
      decision !== "rejected" &&
      decision !== "dismissed" &&
      card.needsManualReview !== true,
  );
}

function structuredCardText(card: EvidenceCard): string {
  return [
    card.location,
    card.researchSetting,
    card.studyDesign,
    card.dataScope,
    card.exposure,
    card.outcome,
    card.exactResult,
    card.supportedByText,
    card.supportSpan,
    card.claimTextZhTw,
    card.sourceTitle,
  ]
    .map(compact)
    .filter(Boolean)
    .join(" ");
}

function groundedCardText(card: EvidenceCard): string {
  return [card.exactResult, card.supportedByText, card.supportSpan]
    .map(compact)
    .filter(Boolean)
    .join(" ");
}

function groupEvidenceBySource(cards: EvidenceCard[]): FactorProfile[] {
  const groups = new Map<string, EvidenceCard[]>();
  cards.filter(cardIsUsable).forEach((card) => {
    const sourceId = compact(card.sourceId);
    const current = groups.get(sourceId) ?? [];
    current.push(card);
    groups.set(sourceId, current);
  });

  return [...groups.entries()].map(([sourceId, sourceCards]) => {
    const text = sourceCards.map(structuredCardText).join(" ");
    const declaredLocation = sourceCards.map((card) => compact(card.location)).filter(Boolean).join(" ");
    const declaredSetting = sourceCards.map((card) => compact(card.researchSetting)).filter(Boolean).join(" ");
    const declaredExposure = sourceCards.map((card) => compact(card.exposure)).filter(Boolean).join(" ");
    const declaredOutcome = sourceCards.map((card) => compact(card.outcome)).filter(Boolean).join(" ");
    // Factor membership deliberately excludes applicability/limitations and
    // translated claims because phrases such as "not a Taiwan study" would
    // otherwise create a false positive. Declared structured fields win; only
    // absent fields fall back to the source's grounded result text.
    const groundedFallback = sourceCards
      .flatMap((card) => [card.exactResult, card.supportedByText, card.supportSpan, card.sourceTitle])
      .map(compact)
      .filter(Boolean)
      .join(" ");
    return {
      sourceId,
      evidenceIds: unique(sourceCards.map(evidenceId)),
      cards: sourceCards,
      text,
      taiwan: TAIWAN_PATTERN.test(declaredLocation || groundedFallback),
      campus: CAMPUS_PATTERN.test(declaredSetting || groundedFallback),
      green: GREEN_PATTERN.test(declaredExposure || groundedFallback),
      heat: HEAT_PATTERN.test(declaredOutcome || groundedFallback),
    };
  });
}

function allEvidenceIds(profiles: FactorProfile[]): string[] {
  return unique(profiles.flatMap((profile) => profile.evidenceIds));
}

function allSourceIds(profiles: FactorProfile[]): string[] {
  return unique(profiles.map((profile) => profile.sourceId));
}

function baseProvenance(
  profiles: FactorProfile[],
  dataPoints: EvidenceVisualDatumProvenance[],
): EvidenceVisualProvenance {
  return {
    origin: "structured_evidence",
    evidenceIds: allEvidenceIds(profiles),
    sourceIds: allSourceIds(profiles),
    dataPoints,
  };
}

function coverageDatum(
  key: string,
  label: string,
  matching: FactorProfile[],
  count: number,
): EvidenceVisualDatumProvenance {
  return {
    datumKey: key,
    displayValue: String(count),
    metric: label,
    unit: "來源數",
    evidenceIds: allEvidenceIds(matching),
    sourceIds: allSourceIds(matching),
    factIds: [],
    numericalResultIds: [],
    sourceField: "derived_coverage_count",
    exactText: null,
    locator: null,
    derivation: "按來源去重後，依結構化場域、暴露、結果欄位及其可核對文字判定構面，再計數。",
  };
}

function buildCoverageVisual(profiles: FactorProfile[]): EvidenceVisualSpec | null {
  if (profiles.length === 0) return null;

  const dimensions = [
    { key: "taiwan", label: "臺灣場域", matches: profiles.filter((profile) => profile.taiwan) },
    { key: "campus", label: "校園場域", matches: profiles.filter((profile) => profile.campus) },
    { key: "green", label: "綠量暴露", matches: profiles.filter((profile) => profile.green) },
    { key: "heat", label: "熱環境結果", matches: profiles.filter((profile) => profile.heat) },
  ];
  const complete = profiles.filter(
    (profile) => profile.taiwan && profile.campus && profile.green && profile.heat,
  );
  const dataPoints = dimensions.map((dimension) =>
    coverageDatum(dimension.key, dimension.label, dimension.matches, dimension.matches.length),
  );
  dataPoints.push(coverageDatum("all-four", "四要素同時涵蓋", complete, complete.length));

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "研究問題四要素的證據覆蓋與交集",
    units: "去重來源數",
    legend: [
      { key: "已有證據", label: "至少一筆來源涵蓋" },
      { key: "缺口", label: "沒有同一來源完整涵蓋" },
    ],
    data: {
      kind: "matrix",
      columns: ["來源數", "狀態", "研究解讀"],
      rows: [
        ...dimensions.map((dimension) => ({
          label: dimension.label,
          values: [
            String(dimension.matches.length),
            dimension.matches.length > 0 ? "已有證據" : "缺口",
            "此列只表示單一構面覆蓋",
          ],
        })),
        {
          label: "臺灣 × 校園 × 綠量 × 熱結果",
          values: [
            String(complete.length),
            complete.length > 0 ? "已有直接交集" : "尚無完整交集",
            complete.length > 0
              ? "可優先核對其研究設計與結果定義"
              : "現有來源不能直接回答完整研究問題",
          ],
        },
      ],
    },
    sourceNote: "依納入證據的地點、研究場域、暴露、結果與可核對文字，按來源身分去重計數。",
    note: "單一構面各自有資料，不代表同一研究同時涵蓋全部構面。",
    altText: `四個研究問題構面的來源覆蓋，以及同時涵蓋臺灣、校園、綠量與熱結果的來源數為 ${complete.length}。`,
    visualId: "evidence-visual-research-question-coverage",
    visualType: "research_question_coverage",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "research-question-and-scope",
    provenance: baseProvenance(profiles, dataPoints),
    comparabilityWarning: null,
  };
}

function firstMatchingText(cards: EvidenceCard[], pattern: RegExp): { text: string; locator: string | null } {
  for (const card of cards) {
    const exact = compact(card.exactResult);
    if (exact && pattern.test(exact)) {
      return { text: exact, locator: compact(card.locator) || compact(card.pageOrLocation) || null };
    }
    pattern.lastIndex = 0;
    const structured = structuredCardText(card);
    if (pattern.test(structured)) {
      return { text: structured, locator: compact(card.locator) || compact(card.pageOrLocation) || null };
    }
    pattern.lastIndex = 0;
  }
  return { text: "", locator: null };
}

function detectConcepts(profiles: FactorProfile[], rules: ConceptRule[]): DetectedConcept[] {
  return rules.flatMap((rule) => {
    const matching = profiles.filter((profile) => rule.pattern.test(profile.text));
    rule.pattern.lastIndex = 0;
    if (matching.length === 0) return [];
    const first = firstMatchingText(matching.flatMap((profile) => profile.cards), rule.pattern);
    return [{
      id: rule.id,
      label: rule.label,
      explanatoryLabel: rule.explanatoryLabel,
      evidenceIds: allEvidenceIds(matching),
      sourceIds: allSourceIds(matching),
      exactText: first.text || null,
      locator: first.locator,
    }];
  });
}

function conceptDataPoint(
  concept: DetectedConcept,
  sourceField: EvidenceVisualSourceField = "structured_evidence_fields",
): EvidenceVisualDatumProvenance {
  return {
    datumKey: concept.id,
    displayValue: concept.label,
    metric: concept.explanatoryLabel,
    unit: null,
    evidenceIds: concept.evidenceIds,
    sourceIds: concept.sourceIds,
    factIds: [],
    numericalResultIds: [],
    sourceField,
    exactText: concept.exactText,
    locator: concept.locator,
    derivation: "僅在結構化證據欄位或其可核對文字出現該概念時納入。",
  };
}

function buildMetricTranslationVisual(profiles: FactorProfile[]): EvidenceVisualSpec | null {
  const metrics = detectConcepts(profiles, METRIC_RULES);
  if (metrics.length < 2) return null;

  const nodes = [{ id: "green-concept", label: "綠量（概念）" }];
  const edges: Array<{ from: string; to: string; label: string }> = [];
  metrics.forEach((metric) => {
    nodes.push({ id: `metric-${metric.id}`, label: metric.label });
    nodes.push({ id: `meaning-${metric.id}`, label: metric.explanatoryLabel });
    edges.push({ from: "green-concept", to: `metric-${metric.id}`, label: "操作化" });
    edges.push({ from: `metric-${metric.id}`, to: `meaning-${metric.id}`, label: "主要表徵" });
  });

  return {
    specType: "figure",
    number: 0,
    figureType: "conceptual_mechanism",
    title: "綠量不是單一指標：研究中的操作化轉譯",
    units: null,
    legend: [
      { key: "概念", label: "研究概念" },
      { key: "指標", label: "來源實際使用的指標" },
      { key: "意義", label: "指標主要代表的空間構面" },
    ],
    data: { kind: "directed_graph", nodes, edges },
    sourceNote: "指標名稱只取自納入證據的結構化欄位或可核對文字；箭頭是概念轉譯，不是效果估計。",
    note: "GVI、綠覆率、冠層密度、LAI 與土地覆蓋衡量的空間構面不同，不應互換為同一數值。",
    altText: `由綠量概念分支至 ${metrics.map((metric) => metric.label).join("、")}，並標示各指標主要代表的空間構面。`,
    visualId: "evidence-visual-metric-translation",
    visualType: "metric_translation",
    renderMode: "deterministic",
    claimMode: "explanatory_synthesis",
    preferredSectionId: "literature_review",
    provenance: baseProvenance(profiles, metrics.map((metric) => conceptDataPoint(metric))),
    comparabilityWarning: "各綠量指標操作化不同，不得直接視為等值量尺。",
  };
}

function buildOutcomeHierarchyVisual(profiles: FactorProfile[]): EvidenceVisualSpec | null {
  const outcomes = detectConcepts(profiles, OUTCOME_RULES);
  if (outcomes.length < 2) return null;

  const levelLabels = new Map([
    ["environment", "環境量測層"],
    ["comfort", "主觀感受層"],
    ["physiology", "生理反應層"],
  ] as const);
  const usedLevels = unique(
    OUTCOME_RULES
      .filter((rule) => outcomes.some((outcome) => outcome.id === rule.id))
      .map((rule) => rule.level),
  ) as Array<"environment" | "comfort" | "physiology">;
  const nodes = [{ id: "heat-outcomes", label: "熱環境結果" }];
  const edges: Array<{ from: string; to: string; label: string }> = [];
  usedLevels.forEach((level) => {
    nodes.push({ id: `level-${level}`, label: levelLabels.get(level) ?? level });
    edges.push({ from: "heat-outcomes", to: `level-${level}`, label: "結果分層" });
  });
  outcomes.forEach((outcome) => {
    const level = OUTCOME_RULES.find((rule) => rule.id === outcome.id)?.level ?? "environment";
    nodes.push({ id: `outcome-${outcome.id}`, label: outcome.label });
    edges.push({ from: `level-${level}`, to: `outcome-${outcome.id}`, label: "量測指標" });
  });

  return {
    specType: "figure",
    number: 0,
    figureType: "conceptual_mechanism",
    title: "熱結果的層級：環境量測、主觀感受與生理反應",
    units: null,
    legend: [
      { key: "環境", label: "環境層" },
      { key: "感受", label: "感受層" },
      { key: "生理", label: "生理層" },
    ],
    data: { kind: "directed_graph", nodes, edges },
    sourceNote: "結果指標只在納入證據的結果欄位或可核對文字出現時納入；連線表示分類，不表示因果鏈。",
    note: "地表溫度、空氣溫度、熱舒適與皮膚電導位於不同結果層級，不能彼此替代。",
    altText: `將納入來源使用的 ${outcomes.map((outcome) => outcome.label).join("、")} 分為環境、感受與生理結果層級。`,
    visualId: "evidence-visual-outcome-hierarchy",
    visualType: "outcome_hierarchy",
    renderMode: "deterministic",
    claimMode: "explanatory_synthesis",
    preferredSectionId: "literature_review",
    provenance: baseProvenance(profiles, outcomes.map((outcome) => conceptDataPoint(outcome))),
    comparabilityWarning: "不同結果層級不可視為同一結果變項。",
  };
}

function methodLabel(card: EvidenceCard, text: string): string {
  const declared = compact(card.studyDesign);
  if (declared) return declared;
  if (/(?:ENVI-?met|simulation|numerical|模擬)/iu.test(text)) return "數值模擬";
  if (/(?:Landsat|remote\s+sensing|remotely\s+sensed|遙測)/iu.test(text)) return "遙測";
  if (/(?:field\s+measurements?|實地量測|現地量測)/iu.test(text)) return "實地量測";
  if (/(?:regression|迴歸)/iu.test(text)) return "迴歸分析";
  return "方法依來源揭露";
}

function sourceLabel(card: EvidenceCard, sourceMap: Map<string, SourceRecord>): string {
  const source = sourceMap.get(card.sourceId);
  const author = compact(source?.authors?.[0]) || compact(card.authors?.[0]);
  const year = source?.year ?? card.year;
  if (author && year) return `${author}（${year}）`;
  if (author) return author;
  if (year) return `${compact(card.sourceTitle) || "納入研究"}（${year}）`;
  return compact(card.sourceTitle) || "納入研究";
}

function exactSnippet(text: string, index: number, length: number): string {
  const startBoundary = Math.max(
    text.lastIndexOf(".", index - 1),
    text.lastIndexOf("。", index - 1),
    text.lastIndexOf(";", index - 1),
  );
  const candidates = [
    text.indexOf(".", index + length),
    text.indexOf("。", index + length),
    text.indexOf(";", index + length),
  ].filter((candidate) => candidate >= 0);
  const endBoundary = candidates.length > 0 ? Math.min(...candidates) + 1 : text.length;
  return compact(text.slice(startBoundary + 1, endBoundary));
}

function numericMetric(context: string, fallback: string): string {
  if (/(?:relative\s+humidity|相對濕度)/iu.test(context)) return "相對濕度差";
  if (/(?:skin\s+conductance|electrodermal|皮膚電導|\bR(?:2|²)\b)/iu.test(context)) return "舒適模型解釋力 R²";
  if (/(?:land\s+surface\s+temperature|\bLST\b|地表溫度)/iu.test(context)) return "地表溫度空間變異";
  if (/(?:pedestrian|行人層)/iu.test(context)) return "行人層空氣溫度變化";
  if (/(?:air\s+temperature|氣溫)/iu.test(context)) return "空氣溫度差";
  return fallback;
}

function numericalResultsForSnippet(
  fact: StandardizedEvidenceFact | null,
  snippet: string,
): StandardizedNumericalResult[] {
  if (!fact) return [];
  return fact.numericalResults.filter((result) => {
    const support = compact(result.supportingText);
    return Boolean(support && (snippet.includes(support) || support.includes(snippet)));
  });
}

function rawResultContainsValue(result: StandardizedNumericalResult, value: string): boolean {
  return [...compact(result.rawValue).matchAll(/\d+(?:\.\d+)?/gu)]
    .some((match) => match[0] === value);
}

function collectNumericFacts(
  card: EvidenceCard,
  sourceMap: Map<string, SourceRecord>,
  standardizedFact: StandardizedEvidenceFact | null,
): NumericFact[] {
  // exactResult is the authoritative sentence context. numericResult is not
  // consulted: legacy cards may mix years, sample sizes and scenario numbers.
  const text = compact(standardizedFact?.exactResult) || compact(card.exactResult);
  if (!text) return [];

  const facts: NumericFact[] = [];
  const addFact = (
    match: RegExpExecArray,
    requiredValues: string[],
    metric: string,
    statisticType: string,
    displayValue: string,
    unit: string | null,
  ) => {
    const snippet = exactSnippet(text, match.index, match[0].length);
    const key = `${card.sourceId}:${metric}:${displayValue}`;
    if (facts.some((fact) => fact.key === key)) return;
    const relatedResults = numericalResultsForSnippet(standardizedFact, snippet)
      .filter((result) => requiredValues.some((value) => rawResultContainsValue(result, value)));
    const standardizedCoversPanel = requiredValues.every((value) =>
      relatedResults.some((result) => rawResultContainsValue(result, value)),
    );
    facts.push({
      key,
      sourceId: card.sourceId,
      evidenceId: evidenceId(card),
      sourceLabel: sourceLabel(card, sourceMap),
      method: methodLabel(card, text),
      metric,
      statisticType,
      displayValue,
      unit,
      exactText: snippet,
      locator: compact(standardizedFact?.locator) || compact(card.locator) || compact(card.pageOrLocation) || null,
      factId: standardizedFact?.factId ?? null,
      numericalResultIds: standardizedCoversPanel
        ? relatedResults.map((result) => result.resultId)
        : [],
    });
  };

  const ratioPatterns = [
    /(?:for\s+every|each)\s*(\d+(?:\.\d+)?)\s*%[^.;。]{0,140}?(?:reduced|decreased|lowered)\s*(?:by)?\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu,
    /每(?:增加|提高)\s*(\d+(?:\.\d+)?)\s*%[^。；;]{0,100}?(?:降低|下降|減少)\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃)/giu,
  ];
  ratioPatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const exposure = match[1];
      const outcome = match[2];
      if (!exposure || !outcome) continue;
      addFact(match as RegExpExecArray, [exposure, outcome], "綠覆變化對行人層溫度", "marginal_change", `綠覆 +${exposure}% → ${outcome} °C 降溫`, "百分點與 °C");
    }
  });

  const rangePatterns = [
    /(?:variation|difference|range)[^.;。]{0,60}?(?:between|from|of\s+between)\s*(\d+(?:\.\d+)?)\s*(?:and|to|–|—|-)\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu,
    /(?:變異|溫差|差異|範圍)[^。；;]{0,50}?(\d+(?:\.\d+)?)\s*(?:至|到|–|—|-)\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃)/giu,
  ];
  rangePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const minimum = match[1];
      const maximum = match[2];
      if (!minimum || !maximum) continue;
      const metric = numericMetric(exactSnippet(text, match.index, match[0].length), "溫度變異範圍");
      addFact(match as RegExpExecArray, [minimum, maximum], metric, "range", `${minimum}–${maximum} °C`, "°C");
    }
  });

  const baselinePatterns = [
    /(?:average|mean)[^.;。]{0,40}?(?:temperature|溫度)[^.;。]{0,70}?(?:current|baseline|現況|基準)[^.;。]{0,50}?(?:is|was|為|達)\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu,
    /(?:average|mean)[^.;。]{0,70}?(?:current|baseline|現況|基準)[^.;。]{0,70}?(?:temperature|溫度)[^.;。]{0,30}?(?:is|was|為|達)\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu,
    /(?:current|baseline|現況|基準)[^.;。]{0,70}?(?:average|mean|平均)[^.;。]{0,50}?(?:temperature|溫度)[^.;。]{0,30}?(?:is|was|為|達)\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu,
  ];
  baselinePatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const value = match[1];
      if (!value) continue;
      addFact(match as RegExpExecArray, [value], "現況熱環境溫度", "baseline_mean", `${value} °C`, "°C");
    }
  });

  const temperatureDifferencePattern = /(?:maximum|maximal|最大)[^.;。]{0,100}?(?:air\s+temperature\s+difference|temperature\s+difference|溫差|氣溫差)[^.;。]{0,50}?(?:reached?|was|is|達|為|可達)?\s*(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu;
  for (const match of text.matchAll(temperatureDifferencePattern)) {
    const value = match[1];
    if (!value) continue;
    addFact(match as RegExpExecArray, [value], "空氣溫度差", "maximum_group_difference", `${value} °C`, "°C");
  }

  const coolingPatterns = [
    /(?:cool(?:ed|ing)\s+(?:the\s+)?(?:area|site|surface|air|environment)?[^.;。]{0,40}?by\s+(?:an\s+average\s+of\s+)?|平均(?:可)?降溫\s*|降溫(?:達|幅度(?:為|達))\s*)(\d+(?:\.\d+)?)\s*(?:°\s*C|℃|degrees?\s+Celsius)/giu,
  ];
  coolingPatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const value = match[1];
      if (!value) continue;
      addFact(match as RegExpExecArray, [value], "平均降溫效果", "mean_cooling_effect", `${value} °C`, "°C");
    }
  });

  const humidityPatterns = [
    /(?:maximum|maximal|最大)[^.;。]{0,80}?(?:relative\s+humidity\s+difference|相對濕度差)[^.;。]{0,40}?(?:was|reached?|達|為|可達)?\s*(\d+(?:\.\d+)?)\s*%/giu,
  ];
  humidityPatterns.forEach((pattern) => {
    for (const match of text.matchAll(pattern)) {
      const value = match[1];
      if (!value) continue;
      addFact(match as RegExpExecArray, [value], "相對濕度差", "maximum_group_difference", `${value}%`, "%");
    }
  });

  const modelFitPattern = /\bR\s*(?:2|²)\s*(?:=|>|≥|exceed(?:s|ed|ing)?|above|超過|大於)?\s*([01](?:\.\d+)?)/giu;
  for (const match of text.matchAll(modelFitPattern)) {
    const value = match[1];
    if (!value) continue;
    const comparator = /(?:>|≥|exceed|above|超過|大於)/iu.test(match[0]) ? ">" : "=";
    addFact(match as RegExpExecArray, [value], "舒適模型解釋力 R²", "model_fit", `R² ${comparator} ${value}`, null);
  }

  return facts;
}

function buildNumericVisual(
  profiles: FactorProfile[],
  sources: SourceRecord[],
  standardizedFacts: StandardizedEvidenceFact[],
): EvidenceVisualSpec | null {
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const standardizedFactMap = new Map(
    standardizedFacts.map((fact) => [`${fact.sourceId}\u0000${fact.evidenceId}`, fact] as const),
  );
  const facts = profiles
    .flatMap((profile) => profile.cards.flatMap((card) => collectNumericFacts(
      card,
      sourceMap,
      standardizedFactMap.get(`${card.sourceId}\u0000${evidenceId(card)}`) ?? null,
    )))
    .filter((fact, index, all) => all.findIndex((candidate) => candidate.key === fact.key) === index)
    .slice(0, 10);
  if (facts.length < 2) return null;

  const relevantProfiles = profiles.filter((profile) => facts.some((fact) => fact.sourceId === profile.sourceId));
  const dataPoints = facts.map<EvidenceVisualDatumProvenance>((fact) => ({
    datumKey: fact.key,
    displayValue: fact.displayValue,
    metric: fact.metric,
    unit: fact.unit,
    evidenceIds: [fact.evidenceId],
    sourceIds: [fact.sourceId],
    factIds: fact.factId ? [fact.factId] : [],
    numericalResultIds: fact.numericalResultIds,
    sourceField: fact.numericalResultIds.length > 0
      ? "standardized_numerical_result"
      : "exact_result_semantic_extract",
    exactText: fact.exactText,
    locator: fact.locator,
    derivation: "從 exactResult 的具名結果語境組成單一 panel；range、exposure basis 與 outcome effect 保持完整，不將年份、樣點數或方案編號當成結果。",
  }));

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "可核對數值結果：分開呈現的研究小圖表",
    units: null,
    legend: [
      { key: "可核對", label: "來源直接揭露且通過可核對結果欄位驗證的結果" },
      { key: "獨立尺度", label: "每列為獨立尺度，不共用座標軸" },
    ],
    data: {
      kind: "matrix",
      columns: ["研究方法", "結果指標", "統計量", "結果（獨立尺度）", "來源定位"],
      rows: facts.map((fact) => ({
        label: fact.sourceLabel,
        values: [fact.method, fact.metric, fact.statisticType, fact.displayValue, fact.locator ?? "可核對內容摘錄"],
      })),
    },
    sourceNote: "每列均由完整可核對結果語句建立；結構化來源追溯資料另保存事實與數值結果的內部身分，不顯示於讀者正文。",
    note: COMPARABILITY_WARNING,
    altText: `分列呈現 ${facts.length} 個可核對數值結果；各列使用獨立尺度，不能依數值大小直接排名。`,
    visualId: "evidence-visual-numeric-small-multiples",
    visualType: "numeric_small_multiples",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "findings",
    provenance: baseProvenance(relevantProfiles, dataPoints),
    comparabilityWarning: COMPARABILITY_WARNING,
  };
}

function buildMechanismVisual(profiles: FactorProfile[]): EvidenceVisualSpec | null {
  const groundedProfiles = profiles.map((profile) => ({
    ...profile,
    text: profile.cards.map(groundedCardText).join(" "),
  }));
  const mechanisms = detectConcepts(groundedProfiles, MECHANISM_RULES);
  if (mechanisms.length === 0) return null;

  const nodes = [
    { id: "configuration", label: "綠量與空間配置" },
    ...mechanisms.map((mechanism) => ({ id: `mechanism-${mechanism.id}`, label: mechanism.label })),
    { id: "thermal-result", label: "熱環境結果" },
  ];
  const edges = mechanisms.flatMap((mechanism) => [
    { from: "configuration", to: `mechanism-${mechanism.id}`, label: "證據提及的路徑" },
    { from: `mechanism-${mechanism.id}`, to: "thermal-result", label: "解釋性連結" },
  ]);

  return {
    specType: "figure",
    number: 0,
    figureType: "conceptual_mechanism",
    title: "綠量與熱環境之間的證據支持機制",
    units: null,
    legend: [
      { key: "證據節點", label: "納入來源明確提及的機制節點" },
      { key: "綜合連線", label: "跨來源解釋性連線，非因果效果量" },
    ],
    data: { kind: "directed_graph", nodes, edges },
    sourceNote: "機制節點只從可核對結果或其證據摘錄擷取；連線用於綜合解釋，不宣稱已由同一研究辨識因果中介。",
    note: "圖中沒有出現的機制，不代表不存在，只代表目前納入證據未提供可核對支持。",
    altText: `由綠量與空間配置連至 ${mechanisms.map((mechanism) => mechanism.label).join("、")}，再連至熱環境結果；箭頭是解釋性綜合。`,
    visualId: "evidence-visual-mechanism-synthesis",
    visualType: "mechanism_synthesis",
    renderMode: "deterministic",
    claimMode: "explanatory_synthesis",
    preferredSectionId: "cross-source-synthesis",
    provenance: baseProvenance(
      groundedProfiles,
      mechanisms.map((mechanism) => conceptDataPoint(mechanism)),
    ),
    comparabilityWarning: null,
  };
}

function buildApplicabilityVisual(profiles: FactorProfile[]): EvidenceVisualSpec | null {
  if (profiles.length === 0) return null;
  const groups = [
    {
      key: "taiwan-campus",
      label: "臺灣校園",
      matching: profiles.filter((profile) => profile.taiwan && profile.campus),
      use: "最接近研究問題；仍須核對指標與設計",
    },
    {
      key: "taiwan-non-campus",
      label: "臺灣非校園",
      matching: profiles.filter((profile) => profile.taiwan && !profile.campus),
      use: "地理脈絡可參考；校園外推受限",
    },
    {
      key: "overseas-campus",
      label: "海外校園",
      matching: profiles.filter((profile) => !profile.taiwan && profile.campus),
      use: "場域與機制可參考；不可直接代表臺灣",
    },
    {
      key: "other",
      label: "海外非校園",
      matching: profiles.filter((profile) => !profile.taiwan && !profile.campus),
      use: "僅作背景或機制補充",
    },
  ];
  const dataPoints = groups.map((group) =>
    coverageDatum(group.key, group.label, group.matching, group.matching.length),
  );

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "證據適用邊界：地理與校園場域不可互相替代",
    units: "去重來源數",
    legend: [
      { key: "地理", label: "臺灣／海外" },
      { key: "場域", label: "校園／非校園" },
    ],
    data: {
      kind: "matrix",
      columns: ["來源數", "同時含綠量與熱結果", "對臺灣校園議題的用途"],
      rows: groups.map((group) => ({
        label: group.label,
        values: [
          String(group.matching.length),
          String(group.matching.filter((profile) => profile.green && profile.heat).length),
          group.use,
        ],
      })),
    },
    sourceNote: "依納入證據的地點、研究場域、暴露與結果分層，按來源身分去重。",
    note: "海外校園可補充場域機制，臺灣都市研究可補充在地脈絡；兩者拼接後仍不等於臺灣校園直接證據。",
    altText: "以臺灣或海外、校園或非校園交叉分層來源，並說明各層對臺灣校園研究問題的可用範圍。",
    visualId: "evidence-visual-applicability-boundary",
    visualType: "applicability_boundary",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "limitations",
    provenance: baseProvenance(profiles, dataPoints),
    comparabilityWarning: null,
  };
}

function matchedLabels(concepts: DetectedConcept[], fallback: string): string {
  const labels = concepts.slice(0, 3).map((concept) => concept.label);
  return labels.length > 0 ? labels.join("＋") : fallback;
}

function buildStudyDesignVisual(profiles: FactorProfile[], topic: string): EvidenceVisualSpec | null {
  const topicText = compact(topic);
  const asksForTaiwanCampus = TAIWAN_PATTERN.test(topicText) && CAMPUS_PATTERN.test(topicText);
  if (!asksForTaiwanCampus || profiles.length === 0) return null;

  const metrics = detectConcepts(profiles, METRIC_RULES);
  const outcomes = detectConcepts(profiles, OUTCOME_RULES);
  const controls: string[] = [];
  const evidenceText = profiles.map((profile) => profile.text).join(" ");
  if (/(?:季節|season)/iu.test(evidenceText)) controls.push("季節／時段");
  if (/(?:土地使用|land\s+use)/iu.test(evidenceText)) controls.push("土地使用");
  if (/(?:交通量|traffic)/iu.test(evidenceText)) controls.push("交通量");
  if (/(?:sky\s+view\s+factor|building\s+view\s+factor|aspect\s+ratio|天空視域|建築視域|高寬比)/iu.test(evidenceText)) controls.push("空間形態");

  const measureLabel = matchedLabels(metrics, "綠覆率＋街景綠量＋冠層結構");
  const outcomeLabel = matchedLabels(outcomes, "空氣溫度＋地表溫度＋熱舒適");
  const controlLabel = controls.length > 0 ? unique(controls).join("＋") : "季節、時段與空間條件";
  const completeCount = profiles.filter(
    (profile) => profile.taiwan && profile.campus && profile.green && profile.heat,
  ).length;
  const nodes = [
    { id: "sample", label: "臺灣校園分層樣本" },
    { id: "green-measures", label: `綠量：${measureLabel}` },
    { id: "heat-outcomes", label: `熱結果：${outcomeLabel}` },
    { id: "controls", label: `情境控制：${controlLabel}` },
    { id: "comparison", label: "同尺度、同時段的分層比較" },
    { id: "boundary", label: "明示可外推的校園與季節邊界" },
  ];
  const edges = [
    { from: "sample", to: "green-measures", label: "同地點量測" },
    { from: "sample", to: "heat-outcomes", label: "同地點量測" },
    { from: "controls", to: "comparison", label: "納入分層或模型" },
    { from: "green-measures", to: "comparison", label: "暴露構面" },
    { from: "heat-outcomes", to: "comparison", label: "結果構面" },
    { from: "comparison", to: "boundary", label: "限定推論" },
  ];
  const planPoint: EvidenceVisualDatumProvenance = {
    datumKey: "study-design-gap",
    displayValue: `完整四要素來源數：${completeCount}`,
    metric: "研究設計缺口",
    unit: "來源數",
    evidenceIds: allEvidenceIds(profiles),
    sourceIds: allSourceIds(profiles),
    factIds: [],
    numericalResultIds: [],
    sourceField: "explanatory_synthesis",
    exactText: null,
    locator: null,
    derivation: "由研究問題四要素的交集缺口，以及現有來源已使用的量測與控制構面反推後續研究架構。",
  };

  return {
    specType: "figure",
    number: 0,
    figureType: "conceptual_mechanism",
    title: "由證據缺口反推的臺灣校園研究設計",
    units: null,
    legend: [
      { key: "同步量測", label: "同地點、同時段量測" },
      { key: "情境控制", label: "情境控制與分層" },
      { key: "推論邊界", label: "明示推論邊界" },
    ],
    data: { kind: "directed_graph", nodes, edges },
    sourceNote: "這是研究設計建議；節點由完整研究問題的缺口與納入證據已出現的指標、結果及控制變項決定。",
    note: "流程圖不是既有研究結果，也不替任何尚未蒐集的臺灣校園資料背書。",
    altText: "建議以臺灣校園分層取樣，同地點量測多種綠量與熱結果，控制季節與空間條件後比較，並限制外推範圍。",
    visualId: "evidence-visual-study-design",
    visualType: "study_design",
    renderMode: "deterministic",
    claimMode: "research_design",
    preferredSectionId: "conclusion",
    provenance: baseProvenance(profiles, [planPoint]),
    comparabilityWarning: null,
  };
}

type EvidenceFunctionCarrier = {
  evidenceFunction?: string | null;
};

function declaredEvidenceFunctions(
  cards: EvidenceCard[],
  facts: StandardizedEvidenceFact[],
): string[] {
  return unique([
    ...cards.map((card) => compact((card as EvidenceCard & EvidenceFunctionCarrier).evidenceFunction).toLowerCase()),
    ...facts.map((fact) => compact((fact as StandardizedEvidenceFact & EvidenceFunctionCarrier).evidenceFunction).toLowerCase()),
  ]);
}

function groupShortVideoEvidence(
  cards: EvidenceCard[],
  standardizedFacts: StandardizedEvidenceFact[],
): ShortVideoSleepProfile[] {
  const groups = new Map<string, EvidenceCard[]>();
  cards.filter(cardIsUsable).forEach((card) => {
    const sourceId = compact(card.sourceId);
    groups.set(sourceId, [...(groups.get(sourceId) ?? []), card]);
  });
  const factsBySource = new Map<string, StandardizedEvidenceFact[]>();
  standardizedFacts.forEach((fact) => {
    const sourceId = compact(fact.sourceId);
    factsBySource.set(sourceId, [...(factsBySource.get(sourceId) ?? []), fact]);
  });
  return [...groups.entries()].map(([sourceId, sourceCards]) => {
    const sourceFacts = factsBySource.get(sourceId) ?? [];
    // `groundedText` remains available for reader-facing sample labels. It is
    // deliberately NOT the source-level exposure classifier: a general social
    // media paper may list TikTok in an abstract, and a topic-conditioned
    // summary may echo "short-form video" even though that is not the study's
    // primary exposure.
    const groundedText = sourceCards.flatMap((card) => [
      card.sourceTitle,
      card.exactResult,
      card.supportedByText,
      card.supportSpan,
      card.studyDesign,
      card.exposure,
      card.outcome,
    ]).map(compact).filter(Boolean).join(" ");
    const titleText = sourceCards.flatMap((card) => [card.sourceTitle, card.title])
      .map(compact).filter(Boolean).join(" ");
    const declaredExposureText = sourceCards.map((card) => compact(card.exposure)).filter(Boolean).join(" ");
    const canonicalExposureText = sourceFacts.flatMap((fact) => [
      fact.exposureConcept,
      fact.exposureMeasure,
      fact.exposure,
    ]).map(compact).filter(Boolean).join(" ");
    const outcomeText = [
      titleText,
      ...sourceCards.map((card) => compact(card.outcome)),
      ...sourceFacts.flatMap((fact) => [fact.outcomeConcept, fact.outcomeMeasure, fact.outcome]).map(compact),
    ].filter(Boolean).join(" ");
    const populationText = [
      titleText,
      ...sourceCards.flatMap((card) => [card.researchSetting, card.dataScope]).map(compact),
      ...sourceFacts.flatMap((fact) => [
        fact.population,
        fact.ageGroup,
        fact.populationOrObject,
        fact.setting,
      ]).map(compact),
    ].filter(Boolean).join(" ");
    const designText = [
      titleText,
      ...sourceCards.map((card) => compact(card.studyDesign)),
      ...sourceFacts.flatMap((fact) => [fact.studyDesign, fact.design, fact.method]).map(compact),
    ].filter(Boolean).join(" ");
    const mediatorText = [
      titleText,
      ...sourceFacts.map((fact) => compact(fact.mediator)),
    ].filter(Boolean).join(" ");
    const evidenceFunctions = declaredEvidenceFunctions(sourceCards, sourceFacts);

    // Study-level framing wins over incidental platform mentions. Explicit
    // "short-form video" wording is narrow. TikTok alone counts as narrow only
    // when the title/primary exposure is not framed as general social media.
    const explicitlyNarrow = NARROW_SHORT_VIDEO_PATTERN.test(`${titleText} ${declaredExposureText}`);
    const explicitlyGeneral = GENERAL_SOCIAL_MEDIA_PATTERN.test(`${titleText} ${declaredExposureText}`) &&
      !explicitlyNarrow;
    const canonicalNarrow = NARROW_SHORT_VIDEO_PATTERN.test(canonicalExposureText) ||
      TIKTOK_EXPOSURE_PATTERN.test(canonicalExposureText);
    const titleOrPrimaryTikTok = TIKTOK_EXPOSURE_PATTERN.test(`${titleText} ${declaredExposureText}`);
    const shortFormVideo = explicitlyNarrow ||
      (!explicitlyGeneral && (titleOrPrimaryTikTok || canonicalNarrow));
    const generalSocialMedia = explicitlyGeneral;
    const review = /(?:scoping\s+review|systematic\s+review|PRISMA|回顧)/iu.test(designText);
    const backgroundOnly = review || (evidenceFunctions.length > 0 && evidenceFunctions.every((value) =>
      /^(?:background|definition|method|limitation)$/u.test(value)
    ));

    return {
      sourceId,
      evidenceIds: unique(sourceCards.map(evidenceId)),
      cards: sourceCards,
      groundedText,
      title: compact(sourceCards[0]?.sourceTitle) || compact(sourceCards[0]?.title) || "納入來源",
      highSchool: /(?:three\s+high\s+schools?|senior\s+high\s+school|public\s+secondary\s+school|secondary\s+school\s+students?|高中|中學)/iu.test(populationText),
      adolescent: /(?:adolescents?|青少年|高中|中學)/iu.test(populationText),
      college: /(?:college\s+students?|university\s+students?|大學生)/iu.test(populationText),
      shortFormVideo,
      tiktok: shortFormVideo && TIKTOK_EXPOSURE_PATTERN.test(`${titleText} ${declaredExposureText} ${canonicalExposureText}`),
      generalSocialMedia,
      sleep: SLEEP_PATTERN.test(outcomeText),
      mediation: /(?:mediat(?:e|es|ed|ing|or)|中介)/iu.test(mediatorText),
      review,
      backgroundOnly,
    };
  });
}

function shortEvidenceIds(profiles: ShortVideoSleepProfile[]): string[] {
  return unique(profiles.flatMap((profile) => profile.evidenceIds));
}

function shortSourceIds(profiles: ShortVideoSleepProfile[]): string[] {
  return unique(profiles.map((profile) => profile.sourceId));
}

function shortBaseProvenance(
  profiles: ShortVideoSleepProfile[],
  dataPoints: EvidenceVisualDatumProvenance[],
): EvidenceVisualProvenance {
  return {
    origin: "structured_evidence",
    evidenceIds: shortEvidenceIds(profiles),
    sourceIds: shortSourceIds(profiles),
    dataPoints,
  };
}

function shortCoverageDatum(
  datumKey: string,
  label: string,
  matching: ShortVideoSleepProfile[],
  derivation: string,
): EvidenceVisualDatumProvenance {
  return {
    datumKey,
    displayValue: String(matching.length),
    metric: label,
    unit: "來源數",
    evidenceIds: shortEvidenceIds(matching),
    sourceIds: shortSourceIds(matching),
    factIds: [],
    numericalResultIds: [],
    sourceField: "derived_coverage_count",
    exactText: null,
    locator: null,
    derivation,
  };
}

function buildSleepEvidenceCoverageVisual(
  profiles: ShortVideoSleepProfile[],
): EvidenceVisualSpec | null {
  if (profiles.length === 0) return null;
  const resultBearingProfiles = profiles.filter((profile) => !profile.backgroundOnly);
  const dimensions = [
    { key: "school-age", label: "高中／中學青少年", matching: resultBearingProfiles.filter((profile) => profile.highSchool) },
    { key: "short-video", label: "短影音／TikTok 暴露", matching: resultBearingProfiles.filter((profile) => profile.shortFormVideo) },
    { key: "sleep", label: "睡眠品質結果", matching: resultBearingProfiles.filter((profile) => profile.sleep) },
  ];
  const intersection = resultBearingProfiles.filter((profile) =>
    profile.highSchool && profile.shortFormVideo && profile.sleep
  );
  const derivation = "按來源去重；題名與結構化主暴露欄位決定來源層級暴露，canonical fact 概念僅作結構化補充。一般社群媒體來源中的平台提及或主題回響不會將整篇來源升格為短影音證據；回顧與其他純背景來源不計入核心覆蓋。";
  const dataPoints = dimensions.map((dimension) =>
    shortCoverageDatum(`sleep-coverage-${dimension.key}`, dimension.label, dimension.matching, derivation)
  );
  const intersectionPoint = shortCoverageDatum(
    "sleep-coverage-intersection",
    "高中／中學 × 短影音／TikTok × 睡眠",
    intersection,
    derivation,
  );

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "目前知道什麼：高中生、短影音與睡眠的證據覆蓋",
    units: "去重來源數",
    legend: [
      { key: "單一構面", label: "來源直接提及該構面" },
      { key: "核心交集", label: "同一來源同時涵蓋三個核心構面" },
    ],
    data: {
      kind: "matrix",
      columns: ["來源數", "覆蓋狀態", "閱讀方式"],
      rows: [
        ...dimensions.map((dimension) => ({
          label: dimension.label,
          values: [
            String(dimension.matching.length),
            dimension.matching.length > 0 ? "已有證據" : "缺口",
            "單一構面覆蓋不等於直接回答完整問題",
          ],
        })),
        {
          label: "高中／中學 × 短影音／TikTok × 睡眠",
          values: [
            String(intersection.length),
            intersection.length > 0 ? "有直接交集" : "尚無直接交集",
            "優先用於本題的直接結果與數值解讀",
          ],
        },
      ],
    },
    sourceNote: "依題名、結構化主暴露／結果欄位與 canonical facts 的明確概念分類，按來源身分去重；不使用主題導向摘要來改寫來源層級暴露。",
    note: "一般社群媒體研究可補充睡眠關聯脈絡，但不因摘要列出 TikTok 就計為短影音來源；回顧、非睡眠結果與大學生研究也不會被計入高中生短影音直接睡眠證據。",
    altText: `三個核心構面的來源覆蓋，以及同時涵蓋高中或中學、短影音或 TikTok 與睡眠結果的直接來源共 ${intersection.length} 筆。`,
    visualId: "evidence-visual-sleep-evidence-coverage",
    visualType: "sleep_evidence_coverage",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "research-question-and-scope",
    provenance: shortBaseProvenance(profiles, [...dataPoints, intersectionPoint]),
    comparabilityWarning: null,
    semanticData: {
      kind: "evidence_coverage",
      dimensions: dimensions.map((dimension, index) => ({
        datumKey: dataPoints[index]!.datumKey,
        label: dimension.label,
        count: dimension.matching.length,
      })),
      intersection: {
        datumKey: intersectionPoint.datumKey,
        label: intersectionPoint.metric,
        count: intersection.length,
      },
      rankingAllowed: false,
    },
  };
}

function factProfile(
  result: StandardizedNumericalResult,
  profiles: ShortVideoSleepProfile[],
): ShortVideoSleepProfile | null {
  return profiles.find((profile) => profile.sourceId === result.sourceId) ?? null;
}

function sourceLabelForResult(
  result: StandardizedNumericalResult,
  profiles: ShortVideoSleepProfile[],
  sources: SourceRecord[],
): string {
  const profile = factProfile(result, profiles);
  const card = profile?.cards[0];
  return card
    ? sourceLabel(card, new Map(sources.map((source) => [source.id, source])))
    : profile?.title ?? "納入研究";
}

function sampleDefinitionForResult(
  result: StandardizedNumericalResult,
  profiles: ShortVideoSleepProfile[],
): string {
  const text = factProfile(result, profiles)?.groundedText ?? result.supportingText;
  if (/three\s+high\s+schools?/iu.test(text)) return "三所高中青少年；睡眠品質異常檢出率";
  if (/(?:Aseer|public\s+secondary\s+school)/iu.test(text)) return "Aseer 公立中學生；PSQI 睡眠不佳";
  if (/college\s+students?/iu.test(text)) return "大學生；睡眠品質量表";
  return "來源樣本與睡眠判定定義";
}

function standardizedResultDatum(
  result: StandardizedNumericalResult,
  datumKey: string,
  metric: string,
  derivation: string,
): EvidenceVisualDatumProvenance {
  return {
    datumKey,
    displayValue: result.displayValue,
    metric,
    unit: result.unit || null,
    evidenceIds: [result.evidenceId],
    sourceIds: [result.sourceId],
    factIds: [result.factId],
    numericalResultIds: [result.resultId],
    sourceField: "standardized_numerical_result",
    exactText: result.supportingText,
    locator: result.locator,
    derivation,
  };
}

function percentageGlyph(value: number): string {
  const filled = Math.max(0, Math.min(20, Math.round(value / 5)));
  return `${"█".repeat(filled)}${"░".repeat(20 - filled)}`;
}

function isSleepPrevalence(result: StandardizedNumericalResult): boolean {
  return result.unit === "%" && result.value != null &&
    (result.statisticType === "prevalence" || result.metric === "poor_sleep_prevalence") &&
    /(?:detection rate of sleep quality|poor sleepers?|poor sleep|睡眠品質異常檢出率|睡眠不佳)/iu.test(result.supportingText);
}

function buildPrevalenceFacetsVisual(
  profiles: ShortVideoSleepProfile[],
  facts: StandardizedEvidenceFact[],
  sources: SourceRecord[],
): EvidenceVisualSpec | null {
  const results = facts.flatMap((fact) => fact.numericalResults)
    .filter(isSleepPrevalence)
    .filter((result, index, all) => all.findIndex((candidate) => candidate.resultId === result.resultId) === index);
  if (results.length < 2) return null;
  const routed = routeVisualStatisticGroup({
    results,
    requestedVisualType: "proportion_facets",
    comparisonMode: "independent_facets",
  });
  if (!routed.ok) return null;

  const panels = results.map((result) => {
    const datumKey = `sleep-prevalence-${result.resultId}`;
    return {
      result,
      datumKey,
      sourceLabel: sourceLabelForResult(result, profiles, sources),
      sampleDefinition: sampleDefinitionForResult(result, profiles),
    };
  });
  const relevantProfiles = profiles.filter((profile) => results.some((result) => result.sourceId === profile.sourceId));
  const warning = "各研究樣本與睡眠判定方式不同，數值僅供分別理解，不作直接高低比較。";

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "睡眠比例小多圖：各研究分面、固定 0–100% 尺度",
    units: "%",
    legend: [
      { key: "獨立分面", label: "每一列是一個研究與其自身判定定義" },
      { key: "0–100%", label: "比例尺度固定，但不建立研究排名" },
    ],
    data: {
      kind: "matrix",
      columns: ["0–100% 比例條", "原值", "樣本／判定", "比較規則"],
      rows: panels.map((panel) => ({
        label: panel.sourceLabel,
        values: [
          percentageGlyph(panel.result.value!),
          `${panel.result.value}%`,
          panel.sampleDefinition,
          "僅分別理解；不可直接比較",
        ],
      })),
    },
    sourceNote: "每一比例均取自 standardized evidence fact 的 exactResult 數值，並保留來源、樣本與睡眠判定語境。",
    note: warning,
    altText: `分開呈現 ${panels.map((panel) => `${panel.result.value}%`).join(" 與 ")} 的睡眠比例；兩者樣本與判定方式不同，不能直接比較高低。`,
    visualId: "evidence-visual-sleep-prevalence-facets",
    visualType: "prevalence_facets",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "findings",
    provenance: shortBaseProvenance(
      relevantProfiles,
      panels.map((panel) => standardizedResultDatum(
        panel.result,
        panel.datumKey,
        panel.sampleDefinition,
        "保留來源報告的睡眠比例原值，固定 0–100% 視覺尺度，但不進行跨研究排序、相減或合併。",
      )),
    ),
    comparabilityWarning: warning,
    semanticRoute: routed.route,
    semanticData: {
      kind: "proportion_facets",
      scaleMinimum: 0,
      scaleMaximum: 100,
      unit: "%",
      panelMode: "independent",
      directComparisonAllowed: false,
      rankingAllowed: false,
      poolingAllowed: false,
      panels: panels.map((panel) => ({
        datumKey: panel.datumKey,
        label: panel.sourceLabel,
        value: panel.result.value!,
        unit: "%",
        metric: panel.result.metric,
        sourceId: panel.result.sourceId,
        evidenceId: panel.result.evidenceId,
        factId: panel.result.factId,
        numericalResultId: panel.result.resultId,
        sampleDefinition: panel.sampleDefinition,
        directComparisonAllowed: false,
      })),
    },
  };
}

function oddsRatioPredictorKey(result: StandardizedNumericalResult): "tiktok" | "hours" | "depression" | null {
  // Each OR shares one source sentence containing all three predictors; classify
  // by the parser-preserved local comparison basis, never by the whole sentence.
  const text = compact(result.comparisonBasis);
  if (/TikTok\s+use|TikTok 使用/iu.test(text)) return "tiktok";
  if (/hours? spent on social media|social media use hours?|社群媒體使用時數/iu.test(text)) return "hours";
  if (/moderate to severe depressive symptoms?|中重度憂鬱/iu.test(text)) return "depression";
  return null;
}

function buildOddsRatioForestVisual(
  profiles: ShortVideoSleepProfile[],
  facts: StandardizedEvidenceFact[],
): EvidenceVisualSpec | null {
  const allResults = facts.flatMap((fact) => fact.numericalResults)
    .filter((result) => result.statisticType === "odds_ratio" && result.metric === "poor_sleep_odds");
  const grouped = new Map<string, StandardizedNumericalResult[]>();
  allResults.forEach((result) => grouped.set(result.sourceId, [...(grouped.get(result.sourceId) ?? []), result]));
  const candidateGroup = [...grouped.values()]
    .sort((left, right) => right.length - left.length || left[0]!.sourceId.localeCompare(right[0]!.sourceId))[0] ?? [];
  const keyed = new Map(candidateGroup.flatMap((result) => {
    const key = oddsRatioPredictorKey(result);
    return key ? [[key, result] as const] : [];
  }));
  const ordered = (["tiktok", "hours", "depression"] as const)
    .map((key) => keyed.get(key))
    .filter((result): result is StandardizedNumericalResult => Boolean(result));
  if (ordered.length !== 3) return null;
  const routed = routeVisualStatisticGroup({
    results: ordered,
    requestedVisualType: "forest_plot",
    comparisonMode: "interval_display",
  });
  if (!routed.ok) return null;

  const labels = new Map([
    ["tiktok", "TikTok 使用"],
    ["hours", "社群媒體使用時數增加"],
    ["depression", "中重度憂鬱症狀"],
  ] as const);
  const rows = ordered.map((result) => {
    const key = oddsRatioPredictorKey(result)!;
    return { result, datumKey: `sleep-or-${result.resultId}`, label: labels.get(key)! };
  });
  const relevantProfiles = profiles.filter((profile) => profile.sourceId === ordered[0]!.sourceId);

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "睡眠不佳的 OR forest plot：估計值、95% CI 與基準線 1",
    units: "OR（95% CI）",
    legend: [
      { key: "點", label: "勝算比（OR）估計值" },
      { key: "線", label: "95% 信賴區間" },
      { key: "1", label: "無關聯基準線" },
    ],
    data: {
      kind: "matrix",
      columns: ["95% CI 下限", "OR", "95% CI 上限", "基準線"],
      rows: rows.map(({ result, label }) => ({
        label,
        values: [String(result.lowerBound), String(result.value), String(result.upperBound), "1"],
      })),
    },
    sourceNote: "三列均來自同一中學生研究對睡眠不佳的模型結果；每列保留原 OR 與 95% CI。",
    note: "OR 是勝算比，不是風險百分比；此圖不把 OR 1.33 解讀成『風險增加 33%』，也不依點估計值排名因素重要性。",
    altText: rows.map(({ result, label }) =>
      `${label} OR ${result.value}，95% CI ${result.lowerBound}–${result.upperBound}`
    ).join("；") + "；基準線為 1。",
    visualId: "evidence-visual-sleep-odds-ratio-forest",
    visualType: "odds_ratio_forest",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "findings",
    provenance: shortBaseProvenance(
      relevantProfiles,
      rows.map(({ result, datumKey, label }) => standardizedResultDatum(
        result,
        datumKey,
        `${label}與睡眠不佳的 OR`,
        "原研究的 OR 點估計與 95% CI 保持為一個不可拆分的 datum；未轉換為風險百分比。",
      )),
    ),
    comparabilityWarning: "三列是同一模型中的不同預測因子，僅顯示各自區間，不構成效果量排名或跨研究合併。",
    semanticRoute: routed.route,
    semanticData: {
      kind: "forest_plot",
      statisticType: "odds_ratio",
      referenceValue: 1,
      rankingAllowed: false,
      poolingAllowed: false,
      rows: rows.map(({ result, datumKey, label }) => ({
        datumKey,
        label,
        estimate: result.value!,
        lowerBound: result.lowerBound!,
        upperBound: result.upperBound!,
        unit: "OR",
        sourceId: result.sourceId,
        evidenceId: result.evidenceId,
        factId: result.factId,
        numericalResultId: result.resultId,
      })),
    },
  };
}

function correlationPairKey(
  result: StandardizedNumericalResult,
): "sfv-sleep" | "sfv-anxiety" | "sleep-anxiety" | null {
  const basis = compact(result.comparisonBasis).toLocaleLowerCase();
  const hasVideo = /(?:短影音|短視頻|short[-‐‑‒–— ]form)/iu.test(basis);
  const hasSleep = /(?:睡眠|sleep)/iu.test(basis);
  const hasAnxiety = /(?:焦慮|anxiety)/iu.test(basis);
  if (hasVideo && hasSleep && !hasAnxiety) return "sfv-sleep";
  if (hasVideo && hasAnxiety && !hasSleep) return "sfv-anxiety";
  if (hasSleep && hasAnxiety && !hasVideo) return "sleep-anxiety";
  return null;
}

function buildCorrelationStructureVisual(
  profiles: ShortVideoSleepProfile[],
  facts: StandardizedEvidenceFact[],
): EvidenceVisualSpec | null {
  const results = facts.flatMap((fact) => fact.numericalResults)
    .filter((result) => result.statisticType === "correlation_coefficient" && result.unit === "r");
  const keyed = new Map(results.flatMap((result) => {
    const key = correlationPairKey(result);
    return key ? [[key, result] as const] : [];
  }));
  const orderedKeys = ["sfv-sleep", "sfv-anxiety", "sleep-anxiety"] as const;
  const ordered = orderedKeys.map((key) => keyed.get(key))
    .filter((result): result is StandardizedNumericalResult => Boolean(result));
  if (ordered.length !== 3 || new Set(ordered.map((result) => result.sourceId)).size !== 1) return null;
  const routed = routeVisualStatisticGroup({
    results: ordered,
    requestedVisualType: "correlation_structure",
    comparisonMode: "association_network",
  });
  if (!routed.ok) return null;

  const nodes = [
    { id: "sfv-addiction", label: "短影音成癮" },
    { id: "sleep-score", label: "睡眠品質量表分數（方向未核定）" },
    { id: "social-anxiety", label: "社交焦慮" },
  ];
  const endpoints = new Map([
    ["sfv-sleep", ["sfv-addiction", "sleep-score"]],
    ["sfv-anxiety", ["sfv-addiction", "social-anxiety"]],
    ["sleep-anxiety", ["sleep-score", "social-anxiety"]],
  ] as const);
  const links = orderedKeys.map((key, index) => {
    const result = ordered[index]!;
    const [from, to] = endpoints.get(key)!;
    return { result, datumKey: `sleep-correlation-${result.resultId}`, from, to };
  });
  const relevantProfiles = profiles.filter((profile) => profile.sourceId === ordered[0]!.sourceId);

  return {
    specType: "figure",
    number: 0,
    figureType: "conceptual_mechanism",
    title: "短影音成癮、睡眠品質分數與社交焦慮的相關結構",
    units: "相關係數 r",
    legend: [
      { key: "連線數值", label: "Pearson 相關係數 r" },
      { key: "節點", label: "原研究評估的三個變項" },
    ],
    data: {
      kind: "directed_graph",
      nodes,
      edges: links.map((link) => ({
        from: link.from,
        to: link.to,
        label: `r = ${link.result.value}`,
      })),
    },
    sourceNote: "三個 r 值取自同一高中青少年研究的相關分析；數值保持為相關係數，不換算為百分比。",
    note: "摘要未在本圖所用資料中核定睡眠品質量表分數的好壞方向，因此只呈現變項間的統計關聯，不把正值自行翻譯成睡得更好或更差，也不宣稱因果。",
    altText: links.map((link) => {
      const from = nodes.find((node) => node.id === link.from)?.label ?? link.from;
      const to = nodes.find((node) => node.id === link.to)?.label ?? link.to;
      return `${from}與${to}的 r = ${link.result.value}`;
    }).join("；") + "。",
    visualId: "evidence-visual-sleep-correlation-structure",
    visualType: "correlation_structure",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "literature_review",
    provenance: shortBaseProvenance(
      relevantProfiles,
      links.map((link) => standardizedResultDatum(
        link.result,
        link.datumKey,
        compact(link.result.comparisonBasis) || "變項間相關",
        "保留原相關係數 r 與變項配對；不換算百分比，也不由量尺方向推論好壞。",
      )),
    ),
    comparabilityWarning: "三個 r 描述不同變項配對，不是可排序的三個效果量。",
    semanticRoute: routed.route,
    semanticData: {
      kind: "correlation_structure",
      statisticType: "correlation_coefficient",
      nodes,
      links: links.map((link) => ({
        datumKey: link.datumKey,
        from: link.from,
        to: link.to,
        value: link.result.value!,
        unit: "r",
        sourceId: link.result.sourceId,
        evidenceId: link.result.evidenceId,
        factId: link.result.factId,
        numericalResultId: link.result.resultId,
      })),
      percentConversionAllowed: false,
      causalClaim: false,
    },
  };
}

function mediationSupportSentence(fact: StandardizedEvidenceFact): string | null {
  return compact(fact.exactResult).split(/(?<=[。！？!?;；])\s*|(?<=[A-Za-z)])\.\s+(?=[A-Z])/u)
    .map(compact)
    .find((sentence) => /(?:social anxiety|社交焦慮).*(?:partially mediat|中介)|(?:partially mediat|中介).*(?:social anxiety|社交焦慮)/iu.test(sentence)) ?? null;
}

function buildStatisticalMediationVisual(
  profiles: ShortVideoSleepProfile[],
  facts: StandardizedEvidenceFact[],
): EvidenceVisualSpec | null {
  const fact = facts.find((candidate) => {
    const profile = profiles.find((item) => item.sourceId === candidate.sourceId);
    return Boolean(profile?.highSchool && profile.shortFormVideo && profile.sleep && mediationSupportSentence(candidate));
  });
  if (!fact) return null;
  const support = mediationSupportSentence(fact)!;
  const profile = profiles.find((candidate) => candidate.sourceId === fact.sourceId);
  if (!profile) return null;
  const nodes = [
    { id: "sfv-addiction", label: "短影音成癮" },
    { id: "social-anxiety", label: "社交焦慮" },
    { id: "sleep-quality", label: "睡眠品質" },
  ];
  const edgeDefinitions = [
    { key: `mediation-exposure-${fact.factId}`, from: "sfv-addiction", to: "social-anxiety" },
    { key: `mediation-outcome-${fact.factId}`, from: "social-anxiety", to: "sleep-quality" },
  ];
  const dataPoints = edgeDefinitions.map<EvidenceVisualDatumProvenance>((edge) => ({
    datumKey: edge.key,
    displayValue: "研究所提出的統計路徑（無係數）",
    metric: `${nodes.find((node) => node.id === edge.from)!.label} → ${nodes.find((node) => node.id === edge.to)!.label}`,
    unit: null,
    evidenceIds: [fact.evidenceId],
    sourceIds: [fact.sourceId],
    factIds: [fact.factId],
    numericalResultIds: [],
    sourceField: "exact_result_semantic_extract",
    exactText: support,
    locator: fact.locator,
    derivation: "來源明示社交焦慮具有部分中介；依本圖的無係數合約只呈現統計路徑，不搬入直接或間接效果係數。",
  }));

  return {
    specType: "figure",
    number: 0,
    figureType: "conceptual_mechanism",
    title: "社交焦慮的部分中介路徑：無係數、非因果機制圖",
    units: null,
    legend: [
      { key: "箭頭", label: "研究所提出的統計路徑" },
      { key: "無係數", label: "圖中不呈現路徑效果量" },
    ],
    data: {
      kind: "directed_graph",
      nodes,
      edges: edgeDefinitions.map((edge) => ({
        from: edge.from,
        to: edge.to,
        label: "研究所提出的統計路徑（無係數）",
      })),
    },
    sourceNote: "路徑只根據來源對社交焦慮部分中介的明示敘述；節點與箭頭由程式確定性生成。",
    note: "橫斷式中介分析不能確立時間順序或生理因果；此圖不是已證明的生物機制。",
    altText: "無係數路徑由短影音成癮連至社交焦慮，再連至睡眠品質；箭頭代表研究提出的統計中介路徑，不代表已證實因果。",
    visualId: "evidence-visual-sleep-statistical-mediation",
    visualType: "statistical_mediation_path",
    renderMode: "deterministic",
    claimMode: "explanatory_synthesis",
    preferredSectionId: "cross-source-synthesis",
    provenance: shortBaseProvenance([profile], dataPoints),
    comparabilityWarning: null,
    semanticData: {
      kind: "mediation_path",
      nodes,
      edges: edgeDefinitions.map((edge) => ({
        datumKey: edge.key,
        from: edge.from,
        to: edge.to,
        label: "研究所提出的統計路徑（無係數）",
      })),
      coefficientDisplay: "omitted",
      causalClaim: false,
    },
  };
}

function buildSleepApplicabilityBoundaryVisual(
  profiles: ShortVideoSleepProfile[],
): EvidenceVisualSpec | null {
  if (profiles.length === 0) return null;
  const direct = profiles.filter((profile) =>
    profile.highSchool && profile.shortFormVideo && profile.sleep && !profile.backgroundOnly
  );
  const college = profiles.filter((profile) =>
    !direct.includes(profile) && profile.college && profile.shortFormVideo && profile.sleep
  );
  const adolescentNonSleep = profiles.filter((profile) =>
    !direct.includes(profile) && !college.includes(profile) &&
    profile.adolescent && profile.shortFormVideo && !profile.sleep
  );
  const generalSocialMediaSleep = profiles.filter((profile) =>
    !direct.includes(profile) && !college.includes(profile) && !adolescentNonSleep.includes(profile) &&
    profile.generalSocialMedia && profile.sleep && !profile.backgroundOnly
  );
  const generalSocialMediaBackground = profiles.filter((profile) =>
    !direct.includes(profile) && !college.includes(profile) && !adolescentNonSleep.includes(profile) &&
    !generalSocialMediaSleep.includes(profile) && profile.generalSocialMedia
  );
  const otherBackground = profiles.filter((profile) =>
    !direct.includes(profile) && !college.includes(profile) && !adolescentNonSleep.includes(profile) &&
    !generalSocialMediaSleep.includes(profile) && !generalSocialMediaBackground.includes(profile)
  );
  const groups = [
    {
      key: "direct-school-sleep",
      label: "高中／中學生直接睡眠證據",
      matching: direct,
      use: "回答本題關聯與數值；仍不支持因果推論",
    },
    {
      key: "college-mechanism",
      label: "大學生機制參照",
      matching: college,
      use: "補充可能路徑；不得直接外推高中生",
    },
    {
      key: "adolescent-non-sleep",
      label: "青少年短影音、非睡眠結果",
      matching: adolescentNonSleep,
      use: "補充相鄰心理結果；不能支持睡眠結論",
    },
    {
      key: "general-social-media-sleep",
      label: "一般社群媒體—睡眠直接脈絡",
      matching: generalSocialMediaSleep,
      use: "補充同族群的睡眠關聯；主暴露不是短影音專屬",
    },
    {
      key: "general-social-media",
      label: "一般社群媒體回顧背景",
      matching: generalSocialMediaBackground,
      use: "界定背景風險；不冒充短影音直接證據",
    },
    ...(otherBackground.length > 0 ? [{
      key: "other-background",
      label: "其他相鄰背景／範圍來源",
      matching: otherBackground,
      use: "只補充相鄰範圍；不冒充短影音睡眠證據",
    }] : []),
  ];
  const derivation = "按題名、結構化主暴露、canonical fact 的對象／結果概念與 evidence function 建立互斥用途層級；同一來源只進入一個最接近本題的群組。";
  const dataPoints = groups.map((group) => shortCoverageDatum(
    `sleep-applicability-${group.key}`,
    group.label,
    group.matching,
    derivation,
  ));

  return {
    specType: "figure",
    number: 0,
    figureType: "evidence_gap_matrix",
    title: "證據適用性邊界：直接回答、機制參照與背景不可互換",
    units: "去重來源數",
    legend: [
      { key: "直接", label: "研究對象、暴露與睡眠結果最接近本題" },
      { key: "參照", label: "只補充機制、相鄰結果或背景" },
    ],
    data: {
      kind: "matrix",
      columns: ["來源數", "在本題中的用途", "不得外推"],
      rows: groups.map((group) => ({
        label: group.label,
        values: [
          String(group.matching.length),
          group.use.split("；")[0]!,
          group.use.split("；")[1] ?? "依來源直接範圍解讀",
        ],
      })),
    },
    sourceNote: "只依題名、結構化主暴露與 canonical facts 明示的研究對象、睡眠／非睡眠結果分層，按來源去重；不採用主題導向摘要的回響詞分類。",
    note: "TikTok 使用不等於短影音成癮；以一般社群媒體為主暴露的中學生睡眠研究可作直接睡眠脈絡，但不計入短影音來源；一般社群媒體回顧只作背景。大學生與高中生、睡眠與憂鬱等結果也不能互換。",
    altText: "將納入來源分為高中或中學生短影音直接睡眠證據、大學生機制參照、青少年短影音但非睡眠結果、一般社群媒體的直接睡眠脈絡，以及一般社群媒體回顧背景，並標示各層不可外推之處。",
    visualId: "evidence-visual-sleep-applicability-boundary",
    visualType: "population_applicability_boundary",
    renderMode: "deterministic",
    claimMode: "evidence_synthesis",
    preferredSectionId: "limitations",
    provenance: shortBaseProvenance(profiles, dataPoints),
    comparabilityWarning: "不同人口、暴露與結果層級不構成效果量排序。",
    semanticData: {
      kind: "applicability_boundary",
      groups: groups.map((group, index) => ({
        datumKey: dataPoints[index]!.datumKey,
        label: group.label,
        count: group.matching.length,
        use: group.use,
      })),
      rankingAllowed: false,
    },
  };
}

function buildShortVideoSleepVisuals(input: BuildEvidenceVisualsInput): EvidenceVisualSpec[] {
  const facts = input.standardizedFacts ?? [];
  const profiles = groupShortVideoEvidence(input.evidenceCards, facts);
  return [
    buildSleepEvidenceCoverageVisual(profiles),
    buildPrevalenceFacetsVisual(profiles, facts, input.sources ?? []),
    buildOddsRatioForestVisual(profiles, facts),
    buildCorrelationStructureVisual(profiles, facts),
    buildStatisticalMediationVisual(profiles, facts),
    buildSleepApplicabilityBoundaryVisual(profiles),
  ].filter((visual): visual is EvidenceVisualSpec => visual !== null);
}

function provenanceFromResults(
  results: StandardizedNumericalResult[],
  labelFor: (result: StandardizedNumericalResult) => string,
  derivation: string,
): EvidenceVisualProvenance {
  const dataPoints = results.map((result) => standardizedResultDatum(
    result,
    `generic-statistic-${result.resultId}`,
    labelFor(result),
    derivation,
  ));
  return {
    origin: "structured_evidence",
    evidenceIds: unique(results.map((result) => result.evidenceId)),
    sourceIds: unique(results.map((result) => result.sourceId)),
    dataPoints,
  };
}

function genericResultLabel(
  result: StandardizedNumericalResult,
  factById: Map<string, StandardizedEvidenceFact>,
): string {
  const basis = compact(result.comparisonBasis);
  if (basis) return basis;
  const fact = factById.get(result.factId);
  return compact(fact?.outcomeConcept) || compact(fact?.outcomeMeasure) || result.metric;
}

function genericSampleDefinition(
  result: StandardizedNumericalResult,
  factById: Map<string, StandardizedEvidenceFact>,
): string {
  const fact = factById.get(result.factId);
  if (!fact) return "依原研究樣本與操作定義解讀";
  const population = compact(fact.ageGroup) || compact(fact.population) || "原研究樣本";
  const measure = compact(fact.outcomeMeasure) || compact(fact.outcomeConcept) || result.metric;
  const size = fact.sampleSize == null ? "" : `；n = ${fact.sampleSize}`;
  return `${population}${size}；${measure}`;
}

/**
 * Topic grammars can add domain-specific coverage and mechanism figures, but
 * reported statistics must not depend on a topic whitelist. This fallback is
 * deliberately driven only by canonical numerical-result semantics.
 */
function buildGenericStatisticalVisuals(input: BuildEvidenceVisualsInput): EvidenceVisualSpec[] {
  const facts = input.standardizedFacts ?? [];
  const factById = new Map(facts.map((fact) => [fact.factId, fact] as const));
  const results = facts
    .flatMap((fact) => fact.numericalResults)
    .filter((result, index, all) => all.findIndex((candidate) => candidate.resultId === result.resultId) === index);
  const routeKind = (result: StandardizedNumericalResult) => {
    const routed = routeVisualStatistic(result);
    return routed.ok ? routed.route.visualType : null;
  };
  const candidates: EvidenceVisualSpec[] = [];

  const proportions = results.filter((result) => routeKind(result) === "proportion_facets");
  if (proportions.length > 0) {
    const routed = routeVisualStatisticGroup({
      results: proportions,
      requestedVisualType: "proportion_facets",
      comparisonMode: "independent_facets",
    });
    if (routed.ok) {
      const labelFor = (result: StandardizedNumericalResult) => genericResultLabel(result, factById);
      const provenance = provenanceFromResults(
        proportions,
        labelFor,
        "依 canonical fact 的比例原值建立獨立分面；不合併、不相減，也不依高低排序。",
      );
      candidates.push({
        specType: "figure",
        number: 0,
        figureType: "evidence_gap_matrix",
        title: "研究比例小多圖：依樣本與定義分面呈現",
        units: "%",
        legend: [
          { key: "獨立分面", label: "每一列保留原研究的樣本與操作定義" },
          { key: "0–100%", label: "共同尺度只協助理解比例，不代表可直接比較" },
        ],
        data: {
          kind: "matrix",
          columns: ["0–100% 比例條", "原值", "樣本／定義", "比較規則"],
          rows: proportions.map((result) => ({
            label: labelFor(result),
            values: [
              percentageGlyph(result.value!),
              `${result.value}%`,
              genericSampleDefinition(result, factById),
              "僅分別理解；不可直接排名",
            ],
          })),
        },
        sourceNote: "比例取自 canonical standardized facts，並保留逐值來源、fact 與 locator。",
        note: "各研究樣本與判定方式可能不同；數值僅供分別理解，不作直接高低比較。",
        altText: proportions.map((result) => `${labelFor(result)}：${result.value}%`).join("；") + "。各分面不可直接排名。",
        visualId: "evidence-visual-generic-proportion-facets",
        visualType: "prevalence_facets",
        renderMode: "deterministic",
        claimMode: "evidence_synthesis",
        preferredSectionId: "findings",
        provenance,
        comparabilityWarning: "各研究樣本與判定方式可能不同，數值僅供分別理解，不作直接高低比較。",
        semanticRoute: routed.route,
        semanticData: {
          kind: "proportion_facets",
          scaleMinimum: 0,
          scaleMaximum: 100,
          unit: "%",
          panelMode: "independent",
          directComparisonAllowed: false,
          rankingAllowed: false,
          poolingAllowed: false,
          panels: proportions.map((result) => ({
            datumKey: `generic-statistic-${result.resultId}`,
            label: labelFor(result),
            value: result.value!,
            unit: "%",
            metric: result.metric,
            sourceId: result.sourceId,
            evidenceId: result.evidenceId,
            factId: result.factId,
            numericalResultId: result.resultId,
            sampleDefinition: genericSampleDefinition(result, factById),
            directComparisonAllowed: false,
          })),
        },
      });
    }
  }

  const oddsRatios = results.filter((result) => routeKind(result) === "forest_plot");
  if (oddsRatios.length > 0) {
    const routed = routeVisualStatisticGroup({
      results: oddsRatios,
      requestedVisualType: "forest_plot",
      comparisonMode: "interval_display",
    });
    if (routed.ok) {
      const labelFor = (result: StandardizedNumericalResult) => genericResultLabel(result, factById);
      const provenance = provenanceFromResults(
        oddsRatios,
        labelFor,
        "保留每一 OR 點估計及其 95% CI；基準線固定為 1，不轉換成風險百分比。",
      );
      candidates.push({
        specType: "figure",
        number: 0,
        figureType: "evidence_gap_matrix",
        title: "勝算比 forest plot：估計值、95% CI 與基準線 1",
        units: "OR（95% CI）",
        legend: [
          { key: "點", label: "OR 點估計" },
          { key: "線", label: "95% 信賴區間" },
          { key: "1", label: "無關聯基準線" },
        ],
        data: {
          kind: "matrix",
          columns: ["95% CI 下限", "OR", "95% CI 上限", "基準線"],
          rows: oddsRatios.map((result) => ({
            label: labelFor(result),
            values: [String(result.lowerBound), String(result.value), String(result.upperBound), "1"],
          })),
        },
        sourceNote: "每列取自 canonical standardized fact 的一個完整 OR 與 95% CI datum。",
        note: "OR 不等於風險百分比；圖中不進行跨研究合併，也不依點估計排序重要性。",
        altText: oddsRatios.map((result) => `${labelFor(result)}：OR ${result.value}，95% CI ${result.lowerBound}–${result.upperBound}`).join("；") + "。基準線為 1。",
        visualId: "evidence-visual-generic-odds-ratio-forest",
        visualType: "odds_ratio_forest",
        renderMode: "deterministic",
        claimMode: "evidence_synthesis",
        preferredSectionId: "findings",
        provenance,
        comparabilityWarning: "各列只顯示原研究估計與區間，不進行效果量排名或合併。",
        semanticRoute: routed.route,
        semanticData: {
          kind: "forest_plot",
          statisticType: "odds_ratio",
          referenceValue: 1,
          rankingAllowed: false,
          poolingAllowed: false,
          rows: oddsRatios.map((result) => ({
            datumKey: `generic-statistic-${result.resultId}`,
            label: labelFor(result),
            estimate: result.value!,
            lowerBound: result.lowerBound!,
            upperBound: result.upperBound!,
            unit: "OR",
            sourceId: result.sourceId,
            evidenceId: result.evidenceId,
            factId: result.factId,
            numericalResultId: result.resultId,
          })),
        },
      });
    }
  }

  const correlations = results.filter((result) => routeKind(result) === "correlation_structure");
  const splitPair = (result: StandardizedNumericalResult): [string, string] | null => {
    const parts = compact(result.comparisonBasis)
      .split(/\s*(?:[—–↔]|\bvs\.?\b|與|和|\band\b)\s*/iu)
      .map(compact)
      .filter(Boolean);
    return parts.length === 2 ? [parts[0]!, parts[1]!] : null;
  };
  const pairedCorrelations = correlations.flatMap((result) => {
    const pair = splitPair(result);
    return pair ? [{ result, pair }] : [];
  });
  if (pairedCorrelations.length > 0) {
    const pairedResults = pairedCorrelations.map(({ result }) => result);
    const routed = routeVisualStatisticGroup({
      results: pairedResults,
      requestedVisualType: "correlation_structure",
      comparisonMode: "association_network",
    });
    if (routed.ok) {
      const labels = unique(pairedCorrelations.flatMap(({ pair }) => pair));
      const nodeId = new Map(labels.map((label, index) => [label, `variable-${index + 1}`] as const));
      const labelFor = (result: StandardizedNumericalResult) => genericResultLabel(result, factById);
      const provenance = provenanceFromResults(
        pairedResults,
        labelFor,
        "保留原研究的變項配對與相關係數 r；不換算百分比，也不推論因果或量尺好壞方向。",
      );
      candidates.push({
        specType: "figure",
        number: 0,
        figureType: "conceptual_mechanism",
        title: "變項間相關結構：保留 r 與原始配對",
        units: "相關係數 r",
        legend: [
          { key: "節點", label: "研究測量的變項" },
          { key: "連線", label: "原研究報告的相關係數 r" },
        ],
        data: {
          kind: "directed_graph",
          nodes: labels.map((label) => ({ id: nodeId.get(label)!, label })),
          edges: pairedCorrelations.map(({ result, pair }) => ({
            from: nodeId.get(pair[0])!,
            to: nodeId.get(pair[1])!,
            label: `r = ${result.value}`,
          })),
        },
        sourceNote: "節點、配對與 r 均由 canonical standardized facts 確定性生成。",
        note: "相關係數不換算成百分比；未核定量尺方向時，不把正負號翻譯成結果較好或較差。",
        altText: pairedCorrelations.map(({ result, pair }) => `${pair[0]}與${pair[1]}：r = ${result.value}`).join("；") + "。圖示不代表因果。",
        visualId: "evidence-visual-generic-correlation-structure",
        visualType: "correlation_structure",
        renderMode: "deterministic",
        claimMode: "evidence_synthesis",
        preferredSectionId: "literature_review",
        provenance,
        comparabilityWarning: "各相關係數描述特定變項配對，不構成可排名的效果量。",
        semanticRoute: routed.route,
        semanticData: {
          kind: "correlation_structure",
          statisticType: "correlation_coefficient",
          nodes: labels.map((label) => ({ id: nodeId.get(label)!, label })),
          links: pairedCorrelations.map(({ result, pair }) => ({
            datumKey: `generic-statistic-${result.resultId}`,
            from: nodeId.get(pair[0])!,
            to: nodeId.get(pair[1])!,
            value: result.value!,
            unit: "r",
            sourceId: result.sourceId,
            evidenceId: result.evidenceId,
            factId: result.factId,
            numericalResultId: result.resultId,
          })),
          percentConversionAllowed: false,
          causalClaim: false,
        },
      });
    }
  }
  return candidates;
}

/**
 * Builds up to seven evidence-led visuals. A visual is omitted when its input
 * evidence is insufficient; the builder never pads the report with generic art.
 */
export function buildEvidenceVisuals(input: BuildEvidenceVisualsInput): EvidenceVisualSpec[] {
  const topic = compact(input.topic);
  const supportsUrbanHeatGrammar =
    TAIWAN_PATTERN.test(topic) &&
    CAMPUS_PATTERN.test(topic) &&
    GREEN_PATTERN.test(topic) &&
    HEAT_PATTERN.test(topic);
  const supportsShortVideoSleepGrammar =
    SHORT_VIDEO_PATTERN.test(topic) &&
    SLEEP_PATTERN.test(topic) &&
    SCHOOL_AGE_PATTERN.test(topic);
  const candidates = supportsShortVideoSleepGrammar
    ? buildShortVideoSleepVisuals(input)
    : supportsUrbanHeatGrammar ? (() => {
        const profiles = groupEvidenceBySource(input.evidenceCards);
        return [
          buildCoverageVisual(profiles),
          buildMetricTranslationVisual(profiles),
          buildOutcomeHierarchyVisual(profiles),
          buildNumericVisual(profiles, input.sources ?? [], input.standardizedFacts ?? []),
          buildMechanismVisual(profiles),
          buildApplicabilityVisual(profiles),
          buildStudyDesignVisual(profiles, topic),
        ].filter((visual): visual is EvidenceVisualSpec => visual !== null);
      })()
      : buildGenericStatisticalVisuals(input);

  const requestedMax = Number.isFinite(input.maxVisuals) ? Math.floor(input.maxVisuals ?? 7) : 7;
  const maxVisuals = Math.min(7, Math.max(0, requestedMax));
  const startNumber = Number.isFinite(input.startNumber) ? Math.max(1, Math.floor(input.startNumber ?? 1)) : 1;
  return candidates.slice(0, maxVisuals).map((visual, index) => ({
    ...visual,
    number: startNumber + index,
  }));
}

export function evidenceVisualsHaveCompleteProvenance(visuals: EvidenceVisualSpec[]): boolean {
  return visuals.every((visual) => {
    if (!visual.altText.trim() || !visual.sourceNote.trim()) return false;
    if (visual.provenance.origin !== "structured_evidence") return false;
    if (visual.provenance.evidenceIds.length === 0 || visual.provenance.sourceIds.length === 0) return false;
    return visual.provenance.dataPoints.every((point) => {
      if (!point.datumKey || !point.derivation) return false;
      // A zero-count coverage cell is provenance about an observed absence; it
      // correctly has no matching source or evidence identifiers of its own.
      if (point.sourceField === "derived_coverage_count" && point.displayValue === "0") return true;
      if (point.evidenceIds.length === 0 || point.sourceIds.length === 0) return false;
      if (
        point.sourceField === "standardized_numerical_result" ||
        point.sourceField === "exact_result_semantic_extract"
      ) {
        if (!point.exactText || !point.displayValue) return false;
        if (point.sourceField === "standardized_numerical_result") {
          return point.factIds.length > 0 && point.numericalResultIds.length > 0;
        }
      }
      return true;
    });
  });
}

export function auditEvidenceVisualSemantics(visuals: EvidenceVisualSpec[]): string[] {
  const issues: string[] = [];
  for (const visual of visuals) {
    const semanticData = visual.semanticData;
    if (!semanticData) continue;
    if (!semanticVisualTypeMatchesStatistic(visual.visualType, semanticData)) {
      issues.push(`visual_type_matches_statistic:${visual.visualId}`);
    }
    auditVisualSemanticData(semanticData).forEach((issue) => {
      issues.push(`${issue}:${visual.visualId}`);
    });

    const semanticKeys = semanticDatumKeys(semanticData).sort();
    const provenanceKeys = visual.provenance.dataPoints.map((point) => point.datumKey).sort();
    if (
      semanticKeys.length !== provenanceKeys.length ||
      semanticKeys.some((key, index) => key !== provenanceKeys[index])
    ) {
      issues.push(`all_chart_values_traceable:${visual.visualId}`);
    }

    if (
      semanticData.kind === "proportion_facets" ||
      semanticData.kind === "forest_plot" ||
      semanticData.kind === "correlation_structure"
    ) {
      const numericItems = semanticData.kind === "proportion_facets"
        ? semanticData.panels
        : semanticData.kind === "forest_plot"
          ? semanticData.rows
          : semanticData.links;
      for (const item of numericItems) {
        const point = visual.provenance.dataPoints.find((candidate) => candidate.datumKey === item.datumKey);
        if (
          !point ||
          point.sourceIds.length !== 1 || point.sourceIds[0] !== item.sourceId ||
          point.evidenceIds.length !== 1 || point.evidenceIds[0] !== item.evidenceId ||
          point.factIds.length !== 1 || point.factIds[0] !== item.factId ||
          point.numericalResultIds.length !== 1 || point.numericalResultIds[0] !== item.numericalResultId
        ) {
          issues.push(`numeric_semantic_identity_mismatch:${visual.visualId}:${item.datumKey}`);
        }
      }
      if (!visual.semanticRoute) issues.push(`numeric_visual_missing_semantic_route:${visual.visualId}`);
    }

    if (semanticData.kind === "mediation_path") {
      if (semanticData.edges.some((edge) => /\d|%|\b(?:OR|CI)\b|r\s*=/iu.test(edge.label))) {
        issues.push(`mediation_path_contains_coefficient:${visual.visualId}`);
      }
    }
  }
  return unique(issues).sort();
}

export function mainBodyEvidenceVisualIssues(
  topic: string,
  visuals: EvidenceVisualSpec[],
): string[] {
  if (!(SHORT_VIDEO_PATTERN.test(topic) && SLEEP_PATTERN.test(topic) && SCHOOL_AGE_PATTERN.test(topic))) {
    return [];
  }
  const required: EvidenceVisualPurpose[] = [
    "sleep_evidence_coverage",
    "prevalence_facets",
    "odds_ratio_forest",
    "correlation_structure",
    "statistical_mediation_path",
    "population_applicability_boundary",
  ];
  return required.flatMap((visualType) => {
    const visual = visuals.find((candidate) => candidate.visualType === visualType);
    if (!visual) return [`main_body_has_result_visuals:missing:${visualType}`];
    return /appendix/iu.test(visual.preferredSectionId)
      ? [`main_body_has_result_visuals:appendix_only:${visualType}`]
      : [];
  });
}

export function generatedConceptImageRecordIsTruthful(record: GeneratedConceptImageRecord): boolean {
  if (!record.prompt.trim() || !record.altText.trim() || !record.provider.trim()) return false;
  if (record.imageRole !== "conceptual_explanation") return false;
  if (/\d|%|\b(?:OR|RR|HR|CI)\b|r\s*=/iu.test(record.prompt)) return false;
  if (record.status === "generated") return Boolean(record.assetUri);
  if (record.status === "fallback") return Boolean(record.fallbackVisualId) && !record.assetUri;
  return !record.assetUri;
}
