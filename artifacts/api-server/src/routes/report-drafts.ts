import { Router, type IRouter } from "express";
import { createHash, randomUUID } from "node:crypto";
import { normalizeSourceRecord, type ReportMode, type SourceRecord } from "@workspace/api-zod";
import { getReportReadiness } from "@workspace/api-zod/report-readiness";
import { resolveSourceMixProfile } from "@workspace/api-zod/source-mix-profile";
import {
  writeReportWithLlm,
  type ReportWriterEvidenceCard,
  type ReportWriterInput,
  type ReportWriterResult,
  type ReportWriterSection,
  type ReportWriterSectionPlan,
} from "../services/report-writer";
import {
  removeBoilerplateLines,
  scoreEvidenceRelevance,
} from "../services/research/grounding/evidencePipelineGuards";

type ReportDraftGenerationMode =
  | "llm_evidence_grounded"
  | "fallback_conservative_draft";

export type ReportDraftHandler = (
  input: ReportWriterInput,
) => Promise<ReportWriterResult>;

export interface ReportDraftRouterOptions {
  reportWriter?: ReportDraftHandler;
}

interface MissingEvidenceItem {
  sectionId: string;
  title: string;
  reason: string;
  requiredEvidenceRoles: string[];
}

interface DraftClaim {
  id: string;
  sectionId: string;
  text: string;
  evidenceCardIds: string[];
  sourceIds: string[];
  supportLevel: "supported" | "partial" | "missing";
}

interface DraftCitation {
  id: string;
  marker: string;
  sourceId: string;
  evidenceCardId: string;
  title: string;
  url: string | null;
}

interface EvidenceCardRejection {
  id: string;
  sourceId: string | null;
  reason: string;
  diagnostics: string[];
}

interface SectionEvidenceBundle {
  sectionId: string;
  sectionTitle: string;
  requiredAspects: string[];
  evidenceCards: ReportWriterEvidenceCard[];
  coverageStatus: "sufficient" | "weak" | "insufficient";
  missingAspects: string[];
  canGenerate: boolean;
  diagnostics: string[];
}

interface GroundedSectionDiagnostics {
  groundingStatus: "grounded" | "partially_grounded" | "unsupported";
  unsupportedSentences: string[];
  citationMarkers: string[];
  diagnostics: string[];
}

interface SectionGroundingDiagnostic {
  sectionId: string;
  groundingStatus: GroundedSectionDiagnostics["groundingStatus"];
  unsupportedSentences: string[];
  diagnostics: string[];
  evidenceCardIds: string[];
  citationMarkers: string[];
  evidenceCount: number;
  needsReviewCount: number;
}

type ServerEvidenceChunk = {
  text: string;
  sourceLocation: string;
  sectionHeading?: string;
};

const DEFAULT_OUTLINE = [
  { sectionId: "introduction", title: "研究背景" },
  { sectionId: "findings", title: "主要發現" },
  { sectionId: "discussion", title: "分析與討論" },
  { sectionId: "limitations", title: "限制說明" },
  { sectionId: "conclusion", title: "結論" },
] as const;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => cleanString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
}

function topicHash(topic: string): string {
  return createHash("sha256").update(topic).digest("hex").slice(0, 16);
}

function normalizeReportMode(value: unknown, sourceCount: number): ReportMode {
  if (value === "short" || value === "standard") return value;
  return sourceCount >= 5 ? "standard" : "short";
}

function normalizeAcceptedSources(
  value: unknown,
  workflowId: string,
  hash: string,
  topic: string,
): SourceRecord[] {
  if (!Array.isArray(value)) return [];
  const records: SourceRecord[] = [];
  value.forEach((source, index) => {
    if (!source || typeof source !== "object") return;
    try {
      const normalized = normalizeSourceRecord(source as SourceRecord);
      records.push({
        ...normalized,
        id: normalized.id || `source-${index + 1}`,
        workflowId: normalized.workflowId || workflowId,
        topicHash: normalized.topicHash || hash,
        topic: normalized.topic || topic,
        reviewState: "accepted" as const,
        acceptedByUser: true,
        userDecision: normalized.userDecision || "accepted",
      });
    } catch {
      // Ignore malformed source entries; validation below checks that at least one remains.
    }
  });
  return records;
}

