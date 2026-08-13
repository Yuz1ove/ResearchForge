import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import type { ExtractedChunk } from "./sourceContentExtractor";

export interface CleanedChunkResult {
  accepted: boolean;
  chunk?: ExtractedChunk;
  cleanedText: string;
  originalText: string;
  diagnostics: string[];
  removedLineCount: number;
  boilerplateRatio: number;
  overlapTerms: string[];
}

export interface EvidenceRelevanceResult {
  accepted: boolean;
  decision: "accepted" | "rejected" | "indeterminate";
  indeterminate: boolean;
  score: number;
  titleRelevance: number;
  bodyRelevance: number;
  sourceQuality: number;
  boilerplatePenalty: number;
  unrelatedPenalty: number;
  overlapTerms: string[];
  bridgeOverlapTerms: string[];
  diagnostics: string[];
  reason: string;
}

const BOILERPLATE_LINE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "skip_to_main_content", pattern: /^\s*skip to main content\s*$/iu },
  { label: "springer_moved_notice", pattern: /SpringerOpen journals have moved to Springer Nature Link/iu },
  { label: "browse_subject_areas", pattern: /^\s*Browse Subject Areas\s*$/iu },
  { label: "navigation", pattern: /^\s*(menu|navigation|nav|home|search|login|sign in|register|subscribe)\s*$/iu },
  { label: "footer", pattern: /^\s*(footer|privacy policy|terms\s+of\s+(?:use|service)|cookie|cookies|permissions|share|download citation|article metrics)\s*$/iu },
  { label: "journal_shell", pattern: /\b(journal information|about this journal|submit manuscript|editorial board|support center)\b/iu },
  { label: "plos_shell", pattern: /\b(PLOS|Public Library of Science)\b.*\b(Browse Subject Areas|article metrics|share|download citation)\b/iu },
];

const NOISE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "springer_moved_notice", pattern: /SpringerOpen journals have moved to Springer Nature Link/iu },
  { label: "skip_to_main_content", pattern: /Skip to main content/iu },
  { label: "browse_subject_areas", pattern: /Browse Subject Areas/iu },
  { label: "healthcare_big_data", pattern: /big data in healthcare|healthcare:\s*management,?\s*analysis/i },
  { label: "deep_sea_wilderness", pattern: /deep sea|wilderness/i },
  { label: "site_shell", pattern: /\b(cookie (?:policy|preferences|settings|consent)|privacy policy|terms\s+of\s+(?:use|service)|login|sign in|download citation|article metrics)\b/i },
];

const LITHIUM_TOPIC_TERMS = {
  zh: [
    "鋰電池",
    "锂电池",
    "鋰離子電池",
    "锂离子电池",
    "生活應用",
    "生活应用",
    "電池原理",
    "电池原理",
    "正極",
    "正极",
    "負極",
    "负极",
    "電解液",
    "电解液",
    "充放電",
    "充放电",
    "能量密度",
    "安全性",
    "回收",
  ],
  en: [
    "lithium battery",
    "lithium-ion battery",
    "li-ion battery",
    "applications",
    "battery principle",
    "cathode",
    "anode",
    "electrolyte",
    "charge discharge",
    "energy density",
    "safety",
    "recycling",
  ],
};

