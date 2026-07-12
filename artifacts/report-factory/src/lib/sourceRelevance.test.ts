import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  applySourceRelevanceAssessments,
  buildSourceIntentProfile,
  buildSourceRelevanceAssessment,
} from "./sourceRelevance.ts";
import { supplementTrustedClimateSources } from "./trustedClimateSources.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-relevance",
    title: "Sugar-sweetened beverage consumption and metabolic health",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "This peer reviewed study examines soft drink and cola consumption, sugar intake, caffeine exposure, obesity, and health outcomes.",
    doi: "10.1000/relevance",
    url: "https://doi.org/10.1000/relevance",
    sourceType: "Crossref",
    reviewState: "pending",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "journal_article",
    ...overrides,
  };
}

test("cola health relevance keeps English high-quality research in the main list", () => {
  const profile =
    buildSourceIntentProfile("可樂中的成分與攝取習慣對健康的影響");
  const assessment = buildSourceRelevanceAssessment(source(), profile);

  assert.equal(assessment.relevanceLevel, "primary");
  assert.equal(assessment.shouldShowInMainList, true);
  assert.equal(assessment.shouldRecommendAccept, true);
  assert.ok(assessment.matchedCoreConcepts.includes("soft drink"));
  assert.ok(assessment.matchedCoreConcepts.includes("cola"));
});

test("food-health profiles keep sushi and soda topics domain aware", () => {
  const sushiProfile = buildSourceIntentProfile("壽司");
  const sodaProfile = buildSourceIntentProfile("碳酸飲料對健康影響");

  assert.ok(sushiProfile.coreConcepts.includes("sushi"));
  assert.ok(sushiProfile.coreConcepts.includes("food safety"));
  assert.ok(sushiProfile.requiredConceptGroups.some((group) => group.includes("sashimi")));
  assert.ok(sodaProfile.coreConcepts.includes("cola"));
  assert.ok(sodaProfile.coreConcepts.includes("public health"));
});

test("business industry profiles keep BMW topics away from dealer and used car noise", () => {
  const profile = buildSourceIntentProfile("BMW 電動車轉型與豪華車市場競爭");

  assert.ok(profile.coreConcepts.includes("BMW"));
  assert.ok(profile.coreConcepts.includes("annual report"));
  assert.ok(profile.excludeTerms.includes("dealer"));
  assert.ok(profile.excludeTerms.includes("used car"));
});

test("cola health relevance removes admissions and engineering-management noise from the main list", () => {
  const profile =
    buildSourceIntentProfile("可樂中的成分與攝取習慣對健康的影響");
  const noisySources = [
    source({
      id: "adult-exam",
      title: "成人高考招生策略研究",
      abstract: "本文分析成人高考招生與職業教育策略。",
      doi: null,
      sourceCategory: "news_or_web",
    }),
    source({
      id: "engineering",
      title: "工程管理招生宣傳影片與圖書館推介",
      abstract: "工程管理招生與圖書館推介影片設計。",
      doi: null,
      sourceCategory: "news_or_web",
    }),
  ];

  for (const noisySource of noisySources) {
    const assessment = buildSourceRelevanceAssessment(noisySource, profile);
    assert.equal(assessment.relevanceLevel, "off_topic");
    assert.equal(assessment.shouldShowInMainList, false);
    assert.equal(assessment.shouldRecommendAccept, false);
  }
});

