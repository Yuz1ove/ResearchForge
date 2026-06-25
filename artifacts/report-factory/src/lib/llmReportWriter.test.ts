import assert from "node:assert/strict";
import test from "node:test";
import type { ReportInput } from "./generateReport.ts";
import {
  createReportWorkspace,
  type ReportWorkspace,
} from "./reportWorkspace.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  mergeLlmReportDraft,
  requestLlmReportDraft,
} from "./llmReportWriter.ts";

function reportInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    topic: "水餃",
    reportType: "研究報告",
    academicLevel: "高中",
    targetAudience: "高中",
    researchDepth: "standard",
    purpose: "學校作業",
    domainOverride: "",
    mode: "先建立報告架構",
    sourceRequirement: "需要，並生成參考文獻格式",
    citationFormat: "APA",
    chartRequirement: "不需要",
    style: "正式報告",
    length: "一般報告",
    wordCount: "",
    formalTone: "需要",
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

function source(index: number, overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: `source-${index}`,
    title: `水餃營養與飲食文化研究 ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "此來源討論水餃的營養標示、鈉含量與家庭飲食文化，摘要足以支撐正式中文報告。",
    doi: `10.1000/dumpling-${index}`,
    url: `https://doi.org/10.1000/dumpling-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    relevanceLevel: index === 1 ? "primary" : "secondary",
    evidenceGrounding: "abstract_grounded",
    usableSections: ["研究背景", "文獻探討"],
    ...overrides,
  };
}

test("requestLlmReportDraft posts accepted sources and maps quick draft to preliminary mode", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        ok: true,
        status: "success",
        llm_status: "success",
        fallback_used: false,
        message: null,
        warning: null,
        sections: [
          {
            sectionId: "abstract",
            title: "摘要",
            prose: "這是根據已接受來源生成的水餃初步報告摘要。",
            citationIds: ["source-1"],
          },
        ],
      }),
    );
  }) as typeof fetch;

  try {
    const workspace = createReportWorkspace(
      reportInput(),
      [source(1), source(2), source(3)],
      "quick_draft",
      "rf-request-evidence",
    );
    const result = await requestLlmReportDraft({
      reportInput: reportInput(),
      acceptedSources: [source(1), source(2), source(3)],
      evidenceCards: workspace.evidenceCards,
      generationMode: "quick_draft",
    });

    assert.equal(capturedBody?.topic, "水餃");
    assert.equal(capturedBody?.generationMode, "preliminary");
    assert.equal((capturedBody?.acceptedSources as SourceRecord[]).length, 3);
    assert.equal((capturedBody?.evidenceCards as unknown[]).length > 0, true);
    assert.equal(result.ok, true);
    assert.equal(result.sections[0]?.sectionId, "abstract");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mergeLlmReportDraft replaces matching draft section prose for preview", () => {
  const workspace: ReportWorkspace = createReportWorkspace(
    reportInput(),
    [source(1), source(2), source(3), source(4), source(5)],
    "quick_draft",
    "rf-llm-merge",
  );
  const targetSection = workspace.draft.sections[0];
  assert.ok(targetSection);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: "摘要",
        prose:
          "這是一段由 LLM 根據已接受來源重新撰寫的正式中文報告段落，會顯示在 report preview。",
        evidenceCardIds: workspace.evidenceCards.slice(0, 2).map((card) => card.id),
        citationIds: ["source-1", "source-2", "not-accepted"],
      },
    ],
  });

  assert.match(merged.draft.sections[0]?.body ?? "", /正式中文報告段落/);
  assert.deepEqual(
    merged.draft.sections[0]?.evidenceCardIds,
    workspace.evidenceCards.slice(0, 2).map((card) => card.id),
  );
  assert.equal(merged.draft.sections[0]?.citationIds.includes("not-accepted"), false);
  assert.match(merged.draft.text, /正式中文報告段落/);
  assert.equal(
    merged.report.meta.researchDraft.sections[0]?.body,
    merged.draft.sections[0]?.body,
  );
});

