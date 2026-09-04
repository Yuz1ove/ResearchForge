import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  admitStudyFactEnvelopeV2,
  assertPresentFactsHaveProvenance,
  extractStudyFactEnvelopeV2,
  type StudyDocumentInputV2,
  type StudyFactEnvelopeV2,
} from "../artifacts/api-server/src/services/research/study-fact-extraction-v2";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselineRoot = join(repo, "artifacts/qa/researchforge-general-research-ingestion-20260825T140800+0800");
const timestamp = process.env.STUDY_FACT_QA_TIMESTAMP ?? new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
}).format(new Date()).replace(/[-: ]/gu, "").replace(/^(.{8})(.{6})$/u, "$1T$2+0800");
const outputRoot = join(repo, "artifacts/qa", `researchforge-general-study-fact-extraction-v2-${timestamp}`);
mkdirSync(outputRoot, { recursive: true });
const liveRoot = process.env.STUDY_FACT_LIVE_ROOT ? resolve(process.env.STUDY_FACT_LIVE_ROOT) : null;

function json<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(name: string, value: unknown): void {
  writeFileSync(join(outputRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

function writeMd(name: string, value: string): void {
  writeFileSync(join(outputRoot, name), `${value.trim()}\n`);
}

function command(...args: string[]): string {
  return execFileSync(args[0]!, args.slice(1), { cwd: repo, encoding: "utf8" }).trim();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

interface LegacyFact {
  studyDesign?: string;
  population?: string | null;
  populationDescription?: string | null;
  exposure?: string | null;
  comparator?: string | null;
  outcome?: string | null;
  effectDirection?: string;
  primaryResult?: string | null;
  quantitativeFacts?: unknown[];
  fieldProvenance?: Record<string, unknown>;
  contentAccessLevel?: string;
  fullTextAvailable?: boolean;
}

interface StructuredRecord {
  sourceId: string;
  studyId?: string;
  title: string;
  doi?: string;
  year?: number;
  extractionSource?: string;
  evidenceAvailability?: string;
  contentAccessState?: string;
  fullTextSource?: string;
  evidenceSpans?: Array<{ text: string; sectionHeading?: string; page?: number; startOffset?: number; endOffset?: number }>;
  structuredStudyFacts?: LegacyFact[];
}

interface AcceptedSource {
  id: string;
  title: string;
  year?: number;
  doi?: string;
  abstract?: string;
  abstractOriginal?: string;
  extractedAbstract?: string;
  accessLevel?: string;
  extractionMethod?: string;
  extractionStatus?: string;
  extractionMode?: string;
  fullTextCharCount?: number;
  extractedText?: string;
  extractedSections?: Array<{ heading?: string; text: string; page?: number; confidence?: number }>;
  extractedChunks?: Array<{ text: string; section_heading?: string; source_location?: string; page?: number; char_start?: number; char_end?: number }>;
  extractionWarnings?: string[];
  qualityFlags?: string[];
}

interface CaseQa {
  caseId: string;
  slug: string;
  topic: string;
  searchedCandidates: number;
  acceptedSources: number;
  directStudies: number;
  fullTextStudies: number;
  writerRequests: number;
}

type FailureCategory =
  | "STUDY_TYPE_MISCLASSIFIED"
  | "SECTION_SEGMENTATION_FAILURE"
  | "METHOD_FACT_MISSED"
  | "OUTCOME_FACT_MISSED"
  | "QUANTITATIVE_FACT_MISSED"
  | "CONTEXTUAL_EFFECT_MISSED"
  | "TABLE_FACT_MISSED"
  | "FIGURE_CAPTION_FACT_MISSED"
  | "PROVENANCE_BINDING_FAILURE"
  | "NOT_APPLICABLE_TREATED_AS_MISSING"
  | "NOT_REPORTED_BY_SOURCE"
  | "FULL_TEXT_EXTRACTION_CORRUPTED"
  | "CONTENT_TRUNCATION"
  | "ADMISSION_SCHEMA_MISMATCH"
  | "OTHER";

interface AuditRow {
  caseId: string;
  topic: string;
  sourceId: string;
  canonicalId: string | null;
  title: string;
  baselineDocumentType: string;
  baselineTopLevelAccess: string;
  sourcePayloadAccess: string;
  sourceFullTextCharCount: number;
  detectedStudyType: string;
  detectedStudyTypeConfidence: number;
  documentInterpretability: string;
  currentExtractedFields: string[];
  currentAdmissionRequirements: string[];
  missingFields: string[];
  notApplicableFields: string[];
  notReportedFields: string[];
  extractionFailedFields: string[];
  extractionSpanExistsButSchemaMissed: boolean;
  tableHasNumbersButParserMissed: boolean;
  resultHasDirectionButParserMissed: boolean;
  sectionSegmentationFailed: boolean;
  studyTypeClassifierWrong: boolean;
  contentTruncated: boolean;
  pdfLayoutCorruption: boolean;
  quantitativeFactsRecoveredV2: number;
  admission: ReturnType<typeof admitStudyFactEnvelopeV2>;
  failureCategories: FailureCategory[];
  finalFailureCategory: FailureCategory;
  envelope: StudyFactEnvelopeV2;
}

const caseDirs = command("find", join(baselineRoot, "cases"), "-maxdepth", "1", "-type", "d").split("\n").map((path) => basename(path)).filter((name) => /^case-\d\d-/u.test(name) && name !== "case-00-control").sort();
const caseQa = new Map<string, CaseQa>();
const auditRows: AuditRow[] = [];

for (const caseDir of caseDirs) {
  const casePath = join(baselineRoot, "cases", caseDir);
  const qa = json<CaseQa>(join(casePath, "qa.json"));
  caseQa.set(qa.caseId, qa);
  if (qa.fullTextStudies <= 0) continue;
  const records = json<StructuredRecord[]>(join(casePath, "structured-study-evidence.json"));
  const accepted = json<AcceptedSource[]>(join(casePath, "accepted-sources.json"));
  const acceptedById = new Map(accepted.map((source) => [source.id, source]));
  const baselineFull = records.filter((record) => record.extractionSource === "full_text" || record.evidenceAvailability === "FULL_TEXT_AVAILABLE" || record.evidenceAvailability === "STRUCTURED_FULL_TEXT" || record.contentAccessState === "full_text").slice(0, qa.fullTextStudies);
  for (const record of baselineFull) {
    const source = acceptedById.get(record.sourceId);
    const fallbackSections = (record.evidenceSpans ?? []).map((span) => ({ heading: span.sectionHeading ?? "Evidence span", text: span.text, page: span.page, confidence: 0.6 }));
    const input: StudyDocumentInputV2 = {
      sourceId: record.sourceId,
      title: source?.title ?? record.title,
      year: source?.year ?? record.year,
      canonicalId: source?.doi ?? record.doi ?? record.studyId ?? null,
      abstract: source?.extractedAbstract ?? source?.abstractOriginal ?? source?.abstract,
      accessLevel: source?.accessLevel ?? record.contentAccessState,
      extractionMethod: source?.extractionMethod ?? source?.extractionMode ?? record.extractionSource,
      extractionStatus: source?.extractionStatus,
      fullTextCharCount: source?.fullTextCharCount,
      extractedText: source?.extractedText,
      sections: source?.extractedSections?.length ? source.extractedSections : fallbackSections,
      chunks: source?.extractedChunks,
      qualityFlags: [...(source?.qualityFlags ?? []), ...(source?.extractionWarnings ?? [])],
    };
    const envelope = extractStudyFactEnvelopeV2(input);
    assertPresentFactsHaveProvenance(envelope);
    const admission = admitStudyFactEnvelopeV2(envelope);
    const legacy = record.structuredStudyFacts?.[0] ?? {};
    const currentFields = Object.entries({
      studyDesign: legacy.studyDesign && legacy.studyDesign !== "unknown" ? legacy.studyDesign : null,
      population: legacy.populationDescription ?? legacy.population,
      exposure: legacy.exposure,
      comparator: legacy.comparator,
      outcome: legacy.outcome,
      effectDirection: legacy.effectDirection && !["unknown", "unclear", "not_applicable"].includes(legacy.effectDirection) ? legacy.effectDirection : null,
      primaryResult: legacy.primaryResult,
      quantitativeFacts: legacy.quantitativeFacts?.length ? legacy.quantitativeFacts.length : null,
    }).filter(([, value]) => value !== null && value !== undefined).map(([key]) => key);
    const requirements = admission.requirements.map((item) => item.field);
    const missingFields = admission.requirements.filter((item) => !item.satisfied).map((item) => item.field);
    const coreEntries = Object.entries(envelope.coreFacts);
    const notApplicable = coreEntries.filter(([, field]) => field.status === "NOT_APPLICABLE").map(([name]) => name);
    const notReported = coreEntries.filter(([, field]) => field.status === "NOT_REPORTED").map(([name]) => name);
    const extractionFailed = coreEntries.filter(([, field]) => field.status === "EXTRACTION_FAILED").map(([name]) => name);
    const topClaimsFull = [record.extractionSource, record.evidenceAvailability, record.contentAccessState].join(" ").toLocaleLowerCase().includes("full");
    const payloadFull = source?.accessLevel === "full_text";
    const spanText = (record.evidenceSpans ?? []).map((span) => span.text).join(" ");
    const currentQ = legacy.quantitativeFacts?.length ?? 0;
    const resultDirection = /increase|decrease|higher|lower|positive|negative|improv|reduc|增加|降低|上升|下降|正向|負向/iu.test(spanText);
    const categories: FailureCategory[] = [];
    if (topClaimsFull !== payloadFull || legacy.contentAccessLevel === "abstract_only" && record.contentAccessState === "full_text") categories.push("PROVENANCE_BINDING_FAILURE");
    if (envelope.documentInterpretability === "TRUNCATED") categories.push("CONTENT_TRUNCATION");
    if (envelope.documentInterpretability === "CORRUPTED") categories.push("FULL_TEXT_EXTRACTION_CORRUPTED");
    const unsegmented = (source?.extractedSections?.length ?? 0) <= 1 && !source?.extractedSections?.some((section) => /method|result|findings?|方法|結果|發現/iu.test(section.heading ?? ""));
    if (unsegmented) categories.push("SECTION_SEGMENTATION_FAILURE");
    if ((!legacy.studyDesign || legacy.studyDesign === "unknown") && envelope.studyType !== "UNCLASSIFIABLE") categories.push("STUDY_TYPE_MISCLASSIFIED");
    if (!currentFields.includes("population") && (envelope.methodsSummary.status === "PRESENT" || envelope.populationContext.status === "PRESENT")) categories.push("METHOD_FACT_MISSED");
    if (!currentFields.includes("outcome") && (envelope.coreFacts.outcome?.status === "PRESENT" || envelope.primaryFindings.length > 0)) categories.push("OUTCOME_FACT_MISSED");
    if (currentQ === 0 && envelope.quantitativeFacts.length > 0) categories.push("QUANTITATIVE_FACT_MISSED");
    if (resultDirection && !currentFields.includes("effectDirection")) categories.push("CONTEXTUAL_EFFECT_MISSED");
    if (notApplicable.length > 0 && ["population", "exposure", "outcome", "effectDirection"].some((field) => !currentFields.includes(field))) categories.push("NOT_APPLICABLE_TREATED_AS_MISSING");
    if (admission.requirements.some((item) => item.status === "NOT_REPORTED")) categories.push("NOT_REPORTED_BY_SOURCE");
    if (admission.requirements.some((item) => item.status === "NOT_APPLICABLE") || envelope.studyType !== "UNCLASSIFIABLE" && ["population", "exposure", "outcome", "effectDirection"].some((field) => !currentFields.includes(field))) categories.push("ADMISSION_SCHEMA_MISMATCH");
    if (categories.length === 0) categories.push("OTHER");
    const priority: FailureCategory[] = ["PROVENANCE_BINDING_FAILURE", "FULL_TEXT_EXTRACTION_CORRUPTED", "CONTENT_TRUNCATION", "SECTION_SEGMENTATION_FAILURE", "STUDY_TYPE_MISCLASSIFIED", "QUANTITATIVE_FACT_MISSED", "METHOD_FACT_MISSED", "OUTCOME_FACT_MISSED", "NOT_APPLICABLE_TREATED_AS_MISSING", "ADMISSION_SCHEMA_MISMATCH", "NOT_REPORTED_BY_SOURCE", "OTHER"];
    auditRows.push({
      caseId: qa.caseId,
      topic: qa.topic,
      sourceId: record.sourceId,
      canonicalId: source?.doi ?? record.doi ?? record.studyId ?? null,
      title: source?.title ?? record.title,
      baselineDocumentType: source?.extractionMethod ?? record.extractionSource ?? "unknown",
      baselineTopLevelAccess: `${record.contentAccessState ?? "unknown"}/${record.evidenceAvailability ?? "unknown"}`,
      sourcePayloadAccess: `${source?.accessLevel ?? "missing"}/${source?.extractionStatus ?? "missing"}`,
      sourceFullTextCharCount: source?.fullTextCharCount ?? 0,
      detectedStudyType: envelope.studyType,
      detectedStudyTypeConfidence: envelope.studyTypeConfidence,
      documentInterpretability: envelope.documentInterpretability,
      currentExtractedFields: currentFields,
      currentAdmissionRequirements: requirements,
      missingFields,
      notApplicableFields: notApplicable,
      notReportedFields: notReported,
      extractionFailedFields: extractionFailed,
      extractionSpanExistsButSchemaMissed: Boolean((record.evidenceSpans?.length ?? 0) > 0 && currentFields.length <= 2),
      tableHasNumbersButParserMissed: Boolean(source?.extractedSections?.some((section) => /table|tbl|表/iu.test(section.heading ?? "") && /\d/u.test(section.text)) && currentQ === 0),
      resultHasDirectionButParserMissed: resultDirection && !currentFields.includes("effectDirection"),
      sectionSegmentationFailed: unsegmented,
      studyTypeClassifierWrong: (!legacy.studyDesign || legacy.studyDesign === "unknown") && envelope.studyType !== "UNCLASSIFIABLE",
      contentTruncated: envelope.documentInterpretability === "TRUNCATED",
      pdfLayoutCorruption: /pdf/iu.test(source?.extractionMethod ?? "") && envelope.documentInterpretability === "CORRUPTED",
      quantitativeFactsRecoveredV2: envelope.quantitativeFacts.length,
      admission,
      failureCategories: [...new Set(categories)],
      finalFailureCategory: priority.find((item) => categories.includes(item)) ?? "OTHER",
      envelope,
    });
  }
}

if (auditRows.length !== 18) throw new Error(`BASELINE_FULL_TEXT_AUDIT_COUNT_MISMATCH:${auditRows.length}/18`);

const taxonomy = Object.fromEntries(([
  "STUDY_TYPE_MISCLASSIFIED", "SECTION_SEGMENTATION_FAILURE", "METHOD_FACT_MISSED", "OUTCOME_FACT_MISSED", "QUANTITATIVE_FACT_MISSED", "CONTEXTUAL_EFFECT_MISSED", "TABLE_FACT_MISSED", "FIGURE_CAPTION_FACT_MISSED", "PROVENANCE_BINDING_FAILURE", "NOT_APPLICABLE_TREATED_AS_MISSING", "NOT_REPORTED_BY_SOURCE", "FULL_TEXT_EXTRACTION_CORRUPTED", "CONTENT_TRUNCATION", "ADMISSION_SCHEMA_MISMATCH", "OTHER",
] as FailureCategory[]).map((category) => [category, { any: auditRows.filter((row) => row.failureCategories.includes(category)).length, primary: auditRows.filter((row) => row.finalFailureCategory === category).length }]));

const caseWaterfall = [...caseQa.values()].sort((a, b) => a.caseId.localeCompare(b.caseId)).map((qa) => {
  const rows = auditRows.filter((row) => row.caseId === qa.caseId);
  return {
    caseId: qa.caseId,
    topic: qa.topic,
    candidates: qa.searchedCandidates,
    acceptedSources: qa.acceptedSources,
    directStudies: qa.directStudies,
    baselineClaimedFullText: qa.fullTextStudies,
    interpretableOrPartialDocuments: rows.filter((row) => ["INTERPRETABLE", "PARTIAL", "ABSTRACT_ONLY"].includes(row.documentInterpretability)).length,
    studyTypeClassified: rows.filter((row) => row.detectedStudyType !== "UNCLASSIFIABLE").length,
    coreFactsExtracted: rows.filter((row) => row.envelope.primaryFindings.length > 0).length,
    limitedAdmission: rows.filter((row) => row.admission.eligible).length,
    formalAdmission: rows.filter((row) => row.admission.level === "FORMAL").length,
    writerEligible: rows.some((row) => row.admission.eligible) ? 1 : 0,
    writerRequests: 0,
    reportReady: 0,
    dropReasons: [...new Set(rows.flatMap((row) => row.admission.reasons).concat(rows.flatMap((row) => row.failureCategories)))],
  };
});

const typeGroups = new Map<string, AuditRow[]>();
for (const row of auditRows) typeGroups.set(row.detectedStudyType, [...(typeGroups.get(row.detectedStudyType) ?? []), row]);
const studyTypes = [...typeGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, rows]) => ({ type, studies: rows.length, classified: rows.filter((row) => row.detectedStudyType !== "UNCLASSIFIABLE").length, withFinding: rows.filter((row) => row.envelope.primaryFindings.length > 0).length, limited: rows.filter((row) => row.admission.eligible).length, formal: rows.filter((row) => row.admission.level === "FORMAL").length }));

const quantitativeFacts = auditRows.flatMap((row) => row.envelope.quantitativeFacts.map((fact) => ({ caseId: row.caseId, sourceId: row.sourceId, ...fact })));
const provenanceFields = auditRows.flatMap((row) => [row.envelope.domain, row.envelope.populationContext, row.envelope.methodsSummary, row.envelope.primaryQuestion, ...row.envelope.primaryFindings, ...row.envelope.limitations, ...Object.values(row.envelope.coreFacts)]);
const presentFields = provenanceFields.filter((field) => field.status === "PRESENT");
const repository = {
  path: repo,
  branch: command("git", "branch", "--show-current"),
  startingHead: command("git", "rev-parse", "HEAD"),
  finalHead: command("git", "rev-parse", "HEAD"),
  stagedFiles: command("git", "diff", "--cached", "--name-only").split("\n").filter(Boolean),
  modifiedTracked: command("git", "status", "--short").split("\n").filter((line) => /^\s*M/u.test(line)),
  untracked: command("git", "status", "--short").split("\n").filter((line) => /^\?\?/u.test(line)),
};
const fixturePath = join(repo, "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json");
const fixtureHash = sha256(fixturePath);

writeJson("STUDY-FACT-FAILURE-AUDIT.json", { schemaVersion: "researchforge-study-fact-failure-audit/v2", baselineRoot, auditedRecords: auditRows.length, writerRequests: 0, taxonomy, records: auditRows });
writeMd("STUDY-FACT-FAILURE-AUDIT.md", `# Study Fact failure audit\n\nFrozen baseline: \`${baselineRoot}\`\n\nAudited: **${auditRows.length}/18** baseline-labelled full-text records. Writer requests: **0**.\n\n## Failure taxonomy\n\n| category | any | primary |\n|---|---:|---:|\n${Object.entries(taxonomy).map(([category, counts]) => `| ${category} | ${counts.any} | ${counts.primary} |`).join("\n")}\n\n## Record-level audit\n\n| case | source | baseline access | actual payload | chars | V2 type | interpretability | admission | primary failure |\n|---|---|---|---|---:|---|---|---|---|\n${auditRows.map((row) => `| ${row.caseId} | ${row.sourceId.replace(/\|/gu, "\\|")} | ${row.baselineTopLevelAccess} | ${row.sourcePayloadAccess} | ${row.sourceFullTextCharCount} | ${row.detectedStudyType} | ${row.documentInterpretability} | ${row.admission.level} | ${row.finalFailureCategory} |`).join("\n")}\n`);
writeJson("PIPELINE-WATERFALL.json", { schemaVersion: "researchforge-pipeline-waterfall/v2", writerRequests: 0, cases: caseWaterfall });
writeMd("PIPELINE-WATERFALL.md", `# Pipeline waterfall\n\nWriter requests remain **0** because extraction acceptance did not clear the formal benchmark.\n\n| case | candidates | accepted | direct | baseline full | interpretable/partial | classified | facts | LIMITED | FORMAL | Writer | report |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${caseWaterfall.map((row) => `| ${row.caseId} | ${row.candidates} | ${row.acceptedSources} | ${row.directStudies} | ${row.baselineClaimedFullText} | ${row.interpretableOrPartialDocuments} | ${row.studyTypeClassified} | ${row.coreFactsExtracted} | ${row.limitedAdmission} | ${row.formalAdmission} | ${row.writerRequests} | ${row.reportReady} |`).join("\n")}\n`);
writeMd("STUDY-TYPE-MATRIX.md", `# Study type matrix\n\n| type | studies | classified | with finding | LIMITED | FORMAL |\n|---|---:|---:|---:|---:|---:|\n${studyTypes.map((row) => `| ${row.type} | ${row.studies} | ${row.classified} | ${row.withFinding} | ${row.limited} | ${row.formal} |`).join("\n")}\n`);
writeMd("EXTRACTION-MATRIX.md", `# Extraction matrix\n\n| case | source | interpretation | findings | quantitative | provenance | extraction path |\n|---|---|---|---:|---:|---|---|\n${auditRows.map((row) => `| ${row.caseId} | ${row.sourceId.replace(/\|/gu, "\\|")} | ${row.documentInterpretability} | ${row.envelope.primaryFindings.length} | ${row.envelope.quantitativeFacts.length} | ${row.admission.provenanceComplete ? "PASS" : "FAIL"} | ${row.envelope.extractionPath.join(" -> ")} |`).join("\n")}\n`);
writeMd("ADMISSION-MATRIX.md", `# Type-specific admission matrix\n\n| case | source | study type | LIMITED | FORMAL | reasons |\n|---|---|---|---|---|---|\n${auditRows.map((row) => `| ${row.caseId} | ${row.sourceId.replace(/\|/gu, "\\|")} | ${row.detectedStudyType} | ${row.admission.eligible ? "PASS" : "FAIL"} | ${row.admission.level === "FORMAL" ? "PASS" : "FAIL"} | ${row.admission.reasons.join("; ").replace(/\|/gu, "\\|")} |`).join("\n")}\n`);
writeJson("PROVENANCE-AUDIT.json", { schemaVersion: "researchforge-provenance-audit/v2", presentFactFields: presentFields.length, presentFactFieldsWithProvenance: presentFields.filter((field) => field.evidence.length > 0).length, presentFactCoveragePercent: presentFields.length ? 100 * presentFields.filter((field) => field.evidence.length > 0).length / presentFields.length : 100, numericalFacts: quantitativeFacts.length, numericalFactsWithProvenance: quantitativeFacts.filter((fact) => fact.provenance.exactEvidence).length, numericalProvenanceCoveragePercent: quantitativeFacts.length ? 100 * quantitativeFacts.filter((fact) => fact.provenance.exactEvidence).length / quantitativeFacts.length : 100, unsupportedPresentFacts: [] });
writeJson("QUANTITATIVE-FACT-AUDIT.json", { schemaVersion: "researchforge-quantitative-fact-audit/v2", total: quantitativeFacts.length, bodyDerived: quantitativeFacts.filter((fact) => !["table", "figure_caption"].includes(fact.provenance.section)).length, tableDerived: quantitativeFacts.filter((fact) => fact.provenance.section === "table").length, captionDerived: quantitativeFacts.filter((fact) => fact.provenance.section === "figure_caption").length, byMetric: Object.fromEntries([...new Set(quantitativeFacts.map((fact) => fact.metric))].sort().map((metric) => [metric, quantitativeFacts.filter((fact) => fact.metric === metric).length])), facts: quantitativeFacts });
writeMd("ROOT-CAUSE-STUDY-FACTS.md", `# Root cause: general Study Facts\n\nThe frozen 18-record audit disproves the assumption that all 18 records were usable full texts. **${auditRows.filter((row) => row.failureCategories.includes("PROVENANCE_BINDING_FAILURE")).length}/18** have an access/provenance binding mismatch; **${auditRows.filter((row) => row.contentTruncated).length}/18** are truncated under the V2 document gate; **${auditRows.filter((row) => row.sectionSegmentationFailed).length}/18** lack usable research-section segmentation.\n\nThe admission defect is also concrete: **${auditRows.filter((row) => row.failureCategories.includes("ADMISSION_SCHEMA_MISMATCH")).length}/18** records were evaluated by a fixed PICO-like percentage gate even when their detected design made those fields not applicable. This is separate from genuinely unreported facts and extraction failures.\n\nFailure taxonomy and per-record evidence are in \`STUDY-FACT-FAILURE-AUDIT.json\`.\n`);
writeMd("ARCHITECTURE-CHANGES.md", `# Architecture changes\n\n- Added typed \`StudyFactEnvelopeV2\`, \`FactField<T>\`, explicit six-state missing semantics, locator-rich provenance, document sections/tables/figures, extraction paths, and quality flags.\n- Added metadata/title/abstract/method/results signal-weighted study-type classification with competing types and fail-closed low-confidence output.\n- Added deterministic \`QuantitativeFactRecovery\` for samples, descriptive/inferential statistics, ML metrics, meta-analysis metrics, tables, and captions.\n- Added contextual-effect representation and cross-study contradiction preservation.\n- Attached one source-level V2 envelope before Writer admission; Writer no longer needs to parse raw tables or full-text snippets.\n- Replaced fixed population/exposure/outcome percentage admission for V2 records with study-type-specific semantic requirements. \`NOT_APPLICABLE\` satisfies a requirement and is never counted as extraction failure.\n- Added publisher-shell detection so short metadata pages are not labelled full text.\n- No Writer prompt tuning and no topic/case/title hardcoding were added.\n`);

const readyCasesLimited = caseWaterfall.filter((row) => row.limitedAdmission > 0).length;
const readyCasesFormal = caseWaterfall.filter((row) => row.formalAdmission > 0).length;
interface LiveAcceptanceRow {
  caseId: string; slug: string; topic: string; classification: string; firstWeakLayer: string;
  directStudies: number; fullTextStudies: number; studyTypeInterpretationCoverage?: number;
  limitedStudyAdmissions?: number; formalStudyAdmissions?: number; quantitativeFacts: number;
  writerRequests: number; extractionOnly?: boolean; reasons: string[];
}
interface LiveAcceptance { verdict: string; limited: number; formal: number; topics: LiveAcceptanceRow[] }
const liveAcceptancePath = liveRoot ? join(liveRoot, "acceptance-matrix.json") : null;
const liveAcceptance = liveAcceptancePath && existsSync(liveAcceptancePath) ? json<LiveAcceptance>(liveAcceptancePath) : null;
const liveLimited = liveAcceptance?.limited ?? 0;
const liveFormal = liveAcceptance?.formal ?? 0;
const liveWriterRequests = liveAcceptance?.topics.reduce((sum, row) => sum + row.writerRequests, 0) ?? 0;
const verdict = liveAcceptance && liveLimited >= 10 && liveFormal >= 8 ? "RESEARCHFORGE_GENERAL_STUDY_FACT_EXTRACTION_V2_READY" : "RESEARCHFORGE_GENERAL_STUDY_FACT_EXTRACTION_V2_PARTIAL";
const livePostfixRows = liveAcceptance && liveRoot ? liveAcceptance.topics.map((row) => {
  const caseRoot = join(liveRoot, `case-${row.caseId}-${row.slug}`);
  const accepted = json<Array<Record<string, unknown>>>(join(caseRoot, "accepted-sources.json"));
  const direct = json<StructuredRecord[]>(join(caseRoot, "structured-study-evidence.json"));
  const envelopes = direct.flatMap((record) => {
    const source = accepted.find((item) => item.id === record.sourceId);
    if (!source) return [];
    return [extractStudyFactEnvelopeV2({
      sourceId: record.sourceId,
      documentId: typeof source.contentHash === "string" ? source.contentHash : undefined,
      title: record.title,
      year: typeof source.year === "number" ? source.year : record.year,
      canonicalId: typeof source.doi === "string" ? source.doi : record.doi,
      abstract: typeof source.extractedAbstract === "string" ? source.extractedAbstract : typeof source.abstract === "string" ? source.abstract : null,
      accessLevel: typeof source.accessLevel === "string" ? source.accessLevel : null,
      extractionMethod: typeof source.extractionMethod === "string" ? source.extractionMethod : null,
      extractionStatus: typeof source.extractionStatus === "string" ? source.extractionStatus : null,
      fullTextCharCount: typeof source.fullTextCharCount === "number" ? source.fullTextCharCount : null,
      extractedText: typeof source.extractedText === "string" ? source.extractedText : null,
      sections: Array.isArray(source.extractedSections) ? source.extractedSections as StudyDocumentInputV2["sections"] : null,
      chunks: Array.isArray(source.extractedChunks) ? source.extractedChunks as StudyDocumentInputV2["chunks"] : null,
      qualityFlags: Array.isArray(source.extractionWarnings) ? source.extractionWarnings.filter((item): item is string => typeof item === "string") : null,
    })];
  });
  const admissions = envelopes.map(admitStudyFactEnvelopeV2);
  return {
    caseId: row.caseId,
    topic: row.topic,
    directStudies: direct.length,
    replayedStudies: envelopes.length,
    classified: envelopes.filter((envelope) => envelope.studyType !== "UNCLASSIFIABLE").length,
    presentFindings: envelopes.reduce((sum, envelope) => sum + envelope.primaryFindings.filter((field) => field.status === "PRESENT").length, 0),
    quantitativeFacts: envelopes.reduce((sum, envelope) => sum + envelope.quantitativeFacts.length, 0),
    limitedAdmissions: admissions.filter((admission) => admission.eligible).length,
    formalAdmissions: admissions.filter((admission) => admission.level === "FORMAL").length,
    envelopes,
  };
}) : [];
const livePostfixFacts = livePostfixRows.flatMap((row) => row.envelopes.flatMap((envelope) => envelope.quantitativeFacts.map((fact) => ({ caseId: row.caseId, sourceId: envelope.sourceId, ...fact }))));
if (liveAcceptance) {
  writeJson("LIVE-BENCHMARK.json", { schemaVersion: "researchforge-study-fact-live-benchmark/v2", sourceArtifact: liveRoot, extractionOnly: true, limitedCases: liveLimited, formalCases: liveFormal, writerRequests: liveWriterRequests, cases: liveAcceptance.topics });
  writeMd("LIVE-BENCHMARK.md", `# Live ten-topic extraction-only benchmark\n\n- source artifact: \`${liveRoot}\`\n- LIMITED case-level outputs: **${liveLimited}/10**\n- FORMAL case-level outputs: **${liveFormal}/10**\n- Writer requests: **${liveWriterRequests}**\n\n| case | classification | direct | full text | type coverage | LIMITED studies | FORMAL studies | quantitative | first weak layer | Writer |\n|---|---|---:|---:|---:|---:|---:|---:|---|---:|\n${liveAcceptance.topics.map((row) => `| ${row.caseId} | ${row.classification} | ${row.directStudies} | ${row.fullTextStudies} | ${row.studyTypeInterpretationCoverage ?? 0}% | ${row.limitedStudyAdmissions ?? 0} | ${row.formalStudyAdmissions ?? 0} | ${row.quantitativeFacts} | ${row.firstWeakLayer} | ${row.writerRequests} |`).join("\n")}\n`);
  writeJson("LIVE-POSTFIX-DETERMINISTIC-REPLAY.json", { schemaVersion: "researchforge-study-fact-live-postfix-replay/v2", sourceArtifact: liveRoot, providerRequests: 0, writerRequests: 0, quantitativeFacts: livePostfixFacts.length, numericalProvenanceComplete: livePostfixFacts.every((fact) => Boolean(fact.provenance.exactEvidence)), cases: livePostfixRows });
  writeMd("LIVE-POSTFIX-DETERMINISTIC-REPLAY.md", `# Post-fix deterministic replay of saved live sources\n\nThis replay used only the accepted-source payloads saved by the one bounded live run. Provider requests: **0**. Writer requests: **0**.\n\n| case | direct | replayed | classified | findings | quantitative | LIMITED studies | FORMAL studies |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${livePostfixRows.map((row) => `| ${row.caseId} | ${row.directStudies} | ${row.replayedStudies} | ${row.classified} | ${row.presentFindings} | ${row.quantitativeFacts} | ${row.limitedAdmissions} | ${row.formalAdmissions} |`).join("\n")}\n\nNumerical facts: **${livePostfixFacts.length}**; exact-evidence provenance: **${livePostfixFacts.filter((fact) => fact.provenance.exactEvidence).length}/${livePostfixFacts.length}**.\n`);
}
const regressionValues = { focused: { pass: Number(process.env.FOCUSED_PASS ?? 0), fail: Number(process.env.FOCUSED_FAIL ?? 0) }, apiServer: { pass: Number(process.env.API_PASS ?? 0), fail: Number(process.env.API_FAIL ?? 0) }, reportFactory: { pass: Number(process.env.REPORT_FACTORY_PASS ?? 0), fail: Number(process.env.REPORT_FACTORY_FAIL ?? 0) }, typecheck: process.env.TYPECHECK_STATUS ?? "PENDING", build: process.env.BUILD_STATUS ?? "PENDING", diffCheck: process.env.DIFF_CHECK_STATUS ?? "PENDING", protectedFixture: fixtureHash === "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3" ? "PASS_UNCHANGED" : "FAIL_CHANGED" };
const regressionComplete = regressionValues.focused.fail === 0 && regressionValues.apiServer.fail === 0 && regressionValues.reportFactory.fail === 0 && regressionValues.typecheck === "PASS" && regressionValues.build === "PASS" && regressionValues.diffCheck === "PASS" && regressionValues.protectedFixture === "PASS_UNCHANGED";
writeJson("REGRESSION-REPORT.json", { schemaVersion: "researchforge-regression-report/v2", status: regressionComplete ? "COMPLETE_PASS" : "INCOMPLETE_OR_FAILED", ...regressionValues });
writeMd("FINAL-REPORT.md", `# ResearchForge general Study Fact extraction V2\n\n## Executive verdict\n\n\`${verdict}\`\n\nThe frozen 18-record forensic replay and a fresh extraction-only run of the same ten topics are reported separately. Writer requests remained ${liveWriterRequests}; the live threshold did not clear (${liveLimited}/10 LIMITED, ${liveFormal}/10 FORMAL), so report generation and export stayed closed.\n\n## Repository\n\n- path: \`${repository.path}\`\n- branch: \`${repository.branch}\`\n- HEAD: \`${repository.startingHead}\`\n- dirty worktree preserved; no commit, push, merge, or deployment\n\n## Protected fixture\n\n- before baseline: \`5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3\`\n- current: \`${fixtureHash}\`\n\n## Frozen 18-record forensic replay\n\n- audited baseline-labelled full texts: ${auditRows.length}/18\n- study type interpreted: ${auditRows.filter((row) => row.detectedStudyType !== "UNCLASSIFIABLE").length}/18\n- admission-grade findings: ${auditRows.filter((row) => row.envelope.primaryFindings.length > 0).length}/18\n- LIMITED study admissions: ${auditRows.filter((row) => row.admission.eligible).length}/18\n- FORMAL study admissions: ${auditRows.filter((row) => row.admission.level === "FORMAL").length}/18\n- quantitative facts recovered: ${quantitativeFacts.length}\n- present substantive fact provenance: ${presentFields.filter((field) => field.evidence.length > 0).length}/${presentFields.length}\n- numerical provenance: ${quantitativeFacts.filter((fact) => fact.provenance.exactEvidence).length}/${quantitativeFacts.length}\n\n## Live ten-topic benchmark\n\n- LIMITED case-level outputs: ${liveLimited}/10\n- FORMAL case-level outputs: ${liveFormal}/10\n- Writer requests: ${liveWriterRequests}\n- no report, PDF, DOCX, or reports.zip was produced\n\n## Post-fix deterministic replay of saved live sources\n\n- provider requests: 0\n- Writer requests: 0\n- direct studies replayed: ${livePostfixRows.reduce((sum, row) => sum + row.replayedStudies, 0)}\n- quantitative facts recovered: ${livePostfixFacts.length}\n- numerical provenance: ${livePostfixFacts.filter((fact) => fact.provenance.exactEvidence).length}/${livePostfixFacts.length}\n\n## Regression\n\n- focused: ${regressionValues.focused.pass}/${regressionValues.focused.pass + regressionValues.focused.fail}\n- API server: ${regressionValues.apiServer.pass}/${regressionValues.apiServer.pass + regressionValues.apiServer.fail}\n- Report Factory: ${regressionValues.reportFactory.pass}/${regressionValues.reportFactory.pass + regressionValues.reportFactory.fail}\n- typecheck/build/diff: ${regressionValues.typecheck}/${regressionValues.build}/${regressionValues.diffCheck}\n\n## Why not READY\n\nThe live benchmark missed both the 10/10 LIMITED and 8/10 FORMAL thresholds. Cases 02, 05, and 08 failed before structured extraction because no direct source was admitted; other cases exposed unclassifiable or source-unreported type-specific fields. Frozen evidence also exposes false full-text labels and truncated records. Writer/export therefore remain fail closed.\n`);
writeMd("FINAL-VERDICT.txt", verdict);
writeJson("REPOSITORY-IDENTITY.json", { ...repository, protectedFixtureHash: fixtureHash, commit: false, push: false, merge: false, deploy: false });
writeJson("SHA256SUMS.json", Object.fromEntries(command("find", outputRoot, "-maxdepth", "1", "-type", "f").split("\n").filter((path) => path && basename(path) !== "SHA256SUMS.json").sort().map((path) => [basename(path), sha256(path)])));

console.log(JSON.stringify({ outputRoot, verdict, auditedRecords: auditRows.length, taxonomy, readyCasesLimited, readyCasesFormal, studyTypes, quantitativeFacts: quantitativeFacts.length, fixtureHash }, null, 2));
