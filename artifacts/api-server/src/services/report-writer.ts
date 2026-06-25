import type { SourceRecord } from "@workspace/api-zod";
import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
import { logger } from "../lib/logger";
import {
  LlmAdapterError,
  safeJsonParse,
  type OpenAICompatibleLlmConfig,
} from "./llm-adapter";
import {
  logLlmFallback,
  messageFromStatus,
  providerLabel,
  requestLlmText,
  statusFromLlmError,
} from "./llm-service";
import { understandTopicHeuristically } from "./topic-understanding";

export interface ReportWriterInput {
  topic: string;
  reportType?: string;
  audience?: string;
  language?: string;
  generationMode?: "preliminary" | "formal" | string;
  acceptedSources: SourceRecord[];
  evidenceCards?: ReportWriterEvidenceCard[];
}

export interface ReportWriterSection {
  sectionId: string;
  title: string;
  prose: string;
  evidenceCardIds: string[];
  citationIds: string[];
  warnings?: string[];
}

export interface ReportWriterEvidenceCard {
  id: string;
  sourceId: string;
  title?: string;
  claim: string;
  evidence: string;
  summary: string;
  relevance: string;
  sourceType?: string;
  reliability?: string;
  mainClaim?: string;
  usableEvidence?: string;
  limitations?: string[];
  sectionTargets?: string[];
  sourceTitle: string;
  sourceProvider: string;
  doi?: string | null;
  abstract?: string | null;
  provider?: string | null;
  relevanceScore?: number | null;
  sourceQualityScore?: number | null;
  finalScore?: number | null;
  year: number | null;
  usableSections: string[];
  citationText: string;
  limitation: string | null;
  derivation?: string | null;
  evidenceGrounding?: string | null;
  summaryStructuredStatus?: string | null;
  llmSummaryStatus?: string | null;
}

export interface ReportWriterResult {
  ok: boolean;
  status: LlmStructuredStatus;
  llm_status: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallback_used: boolean;
  model?: string;
  message: string | null;
  warning: string | null;
  sections: ReportWriterSection[];
  reportGenerationProvider: string;
  reportGenerationModel: string | null;
  reportGenerationStatus: "success" | "timeout" | "quota_exceeded" | "failed" | "skipped";
  fallbackUsed: boolean;
  fallbackReason: string | null;
}

export interface ReportWriterOptions {
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

const SECTION_PLAN = [
  {
    sectionId: "abstract",
    title: "摘要",
    instruction: "用 1 段說明研究主題、來源基礎、主要方向與限制。",
  },
  {
    sectionId: "introduction",
    title: "一、研究背景與動機",
    instruction: "說明為什麼此主題值得研究，並界定討論範圍。",
  },
  {
    sectionId: "research_question",
    title: "二、研究問題",
    instruction: "提出可由已接受來源支撐的研究問題，不可超出資料基礎。",
  },
  {
    sectionId: "literature_review",
    title: "三、文獻探討",
    instruction: "整合已接受來源的共同觀點，避免逐張來源卡貼上。",
  },
  {
    sectionId: "methodology",
    title: "四、研究方法",
    instruction: "說明資料來源、篩選方式、證據使用原則與方法限制。",
  },
  {
    sectionId: "findings",
    title: "五、主要發現",
    instruction: "用正式報告口吻整理可由來源支撐的資料與證據。",
  },
  {
    sectionId: "discussion",
    title: "六、討論",
    instruction: "說明發現的意義、可能解釋與資料限制。",
  },
  {
    sectionId: "limitations",
    title: "七、限制",
    instruction: "明確標示缺少哪些證據、哪些來源只有摘要、哪些結論仍不能成立。",
  },
  {
    sectionId: "conclusion",
    title: "八、結論與建議",
    instruction: "提出保守結論與後續可補資料。",
  },
] as const;

const DEFAULT_REPORT_WRITER_MODEL = "gemma4:e2b";
const DEFAULT_REPORT_WRITER_TIMEOUT_MS = 180_000;
const DEFAULT_REPORT_WRITER_RETRY_MODEL = "qwen3:4b";
const DEFAULT_REPORT_WRITER_RETRY_TIMEOUT_MS = 60_000;
const PRIMARY_PROMPT_SOURCE_LIMIT = 8;
const PRIMARY_PROMPT_EVIDENCE_LIMIT = 8;
const RETRY_PROMPT_SOURCE_LIMIT = 2;
const RETRY_PROMPT_EVIDENCE_LIMIT = 2;
const PRIMARY_SOURCE_TEXT_LIMIT = 480;
const PRIMARY_EVIDENCE_TEXT_LIMIT = 420;
const RETRY_SOURCE_TEXT_LIMIT = 180;
const RETRY_EVIDENCE_TEXT_LIMIT = 160;
const GENERIC_SECTION_PATTERNS = [
  /目前可先從/u,
  /目前資料收集集中在/u,
  /若要寫成更完整/u,
  /仍建議再補充/u,
  /目前來源集中於/u,
  /目前可先追問/u,
  /目前資料能支持初步整理/u,
];

type ReportSectionPlanId =
  | "abstract"
  | "introduction"
  | "research_question"
  | "literature_review"
  | "methodology"
  | "findings"
  | "discussion"
  | "limitations"
  | "conclusion";

interface PipelineEvidenceCard extends ReportWriterEvidenceCard {
  title: string;
  sourceType: string;
  reliability: string;
  mainClaim: string;
  usableEvidence: string;
  limitations: string[];
  sectionTargets: ReportSectionPlanId[];
  derivation: string | null;
  evidenceGrounding: string | null;
  summaryStructuredStatus: string | null;
  llmSummaryStatus: string | null;
  abstractOnly: boolean;
}

interface SectionEvidenceMapEntry {
  sectionId: ReportSectionPlanId;
  title: string;
  paragraphPurpose: string;
  evidenceCards: PipelineEvidenceCard[];
  evidenceGaps: string[];
  supportLevel: "strong" | "partial" | "limited";
}

interface ParagraphPlan {
  id: string;
  section: ReportSectionPlanId;
  paragraphPurpose: string;
  topicSentence: string;
  evidenceIds: string[];
  citationPlan: string[];
  synthesisGoal: string;
  limitationOrTransition: string;
}

interface DraftParagraph {
  sectionId: ReportSectionPlanId;
  text: string;
  evidenceIds: string[];
  citationIds: string[];
  warnings: string[];
}

interface CitationValidationResult {
  warnings: string[];
  sectionWarnings: Map<ReportSectionPlanId, string[]>;
}

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((value) => cleanText(value)).filter(Boolean)),
  );
}

function truncateText(value: string, limit = 180): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function cleanFragment(value: string | null | undefined): string {
  return cleanText(value).replace(/[。！？.!?；，、\s]+$/u, "");
}

function localizeAcademicPhrases(value: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/orientation estimation/giu, "姿態估計"],
    [/attitude estimation/giu, "姿態估計"],
    [/sensor fusion/giu, "感測器融合"],
    [/micromachined gyroscope/giu, "微機電陀螺儀"],
    [/inertial measurement units?/giu, "慣性量測單元"],
    [/\bIMU\b/gu, "慣性量測單元"],
    [/gyroscope/giu, "陀螺儀"],
    [/navigation/giu, "導航"],
    [/rigid body dynamics/giu, "剛體動力學"],
    [/angular momentum/giu, "角動量"],
    [/rotational stability/giu, "旋轉穩定性"],
    [/gyroscopic stability/giu, "陀螺穩定性"],
    [/precession/giu, "進動"],
    [/torque/giu, "扭矩"],
    [/spinning top/giu, "陀螺"],
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function metadataText(source: SourceRecord, key: string): string {
  const value = (source as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? cleanText(value) : "";
}

function metadataStringList(source: SourceRecord, key: string): string[] {
  const value = (source as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? cleanText(item) : ""))
    .filter(Boolean);
}

function reliabilityScore(card: ReportWriterEvidenceCard): number {
  const scored = [
    card.finalScore,
    card.sourceQualityScore,
    card.relevanceScore,
  ].find((value) => typeof value === "number" && Number.isFinite(value));
  if (typeof scored === "number") return scored;
  if (card.reliability === "高" || card.reliability === "high") return 85;
  if (card.reliability === "中" || card.reliability === "medium") return 68;
  if (card.reliability === "低" || card.reliability === "low") return 45;
  return 55;
}

