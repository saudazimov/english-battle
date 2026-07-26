const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendRequestController } = require("../src/controllers/friendRequestController");

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
  return createFriendRequestController({
    pool: { async query() { return { rows: [] }; } },
    createNotification: async () => {},
    io: { to() { return { emit() {} }; } },
    onlineUsers: {},
    logger: { log() {}, error() {} },
    ...overrides,
  });
}

test("friend request preserves missing and self-request validation", async () => {
  let queryCount = 0;
  const controller = createController({
    pool: { async query() { queryCount += 1; return { rows: [] }; } },
  });
  const missingRes = createResponse();
  const selfRes = createResponse();

  await controller.send({ user: { id: 42 }, body: {} }, missingRes);
  await controller.send({ user: { id: 42 }, body: { receiverId: "42" } }, selfRes);

  assert.equal(queryCount, 0);
  assert.equal(missingRes.statusCode, 400);
  assert.deepEqual(missingRes.body, { error: "receiverId kerak" });
  assert.equal(selfRes.statusCode, 400);
  assert.deepEqual(selfRes.body, { error: "O'zingizga so'rov yubora olmaysiz" });
});

test("friend request preserves existing accepted and pending responses", async () => {
  for (const [status, error] of [
    ["accepted", "Siz allaqachon do'stsiz"],
    ["pending", "So'rov allaqachon yuborilgan"],
  ]) {
    const queries = [];
    const controller = createController({
      pool: {
        async query(sql, params) {
          queries.push({ sql, params });
          return { rows: [{ status }] };
        },
      },
    });
    const res = createResponse();

    await controller.send({ user: { id: 42 }, body: { receiverId: 7 } }, res);

    assert.equal(queries.length, 1);
    assert.equal(
      queries[0].sql,
      `SELECT * FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`
    );
    assert.deepEqual(queries[0].params, [42, 7]);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
  }
});

test("friend request preserves insert, notification and socket event behavior", async () => {
  const queries = [];
  const notifications = [];
  const events = [];
  const logs = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (queries.length === 1) return { rows: [] };
      if (queries.length === 2) return { rows: [] };
      return { rows: [{ first_name: "Ali", last_name: "Karimov" }] };
    },
  };
  const controller = createController({
    pool,
    async createNotification(...args) {
      notifications.push(args);
    },
    io: {
      to(socketId) {
        return {
          emit(event, payload) {
            events.push({ socketId, event, payload });
          },
        };
      },
    },
    onlineUsers: { "7": "socket-7" },
    logger: { log(...args) { logs.push(args); }, error() {} },
  });
  const res = createResponse();

  await controller.send({ user: { id: 42 }, body: { receiverId: 7 } }, res);

  assert.equal(queries.length, 3);
  assert.equal(
    queries[1].sql,
    `INSERT INTO friendships (requester_id, receiver_id, status)
       VALUES ($1, $2, 'pending')`
  );
  assert.deepEqual(queries[1].params, [42, 7]);
  assert.equal(queries[2].sql, "SELECT first_name, last_name FROM users WHERE id = $1");
  assert.deepEqual(queries[2].params, [42]);
  assert.deepEqual(notifications, [[7, "friend_request", "Ali Karimov sizga do'st so'rovi yubordi"]]);
  assert.deepEqual(events, [{ socketId: "socket-7", event: "newFriendRequest", payload: { fromName: "Ali Karimov" } }]);
  assert.deepEqual(logs.at(-1), ["Signal yuborildi!"]);
  assert.deepEqual(res.body, { message: "So'rov yuborildi!" });
});

test("friend request preserves the existing safe error response", async () => {
  const logged = [];
  const controller = createController({
    pool: { async query() { throw new Error("database unavailable"); } },
    logger: { log() {}, error(...args) { logged.push(args); } },
  });
  const res = createResponse();

  await controller.send({ user: { id: 42 }, body: { receiverId: 7 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["So'rov yuborish xatosi:", "database unavailable"]]);
});
