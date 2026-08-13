import type {
  AudienceProfile,
  ClaimContradictionAnalysis,
  CrossSourceClaimGraph,
  EvidenceAccessTier,
  HeterogeneityAnalysis,
  HeterogeneityComparison,
  KnowledgeConceptNode,
  KnowledgeRelationEdge,
  NormalizedFact,
  ReportArchetypeDecision,
  ReportArchetypeId,
  ResearchKnowledgeModel,
  StatisticalInterpretation,
  SynthesisCluster,
} from "@workspace/api-zod";

function clean(value: string | null | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/gu, " ").trim() ?? "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function finite(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function routeAudienceProfile(audience: string | null | undefined): AudienceProfile {
  const value = clean(audience).toLocaleLowerCase("zh-TW");
  if (/決策|簡報|主管|行政|decision|executive|brief/iu.test(value)) {
    return {
      profileId: "decision_brief",
      terminologyExplanation: "minimal",
      sentenceLength: "short",
      statisticalDetail: "plain_language",
      methodDepth: "brief",
      visualComplexity: "guided",
      citationDensity: "low",
      limitationDepth: "explained",
      includePracticalRecommendations: true,
      showEvidenceGrades: true,
      summaryTargetWords: 220,
      bodyTargetWords: 1_400,
    };
  }
  if (/專業|研究所|博士|學者|professional|expert|graduate/iu.test(value)) {
    return {
      profileId: "professional_evidence_synthesis",
      terminologyExplanation: "minimal",
      sentenceLength: "technical",
      statisticalDetail: "complete",
      methodDepth: "full",
      visualComplexity: "expert",
      citationDensity: "complete",
      limitationDepth: "full",
      includePracticalRecommendations: false,
      showEvidenceGrades: true,
      summaryTargetWords: 420,
      bodyTargetWords: 6_000,
    };
  }
  if (/大學|專題|college|university|undergraduate/iu.test(value)) {
    return {
      profileId: "university_project",
      terminologyExplanation: "selective",
      sentenceLength: "medium",
      statisticalDetail: "operational",
      methodDepth: "operationalization",
      visualComplexity: "analytical",
      citationDensity: "high",
      limitationDepth: "detailed",
      includePracticalRecommendations: false,
      showEvidenceGrades: true,
      summaryTargetWords: 320,
      bodyTargetWords: 4_000,
    };
  }
  if (/一般|大眾|general|public/iu.test(value)) {
    return {
      profileId: "general_reader",
      terminologyExplanation: "extensive",
      sentenceLength: "short",
      statisticalDetail: "plain_language",
      methodDepth: "brief",
      visualComplexity: "simple",
      citationDensity: "low",
      limitationDepth: "key_only",
      includePracticalRecommendations: true,
      showEvidenceGrades: false,
      summaryTargetWords: 220,
      bodyTargetWords: 1_800,
    };
  }
  return {
    profileId: "high_school_report",
    terminologyExplanation: "guided",
    sentenceLength: "medium",
    statisticalDetail: "foundational",
    methodDepth: "foundational",
    visualComplexity: "guided",
    citationDensity: "moderate",
    limitationDepth: "explained",
    includePracticalRecommendations: true,
    showEvidenceGrades: false,
    summaryTargetWords: 280,
    bodyTargetWords: 2_800,
  };
}

interface ArchetypeDefinition {
  archetypeId: Exclude<ReportArchetypeId, "limited_evidence_report">;
  questionType: ReportArchetypeDecision["questionType"];
  sectionBlueprint: string[];
  evidenceRequirements: string[];
  visualRequirements: string[];
  comparisonMethod: string;
  conclusionForm: string;
  minimumSources: number;
}

