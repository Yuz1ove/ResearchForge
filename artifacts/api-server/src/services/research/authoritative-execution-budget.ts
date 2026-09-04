import { createHash } from "node:crypto";

export const AUTHORITATIVE_EXECUTION_BUDGET_SCHEMA_VERSION =
  "researchforge-authoritative-execution-budget/v5" as const;

export type ExecutionBudgetDimension =
  | "query"
  | "expandedQuery"
  | "provider"
  | "providerQueryPair"
  | "requestAttempt"
  | "retry"
  | "redirect"
  | "resolver"
  | "materialization"
  | "fallbackLayer"
  | "elapsedTime";

export type ExecutionBudgetLimits = Record<ExecutionBudgetDimension, number>;

export interface ExecutionBudgetOperation {
  operation: "provider_request" | "resolver_request" | "materialization";
  query?: string | null;
  provider?: string | null;
  upstreamProvider?: string | null;
  requestIdentity: string;
  attemptType?: "initial" | "retry" | "redirect";
  expandedQuery?: boolean;
  fallbackLayer?: number | null;
}

export interface ExecutionBudgetBlock {
  operation: ExecutionBudgetOperation["operation"];
  requestIdentity: string;
  dimension: ExecutionBudgetDimension;
  configuredLimit: number;
  effectiveLimit: number;
  usedCount: number;
  requestedCount: number;
  reasonCode:
    | "QUERY_BUDGET_EXHAUSTED"
    | "EXPANDED_QUERY_BUDGET_EXHAUSTED"
    | "PROVIDER_BUDGET_EXHAUSTED"
    | "PROVIDER_QUERY_PAIR_BUDGET_EXHAUSTED"
    | "REQUEST_ATTEMPT_BUDGET_EXHAUSTED"
    | "RETRY_BUDGET_EXHAUSTED"
    | "REDIRECT_BUDGET_EXHAUSTED"
    | "RESOLVER_BUDGET_EXHAUSTED"
    | "MATERIALIZATION_BUDGET_EXHAUSTED"
    | "FALLBACK_LAYER_BUDGET_EXHAUSTED"
    | "ELAPSED_TIME_BUDGET_EXHAUSTED";
  timestamp: string;
}

export interface ExecutionBudgetEvent {
  requestIdentity: string;
  operation: ExecutionBudgetOperation["operation"];
  query: string | null;
  provider: string | null;
  upstreamProvider: string | null;
  attemptType: "initial" | "retry" | "redirect";
  fallbackLayer: number | null;
  status: "RESERVED" | "EXECUTED" | "SUCCEEDED" | "FAILED" | "DEDUPLICATED" | "BLOCKED_BY_BUDGET";
  dimensions: Partial<ExecutionBudgetLimits>;
  timestamp: string;
}

export interface AuthoritativeExecutionBudgetSnapshot {
  schemaVersion: typeof AUTHORITATIVE_EXECUTION_BUDGET_SCHEMA_VERSION;
  ledgerId: string;
  startedAt: string;
  capturedAt: string;
  configured: ExecutionBudgetLimits;
  effective: ExecutionBudgetLimits;
  reserved: ExecutionBudgetLimits;
  executed: ExecutionBudgetLimits;
  succeeded: number;
  failed: number;
  retried: number;
  deduplicated: number;
  blockedByBudget: number;
  blockedByDimension: Partial<Record<ExecutionBudgetDimension, number>>;
  blocks: ExecutionBudgetBlock[];
  events: ExecutionBudgetEvent[];
}

export type ExecutionBudgetResult<T> =
  | { status: "EXECUTED"; value: T }
  | { status: "FAILED"; error: unknown }
  | { status: "DEDUPLICATED"; reasonCode: "REQUEST_DEDUPLICATED" }
  | {
      status: "BLOCKED_BY_BUDGET";
      reasonCode: "BUDGET_EXHAUSTED";
      block: ExecutionBudgetBlock;
    };

