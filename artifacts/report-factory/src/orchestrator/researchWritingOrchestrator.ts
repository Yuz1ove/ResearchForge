import {
  academicReportTypeSignals,
  academicTopicSignals,
  appliedResearchSignals,
  causeEffectSignals,
  defaultAcademicSectionTemplates,
  directSoftwareActionSignals,
  domainRules,
  softwareArtifactSignals,
  softwareTriageSectionTemplates,
} from "./rules.ts";
import type {
  DomainRule,
  MethodPlan,
  ResearchWritingIntent,
  ResearchWritingOrchestratorInput,
  ResearchWritingPlan,
  SectionTemplate,
  SectionWritingPlan,
  SourcePlan,
  TopicAnalysis,
  TopicVariable,
} from "./types.ts";

type NormalizedInput = Required<
  Pick<
    ResearchWritingOrchestratorInput,
    "topic" | "reportType" | "audience" | "language" | "expectedLength" | "sourceRequirement"
  >
> & {
  outputFormat: string[];
  constraints: string[];
};

type ClassificationResult = {
  intent: ResearchWritingIntent;
  isSoftwareProject: boolean;
  warnings: string[];
};

type ExtractedVariables = {
  variables: TopicVariable[];
  independentVariables: string[];
  dependentVariables: string[];
  contextVariables: string[];
};

const defaultInput: NormalizedInput = {
  topic: "未提供題目",
  reportType: "研究報告",
  audience: "一般讀者",
  language: "zh-Hant",
  expectedLength: "medium",
  sourceRequirement: "APA",
  outputFormat: [],
  constraints: [],
};

export function createResearchWritingPlan(input: ResearchWritingOrchestratorInput): ResearchWritingPlan {
  const normalizedInput = normalizeInput(input);
  const classification = classifyIntent(normalizedInput);
  const domains = identifyDomains(normalizedInput, classification.intent);
  const extractedVariables = extractVariables(normalizedInput);
  const topicAnalysis = buildTopicAnalysis(normalizedInput, classification, domains, extractedVariables);

  return {
    intent: classification.intent,
    isSoftwareProject: classification.isSoftwareProject,
    domains,
    researchStrategy: buildResearchStrategy(classification.intent),
    topicAnalysis,
    researchQuestions: buildResearchQuestions(normalizedInput, classification.intent, topicAnalysis, extractedVariables),
    hypotheses: buildHypotheses(classification.intent, extractedVariables),
    sectionPlan: buildSectionPlan(classification.intent, normalizedInput, topicAnalysis, extractedVariables),
    sourcePlan: buildSourcePlan(normalizedInput, classification.intent, domains, extractedVariables),
    methodPlan: buildMethodPlan(classification.intent, domains, extractedVariables),
    qualityChecklist: buildQualityChecklist(classification.intent),
    nextAction: buildNextAction(classification.intent),
  };
}

export const runResearchWritingOrchestrator = createResearchWritingPlan;

function normalizeInput(input: ResearchWritingOrchestratorInput): NormalizedInput {
  return {
    topic: cleanText(input.topic) || defaultInput.topic,
    reportType: cleanText(input.reportType) || defaultInput.reportType,
    audience: cleanText(input.audience) || defaultInput.audience,
    language: cleanText(input.language) || defaultInput.language,
    expectedLength: cleanText(input.expectedLength) || defaultInput.expectedLength,
    sourceRequirement: cleanText(input.sourceRequirement) || defaultInput.sourceRequirement,
    outputFormat: input.outputFormat?.map(cleanText).filter(Boolean) ?? defaultInput.outputFormat,
    constraints: input.constraints?.map(cleanText).filter(Boolean) ?? defaultInput.constraints,
  };
}

