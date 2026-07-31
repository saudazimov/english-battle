const test = require("node:test");
const assert = require("node:assert/strict");
const registerClassWatchSocket = require("../src/sockets/classWatchSocket");

function createHarness({
  userId = 5,
  authUserId = userId,
  rows = [{ one: 1 }],
  queryError,
} = {}) {
  const listeners = [];
  const calls = [];
  const socket = {
    userId,
    authUserId,
    listeners,
    calls,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    join(room) {
      calls.push(["join", room]);
    },
    leave(room) {
      calls.push(["leave", room]);
    },
  };
  registerClassWatchSocket(
    socket,
    {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        return { rows };
      },
    },
    {
      error(...args) {
        calls.push(["error", ...args]);
      },
    }
  );
  return socket;
}

test("class watch socket preserves event registration order", () => {
  const socket = createHarness();

  assert.deepEqual(socket.listeners.map(({ event }) => event), [
    "watchClass",
    "unwatchClass",
  ]);
});

test("class watch socket verifies teacher ownership before joining", async () => {
  const socket = createHarness();
  const watch = socket.listeners[0].handler;
  const unwatch = socket.listeners[1].handler;

  await watch(17);
  unwatch("17");

  assert.deepEqual(socket.calls, [
    [
      "query",
      "SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2",
      [17, 5],
    ],
    ["join", "class_17"],
    ["leave", "class_17"],
  ]);
});

test("class watch socket rejects invalid IDs without database access", async () => {
  const socket = createHarness();

  for (const value of [null, undefined, "", 0, "01", "17abc", 1.5]) {
    await socket.listeners[0].handler(value);
    socket.listeners[1].handler(value);
  }

  assert.deepEqual(socket.calls, []);
});

test("class watch socket rejects unauthenticated and non-owner joins", async () => {
  const unauthenticated = createHarness({ userId: null, authUserId: null });
  await unauthenticated.listeners[0].handler(17);
  assert.deepEqual(unauthenticated.calls, []);

  const nonOwner = createHarness({ rows: [] });
  await nonOwner.listeners[0].handler(17);
  assert.deepEqual(nonOwner.calls, [[
    "query",
    "SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2",
    [17, 5],
  ]]);
});

test("class watch socket prefers immutable handshake identity", async () => {
  const socket = createHarness({ userId: 99, authUserId: 5 });

  await socket.listeners[0].handler(17);

  assert.deepEqual(socket.calls[0], [
    "query",
    "SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2",
    [17, 5],
  ]);
  assert.deepEqual(socket.calls[1], ["join", "class_17"]);
});

test("class watch socket logs database failures without joining", async () => {
  const socket = createHarness({ queryError: new Error("database unavailable") });

  await socket.listeners[0].handler(17);

  assert.deepEqual(socket.calls, [
    [
      "query",
      "SELECT 1 FROM classes WHERE id=$1 AND teacher_id=$2",
      [17, 5],
    ],
    ["error", "Class room tekshirish xatosi:", "database unavailable"],
  ]);
});
