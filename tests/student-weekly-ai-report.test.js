const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentWeeklyAiReportController,
} = require("../src/controllers/studentWeeklyAiReportController");
const createStudentWeeklyAiReportRoutes = require("../src/routes/studentWeeklyAiReportRoutes");
const { buildLearningDiagnostics } = require("../aiSnapshot");
const { studentFallbackReport } = require("../aiService");

const cacheSql =
  "SELECT ai_output, input_snapshot, confidence, status, created_at FROM ai_reports WHERE target_student_id=$1 AND report_type=$2 AND period_start=$3 ORDER BY created_at DESC LIMIT 1";
const saveSql =
  "INSERT INTO ai_reports (user_id, target_student_id, report_type, audience, period_start, period_end, input_snapshot, ai_output, confidence, status) VALUES ($1,$1,$2,'student',$3,$4,$5,$6,$7,$8) RETURNING id, created_at";
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

function harnessSnapshot() {
  const period = { start: "2026-07-20", end: "2026-07-26" };
  return {
    period,
    activity: { questions_answered: 12, assignments_completed: 1, exams_taken: 0, active_days: 3 },
    performance: { accuracy: 75, correct_count: 9, wrong_count: 3, timeout_count: 0 },
    learning_diagnostics: { analyzed_answers: 12, priority_topics: [] },
    data_quality: { enough_data: true, total_answers: 12, total_assignments: 1, total_exams: 0, confidence: "medium" },
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
  const snapshot = harnessSnapshot();
  const learningSnapshot = {
    student: { id: undefined, name: undefined, cefr_level: undefined },
    period: snapshot.period,
    activity: snapshot.activity,
    performance: snapshot.performance,
    learning_diagnostics: snapshot.learning_diagnostics,
    assignments: {}, exams: {}, data_quality: snapshot.data_quality,
  };
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
      recentPeriod(days) {
        calls.push(["period", days]);
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
  return { calls, controller, generated, period, snapshot, learningSnapshot };
}

test("student weekly AI report preserves cached short-circuit", async () => {
  const cached = {
    ai_output: { title: "Cached" },
    input_snapshot: harnessSnapshot(),
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
    ["period", 7],
    ["query", cacheSql, [42, "student_learning_analysis_7d_v3", "2026-07-20"]],
  ]);
  assert.equal(response.body.report, cached.ai_output);
  assert.equal(response.body.period, "7d");
  assert.equal(response.body.cached, true);
  assert.equal(response.body.analysis.performance.accuracy, 75);
});

test("student weekly AI report preserves refresh generation and persistence order", async () => {
  const harness = createHarness({ cachedRows: [{ ai_output: {} }] });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: { refresh: "1" } },
    response
  );

  assert.deepEqual(harness.calls, [
    ["period", 7],
    ["query", cacheSql, [42, "student_learning_analysis_7d_v3", "2026-07-20"]],
    ["snapshot", 42, "2026-07-20", "2026-07-26"],
    ["generate", harness.learningSnapshot],
    [
      "query",
      saveSql,
      [
        42,
        "student_learning_analysis_7d_v3",
        "2026-07-20",
        "2026-07-26",
        JSON.stringify(harness.learningSnapshot),
        JSON.stringify(harness.generated.report),
        "high",
        "completed",
      ],
    ],
    ["query", usageSql, [42, 9, "model-1", 10, 20]],
  ]);
  assert.equal(response.body.report, harness.generated.report);
  assert.equal(response.body.period, "7d");
  assert.equal(response.body.data_quality.confidence, "medium");
  assert.equal(response.body.analysis.learning_diagnostics.analyzed_answers, 12);
  assert.equal(response.body.cached, false);
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

test("student learning analysis supports a separate rolling 30 day cache", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: { period: "30d" } },
    response
  );

  assert.deepEqual(harness.calls[0], ["period", 30]);
  assert.deepEqual(harness.calls[1], ["query", cacheSql, [42, "student_learning_analysis_30d_v3", "2026-07-20"]]);
  assert.equal(response.body.period, "30d");
});

test("student learning analysis supports a separate today cache", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: { period: "today" } },
    response
  );

  assert.deepEqual(harness.calls[0], ["period", 1]);
  assert.deepEqual(harness.calls[1], ["query", cacheSql, [42, "student_learning_analysis_today_v3", "2026-07-20"]]);
  assert.equal(response.body.period, "today");
});

test("learning diagnostics rank recurring topics and retain mistake evidence", () => {
  const base = {
    skill: "grammar", timed_out: false,
    option_a: "do", option_b: "does", option_c: "did", option_d: "done",
  };
  const diagnostics = buildLearningDiagnostics([
    { ...base, question_text: "___ he study every day?", explanation: "Present Simple uses does with he.", selected_option: "A", correct_option: "B", is_correct: false },
    { ...base, question_text: "She ___ not like tea.", explanation: "Present Simple uses does not.", selected_option: "A", correct_option: "B", is_correct: false },
    { ...base, question_text: "___ your brother work here?", explanation: "Present Simple question form.", selected_option: "C", correct_option: "B", is_correct: false },
    { ...base, question_text: "I have ___ apple.", explanation: "Use an indefinite article before a vowel sound.", selected_option: "B", correct_option: "A", is_correct: true },
  ]);

  assert.equal(diagnostics.priority_topics[0].topic, "Present Simple");
  assert.equal(diagnostics.priority_topics[0].errors, 3);
  assert.equal(diagnostics.priority_topics[0].accuracy, 0);
  assert.equal(diagnostics.priority_topics[0].evidence[0].selected_answer, "do");
  assert.equal(diagnostics.priority_topics[0].evidence[0].correct_answer, "does");
});

test("student fallback report turns real mistake evidence into topic lessons", () => {
  const diagnostics = buildLearningDiagnostics([
    { question_text: "___ he study every day?", explanation: "Present Simple uses does with he.", selected_option: "A", correct_option: "B", option_a: "do", option_b: "does", skill: "grammar", is_correct: false, timed_out: false },
    { question_text: "She ___ not like tea.", explanation: "Present Simple uses does not with she.", selected_option: "A", correct_option: "B", option_a: "do", option_b: "does", skill: "grammar", is_correct: false, timed_out: false },
    { question_text: "___ your brother work here?", explanation: "Present Simple question form uses does.", selected_option: "C", correct_option: "B", option_b: "does", option_c: "did", skill: "grammar", is_correct: false, timed_out: false },
  ]);
  const report = studentFallbackReport({
    performance: { accuracy: 0 },
    learning_diagnostics: { ...diagnostics, analyzed_answers: 3 },
    data_quality: { confidence: "medium" },
  });

  assert.equal(report.topic_lessons.length, 1);
  assert.equal(report.topic_lessons[0].topic, "Present Simple");
  assert.match(report.topic_lessons[0].misconception, /do/);
  assert.match(report.topic_lessons[0].rule, /does with he/);
  assert.equal(report.topic_lessons[0].worked_examples.length, 3);
  assert.equal(report.topic_lessons[0].practice_sequence.length, 3);
  assert.deepEqual(report.topic_lessons[0].review_schedule, ["Bugun", "1 kundan keyin", "3 kundan keyin", "7 kundan keyin"]);
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

test("student weekly AI report temporarily allows authenticated non-premium students", () => {
  const router = createStudentWeeklyAiReportRoutes({
    pool: {},
    aiSnapshot: {},
    aiService: {},
  });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/ai/reports/student/weekly");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
  assert.equal(route.stack[2].handle.name, "generate");
});
