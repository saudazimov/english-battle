function createRegionRankingsController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const result = await pool.query(
        `SELECT
         region,
         COUNT(*) AS player_count,
         SUM(rating) AS total_rating,
         ROUND(AVG(rating)) AS avg_rating
       FROM users
       WHERE region IS NOT NULL AND region <> ''
       GROUP BY region
       ORDER BY total_rating DESC
       LIMIT 50`
      );
      return res.json({ regions: result.rows });
    } catch (error) {
      logger.error("Viloyat reytingi xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createRegionRankingsController };
