const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentAssignmentListService,
} = require("../src/services/studentAssignmentListService");
const {
  createStudentAssignmentListController,
} = require("../src/controllers/studentAssignmentListController");
const studentAssignmentListRoutes = require("../src/routes/studentAssignmentListRoutes");

const expectedSql = `SELECT a.id, a.title, a.class_id, c.name AS class_name,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              a.cefr_level, a.skill, a.question_count, a.due_at, a.status,
              s.status AS submission_status, s.score, s.total, s.percent, s.is_late, s.submitted_at
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       JOIN assignments a ON a.class_id = c.id AND a.status = 'active'
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $1
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY a.due_at NULLS LAST, a.created_at DESC`;

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("student assignment list preserves SQL, parameters, and display mapping", async () => {
  const calls = [];
  const base = {
    class_id: 3, class_name: "B1", teacher_first_name: "Ali", teacher_last_name: null,
    cefr_level: "B1", skill: "grammar", question_count: 10, due_at: null,
    status: "active", score: null, total: null, percent: null, submitted_at: null,
  };
  const service = createStudentAssignmentListService({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        return { rows: [
          { ...base, id: 1, title: "New", submission_status: null, is_late: null },
          { ...base, id: 2, title: "Doing", submission_status: "in_progress", is_late: false },
          { ...base, id: 3, title: "Done", submission_status: "submitted", is_late: false },
          { ...base, id: 4, title: "Late", submission_status: "submitted", is_late: true },
        ] };
      },
    },
  });

  const assignments = await service.listAssignments(7);

  assert.deepEqual(calls, [[expectedSql, [7]]]);
  assert.deepEqual(
    assignments.map((assignment) => assignment.submission_status),
    ["not_started", "in_progress", "submitted", "late_submitted"]
  );
  assert.deepEqual(assignments.map((assignment) => assignment.teacher_name), ["Ali", "Ali", "Ali", "Ali"]);
  assert.deepEqual(assignments.map((assignment) => assignment.is_late), [false, false, false, true]);
  assert.equal(assignments[0].class_id, 3);
  assert.equal(assignments[0].question_count, 10);
});

test("student assignment list preserves database error logging and response", async () => {
  const logs = [];
  const controller = createStudentAssignmentListController({
    pool: { async query() { throw new Error("database failed"); } },
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  await controller.list({ user: { id: 7 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["O'quvchi topshiriqlari xatosi:", "database failed"]]);
});

test("student assignment list route preserves middleware order", () => {
  const router = studentAssignmentListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/student/assignments");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireStudent);
});
