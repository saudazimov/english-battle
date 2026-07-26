const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotificationListController } = require("../src/controllers/notificationListController");

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

test("notification list preserves ownership query, order and unread count", async () => {
  const notifications = [
    { id: 2, is_read: false },
    { id: 1, is_read: true },
    { id: 3, is_read: false },
  ];
  const queries = [];
  const controller = createNotificationListController({
    pool: {
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: notifications };
      },
    },
  });
  const response = createResponse();

  await controller.list({
    user: { id: 42 },
    params: { userId: "999" },
  }, response);

  assert.deepEqual(queries, [[
    `SELECT id, type, message, is_read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
    [42],
  ]]);
  assert.deepEqual(response.body, { notifications, unread: 2 });
});

test("notification list preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createNotificationListController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.list({ user: { id: 42 } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Bildirishnoma olish xatosi:", "database unavailable"]]);
});