function normalizeEvidenceCards(
  value: unknown,
  sources: SourceRecord[],
  workflowId: string,
  hash: string,
  topic: string,
): {
  cards: ReportWriterEvidenceCard[];
  rejected: EvidenceCardRejection[];
  diagnostics: string[];
} {
  const sourceIds = new Set(sources.map((source) => source.id));
  const rawCards = Array.isArray(value) ? value : [];
  const rejected: EvidenceCardRejection[] = [];
  const diagnostics: string[] = [];
  const normalized = rawCards
    .map((card, index): ReportWriterEvidenceCard | null => {
      if (!card || typeof card !== "object") return null;
      const data = card as Record<string, unknown>;
      const sourceId = cleanString(data.sourceId) ?? cleanString(data.source_id);
      const id =
        cleanString(data.id) ??
        cleanString(data.evidenceId) ??
        cleanString(data.evidence_id) ??
        `evidence:${sourceId ?? "unknown"}:${index}`;
      if (!sourceId || !sourceIds.has(sourceId)) {
        rejected.push({
          id,
          sourceId: sourceId ?? null,
          reason: "source_not_accepted",
          diagnostics: ["rejected:source_not_accepted"],
        });
        return null;
      }
      const source = sources.find((item) => item.id === sourceId);
      const supportSpan =
        cleanString(data.supportSpan) ??
        (Array.isArray(data.supportSpans)
          ? (data.supportSpans as unknown[])
              .map((item) =>
                item && typeof item === "object"
                  ? cleanString((item as Record<string, unknown>).text)
                  : undefined,
              )
              .find(Boolean)
          : undefined);
      const claim =
        cleanString(data.claimText) ??
        cleanString(data.claimTextZhTw) ??
        cleanString(data.claimTextZh) ??
        cleanString(data.claim) ??
        cleanString(data.mainClaimZhTw);
      const cleanedSupport = removeBoilerplateLines(supportSpan ?? "");
      const cleanedClaim = removeBoilerplateLines(claim ?? "");
      const boilerplateRatio =
        Math.max(
          cleanedSupport.removedLineCount / cleanedSupport.originalLineCount,
          cleanedClaim.removedLineCount / cleanedClaim.originalLineCount,
        );
      if (!claim || !supportSpan) {
        rejected.push({
          id,
          sourceId,
          reason: "missing_claim_or_support_span",
          diagnostics: ["rejected:missing_claim_or_support_span"],
        });
        return null;
      }
      if (!cleanedSupport.text || !cleanedClaim.text || boilerplateRatio >= 0.45) {
        rejected.push({
          id,
          sourceId,
          reason: "boilerplate_or_empty_after_cleaning",
          diagnostics: [
            `rejected:boilerplate_ratio:${boilerplateRatio.toFixed(2)}`,
            ...cleanedSupport.flags.map((flag) => `support:${flag}`),
            ...cleanedClaim.flags.map((flag) => `claim:${flag}`),
          ],
        });
        return null;
      }
      if (source?.title && cleanedClaim.text === source.title.trim()) {
        rejected.push({
          id,
          sourceId,
          reason: "source_title_used_as_claim",
          diagnostics: ["rejected:source_title_used_as_claim"],
        });
        return null;
      }
      const relevance = scoreEvidenceRelevance({
        topic,
        title: source?.title ?? cleanString(data.sourceTitle),
        body: `${cleanedClaim.text} ${cleanedSupport.text}`,
        source: {
          title: source?.title ?? cleanString(data.sourceTitle) ?? "",
          doi: source?.doi ?? cleanString(data.doi),
          isPeerReviewed: source?.isPeerReviewed ?? (typeof data.isPeerReviewed === "boolean" ? data.isPeerReviewed : undefined),
          sourceQualityScore:
            typeof data.sourceQuality === "number"
              ? data.sourceQuality
              : typeof data.sourceQualityScore === "number"
                ? data.sourceQualityScore
                : undefined,
          recommendationBucket:
            source?.recommendationBucket ??
            (typeof data.recommendationBucket === "string"
              ? data.recommendationBucket as never
              : undefined),
        },
        boilerplateRatio,
      });
      if (!relevance.accepted) {
        rejected.push({
          id,
          sourceId,
          reason: relevance.reason,
          diagnostics: relevance.diagnostics,
        });
        return null;
      }
      diagnostics.push(relevance.reason);
      const extractionMethod =
        data.extractionMethod === "llm_structured_extract" ||
        data.extractionMethod === "manual_review" ||
        data.extractionMethod === "rule_fallback_claim_extraction"
          ? data.extractionMethod
          : data.extractedBy === "llm"
            ? "llm_structured_extract"
            : "rule_fallback_claim_extraction";
      const needsReview =
        data.needsReview === true ||
        data.needsManualReview === true ||
        extractionMethod === "rule_fallback_claim_extraction";
      const groundingConfidence =
        typeof data.groundingConfidence === "number"
          ? data.groundingConfidence
          : typeof data.confidence === "number"
            ? data.confidence
            : extractionMethod === "llm_structured_extract"
              ? 0.65
              : 0.52;
      return {
        id,
        evidenceId: cleanString(data.evidenceId) ?? id,
        sourceId,
        workflowId: cleanString(data.workflowId) ?? workflowId,
        topicHash: cleanString(data.topicHash) ?? hash,
        title: cleanString(data.title) ?? cleanString(data.sourceTitle) ?? source?.title ?? "",
        claim: cleanedClaim.text,
        claimText: cleanedClaim.text,
        claimTextZhTw: cleanString(data.claimTextZhTw) ?? cleanedClaim.text,
        claimTextZh: cleanString(data.claimTextZh) ?? cleanedClaim.text,
        supportSpan: cleanedSupport.text,
        supportStart: typeof data.supportStart === "number" ? data.supportStart : undefined,
        supportEnd: typeof data.supportEnd === "number" ? data.supportEnd : undefined,
        supportedByText: cleanedSupport.text,
        evidence: cleanString(data.evidence) ?? cleanedSupport.text,
        summary: cleanString(data.summary) ?? cleanedClaim.text,
        sourceSummaryZhTw: cleanString(data.sourceSummaryZhTw) ?? source?.readableSummaryZhTw ?? "",
        relevance: cleanString(data.relevance) ?? "accepted_source",
        sourceTitle: cleanString(data.sourceTitle) ?? source?.title ?? "",
        sourceProvider: cleanString(data.sourceProvider) ?? source?.provider ?? source?.sourceType ?? "",
        recommendationBucket:
          data.recommendationBucket === "scholarly_recommended" ||
          data.recommendationBucket === "official_background" ||
          data.recommendationBucket === "manual_review" ||
          data.recommendationBucket === "rejected"
            ? data.recommendationBucket
            : source?.recommendationBucket ?? null,
        sourceRole: cleanString(data.sourceRole) ?? source?.sourceRole ?? null,
        retrievalMode: cleanString(data.retrievalMode) ?? source?.retrievalMode ?? null,
        isPeerReviewed:
          typeof data.isPeerReviewed === "boolean" ? data.isPeerReviewed : source?.isPeerReviewed ?? null,
        venue: cleanString(data.venue) ?? source?.containerTitle ?? null,
        doi: cleanString(data.doi) ?? source?.doi ?? null,
        abstract: cleanString(data.abstract) ?? source?.abstract ?? null,
        provider: cleanString(data.provider) ?? source?.provider ?? source?.sourceType ?? null,
        year: typeof data.year === "number" ? data.year : source?.year ?? null,
        usableSections: stringList(data.usableSections),
        sectionFit: stringList(data.sectionFit),
        citationText: cleanString(data.citationText) ?? source?.title ?? "",
        citationMarker: cleanString(data.citationMarker) ?? cleanString(data.citation_marker) ?? `[S${index + 1}]`,
        limitation: cleanString(data.limitation) ?? null,
        limitations: stringList(data.limitations),
        limitationsZhTw: stringList(data.limitationsZhTw),
        sectionTargets: stringList(data.sectionTargets),
        sourceAccessLevel: cleanString(data.sourceAccessLevel) ?? source?.accessLevel ?? null,
        source_access_level: cleanString(data.source_access_level) ?? source?.accessLevel ?? null,
        derivation: cleanString(data.derivation) ?? null,
        evidenceGrounding: cleanString(data.evidenceGrounding) ?? source?.evidenceGrounding ?? null,
        summaryStructuredStatus: cleanString(data.summaryStructuredStatus) ?? source?.summaryStructuredStatus ?? null,
        llmSummaryStatus: cleanString(data.llmSummaryStatus) ?? source?.llmSummaryStatus ?? null,
        topicRelevance:
          typeof data.topicRelevance === "number"
            ? data.topicRelevance
            : relevance.score,
        sourceQuality:
          typeof data.sourceQuality === "number"
            ? data.sourceQuality
            : relevance.sourceQuality,
        groundingConfidence:
          extractionMethod === "rule_fallback_claim_extraction"
            ? Math.min(0.55, groundingConfidence)
            : groundingConfidence,
        extractionMethod,
        needsReview,
        rejectionReason: cleanString(data.rejectionReason),
        extractedAt: cleanString(data.extractedAt) ?? cleanString(data.createdAt),
      };
    })
    .filter((card): card is ReportWriterEvidenceCard => Boolean(card));

  return { cards: normalized, rejected, diagnostics };
}

function firstSupportSentence(value: string, limit = 420): string {
  const text = value.replace(/\s+/g, " ").trim();
  const sentence = text.split(/(?<=[。！？.!?])\s+/u)[0]?.trim() ?? text;
  if (sentence.length <= limit) return sentence;
  return sentence.slice(0, limit).trim();
}

