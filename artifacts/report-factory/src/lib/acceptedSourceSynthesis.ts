import type { SourceEvidenceChainEntry, SourceEvidenceSnippet, SourceRecord } from "./sourceRecords.ts";

export interface AcceptedSourceSynthesis {
  sourceCount: number;
  mainClaimsZhTw: string[];
  consensusPointsZhTw: string[];
  evidenceByFacet: {
    causes: string[];
    currentStatus: string[];
    dataBackground: string[];
    impacts: string[];
    policy: string[];
    limitations: string[];
  };
  limitationsZhTw: string[];
  recommendedReportFocusZhTw: string[];
}

type EvidenceFacetKey = keyof AcceptedSourceSynthesis["evidenceByFacet"];

const FACET_KEYS = ["causes", "currentStatus", "dataBackground", "impacts", "policy", "limitations"] as const satisfies readonly EvidenceFacetKey[];

const FACET_LABELS: Record<EvidenceFacetKey, string> = {
  causes: "成因分析",
  currentStatus: "現況分析",
  dataBackground: "數據背景",
  impacts: "影響分析",
  policy: "政策與因應",
  limitations: "資料限制",
};

const FACET_PATTERNS: Array<[EvidenceFacetKey, RegExp]> = [
  ["causes", /成因|原因|greenhouse|fossil|carbon dioxide|co2|methane|emission|anthropogenic|attribution|human activit|溫室氣體|二氧化碳|甲烷|化石燃料|排放|人為|森林砍伐/i],
  ["currentStatus", /現況|現狀|observed|warming|temperature|trend|sea level|concentration|indicator|state of climate|ipcc|wmo|nasa|noaa|全球升溫|觀測|趨勢|海平面|濃度|氣候指標/i],
  ["dataBackground", /data|statistics|dataset|survey|sample|method|indicator|數據|資料|統計|指標|調查|樣本|方法/i],
  ["impacts", /impact|effect|risk|damage|health|ecosystem|影響|衝擊|風險|健康|生態/i],
  ["policy", /policy|governance|mitigation|adaptation|response|resilience|committee|政策|治理|減緩|調適|因應|應對|韌性/i],
  ["limitations", /limitation|uncertain|insufficient|missing|weak|limited|gap|限制|不足|不確定|缺少|弱線索/i],
];

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function truncateText(text: string, maxLength = 120): string {
  const chars = Array.from(cleanText(text));
  if (chars.length <= maxLength) return chars.join("");
  return `${chars.slice(0, maxLength - 1).join("").trim()}…`;
}

function emptyEvidenceByFacet(): AcceptedSourceSynthesis["evidenceByFacet"] {
  return {
    causes: [],
    currentStatus: [],
    dataBackground: [],
    impacts: [],
    policy: [],
    limitations: [],
  };
}

function pushUnique(items: string[], value: string, maxItems = 6): void {
  const normalized = truncateText(value);
  if (!normalized || items.includes(normalized) || items.length >= maxItems) return;
  items.push(normalized);
}

function sourceLabel(source: SourceRecord, index: number): string {
  const title = cleanText(source.title);
  const year = source.year ? `（${source.year}）` : "";
  return title ? `「${truncateText(title, 48)}」${year}` : `第 ${index + 1} 筆來源`;
}

function textForFacet(source: SourceRecord, extraText: string): string {
  return [
    source.mainEvidenceFacet,
    source.evidenceSummaryZhTw,
    source.sourceRelevanceReasonZhTw,
    ...(source.matchedFacets ?? []),
    ...(source.usableSections ?? []),
    extraText,
  ]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join(" ");
}

function facetKeysFor(source: SourceRecord, extraText: string): EvidenceFacetKey[] {
  const text = textForFacet(source, extraText);
  const matched = FACET_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([key]) => key);

  if (matched.length > 0) return Array.from(new Set(matched));
  return ["dataBackground"];
}

function snippetEvidenceText(snippet: SourceEvidenceSnippet): string {
  return cleanText(snippet.snippetZhTw) || cleanText(snippet.reasoningZhTw) || cleanText(snippet.originalSnippet);
}

function chainEvidenceText(entry: SourceEvidenceChainEntry): string {
  return cleanText(entry.reasoningZhTw) || `${entry.facetLabelZhTw}：${entry.matchedTerms.join("、")}`;
}

function sourceHasEvidence(source: SourceRecord): boolean {
  return Boolean(source.evidenceSnippets?.length);
}

function limitationForMissingEvidence(source: SourceRecord, index: number): string {
  return `${sourceLabel(source, index)}缺少可驗證摘要片段，暫不產生主要主張。`;
}