const TOPIC_ALIAS_GROUPS: Array<{ pattern: RegExp; terms: string[] }> = [
  {
    pattern: /藍光|蓝光|blue light|screen light/i,
    terms: [
      "blue light",
      "screen light",
      "light exposure",
      "藍光",
      "蓝光",
    ],
  },
  {
    pattern: /睡眠|sleep|circadian|melatonin/i,
    terms: [
      "sleep",
      "sleep quality",
      "sleep duration",
      "circadian",
      "melatonin",
      "睡眠",
      "睡眠品質",
      "睡眠质量",
    ],
  },
  {
    pattern: /青少年|高中生|adolescent|teenager|high school student/i,
    terms: [
      "adolescent",
      "adolescents",
      "teenager",
      "teenagers",
      "high school students",
      "青少年",
      "高中生",
    ],
  },
  {
    pattern: /腸道菌相|肠道菌相|腸道菌群|肠道菌群|腸道微生物|肠道微生物|gut microbiota|gut microbiome|gut-brain|gut brain/i,
    terms: [
      "gut microbiota",
      "gut microbiome",
      "intestinal microbiota",
      "intestinal microbiome",
      "microbiota-gut-brain axis",
      "microbiome-gut-brain axis",
      "gut-brain axis",
      "gut brain axis",
      "腸道菌相",
      "肠道菌相",
      "腸道微生物群",
      "肠道微生物群",
      "腸腦軸",
      "肠脑轴",
    ],
  },
  {
    pattern: /綠屋頂|绿屋顶|熱島|热岛|green roof|urban heat/i,
    terms: [
      "green roof",
      "green roofs",
      "urban heat island",
      "heat island",
      "roof greening",
      "vegetated roof",
      "urban temperature",
      "surface temperature",
      "temperature reduction",
      "都市",
      "綠屋頂",
      "熱島",
    ],
  },
  {
    pattern: /塑膠微粒|塑料微粒|微塑膠|微塑料|浮游|microplastic|plankton/i,
    terms: [
      "microplastic",
      "microplastics",
      "plankton",
      "zooplankton",
      "phytoplankton",
      "marine plankton",
      "plastic particles",
      "ingestion",
      "marine ecosystem",
      "塑膠微粒",
      "浮游生物",
    ],
  },
  {
    pattern: /咖啡因|注意力|caffeine|attention|vigilance/i,
    terms: [
      "caffeine",
      "attention",
      "vigilance",
      "sustained attention",
      "cognitive performance",
      "alertness",
      "reaction time",
      "注意力",
      "咖啡因",
    ],
  },
  {
    pattern: /生成式\s*AI|生成式人工智慧|寫作|写作|generative ai|writing/i,
    terms: [
      "generative ai",
      "artificial intelligence",
      "large language model",
      "writing",
      "writing instruction",
      "student writing",
      "learning",
      "education",
      "高中",
      "寫作",
      "學習",
    ],
  },
];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? compactWhitespace(value) : "";
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(compactWhitespace).filter(Boolean)));
}

function containsLithiumTopic(topic: string): boolean {
  return /鋰|锂|lithium|li-ion/i.test(topic);
}

function hasBuiltInCrossLanguageAliases(topic: string): boolean {
  return containsLithiumTopic(topic) ||
    TOPIC_ALIAS_GROUPS.some((group) => group.pattern.test(topic));
}

function tokenizeLatin(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function tokenizeCjk(value: string): string[] {
  const tokens: string[] = [];
  for (const match of value.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const text = match[0];
    tokens.push(text);
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= text.length - size; index += 1) {
        tokens.push(text.slice(index, index + size));
      }
    }
  }
  return tokens.filter((token) => token.length >= 2 && !/^(研究|報告|中的|以及|和|與|与|方式|原理|應用|应用)$/u.test(token));
}

export function topicTermsForEvidence(topic: string): string[] {
  const normalized = compactWhitespace(topic);
  const terms = [
    ...tokenizeLatin(normalized),
    ...tokenizeCjk(normalized),
  ];
  if (containsLithiumTopic(normalized)) {
    terms.push(...LITHIUM_TOPIC_TERMS.zh, ...LITHIUM_TOPIC_TERMS.en);
  }
  for (const group of TOPIC_ALIAS_GROUPS) {
    if (group.pattern.test(normalized)) terms.push(...group.terms);
  }
  return uniqueStrings(terms).filter((term) => !/^(研究|報告|原理|應用|应用|生活|topic|report)$/iu.test(term));
}

function termInText(term: string, text: string): boolean {
  const lowerTerm = term.toLowerCase();
  const lowerText = text.toLowerCase();
  if (/[\u3400-\u9fff]/u.test(term)) return text.includes(term);
  return lowerText.includes(lowerTerm);
}

