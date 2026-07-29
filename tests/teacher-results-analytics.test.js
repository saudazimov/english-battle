const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherResultsAnalyticsService,
} = require("../src/services/teacherResultsAnalyticsService");
const {
  createTeacherResultsAnalyticsController,
} = require("../src/controllers/teacherResultsAnalyticsController");
const teacherResultsAnalyticsRoutes = require("../src/routes/teacherResultsAnalyticsRoutes");

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

test("teacher results analytics preserves SQL order and response mapping", async () => {
  const queries = [];
  const responses = [
    { rows: [{ id: 7, title: "Homework", class_id: 3, skill: "grammar", class_name: "7-A" }] },
    { rows: [
      { student_id: 1, score: 19, total: 20, percent: 95, correct_count: 19, wrong_count: 1, unanswered_count: 0, is_late: false, started_at: "2026-07-28T10:00:00Z", submitted_at: "2026-07-28T10:05:00Z", first_name: "Ali", last_name: "Valiyev", class_name: "7-A" },
      { student_id: 2, score: 16, total: 20, percent: 80, correct_count: 16, wrong_count: 4, unanswered_count: 0, is_late: true, started_at: null, submitted_at: null, first_name: "Vali", last_name: null, class_name: "7-A" },
      { student_id: 3, score: 12, total: 20, percent: 60, correct_count: 12, wrong_count: 8, unanswered_count: 0, is_late: false, started_at: null, submitted_at: null, first_name: "Hasan", last_name: "Karimov", class_name: null },
      { student_id: 4, score: 8, total: 20, percent: 40, correct_count: 8, wrong_count: 12, unanswered_count: 0, is_late: false, started_at: null, submitted_at: null, first_name: null, last_name: "Olimov", class_name: null },
    ] },
    { rows: [{ c: 5 }] },
    { rows: [{ skill: "grammar", total: 8, correct: 6 }] },
    { rows: [{ difficulty: "easy", question_count: 2 }, { difficulty: "custom", question_count: 1 }] },
    { rows: [
      { q_order: 1, question_text: "Question", skill: "grammar", difficulty: "easy", total: 4, correct: 3 },
      { q_order: 2, question_text: "Empty", skill: null, difficulty: null, total: 0, correct: 0 },
    ] },
  ];
  const service = createTeacherResultsAnalyticsService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return responses.shift();
      },
    },
  });

  const outcome = await service.getResults(7, 12);

  assert.equal(outcome.status, "found");
  assert.deepEqual(queries.map((query) => query.params), [[7, 12], [7], [3], [7], [7], [7]]);
  assert.match(queries[0].sql, /WHERE a\.id = \$1 AND a\.teacher_id = \$2$/);
  assert.match(queries[1].sql, /ORDER BY sub\.percent DESC$/);
  assert.match(queries[2].sql, /status = 'active'$/);
  assert.match(queries[3].sql, /GROUP BY aq\.skill ORDER BY aq\.skill$/);
  assert.match(queries[4].sql, /GROUP BY aq\.difficulty$/);
  assert.match(queries[5].sql, /ORDER BY aq\.q_order$/);
  assert.deepEqual(outcome.result.assignment, { id: 7, title: "Homework", class_name: "7-A" });
  assert.equal(outcome.result.students[0].time_seconds, 300);
  assert.equal(outcome.result.students[1].name, "Vali");
  assert.equal(outcome.result.students[3].name, "Olimov");
  assert.deepEqual(outcome.result.stats, {
    total: 5,
    avg_score: 69,
    top_score: 95,
    top_name: "Ali Valiyev",
    low_score: 40,
    low_name: "Olimov",
    submitted: 4,
    submit_rate: 80,
    late: 1,
    late_rate: 25,
  });
  assert.deepEqual(outcome.result.distribution.map((item) => item.count), [1, 1, 1, 1]);
  assert.deepEqual(outcome.result.class_comparison, [
    { class_name: "7-A", avg: 87.5 },
    { class_name: "—", avg: 50 },
  ]);
  assert.deepEqual(outcome.result.skills, [{ skill: "grammar", avg: 75, total: 8, correct: 6 }]);
  assert.deepEqual(outcome.result.difficulty, [
    { label: "Oson", count: 2, color: "#16b06a" },
    { label: "custom", count: 1, color: "#94a3b8" },
  ]);
  assert.deepEqual(outcome.result.questions[0], {
    q_order: 1,
    question_text: "Question",
    skill: "grammar",
    difficulty: "easy",
    total: 4,
    correct: 3,
    wrong: 1,
    correct_rate: 75,
  });
  assert.equal(outcome.result.questions[1].correct_rate, 0);
});

test("teacher results analytics preserves not-found response and query count", async () => {
  let calls = 0;
  const service = createTeacherResultsAnalyticsService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  assert.deepEqual(await service.getResults(7, 12), { status: "not-found" });
  assert.equal(calls, 1);
});

test("teacher results analytics controller preserves validation and errors", async () => {
  const invalidController = createTeacherResultsAnalyticsController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.getResults({ params: { assignmentId: "0" }, user: { id: 12 } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const databaseError = new Error("database unavailable");
  const errorController = createTeacherResultsAnalyticsController({
    pool: { async query() { throw databaseError; } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getResults({ params: { assignmentId: "7" }, user: { id: 12 } }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["/teacher/results xatosi:", databaseError]]);
});

test("teacher results analytics route preserves path and middleware order", () => {
  const router = teacherResultsAnalyticsRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/results/:assignmentId");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
