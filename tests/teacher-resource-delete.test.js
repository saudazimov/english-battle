const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherResourceDeleteController,
} = require("../src/controllers/teacherResourceDeleteController");

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

function createController(overrides = {}) {
  return createTeacherResourceDeleteController({
    pool: { async query() { return { rows: [] }; } },
    fileSystem: { existsSync() { return false; }, unlinkSync() {} },
    resourceAbsolutePath: (value) => value,
    logAudit: undefined,
    ...overrides,
  });
}

test("teacher resource delete preserves invalid ID validation", async () => {
  let queryCount = 0;
  const controller = createController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
  });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, params: { id: "invalid" } }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Noto'g'ri ID" });
});

test("teacher resource delete preserves the ownership query and not-found response", async () => {
  const queries = [];
  const controller = createController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
  });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, params: { id: "10" } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    "SELECT file_path FROM teacher_resources WHERE id = $1 AND teacher_id = $2"
  );
  assert.deepEqual(queries[0].params, [10, 42]);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: "Resurs topilmadi" });
});

test("teacher resource delete preserves DB delete, file cleanup and audit", async () => {
  const queries = [];
  const fileCalls = [];
  const auditCalls = [];
  const req = { user: { id: 42 }, params: { id: "10" } };
  const controller = createController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (queries.length === 1) return { rows: [{ file_path: "/uploads/resources/book.pdf" }] };
        return { rowCount: 1 };
      },
    },
    fileSystem: {
      existsSync(path) { fileCalls.push(["exists", path]); return true; },
      unlinkSync(path) { fileCalls.push(["unlink", path]); },
    },
    resourceAbsolutePath(filePath) {
      assert.equal(filePath, "/uploads/resources/book.pdf");
      return "C:/safe/book.pdf";
    },
    logAudit(...args) { auditCalls.push(args); },
  });
  const res = createResponse();

  await controller.remove(req, res);

  assert.equal(queries[1].sql, "DELETE FROM teacher_resources WHERE id = $1");
  assert.deepEqual(queries[1].params, [10]);
  assert.deepEqual(fileCalls, [["exists", "C:/safe/book.pdf"], ["unlink", "C:/safe/book.pdf"]]);
  assert.deepEqual(auditCalls, [[req, "resource_deleted", { entityType: "resource", entityId: 10 }]]);
  assert.deepEqual(res.body, { success: true });
});

test("teacher resource delete preserves success when file cleanup fails", async () => {
  const controller = createController({
    pool: {
      async query(sql) {
        if (sql.startsWith("SELECT")) return { rows: [{ file_path: "missing.pdf" }] };
        return { rowCount: 1 };
      },
    },
    fileSystem: { existsSync() { throw new Error("disk unavailable"); }, unlinkSync() {} },
  });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, params: { id: "10" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
});

test("teacher resource delete preserves the existing safe database error response", async () => {
  const logged = [];
  const controller = createController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, params: { id: "10" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Resurs o'chirish xatosi:", "database unavailable"]]);
});
