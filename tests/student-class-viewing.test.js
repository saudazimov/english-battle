const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentClassViewingService,
} = require("../src/services/studentClassViewingService");
const {
  createStudentClassViewingController,
} = require("../src/controllers/studentClassViewingController");
const {
  createStudentClassViewingRoutes,
} = require("../src/routes/studentClassViewingRoutes");

const listSql = `SELECT c.id, c.name, c.description, c.join_code, c.created_at, c.teacher_id,
              t.first_name AS teacher_first_name, t.last_name AS teacher_last_name,
              (SELECT COUNT(*) FROM class_students m WHERE m.class_id = c.id AND m.status = 'active') AS student_count
       FROM class_students cs
       JOIN classes c ON c.id = cs.class_id
       JOIN users t ON t.id = c.teacher_id
       WHERE cs.student_id = $1 AND cs.status = 'active' AND c.archived_at IS NULL
       ORDER BY cs.joined_at DESC`;

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("student class list preserves SQL, parameters, and response", async () => {
  const calls = [];
  const rows = [{ id: 4, name: "B1", student_count: "12" }];
  const service = createStudentClassViewingService({
    pool: { async query(sql, params) { calls.push([sql, params]); return { rows }; } },
    activeClassMembership: async () => true,
  });

  assert.equal(await service.listClasses(7), rows);
  assert.deepEqual(calls, [[listSql, [7]]]);
});

test("student class ranking preserves invalid and missing-class responses", async () => {
  let membershipCalls = 0;
  const controller = createStudentClassViewingController({
    pool: { async query() { throw new Error("unexpected query"); } },
    activeClassMembership: async () => { membershipCalls += 1; return false; },
  });

  const invalidResponse = createResponse();
  await controller.ranking(
    { params: { classId: "bad" }, user: { id: 7 } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri sinf ID" });
  assert.equal(membershipCalls, 0);

  const missingResponse = createResponse();
  await controller.ranking(
    { params: { classId: "4" }, user: { id: 7 } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Sinf topilmadi" });
  assert.equal(membershipCalls, 1);
});

test("student class ranking preserves query and rank mapping", async () => {
  const calls = [];
  const rows = [
    { id: 9, first_name: "A", avg_percent: 95, completed: 3 },
    { id: 7, first_name: "B", avg_percent: 80, completed: 2 },
  ];
  const service = createStudentClassViewingService({
    pool: { async query(sql, params) { calls.push([sql, params]); return { rows }; } },
    activeClassMembership: async (classId, studentId) => {
      assert.deepEqual([classId, studentId], [4, 7]);
      return true;
    },
  });

  const result = await service.getRanking(4, 7);

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^WITH best_submissions AS/);
  assert.match(calls[0][0], /ORDER BY COALESCE\(sc\.avg_percent,0\) DESC/);
  assert.deepEqual(calls[0][1], [4]);
  assert.deepEqual(result, {
    ranking: [
      { id: 9, first_name: "A", avg_percent: 95, completed: 3, rank: 1 },
      { id: 7, first_name: "B", avg_percent: 80, completed: 2, rank: 2 },
    ],
    my_rank: 2,
  });
});

test("student class viewing preserves separate error responses", async () => {
  const logs = [];
  const controller = createStudentClassViewingController({
    pool: { async query() { throw new Error("database failed"); } },
    activeClassMembership: async () => true,
    logger: { error(...args) { logs.push(args); } },
  });
  const listResponse = createResponse();
  await controller.list({ user: { id: 7 } }, listResponse);
  const rankingResponse = createResponse();
  await controller.ranking(
    { params: { classId: "4" }, user: { id: 7 } },
    rankingResponse
  );

  assert.deepEqual(logs, [
    ["O'quvchi sinflari xatosi:", "database failed"],
    ["Sinf reytingi xatosi:", "database failed"],
  ]);
  assert.equal(listResponse.statusCode, 500);
  assert.deepEqual(listResponse.body, { error: "Server xatosi" });
  assert.equal(rankingResponse.statusCode, 500);
  assert.deepEqual(rankingResponse.body, { error: "Server xatosi" });
});

test("student class routers preserve paths and middleware order", () => {
  const routes = createStudentClassViewingRoutes({
    pool: {},
    activeClassMembership: async () => true,
  });
  assert.equal(routes.listRouter.stack.length, 1);
  assert.equal(routes.rankingRouter.stack.length, 1);
  const listRoute = routes.listRouter.stack[0].route;
  const rankingRoute = routes.rankingRouter.stack[0].route;
  assert.equal(listRoute.path, "/student/classes");
  assert.equal(rankingRoute.path, "/student/classes/:classId/ranking");
  for (const route of [listRoute, rankingRoute]) {
    assert.equal(route.methods.get, true);
    assert.equal(route.stack.length, 3);
    assert.equal(route.stack[0].handle, authMiddleware);
    assert.equal(route.stack[1].handle, requireStudent);
  }
});
