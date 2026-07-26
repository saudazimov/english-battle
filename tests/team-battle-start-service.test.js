const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamBattleStartService } = require("../src/services/teamBattleStartService");

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

function group() {
  return [
    { socketId: "a1", userId: 1, name: "Ali", level: "B1", lengthKey: "quick", rating: 1100, profile_picture: "a.png" },
    { socketId: "a2", userId: null, name: "Bot", level: "B1", rating: 1000, isBot: true },
    { socketId: "b1", userId: 2, name: "Vali", level: "B1", rating: 1050, profile_picture: "v.png" },
    { socketId: "b2", userId: 3, name: "Sami", level: "B1" },
  ];
}

function createHarness({ queryResults = [], queryError, nowValues = [1000, 2000, 3000, 4000, 5000, 6000] } = {}) {
  const battles = {};
  const userToRoom = {};
  const calls = [];
  const results = queryResults.slice();
  const times = nowValues.slice();
  const startTeamBattle = createTeamBattleStartService({
    pool: {
      async query(sql, params) {
        calls.push(["query", sql.replace(/\s+/g, " ").trim(), params]);
        if (queryError) throw queryError;
        return results.shift();
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
    saveBattleSession(roomId, battle) {
      calls.push(["save", roomId, battle]);
    },
    simulateTeamBotAnswers(roomId, botId, questions) {
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
    random() {
      return 0.25;
    },
  });
  return { battles, calls, startTeamBattle, userToRoom };
}

test("starts the same team battle with deterministic teams, deadlines, and reconnect state", async () => {
  const questions = [question(1), question(2)];
  const harness = createHarness({ queryResults: [{ rows: questions }] });

  await harness.startTeamBattle(group(), "duo", 2);

  const roomId = "team_duo_1000_250";
  assert.deepEqual(harness.calls[1][2], ["B1", 2]);
  assert.deepEqual(harness.battles[roomId], {
    isTeam: true,
    teamMode: "duo",
    battleType: "2v2",
    questions,
    level: "B1",
    lengthKey: "quick",
    createdAt: 6000,
    teams: { A: ["a1", "a2"], B: ["b1", "b2"] },
    players: {
      a1: {
        userId: 1, name: "Ali", socketId: "a1", level: "B1", rating: 1100,
        profile_picture: "a.png", score: 0, finished: false, answeredCount: 0,
        answers: [], answeredIds: {}, qDeadline: 23000, team: "A", isBot: false,
      },
      a2: {
        userId: null, name: "Bot", socketId: "a2", level: "B1", rating: 1000,
        profile_picture: null, score: 0, finished: false, answeredCount: 0,
        answers: [], answeredIds: {}, qDeadline: 24000, team: "A", isBot: true,
      },
      b1: {
        userId: 2, name: "Vali", socketId: "b1", level: "B1", rating: 1050,
        profile_picture: "v.png", score: 0, finished: false, answeredCount: 0,
        answers: [], answeredIds: {}, qDeadline: 25000, team: "B", isBot: false,
      },
      b2: {
        userId: 3, name: "Sami", socketId: "b2", level: "B1", rating: 1000,
        profile_picture: null, score: 0, finished: false, answeredCount: 0,
        answers: [], answeredIds: {}, qDeadline: 26000, team: "B", isBot: false,
      },
    },
  });
  assert.deepEqual(harness.userToRoom, { 1: roomId, 2: roomId, 3: roomId });
  assert.equal(harness.calls.filter((call) => call[0] === "emit").length, 3);
  assert.equal(harness.calls.some((call) => call[0] === "emit" && call[1] === "a2"), false);
});

test("preserves safe per-player payloads and persistence-before-notification order", async () => {
  const questions = [question(8)];
  const harness = createHarness({ queryResults: [{ rows: questions }] });

  await harness.startTeamBattle(group(), "duo", 2);

  const saveIndex = harness.calls.findIndex((call) => call[0] === "save");
  const firstEmitIndex = harness.calls.findIndex((call) => call[0] === "emit");
  const aliPayload = harness.calls.find((call) => call[0] === "emit" && call[1] === "a1")[3];
  const valiPayload = harness.calls.find((call) => call[0] === "emit" && call[1] === "b1")[3];
  assert.ok(saveIndex < firstEmitIndex);
  assert.deepEqual(aliPayload.questions, [{
    id: 8, question_text: "Question 8", option_a: "A", option_b: "B", option_c: "C", option_d: "D",
  }]);
  assert.equal("correct_option" in aliPayload.questions[0], false);
  assert.equal(aliPayload.myTeam, "A");
  assert.deepEqual(aliPayload.myTeamPlayers.map((player) => player.name), ["Ali", "Bot"]);
  assert.equal(valiPayload.myTeam, "B");
  assert.deepEqual(valiPayload.enemyTeamPlayers.map((player) => player.name), ["Ali", "Bot"]);
  const logIndex = harness.calls.findIndex((call) => call[0] === "log");
  const simulateIndex = harness.calls.findIndex((call) => call[0] === "simulate");
  assert.ok(logIndex < simulateIndex);
  assert.deepEqual(harness.calls[simulateIndex], ["simulate", "team_duo_1000_250", "a2", questions]);
});

test("preserves fallback query and emits an error to every group member when no questions exist", async () => {
  const players = group();
  const fallback = createHarness({ queryResults: [{ rows: [] }, { rows: [question(9)] }] });
  await fallback.startTeamBattle(players, "duo", 2);
  assert.match(fallback.calls[2][1], /FROM questions ORDER BY RANDOM\(\) LIMIT \$1/);
  assert.deepEqual(fallback.calls[2][2], [2]);
  assert.ok(fallback.battles.team_duo_1000_250);

  const empty = createHarness({ queryResults: [{ rows: [] }, { rows: [] }] });
  await empty.startTeamBattle(players, "duo", 2);
  const errors = empty.calls.filter((call) => call[0] === "emit");
  assert.deepEqual(errors.map((call) => call[1]), ["a1", "a2", "b1", "b2"]);
  assert.ok(errors.every((call) => call[2] === "battleError" && call[3].message === "Hozircha savollar mavjud emas."));
  assert.deepEqual(empty.battles, {});
  assert.equal(empty.calls.some((call) => call[0] === "save" || call[0] === "simulate"), false);
});

test("preserves outer error logging", async () => {
  const harness = createHarness({ queryError: new Error("questions failed") });

  assert.equal(await harness.startTeamBattle(group(), "duo", 2), undefined);
  assert.deepEqual(harness.calls.at(-1), ["error", "startTeamBattle xatosi:", "questions failed"]);
  assert.deepEqual(harness.battles, {});
});
