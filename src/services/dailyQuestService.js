const DAILY_QUESTS_SQL = `SELECT uq.id, uq.quest_id, uq.progress, uq.is_completed, uq.reward_claimed,
            q.quest_type, q.target, q.xp_reward, q.title, q.description
     FROM user_quests uq
     JOIN quests q ON uq.quest_id = q.id
     WHERE uq.user_id = $1 AND uq.quest_date = CURRENT_DATE`;

// O'yinchining bugungi topshiriqlarini olish (yo'q bo'lsa — yaratish)
function createDailyQuestService({ pool }) {
  return async function getOrCreateDailyQuests(userId) {
    // Bugungi topshiriqlar bormi?
    const existing = await pool.query(DAILY_QUESTS_SQL, [userId]);

    if (existing.rows.length > 0) {
      return existing.rows;
    }

    // Yo'q — bugun uchun yangi topshiriqlar yaratamiz (3 tasini tasodifiy)
    const allQuests = await pool.query(
      "SELECT id FROM quests WHERE is_active = true ORDER BY RANDOM() LIMIT 3"
    );

    for (const quest of allQuests.rows) {
      await pool.query(
        `INSERT INTO user_quests (user_id, quest_id, quest_date)
       VALUES ($1, $2, CURRENT_DATE)
       ON CONFLICT (user_id, quest_id, quest_date) DO NOTHING`,
        [userId, quest.id]
      );
    }

    // Yangi yaratilganlarni qaytarish
    const created = await pool.query(DAILY_QUESTS_SQL, [userId]);
    return created.rows;
  };
}

module.exports = { createDailyQuestService };
