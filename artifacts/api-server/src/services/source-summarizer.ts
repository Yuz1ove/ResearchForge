import type { SourceRecord } from "@workspace/api-zod";
import type { LlmStructuredStatus } from "@workspace/api-zod/llm-status";
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

export type SourceSummaryStatus =
  | "success"
  | "timeout"
  | "quota_exceeded"
  | "failed"
  | "skipped"
  | "metadata-only"
  | "fetch-failed"
  | "llm-failed"
  | "fallback";

type SourceSummaryCapableRecord = SourceRecord & {
  llmSummaryZhTw?: string | null;
  llmSummaryStatus?: SourceSummaryStatus | null;
  summaryStructuredStatus?: LlmStructuredStatus | null;
  summaryMessage?: string | null;
  readableSummaryZhTW?: string | null;
  summarySourceType?: "abstract" | "snippet" | "fulltext" | "metadataFallback" | null;
  summaryConfidence?: "high" | "medium" | "low" | null;
  relevanceReasonZhTW?: string | null;
  summaryWarnings?: string[] | null;
  originalAbstract?: string | null;
  originalSnippet?: string | null;
  extractedText?: string | null;
};

export type SourceWithLlmSummary = SourceSummaryCapableRecord;

export interface SourceSummarizerOptions {
  llm?: Partial<OpenAICompatibleLlmConfig>;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  maxSources?: number;
}

type PreparedSummaryTarget = {
  source: SourceSummaryCapableRecord;
  textForSummary: string;
  preStatus: SourceSummaryStatus | null;
  reason: string | null;
};

type BatchSummaryOutcome = {
  summaries: Map<
    string,
    {
      summary: string;
      provider: string;
      model: string;
      reason: string | null;
    }
  >;
  failures: Map<
    string,
    {
      status: SourceSummaryStatus;
      publicStatus: SourceSummaryStatus;
      structuredStatus: LlmStructuredStatus;
      provider: string;
      model: string | null;
      reason: string;
      message: string | null;
    }
  >;
};

const MAX_SUMMARY_INPUT_CHARS = 4_000;
const MAX_COMPACT_SOURCE_CHARS = 1_200;
const SUMMARY_BATCH_SIZE = 4;
const ENGLISH_STOP_WORDS = new Set([
  "about",
  "after",
  "air",
  "among",
  "analysis",
  "and",
  "article",
  "based",
  "between",
  "case",
  "data",
  "effect",
  "effects",
  "for",
  "from",
  "have",
  "into",
  "model",
  "of",
  "paper",
  "related",
  "research",
  "results",
  "review",
  "risk",
  "source",
  "study",
  "that",
  "their",
  "this",
  "using",
  "with",
]);

const ENGLISH_GLUE_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "that",
  "the",
  "through",
  "to",
  "using",
  "via",
  "with",
]);

