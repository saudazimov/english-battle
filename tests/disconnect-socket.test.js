const test = require("node:test");
const assert = require("node:assert/strict");
const registerDisconnectSocket = require("../src/sockets/disconnectSocket");

function createBattle({ isTeam = false, opponentFinished = false } = {}) {
  return {
    isTeam,
    players: {
      "socket-5": { userId: 5, finished: false },
      "socket-7": { userId: 7, finished: opponentFinished },
    },
  };
}

function createHarness({
  userId = 5,
  battles = {},
  userToRoom = {},
  onlineUsers = {},
  suspendSearch = false,
} = {}) {
  const calls = [];
  const listeners = [];
  const timers = [];
  const socket = {
    id: "socket-5",
    userId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    to(roomId) {
      calls.push(["to", roomId]);
      return {
        emit(...args) {
          calls.push(["emit", ...args]);
        },
      };
    },
  };
  function removeFromQueue(socketId) {
    calls.push(["removeQueue", socketId]);
  }
  if (suspendSearch) {
    removeFromQueue.suspend = function suspend(socketId) {
      calls.push(["suspendQueue", socketId]);
      return { socketId, userId };
    };
  }
  registerDisconnectSocket({
    socket,
    battles,
    userToRoom,
    onlineUsers,
    removeFromQueue,
    notifyFriendsStatus(statusUserId, online) {
      calls.push(["notify", statusUserId, online]);
    },
    removeFromParty(partyUserId) {
      calls.push(["removeParty", partyUserId]);
    },
    emitTeamProgress(roomId) {
      calls.push(["progress", roomId]);
    },
    checkTeamFinish(roomId) {
      calls.push(["finishCheck", roomId]);
    },
    finishBattle(roomId) {
      calls.push(["finish", roomId]);
    },
    setTimer(callback, delay) {
      timers.push({ callback, delay });
      calls.push(["timer", delay]);
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
    },
  });
  return {
    calls,
    listeners,
    timers,
    battles,
    userToRoom,
    onlineUsers,
    handler: listeners[0].handler,
  };
}

test("disconnect socket preserves listener registration", () => {
  const harness = createHarness();
  assert.deepEqual(harness.listeners.map(({ event }) => event), ["disconnect"]);
});

test("disconnect without user preserves log and queue cleanup only", () => {
  const harness = createHarness({ userId: null });

  harness.handler();

  assert.deepEqual(harness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
  ]);
});

test("queued search receives a reconnect grace period before cleanup", () => {
  const harness = createHarness({ suspendSearch: true });

  harness.handler();

  assert.deepEqual(harness.calls.slice(0, 3), [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["suspendQueue", "socket-5"],
    ["timer", 15000],
  ]);
  harness.timers[0].callback();
  assert.deepEqual(harness.calls.at(-1), ["removeQueue", "socket-5"]);
});

test("active battle preserves timer scheduling before online cleanup", () => {
  const battle = createBattle();
  const onlineUsers = { 5: "socket-5" };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
    onlineUsers,
  });

  harness.handler();

  assert.equal(harness.onlineUsers[5], undefined);
  assert.deepEqual(harness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
    ["timer", 3000],
    ["timer", 30000],
    ["log", "Offlayn:", 5],
    ["notify", 5, false],
    ["removeParty", "5"],
  ]);
});

test("disconnect ignores inherited room, battle, and online mappings", () => {
  const inheritedRoomMap = Object.create({ 5: "room" });
  const inheritedOnlineMap = Object.create({ 5: "socket-5" });
  const inheritedRoomHarness = createHarness({
    battles: { room: createBattle() },
    userToRoom: inheritedRoomMap,
    onlineUsers: inheritedOnlineMap,
  });

  inheritedRoomHarness.handler();

  assert.deepEqual(inheritedRoomHarness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
  ]);
  assert.equal(inheritedRoomHarness.timers.length, 0);

  const inheritedBattleMap = Object.create({ room: createBattle() });
  const inheritedBattleHarness = createHarness({
    battles: inheritedBattleMap,
    userToRoom: { 5: "room" },
  });

  inheritedBattleHarness.handler();

  assert.deepEqual(inheritedBattleHarness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
  ]);
  assert.equal(inheritedBattleHarness.timers.length, 0);
});

