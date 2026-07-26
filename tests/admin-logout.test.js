const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const { createAdminLogoutController } = require("../src/controllers/adminLogoutController");
const createAdminLogoutRoutes = require("../src/routes/adminLogoutRoutes");

const VERSION_SQL = `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('admin_auth_version', '1', NOW())
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = ((COALESCE(admin_settings.setting_value, '0'))::int + 1)::text,
               updated_at = NOW()`;

function createHarness({ auditError, queryError } = {}) {
  const calls = [];
  const controller = createAdminLogoutController({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
      if (auditError) throw auditError;
    },
  });
  const response = {
    body: null,
    json(body) {
      calls.push(["json", body]);
      this.body = body;
      return this;
    },
  };
  return { calls, controller, response };
}

test("admin logout preserves audit, auth-version update, and response order", async () => {
  const request = { admin: { name: "Admin" } };
  const harness = createHarness();

  assert.equal(await harness.controller.logout(request, harness.response), undefined);

  assert.deepEqual(harness.calls, [
    ["audit", request, "admin_logout", { details: "Admin tizimdan chiqdi" }],
    ["query", VERSION_SQL, undefined],
    ["json", { message: "Chiqildi" }],
  ]);
  assert.deepEqual(harness.response.body, { message: "Chiqildi" });
});

test("admin logout preserves audit-error propagation before database access", async () => {
  const auditError = new Error("audit failed");
  const harness = createHarness({ auditError });

  await assert.rejects(
    () => harness.controller.logout({}, harness.response),
    (error) => error === auditError
  );
  assert.deepEqual(harness.calls.map((call) => call[0]), ["audit"]);
  assert.equal(harness.response.body, null);
});

test("admin logout preserves database-error propagation without a success response", async () => {
  const queryError = new Error("query failed");
  const harness = createHarness({ queryError });

  await assert.rejects(
    () => harness.controller.logout({}, harness.response),
    (error) => error === queryError
  );
  assert.deepEqual(harness.calls.map((call) => call[0]), ["audit", "query"]);
  assert.equal(harness.response.body, null);
});

test("admin logout route preserves path, method, and admin middleware order", () => {
  const router = createAdminLogoutRoutes({
    pool: { query() {} },
    logAudit() {},
  });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/admin/logout");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
