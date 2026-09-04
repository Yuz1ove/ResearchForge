import { Router, type IRouter } from "express";
import { createHash, randomUUID } from "node:crypto";
import {
  dedupeSourceRecords,
  CanonicalStudyAdmissionResultSchema,
  normalizeSourceRecord,
  ReportPlanSchema,
  WriterEvidenceSetSchema,
  sourceRecordKey,
  type ReportPlan,
  type ReportPlannedClaim,
  type ReportReadinessStatus,
  type ReportMode,
  type SourceRecord,
  type StructuredStudyFact,
  type CanonicalStudyAdmissionResult,
  type WriterEvidenceSet,
} from "@workspace/api-zod";
import { resolveSourceMixProfile } from "@workspace/api-zod/source-mix-profile";
import {
  RELEVANCE_POLICY_VERSION,
  TOPIC_INTEGRITY_VERSION,
  TopicIntegrityContractSchema,
  assessSourceTopicIntegrity,
  buildTopicIntegrityContract,
  evidenceRoleForText,
  type TopicIntegrityAssessment,
  type TopicIntegrityContract,
} from "@workspace/api-zod/topic-integrity";
import {
  writeReportWithLlm,
  type ReportWriterEvidenceCard,
  type ReportWriterInput,
  type ReportWriterPlanStatus,
  type ReportWriterResult,
  type ReportWriterSection,
  type ReportWriterSectionPlan,
} from "../services/report-writer";
import {
  removeBoilerplateLines,
  scoreEvidenceRelevance,
} from "../services/research/grounding/evidencePipelineGuards";
import { logger } from "../lib/logger";
import {
  evidenceFitsReportSection,
  normalizeEvidenceSectionFits,
} from "../services/report-section-fit";
import {
  canonicalCitationMarker,
  canonicalizeCitationMarkersInText,
  extractCanonicalCitationMarkers,
} from "../services/citation-markers";
import {
  firstReportFragment,
  normalizeReportSectionProse,
  reportSectionParagraphs,
  uniqueReportFragments,
} from "../services/report-prose-structure";
import {
  buildWriterEvidenceSet,
  writerEvidenceSetsEqual,
} from "../services/canonical-writer-evidence-set";
import {
  FORMAL_RESEARCH_REPORT_SCHEMA,
  buildFormalResearchArchitecture,
  repairFormalSectionsDeterministically,
  validateAnalyticalSynthesis,
  validateChartProvenance,
  validateCrossSectionDuplicates,
  validateFigureNarrativeBinding,
  validatePipelineLeakage,
  validateQuantitativeFindingIntegration,
  validateQuantitativeProvenance,
  validateResearchBlueprint,
  validateResearchQuestionClosure,
  validateSemanticDensity,
  validateSourceDominance,
  type CitationDisplayMode,
  type FormalResearchArchitecture,
  type ResearchMethod,
  type ResearchReportMode,
  type SectionDegradationReason,
} from "../services/formal-research-architecture";

type ReportDraftGenerationMode =
  | "llm_evidence_grounded"
  | "hybrid_evidence_grounded"
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
  canonicalSourceKey: string;
  citationKey: string;
  evidenceCardId: string;
  title: string;
  url: string | null;
}

interface EvidenceCardRejection {
  id: string;
  sourceId: string | null;
  reason: string;
  diagnostics: string[];
  decision?: "rejected" | "indeterminate";
  traceable?: boolean;
}

interface EvidenceRelevanceBridge {
  aliases: string[];
  matchedConcepts: string[];
}

interface SanitizedReportPlanResult {
  plan: ReportPlan;
  status: Exclude<ReportWriterPlanStatus, "degraded_legacy">;
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

function failedWriterResult(error: unknown): ReportWriterResult {
  logger.warn(
    {
      route: "/api/report-drafts",
      errName: error instanceof Error ? error.name : "UnknownError",
    },
    "Report writer failed before returning a structured result; using deterministic fallback",
  );
  return {
    ok: false,
    status: "error",
    llm_status: "failed",
    fallback_used: true,
    message: "AI 段落強化暫時未完成，已改用可追溯的本地完整草稿。",
    warning: "report_writer_threw_before_structured_result",
    sectionPlan: [],
    sections: [],
    reportGenerationProvider: "unavailable",
    reportGenerationModel: null,
    reportGenerationStatus: "failed",
    fallbackUsed: true,
    fallbackReason: "report_writer_threw_before_structured_result",
    adapter: "unavailable",
    actualModel: null,
  };
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

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = Array.from(
    new Set(value.map(cleanString).filter((item): item is string => Boolean(item))),
  );
  return normalized.length > 0 ? normalized : undefined;
}

function formalSectionDegradationReason(
  detail: string,
): SectionDegradationReason {
  if (/PROVIDER_VISIBLE_OUTPUT_STARVATION/iu.test(detail)) {
    return "PROVIDER_VISIBLE_OUTPUT_STARVATION";
  }
  if (/provider-empty-output|empty[_ -]?output|missing_or_invalid_section_output/iu.test(detail)) {
    return "WRITER_EMPTY_OUTPUT";
  }
  if (/citation|entailment/iu.test(detail)) {
    return "CITATION_ENTAILMENT_FAILURE";
  }
  if (/quantitative|numeric|number/iu.test(detail)) {
    return "QUANTITATIVE_GROUNDING_FAILURE";
  }
  if (/duplicate|collision/iu.test(detail)) {
    return "DUPLICATE_CLAIM_COLLISION";
  }
  if (/canonical|post[_ -]?edit|transformation/iu.test(detail)) {
    return "CANONICAL_TRANSFORMATION_LOSS";
  }
  if (/json|schema|invalid/iu.test(detail)) return "SCHEMA_INVALID";
  if (/insufficient|unsupported|grounding_verifier_blocked/iu.test(detail)) {
    return "INSUFFICIENT_EVIDENCE";
  }
  return "OTHER";
}

const UNTRANSLATED_EVIDENCE_NOTICE =
  "此來源已保留可追溯的摘要片段，但尚未完成可驗證的繁中重點整理";

function containsRawEnglishEvidenceText(
  value: string | null | undefined,
): boolean {
  const text = value?.trim() ?? "";
  if (!text) return false;
  if (/[\u3040-\u30ff]{2,}/u.test(text)) return true;
  if (/\babstract\b\s*(?:[:\uff1a.\-\u2013\u2014])?/iu.test(text)) return true;
  if (/`+\s*[A-Za-z][^`\u3002\uff01\uff1f]{18,}`*/u.test(text)) return true;
  const latinWords = text.match(/[A-Za-z][A-Za-z'\u2019-]*/gu)?.length ?? 0;
  const hanCharacters = text.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  if (latinWords >= 12 && hanCharacters === 0) return true;
  return latinWords >= 18 && latinWords > hanCharacters * 1.5;
}

function verifiedZhTwText(
  ...values: Array<string | null | undefined>
): string | undefined {
  for (const value of values) {
    const cleaned =
      value?.replace(/`+/gu, "").replace(/\s+/gu, " ").trim() ?? "";
    if (!cleaned || !/[\u3400-\u9fff]/u.test(cleaned)) continue;
    if (containsRawEnglishEvidenceText(cleaned)) continue;
    return cleaned;
  }
  return undefined;
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

const RESEARCH_METHODS: readonly ResearchMethod[] = [
  "STRUCTURED_LITERATURE_REVIEW",
  "THEMATIC_SYNTHESIS",
  "COMPARATIVE_LITERATURE_ANALYSIS",
  "SCOPING_REVIEW",
  "DOCUMENT_ANALYSIS",
  "BIBLIOMETRIC_TREND_ANALYSIS",
  "SYSTEMATIC_REVIEW",
  "META_ANALYSIS",
];

function normalizeResearchMethod(value: unknown): ResearchMethod | undefined {
  return typeof value === "string" &&
    RESEARCH_METHODS.includes(value as ResearchMethod)
    ? (value as ResearchMethod)
    : undefined;
}

function sourceHasExplicitRejection(source: Record<string, unknown>): boolean {
  const rejectedState = (value: unknown) =>
    value === "rejected" || value === "dismissed";
  return Boolean(
    rejectedState(source.reviewState) ||
    rejectedState(source.status) ||
    rejectedState(source.reviewStatus) ||
    source.userDecision === "rejected" ||
    source.recommendationBucket === "rejected" ||
    source.sourceRole === "rejected" ||
    source.sourceUseLevel === "rejected" ||
    source.usageRecommendation === "exclude" ||
    source.shouldRejectImmediately === true,
  );
}

function canonicalKeyForSource(source: SourceRecord): string {
  return (
    cleanString(source.canonicalSourceIdentity) ??
    cleanString(source.dedupeKey) ??
    sourceRecordKey(source)
  );
}

function evidenceIdentityForPlan(card: ReportWriterEvidenceCard): string {
  return cleanString(card.evidenceId) ?? card.id;
}

function canonicalKeyForPlanCard(card: ReportWriterEvidenceCard): string {
  return (
    cleanString(card.canonicalSourceKey) ??
    cleanString(card.dedupeKey) ??
    card.sourceId
  );
}

function citationKeyForPlanCard(card: ReportWriterEvidenceCard): string {
  return cleanString(card.citationKey) ?? canonicalKeyForPlanCard(card);
}

function sanitizeReportPlanForAcceptedEvidence(input: {
  plan: ReportPlan;
  evidenceCards: ReportWriterEvidenceCard[];
}): SanitizedReportPlanResult {
  const diagnostics: string[] = [];
  const retainedClaims: ReportPlannedClaim[] = [];
  const seenClaimIds = new Set<string>();

  for (const claim of input.plan.plannedClaims) {
    if (seenClaimIds.has(claim.claimId)) {
      diagnostics.push(`duplicate_claim_id_removed:${claim.claimId}`);
      continue;
    }
    seenClaimIds.add(claim.claimId);
    if (claim.sectionId === "discussion" || claim.sectionId === "conclusion") {
      diagnostics.push(`derived_section_claim_removed:${claim.claimId}`);
      continue;
    }
    const matchedCards = input.evidenceCards.filter(
      (card) =>
        claim.supportingEvidenceIds.includes(evidenceIdentityForPlan(card)) &&
        claim.supportingSourceKeys.includes(canonicalKeyForPlanCard(card)) &&
        claim.allowedCitationKeys.includes(citationKeyForPlanCard(card)),
    );
    if (matchedCards.length === 0) {
      diagnostics.push(`unresolved_claim_binding_removed:${claim.claimId}`);
      continue;
    }
    const supportingEvidenceIds = Array.from(
      new Set(matchedCards.map(evidenceIdentityForPlan)),
    ).sort();
    const supportingSourceKeys = Array.from(
      new Set(matchedCards.map(canonicalKeyForPlanCard)),
    ).sort();
    const allowedCitationKeys = Array.from(
      new Set(matchedCards.map(citationKeyForPlanCard)),
    ).sort();
    if (
      supportingEvidenceIds.length !== claim.supportingEvidenceIds.length ||
      supportingSourceKeys.length !== claim.supportingSourceKeys.length ||
      allowedCitationKeys.length !== claim.allowedCitationKeys.length
    ) {
      diagnostics.push(`ghost_or_rejected_binding_stripped:${claim.claimId}`);
    }
    retainedClaims.push({
      ...claim,
      supportingEvidenceIds,
      supportingSourceKeys,
      allowedCitationKeys,
    });
  }

  const claimById = new Map(
    retainedClaims.map((claim) => [claim.claimId, claim]),
  );
  const sections = input.plan.sections.map((section) => {
    const legalEvidenceIds = new Set(
      section.evidenceCardIds.filter((evidenceId) =>
        input.evidenceCards.some(
          (card) => evidenceIdentityForPlan(card) === evidenceId,
        ),
      ),
    );
    const declaredClaimIds = section.plannedClaimIds.filter((claimId) =>
      claimById.has(claimId),
    );
    const inferredClaimIds = retainedClaims
      .filter((claim) =>
        claim.supportingEvidenceIds.some((evidenceId) =>
          legalEvidenceIds.has(evidenceId),
        ),
      )
      .map((claim) => claim.claimId);
    const plannedClaimIds = Array.from(
      new Set(
        declaredClaimIds.length > 0 ? declaredClaimIds : inferredClaimIds,
      ),
    );
    const claimEvidenceIds = new Set(
      plannedClaimIds.flatMap(
        (claimId) => claimById.get(claimId)?.supportingEvidenceIds ?? [],
      ),
    );
    const evidenceCardIds = Array.from(legalEvidenceIds).filter((evidenceId) =>
      claimEvidenceIds.has(evidenceId),
    );
    if (
      evidenceCardIds.length !== section.evidenceCardIds.length ||
      (section.plannedClaimIds.length > 0 &&
        plannedClaimIds.length !== section.plannedClaimIds.length)
    ) {
      diagnostics.push(`section_binding_filtered:${section.sectionId}`);
    }
    return {
      ...section,
      evidenceCardIds,
      plannedClaimIds,
    };
  });

  const plan = ReportPlanSchema.parse({
    ...input.plan,
    sections,
    plannedClaims: retainedClaims,
  });
  return {
    plan,
    status: diagnostics.length > 0 ? "filtered" : "complete",
    diagnostics: Array.from(new Set(diagnostics)),
  };
}

function canonicalReadinessForPlan(input: {
  plan: ReportPlan;
  evidenceCards: ReportWriterEvidenceCard[];
  writerEvidenceSet: WriterEvidenceSet;
}): ReportReadinessStatus {
  if (input.plan.evidenceSetHash !== input.writerEvidenceSet.evidenceSetHash) {
    return "invalid_evidence_set";
  }
  const eligibleIds = new Set(input.writerEvidenceSet.eligibleEvidenceCardIds);
  const coreSections = input.plan.sections.filter(
    (section) => section.canonicalSectionRole === "core_evidence",
  );
  if (
    coreSections.length === 0 ||
    coreSections.some(
      (section) =>
        section.evidenceCardIds.length === 0 ||
        section.evidenceCardIds.some((id) => !eligibleIds.has(id)),
    )
  ) {
    return "blocked_insufficient_evidence";
  }
  if (input.plan.readinessStatus === "needs_targeted_search") {
    return "needs_targeted_search";
  }
  const cardsById = new Map(
    input.evidenceCards.map(
      (card) => [evidenceIdentityForPlan(card), card] as const,
    ),
  );
  const everyCoreHasFullText = coreSections.every((section) =>
    section.evidenceCardIds.some((id) => {
      const card = cardsById.get(id);
      return (
        card?.sourceAccessLevel === "full_text" ||
        card?.source_access_level === "full_text" ||
        card?.derivation === "fulltext-derived"
      );
    }),
  );
  return input.plan.compositionKind === "complete_research_report" &&
    everyCoreHasFullText
    ? "ready_complete_report"
    : "ready_limited_report";
}

function canonicalPlanDiagnostics(input: {
  plan: ReportPlan;
  evidenceCards: ReportWriterEvidenceCard[];
  writerEvidenceSet: WriterEvidenceSet;
}): string[] {
  const diagnostics: string[] = [];
  const normalizedFacts = input.plan.normalizedFacts ?? [];
  if (normalizedFacts.length === 0) {
    diagnostics.push("canonical_atomic_facts_missing");
  }
  const graphClaims = input.plan.claimGraph?.claims ?? [];
  if (graphClaims.length === 0) {
    diagnostics.push("canonical_claim_graph_missing");
  }
  const narrativePasses = input.plan.narrativePasses ?? [];
  if (
    narrativePasses.length !== 2 ||
    narrativePasses[0]?.pass !== "teach_back" ||
    narrativePasses[1]?.pass !== "academic_reconstruction"
  ) {
    diagnostics.push("canonical_two_stage_narrative_contract_missing");
  }
  const factIds = new Set(normalizedFacts.map((fact) => fact.factId));
  const graphFactIds = new Set(
    graphClaims.flatMap((claim) => [
      ...claim.supportingFacts,
      ...claim.contradictingFacts,
      ...claim.backgroundFacts,
    ]),
  );
  if ([...graphFactIds].some((factId) => !factIds.has(factId))) {
    diagnostics.push("canonical_claim_graph_fact_binding_invalid");
  }
  if (
    narrativePasses.length === 2 &&
    narrativePasses.some((pass) =>
      pass.inputFactIds.some((factId) => !factIds.has(factId)),
    )
  ) {
    diagnostics.push("canonical_narrative_pass_fact_binding_invalid");
  }
  if (input.plan.evidenceSetHash !== input.writerEvidenceSet.evidenceSetHash) {
    diagnostics.push("plan_evidence_set_hash_mismatch");
  }
  if (
    input.plan.evidenceSetVersion !== input.writerEvidenceSet.evidenceSetVersion
  ) {
    diagnostics.push("plan_evidence_set_version_mismatch");
  }
  if (
    input.plan.citationRegistryVersion !==
    input.writerEvidenceSet.citationRegistryVersion
  ) {
    diagnostics.push("plan_citation_registry_version_mismatch");
  }
  const sanitized = sanitizeReportPlanForAcceptedEvidence({
    plan: input.plan,
    evidenceCards: input.evidenceCards,
  });
  if (sanitized.status !== "complete") {
    diagnostics.push(
      ...sanitized.diagnostics.map((item) => `post_plan_mutation:${item}`),
    );
  }
  const evaluatedReadiness = canonicalReadinessForPlan(input);
  if (
    input.plan.readinessStatus &&
    input.plan.readinessStatus !== evaluatedReadiness
  ) {
    diagnostics.push(
      `readiness_mismatch:${input.plan.readinessStatus}:${evaluatedReadiness}`,
    );
  }
  return Array.from(new Set(diagnostics));
}

interface TopicIntegritySourceRejection {
  sourceId: string;
  title: string;
  reason: string;
  assessment: TopicIntegrityAssessment;
}

interface AcceptedSourceTopicReview {
  sources: SourceRecord[];
  rejectedSources: TopicIntegritySourceRejection[];
  contract: TopicIntegrityContract;
  validatedAt: string;
}

