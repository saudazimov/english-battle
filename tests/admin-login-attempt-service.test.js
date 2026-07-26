const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminLoginAttemptService } = require("../src/services/adminLoginAttemptService");

function createHarness() {
  const calls = [];
  const middleware = () => {};
  const service = createAdminLoginAttemptService({
    failGate(name, options) {
      calls.push(["failGate", name, options]);
      return middleware;
    },
    noteFail(...args) {
      calls.push(["noteFail", ...args]);
      return "ignored-fail-result";
    },
    noteOk(...args) {
      calls.push(["noteOk", ...args]);
      return "ignored-ok-result";
    },
    clientIp(req) {
      calls.push(["clientIp", req]);
      return "203.0.113.8";
    },
  });

  return { calls, middleware, service };
}

test("admin login attempt service preserves limiter configuration", () => {
  const { calls, middleware, service } = createHarness();
  const request = { id: "request" };
  const gateCall = calls[0];

  assert.equal(service.adminLoginRateLimit, middleware);
  assert.equal(gateCall[0], "failGate");
  assert.equal(gateCall[1], "admin_login");
  assert.equal(gateCall[2].message, "Juda ko'p admin kirish urinishi.");
  assert.equal(gateCall[2].keyFn(request), "203.0.113.8");
  assert.deepEqual(calls.at(-1), ["clientIp", request]);
});

test("admin login attempt service preserves failed-login threshold and duration", () => {
  const { calls, service } = createHarness();
  const request = { id: "failed-request" };

  const result = service.recordFailedLogin(request);

  assert.equal(result, undefined);
  assert.deepEqual(calls.slice(-2), [
    ["clientIp", request],
    ["noteFail", "admin_login", "203.0.113.8", 5, 15 * 60 * 1000],
  ]);
});

test("admin login attempt service preserves success cleanup", () => {
  const { calls, service } = createHarness();
  const request = { id: "success-request" };

  const result = service.clearLoginAttempts(request);

  assert.equal(result, undefined);
  assert.deepEqual(calls.slice(-2), [
    ["clientIp", request],
    ["noteOk", "admin_login", "203.0.113.8"],
  ]);
});
