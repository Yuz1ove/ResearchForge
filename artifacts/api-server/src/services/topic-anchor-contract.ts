import { createHash } from "node:crypto";

export type TopicAnchorKind = "entity" | "relation" | "phrase" | "constraint";
export type TopicAnchorProvenance =
  | "original_input"
  | "structured_input_field"
  | "registered_alias";

export interface TopicAnchor {
  readonly id: string;
  readonly kind: TopicAnchorKind;
  readonly sourceText: string;
  readonly sourceSpan?: {
    readonly start: number;
    readonly end: number;
  };
  readonly canonicalText: string;
  readonly aliases: readonly string[];
  readonly required: boolean;
  readonly provenance: TopicAnchorProvenance;
}

export interface ForbiddenExpansion {
  readonly term: string;
  readonly aliases?: readonly string[];
  readonly reason: string;
}

export interface TopicAnchorContract {
  readonly contractVersion: "topic-anchor-contract:v1";
  readonly extractionVersion: "topic-anchor-extraction:v1";
  readonly originalTopic: string;
  readonly originalTopicHash: string;
  readonly canonicalTopic: string;
  readonly canonicalTopicEn?: string;
  readonly language?: string;
  readonly domainHints: readonly string[];
  readonly anchors: readonly TopicAnchor[];
  readonly exclusions: readonly string[];
  readonly forbiddenExpansions: readonly ForbiddenExpansion[];
}

export interface TopicAnchorContractInput {
  topic: string;
  originalTopic?: string | null;
  canonicalTopic?: string | null;
  canonicalTopicEn?: string | null;
  querySeedZh?: readonly string[] | null;
  querySeedEn?: readonly string[] | null;
  mustIncludeTerms?: readonly string[] | null;
  excludeTerms?: readonly string[] | null;
  domainHints?: readonly string[] | null;
  language?: string | null;
}

export interface TopicAnchorForbiddenHit {
  readonly term: string;
  readonly matchedText: string;
  readonly reason: string;
}

export interface TopicAnchorCoverageItem {
  readonly anchorId: string;
  readonly matchedTerm: string;
}

export interface TopicAnchorValidationResult {
  readonly valid: boolean;
  readonly requiredEntityCoverage: number;
  readonly requiredRelationCoverage: number;
  readonly requiredPhraseCoverage: number;
  readonly requiredConstraintCoverage: number;
  readonly coveredAnchorIds: readonly string[];
  readonly matchedAnchors: readonly TopicAnchorCoverageItem[];
  readonly missingAnchorIds: readonly string[];
  readonly missingAnchors: readonly TopicAnchor[];
  readonly forbiddenHits: readonly TopicAnchorForbiddenHit[];
  readonly unsupportedCoreExpansions: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly diagnostics: {
    readonly checkedText: string;
    readonly requiredAnchorCount: number;
    readonly coveredRequiredAnchorCount: number;
  };
}

export type PlannedResearchQueryRole =
  | "primary"
  | "supporting"
  | "identifier_lookup";

export interface PlannedResearchQuery {
  readonly id: string;
  readonly query: string;
  readonly role: PlannedResearchQueryRole;
  readonly anchorIds: readonly string[];
  readonly expansionTerms: readonly string[];
  readonly provider?: string;
}

export interface TopicAnchorQueryDecision {
  readonly status: "valid" | "repaired" | "rejected";
  readonly query: string;
  readonly originalQuery: string;
  readonly role: PlannedResearchQueryRole;
  readonly validation: TopicAnchorValidationResult;
  readonly repairedValidation?: TopicAnchorValidationResult;
  readonly repairAttempted: boolean;
  readonly reasonCodes: readonly string[];
  readonly plannedQuery?: PlannedResearchQuery;
}

interface AnchorRegistryEntry {
  id: string;
  kind: TopicAnchorKind;
  sourceTerms: readonly string[];
  canonicalText: string;
  aliases: readonly string[];
  required?: boolean;
  forbiddenExpansions?: readonly ForbiddenExpansion[];
}

const COMMON_EFFECT_ALIASES = ["effect", "effects", "impact", "impacts", "influence", "influences"];

