const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware, requireStudent } = require("../auth");
const {
  createStudentParentConnectionController,
} = require("../src/controllers/studentParentConnectionController");
const createStudentParentConnectionRoutes = require("../src/routes/studentParentConnectionRoutes");

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
  queryResults = [],
  queryError,
  freshCode = {
    rawCode: "PARENT88",
    created_at: "2026-07-27T10:00:00Z",
    expires_at: "2026-07-29T10:00:00Z",
  },
  assignError,
} = {}) {
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
    async assignNewParentCode(studentId) {
      calls.push(["assignCode", studentId]);
      if (assignError) throw assignError;
      return freshCode;
    },
    maskParentPhone(phone) {
      calls.push(["maskPhone", phone]);
      return "masked:" + phone;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  };
  return {
    calls,
    controller: createStudentParentConnectionController(dependencies),
    dependencies,
    freshCode,
  };
}

test("student parent code status preserves active-code hidden response", async () => {
  const row = {
    parent_connect_code_hash: "hash",
    parent_connect_code_created_at: "2026-07-27T10:00:00Z",
    parent_connect_code_expires_at: "2999-07-29T10:00:00Z",
  };
  const harness = createHarness({ queryResults: [{ rows: [row] }] });
  const response = createResponse();

  await harness.controller.getCodeStatus({ user: { id: 7 } }, response);

  assert.deepEqual(harness.calls, [
    [
      "query",
      "SELECT parent_connect_code_hash, parent_connect_code_created_at, parent_connect_code_expires_at FROM users WHERE id = $1",
      [7],
    ],
  ]);
  assert.deepEqual(response.body, {
    has_active_code: true,
    code: null,
    created_at: row.parent_connect_code_created_at,
    expires_at: row.parent_connect_code_expires_at,
    message:
      "Amaldagi kod bor. Kodni qayta ko'rish mumkin emas — kerak bo'lsa yangi kod yarating.",
  });
});

test("student parent code status preserves automatic fresh-code assignment", async () => {
  const harness = createHarness({
    queryResults: [
      {
        rows: [
          {
            parent_connect_code_hash: "old-hash",
            parent_connect_code_expires_at: "2000-01-01T00:00:00Z",
          },
        ],
      },
    ],
  });
  const response = createResponse();

  await harness.controller.getCodeStatus({ user: { id: 7 } }, response);

  assert.deepEqual(harness.calls.at(-1), ["assignCode", 7]);
  assert.deepEqual(response.body, {
    has_active_code: true,
    code: harness.freshCode.rawCode,
    created_at: harness.freshCode.created_at,
    expires_at: harness.freshCode.expires_at,
    message: "Kodni saqlab oling — qayta ko'rsatilmaydi.",
  });
});

test("student parent code regeneration preserves one-time code response", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.regenerateCode({ user: { id: 9 } }, response);

  assert.deepEqual(harness.calls, [["assignCode", 9]]);
  assert.deepEqual(response.body, {
    success: true,
    code: harness.freshCode.rawCode,
    expires_at: harness.freshCode.expires_at,
    message: "Yangi kod yaratildi. Saqlab oling — qayta ko'rsatilmaydi.",
  });
});

test("student parent list preserves SQL, fallbacks, and phone masking", async () => {
  const linkedAt = "2026-07-27T12:00:00Z";
  const harness = createHarness({
    queryResults: [
      {
        rows: [
          {
            parent_id: 11,
            relationship: "father",
            linked_at: linkedAt,
            first_name: "Ali",
            last_name: "Valiyev",
            phone: "+998901234567",
          },
          {
            parent_id: 12,
            relationship: null,
            linked_at: linkedAt,
            first_name: null,
            last_name: null,
            phone: "+998909876543",
          },
        ],
      },
    ],
  });
  const response = createResponse();

  await harness.controller.listParents({ user: { id: 7 } }, response);

  assert.equal(harness.calls[0][1].includes("FROM parent_links pl"), true);
  assert.deepEqual(harness.calls[0][2], [7]);
  assert.deepEqual(harness.calls.slice(1), [
    ["maskPhone", "+998901234567"],
    ["maskPhone", "+998909876543"],
  ]);
  assert.deepEqual(response.body, {
    parents: [
      {
        parent_id: 11,
        name: "Ali Valiyev",
        relationship: "father",
        phone_masked: "masked:+998901234567",
        linked_at: linkedAt,
      },
      {
        parent_id: 12,
        name: "Ota-ona",
        relationship: "guardian",
        phone_masked: "masked:+998909876543",
        linked_at: linkedAt,
      },
    ],
  });
});

test("student parent unlink preserves validation, SQL, not-found, and success", async () => {
  const invalidHarness = createHarness();
  const invalidResponse = createResponse();
  await invalidHarness.controller.unlinkParent(
    { user: { id: 7 }, params: { parentId: "invalid" } },
    invalidResponse
  );
  assert.deepEqual(invalidHarness.calls, []);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri ID" });

  const missingHarness = createHarness({ queryResults: [{ rows: [] }] });
  const missingResponse = createResponse();
  await missingHarness.controller.unlinkParent(
    { user: { id: 7 }, params: { parentId: "11abc" } },
    missingResponse
  );
  assert.deepEqual(missingHarness.calls[0][2], [7, 11]);
  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(missingResponse.body, { error: "Bog'lanish topilmadi" });

  const harness = createHarness({ queryResults: [{ rows: [{ id: 1 }] }] });
  const response = createResponse();
  await harness.controller.unlinkParent(
    { user: { id: 7 }, params: { parentId: "11" } },
    response
  );
  assert.equal(harness.calls[0][1].includes("SET status='revoked'"), true);
  assert.deepEqual(harness.calls[0][2], [7, 11]);
  assert.deepEqual(response.body, { success: true });
});

test("student parent connection handlers preserve error logs", async () => {
  const cases = [
    [
      "getCodeStatus",
      "Parent kod olish xatosi:",
      { user: { id: 7 } },
      { queryError: new Error("database failed") },
    ],
    [
      "regenerateCode",
      "Parent kod yangilash xatosi:",
      { user: { id: 7 } },
      { assignError: new Error("database failed") },
    ],
    [
      "listParents",
      "Ota-onalar ro'yxati xatosi:",
      { user: { id: 7 } },
      { queryError: new Error("database failed") },
    ],
    [
      "unlinkParent",
      "Ota-onani uzish xatosi:",
      { user: { id: 7 }, params: { parentId: "11" } },
      { queryError: new Error("database failed") },
    ],
  ];

  for (const [method, message, request, options] of cases) {
    const harness = createHarness(options);
    const response = createResponse();
    await harness.controller[method](request, response);
    assert.deepEqual(harness.calls.at(-1), [
      "error",
      message,
      "database failed",
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("student parent connection routes preserve paths and middleware order", () => {
  const harness = createHarness();
  const router = createStudentParentConnectionRoutes(harness.dependencies);
  const expected = [
    ["/student/parent-code", "get"],
    ["/student/parent-code/regenerate", "post"],
    ["/student/parents", "get"],
    ["/student/parents/:parentId", "delete"],
  ];

  assert.equal(router.stack.length, expected.length);
  expected.forEach(([path, method], index) => {
    const route = router.stack[index].route;
    assert.equal(route.path, path);
    assert.equal(route.methods[method], true);
    assert.equal(route.stack.length, 3);
    assert.equal(route.stack[0].handle, authMiddleware);
    assert.equal(route.stack[1].handle, requireStudent);
  });
});
