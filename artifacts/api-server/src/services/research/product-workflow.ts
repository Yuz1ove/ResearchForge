import { createHash } from "node:crypto";
import { Pool } from "pg";
import {
  AcceptedEvidenceSetV1Schema,
  type CreateResearchProductProjectRequest,
  type DocumentRecordV1,
  type EditWorkflowSectionRequest,
  type EntityProvenance,
  type EvidenceDecisionInput,
  type EvidenceDecisionV1,
  type ExportArtifactV1,
  type GeneratedClaimV1,
  type GenerationRunV1,
  type ParsedBlockV1,
  ProductReportPlanV1Schema,
  RESEARCH_PRODUCT_WORKFLOW_SCHEMA_VERSION,
  ResearchProductExportResponseSchema,
  ResearchProductWorkflowSnapshotV1Schema,
  type ResearchProductExportResponse,
  type ResearchProductWorkflowSnapshotV1,
  type ResearchQuestionInput,
  type ResearchQuestionV1,
  type SearchQueryV1,
  type SourceCandidateInput,
  type SourceCandidateV1,
  type SourceRecordV1,
  type VerificationResultV1,
  type WorkflowEvidenceCardInput,
  type WorkflowEvidenceCardV1,
  type WorkflowSectionInput,
} from "@workspace/api-zod/research-product-workflow";
import { logger } from "../../lib/logger";
import { safeJsonParse } from "../llm-adapter";
import { requestLlmText } from "../llm-service";

const PRODUCT_WORKFLOW_ENGINE_VERSION = "r23.1";
const DETERMINISTIC_GENERATOR = "researchforge.deterministic-evidence-synthesis";
const DETERMINISTIC_VERIFIER = "researchforge.binding-verifier";

export class ProductWorkflowError extends Error {
  readonly code:
    | "PROJECT_NOT_FOUND"
    | "STORE_NOT_CONFIGURED"
    | "INVALID_TRANSITION"
    | "EVIDENCE_REVIEW_REQUIRED"
    | "REPORT_PLAN_REQUIRED"
    | "GENERATION_FAILED"
    | "EXPORT_BLOCKED"
    | "ENTITY_NOT_FOUND";
  readonly status: number;

  constructor(
    code: ProductWorkflowError["code"],
    message: string,
    status = 409,
  ) {
    super(message);
    this.name = "ProductWorkflowError";
    this.code = code;
    this.status = status;
  }
}

export interface ProductWorkflowClock {
  now(): string;
}

