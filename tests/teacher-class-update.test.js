const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassUpdateController,
} = require("../src/controllers/teacherClassUpdateController");

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

test("teacher class update preserves invalid-id response before sanitization", async () => {
  let queryCount = 0;
  const controller = createTeacherClassUpdateController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    sanitizeText() { throw new Error("must not sanitize"); },
    logAudit() { throw new Error("must not audit"); },
  });
  const res = createResponse();

  await controller.update({ user: { id: 42 }, params: { classId: "invalid" }, body: {} }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri ID" });
});

test("teacher class update preserves sanitization order and required-name response", async () => {
  const sanitizeCalls = [];
  const controller = createTeacherClassUpdateController({
    pool: { async query() { throw new Error("must not query"); } },
    sanitizeText(value, maxLength) {
      sanitizeCalls.push([value, maxLength]);
      return "";
    },
    logAudit() { throw new Error("must not audit"); },
  });
  const res = createResponse();

  await controller.update({ user: { id: 42 }, params: { classId: "7" }, body: {} }, res);

  assert.deepEqual(sanitizeCalls, [["", 120], ["", 500]]);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Sinf nomini kiriting" });
});

test("teacher class update preserves ownership query and not-found response", async () => {
  const queries = [];
  const controller = createTeacherClassUpdateController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
    sanitizeText(value) { return value.trim(); },
    logAudit() { throw new Error("must not audit"); },
  });
  const res = createResponse();

  await controller.update({
    user: { id: 42 }, params: { classId: "7" }, body: { name: " Class ", description: " Text " },
  }, res);

  assert.deepEqual(queries, [{
    sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
    params: [7, 42],
  }]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Sinf topilmadi" });
});

test("teacher class update preserves update, fire-and-forget audit and response", async () => {
  const queries = [];
  const auditCalls = [];
  const controller = createTeacherClassUpdateController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1 ? { rows: [{ id: 7 }] } : { rows: [] };
      },
    },
    sanitizeText(value) { return value.trim(); },
    logAudit(...args) {
      auditCalls.push(args);
      return new Promise(() => {});
    },
  });
  const req = {
    user: { id: 42 },
    params: { classId: "7" },
    body: { name: " Class ", description: " Text " },
  };
  const res = createResponse();

  await controller.update(req, res);

  assert.deepEqual(queries, [
    {
      sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
      params: [7, 42],
    },
    {
      sql: "UPDATE classes SET name = $1, description = $2 WHERE id = $3",
      params: ["Class", "Text", 7],
    },
  ]);
  assert.deepEqual(auditCalls, [[
    req,
    "class_updated",
    { entityType: "class", entityId: 7, details: { name: "Class" } },
  ]]);
  assert.deepEqual(res.body, { success: true });
});

test("teacher class update preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherClassUpdateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    sanitizeText(value) { return value; },
    logAudit() { throw new Error("must not audit"); },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.update({
    user: { id: 42 }, params: { classId: "7" }, body: { name: "Class" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Sinf tahrirlash xatosi:", "database unavailable"]]);
});
