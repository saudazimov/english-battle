const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherAssignmentCreateService,
} = require("../src/services/teacherAssignmentCreateService");
const {
  createTeacherAssignmentCreateController,
} = require("../src/controllers/teacherAssignmentCreateController");
const teacherAssignmentCreateRoutes = require("../src/routes/teacherAssignmentCreateRoutes");

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

function createAllowedPremium() {
  return {
    async checkTeacherLimit() {
      return { allowed: true };
    },
    teacherLimitError: assert.fail,
  };
}

test("teacher assignment create preserves SQL and transaction order", async () => {
  const poolQueries = [];
  const transactionQueries = [];
  let released = false;
  const questions = [{
    id: 31,
    question_text: "Question?",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "B",
    explanation: "Because",
    cefr_level: "B1",
    skill: "grammar",
    difficulty: "medium",
  }];
  const assignment = { id: 72, title: "Grammar task" };
  const client = {
    async query(sql, params) {
      transactionQueries.push({ sql, params });
      if (sql.includes("INSERT INTO assignments")) return { rows: [assignment] };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const pool = {
    async query(sql, params) {
      poolQueries.push({ sql, params });
      return poolQueries.length === 1 ? { rows: [{ id: 9 }] } : { rows: questions };
    },
    async connect() {
      return client;
    },
  };
  const premiumCalls = [];
  const service = createTeacherAssignmentCreateService({
    pool,
    premium: {
      async checkTeacherLimit(...args) {
        premiumCalls.push(args);
        return { allowed: true };
      },
      teacherLimitError: assert.fail,
    },
    logAudit: assert.fail,
  });
  const dueAt = new Date("2026-08-10T12:00:00.000Z");

  const result = await service.createAssignment({
    req: { user: { id: 4 } },
    teacherId: 4,
    classId: 9,
    title: "Grammar task",
    description: "  Practice  ",
    cefrLevel: "B1",
    skill: "grammar",
    questionCount: 1,
    dueAt,
    maxAttempts: 2,
  });

  assert.deepEqual(result, { type: "created", assignment });
  assert.deepEqual(poolQueries[0], {
    sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
    params: [9, 4],
  });
  assert.deepEqual(premiumCalls, [[4, "assignments"]]);
  assert.equal(poolQueries[1].params[0], "B1");
  assert.equal(poolQueries[1].params[1], "grammar");
  assert.match(poolQueries[1].sql, /status = 'published' AND cefr_level = \$1 AND skill = \$2 ORDER BY RANDOM\(\) LIMIT 1$/);
  assert.deepEqual(transactionQueries.map(({ sql }) => sql.trim().split("\n")[0]), [
    "BEGIN",
    "INSERT INTO assignments (class_id, teacher_id, title, description, cefr_level, skill, question_count, due_at, max_attempts)",
    "INSERT INTO assignment_questions",
    "COMMIT",
  ]);
  assert.deepEqual(transactionQueries[1].params, [
    9, 4, "Grammar task", "Practice", "B1", "grammar", 1, dueAt, 2,
  ]);
  assert.deepEqual(transactionQueries[2].params, [
    72, 31, 1, "Question?", "A", "B", "C", "D", "B", "Because", "B1", "grammar", "medium",
  ]);
  assert.equal(released, true);
});

test("teacher assignment create preserves ownership, limit, and question guards", async () => {
  const missingService = createTeacherAssignmentCreateService({
    pool: { async query() { return { rows: [] }; } },
    premium: { checkTeacherLimit: assert.fail },
    logAudit: assert.fail,
  });
  assert.deepEqual(await missingService.createAssignment({ teacherId: 4, classId: 9 }), {
    type: "class_not_found",
  });

  const audits = [];
  const limitError = { error: "limit" };
  const limitedService = createTeacherAssignmentCreateService({
    pool: { async query() { return { rows: [{ id: 9 }] }; } },
    premium: {
      async checkTeacherLimit() {
        return { allowed: false, current: 3, limit: 3 };
      },
      teacherLimitError(feature) {
        assert.equal(feature, "assignments");
        return limitError;
      },
    },
    async logAudit(...args) {
      audits.push(args);
    },
  });
  const req = { user: { id: 4 } };
  assert.deepEqual(await limitedService.createAssignment({ req, teacherId: 4, classId: 9 }), {
    type: "limit_reached",
    error: limitError,
  });
  assert.deepEqual(audits, [[req, "teacher_limit_blocked_assignment", {
    entityType: "assignment",
    entityId: 9,
    details: "teacher=4 count=3 limit=3 plan=free",
  }]]);

  let queryCount = 0;
  const unavailableService = createTeacherAssignmentCreateService({
    pool: {
      async query() {
        queryCount++;
        return queryCount === 1 ? { rows: [{ id: 9 }] } : { rows: [{ id: 1 }] };
      },
      connect: assert.fail,
    },
    premium: createAllowedPremium(),
    logAudit: assert.fail,
  });
  assert.deepEqual(await unavailableService.createAssignment({
    teacherId: 4,
    classId: 9,
    cefrLevel: "A1",
    skill: "mixed",
    questionCount: 2,
  }), { type: "questions_unavailable", available: 1 });
});

test("teacher assignment create rolls back and releases on transaction failure", async () => {
  const calls = [];
  let released = false;
  const failure = new Error("insert failed");
  const service = createTeacherAssignmentCreateService({
    pool: {
      async query(sql) {
        return sql.startsWith("SELECT id FROM classes")
          ? { rows: [{ id: 9 }] }
          : { rows: [{ id: 31 }] };
      },
      async connect() {
        return {
          async query(sql) {
            calls.push(sql);
            if (sql.includes("INSERT INTO assignments")) throw failure;
            return { rows: [] };
          },
          release() {
            released = true;
          },
        };
      },
    },
    premium: createAllowedPremium(),
    logAudit: assert.fail,
  });

  await assert.rejects(service.createAssignment({
    teacherId: 4,
    classId: 9,
    title: "Task",
    description: "",
    cefrLevel: "A1",
    skill: "mixed",
    questionCount: 1,
    dueAt: null,
    maxAttempts: 1,
  }), failure);
  assert.deepEqual(calls.map((sql) => sql.trim().split("\n")[0]), [
    "BEGIN",
    "INSERT INTO assignments (class_id, teacher_id, title, description, cefr_level, skill, question_count, due_at, max_attempts)",
    "ROLLBACK",
  ]);
  assert.equal(released, true);
});

test("teacher assignment create controller preserves validation and errors", async () => {
  const controller = createTeacherAssignmentCreateController({
    pool: { query: assert.fail },
    premium: createAllowedPremium(),
    logAudit: assert.fail,
    sanitizeText(value) { return value; },
  });
  const invalidIdResponse = createResponse();
  await controller.createAssignment(
    { user: { id: 4 }, params: { classId: "bad" }, body: {} },
    invalidIdResponse
  );
  assert.equal(invalidIdResponse.statusCode, 400);
  assert.deepEqual(invalidIdResponse.body, { error: "Noto'g'ri sinf ID" });

  const invalidTitleResponse = createResponse();
  await controller.createAssignment(
    { user: { id: 4 }, params: { classId: "9" }, body: { title: "x" } },
    invalidTitleResponse
  );
  assert.equal(invalidTitleResponse.statusCode, 400);
  assert.deepEqual(invalidTitleResponse.body, { error: "Sarlavha 3–150 belgi bo'lishi kerak" });

  const failingController = createTeacherAssignmentCreateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    premium: createAllowedPremium(),
    logAudit: assert.fail,
    sanitizeText(value) { return value; },
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await failingController.createAssignment({
      user: { id: 4 },
      params: { classId: "9" },
      body: { title: "Task", cefr_level: "A1", skill: "mixed", question_count: 1, max_attempts: 1 },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Topshiriq yaratish xatosi:", "database unavailable"]]);
});

test("teacher assignment create route preserves path and middleware order", () => {
  const router = teacherAssignmentCreateRoutes({
    pool: { query: assert.fail },
    premium: createAllowedPremium(),
    logAudit: assert.fail,
    sanitizeText(value) { return value; },
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/classes/:classId/assignments");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
