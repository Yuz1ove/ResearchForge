import { expect, test } from "@playwright/test";

const baseUrl = process.env.RESEARCHFORGE_E2E_URL ?? "http://127.0.0.1:22067";
const now = "2026-07-05T00:00:00.000Z";

function candidate(input: {
  sourceId: string;
  title: string;
  reviewStatus: "accepted" | "review" | "rejected";
  sourceBucket: string;
  bucketScore: number;
  recommendationBucket: "scholarly_recommended" | "official_background" | "manual_review" | "rejected";
  sourceRole: string;
  sourceUseCase: "academic_claim" | "background_context" | "manual_review_only" | "rejected";
  doi?: string;
  url?: string;
}) {
  return {
    sourceId: input.sourceId,
    workflowId: "wf-e2e-panda",
    topicHash: "topic-e2e-panda",
    queryUsed: "giant panda red panda taxonomy",
    queryIntent: "exact",
    provider: "openalex",
    title: input.title,
    authors: ["ResearchForge Test"],
    year: 2026,
    venue: input.reviewStatus === "rejected" ? "Off Topic Journal" : "Panda Taxonomy Review",
    doi: input.doi,
    url: input.url ?? (input.doi ? `https://doi.org/${input.doi}` : undefined),
    abstractOriginal:
      input.reviewStatus === "rejected"
        ? "This control source is unrelated to panda terminology or taxonomy."
        : "This source discusses giant panda, red panda, Ailuropoda melanoleuca, Ailurus fulgens, Ursidae and Ailuridae.",
    sourceType: input.reviewStatus === "rejected" ? "paper" : "paper",
    sourceKind: "journal",
    institutionType: "unknown",
    isPeerReviewed: input.reviewStatus !== "review",
    hasDoi: Boolean(input.doi),
    isAcademic: input.sourceUseCase === "academic_claim",
    isOfficialBackground: input.recommendationBucket === "official_background",
    usableAsEvidence: input.sourceUseCase === "academic_claim",
    usableAsBackground: input.sourceUseCase !== "rejected",
    governanceReason:
      input.sourceUseCase === "rejected"
        ? "rejected_by_relevance_or_governance"
        : "academic_traceable_doi_or_scholarly_provider",
    retryRound: 0,
    relevanceScore: input.bucketScore,
    sourceQualityScore: input.reviewStatus === "rejected" ? 0.52 : 0.88,
    finalScore: input.reviewStatus === "rejected" ? 0.12 : 0.84,
    retrievalMode: "live_provider",
    recommendationBucket: input.recommendationBucket,
    sourceRole: input.sourceRole,
    sourceBucket: input.sourceBucket,
    bucketScore: input.bucketScore,
    bucketScores: {
      [input.sourceBucket]: input.bucketScore,
    },
    decisionReasons:
      input.reviewStatus === "rejected"
        ? ["off_topic bucket matched and required panda signals were missing"]
        : [`${input.sourceBucket} bucket strong match`],
    matchedEntities:
      input.reviewStatus === "rejected"
        ? []
        : ["giant panda", "red panda", "Ailuropoda melanoleuca", "Ailurus fulgens"],
    missingRequiredSignals: input.reviewStatus === "rejected" ? ["topic entity match"] : [],
    sourceUseCase: input.sourceUseCase,
    confidenceTier: input.reviewStatus === "accepted" ? "high" : input.reviewStatus === "rejected" ? "rejected" : "fallback",
    matchedConcepts:
      input.reviewStatus === "rejected"
        ? []
        : ["giant panda", "red panda", "Ailuropoda melanoleuca", "Ailurus fulgens"],
    matchedFields: input.reviewStatus === "rejected" ? ["title"] : ["title", "abstract"],
    acceptReason: input.reviewStatus === "accepted" ? `${input.sourceBucket} bucket strong match` : undefined,
    reviewStatus: input.reviewStatus,
    rejectionReason: input.reviewStatus === "rejected" ? "off_topic bucket matched and required panda signals were missing" : undefined,
    evidencePoints: input.reviewStatus === "rejected" ? [] : ["taxonomy distinction supports the topic"],
    limitations: input.reviewStatus === "review" ? ["background context only"] : [],
    usableSections: input.reviewStatus === "accepted" ? ["literature_review", "analysis", "discussion"] : ["manual_review_only"],
    citationMarker: `［${input.sourceId}］`,
    dedupeKey: input.sourceId,
    createdAt: now,
    retrievedAt: now,
  };
}

const acceptedSources = [
  candidate({
    sourceId: "panda-taxonomy-1",
    title: "Comparative genomics reveals convergent evolution between the bamboo-eating giant and red pandas",
    reviewStatus: "accepted",
    sourceBucket: "taxonomy_distinction",
    bucketScore: 0.86,
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    sourceUseCase: "academic_claim",
    doi: "10.1000/panda-taxonomy-1",
  }),
  candidate({
    sourceId: "panda-taxonomy-2",
    title: "Earliest giant panda false thumb suggests conflicting demands for locomotion and feeding",
    reviewStatus: "accepted",
    sourceBucket: "taxonomy_distinction",
    bucketScore: 0.72,
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    sourceUseCase: "academic_claim",
    doi: "10.1000/panda-taxonomy-2",
  }),
  candidate({
    sourceId: "panda-taxonomy-3",
    title: "The primitive giant panda Kretzoiarctos beatrix from the late Miocene of Spain",
    reviewStatus: "accepted",
    sourceBucket: "taxonomy_distinction",
    bucketScore: 0.7,
    recommendationBucket: "scholarly_recommended",
    sourceRole: "core_scholarly_evidence",
    sourceUseCase: "academic_claim",
    doi: "10.1000/panda-taxonomy-3",
  }),
];

const backgroundSources = [
  candidate({
    sourceId: "panda-background-1",
    title: "Giant panda and red panda naming in Chinese terminology",
    reviewStatus: "review",
    sourceBucket: "terminology_usage",
    bucketScore: 0.66,
    recommendationBucket: "official_background",
    sourceRole: "definition_or_concept",
    sourceUseCase: "background_context",
    url: "https://example.edu/panda-terminology",
  }),
];

const rejectedSources = [
  candidate({
    sourceId: "panda-offtopic-vaquita",
    title: "Vaquita genome reveals marine mammal conservation history",
    reviewStatus: "rejected",
    sourceBucket: "off_topic",
    bucketScore: 0.92,
    recommendationBucket: "rejected",
    sourceRole: "rejected",
    sourceUseCase: "rejected",
    doi: "10.1000/vaquita",
  }),
  candidate({
    sourceId: "panda-offtopic-polar-bear",
    title: "Polar bear faecal microbiota varies by Arctic diet",
    reviewStatus: "rejected",
    sourceBucket: "off_topic",
    bucketScore: 0.92,
    recommendationBucket: "rejected",
    sourceRole: "rejected",
    sourceUseCase: "rejected",
    doi: "10.1000/polar-bear",
  }),
  candidate({
    sourceId: "panda-offtopic-sign-language",
    title: "Sign language lexical comprehension in bilingual adults",
    reviewStatus: "rejected",
    sourceBucket: "off_topic",
    bucketScore: 0.92,
    recommendationBucket: "rejected",
    sourceRole: "rejected",
    sourceUseCase: "rejected",
    doi: "10.1000/sign-language",
  }),
];

const allSources = [...acceptedSources, ...backgroundSources, ...rejectedSources];

