const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createPracticeController,
} = require("../src/controllers/practiceController");
const { createPracticeRoutes } = require("../src/routes/practiceRoutes");

const VALID_SESSION_ID = "11111111-1111-4111-8111-111111111111";

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
  connectError,
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
        if (connectError) throw connectError;
        return client;
      },
    },
    crypto: {
      randomUUID() {
        calls.push(["uuid"]);
        return VALID_SESSION_ID;
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
    answerEventService: {
      async recordOneSafe() { return null; },
    },
  };
  return {
    calls,
    controller: createPracticeController(dependencies),
    dependencies,
  };
}

test("practice start atomically replaces active sessions and preserves response", async () => {
  const primary = [{ id: "1", question_text: "One" }];
  const extra = [{ id: "2", question_text: "Two" }];
  const harness = createHarness({
    poolResults: [{ rows: primary }, { rows: extra }],
  });
  const response = createResponse();

  await harness.controller.start(
    {
      user: { id: 7, cefr_level: "B1" },
      query: { level: "A1", count: "5" },
    },
    response
  );

  assert.deepEqual(harness.calls[0][2], ["A1", 5]);
  assert.deepEqual(harness.calls[1][2], ["A1", 4]);
  assert.deepEqual(harness.calls[2], ["uuid"]);
  assert.deepEqual(harness.calls.slice(3).map((call) => call[0]), [
    "connect",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "clientQuery",
    "release",
  ]);
  assert.equal(harness.calls[4][1], "BEGIN");
  assert.deepEqual(harness.calls[5][2], [7]);
  assert.match(harness.calls[5][1], /FROM users WHERE id=\$1 FOR UPDATE/);
  assert.deepEqual(harness.calls[6][2], [7]);
  assert.match(harness.calls[6][1], /WHERE user_id=\$1 AND status='active'/);
  assert.deepEqual(harness.calls[7][2], [
    VALID_SESSION_ID,
    7,
    "A1",
    [1, 2],
  ]);
  assert.equal(harness.calls[8][1], "COMMIT");
  assert.deepEqual(response.body, {
    session_id: VALID_SESSION_ID,
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

  assert.deepEqual(harness.calls[0][2], ["A2", 10]);
  assert.deepEqual(harness.calls[1][2], ["A2", 10]);
  assert.equal(harness.calls.some((call) => call[0] === "uuid"), false);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Hozircha savollar mavjud emas" });
});

test("practice start rejects malformed options before database access", async () => {
  const queries = [
    { level: "invalid", count: "10" },
    { level: ["A1", "A2"], count: "10" },
    { level: "A1", count: "10abc" },
    { level: "A1", count: "4" },
    { level: "A1", count: "31" },
    { level: "A1", count: ["10", "20"] },
  ];

  for (const query of queries) {
    const harness = createHarness();
    const response = createResponse();
    await harness.controller.start(
      { user: { id: 7, cefr_level: "A1" }, query },
      response
    );

    assert.deepEqual(harness.calls, []);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Noto'g'ri practice parametrlari" });
  }
});

test("practice start rolls back atomic session replacement failures", async () => {
  const questions = Array.from({ length: 5 }, (_, index) => ({ id: index + 1 }));
  const harness = createHarness({
    poolResults: [{ rows: questions }],
    clientErrorAt: 2,
  });
  const response = createResponse();

  await harness.controller.start(
    { user: { id: 7, cefr_level: "A1" }, query: { count: "5" } },
    response
  );

  assert.equal(response.statusCode, 500);
  assert.deepEqual(
    harness.calls.filter((call) => call[0] === "clientQuery").map((call) => call[1]),
    [
      "BEGIN",
      "SELECT id FROM users WHERE id=$1 FOR UPDATE",
      "UPDATE practice_sessions SET status='expired' WHERE user_id=$1 AND status='active'",
      "ROLLBACK",
    ]
  );
  assert.equal(harness.calls.some((call) => call[0] === "release"), true);
  assert.deepEqual(harness.calls.at(-1), [
    "error",
    "Practice start xatosi:",
    "client failed",
  ]);
});

test("practice answer rejects malformed payloads before connecting", async () => {
  const bodies = [
    undefined,
    { session_id: "", question_id: 4, answer: "A" },
    { session_id: "not-a-uuid", question_id: 4, answer: "A" },
    { session_id: VALID_SESSION_ID, question_id: "4abc", answer: "A" },
    { session_id: VALID_SESSION_ID, question_id: 4, answer: 1 },
  ];

  for (const body of bodies) {
    const harness = createHarness();
    const response = createResponse();
    await harness.controller.answer({ user: { id: 7 }, body }, response);

    assert.deepEqual(harness.calls, []);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Noto'g'ri javob ma'lumoti" });
  }
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
      body: { session_id: VALID_SESSION_ID, question_id: "4", answer: "b" },
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
  assert.deepEqual(harness.calls[2][2], [VALID_SESSION_ID, 7]);
  assert.deepEqual(harness.calls[3][2], [4]);
  assert.deepEqual(harness.calls[4][2], [4, 1, VALID_SESSION_ID, 7]);
  assert.match(
    harness.calls[4][1],
    /WHERE id = \$3 AND user_id = \$4 AND status='active'/
  );
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
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID, question_id: 4, answer: "A" } },
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
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID, question_id: 4, answer: "A" } },
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
            expires_at: "2999-01-01T00:00:00.000Z",
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
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID } },
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
  assert.deepEqual(harness.calls[2][2], [VALID_SESSION_ID, 7]);
  assert.deepEqual(harness.calls[3][2], [VALID_SESSION_ID, 7]);
  assert.match(harness.calls[3][1], /WHERE id=\$1 AND user_id=\$2 AND status='active'/);
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
            expires_at: "2999-01-01T00:00:00.000Z",
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
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Barcha savollarga javob bering" });
  assert.equal(harness.calls.at(-2)[1], "ROLLBACK");
  assert.equal(harness.calls.some((call) => call[0] === "quest"), false);
});

