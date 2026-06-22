import type {
  EvidenceSupportLevel,
  SourceEvidenceChainEntry,
  SourceEvidenceSnippet,
  SourceRecord,
} from "./sourceRecords.ts";
import { buildTopicFacets, type TopicFacets } from "./topicFacets.ts";

export type EvidenceGrounding =
  | "abstract_grounded"
  | "snippet_grounded"
  | "metadata_only"
  | "insufficient";

export interface SourceEvidenceProfile {
  groundingStatus: EvidenceGrounding;
  evidenceSnippets: SourceEvidenceSnippet[];
  originalSnippets: string[];
  summaryZhTw: string;
  matchedRequiredFacets: string[];
  matchedSecondaryFacets: string[];
  evidenceChain: SourceEvidenceChainEntry[];
  mainEvidenceFacet: string | null;
  snippetScore: number;
  directSnippetCount: number;
  hasRequiredEvidence: boolean;
}

const METADATA_ONLY_SUMMARY =
  "目前只有書目資料，尚未取得摘要；需開啟原文確認。";
const INSUFFICIENT_SUMMARY =
  "摘要不足，尚無足夠可驗證片段判斷此來源是否能支撐研究主題。";

function cleanText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function lower(value: string): string {
  return cleanText(value).toLowerCase();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function truncateText(text: string, maxLength = 190): string {
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

function containsTerm(text: string, term: string): boolean {
  const haystack = lower(text);
  const needle = lower(term);
  return Boolean(needle) && haystack.includes(needle);
}

function matchedTerms(text: string, terms: string[]): string[] {
  return unique(terms.filter((term) => containsTerm(text, term)));
}

function facetTerms(facets: TopicFacets): string[] {
  return unique([
    ...facets.topicCore,
    ...facets.requiredFacets.flatMap((facet) => facet.terms),
    ...facets.secondaryFacets.flatMap((facet) => facet.terms),
  ]);
}

function facetSentenceScore(sentence: string, facets: TopicFacets): number {
  const coreHits = matchedTerms(sentence, facets.topicCore).length;
  const requiredHits = facets.requiredFacets.reduce(
    (count, facet) => count + (matchedTerms(sentence, facet.terms).length > 0 ? 1 : 0),
    0,
  );
  const secondaryHits = facets.secondaryFacets.reduce(
    (count, facet) => count + (matchedTerms(sentence, facet.terms).length > 0 ? 1 : 0),
    0,
  );
  return coreHits * 4 + requiredHits * 5 + secondaryHits;
}

function supportLevelForSentence(
  sentence: string,
  facets: TopicFacets,
  matchedFacetKind: "required" | "secondary" | "none",
): EvidenceSupportLevel {
  const hasCore = matchedTerms(sentence, facets.topicCore).length > 0;
  const requiredHits = facets.requiredFacets.reduce(
    (count, facet) => count + (matchedTerms(sentence, facet.terms).length > 0 ? 1 : 0),
    0,
  );

  if (matchedFacetKind === "required" && hasCore && requiredHits > 0) return "direct";
  if (matchedFacetKind === "required" && requiredHits > 0) return "direct";
  if (matchedFacetKind === "secondary" && (hasCore || requiredHits > 0)) return "indirect";
  if (hasCore) return "weak";
  return "weak";
}

function matchedFacetLabels(text: string, facets: TopicFacets, facetKind: "required" | "secondary"): string[] {
  const groups = facetKind === "required" ? facets.requiredFacets : facets.secondaryFacets;
  return groups
    .filter((facet) => matchedTerms(text, facet.terms).length > 0)
    .map((facet) => facet.labelZhTw);
}

function translateEvidenceSnippet(sentence: string, facets: TopicFacets): string {
  const text = lower(sentence);
  const pieces: string[] = [];

  if (/greenhouse gas|greenhouse gases|溫室氣體/.test(text)) pieces.push("溫室氣體");
  if (/fossil fuel|fossil fuels|combustion|化石燃料/.test(text)) pieces.push("化石燃料燃燒");
  if (/carbon dioxide|co2|二氧化碳/.test(text)) pieces.push("二氧化碳");
  if (/methane|甲烷/.test(text)) pieces.push("甲烷");
  if (/emission|排放/.test(text)) pieces.push("排放趨勢");
  if (/anthropogenic|human activities|人為/.test(text)) pieces.push("人為活動");
  if (/land use|deforestation|土地利用|森林砍伐/.test(text)) pieces.push("土地利用變遷");
  if (/observed warming|temperature|global warming|全球升溫|溫度/.test(text)) pieces.push("觀測到的升溫");
  if (/co2 concentration|concentration|濃度/.test(text)) pieces.push("溫室氣體濃度");
  if (/sea level|海平面/.test(text)) pieces.push("海平面變化");
  if (/ipcc|wmo|nasa|noaa/.test(text)) pieces.push("權威氣候評估或官方資料");

  if (pieces.length > 0) {
    return `此片段指出${unique(pieces).slice(0, 4).join("、")}與${facets.topicCore[0] ?? "主題"}相關。`;
  }

  return truncateText(sentence);
}

function reasoningForSnippet(
  facetLabel: string,
  matchedTermsForFacet: string[],
  supportLevel: EvidenceSupportLevel,
): string {
  const terms = matchedTermsForFacet.slice(0, 4).join("、");
  if (supportLevel === "direct") {
    return `此片段直接命中${facetLabel}${terms ? `（${terms}）` : ""}，可作為主要證據。`;
  }
  if (supportLevel === "indirect") {
    return `此片段支撐${facetLabel}${terms ? `（${terms}）` : ""}的背景或延伸脈絡。`;
  }
  return `此片段只提供${facetLabel}${terms ? `（${terms}）` : ""}的弱線索，需搭配其他來源確認。`;
}

function buildSnippetFromSentence(
  sentence: string,
  topicFacets: TopicFacets,
): SourceEvidenceSnippet | null {
  const requiredMatches = topicFacets.requiredFacets
    .map((facet) => ({
      facet,
      matchedTerms: matchedTerms(sentence, facet.terms),
    }))
    .filter((item) => item.matchedTerms.length > 0);
  const secondaryMatches = topicFacets.secondaryFacets
    .map((facet) => ({
      facet,
      matchedTerms: matchedTerms(sentence, facet.terms),
    }))
    .filter((item) => item.matchedTerms.length > 0);
  const primaryMatch = requiredMatches[0] ?? secondaryMatches[0];
  if (!primaryMatch) return null;

  const matchedFacetKind = requiredMatches.length > 0 ? "required" : "secondary";
  const supportLevel = supportLevelForSentence(sentence, topicFacets, matchedFacetKind);
  const coreMatches = matchedTerms(sentence, topicFacets.topicCore);
  const allMatchedTerms = unique([...primaryMatch.matchedTerms, ...coreMatches]);
  const score =
    facetSentenceScore(sentence, topicFacets)
    + (supportLevel === "direct" ? 18 : supportLevel === "indirect" ? 8 : 2)
    + allMatchedTerms.length;

  return {
    originalSnippet: truncateText(sentence, 240),
    snippetZhTw: translateEvidenceSnippet(sentence, topicFacets),
    matchedFacet: primaryMatch.facet.labelZhTw,
    matchedTerms: allMatchedTerms,
    supportLevel,
    reasoningZhTw: reasoningForSnippet(primaryMatch.facet.labelZhTw, allMatchedTerms, supportLevel),
    score,
  };
}

function buildEvidenceChain(snippets: SourceEvidenceSnippet[]): SourceEvidenceChainEntry[] {
  const byFacet = new Map<string, SourceEvidenceChainEntry>();
  for (const snippet of snippets) {
    const existing = byFacet.get(snippet.matchedFacet);
    if (!existing) {
      byFacet.set(snippet.matchedFacet, {
        facetLabelZhTw: snippet.matchedFacet,
        matchedTerms: snippet.matchedTerms,
        supportLevel: snippet.supportLevel,
        reasoningZhTw: snippet.reasoningZhTw,
      });
      continue;
    }

    const supportRank = { direct: 3, indirect: 2, weak: 1 } satisfies Record<EvidenceSupportLevel, number>;
    const strongerSupport =
      supportRank[snippet.supportLevel] > supportRank[existing.supportLevel]
        ? snippet.supportLevel
        : existing.supportLevel;
    byFacet.set(snippet.matchedFacet, {
      facetLabelZhTw: snippet.matchedFacet,
      matchedTerms: unique([...existing.matchedTerms, ...snippet.matchedTerms]).slice(0, 6),
      supportLevel: strongerSupport,
      reasoningZhTw: strongerSupport === snippet.supportLevel ? snippet.reasoningZhTw : existing.reasoningZhTw,
    });
  }

  return Array.from(byFacet.values()).slice(0, 4);
}

function buildSummary(snippets: string[], facets: TopicFacets): string {
  if (snippets.length === 0) return INSUFFICIENT_SUMMARY;

  const combined = lower(snippets.join(" "));
  const focus: string[] = [];
  if (/greenhouse gas|greenhouse gases|溫室氣體/.test(combined)) focus.push("溫室氣體");
  if (/fossil fuel|fossil fuels|化石燃料/.test(combined)) focus.push("化石燃料");
  if (/carbon dioxide|co2|二氧化碳/.test(combined)) focus.push("二氧化碳");
  if (/methane|甲烷/.test(combined)) focus.push("甲烷");
  if (/emission|排放/.test(combined)) focus.push("排放");
  if (/land use|deforestation|土地利用|森林砍伐/.test(combined)) focus.push("土地利用變遷");
  if (/observed warming|temperature|global warming|全球升溫|溫度/.test(combined)) focus.push("觀測升溫");
  if (/co2 concentration|concentration|濃度/.test(combined)) focus.push("溫室氣體濃度");
  if (/sea level|海平面/.test(combined)) focus.push("海平面");

  if (focus.length > 0) {
    return `此來源可用摘要片段涵蓋${unique(focus).slice(0, 5).join("、")}，可用來判斷${facets.topicCore[0] ?? "研究主題"}的成因或現況。`;
  }

  return truncateText(snippets.map((snippet) => translateEvidenceSnippet(snippet, facets)).join(" "));
}

export function classifyEvidenceGrounding(source: SourceRecord): EvidenceGrounding {
  const abstract = cleanText(source.abstract);
  if (abstract.length >= 24) return "abstract_grounded";
  if (abstract.length > 0 || cleanText(source.title).length > 0) {
    return "metadata_only";
  }
  return "insufficient";
}

export function extractEvidenceSnippets(source: SourceRecord, topicFacets: TopicFacets): SourceEvidenceSnippet[] {
  const abstract = cleanText(source.abstract);
  if (abstract.length < 24) return [];

  const terms = facetTerms(topicFacets);
  const sentences = splitSentences(abstract);
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: facetSentenceScore(sentence, topicFacets),
      hasFacetHit: matchedTerms(sentence, terms).length > 0,
    }))
    .filter((item) => item.hasFacetHit)
    .sort((a, b) => (b.score === a.score ? a.index - b.index : b.score - a.score));

  const selected = ranked.length > 0 ? ranked.slice(0, 3).map((item) => item.sentence) : sentences.slice(0, 1);
  return selected
    .map((sentence) => buildSnippetFromSentence(sentence, topicFacets))
    .filter((snippet): snippet is SourceEvidenceSnippet => Boolean(snippet));
}

