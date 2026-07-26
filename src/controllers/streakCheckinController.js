function createStreakCheckinController({
  pool,
  now = () => new Date(),
  logger = console,
}) {
  return {
    async checkin(req, res) {
      try {
        const userId = req.user.id;
        const userResult = await pool.query(
          "SELECT current_streak, longest_streak, last_active_date FROM users WHERE id = $1",
          [userId]
        );

        if (userResult.rows.length === 0) {
          return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
        }

        const user = userResult.rows[0];
        const today = now();
        today.setHours(0, 0, 0, 0);

        let currentStreak = user.current_streak || 0;
        let longestStreak = user.longest_streak || 0;
        const lastActive = user.last_active_date
          ? new Date(user.last_active_date)
          : null;

        if (lastActive) {
          lastActive.setHours(0, 0, 0, 0);
          const diffDays = Math.round(
            (today - lastActive) / (1000 * 60 * 60 * 24)
          );

          if (diffDays === 0) {
            return res.json({
              current_streak: currentStreak,
              longest_streak: longestStreak,
              already_checked: true,
            });
          } else if (diffDays === 1) {
            currentStreak++;
          } else {
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }

        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }

        await pool.query(
          `UPDATE users
           SET current_streak = $1, longest_streak = $2, last_active_date = CURRENT_DATE
           WHERE id = $3`,
          [currentStreak, longestStreak, userId]
        );

        res.json({
          current_streak: currentStreak,
          longest_streak: longestStreak,
          already_checked: false,
        });
      } catch (error) {
        logger.error("Streak xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createStreakCheckinController };