const TOPIC_ANCHOR_REGISTRY: readonly AnchorRegistryEntry[] = [
  {
    id: "basil",
    kind: "entity",
    sourceTerms: ["羅勒"],
    canonicalText: "羅勒",
    aliases: ["basil", "Ocimum basilicum"],
    forbiddenExpansions: [
      {
        term: "geographic features",
        reason: "Generic geography expansion is not anchored in the original basil experiment topic.",
      },
      {
        term: "spatial distribution",
        reason: "Spatial distribution is not part of the original basil photoperiod topic.",
      },
      {
        term: "land use change",
        reason: "Land use change is not part of the original basil photoperiod topic.",
      },
      {
        term: "ecosystem monitoring",
        reason: "Ecosystem monitoring is an unsupported expansion for the basil experiment topic.",
      },
      {
        term: "ecosystem",
        reason: "Ecosystem is too broad unless the original plant experiment anchors are present.",
      },
      {
        term: "biology ecology",
        reason: "Generic biology/ecology wording does not preserve the original basil anchors.",
      },
    ],
  },
  {
    id: "photoperiod",
    kind: "phrase",
    sourceTerms: ["光照週期"],
    canonicalText: "光照週期",
    aliases: ["light cycle", "light cycles", "photoperiod", "photoperiods"],
  },
  {
    id: "growth-rate",
    kind: "phrase",
    sourceTerms: ["生長速度"],
    canonicalText: "生長速度",
    aliases: ["growth rate", "growth rates", "plant growth rate"],
  },
  {
    id: "leaf-chlorophyll",
    kind: "phrase",
    sourceTerms: ["葉片葉綠素含量"],
    canonicalText: "葉片葉綠素含量",
    aliases: ["leaf chlorophyll content", "chlorophyll content", "chlorophyll concentration"],
  },
  {
    id: "road-pavement-material",
    kind: "entity",
    sourceTerms: ["道路鋪面材料"],
    canonicalText: "道路鋪面材料",
    aliases: [
      "road pavement material",
      "road pavement materials",
      "pavement material",
      "pavement materials",
      "pavement surface material",
      "pavement surface materials",
    ],
    forbiddenExpansions: [
      {
        term: "remote sensing",
        reason: "Remote sensing is an unsupported pivot when pavement material anchors are absent.",
      },
      {
        term: "ecosystem monitoring",
        reason: "Ecosystem monitoring is not anchored in the pavement material heat topic.",
      },
      {
        term: "environmental governance",
        reason: "Environmental governance is not anchored in the pavement material heat topic.",
      },
      {
        term: "climate adaptation",
        reason: "Climate adaptation is too broad unless pavement material and temperature anchors remain.",
      },
    ],
  },
  {
    id: "urban-heat-island",
    kind: "phrase",
    sourceTerms: ["都市熱島效應", "熱島效應"],
    canonicalText: "都市熱島效應",
    aliases: ["urban heat island", "urban heat islands", "UHI", "heat island effect"],
  },
  {
    id: "surface-temperature",
    kind: "phrase",
    sourceTerms: ["地表溫度"],
    canonicalText: "地表溫度",
    aliases: ["surface temperature", "surface temperatures", "land surface temperature", "LST"],
  },
  {
    id: "spaced-learning",
    kind: "entity",
    sourceTerms: ["間隔學習"],
    canonicalText: "間隔學習",
    aliases: ["spaced learning", "spaced practice", "distributed practice", "spacing"],
    forbiddenExpansions: [
      {
        term: "peer feedback",
        reason: "Peer feedback is not anchored in the spaced-versus-massed vocabulary topic.",
      },
      {
        term: "second language writing",
        aliases: ["L2 writing", "EFL writing"],
        reason: "Second-language writing is not anchored in the vocabulary memory topic.",
      },
      {
        term: "revision quality",
        reason: "Revision quality is not anchored in the vocabulary memory topic.",
      },
      {
        term: "instructional intervention",
        reason: "Generic instructional intervention wording omits the learning schedule and vocabulary anchors.",
      },
    ],
  },
  {
    id: "massed-learning",
    kind: "entity",
    sourceTerms: ["集中學習"],
    canonicalText: "集中學習",
    aliases: ["massed learning", "massed practice", "cramming", "intensive learning"],
  },
  {
    id: "english-vocabulary-memory",
    kind: "phrase",
    sourceTerms: ["英文單字長期記憶", "英文單字"],
    canonicalText: "英文單字長期記憶",
    aliases: [
      "English vocabulary long-term memory",
      "vocabulary long-term memory",
      "vocabulary retention",
      "vocabulary memory",
      "English vocabulary retention",
    ],
  },
  {
    id: "high-school-students",
    kind: "constraint",
    sourceTerms: ["高中生"],
    canonicalText: "高中生",
    aliases: ["high school students", "secondary students", "senior high school students", "adolescents"],
  },
  {
    id: "social-media-abbreviations",
    kind: "entity",
    sourceTerms: ["社群媒體縮寫"],
    canonicalText: "社群媒體縮寫",
    aliases: [
      "social-media abbreviations",
      "social media abbreviations",
      "online abbreviations",
      "internet slang",
      "social media slang",
    ],
    forbiddenExpansions: [
      {
        term: "peer feedback",
        reason: "Peer feedback is not anchored in the social-media abbreviation writing topic.",
      },
      {
        term: "second language writing",
        aliases: ["L2 writing", "EFL writing"],
        reason: "Second-language writing is not anchored in the formal Chinese writing topic.",
      },
      {
        term: "revision quality",
        reason: "Revision quality is not anchored in the formal Chinese writing topic.",
      },
    ],
  },
  {
    id: "formal-chinese-writing",
    kind: "phrase",
    sourceTerms: ["正式中文寫作表達", "正式中文寫作"],
    canonicalText: "正式中文寫作表達",
    aliases: [
      "formal Chinese writing",
      "formal Chinese written expression",
      "formal Chinese writing expression",
    ],
  },
  {
    id: "adolescents",
    kind: "constraint",
    sourceTerms: ["青少年"],
    canonicalText: "青少年",
    aliases: ["adolescents", "teenagers", "teens", "youth"],
  },
  {
    id: "wind-turbine",
    kind: "entity",
    sourceTerms: ["風力發電機"],
    canonicalText: "風力發電機",
    aliases: ["wind turbine", "wind turbines", "wind power turbine", "wind generator"],
    forbiddenExpansions: [
      {
        term: "photovoltaic",
        aliases: ["PV"],
        reason: "Photovoltaic/solar cell retrieval drifts away from wind turbine blade angle.",
      },
      {
        term: "solar cell",
        aliases: ["solar cells"],
        reason: "Solar cells are not anchored in the wind turbine blade angle topic.",
      },
      {
        term: "solar",
        reason: "Solar retrieval is not anchored in the wind turbine topic.",
      },
      {
        term: "surface roughness",
        reason: "Surface roughness is not anchored in the wind turbine blade angle topic.",
      },
      {
        term: "reflectance",
        reason: "Reflectance is not anchored in the wind turbine blade angle topic.",
      },
      {
        term: "anti-reflection",
        aliases: ["anti reflection"],
        reason: "Anti-reflection terminology is photovoltaic drift for this topic.",
      },
      {
        term: "light trapping",
        reason: "Light trapping is photovoltaic drift for this topic.",
      },
      {
        term: "environmental governance",
        reason: "Environmental governance is not anchored in the wind turbine blade angle topic.",
      },
      {
        term: "ecosystem monitoring",
        reason: "Ecosystem monitoring is not anchored in the wind turbine blade angle topic.",
      },
    ],
  },
  {
    id: "blade-angle",
    kind: "phrase",
    sourceTerms: ["葉片角度"],
    canonicalText: "葉片角度",
    aliases: ["blade angle", "blade angles", "blade pitch", "pitch angle", "blade pitch angle"],
  },
  {
    id: "low-wind-speed",
    kind: "constraint",
    sourceTerms: ["低風速"],
    canonicalText: "低風速",
    aliases: ["low wind speed", "low-wind-speed", "low wind speeds", "low-speed wind"],
  },
  {
    id: "power-generation-efficiency",
    kind: "phrase",
    sourceTerms: ["發電效率"],
    canonicalText: "發電效率",
    aliases: ["power generation efficiency", "power output efficiency", "generation efficiency", "energy conversion efficiency"],
  },
];

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const cleaned = compactWhitespace(value);
    const key = normalizeAnchorText(cleaned);
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function freezeObject<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function freezeAnchor(anchor: TopicAnchor): TopicAnchor {
  return freezeObject({
    ...anchor,
    aliases: Object.freeze([...anchor.aliases]),
    ...(anchor.sourceSpan
      ? { sourceSpan: freezeObject({ ...anchor.sourceSpan }) }
      : {}),
  }) as TopicAnchor;
}

