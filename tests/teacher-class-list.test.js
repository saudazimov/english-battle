const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassListController,
} = require("../src/controllers/teacherClassListController");

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

const classesQuery = `SELECT c.id, c.name, c.description, c.join_code, c.created_at,
               COUNT(DISTINCT cs.student_id) FILTER (WHERE cs.status = 'active') AS student_count,
               COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active') AS active_assignments,
               ROUND(AVG(sub.percent)) AS avg_score,
               (SELECT COUNT(*) FROM assignment_submissions sx
                JOIN assignments ax ON ax.id=sx.assignment_id
                WHERE ax.class_id=c.id AND ax.status='active'
                  AND sx.status IN ('submitted','late_submitted')) AS completed_slots
       FROM classes c
       LEFT JOIN class_students cs ON cs.class_id = c.id
       LEFT JOIN assignments a ON a.class_id = c.id AND a.status = 'active'
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id
            AND sub.status IN ('submitted','late_submitted') AND sub.percent IS NOT NULL
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL
       GROUP BY c.id
       ORDER BY c.created_at DESC`;

const nextAssignmentQuery = `SELECT title, due_at FROM assignments
         WHERE class_id = $1 AND status = 'active' AND due_at >= NOW()
         ORDER BY due_at ASC LIMIT 1`;

test("teacher class list preserves query order, row mutation and response", async () => {
  const classes = [
    { id: 7, avg_score: "87", active_assignments: "2", student_count: "2", completed_slots: "3" },
    { id: 8, avg_score: null, active_assignments: null, student_count: "0", completed_slots: null },
  ];
  const dueAt = new Date("2026-08-01T10:00:00.000Z");
  const results = [
    { rows: classes },
    { rows: [{ title: "Next task", due_at: dueAt }] },
    { rows: [] },
  ];
  const queries = [];
  const controller = createTeacherClassListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return results.shift();
      },
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.deepEqual(queries, [
    { sql: classesQuery, params: [42] },
    { sql: nextAssignmentQuery, params: [7] },
    { sql: nextAssignmentQuery, params: [8] },
  ]);
  assert.deepEqual(res.body, {
    classes: [
      {
        id: 7,
        avg_score: 87,
        active_assignments: 2,
        student_count: 2,
        completed_slots: "3",
        next_assignment_title: "Next task",
        next_assignment_due: dueAt,
        completion_percent: 75,
      },
      {
        id: 8,
        avg_score: null,
        active_assignments: 0,
        student_count: 0,
        completed_slots: null,
        next_assignment_title: null,
        next_assignment_due: null,
        completion_percent: 0,
      },
    ],
  });
  assert.equal(res.body.classes[0], classes[0]);
});

test("teacher class list preserves empty response", async () => {
  const queries = [];
  const controller = createTeacherClassListController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.deepEqual(queries, [{ sql: classesQuery, params: [42] }]);
  assert.deepEqual(res.body, { classes: [] });
});

test("teacher class list preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherClassListController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.list({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Sinflar ro'yxati xatosi:", "database unavailable"]]);
});