test("saponification relevance treats alkaline and ester hydrolysis as high topic aliases", () => {
  const topic = "皂化反應的原理、應用與限制";
  const assessed = applySourceRelevanceAssessments(
    [
      source({
        id: "saponification",
        title: "Alkaline hydrolysis of esters and triglycerides",
        abstract:
          "This chemistry study explains base-catalyzed hydrolysis of triglycerides, soap formation, fatty acid salts, glycerol, and saponification value.",
        doi: "10.1000/saponification",
      }),
      source({
        id: "biodiesel-drift",
        title: "Biodiesel transesterification cost and fuel economy analysis",
        abstract:
          "This study compares biodiesel transesterification cost, fuel economy, and process efficiency without discussing alkaline hydrolysis or soap formation.",
        doi: "10.1000/biodiesel-cost",
      }),
      source({
        id: "ai-management",
        title: "AI management and grammar education",
        abstract:
          "This article discusses machine learning, grammar education, and management without chemistry reaction evidence.",
        doi: null,
      }),
    ],
    topic,
  );
  const byId = new Map(assessed.map((item) => [item.id, item]));

  assert.equal(byId.get("saponification")?.relevanceLevel, "primary");
  assert.equal(byId.get("saponification")?.topicalRelevanceLabel, "high");
  assert.notEqual(byId.get("biodiesel-drift")?.relevanceLevel, "primary");
  assert.equal(byId.get("biodiesel-drift")?.shouldShowInMainList, false);
  assert.equal(byId.get("biodiesel-drift")?.usageRecommendation, "exclude");
  assert.match(
    byId.get("saponification")?.relevanceReasonZhTw ??
      byId.get("saponification")?.sourceRelevanceReasonZhTw ??
      "",
    /皂化|鹼水解|alkaline hydrolysis/i,
  );
  assert.notEqual(byId.get("ai-management")?.relevanceLevel, "primary");
  assert.equal(byId.get("ai-management")?.shouldShowInMainList, false);
});

test("applySourceRelevanceAssessments preserves backend zh-TW summaries for grounded chemistry sources", () => {
  const assessed = applySourceRelevanceAssessments(
    [
      source({
        id: "saponification-summary",
        title: "Alkaline hydrolysis of esters and triglycerides",
        abstract:
          "This chemistry study explains base-catalyzed hydrolysis of triglycerides, soap formation, fatty acid salts, glycerol, and saponification value.",
        readableSummaryZhTW:
          "這份研究整理酯類與三酸甘油酯的鹼性水解機制，並說明皂化反應中脂肪酸鹽與甘油形成的條件。",
        summaryFallbackUsed: true,
        doi: "10.1000/saponification-summary",
      }),
    ],
    "皂化反應的原理、應用與限制",
  );

  assert.match(
    assessed[0]?.readableSummaryZhTW ?? "",
    /酯類與三酸甘油酯的鹼性水解機制|皂化反應/,
  );
  assert.doesNotMatch(
    assessed[0]?.readableSummaryZhTW ?? "",
    /尚未完成繁中摘要/,
  );
});

test("spider ecology relevance keeps habitat sources and rejects generic strategy drift", () => {
  const topic = "蜘蛛與其棲地相關研究";
  const assessed = applySourceRelevanceAssessments(
    [
      source({
        id: "spider-habitat",
        title: "Spider habitat selection and microhabitat ecology",
        abstract:
          "This study examines spider habitat selection, microhabitat conditions, predation behavior, anti-predator behavior, and survival adaptation.",
        doi: "10.1000/spider-habitat",
      }),
      source({
        id: "national-security",
        title: "高中地理教學中國家安全教育存在問題及改進策略研究",
        abstract: "本文分析國家安全教育與教學策略。",
        doi: null,
        sourceCategory: "news_or_web",
      }),
      source({
        id: "library-promotion",
        title: "民辦本科院校圖書館圖書推介視頻的現狀與優化策略",
        abstract: "本文討論圖書館圖書推介、閱讀推廣與策略研究。",
        doi: null,
        sourceCategory: "news_or_web",
      }),
    ],
    topic,
  );
  const byId = new Map(assessed.map((item) => [item.id, item]));

  assert.equal(byId.get("spider-habitat")?.relevanceLevel, "primary");
  assert.equal(byId.get("spider-habitat")?.shouldShowInMainList, true);
  assert.equal(byId.get("national-security")?.relevanceLevel, "off_topic");
  assert.equal(byId.get("library-promotion")?.relevanceLevel, "off_topic");
  assert.equal(byId.get("national-security")?.shouldShowInMainList, false);
  assert.equal(byId.get("library-promotion")?.shouldShowInMainList, false);
});

