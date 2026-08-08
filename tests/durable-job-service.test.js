const test = require("node:test");
const assert = require("node:assert/strict");

const {
  JobTimeoutError,
  createDurableJobService,
} = require("../src/services/durableJobService");

function normalized(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function fakePool(resolver) {
  const calls = [];
  return {
    calls,
    async connect() {
      return {
        async query(sql, params = []) {
          const clean = normalized(sql);
          calls.push([clean, params]);
          if (["BEGIN", "COMMIT", "ROLLBACK"].includes(clean)) return { rows: [] };
          return resolver(clean, params, calls);
        },
        release() { calls.push(["release", []]); },
      };
    },
  };
}

function job(overrides = {}) {
  return {
    id: 7,
    job_type: "question_analysis",
    entity_type: "question",
    entity_id: "42",
    status: "pending",
    retry_count: 0,
    max_retries: 3,
    payload: { question_id: 42 },
    ...overrides,
  };
}

test("durable jobs enqueue idempotently and audit only newly inserted work", async () => {
  let inserted = true;
  const pool = fakePool((sql) => {
    if (sql.startsWith("INSERT INTO ai_generation_jobs")) {
      const rows = inserted ? [job()] : [];
      inserted = false;
      return { rows };
    }
    if (sql.startsWith("INSERT INTO ai_generation_logs")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const service = createDurableJobService({ pool, jobType: "question_analysis" });
  const input = {
    entityType: "question", entityId: 42, payload: { reason: "saved" },
    idempotencyKey: "question-analysis:42:v1",
  };

  assert.equal((await service.enqueue(input)).id, 7);
  assert.equal(await service.enqueue(input), null);

  const jobWrites = pool.calls.filter(([sql]) => sql.startsWith("INSERT INTO ai_generation_jobs"));
  const auditWrites = pool.calls.filter(([sql]) => sql.startsWith("INSERT INTO ai_generation_logs"));
  assert.equal(jobWrites.length, 2);
  assert.equal(auditWrites.length, 1);
  assert.deepEqual(jobWrites[0][1].slice(0, 3), ["question_analysis", "question", "42"]);
});

test("durable jobs claim atomically with stale-lock recovery and audit", async () => {
  const pending = job();
  const running = { ...pending, status: "running" };
  const pool = fakePool((sql, params) => {
    if (sql.startsWith("SELECT * FROM ai_generation_jobs")) {
      assert.match(sql, /FOR UPDATE SKIP LOCKED/);
      assert.deepEqual(params, ["question_analysis", 300000]);
      return { rows: [pending] };
    }
    if (sql.startsWith("UPDATE ai_generation_jobs")) return { rows: [running] };
    if (sql.startsWith("INSERT INTO ai_generation_logs")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const service = createDurableJobService({ pool, jobType: "question_analysis" });

  const claimed = await service.claimNext();

  assert.equal(claimed.status, "running");
  assert.deepEqual(pool.calls.map(([sql]) => sql.split(" ")[0]), [
    "BEGIN", "SELECT", "UPDATE", "INSERT", "COMMIT", "release",
  ]);
});

test("durable jobs complete or retry with transactional audit", async () => {
  const running = job({ status: "running" });
  const pool = fakePool((sql, params) => {
    if (sql.startsWith("UPDATE ai_generation_jobs")) {
      return { rows: [{ ...running, status: params[1] || "completed", retry_count: params[2] || 0 }] };
    }
    if (sql.startsWith("INSERT INTO ai_generation_logs")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const service = createDurableJobService({
    pool,
    jobType: "question_analysis",
    retryDelayMs: () => 45000,
  });

  assert.equal(await service.execute(running, async () => "done"), "done");
  await assert.rejects(service.execute(running, async () => {
    throw Object.assign(new Error("provider failed"), { code: "AI_PROVIDER" });
  }), /provider failed/);

  const updates = pool.calls.filter(([sql]) => sql.startsWith("UPDATE ai_generation_jobs"));
  assert.equal(updates.length, 2);
  assert.deepEqual(updates[1][1].slice(1), ["pending", 1, "provider failed", 45000]);
  const logs = pool.calls.filter(([sql]) => sql.startsWith("INSERT INTO ai_generation_logs"));
  assert.equal(logs.length, 2);
  assert.equal(logs[1][1][1], "retry_scheduled");
  assert.equal(logs[1][1][2], 1);
  assert.equal(logs[1][1][4], "AI_PROVIDER");
});

test("durable jobs time out safely and rollback failed claims", async () => {
  const running = job({ status: "running", max_retries: 1 });
  const timeoutPool = fakePool((sql, params) => {
    if (sql.startsWith("UPDATE ai_generation_jobs")) {
      return { rows: [{ ...running, status: params[1], retry_count: params[2] }] };
    }
    if (sql.startsWith("INSERT INTO ai_generation_logs")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const timeoutService = createDurableJobService({
    pool: timeoutPool,
    jobType: "question_analysis",
    executionTimeoutMs: 5,
  });

  // The service intentionally unrefs its timeout so an idle worker can exit.
  // Keep this isolated test alive long enough to observe that timeout on CI.
  const keepEventLoopAlive = setTimeout(() => {}, 100);
  try {
    await assert.rejects(
      timeoutService.execute(running, () => new Promise(() => {})),
      (error) => error instanceof JobTimeoutError && error.code === "JOB_TIMEOUT"
    );
  } finally {
    clearTimeout(keepEventLoopAlive);
  }
  const timeoutLog = timeoutPool.calls.find(([sql]) => sql.startsWith("INSERT INTO ai_generation_logs"));
  assert.equal(timeoutLog[1][1], "failed");
  assert.equal(timeoutLog[1][4], "JOB_TIMEOUT");

  const rollbackPool = fakePool((sql) => {
    if (sql.startsWith("SELECT * FROM ai_generation_jobs")) throw new Error("claim failed");
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const rollbackService = createDurableJobService({ pool: rollbackPool, jobType: "question_analysis" });
  await assert.rejects(rollbackService.claimNext(), /claim failed/);
  assert.deepEqual(rollbackPool.calls.map(([sql]) => sql), ["BEGIN",
    rollbackPool.calls[1][0], "ROLLBACK", "release"]);
});
