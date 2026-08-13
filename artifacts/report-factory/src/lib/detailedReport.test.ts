import assert from "node:assert/strict";
import test from "node:test";
import {
  applyDetailedReportSummary,
  buildCanonicalDetailedReportModel,
  buildDetailedReportParagraphs,
  buildDetailedReportSummary,
} from "./detailedReport.ts";
import type { ReportWorkspace } from "./reportWorkspace.ts";
import { UNTRANSLATED_EVIDENCE_NOTICE } from "./zhTwReportText.ts";

function section(
  sectionId: string,
  body: string,
  citationIds: string[],
  citationMarkers: string[],
) {
  return {
    sectionId,
    title: sectionId,
    body,
    prose: body,
    synthesizedProseZhTw: body,
    citationIds,
    citationMarkers,
    supportingSourceIds: citationIds,
    evidenceCardIds: [],
  };
}

test("detailed report preserves all eight reader chapters with precise sources", () => {
  const workspace = {
    acceptedSources: [
      { id: "source-1", title: "A. Sleep and attention", authors: ["A. Author"], year: 2024 },
      { id: "source-2", title: "B. Classroom focus", authors: ["B. Author"], year: 2023 },
    ],
    evidenceCards: [],
    draft: {
      sections: [
        section("introduction", "研究背景說明睡眠與注意力的關聯[S1]。", ["source-1"], ["[S1]"]),
        section("research_question", "研究問題聚焦學生的課堂專注表現[S2]。", ["source-2"], ["[S2]"]),
        section("literature_review", "文獻整理兩項研究的共同脈絡[S1][S2]。", ["source-1", "source-2"], ["[S1]", "[S2]"]),
        section("methodology", "方法段說明資料整理方式[S1]。", ["source-1"], ["[S1]"]),
        section("findings", "主要發現整理可被來源支持的結果[S2]。", ["source-2"], ["[S2]"]),
        section("discussion", "討論段比較來源之間的異同[S1][S2]。", ["source-1", "source-2"], ["[S1]", "[S2]"]),
        section("limitations", "限制段保留研究邊界[S1]。", ["source-1"], ["[S1]"]),
        section("conclusion", "結論只總結已引用內容[S2]。", ["source-2"], ["[S2]"]),
        section("references", "參考資料不應成為第四個段落。", [], []),
      ],
    },
  } as unknown as ReportWorkspace;

  const paragraphs = buildDetailedReportParagraphs(workspace);

  assert.equal(paragraphs.length, 8);
  assert.deepEqual(
    paragraphs.map((paragraph) => paragraph.id),
    [
      "introduction",
      "research_question",
      "literature_review",
      "methodology",
      "findings",
      "discussion",
      "limitations",
      "conclusion",
    ],
  );
  assert.deepEqual(
    paragraphs.map((paragraph) => paragraph.title),
    ["研究背景", "研究問題", "文獻探討", "研究方法", "主要發現", "綜合討論", "研究限制", "結論與建議"],
  );
  assert.match(paragraphs.find((paragraph) => paragraph.id === "introduction")?.body ?? "", /研究背景/u);
  assert.match(paragraphs.find((paragraph) => paragraph.id === "research_question")?.body ?? "", /研究問題/u);
  assert.match(paragraphs.find((paragraph) => paragraph.id === "literature_review")?.body ?? "", /文獻整理/u);
  assert.deepEqual(
    paragraphs.find((paragraph) => paragraph.id === "literature_review")?.citations
      .map((citation) => [citation.marker, citation.source.id]),
    [["[S1]", "source-1"], ["[S2]", "source-2"]],
  );
  assert.doesNotMatch(paragraphs.map((paragraph) => paragraph.body).join(" "), /第四個段落/u);
});

