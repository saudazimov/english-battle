const test = require("node:test");
const assert = require("node:assert/strict");
const registerBattleReconnectSocket = require("../src/sockets/battleReconnectSocket");

function question() {
  return {
    id: 11,
    question_text: "Choose",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "B",
  };
}

function player(overrides = {}) {
  return {
    userId: 5,
    name: "Ali",
    level: "B1",
    rating: 1500,
    profile_picture: "ali.png",
    answeredCount: 1,
    score: 1,
    finished: false,
    disconnected: true,
    qDeadline: 1500,
    ...overrides,
  };
}

function createHarness({
  userId = 5,
  authUserId,
  battles = {},
  userToRoom = {},
  recentlyFinished = {},
  queryResponses = [],
  queryError,
  nowValue = 1000,
  rebind = true,
} = {}) {
  const calls = [];
  const listeners = [];
  const responses = queryResponses.slice();
  const socket = {
    id: "socket-new",
    userId,
    authUserId,
    on(event, handler) {
      listeners.push({ event, handler });
    },
    emit(...args) {
      calls.push(["socket-emit", ...args]);
    },
    join(roomId) {
      calls.push(["join", roomId]);
    },
    to(roomId) {
      calls.push(["to", roomId]);
      return {
        emit(...args) {
          calls.push(["room-emit", ...args]);
        },
      };
    },
  };
  registerBattleReconnectSocket({
    socket,
    battles,
    userToRoom,
    recentlyFinished,
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
        if (queryError) throw queryError;
        return responses.shift() || { rows: [] };
      },
    },
    finishBattleSession(roomId) {
      calls.push([
        "finishSession",
        roomId,
        Boolean(battles[roomId]),
        userToRoom[userId],
      ]);
      return Promise.resolve();
    },
    rebindPlayerSocket(roomId, reboundUserId, socketId) {
      calls.push(["rebind", roomId, reboundUserId, socketId]);
      if (!rebind) return;
      const battle = battles[roomId];
      const oldKey = Object.keys(battle.players).find(
        (key) => String(battle.players[key].userId) === String(reboundUserId)
      );
      if (oldKey && oldKey !== socketId) {
        battle.players[socketId] = battle.players[oldKey];
        delete battle.players[oldKey];
        if (battle.teams) {
          Object.keys(battle.teams).forEach((team) => {
            battle.teams[team] = battle.teams[team].map((key) => (
              key === oldKey ? socketId : key
            ));
          });
        }
      }
    },
    now() {
      calls.push(["now"]);
      return nowValue;
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
  return {
    calls,
    listeners,
    battles,
    userToRoom,
    handler: listeners[0].handler,
  };
}

test("battle reconnect preserves listener registration", () => {
  const harness = createHarness();
  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "battle:reconnectCheck",
  ]);
});

test("reconnect preserves socket identity and unauthenticated response", async () => {
  const harness = createHarness({ userId: null });

  await harness.handler({ userId: 99 });

  assert.deepEqual(harness.calls, [
    ["socket-emit", "battle:noActive", {}],
  ]);
});

test("expected room mismatch preserves early no-active response", async () => {
  const harness = createHarness({
    authUserId: 7,
    userToRoom: { 7: "active-room" },
    battles: { "active-room": { players: {} } },
  });

  await harness.handler({ userId: 99, expectedRoom: "new-room" });

  assert.deepEqual(harness.calls, [
    ["socket-emit", "battle:noActive", {}],
  ]);
});

test("missing active battle preserves recently-finished precedence", async () => {
  const finished = createHarness({ recentlyFinished: { 5: "done-room" } });
  await finished.handler({ userId: 99 });
  assert.deepEqual(finished.calls, [[
    "socket-emit",
    "battle:alreadyFinished",
    { roomId: "done-room" },
  ]]);

  const missing = createHarness();
  await missing.handler({ userId: 99 });
  assert.deepEqual(missing.calls, [
    ["socket-emit", "battle:noActive", {}],
  ]);
});

test("stale battle preserves cleanup and finish-session order", async () => {
  const battles = {
    room: { createdAt: 1000, players: { old: player() } },
  };
  const userToRoom = { 5: "room" };
  const harness = createHarness({
    battles,
    userToRoom,
    nowValue: 602001,
  });

  await harness.handler({ userId: 99 });

  assert.equal(harness.userToRoom[5], undefined);
  assert.equal(harness.battles.room, undefined);
  assert.deepEqual(harness.calls, [
    ["now"],
    ["finishSession", "room", true, undefined],
    ["socket-emit", "battle:noActive", {}],
  ]);
});

test("missing rebound player never joins the battle room", async () => {
  const battle = { questions: [question()], players: { old: player() } };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
    rebind: false,
  });

  await harness.handler({ userId: 99 });

  assert.deepEqual(harness.calls, [
    ["rebind", "room", 5, "socket-new"],
    ["socket-emit", "battle:noActive", {}],
  ]);
});

test("reconnect rejects a rebound socket mapped to another user", async () => {
  const battle = {
    questions: [question()],
    players: {
      "socket-new": player({ userId: 7 }),
    },
  };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
    rebind: false,
  });

  await harness.handler({ userId: 5, expectedRoom: "room" });

  assert.deepEqual(harness.calls, [
    ["rebind", "room", 5, "socket-new"],
    ["socket-emit", "battle:noActive", {}],
  ]);
});

