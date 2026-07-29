const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const { createExamHistoryService } = require("../src/services/examHistoryService");
const { createExamHistoryController } = require("../src/controllers/examHistoryController");
const examHistoryRoutes = require("../src/routes/examHistoryRoutes");

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

test("exam history preserves SQL and response mapping", async () => {
  const queries = [];
  const takenAt = new Date("2026-07-28T12:00:00.000Z");
  const service = createExamHistoryService({
    pool: {
      async query(sql, params) {
        queries.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
        return {
          rows: [{
            id: 3,
            exam_type: "level-up",
            from_level: "A1",
            to_level: "A2",
            total_questions: 20,
            total_correct: 17,
            overall_percent: 85,
            pass_overall_required: 80,
            pass_skill_required: 60,
            skill_results: null,
            passed: true,
            level_changed: true,
            taken_at: takenAt,
            ignored: "value",
          }],
        };
      },
    },
  });

  assert.deepEqual(await service.listAttempts(7), [{
    id: 3,
    exam_type: "level-up",
    from_level: "A1",
    to_level: "A2",
    total_questions: 20,
    total_correct: 17,
    overall_percent: 85,
    pass_overall_required: 80,
    pass_skill_required: 60,
    skill_results: {},
    passed: true,
    level_changed: true,
    taken_at: takenAt,
  }]);
  assert.deepEqual(queries[0].params, [7]);
  assert.match(queries[0].sql, /FROM exam_attempts WHERE user_id = \$1 ORDER BY taken_at DESC LIMIT 50$/);
});

test("exam history controller preserves ID parsing and owner-only guards", async () => {
  let calls = 0;
  const controller = createExamHistoryController({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
  });

  const invalidResponse = createResponse();
  await controller.listAttempts(
    { params: { userId: "invalid" }, user: { id: 7 } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const forbiddenResponse = createResponse();
  await controller.listAttempts(
    { params: { userId: "7" }, user: { id: "7" } },
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.deepEqual(forbiddenResponse.body, { error: "Ruxsat yo'q" });

  const successResponse = createResponse();
  await controller.listAttempts(
    { params: { userId: "7abc" }, user: { id: 7 } },
    successResponse
  );
  assert.deepEqual(successResponse.body, { attempts: [] });
  assert.equal(calls, 1);
});

test("exam history controller preserves error logging and response", async () => {
  const controller = createExamHistoryController({
    pool: { async query() { throw new Error("database unavailable"); } },
  });
  const response = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await controller.listAttempts(
      { params: { userId: "7" }, user: { id: 7 } },
      response
    );
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihon tarixi xatosi:", "database unavailable"]]);
});

test("exam history route preserves path and middleware order", () => {
  const router = examHistoryRoutes({ pool: { query: assert.fail } });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/exam/history/:userId");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