const diagnosticTrace = {
  workflowId: "wf-e2e-panda",
  topicHash: "topic-e2e-panda",
  originalTopic: "熊貓與貓熊的關係",
  createdAt: now,
  step1_input: {
    rawTopic: "熊貓與貓熊的關係",
    locale: "zh-TW",
    searchDepth: "standard",
  },
  step2_normalization: {
    normalizedTopicZh: "熊貓與貓熊名稱差異、大熊貓與小熊貓分類關係",
    normalizedTopicEn:
      "relationship between panda and cat-bear terminology, giant panda taxonomy, red panda distinction, and naming history",
    detectedDomain: "mixed / biology + culture_linguistics",
    confidence: 0.93,
    ambiguityFlags: [],
    positiveTermsZh: ["熊貓", "貓熊", "大熊貓", "小熊貓", "分類學"],
    positiveTermsEn: ["giant panda", "red panda", "Ailuropoda melanoleuca", "Ailurus fulgens"],
    negativeTerms: ["kung fu panda", "panda express"],
  },
  step3_queryPlan: {
    bilingualQueries: [
      {
        query: "大熊貓 小熊貓 分類 關係",
        lang: "zh",
        purpose: "taxonomy",
        providerHints: ["OpenAlex", "Crossref"],
      },
      {
        query: "giant panda red panda taxonomy naming history",
        lang: "en",
        purpose: "taxonomy",
        providerHints: ["OpenAlex", "Semantic Scholar", "Crossref"],
      },
    ],
    selectedQueriesByProvider: {
      openalex: ["giant panda red panda taxonomy naming history", "Ailuropoda melanoleuca Ailurus fulgens classification"],
      crossref: ["giant panda red panda taxonomy naming history"],
      semanticScholar: ["Ailuropoda melanoleuca Ailurus fulgens classification"],
      core: ["giant panda red panda taxonomy naming history"],
      web: ["panda cat-bear Chinese terminology"],
    },
    classifiedQueries: [
      {
        query: "background context",
        classification: "outlineHint",
        reason: "report outline hint, not a provider search query",
        providerHints: ["OpenAlex", "Crossref"],
      },
      {
        query: "panda cat-bear Chinese terminology",
        classification: "backgroundQuery",
        reason: "background or terminology query routed away from academic providers",
        providerHints: ["web"],
      },
      {
        query: "giant panda red panda taxonomy naming history",
        classification: "providerQuery",
        reason: "contains searchable topic or domain entities",
        providerHints: ["OpenAlex", "Crossref"],
      },
    ],
  },
  step4_providerExecution: [
    {
      provider: "OpenAlex",
      status: "success",
      queriesUsed: ["giant panda red panda taxonomy naming history"],
      rawCount: 7,
      latencyMs: 120,
    },
    {
      provider: "Crossref",
      status: "empty",
      queriesUsed: ["giant panda red panda taxonomy naming history"],
      rawCount: 0,
      latencyMs: 95,
    },
  ],
  step5_normalizedSources: {
    rawTotal: 7,
    normalizedTotal: 7,
    dedupedTotal: 7,
    duplicateRemoved: 0,
    missingTitleCount: 0,
    missingAbstractCount: 0,
  },
  step6_scoring: allSources.map((source) => ({
    sourceId: source.sourceId,
    title: source.title,
    provider: source.provider,
    url: source.url,
    doi: source.doi,
    year: source.year,
    sourceType: source.sourceType,
    relevanceScore: source.relevanceScore,
    qualityScore: source.sourceQualityScore,
    bucket: source.sourceBucket,
    bucketScore: source.bucketScore,
    decision:
      source.reviewStatus === "accepted"
        ? "accepted"
        : source.reviewStatus === "rejected"
          ? "rejected"
          : "fallback_review",
    decisionReasons: source.decisionReasons,
    matchedEntities: source.matchedEntities,
    missingRequiredSignals: source.missingRequiredSignals,
    sourceUseCase: source.sourceUseCase,
    finalBucket:
      source.reviewStatus === "accepted"
        ? "accepted"
        : source.reviewStatus === "rejected"
          ? "rejected"
          : "fallback_review",
    matchedTerms: source.matchedConcepts,
    rejectionReasons: source.reviewStatus === "rejected" ? [source.rejectionReason] : undefined,
    scoringNotes: [
      `reviewStatus=${source.reviewStatus}`,
      `recommendationBucket=${source.recommendationBucket}`,
      `sourceRole=${source.sourceRole}`,
    ],
  })),
  step7_bucketSummary: {
    acceptedSources: 3,
    fallbackReviewSources: 1,
    manualReviewSources: 0,
    rejectedSources: 3,
    officialBackgroundSources: 1,
    highConfidenceManualSources: 1,
    bucketCounts: {
      taxonomy_distinction: 3,
      terminology_usage: 1,
      off_topic: 3,
    },
    backgroundSourceNeeded: false,
  },
  step8_nextStepDecision: {
    workflowStatus: "completed",
    canProceedToSourceReview: true,
    reason: "Bucket-aware source routing found accepted taxonomy evidence and rejected off-topic controls.",
  },
};

