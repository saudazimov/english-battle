const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentWeeklyAiReportController,
} = require("../src/controllers/studentWeeklyAiReportController");
const createStudentWeeklyAiReportRoutes = require("../src/routes/studentWeeklyAiReportRoutes");
const { buildLearningDiagnostics } = require("../aiSnapshot");
const {
  studentFallbackReport,
  studentInsufficientDataReport,
  validateStudentReportShape,
} = require("../aiService");
const {
  SCHEMA_VERSION,
  sourceSnapshotHash,
} = require("../src/services/studentReportCacheService");

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
    student: {
      id: 42,
      name: "Ali Testov",
      phone: "+998901234567",
      cefr_level: "A2",
    },
    period,
    activity: { questions_answered: 12, assignments_completed: 1, exams_taken: 0, active_days: 3 },
    performance: { accuracy: 75, correct_count: 9, wrong_count: 3, timeout_count: 0 },
    learning_diagnostics: {
      analyzed_answers: 12,
      topics: [],
      priority_topics: [],
      strongest_topics: [],
      mistake_topics: [{ topic_id: 10, topic: "Present Simple", rules: [] }],
      classified_errors: 3,
      unclassified_errors: 0,
      sources: { battle_answers: 12 },
      coverage_note: "Period evidence only",
      skill_profiles: [{ taxonomy_id: 99, errors: 40 }],
      pattern_findings: [{ finding_code: "OLD_ERROR" }],
      remediation_targets: [{ finding_code: "OLD_ERROR" }],
    },
    data_quality: { enough_data: true, total_answers: 12, total_assignments: 1, total_exams: 0, confidence: "medium" },
  };
}

function createHarness({
  cachedRows = [],
  queryErrorAt,
  snapshotError,
  serviceError,
  cacheError,
  acquireError,
  saveError,
  deduplicatedRow,
  usage = { input: 10, output: 20 },
} = {}) {
  const calls = [];
  let queryCount = 0;
  const period = { start: "2026-07-20", end: "2026-07-26" };
  const snapshot = harnessSnapshot();
  const learningSnapshot = {
    student: { cefr_level: "A2" },
    period: snapshot.period,
    activity: snapshot.activity,
    performance: snapshot.performance,
    learning_diagnostics: {
      analyzed_answers: 12,
      topics: [],
      priority_topics: [],
      strongest_topics: [],
      mistake_topics: [{ topic_id: 10, topic: "Present Simple", rules: [] }],
      classified_errors: 3,
      unclassified_errors: 0,
      sources: { battle_answers: 12 },
      coverage_note: "Period evidence only",
    },
    assignments: {}, exams: {}, data_quality: snapshot.data_quality,
    snapshot_meta: {
      snapshot_version: "student_learning_snapshot_v4",
      report_schema_version: SCHEMA_VERSION,
    },
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
    reportCacheService: {
      async findCached(key) {
        calls.push(["cache", key]);
        if (cacheError) throw cacheError;
        return cachedRows[0] || null;
      },
      async acquireGeneration(value) {
        calls.push(["acquire", value]);
        if (acquireError) throw acquireError;
        return deduplicatedRow ? { acquired: false } : { acquired: true, jobId: 7 };
      },
      async waitForGeneratedReport(key) {
        calls.push(["wait", key]);
        return deduplicatedRow || null;
      },
      async saveReport(value) {
        calls.push(["save", value]);
        if (saveError) throw saveError;
        return { id: 9, created_at: "2026-07-26T10:00:00Z" };
      },
      async failGeneration(jobId, error) {
        calls.push(["fail", jobId, error.message]);
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
    ["snapshot", 42, "2026-07-20", "2026-07-26"],
    ["cache", {
      studentId: 42,
      reportType: "student_learning_analysis_7d_v5",
      periodStart: "2026-07-20",
      snapshotHash: sourceSnapshotHash(harness.learningSnapshot),
    }],
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
    ["snapshot", 42, "2026-07-20", "2026-07-26"],
    ["cache", {
      studentId: 42, reportType: "student_learning_analysis_7d_v5",
      periodStart: "2026-07-20", snapshotHash: sourceSnapshotHash(harness.learningSnapshot),
    }],
    ["acquire", {
      studentId: 42, reportType: "student_learning_analysis_7d_v5",
      periodStart: "2026-07-20", periodEnd: "2026-07-26",
      snapshotHash: sourceSnapshotHash(harness.learningSnapshot),
    }],
    ["generate", harness.learningSnapshot],
    ["save", {
      studentId: 42, reportType: "student_learning_analysis_7d_v5",
      periodStart: "2026-07-20", periodEnd: "2026-07-26",
      snapshot: harness.learningSnapshot,
      snapshotHash: sourceSnapshotHash(harness.learningSnapshot),
      result: harness.generated, jobId: 7,
    }],
    ["query", usageSql, [42, 9, "model-1", 10, 20]],
  ]);
  assert.equal(response.body.report, harness.generated.report);
  assert.equal(response.body.period, "7d");
  assert.equal(response.body.data_quality.confidence, "medium");
  assert.equal(response.body.analysis.learning_diagnostics.analyzed_answers, 12);
  assert.equal(response.body.analysis.learning_diagnostics.skill_profiles, undefined);
  assert.equal(response.body.analysis.learning_diagnostics.pattern_findings, undefined);
  assert.equal(response.body.analysis.learning_diagnostics.remediation_targets, undefined);
  assert.equal(response.body.cached, false);
});

