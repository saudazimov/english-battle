const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTeacherSettingsPasswordController,
} = require("../src/controllers/teacherSettingsPasswordController");

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

test("teacher settings password preserves validation response before database access", async () => {
  const validated = [];
  let queryCount = 0;
  const controller = createTeacherSettingsPasswordController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
    bcrypt: {
      async compare() { throw new Error("must not compare"); },
      async hash() { throw new Error("must not hash"); },
    },
    validatePassword(password) {
      validated.push(password);
      return { valid: false, error: "Parol kamida 8 belgi bo'lishi kerak" };
    },
  });
  const res = createResponse();

  await controller.updatePassword({ user: { id: 42 }, body: {} }, res);

  assert.deepEqual(validated, [""]);
  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Parol kamida 8 belgi bo'lishi kerak" });
});

test("teacher settings password preserves incorrect-current-password response", async () => {
  const queries = [];
  const compareCalls = [];
  const controller = createTeacherSettingsPasswordController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [{ password: "stored-hash" }] };
      },
    },
    bcrypt: {
      async compare(...args) { compareCalls.push(args); return false; },
      async hash() { throw new Error("must not hash"); },
    },
    validatePassword() { return { valid: true }; },
  });
  const res = createResponse();

  await controller.updatePassword({
    user: { id: 42 },
    body: { current_password: "wrong", new_password: "Strong123" },
  }, res);

  assert.deepEqual(queries, [{
    sql: "SELECT password FROM users WHERE id = $1",
    params: [42],
  }]);
  assert.deepEqual(compareCalls, [["wrong", "stored-hash"]]);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { error: "Joriy parol noto'g'ri" });
});

test("teacher settings password preserves hash, update and response", async () => {
  const queries = [];
  const compareCalls = [];
  const hashCalls = [];
  const controller = createTeacherSettingsPasswordController({
    pool: {
      async query(sql, params) {
        queries.push({ sql, params });
        return queries.length === 1 ? { rows: [{ password: "stored-hash" }] } : { rows: [] };
      },
    },
    bcrypt: {
      async compare(...args) { compareCalls.push(args); return true; },
      async hash(...args) { hashCalls.push(args); return "new-hash"; },
    },
    validatePassword(password) {
      assert.equal(password, "Strong123");
      return { valid: true };
    },
  });
  const res = createResponse();

  await controller.updatePassword({
    user: { id: 42 },
    body: { current_password: "Current123", new_password: "Strong123" },
  }, res);

  assert.deepEqual(compareCalls, [["Current123", "stored-hash"]]);
  assert.deepEqual(hashCalls, [["Strong123", 10]]);
  assert.deepEqual(queries, [
    { sql: "SELECT password FROM users WHERE id = $1", params: [42] },
    {
      sql: "UPDATE users SET password=$1, auth_version=auth_version+1 WHERE id=$2",
      params: ["new-hash", 42],
    },
  ]);
  assert.deepEqual(res.body, { message: "Parol yangilandi. Qaytadan kiring.", relogin: true });
});

test("teacher settings password preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createTeacherSettingsPasswordController({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: {
      async compare() { return true; },
      async hash() { return "new-hash"; },
    },
    validatePassword() { return { valid: true }; },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.updatePassword({
    user: { id: 42 },
    body: { current_password: "Current123", new_password: "Strong123" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Teacher password update xatosi:", "database unavailable"]]);
});