const systemClock: ProductWorkflowClock = {
  now: () => new Date().toISOString(),
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function entityId(prefix: string, ...identity: string[]): string {
  return `${prefix}_${sha256(identity.join("\u001f")).slice(0, 24)}`;
}

function provenance(
  snapshotMode: ResearchProductWorkflowSnapshotV1["project"]["mode"],
  now: string,
  producer: string,
  parentRefs: string[] = [],
): EntityProvenance {
  return {
    mode: snapshotMode,
    producer,
    producerVersion: PRODUCT_WORKFLOW_ENGINE_VERSION,
    parentRefs,
    generatedAt: now,
  };
}

function queryBudget(depth: CreateResearchProductProjectRequest["depth"]): number {
  if (depth === "quick") return 8;
  if (depth === "deep") return 24;
  return 16;
}

const DEFAULT_QUESTION_PURPOSES = [
  ["定義與範圍", "界定核心概念、術語與研究邊界。"],
  ["目前方法", "整理目前常用方法、流程與實作途徑。"],
  ["工具與架構比較", "比較技術、工具或架構的適用情境。"],
  ["評估與成效", "辨識可驗證的評估指標、成果與限制。"],
  ["限制與風險", "整理證據限制、衝突、偏誤與風險。"],
  ["實務建議", "在證據允許的範圍內形成可追溯建議。"],
] as const;

function createQuestions(input: {
  projectId: string;
  topic: string;
  mode: ResearchProductWorkflowSnapshotV1["project"]["mode"];
  now: string;
}): ResearchQuestionV1[] {
  return DEFAULT_QUESTION_PURPOSES.map(([label, purpose], order) => {
    const id = entityId("rq", input.projectId, label);
    return {
      id,
      projectId: input.projectId,
      version: 1,
      text: `${input.topic}的${label}是什麼？`,
      purpose,
      order,
      status: "active",
      origin: "deterministic_decomposition",
      createdAt: input.now,
      updatedAt: input.now,
      provenance: provenance(input.mode, input.now, "research-decomposition.v1", [
        input.projectId,
      ]),
    };
  });
}

function createQueries(input: {
  projectId: string;
  topic: string;
  language: string;
  questions: ResearchQuestionV1[];
  budget: number;
  mode: ResearchProductWorkflowSnapshotV1["project"]["mode"];
  now: string;
}): SearchQueryV1[] {
  const candidates = input.questions
    .filter((question) => question.status === "active")
    .flatMap((question, index) => [
      {
        question,
        query: index === 0 ? input.topic : `${input.topic} ${question.text}`,
        origin: index === 0 ? "exact_keyword" : "narrower_subtopic",
        priority: Math.max(50, 100 - index * 5),
      },
      {
        question,
        query: `"${input.topic}" ${question.purpose}`,
        origin: "technical_term",
        priority: Math.max(40, 85 - index * 5),
      },
    ])
    .slice(0, input.budget);

  return candidates.map((candidate, order) => ({
    id: entityId("query", input.projectId, candidate.question.id, String(order)),
    projectId: input.projectId,
    researchQuestionId: candidate.question.id,
    query: candidate.query,
    origin: candidate.origin as SearchQueryV1["origin"],
    language: input.language,
    providerTarget: "all",
    priority: candidate.priority,
    status: "planned",
    createdAt: input.now,
    updatedAt: input.now,
    provenance: provenance(input.mode, input.now, "bounded-query-expansion.v1", [
      candidate.question.id,
    ]),
  }));
}

function transition(
  snapshot: ResearchProductWorkflowSnapshotV1,
  nextState: ResearchProductWorkflowSnapshotV1["project"]["status"],
  reason: string,
  now: string,
): ResearchProductWorkflowSnapshotV1 {
  const from = snapshot.project.status;
  return {
    ...snapshot,
    project: {
      ...snapshot.project,
      status: nextState,
      version: snapshot.project.version + 1,
      updatedAt: now,
    },
    events: [
      ...snapshot.events,
      {
        id: entityId(
          "event",
          snapshot.project.id,
          String(snapshot.events.length + 1),
          nextState,
        ),
        projectId: snapshot.project.id,
        from,
        to: nextState,
        reason,
        occurredAt: now,
      },
    ],
  };
}

function parsed(
  snapshot: ResearchProductWorkflowSnapshotV1,
): ResearchProductWorkflowSnapshotV1 {
  return ResearchProductWorkflowSnapshotV1Schema.parse(snapshot);
}

export function createResearchProductWorkflow(
  raw: CreateResearchProductProjectRequest,
  options: { clock?: ProductWorkflowClock; projectId?: string; workflowId?: string } = {},
): ResearchProductWorkflowSnapshotV1 {
  const clock = options.clock ?? systemClock;
  const now = clock.now();
  const identity = `${raw.topic}|${raw.reportType}|${now}`;
  const projectId = options.projectId ?? entityId("project", identity);
  const workflowId = options.workflowId ?? entityId("workflow", projectId);
  const budget = queryBudget(raw.depth);
  const questions = createQuestions({
    projectId,
    topic: raw.topic,
    mode: raw.mode,
    now,
  });
  const queries = createQueries({
    projectId,
    topic: raw.topic,
    language: raw.targetLanguage,
    questions,
    budget,
    mode: raw.mode,
    now,
  });
  const rootProvenance = provenance(raw.mode, now, "product-workflow.create.v1");

  return parsed({
    project: {
      id: projectId,
      workflowId,
      schemaVersion: RESEARCH_PRODUCT_WORKFLOW_SCHEMA_VERSION,
      version: 1,
      status: "DRAFT",
      mode: raw.mode,
      createdAt: now,
      updatedAt: now,
      provenance: rootProvenance,
    },
    intent: {
      id: entityId("intent", projectId),
      projectId,
      version: 1,
      topic: raw.topic,
      reportType: raw.reportType,
      targetAudience: raw.targetAudience,
      targetLanguage: raw.targetLanguage,
      depth: raw.depth,
      timeframe: raw.timeframe,
      sourceConstraints: raw.sourceConstraints,
      preferredDisciplines: raw.preferredDisciplines,
      excludedSourceCategories: raw.excludedSourceCategories,
      expectedOutputFormats: raw.expectedOutputFormats,
      createdAt: now,
      updatedAt: now,
      provenance: rootProvenance,
    },
    questions,
    queries,
    sourceCandidates: [],
    sources: [],
    documents: [],
    parsedBlocks: [],
    evidenceCards: [],
    evidenceDecisions: [],
    acceptedEvidenceSet: null,
    reportPlan: null,
    generationRuns: [],
    generatedClaims: [],
    citationBindings: [],
    verificationResults: [],
    sectionContent: {},
    revisions: [],
    exports: [],
    failures: [],
    events: [
      {
        id: entityId("event", projectId, "1", "DRAFT"),
        projectId,
        from: null,
        to: "DRAFT",
        reason: "project_created",
        occurredAt: now,
      },
    ],
    diagnostics: {
      queryBudget: budget,
      stageTimingsMs: { intake: 0, decomposition: 0, query_expansion: 0 },
      providerFailures: [],
      warnings: [
        "Research questions and deterministic queries are editable before discovery.",
      ],
    },
  });
}

export function replaceResearchQuestions(
  snapshot: ResearchProductWorkflowSnapshotV1,
  questionInputs: ResearchQuestionInput[],
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  const now = clock.now();
  const previousById = new Map(snapshot.questions.map((question) => [question.id, question]));
  const questions: ResearchQuestionV1[] = questionInputs.map((input, order) => {
    const id = input.id ?? entityId("rq", snapshot.project.id, input.text, String(order));
    const previous = previousById.get(id);
    return {
      id,
      projectId: snapshot.project.id,
      version: (previous?.version ?? 0) + 1,
      text: input.text,
      purpose: input.purpose,
      order,
      status: input.status,
      origin: "user",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      provenance: provenance(snapshot.project.mode, now, "research-decomposition.user.v1", [
        snapshot.intent.id,
      ]),
    };
  });
  const queries = createQueries({
    projectId: snapshot.project.id,
    topic: snapshot.intent.topic,
    language: snapshot.intent.targetLanguage,
    questions,
    budget: snapshot.diagnostics.queryBudget,
    mode: snapshot.project.mode,
    now,
  });
  return parsed(
    transition(
      {
        ...snapshot,
        questions,
        queries,
        reportPlan: null,
        generationRuns: [],
        generatedClaims: [],
        citationBindings: [],
        verificationResults: [],
        sectionContent: {},
      },
      "DRAFT",
      "research_questions_replaced",
      now,
    ),
  );
}

function normalizeDoi(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "")
    .replace(/^doi:\s*/u, "");
  return normalized || null;
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
}

function canonicalSourceKey(candidate: SourceCandidateV1): string {
  const doi = normalizeDoi(candidate.doi);
  if (doi) return `doi:${doi}`;
  const title = normalizeTitle(candidate.title);
  const author = normalizeTitle(candidate.authors[0] ?? "unknown");
  return `metadata:${sha256(`${title}|${author}|${candidate.year ?? "unknown"}`)}`;
}

function metadataCompleteness(candidate: SourceCandidateV1): number {
  const values = [
    candidate.title,
    candidate.authors.length ? candidate.authors : null,
    candidate.year,
    candidate.venue,
    candidate.doi ?? candidate.url,
    candidate.abstract,
    candidate.language,
    candidate.publisher,
  ];
  return values.filter((value) => value !== null && value !== "").length / values.length;
}

