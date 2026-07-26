const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminUserUpdateController,
} = require("../src/controllers/adminUserUpdateController");
const createAdminUserUpdateRoutes = require("../src/routes/adminUserUpdateRoutes");

const updateSql =
  "UPDATE users SET region = $1, district = $2, school = $3, cefr_level = $4 WHERE id = $5 RETURNING first_name, last_name";

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

function createHarness({
  regionResult = { valid: true },
  found = true,
  normalizeError,
  queryError,
  auditError,
} = {}) {
  const calls = [];
  const controller = createAdminUserUpdateController({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return {
          rows: found ? [{ first_name: "Ali", last_name: "Valiyev" }] : [],
        };
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
      if (auditError) throw auditError;
    },
    validateRegionDistrict(region, district) {
      calls.push(["validate", region, district]);
      return regionResult;
    },
    normalizeSchool(school) {
      calls.push(["normalize", school]);
      if (normalizeError) throw normalizeError;
      return "12-maktab";
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

function validBody(overrides = {}) {
  return {
    id: "42",
    region: "Toshkent",
    district: "Chilonzor",
    school: "12 maktab",
    cefr_level: "B2",
    ...overrides,
  };
}

test("admin user update preserves missing-ID validation", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.update(
    { body: validBody({ id: "" }) },
    response
  );

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Foydalanuvchi ID kerak" });
  assert.deepEqual(harness.calls, []);
});

test("admin user update preserves region validation response", async () => {
  const harness = createHarness({
    regionResult: { valid: false, error: "Hudud noto'g'ri" },
  });
  const response = createResponse();

  const result = await harness.controller.update({ body: validBody() }, response);

  assert.equal(result, response);
  assert.deepEqual(harness.calls, [["validate", "Toshkent", "Chilonzor"]]);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Hudud noto'g'ri" });
});

test("admin user update preserves normalization, SQL, audit, and response order", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = { body: validBody() };

  await harness.controller.update(request, response);

  assert.deepEqual(harness.calls, [
    ["validate", "Toshkent", "Chilonzor"],
    ["normalize", "12 maktab"],
    ["query", updateSql, ["Toshkent", "Chilonzor", "12-maktab", "B2", "42"]],
    [
      "audit",
      request,
      "user_updated",
      {
        entityType: "user",
        entityId: "42",
        details: "Ali Valiyev — Toshkent, Chilonzor",
      },
    ],
  ]);
  assert.deepEqual(response.body, { message: "Foydalanuvchi yangilandi" });
});

test("admin user update preserves invalid-level fallback", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.update(
    { body: validBody({ cefr_level: "invalid" }) },
    response
  );

  assert.deepEqual(harness.calls[2][2], [
    "Toshkent",
    "Chilonzor",
    "12-maktab",
    "A1",
    "42",
  ]);
});

test("admin user update preserves not-found response before audit", async () => {
  const harness = createHarness({ found: false });
  const response = createResponse();

  const result = await harness.controller.update({ body: validBody() }, response);

  assert.equal(result, response);
  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "validate",
    "normalize",
    "query",
  ]);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Foydalanuvchi topilmadi" });
});

test("admin user update preserves helper, database, and audit errors", async () => {
  const cases = [
    [
      { normalizeError: new Error("normalize failed") },
      ["validate", "normalize", "error"],
      "normalize failed",
    ],
    [
      { queryError: new Error("database failed") },
      ["validate", "normalize", "query", "error"],
      "database failed",
    ],
    [
      { auditError: new Error("audit failed") },
      ["validate", "normalize", "query", "audit", "error"],
      "audit failed",
    ],
  ];

  for (const [options, order, message] of cases) {
    const harness = createHarness(options);
    const response = createResponse();

    await harness.controller.update({ body: validBody() }, response);

    assert.deepEqual(harness.calls.map((call) => call[0]), order);
    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Foydalanuvchi yangilash xatosi:",
      message,
    ]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin user update route preserves path, method, and middleware order", () => {
  const router = createAdminUserUpdateRoutes({ pool: {}, logAudit() {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/users/update");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
