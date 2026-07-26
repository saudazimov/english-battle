// Raqib kartasi uchun: rating + win rate olish (matchmaking overlay'da ko'rsatish uchun)
function createOpponentCardService({ pool }) {
  return async function getOpponentCardInfo(userId) {
    if (!userId) return { rating: 1000, win_rate: 0 };
    try {
      const ratingResult = await pool.query(
        "SELECT rating FROM users WHERE id = $1",
        [userId]
      );
      const rating = ratingResult.rows[0] ? ratingResult.rows[0].rating : 1000;

      const statsResult = await pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE outcome = 'win') AS wins
         FROM battle_history WHERE user_id = $1`,
        [userId]
      );
      const total = parseInt(statsResult.rows[0].total) || 0;
      const wins = parseInt(statsResult.rows[0].wins) || 0;
      const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

      return { rating: rating, win_rate: winRate };
    } catch (error) {
      return { rating: 1000, win_rate: 0 };
    }
  };
}

module.exports = { createOpponentCardService };
