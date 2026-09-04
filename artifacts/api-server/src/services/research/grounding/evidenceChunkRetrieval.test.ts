import assert from "node:assert/strict";
import test from "node:test";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import {
  InMemoryEvidenceChunkStore,
  evidenceSearchTerms,
  retrieveEvidenceChunks,
  type EvidenceChunkDocument,
  type EvidenceEmbeddingProvider,
} from "./evidenceChunkRetrieval";

function source(
  sourceId: string,
  chunks: Array<{ id: string; text: string; heading?: string }>,
  overrides: Partial<SourceCandidate> = {},
): SourceCandidate {
  return {
    sourceId,
    workflowId: "wf-vector-test",
    topicHash: "topic-vector-test",
    queryUsed: "sleep duration learning outcomes",
    queryIntent: "evidence",
    provider: "openalex",
    title: `Study ${sourceId} about sleep and learning`,
    relevanceScore: 0.82,
    sourceQualityScore: 0.88,
    retrievalMode: "academic",
    recommendationBucket: "recommended",
    sourceRole: "core_evidence",
    sourceUseLevel: "citable_full_text",
    accessLevel: "full_text",
    canUseForClaims: true,
    contentHash: `hash-${sourceId}`,
    extractedChunks: chunks.map((chunk, index) => ({
      chunk_id: chunk.id,
      text: chunk.text,
      source_location: `p.${index + 1}`,
      ...(chunk.heading ? { section_heading: chunk.heading } : {}),
      char_start: index * 100,
      char_end: index * 100 + chunk.text.length,
    })),
    ...overrides,
  } as SourceCandidate;
}

test("CJK lexical projection preserves deterministic bigrams", () => {
  assert.deepEqual(evidenceSearchTerms("睡眠時間與 Sleep Duration"), [
    "sleep",
    "duration",
    "睡眠",
    "眠時",
    "時間",
    "間與",
  ]);
});

test("hybrid retrieval selects the evidence-bearing chunk from every eligible source", async () => {
  const sources = [
    source("s1", [
      { id: "s1:c1", text: "Battery chemistry and thermal envelopes were measured." },
      {
        id: "s1:c2",
        heading: "Results",
        text: "Longer sleep duration was associated with higher learning efficiency in the student cohort.",
      },
    ]),
    source("s2", [
      { id: "s2:c1", text: "The introduction describes urban transport infrastructure." },
      {
        id: "s2:c2",
        heading: "Limitations",
        text: "Sleep quality estimates relied on self-reports, limiting causal interpretation of learning outcomes.",
      },
    ]),
    source("metadata", [], {
      accessLevel: "metadata_only",
      sourceUseLevel: "metadata_context_only",
      canUseForClaims: false,
    }),
  ];
  const provider: EvidenceEmbeddingProvider = {
    model: "test-multilingual-embedding-v1",
    async embed(texts) {
      return texts.map((text) =>
        /sleep|learning/i.test(text) ? [1, 0, 0] : [0, 1, 0],
      );
    },
  };

  const result = await retrieveEvidenceChunks({
    query: "sleep duration and learning outcomes",
    workflowId: "wf-vector-test",
    topicHash: "topic-vector-test",
    sources,
  }, {
    store: new InMemoryEvidenceChunkStore(),
    embeddingProvider: provider,
    topK: 2,
    maxPerSource: 1,
  });

  assert.equal(result.diagnostics.mode, "hybrid");
  assert.equal(result.diagnostics.embeddingModel, provider.model);
  assert.equal(result.diagnostics.corpusChunkCount, 4);
  assert.equal(result.diagnostics.selectedSourceCount, 2);
  assert.deepEqual(
    result.hits.map((hit) => hit.document.chunkId).sort(),
    ["s1:c2", "s2:c2"],
  );
  assert.deepEqual(result.sources[0]?.extractedChunks?.map((chunk) => chunk.chunk_id), ["s1:c2"]);
  assert.deepEqual(result.sources[1]?.extractedChunks?.map((chunk) => chunk.chunk_id), ["s2:c2"]);
  assert.equal(result.sources[2]?.extractedChunks?.length, 0);
  assert.equal(result.sources[0]?.extractedChunks?.[0]?.char_start, 100);
});

