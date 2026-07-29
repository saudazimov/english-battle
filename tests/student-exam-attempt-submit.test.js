const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentExamAttemptSubmitService,
} = require("../src/services/studentExamAttemptSubmitService");
const {
  createStudentExamAttemptSubmitController,
} = require("../src/controllers/studentExamAttemptSubmitController");
const studentExamAttemptSubmitRoutes = require("../src/routes/studentExamAttemptSubmitRoutes");

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

test("student exam submit preserves SQL merge order and grading call", async () => {
  const queries = [];
  const gradeCalls = [];
  const responses = [
    { rows: [{ status: "in_progress", answers: { 1: "a" } }] },
    { rows: [] },
  ];
  const gradingResult = { score: 8, percent: 80 };
  const service = createStudentExamAttemptSubmitService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
    async gradeAttempt(attemptId) {
      gradeCalls.push(attemptId);
      return gradingResult;
    },
  });

  assert.deepEqual(await service.submitAttempt({
    attemptId: 12,
    studentId: 5,
    body: { answers: { 2: "b" } },
  }), { status: "submitted", result: gradingResult });
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
  assert.deepEqual(gradeCalls, [12]);
});

test("student exam submit preserves missing and finished attempt results", async () => {
  let gradeCalls = 0;
  async function outcomeFor(rows) {
    const service = createStudentExamAttemptSubmitService({
      pool: { async query() { return { rows }; } },
      async gradeAttempt() {
        gradeCalls += 1;
      },
    });
    return service.submitAttempt({ attemptId: 12, studentId: 5 });
  }

  assert.deepEqual(await outcomeFor([]), { status: "attempt-not-found" });
  assert.deepEqual(
    await outcomeFor([{ status: "submitted" }]),
    { status: "already-finished" }
  );
  assert.equal(gradeCalls, 0);
});

test("student exam submit controller preserves validation and success response", async () => {
  const invalidController = createStudentExamAttemptSubmitController({
    pool: { query: assert.fail },
    gradeAttempt: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.submitAttempt(
    { user: { id: 5 }, params: { attemptId: "bad" }, body: {} },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const gradingResult = { score: 8, percent: 80 };
  const successController = createStudentExamAttemptSubmitController({
    pool: {
      async query() {
        return { rows: [{ status: "in_progress", answers: {} }] };
      },
    },
    async gradeAttempt() {
      return gradingResult;
    },
  });
  const successResponse = createResponse();
  await successController.submitAttempt(
    { user: { id: 5 }, params: { attemptId: "12" }, body: {} },
    successResponse
  );
  assert.deepEqual(successResponse.body, gradingResult);
});

test("student exam submit preserves database error logging", async () => {
  const controller = createStudentExamAttemptSubmitController({
    pool: { async query() { throw new Error("database unavailable"); } },
    gradeAttempt: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.submitAttempt(
      { user: { id: 5 }, params: { attemptId: "12" }, body: {} },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihon submit xatosi:", "database unavailable"]]);
});

test("student exam submit route preserves path and middleware order", () => {
  const router = studentExamAttemptSubmitRoutes({
    pool: { query: assert.fail },
    gradeAttempt: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/exams/attempts/:attemptId/submit");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
