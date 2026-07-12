import { z } from "zod";
import { understandTopic } from "./topic-understanding.ts";

export const InputTypeSchema = z.enum([
  "keyword",
  "question",
  "sentence",
  "paragraph",
  "url_or_citation",
  "invalid",
]);
export type InputType = z.infer<typeof InputTypeSchema>;

export const SafetyStatusSchema = z.enum([
  "allowed",
  "blocked",
  "needs_reframe",
]);
export type SafetyStatus = z.infer<typeof SafetyStatusSchema>;

export const SafetyCategorySchema = z.enum([
  "safe_academic",
  "illegal_drug_manufacturing",
  "weapon_or_explosive",
  "self_harm",
  "cyber_abuse",
  "medical_high_risk",
  "personal_data_abuse",
  "hate_or_harassment",
  "sexual_content",
  "unknown_risk",
  "other",
]);
export type SafetyCategory = z.infer<typeof SafetyCategorySchema>;

export const ResearchDomainSchema = z.enum([
  "natural_science",
  "biology",
  "chemistry",
  "physics",
  "earth_science",
  "medicine",
  "engineering",
  "computer_science",
  "social_science",
  "history",
  "culture",
  "literature",
  "education",
  "environment",
  "business",
  "law_policy",
  "unknown",
]);
export type ResearchDomain = z.infer<typeof ResearchDomainSchema>;

export const ResearchIntentSchema = z.enum([
  "explain_mechanism",
  "compare",
  "evaluate_impact",
  "historical_analysis",
  "cultural_analysis",
  "case_study",
  "experiment_design",
  "literature_review",
  "definition_overview",
  "cause_effect",
  "policy_analysis",
  "practical_application",
  "unknown",
]);
export type ResearchIntent = z.infer<typeof ResearchIntentSchema>;

export const NextActionSchema = z.enum([
  "search",
  "ask_clarification",
  "block",
  "show_topic_options",
]);
export type NextAction = z.infer<typeof NextActionSchema>;

export const ResearchTopicOptionSchema = z.object({
  label: z.string().trim().min(1),
  canonicalTopic: z.string().trim().min(1),
  researchQuestion: z.string().trim().min(1),
  domain: ResearchDomainSchema,
  researchIntent: ResearchIntentSchema,
});

export const ParsedResearchInputSchema = z.object({
  originalInput: z.string(),
  normalizedInput: z.string(),
  inputType: InputTypeSchema,
  language: z.enum(["zh-TW", "en", "mixed", "unknown"]),

  safetyStatus: SafetyStatusSchema,
  safetyCategory: SafetyCategorySchema,
  safetyReason: z.string(),
  safeAlternatives: z.array(z.string()),

  canonicalTopic: z.string(),
  displayTitle: z.string(),
  researchQuestion: z.string(),

  domain: ResearchDomainSchema,
  researchIntent: ResearchIntentSchema,

  coreEntities: z.array(z.string()),
  coreConcepts: z.array(z.string()),
  constraints: z.array(z.string()),

  mustIncludeTerms: z.array(z.string()),
  shouldIncludeTerms: z.array(z.string()),
  mustExcludeTerms: z.array(z.string()),

  ambiguityScore: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),

  topicOptions: z.array(ResearchTopicOptionSchema),

  queryPlan: z.object({
    zhQueries: z.array(z.string()),
    enQueries: z.array(z.string()),
    mustIncludeTerms: z.array(z.string()),
    shouldIncludeTerms: z.array(z.string()),
    mustExcludeTerms: z.array(z.string()),
    sourceTypes: z.array(
      z.enum([
        "paper",
        "book",
        "report",
        "encyclopedia",
        "news",
        "official",
        "dataset",
      ]),
    ),
  }),

  nextAction: NextActionSchema,

  debug: z
    .object({
      matchedRules: z.array(z.string()),
      notes: z.array(z.string()),
    })
    .optional(),
});
export type ParsedResearchInput = z.infer<typeof ParsedResearchInputSchema>;

export const SourceIntentDecisionSchema = z.enum([
  "accept",
  "supplementary",
  "reject",
]);
export type SourceIntentDecision = z.infer<typeof SourceIntentDecisionSchema>;

export const EvaluatedSourceAgainstIntentSchema = z.object({
  decision: SourceIntentDecisionSchema,
  score: z.number().min(0).max(1),
  matchedMustIncludeTerms: z.array(z.string()),
  matchedShouldIncludeTerms: z.array(z.string()),
  matchedCoreConcepts: z.array(z.string()),
  excludeHits: z.array(z.string()),
  reasons: z.array(z.string()),
});
export type EvaluatedSourceAgainstIntent = z.infer<
  typeof EvaluatedSourceAgainstIntentSchema
>;

type SourceLike = {
  title?: string | null;
  abstract?: string | null;
  snippet?: string | null;
  publisher?: string | null;
  containerTitle?: string | null;
  url?: string | null;
  doi?: string | null;
  sourceType?: string | null;
  sourceCategory?: string | null;
  keywords?: string[] | null;
};

type SafetyRule = {
  id: string;
  category: SafetyCategory;
  patterns: RegExp[];
  actionablePatterns?: RegExp[];
  academicAllowPatterns?: RegExp[];
  defaultStatus: SafetyStatus;
  reason: string;
  alternatives: string[];
};

const URL_OR_CITATION_PATTERNS = [
  /^https?:\/\/\S+$/i,
  /^doi:\s*10\.\d{4,9}\/\S+$/i,
  /^10\.\d{4,9}\/\S+$/i,
  /\b(19|20)\d{2}\b/,
];

const QUESTION_PATTERNS = [
  /[?？]\s*$/u,
  /^(what|why|how|when|where|which|who|can|does|should)\b/i,
  /^(什麼|為什麼|如何|怎麼|哪裡|哪個|誰|是否|可否|能否)/u,
  /(如何|怎麼).+(影響|形成|產生|生成|消化|吸收|運作|作用|轉化|變成|造成|改善|應用)/u,
];

const ACTIONABLE_PATTERNS = [
  /如何/u,
  /怎麼/u,
  /步驟/u,
  /教學/u,
  /配方/u,
  /製作/u,
  /製造/u,
  /提煉/u,
  /合成/u,
  /購買/u,
  /取得/u,
  /規避/u,
  /繞過/u,
  /入侵/u,
  /破解/u,
  /偷/u,
  /開鎖/u,
  /\bhow to\b/i,
  /\bsteps?\b/i,
  /\btutorial\b/i,
  /\bmake\b/i,
  /\bbuild\b/i,
  /\bsynthesize\b/i,
  /\bbypass\b/i,
  /\bhack\b/i,
  /\bsteal\b/i,
];

const ACADEMIC_CONTEXT_PATTERNS = [
  /影響/u,
  /關係/u,
  /比較/u,
  /機制/u,
  /原因/u,
  /文獻/u,
  /研究/u,
  /防治/u,
  /政策/u,
  /公共衛生/u,
  /法律/u,
  /教育/u,
  /歷史/u,
  /文化/u,
  /risk/i,
  /impact/i,
  /relationship/i,
  /comparison/i,
  /mechanism/i,
  /literature/i,
  /review/i,
  /policy/i,
  /prevention/i,
  /public health/i,
  /education/i,
  /history/i,
  /culture/i,
];

