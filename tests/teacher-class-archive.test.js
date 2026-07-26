const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassArchiveController,
} = require("../src/controllers/teacherClassArchiveController");

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

test("teacher class archive preserves invalid-id response before database access", async () => {
  let queryCount = 0;
  const controller = createTeacherClassArchiveController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    logAudit() { throw new Error("must not audit"); },
  });
  const res = createResponse();

  await controller.archive({ user: { id: 42 }, params: { classId: "invalid" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri ID" });
});

test("teacher class archive preserves ownership query and not-found response", async () => {
  const queries = [];
  const controller = createTeacherClassArchiveController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
    logAudit() { throw new Error("must not audit"); },
  });
  const res = createResponse();

  await controller.archive({ user: { id: 42 }, params: { classId: "7" } }, res);

  assert.deepEqual(queries, [{
    sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
    params: [7, 42],
  }]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Sinf topilmadi" });
});

test("teacher class archive preserves update, fire-and-forget audit and response", async () => {
  const queries = [];
  const auditCalls = [];
  const controller = createTeacherClassArchiveController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1 ? { rows: [{ id: 7 }] } : { rows: [] };
      },
    },
    logAudit(...args) {
      auditCalls.push(args);
      return new Promise(() => {});
    },
  });
  const req = { user: { id: 42 }, params: { classId: "7" } };
  const res = createResponse();

  await controller.archive(req, res);

  assert.deepEqual(queries, [
    {
      sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
      params: [7, 42],
    },
    {
      sql: "UPDATE classes SET archived_at = NOW() WHERE id = $1",
      params: [7],
    },
  ]);
  assert.deepEqual(auditCalls, [[
    req,
    "class_archived",
    { entityType: "class", entityId: 7 },
  ]]);
  assert.deepEqual(res.body, { success: true });
});

test("teacher class archive preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherClassArchiveController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logAudit() { throw new Error("must not audit"); },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.archive({ user: { id: 42 }, params: { classId: "7" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Sinf arxivlash xatosi:", "database unavailable"]]);
});
