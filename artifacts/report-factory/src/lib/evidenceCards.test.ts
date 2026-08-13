import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeEvidenceExtraction,
  buildEvidenceCards,
  evidenceCardHasUsableSupport,
  summarizeEvidenceCoverage,
} from "./evidenceCards.ts";
import type { SourceRecord } from "./sourceRecords.ts";

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "source-1",
    title: "Attention and sleep quality",
    authors: ["Ada Lovelace"],
    year: 2024,
    abstract: "Students report lower sleep quality when screen time is high.",
    doi: "10.1000/sleep",
    url: "https://example.edu/sleep",
    sourceType: "Crossref",
    reviewState: "accepted",
    publisher: "Example Publisher",
    containerTitle: "Example Journal",
    accessedAt: null,
    sourceCategory: "學術論文",
    usableSections: ["研究背景", "文獻探討"],
    confidence: "高",
    provider: "Crossref",
    sourceQualityScore: 92,
    relevanceScore: 84,
    finalScore: 87,
    reviewNotes: "樣本描述清楚。",
    ...overrides,
  };
}

test("builds evidence cards from accepted sources and inherits metadata", () => {
  const cards = buildEvidenceCards([source()]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.sourceId, "source-1");
  assert.equal(cards[0]?.canonicalSourceKey, "doi:10.1000/sleep");
  assert.equal(cards[0]?.dedupeKey, "doi:10.1000/sleep");
  assert.equal(cards[0]?.citationKey, "doi:10.1000/sleep");
  assert.equal(cards[0]?.sourceCategory, "學術論文");
  assert.equal(cards[0]?.doi, "10.1000/sleep");
  assert.equal(cards[0]?.abstract, "Students report lower sleep quality when screen time is high.");
  assert.equal(cards[0]?.provider, "Crossref");
  assert.deepEqual(cards[0]?.authors, ["Ada Lovelace"]);
  assert.equal(cards[0]?.sourceQualityScore, 92);
  assert.equal(cards[0]?.relevanceScore, 84);
  assert.equal(cards[0]?.finalScore, 87);
  assert.deepEqual(cards[0]?.usableSections, ["研究背景", "文獻探討"]);
  assert.equal(cards[0]?.confidence, "高");
  assert.equal(cards[0]?.derivation, "abstract-derived");
  assert.equal(cards[0]?.pageOrLocation, "abstract");
  assert.equal(cards[0]?.confidenceScore <= 0.74, true);
  assert.equal(cards[0]?.notes, "樣本描述清楚。");
});

test("local fallback claimText stays aligned to the exact source span", () => {
  const exactAbstract =
    "Lithium-ion batteries are widely used in phones and electric vehicles.";
  const cards = buildEvidenceCards([
    source({
      id: "lithium-alignment",
      abstract: exactAbstract,
      originalAbstract: exactAbstract,
      evidenceSummaryZhTw: "鋰電池可以治療疾病並改善醫療管理。",
    }),
  ]);

  assert.equal(cards[0]?.claimText, exactAbstract.replace(/[.]$/u, ""));
  assert.equal(cards[0]?.supportSpan, exactAbstract);
  assert.doesNotMatch(cards[0]?.claimText ?? "", /治療疾病|醫療管理/u);
});