const groundingJob = {
  jobId: "job-e2e-panda",
  workflowId: "wf-e2e-panda",
  topicHash: "topic-e2e-panda",
  originalTopic: "熊貓與貓熊的關係",
  normalizedTopic: "熊貓與貓熊名稱差異、大熊貓與小熊貓分類關係",
  status: "source_review_ready",
  progress: 100,
  queryPlan: {
    queryPlanHash: "query-plan-e2e-panda",
  },
  sourceCandidates: allSources,
  highConfidenceCandidateSources: acceptedSources,
  candidateSources: acceptedSources,
  acceptedSources,
  fallbackReviewSources: backgroundSources,
  rejectedSources,
  sourceQualitySummary: {
    totalSources: 4,
    academicCandidateCount: 3,
    peerReviewedOrDoiCount: 3,
    officialBackgroundCount: 1,
    fallbackReviewCount: 1,
    rejectedCount: 3,
    academicEnough: true,
    evidenceUsableEnough: true,
  },
  groundingDiagnostics: {
    rawTopic: "熊貓與貓熊的關係",
    normalizedTopic: "熊貓與貓熊名稱差異、大熊貓與小熊貓分類關係",
    currentPhase: "source_review_ready",
    zhQueries: ["大熊貓 小熊貓 分類 關係"],
    enQueries: ["giant panda red panda taxonomy naming history"],
    providersCalled: ["OpenAlex", "Crossref"],
    rawProviderCounts: { OpenAlex: 7, Crossref: 0 },
    normalizedCount: 7,
    dedupedCount: 7,
    scoredCount: 7,
    highConfidenceCandidateCount: 3,
    scholarlyRecommendedCount: 3,
    officialBackgroundCount: 1,
    manualReviewCount: 0,
    candidateCount: 4,
    fallbackReviewCount: 1,
    rejectedCount: 3,
    acceptedCount: 3,
    canProceedToSourceReview: true,
    canProceedToAcademicDraft: true,
    canProceedToBackgroundDraft: true,
    readinessReason: "已達學術草稿最低來源門檻。",
    readinessWarnings: [],
    canProceedToNextStage: true,
    blockingReason: null,
    userVisibleStatus: "已找到 3 筆學術候選來源，可進入來源審查。",
    sourceQualitySummary: {
      totalSources: 4,
      academicCandidateCount: 3,
      peerReviewedOrDoiCount: 3,
      officialBackgroundCount: 1,
      fallbackReviewCount: 1,
      rejectedCount: 3,
      academicEnough: true,
      evidenceUsableEnough: true,
    },
    rejectionReasons: {},
    providerErrors: [],
    finalUiState: "source_review_ready",
    diagnosticTrace,
  },
  diagnosticTrace,
  evidenceCards: [],
  fallbackAttempts: [],
  providerErrors: [],
  warnings: [],
  createdAt: now,
  updatedAt: now,
};

test("panda Step 2 shows bucket-aware source routing and enters source review", async ({ page }) => {
  await page.route("**/api/research-grounding-jobs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jobId: "job-e2e-panda",
        workflowId: "wf-e2e-panda",
        topicHash: "topic-e2e-panda",
        status: "queued",
      }),
    });
  });

  await page.route("**/api/research-grounding-jobs/job-e2e-panda", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(groundingJob),
    });
  });

  await page.goto(`${baseUrl}/generator`);
  await page.getByTestId("input-topic").fill("熊貓與貓熊的關係");
  await page.getByTestId("research-domain-natural_science").click();
  await page.getByRole("button", { name: /開始搜尋研究資料/ }).click();

  const tracePanel = page.getByTestId("grounding-diagnostic-trace");
  await expect(tracePanel).toBeVisible();
  await expect(tracePanel).toContainText("流程診斷");
  await expect(tracePanel).toContainText("taxonomy_distinction");
  await expect(tracePanel).toContainText("off_topic");
  await expect(tracePanel).toContainText("selectedQueriesByProvider");
  await expect(tracePanel).toContainText("backgroundQuery");

  await page.screenshot({
    path: "../../output/playwright/panda-step2-bucket-routing.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: /前往來源審查/ }).click();
  await expect(page.getByTestId("generator-manage-step")).toBeVisible();
});