function normalizeAcceptedSources(
  value: unknown,
  workflowId: string,
  hash: string,
  topic: string,
  contractValue?: unknown,
  enforceTopicIntegrity = false,
): AcceptedSourceTopicReview {
  const parsedContract = TopicIntegrityContractSchema.safeParse(contractValue);
  const contract = parsedContract.success
    ? parsedContract.data
    : buildTopicIntegrityContract({
        canonicalTopic: topic,
        researchQuestion: topic,
        domain: "unknown",
      });
  const validatedAt = new Date().toISOString();
  if (!Array.isArray(value)) {
    return { sources: [], rejectedSources: [], contract, validatedAt };
  }
  const records: SourceRecord[] = [];
  const rejectedSources: TopicIntegritySourceRejection[] = [];
  value.forEach((source, index) => {
    if (!source || typeof source !== "object") return;
    const rawSource = source as Record<string, unknown>;
    if (sourceHasExplicitRejection(rawSource)) return;
    try {
      const normalized = normalizeSourceRecord(source as SourceRecord);
      if (!enforceTopicIntegrity) {
        records.push({
          ...normalized,
          id: normalized.id || `source-${index + 1}`,
          workflowId: normalized.workflowId || workflowId,
          topicHash: normalized.topicHash || hash,
          topic: normalized.topic || topic,
          reviewState: "accepted" as const,
          acceptedByUser: true,
          userDecision:
            typeof normalized.userDecision === "string" &&
            normalized.userDecision.startsWith("accepted")
              ? normalized.userDecision
              : "accepted",
        });
        return;
      }
      const prior = rawSource.topicIntegrityAssessment;
      const priorAssessment = prior && typeof prior === "object" && !Array.isArray(prior)
        ? prior as Record<string, unknown>
        : null;
      const priorLineageMatches =
        cleanString(rawSource.workflowId) === workflowId &&
        cleanString(rawSource.topicHash) === hash &&
        cleanString(rawSource.topic) === topic &&
        priorAssessment?.topicIntegrityVersion === TOPIC_INTEGRITY_VERSION &&
        priorAssessment?.relevancePolicyVersion === RELEVANCE_POLICY_VERSION &&
        priorAssessment?.acceptedForCanonicalEvidence === true &&
        priorAssessment?.sourceRole !== "REJECTED_OFF_TOPIC";
      // Grounding already evaluated the exact source under the same workflow,
      // topic hash and canonical topic. Reusing that signed lineage prevents a
      // second, lossy assessment from rejecting English evidence merely because
      // the reader-facing research question is in Traditional Chinese.
      const assessment = priorLineageMatches
        ? priorAssessment as unknown as TopicIntegrityAssessment
        : assessSourceTopicIntegrity(
            {
              id: normalized.id,
              title: normalized.title,
              abstract: normalized.abstract,
              abstractOriginal: normalized.abstractOriginal,
              extractedAbstract: normalized.extractedAbstract,
              snippet: normalized.snippet,
              venue: normalized.containerTitle,
              sourceType: normalized.sourceType,
              relevanceScore: normalized.relevanceScore,
              finalScore: normalized.finalScore,
            },
            contract,
          );
      if (!assessment.acceptedForCanonicalEvidence) {
        rejectedSources.push({
          sourceId: normalized.id || `source-${index + 1}`,
          title: normalized.title,
          reason: assessment.topicIntegrityReason,
          assessment,
        });
        return;
      }
      records.push({
        ...normalized,
        id: normalized.id || `source-${index + 1}`,
        workflowId: normalized.workflowId || workflowId,
        topicHash: normalized.topicHash || hash,
        topic: normalized.topic || topic,
        reviewState: "accepted" as const,
        acceptedByUser: true,
        formalEvidenceRole: assessment.sourceRole,
        topicIntegrityAssessment: assessment,
        usableSections: assessment.allowedSections,
        isPrimaryEvidence: assessment.sourceRole === "DIRECT_FINDING",
        userDecision:
          typeof normalized.userDecision === "string" &&
          normalized.userDecision.startsWith("accepted")
            ? normalized.userDecision
            : "accepted",
      });
    } catch {
      // Ignore malformed source entries; validation below checks that at least one remains.
    }
  });
  return {
    sources: dedupeSourceRecords(records),
    rejectedSources,
    contract,
    validatedAt,
  };
}

function normalizeEvidenceCards(
  value: unknown,
  sources: SourceRecord[],
  workflowId: string,
  hash: string,
  topic: string,
  relevanceBridge: EvidenceRelevanceBridge,
): {
  cards: ReportWriterEvidenceCard[];
  rejected: EvidenceCardRejection[];
  diagnostics: string[];
} {
  const sourceIds = new Set(sources.map((source) => source.id));
  const sourceMarkers = new Map(
    sources.map((source, index) => [source.id, `[S${index + 1}]`] as const),
  );
  const rawCards = Array.isArray(value) ? value : [];
  const rejected: EvidenceCardRejection[] = [];
  const diagnostics: string[] = [];
  const normalized = rawCards
    .map((card, index): ReportWriterEvidenceCard | null => {
      if (!card || typeof card !== "object") return null;
      const data = card as Record<string, unknown>;
      const structuredStudyFact = data.structuredStudyFact && typeof data.structuredStudyFact === "object"
        ? data.structuredStudyFact as StructuredStudyFact
        : undefined;
      const sourceId =
        cleanString(data.sourceId) ?? cleanString(data.source_id);
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
      const sourceRecord = source as
        | (SourceRecord & Record<string, unknown>)
        | undefined;
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
      const boilerplateRatio = Math.max(
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
      if (
        !cleanedSupport.text ||
        !cleanedClaim.text ||
        boilerplateRatio >= 0.45
      ) {
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
      if (!source || !supportSpanExistsInSource(source, cleanedSupport.text)) {
        rejected.push({
          id,
          sourceId,
          reason: "support_span_not_found_in_source",
          diagnostics: ["rejected:support_span_not_found_in_source"],
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
          isPeerReviewed:
            source?.isPeerReviewed ??
            (typeof data.isPeerReviewed === "boolean"
              ? data.isPeerReviewed
              : undefined),
          sourceQualityScore:
            typeof data.sourceQuality === "number"
              ? data.sourceQuality
              : typeof data.sourceQualityScore === "number"
                ? data.sourceQualityScore
                : undefined,
          recommendationBucket:
            source?.recommendationBucket ??
            (typeof data.recommendationBucket === "string"
              ? (data.recommendationBucket as never)
              : undefined),
          accessLevel: source?.accessLevel ?? undefined,
          extractionMode:
            typeof sourceRecord?.extractionMode === "string"
              ? (sourceRecord.extractionMode as never)
              : undefined,
          sourceUseLevel:
            typeof sourceRecord?.sourceUseLevel === "string"
              ? (sourceRecord.sourceUseLevel as never)
              : undefined,
          evidenceGrounding:
            typeof sourceRecord?.evidenceGrounding === "string"
              ? (sourceRecord.evidenceGrounding as never)
              : undefined,
          canUseForClaims:
            typeof sourceRecord?.canUseForClaims === "boolean"
              ? sourceRecord.canUseForClaims
              : undefined,
        },
        boilerplateRatio,
        aliases: [
          ...relevanceBridge.aliases,
          ...stringList(sourceRecord?.aliases),
          ...stringList(sourceRecord?.topicAliases),
          ...stringList(data.aliases),
          ...stringList(data.topicAliases),
        ],
        matchedConcepts: [
          ...relevanceBridge.matchedConcepts,
          ...stringList(sourceRecord?.matchedConcepts),
          ...stringList(sourceRecord?.matchedCoreConcepts),
          ...stringList(sourceRecord?.matchedTerms),
          ...stringList(data.matchedConcepts),
          ...stringList(data.matchedCoreConcepts),
          ...stringList(data.matchedTerms),
        ],
        queryUsed:
          cleanString(sourceRecord?.queryUsed) ??
          cleanString(data.queryUsed) ??
          (data.trace && typeof data.trace === "object"
            ? cleanString((data.trace as Record<string, unknown>).query_used)
            : undefined),
      });
      if (!relevance.accepted) {
        rejected.push({
          id,
          sourceId,
          reason: relevance.reason,
          diagnostics: relevance.diagnostics,
          decision:
            relevance.decision === "indeterminate"
              ? "indeterminate"
              : "rejected",
          traceable: relevance.decision === "indeterminate",
        });
        return null;
      }
      diagnostics.push(relevance.reason);
      const extractionMethod =
        data.extractionMethod === "llm_structured_extract" ||
        data.extractionMethod === "manual_review" ||
        data.extractionMethod === "deterministic_exact_span" ||
        data.extractionMethod === "rule_fallback_claim_extraction"
          ? data.extractionMethod
          : data.extractedBy === "llm"
            ? "llm_structured_extract"
            : "rule_fallback_claim_extraction";
      const needsManualReview =
        data.needsManualReview === true ||
        extractionMethod === "rule_fallback_claim_extraction";
      const needsReview =
        data.needsReview === true ||
        needsManualReview;
      const groundingConfidence =
        typeof data.groundingConfidence === "number"
          ? data.groundingConfidence
          : typeof data.confidence === "number"
            ? data.confidence
            : extractionMethod === "llm_structured_extract"
              ? 0.65
              : 0.52;
      const evidenceTopicRole = source?.topicIntegrityAssessment
        ? evidenceRoleForText({
            text: `${cleanedClaim.text} ${cleanedSupport.text}`,
            sourceAssessment: source.topicIntegrityAssessment,
            contract: buildTopicIntegrityContract({
              canonicalTopic: topic,
              researchQuestion: topic,
              domain: "unknown",
            }),
          })
        : null;
      const normalizedSectionFits = normalizeEvidenceSectionFits([
        ...stringList(data.usableSections),
        ...stringList(data.sectionFit),
        ...stringList(data.sectionTargets),
        ...(evidenceTopicRole?.allowedSections ?? []),
      ]).filter((section) =>
        !evidenceTopicRole || evidenceTopicRole.allowedSections.some((allowed) =>
          evidenceFitsReportSection(section, [allowed]),
        ),
      );
      const directness =
        data.directness === "A" ||
        data.directness === "B" ||
        data.directness === "C" ||
        data.directness === "D"
          ? data.directness
          : data.evidenceDirectnessTier === "A" ||
              data.evidenceDirectnessTier === "B" ||
              data.evidenceDirectnessTier === "C" ||
              data.evidenceDirectnessTier === "D"
            ? data.evidenceDirectnessTier
            : (source?.researchDirectnessTier ?? null);
      const exactSupportSpanVerified = true;
      const canonicalSourceKey = canonicalKeyForSource(source);
      return {
        id,
        evidenceId: cleanString(data.evidenceId) ?? id,
        sourceId,
        workflowId: cleanString(data.workflowId) ?? workflowId,
        topicHash: cleanString(data.topicHash) ?? hash,
        title:
          cleanString(data.title) ??
          cleanString(data.sourceTitle) ??
          source?.title ??
          "",
        canonicalSourceKey,
        dedupeKey: canonicalSourceKey,
        citationKey: canonicalSourceKey,
        claim: cleanedClaim.text,
        claimText: cleanedClaim.text,
        claimTextZhTw:
          verifiedZhTwText(
            cleanString(data.claimTextZhTw),
            cleanString(data.mainClaimZhTw),
            cleanString(data.evidencePointZhTw),
            cleanString(data.sourceSummaryZhTw),
            source?.mainEvidencePointZhTw,
            cleanString(sourceRecord?.evidenceSummaryZhTw),
            source?.readableSummaryZhTw,
            source?.readableSummaryZhTW,
            source?.abstractZhTw,
          ) ?? UNTRANSLATED_EVIDENCE_NOTICE,
        claimTextZh: cleanString(data.claimTextZh) ?? cleanedClaim.text,
        supportSpan: cleanedSupport.text,
        supportStart:
          typeof data.supportStart === "number" ? data.supportStart : undefined,
        supportEnd:
          typeof data.supportEnd === "number" ? data.supportEnd : undefined,
        supportedByText: cleanedSupport.text,
        evidence: cleanString(data.evidence) ?? cleanedSupport.text,
        summary: cleanString(data.summary) ?? cleanedClaim.text,
        sourceSummaryZhTw:
          verifiedZhTwText(
            cleanString(data.sourceSummaryZhTw),
            source?.readableSummaryZhTw,
            source?.readableSummaryZhTW,
            source?.mainEvidencePointZhTw,
            cleanString(sourceRecord?.evidenceSummaryZhTw),
            source?.abstractZhTw,
          ) ?? UNTRANSLATED_EVIDENCE_NOTICE,
        relevance: cleanString(data.relevance) ?? "accepted_source",
        sourceTitle: cleanString(data.sourceTitle) ?? source?.title ?? "",
        sourceProvider:
          cleanString(data.sourceProvider) ??
          source?.provider ??
          source?.sourceType ??
          "",
        recommendationBucket:
          data.recommendationBucket === "scholarly_recommended" ||
          data.recommendationBucket === "official_background" ||
          data.recommendationBucket === "manual_review" ||
          data.recommendationBucket === "rejected"
            ? data.recommendationBucket
            : (source?.recommendationBucket ?? null),
        sourceRole: cleanString(data.sourceRole) ?? source?.sourceRole ?? null,
        formalEvidenceRole: evidenceTopicRole?.role ?? source?.formalEvidenceRole ?? null,
        topicIntegrityReason:
          evidenceTopicRole?.reason ?? source?.topicIntegrityAssessment?.topicIntegrityReason ?? null,
        retrievalMode:
          cleanString(data.retrievalMode) ?? source?.retrievalMode ?? null,
        isPeerReviewed:
          typeof data.isPeerReviewed === "boolean"
            ? data.isPeerReviewed
            : (source?.isPeerReviewed ?? null),
        venue: cleanString(data.venue) ?? source?.containerTitle ?? null,
        doi: cleanString(data.doi) ?? source?.doi ?? null,
        abstract: cleanString(data.abstract) ?? source?.abstract ?? null,
        provider:
          cleanString(data.provider) ??
          source?.provider ??
          source?.sourceType ??
          null,
        year:
          typeof data.year === "number" ? data.year : (source?.year ?? null),
        usableSections: normalizedSectionFits,
        sectionFit: normalizedSectionFits,
        citationText: cleanString(data.citationText) ?? source?.title ?? "",
        citationMarker: sourceMarkers.get(sourceId) ?? `[S${index + 1}]`,
        limitation: cleanString(data.limitation) ?? null,
        limitations: stringList(data.limitations),
        limitationsZhTw: stringList(data.limitationsZhTw),
        sectionTargets: normalizedSectionFits,
        sourceAccessLevel:
          cleanString(data.sourceAccessLevel) ?? source?.accessLevel ?? null,
        source_access_level:
          cleanString(data.source_access_level) ?? source?.accessLevel ?? null,
        derivation: cleanString(data.derivation) ?? null,
        evidenceGrounding:
          cleanString(data.evidenceGrounding) ??
          source?.evidenceGrounding ??
          null,
        summaryStructuredStatus:
          cleanString(data.summaryStructuredStatus) ??
          source?.summaryStructuredStatus ??
          null,
        llmSummaryStatus:
          cleanString(data.llmSummaryStatus) ??
          source?.llmSummaryStatus ??
          null,
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
        needsManualReview,
        needsReview,
        rejectionReason: cleanString(data.rejectionReason),
        extractedAt:
          cleanString(data.extractedAt) ?? cleanString(data.createdAt),
        governanceFlags: exactSupportSpanVerified
          ? ["exact_support_span_verified"]
          : [],
        location: cleanString(data.location) ?? null,
        researchSetting: cleanString(data.researchSetting) ?? null,
        structuredStudyFact,
        studyDesign: cleanString(data.studyDesign) ??
          (structuredStudyFact?.studyDesign !== "unknown" ? structuredStudyFact?.studyDesign : undefined) ?? null,
        dataScope: cleanString(data.dataScope) ?? structuredStudyFact?.populationDescription ?? structuredStudyFact?.population ?? null,
        exposure: cleanString(data.exposure) ?? structuredStudyFact?.exposure ?? null,
        comparator: cleanString(data.comparator) ?? structuredStudyFact?.comparator ?? null,
        outcome: cleanString(data.outcome) ?? structuredStudyFact?.outcome ?? null,
        exactResult: cleanString(data.exactResult) ?? cleanedSupport.text,
        numericResult: cleanString(data.numericResult) ?? null,
        applicability: cleanString(data.applicability) ?? null,
        locator:
          cleanString(data.locator) ??
          cleanString(data.pageOrLocation) ??
          cleanString(data.sourceLocation) ??
          null,
        directness,
        evidenceDirectnessTier: directness,
      };
    })
    .filter((card): card is ReportWriterEvidenceCard => Boolean(card));

  return { cards: normalized, rejected, diagnostics };
}

function supportSentences(
  value: string,
  limit = 420,
  maxSentences = 3,
  prioritizeResults = false,
): string[] {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return [];
  const sentences = text
    .split(/(?<=[。！？.!?])\s+/u)
    .map((sentence) =>
      sentence.replace(/^(?:abstract|摘要)\s*[.:：]?\s*/iu, "").trim(),
    )
    .filter((sentence) => sentence.length >= 40)
    .map((sentence) => sentence.slice(0, limit).trim());
  if (sentences.length > 0) {
    if (!prioritizeResults) return sentences.slice(0, maxSentences);
    return sentences
      .map((sentence, index) => ({
        sentence,
        index,
        score:
          (/(?:\d+(?:\.\d+)?\s*(?:%|mmhg|hours?|minutes?|participants?)|\bp\s*[=<>≤≥]|\bCI\b|confidence interval|effect size|mean difference|standardized mean difference)/iu.test(sentence) ? 4 : 0) +
          (/^(?:results?|findings?|conclusions?)\s*[:：]|結果|結論|顯著|associated|reduced|increased/iu.test(sentence) ? 2 : 0),
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, maxSentences)
      .map((item) => item.sentence);
  }
  const fallback = text
    .replace(/^(?:abstract|摘要)\s*[.:：]?\s*/iu, "")
    .trim()
    .slice(0, limit)
    .trim();
  return fallback.length >= 40 ? [fallback] : [];
}

function sourceChunksForServerEvidence(
  source: SourceRecord,
): ServerEvidenceChunk[] {
  const record = source as SourceRecord & Record<string, unknown>;
  const extractedChunks = Array.isArray(record.extractedChunks)
    ? record.extractedChunks
    : [];
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
      const sectionHeading =
        cleanString(chunk.section_heading) ?? cleanString(chunk.sectionHeading);
      if (sectionHeading) result.sectionHeading = sectionHeading;
      return result;
    })
    .filter((item): item is ServerEvidenceChunk => Boolean(item));
  const abstract =
    cleanString(record.extractedAbstract) ??
    cleanString(record.abstractOriginal) ??
    cleanString(record.originalAbstract) ??
    cleanString(record.abstract);
  const combined = [...chunks];
  if (
    abstract &&
    !combined.some((chunk) =>
      chunk.text.replace(/\s+/gu, " ").trim().includes(abstract.replace(/\s+/gu, " ").trim()),
    )
  ) {
    combined.push({
      text: abstract,
      sourceLocation: "abstract",
      sectionHeading: "Abstract",
    });
  }
  return combined.slice(0, 3);
}

function sourceSupportTexts(source: SourceRecord): string[] {
  const record = source as SourceRecord & Record<string, unknown>;
  const scalarKeys = [
    "abstract",
    "originalAbstract",
    "abstractOriginal",
    "extractedAbstract",
    "snippet",
    "originalSnippet",
    "extractedText",
    "fullText",
  ];
  const scalarTexts = scalarKeys
    .map((key) => cleanString(record[key]))
    .filter((value): value is string => Boolean(value));
  const chunkTexts = (
    Array.isArray(record.extractedChunks) ? record.extractedChunks : []
  )
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const chunk = item as unknown as Record<string, unknown>;
      return cleanString(chunk.text) ?? cleanString(chunk.chunkText);
    })
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set([...scalarTexts, ...chunkTexts]));
}

