import assert from "node:assert/strict";
import test from "node:test";
import {
  admitStudyFactEnvelopeV2,
  assertPresentFactsHaveProvenance,
  buildCrossStudyClaimCandidatesV2,
  buildResearchDocumentV2,
  classifyStudyTypeV2,
  extractStudyFactEnvelopeV2,
  recoverQuantitativeFactsV2,
  type StudyDocumentInputV2,
} from "./study-fact-extraction-v2";

function documentInput(input: Partial<StudyDocumentInputV2> & Pick<StudyDocumentInputV2, "title">): StudyDocumentInputV2 {
  return {
    sourceId: input.sourceId ?? `source:${input.title.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-")}`,
    accessLevel: "full_text",
    extractionMethod: "html_readability",
    extractionStatus: "text_extracted",
    ...input,
  };
}

function classify(input: StudyDocumentInputV2) {
  return classifyStudyTypeV2(buildResearchDocumentV2(input));
}

const typeCases: Array<[string, StudyDocumentInputV2, string]> = [
  ["RCT", documentInput({ title: "Randomized learning trial", sections: [
    { heading: "Methods", text: "We conducted a randomized controlled trial. Students were randomly assigned to the tutoring intervention or a control group." },
    { heading: "Results", text: "The intervention increased the primary learning score compared with control." },
  ] }), "RANDOMIZED_EXPERIMENT"],
  ["observational", documentInput({ title: "Sleep and grades in students", sections: [
    { heading: "Methods", text: "This cross-sectional survey included 620 students and used regression analysis." },
    { heading: "Results", text: "Longer sleep was positively associated with academic performance after adjustment." },
  ] }), "OBSERVATIONAL_CROSS_SECTIONAL"],
  ["longitudinal", documentInput({ title: "Longitudinal cohort of adolescents", sections: [
    { heading: "Methods", text: "This prospective cohort followed adolescents from baseline for three years." },
    { heading: "Results", text: "Physical activity increased over follow-up among retained participants." },
  ] }), "COHORT_LONGITUDINAL"],
  ["qualitative", documentInput({ title: "Teacher experience study", sections: [
    { heading: "Methods", text: "We conducted semi-structured interviews and thematic analysis with 24 teachers." },
    { heading: "Findings", text: "Three themes emerged and showed tension between autonomy and monitoring." },
  ] }), "QUALITATIVE"],
  ["systematic review", documentInput({ title: "Systematic review of green space", sections: [
    { heading: "Methods", text: "This systematic review followed PRISMA. Four databases were searched with explicit inclusion criteria and narrative synthesis." },
    { heading: "Results", text: "The review found generally positive associations with important evidence limitations." },
  ] }), "SYSTEMATIC_REVIEW"],
  ["meta-analysis", documentInput({ title: "Meta-analysis of exercise trials", sections: [
    { heading: "Methods", text: "A meta-analysis used a random-effects model and assessed heterogeneity." },
    { heading: "Results", text: "The pooled estimate = 0.42 (95% CI 0.20–0.64), I² = 55%, across 18 included studies." },
  ] }), "META_ANALYSIS"],
  ["technical", documentInput({ title: "Neural retrieval benchmark", sections: [
    { heading: "Methods", text: "We propose a retrieval algorithm evaluated on a public benchmark dataset against a baseline model." },
    { heading: "Results", text: "The proposed method increased accuracy = 91.2% and F1 = 0.89." },
  ] }), "TECHNICAL_COMPUTATIONAL"],
  ["corpus", documentInput({ title: "A multilingual annotated corpus", sections: [
    { heading: "Materials", text: "We release a corpus dataset containing 80,000 sentences in eight languages with a documented annotation scheme." },
    { heading: "Quality", text: "Inter-annotator agreement showed strong annotation quality." },
  ] }), "DATASET_CORPUS_RESOURCE"],
];