const ARCHETYPES: Record<Exclude<ReportArchetypeId, "limited_evidence_report">, ArchetypeDefinition> = {
  literature_review: {
    archetypeId: "literature_review",
    questionType: "research_inventory",
    sectionBlueprint: ["研究範圍", "概念主題", "跨研究綜合", "限制與缺口", "結論"],
    evidenceRequirements: ["至少兩個可引用學術來源", "每個主要主張可追溯至原子事實"],
    visualRequirements: ["證據覆蓋圖", "必要時的方法比較矩陣"],
    comparisonMethod: "依概念與研究問題分群，不依論文順序排列。",
    conclusionForm: "回答目前共同支持的方向與不能外推的邊界。",
    minimumSources: 2,
  },
  comparative_analysis: {
    archetypeId: "comparative_analysis",
    questionType: "comparison",
    sectionBlueprint: ["比較準則", "候選方案", "逐準則比較", "權衡與敏感度", "選擇建議"],
    evidenceRequirements: ["至少兩個比較對象", "相容的結果定義或明確方向性比較"],
    visualRequirements: ["比較矩陣", "可比數值圖"],
    comparisonMethod: "先檢查可比較性，再按共同準則比較；不可比資料不得排名。",
    conclusionForm: "以適用條件與權衡回答哪個較合適，不宣稱普遍最佳。",
    minimumSources: 2,
  },
  mechanism_analysis: {
    archetypeId: "mechanism_analysis",
    questionType: "mechanism",
    sectionBlueprint: ["現象界定", "候選路徑", "直接與間接證據", "替代解釋", "可驗證預測"],
    evidenceRequirements: ["至少一個暴露與結果關係", "中介、時間順序或機制證據的層級標記"],
    visualRequirements: ["路徑圖或機制圖"],
    comparisonMethod: "區分直接測量、統計關聯、作者解釋與 ResearchForge 推論。",
    conclusionForm: "提出最合理機制與仍未排除的替代路徑。",
    minimumSources: 2,
  },
  experimental_design: {
    archetypeId: "experimental_design",
    questionType: "design",
    sectionBlueprint: ["研究假設", "變項操作化", "樣本與分派", "實驗流程", "分析與驗證", "風險與限制"],
    evidenceRequirements: ["可操作的暴露與結果變項", "可檢驗假設與驗證規則"],
    visualRequirements: ["研究流程圖", "變項與假設路徑圖"],
    comparisonMethod: "比較設計選項對內部效度、外部效度與可行性的影響。",
    conclusionForm: "輸出可執行設計、主要威脅及判定標準。",
    minimumSources: 0,
  },
  technical_assessment: {
    archetypeId: "technical_assessment",
    questionType: "adoption",
    sectionBlueprint: ["需求與場景", "技術準則", "效能與限制", "導入風險", "採用建議"],
    evidenceRequirements: ["明確使用場景", "至少兩項可核對技術或營運準則"],
    visualRequirements: ["技術比較矩陣", "導入流程圖"],
    comparisonMethod: "以需求符合度、效能、可靠度、成本與風險逐準則評估。",
    conclusionForm: "給出有條件採用、試辦或不採用判斷。",
    minimumSources: 2,
  },
  policy_analysis: {
    archetypeId: "policy_analysis",
    questionType: "adoption",
    sectionBlueprint: ["政策問題", "利害關係人", "政策選項", "效益與風險", "執行與監測"],
    evidenceRequirements: ["政策目標與受影響族群", "效果、可行性與公平性證據"],
    visualRequirements: ["政策選項矩陣", "影響路徑圖"],
    comparisonMethod: "按效果、成本、公平、可行性與不確定性比較政策選項。",
    conclusionForm: "提出可監測、可撤回且標示不確定性的政策建議。",
    minimumSources: 3,
  },
  market_industry_research: {
    archetypeId: "market_industry_research",
    questionType: "adoption",
    sectionBlueprint: ["市場定義", "需求與供給", "競爭結構", "驅動與風險", "策略含意"],
    evidenceRequirements: ["市場邊界", "可核對的規模、趨勢或競爭證據"],
    visualRequirements: ["市場結構圖", "趨勢圖或比較矩陣"],
    comparisonMethod: "分開處理不同口徑、期間與地區的市場估計。",
    conclusionForm: "說明機會條件、風險與下一個可驗證決策。",
    minimumSources: 3,
  },
  controversy_analysis: {
    archetypeId: "controversy_analysis",
    questionType: "controversy",
    sectionBlueprint: ["爭點界定", "主要立場", "支持與反例", "差異來源", "可判定與未決部分"],
    evidenceRequirements: ["至少兩個相反或不顯著結果", "各立場的直接證據與適用範圍"],
    visualRequirements: ["主張—反證圖", "方法差異矩陣"],
    comparisonMethod: "對稱呈現支持、反對與無顯著結果，再檢查差異是否來自方法或族群。",
    conclusionForm: "區分可暫定判斷、合理歧見與最能區分立場的新研究。",
    minimumSources: 2,
  },
  systematic_evidence_map: {
    archetypeId: "systematic_evidence_map",
    questionType: "evidence_gap",
    sectionBlueprint: ["範圍與分類", "證據分布", "方法與族群覆蓋", "密集區與缺口", "研究優先序"],
    evidenceRequirements: ["可重現的分類軸", "來源身分與納入狀態"],
    visualRequirements: ["證據覆蓋圖", "缺口圖"],
    comparisonMethod: "按族群、暴露、結果、設計與場域映射，不把來源數量當效果強度。",
    conclusionForm: "指出證據密集處、空白處與下一步研究優先序。",
    minimumSources: 3,
  },
};

export function routeReportArchetype(input: {
  question: string;
  reportType?: string | null;
  facts: NormalizedFact[];
  clusters?: SynthesisCluster[];
  forceLimited?: boolean;
}): ReportArchetypeDecision {
  const text = clean(`${input.reportType ?? ""} ${input.question}`).toLocaleLowerCase("zh-TW");
  const desired: ArchetypeDefinition =
    /實驗|研究設計|如何設計|變項|假設|experiment|study design|protocol/iu.test(text)
      ? ARCHETYPES.experimental_design
      : /政策|法規|治理|policy|regulation/iu.test(text)
        ? ARCHETYPES.policy_analysis
        : /市場|產業|商業|market|industry/iu.test(text)
          ? ARCHETYPES.market_industry_research
          : /爭議|衝突|矛盾|正反|不同觀點|controvers|conflict|contradict/iu.test(text)
            ? ARCHETYPES.controversy_analysis
            : /證據地圖|研究缺口|缺在哪|evidence map|research gap/iu.test(text)
              ? ARCHETYPES.systematic_evidence_map
              : /機制|為什麼|如何作用|中介|調節|mechanism|mediate|moderate/iu.test(text)
                ? ARCHETYPES.mechanism_analysis
                : /技術|採用|導入|可行性|technology|technical|adopt/iu.test(text)
                  ? ARCHETYPES.technical_assessment
                  : /比較|何者|哪個|優於|versus|\bvs\.?\b|compare/iu.test(text)
                    ? ARCHETYPES.comparative_analysis
                    : /效果多大|影響程度|effect size|how (?:large|strong)/iu.test(text)
                      ? {
                          ...ARCHETYPES.literature_review,
                          questionType: "effect_size",
                          sectionBlueprint: ["結果定義", "統計量與可比性", "效果範圍", "異質性與不確定性", "結論"],
                          visualRequirements: ["可比效果量的 forest plot", "不可比指標的證據矩陣"],
                          comparisonMethod: "只對相同構念、統計量與量測定義的結果比較大小。",
                        }
                      : ARCHETYPES.literature_review;
  const sourceCount = new Set(input.facts.map((fact) => fact.sourceId)).size;
  const hasOperationalVariables = /實驗|設計|變項|假設|流程|variable|hypothesis|experiment|protocol/iu.test(text);
  const minimumConditionsMet = desired.minimumSources === 0
    ? hasOperationalVariables
    : sourceCount >= desired.minimumSources;
  const shouldLimit = input.forceLimited === true || !minimumConditionsMet;
  if (shouldLimit) {
    return {
      archetypeId: "limited_evidence_report",
      questionType: desired.questionType,
      rationale: `原擬採 ${desired.archetypeId}，但最低證據條件未滿足；改以有限證據報告呈現可核對內容與缺口。`,
      sectionBlueprint: ["研究問題", "目前可核對證據", "不可比較或未知處", "限制", "下一步"],
      evidenceRequirements: ["至少一筆可追溯事實；若沒有，僅能輸出研究缺口"],
      visualRequirements: ["證據覆蓋或缺口圖；沒有實質資料時不強制作圖"],
      comparisonMethod: "只比較方向與適用範圍，不建立效果排名或虛假合併。",
      conclusionForm: "直接說明目前能回答與不能回答的部分。",
      minimumConditionsMet: false,
      downgradedFrom: desired.archetypeId,
    };
  }
  return {
    archetypeId: desired.archetypeId,
    questionType: desired.questionType,
    rationale: `研究問題符合 ${desired.questionType}，且最低證據條件已滿足。`,
    sectionBlueprint: desired.sectionBlueprint,
    evidenceRequirements: desired.evidenceRequirements,
    visualRequirements: desired.visualRequirements,
    comparisonMethod: desired.comparisonMethod,
    conclusionForm: desired.conclusionForm,
    minimumConditionsMet: true,
    downgradedFrom: null,
  };
}