export function topicOverlapTerms(topic: string, text: string): string[] {
  const terms = topicTermsForEvidence(topic);
  return uniqueStrings(terms.filter((term) => termInText(term, text)));
}

function lineBoilerplateLabel(line: string): string | null {
  for (const entry of BOILERPLATE_LINE_PATTERNS) {
    if (entry.pattern.test(line)) return entry.label;
  }
  return null;
}

export function removeBoilerplateLines(text: string): {
  text: string;
  removedLineCount: number;
  originalLineCount: number;
  flags: string[];
} {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const kept: string[] = [];
  const flags: string[] = [];
  for (const line of lines) {
    const label = lineBoilerplateLabel(line);
    if (label) {
      flags.push(label);
      continue;
    }
    kept.push(line);
  }
  return {
    text: compressRepeatedText(kept.join("\n")),
    removedLineCount: lines.length - kept.length,
    originalLineCount: Math.max(lines.length, 1),
    flags: uniqueStrings(flags),
  };
}

export function compressRepeatedText(text: string): string {
  const seen = new Set<string>();
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => compactWhitespace(line))
    .filter(Boolean)
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return compactWhitespace(lines.join(" "));
}

function meaningfulTokenCount(text: string): number {
  return tokenizeLatin(text).length + tokenizeCjk(text).length;
}

function noiseFlags(text: string): string[] {
  return NOISE_PATTERNS
    .filter((entry) => entry.pattern.test(text))
    .map((entry) => entry.label);
}

function topicSpecificRejectionReason(topic: string, text: string): string | null {
  if (/塑膠微粒|塑料微粒|微塑膠|微塑料|microplastic/i.test(topic) && /浮游|plankton/i.test(topic)) {
    const hasMicroplastic = /塑膠微粒|塑料微粒|微塑膠|微塑料|microplastic|microplastics|plastic particles/i.test(text);
    const hasPlankton = /浮游|plankton|zooplankton|phytoplankton/i.test(text);
    if (!hasMicroplastic || !hasPlankton) return "missing_microplastic_plankton_overlap";
  }
  if (/咖啡因|caffeine/i.test(topic) && /注意力|attention|vigilance|alertness|cognitive|reaction time/i.test(topic)) {
    const hasCaffeine = /咖啡因|caffeine/i.test(text);
    const hasAttention = /注意力|attention|vigilance|alertness|cognitive performance|reaction time/i.test(text);
    if (!hasCaffeine || !hasAttention) return "missing_caffeine_attention_overlap";
  }
  if (/生成式\s*AI|生成式人工智慧|generative ai|large language model|llm/i.test(topic) && /寫作|写作|學習|学习|writing|learning|student|高中|education/i.test(topic)) {
    const hasGenerativeAi = /生成式\s*AI|生成式人工智慧|generative ai|large language model|llm|chatgpt|artificial intelligence/i.test(text);
    const topicRequiresWriting = /寫作|写作|writing/i.test(topic);
    const hasWritingLearning = topicRequiresWriting
      ? /寫作|写作|writing|literacy|composition|essay|revision/i.test(text)
      : /student|students|高中|school|education|learning|literacy|composition/i.test(text);
    if (!hasGenerativeAi || !hasWritingLearning) return "missing_generative_ai_writing_learning_overlap";
  }
  return null;
}

export function isBoilerplateChunk(text: string): boolean {
  const cleaned = removeBoilerplateLines(text);
  const ratio = cleaned.removedLineCount / cleaned.originalLineCount;
  return ratio >= 0.45 || noiseFlags(text).length > 0 || meaningfulTokenCount(cleaned.text) < 8;
}

function sourceQualityScore(source?: Partial<SourceCandidate> | null): number {
  if (!source) return 0.5;
  let score = typeof source.sourceQualityScore === "number" ? source.sourceQualityScore : 0.5;
  if (source.doi || source.hasDoi) score += 0.12;
  if (source.isPeerReviewed) score += 0.12;
  if (source.sourceType === "official" || source.recommendationBucket === "official_background") score += 0.08;
  if (source.recommendationBucket === "manual_review") score -= 0.12;
  if (source.recommendationBucket === "rejected") score -= 0.35;
  return Math.max(0, Math.min(1, score));
}

