const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherWeeklyAiReportController,
} = require("../src/controllers/teacherWeeklyAiReportController");
const createTeacherWeeklyAiReportRoutes = require("../src/routes/teacherWeeklyAiReportRoutes");

const ownershipSql =
  "SELECT id FROM classes WHERE id=$1 AND teacher_id=$2 AND archived_at IS NULL";
const cacheSql =
  "SELECT ai_output, confidence, status, created_at FROM ai_reports WHERE user_id=$1 AND report_type='teacher_class_report' AND period_start=$2 AND input_snapshot->'class'->>'id' = $3 ORDER BY created_at DESC LIMIT 1";
const saveSql =
  "INSERT INTO ai_reports (user_id, target_student_id, report_type, audience, period_start, period_end, input_snapshot, ai_output, confidence, status) VALUES ($1,NULL,'teacher_class_report','teacher',$2,$3,$4,$5,$6,$7) RETURNING id, created_at";
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
  owned = true,
  cachedRows = [],
  queryErrorAt,
  snapshotError,
  serviceError,
  usage = { input: 30, output: 40 },
} = {}) {
  const calls = [];
  let queryCount = 0;
  const period = { start: "2026-07-20", end: "2026-07-26" };
  const snapshot = { data_quality: "good", class: { id: "12" } };
  const generated = {
    report: { title: "Class report" },
    confidence: "high",
    status: "completed",
    model: "model-1",
    usage,
  };
  const controller = createTeacherWeeklyAiReportController({
    pool: {
      async query(sql, params) {
        queryCount++;
        const normalized = normalizeSql(sql);
        calls.push(["query", normalized, params]);
        if (queryCount === queryErrorAt) throw new Error("database failed");
        if (queryCount === 1) return { rows: owned ? [{ id: 12 }] : [] };
        if (queryCount === 2) return { rows: cachedRows };
        if (normalized === saveSql) {
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
      async buildTeacherClassSnapshot(...args) {
        calls.push(["snapshot", ...args]);
        if (snapshotError) throw snapshotError;
        return snapshot;
      },
    },
    aiService: {
      async generateTeacherClassReport(value) {
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
  return { calls, controller, generated, snapshot };
}

test("teacher weekly AI report preserves invalid class ID response", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.generate(
    { user: { id: 7 }, params: { classId: "invalid" }, query: {} },
    response
  );

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri sinf ID" });
  assert.deepEqual(harness.calls, []);
});

test("teacher weekly AI report preserves ownership guard", async () => {
  const harness = createHarness({ owned: false });
  const response = createResponse();

  const result = await harness.controller.generate(
    { user: { id: 7 }, params: { classId: "12" }, query: {} },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["query", ownershipSql, [12, 7]]]);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: "Bu sinf sizga tegishli emas" });
});

test("teacher weekly AI report rejects partially numeric class IDs", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 7 }, params: { classId: "12abc" }, query: {} },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(harness.calls, []);
});

test("teacher weekly AI report preserves cached short-circuit", async () => {
  const cached = {
    ai_output: { title: "Cached" },
    confidence: "medium",
    status: "completed",
    created_at: "2026-07-25T10:00:00Z",
  };
  const harness = createHarness({ cachedRows: [cached] });
  const response = createResponse();

  const result = await harness.controller.generate(
    { user: { id: 7 }, params: { classId: "12" }, query: {} },
    response
  );

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [
    ["query", ownershipSql, [12, 7]],
    ["period"],
    ["query", cacheSql, [7, "2026-07-20", "12"]],
  ]);
  assert.deepEqual(response.body, {
    report: cached.ai_output,
    cached: true,
    confidence: "medium",
    status: "completed",
    created_at: "2026-07-25T10:00:00Z",
  });
});

test("teacher weekly AI report preserves refresh generation and save order", async () => {
  const harness = createHarness({ cachedRows: [{ ai_output: {} }] });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 7 }, params: { classId: "12" }, query: { refresh: "1" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["query", ownershipSql, [12, 7]],
    ["period"],
    ["query", cacheSql, [7, "2026-07-20", "12"]],
    ["snapshot", 7, 12, "2026-07-20", "2026-07-26"],
    ["generate", harness.snapshot],
    [
      "query",
      saveSql,
      [
        7,
        "2026-07-20",
        "2026-07-26",
        JSON.stringify(harness.snapshot),
        JSON.stringify(harness.generated.report),
        "high",
        "completed",
      ],
    ],
    ["query", usageSql, [7, 9, "model-1", 30, 40]],
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

test("teacher weekly AI report preserves usage-log fallback", async () => {
  const harness = createHarness({ queryErrorAt: 4 });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 7 }, params: { classId: "12" }, query: {} },
    response
  );
  await Promise.resolve();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.cached, false);
  assert.equal(harness.calls.some((call) => call[0] === "error"
    && call[1] === "Teacher AI usage log xatosi:"
    && call[2] === "database failed"), true);
});

test("teacher weekly AI report preserves awaited error response", async () => {
  const cases = [
    { queryErrorAt: 1 },
    { queryErrorAt: 2 },
    { snapshotError: new Error("snapshot failed") },
    { serviceError: new Error("service failed") },
    { queryErrorAt: 3 },
  ];

  for (const options of cases) {
    const harness = createHarness(options);
    const response = createResponse();

    await harness.controller.generate(
      { user: { id: 7 }, params: { classId: "12" }, query: {} },
      response
    );

    assert.equal(harness.calls.at(-1)[0], "error");
    assert.equal(harness.calls.at(-1)[1], "Teacher AI report xatosi:");
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: "Hozir hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
    });
  }
});

test("teacher weekly AI report route preserves all middleware order", () => {
  const premiumMiddleware = function premiumMiddleware(req, res, next) {
    next();
  };
  const premiumCalls = [];
  const router = createTeacherWeeklyAiReportRoutes({
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

  assert.deepEqual(premiumCalls, ["teacher"]);
  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/ai/reports/teacher/classes/:classId/weekly");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 4);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireTeacher);
  assert.equal(route.stack[2].handle, premiumMiddleware);
});
