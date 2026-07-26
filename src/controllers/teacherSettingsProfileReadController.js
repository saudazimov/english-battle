function createTeacherSettingsProfileReadController({ pool, logger = console }) {
  async function getProfile(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, first_name, last_name, phone, email, bio, teaching_subject,
              profile_picture, created_at
       FROM users WHERE id = $1`,
        [req.user.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      }
      return res.json({ profile: result.rows[0] });
    } catch (error) {
      logger.error("Teacher settings profile xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { getProfile };
}

module.exports = { createTeacherSettingsProfileReadController };
