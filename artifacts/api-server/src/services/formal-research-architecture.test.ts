import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SourceRecord } from "@workspace/api-zod/source-record";
import type { ReportWriterEvidenceCard, ReportWriterSection } from "./report-writer";
import {
  FORMAL_RESEARCH_REPORT_SCHEMA,
  buildContextBudgetCall,
  buildEvidenceMatrix,
  buildEvidenceCoverageGate,
  buildFormalResearchArchitecture,
  buildStudyDifferenceMatrix,
  buildSourceIndependenceV3,
  buildQuantitativeFactRegistry,
  buildQuantitativeFindings,
  buildSectionClaimOwnership,
  buildSectionClaimAllocations,
  classifyEvidenceAvailability,
  extractStructuredStudyEvidence,
  planVisualizations,
  repairFormalSectionsDeterministically,
  renderCitationCluster,
  selectResearchMethod,
  validateAnalyticalSynthesis,
  validateChartProvenance,
  validateCrossSectionDuplicates,
  validateFigureNarrativeBinding,
  validatePipelineLeakage,
  validateQuantitativeProvenance,
  validateQuantitativeFindingIntegration,
  validateResearchBlueprint,
  validateResearchQuestionClosure,
  validateSemanticDensity,
  validateSourceDominance,
} from "./formal-research-architecture";
import { evidenceFitsReportSection } from "./report-section-fit";
import {
  admitStudyFactEnvelopeV2,
  extractStudyFactEnvelopeV2,
  type StudyDocumentInputV2,
} from "./research/study-fact-extraction-v2";
import { deriveCanonicalStudyAdmission } from "./research/canonical-study-admission";
import type { StructuredStudyEvidence } from "./formal-research-architecture";

it("formal-report-schema: formal section ids bridge to canonical evidence-fit roles", () => {
  assert.equal(evidenceFitsReportSection("executive_summary", ["abstract"]), true);
  assert.equal(evidenceFitsReportSection("evidence_overview", ["literature_review"]), true);
  assert.equal(evidenceFitsReportSection("cross_study_synthesis", ["discussion"]), true);
  assert.equal(evidenceFitsReportSection("limitations_gaps", ["limitations"]), true);
});

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: "s1",
    provider: "openalex",
    title: "Microplastic exposure and marine organisms",
    authors: ["Author A"],
    year: 2021,
    doi: "10.1000/example",
    url: "https://doi.org/10.1000/example",
    abstract: "In 120 organisms, mortality increased by 23% after 14 days.",
    reviewState: "accepted",
    sourceType: "academic",
    sourceKind: "journal_article",
    recommendationBucket: "high_confidence",
    sourceRole: "core_scholarly_evidence",
    retrievalMode: "live_provider",
    relevanceScore: 0.9,
    sourceQualityScore: 0.9,
    evidencePoints: [],
    limitations: [],
    usableSections: ["analysis"],
    citationMarker: "[S1]",
    dedupeKey: "doi:10.1000/example",
    createdAt: "2026-08-23T00:00:00.000Z",
    retrievedAt: "2026-08-23T00:00:00.000Z",
    ...overrides,
  } as SourceRecord;
}

function card(overrides: Partial<ReportWriterEvidenceCard> = {}): ReportWriterEvidenceCard {
  return {
    id: "e1",
    sourceId: "s1",
    sourceTitle: "Microplastic exposure and marine organisms",
    sourceProvider: "openalex",
    claim: "Exposure was associated with mortality.",
    evidence: "In 120 organisms, mortality increased by 23% after 14 days.",
    summary: "Mortality increased.",
    relevance: "Directly relevant",
    supportSpan: "In 120 organisms, mortality increased by 23% after 14 days (p = 0.02).",
    year: 2021,
    usableSections: ["findings"],
    citationText: "Author A (2021)",
    limitation: "Laboratory exposure limits ecological generalization.",
    studyDesign: "laboratory experiment",
    outcome: "mortality",
    exposure: "microplastics",
    location: "Pacific Ocean",
    ...overrides,
  };
}

function formalSemanticStudy(input: {
  id: string;
  kind: "rct" | "observational" | "meta";
  direction?: StructuredStudyEvidence["effectDirection"];
  doi?: string;
}): StructuredStudyEvidence {
  const commonFinding = input.direction === "null"
    ? "Evening screen use showed no significant association with sleep duration among adolescents."
    : input.direction === "mixed"
      ? "Evening screen use was associated with shorter sleep duration among adolescents only under high bedtime exposure."
      : "Evening screen use was associated with shorter sleep duration among adolescents.";
  const documentByKind: Record<typeof input.kind, Pick<StudyDocumentInputV2, "title" | "sections">> = {
    rct: {
      title: "Randomized bedtime screen reduction trial",
      sections: [
        { heading: "Abstract", text: "This study aimed to evaluate evening screen reduction and adolescent sleep duration." },
        { heading: "Methods", text: "We conducted a randomized controlled trial with 240 adolescent students. Participants were randomly assigned to a bedtime screen reduction intervention or control group, and sleep duration was measured as the primary outcome." },
        { heading: "Results", text: `The primary outcome results showed that ${commonFinding}` },
      ],
    },
    observational: {
      title: "Cross-sectional evening screen and sleep study",
      sections: [
        { heading: "Abstract", text: "This study aimed to investigate evening screen exposure and adolescent sleep duration." },
        { heading: "Methods", text: "This cross-sectional survey included 520 adolescent students and used regression analysis. Evening screen exposure was the predictor and measured sleep duration was the outcome." },
        { heading: "Results", text: `The primary outcome results showed that ${commonFinding}` },
      ],
    },
    meta: {
      title: "Meta-analysis of evening screen exposure and adolescent sleep",
      sections: [
        { heading: "Abstract", text: "This meta-analysis aimed to estimate the association between evening screen use and adolescent sleep duration." },
        { heading: "Methods", text: "A random-effects meta-analysis included 18 studies and assessed heterogeneity for evening screen exposure and adolescent sleep duration." },
        { heading: "Results", text: `The pooled estimate=0.42 (95% CI 0.20–0.64), I²=55%, across 18 included studies. The results showed that ${commonFinding}` },
      ],
    },
  };
  const document = documentByKind[input.kind];
  const doi = input.doi ?? `10.5555/${input.id}`;
  const envelope = extractStudyFactEnvelopeV2({
    sourceId: input.id,
    documentId: `${input.id}:document`,
    canonicalId: doi,
    accessLevel: "full_text",
    extractionMethod: "semantic_html",
    extractionStatus: "text_extracted",
    fullTextCharCount: 3000,
    title: document.title,
    sections: document.sections,
  });
  const admission = admitStudyFactEnvelopeV2(envelope);
  assert.equal(admission.level, "FORMAL", `${input.id} fixture must be formally admissible: ${admission.reasons.join(",")}`);
  const canonicalAdmission = deriveCanonicalStudyAdmission({
    source: {
      id: input.id,
      sourceId: input.id,
      doi,
      accessLevel: "full_text",
      contentLevel: "full_text",
      extractionStatus: "text_extracted",
      extractionMethod: "semantic_html",
      fullTextCharCount: 3_000,
      fullTextUrl: `https://repository.example/${input.id}`,
      contentHash: `sha256:${input.id}`,
      enrichmentProvenance: [{
        accessState: "FULL_TEXT_STRUCTURED",
        checksum: `sha256:${input.id}`,
        resolvedUrl: `https://repository.example/${input.id}`,
        artifactCreated: true,
        legalAccess: true,
      }],
    },
    envelope,
    context: {
      jobId: "formal-architecture-fixture",
      workflowId: "formal-architecture-fixture",
      jobRevision: 1,
      checkpointRevision: 1,
      acquisitionTerminal: true,
      decidedAt: "2026-08-28T00:00:00.000Z",
    },
  });
  assert.equal(canonicalAdmission.admissionClass, "FORMAL");
  return {
    sourceId: input.id,
    studyId: doi,
    title: document.title,
    doi,
    studyDesign: envelope.studyType,
    studyDesignExplicit: true,
    population: "adolescents",
    exposure: "evening screen use",
    intervention: input.kind === "rct" ? "bedtime screen reduction" : undefined,
    outcomes: ["sleep duration"],
    primaryResult: commonFinding,
    effectDirection: input.direction ?? "negative",
    evidenceSpans: [{ spanId: `${input.id}:span`, sourceId: input.id, text: commonFinding, sectionHeading: "Results" }],
    readerClaims: [{ claimId: `${input.id}:claim`, sourceId: input.id, evidenceId: `${input.id}:span`, text: commonFinding }],
    extractionConfidence: 0.9,
    extractionSource: "full_text",
    verificationStatus: "verified",
    evidenceAvailability: "STRUCTURED_FULL_TEXT",
    contentAccessState: "full_text",
    structuredStudyFacts: [{ studyFactV2: envelope } as never],
    canonicalAdmission,
  };
}

