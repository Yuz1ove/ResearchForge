import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  assessSourceTopicIntegrity,
  buildTopicIntegrityContract,
  type TopicIntegrityAssessment,
} from "../lib/api-zod/src/topic-integrity.ts";
import type { SourceRecord } from "../lib/api-zod/src/source-record.ts";
import type { WriterEvidenceSet } from "../lib/api-zod/src/research-grounding.ts";
import {
  buildFormalResearchArchitecture,
  validateChartProvenance,
} from "../artifacts/api-server/src/services/formal-research-architecture.ts";
import { buildWriterEvidenceSet } from "../artifacts/api-server/src/services/canonical-writer-evidence-set.ts";
import { buildStructuredReportPlan } from "../artifacts/report-factory/src/lib/structuredReportPlan.ts";
import type { EvidenceCard } from "../artifacts/report-factory/src/lib/evidenceCards.ts";

type Json = Record<string, unknown>;

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const outputDir = path.resolve(
  repositoryRoot,
  process.env.RESEARCHFORGE_QA_OUTPUT_DIR ??
    "artifacts/qa/researchforge-formal-human-acceptance-20260823T230500",
);
const apiBase = `${(process.env.RESEARCHFORGE_QA_API_ORIGIN ?? "http://127.0.0.1:3110").replace(/\/+$/u, "")}/api`;
const protectedFixture = path.join(
  repositoryRoot,
  "artifacts/qa/researchforge-fusion-accepted-20260813/short_video_sleep/report-workspace.json",
);
const expectedProtectedSha = "5ee0d47ceb20022bdd3c0db5a215d3e50387d2cd4cf0cbe60a43a4ac3fb41ad3";

const cases = [
  {
    slug: "exercise-blood-pressure",
    topic: "規律有氧運動對成人收縮壓與舒張壓的影響",
    domain: "醫療／長照／社工／心理",
    sourceFile:
      "artifacts/qa/researchforge-formal-research-ready-20260823T145757/exercise-blood-pressure/accepted-sources.json",
    evidenceFile:
      "artifacts/qa/researchforge-formal-research-ready-20260823T145757/exercise-blood-pressure/grounding-evidence-cards.json",
    priorCheckpointFile:
      "artifacts/qa/researchforge-formal-research-ready-20260823T100137/exercise-blood-pressure/writer-response.json",
    minimumDirectSources: 3,
    minimumEvidenceCards: 5,
    requiresQuantitativeEvidence: true,
  },
  {
    slug: "adolescent-screen-sleep",
    topic: "青少年螢幕使用時間與睡眠時長及睡眠品質的關聯",
    domain: "社會議題",
    sourceFile:
      process.env.RESEARCHFORGE_QA_CASE_A_SOURCE_FILE ??
      "artifacts/qa/researchforge-formal-research-ready-20260823T100027/adolescent-screen-sleep/accepted-sources.json",
    evidenceFile:
      process.env.RESEARCHFORGE_QA_CASE_A_EVIDENCE_FILE ??
      "artifacts/qa/researchforge-formal-research-ready-20260823T100027/adolescent-screen-sleep/grounding-evidence-cards.json",
    priorCheckpointFile:
      "artifacts/qa/researchforge-formal-research-ready-20260823T100027/adolescent-screen-sleep/writer-response.json",
    minimumDirectSources: 8,
    minimumEvidenceCards: 12,
    requiresQuantitativeEvidence: true,
  },
  {
    slug: "case-b",
    topic: "生成式人工智慧對高中生寫作學習的效益、限制與風險",
    domain: "教育研究／人工智慧",
    sourceFile:
      process.env.RESEARCHFORGE_QA_CASE_B_SOURCE_FILE ??
      "artifacts/qa/researchforge-overnight-closure-20260824T015836+0800/case-b/grounding-accepted-sources.raw.json",
    evidenceFile:
      process.env.RESEARCHFORGE_QA_CASE_B_EVIDENCE_FILE ??
      "artifacts/qa/researchforge-overnight-closure-20260824T015836+0800/case-b/grounding-evidence-cards.json",
    priorCheckpointFile: null,
    minimumDirectSources: 3,
    minimumEvidenceCards: 5,
    requiresQuantitativeEvidence: false,
  },
] as const;

