import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import {
  CreateResearchProductProjectRequestSchema,
  ResearchProductWorkflowSnapshotV1Schema,
  type ResearchProductWorkflowSnapshotV1,
  type SourceCandidateInput,
  type WorkflowEvidenceCardInput,
} from "@workspace/api-zod/research-product-workflow";
import {
  buildProductReportPlan,
  createResearchProductWorkflowRepository,
  createResearchProductWorkflow,
  editGeneratedSection,
  exportResearchProductWorkflow,
  generateEvidenceBoundSections,
  generateEvidenceBoundSectionsLive,
  InMemoryResearchProductWorkflowRepository,
  PostgresResearchProductWorkflowRepository,
  ProductWorkflowError,
  ProductWorkflowStoreNotConfiguredError,
  registerEvidenceCards,
  registerSourceCandidates,
  replaceResearchQuestions,
  reviewEvidenceCards,
  verifyGeneratedClaims,
  type ProductWorkflowClock,
} from "./product-workflow";
import {
  buildResearchProductDocx,
  buildResearchProductPrintHtml,
} from "./product-document-export";

const CLOCK: ProductWorkflowClock = {
  now: () => "2026-09-01T12:00:00.000Z",
};

function createFixture(
  topic = "多語言學術資料如何批量處理",
  mode: "FIXTURE" | "LIVE" = "FIXTURE",
) {
  return createResearchProductWorkflow(
    CreateResearchProductProjectRequestSchema.parse({
      topic,
      reportType: "研究報告",
      targetAudience: "高中生",
      targetLanguage: "zh-TW",
      depth: "standard",
      expectedOutputFormats: ["pdf", "docx", "json_bundle"],
      mode,
    }),
    { clock: CLOCK, projectId: "project-golden", workflowId: "workflow-golden" },
  );
}

function candidate(
  snapshot: ResearchProductWorkflowSnapshotV1,
  input: Partial<SourceCandidateInput> & Pick<SourceCandidateInput, "id" | "title">,
): SourceCandidateInput {
  return {
    id: input.id,
    queryIds: input.queryIds ?? [snapshot.queries[0]!.id],
    provider: input.provider ?? "openalex",
    providerId: input.providerId ?? `${input.provider ?? "openalex"}-${input.id}`,
    providerRawRef: input.providerRawRef ?? `fixture:${input.id}`,
    title: input.title,
    authors: input.authors ?? ["Lin, Mei"],
    year: input.year ?? 2025,
    venue: input.venue ?? "Fixture Journal",
    doi: input.doi ?? `10.1000/${input.id}`,
    url: input.url ?? `https://example.test/${input.id}`,
    abstract:
      input.abstract === undefined
        ? "This fixture abstract reports a traceable supported finding."
        : input.abstract,
    language: input.language ?? "en",
    keywords: input.keywords ?? ["multilingual", "batch processing"],
    sourceType: input.sourceType ?? "journal",
    publisher: input.publisher ?? "Fixture Publisher",
    citationCount: input.citationCount ?? 10,
    openAccess: input.openAccess ?? true,
    license: input.license ?? "CC-BY-4.0",
    relevance: input.relevance ?? 0.92,
    authority: input.authority ?? 0.88,
  };
}

function evidenceInput(
  snapshot: ResearchProductWorkflowSnapshotV1,
  sourceIndex = 0,
  input: Partial<WorkflowEvidenceCardInput> = {},
): WorkflowEvidenceCardInput {
  const source = snapshot.sources[sourceIndex]!;
  const document = snapshot.documents.find((item) => item.sourceId === source.id)!;
  const block = snapshot.parsedBlocks.find((item) => item.documentId === document.id)!;
  return {
    id: input.id ?? `evidence-${sourceIndex + 1}`,
    sourceId: source.id,
    documentId: input.documentId === undefined ? document.id : input.documentId,
    blockId: input.blockId === undefined ? block.id : input.blockId,
    claimText: input.claimText ?? "批次處理可以透過明確的工作流程邊界提高可重現性。",
    evidenceText: input.evidenceText ?? block.text,
    evidenceType: input.evidenceType ?? "FINDING",
    researchQuestionIds: input.researchQuestionIds ?? [snapshot.questions[0]!.id],
    sectionHints: input.sectionHints ?? [],
    page: input.page ?? null,
    sourceStartOffset: input.sourceStartOffset ?? block.startOffset,
    sourceEndOffset: input.sourceEndOffset ?? block.endOffset,
    confidence: input.confidence ?? 0.9,
    qualityNotes: input.qualityNotes ?? ["fixture_trace_verified"],
    limitations: input.limitations ?? ["此結果來自標示為 FIXTURE 的測試資料。"],
    createdBy: input.createdBy ?? "import",
    extractorVersion: input.extractorVersion ?? "fixture.v1",
  };
}

