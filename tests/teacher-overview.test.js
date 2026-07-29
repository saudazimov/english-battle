const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherOverviewService,
} = require("../src/services/teacherOverviewService");
const {
  createTeacherOverviewController,
} = require("../src/controllers/teacherOverviewController");
const teacherOverviewRoutes = require("../src/routes/teacherOverviewRoutes");

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

test("teacher overview preserves no-class response and short circuit", async () => {
  const queries = [];
  const service = createTeacherOverviewService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
  });

  assert.deepEqual(await service.getOverview(5), {
    stats: { total_students: 0, completion_rate: 0, avg_score: 0, active_students: 0 },
    chart: { labels: [], assignments: [], exams: [] },
    upcoming_tasks: [],
    recent_activity: [],
    calendar_dates: [],
  });
  assert.deepEqual(queries, [{
    sql: "SELECT id FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
    params: [5],
  }]);
});

test("teacher overview preserves query order, calculations, and mappings", async () => {
  const dueAt = new Date("2026-08-01T00:00:00.000Z");
  const submittedAt = new Date("2026-07-28T00:00:00.000Z");
  const responses = [
    { rows: [{ id: 2 }, { id: 4 }] },
    { rows: [{ c: 4 }] },
    { rows: [{ submitted: 3, total_assignments: 2 }] },
    { rows: [{ avg: 76 }] },
    { rows: [{ c: 2 }] },
    { rows: [
      { day: "01 Jul", assignment_count: 2, exam_count: 1 },
      { day: "02 Jul", assignment_count: 3, exam_count: 4 },
    ] },
    { rows: [{ id: 9, title: "Grammar", class_name: "B1", submitted_count: 3, due_at: dueAt }] },
    { rows: [{
      student_name: " Ali Valiyev ",
      assignment_title: "Grammar",
      class_name: "B1",
      percent: 80,
      submitted_at: submittedAt,
    }] },
    { rows: [{ due_at: dueAt }] },
  ];
  const queries = [];
  const service = createTeacherOverviewService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return responses.shift();
      },
    },
  });

  const result = await service.getOverview(5);

  assert.deepEqual(result, {
    stats: {
      total_students: 4,
      completion_rate: 38,
      avg_score: 76,
      active_students: 2,
    },
    chart: {
      labels: ["01 Jul", "02 Jul"],
      assignments: [2, 3],
    },
    upcoming_tasks: [{
      id: 9,
      title: "Grammar",
      class_name: "B1",
      submitted_count: 3,
      due_at: dueAt,
    }],
    recent_activity: [{
      student_name: "Ali Valiyev",
      assignment_title: "Grammar",
      class_name: "B1",
      percent: 80,
      submitted_at: submittedAt,
    }],
    calendar_dates: [dueAt],
  });
  assert.equal(Object.hasOwn(result.chart, "exams"), false);
  assert.equal(queries.length, 9);
  assert.deepEqual(queries[0], {
    sql: "SELECT id FROM classes WHERE teacher_id = $1 AND archived_at IS NULL",
    params: [5],
  });
  assert.deepEqual(queries.slice(1).map(({ params }) => params), [
    [[2, 4]], [[2, 4]], [[2, 4]], [[2, 4]],
    [[2, 4]], [[2, 4]], [[2, 4]], [[2, 4]],
  ]);
  assert.match(queries[1].sql, /^SELECT COUNT\(DISTINCT student_id\)::int AS c/);
  assert.match(queries[2].sql, /^SELECT\s+COUNT\(\*\) FILTER/);
  assert.match(queries[3].sql, /^SELECT ROUND\(AVG\(s\.percent\)\)::int AS avg/);
  assert.match(queries[4].sql, /^SELECT COUNT\(DISTINCT student_id\)::int AS c FROM/);
  assert.match(queries[5].sql, /^WITH events AS/);
  assert.match(queries[6].sql, /^SELECT a\.id, a\.title/);
  assert.match(queries[7].sql, /^SELECT s\.percent, s\.submitted_at/);
  assert.match(queries[8].sql, /^SELECT DISTINCT due_at/);
});

test("teacher overview preserves zero statistic fallbacks", async () => {
  const responses = [
    { rows: [{ id: 2 }] },
    { rows: [{ c: 0 }] },
    { rows: [{ submitted: null, total_assignments: null }] },
    { rows: [{ avg: null }] },
    { rows: [{ c: 0 }] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    { rows: [] },
  ];
  const service = createTeacherOverviewService({
    pool: { async query() { return responses.shift(); } },
  });

  assert.deepEqual((await service.getOverview(5)).stats, {
    total_students: 0,
    completion_rate: 0,
    avg_score: 0,
    active_students: 0,
  });
});

test("teacher overview controller preserves error logging", async () => {
  const controller = createTeacherOverviewController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await controller.getOverview({ user: { id: 5 } }, response);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Teacher overview xatosi:", "database unavailable"]]);
});

test("teacher overview route preserves path and middleware order", () => {
  const router = teacherOverviewRoutes({ pool: {} });
  const route = router.stack[0].route;

  assert.equal(route.path, "/teacher/overview");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack[1].handle, requireTeacher);
  assert.equal(route.stack.length, 3);
});
