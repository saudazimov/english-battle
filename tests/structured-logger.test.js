"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStructuredLogger,
  productionLogger,
  sanitizeLogValue,
} = require("../src/utils/structuredLogger");

test("development logger preserves existing console arguments", () => {
  const calls = [];
  const output = { log: (...args) => calls.push(args) };
  const logger = createStructuredLogger({ environment: { NODE_ENV: "development" }, output });
  const context = { value: 1 };

  logger.log("message", context);
  assert.deepEqual(calls, [["message", context]]);
});

test("production logger emits JSON and redacts secrets recursively", () => {
  const errors = [];
  const output = { error: (line) => errors.push(line) };
  const logger = createStructuredLogger({
    environment: { NODE_ENV: "production" },
    output,
    now: () => new Date("2026-07-30T10:00:00.000Z"),
  });
  const error = new Error("authorization=Bearer raw-auth-value");

  logger.error("Request failed password=hunter2", {
    authorization: "Bearer raw-bearer-value",
    accessToken: "raw-access-token",
    PAYME_KEY: "raw-payme-value",
    profile: { phoneNumber: "+998901234567", label: "safe" },
    otp: "123456",
    error,
  });

  assert.equal(errors.length, 1);
  const serialized = errors[0];
  const entry = JSON.parse(serialized);
  assert.equal(entry.timestamp, "2026-07-30T10:00:00.000Z");
  assert.equal(entry.level, "error");
  assert.equal(entry.service, "ilmliga");
  assert.match(entry.message, /\[REDACTED\]/);
  assert.equal(entry.context.authorization, "[REDACTED]");
  assert.equal(entry.context.accessToken, "[REDACTED]");
  assert.equal(entry.context.PAYME_KEY, "[REDACTED]");
  assert.equal(entry.context.profile.phoneNumber, "[REDACTED]");
  assert.equal(entry.context.otp, "[REDACTED]");
  assert.equal(entry.context.profile.label, "safe");
  for (const secret of ["hunter2", "raw-auth-value", "raw-bearer-value", "raw-access-token", "raw-payme-value", "+998901234567", "123456"]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(/[+]/g, "\\+")));
  }
});

test("sanitizer handles circular values and production logger is not double wrapped", () => {
  const circular = { safe: true };
  circular.self = circular;
  assert.deepEqual(sanitizeLogValue(circular), { safe: true, self: "[CIRCULAR]" });
  assert.equal(sanitizeLogValue(42n), "42");

  const output = { log() {}, info() {}, warn() {}, error() {} };
  const environment = { NODE_ENV: "production" };
  const logger = productionLogger(output, environment);
  assert.equal(productionLogger(logger, environment), logger);
});