const INVALID_ONLY_PATTERNS = [
  /^[?？!！.。,，、;；:：'"`~\-_+=/\\|()[\]{}<>@#$%^&*]+$/u,
  /^[ㄅ-ㄩ\s\dA-Za-z_-]+$/u,
];

const DOMAIN_HINTS: Array<{
  domain: ResearchDomain;
  patterns: RegExp[];
}> = [
  {
    domain: "chemistry",
    patterns: [/化學|反應|酸鹼|氧化|還原|材料|合金|聚合|chemical|chemistry|reaction/i],
  },
  {
    domain: "biology",
    patterns: [
      /生物|細胞|基因|物種|生態互動|蛋白質|消化|吸收|胺基酸|肌肉|biology|genetic|species|organism|protein|digestion|amino acid|muscle/i,
      /牛奶|乳品|變質|腐敗|發酵|milk|spoilage|fermentation/i,
    ],
  },
  {
    domain: "physics",
    patterns: [/物理|電磁|光學|熱力|力學|physics|electromagnetic|optics|thermodynamics/i],
  },
  {
    domain: "earth_science",
    patterns: [/地質|火山|地震|礦物|國家公園|yellowstone|geology|volcanic|earth science/i],
  },
  {
    domain: "medicine",
    patterns: [/醫學|臨床|疾病|藥物|心率|症狀|medical|clinical|disease|health/i],
  },
  {
    domain: "engineering",
    patterns: [/工程|結構|太陽能|再生能源|用電|製程|感測|導航|engineering|structure|manufacturing|sensor|renewable energy/i],
  },
  {
    domain: "computer_science",
    patterns: [/演算法|人工智慧|網路安全|程式|資料庫|computer science|algorithm|software|cyber/i],
  },
  {
    domain: "social_science",
    patterns: [
      /社會|教育|校園|午餐|浪費|青少年|睡眠|犯罪|注意力|行為|社群|少子化|高齡化|老年|人口|social|education|policy|crime|fertility|aging|ageing|demographic|adolescent|sleep quality/i,
    ],
  },
  {
    domain: "history",
    patterns: [/歷史|朝代|考古|演變|history|historical|archaeology/i],
  },
  {
    domain: "culture",
    patterns: [/文化|夜市|神話|民俗|傳說|象徵|culture|night market|folklore|mythology/i],
  },
  {
    domain: "literature",
    patterns: [/文學|小說|詩|文本|敘事|literature|novel|poetry|textual/i],
  },
  {
    domain: "environment",
    patterns: [/環境|保育|氣候|污染|永續|都市熱島|熱島|降溫|environment|conservation|climate|sustainability|urban heat island/i],
  },
  {
    domain: "business",
    patterns: [/商業|市場|行銷|供應鏈|品牌|business|market|marketing|brand/i],
  },
  {
    domain: "law_policy",
    patterns: [/法律|法規|政策|治理|law|legal|regulation|policy/i],
  },
];

const SAFETY_RULES: SafetyRule[] = [
  {
    id: "drug-manufacturing",
    category: "illegal_drug_manufacturing",
    patterns: [/安非他命|methamphetamine|冰毒|毒品製造|drug manufacturing/i],
    actionablePatterns: ACTIONABLE_PATTERNS,
    academicAllowPatterns: ACADEMIC_CONTEXT_PATTERNS,
    defaultStatus: "blocked",
    reason: "這個主題涉及非法藥物製造或取得，不能進入搜尋或報告流程。",
    alternatives: [
      "安非他命濫用對公共衛生的影響",
      "安非他命成癮防治政策比較",
      "非法藥物製造案件的法律與社會風險",
    ],
  },
  {
    id: "weapon-explosive",
    category: "weapon_or_explosive",
    patterns: [/炸彈|爆裂物|爆炸物|槍枝改造|weapon|explosive|bomb/i],
    actionablePatterns: ACTIONABLE_PATTERNS,
    academicAllowPatterns: ACADEMIC_CONTEXT_PATTERNS,
    defaultStatus: "blocked",
    reason: "這個主題含有武器或爆炸物的可執行資訊風險，必須在搜尋前阻擋。",
    alternatives: [
      "爆炸物事故的公共安全與風險治理",
      "武器管制政策的歷史比較",
      "危險物質管理制度與校園安全教育",
    ],
  },
  {
    id: "self-harm",
    category: "self_harm",
    patterns: [/自殺|自傷|self harm|suicide/i],
    actionablePatterns: ACTIONABLE_PATTERNS,
    academicAllowPatterns: ACADEMIC_CONTEXT_PATTERNS,
    defaultStatus: "blocked",
    reason: "這個主題涉及自傷或自殺操作資訊，不能送入搜尋流程。",
    alternatives: [
      "青少年自殺防治政策與校園支持系統",
      "自傷風險因子與早期介入研究",
      "心理健康求助資源的可近性分析",
    ],
  },
  {
    id: "cyber-abuse",
    category: "cyber_abuse",
    patterns: [/入侵|釣魚|盜帳號|木馬|惡意程式|hack|phishing|credential theft|malware/i],
    actionablePatterns: ACTIONABLE_PATTERNS,
    academicAllowPatterns: ACADEMIC_CONTEXT_PATTERNS,
    defaultStatus: "blocked",
    reason: "這個主題包含網路濫用或入侵行為，不能進入搜尋。",
    alternatives: [
      "網路釣魚防禦策略與使用者教育",
      "資安事件應變流程的比較研究",
      "帳號保護機制與多因素驗證效果分析",
    ],
  },
  {
    id: "personal-data-abuse",
    category: "personal_data_abuse",
    patterns: [/個資外洩|跟蹤|追蹤某人|開盒|doxx|stalk|track someone|spy on/i],
    actionablePatterns: ACTIONABLE_PATTERNS,
    academicAllowPatterns: ACADEMIC_CONTEXT_PATTERNS,
    defaultStatus: "blocked",
    reason: "這個主題有個資濫用或跟蹤風險，不能進入搜尋。",
    alternatives: [
      "個人資料保護法規與平台責任比較",
      "數位跟蹤風險與防護措施研究",
      "隱私設計原則在社群平台的應用",
    ],
  },
  {
    id: "medical-high-risk",
    category: "medical_high_risk",
    patterns: [/自行用藥|偏方|治療自己|dosage|self medication|treat myself/i],
    actionablePatterns: ACTIONABLE_PATTERNS,
    academicAllowPatterns: ACADEMIC_CONTEXT_PATTERNS,
    defaultStatus: "needs_reframe",
    reason: "這個醫療主題需要改寫成機制、風險、臨床證據或政策角度，不能直接按原樣搜尋。",
    alternatives: [
      "某藥物的臨床機制與副作用文獻回顧",
      "自我用藥風險與公共衛生教育",
      "治療指引的證據等級比較",
    ],
  },
];

const DRIFT_TERM_RULES: Array<{
  when: RegExp;
  exclude: string[];
}> = [
  {
    when: /黃石國家公園|yellowstone/u,
    exclude: ["sea turtle", "marine turtle", "ocean conservation", "fundraising"],
  },
  {
    when: /烏龜|陸龜/u,
    exclude: ["sea turtle fundraising", "marine turtle", "donate", "募款"],
  },
];

const TRANSLATION_HINTS: Record<string, string[]> = {
  黃石國家公園: [
    "Yellowstone National Park",
    "Yellowstone geology",
    "Yellowstone ecosystem",
    "Yellowstone ecology",
  ],
  黃石: ["Yellowstone", "Yellowstone National Park"],
  牛奶: ["milk", "dairy"],
  變質: ["spoilage", "food spoilage"],
  牛奶變質速度: ["milk spoilage", "milk spoilage rate"],
  不同溫度: ["temperature", "different temperatures", "storage temperature"],
  咖啡因: ["caffeine"],
  心率: ["heart rate", "pulse rate"],
  心率變化: ["heart rate change", "heart rate response"],
  注意力: ["attention", "cognitive attention"],
  蛋白質: ["protein", "dietary protein"],
  蛋白質消化: ["protein digestion"],
  蛋白質攝取: ["protein intake", "dietary protein intake"],
  消化: ["digestion", "digestive process"],
  吸收: ["absorption", "nutrient absorption"],
  胺基酸: ["amino acids"],
  肌肉: ["muscle", "skeletal muscle"],
  肌肉增長: ["muscle growth", "muscle hypertrophy"],
  增長肌肉: ["muscle growth", "muscle hypertrophy"],
  肌肥大: ["muscle hypertrophy"],
  阻力訓練: ["resistance training"],
  白胺酸: ["leucine"],
  肌肉生成: ["muscle protein synthesis", "muscle growth"],
  肌肉蛋白質合成: ["muscle protein synthesis"],
  產生肌肉: ["muscle protein synthesis", "muscle growth"],
  轉化成肌肉: ["muscle protein synthesis", "amino acid metabolism"],
  茶葉: ["tea", "green tea"],
  茶: ["tea", "green tea"],
  茶多酚: ["tea polyphenols"],
  兒茶素: ["catechins"],
  器官健康: ["organ health"],
  器官: ["organ health"],
  肝臟: ["liver"],
  腎臟: ["kidney"],
  心血管: ["cardiovascular health"],
  代謝: ["metabolism"],
  神經系統: ["nervous system"],
  EGCG: ["EGCG"],
  少子化: ["low fertility", "declining birth rate", "fertility decline"],
  高齡化: ["population aging", "ageing society", "aging society"],
  高齡社會: ["aged society", "population aging"],
  應對方式: ["policy response", "countermeasures", "adaptation strategies"],
  因應策略: ["policy response", "adaptation strategies"],
  應用與限制: ["applications and limitations", "implementation barriers"],
  限制: ["limitations", "constraints", "barriers"],
  改善策略: ["improvement strategies", "intervention strategies"],
  降溫策略: ["cooling strategies", "heat mitigation strategies"],
  形成與變遷: ["formation and transformation", "historical change"],
  再生能源: ["renewable energy", "renewable power"],
  城市用電: ["urban electricity demand", "city power consumption"],
  都市熱島: ["urban heat island"],
  都市熱島效應: ["urban heat island effect"],
  熱島效應: ["urban heat island effect"],
  社群媒體: ["social media"],
  社群媒體使用: ["social media use"],
  青少年: ["adolescents", "teenagers"],
  睡眠品質: ["sleep quality"],
  青少年睡眠品質: ["adolescent sleep quality"],
  校園午餐: ["school lunch", "school meals"],
  午餐浪費: ["lunch waste", "plate waste"],
  校園午餐浪費: ["school lunch waste", "school food waste", "plate waste in schools"],
  食物浪費: ["food waste"],
  台灣夜市: ["Taiwan night market", "Taiwanese night markets"],
  夜市文化: ["night market culture", "Taiwan night market culture"],
  夜市: ["night market", "night markets"],
  遠距工作: ["remote work", "telework"],
  城市通勤: ["urban commuting", "commuting"],
  生活品質: ["quality of life"],
  高中生: ["high school students", "secondary school students"],
  學習方式: ["learning methods", "learning behavior"],
  塑膠微粒: ["microplastics"],
  海洋生態: ["marine ecosystem", "marine ecology"],
  AI: ["artificial intelligence", "AI"],
  人工智慧: ["artificial intelligence", "AI"],
  工作本質: ["nature of work", "work transformation"],
  勞動市場: ["labor market", "employment"],
  職務變遷: ["job transformation", "occupational change"],
  組織管理: ["organizational management", "workplace management"],
  農業廢料: ["agricultural waste", "agricultural residues", "farm waste"],
  農業廢棄物: ["agricultural waste", "agricultural residues", "farm waste"],
  農業污染: ["agricultural pollution", "agricultural runoff"],
  水質污染: ["water pollution", "water quality"],
  土壤污染: ["soil contamination", "soil pollution"],
  富營養化: ["eutrophication", "nutrient runoff"],
  鵝: ["goose", "geese"],
  烏龜: ["tortoise", "turtle"],
  陸龜: ["tortoise", "land turtle"],
  星星: ["stars", "stellar distance", "astronomy"],
  恆星: ["star", "stellar distance", "astronomy"],
  天文學: ["astronomy", "astronomy education"],
  天文: ["astronomy", "astronomy education"],
  恆星距離: ["stellar distance", "astronomical distance"],
  視差: ["parallax", "stellar parallax"],
  光年: ["light year", "astronomical distance"],
  博物館展示: ["museum exhibition", "informal science learning"],
  大眾理解: ["public understanding of science", "science communication"],
};

const PROMOTIONAL_DRIFT_TERMS = [
  "donate",
  "fundraising",
  "募款",
  "贊助",
  "shop now",
  "buy now",
];

const OFF_TOPIC_NEGATION_PATTERNS = [
  /unrelated to/i,
  /not related to/i,
  /irrelevant to/i,
  /無關/u,
  /不相關/u,
  /並非關於/u,
];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? compactWhitespace(value) : ""))
        .filter(Boolean),
    ),
  );
}

