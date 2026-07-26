const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminQuestionListController,
} = require("../src/controllers/adminQuestionListController");
const createAdminQuestionListRoutes = require("../src/routes/adminQuestionListRoutes");

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

function createHarness({ total = "2", rows = [{ id: 2 }, { id: 1 }], queryError } = {}) {
  const calls = [];
  const controller = createAdminQuestionListController({
    pool: {
      async query(sql, params) {
        calls.push([normalizeSql(sql), params]);
        if (queryError) throw queryError;
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

test("admin question list preserves default pagination and queries", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.list({ query: {} }, response);

  assert.deepEqual(harness.calls, [
    ["SELECT COUNT(*) AS total FROM questions", []],
    [
      "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status, created_at, updated_at FROM questions ORDER BY id DESC LIMIT $1 OFFSET $2",
      [25, 0],
    ],
  ]);
  assert.deepEqual(response.body, {
    questions: [{ id: 2 }, { id: 1 }],
    pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
  });
});

test("admin question list preserves filters and parameter order", async () => {
  const harness = createHarness({ total: "101", rows: [] });
  const response = createResponse();
  const query = {
    page: "2",
    limit: "50",
    search: "  HELLO  ",
    level: "B1",
    skill: "reading",
    status: "draft",
    date_from: "2026-07-01",
    date_to: "2026-07-26",
  };

  await harness.controller.list({ query }, response);

  assert.deepEqual(harness.calls[0], [
    "SELECT COUNT(*) AS total FROM questions WHERE (LOWER(question_text) LIKE $1 OR CAST(id AS TEXT) LIKE $1) AND cefr_level = $2 AND skill = $3 AND status = $4 AND created_at >= $5 AND created_at <= $6",
    ["%hello%", "B1", "reading", "draft", "2026-07-01", "2026-07-26 23:59:59"],
  ]);
  assert.deepEqual(harness.calls[1][1], [
    "%hello%",
    "B1",
    "reading",
    "draft",
    "2026-07-01",
    "2026-07-26 23:59:59",
    50,
    50,
  ]);
  assert.match(harness.calls[1][0], /LIMIT \$7 OFFSET \$8$/);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 50,
    total: 101,
    totalPages: 3,
  });
});

test("admin question list preserves page and limit boundaries", async () => {
  const harness = createHarness({ total: "0", rows: [] });
  const response = createResponse();

  await harness.controller.list({ query: { page: "-4", limit: "1000" } }, response);

  assert.deepEqual(harness.calls[1][1], [100, 0]);
  assert.deepEqual(response.body.pagination, {
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
  });
});

test("admin question list preserves error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.list({ query: {} }, response);

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Admin savollar xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question list route preserves path, method, and middleware order", () => {
  const router = createAdminQuestionListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/questions");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