function sourceChunksForServerEvidence(source: SourceRecord): ServerEvidenceChunk[] {
  const record = source as SourceRecord & Record<string, unknown>;
  const extractedChunks = Array.isArray(record.extractedChunks) ? record.extractedChunks : [];
  const chunks = extractedChunks
    .map((item): ServerEvidenceChunk | null => {
      if (!item || typeof item !== "object") return null;
      const chunk = item as unknown as Record<string, unknown>;
      const text = cleanString(chunk.text) ?? cleanString(chunk.chunkText);
      if (!text) return null;
      const result: ServerEvidenceChunk = {
        text,
        sourceLocation:
          cleanString(chunk.source_location) ??
          cleanString(chunk.sourceLocation) ??
          cleanString(chunk.location) ??
          "extracted_chunk",
      };
      const sectionHeading = cleanString(chunk.section_heading) ?? cleanString(chunk.sectionHeading);
      if (sectionHeading) result.sectionHeading = sectionHeading;
      return result;
    })
    .filter((item): item is ServerEvidenceChunk => Boolean(item));
  if (chunks.length > 0) return chunks.slice(0, 2);
  const abstract =
    cleanString(record.extractedAbstract) ??
    cleanString(record.abstractOriginal) ??
    cleanString(record.originalAbstract) ??
    cleanString(record.abstract);
  return abstract ? [{ text: abstract, sourceLocation: "abstract", sectionHeading: "Abstract" }] : [];
}

function normalizedSourceQuality(source: SourceRecord): number | null {
  const raw = source.sourceQualityScore ?? source.relevanceScore ?? source.finalScore ?? null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw > 1 ? raw / 100 : raw;
}

function derivedSectionFit(source: SourceRecord): string[] {
  const base = new Set<string>();
  for (const section of stringList(source.usableSections)) {
    if (section === "研究背景") {
      base.add("background");
      base.add("introduction");
    }
    if (section === "文獻探討") base.add("literature_review");
    if (section === "研究方法") base.add("methods_context");
    if (section === "數據分析") {
      base.add("analysis");
      base.add("findings");
    }
    if (section === "結論") {
      base.add("discussion");
      base.add("conclusion");
      base.add("limitations");
    }
  }
  if (source.recommendationBucket === "official_background") {
    base.add("background");
    base.add("introduction");
    base.add("concept_explanation");
  }
  if (base.size === 0) {
    base.add("background");
    base.add("literature_review");
    base.add("discussion");
  }
  return Array.from(base);
}

function deriveEvidenceCardsFromAcceptedSources(input: {
  sources: SourceRecord[];
  existingCards: ReportWriterEvidenceCard[];
  workflowId: string;
  hash: string;
  topic: string;
}): ReportWriterEvidenceCard[] {
  const existingSourceIds = new Set(input.existingCards.map((card) => card.sourceId));
  const cards: ReportWriterEvidenceCard[] = [];
  input.sources.forEach((source, sourceIndex) => {
    const sourceRecord = source as SourceRecord & {
      usageRecommendation?: string | null;
      qualityWarnings?: string[] | null;
    };
    if (!source.id || existingSourceIds.has(source.id)) return;
    if (source.recommendationBucket === "rejected" || sourceRecord.usageRecommendation === "exclude") return;
    const chunks = sourceChunksForServerEvidence(source);
    chunks.forEach((chunk, chunkIndex) => {
      const cleaned = removeBoilerplateLines(chunk.text);
      const supportSpan = firstSupportSentence(cleaned.text);
      if (!supportSpan || supportSpan.length < 40) return;
      if (source.title && supportSpan.toLowerCase() === source.title.trim().toLowerCase()) return;
      const relevance = scoreEvidenceRelevance({
        topic: input.topic,
        title: source.title,
        body: supportSpan,
        source: {
          title: source.title,
          doi: source.doi ?? undefined,
          isPeerReviewed: source.isPeerReviewed ?? undefined,
          sourceQualityScore: normalizedSourceQuality(source) ?? undefined,
          recommendationBucket: source.recommendationBucket ?? undefined,
        },
        boilerplateRatio: cleaned.removedLineCount / cleaned.originalLineCount,
      });
      if (!relevance.accepted) return;
      const id = `evidence:${source.id}:server-derived:${chunkIndex + 1}`;
      const sectionFit = derivedSectionFit(source);
      const createdAt = new Date().toISOString();
      cards.push({
        id,
        evidenceId: id,
        evidenceCardId: id,
        sourceId: source.id,
        workflowId: input.workflowId,
        topicHash: input.hash,
        claimTextOriginal: supportSpan,
        claimText: supportSpan,
        claimTextZh: supportSpan,
        claim: supportSpan,
        claimTextZhTw: supportSpan,
        mainClaim: supportSpan,
        mainClaimZhTw: supportSpan,
        supportSpan,
        supportedByText: supportSpan,
        supportStart: Math.max(0, cleaned.text.indexOf(supportSpan)),
        supportEnd: Math.max(0, cleaned.text.indexOf(supportSpan)) + supportSpan.length,
        evidence: supportSpan,
        evidencePointZhTw: supportSpan,
        usableEvidence: supportSpan,
        summary: supportSpan,
        supportingClaims: [],
        supportSpans: [{ text: supportSpan, startOffset: Math.max(0, cleaned.text.indexOf(supportSpan)), endOffset: Math.max(0, cleaned.text.indexOf(supportSpan)) + supportSpan.length, sectionHeading: chunk.sectionHeading }],
        citationMarker: `[S${input.existingCards.length + cards.length + 1}]`,
        sourceSummaryZhTw: "",
        relevance: "server_derived_support_span",
        sourceType: source.sourceType,
        reliability: source.confidence ?? "需人工複核",
        limitations: Array.from(new Set([
          "server_derived_from_accepted_source_text",
          "rule_fallback_claim_extraction",
          ...(sourceRecord.qualityWarnings ?? []),
        ])),
        limitationsZhTw: Array.from(new Set([
          "由伺服器依已接受來源文字抽出 exact supportSpan，仍需人工複核。",
          ...(sourceRecord.qualityWarnings ?? []),
        ])),
        sectionTargets: sectionFit,
        sectionFit,
        sourceTitle: source.title,
        sourceProvider: source.provider ?? source.sourceType,
        sourceAccessLevel: source.accessLevel ?? "abstract_only",
        source_access_level: source.accessLevel ?? "abstract_only",
        extractionStatus: source.extractionStatus ?? null,
        evidenceType: chunk.sourceLocation === "abstract" ? "background" : "finding",
        evidence_type: chunk.sourceLocation === "abstract" ? "background" : "finding",
        quotedText: supportSpan,
        quoted_text: supportSpan,
        sourceLocation: chunk.sourceLocation,
        source_location: chunk.sourceLocation,
        sectionHeading: chunk.sectionHeading ?? null,
        section_heading: chunk.sectionHeading ?? null,
        trace: {
          provider: source.provider ?? source.sourceType,
          query_used: source.queryUsed ?? undefined,
          url: source.url ?? undefined,
          doi: source.doi ?? undefined,
          extraction_method: "server_rule_support_span",
        },
        recommendationBucket: source.recommendationBucket ?? null,
        sourceRole: source.sourceRole ?? null,
        retrievalMode: source.retrievalMode ?? null,
        isPeerReviewed: source.isPeerReviewed ?? null,
        venue: source.containerTitle ?? null,
        providerHealthSnapshot: source.providerHealthSnapshot ?? null,
        acceptedByUser: true,
        userDecision: source.userDecision ?? "accepted",
        acceptedAs: source.acceptedAs ?? null,
        doi: source.doi ?? null,
        abstract: source.abstract ?? null,
        provider: source.provider ?? source.sourceType,
        relevanceScore: source.relevanceScore ?? null,
        topicRelevance: relevance.score,
        sourceQualityScore: source.sourceQualityScore ?? null,
        sourceQuality: relevance.sourceQuality,
        groundingConfidence: 0.55,
        finalScore: source.finalScore ?? source.relevanceScore ?? null,
        year: source.year ?? null,
        usableSections: sectionFit,
        citationText: source.title,
        limitation: "rule_fallback_claim_extraction；需人工複核。",
        derivation: chunk.sourceLocation === "abstract" ? "abstract-derived" : "fulltext-derived",
        evidenceGrounding: source.evidenceGrounding ?? null,
        summaryStructuredStatus: source.summaryStructuredStatus ?? null,
        llmSummaryStatus: source.llmSummaryStatus ?? null,
        needsManualReview: true,
        needsReview: true,
        extractionMethod: "rule_fallback_claim_extraction",
        rejectionReason: null,
        extractedAt: createdAt,
        governanceFlags: ["server_derived_support_span", "rule_fallback_claim_extraction"],
        sourceMetadata: {
          url: source.url,
          title: source.title,
          year: source.year,
          provider: source.provider,
        },
      });
    });
  });
  return cards;
}

