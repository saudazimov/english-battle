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

test("friend battle join rejects invalid and prototype room IDs", () => {
  const inheritedBattles = Object.create({ inherited: createPendingBattle() });
  const harness = createHarness({ pendingBattles: inheritedBattles });

  for (const roomId of [
    null,
    17,
    {},
    "",
    "__proto__",
    "constructor",
    "inherited",
    "x".repeat(257),
  ]) {
    assert.doesNotThrow(() => harness.handler({ roomId, userId: 5 }));
  }
  for (const payload of [null, undefined, "room", 17]) {
    assert.doesNotThrow(() => harness.handler(payload));
  }

  assert.deepEqual(harness.calls, []);
});

test("friend battle join rejects reserved own room keys", () => {
  const pendingBattles = Object.create(null);
  pendingBattles.__proto__ = createPendingBattle();
  pendingBattles.constructor = createPendingBattle();
  const harness = createHarness({ pendingBattles });

  harness.handler({ roomId: "__proto__" });
  harness.handler({ roomId: "constructor" });

  assert.deepEqual(harness.calls, []);
});

test("friend battle join rejects malformed pending player state", () => {
  for (const pending of [
    null,
    [],
    {},
    { player1: null, player2: {} },
    { player1: { userId: 5 }, player2: { userId: 7 } },
  ]) {
    const harness = createHarness({ pendingBattles: { room: pending } });

    assert.doesNotThrow(() => harness.handler({ roomId: "room" }));
    assert.deepEqual(harness.calls, []);
  }
});

test("friend battle join rejects invalid authenticated user IDs", () => {
  for (const userId of [
    null,
    {},
    "",
    "__proto__",
    "7.5",
    "9007199254740992",
    Number.POSITIVE_INFINITY,
  ]) {
    const pending = createPendingBattle();
    const harness = createHarness({ userId, pendingBattles: { room: pending } });

    harness.handler({ roomId: "room", userId: 5 });

    assert.deepEqual(harness.calls, []);
    assert.equal(pending.player1.ready, false);
    assert.equal(pending.player2.ready, false);
  }
});

test("friend battle join supports own keys on null-prototype maps", () => {
  const pendingBattles = Object.create(null);
  pendingBattles.room = createPendingBattle();
  const harness = createHarness({ pendingBattles });

  harness.handler({ roomId: "room", userId: 99 });

  assert.deepEqual(harness.calls, [["join", "room"]]);
  assert.equal(pendingBattles.room.player1.ready, true);
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

test("inherited ready state cannot start a friend battle", () => {
  const player1 = Object.create({ ready: true, socketId: "socket-forged" });
  Object.assign(player1, {
    userId: 5,
    name: "Ali",
    level: "A2",
    lengthKey: "standard",
  });
  const pending = createPendingBattle({ player1 });
  const harness = createHarness({
    userId: 7,
    pendingBattles: { room: pending },
  });

  harness.handler({ roomId: "room" });

  assert.deepEqual(harness.calls, [["join", "room"]]);
  assert.equal(harness.pendingBattles.room, pending);
});

test("ready players require valid socket IDs before battle start", () => {
  const pending = createPendingBattle();
  pending.player1.ready = true;
  pending.player1.socketId = null;
  const harness = createHarness({
    userId: 7,
    pendingBattles: { room: pending },
  });

  harness.handler({ roomId: "room" });

  assert.deepEqual(harness.calls, [["join", "room"]]);
  assert.equal(harness.pendingBattles.room, pending);
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
