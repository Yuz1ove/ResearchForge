import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, link, unlink } from "node:fs/promises";
import {
  identityHash,
  type CanonicalIdentitySnapshot, type IndependentCanonicalIdentity,
} from "./canonicalIdentityRestoration";
import { verifyCanonicalIdentityForPersistence } from "./acceptedSourceEnrichment";
import {
  GroundingJobSchema,
  type GroundingJob,
} from "@workspace/api-zod/research-grounding";
import { logger } from "../../../lib/logger";

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/**
 * Explicit local canonical-identity snapshot persistence for archived/expired jobs.
 * Does not resurrect the job, patch its admission, or persist any full-text fields.
 * Publish an immutable complete file atomically; a conflicting destination is never overwritten.
 */
export async function persistCanonicalIdentitySnapshot(
  destination: string, baseline: CanonicalIdentitySnapshot, value: IndependentCanonicalIdentity,
): Promise<{value: IndependentCanonicalIdentity; reused: boolean}> {
  if (!verifyCanonicalIdentityForPersistence(baseline,value)) throw new Error("CANONICAL_IDENTITY_PERSISTENCE_FAILED:invalid_evidence");
  const readExisting = async () => {
    try {
      const existing = JSON.parse(await readFile(destination,"utf8")) as IndependentCanonicalIdentity;
      if (identityHash(existing) !== identityHash(value)) throw new Error("CANONICAL_IDENTITY_PERSISTENCE_FAILED:snapshot_conflict");
      return {value:existing,reused:true};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };
  const existing = await readExisting();
  if (existing) return existing;
  const temporary = destination + "." + randomUUID() + ".tmp";
  let created = false;
  try {
    await writeFile(temporary,JSON.stringify(value,null,2)+"\n",{flag:"wx",mode:0o600});
    created = true;
    try { await link(temporary,destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const raced = await readExisting();
      if (!raced) throw new Error("CANONICAL_IDENTITY_PERSISTENCE_FAILED:concurrent_removal");
      return raced;
    }
    return {value:structuredClone(value),reused:false};
  } finally {
    if (created) await unlink(temporary);
  }
}
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

const TERMINAL_JOB_STATUSES = new Set<GroundingJob["status"]>([
  "completed",
  "partial",
  "failed",
  "ready_for_review",
  "source_review_ready",
  "source_review_needs_manual",
  "ready_for_next_step",
  "no_sources_after_fallback",
  "no_results_after_expansion",
  "generation_ready",
]);

export interface GroundingJobRepository {
  create(job: GroundingJob): Promise<GroundingJob>;
  get(jobId: string): Promise<GroundingJob | null>;
  /**
   * Lightweight change token used by long-polling. Implementations should not
   * materialize or clone the full job payload for this read.
   */
  getRevision?(jobId: string): Promise<number | null>;
  patch(
    jobId: string,
    patch: Partial<GroundingJob>,
    options?: { expectedRevision?: number },
  ): Promise<GroundingJob>;
}

export class GroundingJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Research grounding job ${jobId} was not found.`);
    this.name = "GroundingJobNotFoundError";
  }
}

export class GroundingJobRevisionConflictError extends Error {
  constructor(jobId: string) {
    super(`Research grounding job ${jobId} was updated by another request.`);
    this.name = "GroundingJobRevisionConflictError";
  }
}

export class GroundingStoreNotConfiguredError extends Error {
  constructor() {
    super(
      "Research grounding requires DATABASE_URL on Vercel. Configure a durable Postgres database before creating grounding jobs.",
    );
    this.name = "GroundingStoreNotConfiguredError";
  }
}

function cloneJob(job: GroundingJob): GroundingJob {
  return structuredClone(job);
}

function isTerminal(status: GroundingJob["status"]): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function isGroundingJobTerminal(job: GroundingJob): boolean {
  return Boolean(job.acquisition?.terminalStatus) || isTerminal(job.status);
}

function normalizedTtlSeconds(env: NodeJS.ProcessEnv): number {
  const configured = Number(env.GROUNDING_JOB_TTL_SECONDS);
  if (!Number.isFinite(configured)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(configured)));
}

function mergeJob(
  current: GroundingJob,
  patch: Partial<GroundingJob>,
): GroundingJob {
  if (isGroundingJobTerminal(current)) return current;

  return GroundingJobSchema.parse({
    ...current,
    ...patch,
    jobId: current.jobId,
    requestId: current.requestId,
    attemptId: current.attemptId,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    expiresAt: current.expiresAt,
    updatedAt: new Date().toISOString(),
  });
}

/** Test-only or explicitly local-development storage. Never selected on Vercel. */
export class InMemoryGroundingJobRepository implements GroundingJobRepository {
  private readonly jobs = new Map<string, GroundingJob>();

  async create(job: GroundingJob): Promise<GroundingJob> {
    const parsed = GroundingJobSchema.parse(job);
    this.jobs.set(parsed.jobId, cloneJob(parsed));
    return cloneJob(parsed);
  }

  async get(jobId: string): Promise<GroundingJob | null> {
    const job = this.jobs.get(jobId);
    if (!job || Date.parse(job.expiresAt) <= Date.now()) return null;
    return cloneJob(job);
  }

  async getRevision(jobId: string): Promise<number | null> {
    const job = this.jobs.get(jobId);
    if (!job || Date.parse(job.expiresAt) <= Date.now()) return null;
    return job.revision;
  }

  async patch(
    jobId: string,
    patch: Partial<GroundingJob>,
    options: { expectedRevision?: number } = {},
  ): Promise<GroundingJob> {
    const current = await this.get(jobId);
    if (!current) throw new GroundingJobNotFoundError(jobId);
    if (
      options.expectedRevision !== undefined &&
      current.revision !== options.expectedRevision
    ) {
      throw new GroundingJobRevisionConflictError(jobId);
    }
    const next = mergeJob(current, patch);
    this.jobs.set(jobId, cloneJob(next));
    return cloneJob(next);
  }
}

export class PostgresGroundingJobRepository implements GroundingJobRepository {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly pool: Pool) {}

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= (async () => {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS research_grounding_jobs (
          job_id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          topic_hash TEXT NOT NULL,
          request_id TEXT NOT NULL,
          attempt_id TEXT NOT NULL,
          status TEXT NOT NULL,
          revision INTEGER NOT NULL,
          job_payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS research_grounding_jobs_expires_at_idx
          ON research_grounding_jobs (expires_at)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS research_grounding_jobs_workflow_id_idx
          ON research_grounding_jobs (workflow_id, updated_at DESC)
      `);
    })();
    await this.schemaReady;
  }

  async create(job: GroundingJob): Promise<GroundingJob> {
    await this.ensureSchema();
    const parsed = GroundingJobSchema.parse(job);
    // TTL is enforced on reads and expired rows are also reclaimed whenever a
    // new job is created, keeping the small operational table bounded without
    // adding an unmanaged serverless cron dependency.
    await this.pool.query(
      `DELETE FROM research_grounding_jobs WHERE expires_at <= NOW()`,
    );
    await this.pool.query(
      `INSERT INTO research_grounding_jobs (
        job_id, workflow_id, topic_hash, request_id, attempt_id, status, revision,
        job_payload, created_at, updated_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, $10::timestamptz, $11::timestamptz)`,
      [
        parsed.jobId,
        parsed.workflowId,
        parsed.topicHash,
        parsed.requestId,
        parsed.attemptId,
        parsed.status,
        parsed.revision,
        JSON.stringify(parsed),
        parsed.createdAt,
        parsed.updatedAt,
        parsed.expiresAt,
      ],
    );
    return parsed;
  }

  async get(jobId: string): Promise<GroundingJob | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{ job_payload: unknown }>(
      `SELECT job_payload
       FROM research_grounding_jobs
       WHERE job_id = $1 AND expires_at > NOW()`,
      [jobId],
    );
    const row = result.rows[0];
    return row ? GroundingJobSchema.parse(row.job_payload) : null;
  }

  async getRevision(jobId: string): Promise<number | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{ revision: number }>(
      `SELECT revision
       FROM research_grounding_jobs
       WHERE job_id = $1 AND expires_at > NOW()`,
      [jobId],
    );
    return result.rows[0]?.revision ?? null;
  }

  async patch(
    jobId: string,
    patch: Partial<GroundingJob>,
    options: { expectedRevision?: number } = {},
  ): Promise<GroundingJob> {
    await this.ensureSchema();
    const current = await this.get(jobId);
    if (!current) throw new GroundingJobNotFoundError(jobId);
    if (
      options.expectedRevision !== undefined &&
      current.revision !== options.expectedRevision
    ) {
      throw new GroundingJobRevisionConflictError(jobId);
    }
    const next = mergeJob(current, patch);
    if (next === current) return current;

    const result = await this.pool.query<{ job_payload: unknown }>(
      `UPDATE research_grounding_jobs
       SET status = $1,
           revision = $2,
           job_payload = $3::jsonb,
           updated_at = $4::timestamptz
       WHERE job_id = $5
         AND revision = $6
         AND expires_at > NOW()
       RETURNING job_payload`,
      [
        next.status,
        next.revision,
        JSON.stringify(next),
        next.updatedAt,
        jobId,
        current.revision,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new GroundingJobRevisionConflictError(jobId);
    return GroundingJobSchema.parse(row.job_payload);
  }
}

let localDevelopmentRepository: InMemoryGroundingJobRepository | null = null;
let postgresRepository: PostgresGroundingJobRepository | null = null;

export function createGroundingJobRepository(options: {
  env?: NodeJS.ProcessEnv;
  pool?: Pool;
} = {}): GroundingJobRepository {
  const env = options.env ?? process.env;
  const databaseUrl = env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return new PostgresGroundingJobRepository(
      options.pool ?? new Pool({ connectionString: databaseUrl }),
    );
  }

  const isExplicitLocalRuntime =
    env.VERCEL !== "1" && env.VERCEL !== "true" && env.NODE_ENV !== "production";
  if (isExplicitLocalRuntime) return new InMemoryGroundingJobRepository();
  throw new GroundingStoreNotConfiguredError();
}

