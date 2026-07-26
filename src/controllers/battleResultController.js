function createBattleResultController({ pool, logger = console }) {
  return {
    async getResult(req, res) {
      try {
        const userId = req.user.id;
        const roomId = req.params.roomId;

        const bh = await pool.query(
          `SELECT bh.opponent_name, bh.opponent_id, bh.my_score, bh.opponent_score, bh.outcome,
                  bh.xp_earned, bh.rating_change, bh.cefr_level, bh.mode,
                  bh.total_questions, bh.played_at,
                  opp.profile_picture AS opponent_picture,
                  opp.rating AS opponent_rating,
                  me.profile_picture AS my_picture
           FROM battle_history bh
           LEFT JOIN users opp ON opp.id = bh.opponent_id
           LEFT JOIN users me ON me.id = bh.user_id
           WHERE bh.room_id = $1 AND bh.user_id = $2
           LIMIT 1`,
          [roomId, userId]
        );

        if (bh.rows.length === 0) {
          return res.status(404).json({ error: "Natija topilmadi" });
        }
        const result = bh.rows[0];

        const ans = await pool.query(
          `SELECT ba.question_id, ba.q_order, ba.selected_option AS your_answer,
                  ba.correct_option AS correct_answer, ba.is_correct,
                  q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.explanation
           FROM battle_answers ba
           JOIN questions q ON q.id = ba.question_id
           WHERE ba.room_id = $1 AND ba.user_id = $2
           ORDER BY ba.q_order ASC`,
          [roomId, userId]
        );

        res.json({
          result: result,
          answers: ans.rows,
        });
      } catch (error) {
        logger.error("Natija olish xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createBattleResultController };
