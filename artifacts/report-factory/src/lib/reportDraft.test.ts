import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCards } from "./evidenceCards.ts";
import type { ResearchProject } from "./qualityJudge.ts";
import { buildReportDraft } from "./reportDraft.ts";
import { buildReportOutline } from "./reportOutline.ts";
import type { SourceRecord } from "./sourceRecords.ts";

const INSTRUCTION_LEAK_PATTERNS = [
  /應討論/,
  /應比較/,
  /可討論/,
  /可再補充/,
  /後續正式文/,
  /本段可/,
  /方法段可/,
  /文獻探討應/,
  /研究動機應/,
  /資料與證據整理應/,
  /不是逐篇摘要/,
  /可引用的佐證包括/,
  /後續正文/,
  /寫作提示/,
  /writer note/i,
  /section goal/i,
  /scaffold/i,
];

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
  assert.match(draft.text, /\[S1\]/);
  assert.match(draft.text, /資料缺口|來源尚不足|補充來源/u);
  assert.equal(draft.sectionEvidenceMap.length > 0, true);
  assert.equal(draft.paragraphPlans.length > 0, true);
  assert.equal(draft.debug.reportDraftGeneratedFromPlans, true);
  assert.doesNotMatch(draft.sections.find((section) => section.sectionId === "abstract")?.body ?? "", /來源 1 可支持/);
  assert.doesNotMatch(draft.sections.find((section) => section.sectionId === "abstract")?.body ?? "", /來源 1[：:]/);
  assert.match(draft.text, /參考資料/);
  assert.equal(draft.referenceList.length, 1);
  assert.equal(draft.references.length, 1);
  assert.match(draft.referenceList[0]!, /Screen time and sleep/);
  assert.equal(draft.qualityReport.acceptedSourceCount, 1);
  assert.ok(
    draft.sections.every((section) => typeof section.synthesizedProseZhTw === "string"),
  );
  assert.ok(
    draft.sections.some((section) =>
      section.sectionId === "abstract"
        ? section.synthesizedProseZhTw.length > 0
        : true,
    ),
  );
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

  assert.match(draft.text, /書目資訊|來源尚不足|不能宣稱已完成全文分析/u);
  assert.doesNotMatch(draft.text, /建議開啟原文|請開啟原文|回查原文/);
});

