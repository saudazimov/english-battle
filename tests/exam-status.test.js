const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const { createExamStatusService } = require("../src/services/examStatusService");
const { createExamStatusController } = require("../src/controllers/examStatusController");
const examStatusRoutes = require("../src/routes/examStatusRoutes");

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

test("exam status preserves SQL, helper call, and eligibility calculation", async () => {
  const queries = [];
  const levels = [];
  const service = createExamStatusService({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1
          ? { rows: [{ cefr_level: "A2" }] }
          : { rows: [{ battles: "10", total_correct: "35", total_questions: "50" }] };
      },
    },
    getNextLevel(level) {
      levels.push(level);
      return "B1";
    },
  });

  assert.deepEqual(await service.getStatus(5), {
    eligible: true,
    current_level: "A2",
    next_level: "B1",
    progress: {
      battles: 10,
      battles_required: 10,
      accuracy: 70,
      accuracy_required: 70,
    },
  });
  assert.deepEqual(levels, ["A2"]);
  assert.deepEqual(queries, [
    {
      sql: "SELECT cefr_level FROM users WHERE id = $1",
      params: [5],
    },
    {
      sql: `SELECT
         COUNT(*) AS battles,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(total_questions), 0) AS total_questions
       FROM battle_history
       WHERE user_id = $1 AND cefr_level = $2 AND mode IN ('ranked','casual')`,
      params: [5, "A2"],
    },
  ]);
});

test("exam status preserves missing-user and highest-level early returns", async () => {
  const missingService = createExamStatusService({
    pool: { async query() { return { rows: [] }; } },
    getNextLevel: assert.fail,
  });
  assert.equal(await missingService.getStatus(5), null);

  let calls = 0;
  const highestService = createExamStatusService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [{ cefr_level: "C2" }] };
      },
    },
    getNextLevel() { return null; },
  });
  assert.deepEqual(await highestService.getStatus(5), {
    eligible: false,
    current_level: "C2",
    next_level: null,
    reason: "Siz eng yuqori darajadasiz!",
  });
  assert.equal(calls, 1);
});

test("exam status controller enforces exact owner IDs and preserves error logging", async () => {
  const queriedIds = [];
  const controller = createExamStatusController({
    pool: {
      async query(_sql, params) {
        queriedIds.push(params[0]);
        return { rows: [] };
      },
    },
    getNextLevel: assert.fail,
  });
  const missingResponse = createResponse();
  await controller.getStatus(
    { user: { id: 5 }, params: { userId: "5" } },
    missingResponse
  );
  assert.deepEqual(queriedIds, [5]);
  assert.equal(missingResponse.statusCode, 404);

  for (const userId of ["invalid", "5abc", "0", "01", "9007199254740993"]) {
    const invalidResponse = createResponse();
    await controller.getStatus(
      { user: { id: 5 }, params: { userId } },
      invalidResponse
    );
    assert.equal(invalidResponse.statusCode, 400);
    assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });
  }
  const forbiddenResponse = createResponse();
  await controller.getStatus(
    { user: { id: 5 }, params: { userId: "6" } },
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.deepEqual(forbiddenResponse.body, { error: "Ruxsat yo'q" });
  assert.deepEqual(queriedIds, [5]);

  const errorController = createExamStatusController({
    pool: { async query() { throw new Error("database unavailable"); } },
    getNextLevel: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.getStatus(
      { user: { id: 5 }, params: { userId: "5" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihon status xatosi:", "database unavailable"]]);
});

test("exam status route preserves path and middleware order", () => {
  const router = examStatusRoutes({
    pool: { query: assert.fail },
    getNextLevel: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/exam/status/:userId");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