function sourceIsMetadataOnly(source?: Partial<SourceCandidate> | null): boolean {
  if (!source) return false;
  return source.accessLevel === "metadata_only" ||
    source.extractionMode === "metadata_only" ||
    source.sourceUseLevel === "metadata_context_only" ||
    source.evidenceGrounding === "metadata_only" ||
    source.canUseForClaims === false;
}

function relevanceFraction(topic: string, text: string): number {
  const terms = topicTermsForEvidence(topic);
  if (terms.length === 0) return 0.5;
  const overlap = topicOverlapTerms(topic, text);
  const denominator = Math.min(Math.max(terms.length, 1), 12);
  return Math.min(1, overlap.length / denominator);
}

const GENERIC_BRIDGE_TERMS = new Set([
  "analysis",
  "application",
  "applications",
  "data",
  "education",
  "effect",
  "effects",
  "fall",
  "method",
  "methods",
  "paper",
  "relationship",
  "report",
  "research",
  "result",
  "results",
  "study",
  "topic",
]);

function bridgeSeeds(input: {
  aliases?: string[];
  matchedConcepts?: string[];
  queryUsed?: string | null;
}): { trusted: string[]; query: string[]; all: string[] } {
  const trusted = uniqueStrings([
    ...(input.aliases ?? []).map(cleanString),
    ...(input.matchedConcepts ?? []).map(cleanString),
  ]);
  const query = uniqueStrings([cleanString(input.queryUsed)]);
  return { trusted, query, all: uniqueStrings([...trusted, ...query]) };
}

function specificBridgeTerms(seeds: string[]): string[] {
  return uniqueStrings(
    seeds.flatMap((seed) => topicTermsForEvidence(seed)),
  ).filter((term) => {
    const normalized = term.toLowerCase();
    return !GENERIC_BRIDGE_TERMS.has(normalized) &&
      (/[^\x00-\x7f]/u.test(term) ? term.length >= 2 : term.length >= 4);
  });
}

function relevanceFractionForTerms(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const overlap = terms.filter((term) => termInText(term, text));
  return Math.min(1, overlap.length / Math.min(Math.max(terms.length, 1), 12));
}

function seedHasDirectEvidenceMatch(seed: string, text: string): boolean {
  const terms = specificBridgeTerms([seed]);
  if (terms.length === 0) return false;
  const normalizedSeed = compactWhitespace(seed);
  const latinTokenCount = tokenizeLatin(normalizedSeed).length;
  if ((latinTokenCount >= 2 || /[\u3400-\u9fff]{2,}/u.test(normalizedSeed)) && termInText(normalizedSeed, text)) {
    return true;
  }
  const overlap = terms.filter((term) => termInText(term, text));
  return overlap.length >= Math.min(2, terms.length) ||
    (terms.length === 1 && terms[0]!.length >= 6 && overlap.length === 1);
}

function hasCrossLanguageMismatch(topic: string, evidence: string): boolean {
  const topicHasCjk = /[\u3400-\u9fff]/u.test(topic);
  const evidenceHasCjk = /[\u3400-\u9fff]/u.test(evidence);
  const topicHasLatin = /[A-Za-z]{3,}/u.test(topic);
  const evidenceHasLatin = /[A-Za-z]{3,}/u.test(evidence);
  return (topicHasCjk && !evidenceHasCjk && evidenceHasLatin) ||
    (topicHasLatin && !topicHasCjk && evidenceHasCjk && !evidenceHasLatin);
}