function classifyIntent(input: NormalizedInput): ClassificationResult {
  const text = searchableText(input);
  const hasDirectSoftwareAction = hasAnySignal(text, directSoftwareActionSignals);
  const hasSoftwareArtifact = hasAnySignal(text, softwareArtifactSignals);
  const hasAcademicReportType = hasAnySignal(normalizeText(input.reportType), academicReportTypeSignals);
  const hasAcademicTopic = hasAnySignal(text, academicTopicSignals);
  const hasAppliedResearchSignal = hasAnySignal(text, appliedResearchSignals);
  const hasCauseEffectLanguage = hasAnySignal(text, causeEffectSignals);

  if (hasDirectSoftwareAction && hasSoftwareArtifact) {
    return {
      intent: "software_project",
      isSoftwareProject: true,
      warnings: ["software_project_detected: 此輸入包含明確軟體修正、除錯或部署動作，應交給工程流程處理。"],
    };
  }

  if (hasSoftwareArtifact && hasAppliedResearchSignal) {
    return {
      intent: "applied_research",
      isSoftwareProject: false,
      warnings: [
        "mixed_technical_research_warning: 題目可能同時需要技術實作規劃與研究寫作規劃，請避免把產品功能當成已驗證研究結果。",
      ],
    };
  }

  if (hasAcademicReportType || hasAcademicTopic || hasCauseEffectLanguage) {
    return {
      intent: "academic_research_report",
      isSoftwareProject: false,
      warnings: [],
    };
  }

  return {
    intent: "academic_research_report",
    isSoftwareProject: false,
    warnings: ["classification_low_confidence: 未偵測到強研究訊號，V1 先以研究報告規劃處理。"],
  };
}

function identifyDomains(input: NormalizedInput, intent: ResearchWritingIntent): string[] {
  const text = searchableText(input);
  const matchedDomains = domainRules
    .filter((rule) => hasAnySignal(text, rule.keywords))
    .map((rule) => rule.domain);

  if (intent === "software_project") {
    return unique(["software_engineering", "information_systems", ...matchedDomains]);
  }

  if (intent === "applied_research") {
    return unique(["information_systems", ...matchedDomains]);
  }

  return unique(matchedDomains.length > 0 ? matchedDomains : ["general_academic_research"]);
}

function extractVariables(input: NormalizedInput): ExtractedVariables {
  const variables: TopicVariable[] = [];
  const independentVariables: string[] = [];
  const dependentVariables: string[] = [];
  const contextVariables: string[] = [];
  const topic = stripResearchSuffix(input.topic);
  const effectMatch = topic.match(/^(.+?)對(.+?)(?:之|的)?影響$/u);

  if (effectMatch) {
    const independentVariable = cleanVariableName(effectMatch[1] ?? "");
    const dependentPhrase = cleanVariableName(effectMatch[2] ?? "");
    const dependentParts = splitVariablePhrase(dependentPhrase).map((part) =>
      removeAudiencePrefix(cleanVariableName(part), input.audience),
    );

    addVariable(variables, independentVariables, {
      role: "independent_variable",
      name: independentVariable,
      confidence: "high",
      reason: "題目使用「A 對 B 之影響」句型，A 可作為自變項候選。",
    });

    for (const dependentVariable of dependentParts) {
      addVariable(variables, dependentVariables, {
        role: "dependent_variable",
        name: dependentVariable,
        confidence: "high",
        reason: "題目使用「A 對 B 之影響」句型，B 可作為依變項候選。",
      });
    }
  } else {
    const aspects = extractExploratoryAspects(topic);
    for (const aspect of aspects) {
      addVariable(variables, independentVariables, {
        role: "related_factor",
        name: aspect,
        confidence: "medium",
        reason: "題目較偏探索性，V1 將核心面向標為相關因素而非因果變項。",
      });
    }
  }

  for (const context of extractContextVariables(input)) {
    addVariable(variables, contextVariables, {
      role: "control_or_context_variable",
      name: context,
      confidence: "medium",
      reason: "此詞描述研究對象、場域或脈絡，適合作為控制或情境變項候選。",
    });
  }

  return {
    variables,
    independentVariables: unique(independentVariables.filter(Boolean)),
    dependentVariables: unique(dependentVariables.filter(Boolean)),
    contextVariables: unique(contextVariables.filter(Boolean)),
  };
}

