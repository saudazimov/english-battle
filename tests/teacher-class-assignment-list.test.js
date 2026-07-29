const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherClassAssignmentListService,
} = require("../src/services/teacherClassAssignmentListService");
const {
  createTeacherClassAssignmentListController,
} = require("../src/controllers/teacherClassAssignmentListController");
const teacherClassAssignmentListRoutes = require("../src/routes/teacherClassAssignmentListRoutes");

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

test("teacher class assignment list preserves SQL and mapping", async () => {
  const queries = [];
  const row = {
    id: 8,
    title: "Task",
    description: "Description",
    cefr_level: "B1",
    skill: "grammar",
    question_count: 10,
    due_at: null,
    status: "active",
    created_at: "2026-01-01",
    total_students: "12",
    submitted_count: "7",
    late_count: "2",
    started_count: "9",
    average_percent: "81",
  };
  const service = createTeacherClassAssignmentListService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1 ? { rows: [{ id: 4 }] } : { rows: [row] };
      },
    },
  });

  assert.deepEqual(await service.listAssignments({
    classId: 4,
    teacherId: 5,
    statusFilter: undefined,
  }), [{
    id: 8,
    title: "Task",
    description: "Description",
    cefr_level: "B1",
    skill: "grammar",
    question_count: 10,
    due_at: null,
    status: "active",
    created_at: "2026-01-01",
    total_students: 12,
    submitted_count: 7,
    late_count: 2,
    not_started_count: 3,
    average_percent: 81,
  }]);
  assert.deepEqual(queries[0], {
    sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2",
    params: [4, 5],
  });
  assert.equal(queries[1].params[0], 4);
  assert.match(queries[1].sql, /WHERE a\.class_id = \$1 AND a\.status = 'active'/);
});

test("teacher class assignment list preserves archived and all filters", async () => {
  async function queryFor(statusFilter) {
    const queries = [];
    const service = createTeacherClassAssignmentListService({
      pool: {
        async query(sql) {
          queries.push(sql);
          return queries.length === 1 ? { rows: [{ id: 4 }] } : { rows: [] };
        },
      },
    });
    await service.listAssignments({ classId: 4, teacherId: 5, statusFilter });
    return queries[1];
  }

  assert.match(await queryFor("archived"), /WHERE a\.class_id = \$1 AND a\.status = 'archived'/);
  assert.match(await queryFor("all"), /WHERE a\.class_id = \$1\n/);
  assert.doesNotMatch(await queryFor("all"), /a\.status =/);
});

test("teacher class assignment list controller preserves validation and errors", async () => {
  const invalidController = createTeacherClassAssignmentListController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.listAssignments(
    { user: { id: 5 }, params: { classId: "bad" }, query: {} },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri sinf ID" });

  const missingController = createTeacherClassAssignmentListController({
    pool: { async query() { return { rows: [] }; } },
  });
  const missingResponse = createResponse();
  await missingController.listAssignments(
    { user: { id: 5 }, params: { classId: "4" }, query: {} },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Sinf topilmadi" });

  const errorController = createTeacherClassAssignmentListController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.listAssignments(
      { user: { id: 5 }, params: { classId: "4" }, query: {} },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Topshiriqlar ro'yxati xatosi:", "database unavailable"]]);
});

test("teacher class assignment list route preserves path and middleware order", () => {
  const router = teacherClassAssignmentListRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/classes/:classId/assignments");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
