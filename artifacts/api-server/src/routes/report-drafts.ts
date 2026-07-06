import { Router, type IRouter } from "express";
import { createHash, randomUUID } from "node:crypto";
import { normalizeSourceRecord, type ReportMode, type SourceRecord } from "@workspace/api-zod";
import { resolveSourceMixProfile } from "@workspace/api-zod/source-mix-profile";
import {
  writeReportWithLlm,
  type ReportWriterEvidenceCard,
  type ReportWriterInput,
  type ReportWriterResult,
  type ReportWriterSection,
  type ReportWriterSectionPlan,
} from "../services/report-writer";

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
): ReportWriterEvidenceCard[] {
  const sourceIds = new Set(sources.map((source) => source.id));
  const rawCards = Array.isArray(value) ? value : [];
  const normalized = rawCards
    .map((card, index): ReportWriterEvidenceCard | null => {
      if (!card || typeof card !== "object") return null;
      const data = card as Record<string, unknown>;
      const sourceId = cleanString(data.sourceId);
      if (!sourceId || !sourceIds.has(sourceId)) return null;
      const source = sources.find((item) => item.id === sourceId);
      const id = cleanString(data.id) ?? `evidence:${sourceId}:${index}`;
      const claim =
        cleanString(data.claimTextZhTw) ??
        cleanString(data.claimTextZh) ??
        cleanString(data.claim) ??
        cleanString(data.summary) ??
        `${source?.title ?? sourceId} 提供與主題相關的證據線索。`;
      return {
        id,
        evidenceId: cleanString(data.evidenceId) ?? id,
        sourceId,
        workflowId: cleanString(data.workflowId) ?? workflowId,
        topicHash: cleanString(data.topicHash) ?? hash,
        title: cleanString(data.title) ?? cleanString(data.sourceTitle) ?? source?.title ?? "",
        claim,
        claimTextZhTw: cleanString(data.claimTextZhTw) ?? claim,
        claimTextZh: cleanString(data.claimTextZh) ?? claim,
        evidence: cleanString(data.evidence) ?? cleanString(data.summary) ?? claim,
        summary: cleanString(data.summary) ?? claim,
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
        citationText: cleanString(data.citationText) ?? source?.title ?? "",
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
      };
    })
    .filter((card): card is ReportWriterEvidenceCard => Boolean(card));

  if (normalized.length > 0) return normalized;
  return sources.slice(0, 8).map((source, index) => ({
    id: `evidence:${source.id}:${index}`,
    evidenceId: `evidence:${source.id}:${index}`,
    sourceId: source.id,
    workflowId,
    topicHash: hash,
    title: source.title,
    claim: source.mainEvidencePointZhTw || source.readableSummaryZhTw || `${source.title} 提供與主題相關的保守證據線索。`,
    claimTextZhTw: source.mainEvidencePointZhTw || source.readableSummaryZhTw || `${source.title} 提供與主題相關的保守證據線索。`,
    evidence: source.readableSummaryZhTw || source.abstract || source.title,
    summary: source.readableSummaryZhTw || source.title,
    relevance: "accepted_source",
    sourceTitle: source.title,
    sourceProvider: source.provider || source.sourceType,
    recommendationBucket: source.recommendationBucket ?? null,
    sourceRole: source.sourceRole ?? null,
    retrievalMode: source.retrievalMode ?? null,
    isPeerReviewed: source.isPeerReviewed ?? null,
    venue: source.containerTitle ?? null,
    doi: source.doi ?? null,
    abstract: source.abstract ?? null,
    provider: source.provider ?? source.sourceType,
    year: source.year,
    usableSections: source.usableSections ?? [],
    citationText: source.title,
    limitation: null,
  }));
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

function sectionCards(
  sectionId: string,
  cards: ReportWriterEvidenceCard[],
): ReportWriterEvidenceCard[] {
  if (sectionId === "findings" || /finding|發現|文獻|探討|discussion|analysis/.test(sectionId)) {
    return cards.filter(roleSupportsFindings).slice(0, 3);
  }
  if (/background|intro|背景|introduction/.test(sectionId)) {
    return cards
      .filter((card) => /background_definition|official|professional|academic|definition/.test(roleText(card)))
      .slice(0, 3);
  }
  return cards.slice(0, 3);
}

function markerForCard(card: ReportWriterEvidenceCard, cards: ReportWriterEvidenceCard[]): string {
  const index = cards.findIndex((item) => item.id === card.id);
  return `[S${index + 1}]`;
}

function conciseClaim(card: ReportWriterEvidenceCard): string {
  const raw = card.claimTextZhTw || card.claimTextZh || card.claim || card.summary;
  return raw.replace(/\s+/g, " ").trim().slice(0, 120);
}

function buildFallbackSections(input: {
  topic: string;
  outline: Array<{ sectionId: string; title: string }>;
  cards: ReportWriterEvidenceCard[];
}): { sections: ReportWriterSection[]; claims: DraftClaim[]; missingEvidence: MissingEvidenceItem[] } {
  const claims: DraftClaim[] = [];
  const missingEvidence: MissingEvidenceItem[] = [];
  const sections = input.outline.map((section): ReportWriterSection => {
    const cards = sectionCards(section.sectionId, input.cards);
    const findingsSection = section.sectionId === "findings" || /發現|文獻|探討|discussion|analysis/.test(section.title);
    if (cards.length === 0) {
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
        prose: `【證據不足】「${input.topic}」在「${section.title}」仍缺少可引用的 evidence card，因此目前只能標記為 missingEvidence，不能假裝已有充分結論。`,
        evidenceCardIds: [],
        citationIds: [],
        warnings: ["missingEvidence"],
      };
    }
    const markers = cards.map((card) => markerForCard(card, input.cards));
    const claimText = cards.map(conciseClaim).filter(Boolean).slice(0, 2).join("；");
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
    return {
      sectionId: section.sectionId,
      title: section.title,
      prose: `就「${input.topic}」而言，本段可根據已接受來源先整理出保守結論：${sectionClaim.text}${markers.join("")} ${limitation}`,
      evidenceCardIds: cards.map((card) => card.id),
      citationIds: cards.map((card) => card.sourceId),
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
      warnings: sectionClaim.supportLevel === "partial" ? ["partial_evidence"] : [],
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
    const evidenceCards = normalizeEvidenceCards(body.evidenceCards, acceptedSources, workflowId, hash);
    const outline = normalizeOutline(body.outline);
    const sourceMixProfile = resolveSourceMixProfile({
      sourceMixProfile: cleanString(body.sourceMixProfile),
      reportType: cleanString(body.reportType),
      audience: cleanString(body.audience),
      topic,
    });
    const reportMode = normalizeReportMode(body.reportMode, acceptedSources.length);
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
    const fallback = buildFallbackSections({ topic, outline, cards: evidenceCards });
    const sections = generationMode === "llm_evidence_grounded"
      ? writerResult.sections
      : fallback.sections;
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
      generationMode === "fallback_conservative_draft"
        ? "LLM unavailable or incomplete; returned fallback_conservative_draft with explicit missingEvidence."
        : null,
      ...missingEvidence.map((item) => `${item.sectionId}: ${item.reason}`),
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
      sourceMixProfile,
      details: {
        reportMode,
        acceptedSourcesCount: acceptedSources.length,
        evidenceCardsCount: evidenceCards.length,
        fallbackUsed: generationMode === "fallback_conservative_draft",
        requestedModel: writerResult.requestedModel ?? null,
        actualModel: writerResult.actualModel ?? null,
      },
    });
  });

  return router;
}

export default createReportDraftsRouter();