function normalizeOutline(value: unknown): Array<{ sectionId: string; title: string }> {
  if (!Array.isArray(value)) return [...DEFAULT_OUTLINE];
  const normalized = value
    .map((item, index) => {
      if (typeof item === "string" && item.trim()) {
        return { sectionId: `section_${index + 1}`, title: item.trim() };
      }
      if (!item || typeof item !== "object") return null;
      const data = item as Record<string, unknown>;
      const title = cleanString(data.title) ?? cleanString(data.heading);
      if (!title) return null;
      return {
        sectionId: cleanString(data.sectionId) ?? cleanString(data.id) ?? `section_${index + 1}`,
        title,
      };
    })
    .filter((section): section is { sectionId: string; title: string } => Boolean(section));
  return normalized.length > 0 ? normalized : [...DEFAULT_OUTLINE];
}

function roleText(card: ReportWriterEvidenceCard): string {
  return String(card.sourceRole ?? card.recommendationBucket ?? card.sourceProvider ?? "").toLowerCase();
}

function roleSupportsFindings(card: ReportWriterEvidenceCard): boolean {
  const text = roleText(card);
  if (/background_definition|definition_or_concept|case_or_news|news|encyclopedia|wikipedia/.test(text)) {
    return false;
  }
  return /academic_evidence|core_scholarly|professional_guidance|official_statistics|data_or_dataset|statistics_or_dataset|scholarly|official|peer|journal|doi/.test(text);
}

function cardFitsSection(sectionId: string, card: ReportWriterEvidenceCard): boolean {
  const fit = new Set([
    ...stringList(card.sectionFit),
    ...stringList(card.sectionTargets),
    ...stringList(card.usableSections),
  ].map((item) => item.toLowerCase()));
  if (sectionId === "findings" || /finding|發現|文獻|literature|analysis/.test(sectionId)) {
    return fit.has("findings") ||
      fit.has("finding") ||
      fit.has("analysis") ||
      fit.has("literature_review") ||
      fit.has("文獻探討") ||
      fit.has("數據分析");
  }
  if (/background|intro|背景|introduction/.test(sectionId)) {
    return fit.has("background") || fit.has("introduction") || fit.has("研究背景");
  }
  if (/method|方法/.test(sectionId)) {
    return fit.has("method") || fit.has("methodology") || fit.has("methods_context") || card.evidenceType === "method";
  }
  if (/discussion|討論|conclusion|結論|limitations|限制/.test(sectionId)) {
    return fit.has("discussion") || fit.has("conclusion") || fit.has("limitations") || fit.has("limitation");
  }
  return fit.size === 0;
}

function sectionCards(
  sectionId: string,
  cards: ReportWriterEvidenceCard[],
): ReportWriterEvidenceCard[] {
  if (sectionId === "findings" || /finding|發現|文獻|探討|discussion|analysis/.test(sectionId)) {
    return cards.filter((card) => roleSupportsFindings(card) && cardFitsSection(sectionId, card)).slice(0, 4);
  }
  if (/background|intro|背景|introduction/.test(sectionId)) {
    return cards
      .filter((card) =>
        cardFitsSection(sectionId, card) &&
        /background_definition|official|professional|academic|definition/.test(roleText(card)))
      .slice(0, 3);
  }
  return cards.filter((card) => cardFitsSection(sectionId, card)).slice(0, 3);
}

function markerForCard(card: ReportWriterEvidenceCard, cards: ReportWriterEvidenceCard[]): string {
  const index = cards.findIndex((item) => item.id === card.id);
  return `[S${index + 1}]`;
}

function conciseClaim(card: ReportWriterEvidenceCard): string {
  const raw = card.claimText || card.claimTextZhTw || card.claimTextZh || card.claim || card.summary;
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

function requiredAspectsForSection(sectionId: string): string[] {
  if (/background|intro|背景/.test(sectionId)) return ["background_or_definition", "topic_relevance"];
  if (/findings|發現/.test(sectionId)) return ["academic_or_official_evidence", "supported_claim", "citation"];
  if (/literature|文獻|discussion|探討/.test(sectionId)) return ["multiple_sources", "supported_claim", "limitations"];
  if (/method|方法/.test(sectionId)) return ["method_or_data_boundary"];
  if (/limitations|限制/.test(sectionId)) return ["evidence_boundary"];
  if (/conclusion|結論/.test(sectionId)) return ["prior_supported_claims"];
  return ["supported_claim", "citation"];
}

function buildSectionEvidenceBundles(input: {
  outline: Array<{ sectionId: string; title: string }>;
  cards: ReportWriterEvidenceCard[];
}): SectionEvidenceBundle[] {
  return input.outline.map((section) => {
    const cards = sectionCards(section.sectionId, input.cards);
    const sourceCount = new Set(cards.map((card) => card.sourceId)).size;
    const requiredAspects = requiredAspectsForSection(section.sectionId);
    const fallbackCount = cards.filter((card) => card.extractionMethod === "rule_fallback_claim_extraction").length;
    const supportedCount = cards.filter((card) => (card.groundingConfidence ?? 0.5) >= 0.56 && !card.needsReview).length;
    const missingAspects = requiredAspects.filter((aspect) => {
      if (aspect === "multiple_sources") return sourceCount < 2;
      if (aspect === "academic_or_official_evidence") return !cards.some(roleSupportsFindings);
      if (aspect === "citation") return cards.length === 0;
      if (aspect === "supported_claim") return cards.length === 0;
      if (aspect === "limitations") return cards.every((card) => (card.limitations ?? []).length === 0);
      return cards.length === 0;
    });
    const threshold = /literature|文獻|discussion|探討/.test(section.sectionId) ? 3 : /findings|發現/.test(section.sectionId) ? 2 : 1;
    const canBeSufficient = fallbackCount < cards.length && supportedCount > 0;
    const coverageStatus: SectionEvidenceBundle["coverageStatus"] =
      cards.length >= threshold && sourceCount >= (/literature|findings/.test(section.sectionId) ? 2 : 1) && canBeSufficient
        ? "sufficient"
        : cards.length > 0
          ? "weak"
          : "insufficient";
    return {
      sectionId: section.sectionId,
      sectionTitle: section.title,
      requiredAspects,
      evidenceCards: cards,
      coverageStatus,
      missingAspects,
      canGenerate: coverageStatus !== "insufficient",
      diagnostics: [
        `evidence:${cards.length}`,
        `sources:${sourceCount}`,
        `fallback:${fallbackCount}`,
        ...missingAspects.map((aspect) => `missing:${aspect}`),
      ],
    };
  });
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[。！？.!?；;])|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractMarkers(text: string): string[] {
  return Array.from(new Set(text.match(/\[S\d+\]/gu) ?? []));
}

const SUBSTANTIVE_CLAIM_PATTERN =
  /顯示|指出|說明|依賴|應用|应用|廣泛|广泛|能量密度|安全性|回收|支持|支撐|影響|相關|發現|證實|根據|because|depend|show|indicate|support|use|application/i;

function textTokens(text: string): Set<string> {
  const normalized = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const tokens = normalized.split(/\s+/).filter((token) => token.length >= 2);
  for (const match of text.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const cjk = match[0];
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= cjk.length - size; index += 1) {
        tokens.push(cjk.slice(index, index + size));
      }
    }
  }
  return new Set(tokens);
}

