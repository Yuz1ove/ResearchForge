import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceCards } from "./evidenceCards.ts";
import type { ResearchProject } from "./qualityJudge.ts";
import { buildReportDraft } from "./reportDraft.ts";
import { buildReportOutline } from "./reportOutline.ts";
import type { SourceRecord } from "./sourceRecords.ts";
import {
  buildStableCitationMarkerMap,
  buildSupportedClaimsFromEvidenceCards,
  citationMarkersForSourceIds,
  extractCitationMarkers,
  getSectionEvidencePolicy,
  guardUnsupportedSectionClaims,
  sourceIdsFromCitationMarkers,
  validateSectionEvidenceCoverage,
} from "./sectionEvidencePolicy.ts";

function source(index: number, overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: `source-${index}`,
    title: `Honey crystallization study ${index}`,
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract:
      "Honey crystallization is related to glucose fructose ratio, water content, storage temperature, and seed crystal formation.",
    doi: `10.1000/honey-${index}`,
    url: `https://doi.org/10.1000/honey-${index}`,
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceKind: "journal",
    isPeerReviewed: true,
    recommendationBucket: "scholarly_recommended",
    usableSections: ["文獻探討", "數據分析", "結論"],
    sourceFacts: [
      {
        sourceId: `source-${index}`,
        fact: `蜂蜜結晶研究 ${index} 指出葡萄糖果糖比例與含水量會影響結晶條件。`,
        category: "literature",
        relevanceToTopic: 0.9,
        supportedByText:
          "Honey crystallization depends on glucose fructose ratio and moisture.",
      },
    ],
    ...overrides,
  };
}

function project(): ResearchProject {
  const now = "2026-07-03T00:00:00.000Z";
  return {
    id: "project-1",
    topic: "探討蜂蜜結晶速度與糖類比例、含水量之間的關係",
    reportType: "研究報告",
    depth: "standard",
    createdAt: now,
    updatedAt: now,
    status: "draft",
  };
}

test("section policy keeps background from accepting finding claims", () => {
  const background = getSectionEvidencePolicy("introduction");
  const literature = getSectionEvidencePolicy("literature_review");
  const title = getSectionEvidencePolicy("title");

  assert.equal(background.allowedClaimTypes.includes("finding"), false);
  assert.equal(background.forbiddenClaimPatterns.some((pattern) => pattern.test("本研究證實")), true);
  assert.equal(literature.minEvidenceCards >= 4, true);
  assert.equal(title.minCitations, 0);
  assert.equal(title.minEvidenceCards, 0);
});

test("supported claim builder downgrades educational and abstract-only evidence", () => {
  const acceptedSources = [
    source(1, {
      id: "education-source",
      doi: null,
      sourceType: "Official Source",
      sourceKind: "web",
      isPeerReviewed: false,
      recommendationBucket: "official_background",
      sourceCategory: "government_or_institution",
      usableSections: ["研究背景"],
    }),
    source(2),
    source(3, {
      id: "abstract-only",
      abstract: null,
      evidenceGrounding: "metadata_only",
    }),
  ];
  const cards = buildEvidenceCards(acceptedSources);
  const markerMap = buildStableCitationMarkerMap(acceptedSources);
  const claims = buildSupportedClaimsFromEvidenceCards(cards, { markerMap });
  const educationClaims = claims.filter((claim) =>
    claim.evidenceIds.some((id) => id.includes("education-source")),
  );
  const scholarlyClaims = claims.filter((claim) =>
    claim.evidenceIds.some((id) => id.includes("source-2")),
  );
  const abstractOnlyClaims = claims.filter((claim) =>
    claim.evidenceIds.some((id) => id.includes("abstract-only")),
  );

  assert.equal(
    educationClaims.every((claim) =>
      ["background", "definition", "limitation", "research_gap"].includes(claim.claimType),
    ),
    true,
  );
  assert.equal(scholarlyClaims.some((claim) => claim.claimType === "finding"), true);
  assert.equal(abstractOnlyClaims.some((claim) => claim.supportLevel === "weak"), true);
  assert.equal(
    abstractOnlyClaims.some((claim) => claim.canUseInAcademicClaim),
    false,
  );
});