function sourceRecordForGroup(
  snapshot: ResearchProductWorkflowSnapshotV1,
  candidates: SourceCandidateV1[],
  now: string,
): SourceRecordV1 {
  const ordered = [...candidates].sort((left, right) => {
    const leftCompleteness = metadataCompleteness(left);
    const rightCompleteness = metadataCompleteness(right);
    return rightCompleteness - leftCompleteness || right.relevance - left.relevance;
  });
  const primary = ordered[0]!;
  const canonicalKey = canonicalSourceKey(primary);
  const traceable = Boolean(primary.doi || primary.url || primary.providerId);
  const hasContent = Boolean(primary.abstract);
  const averageRelevance =
    ordered.reduce((sum, candidate) => sum + candidate.relevance, 0) / ordered.length;
  let admissionStatus: SourceRecordV1["admissionStatus"] = "ACCEPTED";
  const reasons: string[] = [];
  if (averageRelevance < 0.45) {
    admissionStatus = "REJECTED_LOW_RELEVANCE";
    reasons.push("relevance_below_0.45");
  } else if (!traceable) {
    admissionStatus = "REJECTED_UNVERIFIABLE";
    reasons.push("no_doi_url_or_provider_identifier");
  } else if (!hasContent) {
    admissionStatus = "METADATA_ONLY";
    reasons.push("no_abstract_or_acquired_fulltext");
  } else {
    reasons.push("traceable_relevant_content_available");
  }
  if (ordered.length > 1) reasons.push("provider_records_deduplicated");
  const duplicateGroupId =
    ordered.length > 1 ? entityId("duplicate", snapshot.project.id, canonicalKey) : null;

  return {
    id: entityId("source", snapshot.project.id, canonicalKey),
    projectId: snapshot.project.id,
    version: 1,
    canonicalKey,
    mergedCandidateIds: ordered.map((candidate) => candidate.id),
    duplicateGroupId,
    title: primary.title,
    authors: primary.authors,
    year: primary.year,
    venue: primary.venue,
    doi: normalizeDoi(primary.doi),
    url: primary.url,
    abstract: primary.abstract,
    language: primary.language,
    sourceType: primary.sourceType,
    publisher: primary.publisher,
    license: primary.license,
    admissionStatus,
    admissionReasons: reasons,
    quality: {
      authority: Math.max(...ordered.map((candidate) => candidate.authority)),
      relevance: averageRelevance,
      recency: null,
      metadataCompleteness: metadataCompleteness(primary),
      peerReviewStatus:
        /journal|conference/iu.test(primary.sourceType) ? "unknown" : "not_peer_reviewed",
      openAccessStatus:
        primary.openAccess === true
          ? "open"
          : primary.openAccess === false
            ? "restricted"
            : "unknown",
      sourceIntegrity: traceable ? "traceable" : "unverifiable",
      independence: "unknown",
      conflictStatus: "unknown",
    },
    createdAt: now,
    updatedAt: now,
    provenance: provenance(snapshot.project.mode, now, "source-normalization-dedupe.v1", [
      ...ordered.map((candidate) => candidate.id),
    ]),
  };
}

function documentsAndBlocks(
  snapshot: ResearchProductWorkflowSnapshotV1,
  sources: SourceRecordV1[],
  now: string,
): { documents: DocumentRecordV1[]; parsedBlocks: ParsedBlockV1[] } {
  const documents: DocumentRecordV1[] = [];
  const parsedBlocks: ParsedBlockV1[] = [];
  for (const source of sources) {
    const documentId = entityId("document", snapshot.project.id, source.id, "provider-record");
    const hasAbstract = Boolean(source.abstract);
    documents.push({
      id: documentId,
      projectId: snapshot.project.id,
      sourceId: source.id,
      version: 1,
      accessStatus: hasAbstract ? "ABSTRACT_ONLY" : "METADATA_ONLY",
      mediaType: hasAbstract ? "text/plain; profile=abstract" : null,
      contentRef: hasAbstract ? `source:${source.id}#abstract` : null,
      contentHash: hasAbstract ? sha256(source.abstract!) : null,
      rights: source.license ? "permitted" : "unknown",
      acquisitionStatus: hasAbstract ? "available" : "not_requested",
      acquiredAt: hasAbstract ? now : null,
      createdAt: now,
      updatedAt: now,
      provenance: provenance(snapshot.project.mode, now, "document-acquisition.adapter.v1", [
        source.id,
      ]),
    });
    if (hasAbstract) {
      parsedBlocks.push({
        id: entityId("block", documentId, "abstract"),
        projectId: snapshot.project.id,
        documentId,
        blockType: "abstract",
        text: source.abstract!,
        page: null,
        section: "abstract",
        startOffset: 0,
        endOffset: source.abstract!.length,
        extractor: "provider-abstract-adapter",
        extractorVersion: PRODUCT_WORKFLOW_ENGINE_VERSION,
        createdAt: now,
        provenance: provenance(snapshot.project.mode, now, "parsed-block.adapter.v1", [
          documentId,
        ]),
      });
    }
  }
  return { documents, parsedBlocks };
}

