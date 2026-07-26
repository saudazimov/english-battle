const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTournamentMatchCheckinService,
} = require("../src/services/tournamentMatchCheckinService");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createHarness({ queryImpl, connectError, notificationImpl } = {}) {
  const calls = [];
  let queryNumber = 0;
  const client = {
    async query(sql, params) {
      queryNumber++;
      const normalized = normalizeSql(sql);
      calls.push(["query", normalized, params]);
      return queryImpl(normalized, params, queryNumber);
    },
    release() {
      calls.push(["release"]);
    },
  };
  const openMatchCheckin = createTournamentMatchCheckinService({
    pool: {
      async connect() {
        calls.push(["connect"]);
        if (connectError) throw connectError;
        return client;
      },
    },
    notifyMatchPlayers(matchId, event, payload) {
      calls.push(["notify", matchId, event, payload]);
      return notificationImpl ? notificationImpl() : undefined;
    },
    logger: {
      log(...args) { calls.push(["log", ...args]); },
      error(...args) { calls.push(["error", ...args]); },
    },
  });
  return { calls, openMatchCheckin };
}

function match() {
  return {
    id: 15,
    tournament_id: 4,
    school_a: "School A",
    school_a_key: "a-key",
    school_b: "School B",
    school_b_key: "b-key",
    scheduled_at: "2026-07-26T12:00:00.000Z",
  };
}

test("tournament check-in preserves connection error propagation", async () => {
  const harness = createHarness({
    connectError: new Error("connect failed"),
    queryImpl() { return { rows: [] }; },
  });

  await assert.rejects(harness.openMatchCheckin(match()), { message: "connect failed" });
  assert.deepEqual(harness.calls, [["connect"]]);
});

test("tournament check-in preserves roster creation and query order", async () => {
  const currentMatch = match();
  const harness = createHarness({
    queryImpl(sql, params) {
      if (sql.startsWith("SELECT user_id")) {
        return params[1] === "a-key"
          ? { rows: [{ user_id: 101 }, { user_id: 102 }] }
          : { rows: [{ user_id: 201 }] };
      }
      if (sql.startsWith("SELECT id FROM tournament_match_players")) {
        return { rows: params[1] === 102 ? [{ id: 99 }] : [] };
      }
      return { rows: [] };
    },
  });

  assert.equal(await harness.openMatchCheckin(currentMatch), undefined);

  const queries = harness.calls.filter((call) => call[0] === "query");
  assert.equal(queries[0][1], "BEGIN");
  assert.equal(queries[1][1], "UPDATE tournament_matches SET status = 'checkin' WHERE id = $1");
  assert.deepEqual(queries[1][2], [15]);
  assert.deepEqual(
    queries.filter((call) => call[1].startsWith("SELECT user_id")).map((call) => call[2]),
    [[4, "a-key"], [4, "b-key"]]
  );
  assert.deepEqual(
    queries.filter((call) => call[1].startsWith("INSERT INTO tournament_match_players")).map((call) => call[2]),
    [
      [15, 101, "School A", "a-key"],
      [15, 201, "School B", "b-key"],
    ]
  );
  assert.equal(queries.at(-1)[1], "COMMIT");
  assert.deepEqual(harness.calls.slice(-3), [
    ["log", "[Turnir] Match #15 (School A vs School B) — CHECK-IN ochildi"],
    ["notify", 15, "matchCheckinOpen", {
      matchId: 15,
      scheduledAt: "2026-07-26T12:00:00.000Z",
      schoolA: "School A",
      schoolB: "School B",
    }],
    ["release"],
  ]);
});

test("tournament check-in preserves missing-team skip", async () => {
  const currentMatch = match();
  currentMatch.school_b_key = null;
  const harness = createHarness({
    queryImpl(sql) {
      if (sql.startsWith("SELECT user_id")) return { rows: [] };
      return { rows: [] };
    },
  });

  await harness.openMatchCheckin(currentMatch);

  const memberQueries = harness.calls.filter(
    (call) => call[0] === "query" && call[1].startsWith("SELECT user_id")
  );
  assert.equal(memberQueries.length, 1);
  assert.deepEqual(memberQueries[0][2], [4, "a-key"]);
});

test("tournament check-in preserves non-awaited notification", async () => {
  const harness = createHarness({
    queryImpl(sql) {
      if (sql.startsWith("SELECT user_id")) return { rows: [] };
      return { rows: [] };
    },
    notificationImpl: () => new Promise(() => {}),
  });

  assert.equal(await harness.openMatchCheckin(match()), undefined);
  assert.equal(harness.calls.at(-1)[0], "release");
});

test("tournament check-in preserves rollback, logging, and release on query error", async () => {
  const harness = createHarness({
    queryImpl(sql) {
      if (sql.startsWith("UPDATE tournament_matches")) throw new Error("update failed");
      return { rows: [] };
    },
  });

  assert.equal(await harness.openMatchCheckin(match()), undefined);

  assert.deepEqual(harness.calls.slice(-3), [
    ["query", "ROLLBACK", undefined],
    ["error", "openMatchCheckin xatosi:", "update failed"],
    ["release"],
  ]);
});
