function createAdminSettingsInfoController({ pool, logger = console }) {
  async function info(req, res) {
    try {
      const passwordResult = await pool.query(
        "SELECT updated_at FROM admin_settings WHERE setting_key = 'admin_password_hash'"
      );
      const passwordSource = passwordResult.rows.length > 0 ? "database" : "env";
      const passwordUpdated = passwordResult.rows.length > 0
        ? passwordResult.rows[0].updated_at
        : null;
      const counts = await Promise.all([
        pool.query("SELECT COUNT(*) AS c FROM users"),
        pool.query("SELECT COUNT(*) AS c FROM questions"),
        pool.query("SELECT COUNT(*) AS c FROM audit_logs"),
      ]);

      return res.json({
        passwordSource,
        passwordUpdated,
        totalUsers: parseInt(counts[0].rows[0].c),
        totalQuestions: parseInt(counts[1].rows[0].c),
        totalAuditLogs: parseInt(counts[2].rows[0].c),
      });
    } catch (error) {
      logger.error("Settings info xatosi:", error.message);
      return res.status(500).json({ error: "Server xatosi" });
    }
  }

  return { info };
}

module.exports = { createAdminSettingsInfoController };
