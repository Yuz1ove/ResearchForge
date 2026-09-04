import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

type JsonObject = Record<string, unknown>;

interface AdmissionRow {
  studyId?: string;
  sourceId?: string;
  studyType?: string;
  level?: string;
  reasons?: string[];
}

interface ThemeRow {
  themeId?: string;
  sourceIds?: string[];
  supportingSourceIds?: string[];
  conflictingSourceIds?: string[];
  quantitativeEvidenceIds?: string[];
  evidenceStrength?: string;
  agreement?: string;
}

interface CoverageRow {
  theme?: string;
  independentSourceCount?: number;
  fullTextSourceCount?: number;
  studyDesignDiversity?: string[];
  populationCoverage?: number;
  exposureCoverage?: number;
  outcomeCoverage?: number;
  effectDirectionCoverage?: number;
  quantitativeSourceCount?: number;
  contradictionStatus?: string;
  synthesisEligible?: boolean;
}

interface AcceptanceCase {
  caseId: string;
  slug: string;
  topic: string;
  classification: string;
  firstWeakLayer: string;
  searchedCandidates: number;
  acceptedSources: number;
  directStudies: number;
  fullTextStudies: number;
  limitedStudyAdmissions?: number;
  formalStudyAdmissions?: number;
  quantitativeFacts: number;
  studyTypeInterpretationCoverage?: number;
  reasons?: string[];
}

function parseJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function missingField(reason: string): string | null {
  const match = reason.match(/^([^:]+):(NOT_REPORTED|EXTRACTION_FAILED)$/u);
  return match?.[1] ?? null;
}

function rejectionReason(candidate: JsonObject): string {
  const assessment = candidate.topicIntegrityAssessment as JsonObject | undefined;
  const entailment = assessment?.evidenceEntailment as JsonObject | undefined;
  const hardExclusion = assessment?.hardExclusion as JsonObject | undefined;
  const reasons = Array.isArray(hardExclusion?.reasons)
    ? hardExclusion.reasons.filter((item): item is string => typeof item === "string")
    : [];
  if (reasons.length > 0) return reasons.join(";");
  if (typeof entailment?.rejectionReason === "string") return entailment.rejectionReason;
  if (typeof candidate.governanceReason === "string") return candidate.governanceReason;
  if (candidate.reviewStatus === "rejected") return "REJECTED_UNCLASSIFIED";
  return "INSUFFICIENT_METADATA";
}

function rejectionTaxonomy(reason: string): string {
  if (/duplicate/iu.test(reason)) return "DUPLICATE";
  if (/population|species/iu.test(reason)) return "WRONG_POPULATION";
  if (/intervention|exposure/iu.test(reason)) return "WRONG_EXPOSURE";
  if (/outcome|metric|task/iu.test(reason)) return "WRONG_OUTCOME";
  if (/protocol|non.?empirical/iu.test(reason)) return "NON_EMPIRICAL";
  if (/review/iu.test(reason)) return "REVIEW_ONLY";
  if (/topic/iu.test(reason)) return "TOPIC_ONLY_BACKGROUND";
  if (/metadata|unclassified/iu.test(reason)) return "INSUFFICIENT_METADATA";
  return "TOPIC_ONLY_BACKGROUND";
}

function recommendedPurposes(input: {
  directStudies: number;
  fullTextStudies: number;
  formalStudies: number;
  missingFields: string[];
  themes: CoverageRow[];
}): string[] {
  const purposes: string[] = [];
  if (input.directStudies === 0) purposes.push("DIRECT_EMPIRICAL", "REVIEW_SEED", "CITATION_CHAIN");
  if (input.directStudies > 0 && input.fullTextStudies === 0) purposes.push("FULLTEXT_RECOVERY");
  if (input.directStudies === 1) purposes.push("REPLICATION");
  if (input.missingFields.some((field) => /method|population|participant|dataset|corpus|annotation|includedStudy|synthesis/iu.test(field))) {
    purposes.push("METHOD_RECOVERY");
  }
  if (input.missingFields.some((field) => /effect|metric|result|pooled|heterogeneity|observation|outcome/iu.test(field))) {
    purposes.push("QUANTITATIVE_RECOVERY");
  }
  if (input.themes.some((theme) => theme.contradictionStatus === "conflicting")) purposes.push("CONTRADICTORY_EVIDENCE");
  if (input.themes.length === 0 || input.themes.some((theme) => !theme.synthesisEligible)) purposes.push("REPLICATION");
  if (input.formalStudies === 0 && purposes.length === 0) purposes.push("DIRECT_EMPIRICAL");
  return unique(purposes);
}

