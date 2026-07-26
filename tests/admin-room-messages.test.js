const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminRoomMessagesController } = require("../src/controllers/adminRoomMessagesController");

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

test("admin room messages preserves the query and response", async () => {
  const messages = [{ sender_id: 42, sender_name: "Ali", message: "Salom" }];
  const queries = [];
  const controller = createAdminRoomMessagesController({
    pool: {
      query: async (sql, params) => {
        queries.push([sql, params]);
        return { rows: messages };
      },
    },
  });
  const response = createResponse();

  await controller.list({ query: { room: " room-1 " } }, response);

  assert.deepEqual(queries, [[
    "SELECT sender_id, sender_name, message, created_at FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 200",
    ["room-1"],
  ]]);
  assert.deepEqual(response.body, { messages });
});

test("admin room messages preserves missing room validation", async () => {
  const controller = createAdminRoomMessagesController({
    pool: { query: async () => { throw new Error("query must not run"); } },
  });
  const response = createResponse();

  await controller.list({ query: { room: "  " } }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, { error: "Room ID kerak" });
});

test("admin room messages preserves the existing safe error response", async () => {
  const logs = [];
  const controller = createAdminRoomMessagesController({
    pool: { query: async () => { throw new Error("database unavailable"); } },
    logger: { error: (...args) => logs.push(args) },
  });
  const response = createResponse();

  await controller.list({ query: { room: "room-1" } }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { error: "Server xatosi" });
  assert.deepEqual(logs, [["Room xabarlari xatosi:", "database unavailable"]]);
});
