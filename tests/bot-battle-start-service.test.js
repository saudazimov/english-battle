const test = require("node:test");
const assert = require("node:assert/strict");

const { createBotBattleStartService } = require("../src/services/botBattleStartService");

function question(id = 1) {
  return {
    id,
    question_text: `Question ${id}`,
    option_a: "A",
    option_b: "B",
    option_c: "C",
    option_d: "D",
    correct_option: "A",
    explanation: "Because",
    skill: "grammar",
  };
}

function createHarness({ queryResults = [], queryError, nowValues = [1000, 2000] } = {}) {
  const battles = {};
  const userToRoom = {};
  const calls = [];
  const results = queryResults.slice();
  const times = nowValues.slice();
  const startBotBattle = createBotBattleStartService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql, params]);
        if (queryError) throw queryError;
        const result = results.shift();
        if (result instanceof Error) throw result;
        return result;
      },
    },
    io: {
      to(socketId) {
        return {
          emit(event, payload) {
            calls.push(["emit", socketId, event, payload]);
          },
        };
      },
    },
    battles,
    userToRoom,
    lengthConfig(lengthKey) {
      calls.push(["lengthConfig", lengthKey]);
      return { questions: 2 };
    },
    async saveBattleSession(roomId, battle) {
      calls.push(["save", roomId, battle]);
    },
    simulateBotAnswers(roomId, botId, questions) {
      calls.push(["simulate", roomId, botId, questions]);
    },
    firstQuestionGraceMs: 6000,
    timePerQuestionMs: 15000,
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
    now() {
      return times.shift();
    },
  });

  return { battles, calls, startBotBattle, userToRoom };
}

function player(overrides = {}) {
  return {
    socketId: "socket_1",
    userId: 7,
    name: "Ali",
    botName: "Grammar Bot",
    level: "B1",
    lengthKey: "quick",
    mode: "ranked",
    ...overrides,
  };
}

test("starts a bot battle with the same state, safe payload, and persistence order", async () => {
  const questions = [question(1), question(2)];
  const harness = createHarness({
    queryResults: [{ rows: questions }, { rows: [{ profile_picture: "ali.png" }] }],
  });

  await harness.startBotBattle("room_1", player());

  assert.match(harness.calls[1][1], /WHERE cefr_level = \$1/);
  assert.deepEqual(harness.calls[1][2], ["B1", 2]);
  assert.match(harness.calls[2][1], /SELECT profile_picture FROM users/);
  assert.deepEqual(harness.calls[2][2], [7]);
  assert.deepEqual(harness.battles.room_1, {
    questions,
    isBot: true,
    botId: "bot_room_1",
    level: "B1",
    lengthKey: "quick",
    mode: "ranked",
    createdAt: 1000,
    players: {
      socket_1: {
        userId: 7,
        name: "Ali",
        score: 0,
        finished: false,
        answeredCount: 0,
        answeredIds: {},
        qDeadline: 23000,
        socketId: "socket_1",
      },
      bot_room_1: {
        userId: null,
        name: "Grammar Bot",
        score: 0,
        finished: false,
        answeredCount: 0,
        isBot: true,
      },
    },
    battleType: "1v1",
  });
  const emitted = harness.calls.find((call) => call[0] === "emit");
  assert.deepEqual(emitted, ["emit", "socket_1", "battleStart", {
    total_questions: 2,
    questions: questions.map(({ id, question_text, option_a, option_b, option_c, option_d }) => ({
      id, question_text, option_a, option_b, option_c, option_d,
    })),
    myPicture: "ali.png",
    opponentPicture: null,
    opponentName: "Grammar Bot",
    opponentId: null,
    myName: "Ali",
    level: "B1",
  }]);
  assert.equal(harness.userToRoom[7], "room_1");
  assert.ok(harness.calls.findIndex((call) => call[0] === "save") < harness.calls.findIndex((call) => call[0] === "simulate"));
});

test("falls back to questions from any level when the selected level is empty", async () => {
  const fallbackQuestions = [question(3)];
  const harness = createHarness({
    queryResults: [{ rows: [] }, { rows: fallbackQuestions }, { rows: [] }],
  });

  await harness.startBotBattle("room_2", player());

  assert.deepEqual(harness.calls[2], ["log", "'B1' uchun savol yo'q — zaxira savollar olinmoqda"]);
  assert.match(harness.calls[3][1], /FROM questions ORDER BY RANDOM\(\) LIMIT \$1/);
  assert.deepEqual(harness.calls[3][2], [2]);
  assert.equal(harness.battles.room_2.questions, fallbackQuestions);
});

test("emits the same error and does not start a battle when no questions exist", async () => {
  const harness = createHarness({ queryResults: [{ rows: [] }, { rows: [] }] });

  await harness.startBotBattle("room_empty", player());

  assert.deepEqual(harness.calls[4], ["emit", "socket_1", "battleError", {
    message: "Hozircha savollar mavjud emas. Keyinroq urinib ko'ring.",
  }]);
  assert.deepEqual(harness.calls[5], ["error", "Bazada umuman savol yo'q!"]);
  assert.equal(harness.battles.room_empty, undefined);
  assert.equal(harness.calls.some((call) => call[0] === "save" || call[0] === "simulate"), false);
});

test("keeps profile picture optional and skips reconnect mapping for a missing user id", async () => {
  const questions = [question(4)];
  const harness = createHarness({ queryResults: [{ rows: questions }] });

  await harness.startBotBattle("room_guest", player({ userId: null }));

  assert.equal(harness.calls.filter((call) => call[0] === "query").length, 1);
  assert.deepEqual(harness.userToRoom, {});
  assert.equal(harness.calls.find((call) => call[2] === "battleStart")[3].myPicture, null);
});

test("preserves optional profile failure and outer query failure behavior", async () => {
  const questions = [question(5)];
  const profileFailure = createHarness({
    queryResults: [{ rows: questions }, new Error("profile failed")],
  });
  await profileFailure.startBotBattle("room_profile", player());
  assert.equal(profileFailure.calls.find((call) => call[2] === "battleStart")[3].myPicture, null);
  assert.equal(profileFailure.calls.some((call) => call[0] === "save"), true);

  const queryFailure = createHarness({ queryError: new Error("questions failed") });
  await queryFailure.startBotBattle("room_error", player());
  assert.deepEqual(queryFailure.calls.at(-1), ["error", "Bot jang xatosi:", "questions failed"]);
  assert.deepEqual(queryFailure.battles, {});
});
