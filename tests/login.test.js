const test = require("node:test");
const assert = require("node:assert/strict");
const { createLoginService } = require("../src/services/loginService");
const { createLoginController } = require("../src/controllers/loginController");
const loginRoutes = require("../src/routes/loginRoutes");

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

function user(overrides = {}) {
  return {
    id: 7,
    first_name: "Ali",
    last_name: "Valiyev",
    username: "ali_7",
    phone: "+998901234567",
    password: "hashed-password",
    cefr_level: "B1",
    xp: 120,
    rating: 1010,
    coins: 50,
    profile_picture: null,
    role: "student",
    is_banned: false,
    ...overrides,
  };
}

test("login preserves missing-user failure tracking and SQL", async () => {
  const calls = [];
  const req = { body: { phone: "+998901234567" } };
  const service = createLoginService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        return { rows: [] };
      },
    },
    bcrypt: { compare: assert.fail },
    noteFail(...args) { calls.push(["fail", ...args]); },
    noteOk: assert.fail,
    phoneIpKey(receivedReq) {
      assert.equal(receivedReq, req);
      calls.push(["key"]);
      return "phone|ip";
    },
    signToken: assert.fail,
  });

  assert.deepEqual(await service.login({
    req,
    phone: "+998901234567",
    password: "Password1",
  }), { status: "invalid-credentials" });
  assert.deepEqual(calls, [
    ["query", "SELECT * FROM users WHERE phone = $1 OR LOWER(username) = LOWER($1) LIMIT 1", ["+998901234567"]],
    ["key"],
    ["fail", "login", "phone|ip", 8, 15 * 60 * 1000],
  ]);
});

test("login preserves invalid-password and banned-user behavior", async () => {
  const failures = [];
  const invalidService = createLoginService({
    pool: { async query() { return { rows: [user()] }; } },
    bcrypt: {
      async compare(password, hash) {
        assert.equal(password, "wrong");
        assert.equal(hash, "hashed-password");
        return false;
      },
    },
    noteFail(...args) { failures.push(args); },
    noteOk: assert.fail,
    phoneIpKey() { return "phone|ip"; },
    signToken: assert.fail,
  });
  assert.deepEqual(await invalidService.login({
    req: {},
    phone: "+998901234567",
    password: "wrong",
  }), { status: "invalid-credentials" });
  assert.deepEqual(failures, [["login", "phone|ip", 8, 15 * 60 * 1000]]);

  const bannedUser = user({ is_banned: true });
  const bannedService = createLoginService({
    pool: { async query() { return { rows: [bannedUser] }; } },
    bcrypt: { async compare() { return true; } },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
    signToken: assert.fail,
  });
  assert.deepEqual(await bannedService.login({
    req: {},
    phone: bannedUser.phone,
    password: "Password1",
  }), { status: "banned" });
});

test("login preserves successful cleanup and token creation order", async () => {
  const calls = [];
  const foundUser = user();
  const req = { body: { phone: foundUser.phone } };
  const service = createLoginService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        return { rows: [foundUser] };
      },
    },
    bcrypt: {
      async compare(password, hash) {
        calls.push(["compare", password, hash]);
        return true;
      },
    },
    noteFail: assert.fail,
    noteOk(...args) { calls.push(["ok", ...args]); },
    phoneIpKey(receivedReq) {
      assert.equal(receivedReq, req);
      calls.push(["key"]);
      return "phone|ip";
    },
    signToken(receivedUser) {
      calls.push(["token", receivedUser]);
      return "jwt-token";
    },
  });

  assert.deepEqual(await service.login({
    req,
    phone: foundUser.phone,
    password: "Password1",
  }), { status: "authenticated", token: "jwt-token", user: foundUser });
  assert.deepEqual(calls, [
    ["query", "SELECT * FROM users WHERE phone = $1 OR LOWER(username) = LOWER($1) LIMIT 1", [foundUser.phone]],
    ["compare", "Password1", "hashed-password"],
    ["key"],
    ["ok", "login", "phone|ip"],
    ["token", foundUser],
  ]);
});

test("login controller preserves validation and public user response", async () => {
  const invalidController = createLoginController({
    pool: { query: assert.fail },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
    signToken: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.login(
    { body: { phone: "+998901234567" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Login va parolni kiriting" });

  const foundUser = user({ private_field: "hidden" });
  const successController = createLoginController({
    pool: { async query() { return { rows: [foundUser] }; } },
    bcrypt: { async compare() { return true; } },
    noteFail: assert.fail,
    noteOk() {},
    phoneIpKey() { return "phone|ip"; },
    signToken() { return "jwt-token"; },
  });
  const successResponse = createResponse();
  await successController.login(
    { body: { phone: foundUser.phone, password: "Password1" } },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, {
    message: "Tizimga muvaffaqiyatli kirdingiz!",
    token: "jwt-token",
    user: {
      id: 7,
      first_name: "Ali",
      last_name: "Valiyev",
      username: "ali_7",
      phone: "+998901234567",
      cefr_level: "B1",
      xp: 120,
      rating: 1010,
      coins: 50,
      profile_picture: null,
      role: "student",
    },
  });
});

test("login controller preserves error logging", async () => {
  const controller = createLoginController({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
    signToken: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await controller.login(
      { body: { phone: "+998901234567", password: "Password1" } },
      response
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Login xatosi:", "database unavailable"]]);
});

test("login route preserves path, legacy normalization, and gate order", () => {
  function loginGate(req, res, next) { next(); }
  const router = loginRoutes({
    pool: {},
    bcrypt: {},
    loginGate,
    noteFail() {},
    noteOk() {},
    phoneIpKey() {},
    signToken() {},
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/login");
  assert.equal(route.methods.post, true);
  let loginNextCalled = false;
  route.stack[0].handle({ body: { login: "IL-7K3M-482Q" } }, {}, () => { loginNextCalled = true; });
  assert.equal(loginNextCalled, true);
  assert.equal(route.stack[1].handle, loginGate);
  assert.equal(route.stack.length, 3);
});

test("login accepts an admin-generated username case-insensitively", async () => {
  const foundUser = user({ username: "il-7k3m-482q", phone: null });
  const calls = [];
  const service = createLoginService({
    pool: { async query(sql, params) { calls.push([sql, params]); return { rows: [foundUser] }; } },
    bcrypt: { async compare() { return true; } },
    noteFail: assert.fail,
    noteOk() {},
    phoneIpKey() { return "login|ip"; },
    signToken() { return "student-token"; },
  });

  const outcome = await service.login({ req: {}, login: "IL-7K3M-482Q", password: "Password7a" });
  assert.equal(outcome.status, "authenticated");
  assert.deepEqual(calls[0][1], ["IL-7K3M-482Q"]);
});
