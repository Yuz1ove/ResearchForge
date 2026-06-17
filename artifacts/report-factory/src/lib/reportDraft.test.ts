import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCards } from "./evidenceCards.ts";
import type { ResearchProject } from "./qualityJudge.ts";
import { buildReportDraft } from "./reportDraft.ts";
import { buildReportOutline } from "./reportOutline.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "Screen time and sleep",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "Screen time can be associated with lower sleep quality.",
    doi: "10.1000/draft",
    url: "https://example.edu/draft",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    usableSections: ["研究背景", "文獻探討", "結論"],
    ...overrides,
  };
}

function project(depth: ResearchProject["depth"] = "standard"): ResearchProject {
  const now = "2026-06-18T00:00:00.000Z";
  return {
    id: "project-1",
    topic: "短影音使用對高中生睡眠品質之影響",
    reportType: "研究報告",
    depth,
    createdAt: now,
    updatedAt: now,
    status: "draft",
  };
}

test("draft generator includes section headings, source markers, and reference list", () => {
  const acceptedSources = [source()];
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "短影音使用對高中生睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    project: project(),
    topic: "短影音使用對高中生睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  assert.match(draft.text, /研究背景與動機/);
  assert.match(draft.text, /（證據 1）/);
  assert.match(draft.text, /資料缺口/);
  assert.doesNotMatch(draft.sections.find((section) => section.sectionId === "abstract")?.body ?? "", /來源 1 可支持/);
  assert.doesNotMatch(draft.sections.find((section) => section.sectionId === "abstract")?.body ?? "", /來源 1[：:]/);
  assert.match(draft.text, /參考資料/);
  assert.equal(draft.referenceList.length, 1);
  assert.match(draft.referenceList[0]!, /Screen time and sleep/);
  assert.equal(draft.qualityReport.acceptedSourceCount, 1);
});

test("draft generator flags accepted sources with insufficient abstracts", () => {
  const acceptedSources = [
    source({
      abstract: null,
      title: "Metadata-only source",
      usableSections: ["研究背景"],
    }),
  ];
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "可樂與健康",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    project: project(),
    topic: "可樂與健康",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  assert.match(draft.text, /此段仍需補充原文細節/);
});

test("draft synthesis organizes evidence by section intent instead of source-card order", () => {
  const acceptedSources = [
    source({
      id: "background",
      title: "Short video use and adolescent sleep background",
      doi: "10.1000/background",
      usableSections: ["研究背景", "文獻探討"],
    }),
    source({
      id: "data",
      title: "TikTok screen time and attention data",
      doi: "10.1000/data",
      usableSections: ["數據分析", "結論"],
    }),
  ];
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    project: project("deep"),
    topic: "短影音使用對高中生注意力與睡眠品質之影響",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  const literature = draft.sections.find((section) => section.sectionId === "literature_review")?.body ?? "";
  const evidence = draft.sections.find((section) => section.sectionId === "findings")?.body ?? "";
  const discussion = draft.sections.find((section) => section.sectionId === "discussion")?.body ?? "";

  assert.match(literature, /比較既有資料/);
  assert.doesNotMatch(literature, /來源 1 可支持|來源 2 可支持/);
  assert.match(evidence, /背景與概念脈絡/);
  assert.match(evidence, /資料與證據面向/);
  assert.doesNotMatch(evidence, /來源 1[：:].*來源 2[：:]/s);
  assert.match(discussion, /資料缺口/);
});
