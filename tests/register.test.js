const test = require("node:test");
const assert = require("node:assert/strict");
const { requireNormalizedPhone } = require("../src/middleware/requireNormalizedPhone");
const { createRegisterService } = require("../src/services/registerService");
const { createRegisterController } = require("../src/controllers/registerController");
const registerRoutes = require("../src/routes/registerRoutes");

const USERNAME_REGEX = /^[a-z0-9_]{5,32}$/;

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

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

function createHarness({ queryResponses = [], passwordResult, compareResult = true } = {}) {
  const calls = [];
  const responses = queryResponses.slice();
  const dependencies = {
    pool: {
      async query(sql, params) {
        calls.push(["query", normalizeSql(sql), params]);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response || { rows: [] };
      },
    },
    bcrypt: {
      async compare(code, hash) {
        calls.push(["compare", code, hash]);
        return compareResult;
      },
      async hash(password, rounds) {
        calls.push(["hash", password, rounds]);
        return "password-hash";
      },
    },
    validatePassword(password) {
      calls.push(["validate-password", password]);
      return passwordResult || { valid: true };
    },
    usernameRegex: USERNAME_REGEX,
    schoolInvite: {
      hashCode(code) {
        calls.push(["invite-hash", code]);
        return "invite-hash";
      },
    },
    noteFail(...args) {
      calls.push(["note-fail", ...args]);
    },
    noteOk(...args) {
      calls.push(["note-ok", ...args]);
    },
    phoneIpKey(req) {
      calls.push(["phone-key", req]);
      return "phone|ip";
    },
    validateGlobalLocation(country, region, district) {
      calls.push(["location", country, region, district]);
      return { valid: true };
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return value ? `safe:${value}` : "";
    },
    normalizeSchool(school) {
      calls.push(["normalize-school", school]);
      return `normalized:${school || ""}`;
    },
    signToken(user) {
      calls.push(["sign", user]);
      return "signed-token";
    },
    otpVerifyGate(req, res, next) {
      next();
    },
  };
  return { dependencies, calls };
}

function studentBody(overrides = {}) {
  return {
    first_name: "Ali",
    last_name: "Valiyev",
    phone: "+998901234567",
    password: "Password1",
    birth_date: "2012-01-02",
    birth_year: 2012,
    region: "Toshkent",
    district: "Chilonzor",
    village: "Bunyodkor",
    school: "01-maktab",
    code: "654321",
    role: "student",
    username: " Ali_User ",
    country: "uz",
    ...overrides,
  };
}

test("register preserves student SQL order, normalization, token, and response", async () => {
  const user = { id: 7, username: "ali_user", role: "student" };
  const { dependencies, calls } = createHarness({
    queryResponses: [
      { rows: [] },
      { rows: [] },
      { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] },
      { rows: [user] },
      { rows: [] },
    ],
  });
  const controller = createRegisterController(dependencies);
  const response = createResponse();
  const request = { body: studentBody() };

  await controller.register(request, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body, {
    message: "Ro'yxatdan o'tish muvaffaqiyatli!",
    token: "signed-token",
    user,
  });
  const queries = calls.filter(([type]) => type === "query");
  assert.deepEqual(queries.map((query) => query[1]), [
    "SELECT id FROM users WHERE username = $1",
    "SELECT * FROM users WHERE phone = $1",
    "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
    "INSERT INTO users (first_name, last_name, phone, password, birth_date, birth_year, region, district, village, school, role, username, country) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, first_name, last_name, username, phone, cefr_level, xp, rating, coins, region, district, school, role, country, created_at",
    "DELETE FROM otp_codes WHERE phone = $1",
  ]);
  assert.deepEqual(queries[0][2], ["ali_user"]);
  assert.deepEqual(queries[3][2], [
    "safe:Ali",
    "safe:Valiyev",
    "+998901234567",
    "password-hash",
    "2012-01-02",
    2012,
    "Toshkent",
    "Chilonzor",
    "safe:Bunyodkor",
    "normalized:1-maktab",
    "student",
    "ali_user",
    "UZ",
  ]);
  assert.ok(calls.findIndex(([type]) => type === "note-ok")
    < calls.findIndex(([type]) => type === "location"));
  assert.ok(calls.findIndex(([type]) => type === "location")
    < calls.findIndex(([type]) => type === "hash"));
  assert.deepEqual(calls.at(-1), ["sign", user]);
});

test("register preserves school-admin invite lookup, overrides, and usage update", async () => {
  const user = { id: 21, username: "admin_one", role: "school_admin" };
  const invite = {
    id: 8,
    school_name: "45-maktab",
    region: "Samarqand",
    district: "Urgut",
    used_by: null,
    expires_at: new Date(Date.now() + 60_000),
  };
  const { dependencies, calls } = createHarness({
    queryResponses: [
      { rows: [] },
      { rows: [invite] },
      { rows: [] },
      { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] },
      { rows: [user] },
      { rows: [] },
      { rows: [] },
    ],
  });
  const service = createRegisterService(dependencies);
  const result = await service.register({
    req: {},
    body: studentBody({
      role: "school_admin",
      username: "Admin_One",
      school_code: "INVITE-1",
      school: "client-school",
      region: "client-region",
      district: "client-district",
    }),
  });

  assert.deepEqual(result, { statusCode: 201, user });
  const queries = calls.filter(([type]) => type === "query");
  assert.match(queries[1][1], /^SELECT id, school_name, region, district/);
  assert.deepEqual(queries[1][2], ["invite-hash"]);
  assert.deepEqual(queries[4][2].slice(6, 13), [
    "Samarqand",
    "Urgut",
    "safe:Bunyodkor",
    "normalized:45-maktab",
    "school_admin",
    "admin_one",
    "UZ",
  ]);
  assert.equal(
    queries[5][1],
    "UPDATE school_invites SET used_by = $1, used_at = NOW() WHERE id = $2"
  );
  assert.deepEqual(queries[5][2], [21, 8]);
  assert.equal(queries[6][1], "DELETE FROM otp_codes WHERE phone = $1");
  assert.equal(calls.some(([type]) => type === "location"), true);
});

