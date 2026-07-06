import {
  type AcademicSafetyReview,
  type AcademicRetry,
  type ClaimCandidate,
  type ConceptGroup,
  type DomainHypothesis,
  type GroundingEvidenceCard,
  type GroundingJob,
  type GroundingPipelineDiagnostics,
  type GroundingQueryPlan,
  type GroundingReportSection,
  type LexicalSignal,
  type QueryIntent,
  type ReportPlan,
  type ResearchGroundingDiagnosticTrace,
  type ResearchGroundingJobCreateRequest,
  type ResearchTitleSentenceParse,
  type SeedQueryPlan,
  type SectionSufficiencyGate,
  type SourceCandidate,
  type SourceInstitutionType,
  type SourceQualitySummary,
  type SourceResearchBucket,
  type SourceRecommendationBucket,
  type SourceRetrievalMode,
  type SourceRole,
  type SourceUseCase,
  type TitleSemanticComparison,
  type TopicAnalysis,
  type TopicCompleteness,
  type TopicTitleState,
} from "@workspace/api-zod/research-grounding";
import {
  canUseEvidenceCardForSection,
  type EvidenceSectionType,
} from "@workspace/api-zod/evidence-governance";
import {
  evaluateSourceAgainstIntent,
  parseResearchInput,
} from "@workspace/api-zod/research-intent";
import type { ParsedResearchInput } from "@workspace/api-zod/research-intent";
import type { SourceRecord } from "@workspace/api-zod";
import { understandTopic } from "@workspace/api-zod/topic-understanding";
import type {
  SearchIntentPlannerInput,
  SearchIntentSourceSearchResult,
} from "../../search-intent-planner";
import { sourceRecordToNormalizedSource } from "../normalizers/normalizeSource";
import { computeFinalScore } from "../scoring/finalScore";
import { analyzeRelevanceScore, TERM_BRIDGE } from "../scoring/relevanceScore";
import { computeSourceQualityScore } from "../scoring/sourceQualityScore";
import {
  nowIso,
  stableQueryHash,
  topicHashForWorkflow,
} from "../workflow/workflowIds";
import { normalizeResearchTopic } from "./normalizeResearchTopic";
import {
  enrichSourceCandidateWithExtraction,
  extractContentForSources,
  type ExtractedChunk,
  type ContentAccessLevel,
} from "./sourceContentExtractor";
import {
  acceptedClaimCandidates,
  extractClaimsForSources,
} from "./claimExtractionService";

const ACTIONABLE_HARM_PATTERNS = [
  /如何/u,
  /\bhow to\b/i,
  /步驟/u,
  /教學/u,
  /製作/u,
  /取得/u,
  /躲避/u,
  /入侵/u,
  /追蹤/u,
  /規避/u,
];

const HIGH_RISK_PATTERNS: Array<{
  category: AcademicSafetyReview["riskCategories"][number];
  pattern: RegExp;
}> = [
  { category: "crime", pattern: /犯罪|詐騙|再犯|執法|警方|forensic|crime|fraud/i },
  { category: "drugs", pattern: /毒品|成癮|藥物濫用|drug|addiction|substance abuse/i },
  { category: "sexual_content", pattern: /性教育|性犯罪|sexual|sex education/i },
  { category: "violence", pattern: /霸凌|暴力|傷害|violence|bullying/i },
  { category: "self_harm", pattern: /自殺|自傷|self-harm|suicide/i },
  { category: "medical", pattern: /醫療|醫學|抗藥性|medical|clinical|antibiotic/i },
  { category: "weapons", pattern: /武器|爆炸物|weapon|explosive/i },
  { category: "privacy", pattern: /帳號|隱私|追蹤|帳密|privacy|credential|account/i },
];

const ACADEMIC_INTENT_PATTERNS = [
  /影響/u,
  /關係/u,
  /相關/u,
  /機制/u,
  /比較/u,
  /防治/u,
  /策略/u,
  /制度/u,
  /角色/u,
  /public health/i,
  /policy/i,
  /prevention/i,
  /effect/i,
  /relationship/i,
  /comparison/i,
  /mechanism/i,
];

const LOCAL_TRANSLATIONS: Record<string, string[]> = {
  泡泡: ["soap bubble", "bubble", "soap film"],
  肥皂泡: ["soap bubble", "soap bubbles"],
  肥皂膜: ["soap film", "soap films"],
  薄膜: ["thin film", "thin films"],
  薄膜干涉: ["thin film interference", "optical interference"],
  干涉: ["interference", "optical interference"],
  繞射: ["diffraction"],
  光學: ["optics", "optical"],
  溫度: ["temperature"],
  牛奶: ["milk"],
  變質: ["spoilage"],
  變質速度: ["spoilage rate"],
  咖啡因: ["caffeine"],
  茶葉: ["tea leaves", "tea"],
  浸泡時間: ["steeping time", "brewing time", "infusion time"],
  萃取: ["extraction", "caffeine extraction"],
  金屬離子: ["metal ions", "metal cations"],
  金屬鹽: ["metal salts"],
  火焰顏色: ["flame color", "flame colour"],
  焰色反應: ["flame test", "flame tests"],
  焰色試驗: ["flame test", "flame tests"],
  發射光譜: ["emission spectra", "atomic emission spectra"],
  洋流: ["ocean currents", "ocean circulation"],
  海流: ["ocean currents", "marine currents"],
  黑潮: ["Kuroshio Current", "Kuroshio"],
  海域: ["waters", "marine waters"],
  生物多樣性: ["biodiversity", "marine biodiversity"],
  海洋生態: ["marine ecosystem", "marine ecology"],
  物種分布: ["species distribution"],
  光合作用: ["photosynthesis", "photosynthetic"],
  太陽帆: ["solar sail", "solar sail propulsion", "solar sailing"],
  輻射壓: ["radiation pressure", "solar radiation pressure"],
  光壓: ["radiation pressure", "photon pressure"],
  航天推進: ["spacecraft propulsion", "space propulsion"],
  深空探測: ["deep space exploration", "deep-space mission"],
  光合作用速率: ["photosynthetic rate", "photosynthesis rate"],
  光照強度: ["light intensity", "irradiance"],
  光強度: ["light intensity", "irradiance"],
  限制因子: ["limiting factors", "limiting factor"],
  心率: ["heart rate"],
  心率變化: ["heart rate change"],
  少子化: ["low fertility", "declining birth rate", "fertility decline"],
  高齡化: ["population aging", "ageing society", "aging society"],
  高齡社會: ["aged society", "population aging"],
  應對方式: ["policy response", "countermeasures", "adaptation strategies"],
  因應策略: ["policy response", "adaptation strategies"],
  睡眠時間: ["sleep duration"],
  學習效率: ["learning efficiency"],
  手機使用時間: ["mobile phone use time", "screen time"],
  注意力: ["attention"],
  蛋白質: ["protein digestion", "dietary protein", "protein intake"],
  蛋白質消化: ["protein digestion", "amino acid absorption"],
  蛋白質攝取: ["protein intake", "dietary protein intake"],
  消化: ["digestion", "protein digestion"],
  吸收: ["absorption", "amino acid absorption"],
  胺基酸: ["amino acids", "amino acid absorption"],
  肌肉: ["skeletal muscle", "muscle protein synthesis"],
  肌肉增長: ["muscle growth", "muscle hypertrophy"],
  肌肥大: ["muscle hypertrophy"],
  阻力訓練: ["resistance training"],
  白胺酸: ["leucine"],
  產生肌肉: ["muscle protein synthesis", "muscle hypertrophy", "mTOR"],
  肌肉蛋白質合成: ["muscle protein synthesis", "mTOR"],
  夕陽: ["sunset color", "atmospheric optics", "Rayleigh scattering"],
  餘暉: ["twilight color", "sunset red light", "atmospheric scattering"],
  光波長: ["wavelength", "visible light wavelength", "scattering wavelength"],
  瑞利散射: ["Rayleigh scattering"],
  大氣散射: ["atmospheric scattering"],
  抗生素抗藥性: ["antibiotic resistance"],
  珊瑚白化: ["coral bleaching"],
  電磁感應: ["electromagnetic induction"],
  太陽能板: ["solar panel"],
  黃石國家公園: [
    "Yellowstone National Park",
    "Yellowstone National Park geology",
    "Yellowstone National Park ecology",
    "Yellowstone National Park conservation",
    "Yellowstone volcanic system",
    "Yellowstone National Park tourism management",
  ],
  月兔: [
    "Moon rabbit",
    "Moon rabbit folklore",
    "Moon rabbit mythology",
    "East Asian moon rabbit",
    "Moon rabbit literature",
    "Moon rabbit cultural symbol",
  ],
  玉佩: [
    "jade pendant",
    "jade pendant archaeology",
    "Chinese jade pendant culture",
    "jade ornament material culture",
    "Chinese jade ritual object",
    "jade pendant craftsmanship",
  ],
  熊貓: [
    "panda",
    "giant panda",
    "Ailuropoda melanoleuca",
    "panda Chinese terminology",
    "panda naming history",
  ],
  貓熊: [
    "cat-bear",
    "panda",
    "giant panda",
    "Chinese terminology",
    "Taiwan panda terminology",
  ],
  大熊貓: [
    "giant panda",
    "Ailuropoda melanoleuca",
    "giant panda taxonomy",
  ],
  小熊貓: [
    "red panda",
    "Ailurus fulgens",
    "red panda taxonomy",
  ],
  小貓熊: [
    "red panda",
    "Ailurus fulgens",
    "red panda taxonomy",
  ],
};

const DOMAIN_INTENT_PATTERNS: Array<{
  domain: string;
  pattern: RegExp;
}> = [
  { domain: "animal behavior / veterinary behavior", pattern: /狗|犬|護食|資源防衛|食物攻擊|犬類行為|dog|canine|resource guarding|food aggression|veterinary behavior/i },
  { domain: "biomedical / oral health / dentistry", pattern: /健康|醫|睡眠|心率|氣喘|咖啡因|抗生素|抗藥性|牙菌斑|牙垢|口腔生物膜|牙周病|health|medical|sleep|heart rate|asthma|caffeine|antibiotic|dental plaque|oral biofilm|periodontal|plaque control/i },
  { domain: "physics / aerospace", pattern: /太陽帆|輻射壓|光壓|航天推進|深空探測|solar sail|solar sailing|radiation pressure|spacecraft propulsion|deep space/i },
  { domain: "physics / aerodynamics", pattern: /風箏|空氣動力|升力|阻力|風速|拉力|kite|aerodynamics|lift|drag|tethered flight|wind tunnel/i },
  { domain: "physics / optics", pattern: /泡泡|肥皂膜|薄膜|干涉|繞射|光學|光波長|soap bubble|soap film|thin film|interference|diffraction|optics|wavelength/i },
  { domain: "chemistry", pattern: /化學|塑膠|材料|受熱|BPA|鄰苯|反應|金屬離子|焰色|火焰顏色|咖啡因|萃取|chemistry|plastic|polymer|thermal|material|metal ion|flame test|caffeine|extraction/i },
  { domain: "environmental science", pattern: /空氣污染|污染|環境|PM2\.?5|氣候|洋流|海流|黑潮|生物多樣性|海洋|鳥類|餵食|覓食|食性|environment|pollution|air quality|climate|ocean current|Kuroshio|biodiversity|marine|bird|avian|feeding ecology|foraging|trophic/i },
  { domain: "mixed / biology + culture_linguistics", pattern: /熊貓|貓熊|大熊貓|小熊貓|小貓熊|giant panda|red panda|Ailuropoda|Ailurus|cat-bear|Chinese terminology/i },
  { domain: "biology", pattern: /光合作用|植物|物種|分類|分類學|photosynthesis|photosynthetic|plant physiology|taxonomy|species/i },
  { domain: "psychology / education", pattern: /高中生|學生|注意力|學習|教育|psychology|education|student|attention|learning/i },
  { domain: "history / culture", pattern: /文化|歷史|工藝|藍染|保存|heritage|culture|history|craft/i },
  { domain: "technology / computer science", pattern: /人工智慧|AI|科技|生成式|computer science|technology|generative ai|artificial intelligence/i },
  { domain: "social science", pattern: /政策|社會|影響|風險|social|policy|society/i },
];

const RESEARCH_INTENT_PATTERNS: Array<{
  intent: string;
  pattern: RegExp;
}> = [
  { intent: "mechanism", pattern: /如何|原因|機制|原理|mechanism|why|how/i },
  { intent: "health_effect", pattern: /健康|睡眠|心率|氣喘|風險|health|heart rate|asthma|risk|sleep/i },
  { intent: "risk_factor", pattern: /風險|危害|有害|risk|harm|hazard/i },
  { intent: "comparison", pattern: /比較|差異|comparison|versus|difference/i },
  { intent: "terminology_taxonomy", pattern: /熊貓|貓熊|大熊貓|小熊貓|小貓熊|名稱|命名|用法|分類|taxonomy|terminology|naming|cat-bear/i },
  { intent: "historical_origin", pattern: /起源|歷史|origin|history/i },
  { intent: "cultural_meaning", pattern: /文化|保存|角色|heritage|culture|meaning|preservation/i },
  { intent: "application", pattern: /應用|使用|application|use/i },
  { intent: "policy_impact", pattern: /政策|制度|policy|governance/i },
  { intent: "experimental_principle", pattern: /實驗|反應|experiment|reaction/i },
];

const GENERIC_FOOD_TEMPLATE_QUERY =
  /food safety.*(?:storage|processing|risk)|(?:storage|processing).*food safety|market.*brand|consumption.*(?:food culture|dietary culture)|culinary culture|regional food culture|食品安全.*(?:保存|加工|風險)|(?:保存|加工).*食品安全|市場.*品牌|消費.*(?:飲食文化|食物文化)/i;

function hasExplicitFoodTemplateIntent(value: string): boolean {
  return /食品安全|保存|加工|市場|品牌|消費|飲食文化|food safety|storage|processing|market|brand|consumer|consumption|food culture|culinary|cuisine/i.test(value);
}

function isProteinMuscleTopic(value: string): boolean {
  return /蛋白質|protein/i.test(value) && /肌肉|肌肥大|muscle|hypertrophy|leucine|mTOR|阻力訓練/i.test(value);
}

function sanitizeGroundingQueries(queries: string[], topicText: string): string[] {
  const allowFoodTemplates = hasExplicitFoodTemplateIntent(topicText);
  const cleaned = queries.filter(
    (query) => allowFoodTemplates || !GENERIC_FOOD_TEMPLATE_QUERY.test(query),
  );
  if (!isProteinMuscleTopic(topicText)) return uniqueStrings(cleaned);
  return uniqueStrings([
    "protein digestion amino acid absorption muscle protein synthesis",
    "dietary protein muscle protein synthesis mTOR leucine",
    "protein intake resistance training muscle hypertrophy",
    "leucine mTOR muscle protein synthesis review",
    ...cleaned,
  ]).filter(
    (query) =>
      !GENERIC_FOOD_TEMPLATE_QUERY.test(query) &&
      (/蛋白質|消化|吸收|胺基酸|白胺酸|肌肉|阻力訓練|protein|digestion|absorption|amino acid|leucine|mTOR|muscle|hypertrophy|resistance training/i.test(
        query,
      ) ||
        containsZh(query)),
  );
}

function isPaleontologyAlgaeTopic(topic: string): boolean {
  return (
    /化石|古生物|古環境|古生態|地層|沉積|fossil|paleontology|paleoenvironment|paleoecology|stratigraphy|sedimentary/i.test(
      topic,
    ) &&
    /藻類|藻|微化石|疊層石|藍綠菌|algae|algal|microfossil|stromatolite|cyanobacteria/i.test(
      topic,
    )
  );
}

function isAstronomyScienceEducationTopic(topic: string): boolean {
  const hasAstronomyCue =
    /星星|恆星|星系|天文|宇宙|光年|視差|天體|距離|astronomy|stellar|\bstars?\b|galaxy|cosmos|parallax|light[-\s]?year|celestial/i.test(
      topic,
    );
  const hasEducationCue =
    /科學教育|博物館|展示|大眾理解|科普|教材|教學|education|museum|exhibition|display|public understanding|outreach|informal learning/i.test(
      topic,
    );
  return hasAstronomyCue && hasEducationCue;
}

function isAgriculturalWastePollutionTopic(topic: string): boolean {
  const hasAgricultureCue =
    /農業|農作|農田|畜牧|養殖|肥料|糞肥|農藥|作物|agricultur|farm|crop|livestock|manure|fertili[sz]er|pesticide/i.test(
      topic,
    );
  const hasWastePollutionCue =
    /廢料|廢棄物|殘渣|污染|水質|土壤|逕流|徑流|富營養化|廢水|agricultural waste|farm waste|residue|pollution|contamination|runoff|wastewater|eutrophication/i.test(
      topic,
    );
  return hasAgricultureCue && hasWastePollutionCue;
}

function isAiWorkImpactTopic(topic: string): boolean {
  const hasAiCue =
    /人工智慧|生成式AI|大型語言模型|機器學習|(^|[^A-Za-z])AI(?=$|[^A-Za-z])|artificial intelligence|generative ai|large language model|machine learning/i.test(
      topic,
    );
  const hasWorkCue =
    /工作|職務|職業|就業|勞動|勞工|組織|職場|工作本質|勞動市場|work|job|employment|labor|labour|occupation|workplace|organization|organisation/i.test(
      topic,
    );
  return hasAiCue && hasWorkCue;
}

function isColaHealthTopic(topic: string): boolean {
  const hasBeverageCue =
    /可樂|汽水|碳酸飲料|含糖飲料|含糖碳酸飲料|飲料|cola|soda|soft drink|sugar[-\s]?sweetened beverage|carbonated beverage/i.test(
      topic,
    );
  const hasHealthCue =
    /健康|糖|糖分|咖啡因|攝取|飲用|肥胖|代謝|蛀牙|牙齒|公共衛生|health|sugar|caffeine|consumption|intake|obesity|metabolic|dental|caries|public health/i.test(
      topic,
    );
  const fuelCue =
    /煤|焦煤|焦炭|燃料|\bcoal\b|coking coal|metallurgical coke|coke fuel/i.test(
      topic,
    );
  return hasBeverageCue && hasHealthCue && !fuelCue;
}

function paleontologyAlgaeQueries(topic: string): { zh: string[]; en: string[] } {
  const normalized = compactWhitespace(topic);
  return {
    zh: uniqueStrings([
      normalized,
      "化石 藻類 微化石 古環境",
      "藻類 微化石 化石紀錄 沉積環境",
      "疊層石 藍綠菌 微化石 古環境",
      "古生物 藻類 微化石 古生態",
    ]),
    en: [
      "algal microfossils fossil record paleoenvironment",
      "stromatolites cyanobacteria microfossils sedimentary environment",
      "algae fossil preservation paleoecology",
      "microfossils paleoenvironment reconstruction fossil record",
    ],
  };
}

function astronomyScienceEducationQueries(topic: string): { zh: string[]; en: string[] } {
  const normalized = compactWhitespace(topic);
  return {
    zh: uniqueStrings([
      normalized,
      "天文學 恆星距離 視差 光年 科學教育",
      "星星距離 光年 視差 大眾理解",
      "天文 博物館展示 科學教育 大眾理解",
      "天文教育 博物館 展示 學習成效",
    ]),
    en: [
      "stellar distance parallax light year astronomy education",
      "astronomical distance public understanding science education",
      "astronomy museum exhibition science education learning",
      "planetarium astronomy education public understanding",
      "teaching astronomical distances parallax light year",
    ],
  };
}

function agriculturalWastePollutionQueries(topic: string): { zh: string[]; en: string[] } {
  const normalized = compactWhitespace(topic);
  return {
    zh: uniqueStrings([
      normalized,
      "農業廢棄物 污染 水質 土壤",
      "農業廢料 逕流 富營養化 環境影響",
      "畜牧廢棄物 糞肥 水污染 土壤污染",
      "農業廢棄物 管理 污染防治",
    ]),
    en: [
      "agricultural waste pollution water soil contamination",
      "agricultural residues environmental impact runoff eutrophication",
      "farm waste manure water pollution soil contamination",
      "agricultural waste management pollution control review",
      "agricultural runoff nutrient pollution eutrophication",
    ],
  };
}

function aiWorkImpactQueries(topic: string): { zh: string[]; en: string[] } {
  const normalized = compactWhitespace(topic);
  return {
    zh: uniqueStrings([
      normalized,
      "人工智慧 工作本質 勞動市場 職務變遷",
      "AI 自動化 就業影響 技能需求",
      "生成式AI 工作流程 組織管理",
      "人工智慧 職場轉型 勞動市場 研究",
    ]),
    en: [
      "artificial intelligence impact on work labor market jobs",
      "AI automation employment skills task transformation",
      "generative AI workplace organization management work practices",
      "artificial intelligence future of work labor market review",
      "AI job transformation occupational change workplace",
    ],
  };
}

function colaHealthQueries(topic: string): { zh: string[]; en: string[] } {
  const normalized = compactWhitespace(topic);
  return {
    zh: uniqueStrings([
      normalized,
      "可樂 糖分 咖啡因 攝取習慣 健康影響",
      "含糖飲料 攝取 健康 肥胖 咖啡因",
      "碳酸飲料 糖分 健康影響 文獻回顧",
      "可樂 飲用習慣 健康 研究",
    ]),
    en: [
      "cola sugar caffeine consumption health effects",
      "soft drink consumption sugar caffeine health outcomes",
      "sugar-sweetened beverages consumption obesity metabolic health review",
      "soda intake caffeine sugar health systematic review",
      "soft drink dental health obesity risk adolescents",
    ],
  };
}

const LEGACY_GENERIC_OUTPUT_PATTERNS: Array<{
  label: string;
  pattern: RegExp;
}> = [
  { label: "如何形成並產生作用", pattern: /如何形成並產生作用/u },
  { label: "原理、應用與限制", pattern: /原理、應用與限制/u },
  { label: "不同環境與條件下會怎麼變化", pattern: /不同環境與條件下會怎麼變化/u },
  { label: "生活連結", pattern: /生活連結/u },
  { label: "比較", pattern: /(?:^|[\s:：，、(（「『])比較(?:$|[\s:：，、)）」』])/u },
  { label: "行銷", pattern: /(?:^|[\s:：，、(（「『])行銷(?:$|[\s:：，、)）」』])/u },
  { label: "科學比較", pattern: /科學比較/u },
  { label: "資料策略", pattern: /資料策略/u },
];

interface LegacyGenericTrace {
  path: string;
  value: string;
  matchedPattern: string;
}

type SourceCandidateWithSignals = SourceCandidate & {
  _signals: {
    finalScore: number;
    hasCoreConceptMatch: boolean;
    hasTitleCoreConceptMatch: boolean;
  };
};

export interface LexiconAdapter {
  name: string;
  lookup(term: string): Promise<LexicalSignal[]>;
}

export interface GroundingPipelineProgress {
  status: GroundingJob["status"];
  progress: number;
  patch?: Partial<GroundingJob>;
}

export interface GroundingPipelineDependencies {
  searchHandler: (
    input: SearchIntentPlannerInput,
  ) => Promise<SearchIntentSourceSearchResult>;
  lexiconAdapters?: LexiconAdapter[];
  onProgress?: (update: GroundingPipelineProgress) => void | Promise<void>;
}

type GroundingFallbackAttempt = NonNullable<GroundingPipelineDiagnostics["fallbackAttempts"]>[number];
type SourceCandidateBuildResult = ReturnType<typeof buildSourceCandidates>;

const MIN_REVIEWABLE_SOURCE_COUNT = 4;
const READY_REVIEWABLE_SOURCE_COUNT = 8;
const MAX_FALLBACK_ROUNDS = 2;
const ACADEMIC_RETRY_POLICY = {
  minAcademicCandidates: 5,
  minPeerReviewedOrDOI: 3,
  minEvidenceUsableSources: 5,
  maxAutoAcademicRetries: 2,
  officialBackgroundDoesNotSatisfyAcademicNeed: true,
  retryWhenOnlyOfficialBackground: true,
} as const;
const ACADEMIC_RETRY_NEGATIVE_KEYWORDS = [
  "poem",
  "poetry",
  "travel",
  "photography tips",
  "wallpaper",
  "stock photo",
  "horoscope",
  "myth",
  "song",
  "lyrics",
  "camera settings",
  "tourism",
  "NASA kids only",
  "classroom activity only",
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

type QueryClassification = "providerQuery" | "backgroundQuery" | "outlineHint" | "rejectedQuery";

const REPORT_OUTLINE_HINT_QUERY =
  /^(背景脈絡|主要類型|核心特徵|形成過程|使用方式|章節安排|研究架構|background context|main types|core features|formation process|usage|how to use|report outline)$/i;

const REPORT_OUTLINE_HINT_FRAGMENT =
  /(?:^|\s)(背景脈絡|主要類型|核心特徵|形成過程|使用方式|background context|main types|core features|formation process|usage|how to use)(?:$|\s)/i;

const REPORT_QUESTION_HINT =
  /最值得先釐清的研究問題|研究問題是什麼|research question|questions? should/i;

const GENERIC_PROVIDER_QUERY =
  /^(背景|脈絡|類型|特徵|過程|使用|方式|關係|研究|報告|background|context|types|features|process|usage|use|overview|introduction)$/i;

const GENERIC_RESEARCH_METHOD_QUERY =
  /^(scientific method|experimental design|variables|scientific mechanism|observation evidence|research limitation|research methods?|methodology|evidence limitations?|研究方法|實驗設計|變因|形成機制|觀察證據|研究限制)$/i;

const LOCALE_ONLY_QUERY =
  /^(台灣|臺灣|中國大陸|中國|taiwan|taiwanese|mainland china|china)$/i;

function querySharesTopicSignal(query: string, topicText: string): boolean {
  const normalizedQuery = compactWhitespace(query).toLowerCase();
  const normalizedTopic = compactWhitespace(topicText).toLowerCase();
  if (!normalizedQuery || !normalizedTopic) return false;
  if (normalizedTopic.includes(normalizedQuery) && normalizedQuery.length >= 4) return true;
  const topicPieces = normalizedTopic
    .split(/\s+|[、,，;；:：。！？?()（）「」『』]/u)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= 2 && !GENERIC_PROVIDER_QUERY.test(piece));
  return topicPieces.some((piece) => normalizedQuery.includes(piece));
}

function classifySearchQueryForRouting(query: string, topicText: string): {
  classification: QueryClassification;
  reason: string;
} {
  const normalized = compactWhitespace(query);
  const lower = normalized.toLowerCase();
  if (!normalized) {
    return { classification: "rejectedQuery", reason: "empty query" };
  }
  if (REPORT_OUTLINE_HINT_QUERY.test(normalized)) {
    return { classification: "outlineHint", reason: "report outline hint, not a provider search query" };
  }
  if (REPORT_QUESTION_HINT.test(normalized)) {
    return { classification: "outlineHint", reason: "report-planning question, not a provider search query" };
  }
  if (
    REPORT_OUTLINE_HINT_FRAGMENT.test(normalized) &&
    !/分類|分類學|taxonomy|classification|Ailuropoda|Ailurus|Ursidae|Ailuridae|Rayleigh|scattering|wavelength|HIV|immune|archaeology|jade pendant/i.test(
      normalized,
    )
  ) {
    return { classification: "outlineHint", reason: "topic-prefixed report outline hint, not a provider search query" };
  }
  if (GENERIC_PROVIDER_QUERY.test(normalized) && !querySharesTopicSignal(normalized, topicText)) {
    return { classification: "outlineHint", reason: "generic report-template phrase without topic entities" };
  }
  if (LOCALE_ONLY_QUERY.test(normalized)) {
    return { classification: "rejectedQuery", reason: "locale-only query lacks topic entities" };
  }
  if (normalized.length < 2 || (/^[A-Za-z]{1,2}$/u.test(normalized) && !querySharesTopicSignal(normalized, topicText))) {
    return { classification: "rejectedQuery", reason: "query is too short for provider routing" };
  }
  if (
    /官方|百科|博物館|動物園|科普|背景|用法|詞源|命名|terminology|naming|etymology|common name|museum|zoo|encyclopedia|official background|trusted background/i.test(
      normalized,
    ) &&
    !/taxonomy|classification|phylogen|genom|doi|journal|review|systematic|Rayleigh|scattering|HIV|immune|archaeology/i.test(
      normalized,
    )
  ) {
    return { classification: "backgroundQuery", reason: "background or terminology query routed away from academic providers" };
  }
  if (/旅遊|攝影|詩詞|桌布|wallpaper|photography|travel|poem|tourism/i.test(lower)) {
    return { classification: "rejectedQuery", reason: "known drift query for this workflow" };
  }
  return { classification: "providerQuery", reason: "contains searchable topic or domain entities" };
}

function providerSafeQueries(queries: string[], topicText: string): string[] {
  return uniqueStrings(queries).filter(
    (query) => classifySearchQueryForRouting(query, topicText).classification === "providerQuery",
  );
}

function providerSafeTopicAnchoredQueries(
  queries: string[],
  topicText: string,
  topicAnchorText: string,
): string[] {
  return providerSafeQueries(queries, topicText).filter((query) => {
    if (!GENERIC_RESEARCH_METHOD_QUERY.test(compactWhitespace(query))) return true;
    return querySharesTopicSignal(query, topicAnchorText);
  });
}

function backgroundRoutedQueries(queries: string[], topicText: string): string[] {
  return uniqueStrings(queries).filter(
    (query) => classifySearchQueryForRouting(query, topicText).classification === "backgroundQuery",
  );
}

function webSafeQueries(queries: string[], topicText: string): string[] {
  return uniqueStrings(queries).filter((query) => {
    const classification = classifySearchQueryForRouting(query, topicText).classification;
    return classification === "providerQuery" || classification === "backgroundQuery";
  });
}

type SourceBucketDecision = "accepted" | "fallback_review" | "manual_review" | "rejected";

type BucketEntityDefinition = {
  bucket: SourceResearchBucket;
  terms: string[];
  strongTerms?: string[];
  requiredSignals?: string[];
};

type TopicEntityMap = {
  buckets: SourceResearchBucket[];
  definitions: BucketEntityDefinition[];
  offTopicPatterns: RegExp[];
  backgroundSourceNeeded: boolean;
  missingProviderReason?: string;
};

type BucketSource = {
  title?: string | null;
  abstract?: string | null;
  abstractOriginal?: string | null;
  keywords?: string[] | null;
  venue?: string | null;
  url?: string | null;
  queryUsed?: string | null;
  sourceType?: string | null;
};

type SourceBucketAssessment = {
  bucket: SourceResearchBucket;
  bucketScore: number;
  bucketScores: Partial<Record<SourceResearchBucket, number>>;
  decision: SourceBucketDecision;
  decisionReasons: string[];
  matchedEntities: string[];
  missingRequiredSignals: string[];
  sourceUseCase: SourceUseCase;
  highConfidenceManual: boolean;
};

