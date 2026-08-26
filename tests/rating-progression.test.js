const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CEFR_LEVELS,
  INITIAL_RATING,
  calculateRatingChange,
  getCefrProgression,
  getKFactor,
  getLevelForRating,
  getPromotionStatus,
  getQuestionMultiplier,
  isRatedBattle,
  normalizeRating,
  resolveCefrLevel,
} = require("../src/utils/ratingProgression");

test("defines the approved RP-to-CEFR bands and A1 starting rating", () => {
  assert.equal(INITIAL_RATING, 500);
  assert.deepEqual(
    CEFR_LEVELS.map(({ name, min, max }) => [name, min, max]),
    [
      ["A1", 0, 599],
      ["A2", 600, 899],
      ["B1", 900, 1199],
      ["B2", 1200, 1499],
      ["C1", 1500, 1799],
      ["C2", 1800, Infinity],
    ]
  );
  assert.equal(getLevelForRating(599), "A1");
  assert.equal(getLevelForRating(600), "A2");
  assert.equal(getLevelForRating(1800), "C2");
  assert.equal(normalizeRating(-50), 0);
});

test("builds API-ready CEFR progress metadata from the shared bands", () => {
  assert.deepEqual(getCefrProgression({ rating: 750, currentLevel: "A2" }), {
    current_level: "A2",
    rating: 750,
    band_min: 600,
    band_max: 899,
    next_level: "B1",
    target_rating: 900,
    remaining_rating: 150,
    progress_percent: 50,
    rating_threshold_reached: false,
    highest_level: false,
  });
  assert.equal(getCefrProgression({ rating: 1900, currentLevel: "C2" }).highest_level, true);
  assert.equal(getCefrProgression({ rating: 960, currentLevel: "A1" }).progress_percent, 100);
});

test("uses provisional, developing, established and advanced K factors", () => {
  assert.equal(getKFactor({ rating: 500, ratedGames: 9 }), 40);
  assert.equal(getKFactor({ rating: 1000, ratedGames: 10 }), 28);
  assert.equal(getKFactor({ rating: 1000, ratedGames: 50 }), 20);
  assert.equal(getKFactor({ rating: 1600, ratedGames: 50 }), 16);
});

test("weights rated battles by their question count", () => {
  assert.equal(getQuestionMultiplier(5), 0);
  assert.equal(getQuestionMultiplier(10), 0.75);
  assert.equal(getQuestionMultiplier(15), 0.9);
  assert.equal(getQuestionMultiplier(20), 1);
});

test("only completed human 1v1 ranked battles with at least ten questions are rated", () => {
  const valid = { mode: "ranked", battleType: "1v1", opponentIsBot: false, questionCount: 20 };
  assert.equal(isRatedBattle(valid), true);
  assert.equal(isRatedBattle({ ...valid, mode: "casual" }), false);
  assert.equal(isRatedBattle({ ...valid, opponentIsBot: true }), false);
  assert.equal(isRatedBattle({ ...valid, battleType: "team" }), false);
  assert.equal(isRatedBattle({ ...valid, questionCount: 5 }), false);
  assert.equal(isRatedBattle({ ...valid, rewardsEligible: false }), false);
});

test("adaptive Elo rewards an upset more than an expected win", () => {
  const equalWin = calculateRatingChange({
    playerRating: 1000,
    opponentRating: 1000,
    result: "win",
    ratedGames: 20,
    questionCount: 20,
  });
  const upsetWin = calculateRatingChange({
    playerRating: 1000,
    opponentRating: 1200,
    result: "win",
    ratedGames: 20,
    questionCount: 20,
  });
  const expectedLoss = calculateRatingChange({
    playerRating: 1000,
    opponentRating: 1200,
    result: "lose",
    ratedGames: 20,
    questionCount: 20,
  });

  assert.equal(equalWin.delta, 14);
  assert.equal(upsetWin.delta, 21);
  assert.equal(expectedLoss.delta, -7);
  assert.ok(upsetWin.expected < equalWin.expected);
});

test("rating never falls below zero and invalid outcomes are rejected", () => {
  const result = calculateRatingChange({
    playerRating: 1,
    opponentRating: 1,
    result: "lose",
    ratedGames: 60,
    questionCount: 20,
  });
  assert.equal(result.newRating, 0);
  assert.throws(
    () => calculateRatingChange({ playerRating: 500, opponentRating: 500, result: "skip", ratedGames: 0, questionCount: 20 }),
    /Noto'g'ri jang natijasi/
  );
});

test("promotion requires RP, rolling answer volume and accuracy without an exam", () => {
  const blocked = getPromotionStatus({
    rating: 610,
    currentLevel: "A1",
    correctAnswers: 38,
    totalAnswers: 60,
  });
  assert.equal(blocked.rpReady, true);
  assert.equal(blocked.sampleReady, true);
  assert.equal(blocked.accuracyReady, false);
  assert.equal(blocked.eligible, false);

  const ready = getPromotionStatus({
    rating: 610,
    currentLevel: "A1",
    correctAnswers: 39,
    totalAnswers: 60,
  });
  assert.equal(ready.accuracy, 65);
  assert.equal(ready.eligible, true);
  assert.equal(resolveCefrLevel({
    rating: 610,
    currentLevel: "A1",
    correctAnswers: 39,
    totalAnswers: 60,
  }), "A2");
});

test("demotion uses a 50 RP protection zone and changes one level at a time", () => {
  assert.equal(resolveCefrLevel({ rating: 550, currentLevel: "A2" }), "A2");
  assert.equal(resolveCefrLevel({ rating: 549, currentLevel: "A2" }), "A1");
  assert.equal(resolveCefrLevel({ rating: 500, currentLevel: "B2" }), "B1");
});

test("C2 is the highest level", () => {
  const status = getPromotionStatus({ rating: 2500, currentLevel: "C2" });
  assert.equal(status.highestLevel, true);
  assert.equal(status.nextLevel, null);
  assert.equal(resolveCefrLevel({ rating: 1800, currentLevel: "C2" }), "C2");
});
