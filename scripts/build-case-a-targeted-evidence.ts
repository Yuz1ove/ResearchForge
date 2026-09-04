import fs from "node:fs";
import path from "node:path";

import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";
import type { SourceRecord } from "../artifacts/report-factory/src/lib/sourceRecords.ts";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    "artifacts/qa/researchforge-final-evidence-and-export-closure-20260824T075851+0800",
);
const sourceInput = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-formal-research-ready-20260823T100027/adolescent-screen-sleep/accepted-sources.json",
);
const evidenceInput = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-formal-research-ready-20260823T100027/adolescent-screen-sleep/grounding-evidence-cards.json",
);
const caseDir = path.join(outputRoot, "adolescent-screen-sleep");
const workflowId = "qa-formal-adolescent-screen-sleep-1787479227505";
const topicHash = "ygdhq0";
const preprintId = "doi:10.20944/preprints202508.1684.v1";
const removedLowValueCardIds = new Set([
  "evidence-claim-8066202b4945d5a7",
  "evidence-claim-a0230405c230337a",
  "evidence-claim-4d411d33fb1103ca",
  "evidence-claim-d69868c2a8e267a9",
  "evidence-claim-e5c9328db3a07aa4",
  "evidence-claim-ed79ad9cce0c03ac",
]);

function readJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(filename, "utf8")) as T;
}

function writeJson(filename: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filename);
}

const allSources = readJson<SourceRecord[]>(sourceInput);
const sourceById = new Map(allSources.map((source) => [source.id, source] as const));
const sources = allSources.filter((source) => source.id !== preprintId);
const existingCards = readJson<EvidenceCard[]>(evidenceInput).filter((card) =>
  card.sourceId !== preprintId &&
  !removedLowValueCardIds.has(card.evidenceId ?? card.id)
);

type Target = {
  suffix: string;
  sourceId: string;
  claimZhTw: string;
  span: string;
  limitationZhTw: string;
};