function containsZh(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function containsLatin(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function detectLanguage(value: string): ParsedResearchInput["language"] {
  const hasZh = containsZh(value);
  const hasLatin = containsLatin(value);
  if (hasZh && hasLatin) return "mixed";
  if (hasZh) return "zh-TW";
  if (hasLatin) return "en";
  return "unknown";
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[「」"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return uniqueStrings(
    value
      .split(/[\s,，、:：;；.。!?！？()（）[\]{}\/\\|<>\-_"'`]+/u)
      .map((token) => token.trim()),
  );
}

function isUrlOrCitation(value: string): boolean {
  return URL_OR_CITATION_PATTERNS.some((pattern) => pattern.test(value));
}

function detectInputType(value: string): InputType {
  if (!value) return "invalid";
  if (!/[A-Za-z0-9\u3400-\u9fff]/u.test(value)) return "invalid";
  if (isUrlOrCitation(value)) return "url_or_citation";
  const normalized = compactWhitespace(value);
  if (isProteinMuscleGrowthInput(normalized)) {
    return /如何|怎麼|how/i.test(normalized) ? "question" : "sentence";
  }
  if (isTeaOrganHealthInput(normalized)) return "sentence";
  const sentenceBreaks = (normalized.match(/[。！？.!?]/g) ?? []).length;
  const lines = normalized.split(/\n+/).filter(Boolean).length;
  const tokens = tokenize(normalized);
  if (QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) return "question";
  if (lines > 1 || sentenceBreaks >= 2 || normalized.length >= 110) return "paragraph";
  if (
    sentenceBreaks >= 1 ||
    /對.+的影響|與.+的關係|與.+的(?:應對|因應|策略|方式)|在.+中的.+|的.+與.+|如何.+(?:形成|產生|生成|消化|吸收|運作|作用|轉化|變成|造成|改善|應用)|怎麼.+(?:形成|產生|生成|消化|吸收|運作|作用|轉化|變成|造成|改善|應用)|比較|機制|原因|成因|探討|分析|應對方式|因應策略|解決方式|改善策略|降溫策略|應用與限制|形成與變遷|整理|總結|摘要|知識庫|現況|趨勢|effects? of|relationship between|compare|mechanism|analysis|summary|digest|knowledge base/i.test(
      normalized,
    )
  ) {
    return "sentence";
  }
  if (tokens.length <= 6) return "keyword";
  return "sentence";
}

function looksInvalidInput(value: string): boolean {
  if (!value) return true;
  if (INVALID_ONLY_PATTERNS.some((pattern) => pattern.test(value))) {
    return !containsZh(value) || /[ㄅ-ㄩ]/u.test(value);
  }
  const stripped = value.replace(/\s+/g, "");
  if (/^[A-Za-z0-9_-]+$/.test(stripped)) {
    const vowels = (stripped.match(/[aeiou]/gi) ?? []).length;
    if (stripped.length <= 2) return true;
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(stripped) && vowels <= 1) return true;
    if (/^\d+$/.test(stripped)) return true;
  }
  return false;
}

function deriveHintTerms(values: string[]): { zh: string[]; en: string[] } {
  const normalizedValues = uniqueStrings(values);
  const zhTerms: string[] = [];
  const enTerms: string[] = [];

  for (const candidate of normalizedValues) {
    for (const [key, hints] of Object.entries(TRANSLATION_HINTS)) {
      if (!candidate.includes(key) && !key.includes(candidate)) continue;
      zhTerms.push(key);
      enTerms.push(...hints);
    }
  }

  return {
    zh: uniqueStrings(zhTerms),
    en: uniqueStrings(enTerms),
  };
}

function detectDomain(value: string): ResearchDomain {
  const normalized = compactWhitespace(value);
  if (isTeaOrganHealthInput(normalized)) return "medicine";
  if (isProteinMuscleGrowthInput(normalized)) return "biology";
  if (isAgriculturalWastePollutionInput(normalized)) return "environment";
  if (isAstronomyScienceEducationInput(normalized)) return "physics";
  const understanding = understandTopic(normalized);
  const mappedTopicDomain: Record<string, ResearchDomain> = {
    biology: "biology",
    health: "medicine",
    environment: "environment",
    social_science: "social_science",
    history_culture: /歷史|朝代|考古|歷史比較|history/i.test(normalized)
      ? "history"
      : "culture",
    technology: /演算法|軟體|程式|資料庫|ai|人工智慧|algorithm|software|database/i.test(
      normalized,
    )
      ? "computer_science"
      : "engineering",
    animal_science: "biology",
    beverage_health: "medicine",
    food_nutrition: "biology",
    materials_design: "engineering",
    consumer_product: "business",
    automotive_business: "business",
    household_safety: "engineering",
    music_culture: "culture",
    general_research: "unknown",
  };
  if (mappedTopicDomain[understanding.domain] && mappedTopicDomain[understanding.domain] !== "unknown") {
    return mappedTopicDomain[understanding.domain];
  }
  for (const rule of DOMAIN_HINTS) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return rule.domain;
    }
  }
  if (/科學|science/i.test(normalized)) return "natural_science";
  return "unknown";
}

function inferIntent(value: string, inputType: InputType): ResearchIntent {
  const normalized = compactWhitespace(value);
  if (isProteinMuscleGrowthInput(normalized)) return "explain_mechanism";
  if (isTeaOrganHealthInput(normalized)) return "evaluate_impact";
  if (isAgriculturalWastePollutionInput(normalized)) return "evaluate_impact";
  if (isAstronomyScienceEducationInput(normalized)) return "practical_application";
  if (/文獻回顧|literature review|systematic review|meta-analysis/i.test(normalized)) {
    return "literature_review";
  }
  if (/比較|compare|versus|vs\./i.test(normalized)) return "compare";
  if (/機制|如何|怎麼|消化|吸收|生成|轉化|mechanism|how .* works?/i.test(normalized)) return "explain_mechanism";
  if (/影響|impact|effect|影響評估|污染|pollution|contamination/i.test(normalized)) return "evaluate_impact";
  if (/原因|成因|cause|causal/i.test(normalized)) return "cause_effect";
  if (/政策|法規|治理|policy|regulation|law/i.test(normalized)) return "policy_analysis";
  if (/應對方式|因應策略|解決方式|改善策略|降溫策略|應用與限制|countermeasure|response strateg|adaptation strateg|intervention strateg|cooling strateg|application.*limitation/i.test(normalized)) {
    return "practical_application";
  }
  if (/歷史|演變|history|historical/i.test(normalized)) return "historical_analysis";
  if (/文化|神話|文學|民俗|culture|folklore|myth|literature/i.test(normalized)) {
    return /文學|literature/i.test(normalized) ? "cultural_analysis" : "cultural_analysis";
  }
  if (/案例|個案|case study/i.test(normalized)) return "case_study";
  if (/實驗|設計|experiment|protocol/i.test(normalized)) return "experiment_design";
  if (/定義|概述|是什麼|what is|overview/i.test(normalized)) return "definition_overview";
  if (/應用|application|practical/i.test(normalized)) return "practical_application";
  if (inputType === "question") return "definition_overview";
  return "unknown";
}

function isAstronomyScienceEducationInput(value: string): boolean {
  const normalized = compactWhitespace(value);
  const hasAstronomyCue =
    /星星|恆星|星系|天文|宇宙|光年|視差|天體|距離|astronomy|stellar|\bstars?\b|galaxy|cosmos|parallax|light[-\s]?year|celestial/i.test(
      normalized,
    );
  const hasEducationCue =
    /科學教育|博物館|展示|大眾理解|科普|教材|教學|education|museum|exhibition|display|public understanding|outreach|informal learning/i.test(
      normalized,
    );
  return hasAstronomyCue && hasEducationCue;
}

function isAgriculturalWastePollutionInput(value: string): boolean {
  const normalized = compactWhitespace(value);
  const hasAgricultureCue =
    /農業|農作|農田|畜牧|養殖|肥料|糞肥|農藥|作物|agricultur|farm|crop|livestock|manure|fertili[sz]er|pesticide/i.test(
      normalized,
    );
  const hasWastePollutionCue =
    /廢料|廢棄物|殘渣|污染|水質|土壤|逕流|徑流|富營養化|廢水|agricultural waste|farm waste|residue|pollution|contamination|runoff|wastewater|eutrophication/i.test(
      normalized,
    );
  return hasAgricultureCue && hasWastePollutionCue;
}

function isProteinMuscleGrowthInput(value: string): boolean {
  return /蛋白質|protein/i.test(value) && /肌肉|肌肥大|muscle|hypertrophy/i.test(value);
}

function isTeaOrganHealthInput(value: string): boolean {
  return /茶葉|茶多酚|兒茶素|綠茶|\btea\b|catechin|egcg/i.test(value) &&
    /器官|健康|肝臟|腎臟|心血管|代謝|organ|health|liver|kidney|cardiovascular|metabolism/i.test(value);
}

function isSearchableScienceKeywordInput(value: string): boolean {
  return /皂化反應|氧化還原反應|抗生素抗藥性|抗藥性|溫室效應|藍染|redox reaction|oxidation[-\s]?reduction|saponification reaction|antibiotic resistance|antimicrobial resistance|greenhouse effect|indigo dyeing/i.test(value);
}

function extractCoreEntities(value: string): string[] {
  const understanding = understandTopic(value);
  const sentencePhrases = extractSentencePhrases(value);
  const hintTerms = deriveHintTerms([value, ...sentencePhrases]);
  return uniqueStrings([
    understanding.entity?.canonicalName,
    ...(understanding.entity?.aliases?.slice(0, 3) ?? []),
    ...sentencePhrases,
    ...understanding.canonicalTerms.slice(0, 3),
    ...hintTerms.zh,
    ...tokenize(value).slice(0, 4),
  ]).slice(0, 6);
}

function extractCoreConcepts(value: string): string[] {
  const understanding = understandTopic(value);
  const sentencePhrases = extractSentencePhrases(value);
  const hintTerms = deriveHintTerms([
    value,
    ...sentencePhrases,
    ...understanding.canonicalTerms,
  ]);
  return uniqueStrings([
    ...sentencePhrases,
    ...understanding.coreConcepts,
    ...understanding.canonicalTerms,
    ...understanding.englishTerms.slice(0, 4),
    ...understanding.scientificNames.slice(0, 2),
    ...hintTerms.zh,
    ...hintTerms.en,
  ]).slice(0, 10);
}

function extractSentencePhrases(value: string): string[] {
  const normalized = compactWhitespace(value);
  if (isProteinMuscleGrowthInput(normalized)) {
    return [
      "蛋白質",
      "肌肉增長",
      "肌肥大",
      "肌肉蛋白質合成",
      "阻力訓練",
      "胺基酸",
      "白胺酸",
    ];
  }
  if (isTeaOrganHealthInput(normalized)) {
    return [
      "茶葉",
      "茶多酚",
      "兒茶素",
      "器官健康",
      "肝臟",
      "腎臟",
      "心血管",
      "代謝",
    ];
  }
  const effect = normalized.match(/^(不同.+?)對(.+?)的影響$/u) ?? normalized.match(/^(.+?)對(.+?)的影響$/u);
  if (effect?.[1] && effect?.[2]) {
    return uniqueStrings([effect[1], effect[2]]);
  }
  const relation = normalized.match(/^(.+?)與(.+?)的(?:關係|相關性)$/u);
  if (relation?.[1] && relation?.[2]) {
    return uniqueStrings([relation[1], relation[2]]);
  }
  const pairedTopic = normalized.match(/^(.+?)與(.+?)的(.+)$/u);
  if (pairedTopic?.[1] && pairedTopic?.[2] && pairedTopic?.[3]) {
    return uniqueStrings([pairedTopic[1], pairedTopic[2], pairedTopic[3]]);
  }
  const inContext = normalized.match(/^(.+?)在(.+?)中的(.+)$/u);
  if (inContext?.[1] && inContext?.[2] && inContext?.[3]) {
    return uniqueStrings([inContext[1], inContext[2], inContext[3]]);
  }
  const topicWithTwoAspects = normalized.match(/^(.+?)的(.+?)與(.+)$/u);
  if (topicWithTwoAspects?.[1] && topicWithTwoAspects?.[2] && topicWithTwoAspects?.[3]) {
    return uniqueStrings([topicWithTwoAspects[1], topicWithTwoAspects[2], topicWithTwoAspects[3]]);
  }
  return [];
}

function buildTopicOptions(
  value: string,
  domain: ResearchDomain,
  intent: ResearchIntent,
): ParsedResearchInput["topicOptions"] {
  const understanding = understandTopic(value);
  const options = [
    ...understanding.clarificationCards.map((card) => ({
      label: card.label,
      canonicalTopic: card.suggestedTopic,
      researchQuestion: card.description || card.suggestedTopic,
      domain,
      researchIntent: intent === "unknown" ? "definition_overview" : intent,
    })),
    ...understanding.researchAngles.map((angle) => ({
      label: angle.label,
      canonicalTopic: angle.researchQuestion,
      researchQuestion: angle.researchQuestion,
      domain,
      researchIntent:
        intent === "unknown"
          ? /比較/.test(angle.researchQuestion)
            ? "compare"
            : "definition_overview"
          : intent,
    })),
  ];

  if (options.length > 0) return options.slice(0, 5);

  const fallbackTopic = compactWhitespace(value);
  return [
    {
      label: "背景脈絡",
      canonicalTopic: `${fallbackTopic}的背景脈絡與核心特徵`,
      researchQuestion: `${fallbackTopic}的背景脈絡與核心特徵是什麼？`,
      domain,
      researchIntent: intent === "unknown" ? "definition_overview" : intent,
    },
    {
      label: "比較方向",
      canonicalTopic: `${fallbackTopic}在不同情境中的差異比較`,
      researchQuestion: `若研究${fallbackTopic}，最合理的比較條件是什麼？`,
      domain,
      researchIntent: "compare",
    },
    {
      label: "案例方向",
      canonicalTopic: `${fallbackTopic}的案例、應用或影響分析`,
      researchQuestion: `${fallbackTopic}最適合從哪些案例、應用或影響切入？`,
      domain,
      researchIntent: intent === "unknown" ? "case_study" : intent,
    },
  ];
}

function safeAlternativesForCategory(category: SafetyCategory): string[] {
  const rule = SAFETY_RULES.find((item) => item.category === category);
  return rule?.alternatives ?? [];
}

export function classifyResearchSafety(normalizedInput: string): Pick<
  ParsedResearchInput,
  "safetyStatus" | "safetyCategory" | "safetyReason" | "safeAlternatives"
> & {
  debug: { matchedRules: string[]; notes: string[] };
} {
  const normalized = compactWhitespace(normalizedInput);
  if (!normalized) {
    return {
      safetyStatus: "needs_reframe",
      safetyCategory: "other",
      safetyReason: "請先輸入可辨識的研究主題。",
      safeAlternatives: [],
      debug: { matchedRules: ["empty-input"], notes: [] },
    };
  }

  const matchedRules: string[] = [];
  const notes: string[] = [];
  const hasAcademicContext = ACADEMIC_CONTEXT_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );

  for (const rule of SAFETY_RULES) {
    const matchedRisk = rule.patterns.some((pattern) => pattern.test(normalized));
    if (!matchedRisk) continue;
    matchedRules.push(rule.id);
    const actionable = (rule.actionablePatterns ?? []).some((pattern) =>
      pattern.test(normalized),
    );
    const academicAllowed = (rule.academicAllowPatterns ?? []).some((pattern) =>
      pattern.test(normalized),
    );
    if (rule.defaultStatus === "blocked" && actionable) {
      return {
        safetyStatus: "blocked",
        safetyCategory: rule.category,
        safetyReason: rule.reason,
        safeAlternatives: rule.alternatives,
        debug: { matchedRules, notes: [...notes, "actionable-risk-detected"] },
      };
    }
    if (rule.defaultStatus === "blocked" && !academicAllowed && !hasAcademicContext) {
      return {
        safetyStatus: "blocked",
        safetyCategory: rule.category,
        safetyReason: rule.reason,
        safeAlternatives: rule.alternatives,
        debug: { matchedRules, notes: [...notes, "high-risk-topic-without-safe-framing"] },
      };
    }
    return {
      safetyStatus: academicAllowed || hasAcademicContext ? "allowed" : "needs_reframe",
      safetyCategory: rule.category,
      safetyReason:
        academicAllowed || hasAcademicContext
          ? "主題涉及風險面向，僅能以學術、政策、防治或公共衛生角度研究。"
          : rule.reason,
      safeAlternatives: rule.alternatives,
      debug: {
        matchedRules,
        notes: [...notes, academicAllowed || hasAcademicContext ? "safe-context-detected" : "reframe-required"],
      },
    };
  }

  if (/仇恨|種族滅絕|霸凌某族群|hate speech|harass/i.test(normalized)) {
    return {
      safetyStatus: "blocked",
      safetyCategory: "hate_or_harassment",
      safetyReason: "這個主題含有仇恨或騷擾意圖，不能進入搜尋。",
      safeAlternatives: [
        "仇恨言論治理政策比較",
        "校園霸凌防治與介入成效研究",
      ],
      debug: { matchedRules: ["hate-or-harassment"], notes },
    };
  }

  return {
    safetyStatus: "allowed",
    safetyCategory: "safe_academic",
    safetyReason: "主題可進入一般研究流程。",
    safeAlternatives: [],
    debug: { matchedRules, notes },
  };
}