const reviewableFixtures = [
  {
    topic: "風箏飛行原理",
    domainTestId: "research-domain-natural_science",
    jobId: "job-e2e-reviewable-kite",
    workflowId: "wf-e2e-reviewable-kite",
    topicHash: "tywkap",
    normalizedTopicEn: "physics of kite flight: lift, drag, tension, stability, and wind interaction",
    zhQuery: "風箏 飛行 原理 升力 阻力 張力 穩定性",
    enQuery: "kite flight physics lift drag string tension stability wind",
    bucket: "physics_atmospheric_optics",
    concepts: ["kite flight", "lift", "drag", "string tension", "stability"],
  },
  {
    topic: "鳥類與其餵食方式",
    domainTestId: "research-domain-life_environment",
    jobId: "job-e2e-reviewable-bird-feeding",
    workflowId: "wf-e2e-reviewable-bird-feeding",
    topicHash: "6aoxi0",
    normalizedTopicEn: "bird feeding strategies, diet specialization, foraging ecology, and feeding behavior",
    zhQuery: "鳥類 餵食方式 覓食策略 食性 行為 生態",
    enQuery: "bird feeding strategies diet specialization foraging ecology behavior",
    bucket: "general_academic",
    concepts: ["bird feeding", "foraging ecology", "diet specialization", "feeding behavior"],
  },
  {
    topic: "牙菌斑的生成及對應治療方式",
    domainTestId: "research-domain-life_environment",
    jobId: "job-e2e-reviewable-dental-plaque",
    workflowId: "wf-e2e-reviewable-dental-plaque",
    topicHash: "oycq1g",
    normalizedTopicEn:
      "dental plaque biofilm formation, oral microbiome, prevention, treatment, and periodontal therapy",
    zhQuery: "牙菌斑 生成 生物膜 口腔微生物 預防 治療",
    enQuery: "dental plaque biofilm formation oral microbiome prevention treatment periodontal therapy",
    bucket: "biomedical",
    concepts: ["dental plaque", "biofilm formation", "oral microbiome", "periodontal therapy"],
  },
] as const;

type ReviewableFixture = (typeof reviewableFixtures)[number];

function reviewableCandidate(fixture: ReviewableFixture, index: number) {
  const provider = index % 2 === 0 ? "openalex" : "crossref";
  return {
    sourceId: `${fixture.topicHash}-source-${index + 1}`,
    workflowId: fixture.workflowId,
    topicHash: fixture.topicHash,
    queryUsed: index % 2 === 0 ? fixture.enQuery : fixture.zhQuery,
    queryIntent: "exact",
    provider,
    title: `${fixture.topic}：可審查研究來源 ${index + 1}`,
    authors: ["ResearchForge Regression"],
    year: 2020 + index,
    venue: "Source Review Regression Journal",
    doi: `10.1000/${fixture.topicHash}-${index + 1}`,
    url: `https://doi.org/10.1000/${fixture.topicHash}-${index + 1}`,
    abstractOriginal: `${fixture.normalizedTopicEn}. This source discusses ${fixture.concepts.join(
      ", ",
    )} with traceable scholarly metadata and topic-matched abstract evidence.`,
    sourceType: "paper",
    sourceKind: "journal",
    institutionType: "unknown",
    isPeerReviewed: true,
    hasDoi: true,
    isAcademic: true,
    isOfficialBackground: false,
    usableAsEvidence: true,
    usableAsBackground: true,
    governanceReason: "academic_traceable_doi_or_scholarly_provider",
    retryRound: 0,
    relevanceScore: 0.66,
    sourceQualityScore: 0.82,
    finalScore: 0.66,
    retrievalMode: "live_provider",
    recommendationBucket: "manual_review",
    sourceRole: "weak_or_uncertain",
    sourceBucket: fixture.bucket,
    bucketScore: 0.66,
    bucketScores: {
      [fixture.bucket]: 0.66,
    },
    decisionReasons: [`${fixture.bucket} bucket has topic-matched bilingual evidence`],
    matchedEntities: fixture.concepts,
    missingRequiredSignals: [],
    sourceUseCase: "manual_review_only",
    confidenceTier: "fallback",
    matchedConcepts: fixture.concepts,
    matchedFields: ["title", "abstract", "venue"],
    reviewStatus: "review",
    evidencePoints: [`${fixture.topic} has reviewable source evidence ${index + 1}`],
    limitations: ["requires human source review before academic drafting"],
    usableSections: ["literature_review", "analysis", "discussion"],
    citationMarker: `［${fixture.topicHash}-${index + 1}］`,
    dedupeKey: `${fixture.topicHash}-source-${index + 1}`,
    createdAt: now,
    retrievedAt: now,
  };
}