export function scoreEvidenceRelevance(input: {
  topic: string;
  title?: string | null;
  body: string;
  source?: Partial<SourceCandidate> | null;
  boilerplateRatio?: number;
  aliases?: string[];
  matchedConcepts?: string[];
  queryUsed?: string | null;
}): EvidenceRelevanceResult {
  const topic = compactWhitespace(input.topic);
  const title = cleanString(input.title);
  const body = cleanString(input.body);
  const combined = `${title} ${body}`;
  const flags = noiseFlags(combined);
  const literalTitleRelevance = relevanceFraction(topic, title);
  const literalBodyRelevance = relevanceFraction(topic, body);
  const explicitBridge = bridgeSeeds(input);
  const bridgeTerms = specificBridgeTerms(explicitBridge.all);
  const bridgeOverlapTerms = uniqueStrings(
    bridgeTerms.filter((term) => termInText(term, combined)),
  );
  const trustedBridgeMatched = explicitBridge.trusted.some((seed) => seedHasDirectEvidenceMatch(seed, combined));
  const queryBridgeMatched = explicitBridge.query.some((seed) => seedHasDirectEvidenceMatch(seed, combined));
  const bridgeMatched = trustedBridgeMatched || queryBridgeMatched;
  const titleRelevance = Math.max(
    literalTitleRelevance,
    bridgeMatched ? relevanceFractionForTerms(bridgeTerms, title) : 0,
  );
  const bodyRelevance = Math.max(
    literalBodyRelevance,
    bridgeMatched ? relevanceFractionForTerms(bridgeTerms, body) : 0,
  );
  const quality = sourceQualityScore(input.source);
  const metadataOnly = sourceIsMetadataOnly(input.source);
  const exactBonus = topicOverlapTerms(topic, combined).some((term) => term.length >= 4) ? 0.12 : 0;
  const boilerplatePenalty = Math.min(0.45, input.boilerplateRatio ?? 0);
  let unrelatedPenalty = 0;
  if (containsLithiumTopic(topic) && /healthcare|deep sea|wilderness|publisher moved|SpringerOpen journals have moved/i.test(combined)) {
    unrelatedPenalty = 0.55;
  }
  if (flags.length > 0) unrelatedPenalty = Math.max(unrelatedPenalty, 0.35);
  const topicSpecificReject = topicSpecificRejectionReason(topic, combined);
  const score =
    titleRelevance * 0.28 +
    bodyRelevance * 0.42 +
    quality * 0.18 +
    exactBonus -
    boilerplatePenalty -
    unrelatedPenalty;
  const overlapTerms = topicOverlapTerms(topic, combined);
  const relevanceMatched = overlapTerms.length > 0 || bridgeMatched;
  const diagnostics = uniqueStrings([
    ...flags.map((flag) => `boilerplate:${flag}`),
    ...overlapTerms.map((term) => `topic_overlap:${term}`),
    ...bridgeOverlapTerms.map((term) => `bridge_overlap:${term}`),
    bridgeMatched ? "relevance_bridge:matched" : "",
    explicitBridge.all.length > 0 && !bridgeMatched ? "relevance_bridge:not_matched" : "",
    metadataOnly ? "rejected:metadata_only_source" : "",
    `source_quality:${quality.toFixed(2)}`,
  ]);
  const threshold = containsLithiumTopic(topic) ? 0.22 : 0.16;
  const accepted =
    score >= threshold &&
    flags.length === 0 &&
    relevanceMatched &&
    !topicSpecificReject &&
    !metadataOnly;
  const indeterminate =
    !accepted &&
    flags.length === 0 &&
    !topicSpecificReject &&
    !metadataOnly &&
    overlapTerms.length === 0 &&
    explicitBridge.all.length === 0 &&
    !hasBuiltInCrossLanguageAliases(topic) &&
    hasCrossLanguageMismatch(topic, combined);
  const decision: EvidenceRelevanceResult["decision"] = accepted
    ? "accepted"
    : indeterminate
      ? "indeterminate"
      : "rejected";
  const reason = accepted
    ? bridgeMatched && overlapTerms.length === 0
      ? `accepted: relevance ${score.toFixed(2)} via explicit bridge (${bridgeOverlapTerms.join(",")})`
      : `accepted: relevance ${score.toFixed(2)} with ${overlapTerms.length} topic overlaps`
    : indeterminate
      ? "indeterminate: cross-language relevance requires an explicit alias, matchedConcept, or queryUsed bridge"
    : metadataOnly
      ? "rejected: metadata-only source cannot support evidence claims"
    : flags.length > 0
      ? `rejected: boilerplate/noise ${flags.join(",")}`
      : topicSpecificReject
        ? `rejected: ${topicSpecificReject}`
      : `rejected: low topic relevance ${score.toFixed(2)}`;
  return {
    accepted,
    decision,
    indeterminate,
    score: Math.max(0, Math.min(1, score)),
    titleRelevance,
    bodyRelevance,
    sourceQuality: quality,
    boilerplatePenalty,
    unrelatedPenalty,
    overlapTerms,
    bridgeOverlapTerms,
    diagnostics: uniqueStrings([...diagnostics, `decision:${decision}`]),
    reason,
  };
}

