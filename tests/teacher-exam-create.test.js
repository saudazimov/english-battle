const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware, requireTeacher } = require("../auth");
const {
  createTeacherExamCreateService,
} = require("../src/services/teacherExamCreateService");
const {
  createTeacherExamCreateController,
} = require("../src/controllers/teacherExamCreateController");
const teacherExamCreateRoutes = require("../src/routes/teacherExamCreateRoutes");

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

function question(id, skill = "grammar") {
  return {
    id,
    question_text: `Question ${id}?`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "B",
    explanation: "Because",
    cefr_level: "B1",
    skill,
    difficulty: "medium",
  };
}

test("teacher exam create preserves SQL order, snapshot mapping, and audit", async () => {
  const queries = [];
  const audits = [];
  const questions = [question(31), question(32)];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ id: 9 }] };
      if (queries.length === 2) return { rows: questions };
      if (queries.length === 3) return { rows: [{ id: 72 }] };
      return { rows: [] };
    },
  };
  const service = createTeacherExamCreateService({
    pool,
    logAudit(...args) {
      audits.push(args);
    },
  });
  const req = { user: { id: 4 } };
  const startsAt = new Date("2999-08-10T12:00:00.000Z");
  const endsAt = new Date("2999-08-10T13:00:00.000Z");

  const result = await service.createExam({
    req,
    teacherId: 4,
    classId: 9,
    title: "Grammar exam",
    description: "  Review  ",
    cefrLevel: "B1",
    skill: "grammar",
    questionCount: 3,
    durationMinutes: 30,
    passPercent: 70,
    maxAttempts: 2,
    startsAt,
    endsAt,
  });

  assert.deepEqual(result, { type: "created", examId: 72, questionCount: 2 });
  assert.deepEqual(queries[0], {
    sql: "SELECT id FROM classes WHERE id = $1 AND teacher_id = $2 AND archived_at IS NULL",
    params: [9, 4],
  });
  assert.deepEqual(queries[1].params, ["B1", "grammar"]);
  assert.match(queries[1].sql, /status = 'published' AND cefr_level = \$1 AND skill = \$2 ORDER BY RANDOM\(\) LIMIT 3$/);
  assert.match(queries[2].sql, /^INSERT INTO teacher_exams/);
  assert.deepEqual(queries[2].params, [
    4, 9, "Grammar exam", "Review", "B1", "grammar", 2,
    30, 70, 2, startsAt, endsAt, "scheduled",
  ]);
  assert.deepEqual(queries[3].params, [
    72, 31, 1, "Question 31?", "A", "B", "C", "D", "B", "Because", "grammar", "B1", "medium",
  ]);
  assert.deepEqual(queries[4].params, [
    72, 32, 2, "Question 32?", "A", "B", "C", "D", "B", "Because", "grammar", "B1", "medium",
  ]);
  assert.deepEqual(audits, [[req, "exam_created", { entityType: "exam", entityId: 72 }]]);
});

test("teacher exam create preserves optional class and question guards", async () => {
  const missingService = createTeacherExamCreateService({
    pool: { async query() { return { rows: [] }; } },
    logAudit: assert.fail,
  });
  assert.deepEqual(await missingService.createExam({ classId: 9, teacherId: 4 }), {
    type: "class_not_found",
  });

  const queries = [];
  const unavailableService = createTeacherExamCreateService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [] };
      },
    },
    logAudit: assert.fail,
  });
  assert.deepEqual(await unavailableService.createExam({
    classId: null,
    teacherId: 4,
    cefrLevel: "A1",
    skill: "mixed",
    questionCount: 5,
  }), { type: "questions_unavailable" });
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, ["A1"]);
  assert.doesNotMatch(queries[0].sql, /skill = \$2/);
});

test("teacher exam create controller preserves defaults and response", async () => {
  const queries = [];
  const controller = createTeacherExamCreateController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.startsWith("SELECT id, question_text")) return { rows: [question(31, "mixed")] };
        if (sql.includes("INSERT INTO teacher_exams")) return { rows: [{ id: 72 }] };
        return { rows: [] };
      },
    },
    sanitizeText(value) {
      return value;
    },
    logAudit: undefined,
  });
  const response = createResponse();

  await controller.createExam({
    user: { id: 4 },
    body: {
      title: "Exam",
      description: "Description",
      cefr_level: "B1",
      skill: "invalid",
      question_count: "1",
      duration_minutes: "30",
      pass_percent: "invalid",
      max_attempts: "invalid",
      starts_at: "invalid",
      ends_at: "invalid",
    },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { success: true, id: 72, question_count: 1 });
  const insert = queries.find(({ sql }) => sql.includes("INSERT INTO teacher_exams"));
  assert.deepEqual(insert.params, [
    4, null, "Exam", "Description", "B1", "mixed", 1,
    30, 60, 1, null, null, "active",
  ]);
});

test("teacher exam create controller preserves validation and error responses", async () => {
  const controller = createTeacherExamCreateController({
    pool: { query: assert.fail },
    sanitizeText(value) { return value; },
    logAudit: assert.fail,
  });
  const invalidTitleResponse = createResponse();
  await controller.createExam({ user: { id: 4 }, body: { title: "x" } }, invalidTitleResponse);
  assert.equal(invalidTitleResponse.statusCode, 400);
  assert.deepEqual(invalidTitleResponse.body, { error: "Sarlavha 3–200 belgi bo'lishi kerak" });

  const missingClassController = createTeacherExamCreateController({
    pool: { async query() { return { rows: [] }; } },
    sanitizeText(value) { return value; },
    logAudit: assert.fail,
  });
  const missingClassResponse = createResponse();
  await missingClassController.createExam({
    user: { id: 4 },
    body: {
      class_id: 9,
      title: "Exam",
      cefr_level: "B1",
      skill: "mixed",
      question_count: 1,
      duration_minutes: 30,
    },
  }, missingClassResponse);
  assert.equal(missingClassResponse.statusCode, 404);
  assert.deepEqual(missingClassResponse.body, { error: "Sinf topilmadi" });

  const failingController = createTeacherExamCreateController({
    pool: { async query() { throw new Error("database unavailable"); } },
    sanitizeText(value) { return value; },
    logAudit: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await failingController.createExam({
      user: { id: 4 },
      body: {
        title: "Exam",
        cefr_level: "B1",
        skill: "mixed",
        question_count: 1,
        duration_minutes: 30,
      },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Imtihon yaratish xatosi:", "database unavailable"]]);
});

test("teacher exam create route preserves path and middleware order", () => {
  const router = teacherExamCreateRoutes({
    pool: { query: assert.fail },
    sanitizeText(value) { return value; },
    logAudit: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/teacher/exams");
  assert.equal(layer.route.methods.post, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack[1].handle, requireTeacher);
  assert.equal(layer.route.stack.length, 3);
});
