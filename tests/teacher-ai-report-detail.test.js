const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherAiReportDetailController,
} = require("../src/controllers/teacherAiReportDetailController");
const createTeacherAiReportDetailRoutes = require("../src/routes/teacherAiReportDetailRoutes");

const detailSql =
  "SELECT id, report_type, audience, ai_output, confidence, status, period_start, period_end, created_at FROM ai_reports WHERE id = $1 AND user_id = $2 AND audience = 'teacher'";

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

function createRow(aiOutput) {
  return {
    id: 42,
    report_type: "teacher_class_report",
    audience: "teacher",
    ai_output: aiOutput,
    confidence: "high",
    status: "completed",
    period_start: "2026-07-20",
    period_end: "2026-07-26",
    created_at: "2026-07-26T10:00:00Z",
  };
}

function createHarness({ found = true, aiOutput = { title: "Report" }, queryError } = {}) {
  const calls = [];
  const row = createRow(aiOutput);
  const controller = createTeacherAiReportDetailController({
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return { rows: found ? [row] : [] };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, row };
}

test("teacher AI report detail preserves invalid-ID response", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.getById(
    { user: { id: 7 }, params: { id: "invalid" } },
    response
  );

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri ID" });
  assert.deepEqual(harness.calls, []);
});

test("teacher AI report detail preserves ownership SQL and not-found response", async () => {
  const harness = createHarness({ found: false });
  const response = createResponse();

  const result = await harness.controller.getById(
    { user: { id: 7 }, params: { id: "42abc" } },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["query", detailSql, [42, 7]]]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Hisobot topilmadi" });
});

test("teacher AI report detail preserves object output and response fields", async () => {
  const aiOutput = { title: "Report" };
  const harness = createHarness({ aiOutput });
  const response = createResponse();

  await harness.controller.getById(
    { user: { id: 7 }, params: { id: "42" } },
    response
  );

  assert.equal(response.body.ai_output, aiOutput);
  assert.deepEqual(response.body, {
    id: 42,
    report_type: "teacher_class_report",
    ai_output: aiOutput,
    confidence: "high",
    status: "completed",
    period_start: "2026-07-20",
    period_end: "2026-07-26",
    created_at: "2026-07-26T10:00:00Z",
  });
});

test("teacher AI report detail preserves valid and invalid string JSON handling", async () => {
  const validHarness = createHarness({ aiOutput: '{"title":"Parsed"}' });
  const validResponse = createResponse();
  await validHarness.controller.getById(
    { user: { id: 7 }, params: { id: "42" } },
    validResponse
  );
  assert.deepEqual(validResponse.body.ai_output, { title: "Parsed" });

  const invalidHarness = createHarness({ aiOutput: "not-json" });
  const invalidResponse = createResponse();
  await invalidHarness.controller.getById(
    { user: { id: 7 }, params: { id: "42" } },
    invalidResponse
  );
  assert.equal(invalidResponse.body.ai_output, "not-json");
  assert.equal(invalidHarness.calls.some((call) => call[0] === "error"), false);
});

test("teacher AI report detail preserves database error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.getById(
    { user: { id: 7 }, params: { id: "42" } },
    response
  );

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "/teacher/ai-reports/:id xatosi:",
    "database failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("teacher AI report detail route preserves path, method, and middleware order", () => {
  const router = createTeacherAiReportDetailRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/teacher/ai-reports/:id");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireTeacher);
});
