function createAdminLogoutController({ pool, logAudit }) {
  return {
    async logout(req, res) {
      await logAudit(req, "admin_logout", { details: "Admin tizimdan chiqdi" });
      await pool.query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('admin_auth_version', '1', NOW())
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = ((COALESCE(admin_settings.setting_value, '0'))::int + 1)::text,
               updated_at = NOW()`
      );
      res.json({ message: "Chiqildi" });
    },
  };
}

module.exports = { createAdminLogoutController };
