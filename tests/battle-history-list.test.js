const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createBattleHistoryListController,
} = require("../src/controllers/battleHistoryListController");
const createBattleHistoryListRoutes = require("../src/routes/battleHistoryListRoutes");

const historySql =
  "SELECT bh.opponent_name, bh.my_score, bh.opponent_score, bh.outcome, bh.xp_earned, bh.rating_change, bh.played_at, bh.cefr_level, bh.opponent_id, bh.mode, opp.profile_picture AS opponent_picture, opp.rating AS opponent_rating FROM battle_history bh LEFT JOIN users opp ON opp.id = bh.opponent_id WHERE bh.user_id = $1 ORDER BY bh.played_at DESC LIMIT 50";

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
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

function createHarness({ rows = [{ opponent_name: "Opponent" }], queryError } = {}) {
  const calls = [];
  const controller = createBattleHistoryListController({
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return { rows };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

test("battle history list uses the opened profile ID, SQL, and response", async () => {
  const rows = [{ opponent_name: "Opponent", outcome: "win" }];
  const harness = createHarness({ rows });
  const response = createResponse();

  await harness.controller.list(
    { user: { id: 42 }, params: { userId: "999" } },
    response
  );

  assert.deepEqual(harness.calls, [["query", historySql, ["999"]]]);
  assert.deepEqual(response.body, { history: rows });
});

test("battle history list preserves error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.list(
    { user: { id: 42 }, params: { userId: "42" } },
    response
  );

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Tarix xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("battle history list route preserves path, method, and middleware order", () => {
  const router = createBattleHistoryListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/history/:userId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
