import type {
  ExpandedQuery,
  IntroClaim,
  IntroValidation,
  ReadableExtraction,
  RelevanceScore,
  ResearchDebugTrace,
  PipelineEvidenceCard,
  SourceFact,
  SourceFactCategory,
  SourceSearchConfig,
  SourceSummary,
  SourceValidation,
  TopicSemanticClassification,
} from "@workspace/api-zod";
import type { SourceRecord } from "@workspace/api-zod";

export const DEFAULT_SOURCE_SEARCH_CONFIG: SourceSearchConfig = {
  candidateTarget: 80,
  acceptedTarget: 20,
  minAccepted: 5,
};

const TEMPLATE_PATTERNS = [
  /看不見的/u,
  /看不到的/u,
  /隱藏在.+背後的科學/u,
  /神秘的/u,
  /從.+看見/u,
  /你不知道的/u,
  /背後的秘密/u,
];

function clean(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sourceId(source: SourceRecord): string {
  return source.id || source.dedupeKey || `${source.sourceType}:${source.title}`;
}

function containsZh(value: string): boolean {
  return /[\u4e00-\u9fff]/u.test(value);
}

function normalizedTopic(topic: string): string {
  return clean(topic).replace(/[「」《》〈〉"']/g, "");
}

function englishTopicSeed(topic: string, concepts: string[]): string {
  const english = concepts.filter((concept) => /[A-Za-z]/.test(concept)).slice(0, 4);
  return english.length ? english.join(" ") : topic;
}

export function classifyTopicSemantically(topic: string): TopicSemanticClassification {
  const normalized = normalizedTopic(topic);
  const lower = normalized.toLowerCase();
  const text = normalized;

  if (
    /氧化還原|redox|oxidation.?reduction/i.test(lower) ||
    /皂化|saponification|水解|hydrolysis|反應|reaction|氧化|還原|酸鹼|沉澱|酯/u.test(text)
  ) {
    const redox = /氧化還原|redox|oxidation.?reduction/i.test(lower);
    const saponification = /皂化|saponification/u.test(text) || /saponification/i.test(lower);
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "chemistry_reaction",
      confidence: redox || saponification ? 0.92 : 0.78,
      reason: "題目指向化學反應、反應機制或物質轉換，後續搜尋需包含定義、機制、可觀察現象與應用。",
      keyConcepts: unique([
        ...(redox
          ? [
              "electron transfer",
              "oxidation",
              "reduction",
              "oxidation state",
              "oxidizing agent",
              "reducing agent",
            ]
          : []),
        ...(saponification
          ? [
              "saponification reaction",
              "alkaline hydrolysis of esters",
              "ester hydrolysis",
              "soap-making reaction",
            ]
          : []),
        "chemical reaction",
        "reaction mechanism",
        "observable phenomenon",
        "application",
      ]),
      observableLevel: redox
        ? {
            microscopic: "electron transfer is not directly visible",
            macroscopic:
              "color change, corrosion, combustion, heat release, fading, metal deposition may be observable",
          }
        : {
            microscopic: "bond breaking and formation are not directly visible",
            macroscopic: "pH change, precipitate, texture, color, heat or product formation may be observable",
          },
    };
  }

  if (/微塑膠|污染|plastic pollution|microplastic|環境|氣候|廢棄|永續|綠屋頂|屋頂綠化|green roof/u.test(text)) {
    const isMicroplastic = /微塑膠|塑膠微粒|microplastic/i.test(text);
    const isUrbanHeat = /都市熱島|熱島|urban heat|heat island|校園.*熱|微氣候/u.test(text);
    const isGreenRoof = /綠屋頂|屋頂綠化|green roof/i.test(text);
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "environmental_issue",
      confidence: 0.88,
      reason: "題目涉及污染、暴露、環境影響或治理資料。",
      keyConcepts: unique(
        isMicroplastic
          ? [
              "microplastics pollution",
              "environmental pollution",
              "exposure pathway",
              "ecological impact",
              "monitoring",
              "government report",
              "environmental research",
            ]
          : isUrbanHeat
            ? [
                "urban heat island",
                "thermal comfort",
                "school campus",
                "microclimate",
                "heat stress",
                "thermal environment",
              ]
            : isGreenRoof
              ? [
                  "green roof",
                  "building cooling",
                  "roof surface temperature",
                  "cooling load",
                  "energy consumption",
                  "thermal performance",
                ]
            : [
                "environmental impact",
                "monitoring",
                "government report",
                "environmental research",
              ],
      ),
    };
  }

  if (/克卜勒|kepler|第三定律|物理|力學|軌道|定律|phenomenon|law/u.test(text)) {
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "physics_phenomenon",
      confidence: 0.86,
      reason: "題目指向物理定律、現象或可量測關係。",
      keyConcepts: unique([
        "physics law",
        "orbital mechanics",
        "mathematical relationship",
        "measurement",
        "scientific explanation",
      ]),
    };
  }

  if (/沙門氏菌|感染|細菌|病毒|生物|機制|螞蟻|覓食|營養|蛋白質|nutrition|salmonella|foraging/u.test(text)) {
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "biology_mechanism",
      confidence: 0.84,
      reason: "題目涉及生物機制、行為、感染、營養或健康影響。",
      keyConcepts: unique([
        "biological mechanism",
        "physiology",
        "behavior",
        "health effect",
        "prevention",
        "evidence review",
      ]),
    };
  }

  if (/高中|學習|教育|課堂|學生|education|learning|school/u.test(text)) {
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "education_topic",
      confidence: 0.82,
      reason: "題目聚焦教育情境、學生學習或教學影響。",
      keyConcepts: unique([
        "education",
        "learning outcomes",
        "student engagement",
        "secondary education",
        "educational technology",
      ]),
    };
  }

  if (/系統|自動|平台|工作流|資料整理|資訊檢索|引用|workflow|retrieval|system/u.test(text)) {
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "engineering_system",
      confidence: 0.8,
      reason: "題目描述工程系統、資訊流程或自動化工具。",
      keyConcepts: unique([
        "information retrieval",
        "workflow system",
        "summarization",
        "citation management",
        "automation",
      ]),
    };
  }

  if (/資料|數據|分析|dataset|analytics/u.test(text)) {
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "data_analysis_topic",
      confidence: 0.74,
      reason: "題目需要從資料整理、分析方法或指標角度展開。",
      keyConcepts: unique(["data analysis", "dataset", "method", "indicator", "workflow"]),
    };
  }

  if (/社會|影響|政策|公共|議題|social|policy/u.test(text)) {
    return {
      originalTopic: topic,
      normalizedTopic: normalized,
      primaryType: "social_issue",
      confidence: 0.7,
      reason: "題目涉及社會影響、政策或公共議題。",
      keyConcepts: unique(["social issue", "policy", "public impact", "stakeholders"]),
    };
  }

  return {
    originalTopic: topic,
    normalizedTopic: normalized,
    primaryType: "general_research_topic",
    confidence: normalized.length >= 3 ? 0.48 : 0.25,
    reason: "主題語意訊號不足，使用保守一般研究 fallback。",
    keyConcepts: normalized ? [normalized, "background", "research angle"] : [],
  };
}

