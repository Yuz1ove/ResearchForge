export type ResearchIntent = "causes_current_status" | "causes" | "current_status" | "general";

export type TopicFacetId =
  | "causes"
  | "current_status"
  | "impacts"
  | "adaptation"
  | "policy"
  | "finance"
  | "local_case"
  | "ecological_effects";

export interface TopicFacet {
  id: TopicFacetId;
  labelZhTw: string;
  terms: string[];
}

export interface TopicFacets {
  topicCore: string[];
  requiredFacets: TopicFacet[];
  secondaryFacets: TopicFacet[];
  excludeOrDowngrade: string[];
  researchIntent: ResearchIntent;
}

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(cleanText(term)));
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function classifyResearchIntent(topic: string): ResearchIntent {
  const text = cleanText(topic);
  const asksCauses = hasAny(text, [
    "成因",
    "原因",
    "形成原因",
    "cause",
    "causes",
    "drivers",
    "attribution",
  ]);
  const asksCurrentStatus = hasAny(text, [
    "現況",
    "現狀",
    "目前",
    "current status",
    "observed",
    "trend",
    "state of",
  ]);

  if (asksCauses && asksCurrentStatus) return "causes_current_status";
  if (asksCauses) return "causes";
  if (asksCurrentStatus) return "current_status";
  return "general";
}

export function buildTopicFacets(topic: string): TopicFacets {
  const normalized = cleanText(topic);
  const climateTopic = /氣候變遷|全球暖化|溫室氣體|climate change|global warming|greenhouse gas|co2|carbon dioxide/.test(normalized);

  if (climateTopic) {
    return {
      topicCore: ["氣候變遷", "climate change", "global warming", "全球暖化"],
      researchIntent: classifyResearchIntent(topic),
      requiredFacets: [
        {
          id: "causes",
          labelZhTw: "成因分析",
          terms: [
            "greenhouse gas",
            "greenhouse gases",
            "carbon dioxide",
            "co2",
            "methane",
            "fossil fuel",
            "fossil fuels",
            "fossil fuel combustion",
            "emissions",
            "industrialization",
            "land use change",
            "land use",
            "deforestation",
            "anthropogenic",
            "human activities",
            "radiative forcing",
            "attribution",
            "溫室氣體",
            "二氧化碳",
            "甲烷",
            "化石燃料",
            "排放",
            "工業化",
            "土地利用",
            "森林砍伐",
            "人為活動",
            "暖化成因",
          ],
        },
        {
          id: "current_status",
          labelZhTw: "現況分析",
          terms: [
            "observed warming",
            "observed climate change",
            "global temperature",
            "temperature trend",
            "global mean temperature",
            "climate indicators",
            "co2 concentration",
            "carbon dioxide concentration",
            "greenhouse gas concentration",
            "emissions trend",
            "sea level",
            "ipcc assessment",
            "wmo state of climate",
            "state of the climate",
            "nasa",
            "noaa",
            "current status",
            "warming trend",
            "全球升溫",
            "全球均溫",
            "溫度趨勢",
            "氣候指標",
            "二氧化碳濃度",
            "溫室氣體濃度",
            "排放趨勢",
            "海平面",
            "觀測暖化",
            "觀測",
            "現況",
          ],
        },
      ],
      secondaryFacets: [
        {
          id: "impacts",
          labelZhTw: "延伸影響",
          terms: ["impact", "impacts", "effect", "effects", "risk", "影響", "衝擊", "風險"],
        },
        {
          id: "adaptation",
          labelZhTw: "因應調適",
          terms: ["adaptation", "mitigation", "mitigate", "response", "resilience", "renewable energy", "調適", "減緩", "因應", "應對", "应对", "韌性", "可再生能源", "再生能源"],
        },
        {
          id: "policy",
          labelZhTw: "政策治理",
          terms: ["policy", "governance", "committee", "council", "politics", "政策", "治理", "委員會", "對策委員會", "政治"],
        },
        {
          id: "finance",
          labelZhTw: "金融風險",
          terms: ["finance", "financial risk", "insurance", "investment", "金融", "金融風險", "投資", "保險"],
        },
        {
          id: "local_case",
          labelZhTw: "地方案例",
          terms: ["local", "regional", "case study", "台灣", "地方", "區域", "案例"],
        },
        {
          id: "ecological_effects",
          labelZhTw: "生態影響",
          terms: ["forest", "ecosystem", "water flux", "surface flux", "ecological", "森林", "生態", "地表通量", "水通量"],
        },
      ],
      excludeOrDowngrade: [
        "pure politics",
        "committee function",
        "committee governance",
        "financial risk only",
        "local ecological impact only",
        "education admin",
        "admission",
        "tone sandhi",
        "phonetic variation",
        "jerusalem",
        "university admission",
        "招生",
        "高考",
        "北京話",
        "變調",
        "耶路撒冷",
        "功能定位",
        "金融風險",
      ],
    };
  }

  const genericCore = unique(
    topic
      .split(/[，,。；;：:\s]+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2),
  );

  return {
    topicCore: genericCore.length ? genericCore : [topic.trim()].filter(Boolean),
    requiredFacets: [],
    secondaryFacets: [],
    excludeOrDowngrade: [],
    researchIntent: classifyResearchIntent(topic),
  };
}
