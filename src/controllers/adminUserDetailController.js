function createAdminUserDetailController({ pool, logger = console }) {
  return {
    async getById(req, res) {
      try {
        var id = parseInt(req.params.id);
        if (!id) return res.status(400).json({ error: "Noto'g'ri ID" });

        var userResult = await pool.query(
          `SELECT id, first_name, last_name, role, cefr_level, rating, xp, coins,
                  current_streak, longest_streak, win_streak, best_win_streak,
                  region, district, village, school, phone, birth_date,
                  profile_picture, is_banned, created_at
           FROM users WHERE id = $1`,
          [id]
        );
        if (userResult.rows.length === 0) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }

        var battleResult = await pool.query(
          "SELECT COUNT(*) AS c FROM battle_history WHERE user_id = $1",
          [id]
        );
        var winResult = await pool.query(
          "SELECT COUNT(*) AS c FROM battle_history WHERE user_id = $1 AND outcome = 'win'",
          [id]
        );

        var user = userResult.rows[0];
        user.total_battles = parseInt(battleResult.rows[0].c);
        user.total_wins = parseInt(winResult.rows[0].c);

        res.json({ user: user });
      } catch (error) {
        logger.error("Foydalanuvchi ma'lumoti xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminUserDetailController };
