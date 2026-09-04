import { z } from "zod";

export const TOPIC_INTEGRITY_VERSION = "topic-integrity-contract.v2" as const;
export const RELEVANCE_POLICY_VERSION = "peco-directness-reconciliation.v2" as const;

export const FormalEvidenceRoleSchema = z.enum([
  "DIRECT_FINDING",
  "CONTEXTUAL_BACKGROUND",
  "METHOD_CONTEXT",
  "LIMITATION_CONTEXT",
  "REJECTED_OFF_TOPIC",
]);
export type FormalEvidenceRole = z.infer<typeof FormalEvidenceRoleSchema>;

export const EVIDENCE_SPECIES = [
  "HUMAN",
  "ANIMAL",
  "IN_VITRO",
  "MIXED",
  "UNKNOWN",
] as const;
export type EvidenceSpecies = (typeof EVIDENCE_SPECIES)[number];

/**
 * Research-question-owned directness contract.  This is intentionally
 * independent from generic relevance scoring: topical similarity may nominate
 * a candidate, but it cannot satisfy a missing PECO/task/species dimension.
 */
export interface EvidenceDirectnessProfile {
  population: { label: string; terms: string[] };
  interventionOrExposure: { label: string; terms: string[] };
  comparator: { label: string; terms: string[] } | null;
  outcomes: Array<{ label: string; terms: string[] }>;
  studyPurpose: "OBSERVED_OUTCOME" | "METHODS_ONLY" | "MECHANISTIC" | "UNKNOWN";
  studyDesign: string[];
  species: EvidenceSpecies;
  timeframe: string[];
  metric: string[];
  requiresHeadToHeadComparison: boolean;
  requiresHumanPopulation: boolean;
}

export interface DirectEvidenceReconciliationItem {
  sourceId: string;
  title: string;
  role: FormalEvidenceRole;
  whyDirect: string[];
  whyNotDirect: string[];
  failedDimensions: string[];
  assessment: TopicIntegrityAssessment;
}

type TopicIsolationRecord = {
  id?: string | null;
  workflowId?: string | null;
  reportId?: string | null;
  topicHash?: string | null;
  topic?: string | null;
};

export interface TopicIsolationValidation {
  pass: boolean;
  code: "PASS" | "TOPIC_ISOLATION_FAILED";
  stage: "pre_writer" | "writer" | "pre_export";
  workflowId: string;
  reportId: string;
  foreignWorkflowIds: string[];
  foreignReportIds: string[];
  foreignTopicHashes: string[];
  foreignTopics: string[];
  foreignMethodConcepts: string[];
  issues: string[];
}

const TopicFacetSchema = z.object({
  label: z.string(),
  terms: z.array(z.string()),
});

export const TopicIntegrityContractSchema = z.object({
  schemaVersion: z.literal(TOPIC_INTEGRITY_VERSION),
  policyVersion: z.literal(RELEVANCE_POLICY_VERSION),
  canonicalTopic: z.string().trim().min(1),
  researchQuestion: z.string().trim().min(1),
  targetPopulation: TopicFacetSchema,
  interventionExposure: TopicFacetSchema,
  comparator: TopicFacetSchema.nullable(),
  primaryOutcomes: z.array(TopicFacetSchema),
  secondaryOutcomes: z.array(TopicFacetSchema),
  domain: z.string().trim().min(1),
  allowedAdjacentConcepts: z.array(z.string()),
  excludedConcepts: z.array(z.string()),
  minimumDirectnessRequirement: z.literal("DIRECT"),
  requiredEvidenceRelationship: z.object({
    requiredFacets: z.array(
      z.enum(["population", "intervention_or_exposure", "primary_outcome"]),
    ),
    populationPolicy: z.enum([
      "MATCH_OR_UNSPECIFIED_WITHOUT_CONFLICT",
      "EXPLICIT_MATCH_REQUIRED",
    ]),
    outcomePolicy: z.literal("PRIMARY_OUTCOME_MUST_BE_A_REPORTED_RESULT"),
    semanticSimilarityPolicy: z.literal("CANDIDATE_SIGNAL_ONLY"),
  }),
});
export type TopicIntegrityContract = z.infer<typeof TopicIntegrityContractSchema>;

export const TopicIntegrityAssessmentSchema = z.object({
  topicIntegrityVersion: z.literal(TOPIC_INTEGRITY_VERSION),
  relevancePolicyVersion: z.literal(RELEVANCE_POLICY_VERSION),
  sourceId: z.string().trim().min(1),
  metadataRelevance: z.object({
    passed: z.boolean(),
    matchedFields: z.array(z.string()),
    populationMatches: z.array(z.string()),
    interventionExposureMatches: z.array(z.string()),
    primaryOutcomeMatches: z.array(z.string()),
    primaryOutcomeProminent: z.boolean(),
  }),
  semanticRelevance: z.object({
    score: z.number().min(0).max(1),
    policy: z.literal("CANDIDATE_SIGNAL_ONLY"),
  }),
  evidenceEntailment: z.object({
    supportedTopicFacet: z.array(z.string()),
    populationMatch: z.enum(["match", "unspecified", "mismatch"]),
    interventionExposureMatch: z.boolean(),
    outcomeMatch: z.boolean(),
    relationship: z.enum(["direct", "indirect", "contextual", "none"]),
    acceptanceReason: z.string().nullable(),
    rejectionReason: z.string().nullable(),
  }),
  hardExclusion: z.object({
    excluded: z.boolean(),
    reasons: z.array(z.string()),
  }),
  sourceRole: FormalEvidenceRoleSchema,
  acceptedForCanonicalEvidence: z.boolean(),
  allowedSections: z.array(z.string()),
  topicIntegrityReason: z.string(),
});
export type TopicIntegrityAssessment = z.infer<typeof TopicIntegrityAssessmentSchema>;

type TopicIntegritySource = {
  id?: string | null;
  sourceId?: string | null;
  title?: string | null;
  abstract?: string | null;
  abstractOriginal?: string | null;
  extractedAbstract?: string | null;
  snippet?: string | null;
  keywords?: string[] | null;
  meshTerms?: string[] | null;
  subjectTerms?: string[] | null;
  venue?: string | null;
  containerTitle?: string | null;
  sourceType?: string | null;
  relevanceScore?: number | null;
  finalScore?: number | null;
};

type FacetFamily = {
  id: string;
  topicPattern: RegExp;
  terms: string[];
  conflictingTerms?: string[];
};