function expandedQuery(
  query: string,
  language: ExpandedQuery["language"],
  purpose: ExpandedQuery["purpose"],
  source: ExpandedQuery["source"],
  confidence: number,
): ExpandedQuery {
  return { query: clean(query), language, purpose, source, confidence: clamp01(confidence) };
}

export function expandBilingualQueries(
  classification: TopicSemanticClassification,
  seeds: {
    zh?: string[];
    en?: string[];
    plannerZh?: string[];
    plannerEn?: string[];
  } = {},
): ExpandedQuery[] {
  const topic = classification.normalizedTopic;
  const queries: ExpandedQuery[] = [];
  const add = (query: ExpandedQuery) => {
    if (!query.query) return;
    if (queries.some((existing) => existing.query.toLowerCase() === query.query.toLowerCase())) return;
    queries.push(query);
  };

  add(expandedQuery(topic, containsZh(topic) ? "zh-TW" : "en", "definition", "semantic_classification", 0.94));

  if (classification.primaryType === "chemistry_reaction") {
    const isRedox = /氧化還原|redox|oxidation.?reduction/i.test(topic);
    const isSaponification = /皂化|saponification/i.test(topic);
    const zh = isRedox
      ? ["氧化還原反應", "氧化數變化", "電子轉移", "氧化劑 還原劑"]
      : isSaponification
        ? ["皂化反應", "皂化作用", "油脂鹼性水解", "酯類水解"]
        : [`${topic} 反應機制`, `${topic} 可觀察現象`, `${topic} 應用`];
    const en = isRedox
      ? [
          "redox reaction",
          "oxidation-reduction reaction",
          "electron transfer",
          "oxidation state",
          "oxidizing agent reducing agent",
        ]
      : isSaponification
        ? [
            "saponification reaction",
            "alkaline hydrolysis of esters",
            "ester hydrolysis",
            "soap-making reaction chemistry",
          ]
        : [
            `${englishTopicSeed(topic, classification.keyConcepts)} reaction mechanism`,
            `${englishTopicSeed(topic, classification.keyConcepts)} observable evidence`,
            `${englishTopicSeed(topic, classification.keyConcepts)} applications chemistry`,
          ];
    zh.forEach((query, index) =>
      add(expandedQuery(query, "zh-TW", index === 0 ? "definition" : "mechanism", "semantic_classification", 0.9)),
    );
    en.forEach((query, index) =>
      add(expandedQuery(query, "en", index <= 1 ? "academic_source" : "mechanism", "semantic_classification", 0.9)),
    );
  }

  if (classification.primaryType === "environmental_issue") {
    const isMicroplastic = /微塑膠|塑膠微粒|microplastic/i.test(topic);
    const hasPlannerEnglish = Boolean(seeds.plannerEn?.length || seeds.en?.length);
    const englishQueries = isMicroplastic || !hasPlannerEnglish
      ? [
          isMicroplastic
            ? "microplastics pollution sources impacts review"
            : `${englishTopicSeed(topic, classification.keyConcepts)} environmental impact review`,
          isMicroplastic
            ? "microplastics monitoring government report"
            : `${englishTopicSeed(topic, classification.keyConcepts)} monitoring government report`,
        ]
      : [];
    [
      `${topic} 來源 影響 治理`,
      `${topic} 學術研究`,
      ...englishQueries,
    ].forEach((query, index) =>
      add(
        expandedQuery(
          query,
          containsZh(query) ? "zh-TW" : "en",
          index < 2 ? "background" : "academic_source",
          "semantic_classification",
          0.84,
        ),
      ),
    );
  }

  if (classification.primaryType === "biology_mechanism") {
    [
      `${topic} 機制`,
      `${topic} 影響 預防`,
      `${englishTopicSeed(topic, classification.keyConcepts)} mechanism review`,
      `${englishTopicSeed(topic, classification.keyConcepts)} health effect evidence`,
    ].forEach((query, index) =>
      add(
        expandedQuery(
          query,
          containsZh(query) ? "zh-TW" : "en",
          index < 2 ? "mechanism" : "academic_source",
          "semantic_classification",
          0.82,
        ),
      ),
    );
  }

  if (classification.primaryType === "physics_phenomenon") {
    [
      `${topic} 原理`,
      `${topic} 公式 證據`,
      `${englishTopicSeed(topic, classification.keyConcepts)} physics explanation`,
      `${englishTopicSeed(topic, classification.keyConcepts)} educational astronomy`,
    ].forEach((query, index) =>
      add(
        expandedQuery(
          query,
          containsZh(query) ? "zh-TW" : "en",
          index < 2 ? "definition" : "academic_source",
          "semantic_classification",
          0.82,
        ),
      ),
    );
  }

  if (classification.primaryType === "education_topic") {
    [
      `${topic} 學習成效`,
      `${topic} 高中生 研究`,
      `${englishTopicSeed(topic, classification.keyConcepts)} secondary education learning outcomes`,
      `${englishTopicSeed(topic, classification.keyConcepts)} student engagement review`,
    ].forEach((query, index) =>
      add(
        expandedQuery(
          query,
          containsZh(query) ? "zh-TW" : "en",
          index < 2 ? "research_angle" : "academic_source",
          "semantic_classification",
          0.82,
        ),
      ),
    );
  }

  if (classification.primaryType === "engineering_system") {
    [
      `${topic} 系統流程`,
      `${topic} 資訊檢索 摘要 引用`,
      `${englishTopicSeed(topic, classification.keyConcepts)} information retrieval summarization workflow`,
      `${englishTopicSeed(topic, classification.keyConcepts)} citation management automation`,
    ].forEach((query, index) =>
      add(
        expandedQuery(
          query,
          containsZh(query) ? "zh-TW" : "en",
          index < 2 ? "mechanism" : "academic_source",
          "semantic_classification",
          0.82,
        ),
      ),
    );
  }

  seeds.zh?.forEach((query) => add(expandedQuery(query, "zh-TW", "research_angle", "translation", 0.72)));
  seeds.en?.forEach((query) => add(expandedQuery(query, "en", "academic_source", "translation", 0.74)));
  seeds.plannerZh?.forEach((query) => add(expandedQuery(query, "zh-TW", "research_angle", "llm_expansion", 0.7)));
  seeds.plannerEn?.forEach((query) => add(expandedQuery(query, "en", "academic_source", "llm_expansion", 0.72)));

  if (!queries.some((query) => query.language === "en")) {
    add(expandedQuery(`${englishTopicSeed(topic, classification.keyConcepts)} research review`, "en", "academic_source", "fallback", 0.52));
  }
  if (!queries.some((query) => query.language === "zh-TW") && containsZh(topic)) {
    add(expandedQuery(`${topic} 研究`, "zh-TW", "background", "fallback", 0.52));
  }

  return queries.slice(0, 28);
}