const ACADEMIC_TERM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbased on\b/gi, "基於"],
  [/\bcase study\b/gi, "案例研究"],
  [/\bfuel efficiency\b/gi, "燃油效率"],
  [/\bcontrol surfaces\b/gi, "控制面"],
  [/\bflight stability\b/gi, "飛行穩定"],
  [/\bobserved warming\b/gi, "觀測升溫"],
  [/\bcurrent status\b/gi, "現況"],
  [/\bclimate change indicators\b/gi, "氣候變遷指標"],
  [/\btemperature trends\b/gi, "溫度趨勢"],
  [/\bco2 concentration\b/gi, "二氧化碳濃度"],
  [/\bconcentration\b/gi, "濃度"],
  [/\bsea level change\b/gi, "海平面變化"],
  [/\bdigital twin\b/gi, "數位分身"],
  [/\bstructural life\b/gi, "結構壽命"],
  [/\bstructural health monitoring\b/gi, "結構健康監測"],
  [/\bcomposite structures\b/gi, "複合材料結構"],
  [/\bcomposite materials\b/gi, "複合材料"],
  [/\bfibre optic sensors?\b/gi, "光纖感測器"],
  [/\bfiber optic sensors?\b/gi, "光纖感測器"],
  [/\brecent advances\b/gi, "最新進展"],
  [/\bapplications?\b/gi, "應用"],
  [/\badvancement(s)?\b/gi, "進展"],
  [/\breview\b/gi, "綜述"],
  [/\baluminum alloys?\b/gi, "鋁合金"],
  [/\bseries\b/gi, "系列"],
  [/\bindicators\b/gi, "指標"],
  [/\bCO2\b/g, "二氧化碳"],
  [/\bcargo\b/gi, "貨運"],
  [/\bfleet management\b/gi, "機隊管理"],
  [/\bflight operations\b/gi, "飛航作業"],
  [/\bscheduling\b/gi, "調度"],
  [/\bassembly\b/gi, "組裝"],
  [/\baerostructural\b/gi, "航太結構"],
  [/\btwin-fuselage\b/gi, "雙機身"],
  [/\bstrut-braced-wing\b/gi, "支柱撐翼"],
  [/\bconfiguration(s)?\b/gi, "構型"],
  [/\boverview\b/gi, "概述"],
  [/\bcomparative\b/gi, "比較"],
  [/\boptimization\b/gi, "最佳化"],
  [/\boptimisation\b/gi, "最佳化"],
  [/\bdynamic\b/gi, "動態"],
  [/\bmodel(s)?\b/gi, "模型"],
  [/\bdata\b/gi, "資料"],
  [/\bstudy\b/gi, "研究"],
  [/\bstudies\b/gi, "研究"],
  [/\bresults show\b/gi, "結果顯示"],
  [/\bperformance\b/gi, "性能"],
  [/\bimprovement(s)?\b/gi, "改善"],
  [/\bsafety\b/gi, "安全"],
  [/\bunmanned\b/gi, "無人"],
  [/\bmanned\b/gi, "有人"],
  [/\blateral\b/gi, "側向"],
  [/\bspacing\b/gi, "間距"],
  [/\boperation(s)?\b/gi, "作業"],
  [/\bmixed\b/gi, "混合"],
  [/\bQAR\b/g, "快速存取記錄器"],
  [/\bquick access recorder\b/gi, "快速存取記錄器"],
  [/\brunway overrun\b/gi, "跑道衝出"],
  [/\brisk assessment\b/gi, "風險評估"],
  [/\bcivil aircraft\b/gi, "民航飛機"],
  [/\bflight parameters\b/gi, "飛行參數"],
  [/\bflight safety\b/gi, "飛航安全"],
  [/\btouchdown distance\b/gi, "接地距離"],
  [/\bkinetic energy\b/gi, "動能"],
  [/\bfixed-wing aircraft\b/gi, "固定翼飛機"],
  [/\baircraft\b/gi, "飛機"],
  [/\bairplane\b/gi, "飛機"],
  [/\baeroplane\b/gi, "飛機"],
  [/\baviation\b/gi, "航空"],
  [/\bdesign\b/gi, "設計"],
  [/\bmaterials\b/gi, "材料"],
  [/\bmanufacturing\b/gi, "製造"],
  [/\bmaintenance\b/gi, "維修"],
  [/\bprediction\b/gi, "預測"],
  [/\boptimization\b/gi, "最佳化"],
  [/\bconfiguration\b/gi, "構型"],
  [/\bwing\b/gi, "機翼"],
  [/\bfuselage\b/gi, "機身"],
  [/\bSalmonella\b/gi, "沙門氏桿菌"],
  [/\bsalmonellosis\b/gi, "沙門氏菌感染"],
  [/\bfood safety\b/gi, "食品安全"],
  [/\bfood handling practices\b/gi, "食品處理實務"],
  [/\bgastrointestinal disorder\b/gi, "腸胃道疾病"],
  [/\bgastroenteritis\b/gi, "腸胃炎"],
  [/\babdominal cramps\b/gi, "腹部絞痛"],
  [/\bbloody diarrhoea\b/gi, "血便腹瀉"],
  [/\bbloody diarrhea\b/gi, "血便腹瀉"],
  [/\bdiarrhoea\b/gi, "腹瀉"],
  [/\bdiarrhea\b/gi, "腹瀉"],
  [/\bfever\b/gi, "發燒"],
  [/\bmyalgia\b/gi, "肌肉痠痛"],
  [/\bheadache\b/gi, "頭痛"],
  [/\bnausea\b/gi, "噁心"],
  [/\bvomiting\b/gi, "嘔吐"],
  [/\bfoodborne outbreak illnesses\b/gi, "食源性群聚疾病"],
  [/\bpoultry\b/gi, "家禽"],
  [/\bcattle\b/gi, "牛隻"],
  [/\bready to eat\b/gi, "即食"],
  [/\bfood handlers\b/gi, "食品處理人員"],
  [/\bmicroplastics?\b/gi, "微塑膠"],
  [/\bhuman exposure\b/gi, "人體暴露"],
  [/\bingestion\b/gi, "攝食"],
  [/\binhalation\b/gi, "吸入"],
  [/\bdermal contact\b/gi, "皮膚接觸"],
  [/\bcell membranes?\b/gi, "細胞膜"],
  [/\bbreastmilk\b/gi, "母乳"],
  [/\btoxic effects?\b/gi, "毒性影響"],
  [/\bmarine organisms?\b/gi, "海洋生物"],
  [/\bhuman cell lines?\b/gi, "人體細胞株"],
  [/\bprospective study\b/gi, "前瞻性研究"],
  [/\bobservational study\b/gi, "觀察研究"],
  [/\bredox reactions?\b/gi, "氧化還原反應"],
  [/\boxidation-reduction reactions?\b/gi, "氧化還原反應"],
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncateText(text: string, maxLength: number): string {
  const chars = Array.from(cleanText(text));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, maxLength - 1).join("").trim()}…`;
}

function splitSentences(text: string): string[] {
  return cleanText(text)
    .split(/(?<=[。！？.!?])(?:\s+|(?=\S))/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function applyAcademicTermReplacements(text: string): string {
  let normalized = cleanText(text);
  for (const [pattern, replacement] of ACADEMIC_TERM_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function polishReaderFacingText(text: string): string {
  return cleanText(text)
    .replace(/\b(for|and|of|on|in|with|from|to|via)\b/gi, " ")
    .replace(/\b(new|current|overall|respectively|approach|approaches|framework|frameworks)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([，。；：、])/g, "$1")
    .replace(/([（(])\s+/g, "$1")
    .replace(/\s+([）)])/g, "$1")
    .trim();
}

function stripAcademicSentenceLead(text: string): string {
  return cleanText(text)
    .replace(
      /^in\s+this\s+((systematic|narrative|literature|cohort|case[- ]control|cross[- ]sectional|retrospective|prospective|observational|experimental|comparative|empirical)\s+){0,2}(study|paper|article|review|analysis)[,:]?\s*/i,
      "",
    )
    .replace(
      /^(this|the)\s+((systematic|narrative|literature|cohort|case[- ]control|cross[- ]sectional|retrospective|prospective|observational|experimental|comparative|empirical)\s+){0,2}(study|paper|article|review|analysis)[,:]?\s*/i,
      "",
    )
    .replace(
      /^(taking|using|based on)\b[^.]{0,160}?\b(case study|dataset|data)\b,?\s*/i,
      "",
    )
    .replace(/^(we|authors?)\s+/i, "")
    .replace(
      /^(examines?|analyzes?|investigates?|evaluates?|explores?|proposes?|presents?|predicts?|describes?|reports?|discusses?)\s+/i,
      "",
    )
    .replace(/^\s*(the)\s+/i, "")
    .trim();
}

function englishWordCount(text: string): number {
  return cleanText(text).match(/[A-Za-z]{3,}/g)?.length ?? 0;
}

function containsHeavyEnglish(text: string): boolean {
  const normalized = cleanText(text);
  const asciiLetters = normalized.match(/[A-Za-z]/g)?.length ?? 0;
  const chars = Array.from(normalized).length || 1;
  return englishWordCount(normalized) >= 4 || asciiLetters / chars >= 0.22;
}

function meaningfulResearchTerms(text: string): string[] {
  return polishReaderFacingText(applyAcademicTermReplacements(text))
    .split(/[，。；：、,;:()[\]{}<>/%+-]|\s+/)
    .map((token) => cleanText(token))
    .filter((token) => token.length >= 2)
    .filter((token) => {
      if (/[\u4e00-\u9fff]/u.test(token)) return true;
      if (/^[A-Z0-9-]{2,6}$/.test(token)) return true;
      if (ENGLISH_STOP_WORDS.has(token.toLowerCase())) return false;
      if (ENGLISH_GLUE_WORDS.has(token.toLowerCase())) return false;
      return false;
    })
    .filter((token, index, items) => items.indexOf(token) === index)
    .slice(0, 4);
}

function readerFacingActionDetail(action: string): string {
  switch (action) {
    case "提出並說明":
      return "設計與判斷方式";
    case "評估":
      return "評估方式與風險判讀";
    case "比較":
      return "差異與表現比較";
    case "預測":
      return "預測方向與判斷依據";
    case "探討":
      return "核心議題與可能影響";
    default:
      return "核心重點";
  }
}

function naturalChineseLead(
  focus: string,
  action: string,
  sentence: string,
): string {
  const terms = [
    ...meaningfulResearchTerms(sentence),
    ...meaningfulResearchTerms(focus),
  ].filter((term, index, items) => term && items.indexOf(term) === index);
  const termText = terms.slice(0, 3).join("、");
  if (termText) {
    return `內容聚焦${termText}，可用來理解${focus}的${readerFacingActionDetail(action)}。`;
  }
  return `內容聚焦${focus}，可用來快速掌握這篇研究的${readerFacingActionDetail(action)}。`;
}

function combinedVisibleText(source: SourceSummaryCapableRecord): string {
  return cleanText([source.abstract, source.snippet].filter(Boolean).join(" "));
}

function summaryInputText(source: SourceSummaryCapableRecord, bodyText?: string): string {
  return cleanText(
    [
      source.title,
      source.abstract,
      source.snippet,
      bodyText,
      source.containerTitle,
      source.publisher,
    ]
      .filter(Boolean)
      .join(" "),
  ).slice(0, MAX_SUMMARY_INPUT_CHARS);
}

function excerptForFallback(text: string): string {
  const sentences = splitSentences(text);
  const selected = sentences.length > 0 ? sentences.slice(0, 2).join(" ") : cleanText(text);
  return truncateText(selected, 180);
}

function englishTitleKeywords(title: string): string[] {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token, index, items) =>
        token.length >= 4 &&
        !ENGLISH_STOP_WORDS.has(token) &&
        !/^\d+$/.test(token) &&
        items.indexOf(token) === index,
    )
    .slice(0, 6);
}

function sourceFocusTitle(title: string, topic = ""): string {
  const normalized = polishReaderFacingText(
    applyAcademicTermReplacements(
      cleanText(title)
        .replace(/^(a|an|the)\s+/i, "")
        .replace(/\s*[:|-]\s*.*/, ""),
    ),
  );
  if (!containsHeavyEnglish(normalized)) {
    return truncateText(normalized || cleanText(title), 72);
  }
  const topicText = cleanText(topic);
  const termPool = meaningfulResearchTerms(normalized);
  const usefulTerms = termPool.filter(
    (term) => term !== topicText && !topicText.includes(term),
  );
  if (usefulTerms.length >= 2) {
    return truncateText(usefulTerms.slice(0, 3).join("、"), 72);
  }
  if (usefulTerms.length === 1 && topicText) {
    return truncateText(`${topicText}與${usefulTerms[0]}相關研究`, 72);
  }
  if (topicText) return truncateText(`${topicText}相關研究`, 72);
  return truncateText(normalized || cleanText(title), 72);
}

function summaryActionLabel(text: string): string {
  const normalized = cleanText(text).toLowerCase();
  if (/\b(propose|develop|present|design|build)\b/.test(normalized)) return "提出並說明";
  if (/\b(predict|forecast)\b/.test(normalized)) return "預測";
  if (/\b(compare|comparative)\b/.test(normalized)) return "比較";
  if (/\b(assess|assessment|evaluate|evaluation)\b/.test(normalized)) return "評估";
  if (/\b(analyze|analysis|investigate|investigation|examine|study|explore)\b/.test(normalized)) {
    return "探討";
  }
  return "說明";
}

function chooseBestBodySentence(source: SourceSummaryCapableRecord, bodyText: string): string {
  const sentences = splitSentences(bodyText).slice(0, 4);
  if (sentences.length === 0) return "";

  const titleKeywords = englishTitleKeywords(source.title);
  const scored = sentences.map((sentence, index) => {
    const normalized = sentence.toLowerCase();
    const titleHits = titleKeywords.reduce(
      (score, keyword) => score + (normalized.includes(keyword) ? 2 : 0),
      0,
    );
    const verbBonus = /\b(propose|develop|present|predict|assess|evaluate|analyze|examine|study|investigate)\b/.test(
      normalized,
    )
      ? 2
      : 0;
    return {
      sentence,
      score: titleHits + verbBonus - index,
    };
  });

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.sentence ?? sentences[0] ?? "";
}

function deterministicFallbackSummary(
  topic: string,
  target: PreparedSummaryTarget,
): string {
  const body = cleanText(target.textForSummary);
  const contentBody =
    combinedVisibleText(target.source) ||
    body.replace(new RegExp(`^${target.source.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`), "");
  const bestSentence = chooseBestBodySentence(target.source, contentBody) || contentBody;
  const action = summaryActionLabel([target.source.title, contentBody].join(" "));
  const polishedLead = excerptForFallback(
    polishReaderFacingText(
      stripAcademicSentenceLead(applyAcademicTermReplacements(bestSentence)),
    ),
  );
  const focusText = sourceFocusTitle(target.source.title, topic);
  const summaryLead = containsHeavyEnglish(polishedLead)
    ? naturalChineseLead(
        focusText || cleanText(topic) || "本研究主題",
        action,
        polishedLead,
      )
    : polishedLead;
  const limitation =
    target.preStatus === "fetch-failed"
      ? "整理限制：目前正文抓取失敗，先依可見摘要與書目資訊保守整理。"
      : target.preStatus === "metadata-only"
        ? "整理限制：目前可用內容偏少，先依題名與少量片段保守整理。"
        : null;

  return truncateText(
    [
      `主旨：本文${action}「${focusText || cleanText(topic) || "本研究主題"}」。`,
      `摘要重點：${summaryLead || "目前主要依題名、摘要與片段整理重點"}。`,
      limitation,
    ]
      .filter(Boolean)
      .join(" "),
    260,
  );
}

function stripHtmlAndNoise(text: string): string {
  return htmlToText(text)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(source_text|text_status|relevance|schema)\b\s*:\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeReaderSummary(text: string): string {
  return truncateText(stripHtmlAndNoise(text), 220);
}

function summarySourceTypeForTarget(
  target: PreparedSummaryTarget,
): NonNullable<SourceSummaryCapableRecord["summarySourceType"]> {
  if (target.preStatus === "metadata-only" || target.preStatus === "fetch-failed") {
    return "metadataFallback";
  }
  if (cleanText(target.source.extractedText).length >= 160 || target.reason === "fetched_url_body") {
    return "fulltext";
  }
  if (cleanText(target.source.originalAbstract ?? target.source.abstract).length >= 80) {
    return "abstract";
  }
  if (cleanText(target.source.originalSnippet ?? target.source.snippet).length >= 24) {
    return "snippet";
  }
  return "metadataFallback";
}

function summaryConfidenceForType(
  sourceType: NonNullable<SourceSummaryCapableRecord["summarySourceType"]>,
): NonNullable<SourceSummaryCapableRecord["summaryConfidence"]> {
  switch (sourceType) {
    case "fulltext":
    case "abstract":
      return "high";
    case "snippet":
      return "medium";
    case "metadataFallback":
    default:
      return "low";
  }
}

function summaryWarningsForTarget(target: PreparedSummaryTarget): string[] {
  if (target.preStatus === "fetch-failed") {
    return ["目前無法取得來源正文，摘要先依可見摘要與書目資訊保守整理。"];
  }
  if (target.preStatus === "metadata-only") {
    return ["目前僅能根據標題與來源資訊初步判斷，尚不足以支持深入引用。"];
  }
  if (cleanText(target.source.originalSnippet ?? target.source.snippet).length > 0 &&
      cleanText(target.source.originalAbstract ?? target.source.abstract).length < 80) {
    return ["目前摘要主要來自 snippet 或簡短描述，建議接受前再確認原始來源。"];
  }
  return [];
}

function compactMatchedFacet(source: SourceSummaryCapableRecord): string | null {
  const candidates = [
    ...(source.matchedFacets ?? []),
    ...(source.matchedTerms ?? []),
    ...(source.matchedCoreConcepts ?? []),
  ]
    .map((item) => cleanText(item))
    .filter(Boolean);
  return candidates[0] ?? null;
}

function relevanceReasonSummary(topic: string, source: SourceSummaryCapableRecord): string {
  const explicit = cleanText(source.relevanceReasonZhTW ?? source.sourceRelevanceReasonZhTw);
  if (explicit) return explicit;
  const facet = compactMatchedFacet(source);
  if (facet) return `可用來補充「${topic}」中與「${facet}」相關的證據線索。`;
  if (source.relevanceLevel === "primary") {
    return `可作為「${topic}」的主要證據候選。`;
  }
  if (source.relevanceLevel === "secondary" || source.relevanceLevel === "clue") {
    return `可作為「${topic}」的延伸或背景線索。`;
  }
  return `與「${topic}」的直接關聯有限，需保守引用。`;
}

function metadataFallbackSummary(
  topic: string,
  target: PreparedSummaryTarget,
): string {
  const title = cleanText(target.source.title) || "此來源";
  const snippet = cleanText(target.source.originalSnippet ?? target.source.snippet);
  const relation = relevanceReasonSummary(topic, target.source);
  const titleLead = title ? `此來源目前以〈${title}〉的題名為主` : "此來源目前只有基本書目資訊";
  const snippetLead = snippet
    ? `，可初步看出內容聚焦於${truncateText(stripHtmlAndNoise(snippet), 48)}`
    : "";
  return truncateText(
    `${titleLead}${snippetLead}。${relation} 但目前尚未取得足夠摘要或全文內容，不宜當成完整研究結論。`,
    170,
  );
}

function readableEvidenceExcerpt(target: PreparedSummaryTarget): string {
  const candidate =
    cleanText(target.source.originalAbstract ?? target.source.abstract) ||
    cleanText(target.source.extractedText) ||
    cleanText(target.source.originalSnippet ?? target.source.snippet) ||
    cleanText(target.textForSummary);
  if (!candidate) return "";
  return excerptForFallback(
    polishReaderFacingText(
      stripAcademicSentenceLead(applyAcademicTermReplacements(stripHtmlAndNoise(candidate))),
    ),
  );
}

function composeReadableSummaryZhTW(input: {
  topic: string;
  source: SourceSummaryCapableRecord;
  baseSummary: string;
  summarySourceType: NonNullable<SourceSummaryCapableRecord["summarySourceType"]>;
  summaryConfidence: NonNullable<SourceSummaryCapableRecord["summaryConfidence"]>;
}): string {
  const relation = relevanceReasonSummary(input.topic, input.source);
  if (input.summarySourceType === "metadataFallback") {
    return metadataFallbackSummary(input.topic, {
      source: input.source,
      textForSummary: input.baseSummary,
      preStatus: "metadata-only",
      reason: "metadata_fallback",
    });
  }
  const cleanedSummary = normalizeReaderSummary(input.baseSummary);
  if (cleanedSummary && /[\u4e00-\u9fff]/u.test(cleanedSummary) && !containsHeavyEnglish(cleanedSummary)) {
    const merged = cleanedSummary.includes("與目前研究主題")
      ? cleanedSummary
      : `${cleanedSummary} 與目前研究主題的關聯在於：${relation}`;
    return truncateText(merged, 170);
  }
  const focus = sourceFocusTitle(input.source.title, input.topic);
  const evidenceExcerpt = readableEvidenceExcerpt({
    source: input.source,
    textForSummary: input.baseSummary,
    preStatus: null,
    reason: null,
  });
  if (evidenceExcerpt) {
    const detail = containsHeavyEnglish(evidenceExcerpt)
      ? naturalChineseLead(
          focus || cleanText(input.topic) || "本研究主題",
          summaryActionLabel([input.source.title, evidenceExcerpt].join(" ")),
          evidenceExcerpt,
        )
      : evidenceExcerpt;
    return truncateText(
      [
        focus ? `這份來源主要討論${focus}。` : null,
        `摘要指出${detail.replace(/^[，。]+|[，。]+$/g, "")}。`,
        `與目前研究主題的關聯在於：${relation}`,
      ]
        .filter(Boolean)
        .join(" "),
      170,
    );
  }
  const merged = cleanedSummary.includes("與目前研究主題")
    ? cleanedSummary
    : `${cleanedSummary} 與目前研究主題的關聯在於：${relation}`;
  return truncateText(merged, 170);
}

function buildReadableSummaryPayload(input: {
  topic: string;
  target: PreparedSummaryTarget;
  summaryText: string;
}): Pick<
  SourceWithLlmSummary,
  | "readableSummaryZhTW"
  | "summarySourceType"
  | "summaryConfidence"
  | "relevanceReasonZhTW"
  | "summaryWarnings"
> {
  const summarySourceType = summarySourceTypeForTarget(input.target);
  const summaryConfidence = summaryConfidenceForType(summarySourceType);
  const relevanceReasonZhTW = relevanceReasonSummary(input.topic, input.target.source);
  return {
    readableSummaryZhTW: composeReadableSummaryZhTW({
      topic: input.topic,
      source: input.target.source,
      baseSummary: input.summaryText,
      summarySourceType,
      summaryConfidence,
    }),
    summarySourceType,
    summaryConfidence,
    relevanceReasonZhTW,
    summaryWarnings: summaryWarningsForTarget(input.target),
  };
}

function chunkTargets(
  targets: PreparedSummaryTarget[],
  size: number,
): PreparedSummaryTarget[][] {
  const chunks: PreparedSummaryTarget[][] = [];
  for (let index = 0; index < targets.length; index += size) {
    chunks.push(targets.slice(index, index + size));
  }
  return chunks;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function sourceFetchUrl(source: SourceRecord): string | null {
  if (source.url) return source.url;
  if (source.doi) return `https://doi.org/${source.doi}`;
  return null;
}

