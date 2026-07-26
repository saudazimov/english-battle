const test = require("node:test");
const assert = require("node:assert/strict");
const { createFriendRemoveController } = require("../src/controllers/friendRemoveController");

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

test("friend remove preserves missing friend validation without side effects", async () => {
  let queryCount = 0;
  let emitCount = 0;
  const pool = {
    async query() {
      queryCount += 1;
    },
  };
  const io = {
    to() {
      emitCount += 1;
      return this;
    },
    emit() {
      emitCount += 1;
    },
  };
  const controller = createFriendRemoveController({ pool, io, onlineUsers: {} });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, body: {} }, res);

  assert.equal(queryCount, 0);
  assert.equal(emitCount, 0);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: "friendId kerak" });
});

test("friend remove preserves the delete query and socket event", async () => {
  const queries = [];
  const events = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1 };
    },
  };
  const io = {
    to(socketId) {
      return {
        emit(event, payload) {
          events.push({ socketId, event, payload });
        },
      };
    },
  };
  const onlineUsers = { "7": "socket-7" };
  const controller = createFriendRemoveController({ pool, io, onlineUsers });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, body: { friendId: 7 } }, res);

  assert.equal(queries.length, 1);
  assert.equal(
    queries[0].sql,
    `DELETE FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`
  );
  assert.deepEqual(queries[0].params, [42, 7]);
  assert.deepEqual(events, [{
    socketId: "socket-7",
    event: "friendRemoved",
    payload: { byUserId: 42 },
  }]);
  assert.deepEqual(res.body, { message: "Do'st o'chirildi" });
});

test("friend remove preserves the existing safe error response", async () => {
  const logged = [];
  const pool = {
    async query() {
      throw new Error("database unavailable");
    },
  };
  const logger = {
    error(...args) {
      logged.push(args);
    },
  };
  const controller = createFriendRemoveController({
    pool,
    io: { to() {} },
    onlineUsers: {},
    logger,
  });
  const res = createResponse();

  await controller.remove({ user: { id: 42 }, body: { friendId: 7 } }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: "Server xatosi" });
  assert.deepEqual(logged, [["Do'st o'chirish xatosi:", "database unavailable"]]);
});