function canonicalUrl(source: SourceRecord): string | undefined {
  return (
    source.sourceLinkInfo?.doiUrl ??
    source.sourceLinkInfo?.canonicalUrl ??
    source.url ??
    source.sourceLinkInfo?.metadataUrl ??
    undefined
  );
}

function validationSourceType(source: SourceRecord): SourceValidation["sourceType"] {
  const text = `${source.sourceType} ${source.sourceKind ?? ""} ${source.publisher ?? ""} ${source.containerTitle ?? ""} ${source.url ?? ""}`.toLowerCase();
  if (source.doi || source.sourceKind === "journal" || /journal|期刊/.test(text)) return "journal";
  if (/openalex|crossref|semantic scholar|database|doi/.test(text)) return "academic_database";
  if (/\.gov|gov\.tw|who\.int|un\.org|oecd\.org|nasa|noaa|epa/.test(text)) return "government";
  if (/\.edu|university|college|school|大學|教育/.test(text)) return "education";
  if (/news|media|reuters|bbc|nyt|cnn|guardian|bloomberg/.test(text)) return "news";
  if (/wikipedia|encyclopedia|百科/.test(text)) return "encyclopedia";
  if (/blog|medium\.com|substack/.test(text)) return "blog";
  return "unknown";
}

export function validateSource(source: SourceRecord): SourceValidation {
  const canonical = canonicalUrl(source);
  const warnings = unique([
    ...(source.sourceLinkInfo?.linkWarnings ?? []),
    !canonical ? "missing_canonical_url" : "",
    source.sourceLinkInfo?.accessStatus === "metadata_only" ? "source_link_may_be_unavailable" : "",
    source.sourceLinkInfo?.accessStatus === "unknown" && !source.doi ? "url_not_verified" : "",
  ].filter(Boolean));
  const type = validationSourceType(source);
  const typeBonus = {
    journal: 0.92,
    academic_database: 0.86,
    government: 0.9,
    education: 0.78,
    news: 0.56,
    encyclopedia: 0.46,
    blog: 0.28,
    unknown: 0.32,
  } satisfies Record<SourceValidation["sourceType"], number>;
  const reliability = clamp01(
    typeBonus[type] +
      (source.doi ? 0.05 : 0) +
      (source.abstract?.trim() ? 0.03 : 0) -
      (warnings.includes("source_link_may_be_unavailable") ? 0.08 : 0),
  );
  return {
    sourceId: sourceId(source),
    urlReachable: Boolean(canonical) && !warnings.includes("missing_canonical_url"),
    ...(canonical ? { canonicalUrl: canonical } : {}),
    ...(source.doi ? { doi: source.doi } : {}),
    ...(source.publisher ? { publisher: source.publisher } : {}),
    ...(source.year ? { year: source.year } : {}),
    sourceType: type,
    reliabilityScore: reliability,
    warnings,
  };
}