function oneSourceWorkflow(mode: "FIXTURE" | "LIVE" = "FIXTURE") {
  const initial = createFixture("多語言學術資料如何批量處理", mode);
  return registerSourceCandidates(
    initial,
    [candidate(initial, { id: "source-a", title: "Multilingual Batch Research Processing" })],
    { clock: CLOCK },
  );
}

function acceptedWorkflow(mode: "FIXTURE" | "LIVE" = "FIXTURE") {
  const withSources = oneSourceWorkflow(mode);
  const withEvidence = registerEvidenceCards(
    withSources,
    [evidenceInput(withSources)],
    CLOCK,
  );
  return reviewEvidenceCards(
    withEvidence,
    [
      {
        evidenceCardId: withEvidence.evidenceCards[0]!.id,
        decision: "accepted",
        reason: "human confirmed the fixture span",
        note: null,
        tags: ["golden"],
        decidedBy: "human",
      },
    ],
    CLOCK,
  );
}

function verifiedWorkflow() {
  const accepted = acceptedWorkflow();
  const planned = buildProductReportPlan(accepted, undefined, CLOCK);
  const generated = generateEvidenceBoundSections(planned, CLOCK);
  return verifyGeneratedClaims(generated, CLOCK);
}

test("LIVE generation records the configured provider only after exact evidence-bound output validation", async () => {
  const accepted = acceptedWorkflow("LIVE");
  const planned = buildProductReportPlan(accepted, undefined, CLOCK);
  const generated = await generateEvidenceBoundSectionsLive(planned, {
    clock: CLOCK,
    requester: async (request) => ({
      provider: "school-live",
      model: "school-live-model",
      sections: request.sections.map((section) => ({
        sectionId: section.sectionId,
        content: section.allowedOutput,
      })),
    }),
  });

  assert.equal(generated.project.status, "VERIFYING");
  assert.ok(generated.generationRuns.length > 0);
  assert.ok(generated.generationRuns.every((run) => run.provider === "school-live"));
  assert.ok(generated.generationRuns.every((run) => run.model === "school-live-model"));
  assert.ok(
    generated.generationRuns.every(
      (run) => run.promptTemplateVersion === "SECTION_SYNTHESIS_PROMPT.r24.live.v1",
    ),
  );
  assert.ok(
    generated.generatedClaims.every(
      (claim) => claim.provenance.producer === "researchforge.live-evidence-synthesis",
    ),
  );

  await assert.rejects(
    () =>
      generateEvidenceBoundSectionsLive(planned, {
        clock: CLOCK,
        requester: async (request) => ({
          provider: "school-live",
          model: "school-live-model",
          sections: request.sections.map((section, index) => ({
            sectionId: section.sectionId,
            content: index === 0 ? `${section.allowedOutput}\nInvented claim.` : section.allowedOutput,
          })),
        }),
      }),
    (error: unknown) =>
      error instanceof ProductWorkflowError && error.code === "GENERATION_FAILED",
  );
});

test("CASE A: intake, editable decomposition, and bounded query expansion are explicit", () => {
  const snapshot = createFixture();
  assert.equal(snapshot.project.mode, "FIXTURE");
  assert.equal(snapshot.project.status, "DRAFT");
  assert.equal(snapshot.questions.length, 6);
  assert.ok(snapshot.queries.length <= snapshot.diagnostics.queryBudget);
  assert.ok(snapshot.queries.every((query) => query.researchQuestionId));
  assert.ok(snapshot.queries.every((query) => query.provenance.producerVersion === "r23.1"));

  const edited = replaceResearchQuestions(
    snapshot,
    [
      {
        text: "如何在不遺失語言資訊的情況下正規化來源？",
        purpose: "驗證多語言 metadata 正規化。",
        status: "active",
      },
    ],
    CLOCK,
  );
  assert.equal(edited.questions.length, 1);
  assert.equal(edited.questions[0]!.origin, "user");
  assert.ok(edited.queries.length <= edited.diagnostics.queryBudget);
});