export function buildSourceEvidenceProfile(
  source: SourceRecord,
  topicFacets: TopicFacets = buildTopicFacets(""),
): SourceEvidenceProfile {
  const groundingStatus = classifyEvidenceGrounding(source);
  const evidenceSnippets = extractEvidenceSnippets(source, topicFacets);
  const searchableText = [
    source.title,
    source.abstract,
    source.publisher,
    source.containerTitle,
  ]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  const matchedRequiredFacets = matchedFacetLabels(searchableText, topicFacets, "required");
  const matchedSecondaryFacets = matchedFacetLabels(searchableText, topicFacets, "secondary");
  const evidenceChain = buildEvidenceChain(evidenceSnippets);
  const directSnippetCount = evidenceSnippets.filter((snippet) => snippet.supportLevel === "direct").length;
  const hasRequiredEvidence =
    matchedRequiredFacets.length > 0
    && evidenceSnippets.some((snippet) => snippet.supportLevel === "direct" && matchedRequiredFacets.includes(snippet.matchedFacet));
  const snippetScore = evidenceSnippets.reduce((sum, snippet) => sum + snippet.score, 0);
  const mainEvidenceFacet = evidenceChain[0]?.facetLabelZhTw ?? null;

  if (groundingStatus === "metadata_only") {
    return {
      groundingStatus,
      evidenceSnippets: [],
      originalSnippets: [],
      summaryZhTw: METADATA_ONLY_SUMMARY,
      matchedRequiredFacets,
      matchedSecondaryFacets,
      evidenceChain: [],
      mainEvidenceFacet: null,
      snippetScore: 0,
      directSnippetCount: 0,
      hasRequiredEvidence: false,
    };
  }

  if (groundingStatus === "insufficient") {
    return {
      groundingStatus,
      evidenceSnippets: [],
      originalSnippets: [],
      summaryZhTw: INSUFFICIENT_SUMMARY,
      matchedRequiredFacets,
      matchedSecondaryFacets,
      evidenceChain: [],
      mainEvidenceFacet: null,
      snippetScore: 0,
      directSnippetCount: 0,
      hasRequiredEvidence: false,
    };
  }

  return {
    groundingStatus: evidenceSnippets.length > 0 ? groundingStatus : "insufficient",
    evidenceSnippets,
    originalSnippets: evidenceSnippets.map((snippet) => snippet.originalSnippet),
    summaryZhTw: buildSummary(evidenceSnippets.map((snippet) => snippet.originalSnippet), topicFacets),
    matchedRequiredFacets,
    matchedSecondaryFacets,
    evidenceChain,
    mainEvidenceFacet,
    snippetScore,
    directSnippetCount,
    hasRequiredEvidence,
  };
}