export function cleanExtractedTextChunk(input: {
  topic: string;
  chunk: ExtractedChunk;
  source?: Partial<SourceCandidate> | null;
  aliases?: string[];
  matchedConcepts?: string[];
  queryUsed?: string | null;
  minMeaningfulTokens?: number;
}): CleanedChunkResult {
  const originalText = cleanString(input.chunk.text);
  const removed = removeBoilerplateLines(originalText);
  const boilerplateRatio = removed.removedLineCount / removed.originalLineCount;
  const flags = noiseFlags(originalText);
  const cleanedText = compactWhitespace(removed.text);
  const diagnostics = uniqueStrings([
    ...removed.flags.map((flag) => `removed:${flag}`),
    ...flags.map((flag) => `noise:${flag}`),
  ]);
  const minMeaningfulTokens = input.minMeaningfulTokens ?? 8;
  const tokenCount = meaningfulTokenCount(cleanedText);
  if (!cleanedText) {
    return {
      accepted: false,
      cleanedText,
      originalText,
      diagnostics: [...diagnostics, "rejected:empty_after_boilerplate_cleaning"],
      removedLineCount: removed.removedLineCount,
      boilerplateRatio,
      overlapTerms: [],
    };
  }
  if (boilerplateRatio >= 0.45 || flags.length > 0) {
    return {
      accepted: false,
      cleanedText,
      originalText,
      diagnostics: [...diagnostics, `rejected:boilerplate_ratio:${boilerplateRatio.toFixed(2)}`],
      removedLineCount: removed.removedLineCount,
      boilerplateRatio,
      overlapTerms: topicOverlapTerms(input.topic, cleanedText),
    };
  }
  if (tokenCount < minMeaningfulTokens) {
    return {
      accepted: false,
      cleanedText,
      originalText,
      diagnostics: [...diagnostics, `rejected:too_short:${tokenCount}`],
      removedLineCount: removed.removedLineCount,
      boilerplateRatio,
      overlapTerms: topicOverlapTerms(input.topic, cleanedText),
    };
  }
  const relevance = scoreEvidenceRelevance({
    topic: input.topic,
    title: input.source?.title,
    body: cleanedText,
    source: input.source,
    boilerplateRatio,
    aliases: input.aliases,
    matchedConcepts: input.matchedConcepts ?? input.source?.matchedConcepts,
    queryUsed: input.queryUsed ?? input.source?.queryUsed,
  });
  if (!relevance.accepted) {
    return {
      accepted: false,
      cleanedText,
      originalText,
      diagnostics: uniqueStrings([...diagnostics, ...relevance.diagnostics, relevance.reason]),
      removedLineCount: removed.removedLineCount,
      boilerplateRatio,
      overlapTerms: relevance.overlapTerms,
    };
  }
  return {
    accepted: true,
    chunk: {
      ...input.chunk,
      text: cleanedText,
      char_start: input.chunk.char_start,
      char_end:
        typeof input.chunk.char_start === "number"
          ? input.chunk.char_start + cleanedText.length
          : cleanedText.length,
    },
    cleanedText,
    originalText,
    diagnostics: uniqueStrings([...diagnostics, ...relevance.diagnostics, relevance.reason]),
    removedLineCount: removed.removedLineCount,
    boilerplateRatio,
    overlapTerms: relevance.overlapTerms,
  };
}
