const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminAuditLogListController,
} = require("../src/controllers/adminAuditLogListController");
const createAdminAuditLogListRoutes = require("../src/routes/adminAuditLogListRoutes");

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
  const controller = createAdminAuditLogListController({
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

test("admin audit log list preserves default pagination and SQL", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.list({ query: {} }, response);

  assert.deepEqual(harness.calls, [
    ["query", "SELECT COUNT(*) AS total FROM audit_logs", []],
    [
      "query",
      "SELECT id, admin_name, action, entity_type, entity_id, details, created_at FROM audit_logs ORDER BY id DESC LIMIT $1 OFFSET $2",
      [20, 0],
    ],
  ]);
  assert.deepEqual(response.body, {
    logs: [{ id: 2 }, { id: 1 }],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  });
});

test("admin audit log list preserves action filter and parameter order", async () => {
  const harness = createHarness({ total: "121", rows: [] });
  const response = createResponse();

  await harness.controller.list(
    { query: { page: "2", limit: "50", action: "  question_updated  " } },
    response
  );

  assert.deepEqual(harness.calls, [
    [
      "query",
      "SELECT COUNT(*) AS total FROM audit_logs WHERE action = $1",
      ["question_updated"],
    ],
    [
      "query",
      "SELECT id, admin_name, action, entity_type, entity_id, details, created_at FROM audit_logs WHERE action = $1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      ["question_updated", 50, 50],
    ],
  ]);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 50,
    total: 121,
    totalPages: 3,
  });
});

test("admin audit log list preserves pagination boundaries", async () => {
  const harness = createHarness({ total: "0", rows: [] });
  const response = createResponse();

  await harness.controller.list({ query: { page: "-2", limit: "500" } }, response);

  assert.deepEqual(harness.calls[1][2], [50, 0]);
  assert.deepEqual(response.body.pagination, {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
});

test("admin audit log list preserves errors from either query", async () => {
  for (const errorAt of [1, 2]) {
    const harness = createHarness({ errorAt });
    const response = createResponse();

    await harness.controller.list({ query: {} }, response);

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Audit logs xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin audit log list route preserves path, method, and middleware order", () => {
  const router = createAdminAuditLogListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/audit-logs");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
