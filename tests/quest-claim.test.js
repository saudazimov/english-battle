const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createQuestClaimController,
} = require("../src/controllers/questClaimController");
const createQuestClaimRoutes = require("../src/routes/questClaimRoutes");

const selectSql =
  "SELECT uq.is_completed, uq.reward_claimed, q.xp_reward FROM user_quests uq JOIN quests q ON uq.quest_id = q.id WHERE uq.id = $1 AND uq.user_id = $2 FOR UPDATE OF uq";
const markClaimedSql =
  "UPDATE user_quests SET reward_claimed = true WHERE id = $1";
const updateUserSql =
  "UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING id, first_name, last_name, username, cefr_level, xp, rating, coins";

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

function createHarness({
  connectError,
  questRow = { is_completed: true, reward_claimed: false, xp_reward: 25 },
  queryErrorAt,
  rollbackError,
} = {}) {
  const calls = [];
  let queryCount = 0;
  const updatedUser = { id: 42, xp: 125 };
  const client = {
    async query(sql, params) {
      queryCount++;
      const normalized = normalizeSql(sql);
      calls.push(["query", normalized, params]);
      if (normalized === "ROLLBACK" && rollbackError) throw rollbackError;
      if (queryCount === queryErrorAt) throw new Error("database failed");
      if (normalized === selectSql) {
        return { rows: questRow === null ? [] : [questRow] };
      }
      if (normalized === updateUserSql) return { rows: [updatedUser] };
      return { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const controller = createQuestClaimController({
    pool: {
      async connect() {
        calls.push(["connect"]);
        if (connectError) throw connectError;
        return client;
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, updatedUser };
}

test("quest claim preserves connection-error propagation", async () => {
  const connectError = new Error("connect failed");
  const harness = createHarness({ connectError });

  await assert.rejects(
    () =>
      harness.controller.claim(
        { user: { id: 42 }, body: { userQuestId: 9 } },
        createResponse()
      ),
    (error) => error === connectError
  );
  assert.deepEqual(harness.calls, [["connect"]]);
});

test("quest claim preserves missing-ID response and release", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.claim(
    { user: { id: 42 }, body: {} },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["connect"], ["release"]]);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "userQuestId kerak" });
});

test("quest claim preserves not-found rollback and release order", async () => {
  const harness = createHarness({ questRow: null });
  const response = createResponse();

  const result = await harness.controller.claim(
    { user: { id: 42 }, body: { userQuestId: 9 } },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [
    ["connect"],
    ["query", "BEGIN", undefined],
    ["query", selectSql, [9, 42]],
    ["query", "ROLLBACK", undefined],
    ["release"],
  ]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Topshiriq topilmadi" });
});

test("quest claim preserves incomplete and already-claimed rollbacks", async () => {
  const cases = [
    [
      { is_completed: false, reward_claimed: false, xp_reward: 25 },
      "Topshiriq hali bajarilmagan",
    ],
    [
      { is_completed: true, reward_claimed: true, xp_reward: 25 },
      "Mukofot allaqachon olingan",
    ],
  ];

  for (const [questRow, message] of cases) {
    const harness = createHarness({ questRow });
    const response = createResponse();

    await harness.controller.claim(
      { user: { id: 42 }, body: { userQuestId: 9 } },
      response
    );

    assert.deepEqual(harness.calls.slice(-2), [
      ["query", "ROLLBACK", undefined],
      ["release"],
    ]);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: message });
  }
});

test("quest claim preserves transaction SQL and commit order", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.claim(
    { user: { id: 42 }, body: { userQuestId: 9 } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["connect"],
    ["query", "BEGIN", undefined],
    ["query", selectSql, [9, 42]],
    ["query", markClaimedSql, [9]],
    ["query", updateUserSql, [25, 42]],
    ["query", "COMMIT", undefined],
    ["release"],
  ]);
  assert.deepEqual(response.body, {
    message: "Mukofot olindi!",
    xp_reward: 25,
    updated_user: harness.updatedUser,
  });
});

test("quest claim preserves caught error, rollback fallback, and release", async () => {
  const harness = createHarness({
    queryErrorAt: 4,
    rollbackError: new Error("rollback failed"),
  });
  const response = createResponse();

  await harness.controller.claim(
    { user: { id: 42 }, body: { userQuestId: 9 } },
    response
  );

  assert.deepEqual(harness.calls.slice(-3), [
    ["query", "ROLLBACK", undefined],
    ["error", "Mukofot xatosi:", "database failed"],
    ["release"],
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("quest claim route preserves path, method, and middleware order", () => {
  const router = createQuestClaimRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/quests/claim");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