function firstGap(input: AcceptanceCase): string {
  if (input.directStudies === 0) return "DIRECT_EVIDENCE_GAP";
  if (input.fullTextStudies === 0) return "FULL_TEXT_ACCESS_GAP";
  if ((input.formalStudyAdmissions ?? 0) === 0) return "STUDY_FACT_COMPLETENESS_GAP";
  return "THEME_SYNTHESIS_GAP";
}

const [liveRoot, outputRoot] = process.argv.slice(2);
if (!liveRoot || !outputRoot) {
  throw new Error("Usage: tsx scripts/materialize-evidence-gap-v3.ts <previous-live-root> <output-root>");
}

const acceptance = parseJson<{ topics: AcceptanceCase[] }>(join(liveRoot, "acceptance-matrix.json"));

const cases = acceptance.topics.map((entry) => {
  const caseRoot = join(liveRoot, `case-${entry.caseId}-${entry.slug}`);
  const coverage = parseJson<{
    rows?: CoverageRow[];
    typeSpecificAdmission?: AdmissionRow[];
    reasons?: string[];
  }>(join(caseRoot, "evidence-coverage.json"));
  const themes = parseJson<ThemeRow[]>(join(caseRoot, "evidence-matrix.json"));
  const review = parseJson<{ candidates?: JsonObject[]; accepted?: JsonObject[] }>(join(caseRoot, "source-review.json"));
  const acceptedSources = parseJson<JsonObject[]>(join(caseRoot, "accepted-sources.json"));
  const admissions = coverage.typeSpecificAdmission ?? [];
  const missingFields = unique(admissions.flatMap((row) => (row.reasons ?? []).map(missingField).filter((item): item is string => Boolean(item))));
  const studyTypes = countBy(admissions.map((row) => row.studyType ?? "UNCLASSIFIABLE"));
  const accessLevels = countBy(acceptedSources.map((source) => String(source.accessLevel ?? source.contentLevel ?? "UNRESOLVED")));
  const candidateRejections = countBy((review.candidates ?? [])
    .filter((candidate) => !Boolean((candidate.topicIntegrityAssessment as JsonObject | undefined)?.acceptedForCanonicalEvidence))
    .map((candidate) => rejectionTaxonomy(rejectionReason(candidate))));
  const themeRows = coverage.rows ?? [];
  const formalStudies = entry.formalStudyAdmissions ?? 0;
  const purposes = recommendedPurposes({
    directStudies: entry.directStudies,
    fullTextStudies: entry.fullTextStudies,
    formalStudies,
    missingFields,
    themes: themeRows,
  });

  return {
    caseId: entry.caseId,
    slug: entry.slug,
    topic: entry.topic,
    researchQuestion: entry.topic,
    baselineClassification: entry.classification,
    firstWeakLayer: entry.firstWeakLayer,
    firstEvidenceGap: firstGap(entry),
    counts: {
      candidates: entry.searchedCandidates,
      acceptedSources: entry.acceptedSources,
      directStudies: entry.directStudies,
      trueFullText: entry.fullTextStudies,
      limitedStudies: entry.limitedStudyAdmissions ?? 0,
      formalStudies,
      quantitativeFacts: entry.quantitativeFacts,
    },
    studyTypes,
    accessLevels,
    themes: themeRows.map((theme) => ({
      themeId: theme.theme,
      independentStudies: theme.independentSourceCount ?? 0,
      fullTextStudies: theme.fullTextSourceCount ?? 0,
      studyDesignDiversity: theme.studyDesignDiversity ?? [],
      quantitativeStudies: theme.quantitativeSourceCount ?? 0,
      contradictionStatus: theme.contradictionStatus ?? "unknown",
      synthesisEligible: theme.synthesisEligible ?? false,
    })),
    themeEvidence: themes.map((theme) => ({
      themeId: theme.themeId ?? "unknown",
      supportingStudies: theme.supportingSourceIds ?? [],
      contradictingStudies: theme.conflictingSourceIds ?? [],
      quantitativeEvidence: theme.quantitativeEvidenceIds ?? [],
      agreement: theme.agreement ?? "unknown",
    })),
    missingFormalFields: missingFields,
    blockedStudyReasons: countBy(admissions.flatMap((row) => row.reasons ?? [])),
    candidateRejectionTaxonomy: candidateRejections,
    needsMoreSources: entry.directStudies < 2 || themeRows.length === 0 || themeRows.some((theme) => (theme.independentSourceCount ?? 0) < 2),
    needsFullTextRecovery: entry.directStudies > entry.fullTextStudies,
    metadataOnlyRisk: entry.directStudies > 0 && entry.fullTextStudies === 0,
    recommendedQueryPurposes: purposes,
    targetEvidence: {
      studyTypes: entry.directStudies === 0 ? ["DIRECT_PRIMARY_EMPIRICAL"] : Object.keys(studyTypes),
      methodFacts: missingFields.filter((field) => /method|population|participant|dataset|corpus|annotation|includedStudy|synthesis/iu.test(field)),
      resultFacts: missingFields.filter((field) => /effect|metric|result|pooled|heterogeneity|observation|outcome/iu.test(field)),
      fullText: entry.directStudies - entry.fullTextStudies,
      themeReplication: themeRows.filter((theme) => (theme.independentSourceCount ?? 0) < 2).map((theme) => theme.theme ?? "unknown"),
    },
    currentBlockers: unique([...(entry.reasons ?? []), ...(coverage.reasons ?? [])]),
  };
});

