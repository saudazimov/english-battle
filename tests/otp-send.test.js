const test = require("node:test");
const assert = require("node:assert/strict");
const { requireNormalizedPhone } = require("../src/middleware/requireNormalizedPhone");
const { createOtpSendService } = require("../src/services/otpSendService");
const { createOtpSendController } = require("../src/controllers/otpSendController");
const otpSendRoutes = require("../src/routes/otpSendRoutes");

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

test("OTP send preserves SQL, hash, expiry, and SMS order", async () => {
  const calls = [];
  const before = Date.now();
  const service = createOtpSendService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        return { rows: [] };
      },
    },
    bcrypt: {
      async hash(code, rounds) {
        calls.push(["hash", code, rounds]);
        return "hashed-code";
      },
    },
    generateOtpCode() {
      calls.push(["generate"]);
      return "654321";
    },
    async sendSms(phone, code) {
      calls.push(["sms", phone, code]);
    },
  });

  assert.deepEqual(await service.sendOtp("+998901234567"), { status: "sent" });
  const after = Date.now();

  assert.deepEqual(calls[0], [
    "query",
    "SELECT id FROM users WHERE phone = $1",
    ["+998901234567"],
  ]);
  assert.deepEqual(calls[1], ["generate"]);
  assert.deepEqual(calls[2], ["hash", "654321", 10]);
  assert.deepEqual(calls[3], [
    "query",
    "DELETE FROM otp_codes WHERE phone = $1",
    ["+998901234567"],
  ]);
  assert.equal(calls[4][0], "query");
  assert.equal(calls[4][1], "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)");
  assert.equal(calls[4][2][0], "+998901234567");
  assert.equal(calls[4][2][1], "hashed-code");
  assert.ok(calls[4][2][2] instanceof Date);
  assert.ok(calls[4][2][2].getTime() >= before + 300_000);
  assert.ok(calls[4][2][2].getTime() <= after + 300_000);
  assert.deepEqual(calls[5], ["sms", "+998901234567", "654321"]);
});

test("OTP send preserves registered-user short circuit", async () => {
  const service = createOtpSendService({
    pool: { async query() { return { rows: [{ id: 1 }] }; } },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });

  assert.deepEqual(await service.sendOtp("+998901234567"), {
    status: "already-registered",
  });
});

test("OTP send preserves stored code and 502 outcome when SMS fails", async () => {
  const calls = [];
  const smsFailure = new Error("provider unavailable");
  const service = createOtpSendService({
    pool: {
      async query(sql) {
        calls.push(["query", sql]);
        return { rows: [] };
      },
    },
    bcrypt: { async hash() { return "hashed-code"; } },
    generateOtpCode() { return "654321"; },
    async sendSms() { throw smsFailure; },
    logger: { error(...args) { calls.push(["error", ...args]); } },
  });

  assert.deepEqual(await service.sendOtp("+998901234567"), { status: "sms-failed" });
  assert.equal(calls.filter(([type]) => type === "query").length, 3);
  assert.deepEqual(calls.at(-1), ["error", "SMS yuborish xatosi:", "provider unavailable"]);
});

test("OTP send controller preserves validation and responses", async () => {
  const invalidController = createOtpSendController({
    pool: { query: assert.fail },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.sendOtp({ body: { phone: "123" } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "To'g'ri telefon raqamini kiriting" });

  const registeredController = createOtpSendController({
    pool: { async query() { return { rows: [{ id: 1 }] }; } },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });
  const registeredResponse = createResponse();
  await registeredController.sendOtp(
    { body: { phone: "+998901234567" } },
    registeredResponse
  );
  assert.equal(registeredResponse.statusCode, 400);
  assert.deepEqual(registeredResponse.body, {
    error: "Bu telefon raqami allaqachon ro'yxatdan o'tgan",
  });

  const successController = createOtpSendController({
    pool: { async query() { return { rows: [] }; } },
    bcrypt: { async hash() { return "hashed-code"; } },
    generateOtpCode() { return "654321"; },
    async sendSms() {},
  });
  const successResponse = createResponse();
  await successController.sendOtp(
    { body: { phone: "+998901234567" } },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, { message: "Tasdiqlash kodi yuborildi" });
});

test("OTP send controller preserves outer error logging", async () => {
  const controller = createOtpSendController({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });
  const response = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await controller.sendOtp({ body: { phone: "+998901234567" } }, response);
  } finally {
    console.error = originalError;
  }

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["OTP yuborish xatosi:", "database unavailable"]]);
});

test("OTP send route preserves path and rate-limit middleware order", () => {
  function otpSendPerIp(req, res, next) { next(); }
  function otpSendPerPhone(req, res, next) { next(); }
  const router = otpSendRoutes({
    pool: {},
    bcrypt: {},
    generateOtpCode() {},
    sendSms() {},
    otpSendPerIp,
    otpSendPerPhone,
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/otp/send");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, requireNormalizedPhone);
  assert.equal(route.stack[1].handle, otpSendPerIp);
  assert.equal(route.stack[2].handle, otpSendPerPhone);
  assert.equal(route.stack.length, 4);
});
