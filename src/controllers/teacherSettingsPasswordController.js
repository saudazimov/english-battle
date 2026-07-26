function createTeacherSettingsPasswordController({
  pool,
  bcrypt,
  validatePassword,
  logger = console,
}) {
  async function updatePassword(req, res) {
    try {
      const currentPassword = String(req.body.current_password || "");
      const newPassword = String(req.body.new_password || "");
      const check = validatePassword(newPassword);
      if (!currentPassword || !check.valid) {
        return res.status(400).json({ error: check.error || "Joriy parol kerak" });
      }
      const result = await pool.query("SELECT password FROM users WHERE id = $1", [req.user.id]);
      if (!result.rows[0] || !(await bcrypt.compare(currentPassword, result.rows[0].password))) {
        return res.status(401).json({ error: "Joriy parol noto'g'ri" });
      }
      const hashed = await bcrypt.hash(newPassword, 10);
      await pool.query(
        "UPDATE users SET password=$1, auth_version=auth_version+1 WHERE id=$2",
        [hashed, req.user.id]
      );
      return res.json({ message: "Parol yangilandi. Qaytadan kiring.", relogin: true });
    } catch (error) {
      logger.error("Teacher password update xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { updatePassword };
}

module.exports = { createTeacherSettingsPasswordController };
