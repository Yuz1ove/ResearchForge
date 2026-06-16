import {
  acceptedSourceRecords,
  defaultUsableSections,
  normalizeUsableSections,
  sourceRecordKey,
  type SourceRecord,
  type WorkflowReportSection,
  WORKFLOW_REPORT_SECTIONS,
} from "./sourceRecords.ts";

export interface EvidenceCard {
  id: string;
  sourceId: string;
  claim: string;
  evidence: string;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceDomain: string;
  sourceProvider: string;
  sourceCategory: string | null;
  year: number | null;
  usableSections: WorkflowReportSection[];
  confidence: string | null;
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

function sourceToEvidenceCard(source: SourceRecord, ordinal: number): EvidenceCard {
  const id = sourceId(source);
  const title = source.title || "標題待確認";
  const usableSections = normalizeUsableSections(source.usableSections);

  return {
    id: `evidence:${id}`,
    sourceId: id,
    claim: `來源 ${ordinal} 可支持「${title}」相關論點。`,
    evidence: compactEvidenceText(source),
    sourceTitle: title,
    sourceUrl: source.url,
    sourceDomain: sourceDomain(source.url),
    sourceProvider: source.sourceType,
    sourceCategory: source.sourceCategory?.trim() || null,
    year: source.year,
    usableSections: usableSections.length ? usableSections : defaultUsableSections(),
    confidence: source.confidence?.trim() || null,
    notes: source.reviewNotes?.trim() || "",
  };
}

export function buildEvidenceCards(
  sources: SourceRecord[],
  existingCards: EvidenceCard[] = [],
  options: BuildEvidenceCardOptions = {},
): EvidenceCard[] {
  const acceptedSources = acceptedSourceRecords(sources);
  const existingBySourceId = new Map(existingCards.map((card) => [card.sourceId, card]));
  const seen = new Set<string>();
  const cards: EvidenceCard[] = [];

  acceptedSources.forEach((source, index) => {
    const id = sourceId(source);
    if (seen.has(id)) return;
    seen.add(id);

    const generated = sourceToEvidenceCard(source, index + 1);
    const existing = existingBySourceId.get(id);
    if (!existing) {
      cards.push(generated);
      return;
    }

    cards.push({
      ...generated,
      id: existing.id || generated.id,
      claim: options.resetText ? generated.claim : existing.claim || generated.claim,
      evidence: options.resetText ? generated.evidence : existing.evidence || generated.evidence,
      sourceCategory: options.resetText ? generated.sourceCategory : existing.sourceCategory ?? generated.sourceCategory,
      usableSections: options.resetText ? generated.usableSections : existing.usableSections ?? generated.usableSections,
      confidence: options.resetText ? generated.confidence : existing.confidence ?? generated.confidence,
      notes: options.resetText ? generated.notes : existing.notes ?? generated.notes,
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
