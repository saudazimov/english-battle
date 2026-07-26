const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createStreakCheckinController,
} = require("../src/controllers/streakCheckinController");
const createStreakCheckinRoutes = require("../src/routes/streakCheckinRoutes");

const selectSql =
  "SELECT current_streak, longest_streak, last_active_date FROM users WHERE id = $1";
const updateSql =
  "UPDATE users SET current_streak = $1, longest_streak = $2, last_active_date = CURRENT_DATE WHERE id = $3";

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

function createHarness({ userRow, errorAt } = {}) {
  const calls = [];
  let queryCount = 0;
  const today = new Date(2026, 6, 26, 12, 30, 0);
  const controller = createStreakCheckinController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === errorAt) throw new Error("database failed");
        if (queryCount === 1) {
          return { rows: userRow === undefined ? [] : [userRow] };
        }
        return { rows: [] };
      },
    },
    now() {
      calls.push(["now"]);
      return new Date(today);
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

test("streak checkin preserves not-found response before date calculation", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.checkin({ user: { id: 42 } }, response);

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["query", selectSql, [42]]]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Foydalanuvchi topilmadi" });
});

test("streak checkin preserves same-day early response without update", async () => {
  const harness = createHarness({
    userRow: {
      current_streak: 5,
      longest_streak: 8,
      last_active_date: new Date(2026, 6, 26, 1, 0, 0),
    },
  });
  const response = createResponse();

  const result = await harness.controller.checkin({ user: { id: 42 } }, response);

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [
    ["query", selectSql, [42]],
    ["now"],
  ]);
  assert.deepEqual(response.body, {
    current_streak: 5,
    longest_streak: 8,
    already_checked: true,
  });
});

test("streak checkin preserves consecutive-day increment and longest update", async () => {
  const harness = createHarness({
    userRow: {
      current_streak: 5,
      longest_streak: 5,
      last_active_date: new Date(2026, 6, 25, 18, 0, 0),
    },
  });
  const response = createResponse();

  await harness.controller.checkin({ user: { id: 42 } }, response);

  assert.deepEqual(harness.calls, [
    ["query", selectSql, [42]],
    ["now"],
    ["query", updateSql, [6, 6, 42]],
  ]);
  assert.deepEqual(response.body, {
    current_streak: 6,
    longest_streak: 6,
    already_checked: false,
  });
});

test("streak checkin preserves broken-streak reset and prior longest", async () => {
  const harness = createHarness({
    userRow: {
      current_streak: 5,
      longest_streak: 10,
      last_active_date: new Date(2026, 6, 20, 18, 0, 0),
    },
  });
  const response = createResponse();

  await harness.controller.checkin({ user: { id: 42 } }, response);

  assert.deepEqual(harness.calls.at(-1), ["query", updateSql, [1, 10, 42]]);
  assert.deepEqual(response.body, {
    current_streak: 1,
    longest_streak: 10,
    already_checked: false,
  });
});

test("streak checkin preserves first-checkin defaults", async () => {
  const harness = createHarness({
    userRow: {
      current_streak: 0,
      longest_streak: 0,
      last_active_date: null,
    },
  });
  const response = createResponse();

  await harness.controller.checkin({ user: { id: 42 } }, response);

  assert.deepEqual(harness.calls.at(-1), ["query", updateSql, [1, 1, 42]]);
  assert.deepEqual(response.body, {
    current_streak: 1,
    longest_streak: 1,
    already_checked: false,
  });
});

test("streak checkin preserves errors from select and update queries", async () => {
  for (const errorAt of [1, 2]) {
    const harness = createHarness({
      userRow: {
        current_streak: 1,
        longest_streak: 1,
        last_active_date: null,
      },
      errorAt,
    });
    const response = createResponse();

    await harness.controller.checkin({ user: { id: 42 } }, response);

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Streak xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("streak checkin route preserves path, method, and middleware order", () => {
  const router = createStreakCheckinRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/streak/checkin");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
