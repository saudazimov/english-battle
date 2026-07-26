const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminUserListController,
} = require("../src/controllers/adminUserListController");
const createAdminUserListRoutes = require("../src/routes/adminUserListRoutes");

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

function createHarness({ total = "2", rows = [{ id: 2 }, { id: 1 }], errorAt } = {}) {
  const calls = [];
  let queryCount = 0;
  const controller = createAdminUserListController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === errorAt) throw new Error("database failed");
        if (sql.startsWith("SELECT COUNT")) return { rows: [{ total }] };
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

test("admin user list preserves default pagination and SQL", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.list({ query: {} }, response);

  assert.deepEqual(harness.calls, [
    ["query", "SELECT COUNT(*) AS total FROM users", []],
    [
      "query",
      "SELECT id, first_name, last_name, role, cefr_level, rating, region, district, school, phone, is_banned, created_at FROM users ORDER BY id DESC LIMIT $1 OFFSET $2",
      [25, 0],
    ],
  ]);
  assert.deepEqual(response.body, {
    users: [{ id: 2 }, { id: 1 }],
    pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
  });
});

test("admin user list preserves all filters and parameter order", async () => {
  const harness = createHarness({ total: "101", rows: [] });
  const response = createResponse();

  await harness.controller.list(
    {
      query: {
        page: "2",
        limit: "50",
        search: "  ALI  ",
        role: "student",
        level: "B1",
        region: "Toshkent",
      },
    },
    response
  );

  const filterParams = ["%ali%", "student", "B1", "Toshkent"];
  assert.deepEqual(harness.calls, [
    [
      "query",
      "SELECT COUNT(*) AS total FROM users WHERE (LOWER(first_name) LIKE $1 OR LOWER(last_name) LIKE $1 OR phone LIKE $1) AND role = $2 AND cefr_level = $3 AND region = $4",
      filterParams,
    ],
    [
      "query",
      "SELECT id, first_name, last_name, role, cefr_level, rating, region, district, school, phone, is_banned, created_at FROM users WHERE (LOWER(first_name) LIKE $1 OR LOWER(last_name) LIKE $1 OR phone LIKE $1) AND role = $2 AND cefr_level = $3 AND region = $4 ORDER BY id DESC LIMIT $5 OFFSET $6",
      [...filterParams, 50, 50],
    ],
  ]);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 50,
    total: 101,
    totalPages: 3,
  });
});

test("admin user list preserves pagination boundaries", async () => {
  const harness = createHarness({ total: "0", rows: [] });
  const response = createResponse();

  await harness.controller.list({ query: { page: "-3", limit: "1000" } }, response);

  assert.deepEqual(harness.calls[1][2], [100, 0]);
  assert.deepEqual(response.body.pagination, {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });
});

test("admin user list preserves errors from either query", async () => {
  for (const errorAt of [1, 2]) {
    const harness = createHarness({ errorAt });
    const response = createResponse();

    await harness.controller.list({ query: {} }, response);

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Admin users xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin user list route preserves path, method, and middleware order", () => {
  const router = createAdminUserListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/users");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
