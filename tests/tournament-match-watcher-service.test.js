const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTournamentMatchWatcherService,
} = require("../src/services/tournamentMatchWatcherService");

function createHarness({ queryResults, openError } = {}) {
  const calls = [];
  const results = queryResults.slice();
  const now = new Date("2026-07-26T12:00:00.000Z");
  const tournamentMatchWatcher = createTournamentMatchWatcherService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
        return results.shift();
      },
    },
    async openMatchCheckin(match) {
      calls.push(["openCheckin", match]);
      if (openError && match.id === openError.matchId) throw openError.error;
    },
    async startMatchLive(match) {
      calls.push(["startLive", match]);
    },
    async expireTournamentMatch(matchId) {
      calls.push(["expire", matchId]);
    },
    logger: {
      error(...args) { calls.push(["error", ...args]); },
    },
    currentDate: () => now,
  });
  return { calls, now, tournamentMatchWatcher };
}

test("tournament watcher preserves query and sequential transition order", async () => {
  const checkin1 = { id: 1 };
  const checkin2 = { id: 2 };
  const live = { id: 3 };
  const harness = createHarness({
    queryResults: [
      { rows: [checkin1, checkin2] },
      { rows: [live] },
      { rows: [{ id: 4 }, { id: 5 }] },
    ],
  });

  assert.equal(await harness.tournamentMatchWatcher(), undefined);

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "query", "openCheckin", "openCheckin",
    "query", "startLive",
    "query", "expire", "expire",
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "openCheckin"), [
    ["openCheckin", checkin1],
    ["openCheckin", checkin2],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "expire"), [
    ["expire", 4],
    ["expire", 5],
  ]);
});

test("tournament watcher preserves one time snapshot and 15-minute threshold", async () => {
  const harness = createHarness({
    queryResults: [{ rows: [] }, { rows: [] }, { rows: [] }],
  });

  await harness.tournamentMatchWatcher();

  const queries = harness.calls.filter((call) => call[0] === "query");
  assert.equal(queries.length, 3);
  assert.equal(queries[0][2][0].toISOString(), "2026-07-26T12:15:00.000Z");
  assert.equal(queries[1][2][0], harness.now);
  assert.equal(queries[2][2][0], harness.now);
  assert.match(queries[0][1], /WHERE status = 'pending'/);
  assert.match(queries[1][1], /WHERE status = 'checkin'/);
  assert.match(queries[2][1], /WHERE m\.status = 'live'/);
});

test("tournament watcher preserves stop-and-log behavior after helper error", async () => {
  const harness = createHarness({
    queryResults: [
      { rows: [{ id: 1 }, { id: 2 }] },
      { rows: [{ id: 3 }] },
      { rows: [{ id: 4 }] },
    ],
    openError: { matchId: 2, error: new Error("checkin failed") },
  });

  assert.equal(await harness.tournamentMatchWatcher(), undefined);

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "query", "openCheckin", "openCheckin", "error",
  ]);
  assert.deepEqual(harness.calls.at(-1), ["error", "Match watcher xatosi:", "checkin failed"]);
});

test("tournament watcher preserves query-error logging", async () => {
  const calls = [];
  const tournamentMatchWatcher = createTournamentMatchWatcherService({
    pool: {
      async query() { throw new Error("query failed"); },
    },
    openMatchCheckin() {},
    startMatchLive() {},
    expireTournamentMatch() {},
    logger: {
      error(...args) { calls.push(args); },
    },
  });

  assert.equal(await tournamentMatchWatcher(), undefined);
  assert.deepEqual(calls, [["Match watcher xatosi:", "query failed"]]);
});
