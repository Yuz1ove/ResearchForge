import {
  buildGeneralResearchQueryPlan,
  type GeneralResearchDimensions,
} from "./general-research-query-planner";

export const EVIDENCE_GAP_QUERY_PURPOSES = [
  "DISCOVERY",
  "DIRECT_EMPIRICAL",
  "FULLTEXT_RECOVERY",
  "METHOD_RECOVERY",
  "QUANTITATIVE_RECOVERY",
  "CONTRADICTORY_EVIDENCE",
  "REPLICATION",
  "REVIEW_SEED",
  "CITATION_CHAIN",
] as const;

export type EvidenceGapQueryPurpose = (typeof EVIDENCE_GAP_QUERY_PURPOSES)[number];
export type EvidenceGapQueryLanguage = "zh" | "en" | "identifier";
export type EvidenceGapExpectedEvidenceType =
  | "academic_candidate"
  | "direct_primary_study"
  | "legal_full_text_location"
  | "methods_or_population"
  | "results_table_or_effect_estimate"
  | "contradictory_or_null_finding"
  | "independent_replication"
  | "secondary_synthesis_seed"
  | "citation_linked_study";

export interface ExistingDirectStudyIdentity {
  sourceId?: string;
  doi?: string | null;
  title?: string | null;
  authors?: string[];
  canonicalWorkId?: string | null;
  studyType?: string | null;
  accessState?: string | null;
  missingFormalFields?: string[];
}

export interface ExistingThemeGap {
  themeId: string;
  normalizedProposition?: string;
  independentStudyCount?: number;
  missingIndependentStudies?: number;
  admissionStatus?: string;
}

export interface EvidenceGapDrivenQueryPlannerInput {
  topic: string;
  researchQuestion?: string;
  caseId?: string;
  existingDirectStudies?: ExistingDirectStudyIdentity[];
  studyTypes?: string[];
  existingThemes?: ExistingThemeGap[];
  missingThemes?: ExistingThemeGap[];
  missingFormalFields?: string[];
  missingPopulationOrContext?: string[];
  missingMethodOrEffectEvidence?: string[];
  knownDoiTitleAuthorLinks?: Array<{
    doi?: string | null;
    title?: string | null;
    author?: string | null;
    canonicalWorkId?: string | null;
  }>;
  purposes?: EvidenceGapQueryPurpose[];
  maxQueries?: number;
}

export interface EvidenceGapDrivenQuery {
  query: string;
  purpose: EvidenceGapQueryPurpose;
  targetGap: string;
  language: EvidenceGapQueryLanguage;
  provider: "openalex" | "crossref" | "semanticScholar" | "doi_resolver" | "oa_location";
  caseId?: string;
  generatedFrom: string[];
  expectedEvidenceType: EvidenceGapExpectedEvidenceType;
}

export interface EvidenceGapDrivenQueryPlan {
  schemaVersion: "researchforge-evidence-gap-query-plan/v3";
  topic: string;
  researchQuestion: string;
  dimensions: GeneralResearchDimensions;
  gapSummary: {
    directStudyCount: number;
    knownIdentityCount: number;
    missingFormalFields: string[];
    missingThemeCount: number;
  };
  queries: EvidenceGapDrivenQuery[];
}