test("metadata-only spider habitat source is not promoted to primary", () => {
  const topic = "蜘蛛與其棲地相關研究";
  const assessed = applySourceRelevanceAssessments(
    [
      source({
        id: "metadata-only-spider",
        title: "Spider habitat selection and microhabitat ecology",
        abstract: null,
        doi: "10.1000/metadata-only-spider",
        sourceCategory: "journal_article",
      }),
    ],
    topic,
  );

  assert.equal(assessed[0]?.evidenceGrounding, "metadata_only");
  assert.notEqual(assessed[0]?.relevanceLevel, "primary");
  assert.equal(assessed[0]?.shouldShowInMainList, false);
});

test("low relevance sources do not pollute primary candidate grouping", () => {
  const assessed = applySourceRelevanceAssessments(
    [
      source({
        id: "spider-primary",
        title: "Spider habitat selection and microhabitat ecology",
        abstract:
          "This study examines spider habitat selection, microhabitat conditions, vegetation structure, and ecology.",
        doi: "10.1000/spider-primary",
      }),
      source({
        id: "library-promotion",
        title: "民辦本科院校圖書館圖書推介視頻的現狀與優化策略",
        abstract: "本文討論圖書館推廣與招生策略。",
        doi: null,
        sourceCategory: "news_or_web",
      }),
    ],
    "蜘蛛與其棲地相關研究",
  );

  const primary = assessed.filter((item) => item.relevanceLevel === "primary");
  const lowOrRejected = assessed.filter(
    (item) =>
      item.relevanceLevel === "low" ||
      item.relevanceLevel === "off_topic" ||
      item.shouldShowInMainList === false,
  );

  assert.deepEqual(primary.map((item) => item.id), ["spider-primary"]);
  assert.ok(lowOrRejected.some((item) => item.id === "library-promotion"));
});

test("climate change causes relevance removes tone-sandhi and religious-title noise", () => {
  const profile = buildSourceIntentProfile("氣候變遷成因");
  const noisySources = [
    source({
      id: "beijing-tone",
      title: "北京話變調規律研究",
      abstract: "此研究討論北京話語音變調。",
      doi: "10.1000/tone",
    }),
    source({
      id: "jerusalem",
      title: "建設中國的耶路撒冷與宗教稱號",
      abstract: "本文討論政治與宗教稱號。",
      doi: null,
    }),
  ];

  for (const noisySource of noisySources) {
    const assessment = buildSourceRelevanceAssessment(noisySource, profile);
    assert.equal(assessment.relevanceLevel, "off_topic");
    assert.equal(assessment.shouldShowInMainList, false);
  }
});