test("student weekly AI report preserves no-usage path", async () => {
  const harness = createHarness({ usage: null });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: {} },
    response
  );

  assert.equal(harness.calls.filter((call) => call[0] === "query").length, 0);
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
  assert.deepEqual(harness.calls[2][1].reportType, "student_learning_analysis_30d_v5");
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
  assert.deepEqual(harness.calls[2][1].reportType, "student_learning_analysis_today_v5");
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

test("learning diagnostics group reliable mistakes by topic and exact rule", () => {
  const base = {
    source_mode: "battle", topic_id: 10, topic_name: "Present Simple",
    subskill_id: 11, subskill_name: "Third-person singular",
    micro_skill_id: 12, micro_skill_name: "Selecting -s, -es, or -ies",
    micro_skill_slug: "selecting-s-es-ies", question_diagnostic_eligible: true,
    option_a: "go", option_b: "goes", selected_option: "A", correct_option: "B",
    timed_out: false,
  };
  const diagnostics = buildLearningDiagnostics([
    { ...base, source_question_id: 101, question_text: "He ___ to school.", explanation: "Use -es.", is_correct: false },
    { ...base, source_question_id: 102, question_text: "Ali ___ home.", explanation: "Use -s.", is_correct: true },
    { ...base, source_question_id: 103, question_text: "She ___ English.", explanation: "Use -s.", is_correct: false },
    { ...base, source_question_id: 104, question_text: "Ignored unreliable item.", is_correct: false, question_diagnostic_eligible: false },
  ]);

  assert.equal(diagnostics.mistake_topics.length, 1);
  assert.equal(diagnostics.mistake_topics[0].topic, "Present Simple");
  assert.equal(diagnostics.mistake_topics[0].rules[0].rule, "Selecting -s, -es, or -ies");
  assert.equal(diagnostics.mistake_topics[0].rules[0].level, "micro_skill");
  assert.equal(diagnostics.mistake_topics[0].rules[0].attempts, 3);
  assert.equal(diagnostics.mistake_topics[0].rules[0].errors, 2);
  assert.equal(diagnostics.mistake_topics[0].rules[0].evidence.length, 2);
  assert.equal(diagnostics.classified_errors, 2);
  assert.equal(diagnostics.unclassified_errors, 0);
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
  assert.equal(validateStudentReportShape(report, {
    learning_diagnostics: { priority_topics: diagnostics.priority_topics },
    data_quality: { confidence: "medium" },
  }), true);
});

