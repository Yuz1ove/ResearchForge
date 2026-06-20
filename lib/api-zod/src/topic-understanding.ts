export type TopicLanguage = "zh" | "en" | "mixed" | "unknown";

export type TopicKind =
  | "specific_research_topic"
  | "known_entity"
  | "brand_or_product"
  | "cultural_artifact"
  | "broad_common_noun"
  | "ambiguous"
  | "unknown_or_noise";

export type TopicEntityCategory =
  | "animal"
  | "food"
  | "plant"
  | "disease"
  | "technology"
  | "historical_concept"
  | "person"
  | "place"
  | "social_issue"
  | "brand"
  | "product"
  | "musical_instrument"
  | "household_item"
  | "consumer_goods"
  | "material"
  | "unknown";

export type TopicDomain =
  | "animal_science"
  | "food_nutrition"
  | "beverage_health"
  | "consumer_product"
  | "automotive_business"
  | "music_culture"
  | "household_safety"
  | "materials_design"
  | "biology"
  | "health"
  | "technology"
  | "environment"
  | "social_science"
  | "history_culture"
  | "general_research";

export interface TopicClarificationCard {
  label: string;
  suggestedTopic: string;
  description: string;
  zhQueries: string[];
  enQueries: string[];
}

export interface TopicResearchAngle {
  label: string;
  researchQuestion: string;
  whyResearchable: string;
  zhQueries: string[];
  enQueries: string[];
  suggestedSourceTypes: string[];
}

export interface TopicEntityInfo {
  canonicalName: string;
  aliases: string[];
  englishNames: string[];
  scientificNames?: string[];
  category: TopicEntityCategory;
}

export interface TopicUnderstandingResult {
  originalTopic: string;
  normalizedTopic: string;
  language: TopicLanguage;
  topicKind: TopicKind;
  domain: TopicDomain;
  canonicalTerms: string[];
  aliases: string[];
  englishTerms: string[];
  scientificNames: string[];
  excludedMeanings: string[];
  shouldSearchNow: boolean;
  shouldSearchImmediately: boolean;
  needsClarification: boolean;
  researchAngles: TopicResearchAngle[];
  clarificationCards: TopicClarificationCard[];
  excludedDriftTerms: string[];
  entity?: TopicEntityInfo;
}

interface TopicLexiconEntry {
  canonicalName: string;
  aliases: string[];
  englishNames: string[];
  scientificNames?: string[];
  category: TopicEntityCategory;
  domain: TopicDomain;
  topicKind: TopicKind;
  matchTerms: string[];
  excludedMeanings?: string[];
  researchAngles: TopicResearchAngle[];
}

const COMMON_RESEARCH_CUES = [
  /影響|關係|比較|分析|研究|探討|成因|原因|風險|管理|應用|角色|作用|現況|趨勢|機制|差異|攝取|福利|飼養|行為|健康|安全|實驗|模型|醫學|營養|消費|包裝|供應鏈|設計|材料|品牌|市場|文化|歷史|演變|永續|回收/,
  /effect|impact|relationship|comparison|analysis|study|research|review|risk|management|application|role|mechanism|trend|welfare|husbandry|behavior|behaviour|health|safety|experiment|animal model|biomedical|nutrition|consumer|packaging|supply chain|design|material|brand|market|culture|history|sustainability/i,
];

const SPECIFIC_PATTERN_CUES = [
  /對.+的影響/,
  /作為.+在.+中的/,
  /如何/,
  /是否/,
  /與.+的關係/,
  /在.+中的.+/,
  /in .+ research/i,
  /for .+ research/i,
];

const GENERIC_TEMPLATE_TERMS = [
  "academic research",
  "evidence",
  "source",
  "peer reviewed",
  "研究問題",
  "學術文章",
  "官方或機構資料",
  "具體問題切入",
];

function angle(
  label: string,
  researchQuestion: string,
  whyResearchable: string,
  zhQueries: string[],
  enQueries: string[],
  suggestedSourceTypes: string[] = [
    "學術論文",
    "政府或機構資料",
    "產業報告",
  ],
): TopicResearchAngle {
  return {
    label,
    researchQuestion,
    whyResearchable,
    zhQueries,
    enQueries,
    suggestedSourceTypes,
  };
}

const FOOD_SOURCE_TYPES = ["營養標示資料", "食品安全研究", "公共衛生資料"];
const PRODUCT_SOURCE_TYPES = ["安全標準", "材料研究", "消費者或產業資料"];

