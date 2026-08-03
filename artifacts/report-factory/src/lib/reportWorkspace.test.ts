import assert from "node:assert/strict";
import test from "node:test";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  createReportWorkspace,
  generationReadiness,
  generatorWorkflowVisibility,
  reportGenerationBlockingReason,
  reportSourceGuardDiagnostics,
  reportWorkspacePath,
  reportTopicFingerprint,
  serializeReportWorkspaceForStorageForTests,
  shouldRunSupplementalCoverageSearch,
  startReportWorkspaceNavigation,
  workspaceToGeneratedReport,
  workspaceSnapshotIsConsistent,
  workspaceMatchesTopic,
} from "./reportWorkspace.ts";

const DEFAULT_TEST_TOPIC = "短影音使用對高中生注意力與睡眠品質之影響";
const DEFAULT_WORKFLOW_ID = "wf-report-workspace-test";
const DEFAULT_TOPIC_HASH = reportTopicFingerprint(DEFAULT_TEST_TOPIC);
const DEFAULT_QUERY_PLAN_HASH = "qp-report-workspace-test";

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    topic: DEFAULT_TEST_TOPIC,
    reportType: "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
    researchDepth: "standard",
    purpose: "學校作業",
    domainOverride: "",
    mode: "先建立報告架構",
    sourceRequirement: "需要，並生成參考文獻格式",
    citationFormat: "APA",
    chartRequirement: "需要",
    style: "高中生自然報告風格",
    length: "一般報告",
    wordCount: "",
    formalTone: "不需要",
    conversationalTone: "不需要",
    specifiedStructure: "",
    rubric: "",
    personalStyle: "",
    supplementalMaterials: "",
    outputLanguage: "繁體中文",
    rewriteSection: "",
    additionalInfo: "",
    acceptedSources: [],
    ...overrides,
  };
}

