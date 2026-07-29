const test = require("node:test");
const assert = require("node:assert/strict");
const registerTeamBattleAnswerSocket = require("../src/sockets/teamBattleAnswerSocket");

function createBattle(playerOverrides = {}, battleOverrides = {}) {
  return {
    isTeam: true,
    level: "B1",
    questions: [
      { id: 11, correct_option: "B", skill: "grammar" },
      { id: 12, correct_option: "C", skill: null },
    ],
    players: {
      "socket-5": {
        userId: 5,
        score: 0,
        answeredCount: 0,
        answers: [],
        finished: false,
        ...playerOverrides,
      },
    },
    ...battleOverrides,
  };
}

function createHarness({ battles = {}, queryError, nowValue = 1000 } = {}) {
  const calls = [];
  const listeners = [];
  const socket = {
    id: "socket-5",
    on(event, handler) {
      listeners.push({ event, handler });
    },
  };
  registerTeamBattleAnswerSocket({
    socket,
    battles,
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
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
        if (queryError) throw queryError;
        return { rows: [] };
      },
    },
    emitTeamProgress(roomId) {
      calls.push(["progress", roomId]);
    },
    checkTeamFinish(roomId) {
      calls.push(["finishCheck", roomId]);
    },
    timePerQuestionMs: 15000,
    answerGraceMs: 2000,
    now() {
      calls.push(["now"]);
      return nowValue;
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
    handler: listeners[0].handler,
  };
}

test("team battle answer preserves listener registration", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "submitTeamAnswer",
  ]);
});

test("missing, non-team, missing-player, and finished battles return silently", async () => {
  const battles = {
    nonTeam: createBattle({}, { isTeam: false }),
    noPlayer: createBattle({}, { players: {} }),
    finished: createBattle({ finished: true }),
  };
  const harness = createHarness({ battles });

  await harness.handler({ roomId: "missing", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "nonTeam", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "noPlayer", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "finished", questionId: 11, answer: "B" });

  assert.deepEqual(harness.calls, []);
});

test("duplicate answer preserves response and avoids state changes", async () => {
  const battle = createBattle({ answeredIds: { 11: true }, answeredCount: 1 });
  const harness = createHarness({ battles: { room: battle } });

  await harness.handler({ roomId: "room", questionId: 11, answer: "B" });

  assert.deepEqual(harness.calls, [
    ["to", "socket-5"],
    [
      "emit",
      "teamAnswerResult",
      { already_answered: true, answeredCount: 1, total: 2, myScore: 0 },
    ],
  ]);
  assert.equal(battle.players["socket-5"].score, 0);
});

test("unknown question preserves silent return after answeredIds initialization", async () => {
  const battle = createBattle();
  const harness = createHarness({ battles: { room: battle } });

  await harness.handler({ roomId: "room", questionId: 99, answer: "B" });

  assert.deepEqual(harness.calls, []);
  assert.deepEqual(battle.players["socket-5"].answeredIds, {});
});

test("correct answer preserves state, SQL, response, and completion order", async () => {
  const battle = createBattle({ qDeadline: 2000 });
  const harness = createHarness({ battles: { room: battle }, nowValue: 1000 });

  await harness.handler({ roomId: "room", questionId: 11, answer: "B" });

  const player = battle.players["socket-5"];
  assert.deepEqual(player, {
    userId: 5,
    score: 1,
    answeredCount: 1,
    answers: [{
      questionId: 11,
      selected: "B",
      correct: "B",
      isCorrect: true,
      timedOut: false,
    }],
    finished: false,
    qDeadline: 18000,
    answeredIds: { 11: true },
  });
  assert.match(harness.calls[1][1], /^INSERT INTO battle_answers/);
  assert.deepEqual(harness.calls[1][2], [
    "room", 5, 11, 1, "B", "B", true, false, "grammar", "B1",
  ]);
  assert.deepEqual(harness.calls.slice(2), [
    ["to", "socket-5"],
    [
      "emit",
      "teamAnswerResult",
      {
        isCorrect: true,
        timed_out: false,
        correct_option: "B",
        answeredCount: 1,
        total: 2,
        myScore: 1,
      },
    ],
    ["progress", "room"],
    ["finishCheck", "room"],
  ]);
});

test("timeout preserves null selection, finish state, and DB-error continuation", async () => {
  const battle = createBattle({ answeredCount: 1, qDeadline: 900 });
  const harness = createHarness({
    battles: { room: battle },
    queryError: new Error("database unavailable"),
    nowValue: 1000,
  });

  await harness.handler({ roomId: "room", questionId: 12, answer: "C" });

  const player = battle.players["socket-5"];
  assert.equal(player.score, 0);
  assert.equal(player.finished, true);
  assert.deepEqual(player.answers, [{
    questionId: 12,
    selected: null,
    correct: "C",
    isCorrect: false,
    timedOut: true,
  }]);
  assert.deepEqual(harness.calls[1][2], [
    "room", 5, 12, 2, null, "C", false, true, null, "B1",
  ]);
  assert.deepEqual(harness.calls.slice(2), [
    ["error", "team battle_answers yozish xato:", "database unavailable"],
    ["to", "socket-5"],
    [
      "emit",
      "teamAnswerResult",
      {
        isCorrect: false,
        timed_out: true,
        correct_option: "C",
        answeredCount: 2,
        total: 2,
        myScore: 0,
      },
    ],
    ["progress", "room"],
    ["finishCheck", "room"],
  ]);
});

test("empty answer preserves timeout with fallback deadline", async () => {
  const battle = createBattle();
  const harness = createHarness({ battles: { room: battle }, nowValue: 1000 });

  await harness.handler({ roomId: "room", questionId: 11, answer: "" });

  assert.equal(battle.players["socket-5"].qDeadline, 18000);
  assert.equal(battle.players["socket-5"].answers[0].timedOut, true);
  assert.equal(battle.players["socket-5"].answers[0].selected, null);
});
