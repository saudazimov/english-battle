// Jang natijasiga qarab topshiriq progressini yangilash
function createDailyQuestProgressService({ pool, getOrCreateDailyQuests, logger }) {
  return async function updateQuestProgress(userId, { won, correctAnswers, xpEarned }) {
    try {
      const quests = await getOrCreateDailyQuests(userId);

      for (const quest of quests) {
        if (quest.is_completed) continue;

        let increment = 0;
        if (quest.quest_type === "play_battles") increment = 1;
        else if (quest.quest_type === "win_battles") increment = won ? 1 : 0;
        else if (quest.quest_type === "correct_answers") increment = correctAnswers;
        else if (quest.quest_type === "earn_xp") increment = xpEarned;

        if (increment > 0) {
          const newProgress = quest.progress + increment;
          const completed = newProgress >= quest.target;

          await pool.query(
            `UPDATE user_quests
           SET progress = $1, is_completed = $2
           WHERE id = $3`,
            [Math.min(newProgress, quest.target), completed, quest.id]
          );
        }
      }
    } catch (error) {
      logger.error("Quest progress xatosi:", error.message);
    }
  };
}

module.exports = { createDailyQuestProgressService };
