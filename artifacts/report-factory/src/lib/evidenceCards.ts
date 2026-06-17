import {
  acceptedSourceRecords,
  defaultUsableSections,
  normalizeUsableSections,
  sourceRecordKey,
  type SourceRecord,
  type WorkflowReportSection,
  WORKFLOW_REPORT_SECTIONS,
} from "./sourceRecords.ts";
import { buildSourceEvidenceProfile } from "./sourceEvidence.ts";
import { sourceHasUsableAbstract } from "./sourceSummaries.ts";
import { buildTopicFacets } from "./topicFacets.ts";
import type { EvidenceDerivation } from "@workspace/api-zod";

export interface EvidenceCard {
  id: string;
  sourceId: string;
  claim: string;
  evidence: string;
  quoteOrParaphrase: string;
  summary: string;
  relevance: string;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceDomain: string;
  sourceProvider: string;
  sourceCategory: string | null;
  year: number | null;
  usableSections: WorkflowReportSection[];
  confidence: string | null;
  confidenceScore: number;
  derivation: EvidenceDerivation;
  limitation: string | null;
  citationText: string;
  pageOrLocation?: string;
  createdAt: string;
  notes: string;
}

export interface EvidenceCoverageWarning {
  code:
    | "accepted-sources-below-recommended"
    | "evidence-cards-below-accepted-sources"
    | "missing-background-evidence"
    | "missing-literature-evidence";
  message: string;
}

export interface EvidenceCoverageSummary {
  acceptedSourceCount: number;
  evidenceCardCount: number;
  sectionCounts: Record<WorkflowReportSection, number>;
  warnings: EvidenceCoverageWarning[];
  positiveStatuses: string[];
  isBasicReady: boolean;
}

interface BuildEvidenceCardOptions {
  resetText?: boolean;
  topic?: string;
  createdAt?: string;
}

const RECOMMENDED_ACCEPTED_SOURCE_COUNT = 10;

function sourceId(source: SourceRecord): string {
  return source.id || sourceRecordKey(source);
}

function sourceDomain(url: string | null | undefined): string {
  if (!url) return "網域待確認";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "網域待確認";
  }
}

function compactEvidenceText(source: SourceRecord): string {
  const abstract = source.abstract?.trim();
  if (abstract) {
    const firstSentence = abstract.split(/(?<=[.!?。！？])\s+/)[0]?.trim();
    if (firstSentence) return firstSentence;
  }
  const locator = source.doi ? `DOI：${source.doi}` : source.url;
  return locator ? `可由來源位置查證：${locator}` : "此來源已接受，但仍需要補充可引用的重點摘錄。";
}

function confidenceScore(source: SourceRecord, hasSnippet: boolean): number {
  const sourceConfidence = source.confidence?.trim();
  if (source.evidenceGrounding === "metadata_only" || source.evidenceGrounding === "insufficient") return 0.35;
  if (!sourceHasUsableAbstract(source)) return 0.35;
  if (hasSnippet && sourceConfidence === "高") return 0.74;
  if (hasSnippet && sourceConfidence === "中") return 0.66;
  if (hasSnippet) return 0.58;
  if (sourceConfidence === "高") return 0.6;
  if (sourceConfidence === "中") return 0.52;
  return 0.42;
}

function evidenceDerivation(source: SourceRecord, hasSnippet: boolean): EvidenceDerivation {
  if (source.evidenceGrounding === "snippet_grounded") return "fulltext-derived";
  if (hasSnippet || sourceHasUsableAbstract(source)) return "abstract-derived";
  return "metadata-derived";
}

function limitationForEvidence(source: SourceRecord, derivation: EvidenceDerivation): string | null {
  if (derivation === "fulltext-derived") return null;
  if (derivation === "abstract-derived") return "目前依題名、摘要與 metadata 建立證據卡；尚未讀取全文，不能編造頁碼或超出摘要內容。";
  if (source.abstract?.trim()) return "摘要過短，僅能作為書目與主題線索；正式結論需回查原文。";
  return "此來源尚無摘要，僅可建立 bibliographic evidence，不可產生具體研究結論。";
}

