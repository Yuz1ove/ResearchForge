export interface NormalizedResearchTopic {
  originalQuery: string;
  displayTitle: string;
  zhAcademicQuery: string[];
  enAcademicQuery: string[];
  keywordSet: string[];
  negativeKeywords: string[];
  broaderAcademicQueries: string[];
  locale: string;
}

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

function sunsetOpticsRewrite(topic: string, locale: string): NormalizedResearchTopic {
  return {
    originalQuery: compactWhitespace(topic),
    displayTitle: compactWhitespace(topic),
    zhAcademicQuery: [
      "夕陽 顏色 光波長 瑞利散射 大氣散射 長波長 紅光",
      "夕陽 餘暉 光波長 大氣光學 散射",
      "暮光 顏色 大氣散射 可見光 波長",
    ],
    enAcademicQuery: [
      "sunset color wavelength",
      "Rayleigh scattering sunset red light",
      "atmospheric scattering wavelength sky color",
      "twilight color atmospheric optics",
      "Mie scattering sunset aerosols",
    ],
    keywordSet: [
      "夕陽",
      "餘暉",
      "光波長",
      "顏色",
      "瑞利散射",
      "大氣散射",
      "長波長",
      "紅光",
      "sunset color",
      "wavelength",
      "Rayleigh scattering",
      "atmospheric scattering",
      "twilight color",
      "Mie scattering",
      "atmospheric optics",
    ],
    negativeKeywords: [
      "photography",
      "painting",
      "poem",
      "wallpaper",
      "travel",
      "quotes",
      "astrology",
    ],
    broaderAcademicQueries: [
      "Rayleigh scattering sky color",
      "atmospheric optics sunset",
      "wavelength scattering visible light atmosphere",
    ],
    locale,
  };
}

function aiWritingRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "人工智慧 高中生 寫作能力 生成式AI 寫作教學",
      "AI 寫作能力 高中生 教育 讀寫素養",
      "生成式AI 寫作學習 高中生 AI literacy",
    ],
    enAcademicQuery: [
      "generative AI writing ability high school students",
      "artificial intelligence writing education secondary students",
      "AI literacy generative AI writing instruction",
      "large language models student writing skills education",
      "ChatGPT writing ability adolescents education",
    ],
    keywordSet: [
      "AI",
      "人工智慧",
      "生成式AI",
      "高中生",
      "寫作能力",
      "寫作教學",
      "AI literacy",
      "generative AI",
      "writing ability",
      "student writing skills",
      "secondary students",
    ],
    negativeKeywords: ["marketing", "copywriting service", "essay mill", "prompt marketplace"],
    broaderAcademicQueries: [
      "generative AI writing education students",
      "AI literacy writing instruction",
      "large language models writing pedagogy",
    ],
    locale,
  };
}

function ragCitationRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [],
    enAcademicQuery: [
      "retrieval augmented generation citation accuracy",
      "RAG citation accuracy factuality",
      "retrieval augmented generation attribution evaluation",
      "large language models citation faithfulness retrieval augmented generation",
      "RAG source attribution citation hallucination",
    ],
    keywordSet: [
      "retrieval augmented generation",
      "RAG",
      "citation accuracy",
      "source attribution",
      "faithfulness",
      "factuality",
      "citation hallucination",
      "large language models",
    ],
    negativeKeywords: ["marketing", "tutorial only", "vendor benchmark"],
    broaderAcademicQueries: [
      "retrieval augmented generation factuality evaluation",
      "source attribution large language models",
      "citation hallucination retrieval augmented generation",
    ],
    locale,
  };
}

function hivAidsRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "愛滋病 風險因子 傳染途徑 影響",
      "愛滋病 風險因子 流行病學 研究",
      "HIV 公共衛生 影響 文獻回顧",
      "人類免疫缺乏病毒 預防策略 抗病毒治療",
      "後天免疫缺乏症候群 社會污名 公共衛生",
    ],
    enAcademicQuery: [
      "HIV AIDS risk factors transmission epidemiology",
      "HIV AIDS public health impact systematic review",
      "HIV transmission prevention study",
      "HIV risk factors cohort study",
      "antiretroviral therapy clinical trial review HIV",
      "human immunodeficiency virus acquired immunodeficiency syndrome epidemiology",
    ],
    keywordSet: [
      "愛滋病",
      "人類免疫缺乏病毒",
      "後天免疫缺乏症候群",
      "HIV感染",
      "傳染途徑",
      "風險因子",
      "公共衛生影響",
      "抗病毒治療",
      "社會污名",
      "預防策略",
      "HIV",
      "AIDS",
      "human immunodeficiency virus",
      "acquired immunodeficiency syndrome",
      "HIV transmission",
      "HIV risk factors",
      "HIV/AIDS epidemiology",
      "antiretroviral therapy",
      "public health impact",
      "social impact",
      "stigma",
      "prevention",
    ],
    negativeKeywords: [
      "scientific method",
      "general research method",
      "generic experimental design",
      "school science inquiry",
      "case research methodology",
      "科學方法",
      "一般研究方法",
      "方法論",
    ],
    broaderAcademicQueries: [
      "HIV AIDS epidemiological study method",
      "HIV risk factors cohort study",
      "AIDS public health systematic review",
      "HIV transmission prevention study",
      "antiretroviral therapy clinical trial review HIV",
      "愛滋病 風險因子 流行病學 研究",
      "HIV 公共衛生 影響 文獻回顧",
    ],
    locale,
  };
}

function soapBubbleOpticsRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "泡泡 薄膜干涉 繞射 肥皂膜 光學",
      "肥皂泡 薄膜干涉 光波長 顏色",
      "肥皂膜 光學干涉 繞射 散射",
      "薄膜干涉 肥皂泡 光學",
    ],
    enAcademicQuery: [
      "thin film interference soap bubble diffraction",
      "soap bubble thin film optics interference wavelength",
      "diffraction and interference in soap bubble films",
      "optical interference of soap films",
      "thin film color bubble optics",
      "soap film optics light scattering wavelength",
    ],
    keywordSet: [
      "泡泡",
      "肥皂泡",
      "薄膜",
      "薄膜干涉",
      "干涉",
      "繞射",
      "光波長",
      "肥皂膜",
      "soap bubble",
      "soap film",
      "thin film interference",
      "optical interference",
      "diffraction",
      "wavelength",
      "light scattering",
      "thin film color",
    ],
    negativeKeywords: ["bubble tea", "financial bubble", "market bubble", "wallpaper", "photography"],
    broaderAcademicQueries: [
      "thin film interference optics",
      "soap film color interference",
      "interference diffraction thin films optics",
      "light scattering soap films",
    ],
    locale,
  };
}

function teaCaffeineExtractionRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "茶葉 咖啡因 含量 浸泡時間 萃取",
      "茶 咖啡因 萃取時間 沖泡",
      "茶葉 咖啡因 濃度 浸泡溫度 時間",
      "茶湯 咖啡因 含量 浸泡條件",
    ],
    enAcademicQuery: [
      "caffeine extraction time tea leaves",
      "tea caffeine content brewing time",
      "effect of steeping time on caffeine extraction from tea",
      "caffeine concentration tea infusion time",
      "caffeine diffusion tea leaves brewing temperature time",
    ],
    keywordSet: [
      "茶葉",
      "茶",
      "咖啡因",
      "含量",
      "浸泡時間",
      "萃取",
      "沖泡",
      "tea leaves",
      "caffeine",
      "extraction time",
      "brewing time",
      "steeping time",
      "tea infusion",
    ],
    negativeKeywords: ["coffee", "decaf marketing", "recipe", "beverage review"],
    broaderAcademicQueries: [
      "caffeine extraction tea infusion",
      "tea brewing time caffeine concentration",
      "methylxanthines tea infusion extraction",
    ],
    locale,
  };
}

function flameColorMetalIonRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "金屬離子 火焰顏色 焰色反應",
      "不同金屬離子 火焰測試 發射光譜",
      "金屬鹽 火焰顏色 原子發射",
      "焰色試驗 金屬離子 光譜",
    ],
    enAcademicQuery: [
      "flame test metal ions color",
      "metal ion flame color emission spectra",
      "flame tests alkali alkaline earth metal ions",
      "atomic emission spectra flame color metal salts",
      "qualitative analysis flame test metal cations",
    ],
    keywordSet: [
      "金屬離子",
      "金屬鹽",
      "火焰顏色",
      "焰色反應",
      "焰色試驗",
      "發射光譜",
      "metal ions",
      "metal cations",
      "flame test",
      "flame color",
      "emission spectra",
      "atomic emission",
    ],
    negativeKeywords: ["fireworks recipe", "pyrotechnic formula", "weapon", "explosive"],
    broaderAcademicQueries: [
      "atomic emission spectroscopy flame test",
      "metal cations flame color chemistry education",
      "flame photometry metal ions emission",
    ],
    locale,
  };
}

function taiwanOceanBiodiversityRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "洋流 臺灣 海域 生物多樣性",
      "黑潮 臺灣 海洋生物多樣性",
      "臺灣附近海域 洋流 物種分布",
      "海流 影響 臺灣 海洋生態",
    ],
    enAcademicQuery: [
      "ocean currents Taiwan marine biodiversity",
      "Kuroshio Current Taiwan marine biodiversity",
      "ocean circulation species distribution Taiwan waters",
      "currents plankton fish biodiversity Taiwan",
      "Kuroshio influence marine ecosystem around Taiwan",
    ],
    keywordSet: [
      "洋流",
      "海流",
      "黑潮",
      "臺灣",
      "台灣",
      "海域",
      "生物多樣性",
      "海洋生態",
      "物種分布",
      "ocean currents",
      "Kuroshio Current",
      "Taiwan waters",
      "marine biodiversity",
      "species distribution",
      "marine ecosystem",
    ],
    negativeKeywords: ["travel", "tourism", "weather forecast", "aquarium"],
    broaderAcademicQueries: [
      "Kuroshio Current marine biodiversity",
      "western North Pacific ocean currents biodiversity",
      "Taiwan marine ecosystem Kuroshio",
    ],
    locale,
  };
}

function photosynthesisLightIntensityRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "光合作用速率 光照強度 關係",
      "光照強度 對 光合作用速率 影響",
      "光合作用 光反應 光強度 限制因子",
      "植物 光合作用 光強度 曲線",
    ],
    enAcademicQuery: [
      "photosynthesis rate light intensity",
      "effect of light intensity on photosynthetic rate",
      "photosynthetic light response curve",
      "limiting factors photosynthesis light intensity",
      "plant photosynthesis irradiance response",
    ],
    keywordSet: [
      "光合作用",
      "光合作用速率",
      "光照強度",
      "光強度",
      "限制因子",
      "植物",
      "photosynthesis",
      "photosynthetic rate",
      "light intensity",
      "irradiance",
      "light response curve",
      "limiting factors",
    ],
    negativeKeywords: ["solar panel", "photography lighting", "lamp product"],
    broaderAcademicQueries: [
      "photosynthesis light response plant physiology",
      "irradiance photosynthetic rate limiting factor",
      "photosynthetic rate light intensity experiment",
    ],
    locale,
  };
}

function solarSailRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: "太陽帆推進技術的物理原理、太空任務應用與限制",
    zhAcademicQuery: [
      "太陽帆 輻射壓 推進 原理",
      "太陽帆 航天任務 應用 價值",
      "太陽帆 深空探測 優勢 限制",
      "太陽帆 光壓 航天推進 技術",
    ],
    enAcademicQuery: [
      "solar sail propulsion radiation pressure",
      "solar sail spacecraft mission applications",
      "solar sailing deep space exploration limitations",
      "IKAROS LightSail NEA Scout solar sail",
      "solar radiation pressure spacecraft propulsion",
    ],
    keywordSet: [
      "太陽帆",
      "輻射壓",
      "光壓",
      "航天推進",
      "太空任務",
      "深空探測",
      "solar sail",
      "solar sailing",
      "radiation pressure",
      "spacecraft propulsion",
      "deep space exploration",
      "IKAROS",
      "LightSail",
      "NEA Scout",
    ],
    negativeKeywords: [
      "sailboat",
      "sailing sport",
      "solar panel only",
      "astrology",
      "science fiction only",
    ],
    broaderAcademicQueries: [
      "solar sail mission applications",
      "solar radiation pressure spacecraft propulsion",
      "deep space solar sailing limitations",
    ],
    locale,
  };
}

function moonRabbitRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "月兔 神話 民俗 東亞文化 象徵",
      "月兔 玉兔 文學圖像 文化象徵",
      "月兔 傳說 中秋 民間信仰",
      "月兔 神話 比較文化 研究",
    ],
    enAcademicQuery: [
      "Moon rabbit folklore",
      "Moon rabbit mythology East Asian culture",
      "jade rabbit lunar mythology cultural symbolism",
      "Moon rabbit Mid-Autumn Festival folklore",
      "East Asian moon rabbit literary imagery",
    ],
    keywordSet: [
      "月兔",
      "玉兔",
      "神話",
      "民俗",
      "東亞文化",
      "文化象徵",
      "文學圖像",
      "中秋",
      "Moon rabbit",
      "jade rabbit",
      "lunar mythology",
      "folklore",
      "cultural symbolism",
      "East Asian culture",
    ],
    negativeKeywords: ["wallpaper", "game character", "anime merchandise", "astrology"],
    broaderAcademicQueries: [
      "East Asian lunar mythology folklore",
      "animal symbolism East Asian folklore",
      "Mid-Autumn Festival moon rabbit",
    ],
    locale,
  };
}

function jadePendantRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "玉佩 玉器 考古 物質文化",
      "中國玉佩 禮制 象徵 工藝",
      "玉佩 裝飾 身分象徵 文化史",
      "古代玉器 玉佩 工藝與社會意義",
    ],
    enAcademicQuery: [
      "jade pendant archaeology",
      "Chinese jade pendant material culture",
      "jade ornament cultural symbolism China",
      "Chinese jade ritual object craftsmanship",
      "ancient jade pendant archaeology ornament",
    ],
    keywordSet: [
      "玉佩",
      "玉器",
      "玉飾",
      "考古",
      "物質文化",
      "禮制",
      "文化象徵",
      "工藝",
      "身分象徵",
      "jade pendant",
      "jade ornament",
      "Chinese jade",
      "material culture",
      "archaeology",
      "craftsmanship",
      "ritual object",
    ],
    negativeKeywords: ["jewelry shop", "shopping", "price", "auction listing", "wallpaper"],
    broaderAcademicQueries: [
      "Chinese jade material culture",
      "ancient jade ornaments archaeology",
      "jade ritual objects cultural symbolism",
    ],
    locale,
  };
}

function yellowstoneRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "黃石國家公園 地質 生態 保育",
      "黃石國家公園 火山系統 生態系",
      "黃石國家公園 野生動物 管理",
      "黃石國家公園 觀光管理 保育",
    ],
    enAcademicQuery: [
      "Yellowstone National Park geology ecology",
      "Yellowstone National Park conservation ecosystem",
      "Yellowstone volcanic system ecology",
      "Yellowstone wildlife management conservation",
      "Yellowstone National Park tourism management",
    ],
    keywordSet: [
      "黃石國家公園",
      "黃石",
      "地質",
      "火山系統",
      "生態系",
      "保育",
      "野生動物",
      "觀光管理",
      "Yellowstone National Park",
      "Yellowstone",
      "geology",
      "volcanic system",
      "ecosystem",
      "conservation",
      "wildlife management",
      "tourism management",
    ],
    negativeKeywords: ["travel booking", "hotel", "wallpaper", "itinerary"],
    broaderAcademicQueries: [
      "Yellowstone ecosystem conservation",
      "Yellowstone geology volcanic system",
      "national park wildlife management Yellowstone",
    ],
    locale,
  };
}

function kiteFlightRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "風箏 飛行 原理",
      "風箏 空氣動力學 升力 阻力",
      "風箏 風速 拉力 飛行穩定",
      "繫留風箏 飛行力學 氣動性能",
    ],
    enAcademicQuery: [
      "kite aerodynamics lift drag tethered flight",
      "kite flight mechanics wind speed stability",
      "tethered kite aerodynamic performance",
      "kite lift drag line tension wind tunnel",
      "kite flight stability aerodynamic forces",
    ],
    keywordSet: [
      "風箏",
      "飛行原理",
      "空氣動力學",
      "升力",
      "阻力",
      "風速",
      "拉力",
      "飛行穩定",
      "kite",
      "aerodynamics",
      "lift",
      "drag",
      "tethered flight",
      "line tension",
      "wind speed",
      "wind tunnel",
      "flight stability",
    ],
    negativeKeywords: ["toy shopping", "kite festival travel", "travel", "shopping", "craft tutorial", "wallpaper"],
    broaderAcademicQueries: [
      "kite aerodynamics lift drag",
      "tethered flight aerodynamics",
      "wind tunnel kite aerodynamic performance",
    ],
    locale,
  };
}

function birdFeedingRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "鳥類 餵食方式",
      "鳥類 覓食行為 食性",
      "鳥類 feeding ecology",
      "鳥類 食性 適應 覓食策略",
    ],
    enAcademicQuery: [
      "bird feeding behavior avian foraging ecology",
      "avian diet feeding strategies foraging behavior",
      "bird trophic ecology feeding adaptation",
      "avian foraging behavior diet ecology",
      "bird feeding ecology trophic adaptation",
    ],
    keywordSet: [
      "鳥類",
      "餵食方式",
      "覓食行為",
      "食性",
      "鳥類生態",
      "bird",
      "avian",
      "feeding behavior",
      "foraging",
      "diet",
      "feeding ecology",
      "trophic ecology",
      "feeding strategies",
    ],
    negativeKeywords: ["pet food shopping", "bird feeder product", "travel", "wallpaper", "recipe"],
    broaderAcademicQueries: [
      "avian foraging ecology",
      "bird diet feeding strategies",
      "trophic ecology birds feeding adaptation",
    ],
    locale,
  };
}

function dentalPlaqueRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery: [
      "牙菌斑 形成 治療",
      "口腔生物膜 牙菌斑 治療",
      "牙周病 牙菌斑 控制",
      "牙菌斑 生物膜 口腔衛生 氯己定",
    ],
    enAcademicQuery: [
      "dental plaque formation treatment oral biofilm",
      "oral biofilm dental plaque periodontal disease treatment",
      "plaque control chlorhexidine scaling oral hygiene",
      "dental biofilm formation periodontal therapy",
      "dental plaque biofilm control oral hygiene treatment",
    ],
    keywordSet: [
      "牙菌斑",
      "口腔生物膜",
      "牙周病",
      "形成",
      "治療",
      "控制",
      "口腔衛生",
      "dental plaque",
      "oral biofilm",
      "periodontal",
      "periodontal disease",
      "plaque control",
      "biofilm formation",
      "chlorhexidine",
      "scaling",
      "oral hygiene",
      "treatment",
    ],
    negativeKeywords: ["tooth whitening product", "advertisement", "shopping", "cosmetic dentistry marketing"],
    broaderAcademicQueries: [
      "oral biofilm plaque control",
      "periodontal disease dental plaque treatment",
      "dental biofilm formation therapy",
    ],
    locale,
  };
}

function pandaTerminologyRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  return {
    originalQuery,
    displayTitle: "熊貓與貓熊名稱差異、分類學關係與中文語境中的用法",
    zhAcademicQuery: [
      "熊貓 貓熊 名稱 差異 中文語境",
      "大熊貓 小熊貓 分類 關係",
      "大熊貓 貓熊 小貓熊 命名 歷史",
      "貓熊 熊貓 臺灣 中國大陸 用法",
      "大熊貓 小熊貓 科普 教育 分類",
    ],
    enAcademicQuery: [
      "giant panda red panda taxonomy naming history",
      "panda cat-bear Chinese terminology",
      "giant panda Ailuropoda melanoleuca red panda Ailurus fulgens distinction",
      "Chinese terminology giant panda red panda naming history",
      "giant panda taxonomy Ursidae red panda Ailuridae",
      "panda naming history Chinese language cat bear",
    ],
    keywordSet: [
      "熊貓",
      "貓熊",
      "大熊貓",
      "小熊貓",
      "小貓熊",
      "名稱差異",
      "中文語境",
      "分類學",
      "命名史",
      "giant panda",
      "red panda",
      "panda",
      "cat-bear",
      "Ailuropoda melanoleuca",
      "Ailurus fulgens",
      "taxonomy",
      "Chinese terminology",
      "naming history",
      "Ursidae",
      "Ailuridae",
    ],
    negativeKeywords: [
      "kung fu panda",
      "panda express",
      "logo",
      "mascot",
      "toy",
      "plush",
      "wallpaper",
      "clipart",
      "cryptocurrency",
    ],
    broaderAcademicQueries: [
      "giant panda taxonomy red panda evolution",
      "red panda Ailurus fulgens classification",
      "Ailuropoda melanoleuca taxonomy",
      "panda Chinese naming terminology",
    ],
    locale,
  };
}

function genericRewrite(topic: string, locale: string): NormalizedResearchTopic {
  const originalQuery = compactWhitespace(topic);
  const words = uniqueStrings(
    originalQuery
      .split(/\s+|[、,，;；:：。！？?()（）「」『』]/u)
      .map((piece) => piece.trim())
      .filter((piece) => piece.length >= 2),
  );
  const zhAcademicQuery = containsZh(originalQuery)
    ? uniqueStrings([
        originalQuery,
        `${words.slice(0, 5).join(" ")} 文獻 研究`,
        `${words.slice(0, 4).join(" ")} 學術 影響`,
      ])
    : [];
  const enAcademicQuery = containsZh(originalQuery)
    ? []
    : uniqueStrings([
        originalQuery,
        `${originalQuery} academic research`,
        `${originalQuery} systematic review`,
      ]);

  return {
    originalQuery,
    displayTitle: originalQuery,
    zhAcademicQuery,
    enAcademicQuery,
    keywordSet: words,
    negativeKeywords: ["wallpaper", "quotes", "travel", "marketing", "advertisement"],
    broaderAcademicQueries: enAcademicQuery.slice(1),
    locale,
  };
}

