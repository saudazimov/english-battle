const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotificationClearController } = require("../src/controllers/notificationClearController");

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

test("notification clear preserves the authenticated-user query and response", async () => {
  const queries = [];
  const controller = createNotificationClearController({
    pool: { query: async (sql, params) => queries.push([sql, params]) },
  });
  const response = createResponse();

  await controller.clearAll({
    user: { id: 42 },
    params: { userId: "999" },
  }, response);

  assert.deepEqual(queries, [[
    "DELETE FROM notifications WHERE user_id = $1",
    [42],
  ]]);
  assert.deepEqual(response.body, { message: "Barcha xabarlar o'chirildi" });
});

test("notification clear preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createNotificationClearController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.clearAll({ user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Bildirishnomalarni tozalash xatosi:", "database unavailable"]]);
});
