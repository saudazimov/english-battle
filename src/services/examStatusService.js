function createExamStatusService({ pool, getNextLevel }) {
  async function getStatus(userId) {
    const userResult = await pool.query(
      "SELECT cefr_level FROM users WHERE id = $1",
      [userId]
    );
    if (userResult.rows.length === 0) return null;

    const currentLevel = userResult.rows[0].cefr_level;
    const nextLevel = getNextLevel(currentLevel);
    if (!nextLevel) {
      return {
        eligible: false,
        current_level: currentLevel,
        next_level: null,
        reason: "Siz eng yuqori darajadasiz!",
      };
    }

    const statsResult = await pool.query(
      `SELECT
         COUNT(*) AS battles,
         COALESCE(SUM(my_score), 0) AS total_correct,
         COALESCE(SUM(total_questions), 0) AS total_questions
       FROM battle_history
       WHERE user_id = $1 AND cefr_level = $2 AND mode IN ('ranked','casual')`,
      [userId, currentLevel]
    );

    const battles = parseInt(statsResult.rows[0].battles);
    const totalCorrect = parseInt(statsResult.rows[0].total_correct);
    const totalQuestions = parseInt(statsResult.rows[0].total_questions);
    const accuracy = totalQuestions > 0
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;
    const minimumBattles = 10;
    const minimumAccuracy = 70;

    return {
      eligible: battles >= minimumBattles && accuracy >= minimumAccuracy,
      current_level: currentLevel,
      next_level: nextLevel,
      progress: {
        battles,
        battles_required: minimumBattles,
        accuracy,
        accuracy_required: minimumAccuracy,
      },
    };
  }

  return { getStatus };
}

module.exports = { createExamStatusService };
