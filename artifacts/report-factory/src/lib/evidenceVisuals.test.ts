import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceCard } from "./evidenceCards.ts";
import {
  auditEvidenceVisualSemantics,
  buildEvidenceVisuals,
  evidenceVisualsHaveCompleteProvenance,
  generatedConceptImageRecordIsTruthful,
  mainBodyEvidenceVisualIssues,
  type GeneratedConceptImageRecord,
} from "./evidenceVisuals.ts";
import type { FigureSpec } from "./formalReportDocument.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import { buildStandardizedEvidenceFacts } from "./standardizedEvidenceFacts.ts";
import {
  routeVisualStatistic,
  routeVisualStatisticGroup,
  semanticDatumKeys,
} from "./visualSemanticRouter.ts";

const topic = "台灣 urban heat island 與校園綠覆率的關聯";

interface EvidenceFixture {
  source: SourceRecord;
  card: EvidenceCard;
}

function evidenceFixture(input: {
  index: number;
  title: string;
  author: string;
  year: number;
  location?: string;
  setting?: string;
  design: string;
  exposure: string;
  outcome: string;
  exactResult: string;
  numericResult?: string;
}): EvidenceFixture {
  const sourceId = `source-${input.index}`;
  const evidenceId = `evidence-${input.index}`;
  const source = {
    id: sourceId,
    title: input.title,
    authors: [input.author],
    year: input.year,
    abstract: input.exactResult,
    doi: `10.1000/evidence-visual-${input.index}`,
    url: `https://doi.org/10.1000/evidence-visual-${input.index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Evidence Press",
    containerTitle: "Urban Climate Evidence",
    accessedAt: null,
    provider: "fixture-provider",
  } as unknown as SourceRecord;
  const card = {
    id: evidenceId,
    evidenceId,
    workflowId: "workflow-evidence-visuals",
    topicHash: "topic-evidence-visuals",
    sourceId,
    citationMarker: `[${input.index}]`,
    title: input.title,
    sourceTitle: input.title,
    authors: [input.author],
    year: input.year,
    sourceType: "journal_article",
    reliability: "高",
    claim: input.exactResult,
    claimTextZhTw: input.exactResult,
    mainClaim: input.exactResult,
    evidence: input.exactResult,
    evidencePointZhTw: input.exactResult,
    usableEvidence: input.exactResult,
    quoteOrParaphrase: input.exactResult,
    summary: input.exactResult,
    sourceExcerptOriginal: input.exactResult,
    sourceSummaryZhTw: input.exactResult,
    supportedByText: input.exactResult,
    supportSpan: input.exactResult,
    relevance: "direct",
    limitations: [],
    limitationsZhTw: [],
    sectionTargets: ["數據分析"],
    sourceUrl: source.url,
    sourceDomain: "doi.org",
    sourceProvider: "fixture-provider",
    sourceCategory: "journal_article",
    doi: source.doi,
    abstract: input.exactResult,
    provider: "fixture-provider",
    relevanceScore: 0.9,
    sourceQualityScore: 0.9,
    finalScore: 0.9,
    usableSections: ["數據分析"],
    confidence: "高",
    confidenceScore: 0.9,
    derivation: "abstract" as never,
    limitation: null,
    citationText: `${input.author} (${input.year}). ${input.title}.`,
    pageOrLocation: "abstract",
    createdAt: "2026-08-13T00:00:00.000Z",
    notes: "",
    acceptedByUser: true,
    userDecision: "accepted",
    location: input.location ?? null,
    researchSetting: input.setting ?? null,
    studyDesign: input.design,
    exposure: input.exposure,
    outcome: input.outcome,
    exactResult: input.exactResult,
    numericResult: input.numericResult ?? null,
    applicability: "僅適用於來源直接涵蓋的場域與指標。",
    locator: "abstract",
    evidenceDirectnessTier: "B",
  } as unknown as EvidenceCard;
  return { source, card };
}

function urbanHeatFixtures(): EvidenceFixture[] {
  return [
    evidenceFixture({
      index: 1,
      title: "Green view index and ambient temperature in Taipei",
      author: "Chan, T.",
      year: 2024,
      location: "Taipei",
      design: "regression",
      exposure: "green view index (GVI)",
      outcome: "ambient temperature",
      exactResult: "Google Street View was used to estimate GVI in Taipei. Monthly temperature data from 2018 to 2021 at 0.01° resolution were analyzed. Higher GVI was significantly associated with lower ambient temperature while controlling for land use and traffic volume.",
      numericResult: "2018；2021；0.01",
    }),
    evidenceFixture({
      index: 2,
      title: "Visual and thermal comfort in campus blue-green spaces",
      author: "Wang, X.",
      year: 2023,
      setting: "campus",
      design: "case study",
      exposure: "blue-green space",
      outcome: "thermal comfort and skin conductance",
      exactResult: "The campus case study measured microclimate and sunlight intensity. Skin conductance indicators predicted outdoor visual-thermal comfort, with R2 exceeding 0.5.",
      numericResult: "1；2；3；0.5",
    }),
    evidenceFixture({
      index: 3,
      title: "Green coverage scenarios in Kaohsiung",
      author: "Huang, J.",
      year: 2020,
      location: "Kaohsiung",
      design: "ENVI-met case study",
      exposure: "green coverage ratio (GCR)",
      outcome: "urban heat island and pedestrian air temperature",
      exactResult: "Five ENVI-met scenarios were compared. The average temperature of the current thermal environment is 36.0 °C. The combined scheme cooled the area by an average of 2.00 °C. For every 10% increase in street GCR, pedestrian-layer temperature was reduced by 0.15 °C.",
      numericResult: "1；2；60%；3；4；80%；5；100%；36.0 °C；2.00 °C；10%；0.15 °C",
    }),
    evidenceFixture({
      index: 4,
      title: "Campus land cover and LST in Jeddah",
      author: "Addas, A.",
      year: 2020,
      setting: "university campus",
      design: "remote sensing",
      exposure: "green vegetation and built-up land cover",
      outcome: "land surface temperature (LST)",
      exactResult: "Landsat observations found a consistent variation of between 7 and 9 degrees Celsius for LST across campus. LST correlated with green vegetation and built-up cover, with seasonal differences.",
      numericResult: "8；7；9；2014；2019",
    }),
    evidenceFixture({
      index: 5,
      title: "Outdoor thermal environments measured in Wuhan",
      author: "Li, K.",
      year: 2022,
      setting: "university campus and other urban areas",
      design: "field measurement",
      exposure: "vegetation shading and grassland transpiration",
      outcome: "air temperature and thermal environment",
      exactResult: "At 20 field sites, vegetation shading was stronger than water evaporation and the maximum temperature difference reached 6.1 °C. Canopy shading of tall trees was stronger than grassland transpiration and the maximum temperature difference was 2.8 °C. Street aspect ratio affected ventilation.",
      numericResult: "2015；2017；20；08；00；19；6.1 °C；2.8 °C",
    }),
    evidenceFixture({
      index: 6,
      title: "Coverage types in campus small green spaces",
      author: "Li, H.",
      year: 2020,
      setting: "university campus",
      design: "field measurement",
      exposure: "canopy density (CD), leaf area index (LAI), and impervious surface",
      outcome: "air temperature and relative humidity",
      exactResult: "Sixteen sites compared impervious, shrub-grass, tree-grass and tree-shrub-grass cover. The maximum air temperature difference reached 8.9 °C and the maximum relative humidity difference was 28.5%. PAR and solar radiation were also measured.",
      numericResult: "16；8.9；28.5%",
    }),
  ];
}

function builtVisuals() {
  const fixtures = urbanHeatFixtures();
  const sources = fixtures.map((fixture) => fixture.source);
  const evidenceCards = fixtures.map((fixture) => fixture.card);
  const standardizedFacts = buildStandardizedEvidenceFacts(evidenceCards, sources);
  return buildEvidenceVisuals({
    topic,
    evidenceCards,
    sources,
    standardizedFacts,
    startNumber: 3,
  });
}

const shortVideoSleepTopic = "Short-form video use and sleep quality among high school students";

function shortVideoSleepFixtures(): EvidenceFixture[] {
  return [
    evidenceFixture({
      index: 21,
      title: "Adolescents’ short-form video addiction and sleep quality: the mediating role of social anxiety",
      author: "Jiang, L.",
      year: 2024,
      setting: "three high schools",
      design: "cross-sectional",
      exposure: "short-form video addiction",
      outcome: "sleep quality and social anxiety",
      exactResult: "A cross-sectional survey recruited 1629 adolescents from three high schools. Participants’ sleep quality score is 6.12 ± 3.29 points. The detection rate of sleep quality among them is 31.06%. Short-form video addiction, sleep quality, and social anxiety are significantly correlated (r = 0.439, 0.404, 0.457, P < 0.001). The direct effect of short-form video addiction on sleep quality is 0.248, accounting for 62.4% of the total effect. The indirect effect exerted through social anxiety is 0.149, accounting for 37.6%. Social anxiety partially mediates the relationship between short-form video addiction and sleep quality.",
    }),
    evidenceFixture({
      index: 22,
      title: "Social Media Use and Sleep Quality Among Secondary School Students in Aseer Region",
      author: "Al-Garni, A.",
      year: 2024,
      setting: "public secondary school",
      design: "cross-sectional",
      exposure: "hours spent on social media",
      outcome: "poor sleep",
      exactResult: "A cross-sectional study included 961 public secondary school students in Aseer. TikTok was used by 80% of students. Regarding sleep quality, 34.7% of students were poor sleepers. TikTok use (OR 1.33, 95% CI 1.01-1.77), hours spent on social media (OR 1.26, 95% CI 1.16-1.37) and having moderate to severe depressive symptoms (OR 1.69, 95% CI 1.19-2.40) were independent predictors of poor sleep.",
    }),
    evidenceFixture({
      index: 23,
      title: "The Impact of Short-Form Video Addiction on Sleep Quality",
      author: "Yang, Y.",
      year: 2026,
      setting: "college",
      design: "cross-sectional mediation analysis",
      exposure: "short-form video addiction",
      outcome: "sleep quality",
      exactResult: "A survey of 677 Chinese college students found short-form video addiction associated with sleep quality, with social anxiety and self-control mediating the indirect pathway. The abstract did not report path coefficients.",
    }),
    evidenceFixture({
      index: 24,
      title: "Drivers and Consequences of Short-Form Video Addiction amongst Adolescents in China",
      author: "Mu, H.",
      year: 2022,
      setting: "adolescents across China",
      design: "cross-sectional structural equation model",
      exposure: "short-form video addiction",
      outcome: "happiness, parent-child relationship quality, and perseverance",
      exactResult: "Data from 242 adolescents under age 18 showed that short-form video addiction was associated with happiness, parent-child relationship quality, and perseverance. Sleep was not measured.",
    }),
    evidenceFixture({
      index: 25,
      title: "The relationship between short-form video use and depression among Chinese adolescents",
      author: "Zhu, X.",
      year: 2024,
      setting: "senior high school",
      design: "cross-sectional structural equation model",
      exposure: "short-form video use",
      outcome: "depression",
      exactResult: "The sample included 1302 senior high school students. Short-form video use was associated with depression through need gratification and short-form video addiction. Sleep was not measured.",
    }),
    evidenceFixture({
      index: 26,
      title: "The Use of Social Media in Children and Adolescents: Scoping Review",
      author: "Bozzola, E.",
      year: 2022,
      setting: "children and adolescents",
      design: "scoping review",
      exposure: "general social media use",
      outcome: "depression and other health risks",
      exactResult: "A PRISMA scoping review of general social media risks in children and adolescents identified sleep among several associated problems, without a short-form-video-specific sleep estimate.",
    }),
  ];
}

function builtShortVideoSleepVisuals() {
  const fixtures = shortVideoSleepFixtures();
  const sources = fixtures.map((fixture) => fixture.source);
  const evidenceCards = fixtures.map((fixture) => fixture.card);
  const standardizedFacts = buildStandardizedEvidenceFacts(evidenceCards, sources);
  return {
    standardizedFacts,
    visuals: buildEvidenceVisuals({
      topic: shortVideoSleepTopic,
      evidenceCards,
      sources,
      standardizedFacts,
    }),
  };
}

test("builds seven numbered, FigureSpec-compatible topic visuals with complete provenance", () => {
  const visuals = builtVisuals();
  const figureCompatible: FigureSpec[] = visuals;

  assert.equal(figureCompatible.length, 7);
  assert.deepEqual(visuals.map((visual) => visual.number), [3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(visuals.map((visual) => visual.visualType), [
    "research_question_coverage",
    "metric_translation",
    "outcome_hierarchy",
    "numeric_small_multiples",
    "mechanism_synthesis",
    "applicability_boundary",
    "study_design",
  ]);
  assert.ok(visuals.every((visual) => visual.renderMode === "deterministic"));
  assert.ok(visuals.every((visual) => visual.altText && visual.sourceNote));
  assert.equal(evidenceVisualsHaveCompleteProvenance(visuals), true);
});

test("coverage and applicability figures preserve the missing Taiwan-campus intersection", () => {
  const visuals = builtVisuals();
  const coverage = visuals.find((visual) => visual.visualType === "research_question_coverage");
  const applicability = visuals.find((visual) => visual.visualType === "applicability_boundary");

  assert.equal(coverage?.data.kind, "matrix");
  assert.equal(applicability?.data.kind, "matrix");
  if (coverage?.data.kind !== "matrix" || applicability?.data.kind !== "matrix") return;

  assert.deepEqual(
    coverage.data.rows.find((row) => row.label.includes("臺灣 × 校園"))?.values,
    ["0", "尚無完整交集", "現有來源不能直接回答完整研究問題"],
  );
  assert.equal(applicability.data.rows.find((row) => row.label === "臺灣校園")?.values[0], "0");
  assert.equal(applicability.data.rows.find((row) => row.label === "臺灣非校園")?.values[0], "2");
  assert.equal(applicability.data.rows.find((row) => row.label === "海外校園")?.values[0], "4");
});

test("numeric small multiples keep statistic semantics and never chart legacy numericResult noise", () => {
  const numeric = builtVisuals().find((visual) => visual.visualType === "numeric_small_multiples");
  assert.equal(numeric?.data.kind, "matrix");
  if (!numeric || numeric.data.kind !== "matrix") return;

  const displayed = numeric.data.rows.map((row) => row.values[3]);
  assert.ok(displayed.includes("R² > 0.5"));
  assert.ok(displayed.includes("綠覆 +10% → 0.15 °C 降溫"));
  assert.ok(displayed.includes("36.0 °C"));
  assert.ok(displayed.includes("2.00 °C"));
  assert.ok(displayed.includes("7–9 °C"));
  assert.ok(displayed.includes("8.9 °C"));
  assert.ok(displayed.includes("28.5%"));
  assert.ok(!displayed.includes("7 °C"));
  assert.ok(!displayed.includes("9 °C"));
  assert.doesNotMatch(displayed.join(" "), /(?:2018|2021|2015|2017|0\.01|20 sites)/u);
  assert.match(numeric.note ?? "", /不得.*直接.*排序/u);
  assert.match(numeric.altText, /不能.*直接排名/u);

  const baseline = numeric.provenance.dataPoints.find((point) => point.displayValue === "36.0 °C");
  const cooling = numeric.provenance.dataPoints.find((point) => point.displayValue === "2.00 °C");
  const range = numeric.provenance.dataPoints.find((point) => point.displayValue === "7–9 °C");
  assert.equal(baseline?.metric, "現況熱環境溫度");
  assert.equal(cooling?.metric, "平均降溫效果");
  assert.equal(range?.unit, "°C");
  assert.ok(numeric.provenance.dataPoints.every((point) => point.exactText));
  assert.ok(numeric.provenance.dataPoints.every((point) => point.factIds.length === 1));
});

test("numeric panels fail closed when exactResult contains only years, counts and resolution", () => {
  const fixture = evidenceFixture({
    index: 7,
    title: "Metadata-only measurement schedule",
    author: "Noresult, N.",
    year: 2024,
    location: "Taipei",
    setting: "campus",
    design: "observation",
    exposure: "green coverage",
    outcome: "air temperature",
    exactResult: "Data were collected from 2018 to 2021 at 20 sites and 0.01 degree spatial resolution. No quantitative effect estimate was reported.",
    numericResult: "2018；2021；20；0.01",
  });
  const standardizedFacts = buildStandardizedEvidenceFacts([fixture.card], [fixture.source]);
  const visuals = buildEvidenceVisuals({
    topic,
    evidenceCards: [fixture.card],
    sources: [fixture.source],
    standardizedFacts,
  });

  assert.equal(visuals.some((visual) => visual.visualType === "numeric_small_multiples"), false);
});

test("the Taiwan-campus heat grammar never inserts its labels into an unrelated report", () => {
  const fixture = urbanHeatFixtures()[0];
  assert.ok(fixture);
  const visuals = buildEvidenceVisuals({
    topic: "中生代恐龍化石與古環境重建",
    evidenceCards: [fixture.card],
    sources: [fixture.source],
  });

  assert.deepEqual(visuals, []);
});

test("statistical semantic routing is not restricted to topic-specific visual grammars", () => {
  const fixtures = shortVideoSleepFixtures().slice(0, 2);
  const sources = fixtures.map((fixture) => fixture.source);
  const evidenceCards = fixtures.map((fixture) => fixture.card);
  const standardizedFacts = buildStandardizedEvidenceFacts(evidenceCards, sources);
  const visuals = buildEvidenceVisuals({
    topic: "跨領域觀察研究中的量化關聯",
    evidenceCards,
    sources,
    standardizedFacts,
  });

  assert.deepEqual(visuals.map((visual) => visual.semanticData?.kind), [
    "proportion_facets",
    "forest_plot",
    "correlation_structure",
  ]);
  assert.ok(visuals.every((visual) => visual.visualId.startsWith("evidence-visual-generic-")));
  assert.equal(evidenceVisualsHaveCompleteProvenance(visuals), true);
  assert.deepEqual(auditEvidenceVisualSemantics(visuals), []);
});

test("visual_type_matches_statistic", () => {
  const { visuals, standardizedFacts } = builtShortVideoSleepVisuals();
  assert.deepEqual(visuals.map((visual) => visual.visualType), [
    "sleep_evidence_coverage",
    "prevalence_facets",
    "odds_ratio_forest",
    "correlation_structure",
    "statistical_mediation_path",
    "population_applicability_boundary",
  ]);
  assert.deepEqual(visuals.map((visual) => visual.semanticData?.kind), [
    "evidence_coverage",
    "proportion_facets",
    "forest_plot",
    "correlation_structure",
    "mediation_path",
    "applicability_boundary",
  ]);
  assert.deepEqual(auditEvidenceVisualSemantics(visuals), []);

  const numericResults = standardizedFacts.flatMap((fact) => fact.numericalResults);
  for (const result of numericResults.filter((candidate) =>
    candidate.statisticType === "prevalence" ||
    candidate.statisticType === "odds_ratio" ||
    candidate.statisticType === "correlation_coefficient"
  )) {
    assert.equal(routeVisualStatistic(result).ok, true, result.resultId);
  }

  const prevalence = visuals.find((visual) => visual.visualType === "prevalence_facets")?.semanticData;
  const forest = visuals.find((visual) => visual.visualType === "odds_ratio_forest")?.semanticData;
  const correlation = visuals.find((visual) => visual.visualType === "correlation_structure")?.semanticData;
  assert.equal(prevalence?.kind, "proportion_facets");
  assert.equal(forest?.kind, "forest_plot");
  assert.equal(correlation?.kind, "correlation_structure");
  if (prevalence?.kind !== "proportion_facets" || forest?.kind !== "forest_plot" || correlation?.kind !== "correlation_structure") return;
  assert.deepEqual(prevalence.panels.map((panel) => panel.value).sort((a, b) => a - b), [31.06, 34.7]);
  assert.deepEqual(forest.rows.map((row) => [row.estimate, row.lowerBound, row.upperBound]), [
    [1.33, 1.01, 1.77],
    [1.26, 1.16, 1.37],
    [1.69, 1.19, 2.4],
  ]);
  assert.equal(forest.referenceValue, 1);
  assert.deepEqual(correlation.links.map((link) => link.value), [0.439, 0.404, 0.457]);
  assert.equal(correlation.percentConversionAllowed, false);
});

test("no_cross_study_false_comparison", () => {
  const { visuals, standardizedFacts } = builtShortVideoSleepVisuals();
  const prevalence = visuals.find((visual) => visual.visualType === "prevalence_facets");
  assert.equal(prevalence?.semanticData?.kind, "proportion_facets");
  if (prevalence?.semanticData?.kind !== "proportion_facets") return;
  assert.equal(prevalence.semanticData.panelMode, "independent");
  assert.equal(prevalence.semanticData.directComparisonAllowed, false);
  assert.equal(prevalence.semanticData.rankingAllowed, false);
  assert.equal(prevalence.semanticData.poolingAllowed, false);
  assert.ok(prevalence.semanticData.panels.every((panel) => panel.directComparisonAllowed === false));
  assert.match(prevalence.comparabilityWarning ?? "", /不作直接高低比較/u);
  assert.match(prevalence.note ?? "", /樣本.*判定.*不同/u);

  const results = standardizedFacts.flatMap((fact) => fact.numericalResults).filter((result) =>
    result.statisticType === "prevalence"
  );
  const pooled = routeVisualStatisticGroup({
    results,
    requestedVisualType: "proportion_facets",
    comparisonMode: "pooled",
  });
  const ranked = routeVisualStatisticGroup({
    results,
    requestedVisualType: "proportion_facets",
    comparisonMode: "ranked",
  });
  const wrongType = routeVisualStatisticGroup({
    results,
    requestedVisualType: "forest_plot",
    comparisonMode: "independent_facets",
  });
  assert.deepEqual(pooled, { ok: false, reason: "forbidden_pooled_comparison" });
  assert.deepEqual(ranked, { ok: false, reason: "forbidden_ranked_comparison" });
  assert.equal(wrongType.ok, false);
});

test("all_chart_values_are_traceable", () => {
  const { visuals } = builtShortVideoSleepVisuals();
  assert.equal(evidenceVisualsHaveCompleteProvenance(visuals), true);
  assert.deepEqual(auditEvidenceVisualSemantics(visuals), []);

  for (const visual of visuals) {
    assert.ok(visual.semanticData);
    if (!visual.semanticData) continue;
    assert.deepEqual(
      semanticDatumKeys(visual.semanticData).sort(),
      visual.provenance.dataPoints.map((point) => point.datumKey).sort(),
    );
    if (["proportion_facets", "forest_plot", "correlation_structure"].includes(visual.semanticData.kind)) {
      assert.ok(visual.provenance.dataPoints.every((point) =>
        point.exactText &&
        point.sourceIds.length === 1 &&
        point.evidenceIds.length === 1 &&
        point.factIds.length === 1 &&
        point.numericalResultIds.length === 1
      ));
    }
  }
});

test("main_body_contains_result_visuals", () => {
  const { visuals } = builtShortVideoSleepVisuals();
  assert.deepEqual(mainBodyEvidenceVisualIssues(shortVideoSleepTopic, visuals), []);
  assert.ok(visuals.every((visual) => !/appendix/iu.test(visual.preferredSectionId)));
  assert.equal(visuals.filter((visual) =>
    visual.visualType === "prevalence_facets" ||
    visual.visualType === "odds_ratio_forest" ||
    visual.visualType === "correlation_structure"
  ).length, 3);
  const mediation = visuals.find((visual) => visual.visualType === "statistical_mediation_path");
  assert.equal(mediation?.semanticData?.kind, "mediation_path");
  if (mediation?.semanticData?.kind !== "mediation_path") return;
  assert.equal(mediation.semanticData.coefficientDisplay, "omitted");
  assert.equal(mediation.semanticData.causalClaim, false);
  assert.doesNotMatch(mediation.data.kind === "directed_graph"
    ? mediation.data.edges.map((edge) => edge.label).join(" ")
    : "", /0\.248|0\.149|62\.4|37\.6/u);
});

test("live-shaped general-social-media sources stay outside short-video coverage while retaining explicit boundary roles", () => {
  const reviewSourceId = "doi:10.3390/ijerph19169960";
  const aseerSourceId = "doi:10.2147/ijgm.s464457";
  const fixtures = shortVideoSleepFixtures().map((fixture): EvidenceFixture => {
    const isReview = fixture.source.id === "source-26";
    const isAseer = fixture.source.id === "source-22";
    if (!isReview && !isAseer) return fixture;
    const sourceId = isReview ? reviewSourceId : aseerSourceId;
    const evidenceId = `evidence:${sourceId}:0`;
    const pollutedSummary = isReview
      ? "主旨：Short-form video use and sleep quality among high school students。摘要提到 TikTok，因此主題導向摘要誤寫為短影音研究。"
      : "此主題摘要稱 Aseer 研究支持短影音相關睡眠證據，但原研究題名與主暴露其實是一般社群媒體。";
    return {
      source: {
        ...fixture.source,
        id: sourceId,
        doi: sourceId.replace(/^doi:/u, ""),
        url: `https://doi.org/${sourceId.replace(/^doi:/u, "")}`,
      } as SourceRecord,
      card: {
        ...fixture.card,
        id: evidenceId,
        evidenceId,
        sourceId,
        doi: sourceId.replace(/^doi:/u, ""),
        sourceUrl: `https://doi.org/${sourceId.replace(/^doi:/u, "")}`,
        summary: pollutedSummary,
        sourceSummaryZhTw: pollutedSummary,
        claimTextZhTw: pollutedSummary,
        mainClaim: pollutedSummary,
        evidenceFunction: isReview ? "background" : "support",
      } as EvidenceCard,
    };
  });
  const sources = fixtures.map((fixture) => fixture.source);
  const evidenceCards = fixtures.map((fixture) => fixture.card);
  const standardizedFacts = buildStandardizedEvidenceFacts(evidenceCards, sources);
  const visuals = buildEvidenceVisuals({
    topic: shortVideoSleepTopic,
    evidenceCards,
    sources,
    standardizedFacts,
  });

  assert.equal(visuals.length, 6);
  assert.equal(evidenceVisualsHaveCompleteProvenance(visuals), true);
  assert.deepEqual(auditEvidenceVisualSemantics(visuals), []);

  const coverage = visuals.find((visual) => visual.visualType === "sleep_evidence_coverage");
  assert.equal(coverage?.semanticData?.kind, "evidence_coverage");
  if (coverage?.semanticData?.kind !== "evidence_coverage") return;
  assert.equal(
    coverage.semanticData.dimensions.find((dimension) => dimension.datumKey === "sleep-coverage-short-video")?.count,
    4,
  );
  assert.equal(coverage.semanticData.intersection.count, 1);
  const shortVideoPoint = coverage.provenance.dataPoints.find((point) =>
    point.datumKey === "sleep-coverage-short-video"
  );
  assert.ok(shortVideoPoint);
  assert.equal(shortVideoPoint?.sourceIds.includes(reviewSourceId), false);
  assert.equal(shortVideoPoint?.sourceIds.includes(aseerSourceId), false);
  const intersectionPoint = coverage.provenance.dataPoints.find((point) =>
    point.datumKey === "sleep-coverage-intersection"
  );
  assert.equal(intersectionPoint?.sourceIds.includes(reviewSourceId), false);
  assert.equal(intersectionPoint?.sourceIds.includes(aseerSourceId), false);

  const boundary = visuals.find((visual) => visual.visualType === "population_applicability_boundary");
  assert.equal(boundary?.semanticData?.kind, "applicability_boundary");
  if (boundary?.semanticData?.kind !== "applicability_boundary") return;
  const groupCount = (datumKey: string) =>
    boundary.semanticData.kind === "applicability_boundary"
      ? boundary.semanticData.groups.find((group) => group.datumKey === datumKey)?.count
      : undefined;
  assert.equal(groupCount("sleep-applicability-direct-school-sleep"), 1);
  assert.equal(groupCount("sleep-applicability-college-mechanism"), 1);
  assert.equal(groupCount("sleep-applicability-adolescent-non-sleep"), 2);
  assert.equal(groupCount("sleep-applicability-general-social-media-sleep"), 1);
  assert.equal(groupCount("sleep-applicability-general-social-media"), 1);
  assert.deepEqual(
    boundary.provenance.dataPoints.find((point) =>
      point.datumKey === "sleep-applicability-general-social-media-sleep"
    )?.sourceIds,
    [aseerSourceId],
  );
  assert.deepEqual(
    boundary.provenance.dataPoints.find((point) =>
      point.datumKey === "sleep-applicability-general-social-media"
    )?.sourceIds,
    [reviewSourceId],
  );
});