test("highly relevant source without abstract is clue and check-first", () => {
  const profile = buildSourceIntentProfile("氣候變遷成因");
  const assessment = buildSourceRelevanceAssessment(
    source({
      title:
        "Climate change causes from greenhouse gas emissions and fossil fuel combustion",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    profile,
  );

  assert.equal(assessment.relevanceLevel, "clue");
  assert.equal(assessment.shouldShowInMainList, false);
  assert.equal(assessment.shouldRecommendAccept, false);
  assert.ok(
    assessment.reasons.some(
      (reason) => reason.includes("摘要不足") || reason.includes("次要候選"),
    ),
  );
});

test("applySourceRelevanceAssessments persists gate metadata on source records", () => {
  const assessed = applySourceRelevanceAssessments(
    [
      source(),
      source({
        id: "adult-exam",
        title: "成人高考招生策略研究",
        abstract: "招生與職業教育。",
        doi: null,
      }),
    ],
    "可樂中的成分與攝取習慣對健康的影響",
  );

  assert.equal(assessed[0]?.relevanceLevel, "primary");
  assert.equal(assessed[0]?.shouldShowInMainList, true);
  assert.equal(assessed[1]?.relevanceLevel, "off_topic");
  assert.equal(assessed[1]?.shouldShowInMainList, false);
});

test("credible low relevance sources can still surface as supporting sources", () => {
  const profile = buildSourceIntentProfile("壽司");
  const assessment = buildSourceRelevanceAssessment(
    source({
      title: "Sushi safety and nutrition in restaurant settings",
      abstract: "This article reviews food safety, nutritional composition, and consumer behavior around sushi.",
      sourceType: "Web",
      url: "https://www.cdc.gov/example/sushi",
      publisher: "CDC",
      doi: null,
    }),
    profile,
  );

  assert.notEqual(assessment.relevanceLevel, "low");
  assert.equal(assessment.shouldShowInMainList, true);
});

test("climate source relevance separates primary causes and current-status sources from secondary material", () => {
  const topic = "「氣候變遷」的成因與現況分析";
  const examples = [
    source({
      id: "primary-causes",
      title:
        "Causes of climate change: greenhouse gas emissions and fossil fuel combustion",
      abstract:
        "Anthropogenic greenhouse gas emissions from fossil fuel combustion include carbon dioxide and methane. These emissions are major drivers of climate change.",
    }),
    source({
      id: "primary-status",
      title:
        "Observed global warming and current status of climate change indicators",
      abstract:
        "Observed warming is reflected in global temperature trends, CO2 concentration, and sea level change. Climate indicators show continued global warming.",
    }),
    source({
      id: "primary-ipcc",
      title:
        "IPCC assessment of anthropogenic climate change and greenhouse gases",
      abstract:
        "The IPCC assessment attributes climate change to anthropogenic greenhouse gas emissions and documents observed warming.",
    }),
    source({
      id: "forest-impact",
      title: "Climate change impacts on forest ecosystem water flux",
      abstract:
        "This study examines climate change impacts on forest ecosystem water flux and regional ecological effects.",
    }),
    source({
      id: "financial-risk",
      title: "Climate change and financial risk response",
      abstract:
        "The article discusses financial risk, insurance, and response strategies related to climate change.",
    }),
    source({
      id: "policy-committee",
      title: "Climate change policy committee governance",
      abstract:
        "This paper analyzes governance and committee functions in climate change policy.",
    }),
    source({
      id: "tone-sandhi",
      title: "Beijing tone sandhi and phonetic variation",
      abstract:
        "This paper studies Beijing tone sandhi and phonetic variation.",
    }),
    source({
      id: "admission",
      title: "University admission strategy",
      abstract:
        "This article discusses admissions strategy and school recruitment.",
    }),
    source({
      id: "jerusalem",
      title: "Jerusalem political metaphor and national identity",
      abstract: "This essay analyzes political metaphor and national identity.",
    }),
  ];

  const assessed = applySourceRelevanceAssessments(examples, topic);
  const byId = new Map(assessed.map((item) => [item.id, item]));
  const mainList = assessed.filter((item) => item.shouldShowInMainList);

  assert.equal(byId.get("primary-causes")?.relevanceLevel, "primary");
  assert.equal(byId.get("primary-status")?.relevanceLevel, "primary");
  assert.equal(byId.get("primary-ipcc")?.relevanceLevel, "primary");
  assert.ok(
    byId
      .get("primary-causes")
      ?.evidenceSnippets?.some(
        (snippet) =>
          snippet.matchedFacet === "成因分析" &&
          snippet.supportLevel === "direct",
      ),
  );
  assert.ok(
    byId
      .get("primary-status")
      ?.evidenceSnippets?.some(
        (snippet) =>
          snippet.matchedFacet === "現況分析" &&
          snippet.supportLevel === "direct",
      ),
  );
  assert.ok(
    byId
      .get("primary-ipcc")
      ?.evidenceChain?.some((entry) => entry.supportLevel === "direct"),
  );
  assert.equal(byId.get("forest-impact")?.relevanceLevel, "secondary");
  assert.notEqual(byId.get("financial-risk")?.relevanceLevel, "primary");
  assert.notEqual(byId.get("policy-committee")?.relevanceLevel, "primary");
  assert.equal(byId.get("tone-sandhi")?.relevanceLevel, "off_topic");
  assert.equal(byId.get("admission")?.relevanceLevel, "off_topic");
  assert.equal(byId.get("jerusalem")?.relevanceLevel, "off_topic");
  assert.ok(
    mainList.every(
      (item) =>
        item.relevanceLevel !== "low" && item.relevanceLevel !== "off_topic",
    ),
  );
});

test("paleontology algae topic promotes fossil paleoenvironment evidence but not generic extinction articles", () => {
  const topic = "恐龍化石與藻類的關係";
  const assessed = applySourceRelevanceAssessments(
    [
      source({
        id: "algae-fossil",
        title:
          "Dinosaur fossils, algal microfossils, and paleoenvironment reconstruction",
        abstract:
          "This paleontology study compares dinosaur fossil preservation, stratigraphy, algal microfossils, cyanobacteria biomarkers, and sedimentary paleoenvironment evidence.",
        doi: "10.1000/dinosaur-algae",
        sourceCategory: "journal_article",
      }),
      source({
        id: "asteroid-only",
        title:
          "Asteroid impact, not volcanism, caused the end-Cretaceous dinosaur extinction",
        abstract:
          "This study tests end-Cretaceous extinction scenarios and dinosaur habitat loss using climate and ecological models.",
        doi: "10.1000/asteroid-only",
        sourceCategory: "journal_article",
      }),
    ],
    topic,
  );

  const algae = assessed.find((item) => item.id === "algae-fossil");
  const asteroid = assessed.find((item) => item.id === "asteroid-only");

  assert.equal(algae?.relevanceLevel, "primary");
  assert.equal(algae?.usageRecommendation, "primary");
  assert.equal(algae?.shouldShowInMainList, true);
  assert.notEqual(asteroid?.relevanceLevel, "primary");
});

test("metadata-only climate source is not recommended as primary evidence", () => {
  const profile = buildSourceIntentProfile("「氣候變遷」的成因與現況分析");
  const assessment = buildSourceRelevanceAssessment(
    source({
      title:
        "Climate change causes greenhouse gas emissions and observed warming",
      abstract: null,
      sourceCategory: "journal_article",
    }),
    profile,
  );

  assert.equal(assessment.relevanceLevel, "clue");
  assert.equal(assessment.evidenceGrounding, "metadata_only");
  assert.equal(assessment.shouldRecommendAccept, false);
});

test("trusted climate fallback supplies enough grounded primary sources when providers return metadata only", () => {
  const topic = "「氣候變遷」的成因與現況分析";
  const metadataOnly = [
    source({
      id: "metadata-only",
      title: "Greenhouse gases and climate change",
      abstract: null,
      sourceCategory: "journal_article",
    }),
  ];
  const supplemented = supplementTrustedClimateSources(metadataOnly, topic);
  const assessed = applySourceRelevanceAssessments(supplemented, topic);
  const primary = assessed.filter((item) => item.relevanceLevel === "primary");
  const metadataAssessment = assessed.find(
    (item) => item.id === "metadata-only",
  );

  assert.ok(primary.length >= 8);
  assert.ok(
    primary.every((item) => item.evidenceGrounding === "abstract_grounded"),
  );
  assert.equal(metadataAssessment?.shouldRecommendAccept, false);
});

test("trusted climate fallback does not supplement non-climate topics", () => {
  const existing = [
    source({
      id: "dumpling-source",
      title: "Sodium content and nutrition labeling of frozen dumplings",
      abstract:
        "Frozen dumpling nutrition facts, sodium content, food labeling, and commercial dumpling products are compared.",
    }),
  ];
  const supplemented = supplementTrustedClimateSources(existing, "水餃");

  assert.deepEqual(
    supplemented.map((item) => item.id),
    ["dumpling-source"],
  );
  assert.equal(
    supplemented.some((item) => /Climate Change|IPCC|NASA|NOAA/.test(item.title)),
    false,
  );
});
