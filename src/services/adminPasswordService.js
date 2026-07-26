// Admin parolni tekshirish (yordamchi)
// AVVAL bazadagi hashlangan parolni tekshiradi (admin o'zgartirgan bo'lsa).
// Agar bazada parol yo'q bo'lsa — eski usul (_env). Shunda login hech qachon buzilmaydi.
function createAdminPasswordService({ pool, bcrypt, environment, logger }) {
  return async function checkAdminPassword(password) {
    if (!password) return false;
    try {
      const result = await pool.query(
        "SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password_hash'"
      );
      if (result.rows.length > 0 && result.rows[0].setting_value) {
        // Bazada hashlangan parol bor — bcrypt bilan solishtiramiz
        return await bcrypt.compare(password, result.rows[0].setting_value);
      }
    } catch (error) {
      logger.error("Admin parol tekshirish (baza) xatosi:", error.message);
    }
    // Bazada yo'q — eski usul (_env)
    return password === environment.ADMIN_PASSWORD;
  };
}

module.exports = { createAdminPasswordService };