export function evidenceAccessTierForFact(input: {
  accessLevel?: string | null;
  derivation?: string | null;
  sectionType?: string | null;
  sourceSpan?: string | null;
  fullTextStructured?: boolean;
  abstractComplete?: boolean;
}): EvidenceAccessTier {
  const access = clean(input.accessLevel).toLocaleLowerCase();
  const derivation = clean(input.derivation).toLocaleLowerCase();
  if (/metadata|bibliographic/iu.test(`${access} ${derivation}`)) return "bibliographic_only";
  if (/full[_ -]?text/iu.test(access) || /fulltext/iu.test(derivation)) {
    if (input.fullTextStructured || (clean(input.sectionType) && clean(input.sectionType) !== "unknown")) {
      return "structured_full_text";
    }
    return clean(input.sourceSpan) ? "verifiable_full_text_excerpt" : "complete_full_text";
  }
  if (/abstract/iu.test(`${access} ${derivation}`)) {
    return input.abstractComplete === false ? "partial_abstract" : "complete_abstract";
  }
  return clean(input.sourceSpan) ? "partial_abstract" : "bibliographic_only";
}

type StatisticFamily =
  | "prevalence"
  | "mean"
  | "standard_deviation"
  | "median"
  | "interquartile_range"
  | "correlation"
  | "odds_ratio"
  | "risk_ratio"
  | "hazard_ratio"
  | "confidence_interval"
  | "p_value"
  | "regression_coefficient"
  | "standardized_coefficient"
  | "mean_difference"
  | "standardized_effect"
  | "mediation"
  | "interaction"
  | "model_fit"
  | "non_significant"
  | "unknown";

function statisticFamily(value: string | null | undefined, raw = ""): StatisticFamily {
  const text = clean(`${value ?? ""} ${raw}`).toLocaleLowerCase();
  if (/non[- ]?significant|not significant|無顯著|未達顯著/iu.test(text)) return "non_significant";
  if (/odds[_ -]?ratio|\bor\b/iu.test(text)) return "odds_ratio";
  if (/risk[_ -]?ratio|relative risk|\brr\b/iu.test(text)) return "risk_ratio";
  if (/hazard[_ -]?ratio|\bhr\b/iu.test(text)) return "hazard_ratio";
  if (/correlation|pearson|spearman|相關|\br\b/iu.test(text)) return "correlation";
  if (/standardized.*(?:coefficient|beta)|標準化.*(?:係數|迴歸)|\bβ\b|\bbeta\b/iu.test(text)) return "standardized_coefficient";
  if (/regression|coefficient|迴歸係數|\bb\b/iu.test(text)) return "regression_coefficient";
  if (/mean difference|平均差/iu.test(text)) return "mean_difference";
  if (/cohen|hedges|standardized effect|effect size|標準化效果/iu.test(text)) return "standardized_effect";
  if (/mediat|indirect effect|中介|間接效果|effect_share/iu.test(text)) return "mediation";
  if (/interaction|moderation|交互作用|調節/iu.test(text)) return "interaction";
  if (/r.?squared|r²|model fit|解釋力/iu.test(text)) return "model_fit";
  if (/prevalence|proportion|percentage|percent|盛行率|比例|百分比|detection_rate/iu.test(text)) return "prevalence";
  if (/standard deviation|\bsd\b|標準差/iu.test(text)) return "standard_deviation";
  if (/interquartile|\biqr\b|四分位/iu.test(text)) return "interquartile_range";
  if (/median|中位數/iu.test(text)) return "median";
  if (/mean|average|平均數|平均值/iu.test(text)) return "mean";
  if (/confidence interval|\bci\b|信賴區間/iu.test(text)) return "confidence_interval";
  if (/p[_ -]?value|\bp\s*[<=>]|p 值/iu.test(text)) return "p_value";
  return "unknown";
}

function studyAllowsCausalInterpretation(fact: NormalizedFact): boolean {
  const design = clean(fact.studyDesign ?? fact.method).toLocaleLowerCase();
  return /randomi[sz]ed|random allocation|隨機(?:分派|對照)|controlled trial|準實驗|quasi[- ]?experiment|natural experiment/iu.test(design) &&
    !/cross[- ]?sectional|橫斷|observational|觀察/iu.test(design);
}

function nullValueFor(family: StatisticFamily): number | null {
  if (["odds_ratio", "risk_ratio", "hazard_ratio"].includes(family)) return 1;
  if ([
    "correlation",
    "regression_coefficient",
    "standardized_coefficient",
    "mean_difference",
    "standardized_effect",
    "mediation",
    "interaction",
  ].includes(family)) return 0;
  return null;
}

function recommendedVisualFor(family: StatisticFamily): StatisticalInterpretation["recommendedVisual"] {
  if (family === "prevalence") return "proportion_bar";
  if (["odds_ratio", "risk_ratio", "hazard_ratio"].includes(family)) return "forest_plot";
  if (family === "correlation") return "correlation_matrix";
  if (["mediation", "interaction"].includes(family)) return "path_diagram";
  if (["mean", "median", "mean_difference", "standardized_effect"].includes(family)) return "distribution_plot";
  if (["regression_coefficient", "standardized_coefficient", "model_fit"].includes(family)) return "comparison_matrix";
  if (["non_significant", "p_value", "confidence_interval"].includes(family)) return "key_finding_box";
  return "none";
}

function numericDisplay(value: number | null, unit: string | null | undefined): string {
  if (value == null) return "未提供點估計";
  const suffix = clean(unit);
  return `${Number.isInteger(value) ? value : Number(value.toPrecision(4))}${suffix ? ` ${suffix}` : ""}`;
}