function buildResearchQuestion(
  normalizedInput: string,
  intent: ResearchIntent,
  canonicalTopic: string,
): string {
  if (isProteinMuscleGrowthInput(normalizedInput)) {
    return "蛋白質攝取如何影響肌肉蛋白質合成與肌肥大？";
  }
  if (isTeaOrganHealthInput(normalizedInput)) {
    return "茶葉或茶多酚對肝臟、腎臟、心血管、代謝與神經系統有哪些健康影響？";
  }
  if (QUESTION_PATTERNS.some((pattern) => pattern.test(normalizedInput))) {
    return normalizedInput;
  }
  switch (intent) {
    case "compare":
      return `哪些核心面向最適合比較「${canonicalTopic}」？`;
    case "evaluate_impact":
      return `「${canonicalTopic}」會帶來哪些可驗證的影響？`;
    case "explain_mechanism":
      return `「${canonicalTopic}」的核心機制是什麼？`;
    case "cause_effect":
      return `「${canonicalTopic}」的原因與結果之間有何關聯？`;
    case "policy_analysis":
      return `哪些政策、制度或治理證據與「${canonicalTopic}」最相關？`;
    case "historical_analysis":
      return `「${canonicalTopic}」的歷史脈絡與演變重點是什麼？`;
    case "cultural_analysis":
      return `「${canonicalTopic}」在文化或文本中具有哪些意義？`;
    case "experiment_design":
      return `如果研究「${canonicalTopic}」，最合理的研究設計與變項是什麼？`;
    case "practical_application":
      return `「${canonicalTopic}」有哪些可驗證的實務應用與限制？`;
    case "literature_review":
      return `目前文獻如何整理「${canonicalTopic}」的主要證據與爭議？`;
    case "definition_overview":
    case "case_study":
    case "unknown":
    default:
      return `「${canonicalTopic}」最值得先釐清的研究問題是什麼？`;
  }
}

