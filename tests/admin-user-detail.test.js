const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminUserDetailController,
} = require("../src/controllers/adminUserDetailController");
const createAdminUserDetailRoutes = require("../src/routes/adminUserDetailRoutes");

const userSql =
  "SELECT id, first_name, last_name, role, cefr_level, rating, xp, coins, current_streak, longest_streak, win_streak, best_win_streak, region, district, village, school, phone, birth_date, profile_picture, is_banned, created_at FROM users WHERE id = $1";
const battleSql = "SELECT COUNT(*) AS c FROM battle_history WHERE user_id = $1";
const winSql =
  "SELECT COUNT(*) AS c FROM battle_history WHERE user_id = $1 AND outcome = 'win'";

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
  const user = { id: 42, first_name: "Ali", last_name: "Valiyev" };
  const controller = createAdminUserDetailController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === errorAt) throw new Error("database failed");
        if (queryCount === 1) return { rows: found ? [user] : [] };
        if (queryCount === 2) return { rows: [{ c: "17" }] };
        return { rows: [{ c: "9" }] };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, user };
}

test("admin user detail preserves invalid-ID response before querying", async () => {
  for (const id of ["invalid", "0", ""]) {
    const harness = createHarness();
    const response = createResponse();

    const result = await harness.controller.getById({ params: { id } }, response);

    assert.equal(result, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Noto'g'ri ID" });
    assert.deepEqual(harness.calls, []);
  }
});

test("admin user detail preserves not-found response and query order", async () => {
  const harness = createHarness({ found: false });
  const response = createResponse();

  const result = await harness.controller.getById({ params: { id: "42" } }, response);

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["query", userSql, [42]]]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Foydalanuvchi topilmadi" });
});

test("admin user detail preserves sequential SQL, parsing, and user mutation", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.getById({ params: { id: "42extra" } }, response);

  assert.deepEqual(harness.calls, [
    ["query", userSql, [42]],
    ["query", battleSql, [42]],
    ["query", winSql, [42]],
  ]);
  assert.equal(harness.user.total_battles, 17);
  assert.equal(harness.user.total_wins, 9);
  assert.deepEqual(response.body, { user: harness.user });
});

test("admin user detail preserves errors from each query", async () => {
  for (const errorAt of [1, 2, 3]) {
    const harness = createHarness({ errorAt });
    const response = createResponse();

    await harness.controller.getById({ params: { id: "42" } }, response);

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Foydalanuvchi ma'lumoti xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin user detail route preserves path, method, and middleware order", () => {
  const router = createAdminUserDetailRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/users/:id");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