function detectLanguage(text: string): ReadableExtraction["language"] {
  if (!text) return "unknown";
  if (containsZh(text)) return "zh-TW";
  if (/[A-Za-z]/.test(text)) return "en";
  return "unknown";
}

export function extractReadable(source: SourceRecord): ReadableExtraction {
  const title = clean(source.title);
  const abstract = clean(source.abstract);
  const extractedText = clean(source.extractedText) || clean(source.snippet);
  const content = abstract || extractedText;
  const extractionWarnings = unique([
    !abstract ? "missing_abstract" : "",
    !content ? "no_readable_content" : "",
  ].filter(Boolean));
  return {
    sourceId: sourceId(source),
    title,
    ...(abstract ? { abstract } : {}),
    ...(extractedText ? { extractedText } : {}),
    extractionStatus: content.length >= 80 ? "success" : content.length > 0 ? "partial" : "failed",
    language: detectLanguage(`${title} ${content}`),
    extractionWarnings,
  };
}

function splitSentences(text: string): string[] {
  return clean(text)
    .split(/(?<=[.!?。！？])\s+|[。！？]\s*/u)
    .map(clean)
    .filter((sentence) => sentence.length >= 18)
    .slice(0, 24);
}

function categoryForSentence(
  sentence: string,
  classification: TopicSemanticClassification,
): SourceFactCategory {
  const lower = sentence.toLowerCase();
  if (/define|definition|refers to|is a|稱為|是指|定義|概念/u.test(sentence)) return "definition";
  if (/mechanism|process|pathway|transfer|hydrolysis|oxidation|reduction|機制|過程|電子|水解|氧化|還原|感染|傳播|覓食/u.test(sentence)) return "mechanism";
  if (/observe|observable|color|corrosion|combustion|heat|phenomen|顏色|腐蝕|燃燒|放熱|析出|觀察|現象/u.test(sentence)) return "observable_phenomenon";
  if (/application|use|industry|soap|treatment|prevention|應用|製備|預防|治理|使用/u.test(sentence)) return "application";
  if (/method|measure|survey|analysis|experiment|方法|測量|分析|實驗/u.test(sentence)) return "method";
  if (/limit|uncertain|lack|insufficient|限制|不足|不確定/u.test(sentence)) return "limitation";
  if (classification.primaryType === "chemistry_reaction" && /reaction|反應|化學/u.test(lower)) return "mechanism";
  return "background";
}

function termHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term.toLowerCase())).length;
}

export function extractSourceFacts(
  source: SourceRecord,
  extraction: ReadableExtraction,
  classification: TopicSemanticClassification,
): SourceFact[] {
  const content = clean([extraction.abstract, extraction.extractedText].filter(Boolean).join(" "));
  if (!content) return [];
  const concepts = unique([
    classification.normalizedTopic,
    ...classification.keyConcepts,
    ...classification.normalizedTopic.split(/\s+/u),
  ]).filter((term) => clean(term).length >= 2);
  return splitSentences(content)
    .map((sentence): SourceFact | null => {
      const hits = termHits(sentence, concepts);
      const category = categoryForSentence(sentence, classification);
      const baseline =
        category === "definition" || category === "mechanism" || category === "observable_phenomenon"
          ? 0.18
          : 0.08;
      const relevanceToTopic = clamp01(baseline + hits * 0.18 + (sentence.length >= 60 ? 0.08 : 0));
      if (relevanceToTopic < 0.18) return null;
      return {
        sourceId: sourceId(source),
        fact: sentence.length > 180 ? `${sentence.slice(0, 177)}...` : sentence,
        category,
        relevanceToTopic,
        supportedByText: sentence.length > 220 ? `${sentence.slice(0, 217)}...` : sentence,
      };
    })
    .filter((fact): fact is SourceFact => Boolean(fact))
    .slice(0, 4);
}