function cardSupportText(card: ReportWriterEvidenceCard): string {
  return `${card.claimText ?? card.claimTextZhTw ?? card.claim} ${card.supportSpan ?? card.supportedByText ?? card.evidence}`;
}

function numericTokens(text: string): string[] {
  return Array.from(text.matchAll(/\d+(?:\.\d+)?\s*%?/gu)).map((match) =>
    match[0].replace(/\s+/g, ""),
  );
}

function sentenceNeedsStrictAlignment(sentence: string): boolean {
  return /(?:\d|%|因為|因此|導致|造成|影響|降低|提高|增加|減少|高於|低於|比較|優於|劣於|政策|建議|should|because|cause|causal|effect|increase|decrease|higher|lower|compare|policy)/iu.test(sentence);
}

function supportContainsRequiredNumbers(sentence: string, support: string): boolean {
  const numbers = numericTokens(sentence);
  if (numbers.length === 0) return true;
  const supportNumbers = new Set(numericTokens(support));
  return numbers.every((number) => supportNumbers.has(number));
}

function hasEnoughOverlap(sentence: string, support: string): boolean {
  const cleanSentence = sentence.replace(/\[S\d+\]/gu, "").trim();
  const sentenceTokens = textTokens(sentence);
  const supportTokens = textTokens(support);
  let overlap = 0;
  for (const token of sentenceTokens) {
    if (supportTokens.has(token)) overlap += 1;
  }
  const strict = sentenceNeedsStrictAlignment(cleanSentence);
  if (strict && !supportContainsRequiredNumbers(cleanSentence, support)) return false;
  if (overlap >= (strict ? 3 : 2)) return true;
  return support.includes(cleanSentence);
}

function hasEnoughCombinedOverlap(sentence: string, cards: ReportWriterEvidenceCard[]): boolean {
  const combinedSupport = cards.map(cardSupportText).join(" ");
  if (cards.some((card) => hasEnoughOverlap(sentence, cardSupportText(card)))) return true;
  return hasEnoughOverlap(sentence, combinedSupport);
}

export function verifyGroundedSection(input: {
  body: string;
  evidenceCards: ReportWriterEvidenceCard[];
}): GroundedSectionDiagnostics {
  const cardsByMarker = new Map(
    input.evidenceCards.map((card, index) => [
      card.citationMarker ?? `[S${index + 1}]`,
      card,
    ]),
  );
  const unsupportedSentences: string[] = [];
  const diagnostics: string[] = [];
  const citationMarkers: string[] = [];
  for (const sentence of splitSentences(input.body)) {
    if (/證據不足|需補查|尚未找到足以支撐/u.test(sentence)) continue;
    const markers = extractMarkers(sentence);
    citationMarkers.push(...markers);
    if (markers.length === 0) {
      if (!SUBSTANTIVE_CLAIM_PATTERN.test(sentence)) continue;
      unsupportedSentences.push(sentence);
      diagnostics.push("missing_citation_marker");
      continue;
    }
    const supportingCards = markers
      .map((marker) => cardsByMarker.get(marker))
      .filter((card): card is ReportWriterEvidenceCard => Boolean(card));
    if (supportingCards.length === 0) {
      unsupportedSentences.push(sentence);
      diagnostics.push(`unknown_citation:${markers.join(",")}`);
      continue;
    }
    if (!hasEnoughCombinedOverlap(sentence, supportingCards)) {
      unsupportedSentences.push(sentence);
      diagnostics.push(`low_overlap:${markers.join(",")}`);
    }
  }
  const groundingStatus: GroundedSectionDiagnostics["groundingStatus"] =
    unsupportedSentences.length === 0
      ? "grounded"
      : unsupportedSentences.length >= Math.max(2, splitSentences(input.body).length / 2)
        ? "unsupported"
        : "partially_grounded";
  return {
    groundingStatus,
    unsupportedSentences,
    citationMarkers: Array.from(new Set(citationMarkers)),
    diagnostics: Array.from(new Set(diagnostics)),
  };
}

