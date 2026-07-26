const test = require("node:test");
const assert = require("node:assert/strict");

const { createTeamBattleFinishService } = require("../src/services/teamBattleFinishService");

function battle(overrides = {}) {
  return {
    teamMode: "duo",
    level: "B1",
    lengthKey: "quick",
    questions: [{ id: 1 }, { id: 2 }, { id: 3 }],
    teams: { A: ["a1", "a2"], B: ["b1"] },
    players: {
      a1: {
        userId: 1, name: "Ali", score: 3, team: "A", isBot: false,
        level: "B1", rating: 990, profile_picture: "a.png", answeredCount: 3,
        answers: [{ questionId: 1 }],
      },
      a2: {
        userId: null, name: "Bot", score: 1, team: "A", isBot: true,
        level: "B1", rating: 1000, profile_picture: null, answeredCount: 3,
      },
      b1: {
        userId: 2, name: "Vali", score: 2, team: "B", isBot: false,
        level: "B1", rating: 1200, profile_picture: "b.png", answeredCount: 3,
      },
    },
    ...overrides,
  };
}

function createHarness({ currentBattle = battle(), queryErrorForUser, snapshotError } = {}) {
  const battles = currentBattle ? { room_1: currentBattle } : {};
  const userToRoom = { 1: "room_1", 2: "room_1", 99: "other_room" };
  const recentlyFinished = {};
  const calls = [];
  const timers = [];
  const finishTeamBattle = createTeamBattleFinishService({
    pool: {
      async query(sql, params) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        calls.push(["query", normalized, params]);
        if (/SELECT rating FROM users/.test(normalized)) {
          if (params[0] === queryErrorForUser) throw new Error("rating failed");
          return { rows: [{ rating: params[0] === 1 ? 990 : 1200 }] };
        }
        if (/UPDATE users SET/.test(normalized)) {
          return { rows: [{ id: params[3], rating: params[3] === 1 ? 1010 : 1180 }] };
        }
        if (/UPDATE battle_sessions SET/.test(normalized) && snapshotError) {
          throw snapshotError;
        }
        return { rows: [] };
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
    recentlyFinished,
    lengthConfig(lengthKey) {
      calls.push(["lengthConfig", lengthKey]);
      return { xp: 8, coins: 2 };
    },
    getLeagueName(rating) {
      calls.push(["league", rating]);
      return rating < 1000 ? "Bronze" : "Silver";
    },
    async updateQuestProgress(userId, progress) {
      calls.push(["quest", userId, progress]);
    },
    async awardSchoolPoints(userId, points, reason) {
      calls.push(["schoolPoints", userId, points, reason]);
    },
    finishBattleSession(roomId) {
      calls.push(["finishSession", roomId]);
      return Promise.resolve();
    },
    logger: {
      log(...args) {
        calls.push(["log", ...args]);
      },
      error(...args) {
        calls.push(["error", ...args]);
      },
    },
    setTimeoutFn(callback, delay) {
      calls.push(["timer", delay]);
      timers.push({ callback, delay });
    },
  });
  return {
    battles,
    calls,
    finishTeamBattle,
    recentlyFinished,
    runTimers(delay) {
      timers.filter((timer) => timer.delay === delay).forEach((timer) => timer.callback());
    },
    timers,
    userToRoom,
  };
}

test("preserves missing and already-finished guards", async () => {
  const missing = createHarness({ currentBattle: null });
  assert.equal(await missing.finishTeamBattle("room_1"), undefined);
  assert.deepEqual(missing.calls, []);

  const finishedBattle = battle({ finished: true });
  const finished = createHarness({ currentBattle: finishedBattle });
  assert.equal(await finished.finishTeamBattle("room_1"), undefined);
  assert.deepEqual(finished.calls, []);
  assert.equal(finishedBattle.finished, true);
});

test("preserves scoring, DB rewards, result payloads, and player order", async () => {
  const harness = createHarness();

  await harness.finishTeamBattle("room_1");

  assert.equal(harness.battles.room_1.finished, true);
  assert.equal(harness.calls.filter((call) => call[0] === "lengthConfig").length, 2);
  const updates = harness.calls.filter((call) => call[0] === "query" && call[1].startsWith("UPDATE users SET"));
  assert.deepEqual(updates.map((call) => call[2]), [
    [8, 2, 20, 1],
    [2, 2, -20, 2],
  ]);
  const histories = harness.calls.filter((call) => call[0] === "query" && call[1].startsWith("INSERT INTO battle_history"));
  assert.deepEqual(histories.map((call) => call[2]), [
    [1, "Duo jamoa", null, 4, 2, "win", 8, 20, "B1", "school", "room_1"],
    [2, "Duo jamoa", null, 2, 4, "lose", 2, -20, "B1", "school", "room_1"],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "quest"), [
    ["quest", 1, { won: true, correctAnswers: 3, xpEarned: 8 }],
    ["quest", 2, { won: false, correctAnswers: 2, xpEarned: 2 }],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "schoolPoints"), [
    ["schoolPoints", 1, 15, "team_win"],
  ]);

  const emissions = harness.calls.filter((call) => call[0] === "emit");
  assert.deepEqual(emissions.map((call) => call.slice(1, 3)), [
    ["a1", "teamBattleEnd"], ["b1", "teamBattleEnd"],
  ]);
  assert.deepEqual(emissions[0][3], {
    outcome: "win",
    teamMode: "duo",
    myTeam: "A",
    myTeamScore: 4,
    enemyTeamScore: 2,
    myTeamPlayers: [{ name: "Ali", score: 3, isBot: false }, { name: "Bot", score: 1, isBot: true }],
    enemyTeamPlayers: [{ name: "Vali", score: 2, isBot: false }],
    myScore: 3,
    total: 3,
    lengthKey: "quick",
    xp_earned: 8,
    coins_earned: 2,
    rewards: { xp: 8, coins: 2, ratingChange: 20 },
    rating_change: 20,
    updated_user: { id: 1, rating: 1010 },
    answers: [{ questionId: 1 }],
    league_change: { old: "Bronze", new: "Silver", promoted: true },
  });
  assert.equal(emissions[1][3].outcome, "lose");
  assert.equal(emissions[1][3].xp_earned, 2);
  assert.equal(emissions[1][3].league_change, null);
});

test("preserves reconnect cleanup, result snapshot, and timer behavior", async () => {
  const harness = createHarness();

  await harness.finishTeamBattle("room_1");

  assert.deepEqual(harness.userToRoom, { 99: "other_room" });
  assert.deepEqual(harness.recentlyFinished, { 1: "room_1", 2: "room_1" });
  assert.deepEqual(harness.timers.map((timer) => timer.delay), [300000, 300000, 30000]);
  assert.equal(harness.calls.some((call) => call[0] === "finishSession" && call[1] === "room_1"), true);
  const snapshotQuery = harness.calls.find((call) => call[0] === "query" && call[1].startsWith("UPDATE battle_sessions SET"));
  const snapshot = JSON.parse(snapshotQuery[2][1]).result_snapshot;
  assert.deepEqual(snapshot, {
    isTeamResult: true,
    teamMode: "duo",
    level: "B1",
    total_questions: 3,
    winningTeam: "A",
    teamAScore: 4,
    teamBScore: 2,
    teamA: [
      { name: "Ali", userId: 1, score: 3, isBot: false, level: "B1", rating: 990, profile_picture: "a.png", answeredCount: 3 },
      { name: "Bot", userId: null, score: 1, isBot: true, level: "B1", rating: 1000, profile_picture: null, answeredCount: 3 },
    ],
    teamB: [
      { name: "Vali", userId: 2, score: 2, isBot: false, level: "B1", rating: 1200, profile_picture: "b.png", answeredCount: 3 },
    ],
    playerTeams: { 1: "A", 2: "B" },
  });

  harness.runTimers(300000);
  assert.deepEqual(harness.recentlyFinished, {});
  harness.runTimers(30000);
  assert.equal(harness.battles.room_1, undefined);
});

test("preserves forfeit and draw outcome rules", async () => {
  const forfeitBattle = battle({
    teams: { A: ["a1"], B: ["b1"] },
    players: {
      a1: { userId: null, name: "A", score: 10, team: "A", isBot: false, disconnected: true },
      b1: { userId: null, name: "B", score: 1, team: "B", isBot: false },
    },
  });
  const forfeit = createHarness({ currentBattle: forfeitBattle });
  await forfeit.finishTeamBattle("room_1");
  const forfeitEmits = forfeit.calls.filter((call) => call[0] === "emit");
  assert.equal(forfeitEmits[0][3].outcome, "lose");
  assert.equal(forfeitEmits[1][3].outcome, "win");

  const drawBattle = battle({
    teams: { A: ["a1"], B: ["b1"] },
    players: {
      a1: { userId: null, name: "A", score: 2, team: "A", isBot: false },
      b1: { userId: null, name: "B", score: 2, team: "B", isBot: false },
    },
  });
  const draw = createHarness({ currentBattle: drawBattle });
  await draw.finishTeamBattle("room_1");
  const drawPayloads = draw.calls.filter((call) => call[0] === "emit").map((call) => call[3]);
  assert.ok(drawPayloads.every((payload) => payload.outcome === "draw"));
  assert.ok(drawPayloads.every((payload) => payload.xp_earned === 4 && payload.rating_change === 0));
});

test("preserves per-player DB error fallback and snapshot rejection logging", async () => {
  const harness = createHarness({
    queryErrorForUser: 1,
    snapshotError: new Error("snapshot failed"),
  });

  await harness.finishTeamBattle("room_1");
  await Promise.resolve();

  assert.deepEqual(harness.calls.find((call) => call[0] === "error"), [
    "error", "Jamoa natijani saqlashda xato:", "rating failed",
  ]);
  const aliResult = harness.calls.find((call) => call[0] === "emit" && call[1] === "a1");
  assert.equal(aliResult[3].updated_user, null);
  assert.equal(harness.calls.some((call) => call[0] === "emit" && call[1] === "b1"), true);
  assert.equal(harness.calls.some((call) => call[0] === "error" && call[1] === "Jamoa natija snapshot xato:" && call[2] === "snapshot failed"), true);
});