test("student weekly AI report logs rejected usage-log without failing the report", async () => {
  const harness = createHarness({ queryErrorAt: 1 });
  const response = createResponse();

  await harness.controller.generate(
    { user: { id: 42 }, query: {} },
    response
  );
  await Promise.resolve();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.cached, false);
  assert.equal(response.statusCode, 200);
  assert.ok(harness.calls.some((call) => call[0] === "error" && call[1] === "Student AI usage log xatosi:"));
});

test("student weekly AI report preserves awaited error response", async () => {
  const cases = [
    { cacheError: new Error("cache failed") },
    { snapshotError: new Error("snapshot failed") },
    { serviceError: new Error("service failed") },
    { acquireError: new Error("lease failed") },
    { saveError: new Error("save failed") },
  ];

  for (const options of cases) {
    const harness = createHarness(options);
    const response = createResponse();

    await harness.controller.generate(
      { user: { id: 42 }, query: {} },
      response
    );

    const reportError = harness.calls.find((call) => call[0] === "error" && call[1] === "Student AI report xatosi:");
    assert.ok(reportError);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, {
      error: "Hozir hisobotni tayyorlab bo'lmadi. Keyinroq urinib ko'ring.",
    });
  }
});

test("snapshot hash is deterministic for equivalent object key order", () => {
  assert.equal(
    sourceSnapshotHash({ b: 2, a: { d: 4, c: 3 } }),
    sourceSnapshotHash({ a: { c: 3, d: 4 }, b: 2 })
  );
  assert.equal(
    sourceSnapshotHash({ period: { start: "2026-08-01T00:00:00Z", end: "2026-08-07T10:00:00Z" }, answers: 5 }),
    sourceSnapshotHash({ period: { start: "2026-08-01T00:00:01Z", end: "2026-08-07T23:59:59Z" }, answers: 5 })
  );
});

test("preliminary report exposes observations without claiming a full diagnosis", () => {
  const report = studentInsufficientDataReport({
    learning_diagnostics: {
      priority_topics: [{ topic: "Present Simple", attempts: 3, errors: 2 }],
    },
    data_quality: { total_answers: 3, session_count: 1, covered_topic_count: 1 },
  });
  assert.equal(report.status, "preliminary");
  assert.equal(report.confidence, "low");
  assert.match(report.diagnosis, /to'liq hisobot chegarasiga yetmagan/);
  assert.equal(report.priority_topics.length, 1);
  assert.equal(report.topic_lessons.length, 0);
});

test("deep report validation rejects unsupported topic evidence", () => {
  const snapshot = {
    learning_diagnostics: {
      priority_topics: [{ topic: "Present Simple", attempts: 8, errors: 4, accuracy: 50 }],
    },
    data_quality: { confidence: "medium" },
  };
  const report = studentFallbackReport({
    ...snapshot,
    performance: { accuracy: 50 },
    learning_diagnostics: { ...snapshot.learning_diagnostics, analyzed_answers: 8 },
  });
  report.priority_topics[0].topic = "Unsupported invented topic";
  assert.equal(validateStudentReportShape(report, snapshot), false);
});

test("concurrent generation response reuses the completed matching report", async () => {
  const completed = {
    ai_output: { title: "Shared" }, input_snapshot: harnessSnapshot(),
    confidence: "medium", status: "generated", created_at: "2026-07-26T10:00:00Z",
  };
  const harness = createHarness({ deduplicatedRow: completed });
  const response = createResponse();
  await harness.controller.generate({ user: { id: 42 }, query: { refresh: "1" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.cached, true);
  assert.equal(response.body.generation_deduplicated, true);
  assert.equal(harness.calls.some((call) => call[0] === "generate"), false);
});

test("student weekly AI report temporarily allows authenticated non-premium students", () => {
  const router = createStudentWeeklyAiReportRoutes({
    pool: {},
    aiSnapshot: {},
    aiService: {},
  });

  const layer = router.stack.find((item) => item.route
    && item.route.path === "/ai/reports/student/weekly");
  assert.ok(layer);
  const route = layer.route;
  assert.equal(route.path, "/ai/reports/student/weekly");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
  assert.equal(route.stack[2].handle.name, "generate");
});
