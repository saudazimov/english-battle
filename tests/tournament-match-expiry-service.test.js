const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTournamentMatchExpiryService,
} = require("../src/services/tournamentMatchExpiryService");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createHarness({ queryImpl, connectError } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push(["query", normalizeSql(sql), params]);
      return queryImpl(sql, params, calls.filter((call) => call[0] === "query").length);
    },
    release() {
      calls.push(["release"]);
    },
  };
  const expireTournamentMatch = createTournamentMatchExpiryService({
    pool: {
      async connect() {
        calls.push(["connect"]);
        if (connectError) throw connectError;
        return client;
      },
    },
    async checkMatchCompletion(matchId) {
      calls.push(["completion", matchId]);
    },
    logger: {
      error(...args) { calls.push(["error", ...args]); },
    },
    currentDate: () => new Date("2026-07-26T12:00:00.000Z"),
  });
  return { calls, expireTournamentMatch };
}

test("tournament match expiry preserves connection error propagation", async () => {
  const harness = createHarness({ connectError: new Error("connect failed") });

  await assert.rejects(harness.expireTournamentMatch(10), { message: "connect failed" });
  assert.deepEqual(harness.calls, [["connect"]]);
});

test("tournament match expiry rolls back guarded matches and releases client", async () => {
  const guardedRows = [
    [],
    [{ status: "done", deadline: "2026-07-26T11:00:00.000Z" }],
    [{ status: "live", deadline: "2026-07-26T13:00:00.000Z" }],
  ];

  for (const rows of guardedRows) {
    const harness = createHarness({
      queryImpl(sql, params, queryNumber) {
        if (queryNumber === 1) return { rows: [] };
        if (queryNumber === 2) return { rows };
        return { rows: [] };
      },
    });

    assert.equal(await harness.expireTournamentMatch(11), false);
    assert.deepEqual(harness.calls.map((call) => call[0]), [
      "connect", "query", "query", "query", "release",
    ]);
    assert.equal(harness.calls[3][1], "ROLLBACK");
    assert.equal(harness.calls.some((call) => call[0] === "completion"), false);
  }
});

test("tournament match expiry preserves update, commit, and completion order", async () => {
  const deadline = "2026-07-26T11:59:59.000Z";
  const harness = createHarness({
    queryImpl(sql, params, queryNumber) {
      if (queryNumber === 2) return { rows: [{ status: "live", deadline }] };
      return { rows: [] };
    },
  });

  assert.equal(await harness.expireTournamentMatch(12), true);

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "connect", "query", "query", "query", "query", "completion", "release",
  ]);
  assert.equal(harness.calls[1][1], "BEGIN");
  assert.match(harness.calls[2][1], /^SELECT m\.status,/);
  assert.deepEqual(harness.calls[2][2], [12]);
  assert.match(harness.calls[3][1], /^UPDATE tournament_match_players/);
  assert.deepEqual(harness.calls[3][2], [12, deadline]);
  assert.equal(harness.calls[4][1], "COMMIT");
  assert.deepEqual(harness.calls[5], ["completion", 12]);
});

test("tournament match expiry preserves transaction error handling and rollback fallback", async () => {
  const harness = createHarness({
    queryImpl(sql, params, queryNumber) {
      if (queryNumber === 1) return { rows: [] };
      if (queryNumber === 2) throw new Error("select failed");
      if (queryNumber === 3) throw new Error("rollback failed");
      return { rows: [] };
    },
  });

  assert.equal(await harness.expireTournamentMatch(13), false);

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "connect", "query", "query", "query", "error", "release",
  ]);
  assert.equal(harness.calls[3][1], "ROLLBACK");
  assert.deepEqual(harness.calls[4], ["error", "Match timeout xatosi:", "select failed"]);
});
