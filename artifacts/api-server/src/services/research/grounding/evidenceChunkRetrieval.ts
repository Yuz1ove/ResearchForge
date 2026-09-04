import { createHash } from "node:crypto";
import { Pool } from "pg";
import type { SourceCandidate } from "@workspace/api-zod/research-grounding";
import type { ExtractedChunk } from "./sourceContentExtractor";

export type EvidenceRetrievalMode = "lexical" | "semantic" | "hybrid";
export type EvidenceChunkStoreKind = "memory" | "postgres_pgvector";

export interface EvidenceChunkDocument {
  workflowId: string;
  topicHash: string;
  sourceId: string;
  chunkId: string;
  contentHash: string;
  text: string;
  lexicalText: string;
  sourceLocation: string;
  sectionHeading?: string;
  page?: number;
  charStart?: number;
  charEnd?: number;
  language?: string;
  sourceTitle: string;
  sourceQualityScore: number;
  sourceRelevanceScore: number;
  embedding?: number[];
  embeddingModel?: string;
}

export interface EvidenceRetrievalHit {
  document: EvidenceChunkDocument;
  rank: number;
  lexicalScore: number;
  semanticScore: number | null;
  sourcePriorScore: number;
  combinedScore: number;
  reasons: string[];
}

export interface EvidenceRetrievalDiagnostics {
  backend: EvidenceChunkStoreKind;
  mode: EvidenceRetrievalMode;
  queryHash: string;
  corpusChunkCount: number;
  indexedChunkCount: number;
  selectedChunkCount: number;
  selectedSourceCount: number;
  embeddingModel?: string;
  persistenceEnabled: boolean;
  fallbackReason?: string;
  perSourceSelected: Record<string, number>;
}

export interface EvidenceEmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

export interface EvidenceChunkStore {
  readonly kind: EvidenceChunkStoreKind;
  upsert(documents: EvidenceChunkDocument[]): Promise<number>;
  search(input: {
    workflowId: string;
    topicHash: string;
    query: string;
    queryEmbedding?: number[];
    embeddingModel?: string;
    limit: number;
  }): Promise<EvidenceRetrievalHit[]>;
}

export interface EvidenceChunkRetrievalOptions {
  store?: EvidenceChunkStore;
  embeddingProvider?: EvidenceEmbeddingProvider | null;
  env?: NodeJS.ProcessEnv;
  topK?: number;
  maxPerSource?: number;
}

export interface RetrievedEvidenceChunks {
  sources: SourceCandidate[];
  hits: EvidenceRetrievalHit[];
  diagnostics: EvidenceRetrievalDiagnostics;
}

interface ScoredDocument {
  document: EvidenceChunkDocument;
  lexicalScore: number;
  semanticScore: number | null;
  sourcePriorScore: number;
  combinedScore: number;
  reasons: string[];
}

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_EMBEDDING_TIMEOUT_MS = 20_000;
const MAX_EMBEDDING_BATCH = 64;

function assertEmbeddingBatch(vectors: number[][], expectedCount: number): void {
  if (vectors.length !== expectedCount) {
    throw new Error(`embedding_count_mismatch:${vectors.length}/${expectedCount}`);
  }
  const dimensions = vectors[0]?.length ?? 0;
  if (dimensions === 0) throw new Error("embedding_vector_empty");
  for (const vector of vectors) {
    if (vector.length !== dimensions || vector.some((value) => !Number.isFinite(value))) {
      throw new Error("embedding_vector_invalid_or_mixed_dimensions");
    }
  }
}

