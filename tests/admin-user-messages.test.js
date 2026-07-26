const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminUserMessagesController } = require("../src/controllers/adminUserMessagesController");

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

test("admin user messages preserves the query and response", async () => {
  const messages = [{ message: "Salom", room_id: "room-1", created_at: "2026-07-26" }];
  const queries = [];
  const controller = createAdminUserMessagesController({
    pool: {
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: messages };
      },
    },
  });
  const response = createResponse();

  await controller.list({ params: { id: "42" } }, response);

  assert.deepEqual(queries, [[
    "SELECT message, room_id, created_at FROM chat_messages WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 50",
    [42],
  ]]);
  assert.deepEqual(response.body, { messages });
});

test("admin user messages preserves invalid ID validation", async () => {
  const controller = createAdminUserMessagesController({
    pool: { query: async () => { throw new Error("query must not run"); } },
  });
  const response = createResponse();

  await controller.list({ params: { id: "invalid" } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Noto'g'ri ID" });
});

test("admin user messages preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createAdminUserMessagesController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.list({ params: { id: "42" } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Foydalanuvchi xabarlari xatosi:", "database unavailable"]]);
});