test("builds evidence cards from sourceFacts before fallback summaries", () => {
  const cards = buildEvidenceCards([
    source({
      id: "redox",
      title: "Redox reactions and electron transfer",
      sourceFacts: [
        {
          sourceId: "redox",
          fact: "氧化還原反應涉及電子轉移與氧化數變化。",
          category: "mechanism",
          relevanceToTopic: 0.92,
          supportedByText:
            "Redox reactions involve electron transfer and changes in oxidation state.",
        },
      ],
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.claim, "氧化還原反應涉及電子轉移與氧化數變化。");
  assert.equal(cards[0]?.pageOrLocation, "sourceFact");
  assert.match(cards[0]?.sourceExcerptOriginal ?? "", /electron transfer/);
  assert.match(cards[0]?.evidence ?? "", /氧化還原反應|電子轉移/u);
});

test("traceable extracted full text produces fulltext-derived evidence cards", () => {
  const fullText =
    "The full-text results report a negative association between vegetation cover and land surface temperature.";
  const cards = buildEvidenceCards([
    source({
      id: "fulltext-urban-heat",
      accessLevel: "full_text",
      contentLevel: "fulltext",
      extractedText: fullText,
      sourceFacts: [{
        sourceId: "fulltext-urban-heat",
        fact: "全文結果指出植被覆蓋與地表溫度呈負向關聯。",
        category: "finding",
        relevanceToTopic: 0.95,
        supportedByText: fullText,
      }],
    }),
  ]);

  assert.equal(cards[0]?.derivation, "fulltext-derived");
  assert.equal(cards[0]?.abstractOnly, false);
  assert.equal(cards[0]?.limitation, null);
});

test("english sourceFacts fall back to zh-TW summary fields for user-facing evidence text", () => {
  const cards = buildEvidenceCards([
    source({
      id: "perchlorate",
      title: "SODIUM PERCHLORATE | CAMEO Chemicals | NOAA",
      readableSummaryZhTw:
        "這份官方資料重點在過氯酸鈉的氧化性、儲存相容性與緊急應變風險。",
      mainEvidencePointZhTw:
        "CAMEO 明確指出過氯酸鈉具有氧化性與受熱反應風險，可直接支撐安全分析。",
      sourceFacts: [
        {
          sourceId: "perchlorate",
          fact: "Reactivity Profile SODIUM PERCHLORATE is a strong oxidizing agent.",
          category: "hazard",
          relevanceToTopic: 0.95,
          supportedByText:
            "Reactivity Profile SODIUM PERCHLORATE is a strong oxidizing agent.",
        },
      ],
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.match(cards[0]?.claimTextZhTw ?? "", /過氯酸鈉|氧化性/u);
  assert.match(cards[0]?.evidencePointZhTw ?? "", /過氯酸鈉|受熱反應|安全分析/u);
  assert.match(cards[0]?.sourceExcerptOriginal ?? "", /strong oxidizing agent/i);
});

test("raw English Abstract remains traceable but never becomes reader-facing evidence prose", () => {
  const rawAbstract =
    "Abstract The aim is to evaluate the mutual influences between sleep duration and adolescent risk behaviours. `This review explores the issue of sleep deprivation among children and adolescents in Japan.`";
  const cards = buildEvidenceCards([
    source({
      id: "sleep-raw-abstract",
      abstract: rawAbstract,
      originalAbstract: rawAbstract,
      sourceFacts: [],
      readableSummaryZhTw: null,
      mainEvidencePointZhTw: null,
      evidenceSummaryZhTw: null,
      abstractZhTw: null,
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.match(cards[0]?.supportSpan ?? "", /Abstract The aim/iu);
  for (const text of [
    cards[0]?.claimTextZhTw,
    cards[0]?.mainClaim,
    cards[0]?.evidencePointZhTw,
    cards[0]?.usableEvidence,
    cards[0]?.summary,
    cards[0]?.sourceSummaryZhTw,
  ]) {
    assert.doesNotMatch(text ?? "", /Abstract The aim|This review explores|`/iu);
    assert.match(text ?? "", /繁中重點|缺少足夠摘要|可驗證內容/u);
  }
});

test("ignores pending and rejected sources", () => {
  const cards = buildEvidenceCards([
    source({ id: "accepted", reviewState: "accepted" }),
    source({ id: "pending", reviewState: "pending", doi: "10.1000/pending" }),
    source({ id: "rejected", reviewState: "rejected", doi: "10.1000/rejected" }),
  ]);

  assert.deepEqual(cards.map((card) => card.sourceId), ["accepted"]);
});

test("keeps rejected-off-topic accepted sources out of evidence cards", () => {
  const cards = buildEvidenceCards([
    source({
      id: "accepted-off-topic",
      reviewState: "accepted",
      usageRecommendation: "exclude",
      topicalRelevanceLabel: "irrelevant",
    }),
    source({ id: "accepted-usable", reviewState: "accepted", doi: "10.1000/usable" }),
  ]);

  assert.deepEqual(cards.map((card) => card.sourceId), ["accepted-usable"]);
});

test("explicit rejected signals block evidence even when an accepted alias remains", () => {
  const cards = buildEvidenceCards([
    source({
      id: "review-conflict",
      reviewState: "accepted",
      userDecision: "rejected",
      acceptedByUser: false,
    }),
    source({
      id: "legacy-conflict",
      reviewState: "accepted",
      reviewStatus: "rejected",
      doi: "10.1000/legacy-conflict",
    } as Partial<SourceRecord>),
    source({ id: "accepted-usable", doi: "10.1000/usable" }),
  ]);

  assert.deepEqual(cards.map((card) => card.sourceId), ["accepted-usable"]);
});

test("does not duplicate by sourceId and removes no-longer-accepted sources on regenerate", () => {
  const first = buildEvidenceCards([source({ id: "accepted" })]);
  const edited = [{ ...first[0]!, claim: "人工編輯後的主張" }];
  const regenerated = buildEvidenceCards(
    [
      source({ id: "accepted" }),
      source({ id: "other", doi: "10.1000/other", title: "Other source" }),
      source({ id: "accepted", doi: "10.1000/duplicate" }),
    ],
    edited,
  );
  const afterCancel = buildEvidenceCards([source({ id: "accepted", reviewState: "pending" })], regenerated);

  assert.equal(regenerated.length, 2);
  assert.equal(regenerated[0]?.claim, "人工編輯後的主張");
  assert.deepEqual(afterCancel, []);
});

test("creates up to three evidence cards when abstract contains multiple matched snippets", () => {
  const cards = buildEvidenceCards(
    [
      source({
        id: "climate",
        title: "Climate change evidence",
        abstract:
          "Anthropogenic greenhouse gas emissions drive climate change. Observed warming and sea level indicators show current status. Climate impacts create risks for ecosystems.",
      }),
    ],
    [],
    { topic: "氣候變遷的成因與現況" },
  );

  assert.equal(cards.length >= 2, true);
  assert.equal(cards.length <= 3, true);
  assert.equal(cards.every((card) => card.sourceId === "climate"), true);
  assert.equal(cards.every((card) => card.limitation?.includes("尚未讀取全文")), true);
});

test("paleontology algae evidence cards do not inherit dinosaur topic wording", () => {
  const cards = buildEvidenceCards(
    [
      source({
        id: "algal-fossils",
        title: "Paleoenvironment, algal structures, and fossil algae in the upper Cambrian of central Texas",
        abstract:
          "Algal structures, fossil algae, stromatolites and sedimentary indicators are used to interpret the paleoenvironment.",
        readableSummaryZhTw:
          "此來源討論藻類構造、藻類化石、疊層石與沉積指標如何支撐古環境判讀。",
      }),
    ],
    [],
    { topic: "化石與藻類的關係" },
  );

  assert.equal(cards.length > 0, true);
  const joined = cards
    .map((card) => `${card.claim} ${card.evidence} ${card.sourceSummaryZhTw}`)
    .join(" ");
  assert.doesNotMatch(joined, /恐龍/u);
  assert.match(joined, /藻類|微化石|古環境|沉積/u);
});

test("metadata-only evidence is bibliographic and low confidence", () => {
  const cards = buildEvidenceCards([
    source({
      id: "metadata-only",
      abstract: null,
      evidenceGrounding: "metadata_only",
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.derivation, "metadata-derived");
  assert.equal(cards[0]?.confidenceScore, 0.35);
  assert.match(cards[0]?.limitation ?? "", /不可產生具體研究結論|僅能作為書目/);
  assert.equal(evidenceCardHasUsableSupport(cards[0]!), false);

  const diagnostics = analyzeEvidenceExtraction(
    [source({ id: "metadata-only", abstract: null, evidenceGrounding: "metadata_only" })],
    cards,
  );
  assert.equal(diagnostics.evidenceCardCount, 1);
  assert.equal(diagnostics.usableEvidenceCardCount, 0);
  assert.equal(diagnostics.bibliographicCardCount, 1);
  assert.equal(diagnostics.issues[0]?.stage, "abstract_extraction");
  assert.match(diagnostics.blockingMessage ?? "", /書目背景卡|abstract/iu);
});

test("evidence diagnostics distinguish a saved abstract from a card-builder failure", () => {
  const accepted = source({
    id: "saved-abstract-no-card",
    abstract: "A traceable abstract remains saved after accepting and reloading the source.",
  });
  const diagnostics = analyzeEvidenceExtraction([accepted], []);

  assert.equal(diagnostics.usableEvidenceCardCount, 0);
  assert.equal(diagnostics.issues[0]?.stage, "evidence_card_builder");
  assert.match(diagnostics.issues[0]?.message ?? "", /abstract 已保存|identity mapping/iu);
});

test("preserves source governance fields on evidence cards", () => {
  const cards = buildEvidenceCards([
    source({
      id: "official-background",
      doi: null,
      sourceType: "Official Source",
      sourceCategory: "government_or_institution",
      containerTitle: "NASA Space Place",
      isPeerReviewed: false,
      recommendationBucket: "official_background",
      sourceRole: "official_background_explanation",
      retrievalMode: "trusted_seed",
      providerHealthSnapshot: {
        provider: "openalex",
        status: "degraded",
        recentFailureCount: 3,
        recentTimeoutCount: 0,
      },
      usableSections: ["研究背景"],
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.sourceType, "official_background");
  assert.equal(cards[0]?.recommendationBucket, "official_background");
  assert.equal(cards[0]?.sourceRole, "official_background_explanation");
  assert.equal(cards[0]?.retrievalMode, "trusted_seed");
  assert.equal(cards[0]?.isPeerReviewed, false);
  assert.equal(cards[0]?.venue, "NASA Space Place");
  assert.equal(
    (cards[0]?.providerHealthSnapshot as { status?: string } | null)?.status,
    "degraded",
  );
  assert.deepEqual(cards[0]?.usableSections, ["研究背景"]);
  assert.deepEqual(cards[0]?.sectionTargets, ["abstract", "introduction", "research_question"]);
  assert.match(cards[0]?.limitations.join("；") ?? "", /非同行評審論文/);
});

test("manual review acceptance keeps original bucket and records user decision", () => {
  const cards = buildEvidenceCards([
    source({
      id: "manual-source",
      recommendationBucket: "manual_review",
      sourceRole: "weak_or_uncertain",
      acceptedByUser: true,
      userDecision: "accepted_as_manual_review",
      acceptedAs: "manual_review",
    }),
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.recommendationBucket, "manual_review");
  assert.equal(cards[0]?.acceptedByUser, true);
  assert.equal(cards[0]?.userDecision, "accepted_as_manual_review");
  assert.equal(cards[0]?.acceptedAs, "manual_review");
  assert.notEqual(cards[0]?.recommendationBucket, "scholarly_recommended");
});

test("coverage summary counts usable sections and reports required warnings", () => {
  const accepted = [
    source({ id: "one", usableSections: ["研究背景"] }),
    source({ id: "two", doi: "10.1000/two", usableSections: ["研究背景"] }),
  ];
  const cards = buildEvidenceCards(accepted);
  const summary = summarizeEvidenceCoverage(cards, accepted);

  assert.equal(summary.sectionCounts["研究背景"], 2);
  assert.equal(summary.sectionCounts["文獻探討"], 0);
  assert(summary.warnings.some((warning) => warning.message === "文獻探討尚缺證據"));
  assert(summary.warnings.some((warning) => warning.message === "建議至少接受 10 筆來源"));
});
