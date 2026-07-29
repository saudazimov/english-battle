const test = require("node:test");
const assert = require("node:assert/strict");
const { requireNormalizedPhone } = require("../src/middleware/requireNormalizedPhone");
const {
  createPasswordResetSendService,
} = require("../src/services/passwordResetSendService");
const {
  createPasswordResetSendController,
} = require("../src/controllers/passwordResetSendController");
const passwordResetSendRoutes = require("../src/routes/passwordResetSendRoutes");

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

test("password reset send preserves SQL, hash, expiry, and SMS order", async () => {
  const calls = [];
  const before = Date.now();
  let queryCount = 0;
  const service = createPasswordResetSendService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        queryCount += 1;
        return queryCount === 1 ? { rows: [{ id: 7 }] } : { rows: [] };
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

  assert.deepEqual(await service.sendResetOtp("+998901234567"), { status: "sent" });
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
  assert.equal(
    calls[4][1],
    "INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)"
  );
  assert.equal(calls[4][2][0], "+998901234567");
  assert.equal(calls[4][2][1], "hashed-code");
  assert.ok(calls[4][2][2] instanceof Date);
  assert.ok(calls[4][2][2].getTime() >= before + 300_000);
  assert.ok(calls[4][2][2].getTime() <= after + 300_000);
  assert.deepEqual(calls[5], ["sms", "+998901234567", "654321"]);
});

test("password reset send preserves unknown-account privacy short circuit", async () => {
  let calls = 0;
  const service = createPasswordResetSendService({
    pool: {
      async query() {
        calls += 1;
        return { rows: [] };
      },
    },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });

  assert.deepEqual(await service.sendResetOtp("+998901234567"), {
    status: "user-not-found",
  });
  assert.equal(calls, 1);
});

test("password reset send preserves stored code and 502 outcome on SMS failure", async () => {
  const calls = [];
  let queryCount = 0;
  const service = createPasswordResetSendService({
    pool: {
      async query(sql) {
        calls.push(["query", sql]);
        queryCount += 1;
        return queryCount === 1 ? { rows: [{ id: 7 }] } : { rows: [] };
      },
    },
    bcrypt: { async hash() { return "hashed-code"; } },
    generateOtpCode() { return "654321"; },
    async sendSms() { throw new Error("provider unavailable"); },
    logger: { error(...args) { calls.push(["error", ...args]); } },
  });

  assert.deepEqual(await service.sendResetOtp("+998901234567"), {
    status: "sms-failed",
  });
  assert.equal(calls.filter(([type]) => type === "query").length, 3);
  assert.deepEqual(calls.at(-1), [
    "error",
    "SMS yuborish xatosi:",
    "provider unavailable",
  ]);
});

test("password reset send controller preserves validation and privacy responses", async () => {
  const invalidController = createPasswordResetSendController({
    pool: { query: assert.fail },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });
  const invalidResponse = createResponse();
  await invalidController.sendResetOtp({ body: { phone: "123" } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.body, { error: "To'g'ri telefon raqamini kiriting" });

  const unknownController = createPasswordResetSendController({
    pool: { async query() { return { rows: [] }; } },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });
  const unknownResponse = createResponse();
  await unknownController.sendResetOtp(
    { body: { phone: "+998901234567" } },
    unknownResponse
  );
  assert.equal(unknownResponse.statusCode, 200);
  assert.deepEqual(unknownResponse.body, {
    message: "Agar hisob mavjud bo'lsa, tasdiqlash kodi yuborildi",
  });
});

test("password reset send controller preserves success and outer error responses", async () => {
  let queryCount = 0;
  const successController = createPasswordResetSendController({
    pool: {
      async query() {
        queryCount += 1;
        return queryCount === 1 ? { rows: [{ id: 7 }] } : { rows: [] };
      },
    },
    bcrypt: { async hash() { return "hashed-code"; } },
    generateOtpCode() { return "654321"; },
    async sendSms() {},
  });
  const successResponse = createResponse();
  await successController.sendResetOtp(
    { body: { phone: "+998901234567" } },
    successResponse
  );
  assert.equal(successResponse.statusCode, 200);
  assert.deepEqual(successResponse.body, { message: "Tasdiqlash kodi yuborildi" });

  const errorController = createPasswordResetSendController({
    pool: { async query() { throw new Error("database unavailable"); } },
    bcrypt: { hash: assert.fail },
    generateOtpCode: assert.fail,
    sendSms: assert.fail,
  });
  const errorResponse = createResponse();
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await errorController.sendResetOtp(
      { body: { phone: "+998901234567" } },
      errorResponse
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(errorResponse.statusCode, 500);
  assert.deepEqual(errorResponse.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Parol tiklash OTP xatosi:", "database unavailable"]]);
});

test("password reset send route preserves path and rate-limit middleware order", () => {
  function otpSendPerIp(req, res, next) { next(); }
  function otpSendPerPhone(req, res, next) { next(); }
  const router = passwordResetSendRoutes({
    pool: {},
    bcrypt: {},
    generateOtpCode() {},
    sendSms() {},
    otpSendPerIp,
    otpSendPerPhone,
  });
  const route = router.stack[0].route;

  assert.equal(route.path, "/password-reset/send");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack[0].handle, requireNormalizedPhone);
  assert.equal(route.stack[1].handle, otpSendPerIp);
  assert.equal(route.stack[2].handle, otpSendPerPhone);
  assert.equal(route.stack.length, 4);
});