function supportSpanExistsInSource(
  source: SourceRecord,
  supportSpan: string,
): boolean {
  const normalizedSupport = supportSpan.replace(/\s+/gu, " ").trim();
  if (!normalizedSupport) return false;
  return sourceSupportTexts(source).some((text) =>
    text.replace(/\s+/gu, " ").trim().includes(normalizedSupport),
  );
}

function normalizedSourceQuality(source: SourceRecord): number | null {
  const raw =
    source.sourceQualityScore ??
    source.relevanceScore ??
    source.finalScore ??
    null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw > 1 ? raw / 100 : raw;
}

function derivedSectionFit(source: SourceRecord): string[] {
  const base = new Set<string>();
  for (const section of stringList(source.usableSections)) {
    for (const normalizedSection of normalizeEvidenceSectionFits([section])) {
      base.add(normalizedSection);
    }
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
  return normalizeEvidenceSectionFits(Array.from(base));
}

function deriveEvidenceCardsFromAcceptedSources(input: {
  sources: SourceRecord[];
  existingCards: ReportWriterEvidenceCard[];
  workflowId: string;
  hash: string;
  topic: string;
  relevanceBridge: EvidenceRelevanceBridge;
}): { cards: ReportWriterEvidenceCard[]; rejected: EvidenceCardRejection[] } {
  const existingSourceIds = new Set(
    input.existingCards.map((card) => card.sourceId),
  );
  const existingSupportBySource = new Map<string, Set<string>>();
  for (const card of input.existingCards) {
    const supports = existingSupportBySource.get(card.sourceId) ?? new Set<string>();
    supports.add((card.supportSpan ?? card.supportedByText ?? "").replace(/\s+/gu, " ").trim());
    existingSupportBySource.set(card.sourceId, supports);
  }
  const cards: ReportWriterEvidenceCard[] = [];
  const rejected: EvidenceCardRejection[] = [];
  input.sources.forEach((source, sourceIndex) => {
    const sourceRecord = source as SourceRecord &
      Record<string, unknown> & {
        usageRecommendation?: string | null;
        qualityWarnings?: string[] | null;
      };
    if (!source.id) return;
    const formalTopicReviewed = Boolean(source.topicIntegrityAssessment);
    // Canonical client evidence already carries an exact, verified support span.
    // Do not silently widen that source after the evidence set was selected: a
    // server-derived sibling would change the WriterEvidenceSet hash and can
    // contain prose that the structured ReportPlan correctly rejects.
    if (existingSourceIds.has(source.id)) return;
    if (sourceHasExplicitRejection(sourceRecord)) return;
    if (
      source.recommendationBucket === "rejected" ||
      sourceRecord.usageRecommendation === "exclude"
    )
      return;
    const canonicalSourceKey = canonicalKeyForSource(source);
    const chunks = sourceChunksForServerEvidence(source);
    chunks.forEach((chunk, chunkIndex) => {
      const cleaned = removeBoilerplateLines(chunk.text);
      supportSentences(cleaned.text, 520, formalTopicReviewed ? 5 : 3, formalTopicReviewed).forEach((supportSpan, sentenceIndex) => {
        if (existingSupportBySource.get(source.id)?.has(supportSpan.replace(/\s+/gu, " ").trim())) return;
        if (
          source.title &&
          supportSpan.toLowerCase() === source.title.trim().toLowerCase()
        )
          return;
        const id =
          sentenceIndex === 0
            ? `evidence:${source.id}:server-derived:${chunkIndex + 1}`
            : `evidence:${source.id}:server-derived:${chunkIndex + 1}-${sentenceIndex + 1}`;
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
            accessLevel: source.accessLevel ?? undefined,
            extractionMode:
              typeof sourceRecord.extractionMode === "string"
                ? (sourceRecord.extractionMode as never)
                : undefined,
            sourceUseLevel:
              typeof sourceRecord.sourceUseLevel === "string"
                ? (sourceRecord.sourceUseLevel as never)
                : undefined,
            evidenceGrounding: source.evidenceGrounding ?? undefined,
            canUseForClaims:
              typeof sourceRecord.canUseForClaims === "boolean"
                ? sourceRecord.canUseForClaims
                : undefined,
          },
          boilerplateRatio:
            cleaned.removedLineCount / cleaned.originalLineCount,
          aliases: [
            ...input.relevanceBridge.aliases,
            ...stringList(sourceRecord.aliases),
            ...stringList(sourceRecord.topicAliases),
          ],
          matchedConcepts: [
            ...input.relevanceBridge.matchedConcepts,
            ...stringList(sourceRecord.matchedConcepts),
            ...stringList(sourceRecord.matchedCoreConcepts),
            ...stringList(sourceRecord.matchedTerms),
          ],
          queryUsed: source.queryUsed ?? cleanString(sourceRecord.queryUsed),
        });
        if (!relevance.accepted) {
          rejected.push({
            id,
            sourceId: source.id,
            reason: relevance.reason,
            diagnostics: relevance.diagnostics,
            decision:
              relevance.decision === "indeterminate"
                ? "indeterminate"
                : "rejected",
            traceable: relevance.decision === "indeterminate",
          });
          return;
        }
        const sectionFit = derivedSectionFit(source);
        const createdAt = new Date().toISOString();
        const readerFacingClaim =
          verifiedZhTwText(
            source.mainEvidencePointZhTw,
            cleanString(sourceRecord.evidenceSummaryZhTw),
            source.readableSummaryZhTw,
            source.readableSummaryZhTW,
            source.abstractZhTw,
          ) ?? UNTRANSLATED_EVIDENCE_NOTICE;
        cards.push({
          id,
          evidenceId: id,
          evidenceCardId: id,
          sourceId: source.id,
          canonicalSourceKey,
          dedupeKey: canonicalSourceKey,
          citationKey: canonicalSourceKey,
          workflowId: input.workflowId,
          topicHash: input.hash,
          claimTextOriginal: supportSpan,
          claimText: supportSpan,
          claimTextZh: readerFacingClaim,
          claim: supportSpan,
          claimTextZhTw: readerFacingClaim,
          mainClaim: supportSpan,
          mainClaimZhTw: readerFacingClaim,
          supportSpan,
          supportedByText: supportSpan,
          supportStart: Math.max(0, cleaned.text.indexOf(supportSpan)),
          supportEnd:
            Math.max(0, cleaned.text.indexOf(supportSpan)) + supportSpan.length,
          evidence: supportSpan,
          evidencePointZhTw: readerFacingClaim,
          usableEvidence: readerFacingClaim,
          summary: readerFacingClaim,
          supportingClaims: [],
          supportSpans: [
            {
              text: supportSpan,
              startOffset: Math.max(0, cleaned.text.indexOf(supportSpan)),
              endOffset:
                Math.max(0, cleaned.text.indexOf(supportSpan)) +
                supportSpan.length,
              sectionHeading: chunk.sectionHeading,
            },
          ],
          citationMarker: `[S${sourceIndex + 1}]`,
          sourceSummaryZhTw: readerFacingClaim,
          relevance: "server_derived_support_span",
          sourceType: source.sourceType,
          reliability: source.confidence ?? "需人工複核",
          limitations: Array.from(
            new Set([
              "server_derived_from_accepted_source_text",
              "rule_fallback_claim_extraction",
              ...(sourceRecord.qualityWarnings ?? []),
            ]),
          ),
          limitationsZhTw: Array.from(
            new Set([
              "由伺服器依已接受來源文字抽出 exact supportSpan，仍需人工複核。",
              ...(sourceRecord.qualityWarnings ?? []),
            ]),
          ),
          sectionTargets: sectionFit,
          sectionFit,
          sourceTitle: source.title,
          sourceProvider: source.provider ?? source.sourceType,
          sourceAccessLevel: source.accessLevel ?? "abstract_only",
          source_access_level: source.accessLevel ?? "abstract_only",
          extractionStatus: source.extractionStatus ?? null,
          evidenceType:
            /(?:\bResults?\b|結果(?:顯示|指出|為)|發現|顯著|associated|correlat|predict|\b(?:OR|RR|HR|r)\s*[=:]|%|％)/iu.test(
              supportSpan,
            )
              ? "finding"
              : "background",
          evidence_type:
            /(?:\bResults?\b|結果(?:顯示|指出|為)|發現|顯著|associated|correlat|predict|\b(?:OR|RR|HR|r)\s*[=:]|%|％)/iu.test(
              supportSpan,
            )
              ? "finding"
              : "background",
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
          derivation:
            chunk.sourceLocation === "abstract"
              ? "abstract-derived"
              : "fulltext-derived",
          evidenceGrounding: source.evidenceGrounding ?? null,
          summaryStructuredStatus: source.summaryStructuredStatus ?? null,
          llmSummaryStatus: source.llmSummaryStatus ?? null,
          needsManualReview: true,
          needsReview: true,
          extractionMethod: "rule_fallback_claim_extraction",
          rejectionReason: null,
          extractedAt: createdAt,
          governanceFlags: [
            "server_derived_support_span",
            "exact_support_span_verified",
            "rule_fallback_claim_extraction",
          ],
          sourceMetadata: {
            url: source.url,
            title: source.title,
            year: source.year,
            provider: source.provider,
          },
        });
      });
    });
  });
  return { cards, rejected };
}

function normalizeOutline(
  value: unknown,
): Array<{ sectionId: string; title: string }> {
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
        sectionId:
          cleanString(data.sectionId) ??
          cleanString(data.id) ??
          `section_${index + 1}`,
        title,
      };
    })
    .filter((section): section is { sectionId: string; title: string } =>
      Boolean(section),
    );
  return normalized.length > 0 ? normalized : [...DEFAULT_OUTLINE];
}

function roleText(card: ReportWriterEvidenceCard): string {
  return String(
    card.formalEvidenceRole ??
      card.sourceRole ??
      card.recommendationBucket ??
      card.sourceProvider ??
      "",
  ).toLowerCase();
}

function roleSupportsFindings(card: ReportWriterEvidenceCard): boolean {
  const text = roleText(card);
  if (card.formalEvidenceRole) {
    return card.formalEvidenceRole === "DIRECT_FINDING";
  }
  if (
    /background_definition|definition_or_concept|case_or_news|news|encyclopedia|wikipedia/.test(
      text,
    )
  ) {
    return false;
  }
  return /academic_evidence|core_scholarly|professional_guidance|official_statistics|data_or_dataset|statistics_or_dataset|scholarly|official|peer|journal|doi/.test(
    text,
  );
}

function roleSupportsBackground(card: ReportWriterEvidenceCard): boolean {
  if (card.formalEvidenceRole) {
    return card.formalEvidenceRole === "DIRECT_FINDING" ||
      card.formalEvidenceRole === "CONTEXTUAL_BACKGROUND";
  }
  return /background_definition|official|professional|academic(?:_evidence)?|core_scholarly|scholarly|definition/.test(
    roleText(card),
  );
}

function cardFitsSection(
  sectionId: string,
  card: ReportWriterEvidenceCard,
): boolean {
  const fit = [
    ...stringList(card.sectionFit),
    ...stringList(card.sectionTargets),
    ...stringList(card.usableSections),
  ];
  return evidenceFitsReportSection(sectionId, fit, card.evidenceType);
}

function sectionCards(
  sectionId: string,
  cards: ReportWriterEvidenceCard[],
): ReportWriterEvidenceCard[] {
  // The writer's primary prompt can bind any of its eight evidence cards. Keep
  // the route-side bundle at the same ceiling so a valid [S5]-[S8] marker does
  // not become "unknown" only because verification saw a smaller card slice.
  const bundleLimit = 8;
  if (
    sectionId === "findings" ||
    /finding|發現|文獻|探討|discussion|analysis/.test(sectionId)
  ) {
    return cards
      .filter(
        (card) =>
          roleSupportsFindings(card) && cardFitsSection(sectionId, card),
      )
      .slice(0, bundleLimit);
  }
  if (/background|intro|背景|introduction/.test(sectionId)) {
    return cards
      .filter(
        (card) =>
          cardFitsSection(sectionId, card) && roleSupportsBackground(card),
      )
      .slice(0, bundleLimit);
  }
  return cards
    .filter((card) => cardFitsSection(sectionId, card))
    .slice(0, bundleLimit);
}

function markerForCard(
  card: ReportWriterEvidenceCard,
  cards: ReportWriterEvidenceCard[],
): string {
  const index = cards.findIndex((item) => item.id === card.id);
  return `[S${index + 1}]`;
}

function conciseClaim(card: ReportWriterEvidenceCard): string {
  const readerFacing =
    verifiedZhTwText(
      card.claimTextZhTw,
      card.mainClaimZhTw,
      card.evidencePointZhTw,
      card.sourceSummaryZhTw,
      card.claimTextZh,
      card.mainClaim,
      card.summary,
      card.claim,
    ) ?? UNTRANSLATED_EVIDENCE_NOTICE;
  return firstReportFragment(readerFacing)
    .replace(/[。！？!?]+$/u, "")
    .slice(0, 120);
}

function fallbackSectionLead(
  sectionId: string,
  title: string,
  topic: string,
): string {
  if (/background|intro|背景/u.test(`${sectionId} ${title}`)) {
    return `本節先從已接受來源界定「${topic}」的研究背景與討論範圍。`;
  }
  if (/literature|文獻/u.test(`${sectionId} ${title}`)) {
    return `文獻探討依主題關係整合「${topic}」的既有觀點，而不按照來源卡順序逐筆抄錄。`;
  }
  if (/findings|發現/u.test(`${sectionId} ${title}`)) {
    return `本節整理「${topic}」目前可直接追溯的資料重點。`;
  }
  if (/discussion|analysis|討論|探討/u.test(`${sectionId} ${title}`)) {
    return `本節把「${topic}」的現有資料放在同一脈絡中比較。`;
  }
  if (/limitations|限制/u.test(`${sectionId} ${title}`)) {
    return `以下限制以「${topic}」現有來源的可讀範圍與證據缺口為界。`;
  }
  if (/conclusion|結論/u.test(`${sectionId} ${title}`)) {
    return `結論僅回收「${topic}」前文已引用且可追溯的內容。`;
  }
  if (/method|方法/u.test(`${sectionId} ${title}`)) {
    return `本節交代「${topic}」的來源篩選、證據整理與引用邊界。`;
  }
  if (/abstract|摘要/u.test(`${sectionId} ${title}`)) {
    return `本摘要概述「${topic}」目前資料涵蓋的範圍與限制。`;
  }
  return `本節依已接受來源整理「${topic}」的可追溯內容。`;
}

function requiredAspectsForSection(sectionId: string): string[] {
  if (/background|intro|背景/.test(sectionId))
    return ["background_or_definition", "topic_relevance"];
  if (/findings|發現/.test(sectionId))
    return ["academic_or_official_evidence", "supported_claim", "citation"];
  if (/literature|文獻|discussion|探討/.test(sectionId))
    return ["multiple_sources", "supported_claim", "limitations"];
  if (/method|方法/.test(sectionId)) return ["method_or_data_boundary"];
  if (/limitations|限制/.test(sectionId)) return ["evidence_boundary"];
  if (/conclusion|結論/.test(sectionId)) return ["prior_supported_claims"];
  return ["supported_claim", "citation"];
}

function reportPlanSectionIdsForOutputSection(
  reportPlan: ReportPlan,
  sectionId: string,
): string[] {
  if (reportPlan.sections.some((section) => section.sectionId === sectionId)) {
    return [sectionId];
  }
  if (sectionId === "executive_summary") {
    return ["introduction", "findings", "discussion", "conclusion"];
  }
  if (sectionId === "background") return ["introduction", "literature_review"];
  if (sectionId === "methods") return ["methodology"];
  if (sectionId === "evidence_overview") return ["literature_review", "methodology"];
  if (sectionId === "cross_study_synthesis") return ["discussion", "findings"];
  if (sectionId === "limitations_gaps") return ["limitations"];
  if (sectionId === "abstract") return ["background", "evidence"];
  if (sectionId === "introduction" || sectionId === "research_question") {
    return ["background"];
  }
  if (
    sectionId === "literature_review" ||
    sectionId === "methodology" ||
    sectionId === "findings" ||
    sectionId === "limitations"
  ) {
    return ["evidence"];
  }
  if (sectionId === "discussion") return ["discussion"];
  if (sectionId === "conclusion") return ["conclusion"];
  return [];
}

function planScopedCardsForSection(input: {
  reportPlan: ReportPlan | undefined;
  sectionId: string;
  cards: ReportWriterEvidenceCard[];
}): ReportWriterEvidenceCard[] {
  if (!input.reportPlan) return input.cards;
  const planSectionIds = new Set(
    reportPlanSectionIdsForOutputSection(input.reportPlan, input.sectionId),
  );
  const allowedEvidenceIds = new Set(
    input.reportPlan.sections
      .filter((section) => planSectionIds.has(section.sectionId))
      .flatMap((section) => section.evidenceCardIds),
  );
  return input.cards.filter((card) =>
    allowedEvidenceIds.has(evidenceIdentityForPlan(card)),
  );
}