export interface BudgetAuthorityMismatch {
  code:
    | "CONFIGURED_BUDGET_MISMATCH"
    | "EFFECTIVE_BUDGET_MISMATCH"
    | "RESERVED_COUNT_MISMATCH"
    | "EXECUTED_COUNT_MISMATCH"
    | "OUTCOME_COUNT_MISMATCH"
    | "HIDDEN_ATTEMPT"
    | "BUDGET_OVERRUN";
  detail: string;
}

const DIMENSIONS: ExecutionBudgetDimension[] = [
  "query",
  "expandedQuery",
  "provider",
  "providerQueryPair",
  "requestAttempt",
  "retry",
  "redirect",
  "resolver",
  "materialization",
  "fallbackLayer",
  "elapsedTime",
];

const BLOCK_REASONS: Record<ExecutionBudgetDimension, ExecutionBudgetBlock["reasonCode"]> = {
  query: "QUERY_BUDGET_EXHAUSTED",
  expandedQuery: "EXPANDED_QUERY_BUDGET_EXHAUSTED",
  provider: "PROVIDER_BUDGET_EXHAUSTED",
  providerQueryPair: "PROVIDER_QUERY_PAIR_BUDGET_EXHAUSTED",
  requestAttempt: "REQUEST_ATTEMPT_BUDGET_EXHAUSTED",
  retry: "RETRY_BUDGET_EXHAUSTED",
  redirect: "REDIRECT_BUDGET_EXHAUSTED",
  resolver: "RESOLVER_BUDGET_EXHAUSTED",
  materialization: "MATERIALIZATION_BUDGET_EXHAUSTED",
  fallbackLayer: "FALLBACK_LAYER_BUDGET_EXHAUSTED",
  elapsedTime: "ELAPSED_TIME_BUDGET_EXHAUSTED",
};

function emptyCounts(): ExecutionBudgetLimits {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as ExecutionBudgetLimits;
}

