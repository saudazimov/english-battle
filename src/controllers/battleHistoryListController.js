function createBattleHistoryListController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        const userId = req.params.userId;
        const result = await pool.query(
          `SELECT bh.opponent_name, bh.my_score, bh.opponent_score, bh.outcome,
                  bh.xp_earned, bh.rating_change, bh.played_at, bh.cefr_level,
                  bh.opponent_id, bh.mode,
                  opp.profile_picture AS opponent_picture,
                  opp.rating AS opponent_rating
           FROM battle_history bh
           LEFT JOIN users opp ON opp.id = bh.opponent_id
           WHERE bh.user_id = $1
           ORDER BY bh.played_at DESC
           LIMIT 50`,
          [userId]
        );
        res.json({ history: result.rows });
      } catch (error) {
        logger.error("Tarix xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createBattleHistoryListController };
