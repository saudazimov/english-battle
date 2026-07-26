const test = require("node:test");
const assert = require("node:assert/strict");

const { createBattleStartService } = require("../src/services/battleStartService");

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

function players() {
  return [
    { socketId: "socket-a", userId: 7, name: "Ali", level: "B1", lengthKey: "quick", mode: "ranked" },
    { socketId: "socket-b", userId: 8, name: "Vali", level: "B2" },
  ];
}

function createHarness({ queryResults = [], queryError, saveError, nowValues = [1000, 2000, 3000] } = {}) {
  const battles = {};
  const userToRoom = {};
  const calls = [];
  const results = queryResults.slice();
  const times = nowValues.slice();
  const startBattle = createBattleStartService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
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
      calls.push([
        "save",
        roomId,
        battle,
        { ...userToRoom },
        Object.values(battle.players).map((player) => player.socketId),
      ]);
      if (saveError) throw saveError;
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
  return { battles, calls, startBattle, userToRoom };
}

test("starts the same 1v1 battle with deadlines, pictures, persistence, and reconnect state", async () => {
  const [player1, player2] = players();
  const questions = [question(1), question(2)];
  const harness = createHarness({
    queryResults: [
      { rows: questions },
      { rows: [{ id: "7", profile_picture: "ali.png" }, { id: 8, profile_picture: "vali.png" }] },
    ],
  });

  await harness.startBattle("room_1", player1, player2);

  assert.deepEqual(harness.calls.find((call) => call[0] === "query")[2], ["B1", 2]);
  assert.deepEqual(harness.battles.room_1, {
    questions,
    level: "B1",
    lengthKey: "quick",
    mode: "ranked",
    createdAt: 1000,
    players: {
      "socket-a": {
        userId: 7, name: "Ali", score: 0, finished: false, answeredCount: 0,
        answeredIds: {}, qDeadline: 23000, socketId: "socket-a",
      },
      "socket-b": {
        userId: 8, name: "Vali", score: 0, finished: false, answeredCount: 0,
        answeredIds: {}, qDeadline: 24000, socketId: "socket-b",
      },
    },
    battleType: "1v1",
  });
  assert.deepEqual(harness.userToRoom, { 7: "room_1", 8: "room_1" });
  const saveCall = harness.calls.find((call) => call[0] === "save");
  assert.deepEqual(saveCall[3], {});
  assert.deepEqual(saveCall[4], [undefined, undefined]);
});

test("preserves separate safe payloads for both players", async () => {
  const [player1, player2] = players();
  const questions = [question(3)];
  const harness = createHarness({
    queryResults: [{ rows: questions }, { rows: [{ id: 7, profile_picture: "a.png" }] }],
  });

  await harness.startBattle("room_2", player1, player2);

  const emissions = harness.calls.filter((call) => call[0] === "emit");
  assert.deepEqual(emissions.map((call) => call.slice(1, 3)), [
    ["socket-a", "battleStart"], ["socket-b", "battleStart"],
  ]);
  assert.deepEqual(emissions[0][3], {
    total_questions: 1,
    questions: [{
      id: 3, question_text: "Question 3", option_a: "A", option_b: "B", option_c: "C", option_d: "D",
    }],
    myPicture: "a.png",
    opponentPicture: null,
    opponentName: "Vali",
    opponentId: 8,
    myName: "Ali",
    level: "B1",
  });
  assert.equal("correct_option" in emissions[0][3].questions[0], false);
  assert.equal(emissions[1][3].myPicture, null);
  assert.equal(emissions[1][3].opponentPicture, "a.png");
  assert.equal(emissions[1][3].opponentName, "Ali");
  assert.notEqual(emissions[0][3], emissions[1][3]);
  assert.ok(harness.calls.findIndex((call) => call[0] === "emit") < harness.calls.findIndex((call) => call[0] === "save"));
});

test("preserves fallback query and no-question errors for both players", async () => {
  const [player1, player2] = players();
  const fallback = createHarness({
    queryResults: [{ rows: [] }, { rows: [question(4)] }, { rows: [] }],
  });
  await fallback.startBattle("room_fallback", player1, player2);
  const fallbackQuery = fallback.calls.filter((call) => call[0] === "query")[1];
  assert.match(fallbackQuery[1], /FROM questions ORDER BY RANDOM\(\) LIMIT \$1/);
  assert.deepEqual(fallbackQuery[2], [2]);
  assert.ok(fallback.battles.room_fallback);

  const empty = createHarness({ queryResults: [{ rows: [] }, { rows: [] }] });
  await empty.startBattle("room_empty", player1, player2);
  const errors = empty.calls.filter((call) => call[0] === "emit");
  assert.deepEqual(errors.map((call) => call.slice(1, 3)), [
    ["socket-a", "battleError"], ["socket-b", "battleError"],
  ]);
  assert.notEqual(errors[0][3], errors[1][3]);
  assert.deepEqual(empty.battles, {});
  assert.equal(empty.calls.some((call) => call[0] === "save"), false);
});

test("keeps profile lookup optional and preserves save-failure ordering", async () => {
  const [player1, player2] = players();
  const profileFailure = createHarness({
    queryResults: [{ rows: [question(5)] }, new Error("profile failed")],
  });
  await profileFailure.startBattle("room_profile", player1, player2);
  const starts = profileFailure.calls.filter((call) => call[2] === "battleStart");
  assert.ok(starts.every((call) => call[3].myPicture === null && call[3].opponentPicture === null));
  assert.equal(profileFailure.calls.some((call) => call[0] === "save"), true);

  const saveFailure = createHarness({
    queryResults: [{ rows: [question(6)] }, { rows: [] }],
    saveError: new Error("save failed"),
  });
  await saveFailure.startBattle("room_save", player1, player2);
  assert.deepEqual(saveFailure.userToRoom, {});
  assert.equal(saveFailure.battles.room_save.players["socket-a"].socketId, undefined);
  assert.deepEqual(saveFailure.calls.at(-1), ["error", "Jang boshlashda xato:", "save failed"]);
});

test("preserves outer question-query error logging", async () => {
  const [player1, player2] = players();
  const harness = createHarness({ queryError: new Error("questions failed") });

  assert.equal(await harness.startBattle("room_error", player1, player2), undefined);
  assert.deepEqual(harness.calls.at(-1), ["error", "Jang boshlashda xato:", "questions failed"]);
  assert.deepEqual(harness.battles, {});
});
