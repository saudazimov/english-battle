"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_ALGORITHM_VERSION,
  MAX_ROLLING_ANSWERS,
  createBattleRatingService,
} = require("../src/services/battleRatingService");

function createClient({ users = [], counts = [], answers = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
      if (sql.includes("FROM users")) return { rows: users };
      if (sql.includes("COUNT(*)::int AS rated_games")) return { rows: counts };
      if (sql.includes("WITH recent_answers")) return { rows: answers };
      throw new Error("Unexpected query");
    },
  };
}

function rankedBattle(questionTotal = 20) {
  return {
    mode: "ranked",
    battleType: "1v1",
    questions: Array.from({ length: questionTotal }, (_, index) => ({ id: index + 1 })),
  };
}

test("unrated battles return without touching the database", async () => {
  const client = createClient();
  const service = createBattleRatingService();
  const result = await service.prepareRatedBattle({
    client,
    battle: { ...rankedBattle(5) },
    participants: [
      { userId: 1, outcome: "win" },
      { userId: 2, outcome: "lose" },
    ],
  });
  assert.equal(result.rated, false);
  assert.deepEqual(result.players, []);
  assert.equal(client.calls.length, 0);
});

test("both outcomes use the same locked pre-match rating snapshot", async () => {
  const client = createClient({
    users: [
      { id: 1, rating: 1000, cefr_level: "B1" },
      { id: 2, rating: 1200, cefr_level: "B2" },
    ],
    counts: [
      { user_id: 1, rated_games: 20 },
      { user_id: 2, rated_games: 20 },
    ],
  });
  const service = createBattleRatingService();
  const result = await service.prepareRatedBattle({
    client,
    battle: rankedBattle(),
    participants: [
      { userId: 1, outcome: "win", correctAnswers: 12, totalAnswers: 20 },
      { userId: 2, outcome: "lose", correctAnswers: 8, totalAnswers: 20 },
    ],
  });

  assert.equal(result.rated, true);
  assert.equal(result.algorithmVersion, DEFAULT_ALGORITHM_VERSION);
  assert.deepEqual(
    result.players.map((player) => [player.ratingBefore, player.opponentRatingBefore]),
    [[1000, 1200], [1200, 1000]]
  );
  assert.deepEqual(result.players.map((player) => player.ratingDelta), [21, -21]);
  assert.match(client.calls[0].sql, /ORDER BY id FOR UPDATE$/);
  assert.deepEqual(client.calls[0].params, [[1, 2]]);
});

test("current answers are placed before history in the rolling promotion sample", async () => {
  const historical = [];
  for (let index = 0; index < 50; index += 1) {
    historical.push({ student_id: 1, is_correct: index < 29, answer_rank: index + 1 });
  }
  const client = createClient({
    users: [
      { id: 1, rating: 590, cefr_level: "A1" },
      { id: 2, rating: 590, cefr_level: "A1" },
    ],
    counts: [
      { user_id: 1, rated_games: 20 },
      { user_id: 2, rated_games: 20 },
    ],
    answers: historical,
  });
  const service = createBattleRatingService();
  const result = await service.prepareRatedBattle({
    client,
    battle: rankedBattle(),
    participants: [
      { userId: 1, outcome: "win", correctAnswers: 10, totalAnswers: 10 },
      { userId: 2, outcome: "lose", correctAnswers: 0, totalAnswers: 10 },
    ],
  });
  const winner = result.players[0];
  assert.equal(winner.ratingAfter, 604);
  assert.equal(winner.rollingCorrectAnswers, 39);
  assert.equal(winner.rollingTotalAnswers, 60);
  assert.equal(winner.cefrBefore, "A1");
  assert.equal(winner.cefrAfter, "A2");
  assert.deepEqual(client.calls[2].params, [[1, 2], MAX_ROLLING_ANSWERS]);
});

test("an abandoned otherwise valid match is not rated", async () => {
  const client = createClient();
  const service = createBattleRatingService();
  const result = await service.prepareRatedBattle({
    client,
    battle: rankedBattle(),
    participants: [
      { userId: 1, outcome: "draw" },
      { userId: 2, outcome: "draw" },
    ],
    rewardsEligible: false,
  });
  assert.equal(result.rated, false);
  assert.equal(client.calls.length, 0);
});

test("missing player snapshots fail instead of producing partial rating data", async () => {
  const client = createClient({ users: [{ id: 1, rating: 500, cefr_level: "A1" }] });
  const service = createBattleRatingService();
  await assert.rejects(
    service.prepareRatedBattle({
      client,
      battle: rankedBattle(),
      participants: [
        { userId: 1, outcome: "win" },
        { userId: 2, outcome: "lose" },
      ],
    }),
    /o'yinchi topilmadi/
  );
  assert.equal(client.calls.length, 1);
});