for (const [name, input, expected] of typeCases) {
  test(`study type classifier recognizes ${name}`, () => {
    const result = classify(input);
    assert.equal(result.type, expected);
    assert.ok(result.confidence >= 0.5);
    assert.ok(result.evidence.length > 0);
  });
}

test("unknown study type fails closed without crashing or fake classification", () => {
  const result = classify(documentInput({ title: "A short note", accessLevel: "abstract_only", abstract: "This note discusses a topic without reporting a design or empirical finding." }));
  assert.ok(["UNCLASSIFIABLE", "OTHER_EMPIRICAL"].includes(result.type));
  if (result.type === "OTHER_EMPIRICAL") assert.ok(result.confidence < 0.5);
});

test("full-text interpretability rejects short publisher shells marked as full text", () => {
  const document = buildResearchDocumentV2(documentInput({
    title: "Publisher abstract page",
    fullTextCharCount: 310,
    sections: [{ heading: "Readable body", text: "This abstract page contains a short summary of an article but has no methods section, no results table, and no substantive article body. It is not a complete full text record and should not be treated as one for formal admission." }],
  }));
  assert.equal(document.fullTextInterpretability, "TRUNCATED");
  assert.match(document.interpretabilityReasons.join(" "), /insufficient_full_text_chars/u);
});

test("missing semantics keep NOT_APPLICABLE, NOT_REPORTED, UNKNOWN, and parser failures distinct", () => {
  const qualitative = extractStudyFactEnvelopeV2(documentInput({ title: "Qualitative teacher experience", sections: [
    { heading: "Methods", text: "Semi-structured interviews with 22 teachers were analysed using thematic analysis." },
    { heading: "Findings", text: "The findings showed three themes about trust, autonomy, and workload." },
  ] }));
  assert.equal(qualitative.coreFacts.effectEstimate.status, "NOT_APPLICABLE");
  assert.equal(qualitative.coreFacts.intervention.status, "NOT_APPLICABLE");
  assert.notEqual(qualitative.coreFacts.effectEstimate.status, "NOT_REPORTED");

  const missingOutcome = extractStudyFactEnvelopeV2(documentInput({ title: "Cross-sectional survey", sections: [
    { heading: "Methods", text: `A cross-sectional survey included 200 participants and used regression analysis. ${"Recruitment and measurement procedures were documented without naming the prespecified endpoint in the available section. ".repeat(7)}` },
    { heading: "Results", text: `The results described the sample but did not report the prespecified endpoint. ${"Descriptive characteristics and response quality checks were reported for the analytic sample. ".repeat(7)}` },
  ] }));
  assert.equal(missingOutcome.coreFacts.outcome.status, "NOT_REPORTED");

  const abstractOnly = extractStudyFactEnvelopeV2(documentInput({
    title: "Abstract-only observational record",
    accessLevel: "abstract_only",
    abstract: "A cross-sectional survey examined an association, but the full article was not acquired.",
  }));
  assert.equal(abstractOnly.coreFacts.outcome.status, "UNKNOWN");
  assert.equal(abstractOnly.populationContext.status, "UNKNOWN");

  const corrupted = extractStudyFactEnvelopeV2(documentInput({ title: "Damaged PDF", extractedText: "������������", extractionStatus: "text_extracted" }));
  assert.equal(corrupted.coreFacts.outcome.status, "EXTRACTION_FAILED");
});

test("quantitative recovery extracts body statistics with exact provenance", () => {
  const document = buildResearchDocumentV2(documentInput({ title: "Clinical association study", sections: [
    { heading: "Methods", text: "The study included N=420 participants." },
    { heading: "Results", text: "The mean score was 12.4 (SD=2.1). The adjusted OR=1.62, 95% CI 1.20–2.18, p<0.01. Prevalence was 34.5%." },
  ] }));
  const facts = recoverQuantitativeFactsV2(document);
  for (const metric of ["sample_size", "mean", "standard_deviation", "odds_ratio", "confidence_interval", "p_value", "percentage"]) {
    assert.ok(facts.some((fact) => fact.metric === metric), `missing ${metric}`);
  }
  assert.ok(facts.every((fact) => fact.provenance.exactEvidence.length > 0));
});

