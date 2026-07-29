const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherExamDetailService,
} = require("../src/services/teacherExamDetailService");
const {
  createTeacherExamDetailController,
} = require("../src/controllers/teacherExamDetailController");
const teacherExamDetailRoutes = require("../src/routes/teacherExamDetailRoutes");

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

test("teacher exam detail preserves SQL order and response shape", async () => {
  const exam = { id: 12, class_name: "Alpha" };
  const questions = [{ q_order: 1, question_text: "Question" }];
  const queries = [];
  const responses = [{ rows: [exam] }, { rows: questions }];
  const service = createTeacherExamDetailService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.deepEqual(await service.getExamDetail(12, 5), { exam, questions });
  assert.deepEqual(queries, [
    {
      sql: `SELECT e.*, c.name AS class_name
       FROM teacher_exams e LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.id = $1 AND e.teacher_id = $2`,
      params: [12, 5],
    },
    {
      sql: `SELECT q_order, question_text, option_a, option_b, option_c, option_d, skill, difficulty
       FROM teacher_exam_questions WHERE exam_id = $1 ORDER BY q_order`,
      params: [12],
    },
  ]);
});

test("teacher exam detail preserves missing ownership result", async () => {
  let calls = 0;
  const service = createTeacherExamDetailService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  assert.equal(await service.getExamDetail(12, 5), null);
  assert.equal(calls, 1);
});

test("teacher exam detail controller preserves response behavior", async () => {
  const invalidController = createTeacherExamDetailController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.getExamDetail(
    { user: { id: 5 }, params: { id: "bad" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const missingController = createTeacherExamDetailController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.getExamDetail(
    { user: { id: 5 }, params: { id: "12" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Imtihon topilmadi" });
});

test("teacher exam detail preserves database error logging", async () => {
  const controller = createTeacherExamDetailController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.getExamDetail(
      { user: { id: 5 }, params: { id: "12" } },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihon ko'rish xatosi:", "database unavailable"]]);
});

test("teacher exam detail route preserves path and middleware order", () => {
  const router = teacherExamDetailRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/exams/:id");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