export function registerSourceCandidates(
  snapshot: ResearchProductWorkflowSnapshotV1,
  inputs: SourceCandidateInput[],
  options: { providerFailures?: string[]; clock?: ProductWorkflowClock } = {},
): ResearchProductWorkflowSnapshotV1 {
  const clock = options.clock ?? systemClock;
  const now = clock.now();
  const candidates: SourceCandidateV1[] = inputs.map((input) => ({
    ...input,
    projectId: snapshot.project.id,
    doi: normalizeDoi(input.doi),
    retrievedAt: now,
    provenance: provenance(snapshot.project.mode, now, "provider-adapter.v1", [
      ...input.queryIds,
      input.providerRawRef,
    ]),
  }));
  const groups = new Map<string, SourceCandidateV1[]>();
  for (const candidate of candidates) {
    const key = canonicalSourceKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const sources = [...groups.values()].map((group) =>
    sourceRecordForGroup(snapshot, group, now),
  );
  const { documents, parsedBlocks } = documentsAndBlocks(snapshot, sources, now);
  const next = {
    ...snapshot,
    sourceCandidates: candidates,
    sources,
    documents,
    parsedBlocks,
    evidenceCards: [],
    evidenceDecisions: [],
    acceptedEvidenceSet: null,
    reportPlan: null,
    generationRuns: [],
    generatedClaims: [],
    citationBindings: [],
    verificationResults: [],
    sectionContent: {},
    diagnostics: {
      ...snapshot.diagnostics,
      providerFailures: options.providerFailures ?? [],
      warnings: [
        ...snapshot.diagnostics.warnings.filter(
          (warning) => !warning.startsWith("provider_failure:"),
        ),
        ...(options.providerFailures ?? []).map((failure) => `provider_failure:${failure}`),
      ],
    },
  };
  return parsed(
    transition(
      next,
      sources.length > 0 ? "SOURCES_FOUND" : "FAILED_RECOVERABLE",
      sources.length > 0 ? "sources_normalized_and_deduplicated" : "no_sources_found",
      now,
    ),
  );
}

export function registerEvidenceCards(
  snapshot: ResearchProductWorkflowSnapshotV1,
  inputs: WorkflowEvidenceCardInput[],
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  const now = clock.now();
  const sourceIds = new Set(snapshot.sources.map((source) => source.id));
  const documentIds = new Set(snapshot.documents.map((document) => document.id));
  const blockIds = new Set(snapshot.parsedBlocks.map((block) => block.id));
  const evidenceCards: WorkflowEvidenceCardV1[] = inputs.map((input) => {
    if (!sourceIds.has(input.sourceId)) {
      throw new ProductWorkflowError(
        "ENTITY_NOT_FOUND",
        `Evidence card ${input.id} references unknown source ${input.sourceId}.`,
        400,
      );
    }
    if (input.documentId && !documentIds.has(input.documentId)) {
      throw new ProductWorkflowError(
        "ENTITY_NOT_FOUND",
        `Evidence card ${input.id} references unknown document ${input.documentId}.`,
        400,
      );
    }
    if (input.blockId && !blockIds.has(input.blockId)) {
      throw new ProductWorkflowError(
        "ENTITY_NOT_FOUND",
        `Evidence card ${input.id} references unknown parsed block ${input.blockId}.`,
        400,
      );
    }
    const hasTraceableSpan = Boolean(input.blockId || input.documentId);
    return {
      ...input,
      projectId: snapshot.project.id,
      workflowId: snapshot.project.workflowId,
      version: 1,
      status: hasTraceableSpan ? "pending" : "needs_review",
      qualityNotes: [
        ...input.qualityNotes,
        ...(!hasTraceableSpan ? ["missing_document_or_block_lineage"] : []),
      ],
      createdAt: now,
      updatedAt: now,
      provenance: provenance(snapshot.project.mode, now, "evidence-card.adapter.v1", [
        input.sourceId,
        ...(input.documentId ? [input.documentId] : []),
        ...(input.blockId ? [input.blockId] : []),
      ]),
    };
  });
  return parsed(
    transition(
      {
        ...snapshot,
        evidenceCards,
        evidenceDecisions: [],
        acceptedEvidenceSet: null,
        reportPlan: null,
      },
      "EVIDENCE_REVIEW_REQUIRED",
      "evidence_cards_registered",
      now,
    ),
  );
}

export function reviewEvidenceCards(
  snapshot: ResearchProductWorkflowSnapshotV1,
  inputs: EvidenceDecisionInput[],
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  const now = clock.now();
  const cardsById = new Map(snapshot.evidenceCards.map((card) => [card.id, card]));
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const latestDecision = new Map<string, EvidenceDecisionInput>();
  for (const input of inputs) latestDecision.set(input.evidenceCardId, input);
  const decisions: EvidenceDecisionV1[] = [...latestDecision.values()].map((input) => {
    const card = cardsById.get(input.evidenceCardId);
    if (!card) {
      throw new ProductWorkflowError(
        "ENTITY_NOT_FOUND",
        `Unknown evidence card ${input.evidenceCardId}.`,
        400,
      );
    }
    const source = sourcesById.get(card.sourceId);
    const cannotAccept =
      !source ||
      source.admissionStatus.startsWith("REJECTED_") ||
      !card.documentId ||
      !card.blockId;
    const decision = input.decision === "accepted" && cannotAccept
      ? "needs_review"
      : input.decision;
    return {
      id: entityId("decision", snapshot.project.id, card.id, now),
      projectId: snapshot.project.id,
      evidenceCardId: card.id,
      decision,
      reason:
        decision === input.decision
          ? input.reason
          : `${input.reason}; policy_downgrade_missing_traceable_admitted_source`,
      note: input.note,
      tags: input.tags,
      decidedBy: input.decidedBy,
      createdAt: now,
      provenance: provenance(snapshot.project.mode, now, "evidence-review.v1", [card.id]),
    };
  });
  const decisionByCard = new Map(decisions.map((decision) => [decision.evidenceCardId, decision]));
  const evidenceCards = snapshot.evidenceCards.map((card) => ({
    ...card,
    status: decisionByCard.get(card.id)?.decision ?? card.status,
    version: decisionByCard.has(card.id) ? card.version + 1 : card.version,
    updatedAt: decisionByCard.has(card.id) ? now : card.updatedAt,
  }));
  const acceptedIds = evidenceCards
    .filter((card) => card.status === "accepted")
    .map((card) => card.id)
    .sort();
  const acceptedEvidenceSet = AcceptedEvidenceSetV1Schema.parse({
    id: entityId("evidence_set", snapshot.project.id, String(snapshot.project.version + 1)),
    projectId: snapshot.project.id,
    version: (snapshot.acceptedEvidenceSet?.version ?? 0) + 1,
    evidenceCardIds: acceptedIds,
    evidenceSetHash: sha256(stableJson(acceptedIds)),
    createdAt: now,
    provenance: provenance(snapshot.project.mode, now, "accepted-evidence-set.v1", [
      ...decisions.map((decision) => decision.id),
    ]),
  });
  return parsed(
    transition(
      {
        ...snapshot,
        evidenceCards,
        evidenceDecisions: decisions,
        acceptedEvidenceSet,
        reportPlan: null,
        generationRuns: [],
        generatedClaims: [],
        citationBindings: [],
        verificationResults: [],
        sectionContent: {},
      },
      acceptedIds.length > 0 ? "EVIDENCE_REVIEW_REQUIRED" : "EVIDENCE_REVIEW_REQUIRED",
      acceptedIds.length > 0
        ? "accepted_evidence_set_materialized"
        : "no_evidence_accepted",
      now,
    ),
  );
}

function defaultSections(snapshot: ResearchProductWorkflowSnapshotV1): WorkflowSectionInput[] {
  return snapshot.questions
    .filter((question) => question.status === "active")
    .map((question) => ({
      id: entityId("section", snapshot.project.id, question.id),
      title: question.text.replace(/[？?]$/u, ""),
      purpose: question.purpose,
      researchQuestionIds: [question.id],
      requiredEvidenceIds: [],
      optionalEvidenceIds: [],
    }));
}

export function buildProductReportPlan(
  snapshot: ResearchProductWorkflowSnapshotV1,
  requestedSections?: WorkflowSectionInput[],
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  if (!snapshot.acceptedEvidenceSet) {
    throw new ProductWorkflowError(
      "EVIDENCE_REVIEW_REQUIRED",
      "An accepted evidence set is required before report planning.",
    );
  }
  const now = clock.now();
  const acceptedIds = new Set(snapshot.acceptedEvidenceSet.evidenceCardIds);
  const acceptedCards = snapshot.evidenceCards.filter((card) => acceptedIds.has(card.id));
  const sections = (requestedSections ?? defaultSections(snapshot)).map((section, order) => {
    const hinted = acceptedCards
      .filter(
        (card) =>
          card.sectionHints.includes(section.id) ||
          card.researchQuestionIds.some((id) => section.researchQuestionIds.includes(id)),
      )
      .map((card) => card.id);
    const requiredEvidenceIds = section.requiredEvidenceIds.filter((id) => acceptedIds.has(id));
    const optionalEvidenceIds = section.optionalEvidenceIds.filter((id) => acceptedIds.has(id));
    const candidateEvidenceIds = [...new Set([
      ...requiredEvidenceIds,
      ...optionalEvidenceIds,
      ...hinted,
    ])];
    return {
      id: section.id,
      projectId: snapshot.project.id,
      title: section.title,
      purpose: section.purpose,
      order,
      researchQuestionIds: section.researchQuestionIds,
      candidateEvidenceIds,
      requiredEvidenceIds,
      optionalEvidenceIds,
      status: candidateEvidenceIds.length > 0 ? "ready" : "evidence_gap",
      createdAt: now,
      updatedAt: now,
      provenance: provenance(snapshot.project.mode, now, "evidence-bound-report-plan.v1", [
        snapshot.acceptedEvidenceSet!.id,
      ]),
    } as const;
  });
  const hasGaps = sections.some((section) => section.status === "evidence_gap");
  const reportPlan = ProductReportPlanV1Schema.parse({
    id: entityId("report_plan", snapshot.project.id, snapshot.acceptedEvidenceSet.id),
    projectId: snapshot.project.id,
    acceptedEvidenceSetId: snapshot.acceptedEvidenceSet.id,
    version: (snapshot.reportPlan?.version ?? 0) + 1,
    sections,
    status: hasGaps ? "evidence_gaps" : "ready",
    createdAt: snapshot.reportPlan?.createdAt ?? now,
    updatedAt: now,
    provenance: provenance(snapshot.project.mode, now, "evidence-bound-report-plan.v1", [
      snapshot.acceptedEvidenceSet.id,
    ]),
  });
  return parsed(
    transition(
      { ...snapshot, reportPlan },
      "PLAN_READY",
      hasGaps ? "report_plan_ready_with_visible_evidence_gaps" : "report_plan_ready",
      now,
    ),
  );
}

export function generateEvidenceBoundSections(
  snapshot: ResearchProductWorkflowSnapshotV1,
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  if (!snapshot.reportPlan || !snapshot.acceptedEvidenceSet) {
    throw new ProductWorkflowError(
      "REPORT_PLAN_REQUIRED",
      "A report plan and accepted evidence set are required before generation.",
    );
  }
  const now = clock.now();
  const acceptedIds = new Set(snapshot.acceptedEvidenceSet.evidenceCardIds);
  const cardsById = new Map(snapshot.evidenceCards.map((card) => [card.id, card]));
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const generationRuns: GenerationRunV1[] = [];
  const generatedClaims: GeneratedClaimV1[] = [];
  const citationBindings: ResearchProductWorkflowSnapshotV1["citationBindings"] = [];
  const sectionContent: Record<string, string> = {};
  const sections = snapshot.reportPlan.sections.map((section) => {
    const evidenceIds = section.candidateEvidenceIds.filter((id) => acceptedIds.has(id));
    const runId = entityId("generation", snapshot.project.id, section.id, String(snapshot.reportPlan!.version));
    if (evidenceIds.length === 0) {
      generationRuns.push({
        id: runId,
        projectId: snapshot.project.id,
        reportPlanId: snapshot.reportPlan!.id,
        sectionId: section.id,
        evidenceIds: [],
        provider: "deterministic",
        model: DETERMINISTIC_GENERATOR,
        modelVersion: PRODUCT_WORKFLOW_ENGINE_VERSION,
        promptTemplateVersion: "SECTION_SYNTHESIS_PROMPT.v1",
        status: "blocked",
        output: "",
        error: "EVIDENCE_REVIEW_REQUIRED",
        startedAt: now,
        completedAt: now,
        provenance: provenance(snapshot.project.mode, now, DETERMINISTIC_GENERATOR, [
          section.id,
        ]),
      });
      sectionContent[section.id] = "";
      return { ...section, status: "evidence_gap" as const, updatedAt: now };
    }

    const sectionClaims: string[] = [];
    for (const [index, evidenceId] of evidenceIds.entries()) {
      const card = cardsById.get(evidenceId);
      if (!card || card.status !== "accepted") continue;
      const source = sourcesById.get(card.sourceId);
      if (!source) continue;
      const claimId = entityId("claim", runId, card.id);
      const bindingId = entityId("citation", claimId, card.id);
      const marker = `[${citationBindings.length + 1}]`;
      const claimText = `${card.claimText} ${marker}`;
      citationBindings.push({
        id: bindingId,
        projectId: snapshot.project.id,
        claimId,
        evidenceCardId: card.id,
        sourceId: source.id,
        documentId: card.documentId,
        blockId: card.blockId,
        marker,
        createdAt: now,
        provenance: provenance(snapshot.project.mode, now, "citation-binding.v1", [
          card.id,
          source.id,
        ]),
      });
      generatedClaims.push({
        id: claimId,
        projectId: snapshot.project.id,
        generationRunId: runId,
        sectionId: section.id,
        claimText: card.claimText,
        evidenceIds: [card.id],
        citationBindingIds: [bindingId],
        status: "generated",
        createdAt: now,
        updatedAt: now,
        provenance: provenance(snapshot.project.mode, now, DETERMINISTIC_GENERATOR, [
          card.id,
        ]),
      });
      sectionClaims.push(claimText);
      if (index === evidenceIds.length - 1 && card.limitations.length > 0) {
        sectionClaims.push(`限制：${card.limitations.join("；")}。`);
      }
    }
    const output = sectionClaims.join("\n\n");
    sectionContent[section.id] = output;
    generationRuns.push({
      id: runId,
      projectId: snapshot.project.id,
      reportPlanId: snapshot.reportPlan!.id,
      sectionId: section.id,
      evidenceIds,
      provider: "deterministic",
      model: DETERMINISTIC_GENERATOR,
      modelVersion: PRODUCT_WORKFLOW_ENGINE_VERSION,
      promptTemplateVersion: "SECTION_SYNTHESIS_PROMPT.v1",
      status: "completed",
      output,
      error: null,
      startedAt: now,
      completedAt: now,
      provenance: provenance(snapshot.project.mode, now, DETERMINISTIC_GENERATOR, [
        section.id,
        ...evidenceIds,
      ]),
    });
    return { ...section, status: "generated" as const, updatedAt: now };
  });
  if (generatedClaims.length === 0) {
    throw new ProductWorkflowError(
      "EVIDENCE_REVIEW_REQUIRED",
      "No section has accepted traceable evidence; generation failed closed.",
    );
  }
  const reportPlan = { ...snapshot.reportPlan, sections, status: "generated" as const, updatedAt: now };
  return parsed(
    transition(
      {
        ...snapshot,
        reportPlan,
        generationRuns,
        generatedClaims,
        citationBindings,
        verificationResults: [],
        sectionContent,
      },
      "VERIFYING",
      "evidence_bound_sections_generated",
      now,
    ),
  );
}

export interface LiveEvidenceSectionRequest {
  requestId: string;
  topic: string;
  targetLanguage: string;
  sections: Array<{
    sectionId: string;
    title: string;
    allowedOutput: string;
    evidenceIds: string[];
  }>;
}

export interface LiveEvidenceSectionResponse {
  provider: string;
  model: string;
  sections: Array<{ sectionId: string; content: string }>;
}

export type LiveEvidenceSectionRequester = (
  request: LiveEvidenceSectionRequest,
) => Promise<LiveEvidenceSectionResponse>;

async function requestLiveEvidenceSections(
  request: LiveEvidenceSectionRequest,
): Promise<LiveEvidenceSectionResponse> {
  const response = await requestLlmText({
    operation: "report_generation",
    featureName: "research_product_evidence_section_generation",
    purpose: "report_writer",
    temperature: 0,
    maxTokens: 6_000,
    responseFormat: "json_object",
    messages: [
      {
        role: "system",
        content: [
          "You are the live ResearchForge evidence-bound section generator.",
          "Return valid JSON only, with no markdown fence.",
          "For safety, copy every allowedOutput exactly; do not paraphrase, translate, add, remove, reorder, or invent any text or citation marker.",
          "Return every section exactly once.",
          'Schema: {"sections":[{"sectionId":"same id","content":"exact allowedOutput"}]}',
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(request),
      },
    ],
  });
  const parsed = safeJsonParse(response.content);
  const items =
    parsed && typeof parsed === "object" &&
    Array.isArray((parsed as Record<string, unknown>).sections)
      ? (parsed as { sections: unknown[] }).sections
      : [];
  const sections = items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return typeof record.sectionId === "string" && typeof record.content === "string"
      ? [{ sectionId: record.sectionId, content: record.content }]
      : [];
  });
  return {
    provider: response.provider,
    model: response.model,
    sections,
  };
}