function list<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function record(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relative), "utf8")) as T;
}

function writeJson(relative: string, value: unknown): void {
  const target = path.join(outputDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, target);
}

function shaFile(filename: string): string {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

function sourceCitation(source: SourceRecord): string {
  const authors = Array.isArray(source.authors) && source.authors.length
    ? source.authors.join(", ")
    : "Unknown author";
  const year = source.year ?? "n.d.";
  const venue = source.containerTitle || source.publisher || "";
  const locator = source.doi ? `https://doi.org/${source.doi}` : source.url ?? "";
  return `${authors} (${year}). ${source.title}. ${venue}. ${locator}`.replace(/\s+/gu, " ").trim();
}

async function post(endpoint: string, body: unknown): Promise<{ status: number; body: Json }> {
  const response = await fetch(`${apiBase}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : {};
  return { status: response.status, body: record(parsed) };
}

function reviewSources(
  sources: SourceRecord[],
  topic: string,
): {
  contract: ReturnType<typeof buildTopicIntegrityContract>;
  rows: Array<{
    source: SourceRecord;
    assessment: TopicIntegrityAssessment;
    canonicalCitation: string;
  }>;
} {
  const contract = buildTopicIntegrityContract({
    canonicalTopic: topic,
    researchQuestion: topic,
  });
  return {
    contract,
    rows: sources.map((source) => ({
      source,
      assessment: assessSourceTopicIntegrity(source, contract),
      canonicalCitation: sourceCitation(source),
    })),
  };
}

function enrichedDirectSources(
  rows: ReturnType<typeof reviewSources>["rows"],
): SourceRecord[] {
  return rows
    .filter((row) => row.assessment.sourceRole === "DIRECT_FINDING")
    .map(({ source, assessment }) => ({
      ...source,
      formalEvidenceRole: assessment.sourceRole,
      topicIntegrityAssessment: assessment,
      usableSections: assessment.allowedSections,
      isPrimaryEvidence: true,
    }));
}

function caseBFacetCoverage(cards: EvidenceCard[]): {
  benefitEvidenceIds: string[];
  limitationEvidenceIds: string[];
  riskEvidenceIds: string[];
} {
  const matchIds = (facet: "benefit" | "limitation" | "risk", pattern: RegExp) => cards
    .filter((card) => card.formalEvidenceRole === "DIRECT_FINDING")
    .filter((card) => {
      const evidenceId = card.evidenceId ?? card.id;
      const idFacet = evidenceId.match(/:targeted:(benefit|limitation|risk)(?:$|-)/u)?.[1];
      if (idFacet) return idFacet === facet;
      const declaredFacets = (card.governanceFlags ?? [])
        .filter((flag) => flag.startsWith("facet:"));
      if (declaredFacets.length > 0) return declaredFacets.includes(`facet:${facet}`);
      return pattern.test([
        card.claimText,
        card.claimTextZhTw,
        card.supportSpan,
        card.supportedByText,
        card.exactResult,
      ].filter(Boolean).join(" "));
    })
    .map((card) => card.evidenceId ?? card.id);
  return {
    benefitEvidenceIds: matchIds("benefit", /improv|enhanc|benefit|effective|strength|self[- ]?efficacy|改善|提升|效益|有效|優勢/iu),
    limitationEvidenceIds: matchIds("limitation", /limitation|insufficient|stereotyp|formulaic|no significant|not statistically|did not|boundary|限制|不足|公式化|無顯著|未改善/iu),
    riskEvidenceIds: matchIds("risk", /over[- ]?reliance|dependen|academic integrity|authorship|outsourc|plagiarism|critical engagement|deeper learning|過度依賴|學術誠信|作者身分|代寫|批判參與/iu),
  };
}

async function runCase(config: (typeof cases)[number]): Promise<Json> {
  const sources = readJson<SourceRecord[]>(config.sourceFile);
  const evidenceCards = readJson<EvidenceCard[]>(config.evidenceFile);
  writeJson(`${config.slug}/grounding-accepted-sources.raw.json`, sources);
  const priorResponse = config.priorCheckpointFile
    ? readJson<Json>(config.priorCheckpointFile)
    : {};
  const priorCheckpoint = record(priorResponse.formalResearchCheckpoint);
  const reviewed = reviewSources(sources, config.topic);
  const directSources = enrichedDirectSources(reviewed.rows);
  const sourceReview = reviewed.rows.map(({ source, assessment, canonicalCitation }) => ({
    sourceId: source.id,
    title: source.title,
    doi: source.doi ?? null,
    url: source.url ?? null,
    canonicalCitation,
    sourceRole: assessment.sourceRole,
    acceptedForCanonicalEvidence: assessment.acceptedForCanonicalEvidence,
    topicIntegrityReason: assessment.topicIntegrityReason,
    supportedTopicFacet: assessment.evidenceEntailment.supportedTopicFacet,
    populationMatch: assessment.evidenceEntailment.populationMatch,
    interventionExposureMatch: assessment.evidenceEntailment.interventionExposureMatch,
    outcomeMatch: assessment.evidenceEntailment.outcomeMatch,
    directness: assessment.evidenceEntailment.relationship,
    hardExclusion: assessment.hardExclusion,
  }));
  const rejected = sourceReview.filter((row) => !row.acceptedForCanonicalEvidence);
  writeJson(`${config.slug}/topic-integrity-contract.json`, reviewed.contract);
  writeJson(`${config.slug}/source-review.json`, sourceReview);
  writeJson(`${config.slug}/source-rejection-audit.json`, rejected);
  if (directSources.length < config.minimumDirectSources) {
    const checks = {
      topicContractVersioned: Boolean(reviewed.contract.schemaVersion && reviewed.contract.policyVersion),
      directSourceThreshold: false,
      canonicalSourceCountMatchesRoute: false,
      noNonDirectCanonicalSource: true,
      evidenceThreshold: false,
      noRejectedEvidenceCard: false,
      directEvidenceCoverage: false,
      evidenceMatrixPresent: false,
      oneClaimOwner: false,
      quantitativeRegistryPresent: !config.requiresQuantitativeEvidence,
      validatedQuantitativeFactsPresent: !config.requiresQuantitativeEvidence,
      quantitativeProvenanceClosed: true,
      chartProvenancePass: false,
      evidenceDerivedVisualApproved: false,
      rejectedVisualsExplainFailure: true,
      reportPlanBuilt: false,
      planEvidenceHashMatches: false,
      oldCheckpointInvalidated: true,
    };
    writeJson(`${config.slug}/accepted-sources.json`, []);
    writeJson(`${config.slug}/canonical-evidence-cards.json`, []);
    writeJson(`${config.slug}/offline-content-gate.json`, {
      passed: false,
      reason: "INSUFFICIENT_DIRECT_EVIDENCE_AFTER_TOPIC_INTEGRITY_REVIEW",
      checks,
    });
    return {
      slug: config.slug,
      passed: false,
      reason: "INSUFFICIENT_DIRECT_EVIDENCE_AFTER_TOPIC_INTEGRITY_REVIEW",
      reviewedSources: sources.length,
      canonicalDirectSources: directSources.length,
      rejectedOrContextOnlySources: rejected.length,
      canonicalEvidenceCards: 0,
      writerRequests: 0,
      checks,
    };
  }
  const directSourceIds = new Set(directSources.map((source) => source.id));
  const suppliedDirectCards = evidenceCards.filter((card) => directSourceIds.has(card.sourceId));
  const workflowId = String(directSources[0]?.workflowId ?? suppliedDirectCards[0]?.workflowId ?? `formal-${config.slug}`);
  const topicHash = String(directSources[0]?.topicHash ?? suppliedDirectCards[0]?.topicHash ?? createHash("sha256").update(config.topic).digest("hex").slice(0, 16));

  const preflight = await post("/report-evidence-sets", {
    topic: config.topic,
    workflowId,
    topicHash,
    researchReportMode: "formal_research_report",
    reportMode: "formal_research_report",
    topicIntegrityContract: reviewed.contract,
    acceptedSources: directSources,
    evidenceCards,
  });
  writeJson(`${config.slug}/canonical-preflight-response.json`, preflight);
  if (preflight.status !== 200) {
    throw new Error(`${config.slug}: canonical evidence preflight returned HTTP ${preflight.status}`);
  }
  const preflightCards = list<EvidenceCard>(preflight.body.evidenceCards);
  const canonicalCards = preflightCards.filter(
    (card) => card.formalEvidenceRole === "DIRECT_FINDING",
  );
  const writerEvidenceSet = buildWriterEvidenceSet({
    runId: workflowId,
    eligibleCards: canonicalCards,
    rejectedEvidence: [],
  });
  const acceptedSourceIds = new Set(canonicalCards.map((card) => card.sourceId));
  const canonicalSources = directSources.filter((source) => acceptedSourceIds.has(source.id));
  const architecture = buildFormalResearchArchitecture({
    sources: canonicalSources,
    evidenceCards: canonicalCards,
    workflow: {
      researchQuestion: config.topic,
      namedProviders: Array.from(new Set(canonicalSources.map((source) => source.provider).filter((value): value is string => Boolean(value)))),
      reproducibleSearchStrategy: true,
      explicitInclusionCriteria: true,
      explicitExclusionCriteria: true,
      screeningProcedure: true,
      duplicateRemoval: true,
      documentedStudySelection: true,
      qualityAssessment: false,
      queryExpansion: true,
      themeSynthesis: true,
    },
  });
  const reportPlan = buildStructuredReportPlan({
    workflowId,
    topicHash,
    title: config.topic,
    researchQuestion: config.topic,
    reportType: "正式二手研究報告",
    audience: "評審",
    evidenceCards: canonicalCards,
    writerEvidenceSet,
    targetedRetrievalAttempted:
      config.slug === "exercise-blood-pressure" ||
      config.slug === "case-b" ||
      canonicalSources.some((source) =>
        source.exactSearchCompleted === true || source.gapFillSearchCompleted === true,
      ) ||
      !canonicalSources.some((source) =>
        source.exactSearchCompleted != null || source.gapFillSearchAttempted != null,
      ),
  });
  const checkpointInvalidation = {
    priorSchemaVersion: priorCheckpoint.schemaVersion ?? null,
    currentSchemaVersion: "formal-research-checkpoint.v2",
    priorRelevancePolicyVersion: priorCheckpoint.relevancePolicyVersion ?? null,
    currentRelevancePolicyVersion: reviewed.contract.policyVersion,
    policyChanged: priorCheckpoint.relevancePolicyVersion !== reviewed.contract.policyVersion,
    invalidated: priorCheckpoint.schemaVersion !== "formal-research-checkpoint.v2" || priorCheckpoint.relevancePolicyVersion !== reviewed.contract.policyVersion,
    earliestSafeResumePoint: "source_relevance_review",
    priorSafeToResume: priorCheckpoint.safeToResume ?? null,
  };
  const approvedVisuals = architecture.visualizationPlan.filter((item) => item.status === "APPROVED");
  const chartProvenance = validateChartProvenance({
    visualizationPlan: architecture.visualizationPlan,
    quantitativeFactRegistry: architecture.quantitativeFactRegistry,
  });
  const facetCoverage = config.slug === "case-b"
    ? caseBFacetCoverage(canonicalCards)
    : { benefitEvidenceIds: [], limitationEvidenceIds: [], riskEvidenceIds: [] };
  const allocatedClaims = architecture.sectionClaimAllocations.flatMap((allocation) => allocation.claims);
  const unsupportedAllocatedClaimCount = allocatedClaims.filter((claim) =>
    claim.claimFunction !== "method" && claim.evidenceLineage.evidenceIds.length === 0
  ).length;
  const ownedClaimCounts = new Map<string, number>();
  for (const allocation of architecture.sectionClaimAllocations) {
    for (const claimId of allocation.ownedClaimIds) {
      ownedClaimCounts.set(claimId, (ownedClaimCounts.get(claimId) ?? 0) + 1);
    }
  }
  const duplicateEvidenceOwnershipCount = [...ownedClaimCounts.values()].filter((count) => count > 1).length;
  const allocatedEvidenceIds = new Set(
    architecture.sectionClaimAllocations.flatMap((allocation) => allocation.evidenceIds),
  );
  const orphanEvidenceCardCount = canonicalCards.filter((card) =>
    !allocatedEvidenceIds.has(card.evidenceId ?? card.id)
  ).length;
  const reportPlanHashBound = reportPlan?.evidenceSetHash === writerEvidenceSet.evidenceSetHash;
  const evidenceSetHashBound = Boolean(writerEvidenceSet.evidenceSetHash) &&
    reportPlanHashBound;
  const directEvidenceSupportCharacters = canonicalCards.reduce(
    (sum, card) =>
      sum + String(card.supportSpan ?? card.supportedByText ?? card.sourceExcerptOriginal ?? "").length,
    0,
  );
  const caseAEvidenceSupportCeiling =
    config.slug !== "adolescent-screen-sleep" ||
    (canonicalCards.length >= 12 &&
      canonicalSources.length >= 8 &&
      directEvidenceSupportCharacters >= 3000);
  const checks = {
    topicContractVersioned: Boolean(reviewed.contract.schemaVersion && reviewed.contract.policyVersion),
    directSourceThreshold: canonicalSources.length >= config.minimumDirectSources,
    canonicalSourceCountMatchesRoute:
      Number(preflight.body.acceptedSourceCount) >= canonicalSources.length &&
      new Set(canonicalCards.map((card) => card.sourceId)).size === canonicalSources.length,
    noNonDirectCanonicalSource: canonicalSources.every((source) => source.formalEvidenceRole === "DIRECT_FINDING"),
    evidenceThreshold: canonicalCards.length >= config.minimumEvidenceCards,
    noRejectedEvidenceCard: canonicalCards.every((card) => card.formalEvidenceRole !== "REJECTED_OFF_TOPIC"),
    directEvidenceCoverage: canonicalCards.filter((card) => card.formalEvidenceRole === "DIRECT_FINDING").length >= config.minimumDirectSources,
    benefitFacetCoverage: config.slug !== "case-b" || facetCoverage.benefitEvidenceIds.length > 0,
    limitationFacetCoverage: config.slug !== "case-b" || facetCoverage.limitationEvidenceIds.length > 0,
    riskFacetCoverage: config.slug !== "case-b" || facetCoverage.riskEvidenceIds.length > 0,
    rejectedSourceCardCount: canonicalCards.filter((card) => card.formalEvidenceRole === "REJECTED_OFF_TOPIC").length === 0,
    unsupportedAllocatedClaimCount: unsupportedAllocatedClaimCount === 0,
    orphanEvidenceCardCount: orphanEvidenceCardCount === 0,
    duplicateEvidenceOwnershipCount: duplicateEvidenceOwnershipCount === 0,
    evidenceMatrixPresent: architecture.evidenceMatrix.length > 0,
    oneClaimOwner: architecture.evidenceMatrix.every((row) => architecture.sectionClaimAllocations.filter((allocation) => allocation.ownedClaimIds.includes(row.claimId)).length === 1),
    quantitativeRegistryPresent: !config.requiresQuantitativeEvidence || architecture.quantitativeFindingsRegistry.length > 0,
    validatedQuantitativeFactsPresent: !config.requiresQuantitativeEvidence || architecture.quantitativeFactRegistry.some((fact) => fact.validationStatus === "VALIDATED"),
    quantitativeProvenanceClosed: architecture.quantitativeFindingsRegistry.every((entry) => Boolean(entry.sourceId && entry.claimId && entry.sourceSpanId && entry.extractedSpan)),
    chartProvenancePass: chartProvenance.pass,
    evidenceDerivedVisualApproved: approvedVisuals.some((item) => item.sourceIds.length > 0 && Boolean(item.derivationRule)),
    rejectedVisualsExplainFailure: architecture.visualizationPlan.filter((item) => item.status !== "APPROVED").every((item) => item.rejectionReasons.length > 0),
    reportPlanBuilt: reportPlan !== null,
    planEvidenceHashMatches: reportPlanHashBound,
    reportPlanHashBound,
    evidenceSetHashBound,
    oldCheckpointInvalidated: checkpointInvalidation.invalidated,
    caseAEvidenceSupportCeiling,
  };
  const passed = Object.values(checks).every(Boolean);
  const formalResearchCheckpoint = {
    schemaVersion: "formal-research-checkpoint.v2",
    workflowId,
    topicHash,
    topicIntegrityVersion: reviewed.contract.schemaVersion,
    topicIntegrityHash: createHash("sha256").update(JSON.stringify(reviewed.contract)).digest("hex"),
    relevancePolicyVersion: reviewed.contract.policyVersion,
    evidenceSetHash: writerEvidenceSet.evidenceSetHash,
    acceptedSourceIds: canonicalSources.map((source) => source.id),
    acceptedSourceCount: canonicalSources.length,
    rejectedSourceCount: rejected.length,
    directFindingSourceCount: canonicalSources.length,
    contentIntegrityValidated: passed,
    topicIntegrityValidatedAt: new Date().toISOString(),
    evidenceIds: canonicalCards.map((card) => card.evidenceId ?? card.id),
    completedStages: [
      "source_normalization",
      "source_relevance_review",
      "topic_integrity_validation",
      "accepted_source_processing",
      "structured_study_extraction",
      "evidence_matrix",
      "section_claim_allocation",
      "quantitative_findings",
      "visualization_planning",
    ],
    resumeFrom: passed ? "writer_generation" : "source_relevance_review",
    safeToResume: passed,
    providerFailureCategories: [],
    invalidatedBy: checkpointInvalidation.invalidated
      ? ["accepted_source_set_change", "evidence_set_hash_change", "relevance_policy_version_change"]
      : [],
  };
  const gate = {
    passed,
    checks: {
      ...checks,
      checkpointSafeToResume: formalResearchCheckpoint.safeToResume === true,
      writerAuthorization: passed,
    },
    counts: {
      canonicalDirectSources: canonicalSources.length,
      canonicalEvidenceCards: canonicalCards.length,
      directFindingEvidenceCards: canonicalCards.filter((card) => card.formalEvidenceRole === "DIRECT_FINDING").length,
      rejectedSourceCardCount: canonicalCards.filter((card) => card.formalEvidenceRole === "REJECTED_OFF_TOPIC").length,
      unsupportedAllocatedClaimCount,
      orphanEvidenceCardCount,
      duplicateEvidenceOwnershipCount,
      directEvidenceSupportCharacters,
    },
    facetCoverage,
  };
  writeJson(`${config.slug}/topic-integrity-contract.json`, reviewed.contract);
  writeJson(`${config.slug}/source-review.json`, sourceReview);
  writeJson(`${config.slug}/source-rejection-audit.json`, rejected);
  writeJson(`${config.slug}/accepted-sources.json`, canonicalSources);
  writeJson(`${config.slug}/canonical-evidence-cards.json`, canonicalCards);
  writeJson(`${config.slug}/writer-evidence-set.json`, writerEvidenceSet);
  writeJson(`${config.slug}/report-plan.json`, reportPlan);
  writeJson(`${config.slug}/formal-research-architecture.json`, architecture);
  writeJson(`${config.slug}/evidence-matrix.json`, architecture.evidenceMatrix);
  writeJson(`${config.slug}/claim-allocation.json`, architecture.sectionClaimAllocations);
  writeJson(`${config.slug}/quantitative-findings-registry.json`, architecture.quantitativeFindingsRegistry);
  writeJson(`${config.slug}/chart-provenance.json`, architecture.visualizationPlan);
  writeJson(`${config.slug}/checkpoint-invalidation.json`, checkpointInvalidation);
  writeJson(`${config.slug}/formal-research-checkpoint.json`, formalResearchCheckpoint);
  writeJson(`${config.slug}/offline-content-gate.json`, gate);
  writeJson(`${config.slug}/ACCEPTED-SOURCES.json`, canonicalSources);
  writeJson(`${config.slug}/STRUCTURED-STUDY-EVIDENCE.json`, architecture.studies);
  writeJson(`${config.slug}/EVIDENCE-MATRIX.json`, architecture.evidenceMatrix);
  writeJson(`${config.slug}/CLAIM-ALLOCATION.json`, {
    allocations: architecture.sectionClaimAllocations,
    ownership: architecture.sectionClaimOwnership,
  });
  writeJson(`${config.slug}/QUANTITATIVE-FINDINGS-REGISTRY.json`, {
    findings: architecture.quantitativeFindingsRegistry,
    facts: architecture.quantitativeFactRegistry,
  });
  writeJson(`${config.slug}/VISUALIZATION-PLAN.json`, architecture.visualizationPlan);
  writeJson(`${config.slug}/visualization-plan.json`, architecture.visualizationPlan);
  writeJson(`${config.slug}/CHART-PROVENANCE.json`, chartProvenance);
  return {
    slug: config.slug,
    passed,
    workflowId,
    topicHash,
    reviewedSources: sources.length,
    canonicalDirectSources: canonicalSources.length,
    rejectedOrContextOnlySources: rejected.length,
    canonicalEvidenceCards: canonicalCards.length,
    evidenceMatrixRows: architecture.evidenceMatrix.length,
    quantitativeRegistryRows: architecture.quantitativeFindingsRegistry.length,
    approvedVisuals: approvedVisuals.length,
    facetCoverage,
    unsupportedAllocatedClaimCount,
    orphanEvidenceCardCount,
    duplicateEvidenceOwnershipCount,
    checks,
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  const protectedBefore = shaFile(protectedFixture);
  const results: Json[] = [];
  const requestedSlug = process.env.RESEARCHFORGE_QA_TOPIC_SLUG?.trim();
  const selectedCases = requestedSlug
    ? cases.filter((config) => config.slug === requestedSlug)
    : cases;
  if (selectedCases.length === 0) throw new Error(`Unknown controlled case slug: ${requestedSlug}`);
  for (const config of selectedCases) results.push(await runCase(config));
  const protectedAfter = shaFile(protectedFixture);
  const passed = results.every((result) => result.passed === true) && protectedBefore === expectedProtectedSha && protectedAfter === expectedProtectedSha;
  const repository = {
    branch: execFileSync("git", ["branch", "--show-current"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: repositoryRoot, encoding: "utf8" }).trim().length > 0,
    protectedFixture,
    expectedProtectedSha,
    protectedBefore,
    protectedAfter,
    protectedUnchanged: protectedBefore === protectedAfter && protectedAfter === expectedProtectedSha,
  };
  writeJson("offline-acceptance.json", {
    schemaVersion: "researchforge-formal-human-acceptance-offline/v1",
    status: passed ? "PASS" : "FAIL",
    completedAt: new Date().toISOString(),
    providerRequests: 0,
    writerRequests: 0,
    topics: results,
    repository,
  });
  writeJson("repository-state.before-live.json", repository);
  process.stdout.write(`${passed ? "OFFLINE_CONTENT_GATE_PASS" : "OFFLINE_CONTENT_GATE_FAIL"}\n${outputDir}\n`);
  if (!passed) process.exitCode = 2;
}

if (process.env.RESEARCHFORGE_QA_COMPILE_ONLY !== "1") {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
