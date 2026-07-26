function createSchoolTournamentStudentsController({ pool, getSchoolAdmin, logger = console }) {
  async function list(req, res) {
    try {
      const schoolAdmin = await getSchoolAdmin(req.user.id);
      if (!schoolAdmin.ok) {
        return res.status(403).json({ error: schoolAdmin.error });
      }
      const admin = schoolAdmin.user;

      const result = await pool.query(
        `SELECT id, first_name, last_name, rating, cefr_level, profile_picture
       FROM users
       WHERE region = $1 AND district = $2 AND school = $3
         AND (role = 'student' OR role IS NULL) AND (is_banned IS NULL OR is_banned = false)
       ORDER BY rating DESC, first_name ASC`,
        [admin.region, admin.district, admin.school]
      );
      return res.json({ students: result.rows });
    } catch (error) {
      logger.error("Maktab o'quvchilari xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { list };
}

module.exports = { createSchoolTournamentStudentsController };