function recommendedFocusForFacet(key: EvidenceFacetKey): string | null {
  if (key === "causes") return "優先聚焦成因分析：整合溫室氣體、化石燃料、人為活動或排放來源等證據。";
  if (key === "currentStatus") return "補強現況分析：整理觀測升溫、濃度趨勢、海平面或氣候指標等資料。";
  if (key === "dataBackground") return "建立數據背景：交代資料來源、指標定義、調查或統計脈絡。";
  if (key === "impacts") return "延伸影響分析：把風險、健康、生態或社會衝擊放在主證據之後說明。";
  if (key === "policy") return "補充政策與因應：把治理、調適或減緩策略作為討論與建議段落。";
  return null;
}

export function buildAcceptedSourceSynthesis(acceptedSources: SourceRecord[]): AcceptedSourceSynthesis {
  const evidenceByFacet = emptyEvidenceByFacet();
  const mainClaimsZhTw: string[] = [];
  const limitationsZhTw: string[] = [];
  const sourceIdsByFacet = new Map<EvidenceFacetKey, Set<string>>();

  acceptedSources.forEach((source, index) => {
    const sourceKey = source.id || sourceLabel(source, index);
    const snippets = source.evidenceSnippets ?? [];
    const chains = source.evidenceChain ?? [];

    if (!sourceHasEvidence(source)) {
      const limitation = limitationForMissingEvidence(source, index);
      pushUnique(limitationsZhTw, limitation, 8);
      pushUnique(evidenceByFacet.limitations, limitation, 8);
      return;
    }

    snippets
      .slice()
      .sort((left, right) => right.score - left.score)
      .forEach((snippet) => {
        const evidenceText = snippetEvidenceText(snippet);
        if (!evidenceText) return;

        if (snippet.supportLevel !== "weak") {
          pushUnique(mainClaimsZhTw, evidenceText);
        } else {
          pushUnique(evidenceByFacet.limitations, `弱證據：${evidenceText}`, 8);
        }

        for (const facetKey of facetKeysFor(source, `${snippet.matchedFacet} ${evidenceText} ${snippet.reasoningZhTw}`)) {
          pushUnique(evidenceByFacet[facetKey], evidenceText);
          if (facetKey !== "limitations") {
            const sourceIds = sourceIdsByFacet.get(facetKey) ?? new Set<string>();
            sourceIds.add(sourceKey);
            sourceIdsByFacet.set(facetKey, sourceIds);
          }
        }
      });

    chains.forEach((entry) => {
      const evidenceText = chainEvidenceText(entry);
      if (!evidenceText) return;
      for (const facetKey of facetKeysFor(source, `${entry.facetLabelZhTw} ${evidenceText}`)) {
        pushUnique(evidenceByFacet[facetKey], evidenceText);
        if (facetKey !== "limitations") {
          const sourceIds = sourceIdsByFacet.get(facetKey) ?? new Set<string>();
          sourceIds.add(sourceKey);
          sourceIdsByFacet.set(facetKey, sourceIds);
        }
      }
    });

    if (source.evidenceGrounding === "metadata_only" || source.evidenceGrounding === "insufficient") {
      pushUnique(limitationsZhTw, `${sourceLabel(source, index)}的摘要 grounding 不足，正式撰寫時只能作為保守線索。`, 8);
    }
  });

  const consensusPointsZhTw = Array.from(sourceIdsByFacet.entries())
    .filter(([, sourceIds]) => sourceIds.size >= 2)
    .map(([facetKey, sourceIds]) => `多筆來源共同支撐${FACET_LABELS[facetKey]}（${sourceIds.size} 筆）。`)
    .slice(0, 4);

  if (acceptedSources.length === 0) {
    pushUnique(limitationsZhTw, "尚未接受來源，無法建立資料匯聚摘要。", 8);
  }
  if (acceptedSources.length > 0 && mainClaimsZhTw.length === 0) {
    pushUnique(limitationsZhTw, "已接受來源缺少可驗證摘要片段，暫不形成主要主張。", 8);
  }
  if (acceptedSources.length > 1 && consensusPointsZhTw.length === 0) {
    pushUnique(limitationsZhTw, "目前缺少兩筆以上來源共同支撐同一面向，跨來源共識仍不足。", 8);
  }

  const recommendedReportFocusZhTw = FACET_KEYS
    .filter((key) => key !== "limitations" && evidenceByFacet[key].length > 0)
    .map((key) => recommendedFocusForFacet(key))
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);

  if (recommendedReportFocusZhTw.length === 0) {
    recommendedReportFocusZhTw.push("先補充具可驗證摘要片段的高相關來源，再撰寫正式摘要與結論。");
  }

  return {
    sourceCount: acceptedSources.length,
    mainClaimsZhTw,
    consensusPointsZhTw,
    evidenceByFacet,
    limitationsZhTw,
    recommendedReportFocusZhTw,
  };
}
