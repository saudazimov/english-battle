const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdmin } = require("../auth");
const {
  createDevSubscriptionActivateController,
} = require("../src/controllers/devSubscriptionActivateController");
const createDevSubscriptionActivateRoutes = require("../src/routes/devSubscriptionActivateRoutes");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
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

function createHarness({ grantError, auditError } = {}) {
  const calls = [];
  const subscription = { plan: "pro", active: true };
  const controller = createDevSubscriptionActivateController({
    premium: {
      async grantSubscription(...args) {
        calls.push(["grant", ...args]);
        if (grantError) throw grantError;
        return subscription;
      },
    },
    async logAudit(...args) {
      calls.push(["audit", ...args]);
      if (auditError) throw auditError;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, subscription };
}

test("dev subscription activate preserves required-field validation", async () => {
  const cases = [
    { user_id: "", plan: "pro", days: 30 },
    { user_id: 42, plan: "", days: 30 },
    { user_id: 42, plan: "pro", days: 0 },
  ];

  for (const body of cases) {
    const harness = createHarness();
    const response = createResponse();
    const result = await harness.controller.activate({ body }, response);

    assert.equal(result, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: "user_id, plan, days kerak" });
    assert.deepEqual(harness.calls, []);
  }
});

test("dev subscription activate preserves parsing, audit values, and response order", async () => {
  const harness = createHarness();
  const response = createResponse();
  const request = {
    body: { user_id: "42abc", plan: "pro", days: "30days" },
  };

  await harness.controller.activate(request, response);

  assert.deepEqual(harness.calls, [
    ["grant", 42, "pro", 30],
    [
      "audit",
      request,
      "subscription_granted",
      {
        entityType: "user",
        entityId: "42abc",
        details: "pro — 30days kun",
      },
    ],
  ]);
  assert.deepEqual(response.body, {
    success: true,
    subscription: harness.subscription,
  });
});

test("dev subscription activate preserves grant and audit error responses", async () => {
  const cases = [
    [
      { grantError: new Error("grant failed") },
      ["grant", "error"],
      "grant failed",
    ],
    [
      { auditError: new Error("audit failed") },
      ["grant", "audit", "error"],
      "audit failed",
    ],
  ];

  for (const [options, order, message] of cases) {
    const harness = createHarness(options);
    const response = createResponse();

    await harness.controller.activate(
      { body: { user_id: "42", plan: "pro", days: "30" } },
      response
    );

    assert.deepEqual(harness.calls.map((call) => call[0]), order);
    assert.deepEqual(harness.calls.at(-1), [
      "error",
      "Obuna aktivlashtirish xatosi:",
      message,
    ]);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, { error: message });
  }
});

test("dev subscription activate route preserves path, method, and middleware order", () => {
  const router = createDevSubscriptionActivateRoutes({
    premium: {},
    logAudit() {},
  });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/dev/subscription/activate");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, requireAdmin);
});