function fetchFailedReason(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "fetch_timeout";
  if (error instanceof Error) return error.message.slice(0, 120);
  return "fetch_failed";
}

async function fetchReadableText(
  url: string,
  fetchImpl: SourceSummarizerOptions["fetchImpl"],
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await (fetchImpl ?? fetch)(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf,text/plain",
        "User-Agent": "ResearchForge/1.0 source summarizer",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (/application\/pdf/i.test(contentType)) {
      return "";
    }
    const raw = await response.text();
    const text = /html/i.test(contentType) ? htmlToText(raw) : cleanText(raw);
    return text.slice(0, MAX_SUMMARY_INPUT_CHARS);
  } finally {
    clearTimeout(timeout);
  }
}

async function prepareSummaryTarget(
  source: SourceSummaryCapableRecord,
  options: SourceSummarizerOptions,
): Promise<PreparedSummaryTarget> {
  const abstract = cleanText(source.abstract);
  const snippet = cleanText(source.snippet);
  const originalAbstract = cleanText(source.originalAbstract ?? source.abstract);
  const originalSnippet = cleanText(source.originalSnippet ?? source.snippet);
  const sourceWithOriginals: SourceSummaryCapableRecord = {
    ...source,
    originalAbstract: originalAbstract || null,
    originalSnippet: originalSnippet || null,
  };
  const visibleText = combinedVisibleText(source);
  const visibleSummaryInput = summaryInputText(source);
  if (visibleSummaryInput.length >= 120) {
    return {
      source: sourceWithOriginals,
      textForSummary: visibleSummaryInput,
      preStatus: null,
      reason: abstract ? "abstract_available" : "snippet_available",
    };
  }

  const url = sourceFetchUrl(source);
  if (!url) {
    return {
      source: sourceWithOriginals,
      textForSummary: visibleSummaryInput || cleanText(source.title),
      preStatus: "metadata-only",
      reason: "no_abstract_snippet_url_or_doi",
    };
  }

  try {
    const fetchedText = await fetchReadableText(url, options.fetchImpl);
    const mergedText = summaryInputText(source, fetchedText);
    if (mergedText.length >= 160) {
      return {
        source: {
          ...sourceWithOriginals,
          abstract: abstract || truncateText(fetchedText, 1_200),
          snippet: snippet || truncateText(fetchedText, 500),
          abstractMissing: false,
          extractedText: truncateText(fetchedText, MAX_SUMMARY_INPUT_CHARS),
        },
        textForSummary: mergedText,
        preStatus: null,
        reason: "fetched_url_body",
      };
    }
    return {
      source: sourceWithOriginals,
      textForSummary: mergedText || visibleSummaryInput || cleanText(source.title),
      preStatus: "metadata-only",
      reason: "fetched_body_too_short",
    };
  } catch (error) {
    return {
      source: sourceWithOriginals,
      textForSummary: visibleSummaryInput || cleanText(source.title),
      preStatus: "fetch-failed",
      reason: fetchFailedReason(error),
    };
  }
}