function citationText(source: SourceRecord): string {
  const author = source.authors[0]?.trim() || source.publisher?.trim() || "作者待確認";
  const year = source.year ?? "年份待確認";
  return `${author}（${year}）`;
}

function sourceToEvidenceCards(
  source: SourceRecord,
  ordinal: number,
  options: Pick<BuildEvidenceCardOptions, "topic" | "createdAt">,
): EvidenceCard[] {
  const id = sourceId(source);
  const title = source.title || "標題待確認";
  const usableSections = normalizeUsableSections(source.usableSections);
  const evidenceProfile = buildSourceEvidenceProfile(source, buildTopicFacets(options.topic ?? ""));
  const baseSections = usableSections.length ? usableSections : defaultUsableSections();
  const snippets = evidenceProfile.evidenceSnippets.slice(0, 3);
  const cards: EvidenceCard[] = [];

  if (snippets.length > 0) {
    snippets.forEach((snippet, index) => {
      const evidence = snippet.snippetZhTw || snippet.reasoningZhTw || compactEvidenceText(source);
      const derivation = evidenceDerivation(source, true);
      cards.push({
        id: `evidence:${id}:${index + 1}`,
        sourceId: id,
        claim: `來源 ${ordinal}.${index + 1} 可支持「${snippet.matchedFacet}」相關論點。`,
        evidence,
        quoteOrParaphrase: evidence,
        summary: snippet.reasoningZhTw || evidenceProfile.summaryZhTw || evidence,
        relevance: snippet.matchedFacet,
        sourceTitle: title,
        sourceUrl: source.url,
        sourceDomain: sourceDomain(source.url),
        sourceProvider: source.sourceType,
        sourceCategory: source.sourceCategory?.trim() || null,
        year: source.year,
        usableSections: baseSections,
        confidence: source.confidence?.trim() || null,
        confidenceScore: confidenceScore(source, true),
        derivation,
        limitation: limitationForEvidence(source, derivation),
        citationText: citationText(source),
        pageOrLocation: "abstract",
        createdAt: options.createdAt ?? new Date().toISOString(),
        notes: source.reviewNotes?.trim() || "",
      });
    });
    return cards;
  }

  const derivation = evidenceDerivation(source, false);
  cards.push({
    id: `evidence:${id}:0`,
    sourceId: id,
    claim: sourceHasUsableAbstract(source)
      ? `來源 ${ordinal} 可作為「${title}」的摘要型佐證。`
      : `來源 ${ordinal} 僅提供「${title}」的書目線索。`,
    evidence: compactEvidenceText(source),
    quoteOrParaphrase: compactEvidenceText(source),
    summary: evidenceProfile.summaryZhTw || compactEvidenceText(source),
    relevance: source.mainEvidenceFacet || "研究背景",
    sourceTitle: title,
    sourceUrl: source.url,
    sourceDomain: sourceDomain(source.url),
    sourceProvider: source.sourceType,
    sourceCategory: source.sourceCategory?.trim() || null,
    year: source.year,
    usableSections: baseSections,
    confidence: source.confidence?.trim() || null,
    confidenceScore: confidenceScore(source, false),
    derivation,
    limitation: limitationForEvidence(source, derivation),
    citationText: citationText(source),
    pageOrLocation: derivation === "abstract-derived" ? "abstract" : undefined,
    createdAt: options.createdAt ?? new Date().toISOString(),
    notes: source.reviewNotes?.trim() || "",
  });
  return cards;
}

