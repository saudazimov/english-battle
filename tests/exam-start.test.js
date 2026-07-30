const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const { createExamStartService } = require("../src/services/examStartService");
const { createExamStartController } = require("../src/controllers/examStartController");
const examStartRoutes = require("../src/routes/examStartRoutes");

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

test("exam start preserves SQL order, UUID timing, and response", async () => {
  const questions = Array.from({ length: 10 }, (_, index) => ({
    id: String(index + 1),
    question_text: `Question ${index + 1}`,
  }));
  const poolQueries = [];
  const transactionQueries = [];
  const events = [];
  const responses = [
    { rows: [{ cefr_level: "A2" }] },
    { rows: questions },
  ];
  const client = {
    async query(sql, params) {
      transactionQueries.push({ sql, params });
      events.push(`client-query-${transactionQueries.length}`);
      return { rows: [] };
    },
    release() {
      events.push("release");
    },
  };
  const service = createExamStartService({
    pool: {
      async query(sql, params) {
        poolQueries.push({ sql, params });
        events.push(`query-${poolQueries.length}`);
        return responses.shift();
      },
      async connect() {
        events.push("connect");
        return client;
      },
    },
    randomUUID() {
      events.push("uuid");
      return "session-1";
    },
  });

  assert.deepEqual(await service.startExam(5), {
    status: "started",
    result: {
      session_id: "session-1",
      level: "A2",
      total: 10,
      questions,
    },
  });
  assert.deepEqual(events, [
    "query-1",
    "query-2",
    "uuid",
    "connect",
    "client-query-1",
    "client-query-2",
    "client-query-3",
    "client-query-4",
    "client-query-5",
    "release",
  ]);
  assert.deepEqual(poolQueries, [
    {
      sql: "SELECT cefr_level FROM users WHERE id = $1",
      params: [5],
    },
    {
      sql: `SELECT id, question_text, option_a, option_b, option_c, option_d, skill
       FROM questions WHERE cefr_level = $1 ORDER BY RANDOM() LIMIT 20`,
      params: ["A2"],
    },
  ]);
  assert.deepEqual(transactionQueries, [
    { sql: "BEGIN", params: undefined },
    {
      sql: "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      params: [5],
    },
    {
      sql: "UPDATE exam_sessions SET status='expired' WHERE user_id=$1 AND status='active'",
      params: [5],
    },
    {
      sql: `INSERT INTO exam_sessions (id, user_id, from_level, question_ids, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')`,
      params: ["session-1", 5, "A2", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    },
    { sql: "COMMIT", params: undefined },
  ]);
});

test("exam start preserves missing-user and insufficient-question early returns", async () => {
  const missingService = createExamStartService({
    pool: { async query() { return { rows: [] }; } },
    randomUUID: assert.fail,
  });
  assert.deepEqual(await missingService.startExam(5), { status: "user-not-found" });

  let calls = 0;
  const insufficientService = createExamStartService({
    pool: {
      async query() {
        calls += 1;
        return calls === 1 ? { rows: [{ cefr_level: "A2" }] } : { rows: [] };
      },
    },
    randomUUID: assert.fail,
  });
  assert.deepEqual(
    await insufficientService.startExam(5),
    { status: "insufficient-questions" }
  );
  assert.equal(calls, 2);
});

test("exam start rolls back and releases the client when session replacement fails", async () => {
  const questions = Array.from({ length: 10 }, (_, index) => ({ id: index + 1 }));
  const transactionQueries = [];
  let poolCalls = 0;
  let released = false;
  const service = createExamStartService({
    pool: {
      async query() {
        poolCalls += 1;
        return poolCalls === 1
          ? { rows: [{ cefr_level: "B1" }] }
          : { rows: questions };
      },
      async connect() {
        return {
          async query(sql) {
            transactionQueries.push(sql);
            if (sql.startsWith("INSERT INTO exam_sessions")) {
              throw new Error("insert failed");
            }
            return { rows: [] };
          },
          release() {
            released = true;
          },
        };
      },
    },
    randomUUID: () => "session-rollback",
  });

  await assert.rejects(() => service.startExam(9), /insert failed/);
  assert.deepEqual(transactionQueries, [
    "BEGIN",
    "SELECT id FROM users WHERE id=$1 FOR UPDATE",
    "UPDATE exam_sessions SET status='expired' WHERE user_id=$1 AND status='active'",
    `INSERT INTO exam_sessions (id, user_id, from_level, question_ids, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 minutes')`,
    "ROLLBACK",
  ]);
  assert.equal(released, true);
});

test("exam start controller enforces exact owner IDs and preserves error logging", async () => {
  const queriedIds = [];
  const missingController = createExamStartController({
    pool: {
      async query(_sql, params) {
        queriedIds.push(params[0]);
        return { rows: [] };
      },
    },
    randomUUID: assert.fail,
  });
  const missingResponse = createResponse();
  await missingController.startExam(
    { user: { id: 5 }, params: { userId: "5" } },
    missingResponse
  );
  assert.deepEqual(queriedIds, [5]);
  assert.equal(missingResponse.statusCode, 404);

  for (const userId of ["invalid", "5abc", "0", "01", "9007199254740993"]) {
    const invalidResponse = createResponse();
    await missingController.startExam(
      { user: { id: 5 }, params: { userId } },
      invalidResponse
    );
    assert.equal(invalidResponse.statusCode, 400);
    assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });
  }
  const forbiddenResponse = createResponse();
  await missingController.startExam(
    { user: { id: 5 }, params: { userId: "6" } },
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);
  assert.deepEqual(forbiddenResponse.body, { error: "Ruxsat yo'q" });
  assert.deepEqual(queriedIds, [5]);

  const errorController = createExamStartController({
    pool: { async query() { throw new Error("database unavailable"); } },
    randomUUID: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await errorController.startExam(
      { user: { id: 5 }, params: { userId: "5" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Imtihon start xatosi:", "database unavailable"]]);
});

test("exam start route preserves path and middleware order", () => {
  const router = examStartRoutes({
    pool: { query: assert.fail },
    randomUUID: assert.fail,
  });
  const layer = router.stack.find((entry) => entry.route);

  assert.equal(layer.route.path, "/exam/start/:userId");
  assert.equal(layer.route.methods.get, true);
  assert.equal(layer.route.stack[0].handle, authMiddleware);
  assert.equal(layer.route.stack.length, 2);
});