describe("semantic theme and study independence V3", () => {
  it("builds deterministic A/B/C study differences without treating missing fields as the same", () => {
    const studyA = { ...formalSemanticStudy({ id: "study-a", kind: "rct" }), sampleSize: 240, outcomeMeasurement: "sleep diary", setting: undefined };
    const studyB = { ...formalSemanticStudy({ id: "study-b", kind: "observational" }), sampleSize: 520, outcomeMeasurement: "actigraphy", setting: undefined };
    const studyC = { ...formalSemanticStudy({ id: "study-c", kind: "meta", direction: "mixed" }), sampleSize: 18, outcomeMeasurement: "mixed instruments", setting: undefined };
    const matrix = buildStudyDifferenceMatrix("sleep-theme", [studyA, studyB, studyC]);
    const comparison = (field: string) => matrix.fields.find((item) => item.field === field)?.comparison;
    assert.equal(comparison("population"), "SAME");
    assert.equal(comparison("sample_size"), "DIFFERENT");
    assert.equal(comparison("comparator"), "PARTIALLY_COMPARABLE");
    assert.equal(comparison("setting_or_context"), "NOT_REPORTED");
    assert.notEqual(comparison("moderator_or_subgroup"), "SAME");
    assert.ok(matrix.fields.some((field) => field.field === "effect_magnitude"));
    assert.ok(matrix.fields.some((field) => field.field === "uncertainty"));
    assert.ok(matrix.fields.some((field) => field.field === "limitations"));
    assert.ok(matrix.summary.studyLevelDifferences.length > 0);
    assert.ok(matrix.fields.every((field) => field.values.every((value) => value.status !== "PRESENT" || value.provenanceIds.length > 0)));
  });

  it("classifies unavailable abstract-only A/B/C fields as UNKNOWN", () => {
    const unavailable = ["unknown-a", "unknown-b", "unknown-c"].map((id) => ({
      ...formalSemanticStudy({ id, kind: "observational" as const }),
      studyDesign: undefined,
      population: undefined,
      exposure: undefined,
      outcomes: undefined,
      effectDirection: "unknown" as const,
      contentAccessState: "abstract_only" as const,
      structuredStudyFacts: undefined,
      evidenceSpans: [],
    }));
    const matrix = buildStudyDifferenceMatrix("unavailable-theme", unavailable);
    assert.equal(matrix.fields.find((field) => field.field === "population")?.comparison, "UNKNOWN");
    assert.equal(matrix.fields.find((field) => field.field === "population")?.values.every((value) => value.status === "UNKNOWN"), true);
  });

  it("clusters a Case-07 analogue by proposition instead of splitting on study design", () => {
    const studies = [
      formalSemanticStudy({ id: "primary-rct", kind: "rct" }),
      formalSemanticStudy({ id: "primary-observational", kind: "observational" }),
      formalSemanticStudy({ id: "secondary-meta", kind: "meta" }),
    ];
    const matrix = buildEvidenceMatrix(studies);
    const gate = buildEvidenceCoverageGate(studies, matrix);
    assert.equal(matrix.length, 1);
    assert.equal(matrix[0]?.independentStudyIds?.length, 3);
    assert.equal(matrix[0]?.primaryIndependentSourceCount, 2);
    assert.equal(matrix[0]?.formalIndependentSourceCount, 3);
    assert.equal(gate.classification, "FORMAL_RESEARCH_REPORT");
    assert.equal(gate.rows[0]?.formalSynthesisEligible, true);
  });

  it("does not count duplicate DOI reports as independent studies", () => {
    const studies = [
      formalSemanticStudy({ id: "primary-original", kind: "rct", doi: "10.5555/shared-study" }),
      formalSemanticStudy({ id: "primary-duplicate", kind: "rct", doi: "https://doi.org/10.5555/shared-study" }),
      formalSemanticStudy({ id: "secondary-independent", kind: "meta" }),
    ];
    const independence = buildSourceIndependenceV3(studies);
    assert.equal(independence.find((item) => item.sourceId === "primary-duplicate")?.relationship, "DUPLICATE_REPORT");
    assert.equal(buildEvidenceMatrix(studies)[0]?.independentStudyIds?.length, 2);
  });

  it("labels a review as secondary synthesis and original studies as primary", () => {
    const independence = buildSourceIndependenceV3([
      formalSemanticStudy({ id: "original-study", kind: "observational" }),
      formalSemanticStudy({ id: "review-study", kind: "meta" }),
    ]);
    assert.equal(independence.find((item) => item.sourceId === "original-study")?.relationship, "PRIMARY");
    assert.equal(independence.find((item) => item.sourceId === "review-study")?.relationship, "SECONDARY_SYNTHESIS");
  });

  it("keeps support, null, and context-dependent sources in the same proposition audit", () => {
    const matrix = buildEvidenceMatrix([
      formalSemanticStudy({ id: "support-study", kind: "rct" }),
      formalSemanticStudy({ id: "null-study", kind: "observational", direction: "null" }),
      formalSemanticStudy({ id: "context-study", kind: "meta", direction: "mixed" }),
    ]);
    assert.equal(matrix.length, 1);
    assert.deepEqual(matrix[0]?.supportingSourceIds, ["support-study"]);
    assert.deepEqual(matrix[0]?.nullSourceIds, ["null-study"]);
    assert.deepEqual(matrix[0]?.contextDependentSourceIds, ["context-study"]);
    assert.equal(matrix[0]?.agreement, "conflicting");
  });
});

describe("formal-report-schema", () => {
  it("defines formal methods, synthesis, references, and all required appendices", () => {
    const ids = FORMAL_RESEARCH_REPORT_SCHEMA.map((section) => section.sectionId);
    assert.ok(ids.includes("methods"));
    assert.ok(ids.includes("cross_study_synthesis"));
    assert.ok(ids.includes("appendix_quantitative"));
    assert.match(FORMAL_RESEARCH_REPORT_SCHEMA.find((section) => section.sectionId === "methods")?.contract ?? "", /actually executed/u);
  });
});