function pValueFromText(value: string): number | null {
  const match = value.match(/\bp\s*(?:=|<|≤)\s*(0?(?:\.\d+)|1(?:\.0+)?)/iu);
  return match?.[1] ? finite(Number(match[1])) : null;
}

function technicalExplanation(input: {
  family: StatisticFamily;
  value: number | null;
  lower: number | null;
  upper: number | null;
  unit: string | null;
  pValue: number | null;
}): string {
  const value = numericDisplay(input.value, input.unit);
  const ci = input.lower != null && input.upper != null
    ? `，信賴區間為 ${input.lower} 至 ${input.upper}`
    : "，未提供完整信賴區間";
  switch (input.family) {
    case "odds_ratio": return `勝算比為 ${value}${ci}；它比較兩組勝算，不等同風險差或風險增加百分比。`;
    case "risk_ratio": return `風險比為 ${value}${ci}；1 為無差異的虛無值。`;
    case "hazard_ratio": return `危險比為 ${value}${ci}；它描述追蹤期間的相對瞬時發生率。`;
    case "correlation": return `相關係數為 ${value}${ci}；符號表示方向，絕對值表示線性或排序關聯強度。`;
    case "prevalence": return `此比例或盛行率為 ${value}，描述該研究樣本中符合定義者的占比。`;
    case "mean": return `平均數為 ${value}；必須連同量表、單位與分布資訊解讀。`;
    case "standard_deviation": return `標準差為 ${value}，描述觀測值相對平均數的離散程度。`;
    case "median": return `中位數為 ${value}，代表排序後位於中央的觀測值。`;
    case "interquartile_range": return `四分位距為 ${value}，描述中間 50% 觀測值的範圍。`;
    case "regression_coefficient": return `迴歸係數為 ${value}${ci}；意義取決於變項單位、模型形式與調整集合。`;
    case "standardized_coefficient": return `標準化係數為 ${value}${ci}，表示以標準差尺度衡量的條件關聯。`;
    case "mean_difference": return `平均差為 ${value}${ci}；正負方向取決於原研究設定的組別順序。`;
    case "standardized_effect": return `標準化效果量為 ${value}${ci}，可在量測構念相同時協助比較不同尺度。`;
    case "mediation": return `中介或間接效果為 ${value}${ci}；模型分解不等同已證明的生理或因果機制。`;
    case "interaction": return `交互作用估計為 ${value}${ci}，表示關係可能隨另一變項水準而改變。`;
    case "model_fit": return `模型解釋力指標為 ${value}，描述模型在該樣本解釋的變異，不代表預測或因果有效性。`;
    case "p_value": return `p 值${input.pValue == null ? "未能完整解析" : `為 ${input.pValue}`}；它衡量資料與虛無模型的相容程度，不是效果大小。`;
    case "non_significant": return "結果未達預設顯著門檻；這不等同證明沒有關係。";
    case "confidence_interval": return `信賴區間為 ${input.lower ?? "未提供"} 至 ${input.upper ?? "未提供"}，反映估計的不確定性。`;
    default: return `來源提供的統計結果為 ${value}；因統計型態或量測定義不足，僅保留原研究語境。`;
  }
}

function readerExplanationFor(family: StatisticFamily, value: number | null): string {
  const display = value == null ? "這個數字" : String(Number(value.toPrecision(4)));
  if (family === "odds_ratio") return `${display} 表示兩組事件勝算的相對差異，不能直接說成風險增加了多少百分比。`;
  if (family === "risk_ratio") return `${display} 表示兩組觀察到的相對風險，但仍需看信賴區間與研究設計。`;
  if (family === "hazard_ratio") return `${display} 比較追蹤期間事件發生速度，而不是最後有多少人發生事件。`;
  if (family === "correlation") return `${display} 顯示兩個量測值同向或反向變動的程度，不能證明其中一個造成另一個。`;
  if (family === "prevalence") return `${display} 描述這個研究樣本中符合條件的人所占比例，不必然代表其他地區或族群。`;
  if (["mean", "median"].includes(family)) return `${display} 是樣本的集中位置；不同量表或計分方向不能直接比高低。`;
  if (family === "non_significant") return "研究沒有取得足夠精確的差異證據，但也不能據此認定兩者完全沒有關係。";
  if (family === "mediation") return `${display} 是模型估計的間接路徑，不代表作用機制已被實驗證明。`;
  return `${display} 只在該研究的樣本、量測與模型條件下成立，解讀時必須保留不確定性。`;
}

function interpretationWarnings(input: {
  fact: NormalizedFact;
  family: StatisticFamily;
  crossesNull: boolean;
  pValue: number | null;
}): string[] {
  const warnings = [
    !studyAllowsCausalInterpretation(input.fact) ? "研究設計不足以支持因果解讀。" : null,
    input.family === "odds_ratio" ? "勝算比不得改寫為風險增加百分比。" : null,
    input.family === "correlation" ? "相關不等於因果。" : null,
    input.family === "non_significant" || (input.pValue != null && input.pValue > 0.05)
      ? "未達統計顯著不等於證明沒有關係。"
      : null,
    input.crossesNull ? "信賴區間跨越虛無值，不能宣稱效果穩定。" : null,
    ["mean", "median", "standard_deviation", "interquartile_range"].includes(input.family)
      ? "不同量表或計分方向的集中量與離散量不得直接比較。"
      : null,
    input.family === "mediation" ? "中介模型不得自動寫成已證明的生理機制。" : null,
    /cross[- ]?sectional|橫斷/iu.test(clean(input.fact.studyDesign ?? input.fact.method))
      ? "橫斷研究不能確認時間先後。"
      : null,
    !clean(input.fact.adjustmentStatus) && [
      "regression_coefficient",
      "standardized_coefficient",
      "odds_ratio",
      "risk_ratio",
      "hazard_ratio",
    ].includes(input.family)
      ? "未確認混雜因素調整狀態，不得使用「獨立影響」。"
      : null,
  ];
  return unique(warnings);
}

