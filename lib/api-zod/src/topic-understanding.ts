export type TopicLanguage = "zh" | "en" | "mixed" | "unknown";

export type TopicKind =
  | "specific_research_topic"
  | "known_entity"
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
  | "unknown";

export interface TopicClarificationCard {
  label: string;
  suggestedTopic: string;
  description: string;
  zhQueries: string[];
  enQueries: string[];
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
  entity?: TopicEntityInfo;
  shouldSearchImmediately: boolean;
  needsClarification: boolean;
  clarificationCards: TopicClarificationCard[];
  excludedDriftTerms: string[];
}

interface EntityLexiconEntry extends TopicEntityInfo {
  matchTerms: string[];
  excludedDriftTerms?: string[];
}

const COMMON_RESEARCH_CUES = [
  /影響|關係|比較|分析|研究|探討|成因|原因|風險|管理|應用|角色|作用|現況|趨勢|機制|差異|攝取|福利|飼養|行為|健康|安全|實驗|模型|醫學|營養|消費|包裝|供應鏈/,
  /effect|impact|relationship|comparison|analysis|study|research|review|risk|management|application|role|mechanism|trend|welfare|husbandry|behavior|behaviour|health|safety|experiment|animal model|biomedical|nutrition|consumer|packaging|supply chain/i,
];

const SPECIFIC_PATTERN_CUES = [
  /對.+的影響/,
  /作為.+在.+中的/,
  /如何/,
  /是否/,
  /與.+的關係/,
  /in .+ research/i,
  /for .+ research/i,
];