describe("structured-study-evidence", () => {
  it("classifies access honestly and preserves missing fields", () => {
    assert.equal(classifyEvidenceAvailability(source()), "ABSTRACT_AVAILABLE");
    assert.equal(classifyEvidenceAvailability(source({ abstract: null })), "METADATA_ONLY");
    assert.equal(classifyEvidenceAvailability(source({ extractedChunks: [{ chunk_id: "a1", text: "Abstract evidence", source_location: "abstract", section_heading: "Abstract" }] })), "ABSTRACT_AVAILABLE");
    const [study] = extractStructuredStudyEvidence({ sources: [source()], evidenceCards: [card()] });
    assert.equal(study.studyDesign, "laboratory experiment");
    assert.equal(study.intervention, undefined);
    assert.match(study.evidenceSpans[0].text, /23%/u);
    assert.equal(study.extractionSource, "abstract");
  });

  it("preserves partial OA full-text access and page-level provenance", () => {
    const fullTextSource = {
      ...source({
        accessLevel: "full_text",
        fullTextUrl: "https://example.org/open/article.pdf",
        extractionStatus: "partial",
        pageCount: 10,
        extractedPageCount: 3,
        extractedChunks: [{
          chunk_id: "chunk-results-1",
          source_location: "page:4",
          text: "Adults assigned to exercise had systolic blood pressure reduced by 4.2 mmHg compared with control.",
          page: 4,
          section_heading: "Results",
          char_start: 120,
          char_end: 224,
        }],
      }),
      license: "https://creativecommons.org/licenses/by/4.0/",
    } as SourceRecord & { license: string };
    const fullTextCard = card({
      supportSpan: "Adults assigned to exercise had systolic blood pressure reduced by 4.2 mmHg compared with control.",
      outcome: "systolic blood pressure",
      intervention: "aerobic exercise",
      comparator: "control",
      chunkId: "chunk-results-1",
    } as Partial<ReportWriterEvidenceCard>);
    const [study] = extractStructuredStudyEvidence({
      sources: [fullTextSource],
      evidenceCards: [fullTextCard],
    });
    assert.equal(study.evidenceAvailability, "STRUCTURED_FULL_TEXT");
    assert.equal(study.contentAccessState, "partial_full_text");
    assert.equal(study.fullTextSource, "https://example.org/open/article.pdf");
    assert.match(study.license ?? "", /creativecommons/u);
    assert.equal(study.extractionSource, "full_text");
    assert.equal(study.evidenceSpans[0]?.page, 4);
    assert.equal(study.evidenceSpans[0]?.sectionHeading, "Results");
    assert.equal(study.comparator, "control");
  });

  it("uses explicit structured facts, preserves moderator roles, and does not infer design from title", () => {
    const span = "In a cross-sectional sample of 240 students, caffeine intake was associated with shorter sleep; the association was stronger among older students.";
    const provenance = { sourceId: "s1", sourceSpanText: span, sectionOrLocation: "Results", page: null, confidence: 0.9, extractionMethod: "llm_structured_fact" as const };
    const structuredCard = card({
      supportSpan: span,
      structuredStudyFact: {
        studyId: "10.1000/example", sourceId: "s1", title: "Randomized trial in a title only",
        authors: ["Author A"], year: 2021, venue: "Journal", doi: "10.1000/example", url: "https://doi.org/10.1000/example",
        evidenceLevel: "DIRECT_FINDING", contentAccessLevel: "abstract_only", metadataOnly: false,
        abstractAvailable: true, fullTextAvailable: false,
        studyDesign: "cross_sectional", studyDesignExplicit: true,
        population: "students", populationDescription: "240 students", populationAgeMin: null,
        populationAgeMax: null, populationAgeMean: null, populationSampleSize: 240,
        populationLocation: null, populationSetting: "school", exposure: "caffeine intake",
        exposureDefinition: null, exposureMeasurement: null, exposureTiming: null, exposureDuration: null,
        comparator: null, comparatorDefinition: null, outcome: "sleep duration", outcomeDefinition: null,
        outcomeMeasurement: null, outcomeTimepoint: null, effectDirection: "negative",
        effectDirectionConfidence: 0.9, adjustedOrUnadjusted: "unknown", covariates: [], confounders: [],
        moderators: [{ factor: "age", role: "moderator", effect: "stronger among older students", provenance }],
        mediators: [], subgroups: [], primaryResult: span, secondaryResults: [], limitations: [], authorCautions: [],
        quantitativeFacts: [{ metric: "sample_size", value: 240, rawValue: "240 students", unit: "participants_or_units", population: "students", denominator: 240, comparison: null, timepoint: null, ciLower: null, ciUpper: null, standardError: null, standardDeviation: null, pValue: null, effectDirection: "not_applicable", provenance }],
        fieldProvenance: { studyDesign: provenance, population: provenance, populationSampleSize: provenance, populationSetting: provenance, exposure: provenance, outcome: provenance, effectDirection: provenance, effectDirectionConfidence: provenance, primaryResult: provenance },
        evidenceConfidence: 0.9, extractionMethod: "llm_structured_fact",
      },
    });
    const [study] = extractStructuredStudyEvidence({ sources: [source({ title: "Randomized trial in a title only" })], evidenceCards: [structuredCard] });
    assert.equal(study.studyDesign, "cross_sectional");
    assert.equal(study.studyDesignExplicit, true);
    assert.equal(study.population, "students");
    assert.equal(study.effectDirection, "negative");
    assert.deepEqual(study.moderators?.map((item) => item.factor), ["age"]);
    assert.equal(study.sampleSize, 240);
  });

  it("keeps title-only design unknown and fails extraction coverage closed", () => {
    const titleOnly = extractStructuredStudyEvidence({
      sources: [source({ title: "Randomized controlled trial of an intervention" })],
      evidenceCards: [card({ studyDesign: null, exposure: null, outcome: null })],
    });
    assert.equal(titleOnly[0]?.studyDesign, undefined);
    const coverage = buildEvidenceCoverageGate(titleOnly, buildEvidenceMatrix(titleOnly));
    assert.equal(coverage.classification, "BLOCKED_EXTRACTION_FAILURE");
    assert.equal(coverage.studyDesignCoverage, 0);
  });
});

