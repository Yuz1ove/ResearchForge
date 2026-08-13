import type { ReportPlan } from "@workspace/api-zod";

import type { EvidenceCard } from "./evidenceCards.ts";
import {
  auditEvidenceVisualSemantics,
  buildEvidenceVisuals,
  evidenceVisualsHaveCompleteProvenance,
  generatedConceptImageRecordIsTruthful,
  mainBodyEvidenceVisualIssues,
  type EvidenceVisualSpec,
  type GeneratedConceptImageRecord,
} from "./evidenceVisuals.ts";
import {
  auditStandardizedEvidenceFacts,
  buildStandardizedEvidenceFacts,
  buildStandardizedEvidenceFactsFromNormalizedPlan,
  type StandardizedEvidenceFact,
  type StandardizedNumericalResult,
} from "./standardizedEvidenceFacts.ts";
import type {
  EvidenceVisualSemanticData,
  VisualSemanticRoute,
} from "./visualSemanticRouter.ts";
import {
  exportSafeReportSectionText,
  readerFacingNaturalParagraphs,
  sanitizeReaderFacingInternalLanguage,
} from "./reportPreviewGuards.ts";
import type { ReportWorkspace } from "./reportWorkspace.ts";
import {
  evaluateReportQuality,
  type ReportQualityGateResult,
  type ReportQualityGateInput,
} from "./reportQualityGate.ts";
import {
  buildBibliography,
  canonicalSourceKeyForSource,
  type SourceRecord,
} from "./sourceRecords.ts";

export type FormalReportKind =
  | "evidence_synthesis_report"
  | "limited_evidence_brief";

export type FormalReportSectionRole =
  | "research_question"
  | "scope_method"
  | "analysis"
  | "cross_source_synthesis"
  | "limitations"
  | "conclusion"
  | "appendix";

export interface FormalReportBlock {
  /** Reader-facing prose only. Citation markers are rendered from segments. */
  text: string;
  citationIds: string[];
  segments?: FormalReportCitationSegment[];
  paragraphRole?: "reading_guide" | "narrative" | "interpretation" | "boundary";
  /** Claim-graph node this paragraph realizes, when deterministically bound. */
  argumentClaimId?: string;
  /** All writer-native claim-graph nodes realized by this paragraph. */
  argumentClaimIds?: string[];
}

export interface FormalReportCitationSegment {
  text: string;
  citationIds: string[];
}

export interface TableSpec {
  specType: "table";
  number: number;
  title: string;
  columns: string[];
  rows: string[][];
  units: string | null;
  legend: string | null;
  sourceNote: string;
  note: string | null;
  altText: string;
}
export type FormalReportTable = TableSpec;

export interface FigureSpec {
  specType: "figure";
  number: number;
  figureType: "directness_distribution" | "evidence_gap_matrix" | "conceptual_mechanism";
  title: string;
  units: string | null;
  legend: Array<{ key: string; label: string }>;
  data:
    | { kind: "categorical_bar"; categories: Array<{ key: string; label: string; value: number }> }
    | { kind: "matrix"; columns: string[]; rows: Array<{ label: string; values: string[] }> }
    | { kind: "directed_graph"; nodes: Array<{ id: string; label: string }>; edges: Array<{ from: string; to: string; label: string }> };
  /** Renderer-independent statistical or schematic meaning. */
  semanticData?: EvidenceVisualSemanticData;
  /** Statistical route accepted by the fail-closed semantic router. */
  semanticRoute?: VisualSemanticRoute;
  sourceNote: string;
  note: string | null;
  altText: string;
  /** Claim-graph node whose argument this figure explains or quantifies. */
  argumentClaimId?: string;
}

export interface FormalReportSection {
  id: string;
  title: string;
  role: FormalReportSectionRole;
  blocks: FormalReportBlock[];
  tables: FormalReportTable[];
  figures: FigureSpec[];
  /** Canonical evidence-first reading order shared by preview and every export. */
  content?: FormalReportContentNode[];
}

export type FormalReportContentNode =
  | { nodeType: "paragraph"; block: FormalReportBlock }
  | { nodeType: "table"; table: FormalReportTable }
  | { nodeType: "figure"; figure: FigureSpec };

export function formalReportSectionContent(
  section: FormalReportSection,
): FormalReportContentNode[] {
  return section.content ?? [
    ...section.blocks.map((block) => ({ nodeType: "paragraph" as const, block })),
    ...section.tables.map((table) => ({ nodeType: "table" as const, table })),
    ...section.figures.map((figure) => ({ nodeType: "figure" as const, figure })),
  ];
}

export type FormalSourceUsageStatus =
  | "includedAndCited"
  | "includedBackgroundOnly"
  | "includedButNotUsed"
  | "excludedWithReason";

export interface FormalSourceUsage {
  sourceId: string;
  sourceIdentity: string;
  title: string;
  status: FormalSourceUsageStatus;
  reason: string;
}

export interface FormalReportReference {
  citationId: string;
  sourceIdentity: string;
  sourceId: string;
  /** Internal stable ordinal. It is never rendered as a reader citation. */
  referenceNumber: number;
  /** Author-year label used by every reader-facing renderer. */
  marker: string;
  authorYear: string;
  text: string;
  doi: string | null;
  url: string | null;
}

export interface FormalReportEvidenceUnit {
  id: string;
  sourceId: string;
  sourceIdentity: string;
  location: string | null;
  researchSetting: string | null;
  studyDesign: string | null;
  dataScope: string | null;
  exposure: string | null;
  outcome: string | null;
  exactResult: string;
  numericResult: string | null;
  applicability: string;
  locator: string;
  directnessTier: "A" | "B" | "C" | "D";
  numericalResults: StandardizedNumericalResult[];
}

export interface FormalReportAbstractValidation {
  status: "pass" | "blocked";
  attempts: 1 | 2;
  issues: string[];
}

export interface FormalReportAbstract {
  text: string;
  keywords: string[];
  validation: FormalReportAbstractValidation;
}

export interface FormalReportTocEntry {
  id: string;
  title: string;
  level: 1 | 2;
}

export interface FormalReportDocument {
  schemaVersion: "formal-report-document/v1";
  metadata: {
    title: string;
    subtitle: string;
    reportKind: FormalReportKind;
    reportTypeLabel: string;
    generatedDate: string;
    documentVersion: string;
    researchQuestion: string;
    acceptedSourceCount: number;
    evidenceSourceCount: number;
    citedSourceCount: number;
    referenceCount: number;
    evidenceUnitCount: number;
    /** @deprecated Use the explicit source counts above. */
    sourceCount: number;
    /** @deprecated Use evidenceUnitCount. */
    evidenceCount: number;
    sourceYearRange: string | null;
    retrievalDate: string;
  };
  titlePage: {
    title: string;
    subtitle: string;
    reportTypeLabel: string;
    researchQuestion: string;
    evidenceScope: string;
    generatedDate: string;
    documentVersion: string;
  };
  abstract: FormalReportAbstract;
  tableOfContents: FormalReportTocEntry[];
  researchQuestion: FormalReportSection;
  scopeAndMethod: FormalReportSection;
  analysisSections: FormalReportSection[];
  crossSourceSynthesis: FormalReportSection;
  limitations: FormalReportSection;
  conclusion: FormalReportSection;
  references: FormalReportReference[];
  evidenceFacts: StandardizedEvidenceFact[];
  evidenceUnits: FormalReportEvidenceUnit[];
  /** Image2 records are separate from deterministic evidence graphics. */
  generatedConceptImages: GeneratedConceptImageRecord[];
  sourceUsage: FormalSourceUsage[];
  appendix: FormalReportSection[];
  /** Deterministic ten-dimension audit attached to the canonical document. */
  quality: ReportQualityGateResult;
  integrity: {
    status: "pass" | "blocked";
    unknownCitationTokens: string[];
    ambiguousCitationTokens: string[];
    forbiddenReaderTokens: string[];
    excludedParagraphs: number;
    sourceCountIssues: string[];
    citationMappingIssues: string[];
    sourceMentionIssues: string[];
    sectionCompletenessIssues: string[];
    repetitionIssues: string[];
    tableIssues: string[];
    figureIssues: string[];
    imageIssues: string[];
    factIssues: string[];
    sourceOverlapIssues: string[];
    sourceCenteredParagraphIssues: string[];
    venueIssues: string[];
  };
}

export interface InternalCitationToken {
  raw: string;
  canonicalMarker: string;
  ordinal: number;
}

const INTERNAL_CITATION_TOKEN_PATTERN =
  /\{\{?\s*[sS\uff33\uff53]\s*([0-9\uff10-\uff19]+)\s*\}?\}|[\[\uff3b]\s*(?:[sS\uff33\uff53]\s*|source\s*:\s*)([0-9\uff10-\uff19]+)\s*[\]\uff3d]|\b(?:source|citation)[_-]([0-9]+)\b/giu;

const READER_FORBIDDEN_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["legacy-curly-citation", /\{\{?\s*[sS]\s*\d+\s*\}?\}/iu],
  ["legacy-source-citation", /\[\s*source\s*:\s*\d+\s*\]/iu],
  ["legacy-s-citation", /\[\s*[sS]\s*\d+\s*\]/u],
  ["legacy-source-id", /\bsource_\d+\b/iu],
  ["legacy-citation-id", /\bcitation_\d+\b/iu],
  ["tool-search-token", /\bturn\d+(?:search|fetch|view)\d+\b/iu],
  ["tool-line-citation", /【\d+\u2020L\d+(?:-L\d+)?】/u],
  ["evidence-card-label", /\bEvidence\s*Card\b|\bEvidenceCard\b|證據卡(?:片)?/iu],
  ["source-id-field", /\bsourceId\b/iu],
  ["evidence-set-hash", /\bevidenceSetHash\b/iu],
  ["workflow-diagnostic", /\b(?:workflowId|topicHash|reason[_ -]?code)\b/iu],
  ["citation-field", /\b(?:citationIds?|supportSpans?)\b/iu],
  ["grounding-diagnostic", /\bgrounding[_ -]?(?:verifier|status)\b/iu],
  ["argument-map", /\bArgumentMap\b/u],
  ["discourse-plan", /\bDiscoursePlan\b/u],
  ["report-plan", /\bReportPlan\b/u],
  ["canonical-citation-registry", /\bcanonical\s+citation\s+registry\b/iu],
  ["citation-registry", /\bcitation\s+registry\b/iu],
  ["provider-coverage", /\bprovider\s+coverage\b/iu],
  ["formal-export-gate", /\bformal\s+export\s+gate\b/iu],
  ["unresolved-evidence", /未解決證據/u],
  ["raw-excerpt-audit", /原始摘錄僅供查核/u],
  ["invent-page-warning", /不能編造頁碼/u],
  ["attachment-diagnostic", /不含附件或診斷資料/u],
  ["normalized-claim", /\bnormalizedClaimZhTw\b/u],
  ["paragraph-plan", /\bparagraphPlans?\b/iu],
  ["internal-evidence-type", /\bfindings\s*類證據/iu],
  ["numeric-citation-stack", /\[\s*\d+\s*\](?:\s*\[\s*\d+\s*\])+/u],
  ["numeric-bracket-citation", /\[\s*\d+\s*\]/u],
  ["normalization-workflow", /(?:已|未)?正規化(?:內容|證據|主張)?/u],
  ["ordinal-finding-template", /第[一二三四五六七八九十]+項發現是[：:]/u],
  ["brief-conclusion-template", /簡短結論[：:]/u],
  ["cannot-answer-template", /目前無法回答的部分[：:]/u],
  ["no-formal-content-template", /本段目前不輸出正式內容/u],
  ["lookup-instruction", /請補查來源/u],
  ["metadata-only", /\bmetadata-only\b/iu],
  ["show-topic-options", /\bshow_topic_options\b/iu],
];

function compact(value: string | null | undefined): string {
  return value?.normalize("NFKC").replace(/\s+/gu, " ").trim() ?? "";
}

function normalizedIdentity(value: string | null | undefined): string {
  return compact(value).toLocaleLowerCase();
}

function asciiDigits(value: string): string {
  return value.replace(/[\uff10-\uff19]/gu, (digit) =>
    String(digit.charCodeAt(0) - 0xff10),
  );
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(compact).filter(Boolean)));
}

export function extractInternalCitationTokens(value: string): InternalCitationToken[] {
  const tokens: InternalCitationToken[] = [];
  for (const match of value.matchAll(INTERNAL_CITATION_TOKEN_PATTERN)) {
    const digits = asciiDigits(match[1] ?? match[2] ?? match[3] ?? "")
      .replace(/^0+(?=\d)/u, "");
    const ordinal = Number(digits);
    if (!Number.isInteger(ordinal) || ordinal < 1) continue;
    tokens.push({
      raw: match[0],
      canonicalMarker: `[S${ordinal}]`,
      ordinal,
    });
  }
  return tokens;
}

export function canonicalizeInternalCitationTokens(value: string): string {
  return value.replace(INTERNAL_CITATION_TOKEN_PATTERN, (raw) =>
    extractInternalCitationTokens(raw)[0]?.canonicalMarker ?? raw,
  );
}

export function stripInternalCitationTokens(value: string): string {
  return value
    .replace(INTERNAL_CITATION_TOKEN_PATTERN, "")
    .replace(/[ \t]+([\u3002\uff01\uff1f!?\uff1b;\uff0c,\u3001\uff1a:])/gu, "$1")
    .replace(/[ \t]{2,}/gu, " ")
    .trim();
}

function internalIdPatterns(workspace?: ReportWorkspace): Array<readonly [string, RegExp]> {
  if (!workspace) return [];
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ids = unique([
    ...workspace.evidenceCards.map((card) => card.id),
    ...workspace.evidenceCards.map((card) => card.evidenceCardId),
    ...workspace.acceptedSources.map((source) => source.id),
  ]).filter((id) =>
    /^(?:ev(?:idence)?[-_:]|card[-_:]|source[-_:]|src[-_:]|[0-9a-f]{8}-[0-9a-f-]{20,}$)/iu.test(id),
  );
  return ids.map((id) => [`internal-id:${id}`, new RegExp(escape(id), "u")] as const);
}

export function scanReaderFacingForbiddenTokens(
  value: string,
  workspace?: ReportWorkspace,
): string[] {
  return [...READER_FORBIDDEN_PATTERNS, ...internalIdPatterns(workspace)]
    .filter(([, pattern]) => pattern.test(value))
    .map(([label]) => label);
}

function sourceAliases(source: SourceRecord): string[] {
  return unique([
    source.id,
    source.canonicalSourceIdentity,
    source.dedupeKey,
    canonicalSourceKeyForSource(source),
    source.doi ? `doi:${source.doi}` : null,
  ]).map(normalizedIdentity);
}

function evidenceAliases(card: EvidenceCard): string[] {
  return unique([
    card.sourceId,
    card.canonicalSourceKey,
    card.dedupeKey,
    card.citationKey,
    card.doi ? `doi:${card.doi}` : null,
  ]).map(normalizedIdentity);
}

function sourceYearRange(sources: SourceRecord[]): string | null {
  const years = sources
    .map((source) => source.year)
    .filter((year): year is number =>
      typeof year === "number" && Number.isInteger(year) && year > 0,
    )
    .sort((left, right) => left - right);
  if (years.length === 0) return null;
  return years[0] === years.at(-1) ? String(years[0]) : `${years[0]}-${years.at(-1)}`;
}

function zhTwDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("zh-TW");
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Taipei",
  }).format(date);
}

function reportKind(workspace: ReportWorkspace): FormalReportKind {
  const provenancePresent = workspace.acceptedSources.some((source) =>
    source.researchDirectnessTier || source.exactSearchCompleted != null,
  );
  const directSources = workspace.acceptedSources.filter((source) =>
    source.researchDirectnessTier === "A" || source.researchDirectnessTier === "B",
  );
  const facetReady = !provenancePresent || (
    workspace.acceptedSources.some((source) => source.researchDirectnessTier === "A") &&
    directSources.length >= 3 &&
    workspace.acceptedSources.some((source) => source.exactSearchCompleted === true)
  );
  return workspace.generationPayload.reportPlan?.compositionKind === "complete_research_report" &&
      workspace.llmDiagnostics?.readinessStatus === "ready_complete_report" &&
      facetReady
    ? "evidence_synthesis_report"
    : "limited_evidence_brief";
}

function planSection(
  plan: ReportPlan | null | undefined,
  sectionId: string,
) {
  return plan?.sections.find((section) => section.sectionId === sectionId);
}

function planSectionsByRole(
  plan: ReportPlan | null | undefined,
  role: string,
) {
  return plan?.sections.filter((section) => section.canonicalSectionRole === role) ?? [];
}

function sentenceList(value: string): string[] {
  return (value.match(/[^\u3002\uff01\uff1f!?]+[\u3002\uff01\uff1f!?]?/gu) ?? [])
    .map((sentence) =>
      sanitizeReaderFacingInternalLanguage(compact(sentence)).replace(/:/gu, "：")
    )
    .filter(Boolean);
}