function buildTopicAnalysis(
  input: NormalizedInput,
  classification: ClassificationResult,
  domains: string[],
  extractedVariables: ExtractedVariables,
): TopicAnalysis {
  const riskWarnings = [
    ...classification.warnings,
    "citation_needed: V1 不會生成引用、統計數字、作者、文章標題或 URL；所有證據必須由後續 Source/Citation 模組查證。",
  ];

  if (classification.intent !== "software_project" && extractedVariables.dependentVariables.length === 0) {
    riskWarnings.push("variable_scope_warning: 題目未呈現明確依變項，寫作前應確認研究問題與操作型定義。");
  }

  return {
    mainSubject: deriveMainSubject(input.topic),
    variables: extractedVariables.variables,
    possibleScope: buildPossibleScope(input, domains),
    riskWarnings: unique(riskWarnings),
  };
}

function buildResearchStrategy(intent: ResearchWritingIntent): string {
  if (intent === "software_project") {
    return "software_task_triage_only";
  }

  if (intent === "applied_research") {
    return "applied_research_planning_with_technical_artifact_warning";
  }

  return "rule_based_academic_research_planning";
}

function buildResearchQuestions(
  input: NormalizedInput,
  intent: ResearchWritingIntent,
  topicAnalysis: TopicAnalysis,
  extractedVariables: ExtractedVariables,
): string[] {
  if (intent === "software_project") {
    return [
      "此輸入需要先釐清錯誤訊息、重現步驟、框架版本與相關檔案。",
      "若使用者仍需要研究報告，請另提供研究主題、研究目的與來源需求。",
    ];
  }

  if (extractedVariables.independentVariables.length > 0 && extractedVariables.dependentVariables.length > 0) {
    const independent = joinTerms(extractedVariables.independentVariables);
    const dependent = joinTerms(extractedVariables.dependentVariables);
    const context = extractedVariables.contextVariables[0] ?? input.audience;

    return [
      `${independent}與${dependent}之間是否存在可觀察的關聯？`,
      `在${context}情境下，${independent}可能如何影響${dependent}？`,
      `有哪些控制變項或背景因素可能影響${independent}與${dependent}之間的關係？`,
    ];
  }

  if (intent === "applied_research") {
    return [
      `${topicAnalysis.mainSubject}的核心需求、使用情境與限制為何？`,
      `${topicAnalysis.mainSubject}需要哪些技術實作證據與研究證據分別支持？`,
      `${topicAnalysis.mainSubject}的成效應如何被評估，而不是只以功能描述取代研究結果？`,
    ];
  }

  return [
    `${topicAnalysis.mainSubject}的形成背景與主要特徵為何？`,
    `${topicAnalysis.mainSubject}與相關社會、文化、科學或環境脈絡有何關聯？`,
    `既有文獻如何解釋${topicAnalysis.mainSubject}，仍有哪些研究缺口？`,
  ];
}

function buildHypotheses(intent: ResearchWritingIntent, extractedVariables: ExtractedVariables): string[] {
  if (intent === "software_project") {
    return ["not_applicable: 此輸入屬軟體任務，V1 不產生研究假設。"];
  }

  if (extractedVariables.independentVariables.length > 0 && extractedVariables.dependentVariables.length > 0) {
    const independent = joinTerms(extractedVariables.independentVariables);
    return extractedVariables.dependentVariables.map(
      (dependentVariable, index) =>
        `H${index + 1}: ${independent}會對${dependentVariable}產生可觀察影響。（citation_needed; 需由資料驗證）`,
    );
  }

  return ["exploratory_study: 本題偏探索性，V1 建議先建立研究問題與文獻架構，不自動生成方向性假設。"];
}

function buildSectionPlan(
  intent: ResearchWritingIntent,
  input: NormalizedInput,
  topicAnalysis: TopicAnalysis,
  extractedVariables: ExtractedVariables,
): SectionWritingPlan[] {
  const templates = intent === "software_project" ? softwareTriageSectionTemplates : defaultAcademicSectionTemplates;

  return templates.map((template) => ({
    ...template,
    requiredEvidence: buildRequiredEvidence(template, intent, input, extractedVariables),
    writerInstruction: buildWriterInstruction(template, intent, topicAnalysis),
    qualityRules: buildSectionQualityRules(template, intent),
  }));
}