function reliabilityLabel(card: ReportWriterEvidenceCard): string {
  const score = reliabilityScore(card);
  if (score >= 80) return "高";
  if (score >= 60) return "中";
  return "有限";
}

function sourceTypeLabel(source: SourceRecord): string {
  if (source.sourceKind === "journal" || source.sourceKind === "conference" || source.doi) {
    return "academic";
  }
  if (source.sourceType) return source.sourceType;
  return source.provider || "unknown";
}

function mapWorkflowSectionsToReportSections(
  usableSections: string[],
): ReportSectionPlanId[] {
  const mapped = new Set<ReportSectionPlanId>();
  for (const section of usableSections) {
    switch (section) {
      case "研究背景":
        mapped.add("abstract");
        mapped.add("introduction");
        mapped.add("research_question");
        break;
      case "文獻探討":
        mapped.add("abstract");
        mapped.add("research_question");
        mapped.add("literature_review");
        mapped.add("discussion");
        mapped.add("conclusion");
        break;
      case "研究方法":
        mapped.add("methodology");
        mapped.add("limitations");
        break;
      case "數據分析":
        mapped.add("abstract");
        mapped.add("findings");
        mapped.add("discussion");
        mapped.add("conclusion");
        break;
      case "結論":
        mapped.add("discussion");
        mapped.add("limitations");
        mapped.add("conclusion");
        break;
      default:
        break;
    }
  }
  return Array.from(mapped);
}

function normalizePipelineEvidenceCard(
  card: ReportWriterEvidenceCard,
  source: SourceRecord | undefined,
): PipelineEvidenceCard {
  const title = cleanText(card.title || card.sourceTitle || source?.title) || "標題待確認";
  const mainClaim =
    cleanText(card.mainClaim || card.claim || card.summary || source?.snippet || source?.abstract) ||
    `此來源可作為「${title}」的初步佐證。`;
  const usableEvidence =
    cleanText(card.usableEvidence || card.evidence || card.summary || source?.abstract || source?.snippet) ||
    `此來源目前僅保留書目資訊，尚無足夠可直接引述的摘要內容。`;
  const limitations = dedupeStrings([
    ...(card.limitations ?? []),
    card.limitation,
    card.summaryStructuredStatus && card.summaryStructuredStatus !== "success"
      ? `摘要狀態為 ${card.summaryStructuredStatus}，不可視為完整全文證據。`
      : null,
    card.derivation === "metadata-derived"
      ? "此來源目前只有書目或 metadata 線索，不能支撐細部論證。"
      : null,
    card.derivation === "abstract-derived"
      ? "此來源目前主要依摘要整理，不能誇大成全文或實驗細節。"
      : null,
  ]);
  const sectionTargets = dedupeStrings([
    ...(card.sectionTargets ?? []),
    ...mapWorkflowSectionsToReportSections(card.usableSections ?? []),
  ]).filter((section): section is ReportSectionPlanId =>
    SECTION_PLAN.some((item) => item.sectionId === section),
  );
  const derivation = cleanText(card.derivation) || null;
  const evidenceGrounding = cleanText(card.evidenceGrounding) || null;
  const summaryStructuredStatus = cleanText(card.summaryStructuredStatus) || null;
  const llmSummaryStatus = cleanText(card.llmSummaryStatus) || null;
  const abstractOnly =
    derivation === "abstract-derived" ||
    derivation === "metadata-derived" ||
    evidenceGrounding === "abstract_only" ||
    evidenceGrounding === "metadata_only" ||
    summaryStructuredStatus === "insufficient_sources";

  return {
    ...card,
    title,
    sourceType: cleanText(card.sourceType) || sourceTypeLabel(source ?? ({} as SourceRecord)),
    reliability: cleanText(card.reliability) || reliabilityLabel(card),
    mainClaim,
    usableEvidence,
    limitations,
    sectionTargets:
      sectionTargets.length > 0
        ? sectionTargets
        : ["abstract", "introduction", "literature_review", "limitations"],
    derivation,
    evidenceGrounding,
    summaryStructuredStatus,
    llmSummaryStatus,
    abstractOnly,
  };
}

function topicConceptGaps(topic: string, cards: PipelineEvidenceCard[]): string[] {
  const understanding = understandTopicHeuristically({ topic });
  const evidenceText = cards
    .map((card) =>
      cleanText(
        [
          card.title,
          card.mainClaim,
          card.usableEvidence,
          card.relevance,
          card.summary,
        ].join(" "),
      ).toLowerCase(),
    )
    .join(" ");
  const angleGaps = understanding.researchAngles
    .slice(0, 4)
    .filter((angle) => {
      const patterns = [
        angle.title,
        angle.angle,
        ...angle.searchQueries,
      ]
        .map((term) => cleanText(term).toLowerCase())
        .filter((term) => term.length >= 2)
        .slice(0, 12);
      if (patterns.length === 0) return false;
      return !patterns.some((pattern) => evidenceText.includes(pattern));
    })
    .map((angle) => angle.title);

  if (angleGaps.length > 0) return angleGaps;

  const conceptTerms = understanding.coreConcepts
    .map((concept) => cleanText(concept).toLowerCase())
    .filter((concept) => concept.length >= 2);
  const missingConcepts = conceptTerms.filter((concept) => !evidenceText.includes(concept));
  return missingConcepts.slice(0, 4);
}

function sectionCardsFromTargets(
  sectionId: ReportSectionPlanId,
  cards: PipelineEvidenceCard[],
): PipelineEvidenceCard[] {
  const direct = cards.filter((card) => card.sectionTargets.includes(sectionId));
  if (direct.length > 0) return direct;

  switch (sectionId) {
    case "methodology":
      return cards.slice(0, 3);
    case "limitations":
      return cards
        .filter((card) => card.limitations.length > 0 || card.abstractOnly)
        .slice(0, 4);
    case "conclusion":
      return cards.filter((card) => card.sectionTargets.includes("findings")).slice(0, 4);
    case "discussion":
      return cards
        .filter(
          (card) =>
            card.sectionTargets.includes("findings") ||
            card.sectionTargets.includes("literature_review"),
        )
        .slice(0, 4);
    default:
      return cards.slice(0, 3);
  }
}

function supportLevelForSection(cards: PipelineEvidenceCard[]): "strong" | "partial" | "limited" {
  if (cards.length >= 3 && cards.some((card) => reliabilityScore(card) >= 80)) return "strong";
  if (cards.length >= 1) return "partial";
  return "limited";
}

function buildSectionEvidenceMap(
  topic: string,
  cards: PipelineEvidenceCard[],
): SectionEvidenceMapEntry[] {
  const conceptGaps = topicConceptGaps(topic, cards);
  return SECTION_PLAN.map((section) => {
    const evidenceCards = sectionCardsFromTargets(section.sectionId, cards).slice(0, 4);
    const supportLevel = supportLevelForSection(evidenceCards);
    const evidenceGaps: string[] = [];
    if (supportLevel === "limited") {
      evidenceGaps.push(`此章目前缺少可直接支撐「${section.title}」的高相關證據。`);
    }
    if (
      ["literature_review", "findings", "discussion", "limitations", "conclusion"].includes(
        section.sectionId,
      ) &&
      conceptGaps.length > 0
    ) {
      evidenceGaps.push(`尚缺 ${conceptGaps.slice(0, 3).join("、")} 的直接來源。`);
    }
    if (evidenceCards.some((card) => card.abstractOnly)) {
      evidenceGaps.push("部分來源僅依摘要整理，不能誇大成全文論證。");
    }
    return {
      sectionId: section.sectionId,
      title: section.title,
      paragraphPurpose: section.instruction,
      evidenceCards,
      evidenceGaps: dedupeStrings(evidenceGaps),
      supportLevel,
    };
  });
}

