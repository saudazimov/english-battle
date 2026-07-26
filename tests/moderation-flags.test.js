const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireAdmin } = require("../auth");
const {
  createModerationFlagController,
} = require("../src/controllers/moderationFlagController");
const createModerationFlagRoutes = require("../src/routes/moderationFlagRoutes");

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

function createHarness({ queryResults = [], queryError } = {}) {
  const calls = [];
  let queryIndex = 0;
  const dependencies = {
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return queryResults[queryIndex++] || { rows: [] };
      },
    },
    async logAudit(req, action, options) {
      calls.push(["audit", req, action, options]);
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  };
  return {
    calls,
    controller: createModerationFlagController(dependencies),
    dependencies,
  };
}

test("flag report preserves validation responses before database access", async () => {
  const cases = [
    [{}, { error: "Ma'lumot yetishmaydi" }],
    [
      { entity_type: "battle", entity_id: 5, reason: "spam" },
      { error: "Noto'g'ri tur" },
    ],
    [
      { entity_type: "question", entity_id: 5, reason: "invalid" },
      { error: "Noto'g'ri sabab" },
    ],
    [
      { entity_type: "user", entity_id: "7", reason: "spam" },
      { error: "O'zingizga shikoyat qila olmaysiz" },
    ],
  ];

  for (const [body, expectedBody] of cases) {
    const harness = createHarness();
    const response = createResponse();
    await harness.controller.report({ user: { id: 7 }, body }, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, expectedBody);
    assert.deepEqual(harness.calls, []);
  }
});

test("flag report preserves duplicate detection", async () => {
  const harness = createHarness({ queryResults: [{ rows: [{ id: 1 }] }] });
  const response = createResponse();

  await harness.controller.report(
    {
      user: { id: 7 },
      body: { entity_type: "question", entity_id: "42", reason: "incorrect" },
    },
    response
  );

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.calls[0][2], [7, "question", 42]);
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.body, {
    error: "Siz bu haqda allaqachon shikoyat qilgansiz",
  });
});

test("flag report preserves trimming, SQL, and success response", async () => {
  const harness = createHarness({
    queryResults: [{ rows: [] }, { rows: [] }],
  });
  const response = createResponse();

  await harness.controller.report(
    {
      user: { id: 7 },
      body: {
        entity_type: "question",
        entity_id: "42abc",
        reason: "incorrect",
        comment: "  Wrong answer  ",
        context_room_id: "  room-5  ",
      },
    },
    response
  );

  assert.deepEqual(harness.calls[0], [
    "query",
    "SELECT id FROM flags WHERE reporter_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'pending'",
    [7, "question", 42],
  ]);
  assert.deepEqual(harness.calls[1], [
    "query",
    "INSERT INTO flags (reporter_id, entity_type, entity_id, reason, comment, context_room_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [7, "question", 42, "incorrect", "Wrong answer", "room-5"],
  ]);
  assert.deepEqual(response.body, { message: "Shikoyat yuborildi. Rahmat!" });
});

test("admin flag list preserves filtering, pagination SQL, and response", async () => {
  const flags = [{ id: 1, status: "resolved" }];
  const harness = createHarness({
    queryResults: [{ rows: [{ total: "7" }] }, { rows: flags }],
  });
  const response = createResponse();

  await harness.controller.list(
    { query: { page: "2", limit: "3", status: "resolved" } },
    response
  );

  assert.deepEqual(harness.calls[0], [
    "query",
    "SELECT COUNT(*) AS total FROM flags f WHERE f.status = $1",
    ["resolved"],
  ]);
  assert.equal(
    harness.calls[1][1].endsWith(
      "WHERE f.status = $1 ORDER BY f.created_at DESC LIMIT $2 OFFSET $3"
    ),
    true
  );
  assert.deepEqual(harness.calls[1][2], ["resolved", 3, 3]);
  assert.deepEqual(response.body, {
    flags,
    pagination: { page: 2, limit: 3, total: 7, totalPages: 3 },
  });
});