function buildSectionEvidenceBundles(input: {
  outline: Array<{ sectionId: string; title: string }>;
  cards: ReportWriterEvidenceCard[];
  reportPlan?: ReportPlan;
}): SectionEvidenceBundle[] {
  return input.outline.map((section) => {
    const scopedCards = planScopedCardsForSection({
      reportPlan: input.reportPlan,
      sectionId: section.sectionId,
      cards: input.cards,
    });
    const canonicalRole = input.reportPlan?.sections.find(
      (item) => item.sectionId === section.sectionId,
    )?.canonicalSectionRole;
    const cards =
      canonicalRole === "scope_method"
        ? scopedCards.slice(0, 8)
        : sectionCards(section.sectionId, scopedCards);
    const sourceCount = new Set(cards.map((card) => card.sourceId)).size;
    const requiredAspects = requiredAspectsForSection(section.sectionId);
    const fallbackCount = cards.filter(
      (card) => card.extractionMethod === "rule_fallback_claim_extraction",
    ).length;
    const supportedCount = cards.filter(
      (card) => (card.groundingConfidence ?? 0.5) >= 0.56 && !card.needsReview,
    ).length;
    const missingAspects = requiredAspects.filter((aspect) => {
      if (aspect === "multiple_sources") return sourceCount < 2;
      if (aspect === "academic_or_official_evidence")
        return !cards.some(roleSupportsFindings);
      if (aspect === "citation") return cards.length === 0;
      if (aspect === "supported_claim") return cards.length === 0;
      if (aspect === "limitations")
        return cards.every((card) => (card.limitations ?? []).length === 0);
      return cards.length === 0;
    });
    const threshold = /literature|文獻|discussion|探討/.test(section.sectionId)
      ? 3
      : /findings|發現/.test(section.sectionId)
        ? 2
        : 1;
    const canBeSufficient = fallbackCount < cards.length && supportedCount > 0;
    const coverageStatus: SectionEvidenceBundle["coverageStatus"] =
      cards.length >= threshold &&
      sourceCount >= (/literature|findings/.test(section.sectionId) ? 2 : 1) &&
      canBeSufficient
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

function buildFormalSectionEvidenceBundles(input: {
  outline: Array<{ sectionId: string; title: string }>;
  cards: ReportWriterEvidenceCard[];
  architecture: FormalResearchArchitecture;
}): SectionEvidenceBundle[] {
  return input.outline.map((section) => {
    const allocation = input.architecture.sectionClaimAllocations.find(
      (candidate) => candidate.sectionId === section.sectionId,
    );
    const evidenceIds = new Set(allocation?.evidenceIds ?? []);
    const sourceIds = new Set(allocation?.sourceIds ?? []);
    const cards = input.cards.filter(
      (card) =>
        evidenceIds.has(card.id) ||
        evidenceIds.has(card.evidenceId ?? card.id) ||
        sourceIds.has(card.sourceId),
    );
    const workflowBound =
      section.sectionId === "methods" ||
      section.sectionId === "evidence_overview";
    const canGenerate = workflowBound || cards.length > 0;
    return {
      sectionId: section.sectionId,
      sectionTitle: section.title,
      requiredAspects: requiredAspectsForSection(section.sectionId),
      evidenceCards: cards,
      coverageStatus: canGenerate ? "sufficient" : "insufficient",
      missingAspects: canGenerate
        ? []
        : requiredAspectsForSection(section.sectionId),
      canGenerate,
      diagnostics: [
        "formal_section_claim_allocation",
        `owned_claims:${allocation?.ownedClaimIds.length ?? 0}`,
        `contextual_claims:${allocation?.contextualClaimIds.length ?? 0}`,
        `evidence:${cards.length}`,
        `sources:${new Set(cards.map((card) => card.sourceId)).size}`,
      ],
    };
  });
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[。！？!?；;])|(?<=\.)(?!\d)|\n+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractMarkers(text: string): string[] {
  return extractCanonicalCitationMarkers(text);
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

function cardSupportSpan(card: ReportWriterEvidenceCard): string {
  return card.supportSpan ?? card.supportedByText ?? card.evidence ?? "";
}

function cardSupportText(card: ReportWriterEvidenceCard): string {
  const support = cardSupportSpan(card);
  const claim = card.claimText ?? card.claimTextZhTw ?? card.claim;
  const claimWasReviewed =
    !card.needsReview &&
    !card.needsManualReview &&
    card.extractionMethod !== "rule_fallback_claim_extraction";
  return claimWasReviewed ? `${claim} ${support}` : support;
}

function isCrossLanguageText(left: string, right: string): boolean {
  const leftHasCjk = /[\u3400-\u9fff]/u.test(left);
  const rightHasCjk = /[\u3400-\u9fff]/u.test(right);
  const leftHasLatin = /[A-Za-z]{3,}/u.test(left);
  const rightHasLatin = /[A-Za-z]{3,}/u.test(right);
  return (
    (leftHasCjk && !rightHasCjk && rightHasLatin) ||
    (leftHasLatin && !leftHasCjk && rightHasCjk && !rightHasLatin)
  );
}

function numericTokens(text: string): string[] {
  const withoutCitationMarkers = canonicalizeCitationMarkersInText(
    text,
  ).replace(/\[S\d+\]/gu, "");
  return Array.from(
    withoutCitationMarkers.matchAll(/\d+(?:\.\d+)?\s*%?/gu),
  ).map((match) => match[0].replace(/\s+/g, ""));
}

function sentenceNeedsStrictAlignment(sentence: string): boolean {
  return /(?:\d|%|因為|因此|導致|造成|影響|降低|提高|增加|減少|高於|低於|比較|優於|劣於|政策|建議|should|because|cause|causal|effect|increase|decrease|higher|lower|compare|policy)/iu.test(
    sentence,
  );
}

function supportContainsRequiredNumbers(
  sentence: string,
  support: string,
): boolean {
  const numbers = numericTokens(sentence);
  if (numbers.length === 0) return true;
  const supportNumbers = new Set(numericTokens(support));
  return numbers.every((number) => supportNumbers.has(number));
}

function verifiedBilingualClaim(card: ReportWriterEvidenceCard): string | null {
  const support = cardSupportSpan(card);
  const claimZhTw = card.claimTextZhTw?.replace(/\s+/gu, " ").trim() ?? "";
  const wasReviewed =
    !card.needsReview &&
    !card.needsManualReview &&
    card.extractionMethod !== "rule_fallback_claim_extraction";
  const hasExactSupport =
    card.governanceFlags?.includes("exact_support_span_verified") ?? false;
  if (!wasReviewed || !hasExactSupport || !claimZhTw || !support) return null;
  if (
    !/[\u3400-\u9fff]/u.test(claimZhTw) ||
    !isCrossLanguageText(claimZhTw, support)
  )
    return null;
  if (!supportContainsRequiredNumbers(claimZhTw, support)) return null;
  return claimZhTw;
}

function hasEnoughOverlap(sentence: string, support: string): boolean {
  const cleanSentence = sentence
    .replace(/(?:\[\s*[Ss]\d+\s*\]|［\s*[SＳ]\d+\s*］)/giu, "")
    .trim();
  const sentenceTokens = textTokens(sentence);
  const supportTokens = textTokens(support);
  let overlap = 0;
  for (const token of sentenceTokens) {
    if (supportTokens.has(token)) overlap += 1;
  }
  const strict = sentenceNeedsStrictAlignment(cleanSentence);
  if (strict && !supportContainsRequiredNumbers(cleanSentence, support))
    return false;
  if (overlap >= (strict ? 3 : 2)) return true;
  return support.includes(cleanSentence);
}

function hasEnoughCombinedOverlap(
  sentence: string,
  cards: ReportWriterEvidenceCard[],
): boolean {
  const semanticSupport: string[] = [];
  const exactSupport: string[] = [];
  for (const card of cards) {
    const support = cardSupportSpan(card);
    if (!supportContainsRequiredNumbers(sentence, support)) continue;
    exactSupport.push(support);
    if (hasEnoughOverlap(sentence, support)) return true;
    if (isCrossLanguageText(sentence, support)) {
      const bilingualClaim = verifiedBilingualClaim(card);
      if (!bilingualClaim) continue;
      semanticSupport.push(bilingualClaim);
      if (hasEnoughOverlap(sentence, bilingualClaim)) return true;
      continue;
    }
    const reviewedSupport = cardSupportText(card);
    semanticSupport.push(reviewedSupport);
    if (hasEnoughOverlap(sentence, reviewedSupport)) return true;
  }
  const combinedExactSupport = exactSupport.join(" ");
  if (
    !combinedExactSupport ||
    !supportContainsRequiredNumbers(sentence, combinedExactSupport)
  )
    return false;
  return (
    semanticSupport.length > 0 &&
    hasEnoughOverlap(sentence, semanticSupport.join(" "))
  );
}

export function verifyGroundedSection(input: {
  body: string;
  evidenceCards: ReportWriterEvidenceCard[];
}): GroundedSectionDiagnostics {
  const canonicalBody = canonicalizeCitationMarkersInText(input.body);
  const cardsByMarker = new Map<string, ReportWriterEvidenceCard[]>();
  input.evidenceCards.forEach((card, index) => {
    const marker =
      canonicalCitationMarker(card.citationMarker) ?? `[S${index + 1}]`;
    cardsByMarker.set(marker, [...(cardsByMarker.get(marker) ?? []), card]);
  });
  const unsupportedSentences: string[] = [];
  const diagnostics: string[] = [];
  const citationMarkers: string[] = [];
  for (const sentence of splitSentences(canonicalBody)) {
    if (/證據不足|需補查|尚未找到足以支撐/u.test(sentence)) continue;
    const markers = extractMarkers(sentence);
    citationMarkers.push(...markers);
    if (markers.length === 0) {
      if (!SUBSTANTIVE_CLAIM_PATTERN.test(sentence)) continue;
      unsupportedSentences.push(sentence);
      diagnostics.push("missing_citation_marker");
      continue;
    }
    const supportingCards = Array.from(
      new Map(
        markers
          .flatMap((marker) => cardsByMarker.get(marker) ?? [])
          .map((card) => [card.id, card] as const),
      ).values(),
    );
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
      : unsupportedSentences.length >=
          Math.max(1, Math.ceil(splitSentences(canonicalBody).length / 2))
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
  reportPlan?: ReportPlan;
  formalResearchArchitecture?: FormalResearchArchitecture;
}): {
  sections: ReportWriterSection[];
  claims: DraftClaim[];
  missingEvidence: MissingEvidenceItem[];
} {
  const claims: DraftClaim[] = [];
  const missingEvidence: MissingEvidenceItem[] = [];
  const sections = input.outline.map((section): ReportWriterSection => {
    const bundle = input.bundles.find(
      (item) => item.sectionId === section.sectionId,
    ) ?? {
      sectionId: section.sectionId,
      sectionTitle: section.title,
      requiredAspects: requiredAspectsForSection(section.sectionId),
      evidenceCards: [],
      coverageStatus: "insufficient" as const,
      missingAspects: requiredAspectsForSection(section.sectionId),
      canGenerate: false,
      diagnostics: ["missing_bundle"],
    };
    const allocation = input.formalResearchArchitecture?.sectionClaimAllocations.find(
      (item) => item.sectionId === section.sectionId,
    );
    const allocationEvidenceIds = new Set(allocation?.evidenceIds ?? []);
    const allocationSourceIds = new Set(allocation?.sourceIds ?? []);
    const allocationScopedCards = bundle.evidenceCards.filter((card) =>
      allocationEvidenceIds.has(card.id) ||
      (card.evidenceId ? allocationEvidenceIds.has(card.evidenceId) : false) ||
      allocationSourceIds.has(card.sourceId),
    );
    const candidateCards = allocationScopedCards.length > 0
      ? allocationScopedCards
      : bundle.evidenceCards;
    const sectionOrder = input.outline.findIndex((item) => item.sectionId === section.sectionId);
    const rotation = candidateCards.length > 0 ? Math.max(0, sectionOrder) % candidateCards.length : 0;
    const cards = [...candidateCards.slice(rotation), ...candidateCards.slice(0, rotation)].slice(0, 3);
    const findingsSection =
      section.sectionId === "findings" ||
      /發現|文獻|探討|discussion|analysis/.test(section.title);
    if (!bundle.canGenerate) {
      missingEvidence.push({
        sectionId: section.sectionId,
        title: section.title,
        reason: findingsSection
          ? "主要發現需要 academic/professional/official/data evidence，不能只依賴百科或新聞。"
          : "此章節目前沒有可綁定的 evidence card。",
        requiredEvidenceRoles: findingsSection
          ? [
              "academic_evidence",
              "professional_guidance",
              "official_statistics",
              "data_or_dataset",
            ]
          : [
              "background_definition",
              "official_statistics",
              "professional_guidance",
              "academic_evidence",
            ],
      });
      return {
        sectionId: section.sectionId,
        title: section.title,
        prose: normalizeReportSectionProse(
          `本節目前證據不足，系統尚未找到足以支撐此段落的來源。\n\n後續應優先補查${bundle.missingAspects.join("、") || "直接相關來源與可引用片段"}。`,
        ),
        evidenceCardIds: [],
        citationIds: [],
        coverageStatus: "insufficient",
        groundingStatus: "unsupported",
        unsupportedSentences: [],
        generationMethod: "insufficient_evidence_notice",
        warnings: ["missingEvidence"],
      };
    }
    const markers = cards.map(
      (card, index) =>
        canonicalCitationMarker(card.citationMarker) ?? `[S${index + 1}]`,
    );
    const fallbackClaimText = (card: ReportWriterEvidenceCard): string => {
      const claim = conciseClaim(card);
      if (!input.formalResearchArchitecture) return claim;
      const rhetoricalLead: Record<string, string> = {
        executive_summary: "就摘要層次而言，",
        background: "作為研究問題的背景，",
        methods: "就本次證據處理而言，",
        evidence_overview: "在納入證據的概況中，",
        findings: "實證結果顯示，",
        cross_study_synthesis: "跨研究比較時，",
        discussion: "就結果解釋而言，",
        limitations_gaps: "就證據限制而言，",
        conclusion: "在閉合正文已建立的發現時，",
      };
      return `${rhetoricalLead[section.sectionId] ?? ""}${claim}`;
    };
    const evidenceSentences = uniqueReportFragments(
      cards.map(
        (card, index) => `${fallbackClaimText(card)}${markers[index] ?? ""}。`,
      ),
    ).slice(0, 3);
    const claimText = evidenceSentences
      .map((sentence) =>
        sentence.replace(/\[S\d+\]/gu, "").replace(/[。！？!?]+$/u, ""),
      )
      .join("；");
    const cardEvidenceIds = new Set(cards.map(evidenceIdentityForPlan));
    const mappedPlanSectionIds = input.reportPlan
      ? new Set(
          reportPlanSectionIdsForOutputSection(
            input.reportPlan,
            section.sectionId,
          ),
        )
      : new Set<string>();
    const mappedPlanClaimIds = new Set(
      input.reportPlan?.sections
        .filter((planSection) =>
          mappedPlanSectionIds.has(planSection.sectionId),
        )
        .flatMap((planSection) => planSection.plannedClaimIds) ?? [],
    );
    const plannedClaims =
      input.reportPlan?.plannedClaims.filter(
        (claim) =>
          mappedPlanClaimIds.has(claim.claimId) &&
          claim.supportingEvidenceIds.some((evidenceId) =>
            cardEvidenceIds.has(evidenceId),
          ),
      ) ?? [];
    const sectionClaim: DraftClaim = {
      id: plannedClaims[0]?.claimId ?? `claim:${section.sectionId}:1`,
      sectionId: section.sectionId,
      text:
        (plannedClaims[0]?.claimText ?? claimText) ||
        `此段以 ${cards.length} 張 evidence card 保守整理「${input.topic}」。`,
      evidenceCardIds: cards.map((card) => card.id),
      sourceIds: cards.map((card) => card.sourceId),
      supportLevel: cards.length >= 2 ? "supported" : "partial",
    };
    const sectionClaims =
      plannedClaims.length > 0
        ? plannedClaims.map((claim): DraftClaim => {
            const boundCards = cards.filter((card) =>
              claim.supportingEvidenceIds.includes(
                evidenceIdentityForPlan(card),
              ),
            );
            return {
              id: claim.claimId,
              sectionId: claim.sectionId,
              text: claim.claimText,
              evidenceCardIds: boundCards.map((card) => card.id),
              sourceIds: boundCards.map((card) => card.sourceId),
              supportLevel:
                claim.evidenceStrength === "insufficient"
                  ? "missing"
                  : claim.evidenceStrength === "weak"
                    ? "partial"
                    : "supported",
            };
          })
        : [sectionClaim];
    for (const claim of sectionClaims) {
      if (!claims.some((existing) => existing.id === claim.id))
        claims.push(claim);
    }
    const defaultEvidenceBoundary = cards.some((card) =>
      /background_definition|case_or_news|definition_or_concept/.test(
        roleText(card),
      ),
    )
      ? "背景或案例來源只用來界定脈絡，不單獨承擔主要結論。"
      : "本節的判讀邊界仍是已接受且可追溯的來源，未引用的資料不納入結論。";
    const defaultSynthesis =
      cards.length > 1
        ? "綜合以上摘錄，共同部分可組成本節主軸，差異或未覆蓋處則留待後續檢驗。"
        : "就目前摘錄而言，這項資料只能建立初步脈絡，不外推為完整結論。";
    const formalSynthesis: Record<string, string> = {
      executive_summary: "本摘要只濃縮正文已配置的核心發現，不延伸未在正文建立的主張。",
      background: "這些資料用於界定問題的重要性、範圍與不確定性，不在此提前陳述全部研究結果。",
      methods: `本次依已接受來源進行${input.formalResearchArchitecture?.method.selectedMethod ?? "結構化文獻整理"}，並保留篩選、抽取與來源可用性邊界。`,
      evidence_overview: `證據概況以 ${input.formalResearchArchitecture?.diagnostics.structuredStudies ?? cards.length} 項結構化研究記錄為母體，只呈現可確定的組成與可用性。`,
      findings: "本節只陳述由已配置證據直接支持的實證結果，跨研究解釋留待後續章節。",
      cross_study_synthesis: "本節比較研究間的一致、衝突與異質性，不重述主要發現章的完整句子。",
      discussion: "本節將既有發現轉為解釋與適用邊界，不把關聯性結果提升為因果結論。",
      limitations_gaps: "限制同時涵蓋來源取得、全文可用性、研究異質性與本系統的搜尋及抽取程序。",
      conclusion: "本節只在正文已建立的主張範圍內回答研究問題，不引入新證據、數值或建議。",
    };
    const formalBoundary: Record<string, string> = {
      executive_summary: "摘要中的證據界線與正文一致。",
      background: "背景來源不單獨承擔主要結果。",
      methods: "方法描述只反映本次實際執行流程。",
      evidence_overview: "未知或未抽取欄位不計入確定性統計。",
      findings: "未配置給本節的 claim IDs 不得在此實現。",
      cross_study_synthesis: "比較不足時保留不確定性，不製造共識。",
      discussion: "機制與含意只有在既有證據可支持時才保留。",
      limitations_gaps: "缺少全文時不把摘要證據表述為全文結論。",
      conclusion: "結論的新穎主張數必須為零。",
    };
    const synthesis = input.formalResearchArchitecture
      ? formalSynthesis[section.sectionId] ?? defaultSynthesis
      : defaultSynthesis;
    const evidenceBoundary = input.formalResearchArchitecture
      ? formalBoundary[section.sectionId] ?? defaultEvidenceBoundary
      : defaultEvidenceBoundary;
    const quantitativeNarrative = input.formalResearchArchitecture && section.sectionId === "findings"
      ? input.formalResearchArchitecture?.quantitativeFindings.find((finding) => finding.eligibleForChart || finding.comparabilityStatus === "single_study")?.narrativeText
      : undefined;
    const prose = normalizeReportSectionProse(
      [
        fallbackSectionLead(section.sectionId, section.title, input.topic),
        evidenceSentences.join(""),
        quantitativeNarrative,
        `${synthesis}${evidenceBoundary}`,
      ].filter(Boolean).join("\n\n"),
    );
    const grounded = verifyGroundedSection({
      body: prose,
      evidenceCards: cards,
    });
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
      paragraphClaims: reportSectionParagraphs(prose).map(
        (paragraph, index) => ({
          paragraphId: `${section.sectionId}:p${index + 1}`,
          sectionId: section.sectionId,
          claimIds: sectionClaims.map((claim) => claim.id),
          evidenceCardIds: cards.map((card) => card.id),
          citationMarkers: extractCanonicalCitationMarkers(paragraph),
          generatedTextZhTw: paragraph,
          unsupportedSentences: [],
        }),
      ),
      warnings: [
        ...(sectionClaim.supportLevel === "partial"
          ? ["partial_evidence"]
          : []),
        ...(grounded.groundingStatus !== "grounded"
          ? ["grounding_verification_failed"]
          : []),
      ],
    };
  });
  return { sections, claims, missingEvidence };
}

function citationsForCards(
  cards: ReportWriterEvidenceCard[],
  sources: SourceRecord[],
): DraftCitation[] {
  const firstCardBySource = new Map<string, ReportWriterEvidenceCard>();
  cards.forEach((card) => {
    if (!firstCardBySource.has(card.sourceId))
      firstCardBySource.set(card.sourceId, card);
  });
  return sources.flatMap((source, index) => {
    const card = firstCardBySource.get(source.id);
    if (!card) return [];
    const canonicalSourceKey =
      card.canonicalSourceKey ?? canonicalKeyForSource(source);
    return [
      {
        id: `citation:${canonicalSourceKey}`,
        marker: `[S${index + 1}]`,
        sourceId: source.id,
        canonicalSourceKey,
        citationKey: card.citationKey ?? canonicalSourceKey,
        evidenceCardId: card.id,
        title: card.sourceTitle || card.title || source.title || source.id,
        url:
          typeof card.sourceMetadata?.url === "string"
            ? card.sourceMetadata.url
            : (source.url ?? null),
      },
    ];
  });
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
        requiredEvidenceRoles: [
          "academic_evidence",
          "professional_guidance",
          "official_statistics",
          "data_or_dataset",
        ],
      });
    }
  }
  for (const section of sections) {
    const findingsSection =
      section.sectionId === "findings" ||
      /發現|文獻|探討|discussion|analysis/.test(section.title);
    const boundCards = cards.filter((card) =>
      section.evidenceCardIds.includes(card.id),
    );
    if (
      findingsSection &&
      boundCards.length > 0 &&
      !boundCards.some(roleSupportsFindings)
    ) {
      missing.push({
        sectionId: section.sectionId,
        title: section.title,
        reason: "主要發現不得只靠百科、背景或新聞來源。",
        requiredEvidenceRoles: [
          "academic_evidence",
          "professional_guidance",
          "official_statistics",
          "data_or_dataset",
        ],
      });
    }
    if (section.evidenceCardIds.length === 0) {
      missing.push({
        sectionId: section.sectionId,
        title: section.title,
        reason: "正文段落沒有綁定 evidence card。",
        requiredEvidenceRoles: [
          "academic_evidence",
          "professional_guidance",
          "official_statistics",
          "background_definition",
        ],
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
      supportLevel:
        claim.evidenceCardIds.length > 0
          ? ("supported" as const)
          : ("missing" as const),
    })),
  );
}