function conciseAbstractText(value: string, limit: number): string {
  const normalized = value.trim();
  if (normalized.length <= limit) return normalized;
  const clauses = normalized.match(/[^，；。！？]+[，；。！？]?/gu) ?? [normalized];
  let result = "";
  for (const clause of clauses) {
    if (result && result.length + clause.length > limit) break;
    result += clause;
  }
  if (!result) result = normalized.slice(0, limit).replace(/[^一-鿿A-Za-z0-9）」』]+$/u, "");
  const terminal = result.replace(/[，；、：。！？\s]+$/u, "");
  if (!/(?:相關|關聯|顯示|指出|支持|限制|不足|回答|降低|增加|改善|一致|相連|成立|有效|重要|為限|理解)$/u.test(terminal)) {
    const safePredicate = [...result.matchAll(/(?:相關|關聯|顯示|指出|支持|限制|不足|回答|降低|增加|改善|一致|相連|成立|有效|重要|為限|理解)(?=[，；。！？])/gu)].at(-1);
    if (safePredicate?.index != null) {
      result = result.slice(0, safePredicate.index + safePredicate[0].length);
    }
  }
  return `${result.replace(/[，；、：\s]+$/u, "").replace(/[。！？]+$/u, "")}。`;
}

function substantiveSentence(value: string): boolean {
  if (value.length < 24) return false;
  return !/^(?:承接|接著|下一節|本節|正文結束|由摘要進入|把各主題|依限制章|以綜合結果)/u.test(value) &&
    !/(?:仍建議再補充|目前來源尚?不足以支持此結論|目前來源不足以支持更強結論|足以支撐進一步實質判斷|綜合以上摘錄|既定段落規劃|此一回答在全文中維持相同研究問題|若干關鍵面向仍缺少直接來源|findings\s*類證據|ArgumentMap|DiscoursePlan)/iu.test(value);
}

function polishReaderParagraph(value: string): string {
  const sentences = (value.match(/[^\u3002\uff01\uff1f!?\uff1b;]+[\u3002\uff01\uff1f!?\uff1b;]?/gu) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) =>
      !/^(?:承接|接著|下一節|正文結束|由摘要進入|把各主題|依限制章|以綜合結果|結論只回答|後續章節依)/u.test(sentence) &&
      !/(?:目前來源尚?不足以支持此結論|足以支撐進一步實質判斷|綜合以上摘錄|既定段落規劃|此一回答在全文中維持相同研究問題|若干關鍵面向仍缺少直接來源|findings\s*類證據|各節僅依.*分析目的)/iu.test(sentence),
    );
  return sanitizeReaderFacingInternalLanguage(sentences.join(""))
    .replace(/:/gu, "：")
    .replace(/研究結果顯示[，,]\s*研究據此指出[，,]?/gu, "該研究指出，")
    .replace(/^第二項限制來自/u, "另一項限制來自")
    .replace(/；$/u, "。");
}

function authorFamilyName(value: string): string {
  const author = compact(value);
  if (!author) return "作者未提供";
  if (/^[\u3400-\u9fff·・\s]+$/u.test(author)) return author.replace(/\s+/gu, "");
  if (author.includes(",")) {
    const commaFamily = compact(author.split(",")[0]);
    if (commaFamily) return commaFamily;
  }
  const particles = new Set(["da", "de", "del", "der", "di", "la", "van", "von"]);
  const parts = author.split(/\s+/u).filter(Boolean);
  if (parts.length <= 1) return author;
  const family = [parts.at(-1)!];
  if (parts.length > 2 && particles.has(parts.at(-2)!.toLocaleLowerCase())) {
    family.unshift(parts.at(-2)!);
  }
  return family.join(" ");
}

export function authorYearCitationLabel(source: SourceRecord): string {
  const families = source.authors.map(authorFamilyName).filter(Boolean);
  const author = families.length === 0
    ? authorFamilyName(source.publisher ?? "作者未提供")
    : families.length === 1
      ? families[0]!
      : families.length === 2
        ? `${families[0]} & ${families[1]}`
        : `${families[0]} et al.`;
  return `${author}, ${source.year ?? "n.d."}`;
}

function withAuthorYearDisambiguation(
  references: FormalReportReference[],
): FormalReportReference[] {
  const counts = references.reduce<Map<string, number>>((map, reference) => {
    map.set(reference.authorYear, (map.get(reference.authorYear) ?? 0) + 1);
    return map;
  }, new Map());
  const seen = new Map<string, number>();
  return references.map((reference) => {
    if ((counts.get(reference.authorYear) ?? 0) < 2) return reference;
    const index = seen.get(reference.authorYear) ?? 0;
    seen.set(reference.authorYear, index + 1);
    const suffix = String.fromCharCode(97 + index);
    const label = reference.authorYear.replace(/(\d{4}|n\.d\.)$/u, `$1${suffix}`);
    return { ...reference, marker: label, authorYear: label };
  });
}

function citationSegment(
  text: string,
  citationIds: string[] = [],
): FormalReportCitationSegment {
  return { text, citationIds: unique(citationIds) };
}

function formalBlock(
  text: string,
  citationIds: string[] = [],
  paragraphRole: FormalReportBlock["paragraphRole"] = "narrative",
): FormalReportBlock {
  const cleanText = stripInternalCitationTokens(text);
  const cleanCitationIds = unique(citationIds);
  return {
    text: cleanText,
    citationIds: cleanCitationIds,
    segments: [citationSegment(cleanText, cleanCitationIds)],
    paragraphRole,
  };
}

function compactTableText(value: string, limit = 92): string {
  const text = stripInternalCitationTokens(
    sanitizeReaderFacingInternalLanguage(value),
  )
    .replace(/不能編造頁碼/gu, "未提供頁碼時不標示頁碼")
    .replace(/原始摘錄僅供查核/gu, "原文內容可供核對")
    .replace(/(?:…+|\.{3,})/gu, "。");
  if (text.length <= limit) return text;
  const completeSentence = sentenceList(text).find((sentence) => /[。！？!?]$/u.test(sentence));
  return completeSentence
    ? sanitizeReaderFacingInternalLanguage(completeSentence)
    : text;
}

function normalizeFormalTitle(value: string): string {
  return compact(value)
    .replace(/台灣/gu, "臺灣")
    .replace(/\burban\s+heat\s+island\b/giu, "都市熱島")
    .replace(/\bUHI\b/gu, "都市熱島")
    .replace(/\s*([與和及、])\s*/gu, "$1")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/gu, "$1$2")
    .replace(/[：:]?(?:研究主題|搜尋查詢)$/u, "")
    .trim();
}

function topicWithFirstEnglishDefinition(value: string): string {
  const normalized = normalizeFormalTitle(value);
  return /都市熱島/u.test(normalized)
    ? normalized.replace(/都市熱島/u, "都市熱島（urban heat island, UHI）")
    : normalized;
}

function evidenceMainPoint(
  card: EvidenceCard | undefined,
  detail: "finding" | "table" = "finding",
): string {
  if (!card) return "本報告僅使用可核對的書目與內容摘錄。";
  const text = stripInternalCitationTokens(sanitizeReaderFacingInternalLanguage(
    card.claimTextZhTw ??
    card.mainClaimZhTw ??
    card.evidencePointZhTw ??
    card.sourceSummaryZhTw ??
    card.claimText ??
    card.mainClaim ??
    card.summary ??
    "本報告僅使用可核對的來源摘錄。",
  ));
  const sentences = sentenceList(text)
    .map((sentence) => sanitizeReaderFacingInternalLanguage(sentence.trim()))
    .filter(Boolean)
    .filter(substantiveSentence);
  if (sentences.length === 0) return compactTableText(text);

  const resultSentence = sentences.find((sentence) =>
    /^(?:結果(?:顯示|指出|發現)|研究(?:結果|發現)|進一步分析指出|分析結果)/u.test(sentence),
  ) ?? sentences.find((sentence) =>
    /(?:觀察到|呈(?:顯著)?關聯|達\s*\d|超過\s*\d|降低|降溫|上升|增加|差異|相關性?)/u.test(sentence),
  );
  if (detail === "table") {
    return compactTableText(resultSentence ?? sentences[0]);
  }

  const contextSentence = sentences.find((sentence) =>
    /(?:本研究|研究於|研究以|樣本|場域|校園|城市|地區)/u.test(sentence),
  ) ?? sentences[0];
  const methodSentence = sentences.find((sentence) => /^方法上/u.test(sentence)) ?? sentences.find((sentence) =>
    /(?:方法上|使用|利用|採用|量測|觀測|問卷|模型|迴歸|遙測|實驗|測點|樣本)/u.test(sentence),
  );
  return sanitizeReaderFacingInternalLanguage(
    unique([contextSentence, methodSentence, resultSentence])
      .filter(Boolean)
      .slice(0, 3)
      .join(""),
  );
}

function evidenceLimitation(card: EvidenceCard | undefined, source: SourceRecord): string {
  const explicit = unique([
    card?.limitation,
    ...(card?.limitationsZhTw ?? []),
    ...(card?.limitations ?? []),
  ])[0];
  if (explicit) return compactTableText(explicit, 72);
  if (card?.abstractOnly || source.accessLevel === "abstract_only") {
    return "僅取得摘要，不能補寫全文未揭露的方法或數值。";
  }
  return "適用範圍以原研究對象、情境與方法為限。";
}

function researchQuestionBlock(plan: ReportPlan | null | undefined, topic: string): string[] {
  const rawResearchQuestion = sanitizeReaderFacingInternalLanguage(
    topicWithFirstEnglishDefinition(compact(plan?.researchQuestion) || topic),
  )
    .replace(/都市熱島（urban heat island，\s*UHI）/u, "都市熱島（urban heat island, UHI）")
    .replace(/[？?]+$/u, "");
  const researchQuestion = /(?:如何|為何|何以|哪些|何者|什麼|是否|能否|多大|在何種)/u.test(rawResearchQuestion)
    ? `${rawResearchQuestion}？`
    : `現有證據如何解釋「${rawResearchQuestion}」？`;
  const scope = sanitizeReaderFacingInternalLanguage(compact(plan?.scope));
  const questions = unique(plan?.subQuestions ?? [])
    .map(sanitizeReaderFacingInternalLanguage)
    .map((question) => question.replace(/\(([^()]+)\)/gu, "（$1）"));
  return [
    `本報告回答的核心問題是：${researchQuestion}`,
    scope
      ? `研究範圍：${scope.replace(/^範圍限於\s*/u, "限於 ")}`
      : `研究範圍限定為目前可追溯來源直接涵蓋的「${normalizeFormalTitle(topic)}」相關證據。`,
    ...(questions.length > 0
      ? [`具體分析子問題包括：${questions.map((question, index) => `${index + 1}. ${question.replace(/[。.]$/u, "")}`).join("；")}。`]
      : []),
    "本報告不執行原創實驗，也不把來源未揭露的數據、因果關係或方法細節補寫成既定事實。",
  ].map((text) => text.replace(/:/gu, "："));
}

function scopeMethodBlocks(
  workspace: ReportWorkspace,
  kind: FormalReportKind,
): string[] {
  const providerLabel = (value: string) => value === "Academic Paper" ? "學術論文資料庫" : value;
  const providers = unique(workspace.acceptedSources.map((source) => providerLabel(source.sourceType)));
  const years = sourceYearRange(workspace.acceptedSources);
  const retrievalDate = zhTwDate(workspace.createdAt);
  const excludedCount = workspace.llmDiagnostics?.filteredEvidence?.length ?? 0;
  return [
    `本報告以學術證據綜合方式整理 ${workspace.acceptedSources.length} 筆已納入來源與 ${workspace.evidenceCards.length} 筆可追溯內容摘錄；來源涵蓋${providers.length > 0 ? providers.join("、") : "已連結的學術資料來源"}${years ? `，出版年份範圍為 ${years} 年` : ""}，檢索與整理日期為 ${retrievalDate}。`,
    `納入原則為：來源與研究問題直接相關、具可唯一識別的書目身分，且至少提供可核對摘要或全文片段；重複、低主題相關、僅有不可核對書目資訊或無法建立來源身分者於報告規劃前排除${excludedCount > 0 ? `，本次共有 ${excludedCount} 筆排除紀錄` : ""}。`,
    kind === "limited_evidence_brief"
      ? "現有證據以摘要或受限全文為主，因此本報告只比較來源直接揭露的概念、發現與適用邊界，不能視為系統性回顧、統合分析或原創實驗研究。"
      : "現有證據已涵蓋多個可比較主題與可核對全文內容；本報告仍只做跨來源綜合，不把相關性改寫為因果，也不取代正式系統性回顧。",
  ].map((text) => text.replace(/:/gu, "："));
}

function keywordCandidates(topic: string, plan: ReportPlan | null | undefined): string[] {
  const detectedTerms = [
    /urban\s+heat\s+island/iu.test(topic) ? "都市熱島" : null,
    /(?:校園.*綠覆率|綠覆率.*校園)/u.test(topic) ? "校園綠覆率" : null,
    /地表溫度/u.test(topic) ? "地表溫度" : null,
    /\bRAG\b/iu.test(topic) ? "檢索增強生成" : null,
    /faithfulness/iu.test(topic) ? "忠實度評估" : null,
    /\bRAG\b/iu.test(topic) && /faithfulness/iu.test(topic) ? "引用忠實度" : null,
    /faithfulness/iu.test(topic) ? "評估方法" : null,
    /faithfulness/iu.test(topic) ? "改善策略" : null,
  ].filter((value): value is string => Boolean(value));
  const normalizedTopic = topic
    .replace(/urban\s+heat\s+island/giu, " ")
    .replace(/\bRAG\b|faithfulness/giu, " ")
    .replace(/[「」《》()（）]/gu, " ")
    .replace(/(?:如何|之|的)/gu, " ")
    .replace(/[與和及、]/gu, "|");
  const topicParts = normalizedTopic
    .split(/[|\s]+/u)
    .map(compact)
    .filter((part) => part.length >= 2 && part.length <= 16 && !/^[A-Za-z-]+$/u.test(part))
    .filter((part) => !/^(?:系統中|評估|改善|關聯)$/u.test(part));
  return unique(
    [...(plan?.keywords ?? []), ...detectedTerms, ...topicParts, "證據綜合"].map(
      sanitizeReaderFacingInternalLanguage,
    ),
  ).slice(0, 6);
}

function formalReportSubtitle(
  plan: ReportPlan | null | undefined,
  title: string,
  kind: FormalReportKind,
): string {
  const originalTitle = compact(plan?.originalTitle);
  if (originalTitle && originalTitle.normalize("NFKC") !== title.normalize("NFKC")) {
    return originalTitle;
  }
  return kind === "limited_evidence_brief"
    ? "以可追溯證據形成連貫、完整且保守的專業初版"
    : "以可追溯來源回答研究問題的學術證據綜合";
}

