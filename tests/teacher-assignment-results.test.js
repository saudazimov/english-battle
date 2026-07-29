const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherAssignmentResultsService,
} = require("../src/services/teacherAssignmentResultsService");
const {
  createTeacherAssignmentResultsController,
} = require("../src/controllers/teacherAssignmentResultsController");
const teacherAssignmentResultsRoutes = require("../src/routes/teacherAssignmentResultsRoutes");

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

test("teacher assignment results preserves SQL, student mapping, and summary", async () => {
  const queries = [];
  const assignment = { id: 7, class_id: 3, title: "Homework" };
  const responses = [
    { rows: [assignment] },
    {
      rows: [
        { student_id: 1, first_name: "Ali", last_name: "Valiyev", profile_picture: "a.png", submission_status: "submitted", score: 8, total: 10, percent: 80, correct_count: 8, wrong_count: 2, unanswered_count: 0, is_late: false, started_at: "start-1", submitted_at: "end-1" },
        { student_id: 2, first_name: "Vali", last_name: null, profile_picture: "", submission_status: "submitted", score: 6, total: 10, percent: 60, correct_count: 6, wrong_count: 4, unanswered_count: 0, is_late: true, started_at: "start-2", submitted_at: "end-2" },
        { student_id: 3, first_name: "Hasan", last_name: "Test", profile_picture: null, submission_status: "in_progress", score: 2, total: 10, percent: 20, correct_count: 2, wrong_count: 1, unanswered_count: 7, is_late: false, started_at: "start-3", submitted_at: null },
        { student_id: 4, first_name: null, last_name: "Karimov", profile_picture: null, submission_status: null, score: null, total: null, percent: null, correct_count: null, wrong_count: null, unanswered_count: null, is_late: null, started_at: null, submitted_at: null },
      ],
    },
  ];
  const service = createTeacherAssignmentResultsService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return responses.shift();
      },
    },
  });

  const outcome = await service.getResults(7, 12);
  assert.equal(outcome.status, "found");
  assert.deepEqual(queries.map((query) => query.params), [[7, 12], [7, 3]]);
  assert.match(queries[0].sql, /FROM assignments WHERE id = \$1 AND teacher_id = \$2$/);
  assert.match(queries[1].sql, /LEFT JOIN assignment_submissions/);
  assert.deepEqual(outcome.result.summary, {
    total_students: 4,
    submitted_count: 2,
    late_count: 1,
    not_started_count: 1,
    completion_percent: 50,
    average_percent: 70,
    highest_percent: 80,
    lowest_percent: 60,
  });
  assert.deepEqual(outcome.result.students.map((student) => student.status), [
    "submitted",
    "late_submitted",
    "in_progress",
    "not_started",
  ]);
  assert.equal(outcome.result.students[1].name, "Vali");
  assert.equal(outcome.result.students[1].profile_picture, null);
  assert.equal(outcome.result.students[3].name, "Karimov");
  assert.equal(outcome.result.students[3].is_late, false);
});

test("teacher assignment results preserves not-found and empty summary", async () => {
  let calls = 0;
  const notFound = createTeacherAssignmentResultsService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });
  assert.deepEqual(await notFound.getResults(7, 12), { status: "not-found" });
  assert.equal(calls, 1);

  const responses = [{ rows: [{ id: 7, class_id: 3 }] }, { rows: [] }];
  const empty = createTeacherAssignmentResultsService({
    pool: { async query() { return responses.shift(); } },
  });
  const outcome = await empty.getResults(7, 12);
  assert.deepEqual(outcome.result.summary, {
    total_students: 0,
    submitted_count: 0,
    late_count: 0,
    not_started_count: 0,
    completion_percent: 0,
    average_percent: 0,
    highest_percent: 0,
    lowest_percent: 0,
  });
});

test("teacher assignment results controller preserves validation and error responses", async () => {
  const invalidController = createTeacherAssignmentResultsController({
    pool: { query: assert.fail },
  });
  const invalidResponse = createResponse();
  await invalidController.getResults({
    params: { id: "invalid" },
    user: { id: 12 },
  }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const errorController = createTeacherAssignmentResultsController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getResults({
      params: { id: "7" },
      user: { id: 12 },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Topshiriq natijalari xatosi:", "database unavailable"]]);
});

test("teacher assignment results route preserves path and middleware order", () => {
  const router = teacherAssignmentResultsRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/assignments/:id/results");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