test("practice finish rejects expired sessions without awarding XP", async () => {
  const harness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [{
          status: "active",
          expires_at: "2000-01-01T00:00:00.000Z",
          question_ids: [1],
          answered_ids: [1],
          correct_count: 1,
        }],
      },
      { rows: [] },
      { rows: [] },
    ],
  });
  const response = createResponse();

  await harness.controller.finish(
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID } },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    error: "Practice sessiyasi muddati tugagan",
  });
  assert.deepEqual(harness.calls[3][2], [VALID_SESSION_ID, 7]);
  assert.equal(harness.calls[4][1], "COMMIT");
  assert.equal(harness.calls.some((call) => call[0] === "quest"), false);
});

test("practice finish rejects malformed session IDs before connecting", async () => {
  for (const body of [undefined, {}, { session_id: "not-a-uuid" }]) {
    const harness = createHarness();
    const response = createResponse();
    await harness.controller.finish({ user: { id: 7 }, body }, response);

    assert.deepEqual(harness.calls, []);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "Practice sessiyasi topilmadi" });
  }
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
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID, question_id: 4, answer: "A" } },
    answerResponse
  );
  assert.deepEqual(answerHarness.calls.at(-2), [
    "error",
    "Practice answer xatosi:",
    "client failed",
  ]);
  assert.deepEqual(answerHarness.calls.at(-1), ["release"]);

  const connectHarness = createHarness({ connectError: new Error("connect failed") });
  const connectResponse = createResponse();
  await connectHarness.controller.answer(
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID, question_id: 4, answer: "A" } },
    connectResponse
  );
  assert.equal(connectResponse.statusCode, 500);
  assert.deepEqual(connectHarness.calls, [
    ["connect"],
    ["error", "Practice answer xatosi:", "connect failed"],
  ]);

  const finishHarness = createHarness({
    clientResults: [
      { rows: [] },
      {
        rows: [
          {
            status: "active",
            expires_at: "2999-01-01T00:00:00.000Z",
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
    { user: { id: 7 }, body: { session_id: VALID_SESSION_ID } },
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