function sourceBucketText(source: BucketSource): string {
  return compactWhitespace(
    [
      source.title,
      source.abstract,
      source.abstractOriginal,
      source.keywords?.join(" "),
      source.venue,
      source.url,
      source.sourceType,
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

function escapedTermPattern(term: string): RegExp {
  const escaped = term
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}s?($|[^a-z0-9])`, "i");
}

function textMatchesTerm(text: string, term: string): boolean {
  const normalizedTerm = compactWhitespace(term).toLowerCase();
  if (!normalizedTerm) return false;
  if (containsZh(normalizedTerm)) return text.includes(normalizedTerm);
  return escapedTermPattern(normalizedTerm).test(text);
}

function matchedBucketTerms(text: string, terms: string[]): string[] {
  return uniqueStrings(terms.filter((term) => textMatchesTerm(text, term)));
}

function scoreBucketText(input: {
  fullText: string;
  titleText: string;
  definition: BucketEntityDefinition;
}): { score: number; matched: string[] } {
  const matched = matchedBucketTerms(input.fullText, input.definition.terms);
  const strongMatched = matchedBucketTerms(input.fullText, input.definition.strongTerms ?? []);
  const titleMatched = matchedBucketTerms(input.titleText, input.definition.terms);
  let score = Math.min(
    0.98,
    matched.length * 0.12 + strongMatched.length * 0.2 + Math.min(0.16, titleMatched.length * 0.08),
  );
  if (strongMatched.length >= 2) score = Math.max(score, 0.78);
  if (strongMatched.length >= 1 && matched.length >= 2) score = Math.max(score, 0.62);
  if (matched.length >= 3) score = Math.max(score, 0.58);
  if (matched.length >= 2 && titleMatched.length >= 1) score = Math.max(score, 0.52);
  if (matched.length === 1 && strongMatched.length === 1 && titleMatched.length === 1) {
    score = Math.max(score, 0.5);
  }
  return { score: Number(score.toFixed(3)), matched: uniqueStrings([...strongMatched, ...matched]) };
}

function pandaEntityDefinitions(): BucketEntityDefinition[] {
  return [
    {
      bucket: "terminology_usage",
      terms: [
        "熊貓",
        "貓熊",
        "panda",
        "cat-bear",
        "Chinese terminology",
        "terminology",
        "common name",
        "Taiwan",
        "Mainland China",
        "中文",
        "臺灣",
        "台灣",
        "中國大陸",
        "用法",
        "名稱",
      ],
      strongTerms: ["熊貓", "貓熊", "cat-bear", "Chinese terminology", "Taiwan panda terminology"],
      requiredSignals: ["panda terminology or Chinese usage"],
    },
    {
      bucket: "taxonomy_distinction",
      terms: [
        "大熊貓",
        "小熊貓",
        "紅熊貓",
        "giant panda",
        "red panda",
        "Ailuropoda melanoleuca",
        "Ailurus fulgens",
        "Ursidae",
        "Ailuridae",
        "taxonomy",
        "classification",
        "phylogeny",
        "phylogenetic",
        "comparative genomics",
        "convergent evolution",
        "false thumb",
        "Kretzoiarctos",
      ],
      strongTerms: [
        "giant panda",
        "red panda",
        "Ailuropoda melanoleuca",
        "Ailurus fulgens",
        "Ursidae",
        "Ailuridae",
        "Kretzoiarctos",
      ],
      requiredSignals: ["giant panda, red panda, or taxonomic name"],
    },
    {
      bucket: "naming_history",
      terms: [
        "naming history",
        "name origin",
        "etymology",
        "terminology history",
        "nomenclature",
        "cat-bear",
        "panda name",
        "命名史",
        "命名",
        "詞源",
        "名稱演變",
      ],
      strongTerms: ["naming history", "etymology", "命名史", "詞源", "cat-bear"],
      requiredSignals: ["naming or etymology signal"],
    },
    {
      bucket: "general_background",
      terms: ["panda", "giant panda", "red panda", "動物園", "zoo", "museum", "encyclopedia", "background"],
      strongTerms: ["giant panda", "red panda", "zoo", "museum"],
    },
  ];
}

function buildTopicEntityMap(topicText: string, queryPlan?: GroundingQueryPlan): TopicEntityMap {
  const text = compactWhitespace([
    topicText,
    queryPlan?.domain,
    queryPlan?.intent,
    ...(queryPlan?.primaryQueries ?? []),
    ...(queryPlan?.secondaryQueries ?? []),
    ...(queryPlan?.conceptGroups ?? []).flatMap((group) => [group.name, ...group.zhTerms, ...group.enTerms]),
  ].join(" ")).toLowerCase();

  if (/牙菌斑|牙垢|口腔生物膜|牙周病|dental plaque|oral biofilm|dental biofilm|periodontal|plaque control/i.test(text)) {
    return {
      buckets: [
        "oral_biofilm_formation",
        "plaque_control_treatment",
        "periodontal_context",
        "official_medical_background",
        "off_topic",
      ],
      definitions: [
        {
          bucket: "oral_biofilm_formation",
          terms: [
            "牙菌斑",
            "牙垢",
            "口腔生物膜",
            "dental plaque",
            "oral biofilm",
            "dental biofilm",
            "biofilm formation",
            "plaque formation",
          ],
          strongTerms: ["dental plaque", "oral biofilm", "牙菌斑", "口腔生物膜"],
          requiredSignals: ["dental plaque / oral biofilm formation signal"],
        },
        {
          bucket: "plaque_control_treatment",
          terms: [
            "plaque control",
            "chlorhexidine",
            "scaling",
            "dental scaling",
            "oral hygiene",
            "periodontal therapy",
            "treatment",
            "therapy",
            "牙菌斑控制",
            "治療",
            "口腔衛生",
            "洗牙",
          ],
          strongTerms: ["plaque control", "periodontal therapy", "chlorhexidine", "scaling"],
        },
        {
          bucket: "periodontal_context",
          terms: [
            "periodontal disease",
            "periodontitis",
            "gingivitis",
            "dental caries",
            "牙周病",
            "牙齦炎",
            "齲齒",
          ],
          strongTerms: ["periodontal disease", "periodontitis", "牙周病"],
        },
        {
          bucket: "official_medical_background",
          terms: [
            "WHO",
            "CDC",
            "NIH",
            "dental association",
            "official guideline",
            "public health",
            "oral health",
            "university extension",
            "government",
          ],
          strongTerms: ["WHO", "CDC", "NIH", "dental association", "official guideline"],
        },
      ],
      offTopicPatterns: [
        /tooth whitening/i,
        /cosmetic dentistry marketing/i,
        /dental clinic advertisement/i,
        /product shopping/i,
        /牙齒美白/u,
        /診所廣告/u,
        /產品購買/u,
      ],
      backgroundSourceNeeded: true,
    };
  }

  if (/狗|犬|護食|資源防衛|食物攻擊|犬類行為|dog|canine|resource guarding|food aggression|veterinary behavior/i.test(text)) {
    return {
      buckets: [
        "canine_resource_guarding_behavior",
        "behavior_modification_training",
        "veterinary_behavior_background",
        "general_background",
        "off_topic",
      ],
      definitions: [
        {
          bucket: "canine_resource_guarding_behavior",
          terms: [
            "狗",
            "犬",
            "dog",
            "canine",
            "domestic dog",
            "resource guarding",
            "food guarding",
            "food aggression",
            "possession aggression",
            "護食",
            "資源防衛",
            "食物攻擊",
          ],
          strongTerms: ["resource guarding", "food aggression", "food guarding", "護食", "資源防衛"],
          requiredSignals: ["dog/canine plus resource guarding/food aggression signal"],
        },
        {
          bucket: "behavior_modification_training",
          terms: [
            "behavior modification",
            "behavior therapy",
            "positive reinforcement",
            "desensitization",
            "counterconditioning",
            "training",
            "management",
            "行為矯正",
            "正向增強",
            "減敏",
            "反制約",
            "訓練",
          ],
          strongTerms: [
            "positive reinforcement",
            "behavior modification",
            "desensitization",
            "counterconditioning",
          ],
        },
        {
          bucket: "veterinary_behavior_background",
          terms: [
            "veterinary behavior",
            "animal behavior",
            "canine aggression",
            "aggression in dogs",
            "animal welfare",
            "獸醫行為學",
            "犬類攻擊",
            "動物福利",
          ],
          strongTerms: ["veterinary behavior", "canine aggression", "animal behavior", "獸醫行為學"],
        },
        {
          bucket: "general_background",
          terms: ["animal welfare", "veterinary association", "university extension", "official", "guideline"],
          strongTerms: ["animal welfare", "veterinary association", "university extension"],
        },
      ],
      offTopicPatterns: [
        /dog food product/i,
        /dog food review/i,
        /guard dog/i,
        /police dog/i,
        /military dog/i,
        /product shopping/i,
        /寵物食品/u,
        /狗糧/u,
        /警犬/u,
        /軍犬/u,
        /看門犬/u,
      ],
      backgroundSourceNeeded: true,
    };
  }

  if (/熊貓|貓熊|大熊貓|小熊貓|小貓熊|紅熊貓|giant panda|red panda|ailuropoda|ailurus|cat-bear|chinese terminology/i.test(text)) {
    return {
      buckets: ["terminology_usage", "taxonomy_distinction", "naming_history", "general_background", "off_topic"],
      definitions: pandaEntityDefinitions(),
      offTopicPatterns: [
        /vaquita/i,
        /polar bear/i,
        /faecal microbiota|fecal microbiota|gut microbiota/i,
        /deep learning/i,
        /sign language|lexical comprehension/i,
        /spider monkey|salmonella|microplastics/i,
      ],
      backgroundSourceNeeded: true,
      missingProviderReason: "terminology_usage/naming_history need trusted background or official web routing beyond academic providers",
    };
  }

  if (/玉佩|玉器|玉飾|jade pendant|jade ornament|chinese jade|material culture|archaeology/i.test(text)) {
    return {
      buckets: ["archaeology_history_culture", "general_background", "off_topic"],
      definitions: [
        {
          bucket: "archaeology_history_culture",
          terms: [
            "玉佩",
            "玉器",
            "玉飾",
            "jade pendant",
            "jade ornament",
            "Chinese jade",
            "material culture",
            "archaeology",
            "ritual",
            "burial",
            "craftsmanship",
            "symbolism",
            "文化",
            "歷史",
            "象徵",
            "考古",
            "禮制",
          ],
          strongTerms: ["玉佩", "jade pendant", "Chinese jade", "archaeology", "material culture", "ritual"],
          requiredSignals: ["jade object plus archaeology/history/culture signal"],
        },
        {
          bucket: "general_background",
          terms: ["museum", "British Museum", "Smithsonian", "Metropolitan Museum", "文化背景", "博物館"],
          strongTerms: ["museum", "博物館"],
        },
      ],
      offTopicPatterns: [/biomedical|clinical|protein|virus|scattering|tourism|photography/i],
      backgroundSourceNeeded: true,
    };
  }

  if (/愛滋病|人類免疫缺乏病毒|免疫系統|hiv|aids|human immunodeficiency virus|immune system|cd4/i.test(text)) {
    return {
      buckets: ["biomedical", "general_background", "off_topic"],
      definitions: [
        {
          bucket: "biomedical",
          terms: [
            "愛滋病",
            "人類免疫缺乏病毒",
            "免疫系統",
            "HIV",
            "AIDS",
            "human immunodeficiency virus",
            "immune system",
            "CD4",
            "T cell",
            "viral replication",
            "pathogenesis",
            "antiretroviral",
          ],
          strongTerms: ["HIV", "AIDS", "human immunodeficiency virus", "CD4", "immune system", "免疫系統"],
          requiredSignals: ["HIV/AIDS immune-system mechanism"],
        },
        {
          bucket: "general_background",
          terms: ["WHO", "CDC", "NIH", "public health", "official", "medical background"],
          strongTerms: ["WHO", "CDC", "NIH"],
        },
      ],
      offTopicPatterns: [/computer virus|marketing|tourism|photography|poem/i],
      backgroundSourceNeeded: true,
    };
  }

  if (/夕陽|餘暉|日落|sunset|twilight|rayleigh|wavelength|大氣散射|mie scattering|atmospheric optics/i.test(text)) {
    return {
      buckets: ["physics_atmospheric_optics", "general_background", "off_topic"],
      definitions: [
        {
          bucket: "physics_atmospheric_optics",
          terms: [
            "夕陽",
            "餘暉",
            "日落",
            "sunset",
            "twilight",
            "Rayleigh scattering",
            "Mie scattering",
            "wavelength",
            "atmospheric optics",
            "atmospheric scattering",
            "aerosol",
            "sky color",
            "red light",
            "瑞利散射",
            "米氏散射",
            "波長",
            "大氣光學",
            "大氣散射",
          ],
          strongTerms: ["Rayleigh scattering", "wavelength", "atmospheric optics", "瑞利散射", "波長"],
          requiredSignals: ["Rayleigh scattering, wavelength, or atmospheric-optics signal"],
        },
        {
          bucket: "general_background",
          terms: ["NASA", "NOAA", "UCAR", "education", "official", "科普"],
          strongTerms: ["NASA", "NOAA", "UCAR"],
        },
      ],
      offTopicPatterns: [/旅遊|攝影|詩詞|wallpaper|photography|travel|poem|tourism/i],
      backgroundSourceNeeded: true,
    };
  }

  return {
    buckets: ["general_academic", "general_background", "off_topic"],
    definitions: [
      {
        bucket: "general_academic",
        terms: uniqueStrings([
          ...(queryPlan?.conceptGroups ?? []).flatMap((group) => [group.name, ...group.zhTerms, ...group.enTerms]),
          ...(queryPlan?.primaryQueries ?? []),
        ]).slice(0, 24),
      },
      {
        bucket: "general_background",
        terms: ["official", "government", "museum", "education", "encyclopedia", "background"],
      },
    ],
    offTopicPatterns: [/wallpaper|photography|travel|marketing|brand strategy/i],
    backgroundSourceNeeded: false,
  };
}

function sourceHasAcademicTraceForBucket(input: {
  provider: SourceCandidate["provider"];
  sourceType?: SourceCandidate["sourceType"];
  doi?: string | null;
  url?: string | null;
  venue?: string | null;
  isPeerReviewed?: boolean | null;
}): boolean {
  const providerAcademic = isScholarlyProvider(input.provider);
  return (
    input.sourceType === "paper" ||
    input.sourceType === "review" ||
    Boolean(input.doi) ||
    /doi\.org\/|^10\.\d{4,9}\//i.test(input.url ?? "") ||
    input.isPeerReviewed === true ||
    (providerAcademic && Boolean(input.venue))
  );
}

function assessSourceBucket(input: {
  source: BucketSource;
  topicEntityMap: TopicEntityMap;
  provider: SourceCandidate["provider"];
  sourceType?: SourceCandidate["sourceType"];
  doi?: string | null;
  url?: string | null;
  venue?: string | null;
  isPeerReviewed?: boolean | null;
  sourceQualityScore: number;
  relevanceScore: number;
}): SourceBucketAssessment {
  const fullText = sourceBucketText(input.source);
  const titleText = compactWhitespace(input.source.title ?? "").toLowerCase();
  const bucketScores: Partial<Record<SourceResearchBucket, number>> = {};
  const matchedByBucket = new Map<SourceResearchBucket, string[]>();
  for (const definition of input.topicEntityMap.definitions) {
    const scored = scoreBucketText({ fullText, titleText, definition });
    bucketScores[definition.bucket] = scored.score;
    matchedByBucket.set(definition.bucket, scored.matched);
  }

  const bestEntry =
    Object.entries(bucketScores)
      .filter((entry): entry is [SourceResearchBucket, number] => typeof entry[1] === "number")
      .sort((left, right) => right[1] - left[1])[0] ?? ["general_academic", 0];
  const offTopicHit = input.topicEntityMap.offTopicPatterns.some((pattern) => pattern.test(fullText));
  const bestScore = bestEntry[1];
  const offTopicScore = offTopicHit && bestScore < 0.72 ? 0.92 : bestScore < 0.12 ? 0.45 : 0;
  if (offTopicScore > 0) bucketScores.off_topic = offTopicScore;
  const bucket: SourceResearchBucket =
    offTopicScore >= 0.65 ? "off_topic" : bestEntry[0];
  const bucketScore = bucket === "off_topic" ? offTopicScore : bestScore;
  const matchedEntities = bucket === "off_topic"
    ? []
    : matchedByBucket.get(bucket) ?? [];
  const definition = input.topicEntityMap.definitions.find((item) => item.bucket === bucket);
  const missingRequiredSignals =
    bucket === "off_topic"
      ? ["topic entity match"]
      : (definition?.requiredSignals ?? []).filter((signal) => matchedEntities.length === 0 || bucketScore < 0.35);
  const academicTrace = sourceHasAcademicTraceForBucket(input);
  const sourceLooksOfficial =
    input.provider === "web" ||
    input.sourceType === "official" ||
    input.sourceType === "education" ||
    /official|government|museum|zoo|nasa|noaa|who|cdc|nih|dental association|veterinary association|animal welfare|university extension|smithsonian|british museum|metropolitan museum|教育|博物館|動物園/i.test(
      fullText,
    );
  const scholarlyAcceptedBuckets: SourceResearchBucket[] = [
    "taxonomy_distinction",
    "biomedical",
    "physics_atmospheric_optics",
    "oral_biofilm_formation",
    "plaque_control_treatment",
    "periodontal_context",
    "canine_resource_guarding_behavior",
    "behavior_modification_training",
  ];
  const backgroundOnlyBuckets: SourceResearchBucket[] = [
    "terminology_usage",
    "naming_history",
    "general_background",
    "official_medical_background",
    "veterinary_behavior_background",
  ];
  let decision: SourceBucketDecision = "manual_review";
  let sourceUseCase: SourceUseCase = "manual_review_only";
  const decisionReasons: string[] = [];
  let highConfidenceManual = false;

  if (bucket === "off_topic") {
    decision = "rejected";
    sourceUseCase = "rejected";
    decisionReasons.push("明顯命中 off_topic bucket，且缺少本題必要實體。");
  } else if (
    scholarlyAcceptedBuckets.includes(bucket) &&
    bucketScore >= 0.52 &&
    academicTrace &&
    input.sourceQualityScore >= 0.45
  ) {
    decision = "accepted";
    sourceUseCase = "academic_claim";
    decisionReasons.push(`${bucket} bucket strong match with academic/traceable metadata.`);
  } else if (bucket === "archaeology_history_culture" && bucketScore >= 0.52 && academicTrace) {
    decision = "accepted";
    sourceUseCase = "academic_claim";
    decisionReasons.push("humanities/culture bucket strong match with traceable scholarly metadata.");
  } else if (
    backgroundOnlyBuckets.includes(bucket) &&
    bucketScore >= 0.48 &&
    (sourceLooksOfficial || !academicTrace)
  ) {
    decision = "fallback_review";
    sourceUseCase = "background_context";
    decisionReasons.push(`${bucket} bucket supports background context, not strict academic claims.`);
  } else if (bucketScore >= 0.38) {
    decision = "manual_review";
    sourceUseCase = academicTrace ? "academic_claim" : "manual_review_only";
    highConfidenceManual = bucketScore >= 0.45;
    decisionReasons.push(`${bucket} bucket partial match requires human confirmation.`);
  } else {
    decision = input.relevanceScore >= 0.18 ? "manual_review" : "rejected";
    sourceUseCase = decision === "rejected" ? "rejected" : "manual_review_only";
    decisionReasons.push(
      decision === "rejected"
        ? "missing required bucket signals for this topic."
        : "weak_or_uncertain: partial relevance but insufficient bucket confidence.",
    );
  }

  return {
    bucket,
    bucketScore: Number(Math.max(0, Math.min(1, bucketScore)).toFixed(3)),
    bucketScores,
    decision,
    decisionReasons: uniqueStrings(decisionReasons),
    matchedEntities,
    missingRequiredSignals,
    sourceUseCase,
    highConfidenceManual,
  };
}

function bucketCountsForCandidates(candidates: SourceCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    const bucket = candidate.sourceBucket ?? "general_academic";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }
  return counts;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = compactWhitespace(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function evidenceFacetsForSource(source: {
  title: string;
  abstract?: string | null;
}): string[] {
  const text = [source.title, source.abstract].filter(Boolean).join(" ");
  const patterns: Array<{ label: string; pattern: RegExp }> = [
    { label: "微化石", pattern: /微化石|microfossil/i },
    { label: "藻類化石", pattern: /藻類|藻|algae|algal|fossil algae/i },
    { label: "古環境重建", pattern: /古環境|paleoenvironment|palaeoenvironment/i },
    { label: "沉積環境", pattern: /沉積|sediment|sedimentary|marine shale/i },
    { label: "疊層石與藍綠菌", pattern: /疊層石|藍綠菌|stromatolite|cyanobacteria/i },
    { label: "化石保存", pattern: /保存|preservation|soft tissue/i },
    { label: "化石紀錄", pattern: /化石紀錄|fossil record/i },
    { label: "天文距離", pattern: /恆星距離|星星距離|光年|視差|stellar distance|astronomical distance|light[-\s]?year|parallax/i },
    { label: "天文教育", pattern: /天文教育|科學教育|博物館展示|大眾理解|astronomy education|science education|museum exhibition|public understanding|planetarium/i },
    { label: "農業廢棄物", pattern: /農業廢料|農業廢棄物|畜牧廢棄物|agricultural waste|farm waste|agricultural residues|manure/i },
    { label: "水土污染", pattern: /水質污染|土壤污染|逕流|徑流|富營養化|water pollution|soil contamination|runoff|eutrophication|nutrient pollution/i },
    { label: "AI 與工作", pattern: /人工智慧|生成式AI|(^|[^A-Za-z])AI(?=$|[^A-Za-z])|artificial intelligence|generative AI|future of work|workplace|labor market|employment|job transformation|勞動市場|職務變遷|工作本質/i },
    { label: "含糖飲料", pattern: /可樂|汽水|碳酸飲料|含糖飲料|cola|soda|soft drinks?|sugar[-\s]?sweetened beverages?|carbonated beverages?|sugary drinks?/i },
    { label: "糖分與咖啡因", pattern: /糖分|游離糖|添加糖|咖啡因|sugar|free sugar|added sugar|caffeine/i },
    { label: "健康風險", pattern: /肥胖|代謝|蛀牙|牙齒|糖尿病|心血管|公共衛生|obesity|metabolic|diabetes|cardiovascular|dental|caries|public health/i },
    { label: "牙菌斑形成", pattern: /牙菌斑形成|牙菌斑|dental plaque|plaque formation|biofilm formation/i },
    { label: "口腔生物膜", pattern: /口腔生物膜|oral biofilm|dental biofilm/i },
    { label: "牙周治療", pattern: /牙周治療|牙周病|periodontal therapy|periodontal treatment|periodontal disease|periodontitis/i },
    { label: "牙菌斑控制", pattern: /牙菌斑控制|plaque control|chlorhexidine|scaling|洗牙/i },
    { label: "口腔衛生", pattern: /口腔衛生|oral hygiene|prevention|預防/i },
    { label: "護食行為", pattern: /護食|food guarding|resource guarding/i },
    { label: "資源防衛", pattern: /資源防衛|resource guarding|possession aggression/i },
    { label: "食物攻擊", pattern: /食物攻擊|food aggression/i },
    { label: "行為矯正", pattern: /行為矯正|behavior modification|behavior therapy|desensitization|counterconditioning/i },
    { label: "正向增強訓練", pattern: /正向增強|positive reinforcement|training|訓練/i },
    { label: "獸醫行為學", pattern: /獸醫行為學|veterinary behavior|animal behavior|canine aggression/i },
    { label: "測量或分類證據", pattern: /測量|分類|indicator|classification|structures/i },
    { label: "影響與關聯", pattern: /影響|關係|relationship|effect|impact/i },
    { label: "研究方法", pattern: /方法|method|model|analysis|reconstruction/i },
  ];
  return patterns
    .filter((entry) => entry.pattern.test(text))
    .map((entry) => entry.label)
    .slice(0, 4);
}

function paleontologyAlgaeSourceText(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): string {
  return compactWhitespace(
    [
      source.title,
      source.abstract,
      source.venue,
      source.publisher,
      source.sourceType,
      source.url,
      ...(source.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasPaleontologyAlgaeSourceEvidence(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): boolean {
  const text = paleontologyAlgaeSourceText(source);
  const algaeOrMicrofossil =
    /藻類|藻|微化石|疊層石|藍綠菌|algae|algal|microfossil|stromatolite|cyanobacteria/i.test(
      text,
    );
  const fossilOrEnvironment =
    /化石|古環境|古生態|地層|沉積|fossil|paleoenvironment|palaeoenvironment|paleoecology|palaeoecology|stratigraphy|sediment|sedimentary|precambrian|proterozoic|archaean|archean/i.test(
      text,
    );
  return algaeOrMicrofossil && fossilOrEnvironment;
}

function astronomyScienceEducationSourceText(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): string {
  return compactWhitespace(
    [
      source.title,
      source.abstract,
      source.venue,
      source.publisher,
      source.sourceType,
      source.url,
      ...(source.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasAstronomyScienceEducationSourceEvidence(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): boolean {
  const text = astronomyScienceEducationSourceText(source);
  const astronomyOrDistance =
    /星星|恆星|星系|天文|宇宙|光年|視差|天體|astronomy|astronomical|stellar|\bstars?\b|galaxy|cosmos|parallax|light[-\s]?year|celestial|planetarium/i.test(
      text,
    );
  const educationOrCommunication =
    /科學教育|博物館|展示|大眾理解|科普|教材|教學|education|museum|exhibition|display|public understanding|science communication|outreach|informal learning|learning outcome/i.test(
      text,
    );
  const distanceMethod =
    /恆星距離|星星距離|astronomical distance|stellar distance|distance scale|parallax|light[-\s]?year/i.test(
      text,
    );
  return astronomyOrDistance && (educationOrCommunication || distanceMethod);
}

function agriculturalWastePollutionSourceText(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): string {
  return compactWhitespace(
    [
      source.title,
      source.abstract,
      source.venue,
      source.publisher,
      source.sourceType,
      source.url,
      ...(source.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasAgriculturalWastePollutionSourceEvidence(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): boolean {
  const text = agriculturalWastePollutionSourceText(source);
  const agricultureOrWaste =
    /農業|農作|農田|畜牧|養殖|糞肥|肥料|農藥|作物|農業廢料|農業廢棄物|畜牧廢棄物|agricultur|farm|crop|livestock|manure|fertili[sz]er|pesticide|agricultural waste|farm waste|agricultural residues/i.test(
      text,
    );
  const pollutionOrPathway =
    /污染|水質|土壤|逕流|徑流|富營養化|廢水|氮|磷|重金屬|環境影響|pollution|contamination|water quality|soil contamination|runoff|eutrophication|wastewater|nutrient|nitrogen|phosphorus|heavy metal|environmental impact/i.test(
      text,
    );
  const managementEvidence =
    /廢棄物管理|污染防治|處理|堆肥|再利用|waste management|pollution control|treatment|compost|reuse|recycling/i.test(
      text,
    );
  return agricultureOrWaste && (pollutionOrPathway || managementEvidence);
}

function aiWorkImpactSourceText(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): string {
  return compactWhitespace(
    [
      source.title,
      source.abstract,
      source.venue,
      source.publisher,
      source.sourceType,
      source.url,
      ...(source.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasAiWorkImpactSourceEvidence(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): boolean {
  const text = aiWorkImpactSourceText(source);
  const aiCue =
    /人工智慧|生成式AI|大型語言模型|機器學習|(^|[^A-Za-z])AI(?=$|[^A-Za-z])|artificial intelligence|generative AI|large language model|machine learning|automation/i.test(
      text,
    );
  const workCue =
    /工作|職務|職業|就業|勞動|勞工|組織|職場|技能|工作本質|勞動市場|work|job|employment|labor|labour|occupation|task|skill|workplace|organization|organisation|future of work|work practice/i.test(
      text,
    );
  const transformationCue =
    /影響|轉型|變遷|替代|自動化|生產力|管理|impact|transformation|change|displacement|automation|productivity|management/i.test(
      text,
    );
  return aiCue && workCue && transformationCue;
}

function colaHealthSourceText(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): string {
  return compactWhitespace(
    [
      source.title,
      source.abstract,
      source.venue,
      source.publisher,
      source.sourceType,
      source.url,
      ...(source.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function hasColaHealthSourceEvidence(
  source: ReturnType<typeof sourceRecordToNormalizedSource>,
): boolean {
  const text = colaHealthSourceText(source);
  const beverageCue =
    /可樂|汽水|碳酸飲料|含糖飲料|含糖碳酸飲料|cola|soda|soft drink|soft drinks|sugar[-\s]?sweetened beverage|sugar[-\s]?sweetened beverages|SSB|SSBs|carbonated beverage|carbonated soft drink|sugary drink|sugary drinks/i.test(
      text,
    );
  const healthOrConsumptionCue =
    /健康|糖|糖分|游離糖|咖啡因|攝取|飲用|肥胖|代謝|蛀牙|牙齒|公共衛生|health|sugar|added sugar|free sugar|caffeine|consumption|intake|obesity|metabolic|diabetes|cardiovascular|dental|caries|public health|adolescents?|children/i.test(
      text,
    );
  const driftOnlyCue =
    /microplastic|microplastics|nanoplastic|plastic pollution|塑膠微粒|微塑膠|微塑料|marine debris|foodborne illness|salmonella/i.test(
      text,
    ) && !beverageCue;
  return beverageCue && healthOrConsumptionCue && !driftOnlyCue;
}

function sourceCandidateZhSummary(input: {
  topic: string;
  normalized: ReturnType<typeof sourceRecordToNormalizedSource>;
  sourceType: SourceCandidate["sourceType"];
  provider: SourceCandidate["provider"];
  reviewStatus: SourceCandidate["reviewStatus"];
}): string | null {
  const abstract = compactWhitespace(input.normalized.abstract ?? "");
  const title = compactWhitespace(input.normalized.title);
  if (!abstract && !title) return null;

  const topic = compactWhitespace(input.topic);
  if (
    input.reviewStatus === "rejected" &&
    isPaleontologyAlgaeTopic(topic) &&
    !hasPaleontologyAlgaeSourceEvidence(input.normalized)
  ) {
    const sourceFocus = truncateText(abstract || title, 90);
    return truncateText(
      `中文摘要：此來源主要呈現「${sourceFocus}」。題名與摘要未顯示藻類、微化石、疊層石、古環境或沉積環境等核心證據，因此不作為「${topic}」的主要來源。`,
      260,
    );
  }
  if (
    input.reviewStatus === "rejected" &&
    isAstronomyScienceEducationTopic(topic) &&
    !hasAstronomyScienceEducationSourceEvidence(input.normalized)
  ) {
    const sourceFocus = truncateText(abstract || title, 90);
    return truncateText(
      `中文摘要：此來源主要呈現「${sourceFocus}」。題名與摘要未顯示天文、恆星距離、視差、光年、天文教育或博物館科學展示等核心證據，因此不作為「${topic}」的主要來源。`,
      260,
    );
  }
  if (
    input.reviewStatus === "rejected" &&
    isAgriculturalWastePollutionTopic(topic) &&
    !hasAgriculturalWastePollutionSourceEvidence(input.normalized)
  ) {
    const sourceFocus = truncateText(abstract || title, 90);
    return truncateText(
      `中文摘要：此來源主要呈現「${sourceFocus}」。題名與摘要未顯示農業廢棄物、農業逕流、水質或土壤污染、富營養化、污染防治等核心證據，因此不作為「${topic}」的主要來源。`,
      260,
    );
  }
  if (
    input.reviewStatus === "rejected" &&
    isAiWorkImpactTopic(topic) &&
    !hasAiWorkImpactSourceEvidence(input.normalized)
  ) {
    const sourceFocus = truncateText(abstract || title, 90);
    return truncateText(
      `中文摘要：此來源主要呈現「${sourceFocus}」。題名與摘要未同時顯示 AI、工作／勞動市場／職務變遷，以及影響或轉型證據，因此不作為「${topic}」的主要來源。`,
      260,
    );
  }
  if (
    input.reviewStatus === "rejected" &&
    isColaHealthTopic(topic) &&
    !hasColaHealthSourceEvidence(input.normalized)
  ) {
    const sourceFocus = truncateText(abstract || title, 90);
    return truncateText(
      `中文摘要：此來源主要呈現「${sourceFocus}」。題名與摘要未同時顯示可樂／含糖飲料、糖分或咖啡因、攝取習慣與健康結果等核心證據，因此不作為「${topic}」的主要來源。`,
      260,
    );
  }
  const facets = evidenceFacetsForSource({
    title,
    abstract,
  });
  const facetText =
    facets.length > 0
      ? `可辨識的證據面向包括${facets.join("、")}。`
      : "可作為主題背景、研究方法或文獻脈絡的初步證據。";
  const traceability = uniqueStrings([
    input.normalized.doi ? "DOI" : "",
    input.normalized.url ? "來源連結" : "",
    input.normalized.isPeerReviewed ? "同儕審查線索" : "",
    input.normalized.venue ? "期刊或會議資訊" : "",
  ]);
  const traceabilityText =
    traceability.length > 0
      ? `已取得${traceability.join("、")}，可追溯原始來源。`
      : "目前主要依題名與資料庫 metadata 判讀，正式引用前需再核對原始來源。";
  const statusText =
    input.reviewStatus === "accepted"
      ? "系統初評為可直接納入證據整理。"
      : input.reviewStatus === "review"
        ? "系統初評為主要候選，仍建議在來源管理階段人工確認。"
        : "系統初評為不建議採用，除非人工確認其與主題高度相關。";

  return truncateText(
    `中文摘要：此來源可用於檢視「${topic}」。${facetText}${traceabilityText}${statusText}`,
    260,
  );
}

function alignCandidateSummaryWithReviewStatus(
  candidate: SourceCandidateWithSignals,
): SourceCandidateWithSignals {
  if (!candidate.abstractZh) return candidate;
  const statusText =
    candidate.reviewStatus === "accepted"
      ? "系統初評為可直接納入證據整理。"
      : candidate.reviewStatus === "review"
        ? "系統初評為主要候選，仍建議在來源管理階段人工確認。"
        : "系統初評為不建議採用，除非人工確認其與主題高度相關。";
  return {
    ...candidate,
    abstractZh: candidate.abstractZh.replace(
      /系統初評為(?:可直接納入證據整理|主要候選，仍建議在來源管理階段人工確認|不建議採用，除非人工確認其與主題高度相關)。?/u,
      statusText,
    ),
  };
}

function detectLanguage(topic: string): TopicAnalysis["detectedLanguage"] {
  const hasZh = containsZh(topic);
  const hasLatin = containsLatin(topic);
  if (hasZh && hasLatin) return "mixed";
  if (hasZh) return "zh";
  if (hasLatin) return "en";
  return "unknown";
}

function normalizeCompareValue(value: string): string {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[「」"'`]/g, "")
    .replace(/[()（）,，、:：;；.。!?！？]/g, " ");
}

function normalizeCompareList(values: string[]): string[] {
  return uniqueStrings(values.map(normalizeCompareValue)).sort();
}

function charSimilarity(left: string, right: string): number {
  const leftChars = new Set(left.replace(/\s+/g, ""));
  const rightChars = new Set(right.replace(/\s+/g, ""));
  if (leftChars.size === 0 || rightChars.size === 0) return 0;
  const overlap = Array.from(leftChars).filter((char) => rightChars.has(char)).length;
  return overlap / Math.max(leftChars.size, rightChars.size);
}

function listsSemanticallyEquivalent(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeCompareList(left);
  const normalizedRight = normalizeCompareList(right);
  if (JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight)) return true;
  if (normalizedLeft.length !== normalizedRight.length) return false;
  return normalizedLeft.every((item, index) => charSimilarity(item, normalizedRight[index] ?? "") >= 0.6);
}

function classifyNonsense(topic: string): string | null {
  const normalized = compactWhitespace(topic);
  if (!normalized) return "empty";
  if (/幫我(做|寫|產生|生成).{0,6}報告|做一份報告|寫一份報告|我要研究(一個)?(東西|主題)|研究一個東西|報告題目|隨便.*報告/u.test(normalized)) {
    return "missing_research_subject";
  }
  if (!/[A-Za-z0-9\u3400-\u9fff]/u.test(normalized)) return "symbol_only";
  const stripped = normalized.replace(/\s+/g, "");
  if (/^[?？!！.。]+$/u.test(stripped)) return "punctuation_only";
  if (/[ㄅ-ㄩ]/u.test(stripped) && !/[\u3400-\u9fff]/u.test(stripped)) return "phonetic_garbage";
  if (/^(?:asdf|qwer|qwerty|zzz|xxx|abc)(?:\s+(?:asdf|qwer|qwerty|zzz|xxx|abc))*$/i.test(normalized)) {
    return "ascii_garbage";
  }
  if (/^[A-Za-z0-9_-]+$/.test(stripped)) {
    const vowels = (stripped.match(/[aeiou]/gi) ?? []).length;
    const hasDigit = /\d/.test(stripped);
    if (stripped.length <= 3) return "too_short";
    if (hasDigit && stripped.length <= 8) return "ascii_garbage";
    if (hasDigit && vowels === 0) return "ascii_garbage";
    if (/^[a-z]{8,}\d+$/i.test(stripped)) return "ascii_garbage";
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(stripped)) return "ascii_garbage";
    if (/^(test){2,}$/i.test(stripped)) return "repeated_placeholder";
  }
  return null;
}

function domainSignals(topic: string): DomainHypothesis[] {
  const normalized = compactWhitespace(topic);
  const text = normalized.toLowerCase();
  const signals: DomainHypothesis[] = [];

  const rules: Array<{
    domain: string;
    confidence: number;
    pattern: RegExp;
    evidence: string[];
  }> = [
    {
      domain: "chemistry_materials",
      confidence: 0.82,
      pattern: /反應|電鍍|燃料電池|聚乳酸|銅綠|氧化|還原|酸鹼|材料|降解|chemical|reaction/i,
      evidence: ["chemistry/material keyword match"],
    },
    {
      domain: "biology_medicine",
      confidence: 0.84,
      pattern: /抗藥性|珊瑚|發芽|發酵|藍綠菌|蚊子|心率|生長|biology|medical|antibiotic|coral/i,
      evidence: ["biology/medical keyword match"],
    },
    {
      domain: "physics_engineering",
      confidence: 0.8,
      pattern: /太陽帆|輻射壓|光壓|航天推進|深空探測|電磁感應|太陽能|熱傳導|橋樑|水火箭|承重|效率|physics|engineering|induction|solar sail|radiation pressure|spacecraft propulsion/i,
      evidence: ["physics/engineering keyword match"],
    },
    {
      domain: "social_science",
      confidence: 0.78,
      pattern: /學習|注意力|壓力|校園|閱讀|寫作|教育|犯罪|公共衛生|政策|social|education|policy/i,
      evidence: ["social-science keyword match"],
    },
    {
      domain: "geography_ecology_geology",
      confidence: 0.88,
      pattern: /黃石國家公園|yellowstone|國家公園|地質|火山系統|保育|生態|觀光管理/i,
      evidence: ["geography / ecology / geology keyword match"],
    },
    {
      domain: "mixed_biology_culture_linguistics",
      confidence: 0.9,
      pattern: /熊貓|貓熊|大熊貓|小熊貓|小貓熊|giant panda|red panda|Ailuropoda|Ailurus|cat-bear|Chinese terminology/i,
      evidence: ["panda terminology, taxonomy, and Chinese usage keyword match"],
    },
    {
      domain: "folklore_mythology_literature",
      confidence: 0.86,
      pattern: /月兔|moon rabbit|玉兔|神話|民俗|傳說|文學|文化象徵/i,
      evidence: ["folklore / mythology / literature keyword match"],
    },
    {
      domain: "archaeology_material_culture",
      confidence: 0.86,
      pattern: /玉佩|jade pendant|玉器|禮制|考古|物質文化|工藝|儀式器物/i,
      evidence: ["archaeology / material culture keyword match"],
    },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(text) || rule.pattern.test(normalized)) {
      signals.push({
        domain: rule.domain,
        confidence: rule.confidence,
        evidence: rule.evidence,
        source: "rule",
      });
    }
  }

  const understanding = understandTopic(normalized);
  if (understanding.domain && understanding.domain !== "general_research") {
    signals.push({
      domain: understanding.domain,
      confidence: 0.7,
      evidence: uniqueStrings([understanding.domain, ...understanding.coreConcepts.slice(0, 3)]),
      source: "search_signal",
    });
  }

  if (signals.length === 0) {
    signals.push({
      domain: "general_research",
      confidence: 0.45,
      evidence: ["default general-research fallback"],
      source: "rule",
    });
  }

  return signals.sort((left, right) => right.confidence - left.confidence).slice(0, 4);
}

function completenessForTopic(
  topic: string,
  nonsenseReason: string | null,
  parse: ResearchTitleSentenceParse,
): TopicCompleteness {
  if (nonsenseReason) {
    return {
      level: "nonsense_input",
      score: 0,
      reason: `input flagged as ${nonsenseReason}`,
      missingFields: ["research_intent"],
      suggestedClarifyingQuestions: ["請輸入較完整的研究主題。"],
    };
  }

  const normalized = compactWhitespace(topic);
  if (parse.sentenceType === "effect_of_x_on_y" && parse.confidence >= 0.7) {
    return {
      level: "complete_topic",
      score: 0.95,
      reason: "detected independent and dependent variables",
      missingFields: [],
      suggestedClarifyingQuestions: [],
    };
  }

  if (
    parse.sentenceType === "correlation" ||
    parse.sentenceType === "comparison" ||
    parse.sentenceType === "mechanism"
  ) {
    return {
      level: "complete_topic",
      score: 0.88,
      reason: "detected a researchable sentence pattern",
      missingFields: [],
      suggestedClarifyingQuestions: [],
    };
  }

  if (normalized.length <= 8 || normalized.split(/\s+/).length <= 3) {
    return {
      level: "short_but_searchable",
      score: 0.72,
      reason: "topic is short but still contains searchable concepts",
      missingFields: [],
      suggestedClarifyingQuestions: [],
    };
  }

  if (/影響|關係|相關|比較/u.test(normalized) && parse.confidence < 0.55) {
    return {
      level: "missing_subject_or_variable",
      score: 0.38,
      reason: "relation is visible but variables are incomplete",
      missingFields: uniqueStrings(parse.missingFields.concat(["subject_or_variable"])),
      suggestedClarifyingQuestions: ["請補充研究對象、自變因或依變因。"],
    };
  }

  return {
    level: "broad_topic",
    score: 0.58,
    reason: "topic is meaningful but still broad enough to require grounding",
    missingFields: [],
    suggestedClarifyingQuestions: ["你想聚焦哪個變因、族群或比較條件？"],
  };
}

