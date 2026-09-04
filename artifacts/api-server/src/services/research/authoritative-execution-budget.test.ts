import assert from "node:assert/strict";
import test from "node:test";

import {
  auditBudgetAuthority,
  AuthoritativeExecutionBudgetLedger,
  deriveSearchBudgetLimits,
} from "./authoritative-execution-budget";
import { searchSourceProvider } from "../source-retrieval";
import { getSourceProviderConfigs } from "../source-provider-config";

function ledger(overrides: Partial<ReturnType<typeof deriveSearchBudgetLimits>> = {}) {
  return new AuthoritativeExecutionBudgetLedger({
    configured: {
      ...deriveSearchBudgetLimits({
        queryBudget: 3,
        providerBudget: 3,
        maxPagesPerProviderQuery: 1,
        maxRetriesPerRequest: 0,
        fallbackLayerBudget: 3,
        materializationBudget: 2,
      }),
      ...overrides,
    },
    providerAliases: {
      openalex_alias: "openalex",
    },
    startedAt: "2026-08-29T00:00:00.000Z",
  });
}

function operation(index: number, overrides: Record<string, unknown> = {}) {
  return {
    operation: "provider_request" as const,
    query: `query ${index}`,
    provider: "openalex",
    requestIdentity: `https://example.test/search?q=${index}`,
    fallbackLayer: 1,
    ...overrides,
  };
}

test("exact-boundary request is allowed and executed", async () => {
  const budget = ledger({ requestAttempt: 1 });
  let calls = 0;
  const result = await budget.execute(operation(1), async () => {
    calls += 1;
    return "ok";
  });
  assert.equal(result.status, "EXECUTED");
  assert.equal(calls, 1);
  assert.equal(budget.snapshot().executed.requestAttempt, 1);
});

test("one-over-boundary request is blocked before side effect", async () => {
  const budget = ledger({ requestAttempt: 1 });
  let calls = 0;
  const effect = async () => {
    calls += 1;
    return "ok";
  };
  assert.equal((await budget.execute(operation(1), effect)).status, "EXECUTED");
  const blocked = await budget.execute(operation(2), effect);
  assert.equal(blocked.status, "BLOCKED_BY_BUDGET");
  assert.equal(blocked.reasonCode, "BUDGET_EXHAUSTED");
  assert.equal(calls, 1);
});

test("retry after transient failure consumes retry and request-attempt budgets", async () => {
  const budget = ledger({ requestAttempt: 2, retry: 1 });
  let calls = 0;
  const first = await budget.execute(operation(1), async () => {
    calls += 1;
    throw new Error("transient");
  });
  const second = await budget.execute(operation(1, { attemptType: "retry" }), async () => {
    calls += 1;
    return "recovered";
  });
  assert.equal(first.status, "FAILED");
  assert.equal(second.status, "EXECUTED");
  assert.equal(calls, 2);
  assert.equal(budget.snapshot().reserved.retry, 1);
  assert.equal(budget.snapshot().retried, 1);
});

test("nested fallback cascade remains within every effective bound", async () => {
  const budget = ledger();
  let calls = 0;
  for (let index = 1; index <= 3; index += 1) {
    const result = await budget.execute(operation(index, { fallbackLayer: index }), async () => {
      calls += 1;
      return index;
    });
    assert.equal(result.status, "EXECUTED");
  }
  assert.equal(calls, 3);
  assert.equal(budget.snapshot().reserved.fallbackLayer, 3);
  assert.equal(budget.snapshot().blockedByBudget, 0);
});

test("duplicate request is deduplicated and never reaches side effect", async () => {
  const budget = ledger();
  let calls = 0;
  const effect = async () => {
    calls += 1;
    return "ok";
  };
  await budget.execute(operation(1), effect);
  const duplicate = await budget.execute(operation(1), effect);
  assert.equal(duplicate.status, "DEDUPLICATED");
  assert.equal(calls, 1);
  assert.equal(budget.snapshot().deduplicated, 1);
  assert.equal(budget.snapshot().executed.requestAttempt, 1);
});

test("provider aliases share one upstream provider budget", async () => {
  const budget = ledger({ provider: 1, query: 2, providerQueryPair: 2, requestAttempt: 2 });
  let calls = 0;
  for (const [index, provider] of [[1, "openalex"], [2, "openalex_alias"]] as const) {
    const result = await budget.execute(operation(index, { provider }), async () => {
      calls += 1;
      return "ok";
    });
    assert.equal(result.status, "EXECUTED");
  }
  assert.equal(calls, 2);
  assert.equal(budget.snapshot().reserved.provider, 1);
});

test("concurrent reservations cannot race beyond the request limit", async () => {
  const budget = ledger({ query: 10, providerQueryPair: 10, requestAttempt: 3 });
  let calls = 0;
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) => budget.execute(operation(index + 1), async () => {
      calls += 1;
      await Promise.resolve();
      return index;
    })),
  );
  assert.equal(calls, 3);
  assert.equal(results.filter((result) => result.status === "EXECUTED").length, 3);
  assert.equal(results.filter((result) => result.status === "BLOCKED_BY_BUDGET").length, 7);
});

test("budget exhaustion produces a typed terminal blocker", async () => {
  const budget = ledger({ query: 0, requestAttempt: 0, providerQueryPair: 0 });
  let calls = 0;
  const result = await budget.execute(operation(1), async () => {
    calls += 1;
    return "unexpected";
  });
  assert.equal(result.status, "BLOCKED_BY_BUDGET");
  assert.equal(result.block?.dimension, "query");
  assert.equal(result.block?.reasonCode, "QUERY_BUDGET_EXHAUSTED");
  assert.equal(calls, 0);
});

test("budget report mismatch fails the authority audit", async () => {
  const budget = ledger();
  await budget.execute(operation(1), async () => "ok");
  const snapshot = budget.snapshot();
  const audit = auditBudgetAuthority({
    authoritative: snapshot,
    reported: {
      ...snapshot,
      executed: { ...snapshot.executed, requestAttempt: 99 },
    },
    auditedAt: "2026-08-29T00:01:00.000Z",
  });
  assert.equal(audit.pass, false);
  assert.ok(audit.mismatches.some((item) => item.code === "EXECUTED_COUNT_MISMATCH"));
});

test("legacy 3/3 cascade projects to an explicit theoretical request formula", () => {
  const limits = deriveSearchBudgetLimits({
    queryBudget: 3,
    providerBudget: 3,
    maxPagesPerProviderQuery: 2,
    maxRetriesPerRequest: 1,
    fallbackLayerBudget: 3,
    materializationBudget: 0,
  });
  assert.equal(limits.query, 3);
  assert.equal(limits.provider, 3);
  assert.equal(limits.providerQueryPair, 9);
  assert.equal(limits.requestAttempt, 36);
  assert.equal(limits.retry, 18);
});

test("real provider adapter blocks before fetch when request budget is exhausted", async () => {
  const budget = ledger({ requestAttempt: 0 });
  let fetchCalls = 0;
  const config = {
    ...getSourceProviderConfigs().OpenAlex,
    endpoint: "https://example.test/openalex",
    timeoutMs: 50,
  };
  const result = await searchSourceProvider("OpenAlex", "bounded adapter", {
    providerConfigs: { OpenAlex: config },
    executionBudget: budget,
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ results: [] }));
    },
  });
  assert.equal(fetchCalls, 0);
  assert.equal(result.ok, false);
  assert.equal(result.error_type, "budget_exhausted");
  assert.equal(budget.snapshot().blockedByBudget, 1);
});
