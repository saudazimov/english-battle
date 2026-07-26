const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireParent } = require("../auth");
const {
  createParentAiReportListController,
} = require("../src/controllers/parentAiReportListController");
const createParentAiReportListRoutes = require("../src/routes/parentAiReportListRoutes");

const linkSql =
  "SELECT id FROM parent_links WHERE parent_id=$1 AND student_id=$2 AND status='active'";
const reportsSql =
  "SELECT id, period_start, period_end, ai_output, confidence, status, created_at FROM ai_reports WHERE target_student_id=$1 AND report_type='parent_weekly_report' ORDER BY period_start DESC LIMIT 12";

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

function createHarness({ linked = true, reportRows = [{ id: 7 }], errorAt } = {}) {
  const calls = [];
  let queryCount = 0;
  const controller = createParentAiReportListController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === errorAt) throw new Error("database failed");
        if (queryCount === 1) return { rows: linked ? [{ id: 1 }] : [] };
        return { rows: reportRows };
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

test("parent AI report list preserves base-10 invalid-ID response", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.list(
    { user: { id: 5 }, params: { studentId: "invalid" } },
    response
  );

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri ID" });
  assert.deepEqual(harness.calls, []);
});

test("parent AI report list preserves access-link query and forbidden response", async () => {
  const harness = createHarness({ linked: false });
  const response = createResponse();

  const result = await harness.controller.list(
    { user: { id: 5 }, params: { studentId: "42abc" } },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["query", linkSql, [5, 42]]]);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: "Ruxsat yo'q" });
});

test("parent AI report list preserves sequential SQL and response", async () => {
  const reports = [{ id: 7 }, { id: 6 }];
  const harness = createHarness({ reportRows: reports });
  const response = createResponse();

  await harness.controller.list(
    { user: { id: 5 }, params: { studentId: "42" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["query", linkSql, [5, 42]],
    ["query", reportsSql, [42]],
  ]);
  assert.equal(response.body.reports, reports);
});

test("parent AI report list preserves errors from either query", async () => {
  for (const errorAt of [1, 2]) {
    const harness = createHarness({ errorAt });
    const response = createResponse();

    await harness.controller.list(
      { user: { id: 5 }, params: { studentId: "42" } },
      response
    );

    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "AI hisobotlar ro'yxati xatosi:",
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("parent AI report list route preserves all middleware order", () => {
  const premiumMiddleware = function premiumMiddleware(req, res, next) {
    next();
  };
  const premiumCalls = [];
  const router = createParentAiReportListRoutes({
    pool: {},
    premium: {
      requirePremium(role) {
        premiumCalls.push(role);
        return premiumMiddleware;
      },
    },
  });

  assert.deepEqual(premiumCalls, ["parent"]);
  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/ai/reports/parent/children/:studentId");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 4);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireParent);
  assert.equal(route.stack[2].handle, premiumMiddleware);
});
