import {
  understandTopic,
  type TopicDomain,
  type TopicUnderstandingResult,
} from "@workspace/api-zod/topic-understanding";
import { requestLocalLlmJson } from "./local-llm-client";

export type TopicUnderstandingDiagnostics = {
  usedLocalLlm: boolean;
  fallbackReason?: string;
  confidence: number;
  model?: string;
  latencyMs?: number;
};

export type TopicUnderstanding = {
  normalizedTopic: string;
  domain: TopicDomain;
  subdomain: string;
  topicKind: "specific_research_topic" | "known_entity" | "broad_common_noun" | "ambiguous" | "unknown_or_noise";
  entities: string[];
  canonicalEnglishTopic: string;
  coreConcepts: string[];
  likelyMeanings: string[];
  ambiguityWarnings: string[];
  excludedDriftTerms: string[];
  researchAngles: {
    title: string;
    angle: string;
    reason: string;
    searchQueries: string[];
  }[];
  diagnostics: TopicUnderstandingDiagnostics;
};

export interface TopicUnderstandingRequest {
  topic: string;
  reportType?: string;
  audience?: string;
  sourceMode?: string;
  language?: string;
}

type ResearchProfile =
  | "animal_entity"
  | "mechanics_principle"
  | "pathogen_health"
  | "health_effect"
  | "beverage_health"
  | "environmental_exposure"
  | "general_object";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function containsLatin(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function splitTopicTerms(topic: string): string[] {
  const normalized = compactWhitespace(topic)
    .replace(/[「」"'`~!@#$%^&*+=|\\/<>{}\[\]]/g, " ")
    .replace(/[，,、：:；;。！？!?（）()\-–—_]/g, " ");
  return uniqueStrings(
    normalized
      .split(/\s+/)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 || containsCjk(term)),
  );
}

function invalidInputReason(topic: string): string | null {
  const normalized = compactWhitespace(topic);
  if (!normalized) return "empty-topic";
  if (!/[A-Za-z0-9\u3400-\u9fff]/u.test(normalized)) return "symbol-only-topic";
  const stripped = normalized.replace(/\s+/g, "");
  if (stripped.length <= 2 && !containsCjk(stripped)) return "too-short";
  if (/^[A-Za-z0-9_-]+$/.test(stripped)) {
    const hasDigit = /\d/.test(stripped);
    const vowelCount = (stripped.match(/[aeiou]/gi) ?? []).length;
    const consonantRun = /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(stripped);
    const lowerAlpha = stripped.replace(/[^a-z]/gi, "");
    if ((hasDigit && vowelCount === 0) || consonantRun) return "ascii-garbage";
    if (hasDigit && lowerAlpha === lowerAlpha.toLowerCase() && stripped.length <= 12) {
      return "ascii-garbage";
    }
  }
  return null;
}

function inferDomain(topic: string, taxonomy?: TopicUnderstandingResult): TopicDomain {
  const text = topic.toLowerCase();
  if (
    /[貓狗鼠兔羊牛馬鹿狐狼豹獅虎象猴熊龜蛇蛙魚蝦蟹蜂蟻鳥鷹鴨鵝雞豬駝鹿]/u.test(topic) ||
    /動物|生物|物種|繁殖|畜牧|飼養|獸醫|毛纖維|棲地|animal|species|husbandry|veterinary|habitat|wildlife/i.test(text)
  ) {
    return "animal_science";
  }
  if (
    /桿菌|細菌|病毒|病原|感染|食物中毒|致病|bacteria|virus|pathogen|infection|salmonella/i.test(text)
  ) {
    return "health";
  }
  if (
    /飲料|汽水|可樂|碳酸|含糖|食品|攝取|營養|beverage|drink|soda|cola|sugar-sweetened|nutrition/i.test(text)
  ) {
    return /健康|人體|身體|代謝|牙齒|肥胖|public health|metabolic|health/i.test(text)
      ? "beverage_health"
      : "food_nutrition";
  }
  if (
    /生物|物種|繁殖|畜牧|飼養|疾病|獸醫|biology|animal|species|husbandry|veterinary|ecology/i.test(text)
  ) {
    return "animal_science";
  }
  if (
    /健康|醫療|疾病|營養|毒性|代謝|人體|health|medical|disease|nutrition|toxic|metabolic/i.test(text)
  ) {
    return "health";
  }
  if (
    /塑膠|污染|生態|海洋|氣候|環境|永續|environment|microplastic|pollution|marine|climate|sustain/i.test(text)
  ) {
    return "environment";
  }
  if (
    /物理|力學|角動量|扭矩|進動|旋轉|physics|mechanics|torque|momentum|precession|rotational/i.test(text)
  ) {
    return "technology";
  }
  if (
    /科技|工程|演算法|感測|導航|材料|製造|technology|engineering|algorithm|sensor|material|manufactur/i.test(text)
  ) {
    return "technology";
  }
  if (
    /社會|文化|歷史|經濟|教育|政策|social|culture|history|economic|education|policy/i.test(text)
  ) {
    return "social_science";
  }
  return taxonomy?.domain ?? "general_research";
}

function extractPrimarySubject(topic: string): string {
  const normalized = compactWhitespace(topic);
  const patterns = [
    /^(.+?)對.+的影響$/u,
    /^(.+?)的(?:運動)?原理$/u,
    /^(.+?)的機制$/u,
    /^(.+?)的作用$/u,
    /^(.+?)的風險$/u,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return compactWhitespace(match[1]);
  }
  return normalized;
}

function inferResearchProfile(
  topic: string,
  domain: TopicDomain,
): ResearchProfile {
  const text = topic.toLowerCase();
  if (
    /[貓狗鼠兔羊牛馬鹿狐狼豹獅虎象猴熊龜蛇蛙魚蝦蟹蜂蟻鳥鷹鴨鵝雞豬駝]/u.test(topic) ||
    domain === "animal_science"
  ) {
    return "animal_entity";
  }
  if (/桿菌|細菌|病毒|病原|感染|致病|foodborne|bacteria|virus|pathogen|infection/i.test(text)) {
    return "pathogen_health";
  }
  if (/運動原理|力學|旋轉|轉動|角動量|扭矩|力矩|進動|歲差|慣量|穩定性|物理模型|physics|mechanics|precession|torque|momentum/i.test(text)) {
    return "mechanics_principle";
  }
  if (
    /飲料|汽水|可樂|碳酸|含糖|飲用|beverage|drink|soda|cola/i.test(text) &&
    /影響|健康|人體|身體|代謝|牙齒|肥胖|public health|health|metabolic/i.test(text)
  ) {
    return "beverage_health";
  }
  if (
    domain === "environment" &&
    /暴露|污染|生態|人體|健康|影響|風險|污染源|exposure|pollution|impact|risk/i.test(text)
  ) {
    return "environmental_exposure";
  }
  if (
    domain === "health" &&
    /人體|身體|健康|影響|風險|毒性|暴露|攝取|infection|toxic|exposure|health|impact/i.test(text)
  ) {
    return "health_effect";
  }
  return "general_object";
}

function profileCoreConcepts(
  profile: ResearchProfile,
  subject: string,
  canonicalEnglishTopic: string,
): string[] {
  const concepts: Record<ResearchProfile, string[]> = {
    animal_entity: ["生態特徵", "飼養管理", "行為特徵", "經濟價值", "疾病與健康管理", "與人類互動"],
    mechanics_principle: ["角動量", "歲差", "轉動慣量", "穩定性", "扭矩", "物理模型"],
    pathogen_health: ["感染途徑", "致病機制", "腸胃道症狀", "食品安全", "公共衛生", "預防控制"],
    health_effect: ["人體暴露", "毒理", "消化系統", "血液循環", "公共衛生", "環境來源"],
    beverage_health: ["攝取量", "糖分與代謝", "咖啡因或添加物", "牙齒健康", "肥胖風險", "公共衛生"],
    environmental_exposure: ["污染來源", "人體暴露", "毒理機制", "生態影響", "公共衛生", "監測治理"],
    general_object: ["背景脈絡", "使用情境", "觀察指標", "案例比較", "實作應用", "限制與風險"],
  };
  return uniqueStrings([subject, canonicalEnglishTopic, ...concepts[profile]]);
}

function inferTopicKind(
  topic: string,
  terms: string[],
  taxonomy?: TopicUnderstandingResult,
): TopicUnderstanding["topicKind"] {
  if (invalidInputReason(topic)) return "unknown_or_noise";
  if (taxonomy?.topicKind === "unknown_or_noise") return "unknown_or_noise";
  if (taxonomy?.topicKind === "specific_research_topic") return "specific_research_topic";
  if (/影響|關係|比較|原因|機制|原理|分析|應用|是否|how|impact|effect|relationship|mechanism|principle|analysis/i.test(topic)) {
    return "specific_research_topic";
  }
  if (terms.length <= 1) return taxonomy?.entity ? "known_entity" : "broad_common_noun";
  if (terms.length <= 3) return "ambiguous";
  return "specific_research_topic";
}

function domainCoreConcepts(
  domain: TopicDomain,
  topic: string,
): string[] {
  const defaults: Record<TopicDomain, string[]> = {
    animal_science: ["biology", "classification", "husbandry", "behavior", "economic value"],
    food_nutrition: ["nutrition", "food safety", "consumption", "labeling"],
    beverage_health: ["consumption", "nutrition", "metabolic health", "public health"],
    consumer_product: ["design", "usage context", "safety", "market comparison"],
    automotive_business: ["industry", "supply chain", "market strategy", "technology adoption"],
    music_culture: ["history", "performance", "education", "cultural meaning"],
    household_safety: ["risk", "usage context", "safety guideline", "prevention"],
    materials_design: ["materials", "structure", "design", "manufacturing"],
    biology: ["biology", "mechanism", "classification", "observation"],
    health: ["health impact", "mechanism", "risk", "evidence"],
    technology: ["mechanism", "engineering", "application", "measurement"],
    environment: ["environmental impact", "exposure", "ecology", "policy"],
    social_science: ["background", "stakeholders", "data", "policy"],
    history_culture: ["history", "cultural context", "comparison", "case study"],
    general_research: ["definition", "scope", "evidence", "application"],
  };
  return uniqueStrings([topic, ...defaults[domain]]);
}

function bilingualQueries(
  zhQueries: string[],
  englishTopic: string,
  englishSuffixes: string[],
): string[] {
  const normalizedEnglishTopic = containsLatin(englishTopic) ? englishTopic.trim() : "";
  return uniqueStrings([
    ...zhQueries,
    ...(normalizedEnglishTopic
      ? englishSuffixes.map((suffix) => `${normalizedEnglishTopic} ${suffix}`.trim())
      : []),
  ]);
}

function angleTemplates(
  domain: TopicDomain,
  topic: string,
  canonicalEnglishTopic: string,
): Array<{ title: string; angle: string; reason: string; queries: string[] }> {
  const subject = extractPrimarySubject(topic);
  const profile = inferResearchProfile(topic, domain);
  const en = containsLatin(canonicalEnglishTopic)
    ? canonicalEnglishTopic
    : containsLatin(subject)
      ? subject
      : "";
  const animalAngles = [
    {
      title: `${subject}的生態與生物特徵`,
      angle: `整理 ${subject} 的生態特徵、外觀特徵與基本生物學線索。`,
      reason: "單一生物名詞要先界定其生態與特徵，後續資料才容易聚焦。",
      queries: bilingualQueries(
        [`${subject} 生態特徵`, `${subject} 行為特徵`],
        en,
        ["ecology behavior characteristics", "biology habitat traits"],
      ),
    },
    {
      title: `${subject}的飼養管理與健康照護`,
      angle: `從飼養管理、疾病與健康照護切入 ${subject} 的實務研究方向。`,
      reason: "這能把寬泛名詞轉成可搜尋的照護、疾病與管理問題。",
      queries: bilingualQueries(
        [`${subject} 飼養管理`, `${subject} 疾病與健康管理`],
        en,
        ["husbandry health management", "veterinary care disease"],
      ),
    },
    {
      title: `${subject}的用途、價值與人類互動`,
      angle: `整理 ${subject} 的經濟價值、材料用途與與人類互動方式。`,
      reason: "對許多生命體主題而言，經濟用途與人類互動是穩定的來源分支。",
      queries: bilingualQueries(
        [`${subject} 經濟價值`, `${subject} 毛纖維 應用`, `${subject} 與人類互動`],
        en,
        ["economic value industry", "fiber application human interaction"],
      ),
    },
  ];
  const mechanicsAngles = [
    {
      title: `${subject}的角動量與轉動慣量`,
      angle: `先從 ${subject} 的角動量、轉動慣量與轉動條件界定基本物理量。`,
      reason: "運動原理主題需要先拆出可被物理文獻命中的核心量。",
      queries: bilingualQueries(
        [`${subject} 角動量`, `${subject} 轉動慣量`],
        en,
        ["angular momentum moment of inertia", "rotational dynamics"],
      ),
    },
    {
      title: `${subject}的扭矩、歲差與穩定性`,
      angle: `整理外力矩如何影響 ${subject} 的歲差、穩定性與運動表現。`,
      reason: "這能把完整題目拆成幾個真正可搜尋的力學概念。",
      queries: bilingualQueries(
        [`${subject} 歲差`, `${subject} 穩定性`, `${subject} 扭矩`],
        en,
        ["precession stability torque", "gyroscopic stability"],
      ),
    },
    {
      title: `${subject}的物理模型與實驗解釋`,
      angle: `比較 ${subject} 的物理模型、課堂實驗與理論解釋方式。`,
      reason: "理論來源不足時，物理模型與教學型資料能補足第一輪搜尋。",
      queries: bilingualQueries(
        [`${subject} 物理模型`, `${subject} 運動原理`],
        en,
        ["physics model explanation", "experiment classroom mechanics"],
      ),
    },
  ];
  const pathogenAngles = [
    {
      title: `${subject}的感染途徑與致病機制`,
      angle: `整理 ${subject} 的感染途徑、致病機制與主要暴露來源。`,
      reason: "病原主題需要先界定感染與致病路徑。",
      queries: bilingualQueries(
        [`${subject} 感染途徑`, `${subject} 致病機制`],
        en,
        ["infection route pathogenesis", "exposure source"],
      ),
    },
    {
      title: `${subject}對人體症狀與器官影響`,
      angle: `整理 ${subject} 對腸胃道、全身症狀與人體反應的主要影響。`,
      reason: "這能直接對接醫學與公共衛生來源。",
      queries: bilingualQueries(
        [`${subject} 腸胃道 症狀`, `${subject} 對人體的影響`],
        en,
        ["gastrointestinal symptoms human impact", "clinical manifestations"],
      ),
    },
    {
      title: `${subject}的食品安全與公共衛生管理`,
      angle: `比較 ${subject} 在食品安全、流行病學與預防控制上的資料。`,
      reason: "病原相關報告通常需要公共衛生與預防面向補足結論。",
      queries: bilingualQueries(
        [`${subject} 食品安全`, `${subject} 公共衛生`, `${subject} 預防控制`],
        en,
        ["food safety public health", "prevention control epidemiology"],
      ),
    },
  ];
  const healthAngles = [
    {
      title: `${subject}的人體暴露與接觸來源`,
      angle: `先釐清 ${subject} 如何進入人體、有哪些暴露或攝取情境。`,
      reason: "健康影響主題若沒有暴露框架，後續文獻容易失焦。",
      queries: bilingualQueries(
        [`${subject} 人體暴露`, `${subject} 接觸來源`],
        en,
        ["human exposure intake", "exposure source population"],
      ),
    },
    {
      title: `${subject}的毒理與生理影響`,
      angle: `整理 ${subject} 的毒理機制，以及對消化系統、血液循環等生理影響。`,
      reason: "這能把健康主題拆成可查詢的器官與機制面向。",
      queries: bilingualQueries(
        [`${subject} 毒理`, `${subject} 消化系統`, `${subject} 血液循環`],
        en,
        ["toxicology digestive system bloodstream", "physiological mechanism"],
      ),
    },
    {
      title: `${subject}的公共衛生與環境脈絡`,
      angle: `比較 ${subject} 在公共衛生、環境來源與風險治理上的資料。`,
      reason: "健康效應通常也需要補上來源與治理脈絡。",
      queries: bilingualQueries(
        [`${subject} 公共衛生`, `${subject} 環境污染`, `${subject} 風險治理`],
        en,
        ["public health environmental context", "risk management"],
      ),
    },
  ];
  const beverageAngles = [
    {
      title: `${subject}的攝取習慣與暴露量`,
      angle: `整理 ${subject} 的飲用習慣、攝取量與主要族群差異。`,
      reason: "飲料健康題目要先知道誰喝、喝多少，才談得上風險。",
      queries: bilingualQueries(
        [`${subject} 飲用習慣`, `${subject} 攝取量`],
        en,
        ["consumption intake pattern", "population exposure"],
      ),
    },
    {
      title: `${subject}的代謝與身體影響`,
      angle: `整理 ${subject} 的糖分、咖啡因或添加物對代謝與身體健康的影響。`,
      reason: "這能對接營養與醫學研究來源。",
      queries: bilingualQueries(
        [`${subject} 糖分 代謝`, `${subject} 身體健康 影響`, `${subject} 牙齒健康`],
        en,
        ["metabolic health sugar caffeine", "dental health obesity risk"],
      ),
    },
    {
      title: `${subject}的公共衛生風險與改善策略`,
      angle: `比較 ${subject} 在肥胖風險、公共衛生與健康促進上的資料。`,
      reason: "可支撐報告的討論與建議章節。",
      queries: bilingualQueries(
        [`${subject} 肥胖風險`, `${subject} 公共衛生`, `${subject} 健康促進`],
        en,
        ["obesity risk public health", "health promotion policy"],
      ),
    },
  ];
  const environmentAngles = [
    {
      title: `${subject}的污染來源與暴露路徑`,
      angle: `釐清 ${subject} 的污染來源、傳播路徑與暴露情境。`,
      reason: "環境題目需要先找出污染與暴露框架。",
      queries: bilingualQueries(
        [`${subject} 污染來源`, `${subject} 暴露路徑`],
        en,
        ["pollution source exposure pathway", "environmental transport"],
      ),
    },
    {
      title: `${subject}的生態與健康影響`,
      angle: `整理 ${subject} 對生態系、人體健康或毒理機制的主要影響。`,
      reason: "這是環境與健康交叉主題最穩定的研究面向。",
      queries: bilingualQueries(
        [`${subject} 生態影響`, `${subject} 人體健康`, `${subject} 毒理`],
        en,
        ["ecological impact human health toxicology", "environmental evidence"],
      ),
    },
    {
      title: `${subject}的監測資料與治理策略`,
      angle: `比較 ${subject} 的監測方法、公共治理與政策回應。`,
      reason: "若要進到正式報告，通常需要政策與監測證據支撐。",
      queries: bilingualQueries(
        [`${subject} 監測資料`, `${subject} 治理策略`, `${subject} 政策回應`],
        en,
        ["monitoring data policy response", "management strategy"],
      ),
    },
  ];
  const generalAngles = [
    {
      title: `${subject}的背景脈絡與觀察面向`,
      angle: `先界定 ${subject} 的背景脈絡、常見情境與可觀察面向。`,
      reason: "短詞主題若沒有脈絡拆分，搜尋很容易停在空泛結果。",
      queries: [`${subject} 背景脈絡`, `${subject} 使用情境`, `${subject} 觀察面向`],
    },
    {
      title: `${subject}的案例、應用與比較方向`,
      angle: `整理 ${subject} 的案例、實作應用與可比較方向。`,
      reason: "案例與應用能幫助後續 source search 建立可驗證線索。",
      queries: [`${subject} 案例比較`, `${subject} 實作應用`, `${subject} 觀察指標`],
    },
    {
      title: `${subject}的限制、風險與後續研究空間`,
      angle: `比較 ${subject} 的限制、風險與可延伸研究空間。`,
      reason: "這能避免短詞主題只剩概念介紹而無法進入研究流程。",
      queries: [`${subject} 限制`, `${subject} 風險`, `${subject} 後續研究`],
    },
  ];
  const profileTemplates: Record<ResearchProfile, Array<{ title: string; angle: string; reason: string; queries: string[] }>> = {
    animal_entity: animalAngles,
    mechanics_principle: mechanicsAngles,
    pathogen_health: pathogenAngles,
    health_effect: healthAngles,
    beverage_health: beverageAngles,
    environmental_exposure: environmentAngles,
    general_object: generalAngles,
  };
  const profiled = profileTemplates[profile];
  if (profiled.length > 0) return profiled;
  const domainTemplates: Record<TopicDomain, Array<{ title: string; angle: string; reason: string; queries: string[] }>> = {
    animal_science: [
      {
        title: `${subject}的生物分類與基本特徵`,
        angle: `釐清 ${subject} 的分類、棲地、形態與核心生物學特徵。`,
        reason: "先界定研究對象，後續的飼養、疾病或經濟價值討論才不會漂移。",
        queries: bilingualQueries(
          [`${subject} 生物 分類 特徵`],
          en,
          ["biology classification", "species characteristics"],
        ),
      },
      {
        title: `${subject}的飼養、繁殖與健康管理`,
        angle: `整理 ${subject} 在飼養管理、繁殖與疾病預防上的可驗證資料。`,
        reason: "這能把主題轉成可搜尋的實務與科學問題。",
        queries: bilingualQueries(
          [`${subject} 飼養 繁殖 疾病`],
          en,
          ["husbandry breeding disease management", "veterinary care"],
        ),
      },
      {
        title: `${subject}的經濟用途與產業價值`,
        angle: `探討 ${subject} 在產業、纖維、旅遊或地方經濟上的角色。`,
        reason: "若題目涉及單一物種，產業與用途常是搜尋來源的重要分支。",
        queries: bilingualQueries(
          [`${subject} 產業 經濟 價值`],
          en,
          ["economic value industry", "fiber market south america"],
        ),
      },
    ],
    technology: [
      {
        title: `${subject}的核心原理與機制`,
        angle: `說明 ${subject} 涉及的核心機制、關鍵變數與基本理論。`,
        reason: "技術主題若不先拆出機制，很容易只剩下完整句搜尋而找不到資料。",
        queries: bilingualQueries(
          [`${subject} 原理 機制`],
          en,
          ["mechanism principle", "theory fundamentals"],
        ),
      },
      {
        title: `${subject}的量測、設計或實作方法`,
        angle: `整理 ${subject} 在量測、實驗、設計或製造層面的可驗證作法。`,
        reason: "這能把主題轉成學術與教學都能命中的搜尋面向。",
        queries: bilingualQueries(
          [`${subject} 實驗 設計 量測`],
          en,
          ["experiment measurement design", "engineering implementation"],
        ),
      },
      {
        title: `${subject}的應用情境與限制`,
        angle: `比較 ${subject} 在不同應用場景下的用途、優勢與限制。`,
        reason: "應用與限制常能補足單純理論搜尋不足的來源。",
        queries: bilingualQueries(
          [`${subject} 應用 限制`],
          en,
          ["applications limitations", "case study explanation"],
        ),
      },
    ],
    environment: [
      {
        title: `${subject}的來源、暴露與影響路徑`,
        angle: `釐清 ${subject} 如何產生、如何暴露，以及影響哪些系統。`,
        reason: "環境主題需要把來源與影響路徑拆開，才能形成有效 query plan。",
        queries: bilingualQueries(
          [`${subject} 來源 暴露 影響`],
          en,
          ["source exposure impact", "environmental pathway"],
        ),
      },
      {
        title: `${subject}對生態或健康的主要影響`,
        angle: `整理 ${subject} 對生態系、人體或公共環境的主要影響。`,
        reason: "這能對接學術研究與政策型來源。",
        queries: bilingualQueries(
          [`${subject} 生態 健康 影響`],
          en,
          ["health impact ecology", "environmental evidence"],
        ),
      },
      {
        title: `${subject}的監測、治理與政策回應`,
        angle: `比較 ${subject} 的監測方法、治理策略與政策回應。`,
        reason: "若資料缺口出現在在地案例或官方數據，這個方向特別重要。",
        queries: bilingualQueries(
          [`${subject} 監測 政策 治理`],
          en,
          ["monitoring policy management", "official report data"],
        ),
      },
    ],
    social_science: [
      {
        title: `${subject}的背景脈絡與核心問題`,
        angle: `先界定 ${subject} 的社會背景、利害關係人與核心爭點。`,
        reason: "社會議題需要先收斂問題範圍，避免搜尋時過度發散。",
        queries: bilingualQueries(
          [`${subject} 背景 問題`],
          en,
          ["background key issues", "stakeholder overview"],
        ),
      },
      {
        title: `${subject}的數據、案例與影響`,
        angle: `整理 ${subject} 的統計資料、代表案例與影響差異。`,
        reason: "這能把泛社會議題轉成可驗證的資料面向。",
        queries: bilingualQueries(
          [`${subject} 統計 案例 影響`],
          en,
          ["data case study impact", "evidence report"],
        ),
      },
      {
        title: `${subject}的政策或行動方案`,
        angle: `比較 ${subject} 已有政策、制度或改善方案的效果與限制。`,
        reason: "可作為結論與建議章節的直接證據基礎。",
        queries: bilingualQueries(
          [`${subject} 政策 改善`],
          en,
          ["policy intervention", "recommendation evaluation"],
        ),
      },
    ],
    general_research: [
      {
        title: `${subject}的背景脈絡與基本情境`,
        angle: `先整理 ${subject} 的背景脈絡、使用情境與常見研究面向。`,
        reason: "這能避免後續所有搜尋都只用原始題目完整句硬查。",
        queries: [`${subject} 背景脈絡`, `${subject} 使用情境`, `${subject} 研究面向`],
      },
      {
        title: `${subject}的案例比較與觀察指標`,
        angle: `把 ${subject} 拆成案例比較、觀察指標與應用差異等可研究方向。`,
        reason: "單一詞主題需要先轉成研究問題，才有機會找到學術資料。",
        queries: [`${subject} 案例比較`, `${subject} 觀察指標`, `${subject} 應用差異`],
      },
      {
        title: `${subject}的風險、限制與延伸方向`,
        angle: `整理 ${subject} 的風險、限制與可延伸研究方向。`,
        reason: "這有助於後續 gap-driven supplemental search。",
        queries: [`${subject} 風險`, `${subject} 限制`, `${subject} 延伸研究`],
      },
    ],
    food_nutrition: [],
    beverage_health: [],
    consumer_product: [],
    automotive_business: [],
    music_culture: [],
    household_safety: [],
    materials_design: [],
    biology: [],
    health: [],
    history_culture: [],
  };
  const direct = domainTemplates[domain];
  if (direct.length > 0) return direct;
  if (domain === "health") {
    return [
      {
        title: `${subject}的暴露、攝取或接觸情境`,
        angle: `釐清 ${subject} 的接觸來源、暴露方式與研究對象。`,
        reason: "健康題目需要先確認暴露情境，才能判斷後續證據強度。",
        queries: bilingualQueries(
          [`${subject} 暴露 攝取 接觸`],
          en,
          ["exposure intake", "population study"],
        ),
      },
      {
        title: `${subject}對健康的機制與影響`,
        angle: `整理 ${subject} 對健康、風險或生理機制的主要研究結果。`,
        reason: "這是健康研究最常對接的學術來源面向。",
        queries: bilingualQueries(
          [`${subject} 健康 影響 機制`],
          en,
          ["health effect mechanism", "risk evidence"],
        ),
      },
      {
        title: `${subject}的防治、建議與限制`,
        angle: `比較 ${subject} 的風險管理、建議攝取或政策限制。`,
        reason: "可支撐討論與結論章節。",
        queries: bilingualQueries(
          [`${subject} 建議 防治 限制`],
          en,
          ["guideline prevention limitation", "public health recommendation"],
        ),
      },
    ];
  }
  return domainTemplates.general_research;
}

function taxonomyQueries(result: TopicUnderstandingResult | undefined): string[] {
  if (!result) return [];
  return uniqueStrings(
    result.researchAngles.flatMap((angle) => [...angle.zhQueries, ...angle.enQueries]),
  );
}

function isLowValueTemplateQuery(query: string): boolean {
  return /definition|scope|concept|evidence|measurable indicators|indicators|dataset|research questions|official data review|定義|範圍|可驗證|指標|資料集|研究證據|研究面向/i.test(query);
}

function shouldReuseTaxonomyQueries(result: TopicUnderstandingResult | undefined): boolean {
  if (!result) return false;
  return Boolean(result.entity) || Boolean(taxonomyCanonicalEnglishTopic(result));
}

function taxonomyCanonicalEnglishTopic(result: TopicUnderstandingResult | undefined): string {
  const value = (result as unknown as Record<string, unknown> | undefined)?.canonicalEnglishTopic;
  return typeof value === "string" ? value.trim() : "";
}

function taxonomyCoreConcepts(result: TopicUnderstandingResult | undefined): string[] {
  const value = (result as unknown as Record<string, unknown> | undefined)?.coreConcepts;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function convertFallback(result: TopicUnderstandingResult): TopicUnderstanding {
  return {
    normalizedTopic: result.normalizedTopic,
    domain: result.domain,
    subdomain: result.topicKind,
    topicKind: result.topicKind === "brand_or_product" || result.topicKind === "cultural_artifact"
      ? "ambiguous"
      : result.topicKind === "known_entity" || result.topicKind === "specific_research_topic" || result.topicKind === "broad_common_noun" || result.topicKind === "ambiguous" || result.topicKind === "unknown_or_noise"
        ? result.topicKind
        : "ambiguous",
    entities: result.canonicalTerms.length ? result.canonicalTerms : result.aliases,
    canonicalEnglishTopic: taxonomyCanonicalEnglishTopic(result),
    coreConcepts: taxonomyCoreConcepts(result),
    likelyMeanings: result.researchAngles.map((angle) => angle.researchQuestion).slice(0, 5),
    ambiguityWarnings: result.needsClarification
      ? ["主題尚未完全收斂，已採用 taxonomy fallback。"]
      : [],
    excludedDriftTerms: result.excludedDriftTerms,
    researchAngles: result.researchAngles.slice(0, 5).map((angle) => ({
      title: angle.label,
      angle: angle.researchQuestion,
      reason: angle.whyResearchable,
      searchQueries: [...angle.zhQueries, ...angle.enQueries].slice(0, 6),
    })),
    diagnostics: {
      usedLocalLlm: false,
      fallbackReason: "taxonomy-fallback",
      confidence: result.needsClarification ? 0.42 : 0.62,
    },
  };
}

export function understandTopicHeuristically(
  input: TopicUnderstandingRequest,
  taxonomy?: TopicUnderstandingResult,
): TopicUnderstanding {
  const normalizedTopic = compactWhitespace(input.topic);
  const topicKind = inferTopicKind(normalizedTopic, splitTopicTerms(normalizedTopic), taxonomy);
  const invalidReason = invalidInputReason(normalizedTopic);
  if (invalidReason) {
    return {
      normalizedTopic,
      domain: taxonomy?.domain ?? "general_research",
      subdomain: "invalid_input",
      topicKind: "unknown_or_noise",
      entities: normalizedTopic ? [normalizedTopic] : [],
      canonicalEnglishTopic: taxonomyCanonicalEnglishTopic(taxonomy),
      coreConcepts: normalizedTopic ? [normalizedTopic] : [],
      likelyMeanings: [],
      ambiguityWarnings: ["輸入內容缺少可辨識研究語意，已判定為無效主題。"],
      excludedDriftTerms: taxonomy?.excludedDriftTerms ?? [],
      researchAngles: [],
      diagnostics: {
        usedLocalLlm: false,
        fallbackReason: invalidReason,
        confidence: 0.1,
      },
    };
  }

  const domain = inferDomain(normalizedTopic, taxonomy);
  const subject = extractPrimarySubject(normalizedTopic);
  const profile = inferResearchProfile(normalizedTopic, domain);
  const terms = splitTopicTerms(normalizedTopic);
  const taxonomyEntities = taxonomy
    ? uniqueStrings([
        ...taxonomy.canonicalTerms,
        ...taxonomy.aliases,
        ...taxonomy.englishTerms,
        ...taxonomy.scientificNames,
      ])
    : [];
  const englishTerms = uniqueStrings([
    ...terms.filter((term) => containsLatin(term)),
    ...(taxonomy?.englishTerms ?? []),
    taxonomyCanonicalEnglishTopic(taxonomy),
  ]);
  const canonicalEnglishTopic =
    englishTerms.find((term) => /[A-Za-z]/.test(term)) ??
    "";
  const entities = uniqueStrings([
    subject,
    normalizedTopic,
    ...terms,
    ...taxonomyEntities,
  ]).slice(0, 8);
  const coreConcepts = uniqueStrings([
    ...profileCoreConcepts(profile, subject, canonicalEnglishTopic),
    ...domainCoreConcepts(domain, subject),
  ]).slice(0, 8);
  const heuristicAngles = angleTemplates(domain, normalizedTopic, canonicalEnglishTopic)
    .map((angle) => ({
      title: angle.title,
      angle: angle.angle,
      reason: angle.reason,
      searchQueries: uniqueStrings([
        ...angle.queries,
        ...(shouldReuseTaxonomyQueries(taxonomy)
          ? taxonomyQueries(taxonomy).filter((query) =>
              !isLowValueTemplateQuery(query) &&
              (query.includes(subject) ||
                query.includes(normalizedTopic) ||
                (canonicalEnglishTopic &&
                  query.toLowerCase().includes(canonicalEnglishTopic.toLowerCase()))),
            )
          : []),
      ]).slice(0, 6),
    }))
    .slice(0, 4);
  const likelyMeanings = uniqueStrings([
    ...heuristicAngles.map((angle) => angle.angle),
    ...(taxonomy?.researchAngles.map((angle) => angle.researchQuestion) ?? []),
  ]).slice(0, 5);
  const ambiguityWarnings = uniqueStrings([
    topicKind === "ambiguous" || topicKind === "broad_common_noun"
      ? "主題仍偏寬泛，搜尋時會優先拆成多個研究角度。"
      : null,
    !canonicalEnglishTopic && containsCjk(normalizedTopic)
      ? "目前缺少穩定英文對應詞，會先以中文語意與角度查詢，再由來源反推英文術語。"
      : null,
    taxonomy && taxonomy.needsClarification
      ? "taxonomy 顯示此主題仍可能有多重意義，已保留多角度查詢。"
      : null,
  ]);

  return {
    normalizedTopic,
    domain,
    subdomain: topicKind,
    topicKind,
    entities,
    canonicalEnglishTopic,
    coreConcepts,
    likelyMeanings,
    ambiguityWarnings,
    excludedDriftTerms: taxonomy?.excludedDriftTerms ?? [],
    researchAngles: heuristicAngles,
    diagnostics: {
      usedLocalLlm: false,
      fallbackReason: taxonomy ? "heuristic-with-taxonomy-enrichment" : "heuristic-fallback",
      confidence: canonicalEnglishTopic || heuristicAngles.length >= 3 ? 0.66 : 0.54,
    },
  };
}

function normalizeLlmTopic(value: unknown): TopicUnderstanding | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const normalizedTopic = typeof data.normalizedTopic === "string" ? data.normalizedTopic.trim() : "";
  const domain = typeof data.domain === "string" ? data.domain.trim() : "";
  const subdomain = typeof data.subdomain === "string" ? data.subdomain.trim() : "";
  const topicKind = typeof data.topicKind === "string" ? data.topicKind.trim() : subdomain;
  const entities = Array.isArray(data.entities)
    ? data.entities.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const canonicalEnglishTopic =
    typeof data.canonicalEnglishTopic === "string" ? data.canonicalEnglishTopic.trim() : "";
  const coreConcepts = Array.isArray(data.coreConcepts)
    ? data.coreConcepts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const likelyMeanings = Array.isArray(data.likelyMeanings)
    ? data.likelyMeanings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const ambiguityWarnings = Array.isArray(data.ambiguityWarnings)
    ? data.ambiguityWarnings.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const excludedDriftTerms = Array.isArray(data.excludedDriftTerms)
    ? data.excludedDriftTerms.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const researchAngles = Array.isArray(data.researchAngles)
    ? data.researchAngles
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const angle = item as Record<string, unknown>;
          const title = typeof angle.title === "string" ? angle.title.trim() : "";
          const angleText = typeof angle.angle === "string" ? angle.angle.trim() : "";
          const reason = typeof angle.reason === "string" ? angle.reason.trim() : "";
          const searchQueries = Array.isArray(angle.searchQueries)
            ? angle.searchQueries.filter((query): query is string => typeof query === "string" && query.trim().length > 0)
            : [];
          if (!title || !angleText || !reason || searchQueries.length === 0) return null;
          return { title, angle: angleText, reason, searchQueries };
        })
        .filter((item): item is { title: string; angle: string; reason: string; searchQueries: string[] } => Boolean(item))
    : [];
  const diagnostics = data.diagnostics && typeof data.diagnostics === "object"
    ? (data.diagnostics as Record<string, unknown>)
    : null;
  const confidence = diagnostics && typeof diagnostics.confidence === "number" && Number.isFinite(diagnostics.confidence)
    ? diagnostics.confidence
    : NaN;
  if (!normalizedTopic || !domain || !subdomain || entities.length === 0 || !diagnostics || Number.isNaN(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }
  return {
    normalizedTopic,
    domain: domain as TopicDomain,
    subdomain,
    topicKind:
      topicKind === "specific_research_topic" || topicKind === "known_entity" || topicKind === "broad_common_noun" || topicKind === "ambiguous" || topicKind === "unknown_or_noise"
        ? topicKind
        : "ambiguous",
    entities,
    canonicalEnglishTopic,
    coreConcepts,
    likelyMeanings,
    ambiguityWarnings,
    excludedDriftTerms,
    researchAngles,
    diagnostics: {
      usedLocalLlm: typeof diagnostics.usedLocalLlm === "boolean" ? diagnostics.usedLocalLlm : false,
      fallbackReason: typeof diagnostics.fallbackReason === "string" ? diagnostics.fallbackReason : undefined,
      confidence,
      model: typeof diagnostics.model === "string" ? diagnostics.model : undefined,
      latencyMs: typeof diagnostics.latencyMs === "number" && Number.isFinite(diagnostics.latencyMs)
        ? diagnostics.latencyMs
        : undefined,
    },
  };
}

export async function understandTopicWithFallback(
  input: TopicUnderstandingRequest,
  options: {
    fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  } = {},
): Promise<TopicUnderstanding> {
  const taxonomy = understandTopic(input.topic);
  const heuristicFallback = understandTopicHeuristically(input, taxonomy);
  const taxonomyFallback = convertFallback(taxonomy);
  const llmAttempt = await requestLocalLlmJson<TopicUnderstanding>({
    purpose: "planner",
    fetchImpl: options.fetchImpl,
    messages: [
      {
        role: "system",
        content: [
          "Return JSON only.",
          "You are a topic understanding service for research workflows.",
          "Do not invent facts.",
          "Focus on normalizedTopic, domain, subdomain, topicKind, entities, canonicalEnglishTopic, coreConcepts, likelyMeanings, ambiguityWarnings, excludedDriftTerms, and researchAngles.",
          "Each research angle must include title, angle, reason, and searchQueries.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          ...input,
          heuristicFallback,
        }),
      },
    ],
    validate: normalizeLlmTopic,
  });

  if (llmAttempt.value) {
    return {
      ...heuristicFallback,
      ...llmAttempt.value,
      entities: uniqueStrings([
        ...llmAttempt.value.entities,
        ...heuristicFallback.entities,
      ]),
      coreConcepts: uniqueStrings([
        ...llmAttempt.value.coreConcepts,
        ...heuristicFallback.coreConcepts,
      ]),
      excludedDriftTerms: uniqueStrings([
        ...llmAttempt.value.excludedDriftTerms,
        ...heuristicFallback.excludedDriftTerms,
      ]),
      diagnostics: {
        ...heuristicFallback.diagnostics,
        ...llmAttempt.value.diagnostics,
      },
    };
  }

  return {
    ...(taxonomy.topicKind === "unknown_or_noise" ? heuristicFallback : {
      ...heuristicFallback,
      canonicalEnglishTopic:
        heuristicFallback.canonicalEnglishTopic || taxonomyFallback.canonicalEnglishTopic,
      coreConcepts: uniqueStrings([
        ...heuristicFallback.coreConcepts,
        ...taxonomyFallback.coreConcepts,
      ]),
      entities: uniqueStrings([
        ...heuristicFallback.entities,
        ...taxonomyFallback.entities,
      ]),
      likelyMeanings: uniqueStrings([
        ...heuristicFallback.likelyMeanings,
        ...taxonomyFallback.likelyMeanings,
      ]),
      excludedDriftTerms: uniqueStrings([
        ...heuristicFallback.excludedDriftTerms,
        ...taxonomyFallback.excludedDriftTerms,
      ]),
      researchAngles:
        heuristicFallback.researchAngles.length > 0
          ? heuristicFallback.researchAngles
          : taxonomyFallback.researchAngles,
    }),
    diagnostics: {
      ...heuristicFallback.diagnostics,
      usedLocalLlm: llmAttempt.diagnostics.usedLocalLlm,
      fallbackReason: llmAttempt.diagnostics.fallbackReason ?? heuristicFallback.diagnostics.fallbackReason,
      model: llmAttempt.diagnostics.model,
      latencyMs: llmAttempt.diagnostics.latencyMs,
    },
  };
}