export function buildStatisticalInterpretations(input: {
  facts: NormalizedFact[];
  comparisons?: HeterogeneityComparison[];
}): StatisticalInterpretation[] {
  const comparisons = input.comparisons ?? [];
  return input.facts.flatMap((fact) => {
    const results = fact.numericalResults.length > 0
      ? fact.numericalResults
      : fact.statisticType
        ? [{
            rawText: fact.sourceSpan ?? fact.claimTextZhTw,
            measure: fact.outcomeMeasure,
            value: fact.value,
            unit: fact.unit,
            statisticType: fact.statisticType,
            comparisonBasis: null,
            lowerCI: fact.lowerCI,
            upperCI: fact.upperCI,
            pValue: fact.pValue,
            uncertainty: fact.uncertainty,
          }]
        : [];
    return results.map((result, index) => {
      const family = statisticFamily(result.statisticType, result.rawText);
      const lower = finite(result.lowerCI);
      const upper = finite(result.upperCI);
      const nullValue = nullValueFor(family);
      const crossesNull = nullValue != null && lower != null && upper != null && lower <= nullValue && upper >= nullValue;
      const pValue = finite(result.pValue) ?? finite(fact.pValue) ?? pValueFromText(`${result.rawText} ${result.uncertainty ?? ""}`);
      const related = comparisons.filter((comparison) =>
        comparison.leftFactId === fact.factId || comparison.rightFactId === fact.factId
      );
      const comparability: StatisticalInterpretation["crossStudyComparability"] =
        related.some((comparison) => comparison.status === "NOT_COMPARABLE")
          ? "NOT_COMPARABLE"
          : related.some((comparison) => comparison.status === "DIRECTION_ONLY")
            ? "DIRECTION_ONLY"
            : related.some((comparison) => comparison.status === "PARTIALLY_COMPARABLE")
              ? "PARTIALLY_COMPARABLE"
              : related.length > 0
                ? "COMPARABLE"
                : "NOT_COMPARABLE";
      const warnings = interpretationWarnings({ fact, family, crossesNull, pValue });
      const visual = recommendedVisualFor(family);
      return {
        interpretationId: `stat-${stableHash(`${fact.factId}|${index}|${result.rawText}`)}`,
        factId: fact.factId,
        sourceId: fact.sourceId,
        statisticType: family,
        technicalExplanation: technicalExplanation({
          family,
          value: finite(result.value),
          lower,
          upper,
          unit: result.unit,
          pValue,
        }),
        readerExplanation: readerExplanationFor(family, finite(result.value)),
        supportedConclusion: crossesNull
          ? "此估計方向仍具不確定性，只能描述點估計與區間。"
          : "可描述此研究樣本中的估計方向、大小與不確定性。",
        unsupportedConclusion: studyAllowsCausalInterpretation(fact)
          ? "不能外推到未研究族群、場域或不同量測定義。"
          : "不能宣稱因果、時間先後或未調整的獨立效果。",
        causalInterpretationAllowed: studyAllowsCausalInterpretation(fact),
        visualizable: visual !== "none" && finite(result.value) != null,
        recommendedVisual: visual,
        nullValue,
        precisionStatus: crossesNull
          ? "crosses_null"
          : lower != null && upper != null
            ? Math.abs(upper - lower) <= Math.max(1, Math.abs(finite(result.value) ?? 0))
              ? "precise"
              : "imprecise"
            : "unknown",
        crossStudyComparability: comparability,
        warnings,
      } satisfies StatisticalInterpretation;
    });
  });
}

function normalizedConcept(value: string | null | undefined, kind: "population" | "exposure" | "outcome"): string {
  const text = clean(value).toLocaleLowerCase("zh-TW");
  if (!text) return "";
  if (kind === "population") {
    if (/高中|high[- ]?school/iu.test(text)) return "高中生";
    if (/中學|secondary|middle[- ]?school/iu.test(text)) return "中學生";
    if (/青少年|adolesc/iu.test(text)) return "青少年";
  }
  if (kind === "exposure") {
    if (/短影音.*(?:成癮|問題性)|short[- ]?form.*(?:addiction|problematic)|tiktok addiction/iu.test(text)) return "短影音成癮";
    if (/tiktok|抖音/iu.test(text)) return "TikTok 使用";
    if (/短影音|short[- ]?form video/iu.test(text)) return "短影音使用";
    if (/社群媒體|social media|social networking/iu.test(text)) return "一般社群媒體使用";
    if (/綠視率|green view|\bgvi\b/iu.test(text)) return "綠視率";
    if (/樹冠|canopy/iu.test(text)) return "樹冠覆蓋";
    if (/\bndvi\b|normalized difference vegetation/iu.test(text)) return "NDVI 植被指數";
    if (/綠覆率|green coverage/iu.test(text)) return "綠覆率";
  }
  if (kind === "outcome") {
    if (/睡眠不佳.*(?:比例|盛行)|poor sleep.*(?:prevalence|proportion)/iu.test(text)) return "睡眠不佳比例";
    if (/睡眠品質.*(?:分數|量表)|sleep quality.*(?:score|scale)|psqi/iu.test(text)) return "睡眠品質量表分數";
    if (/睡眠品質|sleep quality/iu.test(text)) return "睡眠品質";
    if (/地表溫度|land surface temperature|\blst\b/iu.test(text)) return "地表溫度";
    if (/環境氣溫|air temperature|ambient temperature/iu.test(text)) return "環境氣溫";
    if (/熱舒適|thermal comfort/iu.test(text)) return "熱舒適";
    if (/都市熱島|urban heat island|\buhi\b/iu.test(text)) return "都市熱島強度";
  }
  return clean(value);
}

function compatibleStatisticFamilies(left: StatisticFamily, right: StatisticFamily): boolean {
  // Compatibility here means numeric pooling is defensible, not merely that
  // two estimates point in a similar direction. OR, RR and HR (and raw versus
  // standardized coefficients) therefore remain distinct families.
  return left === right && left !== "unknown";
}

function factDimension(fact: NormalizedFact, key: string): string {
  switch (key) {
    case "population": return normalizedConcept(fact.population, "population");
    case "age_group": return clean(fact.ageGroup);
    case "geography": return clean(fact.geography ?? fact.location);
    case "setting": return clean(fact.studySetting ?? fact.setting);
    case "exposure_concept": return normalizedConcept(fact.exposureConcept ?? fact.exposure, "exposure");
    case "exposure_measure": return clean(fact.exposureMeasure);
    case "outcome_concept": return normalizedConcept(fact.outcomeConcept ?? fact.outcome, "outcome");
    case "outcome_measure": return clean(fact.outcomeMeasure);
    case "study_design": return clean(fact.studyDesign ?? fact.method);
    case "adjustment": return clean(fact.adjustmentStatus);
    case "unit": return clean(fact.unit);
    case "time_scale": {
      const text = clean(`${fact.exposureMeasure ?? ""} ${fact.outcomeMeasure ?? ""} ${fact.claimTextZhTw}`);
      return clean(text.match(/(?:每)?(?:小時|日|天|週|月|年)|(?:per\s+)?(?:hour|day|week|month|year)s?/iu)?.[0]);
    }
    default: return "";
  }
}