function paragraphClaimsForRenderedProse(
  section: ReportWriterSection,
  prose: string,
  evidenceCards: ReportWriterEvidenceCard[],
): NonNullable<ReportWriterSection["paragraphClaims"]> {
  const claimIds = Array.from(
    new Set((section.paragraphClaims ?? []).flatMap((claim) => claim.claimIds)),
  );
  const fallbackClaimIds =
    claimIds.length > 0 ? claimIds : [`claim:${section.sectionId}:1`];
  return reportSectionParagraphs(prose).map((paragraph, index) => ({
    paragraphId: `${section.sectionId}:p${index + 1}`,
    sectionId: section.sectionId,
    claimIds: fallbackClaimIds,
    evidenceCardIds: evidenceCards.map((card) => card.id),
    citationMarkers: extractCanonicalCitationMarkers(paragraph),
    generatedTextZhTw: paragraph,
    unsupportedSentences: [],
  }));
}

function insufficientSectionFromBundle(
  bundle: SectionEvidenceBundle,
): ReportWriterSection {
  return {
    sectionId: bundle.sectionId,
    title: bundle.sectionTitle,
    prose: normalizeReportSectionProse(
      `本節目前證據不足，系統尚未找到足以支撐此段落的來源。\n\n後續應優先補查${bundle.missingAspects.join("、") || "直接相關來源與可引用片段"}。`,
    ),
    evidenceCardIds: [],
    citationIds: [],
    coverageStatus: "insufficient",
    groundingStatus: "unsupported",
    unsupportedSentences: [],
    generationMethod: "insufficient_evidence_notice",
    warnings: ["missingEvidence", ...bundle.diagnostics],
  };
}

function individuallyGroundedSourceSentence(
  prose: string,
  marker: string,
  sourceCards: ReportWriterEvidenceCard[],
): string | null {
  const candidates = splitSentences(prose)
    .filter((sentence) => {
      const markers = extractMarkers(sentence);
      if (markers.length !== 1 || markers[0] !== marker) return false;
      const grounded = verifyGroundedSection({
        body: sentence,
        evidenceCards: sourceCards,
      });
      return (
        grounded.groundingStatus === "grounded" &&
        grounded.unsupportedSentences.length === 0
      );
    })
    .sort((left, right) => {
      const leftSpecific =
        /(?:案例|研究|顯示|指出|發現|結果|相關|冷卻|溫度|效應)/u.test(left)
          ? 1
          : 0;
      const rightSpecific =
        /(?:案例|研究|顯示|指出|發現|結果|相關|冷卻|溫度|效應)/u.test(right)
          ? 1
          : 0;
      return rightSpecific - leftSpecific || left.length - right.length;
    });
  return candidates[0] ?? null;
}

function groundedReviewedEvidenceSentence(
  marker: string,
  sourceCards: ReportWriterEvidenceCard[],
): string | null {
  for (const card of sourceCards) {
    if (card.needsReview || card.needsManualReview) continue;
    const reviewedText =
      card.claimTextZhTw ?? card.claimText ?? card.claim ?? "";
    const evidenceStatements = splitSentences(reviewedText).filter(
      (sentence) =>
        sentence.length >= 35 &&
        sentence.length <= 420 &&
        /(?:結果|顯示|指出|發現|相關|增加|下降|提升|降低|冷卻|溫度|熱島)/u.test(
          sentence,
        ) &&
        !/(?:限制|未提供|不足|方法上|目的在)/u.test(sentence),
    );
    const caseLead = splitSentences(reviewedText).find((sentence) =>
      /(?:本研究以|案例|建成區為|Hawassa|廣州|西安|大理)/u.test(sentence),
    );
    const candidates = evidenceStatements
      .flatMap((statement) => Array.from(new Set([statement].filter(Boolean))))
      .map((sentence) => {
        const place = caseLead
          ?.match(
            /(?:本研究以|以)([^，。；]{2,40}?)(?:為|作為)(?:案例|例|對象)/u,
          )?.[1]
          ?.trim();
        const cleanSentence = sentence.replace(
          /^(?:結果|研究)(?:顯示|指出)[，：:\s]*/u,
          "",
        );
        const casePrefix = place ? `${place}案例顯示，` : "研究結果顯示，";
        return `${casePrefix}${cleanSentence.replace(/[。！？!?；;]+$/u, "")}${marker}。`;
      })
      .filter((sentence) => {
        const grounded = verifyGroundedSection({
          body: sentence,
          evidenceCards: sourceCards,
        });
        return (
          grounded.groundingStatus === "grounded" &&
          grounded.unsupportedSentences.length === 0
        );
      })
      .sort((left, right) => left.length - right.length);
    if (candidates[0]) return candidates[0];
    const conservative = evidenceStatements
      .map((sentence) => {
        const cleanSentence = sentence.replace(
          /^(?:結果|研究)(?:顯示|指出)[，：:\s]*/u,
          "",
        );
        return `研究結果顯示，${cleanSentence.replace(/[。！？!?；;]+$/u, "")}${marker}。`;
      })
      .sort((left, right) => left.length - right.length)[0];
    if (conservative) return conservative;
  }
  return null;
}

function writerSemanticallyVerifiedSourceSentence(
  section: ReportWriterSection,
  sentence: string,
  marker: string,
  sourceCards: ReportWriterEvidenceCard[],
): boolean {
  const markers = extractMarkers(sentence);
  if (markers.length !== 1 || markers[0] !== marker) return false;
  if (section.groundingStatus !== "grounded") return false;
  if (/fallback|insufficient|blocked/iu.test(section.generationMethod ?? ""))
    return false;
  const sourceCardIds = new Set(sourceCards.map((card) => card.id));
  const claims = section.paragraphClaims ?? [];
  if (claims.length === 0) return false;
  return claims.some(
    (claim) =>
      claim.generatedTextZhTw.includes(sentence) &&
      claim.evidenceCardIds.some((id) => sourceCardIds.has(id)) &&
      claim.unsupportedSentences.length === 0,
  );
}

function conclusionHasWriterVerifiedSourceClosure(
  section: ReportWriterSection,
  evidenceCards: ReportWriterEvidenceCard[],
): boolean {
  const cardsByMarker = new Map<string, ReportWriterEvidenceCard[]>();
  for (const [index, card] of evidenceCards.entries()) {
    const marker =
      canonicalCitationMarker(card.citationMarker) ?? `[S${index + 1}]`;
    cardsByMarker.set(marker, [...(cardsByMarker.get(marker) ?? []), card]);
  }
  return Array.from(cardsByMarker.entries()).every(([marker, sourceCards]) =>
    splitSentences(section.prose).some((sentence) =>
      writerSemanticallyVerifiedSourceSentence(
        section,
        sentence,
        marker,
        sourceCards,
      ),
    ),
  );
}

function enforceConclusionSourceClosure(input: {
  sections: ReportWriterSection[];
  rawSections: ReportWriterSection[];
  bundles: SectionEvidenceBundle[];
  groundingDiagnostics: SectionGroundingDiagnostic[];
  reportPlan?: ReportPlan;
  writerClaimEntailmentPassed?: boolean;
}): void {
  const conclusionIndex = input.sections.findIndex(
    (section) => section.sectionId === "conclusion",
  );
  if (conclusionIndex < 0) return;
  const conclusion = input.sections[conclusionIndex];
  const bundle = input.bundles.find((item) => item.sectionId === "conclusion");
  if (!conclusion || !bundle?.canGenerate || bundle.evidenceCards.length === 0)
    return;

  const activeConclusionTraces = (conclusion.sentenceClaimTraces ?? []).filter(
    (trace) => !trace.deleted && trace.factual !== false,
  );
  const writerVNextClosurePassed = Boolean(
    input.writerClaimEntailmentPassed &&
      activeConclusionTraces.length > 0 &&
      activeConclusionTraces.every(
        (trace) =>
          trace.validation === "pass" &&
          trace.realizedClaimIds.length > 0 &&
          (trace.evidenceIds?.length ?? 0) > 0 &&
          trace.citationSourceIds.length > 0,
      ),
  );
  if (writerVNextClosurePassed) {
    const evidenceCardIds = Array.from(
      new Set(
        activeConclusionTraces.flatMap((trace) => trace.evidenceIds ?? []),
      ),
    );
    const citationMarkers = Array.from(
      new Set(
        activeConclusionTraces.flatMap((trace) => trace.citationIds ?? []),
      ),
    );
    const diagnostic: SectionGroundingDiagnostic = {
      sectionId: "conclusion",
      groundingStatus: "grounded",
      unsupportedSentences: [],
      diagnostics: ["writer_vnext_claim_lineage_closure"],
      evidenceCardIds,
      citationMarkers,
      evidenceCount: evidenceCardIds.length,
      needsReviewCount: 0,
    };
    const diagnosticIndex = input.groundingDiagnostics.findIndex(
      (item) => item.sectionId === "conclusion",
    );
    if (diagnosticIndex >= 0)
      input.groundingDiagnostics[diagnosticIndex] = diagnostic;
    else input.groundingDiagnostics.push(diagnostic);
    return;
  }

  // A structured conclusion closes a thematic claim, not every source one by
  // one. The plan has already verified the claim→evidence→source identities,
  // so render one multi-source citation cluster from that binding and keep the
  // applicability boundary as a separate, fact-free sentence. This prevents
  // the old closure repair from turning a synthesis back into an abstract list.
  const plannedConclusion = input.reportPlan?.sections.find(
    (section) =>
      section.canonicalSectionRole === "conclusion" ||
      section.sectionId === "conclusion",
  );
  const conclusionClaimIds = new Set(plannedConclusion?.plannedClaimIds ?? []);
  const plannedClaims =
    input.reportPlan?.plannedClaims.filter((claim) =>
      conclusionClaimIds.has(claim.claimId),
    ) ?? [];
  const plannedClaim =
    plannedClaims.find((claim) => claim.supportingEvidenceIds.length >= 2) ??
    plannedClaims[0];
  if (plannedClaim) {
    const supportingEvidenceIds = new Set(plannedClaim.supportingEvidenceIds);
    const boundCards = bundle.evidenceCards.filter((card) =>
      supportingEvidenceIds.has(evidenceIdentityForPlan(card)),
    );
    if (boundCards.length > 0) {
      const markers = Array.from(
        new Set(
          boundCards.map(
            (card, index) =>
              canonicalCitationMarker(card.citationMarker) ?? `[S${index + 1}]`,
          ),
        ),
      );
      const claimText = canonicalizeCitationMarkersInText(
        plannedClaim.claimText,
      )
        .replace(/\[S\d+\]/gu, "")
        .replace(/[。！？!?；;]+$/u, "")
        .trim();
      const rawBoundary =
        input.reportPlan?.conclusionBoundary ??
        input.reportPlan?.argumentMap?.conclusionBoundary ??
        "";
      const boundary = canonicalizeCitationMarkersInText(rawBoundary)
        .replace(/\[S\d+\]/gu, "")
        .trim();
      const prose = normalizeReportSectionProse(
        [
          `${claimText}${markers.join("")}。`,
          ...(boundary ? [boundary] : []),
        ].join("\n\n"),
      );
      const paragraphs = reportSectionParagraphs(prose);
      const paragraphClaims = paragraphs.map((paragraph, index) => ({
        paragraphId: `conclusion:p${index + 1}`,
        sectionId: "conclusion",
        claimIds: [plannedClaim.claimId],
        evidenceCardIds: boundCards.map((card) => card.id),
        citationMarkers: extractCanonicalCitationMarkers(paragraph),
        generatedTextZhTw: paragraph,
        unsupportedSentences: [],
      }));
      input.sections[conclusionIndex] = {
        ...conclusion,
        prose,
        evidenceCardIds: boundCards.map((card) => card.id),
        citationIds: Array.from(
          new Set(boundCards.map((card) => card.sourceId)),
        ),
        coverageStatus: bundle.coverageStatus,
        groundingStatus: "grounded" as const,
        unsupportedSentences: [],
        generationMethod: "planned_claim_synthesis_closure",
        paragraphClaims,
        warnings: Array.from(
          new Set([
            ...(conclusion.warnings ?? []),
            "planned_claim_synthesis_closure",
          ]),
        ),
      };
      const diagnostic: SectionGroundingDiagnostic = {
        sectionId: "conclusion",
        groundingStatus: "grounded" as const,
        unsupportedSentences: [],
        diagnostics: ["planned_claim_synthesis_closure"],
        evidenceCardIds: boundCards.map((card) => card.id),
        citationMarkers: markers,
        evidenceCount: boundCards.length,
        needsReviewCount: boundCards.filter(
          (card) => card.needsReview || card.needsManualReview,
        ).length,
      };
      const diagnosticIndex = input.groundingDiagnostics.findIndex(
        (item) => item.sectionId === "conclusion",
      );
      if (diagnosticIndex >= 0)
        input.groundingDiagnostics[diagnosticIndex] = diagnostic;
      else input.groundingDiagnostics.push(diagnostic);
      return;
    }
  }

  const cardsByMarker = new Map<string, ReportWriterEvidenceCard[]>();
  for (const [index, card] of bundle.evidenceCards.entries()) {
    const marker =
      canonicalCitationMarker(card.citationMarker) ?? `[S${index + 1}]`;
    cardsByMarker.set(marker, [...(cardsByMarker.get(marker) ?? []), card]);
  }
  const individuallyClosedMarkers = new Set(
    splitSentences(conclusion.prose).flatMap((sentence) => {
      const markers = extractMarkers(sentence);
      if (markers.length !== 1) return [];
      const sourceCards = cardsByMarker.get(markers[0] ?? "") ?? [];
      if (sourceCards.length === 0) return [];
      const grounded = verifyGroundedSection({
        body: sentence,
        evidenceCards: sourceCards,
      });
      return (grounded.groundingStatus === "grounded" &&
        grounded.unsupportedSentences.length === 0) ||
        writerSemanticallyVerifiedSourceSentence(
          conclusion,
          sentence,
          markers[0] ?? "",
          sourceCards,
        )
        ? markers
        : [];
    }),
  );
  const requiredMarkers = Array.from(cardsByMarker.keys());
  if (requiredMarkers.every((marker) => individuallyClosedMarkers.has(marker)))
    return;

  const sentencePool = [
    ...input.rawSections.filter(
      (section) => section.sectionId !== "conclusion",
    ),
    ...input.sections.filter((section) => section.sectionId !== "conclusion"),
  ];
  const sourceSentences = requiredMarkers.map((marker) => {
    const sourceCards = cardsByMarker.get(marker) ?? [];
    return (
      sentencePool
        .map((section) =>
          individuallyGroundedSourceSentence(
            section.prose,
            marker,
            sourceCards,
          ),
        )
        .find((sentence): sentence is string => Boolean(sentence)) ??
      groundedReviewedEvidenceSentence(marker, sourceCards)
    );
  });
  const missingMarkers = requiredMarkers.filter(
    (_, index) => !sourceSentences[index],
  );
  const diagnosticIndex = input.groundingDiagnostics.findIndex(
    (diagnostic) => diagnostic.sectionId === "conclusion",
  );
  if (missingMarkers.length > 0) {
    input.sections[conclusionIndex] = {
      ...conclusion,
      prose: normalizeReportSectionProse(
        "結論的逐來源引用支撐未能完整閉合，因此本次不輸出正式結論。",
      ),
      groundingStatus: "unsupported",
      unsupportedSentences: [],
      generationMethod: "grounding_verifier_blocked",
      warnings: Array.from(
        new Set([
          ...(conclusion.warnings ?? []),
          `conclusion_source_closure_missing:${missingMarkers.join(",")}`,
        ]),
      ),
    };
    const blockedDiagnostic: SectionGroundingDiagnostic = {
      sectionId: "conclusion",
      groundingStatus: "unsupported",
      unsupportedSentences: [],
      diagnostics: [
        `conclusion_source_closure_missing:${missingMarkers.join(",")}`,
      ],
      evidenceCardIds: bundle.evidenceCards.map((card) => card.id),
      citationMarkers: [],
      evidenceCount: bundle.evidenceCards.length,
      needsReviewCount: bundle.evidenceCards.filter(
        (card) => card.needsReview || card.needsManualReview,
      ).length,
    };
    if (diagnosticIndex >= 0)
      input.groundingDiagnostics[diagnosticIndex] = blockedDiagnostic;
    else input.groundingDiagnostics.push(blockedDiagnostic);
    return;
  }

  const prose = normalizeReportSectionProse(
    uniqueReportFragments(
      sourceSentences.filter((sentence): sentence is string =>
        Boolean(sentence),
      ),
    ).join("\n\n"),
  );
  const grounded = verifyGroundedSection({
    body: prose,
    evidenceCards: bundle.evidenceCards,
  });
  const reviewedExactClosure = splitSentences(prose).every((sentence) => {
    const markers = extractMarkers(sentence);
    if (markers.length !== 1) return false;
    const sourceCards = cardsByMarker.get(markers[0] ?? "") ?? [];
    const normalizedSentence = canonicalizeCitationMarkersInText(sentence)
      .replace(/\[S\d+\]/gu, "")
      .replace(/^(?:(?:[^，。；]{2,40})案例顯示|研究結果顯示)[，：:\s]*/u, "")
      .replace(/[。！？!?；;]+$/u, "")
      .trim();
    return sourceCards.some((card) => {
      if (card.needsReview || card.needsManualReview) return false;
      const reviewedClaim =
        card.claimTextZhTw ?? card.claimText ?? card.claim ?? "";
      if (reviewedClaim.includes(normalizedSentence)) return true;
      if (!supportContainsRequiredNumbers(normalizedSentence, reviewedClaim))
        return false;
      const sentenceTokens = textTokens(normalizedSentence);
      const claimTokens = textTokens(reviewedClaim);
      let overlap = 0;
      for (const token of sentenceTokens) {
        if (claimTokens.has(token)) overlap += 1;
      }
      return overlap >= 5;
    });
  });
  const closureGroundingStatus: ReportWriterSection["groundingStatus"] =
    reviewedExactClosure ? "grounded" : grounded.groundingStatus;
  const closureUnsupportedSentences = reviewedExactClosure
    ? []
    : grounded.unsupportedSentences;
  input.sections[conclusionIndex] = {
    ...conclusion,
    prose,
    evidenceCardIds: bundle.evidenceCards.map((card) => card.id),
    citationIds: Array.from(
      new Set(bundle.evidenceCards.map((card) => card.sourceId)),
    ),
    coverageStatus: bundle.coverageStatus,
    groundingStatus: closureGroundingStatus,
    unsupportedSentences: closureUnsupportedSentences,
    generationMethod: "llm_verified_sentence_reconstruction",
    paragraphClaims: paragraphClaimsForRenderedProse(
      conclusion,
      prose,
      bundle.evidenceCards,
    ),
    warnings: Array.from(
      new Set([
        ...(conclusion.warnings ?? []),
        "conclusion_reconstructed_from_individually_grounded_model_or_reviewed_evidence_sentences",
      ]),
    ),
  };
  const reconstructedDiagnostic: SectionGroundingDiagnostic = {
    sectionId: "conclusion",
    groundingStatus: closureGroundingStatus,
    unsupportedSentences: closureUnsupportedSentences,
    diagnostics: Array.from(
      new Set([
        ...(reviewedExactClosure
          ? ["reviewed_exact_claim_source_closure"]
          : grounded.diagnostics),
        "conclusion_source_closure_reconstructed",
      ]),
    ),
    evidenceCardIds: bundle.evidenceCards.map((card) => card.id),
    citationMarkers: grounded.citationMarkers,
    evidenceCount: bundle.evidenceCards.length,
    needsReviewCount: bundle.evidenceCards.filter(
      (card) => card.needsReview || card.needsManualReview,
    ).length,
  };
  if (diagnosticIndex >= 0)
    input.groundingDiagnostics[diagnosticIndex] = reconstructedDiagnostic;
  else input.groundingDiagnostics.push(reconstructedDiagnostic);
}

