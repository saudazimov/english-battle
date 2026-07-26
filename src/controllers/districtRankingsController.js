function createDistrictRankingsController({ pool, logger = console }) {
  async function list(req, res) {
    try {
      const result = await pool.query(
        `SELECT district, region,
              COUNT(*) as player_count,
              SUM(rating) as total_rating,
              ROUND(AVG(rating)) as avg_rating
       FROM users
       WHERE district IS NOT NULL AND district != ''
       GROUP BY district, region
       ORDER BY total_rating DESC`
      );
      return res.json({ districts: result.rows });
    } catch (error) {
      logger.error("Tuman reyting xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createDistrictRankingsController };
