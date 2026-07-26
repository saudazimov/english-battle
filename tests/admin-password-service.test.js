const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminPasswordService } = require("../src/services/adminPasswordService");

const PASSWORD_SQL = "SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password_hash'";

test("admin password preserves missing-password early return", async () => {
  let queryCalls = 0;
  const service = createAdminPasswordService({
    pool: { async query() { queryCalls += 1; } },
    bcrypt: { async compare() { throw new Error("must not compare"); } },
    environment: { ADMIN_PASSWORD: "legacy" },
    logger: { error() { throw new Error("must not log"); } },
  });

  assert.equal(await service(), false);
  assert.equal(await service(""), false);
  assert.equal(queryCalls, 0);
});

test("admin password preserves database-hash precedence", async () => {
  const queryCalls = [];
  const compareCalls = [];
  const service = createAdminPasswordService({
    pool: {
      async query(...args) {
        queryCalls.push(args);
        return { rows: [{ setting_value: "stored-hash" }] };
      },
    },
    bcrypt: {
      async compare(...args) {
        compareCalls.push(args);
        return false;
      },
    },
    environment: { ADMIN_PASSWORD: "entered-password" },
    logger: { error() { throw new Error("must not log"); } },
  });

  assert.equal(await service("entered-password"), false);
  assert.deepEqual(queryCalls, [[PASSWORD_SQL]]);
  assert.deepEqual(compareCalls, [["entered-password", "stored-hash"]]);
});

test("admin password preserves environment fallback without stored hash", async () => {
  const service = createAdminPasswordService({
    pool: { async query() { return { rows: [] }; } },
    bcrypt: { async compare() { throw new Error("must not compare"); } },
    environment: { ADMIN_PASSWORD: "legacy-password" },
    logger: { error() { throw new Error("must not log"); } },
  });

  assert.equal(await service("legacy-password"), true);
  assert.equal(await service("wrong-password"), false);
});

test("admin password preserves query-error logging and environment fallback", async () => {
  const logs = [];
  const service = createAdminPasswordService({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: { async compare() { throw new Error("must not compare"); } },
    environment: { ADMIN_PASSWORD: "legacy-password" },
    logger: { error(...args) { logs.push(args); } },
  });

  assert.equal(await service("legacy-password"), true);
  assert.deepEqual(logs, [[
    "Admin parol tekshirish (baza) xatosi:",
    "database unavailable",
  ]]);
});

test("admin password preserves bcrypt-error fallback", async () => {
  const logs = [];
  const service = createAdminPasswordService({
    pool: { async query() { return { rows: [{ setting_value: "stored-hash" }] }; } },
    bcrypt: { async compare() { throw new Error("bcrypt unavailable"); } },
    environment: { ADMIN_PASSWORD: "legacy-password" },
    logger: { error(...args) { logs.push(args); } },
  });

  assert.equal(await service("legacy-password"), true);
  assert.deepEqual(logs, [[
    "Admin parol tekshirish (baza) xatosi:",
    "bcrypt unavailable",
  ]]);
});
