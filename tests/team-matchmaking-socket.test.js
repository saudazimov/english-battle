const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeamMatchmakingSocket = require("../src/sockets/teamMatchmakingSocket");

function createHarness({ teamMatchPool, addError } = {}) {
  const calls = [];
  const listeners = [];
  const socket = {
    id: "socket-5",
    userId: 5,
    on(event, handler) {
      listeners.push({ event, handler });
    },
  };
  const pools = teamMatchPool || { duo: [], squad: [] };
  registerTeamMatchmakingSocket({
    socket,
    io: {
      to(socketId) {
        calls.push(["to", socketId]);
        return {
          emit(...args) {
            calls.push(["emit", ...args]);
          },
        };
      },
    },
    teamMatchPool: pools,
    addTeamEntry(mode, entry) {
      calls.push(["addTeamEntry", mode, entry]);
      if (addError) throw addError;
    },
    emitTeamQueueStatus(mode) {
      calls.push(["queueStatus", mode]);
    },
    stripUnsafe(value, limit) {
      calls.push(["strip", value, limit]);
      return typeof value === "string" ? value.trim() : "";
    },
    now() {
      calls.push(["now"]);
      return 123456;
    },
    logger: {
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
  });
  return {
    calls,
    listeners,
    teamMatchPool: pools,
    handlers: Object.fromEntries(
      listeners.map(({ event, handler }) => [event, handler])
    ),
  };
}

test("team matchmaking preserves listener registration order", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "findTeamMatch",
    "cancelTeamMatch",
  ]);
});

test("team search preserves token identity, squad mode, and entry payload", async () => {
  const harness = createHarness();
  const playerData = {
    userId: 99,
    teamMode: "squad",
    name: " Ali ",
    level: "B1",
    lengthKey: "quick",
    rating: 1450,
    profile_picture: "ali.png",
  };

  await harness.handlers.findTeamMatch(playerData);

  assert.equal(playerData.userId, 5);
  assert.deepEqual(harness.calls, [
    ["now"],
    ["strip", " Ali ", 60],
    [
      "addTeamEntry",
      "squad",
      {
        id: "solo_socket-5_123456",
        type: "solo",
        size: 1,
        players: [{
          socketId: "socket-5",
          userId: 5,
          name: "Ali",
          level: "B1",
          lengthKey: "quick",
          rating: 1450,
          profile_picture: "ali.png",
        }],
      },
    ],
  ]);
});

test("team search preserves null-input defaults and duo fallback", async () => {
  const harness = createHarness();

  await harness.handlers.findTeamMatch(null);

  assert.deepEqual(harness.calls.at(-1), [
    "addTeamEntry",
    "duo",
    {
      id: "solo_socket-5_123456",
      type: "solo",
      size: 1,
      players: [{
        socketId: "socket-5",
        userId: 5,
        name: "O'yinchi",
        level: "A1",
        lengthKey: "standard",
        rating: 1000,
        profile_picture: null,
      }],
    },
  ]);
});

test("team search preserves caught error logging and socket response", async () => {
  const harness = createHarness({ addError: new Error("pool unavailable") });

  await harness.handlers.findTeamMatch({ name: "Ali" });

  assert.deepEqual(harness.calls.slice(-3), [
    ["error", "Jamoa matchmaking xatosi:", "pool unavailable"],
    ["to", "socket-5"],
    ["emit", "battleError", { message: "Jamoa qidirishda xato" }],
  ]);
});

test("cancel preserves duo-to-squad order and only reports changed pools", () => {
  const keepDuo = { players: [{ socketId: "other-duo" }] };
  const removeDuo = { players: [{ socketId: "socket-5" }] };
  const keepSquad = { players: [{ socketId: "other-squad" }] };
  const harness = createHarness({
    teamMatchPool: {
      duo: [keepDuo, removeDuo],
      squad: [keepSquad],
    },
  });

  harness.handlers.cancelTeamMatch();

  assert.deepEqual(harness.teamMatchPool.duo, [keepDuo]);
  assert.deepEqual(harness.teamMatchPool.squad, [keepSquad]);
  assert.deepEqual(harness.calls, [["queueStatus", "duo"]]);
});

test("cancel preserves filtering and notifications for both modes", () => {
  const harness = createHarness({
    teamMatchPool: {
      duo: [{ players: [{ socketId: "socket-5" }] }],
      squad: [{
        players: [
          { socketId: "other" },
          { socketId: "socket-5" },
        ],
      }],
    },
  });

  harness.handlers.cancelTeamMatch();

  assert.deepEqual(harness.teamMatchPool, { duo: [], squad: [] });
  assert.deepEqual(harness.calls, [
    ["queueStatus", "duo"],
    ["queueStatus", "squad"],
  ]);
});