export function classifyFactComparability(left: NormalizedFact, right: NormalizedFact): HeterogeneityComparison {
  const dimensions = [
    "population",
    "age_group",
    "geography",
    "setting",
    "exposure_concept",
    "exposure_measure",
    "outcome_concept",
    "outcome_measure",
    "study_design",
    "adjustment",
    "unit",
    "time_scale",
  ];
  const comparableDimensions: string[] = [];
  const differingDimensions: string[] = [];
  for (const dimension of dimensions) {
    const leftValue = factDimension(left, dimension);
    const rightValue = factDimension(right, dimension);
    if (!leftValue || !rightValue) continue;
    if (leftValue.toLocaleLowerCase() === rightValue.toLocaleLowerCase()) comparableDimensions.push(dimension);
    else differingDimensions.push(dimension);
  }
  const leftExposure = factDimension(left, "exposure_concept");
  const rightExposure = factDimension(right, "exposure_concept");
  const leftOutcome = factDimension(left, "outcome_concept");
  const rightOutcome = factDimension(right, "outcome_concept");
  const conceptCompatible = Boolean(leftExposure && rightExposure && leftOutcome && rightOutcome) &&
    leftExposure === rightExposure && leftOutcome === rightOutcome;
  const leftFamily = statisticFamily(left.statisticType, left.numericalResults[0]?.rawText ?? "");
  const rightFamily = statisticFamily(right.statisticType, right.numericalResults[0]?.rawText ?? "");
  const statisticCompatible = compatibleStatisticFamilies(leftFamily, rightFamily);
  const sameMeasure = !differingDimensions.includes("exposure_measure") &&
    !differingDimensions.includes("outcome_measure") &&
    !differingDimensions.includes("unit");
  let status: HeterogeneityComparison["status"];
  if (!conceptCompatible) status = "NOT_COMPARABLE";
  else if (!statisticCompatible || !sameMeasure) status = "DIRECTION_ONLY";
  else if (differingDimensions.length === 0) status = "COMPARABLE";
  else status = "PARTIALLY_COMPARABLE";
  return {
    comparisonId: `comparison-${stableHash(`${left.factId}|${right.factId}`)}`,
    leftFactId: left.factId,
    rightFactId: right.factId,
    status,
    comparableDimensions,
    differingDimensions,
    reasons: unique([
      !conceptCompatible ? "核心暴露或結果概念不相同。" : null,
      conceptCompatible && !statisticCompatible ? "統計量不可直接換算或合併。" : null,
      conceptCompatible && statisticCompatible && !sameMeasure ? "量測工具、操作定義或單位不同。" : null,
      differingDimensions.includes("population") || differingDimensions.includes("age_group") ? "研究對象或年齡層不同。" : null,
      differingDimensions.includes("geography") || differingDimensions.includes("setting") ? "地區、文化或研究場域不同。" : null,
      differingDimensions.includes("study_design") || differingDimensions.includes("adjustment") ? "研究設計或調整變項不同。" : null,
    ]),
    numericPoolingAllowed: status === "COMPARABLE",
    directionComparisonAllowed: status !== "NOT_COMPARABLE",
  };
}

export function buildHeterogeneityAnalysis(facts: NormalizedFact[]): HeterogeneityAnalysis {
  const eligible = facts.filter((fact) => fact.writerEligible && fact.evidenceLevel !== "bibliographic");
  const comparisons: HeterogeneityComparison[] = [];
  for (let leftIndex = 0; leftIndex < eligible.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < eligible.length; rightIndex += 1) {
      const left = eligible[leftIndex]!;
      const right = eligible[rightIndex]!;
      if (left.sourceId === right.sourceId) continue;
      comparisons.push(classifyFactComparability(left, right));
      if (comparisons.length >= 120) break;
    }
    if (comparisons.length >= 120) break;
  }
  const differenceCounts = new Map<string, number>();
  for (const comparison of comparisons) {
    for (const dimension of comparison.differingDimensions) {
      differenceCounts.set(dimension, (differenceCounts.get(dimension) ?? 0) + 1);
    }
  }
  const dominantDifferenceSources = [...differenceCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([dimension]) => dimension);
  const counts = comparisons.reduce<Record<HeterogeneityComparison["status"], number>>((acc, comparison) => {
    acc[comparison.status] += 1;
    return acc;
  }, { COMPARABLE: 0, PARTIALLY_COMPARABLE: 0, DIRECTION_ONLY: 0, NOT_COMPARABLE: 0 });
  return {
    comparisons,
    dominantDifferenceSources,
    synthesisBoundary: comparisons.length === 0
      ? "缺少兩個可交叉比較的獨立來源；不得宣稱跨研究共識。"
      : `可直接合併 ${counts.COMPARABLE} 組，部分可比 ${counts.PARTIALLY_COMPARABLE} 組，只能比較方向 ${counts.DIRECTION_ONLY} 組，不可比較 ${counts.NOT_COMPARABLE} 組。只有 COMPARABLE 可進行數值合併。`,
  };
}

function nodeLabel(value: string | null | undefined, type: KnowledgeConceptNode["nodeType"]): string {
  if (type === "population") return normalizedConcept(value, "population");
  if (type === "exposure") return normalizedConcept(value, "exposure");
  if (type === "outcome") return normalizedConcept(value, "outcome");
  return clean(value);
}

function evidenceStrength(facts: NormalizedFact[]): KnowledgeRelationEdge["evidenceStrength"] {
  const sources = new Set(facts.map((fact) => fact.sourceId)).size;
  const verified = facts.filter((fact) => fact.verificationStatus === "verified").length;
  const direct = facts.filter((fact) => fact.evidenceDirectness === "A" || fact.evidenceDirectness === "B").length;
  if (sources >= 3 && verified === facts.length && direct >= 2) return "strong";
  if (sources >= 2 && verified >= 1) return "moderate";
  if (facts.length > 0) return "weak";
  return "insufficient";
}