const POPULATION_FAMILIES: FacetFamily[] = [
  {
    id: "adolescents",
    topicPattern: /青少年|青年|高中生|中學生|國中生|adolescen|teen|youth|young worker|high school/iu,
    terms: ["青少年", "青年", "年輕勞工", "高中生", "中學生", "國中生", "adolescent", "adolescents", "teen", "teenager", "teenage", "youth", "young people", "young worker", "young workers", "high school", "high school student", "high school students", "secondary school", "secondary student", "secondary students", "upper secondary", "upper secondary student", "upper secondary students"],
    conflictingTerms: [
      "adult",
      "adults",
      "older adult",
      "older adults",
      "adult only",
      "older adults only",
      "higher education",
      "university student",
      "university students",
      "college student",
      "college students",
      "undergraduate",
      "undergraduates",
      "future teacher",
      "future teachers",
      "成人のみ",
    ],
  },
  {
    id: "adults",
    topicPattern: /成人|成年人|高齡|老年|adult|elderly|older people|aged 18/iu,
    terms: ["成人", "成年人", "高齡者", "老年人", "adult", "adults", "older adult", "older adults", "elderly", "aged 18", "people ≥18", "hypertensive patients"],
    conflictingTerms: ["children", "child", "pediatric", "paediatric", "adolescent only", "青少年", "兒童", "小鼠", "大鼠", "mice", "mouse", "rats", "animal study"],
  },
  {
    id: "children",
    topicPattern: /兒童|孩童|children|child|pediatric|paediatric/iu,
    terms: ["兒童", "孩童", "children", "child", "pediatric", "paediatric", "school-aged children"],
    conflictingTerms: ["adult", "adults", "older adult", "older adults", "adult only", "older adults only", "成人のみ"],
  },
];

const EXPOSURE_FAMILIES: FacetFamily[] = [
  {
    id: "retrieval_practice",
    topicPattern: /retrieval practice|practice testing|test-enhanced learning|檢索練習|提取練習/iu,
    terms: ["retrieval practice", "practice testing", "practice test", "practice tests", "test-enhanced learning", "testing effect", "檢索練習", "提取練習"],
  },
  {
    id: "rereading",
    topicPattern: /reread|restudy|re-study|重讀|再學習/iu,
    terms: ["rereading", "reread", "restudy", "restudying", "re-study", "re-studying", "重讀", "再學習"],
  },
  {
    id: "hiit",
    topicPattern: /\bHIIT\b|high[- ]intensity interval|高強度間歇/iu,
    terms: ["HIIT", "high-intensity interval training", "high intensity interval training", "高強度間歇訓練"],
  },
  {
    id: "mict",
    topicPattern: /\bMICT\b|moderate[- ]intensity continuous|中等強度持續/iu,
    terms: ["MICT", "moderate-intensity continuous training", "moderate intensity continuous training", "中等強度持續訓練"],
  },
  {
    id: "intermittent_fasting",
    topicPattern: /intermittent fast|intermittent energy restriction|time[- ]restricted (?:feeding|eating)|間歇性斷食|間歇性能量限制/iu,
    terms: ["intermittent fasting", "intermittent energy restriction", "time-restricted feeding", "time-restricted eating", "間歇性斷食", "間歇性能量限制"],
  },
  {
    id: "continuous_calorie_restriction",
    topicPattern: /continuous (?:calorie|energy) restriction|daily (?:calorie|energy) restriction|持續熱量限制|每日能量限制/iu,
    terms: ["continuous calorie restriction", "continuous energy restriction", "daily calorie restriction", "daily energy restriction", "持續熱量限制", "持續能量限制"],
  },
  {
    id: "electric_vehicle",
    topicPattern: /electric vehicles?|battery electric vehicles?|\bBEVs?\b|電動車|電動汽車/iu,
    terms: ["electric vehicle", "electric vehicles", "battery electric vehicle", "battery electric vehicles", "BEV", "BEVs", "電動車", "電動汽車"],
  },
  {
    id: "combustion_vehicle",
    topicPattern: /gasoline vehicles?|petrol vehicles?|internal combustion engine vehicles?|\bICEVs?\b|燃油車|汽油車|內燃機車輛/iu,
    terms: ["gasoline vehicle", "gasoline vehicles", "petrol vehicle", "petrol vehicles", "internal combustion engine vehicle", "internal combustion engine vehicles", "ICEV", "ICEVs", "燃油車", "汽油車", "內燃機車輛"],
  },
  {
    id: "pm25",
    topicPattern: /PM\s*2[.]5|fine particulate matter|細懸浮微粒/iu,
    terms: ["PM2.5", "PM 2.5", "fine particulate matter", "fine particles", "細懸浮微粒"],
    conflictingTerms: ["PM1", "PM 1", "ultrafine particles only"],
  },
  {
    id: "green_space",
    topicPattern: /green space|greenspace|greenness|綠地|綠化/iu,
    terms: ["green space", "greenspace", "urban green space", "greenness", "green-space exposure", "綠地", "都市綠地", "綠化"],
  },
  {
    id: "rag",
    topicPattern: /retrieval[- ]augmented generation|\bRAG\b/iu,
    terms: ["retrieval-augmented generation", "retrieval augmented generation", "RAG"],
  },
  {
    id: "fine_tuning",
    topicPattern: /fine[- ]tun|finetun|微調/iu,
    terms: ["fine-tuning", "fine tuning", "finetuning", "full fine-tuning", "微調"],
  },
  {
    id: "minimum_wage",
    topicPattern: /minimum wage|最低工資|最低薪資/iu,
    terms: ["minimum wage", "minimum-wage increase", "minimum wage increase", "最低工資", "最低薪資"],
  },
  {
    id: "microplastics",
    topicPattern: /microplastic|微塑膠|微型塑膠/iu,
    terms: ["microplastic", "microplastics", "microplastic exposure", "微塑膠", "微型塑膠"],
    conflictingTerms: ["lead exposure", "maternal lead", "industrial toxicants", "heavy metal exposure"],
  },
  {
    id: "multilingual_llm",
    topicPattern: /multilingual (?:large language model|LLM)|cross[- ]lingual|多語言.*大型語言|跨語言/iu,
    terms: ["multilingual large language model", "multilingual LLM", "cross-lingual", "crosslingual", "low-resource language", "多語言大型語言模型", "跨語言", "低資源語言"],
  },
  {
    id: "exercise_training",
    topicPattern: /運動|身體活動|有氧|訓練|exercise|physical activity|aerobic|training/iu,
    terms: ["有氧運動", "規律運動", "運動訓練", "身體活動", "exercise", "aerobic exercise", "aerobic training", "exercise training", "physical activity", "endurance training", "combined training", "balance training", "pilates"],
  },
  {
    id: "screen_exposure",
    topicPattern: /螢幕|數位媒體|電子裝置|手機|社群媒體|screen time|screen use|digital media|electronic device|smartphone|cell phone|social media/iu,
    terms: ["螢幕時間", "螢幕使用", "數位媒體", "電子裝置", "手機", "社群媒體", "網路遊戲", "screen time", "screen use", "screen exposure", "digital media", "electronic device", "smartphone", "cell phone", "social media", "online game", "screen-based sedentary time"],
  },
  {
    id: "generative_ai",
    topicPattern: /生成式(?:人工智慧|\s*AI)|generative (?:artificial intelligence|AI)|large language model|ChatGPT/iu,
    terms: ["生成式人工智慧", "生成式 AI", "生成式AI", "generative artificial intelligence", "generative AI", "large language model", "large language models", "LLM", "LLMs", "ChatGPT", "chatbot", "chatbots", "conversational chatbot", "conversational chatbots"],
  },
];