function ambiguityScoreForInput(input: {
  normalizedInput: string;
  inputType: InputType;
  topicKind: string;
  intent: ResearchIntent;
  topicOptions: ParsedResearchInput["topicOptions"];
}): number {
  let score = 0;
  if (input.inputType === "invalid") score += 1;
  if (input.inputType === "keyword") score += 0.28;
  if (input.topicKind === "ambiguous") score += 0.4;
  if (input.topicKind === "broad_common_noun") score += 0.32;
  if (input.topicKind === "known_entity") score += 0.18;
  if (input.intent === "unknown") score += 0.18;
  if (input.topicOptions.length > 0) score += 0.08;
  if (input.normalizedInput.length <= 4) score += 0.16;
  return clamp(score, 0, 1);
}

function confidenceForInput(input: {
  inputType: InputType;
  topicKind: string;
  safetyStatus: SafetyStatus;
  ambiguityScore: number;
  coreConceptCount: number;
  topicOptions: ParsedResearchInput["topicOptions"];
}): number {
  let score = 0.52;
  if (input.inputType === "sentence" || input.inputType === "question") score += 0.18;
  if (input.inputType === "paragraph") score += 0.08;
  if (input.topicKind === "specific_research_topic") score += 0.18;
  if (input.topicKind === "unknown_or_noise") score -= 0.45;
  if (input.safetyStatus === "blocked") score -= 0.55;
  if (input.safetyStatus === "needs_reframe") score -= 0.18;
  if (input.coreConceptCount >= 2) score += 0.08;
  if (input.topicOptions.length >= 3) score += 0.04;
  score -= input.ambiguityScore * 0.45;
  return clamp(score, 0, 1);
}

