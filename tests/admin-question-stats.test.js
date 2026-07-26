const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminQuestionStatsController,
} = require("../src/controllers/adminQuestionStatsController");
const createAdminQuestionStatsRoutes = require("../src/routes/adminQuestionStatsRoutes");

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
  const controller = createAdminQuestionStatsController({
    pool: {
      async query(sql) {
        calls.push(["query", sql]);
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

test("admin question stats preserves SQL and empty-result response", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.getStats({}, response);

  assert.deepEqual(harness.calls, [
    ["query", "SELECT cefr_level, skill, status FROM questions"],
  ]);
  assert.deepEqual(response.body, {
    totalQuestions: 0,
    levels: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
    skills: {},
    status: { published: 0, draft: 0, needs_review: 0 },
    mostCommonLevel: "A1",
    leastCoveredLevel: "A1",
    mostCommonSkill: null,
  });
});

test("admin question stats preserves counting, fallbacks, and tie order", async () => {
  const harness = createHarness({
    rows: [
      { cefr_level: "A1", skill: "grammar", status: "published" },
      { cefr_level: "A1", skill: null, status: null },
      { cefr_level: "B2", skill: "reading", status: "draft" },
      { cefr_level: "unknown", skill: "reading", status: "needs_review" },
      { cefr_level: "C1", skill: "speaking", status: "unknown" },
    ],
  });
  const response = createResponse();

  await harness.controller.getStats({}, response);

  assert.deepEqual(response.body, {
    totalQuestions: 5,
    levels: { A1: 2, A2: 0, B1: 0, B2: 1, C1: 1, C2: 0 },
    skills: { grammar: 2, reading: 2, speaking: 1 },
    status: { published: 2, draft: 1, needs_review: 1 },
    mostCommonLevel: "A1",
    leastCoveredLevel: "A2",
    mostCommonSkill: "grammar",
  });
});

test("admin question stats preserves error logging and response", async () => {
  const harness = createHarness({ queryError: new Error("database failed") });
  const response = createResponse();

  await harness.controller.getStats({}, response);

  assert.deepEqual(harness.calls, [
    ["query", "SELECT cefr_level, skill, status FROM questions"],
    ["error", "Stats xatosi:", "database failed"],
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("admin question stats route preserves path, method, and middleware order", () => {
  const router = createAdminQuestionStatsRoutes({ pool: {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/questions/stats");
  assert.equal(route.methods.get, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
