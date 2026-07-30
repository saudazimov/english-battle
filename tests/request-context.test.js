"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createRequestContextMiddleware,
  incomingRequestId,
} = require("../src/middleware/requestContext");

test("request context accepts only bounded safe incoming IDs", () => {
  assert.equal(incomingRequestId({ headers: { "x-request-id": "safe-id_123" } }), "safe-id_123");
  assert.equal(incomingRequestId({ headers: { "x-request-id": "bad id\nvalue" } }), null);
  assert.equal(incomingRequestId({ headers: { "x-request-id": "short" } }), null);
  assert.equal(incomingRequestId({ headers: { "x-request-id": "a".repeat(129) } }), null);
});

test("production request context sets header and logs one sanitized completion", () => {
  const handlers = {};
  const headers = {};
  const logs = [];
  const times = [1000, 1025];
  let nextCount = 0;
  const middleware = createRequestContextMiddleware({
    environment: { NODE_ENV: "production" },
    logger: { info: (...args) => logs.push(args) },
    randomUUID: () => "generated-request-id",
    now: () => times.shift(),
  });
  const req = {
    method: "GET",
    originalUrl: "/api/profile?token=raw-token",
    headers: { "x-request-id": "invalid id" },
  };
  const res = {
    statusCode: 200,
    writableEnded: true,
    setHeader: (name, value) => { headers[name] = value; },
    once: (event, handler) => { handlers[event] = handler; },
  };

  middleware(req, res, () => { nextCount += 1; });
  handlers.finish();
  handlers.close();

  assert.equal(nextCount, 1);
  assert.equal(req.requestId, "generated-request-id");
  assert.equal(headers["X-Request-ID"], "generated-request-id");
  assert.deepEqual(logs, [["HTTP request completed", {
    requestId: "generated-request-id",
    method: "GET",
    path: "/api/profile",
    statusCode: 200,
    durationMs: 25,
    aborted: false,
  }]]);
});

test("development request context keeps correlation without access logging", () => {
  let listenerCount = 0;
  const middleware = createRequestContextMiddleware({
    environment: { NODE_ENV: "development" },
    logger: { info: () => { throw new Error("must not log"); } },
  });
  const req = { headers: { "x-request-id": "client-id-123" } };
  const res = {
    setHeader() {},
    once: () => { listenerCount += 1; },
  };

  middleware(req, res, () => {});
  assert.equal(req.requestId, "client-id-123");
  assert.equal(listenerCount, 0);
});
