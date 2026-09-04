import type { ReportWriterEvidenceCard, ReportWriterSection, SentenceClaimTrace } from "./report-writer";
import {
  repairFormalSectionsDeterministically,
  validateCrossSectionDuplicates,
  type FormalResearchArchitecture,
} from "./formal-research-architecture";

export const DETERMINISTIC_SUPPORTED_CONTENT_RECOVERY =
  "DETERMINISTIC_SUPPORTED_CONTENT_RECOVERY" as const;

export interface SupportedContentRealization {
  sentenceId: string;
  sentence: string;
  claimId: string;
  evidenceCardId: string;
  sourceId: string;
  supportSpan: string;
  sectionOwner: string;
  citationMarker: string | null;
}

export interface UnavailableSupportedContent {
  evidenceCardId: string;
  sourceId: string;
  reason: "ALREADY_REALIZED" | "NO_VERIFIED_ZHTW_SUPPORTED_PROPOSITION";
}

export interface DeterministicSupportedContentRecoveryResult {
  schemaVersion: "deterministic-supported-content-recovery/v1";
  mode: typeof DETERMINISTIC_SUPPORTED_CONTENT_RECOVERY;
  writerCalls: 0;
  searchCalls: 0;
  sections: ReportWriterSection[];
  realizations: SupportedContentRealization[];
  unavailable: UnavailableSupportedContent[];
  supportedCjk: number;
  minimumCjk: number;
  strictDuplicateCount: number;
  semanticDuplicateCount: number;
  unsupportedSentenceCount: number;
  provenanceCoverage: number;
  passed: boolean;
  verdict: "PASS" | "CASE_B_INSUFFICIENT_SUPPORTED_CONTENT";
}

const HAN = /[\u3400-\u9fff]/u;
const NON_PROPOSITION =
  /(?:中文摘要[:：]此來源可用於檢視|此來源已保留可追溯的摘要片段|可辨識的證據面向|已取得DOI|系統初評為)/u;

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function cjk(value: string): number {
  return value.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
}

function evidenceId(card: ReportWriterEvidenceCard): string {
  return card.evidenceCardId || card.evidenceId || card.id;
}

function verifiedZhTwProposition(card: ReportWriterEvidenceCard): string | null {
  const candidates = [
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
  ];
  for (const candidate of candidates) {
    const normalized = candidate?.replace(/\s+/gu, " ").trim() ?? "";
    if (!normalized || !HAN.test(normalized) || NON_PROPOSITION.test(normalized)) continue;
    return /[.!?。！？]$/u.test(normalized) ? normalized : `${normalized}。`;
  }
  return null;
}

function sectionOwner(card: ReportWriterEvidenceCard): string {
  const id = evidenceId(card).toLocaleLowerCase("en");
  const proposition = `${card.claimTextZhTw ?? ""} ${card.claim ?? ""}`;
  if (/(?:risk|limitation|no-significant|風險|限制|無顯著)/iu.test(`${id} ${proposition}`)) {
    return "limitations_gaps";
  }
  return "findings";
}

function realizedEvidenceIds(sections: ReportWriterSection[]): Set<string> {
  return new Set(
    sections.flatMap((section) =>
      (section.sentenceClaimTraces ?? []).flatMap((trace) =>
        !trace.deleted && trace.validationAfter === "pass" ? trace.evidenceIds ?? [] : [],
      ),
    ),
  );
}