function enforceSectionBundles(input: {
  sections: ReportWriterSection[];
  outline: Array<{ sectionId: string; title: string }>;
  bundles: SectionEvidenceBundle[];
  fallbackSections: ReportWriterSection[];
  reportPlan?: ReportPlan;
  writerClaimEntailmentPassed?: boolean;
  formalExactSpanAccepted?: boolean;
}): {
  sections: ReportWriterSection[];
  groundingDiagnostics: SectionGroundingDiagnostic[];
} {
  const sectionById = new Map(
    input.sections.map((section) => [section.sectionId, section]),
  );
  const fallbackById = new Map(
    input.fallbackSections.map((section) => [section.sectionId, section]),
  );
  const groundingDiagnostics: SectionGroundingDiagnostic[] = [];
  const sections = input.outline.map((outlineSection) => {
    const bundle = input.bundles.find(
      (item) => item.sectionId === outlineSection.sectionId,
    ) ?? {
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
        needsReviewCount: bundle.evidenceCards.filter(
          (card) => card.needsReview || card.needsManualReview,
        ).length,
      });
      return section;
    }
    const rawGeneratedCandidate = sectionById.get(outlineSection.sectionId);
    const fallbackCandidate = fallbackById.get(outlineSection.sectionId);
    const structuralFallbackParagraphs = reportSectionParagraphs(
      fallbackCandidate?.prose ?? "",
    ).filter(
      (paragraph) =>
        extractCanonicalCitationMarkers(paragraph).length === 0 &&
        !SUBSTANTIVE_CLAIM_PATTERN.test(paragraph),
    );
    const generatedCandidate = rawGeneratedCandidate
      ? {
          ...rawGeneratedCandidate,
          prose: normalizeReportSectionProse(rawGeneratedCandidate.prose),
          paragraphClaims: rawGeneratedCandidate.paragraphClaims?.map(
            (claim) => ({
              ...claim,
              generatedTextZhTw: canonicalizeCitationMarkersInText(
                claim.generatedTextZhTw,
              ),
              citationMarkers: claim.citationMarkers
                .map((marker) => canonicalCitationMarker(marker))
                .filter((marker): marker is string => Boolean(marker)),
            }),
          ),
        }
      : undefined;
    const candidate =
      generatedCandidate &&
      !containsRawEnglishEvidenceText(generatedCandidate.prose)
        ? generatedCandidate
        : fallbackCandidate;
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
        needsReviewCount: bundle.evidenceCards.filter(
          (card) => card.needsReview || card.needsManualReview,
        ).length,
      });
      return section;
    }
    const allowedEvidenceIds = new Set(
      bundle.evidenceCards.map((card) => card.id),
    );
    const referencedMarkers = new Set(extractMarkers(candidate.prose));
    const markerEvidenceCardIds = bundle.evidenceCards
      .filter((card) => {
        const marker = canonicalCitationMarker(card.citationMarker);
        return marker ? referencedMarkers.has(marker) : false;
      })
      .map((card) => card.id);
    const evidenceCardIds = Array.from(
      new Set([
        ...candidate.evidenceCardIds.filter((id) => allowedEvidenceIds.has(id)),
        ...markerEvidenceCardIds,
      ]),
    );
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
    const cardHasCompletedFormalExactSpanReview = (
      card: ReportWriterEvidenceCard,
    ) =>
      input.formalExactSpanAccepted === true &&
      card.governanceFlags?.includes("exact_support_span_verified") === true;
    const hasReviewCards = evidenceCards.some(
      (card) =>
        (card.needsReview || card.needsManualReview) &&
        !cardHasCompletedFormalExactSpanReview(card),
    );
    const effectiveGroundingStatus =
      grounded.groundingStatus === "grounded" && hasReviewCards
        ? "partially_grounded"
        : grounded.groundingStatus;
    const effectiveDiagnostics = Array.from(
      new Set([
        ...grounded.diagnostics,
        ...(hasReviewCards ? ["needs_manual_review"] : []),
      ]),
    );
    const pushFinalDiagnostics = (final: {
      groundingStatus: SectionGroundingDiagnostic["groundingStatus"];
      unsupportedSentences: string[];
      diagnostics: string[];
      citationMarkers: string[];
    }) => {
      groundingDiagnostics.push({
        sectionId: candidate.sectionId,
        groundingStatus: final.groundingStatus,
        unsupportedSentences: final.unsupportedSentences,
        diagnostics: final.diagnostics,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationMarkers: final.citationMarkers,
        evidenceCount: evidenceCards.length,
        needsReviewCount: evidenceCards.filter(
          (card) => card.needsReview || card.needsManualReview,
        ).length,
      });
    };
    const writerSemanticContractPassed =
      input.writerClaimEntailmentPassed === true &&
      candidate.sectionId !== "conclusion" &&
      candidate.generationMethod?.startsWith("llm_") === true &&
      Boolean(candidate.paragraphClaims?.length) &&
      candidate.paragraphClaims!.every(
        (paragraph) => paragraph.unsupportedSentences.length === 0,
      ) &&
      evidenceCards.length > 0 &&
      evidenceCards.every(
        (card) =>
          cardHasCompletedFormalExactSpanReview(card) ||
          (!card.needsReview &&
            !card.needsManualReview &&
            card.extractionMethod !== "rule_fallback_claim_extraction" &&
            card.governanceFlags?.includes("exact_support_span_verified") ===
              true),
      );
    if (
      grounded.unsupportedSentences.length > 0 &&
      writerSemanticContractPassed
    ) {
      const preservedProse = normalizeReportSectionProse(candidate.prose);
      pushFinalDiagnostics({
        groundingStatus: "grounded",
        unsupportedSentences: [],
        diagnostics: ["writer_claim_entailment_preserved"],
        citationMarkers: extractMarkers(preservedProse),
      });
      return {
        ...candidate,
        prose: preservedProse,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationIds: evidenceCards.map((card) => card.sourceId),
        coverageStatus: bundle.coverageStatus,
        groundingStatus: "grounded" as const,
        unsupportedSentences: [],
        paragraphClaims: paragraphClaimsForRenderedProse(
          candidate,
          preservedProse,
          evidenceCards,
        ),
        warnings: Array.from(
          new Set([
            ...(candidate.warnings ?? []),
            "writer_claim_entailment_preserved",
          ]),
        ),
      };
    }
    if (
      candidate.sectionId === "conclusion" &&
      grounded.unsupportedSentences.length > 0 &&
      conclusionHasWriterVerifiedSourceClosure(candidate, evidenceCards)
    ) {
      const preservedGroundingStatus: ReportWriterSection["groundingStatus"] =
        hasReviewCards ? "partially_grounded" : "grounded";
      const preservedProse = normalizeReportSectionProse(candidate.prose);
      pushFinalDiagnostics({
        groundingStatus: preservedGroundingStatus,
        unsupportedSentences: [],
        diagnostics: [
          "writer_semantic_alignment_preserved",
          ...(hasReviewCards ? ["needs_manual_review"] : []),
        ],
        citationMarkers: extractMarkers(preservedProse),
      });
      return {
        ...candidate,
        prose: preservedProse,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationIds: evidenceCards.map((card) => card.sourceId),
        coverageStatus: bundle.coverageStatus,
        groundingStatus: preservedGroundingStatus,
        unsupportedSentences: [],
        paragraphClaims: paragraphClaimsForRenderedProse(
          candidate,
          preservedProse,
          evidenceCards,
        ),
        warnings: Array.from(
          new Set([
            ...(candidate.warnings ?? []),
            "writer_semantic_alignment_preserved",
            ...(hasReviewCards ? ["needs_manual_review"] : []),
          ]),
        ),
      };
    }
    if (grounded.unsupportedSentences.length > 0) {
      const unsupported = new Set(grounded.unsupportedSentences);
      const groundedSentences = splitSentences(candidate.prose).filter(
        (sentence) => !unsupported.has(sentence),
      );
      const groundedProse =
        groundedSentences.length > 0
          ? normalizeReportSectionProse(
              groundedSentences.join("\n\n"),
              structuralFallbackParagraphs.length > 0
                ? structuralFallbackParagraphs
                : ["未被來源覆蓋的部分留待後續查證。"],
            )
          : "";
      const remainder = groundedProse
        ? verifyGroundedSection({ body: groundedProse, evidenceCards })
        : null;
      if (
        groundedProse.length >= 40 &&
        remainder?.groundingStatus === "grounded"
      ) {
        const prunedGroundingStatus: ReportWriterSection["groundingStatus"] =
          hasReviewCards ? "partially_grounded" : "grounded";
        pushFinalDiagnostics({
          groundingStatus: prunedGroundingStatus,
          unsupportedSentences: [],
          diagnostics: Array.from(
            new Set([
              ...(remainder.diagnostics ?? []),
              "unsupported_sentences_removed",
              ...(hasReviewCards ? ["needs_manual_review"] : []),
            ]),
          ),
          citationMarkers: remainder.citationMarkers,
        });
        return {
          ...candidate,
          prose: groundedProse,
          evidenceCardIds: effectiveEvidenceCardIds,
          citationIds: evidenceCards.map((card) => card.sourceId),
          coverageStatus: bundle.coverageStatus,
          groundingStatus: prunedGroundingStatus,
          unsupportedSentences: [],
          generationMethod: "grounding_verifier_pruned",
          paragraphClaims: paragraphClaimsForRenderedProse(
            candidate,
            groundedProse,
            evidenceCards,
          ),
          warnings: Array.from(
            new Set([
              ...(candidate.warnings ?? []),
              "unsupported_sentences_removed",
              ...(hasReviewCards ? ["needs_manual_review"] : []),
            ]),
          ),
        };
      }
      pushFinalDiagnostics({
        groundingStatus: effectiveGroundingStatus,
        unsupportedSentences: grounded.unsupportedSentences,
        diagnostics: effectiveDiagnostics,
        citationMarkers: grounded.citationMarkers,
      });
      const blockedProse = normalizeReportSectionProse(
        `本節目前引用支撐不足，系統已暫停正式段落輸出。\n\n後續應優先補查${bundle.missingAspects.join("、") || "可直接支撐正文句子的來源"}。`,
      );
      return {
        ...candidate,
        prose: blockedProse,
        evidenceCardIds: effectiveEvidenceCardIds,
        citationIds: evidenceCards.map((card) => card.sourceId),
        coverageStatus: bundle.coverageStatus,
        groundingStatus: effectiveGroundingStatus,
        unsupportedSentences: grounded.unsupportedSentences,
        generationMethod: "grounding_verifier_blocked",
        paragraphClaims: paragraphClaimsForRenderedProse(
          candidate,
          blockedProse,
          evidenceCards,
        ),
        warnings: Array.from(
          new Set([
            ...(candidate.warnings ?? []),
            "grounding_verification_failed",
            ...(hasReviewCards ? ["needs_manual_review"] : []),
          ]),
        ),
      };
    }
    pushFinalDiagnostics({
      groundingStatus: effectiveGroundingStatus,
      unsupportedSentences: grounded.unsupportedSentences,
      diagnostics: effectiveDiagnostics,
      citationMarkers: grounded.citationMarkers,
    });
    const normalizedProse = normalizeReportSectionProse(
      candidate.prose,
      structuralFallbackParagraphs.length > 0
        ? structuralFallbackParagraphs
        : ["未被來源覆蓋的部分留待後續查證。"],
    );
    return {
      ...candidate,
      prose: normalizedProse,
      evidenceCardIds: effectiveEvidenceCardIds,
      citationIds: evidenceCards.map((card) => card.sourceId),
      coverageStatus: bundle.coverageStatus,
      groundingStatus: effectiveGroundingStatus,
      unsupportedSentences: grounded.unsupportedSentences,
      generationMethod: candidate.generationMethod ?? "bundle_grounded_section",
      paragraphClaims: paragraphClaimsForRenderedProse(
        candidate,
        normalizedProse,
        evidenceCards,
      ),
      warnings: Array.from(
        new Set([...(candidate.warnings ?? []), ...effectiveDiagnostics]),
      ),
    };
  });
  enforceConclusionSourceClosure({
    sections,
    rawSections: input.sections,
    bundles: input.bundles,
    groundingDiagnostics,
    reportPlan: input.reportPlan,
    writerClaimEntailmentPassed: input.writerClaimEntailmentPassed,
  });
  return { sections, groundingDiagnostics };
}