test("team reconnect preserves safe payload, scores, and event order", async () => {
  const battle = {
    isTeam: true,
    teamMode: "duo",
    level: "B1",
    questions: [question()],
    teams: { A: ["old"], B: ["enemy"] },
    players: {
      old: player({ team: "A", qDeadline: 1500 }),
      enemy: player({
        userId: 7,
        name: "Vali",
        team: "B",
        score: 2,
        answeredCount: 2,
        profile_picture: "vali.png",
      }),
    },
  };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
  });

  await harness.handler({ userId: 99 });

  const resumeCall = harness.calls.find(
    ([type, event]) => type === "socket-emit" && event === "team:resumeState"
  );
  assert.equal(battle.players["socket-new"].disconnected, false);
  assert.equal(resumeCall[2].questions[0].correct_option, undefined);
  assert.deepEqual(resumeCall[2], {
    roomId: "room",
    teamMode: "duo",
    level: "B1",
    questions: [{
      id: 11,
      question_text: "Choose",
      option_a: "A",
      option_b: "B",
      option_c: "C",
      option_d: "D",
    }],
    total_questions: 1,
    answeredCount: 1,
    myScore: 1,
    myTeam: "A",
    myTeamPlayers: [{
      name: "Ali",
      isBot: undefined,
      userId: 5,
      level: "B1",
      rating: 1500,
      profile_picture: "ali.png",
      answeredCount: 1,
      score: 1,
      finished: false,
    }],
    enemyTeamPlayers: [{
      name: "Vali",
      isBot: undefined,
      userId: 7,
      level: "B1",
      rating: 1500,
      profile_picture: "vali.png",
      answeredCount: 2,
      score: 2,
      finished: false,
    }],
    myTeamScore: 1,
    enemyTeamScore: 2,
    msLeft: 500,
    finished: false,
  });
});

test("finished player reconnect preserves stats and opponent card SQL", async () => {
  const battle = {
    questions: [question()],
    players: {
      old: player({ finished: true, answeredCount: 1, score: 1 }),
      enemy: player({ userId: 7, name: "Vali", answeredCount: 1, score: 0 }),
    },
  };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
    queryResponses: [
      { rows: [{ is_correct: true }, { is_correct: false }] },
      { rows: [{ profile_picture: "vali.png", rating: 1400 }] },
    ],
  });

  await harness.handler({ userId: 99 });

  const queries = harness.calls.filter(([type]) => type === "query");
  assert.deepEqual(queries.map((call) => call[2]), [["room", 5], [7]]);
  assert.deepEqual(harness.calls.at(-1), [
    "socket-emit",
    "battle:waitingOpponent",
    {
      roomId: "room",
      answeredCount: 1,
      total: 1,
      myScore: 1,
      correctCount: 1,
      currentStreak: 0,
      bestStreak: 1,
      opponentName: "Vali",
      opponentPicture: "vali.png",
      opponentAnswered: 1,
      opponentScore: 0,
      opponentRating: 1400,
      opponentId: 7,
    },
  ]);
});

test("active reconnect preserves stats, opponent picture, payload, and log", async () => {
  const battle = {
    level: "B1",
    questions: [question()],
    players: {
      old: player(),
      enemy: player({ userId: 7, name: "Vali", answeredCount: 2 }),
    },
  };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
    queryResponses: [
      { rows: [{ is_correct: true }, { is_correct: true }] },
      { rows: [{ profile_picture: "vali.png" }] },
    ],
  });

  await harness.handler({ userId: 99 });

  const resumeCall = harness.calls.find(
    ([type, event]) => type === "socket-emit" && event === "battle:resumeState"
  );
  assert.equal(resumeCall[2].questions[0].correct_option, undefined);
  assert.deepEqual(resumeCall[2], {
    roomId: "room",
    questions: [{
      id: 11,
      question_text: "Choose",
      option_a: "A",
      option_b: "B",
      option_c: "C",
      option_d: "D",
    }],
    total_questions: 1,
    answeredCount: 1,
    myScore: 1,
    correctCount: 2,
    currentStreak: 2,
    bestStreak: 2,
    msLeft: 500,
    level: "B1",
    opponentAnswered: 2,
    opponentId: 7,
    opponentName: "Vali",
    opponentPicture: "vali.png",
  });
  assert.deepEqual(harness.calls.at(-1), [
    "log",
    "Reconnect: user 5 → room (savol 1, 500ms qoldi)",
  ]);
});

test("active reconnect preserves statistics error logging and defaults", async () => {
  const battle = {
    questions: [question()],
    players: { old: player(), enemy: player({ userId: null }) },
  };
  const harness = createHarness({
    battles: { room: battle },
    userToRoom: { 5: "room" },
    queryError: new Error("database unavailable"),
  });

  await harness.handler({ userId: 99 });

  assert.deepEqual(harness.calls.find(([type]) => type === "error"), [
    "error",
    "reconnect statistika xato:",
    "database unavailable",
  ]);
  const resumeCall = harness.calls.find(
    ([type, event]) => type === "socket-emit" && event === "battle:resumeState"
  );
  assert.equal(resumeCall[2].correctCount, 0);
  assert.equal(resumeCall[2].currentStreak, 0);
  assert.equal(resumeCall[2].bestStreak, 0);
});
