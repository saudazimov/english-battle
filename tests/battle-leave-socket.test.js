const test = require("node:test");
const assert = require("node:assert/strict");
const registerBattleLeaveSocket = require("../src/sockets/battleLeaveSocket");

function createHarness({ battles = {}, userToRoom = {} } = {}) {
  const calls = [];
  const listeners = [];
  const socket = {
    id: "socket-5",
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
  registerBattleLeaveSocket({
    socket,
    battles,
    userToRoom,
    emitTeamProgress(roomId) {
      calls.push(["progress", roomId]);
    },
    checkTeamFinish(roomId) {
      calls.push(["finishCheck", roomId]);
    },
    finishBattle(roomId) {
      calls.push(["finish", roomId]);
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
    userToRoom,
    handler: listeners[0].handler,
  };
}

function createBattle({ isTeam = false, opponentFinished = false } = {}) {
  return {
    isTeam,
    players: {
      "socket-5": { userId: 5, finished: false },
      "socket-7": { userId: 7, finished: opponentFinished },
    },
  };
}

test("battle leave preserves listener registration", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "battle:leave",
  ]);
});

test("missing room, battle, and socket player preserve silent returns", () => {
  const battles = {
    room: { players: { "socket-7": { userId: 7 } } },
  };
  const harness = createHarness({ battles });

  harness.handler({ roomId: "" });
  harness.handler({ roomId: "missing" });
  harness.handler({ roomId: "room" });

  assert.deepEqual(harness.calls, []);
});

test("malformed payloads and unsafe room lookups return silently", () => {
  const inheritedBattle = createBattle();
  const battles = Object.create({ inherited: inheritedBattle });
  const harness = createHarness({ battles });

  harness.handler();
  harness.handler(null);
  harness.handler("room");
  harness.handler([]);
  harness.handler({ roomId: "" });
  harness.handler({ roomId: "x".repeat(257) });
  harness.handler({ roomId: "inherited" });
  harness.handler({ roomId: "__proto__" });

  assert.deepEqual(harness.calls, []);
});

test("inherited player membership is rejected and null-prototype maps remain valid", () => {
  const inheritedPlayers = Object.create({
    "socket-5": createBattle().players["socket-5"],
  });
  const battles = Object.create(null);
  battles.inheritedPlayer = createBattle();
  battles.inheritedPlayer.players = inheritedPlayers;

  const ownPlayers = Object.create(null);
  ownPlayers["socket-5"] = createBattle().players["socket-5"];
  ownPlayers["socket-7"] = createBattle().players["socket-7"];
  battles.valid = createBattle();
  battles.valid.players = ownPlayers;
  const userToRoom = Object.create(null);
  userToRoom[5] = "valid";
  const harness = createHarness({ battles, userToRoom });

  harness.handler({ roomId: "inheritedPlayer" });
  assert.deepEqual(harness.calls, []);

  harness.handler({ roomId: "valid" });
  assert.equal(ownPlayers["socket-5"].finished, true);
  assert.equal(userToRoom[5], undefined);
});

test("malformed player state returns silently", () => {
  const battle = createBattle();
  battle.players["socket-5"] = null;
  const harness = createHarness({ battles: { room: battle } });

  harness.handler({ roomId: "room" });

  assert.deepEqual(harness.calls, []);
});

test("team leave preserves forfeit, mapping cleanup, and event order", () => {
  const battle = createBattle({ isTeam: true });
  const userToRoom = { 5: "room" };
  const harness = createHarness({ battles: { room: battle }, userToRoom });

  harness.handler({ roomId: "room" });

  assert.equal(battle.players["socket-5"].finished, true);
  assert.equal(battle.players["socket-5"].disconnected, true);
  assert.equal(harness.userToRoom[5], undefined);
  assert.deepEqual(harness.calls, [
    ["log", "Leave: user 5 jangni tark etdi → room"],
    ["to", "room"],
    ["emit", "playerOffline", { userId: "5" }],
    ["progress", "room"],
    ["finishCheck", "room"],
  ]);
});

test("leave preserves mismatched reconnect mapping", () => {
  const battle = createBattle({ isTeam: true });
  const userToRoom = { 5: "other-room" };
  const harness = createHarness({ battles: { room: battle }, userToRoom });

  harness.handler({ roomId: "room" });

  assert.equal(harness.userToRoom[5], "other-room");
});

test("1v1 leave preserves opponent notification while battle remains active", () => {
  const battle = createBattle({ opponentFinished: false });
  const harness = createHarness({ battles: { room: battle } });

  harness.handler({ roomId: "room" });

  assert.deepEqual(harness.calls, [
    ["log", "Leave: user 5 jangni tark etdi → room"],
    ["to", "room"],
    ["emit", "opponentLeft", { message: "Raqib jangni tark etdi" }],
  ]);
});

test("1v1 leave preserves finish call when every player is finished", () => {
  const battle = createBattle({ opponentFinished: true });
  const harness = createHarness({ battles: { room: battle } });

  harness.handler({ roomId: "room" });

  assert.deepEqual(harness.calls, [
    ["log", "Leave: user 5 jangni tark etdi → room"],
    ["finish", "room"],
  ]);
});

test("falsy user id preserves reconnect mapping and string payload", () => {
  const battle = createBattle({ isTeam: true });
  battle.players["socket-5"].userId = 0;
  const userToRoom = { 0: "room" };
  const harness = createHarness({ battles: { room: battle }, userToRoom });

  harness.handler({ roomId: "room" });

  assert.equal(harness.userToRoom[0], "room");
  assert.deepEqual(harness.calls[2], [
    "emit",
    "playerOffline",
    { userId: "0" },
  ]);
});