function source(
  index: number,
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    id: `source-${index}`,
    title: `Source ${index}`,
    authors: ["Ada Lovelace"],
    year: 2020 + index,
    abstract: `Evidence abstract ${index} includes enough detail to judge relevance and usable summary quality.`,
    doi: `10.1000/source-${index}`,
    url: `https://doi.org/10.1000/source-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "journal_article",
    confidence: "高",
    usableSections: ["研究背景", "文獻探討"],
    reviewNotes: "usable",
    relevanceLevel: "primary",
    evidenceGrounding: "abstract_grounded",
    workflowId: DEFAULT_WORKFLOW_ID,
    topic: DEFAULT_TEST_TOPIC,
    normalizedTopic: DEFAULT_TEST_TOPIC,
    topicHash: DEFAULT_TOPIC_HASH,
    queryPlanHash: DEFAULT_QUERY_PLAN_HASH,
    ...overrides,
  };
}

function sourceForTopic(
  index: number,
  topic: string,
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  const topicHash = reportTopicFingerprint(topic);
  return source(index, {
    workflowId: `wf-${topicHash}`,
    topic,
    normalizedTopic: topic,
    topicHash,
    queryPlanHash: `qp-${topicHash}`,
    ...overrides,
  });
}

const SUNSET_TOPIC = "夕陽餘暉與光波長的關係";

test("generation readiness uses canonical 3-source short and 10-source standard thresholds", () => {
  const blocked = generationReadiness(2);
  const shortReport = generationReadiness(3);
  const standardReport = generationReadiness(10);

  assert.equal(blocked.canGenerate, false);
  assert.equal(blocked.buttonLabel, "來源不足");
  assert.equal(blocked.minRequiredSources, 3);
  assert.equal(blocked.reportMode, "blocked");
  assert.equal(shortReport.mode, "short_research_report");
  assert.equal(shortReport.buttonLabel, "生成短版研究報告");
  assert.equal(shortReport.reportMode, "short");
  assert.equal(shortReport.claimMode, "academic_claim_mode");
  assert.equal(shortReport.canGenerateFull, false);
  assert.match(shortReport.warning ?? "", /可生成短版研究報告/);
  assert.equal(generationReadiness(9).canGenerateFull, false);
  assert.equal(standardReport.mode, "standard_research_report");
  assert.equal(standardReport.buttonLabel, "生成標準研究報告");
  assert.equal(standardReport.reportMode, "standard");
  assert.equal(standardReport.canGenerateFull, true);
});

test("generation readiness keeps short reports available with accepted metadata and surfaces diagnostics", () => {
  const lowQualityAccepted = [
    source(1),
    source(2),
    source(3, { relevanceLevel: "off_topic" } as Partial<SourceRecord>),
    source(4),
    source(5),
  ];
  const quickDraftSources = [
    source(1, { usableSections: ["研究背景"] }),
    source(2, {
      relevanceLevel: "secondary",
      usableSections: ["文獻探討"],
    } as Partial<SourceRecord>),
    source(3, {
      relevanceLevel: "primary",
      usableSections: ["結論"],
    } as Partial<SourceRecord>),
    source(4, { usableSections: ["數據分析"] }),
    source(5, { usableSections: ["研究方法"] }),
    source(6, { usableSections: ["文獻探討"] }),
  ];
  const fullSources = Array.from({ length: 10 }, (_, index) =>
    source(index + 1, {
      relevanceLevel: index < 5 ? "primary" : "secondary",
      abstract:
        index < 4
          ? `Useful abstract ${index} includes enough detail to support readiness quality checks.`
          : index === 4
            ? null
            : `Additional useful abstract ${index} includes enough detail to support readiness quality checks.`,
      usableSections:
        index % 3 === 0
          ? ["研究背景"]
          : index % 3 === 1
            ? ["文獻探討"]
            : ["數據分析"],
    } as Partial<SourceRecord>),
  );

  const blocked = generationReadiness(lowQualityAccepted);
  const quickDraft = generationReadiness(quickDraftSources);
  const full = generationReadiness(fullSources);

  assert.equal(blocked.canGenerate, true);
  assert.equal(blocked.lowQualityAcceptedCount, 1);
  assert.equal(blocked.reportMode, "short");
  assert.equal(quickDraft.canGenerate, true);
  assert.equal(quickDraft.canGenerateFull, false);
  assert.equal(quickDraft.relevantSourceCount, 6);
  assert.equal(quickDraft.usableSummaryCount, 6);
  assert.equal(full.canGenerateFull, true);
  assert.equal(full.coverageCount >= 2, true);
});

test("generation readiness allows short report from five secondary sources", () => {
  const secondarySources = [
    source(1, { relevanceLevel: "secondary", usableSections: ["研究背景"] }),
    source(2, { relevanceLevel: "secondary", usableSections: ["文獻探討"] }),
    source(3, { relevanceLevel: "clue", usableSections: ["結論"] }),
    source(4, { relevanceLevel: "secondary", usableSections: ["研究方法"] }),
    source(5, { relevanceLevel: "clue", usableSections: ["數據分析"] }),
  ];

  const readiness = generationReadiness(secondarySources);

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.canGenerateFull, false);
  assert.equal(readiness.mode, "short_research_report");
  assert.equal(readiness.primarySourceCount, 0);
  assert.equal(readiness.secondarySourceCount, 5);
  assert.match(readiness.warning ?? "", /可生成短版研究報告/);
  assert.equal(readiness.buttonLabel, "生成短版研究報告");
});

test("official background sources can generate a background report without academic-claim mode", () => {
  const officialSources = [
    {
      title: "NASA Space Place: Why is the sky blue?",
      publisher: "NASA Space Place",
      url: "https://spaceplace.nasa.gov/blue-sky/en/",
    },
    {
      title: "UCAR Center for Science Education: Sunset Colors",
      publisher: "UCAR Center for Science Education",
      url: "https://scied.ucar.edu/",
    },
    {
      title: "NOAA education: Atmospheric scattering",
      publisher: "NOAA",
      url: "https://www.noaa.gov/education",
    },
  ].map((item, index) =>
    sourceForTopic(index + 1, SUNSET_TOPIC, {
      title: item.title,
      publisher: item.publisher,
      url: item.url,
      doi: null,
      sourceType: "Official Source",
      sourceKind: "web",
      sourceCategory: "government_or_institution",
      recommendationBucket: "official_background",
      sourceRole: "official_background_explanation",
      isPeerReviewed: false,
      relevanceLevel: "secondary",
      usableSections: ["研究背景"],
    }),
  );

  const readiness = generationReadiness(officialSources);

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.mode, "background_report_mode");
  assert.equal(readiness.claimMode, "background_report_mode");
  assert.equal(readiness.scholarlyEvidenceCount, 0);
  assert.equal(readiness.officialBackgroundCount, 3);
  assert.equal(readiness.officialBackgroundSourcesCount, 3);
  assert.match(readiness.warning ?? "", /背景型研究報告/);
  assert.equal(
    reportGenerationBlockingReason({
      topic: SUNSET_TOPIC,
      acceptedSources: officialSources,
      evidenceCardCount: 3,
      workflowId: `wf-${reportTopicFingerprint(SUNSET_TOPIC)}`,
      topicHash: reportTopicFingerprint(SUNSET_TOPIC),
    }),
    null,
  );

  const result = startReportWorkspaceNavigation({
    input: input({ topic: SUNSET_TOPIC }),
    acceptedSources: officialSources,
    navigate: () => {},
    saveWorkspace: () => {},
  });

  assert.ok(result);
  assert.equal(result.workspace.generationMode, "background_report_mode");
  assert.equal(result.workspace.evidenceCards.length, 0);
  assert.equal(result.workspace.generationPayload.evidenceCards.length, 0);
});

test("report generation blocking reason is explicit below three accepted sources and clears at three", () => {
  const topic = "月球表面撞擊坑形成機制";
  const twoAccepted = [
    sourceForTopic(1, topic, { title: "月球表面撞擊坑形成機制 source 1" }),
    sourceForTopic(2, topic, { title: "月球表面撞擊坑形成機制 source 2" }),
  ];
  const threeAccepted = [
    ...twoAccepted,
    sourceForTopic(3, topic, { title: "月球表面撞擊坑形成機制 source 3" }),
  ];

  assert.equal(
    reportGenerationBlockingReason({
      topic,
      acceptedSources: twoAccepted,
      evidenceCardCount: 2,
      workflowId: `wf-${reportTopicFingerprint(topic)}`,
      topicHash: reportTopicFingerprint(topic),
    }),
    "目前已接受 2 筆可用來源，至少需 3 筆才能生成研究報告。",
  );
  assert.equal(
    reportGenerationBlockingReason({
      topic,
      acceptedSources: threeAccepted,
      evidenceCardCount: 3,
      workflowId: `wf-${reportTopicFingerprint(topic)}`,
      topicHash: reportTopicFingerprint(topic),
    }),
    null,
  );
  assert.equal(
    reportGenerationBlockingReason({
      topic,
      acceptedSources: threeAccepted,
      evidenceCardCount: 0,
      workflowId: `wf-${reportTopicFingerprint(topic)}`,
      topicHash: reportTopicFingerprint(topic),
    }),
    "來源已接受，但尚未形成足夠證據卡，請先重新產生證據卡後再生成報告。",
  );
  assert.equal(
    reportGenerationBlockingReason({
      topic,
      acceptedSources: threeAccepted,
      evidenceCardCount: 1,
      workflowId: `wf-${reportTopicFingerprint(topic)}`,
      topicHash: reportTopicFingerprint(topic),
    }),
    null,
  );
});

test("generation readiness blocks zero evidence and labels one-source evidence as limited", () => {
  const acceptedSources = [
    source(1, { usableSections: ["研究背景"] }),
    source(2, { usableSections: ["文獻探討"] }),
    source(3, { usableSections: ["結論"] }),
  ];

  const blocked = generationReadiness(acceptedSources, "standard", []);
  const limited = generationReadiness(acceptedSources, "standard", [{
    id: "evidence-source-1",
    sourceId: "source-1",
    claimText: "來源一支持的可引用主張。",
    supportSpan: "來源一提供可逐字追溯的支持文字。",
    sectionFit: ["findings"],
    extractionMethod: "llm_structured_extract",
  }] as any);

  assert.equal(blocked.canGenerate, false);
  assert.equal(blocked.buttonLabel, "缺少證據卡");
  assert.match(blocked.message ?? "", /至少需 1 張證據卡/);
  assert.equal(limited.canGenerate, true);
  assert.equal(limited.reportMode, "short");
  assert.equal(limited.canExport, false);
  assert.equal(limited.isLimitedDraft, true);
  assert.equal(limited.buttonLabel, "建立證據有限草稿");
});

test("supplemental coverage search yields to server-side reviewed evidence derivation", () => {
  assert.equal(
    shouldRunSupplementalCoverageSearch({
      acceptedSourceCount: 10,
      literatureReviewEvidenceCount: 1,
      peerReviewedAcceptedSourceCount: 0,
      canonicalEvidenceCardCount: 1,
      serverDerivableEvidenceAvailable: false,
    }),
    false,
  );

  assert.equal(
    shouldRunSupplementalCoverageSearch({
      acceptedSourceCount: 10,
      literatureReviewEvidenceCount: 0,
      peerReviewedAcceptedSourceCount: 0,
      canonicalEvidenceCardCount: 0,
      serverDerivableEvidenceAvailable: true,
    }),
    false,
  );

  assert.equal(
    shouldRunSupplementalCoverageSearch({
      acceptedSourceCount: 10,
      literatureReviewEvidenceCount: 0,
      peerReviewedAcceptedSourceCount: 0,
      canonicalEvidenceCardCount: 0,
      serverDerivableEvidenceAvailable: false,
    }),
    true,
  );
});

test("report generation blocks when workflow topic hash is missing", () => {
  const acceptedSources = [source(1), source(2), source(3)];

  assert.match(
    reportGenerationBlockingReason({
      topic: DEFAULT_TEST_TOPIC,
      acceptedSources,
      evidenceCardCount: 3,
      workflowId: DEFAULT_WORKFLOW_ID,
      topicHash: null,
    }) ?? "",
    /主題識別碼遺失/,
  );
  assert.throws(
    () =>
      createReportWorkspace(
        input(),
        acceptedSources.map((item) => ({ ...item, topicHash: undefined })),
        "initial_brief",
        "rf-missing-topic-hash",
      ),
    /主題識別碼遺失/,
  );
});

test("standard depth recommends ten sources while keeping evidence-first draft generation", () => {
  const blocked = generationReadiness(0, "standard");
  const quickDraft = generationReadiness(6, "standard");
  const full = generationReadiness(10, "standard");

  assert.equal(blocked.canGenerate, false);
  assert.equal(quickDraft.canGenerate, true);
  assert.equal(quickDraft.canGenerateFull, false);
  assert.equal(full.canGenerateFull, true);
  assert.equal(full.buttonLabel, "生成標準研究報告");
});

test("generation readiness infers coverage from accepted source summaries", () => {
  const inferredCoverageSources = [
    source(1, {
      abstract:
        "This study reviews soft drink intake and health outcomes in the literature with enough detail for synthesis.",
      usableSections: [],
    }),
    source(2, {
      abstract:
        "This report presents survey data and statistics about beverage consumption patterns and public health.",
      usableSections: [],
      sourceCategory: "government_or_institution",
    }),
    source(3, {
      abstract:
        "This research discusses findings and impact of sugar exposure among adolescents in enough detail.",
      usableSections: [],
    }),
    source(4),
    source(5),
  ];

  const readiness = generationReadiness(inferredCoverageSources);

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.mode, "short_research_report");
  assert.equal(readiness.coverageCount >= 1, true);
});

test("createReportWorkspace tolerates sparse report input and still emits a draft", () => {
  const topic = "過氯酸鈉在實驗操作與儲存上的安全風險";
  const workspace = createReportWorkspace(
    {
      topic,
      reportType: "研究報告",
      academicLevel: "高中",
      targetAudience: "",
      researchDepth: "quick",
      purpose: "",
      domainOverride: "",
      mode: "",
      sourceRequirement: "",
      citationFormat: "",
      chartRequirement: "",
      style: "",
      length: "",
      wordCount: "",
      formalTone: "",
      conversationalTone: "",
      specifiedStructure: "",
      rubric: "",
      personalStyle: "",
      supplementalMaterials: "",
      outputLanguage: "",
      rewriteSection: "",
      additionalInfo: "",
      acceptedSources: [],
    },
    [sourceForTopic(1, topic), sourceForTopic(2, topic), sourceForTopic(3, topic)],
    "initial_brief",
    "rf-sparse-input",
  );

  assert.equal(workspace.draft.sections.length > 0, true);
  assert.match(workspace.report.meta.title ?? "", /過氯酸鈉/);
});

test("report workspace storage omits heavy extracted chunks after LLM generation", () => {
  const hugeText = "massive chunk text ".repeat(1_000);
  const workspace = createReportWorkspace(
    input(),
    [
      source(1, {
        extractedText: hugeText,
        extractedChunks: [
          {
            chunkId: "chunk-1",
            text: hugeText,
            pageStart: 1,
            pageEnd: 3,
            charStart: 0,
            charEnd: hugeText.length,
          },
        ],
      } as Partial<SourceRecord>),
      source(2),
      source(3),
    ],
    "initial_brief",
    "rf-storage-compact",
  );

  const serialized = serializeReportWorkspaceForStorageForTests(workspace);
  const stored = JSON.parse(serialized) as {
    acceptedSources: Array<Record<string, unknown>>;
    generationPayload: { acceptedSources: Array<Record<string, unknown>> };
  };

  assert.equal(serialized.includes("massive chunk text"), false);
  assert.equal(stored.acceptedSources[0]?.extractedText, undefined);
  assert.equal(stored.acceptedSources[0]?.extractedChunks, undefined);
  assert.equal(stored.generationPayload.acceptedSources[0]?.extractedChunks, undefined);
  assert.match(String(stored.acceptedSources[0]?.abstract ?? ""), /Evidence abstract 1/);
});

test("workspace export replaces verifier-blocked sections with review prompts", () => {
  const workspace = createReportWorkspace(
    input(),
    [source(1), source(2), source(3)],
    "short_research_report",
    "rf-export-guard",
    {
      evidenceCards: [
        {
          id: "evidence-source-1",
          evidenceId: "evidence-source-1",
          workflowId: DEFAULT_WORKFLOW_ID,
          topicHash: DEFAULT_TOPIC_HASH,
          sourceId: "source-1",
          claimText: "可直接支撐的句子。",
          supportSpan: "可直接支撐的句子。",
          claim: "可直接支撐的句子。",
          claimTextZhTw: "可直接支撐的句子。",
          mainClaim: "可直接支撐的句子。",
          evidence: "可直接支撐的句子。",
          summary: "可直接支撐的句子。",
          sourceTitle: "Source 1",
          sourceProvider: "Crossref",
          relevance: "finding",
          citationMarker: "[S1]",
          citationText: "Source 1",
          limitations: [],
          limitationsZhTw: [],
          sectionTargets: ["findings"],
          sectionFit: ["findings"],
          usableSections: ["文獻探討"],
          sourceType: "Crossref",
          reliability: "高",
          sourceUrl: "https://doi.org/10.1000/source-1",
          sourceDomain: "doi.org",
          provider: "Crossref",
          doi: "10.1000/source-1",
          abstract: "可直接支撐的句子。",
          relevanceScore: 0.8,
          sourceQualityScore: 0.8,
          finalScore: 0.8,
          year: 2021,
          confidence: "高",
          confidenceScore: 0.8,
          derivation: "abstract-derived",
          abstractOnly: true,
          limitation: null,
          createdAt: "2026-07-06T00:00:00.000Z",
          notes: "",
          usableEvidence: "可直接支撐的句子。",
          quoteOrParaphrase: "可直接支撐的句子。",
          evidencePointZhTw: "可直接支撐的句子。",
          sourceExcerptOriginal: "可直接支撐的句子。",
          sourceSummaryZhTw: "可直接支撐的句子。",
        } as any,
      ],
    },
  );
  const blockedWorkspace = {
    ...workspace,
    draft: {
      ...workspace.draft,
      sections: workspace.draft.sections.map((section) =>
        section.sectionId === "findings"
          ? {
              ...section,
              body: "這是一句未支撐但看似正式的外推。",
              synthesizedProseZhTw: "這是一句未支撐但看似正式的外推。",
              groundingStatus: "unsupported" as const,
              generationMethod: "grounding_verifier_blocked",
              unsupportedSentences: ["這是一句未支撐但看似正式的外推。"],
            }
          : section,
      ),
    },
  };
  const exported = workspaceToGeneratedReport(blockedWorkspace, "其他" as any);
  const exportedText = exported.sections
    .flatMap((section) => section.blocks)
    .map((block) => ("text" in block ? block.text : ""))
    .join("\n");

  assert.match(exportedText, /不輸出正式段落|補查/);
  assert.doesNotMatch(exportedText, /這是一句未支撐但看似正式的外推。/);
});

test("canonical references include only sources actually cited by report prose", () => {
  const acceptedSources = [source(1), source(2), source(3)];
  const evidenceCards = [1, 2].map((index) => ({
    id: `evidence-source-${index}`,
    evidenceId: `evidence-source-${index}`,
    workflowId: DEFAULT_WORKFLOW_ID,
    topicHash: DEFAULT_TOPIC_HASH,
    sourceId: `source-${index}`,
    claimText: `來源 ${index} 支撐的研究主張。`,
    claimTextZhTw: `來源 ${index} 支撐的研究主張。`,
    mainClaim: `來源 ${index} 支撐的研究主張。`,
    supportSpan: `來源 ${index} 的原始可引用支持文字。`,
    evidence: `來源 ${index} 的原始可引用支持文字。`,
    evidencePointZhTw: `來源 ${index} 的原始可引用支持文字。`,
    summary: `來源 ${index} 摘要。`,
    sourceTitle: `Source ${index}`,
    sourceProvider: "Crossref",
    sourceType: "Crossref",
    sourceUrl: `https://doi.org/10.1000/source-${index}`,
    sourceDomain: "doi.org",
    provider: "Crossref",
    doi: `10.1000/source-${index}`,
    abstract: `來源 ${index} 的原始可引用支持文字。`,
    citationMarker: `[S${index}]`,
    citationText: `Source ${index}`,
    recommendationBucket: "scholarly_recommended",
    isPeerReviewed: true,
    reliability: "高",
    relevance: "finding",
    limitations: [],
    limitationsZhTw: [],
    sectionTargets: ["literature_review", "findings", "discussion"],
    sectionFit: ["literature_review", "findings", "discussion"],
    usableSections: ["文獻探討", "數據分析", "結論"],
    relevanceScore: 0.9,
    sourceQualityScore: 0.9,
    finalScore: 0.9,
    confidence: "高",
    confidenceScore: 0.9,
    derivation: "fulltext-derived",
    abstractOnly: false,
    year: 2020 + index,
    createdAt: "2026-08-03T00:00:00.000Z",
    notes: "",
  })) as any;
  const workspace = createReportWorkspace(
    input(),
    acceptedSources,
    "short_research_report",
    "rf-canonical-citations",
    { evidenceCards },
  );
  const references = workspace.draft.sections.find(
    (section) => section.sectionId === "references",
  );

  assert.deepEqual(
    references?.citationIds,
    ["source-1", "source-2"],
  );
  assert.match(references?.body ?? "", /\[S1\]/);
  assert.match(references?.body ?? "", /\[S2\]/);
  assert.doesNotMatch(references?.body ?? "", /source-3|10\.1000\/source-3/i);
});

