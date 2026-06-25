import assert from "node:assert/strict";
import test from "node:test";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  generationReadiness,
  generatorWorkflowVisibility,
  reportSourceGuardDiagnostics,
  reportWorkspacePath,
  reportTopicFingerprint,
  startReportWorkspaceNavigation,
  workspaceSnapshotIsConsistent,
  workspaceMatchesTopic,
} from "./reportWorkspace.ts";

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
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
    ...overrides,
  };
}

test("generation readiness allows evidence-first quick drafts from a single accepted source", () => {
  const blocked = generationReadiness(0);
  const quickDraft = generationReadiness(1);
  const fullReport = generationReadiness(10);

  assert.equal(blocked.canGenerate, false);
  assert.equal(blocked.buttonLabel, "來源品質不足");
  assert.equal(quickDraft.mode, "quick_draft");
  assert.equal(quickDraft.buttonLabel, "生成初步報告");
  assert.match(quickDraft.warning ?? "", /完整報告門檻/);
  assert.equal(generationReadiness(9).canGenerateFull, false);
  assert.equal(fullReport.mode, "full_report");
  assert.equal(fullReport.buttonLabel, "生成正式報告");
  assert.equal(fullReport.canGenerateFull, true);
});

test("generation readiness surfaces low-quality contamination while keeping evidence-first drafts available", () => {
  const lowQualityAccepted = [
    source(1),
    source(2),
    source(3, { relevanceLevel: "off_topic" } as Partial<SourceRecord>),
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
  assert.ok(
    (blocked.warning ?? "").includes("延伸或低相關來源"),
  );
  assert.equal(quickDraft.canGenerate, true);
  assert.equal(quickDraft.canGenerateFull, false);
  assert.equal(quickDraft.relevantSourceCount, 3);
  assert.equal(quickDraft.usableSummaryCount, 3);
  assert.equal(full.canGenerateFull, true);
  assert.equal(full.coverageCount >= 2, true);
});

test("generation readiness allows preliminary report from three secondary sources", () => {
  const secondarySources = [
    source(1, { relevanceLevel: "secondary", usableSections: ["研究背景"] }),
    source(2, { relevanceLevel: "secondary", usableSections: ["文獻探討"] }),
    source(3, { relevanceLevel: "clue", usableSections: ["結論"] }),
  ];

  const readiness = generationReadiness(secondarySources);

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.canGenerateFull, false);
  assert.equal(readiness.mode, "quick_draft");
  assert.equal(readiness.primarySourceCount, 0);
  assert.equal(readiness.secondarySourceCount, 3);
  assert.match(readiness.warning ?? "", /主要來源僅 0 筆/);
  assert.equal(readiness.buttonLabel, "生成初步報告");
});

test("standard depth recommends ten sources while keeping evidence-first draft generation", () => {
  const blocked = generationReadiness(0, "standard");
  const quickDraft = generationReadiness(1, "standard");
  const full = generationReadiness(10, "standard");

  assert.equal(blocked.canGenerate, false);
  assert.equal(quickDraft.canGenerate, true);
  assert.equal(quickDraft.canGenerateFull, false);
  assert.equal(full.canGenerateFull, true);
  assert.equal(full.buttonLabel, "生成正式報告");
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
  ];

  const readiness = generationReadiness(inferredCoverageSources);

  assert.equal(readiness.canGenerate, true);
  assert.equal(readiness.mode, "quick_draft");
  assert.equal(readiness.coverageCount >= 1, true);
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
    generationMode: "quick_draft" as const,
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
  const acceptedSources = Array.from({ length: 3 }, (_, index) =>
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
  assert.equal(result.workspace.generationMode, "quick_draft");
  assert.equal(result.workspace.payloadVersion, 2);
  assert.equal(result.workspace.reportId, result.workspace.id);
  assert.match(result.workspace.workflowId, /^([0-9a-f-]{36}|wf-)/i);
  assert.equal(result.workspace.topicHash, reportTopicFingerprint(result.workspace.input.topic));
  assert.deepEqual(result.workspace.sourceIds, acceptedSources.map((source) => source.id));
  assert.equal(workspaceSnapshotIsConsistent(result.workspace), true);
  assert.match(result.workspace.acceptedSourceDigest.summary, /目前已接受 3 筆來源/);
  assert.equal(result.workspace.project.depth, "standard");
  assert.equal(
    result.workspace.evidenceCards.length >= acceptedSources.length,
    true,
  );
  assert.equal(
    result.workspace.qualityReport.acceptedSourceCount,
    acceptedSources.length,
  );
  assert.deepEqual(savedWorkspaceIds, [result.workspace.id]);
  assert.deepEqual(navigateCalls, [reportWorkspacePath(result.workspace.id)]);
});

test("single accepted source still seeds evidence cards and citations in the report workspace", () => {
  const acceptedSources = [source(1)];

  const result = startReportWorkspaceNavigation({
    input: input(),
    acceptedSources,
    navigate: () => {},
    saveWorkspace: () => {},
  });

  assert.ok(result);
  assert.equal(result.workspace.acceptedSources.length, 1);
  assert.equal(result.workspace.evidenceCards.length >= 1, true);
  assert.equal(
    result.workspace.draft.sections.some((section) => section.evidenceCardIds.length > 0),
    true,
  );
  assert.equal(
    result.workspace.draft.sections.some((section) => section.citationIds.length > 0),
    true,
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
  const acceptedSources = Array.from({ length: 3 }, (_, index) =>
    source(index + 1),
  );
  const workspace = startReportWorkspaceNavigation({
    input: input({ topic: "可樂成分與青少年健康影響" }),
    acceptedSources,
    navigate: () => {},
    saveWorkspace: () => {},
  })?.workspace;

  assert.ok(workspace);
  assert.equal(workspaceSnapshotIsConsistent(workspace), true);
  assert.equal(workspaceMatchesTopic(workspace, "可樂成分與青少年健康影響"), true);
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
