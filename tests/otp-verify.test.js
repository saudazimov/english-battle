const test = require("node:test");
const assert = require("node:assert/strict");
const { requireNormalizedPhone } = require("../src/middleware/requireNormalizedPhone");
const { createOtpVerifyService } = require("../src/services/otpVerifyService");
const { createOtpVerifyController } = require("../src/controllers/otpVerifyController");
const otpVerifyRoutes = require("../src/routes/otpVerifyRoutes");

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

test("OTP verify preserves SQL and successful attempt cleanup", async () => {
  const calls = [];
  const req = { body: { phone: "+998901234567" } };
  const service = createOtpVerifyService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        return {
          rows: [{
            code: "hashed-code",
            expires_at: new Date(Date.now() + 60_000),
          }],
        };
      },
    },
    bcrypt: {
      async compare(code, hash) {
        calls.push(["compare", code, hash]);
        return true;
      },
    },
    noteFail: assert.fail,
    noteOk(...args) {
      calls.push(["ok", ...args]);
    },
    phoneIpKey(receivedReq) {
      assert.equal(receivedReq, req);
      calls.push(["key"]);
      return "phone|ip";
    },
  });

  assert.deepEqual(await service.verifyOtp({
    req,
    phone: "+998901234567",
    code: 654321,
  }), { status: "verified" });
  assert.deepEqual(calls, [
    [
      "query",
      "SELECT * FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1",
      ["+998901234567"],
    ],
    ["compare", "654321", "hashed-code"],
    ["key"],
    ["ok", "otp_verify", "phone|ip"],
  ]);
});

test("OTP verify preserves missing and expired code short circuits", async () => {
  const missingService = createOtpVerifyService({
    pool: { async query() { return { rows: [] }; } },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  assert.deepEqual(await missingService.verifyOtp({
    phone: "+998901234567",
    code: "654321",
  }), { status: "not-requested" });

  const expiredService = createOtpVerifyService({
    pool: {
      async query() {
        return { rows: [{ code: "hashed-code", expires_at: new Date(Date.now() - 1) }] };
      },
    },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  assert.deepEqual(await expiredService.verifyOtp({
    phone: "+998901234567",
    code: "654321",
  }), { status: "expired" });
});

test("OTP verify preserves invalid-code failure tracking", async () => {
  const calls = [];
  const req = { body: { phone: "+998901234567" } };
  const service = createOtpVerifyService({
    pool: {
      async query() {
        return {
          rows: [{ code: "hashed-code", expires_at: new Date(Date.now() + 60_000) }],
        };
      },
    },
    bcrypt: { async compare() { return false; } },
    noteFail(...args) {
      calls.push(args);
    },
    noteOk: assert.fail,
    phoneIpKey(receivedReq) {
      assert.equal(receivedReq, req);
      return "phone|ip";
    },
  });

  assert.deepEqual(await service.verifyOtp({
    req,
    phone: "+998901234567",
    code: "000000",
  }), { status: "invalid" });
  assert.deepEqual(calls, [["otp_verify", "phone|ip", 5, 15 * 60 * 1000]]);
});

test("OTP verify controller preserves validation and responses", async () => {
  const invalidController = createOtpVerifyController({
    pool: { query: assert.fail },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.verifyOtp(
    { body: { phone: "+998901234567" } },
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "Telefon va kod kiritilishi shart" });

  const missingController = createOtpVerifyController({
    pool: { async query() { return { rows: [] }; } },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  const missingResponse = createResponse();
  await missingController.verifyOtp(
    { body: { phone: "+998901234567", code: "654321" } },
    missingResponse
  );
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Avval tasdiqlash kodini oling" });

  const successController = createOtpVerifyController({
    pool: {
      async query() {
        return { rows: [{ code: "hash", expires_at: new Date(Date.now() + 60_000) }] };
      },
    },
    bcrypt: { async compare() { return true; } },
    noteFail: assert.fail,
    noteOk() {},
    phoneIpKey() { return "phone|ip"; },
  });
  const successResponse = createResponse();
  await successController.verifyOtp(
    { body: { phone: "+998901234567", code: "654321" } },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, { verified: true, message: "Telefon tasdiqlandi" });
});

test("OTP verify controller preserves outer error logging", async () => {
  const controller = createOtpVerifyController({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: { compare: assert.fail },
    noteFail: assert.fail,
    noteOk: assert.fail,
    phoneIpKey: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await controller.verifyOtp(
      { body: { phone: "+998901234567", code: "654321" } },
      response
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["OTP tekshirish xatosi:", "database unavailable"]]);
});

test("OTP verify route preserves path and gate middleware order", () => {
  function otpVerifyGate(req, res, next) { next(); }
  const router = otpVerifyRoutes({
    pool: {},
    bcrypt: {},
    otpVerifyGate,
    noteFail() {},
    noteOk() {},
    phoneIpKey() {},
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/otp/verify");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, requireNormalizedPhone);
  assert.equal(route.stack[1].handle, otpVerifyGate);
  assert.equal(route.stack.length, 3);
});
