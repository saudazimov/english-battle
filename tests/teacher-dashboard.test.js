const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherDashboardController,
} = require("../src/controllers/teacherDashboardController");

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

test("teacher dashboard preserves query order, conversions and response", async () => {
  const teacher = { id: 42, first_name: "Kamola", school: "1-maktab" };
  const results = [
    { rows: [teacher] },
    { rows: [{ count: "2" }] },
    { rows: [{ count: "15" }] },
    { rows: [{ count: 4 }] },
    { rows: [{ average: 87 }] },
  ];
  const queries = [];
  const controller = createTeacherDashboardController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return results.shift();
      },
    },
  });
  const res = createResponse();

  await controller.getDashboard({ user: { id: 42 } }, res);

  assert.deepEqual(queries, [
    {
      sql: "SELECT id, first_name, last_name, school, profile_picture FROM users WHERE id = $1",
      params: [42],
    },
    {
      sql: "SELECT COUNT(*) AS count FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
      params: [42],
    },
    {
      sql: `SELECT COUNT(DISTINCT cs.student_id) AS count
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       WHERE c.teacher_id = $1 AND c.archived_at IS NULL AND cs.status = 'active'`,
      params: [42],
    },
    {
      sql: "SELECT COUNT(*)::int AS count FROM assignments WHERE teacher_id=$1 AND status='active'",
      params: [42],
    },
    {
      sql: `SELECT ROUND(AVG(s.percent))::int AS average
       FROM assignment_submissions s
       JOIN assignments a ON a.id=s.assignment_id
       WHERE a.teacher_id=$1 AND s.status IN ('submitted','late_submitted')`,
      params: [42],
    },
  ]);
  assert.deepEqual(res.body, {
    teacher,
    stats: {
      totalClasses: 2,
      totalStudents: 15,
      activeAssignments: 4,
      averagePerformance: 87,
    },
  });
});

test("teacher dashboard preserves null defaults", async () => {
  const results = [
    { rows: [] },
    { rows: [{ count: "0" }] },
    { rows: [{ count: "0" }] },
    { rows: [{ count: null }] },
    { rows: [{ average: null }] },
  ];
  const controller = createTeacherDashboardController({
    pool: { async query() { return results.shift(); } },
  });
  const res = createResponse();

  await controller.getDashboard({ user: { id: 42 } }, res);

  assert.deepEqual(res.body, {
    teacher: null,
    stats: {
      totalClasses: 0,
      totalStudents: 0,
      activeAssignments: 0,
      averagePerformance: 0,
    },
  });
});

test("teacher dashboard preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherDashboardController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.getDashboard({ user: { id: 42 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher dashboard xatosi:", "database unavailable"]]);
});