const targets: Target[] = [
  {
    suffix: "fpubh-poorer-sleep",
    sourceId: "doi:10.3389/fpubh.2024.1459952",
    claimZhTw: "在馬來西亞青少年橫斷面樣本中，過量螢幕時間與較差睡眠品質呈關聯；研究本身要求以縱向研究確認因果。",
    span: "Notably, excessive screen time appears to be associated with poorer sleep quality, ultimately increasing anxiety and depression. Understanding the effects of excessive screen time on sleep and well-being may have a substantial impact on public health policies and interventions. Enacting policies that promote better screen habits and sleep hygiene could improve people’s overall quality of life and well-being in the digital age. However, more longitudinal research is needed to confirm the causality of these relationships and investigate potential intervention strategies.",
    limitationZhTw: "橫斷面研究不能建立因果方向，且焦慮與憂鬱並非本題主要結果。",
  },
  {
    suffix: "jcm-shorter-sleep",
    sourceId: "doi:10.3390/jcm14248842",
    claimZhTw: "在 5 至 19 歲學童與青少年樣本中，較高每日螢幕時間與較短夜間睡眠呈關聯。",
    span: "Results: Higher daily screen time was associated with poorer attention and working-memory performance and shorter nocturnal sleep. Children and adolescents who exceeded the recommended daily screen-time limits performed worse on executive-function measures than those within recommended limits. Digital content type and sleep duration each contributed uniquely to executive performance, and recreational digital content as well as younger age intensified the negative effects of screen exposure. Conclusions: Excessive daily screen time, especially involving passive or recreational content, is associated with poorer EF performance and shorter sleep in children.",
    limitationZhTw: "樣本橫跨兒童與青少年，且研究為橫斷面設計；不得外推為青少年專屬因果效果。",
  },
  {
    suffix: "paom-evening-exposure",
    sourceId: "doi:10.31648/paom/219874",
    claimZhTw: "伊斯坦堡高中生樣本中，睡前最後一小時的螢幕暴露與較差睡眠品質顯著相關。",
    span: "Logistic regression analysis indicated that higher YIAT-SF scores (OR = 1.067, p = 0.010) and screen exposure in the last hour before sleep (OR = 5.487, p < 0.001) were significantly associated with poor sleep quality. Conclusions Problematic internet use and evening screen exposure are significantly associated with poor sleep quality.",
    limitationZhTw: "橫斷面且來自單一私立高中；OR 為該研究內的關聯估計，不可與其他研究合併。",
  },
  {
    suffix: "jordan-weekend-screen",
    sourceId: "doi:10.3390/adolescents5040055",
    claimZhTw: "約旦 12 至 14 歲學生中，週末螢幕時間可負向預測睡眠品質，總螢幕時間亦與睡眠品質呈負相關。",
    span: "Results showed that average screen time was 9.13 h per day. Weekend screen time emerged as a significant negative predictor of sleep quality (β = −0.27, p = 0.016). Gender and school type were also significant predictors. Adolescents with screen devices in their bedrooms and those with chronic medical conditions reported higher screen time. Although total screen time did not significantly predict academic achievement, it showed a moderate negative correlation with sleep quality (r = −0.18, p < 0.01). These findings suggest that excessive screen use, particularly on weekends, may impair sleep quality among adolescents.",
    limitationZhTw: "描述性相關研究不能建立因果；學業成就結果不可替代睡眠結果。",
  },
  {
    suffix: "bangkok-device-duration",
    sourceId: "doi:10.47191/ijcsrr/v6-i9-34",
    claimZhTw: "曼谷高中生研究顯示，睡前電子裝置使用與睡眠品質顯著相關，較長時間與較大螢幕的使用伴隨更多睡眠干擾。",
    span: "Our findings reveal a relationship between electronic device use before bed (p=0.008), and gender (p=<0.001) are associated significantly with sleep quality. Notably, we observed that prolonged screen time, particularly on larger screens like laptops (p=0.049), is associated with more disruptions in sleep patterns. Moreover, the duration of electronic devices usage before bed and gender has distinct and notable effects on sleep quality.",
    limitationZhTw: "原摘要的統計敘述語法不完整，僅保留研究內關聯，不推導效果量或因果。",
  },
  {
    suffix: "social-addiction-sleep",
    sourceId: "doi:10.61838/kman.jayps.5421",
    claimZhTw: "加拿大高中生結構模型中，社群媒體成癮分數可顯著預測較差睡眠品質。",
    span: "Social media addiction significantly predicted poorer sleep quality (β = .52, p < .001), higher academic burnout (β = .39, p < .001), and lower psychological well-being (β = -.24, p < .001). Poor sleep quality significantly predicted academic burnout (β = .31, p < .001) and psychological well-being (β = -.18, p < .001). Academic burnout was the strongest direct predictor of psychological well-being (β = -.49, p < .001). Bootstrapping confirmed significant indirect effects through sleep quality, academic burnout, and the serial pathway from sleep quality to academic burnout.",
    limitationZhTw: "橫斷面結構模型不建立因果；主要 exposure 為社群媒體成癮而非一般螢幕時間。",
  },
  {
    suffix: "review-method-limitations",
    sourceId: "doi:10.31234/osf.io/ejknv_v1",
    claimZhTw: "相關文獻多依賴問卷與自陳、缺少實驗設計，也常未區分數位媒體內容，限制因果與情境解讀。",
    span: "Existingresearch has some limitations, such as mostly depending on surveys and self-report data, notusing experimental methods and not focusing on digital media content. This reviewhighlights the importance of using screens in a healthy and responsible way and the need forfuture studies to explore how different types of screen activities (e.g., short videos, games,social media, online learning) affect adolescents over time.",
    limitationZhTw: "敘述性回顧只能支持跨研究限制，不提供新的效果估計。",
  },
  {
    suffix: "review-context-heterogeneity",
    sourceId: "doi:10.1016/j.xjmad.2023.100018",
    claimZhTw: "螢幕媒體活動與青少年生活結果的關聯受到廣泛環境與情境因素影響，應避免單一因果解讀。",
    span: "(4) the multifaceted relationship between SMA and various aspects of adolescent life is influenced by a wide range of environmental and contextual factors. SMA in youth is best understood within a complex system encompassing individual, caregiver, school, peer, and environmental factors, as framed by Bronfenbrenner's ecological systems theory, which identifies five interrelated systems (microsystem, mesosystem, exosystem, macrosystem, and chronosystem) that influence development across both proximal and distal levels of the environment.",
    limitationZhTw: "回顧性證據用於界定情境異質性，不作為單一研究的因果估計。",
  },
];

