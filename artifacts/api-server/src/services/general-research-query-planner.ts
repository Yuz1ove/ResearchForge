export type GeneralResearchRelationship =
  | "effect"
  | "association"
  | "comparison"
  | "descriptive";

export interface GeneralResearchDimensions {
  populationOrEntity: string | null;
  exposureOrIntervention: string | null;
  comparator: string | null;
  outcome: string | null;
  context: string | null;
  time: string | null;
  relationship: GeneralResearchRelationship;
}

export interface GeneralResearchQueryPlan {
  topic: string;
  dimensions: GeneralResearchDimensions;
  exactQueries: string[];
  conceptQueries: string[];
  synonymQueries: string[];
  outcomeQueries: string[];
  studyDesignQueries: string[];
  queries: string[];
}

function clean(value: string | undefined | null): string | null {
  const normalized = (value ?? "")
    .replace(/[「」“”"']/gu, "")
    .replace(/\s+/gu, " ")
    .replace(/^(?:the|a|an)\s+/iu, "")
    .trim();
  return normalized || null;
}

function unique(values: Array<string | null | undefined>, limit = 8): string[] {
  return [...new Set(values.map((value) => value?.replace(/\s+/gu, " ").trim()).filter((value): value is string => Boolean(value)))]
    .slice(0, limit);
}

function inferPopulationOrEntity(outcome: string | null): string | null {
  if (!outcome) return null;
  const zh = outcome.match(/^(.*?(?:高中生|學生|青少年|兒童|成人|患者|受試者|魚類|動物|植物|族群|勞工|教師|使用者))(?:的|之)?/u);
  if (zh?.[1]) return clean(zh[1]);
  const en = outcome.match(/\b(?:among|in)\s+([^,;:]{2,80})/iu);
  return clean(en?.[1]);
}

function splitTopic(topic: string): GeneralResearchDimensions {
  const value = topic
    .replace(/[「」“”"']/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const comparison = value.match(/^(.{2,100}?)\s*(?:與|和|及)\s*(.{2,100}?)\s*對\s*(.{2,120}?)(?:的)?比較$/u);
  if (comparison) {
    return {
      populationOrEntity: null,
      exposureOrIntervention: clean(comparison[1]),
      comparator: clean(comparison[2]),
      outcome: clean(comparison[3]),
      context: null,
      time: null,
      relationship: "comparison",
    };
  }
  const compactComparison = value.match(/^(.{2,100}?)\s*(?:與|和|及)\s*(.{3,180}?)(?:的)?比較$/u);
  if (compactComparison) {
    const first = clean(compactComparison[1]);
    const remainder = clean(compactComparison[2]);
    const sharedBoundary = first && remainder ? remainder.indexOf(first.slice(-1)) : -1;
    const comparator = sharedBoundary >= 1 ? remainder!.slice(0, sharedBoundary + 1) : remainder;
    const outcome = sharedBoundary >= 1 ? clean(remainder!.slice(sharedBoundary + 1)) : null;
    return {
      populationOrEntity: null,
      exposureOrIntervention: first,
      comparator: clean(comparator),
      outcome,
      context: null,
      time: null,
      relationship: "comparison",
    };
  }
  const enComparison = value.match(/^(.{2,100}?)\s+(?:vs\.?|versus|compared with)\s+(.{2,100}?)(?::|\s+(?:for|on)\s+)(.{2,120})$/iu);
  if (enComparison) {
    return {
      populationOrEntity: null,
      exposureOrIntervention: clean(enComparison[1]),
      comparator: clean(enComparison[2]),
      outcome: clean(enComparison[3]),
      context: null,
      time: null,
      relationship: "comparison",
    };
  }
  const association = value.match(/^(.{2,120}?)\s*(?:與|和)\s*(.{2,140}?)(?:之間)?(?:的)?(?:關聯|相關)$/u)
    ?? value.match(/^(?:association|relationship|correlation)\s+between\s+(.{2,120}?)\s+and\s+(.{2,140})$/iu);
  if (association) {
    const outcome = clean(association[2]);
    return {
      populationOrEntity: inferPopulationOrEntity(outcome),
      exposureOrIntervention: clean(association[1]),
      comparator: null,
      outcome,
      context: null,
      time: null,
      relationship: "association",
    };
  }
  const contextualEffect = value.match(/^(.{2,100}?)(?:環境中|情境中|情境下|條件下)(.{2,100}?)的(.{2,100}?)(?:影響|效果|效應)$/u);
  if (contextualEffect) {
    return {
      populationOrEntity: null,
      exposureOrIntervention: clean(contextualEffect[2]),
      comparator: null,
      outcome: clean(contextualEffect[3]),
      context: clean(contextualEffect[1]),
      time: null,
      relationship: "effect",
    };
  }
  const effect = value.match(/^(.{2,130}?)\s*對\s*(.{2,150}?)(?:的)?(?:影響|效果)$/u)
    ?? value.match(/^(?:effect|impact|influence)\s+of\s+(.{2,130}?)\s+on\s+(.{2,150})$/iu)
    ?? value.match(/^(.{2,130}?)\s+(?:effect|impact|influence)\s+on\s+(.{2,150})$/iu);
  if (effect) {
    const outcome = clean(effect[2]);
    const contextMatch = effect[1]?.match(/^(.{2,100}?)(?:中|下|環境中)\s*(.{2,100})$/u);
    return {
      populationOrEntity: inferPopulationOrEntity(outcome),
      exposureOrIntervention: clean(contextMatch?.[2] ?? effect[1]),
      comparator: null,
      outcome,
      context: clean(contextMatch?.[1]),
      time: null,
      relationship: "effect",
    };
  }
  return {
    populationOrEntity: null,
    exposureOrIntervention: value,
    comparator: null,
    outcome: null,
    context: null,
    time: null,
    relationship: "descriptive",
  };
}

export function buildGeneralResearchQueryPlan(topic: string): GeneralResearchQueryPlan {
  const normalizedTopic = clean(topic) ?? topic.trim();
  const dimensions = splitTopic(normalizedTopic);
  const concepts = unique([
    dimensions.exposureOrIntervention,
    dimensions.comparator,
    dimensions.outcome,
    dimensions.populationOrEntity,
    dimensions.context,
  ], 6);
  const conceptCore = concepts.join(" ");
  const relationTerms = dimensions.relationship === "comparison"
    ? "comparison comparative versus"
    : dimensions.relationship === "association"
      ? "association relationship correlation"
      : dimensions.relationship === "effect"
        ? "effect impact influence"
        : "research evidence";
  const outcomeCore = unique([
    dimensions.exposureOrIntervention,
    dimensions.comparator,
    dimensions.outcome,
  ], 4).join(" ");
  const exactQueries = unique([normalizedTopic]);
  const conceptQueries = unique([conceptCore]);
  const synonymQueries = unique([`${conceptCore} ${relationTerms}`]);
  const outcomeQueries = unique([
    dimensions.outcome ? `${outcomeCore} outcome results` : null,
    dimensions.context ? `${conceptCore} context setting` : null,
  ]);
  const studyDesignQueries = unique([
    `${conceptCore} systematic review meta-analysis`,
    `${conceptCore} cohort trial experiment observational study benchmark evaluation`,
  ], 2);
  return {
    topic: normalizedTopic,
    dimensions,
    exactQueries,
    conceptQueries,
    synonymQueries,
    outcomeQueries,
    studyDesignQueries,
    queries: unique([
      ...exactQueries,
      ...conceptQueries,
      ...synonymQueries,
      ...outcomeQueries,
      ...studyDesignQueries,
    ], 8),
  };
}
