const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotificationDeleteController } = require("../src/controllers/notificationDeleteController");

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

test("notification delete preserves ownership query and response", async () => {
  const queries = [];
  const controller = createNotificationDeleteController({
    pool: {
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: [{ id: 17 }] };
      },
    },
  });
  const response = createResponse();

  await controller.remove({ user: { id: 42 }, params: { notifId: "17" } }, response);

  assert.deepEqual(queries, [[
    "DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id",
    [17, 42],
  ]]);
  assert.deepEqual(response.body, { message: "O'chirildi", id: 17 });
});

test("notification delete preserves invalid ID validation", async () => {
  const controller = createNotificationDeleteController({
    pool: { query: async () => { throw new Error("query must not run"); } },
  });
  const response = createResponse();

  await controller.remove({ user: { id: 42 }, params: { notifId: "invalid" } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri ID" });
});

test("notification delete preserves the not-found response", async () => {
  const controller = createNotificationDeleteController({
    pool: { query: async () => ({ rows: [] }) },
  });
  const response = createResponse();

  await controller.remove({ user: { id: 42 }, params: { notifId: "17" } }, response);

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: "Topilmadi" });
});

test("notification delete preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createNotificationDeleteController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.remove({ user: { id: 42 }, params: { notifId: "17" } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Bildirishnoma o'chirish xatosi:", "database unavailable"]]);
});