test("draft generator still creates an abstract from accepted reader summaries", () => {
  const acceptedSources = [
    source({
      abstract: null,
      originalAbstract: null,
      title: "Student sleep and attention review",
      readableSummaryZhTW: "這篇研究整理學生睡眠時間與注意力表現之間的關聯。",
      llmSummaryZhTw: "這篇研究整理學生睡眠時間與注意力表現之間的關聯。",
      summarySourceType: "metadataFallback",
      evidenceGrounding: "metadata_only",
    }),
  ];
  const outline = buildReportOutline({
    topic: "睡眠與注意力",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards: [],
  });
  const draft = buildReportDraft({
    project: project(),
    topic: "睡眠與注意力",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards: [],
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  const abstract = draft.sections.find((section) => section.sectionId === "abstract")?.body ?? "";
  assert.match(abstract, /學生睡眠時間與注意力表現之間的關聯/u);
  assert.match(abstract, /不延伸為正式研究結論/u);
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

  assert.match(literature, /文獻|整合來源/u);
  assert.doesNotMatch(literature, /來源 1 可支持|來源 2 可支持/);
  assert.match(evidence, /來源尚不足|初步方向|較可成立/u);
  assert.doesNotMatch(evidence, /來源 1[：:].*來源 2[：:]/s);
  assert.match(discussion, /限制|可追溯的解讀/u);
});

test("draft writer never leaks instruction or scaffold text into report body", () => {
  const acceptedSources = [
    source({
      id: "cola-health",
      title: "Soft drink intake and adolescent health",
      abstract:
        "Soft drink intake is associated with sugar exposure, caffeine intake, and adolescent health outcomes in nutrition research.",
      usableSections: ["研究背景", "文獻探討", "數據分析", "結論"],
      evidenceSnippets: [
        {
          originalSnippet:
            "Soft drink intake is associated with sugar exposure and adolescent health outcomes.",
          snippetZhTw: "此片段指出含糖飲料攝取與糖分暴露及青少年健康結果有關。",
          matchedFacet: "健康影響",
          matchedTerms: ["soft drink", "sugar", "adolescent health"],
          supportLevel: "direct",
          reasoningZhTw: "此片段直接命中健康影響，可作為主要證據。",
          score: 42,
        },
      ],
      evidenceChain: [
        {
          facetLabelZhTw: "健康影響",
          matchedTerms: ["soft drink", "sugar", "health"],
          supportLevel: "direct",
          reasoningZhTw: "可支撐可樂成分與健康影響的討論。",
        },
      ],
    }),
    source({
      id: "cola-packaging",
      title: "Soft drink packaging waste",
      abstract:
        "Beverage packaging research compares plastic bottles, aluminum cans, recycling rates, and waste management.",
      doi: "10.1000/packaging",
      usableSections: ["文獻探討", "數據分析", "結論"],
      evidenceSnippets: [
        {
          originalSnippet:
            "Beverage packaging research compares plastic bottles, aluminum cans, recycling rates, and waste management.",
          snippetZhTw: "此片段指出飲料包裝研究比較塑膠瓶、鋁罐、回收率與廢棄物管理。",
          matchedFacet: "環境影響",
          matchedTerms: ["packaging", "plastic bottles", "recycling"],
          supportLevel: "direct",
          reasoningZhTw: "此片段可支撐包裝與環境廢棄物面向。",
          score: 38,
        },
      ],
    }),
    source({
      id: "cola-advertising",
      title: "Cola advertising and consumer preference",
      abstract:
        "Advertising and brand image influence consumer preference in soft drink markets.",
      doi: "10.1000/advertising",
      usableSections: ["研究背景", "文獻探討", "結論"],
      evidenceSnippets: [
        {
          originalSnippet:
            "Advertising and brand image influence consumer preference in soft drink markets.",
          snippetZhTw: "此片段指出廣告與品牌形象會影響軟性飲料市場的消費偏好。",
          matchedFacet: "行銷與消費",
          matchedTerms: ["advertising", "brand image", "consumer preference"],
          supportLevel: "direct",
          reasoningZhTw: "此片段可支撐廣告與消費偏好面向。",
          score: 35,
        },
      ],
    }),
  ];
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "可樂成分與青少年健康影響",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    project: project(),
    topic: "可樂成分與青少年健康影響",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  for (const pattern of INSTRUCTION_LEAK_PATTERNS) {
    assert.doesNotMatch(draft.text, pattern);
  }
  assert.match(draft.text, /可樂成分與青少年健康影響/);
  assert.match(draft.text, /\[S1\]|\[S2\]|\[S3\]/);
  assert.match(draft.text, /資料檢索|來源篩選|可核對片段/u);
  assert.doesNotMatch(draft.text, /evidence card|supportSpan|metadata|peer-reviewed evidence/iu);
});

test("bibliography contains only accepted sources that are cited by report evidence", () => {
  const cited = source({ id: "cited", title: "Cited study", doi: "10.1000/cited" });
  const acceptedButUnused = source({
    id: "unused",
    title: "Unused accepted study",
    doi: "10.1000/unused",
  });
  const evidenceCards = buildEvidenceCards([cited]);
  const acceptedSources = [acceptedButUnused, cited];
  const outline = buildReportOutline({
    topic: "青少年睡眠品質",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });

  const draft = buildReportDraft({
    project: project(),
    topic: "青少年睡眠品質",
    reportType: "研究報告",
    audience: "高中",
    evidenceCards,
    outline,
    acceptedSources,
    citationFormat: "APA",
  });

  assert.equal(draft.referenceList.length, 1);
  assert.match(draft.referenceList[0] ?? "", /^\[S1\].*Cited study/u);
  assert.doesNotMatch(draft.text, /Unused accepted study/u);
});
