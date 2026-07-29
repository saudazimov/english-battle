const test = require("node:test");
const assert = require("node:assert/strict");
const registerFriendBattleJoinSocket = require("../src/sockets/friendBattleJoinSocket");

function createHarness({ userId = 5, pendingBattles = {} } = {}) {
  const calls = [];
  const listeners = [];
  const socket = {
    id: "socket-5",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["emit", ...args]);
    },
    join(roomId) {
      calls.push(["join", roomId]);
    },
  };
  registerFriendBattleJoinSocket({
    socket,
    pendingBattles,
    startBattle(...args) {
      calls.push(["startBattle", ...args]);
    },
  });
  return {
    calls,
    listeners,
    pendingBattles,
    handler: listeners[0].handler,
  };
}

function createPendingBattle(overrides = {}) {
  return {
    lengthKey: "quick",
    player1: {
      userId: 5,
      name: "Ali",
      level: "A2",
      lengthKey: "standard",
      ready: false,
      socketId: null,
    },
    player2: {
      userId: 7,
      name: "Vali",
      level: "B1",
      lengthKey: "standard",
      ready: false,
      socketId: null,
    },
    ...overrides,
  };
}

test("friend battle join socket preserves listener registration", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "joinFriendBattle",
  ]);
});

test("missing pending battle preserves silent return", () => {
  const harness = createHarness();

  harness.handler({ roomId: "missing", userId: 99 });

  assert.deepEqual(harness.calls, []);
});

test("join preserves token identity and rejects an unexpected player", () => {
  const pendingBattles = { room: createPendingBattle() };
  const harness = createHarness({ userId: 9, pendingBattles });

  harness.handler({ roomId: "room", userId: 5 });

  assert.deepEqual(harness.calls, [
    ["emit", "battleError", { message: "Bu jangga kirishga ruxsat yo'q" }],
  ]);
  assert.equal(pendingBattles.room.player1.ready, false);
  assert.equal(pendingBattles.room.player2.ready, false);
});

test("first expected player preserves room join and ready state", () => {
  const pendingBattles = { room: createPendingBattle() };
  const harness = createHarness({ userId: 5, pendingBattles });

  harness.handler({ roomId: "room", userId: 99 });

  assert.deepEqual(harness.calls, [["join", "room"]]);
  assert.equal(pendingBattles.room.player1.ready, true);
  assert.equal(pendingBattles.room.player1.socketId, "socket-5");
  assert.equal(pendingBattles.room.player2.ready, false);
});

test("second ready player preserves delete-before-start and battle payloads", () => {
  const pending = createPendingBattle();
  pending.player1.ready = true;
  pending.player1.socketId = "socket-7";
  const pendingBattles = { room: pending };
  const calls = [];
  const listeners = [];
  const socket = {
    id: "socket-5",
    userId: 7,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    join(roomId) {
      calls.push(["join", roomId]);
    },
    emit(...args) {
      calls.push(["emit", ...args]);
    },
  };
  registerFriendBattleJoinSocket({
    socket,
    pendingBattles,
    startBattle(...args) {
      calls.push(["pendingExists", Boolean(pendingBattles.room)]);
      calls.push(["startBattle", ...args]);
    },
  });

  listeners[0].handler({ roomId: "room", userId: 99 });

  assert.deepEqual(calls, [
    ["join", "room"],
    ["pendingExists", false],
    [
      "startBattle",
      "room",
      {
        socketId: "socket-7",
        userId: 5,
        name: "Ali",
        level: "A2",
        lengthKey: "quick",
      },
      {
        socketId: "socket-5",
        userId: 7,
        name: "Vali",
        level: "B1",
        lengthKey: "quick",
      },
    ],
  ]);
  assert.equal(pendingBattles.room, undefined);
});

test("battle length preserves player-one fallback and standard default", () => {
  const playerFallback = createPendingBattle({ lengthKey: "" });
  playerFallback.player1.ready = true;
  playerFallback.player1.socketId = "socket-7";
  const firstHarness = createHarness({
    userId: 7,
    pendingBattles: { room: playerFallback },
  });
  firstHarness.handler({ roomId: "room" });
  assert.equal(firstHarness.calls[1][2].lengthKey, "standard");

  const standardFallback = createPendingBattle({ lengthKey: "" });
  standardFallback.player1.lengthKey = "";
  standardFallback.player1.ready = true;
  standardFallback.player1.socketId = "socket-7";
  const secondHarness = createHarness({
    userId: 7,
    pendingBattles: { room: standardFallback },
  });
  secondHarness.handler({ roomId: "room" });
  assert.equal(secondHarness.calls[1][2].lengthKey, "standard");
});
