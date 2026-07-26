const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminSettingsInfoController } = require("../src/controllers/adminSettingsInfoController");

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

function createPool(passwordRows = [{ updated_at: "2026-07-26T00:00:00.000Z" }]) {
  const queries = [];
  const counts = { users: "12", questions: "34", audit_logs: "56" };
  return {
    queries,
    pool: {
      query: async (sql) => {
        queries.push(sql);
        if (sql.includes("admin_password_hash")) return { rows: passwordRows };
        const table = Object.keys(counts).find((name) => sql.endsWith(name));
        return { rows: [{ c: counts[table] }] };
      },
    },
  };
}

test("admin settings info preserves database source and counts", async () => {
  const fixture = createPool();
  const controller = createAdminSettingsInfoController({ pool: fixture.pool });
  const response = createResponse();

  await controller.info({}, response);

  assert.deepEqual(fixture.queries, [
    "SELECT updated_at FROM admin_settings WHERE setting_key = 'admin_password_hash'",
    "SELECT COUNT(*) AS c FROM users",
    "SELECT COUNT(*) AS c FROM questions",
    "SELECT COUNT(*) AS c FROM audit_logs",
  ]);
  assert.deepEqual(response.body, {
    passwordSource: "database",
    passwordUpdated: "2026-07-26T00:00:00.000Z",
    totalUsers: 12,
    totalQuestions: 34,
    totalAuditLogs: 56,
  });
});

test("admin settings info preserves the env password fallback", async () => {
  const fixture = createPool([]);
  const controller = createAdminSettingsInfoController({ pool: fixture.pool });
  const response = createResponse();

  await controller.info({}, response);

  assert.equal(response.body.passwordSource, "env");
  assert.equal(response.body.passwordUpdated, null);
});

test("admin settings info preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createAdminSettingsInfoController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.info({}, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Settings info xatosi:", "database unavailable"]]);
});
