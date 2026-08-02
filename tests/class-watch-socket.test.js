const test = require("node:test");
const assert = require("node:assert/strict");
const registerClassWatchSocket = require("../src/sockets/classWatchSocket");

function createHarness({
  userId = 5,
  authUserId = userId,
  rows = [{ one: 1 }],
  queryError,
  queryResult,
  queryHandler,
  now = Date.now,
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
        if (queryHandler) return queryHandler(sql, params);
        if (queryResult) return queryResult;
        return { rows };
      },
    },
    {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
    now
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
  await watch("17");
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
  assert.deepEqual(socket.classWatchTimes.length, 1);
  assert.deepEqual(socket.classWatchRooms.size, 0);
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

test("class watch socket coalesces parallel ownership checks", async () => {
  let resolveQuery;
  const queryResult = new Promise((resolve) => {
    resolveQuery = resolve;
  });
  const socket = createHarness({ queryResult, now: () => 1000 });
  const watch = socket.listeners[0].handler;

  const first = watch(17);
  const second = watch(17);
  assert.equal(socket.calls.filter(([type]) => type === "query").length, 1);

  resolveQuery({ rows: [{ one: 1 }] });
  await Promise.all([first, second]);

  assert.equal(socket.calls.filter(([type]) => type === "join").length, 1);
  assert.equal(socket.classWatchRooms.get(17), "joined");
});

test("unwatch during an ownership check prevents a late room join", async () => {
  let resolveQuery;
  const queryResult = new Promise((resolve) => {
    resolveQuery = resolve;
  });
  const socket = createHarness({ queryResult });
  const watchPromise = socket.listeners[0].handler(17);

  socket.listeners[1].handler(17);
  resolveQuery({ rows: [{ one: 1 }] });
  await watchPromise;

  assert.equal(socket.calls.some(([type]) => type === "join"), false);
  assert.deepEqual(socket.calls.at(-1), ["leave", "class_17"]);
  assert.equal(socket.classWatchRooms.size, 0);
});

test("a stale failed check cannot clear a newer watch request", async () => {
  let rejectFirst;
  let resolveSecond;
  const results = [
    new Promise((_resolve, reject) => {
      rejectFirst = reject;
    }),
    new Promise((resolve) => {
      resolveSecond = resolve;
    }),
  ];
  const socket = createHarness({ queryHandler: () => results.shift() });
  const watch = socket.listeners[0].handler;

  const first = watch(17);
  socket.listeners[1].handler(17);
  const second = watch(17);
  rejectFirst(new Error("stale query failed"));
  resolveSecond({ rows: [{ one: 1 }] });
  await Promise.all([first, second]);

  assert.equal(socket.calls.filter(([type]) => type === "query").length, 2);
  assert.equal(socket.calls.filter(([type]) => type === "join").length, 1);
  assert.equal(socket.classWatchRooms.get(17), "joined");
});

test("class watch socket limits valid watch attempts per time window", async () => {
  let currentTime = 1000;
  const socket = createHarness({ now: () => currentTime });
  const watch = socket.listeners[0].handler;

  for (let classId = 1; classId <= 10; classId += 1) {
    await watch(classId);
  }
  await watch(11);
  assert.equal(socket.calls.filter(([type]) => type === "query").length, 10);

  currentTime += 10001;
  await watch(11);
  assert.equal(socket.calls.filter(([type]) => type === "query").length, 11);
  assert.deepEqual(socket.calls.at(-1), ["join", "class_11"]);
});
