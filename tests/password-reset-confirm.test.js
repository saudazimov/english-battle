const test = require("node:test");
const assert = require("node:assert/strict");
const { requireNormalizedPhone } = require("../src/middleware/requireNormalizedPhone");
const {
  createPasswordResetConfirmService,
} = require("../src/services/passwordResetConfirmService");
const {
  createPasswordResetConfirmController,
} = require("../src/controllers/passwordResetConfirmController");
const passwordResetConfirmRoutes = require("../src/routes/passwordResetConfirmRoutes");

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

test("password reset confirm preserves OTP, password SQL, and cleanup order", async () => {
  const calls = [];
  const req = { body: { phone: "+998901234567" } };
  let queryCount = 0;
  const service = createPasswordResetConfirmService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        queryCount++;
        if (queryCount === 1) {
          return { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] };
        }
        if (queryCount === 2) return { rows: [{ id: 7 }] };
        return { rows: [] };
      },
    },
    bcrypt: {
      async compare(code, hash) {
        calls.push(["compare", code, hash]);
        return true;
      },
      async hash(password, rounds) {
        calls.push(["hash", password, rounds]);
        return "password-hash";
      },
    },
    noteFail: assert.fail,
    noteOk(...args) { calls.push(["ok", ...args]); },
    phoneIpKey(receivedReq) {
      assert.equal(receivedReq, req);
      calls.push(["key"]);
      return "phone|ip";
    },
  });

  assert.deepEqual(await service.confirmReset({
    req,
    phone: "+998901234567",
    code: 654321,
    newPassword: "NewPassword1",
  }), { status: "reset" });
  assert.deepEqual(calls, [
    [
      "query",
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      ["+998901234567"],
    ],
    ["compare", "654321", "otp-hash"],
    ["key"],
    ["ok", "otp_verify", "phone|ip"],
    ["query", "SELECT id FROM users WHERE phone = $1", ["+998901234567"]],
    ["hash", "NewPassword1", 10],
    [
      "query",
      "UPDATE users SET password = $1, auth_version = auth_version + 1 WHERE phone = $2",
      ["password-hash", "+998901234567"],
    ],
    ["query", "DELETE FROM otp_codes WHERE phone = $1", ["+998901234567"]],
  ]);
});

test("password reset confirm preserves OTP failure short circuits", async () => {
  const missingService = createPasswordResetConfirmService({
    pool: { async query() { return { rows: [] }; } },
    bcrypt: { compare: assert.fail, hash: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  assert.deepEqual(await missingService.confirmReset({
    phone: "+998901234567",
    code: "654321",
    newPassword: "NewPassword1",
  }), { status: "not-requested" });

  const failures = [];
  const invalidService = createPasswordResetConfirmService({
    pool: {
      async query() {
        return { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] };
      },
    },
    bcrypt: { async compare() { return false; }, hash: assert.fail },
    noteFail(...args) { failures.push(args); },
    noteOk: assert.fail,
    phoneIpKey() { return "phone|ip"; },
  });
  assert.deepEqual(await invalidService.confirmReset({
    req: {},
    phone: "+998901234567",
    code: "000000",
    newPassword: "NewPassword1",
  }), { status: "invalid" });
  assert.deepEqual(failures, [["otp_verify", "phone|ip", 5, 15 * 60 * 1000]]);
});

test("password reset confirm preserves missing-user result after valid OTP", async () => {
  const calls = [];
  let queryCount = 0;
  const service = createPasswordResetConfirmService({
    pool: {
      async query() {
        queryCount++;
        return queryCount === 1
          ? { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] }
          : { rows: [] };
      },
    },
    bcrypt: { async compare() { return true; }, hash: assert.fail },
    noteFail: assert.fail,
    noteOk(...args) { calls.push(args); },
    phoneIpKey() { return "phone|ip"; },
  });

  assert.deepEqual(await service.confirmReset({
    req: {},
    phone: "+998901234567",
    code: "654321",
    newPassword: "NewPassword1",
  }), { status: "user-not-found" });
  assert.deepEqual(calls, [["otp_verify", "phone|ip"]]);
});

test("password reset confirm controller preserves validation and responses", async () => {
  const controller = createPasswordResetConfirmController({
    pool: { query: assert.fail },
    bcrypt: { compare: assert.fail, hash: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  const missingResponse = createResponse();
  await controller.confirmReset(
    { body: { phone: "+998901234567", code: "654321" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Telefon, kod va yangi parol kiritilishi shart" });

  const shortResponse = createResponse();
  await controller.confirmReset({
    body: { phone: "+998901234567", code: "654321", new_password: "Abc123" },
  }, shortResponse);
  assert.deepEqual(shortResponse.body, { error: "Parol 8-128 belgi bo'lishi kerak" });

  const weakResponse = createResponse();
  await controller.confirmReset({
    body: { phone: "+998901234567", code: "654321", new_password: "abcdefgh" },
  }, weakResponse);
  assert.deepEqual(weakResponse.body, { error: "Parolda kamida 1 harf va 1 raqam bo'lishi kerak" });
});

test("password reset confirm controller preserves success and error logging", async () => {
  let queryCount = 0;
  const successController = createPasswordResetConfirmController({
    pool: {
      async query() {
        queryCount++;
        if (queryCount === 1) {
          return { rows: [{ code: "otp-hash", expires_at: new Date(Date.now() + 60_000) }] };
        }
        if (queryCount === 2) return { rows: [{ id: 7 }] };
        return { rows: [] };
      },
    },
    bcrypt: {
      async compare() { return true; },
      async hash() { return "password-hash"; },
    },
    noteFail: assert.fail,
    noteOk() {},
    phoneIpKey() { return "phone|ip"; },
  });
  const successResponse = createResponse();
  await successController.confirmReset({
    body: { phone: "+998901234567", code: "654321", new_password: "NewPassword1" },
  }, successResponse);
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, { message: "Parol muvaffaqiyatli o'zgartirildi" });

  const failingController = createPasswordResetConfirmController({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: { compare: assert.fail, hash: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await failingController.confirmReset({
      body: { phone: "+998901234567", code: "654321", new_password: "NewPassword1" },
    }, errorResponse);
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Parol tiklash xatosi:", "database unavailable"]]);
});

test("password reset confirm route preserves path and gate order", () => {
  function otpVerifyGate(req, res, next) { next(); }
  const router = passwordResetConfirmRoutes({
    pool: {},
    bcrypt: {},
    otpVerifyGate,
    noteFail() {},
    noteOk() {},
    phoneIpKey() {},
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/password-reset/confirm");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, requireNormalizedPhone);
  assert.equal(route.stack[1].handle, otpVerifyGate);
  assert.equal(route.stack.length, 3);
});