describe("quantitative-evidence-provenance", () => {
  it("registers validated facts and keeps incomplete numeric fragments fail closed", () => {
    const [validatedStudy] = extractStructuredStudyEvidence({
      sources: [source({ id: "s1" })],
      evidenceCards: [
        card({
          id: "e1",
          sourceId: "s1",
          supportSpan:
            "Systolic blood pressure mean difference was 4.2 mmHg (95% CI 2.1–6.3; p=0.01).",
        }),
      ],
    });
    const ambiguousStudy = {
      ...validatedStudy,
      sourceId: "s2",
      evidenceSpans: [
        {
          spanId: "e2",
          sourceId: "s2",
          text: "The reported mean difference was 1.",
        },
      ],
      keyNumericResults: [
        {
          numericEvidenceId: "e2",
          metric: "systolic_blood_pressure",
          value: 1,
          unit: "mmHg",
          estimateType: "difference" as const,
          sourceSpanId: "e2",
          comparableGroupKey: "systolic_blood_pressure|mmHg|difference",
        },
      ],
    };
    const facts = buildQuantitativeFactRegistry([
      validatedStudy,
      ambiguousStudy,
    ]);
    assert.equal(
      facts.some(
        (fact) =>
          fact.sourceId === "s1" &&
          fact.metricType === "difference" &&
          fact.validationStatus === "VALIDATED",
      ),
      true,
    );
    assert.equal(
      facts.some(
        (fact) =>
          fact.sourceId === "s2" && fact.validationStatus === "AMBIGUOUS",
      ),
      true,
    );
  });

  it("extracts numbers only from spans and rejects an unbound body number", () => {
    const [study] = extractStructuredStudyEvidence({ sources: [source()], evidenceCards: [card()] });
    assert.equal(study.keyNumericResults?.every((item) => item.sourceSpanId === "e1"), true);
    const sections: ReportWriterSection[] = [{ sectionId: "findings", title: "Findings", prose: "死亡率增加 23%。另有 99% 未被來源支持。", evidenceCardIds: ["e1"], citationIds: ["s1"] }];
    const result = validateQuantitativeProvenance({ sections, numericEvidence: study.keyNumericResults ?? [], spans: study.evidenceSpans });
    assert.equal(result.code, "QUANTITATIVE_CLAIM_WITHOUT_SOURCE");
    assert.equal(result.claims, 2);
    assert.equal(result.bodyNumericClaimCoverage, 50);
  });

  it("keeps decimal values intact while validating body provenance", () => {
    const [study] = extractStructuredStudyEvidence({
      sources: [source()],
      evidenceCards: [
        card({
          supportSpan:
            "Systolic blood pressure mean difference was 1.99 mmHg.",
        }),
      ],
    });
    const result = validateQuantitativeProvenance({
      sections: [
        {
          sectionId: "findings",
          prose: "單一研究報告收縮壓差異為 1.99 mmHg；此數值不可外推。",
          evidenceCardIds: ["e1"],
        },
      ],
      numericEvidence: study.keyNumericResults ?? [],
      spans: study.evidenceSpans,
    });
    assert.equal(result.pass, true);
    assert.equal(result.claims, 1);
    assert.equal(result.bodyNumericClaimCoverage, 100);
  });

  it("rejects an unbound sleep-duration number that uses a plain-language unit", () => {
    const [study] = extractStructuredStudyEvidence({
      sources: [source()],
      evidenceCards: [card({ supportSpan: "Mortality increased by 23%." })],
    });
    const result = validateQuantitativeProvenance({
      sections: [
        {
          sectionId: "findings",
          prose: "青少年的平均睡眠時間為 6.6 hours。",
          evidenceCardIds: ["e1"],
        },
      ],
      numericEvidence: study.keyNumericResults ?? [],
      spans: study.evidenceSpans,
    });
    assert.equal(result.pass, false);
    assert.equal(result.claims, 1);
    assert.equal(result.claimsWithProvenance, 0);
  });

  it("requires both endpoints of a quantitative range to be evidence-bound", () => {
    const studies = extractStructuredStudyEvidence({
      sources: [source({ id: "s1" }), source({ id: "s2", doi: "10.1000/two" })],
      evidenceCards: [
        card({ id: "e1", sourceId: "s1", supportSpan: "Systolic blood pressure decreased by 4.2 mmHg." }),
        card({ id: "e2", sourceId: "s2", supportSpan: "Systolic blood pressure decreased by 6.1 mmHg." }),
      ],
    });
    const spans = studies.flatMap((study) => study.evidenceSpans);
    const numericEvidence = studies.flatMap((study) => study.keyNumericResults ?? []);
    const result = validateQuantitativeProvenance({
      sections: [
        {
          sectionId: "findings",
          prose: "收縮壓下降介於 4.2–6.1 mmHg。",
          evidenceCardIds: ["e1"],
        },
      ],
      numericEvidence,
      spans,
    });
    assert.equal(result.pass, false);
    assert.equal(result.claims, 2);
    assert.equal(result.claimsWithProvenance, 1);
  });

  it("groups comparable adult blood-pressure changes without implying meta-analysis", () => {
    const studies = extractStructuredStudyEvidence({
      sources: [source({ id: "s1" }), source({ id: "s2", doi: "10.1000/two" })],
      evidenceCards: [
        card({ id: "e1", sourceId: "s1", outcome: "systolic blood pressure", supportSpan: "Systolic blood pressure decreased by 4.2 mmHg after aerobic exercise." }),
        card({ id: "e2", sourceId: "s2", outcome: "systolic blood pressure", supportSpan: "Systolic blood pressure reduction was 6.1 mm Hg compared with control." }),
      ],
    });
    const findings = buildQuantitativeFindings(studies, buildEvidenceMatrix(studies));
    const comparable = findings.find((finding) => finding.normalizedMetric === "systolic_blood_pressure");
    assert.equal(comparable?.eligibleForChart, true);
    assert.equal(comparable?.aggregationType, "descriptive-cross-study");
    assert.equal(comparable?.provenance.noMetaAnalysis, true);
    assert.match(comparable?.narrativeText ?? "", /4\.2–6\.1 mmHg/u);
    const integration = validateQuantitativeFindingIntegration({
      sections: [{ sectionId: "findings", prose: "收縮壓介於 4.2–6.1 mmHg，屬描述性比較。", evidenceCardIds: ["e1", "e2"] }],
      findings,
    });
    assert.equal(integration.pass, true);
    assert.equal(integration.coverage, 100);
  });

  it("fails quantitative integration when any required finding is missing from the Findings body", () => {
    const studies = extractStructuredStudyEvidence({
      sources: [source({ id: "s1" })],
      evidenceCards: [
        card({
          id: "e-sbp",
          sourceId: "s1",
          outcome: "systolic blood pressure",
          supportSpan: "Systolic blood pressure decreased by 4.2 mmHg after aerobic exercise.",
        }),
        card({
          id: "e-dbp",
          sourceId: "s1",
          outcome: "diastolic blood pressure",
          supportSpan: "Diastolic blood pressure decreased by 2.1 mmHg after aerobic exercise.",
        }),
      ],
    });
    const findings = buildQuantitativeFindings(studies, buildEvidenceMatrix(studies));
    assert.equal(findings.filter((finding) =>
      ["systolic_blood_pressure", "diastolic_blood_pressure"].includes(finding.normalizedMetric),
    ).length, 2);

    const integration = validateQuantitativeFindingIntegration({
      sections: [{
        sectionId: "findings",
        prose: "收縮壓下降 4.2 mmHg。",
        evidenceCardIds: ["e-sbp"],
      }],
      findings,
    });

    assert.equal(integration.pass, false);
    assert.equal(integration.code, "QUANTITATIVE_FINDING_NOT_INTEGRATED");
    assert.equal(integration.coverage, 50);
  });

  it("keeps SBP, DBP, heterogeneity, confidence level, and p-values semantically separate", () => {
    const [study] = extractStructuredStudyEvidence({
      sources: [source()],
      evidenceCards: [
        card({
          supportSpan: "Pooled results showed SBP mean difference 1.99 mmHg (95% CI -1.30 to 5.28; p=0.24), DBP 1.02 mmHg (95% CI -0.74 to 2.78; p=0.26), with I²=94%.",
        }),
      ],
    });
    const numeric = study.keyNumericResults ?? [];
    assert.equal(numeric.find((item) => item.value === 1.99)?.metric, "systolic_blood_pressure");
    assert.equal(numeric.find((item) => item.value === 1.99)?.pValue, "p=0.24");
    assert.equal(numeric.find((item) => item.value === 1.02)?.metric, "diastolic_blood_pressure");
    assert.equal(numeric.find((item) => item.value === 1.02)?.pValue, "p=0.26");
    assert.equal(numeric.find((item) => item.value === 94)?.metric, "heterogeneity_i2");
    assert.equal(numeric.filter((item) => item.value === 95).length, 0);
  });

  it("parses comma-delimited sample sizes without dropping the leading digits", () => {
    const [study] = extractStructuredStudyEvidence({
      sources: [source()],
      evidenceCards: [card({ supportSpan: "Nineteen trials included 1,253 participants." })],
    });
    assert.equal(study.sampleSize, 1253);
    assert.equal(study.keyNumericResults?.[0]?.value, 1253);
  });
});