const ENTITY_LEXICON: EntityLexiconEntry[] = [
  {
    canonicalName: "天竺鼠",
    aliases: ["豚鼠", "荷蘭豬"],
    englishNames: ["guinea pig"],
    scientificNames: ["Cavia porcellus"],
    category: "animal",
    matchTerms: ["天竺鼠", "豚鼠", "荷蘭豬", "guinea pig", "cavia porcellus"],
    excludedDriftTerms: [
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
  },
  {
    canonicalName: "薯條",
    aliases: ["炸薯條", "馬鈴薯條"],
    englishNames: ["French fries", "fries"],
    category: "food",
    matchTerms: [
      "薯條",
      "炸薯條",
      "馬鈴薯條",
      "french fries",
      "fries",
    ],
  },
  {
    canonicalName: "泡泡",
    aliases: ["氣泡", "肥皂泡"],
    englishNames: ["bubble", "soap bubble"],
    category: "unknown",
    matchTerms: ["泡泡", "氣泡", "肥皂泡", "bubble", "soap bubble"],
  },
  {
    canonicalName: "水餃",
    aliases: ["餃子"],
    englishNames: ["dumpling"],
    category: "food",
    matchTerms: ["水餃", "餃子", "dumpling", "jiaozi"],
  },
  {
    canonicalName: "可樂",
    aliases: ["碳酸飲料"],
    englishNames: ["cola", "soft drink"],
    category: "food",
    matchTerms: ["可樂", "碳酸飲料", "cola", "soft drink", "soda"],
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
  if (Array.from(normalized).length <= 1) return true;
  return false;
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

function lexiconEntryForTopic(topic: string): EntityLexiconEntry | undefined {
  const normalizedTopic = normalizeTopicText(topic);
  const normalizedAsciiTopic = normalizeAscii(topic);
  return ENTITY_LEXICON
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

export function entitySearchTerms(entity: TopicEntityInfo | undefined): string[] {
  if (!entity) return [];
  return unique([
    entity.canonicalName,
    ...entity.aliases,
    ...entity.englishNames,
    ...(entity.scientificNames ?? []),
  ]);
}

function friesClarificationCards(): TopicClarificationCard[] {
  return [
    {
      label: "營養標示",
      suggestedTopic: "速食薯條的營養成分與鈉含量分析",
      description: "可比較熱量、脂肪、鈉含量與份量差異。",
      zhQueries: ["薯條 營養成分 鈉含量", "速食薯條 熱量 脂肪"],
      enQueries: [
        "french fries nutrition sodium calories",
        "fast food french fries nutrition label",
      ],
    },
    {
      label: "食品安全",
      suggestedTopic: "油炸方式與薯條食品安全風險",
      description: "可討論油炸溫度、用油品質與丙烯醯胺。",
      zhQueries: ["薯條 油炸 丙烯醯胺 食品安全", "炸薯條 用油品質 健康風險"],
      enQueries: [
        "french fries acrylamide food safety",
        "fried potato acrylamide frying temperature oil quality",
      ],
    },
    {
      label: "飲食行為",
      suggestedTopic: "青少年速食薯條攝取與飲食習慣",
      description: "可分析外食、速食配餐與青少年飲食習慣。",
      zhQueries: ["青少年 薯條 速食 飲食習慣", "速食薯條 外食 健康影響"],
      enQueries: [
        "adolescents french fries fast food dietary habits",
        "fast food french fries health adolescents",
      ],
    },
    {
      label: "環境負荷",
      suggestedTopic: "薯條包裝與速食供應鏈的環境負荷",
      description: "可從冷凍馬鈴薯、包裝與廢棄物切入。",
      zhQueries: ["薯條 包裝 供應鏈 環境", "冷凍馬鈴薯 製品 環境負荷"],
      enQueries: [
        "frozen potato products life cycle assessment",
        "french fries packaging waste",
      ],
    },
  ];
}

function bubbleClarificationCards(): TopicClarificationCard[] {
  return [
    {
      label: "表面張力",
      suggestedTopic: "泡泡的表面張力與物理原理",
      description: "可研究液膜穩定性、表面張力與破裂條件。",
      zhQueries: ["泡泡 表面張力 物理原理", "肥皂泡 液膜 穩定性"],
      enQueries: [
        "bubble surface tension physics",
        "soap bubble film stability surface tension",
      ],
    },
    {
      label: "光學干涉",
      suggestedTopic: "肥皂泡在光學干涉中的應用",
      description: "可研究薄膜干涉、顏色變化與光學現象。",
      zhQueries: ["肥皂泡 光學干涉 薄膜", "泡泡 顏色 反射 干涉"],
      enQueries: [
        "soap bubble optical interference thin film",
        "bubble color interference optics",
      ],
    },
    {
      label: "幼兒學習",
      suggestedTopic: "泡泡遊戲對幼兒感官學習的影響",
      description: "可研究視覺追蹤、感官刺激與互動式學習。",
      zhQueries: ["泡泡遊戲 幼兒 感官學習", "氣泡 遊戲 幼兒 視覺追蹤"],
      enQueries: [
        "bubble play sensory learning preschool children",
        "bubble game visual tracking early childhood learning",
      ],
    },
    {
      label: "材料應用",
      suggestedTopic: "氣泡材料在食品或醫療中的應用",
      description: "可研究發泡材料、微氣泡與食品或醫療工程應用。",
      zhQueries: ["氣泡材料 食品 應用", "微氣泡 醫療 材料"],
      enQueries: [
        "bubble materials food application",
        "microbubble medical materials application",
      ],
    },
  ];
}

function guineaPigClarificationCards(): TopicClarificationCard[] {
  return [
    {
      label: "實驗動物",
      suggestedTopic: "天竺鼠作為實驗動物在醫學研究中的應用",
      description: "可研究天竺鼠在免疫、過敏、聽覺或藥物測試中的角色。",
      zhQueries: ["天竺鼠 實驗動物 醫學研究", "豚鼠 過敏 免疫 研究"],
      enQueries: [
        "guinea pig animal model biomedical research",
        "Cavia porcellus allergy immunology research",
        "guinea pig hearing research",
        "guinea pig laboratory animal",
      ],
    },
    {
      label: "飼養健康",
      suggestedTopic: "天竺鼠的飼養環境與健康管理",
      description: "可研究飲食、維生素 C、籠舍環境與常見疾病。",
      zhQueries: ["天竺鼠 飼養 健康 管理", "豚鼠 維生素C 疾病"],
      enQueries: [
        "guinea pig husbandry health management",
        "Cavia porcellus vitamin C deficiency disease",
      ],
    },
    {
      label: "動物行為",
      suggestedTopic: "天竺鼠的社會行為與動物福利",
      description: "可研究群居、叫聲、壓力、環境豐富化與動物福利。",
      zhQueries: ["天竺鼠 社會行為 動物福利", "豚鼠 壓力 行為"],
      enQueries: [
        "guinea pig social behavior animal welfare",
        "Cavia porcellus stress behavior enrichment",
      ],
    },
  ];
}

function dumplingClarificationCards(): TopicClarificationCard[] {
  return [
    {
      label: "飲食文化",
      suggestedTopic: "水餃在台灣飲食文化中的演變",
      description: "可追查家常料理、節慶與地方飲食脈絡。",
      zhQueries: ["水餃 台灣 飲食文化", "餃子 家庭飲食 文化"],
      enQueries: [
        "dumpling Taiwanese food culture",
        "jiaozi household food culture Taiwan",
      ],
    },
    {
      label: "營養標示",
      suggestedTopic: "冷凍水餃與現包水餃的營養差異",
      description: "可比較營養標示、鈉含量與加工差異。",
      zhQueries: ["冷凍水餃 現包水餃 營養差異", "水餃 鈉含量 食品標示"],
      enQueries: [
        "frozen dumpling fresh dumpling nutrition comparison",
        "dumpling sodium food labeling",
      ],
    },
    {
      label: "成分分析",
      suggestedTopic: "水餃內餡組成對熱量與營養的影響",
      description: "可分析豬肉、蔬菜、海鮮等內餡差異。",
      zhQueries: ["水餃內餡 熱量 脂肪 蛋白質", "水餃 成分 營養"],
      enQueries: [
        "dumpling filling calories fat protein",
        "dumpling ingredients nutrition",
      ],
    },
    {
      label: "健康風險",
      suggestedTopic: "市售冷凍水餃鈉含量與健康風險比較",
      description: "可分析鈉含量、攝取風險與品牌差異。",
      zhQueries: ["冷凍水餃 鈉含量 健康風險", "市售水餃 食品標示 比較"],
      enQueries: [
        "frozen dumpling sodium health risk",
        "dumpling food labeling consumer comparison",
      ],
    },
  ];
}

function colaClarificationCards(): TopicClarificationCard[] {
  return [
    {
      label: "健康影響",
      suggestedTopic: "可樂成分與青少年健康影響",
      description: "可研究糖分、咖啡因與含糖飲料攝取情境。",
      zhQueries: ["可樂 糖分 咖啡因 青少年 健康", "含糖飲料 健康影響"],
      enQueries: [
        "cola sugar caffeine adolescents health",
        "sugar sweetened beverage health effects youth",
      ],
    },
    {
      label: "成分比較",
      suggestedTopic: "無糖可樂與含糖可樂成分比較",
      description: "可比較甜味劑、咖啡因與熱量差異。",
      zhQueries: ["無糖可樂 含糖可樂 成分比較", "可樂 咖啡因 糖分 標示"],
      enQueries: [
        "diet cola regular cola ingredient comparison",
        "cola caffeine sugar nutrition label",
      ],
    },
    {
      label: "廣告與消費",
      suggestedTopic: "可樂品牌廣告如何影響消費偏好",
      description: "可研究品牌形象、廣告內容與消費心理。",
      zhQueries: ["可樂 品牌廣告 消費偏好", "可樂 行銷 消費心理"],
      enQueries: [
        "cola advertising consumer preference",
        "soft drink marketing consumer behavior",
      ],
    },
    {
      label: "環境",
      suggestedTopic: "可樂包裝與環境廢棄物問題",
      description: "可從塑膠瓶、鋁罐與回收制度切入。",
      zhQueries: ["可樂 包裝廢棄物 回收", "可樂 塑膠瓶 鋁罐 環境"],
      enQueries: [
        "cola packaging waste recycling",
        "soft drink plastic bottle aluminum can environmental impact",
      ],
    },
  ];
}

function clarificationCardsForEntry(
  entry: EntityLexiconEntry,
): TopicClarificationCard[] {
  switch (entry.canonicalName) {
    case "天竺鼠":
      return guineaPigClarificationCards();
    case "薯條":
      return friesClarificationCards();
    case "泡泡":
      return bubbleClarificationCards();
    case "水餃":
      return dumplingClarificationCards();
    case "可樂":
      return colaClarificationCards();
    default:
      return [];
  }
}

function normalizedTopicLabel(
  topic: string,
  entry: EntityLexiconEntry | undefined,
  specific: boolean,
): string {
  if (!entry) return normalizeTopicText(topic);
  if (specific) return normalizeTopicText(topic);
  const englishPart = entry.englishNames.length
    ? `（${entry.englishNames.join(" / ")}`
    : "";
  const scientificPart = entry.scientificNames?.length
    ? `${englishPart ? " / " : "（"}${entry.scientificNames.join(" / ")}`
    : "";
  const suffix = englishPart || scientificPart ? "）" : "";
  return `${entry.canonicalName}${englishPart}${scientificPart}${suffix}的研究方向`;
}

export function understandTopic(topic: string): TopicUnderstandingResult {
  const normalizedTopic = normalizeTopicText(topic);
  const language = detectLanguage(normalizedTopic);
  const entry = lexiconEntryForTopic(normalizedTopic);
  const specificResearchTopic = hasSpecificResearchCue(normalizedTopic);

  if (isUnknownOrNoise(normalizedTopic)) {
    return {
      originalTopic: topic,
      normalizedTopic,
      language,
      topicKind: "unknown_or_noise",
      shouldSearchImmediately: false,
      needsClarification: true,
      clarificationCards: [],
      excludedDriftTerms: [],
    };
  }

  if (entry) {
    const entity: TopicEntityInfo = {
      canonicalName: entry.canonicalName,
      aliases: entry.aliases,
      englishNames: entry.englishNames,
      scientificNames: entry.scientificNames,
      category: entry.category,
    };
    const clarificationCards = clarificationCardsForEntry(entry);
    const isSpecificTopic = specificResearchTopic;
    const needsClarification = !isSpecificTopic;
    return {
      originalTopic: topic,
      normalizedTopic: normalizedTopicLabel(
        normalizedTopic,
        entry,
        isSpecificTopic,
      ),
      language,
      topicKind: isSpecificTopic ? "specific_research_topic" : "known_entity",
      entity,
      shouldSearchImmediately: isSpecificTopic,
      needsClarification,
      clarificationCards,
      excludedDriftTerms: entry.excludedDriftTerms ?? [],
    };
  }

  if (specificResearchTopic) {
    return {
      originalTopic: topic,
      normalizedTopic,
      language,
      topicKind: "specific_research_topic",
      shouldSearchImmediately: true,
      needsClarification: false,
      clarificationCards: [],
      excludedDriftTerms: [],
    };
  }

  if (isLikelyBroadCommonNoun(normalizedTopic)) {
    return {
      originalTopic: topic,
      normalizedTopic,
      language,
      topicKind: "broad_common_noun",
      shouldSearchImmediately: false,
      needsClarification: true,
      clarificationCards: [],
      excludedDriftTerms: [],
    };
  }

  return {
    originalTopic: topic,
    normalizedTopic,
    language,
    topicKind: "ambiguous",
    shouldSearchImmediately: false,
    needsClarification: true,
    clarificationCards: [],
    excludedDriftTerms: [],
  };
}