function clean(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function languageForQuery(query: string): EvidenceGapQueryLanguage {
  if (/^(?:10\.\d{4,9}\/|https?:\/\/doi\.org\/)/iu.test(query)) return "identifier";
  return /[\u3400-\u9fff]/u.test(query) ? "zh" : "en";
}

function identityLabel(identity: ExistingDirectStudyIdentity): string {
  return clean(identity.doi) || clean(identity.canonicalWorkId) || clean(identity.title) || clean(identity.sourceId);
}

function defaultPurposes(input: EvidenceGapDrivenQueryPlannerInput): EvidenceGapQueryPurpose[] {
  const directStudies = input.existingDirectStudies ?? [];
  const missingFields = unique([
    ...(input.missingFormalFields ?? []),
    ...(input.missingMethodOrEffectEvidence ?? []),
    ...directStudies.flatMap((study) => study.missingFormalFields ?? []),
  ]);
  const missingThemes = input.missingThemes ?? [];
  const result: EvidenceGapQueryPurpose[] = ["DISCOVERY"];
  if (directStudies.length === 0) result.push("DIRECT_EMPIRICAL", "REVIEW_SEED", "CITATION_CHAIN");
  if (directStudies.some((study) => !/FULL_TEXT_(?:STRUCTURED|HTML|PDF|REPOSITORY_COPY)/u.test(clean(study.accessState)))) {
    result.push("FULLTEXT_RECOVERY");
  }
  if (missingFields.some((field) => /method|population|participant|sample|dataset|corpus|procedure|analysis|included|synthesis/iu.test(field))) {
    result.push("METHOD_RECOVERY");
  }
  if (missingFields.some((field) => /result|effect|direction|metric|estimate|heterogeneity|observation|outcome|table|caption/iu.test(field))) {
    result.push("QUANTITATIVE_RECOVERY");
  }
  if (missingThemes.length > 0 || directStudies.length === 1) result.push("REPLICATION");
  if ((input.existingThemes ?? []).some((theme) => /conflict|mixed|heterogeneous/iu.test(clean(theme.admissionStatus)))) {
    result.push("CONTRADICTORY_EVIDENCE");
  }
  return [...new Set(result)];
}

function conceptCore(dimensions: GeneralResearchDimensions, fallback: string): string {
  return unique([
    clean(dimensions.exposureOrIntervention),
    clean(dimensions.comparator),
    clean(dimensions.outcome),
    clean(dimensions.populationOrEntity),
    clean(dimensions.context),
  ]).join(" ") || fallback;
}

function directDesignTerms(studyTypes: string[]): string {
  const normalized = studyTypes.map((type) => clean(type).toLocaleLowerCase());
  if (normalized.some((type) => /technical|computational|dataset|corpus/iu.test(type))) {
    return "benchmark evaluation dataset experiment empirical results";
  }
  if (normalized.some((type) => /qualitative/iu.test(type))) {
    return "interview field study qualitative empirical findings";
  }
  return "trial cohort longitudinal experiment observational empirical study";
}

function addQuery(
  output: EvidenceGapDrivenQuery[],
  query: string,
  purpose: EvidenceGapQueryPurpose,
  targetGap: string,
  provider: EvidenceGapDrivenQuery["provider"],
  expectedEvidenceType: EvidenceGapExpectedEvidenceType,
  generatedFrom: string[],
  caseId?: string,
): void {
  const normalized = clean(query);
  if (!normalized) return;
  const fingerprint = `${purpose}:${normalized.toLocaleLowerCase()}`;
  if (output.some((candidate) => `${candidate.purpose}:${candidate.query.toLocaleLowerCase()}` === fingerprint)) return;
  output.push({
    query: normalized,
    purpose,
    targetGap,
    language: languageForQuery(normalized),
    provider,
    ...(caseId ? { caseId } : {}),
    generatedFrom,
    expectedEvidenceType,
  });
}

export function buildEvidenceGapDrivenQueryPlan(
  input: EvidenceGapDrivenQueryPlannerInput,
): EvidenceGapDrivenQueryPlan {
  const topic = clean(input.topic);
  const researchQuestion = clean(input.researchQuestion) || topic;
  const general = buildGeneralResearchQueryPlan(researchQuestion);
  const directStudies = input.existingDirectStudies ?? [];
  const knownIdentities = [
    ...directStudies,
    ...(input.knownDoiTitleAuthorLinks ?? []).map((identity) => ({ ...identity })),
  ].filter((identity) => Boolean(identityLabel(identity)));
  const missingFields = unique([
    ...(input.missingFormalFields ?? []),
    ...(input.missingMethodOrEffectEvidence ?? []),
    ...directStudies.flatMap((study) => study.missingFormalFields ?? []),
  ]);
  const missingThemes = input.missingThemes ?? [];
  const purposes = input.purposes?.length ? [...new Set(input.purposes)] : defaultPurposes(input);
  const core = conceptCore(general.dimensions, researchQuestion);
  const queries: EvidenceGapDrivenQuery[] = [];

  if (purposes.includes("DISCOVERY")) {
    addQuery(queries, researchQuestion, "DISCOVERY", "academic_candidates", "openalex", "academic_candidate", ["researchQuestion"], input.caseId);
  }
  if (purposes.includes("DIRECT_EMPIRICAL")) {
    addQuery(queries, `${core} ${directDesignTerms(input.studyTypes ?? [])}`, "DIRECT_EMPIRICAL", "no_admitted_direct_primary_study", "openalex", "direct_primary_study", ["dimensions", "studyTypes"], input.caseId);
    addQuery(queries, `${core} methods results participants sample effect`, "DIRECT_EMPIRICAL", "direct_empirical_methods_and_results", "semanticScholar", "direct_primary_study", ["dimensions", "required_empirical_sections"], input.caseId);
  }
  if (purposes.includes("REVIEW_SEED")) {
    addQuery(queries, `${core} systematic review meta-analysis`, "REVIEW_SEED", "direct_literature_seed", "openalex", "secondary_synthesis_seed", ["dimensions"], input.caseId);
  }
  if (purposes.includes("FULLTEXT_RECOVERY")) {
    for (const identity of knownIdentities) {
      const label = identityLabel(identity);
      addQuery(queries, label, "FULLTEXT_RECOVERY", `full_text:${label}`, "oa_location", "legal_full_text_location", ["canonical_identity"], input.caseId);
    }
  }
  if (purposes.includes("METHOD_RECOVERY")) {
    const target = missingFields.filter((field) => /method|population|participant|sample|dataset|corpus|procedure|analysis|included|synthesis/iu.test(field));
    for (const identity of knownIdentities.slice(0, 6)) {
      const label = identityLabel(identity);
      addQuery(queries, `${label} methods ${target.join(" ") || "participants data analysis"}`, "METHOD_RECOVERY", `missing_fields:${target.join(",") || "methods"}`, "semanticScholar", "methods_or_population", ["canonical_identity", "missingFormalFields"], input.caseId);
    }
  }
  if (purposes.includes("QUANTITATIVE_RECOVERY")) {
    const target = missingFields.filter((field) => /result|effect|direction|metric|estimate|heterogeneity|observation|outcome|table|caption/iu.test(field));
    for (const identity of knownIdentities.slice(0, 6)) {
      const label = identityLabel(identity);
      addQuery(queries, `${label} results table effect estimate ${target.join(" ")}`, "QUANTITATIVE_RECOVERY", `missing_fields:${target.join(",") || "quantitative_results"}`, "semanticScholar", "results_table_or_effect_estimate", ["canonical_identity", "missingFormalFields"], input.caseId);
    }
  }
  if (purposes.includes("CONTRADICTORY_EVIDENCE")) {
    addQuery(queries, `${core} no effect null result conflicting evidence`, "CONTRADICTORY_EVIDENCE", "directional_heterogeneity", "semanticScholar", "contradictory_or_null_finding", ["dimensions", "existingThemes"], input.caseId);
  }
  if (purposes.includes("REPLICATION")) {
    const themeTerms = missingThemes.map((theme) => clean(theme.normalizedProposition) || clean(theme.themeId)).filter(Boolean).join(" ");
    addQuery(queries, `${core} ${themeTerms} independent replication cohort trial`, "REPLICATION", `theme_independence:${themeTerms || "major_theme"}`, "openalex", "independent_replication", ["dimensions", "missingThemes"], input.caseId);
  }
  if (purposes.includes("CITATION_CHAIN")) {
    const seed = knownIdentities[0] ? identityLabel(knownIdentities[0]) : `${core} review`;
    addQuery(queries, seed, "CITATION_CHAIN", "citation_linked_direct_studies", "semanticScholar", "citation_linked_study", [knownIdentities[0] ? "canonical_identity" : "review_seed"], input.caseId);
  }

  return {
    schemaVersion: "researchforge-evidence-gap-query-plan/v3",
    topic,
    researchQuestion,
    dimensions: general.dimensions,
    gapSummary: {
      directStudyCount: directStudies.length,
      knownIdentityCount: knownIdentities.length,
      missingFormalFields: missingFields,
      missingThemeCount: missingThemes.length,
    },
    queries: queries.slice(0, Math.max(1, Math.min(24, input.maxQueries ?? 16))),
  };
}
