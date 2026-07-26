const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherAiReportListController,
} = require("../src/controllers/teacherAiReportListController");
const createTeacherAiReportListRoutes = require("../src/routes/teacherAiReportListRoutes");

const listSql =
  "SELECT r.id, r.report_type, r.audience, r.period_start, r.period_end, r.confidence, r.status, r.created_at, r.target_student_id, r.ai_output, tu.first_name AS target_first, tu.last_name AS target_last FROM ai_reports r LEFT JOIN users tu ON tu.id = r.target_student_id WHERE r.user_id = $1 AND r.audience = 'teacher' ORDER BY r.created_at DESC LIMIT 200";

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

function createHarness({ rows = [], queryError } = {}) {
  const calls = [];
  const controller = createTeacherAiReportListController({
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

test("teacher AI report list preserves SQL and empty statistics", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.list({ user: { id: 7 } }, response);

  assert.deepEqual(harness.calls, [["query", listSql, [7]]]);
  assert.deepEqual(response.body, {
    reports: [],
    stats: {
      total: 0,
      avg_accuracy: null,
      students_analyzed: 0,
      top_class: null,
      top_class_count: 0,
      time_saved: null,
    },
  });
});

test("teacher AI report list preserves mapping, fallbacks, and statistics", async () => {
  const rows = [
    {
      id: 1,
      report_type: "student",
      confidence: "high",
      status: "completed",
      created_at: "2026-07-26T10:00:00Z",
      period_start: "2026-07-20",
      period_end: "2026-07-26",
      target_first: "Ali",
      target_last: "Valiyev",
      ai_output: { title: "A", class_name: "7-A", skill: "grammar" },
    },
    {
      id: 2,
      report_type: "student",
      confidence: null,
      status: "completed",
      created_at: "2026-07-26T11:00:00Z",
      period_start: "2026-07-20",
      period_end: "2026-07-26",
      target_first: "Ali",
      target_last: "Valiyev",
      ai_output: '{"title":"B","class_name":"7-A","skill":"reading"}',
    },
    {
      id: 3,
      report_type: "class",
      confidence: "unknown",
      status: "completed",
      created_at: "2026-07-26T12:00:00Z",
      period_start: "2026-07-20",
      period_end: "2026-07-26",
      target_first: null,
      target_last: null,
      ai_output: "not-json",
    },
  ];
  const harness = createHarness({ rows });
  const response = createResponse();

  await harness.controller.list({ user: { id: 7 } }, response);

  assert.equal(response.body.reports[0].accuracy_pct, 93);
  assert.equal(response.body.reports[1].confidence, "medium");
  assert.equal(response.body.reports[1].accuracy_pct, 88);
  assert.equal(response.body.reports[2].accuracy_pct, 85);
  assert.equal(response.body.reports[2].target_name, null);
  assert.equal(response.body.reports[2].title, null);
  assert.deepEqual(response.body.stats, {
    total: 3,
    avg_accuracy: 89,
    students_analyzed: 1,
    top_class: "7-A",
    top_class_count: 2,
    time_saved: 2.3,
  });
});

test("teacher AI report list preserves database error logging and response", async () => {
  const queryError = new Error("database failed");
  const harness = createHarness({ queryError });
  const response = createResponse();

  await harness.controller.list({ user: { id: 7 } }, response);

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "/teacher/ai-reports xatosi:",
    queryError,
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("teacher AI report list route preserves path, method, and middleware order", () => {
  const router = createTeacherAiReportListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/teacher/ai-reports");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireTeacher);
});