export async function generateEvidenceBoundSectionsLive(
  snapshot: ResearchProductWorkflowSnapshotV1,
  options: {
    clock?: ProductWorkflowClock;
    requester?: LiveEvidenceSectionRequester;
  } = {},
): Promise<ResearchProductWorkflowSnapshotV1> {
  if (snapshot.project.mode !== "LIVE") {
    throw new ProductWorkflowError(
      "INVALID_TRANSITION",
      "Live model generation is only permitted for a LIVE project.",
      409,
    );
  }
  const clock = options.clock ?? systemClock;
  const deterministic = generateEvidenceBoundSections(snapshot, clock);
  const startedAt = clock.now();
  const requestId = entityId(
    "llm_request",
    snapshot.project.id,
    snapshot.reportPlan?.id ?? "no-plan",
    startedAt,
  );
  const request: LiveEvidenceSectionRequest = {
    requestId,
    topic: snapshot.intent.topic,
    targetLanguage: snapshot.intent.targetLanguage,
    sections: deterministic.reportPlan!.sections
      .filter((section) => section.status === "generated")
      .map((section) => ({
        sectionId: section.id,
        title: section.title,
        allowedOutput: deterministic.sectionContent[section.id] ?? "",
        evidenceIds: section.candidateEvidenceIds,
      })),
  };
  let response: LiveEvidenceSectionResponse;
  try {
    response = await (options.requester ?? requestLiveEvidenceSections)(request);
  } catch (error) {
    throw new ProductWorkflowError(
      "GENERATION_FAILED",
      `Live generation provider failed: ${error instanceof Error ? error.message : "unknown error"}`,
      503,
    );
  }
  const responseBySection = new Map(
    response.sections.map((section) => [section.sectionId, section.content]),
  );
  if (
    response.sections.length !== request.sections.length ||
    request.sections.some(
      (section) => responseBySection.get(section.sectionId) !== section.allowedOutput,
    )
  ) {
    throw new ProductWorkflowError(
      "GENERATION_FAILED",
      "Live model output changed, omitted, duplicated, or invented evidence-bound section text.",
      502,
    );
  }
  const completedAt = clock.now();
  const liveProducer = "researchforge.live-evidence-synthesis";
  const sectionContent = Object.fromEntries(
    request.sections.map((section) => [
      section.sectionId,
      responseBySection.get(section.sectionId)!,
    ]),
  );
  return parsed({
    ...deterministic,
    sectionContent,
    generationRuns: deterministic.generationRuns.map((run) => ({
      ...run,
      provider: response.provider,
      model: response.model,
      modelVersion: response.model,
      promptTemplateVersion: "SECTION_SYNTHESIS_PROMPT.r24.live.v1",
      output: sectionContent[run.sectionId] ?? run.output,
      startedAt,
      completedAt,
      provenance: provenance("LIVE", completedAt, liveProducer, [
        requestId,
        run.sectionId,
        ...run.evidenceIds,
      ]),
    })),
    generatedClaims: deterministic.generatedClaims.map((claim) => ({
      ...claim,
      provenance: provenance("LIVE", completedAt, liveProducer, [
        requestId,
        ...claim.evidenceIds,
      ]),
    })),
  });
}