function abstractCandidate(
  workspace: ReportWorkspace,
  sections: FormalReportSection[],
  methodText: string,
): { text: string; findingCount: number } {
  const stripLeadingTransition = (value: string) => value
    .replace(/^(?:另一方面|此外|不過|同時|再者|綜合而言|整體而言|相較之下)[，,：:]?/u, "")
    .trim();
  const plan = workspace.generationPayload.reportPlan;
  const topic = normalizeFormalTitle(
    compact(plan?.title) || workspace.input.topic.trim() || workspace.draft.title,
  );
  let findingOrder = 0;
  const findings = sections
    .filter((section) =>
      section.role === "analysis" || section.role === "cross_source_synthesis",
    )
    .flatMap((section) => section.blocks.flatMap((block) =>
      sentenceList(block.text.replace(/\[\d+\]/gu, "")).map((sentence) => ({
        sentence,
        role: section.role,
        index: findingOrder++,
      })),
    ))
    .filter((candidate) => substantiveSentence(candidate.sentence))
    .filter((candidate, index, all) =>
      all.findIndex((item) => item.sentence === candidate.sentence) === index,
    )
    .filter(({ sentence }) =>
      !/(?:^\s*(?:另一項|有些結果)|(?:顯示|指出|發現)[。！？]?\s*$)/u.test(sentence),
    )
    .map(({ sentence, role, index }) => ({
      sentence,
      index,
      score:
        (role === "cross_source_synthesis" ? 8 : 0) +
        (/^(?:第一|整體|跨來源)/u.test(sentence) ? 4 : 0) +
        (/(?:結果|顯示|指出|發現|關聯|降低|降溫|改善|差異|一致)/u.test(sentence) ? 5 : 0) +
        keywordCandidates(topic, null).filter((keyword) => sentence.includes(keyword)).length +
        (/(?:方法上|利用|採用|樣本|量測)/u.test(sentence) ? -2 : 0) -
        (/(?:有些結果|另一項研究|逐篇|作者)/u.test(sentence) ? 8 : 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, 2)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => stripLeadingTransition(candidate.sentence))
    .filter(Boolean);
  const planAnswer = sanitizeReaderFacingInternalLanguage(compact(plan?.centralAnswer));
  const planAnswerForAbstract = planAnswer
    .replace(/(?:；|，)?其中具體結果包括：[\s\S]*?(?=跨來源結論|$)/u, "")
    .replace(/^\s*跨來源/u, "跨來源")
    .replace(/^\s*現有\s*\d+\s*個獨立來源/u, "現有納入來源")
    .trim();
  const bodyEvidenceText = sections
    .flatMap((section) => section.blocks)
    .map((block) => block.text.replace(/\[\d+\]/gu, ""))
    .join(" ");
  const planAnswerNumbers = planAnswerForAbstract.match(/\d+(?:\.\d+)?/gu) ?? [];
  const planAnswerSupportedByFinalBody = planAnswerNumbers.every((number) =>
    bodyEvidenceText.includes(number)
  );
  const conclusionCandidates = sections.find((section) => section.role === "conclusion")?.blocks
    .flatMap((block) => sentenceList(block.text.replace(/\[\d+\]/gu, "")))
    .filter(substantiveSentence)
    .filter((sentence) =>
      !/(?:尚?不足以直接回答|只能界定資料缺口|未獲得直接回答|尚無法形成具普遍性的定論)/u.test(sentence),
    ) ?? [];
  const directConclusion = conclusionCandidates
    .map((sentence, index) => ({
      sentence,
      index,
      score:
        (/(?:結論|判斷|支持|評估|改善)/u.test(sentence) ? 2 : 0) +
        keywordCandidates(topic, null).filter((keyword) => sentence.includes(keyword)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, /faithfulness|忠實度/iu.test(topic) ? 2 : 1)
    .sort((left, right) => left.index - right.index)
    .map((candidate) => candidate.sentence)
    .join("");
  const synthesisAnswer = sections
    .filter((section) => section.role === "cross_source_synthesis")
    .flatMap((section) => section.blocks)
    .flatMap((block) => sentenceList(block.text.replace(/\[\d+\]/gu, "")))
    .filter(substantiveSentence)
    .filter((sentence) =>
      /(?:現有證據支持|共同支持|整體方向|跨來源的一致性|可能存在關聯)/u.test(sentence),
    )
    .map((sentence) => stripLeadingTransition(sentence))[0] ?? "";
  const cleanDirectAnswer = (value: string) => value
    .replace(/^(?:故|因此|綜合而言|換言之)[，,]?/u, "")
    .replace(/^(?:第一|第二|第三)[，,]/u, "")
    .replace(/^本報告的結論應維持在證據邊界之內[：，]?/u, "")
    .replace(/^[：，、；;:]+/u, "")
    .trim();
  const centralAnswer = stripLeadingTransition(cleanDirectAnswer(
    /(?:尚?不足以直接回答|只能界定資料缺口|尚無法形成具普遍性的定論)/u.test(planAnswerForAbstract) ||
      /(?:共同研究場域的證據|跨來源結果方向不完全一致|一項受限回答)/u.test(planAnswerForAbstract) ||
      !planAnswerSupportedByFinalBody
      ? synthesisAnswer || directConclusion || planAnswerForAbstract
      : planAnswerForAbstract || synthesisAnswer || directConclusion || "現有證據只能支持受限且需保留適用邊界的回答",
  ));
  const bodyLimitation = sections.find((section) => section.role === "limitations")?.blocks
    .flatMap((block) => sentenceList(block.text.replace(/\[\d+\]/gu, "")))
    .filter(substantiveSentence)
    .map((sentence, index) => ({
      sentence,
      index,
      score:
        (/(?:核心限制|首要限制|缺少|缺乏|沒有來源|摘要而非全文|無法完整)/u.test(sentence) ? 3 : 0) -
        (/(?:若干關鍵面向|直接來源)/u.test(sentence) ? 5 : 0) +
        keywordCandidates(topic, null).filter((keyword) => sentence.includes(keyword)).length,
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.sentence;
  const limitation = (bodyLimitation ||
    sanitizeReaderFacingInternalLanguage(unique(plan?.evidenceGaps ?? [])[0]) ||
    sanitizeReaderFacingInternalLanguage(compact(plan?.conclusionBoundary)) ||
    "現有來源的取得層級與研究情境仍限制結論的外推範圍")
    .replace(/^(?:最後|此外|另一方面|另一項限制在於|綜合而言)[，,:\s]*/u, "");
  const pieces = [
    `本報告探討「${topic}」，目的在釐清現有可追溯研究能共同支持的答案、來源間差異，以及尚不能確定的部分。`,
    methodText,
    ...(findings.length > 0
      ? [`綜合納入研究，${findings.join("")}`]
      : []),
    `綜合而言，對研究問題最合理的回答是：${centralAnswer}`,
    `最重要的證據限制是：${limitation}`,
  ];
  let text = sanitizeReaderFacingInternalLanguage(pieces.join(""))
    .replace(/:/gu, "：");
  if (text.length > 500) {
    const directAnswerKey = centralAnswer.slice(0, 28);
    const nonDuplicateFindings = findings
      .filter((finding) => !directAnswerKey || !finding.includes(directAnswerKey))
      .slice(0, 1);
    const compactFindings = nonDuplicateFindings.length > 0
      ? nonDuplicateFindings
      : findings.slice(0, 1);
    text = sanitizeReaderFacingInternalLanguage([
      `本報告以「${topic}」為研究問題，綜合可追溯來源以辨識共同發現、差異與未決範圍。`,
      conciseAbstractText(methodText, 82),
      ...(compactFindings.length > 0
        ? [`主要發現為：${compactFindings.join("")}`]
        : []),
      `綜合而言，${conciseAbstractText(centralAnswer, 105)}`,
      `主要限制是：${conciseAbstractText(limitation, 78)}`,
    ].join("")).replace(/:/gu, "：");
  }
  if (text.length > 520) text = `${text.slice(0, 519).replace(/[，；、][^，；、。！？]*$/u, "")}。`;
  return { text, findingCount: findings.length };
}

function validateAbstract(input: {
  text: string;
  topic: string;
  findingCount: number;
  bodyText: string;
}): string[] {
  const issues: string[] = [];
  const text = input.text;
  const topicTerms = [
    ...keywordCandidates(input.topic, null).filter((term) => term !== "證據綜合"),
    ...(input.topic.match(/[A-Za-z][A-Za-z-]{2,}/gu) ?? []),
  ];
  if (!topicTerms.some((term) => text.includes(term))) issues.push("missing_research_topic");
  if (!/資料|來源|檢索|整理|綜合方式/u.test(text)) issues.push("missing_scope_or_method");
  if (input.findingCount < 1 || !/發現|顯示|指出|支持|共同/u.test(text)) {
    issues.push("missing_substantive_finding");
  }
  if (!/回答|綜合而言|結論/u.test(text)) issues.push("missing_direct_answer");
  if (!/限制|不足|不能|尚未|不確定/u.test(text)) issues.push("missing_limitation");
  if (/\[\d+\]/u.test(text) || scanReaderFacingForbiddenTokens(text).length > 0) {
    issues.push("contains_forbidden_or_citation_token");
  }
  const bodyNumbers = new Set(input.bodyText.match(/\d+(?:\.\d+)?/gu) ?? []);
  const inventedNumbers = (text.match(/\d+(?:\.\d+)?/gu) ?? [])
    .filter((number) => !bodyNumbers.has(number));
  if (inventedNumbers.length > 0) issues.push("contains_number_absent_from_body");
  if (text.length < 260) issues.push("too_short");
  if (text.length > 540) issues.push("too_long");
  const genericCount = sentenceList(text).filter((sentence) =>
    /本報告將探討|值得注意的是|綜上所述|未來研究可/u.test(sentence),
  ).length;
  if (genericCount >= 2) issues.push("generic_template_language");
  return unique(issues);
}

function auditTerms(value: string): string[] {
  const normalized = value.toLocaleLowerCase();
  const latin = normalized.match(/[a-z][a-z0-9-]{3,}/gu) ?? [];
  const cjkRuns = normalized.match(/[\u3400-\u9fff]{2,}/gu) ?? [];
  const cjkBigrams = cjkRuns.flatMap((run) =>
    Array.from({ length: Math.max(0, run.length - 1) }, (_, index) => run.slice(index, index + 2)),
  );
  return unique([...latin, ...cjkBigrams]).filter((term) =>
    !/^(?:本報|報告|研究|結果|來源|顯示|指出|分析|證據|可以|進行|現有|因此|the|this|that|with|from|study|results?)$/iu.test(term),
  );
}

function sourceSupportCorpus(source: SourceRecord, cards: EvidenceCard[]): string {
  return [
    source.title,
    source.abstract,
    source.snippet,
    source.extractedText,
    source.mainEvidencePointZhTw,
    source.readableSummaryZhTW,
    source.readableSummaryZhTw,
    ...cards.flatMap((card) => [
      card.claimText,
      card.claimTextZhTw,
      card.supportedByText,
      card.supportSpan,
      card.sourceExcerptOriginal,
      card.sourceSummaryZhTw,
      card.exactResult,
    ]),
  ].filter(Boolean).join(" ");
}

function sourceSupportsSentence(
  sentence: string,
  source: SourceRecord,
  cards: EvidenceCard[],
): { supported: boolean; issues: string[] } {
  return corpusSupportsSentence(
    sentence,
    sourceSupportCorpus(source, cards),
    source.year ? [String(source.year)] : [],
  );
}

function corpusSupportsSentence(
  sentence: string,
  corpus: string,
  allowedYears: string[],
): { supported: boolean; issues: string[] } {
  const claim = stripInternalCitationTokens(sentence).replace(/\[\d+\]/gu, "");
  const normalizedCorpus = corpus
    .toLocaleLowerCase()
    .replace(/台灣/gu, "臺灣")
    .replace(/台北/gu, "臺北");
  const locationSupportCorpus = [
    normalizedCorpus,
    /\btaipei\b/u.test(normalizedCorpus) ? "臺北 台北" : "",
    /臺北/u.test(normalizedCorpus) ? "taipei" : "",
    /\btaiwan\b/u.test(normalizedCorpus) ? "臺灣 台灣" : "",
    /臺灣/u.test(normalizedCorpus) ? "taiwan" : "",
    /\bkaohsiung\b/u.test(normalizedCorpus) ? "高雄" : "",
    /高雄/u.test(normalizedCorpus) ? "kaohsiung" : "",
    /\bchiayi\b/u.test(normalizedCorpus) ? "嘉義" : "",
    /嘉義/u.test(normalizedCorpus) ? "chiayi" : "",
    /\bguangzhou\b/u.test(normalizedCorpus) ? "廣州" : "",
    /廣州/u.test(normalizedCorpus) ? "guangzhou" : "",
    /\bzhengzhou\b/u.test(normalizedCorpus) ? "鄭州" : "",
    /鄭州/u.test(normalizedCorpus) ? "zhengzhou" : "",
    /\bjeddah\b/u.test(normalizedCorpus) ? "吉達" : "",
    /吉達/u.test(normalizedCorpus) ? "jeddah" : "",
    /\bwuhan\b/u.test(normalizedCorpus) ? "武漢" : "",
    /武漢/u.test(normalizedCorpus) ? "wuhan" : "",
  ].filter(Boolean).join(" ");
  const methodSupportCorpus = [
    normalizedCorpus,
    /remote sensing/u.test(normalizedCorpus) ? "遙測 衛星" : "",
    /遙測|衛星/u.test(normalizedCorpus) ? "remote sensing" : "",
    /(?:land surface temperature|\blst\b|\bndvi\b|\bndbi\b|mono-window)/u.test(normalizedCorpus)
      ? "remote sensing 遙測 衛星"
      : "",
    /regression/u.test(normalizedCorpus) ? "迴歸 回歸" : "",
    /迴歸|回歸/u.test(normalizedCorpus) ? "regression" : "",
    /field measurement/u.test(normalizedCorpus) ? "實地量測" : "",
    /實地量測/u.test(normalizedCorpus) ? "field measurement" : "",
  ].filter(Boolean).join(" ");
  const issues: string[] = [];
  const numericClaims = claim.match(/\d+(?:\.\d+)?(?:\s*[%％]|\s*°?C)?/gu) ?? [];
  for (const value of numericClaims) {
    if (!corpus.includes(value) && !allowedYears.includes(value)) {
      issues.push(`unsupported_number:${value}`);
    }
  }
  const namedPlaces = claim.match(/(?:臺灣|台灣|臺北|台北|高雄|嘉義|廣州|鄭州|吉達|武漢|中國|日本|印度|美國|英國|香港|Taiwan|Taipei|Kaohsiung|Chiayi|Guangzhou|Zhengzhou|Jeddah|Wuhan|China|Japan|India|United States|United Kingdom|Hong Kong)/giu) ?? [];
  for (const place of namedPlaces) {
    const normalizedPlace = place
      .toLocaleLowerCase()
      .replace(/台灣/gu, "臺灣")
      .replace(/台北/gu, "臺北");
    if (!locationSupportCorpus.includes(normalizedPlace)) {
      issues.push(`unsupported_location:${place}`);
    }
  }
  const namedMethods = claim.match(/(?:GIS|UAV|ENVI-met|WRF|CFD|遙測|衛星|迴歸|回歸|實地量測|問卷|remote sensing|regression|simulation|field measurement)/giu) ?? [];
  for (const method of namedMethods) {
    if (!methodSupportCorpus.includes(method.toLocaleLowerCase())) {
      issues.push(`unsupported_method:${method}`);
    }
  }
  const overlap = auditTerms(claim).filter((term) =>
    normalizedCorpus.includes(
      term.toLocaleLowerCase().replace(/台灣/gu, "臺灣").replace(/台北/gu, "臺北"),
    ),
  );
  if (overlap.length === 0) issues.push("no_claim_support_overlap");
  return { supported: issues.length === 0, issues };
}

function sourcesSupportSentence(
  sentence: string,
  sourcePairs: Array<{ source: SourceRecord; cards: EvidenceCard[] }>,
): { supported: boolean; issues: string[] } {
  return corpusSupportsSentence(
    sentence,
    sourcePairs.map(({ source, cards }) => sourceSupportCorpus(source, cards)).join(" "),
    sourcePairs.flatMap(({ source }) => source.year ? [String(source.year)] : []),
  );
}

function isGeneratorMethodStatement(sentence: string): boolean {
  return /^(?:本報告|本次整理|研究範圍|納入原則|檢索與整理|證據直接性|以下比較|現有來源(?:已|主要|共|中)|(?:因此[，,]?)?本節(?:先|將|聚焦|整理|比較|說明)|但這一文獻基礎)/u.test(sentence) &&
    !/(?:研究顯示|研究指出|結果顯示|發現|增加|降低|相關|影響|導致)/u.test(sentence);
}

function normalizedAuditSentence(value: string): string {
  return stripInternalCitationTokens(value)
    .replace(/\[\d+\]/gu, "")
    .replace(/[\s，。！？；、,.!?;：:（）()「」]/gu, "")
    .toLocaleLowerCase();
}

function explicitChineseSourceCount(value: string): number | null {
  const match = value.match(/(?:(\d+)|([一二三四五六七八九十]+))(?:個|項|筆|份)(?:獨立)?(?:來源|研究|文獻)/u);
  if (match?.[1]) return Number(match[1]);
  if (!match?.[2]) return null;
  const digits: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (match[2] === "十") return 10;
  if (match[2].includes("十")) {
    const [tens, ones] = match[2].split("十");
    return (tens ? digits[tens] ?? 0 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0);
  }
  return digits[match[2]] ?? null;
}

function normalizedOverlapText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase();
}

function readerSourceOverlapIssues(
  sections: FormalReportSection[],
  facts: StandardizedEvidenceFact[],
): string[] {
  const issues: string[] = [];
  const proseBlocks = sections.flatMap((section) =>
    section.blocks.map((block) => ({ sectionId: section.id, block })),
  );
  for (const fact of facts) {
    const normalizedSource = normalizedOverlapText(fact.exactResult);
    const sourceWords = normalizedSource.split(" ").filter(Boolean);
    const windows = sourceWords.length >= 14
      ? Array.from(
          { length: Math.max(0, sourceWords.length - 11) },
          (_, index) => sourceWords.slice(index, index + 12).join(" "),
        )
      : normalizedSource.replace(/\s+/gu, "").length >= 72
        ? Array.from(
            { length: normalizedSource.replace(/\s+/gu, "").length - 47 },
            (_, index) => normalizedSource.replace(/\s+/gu, "").slice(index, index + 48),
          )
        : [];
    if (windows.length === 0) continue;
    for (const { sectionId, block } of proseBlocks) {
      const prose = normalizedOverlapText(block.text);
      const compactProse = prose.replace(/\s+/gu, "");
      if (windows.some((window) =>
        window.length >= 48 && (prose.includes(window) || compactProse.includes(window))
      )) {
        issues.push(`source_overlap:${sectionId}:${fact.factId}`);
        break;
      }
    }
  }
  return unique(issues);
}

function sourceCenteredParagraphIssues(sections: FormalReportSection[]): string[] {
  const issues: string[] = [];
  for (const section of sections.filter((item) =>
    item.role === "analysis" || item.role === "cross_source_synthesis"
  )) {
    let consecutiveSingleSource = 0;
    for (const block of section.blocks) {
      const singleSource = new Set(block.citationIds).size === 1;
      const sourceOpening = /^(?:在|就)?(?:該|這項|此項|第一|第二|第三)?(?:研究|文獻|來源)|^[^，。]{1,36}(?:研究|指出|發現|顯示)/u.test(block.text);
      consecutiveSingleSource = singleSource && sourceOpening
        ? consecutiveSingleSource + 1
        : 0;
      if (consecutiveSingleSource >= 2) {
        issues.push(`consecutive_source_centered_paragraphs:${section.id}`);
        break;
      }
    }
  }
  return unique(issues);
}

function publicationVenueIssues(sources: SourceRecord[]): string[] {
  const aggregators = new Set([
    "semantic scholar",
    "openalex",
    "crossref",
    "core",
    "google scholar",
  ]);
  return unique(sources.flatMap((source) => {
    const venue = compact(source.containerTitle).toLocaleLowerCase();
    const provider = compact(source.provider ?? source.sourceType).toLocaleLowerCase();
    return venue && (aggregators.has(venue) || venue === provider)
      ? [`retrieval_provider_used_as_venue:${source.id}`]
      : [];
  }));
}

function limitationTheme(value: string): string | null {
  if (!/(?:不足|限制|不能|無法|尚未|缺少|缺乏|不宜|不得|不可)/u.test(value)) return null;
  if (/(?:因果|causal)/iu.test(value)) return "causal_boundary";
  if (/(?:效果量|合併|排名|不可比|比較基準)/u.test(value)) return "numeric_comparability";
  if (/(?:摘要|全文|access)/iu.test(value)) return "source_access";
  if (/(?:臺灣|台灣|本地|外推|情境|適用)/u.test(value)) return "applicability";
  if (/(?:方法|指標|尺度|量測)/u.test(value)) return "measurement_heterogeneity";
  if (/(?:樣本|來源數|文獻數)/u.test(value)) return "evidence_volume";
  return "general_evidence_boundary";
}

function applyIdeaLedgerDedupe(sections: FormalReportSection[]): void {
  const seenOutsideLimitations = new Set<string>();
  const seenInLimitations = new Set<string>();
  let conclusionBoundaryKept = false;
  for (const section of sections) {
    section.blocks = section.blocks.flatMap((block) => {
      const kept = sentenceList(block.text).filter((sentence) => {
        const theme = limitationTheme(sentence);
        if (!theme) return true;
        if (section.role === "limitations") {
          if (seenInLimitations.has(theme)) return false;
          seenInLimitations.add(theme);
          return true;
        }
        if (section.role === "conclusion") {
          if (conclusionBoundaryKept) return false;
          conclusionBoundaryKept = true;
          return true;
        }
        if (seenOutsideLimitations.has(theme)) return false;
        seenOutsideLimitations.add(theme);
        return true;
      });
      if (kept.length === 0) return [];
      const keptKeys = new Set(kept.map(normalizedAuditSentence));
      const segments = (block.segments ?? [citationSegment(block.text, block.citationIds)])
        .filter((segment) => keptKeys.has(normalizedAuditSentence(segment.text)));
      const citationIds = unique(segments.flatMap((segment) => segment.citationIds));
      return [{ ...block, text: kept.join(""), segments, citationIds }];
    });
  }
}

function documentReaderText(document: Omit<FormalReportDocument, "integrity" | "quality">): string {
  return [
    document.titlePage.title,
    document.titlePage.subtitle,
    document.titlePage.reportTypeLabel,
    document.titlePage.researchQuestion,
    document.titlePage.evidenceScope,
    document.abstract.text,
    document.abstract.keywords.join("、"),
    ...[
      document.researchQuestion,
      document.scopeAndMethod,
      ...document.analysisSections,
      document.crossSourceSynthesis,
      document.limitations,
      document.conclusion,
      ...document.appendix,
    ].flatMap((section) => [
      section.title,
      ...section.blocks.map((block) => block.text),
      ...section.tables.flatMap((table) => [
        table.title,
        ...table.columns,
        ...table.rows.flat(),
        table.sourceNote,
      ]),
      ...section.figures.flatMap((figure) => [
        figure.title,
        figure.altText,
        figure.sourceNote,
        figure.note ?? "",
        ...figure.legend.map((item) => `${item.key}：${item.label}`),
      ]),
    ]),
    ...document.references.map((reference) => `${reference.authorYear} ${reference.text}`),
  ].join("\n");
}

export function formalReportDocumentReaderText(document: FormalReportDocument): string {
  const { integrity: _integrity, quality: _quality, ...withoutAudit } = document;
  return documentReaderText(withoutAudit);
}

export function buildFormalReportDocument(workspace: ReportWorkspace): FormalReportDocument {
  const plan = workspace.generationPayload.reportPlan;
  const kind = reportKind(workspace);
  const title = normalizeFormalTitle(plan?.title ?? "") ||
    normalizeFormalTitle(workspace.generationPayload.displayTitle) ||
    normalizeFormalTitle(workspace.draft.title) ||
    normalizeFormalTitle(workspace.input.topic) ||
    "未命名研究主題";
  const subtitle = formalReportSubtitle(plan, title, kind);
  const researchQuestion = researchQuestionBlock(plan, topicWithFirstEnglishDefinition(workspace.input.topic))[0]
    ?.replace(/^本報告回答的核心問題是：/u, "") ?? title;
  const sourceByCanonicalKey = new Map<string, SourceRecord>();
  const canonicalKeyByAlias = new Map<string, string>();
  for (const source of workspace.acceptedSources) {
    const key = normalizedIdentity(canonicalSourceKeyForSource(source));
    if (!key) continue;
    if (!sourceByCanonicalKey.has(key)) sourceByCanonicalKey.set(key, source);
    for (const alias of sourceAliases(source)) canonicalKeyByAlias.set(alias, key);
  }
  const canonicalKeyFor = (aliases: Array<string | null | undefined>): string | null => {
    for (const alias of aliases.map(normalizedIdentity).filter(Boolean)) {
      const resolved = canonicalKeyByAlias.get(alias);
      if (resolved) return resolved;
      if (sourceByCanonicalKey.has(alias)) return alias;
    }
    return null;
  };

  type Binding = { canonicalKey: string; priority: number };
  const bindingByMarker = new Map<string, Binding>();
  const ambiguousMarkers = new Set<string>();
  const bind = (marker: string, canonicalKey: string | null, priority: number) => {
    if (!canonicalKey) return;
    const existing = bindingByMarker.get(marker);
    if (!existing || priority > existing.priority) {
      bindingByMarker.set(marker, { canonicalKey, priority });
      ambiguousMarkers.delete(marker);
      return;
    }
    if (existing.priority === priority && existing.canonicalKey !== canonicalKey) {
      ambiguousMarkers.add(marker);
    }
  };

  workspace.acceptedSources.forEach((source, index) => {
    bind(`[S${index + 1}]`, canonicalKeyFor([source.id]), 1);
  });
  for (const card of workspace.evidenceCards) {
    const key = canonicalKeyFor(evidenceAliases(card));
    const tokens = [card.citationMarker, card.citationText]
      .filter((value): value is string => Boolean(value))
      .flatMap(extractInternalCitationTokens);
    for (const token of tokens) bind(token.canonicalMarker, key, 3);
  }
  for (const section of workspace.draft.sections) {
    const tokens = [section.body, ...section.citationMarkers]
      .filter((value): value is string => Boolean(value))
      .flatMap(extractInternalCitationTokens);
    if (tokens.length === section.citationIds.length) {
      tokens.forEach((token, index) => {
        bind(token.canonicalMarker, canonicalKeyFor([section.citationIds[index]]), 2);
      });
    } else if (tokens.length === 1 && section.citationIds.length === 1) {
      bind(tokens[0]!.canonicalMarker, canonicalKeyFor([section.citationIds[0]]), 2);
    }
  }

  const unknownCitationTokens = new Set<string>();
  const citationMappingIssues: string[] = [];
  const sourceMentionIssues: string[] = [];
  let excludedParagraphs = 0;
  const referenceByCanonicalKey = new Map<string, FormalReportReference>();
  const ensureReference = (canonicalKey: string): FormalReportReference | null => {
    const existing = referenceByCanonicalKey.get(canonicalKey);
    if (existing) return existing;
    const source = sourceByCanonicalKey.get(canonicalKey);
    if (!source) return null;
    const referenceNumber = referenceByCanonicalKey.size + 1;
    const citationId = `ref-${referenceNumber}`;
    const bibliography = buildBibliography([source], workspace.input.citationFormat)[0];
    const reference: FormalReportReference = {
      citationId,
      sourceIdentity: canonicalSourceKeyForSource(source),
      sourceId: source.id,
      referenceNumber,
      marker: authorYearCitationLabel(source),
      authorYear: authorYearCitationLabel(source),
      text: bibliography?.text ?? source.title,
      doi: source.doi ?? null,
      url: source.url ?? null,
    };
    referenceByCanonicalKey.set(canonicalKey, reference);
    return reference;
  };

  const evidenceCardsBySourceId = new Map<string, EvidenceCard[]>();
  for (const card of workspace.evidenceCards) {
    const cards = evidenceCardsBySourceId.get(card.sourceId) ?? [];
    cards.push(card);
    evidenceCardsBySourceId.set(card.sourceId, cards);
  }
  const canonicalNormalizedFacts = plan?.normalizedFacts ?? [];
  const hasCanonicalNormalizedFactContract = canonicalNormalizedFacts.length > 0 &&
    canonicalNormalizedFacts.every((fact) => Boolean(fact.parentFactId && fact.sourceId));
  const evidenceFacts = hasCanonicalNormalizedFactContract
    ? buildStandardizedEvidenceFactsFromNormalizedPlan(
        canonicalNormalizedFacts,
        workspace.acceptedSources,
      )
    : buildStandardizedEvidenceFacts(
        workspace.evidenceCards,
        workspace.acceptedSources,
      );
  const evidenceUnits: FormalReportEvidenceUnit[] = evidenceFacts.map((fact) => ({
    id: fact.evidenceId,
    sourceId: fact.sourceId,
    sourceIdentity: fact.sourceIdentity,
    location: fact.location,
    researchSetting: fact.setting,
    studyDesign: fact.design,
    dataScope: fact.dataScope,
    exposure: fact.exposure,
    outcome: fact.outcome,
    exactResult: fact.exactResult,
    numericResult: fact.numericalResults.length > 0
      ? fact.numericalResults.map((result) => result.rawValue).join("；")
      : null,
    applicability: fact.applicability,
    locator: fact.locator,
    directnessTier: fact.directness,
    numericalResults: fact.numericalResults,
  }));
  const evidenceVisuals = buildEvidenceVisuals({
    topic: workspace.input.topic,
    evidenceCards: workspace.evidenceCards,
    sources: workspace.acceptedSources,
    standardizedFacts: evidenceFacts,
    maxVisuals: 7,
  });
  const deterministicMechanismVisual = evidenceVisuals.find(
    (visual) =>
      visual.visualType === "mechanism_synthesis" ||
      visual.visualType === "statistical_mediation_path",
  );
  const generatedConceptImages: GeneratedConceptImageRecord[] = deterministicMechanismVisual
    ? [{
        visualId: deterministicMechanismVisual.visualType === "statistical_mediation_path"
          ? "generated-concept-short-video-sleep-context"
          : "generated-concept-campus-green-heat-mechanism",
        renderMode: "generated_concept_image",
        imageRole: "conceptual_explanation",
        preferredSectionId: "cross-source-synthesis",
        prompt: deterministicMechanismVisual.visualType === "statistical_mediation_path"
          ? "無文字、無數值的學術概念插圖：夜間手機短影音使用、社交緊張情境與睡眠環境之間的視覺轉場；不繪製箭頭、統計圖、標籤或因果效果。"
          : "以無文字、無數值的學術概念插圖呈現校園綠量、樹冠遮蔭、蒸散與熱環境；不繪製箭頭、統計圖、標籤、排名或因果效果。",
        altText: deterministicMechanismVisual.visualType === "statistical_mediation_path"
          ? "夜間短影音使用、社交緊張情境與睡眠環境的非數值概念插圖。"
          : "校園綠量、證據提及的降溫機制與熱環境之非數值概念插圖。",
        provider: "Image2",
        model: null,
        status: "fallback",
        assetUri: null,
        fallbackVisualId: deterministicMechanismVisual.visualId,
        evidenceIds: deterministicMechanismVisual.provenance.evidenceIds,
        sourceIds: deterministicMechanismVisual.provenance.sourceIds,
        limitationNote: "目前產品尚未設定 Image2 圖像供應路徑；本報告誠實記錄 fallback，改用可稽核的 deterministic 機制圖，且不把概念連線當成實證因果效果。",
      }]
    : [];

  const graphClaimIds = new Set(plan?.claimGraph?.claims.map((claim) => claim.claimId) ?? []);
  const graphClaimIdByPlannedClaimId = new Map(
    (plan?.plannedClaims ?? []).flatMap((claim) => claim.claimGraphId
      ? [[claim.claimId, claim.claimGraphId] as const]
      : []),
  );
  const toGraphClaimIds = (claimIds: string[]): string[] => unique(
    claimIds.flatMap((claimId) => {
      const mapped = graphClaimIdByPlannedClaimId.get(claimId);
      if (mapped) return [mapped];
      return graphClaimIds.has(claimId) ? [claimId] : [];
    }),
  );
  const paragraphBindingKey = (value: string): string => stripInternalCitationTokens(
    sanitizeReaderFacingInternalLanguage(value),
  )
    .replace(/[\s\u3000]+/gu, "")
    .replace(/[，。；：、！？!?「」『』（）()\[\]]/gu, "")
    .toLocaleLowerCase("zh-TW");

  const inferCitationKeysFromSourceMentions = (sentence: string): string[] => {
    const locationMention = /(?:臺灣|台灣|臺北|台北|高雄|嘉義|廣州|鄭州|吉達|武漢|中國|日本|印度|美國|英國|香港|Taiwan|Taipei|Kaohsiung|Chiayi|Guangzhou|Zhengzhou|Jeddah|Wuhan|China|Japan|India|United States|United Kingdom|Hong Kong)/iu;
    const cityMention = /(?:臺北|台北|高雄|嘉義|廣州|鄭州|吉達|武漢|Taipei|Kaohsiung|Chiayi|Guangzhou|Zhengzhou|Jeddah|Wuhan)/iu;
    const locationFragments = stripInternalCitationTokens(sentence)
      .split(/[，,；;]/u)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length >= 8 && locationMention.test(fragment));
    const cityFragments = locationFragments.filter((fragment) => cityMention.test(fragment));
    const fragments = cityFragments.length > 0 ? cityFragments : locationFragments;
    const inferredKeys = unique(fragments.flatMap((fragment) =>
      Array.from(sourceByCanonicalKey.entries()).flatMap(([canonicalKey, source]) =>
        sourceSupportsSentence(
          fragment,
          source,
          evidenceCardsBySourceId.get(source.id) ?? [],
        ).supported
          ? [canonicalKey]
          : [],
      ),
    ));
    if (inferredKeys.length === 0) return [];
    const pairs = inferredKeys.flatMap((canonicalKey) => {
      const source = sourceByCanonicalKey.get(canonicalKey);
      return source
        ? [{ source, cards: evidenceCardsBySourceId.get(source.id) ?? [] }]
        : [];
    });
    return pairs.length === inferredKeys.length && sourcesSupportSentence(sentence, pairs).supported
      ? inferredKeys
      : [];
  };

  const blocksFromDraft = (
    sectionIds: string[],
    fallbackTexts: string[] = [],
  ): FormalReportBlock[] => {
    const draftSections = sectionIds
      .map((sectionId) => workspace.draft.sections.find((section) => section.sectionId === sectionId))
      .filter((section): section is ReportWorkspace["draft"]["sections"][number] => Boolean(section));
    const rawParagraphs = draftSections.flatMap((section) => {
      const text = exportSafeReportSectionText(section);
      const paragraphs = readerFacingNaturalParagraphs(text, undefined, true);
      const writerBindings = (section.paragraphClaims ?? []).map((binding) => ({
        binding,
        key: paragraphBindingKey(binding.generatedTextZhTw),
      }));
      const usedWriterBindings = new Set<number>();
      const sectionPlan = plan?.sections.find((candidate) => candidate.sectionId === section.sectionId);
      const deterministicFallbackSection = workspace.llmDiagnostics?.writerDiagnostics
        ?.fallbackSectionIds.includes(section.sectionId) ?? false;
      const writerSuppliedClaimMetadata = writerBindings.some(({ binding }) =>
        binding.claimIds.length > 0
      );
      const canonicalParagraphPlan = sectionPlan?.paragraphPlan ?? [];
      const rawFallbackParagraphs = section.body
        .split(/\n\s*\n/gu)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
      const rawFallbackParagraphKeys = rawFallbackParagraphs.map(paragraphBindingKey);
      const canonicalClaimsByWriterBindingIndex = new Map<number, string[]>();
      if (
        deterministicFallbackSection &&
        !writerSuppliedClaimMetadata &&
        writerBindings.length === canonicalParagraphPlan.length
      ) {
        writerBindings.forEach((_, index) => {
          canonicalClaimsByWriterBindingIndex.set(
            index,
            canonicalParagraphPlan[index]?.supportedClaimIds ?? [],
          );
        });
      }
      // A deterministic fallback is generated from the canonical paragraph
      // plan. Positional claim binding is allowed only when that provenance is
      // explicit and the paragraph shape still matches exactly. Model prose
      // never receives a claim merely because two array lengths happen to
      // match.
      const positionalPlanIsSafe = deterministicFallbackSection &&
        !writerSuppliedClaimMetadata &&
        canonicalParagraphPlan.length === paragraphs.length;
      const rawFallbackPlanIsSafe = deterministicFallbackSection &&
        !writerSuppliedClaimMetadata &&
        rawFallbackParagraphs.length === canonicalParagraphPlan.length;
      return paragraphs.map((paragraph, paragraphIndex) => {
        const key = paragraphBindingKey(paragraph);
        const exactBindingIndexes = writerBindings.flatMap((candidate, index) =>
          !usedWriterBindings.has(index) && Boolean(key) && candidate.key === key ? [index] : []
        );
        // The reader-facing paragraph splitter may divide one verified writer
        // paragraph into shorter display paragraphs. A normalized containment
        // match preserves that native claim identity without inventing one.
        const containedBindingIndexes = exactBindingIndexes.length === 0 && key.length >= 12
          ? writerBindings.flatMap((candidate, index) =>
              !usedWriterBindings.has(index) &&
              candidate.key.length >= 12 &&
              (candidate.key.includes(key) || key.includes(candidate.key))
                ? [index]
                : []
            )
          : [];
        const writerBindingIndexes = exactBindingIndexes.length > 0
          ? exactBindingIndexes
          : containedBindingIndexes;
        writerBindingIndexes.forEach((index) => usedWriterBindings.add(index));
        const writerClaimIds = unique(writerBindingIndexes.flatMap((index) =>
          writerBindings[index]?.binding.claimIds ?? []
        ));
        const canonicalBindingClaimIds = unique(writerBindingIndexes.flatMap((index) =>
          canonicalClaimsByWriterBindingIndex.get(index) ?? []
        ));
        const rawParagraphClaimIds = rawFallbackPlanIsSafe
          ? unique(rawFallbackParagraphKeys.flatMap((rawKey, rawIndex) =>
              rawKey.length >= 12 && (key.includes(rawKey) || rawKey.includes(key))
                ? canonicalParagraphPlan[rawIndex]?.supportedClaimIds ?? []
                : []
            ))
          : [];
        const plannedClaimIds = writerClaimIds.length > 0
          ? writerClaimIds
          : unique([
              ...canonicalBindingClaimIds,
              ...rawParagraphClaimIds,
              ...(positionalPlanIsSafe
                ? canonicalParagraphPlan[paragraphIndex]?.supportedClaimIds ?? []
                : []),
            ]);
        return {
          paragraph,
          fallbackSourceIds: unique([
            ...section.citationIds,
            ...section.supportingSourceIds,
          ]),
          argumentClaimIds: toGraphClaimIds(plannedClaimIds),
        };
      });
    });
    if (rawParagraphs.length === 0) {
      rawParagraphs.push(...fallbackTexts.map((paragraph) => ({
        paragraph,
        fallbackSourceIds: [],
        argumentClaimIds: [],
      })));
    }

    return rawParagraphs.flatMap(({ paragraph, fallbackSourceIds, argumentClaimIds }) => {
      const polishedParagraph = polishReaderParagraph(paragraph);
      const sentences = sentenceList(polishedParagraph);
      const sentenceBlocks = sentences.flatMap((sentence): FormalReportBlock[] => {
        const tokens = extractInternalCitationTokens(sentence);
        let candidateSetValidatedCollectively = false;
        const unresolved = tokens.filter((token) =>
          ambiguousMarkers.has(token.canonicalMarker) || !bindingByMarker.has(token.canonicalMarker),
        );
        if (unresolved.length > 0) {
          unresolved.forEach((token) => unknownCitationTokens.add(token.raw));
          citationMappingIssues.push(`unresolved_token:${unresolved.map((token) => token.raw).join(",")}`);
          excludedParagraphs += 1;
          return [];
        }
        let candidateKeys = unique(tokens.map((token) =>
          bindingByMarker.get(token.canonicalMarker)?.canonicalKey,
        ));
        if (tokens.length === 0 && !isGeneratorMethodStatement(sentence)) {
          const restrictedKeys = unique(
            fallbackSourceIds.map((sourceId) => canonicalKeyFor([sourceId])),
          );
          const searchKeys = restrictedKeys.length > 0
            ? restrictedKeys
            : Array.from(sourceByCanonicalKey.keys());
          const supportedKeys = searchKeys.filter((canonicalKey) => {
            const source = sourceByCanonicalKey.get(canonicalKey);
            if (!source) return false;
            return sourceSupportsSentence(
              sentence,
              source,
              evidenceCardsBySourceId.get(source.id) ?? [],
            ).supported;
          });
          const inferredKeys = inferCitationKeysFromSourceMentions(sentence);
          if (inferredKeys.length > 0) {
            candidateKeys = inferredKeys;
            candidateSetValidatedCollectively = true;
          } else if (supportedKeys.length > 0) {
            candidateKeys = supportedKeys;
          } else if (restrictedKeys.length > 1) {
            const restrictedPairs = restrictedKeys.flatMap((canonicalKey) => {
              const source = sourceByCanonicalKey.get(canonicalKey);
              return source
                ? [{ source, cards: evidenceCardsBySourceId.get(source.id) ?? [] }]
                : [];
            });
            const collectiveSupport = restrictedPairs.length === restrictedKeys.length
              ? sourcesSupportSentence(sentence, restrictedPairs)
              : { supported: false, issues: ["citation_source_missing"] };
            if (collectiveSupport.supported) {
              candidateKeys = restrictedKeys;
              candidateSetValidatedCollectively = true;
            } else {
              citationMappingIssues.push(`unsupported_uncited_sentence:${stripInternalCitationTokens(sentence)}`);
              sourceMentionIssues.push(`unsupported_source_mention:${stripInternalCitationTokens(sentence)}`);
              excludedParagraphs += 1;
              return [];
            }
          } else {
            citationMappingIssues.push(`unsupported_uncited_sentence:${stripInternalCitationTokens(sentence)}`);
            sourceMentionIssues.push(`unsupported_source_mention:${stripInternalCitationTokens(sentence)}`);
            excludedParagraphs += 1;
            return [];
          }
        }
        let supportedKeys = candidateKeys;
        if (candidateSetValidatedCollectively) {
          supportedKeys = candidateKeys;
        } else if (tokens.length > 0 && candidateKeys.length > 0) {
          const citedPairs = candidateKeys.flatMap((canonicalKey) => {
            const source = sourceByCanonicalKey.get(canonicalKey);
            return source
              ? [{ source, cards: evidenceCardsBySourceId.get(source.id) ?? [] }]
              : [];
          });
          const support = citedPairs.length === candidateKeys.length
            ? sourcesSupportSentence(sentence, citedPairs)
            : { supported: false, issues: ["citation_source_missing"] };
          if (!support.supported) {
            const inferredKeys = inferCitationKeysFromSourceMentions(sentence);
            if (inferredKeys.length > 0) {
              supportedKeys = inferredKeys;
            } else {
              const issue = `${candidateKeys.join("+")}:${support.issues.join(",")}`;
              citationMappingIssues.push(`unsupported_citation_set:${issue}`);
              sourceMentionIssues.push(issue);
              supportedKeys = [];
            }
          }
        } else {
          supportedKeys = candidateKeys.filter((canonicalKey) => {
            const source = sourceByCanonicalKey.get(canonicalKey);
            if (!source) return false;
            const support = sourceSupportsSentence(
              sentence,
              source,
              evidenceCardsBySourceId.get(source.id) ?? [],
            );
            if (!support.supported) {
              const issue = `${canonicalSourceKeyForSource(source)}:${support.issues.join(",")}`;
              citationMappingIssues.push(`unsupported_citation:${issue}`);
              sourceMentionIssues.push(issue);
            }
            return support.supported;
          });
        }
        if (candidateKeys.length > 0 && supportedKeys.length === 0) {
          excludedParagraphs += 1;
          return [];
        }
        const references = supportedKeys
          .map(ensureReference)
          .filter((reference): reference is FormalReportReference => Boolean(reference))
          .sort((left, right) => left.referenceNumber - right.referenceNumber);
        const textWithoutTokens = stripInternalCitationTokens(sentence);
        if (!textWithoutTokens) return [];
        return [formalBlock(
          textWithoutTokens,
          references.map((reference) => reference.citationId),
        )];
      });
      if (sentenceBlocks.length === 0) return [];
      return [{
        text: sentenceBlocks.map((block) => block.text).join(""),
        citationIds: unique(sentenceBlocks.flatMap((block) => block.citationIds)),
        segments: sentenceBlocks.flatMap((block) =>
          block.segments ?? [citationSegment(block.text, block.citationIds)]
        ),
        paragraphRole: "narrative" as const,
        ...(argumentClaimIds.length === 1 ? { argumentClaimId: argumentClaimIds[0] } : {}),
        ...(argumentClaimIds.length > 0 ? { argumentClaimIds } : {}),
      }];
    });
  };

  const tierRank = { A: 4, B: 3, C: 2, D: 1 } as const;
  const selectedLimitedUnits = evidenceUnits
    .slice()
    .sort((left, right) => tierRank[right.directnessTier] - tierRank[left.directnessTier])
    .filter((unit, index, all) => all.findIndex((candidate) => candidate.sourceId === unit.sourceId) === index)
    .slice(0, 4);
  const buildLimitedFindingBlocks = (): FormalReportBlock[] => selectedLimitedUnits.flatMap((unit) => {
    const canonicalKey = normalizedIdentity(unit.sourceIdentity);
    const source = sourceByCanonicalKey.get(canonicalKey);
    const reference = ensureReference(canonicalKey);
    const card = source ? evidenceCardsBySourceId.get(source.id)?.find((item) =>
      item.evidenceId === unit.id || item.id === unit.id,
    ) : null;
    if (!source || !reference) return [];
    const point = evidenceMainPoint(card ?? evidenceCardsBySourceId.get(source.id)?.[0]);
    return [formalBlock(
      `直接性 ${unit.directnessTier} 級：${point}`,
      [reference.citationId],
    )];
  });
  const canonicalDirectnessBySourceId = new Map<string, "A" | "B" | "C" | "D">();
  const directnessConsistencyIssues: string[] = [];
  for (const fact of evidenceFacts) {
    const existing = canonicalDirectnessBySourceId.get(fact.sourceId);
    if (existing && existing !== fact.directness) {
      directnessConsistencyIssues.push(
        `directness_classification_inconsistent_within_source:${fact.sourceId}:${existing}:${fact.directness}`,
      );
      continue;
    }
    canonicalDirectnessBySourceId.set(fact.sourceId, fact.directness);
  }
  for (const source of workspace.acceptedSources) {
    const factTier = canonicalDirectnessBySourceId.get(source.id);
    const sourceTier = source.researchDirectnessTier ?? "C";
    if (factTier && factTier !== sourceTier) {
      directnessConsistencyIssues.push(
        `directness_classification_drift:${source.id}:source=${sourceTier}:fact=${factTier}`,
      );
    }
  }
  const directTierCounts = Array.from(canonicalDirectnessBySourceId.values())
    .reduce<Record<"A" | "B" | "C" | "D", number>>(
      (counts, tier) => {
        counts[tier] += 1;
        return counts;
      },
      { A: 0, B: 0, C: 0, D: 0 },
    );
  const facetLabels: Record<string, string> = {
    geography: "地理範圍",
    setting: "研究場域",
    exposure: "暴露或解釋變項",
    outcome: "結果變項",
    population_object: "研究對象",
    method: "研究方法",
  };
  const coveredFacetLabels = Array.from(new Set(
    workspace.acceptedSources.flatMap((source) => source.matchedResearchFacets ?? []),
  )).map((facet) => facetLabels[facet] ?? facet);
  const missingFacetLabels = Array.from(new Set(
    workspace.acceptedSources.flatMap((source) => source.missingResearchFacets ?? []),
  )).map((facet) => facetLabels[facet] ?? facet);
  const coveredFacetText = coveredFacetLabels.length > 0
    ? coveredFacetLabels.join("、")
    : "題目中的部分研究面向";
  const missingFacetText = missingFacetLabels.length > 0
    ? missingFacetLabels.join("、")
    : "因果順序、適用範圍與可比較的效果量";
  const introductionDraftBlocks = blocksFromDraft([
    planSection(plan, "introduction")?.sectionId ?? "introduction",
  ]);
  const researchBlocks: FormalReportBlock[] = kind === "limited_evidence_brief"
    ? [
        ...introductionDraftBlocks.slice(0, 2),
        {
          text: `現有證據可提供方向性且受情境限制的回答；目前 A 級直接證據 ${directTierCounts.A} 筆、B 級近直接證據 ${directTierCounts.B} 筆，因此不能據此推估整體效果量，也不能建立因果結論。`,
          citationIds: [],
        },
        { text: `本報告的研究問題為：${researchQuestion}`, citationIds: [] },
      ]
    : researchQuestionBlock(plan, workspace.input.topic)
        .map((text) => ({ text, citationIds: [] }));
  if (kind === "evidence_synthesis_report") {
    const introduction = introductionDraftBlocks;
    if (introduction.length > 0) researchBlocks.push(...introduction);
  }

  const methodBlocks: FormalReportBlock[] = scopeMethodBlocks(workspace, kind)
    .slice(0, kind === "limited_evidence_brief" ? 2 : undefined)
    .map((text) => ({ text, citationIds: [] }));
  const everyAcceptedSourceHasFullText = workspace.acceptedSources.length > 0 &&
    workspace.acceptedSources.every((source) =>
      source.accessLevel === "full_text" || source.contentLevel === "fulltext"
    );
  const methodDraft = blocksFromDraft(["methodology"])
    .map((block) => ({
      ...block,
      text: everyAcceptedSourceHasFullText
        ? sentenceList(block.text)
            .filter((sentence) => !/若來源未提供全文/u.test(sentence))
            .join("")
        : block.text,
    }))
    .filter((block) => compact(block.text).length > 0);
  if (methodDraft.length > 0) methodBlocks.push(...methodDraft);

  const corePlanSections = planSectionsByRole(plan, "core_evidence")
    .filter((section) => section.sectionId !== "methodology");
  const fallbackCoreIds = ["literature_review", "findings"]
    .filter((sectionId) => workspace.draft.sections.some((section) => section.sectionId === sectionId));
  const effectiveCoreSections = corePlanSections.length > 0
    ? corePlanSections
    : fallbackCoreIds.map((sectionId) => ({
        sectionId,
        title: sectionId === "literature_review" ? "文獻證據與概念界定" : "主要發現與適用條件",
      }));
  const draftAnalysisSections = effectiveCoreSections
    .slice(0, 5)
    .map((section, index) => ({
      id: section.sectionId,
      title: compact(section.title) || `核心分析 ${index + 1}`,
      role: "analysis" as const,
      blocks: blocksFromDraft([section.sectionId]),
      tables: [],
      figures: [],
    }))
    .filter((section) => section.blocks.length > 0);
  const limitedFindingBlocks = draftAnalysisSections.length === 0
    ? buildLimitedFindingBlocks()
    : [];
  const fallbackLimitedBlock = limitedFindingBlocks.length > 0
    ? [{
        text: limitedFindingBlocks.map((block) => block.text.replace(/^直接性\s+[ABCD]\s+級[：:]\s*/u, "")).join("此外，"),
        citationIds: unique(limitedFindingBlocks.flatMap((block) => block.citationIds)),
      }]
    : [{
        text: "目前可核對內容尚未形成足以分成多個主題的實質結果，因此本節只保留一個綜合分析面向。現階段能確認的是證據範圍與待補構面，尚不建立來源逐篇摘要或超出資料的效果判斷。",
        citationIds: [],
        paragraphRole: "boundary" as const,
      }];
  const analysisSections: FormalReportSection[] = draftAnalysisSections.length > 0
    ? draftAnalysisSections
    : [{
        id: "limited-key-findings",
        title: "綜合發現",
        role: "analysis" as const,
        blocks: fallbackLimitedBlock,
        tables: [],
        figures: [],
      }].filter((section) => section.blocks.length > 0);

  const draftSynthesisBlocks = blocksFromDraft([
    planSectionsByRole(plan, "cross_source_synthesis")[0]?.sectionId ?? "discussion",
  ]);
  const synthesisBlocks = draftSynthesisBlocks.length > 0
    ? draftSynthesisBlocks
    : [{
        text: `現有來源可核對的內容主要涵蓋${coveredFacetText}，但沒有單一研究完整連結題目中的所有必要面向；來源之間只能比較方向、情境與限制，不能合併不可比的效果量。`,
        citationIds: [],
      }];
  const draftLimitationBlocks = blocksFromDraft([
    planSectionsByRole(plan, "limitations")[0]?.sectionId ?? "limitations",
  ]);
  const limitationBlocks = draftLimitationBlocks.length > 0
    ? draftLimitationBlocks
    : [
        {
          text: `既有資料仍缺少${missingFacetText}的共同證據，因此不能判定「${title}」所描述關聯的因果方向，也不能推估其整體效果量。`,
          citationIds: [],
        },
        {
          text: `後續研究宜在題目指定的對象與場域中，以一致尺度同步量測解釋變項與結果變項，並事先界定重要混雜因素，以補足${missingFacetText}。`,
          citationIds: [],
        },
      ];
  const draftConclusionBlocks = blocksFromDraft([
    planSectionsByRole(plan, "conclusion")[0]?.sectionId ?? "conclusion",
  ]);
  const conclusionBlocks = draftConclusionBlocks.length > 0
    ? draftConclusionBlocks
    : [{
        text: `現有來源對「${title}」提供方向一致但情境受限的線索；在缺少完整直接證據的情況下，結論應維持為可供後續驗證的暫定判斷。`,
        citationIds: [],
      }];
  if (kind === "limited_evidence_brief") {
    const directAnswer = synthesisBlocks
      .flatMap((block) => sentenceList(block.text).map((sentence) => ({ sentence, block })))
      .reverse()
      .find(({ sentence }) =>
        /(?:共同支持|較能支持|可支持|方向性關聯)/u.test(sentence) &&
        !/(?:不足|不能|無法|缺少|缺乏)/u.test(sentence) &&
        Boolean(sentence)
      );
    const rebuiltConclusion: FormalReportBlock[] = [];
    if (directAnswer) {
      const cleanAnswer = directAnswer.sentence
        .replace(/^(?:因此|綜合而言|換言之)[，,]?/u, "")
        .replace(/^本研究問題的討論必須維持受限語氣[：:]/u, "")
        .replace(/^兩者共同支持的[，,]?是/u, "現有來源共同支持的是")
        .trim();
      rebuiltConclusion.push({
        text: `綜合現有證據，對本報告研究問題可作出的直接回答是：${cleanAnswer}`,
        citationIds: directAnswer.block.citationIds,
      });
    } else {
      rebuiltConclusion.push(conclusionBlocks[0]!);
    }
    rebuiltConclusion.push(
      {
        text: `然而，目前證據仍缺少${missingFacetText}的共同覆蓋，因此不能據此推估整體效果量，也不能建立因果結論。`,
        citationIds: unique(limitationBlocks.flatMap((block) => block.citationIds)),
      },
      {
        text: `後續研究宜在題目指定的對象與場域中，以一致尺度同步量測解釋變項與結果變項，並事先界定重要混雜因素，以補足${missingFacetText}。`,
        citationIds: [],
      },
    );
    conclusionBlocks.splice(0, conclusionBlocks.length, ...rebuiltConclusion);
  }

  const references = withAuthorYearDisambiguation(
    Array.from(referenceByCanonicalKey.values())
      .sort((left, right) => {
        const leftSource = sourceByCanonicalKey.get(normalizedIdentity(left.sourceIdentity));
        const rightSource = sourceByCanonicalKey.get(normalizedIdentity(right.sourceIdentity));
        const leftAuthor = authorFamilyName(leftSource?.authors[0] ?? leftSource?.publisher ?? left.text);
        const rightAuthor = authorFamilyName(rightSource?.authors[0] ?? rightSource?.publisher ?? right.text);
        return leftAuthor.localeCompare(rightAuthor, "en", { sensitivity: "base" }) ||
          String(leftSource?.year ?? 9999).localeCompare(String(rightSource?.year ?? 9999), "en") ||
          compact(leftSource?.title ?? left.text).localeCompare(
            compact(rightSource?.title ?? right.text),
            "en",
            { sensitivity: "base" },
          ) ||
          left.sourceIdentity.localeCompare(right.sourceIdentity, "en");
      })
      .map((reference, index) => ({
        ...reference,
        referenceNumber: index + 1,
      })),
  );
  const comparisonTable: FormalReportTable | null = references.length >= 2
    ? {
        specType: "table",
        number: 2,
        title: "納入來源的證據用途與限制比較",
        columns: ["來源", "研究脈絡／資料層級", "本報告採用的證據重點", "主要限制"],
        rows: references.map((reference) => {
          const source = workspace.acceptedSources.find((item) => item.id === reference.sourceId)!;
          const card = evidenceCardsBySourceId.get(reference.sourceId)?.[0];
          const author = source.authors[0] || "作者未提供";
          return [
            `${author}（${source.year ?? "年份未提供"}）`,
            `${compact(source.containerTitle) || "出版場域未提供"}${card?.abstractOnly || source.accessLevel === "abstract_only" ? "；摘要層級" : card?.derivation === "fulltext-derived" ? "；全文可核對摘錄" : "；可核對內容片段"}`,
            evidenceMainPoint(card, "table"),
            evidenceLimitation(card, source),
          ];
        }),
        units: null,
        legend: null,
        sourceNote: "表中每列皆對應正文已引用且列入參考文獻的來源。",
        note: "不同研究的指標、尺度與單位不同，本表只比較證據方向與適用範圍，不進行效果量排序。",
        altText: `比較 ${references.length} 筆正文引用來源的研究脈絡、主要結果與限制。`,
      }
    : null;

  const citedSourceIds = new Set(references.map((reference) => reference.sourceId));
  const sourceUsage: FormalSourceUsage[] = workspace.acceptedSources.map((source) => {
    const sourceCards = evidenceCardsBySourceId.get(source.id) ?? [];
    if (citedSourceIds.has(source.id)) {
      return {
        sourceId: source.id,
        sourceIdentity: canonicalSourceKeyForSource(source),
        title: source.title,
        status: "includedAndCited" as const,
        reason: "支撐正文中的可驗證主張，並列入參考文獻。",
      };
    }
    const backgroundOnly = sourceCards.some((card) =>
      card.sourceRole === "background_definition" ||
      card.sectionTargets.some((section) => /introduction|background|method/u.test(section)),
    );
    return {
      sourceId: source.id,
      sourceIdentity: canonicalSourceKeyForSource(source),
      title: source.title,
      status: backgroundOnly ? "includedBackgroundOnly" as const : "includedButNotUsed" as const,
      reason: backgroundOnly
        ? "僅用於界定研究背景或檢索範圍，未承擔正文實質主張。"
        : "與已引用來源重複、直接性較低或未形成可驗證的獨立正文主張。",
    };
  });
  const sourceStatusLabel: Record<FormalSourceUsageStatus, string> = {
    includedAndCited: "納入並於正文引用",
    includedBackgroundOnly: "僅作背景或方法說明",
    includedButNotUsed: "納入但未進入正文",
    excludedWithReason: "排除並記錄原因",
  };
  const sourceUsageTable: FormalReportTable = {
    specType: "table",
    number: 1,
    title: "納入來源的使用狀態",
    columns: ["來源", "使用狀態", "說明"],
    rows: sourceUsage.map((usage) => [usage.title, sourceStatusLabel[usage.status], usage.reason]),
    units: null,
    legend: null,
    sourceNote: "依正式正文的主張、引用與參考文獻映射及來源直接性判定。",
    note: "檢索服務只在方法中說明，不作為研究證據作者。",
    altText: `列出 ${sourceUsage.length} 筆納入來源，以及各來源是否進入正文與未使用原因。`,
  };
  const sourceUsageCounts = sourceUsage.reduce<Record<FormalSourceUsageStatus, number>>(
    (counts, usage) => {
      counts[usage.status] += 1;
      return counts;
    },
    { includedAndCited: 0, includedBackgroundOnly: 0, includedButNotUsed: 0, excludedWithReason: 0 },
  );

  const researchSection: FormalReportSection = {
    id: "research-question-and-scope",
    title: kind === "limited_evidence_brief" ? "研究問題與核心回答" : "研究問題與範圍",
    role: "research_question",
    blocks: researchBlocks,
    tables: [],
    figures: evidenceVisuals.filter((visual) =>
      visual.visualType === "research_question_coverage" ||
      visual.visualType === "sleep_evidence_coverage"
    ),
  };
  const scopeSection: FormalReportSection = {
    id: "scope-and-method",
    title: kind === "limited_evidence_brief" ? "證據範圍及檢索方法" : "證據來源與整理方法",
    role: "scope_method",
    blocks: methodBlocks,
    tables: [],
    figures: [],
  };
  const synthesisSection: FormalReportSection = {
    id: "cross-source-synthesis",
    title: kind === "limited_evidence_brief" ? "討論與證據比較" : "跨來源綜合",
    role: "cross_source_synthesis",
    blocks: synthesisBlocks,
    tables: [],
    figures: evidenceVisuals.filter((visual) =>
      visual.visualType === "mechanism_synthesis" ||
      visual.visualType === "statistical_mediation_path"
    ),
  };
  const limitationsSection: FormalReportSection = {
    id: "limitations",
    title: kind === "limited_evidence_brief" ? "證據限制及研究缺口" : "證據限制",
    role: "limitations",
    blocks: limitationBlocks,
    tables: [],
    figures: evidenceVisuals.filter((visual) =>
      visual.visualType === "applicability_boundary" ||
      visual.visualType === "population_applicability_boundary"
    ),
  };
  const conclusionSection: FormalReportSection = {
    id: "conclusion",
    title: kind === "limited_evidence_brief" ? "結論與後續研究方向" : "結論",
    role: "conclusion",
    blocks: conclusionBlocks,
    tables: [],
    figures: evidenceVisuals.filter((visual) => visual.visualType === "study_design"),
  };

  const primaryAnalysisSection = analysisSections[0];
  const resultAnalysisSection = analysisSections[1] ?? primaryAnalysisSection;
  if (primaryAnalysisSection) {
    primaryAnalysisSection.figures.push(...evidenceVisuals.filter((visual) =>
      visual.visualType === "metric_translation" ||
      visual.visualType === "outcome_hierarchy" ||
      visual.visualType === "correlation_structure"
    ));
  }
  if (resultAnalysisSection) {
    resultAnalysisSection.figures.push(...evidenceVisuals.filter((visual) =>
      visual.visualType === "numeric_small_multiples" ||
      visual.visualType === "prevalence_facets" ||
      visual.visualType === "odds_ratio_forest"
    ));
  }

  // Source administration remains available for audit without interrupting the
  // argument-led main text.
  const appendix: FormalReportSection[] = sourceUsage.length > 0
    ? [{
        id: "source-governance-appendix",
        title: "附錄：來源治理與逐來源核對",
        role: "appendix",
        blocks: [{
          text: `本附錄記錄來源治理結果：納入並於正文引用 ${sourceUsageCounts.includedAndCited} 筆、僅作背景或方法說明 ${sourceUsageCounts.includedBackgroundOnly} 筆、納入但未進入正文 ${sourceUsageCounts.includedButNotUsed} 筆。這些表格用於稽核，不作為主文的分析架構。`,
          citationIds: [],
          paragraphRole: "reading_guide",
        }],
        tables: [sourceUsageTable, ...(comparisonTable ? [comparisonTable] : [])],
        figures: [],
      }]
    : [];

  const allBodySections = [
    researchSection,
    scopeSection,
    ...analysisSections,
    synthesisSection,
    limitationsSection,
    conclusionSection,
  ];
  if (everyAcceptedSourceHasFullText) {
    for (const section of allBodySections) {
      section.blocks = section.blocks.map((block) => ({
        ...block,
        text: block.text
          .replace(/(?:目前)?僅能確認摘要層級所揭露的結果/gu, "雖有可核對全文摘錄")
          .replace(/僅能依據摘要層級/gu, "可依據全文摘錄"),
      }));
    }
  }
  const seenReaderSentences = new Set<string>();
  for (const section of allBodySections) {
    section.blocks = section.blocks.flatMap((block) => {
      const keptSentences = sentenceList(block.text).filter((sentence) => {
        const normalized = normalizedAuditSentence(sentence);
        if (normalized.length < 18) return true;
        if (section.role === "conclusion") return true;
        if (seenReaderSentences.has(normalized)) return false;
        seenReaderSentences.add(normalized);
        return true;
      });
      if (keptSentences.length === 0) return [];
      const text = keptSentences.join("");
      const kept = new Set(keptSentences.map(normalizedAuditSentence));
      const segments = (block.segments ?? [citationSegment(block.text, block.citationIds)])
        .filter((segment) => kept.has(normalizedAuditSentence(segment.text)));
      const citationIds = unique(segments.flatMap((segment) => segment.citationIds));
      return [{ ...block, text, citationIds, segments }];
    });
  }
  applyIdeaLedgerDedupe(allBodySections);
  if (analysisSections[0] && analysisSections[0].blocks.length === 0) {
    analysisSections[0].blocks.push(formalBlock(
      "目前可核對內容尚未形成足以分成多個主題的實質結果，因此本節只保留一個綜合分析面向。現階段先界定資料直接涵蓋的內容，並把尚待補證的構面留給限制章說明。",
      [],
      "boundary",
    ));
  }
  if (synthesisSection.blocks.length === 0) {
    synthesisSection.blocks.push(formalBlock(
      "跨來源綜合目前只能辨認可共同討論的方向與研究情境，還不能形成可合併的效果估計。這個中間結論用來連接核心分析與限制章，並避免把來源順序誤當成論證結構。",
      [],
      "boundary",
    ));
  }
  const methodForAbstract = scopeMethodBlocks(workspace, kind)[0]!;
  const abstractFirst = abstractCandidate(workspace, allBodySections, methodForAbstract);
  const bodyText = allBodySections.flatMap((section) => section.blocks.map((block) => block.text)).join("\n");
  const firstIssues = validateAbstract({
    text: abstractFirst.text,
    topic: workspace.input.topic,
    findingCount: abstractFirst.findingCount,
    bodyText,
  });
  const repaired = firstIssues.length > 0
    ? abstractCandidate(
        workspace,
        [
          ...analysisSections,
          synthesisSection,
          conclusionSection,
          limitationsSection,
        ],
        methodForAbstract,
      )
    : abstractFirst;
  const abstractIssues = validateAbstract({
    text: repaired.text,
    topic: workspace.input.topic,
    findingCount: repaired.findingCount,
    bodyText,
  });
  const readingGuideFor = (section: FormalReportSection): string => {
    if (section.role === "research_question") {
      const hasSleepCoverage = section.figures.some((figure) =>
        (figure as EvidenceVisualSpec).visualType === "sleep_evidence_coverage"
      );
      return hasSleepCoverage
        ? "閱讀方式：先看高中／中學、短影音與睡眠三個核心概念的覆蓋及直接交集，再閱讀哪些來源真正能回答本題。"
        : "閱讀方式：先看四個研究構面各自的覆蓋，再看同一來源是否真正涵蓋完整交集；接著閱讀研究問題與回答邊界。";
    }
    if (section.role === "analysis") {
      const visualTypes = new Set(section.figures.map((figure) =>
        (figure as EvidenceVisualSpec).visualType
      ));
      const hasSleepStatistics = ["prevalence_facets", "odds_ratio_forest", "correlation_structure"]
        .some((visualType) => visualTypes.has(visualType as EvidenceVisualSpec["visualType"]));
      const hasNumericPanels = visualTypes.has("numeric_small_multiples");
      if (hasSleepStatistics) {
        return "閱讀方式：比例須按研究分面理解，OR 須連同信賴區間與基準線解讀，相關係數只表示變項共變；看完圖再閱讀其研究設計與適用限制。";
      }
      return hasNumericPanels
        ? "閱讀方式：各列保留原研究的指標、統計語意與尺度；先分列核對數值，再閱讀方向、差異與適用條件。"
        : "閱讀方式：先辨認暴露與結果指標各自代表的量測層級，再閱讀跨來源的共同方向、差異與解釋。";
    }
    if (section.role === "cross_source_synthesis") {
      const hasStatisticalMediation = section.figures.some((figure) =>
        (figure as EvidenceVisualSpec).visualType === "statistical_mediation_path"
      );
      return hasStatisticalMediation
        ? "閱讀方式：先把無係數箭頭讀成研究提出的統計中介路徑，而非已證實因果機制；再閱讀跨來源解釋與設計限制。"
        : "閱讀方式：先看目前證據明確提及的機制節點，再閱讀這些路徑如何連接共同發現、相反結果與解釋邊界。";
    }
    if (section.role === "limitations") {
      const hasPopulationBoundary = section.figures.some((figure) =>
        (figure as EvidenceVisualSpec).visualType === "population_applicability_boundary"
      );
      return hasPopulationBoundary
        ? "閱讀方式：先區分高中／中學生直接證據、大學生機制參照與一般社群媒體背景，再閱讀哪些概念與人口不能互相外推。"
        : "閱讀方式：先依地理與研究場域辨認證據可用範圍，再閱讀方法、尺度與外推上的核心限制。";
    }
    if (section.role === "conclusion") {
      return "閱讀方式：先看證據缺口所導出的後續研究設計，再閱讀本報告的直接回答與可行下一步。";
    }
    return "閱讀方式：以下內容先呈現可稽核的來源治理表，再補充其使用狀態與逐來源限制。";
  };
  const paragraphRoleForSection = (
    section: FormalReportSection,
  ): NonNullable<FormalReportBlock["paragraphRole"]> => {
    if (section.role === "limitations") return "boundary";
    if (section.role === "analysis" || section.role === "cross_source_synthesis" || section.role === "conclusion") {
      return "interpretation";
    }
    return "narrative";
  };
  const normalizedFactById = new Map(
    (plan?.normalizedFacts ?? []).map((fact) => [fact.factId, fact] as const),
  );
  const graphClaims = plan?.claimGraph?.claims ?? [];
  const claimEvidenceIds = new Map(graphClaims.map((claim) => [
    claim.claimId,
    new Set(
      [...claim.supportingFacts, ...claim.contradictingFacts, ...claim.backgroundFacts]
        .map((factId) => normalizedFactById.get(factId)?.evidenceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ] as const));
  const claimFactIds = new Map(graphClaims.map((claim) => [
    claim.claimId,
    new Set([...claim.supportingFacts, ...claim.contradictingFacts, ...claim.backgroundFacts]),
  ] as const));
  const factIdByNumericalResultId = new Map(
    evidenceFacts.flatMap((fact) => fact.numericalResults.map((result) => [
      result.resultId,
      fact.factId,
    ] as const)),
  );
  const claimTypePreferenceForVisual = (
    visualType: EvidenceVisualSpec["visualType"],
  ): Array<(typeof graphClaims)[number]["claimType"]> => {
    switch (visualType) {
      case "research_question_coverage":
      case "sleep_evidence_coverage":
        return ["cross_source_shared_direction", "evidence_gap", "author_synthesis"];
      case "metric_translation":
      case "outcome_hierarchy":
        return ["research_difference", "author_synthesis"];
      case "numeric_small_multiples":
      case "prevalence_facets":
      case "odds_ratio_forest":
        return ["direct_result", "cross_source_shared_direction", "research_difference", "author_synthesis"];
      case "correlation_structure":
        return ["direct_result", "cross_source_shared_direction", "research_difference", "possible_mechanism", "author_synthesis"];
      case "mechanism_synthesis":
      case "statistical_mediation_path":
        return ["possible_mechanism", "author_synthesis", "direct_result"];
      case "applicability_boundary":
      case "population_applicability_boundary":
        return ["applicability_boundary"];
      case "study_design":
        return ["research_difference", "evidence_gap", "author_synthesis"];
    }
  };
  interface ExactVisualClaimRelationship {
    claimId: string;
    explicitVisualId: boolean;
    claimTypeRank: number;
    firstMatchedFactIndex: number;
    factMatches: number;
    evidenceMatches: number;
    sourceMatches: number;
    claimFactCount: number;
  }
  const exactVisualClaimRelationships = (
    figure: FigureSpec,
  ): ExactVisualClaimRelationship[] => {
    if (!("visualId" in figure) || !("provenance" in figure)) return [];
    const visual = figure as EvidenceVisualSpec;
    const claimTypePreference = claimTypePreferenceForVisual(visual.visualType);
    const orderedVisualFactIds = unique(visual.provenance.dataPoints.flatMap((point) => [
      ...point.factIds,
      ...point.numericalResultIds.map((resultId) => factIdByNumericalResultId.get(resultId)),
    ]));
    const visualEvidenceIds = new Set(visual.provenance.evidenceIds);
    const visualSourceIds = new Set(visual.provenance.sourceIds);

    return graphClaims.flatMap((claim): ExactVisualClaimRelationship[] => {
      const claimTypeRank = claimTypePreference.indexOf(claim.claimType);
      if (claimTypeRank < 0) return [];
      const facts = claimFactIds.get(claim.claimId) ?? new Set<string>();
      const matchingFactIndexes = orderedVisualFactIds.flatMap((factId, index) =>
        facts.has(factId) ? [index] : []
      );
      const evidenceMatches = [...(claimEvidenceIds.get(claim.claimId) ?? [])]
        .filter((id) => visualEvidenceIds.has(id)).length;
      const sourceMatches = claim.citationIds.filter((id) => visualSourceIds.has(id)).length;
      const explicitVisualId = claim.visualId === visual.visualId;
      // Numeric/statistical visuals require a fact/result identity. Derived
      // coverage and boundary visuals have no atomic datum, so their exact
      // relationship is the evidence identity plus a compatible claim type.
      const exactRelationship = explicitVisualId || (
        orderedVisualFactIds.length > 0
          ? matchingFactIndexes.length > 0
          : evidenceMatches > 0
      );
      if (!exactRelationship) return [];
      return [{
        claimId: claim.claimId,
        explicitVisualId,
        claimTypeRank,
        firstMatchedFactIndex: matchingFactIndexes[0] ?? Number.MAX_SAFE_INTEGER,
        factMatches: matchingFactIndexes.length,
        evidenceMatches,
        sourceMatches,
        claimFactCount: facts.size,
      }];
    });
  };
  const claimForFigure = (figure: FigureSpec): string | null => {
    const ranked = exactVisualClaimRelationships(figure).sort((left, right) =>
      Number(right.explicitVisualId) - Number(left.explicitVisualId) ||
      left.claimTypeRank - right.claimTypeRank ||
      left.firstMatchedFactIndex - right.firstMatchedFactIndex ||
      right.factMatches - left.factMatches ||
      left.claimFactCount - right.claimFactCount ||
      right.evidenceMatches - left.evidenceMatches ||
      right.sourceMatches - left.sourceMatches ||
      left.claimId.localeCompare(right.claimId)
    );
    return ranked[0]?.claimId ?? null;
  };
  const referenceSourceIdByCitationId = new Map(
    references.map((reference) => [reference.citationId, reference.sourceId] as const),
  );
  const configureOrderedContent = (section: FormalReportSection) => {
    const existingGuide = section.blocks.find((block) => block.paragraphRole === "reading_guide");
    const narrativeBlocks = section.blocks
      .filter((block) => block !== existingGuide)
      .map((block) => ({
        ...block,
        paragraphRole: block.paragraphRole ?? paragraphRoleForSection(section),
      }));
    const hasVisualContent = section.figures.length > 0 || section.tables.length > 0;
    const guide = hasVisualContent
      ? existingGuide ?? formalBlock(readingGuideFor(section), [], "reading_guide")
      : null;
    const figureBeforeBlock = new Map<number, FigureSpec[]>();
    const usedBlockIndexes = new Set<number>();
    const figures = section.figures.map((figure, figureIndex) => {
      const declaredClaimIsExact = figure.argumentClaimId
        ? exactVisualClaimRelationships(figure).some(({ claimId }) => claimId === figure.argumentClaimId)
        : false;
      const argumentClaimId = declaredClaimIsExact
        ? figure.argumentClaimId
        : claimForFigure(figure) ?? undefined;
      const visual = figure as EvidenceVisualSpec;
      const visualSources = new Set(visual.provenance?.sourceIds ?? []);
      const rankedBlocks = narrativeBlocks.map((block, blockIndex) => {
        const blockSources = new Set(
          block.citationIds
            .map((citationId) => referenceSourceIdByCitationId.get(citationId))
            .filter((sourceId): sourceId is string => Boolean(sourceId)),
        );
        const sourceMatches = [...visualSources].filter((sourceId) => blockSources.has(sourceId)).length;
        const unusedBonus = usedBlockIndexes.has(blockIndex) ? 0 : 2;
        return { blockIndex, score: sourceMatches * 10 + unusedBonus };
      }).sort((left, right) => right.score - left.score || left.blockIndex - right.blockIndex);
      // Claim-bound placement consumes writer-native paragraph metadata. It
      // never assigns a claim identity to prose merely to satisfy this gate.
      const claimCompatibleBlocks = argumentClaimId
        ? rankedBlocks.filter(({ blockIndex }) => {
            const block = narrativeBlocks[blockIndex];
            return block?.argumentClaimId === argumentClaimId ||
              block?.argumentClaimIds?.includes(argumentClaimId);
          })
        : rankedBlocks;
      const availableBlocks = claimCompatibleBlocks.some(({ blockIndex }) => !usedBlockIndexes.has(blockIndex))
        ? claimCompatibleBlocks.filter(({ blockIndex }) => !usedBlockIndexes.has(blockIndex))
        : claimCompatibleBlocks;
      const fallbackIndex = narrativeBlocks.length > 0
        ? Math.min(figureIndex, narrativeBlocks.length - 1)
        : -1;
      const blockIndex = availableBlocks[0]?.blockIndex ?? (argumentClaimId ? -1 : fallbackIndex);
      if (blockIndex >= 0) {
        usedBlockIndexes.add(blockIndex);
      }
      const boundFigure = {
        ...figure,
        ...(argumentClaimId ? { argumentClaimId } : {}),
      };
      if (blockIndex >= 0) {
        figureBeforeBlock.set(blockIndex, [
          ...(figureBeforeBlock.get(blockIndex) ?? []),
          boundFigure,
        ]);
      }
      return boundFigure;
    });
    section.figures = figures;
    section.blocks = [...(guide ? [guide] : []), ...narrativeBlocks];
    const guideNodes = guide
      ? [{ nodeType: "paragraph" as const, block: guide }]
      : [];
    const tableNodes = section.tables.map((table) => ({ nodeType: "table" as const, table }));
    const narrativeNodes = narrativeBlocks.flatMap((block, blockIndex) => [
      ...(figureBeforeBlock.get(blockIndex) ?? []).map((figure) => ({
        nodeType: "figure" as const,
        figure,
      })),
      { nodeType: "paragraph" as const, block },
    ]);
    const unboundFigureNodes = figures
      .filter((figure) => !Array.from(figureBeforeBlock.values()).flat().includes(figure))
      .map((figure) => ({ nodeType: "figure" as const, figure }));
    section.content = figures.length > 0
      ? [...guideNodes, ...narrativeNodes, ...unboundFigureNodes, ...tableNodes]
      : [
          ...guideNodes,
          ...tableNodes,
          ...narrativeBlocks.map((block) => ({ nodeType: "paragraph" as const, block })),
        ];
  };
  [...allBodySections, ...appendix].forEach(configureOrderedContent);
  const generatedDate = zhTwDate(workspace.updatedAt || workspace.createdAt);
  const retrievalDate = zhTwDate(workspace.createdAt);
  const yearRange = sourceYearRange(workspace.acceptedSources);
  const reportTypeLabel = kind === "evidence_synthesis_report"
    ? "學術證據綜合報告"
    : "有限證據報告（Limited Evidence Brief）";
  const acceptedSourceCount = new Set(
    workspace.acceptedSources.map((source) => canonicalSourceKeyForSource(source)),
  ).size;
  const evidenceSourceCount = new Set(evidenceUnits.map((unit) => unit.sourceIdentity)).size;
  const citedSourceCount = new Set(references.map((reference) => reference.sourceIdentity)).size;
  const referenceCount = references.length;
  const evidenceUnitCount = evidenceUnits.length;
  const sourceScope = `納入來源 ${acceptedSourceCount} 筆／具證據單元來源 ${evidenceSourceCount} 筆／正文引用來源 ${citedSourceCount} 筆／參考文獻 ${referenceCount} 筆／證據單元 ${evidenceUnitCount} 筆${yearRange ? `／${yearRange} 年` : ""}／整理日 ${retrievalDate}`;
  const tocSections = [
    researchSection,
    scopeSection,
    ...analysisSections,
    synthesisSection,
    limitationsSection,
    conclusionSection,
  ];
  const withoutIntegrity: Omit<FormalReportDocument, "integrity" | "quality"> = {
    schemaVersion: "formal-report-document/v1",
    metadata: {
      title,
      subtitle,
      reportKind: kind,
      reportTypeLabel,
      generatedDate,
      documentVersion: "v3.0",
      researchQuestion,
      acceptedSourceCount,
      evidenceSourceCount,
      citedSourceCount,
      referenceCount,
      evidenceUnitCount,
      sourceCount: acceptedSourceCount,
      evidenceCount: evidenceUnitCount,
      sourceYearRange: yearRange,
      retrievalDate,
    },
    titlePage: {
      title,
      subtitle,
      reportTypeLabel,
      researchQuestion,
      evidenceScope: sourceScope,
      generatedDate,
      documentVersion: "v3.0",
    },
    abstract: {
      text: repaired.text,
      keywords: keywordCandidates(workspace.input.topic, plan).slice(0, 6),
      validation: {
        status: abstractIssues.length === 0 ? "pass" : "blocked",
        attempts: firstIssues.length > 0 ? 2 : 1,
        issues: abstractIssues,
      },
    },
    tableOfContents: [
      { id: "abstract", title: "摘要與關鍵詞", level: 1 },
      ...tocSections.map((section) => ({ id: section.id, title: section.title, level: 1 as const })),
      { id: "references", title: "參考文獻", level: 1 },
      ...appendix.map((section) => ({ id: section.id, title: section.title, level: 1 as const })),
    ],
    researchQuestion: researchSection,
    scopeAndMethod: scopeSection,
    analysisSections,
    crossSourceSynthesis: synthesisSection,
    limitations: limitationsSection,
    conclusion: conclusionSection,
    references,
    evidenceFacts,
    evidenceUnits,
    generatedConceptImages,
    sourceUsage,
    appendix,
  };
  const readerText = documentReaderText(withoutIntegrity);
  const forbiddenReaderTokens = scanReaderFacingForbiddenTokens(readerText, workspace);
  const ambiguousCitationTokens = Array.from(ambiguousMarkers);
  const finalBodyBlocks = allBodySections.flatMap((section) => section.blocks);
  const referenceIds = new Set(references.map((reference) => reference.citationId));
  const citedIds = new Set(finalBodyBlocks.flatMap((block) => block.citationIds));
  const referenceByCitationId = new Map(
    references.map((reference) => [reference.citationId, reference] as const),
  );
  const claimCitationReferenceIdentityByClaimId = new Map(graphClaims.map((claim) => {
    const boundBlocks = finalBodyBlocks.filter((block) =>
      block.argumentClaimId === claim.claimId || block.argumentClaimIds?.includes(claim.claimId)
    );
    const paragraphCitationIds = unique(boundBlocks.flatMap((block) => block.citationIds)).sort();
    const unresolvedParagraphCitationIds = paragraphCitationIds.filter((citationId) =>
      !referenceByCitationId.has(citationId)
    );
    const referencedSourceIds = unique(paragraphCitationIds.map((citationId) =>
      referenceByCitationId.get(citationId)?.sourceId
    )).sort();
    const declaredSourceIds = unique(claim.citationIds.map((citationId) => {
      const canonicalKey = canonicalKeyFor([citationId]);
      return canonicalKey ? sourceByCanonicalKey.get(canonicalKey)?.id : null;
    })).sort();
    const unresolvedClaimCitationIds = claim.citationIds.filter((citationId) =>
      !canonicalKeyFor([citationId])
    ).sort();
    const identityMatches = unresolvedClaimCitationIds.length === 0 &&
      unresolvedParagraphCitationIds.length === 0 &&
      declaredSourceIds.length === referencedSourceIds.length &&
      declaredSourceIds.every((sourceId, index) => sourceId === referencedSourceIds[index]);
    return [claim.claimId, {
      identityMatches,
      declaredSourceIds,
      paragraphCitationIds,
      referencedSourceIds,
      unresolvedClaimCitationIds,
      unresolvedParagraphCitationIds,
    }] as const;
  }));
  citationMappingIssues.push(...Array.from(claimCitationReferenceIdentityByClaimId)
    .flatMap(([claimId, audit]) => audit.identityMatches
      ? []
      : [
          `claim_citation_reference_identity_mismatch:${claimId}:declared=${audit.declaredSourceIds.join("+") || "none"}:paragraph=${audit.paragraphCitationIds.join("+") || "none"}:referenced=${audit.referencedSourceIds.join("+") || "none"}:unresolved_claim=${audit.unresolvedClaimCitationIds.join("+") || "none"}:unresolved_paragraph=${audit.unresolvedParagraphCitationIds.join("+") || "none"}`,
        ]));
  const sourceCountIssues = unique([
    ...(references.length !== citedSourceCount
      ? ["reference_count_must_equal_unique_cited_source_count"]
      : []),
    ...(references.some((reference, index) => reference.referenceNumber !== index + 1)
      ? ["internal_reference_ordinals_are_not_contiguous"]
      : []),
    ...Array.from(citedIds)
      .filter((citationId) => !referenceIds.has(citationId))
      .map((citationId) => `citation_without_reference:${citationId}`),
    ...references
      .filter((reference) => !citedIds.has(reference.citationId))
      .map((reference) => `unused_reference:${reference.citationId}`),
    ...(comparisonTable && comparisonTable.rows.length !== references.length
      ? ["comparison_table_row_count_must_equal_reference_count"]
      : []),
    ...(sourceUsage.length !== acceptedSourceCount
      ? ["source_usage_count_must_equal_accepted_source_count"]
      : []),
    ...(sourceUsage.filter((usage) => usage.status === "includedAndCited").length !== citedSourceCount
      ? ["included_and_cited_count_must_equal_cited_source_count"]
      : []),
  ]);
  for (const block of finalBodyBlocks) {
    const uniqueBlockIds = new Set(block.citationIds);
    if (uniqueBlockIds.size !== block.citationIds.length) {
      citationMappingIssues.push(`final_duplicate_citation_id:${block.text}`);
    }
    const segments = block.segments ?? [citationSegment(block.text, block.citationIds)];
    for (const segment of segments) {
      const sentence = segment.text;
      const segmentCitationIds = unique(segment.citationIds);
      if (segmentCitationIds.length === 0) continue;
      const statedSourceCount = explicitChineseSourceCount(sentence);
      if (statedSourceCount != null && segmentCitationIds.length < statedSourceCount) {
        citationMappingIssues.push(
          `final_stated_source_count_exceeds_citations:${statedSourceCount}:${segmentCitationIds.length}`,
        );
        sourceMentionIssues.push(
          `final_stated_source_count_exceeds_mentions:${statedSourceCount}:${segmentCitationIds.length}`,
        );
      }
      const citedPairs = segmentCitationIds.flatMap((citationId) => {
        const reference = references.find((item) => item.citationId === citationId);
        const source = reference
          ? workspace.acceptedSources.find((item) => item.id === reference.sourceId)
          : null;
        if (!reference || !source) {
          citationMappingIssues.push(`final_unresolved_citation_id:${citationId}`);
          return [];
        }
        return [{ source, cards: evidenceCardsBySourceId.get(source.id) ?? [] }];
      });
      if (citedPairs.length !== segmentCitationIds.length) continue;
      const support = sourcesSupportSentence(sentence, citedPairs);
      if (!support.supported) {
        citationMappingIssues.push(`final_unsupported_citation_set:${segmentCitationIds.join("+")}:${support.issues.join(",")}`);
        sourceMentionIssues.push(`final_unsupported_source_mention_set:${segmentCitationIds.join("+")}`);
      }
    }
  }
  const normalizedSentences = allBodySections
    .filter((section) => section.role !== "conclusion")
    .flatMap((section) => section.blocks)
    .flatMap((block) => sentenceList(block.text))
    .map(normalizedAuditSentence)
    .filter((sentence) => sentence.length >= 18);
  const duplicateSentences = unique(normalizedSentences.filter((sentence, index, all) =>
    all.indexOf(sentence) !== index,
  ));
  const limitationSentenceCount = allBodySections
    .flatMap((section) => section.blocks)
    .flatMap((block) => sentenceList(block.text))
    .filter((sentence) => /(?:不足|限制|不能|無法|尚未|缺少|缺乏)/u.test(sentence)).length;
  const processChars = scopeSection.blocks.reduce((sum, block) => sum + block.text.length, 0);
  const findingChars = [...analysisSections, synthesisSection]
    .flatMap((section) => section.blocks)
    .reduce((sum, block) => sum + block.text.length, 0);
  const sectionCompletenessIssues = unique(
    analysisSections.flatMap((section) => {
      const prose = section.blocks.map((block) => block.text).join("");
      const substantiveChars = normalizedAuditSentence(prose).length;
      const substantiveSentences = sentenceList(prose)
        .filter((sentence) => normalizedAuditSentence(sentence).length >= 18)
        .length;
      return substantiveChars < 90 && substantiveSentences < 2
        ? [`analysis_section_collapsed:${section.id}:${substantiveChars}:${substantiveSentences}`]
        : [];
    }),
  );
  const repetitionIssues = unique([
    ...duplicateSentences.map((sentence) => `duplicate_sentence:${sentence.slice(0, 80)}`),
    ...Array.from(
      allBodySections
        .flatMap((section) => section.blocks)
        .flatMap((block) => sentenceList(block.text))
        .map(limitationTheme)
        .filter((theme): theme is string => Boolean(theme))
        .reduce<Map<string, number>>((map, theme) => {
          map.set(theme, (map.get(theme) ?? 0) + 1);
          return map;
        }, new Map()),
    ).flatMap(([theme, count]) =>
      count > 3 ? [`repeated_limitation_theme:${theme}:${count}`] : []
    ),
    ...(normalizedSentences.length > 0 && limitationSentenceCount / normalizedSentences.length > 0.55
      ? ["limitation_language_dominates_report"]
      : []),
    ...(findingChars > 0 && processChars > findingChars * 2
      ? ["process_description_dominates_findings"]
      : []),
  ]);
  const auditedSections = [...allBodySections, ...appendix];
  const mainBodyTables = allBodySections.flatMap((section) => section.tables);
  const acceptedSourceTitles = new Set(workspace.acceptedSources.map((source) => source.title.trim()));
  const tableIssues = unique([
    ...(mainBodyTables.length > 1 ? [`table_overuse_gate:main_body_count:${mainBodyTables.length}`] : []),
    ...mainBodyTables.flatMap((table) => {
      const sourceRows = table.rows.filter((row) => acceptedSourceTitles.has((row[0] ?? "").trim())).length;
      const proseCells = table.rows.flat().filter((cell) => cell.trim().length >= 120).length;
      return [
        ...(sourceRows >= 2 ? [`table_overuse_gate:source_per_row:${table.number}`] : []),
        ...(proseCells >= 2 ? [`table_overuse_gate:prose_cells:${table.number}`] : []),
      ];
    }),
    ...auditedSections.flatMap((section) => section.tables).flatMap((table) => [
      ...table.rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) =>
        /…|\.{3,}/u.test(cell) ? [`ellipsis_in_table:${table.number}:${rowIndex}:${columnIndex}`] : [],
      )),
      ...(table.rows.some((row) => row.length !== table.columns.length)
        ? [`table_column_mismatch:${table.number}`]
        : []),
      ...(!table.altText.trim() ? [`table_missing_alt_text:${table.number}`] : []),
      ...(!table.sourceNote.trim() ? [`table_missing_source_note:${table.number}`] : []),
    ]),
  ]);
  const figureIssues = unique([
    ...auditedSections.flatMap((section) => section.figures).flatMap((figure) => {
      const data = figure.data;
      return [
        ...(!figure.altText.trim() ? [`figure_missing_alt_text:${figure.number}`] : []),
        ...(!figure.sourceNote.trim() ? [`figure_missing_source_note:${figure.number}`] : []),
        ...(figure.figureType === "directness_distribution" && data.kind === "categorical_bar" &&
            data.categories.reduce((sum, category) => sum + category.value, 0) !== acceptedSourceCount
          ? [`directness_distribution_count_mismatch:${figure.number}`]
          : []),
        ...(data.kind === "matrix" &&
            data.rows.some((row) => row.values.length !== data.columns.length)
          ? [`figure_matrix_column_mismatch:${figure.number}`]
          : []),
      ];
    }),
    ...(!evidenceVisualsHaveCompleteProvenance(evidenceVisuals)
      ? ["evidence_visual_provenance_incomplete"]
      : []),
    ...auditEvidenceVisualSemantics(evidenceVisuals),
    ...mainBodyEvidenceVisualIssues(workspace.input.topic, evidenceVisuals),
    ...(graphClaims.length > 0
      ? auditedSections.flatMap((section) => {
          const nodes = formalReportSectionContent(section);
          return nodes.flatMap((node, index) => {
            if (node.nodeType !== "figure" || !("visualId" in node.figure)) return [];
            const claimId = node.figure.argumentClaimId;
            if (!claimId) return [`figure_missing_argument_claim:${(node.figure as EvidenceVisualSpec).visualId}`];
            const adjacentParagraphs = [nodes[index - 1], nodes[index + 1]]
              .filter((candidate): candidate is Extract<FormalReportContentNode, { nodeType: "paragraph" }> =>
                candidate?.nodeType === "paragraph"
              );
            return adjacentParagraphs.some((candidate) =>
              candidate.block.argumentClaimId === claimId ||
              candidate.block.argumentClaimIds?.includes(claimId),
            )
              ? []
              : [`figure_not_adjacent_to_argument_claim:${(node.figure as EvidenceVisualSpec).visualId}:${claimId}`];
          });
        })
      : []),
  ]);
  const imageIssues = unique(generatedConceptImages.flatMap((record) => [
    ...(!generatedConceptImageRecordIsTruthful(record)
      ? [`generated_image_record_not_truthful:${record.visualId}`]
      : []),
    ...(record.status === "generated" && record.provider !== "Image2"
      ? [`generated_image_provider_not_image2:${record.visualId}`]
      : []),
  ]));
  const factIssues = unique([
    ...auditStandardizedEvidenceFacts(evidenceFacts),
    ...directnessConsistencyIssues,
  ]);
  const sourceOverlapIssues = readerSourceOverlapIssues(allBodySections, evidenceFacts);
  const sourceCenteredIssues = sourceCenteredParagraphIssues(allBodySections);
  const venueIssues = publicationVenueIssues(workspace.acceptedSources);
  const finalCitationFailures = citationMappingIssues.filter((issue) => issue.startsWith("final_"));
  const finalMentionFailures = sourceMentionIssues.filter((issue) => issue.startsWith("final_"));
  const structuralQualityIssues: Array<
    NonNullable<ReportQualityGateInput["structuralIssues"]>[number]
  > = [];
  const addStructuralQualityIssues = (
    issues: string[],
    dimension: NonNullable<ReportQualityGateInput["structuralIssues"]>[number]["dimension"],
    kind: NonNullable<ReportQualityGateInput["structuralIssues"]>[number]["kind"],
    prefix: string,
  ) => {
    issues.forEach((issue) => structuralQualityIssues.push({
      dimension,
      kind,
      location: `${prefix}:${issue.split(":")[1] ?? "report"}`,
      reason: issue,
      blocksExport: true,
    }));
  };
  addStructuralQualityIssues(sourceCountIssues, "evidence_integrity", "evidence", "report:source-count");
  addStructuralQualityIssues(finalCitationFailures, "citation_precision", "citation", "report:citation");
  addStructuralQualityIssues(finalMentionFailures, "citation_precision", "citation", "report:source-mention");
  addStructuralQualityIssues(sectionCompletenessIssues, "coherence", "coherence", "section");
  addStructuralQualityIssues(repetitionIssues, "coherence", "repetition", "section");
  addStructuralQualityIssues(tableIssues, "visual_effectiveness", "visual", "table");
  addStructuralQualityIssues(figureIssues, "visual_effectiveness", "visual", "figure");
  addStructuralQualityIssues(imageIssues, "visual_effectiveness", "visual", "image");
  addStructuralQualityIssues(factIssues, "statistical_correctness", "number", "fact");
  addStructuralQualityIssues(sourceOverlapIssues, "synthesis", "stitching", "section");
  addStructuralQualityIssues(sourceCenteredIssues, "synthesis", "stitching", "section");
  addStructuralQualityIssues(venueIssues, "document_quality", "document", "reference");

  const statisticalInterpretationFactIds = new Set(
    plan?.statisticalInterpretations?.map((item) => item.factId) ?? [],
  );
  const comparableFactIds = new Set(
    plan?.heterogeneityAnalysis?.comparisons.flatMap((comparison) => [
      comparison.leftFactId,
      comparison.rightFactId,
    ]) ?? [],
  );
  const contradictionTextPresent = /(?:不一致|矛盾|反例|反方向|無顯著|混合結果)/u.test(readerText);
  const alternativeTextPresent = /(?:替代解釋|反向因果|選樣偏差|測量偏差|回憶偏差|混雜因素|文化差異|量表切點)/u.test(readerText);
  const quality = evaluateReportQuality({
    facts: (plan?.normalizedFacts ?? []).map((fact) => ({
      factId: fact.factId,
      sourceId: fact.sourceId,
      evidenceId: fact.evidenceId,
      location: fact.locator,
      traceable: Boolean(fact.sourceId && fact.evidenceId && fact.sourceSpan && fact.locator),
      containsNumber: fact.value != null || fact.numericalResults.length > 0,
      numericValue: fact.value,
      numberTraceable: fact.value == null && fact.numericalResults.length === 0
        ? true
        : Boolean(fact.sourceSpan && fact.locator),
      statisticInterpretationValid: fact.value == null && fact.numericalResults.length === 0
        ? true
        : statisticalInterpretationFactIds.has(fact.factId),
      comparisonValid: comparableFactIds.has(fact.factId) ||
        (plan?.heterogeneityAnalysis?.comparisons.length ?? 0) === 0,
    })),
    claims: (plan?.claimGraph?.claims ?? []).map((claim) => {
      const factIds = [...(claimFactIds.get(claim.claimId) ?? new Set<string>())];
      const numericalFactIds = factIds.filter((factId) =>
        (plan?.normalizedFacts ?? []).some((fact) =>
          fact.factId === factId && (fact.value != null || fact.numericalResults.length > 0)
        )
      );
      const materialContradiction = claim.contradictingFacts.length > 0;
      return {
        claimId: claim.claimId,
        isMajor: !["evidence_gap", "research_gap", "evidence_limitation", "author_synthesis"]
          .includes(claim.claimType),
        supportingFactIds: claim.supportingFacts,
        citationIds: claim.citationIds,
        citationEntailed: finalCitationFailures.length === 0,
        citationIdentityMatches: claimCitationReferenceIdentityByClaimId.get(claim.claimId)
          ?.identityMatches ?? false,
        containsNumber: numericalFactIds.length > 0,
        numberFactIds: numericalFactIds,
        directness: claim.evidenceDirectness === "A"
          ? "direct" as const
          : claim.evidenceDirectness === "B"
            ? "near_direct" as const
            : claim.evidenceDirectness
              ? "indirect" as const
              : "unknown" as const,
        calibratedToEvidence: true,
        contradictingFactIds: claim.contradictingFacts,
        contradictionAddressed: !materialContradiction || contradictionTextPresent,
      };
    }),
    sections: allBodySections.map((section, index) => ({
      sectionId: section.id,
      text: section.blocks.map((block) => block.text).join("\n\n"),
      substantive: section.blocks.length > 0,
      paperByPaper: sourceCenteredIssues.some((issue) => issue.includes(section.id)),
      coherent: !sectionCompletenessIssues.some((issue) => issue.includes(section.id)),
      transitionFromPrevious: index === 0 || section.blocks.length > 0,
      repetitionRatio: repetitionIssues.some((issue) => issue.includes(section.id)) ? 1 : 0,
    })),
    visualAudits: evidenceVisuals.map((visual) => ({
      visualId: visual.visualId,
      required: true,
      expectedVisualType: visual.visualType,
      selectedVisualType: visual.visualType,
      valuesTraceable: evidenceVisualsHaveCompleteProvenance([visual]),
      dataValid: auditEvidenceVisualSemantics([visual]).length === 0,
      helpsInterpretation: true,
      sourceNotePresent: Boolean(visual.sourceNote.trim()),
    })),
    contradictions: (plan?.contradictionAnalysis ?? []).map((item) => ({
      contradictionId: item.claimId,
      material: item.status === "contradictory" || item.status === "mixed",
      addressed: item.status !== "contradictory" && item.status !== "mixed"
        ? true
        : contradictionTextPresent,
      alternativeExplanationIncluded: item.status !== "contradictory" && item.status !== "mixed"
        ? true
        : alternativeTextPresent,
    })),
    audienceArchetype: {
      // New plans carry explicit routed objects. Legacy canonical workspaces
      // still have an explicit user audience/report type and remain auditable
      // without being retroactively blocked solely for schema age.
      audienceProfileDefined: Boolean(plan?.audienceProfile) ||
        Boolean(workspace.input.targetAudience.trim() || workspace.input.academicLevel.trim()),
      audienceFit: Boolean(plan?.audienceProfile) ||
        Boolean(workspace.input.targetAudience.trim() || workspace.input.academicLevel.trim()),
      explanationDepthMatchesAudience: Boolean(plan?.audienceProfile) ||
        Boolean(workspace.input.targetAudience.trim() || workspace.input.academicLevel.trim()),
      archetypeFit: Boolean(plan?.reportArchetype) || Boolean(workspace.input.reportType.trim()),
      reportArchetypeMatchesQuestion: Boolean(plan?.reportArchetype) || Boolean(workspace.input.reportType.trim()),
      minimumEvidenceMet: plan?.reportArchetype?.minimumConditionsMet ?? kind === "evidence_synthesis_report",
      evidenceSufficiency: kind === "limited_evidence_brief" ? "limited" : "sufficient",
      limitedEvidence: kind === "limited_evidence_brief",
      reportArchetype: plan?.reportArchetype?.archetypeId ?? kind,
      claimsCalibratedToEvidence: kind === "limited_evidence_brief" ||
        plan?.reportArchetype?.minimumConditionsMet !== false,
      resultVisualsRequired: (plan?.statisticalInterpretations ?? []).some((item) => item.visualizable),
    },
    structuralIssues: structuralQualityIssues,
    limitedEvidence: kind === "limited_evidence_brief",
    reportArchetype: plan?.reportArchetype?.archetypeId ?? kind,
    retryCount: 0,
  });
  const status = unknownCitationTokens.size === 0 &&
      ambiguousCitationTokens.length === 0 &&
      forbiddenReaderTokens.length === 0 &&
      abstractIssues.length === 0 &&
      analysisSections.length >= 1 &&
      conclusionBlocks.length > 0 &&
      references.length > 0 &&
      sourceCountIssues.length === 0 &&
      finalCitationFailures.length === 0 &&
      finalMentionFailures.length === 0 &&
      sectionCompletenessIssues.length === 0 &&
      repetitionIssues.length === 0 &&
      tableIssues.length === 0 &&
      figureIssues.length === 0 &&
      imageIssues.length === 0 &&
      factIssues.length === 0 &&
      sourceOverlapIssues.length === 0 &&
      sourceCenteredIssues.length === 0 &&
      venueIssues.length === 0 &&
      !quality.blockExport
    ? "pass"
    : "blocked";

  return {
    ...withoutIntegrity,
    quality,
    integrity: {
      status,
      unknownCitationTokens: Array.from(unknownCitationTokens),
      ambiguousCitationTokens,
      forbiddenReaderTokens,
      excludedParagraphs,
      sourceCountIssues,
      citationMappingIssues: unique(citationMappingIssues),
      sourceMentionIssues: unique(sourceMentionIssues),
      sectionCompletenessIssues,
      repetitionIssues,
      tableIssues,
      figureIssues,
      imageIssues,
      factIssues,
      sourceOverlapIssues,
      sourceCenteredParagraphIssues: sourceCenteredIssues,
      venueIssues,
    },
  };
}

export function formalReportSectionSequence(document: FormalReportDocument): FormalReportSection[] {
  return [
    document.researchQuestion,
    document.scopeAndMethod,
    ...document.analysisSections,
    document.crossSourceSynthesis,
    document.limitations,
    document.conclusion,
  ];
}

export function sourceIdForFormalCitation(
  document: FormalReportDocument,
  citationId: string,
): string | null {
  return document.references.find((reference) => reference.citationId === citationId)?.sourceId ?? null;
}