test("image2_does_not_generate_research_numbers", () => {
  const record: GeneratedConceptImageRecord = {
    visualId: "concept-mechanism",
    renderMode: "generated_concept_image",
    imageRole: "conceptual_explanation",
    preferredSectionId: "cross-source-synthesis",
    prompt: "Conceptual campus heat mechanism, no numeric labels.",
    altText: "概念性校園綠量與熱環境機制圖，不呈現研究數值。",
    provider: "Image2",
    model: "image-model",
    status: "generated",
    assetUri: null,
    fallbackVisualId: null,
    evidenceIds: ["evidence-1"],
    sourceIds: ["source-1"],
    limitationNote: "概念示意，不是資料圖。",
  };

  assert.equal(generatedConceptImageRecordIsTruthful(record), false);
  assert.equal(generatedConceptImageRecordIsTruthful({
    ...record,
    status: "fallback",
    fallbackVisualId: "evidence-visual-mechanism-synthesis",
  }), true);
  assert.equal(generatedConceptImageRecordIsTruthful({
    ...record,
    assetUri: "asset://concept-mechanism.png",
  }), true);
  assert.equal(generatedConceptImageRecordIsTruthful({
    ...record,
    prompt: "Concept image with OR 1.33 and 95% CI.",
    assetUri: "asset://unsafe-numeric-concept.png",
  }), false);
});
