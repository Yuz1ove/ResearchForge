import {
  acceptedSourceRecords,
  classifySourceRecord,
  dedupeSourceRecords,
  SOURCE_CATEGORY_LABELS,
  type SourceRecord,
  type WorkflowReportSection,
} from "./sourceRecords.ts";
import { buildAcceptedSourceSynthesis } from "./acceptedSourceSynthesis.ts";
import {
  sourceHasUsableAbstract,
  sourceRecommendedSections,
} from "./sourceSummaries.ts";

export interface AcceptedSourceDigest {
  version: number;
  summary: string;
  coverage: string[];
  gaps: string[];
  recommendedNextStep: string;
}

export interface BuildAcceptedSourceDigestOptions {
  topic?: string;
  currentYear?: number;
}

export const ACCEPTED_SOURCE_DIGEST_VERSION = 5;

const SECTION_COVERAGE_LABELS: Record<WorkflowReportSection, string> = {
  研究背景: "背景資料",
  文獻探討: "文獻探討",
  研究方法: "研究方法",
  數據分析: "統計或資料分析",
  結論: "結論佐證",
};

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function sourceText(source: SourceRecord): string {
  return [
    source.title,
    source.abstract,
    source.publisher,
    source.containerTitle,
    source.url,
    source.sourceCategory,
    source.sourceType,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pushUnique(items: string[], item: string): void {
  if (!items.includes(item)) items.push(item);
}

function joinCoverage(items: string[]): string {
  if (items.length === 0) return "待建立資料基礎";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]}與${items[1]}`;
  return `${items.slice(0, -1).join("、")}與${items[items.length - 1]}`;
}

function proseList(items: string[], fallback: string): string {
  if (items.length === 0) return fallback;
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]}與${items[1]}`;
  return `${items.slice(0, -1).join("、")}與${items[items.length - 1]}`;
}

function firstSentence(text: string | null | undefined): string {
  const cleaned = cleanText(text);
  if (!cleaned) return "";
  const sentence = cleaned.split(/(?<=[。！？.!?])\s+/)[0]?.trim() ?? "";
  return sentence || cleaned;
}

