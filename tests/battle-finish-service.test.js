const test = require("node:test");
const assert = require("node:assert/strict");

const { createBattleFinishService } = require("../src/services/battleFinishService");

function battle(overrides = {}) {
  return {
    level: "B1",
    lengthKey: "quick",
    mode: "ranked",
    battleType: "1v1",
    questions: Array.from({ length: 10 }, (_, index) => ({ id: index + 1 })),
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
  const client = {
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push(["query", normalized, params]);
      if (/UPDATE users SET/.test(normalized)) {
        const userId = params[5];
        if (userId === resultErrorForUser) throw new Error("rating failed");
        return {
          rows: [{
            id: userId,
            rating: params[2] ? params[3] : (userId === 1 ? 990 : 1200),
            cefr_level: params[2] ? params[4] : "B1",
          }],
        };
      }
      return { rows: [] };
    },
    release() {
      calls.push(["release"]);
    },
  };
  const finishBattle = createBattleFinishService({
    pool: {
      async connect() {
        calls.push(["connect"]);
        return client;
      },
      async query(sql, params) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        calls.push(["query", normalized, params]);
        if (/SELECT profile_picture FROM users/.test(normalized)) {
          if (params[0] === profileErrorForUser) throw new Error("profile failed");
          return { rows: [{ profile_picture: params[0] === 1 ? "ali.png" : "vali.png" }] };
        }
        return { rows: [] };
      },
    },
    battleRatingService: {
      async prepareRatedBattle({ battle: current, participants, rewardsEligible }) {
        calls.push(["prepareRating", current.mode, current.battleType, rewardsEligible]);
        const rated = current.mode === "ranked"
          && current.battleType === "1v1"
          && current.questions.length >= 10
          && participants.every((participant) => participant.userId)
          && rewardsEligible;
        if (!rated) return { rated: false, players: [] };
        return {
          rated: true,
          players: participants.map((participant, index) => {
            const ratingBefore = index === 0 ? 990 : 1200;
            const ratingDelta = participant.outcome === "win"
              ? 20
              : (participant.outcome === "lose" ? -20 : 0);
            return {
              userId: participant.userId,
              ratingBefore,
              opponentRatingBefore: index === 0 ? 1200 : 990,
              ratingDelta,
              ratingAfter: ratingBefore + ratingDelta,
              cefrBefore: index === 0 ? "A2" : "B1",
              cefrAfter: "B1",
              algorithmVersion: "elo-cefr-v1",
            };
          }),
        };
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
    [8, 2, true, 1010, "B1", 1],
    [2, 2, true, 1180, "B1", 2],
  ]);
  assert.match(updates[0][1], /win_streak = win_streak \+ 1/);
  assert.match(updates[1][1], /win_streak = 0/);

  const histories = harness.calls.filter((call) => call[0] === "query" && call[1].startsWith("INSERT INTO battle_history"));
  assert.deepEqual(histories.map((call) => call[2]), [
    [1, "Vali", 2, 3, 1, "win", 8, 20, "B1", "ranked", 10, "room_1", true, 990, 1010, 1200, "elo-cefr-v1"],
    [2, "Ali", 1, 1, 3, "lose", 2, -20, "B1", "ranked", 10, "room_1", true, 1200, 1180, 990, "elo-cefr-v1"],
  ]);
  assert.deepEqual(
    harness.calls.filter((call) => call[0] === "query" && ["BEGIN", "COMMIT", "ROLLBACK"].includes(call[1])).map((call) => call[1]),
    ["BEGIN", "COMMIT"]
  );
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
    total: 10,
    lengthKey: "quick",
    mode: "ranked",
    xp_earned: 8,
    coins_earned: 2,
    rewards: { xp: 8, coins: 2, ratingChange: 20 },
    rating_change: 20,
    rating_progression: {
      rated: true,
      rating_before: 990,
      rating_after: 1010,
      rating_change: 20,
      cefr_before: "A2",
      cefr_after: "B1",
    },
    updated_user: { id: 1, rating: 1010, cefr_level: "B1" },
    answers: [{ questionId: 1 }],
    league_change: { old: "Bronze", new: "Silver", promoted: true },
    opponent_picture: "vali.png",
  });
  assert.equal(emissions[1][3].outcome, "lose");
  assert.deepEqual(emissions[1][3].rating_progression, {
    rated: true,
    rating_before: 1200,
    rating_after: 1180,
    rating_change: -20,
    cefr_before: "B1",
    cefr_after: "B1",
  });
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
  assert.equal(payloads[0].rating_progression, null);
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
  assert.deepEqual(updates.map((call) => call[2]), [
    [4, 2, true, 990, "B1", 1],
    [4, 2, true, 1200, "B1", 2],
  ]);
  assert.deepEqual(harness.calls.filter((call) => call[0] === "schoolPoints"), [
    ["schoolPoints", 1, 5, "ranked_draw"],
    ["schoolPoints", 2, 5, "ranked_draw"],
  ]);
  assert.ok(harness.calls.filter((call) => call[0] === "emit").every((call) => call[3].outcome === "draw"));
});

test("does not reward a ranked battle abandoned by both players", async () => {
  const currentBattle = battle({
    players: {
      a: { userId: 1, name: "Ali", score: 2, disconnected: true },
      b: { userId: 2, name: "Vali", score: 2, disconnected: true },
    },
  });
  const harness = createHarness({ currentBattle });

  await harness.finishBattle("room_1");

  const updates = harness.calls.filter(
    (call) => call[0] === "query" && call[1].startsWith("UPDATE users SET")
  );
  assert.deepEqual(updates.map((call) => call[2]), [
    [0, 0, false, null, null, 1],
    [0, 0, false, null, null, 2],
  ]);
  assert.equal(harness.calls.some((call) => call[0] === "schoolPoints"), false);

  const payloads = harness.calls
    .filter((call) => call[0] === "emit")
    .map((call) => call[3]);
  assert.ok(payloads.every((payload) => payload.outcome === "draw"));
  assert.ok(payloads.every((payload) => payload.xp_earned === 0));
  assert.ok(payloads.every((payload) => payload.coins_earned === 0));
  assert.ok(payloads.every((payload) => payload.rating_change === 0));
  assert.ok(payloads.every((payload) => payload.rating_progression === null));
});

test("rolls back both players together and preserves profile/session boundaries", async () => {
  const transactionFailure = createHarness({ resultErrorForUser: 1 });
  await assert.rejects(() => transactionFailure.finishBattle("room_1"), { message: "rating failed" });
  assert.deepEqual(
    transactionFailure.calls.filter((call) => call[0] === "query" && ["BEGIN", "COMMIT", "ROLLBACK"].includes(call[1])).map((call) => call[1]),
    ["BEGIN", "ROLLBACK"]
  );
  assert.equal(transactionFailure.calls.some((call) => call[0] === "emit"), false);
  assert.ok(transactionFailure.battles.room_1);

  const fallback = createHarness({ profileErrorForUser: 2 });
  await fallback.finishBattle("room_1");
  const aliResult = fallback.calls.find((call) => call[0] === "emit" && call[1] === "a");
  assert.equal(aliResult[3].opponent_picture, null);

  const sessionFailure = createHarness({ finishSessionError: new Error("finish failed") });
  await assert.rejects(() => sessionFailure.finishBattle("room_1"), { message: "finish failed" });
  assert.ok(sessionFailure.battles.room_1);
  assert.deepEqual(sessionFailure.userToRoom, { 1: "room_1", 2: "room_1", 99: "other_room" });
  assert.deepEqual(sessionFailure.recentlyFinished, {});
  assert.equal(sessionFailure.timers.length, 0);
});
