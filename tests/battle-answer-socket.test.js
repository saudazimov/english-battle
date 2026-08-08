const test = require("node:test");
const assert = require("node:assert/strict");
const registerBattleAnswerSocket = require("../src/sockets/battleAnswerSocket");

function createBattle(playerOverrides = {}, battleOverrides = {}) {
  return {
    level: "B1",
    questions: [{
      id: 11,
      question_text: "Choose",
      option_a: "A",
      option_b: "B",
      option_c: "C",
      option_d: "D",
      correct_option: "B",
      explanation: "Because",
      skill: "grammar",
    }],
    players: {
      "socket-5": {
        userId: 5,
        score: 0,
        answeredCount: 0,
        finished: false,
        ...playerOverrides,
      },
      "socket-7": {
        userId: 7,
        score: 0,
        answeredCount: 1,
        finished: true,
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
    emit(...args) {
      calls.push(["emit", ...args]);
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
  registerBattleAnswerSocket({
    socket,
    battles,
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
        if (queryError) throw queryError;
        return { rows: [] };
      },
    },
    saveBattleSession(roomId, battle) {
      calls.push(["save", roomId, battle]);
    },
    finishBattle(roomId) {
      calls.push(["finish", roomId]);
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
    answerEventService: {
      async recordOneSafe() { return null; },
    },
  });
  return {
    calls,
    listeners,
    handler: listeners[0].handler,
  };
}

test("battle answer preserves listener registration", () => {
  const harness = createHarness();

  assert.deepEqual(harness.listeners.map(({ event }) => event), [
    "submitAnswer",
  ]);
});

test("missing battle, missing player, and finished player return silently", async () => {
  const battles = {
    noPlayer: createBattle({}, { players: {} }),
    finished: createBattle({ finished: true }),
  };
  const harness = createHarness({ battles });

  await harness.handler({ roomId: "missing", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "noPlayer", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "finished", questionId: 11, answer: "B" });

  assert.deepEqual(harness.calls, []);
});

test("malformed payloads and unsafe room lookups return silently", async () => {
  const inheritedBattle = createBattle();
  const battles = Object.create({ inherited: inheritedBattle });
  const harness = createHarness({ battles });

  await harness.handler();
  await harness.handler(null);
  await harness.handler("room");
  await harness.handler([]);
  await harness.handler({ roomId: "", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "x".repeat(257), questionId: 11, answer: "B" });
  await harness.handler({ roomId: "inherited", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "__proto__", questionId: 11, answer: "B" });

  assert.deepEqual(harness.calls, []);
});

test("inherited player membership is rejected and null-prototype maps remain valid", async () => {
  const inheritedPlayers = Object.create({
    "socket-5": createBattle().players["socket-5"],
  });
  const battles = Object.create(null);
  battles.inheritedPlayer = createBattle({}, { players: inheritedPlayers });

  const ownPlayers = Object.create(null);
  ownPlayers["socket-5"] = createBattle().players["socket-5"];
  ownPlayers["socket-7"] = createBattle().players["socket-7"];
  battles.valid = createBattle({}, { players: ownPlayers });
  const harness = createHarness({ battles });

  await harness.handler({ roomId: "inheritedPlayer", questionId: 11, answer: "B" });
  assert.deepEqual(harness.calls, []);

  await harness.handler({ roomId: "valid", questionId: 11, answer: "B" });
  assert.equal(ownPlayers["socket-5"].score, 1);
  assert.equal(harness.calls.some(([type]) => type === "query"), true);
});

test("malformed battle questions return silently", async () => {
  const battle = createBattle({}, { questions: null });
  const harness = createHarness({
    battles: {
      room: battle,
      missingPlayerState: createBattle({}, { players: { "socket-5": null } }),
    },
  });

  await harness.handler({ roomId: "room", questionId: 11, answer: "B" });
  await harness.handler({ roomId: "missingPlayerState", questionId: 11, answer: "B" });

  assert.deepEqual(harness.calls, []);
});

test("duplicate answer preserves response and avoids persistence", async () => {
  const battle = createBattle({ answeredIds: { 11: true }, answeredCount: 1 });
  const harness = createHarness({ battles: { room: battle } });

  await harness.handler({ roomId: "room", questionId: 11, answer: "B" });

  assert.deepEqual(harness.calls, [[
    "emit",
    "answerResult",
    { already_answered: true, my_score: 0, answered: 1 },
  ]]);
});

test("unknown question preserves answer containers and silent return", async () => {
  const battle = createBattle();
  const harness = createHarness({ battles: { room: battle } });

  await harness.handler({ roomId: "room", questionId: 99, answer: "B" });

  assert.deepEqual(harness.calls, []);
  assert.deepEqual(battle.players["socket-5"].answers, []);
  assert.deepEqual(battle.players["socket-5"].answeredIds, {});
});

test("correct final answer preserves state, SQL, save, emits, and finish order", async () => {
  const battle = createBattle({ qDeadline: 2000 });
  const harness = createHarness({ battles: { room: battle }, nowValue: 1000 });

  await harness.handler({ roomId: "room", questionId: 11, answer: "B" });

  const player = battle.players["socket-5"];
  assert.equal(player.score, 1);
  assert.equal(player.answeredCount, 1);
  assert.equal(player.qDeadline, 18000);
  assert.equal(player.finished, true);
  assert.deepEqual(player.answeredIds, { 11: true });
  assert.deepEqual(player.answers, [{
    question_id: 11,
    question_text: "Choose",
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    your_answer: "B",
    correct_answer: "B",
    is_correct: true,
    timed_out: false,
    explanation: "Because",
  }]);
  assert.match(harness.calls[1][1], /^INSERT INTO battle_answers/);
  assert.deepEqual(harness.calls[1][2], [
    "room", 5, 11, 1, "B", "B", true, false, "grammar", "B1",
  ]);
  assert.deepEqual(harness.calls.slice(2), [
    ["save", "room", battle],
    [
      "emit",
      "answerResult",
      {
        is_correct: true,
        timed_out: false,
        correct_answer: "B",
        my_score: 1,
        answered: 1,
      },
    ],
    ["to", "room"],
    ["room-emit", "opponentProgress", { answeredCount: 1 }],
    ["finish", "room"],
  ]);
});

test("timeout and DB error preserve timeout event and continuation", async () => {
  const battle = createBattle({ qDeadline: 900 });
  const harness = createHarness({
    battles: { room: battle },
    queryError: new Error("database unavailable"),
    nowValue: 1000,
  });

  await harness.handler({ roomId: "room", questionId: 11, answer: "B" });

  const player = battle.players["socket-5"];
  assert.equal(player.score, 0);
  assert.equal(player.answers[0].your_answer, null);
  assert.equal(player.answers[0].timed_out, true);
  assert.deepEqual(harness.calls.slice(2), [
    ["error", "battle_answers yozish xato:", "database unavailable"],
    ["save", "room", battle],
    [
      "emit",
      "answerResult",
      {
        is_correct: false,
        timed_out: true,
        correct_answer: "B",
        my_score: 0,
        answered: 1,
      },
    ],
    ["emit", "battle:answerTimeout", { questionId: 11 }],
    ["to", "room"],
    ["room-emit", "opponentProgress", { answeredCount: 1 }],
    ["finish", "room"],
  ]);
});

test("unfinished opponent preserves no finish call", async () => {
  const battle = createBattle({}, {
    players: {
      "socket-5": { userId: 5, score: 0, answeredCount: 0, finished: false },
      "socket-7": { userId: 7, score: 0, answeredCount: 0, finished: false },
    },
  });
  const harness = createHarness({ battles: { room: battle } });

  await harness.handler({ roomId: "room", questionId: 11, answer: null });

  assert.equal(harness.calls.some(([type]) => type === "finish"), false);
});