function reviewableEvidenceCard(fixture: ReviewableFixture, source: ReturnType<typeof reviewableCandidate>) {
  return {
    evidenceId: `${source.sourceId}-evidence`,
    evidenceCardId: `${source.sourceId}-evidence`,
    workflowId: fixture.workflowId,
    topicHash: fixture.topicHash,
    sourceId: source.sourceId,
    claimTextOriginal: source.abstractOriginal,
    claimTextZh: `${fixture.topic} 的相關研究可由此來源摘要支持。`,
    supportedByText: source.abstractOriginal,
    sourceUri: source.url,
    sourceTitle: source.title,
    sourceUrl: source.url,
    sourceDoi: source.doi,
    sourceProvider: source.provider,
    sourceType: source.sourceType,
    recommendationBucket: source.recommendationBucket,
    sourceRole: source.sourceRole,
    retrievalMode: source.retrievalMode,
    isPeerReviewed: true,
    venue: source.venue,
    quoteOrSpan: source.abstractOriginal,
    sourceQualityScore: source.sourceQualityScore,
    relevanceScore: source.relevanceScore,
    citationMarker: source.citationMarker,
    usableFor: ["literature_review", "analysis", "discussion"],
    evidence_type: "finding",
    confidence: 0.72,
    limitations: source.limitations,
    source_access_level: "abstract_only",
    needsManualReview: true,
    governanceFlags: [],
    trace: {
      provider: source.provider,
      query_used: source.queryUsed,
      url: source.url,
      doi: source.doi,
      extraction_method: "metadata_abstract",
      content_hash: `${source.sourceId}-hash`,
    },
    extractedBy: "metadata_only",
    safety: {
      containsActionableHarm: false,
      redactionApplied: false,
      safeSummaryMode: "none",
      safetyNotes: [],
    },
    createdAt: now,
  };
}

function reviewableDiagnosticTrace(fixture: ReviewableFixture, sources: ReturnType<typeof reviewableCandidate>[]) {
  const scoredSources = sources.map((source) => ({
    sourceId: source.sourceId,
    title: source.title,
    provider: source.provider,
    url: source.url,
    doi: source.doi,
    year: source.year,
    sourceType: source.sourceType,
    relevanceScore: source.relevanceScore,
    qualityScore: source.sourceQualityScore,
    bucket: source.sourceBucket,
    bucketScore: source.bucketScore,
    decision: "fallback_review",
    decisionReasons: source.decisionReasons,
    matchedEntities: source.matchedEntities,
    missingRequiredSignals: source.missingRequiredSignals,
    sourceUseCase: source.sourceUseCase,
    finalBucket: "fallback_review",
    matchedTerms: source.matchedConcepts,
    scoringNotes: [
      "reviewStatus=review",
      "recommendationBucket=manual_review",
      "acceptedSources=0",
    ],
  }));

  return {
    workflowId: fixture.workflowId,
    topicHash: fixture.topicHash,
    originalTopic: fixture.topic,
    rawUserTopic: fixture.topic,
    createdAt: now,
    step1_input: {
      rawTopic: fixture.topic,
      rawUserTopic: fixture.topic,
      locale: "zh-TW",
      searchDepth: "standard",
    },
    step2_normalization: {
      normalizedTopicZh: fixture.topic,
      normalizedTopicEn: fixture.normalizedTopicEn,
      detectedDomain: "reviewable regression fixture",
      confidence: 0.91,
      ambiguityFlags: [],
      positiveTermsZh: [fixture.topic],
      positiveTermsEn: fixture.concepts,
      negativeTerms: ["unrelated popular culture", "advertisement"],
    },
    step3_queryPlan: {
      bilingualQueries: [
        {
          query: fixture.zhQuery,
          lang: "zh",
          purpose: "specific",
          providerHints: ["OpenAlex", "Crossref"],
        },
        {
          query: fixture.enQuery,
          lang: "en",
          purpose: "review",
          providerHints: ["OpenAlex", "Crossref", "Semantic Scholar"],
        },
      ],
      selectedQueriesByProvider: {
        openalex: [fixture.enQuery, fixture.zhQuery],
        crossref: [fixture.enQuery],
        semanticScholar: [fixture.enQuery],
        core: [fixture.enQuery],
        web: [],
      },
      classifiedQueries: [
        {
          query: fixture.enQuery,
          classification: "providerQuery",
          reason: "contains searchable topic entities and academic terms",
          providerHints: ["OpenAlex", "Crossref"],
        },
        {
          query: fixture.zhQuery,
          classification: "providerQuery",
          reason: "Chinese raw topic expanded into provider-safe search terms",
          providerHints: ["OpenAlex"],
        },
      ],
    },
    step4_providerExecution: [
      {
        provider: "OpenAlex",
        status: "success",
        queriesUsed: [fixture.enQuery, fixture.zhQuery],
        rawCount: 10,
        latencyMs: 110,
      },
      {
        provider: "Crossref",
        status: "success",
        queriesUsed: [fixture.enQuery],
        rawCount: 8,
        latencyMs: 92,
      },
      {
        provider: "CORE",
        status: "skipped",
        queriesUsed: [fixture.enQuery],
        rawCount: 0,
        latencyMs: 0,
      },
    ],
    step5_normalizedSources: {
      rawTotal: 18,
      normalizedTotal: 18,
      dedupedTotal: sources.length,
      duplicateRemoved: 10,
      missingTitleCount: 0,
      missingAbstractCount: 0,
    },
    step6_scoring: scoredSources,
    step7_bucketSummary: {
      acceptedSources: 0,
      fallbackReviewSources: sources.length,
      manualReviewSources: sources.length,
      rejectedSources: 0,
      officialBackgroundSources: 0,
      highConfidenceManualSources: 0,
      bucketCounts: {
        [fixture.bucket]: sources.length,
      },
      backgroundSourceNeeded: false,
    },
    step8_nextStepDecision: {
      workflowStatus: "ready_for_review",
      canProceedToSourceReview: true,
      reason: `找到 ${sources.length} 筆可人工審查來源，即使 acceptedSources=0 也可進入來源審查。`,
    },
  };
}

