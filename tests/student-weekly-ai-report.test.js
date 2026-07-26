const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentWeeklyAiReportController,
} = require("../src/controllers/studentWeeklyAiReportController");
const createStudentWeeklyAiReportRoutes = require("../src/routes/studentWeeklyAiReportRoutes");

const cacheSql =
  "SELECT ai_output, confidence, status, created_at FROM ai_reports WHERE target_student_id=$1 AND report_type='student_weekly_report' AND period_start=$2 ORDER BY created_at DESC LIMIT 1";
const saveSql =
  "INSERT INTO ai_reports (user_id, target_student_id, report_type, audience, period_start, period_end, input_snapshot, ai_output, confidence, status) VALUES ($1,$1,'student_weekly_report','student',$2,$3,$4,$5,$6,$7) RETURNING id, created_at";
const usageSql =
  "INSERT INTO ai_usage_logs (user_id, report_id, model, input_tokens, output_tokens) VALUES ($1,$2,$3,$4,$5)";

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
  cachedRows = [],
  queryErrorAt,
  snapshotError,
  serviceError,
  usage = { input: 10, output: 20 },
} = {}) {
  const calls = [];
  let queryCount = 0;
  const period = { start: "2026-07-20", end: "2026-07-26" };
  const snapshot = { data_quality: "good", total: 12 };
  const generated = {
    report: { title: "Weekly report" },
    confidence: "high",
    status: "completed",
    model: "model-1",
    usage,
  };
  const controller = createStudentWeeklyAiReportController({
    pool: {
      async query(sql, params) {
        queryCount++;
        calls.push(["query", normalizeSql(sql), params]);
        if (queryCount === queryErrorAt) throw new Error("database failed");
        if (queryCount === 1) return { rows: cachedRows };
        if (normalizeSql(sql) === saveSql) {
          return { rows: [{ id: 9, created_at: "2026-07-26T10:00:00Z" }] };
        }
        return { rows: [] };
      },
    },
    aiSnapshot: {
      currentWeekPeriod() {
        calls.push(["period"]);
        return period;
      },
      async buildStudentWeeklySnapshot(...args) {
        calls.push(["snapshot", ...args]);
        if (snapshotError) throw snapshotError;
        return snapshot;
      },
    },
    aiService: {
      async generateStudentWeeklyReport(value) {
        calls.push(["generate", value]);
        if (serviceError) throw serviceError;
        return generated;
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, generated, period, snapshot };
}

test("student weekly AI report preserves cached short-circuit", async () => {
  const cached = {
    ai_output: { title: "Cached" },
    confidence: "medium",
    status: "completed",
    created_at: "2026-07-25T10:00:00Z",
  };
  const harness = createHarness({ cachedRows: [cached] });
  const response = createResponse();

  const result = await harness.controller.generate(
    { user: { id: 42 }, query: {} },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [
    ["period"],
    ["query", cacheSql, [42, "2026-07-20"]],
  ]);
  assert.deepEqual(response.body, {
    report: cached.ai_output,
    cached: true,
    confidence: "medium",
    status: "completed",
    created_at: "2026-07-25T10:00:00Z",
  });
});

test("student weekly AI report preserves refresh generation and persistence order", async () => {
  const harness = createHarness({ cachedRows: [{ ai_output: {} }] });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: { refresh: "1" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["period"],
    ["query", cacheSql, [42, "2026-07-20"]],
    ["snapshot", 42, "2026-07-20", "2026-07-26"],
    ["generate", harness.snapshot],
    [
      "query",
      saveSql,
      [
        42,
        "2026-07-20",
        "2026-07-26",
        JSON.stringify(harness.snapshot),
        JSON.stringify(harness.generated.report),
        "high",
        "completed",
      ],
    ],
    ["query", usageSql, [42, 9, "model-1", 10, 20]],
  ]);
  assert.deepEqual(response.body, {
    report: harness.generated.report,
    data_quality: "good",
    cached: false,
    confidence: "high",
    status: "completed",
    created_at: "2026-07-26T10:00:00Z",
  });
});

test("student weekly AI report preserves no-usage path", async () => {
  const harness = createHarness({ usage: null });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: {} },
    response
  );

  assert.equal(harness.calls.filter((call) => call[0] === "query").length, 2);
  assert.equal(harness.calls.some((call) => call[1] === usageSql), false);
});

test("student weekly AI report preserves rejected usage-log fallback", async () => {
  const harness = createHarness({ queryErrorAt: 3 });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: {} },
    response
  );
  await Promise.resolve();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.cached, false);
  assert.equal(harness.calls.some((call) => call[0] === "error"), false);
});

test("student weekly AI report preserves awaited error response", async () => {
  const cases = [
    { queryErrorAt: 1 },
    { snapshotError: new Error("snapshot failed") },
    { serviceError: new Error("service failed") },
    { queryErrorAt: 2 },
  ];

  for (const options of cases) {
    const harness = createHarness(options);
    const response = createResponse();

    await harness.controller.generate(
      { user: { id: 42 }, query: {} },
      response
    );

    assert.equal(harness.calls.at(-1)[0], "error");
    assert.equal(harness.calls.at(-1)[1], "Student AI report xatosi:");
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: "Hozir hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
    });
  }
});

test("student weekly AI report route preserves all middleware order", () => {
  const premiumMiddleware = function premiumMiddleware(req, res, next) {
    next();
  };
  const premiumCalls = [];
  const router = createStudentWeeklyAiReportRoutes({
    pool: {},
    aiSnapshot: {},
    aiService: {},
    premium: {
      requirePremium(role) {
        premiumCalls.push(role);
        return premiumMiddleware;
      },
    },
  });

  assert.deepEqual(premiumCalls, ["student"]);
  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/ai/reports/student/weekly");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 4);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
  assert.equal(route.stack[2].handle, premiumMiddleware);
});
