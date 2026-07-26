function createTeacherSettingsProfileUpdateController({ pool, sanitizeText, logger = console }) {
  async function updateProfile(req, res) {
    try {
      const firstName = sanitizeText(req.body.first_name || "", 100);
      const lastName = sanitizeText(req.body.last_name || "", 100);
      const email = String(req.body.email || "").trim().toLowerCase() || null;
      const bio = sanitizeText(req.body.bio || "", 500) || null;
      const subject = sanitizeText(req.body.teaching_subject || "English", 80) || "English";
      if (firstName.length < 2 || lastName.length < 2) {
        return res.status(400).json({ error: "Ism va familiya kamida 2 belgidan iborat bo'lsin" });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Email formati noto'g'ri" });
      }
      const result = await pool.query(
        `UPDATE users SET first_name=$1, last_name=$2, email=$3, bio=$4, teaching_subject=$5
       WHERE id=$6
       RETURNING id, first_name, last_name, phone, email, bio, teaching_subject, profile_picture, created_at`,
        [firstName, lastName, email, bio, subject, req.user.id]
      );
      return res.json({ message: "Profil saqlandi", profile: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Bu email boshqa hisobda ishlatilgan" });
      }
      logger.error("Teacher profile update xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { updateProfile };
}

module.exports = { createTeacherSettingsProfileUpdateController };