function reviewableGroundingJob(fixture: ReviewableFixture) {
  const sources = Array.from({ length: 8 }, (_, index) =>
    reviewableCandidate(fixture, index),
  );
  const diagnosticTrace = reviewableDiagnosticTrace(fixture, sources);

  return {
    jobId: fixture.jobId,
    workflowId: fixture.workflowId,
    topicHash: fixture.topicHash,
    originalTopic: fixture.topic,
    normalizedTopic: fixture.topic,
    status: "source_review_ready",
    progress: 100,
    queryPlan: {
      primaryQueries: [fixture.enQuery, fixture.zhQuery],
      secondaryQueries: [],
    },
    sourceCandidates: sources,
    highConfidenceCandidateSources: [],
    candidateSources: [],
    acceptedSources: [],
    fallbackReviewSources: sources,
    rejectedSources: [],
    sourceQualitySummary: {
      totalSources: sources.length,
      academicCandidateCount: 0,
      peerReviewedOrDoiCount: sources.length,
      officialBackgroundCount: 0,
      fallbackReviewCount: sources.length,
      rejectedCount: 0,
      academicEnough: false,
      evidenceUsableEnough: true,
    },
    groundingDiagnostics: {
      rawTopic: fixture.topic,
      rawUserTopic: fixture.topic,
      normalizedTopic: fixture.topic,
      currentPhase: "source_review_ready",
      zhQueries: [fixture.zhQuery],
      enQueries: [fixture.enQuery],
      providersCalled: ["OpenAlex", "Crossref", "CORE"],
      rawProviderCounts: { OpenAlex: 10, Crossref: 8, CORE: 0 },
      rawProviderCount: 18,
      normalizedCount: 18,
      dedupedCount: sources.length,
      scoredCount: sources.length,
      highConfidenceCandidateCount: 0,
      scholarlyRecommendedCount: 0,
      officialBackgroundCount: 0,
      manualReviewCount: sources.length,
      candidateCount: sources.length,
      fallbackReviewCount: sources.length,
      rejectedCount: 0,
      acceptedCount: 0,
      canProceedToSourceReview: true,
      canProceedToAcademicDraft: false,
      canProceedToBackgroundDraft: true,
      readinessReason: "acceptedSources=0，但可審查來源已達進入來源審查門檻。",
      readinessWarnings: ["需要人工接受來源後才能生成報告。"],
      canProceedToNextStage: true,
      blockingReason: null,
      userVisibleStatus: `已找到 ${sources.length} 筆可審查來源，請進入來源審查挑選可用來源。`,
      sourceQualitySummary: {
        totalSources: sources.length,
        academicCandidateCount: 0,
        peerReviewedOrDoiCount: sources.length,
        officialBackgroundCount: 0,
        fallbackReviewCount: sources.length,
        rejectedCount: 0,
        academicEnough: false,
        evidenceUsableEnough: true,
      },
      rejectionReasons: {},
      providerErrors: [],
      providerProgress: [
        {
          provider: "OpenAlex",
          status: "success",
          resultCount: 10,
          queryCount: 2,
          rawResultsCount: 10,
          normalizedCount: 10,
          candidateCount: 4,
          fallbackReviewCount: 4,
          acceptedCount: 0,
          rejectedCount: 0,
          durationMs: 110,
        },
        {
          provider: "Crossref",
          status: "success",
          resultCount: 8,
          queryCount: 1,
          rawResultsCount: 8,
          normalizedCount: 8,
          candidateCount: 4,
          fallbackReviewCount: 4,
          acceptedCount: 0,
          rejectedCount: 0,
          durationMs: 92,
        },
        {
          provider: "CORE",
          status: "background",
          resultCount: 0,
          queryCount: 1,
          rawResultsCount: 0,
          normalizedCount: 0,
          candidateCount: 0,
          fallbackReviewCount: 0,
          acceptedCount: 0,
          rejectedCount: 0,
          durationMs: 0,
        },
      ],
      finalUiState: "source_review_ready",
      diagnosticTrace,
    },
    diagnosticTrace,
    evidenceCards: sources.map((source) => reviewableEvidenceCard(fixture, source)),
    fallbackAttempts: [],
    providerErrors: [],
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };
}

