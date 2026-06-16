import assert from "node:assert/strict";
import test from "node:test";
import type { ReportInput } from "./generateReport.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  generationReadiness,
  generatorWorkflowVisibility,
  reportWorkspacePath,
  startReportWorkspaceNavigation,
} from "./reportWorkspace.ts";

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
    reportType: "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
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

function source(index: number): SourceRecord {
  return {
    id: `source-${index}`,
    title: `Source ${index}`,
    authors: ["Ada Lovelace"],
    year: 2020 + index,
    abstract: `Evidence abstract ${index}.`,
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
  };
}

test("generation readiness gates blocked, quick draft, and full report states", () => {
  const blocked = generationReadiness(4);
  const quickDraft = generationReadiness(5);
  const fullReport = generationReadiness(10);

  assert.equal(blocked.canGenerate, false);
  assert.equal(blocked.buttonLabel, "來源不足，至少接受 5 筆");
  assert.equal(quickDraft.mode, "quick_draft");
  assert.equal(quickDraft.buttonLabel, "生成簡版草稿");
  assert.equal(quickDraft.warning, "來源少於 10 筆，報告證據鏈可能不完整。");
  assert.equal(generationReadiness(9).canGenerateFull, false);
  assert.equal(fullReport.mode, "full_report");
  assert.equal(fullReport.buttonLabel, "生成完整報告");
  assert.equal(fullReport.canGenerateFull, true);
});

test("generator hides evidence cards unless developer debug is open", () => {
  assert.equal(generatorWorkflowVisibility(false).showEvidenceCards, false);
  assert.equal(generatorWorkflowVisibility(false).showTechnicalLogs, false);
  assert.equal(generatorWorkflowVisibility(true).showEvidenceCards, true);
});

test("report workspace path supports the route transition target", () => {
  assert.equal(reportWorkspacePath("rf-test id"), "/reports/rf-test%20id");
});

test("start report workspace navigation saves workspace and calls navigation with preview route", () => {
  const acceptedSources = Array.from({ length: 5 }, (_, index) => source(index + 1));
  const navigateCalls: string[] = [];
  const savedWorkspaceIds: string[] = [];

  const result = startReportWorkspaceNavigation({
    input: input(),
    acceptedSources,
    existingReportId: "rf-existing",
    navigate: (path) => navigateCalls.push(path),
    saveWorkspace: (workspace) => savedWorkspaceIds.push(workspace.id),
  });

  assert.ok(result);
  assert.equal(result.workspace.id, "rf-existing");
  assert.equal(result.workspace.generationMode, "quick_draft");
  assert.match(result.workspace.acceptedSourceDigest.summary, /目前已接受/);
  assert.deepEqual(savedWorkspaceIds, ["rf-existing"]);
  assert.deepEqual(navigateCalls, ["/reports/rf-existing"]);
});

test("start report workspace navigation does not navigate when accepted sources are below threshold", () => {
  const navigateCalls: string[] = [];
  const savedWorkspaceIds: string[] = [];

  const result = startReportWorkspaceNavigation({
    input: input(),
    acceptedSources: Array.from({ length: 4 }, (_, index) => source(index + 1)),
    navigate: (path) => navigateCalls.push(path),
    saveWorkspace: (workspace) => savedWorkspaceIds.push(workspace.id),
  });

  assert.equal(result, null);
  assert.deepEqual(savedWorkspaceIds, []);
  assert.deepEqual(navigateCalls, []);
});
