const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireParent } = require("../auth");
const {
  createParentWeeklyAiReportService,
} = require("../src/services/parentWeeklyAiReportService");
const {
  createParentWeeklyAiReportController,
} = require("../src/controllers/parentWeeklyAiReportController");
const parentWeeklyAiReportRoutes = require("../src/routes/parentWeeklyAiReportRoutes");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
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

function createPeriod() {
  return { start: "2026-07-27", end: "2026-08-02" };
}

test("parent weekly AI report preserves access, period, cache SQL, and response", async () => {
  const calls = [];
  const cached = {
    id: 4,
    ai_output: { summary: "Cached" },
    confidence: 0.8,
    status: "ready",
    created_at: "2026-07-28T12:00:00.000Z",
  };
  const responses = [{ rows: [{ id: 2 }] }, { rows: [cached] }];
  const service = createParentWeeklyAiReportService({
    pool: {
      async query(sql, params) {
        calls.push([sql.replace(/\s+/g, " ").trim(), params]);
        return responses.shift();
      },
    },
    aiSnapshot: {
      currentWeekPeriod() {
        calls.push(["period"]);
        return createPeriod();
      },
      buildStudentWeeklySnapshot: assert.fail,
    },
    aiService: { generateParentWeeklyReport: assert.fail },
  });

  assert.deepEqual(await service.generate(10, 20, undefined), {
    status: "cached",
    result: {
      report: { summary: "Cached" },
      cached: true,
      confidence: 0.8,
      status: "ready",
      created_at: "2026-07-28T12:00:00.000Z",
    },
  });
  assert.deepEqual(calls[0][1], [10, 20]);
  assert.deepEqual(calls[1], ["period"]);
  assert.deepEqual(calls[2][1], [20, "2026-07-27"]);
  assert.match(calls[2][0], /report_type='parent_weekly_report'/);
});

test("parent weekly AI report preserves generation, save, usage log, and response", async () => {
  const queries = [];
  const logged = [];
  const snapshot = { data_quality: "good", battles: 5 };
  const generated = {
    report: { summary: "Fresh" },
    confidence: 0.9,
    status: "ready",
    model: "model-name",
    usage: { input: 100, output: 40 },
  };
  const pool = {
    query(sql, params) {
      queries.push([sql.replace(/\s+/g, " ").trim(), params]);
      if (sql.includes("FROM parent_links")) return Promise.resolve({ rows: [{ id: 2 }] });
      if (sql.includes("FROM ai_reports")) return Promise.resolve({ rows: [{ id: 3 }] });
      if (sql.includes("INSERT INTO ai_reports")) {
        return Promise.resolve({ rows: [{ id: 9, created_at: "created" }] });
      }
      return Promise.reject(new Error("usage unavailable"));
    },
  };
  const service = createParentWeeklyAiReportService({
    pool,
    aiSnapshot: {
      currentWeekPeriod: createPeriod,
      async buildStudentWeeklySnapshot(studentId, start, end) {
        assert.deepEqual([studentId, start, end], [20, "2026-07-27", "2026-08-02"]);
        return snapshot;
      },
    },
    aiService: {
      async generateParentWeeklyReport(value) {
        assert.equal(value, snapshot);
        return generated;
      },
    },
    logger: { error(...args) { logged.push(args); } },
  });

  assert.deepEqual(await service.generate(10, 20, "1"), {
    status: "generated",
    result: {
      report: { summary: "Fresh" },
      data_quality: "good",
      cached: false,
      confidence: 0.9,
      status: "ready",
      created_at: "created",
    },
  });
  await Promise.resolve();
  assert.deepEqual(queries[2][1], [
    10,
    20,
    "2026-07-27",
    "2026-08-02",
    JSON.stringify(snapshot),
    JSON.stringify(generated.report),
    0.9,
    "ready",
  ]);
  assert.deepEqual(queries[3][1], [10, 9, "model-name", 100, 40]);
  assert.deepEqual(logged, [["AI usage log xato:", "usage unavailable"]]);
});

test("parent weekly AI report preserves forbidden short circuit", async () => {
  let calls = 0;
  const service = createParentWeeklyAiReportService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
    aiSnapshot: { currentWeekPeriod: assert.fail },
    aiService: { generateParentWeeklyReport: assert.fail },
  });

  assert.deepEqual(await service.generate(10, 20), { status: "forbidden" });
  assert.equal(calls, 1);
});

test("parent weekly AI report controller preserves validation and error responses", async () => {
  const invalidController = createParentWeeklyAiReportController({
    pool: { query: assert.fail },
    aiSnapshot: { currentWeekPeriod: assert.fail },
    aiService: { generateParentWeeklyReport: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.generate({
    params: { studentId: "invalid" },
    user: { id: 10 },
    query: {},
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const errorController = createParentWeeklyAiReportController({
    pool: { async query() { throw new Error("database unavailable"); } },
    aiSnapshot: { currentWeekPeriod: assert.fail },
    aiService: { generateParentWeeklyReport: assert.fail },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.generate({
      params: { studentId: "20" },
      user: { id: 10 },
      query: {},
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, {
    error: "Hozir AI hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
  });
  assert.deepEqual(logged, [["Parent AI report xatosi:", "database unavailable"]]);
});

test("parent weekly AI report route preserves path and middleware order", () => {
  const premiumMiddleware = () => {};
  const router = parentWeeklyAiReportRoutes({
    pool: { query: assert.fail },
    premium: {
      requirePremium(role) {
        assert.equal(role, "parent");
        return premiumMiddleware;
      },
    },
    aiSnapshot: {},
    aiService: {},
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/ai/reports/parent/children/:studentId/weekly");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireParent);
  assert.equal(layer.route.stack[2].handle, premiumMiddleware);
  assert.equal(layer.route.stack.length, 4);
});
