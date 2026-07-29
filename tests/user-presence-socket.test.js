const test = require("node:test");
const assert = require("node:assert/strict");
const registerUserPresenceSocket = require("../src/sockets/userPresenceSocket");

function createHarness({ userId, queryResult, queryError, notify } = {}) {
  const calls = [];
  const listeners = [];
  const onlineUsers = {};
  const socket = {
    id: "socket-1",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["emit", ...args]);
    },
    disconnect(...args) {
      calls.push(["disconnect", ...args]);
    },
  };
  registerUserPresenceSocket({
    socket,
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return queryResult || { rows: [] };
      },
    },
    onlineUsers,
    notifyFriendsStatus(...args) {
      calls.push(["notify", ...args]);
      return notify ? notify(...args) : undefined;
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return { socket, listeners, onlineUsers, calls };
}

test("user presence socket preserves event registration", () => {
  const harness = createHarness({ userId: 7 });

  assert.equal(harness.listeners.length, 1);
  assert.equal(harness.listeners[0].event, "registerUser");
});

test("user presence socket preserves missing-user response and short circuit", async () => {
  const harness = createHarness();

  await harness.listeners[0].handler();

  assert.deepEqual(harness.calls, [
    ["emit", "errorMessage", { message: "User ID is required." }],
  ]);
  assert.deepEqual(harness.onlineUsers, {});
});

test("user presence socket preserves normalization, SQL, online map, and emits", async () => {
  const neverResolvingNotification = new Promise(() => {});
  const harness = createHarness({
    userId: 7,
    queryResult: { rows: [{ is_banned: false }] },
    notify() {
      return neverResolvingNotification;
    },
  });

  await harness.listeners[0].handler();

  assert.equal(harness.socket.userId, "7");
  assert.deepEqual(harness.onlineUsers, { 7: "socket-1" });
  assert.deepEqual(harness.calls, [
    ["query", "SELECT is_banned FROM users WHERE id = $1", ["7"]],
    ["log", "User online:", "7 (token)"],
    ["notify", "7", true],
    [
      "emit",
      "userRegistered",
      { success: true, userId: "7", socketId: "socket-1" },
    ],
  ]);
});

test("user presence socket preserves banned-account disconnect", async () => {
  const harness = createHarness({
    userId: "7",
    queryResult: { rows: [{ is_banned: true }] },
  });

  await harness.listeners[0].handler();

  assert.deepEqual(harness.calls, [
    ["query", "SELECT is_banned FROM users WHERE id = $1", ["7"]],
    ["emit", "accountBanned", { message: "Hisobingiz bloklangan." }],
    ["disconnect", true],
  ]);
  assert.deepEqual(harness.onlineUsers, {});
});

test("user presence socket preserves ban-query error logging and registration", async () => {
  const databaseError = new Error("database unavailable");
  const harness = createHarness({ userId: "7", queryError: databaseError });

  await harness.listeners[0].handler();

  assert.deepEqual(harness.calls, [
    ["query", "SELECT is_banned FROM users WHERE id = $1", ["7"]],
    ["error", "ban check xato:", "database unavailable"],
    ["log", "User online:", "7 (token)"],
    ["notify", "7", true],
    [
      "emit",
      "userRegistered",
      { success: true, userId: "7", socketId: "socket-1" },
    ],
  ]);
  assert.deepEqual(harness.onlineUsers, { 7: "socket-1" });
});