test("disconnect ignores malformed battle player state", () => {
  const harness = createHarness({
    battles: { room: { isTeam: false, players: null } },
    userToRoom: { 5: "room" },
  });

  harness.handler();

  assert.deepEqual(harness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
  ]);
  assert.equal(harness.timers.length, 0);
});

test("disconnect rejects non-primitive room identifiers without coercion", () => {
  const roomId = {
    toString() {
      throw new Error("room ID must not be coerced");
    },
  };
  const harness = createHarness({
    battles: {},
    userToRoom: { 5: roomId },
  });

  harness.handler();

  assert.deepEqual(harness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
  ]);
  assert.equal(harness.timers.length, 0);
});

test("offline timer preserves signal for the unchanged socket", () => {
  const battle = createBattle();
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });
  harness.handler();
  harness.calls.length = 0;

  harness.timers[0].callback();

  assert.deepEqual(harness.calls, [
    ["to", "room"],
    ["emit", "playerOffline", { userId: "5" }],
  ]);
});

test("both timers preserve silent return after socket rebind", () => {
  const battle = createBattle();
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });
  harness.handler();
  battle.players["socket-new"] = battle.players["socket-5"];
  delete battle.players["socket-5"];
  harness.calls.length = 0;

  harness.timers[0].callback();
  harness.timers[1].callback();

  assert.deepEqual(harness.calls, []);
  assert.equal(battle.players["socket-new"].finished, false);
});

test("both timers return silently when battle state becomes malformed", () => {
  const battle = createBattle();
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });
  harness.handler();
  battle.players = null;
  harness.calls.length = 0;

  harness.timers[0].callback();
  harness.timers[1].callback();

  assert.deepEqual(harness.calls, []);
});

test("team forfeit preserves state, log, progress, and finish check", () => {
  const battle = createBattle({ isTeam: true });
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });
  harness.handler();
  harness.calls.length = 0;

  harness.timers[1].callback();

  assert.equal(battle.players["socket-5"].finished, true);
  assert.equal(battle.players["socket-5"].disconnected, true);
  assert.deepEqual(harness.calls, [
    [
      "log",
      "Jamoa jang: user 5 qaytmadi (30s) → finished, jang davom etadi",
    ],
    ["progress", "room"],
    ["finishCheck", "room"],
  ]);
});

test("1v1 forfeit preserves opponent event and all-finished behavior", () => {
  const battle = createBattle({ opponentFinished: true });
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });
  harness.handler();
  harness.calls.length = 0;

  harness.timers[1].callback();

  assert.deepEqual(harness.calls, [
    [
      "log",
      "1v1 jang: user 5 qaytmadi (30s) → finished, jang yakunlanadi",
    ],
    ["to", "room"],
    ["emit", "opponentLeft", { message: "Raqib jangdan chiqib ketdi" }],
    ["finish", "room"],
  ]);
});

test("1v1 forfeit tolerates malformed player entries without finishing", () => {
  const battle = createBattle({ opponentFinished: true });
  battle.players.broken = null;
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });
  harness.handler();
  harness.calls.length = 0;

  harness.timers[1].callback();

  assert.deepEqual(harness.calls, [
    [
      "log",
      "1v1 jang: user 5 qaytmadi (30s) → finished, jang yakunlanadi",
    ],
    ["to", "room"],
    ["emit", "opponentLeft", { message: "Raqib jangdan chiqib ketdi" }],
  ]);
});

test("online mapping mismatch preserves current online user", () => {
  const onlineUsers = { 5: "socket-new" };
  const harness = createHarness({ onlineUsers });

  harness.handler();

  assert.equal(harness.onlineUsers[5], "socket-new");
  assert.deepEqual(harness.calls, [
    ["log", "O'yinchi uzildi:", "socket-5"],
    ["removeQueue", "socket-5"],
  ]);
});
