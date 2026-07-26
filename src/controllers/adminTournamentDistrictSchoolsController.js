function createAdminTournamentDistrictSchoolsController({ pool, logger = console }) {
  return {
    async list(req, res) {
      try {
        const region = (req.query.region || "").trim();
        const district = (req.query.district || "").trim();
        if (!region || !district) {
          return res.status(400).json({ error: "Viloyat va tuman kerak" });
        }

        const result = await pool.query(
          `SELECT school,
                  COUNT(*) AS student_count,
                  ROUND(AVG(rating)) AS avg_rating
           FROM users
           WHERE region = $1 AND district = $2
             AND school IS NOT NULL AND school <> ''
             AND (role = 'student' OR role IS NULL)
           GROUP BY school
           ORDER BY avg_rating DESC, student_count DESC`,
          [region, district]
        );
        res.json({
          region,
          district,
          school_count: result.rows.length,
          schools: result.rows.map((row) => ({
            school: row.school,
            student_count: parseInt(row.student_count),
            avg_rating: parseInt(row.avg_rating) || 1000,
          })),
        });
      } catch (error) {
        logger.error("Tumandagi maktablar xatosi:", error.message);
        res.status(500).json({ error: "Server xatosi" });
      }
    },
  };
}

module.exports = { createAdminTournamentDistrictSchoolsController };
