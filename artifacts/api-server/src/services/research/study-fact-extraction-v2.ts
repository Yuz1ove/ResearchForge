import { createHash } from "node:crypto";

export const STUDY_FACT_EXTRACTION_VERSION = "researchforge-study-fact-v2.0.0";

export type FactStatus =
  | "PRESENT"
  | "NOT_APPLICABLE"
  | "NOT_REPORTED"
  | "UNKNOWN"
  | "EXTRACTION_FAILED"
  | "AMBIGUOUS"
  | "CONFLICTING";

export type StudyTypeV2 =
  | "RANDOMIZED_EXPERIMENT"
  | "NON_RANDOMIZED_EXPERIMENT"
  | "OBSERVATIONAL_CROSS_SECTIONAL"
  | "COHORT_LONGITUDINAL"
  | "CASE_CONTROL"
  | "QUALITATIVE"
  | "SYSTEMATIC_REVIEW"
  | "META_ANALYSIS"
  | "TECHNICAL_COMPUTATIONAL"
  | "DATASET_CORPUS_RESOURCE"
  | "CASE_STUDY"
  | "DESCRIPTIVE_REPORT"
  | "OTHER_EMPIRICAL"
  | "UNCLASSIFIABLE";

export type CanonicalSectionType =
  | "title"
  | "abstract"
  | "introduction"
  | "methods"
  | "participants"
  | "materials"
  | "measures"
  | "statistical_analysis"
  | "results"
  | "discussion"
  | "limitations"
  | "conclusion"
  | "references"
  | "table"
  | "figure_caption"
  | "other";

export interface EvidenceLocatorV2 {
  sourceId: string;
  documentId: string;
  section: CanonicalSectionType;
  subsection?: string;
  page?: number;
  paragraph?: number;
  spanStart?: number;
  spanEnd?: number;
  table?: string;
  tableRow?: string;
  tableColumn?: string;
  figure?: string;
  caption?: string;
  exactEvidence: string;
  normalizedEvidence: string;
  extractionMethod:
    | "structured_xml"
    | "semantic_html"
    | "pdf_native"
    | "pdf_layout"
    | "targeted_ocr"
    | "deterministic_pattern"
    | "table_parser"
    | "caption_parser"
    | "llm_semantic_role";
  confidence: number;
  parserVersion: string;
}

export interface FactField<T> {
  status: FactStatus;
  value: T | null;
  normalizedValue: T | string | number | null;
  confidence: number;
  evidence: EvidenceLocatorV2[];
  extractionMethod: EvidenceLocatorV2["extractionMethod"] | "none";
  reason?: string;
}

export interface DocumentSectionV2 {
  id: string;
  heading: string;
  canonicalType: CanonicalSectionType;
  text: string;
  page?: number;
  confidence: number;
  sourceLocation?: string;
}

export interface DocumentTableV2 {
  id: string;
  title: string;
  caption?: string;
  columns: string[];
  rows: Array<{ label?: string; cells: string[] }>;
  rawText: string;
  page?: number;
  sourceSectionId?: string;
}

export interface DocumentFigureV2 {
  id: string;
  caption: string;
  rawText: string;
  page?: number;
  sourceSectionId?: string;
}

export interface ResearchDocumentV2 {
  documentId: string;
  sourceId: string;
  title: string;
  abstract?: string;
  sections: DocumentSectionV2[];
  tables: DocumentTableV2[];
  figures: DocumentFigureV2[];
  extractionPath: string[];
  fullTextInterpretability:
    | "INTERPRETABLE"
    | "PARTIAL"
    | "ABSTRACT_ONLY"
    | "CORRUPTED"
    | "TRUNCATED"
    | "UNAVAILABLE";
  interpretabilityReasons: string[];
  charCount: number;
  qualityFlags: string[];
}

export interface StudyTypeClassificationV2 {
  type: StudyTypeV2;
  confidence: number;
  evidence: EvidenceLocatorV2[];
  competingTypes: Array<{ type: StudyTypeV2; score: number }>;
  reason?: string;
}

export type QuantitativeMetricV2 =
  | "sample_size"
  | "included_studies"
  | "mean"
  | "median"
  | "percentage"
  | "rate"
  | "standard_deviation"
  | "standard_error"
  | "interquartile_range"
  | "p_value"
  | "confidence_interval"
  | "beta"
  | "standardized_beta"
  | "odds_ratio"
  | "risk_ratio"
  | "hazard_ratio"
  | "correlation"
  | "cohens_d"
  | "hedges_g"
  | "accuracy"
  | "f1"
  | "precision"
  | "recall"
  | "auc"
  | "rmse"
  | "mae"
  | "bleu"
  | "rouge"
  | "pooled_estimate"
  | "i_squared"
  | "tau_squared"
  | "q_statistic"
  | "other";

export interface QuantitativeFactV2 {
  factId: string;
  metric: QuantitativeMetricV2;
  value: number | null;
  rawValue: string;
  unit: string | null;
  direction: "POSITIVE" | "NEGATIVE" | "NULL" | "MIXED" | "NOT_APPLICABLE" | "UNCLEAR";
  groupOrCondition: string | null;
  outcome: string | null;
  timepoint: string | null;
  comparison: string | null;
  uncertainty: { ciLower?: number; ciUpper?: number; sd?: number; se?: number; pValue?: string } | null;
  provenance: EvidenceLocatorV2;
}

export interface NormalizedFindingV2 {
  findingId: string;
  topic: string;
  claimType: "EFFECT" | "ASSOCIATION" | "THEME" | "PERFORMANCE" | "RESOURCE" | "OBSERVATION" | "CONCLUSION";
  direction: "SUPPORT" | "CONTRADICT" | "MIXED" | "NULL" | "CONTEXT_DEPENDENT" | "UNCLEAR";
  magnitude: string | null;
  populationOrContext: string | null;
  conditionOrModerator: string | null;
  text: string;
  evidence: EvidenceLocatorV2[];
  quantitativeFactIds: string[];
  confidence: number;
  boundaries: string[];
}

export interface StudyFactEnvelopeV2 {
  studyId: string;
  sourceId: string;
  canonicalId: string | null;
  title: string;
  year: number | null;
  studyType: StudyTypeV2;
  studyTypeConfidence: number;
  competingStudyTypes: Array<{ type: StudyTypeV2; score: number }>;
  domain: FactField<string>;
  populationContext: FactField<string>;
  methodsSummary: FactField<string>;
  primaryQuestion: FactField<string>;
  primaryFindings: Array<FactField<NormalizedFindingV2>>;
  limitations: Array<FactField<string>>;
  quantitativeFacts: QuantitativeFactV2[];
  qualitativeFacts: Array<FactField<string>>;
  coreFacts: Record<string, FactField<unknown>>;
  provenance: EvidenceLocatorV2[];
  qualityFlags: string[];
  extractionVersion: string;
  documentInterpretability: ResearchDocumentV2["fullTextInterpretability"];
  extractionPath: string[];
}

export interface StudyAdmissionV2 {
  level: "FORMAL" | "LIMITED" | "BLOCKED";
  eligible: boolean;
  requirements: Array<{ field: string; satisfied: boolean; status: FactStatus; reason: string }>;
  reasons: string[];
  provenanceComplete: boolean;
  numericalProvenanceComplete: boolean;
  criticalContradiction: boolean;
}