function compact(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Tokenization deliberately keeps CJK bigrams. PostgreSQL's `simple`
 * dictionary does not segment Chinese, while character bigrams preserve a
 * deterministic lexical fallback without silently translating source text.
 */
export function evidenceSearchTerms(value: string): string[] {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  const latin: string[] = normalized.match(/[a-z0-9][a-z0-9-]*/g) ?? [];
  const cjkRuns: string[] = normalized.match(/[\u3400-\u9fff]+/gu) ?? [];
  const cjk = cjkRuns.flatMap((run) => {
    const chars = Array.from(run);
    if (chars.length === 1) return chars;
    return chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
  });
  return unique([...latin.filter((term) => term.length >= 2), ...cjk]);
}

function lexicalProjection(value: string): string {
  return evidenceSearchTerms(value).join(" ");
}

function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number | null {
  if (!a?.length || !b?.length || a.length !== b.length) return null;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm === 0 || bNorm === 0) return null;
  return clamp01((dot / Math.sqrt(aNorm * bNorm) + 1) / 2);
}

function lexicalScores(query: string, documents: EvidenceChunkDocument[]): Map<string, number> {
  const queryTerms = evidenceSearchTerms(query);
  const scores = new Map<string, number>();
  if (queryTerms.length === 0 || documents.length === 0) return scores;
  const documentTerms = documents.map((document) => evidenceSearchTerms(document.lexicalText));
  const documentFrequency = new Map<string, number>();
  for (const terms of documentTerms) {
    for (const term of new Set(terms)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }
  const averageLength = Math.max(
    1,
    documentTerms.reduce((total, terms) => total + terms.length, 0) / documentTerms.length,
  );
  documents.forEach((document, documentIndex) => {
    const terms = documentTerms[documentIndex] ?? [];
    const frequencies = new Map<string, number>();
    for (const term of terms) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    let score = 0;
    let maximum = 0;
    for (const term of queryTerms) {
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const tf = frequencies.get(term) ?? 0;
      const denominator = tf + 1.2 * (0.25 + 0.75 * (terms.length / averageLength));
      score += tf > 0 ? idf * ((tf * 2.2) / denominator) : 0;
      maximum += idf * 2.2;
    }
    const phrase = compact(query).length >= 4 && compact(document.text)
      .toLocaleLowerCase()
      .includes(compact(query).toLocaleLowerCase());
    scores.set(document.chunkId, clamp01(maximum > 0 ? score / maximum + (phrase ? 0.12 : 0) : 0));
  });
  return scores;
}

function scoreDocuments(
  query: string,
  documents: EvidenceChunkDocument[],
  queryEmbedding?: number[],
): ScoredDocument[] {
  const lexical = lexicalScores(query, documents);
  return documents
    .map((document) => {
      const lexicalScore = lexical.get(document.chunkId) ?? 0;
      const semanticScore = cosineSimilarity(queryEmbedding, document.embedding);
      const sourcePriorScore = clamp01(
        document.sourceRelevanceScore * 0.65 + document.sourceQualityScore * 0.35,
      );
      const combinedScore = semanticScore === null
        ? lexicalScore * 0.82 + sourcePriorScore * 0.18
        : lexicalScore * 0.4 + semanticScore * 0.5 + sourcePriorScore * 0.1;
      const reasons = unique([
        lexicalScore > 0 ? "lexical_match" : "",
        semanticScore !== null ? "semantic_match" : "",
        sourcePriorScore >= 0.7 ? "trusted_source_prior" : "",
      ].filter(Boolean));
      return {
        document,
        lexicalScore,
        semanticScore,
        sourcePriorScore,
        combinedScore,
        reasons,
      };
    })
    .sort((a, b) =>
      b.combinedScore - a.combinedScore ||
      b.sourcePriorScore - a.sourcePriorScore ||
      a.document.sourceId.localeCompare(b.document.sourceId) ||
      a.document.chunkId.localeCompare(b.document.chunkId),
    );
}

function rankedHits(scored: ScoredDocument[]): EvidenceRetrievalHit[] {
  return scored.map((item, index) => ({ ...item, rank: index + 1 }));
}

export class InMemoryEvidenceChunkStore implements EvidenceChunkStore {
  readonly kind = "memory" as const;
  private readonly documents = new Map<string, EvidenceChunkDocument>();

  async upsert(documents: EvidenceChunkDocument[]): Promise<number> {
    for (const document of documents) {
      for (const [key, existing] of this.documents.entries()) {
        if (
          existing.workflowId === document.workflowId &&
          existing.sourceId === document.sourceId &&
          existing.contentHash !== document.contentHash
        ) {
          this.documents.delete(key);
        }
      }
      this.documents.set(
        [document.workflowId, document.sourceId, document.contentHash, document.chunkId].join("\u0000"),
        structuredClone(document),
      );
    }
    return documents.length;
  }

  async search(input: {
    workflowId: string;
    topicHash: string;
    query: string;
    queryEmbedding?: number[];
    embeddingModel?: string;
    limit: number;
  }): Promise<EvidenceRetrievalHit[]> {
    const documents = [...this.documents.values()].filter(
      (document) =>
        document.workflowId === input.workflowId && document.topicHash === input.topicHash,
    );
    const embeddingModel = compact(input.embeddingModel);
    const scoreableDocuments = documents.map((document) => {
      const embeddingIsCompatible = Boolean(
        input.queryEmbedding?.length &&
        embeddingModel &&
        document.embeddingModel === embeddingModel &&
        document.embedding?.length === input.queryEmbedding.length
      );
      return embeddingIsCompatible ? document : { ...document, embedding: undefined };
    });
    return rankedHits(scoreDocuments(input.query, scoreableDocuments, input.queryEmbedding)).slice(0, input.limit);
  }
}

function pgVector(value: number[] | undefined): string | null {
  return value?.length ? `[${value.map((item) => Number(item).toString()).join(",")}]` : null;
}

/**
 * Durable evidence memory. Rows are workflow-scoped, content-addressed and
 * versioned. pgvector is used only when an embedding is present; the generated
 * tsvector keeps an auditable lexical path for every retrieval.
 */
export class PostgresPgVectorEvidenceChunkStore implements EvidenceChunkStore {
  readonly kind = "postgres_pgvector" as const;
  private schemaReady: Promise<void> | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly retentionDays = DEFAULT_RETENTION_DAYS,
  ) {}

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      await this.pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS research_evidence_chunks (
          workflow_id TEXT NOT NULL,
          topic_hash TEXT NOT NULL,
          source_id TEXT NOT NULL,
          chunk_id TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          source_title TEXT NOT NULL,
          source_location TEXT NOT NULL,
          section_heading TEXT,
          page INTEGER,
          char_start INTEGER,
          char_end INTEGER,
          language TEXT,
          source_quality_score DOUBLE PRECISION NOT NULL,
          source_relevance_score DOUBLE PRECISION NOT NULL,
          chunk_text TEXT NOT NULL,
          lexical_text TEXT NOT NULL,
          lexical_document TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', lexical_text)) STORED,
          embedding VECTOR,
          embedding_model TEXT,
          is_current BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (workflow_id, source_id, content_hash, chunk_id)
        )
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS research_evidence_chunks_scope_idx
          ON research_evidence_chunks (workflow_id, topic_hash, is_current, expires_at)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS research_evidence_chunks_lexical_idx
          ON research_evidence_chunks USING GIN (lexical_document)
      `);
    })();
    await this.schemaReady;
  }

  async upsert(documents: EvidenceChunkDocument[]): Promise<number> {
    if (documents.length === 0) return 0;
    await this.ensureSchema();
    await this.pool.query("DELETE FROM research_evidence_chunks WHERE expires_at <= NOW()");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const document of documents) {
        await client.query(
          `UPDATE research_evidence_chunks
             SET is_current = FALSE
           WHERE workflow_id = $1 AND source_id = $2 AND content_hash <> $3 AND is_current = TRUE`,
          [document.workflowId, document.sourceId, document.contentHash],
        );
        await client.query(
          `INSERT INTO research_evidence_chunks (
             workflow_id, topic_hash, source_id, chunk_id, content_hash,
             source_title, source_location, section_heading, page, char_start, char_end,
             language, source_quality_score, source_relevance_score, chunk_text,
             lexical_text, embedding, embedding_model, is_current, expires_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17::vector, $18, TRUE, NOW() + ($19::text || ' days')::interval
           )
           ON CONFLICT (workflow_id, source_id, content_hash, chunk_id) DO UPDATE SET
             topic_hash = EXCLUDED.topic_hash,
             source_title = EXCLUDED.source_title,
             source_location = EXCLUDED.source_location,
             section_heading = EXCLUDED.section_heading,
             page = EXCLUDED.page,
             char_start = EXCLUDED.char_start,
             char_end = EXCLUDED.char_end,
             language = EXCLUDED.language,
             source_quality_score = EXCLUDED.source_quality_score,
             source_relevance_score = EXCLUDED.source_relevance_score,
             chunk_text = EXCLUDED.chunk_text,
             lexical_text = EXCLUDED.lexical_text,
             embedding = EXCLUDED.embedding,
             embedding_model = EXCLUDED.embedding_model,
             is_current = TRUE,
             expires_at = EXCLUDED.expires_at`,
          [
            document.workflowId,
            document.topicHash,
            document.sourceId,
            document.chunkId,
            document.contentHash,
            document.sourceTitle,
            document.sourceLocation,
            document.sectionHeading ?? null,
            document.page ?? null,
            document.charStart ?? null,
            document.charEnd ?? null,
            document.language ?? null,
            document.sourceQualityScore,
            document.sourceRelevanceScore,
            document.text,
            document.lexicalText,
            pgVector(document.embedding),
            document.embeddingModel ?? null,
            Math.max(1, Math.floor(this.retentionDays)),
          ],
        );
      }
      await client.query("COMMIT");
      return documents.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async search(input: {
    workflowId: string;
    topicHash: string;
    query: string;
    queryEmbedding?: number[];
    embeddingModel?: string;
    limit: number;
  }): Promise<EvidenceRetrievalHit[]> {
    await this.ensureSchema();
    const queryLexicalText = lexicalProjection(input.query);
    const queryVector = pgVector(input.queryEmbedding);
    const result = await this.pool.query<{
      workflow_id: string;
      topic_hash: string;
      source_id: string;
      chunk_id: string;
      content_hash: string;
      source_title: string;
      source_location: string;
      section_heading: string | null;
      page: number | null;
      char_start: number | null;
      char_end: number | null;
      language: string | null;
      source_quality_score: number;
      source_relevance_score: number;
      chunk_text: string;
      lexical_text: string;
      embedding_model: string | null;
      lexical_score: number;
      semantic_score: number | null;
      combined_score: number;
    }>(
      `WITH ranked AS (
         SELECT *,
           ts_rank_cd(lexical_document, plainto_tsquery('simple', $3)) AS lexical_score,
           CASE WHEN $4::vector IS NULL OR embedding IS NULL OR $6::text IS NULL
                     OR embedding_model IS DISTINCT FROM $6
                     OR vector_dims(embedding) <> vector_dims($4::vector) THEN NULL
                ELSE 1 - (embedding <=> $4::vector) END AS semantic_score
         FROM research_evidence_chunks
         WHERE workflow_id = $1 AND topic_hash = $2 AND is_current = TRUE AND expires_at > NOW()
       )
       SELECT *,
         CASE WHEN semantic_score IS NULL
              THEN lexical_score * 0.82 + (source_relevance_score * 0.65 + source_quality_score * 0.35) * 0.18
              ELSE lexical_score * 0.4 + semantic_score * 0.5 +
                   (source_relevance_score * 0.65 + source_quality_score * 0.35) * 0.1
          END AS combined_score
       FROM ranked
       ORDER BY combined_score DESC, source_id ASC, chunk_id ASC
       LIMIT $5`,
      [
        input.workflowId,
        input.topicHash,
        queryLexicalText,
        queryVector,
        input.limit,
        input.embeddingModel ?? null,
      ],
    );
    return result.rows.map((row, index) => ({
      document: {
        workflowId: row.workflow_id,
        topicHash: row.topic_hash,
        sourceId: row.source_id,
        chunkId: row.chunk_id,
        contentHash: row.content_hash,
        text: row.chunk_text,
        lexicalText: row.lexical_text,
        sourceLocation: row.source_location,
        ...(row.section_heading ? { sectionHeading: row.section_heading } : {}),
        ...(row.page === null ? {} : { page: row.page }),
        ...(row.char_start === null ? {} : { charStart: row.char_start }),
        ...(row.char_end === null ? {} : { charEnd: row.char_end }),
        ...(row.language ? { language: row.language } : {}),
        sourceTitle: row.source_title,
        sourceQualityScore: Number(row.source_quality_score),
        sourceRelevanceScore: Number(row.source_relevance_score),
        ...(row.embedding_model ? { embeddingModel: row.embedding_model } : {}),
      },
      rank: index + 1,
      lexicalScore: clamp01(Number(row.lexical_score)),
      semanticScore: row.semantic_score === null ? null : clamp01(Number(row.semantic_score)),
      sourcePriorScore: clamp01(
        Number(row.source_relevance_score) * 0.65 + Number(row.source_quality_score) * 0.35,
      ),
      combinedScore: clamp01(Number(row.combined_score)),
      reasons: unique([
        Number(row.lexical_score) > 0 ? "lexical_match" : "",
        row.semantic_score === null ? "" : "semantic_match",
      ].filter(Boolean)),
    }));
  }
}

export class OpenAiCompatibleEvidenceEmbeddingProvider implements EvidenceEmbeddingProvider {
  constructor(
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey?: string,
    private readonly timeoutMs = DEFAULT_EMBEDDING_TIMEOUT_MS,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += MAX_EMBEDDING_BATCH) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchImpl(
          `${this.baseUrl.replace(/\/+$/, "")}/embeddings`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
            },
            body: JSON.stringify({ model: this.model, input: texts.slice(start, start + MAX_EMBEDDING_BATCH) }),
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`embedding_http_${response.status}`);
        const payload = await response.json() as {
          data?: Array<{ index?: number; embedding?: unknown }>;
        };
        const batch = (payload.data ?? [])
          .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
          .map((item) =>
            Array.isArray(item.embedding) && item.embedding.every((value) => typeof value === "number")
              ? item.embedding as number[]
              : [],
          );
        if (batch.length !== Math.min(MAX_EMBEDDING_BATCH, texts.length - start) || batch.some((item) => !item.length)) {
          throw new Error("embedding_response_invalid");
        }
        vectors.push(...batch);
      } finally {
        clearTimeout(timeout);
      }
    }
    return vectors;
  }
}

function sourceDocuments(input: {
  workflowId: string;
  topicHash: string;
  sources: SourceCandidate[];
}): EvidenceChunkDocument[] {
  return input.sources.flatMap((source) => {
    if (
      source.sourceUseLevel === "rejected" ||
      source.recommendationBucket === "rejected" ||
      source.canUseForClaims === false ||
      source.accessLevel === "metadata_only" ||
      source.accessLevel === "failed_extraction"
    ) {
      return [];
    }
    return (source.extractedChunks ?? []).map((chunk) => {
      const contentHash = compact(source.contentHash) || hash(
        `${source.sourceId}\n${source.title}\n${chunk.text}`,
      ).slice(0, 32);
      const lexicalText = lexicalProjection([
        source.title,
        source.queryUsed,
        ...(source.matchedConcepts ?? []),
        chunk.section_heading ?? "",
        chunk.text,
      ].join(" "));
      return {
        workflowId: input.workflowId,
        topicHash: input.topicHash,
        sourceId: source.sourceId,
        chunkId: chunk.chunk_id,
        contentHash,
        text: chunk.text,
        lexicalText,
        sourceLocation: chunk.source_location,
        ...(chunk.section_heading ? { sectionHeading: chunk.section_heading } : {}),
        ...(typeof chunk.page === "number" ? { page: chunk.page } : {}),
        ...(typeof chunk.char_start === "number" ? { charStart: chunk.char_start } : {}),
        ...(typeof chunk.char_end === "number" ? { charEnd: chunk.char_end } : {}),
        ...(source.language ? { language: source.language } : {}),
        sourceTitle: source.title,
        sourceQualityScore: source.sourceQualityScore,
        sourceRelevanceScore: source.relevanceScore,
      } satisfies EvidenceChunkDocument;
    });
  });
}

function resolveEmbeddingProvider(env: NodeJS.ProcessEnv): EvidenceEmbeddingProvider | null {
  const model = compact(env.EVIDENCE_EMBEDDING_MODEL);
  if (!model) return null;
  const baseUrl = compact(env.EVIDENCE_EMBEDDING_BASE_URL) || compact(env.OPENAI_BASE_URL);
  if (!baseUrl) return null;
  return new OpenAiCompatibleEvidenceEmbeddingProvider(
    model,
    baseUrl,
    compact(env.EVIDENCE_EMBEDDING_API_KEY) || compact(env.OPENAI_API_KEY) || undefined,
    Number.isFinite(Number(env.EVIDENCE_EMBEDDING_TIMEOUT_MS))
      ? Math.max(1_000, Number(env.EVIDENCE_EMBEDDING_TIMEOUT_MS))
      : DEFAULT_EMBEDDING_TIMEOUT_MS,
  );
}

let defaultPostgresStore: PostgresPgVectorEvidenceChunkStore | null = null;

function resolveStore(env: NodeJS.ProcessEnv): EvidenceChunkStore {
  const requested = compact(env.EVIDENCE_CHUNK_STORE).toLocaleLowerCase();
  const databaseUrl = compact(env.DATABASE_URL);
  if ((requested === "postgres" || requested === "pgvector") && databaseUrl) {
    defaultPostgresStore ??= new PostgresPgVectorEvidenceChunkStore(
      new Pool({ connectionString: databaseUrl }),
      Number.isFinite(Number(env.EVIDENCE_CHUNK_RETENTION_DAYS))
        ? Math.max(1, Number(env.EVIDENCE_CHUNK_RETENTION_DAYS))
        : DEFAULT_RETENTION_DAYS,
    );
    return defaultPostgresStore;
  }
  return new InMemoryEvidenceChunkStore();
}

function selectDiverseHits(
  hits: EvidenceRetrievalHit[],
  sourceIds: string[],
  topK: number,
  maxPerSource: number,
): EvidenceRetrievalHit[] {
  const selected: EvidenceRetrievalHit[] = [];
  const selectedIds = new Set<string>();
  const counts = new Map<string, number>();
  const add = (hit: EvidenceRetrievalHit) => {
    if (selectedIds.has(hit.document.chunkId) || selected.length >= topK) return;
    const count = counts.get(hit.document.sourceId) ?? 0;
    if (count >= maxPerSource) return;
    selected.push(hit);
    selectedIds.add(hit.document.chunkId);
    counts.set(hit.document.sourceId, count + 1);
  };

  // Preserve multi-source coverage before filling by global score. This avoids
  // one long or highly repetitive paper consuming the whole writer context.
  for (const sourceId of sourceIds) {
    const best = hits.find((hit) => hit.document.sourceId === sourceId);
    if (best) add(best);
  }
  for (const hit of hits) add(hit);
  return selected
    .sort((a, b) => b.combinedScore - a.combinedScore || a.document.chunkId.localeCompare(b.document.chunkId))
    .map((hit, index) => ({ ...hit, rank: index + 1 }));
}

function chunkFromDocument(document: EvidenceChunkDocument): ExtractedChunk {
  return {
    chunk_id: document.chunkId,
    text: document.text,
    source_location: document.sourceLocation,
    ...(document.sectionHeading ? { section_heading: document.sectionHeading } : {}),
    ...(typeof document.page === "number" ? { page: document.page } : {}),
    ...(typeof document.charStart === "number" ? { char_start: document.charStart } : {}),
    ...(typeof document.charEnd === "number" ? { char_end: document.charEnd } : {}),
  };
}

export async function retrieveEvidenceChunks(input: {
  query: string;
  workflowId: string;
  topicHash: string;
  sources: SourceCandidate[];
}, options: EvidenceChunkRetrievalOptions = {}): Promise<RetrievedEvidenceChunks> {
  const env = options.env ?? process.env;
  const documents = sourceDocuments(input);
  const maxPerSource = Math.max(1, options.maxPerSource ?? 3);
  const topK = Math.max(1, options.topK ?? Math.max(12, input.sources.length * maxPerSource));
  let embeddingProvider = options.embeddingProvider === undefined
    ? resolveEmbeddingProvider(env)
    : options.embeddingProvider;
  let fallbackReason: string | undefined;
  let queryEmbedding: number[] | undefined;

  if (embeddingProvider && documents.length > 0) {
    try {
      const vectors = await embeddingProvider.embed([
        input.query,
        ...documents.map((document) => document.text),
      ]);
      assertEmbeddingBatch(vectors, documents.length + 1);
      queryEmbedding = vectors[0];
      documents.forEach((document, index) => {
        document.embedding = vectors[index + 1];
        document.embeddingModel = embeddingProvider?.model;
      });
    } catch (error) {
      fallbackReason = error instanceof Error
        ? `embedding_unavailable:${compact(error.message).slice(0, 120)}`
        : "embedding_unavailable";
      embeddingProvider = null;
      queryEmbedding = undefined;
      for (const document of documents) {
        delete document.embedding;
        delete document.embeddingModel;
      }
    }
  }

  let store = options.store ?? resolveStore(env);
  let indexedChunkCount = 0;
  let hits: EvidenceRetrievalHit[] = [];
  try {
    indexedChunkCount = await store.upsert(documents);
    hits = await store.search({
      workflowId: input.workflowId,
      topicHash: input.topicHash,
      query: input.query,
      ...(queryEmbedding ? { queryEmbedding } : {}),
      ...(embeddingProvider ? { embeddingModel: embeddingProvider.model } : {}),
      limit: Math.max(topK * 4, documents.length),
    });
  } catch (error) {
    const reason = error instanceof Error ? compact(error.message).slice(0, 120) : "unknown";
    fallbackReason = unique([fallbackReason ?? "", `store_unavailable:${reason}`].filter(Boolean)).join(";");
    store = new InMemoryEvidenceChunkStore();
    indexedChunkCount = await store.upsert(documents);
    hits = await store.search({
      workflowId: input.workflowId,
      topicHash: input.topicHash,
      query: input.query,
      ...(queryEmbedding ? { queryEmbedding } : {}),
      ...(embeddingProvider ? { embeddingModel: embeddingProvider.model } : {}),
      limit: Math.max(topK * 4, documents.length),
    });
  }

  const selected = selectDiverseHits(
    hits,
    input.sources.map((source) => source.sourceId),
    topK,
    maxPerSource,
  );
  const chunksBySource = new Map<string, ExtractedChunk[]>();
  for (const hit of selected) {
    const chunks = chunksBySource.get(hit.document.sourceId) ?? [];
    chunks.push(chunkFromDocument(hit.document));
    chunksBySource.set(hit.document.sourceId, chunks);
  }
  const sources = input.sources.map((source) => {
    const chunks = chunksBySource.get(source.sourceId);
    if (chunks) return { ...source, extractedChunks: chunks };
    return (source.extractedChunks?.length ?? 0) > 0
      ? { ...source, extractedChunks: [] }
      : source;
  });
  const perSourceSelected = Object.fromEntries(
    [...chunksBySource.entries()].map(([sourceId, chunks]) => [sourceId, chunks.length]),
  );
  return {
    sources,
    hits: selected,
    diagnostics: {
      backend: store.kind,
      mode: queryEmbedding ? "hybrid" : "lexical",
      queryHash: hash(`${input.workflowId}\n${input.topicHash}\n${input.query}`).slice(0, 24),
      corpusChunkCount: documents.length,
      indexedChunkCount,
      selectedChunkCount: selected.length,
      selectedSourceCount: chunksBySource.size,
      ...(embeddingProvider ? { embeddingModel: embeddingProvider.model } : {}),
      persistenceEnabled: store.kind === "postgres_pgvector",
      ...(fallbackReason ? { fallbackReason } : {}),
      perSourceSelected,
    },
  };
}
