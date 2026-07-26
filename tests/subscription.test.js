const test = require("node:test");
const assert = require("node:assert/strict");
const { createSubscriptionController } = require("../src/controllers/subscriptionController");

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

test("current subscription preserves the premium response", async () => {
  const expiresAt = "2026-08-25T00:00:00.000Z";
  const controller = createSubscriptionController({
    premium: {
      getUserPlan: async (userId) => {
        assert.equal(userId, 42);
        return { plan: "student_premium", status: "active", expires_at: expiresAt };
      },
    },
  });
  const response = createResponse();

  await controller.current({ user: { id: 42 } }, response);

  assert.deepEqual(response.body, {
    is_premium: true,
    plan: "student_premium",
    status: "active",
    expires_at: expiresAt,
  });
});

test("current subscription preserves the free response", async () => {
  const controller = createSubscriptionController({
    premium: { getUserPlan: async () => null },
  });
  const response = createResponse();

  await controller.current({ user: { id: 42 } }, response);

  assert.deepEqual(response.body, {
    is_premium: false,
    plan: null,
    status: "free",
    expires_at: null,
  });
});

test("current subscription preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createSubscriptionController({
    premium: { getUserPlan: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.current({ user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Subscription holat xatosi:", "database unavailable"]]);
});