describe("research-method-selector", () => {
  const base = { studies: extractStructuredStudyEvidence({ sources: [source()], evidenceCards: [card()] }), namedProviders: ["OpenAlex"], reproducibleSearchStrategy: true, explicitInclusionCriteria: true, explicitExclusionCriteria: true, screeningProcedure: true, duplicateRemoval: true, documentedStudySelection: true, qualityAssessment: false };
  it("downgrades an incomplete systematic review", () => {
    const result = selectResearchMethod({ ...base, requestedMethod: "SYSTEMATIC_REVIEW" });
    assert.equal(result.selectedMethod, "STRUCTURED_LITERATURE_REVIEW");
    assert.equal(result.status, "DOWNGRADED");
  });
  it("refuses meta-analysis without comparable effect estimates", () => {
    const result = selectResearchMethod({ ...base, requestedMethod: "META_ANALYSIS" });
    assert.equal(result.status, "META_ANALYSIS_NOT_SUPPORTED_BY_EVIDENCE");
  });
});

describe("visualization-planner and chart-evidence-gate", () => {
  it("approves metadata charts but rejects unsupported quantitative comparison", () => {
    const studies = extractStructuredStudyEvidence({ sources: [source(), source({ id: "s2", doi: "10.1000/two", year: 2022 })], evidenceCards: [card(), card({ id: "e2", sourceId: "s2", supportSpan: "No significant difference was observed." })] });
    const plans = planVisualizations(studies, buildEvidenceMatrix(studies));
    assert.equal(plans.find((plan) => plan.kind === "source_year_distribution")?.status, "APPROVED");
    assert.equal(plans.find((plan) => plan.kind === "quantitative_result_comparison")?.status, "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART");
  });

  it("rejects percentages that have incompatible outcome semantics", () => {
    const studies = extractStructuredStudyEvidence({
      sources: [source({ id: "s1" }), source({ id: "s2", doi: "10.1000/two" })],
      evidenceCards: [
        card({
          id: "e1",
          sourceId: "s1",
          supportSpan: "Negative effects were reported in ten studies (45%).",
        }),
        card({
          id: "e2",
          sourceId: "s2",
          supportSpan: "Exposed copepods ingested 11% fewer algal cells.",
        }),
      ],
    });
    const plan = planVisualizations(studies, buildEvidenceMatrix(studies));
    assert.equal(
      plan.find((item) => item.kind === "quantitative_result_comparison")?.status,
      "INSUFFICIENT_COMPARABLE_DATA_FOR_CHART",
    );
  });

  it("rejects an approved quantitative chart whose fact lineage is not validated", () => {
    const studies = extractStructuredStudyEvidence({
      sources: [source({ id: "s1" }), source({ id: "s2", doi: "10.1000/two" })],
      evidenceCards: [
        card({ id: "e1", sourceId: "s1", supportSpan: "Systolic blood pressure decreased by 4.2 mmHg." }),
        card({ id: "e2", sourceId: "s2", supportSpan: "Systolic blood pressure decreased by 6.1 mmHg." }),
      ],
    });
    const matrix = buildEvidenceMatrix(studies);
    const facts = buildQuantitativeFactRegistry(studies);
    const plans = planVisualizations(studies, matrix);
    assert.equal(
      validateChartProvenance({
        visualizationPlan: plans,
        quantitativeFactRegistry: facts,
      }).pass,
      true,
    );
    const tampered = plans.map((plan) =>
      plan.type === "quantitative_chart" && plan.status === "APPROVED"
        ? {
            ...plan,
            provenance: {
              ...plan.provenance,
              factIds: ["quantitative-fact:unknown"],
            },
          }
        : plan,
    );
    const result = validateChartProvenance({
      visualizationPlan: tampered,
      quantitativeFactRegistry: facts,
    });
    assert.equal(result.pass, false);
    assert.match(result.issues.join(" "), /unknown_fact_id/u);
  });
});

describe("citation-display-mode", () => {
  it("separates compact reader display from academic numbering", () => {
    assert.equal(renderCitationCluster(["s1", "s2"], "compact"), "[2 sources]");
    assert.equal(renderCitationCluster(["s1", "s2", "s3"], "academic", new Map([["s1", 12], ["s2", 13], ["s3", 14]])), "[12–14]");
  });
});

describe("cross-section-duplicate", () => {
  it("requires zero exact paragraph duplicates", () => {
    const repeated = "現有證據支持一項有限度的關聯，但研究設計與暴露條件限制了外部效度。";
    const result = validateCrossSectionDuplicates([{ sectionId: "findings", prose: repeated }, { sectionId: "discussion", prose: repeated }]);
    assert.equal(result.strictDuplicates.length, 1);
    assert.equal(result.strictDuplicates[0]?.category, "WRITER_REGENERATION_DUPLICATE");
  });

  it("reports claim and evidence lineage plus planning origin", () => {
    const studies = extractStructuredStudyEvidence({ sources: [source()], evidenceCards: [card()] });
    const allocations = buildSectionClaimAllocations(buildEvidenceMatrix(studies), studies);
    const repeated = "現有證據支持一項有限度的關聯，但研究設計限制了因果解釋。";
    const section = (sectionId: string): ReportWriterSection => ({
      sectionId,
      title: sectionId,
      prose: repeated,
      evidenceCardIds: ["e1"],
      citationIds: ["s1"],
      sentenceClaimTraces: [{ sentenceId: `${sectionId}:s1`, text: repeated, realizedClaimIds: ["claim-theme-1"], finalClaimIds: ["claim-theme-1"], evidenceIds: ["e1"], citationSourceIds: ["s1"] }],
    });
    const result = validateCrossSectionDuplicates([section("findings"), section("discussion")], 0.86, allocations);
    assert.equal(result.strictDuplicates[0]?.category, "CLAIM_DOUBLE_ALLOCATION");
    assert.equal(result.strictDuplicates[0]?.origin, "planning");
    assert.deepEqual(result.strictDuplicates[0]?.finalClaimIds, ["claim-theme-1"]);
    assert.deepEqual(result.strictDuplicates[0]?.evidenceIds, ["e1"]);
  });
});

