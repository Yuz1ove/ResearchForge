import type {
  AcademicSafetyReview,
  DiscourseSection,
  NormalizedFact,
  ReportEvidenceGroup,
  ReportParagraphPlan,
  ReportPlan,
  ReportPlannedClaim,
  ReportReadinessStatus,
  SynthesisCluster,
  WriterEvidenceSet,
} from "@workspace/api-zod";
import { ReportPlanSchema } from "@workspace/api-zod";

import type { EvidenceCard } from "./evidenceCards.ts";
import { buildReportComposition } from "./reportComposer.ts";
import { buildReportIntelligence } from "./reportIntelligence.ts";
import { UNTRANSLATED_EVIDENCE_NOTICE } from "./zhTwReportText.ts";

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/gu, " ").trim() ?? "";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(compact).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function orderedUnique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return values.map(compact).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

function sourceKey(card: EvidenceCard): string {
  return compact(card.canonicalSourceKey ?? card.dedupeKey ?? card.sourceId);
}

function citationKey(card: EvidenceCard): string {
  return compact(card.citationKey) || sourceKey(card);
}

function evidenceIdentity(card: EvidenceCard): string {
  return compact(card.evidenceId ?? card.evidenceCardId ?? card.id);
}

function substantiveClaim(card: EvidenceCard): string {
  const candidates = [
    card.claimTextZhTw,
    card.mainClaimZhTw,
    card.evidencePointZhTw,
    card.sourceSummaryZhTw,
    card.claimTextZh,
    card.usableEvidence,
    card.mainClaim,
    card.claim,
    card.summary,
  ];
  return candidates
    .map(compact)
    .find(
      (value) =>
        value &&
        /[\u3400-\u9fff]/u.test(value) &&
        !value.includes(UNTRANSLATED_EVIDENCE_NOTICE),
    ) ?? "";
}

function cardCanEnterPlan(card: EvidenceCard): boolean {
  if (
    card.userDecision === "rejected" ||
    card.recommendationBucket === "rejected" ||
    card.sourceRole === "rejected" ||
    compact(card.rejectionReason)
  ) {
    return false;
  }
  if (
    card.sourceAccessLevel === "metadata_only" ||
    card.sourceAccessLevel === "blocked_or_paywalled" ||
    card.sourceAccessLevel === "failed_extraction" ||
    card.derivation === "metadata-derived"
  ) {
    return false;
  }
  return Boolean(
    evidenceIdentity(card) &&
    sourceKey(card) &&
    citationKey(card) &&
    substantiveClaim(card) &&
    compact(card.supportSpan ?? card.supportedByText ?? card.sourceExcerptOriginal),
  );
}

function evidenceStrength(card: EvidenceCard): ReportPlannedClaim["evidenceStrength"] {
  if (card.derivation === "fulltext-derived" && card.confidenceScore >= 0.72) {
    return "moderate";
  }
  return "weak";
}

function claimScope(card: EvidenceCard): ReportPlannedClaim["scope"] {
  if (card.derivation === "fulltext-derived" && !card.abstractOnly) {
    return "full_text_supported";
  }
  return "abstract_only_supported";
}

function limitations(card: EvidenceCard): string[] {
  return unique([
    ...(card.limitationsZhTw ?? []),
    ...(card.limitations ?? []),
    card.limitation,
    card.abstractOnly || card.derivation === "abstract-derived"
      ? "僅以摘要內容支撐，不外推至全文未揭露的結果。"
      : null,
    card.needsManualReview || card.needsReview
      ? "此證據仍需人工複核。"
      : null,
  ]);
}

function semanticGroupLabel(disourse: DiscourseSection, index: number): string {
  const question = compact(disourse.questionAnswered)
    .replace(/^關於「[^」]+」，?/u, "")
    .replace(/能支持什麼判斷[？?]?$/u, "")
    .replace(/[？?。]$/u, "");
  return question || `證據主題 ${index + 1}`;
}

export interface StructuredReportPlanInput {
  workflowId: string;
  topicHash: string;
  title: string;
  canonicalTitle?: string | null;
  originalTitle?: string | null;
  titleLanguage?: "zh-TW" | "en" | "mixed" | null;
  keywords?: string[] | null;
  researchQuestion?: string | null;
  reportType?: string | null;
  audience?: string | null;
  evidenceCards: EvidenceCard[];
  academicSafetyReview?: AcademicSafetyReview | null;
  writerEvidenceSet?: WriterEvidenceSet | null;
  targetedRetrievalAttempted?: boolean;
}

function titleLanguage(value: string): "zh-TW" | "en" | "mixed" {
  const hasZh = /[\u3400-\u9fff]/u.test(value);
  const hasLatin = /[A-Za-z]/u.test(value);
  return hasZh && hasLatin ? "mixed" : hasZh ? "zh-TW" : "en";
}

function englishConceptFallback(value: string, pattern: RegExp, label: string): string | null {
  return pattern.test(value) ? label : null;
}