function freezeForbiddenExpansion(value: ForbiddenExpansion): ForbiddenExpansion {
  return freezeObject({
    ...value,
    ...(value.aliases ? { aliases: Object.freeze([...value.aliases]) } : {}),
  }) as ForbiddenExpansion;
}

function freezeValidationResult(result: TopicAnchorValidationResult): TopicAnchorValidationResult {
  return freezeObject({
    ...result,
    coveredAnchorIds: Object.freeze([...result.coveredAnchorIds]),
    matchedAnchors: Object.freeze(result.matchedAnchors.map((item) => freezeObject({ ...item }))),
    missingAnchorIds: Object.freeze([...result.missingAnchorIds]),
    missingAnchors: Object.freeze(result.missingAnchors.map(freezeAnchor)),
    forbiddenHits: Object.freeze(result.forbiddenHits.map((hit) => freezeObject({ ...hit }))),
    unsupportedCoreExpansions: Object.freeze([...result.unsupportedCoreExpansions]),
    reasonCodes: Object.freeze([...result.reasonCodes]),
    diagnostics: freezeObject({ ...result.diagnostics }),
  }) as TopicAnchorValidationResult;
}

function hasCjk(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

export function normalizeAnchorText(value: string): string {
  return compactWhitespace(
    value
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[‐‑‒–—―]/g, "-")
      .replace(/[，。；：、！？（）［］【】「」『』《》]/g, " ")
      .replace(/[_/|]+/g, " ")
      .replace(/\s*-\s*/g, " "),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asciiTermPattern(term: string): RegExp {
  const normalized = normalizeAnchorText(term);
  const words = normalized.split(" ").filter(Boolean).map(escapeRegExp);
  const pattern = words.join("\\s+");
  return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, "i");
}

export function containsAnchorTerm(text: string, term: string): boolean {
  const normalizedText = normalizeAnchorText(text);
  const normalizedTerm = normalizeAnchorText(term);
  if (!normalizedText || !normalizedTerm) return false;
  if (hasCjk(normalizedTerm)) {
    return normalizedText.includes(normalizedTerm);
  }
  return asciiTermPattern(normalizedTerm).test(normalizedText);
}

function findMatchedTerm(text: string, terms: readonly string[]): string | null {
  for (const term of terms) {
    if (containsAnchorTerm(text, term)) return term;
  }
  return null;
}

function originalTopicHash(originalTopic: string): string {
  return createHash("sha256").update(originalTopic).digest("hex").slice(0, 16);
}

function sourceSpanFor(originalTopic: string, sourceTerms: readonly string[]): TopicAnchor["sourceSpan"] {
  for (const term of sourceTerms) {
    const index = originalTopic.indexOf(term);
    if (index >= 0) {
      return {
        start: index,
        end: index + term.length,
      };
    }
  }
  return undefined;
}

function sourceTextFor(originalTopic: string, sourceTerms: readonly string[]): string {
  const span = sourceSpanFor(originalTopic, sourceTerms);
  if (!span) return sourceTerms[0] ?? "";
  return originalTopic.slice(span.start, span.end);
}

function contractText(input: TopicAnchorContractInput): string {
  return [
    input.topic,
    input.originalTopic ?? "",
    input.canonicalTopic ?? "",
    input.canonicalTopicEn ?? "",
    ...(input.querySeedZh ?? []),
    ...(input.querySeedEn ?? []),
    ...(input.mustIncludeTerms ?? []),
  ].join(" ");
}

function anchorKey(anchor: Pick<TopicAnchor, "kind" | "sourceText" | "canonicalText">): string {
  return `${anchor.kind}:${normalizeAnchorText(anchor.sourceText || anchor.canonicalText)}`;
}

function buildRegistryAnchor(entry: AnchorRegistryEntry, originalTopic: string): TopicAnchor {
  const span = sourceSpanFor(originalTopic, entry.sourceTerms);
  return freezeAnchor({
    id: `anchor:${entry.id}`,
    kind: entry.kind,
    sourceText: sourceTextFor(originalTopic, entry.sourceTerms),
    ...(span ? { sourceSpan: span } : {}),
    canonicalText: entry.canonicalText,
    aliases: uniqueStrings(entry.aliases),
    required: entry.required ?? true,
    provenance: span ? "original_input" : "registered_alias",
  });
}

function structuredAnchor(term: string, index: number): TopicAnchor {
  return freezeAnchor({
    id: `anchor:structured:${index}:${normalizeAnchorText(term).replace(/[^a-z0-9\u3400-\u9fff]+/gu, "-")}`,
    kind: "phrase",
    sourceText: term,
    canonicalText: term,
    aliases: [],
    required: true,
    provenance: "structured_input_field",
  });
}

function relationAnchor(originalTopic: string, relation: "effect" | "comparison"): TopicAnchor | null {
  if (relation === "effect" && /影響|impact|effect|influence/i.test(originalTopic)) {
    const term = originalTopic.includes("影響") ? "影響" : "effect";
    const span = sourceSpanFor(originalTopic, [term]);
    return freezeAnchor({
      id: "anchor:relation:effect",
      kind: "relation",
      sourceText: term,
      ...(span ? { sourceSpan: span } : {}),
      canonicalText: "影響",
      aliases: COMMON_EFFECT_ALIASES,
      required: true,
      provenance: span ? "original_input" : "registered_alias",
    });
  }
  if (relation === "comparison" && /與|和|及|vs\.?|versus|比較/i.test(originalTopic)) {
    const term = originalTopic.includes("與") ? "與" : "comparison";
    const span = sourceSpanFor(originalTopic, [term]);
    return freezeAnchor({
      id: "anchor:relation:comparison",
      kind: "relation",
      sourceText: term,
      ...(span ? { sourceSpan: span } : {}),
      canonicalText: "比較",
      aliases: ["comparison", "compare", "versus", "vs"],
      required: false,
      provenance: span ? "original_input" : "registered_alias",
    });
  }
  return null;
}

function forbiddenExpansionsForEntries(entries: readonly AnchorRegistryEntry[]): ForbiddenExpansion[] {
  return entries.flatMap((entry) => entry.forbiddenExpansions ?? []);
}

export function buildTopicAnchorContract(input: TopicAnchorContractInput): TopicAnchorContract {
  const originalTopic = compactWhitespace(input.originalTopic || input.topic);
  const canonicalTopic = compactWhitespace(input.canonicalTopic || input.topic || originalTopic);
  const sourceText = contractText(input);
  const matchedEntries = TOPIC_ANCHOR_REGISTRY.filter((entry) =>
    entry.sourceTerms.some((term) => containsAnchorTerm(sourceText, term)) ||
    entry.aliases.some((term) => containsAnchorTerm(sourceText, term)),
  );

  const anchorsByKey = new Map<string, TopicAnchor>();
  for (const entry of matchedEntries) {
    const anchor = buildRegistryAnchor(entry, originalTopic);
    anchorsByKey.set(anchorKey(anchor), anchor);
  }
  for (const relation of [relationAnchor(originalTopic, "effect"), relationAnchor(originalTopic, "comparison")]) {
    if (relation) anchorsByKey.set(anchorKey(relation), relation);
  }
  for (const [index, term] of uniqueStrings(input.mustIncludeTerms ?? []).entries()) {
    const key = normalizeAnchorText(term);
    if (
      !key ||
      [...anchorsByKey.values()].some((anchor) =>
        [anchor.sourceText, anchor.canonicalText, ...anchor.aliases].some((candidate) =>
          normalizeAnchorText(candidate) === key,
        ),
      )
    ) {
      continue;
    }
    const anchor = structuredAnchor(term, index);
    anchorsByKey.set(anchorKey(anchor), anchor);
  }

  const anchors = Object.freeze([...anchorsByKey.values()].map(freezeAnchor));
  const forbiddenExpansions = Object.freeze(
    uniqueForbiddenExpansions(forbiddenExpansionsForEntries(matchedEntries)).map(freezeForbiddenExpansion),
  );
  const contract: TopicAnchorContract = {
    contractVersion: "topic-anchor-contract:v1",
    extractionVersion: "topic-anchor-extraction:v1",
    originalTopic,
    originalTopicHash: originalTopicHash(originalTopic),
    canonicalTopic,
    ...(input.canonicalTopicEn ? { canonicalTopicEn: compactWhitespace(input.canonicalTopicEn) } : {}),
    ...(input.language ? { language: input.language } : {}),
    domainHints: Object.freeze(uniqueStrings(input.domainHints ?? [])),
    anchors,
    exclusions: Object.freeze(uniqueStrings(input.excludeTerms ?? [])),
    forbiddenExpansions,
  };
  validateSourceSpans(contract);
  return freezeObject(contract) as TopicAnchorContract;
}

function uniqueForbiddenExpansions(values: readonly ForbiddenExpansion[]): ForbiddenExpansion[] {
  const seen = new Set<string>();
  const output: ForbiddenExpansion[] = [];
  for (const value of values) {
    const key = normalizeAnchorText(value.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function validateSourceSpans(contract: TopicAnchorContract): void {
  for (const anchor of contract.anchors) {
    if (!anchor.sourceSpan) continue;
    const actual = contract.originalTopic.slice(anchor.sourceSpan.start, anchor.sourceSpan.end);
    if (actual !== anchor.sourceText) {
      throw new Error(
        `Topic anchor sourceSpan mismatch for ${anchor.id}: expected ${anchor.sourceText}, got ${actual}`,
      );
    }
  }
}

function anchorTerms(anchor: TopicAnchor): string[] {
  return uniqueStrings([anchor.sourceText, anchor.canonicalText, ...anchor.aliases]);
}

function anchorCoverage(text: string, anchor: TopicAnchor): TopicAnchorCoverageItem | null {
  const matchedTerm = findMatchedTerm(text, anchorTerms(anchor));
  return matchedTerm ? { anchorId: anchor.id, matchedTerm } : null;
}

function coverageRatio(
  anchors: readonly TopicAnchor[],
  kind: TopicAnchorKind,
  coveredIds: ReadonlySet<string>,
): number {
  const required = anchors.filter((anchor) => anchor.required && anchor.kind === kind);
  if (!required.length) return 1;
  const covered = required.filter((anchor) => coveredIds.has(anchor.id)).length;
  return covered / required.length;
}

function forbiddenHitsFor(text: string, contract: TopicAnchorContract): TopicAnchorForbiddenHit[] {
  const hits: TopicAnchorForbiddenHit[] = [];
  for (const forbidden of contract.forbiddenExpansions) {
    const matchedText = findMatchedTerm(text, [forbidden.term, ...(forbidden.aliases ?? [])]);
    if (!matchedText) continue;
    hits.push({
      term: forbidden.term,
      matchedText,
      reason: forbidden.reason,
    });
  }
  return hits;
}

export function validateTopicTextAgainstContract(
  text: string,
  contract: TopicAnchorContract,
): TopicAnchorValidationResult {
  const checkedText = compactWhitespace(text);
  const matchedAnchors = contract.anchors
    .map((anchor) => anchorCoverage(checkedText, anchor))
    .filter((item): item is TopicAnchorCoverageItem => Boolean(item));
  const coveredIds = new Set(matchedAnchors.map((item) => item.anchorId));
  const missingAnchors = contract.anchors.filter((anchor) => anchor.required && !coveredIds.has(anchor.id));
  const forbiddenHits = forbiddenHitsFor(checkedText, contract);
  const unsupportedCoreExpansions = uniqueStrings(forbiddenHits.map((hit) => hit.term));
  const reasonCodes = uniqueStrings([
    ...(missingAnchors.some((anchor) => anchor.kind === "entity")
      ? ["REQUIRED_ENTITY_MISSING"]
      : []),
    ...(missingAnchors.some((anchor) => anchor.kind === "relation")
      ? ["REQUIRED_RELATION_MISSING"]
      : []),
    ...(missingAnchors.some((anchor) => anchor.kind === "phrase")
      ? ["REQUIRED_PHRASE_MISSING"]
      : []),
    ...(missingAnchors.some((anchor) => anchor.kind === "constraint")
      ? ["REQUIRED_CONSTRAINT_MISSING"]
      : []),
    ...(forbiddenHits.length ? ["FORBIDDEN_TOPIC_EXPANSION"] : []),
  ]);
  const result: TopicAnchorValidationResult = {
    valid: missingAnchors.length === 0 && forbiddenHits.length === 0,
    requiredEntityCoverage: coverageRatio(contract.anchors, "entity", coveredIds),
    requiredRelationCoverage: coverageRatio(contract.anchors, "relation", coveredIds),
    requiredPhraseCoverage: coverageRatio(contract.anchors, "phrase", coveredIds),
    requiredConstraintCoverage: coverageRatio(contract.anchors, "constraint", coveredIds),
    coveredAnchorIds: Object.freeze([...coveredIds]),
    matchedAnchors: Object.freeze(matchedAnchors.map((item) => freezeObject({ ...item }))),
    missingAnchorIds: Object.freeze(missingAnchors.map((anchor) => anchor.id)),
    missingAnchors: Object.freeze(missingAnchors.map(freezeAnchor)),
    forbiddenHits: Object.freeze(forbiddenHits.map((hit) => freezeObject({ ...hit }))),
    unsupportedCoreExpansions: Object.freeze(unsupportedCoreExpansions),
    reasonCodes: Object.freeze(reasonCodes),
    diagnostics: {
      checkedText,
      requiredAnchorCount: contract.anchors.filter((anchor) => anchor.required).length,
      coveredRequiredAnchorCount: contract.anchors.filter((anchor) => anchor.required && coveredIds.has(anchor.id)).length,
    },
  };
  return freezeValidationResult(result);
}

export function isIdentifierLookupQuery(query: string): boolean {
  const normalized = compactWhitespace(query);
  return (
    /^https?:\/\//i.test(normalized) ||
    /\bdoi:\s*10\.\d{4,9}\/\S+/i.test(normalized) ||
    /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i.test(normalized) ||
    /\barxiv:\s*\d{4}\.\d{4,5}(?:v\d+)?\b/i.test(normalized) ||
    /\bpmid:\s*\d{5,}\b/i.test(normalized)
  );
}

function prefersEnglish(text: string): boolean {
  return /[A-Za-z]/.test(text) && !hasCjk(text);
}

function preferredAnchorTerm(anchor: TopicAnchor, english: boolean): string {
  if (english) {
    const alias = anchor.aliases.find((term) => /[A-Za-z]/.test(term));
    if (alias) return alias;
  }
  return anchor.sourceText || anchor.canonicalText || anchor.aliases[0] || "";
}

function removeForbiddenTerm(text: string, term: string): string {
  if (!term) return text;
  if (hasCjk(term)) {
    return text.split(term).join(" ");
  }
  const pattern = asciiTermPattern(term);
  return text.replace(pattern, (match, prefix: string, suffix: string) => `${prefix ?? ""}${suffix ?? ""}`);
}

function removeForbiddenExpansions(text: string, contract: TopicAnchorContract): string {
  let output = text;
  for (const forbidden of contract.forbiddenExpansions) {
    for (const term of [forbidden.term, ...(forbidden.aliases ?? [])]) {
      output = removeForbiddenTerm(output, term);
    }
  }
  return compactWhitespace(output);
}

function queryLooksOnlyGeneric(validation: TopicAnchorValidationResult, query: string): boolean {
  if (validation.coveredAnchorIds.length > 0) return false;
  const normalized = normalizeAnchorText(query);
  const wordCount = normalized.split(" ").filter(Boolean).length;
  return wordCount <= 8;
}

export function buildContractAnchorQuery(
  contract: TopicAnchorContract,
  language: "en" | "zh" = "en",
): string {
  const english = language === "en";
  return uniqueStrings(
    contract.anchors
      .filter((anchor) => anchor.required)
      .map((anchor) => preferredAnchorTerm(anchor, english)),
  ).join(" ");
}

export function repairTopicTextWithAnchors(
  text: string,
  contract: TopicAnchorContract,
  options: {
    allowFullAnchorRestore?: boolean;
  } = {},
): string | null {
  const cleaned = removeForbiddenExpansions(text, contract);
  const validation = validateTopicTextAgainstContract(cleaned, contract);
  if (validation.valid) return cleaned;
  if (!options.allowFullAnchorRestore && queryLooksOnlyGeneric(validation, cleaned || text)) {
    return null;
  }
  const english = prefersEnglish(cleaned || text);
  const additions = validation.missingAnchors
    .filter((anchor) => anchor.required)
    .map((anchor) => preferredAnchorTerm(anchor, english));
  const repaired = uniqueStrings([cleaned, ...additions]).join(" ");
  const repairedValidation = validateTopicTextAgainstContract(repaired, contract);
  return repairedValidation.valid ? repaired : null;
}

function plannedQueryFromValidation(
  id: string,
  query: string,
  role: PlannedResearchQueryRole,
  validation: TopicAnchorValidationResult,
  provider?: string,
): PlannedResearchQuery {
  return freezeObject({
    id,
    query,
    role,
    anchorIds: Object.freeze([...validation.coveredAnchorIds]),
    expansionTerms: Object.freeze([...validation.unsupportedCoreExpansions]),
    ...(provider ? { provider } : {}),
  }) as PlannedResearchQuery;
}

export function validateAndRepairTopicQuery(
  query: string,
  contract: TopicAnchorContract,
  options: {
    id?: string;
    role?: PlannedResearchQueryRole;
    provider?: string;
    repair?: boolean;
    allowFullAnchorRestore?: boolean;
  } = {},
): TopicAnchorQueryDecision {
  const role = options.role ?? "primary";
  const originalQuery = compactWhitespace(query);
  const validation = validateTopicTextAgainstContract(originalQuery, contract);
  if (role === "identifier_lookup") {
    const validIdentifier = isIdentifierLookupQuery(originalQuery);
    const reasonCodes = validIdentifier ? [] : ["IDENTIFIER_LOOKUP_TRACE_MISSING"];
    const decision: TopicAnchorQueryDecision = {
      status: validIdentifier ? "valid" : "rejected",
      query: originalQuery,
      originalQuery,
      role,
      validation,
      repairAttempted: false,
      reasonCodes: Object.freeze(reasonCodes),
      ...(validIdentifier
        ? {
            plannedQuery: plannedQueryFromValidation(
              options.id ?? "identifier_lookup:0",
              originalQuery,
              role,
              validation,
              options.provider,
            ),
          }
        : {}),
    };
    return freezeObject(decision) as TopicAnchorQueryDecision;
  }
  if (validation.valid) {
    const decision: TopicAnchorQueryDecision = {
      status: "valid",
      query: originalQuery,
      originalQuery,
      role,
      validation,
      repairAttempted: false,
      reasonCodes: Object.freeze([]),
      plannedQuery: plannedQueryFromValidation(
        options.id ?? "topic_query:0",
        originalQuery,
        role,
        validation,
        options.provider,
      ),
    };
    return freezeObject(decision) as TopicAnchorQueryDecision;
  }
  if (options.repair ?? true) {
    const repaired = repairTopicTextWithAnchors(originalQuery, contract, {
      allowFullAnchorRestore: options.allowFullAnchorRestore,
    });
    if (repaired && repaired !== originalQuery) {
      const repairedValidation = validateTopicTextAgainstContract(repaired, contract);
      if (repairedValidation.valid) {
        const decision: TopicAnchorQueryDecision = {
          status: "repaired",
          query: repaired,
          originalQuery,
          role,
          validation,
          repairedValidation,
          repairAttempted: true,
          reasonCodes: Object.freeze([...validation.reasonCodes]),
          plannedQuery: plannedQueryFromValidation(
            options.id ?? "topic_query:0",
            repaired,
            role,
            repairedValidation,
            options.provider,
          ),
        };
        return freezeObject(decision) as TopicAnchorQueryDecision;
      }
    }
  }
  const decision: TopicAnchorQueryDecision = {
    status: "rejected",
    query: originalQuery,
    originalQuery,
    role,
    validation,
    repairAttempted: options.repair ?? true,
    reasonCodes: Object.freeze(
      validation.reasonCodes.length ? [...validation.reasonCodes] : ["QUERY_REPAIR_FAILED"],
    ),
  };
  return freezeObject(decision) as TopicAnchorQueryDecision;
}
