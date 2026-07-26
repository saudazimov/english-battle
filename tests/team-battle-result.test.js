const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createTeamBattleResultController,
} = require("../src/controllers/teamBattleResultController");
const createTeamBattleResultRoutes = require("../src/routes/teamBattleResultRoutes");

const sessionSql = "SELECT state FROM battle_sessions WHERE room_id = $1 LIMIT 1";
const historySql =
  "SELECT xp_earned, rating_change FROM battle_history WHERE room_id = $1 AND user_id = $2 LIMIT 1";

function createSnapshot(overrides = {}) {
  return {
    playerTeams: { "42": "A", "7": "B" },
    teamA: [{ userId: 42, score: 8 }],
    teamB: [{ userId: "7", score: 6 }],
    teamAScore: 14,
    teamBScore: 10,
    winningTeam: "A",
    teamMode: "2v2",
    level: "B1",
    total_questions: 10,
    ...overrides,
  };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function createHarness({ sessionRows, historyRows, sessionError, historyError } = {}) {
  const calls = [];
  let queryCount = 0;
  const snapshot = createSnapshot();
  const controller = createTeamBattleResultController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", sql, params]);
        if (queryCount === 1) {
          if (sessionError) throw sessionError;
          return {
            rows:
              sessionRows === undefined
                ? [{ state: { result_snapshot: snapshot } }]
                : sessionRows,
          };
        }
        if (historyError) throw historyError;
        return {
          rows:
            historyRows === undefined
              ? [{ xp_earned: 25, rating_change: 12 }]
              : historyRows,
        };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, snapshot };
}

test("team battle result preserves all snapshot-not-found conditions", async () => {
  const cases = [[], [{ state: null }], [{ state: {} }]];

  for (const sessionRows of cases) {
    const harness = createHarness({ sessionRows });
    const response = createResponse();
    const result = await harness.controller.getResult(
      { user: { id: 42 }, params: { roomId: "room-7" } },
      response
    );

    assert.equal(result, response);
    assert.deepEqual(harness.calls, [
      ["query", sessionSql, ["room-7"]],
    ]);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.body, { error: "Natija topilmadi" });
  }
});

test("team battle result preserves participant IDOR response", async () => {
  const snapshot = createSnapshot({ playerTeams: { "7": "B" } });
  const harness = createHarness({
    sessionRows: [{ state: { result_snapshot: snapshot } }],
  });
  const response = createResponse();

  const result = await harness.controller.getResult(
    { user: { id: 42 }, params: { roomId: "room-7" } },
    response
  );

  assert.equal(result, response);
  assert.equal(harness.calls.length, 1);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: "Bu natijaga ruxsat yo'q" });
});

test("team battle result preserves A-team perspective and history values", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.getResult(
    { user: { id: 42 }, params: { roomId: "room-7" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["query", sessionSql, ["room-7"]],
    ["query", historySql, ["room-7", 42]],
  ]);
  assert.deepEqual(response.body, {
    teamMode: "2v2",
    level: "B1",
    total: 10,
    outcome: "win",
    myScore: 8,
    myTeamScore: 14,
    enemyTeamScore: 10,
    myTeamPlayers: harness.snapshot.teamA,
    enemyTeamPlayers: harness.snapshot.teamB,
    xp_earned: 25,
    rating_change: 12,
  });
});

test("team battle result preserves B-team draw perspective", async () => {
  const snapshot = createSnapshot({ winningTeam: null });
  const harness = createHarness({
    sessionRows: [{ state: { result_snapshot: snapshot } }],
    historyRows: [],
  });
  const response = createResponse();

  await harness.controller.getResult(
    { user: { id: 7 }, params: { roomId: "room-7" } },
    response
  );

  assert.equal(response.body.outcome, "draw");
  assert.equal(response.body.myScore, 6);
  assert.equal(response.body.myTeamScore, 10);
  assert.equal(response.body.enemyTeamScore, 14);
  assert.equal(response.body.myTeamPlayers, snapshot.teamB);
  assert.equal(response.body.enemyTeamPlayers, snapshot.teamA);
  assert.equal(response.body.xp_earned, 0);
  assert.equal(response.body.rating_change, 0);
});

test("team battle result preserves history-query fallback without logging", async () => {
  const harness = createHarness({ historyError: new Error("history failed") });
  const response = createResponse();

  await harness.controller.getResult(
    { user: { id: 42 }, params: { roomId: "room-7" } },
    response
  );

  assert.deepEqual(harness.calls.map((call) => call[0]), ["query", "query"]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.xp_earned, 0);
  assert.equal(response.body.rating_change, 0);
});

test("team battle result preserves outer error logging and response", async () => {
  const harness = createHarness({ sessionError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.getResult(
    { user: { id: 42 }, params: { roomId: "room-7" } },
    response
  );

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Jamoa natija olish xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("team battle result route preserves path, method, and middleware order", () => {
  const router = createTeamBattleResultRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/team-battle/result/:roomId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
