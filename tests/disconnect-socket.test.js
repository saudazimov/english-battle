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
  registerDisconnectSocket({
    socket,
    battles,
    userToRoom,
    onlineUsers,
    removeFromQueue(socketId) {
      calls.push(["removeQueue", socketId]);
    },
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