function inferNextAction(input: {
  normalizedInput: string;
  inputType: InputType;
  safetyStatus: SafetyStatus;
  ambiguityScore: number;
  confidence: number;
  topicKind: string;
  topicOptions: ParsedResearchInput["topicOptions"];
}): NextAction {
  if (input.safetyStatus === "blocked") return "block";
  if (input.inputType === "invalid") return "ask_clarification";
  if (input.safetyStatus === "needs_reframe") return "ask_clarification";
  const hasGenericContentCue =
	    /如何|怎麼|是否|釋放|應對方式|因應策略|解決方式|改善策略|降溫策略|應用與限制|形成與變遷|整理|總結|摘要|知識庫|現況|趨勢|報告|研究|分析|探討|影響|關係|比較|原因|成因|機制|政策|治理/u.test(
      input.normalizedInput,
    ) ||
	    /\b(summary|digest|knowledge base|report|analysis|overview|policy|strategy|trend|release|leach|leaching)\b/i.test(
      input.normalizedInput,
    );
	  if (
	    hasGenericContentCue &&
	    (input.inputType === "sentence" || input.inputType === "question" || input.inputType === "paragraph")
	  ) {
	    return "search";
	  }
  if (hasGenericContentCue && input.topicKind === "specific_research_topic") {
    return "search";
  }
  if (isSearchableScienceKeywordInput(input.normalizedInput)) return "search";
  if (
    (input.topicKind === "ambiguous" || input.topicKind === "broad_common_noun") &&
    input.topicOptions.length > 0
  ) {
    return "show_topic_options";
  }
  if (input.inputType === "keyword" && input.topicOptions.length > 0) {
    return "show_topic_options";
  }
  if (input.topicKind === "unknown_or_noise" && input.topicOptions.length > 0) {
    return "show_topic_options";
  }
  if (input.topicKind === "unknown_or_noise") return "ask_clarification";
  if (input.ambiguityScore >= 0.72 && input.topicOptions.length > 0) {
    return "show_topic_options";
  }
  if (input.confidence < 0.46) return "ask_clarification";
  return "search";
}

