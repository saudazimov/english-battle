const test = require("node:test");
const assert = require("node:assert/strict");

const { AiBudgetExceededError, createAiBudgetService } = require("../src/services/aiBudgetService");

function harness(spentUsd = 0) {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push([sql, params]);
      if (sql.includes("AS spent_usd")) return { rows: [{ spent_usd: spentUsd }] };
      if (sql.includes("RETURNING id")) return { rows: [{ id: 77 }] };
      return { rows: [] };
    },
    release() { calls.push(["release", []]); },
  };
  const pool = {
    async connect() { return client; },
    async query(sql, params = []) { calls.push([sql, params]); return { rows: [] }; },
  };
  return { pool, calls };
}

test("budget service atomically reserves then records actual usage", async () => {
  const { pool, calls } = harness(2.25);
  const service = createAiBudgetService({
    getPool: () => pool,
    environment: { AI_MONTHLY_HARD_LIMIT_USD: "10", AI_BUDGET_RESERVATION_TTL_MINUTES: "20" },
  });

  const reservation = await service.reserve({
    provider: "openai", model: "gpt-4o-mini", estimatedCostUsd: 0.5,
    promptVersion: "p1", schemaVersion: "s1",
  });
  await service.finalize(reservation, { usage: { input: 100, output: 20 }, actualCostUsd: 0.03 });

  assert.deepEqual(reservation, { id: 77, reservedCostUsd: 0.5 });
  assert.ok(calls.some(([sql]) => String(sql).includes("pg_advisory_xact_lock")));
  assert.ok(calls.some(([sql]) => String(sql).includes("event_type='provider_response'")));
});

test("budget service rejects a request before inserting when monthly hard limit is exceeded", async () => {
  const { pool, calls } = harness(9.8);
  const service = createAiBudgetService({
    getPool: () => pool,
    environment: { AI_MONTHLY_HARD_LIMIT_USD: "10" },
  });

  await assert.rejects(
    service.reserve({ provider: "openai", model: "m", estimatedCostUsd: 0.3 }),
    (error) => error instanceof AiBudgetExceededError && error.code === "AI_BUDGET_EXCEEDED"
  );
  assert.equal(calls.some(([sql]) => String(sql).includes("INSERT INTO ai_generation_logs")), false);
  assert.ok(calls.some(([sql]) => sql === "ROLLBACK"));
});

test("budget service stays disabled when no production hard limit is configured", async () => {
  const service = createAiBudgetService({
    getPool: () => { throw new Error("pool must stay lazy"); },
    environment: { AI_MONTHLY_HARD_LIMIT_USD: "0" },
  });

  assert.equal(service.isEnforced(), false);
  assert.equal(await service.reserve({ estimatedCostUsd: 1 }), null);
});
