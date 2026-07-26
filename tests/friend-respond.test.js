const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendRespondController } = require("../src/controllers/friendRespondController");

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

function createController(overrides = {}) {
  return createFriendRespondController({
    pool: { async query() { return { rows: [] }; } },
    createNotification: async () => {},
    io: { to() { return { emit() {} }; } },
    onlineUsers: {},
    logger: { error() {} },
    ...overrides,
  });
}

test("friend respond preserves validation without querying the database", async () => {
  let queryCount = 0;
  const controller = createController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
  });
  const res = createResponse();

  await controller.respond({ user: { id: 42 }, body: {} }, res);

  assert.equal(queryCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "Ma'lumot yetishmaydi" });
});

test("friend respond preserves not-found and ownership responses", async () => {
  const notFoundController = createController();
  const notFoundRes = createResponse();
  await notFoundController.respond({ user: { id: 42 }, body: { friendshipId: 10, action: "accept" } }, notFoundRes);
  assert.equal(notFoundRes.statusCode, 404);
  assert.deepEqual(notFoundRes.body, { error: "So'rov topilmadi" });

  const forbiddenController = createController({
    pool: { async query() { return { rows: [{ requester_id: 7, receiver_id: 9 }] }; } },
  });
  const forbiddenRes = createResponse();
  await forbiddenController.respond({ user: { id: 42 }, body: { friendshipId: 10, action: "accept" } }, forbiddenRes);
  assert.equal(forbiddenRes.statusCode, 403);
  assert.deepEqual(forbiddenRes.body, { error: "Bu so'rov sizga tegishli emas" });
});

test("friend respond preserves accept update and notification behavior", async () => {
  const queries = [];
  const notifications = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ requester_id: 7, receiver_id: 42 }] };
      if (queries.length === 2) return { rows: [] };
      return { rows: [{ first_name: "Ali", last_name: "Karimov" }] };
    },
  };
  const controller = createController({
    pool,
    async createNotification(...args) { notifications.push(args); },
  });
  const res = createResponse();

  await controller.respond({ user: { id: 42 }, body: { friendshipId: 10, action: "accept" } }, res);

  assert.equal(queries[0].sql, "SELECT requester_id, receiver_id FROM friendships WHERE id = $1");
  assert.deepEqual(queries[0].params, [10]);
  assert.equal(queries[1].sql, "UPDATE friendships SET status = 'accepted' WHERE id = $1");
  assert.deepEqual(queries[1].params, [10]);
  assert.equal(queries[2].sql, "SELECT first_name, last_name FROM users WHERE id = $1");
  assert.deepEqual(queries[2].params, [42]);
  assert.deepEqual(notifications, [[7, "friend_accepted", "Ali Karimov do'st so'rovingizni qabul qildi"]]);
  assert.deepEqual(res.body, { message: "Do'st qo'shildi!" });
});

test("friend respond preserves non-accept delete and socket event behavior", async () => {
  const queries = [];
  const events = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [{ requester_id: 7, receiver_id: 42 }] };
      if (queries.length === 2) return { rows: [] };
      return { rows: [{ first_name: "Ali", last_name: "Karimov" }] };
    },
  };
  const controller = createController({
    pool,
    onlineUsers: { "7": "socket-7" },
    io: {
      to(socketId) {
        return {
          emit(event, payload) { events.push({ socketId, event, payload }); },
        };
      },
    },
  });
  const res = createResponse();

  await controller.respond({ user: { id: 42 }, body: { friendshipId: 10, action: "unexpected" } }, res);

  assert.equal(queries[1].sql, "DELETE FROM friendships WHERE id = $1");
  assert.deepEqual(queries[1].params, [10]);
  assert.equal(queries[2].sql, "SELECT first_name, last_name FROM users WHERE id = $1");
  assert.deepEqual(events, [{
    socketId: "socket-7",
    event: "requestResponded",
    payload: { action: "unexpected", byUserId: 42, byName: "Ali Karimov" },
  }]);
  assert.deepEqual(res.body, { message: "So'rov rad etildi" });
});

test("friend respond preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.respond({ user: { id: 42 }, body: { friendshipId: 10, action: "accept" } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["So'rovga javob xatosi:", "database unavailable"]]);
});