const AEROBIC_EXPOSURE_TERMS = [
  "有氧運動",
  "有氧訓練",
  "aerobic exercise",
  "aerobic training",
  "endurance training",
  "cardiorespiratory training",
  "cardio exercise",
  "combined training",
];

const OUTCOME_FAMILIES: FacetFamily[] = [
  {
    id: "lifecycle_greenhouse_gas_emissions",
    topicPattern: /life[- ]?cycle.*(?:greenhouse gas|GHG|carbon|emissions?)|(?:greenhouse gas|GHG|carbon).*life[- ]?cycle|生命週期.*(?:溫室氣體|碳|排放)/iu,
    terms: ["life cycle greenhouse gas emissions", "lifecycle greenhouse gas emissions", "life cycle emissions", "lifecycle emissions", "greenhouse gas emissions", "GHG emissions", "carbon emissions", "carbon footprint", "global warming potential", "生命週期溫室氣體排放", "生命週期排放", "碳排放", "碳足跡"],
  },
  {
    id: "hallucination_reduction",
    topicPattern: /hallucination|factuality|faithfulness|groundedness|幻覺|事實性|忠實度/iu,
    terms: ["hallucination", "hallucinations", "hallucination rate", "hallucination reduction", "factuality", "faithfulness", "groundedness", "factual accuracy", "幻覺", "幻覺率", "事實性", "忠實度"],
  },
  {
    id: "mortality",
    topicPattern: /mortality|death rate|survival|死亡率|存活率|死亡/iu,
    terms: ["mortality", "death rate", "survival", "organism mortality", "human mortality", "死亡率", "存活率", "死亡"],
  },
  {
    id: "memory_retention",
    topicPattern: /memory retention|long[- ]term retention|text retention|長期記憶|記憶保留/iu,
    terms: ["memory retention", "long-term retention", "long term retention", "text retention", "delayed retention", "長期記憶", "記憶保留"],
  },
  {
    id: "cardiorespiratory_fitness",
    topicPattern: /cardiorespiratory fitness|aerobic capacity|VO2\s*(?:max|peak)|心肺適能|最大攝氧/iu,
    terms: ["cardiorespiratory fitness", "aerobic capacity", "VO2max", "VO2 max", "VO2peak", "VO2 peak", "心肺適能", "最大攝氧量"],
  },
  {
    id: "weight_loss",
    topicPattern: /weight loss|weight reduction|body weight|減重|體重下降/iu,
    terms: ["weight loss", "weight reduction", "body weight reduction", "change in body weight", "減重", "體重下降"],
  },
  {
    id: "lung_function",
    topicPattern: /lung function|pulmonary function|FEV1|FVC|肺功能/iu,
    terms: ["lung function", "pulmonary function", "FEV1", "FVC", "forced expiratory volume", "forced vital capacity", "肺功能"],
    conflictingTerms: ["airway inflammation only", "asthma prevalence only", "COPD risk factors"],
  },
  {
    id: "mental_health",
    topicPattern: /mental health|mental well[- ]being|depress|anxiety|心理健康|心理福祉|憂鬱|焦慮/iu,
    terms: ["mental health", "mental well-being", "mental wellbeing", "depressive symptoms", "depression", "anxiety", "psychological distress", "心理健康", "心理福祉", "憂鬱", "焦慮"],
  },
  {
    id: "accuracy_quality",
    topicPattern: /accuracy|quality|performance|準確率|正確率|品質|表現/iu,
    terms: ["accuracy", "answer quality", "task performance", "exact match", "F1 score", "準確率", "正確率", "品質", "表現"],
  },
  {
    id: "cost_latency",
    topicPattern: /latency|cost|token cost|延遲|成本/iu,
    terms: ["latency", "inference latency", "cost", "token cost", "computational cost", "延遲", "成本"],
  },
  {
    id: "reasoning_understanding",
    topicPattern: /reasoning|understanding|comprehension|推理|理解/iu,
    terms: ["reasoning", "cross-lingual reasoning", "understanding", "language understanding", "comprehension", "question answering", "推理", "理解"],
    conflictingTerms: ["named entity recognition", "NER", "relation extraction", "information extraction", "safety refusal classification", "text classification"],
  },
  {
    id: "employment",
    topicPattern: /employment|labor supply|labour supply|job|就業|勞動供給/iu,
    terms: ["employment", "teenage employment", "youth employment", "young worker employment", "labor supply", "labour supply", "employment rate", "就業", "青年就業", "勞動供給"],
  },
  {
    id: "human_health_outcome",
    topicPattern: /human health|health outcome|disease|clinical|人類健康|健康結果|疾病/iu,
    terms: ["human health", "health outcome", "health outcomes", "human disease", "clinical outcome", "clinical outcomes", "epidemiological risk", "人類健康", "健康結果", "疾病"],
  },
  {
    id: "blood_pressure",
    topicPattern: /血壓|收縮壓|舒張壓|高血壓|blood pressure|systolic|diastolic|hypertension|\bSBP\b|\bDBP\b/iu,
    terms: ["血壓", "收縮壓", "舒張壓", "高血壓", "blood pressure", "systolic blood pressure", "diastolic blood pressure", "hypertension", "ambulatory blood pressure", "SBP", "DBP", "mean arterial pressure"],
  },
  {
    id: "sleep",
    topicPattern: /睡眠|sleep duration|sleep quality|sleep time|insomnia/iu,
    terms: ["睡眠時長", "睡眠品質", "睡眠時間", "睡眠問題", "睡眠障礙", "失眠", "sleep duration", "sleep quality", "sleep time", "sleep problems", "sleep disturbance", "insomnia", "bedtime", "daytime sleepiness"],
  },
  {
    id: "writing_learning",
    topicPattern: /寫作(?:學習|能力|成效|表現|教學)|writing (?:learning|skill|skills|ability|abilities|achievement|performance|instruction|education)|essay writing|collaborative writing/iu,
    terms: [
      "寫作學習",
      "寫作能力",
      "寫作成效",
      "寫作表現",
      "寫作教學",
      "修訂品質",
      "論證",
      "組織與連貫",
      "語言正確性",
      "寫作自我效能",
      "寫作批判思考",
      "寫作回饋",
      "寫作依賴",
      "學術誠信",
      "作者身分",
      "writing learning",
      "writing skill",
      "writing skills",
      "writing ability",
      "writing abilities",
      "writing achievement",
      "writing performance",
      "writing instruction",
      "writing education",
      "essay writing",
      "collaborative writing",
      "writing feedback",
      "writing revision",
      "revision performance",
      "argumentative writing",
      "writing fluency",
      "writing structure",
      "writing organization",
      "critical engagement",
      "over-reliance",
      "overreliance",
      "academic integrity",
      "authorship",
      "writing work",
      "writing process",
    ],
  },
];

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function isolationFingerprint(value: string | null | undefined): string {
  return compact(value).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function declaredMethodConcepts(methodText: string): string[] {
  const match = compact(methodText).match(/(?:關鍵概念包含|关键概念包含|key concepts? (?:included?|were))([^.;。；]+)/iu);
  if (!match?.[1]) return [];
  return unique(match[1]
    .split(/[,，、]|以及|及|與|与|\band\b/iu)
    .map((item) => compact(item))
    .filter((item) => item.length >= 2));
}

export function validateTopicIsolation(input: {
  stage: TopicIsolationValidation["stage"];
  workflowId: string;
  reportId?: string | null;
  topicHash: string;
  researchQuestion: string;
  searchQueries?: string[];
  queryTerms?: string[];
  methodText?: string;
  records: TopicIsolationRecord[];
}): TopicIsolationValidation {
  const workflowId = compact(input.workflowId);
  const reportId = compact(input.reportId) || workflowId;
  const topicHash = compact(input.topicHash);
  const topic = compact(input.researchQuestion);
  const foreignWorkflowIds = unique(input.records
    .map((record) => compact(record.workflowId))
    .filter((value) => value && value !== workflowId));
  const foreignReportIds = unique(input.records
    .map((record) => compact(record.reportId))
    .filter((value) => value && value !== reportId));
  const foreignTopicHashes = unique(input.records
    .map((record) => compact(record.topicHash))
    .filter((value) => value && value !== topicHash));
  const topicFingerprint = isolationFingerprint(topic);
  const foreignTopics = unique(input.records
    .filter((record) => {
      const value = compact(record.topic);
      if (!value || isolationFingerprint(value) === topicFingerprint) return false;
      const recordWorkflowId = compact(record.workflowId);
      const recordTopicHash = compact(record.topicHash);
      const matchingLineage =
        (!recordWorkflowId || recordWorkflowId === workflowId) &&
        (!recordTopicHash || recordTopicHash === topicHash) &&
        Boolean(recordWorkflowId || recordTopicHash);
      return !matchingLineage;
    })
    .map((record) => compact(record.topic)));
  const planCorpus = isolationFingerprint([
    topic,
    ...(input.searchQueries ?? []),
    ...(input.queryTerms ?? []),
  ].join(" "));
  const foreignMethodConcepts = declaredMethodConcepts(input.methodText ?? "")
    .filter((concept) => !planCorpus.includes(isolationFingerprint(concept)));
  const issues = unique([
    ...foreignWorkflowIds.map((value) => `foreign_workflow_id:${value}`),
    ...foreignReportIds.map((value) => `foreign_report_id:${value}`),
    ...foreignTopicHashes.map((value) => `foreign_topic_hash:${value}`),
    ...foreignTopics.map((value) => `foreign_topic:${value}`),
    ...foreignMethodConcepts.map((value) => `method_concept_not_derivable_from_search_plan:${value}`),
  ]);
  return {
    pass: issues.length === 0,
    code: issues.length === 0 ? "PASS" : "TOPIC_ISOLATION_FAILED",
    stage: input.stage,
    workflowId,
    reportId,
    foreignWorkflowIds,
    foreignReportIds,
    foreignTopicHashes,
    foreignTopics,
    foreignMethodConcepts,
    issues,
  };
}

function compact(value: string | null | undefined): string {
  return (value ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function termMatches(text: string, term: string): boolean {
  const normalizedText = text.toLocaleLowerCase();
  const normalizedTerm = compact(term).toLocaleLowerCase();
  if (!normalizedTerm) return false;
  if (/^[a-z0-9][a-z0-9\s≥.-]*$/iu.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm).replace(/\\\s\+/gu, "\\s+")}($|[^a-z0-9])`, "iu").test(normalizedText);
  }
  return normalizedText.includes(normalizedTerm);
}

function matched(text: string, terms: string[]): string[] {
  return unique(terms.filter((term) => termMatches(text, term)));
}

function positivelyMatched(text: string, terms: string[]): string[] {
  const lower = text.toLocaleLowerCase();
  return matched(text, terms).filter((term) => {
    const normalized = term.toLocaleLowerCase();
    const index = lower.indexOf(normalized);
    if (index < 0) return false;
    const prefix = lower.slice(Math.max(0, index - 55), index);
    return !/(?:without|excluding|did not|not|no)\s+(?:an?\s+)?$|(?:without|did not|not|no)\s+(?:(?:explicitly|directly)\s+)?(?:measur\w*|assess\w*|includ\w*|measurement of)\s*$|(?:未測量|未評估|未納入|不包含)\s*$/iu.test(prefix);
  });
}

function genericTopicTerms(topic: string): string[] {
  const stop = new Set([
    "effect", "effects", "impact", "association", "relationship", "research",
    "study", "report", "influence", "影響", "關聯", "關係", "研究", "報告",
  ]);
  const latin = compact(topic)
    .toLocaleLowerCase()
    .match(/[a-z][a-z0-9-]{3,}/gu) ?? [];
  const cjkRuns = compact(topic).match(/[\u3400-\u9fff]{2,}/gu) ?? [];
  const cjk = cjkRuns.flatMap((run) => [
    run,
    ...run
      .split(/(?:的|之|與|和|及|對|於|在|為|以|是否)/u)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  ]);
  return unique([...latin, ...cjk]).filter((term) => !stop.has(term));
}

function familyForTopic(topic: string, families: FacetFamily[]): FacetFamily | undefined {
  return families.find((family) => family.topicPattern.test(topic));
}

function familiesForTopic(topic: string, families: FacetFamily[]): FacetFamily[] {
  return families.filter((family) => family.topicPattern.test(topic));
}

function evidenceSpecies(text: string): EvidenceSpecies {
  const animal = /\b(?:mice|mouse|murine|rats?|rodents?|zebrafish|rabbits?|animals?)\b|小鼠|大鼠|動物實驗|动物实验/iu.test(text);
  const inVitro = /in[ -]vitro|cell culture|cell line|體外|細胞培養/iu.test(text);
  const human = /\b(?:human|people|persons?|participants?|patients?|children|adolescents?|teenage|teenagers?|youth|adults?|workers?|students?)\b|人類|受試者|病人|兒童|青少年|成人|青年/iu.test(text);
  if (human && (animal || inVitro)) return "MIXED";
  if (human) return "HUMAN";
  if (animal) return "ANIMAL";
  if (inVitro) return "IN_VITRO";
  return "UNKNOWN";
}

function observedOutcomePurpose(text: string): EvidenceDirectnessProfile["studyPurpose"] {
  const protocol = /\bprotocol\b|study protocol|trial protocol|planned (?:trial|study|analysis)|研究方案|試驗方案/iu.test(text);
  const result = /\bresults?\b|findings?|observed|reported|was associated|were associated|significant|effect size|confidence interval|\bp\s*[=<>]|結果|發現|觀察到|顯著|信賴區間/iu.test(text);
  if (protocol && !result) return "METHODS_ONLY";
  if (result) return "OBSERVED_OUTCOME";
  if (/mechanis|toxicolog|biological plausibility|機制|毒理/iu.test(text)) return "MECHANISTIC";
  return "UNKNOWN";
}

function headToHeadRequired(topic: string): boolean {
  return /\b(?:vs\.?|versus)\b|compared? (?:with|to)|head[- ]to[- ]head|相較於|相較于|比較|對照/iu.test(topic);
}

function comparisonParts(topic: string): {
  intervention: string;
  comparator: string;
  outcome: string;
} | null {
  const en = compact(topic).match(
    /^(.+?)\s+(?:versus|vs\.?)\s+(.+?)(?::|,|\s+with\s+)(?:\s*(?:effects?\s+on|for)\s*)?(.+)$/iu,
  );
  if (en) {
    return {
      intervention: compact(en[1]),
      comparator: compact(en[2]),
      outcome: compact(en[3]).replace(/^(?:effects?\s+on|for)\s+/iu, ""),
    };
  }
  const zh = compact(topic).match(
    /^(.+?)(?:相較於|相較于|對|与|與|vs\.?)(.+?)(?:對|在)(.+?)(?:的)?(?:影響|效果|比較)$/iu,
  );
  return zh
    ? { intervention: compact(zh[1]), comparator: compact(zh[2]), outcome: compact(zh[3]) }
    : null;
}

function fallbackExposurePhrase(topic: string): string | null {
  const normalized = compact(topic);
  const beforeAnd = normalized.match(/^(.{2,80}?)\s+(?:and|associated with)\s+/iu)?.[1];
  if (beforeAnd) return compact(beforeAnd);
  const beforeColon = normalized.match(/^(.{2,80}?):/u)?.[1];
  return beforeColon ? compact(beforeColon) : null;
}

export function buildEvidenceDirectnessProfile(input: {
  canonicalTopic: string;
  researchQuestion?: string | null;
}): EvidenceDirectnessProfile {
  const canonicalTopic = compact(input.canonicalTopic);
  const researchQuestion = compact(input.researchQuestion);
  const topic = canonicalTopic === researchQuestion || !researchQuestion
    ? canonicalTopic
    : compact(`${canonicalTopic} ${researchQuestion}`);
  const populations = familiesForTopic(topic, POPULATION_FAMILIES);
  const exposures = familiesForTopic(topic, EXPOSURE_FAMILIES);
  const outcomes = familiesForTopic(topic, OUTCOME_FAMILIES);
  const comparison = comparisonParts(topic);
  const requiresHeadToHeadComparison = headToHeadRequired(topic) && Boolean(exposures.length >= 2 || comparison);
  const requiresHumanPopulation =
    evidenceSpecies(topic) === "HUMAN" ||
    /human health|clinical|epidemiolog|人類健康|公共衛生|公共卫生/iu.test(topic) ||
    populations.some((population) => ["adolescents", "children", "adults"].includes(population.id));
  const fallbackParts = relationshipParts(input.researchQuestion ?? "") ?? relationshipParts(input.canonicalTopic);
  const intervention = exposures[0]
    ? facet(exposures[0].id, exposures[0].terms)
    : comparison?.intervention
      ? facet(comparison.intervention, [comparison.intervention])
      : fallbackParts?.exposure
        ? facet(fallbackParts.exposure, [fallbackParts.exposure])
        : fallbackExposurePhrase(topic)
          ? facet(fallbackExposurePhrase(topic)!, [fallbackExposurePhrase(topic)!])
          : facet("not_explicitly_specified", []);
  const comparator = requiresHeadToHeadComparison
    ? exposures[1]
      ? facet(exposures[1].id, exposures[1].terms)
      : comparison?.comparator
        ? facet(comparison.comparator, [comparison.comparator])
        : null
    : null;
  return {
    population: facet(
      populations.length > 0
        ? populations.map((population) => population.id).join("_and_")
        : "not_explicitly_specified",
      populations.flatMap((population) => population.terms),
    ),
    interventionOrExposure: intervention,
    comparator,
    outcomes: outcomes.length
      ? outcomes.map((outcome) => facet(outcome.id, outcome.terms))
      : comparison?.outcome
        ? [facet(comparison.outcome, [comparison.outcome])]
      : fallbackParts?.outcome
        ? [facet(fallbackParts.outcome, [fallbackParts.outcome])]
        : [],
    studyPurpose: "OBSERVED_OUTCOME",
    studyDesign: [],
    species: requiresHumanPopulation ? "HUMAN" : "UNKNOWN",
    timeframe: unique(topic.match(/\b\d+\s*(?:days?|weeks?|months?|years?)\b|長期|短期/giu) ?? []),
    metric: unique(outcomes.flatMap((outcome) => outcome.terms)),
    requiresHeadToHeadComparison,
    requiresHumanPopulation,
  };
}

function relationshipParts(topic: string): { exposure: string; outcome: string } | null {
  const zh = topic.match(/^(?:.*?)([^，。；]{2,40}?)(?:對|與)([^，。；]{2,40}?)(?:的影響|之影響|的關聯|之關聯|的關係|之關係)$/u);
  if (zh) return { exposure: compact(zh[1]), outcome: compact(zh[2]) };
  const en = topic.match(/(?:effect|impact|association|relationship)\s+of\s+(.+?)\s+(?:on|with)\s+(.+)$/iu) ??
    topic.match(/association\s+(?:between|of)\s+(.+?)\s+and\s+(.+)$/iu);
  return en ? { exposure: compact(en[1]), outcome: compact(en[2]) } : null;
}

function facet(label: string, terms: string[]): { label: string; terms: string[] } {
  return { label, terms: unique(terms) };
}

export function buildTopicIntegrityContract(input: {
  canonicalTopic: string;
  researchQuestion?: string | null;
  domain?: string | null;
  allowedAdjacentConcepts?: string[];
  excludedConcepts?: string[];
}): TopicIntegrityContract {
  const canonicalTopic = compact(input.canonicalTopic);
  const researchQuestion = compact(input.researchQuestion) || canonicalTopic;
  const topicText = `${canonicalTopic} ${researchQuestion}`;
  const directnessProfile = buildEvidenceDirectnessProfile({
    canonicalTopic,
    researchQuestion,
  });
  const population = familyForTopic(topicText, POPULATION_FAMILIES);
  const exposure = EXPOSURE_FAMILIES.find(
    (family) => family.id === directnessProfile.interventionOrExposure.label,
  );
  const outcomes = familiesForTopic(topicText, OUTCOME_FAMILIES);
  const primaryOutcomes = directnessProfile.outcomes;
  const interventionExposure = exposure
    ? facet(
        exposure.id,
        exposure.id === "exercise_training" && /有氧|aerobic|endurance|cardio/iu.test(topicText)
          ? AEROBIC_EXPOSURE_TERMS
          : exposure.terms,
      )
    : directnessProfile.interventionOrExposure;
  const allowedAdjacentConcepts = unique([
    ...(input.allowedAdjacentConcepts ?? []),
    population?.id === "adults" ? "adult cardiovascular context" : null,
    population?.id === "adolescents" ? "adolescent behavioral and educational context" : null,
    exposure?.id === "exercise_training" ? "exercise modality, dose, adherence, and safety" : null,
    exposure?.id === "screen_exposure" ? "device type, timing, content, and usage context" : null,
    exposure?.id === "generative_ai" ? "model, task, prompting, teacher guidance, authorship, and academic-integrity context" : null,
    outcomes.some((outcome) => outcome.id === "blood_pressure") ? "cardiovascular risk and blood-pressure measurement context" : null,
    outcomes.some((outcome) => outcome.id === "sleep") ? "circadian timing and sleep measurement context" : null,
    outcomes.some((outcome) => outcome.id === "writing_learning") ? "writing process, feedback, revision, literacy, authorship, and learning-assessment context" : null,
  ]);
  const excludedConcepts = unique([
    ...(input.excludedConcepts ?? []),
    outcomes.length ? `sources whose principal reported outcome is not one of ${outcomes.map((outcome) => outcome.id).join(",")}` : null,
    exposure ? `sources without the ${exposure.id} exposure or intervention relationship` : null,
    "lexical similarity without a planned-claim relationship",
    "broad wellness relevance without a primary-outcome result",
  ]);
  return TopicIntegrityContractSchema.parse({
    schemaVersion: TOPIC_INTEGRITY_VERSION,
    policyVersion: RELEVANCE_POLICY_VERSION,
    canonicalTopic,
    researchQuestion,
    targetPopulation: directnessProfile.population,
    interventionExposure,
    comparator: directnessProfile.comparator,
    primaryOutcomes,
    secondaryOutcomes: [],
    domain: compact(input.domain) || "unknown",
    allowedAdjacentConcepts,
    excludedConcepts,
    minimumDirectnessRequirement: "DIRECT",
    requiredEvidenceRelationship: {
      requiredFacets: unique([
        population ? "population" : null,
        interventionExposure.terms.length ? "intervention_or_exposure" : null,
        primaryOutcomes.length ? "primary_outcome" : null,
      ]),
      populationPolicy: population
        ? "EXPLICIT_MATCH_REQUIRED"
        : "MATCH_OR_UNSPECIFIED_WITHOUT_CONFLICT",
      outcomePolicy: "PRIMARY_OUTCOME_MUST_BE_A_REPORTED_RESULT",
      semanticSimilarityPolicy: "CANDIDATE_SIGNAL_ONLY",
    },
  });
}

function reportsDirectRelationship(
  title: string,
  abstract: string,
  exposureTerms: string[],
  outcomeTerms: string[],
): boolean {
  const relationshipCue = /effect|impact|association|relationship|associated|related|predict|correl|link|reduc|decreas|lower|increase|higher|improv|change|result|finding|conclusion|primary outcome|compar|versus|\bvs\.?\b|difference|影響|關聯|關係|相關|預測|降低|升高|增加|改善|改變|結果|結論|主要結果|顯著|無顯著|比較|差異/iu;
  const abstractSentences = abstract
    .split(/(?<=[.!?。！？；;])\s*/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const adjacentSentenceWindows = abstractSentences
    .slice(0, -1)
    .map((sentence, index) => `${sentence} ${abstractSentences[index + 1]}`);
  const sentences = [
    title,
    ...(title && abstractSentences[0] ? [`${title} ${abstractSentences[0]}`] : []),
    ...abstractSentences,
    ...adjacentSentenceWindows,
  ];
  for (const sentence of sentences) {
    if (
      positivelyMatched(sentence, exposureTerms).length === 0 ||
      matched(sentence, outcomeTerms).length === 0 ||
      !relationshipCue.test(sentence)
    ) continue;
    const terminalTarget =
      sentence.match(/(?:association|relationship|associated|related)\s+(?:of\s+.+?\s+)?(?:with|to)\s+(.+)$/iu)?.[1] ??
      sentence.match(/(?:association|relationship)\s+between\s+.+?\s+(?:and|with)\s+(.+)$/iu)?.[1];
    if (terminalTarget && matched(terminalTarget, outcomeTerms).length === 0) continue;
    return true;
  }
  return false;
}

function semanticScore(source: TopicIntegritySource): number {
  const raw = source.finalScore ?? source.relevanceScore ?? 0;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
}

export function assessSourceTopicIntegrity(
  source: TopicIntegritySource,
  contract: TopicIntegrityContract,
): TopicIntegrityAssessment {
  const sourceId = compact(source.sourceId ?? source.id) || "unknown-source";
  const title = compact(source.title);
  const abstract = compact(source.abstract ?? source.abstractOriginal ?? source.extractedAbstract ?? source.snippet);
  const fields = {
    title,
    abstract,
    keywords: compact([...(source.keywords ?? []), ...(source.meshTerms ?? []), ...(source.subjectTerms ?? [])].join(" ")),
    venue: compact(source.venue ?? source.containerTitle),
    sourceType: compact(source.sourceType),
  };
  const metadataText = Object.values(fields).join(" ");
  const directnessProfile = buildEvidenceDirectnessProfile({
    canonicalTopic: contract.canonicalTopic,
    researchQuestion: contract.researchQuestion,
  });
  const sourceSpecies = evidenceSpecies(metadataText);
  const studyPurpose = observedOutcomePurpose(metadataText);
  const populationMatches = matched(metadataText, contract.targetPopulation.terms);
  const exposureMatches = positivelyMatched(metadataText, contract.interventionExposure.terms);
  const comparatorMatches = positivelyMatched(metadataText, contract.comparator?.terms ?? []);
  const outcomeTerms = contract.primaryOutcomes.flatMap((item) => item.terms);
  const primaryOutcomeMatches = matched(metadataText, outcomeTerms);
  const genericMatches = matched(
    metadataText,
    genericTopicTerms(`${contract.canonicalTopic} ${contract.researchQuestion}`),
  );
  const targetPopulationFamilies = POPULATION_FAMILIES.filter((family) =>
    contract.targetPopulation.label.split("_and_").includes(family.id),
  );
  const populationConflicts = matched(
    metadataText,
    targetPopulationFamilies.flatMap((family) => family.conflictingTerms ?? []),
  );
  const populationMatch = populationConflicts.length > 0 && populationMatches.length === 0
    ? "mismatch"
    : populationMatches.length > 0
      ? "match"
      : "unspecified";
  const exposureFamily = EXPOSURE_FAMILIES.find(
    (family) => family.id === contract.interventionExposure.label,
  );
  const exposureConflicts = matched(metadataText, exposureFamily?.conflictingTerms ?? []);
  const outcomeConflicts = contract.primaryOutcomes.flatMap((item) => {
    const family = OUTCOME_FAMILIES.find((candidate) => candidate.id === item.label);
    return matched(metadataText, family?.conflictingTerms ?? []);
  });
  const speciesMatch = !directnessProfile.requiresHumanPopulation ||
    sourceSpecies === "HUMAN" || sourceSpecies === "MIXED";
  const comparatorMatch = !directnessProfile.requiresHeadToHeadComparison || comparatorMatches.length > 0;
  const methodsOnly = studyPurpose === "METHODS_ONLY";
  const knownStructuredContract =
    contract.interventionExposure.terms.length > 0 || outcomeTerms.length > 0;
  const primaryOutcomeProminent = outcomeTerms.length === 0
    ? genericMatches.length > 0
    : reportsDirectRelationship(
        title,
        abstract,
        contract.interventionExposure.terms,
        outcomeTerms,
      );
  const exposureMatch = contract.interventionExposure.terms.length === 0 ||
    (exposureMatches.length > 0 && exposureConflicts.length === 0);
  const outcomeMatch = outcomeTerms.length === 0 ||
    (primaryOutcomeMatches.length > 0 && outcomeConflicts.length === 0);
  const populationPermitted = contract.requiredEvidenceRelationship.populationPolicy === "EXPLICIT_MATCH_REQUIRED"
    ? populationMatch === "match"
    : populationMatch !== "mismatch";
  const direct = knownStructuredContract
    ? exposureMatch && outcomeMatch && primaryOutcomeProminent && populationPermitted &&
      comparatorMatch && speciesMatch && !methodsOnly
    : genericMatches.length > 0 && populationPermitted && comparatorMatch && speciesMatch && !methodsOnly;
  const topicalFacetCount = [populationMatches.length > 0, exposureMatches.length > 0, primaryOutcomeMatches.length > 0, genericMatches.length > 0].filter(Boolean).length;
  const contextual =
    !direct &&
    populationPermitted &&
    exposureMatch &&
    comparatorMatch &&
    outcomeMatch &&
    primaryOutcomeMatches.length > 0 &&
    topicalFacetCount >= 1;
  const methodContext = !direct && (
    methodsOnly ||
    /search strategy|literature review method|research method|檢索策略|文獻回顧方法|研究方法/iu.test(metadataText)
  ) && topicalFacetCount >= 1;
  const limitationContext = !direct && /limitation|research gap|evidence gap|限制|研究缺口|證據缺口/iu.test(metadataText) && topicalFacetCount >= 1;
  const hardReasons = unique([
    populationMatch === "mismatch" ? "population_mismatch" : null,
    populationMatch === "unspecified" &&
    contract.requiredEvidenceRelationship.populationPolicy === "EXPLICIT_MATCH_REQUIRED"
      ? "required_population_not_established"
      : null,
    knownStructuredContract && contract.interventionExposure.terms.length > 0 && !exposureMatch ? "intervention_or_exposure_mismatch" : null,
    exposureConflicts.length > 0 ? `exposure_conflict:${exposureConflicts.join(",")}` : null,
    knownStructuredContract && outcomeTerms.length > 0 && !outcomeMatch ? "outcome_mismatch" : null,
    outcomeConflicts.length > 0 ? `metric_or_task_mismatch:${outcomeConflicts.join(",")}` : null,
    knownStructuredContract && outcomeMatch && !primaryOutcomeProminent ? "primary_outcome_not_a_reported_result" : null,
    directnessProfile.requiresHeadToHeadComparison && !comparatorMatch ? "comparator_mismatch" : null,
    !speciesMatch && (sourceSpecies === "ANIMAL" || sourceSpecies === "IN_VITRO")
      ? "ANIMAL_CANNOT_OWN_HUMAN_OUTCOME_CLAIM"
      : !speciesMatch
        ? `species_mismatch:${sourceSpecies}`
        : null,
    methodsOnly ? "PROTOCOL_CANNOT_SUPPORT_OBSERVED_OUTCOME" : null,
    topicalFacetCount === 0 ? "topic_mismatch" : null,
  ]);
  const sourceRole: FormalEvidenceRole = direct
    ? "DIRECT_FINDING"
    : methodContext
      ? "METHOD_CONTEXT"
      : limitationContext
        ? "LIMITATION_CONTEXT"
        : contextual || (!speciesMatch && exposureMatch && outcomeMatch)
          ? "CONTEXTUAL_BACKGROUND"
          : "REJECTED_OFF_TOPIC";
  const excluded = sourceRole === "REJECTED_OFF_TOPIC";
  const acceptedForCanonicalEvidence = sourceRole === "DIRECT_FINDING";
  const relationship = direct ? "direct" : contextual || (!speciesMatch && exposureMatch && outcomeMatch) ? "contextual" : topicalFacetCount > 0 ? "indirect" : "none";
  const matchedFields = Object.entries(fields)
    .filter(([, value]) => matched(value, unique([...contract.targetPopulation.terms, ...contract.interventionExposure.terms, ...outcomeTerms])).length > 0)
    .map(([field]) => field);
  const acceptanceReason = excluded
    ? null
    : direct
      ? "source directly matches the required population/species, exposure or intervention, comparator when required, and reported primary outcome"
      : "source is topically adjacent but is restricted from supporting principal findings";
  const rejectionReason = excluded ? hardReasons.join(";") || "no_planned_claim_relationship" : null;
  const allowedSections = sourceRole === "DIRECT_FINDING"
    ? ["executive_summary", "background", "evidence_overview", "literature_review", "findings", "cross_study_synthesis", "discussion", "limitations", "conclusion"]
    : sourceRole === "METHOD_CONTEXT"
      ? ["methods"]
      : sourceRole === "LIMITATION_CONTEXT"
        ? ["limitations"]
        : sourceRole === "CONTEXTUAL_BACKGROUND"
          ? ["background", "literature_review"]
          : [];
  return TopicIntegrityAssessmentSchema.parse({
    topicIntegrityVersion: TOPIC_INTEGRITY_VERSION,
    relevancePolicyVersion: RELEVANCE_POLICY_VERSION,
    sourceId,
    metadataRelevance: {
      passed: direct || contextual || methodContext || limitationContext,
      matchedFields,
      populationMatches,
      interventionExposureMatches: exposureMatches,
      primaryOutcomeMatches,
      primaryOutcomeProminent,
    },
    semanticRelevance: { score: semanticScore(source), policy: "CANDIDATE_SIGNAL_ONLY" },
    evidenceEntailment: {
      supportedTopicFacet: unique([
        ...populationMatches.map(() => "population"),
        ...exposureMatches.map(() => "intervention_or_exposure"),
        ...primaryOutcomeMatches.map(() => "primary_outcome"),
      ]),
      populationMatch,
      interventionExposureMatch: exposureMatch,
      outcomeMatch,
      relationship,
      acceptanceReason,
      rejectionReason,
    },
    hardExclusion: { excluded, reasons: hardReasons },
    sourceRole,
    acceptedForCanonicalEvidence,
    allowedSections,
    topicIntegrityReason: acceptanceReason ?? rejectionReason ?? "no_planned_claim_relationship",
  });
}

/**
 * Mandatory second pass before an eligible corpus may be labelled
 * insufficient.  The result is explanatory: callers must block a false
 * insufficient export when any reconciled item is DIRECT_FINDING.
 */
export function reconcilePotentialDirectEvidence(input: {
  sources: TopicIntegritySource[];
  contract: TopicIntegrityContract;
}): {
  items: DirectEvidenceReconciliationItem[];
  directSourceIds: string[];
  falseInsufficient: boolean;
  code: "PASS_GENUINELY_INSUFFICIENT" | "BLOCK_EXPORT_FALSE_INSUFFICIENT";
} {
  const items = input.sources.map((source) => {
    const assessment = assessSourceTopicIntegrity(source, input.contract);
    const failedDimensions = [...assessment.hardExclusion.reasons];
    const whyDirect = assessment.sourceRole === "DIRECT_FINDING"
      ? [
          "population_or_species_match",
          "intervention_or_exposure_match",
          ...(input.contract.comparator ? ["comparator_match"] : []),
          "reported_primary_outcome_match",
        ]
      : [];
    const whyNotDirect = assessment.sourceRole === "DIRECT_FINDING"
      ? []
      : failedDimensions.length > 0
        ? failedDimensions
        : [assessment.topicIntegrityReason];
    return {
      sourceId: compact(source.sourceId ?? source.id) || "unknown-source",
      title: compact(source.title),
      role: assessment.sourceRole,
      whyDirect,
      whyNotDirect,
      failedDimensions,
      assessment,
    } satisfies DirectEvidenceReconciliationItem;
  });
  const directSourceIds = items
    .filter((item) => item.role === "DIRECT_FINDING")
    .map((item) => item.sourceId);
  return {
    items,
    directSourceIds,
    falseInsufficient: directSourceIds.length > 0,
    code: directSourceIds.length > 0
      ? "BLOCK_EXPORT_FALSE_INSUFFICIENT"
      : "PASS_GENUINELY_INSUFFICIENT",
  };
}

export function evidenceRoleForText(input: {
  text: string;
  sourceAssessment: TopicIntegrityAssessment;
  contract: TopicIntegrityContract;
}): { role: FormalEvidenceRole; allowedSections: string[]; reason: string } {
  if (input.sourceAssessment.sourceRole === "REJECTED_OFF_TOPIC") {
    return { role: "REJECTED_OFF_TOPIC", allowedSections: [], reason: input.sourceAssessment.topicIntegrityReason };
  }
  const outcomeTerms = input.contract.primaryOutcomes.flatMap((item) => item.terms);
  const normalizedText = compact(input.text);
  const protocolCue = /\bprotocol\b|study protocol|trial protocol|研究方案|試驗方案/iu.test(normalizedText);
  const methodCue = /(?:method|methods|methodology|design|randomi[sz]ed|recruit|participant|eligib|inclusion|exclusion|procedure|database|search|screen|方法|設計|设计|招募|納入|排除|程序|資料庫|数据库|檢索|检索|篩選|筛选)/iu.test(normalizedText);
  const observedResultCue = /\bresults?\b|findings?|observed|reported|was associated|were associated|significant|effect size|confidence interval|\bp\s*[=<>]|reduc|decreas|lower|increase|higher|improv|change|結果|發現|觀察到|顯著|信賴區間|降低|增加|改善|改變/iu.test(normalizedText);
  const limitationCue = /(?:limitation|bias|confound|uncertain|heterogeneity|generaliz|causal|self[- ]report|missing data|限制|偏差|偏誤|偏误|混雜|混杂|不確定|不确定|異質|异质|外推|因果)/iu.test(normalizedText);
  const outcomeMatches = matched(normalizedText, outcomeTerms);
  const knownStructuredContract =
    input.contract.interventionExposure.terms.length > 0 || outcomeTerms.length > 0;
  const genericMatches = matched(
    normalizedText,
    genericTopicTerms(`${input.contract.canonicalTopic} ${input.contract.researchQuestion}`),
  );
  // A protocol/method span may describe planned outcomes, but it never owns an
  // observed efficacy/effect claim.  Evaluate this before source-level directness.
  if (protocolCue || (methodCue && !observedResultCue)) {
    return {
      role: "METHOD_CONTEXT",
      allowedSections: ["methods"],
      reason: protocolCue
        ? "PROTOCOL_CANNOT_SUPPORT_OBSERVED_OUTCOME"
        : "evidence span describes study or retrieval methods and is restricted to the methods section",
    };
  }
  if (
    input.sourceAssessment.sourceRole === "DIRECT_FINDING" &&
    (outcomeTerms.length === 0 || outcomeMatches.length > 0 || (!knownStructuredContract && genericMatches.length > 0))
  ) {
    return {
      role: "DIRECT_FINDING",
      allowedSections: [...input.sourceAssessment.allowedSections],
      reason: `evidence span reports the primary outcome (${outcomeMatches.join(", ") || "generic direct relationship"})`,
    };
  }
  if (limitationCue) {
    return {
      role: "LIMITATION_CONTEXT",
      allowedSections: ["limitations"],
      reason: "evidence span states a limitation or uncertainty and is restricted to the limitations section",
    };
  }
  return {
    role: input.sourceAssessment.sourceRole === "METHOD_CONTEXT" || input.sourceAssessment.sourceRole === "LIMITATION_CONTEXT"
      ? input.sourceAssessment.sourceRole
      : "CONTEXTUAL_BACKGROUND",
    allowedSections: input.sourceAssessment.sourceRole === "METHOD_CONTEXT"
      ? ["methods"]
      : input.sourceAssessment.sourceRole === "LIMITATION_CONTEXT"
        ? ["limitations"]
        : ["background", "literature_review"],
    reason: "evidence span does not report the contract primary outcome and cannot support a principal finding",
  };
}
