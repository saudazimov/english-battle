const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminQuestionHealthController,
} = require("../src/controllers/adminQuestionHealthController");
const createAdminQuestionHealthRoutes = require("../src/routes/adminQuestionHealthRoutes");

const expectedSql =
  "SELECT id, question_text, option_a, option_b, option_c, option_d, correct_option, cefr_level, skill, status FROM questions";

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

function createHarness({ rows = [], queryError } = {}) {
  const calls = [];
  const controller = createAdminQuestionHealthController({
    pool: {
      async query(sql) {
        calls.push(["query", normalizeSql(sql)]);
        if (queryError) throw queryError;
        return { rows };
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

function question(overrides = {}) {
  return {
    id: 1,
    question_text: "Question text",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
    cefr_level: "A1",
    skill: "grammar",
    status: "published",
    ...overrides,
  };
}

test("admin question health preserves SQL and empty-result response", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.getHealth({}, response);

  assert.deepEqual(harness.calls, [["query", expectedSql]]);
  assert.deepEqual(response.body, {
    totalQuestions: 0,
    validQuestions: 0,
    validationScore: 0,
    missingFields: 0,
    invalidAnswerKey: 0,
    duplicateRisk: 0,
    needsReview: 0,
    published: 0,
    draft: 0,
  });
});

test("admin question health preserves validation, duplicate, and status calculations", async () => {
  const harness = createHarness({
    rows: [
      question({ id: 1, question_text: " Hello World " }),
      question({ id: 2, question_text: "hello   world", status: "draft" }),
      question({
        id: 3,
        question_text: "Incomplete",
        option_a: "",
        correct_option: "Z",
        status: "needs_review",
      }),
      question({ id: 4, question_text: "Unknown status", status: "unknown" }),
      question({ id: 5, question_text: "Fallback status", status: null }),
    ],
  });
  const response = createResponse();

  await harness.controller.getHealth({}, response);

  assert.deepEqual(response.body, {
    totalQuestions: 5,
    validQuestions: 3,
    validationScore: 60,
    missingFields: 1,
    invalidAnswerKey: 1,
    duplicateRisk: 1,
    needsReview: 1,
    published: 2,
    draft: 1,
  });
});

test("admin question health preserves one-decimal score rounding", async () => {
  const harness = createHarness({
    rows: [
      question({ id: 1 }),
      question({ id: 2, option_b: "" }),
      question({ id: 3, correct_option: "Z" }),
    ],
  });
  const response = createResponse();

  await harness.controller.getHealth({}, response);

  assert.equal(response.body.validQuestions, 1);
  assert.equal(response.body.validationScore, 33.3);
});

test("admin question health preserves error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.getHealth({}, response);

  assert.deepEqual(harness.calls, [
    ["query", expectedSql],
    ["error", "Health xatosi:", "database failed"],
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question health route preserves path, method, and middleware order", () => {
  const router = createAdminQuestionHealthRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/questions/health");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
