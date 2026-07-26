const test = require("node:test");
const assert = require("node:assert/strict");

const { createMatchmakingPairService } = require("../src/services/matchmakingPairService");

function createHarness({ pictureRows = [], pictureError, cardError, connectedSockets = [] } = {}) {
  const calls = [];
  let timerCallback;
  const socketSet = new Set(connectedSockets);
  const pairPlayers = createMatchmakingPairService({
    io: {
      sockets: {
        sockets: {
          get(socketId) {
            calls.push(["getSocket", socketId]);
            if (!socketSet.has(socketId)) return undefined;
            return {
              join(roomId) { calls.push(["join", socketId, roomId]); },
            };
          },
        },
      },
      to(socketId) {
        return {
          emit(event, payload) { calls.push(["emit", socketId, event, payload]); },
        };
      },
    },
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (pictureError) throw pictureError;
        return { rows: pictureRows };
      },
    },
    async getOpponentCardInfo(userId) {
      calls.push(["card", userId]);
      if (cardError) throw cardError;
      return { rating: userId === 7 ? 1200 : 1300, win_rate: userId === 7 ? 55 : 60 };
    },
    startBattle(roomId, playerA, playerB) {
      calls.push(["startBattle", roomId, playerA, playerB]);
      return Promise.resolve("ignored-result");
    },
    setTimeoutFn(callback, delay) {
      calls.push(["timer", delay]);
      timerCallback = callback;
    },
  });
  return { calls, pairPlayers, runTimer: () => timerCallback() };
}

function players() {
  return [
    { socketId: "socket-a", userId: 7, name: "Player A", level: "A2" },
    { socketId: "socket-b", userId: 8, name: "Player B", level: "B1" },
  ];
}

test("matchmaking pair preserves join, lookup, emit, and timer behavior", async () => {
  const [playerA, playerB] = players();
  const harness = createHarness({
    connectedSockets: ["socket-a", "socket-b"],
    pictureRows: [
      { id: "7", profile_picture: "/a.png" },
      { id: 8, profile_picture: "/b.png" },
    ],
  });

  assert.equal(await harness.pairPlayers(playerA, playerB), undefined);

  assert.deepEqual(harness.calls.filter((call) => call[0] === "join"), [
    ["join", "socket-a", "battle_socket-a_socket-b"],
    ["join", "socket-b", "battle_socket-a_socket-b"],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "card"), [
    ["card", 7],
    ["card", 8],
  ]);
  const queryCall = harness.calls.find((call) => call[0] === "query");
  assert.equal(queryCall[1], "SELECT id, profile_picture FROM users WHERE id = ANY($1)");
  assert.deepEqual(queryCall[2], [[7, 8]]);

  const emissions = harness.calls.filter((call) => call[0] === "emit");
  assert.deepEqual(emissions.map((call) => call.slice(1, 3)), [
    ["socket-a", "matchFound"],
    ["socket-a", "matchmaking:found"],
    ["socket-b", "matchFound"],
    ["socket-b", "matchmaking:found"],
  ]);
  assert.equal(emissions[0][3], emissions[1][3]);
  assert.equal(emissions[2][3], emissions[3][3]);
  assert.deepEqual(emissions[0][3], {
    roomId: "battle_socket-a_socket-b",
    opponent: {
      name: "Player B",
      profile_picture: "/b.png",
      rating: 1300,
      win_rate: 60,
      level: "B1",
    },
    message: "Raqib topildi!",
  });
  assert.deepEqual(harness.calls.find((call) => call[0] === "timer"), ["timer", 6000]);

  harness.runTimer();
  assert.deepEqual(harness.calls.at(-1), [
    "startBattle", "battle_socket-a_socket-b", playerA, playerB,
  ]);
});

test("matchmaking pair preserves optional socket and profile lookup fallback", async () => {
  const [playerA, playerB] = players();
  const harness = createHarness({
    connectedSockets: ["socket-a"],
    pictureError: new Error("optional lookup failed"),
  });

  await harness.pairPlayers(playerA, playerB);

  assert.deepEqual(harness.calls.filter((call) => call[0] === "join"), [
    ["join", "socket-a", "battle_socket-a_socket-b"],
  ]);
  const emissions = harness.calls.filter((call) => call[0] === "emit");
  assert.equal(emissions[0][3].opponent.profile_picture, null);
  assert.equal(emissions[2][3].opponent.profile_picture, null);
  assert.ok(harness.calls.some((call) => call[0] === "timer"));
});

test("matchmaking pair preserves opponent-card error propagation", async () => {
  const [playerA, playerB] = players();
  const harness = createHarness({ cardError: new Error("card failed") });

  await assert.rejects(harness.pairPlayers(playerA, playerB), { message: "card failed" });

  assert.equal(harness.calls.some((call) => call[0] === "query"), false);
  assert.equal(harness.calls.some((call) => call[0] === "emit"), false);
  assert.equal(harness.calls.some((call) => call[0] === "timer"), false);
});
