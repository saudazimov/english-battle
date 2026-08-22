const test = require("node:test");
const assert = require("node:assert/strict");

const { createSmsService } = require("../src/services/smsService");

function response({ ok = true, status = 200, data = {} } = {}) {
  return {
    ok,
    status,
    async json() {
      return data;
    },
  };
}

function createHarness({ environment = {}, responses = [] } = {}) {
  const fetchCalls = [];
  const logs = [];
  const queue = responses.slice();
  const sendSms = createSmsService({
    environment,
    async fetchFn(url, options) {
      fetchCalls.push({ url, options });
      return queue.shift();
    },
    logger: {
      log(...args) { logs.push(["log", ...args]); },
      error(...args) { logs.push(["error", ...args]); },
    },
  });
  return { fetchCalls, logs, sendSms };
}

test("SMS service preserves credential-free development output", async () => {
  const harness = createHarness();

  assert.equal(await harness.sendSms("+998 (90) 123-45-67", "123456"), undefined);

  assert.deepEqual(harness.fetchCalls, []);
  assert.deepEqual(harness.logs, [
    ["log", "========================================"],
    ["log", "📱 SMS (DEV rejim — Eskiz kredensiali yo'q)"],
    ["log", "   Telefon: +998901234567"],
    ["log", "   Kod: 123456"],
    ["log", "========================================"],
  ]);
});

test("disabled production SMS rejects without exposing OTP", async () => {
  const harness = createHarness({
    environment: { NODE_ENV: "production", SMS_ENABLED: "false" },
  });

  await assert.rejects(harness.sendSms("998901234567", "123456"), {
    code: "SMS_DISABLED",
    message: "SMS xizmati vaqtincha o'chirilgan",
  });
  assert.deepEqual(harness.fetchCalls, []);
  assert.deepEqual(harness.logs, []);
});

test("SMS service preserves login, send request, and token cache", async () => {
  const harness = createHarness({
    environment: { ESKIZ_EMAIL: "user@example.com", ESKIZ_PASSWORD: "secret" },
    responses: [
      response({ data: { data: { token: "cached-token" } } }),
      response({ data: { id: "sms-1" } }),
      response({ data: { status: "success" } }),
    ],
  });

  await harness.sendSms("+998 90 111 22 33", "111111");
  await harness.sendSms("998902223344", "222222");

  assert.equal(harness.fetchCalls.length, 3);
  assert.equal(harness.fetchCalls[0].url, "https://notify.eskiz.uz/api/auth/login");
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].options.body), {
    email: "user@example.com",
    password: "secret",
  });
  assert.equal(harness.fetchCalls[1].url, "https://notify.eskiz.uz/api/message/sms/send");
  assert.equal(harness.fetchCalls[1].options.headers.Authorization, "Bearer cached-token");
  assert.deepEqual(JSON.parse(harness.fetchCalls[1].options.body), {
    mobile_phone: "998901112233",
    message: "IlmLiga: tasdiqlash kodingiz 111111. Kodni hech kimga bermang.",
    from: "4546",
  });
  assert.equal(harness.fetchCalls[2].options.headers.Authorization, "Bearer cached-token");
});

test("SMS service preserves one re-login and retry after 401", async () => {
  const harness = createHarness({
    environment: {
      ESKIZ_EMAIL: "user@example.com",
      ESKIZ_PASSWORD: "secret",
      ESKIZ_FROM: "EnglishBattle",
    },
    responses: [
      response({ data: { data: { token: "old-token" } } }),
      response({ ok: false, status: 401 }),
      response({ data: { data: { token: "new-token" } } }),
      response({ data: { id: "retried-sms" } }),
    ],
  });

  await harness.sendSms("998901234567", "654321");

  assert.deepEqual(harness.fetchCalls.map((call) => call.url), [
    "https://notify.eskiz.uz/api/auth/login",
    "https://notify.eskiz.uz/api/message/sms/send",
    "https://notify.eskiz.uz/api/auth/login",
    "https://notify.eskiz.uz/api/message/sms/send",
  ]);
  assert.equal(harness.fetchCalls[1].options.headers.Authorization, "Bearer old-token");
  assert.equal(harness.fetchCalls[3].options.headers.Authorization, "Bearer new-token");
  assert.equal(JSON.parse(harness.fetchCalls[3].options.body).from, "EnglishBattle");
});

test("SMS service preserves Eskiz login error", async () => {
  const harness = createHarness({
    environment: { ESKIZ_EMAIL: "bad", ESKIZ_PASSWORD: "bad" },
    responses: [response({ ok: false, status: 422, data: { message: "Invalid login" } })],
  });

  await assert.rejects(harness.sendSms("998901234567", "123456"), {
    message: "Eskiz login xatosi: Invalid login",
  });
  assert.deepEqual(harness.logs, []);
});

test("SMS service preserves logged provider error and generic thrown message", async () => {
  const harness = createHarness({
    environment: { ESKIZ_EMAIL: "user", ESKIZ_PASSWORD: "secret" },
    responses: [
      response({ data: { data: { token: "token" } } }),
      response({ data: { status: "error", message: "Provider rejected" } }),
    ],
  });

  await assert.rejects(harness.sendSms("998901234567", "123456"), {
    message: "SMS yuborib bo'lmadi",
  });
  assert.deepEqual(harness.logs, [
    ["error", "Eskiz SMS xatosi:", "Provider rejected"],
  ]);
});