test("traceable abstract-only papers can support caveated findings", () => {
  const abstractOnlySource = source(7, {
    id: "rain-abstract-only",
    title: "Terminal Velocity of Raindrops Aloft",
    abstract:
      "The terminal velocity of raindrops varies with drop diameter, shape, and aerodynamic drag.",
    evidenceGrounding: "abstract_only",
    sourceFacts: [],
  });
  const cards = buildEvidenceCards([abstractOnlySource]);
  const markerMap = buildStableCitationMarkerMap([abstractOnlySource]);
  const claims = buildSupportedClaimsFromEvidenceCards(cards, { markerMap });
  const findings = claims.filter((claim) => claim.sectionKey === "findings");

  assert.equal(cards.every((card) => Boolean(card.supportSpan || card.supportedByText)), true);
  assert.equal(findings.length > 0, true);
  assert.equal(findings.every((claim) => claim.supportLevel === "weak"), true);
  assert.equal(findings.every((claim) => claim.canUseInAcademicClaim), true);
  assert.equal(findings.every((claim) => claim.requiresCaveat), true);
  assert.equal(
    findings.every((claim) => claim.limitations.some((item) => /摘要|metadata/u.test(item))),
    true,
  );
});

test("section synthesis replaces mislabeled raw English zh fields with an explicit translation gap", () => {
  const rawAbstract =
    "Abstract The aim is to evaluate sleep duration and adolescent attention. `This narrative review examines sleep deprivation among children and adolescents in Japan.`";
  const acceptedSources = [source(8, {
    id: "sleep-raw",
    title: "Sleep deprivation and adolescent attention",
    abstract: rawAbstract,
    originalAbstract: rawAbstract,
    sourceFacts: [],
    evidenceGrounding: "abstract_only",
  })];
  const cards = buildEvidenceCards(acceptedSources).map((card) => ({
    ...card,
    // Reproduce a legacy/server payload whose zh-TW field actually contained
    // the raw source abstract.
    claimTextZhTw: rawAbstract,
    mainClaim: rawAbstract,
    evidencePointZhTw: rawAbstract,
    sourceSummaryZhTw: rawAbstract,
    summary: rawAbstract,
  }));
  const outline = buildReportOutline({
    topic: "睡眠不足與青少年注意力",
    reportType: "研究報告",
    audience: "高中生",
    acceptedSources,
    evidenceCards: cards,
  });
  const draft = buildReportDraft({
    project: project(),
    topic: "睡眠不足與青少年注意力",
    reportType: "研究報告",
    audience: "高中生",
    evidenceCards: cards,
    outline,
    acceptedSources,
  });
  const readerText = draft.sections.map((section) => section.body).join(" ");

  assert.doesNotMatch(readerText, /Abstract\s+The aim|This narrative review|`/iu);
  assert.match(readerText, /尚未完成可驗證的繁中重點整理/u);
});

test("unsupported claim guard blocks uncited strong conclusions but allows questions", () => {
  const blocked = guardUnsupportedSectionClaims({
    sectionKey: "introduction",
    text: "本研究證實蜂蜜結晶速度受到糖類比例影響。",
    availableCitationMarkers: [],
  });
  const cited = guardUnsupportedSectionClaims({
    sectionKey: "discussion",
    text: "目前來源顯示蜂蜜結晶可能與糖類比例相關[S1]。",
    availableCitationMarkers: ["[S1]"],
  });
  const question = guardUnsupportedSectionClaims({
    sectionKey: "research_question",
    text: "蜂蜜結晶速度是否會隨含水量改變？",
    availableCitationMarkers: [],
  });

  assert.match(blocked.text, /目前來源尚不足以支持此結論|尚不足以證明/u);
  assert.match(cited.text, /\[S1\]/u);
  assert.equal(question.text.includes("[S"), false);
});

test("unsupported claim guard never assigns an unrelated available marker", () => {
  const guarded = guardUnsupportedSectionClaims({
    sectionKey: "findings",
    text: "台灣校園綠覆率顯著降低都市熱島效應。",
    availableCitationMarkers: ["[S1]", "[S2]"],
  });

  assert.equal(guarded.text, "目前來源尚不足以支持此結論。");
  assert.doesNotMatch(guarded.text, /\[S\d+\]/u);
  assert.ok(guarded.warnings.some((warning) => warning.includes("缺少可驗證引用")));
  assert.deepEqual(guarded.diagnostics, ["unsupported_claim_blocked:findings"]);
  assert.equal(
    guarded.diagnostics.some((diagnostic) => diagnostic.startsWith("citation_marker_added:")),
    false,
  );
});

test("unsupported claim guard removes inline markers outside the allowed source set", () => {
  const mixed = guardUnsupportedSectionClaims({
    sectionKey: "discussion",
    text: "目前來源顯示綠覆率可能與地表溫度相關[S1]［Ｓ２］。",
    availableCitationMarkers: ["[S1]"],
  });
  const unknownOnly = guardUnsupportedSectionClaims({
    sectionKey: "findings",
    text: "台灣校園綠覆率顯著降低都市熱島效應[S9]。",
    availableCitationMarkers: ["[S1]"],
  });

  assert.match(mixed.text, /\[S1\]/u);
  assert.doesNotMatch(mixed.text, /\[S2\]|［Ｓ２］/u);
  assert.ok(mixed.warnings.some((warning) => warning.includes("無法對應")));
  assert.ok(
    mixed.diagnostics.some((diagnostic) =>
      diagnostic.includes("unsupported_marker_removed:discussion:[S2]"),
    ),
  );
  assert.equal(unknownOnly.text, "目前來源尚不足以支持此結論。");
  assert.doesNotMatch(unknownOnly.text, /\[S9\]/u);
  assert.ok(unknownOnly.warnings.some((warning) => warning.includes("缺少可驗證引用")));
});

test("citation mapping is stable and only accepts known source markers", () => {
  const accepted = [source(1), source(2)];
  const markerMap = buildStableCitationMarkerMap(accepted);

  assert.deepEqual(citationMarkersForSourceIds(["source-1", "source-2"], markerMap), ["[S1]", "[S2]"]);
  assert.deepEqual(sourceIdsFromCitationMarkers(["[S1]", "[S2]"], markerMap), ["source-1", "source-2"]);
  assert.deepEqual(extractCitationMarkers("段落［Ｓ1］與［S2］。"), ["[S1]", "[S2]"]);
  assert.deepEqual(citationMarkersForSourceIds(["rejected-source"], markerMap), []);

  const coverage = validateSectionEvidenceCoverage({
    sectionKey: "literature_review",
    text: "段落一[S1][S2]。",
    claims: [],
    evidenceCardIds: ["e1", "e2"],
    citationMarkers: ["[S1]", "[S2]"],
  });
  assert.equal(coverage.citationCount, 2);
});

test("citation mapping remains stable when accepted sources are reordered", () => {
  const sources = [
    source(1, { canonicalSourceIdentity: "doi:10.1000/zeta" }),
    {
      ...source(2, { doi: null, dedupeKey: null }),
      canonicalSourceKey: "title:alpha|author:lovelace|year:2024",
    } as SourceRecord,
    source(3, { canonicalSourceIdentity: null, doi: null, dedupeKey: "title:middle" }),
    source(4, { canonicalSourceIdentity: null, dedupeKey: null, doi: "10.1000/beta" }),
    source(5, {
      id: "opaque-title-source",
      canonicalSourceIdentity: null,
      dedupeKey: null,
      doi: null,
      title: "Gamma Honey Study",
      authors: ["Grace Hopper"],
      year: 2023,
    }),
  ];
  const original = buildStableCitationMarkerMap(sources);
  const reordered = buildStableCitationMarkerMap([
    sources[4]!,
    sources[2]!,
    sources[0]!,
    sources[3]!,
    sources[1]!,
  ]);

  assert.deepEqual(
    sources.map((item) => [item.id, original.get(item.id)]),
    sources.map((item) => [item.id, reordered.get(item.id)]),
  );
  assert.equal(original.get("source-4"), "[S1]");
  assert.equal(original.get("source-1"), "[S2]");
  assert.equal(original.get("source-2"), "[S3]");
  assert.equal(original.get("opaque-title-source"), "[S4]");
  assert.equal(original.get("source-3"), "[S5]");
  assert.deepEqual(Array.from(original.keys()).sort(), sources.map((item) => item.id).sort());
});

test("literature review with five cards creates multi-paragraph cited synthesis", () => {
  const acceptedSources = [1, 2, 3, 4, 5].map((index) => source(index));
  const evidenceCards = buildEvidenceCards(acceptedSources);
  const outline = buildReportOutline({
    topic: "探討蜂蜜結晶速度與糖類比例、含水量之間的關係",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
  });
  const draft = buildReportDraft({
    project: project(),
    topic: "探討蜂蜜結晶速度與糖類比例、含水量之間的關係",
    reportType: "研究報告",
    audience: "高中",
    acceptedSources,
    evidenceCards,
    outline,
    citationFormat: "APA",
  });
  const literature = draft.sections.find((section) => section.sectionId === "literature_review");
  const paragraphs = literature?.body.split(/\n{2,}/u).filter(Boolean) ?? [];
  const citedParagraphs = paragraphs.filter((paragraph) => /\[S\d+\]/u.test(paragraph));
  const blockedParagraphs = paragraphs.filter((paragraph) => !/\[S\d+\]/u.test(paragraph));

  assert.equal((literature?.evidenceCardIds.length ?? 0) >= 5, true);
  assert.equal(paragraphs.length >= 2, true);
  assert.equal(citedParagraphs.length >= 2, true);
  assert.equal(
    blockedParagraphs.every((paragraph) => /目前來源尚不足以支持此結論/u.test(paragraph)),
    true,
  );
  assert.equal(
    blockedParagraphs.length === 0 ||
      Boolean(literature?.warnings.some((warning) => warning.includes("缺少可驗證引用"))),
    true,
  );
  assert.doesNotMatch(literature?.body ?? "", /目前文獻不足|不足以形成有效比較/u);
});
