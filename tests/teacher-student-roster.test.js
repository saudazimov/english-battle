const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherStudentRosterService,
} = require("../src/services/teacherStudentRosterService");
const {
  createTeacherStudentRosterController,
} = require("../src/controllers/teacherStudentRosterController");
const teacherStudentRosterRoutes = require("../src/routes/teacherStudentRosterRoutes");

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("teacher class roster preserves invalid, ownership, and success behavior", async () => {
  const calls = [];
  const results = [
    { rows: [{ id: 4, name: "B1", join_code: "ABC" }] },
    { rows: [{ id: 9, first_name: "Ali", status: "active" }] },
  ];
  let index = 0;
  const service = createTeacherStudentRosterService({
    pool: { async query(sql, params) { calls.push([sql, params]); return results[index++]; } },
  });
  const result = await service.getClassStudents(4, 7);
  assert.deepEqual(calls[0], [
    "SELECT id, name, description, join_code, created_at FROM classes WHERE id = $1 AND teacher_id = $2",
    [4, 7],
  ]);
  assert.match(calls[1][0], /FROM class_students cs/);
  assert.deepEqual(calls[1][1], [4]);
  assert.deepEqual(result, {
    class: { id: 4, name: "B1", join_code: "ABC" },
    students: [{ id: 9, first_name: "Ali", status: "active" }],
  });

  const controller = createTeacherStudentRosterController({
    pool: { async query() { return { rows: [] }; } },
  });
  const invalidResponse = createResponse();
  await controller.classStudents({ params: { classId: "bad" }, user: { id: 7 } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri sinf ID" });
  const missingResponse = createResponse();
  await controller.classStudents({ params: { classId: "4" }, user: { id: 7 } }, missingResponse);
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Sinf topilmadi" });
});

test("teacher all-students preserves mapping and statistics", async () => {
  const calls = [];
  const rows = [
    { id: 1, first_name: "A", last_name: "One", cefr_level: "B1", class_id: 10, class_name: "Alpha", avg_score: "95", assignments_done: "3", assignments_total: "4", active_days_7: "7" },
    { id: 2, first_name: "B", last_name: "Two", cefr_level: "A2", class_id: 10, class_name: "Alpha", avg_score: "80", assignments_done: "2", assignments_total: "4", active_days_7: "0" },
    { id: 3, first_name: "C", last_name: "Three", cefr_level: "B2", class_id: 20, class_name: null, avg_score: "55", assignments_done: "1", assignments_total: "2", active_days_7: "3" },
    { id: 4, first_name: "D", last_name: "Four", cefr_level: "C1", class_id: 30, class_name: "Beta", avg_score: "40", assignments_done: "1", assignments_total: "3", active_days_7: "1" },
    { id: 5, first_name: "E", last_name: "Five", cefr_level: null, class_id: 30, class_name: "Beta", avg_score: null, assignments_done: null, assignments_total: null, active_days_7: null },
  ];
  const service = createTeacherStudentRosterService({
    pool: { async query(sql, params) { calls.push([sql, params]); return { rows }; } },
  });

  const result = await service.listStudents(7);

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^SELECT u\.id, u\.first_name/);
  assert.match(calls[0][0], /WHERE c\.teacher_id = \$1/);
  assert.deepEqual(calls[0][1], [7]);
  assert.deepEqual(result.stats, {
    total: 5, active: 3, avg_score: 68, top_score: 95,
    top_name: "A One (Alpha)", avg_frequency: 2.2,
  });
  assert.deepEqual(result.class_distribution, [
    { class_name: "Alpha", count: 2 },
    { class_name: "—", count: 1 },
    { class_name: "Beta", count: 2 },
  ]);
  assert.deepEqual(result.score_groups, [
    { key: "excellent", count: 1 },
    { key: "good", count: 1 },
    { key: "mid", count: 1 },
    { key: "low", count: 1 },
  ]);
  assert.equal(result.students[4].cefr_level, "A1");
  assert.equal(result.students[4].assignments_done, 0);
});

test("teacher roster preserves separate error logging behavior", async () => {
  const logs = [];
  const failure = new Error("database failed");
  const controller = createTeacherStudentRosterController({
    pool: { async query() { throw failure; } },
    logger: { error(...args) { logs.push(args); } },
  });
  const classResponse = createResponse();
  await controller.classStudents({ params: { classId: "4" }, user: { id: 7 } }, classResponse);
  const allResponse = createResponse();
  await controller.allStudents({ user: { id: 7 } }, allResponse);

  assert.deepEqual(logs, [
    ["Sinf o'quvchilari xatosi:", "database failed"],
    ["/teacher/students xatosi:", failure],
  ]);
  assert.equal(classResponse.statusCode, 500);
  assert.deepEqual(classResponse.body, { error: "Server xatosi" });
  assert.equal(allResponse.statusCode, 500);
  assert.deepEqual(allResponse.body, { error: "Server xatosi" });
});

test("teacher roster routes preserve paths and middleware order", () => {
  const router = teacherStudentRosterRoutes({ pool: {} });

  assert.equal(router.stack.length, 2);
  assert.deepEqual(router.stack.map((layer) => layer.route.path), [
    "/teacher/classes/:classId/students",
    "/teacher/students",
  ]);
  for (const layer of router.stack) {
    assert.equal(layer.route.methods.get, true);
    assert.equal(layer.route.stack.length, 3);
    assert.equal(layer.route.stack[0].handle, authMiddleware);
    assert.equal(layer.route.stack[1].handle, requireTeacher);
  }
});