test("summary is created only after the detailed report and keeps its precise citations", () => {
  const workspace = {
    acceptedSources: [
      { id: "source-1", title: "A. Sleep and attention" },
      { id: "source-2", title: "B. Classroom focus" },
    ],
    evidenceCards: [
      { id: "evidence-1", sourceId: "source-1" },
      { id: "evidence-2", sourceId: "source-2" },
    ],
    draft: {
      sections: [
        section("abstract", "這是先前直接由來源生成、應被取代的摘要。", [], []),
        section("introduction", "完整報告先界定睡眠與注意力的研究背景[S1]。", ["source-1"], ["[S1]"]),
        section("research_question", "研究問題關注課堂專注。", [], []),
        section("literature_review", "另一句詳細文獻內容[S2]。", ["source-2"], ["[S2]"]),
        section("methodology", "報告採用可追溯的來源整理方法[S1]。", ["source-1"], ["[S1]"]),
        section("findings", "來源支持課堂專注的主要發現[S2]。", ["source-2"], ["[S2]"]),
        section("discussion", "討論保留證據邊界[S1]。", ["source-1"], ["[S1]"]),
        section("limitations", "現有資料仍有限。", [], []),
        section("conclusion", "因此結論只整理已獲支持的內容[S2]。", ["source-2"], ["[S2]"]),
      ],
    },
    report: { meta: {} },
  } as unknown as ReportWorkspace;

  const paragraphs = buildDetailedReportParagraphs(workspace);
  const summary = buildDetailedReportSummary(paragraphs);
  const nextWorkspace = applyDetailedReportSummary(workspace);
  const abstract = nextWorkspace.draft.sections.find(
    (item) => item.sectionId === "abstract",
  );

  assert.match(summary, /完整報告先界定.*整理方法.*結論只整理/u);
  assert.doesNotMatch(summary, /先前直接由來源生成/u);
  assert.equal(abstract?.body, summary);
  assert.equal(abstract?.generationMethod, "detailed_report_summary");
  assert.deepEqual(abstract?.citationIds, ["source-1", "source-2"]);
  assert.deepEqual(abstract?.evidenceCardIds, ["evidence-1", "evidence-2"]);
});