export function scorePipelineRelevance(
  source: SourceRecord,
  validation: SourceValidation,
  extraction: ReadableExtraction,
  facts: SourceFact[],
  classification: TopicSemanticClassification,
  expandedQueries: ExpandedQuery[],
): RelevanceScore {
  const text = clean(`${source.title} ${source.abstract ?? ""} ${source.extractedText ?? ""} ${source.queryUsed ?? ""}`);
  const topicTerms = unique([classification.normalizedTopic, ...classification.keyConcepts]).filter(Boolean);
  const queryTerms = expandedQueries.flatMap((query) => query.query.split(/\s+|，|、|,/u)).filter((term) => clean(term).length >= 3);
  const topicMatch = clamp01((termHits(text, topicTerms) + (source.relevanceScore ?? 0) / 50) / 4);
  const semanticMatch = clamp01(
    facts.some((fact) => fact.category === "mechanism" || fact.category === "definition") ? 0.78 : termHits(text, classification.keyConcepts) / 4,
  );
  const queryMatch = clamp01((termHits(text, queryTerms) + (source.queryUsed ? 1 : 0)) / 5);
  const usefulCategories = new Set(facts.map((fact) => fact.category));
  const evidenceUsefulness = clamp01(
    facts.reduce((sum, fact) => sum + fact.relevanceToTopic, 0) / Math.max(1, facts.length) +
      usefulCategories.size * 0.08 +
      (extraction.extractionStatus === "success" ? 0.1 : extraction.extractionStatus === "partial" ? 0.03 : -0.2),
  );
  const finalScore = clamp01(
    topicMatch * 0.25 +
      semanticMatch * 0.25 +
      queryMatch * 0.15 +
      evidenceUsefulness * 0.25 +
      validation.reliabilityScore * 0.1,
  );
  const label: RelevanceScore["label"] = finalScore >= 0.66 ? "high" : finalScore >= 0.42 ? "medium" : "low";
  const reason =
    label === "high"
      ? "來源內容、語意類別與可抽取事實能支撐研究問題。"
      : label === "medium"
        ? "來源與主題有關，但可用事實或正文完整度仍有限。"
        : "來源只提供弱線索，或缺少足夠正文支撐具體論述。";
  return {
    sourceId: sourceId(source),
    topicMatch,
    semanticMatch,
    queryMatch,
    evidenceUsefulness,
    reliabilityScore: validation.reliabilityScore,
    finalScore,
    label,
    reason,
  };
}

export function summarizeSourceFromExtraction(
  source: SourceRecord,
  extraction: ReadableExtraction,
): SourceSummary {
  const content = clean(extraction.abstract ?? extraction.extractedText ?? "");
  const title = clean(source.title);
  const basedOn: SourceSummary["basedOn"] =
    extraction.abstract && extraction.extractedText
      ? "title_and_abstract"
      : extraction.abstract
        ? "abstract"
        : extraction.extractedText
          ? "extractedText"
          : title
            ? "title"
            : "partial_content";
  const warnings = unique([
    ...extraction.extractionWarnings,
    basedOn === "title" ? "summary_based_on_title_only" : "",
  ].filter(Boolean));
  const basis = content || title;
  const summary = basis
    ? `此來源可作為「${title || sourceId(source)}」的資料線索；目前摘要依${basedOn === "title" ? "題名" : "可讀內容"}整理，重點為：${basis.slice(0, 120)}${basis.length > 120 ? "..." : ""}`
    : "此來源缺少足夠可讀內容，暫不應支撐具體研究結論。";
  return {
    sourceId: sourceId(source),
    summary,
    basedOn,
    language: "zh-TW",
    confidence: basedOn === "title" ? 0.32 : extraction.extractionStatus === "success" ? 0.72 : 0.48,
    warnings,
  };
}

function sourceCitation(source: SourceRecord): string {
  const author = source.authors[0] || source.publisher || source.containerTitle || source.sourceType;
  const year = source.year ?? "年份待確認";
  return `${author}（${year}）`;
}

export function buildResearchEvidenceCards(
  facts: SourceFact[],
  sources: SourceRecord[],
  relevanceScores: RelevanceScore[],
): PipelineEvidenceCard[] {
  const sourceById = new Map(sources.map((source) => [sourceId(source), source]));
  const relevanceById = new Map(relevanceScores.map((score) => [score.sourceId, score]));
  const acceptedFacts = facts
    .filter((fact) => (relevanceById.get(fact.sourceId)?.finalScore ?? 0) >= 0.38)
    .sort((a, b) => b.relevanceToTopic - a.relevanceToTopic);
  const byCategory = new Map<SourceFactCategory, SourceFact[]>();
  for (const fact of acceptedFacts) {
    const bucket = byCategory.get(fact.category) ?? [];
    bucket.push(fact);
    byCategory.set(fact.category, bucket);
  }
  const cards: PipelineEvidenceCard[] = [];
  for (const category of ["definition", "mechanism", "observable_phenomenon", "application", "method", "limitation", "background"] as const) {
    const bucket = (byCategory.get(category) ?? []).slice(0, 2);
    for (const [index, fact] of bucket.entries()) {
      const source = sourceById.get(fact.sourceId);
      cards.push({
        id: `research-evidence:${category}:${cards.length + 1}`,
        sourceIds: [fact.sourceId],
        claim: fact.fact,
        evidenceType:
          category === "method" || category === "background"
            ? "research_angle"
            : category === "limitation"
              ? "limitation"
              : category,
        explanation: fact.supportedByText,
        confidence: clamp01((fact.relevanceToTopic + (relevanceById.get(fact.sourceId)?.finalScore ?? 0.4)) / 2),
        citationText: source ? sourceCitation(source) : `來源 ${index + 1}`,
      });
    }
  }
  return cards.slice(0, 12);
}

