const INITIAL_RATING = 500;
const RATING_FLOOR = 0;

const CEFR_LEVELS = Object.freeze([
  Object.freeze({ name: "A1", min: 0, max: 599, promotionAnswers: 60, promotionAccuracy: 65 }),
  Object.freeze({ name: "A2", min: 600, max: 899, demotionBelow: 550, promotionAnswers: 80, promotionAccuracy: 68 }),
  Object.freeze({ name: "B1", min: 900, max: 1199, demotionBelow: 850, promotionAnswers: 100, promotionAccuracy: 70 }),
  Object.freeze({ name: "B2", min: 1200, max: 1499, demotionBelow: 1150, promotionAnswers: 120, promotionAccuracy: 72 }),
  Object.freeze({ name: "C1", min: 1500, max: 1799, demotionBelow: 1450, promotionAnswers: 150, promotionAccuracy: 75 }),
  Object.freeze({ name: "C2", min: 1800, max: Infinity, demotionBelow: 1750 }),
]);

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeRating(value) {
  return Math.max(RATING_FLOOR, Math.round(safeNumber(value, INITIAL_RATING)));
}

function levelIndex(level) {
  return CEFR_LEVELS.findIndex((entry) => entry.name === level);
}

function getLevelForRating(rating) {
  const normalized = normalizeRating(rating);
  return CEFR_LEVELS.find((level) => normalized >= level.min && normalized <= level.max).name;
}

function getCefrProgression({ rating, currentLevel }) {
  const normalizedRating = normalizeRating(rating);
  const currentIndex = levelIndex(currentLevel);
  const level = currentIndex >= 0
    ? CEFR_LEVELS[currentIndex]
    : CEFR_LEVELS.find((entry) => normalizedRating >= entry.min && normalizedRating <= entry.max);
  const nextLevel = CEFR_LEVELS[CEFR_LEVELS.indexOf(level) + 1] || null;
  const highestLevel = nextLevel === null;
  const range = highestLevel ? null : nextLevel.min - level.min;
  const progressPercent = highestLevel
    ? 100
    : Math.max(0, Math.min(100, Math.round(((normalizedRating - level.min) / range) * 100)));

  return {
    current_level: level.name,
    rating: normalizedRating,
    band_min: level.min,
    band_max: Number.isFinite(level.max) ? level.max : null,
    next_level: nextLevel ? nextLevel.name : null,
    target_rating: nextLevel ? nextLevel.min : null,
    remaining_rating: nextLevel ? Math.max(0, nextLevel.min - normalizedRating) : 0,
    progress_percent: progressPercent,
    rating_threshold_reached: nextLevel ? normalizedRating >= nextLevel.min : true,
    highest_level: highestLevel,
  };
}

function getKFactor({ rating, ratedGames }) {
  const games = Math.max(0, Math.floor(safeNumber(ratedGames)));
  if (games < 10) return 40;
  if (games < 50) return 28;
  if (normalizeRating(rating) >= 1600) return 16;
  return 20;
}

function getQuestionMultiplier(questionCount) {
  const count = Math.max(0, Math.floor(safeNumber(questionCount)));
  if (count < 10) return 0;
  if (count < 15) return 0.75;
  if (count < 20) return 0.9;
  return 1;
}

function isRatedBattle({ mode, battleType, opponentIsBot, questionCount, rewardsEligible = true }) {
  return mode === "ranked"
    && battleType === "1v1"
    && opponentIsBot !== true
    && rewardsEligible === true
    && getQuestionMultiplier(questionCount) > 0;
}

function resultScore(result) {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  if (result === "lose") return 0;
  return null;
}

function calculateRatingChange({ playerRating, opponentRating, result, ratedGames, questionCount }) {
  const score = resultScore(result);
  if (score === null) throw new TypeError("Noto'g'ri jang natijasi");

  const player = normalizeRating(playerRating);
  const opponent = normalizeRating(opponentRating);
  const expected = 1 / (1 + (10 ** ((opponent - player) / 400)));
  const kFactor = getKFactor({ rating: player, ratedGames });
  const questionMultiplier = getQuestionMultiplier(questionCount);
  const delta = Math.round(kFactor * (score - expected) * questionMultiplier);

  return {
    delta,
    newRating: Math.max(RATING_FLOOR, player + delta),
    expected,
    kFactor,
    questionMultiplier,
  };
}

function getPromotionStatus({ rating, currentLevel, correctAnswers, totalAnswers }) {
  const index = levelIndex(currentLevel);
  if (index < 0) throw new TypeError("Noto'g'ri CEFR daraja");
  if (index === CEFR_LEVELS.length - 1) {
    return { eligible: false, highestLevel: true, currentLevel, nextLevel: null };
  }

  const level = CEFR_LEVELS[index];
  const nextLevel = CEFR_LEVELS[index + 1];
  const total = Math.max(0, Math.floor(safeNumber(totalAnswers)));
  const correct = Math.min(total, Math.max(0, Math.floor(safeNumber(correctAnswers))));
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const rpReady = normalizeRating(rating) >= nextLevel.min;
  const sampleReady = total >= level.promotionAnswers;
  const accuracyReady = accuracy >= level.promotionAccuracy;

  return {
    eligible: rpReady && sampleReady && accuracyReady,
    highestLevel: false,
    currentLevel,
    nextLevel: nextLevel.name,
    accuracy,
    answers: total,
    requiredRating: nextLevel.min,
    requiredAnswers: level.promotionAnswers,
    requiredAccuracy: level.promotionAccuracy,
    rpReady,
    sampleReady,
    accuracyReady,
  };
}

function resolveCefrLevel({ rating, currentLevel, correctAnswers, totalAnswers }) {
  const index = levelIndex(currentLevel);
  if (index < 0) return getLevelForRating(rating);

  const level = CEFR_LEVELS[index];
  if (index > 0 && normalizeRating(rating) < level.demotionBelow) {
    return CEFR_LEVELS[index - 1].name;
  }

  const promotion = getPromotionStatus({
    rating,
    currentLevel,
    correctAnswers,
    totalAnswers,
  });
  return promotion.eligible ? promotion.nextLevel : currentLevel;
}

module.exports = {
  CEFR_LEVELS,
  INITIAL_RATING,
  RATING_FLOOR,
  calculateRatingChange,
  getCefrProgression,
  getKFactor,
  getLevelForRating,
  getPromotionStatus,
  getQuestionMultiplier,
  isRatedBattle,
  normalizeRating,
  resolveCefrLevel,
};