test("mergeLlmReportDraft keeps references limited to accepted evidence cards", () => {
  const workspace: ReportWorkspace = createReportWorkspace(
    reportInput(),
    [source(1), source(2), source(3)],
    "full_report",
    "rf-accepted-only",
  );
  const targetSection = workspace.draft.sections[0];
  const acceptedEvidenceId = workspace.evidenceCards[0]?.id;
  assert.ok(targetSection);
  assert.ok(acceptedEvidenceId);

  const merged = mergeLlmReportDraft(workspace, {
    ok: true,
    status: "success",
    llm_status: "success",
    fallback_used: false,
    message: null,
    warning: null,
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "success",
    fallbackUsed: false,
    fallbackReason: null,
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: "摘要",
        prose:
          "這段正式報告正文只使用已接受證據卡，並保留可追溯的 citation marker。（來源 1）",
        evidenceCardIds: [acceptedEvidenceId, "evidence:unaccepted-source:0"],
        citationIds: ["source-1", "unaccepted-source"],
      },
    ],
  });

  const mergedSection = merged.draft.sections[0];
  assert.deepEqual(mergedSection?.evidenceCardIds, [acceptedEvidenceId]);
  assert.deepEqual(mergedSection?.citationIds, ["source-1"]);
  assert.deepEqual(mergedSection?.citationMarkers, ["（來源 1）"]);
  assert.equal(
    merged.report.meta.researchDraft.sections[0]?.citationIds.includes("unaccepted-source"),
    false,
  );
});

test("mergeLlmReportDraft keeps the existing draft when the LLM call fails", () => {
  const workspace: ReportWorkspace = createReportWorkspace(
    reportInput(),
    [source(1), source(2), source(3)],
    "full_report",
    "rf-keep-draft",
  );

  const merged = mergeLlmReportDraft(workspace, {
    ok: false,
    status: "unavailable",
    llm_status: "failed",
    fallback_used: true,
    message: "LLM report service unavailable.",
    warning: "provider timeout",
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "provider timeout",
    sections: [],
  });

  assert.equal(merged.draft.text, workspace.draft.text);
  assert.equal(merged.draft.sections[0]?.body, workspace.draft.sections[0]?.body);
  assert.equal(merged.llmDiagnostics?.reportGenerationStatus, "failed");
  assert.equal(
    merged.report.meta.researchDraft.sections[0]?.body,
    workspace.draft.sections[0]?.body,
  );
});

test("mergeLlmReportDraft still applies constrained fallback sections when sections are returned", () => {
  const workspace: ReportWorkspace = createReportWorkspace(
    reportInput(),
    [source(1), source(2), source(3)],
    "full_report",
    "rf-constrained-fallback",
  );
  const targetSection = workspace.draft.sections[0];
  assert.ok(targetSection);

  const merged = mergeLlmReportDraft(workspace, {
    ok: false,
    status: "error",
    llm_status: "failed",
    fallback_used: true,
    message: "LLM report service unavailable.",
    warning: "provider timeout",
    reportGenerationProvider: "ollama",
    reportGenerationModel: "test-model",
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "provider timeout",
    sections: [
      {
        sectionId: targetSection.sectionId,
        title: "摘要",
        prose:
          "本稿僅依已接受來源形成受限草稿，正文集中整理水餃的營養與飲食文化證據，並保留未補證部分。（來源 1）（來源 2）",
        evidenceCardIds: workspace.evidenceCards.slice(0, 2).map((card) => card.id),
        citationIds: ["source-1", "source-2"],
        warnings: ["段落受限於摘要證據，尚未讀取全文。"],
      },
    ],
  });

  assert.match(merged.draft.sections[0]?.body ?? "", /受限草稿/);
  assert.deepEqual(
    merged.draft.sections[0]?.evidenceCardIds,
    workspace.evidenceCards.slice(0, 2).map((card) => card.id),
  );
  assert.deepEqual(merged.draft.sections[0]?.citationIds, ["source-1", "source-2"]);
  assert.deepEqual(
    merged.draft.sections[0]?.warnings,
    ["段落受限於摘要證據，尚未讀取全文。"],
  );
  assert.equal(merged.llmDiagnostics?.reportGenerationStatus, "failed");
});
