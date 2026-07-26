const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createAdminAuthController,
} = require("../src/controllers/adminAuthController");
const { createAdminAuthRoutes } = require("../src/routes/adminAuthRoutes");

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
  passwordResults = [true],
  totpOk = true,
  queryResults = [],
  queryError,
  passwordValidation = { valid: true },
} = {}) {
  const calls = [];
  let passwordIndex = 0;
  let queryIndex = 0;
  const adminLoginRateLimit = function adminLoginRateLimit() {};
  const dependencies = {
    adminLoginRateLimit,
    async checkAdminPassword(password) {
      calls.push(["checkPassword", password]);
      return passwordResults[passwordIndex++];
    },
    adminTotpValid(totp) {
      calls.push(["totp", totp]);
      return totpOk;
    },
    recordFailedLogin(req) {
      calls.push(["recordFailed", req]);
    },
    clearLoginAttempts(req) {
      calls.push(["clearAttempts", req]);
    },
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        if (queryError) throw queryError;
        return queryResults[queryIndex++] || { rows: [] };
      },
    },
    signAdminToken(name, version) {
      calls.push(["signToken", name, version]);
      return "signed-admin-token";
    },
    async logAudit(req, action, options) {
      calls.push(["audit", req, action, options]);
    },
    validatePassword(password) {
      calls.push(["validatePassword", password]);
      return passwordValidation;
    },
    bcrypt: {
      async hash(password, rounds) {
        calls.push(["hash", password, rounds]);
        return "hashed-password";
      },
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  };
  return {
    calls,
    controller: createAdminAuthController(dependencies),
    dependencies,
    adminLoginRateLimit,
  };
}

test("admin login preserves failed password/2FA order, audit, and response", async () => {
  const harness = createHarness({ passwordResults: [false], totpOk: false });
  const response = createResponse();
  const request = { body: { password: "wrong", totp: "000000" } };

  await harness.controller.login(request, response);

  assert.deepEqual(harness.calls, [
    ["checkPassword", "wrong"],
    ["totp", "000000"],
    ["recordFailed", request],
    [
      "audit",
      request,
      "admin_login_failed",
      { details: "Noto'g'ri admin kirish urinishi" },
    ],
  ]);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, {
    error: "Parol yoki 2FA kod noto'g'ri",
  });
});

test("admin login preserves auth-version query, token, audit, and response", async () => {
  const harness = createHarness({
    queryResults: [{ rows: [{ setting_value: "4" }] }],
  });
  const response = createResponse();
  const request = { body: { password: "secret", totp: "123456" } };

  await harness.controller.login(request, response);

  assert.deepEqual(harness.calls.slice(0, 5), [
    ["checkPassword", "secret"],
    ["totp", "123456"],
    ["clearAttempts", request],
    [
      "query",
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_auth_version'",
      undefined,
    ],
    ["signToken", "Admin", 4],
  ]);
  assert.deepEqual(request.admin, { name: "Admin" });
  assert.deepEqual(harness.calls[5], [
    "audit",
    request,
    "admin_login_success",
    { details: "Admin tizimga kirdi" },
  ]);
  assert.deepEqual(response.body, {
    token: "signed-admin-token",
    admin: { name: "Admin", role: "super_admin" },
  });
});

test("admin password change preserves missing and invalid password responses", async () => {
  const missingHarness = createHarness();
  const missingResponse = createResponse();
  await missingHarness.controller.changePassword(
    { body: { current_password: "old" } },
    missingResponse
  );
  assert.deepEqual(missingHarness.calls, []);
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, {
    error: "Joriy va yangi parol kerak",
  });

  const invalidHarness = createHarness({
    passwordValidation: { valid: false, error: "Kuchsiz parol" },
  });
  const invalidResponse = createResponse();
  await invalidHarness.controller.changePassword(
    { body: { current_password: "old", new_password: "weak" } },
    invalidResponse
  );
  assert.deepEqual(invalidHarness.calls, [["validatePassword", "weak"]]);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Kuchsiz parol" });
});

test("admin password change preserves wrong-current-password audit", async () => {
  const harness = createHarness({ passwordResults: [false] });
  const response = createResponse();
  const request = {
    body: { current_password: "wrong", new_password: "StrongPass123" },
  };

  await harness.controller.changePassword(request, response);

  assert.deepEqual(harness.calls, [
    ["validatePassword", "StrongPass123"],
    ["checkPassword", "wrong"],
    [
      "audit",
      request,
      "admin_password_change_failed",
      { details: "Joriy parol noto'g'ri" },
    ],
  ]);
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: "Joriy parol noto'g'ri" });
});

test("admin password change preserves hash, query order, version bump, and audit", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = {
    admin: { name: "Admin" },
    body: { current_password: "old", new_password: "StrongPass123" },
  };

  await harness.controller.changePassword(request, response);

  assert.deepEqual(harness.calls.map((call) => call[0]), [
    "validatePassword",
    "checkPassword",
    "hash",
    "query",
    "query",
    "audit",
  ]);
  assert.deepEqual(harness.calls[2], ["hash", "StrongPass123", 10]);
  assert.equal(harness.calls[3][1].includes("admin_password_hash"), true);
  assert.deepEqual(harness.calls[3][2], ["hashed-password"]);
  assert.equal(harness.calls[4][1].includes("admin_auth_version"), true);
  assert.equal(harness.calls[4][2], undefined);
  assert.deepEqual(harness.calls[5], [
    "audit",
    request,
    "admin_password_changed",
    { details: "Admin parol o'zgartirildi" },
  ]);
  assert.deepEqual(response.body, {
    message: "Parol muvaffaqiyatli o'zgartirildi",
  });
});

test("admin auth handlers preserve error logs and 500 responses", async () => {
  const loginHarness = createHarness({ queryError: new Error("database failed") });
  const loginResponse = createResponse();
  await loginHarness.controller.login(
    { body: { password: "secret", totp: "123456" } },
    loginResponse
  );
  assert.deepEqual(loginHarness.calls.at(-1), [
    "error",
    "Admin login xatosi:",
    "database failed",
  ]);
  assert.equal(loginResponse.statusCode, 500);

  const passwordHarness = createHarness({
    queryError: new Error("database failed"),
  });
  const passwordResponse = createResponse();
  await passwordHarness.controller.changePassword(
    { body: { current_password: "old", new_password: "StrongPass123" } },
    passwordResponse
  );
  assert.deepEqual(passwordHarness.calls.at(-1), [
    "error",
    "Parol o'zgartirish xatosi:",
    "database failed",
  ]);
  assert.equal(passwordResponse.statusCode, 500);
  assert.deepEqual(passwordResponse.body, { error: "Server xatosi" });
});

test("admin auth routers preserve separated paths and middleware order", () => {
  const harness = createHarness();
  const routes = createAdminAuthRoutes(harness.dependencies);

  assert.equal(routes.loginRouter.stack.length, 1);
  const loginRoute = routes.loginRouter.stack[0].route;
  assert.equal(loginRoute.path, "/admin/login");
  assert.equal(loginRoute.methods.post, true);
  assert.equal(loginRoute.stack.length, 2);
  assert.equal(loginRoute.stack[0].handle, harness.adminLoginRateLimit);

  assert.equal(routes.passwordRouter.stack.length, 1);
  const passwordRoute = routes.passwordRouter.stack[0].route;
  assert.equal(passwordRoute.path, "/admin/settings/password");
  assert.equal(passwordRoute.methods.post, true);
  assert.equal(passwordRoute.stack.length, 2);
  assert.equal(passwordRoute.stack[0].handle, requireAdmin);
});