export function createReportDraftsRouter({
  reportWriter = writeReportWithLlm,
}: ReportDraftRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/report-evidence-sets", (req, res) => {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const topic = cleanString(body.topic);
    if (!topic) {
      res.status(400).json({ ok: false, message: "topic is required" });
      return;
    }
    const workflowId =
      cleanString(body.workflowId) ?? `evidence-set-${randomUUID()}`;
    const hash = cleanString(body.topicHash) ?? topicHash(topic);
    const acceptedSourceReview = normalizeAcceptedSources(
      body.acceptedSources,
      workflowId,
      hash,
      topic,
      body.topicIntegrityContract,
      body.researchReportMode === "formal_research_report" ||
        body.topicIntegrityContract != null,
    );
    const acceptedSources = acceptedSourceReview.sources;
    if (acceptedSources.length === 0) {
      res
        .status(400)
        .json({ ok: false, message: "acceptedSources is required" });
      return;
    }
    const relevanceBridge: EvidenceRelevanceBridge = {
      aliases: [...stringList(body.aliases), ...stringList(body.topicAliases)],
      matchedConcepts: stringList(body.matchedConcepts),
    };
    const normalized = normalizeEvidenceCards(
      body.evidenceCards,
      acceptedSources,
      workflowId,
      hash,
      topic,
      relevanceBridge,
    );
    const derived = deriveEvidenceCardsFromAcceptedSources({
      sources: acceptedSources,
      existingCards: normalized.cards,
      workflowId,
      hash,
      topic,
      relevanceBridge,
    });
    const evidenceCards = [...normalized.cards, ...derived.cards];
    const rejectedEvidence = [...normalized.rejected, ...derived.rejected];
    const writerEvidenceSet = buildWriterEvidenceSet({
      runId: workflowId,
      eligibleCards: evidenceCards,
      rejectedEvidence,
    });
    res.json({
      ok: true,
      writerEvidenceSet,
      evidenceCards,
      filteredEvidence: writerEvidenceSet.rejectedEvidenceCards,
      filteredCount: writerEvidenceSet.rejectedEvidenceCards.length,
      acceptedSourceCount: acceptedSources.length,
      rejectedSourceCount: acceptedSourceReview.rejectedSources.length,
      directFindingSourceCount: acceptedSources.filter(
        (source) => source.formalEvidenceRole === "DIRECT_FINDING",
      ).length,
      topicIntegrityContract: acceptedSourceReview.contract,
      sourceRejectionAudit: acceptedSourceReview.rejectedSources,
      eligibleEvidenceCardCount: evidenceCards.length,
      diagnostics: [
        `evidence_set_hash:${writerEvidenceSet.evidenceSetHash}`,
        `eligible:${evidenceCards.length}`,
        `filtered:${writerEvidenceSet.rejectedEvidenceCards.length}`,
      ],
    });
  });

  router.post("/report-drafts", async (req, res) => {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const topic = cleanString(body.topic);
    if (!topic) {
      res.status(400).json({ ok: false, message: "topic is required" });
      return;
    }
    const workflowId = cleanString(body.workflowId) ?? `draft-${randomUUID()}`;
    const hash = cleanString(body.topicHash) ?? topicHash(topic);
    const acceptedSourceReview = normalizeAcceptedSources(
      body.acceptedSources,
      workflowId,
      hash,
      topic,
      body.topicIntegrityContract,
      body.researchReportMode === "formal_research_report" ||
        body.topicIntegrityContract != null,
    );
    const acceptedSources = acceptedSourceReview.sources;
    if (acceptedSources.length === 0) {
      res
        .status(400)
        .json({ ok: false, message: "acceptedSources is required" });
      return;
    }
    const relevanceBridge: EvidenceRelevanceBridge = {
      aliases: [...stringList(body.aliases), ...stringList(body.topicAliases)],
      matchedConcepts: stringList(body.matchedConcepts),
    };
    const evidenceNormalization = normalizeEvidenceCards(
      body.evidenceCards,
      acceptedSources,
      workflowId,
      hash,
      topic,
      relevanceBridge,
    );
    const serverDerivedEvidence = deriveEvidenceCardsFromAcceptedSources({
      sources: acceptedSources,
      existingCards: evidenceNormalization.cards,
      workflowId,
      hash,
      topic,
      relevanceBridge,
    });
    const serverDerivedEvidenceCards = serverDerivedEvidence.cards;
    const evidenceCards = [
      ...evidenceNormalization.cards,
      ...serverDerivedEvidenceCards,
    ];
    const allRejectedEvidence = [
      ...evidenceNormalization.rejected,
      ...serverDerivedEvidence.rejected,
    ];
    const indeterminateEvidence = allRejectedEvidence.filter(
      (item) => item.decision === "indeterminate" && item.traceable,
    );
    let writerEvidenceSet: WriterEvidenceSet | null = null;
    if (
      body.writerEvidenceSet !== undefined &&
      body.writerEvidenceSet !== null
    ) {
      const parsedEvidenceSet = WriterEvidenceSetSchema.safeParse(
        body.writerEvidenceSet,
      );
      if (!parsedEvidenceSet.success) {
        res.status(400).json({
          ok: false,
          status: "invalid_input",
          code: "INVALID_WRITER_EVIDENCE_SET",
          readinessStatus: "invalid_evidence_set",
          details: parsedEvidenceSet.error.flatten(),
        });
        return;
      }
      const recomputedEvidenceSet = buildWriterEvidenceSet({
        runId: workflowId,
        eligibleCards: evidenceCards,
        rejectedEvidence: allRejectedEvidence,
      });
      if (
        !writerEvidenceSetsEqual(parsedEvidenceSet.data, recomputedEvidenceSet)
      ) {
        res.status(409).json({
          ok: false,
          status: "invalid_input",
          code: "EVIDENCE_SET_REPLAN_REQUIRED",
          message:
            "Evidence cards changed after planning; rebuild the canonical evidence set and ReportPlan.",
          planBuildStatus: "plan_invalidated",
          readinessStatus: "invalid_evidence_set",
          submittedEvidenceSetHash: parsedEvidenceSet.data.evidenceSetHash,
          canonicalEvidenceSetHash: recomputedEvidenceSet.evidenceSetHash,
          filteredEvidence: recomputedEvidenceSet.rejectedEvidenceCards,
        });
        return;
      }
      writerEvidenceSet = recomputedEvidenceSet;
    }
    let reportPlanResult: SanitizedReportPlanResult | null = null;
    let readinessStatus: ReportReadinessStatus | null = null;
    if (
      writerEvidenceSet &&
      (body.reportPlan === undefined || body.reportPlan === null)
    ) {
      res.status(409).json({
        ok: false,
        status: "invalid_input",
        code: "REPORT_PLAN_REBUILD_REQUIRED",
        message:
          "A canonical WriterEvidenceSet requires a ReportPlan built from the same evidenceSetHash.",
        planBuildStatus: "plan_invalidated",
        readinessStatus: "invalid_evidence_set",
      });
      return;
    }
    if (body.reportPlan !== undefined && body.reportPlan !== null) {
      const parsedReportPlan = ReportPlanSchema.safeParse(body.reportPlan);
      if (!parsedReportPlan.success) {
        res.status(400).json({
          ok: false,
          status: "invalid_input",
          code: "INVALID_REPORT_PLAN",
          message: "reportPlan failed schema validation",
          details: parsedReportPlan.error.flatten(),
        });
        return;
      }
      if (
        parsedReportPlan.data.workflowId !== workflowId ||
        parsedReportPlan.data.topicHash !== hash
      ) {
        res.status(400).json({
          ok: false,
          status: "invalid_input",
          code: "REPORT_PLAN_CONTEXT_MISMATCH",
          message:
            "reportPlan workflowId/topicHash does not match this report request",
        });
        return;
      }
      if (writerEvidenceSet) {
        const diagnostics = canonicalPlanDiagnostics({
          plan: parsedReportPlan.data,
          evidenceCards,
          writerEvidenceSet,
        });
        readinessStatus = canonicalReadinessForPlan({
          plan: parsedReportPlan.data,
          evidenceCards,
          writerEvidenceSet,
        });
        if (diagnostics.length > 0) {
          res.status(409).json({
            ok: false,
            status: "invalid_input",
            code: "REPORT_PLAN_REBUILD_REQUIRED",
            message:
              "ReportPlan bindings or readiness no longer match the canonical WriterEvidenceSet.",
            planBuildStatus: "plan_invalidated",
            readinessStatus: "invalid_evidence_set",
            evidenceSetHash: writerEvidenceSet.evidenceSetHash,
            reportPlanDiagnostics: diagnostics,
          });
          return;
        }
        reportPlanResult = {
          plan: parsedReportPlan.data,
          status: "complete",
          diagnostics: [],
        };
      } else {
        reportPlanResult = sanitizeReportPlanForAcceptedEvidence({
          plan: parsedReportPlan.data,
          evidenceCards,
        });
      }
      if (reportPlanResult.plan.plannedClaims.length === 0) {
        res.status(400).json({
          ok: false,
          status: "invalid_input",
          code: "REPORT_PLAN_HAS_NO_LEGAL_CLAIMS",
          message: "reportPlan has no claim bindings to accepted evidence",
          reportPlanStatus: reportPlanResult.status,
          reportPlanDiagnostics: reportPlanResult.diagnostics,
        });
        return;
      }
    }
    const reportPlanEvidenceIds = new Set(
      reportPlanResult?.plan.plannedClaims.flatMap(
        (claim) => claim.supportingEvidenceIds,
      ) ?? [],
    );
    const reportEvidenceCards = writerEvidenceSet
      ? evidenceCards
      : reportPlanResult
        ? evidenceCards.filter((card) =>
            reportPlanEvidenceIds.has(evidenceIdentityForPlan(card)),
          )
        : evidenceCards;
    if (
      writerEvidenceSet &&
      readinessStatus &&
      !["ready_complete_report", "ready_limited_report"].includes(
        readinessStatus,
      )
    ) {
      res.status(readinessStatus === "needs_targeted_search" ? 409 : 422).json({
        ok: false,
        status: "insufficient_sources",
        code:
          readinessStatus === "needs_targeted_search"
            ? "TARGETED_RETRIEVAL_REQUIRED"
            : "INSUFFICIENT_CANONICAL_EVIDENCE",
        planBuildStatus: "plan_built",
        readinessStatus,
        writerEvidenceSet,
        evidenceSetHash: writerEvidenceSet.evidenceSetHash,
      });
      return;
    }
    const researchReportMode: ResearchReportMode =
      body.researchReportMode === "formal_research_report" ||
      body.reportMode === "formal_research_report"
        ? "formal_research_report"
        : "evidence_brief";
    const citationDisplayMode: CitationDisplayMode =
      body.citationDisplayMode === "academic" ? "academic" : "compact";
    let canonicalStudyAdmissions: CanonicalStudyAdmissionResult[] | undefined;
    if (body.canonicalStudyAdmissions !== undefined) {
      const parsedCanonicalAdmissions =
        CanonicalStudyAdmissionResultSchema.array().safeParse(
          body.canonicalStudyAdmissions,
        );
      if (!parsedCanonicalAdmissions.success) {
        res.status(400).json({
          ok: false,
          status: "invalid_input",
          code: "INVALID_CANONICAL_STUDY_ADMISSION",
          message: "canonicalStudyAdmissions failed schema validation",
          details: parsedCanonicalAdmissions.error.flatten(),
        });
        return;
      }
      canonicalStudyAdmissions = parsedCanonicalAdmissions.data;
    }
    const canonicalJobRevision =
      typeof body.jobRevision === "number" &&
      Number.isInteger(body.jobRevision) &&
      body.jobRevision >= 0
        ? body.jobRevision
        : undefined;
    const canonicalCheckpointRevision =
      typeof body.canonicalCheckpointRevision === "number" &&
      Number.isInteger(body.canonicalCheckpointRevision) &&
      body.canonicalCheckpointRevision >= 0
        ? body.canonicalCheckpointRevision
        : undefined;
    const legacyOutline =
      writerEvidenceSet && reportPlanResult
        ? reportPlanResult.plan.sections
            .filter((section) => section.canonicalSectionRole !== "references")
            .map((section) => ({
              sectionId: section.sectionId,
              title: section.title,
            }))
        : normalizeOutline(body.outline);
    let outline =
      researchReportMode === "formal_research_report"
        ? FORMAL_RESEARCH_REPORT_SCHEMA.filter((section) =>
            [
              "executive_summary",
              "background",
              "methods",
              "evidence_overview",
              "findings",
              "cross_study_synthesis",
              "discussion",
              "limitations_gaps",
              "conclusion",
            ].includes(section.sectionId),
          ).map((section) => ({
            sectionId: section.sectionId,
            title: section.title,
          }))
        : legacyOutline;
    let sectionEvidenceBundles = buildSectionEvidenceBundles({
      outline,
      cards: reportEvidenceCards,
      reportPlan: reportPlanResult?.plan,
    });
    const sourceMixProfile = resolveSourceMixProfile({
      sourceMixProfile: cleanString(body.sourceMixProfile),
      reportType: cleanString(body.reportType),
      audience: cleanString(body.audience),
      topic,
    });
    const reportMode = normalizeReportMode(
      body.reportMode,
      acceptedSources.length,
    );
    const formalResearchArchitecture =
      researchReportMode === "formal_research_report"
        ? buildFormalResearchArchitecture({
            sources: acceptedSources,
            evidenceCards: reportEvidenceCards,
            canonicalStudyAdmissions,
            canonicalContext:
              cleanString(body.jobId) && canonicalJobRevision !== undefined
                ? {
                    jobId: cleanString(body.jobId)!,
                    jobRevision: canonicalJobRevision,
                    checkpointRevision: canonicalCheckpointRevision,
                  }
                : undefined,
            workflow: {
              workflowId,
              reportId: cleanString(body.reportId) ?? workflowId,
              topicHash: hash,
              normalizedTopic: topic,
              searchPlanWorkflowId: reportPlanResult?.plan.workflowId ?? workflowId,
              queryTerms: Array.from(new Set(acceptedSources.flatMap((source) =>
                Array.isArray(source.matchedCoreConcepts) ? source.matchedCoreConcepts : []
              ))),
              language: cleanString(body.outputLanguage) ?? "zh-TW",
              researchQuestion:
                cleanString(body.researchQuestion) ?? topic,
              requestedMethod: normalizeResearchMethod(body.researchMethod),
              namedProviders: Array.from(
                new Set(
                  acceptedSources
                    .map((source) => source.provider)
                    .filter((provider): provider is string => Boolean(provider)),
                ),
              ),
              reproducibleSearchStrategy: acceptedSources.some((source) =>
                Boolean(source.queryUsed),
              ),
              explicitInclusionCriteria: Array.isArray(body.inclusionCriteria),
              explicitExclusionCriteria: Array.isArray(body.exclusionCriteria),
              screeningProcedure: Boolean(writerEvidenceSet),
              duplicateRemoval: true,
              documentedStudySelection: Boolean(writerEvidenceSet),
              qualityAssessment: Boolean(body.qualityAssessmentCompleted),
              queryExpansion: acceptedSources.some((source) =>
                Boolean(source.queryPlanHash),
              ),
              themeSynthesis: true,
              searchQueries: Array.from(
                new Set(
                  acceptedSources
                    .map((source) => source.queryUsed)
                    .filter((query): query is string => Boolean(query)),
                ),
              ),
              searchDates: Array.from(
                new Set(
                  acceptedSources
                    .flatMap((source) => [source.retrievedAt, source.accessedAt])
                    .filter((value): value is string => Boolean(value))
                    .map((value) => value.slice(0, 10)),
                ),
              ),
              searchLanguages: Array.from(
                new Set(
                  acceptedSources
                    .map((source) => source.queryUsed)
                    .filter((query): query is string => Boolean(query))
                    .flatMap((query) => [
                      /[\u3400-\u9fff]/u.test(query) ? "繁體中文查詢" : null,
                      /[A-Za-z]/u.test(query) ? "英文查詢" : null,
                    ])
                    .filter((value): value is string => Boolean(value)),
                ),
              ),
              fullTextRetrievalMethods: Array.from(
                new Set(
                  acceptedSources
                    .filter((source) => source.accessLevel === "full_text" || Boolean(source.fullTextUrl))
                    .map((source) => source.extractionMethod ?? "保存的全文連結"),
                ),
              ),
              evidenceExtractionMethods: Array.from(
                new Set(
                  reportEvidenceCards
                    .map((card) => card.extractionMethod)
                    .filter((value): value is string => Boolean(value)),
                ),
              ),
              relevanceQualityAssessmentMethods: [
                `${TOPIC_INTEGRITY_VERSION}/${RELEVANCE_POLICY_VERSION}`,
                acceptedSources.some((source) => source.sourceQualityScore != null)
                  ? "來源品質分數與理由"
                  : "未保存來源品質分數",
              ],
              inclusionCriteria: Array.isArray(body.inclusionCriteria)
                ? body.inclusionCriteria.filter((item): item is string => typeof item === "string")
                : [],
              exclusionCriteria: Array.isArray(body.exclusionCriteria)
                ? body.exclusionCriteria.filter((item): item is string => typeof item === "string")
                : [],
              topicIntegrityPolicy: `${TOPIC_INTEGRITY_VERSION}/${RELEVANCE_POLICY_VERSION}`,
            },
          })
        : undefined;
    if (
      formalResearchArchitecture &&
      !formalResearchArchitecture.canonicalAdmissionValidation.pass
    ) {
      res.status(409).json({
        ok: false,
        status: "invalid_input",
        code: "CANONICAL_ADMISSION_REPLAN_REQUIRED",
        message:
          "Canonical study admission is missing, stale, or bound to another evidence revision.",
        issues: formalResearchArchitecture.canonicalAdmissionValidation.issues,
        formalResearchArchitecture,
      });
      return;
    }
    if (
      formalResearchArchitecture &&
      formalResearchArchitecture.writerAdmissionProjection.some(
        (item) => item.admissionClass === "BLOCKED",
      ) &&
      formalResearchArchitecture.writerAdmissionProjection.some(
        (item) => item.admissionClass !== "BLOCKED",
      )
    ) {
      res.status(409).json({
        ok: false,
        status: "invalid_input",
        code: "CANONICAL_ADMISSION_REPLAN_REQUIRED",
        message:
          "ReportPlan contains a mixed canonical admission set. Rebuild it from the admitted evidence revision before invoking Writer.",
        writerInvoked: false,
        formalResearchArchitecture,
      });
      return;
    }
    if (
      formalResearchArchitecture &&
      (formalResearchArchitecture.writerAdmissionProjection.every(
        (item) => item.admissionClass === "BLOCKED",
      ) ||
        formalResearchArchitecture.evidenceCoverage
            .limitedOrBetterAdmissionCount ===
          0)
    ) {
      res.status(422).json({
        ok: false,
        status: "insufficient_sources",
        code: "NO_CANONICAL_WRITER_ADMISSION",
        message:
          "No study at the current evidence revision passed canonical Writer admission.",
        writerInvoked: false,
        formalResearchArchitecture,
      });
      return;
    }
    if (formalResearchArchitecture) {
      outline = formalResearchArchitecture.researchBlueprint.sectionPlan.map(
        (section) => ({ sectionId: section.id, title: section.title }),
      );
      sectionEvidenceBundles = buildFormalSectionEvidenceBundles({
        outline,
        cards: reportEvidenceCards,
        architecture: formalResearchArchitecture,
      });
    }
    const input: ReportWriterInput = {
      workflowId,
      jobId: cleanString(body.jobId) ?? workflowId,
      topicHash: hash,
      topic,
      originalTopic: cleanString(body.originalTopic),
      displayTitle: cleanString(body.displayTitle) ?? topic,
      reportMode,
      researchReportMode,
      citationDisplayMode,
      formalResearchArchitecture,
      reportType: cleanString(body.reportType),
      audience: cleanString(body.audience),
      language: cleanString(body.language) ?? "繁體中文",
      locale: cleanString(body.locale) ?? "zh-TW",
      writingStyle: cleanString(body.writingStyle),
      requestedLength: cleanString(body.requestedLength),
      targetWordCount: cleanString(body.targetWordCount),
      specifiedStructure: cleanString(body.specifiedStructure),
      rubric: cleanString(body.rubric),
      generationMode:
        reportEvidenceCards.length >= 3 ? "formal" : "preliminary",
      sourceMixProfile,
      acceptedSources,
      acceptedSourceIds: acceptedSources.map((source) => source.id),
      evidenceCards: reportEvidenceCards,
      evidenceCardIds: reportEvidenceCards.map((card) => card.id),
      centralAnswerClaimIds: cleanStringArray(body.centralAnswerClaimIds),
      requestedSectionIds: outline.map((section) => section.sectionId),
      reportPlan: reportPlanResult?.plan,
      reportPlanStatus: writerEvidenceSet
        ? "plan_built"
        : (reportPlanResult?.status ?? "degraded_legacy"),
      reportPlanDiagnostics: reportPlanResult?.diagnostics ?? [
        "legacy_report_plan_missing",
      ],
      writerEvidenceSet: writerEvidenceSet ?? undefined,
      evidenceSetHash: writerEvidenceSet?.evidenceSetHash,
      readinessStatus: readinessStatus ?? undefined,
    };

    let writerResult: ReportWriterResult;
    try {
      writerResult = await reportWriter(input);
    } catch (error) {
      writerResult = failedWriterResult(error);
    }
    const writerFallbackSectionCount =
      writerResult.writerDiagnostics?.fallbackSections ?? 0;
    const sectionFallbackUsed = writerFallbackSectionCount > 0;
    const generationMode: ReportDraftGenerationMode =
      writerResult.ok &&
      !writerResult.fallbackUsed &&
      writerResult.sections.length > 0
        ? sectionFallbackUsed
          ? "hybrid_evidence_grounded"
          : "llm_evidence_grounded"
        : "fallback_conservative_draft";
    const fallback = buildFallbackSections({
      topic,
      outline,
      bundles: sectionEvidenceBundles,
      reportPlan: reportPlanResult?.plan,
      formalResearchArchitecture,
    });
    const usingWriterSections =
      generationMode !== "fallback_conservative_draft" &&
      writerResult.sections.length > 0;
    const rawSections = usingWriterSections
      ? writerResult.sections
      : fallback.sections;
    const enforced = enforceSectionBundles({
      sections: rawSections,
      outline,
      bundles: sectionEvidenceBundles,
      fallbackSections: fallback.sections,
      reportPlan: reportPlanResult?.plan,
      writerClaimEntailmentPassed:
        writerResult.ok === true &&
        writerResult.writerDiagnostics?.postEditValidation?.status === "pass",
      formalExactSpanAccepted:
        researchReportMode === "formal_research_report",
    });
    const formalSectionRepair = formalResearchArchitecture
      ? repairFormalSectionsDeterministically({
          sections: enforced.sections,
          architecture: formalResearchArchitecture,
        })
      : { sections: enforced.sections, repairs: [] };
    const sections = formalSectionRepair.sections;
    const formalResearchValidation = formalResearchArchitecture
      ? (() => {
          const spans = formalResearchArchitecture.studies.flatMap((study) => study.evidenceSpans);
          const duplicates = validateCrossSectionDuplicates(
            sections,
            0.86,
            formalResearchArchitecture.sectionClaimAllocations,
          );
          const quantitative = validateQuantitativeProvenance({
            sections,
            numericEvidence: formalResearchArchitecture.numericEvidence,
            spans,
          });
          const quantitativeIntegration = validateQuantitativeFindingIntegration({
            sections,
            findings: formalResearchArchitecture.quantitativeFindings,
          });
          const synthesis = validateAnalyticalSynthesis({
            sections,
            matrix: formalResearchArchitecture.evidenceMatrix,
          });
          const chartProvenance = validateChartProvenance({
            visualizationPlan: formalResearchArchitecture.visualizationPlan,
            quantitativeFactRegistry:
              formalResearchArchitecture.quantitativeFactRegistry,
          });
          const blueprint = validateResearchBlueprint(
            formalResearchArchitecture.researchBlueprint,
          );
          const pipelineLeakage = validatePipelineLeakage(sections);
          const sourceDominance = validateSourceDominance(sections);
          const semanticDensity = validateSemanticDensity(sections);
          const researchQuestionClosure = validateResearchQuestionClosure({
            sections,
            matrix:
              formalResearchArchitecture.researchQuestionClosureMatrix,
          });
          const figureNarrativeBinding = validateFigureNarrativeBinding({
            sections,
            figurePlan: formalResearchArchitecture.figurePlan,
            quantitativeFacts:
              formalResearchArchitecture.quantitativeFactRegistry,
          });
          const topicIsolation = formalResearchArchitecture.topicIsolation;
          const quantitativeExtractionGap = {
            pass: formalResearchArchitecture.diagnostics.quantitativeExtractionGaps.length === 0,
            code: formalResearchArchitecture.diagnostics.quantitativeExtractionGaps.length === 0
              ? "PASS" as const
              : "QUANTITATIVE_EXTRACTION_GAP" as const,
            issues: formalResearchArchitecture.diagnostics.quantitativeExtractionGaps,
          };
          const falseInsufficient = {
            pass: !(
              formalResearchArchitecture.directEvidenceReconciliation.falseInsufficient &&
              formalResearchArchitecture.evidenceMatrix.length === 0
            ),
            code:
              formalResearchArchitecture.directEvidenceReconciliation.falseInsufficient &&
              formalResearchArchitecture.evidenceMatrix.length === 0
                ? "BLOCK_EXPORT_FALSE_INSUFFICIENT" as const
                : "PASS" as const,
            reconciliation: formalResearchArchitecture.directEvidenceReconciliation,
          };
          return {
            blueprintValidation: blueprint,
            duplicateValidation: duplicates,
            quantitativeValidation: quantitative,
            quantitativeIntegrationValidation: quantitativeIntegration,
            synthesisValidation: synthesis,
            chartProvenanceValidation: chartProvenance,
            pipelineLeakageValidation: pipelineLeakage,
            sourceDominanceValidation: sourceDominance,
            semanticDensityValidation: semanticDensity,
            researchQuestionClosureValidation: researchQuestionClosure,
            figureNarrativeBindingValidation: figureNarrativeBinding,
            topicIsolationValidation: topicIsolation,
            quantitativeExtractionGapValidation: quantitativeExtractionGap,
            falseInsufficientValidation: falseInsufficient,
            pass:
              blueprint.pass &&
              duplicates.strictDuplicates.length === 0 &&
              duplicates.semanticDuplicates.length === 0 &&
              quantitative.pass &&
              quantitativeIntegration.pass &&
              synthesis.pass &&
              chartProvenance.pass &&
              pipelineLeakage.pass &&
              sourceDominance.pass &&
              semanticDensity.pass &&
              researchQuestionClosure.pass &&
              figureNarrativeBinding.pass &&
              topicIsolation.pass &&
              quantitativeExtractionGap.pass &&
              falseInsufficient.pass,
          };
        })()
      : null;
    const claims = usingWriterSections
      ? claimsFromSections(sections)
      : fallback.claims;
    const citations = citationsForCards(reportEvidenceCards, acceptedSources);
    const missingEvidence = [
      ...missingEvidenceFromWriter(
        writerResult.sectionPlan,
        sections,
        reportEvidenceCards,
      ),
      ...(generationMode === "fallback_conservative_draft"
        ? fallback.missingEvidence
        : []),
    ];
    const warnings = [
      writerResult.warning,
      writerResult.fallbackReason,
      reportEvidenceCards.length === 0 && indeterminateEvidence.length === 0
        ? "No valid evidence cards after schema, boilerplate, and topic relevance gates."
        : null,
      reportEvidenceCards.length === 0 && indeterminateEvidence.length > 0
        ? `${indeterminateEvidence.length} traceable cross-language evidence cards remain indeterminate; canonical evidence is not definitively empty.`
        : null,
      serverDerivedEvidenceCards.length > 0
        ? `${serverDerivedEvidenceCards.length} evidence cards were server-derived from accepted source support spans and require review.`
        : null,
      sectionFallbackUsed
        ? `${writerFallbackSectionCount} 個章節未採用模型段落，已改用可追溯的保守草稿。`
        : null,
      generationMode === "fallback_conservative_draft"
        ? "LLM unavailable or incomplete; returned fallback_conservative_draft with explicit missingEvidence."
        : null,
      ...(reportPlanResult?.diagnostics ?? ["legacy_report_plan_missing"]),
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
      (bundle) =>
        !bundle.canGenerate || bundle.coverageStatus === "insufficient",
    );
    const reviewCards = reportEvidenceCards.filter(
      (card) =>
        card.needsReview &&
        !(
          researchReportMode === "formal_research_report" &&
          card.governanceFlags?.includes("exact_support_span_verified") === true
        ),
    );
    const definitivelyRejectedEvidence = allRejectedEvidence.filter(
      (item) => item.decision !== "indeterminate",
    );
    const canonicalEvidenceStatus:
      | "complete"
      | "partial"
      | "indeterminate"
      | "empty" =
      reportEvidenceCards.length > 0
        ? reviewCards.length > 0 || allRejectedEvidence.length > 0
          ? "partial"
          : "complete"
        : indeterminateEvidence.length > 0
          ? "indeterminate"
          : "empty";
    const degradedMode =
      generationMode === "fallback_conservative_draft" ||
      sectionFallbackUsed ||
      reviewCards.length > 0 ||
      blockedSections.length > 0 ||
      partialSections.length > 0 ||
      insufficientBundles.length > 0 ||
      !reportPlanResult ||
      reportPlanResult.status !== "complete" ||
      (!writerEvidenceSet && allRejectedEvidence.length > 0);
    const fallbackReasons = [
      writerResult.fallbackReason,
      generationMode === "fallback_conservative_draft"
        ? "fallback_conservative_draft"
        : null,
      sectionFallbackUsed
        ? `writer_section_fallback:${writerFallbackSectionCount}`
        : null,
      ...blockedSections.map(
        (section) => `${section.sectionId}:grounding_verifier_blocked`,
      ),
      ...partialSections.map(
        (section) => `${section.sectionId}:partially_grounded`,
      ),
      ...insufficientBundles.map(
        (bundle) => `${bundle.sectionId}:insufficient_evidence_bundle`,
      ),
      !writerEvidenceSet && allRejectedEvidence.length > 0
        ? `${allRejectedEvidence.length}:rejected_or_indeterminate_evidence_cards`
        : null,
      !reportPlanResult
        ? "legacy_report_plan_missing"
        : reportPlanResult.status !== "complete"
          ? `report_plan_${reportPlanResult.status}`
          : null,
      ...reviewCards
        .filter(
          (card) => card.extractionMethod === "rule_fallback_claim_extraction",
        )
        .map((card) => `${card.id}:rule_fallback_claim_extraction`),
    ].filter((item): item is string => Boolean(item));
    const fallbackUsed =
      generationMode === "fallback_conservative_draft" || sectionFallbackUsed;
    const fallbackReason = fallbackUsed
      ? fallbackReasons.join(" | ") || warnings.join(" | ") || "fallback_used"
      : null;
    const writerFailureCategories = Array.from(
      new Set(
        (writerResult.writerDiagnostics?.writerAttempts ?? [])
          .filter((attempt) => attempt.status === "failed")
          .map((attempt) => attempt.failureCategory)
          .filter((category): category is NonNullable<typeof category> => Boolean(category)),
      ),
    );
    const directFindingSourceCount = acceptedSources.filter(
      (source) => source.formalEvidenceRole === "DIRECT_FINDING",
    ).length;
    const topicIntegrityHash = createHash("sha256")
      .update(JSON.stringify(acceptedSourceReview.contract))
      .digest("hex");
    const contentIntegrityValidated =
      directFindingSourceCount >= 2 &&
      formalResearchArchitecture?.topicIsolation.pass !== false &&
      (formalResearchArchitecture?.diagnostics.quantitativeExtractionGaps.length ?? 0) === 0 &&
      acceptedSources.every(
        (source) =>
          source.formalEvidenceRole !== "REJECTED_OFF_TOPIC" &&
          source.topicIntegrityAssessment?.hardExclusion.excluded !== true,
      ) &&
      reportEvidenceCards.every(
        (card) => card.formalEvidenceRole !== "REJECTED_OFF_TOPIC",
      );
    const formalResearchCheckpoint = formalResearchArchitecture
      ? {
          schemaVersion: "formal-research-checkpoint.v2",
          workflowId,
          topicHash: hash,
          topicIntegrityVersion: TOPIC_INTEGRITY_VERSION,
          topicIntegrityHash,
          relevancePolicyVersion: RELEVANCE_POLICY_VERSION,
          evidenceSetHash: writerEvidenceSet?.evidenceSetHash ?? null,
          acceptedSourceIds: acceptedSources.map((source) => source.id),
          acceptedSourceCount: acceptedSources.length,
          rejectedSourceCount: acceptedSourceReview.rejectedSources.length,
          directFindingSourceCount,
          contentIntegrityValidated,
          topicIntegrityValidatedAt: acceptedSourceReview.validatedAt,
          evidenceIds: formalResearchArchitecture.studies.flatMap((study) =>
            study.evidenceSpans.map((span) => span.spanId),
          ),
          completedStages: [
            "source_normalization",
            "source_relevance_review",
            "topic_integrity_validation",
            "accepted_source_processing",
            "structured_study_extraction",
            "research_blueprint",
            "methodology_classification",
            "report_structure_planning",
            "evidence_matrix",
            "section_claim_allocation",
            "quantitative_findings",
            "figure_planning",
          ],
          resumeFrom:
            !contentIntegrityValidated
              ? "source_relevance_review"
              : writerResult.reportGenerationStatus === "success" && !fallbackUsed
              ? formalResearchValidation?.pass
                ? "export"
                : "validation"
              : "writer_generation",
          safeToResume: contentIntegrityValidated,
          providerFailureCategories: writerFailureCategories,
          invalidatedBy: [
            "topic_hash_change",
            "accepted_source_set_change",
            "evidence_set_hash_change",
            "topic_integrity_hash_change",
            "relevance_policy_version_change",
            "formal_research_schema_version_change",
          ],
        }
      : null;
    const writerFailureReasons =
      writerResult.writerDiagnostics?.failureReasons ?? {};
    const sectionDegradationDiagnostics = [
      ...Object.entries(writerFailureReasons).map(([sectionId, detail]) => ({
        sectionId,
        reason: formalSectionDegradationReason(detail),
        detail,
        stage: "writer_generation" as const,
      })),
      ...blockedSections
        .filter((section) => !(section.sectionId in writerFailureReasons))
        .map((section) => ({
          sectionId: section.sectionId,
          reason: "INSUFFICIENT_EVIDENCE" as const,
          detail:
            section.warnings?.join(" | ") ?? "grounding_verifier_blocked",
          stage: "grounding_verification" as const,
        })),
      ...formalSectionRepair.repairs.map((repair) => ({
        sectionId: repair.sectionId,
        reason: repair.reason,
        detail: repair.repair,
        stage: "deterministic_formal_repair" as const,
      })),
    ];

    res.json({
      ok: true,
      status: writerResult.status,
      llm_status: writerResult.llm_status,
      fallback_used: fallbackUsed,
      message: writerResult.message,
      warning: warnings.join(" | ") || null,
      draft: sections
        .map((section) => `${section.title}\n${section.prose}`)
        .join("\n\n"),
      sections,
      sectionPlan: writerResult.sectionPlan ?? [],
      writerDiagnostics: writerResult.writerDiagnostics ?? null,
      claims,
      citations,
      missingEvidence,
      normalizedTopic: {
        original: topic,
        topicHash: hash,
      },
      topicIntegrityContract: acceptedSourceReview.contract,
      topicIntegrityReport: {
        schemaVersion: TOPIC_INTEGRITY_VERSION,
        policyVersion: RELEVANCE_POLICY_VERSION,
        topicIntegrityHash,
        contentIntegrityValidated,
        acceptedSourceCount: acceptedSources.length,
        rejectedSourceCount: acceptedSourceReview.rejectedSources.length,
        directFindingSourceCount,
        validatedAt: acceptedSourceReview.validatedAt,
      },
      sourceRejectionAudit: acceptedSourceReview.rejectedSources,
      sourceCountSummary: {
        accepted: acceptedSources.length,
      },
      chunkCountSummary: {
        rejectedEvidenceCardCount: allRejectedEvidence.filter(
          (item) => item.decision !== "indeterminate",
        ).length,
        indeterminateEvidenceCardCount: indeterminateEvidence.length,
      },
      rejectedChunks: allRejectedEvidence,
      rejectedChunkCount: allRejectedEvidence.filter(
        (item) => item.decision !== "indeterminate",
      ).length,
      indeterminateEvidence,
      canonicalEvidenceStatus,
      canonicalEvidenceDiagnostics: {
        status: canonicalEvidenceStatus,
        acceptedCardCount: reportEvidenceCards.length,
        reviewedCardCount: reportEvidenceCards.length - reviewCards.length,
        needsReviewCardCount: reviewCards.length,
        indeterminateCardCount: indeterminateEvidence.length,
        rejectedCardCount: definitivelyRejectedEvidence.length,
        traceableIndeterminateSourceIds: Array.from(
          new Set(
            indeterminateEvidence
              .map((item) => item.sourceId)
              .filter((sourceId): sourceId is string => Boolean(sourceId)),
          ),
        ),
        diagnostics: Array.from(
          new Set([
            `canonical_evidence:${canonicalEvidenceStatus}`,
            ...indeterminateEvidence.flatMap((item) => item.diagnostics),
          ]),
        ),
      },
      evidenceCards: reportEvidenceCards,
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
      fallbackUsed,
      fallbackReason,
      reportMode,
      researchReportMode,
      citationDisplayMode,
      formalResearchArchitecture:
        writerResult.formalResearchArchitecture ?? formalResearchArchitecture ?? null,
      formalResearchValidation,
      formalSectionRepairDiagnostics: formalSectionRepair.repairs,
      sectionDegradationDiagnostics,
      formalResearchCheckpoint,
      reportPlan: reportPlanResult?.plan ?? null,
      reportPlanStatus: writerEvidenceSet
        ? "plan_built"
        : (reportPlanResult?.status ?? "degraded_legacy"),
      reportPlanDiagnostics: reportPlanResult?.diagnostics ?? [
        "legacy_report_plan_missing",
      ],
      planBuildStatus: reportPlanResult ? "plan_built" : "plan_invalidated",
      readinessStatus:
        readinessStatus ??
        (reportPlanResult ? "ready_limited_report" : "invalid_evidence_set"),
      writerEvidenceSet,
      evidenceSetHash: writerEvidenceSet?.evidenceSetHash ?? null,
      writerEvidenceSetHash: writerEvidenceSet?.evidenceSetHash ?? null,
      filteredEvidence: writerEvidenceSet?.rejectedEvidenceCards ?? [],
      filteredEvidenceCount:
        writerEvidenceSet?.rejectedEvidenceCards.length ?? 0,
      filteredAfterPlanCount: 0,
      sourceMixProfile,
      details: {
        reportMode,
        researchReportMode,
        citationDisplayMode,
        acceptedSourcesCount: acceptedSources.length,
        evidenceCardsCount: reportEvidenceCards.length,
        fallbackUsed,
        requestedModel: writerResult.requestedModel ?? null,
        actualModel: writerResult.actualModel ?? null,
        writerDiagnostics: writerResult.writerDiagnostics ?? null,
      },
    });
  });

  return router;
}

export default createReportDraftsRouter();