function buildFallbackSections(input: {
  topic: string;
  outline: Array<{ sectionId: string; title: string }>;
  bundles: SectionEvidenceBundle[];
}): { sections: ReportWriterSection[]; claims: DraftClaim[]; missingEvidence: MissingEvidenceItem[] } {
  const claims: DraftClaim[] = [];
  const missingEvidence: MissingEvidenceItem[] = [];
  const sections = input.outline.map((section): ReportWriterSection => {
    const bundle = input.bundles.find((item) => item.sectionId === section.sectionId) ?? {
      sectionId: section.sectionId,
      sectionTitle: section.title,
      requiredAspects: requiredAspectsForSection(section.sectionId),
      evidenceCards: [],
      coverageStatus: "insufficient" as const,
      missingAspects: requiredAspectsForSection(section.sectionId),
      canGenerate: false,
      diagnostics: ["missing_bundle"],
    };
    const cards = bundle.evidenceCards;
    const findingsSection = section.sectionId === "findings" || /發現|文獻|探討|discussion|analysis/.test(section.title);
    if (!bundle.canGenerate) {
      missingEvidence.push({
        sectionId: section.sectionId,
        title: section.title,
        reason: findingsSection
          ? "主要發現需要 academic/professional/official/data evidence，不能只依賴百科或新聞。"
          : "此章節目前沒有可綁定的 evidence card。",
        requiredEvidenceRoles: findingsSection
          ? ["academic_evidence", "professional_guidance", "official_statistics", "data_or_dataset"]
          : ["background_definition", "official_statistics", "professional_guidance", "academic_evidence"],
      });
      return {
        sectionId: section.sectionId,
        title: section.title,
        prose: `本節目前證據不足，系統尚未找到足以支撐此段落的來源。建議補查：${bundle.missingAspects.join("、") || "直接相關來源與可引用片段"}。`,
        evidenceCardIds: [],
        citationIds: [],
        coverageStatus: "insufficient",
        groundingStatus: "unsupported",
        unsupportedSentences: [],
        generationMethod: "insufficient_evidence_notice",
        warnings: ["missingEvidence"],
      };
    }
    const markers = cards.map((card, index) => card.citationMarker ?? `[S${index + 1}]`);
    const claimText = cards.map(conciseClaim).filter(Boolean).slice(0, 2).join("；");
    const evidenceSentences = cards
      .map((card, index) => `${conciseClaim(card).replace(/[。！？.!?；;]+$/u, "")}${markers[index] ?? ""}。`)
      .filter((sentence) => sentence.replace(/\[S\d+\]|。/gu, "").trim())
      .slice(0, 3)
      .join("");
    const sectionClaim: DraftClaim = {
      id: `claim:${section.sectionId}:1`,
      sectionId: section.sectionId,
      text: claimText || `此段以 ${cards.length} 張 evidence card 保守整理「${input.topic}」。`,
      evidenceCardIds: cards.map((card) => card.id),
      sourceIds: cards.map((card) => card.sourceId),
      supportLevel: cards.length >= 2 ? "supported" : "partial",
    };
    claims.push(sectionClaim);
    const limitation =
      cards.some((card) => /background_definition|case_or_news|definition_or_concept/.test(roleText(card)))
        ? "此段包含背景或案例來源，因此只作界定與脈絡說明，不把它當成主要發現的唯一依據。"
        : "此段仍以已接受來源為範圍，未引用的資料不納入結論。";
    const prose = `${evidenceSentences}${limitation}`;
    const grounded = verifyGroundedSection({ body: prose, evidenceCards: cards });
    return {
      sectionId: section.sectionId,
      title: section.title,
      prose,
      evidenceCardIds: cards.map((card) => card.id),
      citationIds: cards.map((card) => card.sourceId),
      coverageStatus: bundle.coverageStatus,
      groundingStatus: grounded.groundingStatus,
      unsupportedSentences: grounded.unsupportedSentences,
      generationMethod: "fallback_bundle_synthesis",
      paragraphClaims: [
        {
          paragraphId: `${section.sectionId}:p1`,
          sectionId: section.sectionId,
          claimIds: [sectionClaim.id],
          evidenceCardIds: cards.map((card) => card.id),
          citationMarkers: markers,
          generatedTextZhTw: sectionClaim.text,
          unsupportedSentences: [],
        },
      ],
      warnings: [
        ...(sectionClaim.supportLevel === "partial" ? ["partial_evidence"] : []),
        ...(grounded.groundingStatus !== "grounded" ? ["grounding_verification_failed"] : []),
      ],
    };
  });
  return { sections, claims, missingEvidence };
}

function citationsForCards(cards: ReportWriterEvidenceCard[]): DraftCitation[] {
  return cards.map((card, index) => ({
    id: `citation:${card.sourceId}:${index + 1}`,
    marker: `[S${index + 1}]`,
    sourceId: card.sourceId,
    evidenceCardId: card.id,
    title: card.sourceTitle || card.title || card.sourceId,
    url:
      typeof card.sourceMetadata?.url === "string"
        ? card.sourceMetadata.url
        : null,
  }));
}

function missingEvidenceFromWriter(
  sectionPlan: ReportWriterSectionPlan[] | undefined,
  sections: ReportWriterSection[],
  cards: ReportWriterEvidenceCard[],
): MissingEvidenceItem[] {
  const missing: MissingEvidenceItem[] = [];
  for (const plan of sectionPlan ?? []) {
    if (plan.needsMoreEvidence || plan.evidenceGaps.length > 0) {
      missing.push({
        sectionId: plan.sectionId,
        title: plan.title,
        reason: plan.evidenceGaps.join("；") || "此章節證據仍不足。",
        requiredEvidenceRoles: ["academic_evidence", "professional_guidance", "official_statistics", "data_or_dataset"],
      });
    }
  }
  for (const section of sections) {
    const findingsSection = section.sectionId === "findings" || /發現|文獻|探討|discussion|analysis/.test(section.title);
    const boundCards = cards.filter((card) => section.evidenceCardIds.includes(card.id));
    if (findingsSection && boundCards.length > 0 && !boundCards.some(roleSupportsFindings)) {
      missing.push({
        sectionId: section.sectionId,
        title: section.title,
        reason: "主要發現不得只靠百科、背景或新聞來源。",
        requiredEvidenceRoles: ["academic_evidence", "professional_guidance", "official_statistics", "data_or_dataset"],
      });
    }
    if (section.evidenceCardIds.length === 0) {
      missing.push({
        sectionId: section.sectionId,
        title: section.title,
        reason: "正文段落沒有綁定 evidence card。",
        requiredEvidenceRoles: ["academic_evidence", "professional_guidance", "official_statistics", "background_definition"],
      });
    }
  }
  return missing;
}

function claimsFromSections(sections: ReportWriterSection[]): DraftClaim[] {
  return sections.flatMap((section) =>
    (section.paragraphClaims ?? []).map((claim, index) => ({
      id: claim.claimIds[0] ?? `claim:${section.sectionId}:${index + 1}`,
      sectionId: section.sectionId,
      text: claim.generatedTextZhTw,
      evidenceCardIds: claim.evidenceCardIds,
      sourceIds: section.citationIds,
      supportLevel: claim.evidenceCardIds.length > 0 ? "supported" as const : "missing" as const,
    })),
  );
}

function insufficientSectionFromBundle(bundle: SectionEvidenceBundle): ReportWriterSection {
  return {
    sectionId: bundle.sectionId,
    title: bundle.sectionTitle,
    prose: `本節目前證據不足，系統尚未找到足以支撐此段落的來源。建議補查：${bundle.missingAspects.join("、") || "直接相關來源與可引用片段"}。`,
    evidenceCardIds: [],
    citationIds: [],
    coverageStatus: "insufficient",
    groundingStatus: "unsupported",
    unsupportedSentences: [],
    generationMethod: "insufficient_evidence_notice",
    warnings: ["missingEvidence", ...bundle.diagnostics],
  };
}