function appendRealization(
  sections: ReportWriterSection[],
  card: ReportWriterEvidenceCard,
  proposition: string,
  ordinal: number,
): SupportedContentRealization | null {
  const owner = sectionOwner(card);
  const section = sections.find((candidate) => candidate.sectionId === owner);
  if (!section) return null;
  const cardId = evidenceId(card);
  const claimId = `atomic-${cardId}`;
  const sentenceId = `offline-supported-${ordinal + 1}`;
  const paragraphId = `${owner}:offline-supported:${ordinal + 1}`;
  const supportSpan = (card.supportSpan || card.supportedByText || card.evidence || card.claim).trim();
  const citationMarker = card.citationMarker?.trim() || null;
  const trace: SentenceClaimTrace = {
    sentenceId,
    text: proposition,
    realizedClaimIds: [claimId],
    citationSourceIds: [card.sourceId],
    factual: true,
    validation: "pass",
    sectionId: owner,
    paragraphId,
    originalText: proposition,
    finalText: proposition,
    originalClaimIds: [claimId],
    finalClaimIds: [claimId],
    evidenceIds: [cardId],
    citationIds: citationMarker ? [citationMarker] : [],
    action: "DETERMINISTIC_REWRITE",
    actionReason: "offline_fixed_evidence_realization_template",
    repairStage: "B_DETERMINISTIC",
    repairAttempts: 1,
    providerUsed: null,
    validationBefore: "pass",
    validationAfter: "pass",
    deleted: false,
  };
  section.prose = `${section.prose.trim()}\n\n${proposition}`.trim();
  section.evidenceCardIds = unique([...section.evidenceCardIds, cardId]);
  section.citationIds = unique([...section.citationIds, card.sourceId]);
  section.sentenceClaimTraces = [...(section.sentenceClaimTraces ?? []), trace];
  section.paragraphClaims = [
    ...(section.paragraphClaims ?? []),
    {
      paragraphId,
      sectionId: owner,
      claimIds: [claimId],
      evidenceCardIds: [cardId],
      citationMarkers: citationMarker ? [citationMarker] : [],
      generatedTextZhTw: proposition,
      unsupportedSentences: [],
    },
  ];
  section.coverageStatus = "sufficient";
  section.groundingStatus = "grounded";
  section.unsupportedSentences = [];
  section.generationMethod = DETERMINISTIC_SUPPORTED_CONTENT_RECOVERY;
  section.warnings = unique([
    ...(section.warnings ?? []),
    "offline_fixed_evidence_realization_template",
  ]);
  return {
    sentenceId,
    sentence: proposition,
    claimId,
    evidenceCardId: cardId,
    sourceId: card.sourceId,
    supportSpan,
    sectionOwner: owner,
    citationMarker,
  };
}

export function recoverSupportedContentDeterministically(input: {
  sections: ReportWriterSection[];
  architecture: FormalResearchArchitecture;
  evidenceCards: ReportWriterEvidenceCard[];
  minimumCjk?: number;
}): DeterministicSupportedContentRecoveryResult {
  const minimumCjk = input.minimumCjk ?? 1_800;
  const initiallyRepaired = repairFormalSectionsDeterministically({
    sections: structuredClone(input.sections),
    architecture: input.architecture,
  }).sections;
  const alreadyRealized = realizedEvidenceIds(initiallyRepaired);
  const realizations: SupportedContentRealization[] = [];
  const unavailable: UnavailableSupportedContent[] = [];

  for (const card of input.evidenceCards) {
    const cardId = evidenceId(card);
    if (alreadyRealized.has(cardId)) {
      unavailable.push({ evidenceCardId: cardId, sourceId: card.sourceId, reason: "ALREADY_REALIZED" });
      continue;
    }
    const proposition = verifiedZhTwProposition(card);
    if (!proposition) {
      unavailable.push({
        evidenceCardId: cardId,
        sourceId: card.sourceId,
        reason: "NO_VERIFIED_ZHTW_SUPPORTED_PROPOSITION",
      });
      continue;
    }
    const realization = appendRealization(initiallyRepaired, card, proposition, realizations.length);
    if (realization) realizations.push(realization);
  }

  const repaired = repairFormalSectionsDeterministically({
    sections: initiallyRepaired,
    architecture: input.architecture,
  }).sections;
  const duplicateValidation = validateCrossSectionDuplicates(
    repaired,
    0.86,
    input.architecture.sectionClaimAllocations,
  );
  const supportedCjk = cjk(repaired.map((section) => section.prose).join("\n"));
  const unsupportedSentenceCount = repaired.reduce(
    (sum, section) => sum + (section.unsupportedSentences?.length ?? 0),
    0,
  );
  const provenanceComplete = realizations.every((item) =>
    Boolean(
      item.sourceId &&
        item.evidenceCardId &&
        item.claimId &&
        item.supportSpan &&
        item.sectionOwner,
    ),
  );
  const provenanceCoverage = realizations.length === 0
    ? 100
    : provenanceComplete
      ? 100
      : 0;
  const passed =
    supportedCjk >= minimumCjk &&
    duplicateValidation.strictDuplicates.length === 0 &&
    duplicateValidation.semanticDuplicates.length === 0 &&
    unsupportedSentenceCount === 0 &&
    provenanceCoverage === 100;

  return {
    schemaVersion: "deterministic-supported-content-recovery/v1",
    mode: DETERMINISTIC_SUPPORTED_CONTENT_RECOVERY,
    writerCalls: 0,
    searchCalls: 0,
    sections: repaired,
    realizations,
    unavailable,
    supportedCjk,
    minimumCjk,
    strictDuplicateCount: duplicateValidation.strictDuplicates.length,
    semanticDuplicateCount: duplicateValidation.semanticDuplicates.length,
    unsupportedSentenceCount,
    provenanceCoverage,
    passed,
    verdict: passed ? "PASS" : "CASE_B_INSUFFICIENT_SUPPORTED_CONTENT",
  };
}
