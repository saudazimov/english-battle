const test = require("node:test");
const assert = require("node:assert/strict");

const { createPersistentRateLimitService } = require("../src/services/persistentRateLimitService");

function createResponse() {
  const calls = [];
  return {
    calls,
    status(code) {
      calls.push(["status", code]);
      return this;
    },
    json(payload) {
      calls.push(["json", payload]);
      return "response-result";
    },
  };
}

function createHarness(queryImpl) {
  const queries = [];
  const logs = [];
  const service = createPersistentRateLimitService({
    pool: {
      query(sql, params) {
        queries.push({ sql, params });
        return queryImpl(sql, params, queries.length);
      },
    },
    clientIp(req) {
      return req.ipValue;
    },
    logger: {
      error(...args) { logs.push(args); },
    },
  });
  return { logs, queries, service };
}

test("persistent rate limit preserves IP and phone key behavior", () => {
  const harness = createHarness(() => Promise.resolve({ rows: [] }));

  assert.equal(harness.service.ipOf({ ipValue: "203.0.113.5" }), "203.0.113.5");
  assert.equal(
    harness.service.phoneIpKey({ body: { phone: "  +99890  " }, ipValue: "203.0.113.5" }),
    "+99890|203.0.113.5"
  );
  assert.equal(
    harness.service.phoneIpKey({ body: { phone: 0 }, ipValue: "203.0.113.5" }),
    "no-phone|203.0.113.5"
  );
});

test("count limiter preserves allowed request SQL and key truncation", async () => {
  const harness = createHarness(() => Promise.resolve({
    rows: [{ request_count: 1, blocked_until: null }],
  }));
  const nextCalls = [];
  const middleware = harness.service.countLimiter("bucket", {
    keyFn: () => "x".repeat(300),
    max: 5,
    windowMs: 60000,
    blockMs: 120000,
  });

  await middleware({}, createResponse(), () => nextCalls.push("next"));

  assert.deepEqual(nextCalls, ["next"]);
  assert.match(harness.queries[0].sql, /INSERT INTO request_rate_limits/);
  assert.deepEqual(harness.queries[0].params, ["bucket", "x".repeat(240), 60000]);
});

test("count limiter preserves existing-block 429 response", async () => {
  const blockedUntil = new Date(Date.now() + 120000);
  const harness = createHarness(() => Promise.resolve({
    rows: [{ request_count: 2, blocked_until: blockedUntil }],
  }));
  const responseObject = createResponse();
  const nextCalls = [];
  const middleware = harness.service.countLimiter("bucket", {
    keyFn: () => "key",
    max: 5,
    windowMs: 60000,
    blockMs: 120000,
    message: "Bloklangan.",
  });

  assert.equal(await middleware({}, responseObject, () => nextCalls.push("next")), "response-result");
  assert.deepEqual(responseObject.calls[0], ["status", 429]);
  assert.match(responseObject.calls[1][1].error, /^Bloklangan\. 2 daqiqadan/);
  assert.deepEqual(nextCalls, []);
  assert.equal(harness.queries.length, 1);
});

test("count limiter preserves over-limit update and configured block duration", async () => {
  const harness = createHarness((sql, params, callNumber) => {
    if (callNumber === 1) return Promise.resolve({ rows: [{ request_count: "6", blocked_until: null }] });
    return Promise.resolve({ rows: [] });
  });
  const responseObject = createResponse();
  const middleware = harness.service.countLimiter("bucket", {
    keyFn: () => "key",
    max: 5,
    windowMs: 60000,
    blockMs: 90000,
  });

  await middleware({}, responseObject, () => assert.fail("next must not run"));

  assert.match(harness.queries[1].sql, /^UPDATE request_rate_limits SET blocked_until/);
  assert.deepEqual(harness.queries[1].params, ["bucket", "key", 90000]);
  assert.equal(responseObject.calls[1][1].error, "Juda ko'p so'rov. 2 daqiqadan keyin urinib ko'ring.");
});

test("count limiter preserves fail-open database error handling", async () => {
  const harness = createHarness(() => Promise.reject(new Error("db down")));
  const nextCalls = [];
  const middleware = harness.service.countLimiter("bucket", {
    keyFn: () => "key",
    max: 1,
    windowMs: 1000,
    blockMs: 1000,
  });

  await middleware({}, createResponse(), () => nextCalls.push("next"));

  assert.deepEqual(harness.logs, [["Rate limit DB xatosi:", "db down"]]);
  assert.deepEqual(nextCalls, ["next"]);
});

test("fail gate preserves blocked and allowed paths", async () => {
  const blockedUntil = new Date(Date.now() + 60000);
  const results = [
    { rows: [{ blocked_until: blockedUntil }] },
    { rows: [] },
  ];
  const harness = createHarness(() => Promise.resolve(results.shift()));
  const middleware = harness.service.failGate("login", {
    keyFn: () => "key",
    message: "Ko'p xato.",
  });
  const blockedResponse = createResponse();
  const nextCalls = [];

  await middleware({}, blockedResponse, () => nextCalls.push("blocked-next"));
  await middleware({}, createResponse(), () => nextCalls.push("allowed-next"));

  assert.deepEqual(harness.queries[0].params, ["login", "key"]);
  assert.deepEqual(blockedResponse.calls[0], ["status", 429]);
  assert.match(blockedResponse.calls[1][1].error, /^Ko'p xato\. 1 daqiqadan/);
  assert.deepEqual(nextCalls, ["allowed-next"]);
});

test("fail gate preserves fail-open database error handling", async () => {
  const harness = createHarness(() => Promise.reject(new Error("gate down")));
  const nextCalls = [];
  const middleware = harness.service.failGate("login", { keyFn: () => "key" });

  await middleware({}, createResponse(), () => nextCalls.push("next"));

  assert.deepEqual(harness.logs, [["Rate limit gate DB xatosi:", "gate down"]]);
  assert.deepEqual(nextCalls, ["next"]);
});

test("noteFail and noteOk preserve fire-and-forget SQL and truncation", async () => {
  const harness = createHarness(() => Promise.resolve({ rows: [] }));

  assert.equal(harness.service.noteFail("login", "f".repeat(300), 8, 900000), undefined);
  assert.equal(harness.service.noteOk("login", "o".repeat(300)), undefined);
  await Promise.resolve();

  assert.match(harness.queries[0].sql, /ON CONFLICT \(bucket, key_value\) DO UPDATE/);
  assert.deepEqual(harness.queries[0].params, ["login", "f".repeat(240), 8, 900000]);
  assert.match(harness.queries[1].sql, /^DELETE FROM request_rate_limits/);
  assert.deepEqual(harness.queries[1].params, ["login", "o".repeat(240)]);
});

test("noteFail and noteOk preserve asynchronous error logging", async () => {
  const errors = [new Error("fail write"), new Error("cleanup write")];
  const harness = createHarness(() => Promise.reject(errors.shift()));

  harness.service.noteFail("login", "key", 5, 1000);
  harness.service.noteOk("login", "key");
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.logs, [
    ["Rate limit fail yozish xatosi:", "fail write"],
    ["Rate limit tozalash xatosi:", "cleanup write"],
  ]);
});