function buildSourcePlan(
  input: NormalizedInput,
  intent: ResearchWritingIntent,
  domains: string[],
  extractedVariables: ExtractedVariables,
): SourcePlan {
  const matchedRules = getMatchedDomainRules(domains);
  const sourceTypes = unique([
    "peer_reviewed_journal",
    "official_report",
    "academic_book_or_textbook",
    ...matchedRules.flatMap((rule) => rule.recommendedSourceTypes),
  ]);

  if (intent === "software_project") {
    return {
      recommendedSourceTypes: unique(["official_documentation", "release_notes", "issue_tracker", "source_code", ...sourceTypes]),
      searchKeywords: buildSearchKeywords(input, extractedVariables),
      citationStyle: input.sourceRequirement,
      citationWarnings: [
        "not_a_research_report: 軟體修正任務通常不需要學術引用，除非使用者要求技術報告。",
        "do_not_fabricate: 不得編造文件版本、錯誤來源、作者或 URL。",
      ],
    };
  }

  const citationWarnings = [
    "citation_needed: 所有定義、理論、數據、研究結果與背景主張都必須由後續查證來源支持。",
    "do_not_fabricate: 不得編造引用、統計數字、作者、文章標題、期刊名稱或 URL。",
    "apa_metadata_required: APA 參考文獻需保留作者、年份、題名、出版資訊與 DOI/URL；缺漏時需標示待補。",
  ];

  if (intent === "applied_research") {
    citationWarnings.push("mixed_project_warning: 技術文件可支持實作描述，但不能取代研究成效證據。");
  }

  return {
    recommendedSourceTypes: sourceTypes,
    searchKeywords: buildSearchKeywords(input, extractedVariables),
    citationStyle: input.sourceRequirement,
    citationWarnings,
  };
}

function buildMethodPlan(intent: ResearchWritingIntent, domains: string[], extractedVariables: ExtractedVariables): MethodPlan {
  if (intent === "software_project") {
    return {
      recommendedMethods: ["錯誤重現", "版本與相依套件核對", "最小修復驗證"],
      dataToCollect: ["錯誤訊息", "重現步驟", "相關檔案", "框架與執行環境版本"],
      limitations: ["此流程不會生成研究報告；需要另行啟動軟體工程工作流。"],
    };
  }

  const matchedRules = getMatchedDomainRules(domains);
  const methods = unique([
    ...matchedRules.flatMap((rule) => rule.methodHints),
    extractedVariables.dependentVariables.length > 0 ? "變項操作型定義" : "探索性文獻分析",
  ]);
  const dataToCollect = unique([
    ...matchedRules.flatMap((rule) => rule.dataHints),
    ...extractedVariables.independentVariables.map((variable) => `${variable}的操作型資料`),
    ...extractedVariables.dependentVariables.map((variable) => `${variable}的衡量資料`),
  ]);
  const limitations = [
    "樣本代表性與研究場域可能限制推論範圍。",
    "自陳資料可能受回憶偏誤或社會期許影響。",
    "若只做相關分析，不能直接宣稱因果關係。",
    "所有未查證證據需保留 citation_needed 標記。",
  ];

  return {
    recommendedMethods: methods.length > 0 ? methods : ["文獻探討", "研究問題拆解", "資料蒐集規劃"],
    dataToCollect: dataToCollect.length > 0 ? dataToCollect : ["核心概念定義", "既有研究整理", "研究缺口"],
    limitations,
  };
}

function buildQualityChecklist(intent: ResearchWritingIntent): string[] {
  if (intent === "software_project") {
    return [
      "確認此輸入有明確軟體修正、除錯、部署或程式修改意圖。",
      "不要把軟體錯誤修正任務包裝成學術研究報告。",
      "不得編造框架文件、錯誤原因或修復結果。",
      "若後續需要報告，要求使用者提供研究主題與來源規格。",
    ];
  }

  return [
    "不要因題目出現 AI、網站、資料、系統或分析就誤判為 software_project。",
    "每個變項都需要操作型定義與可蒐集資料。",
    "所有事實、數字、研究結果與理論主張都要保留 citation_needed，直到來源模組查證。",
    "不得生成不存在的引用、作者、文章標題、統計數字或 URL。",
    "研究方法需能回答研究問題，且限制需明確揭露。",
    "章節計畫只規劃寫作，不生成完整報告正文。",
  ];
}