export function buildIntroClaims(cards: PipelineEvidenceCard[]): IntroClaim[] {
  return cards
    .filter((card) => card.confidence >= 0.38)
    .slice(0, 5)
    .map((card) => ({
      claim: card.claim,
      sourceIds: card.sourceIds,
      evidenceType:
        card.evidenceType === "comparison"
          ? "research_angle"
          : card.evidenceType,
      confidence: card.confidence,
    }));
}

function hasTemplate(text: string): boolean {
  return TEMPLATE_PATTERNS.some((pattern) => pattern.test(text));
}

function labelForEvidenceType(type: IntroClaim["evidenceType"]): string {
  switch (type) {
    case "definition":
      return "核心概念";
    case "mechanism":
      return "作用機制";
    case "observable_phenomenon":
      return "可觀察現象";
    case "application":
      return "應用脈絡";
    case "limitation":
      return "資料限制";
    case "research_angle":
    default:
      return "研究方向";
  }
}

export function buildGroundedIntro(
  classification: TopicSemanticClassification,
  introClaims: IntroClaim[],
  acceptedSourceCount: number,
): {
  title: string;
  subtitle: string;
  intro: string;
  validation: IntroValidation;
  fallbackUsed: boolean;
  fallbackReason?: string;
} {
  const strongClaims = introClaims.filter((claim) => claim.confidence >= 0.42);
  const sourceCoverage = clamp01(new Set(strongClaims.flatMap((claim) => claim.sourceIds)).size / Math.max(1, acceptedSourceCount));
  const fallbackReason =
    acceptedSourceCount < DEFAULT_SOURCE_SEARCH_CONFIG.minAccepted
      ? "accepted_sources_below_minimum"
      : classification.confidence < 0.45
        ? "classification_confidence_low"
        : strongClaims.length === 0
          ? "intro_claims_missing"
          : undefined;

  if (fallbackReason) {
    const intro =
      acceptedSourceCount < DEFAULT_SOURCE_SEARCH_CONFIG.minAccepted
        ? "目前可用資料有限，以下先整理已找到來源中的核心概念與可延伸研究方向。"
        : "本主題將從核心概念、相關資料與可研究問題三個方向進行整理。";
    return {
      title: classification.normalizedTopic || "研究主題",
      subtitle: "資料來源不足，採保守導入",
      intro,
      validation: {
        unsupportedClaims: [],
        overgeneralizedClaims: [],
        templateDetected: false,
        sourceCoverage,
        passed: false,
        fallbackReason,
      },
      fallbackUsed: true,
      fallbackReason,
    };
  }

  const evidenceLabels = unique(strongClaims.map((claim) => labelForEvidenceType(claim.evidenceType))).slice(0, 2);
  const title = `${classification.normalizedTopic}：${evidenceLabels.join("與")}`;
  const subtitle = `依據 ${acceptedSourceCount} 筆候選來源整理${evidenceLabels.join("、")}`;
  const intro = strongClaims
    .slice(0, 2)
    .map((claim) => claim.claim.replace(/[。！？.!?]+$/u, "。"))
    .join("");
  const templateDetected = hasTemplate(`${title} ${subtitle} ${intro}`);
  const validation: IntroValidation = {
    unsupportedClaims: [],
    overgeneralizedClaims: intro.length > 220 ? ["intro_too_broad"] : [],
    templateDetected,
    sourceCoverage,
    passed: !templateDetected && sourceCoverage > 0,
    ...(templateDetected ? { fallbackReason: "hard_coded_template_detected" } : {}),
  };
  if (!validation.passed) {
    return {
      title: classification.normalizedTopic || "研究主題",
      subtitle: "依資料來源整理的保守導入",
      intro: "本主題將從核心概念、相關資料與可研究問題三個方向進行整理。",
      validation,
      fallbackUsed: true,
      fallbackReason: validation.fallbackReason ?? "intro_validation_failed",
    };
  }
  return { title, subtitle, intro, validation, fallbackUsed: false };
}