export function defaultGroundingJobRepository(): GroundingJobRepository {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    postgresRepository ??= new PostgresGroundingJobRepository(
      new Pool({ connectionString: databaseUrl }),
    );
    return postgresRepository;
  }

  const isExplicitLocalRuntime =
    process.env.VERCEL !== "1" &&
    process.env.VERCEL !== "true" &&
    process.env.NODE_ENV !== "production";
  if (isExplicitLocalRuntime) {
    if (!localDevelopmentRepository) {
      localDevelopmentRepository = new InMemoryGroundingJobRepository();
      logger.warn(
        { event: "research_grounding.local_memory_store" },
        "Research grounding uses in-memory storage only in local development.",
      );
    }
    return localDevelopmentRepository;
  }
  throw new GroundingStoreNotConfiguredError();
}

export function createGroundingJobTimestamps(env = process.env): {
  createdAt: string;
  expiresAt: string;
} {
  const createdAt = new Date();
  return {
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + normalizedTtlSeconds(env) * 1_000,
    ).toISOString(),
  };
}

export async function patchGroundingJobWithRetry(
  repository: GroundingJobRepository,
  jobId: string,
  patch: Partial<GroundingJob>,
  attempts = 3,
): Promise<GroundingJob> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = await repository.get(jobId);
    if (!current) throw new GroundingJobNotFoundError(jobId);
    try {
      return await repository.patch(jobId, patch, {
        expectedRevision: current.revision,
      });
    } catch (error) {
      lastError = error;
      if (!(error instanceof GroundingJobRevisionConflictError)) throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new GroundingJobRevisionConflictError(jobId);
}