test("CASE B: identical DOI records deduplicate while provenance remains many-to-one", () => {
  const snapshot = createFixture();
  const result = registerSourceCandidates(
    snapshot,
    [
      candidate(snapshot, {
        id: "openalex-record",
        title: "A Multilingual Pipeline: Batch Processing",
        doi: "https://doi.org/10.5555/MULTI.1",
        provider: "openalex",
      }),
      candidate(snapshot, {
        id: "crossref-record",
        title: "A multilingual pipeline — batch processing",
        doi: "doi:10.5555/multi.1",
        provider: "crossref",
      }),
    ],
    { clock: CLOCK },
  );
  assert.equal(result.sourceCandidates.length, 2);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(result.sources[0]!.mergedCandidateIds.sort(), [
    "crossref-record",
    "openalex-record",
  ]);
  assert.ok(result.sources[0]!.duplicateGroupId);
  assert.equal(result.sources[0]!.doi, "10.5555/multi.1");
});

test("CASE B boundary: same normalized title with a different year is not merged", () => {
  const snapshot = createFixture();
  const first = candidate(snapshot, {
    id: "year-2024",
    title: "Batch Processing Review",
    doi: null,
    providerId: null,
    url: "https://example.test/2024",
    year: 2024,
  });
  const second = candidate(snapshot, {
    id: "year-2025",
    title: "Batch Processing Review",
    doi: null,
    providerId: null,
    url: "https://example.test/2025",
    year: 2025,
  });
  const result = registerSourceCandidates(snapshot, [first, second], { clock: CLOCK });
  assert.equal(result.sources.length, 2);
});

test("CASE C: metadata discovery does not masquerade as full text", () => {
  const snapshot = createFixture();
  const result = registerSourceCandidates(
    snapshot,
    [
      candidate(snapshot, {
        id: "metadata-only",
        title: "Metadata-only research record",
        abstract: null,
      }),
    ],
    { clock: CLOCK },
  );
  assert.equal(result.sources[0]!.admissionStatus, "METADATA_ONLY");
  assert.equal(result.documents[0]!.accessStatus, "METADATA_ONLY");
  assert.equal(result.documents[0]!.acquisitionStatus, "not_requested");
  assert.equal(result.parsedBlocks.length, 0);
});

test("CASE D: a claim bound to a conflicting source cannot be marked supported", () => {
  const accepted = acceptedWorkflow();
  const conflicted = ResearchProductWorkflowSnapshotV1Schema.parse({
    ...accepted,
    sources: accepted.sources.map((source) => ({
      ...source,
      admissionStatus: "CONFLICTING",
      admissionReasons: [...source.admissionReasons, "fixture_conflict"],
    })),
  });
  const verified = verifyGeneratedClaims(
    generateEvidenceBoundSections(buildProductReportPlan(conflicted, undefined, CLOCK), CLOCK),
    CLOCK,
  );
  assert.equal(verified.project.status, "REVISION_REQUIRED");
  assert.equal(verified.verificationResults[0]!.status, "CONFLICTING");
});

test("CASE E: a generated claim without an authoritative binding is unsupported", () => {
  const generated = generateEvidenceBoundSections(
    buildProductReportPlan(acceptedWorkflow(), undefined, CLOCK),
    CLOCK,
  );
  const unsupportedClaim = {
    ...generated.generatedClaims[0]!,
    id: "claim-without-binding",
    claimText: "This is an unsupported injected claim.",
    evidenceIds: [],
    citationBindingIds: [],
  };
  const tampered = ResearchProductWorkflowSnapshotV1Schema.parse({
    ...generated,
    generatedClaims: [...generated.generatedClaims, unsupportedClaim],
  });
  const verified = verifyGeneratedClaims(tampered, CLOCK);
  assert.equal(verified.project.status, "REVISION_REQUIRED");
  assert.equal(
    verified.verificationResults.find((item) => item.claimId === unsupportedClaim.id)!.status,
    "UNSUPPORTED",
  );
});