export function parseResearchTitleSentence(text: string): ResearchTitleSentenceParse {
  const originalText = compactWhitespace(text);
  const normalizedText = originalText.replace(/[「」"'`]/g, "");
  const warnings: string[] = [];
  const empty = {
    subject: [] as string[],
    independentVariables: [] as string[],
    dependentVariables: [] as string[],
    relation: [] as string[],
    conditions: [] as string[],
    scope: [] as string[],
    missingFields: [] as string[],
  };

  const effectPatterns = [
    /^(不同.+?)對(.+?)的影響$/u,
    /^(.+?)對(.+?)的影響$/u,
    /^(不同.+?)對(.+?)之影響$/u,
    /^(.+?)對(.+?)之影響$/u,
    /^effect of (.+?) on (.+)$/i,
  ];
  for (const pattern of effectPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1] && match?.[2]) {
      const iv = compactWhitespace(match[1]);
      const dv = compactWhitespace(match[2]);
      return {
        originalText,
        normalizedText,
        sentenceType: "effect_of_x_on_y",
        subject: uniqueStrings([dv]),
        independentVariables: [iv],
        dependentVariables: [dv],
        relation: ["影響"],
        conditions: /^不同/u.test(iv) ? [iv] : [],
        scope: [],
        confidence: 0.94,
        missingFields: [],
        warnings,
      };
    }
  }

  const correlationPatterns = [
    /^(.+?)與(.+?)的(?:關係|相關性)$/u,
    /^relationship between (.+?) and (.+)$/i,
    /^correlation between (.+?) and (.+)$/i,
  ];
  for (const pattern of correlationPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1] && match?.[2]) {
      const left = compactWhitespace(match[1]);
      const right = compactWhitespace(match[2]);
      return {
        originalText,
        normalizedText,
        sentenceType: "correlation",
        subject: uniqueStrings([left, right]),
        independentVariables: [left],
        dependentVariables: [right],
        relation: ["關係"],
        conditions: [],
        scope: [],
        confidence: 0.9,
        missingFields: [],
        warnings,
      };
    }
  }

  const mechanismPatterns = [
    /^(.+?)的(?:形成)?機制$/u,
    /^(.+?)生成機制$/u,
    /^(.+?)反應的反應機制$/u,
    /^mechanism of (.+)$/i,
  ];
  for (const pattern of mechanismPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      const subject = compactWhitespace(match[1]);
      return {
        originalText,
        normalizedText,
        sentenceType: "mechanism",
        subject: [subject],
        independentVariables: [],
        dependentVariables: [],
        relation: ["機制"],
        conditions: [],
        scope: [],
        confidence: 0.85,
        missingFields: [],
        warnings,
      };
    }
  }

  const comparisonPatterns = [
    /^不同(.+?)的(.+?)比較$/u,
    /^(.+?)比較$/u,
    /^comparison of (.+)$/i,
  ];
  for (const pattern of comparisonPatterns) {
    const match = normalizedText.match(pattern);
    if (match?.[1]) {
      const left = compactWhitespace(match[1]);
      const right = compactWhitespace(match[2] ?? "");
      return {
        originalText,
        normalizedText,
        sentenceType: "comparison",
        subject: uniqueStrings([left, right || normalizedText]),
        independentVariables: [left],
        dependentVariables: right ? [right] : [],
        relation: ["比較"],
        conditions: /^不同/u.test(normalizedText) ? [left] : [],
        scope: [],
        confidence: right ? 0.83 : 0.68,
        missingFields: right ? [] : ["dependent_variable"],
        warnings: right ? warnings : ["比較句型缺少明確比較指標。"],
      };
    }
  }

  if (normalizedText.length <= 12) {
    return {
      originalText,
      normalizedText,
      sentenceType: "broad_topic",
      ...empty,
      confidence: 0.52,
      missingFields: ["subject_or_variable"],
      warnings: ["主題過短，後續需靠 source grounding 補足研究方向。"],
    };
  }

  return {
    originalText,
    normalizedText,
    sentenceType: "descriptive",
    subject: [normalizedText],
    independentVariables: [],
    dependentVariables: [],
    relation: [],
    conditions: [],
    scope: [],
    confidence: 0.48,
    missingFields: ["research_relation"],
    warnings: ["尚未穩定解析為研究題目句型。"],
  };
}