function buildNextAction(intent: ResearchWritingIntent): string {
  if (intent === "software_project") {
    return "route_to_software_project_workflow";
  }

  if (intent === "applied_research") {
    return "confirm_whether_user_wants_research_report_plan_or_technical_implementation_plan";
  }

  return "send_plan_to_writer_source_and_citation_modules";
}

function buildPossibleScope(input: NormalizedInput, domains: string[]): string {
  const lengthHint = input.expectedLength === "long" ? "可規劃完整章節與較多文獻" : "建議聚焦 2-4 個核心變項";
  return `${lengthHint}；對象為${input.audience}；領域初判為 ${domains.join(", ")}。`;
}

function buildRequiredEvidence(
  template: SectionTemplate,
  intent: ResearchWritingIntent,
  input: NormalizedInput,
  extractedVariables: ExtractedVariables,
): string[] {
  if (intent === "software_project") {
    return ["technical_context_needed", "no_academic_citation_generated"];
  }

  const variableEvidence = [
    ...extractedVariables.independentVariables.map((variable) => `definition_for_${variable}: citation_needed`),
    ...extractedVariables.dependentVariables.map((variable) => `measurement_for_${variable}: citation_needed`),
  ];

  switch (template.sectionId) {
    case "abstract":
      return ["research_question_summary", "method_summary", "findings_or_expected_findings_without_fabrication"];
    case "motivation":
      return ["background_context: citation_needed", "problem_importance: citation_needed"];
    case "purpose":
      return ["clear_research_objectives", ...variableEvidence];
    case "questions":
      return ["research_questions_aligned_with_variables"];
    case "hypotheses":
      return ["hypotheses_or_exploratory_rationale", ...variableEvidence];
    case "literature_review":
      return ["concept_definitions: citation_needed", "prior_findings: citation_needed", "research_gap: citation_needed"];
    case "methods":
      return ["sample_or_case_definition", "data_collection_plan", "analysis_plan", `audience_context_${input.audience}`];
    case "results_or_expected_results":
      return ["data_tables_or_expected_patterns", "do_not_claim_uncollected_results"];
    case "discussion":
      return ["compare_with_literature: citation_needed", "alternative_explanations"];
    case "limitations":
      return ["sampling_limitations", "measurement_limitations", "causal_inference_limitations"];
    case "conclusion":
      return ["answers_to_research_questions", "future_work"];
    case "references":
      return ["verified_sources_only", "complete_citation_metadata", input.sourceRequirement];
    default:
      return ["citation_needed"];
  }
}

function buildWriterInstruction(template: SectionTemplate, intent: ResearchWritingIntent, topicAnalysis: TopicAnalysis): string {
  if (intent === "software_project") {
    return "不要生成研究報告正文；只整理可交接給工程流程的資訊。";
  }

  if (template.sectionId === "references") {
    return "只列出後續 Source/Citation 模組查證過的來源；現在不可自行生成文獻。";
  }

  return `依據主題「${topicAnalysis.mainSubject}」撰寫本節計畫；若缺來源，保留 citation_needed，不補假資料。`;
}

function buildSectionQualityRules(template: SectionTemplate, intent: ResearchWritingIntent): string[] {
  if (intent === "software_project") {
    return ["keep_as_triage_plan", "do_not_generate_academic_body", "do_not_fabricate_technical_evidence"];
  }

  const commonRules = ["align_with_research_questions", "mark_missing_evidence_as_citation_needed", "do_not_fabricate_sources"];

  if (template.sectionId === "methods") {
    return [...commonRules, "methods_must_match_variables"];
  }

  if (template.sectionId === "references") {
    return ["verified_sources_only", "no_placeholder_citations_in_final_output"];
  }

  return commonRules;
}