function targetedCard(target: Target): EvidenceCard {
  const source = sourceById.get(target.sourceId);
  if (!source) throw new Error(`Missing targeted source: ${target.sourceId}`);
  const sourceText = [source.abstract, source.extractedAbstract, source.originalAbstract]
    .filter(Boolean)
    .join("\n");
  if (!sourceText.includes(target.span)) {
    throw new Error(`Exact support span not found: ${target.suffix}`);
  }
  const id = `evidence:${target.sourceId}:targeted:${target.suffix}`;
  return {
    id,
    evidenceId: id,
    evidenceCardId: id,
    workflowId,
    topicHash,
    sourceId: target.sourceId,
    canonicalSourceKey: target.sourceId,
    dedupeKey: target.sourceId,
    citationKey: target.sourceId,
    claimTextOriginal: target.span,
    claimText: target.span,
    claimTextZh: target.claimZhTw,
    claimTextZhTw: target.claimZhTw,
    mainClaimZhTw: target.claimZhTw,
    claim: target.span,
    evidence: target.span,
    evidencePointZhTw: target.claimZhTw,
    usableEvidence: target.span,
    summary: target.claimZhTw,
    sourceSummaryZhTw: target.claimZhTw,
    sourceExcerptOriginal: target.span,
    supportedByText: target.span,
    supportSpan: target.span,
    quoteOrParaphrase: target.span,
    relevance: "direct_finding",
    formalEvidenceRole: "DIRECT_FINDING",
    limitations: [target.limitationZhTw],
    limitationsZhTw: [target.limitationZhTw],
    limitation: target.limitationZhTw,
    sectionTargets: ["literature_review", "findings", "cross_study_synthesis", "discussion", "limitations", "conclusion"],
    sectionFit: ["literature_review", "findings", "cross_study_synthesis", "discussion", "limitations", "conclusion"],
    usableSections: ["literature_review", "findings", "cross_study_synthesis", "discussion", "limitations", "conclusion"],
    sourceTitle: source.title,
    sourceUrl: source.url,
    sourceProvider: source.provider ?? source.sourceType,
    sourceType: source.sourceType,
    sourceRole: source.sourceRole,
    recommendationBucket: source.recommendationBucket,
    retrievalMode: source.retrievalMode,
    isPeerReviewed: source.isPeerReviewed ?? null,
    doi: source.doi ?? null,
    abstract: source.abstract ?? null,
    provider: source.provider ?? source.sourceType,
    year: source.year,
    citationMarker: "[pending]",
    sourceAccessLevel: source.accessLevel ?? "abstract_only",
    abstractOnly: source.accessLevel !== "full_text",
    confidenceScore: source.accessLevel === "full_text" ? 0.9 : 0.82,
    groundingConfidence: source.accessLevel === "full_text" ? 0.9 : 0.82,
    sourceQualityScore: source.sourceQualityScore ?? 0.8,
    topicRelevance: 1,
    needsManualReview: false,
    needsReview: false,
    governanceFlags: ["exact_support_span_verified", "case_a_targeted_augmentation"],
    locator: "Accepted-source abstract",
    extractionMethod: "deterministic_exact_span",
    createdAt: "2026-08-24T08:31:00+08:00",
  } as EvidenceCard;
}

const targetedCards = targets.map(targetedCard);
const cards = [...existingCards, ...targetedCards];

writeJson(path.join(caseDir, "targeted-accepted-sources.input.json"), sources);
writeJson(path.join(caseDir, "targeted-evidence-cards.input.json"), cards);
writeJson(path.join(caseDir, "targeted-evidence-augmentation.json"), {
  schemaVersion: "researchforge-case-a-targeted-evidence/v1",
  sourceInput,
  evidenceInput,
  sourceCountBefore: allSources.length,
  sourceCountAfterPreprintDeduplication: sources.length,
  excludedSourceIds: [preprintId],
  dedupeDecision: "Prefer the published Adolescents article over its matching preprint.",
  removedLowValueCardIds: [...removedLowValueCardIds],
  retainedCardCount: existingCards.length,
  addedCardCount: targetedCards.length,
  addedEvidenceIds: targetedCards.map((card) => card.evidenceId),
  exactSpanCharactersAdded: targets.reduce((sum, target) => sum + target.span.length, 0),
  providerRequests: 0,
  writerRequests: 0
});

process.stdout.write(`${sources.length} sources; ${cards.length} cards; ${targetedCards.length} targeted cards\n`);