test("embedding failure degrades to traceable lexical retrieval", async () => {
  const provider: EvidenceEmbeddingProvider = {
    model: "broken-embedding",
    async embed() {
      throw new Error("provider timeout");
    },
  };
  const result = await retrieveEvidenceChunks({
    query: "睡眠時間",
    workflowId: "wf-vector-test",
    topicHash: "topic-vector-test",
    sources: [source("zh", [
      { id: "zh:c1", text: "此段討論電池散熱與材料壽命。" },
      { id: "zh:c2", text: "研究結果顯示，睡眠時間與學習表現之間存在關聯。" },
    ])],
  }, {
    store: new InMemoryEvidenceChunkStore(),
    embeddingProvider: provider,
    topK: 1,
    maxPerSource: 1,
  });

  assert.equal(result.diagnostics.mode, "lexical");
  assert.match(result.diagnostics.fallbackReason ?? "", /embedding_unavailable/);
  assert.equal(result.hits[0]?.document.chunkId, "zh:c2");
  assert.ok((result.hits[0]?.lexicalScore ?? 0) > 0);
});

test("invalid embedding dimensions degrade safely and never leak unselected full text", async () => {
  const sources = [
    source("selected", [{ id: "selected:c1", text: "Sleep duration predicts learning outcomes." }]),
    source("unselected", [{ id: "unselected:c1", text: "Battery chemistry and thermal design." }]),
  ];
  const provider: EvidenceEmbeddingProvider = {
    model: "mixed-dimension-provider",
    async embed(texts) {
      return texts.map((_, index) => index === 1 ? [1, 0] : [1, 0, 0]);
    },
  };

  const result = await retrieveEvidenceChunks({
    query: "sleep duration learning outcomes",
    workflowId: "wf-vector-test",
    topicHash: "topic-vector-test",
    sources,
  }, {
    store: new InMemoryEvidenceChunkStore(),
    embeddingProvider: provider,
    topK: 1,
    maxPerSource: 1,
  });

  assert.equal(result.diagnostics.mode, "lexical");
  assert.match(result.diagnostics.fallbackReason ?? "", /mixed_dimensions/);
  assert.equal(result.sources[0]?.extractedChunks?.length, 1);
  assert.equal(result.sources[1]?.extractedChunks?.length, 0);
});

function storedDocument(overrides: Partial<EvidenceChunkDocument> = {}): EvidenceChunkDocument {
  return {
    workflowId: "wf-memory-test",
    topicHash: "topic-memory-test",
    sourceId: "source-1",
    chunkId: "chunk-1",
    contentHash: "hash-current",
    text: "Sleep duration and learning outcomes.",
    lexicalText: "sleep duration learning outcomes",
    sourceLocation: "p.1",
    sourceTitle: "Sleep study",
    sourceQualityScore: 0.9,
    sourceRelevanceScore: 0.9,
    ...overrides,
  };
}

test("memory store retires prior content versions for the same workflow source", async () => {
  const store = new InMemoryEvidenceChunkStore();
  await store.upsert([storedDocument({ contentHash: "hash-old" })]);
  await store.upsert([storedDocument({ contentHash: "hash-new" })]);

  const hits = await store.search({
    workflowId: "wf-memory-test",
    topicHash: "topic-memory-test",
    query: "sleep",
    limit: 10,
  });

  assert.deepEqual([...new Set(hits.map((hit) => hit.document.contentHash))], ["hash-new"]);
});

test("memory store isolates semantic scoring by embedding model and dimensions", async () => {
  const store = new InMemoryEvidenceChunkStore();
  await store.upsert([storedDocument({
    embedding: [1, 0],
    embeddingModel: "embedding-model-a",
  })]);

  for (const search of [
    { queryEmbedding: [1, 0], embeddingModel: "embedding-model-b" },
    { queryEmbedding: [1, 0] },
    { queryEmbedding: [1, 0, 0], embeddingModel: "embedding-model-a" },
  ]) {
    const hits = await store.search({
      workflowId: "wf-memory-test",
      topicHash: "topic-memory-test",
      query: "unmatched",
      limit: 10,
      ...search,
    });
    assert.equal(hits[0]?.semanticScore, null);
    assert.equal(hits[0]?.document.sourceId, "source-1");
  }

  const compatible = await store.search({
    workflowId: "wf-memory-test",
    topicHash: "topic-memory-test",
    query: "unmatched",
    queryEmbedding: [1, 0],
    embeddingModel: "embedding-model-a",
    limit: 10,
  });
  assert.equal(compatible[0]?.semanticScore, 1);
});