test("register preserves validation short circuits before database access", async () => {
  const weak = createHarness({ passwordResult: { valid: false, error: "Zaif parol" } });
  const weakService = createRegisterService(weak.dependencies);
  assert.deepEqual(await weakService.register({
    req: {},
    body: studentBody({ password: "weak" }),
  }), { statusCode: 400, body: { error: "Zaif parol" } });
  assert.equal(weak.calls.some(([type]) => type === "query"), false);

  const missing = createHarness();
  const missingService = createRegisterService(missing.dependencies);
  assert.deepEqual(await missingService.register({ req: {}, body: {} }), {
    statusCode: 400,
    body: { error: "Ism, familiya, telefon va parol majburiy" },
  });
  assert.equal(missing.calls.some(([type]) => type === "validate-password"), false);
});

test("register preserves username, role, and school validation order", async () => {
  const invalidUsername = createHarness();
  assert.deepEqual(await createRegisterService(invalidUsername.dependencies).register({
    req: {},
    body: studentBody({ username: "bad!" }),
  }), {
    statusCode: 400,
    body: {
      error: "Username 5-32 belgi bo'lishi va faqat a-z, 0-9, _ belgilaridan iborat bo'lishi kerak",
    },
  });
  assert.equal(invalidUsername.calls.some(([type]) => type === "query"), false);

  const invalidRole = createHarness({ queryResponses: [{ rows: [] }] });
  assert.deepEqual(await createRegisterService(invalidRole.dependencies).register({
    req: {},
    body: studentBody({ role: "admin" }),
  }), { statusCode: 400, body: { error: "Hisob turi noto'g'ri tanlangan" } });
  assert.equal(invalidRole.calls.filter(([type]) => type === "query").length, 1);

  const invalidSchool = createHarness({ queryResponses: [{ rows: [] }] });
  assert.deepEqual(await createRegisterService(invalidSchool.dependencies).register({
    req: {},
    body: studentBody({ school: "201-maktab" }),
  }), {
    statusCode: 400,
    body: {
      error: "Maktabni 1-maktabdan 200-maktabgacha bo'lgan ro'yxatdan tanlang",
    },
  });
  assert.equal(invalidSchool.calls.filter(([type]) => type === "query").length, 1);
});

test("register preserves invalid OTP failure note and location short circuit", async () => {
  const invalidOtp = createHarness({
    compareResult: false,
    queryResponses: [
      { rows: [] },
      { rows: [] },
      { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] },
    ],
  });
  const invalidResult = await createRegisterService(invalidOtp.dependencies).register({
    req: { marker: true },
    body: studentBody(),
  });
  assert.deepEqual(invalidResult, {
    statusCode: 400,
    body: { error: "Kod noto'g'ri" },
  });
  assert.deepEqual(invalidOtp.calls.find(([type]) => type === "note-fail"), [
    "note-fail", "otp_verify", "phone|ip", 5, 15 * 60 * 1000,
  ]);
  assert.equal(invalidOtp.calls.some(([type]) => type === "hash"), false);

  const location = createHarness({
    queryResponses: [
      { rows: [] },
      { rows: [] },
      { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] },
    ],
  });
  location.dependencies.validateGlobalLocation = (...args) => {
    location.calls.push(["location", ...args]);
    return { valid: false, error: "Hudud noto'g'ri" };
  };
  const locationResult = await createRegisterService(location.dependencies).register({
    req: {},
    body: studentBody(),
  });
  assert.deepEqual(locationResult, {
    statusCode: 400,
    body: { error: "Hudud noto'g'ri" },
  });
  assert.equal(location.calls.some(([type]) => type === "note-ok"), true);
  assert.equal(location.calls.some(([type]) => type === "hash"), false);
});

test("register controller preserves outer error log and 500 response", async () => {
  const { dependencies } = createHarness({
    queryResponses: [new Error("database unavailable")],
  });
  const controller = createRegisterController(dependencies);
  const response = createResponse();
  const logs = [];
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    await controller.register({ body: studentBody() }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Register xatosi:", "database unavailable"]]);
});

test("register route preserves path and middleware order", () => {
  const { dependencies } = createHarness();
  const router = registerRoutes(dependencies);
  const route = router.stack[0].route;

  assert.equal(route.path, "/register");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, requireNormalizedPhone);
  assert.equal(route.stack[1].handle, dependencies.otpVerifyGate);
  assert.equal(route.stack.length, 3);
});
