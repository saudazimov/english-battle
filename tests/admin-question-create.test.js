const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminQuestionCreateController,
} = require("../src/controllers/adminQuestionCreateController");
const createAdminQuestionCreateRoutes = require("../src/routes/adminQuestionCreateRoutes");

const validBody = {
  question_text: "Question?",
  option_a: "A",
  option_b: "B",
  option_c: "C",
  option_d: "D",
  correct_option: "A",
};

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

function createHarness({ queryError, auditError } = {}) {
  const calls = [];
  const controller = createAdminQuestionCreateController({
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return { rows: [{ id: 42 }] };
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
      if (auditError) throw auditError;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

test("admin question create preserves required-field and answer validation", async () => {
  const missingHarness = createHarness();
  const missingResponse = createResponse();
  const missingResult = await missingHarness.controller.create(
    { body: { ...validBody, option_d: "" } },
    missingResponse
  );

  assert.equal(missingResult, missingResponse);
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Barcha maydonlarni to'ldiring" });
  assert.deepEqual(missingHarness.calls, []);

  const answerHarness = createHarness();
  const answerResponse = createResponse();
  const answerResult = await answerHarness.controller.create(
    { body: { ...validBody, correct_option: "E" } },
    answerResponse
  );

  assert.equal(answerResult, answerResponse);
  assert.equal(answerResponse.statusCode, 400);
  assert.deepEqual(answerResponse.body, {
    error: "To'g'ri javob A, B, C yoki D bo'lishi kerak",
  });
  assert.deepEqual(answerHarness.calls, []);
});

test("admin question create preserves defaults, SQL, audit, and response order", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = { body: { ...validBody } };

  await harness.controller.create(request, response);

  assert.deepEqual(harness.calls, [
    [
      "query",
      "INSERT INTO questions (question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, difficulty, explanation, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'easy', $9, $10) RETURNING id",
      ["Question?", "A", "B", "C", "D", "A", "A1", "grammar", "", "published"],
    ],
    [
      "audit",
      request,
      "question_created",
      { entityType: "question", entityId: 42, details: "A1 · grammar" },
    ],
  ]);
  assert.deepEqual(response.body, { message: "Savol qo'shildi!", id: 42 });
});

test("admin question create preserves custom values and invalid-status fallback", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = {
    body: {
      ...validBody,
      cefr_level: "B2",
      skill: "reading",
      explanation: "Because",
      status: "invalid",
    },
  };

  await harness.controller.create(request, response);

  assert.deepEqual(harness.calls[0][2].slice(6), [
    "B2",
    "reading",
    "Because",
    "published",
  ]);
  assert.deepEqual(harness.calls[1][3], {
    entityType: "question",
    entityId: 42,
    details: "B2 · reading",
  });
});

test("admin question create preserves database-error log and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.create({ body: validBody }, response);

  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Savol qo'shish xatosi:",
    "database failed",
  ]);
  assert.equal(harness.calls.some((call) => call[0] === "audit"), false);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question create preserves audit-error log and response after insert", async () => {
  const harness = createHarness({ auditError: new Error("audit failed") });
  const response = createResponse();

  await harness.controller.create({ body: validBody }, response);

  assert.deepEqual(harness.calls.map((call) => call[0]), ["query", "audit", "error"]);
  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Savol qo'shish xatosi:",
    "audit failed",
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question create route preserves path, method, and middleware order", () => {
  const router = createAdminQuestionCreateRoutes({ pool: {}, logAudit() {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/questions/add");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