export interface StudyDocumentInputV2 {
  sourceId: string;
  documentId?: string;
  title: string;
  year?: number | null;
  canonicalId?: string | null;
  abstract?: string | null;
  accessLevel?: string | null;
  extractionMethod?: string | null;
  extractionStatus?: string | null;
  fullTextCharCount?: number | null;
  extractedText?: string | null;
  sections?: Array<{ heading?: string; text: string; page?: number; confidence?: number }> | null;
  chunks?: Array<{ text: string; section_heading?: string; source_location?: string; page?: number; char_start?: number; char_end?: number }> | null;
  tables?: Array<{ title?: string; caption?: string; columns?: string[]; rows?: Array<{ label?: string; cells: string[] }>; rawText?: string; page?: number }> | null;
  figures?: Array<{ caption: string; rawText?: string; page?: number }> | null;
  qualityFlags?: string[] | null;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function canonicalSection(heading: string, text = ""): CanonicalSectionType {
  const headingValue = clean(heading).toLocaleLowerCase();
  if (/^(?:table|tbl\.?|表)\s*\d*/iu.test(headingValue)) return "table";
  if (/^(?:figure|fig\.?|圖)\s*\d*/iu.test(headingValue)) return "figure_caption";
  if (/\babstract\b|摘要|概要/u.test(headingValue)) return "abstract";
  if (/\b(?:introduction|background)\b|前言|背景/u.test(headingValue)) return "introduction";
  if (/statistical analysis|data analysis|統計分析|資料分析/u.test(headingValue)) return "statistical_analysis";
  if (/participants?|sample|subjects?|cohort|受試|參與者|樣本/u.test(headingValue)) return "participants";
  if (/materials?|dataset|corpus|語料|資料集|材料/u.test(headingValue)) return "materials";
  if (/measures?|instrument|測量|量表|指標/u.test(headingValue)) return "measures";
  if (/methods?|methodology|procedure|方法|研究設計/u.test(headingValue)) return "methods";
  if (/results?|findings?|結果|發現/u.test(headingValue)) return "results";
  if (/limitations?|study boundary|限制|侷限/u.test(headingValue)) return "limitations";
  if (/discussion|討論/u.test(headingValue)) return "discussion";
  if (/conclusion|結論/u.test(headingValue)) return "conclusion";
  if (/references?|bibliography|參考文獻/u.test(headingValue)) return "references";
  const value = `${heading} ${text.slice(0, 120)}`.toLocaleLowerCase();
  if (/\babstract\b|摘要|概要/u.test(value)) return "abstract";
  if (/\b(?:introduction|background)\b|前言|背景/u.test(value)) return "introduction";
  if (/participant|sample|subject|cohort|受試|參與者|樣本/u.test(value)) return "participants";
  if (/statistical analysis|data analysis|統計分析|資料分析/u.test(value)) return "statistical_analysis";
  if (/materials?|dataset|corpus|語料|資料集|材料/u.test(value)) return "materials";
  if (/measures?|instrument|測量|量表|指標/u.test(value)) return "measures";
  if (/method|methodology|procedure|方法|研究設計/u.test(value)) return "methods";
  if (/results?|findings?|結果|發現/u.test(value)) return "results";
  if (/limitations?|study boundary|限制|侷限/u.test(value)) return "limitations";
  if (/discussion|討論/u.test(value)) return "discussion";
  if (/conclusion|結論/u.test(value)) return "conclusion";
  if (/references?|bibliography|參考文獻/u.test(value)) return "references";
  if (/^(?:table|tbl\.?|表)\s*\d*/iu.test(clean(heading))) return "table";
  if (/^(?:figure|fig\.?|圖)\s*\d*/iu.test(clean(heading))) return "figure_caption";
  return "other";
}

function methodForInput(method: string): EvidenceLocatorV2["extractionMethod"] {
  if (/jats|xml|tei/iu.test(method)) return "structured_xml";
  if (/html/iu.test(method)) return "semantic_html";
  if (/ocr/iu.test(method)) return "targeted_ocr";
  if (/layout/iu.test(method)) return "pdf_layout";
  return "pdf_native";
}

function locator(input: {
  sourceId: string;
  documentId: string;
  section: CanonicalSectionType;
  heading?: string;
  text: string;
  page?: number;
  paragraph?: number;
  start?: number;
  end?: number;
  table?: string;
  row?: string;
  column?: string;
  figure?: string;
  method?: EvidenceLocatorV2["extractionMethod"];
  confidence?: number;
}): EvidenceLocatorV2 {
  return {
    sourceId: input.sourceId,
    documentId: input.documentId,
    section: input.section,
    ...(clean(input.heading) ? { subsection: clean(input.heading) } : {}),
    ...(typeof input.page === "number" ? { page: input.page } : {}),
    ...(typeof input.paragraph === "number" ? { paragraph: input.paragraph } : {}),
    ...(typeof input.start === "number" ? { spanStart: input.start } : {}),
    ...(typeof input.end === "number" ? { spanEnd: input.end } : {}),
    ...(input.table ? { table: input.table } : {}),
    ...(input.row ? { tableRow: input.row } : {}),
    ...(input.column ? { tableColumn: input.column } : {}),
    ...(input.figure ? { figure: input.figure, caption: input.text } : {}),
    exactEvidence: clean(input.text),
    normalizedEvidence: clean(input.text).toLocaleLowerCase(),
    extractionMethod: input.method ?? "deterministic_pattern",
    confidence: input.confidence ?? 0.78,
    parserVersion: STUDY_FACT_EXTRACTION_VERSION,
  };
}

function present<T>(value: T, evidence: EvidenceLocatorV2[], confidence = 0.78): FactField<T> {
  if (evidence.length === 0) throw new Error("PRESENT_FACT_REQUIRES_PROVENANCE");
  return { status: "PRESENT", value, normalizedValue: value, confidence, evidence, extractionMethod: evidence[0]!.extractionMethod };
}

function missing<T>(status: Exclude<FactStatus, "PRESENT">, reason: string): FactField<T> {
  return { status, value: null, normalizedValue: null, confidence: status === "NOT_APPLICABLE" ? 1 : 0, evidence: [], extractionMethod: "none", reason };
}

function sentences(text: string): string[] {
  return clean(text).split(/(?<=[。！？.!?；;])\s+/u).map(clean).filter((item) => item.length >= 20);
}

function looksTruncated(text: string): boolean {
  const normalized = clean(text);
  return normalized.length > 0 && normalized.length < 700 && !/abstract|摘要/iu.test(normalized.slice(0, 100));
}

function looksCorrupted(text: string): boolean {
  if (!text) return false;
  const replacement = (text.match(/�/gu) ?? []).length;
  const wordLike = (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
  return replacement > 5 || wordLike / Math.max(1, text.length) < 0.35;
}

function inferInterpretability(input: StudyDocumentInputV2, sections: DocumentSectionV2[]): Pick<ResearchDocumentV2, "fullTextInterpretability" | "interpretabilityReasons"> {
  const text = clean(input.extractedText) || sections.map((section) => section.text).join(" ");
  const charCount = Number(input.fullTextCharCount) || text.length;
  if (looksCorrupted(text)) return { fullTextInterpretability: "CORRUPTED", interpretabilityReasons: ["extracted_text_layout_or_character_corruption"] };
  if (/failed|unavailable/iu.test(clean(input.extractionStatus))) return { fullTextInterpretability: "UNAVAILABLE", interpretabilityReasons: [clean(input.extractionStatus) || "extraction_unavailable"] };
  if (/abstract/iu.test(clean(input.accessLevel)) || (!text && clean(input.abstract))) return { fullTextInterpretability: "ABSTRACT_ONLY", interpretabilityReasons: ["only_abstract_content_available"] };
  const sectionTypes = new Set(sections.map((section) => section.canonicalType));
  const hasMethods = [...sectionTypes].some((type) => ["methods", "participants", "materials", "measures", "statistical_analysis"].includes(type));
  const hasResults = sectionTypes.has("results");
  if (charCount >= 2500 && hasMethods && hasResults) return { fullTextInterpretability: "INTERPRETABLE", interpretabilityReasons: [] };
  if (charCount >= 1200 && (hasMethods || hasResults)) return { fullTextInterpretability: "PARTIAL", interpretabilityReasons: ["missing_methods_or_results_section"] };
  if (looksTruncated(text) || (charCount > 0 && charCount < 700)) return { fullTextInterpretability: "TRUNCATED", interpretabilityReasons: [`insufficient_full_text_chars:${charCount}`] };
  return { fullTextInterpretability: "PARTIAL", interpretabilityReasons: ["section_structure_incomplete"] };
}

function parseDelimitedTable(raw: string): { columns: string[]; rows: Array<{ label?: string; cells: string[] }> } {
  const lines = raw.split(/\n+/u).map(clean).filter(Boolean);
  const split = (line: string) => line.split(/\s*\|\s*|\t+/u).map(clean).filter(Boolean);
  if (lines.length < 2 || split(lines[0]!).length < 2) return { columns: [], rows: [] };
  const columns = split(lines[0]!);
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    return { ...(cells[0] ? { label: cells[0] } : {}), cells };
  }).filter((row) => row.cells.length > 1);
  return { columns, rows };
}

