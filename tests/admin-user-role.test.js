const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const { createAdminUserRoleController } = require("../src/controllers/adminUserRoleController");
const createAdminUserRoleRoutes = require("../src/routes/adminUserRoleRoutes");

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

function createHarness({ rows = [{ first_name: "Ali", last_name: "Valiyev" }], queryError, auditError } = {}) {
  const calls = [];
  const controller = createAdminUserRoleController({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return { rows };
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
      if (auditError) throw auditError;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller };
}

test("admin user role preserves required-field and allowed-role validation", async () => {
  const missing = createHarness();
  const missingResponse = createResponse();
  assert.equal(await missing.controller.update({ body: { id: 1 } }, missingResponse), missingResponse);
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "id va role kerak" });
  assert.deepEqual(missing.calls, []);

  const invalid = createHarness();
  const invalidResponse = createResponse();
  assert.equal(
    await invalid.controller.update({ body: { id: 1, role: "super_admin" } }, invalidResponse),
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Noto'g'ri rol" });
  assert.deepEqual(invalid.calls, []);
});

test("admin user role preserves update, audit, and response order", async () => {
  const request = { body: { id: "7", role: "teacher" }, admin: { name: "Admin" } };
  const harness = createHarness();
  const response = createResponse();

  assert.equal(await harness.controller.update(request, response), undefined);

  assert.deepEqual(harness.calls, [
    [
      "query",
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING first_name, last_name",
      ["teacher", "7"],
    ],
    [
      "audit",
      request,
      "user_role_changed",
      { entityType: "user", entityId: "7", details: "Ali Valiyev → teacher" },
    ],
  ]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { message: "Rol o'zgartirildi" });
});

test("admin user role preserves not-found response before audit", async () => {
  const harness = createHarness({ rows: [] });
  const response = createResponse();

  const result = await harness.controller.update({ body: { id: 99, role: "parent" } }, response);

  assert.equal(result, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Foydalanuvchi topilmadi" });
  assert.deepEqual(harness.calls.map((call) => call[0]), ["query"]);
});

test("admin user role preserves database and audit error responses", async () => {
  for (const fixture of [
    { queryError: new Error("update failed"), expectedOrder: ["query", "error"], message: "update failed" },
    { auditError: new Error("audit failed"), expectedOrder: ["query", "audit", "error"], message: "audit failed" },
  ]) {
    const harness = createHarness(fixture);
    const response = createResponse();
    assert.equal(await harness.controller.update({ body: { id: 1, role: "student" } }, response), undefined);
    assert.deepEqual(harness.calls.map((call) => call[0]), fixture.expectedOrder);
    assert.deepEqual(harness.calls.at(-1), ["error", "Rol o'zgartirish xatosi:", fixture.message]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin user role route preserves path, method, and middleware order", () => {
  const router = createAdminUserRoleRoutes({ pool: {}, logAudit() {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/users/role");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