test("generator hides evidence cards unless developer debug is open", () => {
  assert.equal(generatorWorkflowVisibility(false).showEvidenceCards, false);
  assert.equal(generatorWorkflowVisibility(false).showTechnicalLogs, false);
  assert.equal(generatorWorkflowVisibility(true).showEvidenceCards, true);
});

test("report workspace path supports the route transition target", () => {
  assert.equal(reportWorkspacePath("rf-test id"), "/reports/rf-test%20id");
});

test("workspace topic fingerprint isolates different topics", () => {
  const topicA = "可樂中的成分與攝取習慣對健康的影響";
  const topicB = "「氣候變遷」的成因與現況分析";

  assert.equal(reportTopicFingerprint(topicA), reportTopicFingerprint(topicA));
  assert.notEqual(
    reportTopicFingerprint(topicA),
    reportTopicFingerprint(topicB),
  );
  const workspace = {
    id: "rf-topic",
    workflowId: "wf-topic",
    reportId: "rf-topic",
    payloadVersion: 2 as const,
    topicFingerprint: reportTopicFingerprint(topicA),
    topicHash: reportTopicFingerprint(topicA),
    sourceIds: ["source-1"],
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    generationMode: "single_source_review" as const,
    input: input({ topic: topicA }),
    acceptedSources: [source(1)],
    acceptedSourceDigest: {
      version: 2,
      summary: "",
      coverage: [],
      gaps: [],
      recommendedNextStep: "",
    },
    report: { meta: { acceptedSources: [source(1)] }, sections: [] } as any,
    outline: { title: "", sections: [] } as any,
    draft: {
      title: "",
      sections: [],
      qualityReport: { readiness: "preliminary" },
    } as any,
    project: {
      id: "rf-topic",
      topic: topicA,
      reportType: "研究報告",
      depth: "standard",
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z",
      status: "draft",
    } as any,
    evidenceCards: [],
    qualityReport: {
      sourceCount: 1,
      acceptedSourceCount: 1,
      evidenceCardCount: 0,
      missingCitationWarnings: [],
      unsupportedClaimWarnings: [],
      overclaimWarnings: [],
      topicDriftWarnings: [],
      readiness: "preliminary",
    } as any,
  };

  assert.equal(workspaceMatchesTopic(workspace, topicA), true);
  assert.equal(workspaceMatchesTopic(workspace, topicB), false);
});