export function buildResearchDocumentV2(input: StudyDocumentInputV2): ResearchDocumentV2 {
  const documentId = clean(input.documentId) || `${input.sourceId}:${hash(`${input.title}|${input.canonicalId ?? ""}`)}`;
  const sectionInputs = (input.sections?.length ? input.sections : input.chunks?.map((chunk) => ({ heading: chunk.section_heading ?? chunk.source_location ?? "", text: chunk.text, page: chunk.page, confidence: 0.62 }))) ?? [];
  const sections = sectionInputs.map((section, index): DocumentSectionV2 => ({
    id: `${documentId}:section:${index + 1}`,
    heading: clean(section.heading) || "Unlabelled section",
    canonicalType: canonicalSection(clean(section.heading), section.text),
    text: clean(section.text),
    ...(typeof section.page === "number" ? { page: section.page } : {}),
    confidence: section.confidence ?? (clean(section.heading) ? 0.78 : 0.45),
    sourceLocation: clean(section.heading) || undefined,
  })).filter((section) => section.text);
  if (sections.length === 0 && clean(input.abstract)) {
    sections.push({ id: `${documentId}:abstract`, heading: "Abstract", canonicalType: "abstract", text: clean(input.abstract), confidence: 1, sourceLocation: "abstract" });
  }
  const tables: DocumentTableV2[] = (input.tables ?? []).map((table, index) => {
    const rawText = clean(table.rawText) || [table.title, table.caption, ...(table.columns ?? []), ...(table.rows ?? []).flatMap((row) => row.cells)].map(clean).filter(Boolean).join(" | ");
    const parsed = parseDelimitedTable(rawText);
    return {
      id: `${documentId}:table:${index + 1}`,
      title: clean(table.title) || `Table ${index + 1}`,
      ...(clean(table.caption) ? { caption: clean(table.caption) } : {}),
      columns: table.columns?.map(clean).filter(Boolean) ?? parsed.columns,
      rows: table.rows ?? parsed.rows,
      rawText,
      ...(typeof table.page === "number" ? { page: table.page } : {}),
    };
  });
  for (const section of sections.filter((item) => item.canonicalType === "table")) {
    const parsed = parseDelimitedTable(section.text);
    tables.push({ id: `${documentId}:table:${tables.length + 1}`, title: section.heading, columns: parsed.columns, rows: parsed.rows, rawText: section.text, page: section.page, sourceSectionId: section.id });
  }
  const figures: DocumentFigureV2[] = (input.figures ?? []).map((figure, index) => ({ id: `${documentId}:figure:${index + 1}`, caption: clean(figure.caption), rawText: clean(figure.rawText) || clean(figure.caption), ...(typeof figure.page === "number" ? { page: figure.page } : {}) }));
  for (const section of sections.filter((item) => item.canonicalType === "figure_caption")) {
    figures.push({ id: `${documentId}:figure:${figures.length + 1}`, caption: section.heading, rawText: section.text, page: section.page, sourceSectionId: section.id });
  }
  const interpretation = inferInterpretability(input, sections);
  const method = clean(input.extractionMethod);
  const extractionPath = /xml|jats|tei/iu.test(method) ? ["STRUCTURED_XML"] : /html/iu.test(method) ? ["HTML_SEMANTIC"] : /ocr/iu.test(method) ? ["PDF_NATIVE", "TARGETED_OCR"] : /layout/iu.test(method) ? ["PDF_NATIVE", "LAYOUT_RECOVERY"] : /pdf/iu.test(method) ? ["PDF_NATIVE"] : [method ? method.toLocaleUpperCase() : "UNKNOWN"];
  const text = clean(input.extractedText) || sections.map((section) => section.text).join("\n\n");
  return {
    documentId,
    sourceId: input.sourceId,
    title: clean(input.title),
    ...(clean(input.abstract) ? { abstract: clean(input.abstract) } : {}),
    sections,
    tables,
    figures,
    extractionPath,
    ...interpretation,
    charCount: Number(input.fullTextCharCount) || text.length,
    qualityFlags: unique([...(input.qualityFlags ?? []), ...interpretation.interpretabilityReasons]),
  };
}

interface TypeRule { type: StudyTypeV2; patterns: RegExp[]; sectionBoost?: CanonicalSectionType[] }

const TYPE_RULES: TypeRule[] = [
  { type: "META_ANALYSIS", patterns: [/meta[- ]analysis|統合分析|pooled estimate|heterogeneity|I\s*[²2]/iu] },
  { type: "SYSTEMATIC_REVIEW", patterns: [/systematic review|系統性回顧|PRISMA|databases? (?:were )?searched|inclusion criteria/iu] },
  { type: "RANDOMIZED_EXPERIMENT", patterns: [/randomi[sz]ed(?: controlled)? trial|\bRCT\b|隨機(?:分派|對照)/iu], sectionBoost: ["methods"] },
  { type: "NON_RANDOMIZED_EXPERIMENT", patterns: [/quasi[- ]experiment|non[- ]randomi[sz]ed|準實驗|difference[- ]in[- ]differences|interrupted time series/iu], sectionBoost: ["methods"] },
  { type: "CASE_CONTROL", patterns: [/case[- ]control|病例對照|matched controls?/iu], sectionBoost: ["methods", "participants"] },
  { type: "COHORT_LONGITUDINAL", patterns: [/prospective cohort|retrospective cohort|longitudinal|follow[- ]up|縱貫|世代研究|追蹤(?:期|研究)/iu], sectionBoost: ["methods", "participants"] },
  { type: "OBSERVATIONAL_CROSS_SECTIONAL", patterns: [/cross[- ]sectional|橫斷|survey (?:of|among)|regression analysis|correlational study|觀察性研究/iu], sectionBoost: ["methods", "statistical_analysis"] },
  { type: "QUALITATIVE", patterns: [/qualitative|thematic analysis|grounded theory|focus groups?|semi[- ]structured interviews?|深度訪談|質性|主題分析/iu], sectionBoost: ["methods"] },
  { type: "DATASET_CORPUS_RESOURCE", patterns: [/dataset|corpus|語料庫|資料集|annotation scheme|annotated (?:corpus|dataset)|resource paper/iu], sectionBoost: ["materials"] },
  { type: "TECHNICAL_COMPUTATIONAL", patterns: [/benchmark|baseline model|accuracy|F1|AUC|BLEU|ROUGE|RMSE|MAE|ablation|simulation|numerical study|algorithm|模型效能|基準測試/iu], sectionBoost: ["methods", "results", "materials"] },
  { type: "CASE_STUDY", patterns: [/case study|single[- ]case|個案研究|案例研究|case report/iu], sectionBoost: ["methods"] },
  { type: "DESCRIPTIVE_REPORT", patterns: [/descriptive study|descriptive report|現況調查|描述性研究/iu] },
];

