const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentExamAttemptAnswerService,
} = require("../src/services/studentExamAttemptAnswerService");
const {
  createStudentExamAttemptAnswerController,
} = require("../src/controllers/studentExamAttemptAnswerController");
const studentExamAttemptAnswerRoutes = require("../src/routes/studentExamAttemptAnswerRoutes");

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

test("student exam answer preserves SQL order and answer normalization", async () => {
  const queries = [];
  const responses = [
    { rows: [{ status: "in_progress", expires_at: null, answers: { 1: "a" } }] },
    { rows: [] },
  ];
  const service = createStudentExamAttemptAnswerService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.equal(await service.saveAnswer({
    attemptId: 12,
    studentId: 5,
    questionId: 2,
    answer: "B",
  }), "saved");
  assert.deepEqual(queries, [
    {
      sql: "SELECT * FROM teacher_exam_attempts WHERE id = $1 AND student_id = $2",
      params: [12, 5],
    },
    {
      sql: "UPDATE teacher_exam_attempts SET answers = $1 WHERE id = $2",
      params: [JSON.stringify({ 1: "a", 2: "b" }), 12],
    },
  ]);
});

test("student exam answer preserves attempt state results", async () => {
  async function resultFor(row) {
    const service = createStudentExamAttemptAnswerService({
      pool: { async query() { return { rows: row ? [row] : [] }; } },
    });
    return service.saveAnswer({ attemptId: 12, studentId: 5, questionId: 2, answer: "B" });
  }

  assert.equal(await resultFor(null), "attempt-not-found");
  assert.equal(await resultFor({ status: "submitted" }), "exam-finished");
  assert.equal(await resultFor({
    status: "in_progress",
    expires_at: "2000-01-01T00:00:00.000Z",
  }), "expired");
});

test("student exam answer controller preserves validation and state responses", async () => {
  const invalidController = createStudentExamAttemptAnswerController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.saveAnswer(
    { user: { id: 5 }, params: { attemptId: "bad" }, body: { question_id: 2 } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri so'rov" });

  const expiredController = createStudentExamAttemptAnswerController({
    pool: {
      async query() {
        return {
          rows: [{ status: "in_progress", expires_at: "2000-01-01T00:00:00.000Z" }],
        };
      },
    },
  });
  const expiredResponse = createResponse();
  await expiredController.saveAnswer(
    { user: { id: 5 }, params: { attemptId: "12" }, body: { question_id: 2 } },
    expiredResponse
  );
  assert.equal(expiredResponse.statusCode, 400);
  assert.deepEqual(expiredResponse.body, { error: "Vaqt tugagan", expired: true });
});

test("student exam answer preserves database error logging", async () => {
  const controller = createStudentExamAttemptAnswerController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.saveAnswer(
      { user: { id: 5 }, params: { attemptId: "12" }, body: { question_id: 2 } },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Javob saqlash xatosi:", "database unavailable"]]);
});

test("student exam answer route preserves path and middleware order", () => {
  const router = studentExamAttemptAnswerRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/exams/attempts/:attemptId/answer");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