export function analyzeTopicInput(input: {
  topic: string;
  workflowId: string;
  parsedInput?: ParsedResearchInput;
}): TopicAnalysis {
  const originalInput = compactWhitespace(input.topic);
  const normalizedTopic = originalInput.replace(/[「」"'`]/g, "");
  const titleParse = parseResearchTitleSentence(normalizedTopic);
  const nonsenseReason = classifyNonsense(normalizedTopic);
  const warnings: string[] = [];

  if (nonsenseReason) warnings.push(`topic flagged as ${nonsenseReason}`);
  if (
    detectLanguage(normalizedTopic) === "zh" &&
    !understandTopic(normalizedTopic).canonicalEnglishTopic &&
    (input.parsedInput?.queryPlan.enQueries.length ?? 0) === 0
  ) {
    warnings.push("english query translation is unavailable; keeping Chinese seed queries");
  }
  if (titleParse.confidence < 0.6) {
    warnings.push("title parser confidence below 0.6; preserve original topic for semantic safety");
  }

  return {
    workflowId: input.workflowId,
    topicHash: topicHashForWorkflow(normalizedTopic),
    originalInput,
    normalizedTopic,
    detectedLanguage: detectLanguage(normalizedTopic),
    isNonsenseInput: nonsenseReason !== null,
    topicCompleteness: completenessForTopic(normalizedTopic, nonsenseReason, titleParse),
    domainHypotheses: domainSignals(normalizedTopic),
    warnings,
  };
}

export function compareTitleSemantics(
  originalParse: ResearchTitleSentenceParse,
  candidateParse: ResearchTitleSentenceParse,
): TitleSemanticComparison {
  if (originalParse.confidence < 0.6 || candidateParse.confidence < 0.6) {
    return {
      isSemanticallyEquivalent: false,
      changedFields: [],
      reason: "parser confidence below 0.6; preserve original topic to avoid semantic drift",
    };
  }

  const changedFields: TitleSemanticComparison["changedFields"] = [];
  const fieldPairs: Array<
    [
      TitleSemanticComparison["changedFields"][number],
      string[],
      string[],
    ]
  > = [
    ["subject", originalParse.subject, candidateParse.subject],
    ["independentVariables", originalParse.independentVariables, candidateParse.independentVariables],
    ["dependentVariables", originalParse.dependentVariables, candidateParse.dependentVariables],
    ["relation", originalParse.relation, candidateParse.relation],
    ["conditions", originalParse.conditions, candidateParse.conditions],
    ["scope", originalParse.scope, candidateParse.scope],
  ];

  for (const [field, left, right] of fieldPairs) {
    if (!listsSemanticallyEquivalent(left, right)) {
      changedFields.push(field);
    }
  }

  return {
    isSemanticallyEquivalent: changedFields.length === 0,
    changedFields,
    reason:
      changedFields.length === 0
        ? "polished title preserves subject, variables, relation, conditions, and scope"
        : `semantic drift detected in: ${changedFields.join(", ")}`,
  };
}

export function createTopicTitleState(input: {
  originalTopic: string;
  polishedTitle?: string;
  acceptedDisplayTitle?: string;
  titlePolishMode?: TopicTitleState["titlePolishMode"];
}): TopicTitleState {
  const parse = parseResearchTitleSentence(input.originalTopic);
  return {
    originalTopic: compactWhitespace(input.originalTopic),
    ...(input.polishedTitle ? { polishedTitle: compactWhitespace(input.polishedTitle) } : {}),
    ...(input.acceptedDisplayTitle
      ? { acceptedDisplayTitle: compactWhitespace(input.acceptedDisplayTitle) }
      : {}),
    titlePolishMode: input.titlePolishMode ?? "none",
    semanticLock: {
      subject: parse.subject,
      independentVariables: parse.independentVariables,
      dependentVariables: parse.dependentVariables,
      relation: parse.relation,
      scope: parse.scope,
    },
  };
}

export function buildSeedQueryPlan(input: {
  topicAnalysis: TopicAnalysis;
  titleParse?: ResearchTitleSentenceParse;
  parsedInput?: ParsedResearchInput;
  querySeedZh?: string[];
  querySeedEn?: string[];
  excludeTerms?: string[];
}): SeedQueryPlan {
  const normalizedResearchTopic = normalizeResearchTopic(
    input.topicAnalysis.originalInput || input.topicAnalysis.normalizedTopic,
    input.topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW",
  );
  const understanding = understandTopic(input.topicAnalysis.normalizedTopic);
  const specializedQueries = isPaleontologyAlgaeTopic(input.topicAnalysis.normalizedTopic)
    ? paleontologyAlgaeQueries(input.topicAnalysis.normalizedTopic)
    : isAstronomyScienceEducationTopic(input.topicAnalysis.normalizedTopic)
      ? astronomyScienceEducationQueries(input.topicAnalysis.normalizedTopic)
      : isAgriculturalWastePollutionTopic(input.topicAnalysis.normalizedTopic)
        ? agriculturalWastePollutionQueries(input.topicAnalysis.normalizedTopic)
        : isAiWorkImpactTopic(input.topicAnalysis.normalizedTopic)
          ? aiWorkImpactQueries(input.topicAnalysis.normalizedTopic)
          : isColaHealthTopic(input.topicAnalysis.normalizedTopic)
            ? colaHealthQueries(input.topicAnalysis.normalizedTopic)
            : null;
  const titleParse =
    input.titleParse ?? parseResearchTitleSentence(input.topicAnalysis.normalizedTopic);
  const parsedZhQueries = input.parsedInput?.queryPlan.zhQueries ?? [];
  const parsedEnQueries = input.parsedInput?.queryPlan.enQueries ?? [];
  const parsedTranslationTerms = input.parsedInput?.mustIncludeTerms.filter(containsLatin) ?? [];
  const requestZhQueries = input.querySeedZh ?? [];
  const requestEnQueries = input.querySeedEn ?? [];
  const localTranslations = uniqueStrings([
    ...(LOCAL_TRANSLATIONS[input.topicAnalysis.normalizedTopic] ?? []),
    ...titleParse.subject.flatMap((term) => LOCAL_TRANSLATIONS[term] ?? []),
    ...titleParse.independentVariables.flatMap((term) => LOCAL_TRANSLATIONS[term] ?? []),
    ...titleParse.dependentVariables.flatMap((term) => LOCAL_TRANSLATIONS[term] ?? []),
  ]);
  const topicText = [
    input.topicAnalysis.normalizedTopic,
    titleParse.normalizedText,
    ...(input.parsedInput?.mustIncludeTerms ?? []),
    ...parsedZhQueries,
    ...parsedEnQueries,
  ].join(" ");
  const exactQueries = sanitizeGroundingQueries([
    ...requestZhQueries.slice(0, 2),
    ...normalizedResearchTopic.zhAcademicQuery.slice(0, 2),
    titleParse.normalizedText,
    ...parsedZhQueries.slice(0, 2),
    ...(specializedQueries?.zh.slice(1, 3) ?? []),
  ], topicText);
  const broadQueries = sanitizeGroundingQueries([
    ...normalizedResearchTopic.broaderAcademicQueries,
    ...(specializedQueries?.zh.slice(1) ?? []),
    titleParse.subject.join(" "),
    titleParse.independentVariables.join(" "),
    ...(specializedQueries ? [] : [understanding.coreConcepts.slice(0, 3).join(" ")]),
  ], topicText).filter((query) => query.length >= 2 && query !== input.topicAnalysis.normalizedTopic);
  const zhQueries =
    input.topicAnalysis.detectedLanguage === "en"
      ? []
      : sanitizeGroundingQueries([
          ...requestZhQueries,
          ...exactQueries,
          ...normalizedResearchTopic.zhAcademicQuery,
          ...(specializedQueries?.zh ?? []),
          ...broadQueries,
          ...titleParse.subject,
          ...titleParse.independentVariables,
          ...titleParse.dependentVariables,
          ...parsedZhQueries,
        ], topicText);
  const enQueries = sanitizeGroundingQueries([
    ...requestEnQueries,
    ...normalizedResearchTopic.enAcademicQuery,
    ...(specializedQueries?.en ?? []),
    ...(specializedQueries ? [] : [understanding.canonicalEnglishTopic]),
    ...localTranslations,
    ...parsedEnQueries,
    ...parsedTranslationTerms,
    ...(specializedQueries
      ? []
      : understanding.coreConcepts.filter((concept) => containsLatin(concept))),
  ], topicText).filter(Boolean);

  return {
    workflowId: input.topicAnalysis.workflowId,
    topicHash: input.topicAnalysis.topicHash,
    normalizedResearchTopic,
    exactQueries,
    broadQueries,
    zhQueries,
    enQueries,
    providerQueries: {
      openalex: providerSafeQueries(sanitizeGroundingQueries([...enQueries.slice(0, 5), ...exactQueries], topicText), topicText),
      crossref: providerSafeQueries(sanitizeGroundingQueries([...enQueries.slice(0, 5), ...exactQueries], topicText), topicText),
      core: providerSafeQueries(sanitizeGroundingQueries([...enQueries.slice(0, 3), ...exactQueries, ...broadQueries.slice(0, 2)], topicText), topicText),
      semanticScholar: providerSafeQueries(sanitizeGroundingQueries([...enQueries.slice(0, 3), ...exactQueries.slice(0, 2)], topicText), topicText),
      web: webSafeQueries(sanitizeGroundingQueries([...broadQueries.slice(0, 2), ...exactQueries.slice(0, 2)], topicText), topicText),
    },
    excludedDriftTerms: uniqueStrings(input.topicAnalysis.warnings.filter((warning) =>
      warning.includes("drift") || warning.includes("preserve original"),
    ).concat(normalizedResearchTopic.negativeKeywords, input.excludeTerms ?? [])),
  };
}

class LocalLexiconAdapter implements LexiconAdapter {
  name = "local";

  async lookup(term: string): Promise<LexicalSignal[]> {
    const normalized = compactWhitespace(term);
    if (!normalized) return [];
    if (isPaleontologyAlgaeTopic(normalized)) {
      const specializedQueries = paleontologyAlgaeQueries(normalized);
      return [
        {
          originalTerm: normalized,
          matchedTerm: "paleontology algae microfossils",
          language: detectLanguage(normalized),
          source: "local",
          aliases: specializedQueries.en,
          translations: specializedQueries.en,
          broaderTerms: ["paleontology", "fossil record", "paleoenvironment"],
          narrowerTerms: ["algal microfossils", "stromatolites", "cyanobacteria"],
          relatedTerms: [
            "sedimentary environment",
            "fossil preservation",
            "paleoecology",
          ],
          domainHints: ["paleontology", "earth_science", "biology"],
          excludedDriftTerms: ["habitat ecology", "conservation distribution"],
          confidence: 0.92,
        },
      ];
    }
    if (isAstronomyScienceEducationTopic(normalized)) {
      const specializedQueries = astronomyScienceEducationQueries(normalized);
      return [
        {
          originalTerm: normalized,
          matchedTerm: "astronomy education stellar distance",
          language: detectLanguage(normalized),
          source: "local",
          aliases: specializedQueries.en,
          translations: specializedQueries.en,
          broaderTerms: ["astronomy", "science education", "science communication"],
          narrowerTerms: ["stellar distance", "parallax", "light year", "planetarium education"],
          relatedTerms: ["museum exhibition", "public understanding of science", "informal science learning"],
          domainHints: ["astronomy", "physics", "education"],
          excludedDriftTerms: ["generic learning outcomes", "physical education", "language learning", "annual report"],
          confidence: 0.92,
        },
      ];
    }
    if (isAgriculturalWastePollutionTopic(normalized)) {
      const specializedQueries = agriculturalWastePollutionQueries(normalized);
      return [
        {
          originalTerm: normalized,
          matchedTerm: "agricultural waste pollution",
          language: detectLanguage(normalized),
          source: "local",
          aliases: specializedQueries.en,
          translations: specializedQueries.en,
          broaderTerms: ["agricultural pollution", "environmental pollution", "waste management"],
          narrowerTerms: ["agricultural runoff", "manure waste", "nutrient pollution", "soil contamination"],
          relatedTerms: ["eutrophication", "water quality", "pollution control"],
          domainHints: ["environment", "agriculture", "waste_management"],
          excludedDriftTerms: ["microplastics human health", "Salmonella food safety", "nutrition label", "annual report"],
          confidence: 0.92,
        },
      ];
    }
    if (isAiWorkImpactTopic(normalized)) {
      const specializedQueries = aiWorkImpactQueries(normalized);
      return [
        {
          originalTerm: normalized,
          matchedTerm: "AI impact on work and labor market",
          language: detectLanguage(normalized),
          source: "local",
          aliases: specializedQueries.en,
          translations: specializedQueries.en,
          broaderTerms: ["future of work", "labor market", "workplace transformation"],
          narrowerTerms: ["task automation", "job transformation", "skills demand", "organizational management"],
          relatedTerms: ["employment", "productivity", "work practices"],
          domainHints: ["artificial_intelligence", "labor", "organization"],
          excludedDriftTerms: ["AI market positioning", "brand strategy", "supply chain emissions", "microplastics"],
          confidence: 0.92,
        },
      ];
    }
    if (isColaHealthTopic(normalized)) {
      const specializedQueries = colaHealthQueries(normalized);
      return [
        {
          originalTerm: normalized,
          matchedTerm: "cola sugar-sweetened beverage health",
          language: detectLanguage(normalized),
          source: "local",
          aliases: specializedQueries.en,
          translations: specializedQueries.en,
          broaderTerms: ["sugar-sweetened beverages", "soft drink consumption", "public health nutrition"],
          narrowerTerms: ["sugar intake", "caffeine intake", "dental caries", "metabolic health"],
          relatedTerms: ["obesity", "adolescents", "dietary intake"],
          domainHints: ["nutrition", "public_health", "beverage_health"],
          excludedDriftTerms: ["microplastics human health", "Salmonella food safety", "foodborne illness", "coal"],
          confidence: 0.92,
        },
      ];
    }
    if (/熊貓|貓熊|大熊貓|小熊貓|小貓熊|giant panda|red panda|Ailuropoda|Ailurus/i.test(normalized)) {
      return [
        {
          originalTerm: normalized,
          matchedTerm: "giant panda red panda Chinese terminology",
          language: detectLanguage(normalized),
          source: "local",
          aliases: [
            "giant panda",
            "red panda",
            "panda",
            "cat-bear",
            "Ailuropoda melanoleuca",
            "Ailurus fulgens",
          ],
          translations: [
            "giant panda red panda taxonomy naming history",
            "panda cat-bear Chinese terminology",
            "giant panda Ailuropoda melanoleuca red panda Ailurus fulgens distinction",
          ],
          broaderTerms: ["taxonomy", "Chinese terminology", "naming history"],
          narrowerTerms: ["giant panda", "red panda", "Ailuropoda melanoleuca", "Ailurus fulgens"],
          relatedTerms: ["Ursidae", "Ailuridae", "Taiwan usage", "Mainland China usage"],
          domainHints: ["biology", "culture_linguistics", "general_academic"],
          excludedDriftTerms: ["kung fu panda", "panda express", "toy", "wallpaper", "mascot"],
          confidence: 0.93,
        },
      ];
    }
    const understanding = understandTopic(normalized);
    const translationCandidates = uniqueStrings([
      ...(LOCAL_TRANSLATIONS[normalized] ?? []),
      understanding.canonicalEnglishTopic,
    ]);
    if (
      translationCandidates.length === 0 &&
      understanding.coreConcepts.length === 0 &&
      !containsZh(normalized)
    ) {
      return [];
    }
    return [
      {
        originalTerm: normalized,
        matchedTerm: normalized,
        language: detectLanguage(normalized),
        source: "local",
        aliases: uniqueStrings(understanding.coreConcepts.slice(0, 4)),
        translations: translationCandidates,
        broaderTerms: uniqueStrings(understanding.coreConcepts.slice(0, 2)),
        narrowerTerms: [],
        relatedTerms: uniqueStrings(understanding.coreConcepts.slice(2, 5)),
        domainHints: uniqueStrings([understanding.domain]),
        excludedDriftTerms: [],
        confidence: translationCandidates.length > 0 ? 0.72 : 0.46,
      },
    ];
  }
}

export async function collectLexicalSignals(input: {
  topicAnalysis: TopicAnalysis;
  titleParse?: ResearchTitleSentenceParse;
  adapters?: LexiconAdapter[];
}): Promise<LexicalSignal[]> {
  const adapters = input.adapters ?? [new LocalLexiconAdapter()];
  const titleParse =
    input.titleParse ?? parseResearchTitleSentence(input.topicAnalysis.normalizedTopic);
  const terms = uniqueStrings([
    input.topicAnalysis.normalizedTopic,
    ...titleParse.subject,
    ...titleParse.independentVariables,
    ...titleParse.dependentVariables,
  ]).slice(0, 6);

  const allSignals = await Promise.all(
    adapters.flatMap((adapter) =>
      terms.map(async (term) => adapter.lookup(term)),
    ),
  );

  return allSignals.flat().sort((left, right) => right.confidence - left.confidence);
}

function providerQueriesFromPlan(input: {
  seedQueryPlan: SeedQueryPlan;
  primaryQueries: string[];
  secondaryQueries: string[];
  topicText: string;
}): GroundingQueryPlan["providerQueries"] {
	  const combined = uniqueStrings([...input.primaryQueries, ...input.secondaryQueries]);
	  return {
	    openalex: providerSafeQueries([
	      ...combined.slice(0, 4),
	      ...input.seedQueryPlan.providerQueries.openalex,
	    ], input.topicText),
	    crossref: providerSafeQueries([
	      ...combined.slice(0, 4),
	      ...input.seedQueryPlan.providerQueries.crossref,
	    ], input.topicText),
	    core: providerSafeQueries([
	      ...combined.slice(0, 4),
	      ...input.seedQueryPlan.providerQueries.core,
	    ], input.topicText),
	    semanticScholar: providerSafeQueries([
	      ...combined.filter((query) => containsLatin(query)).slice(0, 4),
	      ...(input.seedQueryPlan.providerQueries.semanticScholar ?? []),
	    ], input.topicText),
    web: webSafeQueries([
      ...backgroundRoutedQueries(combined, input.topicText),
      ...(input.seedQueryPlan.providerQueries.web ?? []),
      ...input.secondaryQueries.slice(0, 3),
    ], input.topicText),
  };
}

function inferGroundingDomain(topicText: string): string {
  return (
    DOMAIN_INTENT_PATTERNS.find((entry) => entry.pattern.test(topicText))?.domain ??
    "general academic"
  );
}

function inferGroundingIntent(topicText: string): string {
  return (
    RESEARCH_INTENT_PATTERNS.find((entry) => entry.pattern.test(topicText))?.intent ??
    "general_academic"
  );
}

function splitConceptPieces(value: string): string[] {
  return uniqueStrings(
    value
      .split(/\s+|[、,，;；:：。！？?()（）「」『』]/u)
      .map((piece) => piece.trim())
      .filter((piece) => piece.length >= 2),
  );
}

function conceptGroupsFromGroundingInput(input: {
  topicText: string;
  titleParse: ResearchTitleSentenceParse;
  seedQueryPlan: SeedQueryPlan;
  lexicalSignals: LexicalSignal[];
}): ConceptGroup[] {
  const directTerms = uniqueStrings([
    ...input.titleParse.subject,
    ...input.titleParse.independentVariables,
    ...input.titleParse.dependentVariables,
    ...input.titleParse.conditions,
    ...splitConceptPieces(input.topicText),
  ]).filter(
    (term) =>
      !/^(如何|影響|原因|角色|the|and|for|with|effect|impact|research|study)$/i.test(term),
  );
  const lexicalTerms = input.lexicalSignals.flatMap((signal) => [
    signal.originalTerm,
    signal.matchedTerm,
    ...signal.aliases,
    ...signal.translations,
    ...signal.relatedTerms.slice(0, 2),
  ]);
  const queryEnglishTerms = input.seedQueryPlan.enQueries.flatMap(splitConceptPieces);
  const groups = directTerms.slice(0, 10).map((term, index) => {
    const zhTerms = containsZh(term) ? [term] : [];
    const enTerms = uniqueStrings([
      ...(containsLatin(term) ? [term] : []),
      ...(LOCAL_TRANSLATIONS[term] ?? []),
      ...lexicalTerms.filter((item) => {
        const normalizedItem = item.toLowerCase();
        const normalizedTerm = term.toLowerCase();
        return (
          normalizedItem === normalizedTerm ||
          normalizedItem.includes(normalizedTerm) ||
          normalizedTerm.includes(normalizedItem)
        );
      }),
      ...queryEnglishTerms.filter((item) => {
        const normalizedTerm = term.toLowerCase();
        return item.toLowerCase().includes(normalizedTerm) || normalizedTerm.includes(item.toLowerCase());
      }),
    ]).filter(containsLatin);
    return {
      name: term,
      zhTerms,
      enTerms,
      weight: index < 4 ? 1 : 0.7,
    };
  });

  return uniqueConceptGroups([
    ...bridgeConceptGroupsFromTopicText(input.topicText),
    ...groups,
  ]);
}

function normalizedBridgeText(value: string): string {
  return compactWhitespace(value).toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bridgeTextContainsTerm(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizedBridgeText(needle);
  if (!normalizedNeedle) return false;
  if (!containsLatin(normalizedNeedle)) return haystack.includes(normalizedNeedle);
  const tokenPattern = normalizedNeedle
    .split(/\s+/u)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${tokenPattern}($|[^a-z0-9])`, "i").test(haystack);
}

function bridgeConceptGroupsFromTopicText(topicText: string): ConceptGroup[] {
  const normalizedTopic = normalizedBridgeText(topicText);
  return Object.entries(TERM_BRIDGE)
    .filter(([term, aliases]) => {
      return (
        bridgeTextContainsTerm(normalizedTopic, term) ||
        aliases.some((alias) => bridgeTextContainsTerm(normalizedTopic, alias))
      );
    })
    .map(([term, aliases], index) => ({
      name: term,
      zhTerms: containsZh(term) ? [term] : [],
      enTerms: uniqueStrings(aliases.filter(containsLatin)).slice(0, 6),
      weight: index < 6 ? 1 : 0.75,
    }));
}

function uniqueConceptGroups(groups: ConceptGroup[]): ConceptGroup[] {
  const seen = new Set<string>();
  const result: ConceptGroup[] = [];
  for (const group of groups) {
    const key = group.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(group);
  }
  return result;
}

function conceptGroupsFromSearchIntentTerms(terms: string[]): ConceptGroup[] {
  return uniqueStrings(terms)
    .filter((term) => term.trim().length >= 2)
    .slice(0, 12)
    .map((term, index) => ({
      name: term,
      zhTerms: containsZh(term) ? [term] : [],
      enTerms: containsLatin(term) ? [term] : [],
      weight: index < 6 ? 0.9 : 0.65,
    }));
}

function conceptBridgeQueries(groups: ConceptGroup[]): string[] {
  const leadTerms = uniqueStrings(groups
    .map((group) => group.enTerms[0] ?? group.zhTerms[0] ?? "")
    .filter((term) => term && containsLatin(term)));
  const queries = [
    leadTerms.slice(0, 4).join(" "),
    leadTerms.slice(0, 3).join(" "),
    ...groups.flatMap((group) => group.enTerms.slice(0, 2)),
  ];
  for (let index = 0; index < leadTerms.length - 1; index += 1) {
    queries.push(`${leadTerms[index]} ${leadTerms[index + 1]}`);
  }
  if (leadTerms.length >= 2) {
    queries.push(`${leadTerms.slice(0, 3).join(" ")} review`);
    queries.push(`${leadTerms.slice(0, 3).join(" ")} systematic review`);
  }
  return uniqueStrings(queries.filter((query) => query.trim().length >= 3)).slice(0, 12);
}

export function buildGroundingQueryPlan(input: {
  topicAnalysis: TopicAnalysis;
  seedQueryPlan: SeedQueryPlan;
  lexicalSignals: LexicalSignal[];
  titleParse?: ResearchTitleSentenceParse;
}): GroundingQueryPlan {
  const titleParse =
    input.titleParse ?? parseResearchTitleSentence(input.topicAnalysis.normalizedTopic);
  const topicText = [
    input.topicAnalysis.normalizedTopic,
    titleParse.normalizedText,
    ...input.seedQueryPlan.zhQueries,
    ...input.seedQueryPlan.enQueries,
  ].join(" ");
  const conceptGroups = conceptGroupsFromGroundingInput({
    topicText,
    titleParse,
    seedQueryPlan: input.seedQueryPlan,
    lexicalSignals: input.lexicalSignals,
  });
  const bridgeQueries = conceptBridgeQueries(conceptGroups);
  const primaryQueries = sanitizeGroundingQueries([
    ...bridgeQueries.slice(0, 4),
    ...input.seedQueryPlan.exactQueries,
    ...input.seedQueryPlan.broadQueries,
    ...input.seedQueryPlan.enQueries.slice(0, 2),
  ], topicText);
  const secondaryQueries = sanitizeGroundingQueries(
    input.lexicalSignals.flatMap((signal) => [
      ...signal.aliases,
      ...signal.translations,
      ...signal.broaderTerms,
      ...signal.relatedTerms,
    ]),
    topicText,
  ).filter((query) => query.length >= 2 && !primaryQueries.includes(query));
	const bilingualQueries = {
	  zh: sanitizeGroundingQueries([
      ...input.seedQueryPlan.zhQueries,
      ...titleParse.subject.filter(containsZh),
      ...titleParse.independentVariables.filter(containsZh),
    ], topicText),
	  en: sanitizeGroundingQueries([
      ...bridgeQueries,
	    ...input.seedQueryPlan.enQueries,
	    ...secondaryQueries.filter((query) => containsLatin(query)),
	  ], topicText),
	};
  const rawProviderQueries = providerQueriesFromPlan({
    seedQueryPlan: input.seedQueryPlan,
    primaryQueries,
    secondaryQueries,
    topicText,
  });
  const providerQueries = {
    openalex: providerSafeQueries(sanitizeGroundingQueries(rawProviderQueries.openalex, topicText), topicText),
    crossref: providerSafeQueries(sanitizeGroundingQueries(rawProviderQueries.crossref, topicText), topicText),
    core: providerSafeQueries(sanitizeGroundingQueries(rawProviderQueries.core, topicText), topicText),
    semanticScholar: providerSafeQueries(sanitizeGroundingQueries(rawProviderQueries.semanticScholar ?? [], topicText), topicText),
    web: webSafeQueries(sanitizeGroundingQueries(rawProviderQueries.web ?? [], topicText), topicText),
  };
  const domain = inferGroundingDomain(topicText);
  const intent = inferGroundingIntent(topicText);
  const queryIntents: QueryIntent[] = uniqueStrings([
    ...primaryQueries,
    ...secondaryQueries,
  ]).map((query) => ({
    query,
    intent: input.seedQueryPlan.exactQueries.includes(query)
      ? "exact"
      : input.seedQueryPlan.broadQueries.includes(query)
        ? "broad"
        : bilingualQueries.en.includes(query)
          ? "translation"
          : secondaryQueries.includes(query)
            ? "domain"
            : "fallback",
    expectedSourceTypes: ["paper", "review", "education"],
  }));

  return {
    workflowId: input.topicAnalysis.workflowId,
    topicHash: input.topicAnalysis.topicHash,
    originalQuery: input.topicAnalysis.originalInput,
    primaryQueries,
    secondaryQueries,
    zhCoreQueries: bilingualQueries.zh,
    enCoreQueries: bilingualQueries.en.slice(0, 5),
    enAcademicQueries: uniqueStrings([
      ...providerQueries.openalex,
      ...providerQueries.semanticScholar,
      ...providerQueries.crossref,
    ]).filter(containsLatin).slice(0, 8),
    broadFallbackQueries: providerQueries.web ?? [],
    bilingualQueries,
    providerQueries,
    excludedDriftTerms: uniqueStrings([
      ...input.seedQueryPlan.excludedDriftTerms,
      ...input.lexicalSignals.flatMap((signal) => signal.excludedDriftTerms),
    ]),
    excludedConcepts: uniqueStrings([
      ...input.seedQueryPlan.excludedDriftTerms,
      ...input.lexicalSignals.flatMap((signal) => signal.excludedDriftTerms),
    ]),
    conceptGroups,
    domain,
    intent,
    queryIntents,
  };
}

function actionableIntent(topic: string): boolean {
  return ACTIONABLE_HARM_PATTERNS.some((pattern) => pattern.test(topic));
}

export function reviewAcademicSafety(input: {
  topic: string;
  titleParse?: ResearchTitleSentenceParse;
}): AcademicSafetyReview {
  const topic = compactWhitespace(input.topic);
  const riskCategories = uniqueStrings(
    HIGH_RISK_PATTERNS.filter((item) => item.pattern.test(topic)).map((item) => item.category),
  ) as AcademicSafetyReview["riskCategories"];
  const academicIntent =
    ACADEMIC_INTENT_PATTERNS.some((pattern) => pattern.test(topic)) || !actionableIntent(topic);
  const topicRiskLevel: AcademicSafetyReview["topicRiskLevel"] =
    riskCategories.length >= 2 ? "high" : riskCategories.length === 1 ? "medium" : "low";

  let allowedUse: AcademicSafetyReview["allowedUse"] = "normal_research";
  if (topicRiskLevel === "high" && actionableIntent(topic) && !academicIntent) {
    allowedUse = "block_actionable_output";
  } else if (topicRiskLevel === "high") {
    allowedUse = "restricted_academic_summary";
  } else if (topicRiskLevel === "medium" && academicIntent && !actionableIntent(topic)) {
    allowedUse = "restricted_academic_summary";
  } else if (topicRiskLevel === "medium") {
    allowedUse = "redirect_to_prevention_or_policy";
  }

  return {
    academicIntent,
    topicRiskLevel,
    allowedUse,
    riskCategories,
    prohibitedOutput: [
      "crime operation steps",
      "drug manufacturing or acquisition instructions",
      "weapon or explosive construction details",
      "credential theft or intrusion procedures",
    ],
    allowedOutput:
      allowedUse === "normal_research"
        ? ["literature review", "mechanism summary", "evidence synthesis"]
        : [
            "risk summary",
            "prevention strategies",
            "policy analysis",
            "public health framing",
            "legal and educational context",
          ],
    ...(topicRiskLevel === "low"
      ? {}
      : {
          userFacingNotice:
            "此主題可作為學術、法律、醫療、公共衛生或教育研究處理。系統將避免提供操作性危害細節，並優先整理風險、防治、政策與研究證據。",
        }),
  };
}

function providerKey(provider: string): SourceCandidate["provider"] {
  const normalized = provider.toLowerCase();
  if (normalized.includes("openalex")) return "openalex";
  if (normalized.includes("crossref")) return "crossref";
  if (normalized.includes("core")) return "core";
  if (normalized.includes("semantic")) return "semanticScholar";
  if (normalized.includes("manual")) return "manual";
  return "web";
}

type SourceClassificationResult = {
  recommendationBucket: SourceRecommendationBucket;
  sourceRole: SourceRole;
  institutionType: SourceInstitutionType;
};

type SourceClassificationInput = Pick<
  SourceCandidate,
  | "provider"
  | "retrievalMode"
  | "title"
  | "venue"
  | "doi"
  | "url"
  | "abstractOriginal"
  | "sourceType"
  | "isPeerReviewed"
  | "relevanceScore"
  | "sourceQualityScore"
  | "reviewStatus"
  | "sourceId"
> & {
  rawProviderPayload?: unknown;
};

function normalizedLowerText(values: Array<string | null | undefined>): string {
  return compactWhitespace(values.filter(Boolean).join(" ")).toLowerCase();
}

function rawPayloadText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  return Object.values(data)
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function institutionTypeForCandidate(
  source: Pick<SourceClassificationInput, "provider" | "url" | "venue" | "rawProviderPayload">,
): SourceInstitutionType {
  const text = normalizedLowerText([
    source.provider,
    source.url,
    source.venue,
    rawPayloadText(source.rawProviderPayload),
  ]);
  if (/nasa|space agency|esa|jaxa|goddard|giss/.test(text)) return "space_agency";
  if (/noaa|nesdis|gml|epa|\.gov|government|agency|ministry|department|bureau/.test(text)) {
    return "government_agency";
  }
  if (/ucar|ncar|national center for atmospheric research|scientific institution|research institute|academy/.test(text)) {
    return "scientific_institution";
  }
  if (/university|college|\.edu\b|大學|學院/.test(text)) return "university";
  if (/ipcc|unep|who|unesco|un\.org|oecd|world bank|international organization/.test(text)) {
    return "international_organization";
  }
  if (/reuters|bbc|guardian|new york times|media|news/.test(text)) return "media";
  if (/company|inc\.|corp\.|ltd\.|com\b/.test(text)) return "commercial";
  return "unknown";
}

function hasNegativeKeywordHit(
  source: Pick<SourceClassificationInput, "title" | "abstractOriginal" | "url" | "venue">,
  negativeKeywords: string[],
): boolean {
  const text = normalizedLowerText([source.title, source.abstractOriginal, source.url, source.venue]);
  const driftTerms = uniqueStrings([
    ...negativeKeywords,
    "photography",
    "wallpaper",
    "travel",
    "poem",
    "astrology",
    "seo",
    "content farm",
  ]);
  return driftTerms.some((term) => {
    const normalized = term.toLowerCase().trim();
    return normalized.length > 0 && text.includes(normalized);
  });
}

function isScholarlyProvider(provider: SourceCandidate["provider"]): boolean {
  return provider === "openalex" ||
    provider === "crossref" ||
    provider === "semanticScholar" ||
    provider === "core";
}

function hasScholarlyMetadata(source: SourceClassificationInput): boolean {
  if (source.provider === "core") {
    return Boolean(source.doi) || Boolean(source.isPeerReviewed) || Boolean(source.venue);
  }
  const scholarlySourceType =
    source.sourceType === "paper" || source.sourceType === "review";
  return Boolean(source.doi) ||
    Boolean(source.isPeerReviewed) ||
    scholarlySourceType ||
    (isScholarlyProvider(source.provider) && Boolean(source.venue)) ||
    (source.provider === "openalex" && /^https?:\/\/openalex\.org\//i.test(source.sourceId)) ||
    (source.provider === "semanticScholar" && /semantic/i.test(rawPayloadText(source.rawProviderPayload)));
}

export function classifySourceCandidate(
  source: SourceClassificationInput,
  topic: string,
  normalizedQueries: {
    negativeKeywords?: string[];
    excludedDriftTerms?: string[];
  } = {},
): SourceClassificationResult {
  const negativeKeywords = uniqueStrings([
    ...(normalizedQueries.negativeKeywords ?? []),
    ...(normalizedQueries.excludedDriftTerms ?? []),
  ]);
  const institutionType = institutionTypeForCandidate(source);
  const hasNegativeHit = hasNegativeKeywordHit(source, negativeKeywords);
  const scholarlyMetadata = hasScholarlyMetadata(source);
  const officialInstitution =
    institutionType === "government_agency" ||
    institutionType === "space_agency" ||
    institutionType === "university" ||
    institutionType === "scientific_institution" ||
    institutionType === "international_organization";
  const text = normalizedLowerText([topic, source.title, source.abstractOriginal]);
  const datasetCue = /dataset|data product|monitoring|statistics|資料集|統計/.test(text);
  const definitionCue = /definition|what is|why is|explains|說明|定義|概念/.test(text);
  const preprintCue =
    !source.doi &&
    !source.isPeerReviewed &&
    /preprint|arxiv|bio.?rxiv|med.?rxiv|ssrn|osf/i.test(
      normalizedLowerText([
        source.title,
        source.venue,
        source.url,
        rawPayloadText(source.rawProviderPayload),
      ]),
    );

  if (source.reviewStatus === "rejected" || hasNegativeHit) {
    return {
      recommendationBucket: "rejected",
      sourceRole: "rejected",
      institutionType,
    };
  }

  if (preprintCue) {
    return {
      recommendationBucket: "manual_review",
      sourceRole: "weak_or_uncertain",
      institutionType,
    };
  }

  if (
    isScholarlyProvider(source.provider) &&
    scholarlyMetadata &&
    source.relevanceScore >= 0.7 &&
    source.sourceQualityScore >= 0.7
  ) {
    return {
      recommendationBucket: "scholarly_recommended",
      sourceRole: "core_scholarly_evidence",
      institutionType,
    };
  }

  if (
    (source.retrievalMode === "trusted_seed" ||
      source.provider === "web" ||
      source.sourceType === "official" ||
      source.sourceType === "education") &&
    officialInstitution &&
    !source.doi &&
    !scholarlyMetadata
  ) {
    return {
      recommendationBucket: "official_background",
      sourceRole: datasetCue
        ? "statistics_or_dataset"
        : definitionCue
          ? "definition_or_concept"
          : source.sourceType === "education"
            ? "teaching_or_public_explainer"
            : "official_background_explanation",
      institutionType,
    };
  }

  return {
    recommendationBucket: "manual_review",
    sourceRole: "weak_or_uncertain",
    institutionType,
  };
}

function retrievalModeForSource(
  source: SourceRecord,
  searchResult: SearchIntentSourceSearchResult,
): SourceRetrievalMode {
  if (source.id?.startsWith("trusted:")) return "trusted_seed";
  if (/core/i.test(source.provider ?? source.sourceType)) {
    return "supplemental_fulltext_or_repository";
  }
  if (/manual/i.test(source.provider ?? source.sourceType)) return "user_import";
  if (
    searchResult.diagnostics?.cache_status === "stale_hit_refreshing" ||
    searchResult.diagnostics?.cache_status === "refresh_failed_using_stale"
  ) {
    return "stale_cache";
  }
  return "live_provider";
}

function providerHealthForCandidate(
  provider: SourceCandidate["provider"],
  searchResult: SearchIntentSourceSearchResult,
) {
  const healthProvider =
    provider === "openalex"
      ? "openalex"
      : provider === "crossref"
        ? "crossref"
        : provider === "semanticScholar"
          ? "semantic_scholar"
          : provider === "core"
            ? "core"
            : null;
  if (!healthProvider) return undefined;
  return searchResult.diagnostics?.provider_health?.find(
    (health) => health.provider === healthProvider,
  );
}

function usableSectionsForRole(role: SourceRole): string[] {
  switch (role) {
    case "core_scholarly_evidence":
      return ["literature_review", "analysis", "discussion"];
    case "statistics_or_dataset":
      return ["background", "analysis", "discussion"];
    case "official_background_explanation":
    case "definition_or_concept":
    case "teaching_or_public_explainer":
      return ["introduction", "background", "concept_explanation"];
    case "weak_or_uncertain":
      return ["manual_review_only"];
    case "rejected":
    default:
      return [];
  }
}

function sourceEvidencePoints(input: {
  source: SourceClassificationInput;
  topic: string;
  role: SourceRole;
}): string[] {
  const text = normalizedLowerText([input.topic, input.source.title, input.source.abstractOriginal]);
  if (/sunset|twilight|夕陽|餘暉|rayleigh|scattering|散射|wavelength|波長/.test(text)) {
    return [
      "sunset / twilight color 與 Rayleigh scattering 有關",
      "shorter wavelengths scatter more strongly",
      "longer path through atmosphere at sunset changes observed color",
      "aerosols / Mie scattering may affect color",
    ];
  }
  const abstractSentences = compactWhitespace(input.source.abstractOriginal ?? "")
    .split(/(?<=[.!?。！？])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2);
  return uniqueStrings([
    ...abstractSentences,
    input.role === "core_scholarly_evidence"
      ? "scholarly metadata supports use as a literature candidate"
      : "",
    input.role === "official_background_explanation"
      ? "official source supports background explanation"
      : "",
  ]).slice(0, 4);
}

function sourceLimitations(input: {
  bucket: SourceRecommendationBucket;
  role: SourceRole;
  hasAbstract: boolean;
  isPeerReviewed?: boolean;
  sourceQualityScore: number;
}): string[] {
  return uniqueStrings([
    input.bucket === "official_background"
      ? "非同行評審論文"
      : "",
    input.bucket === "official_background"
      ? "適合背景說明，不足以支撐完整學術文獻回顧"
      : "",
    input.bucket === "manual_review"
      ? "需人工確認用途後才可進入正式段落"
      : "",
    input.bucket === "rejected"
      ? "不建議納入 Evidence Card"
      : "",
    !input.hasAbstract ? "metadata-only or title-only grounding" : "",
    input.sourceQualityScore < 0.55 ? "source quality is limited" : "",
    input.role === "teaching_or_public_explainer"
      ? "教學或科普說明來源，需避免當作研究論文引用"
      : "",
  ]);
}

function sourceRecordIdentity(source: SourceRecord): string {
  return (
    source.id ||
    source.dedupeKey ||
    source.doi ||
    source.url ||
    `${source.title}:${source.year ?? ""}`
  ).toLowerCase();
}

function uniqueSourceRecords(sources: SourceRecord[]): SourceRecord[] {
  const seen = new Set<string>();
  const uniqueRecords: SourceRecord[] = [];
  for (const source of sources) {
    const key = sourceRecordIdentity(source);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRecords.push(source);
  }
  return uniqueRecords;
}

function sourceTypeForCandidate(source: SourceRecord): SourceCandidate["sourceType"] {
  if (source.sourceKind === "web") {
    return source.sourceType === "Official Source" || source.sourceType === "Institutional Source"
      ? "official"
      : "web";
  }
  if (source.sourceKind === "journal" || source.sourceKind === "conference") return "paper";
  return "unknown";
}

function reviewStatusFromSignals(input: {
  score: number;
  hasCoreConceptMatch: boolean;
  hasTitleCoreConceptMatch: boolean;
}): SourceCandidate["reviewStatus"] {
  if (input.score >= 0.35 && input.hasCoreConceptMatch) return "accepted";
  if (input.score >= 0.18 || input.hasTitleCoreConceptMatch || input.hasCoreConceptMatch) return "review";
  return "rejected";
}

function dedupeSourceCandidates(
  candidates: SourceCandidateWithSignals[],
): SourceCandidateWithSignals[] {
  const map = new Map<string, SourceCandidateWithSignals>();
  for (const candidate of candidates) {
    const existing = map.get(candidate.dedupeKey);
    if (!existing || existing.relevanceScore < candidate.relevanceScore) {
      map.set(candidate.dedupeKey, candidate);
    }
  }
  return Array.from(map.values()).sort((left, right) => right.relevanceScore - left.relevanceScore);
}

function applyReviewFallback(
  candidates: SourceCandidateWithSignals[],
): { candidates: SourceCandidateWithSignals[]; warnings: string[] } {
  const acceptedCount = candidates.filter((candidate) => candidate.reviewStatus === "accepted").length;
  const reviewCount = candidates.filter((candidate) => candidate.reviewStatus === "review").length;
  if (candidates.length === 0 || acceptedCount > 0 || reviewCount > 0) {
    return { candidates, warnings: [] };
  }

  const promotable = candidates
    .filter(
      (candidate) =>
        candidate.sourceBucket !== "off_topic" &&
        (Boolean(candidate.doi) ||
          Boolean(candidate.abstractOriginal) ||
          Boolean(candidate.venue) ||
          typeof candidate.year === "number" ||
          candidate.sourceQualityScore >= 0.45 ||
          candidate._signals.hasCoreConceptMatch ||
          candidate._signals.hasTitleCoreConceptMatch ||
          candidate.relevanceScore >= 0.18),
    )
    .sort((left, right) => right.relevanceScore - left.relevanceScore);

  if (promotable.length === 0) {
    return {
      candidates,
      warnings: ["找到資料但被篩選器全部排除，已保留最高分來源供人工審查。"],
    };
  }

  const promotionCount = Math.min(10, promotable.length);
  const promotedKeys = new Set(promotable.slice(0, promotionCount).map((candidate) => candidate.dedupeKey));
  return {
    candidates: candidates.map((candidate) =>
      promotedKeys.has(candidate.dedupeKey)
        ? {
            ...candidate,
            reviewStatus: "review",
            rejectionReason: undefined,
            recommendationBucket:
              candidate.recommendationBucket === "rejected"
                ? "manual_review"
                : candidate.recommendationBucket,
            sourceRole:
              candidate.recommendationBucket === "rejected"
                ? "weak_or_uncertain"
                : candidate.sourceRole,
            usableSections:
              candidate.recommendationBucket === "rejected"
                ? usableSectionsForRole("weak_or_uncertain")
                : candidate.usableSections,
            limitations: uniqueStrings([
              ...candidate.limitations.filter((item) => item !== "不建議納入 Evidence Card"),
              "需人工確認用途後才可進入正式段落",
            ]),
          }
        : candidate,
    ),
    warnings: [
      `找到資料但被篩選器全部排除，已自動放寬條件並保留最高分 ${promotionCount} 筆來源供審查。`,
    ],
  };
}

function queryIntentForQuery(query: string, queryPlan: GroundingQueryPlan): string {
  return (
    queryPlan.queryIntents.find((item) => item.query === query)?.intent ??
    (queryPlan.primaryQueries.includes(query) ? "exact" : "fallback")
  );
}

function aggregateProviderCounts(
  searchResult?: SearchIntentSourceSearchResult,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const group of searchResult?.provider_status ?? []) {
    counts[group.provider] = (counts[group.provider] ?? 0) + (group.raw_count ?? group.results.length);
  }
  return counts;
}

function providerErrorsFromSearchResult(
  searchResult?: SearchIntentSourceSearchResult,
): GroundingPipelineDiagnostics["providerErrors"] {
  return (searchResult?.provider_status ?? [])
    .filter((group) => !group.ok)
    .map((group) => ({
      provider: group.provider,
      query: group.query,
      errorType: group.error_type,
      errorMessage: group.error_message,
    }));
}

function requiredHighConfidenceConceptCount(queryPlan?: GroundingQueryPlan): number {
  const coreConceptCount = queryPlan?.conceptGroups?.filter((group) => group.weight >= 0.75).length ?? 0;
  return coreConceptCount >= 4 ? 3 : 2;
}

function highConfidenceSourceCandidates(
  sourceCandidates: SourceCandidate[],
  queryPlan?: GroundingQueryPlan,
): SourceCandidate[] {
  const requiredConceptCount = requiredHighConfidenceConceptCount(queryPlan);
	  return sourceCandidates.filter(
	    (candidate) =>
        candidate.recommendationBucket === "scholarly_recommended" &&
	      candidate.reviewStatus === "accepted" &&
	      (
	        ((candidate.matchedConcepts?.length ?? 0) >= requiredConceptCount &&
	          (candidate.matchedFields?.some((field) => field === "title" || field === "abstract") ?? false)) ||
	        ((Boolean(candidate.doi) || Boolean(candidate.url)) &&
	          (candidate.finalScore ?? candidate.relevanceScore) >= 0.5 &&
	          candidate.sourceQualityScore >= 0.55)
	      ) &&
	      candidate.confidenceTier !== "fallback" &&
	      !candidate.lowConfidence &&
      !candidate.needsReview,
  );
}

function fallbackReviewSourceCandidates(
  sourceCandidates: SourceCandidate[],
): SourceCandidate[] {
  return sourceCandidates.filter(
    (candidate) =>
      candidate.reviewStatus !== "rejected" &&
      (candidate.recommendationBucket === "official_background" ||
        candidate.recommendationBucket === "manual_review" ||
        candidate.confidenceTier === "fallback" ||
        candidate.lowConfidence ||
        candidate.needsReview),
  );
}

function officialBackgroundSourceCandidates(
  sourceCandidates: SourceCandidate[],
): SourceCandidate[] {
  return sourceCandidates.filter(
    (candidate) =>
      candidate.reviewStatus !== "rejected" &&
      candidate.recommendationBucket === "official_background",
  );
}

function manualReviewSourceCandidates(
  sourceCandidates: SourceCandidate[],
): SourceCandidate[] {
  return sourceCandidates.filter(
    (candidate) =>
      candidate.reviewStatus !== "rejected" &&
      candidate.recommendationBucket === "manual_review",
  );
}

function sourceCandidateHasDoi(candidate: SourceCandidate): boolean {
  return Boolean(candidate.doi?.trim()) || /(?:doi\.org\/|^10\.\d{4,9}\/)/i.test(candidate.url ?? "");
}

function sourceCandidateIsOfficialBackground(candidate: SourceCandidate): boolean {
  if (
    candidate.recommendationBucket !== "official_background" &&
    (sourceCandidateHasDoi(candidate) || candidate.isPeerReviewed === true) &&
    (candidate.sourceType === "paper" || candidate.sourceType === "review")
  ) {
    return false;
  }
  if (candidate.isOfficialBackground === true) return true;
  if (candidate.recommendationBucket === "official_background") return true;
  if (
    candidate.sourceRole === "official_background_explanation" ||
    candidate.sourceRole === "definition_or_concept" ||
    candidate.sourceRole === "teaching_or_public_explainer"
  ) {
    return true;
  }
  const text = normalizedLowerText([
    candidate.provider,
    candidate.sourceType,
    candidate.sourceKind,
    candidate.institutionType,
    candidate.venue,
    candidate.url,
    candidate.title,
  ]);
  return /nasa|space place|giss|\.gov|government|education|encyclopedia|kids|classroom/.test(text);
}

function sourceCandidateIsAcademic(candidate: SourceCandidate): boolean {
  if (candidate.reviewStatus === "rejected") return false;
  if (sourceCandidateIsOfficialBackground(candidate)) return false;
  if (candidate.isAcademic === true) return true;
  if (candidate.recommendationBucket === "scholarly_recommended") return true;
  if (candidate.sourceRole === "core_scholarly_evidence") return true;
  if (candidate.sourceType === "paper" || candidate.sourceType === "review") return true;
  const providerAcademic =
    candidate.provider === "openalex" ||
    candidate.provider === "crossref" ||
    candidate.provider === "semanticScholar" ||
    candidate.provider === "core";
  const text = normalizedLowerText([
    candidate.provider,
    candidate.sourceType,
    candidate.sourceKind,
    candidate.venue,
    candidate.url,
    candidate.rawProviderPayload ? rawPayloadText(candidate.rawProviderPayload) : "",
  ]);
  return (
    sourceCandidateHasDoi(candidate) ||
    candidate.isPeerReviewed === true ||
    /journal|conference|proceedings|scholarly|academic_graph|arxiv|pubmed|doaj|unpaywall|semantic scholar|openalex|crossref/i.test(
      text,
    ) ||
    (providerAcademic && Boolean(candidate.venue))
  );
}

function sourceCandidateIsPeerReviewedOrDoi(candidate: SourceCandidate): boolean {
  if (!sourceCandidateIsAcademic(candidate)) return false;
  return (
    candidate.isPeerReviewed === true ||
    sourceCandidateHasDoi(candidate) ||
    candidate.recommendationBucket === "scholarly_recommended"
  );
}

function buildSourceQualitySummary(sourceCandidates: SourceCandidate[]): SourceQualitySummary {
  const reviewable = sourceCandidates.filter((candidate) => candidate.reviewStatus !== "rejected");
  const academicCandidates = reviewable.filter(sourceCandidateIsAcademic);
  const peerReviewedOrDoiCount = academicCandidates.filter(sourceCandidateIsPeerReviewedOrDoi).length;
  const officialBackgroundCount = reviewable.filter(sourceCandidateIsOfficialBackground).length;
  const fallbackReviewCount = fallbackReviewSourceCandidates(sourceCandidates).length;
  const rejectedCount = sourceCandidates.filter((candidate) => candidate.reviewStatus === "rejected").length;
  return {
    totalSources: reviewable.length,
    academicCandidateCount: academicCandidates.length,
    peerReviewedOrDoiCount,
    officialBackgroundCount,
    fallbackReviewCount,
    rejectedCount,
    academicEnough:
      academicCandidates.length >= ACADEMIC_RETRY_POLICY.minAcademicCandidates &&
      peerReviewedOrDoiCount >= ACADEMIC_RETRY_POLICY.minPeerReviewedOrDOI,
    evidenceUsableEnough:
      academicCandidates.filter((candidate) => candidate.usableAsEvidence !== false).length >=
      ACADEMIC_RETRY_POLICY.minEvidenceUsableSources,
  };
}

function academicRetryTriggerReason(input: {
  sourceQualitySummary: SourceQualitySummary;
  parsedInput: ParsedResearchInput;
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan: GroundingQueryPlan;
}): string | null {
  const summary = input.sourceQualitySummary;
  if (input.parsedInput.inputType === "invalid") return null;
  if (summary.academicEnough && summary.evidenceUsableEnough) return null;
  const hasEnglishAcademicQuery =
    input.normalizedSearchTopic.enAcademicQuery.length > 0 ||
    (input.queryPlan.enAcademicQueries?.length ?? 0) > 0 ||
    input.queryPlan.bilingualQueries.en.length > 0;
  if (
    ACADEMIC_RETRY_POLICY.retryWhenOnlyOfficialBackground &&
    summary.officialBackgroundCount > 0 &&
    summary.academicCandidateCount === 0
  ) {
    return "only_official_background_sources";
  }
  if (summary.academicCandidateCount < ACADEMIC_RETRY_POLICY.minAcademicCandidates) {
    return "academic_candidates_below_threshold";
  }
  if (summary.peerReviewedOrDoiCount < ACADEMIC_RETRY_POLICY.minPeerReviewedOrDOI) {
    return "peer_reviewed_or_doi_below_threshold";
  }
  if (!summary.evidenceUsableEnough) return "evidence_usable_sources_below_threshold";
  return hasEnglishAcademicQuery ? "academic_query_results_below_threshold" : null;
}

function rejectionReasonCounts(
  candidates: SourceCandidate[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    if (candidate.reviewStatus !== "rejected") continue;
    const reason = candidate.rejectionReason ?? "rejected";
    counts[reason] = (counts[reason] ?? 0) + 1;
  }
  return counts;
}

function finalUiStateForDiagnostics(input: {
  parsedInput: ParsedResearchInput;
  rawCount: number;
  providerErrors: GroundingPipelineDiagnostics["providerErrors"];
  candidateCount: number;
  providerGroupCount: number;
  currentPhase?: string;
  fallbackCompleted?: boolean;
  academicRetry?: AcademicRetry;
  sourceQualitySummary?: SourceQualitySummary;
}): string {
  if (input.currentPhase === "searching_initial") return "searching_initial";
  if (input.currentPhase === "searching_fallback") return "searching_fallback";
  if (input.currentPhase === "academic_retrying" || input.academicRetry?.active) {
    return "academic_retrying";
  }
  if (input.currentPhase === "scoring_sources") return "scoring_sources";
  if (input.currentPhase === "source_review_ready") return "source_review_ready";
  if (input.currentPhase === "source_review_needs_manual") return "source_review_needs_manual";
  if (input.sourceQualitySummary && input.candidateCount > 0) {
    if (
      input.sourceQualitySummary.academicEnough ||
      input.sourceQualitySummary.evidenceUsableEnough
    ) {
      return "source_review_ready";
    }
    if (input.academicRetry?.exhausted) return "source_review_needs_manual";
  }
  if (input.candidateCount > 0) {
    return input.candidateCount >= READY_REVIEWABLE_SOURCE_COUNT
      ? "ready_for_next_step"
      : input.candidateCount >= MIN_REVIEWABLE_SOURCE_COUNT
        ? "waiting_for_review"
        : "needs_query_revision";
  }
  if (input.parsedInput.inputType === "invalid") return "invalid_input";
  if (input.fallbackCompleted) return "no_sources_after_fallback";
  if (
    input.candidateCount === 0 &&
    input.providerGroupCount > 0 &&
    input.providerErrors.length >= input.providerGroupCount
  ) {
    return "provider_failed";
  }
  if (input.rawCount === 0 && input.candidateCount === 0) {
    return "no_raw_results_retry_with_english_relaxed_queries";
  }
  if (input.candidateCount === 0) return "raw_results_filtered_relaxed_review_fallback";
  return "sources_ready";
}

function buildGroundingDiagnostics(input: {
  rawTopic: string;
  parsedInput: ParsedResearchInput;
  topicAnalysis: TopicAnalysis;
  queryPlan?: GroundingQueryPlan;
  searchResult?: SearchIntentSourceSearchResult;
  sourceCandidates?: SourceCandidate[];
  selectedDomain?: string;
  researchQuestion?: string;
  currentPhase?: string;
  foregroundLatencyMs?: number;
  fallbackAttempts?: GroundingFallbackAttempt[];
  fallbackCompleted?: boolean;
  maxFallbackRounds?: number;
  academicRetry?: AcademicRetry;
  sourceQualitySummary?: SourceQualitySummary;
}): GroundingPipelineDiagnostics {
  const sourceCandidates = input.sourceCandidates ?? [];
  const highConfidenceCandidates = highConfidenceSourceCandidates(sourceCandidates, input.queryPlan);
  const officialBackgroundCandidates = officialBackgroundSourceCandidates(sourceCandidates);
  const manualReviewCandidates = manualReviewSourceCandidates(sourceCandidates);
  const fallbackReviewCandidates = fallbackReviewSourceCandidates(sourceCandidates);
  const reviewableCandidates = sourceCandidates.filter(
    (candidate) => candidate.reviewStatus !== "rejected",
  );
  const acceptedCount = sourceCandidates.filter(
    (candidate) => candidate.reviewStatus === "accepted",
  ).length;
  const rawCount =
    input.searchResult?.diagnostics?.raw_provider_count ??
    input.searchResult?.diagnostics?.provider_search_results_count ??
    (input.searchResult?.provider_status ?? []).reduce(
      (sum, group) => sum + (group.raw_count ?? group.results.length),
      0,
    );
  const normalizeAttemptCount =
    input.searchResult?.diagnostics?.normalize_attempt_count ?? rawCount;
  const normalizedValidCount =
    input.searchResult?.diagnostics?.normalized_valid_count ??
    (input.searchResult?.provider_status ?? []).reduce(
      (sum, group) => sum + (group.normalized_valid_count ?? group.results.length),
      0,
    );
  const normalizedInvalidCount =
    input.searchResult?.diagnostics?.normalized_invalid_count ??
    Math.max(0, normalizeAttemptCount - normalizedValidCount);
  const candidateCount = reviewableCandidates.length;
  const sourceQualitySummary =
    input.sourceQualitySummary ?? buildSourceQualitySummary(sourceCandidates);
  const academicRetry = input.academicRetry;
  const providerErrors = providerErrorsFromSearchResult(input.searchResult);
  const searchProfile = input.searchResult?.diagnostics?.search_profile;
  const supportCandidateCount = reviewableCandidates.length;
  const academicMinimum = searchProfile === "deep" ? 5 : 3;
  const acceptedManualReviewCount = manualReviewCandidates.filter(
    (candidate) =>
      candidate.acceptedByUser === true ||
      candidate.userDecision === "accepted" ||
      candidate.userDecision === "accepted_as_manual_review" ||
      Boolean(candidate.acceptedAs),
  ).length;
  const scholarlyDraftCount = highConfidenceCandidates.length + acceptedManualReviewCount;
  const scholarlyMinimumMet =
    scholarlyDraftCount >= academicMinimum || sourceQualitySummary.academicEnough;
  const officialBackgroundMinimumMet = officialBackgroundCandidates.length > 0;
  const canProceedToSourceReview =
    supportCandidateCount >= MIN_REVIEWABLE_SOURCE_COUNT && academicRetry?.active !== true;
  const canProceedToAcademicDraft = sourceQualitySummary.academicEnough || scholarlyMinimumMet;
  const canProceedToBackgroundDraft =
    canProceedToAcademicDraft || officialBackgroundMinimumMet;
  const readinessWarnings = uniqueStrings([
    sourceQualitySummary.academicCandidateCount === 0 && officialBackgroundCandidates.length > 0
      ? "目前只找到官方背景來源，尚未找到可自動推薦的學術論文。"
      : "",
    academicRetry?.active
      ? "正在延伸學術查詢，重新搜尋期刊、論文與 DOI 來源。"
      : "",
    academicRetry?.exhausted && !sourceQualitySummary.academicEnough
      ? `已自動嘗試 ${academicRetry.count} 輪學術延伸查詢，但學術來源仍不足。`
      : "",
    manualReviewCandidates.length > 0 && acceptedManualReviewCount === 0
      ? "待人工審查來源需由使用者明確接受後，才會影響草稿準備度。"
      : "",
    supportCandidateCount > 0 && supportCandidateCount < MIN_REVIEWABLE_SOURCE_COUNT
      ? `只找到 ${supportCandidateCount} 筆可審查來源，未達最低 ${MIN_REVIEWABLE_SOURCE_COUNT} 筆，請放寬搜尋或重新搜尋。`
      : "",
    supportCandidateCount >= MIN_REVIEWABLE_SOURCE_COUNT &&
    supportCandidateCount < READY_REVIEWABLE_SOURCE_COUNT
      ? "來源較少，建議補充。"
      : "",
  ]);
  const readinessReason =
    academicRetry?.active
      ? "正在延伸學術查詢並重新搜尋論文來源。"
      : academicRetry?.exhausted && supportCandidateCount > 0 && !sourceQualitySummary.academicEnough
        ? "已完成所有自動學術延伸查詢；目前來源仍需人工審查或補充。"
        : supportCandidateCount === 0
          ? input.fallbackCompleted
            ? "所有自動 fallback 查詢完成後仍未找到可審查來源。"
            : "系統正在改用更精確的學術查詢重新搜尋。"
          : supportCandidateCount < MIN_REVIEWABLE_SOURCE_COUNT
            ? `只找到 ${supportCandidateCount} 筆可審查來源，未達最低 ${MIN_REVIEWABLE_SOURCE_COUNT} 筆。`
            : !canProceedToAcademicDraft && officialBackgroundCandidates.length > 0
              ? "目前只找到官方背景來源，尚未找到可自動推薦的學術論文。"
              : canProceedToAcademicDraft
                ? "已達學術草稿最低來源門檻。"
                : supportCandidateCount < READY_REVIEWABLE_SOURCE_COUNT
                  ? "來源較少，建議補充，但仍可進入來源審查。"
                  : "來源已可審查，學術草稿來源尚未達最低門檻。";
  const canProceedToNextStage = canProceedToSourceReview;
  const blockingReason = canProceedToNextStage
    ? null
    : input.parsedInput.inputType === "invalid"
        ? "無法辨識有效研究主題。"
        : readinessReason;
  const userVisibleStatus =
    academicRetry?.active || input.currentPhase === "academic_retrying"
      ? "正在延伸學術查詢，重新搜尋期刊、論文與 DOI 來源..."
      : input.currentPhase === "searching_fallback"
      ? "系統正在改用更精確的學術查詢重新搜尋……"
      : academicRetry?.exhausted && !sourceQualitySummary.academicEnough && supportCandidateCount > 0
        ? `已自動嘗試 ${academicRetry.count} 輪學術延伸查詢，但學術來源仍不足；請在來源審查中補充或手動調整查詢。`
      : input.fallbackCompleted && supportCandidateCount === 0
        ? "所有自動 fallback 查詢完成後，仍未取得可審查來源。"
        : sourceQualitySummary.academicCandidateCount >= MIN_REVIEWABLE_SOURCE_COUNT &&
          canProceedToSourceReview
          ? `已找到 ${sourceQualitySummary.academicCandidateCount} 筆學術候選來源，可進入來源審查。`
            : supportCandidateCount > 0 && supportCandidateCount < MIN_REVIEWABLE_SOURCE_COUNT
              ? `只找到 ${supportCandidateCount} 筆可審查來源，未達最低 ${MIN_REVIEWABLE_SOURCE_COUNT} 筆；請放寬搜尋或重新搜尋。`
            : supportCandidateCount >= MIN_REVIEWABLE_SOURCE_COUNT &&
              supportCandidateCount < READY_REVIEWABLE_SOURCE_COUNT
              ? `已找到 ${supportCandidateCount} 筆可審查來源；來源較少，建議補充，但可先進入來源審查。`
              : fallbackReviewCandidates.length > 0
                ? `已找到 ${fallbackReviewCandidates.length} 筆待人工審查來源，可先進入來源審查確認。`
                : providerErrors.length > 0 && canProceedToSourceReview
                  ? "部分來源服務受限，已使用可取得來源繼續。"
                  : canProceedToSourceReview
                    ? "來源已可審查。"
                    : "尚未取得可審查來源。";
  const providerStatus = input.searchResult?.diagnostics?.provider_status ?? [];
  const providerHealth = input.searchResult?.diagnostics?.provider_health ?? [];
  const attemptedProviders = uniqueStrings(providerStatus.map((provider) => provider.provider));
  const degradedProviders = uniqueStrings(
    providerHealth
      .filter((provider) => provider.status === "degraded")
      .map((provider) => provider.provider),
  );
  const downProviders = uniqueStrings(
    providerHealth
      .filter((provider) => provider.status === "down")
      .map((provider) => provider.provider),
  );
  const skippedProviders = uniqueStrings([
    ...providerStatus
      .filter((provider) => /cooling down|cooldown|down/i.test(provider.error_message ?? ""))
      .map((provider) => provider.provider),
    ...downProviders,
  ]);
  const trustedSeedFallbackUsed = sourceCandidates.some(
    (candidate) => candidate.retrievalMode === "trusted_seed",
  );
  const fallbackProvidersUsed = uniqueStrings(
    sourceCandidates
      .filter((candidate) => candidate.retrievalMode === "trusted_seed")
      .map((candidate) => candidate.provider || "trusted_seed"),
  );
  const fallbackReason =
    trustedSeedFallbackUsed && highConfidenceCandidates.length === 0
      ? "trusted_seed_fallback"
      : providerErrors.some((error) => error.errorType === "timeout")
        ? "provider_timeout"
        : downProviders.length > 0
          ? "provider_down"
          : !sourceQualitySummary.academicEnough && supportCandidateCount > 0
            ? "scholarly_results_below_threshold"
            : "none";

  return {
    rawTopic: input.rawTopic,
    rawUserTopic: input.rawTopic,
    normalizedTopic: input.topicAnalysis.normalizedTopic,
    currentPhase: input.currentPhase,
    normalizedQueries: input.queryPlan
      ? {
          originalQuery: input.queryPlan.originalQuery ?? input.rawTopic,
          zhAcademicQuery: input.queryPlan.zhCoreQueries ?? [],
          enAcademicQuery: input.queryPlan.enAcademicQueries ?? input.queryPlan.enCoreQueries ?? [],
          keywordSet: uniqueStrings(
            (input.queryPlan.conceptGroups ?? []).flatMap((group) => [
              group.name,
              ...group.zhTerms,
              ...group.enTerms,
            ]),
          ),
          negativeKeywords: input.queryPlan.excludedDriftTerms,
          broaderAcademicQueries: input.queryPlan.broadFallbackQueries ?? [],
        }
      : undefined,
    domain: input.queryPlan?.domain ?? input.parsedInput.domain ?? null,
    intent: input.queryPlan?.intent ?? null,
    queryPlanSummary: uniqueStrings([
      ...(input.queryPlan?.primaryQueries ?? []).slice(0, 3),
      ...(input.queryPlan?.enAcademicQueries ?? []).slice(0, 3),
    ]),
    conceptGroups: input.queryPlan?.conceptGroups ?? [],
    queryPlanTopQueries: uniqueStrings([
      ...(input.queryPlan?.enAcademicQueries ?? []),
      ...(input.queryPlan?.primaryQueries ?? []),
      ...(input.queryPlan?.bilingualQueries.en ?? []),
    ]).slice(0, 8),
    selectedTopic: input.parsedInput.canonicalTopic || input.topicAnalysis.normalizedTopic,
    selectedDomain: input.selectedDomain ?? input.parsedInput.domain,
    researchQuestion: input.researchQuestion,
    researchTitle: input.parsedInput.displayTitle || input.parsedInput.canonicalTopic,
    queryPlan: input.queryPlan,
    zhQueries: uniqueStrings([
      ...(input.queryPlan?.bilingualQueries.zh ?? []),
      ...(input.searchResult?.queries.chinese ?? []),
      ...(input.searchResult?.queries.chineseSupplemental ?? []),
    ]),
    enQueries: uniqueStrings([
      ...(input.queryPlan?.bilingualQueries.en ?? []),
      ...(input.searchResult?.queries.english ?? []),
      ...(input.searchResult?.queries.coreEnglishAcademic ?? []),
      ...(input.searchResult?.queries.academicSynonyms ?? []),
      ...(input.searchResult?.queries.fallbackRelaxed ?? []),
    ]),
    providersCalled: uniqueStrings(
      (input.searchResult?.provider_status ?? []).map((group) => group.provider),
    ),
    rawProviderCounts: aggregateProviderCounts(input.searchResult),
    rawProviderCount: rawCount,
    normalizeAttemptCount,
    normalizedValidCount,
    normalizedInvalidCount,
    normalizedCount: normalizedValidCount,
    dedupedCount:
      input.searchResult?.diagnostics?.deduped_count ??
      input.searchResult?.searchTrace?.dedupedCount ??
      normalizedValidCount,
    scoredCount:
      input.searchResult?.diagnostics?.scored_count ??
      input.searchResult?.scoredSources?.length ??
      sourceCandidates.length,
    highConfidenceCandidateCount: highConfidenceCandidates.length,
    scholarlyRecommendedCount: sourceQualitySummary.academicCandidateCount,
    officialBackgroundCount: officialBackgroundCandidates.length,
    manualReviewCount: manualReviewCandidates.length,
    candidateCount,
    fallbackReviewCount: fallbackReviewCandidates.length,
    rejectedCount: sourceCandidates.filter((candidate) => candidate.reviewStatus === "rejected").length,
    acceptedCount,
    canProceedToSourceReview,
    canProceedToAcademicDraft,
    canProceedToBackgroundDraft,
    readinessReason,
    readinessWarnings,
    canProceedToNextStage,
    blockingReason,
    userVisibleStatus,
    academicRetry,
    sourceQualitySummary,
    topHighConfidenceSources: highConfidenceCandidates.slice(0, 5).map((candidate) => ({
      title: candidate.title,
      provider: candidate.provider,
      finalScore: candidate.finalScore,
      matchedConcepts: candidate.matchedConcepts,
      matchedFields: candidate.matchedFields,
      acceptReason: candidate.acceptReason,
      confidenceTier: candidate.confidenceTier,
      recommendationBucket: candidate.recommendationBucket,
    })),
    topFallbackSources: fallbackReviewCandidates.slice(0, 5).map((candidate) => ({
      title: candidate.title,
      provider: candidate.provider,
      finalScore: candidate.finalScore,
      matchedConcepts: candidate.matchedConcepts,
      matchedFields: candidate.matchedFields,
      rejectionReason: candidate.rejectionReason,
      lowConfidence: candidate.lowConfidence,
      needsReview: candidate.needsReview,
      recommendationBucket: candidate.recommendationBucket,
      sourceRole: candidate.sourceRole,
    })),
    rejectedReasonCounts: rejectionReasonCounts(sourceCandidates),
    rejectionReasons: {
      ...(input.searchResult?.diagnostics?.rejection_reasons ?? {}),
      ...rejectionReasonCounts(sourceCandidates),
    },
    providerErrors,
    providerHealth: input.searchResult?.diagnostics?.provider_health,
    sourceRetrieval: {
      attemptedProviders,
      skippedProviders,
      degradedProviders,
      downProviders,
      fallbackReason,
      fallbackProvidersUsed,
      scholarlyMinimumMet,
      officialBackgroundMinimumMet,
      warnings: readinessWarnings,
    },
    providerProgress: input.searchResult
      ? providerProgressForDiagnostics(input.searchResult, sourceCandidates)
      : [
        { provider: "OpenAlex", status: "searching", resultCount: 0 },
        { provider: "Crossref", status: "searching", resultCount: 0 },
        { provider: "CORE", status: "background", resultCount: 0 },
      ],
    fallbackAttempts: input.fallbackAttempts,
    fallbackCompleted: input.fallbackCompleted,
    maxFallbackRounds: input.maxFallbackRounds,
    finalUiState: finalUiStateForDiagnostics({
      parsedInput: input.parsedInput,
      rawCount,
      providerErrors,
      candidateCount,
      providerGroupCount: input.searchResult?.provider_status.length ?? 0,
      currentPhase: input.currentPhase,
      fallbackCompleted: input.fallbackCompleted,
      academicRetry,
      sourceQualitySummary,
    }),
    searchProfile,
    estimatedTime: input.searchResult?.diagnostics?.profile?.estimatedTimeLabel,
    cacheHit: input.searchResult?.diagnostics?.cache_hit,
    cacheStatus: input.searchResult?.diagnostics?.cache_status ?? "miss",
    earlyStopReason: input.searchResult?.diagnostics?.early_stop_reason,
    foregroundLatencyMs:
      input.foregroundLatencyMs ?? input.searchResult?.diagnostics?.foreground_latency_ms,
    firstCandidateLatencyMs: input.searchResult?.diagnostics?.first_candidate_latency_ms,
    triedQueries: input.searchResult?.diagnostics?.tried_queries,
  };
}

function shouldIncludeDiagnosticTrace(input: ResearchGroundingJobCreateRequest): boolean {
  return input.debugTrace === true || process.env.NODE_ENV !== "production";
}

function sanitizeProviderError(value: string | null | undefined): string | undefined {
  const sanitized = compactWhitespace(value ?? "")
    .replace(/authorization\s*[:=]\s*[^\s,;]+/gi, "authorization=[redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "bearer [redacted]")
    .replace(/x-api-key\s*[:=]\s*[^\s,;]+/gi, "x-api-key=[redacted]")
    .replace(/api[_-]?key\s*[:=]\s*[^\s,;]+/gi, "api_key=[redacted]")
    .replace(/sk-[a-z0-9_-]+/gi, "sk-[redacted]")
    .replace(/sk-proj-[a-z0-9_-]+/gi, "sk-proj-[redacted]")
    .slice(0, 240);
  return sanitized || undefined;
}

function diagnosticQueryPurpose(query: string): ResearchGroundingDiagnosticTrace["step3_queryPlan"]["bilingualQueries"][number]["purpose"] {
  if (/分類|分類學|taxonomy|Ailuropoda|Ailurus|Ursidae|Ailuridae|giant panda|red panda/i.test(query)) {
    return "taxonomy";
  }
  if (/名稱|命名|用法|語境|terminology|naming|cat-bear|Chinese language/i.test(query)) {
    return "terminology";
  }
  if (/定義|definition|what is/i.test(query)) return "definition";
  if (/review|文獻|研究|academic/i.test(query)) return "review";
  if (/背景|科普|教育|background|education|explainer/i.test(query)) return "background";
  if (query.split(/\s+/u).length <= 3) return "specific";
  return "broad";
}

function providerHintsForDiagnosticQuery(
  query: string,
  providerQueries: GroundingQueryPlan["providerQueries"],
): string[] {
  const hints: string[] = [];
  const includesQuery = (queries: string[] | undefined) =>
    (queries ?? []).some((candidate) => candidate === query || candidate.includes(query) || query.includes(candidate));
  if (includesQuery(providerQueries.openalex)) hints.push("OpenAlex");
  if (includesQuery(providerQueries.crossref)) hints.push("Crossref");
  if (includesQuery(providerQueries.semanticScholar)) hints.push("Semantic Scholar");
  if (includesQuery(providerQueries.core)) hints.push("CORE");
  if (includesQuery(providerQueries.web)) hints.push("web");
  return hints.length ? hints : ["OpenAlex", "Crossref"];
}

function diagnosticBilingualQueries(
  queryPlan?: GroundingQueryPlan,
): ResearchGroundingDiagnosticTrace["step3_queryPlan"]["bilingualQueries"] {
  if (!queryPlan) return [];
  return [
    ...uniqueStrings(queryPlan.bilingualQueries.zh).map((query) => ({
      query,
      lang: "zh" as const,
      purpose: diagnosticQueryPurpose(query),
      providerHints: providerHintsForDiagnosticQuery(query, queryPlan.providerQueries),
    })),
    ...uniqueStrings(queryPlan.bilingualQueries.en).map((query) => ({
      query,
      lang: "en" as const,
      purpose: diagnosticQueryPurpose(query),
      providerHints: providerHintsForDiagnosticQuery(query, queryPlan.providerQueries),
    })),
  ];
}

function queryRoutingTextForPlan(queryPlan: GroundingQueryPlan): string {
  return compactWhitespace([
    queryPlan.originalQuery,
    queryPlan.domain,
    queryPlan.intent,
    ...(queryPlan.conceptGroups ?? []).flatMap((group) => [group.name, ...group.zhTerms, ...group.enTerms]),
    ...queryPlan.primaryQueries,
  ].join(" "));
}

function selectedQueriesByProviderForDiagnostic(
  queryPlan?: GroundingQueryPlan,
): Record<string, string[]> | undefined {
  if (!queryPlan) return undefined;
  const topicText = queryRoutingTextForPlan(queryPlan);
  const backgroundQueries = backgroundRoutedQueries([
    ...queryPlan.primaryQueries,
    ...queryPlan.secondaryQueries,
    ...queryPlan.bilingualQueries.zh,
    ...queryPlan.bilingualQueries.en,
    ...(queryPlan.providerQueries.web ?? []),
  ], topicText);
  return {
    openalex: providerSafeQueries(queryPlan.providerQueries.openalex, topicText),
    crossref: providerSafeQueries(queryPlan.providerQueries.crossref, topicText),
    semanticScholar: providerSafeQueries(queryPlan.providerQueries.semanticScholar ?? [], topicText),
    core: providerSafeQueries(queryPlan.providerQueries.core, topicText),
    web: uniqueStrings([...(queryPlan.providerQueries.web ?? []), ...backgroundQueries]).slice(0, 12),
  };
}

function diagnosticClassifiedQueries(
  queryPlan?: GroundingQueryPlan,
): NonNullable<ResearchGroundingDiagnosticTrace["step3_queryPlan"]["classifiedQueries"]> {
  if (!queryPlan) return [];
  const topicText = queryRoutingTextForPlan(queryPlan);
  return uniqueStrings([
    ...queryPlan.primaryQueries,
    ...queryPlan.secondaryQueries,
    ...queryPlan.bilingualQueries.zh,
    ...queryPlan.bilingualQueries.en,
    ...queryPlan.providerQueries.openalex,
    ...queryPlan.providerQueries.crossref,
    ...(queryPlan.providerQueries.semanticScholar ?? []),
    ...queryPlan.providerQueries.core,
    ...(queryPlan.providerQueries.web ?? []),
  ]).slice(0, 80).map((query) => {
    const routed = classifySearchQueryForRouting(query, topicText);
    return {
      query,
      classification: routed.classification,
      reason: routed.reason,
      providerHints: providerHintsForDiagnosticQuery(query, queryPlan.providerQueries),
    };
  });
}

function providerExecutionTrace(
  searchResult?: SearchIntentSourceSearchResult,
): ResearchGroundingDiagnosticTrace["step4_providerExecution"] {
  const groups = searchResult?.provider_status ?? [];
  const byProvider = new Map<
    string,
    {
      provider: string;
      queriesUsed: string[];
      rawCount: number;
      latencyMs: number;
      okCount: number;
      emptyOkCount: number;
      timeoutCount: number;
      failedCount: number;
      skippedCount: number;
      errorType?: string;
      safeErrorMessage?: string;
    }
  >();

  for (const group of groups) {
    const provider = group.provider || "unknown";
    const current =
      byProvider.get(provider) ??
      {
        provider,
        queriesUsed: [],
        rawCount: 0,
        latencyMs: 0,
        okCount: 0,
        emptyOkCount: 0,
        timeoutCount: 0,
        failedCount: 0,
        skippedCount: 0,
      };
    const rawCount = group.raw_count ?? group.results.length;
    if (group.query) current.queriesUsed = uniqueStrings([...current.queriesUsed, group.query]);
    current.rawCount += rawCount;
    current.latencyMs += Math.max(0, Math.round(group.latency_ms ?? 0));
    if (group.ok && rawCount > 0) current.okCount += 1;
    if (group.ok && rawCount === 0) current.emptyOkCount += 1;
    if (group.error_type === "timeout") current.timeoutCount += 1;
    if (!group.ok && group.error_type !== "timeout") {
      if (/cooldown|cooling down|disabled|skipped/i.test(group.error_message ?? "")) {
        current.skippedCount += 1;
      } else {
        current.failedCount += 1;
      }
    }
    if (!current.errorType && group.error_type) current.errorType = group.error_type;
    const safeErrorMessage = sanitizeProviderError(group.error_message);
    if (!current.safeErrorMessage && safeErrorMessage) current.safeErrorMessage = safeErrorMessage;
    byProvider.set(provider, current);
  }

  return Array.from(byProvider.values()).map((item) => {
    const status: ResearchGroundingDiagnosticTrace["step4_providerExecution"][number]["status"] =
      item.okCount > 0
        ? "success"
        : item.timeoutCount > 0 && item.failedCount === 0
          ? "timeout"
          : item.failedCount > 0
            ? "failed"
            : item.skippedCount > 0
              ? "skipped"
              : "empty";
    return {
      provider: item.provider,
      status,
      queriesUsed: item.queriesUsed,
      rawCount: item.rawCount,
      latencyMs: item.latencyMs,
      ...(item.errorType ? { errorType: item.errorType } : {}),
      ...(item.safeErrorMessage ? { safeErrorMessage: item.safeErrorMessage } : {}),
    };
  });
}

function sourceCandidateProviderLabel(provider: SourceCandidate["provider"]): string {
  switch (provider) {
    case "openalex":
      return "OpenAlex";
    case "crossref":
      return "Crossref";
    case "semanticScholar":
      return "Semantic Scholar";
    case "core":
      return "CORE";
    case "manual":
      return "Manual";
    case "web":
    default:
      return "Web";
  }
}

function providerProgressForDiagnostics(
  searchResult: SearchIntentSourceSearchResult,
  sourceCandidates: SourceCandidate[],
): NonNullable<GroundingPipelineDiagnostics["providerProgress"]> {
  type ProviderProgress = NonNullable<GroundingPipelineDiagnostics["providerProgress"]>[number];
  type ProviderBucketCounts = {
    acceptedCount: number;
    candidateCount: number;
    fallbackReviewCount: number;
    rejectedCount: number;
  };
  const bucketCounts = new Map<string, ProviderBucketCounts>();

  for (const candidate of sourceCandidates) {
    const provider = sourceCandidateProviderLabel(candidate.provider);
    const current =
      bucketCounts.get(provider) ??
      {
        acceptedCount: 0,
        candidateCount: 0,
        fallbackReviewCount: 0,
        rejectedCount: 0,
      };
    if (candidate.reviewStatus === "accepted") current.acceptedCount += 1;
    if (candidate.reviewStatus === "rejected") {
      current.rejectedCount += 1;
    } else {
      current.candidateCount += 1;
    }
    if (
      candidate.reviewStatus === "review" ||
      candidate.recommendationBucket === "manual_review" ||
      candidate.recommendationBucket === "official_background" ||
      candidate.confidenceTier === "fallback" ||
      candidate.lowConfidence ||
      candidate.needsReview
    ) {
      current.fallbackReviewCount += 1;
    }
    bucketCounts.set(provider, current);
  }

  const grouped = new Map<
    string,
    {
      provider: string;
      queries: string[];
      rawResultsCount: number;
      normalizedCount: number;
      durationMs: number;
      okCount: number;
      emptyOkCount: number;
      timeoutCount: number;
      errorCount: number;
      errorMessage?: string;
    }
  >();

  for (const group of searchResult.provider_status ?? []) {
    const provider = group.provider || "unknown";
    const current =
      grouped.get(provider) ??
      {
        provider,
        queries: [],
        rawResultsCount: 0,
        normalizedCount: 0,
        durationMs: 0,
        okCount: 0,
        emptyOkCount: 0,
        timeoutCount: 0,
        errorCount: 0,
      };
    const rawCount = group.raw_count ?? group.results.length;
    const normalizedCount = group.normalized_valid_count ?? group.results.length;
    if (group.query) current.queries = uniqueStrings([...current.queries, group.query]);
    current.rawResultsCount += rawCount;
    current.normalizedCount += normalizedCount;
    current.durationMs += Math.max(0, Math.round(group.latency_ms ?? 0));
    if (group.ok && rawCount > 0) current.okCount += 1;
    if (group.ok && rawCount === 0) current.emptyOkCount += 1;
    if (group.error_type === "timeout") current.timeoutCount += 1;
    if (!group.ok && group.error_type !== "timeout") current.errorCount += 1;
    const safeError = sanitizeProviderError(group.error_message);
    if (!current.errorMessage && safeError) current.errorMessage = safeError;
    grouped.set(provider, current);
  }

  const rows: ProviderProgress[] = Array.from(grouped.values()).map((item) => {
    const bucket = bucketCounts.get(item.provider) ?? {
      acceptedCount: 0,
      candidateCount: 0,
      fallbackReviewCount: 0,
      rejectedCount: 0,
    };
    const status: ProviderProgress["status"] =
      item.okCount > 0
        ? "success"
        : item.timeoutCount > 0 && item.errorCount === 0
          ? "timeout"
          : item.errorCount > 0
            ? "error"
            : "empty";
    return {
      provider: item.provider,
      status,
      resultCount: item.normalizedCount,
      queryCount: item.queries.length,
      rawResultsCount: item.rawResultsCount,
      normalizedCount: item.normalizedCount,
      acceptedCount: bucket.acceptedCount,
      candidateCount: bucket.candidateCount,
      fallbackReviewCount: bucket.fallbackReviewCount,
      rejectedCount: bucket.rejectedCount,
      durationMs: item.durationMs,
      ...(item.durationMs > 0 ? { latencyMs: item.durationMs } : {}),
      ...(item.queries[0] ? { query: item.queries[0] } : {}),
      ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
    };
  });

  if (!rows.some((row) => row.provider === "CORE")) {
    rows.push({
      provider: "CORE",
      status: "background",
      resultCount: 0,
      queryCount: 0,
      rawResultsCount: 0,
      normalizedCount: 0,
      acceptedCount: 0,
      candidateCount: 0,
      fallbackReviewCount: 0,
      rejectedCount: 0,
      durationMs: 0,
    });
  }

  return rows;
}

function diagnosticSourceBucket(
  candidate: SourceCandidate,
): ResearchGroundingDiagnosticTrace["step6_scoring"][number]["finalBucket"] {
  if (candidate.reviewStatus === "rejected" || candidate.recommendationBucket === "rejected") {
    return "rejected";
  }
  if (candidate.reviewStatus === "accepted") return "accepted";
  if (candidate.recommendationBucket === "official_background") return "fallback_review";
  return "manual_review";
}

function workflowStatusForDiagnosticTrace(
  status: GroundingJob["status"],
  canProceedToSourceReview: boolean,
  acceptedSources: number,
  reviewableFallbackSources: number,
): ResearchGroundingDiagnosticTrace["step8_nextStepDecision"]["workflowStatus"] {
  if (status === "failed") return "failed";
  if (status === "no_sources_after_fallback" && !canProceedToSourceReview) return "empty";
  if (!canProceedToSourceReview && reviewableFallbackSources > 0) {
    return "needs_query_revision";
  }
  if (
    canProceedToSourceReview &&
    (status === "source_review_ready" ||
      status === "completed" ||
      reviewableFallbackSources >= READY_REVIEWABLE_SOURCE_COUNT)
  ) {
    return "ready_for_review";
  }
  if (acceptedSources === 0 && reviewableFallbackSources > 0) return "partial";
  if (canProceedToSourceReview) return "partial";
  return "empty";
}

function englishDiagnosticTopic(input: {
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan?: GroundingQueryPlan;
}): string {
  const pandaQuery = [
    ...input.normalizedSearchTopic.keywordSet,
    ...input.normalizedSearchTopic.enAcademicQuery,
  ].join(" ");
  if (/giant panda|red panda|Ailuropoda|Ailurus|cat-bear/i.test(pandaQuery)) {
    return "relationship between the terms panda and cat-bear in Chinese, giant panda taxonomy, red panda distinction, and naming history";
  }
  return (
    input.normalizedSearchTopic.enAcademicQuery[0] ??
    input.queryPlan?.bilingualQueries.en[0] ??
    input.normalizedSearchTopic.displayTitle
  );
}

function buildResearchGroundingDiagnosticTrace(input: {
  workflowId: string;
  topicHash: string;
  originalTopic: string;
  createdAt: string;
  locale: string;
  searchDepth: string;
  topicAnalysis: TopicAnalysis;
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan?: GroundingQueryPlan;
  searchResult?: SearchIntentSourceSearchResult;
  sourceCandidates?: SourceCandidate[];
  groundingDiagnostics?: GroundingPipelineDiagnostics;
  finalStatus: GroundingJob["status"];
}): ResearchGroundingDiagnosticTrace {
  const sourceCandidates = input.sourceCandidates ?? [];
  const rawTotal =
    input.groundingDiagnostics?.rawProviderCount ??
    input.searchResult?.diagnostics?.raw_provider_count ??
    input.searchResult?.provider_status.reduce(
      (sum, group) => sum + (group.raw_count ?? group.results.length),
      0,
    ) ??
    0;
  const normalizedTotal =
    input.groundingDiagnostics?.normalizedCount ??
    input.searchResult?.diagnostics?.normalized_valid_count ??
    rawTotal;
  const dedupedTotal =
    input.groundingDiagnostics?.dedupedCount ??
    input.searchResult?.diagnostics?.deduped_count ??
    sourceCandidates.length;
  const acceptedSources = sourceCandidates.filter((candidate) => candidate.reviewStatus === "accepted").length;
  const officialBackgroundSources = officialBackgroundSourceCandidates(sourceCandidates).length;
  const manualReviewSources = manualReviewSourceCandidates(sourceCandidates).length;
  const fallbackReviewSources = fallbackReviewSourceCandidates(sourceCandidates).length;
  const rejectedSources = sourceCandidates.filter((candidate) => candidate.reviewStatus === "rejected").length;
  const highConfidenceManualSources = sourceCandidates.filter(
    (candidate) =>
      candidate.reviewStatus === "review" &&
      (candidate.highConfidenceManual === true || (candidate.bucketScore ?? 0) >= 0.45),
  ).length;
  const topicEntityMap = buildTopicEntityMap(input.originalTopic, input.queryPlan);
  const backgroundSourceNeeded =
    topicEntityMap.backgroundSourceNeeded && officialBackgroundSources === 0;
  const domainSignal = input.topicAnalysis.domainHypotheses[0];
  const positiveTermsZh = uniqueStrings([
    ...input.normalizedSearchTopic.keywordSet.filter(containsZh),
    ...(input.queryPlan?.conceptGroups ?? []).flatMap((group) => group.zhTerms),
  ]).slice(0, 20);
  const positiveTermsEn = uniqueStrings([
    ...input.normalizedSearchTopic.keywordSet.filter(containsLatin),
    ...input.normalizedSearchTopic.enAcademicQuery.flatMap((query) =>
      query.split(/\s+/u).filter((piece) => piece.length >= 3),
    ),
    ...(input.queryPlan?.conceptGroups ?? []).flatMap((group) => group.enTerms),
  ]).slice(0, 28);
  const canProceedToSourceReview =
    input.groundingDiagnostics?.canProceedToSourceReview ??
    sourceCandidates.some((candidate) => candidate.reviewStatus !== "rejected");
  const workflowStatus = workflowStatusForDiagnosticTrace(
    input.finalStatus,
    canProceedToSourceReview,
    acceptedSources,
    fallbackReviewSources + manualReviewSources + officialBackgroundSources,
  );
  const reason =
    input.groundingDiagnostics?.readinessReason ??
    input.groundingDiagnostics?.finalUiState ??
    (canProceedToSourceReview
      ? "At least one source is available for source review."
      : "No reviewable sources are available after provider execution and scoring.");
  const selectedQueriesByProvider = selectedQueriesByProviderForDiagnostic(input.queryPlan);

  return {
    workflowId: input.workflowId,
    topicHash: input.topicHash,
    originalTopic: input.originalTopic,
    rawUserTopic: input.originalTopic,
    createdAt: input.createdAt,
    step1_input: {
      rawTopic: input.originalTopic,
      rawUserTopic: input.originalTopic,
      locale: input.locale,
      searchDepth: input.searchDepth,
    },
    step2_normalization: {
      normalizedTopicZh: input.normalizedSearchTopic.displayTitle || input.topicAnalysis.normalizedTopic,
      normalizedTopicEn: englishDiagnosticTopic(input),
      detectedDomain:
        input.queryPlan?.domain ??
        domainSignal?.domain ??
        "general_academic",
      confidence: domainSignal?.confidence ?? 0.55,
      ambiguityFlags: uniqueStrings([
        input.topicAnalysis.topicCompleteness?.level,
        ...input.topicAnalysis.warnings,
      ]),
      positiveTermsZh,
      positiveTermsEn,
      negativeTerms: input.normalizedSearchTopic.negativeKeywords,
    },
    step3_queryPlan: {
      bilingualQueries: diagnosticBilingualQueries(input.queryPlan),
      ...(selectedQueriesByProvider
        ? { selectedQueriesByProvider }
        : {}),
      classifiedQueries: diagnosticClassifiedQueries(input.queryPlan),
    },
    step4_providerExecution: providerExecutionTrace(input.searchResult),
    step5_normalizedSources: {
      rawTotal,
      normalizedTotal,
      dedupedTotal,
      duplicateRemoved: Math.max(0, normalizedTotal - dedupedTotal),
      missingTitleCount: sourceCandidates.filter((candidate) => !candidate.title?.trim()).length,
      missingAbstractCount: sourceCandidates.filter(
        (candidate) => !candidate.abstractOriginal?.trim() && !candidate.abstract?.trim(),
      ).length,
    },
    step6_scoring: sourceCandidates.slice(0, 50).map((candidate) => {
      const rejectionReasons =
        candidate.reviewStatus === "rejected"
          ? uniqueStrings([candidate.rejectionReason, ...(candidate.limitations ?? [])])
          : undefined;
      return {
        sourceId: candidate.sourceId,
        title: candidate.title,
        provider: candidate.provider,
        ...(candidate.url ? { url: candidate.url } : {}),
        ...(candidate.doi ? { doi: candidate.doi } : {}),
        ...(typeof candidate.year === "number" ? { year: candidate.year } : {}),
        ...(candidate.sourceType ? { sourceType: candidate.sourceType } : {}),
        relevanceScore: candidate.relevanceScore,
        qualityScore: candidate.sourceQualityScore,
        ...(candidate.sourceBucket ? { bucket: candidate.sourceBucket } : {}),
        ...(typeof candidate.bucketScore === "number" ? { bucketScore: candidate.bucketScore } : {}),
        decision: diagnosticSourceBucket(candidate),
        ...(candidate.decisionReasons?.length ? { decisionReasons: candidate.decisionReasons } : {}),
        ...(candidate.matchedEntities?.length ? { matchedEntities: candidate.matchedEntities } : {}),
        ...(candidate.missingRequiredSignals?.length
          ? { missingRequiredSignals: candidate.missingRequiredSignals }
          : {}),
        ...(candidate.sourceUseCase ? { sourceUseCase: candidate.sourceUseCase } : {}),
        finalBucket: diagnosticSourceBucket(candidate),
        matchedTerms: uniqueStrings([
          ...(candidate.matchedEntities ?? []),
          ...(candidate.matchedConcepts ?? []),
          ...(candidate.matchedFields ?? []).map((field) => `field:${field}`),
        ]),
        ...(rejectionReasons?.length ? { rejectionReasons } : {}),
        scoringNotes: uniqueStrings([
          `reviewStatus=${candidate.reviewStatus}`,
          `recommendationBucket=${candidate.recommendationBucket}`,
          `sourceRole=${candidate.sourceRole}`,
          candidate.confidenceTier ? `confidenceTier=${candidate.confidenceTier}` : "",
          candidate.governanceReason ? `governance=${candidate.governanceReason}` : "",
          candidate.acceptReason ? `acceptReason=${candidate.acceptReason}` : "",
          ...(candidate.limitations ?? []).slice(0, 3),
        ]),
      };
    }),
    step7_bucketSummary: {
      acceptedSources,
      fallbackReviewSources,
      manualReviewSources,
      rejectedSources,
      officialBackgroundSources,
      highConfidenceManualSources,
      bucketCounts: bucketCountsForCandidates(sourceCandidates),
      backgroundSourceNeeded,
      ...(backgroundSourceNeeded && topicEntityMap.missingProviderReason
        ? { missingProviderReason: topicEntityMap.missingProviderReason }
        : {}),
    },
    step8_nextStepDecision: {
      workflowStatus,
      canProceedToSourceReview,
      reason,
      ...(!canProceedToSourceReview
        ? { requiredUserAction: "調整主題、加入查詢詞，或手動提供來源後重新搜尋。" }
        : {}),
    },
  };
}

export function buildSourceCandidates(input: {
  workflowId: string;
  topicHash: string;
  queryPlan: GroundingQueryPlan;
  searchResult: SearchIntentSourceSearchResult;
  parsedInput: ParsedResearchInput;
  retryRound?: number;
}): { sourceCandidates: SourceCandidate[]; warnings: string[] } {
  const createdAt = nowIso();
  const fallbackQueryPlanHash = stableQueryHash(input.queryPlan.primaryQueries.join("|"));
  const requiresPaleontologyAlgaeEvidence = isPaleontologyAlgaeTopic(
    input.searchResult.topic || input.parsedInput.canonicalTopic,
  );
  const requiresAstronomyScienceEducationEvidence = isAstronomyScienceEducationTopic(
    input.searchResult.topic || input.parsedInput.canonicalTopic,
  );
  const requiresAgriculturalWastePollutionEvidence = isAgriculturalWastePollutionTopic(
    input.searchResult.topic || input.parsedInput.canonicalTopic,
  );
  const requiresAiWorkImpactEvidence = isAiWorkImpactTopic(
    input.searchResult.topic || input.parsedInput.canonicalTopic,
  );
  const requiresColaHealthEvidence = isColaHealthTopic(
    input.searchResult.topic || input.parsedInput.canonicalTopic,
  );
  const scoringPlan: Parameters<typeof analyzeRelevanceScore>[1] = {
    workflowId: input.workflowId,
    topicHash: input.topicHash,
    queryHash: fallbackQueryPlanHash,
    queryPlanHash: input.searchResult.queryPlanHash || fallbackQueryPlanHash,
    originalTopic: input.searchResult.topic,
    normalizedTopic: input.searchResult.topic,
    language: "mixed" as const,
    zhQueries: uniqueStrings([
      ...input.queryPlan.bilingualQueries.zh,
      ...(input.searchResult.queries.chinese ?? []),
      ...(input.searchResult.queries.chineseSupplemental ?? []),
      ...(input.searchResult.queries.highPrecision ?? []).filter(containsZh),
    ]),
    enQueries: uniqueStrings([
      ...input.queryPlan.bilingualQueries.en,
      ...(input.searchResult.queries.english ?? []),
      ...(input.searchResult.queries.coreEnglishAcademic ?? []),
      ...(input.searchResult.queries.academicSynonyms ?? []),
      ...(input.searchResult.queries.highPrecision ?? []).filter(containsLatin),
      ...(input.searchResult.queries.broad ?? []).filter(containsLatin),
    ]),
    researchSubtopics: [],
    conceptGroups: uniqueConceptGroups([
      ...(input.queryPlan.conceptGroups ?? []),
      ...conceptGroupsFromSearchIntentTerms([
        ...(input.searchResult.searchIntent.primaryConcepts ?? []),
        ...(input.searchResult.searchIntent.outcomeConcepts ?? []),
        ...(input.searchResult.searchIntent.contextConcepts ?? []),
        ...(input.searchResult.searchIntent.populationConcepts ?? []),
      ]),
    ]),
    requiredSourceTypes: ["journal", "conference", "government", "web"],
    excludedDriftTerms: input.queryPlan.excludedDriftTerms,
    searchIntent: "general_report" as const,
    diagnostics: {
      primaryConcepts: uniqueStrings([
        ...input.queryPlan.primaryQueries.slice(0, 8),
        ...(input.searchResult.searchIntent.primaryConcepts ?? []),
        ...(input.searchResult.searchIntent.outcomeConcepts ?? []),
      ]),
      contextConcepts: uniqueStrings([
        ...input.queryPlan.secondaryQueries.slice(0, 8),
        ...(input.searchResult.searchIntent.contextConcepts ?? []),
        ...(input.searchResult.searchIntent.populationConcepts ?? []),
      ]),
    },
  };
  const canonicalSources = uniqueSourceRecords([
    ...(input.searchResult.candidateSources ?? []),
    ...(input.searchResult.fallbackReviewSources ?? []),
    ...(input.searchResult.rejectedSources ?? []),
    ...((input.searchResult.candidateSources?.length ?? 0) === 0 &&
    (input.searchResult.rejectedSources?.length ?? 0) === 0
      ? input.searchResult.sources ?? []
      : []),
  ]);
  const topicEntityMap = buildTopicEntityMap(
    input.searchResult.topic || input.parsedInput.canonicalTopic,
    input.queryPlan,
  );

  const candidates = canonicalSources.map((source, index) => {
      const normalized = sourceRecordToNormalizedSource(source, {
        workflowId: input.workflowId,
        topicHash: input.topicHash,
        queryPlanHash: input.searchResult.queryPlanHash || fallbackQueryPlanHash,
      });
      const relevanceAnalysis = analyzeRelevanceScore(normalized, scoringPlan);
      const intentAssessment = evaluateSourceAgainstIntent(normalized, input.parsedInput);
      const passesPaleontologyAlgaeEvidence =
        !requiresPaleontologyAlgaeEvidence ||
        hasPaleontologyAlgaeSourceEvidence(normalized);
      const passesAstronomyScienceEducationEvidence =
        !requiresAstronomyScienceEducationEvidence ||
        hasAstronomyScienceEducationSourceEvidence(normalized);
      const passesAgriculturalWastePollutionEvidence =
        !requiresAgriculturalWastePollutionEvidence ||
        hasAgriculturalWastePollutionSourceEvidence(normalized);
      const passesAiWorkImpactEvidence =
        !requiresAiWorkImpactEvidence || hasAiWorkImpactSourceEvidence(normalized);
      const passesColaHealthEvidence =
        !requiresColaHealthEvidence || hasColaHealthSourceEvidence(normalized);
      const passesRequiredTopicEvidence =
        passesPaleontologyAlgaeEvidence &&
        passesAstronomyScienceEducationEvidence &&
        passesAgriculturalWastePollutionEvidence &&
        passesAiWorkImpactEvidence &&
        passesColaHealthEvidence;
      const canonicalRelevanceScore =
        typeof source.relevanceScore === "number"
          ? Math.max(0, Math.min(1, source.relevanceScore / 100))
          : null;
      const canonicalQualityScore =
        typeof source.sourceQualityScore === "number"
          ? Math.max(0, Math.min(1, source.sourceQualityScore / 100))
          : null;
      const lexicalRelevanceScore = Number(relevanceAnalysis.score.toFixed(3));
      const rawRelevanceScore = Number(
        (lexicalRelevanceScore * 0.75 + intentAssessment.score * 0.25).toFixed(3),
      );
      const relevanceScore = Number(
        (canonicalRelevanceScore ??
          (passesRequiredTopicEvidence
            ? rawRelevanceScore
            : Math.min(rawRelevanceScore, 0.18))).toFixed(3),
      );
      const sourceQualityScore = Number(
        (canonicalQualityScore ?? computeSourceQualityScore(normalized) / 100).toFixed(3),
      );
      const sourceType = sourceTypeForCandidate(source);
      const provider = providerKey(source.provider ?? source.sourceType);
      const retrievalMode = retrievalModeForSource(source, input.searchResult);
      const bucketAssessment = assessSourceBucket({
        source: {
          title: normalized.title,
          abstract: normalized.abstract,
          keywords: normalized.keywords,
          venue: normalized.venue,
          url: normalized.url,
          queryUsed: normalized.queryUsed,
          sourceType: source.sourceType,
        },
        topicEntityMap,
        provider,
        sourceType,
        doi: normalized.doi,
        url: normalized.url,
        venue: normalized.venue,
        isPeerReviewed: normalized.isPeerReviewed ?? null,
        sourceQualityScore,
        relevanceScore,
      });
      const effectiveRelevanceScore =
        bucketAssessment.decision === "rejected"
          ? Math.min(relevanceScore, 0.12)
          : Math.max(
              relevanceScore,
              bucketAssessment.bucketScore >= 0.5 ? bucketAssessment.bucketScore : relevanceScore,
            );
      const finalScore = Number((
        computeFinalScore(
          {
            ...normalized,
            relevanceScore: effectiveRelevanceScore * 100,
            sourceQualityScore: sourceQualityScore * 100,
          },
          scoringPlan,
        ) / 100
      ).toFixed(3));
      const confidenceTier: SourceCandidate["confidenceTier"] =
        reviewStatusFromSignals({
          score: Math.max(finalScore, relevanceScore),
          hasCoreConceptMatch:
            relevanceAnalysis.hasCoreConceptMatch ||
            intentAssessment.matchedMustIncludeTerms.length > 0,
          hasTitleCoreConceptMatch: relevanceAnalysis.hasTitleCoreConceptMatch,
        }) === "rejected"
          ? "rejected"
          : relevanceAnalysis.confidenceTier;
      const canonicalRejected =
        source.reviewState === "rejected" ||
        source.classification === "off_topic" ||
        source.classification === "trusted_but_off_topic" ||
        source.relevanceLevel === "off_topic" ||
        source.relevanceLevel === "low";
      const relaxedAcademicRetryReview =
        (input.retryRound ?? 0) >= 2 &&
        canonicalRejected &&
        (provider === "openalex" ||
          provider === "crossref" ||
          provider === "semanticScholar" ||
          provider === "core") &&
        (Boolean(normalized.doi) || Boolean(normalized.venue) || sourceType === "paper" || sourceType === "review") &&
        rawRelevanceScore >= 0.12 &&
        (relevanceAnalysis.hasCoreConceptMatch ||
          relevanceAnalysis.hasTitleCoreConceptMatch ||
          intentAssessment.matchedMustIncludeTerms.length > 0);
      const reviewStatus: SourceCandidate["reviewStatus"] =
        source.lowConfidence || source.needsReview
          ? "review"
          : canonicalRejected && !relaxedAcademicRetryReview
            ? "rejected"
        : !passesRequiredTopicEvidence
          ? "rejected"
          : relevanceAnalysis.confidenceTier === "high" &&
              relevanceAnalysis.matchedConcepts.length >= 2 &&
              relevanceScore >= 0.28
            ? "accepted"
          : (requiresPaleontologyAlgaeEvidence ||
                requiresAstronomyScienceEducationEvidence ||
                requiresAgriculturalWastePollutionEvidence ||
                requiresAiWorkImpactEvidence ||
                requiresColaHealthEvidence) &&
              relevanceScore >= 0.22
            ? "review"
          : intentAssessment.decision === "reject" &&
              !relevanceAnalysis.hasCoreConceptMatch &&
              !relevanceAnalysis.hasTitleCoreConceptMatch &&
              relevanceScore < 0.25
            ? "rejected"
            : intentAssessment.decision === "accept" &&
                intentAssessment.matchedMustIncludeTerms.length >= 2 &&
                relevanceScore >= 0.6 &&
                relevanceAnalysis.hasCoreConceptMatch
              ? "accepted"
              : intentAssessment.decision === "accept" ||
                  intentAssessment.decision === "supplementary" ||
                  relevanceAnalysis.hasTitleCoreConceptMatch
                ? "review"
                : reviewStatusFromSignals({
                    score: relevanceScore,
                    hasCoreConceptMatch: relevanceAnalysis.hasCoreConceptMatch,
                    hasTitleCoreConceptMatch: relevanceAnalysis.hasTitleCoreConceptMatch,
                  });
      const rawProviderPayload = {
        provider: source.provider ?? source.sourceType,
        publisher: source.publisher,
        containerTitle: source.containerTitle,
        sourceType: source.sourceType,
        queryUsed: source.queryUsed,
        sourceKind: source.sourceKind,
        citationCount: source.citationCount,
        isOpenAccess: source.isOpenAccess,
      };
      const initialCandidateForClassification: SourceClassificationInput = {
        sourceId: normalized.id,
        provider,
        retrievalMode,
        title: normalized.title,
        ...(normalized.venue ? { venue: normalized.venue } : {}),
        ...(normalized.doi ? { doi: normalized.doi } : {}),
        ...(normalized.url ? { url: normalized.url } : {}),
        ...(normalized.abstract ? { abstractOriginal: normalized.abstract } : {}),
        sourceType,
        ...(typeof normalized.isPeerReviewed === "boolean"
          ? { isPeerReviewed: normalized.isPeerReviewed }
          : {}),
        relevanceScore,
        sourceQualityScore,
        reviewStatus,
        rawProviderPayload,
      };
      let sourceClassification = classifySourceCandidate(
        initialCandidateForClassification,
        input.searchResult.topic || input.parsedInput.canonicalTopic,
        {
          negativeKeywords: input.queryPlan.excludedDriftTerms,
          excludedDriftTerms: input.queryPlan.excludedDriftTerms,
        },
      );
      if (bucketAssessment.decision === "rejected") {
        sourceClassification = {
          recommendationBucket: "rejected",
          sourceRole: "rejected",
          institutionType: sourceClassification.institutionType,
        };
      } else if (bucketAssessment.decision === "accepted") {
        sourceClassification = {
          recommendationBucket: "scholarly_recommended",
          sourceRole: "core_scholarly_evidence",
          institutionType: sourceClassification.institutionType,
        };
      } else if (bucketAssessment.decision === "fallback_review") {
        sourceClassification = {
          recommendationBucket: "official_background",
          sourceRole:
            bucketAssessment.sourceUseCase === "background_context"
              ? "definition_or_concept"
              : "weak_or_uncertain",
          institutionType: sourceClassification.institutionType,
        };
      } else if (
        bucketAssessment.highConfidenceManual &&
        passesRequiredTopicEvidence &&
        sourceClassification.recommendationBucket === "rejected"
      ) {
        sourceClassification = {
          recommendationBucket: "manual_review",
          sourceRole: "weak_or_uncertain",
          institutionType: sourceClassification.institutionType,
        };
      }
      if (
        !relevanceAnalysis.hasCoreConceptMatch &&
        bucketAssessment.matchedEntities.length === 0 &&
        sourceClassification.recommendationBucket === "scholarly_recommended"
      ) {
        sourceClassification = {
          recommendationBucket: "manual_review",
          sourceRole: "weak_or_uncertain",
          institutionType: sourceClassification.institutionType,
        };
      }
      const finalReviewStatus: SourceCandidate["reviewStatus"] =
        sourceClassification.recommendationBucket === "rejected"
          ? "rejected"
          : sourceClassification.recommendationBucket === "scholarly_recommended"
            ? "accepted"
            : "review";
      const hasDoi =
        Boolean(normalized.doi?.trim()) || /(?:doi\.org\/|^10\.\d{4,9}\/)/i.test(normalized.url ?? "");
      const isOfficialBackground =
        sourceClassification.recommendationBucket === "official_background";
      const hasAcademicTrace =
        sourceClassification.recommendationBucket === "scholarly_recommended" ||
        sourceClassification.sourceRole === "core_scholarly_evidence" ||
        sourceType === "paper" ||
        sourceType === "review" ||
        (isScholarlyProvider(provider) &&
          (hasDoi || normalized.isPeerReviewed === true || Boolean(normalized.venue)));
      const isAcademic =
        finalReviewStatus !== "rejected" && !isOfficialBackground && hasAcademicTrace;
      const usableAsEvidence = finalReviewStatus !== "rejected" && isAcademic;
      const usableAsBackground =
        finalReviewStatus !== "rejected" &&
        (isOfficialBackground ||
          isAcademic ||
          sourceClassification.recommendationBucket === "manual_review");
      const governanceReason =
        finalReviewStatus === "rejected"
          ? "rejected_by_relevance_or_governance"
          : isAcademic
            ? hasDoi
              ? "academic_traceable_doi_or_scholarly_provider"
              : "academic_provider_or_scholarly_metadata"
            : isOfficialBackground
              ? "official_background_not_counted_as_academic"
              : "manual_review_required_before_evidence_use";
      const abstractZh = sourceCandidateZhSummary({
        topic: input.searchResult.topic || input.parsedInput.canonicalTopic,
        normalized,
        sourceType,
        provider,
        reviewStatus: finalReviewStatus,
      });
      const rejectionReason =
        source.rejectionReason ??
        source.rejectReason ??
        (!passesPaleontologyAlgaeEvidence
          ? "missing_core_concept"
          : !passesAstronomyScienceEducationEvidence
            ? "missing_core_concept"
          : !passesAgriculturalWastePollutionEvidence
            ? "missing_core_concept"
          : !passesAiWorkImpactEvidence
            ? "missing_core_concept"
          : intentAssessment.excludeHits.length > 0
          ? "excluded_drift_term_match"
          : intentAssessment.decision === "reject"
            ? "low_topic_relevance"
            : relevanceAnalysis.hasCoreConceptMatch
              ? "low_topic_relevance"
              : bucketAssessment.decision === "rejected"
                ? bucketAssessment.decisionReasons[0] ?? "missing_core_concept"
                : relevanceAnalysis.rejectionReason ?? "missing_core_concept");
      const acceptReason =
        (bucketAssessment.decision === "accepted"
          ? bucketAssessment.decisionReasons[0]
          : undefined) ??
        relevanceAnalysis.acceptReason ??
        (intentAssessment.decision === "accept"
          ? "direct_topic_match"
          : source.sourceType === "Official Source" || source.sourceType === "Institutional Source"
            ? "official_source_match"
            : undefined);

      const evidencePoints = sourceEvidencePoints({
        source: initialCandidateForClassification,
        topic: input.searchResult.topic || input.parsedInput.canonicalTopic,
        role: sourceClassification.sourceRole,
      });
      const limitations = sourceLimitations({
        bucket: sourceClassification.recommendationBucket,
        role: sourceClassification.sourceRole,
        hasAbstract: Boolean(normalized.abstract),
        isPeerReviewed: normalized.isPeerReviewed ?? undefined,
        sourceQualityScore,
      });
      const usableSections = usableSectionsForRole(sourceClassification.sourceRole);
      const providerHealthSnapshot = providerHealthForCandidate(provider, input.searchResult);

      return {
        sourceId: normalized.id,
        workflowId: input.workflowId,
        topicHash: input.topicHash,
        queryUsed: normalized.queryUsed,
        queryIntent: queryIntentForQuery(normalized.queryUsed, input.queryPlan),
        provider,
        title: normalized.title,
        ...(normalized.authors.length ? { authors: normalized.authors } : {}),
        ...(normalized.year != null ? { year: normalized.year } : {}),
        ...(normalized.venue ? { venue: normalized.venue } : {}),
        ...(normalized.doi ? { doi: normalized.doi } : {}),
        ...(normalized.url ? { url: normalized.url } : {}),
        ...(normalized.abstract ? { abstract: normalized.abstract } : {}),
        ...(normalized.abstract ? { abstractOriginal: normalized.abstract } : {}),
        ...(source.abstractZhTw || abstractZh ? { abstractZh: source.abstractZhTw ?? abstractZh ?? undefined } : {}),
        ...(normalized.language ? { language: normalized.language } : {}),
        ...(normalized.keywords ? { keywords: normalized.keywords } : {}),
        sourceType,
        ...(source.sourceKind ? { sourceKind: source.sourceKind } : {}),
        institutionType: sourceClassification.institutionType,
        ...(typeof normalized.isPeerReviewed === "boolean"
          ? { isPeerReviewed: normalized.isPeerReviewed }
          : {}),
        hasDoi,
        isAcademic,
        isOfficialBackground,
        usableAsEvidence,
        usableAsBackground,
        governanceReason,
        retryRound: input.retryRound ?? 0,
        ...(typeof normalized.isOpenAccess === "boolean"
          ? { isOpenAccess: normalized.isOpenAccess }
          : {}),
        ...(normalized.fullTextUrl ? { fullTextUrl: normalized.fullTextUrl } : {}),
        ...(typeof normalized.citationCount === "number"
          ? { citationCount: normalized.citationCount }
          : {}),
        relevanceScore,
        sourceQualityScore,
        finalScore,
        retrievalMode,
        recommendationBucket: sourceClassification.recommendationBucket,
        sourceRole: sourceClassification.sourceRole,
        sourceBucket: bucketAssessment.bucket,
        bucketScore: bucketAssessment.bucketScore,
        bucketScores: bucketAssessment.bucketScores,
        decisionReasons: bucketAssessment.decisionReasons,
        matchedEntities: bucketAssessment.matchedEntities,
        missingRequiredSignals: bucketAssessment.missingRequiredSignals,
        sourceUseCase: bucketAssessment.sourceUseCase,
        ...(bucketAssessment.highConfidenceManual ? { highConfidenceManual: true } : {}),
        confidenceTier:
          finalReviewStatus === "rejected"
            ? "rejected"
            : sourceClassification.recommendationBucket !== "scholarly_recommended" ||
                source.lowConfidence ||
                source.needsReview
              ? "fallback"
              : confidenceTier === "rejected"
                ? "fallback"
                : confidenceTier,
        ...(relevanceAnalysis.matchedConcepts.length || bucketAssessment.matchedEntities.length
          ? {
              matchedConcepts: uniqueStrings([
                ...bucketAssessment.matchedEntities,
                ...relevanceAnalysis.matchedConcepts,
              ]),
            }
          : {}),
        ...(relevanceAnalysis.matchedFields.length
          ? { matchedFields: relevanceAnalysis.matchedFields }
          : {}),
        ...(finalReviewStatus !== "rejected" && acceptReason ? { acceptReason } : {}),
        reviewStatus: finalReviewStatus,
        ...(finalReviewStatus === "rejected" || source.lowConfidence || source.needsReview
          ? {
              rejectionReason,
            }
          : {}),
        ...(source.lowConfidence ? { lowConfidence: true } : {}),
        ...(source.needsReview ? { needsReview: true } : {}),
        evidencePoints,
        limitations,
        usableSections,
        citationMarker: `［S${index + 1}］`,
        ...(providerHealthSnapshot ? { providerHealthSnapshot } : {}),
        dedupeKey: normalized.dedupeKey,
        createdAt,
        retrievedAt: normalized.retrievedAt,
        rawProviderPayload,
        _signals: {
          finalScore,
          hasCoreConceptMatch:
            (sourceClassification.recommendationBucket === "scholarly_recommended" &&
              passesRequiredTopicEvidence &&
              (relevanceAnalysis.hasCoreConceptMatch ||
                intentAssessment.matchedMustIncludeTerms.length > 0)) ||
            (bucketAssessment.decision === "accepted" && bucketAssessment.bucketScore >= 0.5),
          hasTitleCoreConceptMatch:
            (sourceClassification.recommendationBucket === "scholarly_recommended" &&
              passesRequiredTopicEvidence && relevanceAnalysis.hasTitleCoreConceptMatch) ||
            (bucketAssessment.decision === "accepted" && bucketAssessment.bucketScore >= 0.5),
        },
      } satisfies SourceCandidateWithSignals;
    });

  const deduped = dedupeSourceCandidates(candidates);
  const reviewFallback = applyReviewFallback(deduped);
  const rejectedByIntentCount = deduped.filter(
    (candidate) => candidate.rejectionReason === "intent_mismatch",
  ).length;
  return {
    sourceCandidates: reviewFallback.candidates.map((candidateWithSignals) => {
      const aligned = alignCandidateSummaryWithReviewStatus(candidateWithSignals);
      const { _signals: _unused, ...candidate } = aligned;
      return candidate;
    }),
    warnings: uniqueStrings([
      ...reviewFallback.warnings,
      rejectedByIntentCount > 0
        ? `已依研究意圖排除 ${rejectedByIntentCount} 筆偏題來源。`
        : "",
    ]),
  };
}

function searchResultRawCount(searchResult: SearchIntentSourceSearchResult): number {
  return (
    searchResult.diagnostics?.raw_provider_count ??
    searchResult.diagnostics?.provider_search_results_count ??
    searchResult.provider_status.reduce(
      (sum, group) => sum + (group.raw_count ?? group.results.length),
      0,
    )
  );
}

function searchResultNormalizedValidCount(searchResult: SearchIntentSourceSearchResult): number {
  return (
    searchResult.diagnostics?.normalized_valid_count ??
    searchResult.provider_status.reduce(
      (sum, group) => sum + (group.normalized_valid_count ?? group.results.length),
      0,
    )
  );
}

function reviewableSourceCandidateCount(sourceCandidates: SourceCandidate[]): number {
  return sourceCandidates.filter((candidate) => candidate.reviewStatus !== "rejected").length;
}

function fallbackTriggerReason(input: {
  searchResult: SearchIntentSourceSearchResult;
  sourceCandidates: SourceCandidate[];
  academicSources: SourceCandidate[];
  fallbackReviewSources: SourceCandidate[];
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan: GroundingQueryPlan;
}): string | null {
  const rawCount = searchResultRawCount(input.searchResult);
  const canonicalCandidateCount =
    (input.searchResult.candidateSources?.length ?? 0) +
    (input.searchResult.fallbackReviewSources?.length ?? 0);
  const rejectedCount = input.sourceCandidates.filter(
    (candidate) => candidate.reviewStatus === "rejected",
  ).length;
  const reviewableCount = reviewableSourceCandidateCount(input.sourceCandidates);
  const hasEnglishQuery =
    input.normalizedSearchTopic.enAcademicQuery.length > 0 ||
    (input.queryPlan.enAcademicQueries?.length ?? 0) > 0 ||
    input.queryPlan.bilingualQueries.en.length > 0;

  if (rawCount > 0 && canonicalCandidateCount === 0) return "raw_results_filtered_to_zero";
  if (input.sourceCandidates.length === 0) return "candidate_sources_empty";
  if (reviewableCount === 0) return "reviewable_sources_empty";
  if (input.academicSources.length === 0 && input.fallbackReviewSources.length === 0) {
    return "academic_and_fallback_review_empty";
  }
  if (input.sourceCandidates.length > 0 && rejectedCount === input.sourceCandidates.length) {
    return "relevance_scoring_all_rejected";
  }
  if (hasEnglishQuery && reviewableCount < MIN_REVIEWABLE_SOURCE_COUNT) {
    return "below_minimum_reviewable_threshold";
  }
  return null;
}

function domainSpecificFallbackQueries(queryPlan: GroundingQueryPlan): string[] {
  const domain = compactWhitespace(queryPlan.domain ?? "").toLowerCase();
  const leadTerms = uniqueStrings(
    (queryPlan.conceptGroups ?? []).flatMap((group) => group.enTerms).filter(containsLatin),
  ).slice(0, 5);
  const lead = leadTerms.slice(0, 4).join(" ");
  const generic = uniqueStrings([
    lead,
    lead ? `${lead} review` : "",
    lead ? `${lead} educational explanation` : "",
  ]);
  if (/physics|optics/.test(domain)) {
    return uniqueStrings([
      lead,
      "thin film interference optics diffraction",
      "optical interference diffraction wavelength",
      "physics education optics interference diffraction",
      ...generic,
    ]);
  }
  if (/chemistry/.test(domain)) {
    return uniqueStrings([
      lead,
      "chemistry experiment analysis peer reviewed",
      "chemical education laboratory experiment spectroscopy extraction",
      ...generic,
    ]);
  }
  if (/biology|environmental|marine/.test(domain)) {
    return uniqueStrings([
      lead,
      "biology ecology mechanism review",
      "environmental science biodiversity mechanism review",
      "plant physiology photosynthesis light response",
      ...generic,
    ]);
  }
  return generic;
}

function fallbackSearchInput(input: {
  base: ResearchGroundingJobCreateRequest;
  topicAnalysis: TopicAnalysis;
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan: GroundingQueryPlan;
  round: number;
}): { reason: string; searchInput: SearchIntentPlannerInput } {
  const originalQuery = compactWhitespace(input.base.originalTopic ?? input.base.topic);
  const normalizedChineseQueries = uniqueStrings([
    input.topicAnalysis.normalizedTopic,
    ...input.normalizedSearchTopic.zhAcademicQuery,
    ...input.queryPlan.bilingualQueries.zh,
    ...(input.queryPlan.zhCoreQueries ?? []),
  ]);
  const academicEnglishQueries = uniqueStrings([
    ...input.normalizedSearchTopic.enAcademicQuery,
    ...(input.queryPlan.enAcademicQueries ?? []),
    ...(input.queryPlan.enCoreQueries ?? []),
  ]);
  const bilingualExpandedQueries = uniqueStrings([
    ...input.queryPlan.bilingualQueries.en,
    ...input.queryPlan.bilingualQueries.zh,
  ]);
  const recommendedQueries = uniqueStrings([
    ...input.queryPlan.primaryQueries,
    ...input.queryPlan.secondaryQueries,
  ]);
  const domainQueries = domainSpecificFallbackQueries(input.queryPlan);
  const relaxedQueries = uniqueStrings([
    ...input.normalizedSearchTopic.broaderAcademicQueries,
    ...(input.queryPlan.broadFallbackQueries ?? []),
    ...domainQueries,
    ...(input.queryPlan.conceptGroups ?? []).flatMap((group) => [
      group.enTerms.slice(0, 3).join(" "),
      group.zhTerms.slice(0, 3).join(" "),
    ]),
  ]);
  const roundOneEn = uniqueStrings([
    ...academicEnglishQueries,
    ...bilingualExpandedQueries.filter(containsLatin),
    ...recommendedQueries.filter(containsLatin),
    ...domainQueries.filter(containsLatin),
  ]);
  const roundTwoEn = uniqueStrings([
    ...relaxedQueries.filter(containsLatin),
    ...domainQueries.filter(containsLatin),
    ...academicEnglishQueries,
  ]);
  const allowChineseFallbackQueries =
    input.topicAnalysis.detectedLanguage !== "en" || containsZh(originalQuery);
  const roundOneZh = allowChineseFallbackQueries
    ? uniqueStrings([
        ...(containsZh(originalQuery) ? [originalQuery] : []),
        ...normalizedChineseQueries.filter(containsZh),
        ...bilingualExpandedQueries.filter(containsZh),
        ...recommendedQueries.filter(containsZh),
      ])
    : [];
  const roundTwoZh = allowChineseFallbackQueries
    ? uniqueStrings([
        ...normalizedChineseQueries.filter(containsZh),
        ...relaxedQueries.filter(containsZh),
        ...recommendedQueries.filter(containsZh),
      ])
    : [];
  const routingText = compactWhitespace([
    input.topicAnalysis.normalizedTopic,
    input.normalizedSearchTopic.displayTitle,
    input.queryPlan.domain,
    input.queryPlan.intent,
    ...(input.queryPlan.conceptGroups ?? []).flatMap((group) => [group.name, ...group.zhTerms, ...group.enTerms]),
  ].join(" "));
  const querySeedEn = providerSafeQueries(input.round === 1 ? roundOneEn : roundTwoEn, routingText);
  const querySeedZh = providerSafeQueries(input.round === 1 ? roundOneZh : roundTwoZh, routingText);
  const fallbackTopic =
    querySeedEn[0] ??
    querySeedZh[0] ??
    input.topicAnalysis.normalizedTopic;
  const reason =
    input.round === 1
      ? "automatic_academic_query_expansion"
      : "automatic_relaxed_relevance_query";

  return {
    reason,
    searchInput: {
      topic: fallbackTopic,
      originalTopic: input.base.originalTopic ?? input.base.topic,
      refinedTopic: input.topicAnalysis.normalizedTopic,
      canonicalTopicZh: input.topicAnalysis.normalizedTopic,
      canonicalTopicEn: querySeedEn[0] ?? input.normalizedSearchTopic.enAcademicQuery[0],
      displayTitle: input.normalizedSearchTopic.displayTitle,
      querySeedZh,
      querySeedEn,
      mustIncludeTerms: uniqueStrings([
        ...input.normalizedSearchTopic.keywordSet,
        ...(input.queryPlan.conceptGroups ?? []).flatMap((group) => [
          group.name,
          ...group.zhTerms,
          ...group.enTerms,
        ]),
      ]),
      excludeTerms: input.normalizedSearchTopic.negativeKeywords,
      workflowId: input.base.workflowId,
      reportType: input.base.reportType,
      audience: input.base.audience,
      language: input.topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW",
      sourceMode: "academic",
      searchProfile: input.base.searchProfile === "quick" ? "standard" : input.base.searchProfile,
    },
  };
}

export function academicRetryQueryExpansion(input: {
  base: ResearchGroundingJobCreateRequest;
  topicAnalysis: TopicAnalysis;
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan: GroundingQueryPlan;
}): { querySeedEn: string[]; querySeedZh: string[]; excludeTerms: string[]; retryQueries: string[] } {
  const text = normalizedLowerText([
    input.base.topic,
    input.topicAnalysis.normalizedTopic,
    input.normalizedSearchTopic.displayTitle,
    ...(input.normalizedSearchTopic.enAcademicQuery ?? []),
    ...(input.normalizedSearchTopic.zhAcademicQuery ?? []),
    ...(input.queryPlan.primaryQueries ?? []),
    ...(input.queryPlan.secondaryQueries ?? []),
    ...(input.queryPlan.conceptGroups ?? []).flatMap((group) => [
      group.name,
      ...group.enTerms,
      ...group.zhTerms,
    ]),
  ]);
  const enSpecific: string[] = [];
  const zhSpecific: string[] = [];

  if (/夕陽|餘暉|日落|sunset|twilight|rayleigh|wavelength|波長|大氣散射/.test(text)) {
    enSpecific.push(
      "sunset color wavelength Rayleigh scattering atmospheric optics",
      "spectral irradiance sunset wavelength atmospheric scattering",
      "solar radiation scattering wavelength sunset sky color",
      "Mie scattering aerosols sunset color wavelength",
      "atmospheric optics sunset spectrum wavelength peer reviewed",
      "Rayleigh scattering sky color wavelength education research paper",
      "sunset twilight spectral distribution atmosphere aerosol optical depth",
    );
    zhSpecific.push(
      "夕陽 顏色 波長 瑞利散射 大氣光學",
      "太陽餘暉 光波 波長 大氣散射",
      "日落 光譜 波長 氣膠 米氏散射",
      "天空顏色 波長 瑞利散射 文獻",
      "夕陽餘暉 光譜分布 大氣光學 論文",
    );
  }
  if (/校園噪音|高中生專注|noise exposure|school noise|attention|cognitive performance/.test(text)) {
    enSpecific.push(
      "noise exposure attention adolescents school environment cognitive performance",
      "classroom noise high school students attention academic achievement",
      "environmental noise cognitive performance adolescents peer reviewed",
      "school noise learning attention systematic review",
    );
    zhSpecific.push(
      "校園噪音 高中生 專注力 學習表現 論文",
      "教室噪音 青少年 注意力 認知表現 文獻",
    );
  }
  if (/咖啡因|青少年睡眠|caffeine|sleep quality|circadian/.test(text)) {
    enSpecific.push(
      "caffeine intake adolescents sleep quality circadian rhythm systematic review",
      "caffeine consumption sleep adolescents PubMed",
      "caffeine use teenagers sleep duration peer reviewed",
      "adolescent caffeine intake sleep quality journal article",
    );
    zhSpecific.push(
      "咖啡因 攝取 青少年 睡眠品質 系統性回顧",
      "青少年 咖啡因 睡眠 時間 文獻",
    );
  }
  if (/太陽帆|solar sail|solar sailing|radiation pressure|spacecraft propulsion|深空探測/.test(text)) {
    enSpecific.push(
      "solar sail propulsion radiation pressure",
      "solar sail spacecraft mission applications",
      "solar sailing deep space exploration limitations",
      "IKAROS LightSail NEA Scout solar sail",
      "solar radiation pressure spacecraft propulsion peer reviewed",
    );
    zhSpecific.push(
      "太陽帆 輻射壓 推進 原理",
      "太陽帆 航天任務 應用 價值",
      "太陽帆 深空探測 優勢 限制",
    );
  }
  if (/漢代|玉佩|jade pendant|han dynasty|ritual culture|archaeology/.test(text)) {
    enSpecific.push(
      "Han dynasty jade pendant ritual culture archaeology material culture",
      "Han dynasty jade ornament burial ritual archaeology journal",
      "Chinese jade pendant ritual function Han dynasty scholarly article",
      "Han jade material culture ritual practice academic book chapter",
    );
    zhSpecific.push(
      "漢代 玉佩 禮制 文化功能 考古 文獻",
      "漢代 玉器 佩飾 禮儀 制度 論文",
    );
  }
  if (/月兔|jade rabbit|moon rabbit|east asia|folklore|神話|民俗/.test(text)) {
    enSpecific.push(
      "moon rabbit myth East Asia folklore transmission comparative mythology",
      "jade rabbit lunar myth East Asian cultural transmission scholarly article",
      "moon rabbit folklore China Japan Korea comparative mythology",
      "East Asian lunar rabbit myth transformation folklore studies",
    );
    zhSpecific.push(
      "月兔 神話 東亞 文化傳播 比較神話 文獻",
      "玉兔 月亮神話 中日韓 民俗 傳播 論文",
    );
  }

  const leadEnTerms = uniqueStrings(
    (input.queryPlan.conceptGroups ?? []).flatMap((group) => group.enTerms).filter(containsLatin),
  ).slice(0, 6);
  const leadZhTerms = uniqueStrings(
    (input.queryPlan.conceptGroups ?? []).flatMap((group) => group.zhTerms).filter(containsZh),
  ).slice(0, 6);
  const leadEn = leadEnTerms.slice(0, 5).join(" ");
  const leadZh = leadZhTerms.slice(0, 5).join(" ");
  const genericEn = uniqueStrings([
    ...(input.normalizedSearchTopic.enAcademicQuery ?? []),
    ...(input.queryPlan.enAcademicQueries ?? []),
    ...(input.queryPlan.enCoreQueries ?? []),
    ...(input.queryPlan.bilingualQueries.en ?? []),
    leadEn ? `${leadEn} peer reviewed journal article` : "",
    leadEn ? `${leadEn} systematic review` : "",
    leadEn ? `${leadEn} academic research DOI` : "",
  ]);
  const genericZh = uniqueStrings([
    ...(input.normalizedSearchTopic.zhAcademicQuery ?? []),
    ...(input.queryPlan.zhCoreQueries ?? []),
    ...(input.queryPlan.bilingualQueries.zh ?? []),
    leadZh ? `${leadZh} 論文 文獻` : "",
    leadZh ? `${leadZh} 期刊 研究` : "",
  ]);
  const topicIsMythResearch = /月兔|jade rabbit|moon rabbit|神話|folklore|myth/.test(text);
  const excludeTerms = uniqueStrings([
    ...input.normalizedSearchTopic.negativeKeywords,
    ...input.queryPlan.excludedDriftTerms,
    ...ACADEMIC_RETRY_NEGATIVE_KEYWORDS.filter(
      (term) => !(topicIsMythResearch && term.toLowerCase() === "myth"),
    ),
  ]);
  const querySeedEn = uniqueStrings([...enSpecific, ...genericEn]).slice(0, 10);
  const querySeedZh = uniqueStrings([...zhSpecific, ...genericZh]).slice(0, 8);
  const retryQueries = uniqueStrings([...querySeedEn, ...querySeedZh]);
  return { querySeedEn, querySeedZh, excludeTerms, retryQueries };
}

function academicRetrySearchInput(input: {
  base: ResearchGroundingJobCreateRequest;
  topicAnalysis: TopicAnalysis;
  normalizedSearchTopic: ReturnType<typeof normalizeResearchTopic>;
  queryPlan: GroundingQueryPlan;
  round: number;
  reason: string;
}): { reason: string; retryQueries: string[]; searchInput: SearchIntentPlannerInput } {
  const expansion = academicRetryQueryExpansion(input);
  const relaxedRoundQueries = uniqueStrings([
    ...expansion.querySeedEn,
    ...domainSpecificFallbackQueries(input.queryPlan).filter(containsLatin),
    ...(input.normalizedSearchTopic.broaderAcademicQueries ?? []),
    ...(input.queryPlan.broadFallbackQueries ?? []).filter(containsLatin),
  ]);
  const querySeedEn =
    input.round >= 2
      ? relaxedRoundQueries
      : expansion.querySeedEn;
  const querySeedZh =
    input.round >= 2
      ? uniqueStrings([
          ...expansion.querySeedZh,
          ...(input.normalizedSearchTopic.broaderAcademicQueries ?? []).filter(containsZh),
          ...(input.queryPlan.broadFallbackQueries ?? []).filter(containsZh),
        ])
      : expansion.querySeedZh;
  const routingText = compactWhitespace([
    input.topicAnalysis.normalizedTopic,
    input.normalizedSearchTopic.displayTitle,
    input.queryPlan.domain,
    input.queryPlan.intent,
    ...(input.queryPlan.conceptGroups ?? []).flatMap((group) => [group.name, ...group.zhTerms, ...group.enTerms]),
  ].join(" "));
  const routedQuerySeedEn = providerSafeQueries(querySeedEn, routingText);
  const routedQuerySeedZh = providerSafeQueries(querySeedZh, routingText);
  const fallbackTopic =
    routedQuerySeedEn[0] ??
    routedQuerySeedZh[0] ??
    input.normalizedSearchTopic.enAcademicQuery[0] ??
    input.topicAnalysis.normalizedTopic;
  return {
    reason: `academic_retry_${input.reason}`,
    retryQueries: uniqueStrings([...routedQuerySeedEn, ...routedQuerySeedZh]),
    searchInput: {
      topic: fallbackTopic,
      originalTopic: input.base.originalTopic ?? input.base.topic,
      refinedTopic: input.topicAnalysis.normalizedTopic,
      canonicalTopicZh: input.topicAnalysis.normalizedTopic,
      canonicalTopicEn: routedQuerySeedEn[0] ?? input.normalizedSearchTopic.enAcademicQuery[0],
      displayTitle: input.normalizedSearchTopic.displayTitle,
      querySeedZh: routedQuerySeedZh,
      querySeedEn: routedQuerySeedEn,
      mustIncludeTerms: uniqueStrings([
        ...input.normalizedSearchTopic.keywordSet,
        ...routedQuerySeedEn.flatMap((query) => query.split(/\s+/u).slice(0, 6)),
        ...(input.queryPlan.conceptGroups ?? []).flatMap((group) => [
          group.name,
          ...group.zhTerms,
          ...group.enTerms,
        ]),
      ]),
      excludeTerms: expansion.excludeTerms,
      workflowId: input.base.workflowId,
      reportType: input.base.reportType,
      audience: input.base.audience,
      language: input.topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW",
      sourceMode: "academic",
      searchProfile: input.base.searchProfile === "quick" ? "standard" : "deep",
    },
  };
}

function fallbackAttemptsFromSearchRun(input: {
  round: number;
  fallbackReason: string;
  queryUsed: string;
  searchResult: SearchIntentSourceSearchResult;
  sourceCandidateResult: SourceCandidateBuildResult;
}): GroundingFallbackAttempt[] {
  const candidateCount = reviewableSourceCandidateCount(input.sourceCandidateResult.sourceCandidates);
  const rejectedCount = input.sourceCandidateResult.sourceCandidates.filter(
    (candidate) => candidate.reviewStatus === "rejected",
  ).length;
  if (input.searchResult.provider_status.length === 0) {
    const rawCount = searchResultRawCount(input.searchResult);
    return [
      {
        round: input.round,
        fallbackReason: input.fallbackReason,
        queryUsed: input.queryUsed,
        provider: "pipeline",
        rawCount,
        candidateCount,
        rejectedCount,
        status: rawCount > 0 ? "completed" : "failed",
      },
    ];
  }
  return input.searchResult.provider_status.map((group) => ({
    round: input.round,
    fallbackReason: input.fallbackReason,
    queryUsed: group.query || input.queryUsed,
    provider: group.provider,
    rawCount: group.raw_count ?? group.results.length,
    candidateCount,
    rejectedCount,
    status: group.ok ? "completed" : "failed",
  }));
}

function sourceCandidateMergeRank(candidate: SourceCandidate): number {
  const statusRank =
    candidate.reviewStatus === "accepted" ? 3000 : candidate.reviewStatus === "review" ? 2000 : 1000;
  const academicRank =
    sourceCandidateIsAcademic(candidate)
      ? 500
      : sourceCandidateIsOfficialBackground(candidate)
        ? 60
        : 0;
  const bucketRank =
    candidate.recommendationBucket === "scholarly_recommended"
      ? 300
      : candidate.recommendationBucket === "official_background"
        ? 220
        : candidate.recommendationBucket === "manual_review"
          ? 180
          : 0;
  return statusRank + academicRank + bucketRank + Math.round((candidate.finalScore ?? candidate.relevanceScore) * 100);
}

function mergeSourceCandidates(results: SourceCandidateBuildResult[]): SourceCandidate[] {
  const byKey = new Map<string, SourceCandidate>();
  for (const result of results) {
    for (const candidate of result.sourceCandidates) {
      const key = (candidate.dedupeKey || candidate.sourceId).toLowerCase();
      const existing = byKey.get(key);
      if (!existing || sourceCandidateMergeRank(candidate) > sourceCandidateMergeRank(existing)) {
        byKey.set(key, candidate);
      }
    }
  }
  return Array.from(byKey.values()).sort(
    (left, right) => sourceCandidateMergeRank(right) - sourceCandidateMergeRank(left),
  );
}

function mergeSearchResults(results: SearchIntentSourceSearchResult[]): SearchIntentSourceSearchResult {
  const [first, ...rest] = results;
  if (!first) {
    throw new Error("cannot merge empty search result list");
  }
  const last = rest[rest.length - 1] ?? first;
  const providerStatus = results.flatMap((result) => result.provider_status);
  const diagnosticsProviderStatus = results.flatMap(
    (result) => result.diagnostics?.provider_status ?? [],
  );
  const scoredSources = uniqueSourceRecords(results.flatMap((result) => result.scoredSources ?? []));
  const candidateSources = uniqueSourceRecords(results.flatMap((result) => result.candidateSources ?? []));
  const fallbackReviewSources = uniqueSourceRecords(results.flatMap((result) => result.fallbackReviewSources ?? []));
  const rejectedSources = uniqueSourceRecords(results.flatMap((result) => result.rejectedSources ?? []));
  const sources = uniqueSourceRecords(results.flatMap((result) => result.sources ?? result.results ?? []));
  const rawProviderCount = results.reduce((sum, result) => sum + searchResultRawCount(result), 0);
  const normalizedValidCount = results.reduce(
    (sum, result) => sum + searchResultNormalizedValidCount(result),
    0,
  );
  const normalizeAttemptCount = results.reduce(
    (sum, result) =>
      sum +
      (result.diagnostics?.normalize_attempt_count ??
        searchResultRawCount(result)),
    0,
  );
  const normalizedInvalidCount = results.reduce(
    (sum, result) => sum + (result.diagnostics?.normalized_invalid_count ?? 0),
    0,
  );

  return {
    ...last,
    provider_status: providerStatus,
    groups: providerStatus,
    scoredSources,
    candidateSources,
    fallbackReviewSources,
    rejectedSources,
    results: sources,
    sources,
    warnings: uniqueStrings(results.flatMap((result) => result.warnings ?? [])),
    queries: {
      ...last.queries,
      coreConcepts: uniqueStrings(results.flatMap((result) => result.queries.coreConcepts ?? [])),
      chinese: uniqueStrings(results.flatMap((result) => result.queries.chinese ?? [])),
      english: uniqueStrings(results.flatMap((result) => result.queries.english ?? [])),
      highPrecision: uniqueStrings(results.flatMap((result) => result.queries.highPrecision ?? [])),
      broad: uniqueStrings(results.flatMap((result) => result.queries.broad ?? [])),
      coreEnglishAcademic: uniqueStrings(results.flatMap((result) => result.queries.coreEnglishAcademic ?? [])),
      academicSynonyms: uniqueStrings(results.flatMap((result) => result.queries.academicSynonyms ?? [])),
      education: uniqueStrings(results.flatMap((result) => result.queries.education ?? [])),
      chineseSupplemental: uniqueStrings(results.flatMap((result) => result.queries.chineseSupplemental ?? [])),
      fallbackRelaxed: uniqueStrings(results.flatMap((result) => result.queries.fallbackRelaxed ?? [])),
      phases: results.flatMap((result) => result.queries.phases ?? []),
    },
    searchTrace: {
      ...last.searchTrace,
      providerQueries: uniqueStrings(results.flatMap((result) => result.searchTrace?.providerQueries ?? [])),
      candidateCount:
        results.reduce((sum, result) => sum + (result.searchTrace?.candidateCount ?? 0), 0),
      dedupedCount: Math.max(...results.map((result) => result.searchTrace?.dedupedCount ?? 0), 0),
      acceptedCount:
        results.reduce((sum, result) => sum + (result.searchTrace?.acceptedCount ?? 0), 0),
      rejectedCount:
        results.reduce((sum, result) => sum + (result.searchTrace?.rejectedCount ?? 0), 0),
      sourceDecisions: results.flatMap((result) => result.searchTrace?.sourceDecisions ?? []),
    },
    diagnostics: {
      ...last.diagnostics,
      raw_provider_count: rawProviderCount,
      normalize_attempt_count: normalizeAttemptCount,
      normalized_valid_count: normalizedValidCount,
      normalized_invalid_count: normalizedInvalidCount,
      provider_search_results_count: rawProviderCount,
      retrieved_count: results.reduce(
        (sum, result) => sum + (result.diagnostics?.retrieved_count ?? 0),
        0,
      ),
      deduped_count: uniqueSourceRecords(
        results.flatMap((result) => result.scoredSources ?? result.sources ?? []),
      ).length,
      scored_count: scoredSources.length,
      rejected_count: rejectedSources.length,
      candidate_count: candidateSources.length,
      fallback_review_count: fallbackReviewSources.length,
      displayed_count: sources.length,
      provider_status: diagnosticsProviderStatus.length > 0
        ? diagnosticsProviderStatus
        : providerStatus.map((group) => ({
            provider: group.provider,
            query: group.query,
            ok: group.ok,
            result_count: group.results.length,
            raw_count: group.raw_count ?? group.results.length,
            normalize_attempt_count: group.normalize_attempt_count ?? group.raw_count ?? group.results.length,
            normalized_valid_count: group.normalized_valid_count ?? group.results.length,
            normalized_invalid_count: group.normalized_invalid_count ?? 0,
            error_type: group.error_type,
            error_message: group.error_message,
            latency_ms: group.latency_ms,
          })),
      warnings: uniqueStrings(results.flatMap((result) => result.diagnostics?.warnings ?? result.warnings ?? [])),
      tried_queries: uniqueStrings(results.flatMap((result) => result.diagnostics?.tried_queries ?? [])),
    },
  };
}

type EvidenceSafety = NonNullable<GroundingEvidenceCard["safety"]>;

function safeEvidenceText(
  text: string,
  safetyReview: AcademicSafetyReview,
): { text: string; safety: EvidenceSafety } {
  const normalized = compactWhitespace(text);
  const actionable = actionableIntent(normalized) && safetyReview.topicRiskLevel !== "low";
  if (!actionable) {
    return {
      text: normalized,
      safety: {
        containsActionableHarm: false,
        redactionApplied: false,
        safeSummaryMode: "none",
        safetyNotes: [],
      },
    };
  }

  return {
    text: "此來源涉及高風險操作內容，系統僅保留其風險、影響與防治層級的非操作性摘要。",
    safety: {
      containsActionableHarm: true,
      redactionApplied: true,
      safeSummaryMode:
        safetyReview.allowedUse === "redirect_to_prevention_or_policy"
          ? "policy_or_health_focused"
          : "high_level_summary",
      safetyNotes: ["actionable details redacted before evidence-card generation"],
    },
  };
}

type GroundingEvidenceType = NonNullable<GroundingEvidenceCard["evidence_type"]>;

function accessLevelForSource(source: SourceCandidate): ContentAccessLevel {
  if (source.accessLevel) return source.accessLevel;
  if (source.abstractOriginal || source.abstractZh || source.abstract) return "abstract_only";
  return "metadata_only";
}

function citationMarkerForSource(index: number): string {
  return `[S${index + 1}]`;
}

function firstSentence(value: string, limit = 260): string {
  const text = compactWhitespace(value);
  const sentence = text.split(/(?<=[。！？.!?])\s+/u)[0]?.trim() ?? text;
  return sentence.length > limit ? `${sentence.slice(0, limit - 1)}…` : sentence;
}

function proseJoin(items: string[]): string {
  const fragments = items.map((item) => compactWhitespace(item).replace(/[。！？.!?；，、\s]+$/u, "")).filter(Boolean);
  if (fragments.length === 0) return "目前可驗證資料";
  if (fragments.length === 1) return fragments[0]!;
  if (fragments.length === 2) return `${fragments[0]}與${fragments[1]}`;
  return `${fragments.slice(0, -1).join("、")}，以及${fragments[fragments.length - 1]}`;
}

function evidenceTypeForChunk(chunk: Pick<ExtractedChunk, "text" | "section_heading">, index: number): GroundingEvidenceType {
  const text = `${chunk.section_heading ?? ""} ${chunk.text}`.toLowerCase();
  if (/limit|limitation|uncertain|uncertainty|bias|不足|限制|侷限|爭議|counter/i.test(text)) return "limitation";
  if (/method|materials|experiment|survey|analysis|方法|實驗|問卷|資料來源/i.test(text)) return "method";
  if (/define|definition|concept|means|定義|概念|意指/i.test(text)) return "definition";
  if (/theor|model|framework|mechanism|機制|理論|模型/i.test(text)) return "theory";
  if (/%|\b\d+(?:\.\d+)?\b|statistic|rate|ratio|統計|比例|數據/i.test(text)) return "statistic";
  if (/result|finding|show|found|indicat|發現|顯示|指出|結果/i.test(text)) return "finding";
  return index < 2 ? "background" : "finding";
}

function usableForEvidenceType(
  source: SourceCandidate,
  evidenceType: GroundingEvidenceType,
  safetyReview: AcademicSafetyReview,
): string[] {
  if (source.recommendationBucket === "official_background") {
    return uniqueStrings([
      "introduction",
      "background",
      "concept_explanation",
      evidenceType === "limitation" ? "limitations" : "",
    ]);
  }
  if (safetyReview.allowedUse !== "normal_research") return ["literature_review", "discussion", "policy"];
  if (evidenceType === "definition" || evidenceType === "background" || evidenceType === "theory") {
    return uniqueStrings(["introduction", "background", "literature_review", "discussion"]);
  }
  if (evidenceType === "method") return ["methods_context", "literature_review"];
  if (evidenceType === "limitation" || evidenceType === "counterpoint") {
    return ["literature_review", "discussion", "limitations"];
  }
  return uniqueStrings(["literature_review", "analysis", "discussion", ...usableSectionsForRole(source.sourceRole)]);
}

function sourceAccessLimitations(source: SourceCandidate, accessLevel: ContentAccessLevel): string[] {
  return uniqueStrings([
    ...(source.limitations ?? []),
    source.recommendationBucket === "manual_review" ? "manual review source accepted by user" : "",
    source.isPeerReviewed === false ? "非同行評審論文；不可支撐學術因果或實驗結論" : "",
    source.sourceQualityScore < 0.55 ? "source quality is limited" : "",
    accessLevel === "abstract_only" ? "僅摘要可用；正文不得宣稱已讀全文。" : "",
    accessLevel === "metadata_only" ? "metadata_only；只能作為搜尋脈絡或人工審查，不能支撐學術主張。" : "",
    accessLevel === "blocked_or_paywalled" ? "來源可能需要登入或付費；未抓取全文。" : "",
    accessLevel === "failed_extraction" ? "全文抽取失敗；需人工審查後才能使用為強主張。" : "",
    ...(source.extractionWarnings ?? []),
  ]);
}

function makeGroundingEvidenceCard(input: {
  source: SourceCandidate;
  sourceIndex: number;
  cardIndex: number;
  workflowId: string;
  topicHash: string;
  evidenceType: GroundingEvidenceType;
  quotedText: string;
  sourceLocation: string;
  sectionHeading?: string;
  chunkId?: string;
  page?: number;
  accessLevel: ContentAccessLevel;
  confidence: number;
  safetyReview: AcademicSafetyReview;
}): GroundingEvidenceCard {
  const claimTextOriginal = firstSentence(input.quotedText);
  const safe = safeEvidenceText(claimTextOriginal, input.safetyReview);
  const citationMarker = citationMarkerForSource(input.sourceIndex);
  const evidenceId = `evidence-${input.source.sourceId}-${input.cardIndex + 1}`;
  const usableFor = usableForEvidenceType(input.source, input.evidenceType, input.safetyReview);
  const contentHash =
    input.source.contentHash ??
    stableQueryHash([input.source.sourceId, input.chunkId ?? "", input.quotedText].join("|"));
  return {
    evidenceId,
    evidence_id: evidenceId,
    workflowId: input.workflowId,
    topicHash: input.topicHash,
    sourceId: input.source.sourceId,
    source_id: input.source.sourceId,
    ...(input.chunkId ? { chunkId: input.chunkId } : {}),
    claimTextOriginal,
    claim_text: claimTextOriginal,
    claimTextZh: safe.text,
    paraphrase_zh: safe.text,
    supportedByText: input.quotedText,
    quoted_text: input.quotedText,
    original_language: input.source.language ?? "unknown",
    source_location: input.sourceLocation,
    ...(input.sectionHeading ? { section_heading: input.sectionHeading } : {}),
    ...(typeof input.page === "number" ? { page: input.page } : {}),
    sourceUri: input.source.url ?? input.source.fullTextUrl ?? input.source.doi ?? input.source.sourceId,
    sourceTitle: input.source.title,
    ...(input.source.url ? { sourceUrl: input.source.url } : {}),
    ...(input.source.doi ? { sourceDoi: input.source.doi } : {}),
    sourceProvider: input.source.provider,
    sourceType: input.source.sourceType ?? "unknown",
    recommendationBucket: input.source.recommendationBucket,
    sourceRole: input.source.sourceRole,
    retrievalMode: input.source.retrievalMode,
    ...(input.source.providerHealthSnapshot
      ? { providerHealthSnapshot: input.source.providerHealthSnapshot }
      : {}),
    ...(typeof input.source.isPeerReviewed === "boolean"
      ? { isPeerReviewed: input.source.isPeerReviewed }
      : {}),
    ...(input.source.venue ? { venue: input.source.venue } : {}),
    ...(typeof input.source.acceptedByUser === "boolean"
      ? { acceptedByUser: input.source.acceptedByUser }
      : {}),
    ...(input.source.userDecision ? { userDecision: input.source.userDecision } : {}),
    ...(input.source.acceptedAs ? { acceptedAs: input.source.acceptedAs } : {}),
    quoteOrSpan: input.quotedText,
    sourceQualityScore: input.source.sourceQualityScore,
    relevanceScore: input.source.relevanceScore,
    citationMarker,
    citation_marker: citationMarker,
    usableFor,
    supports_sections: usableFor,
    evidence_type: input.evidenceType,
    confidence: Math.max(0.05, Math.min(1, input.confidence)),
    limitations: sourceAccessLimitations(input.source, input.accessLevel),
    source_access_level: input.accessLevel,
    trace: {
      provider: input.source.provider,
      query_used: input.source.queryUsed,
      ...(input.source.url ? { url: input.source.url } : {}),
      ...(input.source.doi ? { doi: input.source.doi } : {}),
      ...(input.source.extractionMethod ? { extraction_method: input.source.extractionMethod } : {}),
      content_hash: contentHash,
    },
    extractedBy: "rule",
    safety: safe.safety,
    contentHash,
    createdAt: nowIso(),
  };
}

function evidenceTypeForClaimType(type: ClaimCandidate["claimType"]): GroundingEvidenceType {
  switch (type) {
    case "definition":
      return "definition";
    case "mechanism":
      return "theory";
    case "method":
      return "method";
    case "statistic":
      return "statistic";
    case "limitation":
      return "limitation";
    case "comparison":
      return "finding";
    case "finding":
      return "finding";
    case "background":
    default:
      return "background";
  }
}

function usableForClaim(claim: ClaimCandidate, source: SourceCandidate): string[] {
  const mapped = claim.usableSections.flatMap((section) => {
    switch (section) {
      case "background":
        return ["introduction", "background"];
      case "literature_review":
        return ["literature_review"];
      case "method":
        return ["methods_context", "literature_review"];
      case "analysis":
        return ["analysis", "literature_review"];
      case "discussion":
        return ["discussion"];
      case "limitation":
        return ["limitations", "discussion", "literature_review"];
      default:
        return [];
    }
  });
  if (source.recommendationBucket === "official_background") {
    return uniqueStrings(["introduction", "background", "concept_explanation", ...mapped]);
  }
  return uniqueStrings(mapped.length ? mapped : ["literature_review", "discussion"]);
}

function governanceFlagsForClaim(
  claim: ClaimCandidate,
  source: SourceCandidate,
  accessLevel: ContentAccessLevel,
): string[] {
  return uniqueStrings([
    claim.extractionMode === "rule_fallback" ? "claim_extraction_rule_fallback" : "",
    claim.extractionMode === "metadata_only" ? "claim_extraction_metadata_only" : "",
    accessLevel === "abstract_only" ? "abstract_only_support" : "",
    accessLevel === "blocked_or_paywalled" ? "blocked_or_paywalled_source" : "",
    accessLevel === "failed_extraction" ? "failed_extraction_source" : "",
    source.recommendationBucket === "manual_review" ? "manual_review_source" : "",
    source.recommendationBucket === "official_background" ? "official_background_source" : "",
    claim.confidence < 0.65 ? "low_or_moderate_claim_confidence" : "",
  ]);
}

function makeGroundingEvidenceCardFromClaim(input: {
  claim: ClaimCandidate;
  source: SourceCandidate;
  sourceIndex: number;
  cardIndex: number;
  workflowId: string;
  topicHash: string;
  safetyReview: AcademicSafetyReview;
}): GroundingEvidenceCard | null {
  const supportSpan = compactWhitespace(input.claim.supportSpanText ?? "");
  if (!supportSpan) return null;
  if (input.claim.status !== "accepted") return null;
  const accessLevel = accessLevelForSource(input.source);
  if (accessLevel === "metadata_only" || accessLevel === "failed_extraction") return null;
  if (input.source.extractionStatus === "extraction_unavailable_no_parser") return null;

  const evidenceType = evidenceTypeForClaimType(input.claim.claimType);
  const safe = safeEvidenceText(input.claim.claimTextZhTw, input.safetyReview);
  const evidenceSafe = safeEvidenceText(supportSpan, input.safetyReview);
  const citationMarker = input.claim.citationMarker || citationMarkerForSource(input.sourceIndex);
  const evidenceId = `evidence-${input.claim.claimId}`;
  const usableFor = usableForClaim(input.claim, input.source);
  const contentHash =
    input.source.contentHash ??
    stableQueryHash([input.claim.claimId, supportSpan, input.source.sourceId].join("|"));
  const governanceFlags = governanceFlagsForClaim(input.claim, input.source, accessLevel);
  const needsManualReview =
    governanceFlags.length > 0 ||
    input.claim.confidence < 0.65 ||
    input.source.recommendationBucket === "manual_review";

  return {
    evidenceId,
    evidence_id: evidenceId,
    evidenceCardId: evidenceId,
    workflowId: input.workflowId,
    topicHash: input.topicHash,
    sourceId: input.source.sourceId,
    source_id: input.source.sourceId,
    chunkId: input.claim.chunkId,
    claimIds: [input.claim.claimId],
    claimTextOriginal: input.claim.claimTextOriginal,
    claim_text: input.claim.claimTextOriginal,
    claimTextZh: safe.text,
    mainClaimZhTw: safe.text,
    paraphrase_zh: safe.text,
    supportingClaims: [input.claim],
    supportedByText: evidenceSafe.text,
    quoted_text: evidenceSafe.text,
    supportSpans: [
      {
        claimId: input.claim.claimId,
        text: supportSpan,
        ...(typeof input.claim.supportSpanStartOffset === "number"
          ? { startOffset: input.claim.supportSpanStartOffset }
          : {}),
        ...(typeof input.claim.supportSpanEndOffset === "number"
          ? { endOffset: input.claim.supportSpanEndOffset }
          : {}),
        ...(typeof input.claim.pageStart === "number" ? { pageStart: input.claim.pageStart } : {}),
        ...(typeof input.claim.pageEnd === "number" ? { pageEnd: input.claim.pageEnd } : {}),
        ...(input.claim.sectionHeading ? { sectionHeading: input.claim.sectionHeading } : {}),
      },
    ],
    original_language: input.source.language ?? "unknown",
    source_location: input.claim.sectionHeading ?? "chunk",
    ...(input.claim.sectionHeading ? { section_heading: input.claim.sectionHeading } : {}),
    ...(typeof input.claim.pageStart === "number" ? { page: input.claim.pageStart } : {}),
    sourceUri: input.source.url ?? input.source.fullTextUrl ?? input.source.doi ?? input.source.sourceId,
    sourceTitle: input.source.title,
    ...(input.source.url ? { sourceUrl: input.source.url } : {}),
    ...(input.source.doi ? { sourceDoi: input.source.doi } : {}),
    sourceProvider: input.source.provider,
    sourceType: input.source.sourceType ?? "unknown",
    sourceMetadata: {
      title: input.source.title,
      authors: input.source.authors ?? [],
      year: input.source.year,
      venue: input.source.venue,
      doi: input.source.doi,
      provider: input.source.provider,
      extractionStatus: input.source.extractionStatus,
      extractionMode: input.source.extractionMode,
    },
    recommendationBucket: input.source.recommendationBucket,
    sourceRole: input.source.sourceRole,
    retrievalMode: input.source.retrievalMode,
    ...(input.source.providerHealthSnapshot
      ? { providerHealthSnapshot: input.source.providerHealthSnapshot }
      : {}),
    ...(typeof input.source.isPeerReviewed === "boolean"
      ? { isPeerReviewed: input.source.isPeerReviewed }
      : {}),
    ...(input.source.venue ? { venue: input.source.venue } : {}),
    ...(typeof input.source.acceptedByUser === "boolean"
      ? { acceptedByUser: input.source.acceptedByUser }
      : {}),
    ...(input.source.userDecision ? { userDecision: input.source.userDecision } : {}),
    ...(input.source.acceptedAs ? { acceptedAs: input.source.acceptedAs } : {}),
    quoteOrSpan: evidenceSafe.text,
    sourceQualityScore: input.source.sourceQualityScore,
    relevanceScore: input.claim.relevanceToTopic,
    citationMarker,
    citation_marker: citationMarker,
    usableFor,
    supports_sections: usableFor,
    evidence_type: evidenceType,
    confidence: Math.max(0.05, Math.min(1, input.claim.confidence)),
    limitations: uniqueStrings([
      ...input.claim.limitations,
      ...sourceAccessLimitations(input.source, accessLevel),
    ]),
    extractionStatus: input.source.extractionStatus,
    source_access_level: accessLevel,
    needsManualReview,
    governanceFlags,
    trace: {
      provider: input.source.provider,
      query_used: input.source.queryUsed,
      ...(input.source.url ? { url: input.source.url } : {}),
      ...(input.source.doi ? { doi: input.source.doi } : {}),
      ...(input.source.extractionMethod ? { extraction_method: input.source.extractionMethod } : {}),
      content_hash: contentHash,
    },
    extractedBy:
      input.claim.extractionMode === "llm"
        ? "llm"
        : input.claim.extractionMode === "metadata_only"
          ? "metadata_only"
          : "rule_fallback",
    safety: {
      containsActionableHarm:
        safe.safety.containsActionableHarm || evidenceSafe.safety.containsActionableHarm,
      redactionApplied: safe.safety.redactionApplied || evidenceSafe.safety.redactionApplied,
      safeSummaryMode:
        safe.safety.safeSummaryMode !== "none"
          ? safe.safety.safeSummaryMode
          : evidenceSafe.safety.safeSummaryMode,
      safetyNotes: uniqueStrings([
        ...safe.safety.safetyNotes,
        ...evidenceSafe.safety.safetyNotes,
      ]),
    },
    contentHash,
    createdAt: nowIso(),
  };
}

function evidenceCardsFromClaimCandidates(input: {
  workflowId: string;
  topicHash: string;
  acceptedSources: SourceCandidate[];
  claimCandidates: ClaimCandidate[];
  safetyReview: AcademicSafetyReview;
}): GroundingEvidenceCard[] {
  const sourceById = new Map(input.acceptedSources.map((source, index) => [
    source.sourceId,
    { source, sourceIndex: index },
  ]));
  const cards: GroundingEvidenceCard[] = [];
  for (const claim of acceptedClaimCandidates(input.claimCandidates).slice(0, 60)) {
    const sourceEntry = sourceById.get(claim.sourceId);
    if (!sourceEntry) continue;
    const card = makeGroundingEvidenceCardFromClaim({
      claim,
      source: sourceEntry.source,
      sourceIndex: sourceEntry.sourceIndex,
      cardIndex: cards.length,
      workflowId: input.workflowId,
      topicHash: input.topicHash,
      safetyReview: input.safetyReview,
    });
    if (card) cards.push(card);
  }
  return cards;
}

function selectedFullTextChunks(source: SourceCandidate): ExtractedChunk[] {
  const chunks = source.extractedChunks ?? [];
  const seenClaims = new Set<string>();
  const selected: ExtractedChunk[] = [];
  const byType = (type: GroundingEvidenceType, limit: number) => {
    for (const chunk of chunks) {
      if (selected.includes(chunk)) continue;
      if (evidenceTypeForChunk(chunk, selected.length) !== type) continue;
      const key = firstSentence(chunk.text, 120).toLowerCase();
      if (seenClaims.has(key)) continue;
      seenClaims.add(key);
      selected.push(chunk);
      if (selected.filter((item) => evidenceTypeForChunk(item, 0) === type).length >= limit) break;
    }
  };
  byType("definition", 2);
  byType("background", 3);
  byType("theory", 2);
  byType("method", 2);
  byType("finding", 3);
  byType("statistic", 2);
  byType("limitation", 2);
  for (const chunk of chunks) {
    if (selected.length >= 8) break;
    if (selected.includes(chunk)) continue;
    const key = firstSentence(chunk.text, 120).toLowerCase();
    if (seenClaims.has(key)) continue;
    seenClaims.add(key);
    selected.push(chunk);
  }
  return selected.slice(0, 8);
}

function abstractChunksForSource(source: SourceCandidate): ExtractedChunk[] {
  const abstract =
    compactWhitespace(source.extractedAbstract ?? "") ||
    compactWhitespace(source.abstractOriginal ?? "") ||
    compactWhitespace(source.abstractZh ?? "") ||
    compactWhitespace(source.abstract ?? "");
  if (!abstract) return [];
  const sentences = abstract
    .split(/(?<=[。！？.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40);
  const chunks = (sentences.length ? sentences : [abstract]).slice(0, 2);
  return chunks.map((text, index) => ({
    chunk_id: `${source.sourceId}:abstract:${index + 1}`,
    text,
    source_location: "abstract",
    section_heading: "Abstract",
    char_start: 0,
    char_end: text.length,
  }));
}

function evidenceCardsForExtractedSource(input: {
  source: SourceCandidate;
  sourceIndex: number;
  workflowId: string;
  topicHash: string;
  safetyReview: AcademicSafetyReview;
}): GroundingEvidenceCard[] {
  const accessLevel = accessLevelForSource(input.source);
  if (input.source.sourceUseLevel === "rejected" || input.source.recommendationBucket === "rejected") {
    return [];
  }

  if (accessLevel === "full_text" && (input.source.extractedChunks?.length ?? 0) > 0) {
    return selectedFullTextChunks(input.source).map((chunk, index) =>
      makeGroundingEvidenceCard({
        ...input,
        cardIndex: index,
        evidenceType: evidenceTypeForChunk(chunk, index),
        quotedText: compactWhitespace(chunk.text),
        sourceLocation: chunk.source_location,
        sectionHeading: chunk.section_heading,
        chunkId: chunk.chunk_id,
        page: chunk.page,
        accessLevel,
        confidence:
          input.source.extractionMethod === "grobid"
            ? 0.86
            : input.source.extractionStatus === "success"
              ? 0.78
              : 0.68,
      }),
    );
  }

  if (accessLevel === "abstract_only") {
    const chunks = abstractChunksForSource(input.source).slice(0, 2);
    return chunks.map((chunk, index) =>
      makeGroundingEvidenceCard({
        ...input,
        cardIndex: index,
        evidenceType: index === 0 ? "background" : evidenceTypeForChunk(chunk, index),
        quotedText: compactWhitespace(chunk.text),
        sourceLocation: "abstract",
        sectionHeading: "Abstract",
        chunkId: chunk.chunk_id,
        accessLevel,
        confidence: 0.55,
      }),
    );
  }

  const metadataText = compactWhitespace(input.source.title);
  if (!metadataText) return [];
  return [
    makeGroundingEvidenceCard({
      ...input,
      cardIndex: 0,
      evidenceType: "background",
      quotedText: metadataText,
      sourceLocation: "metadata",
      sectionHeading: "Metadata",
      chunkId: `${input.source.sourceId}:metadata:1`,
      accessLevel,
      confidence: 0.25,
    }),
  ];
}

export function buildGroundingEvidenceCards(input: {
  workflowId: string;
  topicHash: string;
  acceptedSources: SourceCandidate[];
  claimCandidates?: ClaimCandidate[];
  reviewSources?: SourceCandidate[];
  safetyReview: AcademicSafetyReview;
}): GroundingEvidenceCard[] {
  const userAccepted = (source: SourceCandidate) =>
    source.acceptedByUser === true ||
    source.userDecision === "accepted" ||
    source.userDecision === "accepted_as_background" ||
    source.userDecision === "accepted_as_scholarly_evidence" ||
    source.userDecision === "accepted_as_manual_review" ||
    Boolean(source.acceptedAs?.trim());
  const accepted = input.acceptedSources.filter((source) => {
    if (source.reviewStatus !== "accepted") return false;
    if (source.recommendationBucket === "rejected") return false;
    if (source.recommendationBucket === "manual_review") return userAccepted(source);
    return true;
  });
  const seenSources = new Set<string>();
  const evidenceSources = accepted.filter((source) => {
    const key = source.dedupeKey || source.sourceId;
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });
  if (input.claimCandidates && input.claimCandidates.length > 0) {
    return evidenceCardsFromClaimCandidates({
      workflowId: input.workflowId,
      topicHash: input.topicHash,
      acceptedSources: evidenceSources,
      claimCandidates: input.claimCandidates,
      safetyReview: input.safetyReview,
    });
  }
  const cards: GroundingEvidenceCard[] = [];
  evidenceSources.slice(0, 12).forEach((source, sourceIndex) => {
    const sourceCards = evidenceCardsForExtractedSource({
      source,
      sourceIndex,
      workflowId: input.workflowId,
      topicHash: input.topicHash,
      safetyReview: input.safetyReview,
    });
    cards.push(...sourceCards);
  });
  return cards;
}

export function findLegacyGenericTraces(input: {
  researchCandidates: string[];
  reportSections: GroundingReportSection[];
  reportDraft: string;
}): LegacyGenericTrace[] {
  const traces: LegacyGenericTrace[] = [];
  const maybeTrace = (path: string, value: string) => {
    const normalized = compactWhitespace(value);
    if (!normalized) return;
    for (const entry of LEGACY_GENERIC_OUTPUT_PATTERNS) {
      if (entry.pattern.test(normalized)) {
        traces.push({
          path,
          value: normalized,
          matchedPattern: entry.label,
        });
      }
    }
  };

  input.researchCandidates.forEach((candidate, index) => {
    maybeTrace(`researchCandidates[${index}]`, candidate);
  });
  input.reportSections.forEach((section, index) => {
    maybeTrace(`reportSections[${index}].title`, section.title);
    maybeTrace(`reportSections[${index}].synthesizedProse`, section.synthesizedProse);
  });
  maybeTrace("reportDraft", input.reportDraft);
  return traces;
}

export function suppressLegacyGenericOutput(input: {
  reportSections: GroundingReportSection[];
  reportDraft: string;
  researchCandidates: string[];
}): {
  reportSections: GroundingReportSection[];
  reportDraft: string;
  researchCandidates: string[];
  warnings: string[];
  traces: LegacyGenericTrace[];
} {
  const traces = findLegacyGenericTraces(input);
  if (traces.length === 0) {
    return {
      ...input,
      warnings: [],
      traces: [],
    };
  }

  const tracePaths = new Set(traces.map((trace) => trace.path));
  const reportSections = input.reportSections.map((section, index) => {
    if (
      tracePaths.has(`reportSections[${index}].title`) ||
      tracePaths.has(`reportSections[${index}].synthesizedProse`)
    ) {
      return {
        ...section,
        synthesizedProse: "目前資料不足，暫不輸出泛用模板敘述。",
        evidenceGaps: uniqueStrings([...section.evidenceGaps, "legacy_generic_output_suppressed"]),
      };
    }
    return section;
  });
  const researchCandidates = input.researchCandidates.filter(
    (_candidate, index) => !tracePaths.has(`researchCandidates[${index}]`),
  );
  return {
    reportSections,
    reportDraft: reportSections
      .map((section) => `${section.title}\n${section.synthesizedProse}`)
      .join("\n\n"),
    researchCandidates,
    warnings: uniqueStrings(
      traces.map(
        (trace) =>
          `已抑制 legacy generic pattern「${trace.matchedPattern}」於 ${trace.path}，改保留 source-grounded 或資料不足訊息。`,
      ),
    ),
    traces,
  };
}

export function buildReportArtifacts(input: {
  topic: string;
  workflowId: string;
  topicHash: string;
  titleState: TopicTitleState;
  titleParse: ResearchTitleSentenceParse;
  evidenceCards: GroundingEvidenceCard[];
  safetyReview: AcademicSafetyReview;
}): {
  reportPlan: ReportPlan;
  reportSections: GroundingReportSection[];
  reportSectionSufficiency: SectionSufficiencyGate[];
  reportDraft: string;
  researchCandidates: string[];
} {
  const title =
    input.titleState.acceptedDisplayTitle ??
    input.titleState.polishedTitle ??
    input.titleState.originalTopic;
  const sectionTypeForGroundingSection = (sectionId: string): EvidenceSectionType => {
    if (sectionId === "background") return "background";
    if (sectionId === "evidence") return "evidence_synthesis";
    if (sectionId === "discussion") return "discussion_claim";
    return "basic_context";
  };
  const guardedEvidenceCardIds = (sectionId: string, cards: GroundingEvidenceCard[]) =>
    cards
      .filter((card) =>
        canUseEvidenceCardForSection(card, sectionTypeForGroundingSection(sectionId)),
      )
      .map((card) => card.evidenceId);
  const sections = [
    {
      sectionId: "background",
      title: "研究背景",
      goal: "交代主題、核心變項與研究脈絡",
      requiredEvidenceTypes: ["background", "review"],
      evidenceCardIds: guardedEvidenceCardIds("background", input.evidenceCards.slice(0, 3)),
    },
    {
      sectionId: "evidence",
      title: "文獻證據",
      goal: "整理目前來源支持的具體發現與限制",
      requiredEvidenceTypes: ["data", "review", "policy"],
      evidenceCardIds: guardedEvidenceCardIds("evidence", input.evidenceCards),
    },
    {
      sectionId: "discussion",
      title: "討論",
      goal: "說明可支持的解讀與尚待補證的缺口",
      requiredEvidenceTypes: ["mechanism", "policy"],
      evidenceCardIds: guardedEvidenceCardIds("discussion", input.evidenceCards.slice(0, 4)),
    },
  ];
  const scholarlyEvidenceCount = input.evidenceCards.filter(
    (card) => card.recommendationBucket === "scholarly_recommended",
  ).length;
  const officialBackgroundCount = input.evidenceCards.filter(
    (card) => card.recommendationBucket === "official_background",
  ).length;
  const evidenceGaps = uniqueStrings([
    input.evidenceCards.length >= 3
      ? ""
      : "accepted evidence cards below recommended minimum for a full report",
    scholarlyEvidenceCount === 0 && officialBackgroundCount > 0
      ? "目前來源主要為官方背景或科普說明，缺少同行評審學術論文。"
      : "",
  ]);
  const reportPlan: ReportPlan = {
    workflowId: input.workflowId,
    topicHash: input.topicHash,
    title,
    researchQuestion:
      input.titleParse.sentenceType === "effect_of_x_on_y"
        ? `${input.titleParse.independentVariables.join("、")}如何影響${input.titleParse.dependentVariables.join("、")}？`
        : title,
    sections,
    evidenceGaps,
    academicSafetyReview: input.safetyReview,
  };

  const sectionEvidence = (sectionId: string) =>
    input.evidenceCards
      .filter((card) => {
        if (!canUseEvidenceCardForSection(card, sectionTypeForGroundingSection(sectionId))) {
          return false;
        }
        if (sectionId === "background") return card.usableFor.includes("introduction");
        if (sectionId === "evidence") {
          return (
            card.recommendationBucket === "scholarly_recommended" ||
            card.usableFor.includes("literature_review") ||
            card.usableFor.includes("analysis")
          );
        }
        if (sectionId === "discussion") return card.usableFor.includes("discussion");
        return true;
      })
      .slice(0, sectionId === "evidence" ? 8 : 4);

  const sufficiencyForSection = (
    sectionId: string,
    cards: GroundingEvidenceCard[],
  ): SectionSufficiencyGate => {
    const sourceCount = new Set(cards.map((card) => card.sourceId)).size;
    const fullTextEvidenceCount = cards.filter(
      (card) => card.source_access_level === "full_text",
    ).length;
    const abstractOnlyEvidenceCount = cards.filter(
      (card) => card.source_access_level === "abstract_only",
    ).length;
    const requiredEvidenceTypes: GroundingEvidenceType[] =
      sectionId === "background"
        ? ["background", "definition", "theory", "statistic"]
        : sectionId === "evidence"
          ? ["finding", "theory", "method", "limitation"]
          : ["finding", "limitation", "counterpoint", "theory"];
    const presentTypes = new Set<GroundingEvidenceType>(
      cards
        .map((card) => card.evidence_type)
        .filter((type): type is GroundingEvidenceType => Boolean(type)),
    );
    const missingEvidenceTypes = requiredEvidenceTypes.filter((type) => !presentTypes.has(type));
    const threshold =
      sectionId === "background" ? 2 : sectionId === "evidence" ? 4 : 3;
    const enoughSources = sectionId === "evidence" ? sourceCount >= 2 : sourceCount >= 1;
    const status: SectionSufficiencyGate["status"] =
      cards.length >= threshold && enoughSources
        ? "sufficient"
        : cards.length > 0
          ? "weak"
          : "insufficient";
    const userVisibleMessage =
      status === "sufficient"
        ? "本節已有足夠證據卡可形成受限但可引用的段落。"
        : status === "weak"
          ? "本節有部分證據，但來源數量或證據類型仍不足，段落需保守呈現。"
          : "目前來源不足以支撐完整段落，本節只能說明證據缺口。";
    return {
      sectionId,
      status,
      evidenceCount: cards.length,
      fullTextEvidenceCount,
      abstractOnlyEvidenceCount,
      citationCount: sourceCount,
      missingEvidenceTypes,
      userVisibleMessage,
    };
  };

  const proseForSection = (
    sectionId: string,
    cards: GroundingEvidenceCard[],
    sufficiency: SectionSufficiencyGate,
  ): string => {
    if (cards.length === 0) {
      return "目前來源不足以支撐完整段落。已接受來源尚未提供可驗證摘錄，因此本節僅能標示證據缺口，暫不提出具體結論。";
    }
    const markerText = (selected: GroundingEvidenceCard[]) =>
      uniqueStrings(selected.map((card) => card.citationMarker)).join("");
    const points = uniqueStrings(cards.map((card) => firstSentence(card.claimTextZh, 90))).slice(0, 4);
    if (sectionId === "evidence" && cards.length >= 2) {
      const firstGroup = cards.slice(0, 2);
      const secondGroup = cards.slice(2, 4);
      const limits = uniqueStrings(cards.flatMap((card) => card.limitations)).slice(0, 2);
      return [
        `現有文獻可先整合為幾個受限觀點：${proseJoin(points.slice(0, 2))}${markerText(firstGroup)}。`,
        secondGroup.length
          ? `不同來源的可用程度並不相同；部分證據來自全文片段，部分仍停留在摘要，因此只能比較${proseJoin(points.slice(2, 4))}${markerText(secondGroup)}。`
          : "目前可比較來源仍少，文獻探討只能維持初步整理。",
        limits.length
          ? `主要限制是${proseJoin(limits)}，因此本節不把初步整理擴大成完整學術共識。`
          : sufficiency.userVisibleMessage,
      ].join("");
    }
    return `${proseJoin(points)}${markerText(cards)}。${sufficiency.userVisibleMessage}`;
  };

  const reportSections: GroundingReportSection[] = sections.map((section) => {
    const cards = sectionEvidence(section.sectionId);
    const sufficiency = sufficiencyForSection(section.sectionId, cards);
    const synthesizedProse = proseForSection(section.sectionId, cards, sufficiency);
    return {
      sectionId: section.sectionId,
      title: section.title,
      synthesizedProse,
      citationMarkers: cards.map((card) => card.citationMarker),
      evidenceCardIds: cards.map((card) => card.evidenceId),
      evidenceGaps:
        cards.length > 0
          ? section.sectionId === "evidence" && scholarlyEvidenceCount === 0
            ? ["目前來源主要為官方背景或科普說明，缺少同行評審學術論文。"]
            : []
          : ["insufficient_evidence_cards"],
      sufficiency,
    };
  });
  const reportSectionSufficiency = reportSections.map((section) => section.sufficiency!);

  const reportDraft = reportSections.map((section) => `${section.title}\n${section.synthesizedProse}`).join("\n\n");
  const researchCandidates = uniqueStrings([
    input.titleParse.subject[0],
    input.titleParse.independentVariables.length && input.titleParse.dependentVariables.length
      ? `${input.titleParse.independentVariables.join("、")}與${input.titleParse.dependentVariables.join("、")}之間的研究證據`
      : "",
    input.safetyReview.allowedUse !== "normal_research"
      ? "以風險、防治、政策與公共衛生角度整理現有研究"
      : "",
  ]).filter(Boolean);

  return {
    reportPlan,
    reportSections,
    reportSectionSufficiency,
    reportDraft,
    researchCandidates,
  };
}

async function progress(
  dependencies: GroundingPipelineDependencies,
  update: GroundingPipelineProgress,
): Promise<void> {
  if (dependencies.onProgress) {
    await dependencies.onProgress(update);
  }
}

export async function runResearchGroundingPipeline(
  input: ResearchGroundingJobCreateRequest,
  dependencies: GroundingPipelineDependencies,
): Promise<GroundingJob> {
  const createdAt = nowIso();
  const pipelineStartedAt = Date.now();
  const originalTopic = compactWhitespace(input.rawUserTopic ?? input.originalTopic ?? input.topic);
  const effectiveTopic = originalTopic;
  const planningTopic = compactWhitespace(
    input.normalizedTopic ?? input.researchQuestion ?? input.topic,
  );
  const requestResearchQuestion = compactWhitespace(input.researchQuestion ?? "");
  const requestQuerySeedZh = uniqueStrings([
    ...(input.bilingualQueries?.zh ?? []),
    ...(input.querySeedZh ?? []),
  ]);
  const requestQuerySeedEn = uniqueStrings([
    ...(input.bilingualQueries?.en ?? []),
    ...(input.querySeedEn ?? []),
  ]);
  const requestExcludeTerms = uniqueStrings(input.excludeTerms ?? []);
  const parsedInput = parseResearchInput(effectiveTopic);
  const normalizedInputTopic = normalizeResearchTopic(planningTopic || effectiveTopic);
  const canSearchNormalizedTopic =
    normalizedInputTopic.keywordSet.length >= 4 &&
    (normalizedInputTopic.enAcademicQuery.length >= 2 ||
      normalizedInputTopic.zhAcademicQuery.length >= 2);
  const topicAnalysis = analyzeTopicInput({
    topic: effectiveTopic,
    workflowId: input.workflowId,
    parsedInput,
  });
  const titleParse = parseResearchTitleSentence(requestResearchQuestion || effectiveTopic);
  const topicTitleState = createTopicTitleState({
    originalTopic: effectiveTopic,
    titlePolishMode: "polish_only",
  });

  await progress(dependencies, {
    status: "rewriting_query",
    progress: 12,
    patch: { parsedInput, topicAnalysis, titleParse, topicTitleState },
  });

  if (parsedInput.nextAction === "block") {
    return {
      jobId: "pending-assignment",
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      originalTopic,
      normalizedTopic: topicAnalysis.normalizedTopic,
      status: "partial",
      progress: 18,
      parsedInput,
      topicAnalysis,
      titleParse,
      topicTitleState,
      researchCandidates: parsedInput.safeAlternatives,
      warnings: [parsedInput.safetyReason],
      createdAt,
      updatedAt: nowIso(),
    };
  }

  if (topicAnalysis.isNonsenseInput) {
    const reason = topicAnalysis.topicCompleteness?.reason ?? "";
    const message = /missing_research_subject/.test(reason)
      ? "請補充明確研究對象，例如人物、地點、現象、器物或科學概念。"
      : "查無可辨識研究主題，請改用具體且有語意的關鍵詞。";
    return {
      jobId: "pending-assignment",
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      originalTopic,
      normalizedTopic: topicAnalysis.normalizedTopic,
      status: "partial",
      progress: 20,
      parsedInput,
      topicAnalysis,
      titleParse,
      topicTitleState,
      researchCandidates: [],
      warnings: [message],
      groundingDiagnostics: buildGroundingDiagnostics({
        rawTopic: originalTopic,
        parsedInput,
        topicAnalysis,
        selectedDomain: input.selectedDomain,
        researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
      }),
      createdAt,
      updatedAt: nowIso(),
    };
  }

  if (
    !canSearchNormalizedTopic &&
    (parsedInput.nextAction === "ask_clarification" || parsedInput.nextAction === "show_topic_options")
  ) {
    const invalidInputMessage = "無法辨識有效研究主題，請輸入可研究的詞彙或句子。";
    const needsDirectionMessage = "主題仍偏短或多義，請先從建議研究方向中選一個再搜尋。";
    const needsMoreDetailMessage = "無法穩定判定研究意圖，請補充研究對象、變項、比較條件或範圍。";
    return {
      jobId: "pending-assignment",
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      originalTopic,
      normalizedTopic: topicAnalysis.normalizedTopic,
      status: "partial",
      progress: 20,
      parsedInput,
      topicAnalysis,
      titleParse,
      topicTitleState,
      researchCandidates: parsedInput.topicOptions.map(
        (option: ParsedResearchInput["topicOptions"][number]) => option.canonicalTopic,
      ),
      warnings: [
        parsedInput.inputType === "invalid"
          ? invalidInputMessage
          : parsedInput.nextAction === "show_topic_options"
            ? needsDirectionMessage
            : needsMoreDetailMessage,
      ],
      groundingDiagnostics: buildGroundingDiagnostics({
        rawTopic: originalTopic,
        parsedInput,
        topicAnalysis,
        selectedDomain: input.selectedDomain,
        researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
      }),
      createdAt,
      updatedAt: nowIso(),
    };
  }

  const seedQueryPlan = buildSeedQueryPlan({
    topicAnalysis,
    titleParse,
    parsedInput,
    querySeedZh: requestQuerySeedZh,
    querySeedEn: requestQuerySeedEn,
    excludeTerms: requestExcludeTerms,
  });
  await progress(dependencies, {
    status: "building_seed_queries",
    progress: 28,
    patch: { seedQueryPlan },
  });

  const lexicalSignals = await collectLexicalSignals({
    topicAnalysis,
    titleParse,
    adapters: dependencies.lexiconAdapters,
  });
  const queryPlan = buildGroundingQueryPlan({
    topicAnalysis,
    seedQueryPlan,
    lexicalSignals,
    titleParse,
  });
  await progress(dependencies, {
    status: "expanding_queries",
    progress: 42,
    patch: { lexicalSignals, queryPlan },
  });

  const academicSafetyReview = reviewAcademicSafety({
    topic: requestResearchQuestion || effectiveTopic,
    titleParse,
  });
  await progress(dependencies, {
    status: "safety_reviewing",
    progress: 52,
    patch: { academicSafetyReview },
  });

  if (academicSafetyReview.allowedUse === "block_actionable_output") {
    return {
      jobId: "pending-assignment",
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      originalTopic,
      normalizedTopic: topicAnalysis.normalizedTopic,
      status: "partial",
      progress: 56,
      parsedInput,
      topicAnalysis,
      titleParse,
      topicTitleState,
      seedQueryPlan,
      lexicalSignals,
      queryPlan,
      academicSafetyReview,
      warnings: [
        academicSafetyReview.userFacingNotice ??
          "此主題涉及高風險操作性要求，已停止產生可執行內容。",
      ],
      createdAt,
      updatedAt: nowIso(),
    };
  }

  const normalizedSearchTopic =
    seedQueryPlan.normalizedResearchTopic ??
    normalizeResearchTopic(planningTopic || effectiveTopic, topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW");
  const queryRoutingTopicText = compactWhitespace([
    topicAnalysis.normalizedTopic,
    normalizedSearchTopic.displayTitle,
    queryPlan.domain,
    queryPlan.intent,
    ...(queryPlan.conceptGroups ?? []).flatMap((group) => [group.name, ...group.zhTerms, ...group.enTerms]),
  ].join(" "));
  const providerQueryAnchorText = compactWhitespace([
    effectiveTopic,
    originalTopic,
    normalizedSearchTopic.displayTitle,
    ...normalizedSearchTopic.zhAcademicQuery,
    ...normalizedSearchTopic.enAcademicQuery,
    ...normalizedSearchTopic.keywordSet,
    ...normalizedSearchTopic.broaderAcademicQueries,
  ].join(" "));
  await progress(dependencies, {
    status: "searching_initial",
    progress: 68,
    patch: {
      groundingDiagnostics: buildGroundingDiagnostics({
        rawTopic: originalTopic,
        parsedInput,
        topicAnalysis,
        queryPlan,
        selectedDomain: input.selectedDomain,
        researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
        currentPhase: "searching_initial",
        fallbackAttempts: [],
        fallbackCompleted: false,
        maxFallbackRounds: MAX_FALLBACK_ROUNDS,
      }),
    },
  });
  const initialSearchInput: SearchIntentPlannerInput = {
    topic: topicAnalysis.normalizedTopic,
    originalTopic,
    refinedTopic: topicAnalysis.normalizedTopic,
    canonicalTopicZh: topicAnalysis.normalizedTopic,
    canonicalTopicEn:
      normalizedSearchTopic.enAcademicQuery[0] ?? queryPlan.bilingualQueries.en[0],
    displayTitle: normalizedSearchTopic.displayTitle,
    querySeedZh: providerSafeQueries([
      ...requestQuerySeedZh,
      ...normalizedSearchTopic.zhAcademicQuery,
      ...queryPlan.bilingualQueries.zh,
    ], queryRoutingTopicText),
    querySeedEn: providerSafeTopicAnchoredQueries([
      ...normalizedSearchTopic.enAcademicQuery,
      ...normalizedSearchTopic.broaderAcademicQueries,
      ...queryPlan.bilingualQueries.en,
      ...requestQuerySeedEn,
    ], queryRoutingTopicText, providerQueryAnchorText),
    mustIncludeTerms: normalizedSearchTopic.keywordSet,
    excludeTerms: uniqueStrings([...normalizedSearchTopic.negativeKeywords, ...requestExcludeTerms]),
    domainHints: uniqueStrings([input.selectedDomain ?? "", ...(input.bilingualQueries ? ["frontend_bilingual_queries"] : [])]),
    workflowId: input.workflowId,
    reportType: input.reportType,
    audience: input.audience,
    language: topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW",
    sourceMode: "academic",
    searchProfile: input.searchProfile,
  };
  const searchResults: SearchIntentSourceSearchResult[] = [
    await dependencies.searchHandler(initialSearchInput),
  ];
  const sourceCandidateResults: SourceCandidateBuildResult[] = [
    buildSourceCandidates({
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      queryPlan,
      searchResult: searchResults[0]!,
      parsedInput,
    }),
  ];
  let searchResult = mergeSearchResults(searchResults);
  let sourceCandidates = mergeSourceCandidates(sourceCandidateResults);
  let highConfidenceCandidateSources = highConfidenceSourceCandidates(sourceCandidates, queryPlan);
  let candidateSources = highConfidenceCandidateSources;
  let fallbackReviewSources = fallbackReviewSourceCandidates(sourceCandidates);
  let officialBackgroundSources = officialBackgroundSourceCandidates(sourceCandidates);
  let rejectedSources = sourceCandidates.filter((source) => source.reviewStatus === "rejected");
  let acceptedSources = sourceCandidates.filter((source) => source.reviewStatus === "accepted");
  const fallbackAttempts: GroundingFallbackAttempt[] = [];
  let sourceQualitySummary = buildSourceQualitySummary(sourceCandidates);
  let academicRetry: AcademicRetry = {
    count: 0,
    max: ACADEMIC_RETRY_POLICY.maxAutoAcademicRetries,
    active: false,
    exhausted: false,
    retryQueries: [],
  };
  let fallbackRoundsExecuted = 0;
  let fallbackReason = fallbackTriggerReason({
    searchResult,
    sourceCandidates,
    academicSources: candidateSources,
    fallbackReviewSources,
    normalizedSearchTopic,
    queryPlan,
  });

  for (let round = 1; round <= MAX_FALLBACK_ROUNDS && fallbackReason; round += 1) {
    const fallbackPlan = fallbackSearchInput({
      base: input,
      topicAnalysis,
      normalizedSearchTopic,
      queryPlan,
      round,
    });
    await progress(dependencies, {
      status: "searching_fallback",
      progress: Math.min(84, 70 + round * 6),
      patch: {
        sourceCandidates,
        highConfidenceCandidateSources,
        candidateSources,
        fallbackReviewSources,
        rejectedSources,
        acceptedSources,
        fallbackAttempts,
        groundingDiagnostics: buildGroundingDiagnostics({
          rawTopic: originalTopic,
          parsedInput,
          topicAnalysis,
          queryPlan,
          searchResult,
          sourceCandidates,
          selectedDomain: input.selectedDomain,
          researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
          currentPhase: "searching_fallback",
          fallbackAttempts,
          fallbackCompleted: false,
          maxFallbackRounds: MAX_FALLBACK_ROUNDS,
          academicRetry,
          sourceQualitySummary,
          foregroundLatencyMs:
            searchResult.diagnostics?.foreground_latency_ms ?? Date.now() - pipelineStartedAt,
        }),
      },
    });

    const nextSearchResult = await dependencies.searchHandler(fallbackPlan.searchInput);
    fallbackRoundsExecuted = round;
    const nextSourceCandidateResult = buildSourceCandidates({
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      queryPlan,
      searchResult: nextSearchResult,
      parsedInput,
    });
    searchResults.push(nextSearchResult);
    sourceCandidateResults.push(nextSourceCandidateResult);
    fallbackAttempts.push(
      ...fallbackAttemptsFromSearchRun({
        round,
        fallbackReason: `${fallbackReason}:${fallbackPlan.reason}`,
        queryUsed: fallbackPlan.searchInput.topic,
        searchResult: nextSearchResult,
        sourceCandidateResult: nextSourceCandidateResult,
      }),
    );

    searchResult = mergeSearchResults(searchResults);
    sourceCandidates = mergeSourceCandidates(sourceCandidateResults);
    highConfidenceCandidateSources = highConfidenceSourceCandidates(sourceCandidates, queryPlan);
    candidateSources = highConfidenceCandidateSources;
    fallbackReviewSources = fallbackReviewSourceCandidates(sourceCandidates);
    officialBackgroundSources = officialBackgroundSourceCandidates(sourceCandidates);
    rejectedSources = sourceCandidates.filter((source) => source.reviewStatus === "rejected");
    acceptedSources = sourceCandidates.filter((source) => source.reviewStatus === "accepted");
    sourceQualitySummary = buildSourceQualitySummary(sourceCandidates);
    fallbackReason = fallbackTriggerReason({
      searchResult,
      sourceCandidates,
      academicSources: candidateSources,
      fallbackReviewSources,
      normalizedSearchTopic,
      queryPlan,
    });
  }

  let academicRetryReason = academicRetryTriggerReason({
    sourceQualitySummary,
    parsedInput,
    normalizedSearchTopic,
    queryPlan,
  });
  for (
    let retryRound = 1;
    retryRound <= ACADEMIC_RETRY_POLICY.maxAutoAcademicRetries && academicRetryReason;
    retryRound += 1
  ) {
    const retryPlan = academicRetrySearchInput({
      base: input,
      topicAnalysis,
      normalizedSearchTopic,
      queryPlan,
      round: retryRound,
      reason: academicRetryReason,
    });
    const retryStartedAt = nowIso();
    academicRetry = {
      count: retryRound,
      max: ACADEMIC_RETRY_POLICY.maxAutoAcademicRetries,
      active: true,
      exhausted: false,
      reason: academicRetryReason,
      retryQueries: uniqueStrings([...(academicRetry.retryQueries ?? []), ...retryPlan.retryQueries]),
      lastStartedAt: retryStartedAt,
      ...(academicRetry.lastCompletedAt ? { lastCompletedAt: academicRetry.lastCompletedAt } : {}),
    };
    await progress(dependencies, {
      status: "academic_retrying",
      progress: Math.min(88, 78 + retryRound * 5),
      patch: {
        sourceCandidates,
        highConfidenceCandidateSources,
        candidateSources,
        fallbackReviewSources,
        rejectedSources,
        acceptedSources,
        fallbackAttempts,
        academicRetry,
        sourceQualitySummary,
        groundingDiagnostics: buildGroundingDiagnostics({
          rawTopic: originalTopic,
          parsedInput,
          topicAnalysis,
          queryPlan,
          searchResult,
          sourceCandidates,
          selectedDomain: input.selectedDomain,
          researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
          currentPhase: "academic_retrying",
          fallbackAttempts,
          fallbackCompleted: fallbackRoundsExecuted > 0,
          maxFallbackRounds: MAX_FALLBACK_ROUNDS,
          academicRetry,
          sourceQualitySummary,
          foregroundLatencyMs:
            searchResult.diagnostics?.foreground_latency_ms ?? Date.now() - pipelineStartedAt,
        }),
      },
    });

    const nextSearchResult = await dependencies.searchHandler(retryPlan.searchInput);
    const nextSourceCandidateResult = buildSourceCandidates({
      workflowId: input.workflowId,
      topicHash: topicAnalysis.topicHash,
      queryPlan,
      searchResult: nextSearchResult,
      parsedInput,
      retryRound,
    });
    searchResults.push(nextSearchResult);
    sourceCandidateResults.push(nextSourceCandidateResult);
    fallbackAttempts.push(
      ...fallbackAttemptsFromSearchRun({
        round: fallbackRoundsExecuted + retryRound,
        fallbackReason: retryPlan.reason,
        queryUsed: retryPlan.searchInput.topic,
        searchResult: nextSearchResult,
        sourceCandidateResult: nextSourceCandidateResult,
      }),
    );

    searchResult = mergeSearchResults(searchResults);
    sourceCandidates = mergeSourceCandidates(sourceCandidateResults);
    highConfidenceCandidateSources = highConfidenceSourceCandidates(sourceCandidates, queryPlan);
    candidateSources = highConfidenceCandidateSources;
    fallbackReviewSources = fallbackReviewSourceCandidates(sourceCandidates);
    officialBackgroundSources = officialBackgroundSourceCandidates(sourceCandidates);
    rejectedSources = sourceCandidates.filter((source) => source.reviewStatus === "rejected");
    acceptedSources = sourceCandidates.filter((source) => source.reviewStatus === "accepted");
    sourceQualitySummary = buildSourceQualitySummary(sourceCandidates);
    academicRetryReason = academicRetryTriggerReason({
      sourceQualitySummary,
      parsedInput,
      normalizedSearchTopic,
      queryPlan,
    });
    academicRetry = {
      count: retryRound,
      max: ACADEMIC_RETRY_POLICY.maxAutoAcademicRetries,
      active: false,
      exhausted:
        Boolean(academicRetryReason) &&
        retryRound >= ACADEMIC_RETRY_POLICY.maxAutoAcademicRetries,
      ...(academicRetryReason ? { reason: academicRetryReason } : {}),
      retryQueries: academicRetry.retryQueries,
      lastStartedAt: retryStartedAt,
      lastCompletedAt: nowIso(),
    };
  }

  const sourceCandidateResult: SourceCandidateBuildResult = {
    sourceCandidates,
    warnings: uniqueStrings(sourceCandidateResults.flatMap((result) => result.warnings)),
  };
  await progress(dependencies, {
    status: "scoring_sources",
    progress: 86,
    patch: {
      sourceCandidates,
      highConfidenceCandidateSources,
      candidateSources,
      fallbackReviewSources,
      rejectedSources,
      acceptedSources,
      fallbackAttempts,
      academicRetry,
      sourceQualitySummary,
      groundingDiagnostics: buildGroundingDiagnostics({
        rawTopic: originalTopic,
        parsedInput,
        topicAnalysis,
        queryPlan,
        searchResult,
        sourceCandidates,
        selectedDomain: input.selectedDomain,
        researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
        currentPhase: "scoring_sources",
        fallbackAttempts,
        fallbackCompleted: fallbackRoundsExecuted > 0 || academicRetry.count > 0,
        maxFallbackRounds: MAX_FALLBACK_ROUNDS,
        academicRetry,
        sourceQualitySummary,
        foregroundLatencyMs:
          searchResult.diagnostics?.foreground_latency_ms ?? Date.now() - pipelineStartedAt,
      }),
    },
  });

  sourceCandidateResult.sourceCandidates = sourceCandidates;
  highConfidenceCandidateSources = highConfidenceSourceCandidates(sourceCandidates, queryPlan);
  // Deprecated alias: candidateSources intentionally contains high-confidence sources only.
  candidateSources = highConfidenceCandidateSources;
  fallbackReviewSources = fallbackReviewSourceCandidates(sourceCandidates);
  officialBackgroundSources = officialBackgroundSourceCandidates(sourceCandidates);
  rejectedSources = sourceCandidates.filter((source) => source.reviewStatus === "rejected");
  acceptedSources = sourceCandidates.filter((source) => source.reviewStatus === "accepted");
  sourceQualitySummary = buildSourceQualitySummary(sourceCandidates);
  const providerErrors = providerErrorsFromSearchResult(searchResult);
  const reviewableCount = reviewableSourceCandidateCount(sourceCandidates);
  const fallbackCompleted = fallbackRoundsExecuted > 0 || academicRetry.count > 0;
  const finalGroundingPhase =
    reviewableCount === 0 && fallbackCompleted
      ? "no_sources_after_fallback"
      : reviewableCount > 0 && reviewableCount < MIN_REVIEWABLE_SOURCE_COUNT
        ? "waiting_for_review"
      : reviewableCount >= READY_REVIEWABLE_SOURCE_COUNT &&
          (sourceQualitySummary.academicEnough || sourceQualitySummary.evidenceUsableEnough)
        ? "source_review_ready"
        : reviewableCount >= MIN_REVIEWABLE_SOURCE_COUNT
          ? "source_review_needs_manual"
          : "no_sources_after_fallback";
  const groundingDiagnostics = buildGroundingDiagnostics({
    rawTopic: originalTopic,
    parsedInput,
    topicAnalysis,
    queryPlan,
    searchResult,
    sourceCandidates,
    selectedDomain: input.selectedDomain,
    researchQuestion: requestResearchQuestion || parsedInput.researchQuestion,
    currentPhase: finalGroundingPhase,
    fallbackAttempts,
    fallbackCompleted,
    maxFallbackRounds: MAX_FALLBACK_ROUNDS,
    academicRetry,
    sourceQualitySummary,
    foregroundLatencyMs:
      searchResult.diagnostics?.foreground_latency_ms ?? Date.now() - pipelineStartedAt,
  });
  await progress(dependencies, {
    status: finalGroundingPhase as GroundingJob["status"],
    progress: 88,
    patch: {
      sourceCandidates,
      highConfidenceCandidateSources,
      candidateSources,
      fallbackReviewSources,
      rejectedSources,
      acceptedSources,
      fallbackAttempts,
      academicRetry,
      sourceQualitySummary,
      providerErrors,
      groundingDiagnostics,
    },
  });

  const reviewSources = sourceCandidates.filter((source) => source.reviewStatus === "review");
  await progress(dependencies, {
    status: "enriching_sources_background",
    progress: 90,
    patch: { groundingDiagnostics },
  });
  const extractionResults = await extractContentForSources(acceptedSources);
  const extractionBySourceId = new Map(
    extractionResults.map((result) => [result.source_id, result]),
  );
  const enrichCandidateList = (items: SourceCandidate[]): SourceCandidate[] =>
    items.map((source) => {
      const extraction = extractionBySourceId.get(source.sourceId);
      return extraction ? enrichSourceCandidateWithExtraction(source, extraction) : source;
    });
  sourceCandidates = enrichCandidateList(sourceCandidates);
  highConfidenceCandidateSources = enrichCandidateList(highConfidenceCandidateSources);
  candidateSources = enrichCandidateList(candidateSources);
  fallbackReviewSources = enrichCandidateList(fallbackReviewSources);
  officialBackgroundSources = enrichCandidateList(officialBackgroundSources);
  rejectedSources = enrichCandidateList(rejectedSources);
  acceptedSources = enrichCandidateList(acceptedSources);
  await progress(dependencies, {
    status: "llm_enhancing",
    progress: 94,
    patch: {
      sourceCandidates,
      acceptedSources,
      groundingDiagnostics,
    },
  });
  const claimCandidates = await extractClaimsForSources({
    topic: effectiveTopic,
    workflowId: input.workflowId,
    topicHash: topicAnalysis.topicHash,
    sources: acceptedSources,
  }, {
    enableLlm: process.env.ENABLE_CLAIM_EXTRACTION_LLM === "true",
    maxChunksPerSource: 3,
    maxTotalClaims: 48,
    concurrency: 2,
  });
  const claimsBySourceId = new Map<string, ClaimCandidate[]>();
  for (const claim of claimCandidates) {
    const existing = claimsBySourceId.get(claim.sourceId) ?? [];
    existing.push(claim);
    claimsBySourceId.set(claim.sourceId, existing);
  }
  const annotateClaimStats = (source: SourceCandidate): SourceCandidate => {
    const claims = claimsBySourceId.get(source.sourceId) ?? [];
    const acceptedClaimCount = claims.filter((claim) => claim.status === "accepted").length;
    const claimExtractionMode = claims.some((claim) => claim.extractionMode === "llm")
      ? "llm"
      : claims.some((claim) => claim.extractionMode === "rule_fallback")
        ? "rule_fallback"
        : source.accessLevel === "metadata_only"
          ? "metadata_only"
          : undefined;
    const claimExtractionStatus =
      source.canUseForClaims === false
        ? "skipped"
        : claims.some((claim) => claim.extractionMode === "llm")
          ? "enabled"
          : claims.some((claim) => claim.extractionMode === "rule_fallback")
            ? "fallback"
            : source.accessLevel === "metadata_only" || source.accessLevel === "failed_extraction"
              ? "skipped"
              : "unavailable";
    return {
      ...source,
      claimExtractionStatus,
      ...(claimExtractionMode ? { claimExtractionMode } : {}),
      claimCount: claims.length,
      acceptedClaimCount,
      claimExtractionWarnings: uniqueStrings([
        ...(source.extractionWarnings ?? []),
        ...claims
          .filter((claim) => claim.status !== "accepted")
          .map((claim) => claim.rejectionReason ?? claim.status),
        claims.some((claim) => claim.extractionMode === "rule_fallback")
          ? "claim_extraction_rule_fallback"
          : "",
      ]),
    };
  };
  sourceCandidates = sourceCandidates.map(annotateClaimStats);
  highConfidenceCandidateSources = highConfidenceCandidateSources.map(annotateClaimStats);
  candidateSources = candidateSources.map(annotateClaimStats);
  fallbackReviewSources = fallbackReviewSources.map(annotateClaimStats);
  officialBackgroundSources = officialBackgroundSources.map(annotateClaimStats);
  rejectedSources = rejectedSources.map(annotateClaimStats);
  acceptedSources = acceptedSources.map(annotateClaimStats);
  const evidenceCards = buildGroundingEvidenceCards({
    workflowId: input.workflowId,
    topicHash: topicAnalysis.topicHash,
    acceptedSources,
    claimCandidates,
    reviewSources,
    safetyReview: academicSafetyReview,
  });
  const evidenceCountBySourceId = new Map<string, number>();
  for (const card of evidenceCards) {
    evidenceCountBySourceId.set(
      card.sourceId,
      (evidenceCountBySourceId.get(card.sourceId) ?? 0) + 1,
    );
  }
  const annotateEvidenceStats = (source: SourceCandidate): SourceCandidate => ({
    ...source,
    acceptedEvidenceCardCount: evidenceCountBySourceId.get(source.sourceId) ?? 0,
  });
  sourceCandidates = sourceCandidates.map(annotateEvidenceStats);
  highConfidenceCandidateSources = highConfidenceCandidateSources.map(annotateEvidenceStats);
  candidateSources = candidateSources.map(annotateEvidenceStats);
  fallbackReviewSources = fallbackReviewSources.map(annotateEvidenceStats);
  officialBackgroundSources = officialBackgroundSources.map(annotateEvidenceStats);
  rejectedSources = rejectedSources.map(annotateEvidenceStats);
  acceptedSources = acceptedSources.map(annotateEvidenceStats);

  const reportArtifacts = buildReportArtifacts({
    topic: effectiveTopic,
    workflowId: input.workflowId,
    topicHash: topicAnalysis.topicHash,
    titleState: topicTitleState,
    titleParse,
    evidenceCards,
    safetyReview: academicSafetyReview,
  });
  const sanitizedArtifacts = suppressLegacyGenericOutput({
    reportSections: reportArtifacts.reportSections,
    reportDraft: reportArtifacts.reportDraft,
    researchCandidates: reportArtifacts.researchCandidates,
  });
  const finalStatus: GroundingJob["status"] =
    reviewableCount === 0
      ? "no_sources_after_fallback"
      : reviewableCount < MIN_REVIEWABLE_SOURCE_COUNT
        ? "waiting_for_review"
      : reviewableCount >= READY_REVIEWABLE_SOURCE_COUNT &&
          (sourceQualitySummary.academicEnough || sourceQualitySummary.evidenceUsableEnough)
        ? "source_review_ready"
        : "source_review_needs_manual";
  const diagnosticTrace = shouldIncludeDiagnosticTrace(input)
    ? buildResearchGroundingDiagnosticTrace({
        workflowId: input.workflowId,
        topicHash: topicAnalysis.topicHash,
        originalTopic,
        createdAt,
        locale: topicAnalysis.detectedLanguage === "en" ? "en" : "zh-TW",
        searchDepth: input.searchProfile ?? "standard",
        topicAnalysis,
        normalizedSearchTopic,
        queryPlan,
        searchResult,
        sourceCandidates,
        groundingDiagnostics,
        finalStatus,
      })
    : undefined;
  const finalGroundingDiagnostics: GroundingPipelineDiagnostics = diagnosticTrace
    ? { ...groundingDiagnostics, diagnosticTrace }
    : groundingDiagnostics;

  return {
    jobId: "pending-assignment",
    workflowId: input.workflowId,
    topicHash: topicAnalysis.topicHash,
    originalTopic,
    normalizedTopic: topicAnalysis.normalizedTopic,
    status: finalStatus,
    progress: 100,
    parsedInput,
    topicAnalysis,
    titleParse,
    topicTitleState,
    seedQueryPlan,
    lexicalSignals,
    queryPlan,
    academicSafetyReview,
    sourceCandidates,
    highConfidenceCandidateSources,
    candidateSources,
    fallbackReviewSources,
    rejectedSources,
    acceptedSources,
    fallbackAttempts,
    academicRetry,
    sourceQualitySummary,
    providerErrors,
    groundingDiagnostics: finalGroundingDiagnostics,
    ...(diagnosticTrace ? { diagnosticTrace } : {}),
    claimCandidates,
    evidenceCards,
    reportPlan: reportArtifacts.reportPlan,
    reportSections: sanitizedArtifacts.reportSections,
    reportSectionSufficiency: reportArtifacts.reportSectionSufficiency,
    reportDraft: sanitizedArtifacts.reportDraft,
    researchCandidates: sanitizedArtifacts.researchCandidates,
    warnings: uniqueStrings([
      ...topicAnalysis.warnings,
      ...searchResult.warnings,
      ...sourceCandidateResult.warnings,
      ...extractionResults.flatMap((result) =>
        result.extraction_warnings.map(
          (warning) => `${result.source_id}:${warning}`,
        ),
      ),
      ...claimCandidates
        .filter((claim) => claim.status !== "accepted")
        .map((claim) => `${claim.sourceId}:${claim.rejectionReason ?? claim.status}`),
      ...sanitizedArtifacts.warnings,
      ...(groundingDiagnostics.finalUiState === "provider_failed"
        ? ["來源服務暫時無法取得資料，請稍後重試。已記錄 provider error。"]
        : []),
      ...(groundingDiagnostics.finalUiState === "no_sources_after_fallback"
        ? ["所有自動 fallback 查詢完成後，仍未取得可審查來源。"]
        : []),
      ...(groundingDiagnostics.finalUiState === "waiting_for_review"
        ? ["來源較少，建議補充。"]
        : []),
      ...(fallbackAttempts.length > 0 && reviewableCount > 0
        ? ["找到資料但被篩選器全部排除，已自動放寬條件並保留最高分來源供審查。"]
        : []),
      ...(acceptedSources.length === 0 && evidenceCards.length > 0
        ? [
            officialBackgroundSources.length > 0 && highConfidenceCandidateSources.length === 0
              ? "目前來源主要為官方背景或科普說明，缺少同行評審學術論文。"
              : "未找到完全 accepted sources，已改用高相關待審來源產生 provisional 摘要，建議人工複核引用。",
          ]
        : acceptedSources.length === 0 && reviewableCount === 0
        ? ["查無足夠 accepted sources，請改用更完整的主題或加入關鍵詞。"]
        : []),
    ]),
    createdAt,
    updatedAt: nowIso(),
  };
}