function compactPreparedSource(target: PreparedSummaryTarget, index: number): string {
  return [
    `id: ${target.source.id || `source-${index + 1}`}`,
    `title: ${target.source.title}`,
    `source_text: ${target.textForSummary.slice(0, MAX_COMPACT_SOURCE_CHARS) || "正文不足"}`,
    `text_status: ${target.reason ?? "unknown"}`,
    `relevance: ${target.source.relevanceLevel ?? "unknown"}`,
  ].join("\n");
}

function sanitizeSummary(value: unknown): { id: string; summary: string } | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const id = typeof data.id === "string" ? data.id.trim() : "";
  const summary = typeof data.summaryZhTw === "string"
    ? data.summaryZhTw.trim()
    : typeof data.summary === "string"
      ? data.summary.trim()
      : "";
  if (!id || summary.length < 12) return null;
  return { id, summary };
}

function statusFromError(error: unknown): SourceSummaryStatus {
  if (!(error instanceof LlmAdapterError)) return "failed";
  if (error.code === "provider-unconfigured") return "skipped";
  if (error.code === "provider-timeout") return "timeout";
  if (error.code === "provider-quota") return "quota_exceeded";
  return "failed";
}

function publicSummaryStatusFromLlmStatus(status: SourceSummaryStatus): SourceSummaryStatus {
  if (status === "success") return "success";
  if (status === "failed") return "llm-failed";
  if (status === "timeout" || status === "quota_exceeded" || status === "skipped") {
    return "fallback";
  }
  return status;
}