export function buildResearchKnowledgeModel(input: {
  researchQuestion: string;
  facts: NormalizedFact[];
}): ResearchKnowledgeModel {
  const nodes = new Map<string, KnowledgeConceptNode>();
  const addNode = (type: KnowledgeConceptNode["nodeType"], value: string | null | undefined, factId: string) => {
    const label = nodeLabel(value, type);
    if (!label) return "";
    const key = `${type}|${label.toLocaleLowerCase("zh-TW")}`;
    const nodeId = `concept-${stableHash(key)}`;
    const current = nodes.get(key);
    nodes.set(key, current
      ? { ...current, aliases: unique([...current.aliases, clean(value)]), supportingFactIds: unique([...current.supportingFactIds, factId]) }
      : { nodeId, nodeType: type, normalizedLabel: label, aliases: unique([clean(value), label]), supportingFactIds: [factId] });
    return nodeId;
  };
  const edgeGroups = new Map<string, { from: string; to: string; facts: NormalizedFact[] }>();
  for (const fact of input.facts.filter((item) => item.writerEligible)) {
    addNode("population", fact.population, fact.factId);
    addNode("setting", fact.studySetting ?? fact.setting ?? fact.geography, fact.factId);
    addNode("method", fact.studyDesign ?? fact.method, fact.factId);
    addNode("moderator", fact.moderator, fact.factId);
    addNode("direction", fact.associationDirection, fact.factId);
    addNode("applicability", fact.applicability, fact.factId);
    for (const confounder of fact.confounders ?? []) addNode("confounder", confounder, fact.factId);
    const exposureId = addNode("exposure", fact.exposureConcept ?? fact.exposure, fact.factId);
    const outcomeId = addNode("outcome", fact.outcomeConcept ?? fact.outcome, fact.factId);
    const mediatorId = addNode("mediator", fact.mediator, fact.factId);
    if (exposureId && outcomeId) {
      const key = `${exposureId}|${outcomeId}`;
      const current = edgeGroups.get(key);
      edgeGroups.set(key, { from: exposureId, to: outcomeId, facts: [...(current?.facts ?? []), fact] });
    }
    if (exposureId && mediatorId) {
      const key = `${exposureId}|${mediatorId}`;
      const current = edgeGroups.get(key);
      edgeGroups.set(key, { from: exposureId, to: mediatorId, facts: [...(current?.facts ?? []), fact] });
    }
    if (mediatorId && outcomeId) {
      const key = `${mediatorId}|${outcomeId}`;
      const current = edgeGroups.get(key);
      edgeGroups.set(key, { from: mediatorId, to: outcomeId, facts: [...(current?.facts ?? []), fact] });
    }
  }
  const edges: KnowledgeRelationEdge[] = [...edgeGroups.values()].map((group) => {
    const support = group.facts.filter((fact) => !["null", "mixed"].includes(fact.associationDirection));
    const counter = group.facts.filter((fact) => ["null", "mixed"].includes(fact.associationDirection));
    const mediated = group.facts.some((fact) => clean(fact.mediator));
    const moderated = group.facts.some((fact) => clean(fact.moderator));
    const causal = group.facts.every(studyAllowsCausalInterpretation);
    const relationshipType: KnowledgeRelationEdge["relationshipType"] = counter.length === group.facts.length &&
      group.facts.every((fact) => fact.associationDirection === "null")
      ? "null_relationship"
      : moderated
        ? "moderation"
        : mediated
          ? "mediation"
          : causal
            ? "causal"
            : group.facts.some((fact) => /predict|預測/iu.test(clean(fact.statisticType)))
              ? "prediction"
              : "association";
    return {
      edgeId: `relation-${stableHash(`${group.from}|${group.to}`)}`,
      fromNodeId: group.from,
      toNodeId: group.to,
      relationshipType,
      supportingFactIds: support.map((fact) => fact.factId),
      contradictingFactIds: counter.map((fact) => fact.factId),
      evidenceBasis: group.facts.some((fact) => clean(fact.authorInterpretation))
        ? "source_author_interpretation"
        : group.facts.some((fact) => clean(fact.statisticType) || fact.numericalResults.length > 0)
          ? "statistical_association"
          : "direct_measurement",
      evidenceStrength: evidenceStrength(group.facts),
      applicablePopulations: unique(group.facts.map((fact) => fact.population)),
      applicableSettings: unique(group.facts.map((fact) => fact.studySetting ?? fact.setting ?? fact.geography)),
      causalInterpretationAllowed: causal,
      uncertainty: unique([
        ...group.facts.flatMap((fact) => fact.limitations),
        ...group.facts.flatMap((fact) => fact.authorLimitations ?? []),
        counter.length > 0 ? "存在反方向、無顯著或混合結果。" : null,
        new Set(group.facts.map((fact) => fact.associationDirection).filter((direction) =>
          direction === "positive" || direction === "negative"
        )).size > 1 ? "關聯方向在來源間不一致。" : null,
        !causal ? "此關係不得畫成已證明的因果路徑。" : null,
      ]),
    };
  });
  const evidenceGaps = unique([
    edges.length === 0 ? "尚未形成可追溯的概念關係。" : null,
    edges.some((edge) => !edge.causalInterpretationAllowed) ? "多數關係仍停留在關聯或作者解釋層級。" : null,
    input.facts.some((fact) => fact.sourceAccessLevel === "partial_abstract" || fact.sourceAccessLevel === "bibliographic_only")
      ? "部分來源只有不完整摘要或書目資料。"
      : null,
  ]);
  return { researchQuestion: clean(input.researchQuestion), nodes: [...nodes.values()], edges, evidenceGaps };
}

