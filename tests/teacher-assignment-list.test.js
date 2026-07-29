const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherAssignmentListService,
} = require("../src/services/teacherAssignmentListService");
const {
  createTeacherAssignmentListController,
} = require("../src/controllers/teacherAssignmentListController");
const teacherAssignmentListRoutes = require("../src/routes/teacherAssignmentListRoutes");

const expectedSql = `SELECT a.id, a.title, a.description, a.cefr_level, a.skill, a.question_count,
              a.due_at, a.status, a.created_at, a.class_id,
              c.name AS class_name,
              (SELECT COUNT(*)::int FROM class_students cs WHERE cs.class_id = a.class_id AND cs.status = 'active') AS class_student_count,
              (SELECT COUNT(DISTINCT sub.student_id)::int
               FROM assignment_submissions sub
               WHERE sub.assignment_id = a.id
                 AND sub.status IN ('submitted','late_submitted')) AS submitted_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       WHERE a.teacher_id = $1 AND c.archived_at IS NULL
       ORDER BY a.created_at DESC`;

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("teacher assignment list preserves SQL, mapping, stats, and grouping", async () => {
  const calls = [];
  const base = { description: null, cefr_level: "B1", skill: "grammar", question_count: 10 };
  const rows = [
    { ...base, id: 1, title: "A", due_at: "2026-07-28T00:00:00Z", status: "active", class_id: 10, class_name: "One", class_student_count: 10, submitted_count: 5 },
    { ...base, id: 2, title: "B", due_at: "2026-07-29T00:00:00Z", status: "active", class_id: 10, class_name: "One", class_student_count: 0, submitted_count: 0 },
    { ...base, id: 3, title: "C", due_at: "2026-08-05T00:00:00Z", status: "archived", class_id: 20, class_name: "Two", class_student_count: 2, submitted_count: 1 },
    { ...base, id: 4, title: "D", due_at: "2026-07-25T00:00:00Z", status: "active", class_id: 20, class_name: "Two", class_student_count: 4, submitted_count: 4 },
  ];
  const service = createTeacherAssignmentListService({
    pool: { async query(sql, params) { calls.push([sql, params]); return { rows }; } },
    now: () => new Date("2026-07-27T00:00:00Z"),
  });

  const result = await service.listAssignments(7);

  assert.deepEqual(calls, [[expectedSql, [7]]]);
  assert.deepEqual(result.assignments.map((assignment) => assignment.completion_percent), [50, 0, 50, 100]);
  assert.deepEqual(result.stats, { total: 4, active: 3, soon: 2, avg_completion: 67 });
  assert.deepEqual(result.due_soon.map((assignment) => assignment.id), [4, 1, 2]);
  assert.deepEqual(result.class_completion, [
    { class_name: "One", completion: 50 },
    { class_name: "Two", completion: 75 },
  ]);
  assert.equal(result.assignments[0].total_students, 10);
  assert.equal(result.assignments[0].submitted_count, 5);
});

test("teacher assignment list preserves empty response fallbacks", async () => {
  const service = createTeacherAssignmentListService({
    pool: { async query() { return { rows: [] }; } },
    now: () => new Date("2026-07-27T00:00:00Z"),
  });

  assert.deepEqual(await service.listAssignments(7), {
    assignments: [],
    stats: { total: 0, active: 0, soon: 0, avg_completion: null },
    due_soon: [],
    class_completion: [],
  });
});

test("teacher assignment list preserves full error object logging", async () => {
  const logs = [];
  const failure = new Error("database failed");
  const controller = createTeacherAssignmentListController({
    pool: { async query() { throw failure; } },
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  await controller.list({ user: { id: 7 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["/teacher/assignments xatosi:", failure]]);
});

test("teacher assignment list route preserves middleware order", () => {
  const router = teacherAssignmentListRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/teacher/assignments");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 3);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireTeacher);
});