const TOPIC_LEXICON: TopicLexiconEntry[] = [
  {
    canonicalName: "天竺鼠",
    aliases: ["豚鼠", "荷蘭豬"],
    englishNames: ["guinea pig"],
    scientificNames: ["Cavia porcellus"],
    category: "animal",
    domain: "animal_science",
    topicKind: "known_entity",
    matchTerms: ["天竺鼠", "豚鼠", "荷蘭豬", "guinea pig", "cavia porcellus"],
    excludedMeanings: [
      "India",
      "Tang dynasty",
      "Buddhism",
      "Xuanzang",
      "天竺",
      "唐代",
      "玄奘",
      "佛教",
      "印度史",
    ],
    researchAngles: [
      angle(
        "實驗動物",
        "天竺鼠作為實驗動物在醫學研究中的應用",
        "可研究天竺鼠在免疫、過敏、聽覺或藥物測試中的角色。",
        ["天竺鼠 實驗動物 醫學研究", "豚鼠 過敏 免疫 研究"],
        [
          "guinea pig animal model biomedical research",
          "Cavia porcellus allergy immunology research",
          "guinea pig hearing research",
          "guinea pig laboratory animal",
        ],
        ["實驗動物研究", "醫學論文", "獸醫或動物福利資料"],
      ),
      angle(
        "飼養健康",
        "天竺鼠的飼養環境與健康管理",
        "可研究飲食、維生素 C、籠舍環境與常見疾病。",
        ["天竺鼠 飼養 健康 管理", "豚鼠 維生素C 疾病"],
        [
          "guinea pig husbandry health management",
          "Cavia porcellus vitamin C deficiency disease",
        ],
        ["獸醫資料", "動物福利指引", "飼養管理研究"],
      ),
      angle(
        "動物行為",
        "天竺鼠的社會行為與動物福利",
        "可研究群居、叫聲、壓力、環境豐富化與動物福利。",
        ["天竺鼠 社會行為 動物福利", "豚鼠 壓力 行為"],
        [
          "guinea pig social behavior animal welfare",
          "Cavia porcellus stress behavior enrichment",
        ],
        ["動物行為研究", "動物福利資料", "獸醫期刊"],
      ),
    ],
  },
  {
    canonicalName: "薯條",
    aliases: ["炸薯條", "馬鈴薯條", "速食薯條"],
    englishNames: ["French fries", "fries", "fried potato"],
    category: "food",
    domain: "food_nutrition",
    topicKind: "known_entity",
    matchTerms: [
      "薯條",
      "炸薯條",
      "馬鈴薯條",
      "french fries",
      "fries",
      "fried potato",
    ],
    excludedMeanings: ["computer chip", "semiconductor chip", "wood chips"],
    researchAngles: [
      angle(
        "營養標示",
        "速食薯條的營養成分與鈉含量分析",
        "可比較熱量、脂肪、鈉含量與份量差異。",
        ["薯條 營養成分 鈉含量", "速食薯條 熱量 脂肪"],
        [
          "french fries nutrition sodium calories",
          "fast food french fries nutrition label",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "食品安全",
        "油炸方式與薯條食品安全風險",
        "可討論油炸溫度、用油品質與丙烯醯胺。",
        ["薯條 油炸 丙烯醯胺 食品安全", "炸薯條 用油品質 健康風險"],
        [
          "french fries acrylamide food safety",
          "fried potato acrylamide frying temperature oil quality",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "飲食行為",
        "青少年速食薯條攝取與飲食習慣",
        "可分析外食、速食配餐與青少年飲食習慣。",
        ["青少年 薯條 速食 飲食習慣", "速食薯條 外食 健康影響"],
        [
          "adolescents french fries fast food dietary habits",
          "fast food french fries health adolescents",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "環境負荷",
        "薯條包裝與速食供應鏈的環境負荷",
        "可從冷凍馬鈴薯、包裝與廢棄物切入。",
        ["薯條 包裝 供應鏈 環境", "冷凍馬鈴薯 製品 環境負荷"],
        [
          "frozen potato products life cycle assessment",
          "french fries packaging waste",
        ],
        ["生命週期評估", "供應鏈資料", "包裝廢棄物統計"],
      ),
    ],
  },
  {
    canonicalName: "泡泡",
    aliases: ["氣泡", "肥皂泡"],
    englishNames: ["bubble", "soap bubble"],
    category: "material",
    domain: "materials_design",
    topicKind: "ambiguous",
    matchTerms: ["泡泡", "氣泡", "肥皂泡", "bubble", "soap bubble"],
    researchAngles: [
      angle(
        "表面張力",
        "泡泡的表面張力與物理原理",
        "可研究液膜穩定性、表面張力與破裂條件。",
        ["泡泡 表面張力 物理原理", "肥皂泡 液膜 穩定性"],
        [
          "bubble surface tension physics",
          "soap bubble film stability surface tension",
        ],
        ["物理實驗", "材料科學研究", "科普或教育資料"],
      ),
      angle(
        "光學干涉",
        "肥皂泡在光學干涉中的應用",
        "可研究薄膜干涉、顏色變化與光學現象。",
        ["肥皂泡 光學干涉 薄膜", "泡泡 顏色 反射 干涉"],
        [
          "soap bubble optical interference thin film",
          "bubble color interference optics",
        ],
        ["物理研究", "光學教材", "實驗資料"],
      ),
      angle(
        "幼兒學習",
        "泡泡遊戲對幼兒感官學習的影響",
        "可研究視覺追蹤、感官刺激與互動式學習。",
        ["泡泡遊戲 幼兒 感官學習", "氣泡 遊戲 幼兒 視覺追蹤"],
        [
          "bubble play sensory learning preschool children",
          "bubble game visual tracking early childhood learning",
        ],
        ["幼兒教育研究", "發展心理資料", "教學活動研究"],
      ),
      angle(
        "材料應用",
        "氣泡材料在食品或醫療中的應用",
        "可研究發泡材料、微氣泡與食品或醫療工程應用。",
        ["氣泡材料 食品 應用", "微氣泡 醫療 材料"],
        [
          "bubble materials food application",
          "microbubble medical materials application",
        ],
        ["材料科學論文", "食品工程研究", "醫療工程資料"],
      ),
    ],
  },
  {
    canonicalName: "水餃",
    aliases: ["餃子", "冷凍水餃"],
    englishNames: ["dumpling", "jiaozi", "frozen dumpling"],
    category: "food",
    domain: "food_nutrition",
    topicKind: "known_entity",
    matchTerms: ["水餃", "餃子", "dumpling", "jiaozi"],
    researchAngles: [
      angle(
        "飲食文化",
        "水餃在台灣飲食文化中的演變",
        "可追查家常料理、節慶與地方飲食脈絡。",
        ["水餃 台灣 飲食文化", "餃子 家庭飲食 文化"],
        ["dumpling Taiwanese food culture", "jiaozi household food culture Taiwan"],
        ["飲食文化研究", "地方資料", "食品產業資料"],
      ),
      angle(
        "營養標示",
        "冷凍水餃與現包水餃的營養差異",
        "可比較營養標示、鈉含量與加工差異。",
        ["冷凍水餃 現包水餃 營養差異", "水餃 鈉含量 食品標示"],
        [
          "frozen dumpling fresh dumpling nutrition comparison",
          "dumpling sodium food labeling",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "成分分析",
        "水餃內餡組成對熱量與營養的影響",
        "可分析豬肉、蔬菜、海鮮等內餡差異。",
        ["水餃內餡 熱量 脂肪 蛋白質", "水餃 成分 營養"],
        ["dumpling filling calories fat protein", "dumpling ingredients nutrition"],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "健康風險",
        "市售冷凍水餃鈉含量與健康風險比較",
        "可分析鈉含量、攝取風險與品牌差異。",
        ["冷凍水餃 鈉含量 健康風險", "市售水餃 食品標示 比較"],
        ["frozen dumpling sodium health risk", "dumpling food labeling consumer comparison"],
        FOOD_SOURCE_TYPES,
      ),
    ],
  },
  {
    canonicalName: "可樂",
    aliases: ["碳酸飲料", "含糖碳酸飲料"],
    englishNames: ["cola", "soft drink", "soda", "sugar-sweetened beverage"],
    category: "food",
    domain: "beverage_health",
    topicKind: "known_entity",
    matchTerms: ["可樂", "碳酸飲料", "cola", "soft drink", "soda"],
    excludedMeanings: ["coal", "coke fuel", "cocaine"],
    researchAngles: [
      angle(
        "健康影響",
        "可樂成分與青少年健康影響",
        "可研究糖分、咖啡因與含糖飲料攝取情境。",
        ["可樂 糖分 咖啡因 青少年 健康", "含糖飲料 健康影響"],
        ["cola sugar caffeine adolescents health", "sugar sweetened beverage health effects youth"],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "成分比較",
        "無糖可樂與含糖可樂成分比較",
        "可比較甜味劑、咖啡因與熱量差異。",
        ["無糖可樂 含糖可樂 成分比較", "可樂 咖啡因 糖分 標示"],
        ["diet cola regular cola ingredient comparison", "cola caffeine sugar nutrition label"],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "廣告與消費",
        "可樂品牌廣告如何影響消費偏好",
        "可研究品牌形象、廣告內容與消費心理。",
        ["可樂 品牌廣告 消費偏好", "可樂 行銷 消費心理"],
        ["cola advertising consumer preference", "soft drink marketing consumer behavior"],
        ["消費者研究", "行銷研究", "產業資料"],
      ),
      angle(
        "環境",
        "可樂包裝與環境廢棄物問題",
        "可從塑膠瓶、鋁罐與回收制度切入。",
        ["可樂 包裝廢棄物 回收", "可樂 塑膠瓶 鋁罐 環境"],
        ["cola packaging waste recycling", "soft drink plastic bottle aluminum can environmental impact"],
        ["包裝廢棄物統計", "環境研究", "回收政策資料"],
      ),
    ],
  },
  {
    canonicalName: "BMW",
    aliases: ["寶馬", "BMW Group", "Bayerische Motoren Werke"],
    englishNames: ["BMW", "BMW Group", "Bayerische Motoren Werke"],
    category: "brand",
    domain: "automotive_business",
    topicKind: "brand_or_product",
    matchTerms: ["BMW", "寶馬", "bmw group", "bayerische motoren werke"],
    excludedMeanings: ["body mass weight", "British Motor Works"],
    researchAngles: [
      angle(
        "電動化策略",
        "BMW 在電動車轉型中的產品與供應鏈策略",
        "可比較電動車銷售、電池供應鏈、平台策略與競爭者。",
        ["BMW 電動車 轉型 供應鏈", "BMW i 系列 電動車 策略"],
        ["BMW electric vehicle strategy supply chain", "BMW electrification strategy EV sales"],
        ["企業年報", "產業分析", "市場資料"],
      ),
      angle(
        "品牌定位",
        "BMW 品牌定位與豪華車市場競爭",
        "可分析品牌形象、價格區隔、競品與消費者認知。",
        ["BMW 品牌定位 豪華車 市場", "BMW 消費者 品牌形象"],
        ["BMW brand positioning luxury car market", "BMW consumer perception brand image"],
        ["行銷研究", "產業報告", "消費者研究"],
      ),
      angle(
        "永續製造",
        "BMW 永續製造與碳排管理策略",
        "可查企業永續報告、供應鏈排放與製程改善。",
        ["BMW 永續報告 碳排 製造", "BMW 供應鏈 碳排管理"],
        ["BMW sustainability report carbon emissions manufacturing", "BMW supply chain decarbonization"],
        ["企業永續報告", "ESG 資料", "產業分析"],
      ),
    ],
  },
  {
    canonicalName: "古典吉他",
    aliases: ["尼龍弦吉他", "西班牙吉他"],
    englishNames: ["classical guitar", "nylon-string guitar", "Spanish guitar"],
    category: "musical_instrument",
    domain: "music_culture",
    topicKind: "cultural_artifact",
    matchTerms: ["古典吉他", "尼龍弦吉他", "西班牙吉他", "classical guitar", "nylon-string guitar"],
    researchAngles: [
      angle(
        "音色與結構",
        "古典吉他的材料結構如何影響音色與演奏表現",
        "可研究面板木材、琴體結構、尼龍弦與聲學特性。",
        ["古典吉他 材料 結構 音色", "尼龍弦吉他 聲學 特性"],
        ["classical guitar materials sound quality acoustics", "nylon string guitar tone wood structure"],
        ["樂器聲學研究", "材料研究", "演奏研究"],
      ),
      angle(
        "教育與練習",
        "古典吉他學習中的練習方法與演奏技巧發展",
        "可分析姿勢、讀譜、右手技巧與學習成效。",
        ["古典吉他 教學 練習方法", "古典吉他 演奏技巧 學習"],
        ["classical guitar pedagogy practice technique", "classical guitar learning performance education"],
        ["音樂教育研究", "演奏法資料", "教學研究"],
      ),
      angle(
        "文化史",
        "古典吉他的發展史與跨文化傳播",
        "可追溯西班牙吉他傳統、作曲家、曲目與現代傳播。",
        ["古典吉他 發展史 西班牙", "古典吉他 曲目 文化傳播"],
        ["classical guitar history Spanish guitar repertoire", "classical guitar cultural transmission"],
        ["音樂史資料", "文化研究", "樂器史研究"],
      ),
    ],
  },
  {
    canonicalName: "水壺",
    aliases: ["水瓶", "飲水瓶", "保溫瓶"],
    englishNames: ["water bottle", "drinking bottle", "reusable bottle"],
    category: "household_item",
    domain: "household_safety",
    topicKind: "broad_common_noun",
    matchTerms: ["水壺", "水瓶", "飲水瓶", "保溫瓶", "water bottle", "drinking bottle", "reusable bottle"],
    excludedMeanings: ["hot water kettle", "boiler"],
    researchAngles: [
      angle(
        "材料安全",
        "不同材質水壺的食品接觸安全與耐用性比較",
        "可比較塑膠、不鏽鋼、玻璃與矽膠的安全標準。",
        ["水壺 材質 食品接觸 安全", "水瓶 BPA 不鏽鋼 玻璃 比較"],
        ["water bottle material food contact safety BPA stainless steel glass"],
        PRODUCT_SOURCE_TYPES,
      ),
      angle(
        "重複使用與衛生",
        "重複使用水壺的清潔習慣與微生物風險",
        "可研究清潔頻率、材質表面、細菌滋生與衛生建議。",
        ["水壺 清潔 細菌 衛生", "重複使用水瓶 微生物 風險"],
        ["reusable water bottle cleaning bacteria hygiene", "drinking bottle microbial contamination"],
        ["公共衛生研究", "食品安全資料", "消費者指南"],
      ),
      angle(
        "環境效益",
        "重複使用水壺是否能降低一次性瓶裝水環境負荷",
        "可比較生命週期、塑膠廢棄物與使用次數門檻。",
        ["重複使用水壺 環境效益 塑膠瓶", "水瓶 生命週期評估"],
        ["reusable water bottle life cycle assessment plastic bottle environmental impact"],
        ["生命週期評估", "環境研究", "廢棄物統計"],
      ),
    ],
  },
  {
    canonicalName: "雞蛋",
    aliases: ["蛋", "雞蛋產品", "蛋品"],
    englishNames: ["egg", "chicken egg", "hen egg"],
    category: "food",
    domain: "food_nutrition",
    topicKind: "broad_common_noun",
    matchTerms: ["雞蛋", "蛋品", "chicken egg", "hen egg"],
    excludedMeanings: ["Easter egg", "software easter egg"],
    researchAngles: [
      angle(
        "營養價值",
        "雞蛋的營養成分與不同族群攝取建議",
        "可研究蛋白質、膽固醇、微量營養素與飲食建議。",
        ["雞蛋 營養成分 膽固醇 攝取建議", "蛋白質 雞蛋 飲食建議"],
        ["egg nutrition cholesterol dietary recommendation protein"],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "食品安全",
        "雞蛋保存與沙門氏菌食品安全風險",
        "可查保存溫度、清洗、烹調與微生物風險。",
        ["雞蛋 保存 沙門氏菌 食品安全", "蛋品 冷藏 烹調 安全"],
        ["egg storage salmonella food safety refrigeration cooking"],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "生產與價格",
        "雞蛋產銷、飼料成本與價格波動",
        "可分析禽流感、飼料價格、供需與政策調節。",
        ["雞蛋 產銷 價格波動 飼料成本", "蛋價 禽流感 供需"],
        ["egg price volatility supply chain feed cost avian influenza"],
        ["農業統計", "產業資料", "政策資料"],
      ),
    ],
  },
];

function unique(items: string[]): string[] {
  return Array.from(
    new Set(items.map((item) => item.trim()).filter(Boolean)),
  );
}

function normalizeTopicText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeAscii(value: string): string {
  return normalizeTopicText(value).toLowerCase();
}

function containsAsciiTerm(text: string, term: string): boolean {
  const normalizedText = normalizeAscii(text);
  const normalizedTerm = normalizeAscii(term);
  if (!normalizedText || !normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(
    normalizedText,
  );
}

function detectLanguage(topic: string): TopicLanguage {
  const hasZh = /[\u3400-\u9fff]/.test(topic);
  const hasEn = /[A-Za-z]/.test(topic);
  if (hasZh && hasEn) return "mixed";
  if (hasZh) return "zh";
  if (hasEn) return "en";
  return "unknown";
}

function hasSpecificResearchCue(topic: string): boolean {
  return (
    COMMON_RESEARCH_CUES.some((pattern) => pattern.test(topic)) ||
    SPECIFIC_PATTERN_CUES.some((pattern) => pattern.test(topic))
  );
}

function isUnknownOrNoise(topic: string): boolean {
  const normalized = normalizeTopicText(topic);
  if (!normalized) return true;
  if (/^[^A-Za-z\u3400-\u9fff0-9]+$/.test(normalized)) return true;
  if (Array.from(normalized).length <= 1 && !/[A-Za-z]{2,}/.test(normalized))
    return true;
  return false;
}

function lexiconEntryForTopic(topic: string): TopicLexiconEntry | undefined {
  const normalizedTopic = normalizeTopicText(topic);
  const normalizedAsciiTopic = normalizeAscii(topic);
  return TOPIC_LEXICON
    .slice()
    .sort(
      (left, right) =>
        Math.max(...right.matchTerms.map((term) => term.length)) -
        Math.max(...left.matchTerms.map((term) => term.length)),
    )
    .find((entry) =>
      entry.matchTerms.some((term) => {
        if (/[A-Za-z]/.test(term)) {
          return containsAsciiTerm(normalizedAsciiTopic, term);
        }
        return normalizedTopic.includes(term);
      }),
    );
}

function clarificationCardsFromAngles(
  angles: TopicResearchAngle[],
): TopicClarificationCard[] {
  return angles.map((angle) => ({
    label: angle.label,
    suggestedTopic: angle.researchQuestion,
    description: angle.whyResearchable,
    zhQueries: angle.zhQueries,
    enQueries: angle.enQueries,
  }));
}

export function entitySearchTerms(entity: TopicEntityInfo | undefined): string[] {
  if (!entity) return [];
  return unique([
    entity.canonicalName,
    ...entity.aliases,
    ...entity.englishNames,
    ...(entity.scientificNames ?? []),
  ]);
}

function isLikelyBroadCommonNoun(topic: string): boolean {
  const normalized = normalizeTopicText(topic);
  if (!normalized || hasSpecificResearchCue(normalized)) return false;
  const zhChunks = normalized.match(/[\u3400-\u9fff]{1,}/g) ?? [];
  const asciiWords = normalized.match(/[A-Za-z]+/g) ?? [];
  const shortZh = zhChunks.length <= 1 && Array.from(normalized).length <= 4;
  const shortAscii = asciiWords.length <= 2 && normalized.length <= 18;
  return shortZh || shortAscii;
}

function patternDomain(topic: string): TopicDomain {
  const text = `${topic} ${normalizeAscii(topic)}`;
  if (/車|汽車|電動車|品牌|市場|競爭|brand|automotive|vehicle|car/.test(text))
    return "automotive_business";
  if (/吉他|音樂|樂器|guitar|music|instrument/.test(text))
    return "music_culture";
  if (/水壺|水瓶|保溫瓶|bottle|kettle/.test(text))
    return "household_safety";
  if (/蛋|雞蛋|營養|食品|食物|飲食|egg|food|nutrition/.test(text))
    return "food_nutrition";
  if (/動物|生態|animal|ecology|biology/.test(text)) return "biology";
  if (/健康|醫學|疾病|health|medical|disease/.test(text)) return "health";
  if (/科技|ai|演算法|technology|software/.test(text)) return "technology";
  if (/環境|永續|氣候|environment|climate|sustainability/.test(text))
    return "environment";
  if (/歷史|文化|社會|history|culture|social/.test(text))
    return "history_culture";
  return "general_research";
}

function genericAngles(topic: string, domain: TopicDomain): TopicResearchAngle[] {
  const t = normalizeTopicText(topic) || "研究主題";
  if (domain === "automotive_business") {
    return [
      angle(
        "市場競爭",
        `${t}的市場定位與主要競爭者分析`,
        "可查產業報告、銷售資料與品牌策略。",
        [`${t} 市場定位 競爭者`, `${t} 品牌策略 銷售`],
        [`${t} market positioning competitors`, `${t} brand strategy sales`],
        ["產業報告", "企業資料", "市場研究"],
      ),
      angle(
        "永續轉型",
        `${t}在永續或電動化轉型中的策略`,
        "可比較永續報告、產品布局與供應鏈策略。",
        [`${t} 永續 轉型 策略`, `${t} 供應鏈 碳排`],
        [`${t} sustainability transition strategy`, `${t} supply chain emissions`],
        ["企業永續報告", "ESG 資料", "產業分析"],
      ),
      angle(
        "消費者認知",
        `${t}的品牌形象與消費者認知`,
        "可分析消費者偏好、品牌聯想與購買動機。",
        [`${t} 品牌形象 消費者`, `${t} 消費偏好`],
        [`${t} brand image consumer perception`, `${t} consumer preference`],
        ["消費者研究", "行銷研究", "市場資料"],
      ),
    ];
  }
  if (domain === "music_culture") {
    return [
      angle(
        "歷史脈絡",
        `${t}的發展史與文化傳播`,
        "可追查技術演變、代表人物、曲目或社群脈絡。",
        [`${t} 發展史 文化`, `${t} 傳播 曲目`],
        [`${t} history culture`, `${t} repertoire cultural transmission`],
        ["文化研究", "音樂史資料", "專書或論文"],
      ),
      angle(
        "學習方法",
        `${t}學習中的技巧養成與教學方法`,
        "可分析練習方法、教材與學習成效。",
        [`${t} 教學 練習方法`, `${t} 學習 技巧`],
        [`${t} pedagogy practice method`, `${t} learning technique`],
        ["教育研究", "教學資料", "專業教材"],
      ),
      angle(
        "材料與設計",
        `${t}的材料、結構與使用體驗`,
        "可比較材料特性、設計差異與使用者評估。",
        [`${t} 材料 結構 使用體驗`],
        [`${t} material design user experience`],
        ["材料研究", "設計研究", "使用者研究"],
      ),
    ];
  }
  if (domain === "food_nutrition" || domain === "beverage_health") {
    return [
      angle(
        "營養與健康",
        `${t}的營養成分與健康影響`,
        "可查營養標示、公共衛生研究與攝取建議。",
        [`${t} 營養成分 健康影響`, `${t} 攝取 建議`],
        [`${t} nutrition health effects`, `${t} dietary intake recommendation`],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "食品安全",
        `${t}的保存、加工或食品安全風險`,
        "可研究污染、保存方式、加工條件與安全標準。",
        [`${t} 食品安全 保存 加工`, `${t} 風險 標準`],
        [`${t} food safety storage processing risk`],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "消費與文化",
        `${t}的消費情境與飲食文化`,
        "可分析消費習慣、價格、品牌或地方文化。",
        [`${t} 消費 習慣 飲食文化`, `${t} 市場 品牌`],
        [`${t} consumption habit food culture`, `${t} market brand`],
        ["消費者研究", "文化研究", "產業資料"],
      ),
    ];
  }
  if (domain === "household_safety" || domain === "consumer_product") {
    return [
      angle(
        "材料安全",
        `${t}的材質、安全標準與使用風險`,
        "可查材料安全、產品標準與使用限制。",
        [`${t} 材質 安全標準 風險`, `${t} 產品安全`],
        [`${t} material safety standard risk`, `${t} product safety`],
        PRODUCT_SOURCE_TYPES,
      ),
      angle(
        "使用行為",
        `${t}的使用習慣與清潔維護問題`,
        "可分析使用者行為、維護方式與衛生或耐用性。",
        [`${t} 使用習慣 清潔 維護`, `${t} 衛生 耐用`],
        [`${t} usage habit cleaning maintenance hygiene`],
        ["消費者研究", "公共衛生資料", "產品測試"],
      ),
      angle(
        "環境影響",
        `${t}的生命週期與環境負荷`,
        "可比較材料、製造、使用次數與廢棄回收。",
        [`${t} 生命週期 環境負荷`, `${t} 回收 永續`],
        [`${t} life cycle assessment environmental impact recycling`],
        ["生命週期評估", "環境研究", "回收資料"],
      ),
    ];
  }
  return [
    angle(
      "現況與脈絡",
      `${t}的現況、背景與主要討論面向`,
      "可先界定主體、使用情境與可查資料來源。",
      [`${t} 現況 背景`, `${t} 主要議題`],
      [`${t} overview current status`, `${t} key issues`],
      ["百科資料", "政府或機構資料", "學術資料庫"],
    ),
    angle(
      "影響與風險",
      `${t}可能造成的影響、風險或限制`,
      "可查實證研究、統計資料與案例。",
      [`${t} 影響 風險`, `${t} 案例 分析`],
      [`${t} impact risk case study`],
      ["實證研究", "統計資料", "案例資料"],
    ),
    angle(
      "改善與應用",
      `${t}的應用情境與改善策略`,
      "可比較不同做法、政策、設計或教育應用。",
      [`${t} 應用 改善策略`, `${t} 方法 比較`],
      [`${t} application strategy comparison`],
      ["實務案例", "機構資料", "研究論文"],
    ),
  ];
}

function entityFromEntry(entry: TopicLexiconEntry): TopicEntityInfo {
  return {
    canonicalName: entry.canonicalName,
    aliases: entry.aliases,
    englishNames: entry.englishNames,
    scientificNames: entry.scientificNames,
    category: entry.category,
  };
}

function buildUnderstanding(input: {
  topic: string;
  normalizedTopic: string;
  language: TopicLanguage;
  topicKind: TopicKind;
  domain: TopicDomain;
  canonicalTerms: string[];
  aliases?: string[];
  englishTerms?: string[];
  scientificNames?: string[];
  excludedMeanings?: string[];
  shouldSearchNow: boolean;
  needsClarification: boolean;
  researchAngles?: TopicResearchAngle[];
  entity?: TopicEntityInfo;
}): TopicUnderstandingResult {
  const researchAngles = input.researchAngles ?? [];
  const excludedMeanings = input.excludedMeanings ?? [];
  return {
    originalTopic: input.topic,
    normalizedTopic: input.normalizedTopic,
    language: input.language,
    topicKind: input.topicKind,
    domain: input.domain,
    canonicalTerms: unique(input.canonicalTerms),
    aliases: unique(input.aliases ?? []),
    englishTerms: unique(input.englishTerms ?? []),
    scientificNames: unique(input.scientificNames ?? []),
    excludedMeanings: unique(excludedMeanings),
    shouldSearchNow: input.shouldSearchNow,
    shouldSearchImmediately: input.shouldSearchNow,
    needsClarification: input.needsClarification,
    researchAngles,
    clarificationCards: clarificationCardsFromAngles(researchAngles),
    excludedDriftTerms: unique(excludedMeanings),
    entity: input.entity,
  };
}

function isGenericTemplateTopic(topic: string): boolean {
  const normalized = normalizeAscii(topic);
  return GENERIC_TEMPLATE_TERMS.some((term) =>
    normalized.includes(term.toLowerCase()),
  );
}

export function understandTopic(topic: string): TopicUnderstandingResult {
  const normalizedTopic = normalizeTopicText(topic);
  const language = detectLanguage(normalizedTopic);

  if (isUnknownOrNoise(normalizedTopic)) {
    return buildUnderstanding({
      topic,
      normalizedTopic,
      language,
      topicKind: "unknown_or_noise",
      domain: "general_research",
      canonicalTerms: [],
      shouldSearchNow: false,
      needsClarification: true,
      researchAngles: [],
    });
  }

  const entry = lexiconEntryForTopic(normalizedTopic);
  const specificResearchTopic = hasSpecificResearchCue(normalizedTopic);

  if (entry) {
    const entity = entityFromEntry(entry);
    return buildUnderstanding({
      topic,
      normalizedTopic: specificResearchTopic
        ? normalizedTopic
        : `${entry.canonicalName}的可研究方向`,
      language,
      topicKind: specificResearchTopic
        ? "specific_research_topic"
        : entry.topicKind,
      domain: entry.domain,
      canonicalTerms: [entry.canonicalName],
      aliases: entry.aliases,
      englishTerms: entry.englishNames,
      scientificNames: entry.scientificNames ?? [],
      excludedMeanings: entry.excludedMeanings ?? [],
      shouldSearchNow: specificResearchTopic,
      needsClarification: !specificResearchTopic,
      researchAngles: entry.researchAngles,
      entity,
    });
  }

  if (specificResearchTopic && !isGenericTemplateTopic(normalizedTopic)) {
    const domain = patternDomain(normalizedTopic);
    return buildUnderstanding({
      topic,
      normalizedTopic,
      language,
      topicKind: "specific_research_topic",
      domain,
      canonicalTerms: [normalizedTopic],
      shouldSearchNow: true,
      needsClarification: false,
      researchAngles: genericAngles(normalizedTopic, domain),
    });
  }

  if (isLikelyBroadCommonNoun(normalizedTopic) || isGenericTemplateTopic(normalizedTopic)) {
    const domain = patternDomain(normalizedTopic);
    return buildUnderstanding({
      topic,
      normalizedTopic: `${normalizedTopic}的可研究方向`,
      language,
      topicKind: "broad_common_noun",
      domain,
      canonicalTerms: [normalizedTopic],
      shouldSearchNow: false,
      needsClarification: true,
      researchAngles: genericAngles(normalizedTopic, domain),
    });
  }

  const domain = patternDomain(normalizedTopic);
  return buildUnderstanding({
    topic,
    normalizedTopic,
    language,
    topicKind: "ambiguous",
    domain,
    canonicalTerms: [normalizedTopic],
    shouldSearchNow: false,
    needsClarification: true,
    researchAngles: genericAngles(normalizedTopic, domain),
  });
}