test("CASE F: provider failure remains observable and a partial provider result can continue", () => {
  const snapshot = createFixture();
  const partial = registerSourceCandidates(
    snapshot,
    [candidate(snapshot, { id: "fallback", title: "Fallback Provider Result" })],
    { providerFailures: ["semantic_scholar:timeout"], clock: CLOCK },
  );
  assert.equal(partial.project.status, "SOURCES_FOUND");
  assert.deepEqual(partial.diagnostics.providerFailures, ["semantic_scholar:timeout"]);

  const empty = registerSourceCandidates(snapshot, [], {
    providerFailures: ["all_providers:timeout"],
    clock: CLOCK,
  });
  assert.equal(empty.project.status, "FAILED_RECOVERABLE");
});

test("CASE G: rejected evidence is absent from the accepted set, plan, generation, and bindings", () => {
  const withSources = oneSourceWorkflow();
  const withEvidence = registerEvidenceCards(
    withSources,
    [
      evidenceInput(withSources, 0, { id: "accepted-card" }),
      evidenceInput(withSources, 0, {
        id: "rejected-card",
        claimText: "This rejected claim must never reach synthesis.",
      }),
    ],
    CLOCK,
  );
  const reviewed = reviewEvidenceCards(
    withEvidence,
    [
      {
        evidenceCardId: "accepted-card",
        decision: "accepted",
        reason: "traceable",
        note: null,
        tags: [],
        decidedBy: "human",
      },
      {
        evidenceCardId: "rejected-card",
        decision: "rejected",
        reason: "not relevant to the section",
        note: null,
        tags: [],
        decidedBy: "human",
      },
    ],
    CLOCK,
  );
  assert.deepEqual(reviewed.acceptedEvidenceSet!.evidenceCardIds, ["accepted-card"]);
  const generated = generateEvidenceBoundSections(
    buildProductReportPlan(reviewed, undefined, CLOCK),
    CLOCK,
  );
  assert.ok(generated.generatedClaims.every((claim) => !claim.evidenceIds.includes("rejected-card")));
  assert.ok(generated.citationBindings.every((binding) => binding.evidenceCardId !== "rejected-card"));
});

test("CASE H: manual edits conservatively invalidate affected claim verification", () => {
  const verified = verifiedWorkflow();
  assert.equal(verified.project.status, "READY");
  const sectionId = verified.generatedClaims[0]!.sectionId;
  const edited = editGeneratedSection(
    verified,
    sectionId,
    { content: "使用者改寫後的段落。", editedBy: "human" },
    CLOCK,
  );
  assert.equal(edited.project.status, "REVISION_REQUIRED");
  assert.equal(edited.generatedClaims[0]!.status, "needs_reverification");
  assert.equal(edited.verificationResults[0]!.status, "NEEDS_REVERIFICATION");
  assert.deepEqual(edited.revisions[0]!.invalidatedClaimIds, [edited.generatedClaims[0]!.id]);
});

test("CASE I: multilingual intake preserves language identity without claiming a translation", () => {
  const snapshot = createFixture("Multilingual 學術資料 batch processing");
  assert.equal(snapshot.intent.targetLanguage, "zh-TW");
  assert.ok(snapshot.queries.every((query) => query.language === "zh-TW"));
  assert.ok(snapshot.queries.every((query) => query.origin !== "translation"));
});

test("CASE J: a verified report exports a checksum-bound replayable JSON research bundle", () => {
  const verified = verifiedWorkflow();
  const result = exportResearchProductWorkflow(verified, "json_bundle", { clock: CLOCK });
  assert.equal(result.response.artifact.reportStatus, "verified");
  assert.equal(result.snapshot.project.status, "COMPLETE");
  const replay = ResearchProductWorkflowSnapshotV1Schema.parse(
    JSON.parse(result.response.content),
  );
  assert.equal(replay.project.id, verified.project.id);
  assert.equal(replay.project.mode, "FIXTURE");
  assert.ok(result.response.artifact.contentHash.match(/^[a-f0-9]{64}$/u));
});

