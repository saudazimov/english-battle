const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherClassCreateController,
} = require("../src/controllers/teacherClassCreateController");

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

function createDependencies(overrides = {}) {
  return {
    pool: { async query() { throw new Error("must not query"); } },
    premium: {
      async checkTeacherLimit() { return { allowed: true }; },
      teacherLimitError() { throw new Error("must not build limit error"); },
    },
    sanitizeText(value) { return value; },
    async logAudit() { throw new Error("must not audit"); },
    random() { return 0; },
    ...overrides,
  };
}

test("teacher class create preserves required-name validation", async () => {
  const controller = createTeacherClassCreateController(createDependencies({
    sanitizeText() { throw new Error("must not sanitize"); },
  }));
  const res = createResponse();

  await controller.create({ user: { id: 42 }, body: {} }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Sinf nomi majburiy" });
});

test("teacher class create preserves name-length validation", async () => {
  const controller = createTeacherClassCreateController(createDependencies({
    sanitizeText() { throw new Error("must not sanitize"); },
  }));
  const res = createResponse();

  await controller.create({ user: { id: 42 }, body: { name: "A".repeat(121) } }, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Sinf nomi juda uzun (120 belgidan oshmasin)" });
});

test("teacher class create preserves free-plan limit audit and response", async () => {
  const sanitizeCalls = [];
  const auditCalls = [];
  const limitError = { error: "Limit", upgrade_required: true };
  const controller = createTeacherClassCreateController(createDependencies({
    sanitizeText(value, maxLength) {
      sanitizeCalls.push([value, maxLength]);
      return String(value || "").trim();
    },
    premium: {
      async checkTeacherLimit(teacherId, resource) {
        assert.deepEqual([teacherId, resource], [42, "classes"]);
        return { allowed: false, current: 1, limit: 1 };
      },
      teacherLimitError(resource) {
        assert.equal(resource, "classes");
        return limitError;
      },
    },
    async logAudit(...args) {
      auditCalls.push(args);
      throw new Error("audit unavailable");
    },
  }));
  const req = { user: { id: 42 }, body: { name: " Class ", description: " Desc " } };
  const res = createResponse();

  await controller.create(req, res);

  assert.deepEqual(sanitizeCalls, [[" Class ", 120], [" Desc ", 500]]);
  assert.deepEqual(auditCalls, [[
    req,
    "teacher_limit_blocked_class",
    {
      entityType: "class",
      entityId: 42,
      details: "teacher=42 count=1 limit=1 plan=free",
    },
  ]]);
  assert.equal(res.statusCode, 402);
  assert.deepEqual(res.body, limitError);
});

test("teacher class create preserves unique-code query, insert and response", async () => {
  const queries = [];
  const createdClass = { id: 9, teacher_id: 42, name: "Class", join_code: "AAAAAA" };
  const controller = createTeacherClassCreateController(createDependencies({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (queries.length === 1) return { rows: [{ id: 1 }] };
        if (queries.length === 2) return { rows: [] };
        return { rows: [createdClass] };
      },
    },
    sanitizeText(value) { return String(value || "").trim(); },
  }));
  const res = createResponse();

  await controller.create({
    user: { id: 42 }, body: { name: " Class ", description: " Desc " },
  }, res);

  assert.deepEqual(queries, [
    { sql: "SELECT id FROM classes WHERE join_code = $1", params: ["AAAAAA"] },
    { sql: "SELECT id FROM classes WHERE join_code = $1", params: ["AAAAAA"] },
    {
      sql: `INSERT INTO classes (teacher_id, school_id, name, description, join_code)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, teacher_id, school_id, name, description, join_code, created_at, archived_at`,
      params: [42, null, "Class", "Desc", "AAAAAA"],
    },
  ]);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { message: "Sinf yaratildi", class: createdClass });
});

test("teacher class create preserves ten-attempt failure and error response", async () => {
  let queryCount = 0;
  const logged = [];
  const controller = createTeacherClassCreateController(createDependencies({
    pool: {
      async query() {
        queryCount += 1;
        return { rows: [{ id: queryCount }] };
      },
    },
    logger: { error(...args) { logged.push(args); } },
  }));
  const res = createResponse();

  await controller.create({ user: { id: 42 }, body: { name: "Class" } }, res);

  assert.equal(queryCount, 10);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [[
    "Sinf yaratish xatosi:",
    "Join code yaratib bo'lmadi, qayta urinib ko'ring",
  ]]);
});