test("quantitative recovery extracts technical and meta-analysis metrics", () => {
  const technical = recoverQuantitativeFactsV2(buildResearchDocumentV2(documentInput({ title: "Benchmark", sections: [
    { heading: "Results", text: "Accuracy=91.2%, F1=0.89, precision=0.90, recall=0.88, AUC=0.94, RMSE=2.1, MAE=1.4, BLEU=32.6, ROUGE-L=41.8." },
  ] })));
  for (const metric of ["accuracy", "f1", "precision", "recall", "auc", "rmse", "mae", "bleu", "rouge"]) assert.ok(technical.some((fact) => fact.metric === metric), `missing ${metric}`);

  const meta = recoverQuantitativeFactsV2(buildResearchDocumentV2(documentInput({ title: "Meta-analysis", sections: [
    { heading: "Results", text: "The pooled estimate=0.42, I²=55%, τ²=0.08, and Cochran's Q=19.4 across 18 included studies." },
  ] })));
  for (const metric of ["pooled_estimate", "i_squared", "tau_squared", "q_statistic", "included_studies"]) assert.ok(meta.some((fact) => fact.metric === metric), `missing ${metric}`);
});

test("table recovery keeps multi-column cells and caption provenance separate", () => {
  const document = buildResearchDocumentV2(documentInput({
    title: "Table study",
    sections: [{ heading: "Results", text: "The results showed group differences." }],
    tables: [{
      title: "Table 2. Primary outcomes",
      caption: "Adjusted outcomes by group",
      columns: ["Group", "Accuracy", "F1"],
      rows: [
        { label: "Intervention", cells: ["Intervention", "Accuracy=92.1%", "F1=0.91"] },
        { label: "Control", cells: ["Control", "Accuracy=84.4%", "F1=0.82"] },
      ],
    }],
    figures: [{ caption: "Figure 1. Accuracy increased to 92.1% after training." }],
  }));
  const facts = recoverQuantitativeFactsV2(document);
  const tableFacts = facts.filter((fact) => fact.provenance.section === "table");
  assert.ok(tableFacts.some((fact) => fact.metric === "accuracy" && fact.provenance.tableRow === "Intervention"));
  assert.ok(tableFacts.some((fact) => fact.metric === "f1" && fact.provenance.tableColumn === "F1"));
  assert.ok(facts.some((fact) => fact.provenance.section === "figure_caption"));
});

test("quantitative recovery rejects prose substrings and publisher identifiers", () => {
  const document = buildResearchDocumentV2(documentInput({
    title: "Publisher metadata shell",
    sections: [{
      heading: "Metadata",
      text: "It should be noted that these 42 articles were our main analysis objects. Online ISSN : 2433-0043 Print ISSN : 0910-8017.",
    }],
  }));
  const facts = recoverQuantitativeFactsV2(document);
  assert.equal(facts.some((fact) => fact.metric === "standard_error"), false);
  assert.equal(facts.some((fact) => fact.metric === "sample_size"), false);
});

test("type-specific admission does not require effect size for qualitative studies", () => {
  const envelope = extractStudyFactEnvelopeV2(documentInput({ title: "Qualitative interview study", sections: [
    { heading: "Abstract", text: "The study aimed to understand teacher adaptation." },
    { heading: "Methods", text: "We conducted semi-structured interviews with 24 teachers and used thematic analysis." },
    { heading: "Findings", text: "The findings showed three themes concerning trust, workload, and professional autonomy." },
  ] }));
  const admission = admitStudyFactEnvelopeV2(envelope);
  assert.notEqual(admission.level, "BLOCKED");
  assert.equal(envelope.coreFacts.effectEstimate.status, "NOT_APPLICABLE");
  assert.equal(admission.requirements.some((item) => item.field === "pooledEstimate"), false);
  assertPresentFactsHaveProvenance(envelope);
});

