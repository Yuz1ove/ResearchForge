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

export interface TopicQueryPlan {
  zh: string[];
  en: string[];
}

export interface TopicUnderstandingResult {
  originalTopic: string;
  normalizedTopic: string;
  language: TopicLanguage;
  topicKind: TopicKind;
  domain: TopicDomain;
  canonicalEnglishTopic: string;
  canonicalTerms: string[];
  aliases: string[];
  englishTerms: string[];
  scientificNames: string[];
  coreConcepts: string[];
  searchQueries: TopicQueryPlan;
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
  /effect|impact|relationship|comparison|analysis|study|research|review|risk|management|application|role|mechanism|trend|welfare|husbandry|behavior|behaviour|health|safety|experiment|animal model|biomedical|nutrition|consumer|packaging|supply chain|design|material|brand|market|culture|history|sustainability|poisoning|illness|infection|outbreak|foodborne|pathogen/i,
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
const FOODBORNE_SOURCE_TYPES = ["食品安全研究", "公共衛生監測", "官方疾病防治資料"];
const PRODUCT_SOURCE_TYPES = ["安全標準", "材料研究", "消費者或產業資料"];

const ENGLISH_TOPIC_HINTS: Array<{
  pattern: RegExp;
  englishTerms: string[];
}> = [
  {
    pattern: /羊駝|alpaca|vicugna pacos/i,
    englishTerms: ["alpaca", "Vicugna pacos"],
  },
  {
    pattern: /沙門氏(?:桿)?菌|salmonella|salmonellosis/i,
    englishTerms: [
      "Salmonella",
      "salmonellosis",
      "Salmonella enterica",
      "foodborne illness",
    ],
  },
  {
    pattern: /觸變性|thixotropy/i,
    englishTerms: ["thixotropy", "rheology", "non-Newtonian fluid behavior"],
  },
  {
    pattern: /飛地|exclave|enclave/i,
    englishTerms: ["exclave", "enclave", "territorial discontinuity"],
  },
  {
    pattern: /端粒酶|telomerase/i,
    englishTerms: ["telomerase", "telomere biology", "cellular senescence"],
  },
  {
    pattern: /榫卯|mortise and tenon/i,
    englishTerms: ["mortise and tenon joint", "traditional joinery"],
  },
];

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
    canonicalName: "鱈魚",
    aliases: ["cod fish", "cod", "大西洋鱈魚"],
    englishNames: ["cod", "Atlantic cod"],
    scientificNames: ["Gadus morhua"],
    category: "food",
    domain: "food_nutrition",
    topicKind: "known_entity",
    matchTerms: ["鱈魚", "大西洋鱈魚", "atlantic cod", "cod fish", "gadus morhua"],
    excludedMeanings: ["code", "coding", "codon"],
    researchAngles: [
      angle(
        "營養成分",
        "鱈魚的蛋白質、omega-3、DHA 與 EPA 營養價值",
        "可比較魚類蛋白質、脂肪酸組成與營養攝取價值。",
        ["鱈魚 營養成分 omega-3 DHA EPA", "鱈魚 蛋白質 魚油"],
        [
          "Atlantic cod nutrition omega-3 DHA EPA",
          "cod fish protein fatty acid composition",
          "Gadus morhua nutritional composition",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "食品安全",
        "鱈魚的重金屬、污染物與 seafood safety 風險",
        "可查 mercury、heavy metals、保存與加工安全。",
        ["鱈魚 重金屬 污染 食品安全", "鱈魚 mercury seafood safety"],
        [
          "cod fish heavy metals mercury seafood safety",
          "Atlantic cod contamination food safety",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "漁業與永續",
        "鱈魚漁業管理、aquaculture 與 sustainable fisheries",
        "可討論鱈魚資源、漁業管理與永續捕撈。",
        ["鱈魚 永續漁業 漁業管理", "鱈魚 aquaculture fisheries"],
        [
          "Atlantic cod sustainable fisheries management",
          "cod aquaculture fisheries policy",
        ],
        ["漁業研究", "海洋政策資料", "產業與永續報告"],
      ),
    ],
  },
  {
    canonicalName: "雞腿",
    aliases: ["雞腿肉", "雞腿排"],
    englishNames: ["chicken thigh", "chicken leg"],
    category: "food",
    domain: "food_nutrition",
    topicKind: "known_entity",
    matchTerms: ["雞腿", "雞腿肉", "雞腿排", "chicken thigh", "chicken leg"],
    excludedMeanings: [
      "breakfast cereal",
      "maize",
      "digital media",
      "eye strain",
      "plant-based protein",
      "amino acid injection",
    ],
    researchAngles: [
      angle(
        "營養成分",
        "雞腿肉的蛋白質、脂肪含量與熱量分析",
        "可比較 chicken thigh 的蛋白質、脂肪與熱量差異。",
        ["雞腿肉 營養 蛋白質 脂肪 熱量", "雞腿 chicken thigh protein fat content"],
        [
          "chicken thigh nutrition protein fat content",
          "chicken leg calories protein composition",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "食品安全",
        "雞腿保存、烹調與 Salmonella 食品安全風險",
        "可查 poultry、Salmonella、保存條件與熟成安全。",
        ["雞腿 食品安全 沙門氏菌 烹調", "雞肉 poultry Salmonella food safety"],
        [
          "chicken thigh Salmonella food safety",
          "poultry meat cooking storage safety",
        ],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "烹調與攝取",
        "雞腿烹調方式如何影響脂肪與食用品質",
        "可比較烘烤、油炸、去皮與調味對營養與感官品質的影響。",
        ["雞腿 烹調方式 脂肪 食用品質", "雞腿 去皮 油炸 烘烤"],
        [
          "chicken thigh cooking method fat content",
          "poultry meat sensory quality cooking",
        ],
        ["食品科學研究", "營養資料", "食品安全研究"],
      ),
    ],
  },
  {
    canonicalName: "手機",
    aliases: ["智慧型手機", "行動電話", "手機裝置"],
    englishNames: ["smartphone", "mobile phone", "cell phone"],
    category: "product",
    domain: "social_science",
    topicKind: "known_entity",
    matchTerms: ["手機", "智慧型手機", "行動電話", "smartphone", "mobile phone", "cell phone"],
    excludedMeanings: ["mobile app company", "smartphone case brand", "telecom stock ticker"],
    researchAngles: [
      angle(
        "使用與睡眠",
        "手機使用時間、螢幕暴露與青少年睡眠品質之關係",
        "可查睡眠品質、螢幕時間、藍光暴露與青少年行為研究。",
        ["手機使用 睡眠品質 青少年", "智慧型手機 螢幕時間 睡眠"],
        ["smartphone use sleep quality adolescents", "screen time smartphone sleep students"],
        ["公共衛生研究", "青少年行為研究", "教育與健康資料"],
      ),
      angle(
        "成癮與注意力",
        "智慧型手機成癮、通知干擾與注意力表現",
        "可研究 problematic smartphone use、專注力、成癮量表與學習表現。",
        ["手機成癮 注意力 學習表現", "智慧型手機 通知干擾 專注力"],
        ["smartphone addiction attention academic performance", "problematic smartphone use notification distraction"],
        ["心理與行為研究", "教育研究", "系統性回顧"],
      ),
      angle(
        "交通與安全",
        "駕駛或步行時使用手機對交通安全的風險",
        "可查 distracted driving、行人分心、事故風險與政策介入。",
        ["手機 使用 交通安全 分心駕駛", "步行 使用手機 事故風險"],
        ["mobile phone use traffic safety distracted driving", "smartphone pedestrian distraction injury risk"],
        ["交通安全研究", "政府事故資料", "政策報告"],
      ),
      angle(
        "教育應用",
        "手機作為學習工具時對課堂互動與學習成效的影響",
        "可比較行動學習、課堂互動、學業成就與教學策略。",
        ["手機 行動學習 課堂互動 學習成效", "智慧型手機 教學 工具 學業表現"],
        ["smartphone mobile learning classroom engagement", "smartphone educational tool learning outcomes"],
        ["教育科技研究", "教學實驗", "學習成效研究"],
      ),
    ],
  },
  {
    canonicalName: "蛤蜊",
    aliases: ["文蛤", "蜊仔", "雙殼貝"],
    englishNames: ["clam", "hard clam", "bivalve"],
    scientificNames: ["Meretrix lusoria", "Meretrix meretrix"],
    category: "food",
    domain: "food_nutrition",
    topicKind: "known_entity",
    matchTerms: ["蛤蜊", "文蛤", "clam", "hard clam", "bivalve", "meretrix"],
    excludedMeanings: ["clam shell craft", "shell command", "shell script"],
    researchAngles: [
      angle(
        "生態棲地",
        "蛤蜊的潮間帶棲地、生長條件與水質關係",
        "可查雙殼貝生態、養殖水質、底質與潮間帶研究。",
        ["蛤蜊 生態 棲地 水質", "文蛤 潮間帶 底質 生長"],
        ["clam habitat ecology water quality", "hard clam bivalve growth sediment"],
        ["海洋生態研究", "水產養殖資料", "政府或機構資料"],
      ),
      angle(
        "食用安全",
        "蛤蜊食用安全、貝毒、重金屬與微生物風險",
        "可查 shellfish safety、biotoxins、重金屬與衛生標準。",
        ["蛤蜊 食用安全 貝毒 重金屬", "文蛤 微生物 食品安全"],
        ["clam shellfish safety biotoxins heavy metals", "bivalve microbial food safety"],
        FOOD_SOURCE_TYPES,
      ),
      angle(
        "養殖管理",
        "蛤蜊養殖管理、產地環境與永續漁業",
        "可比較養殖密度、水質監測、病害與產銷資料。",
        ["蛤蜊 養殖 管理 產地", "文蛤 養殖 水質 病害"],
        ["hard clam aquaculture management water quality", "clam fisheries sustainability"],
        ["水產養殖研究", "漁業統計", "產業資料"],
      ),
    ],
  },
  {
    canonicalName: "烏龜",
    aliases: ["海龜", "陸龜", "龜類"],
    englishNames: ["turtle", "tortoise", "chelonian"],
    scientificNames: ["Testudines"],
    category: "animal",
    domain: "biology",
    topicKind: "known_entity",
    matchTerms: ["烏龜", "海龜", "陸龜", "龜類", "turtle", "tortoise", "chelonian", "testudines"],
    excludedMeanings: ["Teenage Mutant Ninja Turtles", "turtle trading", "logo turtle"],
    researchAngles: [
      angle(
        "棲地保育",
        "烏龜棲地需求、族群監測與保育管理",
        "可查濕地、河口、海岸棲地與保育監測資料。",
        ["烏龜 棲地 保育 族群", "海龜 棲地 監測"],
        ["turtle habitat conservation population monitoring", "sea turtle habitat management"],
        ["生態研究", "保育報告", "政府或機構資料"],
      ),
      angle(
        "外來種影響",
        "外來龜種對本土烏龜族群與棲地的影響",
        "可研究巴西龜、競爭關係、疾病傳播與放生問題。",
        ["外來種 烏龜 巴西龜 本土生態", "龜類 競爭 疾病 放生"],
        ["invasive turtle red-eared slider native turtle impact", "turtle competition disease transmission"],
        ["生態保育研究", "野生動物管理", "環境教育資料"],
      ),
      angle(
        "污染與生存",
        "塑膠污染、漁業活動與人為干擾對烏龜生存的影響",
        "可查塑膠攝食、纏繞、道路死亡與保育措施。",
        ["烏龜 塑膠污染 人為干擾", "海龜 漁業 纏繞 攝食"],
        ["turtle plastic pollution human disturbance", "sea turtle fisheries entanglement ingestion"],
        ["海洋保育研究", "野生動物保護資料", "風險評估"],
      ),
    ],
  },
  {
    canonicalName: "無尾熊",
    aliases: ["樹袋熊", "考拉"],
    englishNames: ["koala"],
    scientificNames: ["Phascolarctos cinereus"],
    category: "animal",
    domain: "biology",
    topicKind: "known_entity",
    matchTerms: ["無尾熊", "樹袋熊", "考拉", "koala", "phascolarctos cinereus"],
    excludedMeanings: ["koala mattress", "toy koala", "cartoon koala"],
    researchAngles: [
      angle(
        "棲地保育",
        "無尾熊的桉樹棲地流失與保育策略",
        "可查棲地破碎化、土地利用、保護區與復育政策。",
        ["無尾熊 棲地 保育 桉樹", "樹袋熊 棲地破碎化"],
        ["koala habitat conservation eucalyptus fragmentation", "Phascolarctos cinereus habitat loss"],
        ["保育研究", "政府或機構資料", "生態監測"],
      ),
      angle(
        "族群威脅",
        "疾病、野火與道路事故對無尾熊族群的影響",
        "可查 chlamydia、bushfire、road mortality 與族群趨勢。",
        ["無尾熊 疾病 野火 道路 族群", "樹袋熊 chlamydia 保育"],
        ["koala chlamydia bushfire road mortality population", "koala population threats conservation"],
        ["獸醫研究", "保育報告", "族群調查"],
      ),
      angle(
        "保育治理",
        "無尾熊保育政策、社區參與與棲地連通性",
        "可比較政策工具、土地管理、保育廊道與社區保育。",
        ["無尾熊 保育政策 棲地連通性", "樹袋熊 社區保育 土地管理"],
        ["koala conservation policy habitat connectivity", "koala corridor community conservation"],
        ["政策報告", "保育機構資料", "環境治理研究"],
      ),
    ],
  },
  {
    canonicalName: "飛機",
    aliases: ["飛航器", "固定翼飛機", "客機"],
    englishNames: ["airplane", "aircraft", "aeroplane", "fixed-wing aircraft"],
    category: "technology",
    domain: "technology",
    topicKind: "known_entity",
    matchTerms: [
      "飛機",
      "飛航器",
      "固定翼飛機",
      "客機",
      "airplane",
      "aircraft",
      "aeroplane",
      "fixed-wing aircraft",
    ],
    excludedMeanings: ["airplane mode", "paper airplane", "paper plane", "飛航模式", "紙飛機"],
    researchAngles: [
      angle(
        "機械與結構",
        "飛機的機翼、機身結構與升力控制原理",
        "可研究翼型、機身受力、控制面與飛行穩定的工程基礎。",
        ["飛機 機翼 機身 結構 升力", "飛機 控制面 飛行穩定"],
        ["aircraft wing fuselage structure lift", "airplane control surfaces flight stability"],
        ["航太工程研究", "飛行力學教材", "工程白皮書"],
      ),
      angle(
        "航空運作",
        "飛機在民航、貨運與飛航安全中的運作機制",
        "可查航線調度、機隊管理、飛安制度與機場協調流程。",
        ["飛機 民航 貨運 飛航安全", "機隊管理 航線 調度"],
        ["aircraft civil aviation cargo flight safety", "fleet management flight operations scheduling"],
        ["民航資料", "飛安報告", "運輸管理研究"],
      ),
      angle(
        "設計與建造",
        "飛機的設計、材料選擇與製造組裝流程",
        "可研究鋁合金、複合材料、機體製造、總裝與維修工程。",
        ["飛機 設計 材料 製造 組裝", "飛機 建造 維修 工程"],
        ["aircraft design materials manufacturing assembly", "airplane construction maintenance engineering"],
        ["航太製造資料", "材料工程研究", "產業技術報告"],
      ),
    ],
  },
  {
    canonicalName: "直升機",
    aliases: ["旋翼機", "直升飛機"],
    englishNames: ["helicopter", "rotorcraft"],
    category: "technology",
    domain: "technology",
    topicKind: "known_entity",
    matchTerms: ["直升機", "旋翼機", "直升飛機", "helicopter", "rotorcraft"],
    excludedMeanings: ["helicopter parenting", "helicopter money"],
    researchAngles: [
      angle(
        "空氣動力學",
        "直升機旋翼空氣動力學、升力控制與飛行穩定性",
        "可查旋翼設計、升力、扭矩平衡與飛行控制原理。",
        ["直升機 空氣動力學 旋翼 升力", "直升機 飛行穩定 控制"],
        ["helicopter aerodynamics rotor lift stability", "rotorcraft flight control dynamics"],
        ["航太工程研究", "飛行力學教材", "技術白皮書"],
      ),
      angle(
        "救護應用",
        "直升機救護、緊急醫療與災害救援應用成效",
        "可研究 air ambulance、救援時效、偏遠地區醫療與任務限制。",
        ["直升機 救護 緊急醫療 救援", "空中救護 災害 效益"],
        ["helicopter emergency medical service outcomes", "air ambulance disaster rescue effectiveness"],
        ["醫療系統研究", "政府或機構資料", "公共安全報告"],
      ),
      angle(
        "風險與噪音",
        "直升機事故風險、安全管理與噪音污染問題",
        "可查事故調查、維修管理、飛安制度與社區噪音影響。",
        ["直升機 事故 風險 安全管理", "直升機 噪音污染 社區"],
        ["helicopter accident risk safety management", "helicopter noise pollution community impact"],
        ["飛安報告", "交通安全研究", "環境噪音資料"],
      ),
    ],
  },
  {
    canonicalName: "陀螺",
    aliases: ["陀螺儀", "旋轉陀螺"],
    englishNames: ["spinning top", "gyroscope", "gyroscopic toy"],
    category: "technology",
    domain: "technology",
    topicKind: "ambiguous",
    matchTerms: [
      "陀螺",
      "陀螺儀",
      "旋轉陀螺",
      "spinning top",
      "gyroscope",
      "gyroscopic toy",
    ],
    excludedMeanings: ["top 10", "ranking", "置頂", "排行"],
    researchAngles: [
      angle(
        "旋轉力學",
        "陀螺的角動量、扭矩與旋轉穩定性原理",
        "可研究角動量守恆、進動、摩擦與重心配置對穩定性的影響。",
        ["陀螺 角動量 扭矩 旋轉穩定性", "陀螺 進動 旋轉力學 物理"],
        [
          "spinning top angular momentum",
          "gyroscopic stability torque",
          "rotational dynamics spinning top",
          "precession of spinning top physics",
        ],
        ["物理研究", "力學教材", "實驗資料"],
      ),
      angle(
        "感測與導航",
        "陀螺儀在手機、無人機與導航系統中的姿態感測應用",
        "可查 MEMS gyroscope、姿態估測、飛行控制與慣性導航。",
        ["陀螺儀 感測器 導航 姿態控制", "MEMS 陀螺儀 手機 無人機"],
        ["gyroscope sensor navigation attitude control", "MEMS gyroscope smartphone drone"],
        ["感測器工程研究", "導航技術資料", "電子工程報告"],
      ),
      angle(
        "設計與製作",
        "陀螺的材料、平衡設計與 STEM 製作教學",
        "可比較木質、塑膠、金屬陀螺在慣量、耐用度與教學展示上的差異。",
        ["陀螺 材料 平衡 設計", "陀螺 製作 STEM 教學"],
        ["spinning top material balance design", "spinning top STEM teaching prototype"],
        ["材料設計研究", "教育實作資料", "STEM 教案"],
      ),
      angle(
        "文化與遊戲",
        "陀螺在民俗遊戲、兒童活動與文化傳承中的角色",
        "可研究地方遊戲、競技形式、教具化與跨世代文化記憶。",
        ["陀螺 民俗遊戲 文化", "陀螺 兒童活動 傳統玩具"],
        ["spinning top folk game cultural heritage", "traditional spinning top children's play"],
        ["文化研究", "教育活動資料", "民俗紀錄"],
      ),
    ],
  },
  {
    canonicalName: "微塑膠",
    aliases: ["塑膠微粒", "塑膠污染"],
    englishNames: ["microplastics", "microplastic", "plastic pollution"],
    category: "social_issue",
    domain: "environment",
    topicKind: "known_entity",
    matchTerms: ["微塑膠", "塑膠微粒", "塑膠污染", "microplastic", "microplastics", "plastic pollution"],
    excludedMeanings: ["software plastic", "plastic surgery"],
    researchAngles: [
      angle(
        "海洋生態",
        "微塑膠對海洋生物攝食、毒性與生態功能的影響",
        "可查海洋污染、生態毒理與海洋生物研究。",
        ["微塑膠 海洋生物 攝食 毒性", "塑膠微粒 海洋生態 影響"],
        ["microplastics marine organisms ingestion toxicity", "microplastics marine ecosystem ecological effects"],
        ["生態毒理研究", "系統性回顧", "海洋污染資料"],
      ),
      angle(
        "食物網累積",
        "微塑膠在海洋食物網中的傳遞與生物累積風險",
        "可查 food web、bioaccumulation、沉積物與沿岸生態系。",
        ["微塑膠 海洋 食物網 生物累積", "塑膠污染 海洋 生態風險"],
        ["microplastics marine food web bioaccumulation", "plastic pollution ecological risk marine"],
        ["風險評估", "海洋生態研究", "綜述論文"],
      ),
      angle(
        "監測治理",
        "海洋微塑膠的來源監測、採樣方法與減量政策",
        "可比較採樣方法、污水、漁業、包裝與治理策略。",
        ["微塑膠 來源 監測 採樣 政策", "海洋塑膠污染 減量 治理"],
        ["marine microplastics monitoring sampling policy", "plastic pollution mitigation governance"],
        ["政府或機構資料", "環境監測", "政策報告"],
      ),
    ],
  },
  {
    canonicalName: "台灣半導體供應鏈",
    aliases: ["台灣晶片供應鏈", "台灣半導體產業鏈", "台積電供應鏈"],
    englishNames: ["Taiwan semiconductor supply chain", "Taiwan chip supply chain", "TSMC supply chain"],
    category: "technology",
    domain: "technology",
    topicKind: "specific_research_topic",
    matchTerms: ["台灣半導體供應鏈", "台灣 半導體 供應鏈", "台灣晶片供應鏈", "台積電供應鏈", "taiwan semiconductor supply chain", "tsmc supply chain"],
    excludedMeanings: ["potato chips", "computer chips as snack pun"],
    researchAngles: [
      angle(
        "產業分工",
        "台灣半導體供應鏈中的晶圓代工、封測與設備材料分工",
        "可查產業報告、企業年報、政府統計與上下游資料。",
        ["台灣 半導體 供應鏈 晶圓代工 封測", "台積電 供應鏈 設備 材料"],
        ["Taiwan semiconductor supply chain foundry packaging testing materials", "TSMC supply chain equipment materials"],
        ["產業報告", "企業年報", "政府統計"],
      ),
      angle(
        "供應鏈韌性",
        "地緣政治與出口管制下台灣半導體供應鏈韌性",
        "可查美中科技管制、供應鏈重組、地緣風險與政策報告。",
        ["台灣 半導體 供應鏈 韌性 地緣政治", "半導體 出口管制 台灣 風險"],
        ["Taiwan semiconductor supply chain resilience geopolitics", "semiconductor export controls Taiwan supply chain risk"],
        ["政策報告", "國際機構資料", "產業分析"],
      ),
      angle(
        "技術瓶頸",
        "先進製程、封裝與關鍵材料對台灣半導體供應鏈的影響",
        "可比較先進製程、CoWoS、EUV、材料與設備瓶頸。",
        ["台灣 半導體 先進製程 封裝 EUV", "CoWoS 供應鏈 台灣 半導體"],
        ["Taiwan semiconductor advanced process packaging EUV", "CoWoS supply chain Taiwan semiconductor"],
        ["技術白皮書", "產業分析", "企業資料"],
      ),
    ],
  },
  {
    canonicalName: "鱷魚",
    aliases: ["鱷", "短吻鱷"],
    englishNames: ["crocodile", "alligator", "crocodilian"],
    category: "animal",
    domain: "biology",
    topicKind: "known_entity",
    matchTerms: ["鱷魚", "短吻鱷", "crocodile", "alligator", "crocodilian"],
    excludedMeanings: ["crocodile brand", "crocodile leather fashion"],
    researchAngles: [
      angle(
        "棲地與分布",
        "鱷魚的濕地棲地、分布與生態角色",
        "可查濕地生態、族群分布、食物鏈與保育資料。",
        ["鱷魚 棲地 濕地 分布", "鱷魚 生態 食物鏈"],
        ["crocodile wetland habitat distribution ecology", "crocodilian ecological role"],
        ["生態研究", "自然史資料", "保育報告"],
      ),
      angle(
        "人鱷衝突",
        "人類活動、棲地縮減與人鱷衝突管理",
        "可查土地利用、攻擊事件、防治策略與社區管理。",
        ["鱷魚 人類衝突 棲地 管理", "鱷魚 保育 人為干擾"],
        ["human crocodile conflict habitat management", "crocodile conservation human impact"],
        ["政府或機構資料", "保育研究", "風險管理案例"],
      ),
      angle(
        "保育與利用",
        "鱷魚保育、養殖利用與野生族群管理",
        "可比較保育法規、養殖、皮革利用與族群監測。",
        ["鱷魚 保育 養殖 野生族群", "短吻鱷 保育 管理"],
        ["crocodile conservation farming wild population management", "alligator conservation management"],
        ["保育政策", "產業資料", "動物管理研究"],
      ),
    ],
  },
  {
    canonicalName: "恐龍",
    aliases: ["非鳥類恐龍"],
    englishNames: ["dinosaur", "non-avian dinosaur"],
    category: "animal",
    domain: "biology",
    topicKind: "known_entity",
    matchTerms: ["恐龍", "非鳥類恐龍", "dinosaur", "non-avian dinosaur"],
    researchAngles: [
      angle(
        "化石與時代",
        "恐龍的化石紀錄與中生代演化脈絡",
        "可研究 Jurassic、Cretaceous 與 fossil record。",
        ["恐龍 化石紀錄 中生代 侏羅紀 白堊紀", "恐龍 fossil record Mesozoic"],
        [
          "dinosaur fossil record Mesozoic",
          "Jurassic Cretaceous dinosaur paleontology",
        ],
        ["古生物學研究", "自然史資料", "科普與教科書資料"],
      ),
      angle(
        "滅絕機制",
        "恐龍滅絕與小行星撞擊、環境變遷假說",
        "可比較小行星撞擊、火山活動與氣候變遷證據。",
        ["恐龍 滅絕 小行星撞擊 白堊紀末", "恐龍 滅絕 假說 環境變遷"],
        [
          "dinosaur extinction asteroid impact Cretaceous",
          "non-avian dinosaur extinction hypothesis",
        ],
        ["古生物學研究", "地球科學資料", "綜述論文"],
      ),
      angle(
        "鳥類演化",
        "恐龍與鳥類演化的關係",
        "可研究羽毛、骨骼與非鳥類恐龍到鳥類的演化證據。",
        ["恐龍 鳥類演化 羽毛 化石", "非鳥類恐龍 鳥類 關係"],
        [
          "dinosaur bird evolution feather fossils",
          "non-avian dinosaur avian evolution",
        ],
        ["演化生物學研究", "古生物學論文", "自然史資料"],
      ),
    ],
  },
  {
    canonicalName: "唐吉訶德",
    aliases: ["唐吉柯德", "《唐吉訶德》"],
    englishNames: ["Don Quixote"],
    category: "historical_concept",
    domain: "history_culture",
    topicKind: "cultural_artifact",
    matchTerms: ["唐吉訶德", "唐吉柯德", "don quixote"],
    excludedMeanings: ["cod", "fish", "nutrition", "DHA", "EPA", "fatty acid", "seafood"],
    researchAngles: [
      angle(
        "文本分析",
        "《唐吉訶德》的文本分析與敘事特色",
        "可研究小說結構、人物塑造與文本中的現實／幻想張力。",
        ["唐吉訶德 文本分析 小說 敘事", "唐吉柯德 文本分析"],
        [
          "Don Quixote textual analysis",
          "Don Quixote narrative structure novel analysis",
        ],
        ["文學研究", "專書", "期刊論文"],
      ),
      angle(
        "諷刺與主題",
        "塞萬提斯如何透過《唐吉訶德》諷刺騎士小說並呈現理想與現實衝突",
        "可從騎士小說諷刺、人物理想與社會現實對照切入。",
        ["唐吉訶德 騎士小說 諷刺 理想 現實", "塞萬提斯 唐吉訶德 主題"],
        [
          "Cervantes Don Quixote chivalric romance satire",
          "Don Quixote idealism reality conflict",
        ],
        ["文學研究", "比較文學", "文化史資料"],
      ),
      angle(
        "文學史地位",
        "《唐吉訶德》在西班牙黃金時代文學與小說史中的地位",
        "可討論西班牙黃金時代、現代小說起源與文學史影響。",
        ["唐吉訶德 文學史 西班牙黃金時代", "唐吉訶德 現代小說 起源"],
        [
          "Don Quixote Spanish Golden Age literature",
          "Cervantes modern novel literary history",
        ],
        ["文學史研究", "專書", "文化研究"],
      ),
    ],
  },
  {
    canonicalName: "Salmonella food poisoning",
    aliases: ["沙門氏菌食物中毒", "沙門氏菌感染", "沙門氏菌症"],
    englishNames: [
      "Salmonella",
      "salmonellosis",
      "Salmonella foodborne illness",
      "non-typhoidal Salmonella",
    ],
    scientificNames: ["Salmonella enterica"],
    category: "disease",
    domain: "health",
    topicKind: "specific_research_topic",
    matchTerms: [
      "salmonella food poisoning",
      "salmonella foodborne illness",
      "salmonellosis",
      "salmonella infection",
      "non-typhoidal salmonella",
      "沙門氏菌食物中毒",
      "沙門氏菌 感染",
      "沙門氏菌症",
    ],
    excludedMeanings: [
      "egg nutrition",
      "egg white",
      "egg yolk",
      "protein content",
      "dietary culture",
    ],
    researchAngles: [
      angle(
        "致病與症狀",
        "Salmonella 食物中毒的感染途徑、症狀與高風險族群",
        "可查 CDC、WHO、公共衛生監測與流行病學資料。",
        ["沙門氏菌 食物中毒 感染途徑 症狀", "沙門氏菌症 高風險族群"],
        [
          "Salmonella food poisoning symptoms transmission",
          "salmonellosis risk groups foodborne illness",
        ],
        FOODBORNE_SOURCE_TYPES,
      ),
      angle(
        "食品污染來源",
        "Salmonella 在家禽、蛋品與加工食品中的污染來源與風險控制",
        "可研究 poultry、eggs、meat、交叉污染與食品安全標準。",
        ["沙門氏菌 家禽 蛋品 食品污染", "沙門氏菌 食品安全 交叉污染"],
        [
          "Salmonella poultry eggs food contamination",
          "Salmonella food safety cross contamination prevention",
        ],
        FOODBORNE_SOURCE_TYPES,
      ),
      angle(
        "預防與監測",
        "Salmonella 食源性疾病的預防、爆發調查與公共衛生監測",
        "可查 outbreak investigation、監測資料、烹調保存與政策建議。",
        ["沙門氏菌 爆發調查 預防 監測", "沙門氏菌 食源性疾病 公共衛生"],
        [
          "Salmonella outbreak investigation surveillance prevention",
          "salmonellosis foodborne disease public health monitoring",
        ],
        FOODBORNE_SOURCE_TYPES,
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

function topicDetailTokens(topic: string): string[] {
  return unique(
    topic
      .split(/[\s，,。；;：:、！？!?（）()「」"'`]+|的|與|和|及|在|中|之|用|對|或/g)
      .map((term) => term.trim())
      .filter((term) => {
        if (!term) return false;
        if (/^[A-Za-z]+$/.test(term)) return term.length >= 3;
        return Array.from(term).length >= 2;
      }),
  );
}

function entryBaseTerms(entry: TopicLexiconEntry): string[] {
  return unique([
    entry.canonicalName,
    ...entry.aliases,
    ...entry.englishNames,
    ...(entry.scientificNames ?? []),
  ]);
}

function detailTopicForEntry(
  topic: string,
  entry: TopicLexiconEntry,
): string {
  const stripped = entryBaseTerms(entry).reduce((current, term) => {
    if (!term) return current;
    if (/[A-Za-z]/.test(term)) {
      const escaped = normalizeAscii(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return normalizeAscii(current).replace(new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "gi"), " ");
    }
    return current.split(term).join(" ");
  }, topic);
  return normalizeTopicText(stripped.replace(/[，,。；;：:、]/g, " "));
}

function isSpecificResearchTopicForEntry(
  topic: string,
  entry: TopicLexiconEntry,
): boolean {
  if (hasSpecificResearchCue(topic)) return true;
  const detailTopic = detailTopicForEntry(topic, entry);
  if (!detailTopic) return false;
  if (normalizeTopicText(detailTopic) === normalizeTopicText(topic)) return false;
  return topicDetailTokens(detailTopic).length >= 2 || Array.from(detailTopic).length >= 6;
}

function scoreResearchAngleForTopic(
  topic: string,
  angle: TopicResearchAngle,
): number {
  const normalizedTopic = normalizeTopicText(topic);
  const normalizedQuestion = normalizeTopicText(angle.researchQuestion);
  if (normalizedTopic === normalizedQuestion) {
    return 10_000;
  }

  const topicTokens = topicDetailTokens(normalizedTopic);
  const angleText = [
    angle.label,
    angle.researchQuestion,
    angle.whyResearchable,
    ...angle.zhQueries,
    ...angle.enQueries,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const token of topicTokens) {
    const normalizedToken = token.toLowerCase();
    if (angleText.includes(normalizedToken)) {
      score += /[A-Za-z]/.test(token) ? 2 : 3;
    }
  }
  if (
    normalizedQuestion.includes(normalizedTopic) ||
    normalizedTopic.includes(normalizedQuestion)
  ) {
    score += 50;
  }
  return score;
}

function focusedResearchAnglesForEntry(
  topic: string,
  entry: TopicLexiconEntry,
): TopicResearchAngle[] {
  const rankedAngles = entry.researchAngles
    .map((researchAngle) => ({
      researchAngle,
      score: scoreResearchAngleForTopic(topic, researchAngle),
    }))
    .sort((left, right) => right.score - left.score);

  const bestScore = rankedAngles[0]?.score ?? 0;
  if (bestScore <= 0) {
    return entry.researchAngles;
  }
  if (bestScore >= 10_000) {
    return [rankedAngles[0]!.researchAngle];
  }
  return rankedAngles
    .filter((item, index) => item.score > 0 && (index === 0 || item.score >= bestScore - 2))
    .slice(0, 2)
    .map((item) => item.researchAngle);
}

function englishHintTerms(topic: string): string[] {
  const normalized = normalizeTopicText(topic);
  if (!normalized) return [];
  const hints = ENGLISH_TOPIC_HINTS.flatMap((hint) =>
    hint.pattern.test(normalized) ? hint.englishTerms : [],
  );
  return unique(hints);
}

function isUnknownOrNoise(topic: string): boolean {
  const normalized = normalizeTopicText(topic);
  if (!normalized) return true;
  if (/^[^A-Za-z\u3400-\u9fff0-9]+$/.test(normalized)) return true;
  if (Array.from(normalized).length <= 1 && !/[A-Za-z]{2,}/.test(normalized))
    return true;
  const normalizedAscii = normalizeAscii(normalized);
  if (
    /^(ai|dna|rna|co2|pm2\.5|5g|gpt\d*|python\d*)$/i.test(normalizedAscii)
  ) {
    return false;
  }
  if (
    /^[a-z0-9]+$/.test(normalizedAscii) &&
    /[a-z]/.test(normalizedAscii) &&
    /\d/.test(normalizedAscii) &&
    normalizedAscii.length >= 6
  ) {
    return true;
  }
  if (/^[a-z]{6,10}$/i.test(normalizedAscii)) {
    const repeatedChunk = /(..).*\1/i.test(normalizedAscii);
    const hardEnding = /[bcdfghjklmnpqrstvwxyz]{2}$/i.test(normalizedAscii);
    const uncommonCluster = /(wc|cb|qb|qg|qk|qv|vx|xq|zx)/i.test(normalizedAscii);
    if (hardEnding && (repeatedChunk || uncommonCluster)) {
      return true;
    }
  }
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
  if (/thixotropy|rheology|non-newtonian fluid/.test(text))
    return "materials_design";
  if (/exclave|enclave|territorial discontinuity|border geography/.test(text))
    return "history_culture";
  if (/telomerase|telomere|cellular senescence/.test(text))
    return "health";
  if (/唐吉訶德|唐吉柯德|quixote|cervantes|文學|小說|literature|novel|spanish golden age/.test(text))
    return "history_culture";
  if (/恐龍|dinosaur|paleontology|fossil|jurassic|cretaceous|中生代|古生物|化石/.test(text))
    return "biology";
  if (/羊駝|alpaca|camelid|vicugna pacos|駱馬/.test(text))
    return "animal_science";
  if (/無尾熊|樹袋熊|koala|phascolarctos|蛤蜊|文蛤|clam|bivalve|鱷魚|crocodile|alligator|烏龜|海龜|陸龜|turtle|tortoise|chelonian|testudines/.test(text))
    return "biology";
  if (/手機|智慧型手機|行動電話|smartphone|mobile phone|cell phone|screen time/.test(text))
    return "social_science";
  if (/微塑膠|塑膠微粒|塑膠污染|microplastic|microplastics|plastic pollution/.test(text))
    return "environment";
  if (/salmonella|salmonellosis|foodborne|food poisoning|pathogen|infection|outbreak|沙門氏(?:桿)?菌|食物中毒|食源性疾病/.test(text))
    return "health";
  if (/半導體|晶圓|晶片|台積電|供應鏈|semiconductor|foundry|tsmc|wafer|chip supply chain/.test(text))
    return "technology";
  if (/飛機|飛航器|固定翼飛機|客機|airplane|aircraft|aeroplane|aviation|直升機|旋翼機|直升飛機|helicopter|rotorcraft|air ambulance/.test(text))
    return "technology";
  if (/車|汽車|電動車|品牌|市場|競爭|brand|automotive|vehicle|car/.test(text))
    return "automotive_business";
  if (/賓士|mercedes|benz|bmw|寶馬|寶士|audi|tesla|汽車品牌/.test(text))
    return "automotive_business";
  if (/吉他|音樂|樂器|guitar|music|instrument/.test(text))
    return "music_culture";
  if (/水壺|水瓶|保溫瓶|bottle|kettle/.test(text))
    return "household_safety";
  if (/蛋|雞蛋|雞腿|雞肉|鱈魚|營養|食品|食物|飲食|egg|food|nutrition|chicken thigh|chicken leg|poultry|cod|atlantic cod|gadus morhua/.test(text))
    return "food_nutrition";
  if (/青椒|甜椒|辣椒|花椒|青花椒|pepper|chili|capsicum|bell pepper/.test(text))
    return "food_nutrition";
  if (/動物|生態|animal|ecology|biology/.test(text)) return "biology";
  if (/健康|醫學|疾病|health|medical|disease/.test(text)) return "health";
  if (/科技|ai|演算法|technology|software|火箭|rocket|propulsion|aerospace/.test(text))
    return "technology";
  if (/環境|永續|氣候|environment|climate|sustainability/.test(text))
    return "environment";
  if (/歷史|文化|社會|history|culture|social/.test(text))
    return "history_culture";
  return "general_research";
}

function applyCanonicalEnglishTopic(
  angles: TopicResearchAngle[],
  zhTopic: string,
  canonicalEnglishTopic: string,
): TopicResearchAngle[] {
  if (!canonicalEnglishTopic || !/[A-Za-z]/.test(canonicalEnglishTopic)) {
    return angles;
  }
  return angles.map((angle) => ({
    ...angle,
    enQueries: angle.enQueries.map((query) =>
      query.includes(zhTopic) ? query.split(zhTopic).join(canonicalEnglishTopic) : query,
    ),
  }));
}

function compactEnglishConcepts(queries: string[]): string[] {
  const lowWeight = new Set([
    "definition",
    "scope",
    "evidence",
    "research",
    "case",
    "study",
    "dataset",
    "comparison",
    "differences",
    "population",
    "time",
    "measurable",
    "indicators",
    "topic",
  ]);
  return unique(
    queries.flatMap((query) => {
      const cleaned = query
        .replace(/[^A-Za-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term && !lowWeight.has(term.toLowerCase()));
      if (cleaned.length === 0) return [];
      return [cleaned.slice(0, 5).join(" ")];
    }),
  );
}

function canonicalEnglishTopicFor(input: {
  normalizedTopic: string;
  language: TopicLanguage;
  topicKind: TopicKind;
  englishTerms: string[];
  scientificNames: string[];
}): string {
  if (input.topicKind === "unknown_or_noise") return "";
  if (input.englishTerms.length > 0) return input.englishTerms[0]!;
  if (input.scientificNames.length > 0) return input.scientificNames[0]!;
  if (
    (input.language === "en" || input.language === "mixed") &&
    /[A-Za-z]/.test(input.normalizedTopic)
  ) {
    return input.normalizedTopic;
  }
  return "";
}

function searchQueriesFromAngles(angles: TopicResearchAngle[]): TopicQueryPlan {
  return {
    zh: unique(angles.flatMap((angle) => angle.zhQueries)).slice(0, 10),
    en: unique(angles.flatMap((angle) => angle.enQueries)).slice(0, 10),
  };
}


function genericAngles(
  topic: string,
  domain: TopicDomain,
  canonicalEnglishTopic = "",
): TopicResearchAngle[] {
  const t = normalizeTopicText(topic) || "研究主題";
  const finalize = (angles: TopicResearchAngle[]): TopicResearchAngle[] =>
    applyCanonicalEnglishTopic(angles, t, canonicalEnglishTopic);
  if (domain === "automotive_business") {
    return finalize([
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
    ]);
  }
  if (domain === "music_culture") {
    return finalize([
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
    ]);
  }
  if (domain === "food_nutrition" || domain === "beverage_health") {
    if (/青椒|甜椒|辣椒|花椒|青花椒|pepper|chili|capsicum/.test(normalizeAscii(topic) + " " + topic)) {
      return finalize([
        angle(
          "營養與健康",
          `${t}的營養成分與健康影響`,
          "可比較維生素、植化素、辛香成分與健康討論。",
          [`${t} 營養 健康`, `${t} 成分 分析`],
          [`${t} nutrition health effects`, `${t} ingredient analysis`],
          FOOD_SOURCE_TYPES,
        ),
        angle(
          "栽培與產地",
          `${t}的栽培條件、產地與農業管理`,
          "可研究氣候、病蟲害、品種與產銷。",
          [`${t} 栽培 產地 農業管理`, `${t} 病蟲害 品種`],
          [`${t} cultivation origin agricultural management`, `${t} pests variety`],
          ["農業資料", "產銷資料", "作物研究"],
        ),
        angle(
          "飲食文化",
          `${t}在料理與飲食文化中的角色`,
          "可查地方菜系、調味用途與文化差異。",
          [`${t} 料理 飲食文化`, `${t} 川菜 地方飲食`],
          [`${t} culinary culture cuisine role`, `${t} regional food culture`],
          ["文化研究", "飲食研究", "地方資料"],
        ),
      ]);
    }
    return finalize([
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
    ]);
  }
  if (domain === "technology" && /火箭|rocket|propulsion|aerospace/.test(normalizeAscii(topic) + " " + topic)) {
    return finalize([
      angle(
        "推進原理",
        `${t}的推進原理與物理基礎`,
        "可研究牛頓第三運動定律、推力、質量與加速度。",
        [`${t} 推進 原理 物理`, `${t} 牛頓第三定律`],
        [`${t} propulsion physics Newton's third law`, `${t} thrust mass acceleration`],
        ["物理研究", "工程資料", "科普或課程資料"],
      ),
      angle(
        "燃料與引擎",
        `${t}的燃料、引擎類型與性能比較`,
        "可比較液體、固體與混合推進系統。",
        [`${t} 燃料 引擎 類型`, `${t} 推進系統 比較`],
        [`${t} fuel engine type comparison`, `${t} propulsion system performance`],
        ["工程資料", "航太研究", "產業資料"],
      ),
      angle(
        "任務與產業",
        `${t}的發射任務、軌道應用與產業競爭`,
        "可研究太空任務、商業航太與國際競爭。",
        [`${t} 發射 任務 軌道`, `${t} 航太 產業 競爭`],
        [`${t} launch mission orbit aerospace industry competition`],
        ["航太產業資料", "政策資料", "企業或機構資料"],
      ),
    ]);
  }
  if (domain === "household_safety" && /橡皮擦|eraser|rubber|橡皮/.test(normalizeAscii(topic) + " " + topic)) {
    return finalize([
      angle(
        "材料與原理",
        `${t}的材料組成與擦除原理`,
        "可研究橡膠、聚合物與紙面摩擦作用。",
        [`${t} 材料 組成 擦除 原理`, `${t} 物理 摩擦`],
        [`${t} material composition erasing principle`, `${t} friction paper graphite`],
        PRODUCT_SOURCE_TYPES,
      ),
      angle(
        "產品設計",
        `${t}的製造、產品設計與使用效果比較`,
        "可比較不同型號與用途的差異。",
        [`${t} 製造 設計 使用效果`, `${t} 不同類型 比較`],
        [`${t} manufacturing design performance comparison`, `${t} eraser types comparison`],
        ["產品研究", "材料研究", "消費者資料"],
      ),
      angle(
        "環境與衛生",
        `${t}碎屑、材料與環境影響`,
        "可討論碎屑、塑膠材料與廢棄物。",
        [`${t} 碎屑 環境 材料`, `${t} 廢棄物`],
        [`${t} debris environmental impact material waste`],
        ["環境研究", "產品生命週期", "廢棄物資料"],
      ),
    ]);
  }
  if (domain === "household_safety" || domain === "consumer_product") {
    return finalize([
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
    ]);
  }
  if (domain === "materials_design") {
    if (/觸變性|thixotropy|rheology|non-newtonian fluid/.test(normalizeAscii(topic) + " " + topic)) {
      return finalize([
        angle(
          "流變機制",
          `${t}在剪切、靜置與微觀結構重組下的流變機制`,
          "可研究剪切變稀、結構破壞與恢復時間，建立材料行為模型。",
          [`${t} 流變 剪切變稀 結構重組`, `${t} 黏度 恢復 微觀結構`],
          [
            `${t} rheology shear thinning microstructure rebuilding`,
            `${t} viscosity recovery structural breakdown`,
          ],
          ["流變研究", "材料科學論文", "工程測試資料"],
        ),
        angle(
          "量測方法",
          `${t}如何用流變儀、滯回曲線與可重現指標量測`,
          "可比較黏度回復、剪切循環、觸變環面積與測試條件設計。",
          [`${t} 流變儀 量測 指標`, `${t} 剪切循環 滯回曲線`],
          [
            `${t} rheometer measurement hysteresis loop`,
            `${t} shear cycle test measurable indicators`,
          ],
          ["實驗方法論文", "儀器手冊", "工程標準"],
        ),
        angle(
          "配方應用",
          `${t}在塗料、膠體、3D 列印漿料或藥膏配方中的應用`,
          "可研究添加劑、分散系統與製程條件如何影響施工性與穩定性。",
          [`${t} 塗料 膠體 3D列印漿料`, `${t} 添加劑 配方 穩定性`],
          [
            `${t} coatings colloids 3D printing paste`,
            `${t} formulation additives stability application`,
          ],
          ["材料應用研究", "產業技術資料", "配方工程研究"],
        ),
      ]);
    }
    return finalize([
      angle(
        "材料機制",
        `${t}的材料特性、微觀結構與形成機制`,
        "可查材料結構、加工條件與性能形成原因。",
        [`${t} 材料特性 微觀結構 機制`, `${t} 加工條件 性能`],
        [`${t} material properties microstructure mechanism`, `${t} processing conditions performance`],
        ["材料研究", "工程論文", "技術資料"],
      ),
      angle(
        "量測評估",
        `${t}可以如何量測、建模與比較性能指標`,
        "可比較實驗方法、量化指標、誤差來源與模型適用範圍。",
        [`${t} 量測 建模 性能指標`, `${t} 實驗方法 比較`],
        [`${t} measurement modeling performance indicators`, `${t} experimental methods comparison`],
        ["實驗研究", "方法論文", "工程標準"],
      ),
      angle(
        "設計應用",
        `${t}如何影響產品設計、製程控制與應用場景`,
        "可從配方設計、可製造性與使用情境切入。",
        [`${t} 產品設計 製程控制 應用`, `${t} 配方 可製造性`],
        [`${t} product design process control application`, `${t} formulation manufacturability`],
        ["材料應用研究", "產業技術資料", "設計研究"],
      ),
    ]);
  }
  if (domain === "biology" || domain === "animal_science") {
    return finalize([
      angle(
        "棲地與族群",
        `${t}的棲地需求、族群分布與環境壓力`,
        "可查生態調查、保育資料、族群監測與棲地變化。",
        [`${t} 棲地 族群 分布`, `${t} 生態 保育`],
        [`${t} habitat population ecology`, `${t} conservation distribution`],
        ["生態研究", "保育機構資料", "自然史資料"],
      ),
      angle(
        "行為與適應",
        `${t}的行為、食性與生存適應`,
        "可比較食性、繁殖、移動、避敵或生理適應。",
        [`${t} 行為 食性 適應`, `${t} 繁殖 生態`],
        [`${t} behavior diet adaptation`, `${t} reproduction ecology`],
        ["動物行為研究", "生態論文", "物種資料庫"],
      ),
      angle(
        "人為影響",
        `${t}面臨的人為干擾、疾病或保育管理`,
        "可查土地利用、污染、疾病、獵捕與保育政策。",
        [`${t} 人為干擾 疾病 保育`, `${t} 保育 管理`],
        [`${t} human impact disease conservation management`],
        ["保育報告", "政府或機構資料", "學術研究"],
      ),
    ]);
  }
  if (domain === "technology") {
    return finalize([
      angle(
        "技術架構",
        `${t}的核心技術、關鍵元件與製程瓶頸`,
        "可查技術白皮書、產業報告與工程研究。",
        [`${t} 核心技術 關鍵元件`, `${t} 製程 瓶頸`],
        [`${t} core technology key components`, `${t} manufacturing bottlenecks`],
        ["技術白皮書", "產業報告", "工程研究"],
      ),
      angle(
        "供應鏈與市場",
        `${t}的供應鏈角色、主要廠商與市場變化`,
        "可比較企業年報、產業統計、上下游供應鏈與投資趨勢。",
        [`${t} 供應鏈 主要廠商 市場`, `${t} 產業 趨勢`],
        [`${t} supply chain companies market`, `${t} industry trend`],
        ["企業年報", "市場研究", "政府或機構資料"],
      ),
      angle(
        "風險治理",
        `${t}的地緣政治、資安、韌性或政策風險`,
        "可查政策報告、出口管制、供應鏈韌性與標準。",
        [`${t} 地緣政治 風險 韌性`, `${t} 政策 標準`],
        [`${t} geopolitical risk resilience policy`, `${t} regulation standards`],
        ["政策報告", "國際機構資料", "產業分析"],
      ),
    ]);
  }
  if (domain === "health") {
    return finalize([
      angle(
        "暴露與機制",
        `${t}的暴露途徑、作用機制與可測量指標`,
        "可查流行病學、臨床研究與公共衛生資料。",
        [`${t} 暴露 作用機制 指標`, `${t} 健康 研究`],
        [`${t} exposure mechanism biomarkers`, `${t} health study`],
        ["醫學研究", "公共衛生資料", "系統性回顧"],
      ),
      angle(
        "族群差異",
        `${t}對不同族群或年齡層的影響差異`,
        "可比較樣本、年齡、性別、生活型態與風險因素。",
        [`${t} 族群 差異 風險因素`, `${t} 青少年 成人 比較`],
        [`${t} population differences risk factors`, `${t} adolescents adults comparison`],
        ["流行病學研究", "臨床資料", "公共衛生報告"],
      ),
      angle(
        "介入與建議",
        `${t}的預防、介入或健康建議`,
        "可查臨床指引、教育介入與政策建議。",
        [`${t} 預防 介入 建議`, `${t} 指引 政策`],
        [`${t} prevention intervention guideline`, `${t} policy recommendation`],
        ["臨床指引", "公共衛生政策", "介入研究"],
      ),
    ]);
  }
  if (domain === "environment") {
    return finalize([
      angle(
        "來源與傳輸",
        `${t}的污染來源、傳輸路徑與環境分布`,
        "可查監測資料、環境採樣與污染物來源研究。",
        [`${t} 來源 傳輸 環境分布`, `${t} 監測 採樣`],
        [`${t} sources transport environmental distribution`, `${t} monitoring sampling`],
        ["環境監測", "污染研究", "政府或機構資料"],
      ),
      angle(
        "生態影響",
        `${t}對生物、食物網或生態系功能的影響`,
        "可查生態毒理、風險評估與長期觀測研究。",
        [`${t} 生態影響 生物 食物網`, `${t} 生態風險`],
        [`${t} ecological effects organisms food web`, `${t} ecological risk`],
        ["生態毒理研究", "系統性回顧", "風險評估"],
      ),
      angle(
        "治理策略",
        `${t}的減量、監測與政策治理策略`,
        "可比較法規、技術、回收、教育與國際治理。",
        [`${t} 減量 監測 政策`, `${t} 治理 策略`],
        [`${t} mitigation monitoring policy`, `${t} governance strategy`],
        ["政策報告", "國際機構資料", "治理案例"],
      ),
    ]);
  }
  if (domain === "history_culture") {
    return finalize([
      angle(
        "文本與脈絡",
        `${t}的文本內容、歷史背景與文化脈絡`,
        "可查原典、學術評論、歷史資料與文化研究。",
        [`${t} 文本 歷史背景 文化脈絡`, `${t} 主題 分析`],
        [`${t} textual analysis historical context`, `${t} cultural interpretation`],
        ["專書", "期刊論文", "歷史或文化資料"],
      ),
      angle(
        "詮釋差異",
        `${t}在不同時代、地區或群體中的詮釋差異`,
        "可比較評論、翻譯、改編、教育使用與接受史。",
        [`${t} 詮釋 接受史 改編`, `${t} 翻譯 評論`],
        [`${t} reception history adaptation`, `${t} interpretation criticism`],
        ["文化研究", "比較文學", "評論資料"],
      ),
      angle(
        "影響與傳播",
        `${t}的傳播路徑、社會影響與當代意義`,
        "可查媒體、教育、出版、展演與公共討論資料。",
        [`${t} 傳播 社會影響 當代意義`, `${t} 教育 媒體`],
        [`${t} influence dissemination contemporary relevance`],
        ["媒體資料", "教育研究", "文化史資料"],
      ),
    ]);
  }
  return finalize([
    angle(
      "概念界定",
      `${t}的核心概念、範圍界線與可驗證資料`,
      "此為保守規則方向；建議先確認研究對象、地區、時間或比較對象。",
      [`${t} 定義 範圍 資料`, `${t} 可驗證 指標`],
      [`${t} definition scope evidence`, `${t} measurable indicators`],
      ["百科資料", "政府或機構資料", "學術資料庫"],
    ),
    angle(
      "證據路徑",
      `${t}可以用哪些指標、案例或資料集交叉驗證`,
      "可用統計、案例、專家機構資料或研究論文建立證據鏈。",
      [`${t} 指標 案例 資料集`, `${t} 研究 證據`],
      [`${t} indicators case study dataset`, `${t} evidence research`],
      ["實證研究", "統計資料", "案例資料"],
    ),
    angle(
      "比較問題",
      `${t}在不同情境、族群或時間下的差異比較`,
      "若題目仍偏廣，可先用比較對象縮小搜尋範圍。",
      [`${t} 比較 情境 差異`, `${t} 族群 時間 比較`],
      [`${t} comparison context differences`, `${t} population time comparison`],
      ["實務案例", "機構資料", "研究論文"],
    ),
  ]);
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
  const englishTerms = unique(input.englishTerms ?? []);
  const scientificNames = unique(input.scientificNames ?? []);
  const canonicalEnglishTopic = canonicalEnglishTopicFor({
    normalizedTopic: input.normalizedTopic,
    language: input.language,
    topicKind: input.topicKind,
    englishTerms,
    scientificNames,
  });
  const searchQueries = searchQueriesFromAngles(researchAngles);
  const coreConcepts = unique([
    canonicalEnglishTopic,
    ...englishTerms,
    ...scientificNames,
    ...compactEnglishConcepts(searchQueries.en),
  ]).slice(0, 8);
  return {
    originalTopic: input.topic,
    normalizedTopic: input.normalizedTopic,
    language: input.language,
    topicKind: input.topicKind,
    domain: input.domain,
    canonicalEnglishTopic,
    canonicalTerms: unique(input.canonicalTerms),
    aliases: unique(input.aliases ?? []),
    englishTerms,
    scientificNames,
    coreConcepts,
    searchQueries,
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
  const englishHints = englishHintTerms(normalizedTopic);
  const domainHintText = [normalizedTopic, ...englishHints].join(" ").trim();

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
  const specificResearchTopic = entry
    ? isSpecificResearchTopicForEntry(normalizedTopic, entry)
    : hasSpecificResearchCue(normalizedTopic);

  if (entry) {
    const entity = entityFromEntry(entry);
    const focusedAngles = specificResearchTopic
      ? focusedResearchAnglesForEntry(normalizedTopic, entry)
      : entry.researchAngles;
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
      canonicalTerms: specificResearchTopic
        ? [normalizedTopic, entry.canonicalName]
        : [entry.canonicalName],
      aliases: entry.aliases,
      englishTerms: unique([...entry.englishNames, ...englishHints]),
      scientificNames: entry.scientificNames ?? [],
      excludedMeanings: entry.excludedMeanings ?? [],
      shouldSearchNow: specificResearchTopic,
      needsClarification: !specificResearchTopic,
      researchAngles: focusedAngles,
      entity,
    });
  }

  if (specificResearchTopic && !isGenericTemplateTopic(normalizedTopic)) {
    const domain = patternDomain(domainHintText || normalizedTopic);
    return buildUnderstanding({
      topic,
      normalizedTopic,
      language,
      topicKind: "specific_research_topic",
      domain,
      canonicalTerms: [normalizedTopic],
      englishTerms: englishHints,
      shouldSearchNow: true,
      needsClarification: false,
      researchAngles: genericAngles(
        normalizedTopic,
        domain,
        englishHints[0] ?? "",
      ),
    });
  }

  if (isLikelyBroadCommonNoun(normalizedTopic) || isGenericTemplateTopic(normalizedTopic)) {
    const domain = patternDomain(domainHintText || normalizedTopic);
    return buildUnderstanding({
      topic,
      normalizedTopic: `${normalizedTopic}的可研究方向`,
      language,
      topicKind: "broad_common_noun",
      domain,
      canonicalTerms: [normalizedTopic],
      englishTerms: englishHints,
      shouldSearchNow: false,
      needsClarification: true,
      researchAngles: genericAngles(
        normalizedTopic,
        domain,
        englishHints[0] ?? "",
      ),
    });
  }

  const domain = patternDomain(domainHintText || normalizedTopic);
  return buildUnderstanding({
    topic,
    normalizedTopic,
    language,
    topicKind: "ambiguous",
    domain,
    canonicalTerms: [normalizedTopic],
    englishTerms: englishHints,
    shouldSearchNow: false,
    needsClarification: true,
    researchAngles: genericAngles(
      normalizedTopic,
      domain,
      englishHints[0] ?? "",
    ),
  });
}