export function verifyGeneratedClaims(
  snapshot: ResearchProductWorkflowSnapshotV1,
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  const now = clock.now();
  const acceptedIds = new Set(snapshot.acceptedEvidenceSet?.evidenceCardIds ?? []);
  const evidenceById = new Map(snapshot.evidenceCards.map((card) => [card.id, card]));
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  const bindingsByClaim = new Map<string, typeof snapshot.citationBindings>();
  for (const binding of snapshot.citationBindings) {
    bindingsByClaim.set(binding.claimId, [
      ...(bindingsByClaim.get(binding.claimId) ?? []),
      binding,
    ]);
  }
  const verificationResults: VerificationResultV1[] = [];
  const generatedClaims: GeneratedClaimV1[] = snapshot.generatedClaims.map((claim) => {
    const bindings = bindingsByClaim.get(claim.id) ?? [];
    const boundEvidence = bindings
      .map((binding) => evidenceById.get(binding.evidenceCardId))
      .filter((card): card is WorkflowEvidenceCardV1 => Boolean(card));
    let status: VerificationResultV1["status"];
    const reasonCodes: string[] = [];
    if (claim.status === "needs_reverification") {
      status = "NEEDS_REVERIFICATION";
      reasonCodes.push("manual_edit_invalidated_binding_semantics");
    } else if (bindings.length === 0 || boundEvidence.length === 0) {
      status = "UNSUPPORTED";
      reasonCodes.push("no_authoritative_citation_binding");
    } else if (
      boundEvidence.some((card) => sourcesById.get(card.sourceId)?.admissionStatus === "CONFLICTING")
    ) {
      status = "CONFLICTING";
      reasonCodes.push("bound_source_marked_conflicting");
    } else {
      const validCount = boundEvidence.filter(
        (card) =>
          acceptedIds.has(card.id) &&
          card.status === "accepted" &&
          Boolean(card.documentId && card.blockId) &&
          sourcesById.get(card.sourceId)?.quality.sourceIntegrity === "traceable",
      ).length;
      if (validCount === boundEvidence.length && claim.evidenceIds.every((id) => acceptedIds.has(id))) {
        status = "SUPPORTED";
        reasonCodes.push("all_claim_evidence_resolves_to_accepted_traceable_spans");
      } else if (validCount > 0) {
        status = "PARTIALLY_SUPPORTED";
        reasonCodes.push("only_subset_of_bindings_is_accepted_and_traceable");
      } else {
        status = "UNVERIFIABLE";
        reasonCodes.push("bindings_do_not_resolve_to_accepted_traceable_spans");
      }
    }
    verificationResults.push({
      id: entityId("verification", snapshot.project.id, claim.id, now),
      projectId: snapshot.project.id,
      claimId: claim.id,
      status,
      reasonCodes,
      verifier: DETERMINISTIC_VERIFIER,
      verifierVersion: PRODUCT_WORKFLOW_ENGINE_VERSION,
      verifiedAt: now,
      provenance: provenance(snapshot.project.mode, now, DETERMINISTIC_VERIFIER, [
        claim.id,
        ...bindings.map((binding) => binding.id),
      ]),
    });
    return {
      ...claim,
      status:
        status === "SUPPORTED"
          ? "verified"
          : status === "NEEDS_REVERIFICATION"
            ? "needs_reverification"
            : "unsupported",
      updatedAt: now,
    };
  });
  const fullyVerified =
    verificationResults.length > 0 &&
    verificationResults.every((result) => result.status === "SUPPORTED");
  return parsed(
    transition(
      { ...snapshot, generatedClaims, verificationResults },
      fullyVerified ? "READY" : "REVISION_REQUIRED",
      fullyVerified ? "all_claims_supported" : "claim_verification_requires_revision",
      now,
    ),
  );
}