function defaultSourceTypes(
  domain: ResearchDomain,
  intent: ResearchIntent,
): ParsedResearchInput["queryPlan"]["sourceTypes"] {
  if (intent === "policy_analysis" || domain === "law_policy") {
    return ["official", "report", "paper", "news"];
  }
  if (intent === "historical_analysis" || domain === "history") {
    return ["book", "paper", "encyclopedia", "official"];
  }
  if (intent === "cultural_analysis" || domain === "culture" || domain === "literature") {
    return ["book", "paper", "encyclopedia", "news"];
  }
  if (domain === "business") {
    return ["report", "official", "paper", "news"];
  }
  if (intent === "definition_overview") {
    return ["encyclopedia", "paper", "official", "book"];
  }
  if (intent === "experiment_design") {
    return ["paper", "dataset", "official", "report"];
  }
  if (domain === "medicine") {
    return ["paper", "official", "report", "dataset"];
  }
  return ["paper", "report", "official", "dataset"];
}

export function buildQueryPlan(
  parsed: Omit<ParsedResearchInput, "queryPlan" | "nextAction">,
): ParsedResearchInput["queryPlan"] {
  const understanding = understandTopic(parsed.normalizedInput);
  const proteinMuscle = isProteinMuscleGrowthInput(parsed.normalizedInput);
  const teaOrganHealth = isTeaOrganHealthInput(parsed.normalizedInput);
  const hintTerms = deriveHintTerms([
    parsed.normalizedInput,
    ...parsed.coreEntities,
    ...parsed.coreConcepts,
  ]);
  const zhQueries = uniqueStrings([
    ...(proteinMuscle
      ? [
          "蛋白質 肌肉增長 肌肉蛋白質合成",
          "蛋白質 攝取 阻力訓練 肌肥大",
        ]
      : []),
    ...(teaOrganHealth
      ? [
          "茶葉 器官 健康影響 茶多酚",
          "茶葉 兒茶素 肝臟 腎臟 心血管 健康",
        ]
      : []),
    parsed.canonicalTopic,
    parsed.researchQuestion,
    parsed.mustIncludeTerms.join(" "),
    ...hintTerms.zh,
    ...understanding.searchQueries.zh,
  ]).slice(0, 8);
  const enQueries = uniqueStrings([
    ...(proteinMuscle
      ? [
          "protein intake muscle hypertrophy",
          "protein muscle protein synthesis resistance training",
          "dietary protein amino acids leucine muscle growth review",
        ]
      : []),
    ...(teaOrganHealth
      ? [
          "tea organ health effects",
          "tea polyphenols catechins liver kidney cardiovascular health",
          "green tea EGCG health effects systematic review",
        ]
      : []),
    understanding.canonicalEnglishTopic,
    ...hintTerms.en,
    ...understanding.searchQueries.en,
    ...parsed.shouldIncludeTerms.filter(containsLatin),
  ]).slice(0, 8);
  return {
    zhQueries,
    enQueries,
    mustIncludeTerms: parsed.mustIncludeTerms,
    shouldIncludeTerms: parsed.shouldIncludeTerms,
    mustExcludeTerms: parsed.mustExcludeTerms,
    sourceTypes: defaultSourceTypes(parsed.domain, parsed.researchIntent),
  };
}