function enforceSectionBundles(input: {
  sections: ReportWriterSection[];
  outline: Array<{ sectionId: string; title: string }>;
  bundles: SectionEvidenceBundle[];
  fallbackSections: ReportWriterSection[];
}): {
  sections: ReportWriterSection[];
  groundingDiagnostics: SectionGroundingDiagnostic[];
} {
  const sectionById = new Map(input.sections.map((section) => [section.sectionId, section]));
  const fallbackById = new Map(input.fallbackSections.map((section) => [section.sectionId, section]));
  const groundingDiagnostics: SectionGroundingDiagnostic[] = [];
  const sections = input.outline.map((outlineSection) => {
    const bundle = input.bundles.find((item) => item.sectionId === outlineSection.sectionId) ?? {
      sectionId: outlineSection.sectionId,
      sectionTitle: outlineSection.title,
      requiredAspects: requiredAspectsForSection(outlineSection.sectionId),
      evidenceCards: [],
      coverageStatus: "insufficient" as const,
      missingAspects: requiredAspectsForSection(outlineSection.sectionId),
      canGenerate: false,
      diagnostics: ["missing_bundle"],
    };
    if (!bundle.canGenerate) {
      const section = insufficientSectionFromBundle(bundle);
      groundingDiagnostics.push({
        sectionId: section.sectionId,
        groundingStatus: "unsupported",
        unsupportedSentences: [],
        diagnostics: bundle.diagnostics,
        evidenceCardIds: bundle.evidenceCards.map((card) => card.id),
        citationMarkers: [],
        evidenceCount: bundle.evidenceCards.length,
        needsReviewCount: bundle.evidenceCards.filter((card) => card.needsReview || card.needsManualReview).length,
      });
      return section;
    }
    const candidate = sectionById.get(outlineSection.sectionId) ?? fallbackById.get(outlineSection.sectionId);
    if (!candidate) {
      const section = insufficientSectionFromBundle(bundle);
      groundingDiagnostics.push({
        sectionId: section.sectionId,
        groundingStatus: "unsupported",
        unsupportedSentences: [],
        diagnostics: ["missing_generated_section"],
        evidenceCardIds: bundle.evidenceCards.map((card) => card.id),
        citationMarkers: [],
        evidenceCount: bundle.evidenceCards.length,
        needsReviewCount: bundle.evidenceCards.filter((card) => card.needsReview || card.needsManualReview).length,
      });
      return section;
    }
    const allowedEvidenceIds = new Set(bundle.evidenceCards.map((card) => card.id));
    const evidenceCardIds = candidate.evidenceCardIds.filter((id) => allowedEvidenceIds.has(id));
    const effectiveEvidenceCardIds =
      evidenceCardIds.length > 0
        ? evidenceCardIds
        : bundle.evidenceCards.map((card) => card.id);
    const evidenceCards = bundle.evidenceCards.filter((card) =>
      effectiveEvidenceCardIds.includes(card.id),
    );
    const grounded = verifyGroundedSection({
      body: candidate.prose,
      evidenceCards,
    });
    const hasReviewCards = evidenceCards.some((card) => card.needsReview || card.needsManualReview);
    const effectiveGroundingStatus =
      grounded.groundingStatus === "grounded" && hasReviewCards
        ? "partially_grounded"
        : grounded.groundingStatus;
    const effectiveDiagnostics = Array.from(new Set([
      ...grounded.diagnostics,
      ...(hasReviewCards ? ["needs_manual_review"] : []),
    ]));
    groundingDiagnostics.push({
      sectionId: candidate.sectionId,
      groundingStatus: effectiveGroundingStatus,
      unsupportedSentences: grounded.unsupportedSentences,
      diagnostics: effectiveDiagnostics,
      evidenceCardIds: effectiveEvidenceCardIds,
      citationMarkers: grounded.citationMarkers,
      evidenceCount: evidenceCards.length,
      needsReviewCount: evidenceCards.filter((card) => card.needsReview || card.needsManualReview).length,
    });
    if (grounded.unsupportedSentences.length > 0 || grounded.groundingStatus === "unsupported") {
      return {
        ...candidate,
        prose: `本節目前引用支撐不足，系統已暫停正式段落輸出。建議補查：${bundle.missingAspects.join("、") || "可直接支撐正文句子的來源"}。`,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationIds: evidenceCards.map((card) => card.sourceId),
        coverageStatus: bundle.coverageStatus,
        groundingStatus: effectiveGroundingStatus,
        unsupportedSentences: grounded.unsupportedSentences,
        generationMethod: "grounding_verifier_blocked",
        warnings: Array.from(new Set([
          ...(candidate.warnings ?? []),
          "grounding_verification_failed",
          ...(hasReviewCards ? ["needs_manual_review"] : []),
        ])),
      };
    }
    return {
      ...candidate,
      evidenceCardIds: effectiveEvidenceCardIds,
      citationIds: evidenceCards.map((card) => card.sourceId),
      coverageStatus: bundle.coverageStatus,
      groundingStatus: effectiveGroundingStatus,
      unsupportedSentences: grounded.unsupportedSentences,
      generationMethod: candidate.generationMethod ?? "bundle_grounded_section",
      warnings: Array.from(new Set([...(candidate.warnings ?? []), ...effectiveDiagnostics])),
    };
  });
  return { sections, groundingDiagnostics };
}