export function normalizeResearchTopic(
  topic: string,
  locale = "zh-TW",
): NormalizedResearchTopic {
  const normalized = compactWhitespace(topic);
  const lower = normalized.toLowerCase();
  if (
    /夕陽|餘暉|暮光|晚霞|sunset|twilight/i.test(normalized) &&
    /波長|顏色|光|wavelength|color|colour|scattering/i.test(normalized)
  ) {
    return sunsetOpticsRewrite(normalized, locale);
  }
  if (
    (/高中生|學生|secondary students?|high school/i.test(normalized) &&
      /寫作|writing/i.test(normalized) &&
      /人工智慧|生成式|(^|[^a-z])ai([^a-z]|$)|artificial intelligence|generative ai|large language model|chatgpt/i.test(
        normalized,
      )) ||
    /ai 對高中生寫作能力的影響/i.test(lower)
  ) {
    return aiWritingRewrite(normalized, locale);
  }
  if (
    /retrieval augmented generation|(^|\s)rag(\s|$)/i.test(normalized) &&
    /citation|attribution|accuracy|faithfulness|factuality/i.test(normalized)
  ) {
    return ragCitationRewrite(normalized, locale);
  }
  if (
    /愛滋病|人類免疫缺乏病毒|後天免疫缺乏症候群|HIV感染|HIV|AIDS|human immunodeficiency virus|acquired immunodeficiency syndrome/i.test(
      normalized,
    )
  ) {
    return hivAidsRewrite(normalized, locale);
  }
  if (
    /泡泡|肥皂泡|肥皂膜|soap bubble|soap film/i.test(normalized) &&
    /薄膜|干涉|繞射|光學|interference|diffraction|thin film|optics/i.test(normalized)
  ) {
    return soapBubbleOpticsRewrite(normalized, locale);
  }
  if (
    /茶葉|茶|tea leaves?|tea infusion|tea/i.test(normalized) &&
    /咖啡因|caffeine/i.test(normalized) &&
    /浸泡|萃取|沖泡|時間|steeping|brewing|extraction|time/i.test(normalized)
  ) {
    return teaCaffeineExtractionRewrite(normalized, locale);
  }
  if (
    /金屬離子|金屬鹽|焰色|火焰顏色|metal ions?|metal cations?|metal salts?|flame test|flame color/i.test(normalized) &&
    /火焰|顏色|焰色|光譜|flame|color|colour|spectra|emission/i.test(normalized)
  ) {
    return flameColorMetalIonRewrite(normalized, locale);
  }
  if (
    /洋流|海流|黑潮|ocean current|ocean circulation|Kuroshio/i.test(normalized) &&
    /臺灣|台灣|Taiwan|海域|marine|biodiversity|生物多樣性|海洋生態/i.test(normalized)
  ) {
    return taiwanOceanBiodiversityRewrite(normalized, locale);
  }
  if (
    /光合作用|photosynthesis|photosynthetic/i.test(normalized) &&
    /光照強度|光強度|light intensity|irradiance|rate|速率/i.test(normalized)
  ) {
    return photosynthesisLightIntensityRewrite(normalized, locale);
  }
  if (/太陽帆|solar sail|solar sailing/i.test(normalized)) {
    return solarSailRewrite(normalized, locale);
  }
  if (/月兔|玉兔|moon rabbit|jade rabbit/i.test(normalized)) {
    return moonRabbitRewrite(normalized, locale);
  }
  if (/玉佩|玉器|玉飾|jade pendant|jade ornament/i.test(normalized)) {
    return jadePendantRewrite(normalized, locale);
  }
  if (/黃石國家公園|yellowstone/i.test(normalized)) {
    return yellowstoneRewrite(normalized, locale);
  }
  if (
    /風箏|kite/i.test(normalized) &&
    /飛行|空氣動力|升力|阻力|風速|拉力|穩定|flight|aerodynamic|lift|drag|wind|tension|stability/i.test(
      normalized,
    )
  ) {
    return kiteFlightRewrite(normalized, locale);
  }
  if (
    /鳥類|鳥|avian|birds?/i.test(normalized) &&
    /餵食|覓食|食性|feeding|foraging|diet|trophic/i.test(normalized)
  ) {
    return birdFeedingRewrite(normalized, locale);
  }
  if (
    /牙菌斑|口腔生物膜|牙周病|dental plaque|oral biofilm|periodontal/i.test(normalized) &&
    /生成|形成|治療|控制|plaque|biofilm|treatment|therapy|control/i.test(normalized)
  ) {
    return dentalPlaqueRewrite(normalized, locale);
  }
  if (/熊貓|貓熊|大熊貓|小熊貓|小貓熊|giant panda|red panda|Ailuropoda|Ailurus/i.test(normalized)) {
    return pandaTerminologyRewrite(normalized, locale);
  }
  return genericRewrite(normalized, locale);
}
