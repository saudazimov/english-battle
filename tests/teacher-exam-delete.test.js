const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherExamDeleteService,
} = require("../src/services/teacherExamDeleteService");
const {
  createTeacherExamDeleteController,
} = require("../src/controllers/teacherExamDeleteController");
const teacherExamDeleteRoutes = require("../src/routes/teacherExamDeleteRoutes");

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

test("teacher exam delete preserves ownership and delete SQL order", async () => {
  const queries = [];
  const responses = [{ rows: [{ id: 12 }] }, { rows: [] }];
  const service = createTeacherExamDeleteService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  assert.equal(await service.deleteExam(12, 5), true);
  assert.deepEqual(queries, [
    {
      sql: "SELECT id FROM teacher_exams WHERE id = $1 AND teacher_id = $2",
      params: [12, 5],
    },
    {
      sql: "DELETE FROM teacher_exams WHERE id = $1",
      params: [12],
    },
  ]);
});

test("teacher exam delete preserves missing ownership result", async () => {
  let calls = 0;
  const service = createTeacherExamDeleteService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  assert.equal(await service.deleteExam(12, 5), false);
  assert.equal(calls, 1);
});

test("teacher exam delete controller preserves responses and audit", async () => {
  const invalidController = createTeacherExamDeleteController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.deleteExam(
    { user: { id: 5 }, params: { id: "bad" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const missingController = createTeacherExamDeleteController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.deleteExam(
    { user: { id: 5 }, params: { id: "12" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Imtihon topilmadi" });

  const auditCalls = [];
  const successController = createTeacherExamDeleteController({
    pool: { async query() { return { rows: [{ id: 12 }] }; } },
    logAudit(...args) {
      auditCalls.push(args);
    },
  });
  const request = { user: { id: 5 }, params: { id: "12" } };
  const successResponse = createResponse();
  await successController.deleteExam(request, successResponse);
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, { success: true });
  assert.deepEqual(auditCalls, [[
    request,
    "exam_deleted",
    { entityType: "exam", entityId: 12 },
  ]]);
});

test("teacher exam delete preserves database error logging", async () => {
  const controller = createTeacherExamDeleteController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.deleteExam(
      { user: { id: 5 }, params: { id: "12" } },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihon o'chirish xatosi:", "database unavailable"]]);
});

test("teacher exam delete route preserves path and middleware order", () => {
  const router = teacherExamDeleteRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/exams/:id");
  assert.equal(layer.route.methods.delete, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
