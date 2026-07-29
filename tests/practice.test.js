const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createPracticeController,
} = require("../src/controllers/practiceController");
const { createPracticeRoutes } = require("../src/routes/practiceRoutes");

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

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

function createHarness({
  poolResults = [],
  clientResults = [],
  poolError,
  clientErrorAt = -1,
  questError,
} = {}) {
  const calls = [];
  let poolIndex = 0;
  let clientIndex = 0;
  const client = {
    async query(sql, params) {
      const currentIndex = clientIndex++;
      calls.push(["clientQuery", normalizeSql(sql), params]);
      if (currentIndex === clientErrorAt) throw new Error("client failed");
      return clientResults[currentIndex] || { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const dependencies = {
    pool: {
      async query(sql, params) {
        calls.push(["poolQuery", normalizeSql(sql), params]);
        if (poolError) throw poolError;
        return poolResults[poolIndex++] || { rows: [] };
      },
      async connect() {
        calls.push(["connect"]);
        return client;
      },
    },
    crypto: {
      randomUUID() {
        calls.push(["uuid"]);
        return "practice-session-1";
      },
    },
    async updateQuestProgress(userId, progress) {
      calls.push(["quest", userId, progress]);
      if (questError) throw questError;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  };
  return {
    calls,
    controller: createPracticeController(dependencies),
    dependencies,
  };
}

test("practice start preserves level/count fallback, extra query, and session insert", async () => {
  const primary = [{ id: "1", question_text: "One" }];
  const extra = [{ id: "2", question_text: "Two" }];
  const harness = createHarness({
    poolResults: [{ rows: primary }, { rows: extra }, { rows: [] }],
  });
  const response = createResponse();

  await harness.controller.start(
    {
      user: { id: 7, cefr_level: "B1" },
      query: { level: "invalid", count: "3" },
    },
    response
  );

  assert.deepEqual(harness.calls[0][2], ["A1", 5]);
  assert.deepEqual(harness.calls[1][2], ["A1", 4]);
  assert.deepEqual(harness.calls[2], ["uuid"]);
  assert.deepEqual(harness.calls[3][2], [
    "practice-session-1",
    7,
    "A1",
    [1, 2],
  ]);
  assert.deepEqual(response.body, {
    session_id: "practice-session-1",
    level: "A1",
    total: 2,
    questions: [...primary, ...extra],
  });
});

test("practice start preserves no-question response before UUID and insert", async () => {
  const harness = createHarness({
    poolResults: [{ rows: [] }, { rows: [] }],
  });
  const response = createResponse();

  await harness.controller.start(
    { user: { id: 7, cefr_level: "A2" }, query: {} },
    response
  );

  assert.equal(harness.calls.some((call) => call[0] === "uuid"), false);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Hozircha savollar mavjud emas" });
});

test("practice answer connects before validation and always releases", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.answer(
    { user: { id: 7 }, body: { session_id: "", question_id: 4, answer: "A" } },
    response
  );

  assert.deepEqual(harness.calls, [["connect"], ["release"]]);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri javob ma'lumoti" });
});

test("practice answer preserves transaction, grading, and response", async () => {
  const harness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            expires_at: "2999-01-01T00:00:00.000Z",
            question_ids: [4, 5],
            answered_ids: [],
          },
        ],
      },
      { rows: [{ correct_option: "B", explanation: "Because" }] },
      { rows: [{ correct_count: 1, answered_count: 1 }] },
      { rows: [] },
    ],
  });
  const response = createResponse();

  await harness.controller.answer(
    {
      user: { id: 7 },
      body: { session_id: "session-1", question_id: "4", answer: "b" },
    },
    response
  );

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "connect",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "release",
  ]);
  assert.equal(harness.calls[1][1], "BEGIN");
  assert.deepEqual(harness.calls[2][2], ["session-1", 7]);
  assert.deepEqual(harness.calls[3][2], [4]);
  assert.deepEqual(harness.calls[4][2], [4, 1, "session-1"]);
  assert.equal(harness.calls[5][1], "COMMIT");
  assert.deepEqual(response.body, {
    is_correct: true,
    correct_option: "B",
    explanation: "Because",
    correct_count: 1,
    answered_count: 1,
    total: 2,
  });
});

test("practice answer preserves expired and duplicate responses", async () => {
  const expiredHarness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            expires_at: "2000-01-01T00:00:00.000Z",
            question_ids: [4],
            answered_ids: [],
          },
        ],
      },
      { rows: [] },
      { rows: [] },
    ],
  });
  const expiredResponse = createResponse();
  await expiredHarness.controller.answer(
    { user: { id: 7 }, body: { session_id: "s", question_id: 4, answer: "A" } },
    expiredResponse
  );
  assert.equal(expiredResponse.statusCode, 400);
  assert.deepEqual(expiredResponse.body, {
    error: "Practice sessiyasi muddati tugagan",
  });
  assert.equal(expiredHarness.calls.at(-2)[1], "COMMIT");

  const duplicateHarness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            expires_at: "2999-01-01T00:00:00.000Z",
            question_ids: [4],
            answered_ids: [4],
          },
        ],
      },
      { rows: [] },
    ],
  });
  const duplicateResponse = createResponse();
  await duplicateHarness.controller.answer(
    { user: { id: 7 }, body: { session_id: "s", question_id: 4, answer: "A" } },
    duplicateResponse
  );
  assert.equal(duplicateResponse.statusCode, 409);
  assert.deepEqual(duplicateResponse.body, {
    error: "Bu savolga allaqachon javob berilgan",
  });
  assert.equal(duplicateHarness.calls.at(-2)[1], "ROLLBACK");
});