export function parseResearchInput(rawInput: string): ParsedResearchInput {
  const originalInput = String(rawInput ?? "");
  const normalizedInput = compactWhitespace(originalInput).replace(/[「」"'`]/g, "");
  const inputType =
    !normalizedInput || looksInvalidInput(normalizedInput)
      ? "invalid"
      : detectInputType(normalizedInput);
  const language = detectLanguage(normalizedInput);
  const safety = classifyResearchSafety(normalizedInput);
  const understanding = understandTopic(normalizedInput);
  const domain = detectDomain(normalizedInput);
  const researchIntent = inferIntent(normalizedInput, inputType);
  const coreEntities = extractCoreEntities(normalizedInput);
  const coreConcepts = extractCoreConcepts(normalizedInput);
  const hintTerms = deriveHintTerms([
    normalizedInput,
    ...coreEntities,
    ...coreConcepts,
  ]);
  const constraints = uniqueStrings([
    /高中|middle school|student/i.test(normalizedInput) ? "student_or_school_context" : "",
    /台灣|臺灣|taiwan/i.test(normalizedInput) ? "taiwan_scope" : "",
    /案例|個案|case study/i.test(normalizedInput) ? "case_study_scope" : "",
    /歷史|history/i.test(normalizedInput) ? "historical_scope" : "",
  ]);
  const canonicalTopic = isProteinMuscleGrowthInput(normalizedInput)
    ? "蛋白質與肌肉增長"
    : isTeaOrganHealthInput(normalizedInput)
      ? "茶葉與人體器官健康"
      : normalizedInput;
  const displayTitle = canonicalTopic;
  const researchQuestion = buildResearchQuestion(
    normalizedInput,
    researchIntent,
    canonicalTopic,
  );
  const mustIncludeTerms = uniqueStrings(
    isProteinMuscleGrowthInput(normalizedInput)
      ? [
          "蛋白質",
          "肌肉增長",
          "肌肥大",
          "肌肉蛋白質合成",
          "阻力訓練",
          "胺基酸",
          "白胺酸",
          "protein intake",
        ]
      : isTeaOrganHealthInput(normalizedInput)
        ? [
            "茶葉",
            "茶多酚",
            "兒茶素",
            "器官健康",
            "肝臟",
            "腎臟",
            "心血管",
            "tea polyphenols",
          ]
        : inputType === "keyword"
      ? [
          ...coreEntities.slice(0, 4),
          ...hintTerms.zh.slice(0, 2),
          ...hintTerms.en.slice(0, 2),
          ...tokenize(canonicalTopic).slice(0, 3),
        ]
      : [
          ...coreEntities.slice(0, 4),
          ...coreConcepts.slice(0, 6),
          ...hintTerms.zh.slice(0, 3),
          ...hintTerms.en.slice(0, 3),
          ...tokenize(canonicalTopic).slice(0, 4),
        ],
  ).slice(0, 8);
  const shouldIncludeTerms = uniqueStrings([
    ...(isProteinMuscleGrowthInput(normalizedInput)
      ? [
          "muscle growth",
          "muscle hypertrophy",
          "muscle protein synthesis",
          "resistance training",
          "amino acids",
          "leucine",
        ]
      : []),
    ...(isTeaOrganHealthInput(normalizedInput)
      ? [
          "tea",
          "catechins",
          "EGCG",
          "organ health",
          "liver",
          "kidney",
          "cardiovascular health",
          "metabolism",
        ]
      : []),
    understanding.canonicalEnglishTopic,
    ...understanding.englishTerms.slice(0, 4),
    ...understanding.scientificNames.slice(0, 2),
    ...understanding.aliases.slice(0, 3),
    ...hintTerms.en,
  ]).slice(0, 8);
  const mustExcludeTerms = uniqueStrings([
    ...understanding.excludedDriftTerms,
    ...DRIFT_TERM_RULES.filter((rule) => rule.when.test(normalizedInput)).flatMap(
      (rule) => rule.exclude,
    ),
  ]).slice(0, 10);
  const topicOptions = buildTopicOptions(normalizedInput, domain, researchIntent);
  const ambiguityScore = ambiguityScoreForInput({
    normalizedInput,
    inputType,
    topicKind: understanding.topicKind,
    intent: researchIntent,
    topicOptions,
  });
  const confidence = confidenceForInput({
    inputType,
    topicKind: understanding.topicKind,
    safetyStatus: safety.safetyStatus,
    ambiguityScore,
    coreConceptCount: coreConcepts.length,
    topicOptions,
  });

  const base = {
    originalInput,
    normalizedInput,
    inputType,
    language,
    safetyStatus: safety.safetyStatus,
    safetyCategory: safety.safetyCategory,
    safetyReason: safety.safetyReason,
    safeAlternatives:
      safety.safeAlternatives.length > 0
        ? safety.safeAlternatives
        : safeAlternativesForCategory(safety.safetyCategory),
    canonicalTopic,
    displayTitle,
    researchQuestion,
    domain,
    researchIntent,
    coreEntities,
    coreConcepts,
    constraints,
    mustIncludeTerms,
    shouldIncludeTerms,
    mustExcludeTerms,
    ambiguityScore,
    confidence,
    topicOptions,
    debug: {
      matchedRules: uniqueStrings([
        ...safety.debug.matchedRules,
        `topicKind:${understanding.topicKind}`,
        `domain:${domain}`,
        `intent:${researchIntent}`,
      ]),
      notes: uniqueStrings([
        ...safety.debug.notes,
        inputType === "invalid" ? "invalid-input-detected" : "",
        understanding.needsClarification ? "topic-understanding-needs-clarification" : "",
      ]),
    },
  } satisfies Omit<ParsedResearchInput, "queryPlan" | "nextAction">;

  const queryPlan = buildQueryPlan(base);
  const nextAction = inferNextAction({
    normalizedInput,
    inputType,
    safetyStatus: safety.safetyStatus,
    ambiguityScore,
    confidence,
    topicKind: understanding.topicKind,
    topicOptions,
  });

  return ParsedResearchInputSchema.parse({
    ...base,
    queryPlan,
    nextAction,
  });
}

function sourceText(source: SourceLike): string {
  return normalizeForMatch(
    [
      source.title,
      source.abstract,
      source.snippet,
      source.publisher,
      source.containerTitle,
      source.url,
      source.doi,
      source.sourceType,
      source.sourceCategory,
      ...(source.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function termMatches(text: string, term: string): boolean {
  const normalizedTerm = normalizeForMatch(term);
  if (!normalizedTerm) return false;
  if (/^[a-z0-9][a-z0-9\s-]*$/i.test(normalizedTerm)) {
    const escaped = normalizedTerm
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text);
  }
  return text.includes(normalizedTerm);
}

export function evaluateSourceAgainstIntent(
  source: SourceLike,
  parsed: ParsedResearchInput,
): EvaluatedSourceAgainstIntent {
  const text = sourceText(source);
  const matchedMustIncludeTerms = uniqueStrings(
    parsed.mustIncludeTerms.filter((term) => termMatches(text, term)),
  );
  const matchedShouldIncludeTerms = uniqueStrings(
    parsed.shouldIncludeTerms.filter((term) => termMatches(text, term)),
  );
  const matchedCoreConcepts = uniqueStrings(
    parsed.coreConcepts.filter((term) => termMatches(text, term)),
  );
  const excludeHits = uniqueStrings([
    ...parsed.mustExcludeTerms.filter((term) => termMatches(text, term)),
    ...PROMOTIONAL_DRIFT_TERMS.filter((term) => termMatches(text, term)),
  ]);
  const hasNegativeTopicalCue = OFF_TOPIC_NEGATION_PATTERNS.some((pattern) =>
    pattern.test(text),
  );
  const mustRatio =
    parsed.mustIncludeTerms.length > 0
      ? matchedMustIncludeTerms.length / parsed.mustIncludeTerms.length
      : 0;
  const shouldRatio =
    parsed.shouldIncludeTerms.length > 0
      ? matchedShouldIncludeTerms.length / parsed.shouldIncludeTerms.length
      : 0;
  const coreRatio =
    parsed.coreConcepts.length > 0
      ? matchedCoreConcepts.length / parsed.coreConcepts.length
      : 0;
  const hasAbstract = Boolean(compactWhitespace(source.abstract ?? source.snippet ?? ""));
  const titleText = normalizeForMatch(source.title ?? "");
  const titleHasCoreMatch = uniqueStrings([
    ...parsed.mustIncludeTerms,
    ...parsed.shouldIncludeTerms,
    ...parsed.coreConcepts,
  ]).some((term) => termMatches(titleText, term));
  let score =
    mustRatio * 0.52 +
    shouldRatio * 0.18 +
    coreRatio * 0.18 +
    (titleHasCoreMatch ? 0.08 : 0) +
    (hasAbstract ? 0.04 : 0);
  if (excludeHits.length > 0) {
    score -= matchedMustIncludeTerms.length > 0 ? 0.18 : 0.45;
  }
  if (hasNegativeTopicalCue) {
    score -= 0.45;
  }
  score = clamp(score, 0, 1);

  const reasons: string[] = [];
  if (matchedMustIncludeTerms.length > 0) {
    reasons.push(`matched must terms: ${matchedMustIncludeTerms.join(", ")}`);
  }
  if (matchedShouldIncludeTerms.length > 0) {
    reasons.push(`matched supporting terms: ${matchedShouldIncludeTerms.join(", ")}`);
  }
  if (excludeHits.length > 0) {
    reasons.push(`exclude hits: ${excludeHits.join(", ")}`);
  }
  if (hasNegativeTopicalCue) {
    reasons.push("source explicitly signals that the matched terms are off-topic");
  }
  if (!hasAbstract) {
    reasons.push("source lacks abstract or snippet evidence");
  }

  let decision: SourceIntentDecision = "reject";
  if (hasNegativeTopicalCue) {
    decision = "reject";
  } else if (excludeHits.length > 0 && matchedMustIncludeTerms.length === 0) {
    decision = "reject";
  } else if (
    titleHasCoreMatch &&
    matchedCoreConcepts.length >= 1 &&
    excludeHits.length === 0 &&
    score >= 0.42
  ) {
    decision = "accept";
  } else if (
    matchedMustIncludeTerms.length >= Math.min(2, Math.max(1, parsed.mustIncludeTerms.length)) ||
    (matchedMustIncludeTerms.length >= 1 && matchedCoreConcepts.length >= 2)
  ) {
    decision = score >= 0.62 ? "accept" : "supplementary";
  } else if (
    matchedMustIncludeTerms.length >= 1 ||
    (titleHasCoreMatch && matchedCoreConcepts.length >= 1) ||
    (matchedCoreConcepts.length >= 1 && matchedShouldIncludeTerms.length >= 1)
  ) {
    decision = score >= 0.22 ? "supplementary" : "reject";
  }

  return EvaluatedSourceAgainstIntentSchema.parse({
    decision,
    score,
    matchedMustIncludeTerms,
    matchedShouldIncludeTerms,
    matchedCoreConcepts,
    excludeHits,
    reasons,
  });
}