function structuredStatusForPreStatus(
  status: SourceSummaryStatus,
): LlmStructuredStatus {
  if (status === "metadata-only" || status === "fetch-failed") {
    return "insufficient_sources";
  }
  return "error";
}

function resolvedPreStatus(target: PreparedSummaryTarget): SourceSummaryStatus {
  return target.preStatus ?? "metadata-only";
}

function summaryItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const data = value as Record<string, unknown>;
    if (Array.isArray(data.summaries)) return data.summaries;
    if (Array.isArray(data.sources)) return data.sources;
  }
  return [];
}

async function summarizeBatchWithLlm(
  topic: string,
  batch: PreparedSummaryTarget[],
  options: SourceSummarizerOptions,
): Promise<BatchSummaryOutcome> {
  const fallbackProvider = providerLabel(
    options.llm?.baseUrl ??
      process.env.LLM_BASE_URL ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434/v1",
  );
  const fallbackModel =
    options.llm?.model ??
    process.env.LLM_MODEL?.trim() ??
    process.env.OLLAMA_MODEL?.trim() ??
    null;

  try {
    const llmResult = await requestLlmText({
      operation: "source_summary",
      purpose: "summarizer",
      temperature: 0,
      maxTokens: 700,
      responseFormat: "json_object",
      llm: options.llm,
      fetchImpl: options.fetchImpl,
      messages: [
        {
          role: "system",
          content: [
            "You are ResearchForge's evidence extractor.",
            "Output valid JSON only. No markdown. No explanation.",
            "Write Traditional Chinese summaries from the supplied source_text only.",
            "If source_text is weak, state the limitation. Do not invent methods, data, authors, DOI, or full text.",
            "Schema: {\"summaries\":[{\"id\":\"source id\",\"summaryZhTw\":\"one concise paragraph\"}]}",
          ].join(" "),
        },
        {
          role: "user",
          content: [`topic: ${topic}`, ...batch.map(compactPreparedSource)].join(
            "\n\n",
          ),
        },
      ],
    });
    const parsed = safeJsonParse(llmResult.content);
    const summaries = new Map(
      summaryItems(parsed)
        .map(sanitizeSummary)
        .filter((item): item is { id: string; summary: string } => Boolean(item))
        .map((item) => [
          item.id,
          {
            summary: item.summary,
            provider: llmResult.provider,
            model: llmResult.model,
            reason: null,
          },
        ]),
    );
    if (summaries.size === 0) {
      throw new LlmAdapterError(
        "invalid-json",
        "LLM source summarizer returned no valid summaries.",
      );
    }

    const failures = new Map<
      string,
      {
        status: SourceSummaryStatus;
        publicStatus: SourceSummaryStatus;
        structuredStatus: LlmStructuredStatus;
        provider: string;
        model: string | null;
        reason: string;
        message: string | null;
      }
    >();
    for (const target of batch) {
      if (summaries.has(target.source.id)) continue;
      failures.set(target.source.id, {
        status: "llm-failed",
        publicStatus: "llm-failed",
        structuredStatus: "error",
        provider: llmResult.provider,
        model: llmResult.model,
        reason: "llm_returned_no_summary",
        message: messageFromStatus("error", "source_summary"),
      });
    }

    return { summaries, failures };
  } catch (error) {
    const status = statusFromError(error);
    const publicStatus = publicSummaryStatusFromLlmStatus(status);
    const structuredStatus = statusFromLlmError(error);
    const reason =
      error instanceof LlmAdapterError ? error.code : "summary_generation_failed";

    logLlmFallback({
      operation: "source_summary",
      status: structuredStatus,
      provider: fallbackProvider,
      model: fallbackModel,
      endpoint: null,
      reason,
      route: "search-intent-planner:summarizeSourcesWithLlm",
    });

    return {
      summaries: new Map(),
      failures: new Map(
        batch.map((target) => [
          target.source.id,
          {
            status,
            publicStatus,
            structuredStatus,
            provider: fallbackProvider,
            model: fallbackModel,
            reason,
            message: messageFromStatus(structuredStatus, "source_summary"),
          },
        ]),
      ),
    };
  }
}