export function enrichSourcesWithResearchPipeline(
  sources: SourceRecord[],
  classification: TopicSemanticClassification,
  expandedQueries: ExpandedQuery[],
): {
  sources: SourceRecord[];
  sourceValidations: SourceValidation[];
  readableExtractions: ReadableExtraction[];
  sourceFacts: SourceFact[];
  relevanceScores: RelevanceScore[];
  sourceSummaries: SourceSummary[];
} {
  const sourceValidations: SourceValidation[] = [];
  const readableExtractions: ReadableExtraction[] = [];
  const sourceFacts: SourceFact[] = [];
  const relevanceScores: RelevanceScore[] = [];
  const sourceSummaries: SourceSummary[] = [];

  const enriched = sources.map((source) => {
    const validation = validateSource(source);
    const extraction = extractReadable(source);
    const facts = extractSourceFacts(source, extraction, classification);
    const relevance = scorePipelineRelevance(source, validation, extraction, facts, classification, expandedQueries);
    const summary = summarizeSourceFromExtraction(source, extraction);
    sourceValidations.push(validation);
    readableExtractions.push(extraction);
    sourceFacts.push(...facts);
    relevanceScores.push(relevance);
    sourceSummaries.push(summary);
    return {
      ...source,
      sourceValidation: validation,
      readableExtraction: extraction,
      sourceFacts: facts,
      researchRelevanceScore: relevance,
      sourceSummary: summary,
      relevanceScore: Math.max(source.relevanceScore ?? 0, Math.round(relevance.finalScore * 100)),
      relevanceReasons: unique([...(source.relevanceReasons ?? []), relevance.reason]),
      relevanceReasonZhTW: source.relevanceReasonZhTW ?? relevance.reason,
      sourceRelevanceReasonZhTw: source.sourceRelevanceReasonZhTw ?? relevance.reason,
      sourceLinkInfo: {
        ...(source.sourceLinkInfo ?? {
          accessStatus: validation.urlReachable ? "unknown" : "metadata_only",
          linkWarnings: [],
        }),
        canonicalUrl: validation.canonicalUrl ?? source.sourceLinkInfo?.canonicalUrl ?? source.url,
        doi: validation.doi ?? source.sourceLinkInfo?.doi ?? source.doi,
        linkWarnings: unique([
          ...(source.sourceLinkInfo?.linkWarnings ?? []),
          ...validation.warnings,
        ]),
      },
    } satisfies SourceRecord;
  });

  return {
    sources: enriched,
    sourceValidations,
    readableExtractions,
    sourceFacts,
    relevanceScores,
    sourceSummaries,
  };
}

export function buildResearchDebugTrace(input: {
  originalTopic: string;
  classification: TopicSemanticClassification;
  expandedQueries: ExpandedQuery[];
  candidateSourceCount: number;
  acceptedSourceCount: number;
  sourceValidations: SourceValidation[];
  readableExtractions: ReadableExtraction[];
  sourceFacts: SourceFact[];
  relevanceScores: RelevanceScore[];
  evidenceCards: PipelineEvidenceCard[];
  introClaims: IntroClaim[];
  introValidation: IntroValidation;
  generatedTitle: string;
  generatedSubtitle: string;
  generatedIntro: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
}): ResearchDebugTrace {
  return {
    originalTopic: input.originalTopic,
    normalizedTopic: input.classification.normalizedTopic,
    semanticClassification: input.classification,
    expandedQueries: input.expandedQueries,
    candidateSourceCount: input.candidateSourceCount,
    acceptedSourceCount: input.acceptedSourceCount,
    sourceValidations: input.sourceValidations,
    readableExtractions: input.readableExtractions,
    sourceFacts: input.sourceFacts,
    relevanceScores: input.relevanceScores,
    evidenceCards: input.evidenceCards,
    introClaims: input.introClaims,
    introValidation: input.introValidation,
    generatedTitle: input.generatedTitle,
    generatedSubtitle: input.generatedSubtitle,
    generatedIntro: input.generatedIntro,
    fallbackUsed: input.fallbackUsed,
    ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
    hardCodedTemplateDetected:
      input.introValidation.templateDetected ||
      hasTemplate(`${input.generatedTitle} ${input.generatedSubtitle} ${input.generatedIntro}`),
  };
}