describe("section-claim-allocation", () => {
  it("gives every claim one owner and explicit forbidden IDs per section", () => {
    const studies = extractStructuredStudyEvidence({ sources: [source()], evidenceCards: [card()] });
    const allocations = buildSectionClaimAllocations(buildEvidenceMatrix(studies), studies);
    const owned = allocations.flatMap((allocation) => allocation.ownedClaimIds);
    assert.equal(new Set(owned).size, owned.length);
    assert.ok(allocations.find((allocation) => allocation.sectionId === "findings")?.ownedClaimIds.includes("claim-theme-1"));
    assert.ok(allocations.find((allocation) => allocation.sectionId === "discussion")?.forbiddenClaimIds.length);
    assert.equal(allocations.every((allocation) => allocation.claims.every((claim) => claim.permittedRealizationCount === 1)), true);
  });

  it("publishes one authoritative owner and explicit secondary-use mode", () => {
    const studies = extractStructuredStudyEvidence({ sources: [source()], evidenceCards: [card()] });
    const allocations = buildSectionClaimAllocations(buildEvidenceMatrix(studies), studies);
    const ownership = buildSectionClaimOwnership(allocations);
    assert.equal(new Set(ownership.map((item) => item.claimId)).size, ownership.length);
    const thematic = ownership.find((item) => item.claimId === "claim-theme-1");
    assert.equal(thematic?.primarySection, "findings");
    assert.ok(thematic?.allowedSecondarySections.includes("discussion"));
    assert.equal(thematic?.secondaryUsageMode, "REFERENCE_ONLY");
  });
});

describe("deterministic formal section repair", () => {
  it("removes evidence metadata boilerplate and restores actual workflow Methods", () => {
    const architecture = buildFormalResearchArchitecture({
      sources: [source()],
      evidenceCards: [card()],
      workflow: {
        researchQuestion: "微塑膠暴露是否與海洋生物死亡率相關？",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
        searchQueries: ["microplastic mortality marine organisms"],
      },
    });
    const result = repairFormalSectionsDeterministically({
      architecture,
      sections: [
        {
          sectionId: "executive_summary",
          title: "執行摘要",
          prose: "本節目前引用支撐不足。",
          evidenceCardIds: [],
          citationIds: [],
          groundingStatus: "unsupported",
        },
        {
          sectionId: "methods",
          title: "研究方法",
          prose: "本節目前證據不足，無法據此重建實際執行。",
          evidenceCardIds: [],
          citationIds: [],
          groundingStatus: "unsupported",
        },
        {
          sectionId: "findings",
          title: "主要發現",
          prose: "此來源可用於檢視「Associations of screen time with sleep duration and sleep quality in adolescents」[S7]。",
          evidenceCardIds: ["e1"],
          citationIds: ["s1"],
        },
      ],
    });
    const methods = result.sections.find((section) => section.sectionId === "methods");
    const executive = result.sections.find((section) => section.sectionId === "executive_summary");
    const findings = result.sections.find((section) => section.sectionId === "findings");
    assert.match(executive?.prose ?? "", /23 %/u);
    assert.doesNotMatch(executive?.prose ?? "", /本節目前引用支撐不足/u);
    assert.match(methods?.prose ?? "", /微塑膠暴露是否與海洋生物死亡率相關/u);
    assert.match(methods?.prose ?? "", /OpenAlex/u);
    assert.match(methods?.prose ?? "", /搜尋日期/u);
    assert.match(methods?.prose ?? "", /搜尋語言/u);
    assert.match(methods?.prose ?? "", /全文取得/u);
    assert.match(methods?.prose ?? "", /證據抽取/u);
    assert.doesNotMatch(methods?.prose ?? "", /Evidence Card|provider/iu);
    assert.match(methods?.prose ?? "", /關聯度與品質/u);
    assert.match(methods?.prose ?? "", /衝突證據/u);
    assert.doesNotMatch(findings?.prose ?? "", /此來源可用於檢視/u);
    assert.equal(result.repairs.some((repair) => repair.repair === "workflow_facts_method_assembler"), true);
  });

  it("removes exact post-live cross-section duplicates while retaining the Findings owner", () => {
    const architecture = buildFormalResearchArchitecture({
      sources: [source()],
      evidenceCards: [card()],
      workflow: {
        researchQuestion: "微塑膠暴露是否與海洋生物死亡率相關？",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
      },
    });
    const repeated = "可追溯研究顯示微塑膠暴露與死亡率上升呈關聯[S1]。";
    const result = repairFormalSectionsDeterministically({
      architecture,
      sections: [
        {
          sectionId: "background",
          title: "研究背景",
          prose: repeated,
          evidenceCardIds: ["e1"],
          citationIds: ["s1"],
        },
        {
          sectionId: "findings",
          title: "主要發現",
          prose: repeated,
          evidenceCardIds: ["e1"],
          citationIds: ["s1"],
        },
        {
          sectionId: "discussion",
          title: "討論",
          prose: repeated,
          evidenceCardIds: ["e1"],
          citationIds: ["s1"],
        },
      ],
    });
    const duplicates = validateCrossSectionDuplicates(
      result.sections,
      0.86,
      architecture.sectionClaimAllocations,
    );
    assert.equal(duplicates.strictDuplicates.length, 0);
    assert.match(
      result.sections.find((section) => section.sectionId === "findings")?.prose ?? "",
      /死亡率上升/u,
    );
    assert.doesNotMatch(
      result.sections.find((section) => section.sectionId === "background")?.prose ?? "",
      /死亡率上升/u,
    );
    assert.equal(
      result.repairs.some(
        (repair) => repair.repair === "strict_cross_section_duplicate_removed_post_live",
      ),
      true,
    );
  });
});

describe("writer-context-budget", () => {
  it("caps a 32,768 context call below the configured 80 percent ceiling", () => {
    const result = buildContextBudgetCall({ callId: "call-1", model: "test", assignedSection: "findings", evidenceIdsUsed: ["e1"], prompt: "證據".repeat(20_000) });
    assert.ok(result.maximumInputTokens <= Math.floor(32_768 * 0.8));
    assert.equal(result.withinBudget, false);
    const bounded = buildContextBudgetCall({ callId: "call-2", model: "test", assignedSection: "findings", evidenceIdsUsed: ["e1"], prompt: "證據".repeat(4_000) });
    assert.equal(bounded.withinBudget, true);
  });
});

describe("analytical-synthesis-gate", () => {
  it("fails paper-by-paper prose even when it has citations", () => {
    const sections = [{ sectionId: "findings", prose: "Bai et al. 發現甲。Miller et al. 發現乙。Tang et al. 發現丙。" }, { sectionId: "discussion", prose: "限制仍然存在。" }];
    const matrix = [{ claimId: "c1", themeId: "t1", sourceIds: ["s1", "s2"], supportingSourceIds: ["s1"], conflictingSourceIds: ["s2"], quantitativeEvidenceIds: [], evidenceStrength: "moderate" as const, agreement: "conflicting" as const, moderators: ["design"], limitations: ["abstract only"] }];
    const result = validateAnalyticalSynthesis({ sections, matrix });
    assert.equal(result.pass, false);
    assert.equal(result.checks.avoidsPaperByPaperSequence, false);
  });

  it("requires both an observed matrix difference and prose that realizes the comparison", () => {
    const matrix = buildEvidenceMatrix([
      { ...formalSemanticStudy({ id: "compare-a", kind: "rct" }), population: "adolescents", sampleSize: 240 },
      { ...formalSemanticStudy({ id: "compare-b", kind: "observational" }), population: "university students", sampleSize: 520 },
    ]);
    const prose = "兩項研究的族群與研究設計不同：一項納入青少年並採隨機試驗，另一項納入大學生並採橫斷研究；因此只能做研究間比較，不進行因果合併。";
    const pass = validateAnalyticalSynthesis({
      sections: [
        { sectionId: "findings", prose },
        { sectionId: "cross_study_synthesis", prose: "效果方向相同，但樣本與測量方法的差異限制可比性。" },
        { sectionId: "discussion", prose: "證據限制與不確定性仍需保留。" },
      ],
      matrix,
    });
    assert.equal(pass.checks.studyLevelDifferences, true);
    const missingProse = validateAnalyticalSynthesis({ sections: [{ sectionId: "findings", prose: "研究呈現整體關聯。" }], matrix });
    assert.equal(missingProse.checks.studyLevelDifferences, false);
  });
});

