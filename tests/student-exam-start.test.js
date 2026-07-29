const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentExamStartService,
} = require("../src/services/studentExamStartService");
const {
  createStudentExamStartController,
} = require("../src/controllers/studentExamStartController");
const studentExamStartRoutes = require("../src/routes/studentExamStartRoutes");

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

function activeExam(overrides = {}) {
  return {
    id: 7,
    status: "active",
    title: "B1 Exam",
    duration_minutes: 30,
    question_count: 10,
    max_attempts: 3,
    ...overrides,
  };
}

test("student exam start preserves resumed attempt SQL and response", async () => {
  const expiresAt = new Date(Date.now() + 60_000);
  const savedAnswers = { 1: "A" };
  const questions = [{ id: 21, q_order: 1, question_text: "Question?" }];
  const responses = [
    { rows: [activeExam()] },
    { rows: [{ id: 12, expires_at: expiresAt, answers: savedAnswers }] },
    { rows: questions },
  ];
  const queries = [];
  const service = createStudentExamStartService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
    gradeAttempt: assert.fail,
  });

  const result = await service.startExam({ examId: 7, studentId: 5 });

  assert.equal(result.status, "started");
  assert.equal(result.response.attempt_id, 12);
  assert.equal(result.response.resumed, true);
  assert.deepEqual(result.response.exam, {
    title: "B1 Exam",
    duration_minutes: 30,
    question_count: 10,
  });
  assert.deepEqual(result.response.questions, questions);
  assert.deepEqual(result.response.saved_answers, savedAnswers);
  assert.ok(result.response.seconds_left === 59 || result.response.seconds_left === 60);
  assert.deepEqual(queries[0], {
    sql: `SELECT e.* FROM teacher_exams e
       JOIN class_students cs ON cs.class_id = e.class_id
       WHERE e.id = $1 AND cs.student_id = $2 AND cs.status = 'active'`,
    params: [7, 5],
  });
  assert.match(queries[1].sql, /status = 'in_progress'/);
  assert.deepEqual(queries[1].params, [7, 5]);
  assert.match(queries[2].sql, /FROM teacher_exam_questions WHERE exam_id = \$1 ORDER BY q_order/);
  assert.deepEqual(queries[2].params, [7]);
});

test("student exam start preserves expired attempt grading", async () => {
  const gradeCalls = [];
  const responses = [
    { rows: [activeExam()] },
    { rows: [{ id: 12, expires_at: new Date(Date.now() - 60_000) }] },
  ];
  const service = createStudentExamStartService({
    pool: { async query() { return responses.shift(); } },
    async gradeAttempt(attemptId) {
      gradeCalls.push(attemptId);
    },
  });

  assert.deepEqual(await service.startExam({ examId: 7, studentId: 5 }), {
    status: "attempt-expired",
  });
  assert.deepEqual(gradeCalls, [12]);
});

test("student exam start preserves new attempt SQL and response", async () => {
  const questions = [{ id: 21, q_order: 1 }];
  const responses = [
    { rows: [activeExam()] },
    { rows: [] },
    { rows: [{ c: 1 }] },
    { rows: [{ id: 13 }] },
    { rows: questions },
  ];
  const queries = [];
  const before = Date.now();
  const service = createStudentExamStartService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
    gradeAttempt: assert.fail,
  });

  const result = await service.startExam({ examId: 7, studentId: 5 });
  const after = Date.now();

  assert.deepEqual(result, {
    status: "started",
    response: {
      attempt_id: 13,
      resumed: false,
      exam: { title: "B1 Exam", duration_minutes: 30, question_count: 10 },
      questions,
      saved_answers: {},
      seconds_left: 1800,
    },
  });
  assert.match(queries[2].sql, /COUNT\(\*\)::int AS c/);
  assert.deepEqual(queries[2].params, [7, 5]);
  assert.match(queries[3].sql, /^INSERT INTO teacher_exam_attempts/);
  assert.equal(queries[3].params[0], 7);
  assert.equal(queries[3].params[1], 5);
  assert.equal(queries[3].params[2], 2);
  assert.ok(queries[3].params[3] instanceof Date);
  assert.ok(queries[3].params[3].getTime() >= before + 1_800_000);
  assert.ok(queries[3].params[3].getTime() <= after + 1_800_000);
  assert.equal(queries[3].params[4], 10);
  assert.deepEqual(queries[4].params, [7]);
});

test("student exam start preserves access and attempt guards", async () => {
  const missingService = createStudentExamStartService({
    pool: { async query() { return { rows: [] }; } },
    gradeAttempt: assert.fail,
  });
  assert.deepEqual(await missingService.startExam({ examId: 7, studentId: 5 }), {
    status: "exam-not-found",
  });

  const inactiveService = createStudentExamStartService({
    pool: { async query() { return { rows: [activeExam({ status: "scheduled" })] }; } },
    gradeAttempt: assert.fail,
  });
  assert.deepEqual(await inactiveService.startExam({ examId: 7, studentId: 5 }), {
    status: "exam-inactive",
  });

  const responses = [
    { rows: [activeExam({ max_attempts: 2 })] },
    { rows: [] },
    { rows: [{ c: 2 }] },
  ];
  const exhaustedService = createStudentExamStartService({
    pool: { async query() { return responses.shift(); } },
    gradeAttempt: assert.fail,
  });
  assert.deepEqual(await exhaustedService.startExam({ examId: 7, studentId: 5 }), {
    status: "attempts-exhausted",
    maxAttempts: 2,
  });
});

test("student exam start controller preserves validation and error responses", async () => {
  const invalidController = createStudentExamStartController({
    pool: { query: assert.fail },
    gradeAttempt: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.startExam(
    { user: { id: 5 }, params: { id: "bad" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const expiredController = createStudentExamStartController({
    pool: {
      async query(sql) {
        return sql.startsWith("SELECT e.*")
          ? { rows: [activeExam()] }
          : { rows: [{ id: 12, expires_at: new Date(Date.now() - 60_000) }] };
      },
    },
    async gradeAttempt() {},
  });
  const expiredResponse = createResponse();
  await expiredController.startExam(
    { user: { id: 5 }, params: { id: "7" } },
    expiredResponse
  );
  assert.equal(expiredResponse.statusCode, 409);
  assert.deepEqual(expiredResponse.body, {
    error: "Oldingi urinish vaqti tugagan",
    expired: true,
  });

  const failingController = createStudentExamStartController({
    pool: { async query() { throw new Error("database unavailable"); } },
    gradeAttempt: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await failingController.startExam(
      { user: { id: 5 }, params: { id: "7" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Imtihon start xatosi:", "database unavailable"]]);
});

test("student exam start route preserves path and middleware order", () => {
  const router = studentExamStartRoutes({
    pool: { query: assert.fail },
    gradeAttempt: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/exams/:id/start");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
