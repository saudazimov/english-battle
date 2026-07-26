function createSchoolOverviewController({ pool, getSchoolAdmin, logger = console }) {
  async function getOverview(req, res) {
    try {
      const schoolAdmin = await getSchoolAdmin(req.user.id);
      if (!schoolAdmin.ok) {
        return res.status(403).json({ error: schoolAdmin.error });
      }
      const admin = schoolAdmin.user;

      const statsResult = await pool.query(
        `SELECT COUNT(*) AS total,
              ROUND(AVG(rating)) AS avg_rating,
              MAX(rating) AS top_rating
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)`,
        [admin.region, admin.district, admin.school]
      );
      const stats = statsResult.rows[0];

      const topStudentsResult = await pool.query(
        `SELECT id, first_name, last_name, rating, cefr_level, profile_picture
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)
       ORDER BY rating DESC LIMIT 5`,
        [admin.region, admin.district, admin.school]
      );

      const tournamentsResult = await pool.query(
        `SELECT COUNT(*) AS c FROM tournaments t
       WHERE t.status IN ('registration','bracket','live')
         AND (
           (t.level = 'district' AND t.scope_value = $1 AND t.region = $2)
           OR (t.level = 'region' AND t.scope_value = $2)
           OR (t.level = 'country')
         )`,
        [admin.district, admin.region]
      );

      return res.json({
        admin: { first_name: admin.first_name, last_name: admin.last_name },
        school: admin.school,
        region: admin.region,
        district: admin.district,
        stats: {
          total_students: parseInt(stats.total) || 0,
          avg_rating: parseInt(stats.avg_rating) || 0,
          top_rating: parseInt(stats.top_rating) || 0,
          active_tournaments: parseInt(tournamentsResult.rows[0].c) || 0,
        },
        top_students: topStudentsResult.rows,
      });
    } catch (error) {
      logger.error("School overview xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getOverview };
}

module.exports = { createSchoolOverviewController };