describe("formal architecture integration", () => {
  it("projects an owner-issued admission without rehashing a normalized consumer source", () => {
    const fixture = formalSemanticStudy({
      id: "opaque-owner-revision",
      kind: "rct",
    });
    const canonicalAdmission = fixture.canonicalAdmission;
    assert.ok(canonicalAdmission);
    const architecture = buildFormalResearchArchitecture({
      sources: [source({
        id: fixture.sourceId,
        doi: fixture.doi,
        title: fixture.title,
        accessLevel: "full_text",
        fullTextUrl: "https://consumer.example/normalized-copy",
      })],
      evidenceCards: [card({
        id: `${fixture.sourceId}:card`,
        sourceId: fixture.sourceId,
        sourceTitle: fixture.title,
        sourceAccessLevel: "full_text",
        extractionStatus: "text_extracted",
      })],
      canonicalStudyAdmissions: [canonicalAdmission],
      canonicalContext: {
        jobId: canonicalAdmission.jobId,
        jobRevision: canonicalAdmission.jobRevision,
        checkpointRevision: canonicalAdmission.checkpointRevision,
      },
      workflow: {
        workflowId: canonicalAdmission.workflowId,
        researchQuestion: "Does bedtime screen reduction improve sleep duration?",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: true,
      },
    });
    assert.equal(architecture.canonicalAdmissionValidation.pass, true);
    assert.deepEqual(architecture.canonicalAdmissionValidation.issues, []);
    assert.equal(
      architecture.studies[0]?.canonicalAdmission?.evidenceRevision,
      canonicalAdmission.evidenceRevision,
    );
    assert.equal(
      architecture.writerAdmissionProjection[0]?.revision,
      canonicalAdmission.evidenceRevision,
    );
  });

  it("builds studies, matrix, method, packets, and evidence-gated visuals", () => {
    const architecture = buildFormalResearchArchitecture({ sources: [source()], evidenceCards: [card()], workflow: { researchQuestion: "微塑膠暴露是否與海洋生物死亡率相關？", namedProviders: ["OpenAlex"], reproducibleSearchStrategy: true, explicitInclusionCriteria: true, explicitExclusionCriteria: true, screeningProcedure: true, duplicateRemoval: true, documentedStudySelection: true, qualityAssessment: false, themeSynthesis: true } });
    assert.equal(architecture.reportMode, "formal_research_report");
    assert.equal(architecture.studies.length, 1);
    assert.equal(architecture.evidenceMatrix.length, 1);
    assert.equal(architecture.researchBlueprint.schemaVersion, "research-blueprint/v1");
    assert.equal(architecture.researchBlueprint.domain, "environment");
    assert.match(architecture.researchBlueprint.sectionPlan.find((section) => section.id === "findings")?.title ?? "", /微塑膠|主要/u);
    assert.equal(validateResearchBlueprint(architecture.researchBlueprint).pass, true);
    assert.ok(architecture.sectionClaimAllocations.length >= 9);
    assert.ok(architecture.quantitativeFindings.length > 0);
    assert.ok(architecture.figurePlan.some((figure) => figure.type === "research_flow" && figure.status === "APPROVED"));
    assert.equal(architecture.researchQuestionClosureMatrix[0]?.status, "COVERED");
    assert.equal(architecture.sectionEvidencePackets.every((packet) => packet.estimatedTokens <= 22_528), true);
  });

  it("rejects a large figure for a single-study single metric", () => {
    const architecture = buildFormalResearchArchitecture({
      sources: [source({
        title: "Screen use and poor sleep among adolescents",
        abstract: "Among adolescents, greater screen use was associated with poor sleep; 58% reported poor sleep quality.",
      })],
      evidenceCards: [card({
        supportSpan: "Among n = 205 respondents, 58% reported poor sleep quality.",
        outcome: "poor sleep prevalence",
        exposure: "screen use",
      })],
      workflow: {
        researchQuestion: "螢幕使用與睡眠不佳比例有何關聯？",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
        themeSynthesis: true,
      },
    });
    const singleMetric = architecture.figurePlan.find((figure) =>
      figure.id.startsWith("figure-single-study-")
    );
    assert.equal(singleMetric?.status, "REJECTED");
    assert.match(singleMetric?.rejectionReason ?? "", /FIGURE_NOT_SUPPORTED_BY_AVAILABLE_EVIDENCE/u);
    assert.notEqual(singleMetric?.type, "bar_chart");
  });

  it("creates a source-grounded education blueprint without inventing experiments, surveys, or interviews", () => {
    const educationSource = source({
      id: "edu-1",
      title: "Generative AI in secondary education: learning benefits and classroom risks",
      abstract: "A literature review reports learning support alongside risks of over-reliance and inaccurate output.",
      doi: "10.1000/education-ai",
    });
    const educationCard = card({
      id: "edu-e1",
      sourceId: "edu-1",
      sourceTitle: educationSource.title,
      claim: "The reviewed literature reports both learning support and risks.",
      supportSpan: "The literature review reports learning support alongside risks of over-reliance and inaccurate output.",
      studyDesign: "literature review",
      outcome: "learning benefits and risks",
      exposure: "generative AI use",
    });
    const architecture = buildFormalResearchArchitecture({
      sources: [educationSource],
      evidenceCards: [educationCard],
      workflow: {
        researchQuestion: "生成式人工智慧在高中教育中的學習效益、風險與合理使用策略",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
        themeSynthesis: true,
      },
    });
    assert.equal(architecture.researchBlueprint.domain, "education");
    assert.equal(architecture.researchBlueprint.researchQuestions.length, 4);
    assert.ok(architecture.researchBlueprint.synthesisAxes.some((axis) => /效益/u.test(axis)));
    assert.doesNotMatch(JSON.stringify(architecture.researchBlueprint.methodology), /實驗法|問卷調查|訪談法/u);
  });

  it("surfaces a quantitative extraction gap instead of silently accepting a numeric comparative design", () => {
    const hiitSource = source({
      id: "hiit-gap",
      title: "HIIT versus MICT for cardiorespiratory fitness in adults",
      abstract: "Results from a randomized controlled trial compared HIIT and MICT for VO2max in adults, but this indexed abstract omits the numeric estimate.",
    });
    const architecture = buildFormalResearchArchitecture({
      sources: [hiitSource],
      evidenceCards: [card({
        id: "hiit-card",
        sourceId: hiitSource.id,
        sourceTitle: hiitSource.title,
        studyDesign: "randomized controlled trial",
        exposure: "HIIT",
        comparator: "MICT",
        outcome: "VO2max",
        claim: "The trial compared HIIT and MICT for VO2max.",
        supportSpan: "Results compared HIIT and MICT for cardiorespiratory fitness and VO2max in adults.",
      } as Partial<ReportWriterEvidenceCard> & { comparator: string })],
      workflow: {
        researchQuestion: "HIIT versus MICT: cardiorespiratory fitness and VO2max in adults",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
      },
    });
    assert.deepEqual(architecture.diagnostics.quantitativeExtractionGaps, [
      "QUANTITATIVE_EXTRACTION_GAP:hiit-gap",
    ]);
  });

  it("extracts verified benchmark facts and gives every plotted result a fact/source point", () => {
    const sources = [
      source({
        id: "rag-1",
        title: "RAG versus fine-tuning benchmark for question answering",
        abstract: "Results compared RAG and fine-tuning for accuracy, cost, and latency.",
      }),
      source({
        id: "rag-2",
        doi: "10.1000/rag-2",
        dedupeKey: "doi:10.1000/rag-2",
        title: "RAG versus fine-tuning accuracy benchmark",
        abstract: "Results compared RAG and fine-tuning for accuracy, cost, and latency.",
      }),
    ];
    const cards = sources.map((item, index) => card({
      id: `rag-card-${index + 1}`,
      sourceId: item.id,
      sourceTitle: item.title,
      studyDesign: "comparative benchmark",
      exposure: "RAG",
      comparator: "fine-tuning",
      outcome: "accuracy",
      claim: "The benchmark directly compared RAG with fine-tuning.",
      supportSpan: `Results compared RAG and fine-tuning: accuracy was ${82 + index} %, latency was ${240 + index * 10} ms, and token cost was ${0.03 + index * 0.01} USD.`,
    } as Partial<ReportWriterEvidenceCard> & { comparator: string }));
    const architecture = buildFormalResearchArchitecture({
      sources,
      evidenceCards: cards,
      workflow: {
        researchQuestion: "RAG versus fine-tuning: accuracy, cost, and latency",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
      },
    });
    const facts = architecture.quantitativeFactRegistry.filter((fact) => fact.validationStatus === "VALIDATED");
    assert.ok(facts.length >= 6);
    assert.ok(facts.every((fact) => fact.sourceLocator !== undefined));
    assert.ok(facts.every((fact) => fact.extractionText.length > 0));
    assert.ok(facts.every((fact) => fact.extractionMethod === "deterministic_exact_span"));
    assert.deepEqual(architecture.diagnostics.quantitativeExtractionGaps, []);
    const resultFigure = architecture.figurePlan.find((figure) =>
      figure.status === "APPROVED" && figure.figureType === "RESULT_QUANTITATIVE"
    );
    assert.ok(resultFigure);
    assert.ok((resultFigure?.provenancePoints.length ?? 0) >= 2);
    assert.equal(resultFigure?.provenancePoints.every((point) =>
      Boolean(point.sourceId && point.quantitativeFactId && Number.isFinite(point.originalValue))
    ), true);
  });
});