test("start report workspace navigation saves workspace and calls navigation with preview route", () => {
  const acceptedSources = Array.from({ length: 6 }, (_, index) =>
    source(index + 1),
  );
  const navigateCalls: string[] = [];
  const savedWorkspaceIds: string[] = [];

  const result = startReportWorkspaceNavigation({
    input: input(),
    acceptedSources,
    navigate: (path) => navigateCalls.push(path),
    saveWorkspace: (workspace) => savedWorkspaceIds.push(workspace.id),
  });

  assert.ok(result);
  assert.match(result.workspace.id, /^rf-/);
  assert.equal(result.workspace.generationMode, "short_research_report");
  assert.equal(result.workspace.payloadVersion, 3);
  assert.equal(result.workspace.reportId, result.workspace.id);
  assert.match(result.workspace.workflowId, /^([0-9a-f-]{36}|wf-)/i);
  assert.equal(result.workspace.topicHash, reportTopicFingerprint(result.workspace.input.topic));
  assert.deepEqual(result.workspace.sourceIds, acceptedSources.map((source) => source.id));
  assert.equal(workspaceSnapshotIsConsistent(result.workspace), true);
  assert.match(result.workspace.acceptedSourceDigest.summary, /目前已接受 6 筆來源/);
  assert.equal(result.workspace.project.depth, "standard");
  assert.equal(result.workspace.evidenceCards.length, 0);
  assert.equal(
    result.workspace.qualityReport.acceptedSourceCount,
    acceptedSources.length,
  );
  assert.deepEqual(savedWorkspaceIds, [result.workspace.id]);
  assert.deepEqual(
    navigateCalls,
    [
      reportWorkspacePath(result.workspace.id, {
        workflowId: result.workspace.workflowId,
        topicHash: result.workspace.topicHash,
      }),
    ],
  );
});

