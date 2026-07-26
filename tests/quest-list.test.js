const test = require("node:test");
const assert = require("node:assert/strict");

const { authMiddleware } = require("../auth");
const {
  createQuestListController,
} = require("../src/controllers/questListController");
const createQuestListRoutes = require("../src/routes/questListRoutes");

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

function createHarness({ serviceError } = {}) {
  const calls = [];
  const quests = [{ id: 1, title: "Quest" }];
  const controller = createQuestListController({
    async getOrCreateDailyQuests(userId) {
      calls.push(["quests", userId]);
      if (serviceError) throw serviceError;
      return quests;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { calls, controller, quests };
}

test("quest list preserves authenticated user ID and response reference", async () => {
  const harness = createHarness();
  const response = createResponse();

  await harness.controller.list({ user: { id: 42 } }, response);

  assert.deepEqual(harness.calls, [["quests", 42]]);
  assert.equal(response.body.quests, harness.quests);
});

test("quest list preserves service error logging and response", async () => {
  const harness = createHarness({ serviceError: new Error("service failed") });
  const response = createResponse();

  await harness.controller.list({ user: { id: 42 } }, response);

  assert.deepEqual(harness.calls, [
    ["quests", 42],
    ["error", "Quests xatosi:", "service failed"],
  ]);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
});

test("quest list route preserves path, method, and middleware order", () => {
  const router = createQuestListRoutes({ getOrCreateDailyQuests() {} });

  assert.equal(router.stack.length, 1);
  const route = router.stack[0].route;
  assert.equal(route.path, "/quests");
  assert.equal(route.methods.post, true);
  assert.equal(route.stack.length, 2);
  assert.equal(route.stack[0].handle, authMiddleware);
});