describe("formal composer vNext reader gates", () => {
  const cleanSections: ReportWriterSection[] = [
    { sectionId: "background", title: "背景", prose: "青少年在日常生活中廣泛使用螢幕裝置，因此睡眠結果的適用條件需要清楚界定。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
    { sectionId: "methods", title: "方法", prose: "本研究採主題式文獻綜合，依研究問題篩選、分類與比較既有研究。", evidenceCardIds: [], citationIds: [] },
    { sectionId: "evidence_overview", title: "證據概況", prose: "納入研究包含不同族群與研究設計，解讀時保留各研究的測量與適用範圍。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
    { sectionId: "findings", title: "主要發現", prose: "現有研究大致指出較高螢幕暴露與較差睡眠結果並存，但結果受使用時段與測量定義影響。單一研究報告睡眠品質為 23 %，不得外推為整體比例。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
    { sectionId: "cross_study_synthesis", title: "跨研究比較", prose: "跨研究比較顯示族群、暴露與結果定義不同，因此不宜直接合併估計。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
    { sectionId: "discussion", title: "討論", prose: "差異可能來自研究設計與測量方式；關聯結果不能直接建立因果方向。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
    { sectionId: "limitations_gaps", title: "限制", prose: "部分資料僅能支持有限範圍的判讀，仍需縱向研究確認時間順序。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
    { sectionId: "conclusion", title: "結論", prose: "就待答問題而言，現有證據支持保守的關聯判讀，但不足以宣稱因果效果。", evidenceCardIds: ["e1"], citationIds: ["s1"] },
  ];

  it("fails pipeline leakage and source-dominant paper lists", () => {
    const leaked = [...cleanSections, { sectionId: "findings", title: "洩漏", prose: "系統初評為可直接納入證據整理，已取得 DOI 與來源連結。", evidenceCardIds: [], citationIds: [] }];
    assert.equal(validatePipelineLeakage(leaked).pass, false);
    const sourceLed = [{ sectionId: "findings", prose: "Chen et al. 發現第一項研究結果與睡眠品質之間存在明確關聯。\n\nLin et al. 指出第二項研究結果在不同族群中仍可觀察相同方向。\n\nWang et al. 顯示第三項研究結果支持前述暴露與結果之間的關係。" }];
    assert.equal(validateSourceDominance(sourceLed).pass, false);
  });

  it("passes Blueprint, density, closure, and figure narrative contracts for clean topic-centric prose", () => {
    const architecture = buildFormalResearchArchitecture({
      sources: [source()],
      evidenceCards: [card()],
      workflow: {
        researchQuestion: "微塑膠暴露是否與海洋生物死亡率相關？",
        namedProviders: ["OpenAlex"],
        reproducibleSearchStrategy: true,
        explicitInclusionCriteria: true,
        explicitExclusionCriteria: true,
        screeningProcedure: true,
        duplicateRemoval: true,
        documentedStudySelection: true,
        qualityAssessment: false,
        themeSynthesis: true,
      },
    });
    assert.equal(validatePipelineLeakage(cleanSections).pass, true);
    assert.equal(validateSourceDominance(cleanSections).pass, true);
    assert.equal(validateSemanticDensity(cleanSections).pass, true);
    assert.equal(validateResearchQuestionClosure({ sections: cleanSections, matrix: architecture.researchQuestionClosureMatrix }).pass, true);
    assert.equal(validateFigureNarrativeBinding({ sections: cleanSections, figurePlan: architecture.figurePlan, quantitativeFacts: architecture.quantitativeFactRegistry }).pass, true);
  });

  it("extracts OR, beta, correlation, p-values, and daily hours from exact spans", () => {
    const [study] = extractStructuredStudyEvidence({
      sources: [source()],
      evidenceCards: [card({
        supportSpan: "Average screen time was 9.13 h/day. Weekend use predicted sleep quality (β = −0.27, p = 0.016), total use correlated with sleep quality (r = −0.18, p < 0.01), and pre-sleep exposure was associated with poor sleep (OR = 5.487, p < 0.001).",
      })],
    });
    const metrics = study.keyNumericResults?.map((item) => item.metric) ?? [];
    assert.ok(metrics.includes("screen_time"));
    assert.ok(metrics.includes("standardized_beta"));
    assert.ok(metrics.includes("correlation"));
    assert.ok(metrics.includes("odds_ratio"));
    assert.ok(study.keyNumericResults?.some((item) => item.pValue === "p=0.016"));
  });
});