function canonicalPlanTitle(
  input: StructuredReportPlanInput,
  facts: NormalizedFact[],
): {
  title: string;
  originalTitle?: string;
  titleLanguage: "zh-TW" | "en" | "mixed";
} {
  const suppliedTitle = compact(input.title);
  const suppliedCanonical = compact(input.canonicalTitle);
  const researchTopic = compact(input.researchQuestion);
  const topicText = `${suppliedTitle} ${researchTopic}`;
  const population = englishConceptFallback(
    topicText,
    /\bhigh[- ]?school\s+(?:students?|adolescents?)\b|高中生/iu,
    "高中生",
  ) ?? englishConceptFallback(
    topicText,
    /\bsecondary[- ]?school\s+students?\b|中學生/iu,
    "中學生",
  ) ?? unique(facts.map((fact) => fact.population))[0];
  const exposure = englishConceptFallback(
    topicText,
    /\b(?:short[- ]?form|short)\s+videos?\b|短影音/iu,
    "短影音使用",
  ) ?? unique(facts.map((fact) => fact.exposureConcept))[0] ??
    englishConceptFallback(
      topicText,
      /\b(?:short[- ]?form|short)\s+videos?\b|\btiktok\b/iu,
      "短影音使用",
    );
  const outcome = englishConceptFallback(
    topicText,
    /\bsleep\s+quality\b|睡眠品質/iu,
    "睡眠品質",
  ) ?? unique(facts.map((fact) => fact.outcomeConcept))[0];
  const titleOutcome = outcome
    ?.replace(/(?:總)?分數$/u, "")
    .replace(/比例$/u, "")
    .trim();
  const reconstructedTitle = exposure && outcome
    ? `${exposure}與${population ?? ""}${titleOutcome}的關聯`
    : "";
  const title = suppliedCanonical ||
    (/[\u3400-\u9fff]/u.test(suppliedTitle)
      ? suppliedTitle
      : /[\u3400-\u9fff]/u.test(researchTopic) && !/[？?]/u.test(researchTopic)
        ? researchTopic
        : reconstructedTitle || suppliedTitle);
  const originalTitle = compact(input.originalTitle) ||
    (title !== suppliedTitle ? suppliedTitle : "");
  return {
    title,
    ...(originalTitle ? { originalTitle } : {}),
    titleLanguage: input.titleLanguage ?? titleLanguage(title),
  };
}

function isFullText(card: EvidenceCard): boolean {
  return card.derivation === "fulltext-derived" ||
    card.sourceAccessLevel === "full_text" ||
    card.abstractOnly === false;
}

function isMethodEvidence(card: EvidenceCard): boolean {
  const values = [
    card.evidenceType,
    ...(card.sectionTargets ?? []),
    ...(card.sectionFit ?? []),
    ...(card.usableSections ?? []),
  ].map(compact);
  return values.some((value) => /method|方法|design|實驗設計/iu.test(value));
}

/**
 * Builds a section inventory from the evidence-supported subquestions. The
 * caller must pass the server-issued WriterEvidenceSet for the canonical
 * product path; the optional legacy mode remains only for persisted workspaces.
 */