const artifact = {
  schemaVersion: "researchforge-case-evidence-gap-map/v3",
  generatedFrom: {
    liveRoot,
    liveRootFingerprint: createHash("sha256").update(liveRoot).digest("hex"),
    providerRequests: 0,
    writerRequests: 0,
    replayOnly: true,
  },
  baseline: {
    limitedCases: acceptance.topics.filter((entry) => entry.classification === "LIMITED_EVIDENCE_BRIEF").length,
    formalCases: 0,
  },
  cases,
};

mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, "CASE-EVIDENCE-GAP-MAP.json"), `${JSON.stringify(artifact, null, 2)}\n`);

const summaryRows = cases.map((entry) => `| ${entry.caseId} | ${entry.firstEvidenceGap} | ${entry.counts.directStudies} | ${entry.counts.trueFullText} | ${entry.counts.limitedStudies} | ${entry.counts.formalStudies} | ${entry.themes.filter((theme) => theme.synthesisEligible).length}/${entry.themes.length} | ${entry.recommendedQueryPurposes.join(", ")} |`);
const details = cases.map((entry) => `## Case ${entry.caseId} — ${entry.topic}\n\n- Research question: ${entry.researchQuestion}\n- First upstream gap: \`${entry.firstEvidenceGap}\` (${entry.firstWeakLayer})\n- Study types: ${Object.entries(entry.studyTypes).map(([type, count]) => `${type}=${count}`).join(", ") || "none"}\n- Access states: ${Object.entries(entry.accessLevels).map(([state, count]) => `${state}=${count}`).join(", ") || "none"}\n- Current themes: ${entry.themes.map((theme) => `${theme.themeId} (${theme.independentStudies} independent; ${theme.synthesisEligible ? "eligible" : "not eligible"})`).join("; ") || "none"}\n- Missing FORMAL fields: ${entry.missingFormalFields.join(", ") || "none identified before direct/full-text admission"}\n- Candidate rejection taxonomy: ${Object.entries(entry.candidateRejectionTaxonomy).map(([reason, count]) => `${reason}=${count}`).join(", ") || "none"}\n- Target evidence: ${entry.recommendedQueryPurposes.join(", ")}\n- Needs more sources: ${entry.needsMoreSources}; needs full-text recovery: ${entry.needsFullTextRecovery}; metadata-only risk: ${entry.metadataOnlyRisk}\n`).join("\n");

const markdown = `# Case evidence gap map\n\nThis map was generated before any V3 live retrieval. It replays the previous bounded live artifact only. Provider requests: **0**. Writer requests: **0**.\n\nBaseline: **${artifact.baseline.limitedCases}/10 LIMITED**, **0/10 FORMAL**.\n\n| case | first upstream gap | direct | true full text | LIMITED studies | FORMAL studies | eligible themes | targeted purpose |\n|---|---|---:|---:|---:|---:|---:|---|\n${summaryRows.join("\n")}\n\n${details}`;
writeFileSync(join(outputRoot, "CASE-EVIDENCE-GAP-MAP.md"), markdown);

process.stdout.write(`${outputRoot}\n`);
