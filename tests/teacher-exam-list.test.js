const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherExamListService,
} = require("../src/services/teacherExamListService");
const {
  createTeacherExamListController,
} = require("../src/controllers/teacherExamListController");
const teacherExamListRoutes = require("../src/routes/teacherExamListRoutes");

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

test("teacher exam list preserves SQL order and statistics", async () => {
  const rows = [
    { id: 1, status: "active", duration_minutes: 30, avg_percent: 80 },
    { id: 2, status: "finished", duration_minutes: 45, avg_percent: null },
    { id: 3, status: "scheduled", duration_minutes: 0, avg_percent: 70 },
  ];
  const queries = [];
  const service = createTeacherExamListService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 3 ? { rows } : { rows: [] };
      },
    },
  });

  assert.deepEqual(await service.listExams(5), {
    exams: rows,
    stats: {
      total: 3,
      active: 1,
      finished: 1,
      avg_score: 75,
      avg_duration: 25,
    },
  });
  assert.deepEqual(queries, [
    {
      sql: `UPDATE teacher_exams SET status = 'active'
       WHERE teacher_id = $1 AND status = 'scheduled' AND (starts_at IS NULL OR starts_at <= NOW())`,
      params: [5],
    },
    {
      sql: `UPDATE teacher_exams SET status = 'finished'
       WHERE teacher_id = $1 AND status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`,
      params: [5],
    },
    {
      sql: `SELECT e.id, e.title, e.description, e.cefr_level, e.skill, e.question_count,
              e.duration_minutes, e.pass_percent, e.max_attempts, e.starts_at, e.ends_at,
              e.status, e.created_at, e.class_id,
              c.name AS class_name,
              (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = e.class_id AND cs.status = 'active')::int AS class_student_count,
              (SELECT COUNT(*) FROM teacher_exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted')::int AS submitted_count,
              (SELECT ROUND(AVG(a.percent)) FROM teacher_exam_attempts a WHERE a.exam_id = e.id AND a.status = 'submitted')::int AS avg_percent
       FROM teacher_exams e
       LEFT JOIN classes c ON c.id = e.class_id
       WHERE e.teacher_id = $1
       ORDER BY e.created_at DESC`,
      params: [5],
    },
  ]);
});

test("teacher exam list preserves empty statistics", async () => {
  let calls = 0;
  const service = createTeacherExamListService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  assert.deepEqual(await service.listExams(5), {
    exams: [],
    stats: { total: 0, active: 0, finished: 0, avg_score: 0, avg_duration: 0 },
  });
  assert.equal(calls, 3);
});

test("teacher exam list controller preserves response and error logging", async () => {
  const controller = createTeacherExamListController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.listExams({ user: { id: 5 } }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihonlar ro'yxati xatosi:", "database unavailable"]]);
});

test("teacher exam list route preserves path and middleware order", () => {
  const router = teacherExamListRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/exams");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