export function editGeneratedSection(
  snapshot: ResearchProductWorkflowSnapshotV1,
  sectionId: string,
  request: EditWorkflowSectionRequest,
  clock: ProductWorkflowClock = systemClock,
): ResearchProductWorkflowSnapshotV1 {
  if (!snapshot.reportPlan?.sections.some((section) => section.id === sectionId)) {
    throw new ProductWorkflowError(
      "ENTITY_NOT_FOUND",
      `Unknown report section ${sectionId}.`,
      404,
    );
  }
  const now = clock.now();
  const previous = snapshot.sectionContent[sectionId] ?? "";
  if (previous === request.content) return snapshot;
  const invalidatedClaimIds = snapshot.generatedClaims
    .filter((claim) => claim.sectionId === sectionId)
    .map((claim) => claim.id);
  const invalidatedSet = new Set(invalidatedClaimIds);
  const generatedClaims = snapshot.generatedClaims.map((claim) =>
    invalidatedSet.has(claim.id)
      ? { ...claim, status: "needs_reverification" as const, updatedAt: now }
      : claim,
  );
  const verificationResults = snapshot.verificationResults.map((result) =>
    invalidatedSet.has(result.claimId)
      ? {
          ...result,
          id: entityId("verification", snapshot.project.id, result.claimId, now),
          status: "NEEDS_REVERIFICATION" as const,
          reasonCodes: ["manual_edit_invalidated_binding_semantics"],
          verifiedAt: now,
        }
      : result,
  );
  const reportPlan = snapshot.reportPlan
    ? {
        ...snapshot.reportPlan,
        sections: snapshot.reportPlan.sections.map((section) =>
          section.id === sectionId
            ? { ...section, status: "needs_revision" as const, updatedAt: now }
            : section,
        ),
        updatedAt: now,
      }
    : null;
  return parsed(
    transition(
      {
        ...snapshot,
        reportPlan,
        generatedClaims,
        verificationResults,
        sectionContent: { ...snapshot.sectionContent, [sectionId]: request.content },
        revisions: [
          ...snapshot.revisions,
          {
            id: entityId("revision", snapshot.project.id, sectionId, now),
            projectId: snapshot.project.id,
            sectionId,
            previousContentHash: sha256(previous),
            nextContentHash: sha256(request.content),
            editedBy: request.editedBy,
            invalidatedClaimIds,
            createdAt: now,
            provenance: provenance(snapshot.project.mode, now, "report-edit.v1", [
              sectionId,
              ...invalidatedClaimIds,
            ]),
          },
        ],
      },
      "REVISION_REQUIRED",
      "manual_edit_requires_claim_reverification",
      now,
    ),
  );
}

function markdownForSnapshot(snapshot: ResearchProductWorkflowSnapshotV1): string {
  const sections = snapshot.reportPlan?.sections ?? [];
  const references = snapshot.sources
    .filter((source) =>
      snapshot.citationBindings.some((binding) => binding.sourceId === source.id),
    )
    .map((source, index) => {
      const author = source.authors.join(", ") || "Unknown author";
      return `${index + 1}. ${author} (${source.year ?? "n.d."}). ${source.title}. ${source.doi ? `https://doi.org/${source.doi}` : source.url ?? ""}`.trim();
    });
  return [
    `# ${snapshot.intent.topic}`,
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      snapshot.sectionContent[section.id] ?? "",
      "",
    ]),
    "## References",
    "",
    ...references,
    "",
  ].join("\n");
}