export function createReportDraftsRouter({
  reportWriter = writeReportWithLlm,
}: ReportDraftRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/report-drafts", async (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
    const topic = cleanString(body.topic);
    if (!topic) {
      res.status(400).json({ ok: false, message: "topic is required" });
      return;
    }
    const workflowId = cleanString(body.workflowId) ?? `draft-${randomUUID()}`;
    const hash = cleanString(body.topicHash) ?? topicHash(topic);
    const acceptedSources = normalizeAcceptedSources(body.acceptedSources, workflowId, hash, topic);
    if (acceptedSources.length === 0) {
      res.status(400).json({ ok: false, message: "acceptedSources is required" });
      return;
    }
    const evidenceNormalization = normalizeEvidenceCards(
      body.evidenceCards,
      acceptedSources,
      workflowId,
      hash,
      topic,
    );
    const serverDerivedEvidenceCards = deriveEvidenceCardsFromAcceptedSources({
      sources: acceptedSources,
      existingCards: evidenceNormalization.cards,
      workflowId,
      hash,
      topic,
    });
    const evidenceCards = [...evidenceNormalization.cards, ...serverDerivedEvidenceCards];
    const outline = normalizeOutline(body.outline);
    const sectionEvidenceBundles = buildSectionEvidenceBundles({ outline, cards: evidenceCards });
    const sourceMixProfile = resolveSourceMixProfile({
      sourceMixProfile: cleanString(body.sourceMixProfile),
      reportType: cleanString(body.reportType),
      audience: cleanString(body.audience),
      topic,
    });
    const reportMode = normalizeReportMode(body.reportMode, acceptedSources.length);
    const readiness = getReportReadiness({
      acceptedSources,
      evidenceCards,
      reportMode,
    });
    if (!readiness.canGenerate) {
      res.status(422).json({
        ok: false,
        code: "EVIDENCE_REQUIRED",
        message: readiness.message,
        readiness,
      });
      return;
    }
    if (reportMode === "standard" && !readiness.canGenerateStandard) {
      res.status(422).json({
        ok: false,
        code: "EVIDENCE_INSUFFICIENT_FOR_STANDARD_REPORT",
        message:
          "Standard/full report generation is blocked because usable evidence is insufficient.",
        readiness,
      });
      return;
    }
    const input: ReportWriterInput = {
      workflowId,
      jobId: cleanString(body.jobId) ?? workflowId,
      topicHash: hash,
      topic,
      originalTopic: cleanString(body.originalTopic),
      displayTitle: cleanString(body.displayTitle) ?? topic,
      reportMode,
      reportType: cleanString(body.reportType),
      audience: cleanString(body.audience),
      language: cleanString(body.language) ?? "繁體中文",
      locale: cleanString(body.locale) ?? "zh-TW",
      generationMode: evidenceCards.length >= 3 ? "formal" : "preliminary",
      sourceMixProfile,
      acceptedSources,
      acceptedSourceIds: acceptedSources.map((source) => source.id),
      evidenceCards,
      evidenceCardIds: evidenceCards.map((card) => card.id),
    };

    const writerResult = await reportWriter(input);
    const generationMode: ReportDraftGenerationMode =
      writerResult.ok && !writerResult.fallbackUsed && writerResult.sections.length > 0
        ? "llm_evidence_grounded"
        : "fallback_conservative_draft";
    const fallback = buildFallbackSections({ topic, outline, bundles: sectionEvidenceBundles });
    const rawSections = generationMode === "llm_evidence_grounded"
      ? writerResult.sections
      : fallback.sections;
    const enforced = enforceSectionBundles({
      sections: rawSections,
      outline,
      bundles: sectionEvidenceBundles,
      fallbackSections: fallback.sections,
    });
    const sections = enforced.sections;
    const claims = generationMode === "llm_evidence_grounded"
      ? claimsFromSections(sections)
      : fallback.claims;
    const citations = citationsForCards(evidenceCards);
    const missingEvidence = [
      ...missingEvidenceFromWriter(writerResult.sectionPlan, sections, evidenceCards),
      ...(generationMode === "fallback_conservative_draft" ? fallback.missingEvidence : []),
    ];
    const warnings = [
      writerResult.warning,
      writerResult.fallbackReason,
      evidenceCards.length === 0 ? "No valid evidence cards after schema, boilerplate, and topic relevance gates." : null,
      serverDerivedEvidenceCards.length > 0
        ? `${serverDerivedEvidenceCards.length} evidence cards were server-derived from accepted source support spans and require review.`
        : null,
      generationMode === "fallback_conservative_draft"
        ? "LLM unavailable or incomplete; returned fallback_conservative_draft with explicit missingEvidence."
      : null,
      ...missingEvidence.map((item) => `${item.sectionId}: ${item.reason}`),
    ].filter((item): item is string => Boolean(item));
    const blockedSections = sections.filter(
      (section) =>
        section.groundingStatus === "unsupported" ||
        section.generationMethod === "grounding_verifier_blocked",
    );
    const partialSections = sections.filter(
      (section) => section.groundingStatus === "partially_grounded",
    );
    const insufficientBundles = sectionEvidenceBundles.filter(
      (bundle) => !bundle.canGenerate || bundle.coverageStatus === "insufficient",
    );
    const reviewCards = evidenceCards.filter((card) => card.needsReview);
    const degradedMode =
      generationMode === "fallback_conservative_draft" ||
      reviewCards.length > 0 ||
      blockedSections.length > 0 ||
      partialSections.length > 0 ||
      insufficientBundles.length > 0 ||
      evidenceNormalization.rejected.length > 0;
    const fallbackReasons = [
      writerResult.fallbackReason,
      generationMode === "fallback_conservative_draft" ? "fallback_conservative_draft" : null,
      ...blockedSections.map((section) => `${section.sectionId}:grounding_verifier_blocked`),
      ...partialSections.map((section) => `${section.sectionId}:partially_grounded`),
      ...insufficientBundles.map((bundle) => `${bundle.sectionId}:insufficient_evidence_bundle`),
      evidenceNormalization.rejected.length > 0
        ? `${evidenceNormalization.rejected.length}:rejected_evidence_cards`
        : null,
      ...reviewCards
        .filter((card) => card.extractionMethod === "rule_fallback_claim_extraction")
        .map((card) => `${card.id}:rule_fallback_claim_extraction`),
    ].filter((item): item is string => Boolean(item));

    res.json({
      ok: true,
      status: writerResult.status,
      llm_status: writerResult.llm_status,
      fallback_used: generationMode === "fallback_conservative_draft",
      message: writerResult.message,
      warning: warnings.join(" | ") || null,
      draft: sections.map((section) => `${section.title}\n${section.prose}`).join("\n\n"),
      sections,
      sectionPlan: writerResult.sectionPlan ?? [],
      claims,
      citations,
      missingEvidence,
      normalizedTopic: {
        original: topic,
        topicHash: hash,
      },
      sourceCountSummary: {
        accepted: acceptedSources.length,
      },
      chunkCountSummary: {
        rejectedEvidenceCardCount: evidenceNormalization.rejected.length,
      },
      rejectedChunks: evidenceNormalization.rejected,
      rejectedChunkCount: evidenceNormalization.rejected.length,
      evidenceCards,
      sectionEvidenceBundles,
      reportSections: sections.map((section) => ({
        sectionId: section.sectionId,
        title: section.title,
        body: section.prose,
        citations: section.citationIds,
        groundingStatus: section.groundingStatus ?? "unsupported",
        unsupportedSentences: section.unsupportedSentences ?? [],
        evidenceCardIds: section.evidenceCardIds,
        generationMethod: section.generationMethod ?? generationMode,
        coverageStatus: section.coverageStatus ?? "insufficient",
      })),
      groundingDiagnostics: enforced.groundingDiagnostics,
      llmProviderStatus: {
        provider: writerResult.reportGenerationProvider,
        model: writerResult.reportGenerationModel,
        status: writerResult.reportGenerationStatus,
      },
      degradedMode,
      fallbackReasons,
      serverDerivedEvidenceCardCount: serverDerivedEvidenceCards.length,
      warnings,
      generationMode,
      reportGenerationProvider: writerResult.reportGenerationProvider,
      reportGenerationModel: writerResult.reportGenerationModel,
      reportGenerationStatus: writerResult.reportGenerationStatus,
      fallbackUsed: generationMode === "fallback_conservative_draft",
      fallbackReason: generationMode === "fallback_conservative_draft"
        ? warnings.join(" | ") || "fallback_conservative_draft"
        : null,
      reportMode,
      evidenceSufficiency: readiness.evidenceSufficiency,
      exportAllowed: readiness.canExport,
      sourceMixProfile,
      details: {
        reportMode,
        acceptedSourcesCount: acceptedSources.length,
        evidenceCardsCount: evidenceCards.length,
        distinctUsableEvidenceSourceCount: readiness.distinctUsableEvidenceSourceCount,
        evidenceSufficiency: readiness.evidenceSufficiency,
        exportAllowed: readiness.canExport,
        fallbackUsed: generationMode === "fallback_conservative_draft",
        requestedModel: writerResult.requestedModel ?? null,
        actualModel: writerResult.actualModel ?? null,
      },
    });
  });

  return router;
}

export default createReportDraftsRouter();
