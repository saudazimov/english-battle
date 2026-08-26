const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createBattleResultController,
} = require("../src/controllers/battleResultController");
const createBattleResultRoutes = require("../src/routes/battleResultRoutes");

const resultSql =
  "SELECT bh.opponent_name, bh.opponent_id, bh.my_score, bh.opponent_score, bh.outcome, bh.xp_earned, bh.rating_change, bh.cefr_level, bh.mode, bh.total_questions, bh.played_at, bh.is_rated, bh.rating_before, bh.rating_after, opp.profile_picture AS opponent_picture, opp.rating AS opponent_rating, me.profile_picture AS my_picture, me.cefr_level AS current_cefr_level FROM battle_history bh LEFT JOIN users opp ON opp.id = bh.opponent_id LEFT JOIN users me ON me.id = bh.user_id WHERE bh.room_id = $1 AND bh.user_id = $2 LIMIT 1";
const answersSql =
  "SELECT ba.question_id, ba.q_order, ba.selected_option AS your_answer, ba.correct_option AS correct_answer, ba.is_correct, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.explanation FROM battle_answers ba JOIN questions q ON q.id = ba.question_id WHERE ba.room_id = $1 AND ba.user_id = $2 ORDER BY ba.q_order ASC";

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

function createHarness({ found = true, errorAt } = {}) {
  const calls = [];
  let queryCount = 0;
  const resultRow = { opponent_name: "Opponent", outcome: "win" };
  const answerRows = [{ question_id: 10, is_correct: true }];
  const controller = createBattleResultController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === errorAt) throw new Error("database failed");
        if (queryCount === 1) return { rows: found ? [resultRow] : [] };
        return { rows: answerRows };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { answerRows, calls, controller, resultRow };
}

test("battle result preserves IDOR query and not-found response", async () => {
  const harness = createHarness({ found: false });
  const response = createResponse();

  const result = await harness.controller.getResult(
    { user: { id: 42 }, params: { roomId: "room-7" } },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [
    ["query", resultSql, ["room-7", 42]],
  ]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Natija topilmadi" });
});

test("battle result preserves sequential SQL and response references", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.getResult(
    { user: { id: 42 }, params: { roomId: "room-7" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["query", resultSql, ["room-7", 42]],
    ["query", answersSql, ["room-7", 42]],
  ]);
  assert.equal(response.body.result, harness.resultRow);
  assert.equal(response.body.answers, harness.answerRows);
});

test("battle result preserves errors from either query", async () => {
  for (const errorAt of [1, 2]) {
    const harness = createHarness({ errorAt });
    const response = createResponse();

    await harness.controller.getResult(
      { user: { id: 42 }, params: { roomId: "room-7" } },
      response
    );

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Natija olish xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("battle result route preserves path, method, and middleware order", () => {
  const router = createBattleResultRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/battle/result/:roomId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
