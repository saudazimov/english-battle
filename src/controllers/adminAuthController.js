function createAdminLoginHandler({
  checkAdminPassword,
  adminTotpValid,
  recordFailedLogin,
  clearLoginAttempts,
  pool,
  signAdminToken,
  logAudit,
  logger,
}) {
  return async function loginAdmin(req, res) {
    try {
      const { password, totp } = req.body;
      const passOk = await checkAdminPassword(password);
      const totpOk = adminTotpValid(totp);
      if (!passOk || !totpOk) {
        recordFailedLogin(req);
        await logAudit(req, "admin_login_failed", {
          details: "Noto'g'ri admin kirish urinishi",
        });
        return res
          .status(401)
          .json({ error: "Parol yoki 2FA kod noto'g'ri" });
      }
      clearLoginAttempts(req);
      const versionResult = await pool.query(
        "SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_auth_version'"
      );
      const adminAuthVersion = versionResult.rows.length
        ? Number(versionResult.rows[0].setting_value) || 0
        : 0;
      const token = signAdminToken("Admin", adminAuthVersion);
      req.admin = { name: "Admin" };
      await logAudit(req, "admin_login_success", {
        details: "Admin tizimga kirdi",
      });
      res.json({ token, admin: { name: "Admin", role: "super_admin" } });
    } catch (error) {
      logger.error("Admin login xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createAdminPasswordChangeHandler({
  validatePassword,
  checkAdminPassword,
  bcrypt,
  pool,
  logAudit,
  logger,
}) {
  return async function changeAdminPassword(req, res) {
    try {
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) {
        return res.status(400).json({ error: "Joriy va yangi parol kerak" });
      }
      const newPassCheck = validatePassword(new_password);
      if (!newPassCheck.valid) {
        return res.status(400).json({ error: newPassCheck.error });
      }
      const currentOk = await checkAdminPassword(current_password);
      if (!currentOk) {
        await logAudit(req, "admin_password_change_failed", {
          details: "Joriy parol noto'g'ri",
        });
        return res.status(401).json({ error: "Joriy parol noto'g'ri" });
      }
      const hashed = await bcrypt.hash(new_password, 10);
      await pool.query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('admin_password_hash', $1, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1, updated_at = NOW()`,
        [hashed]
      );
      await pool.query(
        `INSERT INTO admin_settings (setting_key, setting_value, updated_at)
         VALUES ('admin_auth_version', '1', NOW())
         ON CONFLICT (setting_key) DO UPDATE
           SET setting_value = ((COALESCE(admin_settings.setting_value, '0'))::int + 1)::text,
               updated_at = NOW()`
      );
      await logAudit(req, "admin_password_changed", {
        details: "Admin parol o'zgartirildi",
      });
      res.json({ message: "Parol muvaffaqiyatli o'zgartirildi" });
    } catch (error) {
      logger.error("Parol o'zgartirish xatosi:", error.message);
      res.status(500).json({ error: "Server xatosi" });
    }
  };
}

function createAdminAuthController(dependencies) {
  const shared = { ...dependencies, logger: dependencies.logger || console };
  return {
    login: createAdminLoginHandler(shared),
    changePassword: createAdminPasswordChangeHandler(shared),
  };
}

module.exports = { createAdminAuthController };