export function buildEvidenceCards(
  sources: SourceRecord[],
  existingCards: EvidenceCard[] = [],
  options: BuildEvidenceCardOptions = {},
): EvidenceCard[] {
  const acceptedSources = acceptedSourceRecords(sources);
  const existingById = new Map(existingCards.map((card) => [card.id, card]));
  const seen = new Set<string>();
  const cards: EvidenceCard[] = [];

  acceptedSources.forEach((source, index) => {
    const id = sourceId(source);
    if (seen.has(id)) return;
    seen.add(id);

    const generatedCards = sourceToEvidenceCards(source, index + 1, options);
    generatedCards.forEach((generated) => {
      const existing = existingById.get(generated.id);
      if (!existing) {
        cards.push(generated);
        return;
      }

      cards.push({
        ...generated,
        id: existing.id || generated.id,
        claim: options.resetText ? generated.claim : existing.claim || generated.claim,
        evidence: options.resetText ? generated.evidence : existing.evidence || generated.evidence,
        quoteOrParaphrase: options.resetText ? generated.quoteOrParaphrase : existing.quoteOrParaphrase || generated.quoteOrParaphrase,
        summary: options.resetText ? generated.summary : existing.summary || generated.summary,
        relevance: options.resetText ? generated.relevance : existing.relevance || generated.relevance,
        sourceCategory: options.resetText ? generated.sourceCategory : existing.sourceCategory ?? generated.sourceCategory,
        usableSections: options.resetText ? generated.usableSections : existing.usableSections ?? generated.usableSections,
        confidence: options.resetText ? generated.confidence : existing.confidence ?? generated.confidence,
        confidenceScore: options.resetText ? generated.confidenceScore : existing.confidenceScore ?? generated.confidenceScore,
        derivation: options.resetText ? generated.derivation : existing.derivation ?? generated.derivation,
        limitation: options.resetText ? generated.limitation : existing.limitation ?? generated.limitation,
        citationText: options.resetText ? generated.citationText : existing.citationText ?? generated.citationText,
        pageOrLocation: options.resetText ? generated.pageOrLocation : existing.pageOrLocation ?? generated.pageOrLocation,
        createdAt: existing.createdAt ?? generated.createdAt,
        notes: options.resetText ? generated.notes : existing.notes ?? generated.notes,
      });
    });
  });

  return cards;
}

export function summarizeEvidenceCoverage(
  evidenceCards: EvidenceCard[],
  acceptedSources: SourceRecord[],
  recommendedAcceptedSourceCount = RECOMMENDED_ACCEPTED_SOURCE_COUNT,
): EvidenceCoverageSummary {
  const sectionCounts = WORKFLOW_REPORT_SECTIONS.reduce(
    (acc, section) => ({ ...acc, [section]: 0 }),
    {} as Record<WorkflowReportSection, number>,
  );

  for (const card of evidenceCards) {
    const sections = normalizeUsableSections(card.usableSections);
    for (const section of sections) {
      sectionCounts[section] += 1;
    }
  }

  const acceptedSourceCount = acceptedSourceRecords(acceptedSources).length;
  const warnings: EvidenceCoverageWarning[] = [];

  if (acceptedSourceCount < recommendedAcceptedSourceCount) {
    warnings.push({
      code: "accepted-sources-below-recommended",
      message: `建議至少接受 ${recommendedAcceptedSourceCount} 筆來源`,
    });
  }

  if (evidenceCards.length < acceptedSourceCount) {
    warnings.push({
      code: "evidence-cards-below-accepted-sources",
      message: "證據卡少於已接受來源",
    });
  }

  if (sectionCounts["研究背景"] === 0) {
    warnings.push({ code: "missing-background-evidence", message: "研究背景尚缺證據" });
  }

  if (sectionCounts["文獻探討"] === 0) {
    warnings.push({ code: "missing-literature-evidence", message: "文獻探討尚缺證據" });
  }

  const positiveStatuses: string[] = [];
  if (acceptedSourceCount >= recommendedAcceptedSourceCount) positiveStatuses.push("已達基本來源數量");
  if (evidenceCards.length > 0) positiveStatuses.push("已建立證據卡");
  if (sectionCounts["研究背景"] > 0 && sectionCounts["文獻探討"] > 0) {
    positiveStatuses.push("研究背景與文獻探討已有證據");
  }

  return {
    acceptedSourceCount,
    evidenceCardCount: evidenceCards.length,
    sectionCounts,
    warnings,
    positiveStatuses,
    isBasicReady:
      acceptedSourceCount >= recommendedAcceptedSourceCount &&
      evidenceCards.length > 0 &&
      sectionCounts["研究背景"] > 0 &&
      sectionCounts["文獻探討"] > 0,
  };
}
