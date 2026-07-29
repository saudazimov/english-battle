const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentExamListService,
} = require("../src/services/studentExamListService");
const {
  createStudentExamListController,
} = require("../src/controllers/studentExamListController");
const studentExamListRoutes = require("../src/routes/studentExamListRoutes");

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

test("student exam list preserves SQL order, arguments, and rows", async () => {
  const exams = [{ id: 12, title: "Exam", status: "active" }];
  const queries = [];
  const service = createStudentExamListService({
    pool: {
      async query(...args) {
        queries.push(args);
        return queries.length === 3 ? { rows: exams } : { rows: [] };
      },
    },
  });

  assert.deepEqual(await service.listExams(5), exams);
  assert.deepEqual(queries, [
    [`UPDATE teacher_exams SET status = 'finished'
       WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at < NOW()`],
    [`UPDATE teacher_exams SET status = 'active'
       WHERE status = 'scheduled' AND (starts_at IS NULL OR starts_at <= NOW())`],
    [
      `SELECT e.id, e.title, e.description, e.cefr_level, e.skill, e.question_count,
              e.duration_minutes, e.pass_percent, e.max_attempts, e.starts_at, e.ends_at,
              e.status, c.name AS class_name,
              (SELECT COUNT(*) FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'submitted')::int AS my_attempts,
              (SELECT a.id FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'in_progress'
                ORDER BY a.started_at DESC LIMIT 1) AS in_progress_id,
              (SELECT a.percent FROM teacher_exam_attempts a
                WHERE a.exam_id = e.id AND a.student_id = $1 AND a.status = 'submitted'
                ORDER BY a.percent DESC LIMIT 1) AS best_percent
       FROM teacher_exams e
       JOIN classes c ON c.id = e.class_id
       JOIN class_students cs ON cs.class_id = c.id
       WHERE cs.student_id = $1 AND cs.status = 'active'
         AND e.status IN ('active', 'finished')
       ORDER BY e.status ASC, e.created_at DESC`,
      [5],
    ],
  ]);
});

test("student exam list controller preserves response and error logging", async () => {
  let calls = 0;
  const successController = createStudentExamListController({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });
  const successResponse = createResponse();
  await successController.listExams({ user: { id: 5 } }, successResponse);
  assert.deepEqual(successResponse.body, { exams: [] });
  assert.equal(calls, 3);

  const errorController = createStudentExamListController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.listExams({ user: { id: 5 } }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Student exams ro'yxati xatosi:", "database unavailable"]]);
});

test("student exam list route preserves path and middleware order", () => {
  const router = studentExamListRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/student/exams");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireStudent);
  assert.equal(layer.route.stack.length, 3);
});
