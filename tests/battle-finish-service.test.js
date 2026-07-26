const test = require("node:test");
const assert = require("node:assert/strict");

const { createBattleFinishService } = require("../src/services/battleFinishService");

function battle(overrides = {}) {
  return {
    level: "B1",
    lengthKey: "quick",
    mode: "ranked",
    questions: [{ id: 1 }, { id: 2 }, { id: 3 }],
    players: {
      a: {
        userId: 1,
        name: "Ali",
        score: 3,
        answers: [{ questionId: 1 }],
      },
      b: {
        userId: 2,
        name: "Vali",
        score: 1,
        answers: [{ questionId: 2 }],
      },
    },
    ...overrides,
  };
}

function createHarness({
  currentBattle = battle(),
  resultErrorForUser,
  profileErrorForUser,
  finishSessionError,
} = {}) {
  const battles = currentBattle ? { room_1: currentBattle } : {};
  const userToRoom = { 1: "room_1", 2: "room_1", 99: "other_room" };
  const recentlyFinished = {};
  const calls = [];
  const timers = [];
  const finishBattle = createBattleFinishService({
    pool: {
      async query(sql, params) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        calls.push(["query", normalized, params]);
        if (/SELECT rating FROM users/.test(normalized)) {
          if (params[0] === resultErrorForUser) throw new Error("rating failed");
          return { rows: [{ rating: params[0] === 1 ? 990 : 1200 }] };
        }
        if (/UPDATE users SET/.test(normalized)) {
          return { rows: [{ id: params[3], rating: params[3] === 1 ? 1010 : 1180 }] };
        }
        if (/SELECT profile_picture FROM users/.test(normalized)) {
          if (params[0] === profileErrorForUser) throw new Error("profile failed");
          return { rows: [{ profile_picture: params[0] === 1 ? "ali.png" : "vali.png" }] };
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
    async finishBattleSession(roomId) {
      calls.push(["finishSession", roomId, { ...userToRoom }, { ...recentlyFinished }]);
      if (finishSessionError) throw finishSessionError;
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
    finishBattle,
    recentlyFinished,
    runTimers() {
      timers.forEach((timer) => timer.callback());
    },
    timers,
    userToRoom,
  };
}

test("preserves missing-battle guard", async () => {
  const harness = createHarness({ currentBattle: null });

  assert.equal(await harness.finishBattle("room_1"), undefined);
  assert.deepEqual(harness.calls, []);
});

test("preserves ranked scoring, DB history, rewards, pictures, and payload order", async () => {
  const harness = createHarness();

  await harness.finishBattle("room_1");

  assert.equal(harness.calls.filter((call) => call[0] === "lengthConfig").length, 2);
  const updates = harness.calls.filter((call) => call[0] === "query" && call[1].startsWith("UPDATE users SET"));
  assert.deepEqual(updates.map((call) => call[2]), [
    [8, 2, 20, 1],
    [2, 2, -20, 2],
  ]);
  assert.match(updates[0][1], /win_streak = win_streak \+ 1/);
  assert.match(updates[1][1], /win_streak = 0/);

  const histories = harness.calls.filter((call) => call[0] === "query" && call[1].startsWith("INSERT INTO battle_history"));
  assert.deepEqual(histories.map((call) => call[2]), [
    [1, "Vali", 2, 3, 1, "win", 8, 20, "B1", "ranked", 3, "room_1"],
    [2, "Ali", 1, 1, 3, "lose", 2, -20, "B1", "ranked", 3, "room_1"],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "quest"), [
    ["quest", 1, { won: true, correctAnswers: 3, xpEarned: 8 }],
    ["quest", 2, { won: false, correctAnswers: 1, xpEarned: 2 }],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "schoolPoints"), [
    ["schoolPoints", 1, 10, "ranked_win"],
  ]);

  const emissions = harness.calls.filter((call) => call[0] === "emit");
  assert.deepEqual(emissions.map((call) => call.slice(1, 3)), [
    ["a", "battleEnd"], ["b", "battleEnd"],
  ]);
  assert.deepEqual(emissions[0][3], {
    outcome: "win",
    your_score: 3,
    opponent_score: 1,
    total: 3,
    lengthKey: "quick",
    mode: "ranked",
    xp_earned: 8,
    coins_earned: 2,
    rewards: { xp: 8, coins: 2, ratingChange: 20 },
    rating_change: 20,
    updated_user: { id: 1, rating: 1010 },
    answers: [{ questionId: 1 }],
    league_change: { old: "Bronze", new: "Silver", promoted: true },
    opponent_picture: "vali.png",
  });
  assert.equal(emissions[1][3].outcome, "lose");
  assert.equal(emissions[1][3].opponent_picture, "ali.png");
  assert.equal(emissions[1][3].league_change, null);
});

test("preserves session-before-reconnect cleanup and five-minute result mapping", async () => {
  const harness = createHarness();

  await harness.finishBattle("room_1");

  const finishSession = harness.calls.find((call) => call[0] === "finishSession");
  assert.deepEqual(finishSession, [
    "finishSession", "room_1", { 1: "room_1", 2: "room_1", 99: "other_room" }, {},
  ]);
  assert.deepEqual(harness.userToRoom, { 99: "other_room" });
  assert.deepEqual(harness.recentlyFinished, { 1: "room_1", 2: "room_1" });
  assert.deepEqual(harness.timers.map((timer) => timer.delay), [300000, 300000]);
  assert.equal(harness.battles.room_1, undefined);

  harness.runTimers();
  assert.deepEqual(harness.recentlyFinished, {});
});

test("preserves forfeit winner and casual zero-rating behavior", async () => {
  const currentBattle = battle({
    mode: "casual",
    players: {
      a: { userId: null, name: "Ali", score: 10, disconnected: true },
      b: { userId: null, name: "Vali", score: 1 },
    },
  });
  const harness = createHarness({ currentBattle });

  await harness.finishBattle("room_1");

  const payloads = harness.calls.filter((call) => call[0] === "emit").map((call) => call[3]);
  assert.equal(payloads[0].outcome, "lose");
  assert.equal(payloads[0].rating_change, 0);
  assert.equal(payloads[0].xp_earned, 2);
  assert.equal(payloads[1].outcome, "win");
  assert.equal(payloads[1].rating_change, 0);
  assert.equal(payloads[1].xp_earned, 8);
  assert.equal(harness.calls.some((call) => call[0] === "schoolPoints"), false);
});

test("preserves ranked draw streak, XP, and school points", async () => {
  const currentBattle = battle({
    players: {
      a: { userId: 1, name: "Ali", score: 2 },
      b: { userId: 2, name: "Vali", score: 2 },
    },
  });
  const harness = createHarness({ currentBattle });

  await harness.finishBattle("room_1");

  const updates = harness.calls.filter((call) => call[0] === "query" && call[1].startsWith("UPDATE users SET"));
  assert.ok(updates.every((call) => /win_streak = win_streak/.test(call[1])));
  assert.deepEqual(updates.map((call) => call[2]), [[4, 2, 0, 1], [4, 2, 0, 2]]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "schoolPoints"), [
    ["schoolPoints", 1, 5, "ranked_draw"],
    ["schoolPoints", 2, 5, "ranked_draw"],
  ]);
  assert.ok(harness.calls.filter((call) => call[0] === "emit").every((call) => call[3].outcome === "draw"));
});

test("preserves per-player DB/profile fallback and session-error cleanup boundary", async () => {
  const fallback = createHarness({ resultErrorForUser: 1, profileErrorForUser: 2 });
  await fallback.finishBattle("room_1");
  assert.deepEqual(fallback.calls.find((call) => call[0] === "error"), [
    "error", "Natijani saqlashda xato:", "rating failed",
  ]);
  const aliResult = fallback.calls.find((call) => call[0] === "emit" && call[1] === "a");
  assert.equal(aliResult[3].updated_user, null);
  assert.equal(aliResult[3].opponent_picture, null);
  assert.equal(fallback.calls.some((call) => call[0] === "emit" && call[1] === "b"), true);

  const sessionFailure = createHarness({ finishSessionError: new Error("finish failed") });
  await assert.rejects(() => sessionFailure.finishBattle("room_1"), { message: "finish failed" });
  assert.ok(sessionFailure.battles.room_1);
  assert.deepEqual(sessionFailure.userToRoom, { 1: "room_1", 2: "room_1", 99: "other_room" });
  assert.deepEqual(sessionFailure.recentlyFinished, {});
  assert.equal(sessionFailure.timers.length, 0);
});
