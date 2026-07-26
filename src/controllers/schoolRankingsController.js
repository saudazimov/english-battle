function createSchoolRankingsController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const result = await pool.query(
        `SELECT
         school,
         region,
         district,
         COUNT(*) AS player_count,
         SUM(rating) AS total_rating,
         ROUND(AVG(rating)) AS avg_rating
       FROM users
       WHERE school IS NOT NULL AND school <> ''
       GROUP BY school, region, district
       ORDER BY total_rating DESC
       LIMIT 50`
      );

      return res.json({ schools: result.rows });
    } catch (error) {
      logger.error("Maktab reytingi xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createSchoolRankingsController };