test("five accepted sources do not seed frontend evidence cards without canonical cards", () => {
  const acceptedSources = Array.from({ length: 5 }, (_, index) => source(index + 1));

  const result = startReportWorkspaceNavigation({
    input: input(),
    acceptedSources,
    navigate: () => {},
    saveWorkspace: () => {},
  });

  assert.ok(result);
  assert.equal(result.workspace.acceptedSources.length, 5);
  assert.equal(result.workspace.evidenceCards.length, 0);
  assert.equal(
    result.workspace.draft.sections.some((section) => section.evidenceCardIds.length > 0),
    false,
  );
  assert.equal(
    result.workspace.draft.sections
      .filter((section) => section.sectionId !== "references")
      .some((section) => section.citationIds.length > 0),
    false,
  );
});

test("start report workspace navigation does not navigate when accepted sources are below threshold", () => {
  const navigateCalls: string[] = [];
  const savedWorkspaceIds: string[] = [];

  const result = startReportWorkspaceNavigation({
    input: input(),
    acceptedSources: [],
    navigate: (path) => navigateCalls.push(path),
    saveWorkspace: (workspace) => savedWorkspaceIds.push(workspace.id),
  });

  assert.equal(result, null);
  assert.deepEqual(savedWorkspaceIds, []);
  assert.deepEqual(navigateCalls, []);
});

