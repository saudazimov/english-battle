const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentExamAttemptResultService,
} = require("../src/services/studentExamAttemptResultService");
const {
  createStudentExamAttemptResultController,
} = require("../src/controllers/studentExamAttemptResultController");
const studentExamAttemptResultRoutes = require("../src/routes/studentExamAttemptResultRoutes");

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

test("student exam attempt result preserves SQL and ownership filter", async () => {
  const attempt = { id: 12, title: "Exam", pass_percent: 60, cefr_level: "B1" };
  const queries = [];
  const service = createStudentExamAttemptResultService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [attempt] };
      },
    },
  });

  assert.deepEqual(await service.getAttemptResult(12, 5), attempt);
  assert.deepEqual(queries, [{
    sql: `SELECT a.*, e.title, e.pass_percent, e.cefr_level
       FROM teacher_exam_attempts a JOIN teacher_exams e ON e.id = a.exam_id
       WHERE a.id = $1 AND a.student_id = $2`,
    params: [12, 5],
  }]);
});

test("student exam attempt result preserves missing and unvalidated ID behavior", async () => {
  let receivedParams;
  const controller = createStudentExamAttemptResultController({
    pool: {
      async query(_sql, params) {
        receivedParams = params;
        return { rows: [] };
      },
    },
  });
  const response = createResponse();

  await controller.getAttemptResult(
    { user: { id: 5 }, params: { attemptId: "bad" } },
    response
  );

  assert.equal(Number.isNaN(receivedParams[0]), true);
  assert.equal(receivedParams[1], 5);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Natija topilmadi" });
});

test("student exam attempt result controller preserves success and error logging", async () => {
  const attempt = { id: 12, title: "Exam" };
  const successController = createStudentExamAttemptResultController({
    pool: { async query() { return { rows: [attempt] }; } },
  });
  const successResponse = createResponse();
  await successController.getAttemptResult(
    { user: { id: 5 }, params: { attemptId: "12" } },
    successResponse
  );
  assert.deepEqual(successResponse.body, { result: attempt });

  const errorController = createStudentExamAttemptResultController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getAttemptResult(
      { user: { id: 5 }, params: { attemptId: "12" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Natija xatosi:", "database unavailable"]]);
});

test("student exam attempt result route preserves path and middleware order", () => {
  const router = studentExamAttemptResultRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/exams/attempts/:attemptId/result");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
