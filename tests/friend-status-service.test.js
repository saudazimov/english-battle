const test = require("node:test");
const assert = require("node:assert/strict");

const { createFriendStatusService } = require("../src/services/friendStatusService");

const FRIENDS_SQL = `SELECT requester_id, receiver_id FROM friendships
         WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`;

test("friend status preserves query and online-friend socket events", async () => {
  const queryCalls = [];
  const socketCalls = [];
  const service = createFriendStatusService({
    pool: {
      async query(sql, params) {
        queryCalls.push({ sql, params });
        return {
          rows: [
            { requester_id: "5", receiver_id: 7 },
            { requester_id: 8, receiver_id: "5" },
            { requester_id: 9, receiver_id: "5" },
          ],
        };
      },
    },
    io: {
      to(socketId) {
        return {
          emit(event, payload) {
            socketCalls.push({ socketId, event, payload });
          },
        };
      },
    },
    onlineUsers: { "7": "socket-7", "8": "socket-8" },
    logger: { error() { throw new Error("must not log"); } },
  });

  const result = await service(5, true);

  assert.equal(result, undefined);
  assert.deepEqual(queryCalls, [{ sql: FRIENDS_SQL, params: [5] }]);
  assert.deepEqual(socketCalls, [
    {
      socketId: "socket-7",
      event: "friendStatusChanged",
      payload: { userId: "5", isOnline: true },
    },
    {
      socketId: "socket-8",
      event: "friendStatusChanged",
      payload: { userId: "5", isOnline: true },
    },
  ]);
});

test("friend status preserves offline payload value", async () => {
  const socketCalls = [];
  const service = createFriendStatusService({
    pool: {
      async query() {
        return { rows: [{ requester_id: 11, receiver_id: 12 }] };
      },
    },
    io: {
      to(socketId) {
        return {
          emit(event, payload) {
            socketCalls.push({ socketId, event, payload });
          },
        };
      },
    },
    onlineUsers: { "12": "socket-12" },
    logger: { error() { throw new Error("must not log"); } },
  });

  await service(11, false);

  assert.deepEqual(socketCalls, [{
    socketId: "socket-12",
    event: "friendStatusChanged",
    payload: { userId: "11", isOnline: false },
  }]);
});

test("friend status preserves safe database-error logging", async () => {
  const logs = [];
  const service = createFriendStatusService({
    pool: { async query() { throw new Error("database unavailable"); } },
    io: { to() { throw new Error("must not emit"); } },
    onlineUsers: {},
    logger: { error(...args) { logs.push(args); } },
  });

  const result = await service(3, true);

  assert.equal(result, undefined);
  assert.deepEqual(logs, [["notifyFriendsStatus xatosi:", "database unavailable"]]);
});