test("workspace snapshot consistency rejects topic or source contamination", () => {
  const topic = "可樂成分與青少年健康影響";
  const acceptedSources = Array.from({ length: 6 }, (_, index) =>
    sourceForTopic(index + 1, topic),
  );
  const workspace = startReportWorkspaceNavigation({
    input: input({ topic }),
    acceptedSources,
    navigate: () => {},
    saveWorkspace: () => {},
  })?.workspace;

  assert.ok(workspace);
  assert.equal(workspaceSnapshotIsConsistent(workspace), true);
  assert.equal(workspaceMatchesTopic(workspace, topic), true);
  assert.equal(workspaceMatchesTopic(workspace, "氣候變遷"), false);

  assert.equal(
    workspaceSnapshotIsConsistent({
      ...workspace,
      input: input({ topic: "氣候變遷" }),
    }),
    false,
  );
  assert.equal(
    workspaceSnapshotIsConsistent({
      ...workspace,
      sourceIds: ["old-climate-source"],
    }),
    false,
  );
});

test("report source guard blocks old-workflow climate sources for a dumpling topic", () => {
  const dumplingInput = input({ topic: "水餃" });
  const oldClimateSources = [
    source(1, {
      workflowId: "wf-climate",
      topic: "氣候變遷",
      topicHash: reportTopicFingerprint("氣候變遷"),
      queryPlanHash: "climate-plan",
      title: "AR6 Synthesis Report: Climate Change 2023",
      relevanceLevel: "off_topic",
      relevanceScore: 5,
      classification: "trusted_but_off_topic",
    }),
    source(2, {
      workflowId: "wf-climate",
      topic: "氣候變遷",
      topicHash: reportTopicFingerprint("氣候變遷"),
      queryPlanHash: "climate-plan",
      relevanceScore: 10,
      classification: "off_topic",
    }),
    source(3, {
      workflowId: "wf-climate",
      topic: "氣候變遷",
      topicHash: reportTopicFingerprint("氣候變遷"),
      queryPlanHash: "climate-plan",
      relevanceScore: 12,
      classification: "off_topic",
    }),
  ];
  const navigateCalls: string[] = [];

  assert.deepEqual(
    reportSourceGuardDiagnostics(dumplingInput, oldClimateSources).sort(),
    ["low_topic_relevance", "topic_mismatch"].sort(),
  );
  assert.equal(
    startReportWorkspaceNavigation({
      input: dumplingInput,
      acceptedSources: oldClimateSources,
      navigate: (path) => navigateCalls.push(path),
      saveWorkspace: () => {},
    }),
    null,
  );
  assert.deepEqual(navigateCalls, []);
});