export async function summarizeSourcesWithLlm(
  topic: string,
  sources: SourceRecord[],
  options: SourceSummarizerOptions = {},
): Promise<SourceWithLlmSummary[]> {
  const maxSources = options.maxSources ?? 20;
  const summaryProvider = providerLabel(
    options.llm?.baseUrl ??
      process.env.LLM_BASE_URL ??
      process.env.OLLAMA_BASE_URL ??
      "http://127.0.0.1:11434/v1",
  );
  const summaryModel =
    options.llm?.model ??
    process.env.LLM_MODEL?.trim() ??
    process.env.OLLAMA_MODEL?.trim() ??
    null;
  const summaryTargets = sources
    .filter(
      (source) =>
        source.relevanceLevel === "primary" ||
        source.relevanceLevel === "secondary" ||
        source.relevanceLevel === "clue",
    )
    .slice(0, maxSources);
  if (summaryTargets.length === 0) return sources;

  const preparedTargets = await Promise.all(
    summaryTargets.map((source) => prepareSummaryTarget(source, options)),
  );
  const preparedById = new Map(
    preparedTargets.map((target) => [target.source.id, target]),
  );
  const llmTargets = preparedTargets.filter((target) => !target.preStatus);
  const preStatusSources = new Map(
    preparedTargets
      .filter((target) => target.preStatus)
      .map((target) => [target.source.id, target]),
  );

  if (llmTargets.length === 0) {
    return sources.map((source) => {
      const preStatus = preStatusSources.get(source.id);
      if (!preStatus) return source;
      const preStatusValue = resolvedPreStatus(preStatus);
      const readableSummary = buildReadableSummaryPayload({
        topic,
        target: preStatus,
        summaryText: deterministicFallbackSummary(topic, preStatus),
      });
      return {
        ...source,
        ...preStatus.source,
        llmSummaryZhTw: deterministicFallbackSummary(topic, preStatus),
        ...readableSummary,
        llmSummaryStatus: preStatusValue,
        summaryStructuredStatus: structuredStatusForPreStatus(preStatusValue),
        summaryProvider,
        summaryModel,
        summaryStatus: preStatusValue,
        summaryFallbackUsed: true,
        summaryReason: preStatus.reason,
        summaryMessage: messageFromStatus(
          structuredStatusForPreStatus(preStatusValue),
          "source_summary",
        ),
      };
    });
  }

  const chunkedTargets = chunkTargets(llmTargets, SUMMARY_BATCH_SIZE);
  const successfulSummaries = new Map<
    string,
    {
      summary: string;
      provider: string;
      model: string;
      reason: string | null;
    }
  >();
  const failedSummaries = new Map<
    string,
    {
      status: SourceSummaryStatus;
      publicStatus: SourceSummaryStatus;
      structuredStatus: LlmStructuredStatus;
      provider: string;
      model: string | null;
      reason: string;
      message: string | null;
    }
  >();

  for (const batch of chunkedTargets) {
    const outcome = await summarizeBatchWithLlm(topic, batch, options);
    for (const [id, value] of outcome.summaries.entries()) {
      successfulSummaries.set(id, value);
    }
    for (const [id, value] of outcome.failures.entries()) {
      if (!successfulSummaries.has(id)) failedSummaries.set(id, value);
    }
  }

  return sources.map((source) => {
    const preStatus = preStatusSources.get(source.id);
    if (preStatus) {
      const preStatusValue = resolvedPreStatus(preStatus);
      const fallbackSummary = deterministicFallbackSummary(topic, preStatus);
      const readableSummary = buildReadableSummaryPayload({
        topic,
        target: preStatus,
        summaryText: fallbackSummary,
      });
      return {
        ...source,
        ...preStatus.source,
        llmSummaryZhTw: fallbackSummary,
        ...readableSummary,
        llmSummaryStatus: preStatusValue,
        summaryStructuredStatus: structuredStatusForPreStatus(preStatusValue),
        summaryProvider,
        summaryModel,
        summaryStatus: preStatusValue,
        summaryFallbackUsed: true,
        summaryReason: preStatus.reason,
        summaryMessage: messageFromStatus(
          structuredStatusForPreStatus(preStatusValue),
          "source_summary",
        ),
      };
    }

    const prepared = preparedById.get(source.id);
    const success = successfulSummaries.get(source.id);
    if (success && prepared) {
      const readableSummary = buildReadableSummaryPayload({
        topic,
        target: prepared,
        summaryText: success.summary,
      });
      return {
        ...source,
        ...prepared.source,
        llmSummaryZhTw: success.summary,
        ...readableSummary,
        llmSummaryStatus: "success",
        summaryStructuredStatus: "success",
        summaryProvider: success.provider,
        summaryModel: success.model,
        summaryStatus: "success",
        summaryFallbackUsed: false,
        summaryReason: prepared.reason ?? null,
        summaryMessage: null,
      };
    }

    const failure = failedSummaries.get(source.id);
    if (failure && prepared) {
      const fallbackSummary = deterministicFallbackSummary(topic, prepared);
      const readableSummary = buildReadableSummaryPayload({
        topic,
        target: prepared,
        summaryText: fallbackSummary,
      });
      return {
        ...source,
        ...prepared.source,
        llmSummaryZhTw: fallbackSummary,
        ...readableSummary,
        llmSummaryStatus: failure.status,
        summaryStructuredStatus: failure.structuredStatus,
        summaryProvider: failure.provider,
        summaryModel: failure.model,
        summaryStatus: failure.publicStatus,
        summaryFallbackUsed: true,
        summaryReason: failure.reason,
        summaryMessage: failure.message,
      };
    }

    return source;
  });
}