test("admin flag list preserves all-status defaults and limit cap", async () => {
  const harness = createHarness({
    queryResults: [{ rows: [{ total: "0" }] }, { rows: [] }],
  });
  const response = createResponse();

  await harness.controller.list(
    { query: { page: "invalid", limit: "100", status: "all" } },
    response
  );

  assert.deepEqual(harness.calls[0], [
    "query",
    "SELECT COUNT(*) AS total FROM flags f",
    [],
  ]);
  assert.deepEqual(harness.calls[1][2], [50, 0]);
  assert.deepEqual(response.body.pagination, {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
});

test("admin flag resolve preserves update, audit, and response", async () => {
  const row = { entity_type: "user", entity_id: 42 };
  const harness = createHarness({ queryResults: [{ rows: [row] }] });
  const response = createResponse();
  const request = {
    admin: { name: "Moderator" },
    body: { id: 5, action: "resolve" },
  };

  await harness.controller.resolve(request, response);

  assert.deepEqual(harness.calls[0], [
    "query",
    "UPDATE flags SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 RETURNING entity_type, entity_id",
    ["resolved", "Moderator", 5],
  ]);
  assert.deepEqual(harness.calls[1], [
    "audit",
    request,
    "flag_resolved",
    {
      entityType: "user",
      entityId: 42,
      details: "Shikoyat tasdiqlandi",
    },
  ]);
  assert.deepEqual(response.body, { message: "Shikoyat hal qilindi" });
});

test("admin flag resolve preserves dismissed fallback and not-found response", async () => {
  const dismissHarness = createHarness({
    queryResults: [{ rows: [{ entity_type: "question", entity_id: 8 }] }],
  });
  const dismissResponse = createResponse();
  await dismissHarness.controller.resolve(
    { body: { id: 6, action: "anything" } },
    dismissResponse
  );
  assert.deepEqual(dismissHarness.calls[0][2], ["dismissed", "Admin", 6]);
  assert.deepEqual(dismissResponse.body, { message: "Shikoyat rad etildi" });

  const missingHarness = createHarness({ queryResults: [{ rows: [] }] });
  const missingResponse = createResponse();
  await missingHarness.controller.resolve(
    { body: { id: 9, action: "resolve" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Shikoyat topilmadi" });
  assert.equal(missingHarness.calls.some((call) => call[0] === "audit"), false);
});

test("moderation flag handlers preserve their error logs", async () => {
  const cases = [
    [
      "report",
      "Shikoyat xatosi:",
      { user: { id: 7 }, body: { entity_type: "question", entity_id: 1, reason: "spam" } },
    ],
    ["list", "Flags ro'yxat xatosi:", { query: {} }],
    [
      "resolve",
      "Flag resolve xatosi:",
      { admin: {}, body: { id: 1, action: "resolve" } },
    ],
  ];

  for (const [method, logMessage, request] of cases) {
    const harness = createHarness({ queryError: new Error("database failed") });
    const response = createResponse();
    await harness.controller[method](request, response);
    assert.deepEqual(harness.calls.at(-1), [
      "error",
      logMessage,
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("moderation flag routes preserve paths, methods, and middleware order", () => {
  const harness = createHarness();
  const router = createModerationFlagRoutes(harness.dependencies);
  const expected = [
    ["/flags/report", "post", authMiddleware],
    ["/admin/flags", "get", requireAdmin],
    ["/admin/flags/resolve", "post", requireAdmin],
  ];

  assert.equal(router.stack.length, expected.length);
  expected.forEach(([path, method, middleware], index) => {
    const route = router.stack[index].route;
    assert.equal(route.path, path);
    assert.equal(route.methods[method], true);
    assert.equal(route.stack.length, 2);
    assert.equal(route.stack[0].handle, middleware);
  });
});
