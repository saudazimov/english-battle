const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createUsernameAvailabilityController,
} = require("../src/controllers/usernameAvailabilityController");
const usernameAvailabilityRoutes = require("../src/routes/usernameAvailabilityRoutes");

const usernameRegex = /^[a-z0-9_]{5,32}$/;

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

function createHarness(rows = [], options = {}) {
  const calls = [];
  const controller = createUsernameAvailabilityController({
    pool: {
      async query(sql, params) {
        calls.push([sql, params]);
        if (options.error) throw options.error;
        return { rows };
      },
    },
    usernameRegex,
    logger: options.logger,
  });
  return { calls, controller };
}

test("username availability preserves missing and invalid-format responses", async () => {
  const harness = createHarness();
  const missingResponse = createResponse();
  await harness.controller.check({ body: {} }, missingResponse);
  assert.equal(missingResponse.statusCode, 400);
  assert.deepEqual(missingResponse.body, { error: "Username kiritilmadi" });

  const invalidResponse = createResponse();
  await harness.controller.check({ body: { username: "ab-c" } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 200);
  assert.deepEqual(invalidResponse.body, {
    available: false,
    reason: "format",
    message: "Username 5-32 belgi bo'lishi va faqat a-z, 0-9, _ belgilaridan iborat bo'lishi kerak",
  });
  assert.deepEqual(harness.calls, []);
});

test("username availability preserves normalization, SQL, and available response", async () => {
  const harness = createHarness([]);
  const response = createResponse();

  await harness.controller.check({ body: { username: "  Ali_12  " } }, response);

  assert.deepEqual(harness.calls, [[
    "SELECT id FROM users WHERE username = $1",
    ["ali_12"],
  ]]);
  assert.deepEqual(response.body, {
    available: true,
    message: "Username bo'sh",
  });
});

test("username availability preserves taken response", async () => {
  const harness = createHarness([{ id: 7 }]);
  const response = createResponse();

  await harness.controller.check({ body: { username: "taken_name" } }, response);

  assert.deepEqual(response.body, {
    available: false,
    message: "Username band",
  });
});

test("username availability preserves database error logging and response", async () => {
  const logs = [];
  const harness = createHarness([], {
    error: new Error("database failed"),
    logger: { error(...args) { logs.push(args); } },
  });
  const response = createResponse();

  await harness.controller.check({ body: { username: "valid_name" } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Username tekshirish xatosi:", "database failed"]]);
});

test("username availability route preserves path and limiter order", () => {
  function limiter(req, res, next) { next(); }
  const router = usernameAvailabilityRoutes({
    pool: {},
    usernameLookupLimiter: limiter,
    usernameRegex,
  });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/check-username");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, limiter);
});