function buildSearchKeywords(input: NormalizedInput, extractedVariables: ExtractedVariables): string[] {
  const keywords = [
    input.topic,
    ...extractedVariables.independentVariables,
    ...extractedVariables.dependentVariables,
    ...extractedVariables.contextVariables,
  ];

  if (extractedVariables.independentVariables.length > 0 && extractedVariables.dependentVariables.length > 0) {
    for (const independentVariable of extractedVariables.independentVariables) {
      for (const dependentVariable of extractedVariables.dependentVariables) {
        keywords.push(`${independentVariable} ${dependentVariable}`);
      }
    }
  }

  keywords.push(`${input.topic} 文獻探討`, `${input.topic} 研究方法`);
  return unique(keywords.map(cleanText).filter(Boolean)).slice(0, 12);
}

function getMatchedDomainRules(domains: string[]): DomainRule[] {
  return domainRules.filter((rule) => domains.includes(rule.domain));
}

function extractContextVariables(input: NormalizedInput): string[] {
  const contextSignals = ["高中生", "國中生", "大學生", "學生", "校園", "台灣", "夜市"];
  const text = searchableText(input);
  const matchedSignals = contextSignals.filter((signal) => text.includes(normalizeText(signal)));
  const contextVariables = unique([...matchedSignals, input.audience])
    .map(cleanVariableName)
    .filter((signal) => signal && signal !== "一般讀者");

  if (contextVariables.some((signal) => ["高中生", "國中生", "大學生"].includes(signal))) {
    return contextVariables.filter((signal) => !["高中", "國中", "大學", "學生"].includes(signal));
  }

  return contextVariables;
}

function extractExploratoryAspects(topic: string): string[] {
  const aspectMatch = topic.match(/^(.+?)(?:的|之)(.+?)(?:之研究|研究)?$/u);
  const aspectPhrase = aspectMatch?.[2] ?? "";
  return splitVariablePhrase(aspectPhrase).filter((aspect) => aspect.length >= 2).slice(0, 4);
}

function deriveMainSubject(topic: string): string {
  const stripped = stripResearchSuffix(topic);
  const effectMatch = stripped.match(/^(.+?)對(.+?)(?:之|的)?影響$/u);
  if (effectMatch) {
    return cleanVariableName(effectMatch[1] ?? stripped);
  }

  const exploratoryMatch = stripped.match(/^(.+?)(?:的|之).+$/u);
  return cleanVariableName(exploratoryMatch?.[1] ?? stripped);
}

function stripResearchSuffix(value: string): string {
  return cleanText(value)
    .replace(/之研究$/u, "")
    .replace(/的研究$/u, "")
    .replace(/研究$/u, "")
    .replace(/報告$/u, "");
}

function splitVariablePhrase(value: string): string[] {
  return cleanText(value)
    .split(/[、，,與和及]/u)
    .map(cleanVariableName)
    .filter(Boolean);
}

function removeAudiencePrefix(value: string, audience: string): string {
  const cleanedAudience = cleanVariableName(audience);
  const contextPrefixes = unique([cleanedAudience, "高中生", "國中生", "大學生", "學生"])
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const matchedPrefix = contextPrefixes.find((prefix) => value.startsWith(prefix) && value.length > prefix.length + 1);
  return matchedPrefix ? cleanVariableName(value.slice(matchedPrefix.length)) : value;
}

function addVariable(target: TopicVariable[], roleBucket: string[], variable: TopicVariable): void {
  if (!variable.name || target.some((item) => item.role === variable.role && item.name === variable.name)) {
    return;
  }

  target.push(variable);
  roleBucket.push(variable.name);
}

function joinTerms(terms: string[]): string {
  return terms.join("與");
}

function searchableText(input: NormalizedInput): string {
  return normalizeText([input.topic, input.reportType, input.audience, ...input.constraints].join(" "));
}

function cleanVariableName(value: string): string {
  return cleanText(value).replace(/^的/u, "").replace(/之$/u, "");
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeText(value: string): string {
  return cleanText(value).toLowerCase();
}

function hasAnySignal(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(normalizeText(signal)));
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
