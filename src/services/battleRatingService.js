"use strict";

const {
  CEFR_LEVELS,
  INITIAL_RATING,
  calculateRatingChange,
  getLevelForRating,
  isRatedBattle,
  normalizeRating,
  resolveCefrLevel,
} = require("../utils/ratingProgression");

const DEFAULT_ALGORITHM_VERSION = "elo-cefr-v1";
const MAX_ROLLING_ANSWERS = Math.max(
  ...CEFR_LEVELS.map((level) => level.promotionAnswers || 0)
);

function positiveUserId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function questionCount(battle) {
  if (Array.isArray(battle && battle.questions)) return battle.questions.length;
  const count = Number(battle && battle.questionCount);
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function currentAnswerResults(participant, totalQuestions) {
  if (Array.isArray(participant.answers)) {
    return participant.answers.map((answer) => (
      typeof answer === "boolean" ? answer : Boolean(answer && answer.is_correct)
    ));
  }
  const total = Math.max(0, Math.min(totalQuestions, Number(participant.totalAnswers) || 0));
  const correct = Math.max(0, Math.min(total, Number(participant.correctAnswers) || 0));
  return Array(correct).fill(true).concat(Array(total - correct).fill(false));
}

function promotionSample(levelName, currentAnswers, historicalAnswers) {
  const level = CEFR_LEVELS.find((entry) => entry.name === levelName);
  const limit = level && level.promotionAnswers ? level.promotionAnswers : 0;
  if (limit === 0) return { correctAnswers: 0, totalAnswers: 0 };
  const sample = currentAnswers.concat(historicalAnswers).slice(0, limit);
  return {
    correctAnswers: sample.filter(Boolean).length,
    totalAnswers: sample.length,
  };
}

async function loadPlayerSnapshots(client, userIds) {
  const result = await client.query(
    `SELECT id, rating, cefr_level
     FROM users
     WHERE id = ANY($1::int[])
     ORDER BY id
     FOR UPDATE`,
    [userIds]
  );
  if (result.rows.length !== userIds.length) {
    throw new Error("Reyting hisoblash uchun o'yinchi topilmadi");
  }
  return new Map(result.rows.map((row) => [Number(row.id), row]));
}

async function loadRatedGameCounts(client, userIds) {
  const result = await client.query(
    `SELECT user_id, COUNT(*)::int AS rated_games
     FROM battle_history
     WHERE user_id = ANY($1::int[]) AND is_rated = true
     GROUP BY user_id`,
    [userIds]
  );
  return new Map(result.rows.map((row) => [Number(row.user_id), Number(row.rated_games)]));
}

async function loadHistoricalAnswers(client, userIds) {
  const result = await client.query(
    `WITH recent_answers AS (
       SELECT sae.student_id, sae.is_correct,
              ROW_NUMBER() OVER (
                PARTITION BY sae.student_id
                ORDER BY sae.answered_at DESC, sae.id DESC
              ) AS answer_rank
       FROM student_answer_events sae
       WHERE sae.student_id = ANY($1::int[])
         AND sae.source_mode = 'battle'
         AND EXISTS (
           SELECT 1
           FROM battle_history bh
           WHERE bh.user_id = sae.student_id
             AND bh.room_id = sae.source_record_id
             AND bh.is_rated = true
         )
     )
     SELECT student_id, is_correct, answer_rank
     FROM recent_answers
     WHERE answer_rank <= $2
     ORDER BY student_id, answer_rank`,
    [userIds, MAX_ROLLING_ANSWERS]
  );
  const answers = new Map(userIds.map((userId) => [userId, []]));
  for (const row of result.rows) answers.get(Number(row.student_id)).push(Boolean(row.is_correct));
  return answers;
}

function buildPlayerResult({ participant, opponent, snapshot, opponentSnapshot, games, history, total, version }) {
  const ratingBefore = normalizeRating(snapshot.rating ?? INITIAL_RATING);
  const opponentRatingBefore = normalizeRating(opponentSnapshot.rating ?? INITIAL_RATING);
  const currentLevel = snapshot.cefr_level || getLevelForRating(ratingBefore);
  const rating = calculateRatingChange({
    playerRating: ratingBefore,
    opponentRating: opponentRatingBefore,
    result: participant.outcome,
    ratedGames: games,
    questionCount: total,
  });
  const sample = promotionSample(
    currentLevel,
    currentAnswerResults(participant, total),
    history
  );
  return {
    userId: positiveUserId(participant.userId),
    opponentId: positiveUserId(opponent.userId),
    outcome: participant.outcome,
    ratedGamesBefore: games,
    ratingBefore,
    opponentRatingBefore,
    ratingDelta: rating.delta,
    ratingAfter: rating.newRating,
    cefrBefore: currentLevel,
    cefrAfter: resolveCefrLevel({ rating: rating.newRating, currentLevel, ...sample }),
    rollingCorrectAnswers: sample.correctAnswers,
    rollingTotalAnswers: sample.totalAnswers,
    algorithmVersion: version,
  };
}

function createBattleRatingService({ algorithmVersion = DEFAULT_ALGORITHM_VERSION } = {}) {
  async function prepareRatedBattle({ client, battle, participants, rewardsEligible = true }) {
    if (!client || typeof client.query !== "function") throw new TypeError("Database client majburiy");
    if (!Array.isArray(participants) || participants.length !== 2) {
      throw new TypeError("Reyting uchun aynan ikki o'yinchi kerak");
    }
    const userIds = participants.map((participant) => positiveUserId(participant.userId));
    const total = questionCount(battle);
    const rated = userIds.every(Boolean) && isRatedBattle({
      mode: battle && battle.mode,
      battleType: battle && battle.battleType,
      opponentIsBot: false,
      questionCount: total,
      rewardsEligible,
    });
    if (!rated) return { rated: false, algorithmVersion, players: [] };

    const snapshots = await loadPlayerSnapshots(client, userIds);
    const gameCounts = await loadRatedGameCounts(client, userIds);
    const historicalAnswers = await loadHistoricalAnswers(client, userIds);
    const players = participants.map((participant, index) => {
      const opponent = participants[index === 0 ? 1 : 0];
      const userId = userIds[index];
      const opponentId = userIds[index === 0 ? 1 : 0];
      return buildPlayerResult({
        participant,
        opponent,
        snapshot: snapshots.get(userId),
        opponentSnapshot: snapshots.get(opponentId),
        games: gameCounts.get(userId) || 0,
        history: historicalAnswers.get(userId) || [],
        total,
        version: algorithmVersion,
      });
    });
    return { rated: true, algorithmVersion, players };
  }

  return { prepareRatedBattle };
}

module.exports = {
  DEFAULT_ALGORITHM_VERSION,
  MAX_ROLLING_ANSWERS,
  createBattleRatingService,
};