export function buildStructuredReportPlan(
  input: StructuredReportPlanInput,
): ReportPlan | null {
  const traceableCards = input.evidenceCards.filter(cardCanEnterPlan);
  const composition = buildReportComposition({
    topic: input.title,
    researchQuestion: input.researchQuestion,
    evidenceCards: traceableCards,
  });
  const normalizedById = new Map(
    composition.normalizedEvidence.map((item) => [item.evidenceId, item] as const),
  );
  const cards = traceableCards
    .filter(
      (card) =>
        normalizedById.get(evidenceIdentity(card))?.writerEligible,
    )
    .sort((left, right) =>
      sourceKey(left).localeCompare(sourceKey(right)) ||
      evidenceIdentity(left).localeCompare(evidenceIdentity(right)),
    );
  if (cards.length === 0) return null;
  const cardIds = cards.map(evidenceIdentity).sort();
  if (
    input.writerEvidenceSet &&
    (input.writerEvidenceSet.runId !== compact(input.workflowId) ||
      JSON.stringify(cardIds) !==
        JSON.stringify([...input.writerEvidenceSet.eligibleEvidenceCardIds].sort()))
  ) {
    return null;
  }

  const allThematicCandidates = (composition.discoursePlan ?? [])
    .filter(
      (section) =>
        section.sectionRole === "thematic_analysis" &&
        section.assignedEvidenceIds.length > 0,
    );
  const thematicCandidates = allThematicCandidates.length <= 2
    ? allThematicCandidates
    : [
        allThematicCandidates[0]!,
        {
          ...allThematicCandidates[1]!,
          questionAnswered: allThematicCandidates
            .slice(1)
            .map((section) => section.questionAnswered)
            .join("；"),
          assignedEvidenceIds: unique(
            allThematicCandidates.slice(1).flatMap((section) => section.assignedEvidenceIds),
          ),
          assignedFactIds: unique(
            allThematicCandidates.slice(1).flatMap((section) => section.assignedFactIds ?? []),
          ),
          synthesisClusterIds: unique(
            allThematicCandidates.slice(1).flatMap((section) => section.synthesisClusterIds ?? []),
          ),
          sectionClaim: unique(
            allThematicCandidates.slice(1).map((section) => section.sectionClaim),
          ).join("；"),
          evidenceRelationship: "整合其餘主題群組，比較不同場域、方法與結果的互補及不可比較處。",
          limitations: unique(
            allThematicCandidates.slice(1).flatMap((section) => section.limitations),
          ),
        },
      ];
  // A single semantic cluster remains one chapter.  Never manufacture a second
  // theme by splitting evidence IDs or source order.
  const thematic = thematicCandidates;
  if (thematic.length === 0) return null;

  const coreIds = thematic.map((section, index) => ({
    sectionId: index === 0 ? "literature_review" : "findings",
    discourse: section,
  }));
  const ownerByEvidenceId = new Map<string, string>();
  const ownerByClusterId = new Map<string, string>();
  for (const core of coreIds) {
    for (const evidenceId of core.discourse.assignedEvidenceIds) {
      if (!ownerByEvidenceId.has(evidenceId)) {
        ownerByEvidenceId.set(evidenceId, core.sectionId);
      }
    }
    for (const clusterId of core.discourse.synthesisClusterIds ?? []) {
      if (!ownerByClusterId.has(clusterId)) ownerByClusterId.set(clusterId, core.sectionId);
    }
  }
  const fallbackCoreId = coreIds[0]!.sectionId;
  const cardByEvidenceId = new Map(
    cards.map((card) => [evidenceIdentity(card), card] as const),
  );
  const clusterPlannedClaims: ReportPlannedClaim[] = composition.synthesisClusters.map((cluster) => {
    const clusterCards = cluster.evidenceIds
      .map((id) => cardByEvidenceId.get(id))
      .filter((card): card is EvidenceCard => Boolean(card));
    const sectionId = ownerByClusterId.get(cluster.clusterId) ??
      cluster.evidenceIds.map((id) => ownerByEvidenceId.get(id)).find(Boolean) ??
      fallbackCoreId;
    const supportingSourceKeys = unique(clusterCards.map(sourceKey));
    const allowedCitationKeys = unique(clusterCards.map(citationKey));
    const strengths = clusterCards.map(evidenceStrength);
    const strength: ReportPlannedClaim["evidenceStrength"] =
      strengths.length > 0 && strengths.every((value) => value === "moderate")
        ? "moderate"
        : "weak";
    const scopes = unique(clusterCards.map(claimScope));
    const claimScopeValue: ReportPlannedClaim["scope"] = scopes.length > 1
      ? "mixed_source_access"
      : scopes[0] === "full_text_supported"
        ? "full_text_supported"
        : "abstract_only_supported";
    const graphClaim = composition.claimGraph.claims.find((claim) => {
      const graphFactIds = unique([
        ...claim.supportingFacts,
        ...claim.contradictingFacts,
        ...claim.backgroundFacts,
      ]);
      return JSON.stringify(graphFactIds) === JSON.stringify(unique(cluster.factIds));
    });
    return {
      claimId: `planned-claim-${stableHash(
        [input.topicHash, sectionId, cluster.clusterId].join("|"),
      )}`,
      claimText: cluster.sharedFindingZhTw,
      sectionId,
      supportingEvidenceIds: cluster.evidenceIds,
      supportingSourceKeys,
      evidenceStrength: strength,
      scope: claimScopeValue,
      limitations: unique([
        ...cluster.limitations,
        ...clusterCards.flatMap(limitations),
      ]),
      agreementStatus: cluster.agreementStatus,
      allowedCitationKeys,
      wordingStrength:
        strength === "moderate" && cluster.agreementStatus === "corroborated"
          ? "qualified"
          : "tentative",
      normalizedFactIds: cluster.factIds,
      synthesisClusterIds: [cluster.clusterId],
      ...(graphClaim ? { claimGraphId: graphClaim.claimId } : {}),
    };
  });
  const representedGraphClaimIds = new Set(
    clusterPlannedClaims.flatMap((claim) => claim.claimGraphId ? [claim.claimGraphId] : []),
  );
  const normalizedFactByIdForClaims = new Map(
    composition.normalizedFacts.map((fact) => [fact.factId, fact] as const),
  );
  const supplementalGraphClaims: ReportPlannedClaim[] = composition.claimGraph.claims
    .filter((graphClaim) => !representedGraphClaimIds.has(graphClaim.claimId))
    .flatMap((graphClaim) => {
      const factIds = unique([
        ...graphClaim.supportingFacts,
        ...graphClaim.contradictingFacts,
        ...graphClaim.backgroundFacts,
      ]);
      const graphFacts = factIds
        .map((factId) => normalizedFactByIdForClaims.get(factId))
        .filter((fact): fact is NormalizedFact => Boolean(fact));
      const graphEvidenceIds = unique(graphFacts.map((fact) => fact.evidenceId));
      const graphCards = graphEvidenceIds
        .map((id) => cardByEvidenceId.get(id))
        .filter((card): card is EvidenceCard => Boolean(card));
      if (graphCards.length === 0) return [];
      // Claim ownership remains in an evidence-bearing core section. Derived
      // discussion, limitations, and conclusion sections may reuse the node,
      // but must not become a second owner of the same evidence claim.
      const sectionId = graphEvidenceIds.map((id) => ownerByEvidenceId.get(id)).find(Boolean) ??
        fallbackCoreId;
      const strengths = graphCards.map(evidenceStrength);
      const strength: ReportPlannedClaim["evidenceStrength"] =
        strengths.length > 0 && strengths.every((value) => value === "moderate")
          ? "moderate"
          : "weak";
      const scopes = unique(graphCards.map(claimScope));
      const scope: ReportPlannedClaim["scope"] = scopes.length > 1
        ? "mixed_source_access"
        : scopes[0] === "full_text_supported"
          ? "full_text_supported"
          : "abstract_only_supported";
      const sourceCount = new Set(graphFacts.map((fact) => fact.sourceId)).size;
      return [{
        claimId: `planned-graph-${stableHash(graphClaim.claimId)}`,
        claimText: graphClaim.readerFacingStatement,
        sectionId,
        supportingEvidenceIds: graphEvidenceIds,
        supportingSourceKeys: unique(graphCards.map(sourceKey)),
        evidenceStrength: strength,
        scope,
        limitations: unique([
          ...graphClaim.limitations,
          ...graphCards.flatMap(limitations),
        ]),
        agreementStatus: graphClaim.contradictingFacts.length > 0
          ? "mixed"
          : sourceCount > 1
            ? "corroborated"
            : "single_source",
        allowedCitationKeys: unique(graphCards.map(citationKey)),
        wordingStrength: graphClaim.claimType === "evidence_gap"
          ? "gap_only"
          : strength === "moderate" && sourceCount > 1
            ? "qualified"
            : "tentative",
        normalizedFactIds: factIds,
        synthesisClusterIds: unique(
          composition.synthesisClusters
            .filter((cluster) => cluster.factIds.some((factId) => factIds.includes(factId)))
            .map((cluster) => cluster.clusterId),
        ),
        claimGraphId: graphClaim.claimId,
      }];
    });
  // Preserve the historical one-planned-claim-per-cluster contract while
  // retaining supplemental graph nodes whenever the composition introduces
  // distinct mechanism, applicability, gap, or author-level synthesis roles.
  // A simple one-theme fixture should not manufacture extra prose claims.
  const hasCanonicalAtomicResults = composition.normalizedFacts.some((fact) =>
    fact.resultIndex != null || fact.statisticType != null
  );
  const shouldProjectSupplementalGraphClaims = hasCanonicalAtomicResults &&
    composition.claimGraph.claims.some((claim) =>
      ["possible_mechanism", "applicability_boundary", "evidence_gap", "author_synthesis"]
        .includes(claim.claimType)
    );
  const plannedClaims = [
    ...clusterPlannedClaims,
    ...(shouldProjectSupplementalGraphClaims ? supplementalGraphClaims : []),
  ];
  const claimIdsFor = (sectionId: string) =>
    plannedClaims
      .filter((claim) => claim.sectionId === sectionId)
      .map((claim) => claim.claimId);
  const evidenceIds = cards.map(evidenceIdentity);
  const allClaimIds = plannedClaims.map((claim) => claim.claimId);
  const graphClaimTypeById = new Map(
    composition.claimGraph.claims.map((claim) => [claim.claimId, claim.claimType] as const),
  );
  const claimIdsForGraphTypes = (
    ...types: Array<(typeof composition.claimGraph.claims)[number]["claimType"]>
  ) => plannedClaims
    .filter((claim) => claim.claimGraphId && types.includes(graphClaimTypeById.get(claim.claimGraphId)!))
    .map((claim) => claim.claimId);
  const discourseByRole = new Map<string, DiscourseSection>(
    composition.discoursePlan.map((section) => [section.sectionRole, section]),
  );
  const backgroundDiscourse = discourseByRole.get("research_question_and_scope");
  const discussionDiscourse = discourseByRole.get("cross_source_synthesis");
  const limitationsDiscourse = discourseByRole.get("limitations_and_gaps");
  const conclusionDiscourse = discourseByRole.get("direct_answer");
  const fullTextCards = cards.filter(isFullText);
  const fullTextMethodCards = fullTextCards.filter(isMethodEvidence);
  const hasAbstractLevelEvidence = cards.some((card) => !isFullText(card));
  const targetedRetrievalAttempted = input.targetedRetrievalAttempted ?? true;
  const hasDirectnessMetadata = cards.some((card) => Boolean(card.evidenceDirectnessTier));
  const tierACount = cards.filter((card) => card.evidenceDirectnessTier === "A").length;
  const tierABCount = cards.filter((card) =>
    card.evidenceDirectnessTier === "A" || card.evidenceDirectnessTier === "B",
  ).length;
  const limitedByDirectness = hasDirectnessMetadata && (tierACount < 1 || tierABCount < 3);
  const limitedByAccess = fullTextCards.length < cards.length || fullTextCards.length < 3;
  const compositionKind = limitedByAccess || limitedByDirectness
    ? "limited_evidence_brief" as const
    : composition.compositionKind;
  const intelligence = buildReportIntelligence({
    topic: compact(input.title),
    researchQuestion: composition.argumentMap.researchQuestion,
    reportType: input.reportType,
    audience: input.audience,
    compositionKind,
    facts: composition.normalizedFacts,
    clusters: composition.synthesisClusters,
    claimGraph: composition.claimGraph,
  });
  const readinessStatus: ReportReadinessStatus =
    !targetedRetrievalAttempted && hasAbstractLevelEvidence && fullTextMethodCards.length === 0
      ? "needs_targeted_search"
      : compositionKind === "complete_research_report"
        ? "ready_complete_report"
        : "ready_limited_report";
  const limitedPrefix = compositionKind === "limited_evidence_brief"
    ? "在目前可取得的摘要或受限全文證據內，"
    : "";
  const centralAnswer = `${limitedPrefix}${composition.argumentMap.centralAnswer}`;
  const scope = compositionKind === "limited_evidence_brief"
    ? `${composition.argumentMap.scope} 本版為有限證據報告，不聲稱完成全文方法比較。`
    : composition.argumentMap.scope;
  const subQuestions = [
    ...coreIds.map((core) => core.discourse.questionAnswered),
    ...(fullTextMethodCards.length > 0
      ? ["全文直接揭露的方法如何影響各研究結果的可比較性？"]
      : []),
  ].slice(0, 4);
  const conclusionBoundary = compositionKind === "limited_evidence_brief"
    ? `${composition.argumentMap.conclusionBoundary} 本版不得外推至未取得全文的方法細節。`
    : composition.argumentMap.conclusionBoundary;
  const argumentMap = {
    ...composition.argumentMap,
    centralAnswer,
    scope,
    subQuestions,
    conclusionBoundary,
  };

  let thematicSectionsInserted = false;
  const boundedDiscoursePlan = composition.discoursePlan.flatMap((section) => {
    if (section.sectionRole !== "thematic_analysis") return [section];
    if (thematicSectionsInserted) return [];
    thematicSectionsInserted = true;
    return thematic;
  });
  const discoursePlan: DiscourseSection[] = boundedDiscoursePlan.map((section) => {
    if (section.sectionRole === "research_question_and_scope" ||
        section.sectionRole === "cross_source_synthesis" ||
        section.sectionRole === "direct_answer") {
      return {
        ...section,
        sectionClaim: centralAnswer,
        ...(section.sectionRole === "direct_answer"
          ? { expectedTakeaway: centralAnswer, limitations: [conclusionBoundary] }
          : {}),
      };
    }
    return section;
  });

  const normalizedFactById = new Map(
    composition.normalizedFacts.map((fact) => [fact.factId, fact] as const),
  );
  const synthesisClusterById = new Map(
    composition.synthesisClusters.map((cluster) => [cluster.clusterId, cluster] as const),
  );

  const evidenceGroupFor = (
    sectionId: string,
    discourse: DiscourseSection,
    evidenceIds: string[],
    index: number,
    groupingBasis: ReportEvidenceGroup["groupingBasis"] = "theme",
  ): ReportEvidenceGroup => {
    const groupCards = cards.filter((card) => evidenceIds.includes(evidenceIdentity(card)));
    const clusterIds = unique([
      ...(discourse.synthesisClusterIds ?? []),
      ...composition.synthesisClusters
        .filter((cluster) => cluster.evidenceIds.some((id) => evidenceIds.includes(id)))
        .map((cluster) => cluster.clusterId),
    ]);
    const groupClusters = clusterIds
      .map((clusterId) => synthesisClusterById.get(clusterId))
      .filter((cluster): cluster is SynthesisCluster => Boolean(cluster));
    const factIds = unique([
      ...(discourse.assignedFactIds ?? []),
      ...groupClusters.flatMap((cluster) => cluster.factIds),
    ]);
    const groupFacts = factIds
      .map((factId) => normalizedFactById.get(factId))
      .filter((fact): fact is NormalizedFact => Boolean(fact));
    const sourceKeys = unique([
      ...groupCards.map(sourceKey),
      ...groupClusters.flatMap((cluster) => cluster.sourceIds),
    ]);
    const groupLimitations = unique([
      ...discourse.limitations,
      ...groupCards.flatMap(limitations),
      ...groupClusters.flatMap((cluster) => cluster.limitations),
    ]);
    const contrastPoints = unique([
      ...groupClusters.flatMap((cluster) => cluster.conflictPoints),
      sourceKeys.length > 1
        ? "來源的研究場域、方法或量測尺度不同，只比較方向與適用條件，不合併不可比的效果量。"
        : "此群組目前只有單一來源，應以暫定語氣呈現，不能視為跨研究共識。",
      new Set(groupCards.map((card) => card.derivation)).size > 1
        ? "來源取得層級不同，全文與摘要證據的可解讀範圍不可視為相同。"
        : null,
    ]);
    return {
      groupId: `${sectionId}-group-${stableHash(clusterIds.join("|") || `${sectionId}|${index}`)}`,
      label: unique(groupClusters.map((cluster) => cluster.label)).join("與") || semanticGroupLabel(discourse, index),
      groupingBasis,
      evidenceIds,
      sourceKeys,
      sharedFinding: unique(groupClusters.map((cluster) => cluster.sharedFindingZhTw)).join("；") || compact(discourse.sectionClaim),
      contrastPoints,
      limitations: groupLimitations,
      normalizedFactIds: groupFacts.map((fact) => fact.factId),
      synthesisClusterIds: groupClusters.map((cluster) => cluster.clusterId),
      conceptAxes: unique(groupClusters.flatMap((cluster) => cluster.conceptAxes)),
      comparabilityKeys: unique(groupClusters.flatMap((cluster) => cluster.comparabilityKeys)),
    };
  };
  const coreEvidenceGroups = coreIds.map((core, index) =>
    evidenceGroupFor(
      core.sectionId,
      core.discourse,
      core.discourse.assignedEvidenceIds.filter((id) =>
        cards.some((card) => evidenceIdentity(card) === id),
      ),
      index,
      /場域/u.test(semanticGroupLabel(core.discourse, index)) ? "setting" : "theme",
    )
  );
  const claimsFor = (claimIds: string[]) =>
    plannedClaims.filter((claim) => claimIds.includes(claim.claimId));
  const claimIdsOrFallback = (claimIds: string[], fallback: string[]) =>
    claimIds.length > 0 ? unique(claimIds) : unique(fallback);
  const introductionClaimIds = claimIdsOrFallback(
    claimIdsForGraphTypes("evidence_gap", "applicability_boundary"),
    claimIdsFor(fallbackCoreId),
  );
  const discussionClaimIds = claimIdsOrFallback(
    claimIdsForGraphTypes(
      "cross_source_shared_direction",
      "research_difference",
      "possible_mechanism",
      "author_synthesis",
    ),
    allClaimIds,
  );
  const limitationClaimIds = claimIdsOrFallback(
    claimIdsForGraphTypes("applicability_boundary", "evidence_gap", "research_difference"),
    allClaimIds,
  );
  const conclusionClaimIds = claimIdsOrFallback(
    claimIdsForGraphTypes("author_synthesis", "applicability_boundary", "evidence_gap"),
    allClaimIds,
  );
  const groupsForClaimIds = (claimIds: string[]) => {
    const relevantClaims = claimsFor(claimIds);
    const relevantFactIds = new Set(relevantClaims.flatMap((claim) => claim.normalizedFactIds ?? []));
    const relevantClusterIds = new Set(relevantClaims.flatMap((claim) => claim.synthesisClusterIds ?? []));
    return coreEvidenceGroups.filter((group) =>
      (group.normalizedFactIds ?? []).some((factId) => relevantFactIds.has(factId)) ||
      (group.synthesisClusterIds ?? []).some((clusterId) => relevantClusterIds.has(clusterId))
    );
  };
  const evidenceIdsForClaimIds = (claimIds: string[]) => unique(
    claimsFor(claimIds).flatMap((claim) => claim.supportingEvidenceIds),
  );
  const writingFields = (input: {
    sectionId: string;
    purpose: string;
    thesis: string;
    claimIds: string[];
    groups: ReportEvidenceGroup[];
    contrastPoints?: string[];
    transitionGoal: string;
    limitationBoundary: string;
  }) => {
    const groupIds = input.groups.map((group) => group.groupId);
    const normalizedFactIds = unique(input.groups.flatMap((group) => group.normalizedFactIds ?? []));
    const synthesisClusterIds = unique(input.groups.flatMap((group) => group.synthesisClusterIds ?? []));
    const supportedClaims = claimsFor(input.claimIds);
    const contrastPoints = unique([
      ...(input.contrastPoints ?? []),
      ...input.groups.flatMap((group) => group.contrastPoints),
    ]);
    const paragraphPlan: ReportParagraphPlan[] = [
      {
        paragraphId: `${input.sectionId}-paragraph-1`,
        purpose: "orient",
        topicSentenceGoal: input.thesis,
        evidenceGroupIds: [],
        supportedClaimIds: [],
        synthesisGoal: "先說明本節如何回答研究問題，不以來源名稱或方法細節開頭。",
        transitionGoal: "由本節論點帶入最相關的證據群組。",
        limitationBoundary: input.limitationBoundary,
        normalizedFactIds: [],
        synthesisClusterIds: [],
        teachBackGoal: "先用自己的話說清楚本節要回答的問題、核心概念與判斷，不提作者或來源。",
        academicReconstructionGoal: "以正式學術語氣重建主題句，暫不加入尚未由 claim graph 綁定的數值或引用。",
        minimumIntegratedFactCount: 0,
      },
      {
        paragraphId: `${input.sectionId}-paragraph-2`,
        purpose: "present_evidence",
        topicSentenceGoal: "以主題句統整可共同支持的結果，再使用來源作為證據。",
        evidenceGroupIds: groupIds,
        supportedClaimIds: supportedClaims.map((claim) => claim.claimId),
        synthesisGoal: contrastPoints.join("；") || "說明來源如何共同支持、補充或限制本節論點。",
        transitionGoal: "從證據描述轉入跨來源比較與研究問題意義。",
        limitationBoundary: input.limitationBoundary,
        normalizedFactIds,
        synthesisClusterIds,
        teachBackGoal: "先解釋多項 atomic facts 共同回答了什麼，以及它們在母群、暴露與結果定義上是否可比。",
        academicReconstructionGoal: "只放回同一 claim node 可支撐的關鍵數值、適用條件與 citation identity。",
        minimumIntegratedFactCount: Math.min(2, normalizedFactIds.length),
      },
      {
        paragraphId: `${input.sectionId}-paragraph-3`,
        purpose: contrastPoints.length > 0 ? "compare_sources" : "interpret",
        topicSentenceGoal: "比較來源的一致、差異與不可比較處，並說明其對研究問題的意義。",
        evidenceGroupIds: groupIds,
        supportedClaimIds: supportedClaims.map((claim) => claim.claimId),
        synthesisGoal: "完成本節論證，而不是依來源取得順序逐篇摘要。",
        transitionGoal: input.transitionGoal,
        limitationBoundary: input.limitationBoundary,
        normalizedFactIds,
        synthesisClusterIds,
        teachBackGoal: "以自己的話比較一致方向、差異、可能機制與適用邊界，不逐篇重述研究。",
        academicReconstructionGoal: "把比較重建為可核對論證，逐項保留 directness、限制與 claim-citation entailment。",
        minimumIntegratedFactCount: Math.min(2, normalizedFactIds.length),
      },
    ];
    return {
      sectionPurpose: input.purpose,
      sectionThesis: input.thesis,
      paragraphPlan,
      evidenceGroups: input.groups,
      supportedClaims,
      contrastPoints,
      transitionGoal: input.transitionGoal,
      limitationBoundary: input.limitationBoundary,
    };
  };

  const discourseFields = (section: DiscourseSection | undefined) =>
    section
      ? {
          sectionRole: section.sectionRole,
          questionAnswered: section.questionAnswered,
          sectionClaim: section.sectionClaim,
          evidenceRelationship: section.evidenceRelationship,
          connectionFromPrevious: section.connectionFromPrevious,
          expectedTakeaway: section.expectedTakeaway,
          transitionToNext: section.transitionToNext,
          limitations: section.limitations,
          assignedFactIds: section.assignedFactIds ?? [],
          synthesisClusterIds: section.synthesisClusterIds ?? [],
        }
      : {};
  const coreSections = coreIds.map((core, index) => {
    const assignedEvidenceIds = core.discourse.assignedEvidenceIds.filter((id) =>
      cards.some((card) => evidenceIdentity(card) === id),
    );
    const sectionClaimIds = claimIdsFor(core.sectionId);
    return {
      sectionId: core.sectionId,
      title: index === 0 ? "文獻證據與概念界定" : "主要發現與適用條件",
      goal: `回答子問題：${core.discourse.questionAnswered}`,
      requiredEvidenceTypes: ["finding", "review", "data"],
      evidenceCardIds: assignedEvidenceIds,
      plannedClaimIds: sectionClaimIds,
      canonicalSectionRole: "core_evidence" as const,
      ...discourseFields(core.discourse),
      ...writingFields({
        sectionId: core.sectionId,
        purpose: `回答子問題：${core.discourse.questionAnswered}`,
        thesis: core.discourse.sectionClaim,
        claimIds: sectionClaimIds,
        groups: coreEvidenceGroups[index] ? [coreEvidenceGroups[index]!] : [],
        contrastPoints: [core.discourse.evidenceRelationship],
        transitionGoal: core.discourse.transitionToNext,
        limitationBoundary: unique(core.discourse.limitations).join("；") || conclusionBoundary,
      }),
    };
  });
  const methodSection = fullTextMethodCards.length > 0
    ? [{
        sectionId: "methodology",
        title: "研究方法比較",
        goal: "比較全文直接揭露的研究設計與方法限制",
        requiredEvidenceTypes: ["method"],
        evidenceCardIds: fullTextMethodCards.map(evidenceIdentity),
        plannedClaimIds: plannedClaims
          .filter((claim) =>
            claim.supportingEvidenceIds.some((id) =>
              fullTextMethodCards.some((card) => evidenceIdentity(card) === id),
            ),
          )
          .map((claim) => claim.claimId),
        canonicalSectionRole: "core_evidence" as const,
        sectionRole: "thematic_analysis",
        questionAnswered: "全文直接揭露的方法如何影響各研究結果的可比較性？",
        sectionClaim: "本節只比較全文直接揭露的方法，不由摘要補寫實驗細節。",
        evidenceRelationship: "比較研究設計、資料與方法限制。",
        connectionFromPrevious: "承接核心發現，檢查方法是否足以支持比較。",
        expectedTakeaway: "方法差異會限制結果可比性。",
        transitionToNext: "下一節進行跨來源綜合。",
        limitations: [],
        ...writingFields({
          sectionId: "methodology",
          purpose: "比較全文直接揭露的研究設計與方法限制。",
          thesis: "方法差異會限制結果可比性。",
          claimIds: plannedClaims
            .filter((claim) =>
              claim.supportingEvidenceIds.some((id) =>
                fullTextMethodCards.some((card) => evidenceIdentity(card) === id),
              ),
            )
            .map((claim) => claim.claimId),
          groups: coreEvidenceGroups.filter((group) =>
            group.evidenceIds.some((id) =>
              fullTextMethodCards.some((card) => evidenceIdentity(card) === id),
            ),
          ),
          transitionGoal: "由方法差異進入跨來源綜合。",
          limitationBoundary: "只比較全文直接揭露的方法，不由摘要補寫實驗細節。",
        }),
      }]
    : hasAbstractLevelEvidence
      ? [{
          sectionId: "methodology",
          title: "證據範圍與資料限制",
          goal: "交代來源取得層級與不能進行的方法分析",
          requiredEvidenceTypes: ["scope", "limitation"],
          evidenceCardIds: evidenceIds,
          plannedClaimIds: allClaimIds,
          canonicalSectionRole: "scope_method" as const,
          sectionRole: "scope_method",
          questionAnswered: "目前取得的證據能支持到哪一層次？",
          sectionClaim: "現有材料不足以形成完整方法分析，本節只界定摘要與全文取得範圍。",
          evidenceRelationship: "按取得層級與可外推邊界整理，不假裝比較方法。",
          connectionFromPrevious: "承接核心證據，檢查其資料取得層級。",
          expectedTakeaway: "讀者知道哪些方法細節尚未被直接證據支持。",
          transitionToNext: "在此邊界內進行跨來源綜合。",
          limitations: ["targeted retrieval 後仍缺乏足以支撐方法比較的全文證據。"],
          ...writingFields({
            sectionId: "methodology",
            purpose: "交代來源取得層級、檢索範圍與方法比較邊界。",
            thesis: "現有材料足以形成受限證據綜合，但不足以完成全文方法比較。",
            claimIds: allClaimIds,
            groups: coreEvidenceGroups,
            transitionGoal: "在已說明的證據邊界內進行跨來源綜合。",
            limitationBoundary: "不得由摘要推測未揭露的樣本、方法或統計結果。",
          }),
        }]
      : [];
  const canonicalTitle = canonicalPlanTitle(input, composition.normalizedFacts);
  const reportPlan: ReportPlan = {
    workflowId: compact(input.workflowId),
    topicHash: compact(input.topicHash),
    title: canonicalTitle.title,
    ...(canonicalTitle.originalTitle ? { originalTitle: canonicalTitle.originalTitle } : {}),
    titleLanguage: canonicalTitle.titleLanguage,
    keywords: orderedUnique([
      /短影音|short[- ]?form|tiktok/iu.test(`${canonicalTitle.title} ${input.title}`)
        ? "短影音"
        : null,
      /高中生|high[- ]?school/iu.test(`${canonicalTitle.title} ${input.title}`)
        ? "高中生"
        : null,
      /睡眠品質|sleep quality/iu.test(`${canonicalTitle.title} ${input.title}`)
        ? "睡眠品質"
        : null,
      /社交焦慮|社群焦慮|social anxiety/iu.test([
        canonicalTitle.title,
        input.title,
        ...composition.normalizedFacts.map((fact) => fact.mediator ?? ""),
        ...traceableCards.flatMap((card) => [
          card.claimTextZhTw,
          card.mainClaimZhTw,
          card.exactResult,
        ]),
      ].join(" "))
        ? "社交焦慮"
        : null,
      "證據綜合",
      ...(input.keywords ?? []),
      "研究對象",
      "暴露變項",
      "結果指標",
      "適用限制",
    ]).slice(0, 5),
    researchQuestion: composition.argumentMap.researchQuestion,
    ...(input.writerEvidenceSet
      ? {
          evidenceSetHash: input.writerEvidenceSet.evidenceSetHash,
          evidenceSetVersion: input.writerEvidenceSet.evidenceSetVersion,
          citationRegistryVersion: input.writerEvidenceSet.citationRegistryVersion,
        }
      : {}),
    planBuildStatus: "plan_built",
    readinessStatus,
    readinessReasons: [
      compositionKind === "limited_evidence_brief"
        ? "limited_to_available_abstract_or_partial_full_text_evidence"
        : "all_core_sections_have_direct_full_text_evidence",
      ...(input.writerEvidenceSet?.rejectedEvidenceCards.length
        ? [`pre_plan_filtered:${input.writerEvidenceSet.rejectedEvidenceCards.length}`]
        : []),
    ],
    targetedRetrievalAttempted,
    centralAnswer,
    scope,
    subQuestions,
    sections: [
      {
        sectionId: "introduction",
        title: "研究問題與範圍",
        goal: "界定研究主題、核心變項與可核對的研究脈絡",
        requiredEvidenceTypes: ["background", "review"],
        evidenceCardIds: evidenceIdsForClaimIds(introductionClaimIds),
        plannedClaimIds: introductionClaimIds,
        canonicalSectionRole: "background",
        ...discourseFields(backgroundDiscourse),
        ...writingFields({
          sectionId: "introduction",
          purpose: "界定研究問題、核心變項、證據範圍與全文論證順序。",
          thesis: centralAnswer,
          claimIds: introductionClaimIds,
          groups: groupsForClaimIds(introductionClaimIds),
          transitionGoal: backgroundDiscourse?.transitionToNext ?? "依主題證據群組檢驗核心回答。",
          limitationBoundary: conclusionBoundary,
        }),
      },
      ...coreSections,
      ...methodSection,
      {
        sectionId: "discussion",
        title: "討論",
        goal: "只比較與解讀正文已建立的主張，不新增未有證據的事實",
        requiredEvidenceTypes: ["finding", "limitation"],
        evidenceCardIds: evidenceIdsForClaimIds(discussionClaimIds),
        plannedClaimIds: discussionClaimIds,
        canonicalSectionRole: "cross_source_synthesis",
        ...discourseFields(discussionDiscourse),
        ...writingFields({
          sectionId: "discussion",
          purpose: "比較各證據群組的一致、差異、方法限制與外推邊界。",
          thesis: discussionDiscourse?.sectionClaim ?? centralAnswer,
          claimIds: discussionClaimIds,
          groups: groupsForClaimIds(discussionClaimIds),
          contrastPoints: coreEvidenceGroups.flatMap((group) => group.contrastPoints),
          transitionGoal: discussionDiscourse?.transitionToNext ?? "由綜合判讀轉入證據限制與研究缺口。",
          limitationBoundary: conclusionBoundary,
        }),
      },
      {
        sectionId: "limitations",
        title: "限制與證據缺口",
        goal: "把限制連回實際來源取得與研究範圍",
        requiredEvidenceTypes: ["limitation"],
        evidenceCardIds: evidenceIdsForClaimIds(limitationClaimIds),
        plannedClaimIds: limitationClaimIds,
        canonicalSectionRole: "limitations",
        ...discourseFields(limitationsDiscourse),
        ...writingFields({
          sectionId: "limitations",
          purpose: "把不能成立的結論連回具體地理、場域、方法與資料取得限制。",
          thesis: limitationsDiscourse?.sectionClaim ?? composition.argumentMap.evidenceGaps.join("；"),
          claimIds: limitationClaimIds,
          groups: groupsForClaimIds(limitationClaimIds),
          transitionGoal: limitationsDiscourse?.transitionToNext ?? "依此邊界形成受限結論與後續研究方向。",
          limitationBoundary: conclusionBoundary,
        }),
      },
      {
        sectionId: "conclusion",
        title: "結論",
        goal: "只回收正文已建立的主張、限制與後續證據缺口",
        requiredEvidenceTypes: ["finding", "limitation"],
        evidenceCardIds: evidenceIdsForClaimIds(conclusionClaimIds),
        plannedClaimIds: conclusionClaimIds,
        canonicalSectionRole: "conclusion",
        ...discourseFields(conclusionDiscourse),
        ...writingFields({
          sectionId: "conclusion",
          purpose: "先回答現有證據能支持什麼，再說明不能支持什麼與後續研究方向。",
          thesis: conclusionDiscourse?.sectionClaim ?? centralAnswer,
          claimIds: conclusionClaimIds,
          groups: groupsForClaimIds(conclusionClaimIds),
          transitionGoal: "正文結束，後接實際引用的參考文獻。",
          limitationBoundary: conclusionBoundary,
        }),
      },
      {
        sectionId: "references",
        title: "參考文獻",
        goal: "只列出 canonical citation registry 中實際引用的來源",
        requiredEvidenceTypes: ["citation"],
        evidenceCardIds: evidenceIds,
        plannedClaimIds: allClaimIds,
        canonicalSectionRole: "references",
        ...writingFields({
          sectionId: "references",
          purpose: "只列出正文實際引用且已完成身分映射的來源。",
          thesis: "參考文獻必須與正文引用一一對應，不得加入未使用來源。",
          claimIds: allClaimIds,
          groups: coreEvidenceGroups,
          transitionGoal: "文件結束。",
          limitationBoundary: "不得把納入但未在正文使用的來源混入正式參考文獻。",
        }),
      },
    ],
    plannedClaims,
    evidenceGaps: unique([
      ...composition.argumentMap.evidenceGaps,
      cards.length < 3
        ? "可用證據低於完整研究報告的建議數量，輸出範圍必須受限。"
        : null,
      cards.some((card) => card.abstractOnly || card.derivation === "abstract-derived")
        ? "部分來源僅取得摘要，不能外推至全文未揭露的方法或結果。"
        : null,
    ]),
    conclusionBoundary,
    argumentMap,
    discoursePlan,
    normalizedEvidence: composition.normalizedEvidence,
    normalizedFacts: composition.normalizedFacts,
    synthesisClusters: composition.synthesisClusters,
    claimGraph: intelligence.claimGraph,
    knowledgeModel: intelligence.knowledgeModel,
    heterogeneityAnalysis: intelligence.heterogeneityAnalysis,
    statisticalInterpretations: intelligence.statisticalInterpretations,
    contradictionAnalysis: intelligence.contradictionAnalysis,
    audienceProfile: intelligence.audienceProfile,
    reportArchetype: intelligence.reportArchetype,
    narrativePasses: composition.narrativePasses,
    compositionKind,
    terminology: composition.terminology,
    ...(input.academicSafetyReview
      ? { academicSafetyReview: input.academicSafetyReview }
      : {}),
  };

  const parsed = ReportPlanSchema.safeParse(reportPlan);
  return parsed.success ? parsed.data : null;
}