export async function claimGroundingJobExecution(
  repository: GroundingJobRepository,
  jobId: string,
  input: {
    ownerId: string;
    leaseMs?: number;
    now?: Date;
  },
): Promise<GroundingJob | null> {
  const now = input.now ?? new Date();
  const current = await repository.get(jobId);
  if (!current || isGroundingJobTerminal(current)) return null;
  if (
    current.executionLease &&
    current.executionLease.ownerId !== input.ownerId &&
    Date.parse(current.executionLease.expiresAt) > now.getTime()
  ) return null;
  const leaseMs = Math.max(
    1_000,
    Math.min(10 * 60 * 1_000, input.leaseMs ?? 60_000),
  );
  try {
    return await repository.patch(
      jobId,
      {
        executionLease: {
          ownerId: input.ownerId,
          claimedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
        },
      },
      { expectedRevision: current.revision },
    );
  } catch (error) {
    if (error instanceof GroundingJobRevisionConflictError) return null;
    throw error;
  }
}

export async function releaseGroundingJobExecution(
  repository: GroundingJobRepository,
  jobId: string,
  ownerId: string,
): Promise<GroundingJob | null> {
  const current = await repository.get(jobId);
  if (!current) return null;
  if (
    !current.executionLease ||
    current.executionLease.ownerId !== ownerId ||
    isGroundingJobTerminal(current)
  ) return current;
  try {
    return await repository.patch(
      jobId,
      { executionLease: undefined },
      { expectedRevision: current.revision },
    );
  } catch (error) {
    if (error instanceof GroundingJobRevisionConflictError) {
      return repository.get(jobId);
    }
    throw error;
  }
}
