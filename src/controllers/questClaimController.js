function createQuestClaimController({ pool, logger = console }) {
  return {
    async claim(req, res) {
      const client = await pool.connect();
      try {
        const userId = req.user.id;
        const { userQuestId } = req.body;
        if (!userQuestId) {
          return res.status(400).json({ error: "userQuestId kerak" });
        }

        await client.query("BEGIN");
        const result = await client.query(
          `SELECT uq.is_completed, uq.reward_claimed, q.xp_reward
           FROM user_quests uq
           JOIN quests q ON uq.quest_id = q.id
           WHERE uq.id = $1 AND uq.user_id = $2
           FOR UPDATE OF uq`,
          [userQuestId, userId]
        );

        if (result.rows.length === 0) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Topshiriq topilmadi" });
        }

        const quest = result.rows[0];
        if (!quest.is_completed) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Topshiriq hali bajarilmagan" });
        }
        if (quest.reward_claimed) {
          await client.query("ROLLBACK");
          return res.status(400).json({ error: "Mukofot allaqachon olingan" });
        }

        await client.query(
          "UPDATE user_quests SET reward_claimed = true WHERE id = $1",
          [userQuestId]
        );

        const updated = await client.query(
          `UPDATE users SET xp = xp + $1 WHERE id = $2
           RETURNING id, first_name, last_name, username, cefr_level, xp, rating, coins`,
          [quest.xp_reward, userId]
        );
        await client.query("COMMIT");

        res.json({
          message: "Mukofot olindi!",
          xp_reward: quest.xp_reward,
          updated_user: updated.rows[0],
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error("Mukofot xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      } finally {
        client.release();
      }
    },
  };
}

module.exports = { createQuestClaimController };
