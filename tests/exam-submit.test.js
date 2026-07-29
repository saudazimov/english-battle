const test = require("node:test");
const assert = require("node:assert/strict");
const { authMiddleware } = require("../auth");
const { createExamSubmitService } = require("../src/services/examSubmitService");
const { createExamSubmitController } = require("../src/controllers/examSubmitController");
const examSubmitRoutes = require("../src/routes/examSubmitRoutes");

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

function normalized(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createSuccessfulHarness({ lockedStatus = "active", transactionError } = {}) {
  const calls = [];
  const updatedUser = { id: 7, cefr_level: "A2", rating: 1200 };
  const poolResponses = [
    {
      rows: [{
        id: "session-1",
        from_level: "A1",
        question_ids: [1, 2],
        expires_at: new Date(Date.now() + 60_000),
      }],
    },
    { rows: [{ cefr_level: "A1" }] },
    { rows: [] },
    { rows: [{ battles: "10", total_correct: "70", total_questions: "100" }] },
    { rows: [
      { id: 1, correct_option: "A", skill: "grammar" },
      { id: 2, correct_option: "B", skill: "reading" },
    ] },
    { rows: [updatedUser] },
  ];
  let clientQueryCount = 0;
  const client = {
    async query(sql, params) {
      calls.push(["client-query", normalized(sql), params]);
      clientQueryCount += 1;
      if (clientQueryCount === 2) return { rows: [{ status: lockedStatus }] };
      if (transactionError && clientQueryCount === 3) throw transactionError;
      return { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const pool = {
    async query(sql, params) {
      calls.push(["pool-query", normalized(sql), params]);
      return poolResponses.shift();
    },
    async connect() {
      calls.push(["connect"]);
      return client;
    },
  };
  const service = createExamSubmitService({
    pool,
    getNextLevel(level) {
      calls.push(["next-level", level]);
      return "A2";
    },
  });
  return { service, calls, updatedUser };
}

test("exam submit preserves grading, SQL, transaction, and success response", async () => {
  const { service, calls, updatedUser } = createSuccessfulHarness();
  const result = await service.submitExam({
    userId: 7,
    sessionId: "session-1",
    answers: [
      { question_id: 1, answer: "a" },
      { question_id: 2, answer: "B" },
    ],
  });

  assert.deepEqual(result, {
    statusCode: 200,
    body: {
      passed: true,
      overall_percent: 100,
      total_correct: 2,
      total: 2,
      pass_overall_required: 75,
      pass_skill_required: 60,
      skill_results: {
        grammar: { correct: 1, total: 1, percent: 100 },
        reading: { correct: 1, total: 1, percent: 100 },
      },
      old_level: "A1",
      new_level: "A2",
      level_changed: true,
      updated_user: updatedUser,
    },
  });

  const poolQueries = calls.filter(([type]) => type === "pool-query");
  assert.match(poolQueries[0][1], /^SELECT \* FROM exam_sessions/);
  assert.deepEqual(poolQueries[0][2], ["session-1", 7]);
  assert.equal(poolQueries[1][1], "SELECT cefr_level FROM users WHERE id = $1");
  assert.match(poolQueries[2][1], /^SELECT taken_at, passed FROM exam_attempts/);
  assert.match(poolQueries[3][1], /^SELECT COUNT\(\*\) AS battles/);
  assert.equal(
    poolQueries[4][1],
    "SELECT id, correct_option, skill FROM questions WHERE id = ANY($1::int[])"
  );
  assert.deepEqual(poolQueries[4][2], [[1, 2]]);
  assert.match(poolQueries[5][1], /^SELECT id, first_name, last_name/);

  const transactionQueries = calls.filter(([type]) => type === "client-query");
  assert.equal(transactionQueries[0][1], "BEGIN");
  assert.match(transactionQueries[1][1], /^SELECT status FROM exam_sessions/);
  assert.deepEqual(transactionQueries[2], [
    "client-query",
    "UPDATE users SET cefr_level = $1 WHERE id = $2",
    ["A2", 7],
  ]);
  assert.match(transactionQueries[3][1], /^INSERT INTO exam_attempts/);
  assert.deepEqual(transactionQueries[3][2], [
    7,
    "A1",
    "A2",
    2,
    2,
    100,
    75,
    60,
    JSON.stringify({
      grammar: { correct: 1, total: 1, percent: 100 },
      reading: { correct: 1, total: 1, percent: 100 },
    }),
    true,
    true,
  ]);
  assert.equal(
    transactionQueries[4][1],
    "UPDATE exam_sessions SET status='submitted', submitted_at=NOW() WHERE id=$1"
  );
  assert.equal(transactionQueries[5][1], "COMMIT");
  assert.equal(calls.filter(([type]) => type === "release").length, 1);
});

test("exam submit preserves expired-session update and invalid-answer short circuits", async () => {
  const expiredCalls = [];
  const expiredService = createExamSubmitService({
    pool: {
      async query(sql, params) {
        expiredCalls.push([normalized(sql), params]);
        if (expiredCalls.length === 1) {
          return { rows: [{ expires_at: new Date(Date.now() - 60_000) }] };
        }
        return { rows: [] };
      },
      connect: assert.fail,
    },
    getNextLevel: assert.fail,
  });
  assert.deepEqual(await expiredService.submitExam({
    userId: 7,
    sessionId: "expired",
    answers: [],
  }), outcome(400, { error: "Imtihon vaqti tugagan" }));
  assert.deepEqual(expiredCalls[1], [
    "UPDATE exam_sessions SET status='expired' WHERE id=$1",
    ["expired"],
  ]);

  let invalidCalls = 0;
  const invalidService = createExamSubmitService({
    pool: {
      async query() {
        invalidCalls += 1;
        return {
          rows: [{
            expires_at: new Date(Date.now() + 60_000),
            question_ids: [1, 2],
          }],
        };
      },
      connect: assert.fail,
    },
    getNextLevel: assert.fail,
  });
  assert.deepEqual(await invalidService.submitExam({
    userId: 7,
    sessionId: "session-1",
    answers: [{ question_id: 1, answer: "A" }],
  }), outcome(400, { error: "Imtihon savollari sessiyaga mos emas" }));
  assert.equal(invalidCalls, 1);
});

function outcome(statusCode, body) {
  return { statusCode, body };
}

test("exam submit preserves cooldown response before stats and grading", async () => {
  let queryCount = 0;
  const service = createExamSubmitService({
    pool: {
      async query() {
        queryCount += 1;
        if (queryCount === 1) {
          return {
            rows: [{
              from_level: "A1",
              question_ids: [1],
              expires_at: new Date(Date.now() + 60_000),
            }],
          };
        }
        if (queryCount === 2) return { rows: [{ cefr_level: "A1" }] };
        return { rows: [{ taken_at: new Date(), passed: false }] };
      },
      connect: assert.fail,
    },
    getNextLevel() { return "A2"; },
  });

  const result = await service.submitExam({
    userId: 7,
    sessionId: "session-1",
    answers: [{ question_id: 1, answer: "A" }],
  });
  assert.equal(result.statusCode, 429);
  assert.equal(result.body.cooldown_hours_left, 24);
  assert.equal(result.body.error, "Keyingi imtihongacha 24 soat kuting.");
  assert.equal(queryCount, 3);
});

test("exam submit preserves locked-session rollback and release", async () => {
  const { service, calls } = createSuccessfulHarness({ lockedStatus: "submitted" });
  const result = await service.submitExam({
    userId: 7,
    sessionId: "session-1",
    answers: [
      { question_id: 1, answer: "A" },
      { question_id: 2, answer: "B" },
    ],
  });

  assert.deepEqual(result, outcome(400, {
    error: "Imtihon sessiyasi allaqachon yakunlangan",
  }));
  const transactionQueries = calls.filter(([type]) => type === "client-query");
  assert.deepEqual(transactionQueries.map((query) => query[1]), [
    "BEGIN",
    "SELECT status FROM exam_sessions WHERE id=$1 AND user_id=$2 FOR UPDATE",
    "ROLLBACK",
  ]);
  assert.equal(calls.filter(([type]) => type === "release").length, 1);
});

test("exam submit preserves transaction rollback and error propagation", async () => {
  const transactionError = new Error("transaction failed");
  const { service, calls } = createSuccessfulHarness({ transactionError });

  await assert.rejects(service.submitExam({
    userId: 7,
    sessionId: "session-1",
    answers: [
      { question_id: 1, answer: "A" },
      { question_id: 2, answer: "B" },
    ],
  }), transactionError);
  const transactionQueries = calls.filter(([type]) => type === "client-query");
  assert.equal(transactionQueries.at(-1)[1], "ROLLBACK");
  assert.equal(calls.filter(([type]) => type === "release").length, 1);
});

test("exam submit controller preserves validation and outer error response", async () => {
  const invalidController = createExamSubmitController({
    pool: { query: assert.fail, connect: assert.fail },
    getNextLevel: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.submitExam(
    { user: { id: 7 }, body: { session_id: null, answers: [] } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Javoblar yuborilmadi" });

  const errorController = createExamSubmitController({
    pool: {
      async query() { throw new Error("database unavailable"); },
      connect: assert.fail,
    },
    getNextLevel: assert.fail,
  });
  const errorResponse = createResponse();
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    await errorController.submitExam({
      user: { id: 7 },
      body: { session_id: "session-1", answers: [] },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Imtihon submit xatosi:", "database unavailable"]]);
});

test("exam submit route preserves path and authentication middleware order", () => {
  const router = examSubmitRoutes({ pool: {}, getNextLevel() {} });
  const route = router.stack[0].route;

  assert.equal(route.path, "/exam/submit");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, authMiddleware);
  assert.equal(route.stack.length, 2);
});