test("verified product exports produce real DOCX bytes and seal sequential binary formats", async () => {
  const verified = verifiedWorkflow();
  const docx = await buildResearchProductDocx(verified);
  assert.ok(docx.byteLength > 1_000);
  assert.deepEqual(Array.from(docx.slice(0, 2)), [0x50, 0x4b]);
  const html = buildResearchProductPrintHtml(verified);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /References/);
  assert.doesNotMatch(html, /<script/i);

  const first = exportResearchProductWorkflow(verified, "docx", {
    clock: CLOCK,
    rendered: {
      bytes: docx,
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });
  assert.equal(first.snapshot.project.status, "COMPLETE");
  assert.equal(first.response.mediaType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.deepEqual(Array.from(Buffer.from(first.response.content, "base64").slice(0, 2)), [0x50, 0x4b]);

  const second = exportResearchProductWorkflow(first.snapshot, "pdf", {
    clock: CLOCK,
    rendered: {
      bytes: Uint8Array.from(Buffer.from("%PDF-1.7\n%%EOF\n")),
      mediaType: "application/pdf",
    },
  });
  assert.equal(second.snapshot.exports.length, 2);
  assert.equal(second.response.mediaType, "application/pdf");
  assert.match(Buffer.from(second.response.content, "base64").toString("utf8"), /^%PDF-/);
});

test("verified export fails closed after a manual edit unless explicitly exported as draft", () => {
  const verified = verifiedWorkflow();
  const sectionId = verified.generatedClaims[0]!.sectionId;
  const edited = editGeneratedSection(
    verified,
    sectionId,
    { content: "changed", editedBy: "human" },
    CLOCK,
  );
  assert.throws(
    () => exportResearchProductWorkflow(edited, "markdown", { clock: CLOCK }),
    /Verified export is blocked/u,
  );
  const draft = exportResearchProductWorkflow(edited, "markdown", {
    allowDraft: true,
    clock: CLOCK,
  });
  assert.equal(draft.response.artifact.reportStatus, "draft");
});

test("production persistence fails closed without DATABASE_URL while local tests use memory", () => {
  assert.throws(
    () =>
      createResearchProductWorkflowRepository({
        env: { NODE_ENV: "production", VERCEL: "1" },
      }),
    ProductWorkflowStoreNotConfiguredError,
  );
  assert.ok(
    createResearchProductWorkflowRepository({ env: { NODE_ENV: "test" } }) instanceof
      InMemoryResearchProductWorkflowRepository,
  );
});

test("Postgres adapter creates an additive JSONB table and reloads schema-valid snapshots", async () => {
  const statements: string[] = [];
  let stored: ResearchProductWorkflowSnapshotV1 | null = null;
  const fakePool = {
    async query(statement: string, values?: unknown[]) {
      statements.push(statement.replace(/\s+/gu, " ").trim());
      if (statement.includes("INSERT INTO research_product_workflows")) {
        stored = JSON.parse(String(values?.[5])) as ResearchProductWorkflowSnapshotV1;
        return { rows: [{ version: stored.project.version }] };
      }
      if (statement.includes("SELECT snapshot")) {
        return { rows: stored ? [{ snapshot: stored }] : [] };
      }
      return { rows: [] };
    },
  } as unknown as Pool;
  const repository = new PostgresResearchProductWorkflowRepository(fakePool);
  const snapshot = createFixture();
  await repository.save(snapshot);
  const reloaded = await repository.get(snapshot.project.id);
  assert.equal(reloaded?.project.id, snapshot.project.id);
  assert.ok(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS research_product_workflows")));
  assert.ok(statements.some((statement) => statement.includes("CREATE INDEX IF NOT EXISTS research_product_workflows_workflow_id_idx")));
  assert.ok(statements.every((statement) => !/\b(?:DROP|TRUNCATE|DELETE)\b/iu.test(statement)));
});

test("repositories reject an equal-version overwrite instead of silently choosing the last writer", async () => {
  const snapshot = createFixture();
  const memoryRepository = new InMemoryResearchProductWorkflowRepository();
  await memoryRepository.save(snapshot);
  await assert.rejects(
    memoryRepository.save(structuredClone(snapshot)),
    (error: unknown) =>
      error instanceof ProductWorkflowError && error.code === "INVALID_TRANSITION",
  );

  const statements: string[] = [];
  const fakePool = {
    async query(statement: string) {
      statements.push(statement.replace(/\s+/gu, " ").trim());
      if (statement.includes("INSERT INTO research_product_workflows")) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  } as unknown as Pool;
  const postgresRepository = new PostgresResearchProductWorkflowRepository(fakePool);
  await assert.rejects(
    postgresRepository.save(snapshot),
    (error: unknown) =>
      error instanceof ProductWorkflowError && error.code === "INVALID_TRANSITION",
  );
  assert.ok(
    statements.some((statement) =>
      statement.includes("research_product_workflows.version < EXCLUDED.version"),
    ),
  );
});