function themesFromCards(cards: PipelineEvidenceCard[], limit = 3): string[] {
  return dedupeStrings(
    cards.flatMap((card) => [
      /^(研究背景|文獻探討|研究方法|數據分析|結論|資料背景)$/u.test(cleanText(card.relevance))
        ? null
        : cleanFragment(card.relevance),
      cleanFragment(card.usableEvidence),
      cleanFragment(card.mainClaim),
    ]),
  ).map((value) => truncateText(value, 60)).slice(0, limit);
}

function buildParagraphPlans(
  topic: string,
  sectionEvidenceMap: SectionEvidenceMapEntry[],
): ParagraphPlan[] {
  return sectionEvidenceMap.map((entry) => {
    const themes = themesFromCards(entry.evidenceCards);
    const evidenceIds = entry.evidenceCards.map((card) => card.id);
    const citationPlan = dedupeStrings(entry.evidenceCards.map((card) => card.sourceId));
    const themeText = themes.length > 0 ? themes.join("、") : "現有可驗證資料";
    const supportText =
      entry.supportLevel === "strong"
        ? "可形成較完整的證據整合"
        : entry.supportLevel === "partial"
          ? "可形成受限但可追溯的初步整合"
          : "只能形成受限草稿並強調資料缺口";
    const topicSentenceBySection: Record<ReportSectionPlanId, string> = {
      abstract: `本稿以「${topic}」為核心，整理目前已接受來源能直接支持的論點、限制與後續補證方向。`,
      introduction: `研究「${topic}」的前提，是先界定現有證據真正覆蓋的背景與討論邊界。`,
      research_question: `依現有證據分布，本報告將「${topic}」整理為可蒐證的核心研究問題。`,
      literature_review: `現有文獻較能支撐「${topic}」在 ${themeText} 等面向的既有觀點與應用脈絡。`,
      methodology: `本報告採用來源篩選、摘要比對與 evidence card 整理方式建立「${topic}」的證據基礎。`,
      findings: `綜合已接受來源，「${topic}」目前較有證據支撐的重點集中在 ${themeText}。`,
      discussion: `把目前證據放在一起判讀後，可區分「${topic}」已有支撐的面向與仍待補證的部分。`,
      limitations: `現階段「${topic}」的限制不在於能否提出問題，而在於哪些核心概念仍缺乏直接來源。`,
      conclusion: `依現有證據，「${topic}」只能形成保守結論，並需把未被證據覆蓋的部分明確保留下來。`,
    };

    return {
      id: `${entry.sectionId}:plan:1`,
      section: entry.sectionId,
      paragraphPurpose: entry.paragraphPurpose,
      topicSentence: topicSentenceBySection[entry.sectionId],
      evidenceIds,
      citationPlan,
      synthesisGoal: `${supportText}；本段優先整合 ${themeText}，而不是逐篇摘要來源標題。`,
      limitationOrTransition:
        entry.evidenceGaps[0] ??
        (entry.supportLevel === "limited"
          ? "本段只能維持受限草稿。"
          : "段末需交代哪些結論仍需補充來源。"),
    };
  });
}

function sourceOrdinalMap(sources: SourceRecord[]): Map<string, number> {
  return new Map(
    sources
      .map((source, index) => [source.id, index + 1] as const)
      .filter(([id]) => Boolean(id)),
  );
}

function citationMarker(
  citationIds: string[],
  sourceOrdinals: Map<string, number>,
): string {
  const labels = citationIds
    .map((id) => sourceOrdinals.get(id))
    .filter((value): value is number => typeof value === "number")
    .map((value) => `來源 ${value}`);
  return labels.length > 0 ? `（${labels.join("、")}）` : "";
}

function conciseCardPoint(card: PipelineEvidenceCard): string {
  return truncateText(
    cleanFragment(card.usableEvidence || card.summary || card.mainClaim || card.title),
    72,
  );
}

function proseJoin(items: string[]): string {
  const fragments = items.map((item) => cleanFragment(item)).filter(Boolean);
  if (fragments.length === 0) return "";
  if (fragments.length === 1) return fragments[0]!;
  if (fragments.length === 2) return `${fragments[0]}與${fragments[1]}`;
  return `${fragments.slice(0, -1).join("、")}，以及${fragments[fragments.length - 1]}`;
}

