const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotificationReadController } = require("../src/controllers/notificationReadController");

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

test("notification read preserves the authenticated-user query and response", async () => {
  const queries = [];
  const controller = createNotificationReadController({
    pool: { query: async (sql, params) => queries.push([sql, params]) },
  });
  const response = createResponse();

  await controller.markAllRead({
    user: { id: 42 },
    params: { userId: "999" },
  }, response);

  assert.deepEqual(queries, [[
    "UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE",
    [42],
  ]]);
  assert.deepEqual(response.body, { message: "O'qilgan deb belgilandi" });
});

test("notification read preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createNotificationReadController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.markAllRead({ user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Bildirishnoma o'qish xatosi:", "database unavailable"]]);
});