test("abstract-only impact statements remain exact-span LIMITED evidence", () => {
  const envelope = extractStudyFactEnvelopeV2(documentInput({
    title: "Aquatic exposure review",
    accessLevel: "abstract_only",
    abstract: "Microplastics bioaccumulated in fish tissues and impacted the circulatory system, posing ecological risks to aquatic organisms.",
  }));
  const admission = admitStudyFactEnvelopeV2(envelope);
  assert.equal(admission.level, "LIMITED");
  assert.ok(envelope.primaryFindings.some((field) => field.evidence[0]?.exactEvidence.includes("impacted")));
  assertPresentFactsHaveProvenance(envelope);
});

test("type-specific admission requires pooled estimate only for meta-analysis", () => {
  const systematic = extractStudyFactEnvelopeV2(documentInput({ title: "Systematic review", sections: [
    { heading: "Abstract", text: "This systematic review aimed to summarize educational interventions and found generally positive results." },
    { heading: "Methods", text: "Four databases were searched with explicit inclusion criteria and narrative synthesis." },
    { heading: "Results", text: "The review found evidence limitations and heterogeneous results across settings." },
  ] }));
  assert.equal(systematic.coreFacts.pooledEstimate.status, "NOT_APPLICABLE");
  assert.equal(admitStudyFactEnvelopeV2(systematic).requirements.some((item) => item.field === "pooledEstimate"), false);

  const meta = extractStudyFactEnvelopeV2(documentInput({ title: "Meta-analysis", sections: [
    { heading: "Abstract", text: "This meta-analysis aimed to estimate the pooled effect and found a positive overall association." },
    { heading: "Methods", text: "A random-effects meta-analysis included 18 studies and evaluated heterogeneity." },
    { heading: "Results", text: "The pooled estimate=0.42 (95% CI 0.20–0.64), I²=55%, across 18 included studies." },
  ] }));
  assert.equal(meta.coreFacts.pooledEstimate.status, "PRESENT");
  assert.equal(meta.coreFacts.heterogeneity.status, "PRESENT");
});

test("contextual-effect parser retains moderator and conditional direction", () => {
  const envelope = extractStudyFactEnvelopeV2(documentInput({ title: "Conditional urban cooling", sections: [
    { heading: "Methods", text: "A cross-sectional observational analysis compared green roofs across urban contexts." },
    { heading: "Results", text: "Green roofs had little overall effect, but the cooling effect was stronger under dry summer conditions and weaker among shaded buildings." },
  ] }));
  const finding = envelope.primaryFindings[0]?.value;
  assert.equal(finding?.direction, "CONTEXT_DEPENDENT");
  assert.match(finding?.conditionOrModerator ?? "", /dry summer conditions|shaded buildings/iu);
});

test("opposite study directions remain mixed in cross-study synthesis", () => {
  const positive = extractStudyFactEnvelopeV2(documentInput({ sourceId: "study-positive", title: "Shared exposure outcome", sections: [
    { heading: "Methods", text: "A cross-sectional survey included 300 students and used regression analysis." },
    { heading: "Results", text: "The exposure increased the outcome score and showed a positive association." },
  ] }));
  const negative = extractStudyFactEnvelopeV2(documentInput({ sourceId: "study-negative", title: "Shared exposure outcome", sections: [
    { heading: "Methods", text: "A cross-sectional survey included 280 students and used regression analysis." },
    { heading: "Results", text: "The exposure decreased the outcome score and showed a negative association." },
  ] }));
  const candidates = buildCrossStudyClaimCandidatesV2([positive, negative]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.direction, "MIXED");
  assert.deepEqual(new Set(candidates[0]?.supportingStudyIds), new Set([positive.studyId]));
  assert.deepEqual(new Set(candidates[0]?.contradictingStudyIds), new Set([negative.studyId]));
});
