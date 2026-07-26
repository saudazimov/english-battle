const test = require("node:test");
const assert = require("node:assert/strict");

const { createAuditLogService } = require("../src/services/auditLogService");

const INSERT_SQL = `INSERT INTO audit_logs (admin_name, action, entity_type, entity_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6)`;

test("audit log preserves parameterized insert and IP truncation", async () => {
  const calls = [];
  const longIp = "x".repeat(75);
  const request = { admin: { name: "Platform Admin" } };
  const service = createAuditLogService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
      },
    },
    clientIp(req) {
      assert.equal(req, request);
      return longIp;
    },
    logger: { error() { throw new Error("must not log"); } },
  });

  const result = await service(request, "user_updated", {
    entityType: "user",
    entityId: 44,
    details: "Profil yangilandi",
  });

  assert.equal(result, undefined);
  assert.deepEqual(calls, [{
    sql: INSERT_SQL,
    params: [
      "Platform Admin",
      "user_updated",
      "user",
      "44",
      "Profil yangilandi",
      "x".repeat(60),
    ],
  }]);
});

test("audit log preserves default and falsy option mapping", async () => {
  const calls = [];
  const service = createAuditLogService({
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
      },
    },
    clientIp() { return "unknown"; },
    logger: { error() { throw new Error("must not log"); } },
  });

  await service({}, "admin_logout");
  await service({ admin: {} }, "zero_entity", {
    entityType: "",
    entityId: 0,
    details: "",
  });

  assert.deepEqual(calls, [
    {
      sql: INSERT_SQL,
      params: ["Admin", "admin_logout", null, null, null, "unknown"],
    },
    {
      sql: INSERT_SQL,
      params: ["Admin", "zero_entity", null, null, null, "unknown"],
    },
  ]);
});

test("audit log preserves safe database-error logging", async () => {
  const logs = [];
  const service = createAuditLogService({
    pool: { async query() { throw new Error("database unavailable"); } },
    clientIp() { return "127.0.0.1"; },
    logger: { error(...args) { logs.push(args); } },
  });

  const result = await service({}, "test_action");

  assert.equal(result, undefined);
  assert.deepEqual(logs, [["Audit log xatosi:", "database unavailable"]]);
});