function alternativeExplanationsForFacts(facts: NormalizedFact[]): string[] {
  const text = facts.map((fact) => `${fact.studyDesign ?? ""} ${fact.method ?? ""} ${fact.adjustmentStatus ?? ""} ${fact.claimTextZhTw}`).join(" ");
  return unique([
    /cross[- ]?sectional|橫斷/iu.test(text) ? "反向因果：結果狀態也可能改變暴露行為。" : null,
    /self[- ]?report|問卷|自陳/iu.test(text) ? "自陳、回憶或共同方法偏差可能放大觀察到的關聯。" : null,
    facts.some((fact) => !clean(fact.adjustmentStatus)) ? "未控制混雜因素可能同時影響暴露與結果。" : null,
    new Set(facts.map((fact) => clean(fact.geography ?? fact.location)).filter(Boolean)).size > 1
      ? "地區、文化或制度差異可能造成結果異質性。"
      : null,
    new Set(facts.map((fact) => clean(fact.population)).filter(Boolean)).size > 1
      ? "年齡與研究對象差異可能限制跨族群外推。"
      : null,
    new Set(facts.map((fact) => clean(fact.exposureMeasure)).filter(Boolean)).size > 1
      ? "暴露定義或平台特性差異可能使研究回答不同問題。"
      : null,
    new Set(facts.map((fact) => clean(fact.outcomeMeasure)).filter(Boolean)).size > 1
      ? "結果量表與切點不同可能造成表面上的不一致。"
      : null,
    new Set(facts.map((fact) => fact.sourceId)).size === 1 ? "單一來源支持可能受到選樣或出版偏差影響。" : null,
  ]);
}

export function buildContradictionAnalysis(input: {
  claimGraph: CrossSourceClaimGraph;
  facts: NormalizedFact[];
}): ClaimContradictionAnalysis[] {
  const factById = new Map(input.facts.map((fact) => [fact.factId, fact] as const));
  return input.claimGraph.claims.map((claim) => {
    const supporting = claim.supportingFacts.map((id) => factById.get(id)).filter((fact): fact is NormalizedFact => Boolean(fact));
    const explicitCounter = claim.contradictingFacts.map((id) => factById.get(id)).filter((fact): fact is NormalizedFact => Boolean(fact));
    const nullFacts = [...supporting, ...explicitCounter].filter((fact) => fact.associationDirection === "null");
    const counter = unique([
      ...explicitCounter.map((fact) => fact.factId),
      ...supporting.filter((fact) => fact.associationDirection === "mixed").map((fact) => fact.factId),
    ]);
    const supportIds = supporting
      .filter((fact) => !counter.includes(fact.factId) && fact.associationDirection !== "null")
      .map((fact) => fact.factId);
    const allFacts = unique([...supportIds, ...counter, ...nullFacts.map((fact) => fact.factId)])
      .map((id) => factById.get(id))
      .filter((fact): fact is NormalizedFact => Boolean(fact));
    const sourceCount = new Set(allFacts.map((fact) => fact.sourceId)).size;
    const status: ClaimContradictionAnalysis["status"] = allFacts.length === 0
      ? "insufficient"
      : sourceCount === 1
        ? "single_source"
        : counter.length > 0 && supportIds.length > 0
          ? "contradictory"
          : nullFacts.length > 0
            ? "mixed"
            : "consistent";
    const alternatives = alternativeExplanationsForFacts(allFacts);
    return {
      claimId: claim.claimId,
      status,
      supportingFactIds: supportIds,
      counterFactIds: counter,
      nullFactIds: nullFacts.map((fact) => fact.factId),
      primaryExplanation: status === "consistent"
        ? "目前可核對結果方向大致一致，但仍受研究設計與適用範圍限制。"
        : status === "contradictory"
          ? "結果方向不一致，最合理的初步解釋是研究對象、量測或設計差異。"
          : status === "mixed"
            ? "部分研究未達顯著或精確度不足，不能只保留方向一致的結果。"
            : "證據數量不足，暫時不能建立穩定解釋。",
      alternativeExplanations: alternatives,
      unresolvedPossibilities: unique([
        ...alternatives,
        claim.limitations.join("；"),
        sourceCount < 2 ? "缺少獨立重複研究。" : null,
      ]),
      discriminatingStudy: "採用預先註冊、明確時間順序、相同操作定義並充分控制混雜因素的多地點研究，最能區分主要與替代解釋。",
    };
  });
}

export interface ReportIntelligenceModel {
  audienceProfile: AudienceProfile;
  reportArchetype: ReportArchetypeDecision;
  heterogeneityAnalysis: HeterogeneityAnalysis;
  statisticalInterpretations: StatisticalInterpretation[];
  knowledgeModel: ResearchKnowledgeModel;
  contradictionAnalysis: ClaimContradictionAnalysis[];
  claimGraph: CrossSourceClaimGraph;
}

export function buildReportIntelligence(input: {
  topic: string;
  researchQuestion: string;
  reportType?: string | null;
  audience?: string | null;
  compositionKind?: "complete_research_report" | "limited_evidence_brief" | "evidence_summary";
  facts: NormalizedFact[];
  clusters: SynthesisCluster[];
  claimGraph: CrossSourceClaimGraph;
}): ReportIntelligenceModel {
  const heterogeneityAnalysis = buildHeterogeneityAnalysis(input.facts);
  const statisticalInterpretations = buildStatisticalInterpretations({
    facts: input.facts,
    comparisons: heterogeneityAnalysis.comparisons,
  });
  const interpretationIdsByFact = new Map<string, string[]>();
  for (const interpretation of statisticalInterpretations) {
    interpretationIdsByFact.set(interpretation.factId, [
      ...(interpretationIdsByFact.get(interpretation.factId) ?? []),
      interpretation.interpretationId,
    ]);
  }
  const claimGraph: CrossSourceClaimGraph = {
    ...input.claimGraph,
    claims: input.claimGraph.claims.map((claim) => ({
      ...claim,
      statisticalInterpretationIds: unique([
        ...claim.supportingFacts,
        ...claim.contradictingFacts,
      ].flatMap((factId) => interpretationIdsByFact.get(factId) ?? [])),
    })),
  };
  return {
    audienceProfile: routeAudienceProfile(input.audience),
    reportArchetype: routeReportArchetype({
      question: input.researchQuestion || input.topic,
      reportType: input.reportType,
      facts: input.facts,
      clusters: input.clusters,
      forceLimited: input.compositionKind !== "complete_research_report",
    }),
    heterogeneityAnalysis,
    statisticalInterpretations,
    knowledgeModel: buildResearchKnowledgeModel({
      researchQuestion: input.researchQuestion || input.topic,
      facts: input.facts,
    }),
    contradictionAnalysis: buildContradictionAnalysis({ claimGraph, facts: input.facts }),
    claimGraph,
  };
}