export function classifyStudyTypeV2(document: ResearchDocumentV2): StudyTypeClassificationV2 {
  if (["CORRUPTED", "UNAVAILABLE"].includes(document.fullTextInterpretability)) return { type: "UNCLASSIFIABLE", confidence: 0, evidence: [], competingTypes: [], reason: document.interpretabilityReasons.join(";") };
  const searchable = [{ type: "title" as CanonicalSectionType, heading: "Title", text: document.title, page: undefined }, ...(document.abstract ? [{ type: "abstract" as CanonicalSectionType, heading: "Abstract", text: document.abstract, page: undefined }] : []), ...document.sections.map((section) => ({ type: section.canonicalType, heading: section.heading, text: section.text, page: section.page }))];
  const scored = TYPE_RULES.map((rule) => {
    let score = 0;
    const evidence: EvidenceLocatorV2[] = [];
    for (const region of searchable) {
      for (const pattern of rule.patterns) {
        const match = region.text.match(pattern);
        if (!match?.[0]) continue;
        const weight = region.type === "title" ? 0.34 : region.type === "abstract" ? 0.24 : rule.sectionBoost?.includes(region.type) ? 0.36 : 0.17;
        score += weight;
        evidence.push(locator({ sourceId: document.sourceId, documentId: document.documentId, section: region.type, heading: region.heading, text: match[0], page: region.page, start: match.index, end: (match.index ?? 0) + match[0].length, confidence: Math.min(0.96, 0.62 + weight) }));
      }
    }
    return { type: rule.type, score: Math.min(1, score), evidence };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return { type: document.fullTextInterpretability === "TRUNCATED" ? "UNCLASSIFIABLE" : "OTHER_EMPIRICAL", confidence: document.fullTextInterpretability === "TRUNCATED" ? 0 : 0.42, evidence: [], competingTypes: [], reason: "no_design_specific_signal" };
  const second = scored[1];
  const margin = best.score - (second?.score ?? 0);
  const confidence = Math.min(0.98, 0.45 + best.score * 0.4 + Math.max(0, margin) * 0.3 + (best.evidence.length > 1 ? 0.08 : 0));
  if (confidence < 0.5 || (second && margin < 0.08 && best.score < 0.8)) return { type: "UNCLASSIFIABLE", confidence, evidence: best.evidence, competingTypes: scored.slice(0, 3).map(({ type, score }) => ({ type, score })), reason: "ambiguous_or_low_confidence_study_type" };
  return { type: best.type, confidence, evidence: best.evidence, competingTypes: scored.slice(1, 4).map(({ type, score }) => ({ type, score })) };
}

function directionFrom(text: string): QuantitativeFactV2["direction"] {
  if (/no significant|not significant|null|無顯著|未發現|無差異/iu.test(text)) return "NULL";
  const positive = /increase|higher|improv|positive|上升|增加|提高|改善|正向/iu.test(text);
  const negative = /decrease|lower|reduc|negative|下降|減少|降低|負向/iu.test(text);
  return positive && negative ? "MIXED" : positive ? "POSITIVE" : negative ? "NEGATIVE" : "UNCLEAR";
}

function contextualText(text: string): { group: string | null; outcome: string | null; timepoint: string | null; comparison: string | null } {
  const group = text.match(/(?:among|in|for)\s+([^,;]{3,70})|(?:在|於)([^，；。]{2,45})(?:中|族群)/iu);
  const time = text.match(/(?:at|after|over|during)\s+((?:\d+\s*)?(?:day|week|month|year|hour)s?[^,;.]*)|(?:於|經過|追蹤)([^，；。]{2,35})/iu);
  const comparison = text.match(/(?:compared (?:with|to)|versus|vs\.?)\s+([^,;.]{2,80})|(?:相較於|對照)([^，；。]{2,50})/iu);
  const outcome = text.match(/(?:for|in)\s+([A-Za-z][A-Za-z -]{2,50})\s*(?:was|were|:|=)|([\p{Script=Han}]{2,24})(?:為|達|呈現|顯示)/u);
  return { group: clean(group?.[1] ?? group?.[2]) || null, outcome: clean(outcome?.[1] ?? outcome?.[2]) || null, timepoint: clean(time?.[1] ?? time?.[2]) || null, comparison: clean(comparison?.[1] ?? comparison?.[2]) || null };
}

const METRIC_PATTERNS: Array<{ metric: QuantitativeMetricV2; pattern: RegExp; valueGroup?: number; unit?: string }> = [
  { metric: "sample_size", pattern: /\b[nN]\s*[=:]\s*([\d,]+)|(?:sample of|included|enrolled|recruited|納入|招募|樣本(?:數|為)?)[^\d]{0,12}([\d,]+)(?!\s*(?:studies|articles|papers|篇))/giu },
  { metric: "included_studies", pattern: /(?:(?:included|納入)\s*([\d,]+)\s*(?:studies|articles|papers|篇研究)|([\d,]+)\s+included studies)/giu },
  { metric: "mean", pattern: /(?:mean(?:\s+[A-Za-z][A-Za-z -]{0,30})?|平均(?:數|值)?)\s*(?:=|was|of|為)?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "median", pattern: /(?:median|中位數)\s*(?:=|was|of|為)?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "percentage", pattern: /(-?\d+(?:\.\d+)?)\s*[%％]/gu, unit: "%" },
  { metric: "rate", pattern: /(?:rate|incidence|prevalence|率)\s*(?:=|was|of|為)?\s*(-?\d+(?:\.\d+)?\s*(?:%|％|per\s+\d+)?)/giu },
  { metric: "standard_deviation", pattern: /(?:\bSD\b|standard deviation|標準差)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "standard_error", pattern: /(?:\bSE\b|standard error|標準誤)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "interquartile_range", pattern: /(?:\bIQR\b|interquartile range|四分位距)\s*[=:]?\s*(-?\d+(?:\.\d+)?(?:\s*[-–,]\s*-?\d+(?:\.\d+)?)?)/giu },
  { metric: "p_value", pattern: /\bp\s*(?:=|<|>|≤|≥)\s*(0?\.\d+|\d+(?:\.\d+)?)/giu },
  { metric: "confidence_interval", pattern: /(?:95\s*%\s*)?\bCI\b\s*[=:]?\s*[\[(]?\s*(-?\d+(?:\.\d+)?)\s*[,–-]\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "odds_ratio", pattern: /(?:\bOR\b|odds ratio)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "risk_ratio", pattern: /(?:\bRR\b|risk ratio|relative risk)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "hazard_ratio", pattern: /(?:\bHR\b|hazard ratio)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "standardized_beta", pattern: /(?:standardized\s+beta|standardized\s+β|標準化β)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "beta", pattern: /(?:β|beta)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "correlation", pattern: /(?:Pearson'?s?\s+r|Spearman'?s?\s+(?:rho|ρ)|\br)\s*[=:]\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "cohens_d", pattern: /Cohen'?s?\s+d\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "hedges_g", pattern: /Hedges'?\s+g\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "accuracy", pattern: /accuracy\s*[=:]?\s*(-?\d+(?:\.\d+)?\s*%?)/giu },
  { metric: "f1", pattern: /F1(?:[- ]score)?\s*[=:]?\s*(-?\d+(?:\.\d+)?\s*%?)/giu },
  { metric: "precision", pattern: /precision\s*[=:]?\s*(-?\d+(?:\.\d+)?\s*%?)/giu },
  { metric: "recall", pattern: /recall\s*[=:]?\s*(-?\d+(?:\.\d+)?\s*%?)/giu },
  { metric: "auc", pattern: /AUC\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "rmse", pattern: /RMSE\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "mae", pattern: /MAE\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "bleu", pattern: /BLEU\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "rouge", pattern: /ROUGE(?:-[L12])?\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "pooled_estimate", pattern: /(?:pooled (?:estimate|effect|OR|RR|HR)|summary effect)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "i_squared", pattern: /I\s*[²2]\s*[=:]?\s*(-?\d+(?:\.\d+)?)\s*%?/giu, unit: "%" },
  { metric: "tau_squared", pattern: /(?:τ\s*[²2]|tau[- ]squared)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
  { metric: "q_statistic", pattern: /(?:Cochran'?s?\s+Q|Q statistic)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/giu },
];

function numberFromMatch(match: RegExpExecArray): number | null {
  const raw = match.slice(1).find((value) => typeof value === "string" && /-?\d/u.test(value));
  if (!raw) return null;
  const number = Number(raw.replace(/[%％,\s]/gu, ""));
  return Number.isFinite(number) ? number : null;
}

export function recoverQuantitativeFactsV2(document: ResearchDocumentV2): QuantitativeFactV2[] {
  const regions: Array<{ text: string; section: CanonicalSectionType; heading: string; page?: number; method: EvidenceLocatorV2["extractionMethod"]; table?: DocumentTableV2; row?: string; column?: string }> = [];
  for (const section of document.sections.filter((item) => item.canonicalType !== "references")) {
    for (const sentence of sentences(section.text)) regions.push({ text: sentence, section: section.canonicalType, heading: section.heading, page: section.page, method: "deterministic_pattern" });
  }
  for (const table of document.tables) {
    if (table.rows.length === 0) regions.push({ text: table.rawText, section: "table", heading: table.title, page: table.page, method: "table_parser", table });
    for (const row of table.rows) row.cells.forEach((cell, index) => regions.push({ text: `${row.label ?? ""} ${table.columns[index] ?? ""} ${cell}`, section: "table", heading: table.title, page: table.page, method: "table_parser", table, row: row.label, column: table.columns[index] }));
  }
  for (const figure of document.figures) regions.push({ text: `${figure.caption} ${figure.rawText}`, section: "figure_caption", heading: figure.caption, page: figure.page, method: "caption_parser" });
  const facts: QuantitativeFactV2[] = [];
  for (const region of regions) {
    const context = contextualText(region.text);
    const ci = region.text.match(/(?:95\s*%\s*)?\bCI\b\s*[=:]?\s*[\[(]?\s*(-?\d+(?:\.\d+)?)\s*[,–-]\s*(-?\d+(?:\.\d+)?)/iu);
    const sd = region.text.match(/(?:\bSD\b|standard deviation)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/iu);
    const se = region.text.match(/(?:\bSE\b|standard error)\s*[=:]?\s*(-?\d+(?:\.\d+)?)/iu);
    const p = region.text.match(/\bp\s*(?:=|<|>|≤|≥)\s*(?:0?\.\d+|\d+(?:\.\d+)?)/iu)?.[0];
    for (const definition of METRIC_PATTERNS) {
      definition.pattern.lastIndex = 0;
      for (const match of region.text.matchAll(definition.pattern)) {
        const rawValue = clean(match[0]);
        const value = numberFromMatch(match);
        const provenance = locator({ sourceId: document.sourceId, documentId: document.documentId, section: region.section, heading: region.heading, text: region.text, page: region.page, start: match.index, end: (match.index ?? 0) + match[0].length, table: region.table?.title, row: region.row, column: region.column, figure: region.section === "figure_caption" ? region.heading : undefined, method: region.method, confidence: region.method === "table_parser" ? 0.86 : 0.8 });
        facts.push({
          factId: `qf-${hash(`${document.sourceId}|${definition.metric}|${region.heading}|${match.index}|${rawValue}`)}`,
          metric: definition.metric,
          value,
          rawValue,
          unit: definition.unit ?? (/%|％/u.test(rawValue) ? "%" : null),
          direction: definition.metric === "sample_size" || definition.metric === "included_studies" ? "NOT_APPLICABLE" : directionFrom(region.text),
          groupOrCondition: context.group,
          outcome: context.outcome,
          timepoint: context.timepoint,
          comparison: context.comparison,
          uncertainty: ci || sd || se || p ? { ...(ci ? { ciLower: Number(ci[1]), ciUpper: Number(ci[2]) } : {}), ...(sd ? { sd: Number(sd[1]) } : {}), ...(se ? { se: Number(se[1]) } : {}), ...(p ? { pValue: p } : {}) } : null,
          provenance,
        });
      }
    }
  }
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.metric}|${fact.rawValue}|${fact.provenance.section}|${fact.provenance.subsection}|${fact.provenance.tableRow ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstMatch(document: ResearchDocumentV2, types: CanonicalSectionType[], pattern: RegExp, method: EvidenceLocatorV2["extractionMethod"] = "deterministic_pattern"): { value: string; evidence: EvidenceLocatorV2 } | null {
  for (const section of document.sections.filter((item) => types.includes(item.canonicalType))) {
    const sentence = sentences(section.text).find((item) => pattern.test(item));
    pattern.lastIndex = 0;
    if (!sentence) continue;
    return { value: sentence, evidence: locator({ sourceId: document.sourceId, documentId: document.documentId, section: section.canonicalType, heading: section.heading, text: sentence, page: section.page, method }) };
  }
  return null;
}

function fieldFromMatch(match: { value: string; evidence: EvidenceLocatorV2 } | null, missingStatus: FactStatus, reason: string): FactField<string> {
  return match ? present(match.value, [match.evidence]) : missing(missingStatus as Exclude<FactStatus, "PRESENT">, reason);
}

function notApplicableFields(type: StudyTypeV2): Set<string> {
  const fields = new Set<string>();
  if (["QUALITATIVE", "SYSTEMATIC_REVIEW", "DATASET_CORPUS_RESOURCE", "CASE_STUDY", "DESCRIPTIVE_REPORT"].includes(type)) ["effectEstimate", "pooledEstimate", "heterogeneity"].forEach((field) => fields.add(field));
  if (!["RANDOMIZED_EXPERIMENT", "NON_RANDOMIZED_EXPERIMENT"].includes(type)) ["intervention", "comparator", "assignmentMechanism"].forEach((field) => fields.add(field));
  if (type !== "META_ANALYSIS") ["pooledEstimate", "heterogeneity", "modelType", "publicationBias"].forEach((field) => fields.add(field));
  if (type !== "DATASET_CORPUS_RESOURCE") ["annotationScheme", "resourceSize"].forEach((field) => fields.add(field));
  return fields;
}

function statusForAbsent(
  document: ResearchDocumentV2,
  relevantSections: CanonicalSectionType[],
): FactStatus {
  if (["INTERPRETABLE", "PARTIAL"].includes(document.fullTextInterpretability)) {
    const relevantContentInspected = document.sections.some(
      (section) =>
        relevantSections.includes(section.canonicalType) &&
        clean(section.text).length > 0,
    );
    return relevantContentInspected ? "NOT_REPORTED" : "UNKNOWN";
  }
  if (["ABSTRACT_ONLY", "TRUNCATED"].includes(document.fullTextInterpretability)) return "UNKNOWN";
  return "EXTRACTION_FAILED";
}

function findingDirection(text: string): NormalizedFindingV2["direction"] {
  if (/interaction|moderated|stronger (?:among|under)|weaker (?:among|under)|only when|交互作用|調節|條件下/iu.test(text)) return "CONTEXT_DEPENDENT";
  if (/mixed|inconsistent|heterogeneous|不一致|異質/iu.test(text)) return "MIXED";
  if (/no significant|not significant|null|無顯著|未發現/iu.test(text)) return "NULL";
  if (/decreas|lower|reduc|negative|下降|降低|減少|負向/iu.test(text)) return "CONTRADICT";
  return "SUPPORT";
}

export function extractStudyFactEnvelopeV2(input: StudyDocumentInputV2): StudyFactEnvelopeV2 {
  const document = buildResearchDocumentV2(input);
  const classification = classifyStudyTypeV2(document);
  const na = notApplicableFields(classification.type);
  const quantitativeFacts = recoverQuantitativeFactsV2(document);
  const methodMatch = firstMatch(document, ["methods", "participants", "materials", "measures", "statistical_analysis", "abstract"], /method|design|participants?|sample|dataset|corpus|survey|interview|regression|random|方法|研究設計|樣本|資料集|語料|訪談|迴歸/iu);
  const populationMatch = firstMatch(document, ["participants", "methods", "abstract"], /participants?|patients?|students?|sample|cohort|respondents?|受試者|參與者|學生|樣本|世代|研究對象/iu);
  const questionMatch = firstMatch(document, ["abstract", "introduction"], /aim|objective|purpose|research question|investigat|evaluate|compare|旨在|目的|探討|評估|比較/iu);
  const resultSections = document.sections.filter((section) => ["results", "abstract", "conclusion"].includes(section.canonicalType));
  const resultSentences = resultSections.flatMap((section) => sentences(section.text).map((text) => ({ section, text }))).filter(({ text }) => /result|found|show|effect|impact|associated|correlat|predict|caus|risk|harm|differ|perform|accur|improv|increas|decreas|higher|lower|stronger|weaker|theme|conclud|結果|發現|顯示|效果|影響|關聯|預測|造成|導致|風險|危害|差異|效能|改善|增加|降低|較強|較弱|主題|結論/iu.test(text)).slice(0, 8);
  const primaryFindings = resultSentences.map(({ section, text }, index): FactField<NormalizedFindingV2> => {
    const evidence = locator({ sourceId: document.sourceId, documentId: document.documentId, section: section.canonicalType, heading: section.heading, text, page: section.page });
    const contextual = text.match(/(?:interaction with|moderated by|stronger (?:among|under)|weaker (?:among|under)|only when)\s+([^,.;]{2,70})|(?:在|於)([^，。；]{2,45})(?:條件下|族群中).*(?:較強|較弱|增加|降低)/iu);
    const qIds = quantitativeFacts.filter((fact) => fact.provenance.exactEvidence === evidence.exactEvidence).map((fact) => fact.factId);
    return present({ findingId: `finding-${hash(`${document.sourceId}|${index}|${text}`)}`, topic: clean(input.title), claimType: classification.type === "QUALITATIVE" ? "THEME" : classification.type === "TECHNICAL_COMPUTATIONAL" ? "PERFORMANCE" : classification.type === "DATASET_CORPUS_RESOURCE" ? "RESOURCE" : "ASSOCIATION", direction: findingDirection(text), magnitude: qIds.length ? quantitativeFacts.filter((fact) => qIds.includes(fact.factId)).map((fact) => fact.rawValue).join(", ") : null, populationOrContext: populationMatch?.value ?? null, conditionOrModerator: clean(contextual?.[1] ?? contextual?.[2]) || null, text, evidence: [evidence], quantitativeFactIds: qIds, confidence: 0.76, boundaries: [] }, [evidence]);
  });
  const limitationMatches = document.sections.filter((section) => ["limitations", "discussion", "abstract"].includes(section.canonicalType)).flatMap((section) => sentences(section.text).filter((text) => /limit|bias|cannot|caution|future|限制|偏誤|無法|謹慎/u.test(text)).slice(0, 4).map((text) => present(text, [locator({ sourceId: document.sourceId, documentId: document.documentId, section: section.canonicalType, heading: section.heading, text, page: section.page })])));
  const core: Record<string, FactField<unknown>> = {};
  const patterns: Record<string, { sections: CanonicalSectionType[]; pattern: RegExp }> = {
    intervention: { sections: ["methods", "abstract"], pattern: /intervention|treatment|assigned to|訓練|介入|處置/u },
    comparator: { sections: ["methods", "results", "abstract"], pattern: /control group|placebo|compared with|對照組|安慰劑|相較於/u },
    exposurePredictor: { sections: ["methods", "measures", "statistical_analysis", "abstract"], pattern: /exposure|predictor|independent variable|associated with|暴露|預測因子|自變項|與.*相關/u },
    outcome: { sections: ["measures", "results", "abstract"], pattern: /outcome|dependent variable|measured|score|結果指標|依變項|測量|得分/u },
    timepoints: { sections: ["methods", "results", "abstract"], pattern: /follow[- ]up|baseline|after \d+|at \d+|追蹤|基線|後測/u },
    assignmentMechanism: { sections: ["methods"], pattern: /random allocation|randomly assigned|matching|assignment|隨機分派|配對|分派/u },
    confounders: { sections: ["statistical_analysis", "methods", "results"], pattern: /adjusted for|controlled for|covariates?|confounders?|調整|控制變項|共變項|混雜/u },
    dataCollectionMethod: { sections: ["methods", "abstract"], pattern: /interview|focus group|observation|survey|documents?|訪談|焦點團體|觀察|問卷|文件分析/u },
    analyticMethod: { sections: ["methods", "statistical_analysis", "abstract"], pattern: /thematic analysis|grounded theory|content analysis|regression|ANOVA|t[- ]test|主題分析|紮根理論|內容分析|迴歸|變異數分析/u },
    reviewScope: { sections: ["methods", "abstract"], pattern: /databases? searched|search strategy|search scope|檢索資料庫|搜尋策略|檢索範圍/u },
    inclusionCriteria: { sections: ["methods", "abstract"], pattern: /inclusion criteria|eligibility criteria|納入標準|資格標準/u },
    synthesisMethod: { sections: ["methods", "abstract"], pattern: /narrative synthesis|meta[- ]analysis|random[- ]effects|fixed[- ]effect|統合方法|敘事綜合|隨機效應|固定效應/u },
    taskProblem: { sections: ["abstract", "introduction"], pattern: /task|problem|challenge|we propose|任務|問題|挑戰|提出/u },
    datasetCorpus: { sections: ["materials", "methods", "abstract"], pattern: /dataset|corpus|benchmark data|資料集|語料庫|基準資料/u },
    proposedMethod: { sections: ["methods", "abstract"], pattern: /proposed method|we propose|model|algorithm|architecture|提出方法|模型|演算法|架構/u },
    baseline: { sections: ["methods", "results", "abstract"], pattern: /baseline|compared with|state[- ]of[- ]the[- ]art|基線|基準|相較於/u },
    metricResult: { sections: ["results", "abstract"], pattern: /accuracy|F1|AUC|BLEU|ROUGE|RMSE|MAE|效能|準確率/u },
    annotationScheme: { sections: ["materials", "methods", "abstract"], pattern: /annotation scheme|annotated by|inter[- ]annotator|標註架構|標註者|標註一致/u },
    resourceSize: { sections: ["materials", "methods", "abstract"], pattern: /\d+[\d,]*\s*(?:documents?|sentences?|tokens?|records?|languages?|筆|句|詞|語言)/u },
    caseContext: { sections: ["abstract", "methods"], pattern: /case study|case context|single case|個案研究|案例背景|單一個案/u },
    dataSources: { sections: ["methods", "abstract"], pattern: /data sources?|records?|documents?|interviews?|資料來源|紀錄|文件|訪談/u },
    mainObservations: { sections: ["results", "abstract", "conclusion"], pattern: /observed|finding|showed|impact|associated|effect|risk|harm|caus|differ|perform|improv|發現|觀察到|顯示|影響|關聯|效果|風險|危害|造成|差異|效能|改善/u },
  };
  for (const [field, definition] of Object.entries(patterns)) {
    if (na.has(field)) core[field] = missing("NOT_APPLICABLE", `${field}_not_applicable_to_${classification.type}`);
    else core[field] = fieldFromMatch(firstMatch(document, definition.sections, definition.pattern), statusForAbsent(document, definition.sections), `${field}_not_reported_or_not_recovered`);
  }
  const reviewCountAbsent = statusForAbsent(document, ["methods", "results", "abstract"]);
  const includedStudy = quantitativeFacts.find((fact) => fact.metric === "included_studies");
  core.includedStudyCount = includedStudy ? present(includedStudy.value, [includedStudy.provenance]) : classification.type === "SYSTEMATIC_REVIEW" || classification.type === "META_ANALYSIS" ? missing(reviewCountAbsent as Exclude<FactStatus, "PRESENT">, "included_study_count_not_reported") : missing("NOT_APPLICABLE", "included_study_count_only_applies_to_reviews");
  const pooled = quantitativeFacts.find((fact) => fact.metric === "pooled_estimate");
  core.pooledEstimate = pooled ? present(pooled.value, [pooled.provenance]) : classification.type === "META_ANALYSIS" ? missing(reviewCountAbsent as Exclude<FactStatus, "PRESENT">, "pooled_estimate_not_reported_or_not_recovered") : missing("NOT_APPLICABLE", "pooled_estimate_only_applies_to_meta_analysis");
  const heterogeneity = quantitativeFacts.find((fact) => ["i_squared", "tau_squared", "q_statistic"].includes(fact.metric));
  core.heterogeneity = heterogeneity ? present(heterogeneity.rawValue, [heterogeneity.provenance]) : classification.type === "META_ANALYSIS" ? missing(reviewCountAbsent as Exclude<FactStatus, "PRESENT">, "heterogeneity_not_reported_or_not_recovered") : missing("NOT_APPLICABLE", "heterogeneity_only_applies_to_meta_analysis");
  const effectEstimate = quantitativeFacts.find((fact) => ["odds_ratio", "risk_ratio", "hazard_ratio", "beta", "standardized_beta", "correlation", "cohens_d", "hedges_g", "mean", "percentage", "rate"].includes(fact.metric));
  core.effectEstimate = effectEstimate ? present(effectEstimate.rawValue, [effectEstimate.provenance]) : na.has("effectEstimate") ? missing("NOT_APPLICABLE", `effect_estimate_not_applicable_to_${classification.type}`) : missing(statusForAbsent(document, ["results", "table", "figure_caption", "abstract"]) as Exclude<FactStatus, "PRESENT">, "effect_estimate_not_reported_or_not_recovered");
  const provenance = unique([...classification.evidence, ...primaryFindings.flatMap((field) => field.evidence), ...quantitativeFacts.map((fact) => fact.provenance), ...Object.values(core).flatMap((field) => field.evidence)]);
  return {
    studyId: clean(input.canonicalId) || document.documentId,
    sourceId: input.sourceId,
    canonicalId: clean(input.canonicalId) || null,
    title: document.title,
    year: typeof input.year === "number" ? input.year : null,
    studyType: classification.type,
    studyTypeConfidence: classification.confidence,
    competingStudyTypes: classification.competingTypes,
    domain: present(document.title, [locator({ sourceId: document.sourceId, documentId: document.documentId, section: "title", heading: "Title", text: document.title, method: methodForInput(clean(input.extractionMethod)), confidence: 0.7 })], 0.55),
    populationContext: fieldFromMatch(populationMatch, statusForAbsent(document, ["participants", "methods", "abstract"]), "population_or_context_not_reported"),
    methodsSummary: fieldFromMatch(methodMatch, statusForAbsent(document, ["methods", "participants", "materials", "measures", "statistical_analysis", "abstract"]), "methods_not_reported_or_not_recovered"),
    primaryQuestion: fieldFromMatch(questionMatch, statusForAbsent(document, ["abstract", "introduction"]), "primary_question_not_reported_or_not_recovered"),
    primaryFindings,
    limitations: limitationMatches,
    quantitativeFacts,
    qualitativeFacts: classification.type === "QUALITATIVE" ? primaryFindings.map((field) => present(field.value!.text, field.evidence)) : [],
    coreFacts: core,
    provenance,
    qualityFlags: unique([...document.qualityFlags, ...(primaryFindings.length === 0 ? ["NO_ADMISSION_GRADE_FINDING"] : []), ...(classification.type === "UNCLASSIFIABLE" ? ["STUDY_TYPE_UNCLASSIFIABLE"] : [])]),
    extractionVersion: STUDY_FACT_EXTRACTION_VERSION,
    documentInterpretability: document.fullTextInterpretability,
    extractionPath: document.extractionPath,
  };
}

const FORMAL_REQUIREMENTS: Record<StudyTypeV2, string[]> = {
  RANDOMIZED_EXPERIMENT: ["methodsSummary", "populationContext", "intervention", "outcome"],
  NON_RANDOMIZED_EXPERIMENT: ["methodsSummary", "populationContext", "intervention", "outcome", "assignmentMechanism", "confounders"],
  OBSERVATIONAL_CROSS_SECTIONAL: ["methodsSummary", "populationContext", "exposurePredictor", "outcome"],
  COHORT_LONGITUDINAL: ["methodsSummary", "populationContext", "timepoints", "exposurePredictor", "outcome"],
  CASE_CONTROL: ["methodsSummary", "populationContext", "exposurePredictor", "outcome"],
  QUALITATIVE: ["methodsSummary", "populationContext", "dataCollectionMethod", "analyticMethod"],
  SYSTEMATIC_REVIEW: ["primaryQuestion", "reviewScope", "inclusionCriteria", "synthesisMethod"],
  META_ANALYSIS: ["methodsSummary", "includedStudyCount", "synthesisMethod", "pooledEstimate", "heterogeneity"],
  TECHNICAL_COMPUTATIONAL: ["taskProblem", "proposedMethod", "datasetCorpus", "metricResult"],
  DATASET_CORPUS_RESOURCE: ["primaryQuestion", "datasetCorpus", "resourceSize", "annotationScheme"],
  CASE_STUDY: ["caseContext", "dataSources", "methodsSummary", "mainObservations"],
  DESCRIPTIVE_REPORT: ["methodsSummary", "populationContext", "mainObservations"],
  OTHER_EMPIRICAL: ["methodsSummary", "mainObservations"],
  UNCLASSIFIABLE: [],
};

function envelopeField(envelope: StudyFactEnvelopeV2, name: string): FactField<unknown> {
  if (name === "methodsSummary") return envelope.methodsSummary;
  if (name === "populationContext") return envelope.populationContext;
  if (name === "primaryQuestion") return envelope.primaryQuestion;
  return envelope.coreFacts[name] ?? missing("EXTRACTION_FAILED", `unknown_admission_field:${name}`);
}

export function admitStudyFactEnvelopeV2(envelope: StudyFactEnvelopeV2): StudyAdmissionV2 {
  const substantiveFindings = envelope.primaryFindings.filter((field) => field.status === "PRESENT" && field.evidence.length > 0);
  const provenanceComplete = [...envelope.primaryFindings, envelope.populationContext, envelope.methodsSummary, envelope.primaryQuestion, ...Object.values(envelope.coreFacts)].filter((field) => field.status === "PRESENT").every((field) => field.evidence.length > 0 && field.evidence.every((item) => item.sourceId === envelope.sourceId && item.exactEvidence.length > 0));
  const numericalProvenanceComplete = envelope.quantitativeFacts.every((fact) => Boolean(fact.provenance.exactEvidence && fact.provenance.sourceId === envelope.sourceId));
  const criticalContradiction = envelope.primaryFindings.some((field) => field.status === "CONFLICTING") || envelope.qualityFlags.includes("CRITICAL_CONTRADICTION");
  if (envelope.studyType === "UNCLASSIFIABLE") return { level: "BLOCKED", eligible: false, requirements: [], reasons: ["study_type_unclassifiable"], provenanceComplete, numericalProvenanceComplete, criticalContradiction };
  const requirements = FORMAL_REQUIREMENTS[envelope.studyType].map((field) => {
    const value = envelopeField(envelope, field);
    return { field, satisfied: value.status === "PRESENT" || value.status === "NOT_APPLICABLE", status: value.status, reason: value.status === "PRESENT" ? "present_with_provenance" : value.status === "NOT_APPLICABLE" ? "not_applicable_not_counted_as_missing" : value.reason ?? value.status.toLocaleLowerCase() };
  });
  const limited = substantiveFindings.length > 0 && provenanceComplete && numericalProvenanceComplete && !criticalContradiction;
  const qualifyingFullTextInterpretability = ["INTERPRETABLE", "PARTIAL"].includes(
    envelope.documentInterpretability,
  );
  const formal = limited && requirements.every((item) => item.satisfied) && envelope.methodsSummary.status === "PRESENT" && qualifyingFullTextInterpretability;
  const reasons = [
    ...(substantiveFindings.length === 0 ? ["no_substantive_finding_with_provenance"] : []),
    ...(!provenanceComplete ? ["substantive_fact_provenance_incomplete"] : []),
    ...(!numericalProvenanceComplete ? ["numerical_provenance_incomplete"] : []),
    ...(criticalContradiction ? ["critical_contradiction"] : []),
    ...(!qualifyingFullTextInterpretability ? [
      `qualifying_full_text_required:${envelope.documentInterpretability}`,
    ] : []),
    ...requirements.filter((item) => !item.satisfied).map((item) => `${item.field}:${item.status}`),
  ];
  return { level: formal ? "FORMAL" : limited ? "LIMITED" : "BLOCKED", eligible: limited, requirements, reasons, provenanceComplete, numericalProvenanceComplete, criticalContradiction };
}

export interface CrossStudyClaimCandidateV2 {
  claimId: string;
  topic: string;
  direction: NormalizedFindingV2["direction"];
  supportingStudyIds: string[];
  contradictingStudyIds: string[];
  confidence: number;
  boundaries: string[];
  evidence: EvidenceLocatorV2[];
}

export function buildCrossStudyClaimCandidatesV2(envelopes: StudyFactEnvelopeV2[]): CrossStudyClaimCandidateV2[] {
  const admitted = envelopes.filter((envelope) => admitStudyFactEnvelopeV2(envelope).eligible);
  const findings = admitted.flatMap((envelope) => envelope.primaryFindings.filter((field) => field.status === "PRESENT" && field.value).map((field) => ({ envelope, finding: field.value! })));
  const groups = new Map<string, typeof findings>();
  for (const item of findings) {
    const key = clean(item.finding.topic).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 80) || item.envelope.studyType;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([topic, items]) => {
    const nullOrContradict = items.filter((item) => ["CONTRADICT", "NULL"].includes(item.finding.direction));
    const support = items.filter((item) => !nullOrContradict.includes(item));
    const hasContext = items.some((item) => item.finding.direction === "CONTEXT_DEPENDENT");
    const direction: NormalizedFindingV2["direction"] = hasContext ? "CONTEXT_DEPENDENT" : support.length && nullOrContradict.length ? "MIXED" : nullOrContradict.length === items.length ? "NULL" : "SUPPORT";
    return { claimId: `cross-study-${hash(`${topic}|${items.map((item) => item.envelope.studyId).join("|")}`)}`, topic, direction, supportingStudyIds: unique(support.map((item) => item.envelope.studyId)), contradictingStudyIds: unique(nullOrContradict.map((item) => item.envelope.studyId)), confidence: Math.min(...items.map((item) => item.finding.confidence)), boundaries: unique(items.flatMap((item) => item.finding.boundaries)), evidence: items.flatMap((item) => item.finding.evidence) };
  });
}

export function assertPresentFactsHaveProvenance(envelope: StudyFactEnvelopeV2): void {
  const fields: FactField<unknown>[] = [envelope.domain, envelope.populationContext, envelope.methodsSummary, envelope.primaryQuestion, ...envelope.primaryFindings, ...envelope.limitations, ...envelope.qualitativeFacts, ...Object.values(envelope.coreFacts)];
  for (const field of fields) if (field.status === "PRESENT" && field.evidence.length === 0) throw new Error("PRESENT_FACT_REQUIRES_PROVENANCE");
  for (const fact of envelope.quantitativeFacts) if (!fact.provenance.exactEvidence) throw new Error("NUMERICAL_FACT_REQUIRES_PROVENANCE");
}