export function exportResearchProductWorkflow(
  snapshot: ResearchProductWorkflowSnapshotV1,
  format: ExportArtifactV1["format"],
  options: {
    allowDraft?: boolean;
    clock?: ProductWorkflowClock;
    rendered?: { bytes: Uint8Array; mediaType: string };
  } = {},
): { snapshot: ResearchProductWorkflowSnapshotV1; response: ResearchProductExportResponse } {
  const clock = options.clock ?? systemClock;
  const now = clock.now();
  const isVerified =
    (snapshot.project.status === "READY" || snapshot.project.status === "COMPLETE") &&
    snapshot.verificationResults.length > 0 &&
    snapshot.verificationResults.every((result) => result.status === "SUPPORTED");
  if (!isVerified && !options.allowDraft) {
    throw new ProductWorkflowError(
      "EXPORT_BLOCKED",
      "Verified export is blocked while unsupported or stale claims remain.",
    );
  }
  if ((format === "pdf" || format === "docx") && !options.rendered) {
    throw new ProductWorkflowError(
      "EXPORT_BLOCKED",
      `${format.toUpperCase()} export requires rendered document bytes.`,
    );
  }
  const binary = options.rendered?.bytes;
  const content = binary
    ? Buffer.from(binary).toString("base64")
    : format === "json_bundle"
      ? `${JSON.stringify(snapshot, null, 2)}\n`
      : markdownForSnapshot(snapshot);
  const artifact: ExportArtifactV1 = {
    id: entityId("export", snapshot.project.id, format, now),
    projectId: snapshot.project.id,
    format,
    reportStatus: isVerified ? "verified" : "draft",
    contentHash: sha256(binary ?? content),
    createdAt: now,
    provenance: provenance(snapshot.project.mode, now, "research-bundle-export.v1", [
      snapshot.project.id,
      ...snapshot.verificationResults.map((result) => result.id),
    ]),
  };
  const next = parsed(
    transition(
      { ...snapshot, exports: [...snapshot.exports, artifact] },
      "COMPLETE",
      `${artifact.reportStatus}_${format}_export_created`,
      now,
    ),
  );
  return {
    snapshot: next,
    response: ResearchProductExportResponseSchema.parse({
      artifact,
      mediaType:
        options.rendered?.mediaType ??
        (format === "json_bundle" ? "application/json" : "text/markdown"),
      content,
    }),
  };
}

export interface ResearchProductWorkflowRepository {
  get(projectId: string): Promise<ResearchProductWorkflowSnapshotV1 | null>;
  save(snapshot: ResearchProductWorkflowSnapshotV1): Promise<void>;
}

export class InMemoryResearchProductWorkflowRepository
  implements ResearchProductWorkflowRepository
{
  private readonly projects = new Map<string, ResearchProductWorkflowSnapshotV1>();

  async get(projectId: string): Promise<ResearchProductWorkflowSnapshotV1 | null> {
    const snapshot = this.projects.get(projectId);
    return snapshot ? parsed(structuredClone(snapshot)) : null;
  }

  async save(snapshot: ResearchProductWorkflowSnapshotV1): Promise<void> {
    const current = this.projects.get(snapshot.project.id);
    if (current && snapshot.project.version <= current.project.version) {
      throw new ProductWorkflowError(
        "INVALID_TRANSITION",
        "A stale workflow snapshot cannot overwrite a newer project version.",
      );
    }
    this.projects.set(snapshot.project.id, parsed(structuredClone(snapshot)));
  }
}

export class ProductWorkflowStoreNotConfiguredError extends ProductWorkflowError {
  constructor() {
    super(
      "STORE_NOT_CONFIGURED",
      "Research product workflow requires DATABASE_URL in production; local memory storage is not a durable production substitute.",
      503,
    );
    this.name = "ProductWorkflowStoreNotConfiguredError";
  }
}

export class PostgresResearchProductWorkflowRepository
  implements ResearchProductWorkflowRepository
{
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS research_product_workflows (
          project_id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          schema_version TEXT NOT NULL,
          status TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS research_product_workflows_workflow_id_idx
          ON research_product_workflows (workflow_id, updated_at DESC)
      `);
    })();
    await this.schemaReady;
  }

  async get(projectId: string): Promise<ResearchProductWorkflowSnapshotV1 | null> {
    await this.ensureSchema();
    const result = await this.pool.query(
      `SELECT snapshot FROM research_product_workflows WHERE project_id = $1`,
      [projectId],
    );
    const row = result.rows[0];
    return row
      ? ResearchProductWorkflowSnapshotV1Schema.parse(row.snapshot)
      : null;
  }

  async save(snapshot: ResearchProductWorkflowSnapshotV1): Promise<void> {
    await this.ensureSchema();
    const parsedSnapshot = ResearchProductWorkflowSnapshotV1Schema.parse(snapshot);
    const result = await this.pool.query(
      `INSERT INTO research_product_workflows (
         project_id, workflow_id, schema_version, status, version, snapshot,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz, $8::timestamptz)
       ON CONFLICT (project_id) DO UPDATE SET
         workflow_id = EXCLUDED.workflow_id,
         schema_version = EXCLUDED.schema_version,
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         snapshot = EXCLUDED.snapshot,
         updated_at = EXCLUDED.updated_at
       WHERE research_product_workflows.version < EXCLUDED.version
       RETURNING version`,
      [
        parsedSnapshot.project.id,
        parsedSnapshot.project.workflowId,
        parsedSnapshot.project.schemaVersion,
        parsedSnapshot.project.status,
        parsedSnapshot.project.version,
        JSON.stringify(parsedSnapshot),
        parsedSnapshot.project.createdAt,
        parsedSnapshot.project.updatedAt,
      ],
    );
    if (!result.rows[0]) {
      throw new ProductWorkflowError(
        "INVALID_TRANSITION",
        "A stale workflow snapshot cannot overwrite a newer durable project version.",
      );
    }
  }
}

let localProductWorkflowRepository: InMemoryResearchProductWorkflowRepository | null = null;
let postgresProductWorkflowRepository: PostgresResearchProductWorkflowRepository | null = null;

export function createResearchProductWorkflowRepository(options: {
  env?: NodeJS.ProcessEnv;
  pool?: Pool;
} = {}): ResearchProductWorkflowRepository {
  const env = options.env ?? process.env;
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return new PostgresResearchProductWorkflowRepository(
      options.pool ?? new Pool({ connectionString: databaseUrl }),
    );
  }
  const isExplicitLocalRuntime =
    env.VERCEL !== "1" && env.VERCEL !== "true" && env.NODE_ENV !== "production";
  if (isExplicitLocalRuntime) return new InMemoryResearchProductWorkflowRepository();
  throw new ProductWorkflowStoreNotConfiguredError();
}

export function defaultResearchProductWorkflowRepository(): ResearchProductWorkflowRepository {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    postgresProductWorkflowRepository ??= new PostgresResearchProductWorkflowRepository(
      new Pool({ connectionString: databaseUrl }),
    );
    return postgresProductWorkflowRepository;
  }
  const isExplicitLocalRuntime =
    process.env.VERCEL !== "1" &&
    process.env.VERCEL !== "true" &&
    process.env.NODE_ENV !== "production";
  if (!isExplicitLocalRuntime) throw new ProductWorkflowStoreNotConfiguredError();
  if (!localProductWorkflowRepository) {
    localProductWorkflowRepository = new InMemoryResearchProductWorkflowRepository();
    logger.warn(
      { event: "research_product_workflow.local_memory_store" },
      "Research product workflow uses in-memory storage only in local development.",
    );
  }
  return localProductWorkflowRepository;
}