test("Chinese Step 2 topics with zero accepted sources still enter source review", async ({ page }) => {
  const jobs = new Map(
    reviewableFixtures.map((fixture) => [
      fixture.jobId,
      reviewableGroundingJob(fixture),
    ]),
  );

  await page.route("**/api/research-grounding-jobs", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      topic?: string;
      originalTopic?: string;
      rawUserTopic?: string;
      normalizedTopic?: string;
    };
    const fixture = reviewableFixtures.find(
      (item) =>
        item.topic === body.rawUserTopic ||
        item.topic === body.originalTopic ||
        item.topic === body.topic,
    );
    expect(fixture).toBeTruthy();
    expect(body.rawUserTopic).toBe(fixture?.topic);
    expect(body.originalTopic).toBe(fixture?.topic);
    expect(body.topic).toBe(fixture?.topic);
    expect(body.normalizedTopic ?? fixture?.topic).not.toContain("核心技術");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jobId: fixture?.jobId,
        workflowId: fixture?.workflowId,
        topicHash: fixture?.topicHash,
        status: "queued",
      }),
    });
  });

  await page.route("**/api/research-grounding-jobs/job-e2e-reviewable-*", async (route) => {
    const jobId = route.request().url().split("/").pop() ?? "";
    const job = jobs.get(jobId);
    expect(job).toBeTruthy();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(job),
    });
  });

  for (const fixture of reviewableFixtures) {
    await page.goto(`${baseUrl}/generator`);
    await page.getByTestId("input-topic").fill(fixture.topic);
    await expect(page.getByTestId("input-topic")).toHaveValue(fixture.topic);
    await page.getByTestId(fixture.domainTestId).click();
    await page.getByRole("button", { name: /開始搜尋研究資料/ }).click();

    const searchStep = page.getByTestId("generator-search-step");
    await expect(searchStep).toBeVisible();
    await expect(searchStep).toContainText(fixture.topic);
    await expect(searchStep).toContainText("已找到可審查來源");
    await expect(searchStep).toContainText("原始結果");
    await expect(searchStep).toContainText("待人工審查 8 筆");
    await expect(searchStep).not.toContainText("資料搜尋失敗");

    const tracePanel = page.getByTestId("grounding-diagnostic-trace");
    await expect(tracePanel).toContainText("rawUserTopic");
    await expect(tracePanel).toContainText(fixture.topic);
    await expect(tracePanel).toContainText("providerRuns");
    await expect(tracePanel).toContainText("nextStepDecision");

    const reviewButton = page.getByRole("button", { name: /前往來源審查/ });
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();
    await expect(page.getByTestId("generator-manage-step")).toBeVisible();
    await expect(page.getByTestId("source-card-pending")).toHaveCount(8);

    await page.getByRole("button", { name: /全選可用來源/ }).click();
    await expect(page.getByTestId("source-card-accepted")).toHaveCount(8);

    const generateButton = page.getByRole("button", { name: /下一步：生成報告/ });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(page.getByTestId("generator-generate-step")).toBeVisible();
  }
});