function stripCitationTone(text: string): string {
  return text
    .replace(/^此來源(?:屬於|目前|直接支持|聚焦於)?/u, "")
    .replace(/^來源摘要：?/u, "")
    .replace(/^原始摘要整理：?/u, "")
    .replace(/^摘要：?/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function containsCjk(text: string): boolean {
  return /[\u3400-\u9fff]/u.test(text);
}

function sourceSummaryLead(source: SourceRecord): string {
  return (
    stripCitationTone(firstSentence(source.evidenceSummaryZhTw)) ||
    stripCitationTone(firstSentence(source.llmSummaryZhTw)) ||
    stripCitationTone(firstSentence(source.readableSummaryZhTW)) ||
    stripCitationTone(firstSentence(source.readableSummaryZhTw)) ||
    stripCitationTone(firstSentence(source.sourceRelevanceReasonZhTw)) ||
    firstSentence(source.abstract) ||
    firstSentence(source.snippet) ||
    cleanText(source.title)
  );
}

function summaryHighlights(sources: SourceRecord[], limit = 3): string[] {
  return sources
    .map(sourceSummaryLead)
    .filter(Boolean)
    .slice(0, limit);
}

function isMechanicalHighlight(text: string): boolean {
  return /直接命中|摘要可支撐主題|可作為主要證據|相關性高|主證據|缺少可驗證摘要片段|暫不產生主要主張|尚無可驗證/u.test(text);
}

function detailSentence(points: string[]): string {
  if (points.length === 0) return "";
  if (points.every((point) => containsCjk(point) && point.length <= 18 && !/[。；：]/u.test(point))) {
    return `現有來源重點集中在${proseList(points, "核心研究面向")}。`;
  }
  if (points.length === 1) return `依目前來源，可確認的重點是：${points[0]}。`;
  return `依目前來源，可確認的重點包括：${points.join("；")}。`;
}

function thematicHighlights(sources: SourceRecord[]): string[] {
  const labels: string[] = [];

  for (const source of sources) {
    const text = sourceText(source);

    if (/aircraft|aerospace|structure|structural|fatigue|life prediction|digital twin|airframe|alloy|composite|sensor|monitoring/i.test(text)) {
      pushUnique(labels, "結構、材料與壽命管理");
    }
    if (/flight dynamics|aeroelastic|aerodynamic|laminar|lift|drag|control system|fluid dynamics/i.test(text)) {
      pushUnique(labels, "氣動設計與飛行性能");
    }
    if (/electric|electrification|battery|power supply|hybrid|hydrogen|fuel cell|propulsion/i.test(text)) {
      pushUnique(labels, "電動化、氫能與新型推進");
    }
    if (/environment|climate|emission|carbon|fuel consumption|sustain|pollution/i.test(text)) {
      pushUnique(labels, "環境衝擊、燃料效率與減碳");
    }
    if (/manufacturing|additive manufacturing|supply chain|fabrication/i.test(text)) {
      pushUnique(labels, "製造流程與供應鏈");
    }
    if (/worker|mortality|health|occupational/i.test(text)) {
      pushUnique(labels, "產業勞動與健康風險");
    }
  }

  return labels.slice(0, 4);
}

function limitationSentence(
  sources: SourceRecord[],
  limitations: string[],
  insufficientSummary: boolean,
): string {
  const firstLimitation = limitations
    .map((item) => item.replace(/。+$/u, "").trim())
    .find(Boolean);
  const mostlyAbstractGrounded = sources.every(
    (source) =>
      source.evidenceGrounding === "abstract_grounded" ||
      !source.evidenceGrounding,
  );

  if (insufficientSummary) {
    return firstLimitation
      ? `不過，仍有部分來源只有摘要或書目線索，因此目前只能保守整理為：${firstLimitation}。`
      : "不過，仍有部分來源只有摘要或書目線索，正式結論前還需要再補齊更完整的可驗證內容。";
  }

  if (mostlyAbstractGrounded) {
    return "現階段多數內容仍來自摘要層級整理；若要寫成更完整的正式報告，仍建議再補全文片段、在地案例或官方統計。";
  }

  if (firstLimitation) {
    return `現階段仍需注意：${firstLimitation}。`;
  }

  return "";
}

function buildNarrativeSummary(
  sources: SourceRecord[],
  topic: string,
  coverage: string[],
  insufficientSummary: boolean,
): string {
  const synthesis = buildAcceptedSourceSynthesis(sources);
  const topicText = topic ? `「${topic}」` : "此主題";
  const sourceTypeText = joinCoverage(
    Array.from(new Set(sources.map(categoryCoverage))).slice(0, 4),
  );
  const coverageText = proseList(
    coverage.slice(0, 4),
    "背景、文獻與可驗證資料",
  );
  const directHighlights = synthesis.mainClaimsZhTw
    .slice(0, 3)
    .filter(Boolean)
    .filter((item) => !isMechanicalHighlight(item));
  const fallbackHighlights = Array.from(new Set(summaryHighlights(sources, 4)));
  const usableFallbackHighlights = fallbackHighlights.filter(
    (item) => !isMechanicalHighlight(item),
  );
  const highlights =
    directHighlights.length > 0 && directHighlights.some(containsCjk)
      ? directHighlights
      : usableFallbackHighlights.some(containsCjk)
        ? usableFallbackHighlights.slice(0, 3)
        : thematicHighlights(sources);
  const consensus = synthesis.consensusPointsZhTw[0] ?? "";
  const detail = detailSentence(highlights);
  const limitation = limitationSentence(
    sources,
    synthesis.limitationsZhTw,
    insufficientSummary,
  );
  const sourceCountSentence = `目前已接受 ${sources.length} 筆來源，資料類型以${sourceTypeText}為主，涵蓋${coverageText}。`;
  const consensusSentence = consensus
    ? `${consensus} 這表示現階段已能整理出初步共識，但不能超出來源真正提供的內容。`
    : "";

  return [
    `${topicText}的工作摘要只根據目前已接受來源整理，不沿用舊模板或預設結論。`,
    sourceCountSentence,
    detail,
    consensusSentence,
    limitation,
  ]
    .filter(Boolean)
    .join("");
}

function categoryCoverage(source: SourceRecord): string {
  const category = classifySourceRecord(source);
  switch (category) {
    case "academic_paper":
    case "journal_article":
      return "學術文獻";
    case "government_or_institution":
      return "官方或機構資料";
    case "news_or_web":
      return "社會現況或媒體案例";
    case "book":
      return "專書背景";
    default:
      return SOURCE_CATEGORY_LABELS[category];
  }
}

function keywordCoverage(source: SourceRecord): string[] {
  const text = sourceText(source);
  const labels: string[] = [];

  if (/health|sleep|attention|caffeine|sugar|diet|medical|健康|睡眠|注意力|咖啡因|糖|飲食|醫療/.test(text)) {
    labels.push("健康影響");
  }
  if (/social|student|teen|youth|family|community|society|青少年|學生|家庭|社會|社群|少子化/.test(text)) {
    labels.push("社會影響");
  }
  if (/environment|climate|pollution|plastic|waste|sustain|環境|氣候|污染|塑膠|廢棄|永續/.test(text)) {
    labels.push("環境影響");
  }
  if (/brand|marketing|consumer|advertis|market|品牌|行銷|消費|市場|廣告/.test(text)) {
    labels.push("行銷與消費");
  }
  if (/policy|government|regulation|ministry|政策|法規|政府|部會|機構/.test(text)) {
    labels.push("政策與制度");
  }
  if (/culture|history|festival|art|文化|歷史|節慶|藝術|流行音樂|動漫|花語|夜市/.test(text)) {
    labels.push("文化脈絡");
  }
  if (/data|statistics|survey|case|dataset|統計|調查|數據|個案|案例/.test(text)) {
    labels.push("個案或統計");
  }

  return labels;
}

function buildCoverage(sources: SourceRecord[]): string[] {
  const coverage: string[] = [];

  for (const source of sources) {
    for (const section of sourceRecommendedSections(source)) {
      pushUnique(coverage, SECTION_COVERAGE_LABELS[section]);
    }
    pushUnique(coverage, categoryCoverage(source));
    for (const label of keywordCoverage(source)) {
      pushUnique(coverage, label);
    }
  }

  return coverage.slice(0, 8);
}

function hasTaiwanContext(sources: SourceRecord[]): boolean {
  return sources.some((source) => /台灣|臺灣|taiwan|taipei|kaohsiung|tainan|taichung|taiwanese/i.test(sourceText(source)));
}

function hasRecentSource(sources: SourceRecord[], currentYear: number): boolean {
  return sources.some((source) => typeof source.year === "number" && source.year >= currentYear - 2);
}

function hasCategory(sources: SourceRecord[], categories: ReturnType<typeof classifySourceRecord>[]): boolean {
  return sources.some((source) => categories.includes(classifySourceRecord(source)));
}

function hasDataSignal(sources: SourceRecord[]): boolean {
  return sources.some((source) => /data|statistics|survey|dataset|percent|統計|調查|數據|比例|百分比/.test(sourceText(source)));
}

function hasCounterpointSignal(sources: SourceRecord[]): boolean {
  return sources.some((source) => /review|compare|controvers|limitation|critique|opposition|比較|爭議|限制|反方|批判/.test(sourceText(source)));
}

function buildGaps(sources: SourceRecord[], currentYear: number): string[] {
  if (sources.length === 0) {
    return ["尚未接受來源", "缺少可用摘要", "缺少官方資料"];
  }

  const gaps: string[] = [];

  if (sources.some((source) => !sourceHasUsableAbstract(source))) {
    gaps.push("部分來源摘要不足，已降為保守證據");
  }
  if (!hasTaiwanContext(sources)) gaps.push("缺少台灣在地資料");
  if (!hasRecentSource(sources, currentYear)) gaps.push("缺少近三年研究");
  if (!hasDataSignal(sources)) gaps.push("缺少統計數據");
  if (!hasCounterpointSignal(sources)) gaps.push("缺少反方觀點");
  if (!hasCategory(sources, ["government_or_institution"])) gaps.push("缺少官方資料");
  if (!hasCategory(sources, ["academic_paper", "journal_article"])) gaps.push("缺少學術研究");
  if (sources.length < 5) gaps.push("已接受來源數量偏少");

  return gaps.slice(0, 6);
}

function nextStepFromGaps(gaps: string[]): string {
  if (gaps.includes("尚未接受來源")) return "請先接受至少一筆可信來源，再建立報告草稿。";
  if (gaps.some((gap) => gap.includes("摘要不足"))) return "建議再補充具可用摘要或片段的高相關來源。";
  if (gaps.includes("缺少官方資料")) return "建議再補充政府統計資料或可信機構資料。";
  if (gaps.includes("缺少近三年研究")) return "建議加入一篇近三年研究。";
  if (gaps.includes("缺少台灣在地資料")) return "建議補充台灣案例或在地資料。";
  if (gaps.includes("缺少統計數據")) return "目前仍缺少可驗證的統計數據或調查資料。";
  return "可開始依研究問題整理段落，並逐段確認引用是否足夠。";
}

export function buildAcceptedSourceDigest(
  sources: SourceRecord[],
  options: BuildAcceptedSourceDigestOptions = {},
): AcceptedSourceDigest {
  const accepted = acceptedSourceRecords(dedupeSourceRecords(sources));
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const topic = cleanText(options.topic);
  const coverage = buildCoverage(accepted);
  const gaps = buildGaps(accepted, currentYear);
  const recommendedNextStep = nextStepFromGaps(gaps);

  if (accepted.length === 0) {
    return {
      version: ACCEPTED_SOURCE_DIGEST_VERSION,
      summary: "尚未接受任何來源；目前無法建立資料基礎摘要，也不應生成正式報告結論。",
      coverage,
      gaps,
      recommendedNextStep,
    };
  }

  const insufficientSummary = accepted.some((source) => !sourceHasUsableAbstract(source));
  const summary = buildNarrativeSummary(accepted, topic, coverage, insufficientSummary);

  return {
    version: ACCEPTED_SOURCE_DIGEST_VERSION,
    summary,
    coverage,
    gaps,
    recommendedNextStep,
  };
}