test("practice finish preserves transaction, XP, quest progress, and response", async () => {
  const user = { id: 7, xp: 120, cefr_level: "A1", rating: 1000 };
  const harness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            question_ids: [1, 2],
            answered_ids: [1, 2],
            correct_count: "2",
          },
        ],
      },
      { rows: [] },
      { rows: [user] },
      { rows: [] },
    ],
  });
  const response = createResponse();

  await harness.controller.finish(
    { user: { id: 7 }, body: { session_id: "session-1" } },
    response
  );

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "connect",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "quest",
    "release",
  ]);
  assert.equal(harness.calls[1][1], "BEGIN");
  assert.deepEqual(harness.calls[2][2], ["session-1", 7]);
  assert.deepEqual(harness.calls[3][2], ["session-1"]);
  assert.deepEqual(harness.calls[4][2], [4, 7]);
  assert.equal(harness.calls[5][1], "COMMIT");
  assert.deepEqual(harness.calls[6], [
    "quest",
    7,
    { won: false, correctAnswers: 2, xpEarned: 4 },
  ]);
  assert.deepEqual(response.body, {
    xp_earned: 4,
    correct: 2,
    total: 2,
    updated_user: user,
  });
});

test("practice finish preserves incomplete-session rollback", async () => {
  const harness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            question_ids: [1, 2],
            answered_ids: [1],
            correct_count: 1,
          },
        ],
      },
      { rows: [] },
    ],
  });
  const response = createResponse();

  await harness.controller.finish(
    { user: { id: 7 }, body: { session_id: "session-1" } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Barcha savollarga javob bering" });
  assert.equal(harness.calls.at(-2)[1], "ROLLBACK");
  assert.equal(harness.calls.some((call) => call[0] === "quest"), false);
});

test("practice handlers preserve rollback, error logs, and 500 responses", async () => {
  const startHarness = createHarness({ poolError: new Error("pool failed") });
  const startResponse = createResponse();
  await startHarness.controller.start(
    { user: { id: 7, cefr_level: "A1" }, query: {} },
    startResponse
  );
  assert.deepEqual(startHarness.calls.at(-1), [
    "error",
    "Practice start xatosi:",
    "pool failed",
  ]);

  const answerHarness = createHarness({ clientErrorAt: 1 });
  const answerResponse = createResponse();
  await answerHarness.controller.answer(
    { user: { id: 7 }, body: { session_id: "s", question_id: 4, answer: "A" } },
    answerResponse
  );
  assert.deepEqual(answerHarness.calls.at(-2), [
    "error",
    "Practice answer xatosi:",
    "client failed",
  ]);
  assert.deepEqual(answerHarness.calls.at(-1), ["release"]);

  const finishHarness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            question_ids: [1],
            answered_ids: [1],
            correct_count: 1,
          },
        ],
      },
      { rows: [] },
      { rows: [{ id: 7 }] },
      { rows: [] },
      { rows: [] },
    ],
    questError: new Error("quest failed"),
  });
  const finishResponse = createResponse();
  await finishHarness.controller.finish(
    { user: { id: 7 }, body: { session_id: "s" } },
    finishResponse
  );
  assert.equal(finishHarness.calls.at(-4)[0], "quest");
  assert.equal(finishHarness.calls.at(-3)[1], "ROLLBACK");
  assert.deepEqual(finishHarness.calls.at(-2), [
    "error",
    "Practice finish xatosi:",
    "quest failed",
  ]);
  assert.deepEqual(finishHarness.calls.at(-1), ["release"]);
  assert.equal(finishResponse.statusCode, 500);
});

test("practice routers preserve separated route and middleware order", () => {
  const harness = createHarness();
  const routes = createPracticeRoutes(harness.dependencies);
  const finishLimiter = function practiceFinishLimiter() {};
  const finishRouter = routes.createFinishRouter(finishLimiter);

  assert.equal(routes.sessionRouter.stack.length, 2);
  const startRoute = routes.sessionRouter.stack[0].route;
  assert.equal(startRoute.path, "/practice/start");
  assert.equal(startRoute.methods.get, true);
  assert.equal(startRoute.stack[0].handle, authMiddleware);
  const answerRoute = routes.sessionRouter.stack[1].route;
  assert.equal(answerRoute.path, "/practice/answer");
  assert.equal(answerRoute.methods.post, true);
  assert.equal(answerRoute.stack[0].handle, authMiddleware);

  assert.equal(finishRouter.stack.length, 1);
  const finishRoute = finishRouter.stack[0].route;
  assert.equal(finishRoute.path, "/practice/finish");
  assert.equal(finishRoute.methods.post, true);
  assert.equal(finishRoute.stack.length, 3);
  assert.equal(finishRoute.stack[0].handle, authMiddleware);
  assert.equal(finishRoute.stack[1].handle, finishLimiter);
});