function normalizeLimit(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function normalizeLimits(input: Partial<ExecutionBudgetLimits>): ExecutionBudgetLimits {
  return Object.fromEntries(
    DIMENSIONS.map((dimension) => [dimension, normalizeLimit(input[dimension])]),
  ) as ExecutionBudgetLimits;
}

function normalizeIdentity(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function deriveSearchBudgetLimits(input: {
  queryBudget: number;
  providerBudget: number;
  maxPagesPerProviderQuery: number;
  maxRetriesPerRequest: number;
  fallbackLayerBudget: number;
  resolverBudget?: number;
  materializationBudget: number;
  elapsedTimeBudgetMs?: number;
}): ExecutionBudgetLimits {
  const query = normalizeLimit(input.queryBudget);
  const provider = normalizeLimit(input.providerBudget);
  const pages = normalizeLimit(input.maxPagesPerProviderQuery);
  const retriesPerRequest = normalizeLimit(input.maxRetriesPerRequest);
  const providerQueryPair = query * provider;
  const initialPageAttempts = providerQueryPair * pages;
  const resolver = normalizeLimit(input.resolverBudget ?? 0);
  const materialization = normalizeLimit(input.materializationBudget);
  const retry = (initialPageAttempts + resolver + materialization) * retriesPerRequest;
  return {
    query,
    expandedQuery: query,
    provider,
    providerQueryPair,
    requestAttempt: initialPageAttempts + resolver + materialization + retry,
    retry,
    redirect: initialPageAttempts,
    resolver,
    materialization,
    fallbackLayer: normalizeLimit(input.fallbackLayerBudget),
    elapsedTime: normalizeLimit(input.elapsedTimeBudgetMs ?? 0),
  };
}

export class AuthoritativeExecutionBudgetLedger {
  readonly configured: ExecutionBudgetLimits;
  readonly effective: ExecutionBudgetLimits;
  readonly ledgerId: string;
  readonly startedAt: string;

  private readonly providerAliases: Record<string, string>;
  private readonly clock: () => Date;
  private readonly reserved = emptyCounts();
  private readonly executed = emptyCounts();
  private readonly queries = new Set<string>();
  private readonly expandedQueries = new Set<string>();
  private readonly providers = new Set<string>();
  private readonly providerQueryPairs = new Set<string>();
  private readonly fallbackLayers = new Set<number>();
  private readonly requestIdentities = new Set<string>();
  private readonly blocks: ExecutionBudgetBlock[] = [];
  private readonly events: ExecutionBudgetEvent[] = [];
  private succeeded = 0;
  private failed = 0;
  private retried = 0;
  private deduplicated = 0;

  constructor(input: {
    configured: Partial<ExecutionBudgetLimits>;
    effective?: Partial<ExecutionBudgetLimits>;
    providerAliases?: Record<string, string>;
    startedAt?: string;
    clock?: () => Date;
  }) {
    this.configured = normalizeLimits(input.configured);
    this.effective = input.effective
      ? normalizeLimits(input.effective)
      : { ...this.configured };
    this.providerAliases = Object.fromEntries(
      Object.entries(input.providerAliases ?? {}).map(([alias, upstream]) => [
        normalizeIdentity(alias),
        normalizeIdentity(upstream),
      ]),
    );
    this.clock = input.clock ?? (() => new Date());
    this.startedAt = input.startedAt ?? this.clock().toISOString();
    this.ledgerId = `budget-ledger:${createHash("sha256").update(JSON.stringify({
      configured: this.configured,
      effective: this.effective,
      startedAt: this.startedAt,
    })).digest("hex").slice(0, 24)}`;
  }

  private upstreamProvider(operation: ExecutionBudgetOperation): string {
    const explicit = normalizeIdentity(operation.upstreamProvider);
    if (explicit) return explicit;
    const provider = normalizeIdentity(operation.provider);
    return this.providerAliases[provider] ?? provider;
  }

  private timestamp(): string {
    return this.clock().toISOString();
  }

  private increments(operation: ExecutionBudgetOperation): Partial<ExecutionBudgetLimits> {
    const increments: Partial<ExecutionBudgetLimits> = {};
    const query = normalizeIdentity(operation.query);
    const provider = this.upstreamProvider(operation);
    if (operation.operation === "provider_request" && query && !this.queries.has(query)) increments.query = 1;
    if (operation.operation === "provider_request" && operation.expandedQuery && query && !this.expandedQueries.has(query)) increments.expandedQuery = 1;
    if (provider && !this.providers.has(provider)) increments.provider = 1;
    if (operation.operation === "provider_request" && provider && query && !this.providerQueryPairs.has(`${provider}|${query}`)) {
      increments.providerQueryPair = 1;
    }
    increments.requestAttempt = 1;
    if (operation.attemptType === "retry") increments.retry = 1;
    if (operation.attemptType === "redirect") increments.redirect = 1;
    if (operation.operation === "resolver_request") increments.resolver = 1;
    if (operation.operation === "materialization") increments.materialization = 1;
    if (operation.fallbackLayer != null && !this.fallbackLayers.has(operation.fallbackLayer)) {
      increments.fallbackLayer = 1;
    }
    return increments;
  }

  private reserve(operation: ExecutionBudgetOperation):
    | { status: "RESERVED"; increments: Partial<ExecutionBudgetLimits> }
    | { status: "DEDUPLICATED" }
    | { status: "BLOCKED"; block: ExecutionBudgetBlock } {
    const requestIdentity = normalizeIdentity(operation.requestIdentity);
    const attemptType = operation.attemptType ?? "initial";
    if (attemptType === "initial" && this.requestIdentities.has(requestIdentity)) {
      this.deduplicated += 1;
      this.events.push({
        requestIdentity,
        operation: operation.operation,
        query: normalizeIdentity(operation.query) || null,
        provider: normalizeIdentity(operation.provider) || null,
        upstreamProvider: this.upstreamProvider(operation) || null,
        attemptType,
        fallbackLayer: operation.fallbackLayer ?? null,
        status: "DEDUPLICATED",
        dimensions: {},
        timestamp: this.timestamp(),
      });
      return { status: "DEDUPLICATED" };
    }
    const increments = this.increments(operation);
    const startedMs = Date.parse(this.startedAt);
    const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, this.clock().getTime() - startedMs) : 0;
    const elapsedLimit = this.effective.elapsedTime;
    const exhaustedDimension = DIMENSIONS.find((dimension) => {
      if (dimension === "elapsedTime") return elapsedLimit > 0 && elapsedMs >= elapsedLimit;
      const requested = increments[dimension] ?? 0;
      return requested > 0 && this.reserved[dimension] + requested > this.effective[dimension];
    });
    if (exhaustedDimension) {
      const requestedCount = exhaustedDimension === "elapsedTime"
        ? elapsedMs
        : increments[exhaustedDimension] ?? 0;
      const block: ExecutionBudgetBlock = {
        operation: operation.operation,
        requestIdentity,
        dimension: exhaustedDimension,
        configuredLimit: this.configured[exhaustedDimension],
        effectiveLimit: this.effective[exhaustedDimension],
        usedCount: exhaustedDimension === "elapsedTime" ? elapsedMs : this.reserved[exhaustedDimension],
        requestedCount,
        reasonCode: BLOCK_REASONS[exhaustedDimension],
        timestamp: this.timestamp(),
      };
      this.blocks.push(block);
      this.events.push({
        requestIdentity,
        operation: operation.operation,
        query: normalizeIdentity(operation.query) || null,
        provider: normalizeIdentity(operation.provider) || null,
        upstreamProvider: this.upstreamProvider(operation) || null,
        attemptType,
        fallbackLayer: operation.fallbackLayer ?? null,
        status: "BLOCKED_BY_BUDGET",
        dimensions: increments,
        timestamp: block.timestamp,
      });
      return { status: "BLOCKED", block };
    }
    for (const [dimension, count] of Object.entries(increments) as Array<[ExecutionBudgetDimension, number]>) {
      this.reserved[dimension] += count;
    }
    const query = normalizeIdentity(operation.query);
    const provider = this.upstreamProvider(operation);
    if (operation.operation === "provider_request" && query) this.queries.add(query);
    if (operation.operation === "provider_request" && operation.expandedQuery && query) this.expandedQueries.add(query);
    if (provider) this.providers.add(provider);
    if (operation.operation === "provider_request" && provider && query) this.providerQueryPairs.add(`${provider}|${query}`);
    if (operation.fallbackLayer != null) this.fallbackLayers.add(operation.fallbackLayer);
    if (attemptType === "initial") this.requestIdentities.add(requestIdentity);
    if (attemptType === "retry") this.retried += 1;
    this.events.push({
      requestIdentity,
      operation: operation.operation,
      query: query || null,
      provider: normalizeIdentity(operation.provider) || null,
      upstreamProvider: provider || null,
      attemptType,
      fallbackLayer: operation.fallbackLayer ?? null,
      status: "RESERVED",
      dimensions: increments,
      timestamp: this.timestamp(),
    });
    return { status: "RESERVED", increments };
  }

  async execute<T>(
    operation: ExecutionBudgetOperation,
    sideEffect: () => Promise<T>,
  ): Promise<ExecutionBudgetResult<T>> {
    const reservation = this.reserve(operation);
    if (reservation.status === "DEDUPLICATED") {
      return { status: "DEDUPLICATED", reasonCode: "REQUEST_DEDUPLICATED" };
    }
    if (reservation.status === "BLOCKED") {
      return { status: "BLOCKED_BY_BUDGET", reasonCode: "BUDGET_EXHAUSTED", block: reservation.block };
    }
    for (const [dimension, count] of Object.entries(reservation.increments) as Array<[ExecutionBudgetDimension, number]>) {
      this.executed[dimension] += count;
    }
    const baseEvent: Omit<ExecutionBudgetEvent, "status" | "timestamp"> = {
      requestIdentity: normalizeIdentity(operation.requestIdentity),
      operation: operation.operation,
      query: normalizeIdentity(operation.query) || null,
      provider: normalizeIdentity(operation.provider) || null,
      upstreamProvider: this.upstreamProvider(operation) || null,
      attemptType: operation.attemptType ?? "initial",
      fallbackLayer: operation.fallbackLayer ?? null,
      dimensions: reservation.increments,
    };
    this.events.push({ ...baseEvent, status: "EXECUTED", timestamp: this.timestamp() });
    try {
      const value = await sideEffect();
      this.succeeded += 1;
      this.events.push({ ...baseEvent, status: "SUCCEEDED", timestamp: this.timestamp() });
      return { status: "EXECUTED", value };
    } catch (error) {
      this.failed += 1;
      this.events.push({ ...baseEvent, status: "FAILED", timestamp: this.timestamp() });
      return { status: "FAILED", error };
    }
  }

  snapshot(): AuthoritativeExecutionBudgetSnapshot {
    return {
      schemaVersion: AUTHORITATIVE_EXECUTION_BUDGET_SCHEMA_VERSION,
      ledgerId: this.ledgerId,
      startedAt: this.startedAt,
      capturedAt: this.timestamp(),
      configured: { ...this.configured },
      effective: { ...this.effective },
      reserved: { ...this.reserved },
      executed: { ...this.executed },
      succeeded: this.succeeded,
      failed: this.failed,
      retried: this.retried,
      deduplicated: this.deduplicated,
      blockedByBudget: this.blocks.length,
      blockedByDimension: this.blocks.reduce<Partial<Record<ExecutionBudgetDimension, number>>>((counts, block) => {
        counts[block.dimension] = (counts[block.dimension] ?? 0) + 1;
        return counts;
      }, {}),
      blocks: this.blocks.map((block) => ({ ...block })),
      events: this.events.map((event) => ({ ...event, dimensions: { ...event.dimensions } })),
    };
  }
}

export function auditBudgetAuthority(input: {
  authoritative: AuthoritativeExecutionBudgetSnapshot;
  reported: AuthoritativeExecutionBudgetSnapshot;
  auditedAt?: string;
}) {
  const mismatches: BudgetAuthorityMismatch[] = [];
  if (!same(input.authoritative.configured, input.reported.configured)) {
    mismatches.push({ code: "CONFIGURED_BUDGET_MISMATCH", detail: "reported configured limits differ from the authoritative ledger" });
  }
  if (!same(input.authoritative.effective, input.reported.effective)) {
    mismatches.push({ code: "EFFECTIVE_BUDGET_MISMATCH", detail: "reported effective limits differ from the authoritative ledger" });
  }
  if (!same(input.authoritative.reserved, input.reported.reserved)) {
    mismatches.push({ code: "RESERVED_COUNT_MISMATCH", detail: "reported reservations differ from the authoritative ledger" });
  }
  if (!same(input.authoritative.executed, input.reported.executed)) {
    mismatches.push({ code: "EXECUTED_COUNT_MISMATCH", detail: "reported executed counts differ from the authoritative ledger" });
  }
  if (!same(
    [input.authoritative.succeeded, input.authoritative.failed, input.authoritative.retried, input.authoritative.deduplicated, input.authoritative.blockedByBudget],
    [input.reported.succeeded, input.reported.failed, input.reported.retried, input.reported.deduplicated, input.reported.blockedByBudget],
  )) {
    mismatches.push({ code: "OUTCOME_COUNT_MISMATCH", detail: "reported outcomes differ from the authoritative ledger" });
  }
  for (const dimension of DIMENSIONS) {
    if (input.authoritative.executed[dimension] > input.authoritative.reserved[dimension]) {
      mismatches.push({ code: "HIDDEN_ATTEMPT", detail: `${dimension}: executed exceeds reserved` });
    }
    if (dimension !== "elapsedTime" && input.authoritative.reserved[dimension] > input.authoritative.effective[dimension]) {
      mismatches.push({ code: "BUDGET_OVERRUN", detail: `${dimension}: reserved exceeds effective limit` });
    }
  }
  return {
    schemaVersion: "researchforge-budget-authority-audit/v5" as const,
    auditedAt: input.auditedAt ?? new Date().toISOString(),
    ledgerId: input.authoritative.ledgerId,
    pass: mismatches.length === 0,
    closureAllowed: mismatches.length === 0,
    mismatchCount: mismatches.length,
    mismatches,
    authoritative: input.authoritative,
    reported: input.reported,
  };
}