function renderDraftParagraphs(
  topic: string,
  plans: ParagraphPlan[],
  cards: PipelineEvidenceCard[],
  sources: SourceRecord[],
): DraftParagraph[] {
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const sourceOrdinals = sourceOrdinalMap(sources);

  return plans.map((plan) => {
    const planCards = plan.evidenceIds
      .map((id) => cardById.get(id))
      .filter((card): card is PipelineEvidenceCard => Boolean(card));
    const citationIds = dedupeStrings(plan.citationPlan);
    const marker = citationMarker(citationIds, sourceOrdinals);
    const warnings: string[] = [];
    const evidencePoints = dedupeStrings(planCards.map(conciseCardPoint)).slice(0, 3);
    const limitationNotes = dedupeStrings(planCards.flatMap((card) => card.limitations)).slice(0, 2);

    let text = plan.topicSentence;
    switch (plan.section) {
      case "abstract":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `目前較能直接支撐的內容集中在${proseJoin(evidencePoints)}${marker}。`
            : "目前尚無足夠證據形成正式摘要，只能標示研究範圍與待補資料。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "introduction":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `現有來源把討論重點帶向${proseJoin(evidencePoints)}${marker}，因此本報告會以這些已被資料觸及的面向作為背景起點。`
            : "目前背景來源不足，因此本段只界定研究範圍，不把未補證的直覺判斷寫成正式背景論點。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "research_question":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `依證據分布，可優先追問三個方向：${evidencePoints
                .slice(0, 3)
                .map((point, index) => `${index + 1}. ${point}`)
                .join("；")}${marker}。`
            : "由於現有證據不足，本節暫不把未被來源覆蓋的疑問寫成可回答的正式研究問題。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "literature_review":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `綜合不同來源，可先整理出${proseJoin(evidencePoints)}等觀點，顯示文獻目前較集中於這些可被摘要驗證的面向${marker}。`
            : "現有文獻證據尚不足以形成有效比較，因此本節只保留待補的理論與資料面向。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "methodology":
        text = [
          plan.topicSentence,
          `本輪正文只使用已接受來源與對應 evidence cards，不把沒有 evidenceId 的想法寫成正式段落${marker}。`,
          limitationNotes.length > 0
            ? `方法限制包括${proseJoin(limitationNotes)}。`
            : plan.limitationOrTransition,
        ].join("");
        break;
      case "findings":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `跨來源整合後，較可成立的發現是${proseJoin(evidencePoints)}${marker}；這些內容可以作為正文主軸，但不代表所有理論面都已被完整覆蓋。`
            : "目前尚無足夠直接證據可形成主要發現，本節僅能列出待補的資料方向。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "discussion":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `現有證據之間較一致支持${proseJoin(evidencePoints)}${marker}，但若要把這些工程或應用資料外推成完整理論結論，仍需補上更直接的基礎文獻。`
            : "由於缺少足夠證據，本節不把可能的解釋寫成定論，而是保留為待驗證假設。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "limitations":
        text = [
          plan.topicSentence,
          limitationNotes.length > 0
            ? `目前最明顯的限制包括${proseJoin(limitationNotes)}${marker}。`
            : "目前限制主要來自來源數量與可驗證摘要不足。",
          plan.limitationOrTransition,
        ].join("");
        break;
      case "conclusion":
        text = [
          plan.topicSentence,
          evidencePoints.length > 0
            ? `因此，本報告只能保守地說明${proseJoin(evidencePoints)}${marker}已獲得一定支撐；其餘未被直接證據覆蓋的部分，應列為下一輪補證重點。`
            : "由於核心證據不足，現階段不形成完整結論，只保留後續補證方向。",
          plan.limitationOrTransition,
        ].join("");
        break;
    }

    if (plan.evidenceIds.length === 0) {
      warnings.push("本段沒有 evidenceIds，只能視為受限草稿。");
    }

    return {
      sectionId: plan.section,
      text,
      evidenceIds: plan.evidenceIds,
      citationIds,
      warnings: dedupeStrings(warnings),
    };
  });
}

function validateDraftParagraphs(
  paragraphs: DraftParagraph[],
  cards: PipelineEvidenceCard[],
  sources: SourceRecord[],
): CitationValidationResult {
  const warnings: string[] = [];
  const sectionWarnings = new Map<ReportSectionPlanId, string[]>();
  const allowedSourceIds = new Set(sources.map((source) => source.id).filter(Boolean));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const usedEvidenceIds = new Set<string>();

  const pushSectionWarning = (sectionId: ReportSectionPlanId, message: string) => {
    const existing = sectionWarnings.get(sectionId) ?? [];
    existing.push(message);
    sectionWarnings.set(sectionId, dedupeStrings(existing));
  };

  for (const paragraph of paragraphs) {
    if (paragraph.evidenceIds.length === 0) {
      pushSectionWarning(paragraph.sectionId, "段落沒有 evidenceIds 支撐，只能視為受限草稿。");
    }
    const invalidEvidenceIds = paragraph.evidenceIds.filter((id) => !cardById.has(id));
    if (invalidEvidenceIds.length > 0) {
      pushSectionWarning(
        paragraph.sectionId,
        `包含不存在的 evidenceIds：${invalidEvidenceIds.join("、")}`,
      );
    }
    const invalidCitationIds = paragraph.citationIds.filter((id) => !allowedSourceIds.has(id));
    if (invalidCitationIds.length > 0) {
      pushSectionWarning(
        paragraph.sectionId,
        `包含不存在於 acceptedSources 的 citationIds：${invalidCitationIds.join("、")}`,
      );
    }
    const referencedCards = paragraph.evidenceIds
      .map((id) => cardById.get(id))
      .filter((card): card is PipelineEvidenceCard => Boolean(card));
    referencedCards.forEach((card) => usedEvidenceIds.add(card.id));
    if (
      referencedCards.length > 0 &&
      referencedCards.every((card) => card.abstractOnly) &&
      /證明|證實|必然|完全|已經確定/u.test(paragraph.text)
    ) {
      pushSectionWarning(
        paragraph.sectionId,
        "本段使用了偏強的結論語氣，但引用來源主要只有摘要或 metadata。",
      );
    }
  }

  const unusedCards = cards.filter((card) => !usedEvidenceIds.has(card.id));
  if (unusedCards.length > 0) {
    warnings.push(
      `尚有 ${unusedCards.length} 張 evidenceCard 未被正文合理使用：${unusedCards
        .slice(0, 4)
        .map((card) => card.id)
        .join("、")}`,
    );
  }

  for (const [sectionId, sectionMessages] of sectionWarnings) {
    warnings.push(`${sectionId}：${sectionMessages.join("；")}`);
  }

  return {
    warnings: dedupeStrings(warnings),
    sectionWarnings,
  };
}

function sectionMapToText(
  sectionEvidenceMap: SectionEvidenceMapEntry[],
): string {
  return sectionEvidenceMap
    .map((entry) =>
      [
        `${entry.sectionId}: ${entry.title}`,
        `supportLevel: ${entry.supportLevel}`,
        `evidenceIds: ${entry.evidenceCards.map((card) => card.id).join(", ") || "none"}`,
        `evidenceGaps: ${entry.evidenceGaps.join("；") || "none"}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function paragraphPlansToText(plans: ParagraphPlan[]): string {
  return plans
    .map((plan) =>
      JSON.stringify(
        {
          section: plan.section,
          paragraphPurpose: plan.paragraphPurpose,
          topicSentence: plan.topicSentence,
          evidenceIds: plan.evidenceIds,
          citationPlan: plan.citationPlan,
          synthesisGoal: plan.synthesisGoal,
          limitationOrTransition: plan.limitationOrTransition,
        },
        null,
        2,
      ),
    )
    .join("\n\n");
}

function buildDeterministicSections(
  paragraphs: DraftParagraph[],
): ReportWriterSection[] {
  const planById = new Map(SECTION_PLAN.map((section) => [section.sectionId, section]));
  return paragraphs.map((paragraph) => ({
    sectionId: paragraph.sectionId,
    title: planById.get(paragraph.sectionId)?.title ?? paragraph.sectionId,
    prose: paragraph.text,
    evidenceCardIds: paragraph.evidenceIds,
    citationIds: paragraph.citationIds,
    warnings: paragraph.warnings,
  }));
}

function shouldKeepLlmSection(section: ReportWriterSection): boolean {
  if (section.evidenceCardIds.length === 0 && section.citationIds.length === 0) return false;
  return !GENERIC_SECTION_PATTERNS.some((pattern) => pattern.test(section.prose));
}

function mergeSectionsWithDeterministicBaseline(
  llmSections: ReportWriterSection[],
  baselineSections: ReportWriterSection[],
  validation: CitationValidationResult,
): ReportWriterSection[] {
  const llmById = new Map(llmSections.map((section) => [section.sectionId, section]));
  return baselineSections.map((baseline) => {
    const candidate = llmById.get(baseline.sectionId);
    const sectionWarnings = validation.sectionWarnings.get(
      baseline.sectionId as ReportSectionPlanId,
    ) ?? [];
    if (!candidate || !shouldKeepLlmSection(candidate)) {
      return {
        ...baseline,
        warnings: dedupeStrings([...(baseline.warnings ?? []), ...sectionWarnings]),
      };
    }
    return {
      ...baseline,
      ...candidate,
      evidenceCardIds:
        candidate.evidenceCardIds.length > 0
          ? candidate.evidenceCardIds
          : baseline.evidenceCardIds,
      citationIds:
        candidate.citationIds.length > 0 ? candidate.citationIds : baseline.citationIds,
      warnings: dedupeStrings([...(candidate.warnings ?? []), ...sectionWarnings]),
    };
  });
}

function positiveEnvNumber(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function compactEvidenceText(source: SourceRecord): string {
  const abstract = cleanText(source.abstract) || cleanText(source.snippet);
  if (abstract) {
    const firstSentence = abstract.split(/(?<=[.!?。！？])\s+/u)[0]?.trim();
    if (firstSentence) return truncateText(localizeAcademicPhrases(firstSentence), 220);
    return truncateText(localizeAcademicPhrases(abstract), 220);
  }
  const locator = source.doi ? `DOI：${source.doi}` : source.url;
  return locator ? `來源位置：${locator}` : "此來源已接受，但仍缺少可驗證的重點摘錄。";
}

function sourceText(source: SourceRecord, index: number): string {
  const id = source.id || `source-${index + 1}`;
  const title = source.title || "標題待確認";
  const abstract = source.abstract?.trim() || "摘要不足";
  const citation = source.authors?.[0]?.trim() || source.publisher?.trim() || "作者待確認";
  return [
    `evidenceCardId: evidence:${id}:0`,
    `sourceId: ${id}`,
    `claim: 此來源可作為「${title}」的摘要型佐證。`,
    `evidence: ${abstract.slice(0, 700)}`,
    `source: ${title}`,
    `provider: ${source.sourceType}`,
    `citationText: ${citation}（${source.year ?? "年份待確認"}）`,
    `limitation: ${source.abstract?.trim() ? "目前依摘要整理，尚未讀取全文。" : "此來源尚無摘要，僅可建立書目線索。"}`,
  ].join("\n");
}

function compactEvidenceCard(
  card: ReportWriterEvidenceCard,
  index: number,
  evidenceLimit = PRIMARY_EVIDENCE_TEXT_LIMIT,
): string {
  return [
    `evidenceCardId: ${card.id || `evidence-${index + 1}`}`,
    `sourceId: ${card.sourceId}`,
    `title: ${card.title || card.sourceTitle || "標題待確認"}`,
    `sourceType: ${card.sourceType || card.sourceProvider || "unknown"}`,
    `reliability: ${card.reliability || reliabilityLabel(card)}`,
    `mainClaim: ${card.mainClaim || card.claim || "證據重點待補"}`,
    `usableEvidence: ${(card.usableEvidence || card.evidence || card.summary || "證據摘要不足").slice(0, evidenceLimit)}`,
    `claim: ${card.claim || card.mainClaim || "證據重點待補"}`,
    `evidence: ${(card.evidence || card.usableEvidence || card.summary || "證據摘要不足").slice(0, evidenceLimit)}`,
    `relevance: ${card.relevance || "研究背景"}`,
    `source: ${card.sourceTitle || "標題待確認"}`,
    `provider: ${card.provider || card.sourceProvider || "unknown"}`,
    `sectionTargets: ${(card.sectionTargets ?? []).join(", ") || (card.usableSections ?? []).join(", ") || "none"}`,
    `citationText: ${card.citationText || "引用資訊待確認"}`,
    `limitation: ${(card.limitations ?? []).join("；") || card.limitation || "目前依已接受來源與證據卡整理，不可超出證據內容。"}`,
  ].join("\n");
}

function compactAcceptedSource(
  source: SourceRecord,
  index: number,
  abstractLimit = PRIMARY_SOURCE_TEXT_LIMIT,
): string {
  const id = source.id || `source-${index + 1}`;
  const abstract = source.abstract?.trim() || source.snippet?.trim() || "摘要不足";
  return [
    `sourceId: ${id}`,
    `title: ${source.title || "標題待確認"}`,
    `authors: ${source.authors.length ? source.authors.join(", ") : "作者待確認"}`,
    `year: ${source.year ?? "年份待確認"}`,
    `provider: ${source.provider || source.sourceType}`,
    `sourceType: ${source.sourceType}`,
    `doi: ${source.doi ?? "n/a"}`,
    `url: ${source.url ?? "n/a"}`,
    `abstractOrSnippet: ${abstract.slice(0, abstractLimit)}`,
    `metadata: relevance=${source.relevanceScore ?? source.topicRelevance ?? "n/a"}, quality=${source.sourceQualityScore ?? source.evidenceQuality ?? "n/a"}, grounding=${source.evidenceGrounding ?? "n/a"}`,
    `recommendation: ${source.recommendation ?? (source.shouldRecommendAccept ? "candidate" : "review")}`,
  ].join("\n");
}

function fallbackClaimFromSource(source: SourceRecord, title: string): string {
  return (
    cleanFragment(metadataText(source, "evidenceSummaryZhTw")) ||
    cleanFragment(metadataText(source, "sourceRelevanceReasonZhTw")) ||
    cleanFragment(localizeAcademicPhrases(cleanText(source.abstract))) ||
    cleanFragment(localizeAcademicPhrases(cleanText(source.snippet))) ||
    `此來源可作為「${title}」的書目線索`
  );
}

function fallbackEvidenceCards(sources: SourceRecord[]): ReportWriterEvidenceCard[] {
  return sources.map((source, index) => {
    const id = source.id || `source-${index + 1}`;
    const title = source.title || "標題待確認";
    const abstract = source.abstract?.trim() || "此來源尚無摘要，僅可作為書目線索。";
    const citation = source.authors?.[0]?.trim() || source.publisher?.trim() || "作者待確認";
    const mainClaim = fallbackClaimFromSource(source, title);
    const usableEvidence = compactEvidenceText(source);
    const derivation = source.abstract?.trim() ? "abstract-derived" : "metadata-derived";
    const sourceRelevance = metadataText(source, "mainEvidenceFacet") || metadataText(source, "sourceRelevanceReasonZhTw");
    const usableSections = metadataStringList(source, "usableSections");
    return {
      id: `evidence:${id}:0`,
      sourceId: id,
      title,
      sourceType: source.sourceType,
      reliability: metadataText(source, "confidence") || reliabilityLabel({
        id: `evidence:${id}:0`,
        sourceId: id,
        claim: mainClaim,
        evidence: usableEvidence,
        summary: abstract,
        relevance: sourceRelevance || "研究背景",
        sourceTitle: title,
        sourceProvider: source.sourceType,
        doi: source.doi,
        abstract: source.abstract,
        provider: source.provider || source.sourceType,
        relevanceScore: source.relevanceScore ?? null,
        sourceQualityScore: source.sourceQualityScore ?? null,
        finalScore: source.finalScore ?? null,
        year: source.year,
        usableSections,
        citationText: `${citation}（${source.year ?? "年份待確認"}）`,
        limitation: source.abstract?.trim()
          ? "目前依摘要整理，尚未讀取全文。"
          : "此來源尚無摘要，僅可建立書目線索。",
      }),
      claim: mainClaim,
      mainClaim,
      evidence: usableEvidence,
      usableEvidence,
      summary: cleanText(metadataText(source, "evidenceSummaryZhTw")) || abstract,
      relevance: sourceRelevance || "研究背景",
      limitations: [
        source.abstract?.trim()
          ? "目前依摘要整理，尚未讀取全文。"
          : "此來源尚無摘要，僅可建立書目線索。",
      ],
      sectionTargets: mapWorkflowSectionsToReportSections(usableSections),
      sourceTitle: title,
      sourceProvider: source.sourceType,
      doi: source.doi,
      abstract: source.abstract,
      provider: source.provider || source.sourceType,
      relevanceScore: source.relevanceScore ?? null,
      sourceQualityScore: source.sourceQualityScore ?? null,
      finalScore: source.finalScore ?? null,
      year: source.year,
      usableSections,
      citationText: `${citation}（${source.year ?? "年份待確認"}）`,
      limitation: source.abstract?.trim()
        ? "目前依摘要整理，尚未讀取全文。"
        : "此來源尚無摘要，僅可建立書目線索。",
      derivation,
      evidenceGrounding: source.abstract?.trim() ? "abstract_only" : "metadata_only",
    };
  });
}

function validEvidenceCards(
  inputCards: ReportWriterEvidenceCard[] | undefined,
  sources: SourceRecord[],
): ReportWriterEvidenceCard[] {
  const acceptedSourceIds = new Set(
    sources.map((source, index) => source.id || `source-${index + 1}`),
  );
  const cards = (inputCards ?? []).filter(
    (card) =>
      card?.id?.trim() &&
      card?.sourceId?.trim() &&
      acceptedSourceIds.has(card.sourceId) &&
      (card.evidence?.trim() || card.summary?.trim() || card.claim?.trim()),
  );
  return cards.length ? cards : fallbackEvidenceCards(sources);
}

function pipelineEvidenceCards(
  inputCards: ReportWriterEvidenceCard[] | undefined,
  sources: SourceRecord[],
): PipelineEvidenceCard[] {
  const validCards = validEvidenceCards(inputCards, sources);
  const sourceById = new Map(
    sources
      .map((source, index) => [source.id || `source-${index + 1}`, source] as const)
      .filter(([id]) => Boolean(id)),
  );
  return validCards.map((card) =>
    normalizePipelineEvidenceCard(card, sourceById.get(card.sourceId)),
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}

function sanitizeSection(
  value: unknown,
  evidenceToSource: Map<string, string>,
  allowedSourceIds: Set<string>,
): ReportWriterSection | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const sectionId = typeof data.sectionId === "string" ? data.sectionId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const prose = typeof data.prose === "string" ? data.prose.trim() : "";
  const evidenceCardIds = stringList(
    data.evidenceCardIds ?? data.evidence_card_ids ?? data.evidenceIds,
  ).filter((id) => evidenceToSource.has(id));
  const citationIds = stringList(data.citationIds)
    .map((id) => evidenceToSource.get(id) ?? id)
    .filter((id) => allowedSourceIds.has(id));
  const mappedCitationIds =
    citationIds.length > 0
      ? citationIds
      : evidenceCardIds
          .map((id) => evidenceToSource.get(id))
          .filter((id): id is string => Boolean(id));
  const warnings = stringList(data.warnings);
  if (
    !sectionId ||
    !title ||
    prose.length < 20 ||
    (evidenceCardIds.length === 0 && mappedCitationIds.length === 0)
  ) {
    return null;
  }
  return {
    sectionId,
    title,
    prose,
    evidenceCardIds,
    citationIds: Array.from(new Set(mappedCitationIds)),
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function sectionItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.sections)) return data.sections;
  }
  return [];
}

function cleanHeadingText(value: string): string {
  return value
    .replace(/^[#*\-\s]+/u, "")
    .replace(/[：:]\s*$/u, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleAliasesForSection(sectionId: string): string[] {
  switch (sectionId) {
    case "abstract":
      return ["摘要", "abstract", "研究摘要"];
    case "introduction":
      return ["一、研究背景與動機", "一、研究動機", "研究動機", "研究背景", "研究背景與動機", "前言", "導論"];
    case "research_question":
      return ["二、研究問題", "研究問題", "問題意識", "研究提問"];
    case "literature_review":
      return ["三、文獻探討", "文獻探討", "文獻回顧", "相關研究"];
    case "methodology":
      return ["四、研究方法", "研究方法", "方法", "資料來源與方法"];
    case "findings":
      return ["五、主要發現", "四、資料與證據整理", "資料與證據整理", "主要發現", "研究發現", "結果"];
    case "discussion":
      return ["六、討論", "五、討論", "討論", "分析與討論"];
    case "limitations":
      return ["七、限制", "限制", "研究限制", "方法限制"];
    case "conclusion":
      return ["八、結論與建議", "六、結論與建議", "結論與建議", "結論", "建議"];
    default:
      return [];
  }
}

function matchSectionIdFromHeading(
  heading: string,
): { sectionId: string; matchedAlias: string } | null {
  const normalizedHeading = cleanHeadingText(heading);
  for (const section of SECTION_PLAN) {
    const aliases = [section.title, ...titleAliasesForSection(section.sectionId)];
    for (const alias of aliases) {
      const normalizedAlias = cleanHeadingText(alias);
      if (
        normalizedHeading === normalizedAlias ||
        normalizedHeading.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedHeading)
      ) {
        return { sectionId: section.sectionId, matchedAlias: alias };
      }
    }
  }
  return null;
}

function fallbackSectionsFromFreeformText(
  text: string,
  evidenceCards: ReportWriterEvidenceCard[],
  allowedSourceIds: Set<string>,
): ReportWriterSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const defaultEvidenceCardIds = evidenceCards.slice(0, 4).map((card) => card.id);
  const defaultCitationIds = Array.from(
    new Set(
      evidenceCards
        .slice(0, 4)
        .map((card) => card.sourceId)
      .filter((id) => allowedSourceIds.has(id)),
    ),
  );
  const sections: ReportWriterSection[] = [];
  let activeSectionId: string | null = null;
  let activeTitle = "";
  let buffer: string[] = [];

  const flush = () => {
    if (!activeSectionId) return;
    const prose = buffer.join("\n\n").trim();
    if (prose.length < 20) {
      activeSectionId = null;
      activeTitle = "";
      buffer = [];
      return;
    }
    sections.push({
      sectionId: activeSectionId,
      title: activeTitle,
      prose,
      evidenceCardIds: defaultEvidenceCardIds,
      citationIds: defaultCitationIds,
    });
    activeSectionId = null;
    activeTitle = "";
    buffer = [];
  };

  const lines = trimmed
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim());

  for (const line of lines) {
    if (!line) {
      if (activeSectionId && buffer.at(-1) !== "") buffer.push("");
      continue;
    }

    const headingMatch = matchSectionIdFromHeading(line);
    if (headingMatch) {
      flush();
      activeSectionId = headingMatch.sectionId;
      activeTitle =
        SECTION_PLAN.find((section) => section.sectionId === headingMatch.sectionId)?.title ??
        line;
      const remainder = line
        .replace(new RegExp(`^${escapeRegExp(headingMatch.matchedAlias)}[：:]?`, "iu"), "")
        .trim();
      if (remainder) buffer.push(remainder);
      continue;
    }

    const inlineHeading = SECTION_PLAN
      .flatMap((section) =>
        [section.title, ...titleAliasesForSection(section.sectionId)].map((alias) => ({
          alias,
          sectionId: section.sectionId,
        })),
      )
      .find(({ alias }) => new RegExp(`^${alias}[：:]`, "iu").test(line));

    if (inlineHeading) {
      flush();
      activeSectionId = inlineHeading.sectionId;
      activeTitle =
        SECTION_PLAN.find((section) => section.sectionId === inlineHeading.sectionId)?.title ??
        inlineHeading.alias;
      buffer.push(
        line.replace(new RegExp(`^${escapeRegExp(inlineHeading.alias)}[：:]`, "iu"), "").trim(),
      );
      continue;
    }

    if (activeSectionId) {
      buffer.push(line);
    }
  }
  flush();

  if (sections.length > 0) return sections;

  const paragraphs = trimmed
    .split(/\n{2,}/u)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length >= 20);
  if (paragraphs.length < 1) return [];

  return SECTION_PLAN.slice(0, paragraphs.length).map((section, index) => ({
    sectionId: section.sectionId,
    title: section.title,
    prose: paragraphs[index] ?? "",
    evidenceCardIds: defaultEvidenceCardIds,
    citationIds: defaultCitationIds,
  })).filter((section) => section.prose.length >= 20);
}

function fallbackStatus(error: unknown): ReportWriterResult["llm_status"] {
  if (!(error instanceof LlmAdapterError)) return "failed";
  if (error.code === "provider-unconfigured") return "skipped";
  if (error.code === "provider-timeout") return "timeout";
  if (error.code === "provider-quota") return "quota_exceeded";
  return "failed";
}

function fallbackWarning(error: unknown): string {
  if (error instanceof LlmAdapterError) {
    return `LLM report writer fallback (${error.code}): ${error.message}`;
  }
  if (error instanceof Error) return `LLM report writer fallback: ${error.message}`;
  return "LLM report writer fallback: unknown provider failure";
}

type ReportWriterAttemptMode = "primary" | "retry";

interface ReportWriterAttemptPrompt {
  mode: ReportWriterAttemptMode;
  sources: SourceRecord[];
  evidenceCards: PipelineEvidenceCard[];
  sectionEvidenceMap: SectionEvidenceMapEntry[];
  paragraphPlans: ParagraphPlan[];
  baselineSections: ReportWriterSection[];
}

interface ReportWriterAttemptResult {
  llmResult: Awaited<ReturnType<typeof requestLlmText>>;
  sections: ReportWriterSection[];
  recoveryMode: "none" | "partial_json" | "freeform";
  mode: ReportWriterAttemptMode;
}

function promptSourcesForEvidence(
  sources: SourceRecord[],
  evidenceCards: PipelineEvidenceCard[],
  limit: number,
): SourceRecord[] {
  const sourceById = new Map(
    sources
      .map((source) => [source.id, source] as const)
      .filter(([id]) => Boolean(id)),
  );
  const selected: SourceRecord[] = [];
  const seen = new Set<string>();

  for (const card of evidenceCards) {
    const source = sourceById.get(card.sourceId);
    const sourceId = source?.id;
    if (!source || !sourceId || seen.has(sourceId)) continue;
    selected.push(source);
    seen.add(sourceId);
    if (selected.length >= limit) return selected;
  }

  for (const source of sources) {
    const sourceId = source.id;
    if (!sourceId || seen.has(sourceId)) continue;
    selected.push(source);
    seen.add(sourceId);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildAttemptPrompt(
  input: ReportWriterInput,
  sources: SourceRecord[],
  evidenceCards: PipelineEvidenceCard[],
  sectionEvidenceMap: SectionEvidenceMapEntry[],
  paragraphPlans: ParagraphPlan[],
  baselineSections: ReportWriterSection[],
  mode: ReportWriterAttemptMode,
): ReportWriterAttemptPrompt {
  if (mode === "retry") {
    const retryEvidenceCards = evidenceCards.slice(0, RETRY_PROMPT_EVIDENCE_LIMIT);
    const retryPlanIds = new Set(retryEvidenceCards.map((card) => card.id));
    return {
      mode,
      evidenceCards: retryEvidenceCards,
      sources: promptSourcesForEvidence(
        sources,
        retryEvidenceCards,
        RETRY_PROMPT_SOURCE_LIMIT,
      ),
      sectionEvidenceMap,
      paragraphPlans: paragraphPlans.map((plan) => ({
        ...plan,
        evidenceIds: plan.evidenceIds.filter((id) => retryPlanIds.has(id)),
        citationPlan: plan.citationPlan.filter((citationId) =>
          retryEvidenceCards.some((card) => card.sourceId === citationId),
        ),
      })),
      baselineSections,
    };
  }

  const primaryEvidenceCards = evidenceCards.slice(0, PRIMARY_PROMPT_EVIDENCE_LIMIT);
  return {
    mode,
    evidenceCards: primaryEvidenceCards,
    sources: promptSourcesForEvidence(
      sources,
      primaryEvidenceCards,
      PRIMARY_PROMPT_SOURCE_LIMIT,
    ),
    sectionEvidenceMap,
    paragraphPlans,
    baselineSections,
  };
}

function recoverSectionObjectsFromPartialJson(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const sectionsMatch = trimmed.match(/"sections"\s*:\s*\[/u);
  if (!sectionsMatch?.index) {
    if (sectionsMatch?.index !== 0 && sectionsMatch?.index !== undefined) {
      // continue below
    } else if (sectionsMatch?.index === undefined) {
      return [];
    }
  }

  const matchIndex = sectionsMatch?.index;
  if (matchIndex === undefined) return [];
  const listStart = trimmed.indexOf("[", matchIndex);
  if (listStart < 0) return [];

  const objects: unknown[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = listStart + 1; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const candidate = trimmed.slice(objectStart, index + 1);
        try {
          objects.push(JSON.parse(candidate));
        } catch {
          // Ignore incomplete trailing objects and keep already recovered sections.
        }
        objectStart = -1;
      }
      continue;
    }
    if (char === "]" && depth === 0) break;
  }

  return objects;
}

function reportWriterMessages(
  input: ReportWriterInput,
  prompt: ReportWriterAttemptPrompt,
): Parameters<typeof requestLlmText>[0]["messages"] {
  const sourceTextLimit =
    prompt.mode === "retry" ? RETRY_SOURCE_TEXT_LIMIT : PRIMARY_SOURCE_TEXT_LIMIT;
  const evidenceTextLimit =
    prompt.mode === "retry" ? RETRY_EVIDENCE_TEXT_LIMIT : PRIMARY_EVIDENCE_TEXT_LIMIT;
  const systemRules =
    prompt.mode === "retry"
      ? [
          "You are ResearchForge's report writer.",
          "Return exactly one JSON object and nothing else.",
          "The first character must be { and the last character must be }.",
          "No markdown, no code fence, no English preface, no explanation.",
          "Rewrite the provided baseline report into concise formal Traditional Chinese prose using only provided evidenceCards and paragraphPlans.",
          "Do not output template sentences about data collection status unless the paragraphPlan explicitly says evidence is insufficient.",
          "If you are unsure, keep the section short and preserve limitations instead of inventing details.",
          "Schema: {\"sections\":[{\"sectionId\":\"abstract\",\"title\":\"摘要\",\"prose\":\"paragraph\",\"evidenceCardIds\":[\"evidence id\"],\"citationIds\":[\"source id\"]}]}",
        ].join(" ")
      : [
          "You are ResearchForge's report writer.",
          "Output valid JSON only. No markdown. No explanation.",
          "Rewrite the report from paragraphPlans and baseline sections using only provided evidenceCards.",
          "Do not invent statistics, authors, URLs, DOI, or citations.",
          "Every section must stay tied to the paragraphPlan evidenceIds and citationPlan.",
          "Do not output template status prose such as '目前資料收集集中在' or '若要寫成更完整'.",
          "When evidence is insufficient, explicitly state the missing concepts or source types instead of pretending the conclusion is complete.",
          "Every section needs at least one provided evidenceCardId and inline marker like （來源 1） whenever evidence exists.",
          "Do not cite ids outside provided evidenceCards or accepted sources.",
          "Schema: {\"sections\":[{\"sectionId\":\"abstract\",\"title\":\"摘要\",\"prose\":\"paragraph\",\"evidenceCardIds\":[\"evidence id\"],\"citationIds\":[\"source id\"]}]}",
        ].join(" ");

  const userRules =
    prompt.mode === "retry"
      ? [
          `topic: ${input.topic}`,
          `reportType: ${input.reportType ?? "研究報告"}`,
          `audience: ${input.audience ?? "高中"}`,
          `language: ${input.language ?? "繁體中文"}`,
          `generationMode: ${input.generationMode ?? "formal"}`,
          "Return exactly 3 sections with these ids only: abstract, findings, conclusion.",
          "Keep each section to 1 short paragraph and return valid JSON even if evidence is limited.",
          `Section plan: ${JSON.stringify(SECTION_PLAN.filter((section) => section.sectionId === "abstract" || section.sectionId === "findings" || section.sectionId === "conclusion"))}`,
          "Section evidence map:",
          sectionMapToText(
            prompt.sectionEvidenceMap.filter((section) =>
              section.sectionId === "abstract" ||
              section.sectionId === "findings" ||
              section.sectionId === "conclusion",
            ),
          ),
          "Paragraph plans:",
          paragraphPlansToText(
            prompt.paragraphPlans.filter((plan) =>
              plan.section === "abstract" ||
              plan.section === "findings" ||
              plan.section === "conclusion",
            ),
          ),
          "Baseline sections:",
          JSON.stringify(
            prompt.baselineSections.filter((section) =>
              section.sectionId === "abstract" ||
              section.sectionId === "findings" ||
              section.sectionId === "conclusion",
            ),
            null,
            2,
          ),
          "Accepted sources:",
          prompt.sources
            .map((source, index) =>
              compactAcceptedSource(source, index, sourceTextLimit),
            )
            .join("\n\n"),
          "Evidence cards:",
          prompt.evidenceCards
            .map((card, index) =>
              compactEvidenceCard(card, index, evidenceTextLimit),
            )
            .join("\n\n"),
        ].join("\n\n")
      : [
          `topic: ${input.topic}`,
          `reportType: ${input.reportType ?? "研究報告"}`,
          `audience: ${input.audience ?? "高中"}`,
          `language: ${input.language ?? "繁體中文"}`,
          `generationMode: ${input.generationMode ?? "formal"}`,
          input.generationMode === "preliminary"
            ? "State clearly that this is a constrained draft where evidence is still incomplete."
            : "Write a formal report with clear source limits.",
          "Required sectionIds: abstract, introduction, research_question, literature_review, methodology, findings, discussion, limitations, conclusion.",
          `Section plan: ${JSON.stringify(SECTION_PLAN)}`,
          "Section evidence map:",
          sectionMapToText(prompt.sectionEvidenceMap),
          "Paragraph plans:",
          paragraphPlansToText(prompt.paragraphPlans),
          "Baseline sections:",
          JSON.stringify(prompt.baselineSections, null, 2),
          "Accepted sources:",
          prompt.sources
            .map((source, index) =>
              compactAcceptedSource(source, index, sourceTextLimit),
            )
            .join("\n\n"),
          "Evidence cards:",
          prompt.evidenceCards
            .map((card, index) =>
              compactEvidenceCard(card, index, evidenceTextLimit),
            )
            .join("\n\n"),
        ].join("\n\n");

  return [
    {
      role: "system",
      content: systemRules,
    },
    {
      role: "user",
      content: userRules,
    },
  ];
}

async function runReportWriterAttempt(
  input: ReportWriterInput,
  options: ReportWriterOptions,
  prompt: ReportWriterAttemptPrompt,
  evidenceToSource: Map<string, string>,
  allowedSourceIds: Set<string>,
  model: string,
  timeoutMs: number,
): Promise<ReportWriterAttemptResult> {
  const llmResult = await requestLlmText({
    operation: "report_generation",
    purpose: "report_writer",
    temperature: prompt.mode === "retry" ? 0.1 : 0.2,
    maxTokens: prompt.mode === "retry" ? 900 : 2_600,
    responseFormat: "json_object",
    llm: {
      ...options.llm,
      model,
      timeoutMs,
    },
    fetchImpl: options.fetchImpl,
    messages: reportWriterMessages(input, prompt),
  });

  let sections: ReportWriterSection[] = [];
  let recoveryMode: ReportWriterAttemptResult["recoveryMode"] = "none";
  try {
    const parsed = safeJsonParse(llmResult.content);
    sections = sectionItems(parsed)
      .map((section) =>
        sanitizeSection(section, evidenceToSource, allowedSourceIds),
      )
      .filter((section): section is ReportWriterSection => Boolean(section));
  } catch (error) {
    if (!(error instanceof LlmAdapterError) || error.code !== "invalid-json") {
      throw error;
    }
    logger.warn(
      {
        route: "/api/generate-report",
        model: llmResult.model,
        mode: prompt.mode,
        rawSnippet: llmResult.content.slice(0, 1200),
      },
      "Report writer received non-JSON model output",
    );
    sections = recoverSectionObjectsFromPartialJson(llmResult.content)
      .map((section) =>
        sanitizeSection(section, evidenceToSource, allowedSourceIds),
      )
      .filter((section): section is ReportWriterSection => Boolean(section));
    if (sections.length > 0) {
      recoveryMode = "partial_json";
    } else {
    sections = fallbackSectionsFromFreeformText(
      llmResult.content,
      prompt.evidenceCards,
      allowedSourceIds,
    );
      if (sections.length > 0) {
        recoveryMode = "freeform";
      } else {
        throw error;
      }
    }
  }

  if (sections.length === 0) {
    throw new LlmAdapterError(
      "invalid-json",
      "LLM report writer did not return any usable sections.",
    );
  }

  return {
    llmResult,
    sections,
    recoveryMode,
    mode: prompt.mode,
  };
}

export async function writeReportWithLlm(
  input: ReportWriterInput,
  options: ReportWriterOptions = {},
): Promise<ReportWriterResult> {
  const preferredModel =
    options.llm?.model ??
    process.env.REPORT_MODEL?.trim() ??
    process.env.REPORT_FAST_MODEL?.trim() ??
    process.env.LLM_MODEL?.trim() ??
    process.env.OLLAMA_MODEL?.trim() ??
    DEFAULT_REPORT_WRITER_MODEL;
  const preferredTimeoutMs =
    options.llm?.timeoutMs ??
    positiveEnvNumber(
      process.env.REPORT_WRITER_LLM_TIMEOUT_MS,
      process.env.REPORT_LLM_TIMEOUT_MS,
    ) ??
    DEFAULT_REPORT_WRITER_TIMEOUT_MS;
  const retryModel =
    process.env.REPORT_RETRY_MODEL?.trim() ??
    process.env.REPORT_FAST_MODEL?.trim() ??
    process.env.LLM_FAST_MODEL?.trim() ??
    DEFAULT_REPORT_WRITER_RETRY_MODEL;
  const retryTimeoutMs =
    positiveEnvNumber(
      process.env.REPORT_WRITER_RETRY_TIMEOUT_MS,
      process.env.REPORT_RETRY_TIMEOUT_MS,
      process.env.REPORT_FAST_TIMEOUT_MS,
    ) ?? DEFAULT_REPORT_WRITER_RETRY_TIMEOUT_MS;
  const reportGenerationProvider = providerLabel(
    options.llm?.baseUrl ?? process.env.LLM_BASE_URL ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1",
  );
  const reportGenerationModel = preferredModel;
  const sources = input.acceptedSources.filter(
    (source) => source.reviewState === "accepted",
  );
  const evidenceCards = pipelineEvidenceCards(input.evidenceCards, sources);
  const sectionEvidenceMap = buildSectionEvidenceMap(input.topic, evidenceCards);
  const paragraphPlans = buildParagraphPlans(input.topic, sectionEvidenceMap);
  const draftParagraphs = renderDraftParagraphs(
    input.topic,
    paragraphPlans,
    evidenceCards,
    sources,
  );
  const citationValidation = validateDraftParagraphs(
    draftParagraphs,
    evidenceCards,
    sources,
  );
  const deterministicSections = mergeSectionsWithDeterministicBaseline(
    [],
    buildDeterministicSections(draftParagraphs),
    citationValidation,
  );

  if (sources.length < 1 || evidenceCards.length < 1) {
    return {
      ok: false,
      status: "insufficient_sources",
      llm_status: "skipped",
      fallback_used: true,
      model: reportGenerationModel ?? undefined,
      message: messageFromStatus("insufficient_sources", "report_generation"),
      warning: [
        "accepted_evidence_cards_missing",
        ...citationValidation.warnings,
      ].join(" | "),
      sections: deterministicSections,
      reportGenerationProvider,
      reportGenerationModel,
      reportGenerationStatus: "skipped",
      fallbackUsed: true,
      fallbackReason: "accepted_evidence_cards_missing",
    };
  }
  const evidenceToSource = new Map(
    evidenceCards.map((card) => [card.id, card.sourceId]),
  );
  const allowedSourceIds = new Set(sources.map((source) => source.id).filter(Boolean));

  try {
    const attempts = [
      buildAttemptPrompt(
        input,
        sources,
        evidenceCards,
        sectionEvidenceMap,
        paragraphPlans,
        deterministicSections,
        "primary",
      ),
      buildAttemptPrompt(
        input,
        sources,
        evidenceCards,
        sectionEvidenceMap,
        paragraphPlans,
        deterministicSections,
        "retry",
      ),
    ];
    let attemptResult: ReportWriterAttemptResult | null = null;
    let lastRecoverableError: unknown = null;

    for (const attempt of attempts) {
      try {
        attemptResult = await runReportWriterAttempt(
          input,
          options,
          attempt,
          evidenceToSource,
          allowedSourceIds,
          attempt.mode === "retry" ? retryModel : preferredModel,
          attempt.mode === "retry" ? retryTimeoutMs : preferredTimeoutMs,
        );
        break;
      } catch (error) {
        if (
          error instanceof LlmAdapterError &&
          (error.code === "invalid-json" || error.code === "provider-timeout") &&
          attempt.mode === "primary"
        ) {
          lastRecoverableError = error;
          logger.warn(
            {
              route: "/api/generate-report",
              model: preferredModel,
              retryModel,
              retryMode: "compact_prompt",
              reason: error.code,
            },
            "Report writer retrying with compact prompt",
          );
          continue;
        }
        throw error;
      }
    }

    if (!attemptResult) {
      throw lastRecoverableError ?? new Error("LLM report writer did not complete.");
    }

    const { llmResult, sections, recoveryMode, mode } = attemptResult;
    const mergedSections = mergeSectionsWithDeterministicBaseline(
      sections,
      deterministicSections,
      citationValidation,
    );
    const warnings = [
      mode === "retry"
        ? "初次輸出格式不穩，已自動改用精簡上下文重新生成。"
        : null,
      recoveryMode === "partial_json"
        ? "LLM report writer returned truncated JSON; recovered complete sections from the partial response."
        : null,
      recoveryMode === "freeform"
        ? "LLM report writer returned non-JSON prose; recovered sections with freeform fallback parsing."
        : null,
      sections.length < SECTION_PLAN.length
        ? `LLM report writer returned ${sections.length}/${SECTION_PLAN.length} usable sections; remaining sections kept from the evidence-backed draft.`
        : null,
      ...citationValidation.warnings,
    ].filter(Boolean);
    return {
      ok: true,
      status: "success",
      llm_status: "success",
      fallback_used: false,
      model: reportGenerationModel ?? undefined,
      message: "LLM report generation completed.",
      warning: warnings.length > 0 ? warnings.join(" ") : null,
      sections: mergedSections,
      reportGenerationProvider: llmResult.provider,
      reportGenerationModel: llmResult.model,
      reportGenerationStatus: "success",
      fallbackUsed: false,
      fallbackReason: null,
    };
  } catch (error) {
    const status = fallbackStatus(error);
    const warning = fallbackWarning(error);
    const structuredStatus = statusFromLlmError(error);
    logLlmFallback({
      operation: "report_generation",
      status: structuredStatus,
      provider: reportGenerationProvider,
      model: reportGenerationModel,
      endpoint: null,
      reason: warning,
      route: "/api/generate-report",
    });
    return {
      ok: false,
      status: structuredStatus,
      llm_status: status,
      fallback_used: true,
      model: reportGenerationModel ?? undefined,
      message: messageFromStatus(structuredStatus, "report_generation"),
      warning: [warning, ...citationValidation.warnings].filter(Boolean).join(" | "),
      sections: deterministicSections,
      reportGenerationProvider,
      reportGenerationModel,
      reportGenerationStatus: status,
      fallbackUsed: true,
      fallbackReason: [warning, ...citationValidation.warnings].filter(Boolean).join(" | "),
    };
  }
}
