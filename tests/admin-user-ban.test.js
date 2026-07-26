const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const { createAdminUserBanController } = require("../src/controllers/adminUserBanController");
const createAdminUserBanRoutes = require("../src/routes/adminUserBanRoutes");

const UPDATE_SQL = "UPDATE users SET is_banned = $1, auth_version = auth_version + 1 WHERE id = $2 RETURNING first_name, last_name";

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
  const controller = createAdminUserBanController({
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

test("admin user ban preserves missing-ID validation", async () => {
  const harness = createHarness();
  const response = createResponse();

  const result = await harness.controller.update({ body: { banned: true } }, response);

  assert.equal(result, response);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "id kerak" });
  assert.deepEqual(harness.calls, []);
});

test("admin user ban preserves strict database boolean and truthy response behavior", async () => {
  const scenarios = [
    {
      banned: true,
      expectedDatabaseValue: true,
      auditAction: "user_banned",
      message: "Foydalanuvchi bloklandi",
    },
    {
      banned: false,
      expectedDatabaseValue: false,
      auditAction: "user_unbanned",
      message: "Blok olib tashlandi",
    },
    {
      banned: "true",
      expectedDatabaseValue: false,
      auditAction: "user_banned",
      message: "Foydalanuvchi bloklandi",
    },
  ];

  for (const scenario of scenarios) {
    const request = { body: { id: "7", banned: scenario.banned } };
    const harness = createHarness();
    const response = createResponse();
    assert.equal(await harness.controller.update(request, response), undefined);
    assert.deepEqual(harness.calls, [
      ["query", UPDATE_SQL, [scenario.expectedDatabaseValue, "7"]],
      [
        "audit",
        request,
        scenario.auditAction,
        { entityType: "user", entityId: "7", details: "Ali Valiyev" },
      ],
    ]);
    assert.deepEqual(response.body, { message: scenario.message });
  }
});

test("admin user ban preserves not-found response before audit", async () => {
  const harness = createHarness({ rows: [] });
  const response = createResponse();

  const result = await harness.controller.update({ body: { id: 99, banned: true } }, response);

  assert.equal(result, response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Foydalanuvchi topilmadi" });
  assert.deepEqual(harness.calls.map((call) => call[0]), ["query"]);
});

test("admin user ban preserves database and audit error responses", async () => {
  for (const fixture of [
    { queryError: new Error("update failed"), expectedOrder: ["query", "error"], message: "update failed" },
    { auditError: new Error("audit failed"), expectedOrder: ["query", "audit", "error"], message: "audit failed" },
  ]) {
    const harness = createHarness(fixture);
    const response = createResponse();
    assert.equal(await harness.controller.update({ body: { id: 1, banned: true } }, response), undefined);
    assert.deepEqual(harness.calls.map((call) => call[0]), fixture.expectedOrder);
    assert.deepEqual(harness.calls.at(-1), ["error", "Ban xatosi:", fixture.message]);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: "Server xatosi" });
  }
});

test("admin user ban route preserves path, method, and middleware order", () => {
  const router = createAdminUserBanRoutes({ pool: {}, logAudit() {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/users/ban");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