test("legacy detailed report and derived summary never expose raw Abstract or long English review text", () => {
  const leaked =
    "目前文獻與背景資料共同指向需要先釐清目前證據仍受限於Abstract The aim is to evaluate the mutual influences between sleep duration and adolescent risk behaviours、`This review explores the issue of sleep deprivation among children and adolescents in Japan, examining its cultural background and current interventions`。[S1][S2]";
  const workspace = {
    acceptedSources: [
      { id: "source-1", title: "Sleep duration" },
      { id: "source-2", title: "Adolescent attention" },
    ],
    evidenceCards: [
      { id: "evidence-1", sourceId: "source-1" },
      { id: "evidence-2", sourceId: "source-2" },
    ],
    draft: {
      sections: [
        section("abstract", leaked, ["source-1", "source-2"], ["[S1]", "[S2]"]),
        section("introduction", leaked, ["source-1"], ["[S1]"]),
        section("research_question", "研究問題聚焦睡眠與注意力。", [], []),
        section("literature_review", leaked, ["source-2"], ["[S2]"]),
        section("methodology", leaked, ["source-1"], ["[S1]"]),
        section("findings", leaked, ["source-2"], ["[S2]"]),
        section("discussion", leaked, ["source-1"], ["[S1]"]),
        section("limitations", "現有來源仍以摘要為主。", [], []),
        section("conclusion", leaked, ["source-2"], ["[S2]"]),
      ],
    },
    report: { meta: {} },
  } as unknown as ReportWorkspace;

  const paragraphs = buildDetailedReportParagraphs(workspace);
  const summary = buildDetailedReportSummary(paragraphs);
  const applied = applyDetailedReportSummary(workspace, { force: true });
  const allReaderText = [
    ...paragraphs.map((paragraph) => paragraph.body),
    summary,
    applied.draft.sections.find((item) => item.sectionId === "abstract")?.body ?? "",
  ].join(" ");

  assert.equal(paragraphs.length, 8);
  assert.doesNotMatch(allReaderText, /Abstract\s+The aim/iu);
  assert.doesNotMatch(allReaderText, /This review explores the issue/iu);
  assert.doesNotMatch(allReaderText, /`/u);
  assert.match(allReaderText, /尚未完成可驗證的繁中重點整理/u);
});

test("dedupes repeated evidence gaps within each paragraph group", () => {
  const leaked =
    "Abstract The aim is to evaluate sleep duration and adolescent attention across several observational study designs.[S1]";
  const workspace = {
    acceptedSources: [{ id: "source-1", title: "Sleep duration" }],
    evidenceCards: [],
    draft: {
      sections: [
        section("introduction", leaked, ["source-1"], ["[S1]"]),
        section("research_question", leaked, ["source-1"], ["[S1]"]),
        section("literature_review", leaked, ["source-1"], ["[S1]"]),
        section("methodology", leaked, ["source-1"], ["[S1]"]),
        section("findings", leaked, ["source-1"], ["[S1]"]),
        section("discussion", leaked, ["source-1"], ["[S1]"]),
        section("limitations", leaked, ["source-1"], ["[S1]"]),
        section("conclusion", leaked, ["source-1"], ["[S1]"]),
      ],
    },
  } as unknown as ReportWorkspace;

  const paragraphs = buildDetailedReportParagraphs(workspace);
  const summary = buildDetailedReportSummary(paragraphs);

  for (const paragraph of paragraphs) {
    assert.equal(paragraph.body.split(UNTRANSLATED_EVIDENCE_NOTICE).length - 1, 1);
  }
  assert.equal(summary.split(UNTRANSLATED_EVIDENCE_NOTICE).length - 1, 1);
  assert.equal(summary, `${UNTRANSLATED_EVIDENCE_NOTICE}[S1]。`);
});

test("summary selects substantive Chinese sentences instead of repeated gap notices", () => {
  const leaked =
    "Abstract The aim is to evaluate sleep duration and adolescent attention across several observational study designs.[S1]";
  const workspace = {
    acceptedSources: [{ id: "source-1", title: "Sleep duration" }],
    evidenceCards: [],
    draft: {
      sections: [
        section("introduction", leaked, ["source-1"], ["[S1]"]),
        section("research_question", "研究問題聚焦睡眠與注意力之間的關係。", [], []),
        section("literature_review", leaked, ["source-1"], ["[S1]"]),
        section("methodology", "本報告採用可追溯來源進行保守整理。", [], []),
        section("findings", leaked, ["source-1"], ["[S1]"]),
        section("discussion", leaked, ["source-1"], ["[S1]"]),
        section("limitations", "現有來源仍以摘要層級資料為主。", [], []),
        section("conclusion", leaked, ["source-1"], ["[S1]"]),
      ],
    },
  } as unknown as ReportWorkspace;

  const summary = buildDetailedReportSummary(buildDetailedReportParagraphs(workspace));

  assert.match(summary, /研究問題聚焦.*本報告採用.*現有來源/u);
  assert.doesNotMatch(summary, new RegExp(UNTRANSLATED_EVIDENCE_NOTICE));
});

test("paragraph grouping does not discard short valid Chinese sentences", () => {
  const workspace = {
    acceptedSources: [],
    evidenceCards: [],
    draft: {
      sections: [
        section("introduction", "資料有限。", [], []),
        section("methodology", "採摘要法。", [], []),
        section("discussion", "仍須複核。", [], []),
      ],
    },
  } as unknown as ReportWorkspace;

  const paragraphs = buildDetailedReportParagraphs(workspace);

  assert.match(paragraphs[0]?.body ?? "", /資料有限。/u);
  assert.match(paragraphs[1]?.body ?? "", /採摘要法。/u);
  assert.match(paragraphs[2]?.body ?? "", /仍須複核。/u);
});

test("reader subsections use natural paragraphs while preserving canonical section citations", () => {
  const introduction = section(
    "introduction",
    "主旨：第一句界定研究背景[S1]。第二句說明重要概念。第三句整理相關證據。此外，第四句補充應用情境。然而，第五句保留研究邊界[S1]。最後，第六句提出後續方向。",
    ["source-1"],
    ["[S1]"],
  );
  const originalBody = introduction.body;
  const originalMarkers = [...introduction.citationMarkers];
  const workspace = {
    acceptedSources: [{ id: "source-1", title: "Source one" }],
    evidenceCards: [],
    draft: { sections: [introduction] },
  } as unknown as ReportWorkspace;

  const paragraphs = buildDetailedReportParagraphs(workspace);
  const readerSection = paragraphs[0]?.subsections[0];

  assert.equal(readerSection?.title, "研究背景");
  assert.ok((readerSection?.paragraphs.length ?? 0) >= 2);
  assert.ok((readerSection?.paragraphs.length ?? 0) <= 4);
  for (const paragraph of readerSection?.paragraphs ?? []) {
    const sentenceCount = paragraph.match(/[。！？!?]/gu)?.length ?? 0;
    assert.ok(sentenceCount >= 2 && sentenceCount <= 4);
  }
  assert.match(readerSection?.paragraphs.join("") ?? "", /\[S1\]/u);
  assert.equal(introduction.body, originalBody);
  assert.deepEqual(introduction.citationMarkers, originalMarkers);
  assert.deepEqual(
    paragraphs[0]?.citations.map((citation) => citation.marker),
    ["[S1]"],
  );
});

test("reader view removes exact sentence repetition across report subsections", () => {
  const repeated = "相同的證據句不應在詳細報告中反覆出現[S1]。";
  const workspace = {
    acceptedSources: [{ id: "source-1", title: "Source one" }],
    evidenceCards: [],
    draft: {
      sections: [
        section("introduction", `${repeated}研究背景另有一項重點。`, ["source-1"], ["[S1]"]),
        section("literature_review", `${repeated}文獻脈絡提供另一項資訊。`, ["source-1"], ["[S1]"]),
        section("findings", `${repeated}主要發現另有一項資訊。`, ["source-1"], ["[S1]"]),
      ],
    },
  } as unknown as ReportWorkspace;

  const text = buildDetailedReportParagraphs(workspace)
    .flatMap((paragraph) => paragraph.subsections)
    .flatMap((subsection) => subsection.paragraphs)
    .join("");

  assert.equal(text.match(/相同的證據句不應在詳細報告中反覆出現/gu)?.length, 1);
  assert.match(text, /研究背景另有一項重點/u);
  assert.match(text, /文獻脈絡提供另一項資訊/u);
  assert.match(text, /主要發現另有一項資訊/u);
});

test("reader view removes a later compound sentence already covered by earlier sentences", () => {
  const workspace = {
    acceptedSources: [],
    evidenceCards: [],
    draft: {
      sections: [
        section(
          "introduction",
          "目前來源僅提供摘要；本文說明微塑膠會進入海洋食物網。",
          [],
          [],
        ),
        section(
          "literature_review",
          "目前來源僅提供摘要，本文說明微塑膠會進入海洋食物網。另有一項文獻脈絡。",
          [],
          [],
        ),
      ],
    },
  } as unknown as ReportWorkspace;

  const text = buildDetailedReportParagraphs(workspace)
    .flatMap((paragraph) => paragraph.subsections)
    .flatMap((subsection) => subsection.paragraphs)
    .join("");

  assert.equal(text.match(/目前來源僅提供摘要/gu)?.length, 1);
  assert.equal(text.match(/微塑膠會進入海洋食物網/gu)?.length, 1);
  assert.match(text, /另有一項文獻脈絡/u);
});

test("citation registry excludes accepted sources that contributed no usable evidence", () => {
  const workspace = {
    acceptedSources: [
      { id: "uncited", title: "Accepted but unused", authors: ["U. Author"], year: 2024 },
      { id: "cited", title: "Actually cited", authors: ["C. Author"], year: 2023 },
    ],
    evidenceCards: [{ id: "evidence-cited", sourceId: "cited" }],
    draft: {
      sections: [
        {
          ...section(
            "introduction",
            "這個背景句子只由實際貢獻證據的來源支持[S1]。",
            ["cited"],
            ["[S1]"],
          ),
          evidenceCardIds: ["evidence-cited"],
        },
      ],
    },
  } as unknown as ReportWorkspace;

  const paragraph = buildDetailedReportParagraphs(workspace)[0];

  assert.deepEqual(
    paragraph?.citations.map((citation) => [citation.marker, citation.source.id]),
    [["[S1]", "cited"]],
  );
});

test("canonical citation projection rewrites non-contiguous API markers by evidence identity", () => {
  const workspace = {
    acceptedSources: [
      {
        id: "source-taiwan",
        title: "Taiwan urban heat intensity",
        authors: ["T. Author"],
        year: 2024,
        doi: "10.1000/taiwan-uhi",
        canonicalSourceIdentity: "doi:10.1000/taiwan-uhi",
        dedupeKey: "doi:10.1000/taiwan-uhi",
      },
      {
        id: "source-campus",
        title: "Campus green cover",
        authors: ["C. Author"],
        year: 2023,
        doi: "10.1000/campus-green",
        canonicalSourceIdentity: "doi:10.1000/campus-green",
        dedupeKey: "doi:10.1000/campus-green",
      },
    ],
    evidenceCards: [
      {
        id: "evidence-taiwan",
        sourceId: "source-taiwan",
        canonicalSourceKey: "doi:10.1000/taiwan-uhi",
        dedupeKey: "doi:10.1000/taiwan-uhi",
        citationKey: "doi:10.1000/taiwan-uhi",
        citationMarker: "[S6]",
      },
      {
        id: "evidence-campus",
        sourceId: "source-campus",
        canonicalSourceKey: "doi:10.1000/campus-green",
        dedupeKey: "doi:10.1000/campus-green",
        citationKey: "doi:10.1000/campus-green",
        citationMarker: "[S3]",
      },
    ],
    draft: {
      sections: [
        {
          ...section(
            "introduction",
            "台灣都市熱島研究提供區域背景[S6]。校園綠覆研究提供尺度比較[S3]。",
            // Deliberately misleading order: evidence identity must remain authoritative.
            ["source-campus", "source-taiwan"],
            ["[S3]", "[S6]"],
          ),
          evidenceCardIds: ["evidence-taiwan", "evidence-campus"],
        },
      ],
    },
  } as unknown as ReportWorkspace;

  const model = buildCanonicalDetailedReportModel(workspace);
  const rewriteByInput = new Map(
    model.citationRegistry.integrity.rewrites.map((rewrite) => [
      rewrite.inputMarker,
      rewrite,
    ]),
  );
  const rendered = model.paragraphs[0]?.body ?? "";

  assert.equal(model.citationRegistry.integrity.status, "pass");
  assert.equal(
    rewriteByInput.get("[S6]")?.canonicalSourceKey,
    "doi:10.1000/taiwan-uhi",
  );
  assert.equal(
    rewriteByInput.get("[S3]")?.canonicalSourceKey,
    "doi:10.1000/campus-green",
  );
  assert.match(
    rendered,
    new RegExp(`臺灣都市熱島研究[^\n]*${rewriteByInput.get("[S6]")?.canonicalMarker.replace(/[\[\]]/gu, "\\$&")}`),
  );
  assert.match(
    rendered,
    new RegExp(`校園綠覆研究[^\n]*${rewriteByInput.get("[S3]")?.canonicalMarker.replace(/[\[\]]/gu, "\\$&")}`),
  );
});

test("canonical citation projection blocks unknown and ambiguous markers", () => {
  const acceptedSources = [
    {
      id: "source-a",
      title: "Source A",
      doi: "10.1000/a",
      canonicalSourceIdentity: "doi:10.1000/a",
      dedupeKey: "doi:10.1000/a",
    },
    {
      id: "source-b",
      title: "Source B",
      doi: "10.1000/b",
      canonicalSourceIdentity: "doi:10.1000/b",
      dedupeKey: "doi:10.1000/b",
    },
  ];
  const evidenceCards = acceptedSources.map((source) => ({
    id: `evidence-${source.id}`,
    sourceId: source.id,
    canonicalSourceKey: source.canonicalSourceIdentity,
    dedupeKey: source.dedupeKey,
    citationKey: source.canonicalSourceIdentity,
    citationMarker: "[S3]",
  }));
  const makeWorkspace = (body: string, cards: typeof evidenceCards) => ({
    acceptedSources,
    evidenceCards: cards,
    draft: {
      sections: [section("introduction", body, [], [])],
    },
  } as unknown as ReportWorkspace);

  const unknown = buildCanonicalDetailedReportModel(
    makeWorkspace("這個主張使用無法解析的引用[S99]。", evidenceCards.slice(0, 1)),
  );
  const ambiguous = buildCanonicalDetailedReportModel(
    makeWorkspace("這個主張使用對應不唯一的引用[S3]。", evidenceCards),
  );

  assert.equal(unknown.citationRegistry.integrity.status, "blocked");
  assert.deepEqual(unknown.citationRegistry.integrity.unknownMarkers, ["[S99]"]);
  assert.equal(ambiguous.citationRegistry.integrity.status, "blocked");
  assert.deepEqual(ambiguous.citationRegistry.integrity.ambiguousMarkers, ["[S3]"]);
});
