const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherStudentRemovalService,
} = require("../src/services/teacherStudentRemovalService");
const {
  createTeacherStudentRemovalController,
} = require("../src/controllers/teacherStudentRemovalController");
const teacherStudentRemovalRoutes = require("../src/routes/teacherStudentRemovalRoutes");

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

test("teacher student removal preserves SQL order and successful result", async () => {
  const queries = [];
  const responses = [
    { rows: [{ id: 4 }] },
    { rows: [{ id: 9 }] },
    { rows: [] },
  ];
  const service = createTeacherStudentRemovalService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  const result = await service.removeStudent({ teacherId: 2, classId: 4, studentId: 7 });

  assert.equal(result, "removed");
  assert.deepEqual(queries, [
    {
      sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
      params: [4, 2],
    },
    {
      sql: "SELECT id FROM class_students WHERE class_id = $1 AND student_id = $2 AND status = 'active'",
      params: [4, 7],
    },
    {
      sql: "UPDATE class_students SET status = 'removed' WHERE class_id = $1 AND student_id = $2",
      params: [4, 7],
    },
  ]);
});

test("teacher student removal preserves class and membership not-found behavior", async () => {
  const classMissing = createTeacherStudentRemovalService({
    pool: { async query() { return { rows: [] }; } },
  });
  assert.equal(
    await classMissing.removeStudent({ teacherId: 2, classId: 4, studentId: 7 }),
    "class-not-found"
  );

  let calls = 0;
  const studentMissing = createTeacherStudentRemovalService({
    pool: {
      async query() {
        calls += 1;
        return calls === 1 ? { rows: [{ id: 4 }] } : { rows: [] };
      },
    },
  });
  assert.equal(
    await studentMissing.removeStudent({ teacherId: 2, classId: 4, studentId: 7 }),
    "student-not-found"
  );
  assert.equal(calls, 2);
});

test("teacher student removal controller preserves responses and error logging", async () => {
  const invalidController = createTeacherStudentRemovalController({ pool: { query: assert.fail } });
  const invalidResponse = createResponse();
  await invalidController.removeStudent(
    { user: { id: 2 }, params: { classId: "bad", studentId: "7" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const error = new Error("database unavailable");
  const errorController = createTeacherStudentRemovalController({
    pool: { async query() { throw error; } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.removeStudent(
      { user: { id: 2 }, params: { classId: "4", studentId: "7" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["O'quvchini olib tashlash xatosi:", "database unavailable"]]);
});

test("teacher student removal route preserves path and middleware order", () => {
  const router = teacherStudentRemovalRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/classes/:classId/students/:studentId");
  assert.equal(layer.route.methods.delete, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
